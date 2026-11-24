// MMIsleCraft: crafting for the biome isles (slice X2). Pure data + functions: no DOM, no RNG, no timers, no currency, no network.
// UMD: browser global MMIsleCraft, or require(). Needs MMCreatures (saddle ids, drop tables) and MMBiomePacks (resources, forage finds).
// Inventory = { itemId: count } (the archipelago save's additive `inv` key). canCraft/craft never mutate: craft returns a new frozen inventory.
// XD1 (NEXT-SLICES-3): alternative recipes that make the same item (`item`), the mars fix (rocket_core_drift, o2_tank_kelp), recipes for
// every drop no recipe used, a pure island reachability walk (reachability()) and the validate() rule that an island's unlock item
// never needs an input found only on that island.
// TD1 (NEXT-SLICES-4): additive rare items (aurora_shard from the tundra's aurora frostfox tame and the aurora night glints, chrome_flake
// from the mars chrome rustbeetle tame and the wreck salvage glints; EXTRA_SOURCES) and two decor recipes that use them (aurora_lamp,
// chrome_beacon). The o2 tank notes say what it gives (+30 s air). Nothing else changes: every old recipe, source and wave stays.
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./mm-creatures.js'), require('./mm-biome-packs.js'));
  else root.MMIsleCraft = factory(root.MMCreatures, root.MMBiomePacks);
}(typeof self !== 'undefined' ? self : this, function (C, P) {
  'use strict';
  const MAX_STACKS = 64, MAX_COUNT = 999;
  const own = Object.prototype.hasOwnProperty;
  const KEY_RE = /^[a-z][a-z0-9_]{0,23}$/;
  const BAD = ['__proto__', 'constructor', 'prototype'];

  // id -> { in: {item: n}, out: 1, note, item?, use?, trophy? }. Inputs are pack resources, forage finds or drop-table items (validate()
  // proves each has 2+ sources). `item` (XD1) is the inventory id the recipe makes when it is not the recipe id itself (an alternative
  // recipe for the same thing); `use` is a short tag for what the page does with it; `trophy:true` marks a boss keepsake whose input
  // is that boss's unique drop (one source by design; validate() allows it).
  const R = (inp, note, extra) => Object.assign({ in: inp, out: 1, note: note }, extra || {});
  const RECIPES = {
    saddle_tusktop: R({ hide: 2, vine_rope: 2, amber: 1 }, 'jungle mount'),
    saddle_stegolith: R({ hide: 3, vine_rope: 2, wood: 2 }, 'jungle mount'),
    saddle_tyrant: R({ hide: 3, amber: 3, vine_rope: 2 }, 'jungle boss mount'),
    saddle_shagtusk: R({ hide: 2, frost_crystal: 1, wood: 2 }, 'tundra mount'),
    saddle_sabrefang: R({ hide: 3, ice: 2, frost_crystal: 1 }, 'tundra mount'),
    saddle_tidesteed: R({ shell: 3, kelp: 3, pearl: 1 }, 'reef swim mount'),
    saddle_skimray: R({ shell: 2, pearl: 2, kelp: 2 }, 'reef swim mount'),
    saddle_strider: R({ hide: 2, iron: 3, oxide_dust: 2 }, 'mars mount'),
    saddle_grazer: R({ hide: 2, iron: 2, meteor_glass: 1 }, 'mars flying mount'),
    saddle_titan: R({ hide: 3, iron: 4, meteor_glass: 2 }, 'mars boss mount'),
    feast: R({ raw_meat: 3, jungle_berry: 2 }, 'boss-tame food'),
    sleepy_herb: R({ fiber: 2, jungle_berry: 2 }, 'torpor food'),
    raft: R({ wood: 4, vine_rope: 2 }, 'unlocks the reef'),
    // the iron build stays (a spare core once you are on mars); rocket_core_drift below is the way there from a fresh save
    rocket_core: R({ iron: 4, frost_crystal: 2, amber: 2 }, 'unlocks mars (iron build)'),
    warm_cloak: R({ hide: 3, fiber: 3 }, 'tundra cold protection'),
    o2_tank: R({ iron: 3, kelp: 2, oxide_dust: 1 }, '+30 s air on mars'),
    // ---- XD1: the mars fix (each makes the same inventory item as the recipe it stands in for) ----
    rocket_core_drift: R({ driftwood: 3, frost_crystal: 2, amber: 2, pearl: 1 }, 'unlocks mars (reef, tundra and jungle finds)', { item: 'rocket_core' }),
    o2_tank_kelp: R({ kelp: 3, shell: 2, ice: 2 }, '+30 s air on mars (a kelp-sealed tank)', { item: 'o2_tank' }),
    // ---- XD1: cozy and useful uses for drops no recipe used before ----
    heat_pack: R({ spring_salt: 1, fiber: 2 }, 'extra warmth on the tundra', { use: 'warmth' }),
    glow_lamp: R({ glow_gel: 1, shell: 2 }, 'a soft light for home', { use: 'light' }),
    bone_charm: R({ bone: 1, feather: 2 }, '+1 tame trust', { use: 'trust' }),
    honey_cake: R({ honey: 1, apple: 1, wool: 1 }, 'a taming treat for small and medium creatures', { use: 'treat' }),
    sea_salt_snack: R({ salt: 1, cocoa: 1 }, 'a salty cocoa snack', { use: 'snack' }),
    stone_bench: R({ stone: 3, wood: 2 }, 'a bench for home', { use: 'decor' }),
    berry_jam: R({ frostberry: 2, jungle_berry: 2 }, 'a jar of mixed berry jam', { use: 'snack' }),
    signal_beacon: R({ data_chip: 1, ice_core: 1, meteor_glass: 1 }, 'a mars waypoint', { use: 'waypoint' }),
    trophy_tyrant: R({ tyrant_scale: 1, amber: 3 }, 'home decor: the Fernjaw Tyrant', { use: 'decor', trophy: true }),
    trophy_hydra: R({ rift_stone: 1, pearl: 3 }, 'home decor: the Tide Hydra', { use: 'decor', trophy: true }),
    trophy_dragon: R({ frost_heart: 1, frost_crystal: 3 }, 'home decor: the Frost Dragon', { use: 'decor', trophy: true }),
    // MMCreatures gives the Red Titan (mars_boss) no unique drop, so its trophy is a big haul of what it does drop
    trophy_titan: R({ meteor_glass: 4, iron: 5 }, 'home decor: the Red Titan', { use: 'decor', trophy: true }),
    // ---- TD1: decor from the tundra / mars rares (each input also has a calm second source: a night glint or wreck salvage) ----
    aurora_lamp: R({ aurora_shard: 2, frost_crystal: 1 }, 'home decor: a lamp that glows like the aurora', { use: 'decor' }),
    chrome_beacon: R({ chrome_flake: 2, iron: 1 }, 'home decor: a shiny chrome beacon', { use: 'decor' }),
  };
  (function freezeAll(o) { Object.freeze(o); Object.keys(o).forEach((k) => { if (o[k] && typeof o[k] === 'object') freezeAll(o[k]); }); })(RECIPES);
  // ALL_IDS: every recipe. IDS: the 16 X2 recipes the isles craft panel lists today (games/isles/isles.js renders CRAFT.IDS); the page
  // switches its panel to ALL_IDS when it wires the XD1 recipes (XW1), so this slice changes nothing on the page by itself.
  const ALL_IDS = Object.freeze(Object.keys(RECIPES));
  const IDS = Object.freeze(ALL_IDS.slice(0, ALL_IDS.indexOf('o2_tank') + 1));

  // ---- IF1 (NEXT-SLICES-4): food glints. Page-side walk-over nodes the isles page places on a seeded walkable tile of the listed terrain
  // (`near` = within `r` tiles of the island's dock or spawn point; `zone` = that pack band only). They are the source of every creature
  // diet item no pack resource or drop table gives (fish, flower, hay, nectar, sea_melon, greenhouse_potato, golden_apple, bug) and a
  // labelled vine rope patch by the jungle dock (the raft input). Pure data: MMOverworld never reads it, so every world hash is unchanged.
  // pack id -> [{ id, n, terrain[], near?, r?, zone?, respawn (s), label? }]
  const N = (id, n, terrain, extra) => Object.assign({ id: id, n: n, terrain: terrain, respawn: 240 }, extra || {});
  const FOOD_NODES = {
    meadow: [N('flower', 4, ['flower_meadow', 'grass']), N('hay', 4, ['tall_grass']), N('nectar', 3, ['flower_meadow', 'clover_patch']),
      N('bug', 4, ['tall_grass', 'grass'], { near: 'spawn', r: 30 }), N('fish', 3, ['wet_sand', 'sand', 'dock_planks'], { near: 'dock', r: 8 }),
      N('golden_apple', 6, ['grass'], { zone: [2, 3], respawn: 120 })], // b05-05/b05-r3: Oakback needs 14 (Strider 11): was 1 glint per 900 s, then 4 per 300 s (~15 min); now 6 per 120 s (~6 min, cyc5-d-oakback-pace)
    jungle: [N('vine_rope', 3, ['fern_thicket', 'jungle_moss', 'jungle_floor', 'sand'], { near: 'dock', r: 15, respawn: 150, label: 'vine rope' }),
      N('nectar', 3, ['orchid_moss', 'jungle_moss']), N('bug', 4, ['jungle_floor'])],
    reef: [N('fish', 5, ['shell_beach', 'reef_sand'], { near: 'spawn', r: 40 }), N('sea_melon', 3, ['sandbar', 'seagrass'], { zone: [2] })],
    tundra: [N('fish', 5, ['ice_sheet', 'packed_snow', 'tundra_moss'], { near: 'spawn', r: 40 }), N('fish', 3, ['ice_sheet', 'packed_snow', 'slush'], { near: 'dock', r: 8 }),
      N('frostberry', 14, ['tundra_moss', 'snow', 'powder_snow'], { zone: [1, 2, 3], respawn: 150 })],
    mars: [N('greenhouse_potato', 4, ['habitat_floor'])],
  };
  (function freezeAll(o) { Object.freeze(o); Object.keys(o).forEach((k) => { if (o[k] && typeof o[k] === 'object') freezeAll(o[k]); }); })(FOOD_NODES);
  // TD1: item sources that live on the isles page, not in a pack or drop table: 'rare:<pack>' (the drop when you tame that island's rare
  // variant, never on a kill) and 'glint:<pack>' (the page's once-a-day glints: aurora crystals at night on the tundra, wreck salvage on mars)
  const EXTRA_SOURCES = Object.freeze({ aurora_shard: Object.freeze(['rare:tundra', 'glint:tundra']), chrome_flake: Object.freeze(['rare:mars', 'glint:mars']) });
  const foodNodes = (packId) => { const k = P && P.resolveId ? P.resolveId(packId) : packId; return typeof k === 'string' && own.call(FOOD_NODES, k) ? FOOD_NODES[k] : []; };

  // ---- where each item comes from: pack resources, pack forage finds, food glints and creature drop tables ----
  function sources() {
    const m = {};
    const add = (item, src) => { if (!own.call(m, item)) m[item] = []; if (m[item].indexOf(src) < 0) m[item].push(src); };
    ((P && P.IDS) || []).forEach((pid) => { const p = P.get(pid); ((p && p.resources) || []).forEach((r) => add(r.id, 'pack:' + pid)); });
    Object.keys(FOOD_NODES).forEach((pid) => FOOD_NODES[pid].forEach((r) => add(r.id, 'node:' + pid)));
    ((P && P.IDS) || []).forEach((pid) => { const f = P.finds ? P.finds(pid) : null; ((f && f.items) || []).forEach((r) => add(r[0], 'find:' + pid)); });
    Object.keys((C && C.DROP_TABLES) || {}).forEach((k) => C.DROP_TABLES[k].forEach((row) => add(row[0], 'drop:' + k)));
    Object.keys(EXTRA_SOURCES).forEach((it) => EXTRA_SOURCES[it].forEach((src) => add(it, src)));
    return m;
  }
  const SRC = sources();
  const sourcesOf = (item) => (typeof item === 'string' && own.call(SRC, item) ? SRC[item].slice() : []);
  const known = (id) => typeof id === 'string' && BAD.indexOf(id) < 0 && (own.call(SRC, id) || own.call(RECIPES, id));
  const get = (id) => (typeof id === 'string' && own.call(RECIPES, id) ? RECIPES[id] : null);
  // the inventory id a recipe makes (its `item`, else the recipe id); '' for an unknown recipe
  const outputOf = (id, tbl) => { const t = tbl || RECIPES; if (typeof id !== 'string' || !own.call(t, id)) return ''; return typeof t[id].item === 'string' ? t[id].item : id; };
  // every recipe id that makes `item` (the plain recipe first, then alternatives in table order)
  const recipesFor = (item, tbl) => { const t = tbl || RECIPES; return Object.keys(t).filter((id) => outputOf(id, t) === item); };

  function cleanInv(raw) {
    const out = {};
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return out;
    let n = 0;
    Object.keys(raw).slice(0, 512).forEach((k) => {
      if (n >= MAX_STACKS || !KEY_RE.test(k) || !known(k)) return;
      const v = raw[k];
      if (typeof v !== 'number' || !Number.isInteger(v) || v < 1) return;
      out[k] = Math.min(MAX_COUNT, v); n++;
    });
    return out;
  }
  const count = (inv, id) => (inv && typeof inv === 'object' && own.call(inv, id) && Number.isInteger(inv[id]) && inv[id] > 0 ? inv[id] : 0);

  // -> { ok, missing: [{id, need, have}], reason? }; reason is 'unknown' or 'full' (output stack at 999 / 64 stacks used)
  function canCraft(inv, id) {
    const r = get(id);
    if (!r) return { ok: false, missing: [], reason: 'unknown' };
    const missing = [];
    Object.keys(r.in).forEach((k) => { const have = count(inv, k); if (have < r.in[k]) missing.push({ id: k, need: r.in[k], have: have }); });
    if (missing.length) return { ok: false, missing: missing };
    const ci = cleanInv(inv), item = outputOf(id);
    if (ci[item] >= MAX_COUNT) return { ok: false, missing: [], reason: 'full' };
    if (!own.call(ci, item)) {
      const stacks = Object.keys(ci).filter((k) => ci[k] - (r.in[k] || 0) > 0).length;
      if (stacks >= MAX_STACKS) return { ok: false, missing: [], reason: 'full' };
    }
    return { ok: true, missing: [] };
  }
  // -> new frozen inventory (the input is never touched); an impossible craft returns a frozen clean copy unchanged
  function craft(inv, id) {
    const out = cleanInv(inv);
    if (!canCraft(inv, id).ok) return Object.freeze(out);
    const r = RECIPES[id], item = outputOf(id);
    Object.keys(r.in).forEach((k) => { out[k] -= r.in[k]; if (out[k] <= 0) delete out[k]; });
    out[item] = Math.min(MAX_COUNT, (out[item] || 0) + r.out);
    return Object.freeze(out);
  }

  // ---- XD1: islands, the sources on each one, and the unlock walk ----
  // Mirrors the isles page (games/isles/isles.js OPEN_ISLES / UNLOCK_BY_ITEM): home, jungle and the tundra ('ice') are open on a fresh
  // save; the reef opens with a raft and mars with a rocket core. Pack ids map to isle ids (meadow -> home, tundra -> ice).
  const GATES = Object.freeze({ open: Object.freeze(['home', 'jungle', 'ice']), items: Object.freeze({ reef: 'raft', mars: 'rocket_core' }) });
  const ISLES = Object.freeze(['home', 'jungle', 'ice', 'reef', 'mars']);
  const PACK_ISLE = Object.freeze({ meadow: 'home', jungle: 'jungle', tundra: 'ice', reef: 'reef', mars: 'mars' });
  // drop table -> the isles whose creatures carry it (MMCreatures biome; boss tables sit on their boss's island)
  const TABLE_ISLES = (function () {
    const m = {};
    ((C && C.list && C.list()) || []).forEach((d) => (d.drops || []).forEach((t) => {
      const isle = PACK_ISLE[d.biome]; if (!isle) return;
      if (!own.call(m, t)) m[t] = [];
      if (m[t].indexOf(isle) < 0) m[t].push(isle);
    }));
    return m;
  })();
  // 'pack:reef' / 'find:meadow' / 'drop:frost_loot' -> ['reef'] / ['home'] / ['ice'] ([] for junk)
  function islesOfSource(src) {
    if (typeof src !== 'string') return [];
    const i = src.indexOf(':'), kind = src.slice(0, i), id = src.slice(i + 1);
    if (kind === 'pack' || kind === 'find' || kind === 'node' || kind === 'rare' || kind === 'glint') return own.call(PACK_ISLE, id) ? [PACK_ISLE[id]] : [];
    if (kind === 'drop') return own.call(TABLE_ISLES, id) ? TABLE_ISLES[id].slice() : [];
    return [];
  }
  // every isle an item can be found on (gathered or dropped), in ISLES order; opts.finds === false leaves out forage finds (page wiring XW1)
  const islesOf = (item, opts) => {
    const s = [], nf = !!opts && opts.finds === false;
    sourcesOf(item).forEach((src) => { if (nf && src.indexOf('find:') === 0) return; islesOfSource(src).forEach((x) => { if (s.indexOf(x) < 0) s.push(x); }); });
    return ISLES.filter((x) => s.indexOf(x) >= 0);
  };

  // A fresh-save walk: wave 0 opens GATES.open; each wave, every item found on an open isle is available, every recipe whose inputs are
  // all available (crafted outputs count, to a fixed point) is craftable, and every locked isle whose unlock item is craftable opens in
  // the next wave. -> { ok, order:[isle], wave:{isle:n}, recipes:{id:wave|null}, items:{item:wave}, locked:[isle] }; ok = every isle opens.
  // opts.finds === false walks with gathered nodes and drops only (what the page gives before the forage-find wiring).
  function reachability(recipes, gates, opts) {
    const tbl = recipes || RECIPES, g = gates || GATES;
    const wave = {}, items = {}, rec = {}, order = [];
    (g.open || []).forEach((x) => { wave[x] = 0; order.push(x); });
    Object.keys(tbl).forEach((id) => { rec[id] = null; });
    for (let w = 0; w < 16; w++) {
      Object.keys(SRC).forEach((it) => { if (!own.call(items, it) && islesOf(it, opts).some((x) => own.call(wave, x))) items[it] = w; });
      let grew = true;
      while (grew) {
        grew = false;
        Object.keys(tbl).forEach((id) => {
          if (rec[id] !== null) return;
          if (Object.keys(tbl[id].in).every((k) => own.call(items, k))) { rec[id] = w; grew = true; const out = outputOf(id, tbl); if (!own.call(items, out)) items[out] = w; }
        });
      }
      const opened = [];
      Object.keys(g.items || {}).forEach((x) => { if (!own.call(wave, x) && own.call(items, g.items[x])) opened.push(x); });
      if (!opened.length) break;
      opened.forEach((x) => { wave[x] = w + 1; order.push(x); });
    }
    const locked = ISLES.filter((x) => !own.call(wave, x));
    return { ok: locked.length === 0, order: order, wave: wave, recipes: rec, items: items, locked: locked };
  }

  // cross-check of a recipe table (default: RECIPES): every input needs 2+ sources (a trophy recipe may use its boss's one unique drop);
  // every MMCreatures saddle has a recipe; `item` names a recipe of the table; an island's unlock item has at least one recipe with no
  // input found only on that island; and the fresh-save walk opens every island.
  function validate(recipes) {
    const tbl = recipes || RECIPES;
    const errors = [];
    const saddles = C.list().map((d) => d.ride && d.ride.saddle).filter(Boolean);
    saddles.forEach((s) => { if (!recipesFor(s, tbl).length) errors.push('no recipe for saddle ' + s); });
    Object.keys(tbl).forEach((id) => {
      const r = tbl[id]; const ks = Object.keys(r.in);
      if (/^saddle_/.test(id) && saddles.indexOf(id) < 0) errors.push('recipe ' + id + ' has no creature');
      if (r.item !== undefined && (typeof r.item !== 'string' || r.item === id || !own.call(tbl, r.item) || tbl[r.item].item !== undefined)) errors.push(id + ': item must name a plain recipe of the table');
      if (ks.length < 2 || ks.length > 4) errors.push(id + ': needs 2-4 inputs');
      ks.forEach((k) => {
        const n = sourcesOf(k).length;
        if (n === 0) errors.push(id + ': input ' + k + ' is produced by no pack or drop table');
        else if (n < 2 && r.trophy !== true) errors.push(id + ': input ' + k + ' has only 1 source');
        if (!Number.isInteger(r.in[k]) || r.in[k] < 1 || r.in[k] > 9) errors.push(id + ': bad count for ' + k);
      });
    });
    Object.keys(GATES.items).forEach((isle) => {
      const it = GATES.items[isle], ways = recipesFor(it, tbl);
      if (!ways.length) { errors.push('unlock item ' + it + ' for ' + isle + ' has no recipe'); return; }
      const only = (k) => { const at = islesOf(k); return at.length > 0 && at.every((x) => x === isle); };
      if (ways.every((id) => Object.keys(tbl[id].in).some(only))) {
        ways.forEach((id) => Object.keys(tbl[id].in).filter(only).forEach((k) => errors.push('unlock item ' + it + ' for ' + isle + ' (' + id + ') needs ' + k + ', found only on ' + isle)));
      }
    });
    const reach = reachability(tbl);
    reach.locked.forEach((x) => errors.push('island ' + x + ' never opens from a fresh save'));
    dietGaps(tbl).forEach((f) => errors.push('diet item ' + f + ' has no source (no pack, find, food glint, drop table or recipe)'));
    return { ok: errors.length === 0, errors: errors };
  }

  // IF1: every MMCreatures diet item with no source at all (no pack resource, forage find, food glint, drop table, or a recipe that makes it)
  function dietGaps(recipes) {
    const tbl = recipes || RECIPES, out = [];
    ((C && C.list && C.list()) || []).forEach((d) => (d.diet || []).forEach((f) => {
      if (out.indexOf(f) >= 0 || sourcesOf(f).length || recipesFor(f, tbl).length) return;
      out.push(f);
    }));
    return out.sort();
  }

  // XD1: a daily gather pick's bonus find on a pack's island. u is one MMRng draw in [0, 1) made by the caller (this module has no RNG):
  // u < chance -> an item from the pack's FINDS table by weight, else ''. Junk u or an unknown pack -> ''.
  function bonusFind(packId, u) {
    const f = P && P.finds ? P.finds(packId) : null;
    if (!f || typeof u !== 'number' || !(u >= 0 && u < 1) || u >= f.chance) return '';
    const tot = f.items.reduce((a, r) => a + r[1], 0);
    let x = (u / f.chance) * tot;
    for (let i = 0; i < f.items.length; i++) { x -= f.items[i][1]; if (x < 0) return f.items[i][0]; }
    return f.items[f.items.length - 1][0];
  }

  return Object.freeze({ RECIPES, IDS, ALL_IDS, MAX_STACKS, MAX_COUNT, GATES, ISLES, get, outputOf, recipesFor, sourcesOf, islesOf, islesOfSource, cleanInv,
    canCraft, craft, validate, reachability, bonusFind, FOOD_NODES, foodNodes, dietGaps, EXTRA_SOURCES });
}));
