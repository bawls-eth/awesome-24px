// MMIslePouch (NEXT-SLICES-4 IF1): the taming pouch per island, feeding from the pack, and seeded food-glint / sparkle placement.
// starter(isle) is the jungle pouch plus that island's staple food (rebuilt per visit, as before: the pouch is never saved);
// reserveFor(...) is what feeding from the pack (IsleCreatures.foodFor(def, pouch, inv, reserve)) must leave for a locked travel recipe;
// place(...) puts MMIsleCraft.FOOD_NODES on seeded walkable tiles (MMRng only).
// Pure: no DOM, no storage, no network, no clock. UMD: browser global MMIslePouch, or require().
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./rng.js'), require('./mm-creatures.js'), require('./mm-biome-packs.js'), require('./mm-isle-craft.js'));
  else root.MMIslePouch = factory(root.MMRng, root.MMCreatures, root.MMBiomePacks, root.MMIsleCraft);
}(typeof self !== 'undefined' ? self : this, function (RNG, C, P, X) {
  'use strict';
  const own = Object.prototype.hasOwnProperty;
  const has = (o, k) => !!o && typeof o === 'object' && own.call(o, k);
  const BASE = Object.freeze({ jungle_berry: 12, raw_meat: 12, bug: 8 }); // = IsleCreatures.STARTER_POUCH (the classic pouch)
  // island -> the staple food added to its pouch
  const ADD = Object.freeze({
    home: Object.freeze({ clover: 10, apple: 4 }),
    jungle: Object.freeze({}),
    reef: Object.freeze({ kelp: 10, fish: 10 }),
    ice: Object.freeze({ fish: 10, frostberry: 8 }),
    mars: Object.freeze({ oxide_dust: 10, greenhouse_potato: 6 }),
  });
  const ISLE_OF = Object.freeze({ home: 'home', meadow: 'home', jungle: 'jungle', reef: 'reef', ice: 'ice', tundra: 'ice', mars: 'mars' });
  const PACK_OF = Object.freeze({ home: 'meadow', jungle: 'jungle', reef: 'reef', ice: 'tundra', mars: 'mars' });
  const isleOf = (id) => (typeof id === 'string' && own.call(ISLE_OF, id) ? ISLE_OF[id] : '');
  const MAX = 99;

  // starter(isle, opts) -> a fresh { food: n } pouch. opts.classic (?pouch=classic) -> the old jungle pouch on every island.
  function starter(isle, opts) {
    const out = Object.assign({}, BASE);
    if (opts && opts.classic) return out;
    const add = ADD[isleOf(isle)] || {};
    Object.keys(add).forEach((k) => { out[k] = Math.min(MAX, (out[k] || 0) + add[k]); });
    return out;
  }
  // the island's own staple (first added food), else jungle_berry
  const staple = (isle) => { const a = ADD[isleOf(isle)]; const k = a ? Object.keys(a) : []; return k.length ? k[0] : 'jungle_berry'; };

  // reserveFor(recipeIds, inv): { item: n } that feeding must leave in the pack: for every recipe id given (the page passes the travel
  // recipes of islands that are still locked, and the o2 tank while you have none), each input's count (the largest over the recipes).
  function reserveFor(ids, inv) {
    const out = {};
    if (!X || !Array.isArray(ids)) return out;
    ids.forEach((id) => { const r = X.get(id); if (!r) return; Object.keys(r.in).forEach((k) => { out[k] = Math.max(out[k] || 0, r.in[k]); }); });
    return out;
  }
  // where a food (or a raft input) is found, in plain words for the toast / hint / craft row
  const WHERE = Object.freeze({
    clover: 'clover grows as glints in the clover patches of Hearth Isle',
    apple: 'apples fall in the grass of Hearth Isle and the jungle',
    flower: 'flowers grow as glints in the Hearth Isle meadows',
    hay: 'hay lies in the tall grass of Hearth Isle',
    nectar: 'nectar glints sit in the flower meadows and jungle orchids',
    bug: 'bugs hide in the tall grass and on the jungle floor',
    fish: 'fish glints shine by the docks and on the reef and tundra shores',
    golden_apple: 'a golden apple glints in the far Hearth Isle orchard',
    kelp: 'kelp grows in the reef seagrass',
    frostberry: 'frostberries grow on the tundra moss',
    sea_melon: 'sea melons grow on the reef sandbars',
    greenhouse_potato: 'potatoes grow in the mars domes',
    oxide_dust: 'oxide dust lies on the mars regolith',
    iron: 'iron is in the mars basalt',
    jungle_berry: 'jungle berries grow on the jungle floor',
    raw_meat: 'creatures drop raw meat',
    meteor_glass: 'meteor glass lies in the mars craters',
    vine_rope: 'vine rope grows on the Verdant Jungle ferns by the dock (look for the "vine rope" glints)',
  });
  const where = (id) => (typeof id === 'string' && own.call(WHERE, id) ? WHERE[id] : '');

  // the spawn ids an island's pack can field (every zone, plus its rare) -> their MMCreatures species
  function speciesOn(isle) {
    const pk = P && P.get ? P.get(PACK_OF[isleOf(isle)] || '') : null;
    if (!pk) return [];
    const ids = [];
    Object.keys(pk.creatures || {}).forEach((z) => (pk.creatures[z] || []).forEach((sp) => { if (ids.indexOf(sp) < 0) ids.push(sp); }));
    Object.keys(pk.rare || {}).forEach((sp) => { if (ids.indexOf(sp) < 0) ids.push(sp); });
    const out = [];
    ids.forEach((sp) => { const k = P.canon ? P.canon(sp) : sp; const id = k && C && C.get(k) ? k : (C && C.get(sp) ? sp : ''); if (id && out.indexOf(id) < 0) out.push(id); });
    return out;
  }
  // feedableOn(isle, opts) -> species on that island that are tamed by feeding or calm (no knockout) and eat something in its starter pouch
  function feedableOn(isle, opts) {
    const pz = starter(isle, opts);
    return speciesOn(isle).filter((id) => { const d = C.get(id); return d && d.tame && d.tame.method !== 'knockout' && (d.diet || []).some((f) => pz[f] > 0); });
  }

  // place(world, packId, seed, walkable(tx,ty), names, taken(i)) -> [{ x, y, kind, respawn, label }]: MMIsleCraft.FOOD_NODES on seeded
  // tiles. Candidates are walkable tiles of the listed terrain (inside `zone` / within `r` of the dock or spawn point), scanned in grid
  // order; when none match, any walkable tile that meets the zone / near rule. Each pick is one MMRng draw; tiles never repeat.
  function place(world, packId, seed, walkable, names, taken) {
    const rows = X && X.foodNodes ? X.foodNodes(packId) : [];
    if (!world || !rows.length || typeof walkable !== 'function') return [];
    const W = world.w, H = world.h, rng = RNG.create('isles|food|' + packId + '|' + seed), used = new Set(), out = [];
    const nm = (i) => (names && names[world.terrain[i]]) || '';
    rows.forEach((row) => {
      const anchor = row.near === 'dock' ? world.dock : row.near === 'spawn' ? world.spawnPoint : null;
      if (row.near && !anchor) return;
      const rr = (row.r || 0) * (row.r || 0);
      const okBase = (x, y, i) => (!anchor || (x - anchor.x) * (x - anchor.x) + (y - anchor.y) * (y - anchor.y) <= rr) &&
        (!row.zone || row.zone.indexOf(world.zone[i]) >= 0) && !used.has(i) && !(taken && taken(i)) && walkable(x, y) && nm(i) !== 'dock_planks';
      const x0 = anchor ? Math.max(1, anchor.x - row.r) : 1, x1 = anchor ? Math.min(W - 2, anchor.x + row.r) : W - 2;
      const y0 = anchor ? Math.max(1, anchor.y - row.r) : 1, y1 = anchor ? Math.min(H - 2, anchor.y + row.r) : H - 2;
      let cand = [];
      for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) { const i = y * W + x; if (row.terrain.indexOf(nm(i)) >= 0 && okBase(x, y, i)) cand.push(i); }
      if (!cand.length) for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) { const i = y * W + x; if (okBase(x, y, i)) cand.push(i); }
      for (let k = 0; k < row.n && cand.length; k++) {
        const j = Math.floor(rng.next() * cand.length), i = cand[j];
        cand[j] = cand[cand.length - 1]; cand.pop();
        used.add(i);
        out.push({ x: i % W, y: Math.floor(i / W), kind: row.id, respawn: row.respawn, label: row.label || '' });
      }
    });
    return out;
  }

  // sparkle(isle, u) -> the item a forage sparkle gives (u: one MMRng draw in [0, 1) by the caller): the island staple or a pouch food
  const SPARKLE = Object.freeze({ home: ['clover', 'apple', 'flower', 'hay'], jungle: ['jungle_berry', 'vine_rope', 'nectar', 'bug'], reef: ['kelp', 'fish', 'shell'],
    ice: ['fish', 'frostberry', 'ice'], mars: ['oxide_dust', 'greenhouse_potato', 'iron'] });
  function sparkle(isle, u) {
    const l = SPARKLE[isleOf(isle)] || SPARKLE.jungle;
    const v = typeof u === 'number' && u >= 0 && u < 1 ? u : 0;
    return l[Math.floor(v * l.length)];
  }
  const SPARKLES_PER_DAY = 6, SPARKLE_AFTER = 40, SPARKLE_R = 10;

  return Object.freeze({ BASE, ADD, WHERE, MAX, SPARKLES_PER_DAY, SPARKLE_AFTER, SPARKLE_R, isleOf, starter, staple, reserveFor, where, speciesOn, feedableOn, place, sparkle });
}));
