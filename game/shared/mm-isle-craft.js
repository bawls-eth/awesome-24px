// MMIsleCraft: crafting for the biome isles (slice X2). Pure data + functions: no DOM, no RNG, no timers, no currency, no network.
// UMD: browser global MMIsleCraft, or require(). Needs MMCreatures (saddle ids, drop tables) and MMBiomePacks (resources).
// Inventory = { itemId: count } (the archipelago save's additive `inv` key). canCraft/craft never mutate: craft returns a new frozen inventory.
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./mm-creatures.js'), require('./mm-biome-packs.js'));
  else root.MMIsleCraft = factory(root.MMCreatures, root.MMBiomePacks);
}(typeof self !== 'undefined' ? self : this, function (C, P) {
  'use strict';
  const MAX_STACKS = 64, MAX_COUNT = 999;
  const own = Object.prototype.hasOwnProperty;
  const KEY_RE = /^[a-z][a-z0-9_]{0,23}$/;
  const BAD = ['__proto__', 'constructor', 'prototype'];

  // id -> { in: {item: n}, out: 1, note }. Inputs are pack resources or drop-table items (validate() proves each has 2+ sources).
  const R = (inp, note) => ({ in: inp, out: 1, note });
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
    rocket_core: R({ iron: 4, frost_crystal: 2, amber: 2 }, 'unlocks mars'),
    warm_cloak: R({ hide: 3, fiber: 3 }, 'tundra cold protection'),
    o2_tank: R({ iron: 3, kelp: 2, oxide_dust: 1 }, 'mars air'),
  };
  (function freezeAll(o) { Object.freeze(o); Object.keys(o).forEach((k) => { if (o[k] && typeof o[k] === 'object') freezeAll(o[k]); }); })(RECIPES);
  const IDS = Object.freeze(Object.keys(RECIPES));

  // ---- where each item comes from: pack resources and creature drop tables ----
  function sources() {
    const m = {};
    const add = (item, src) => { if (!own.call(m, item)) m[item] = []; if (m[item].indexOf(src) < 0) m[item].push(src); };
    ((P && P.IDS) || []).forEach((pid) => { const p = P.get(pid); ((p && p.resources) || []).forEach((r) => add(r.id, 'pack:' + pid)); });
    Object.keys((C && C.DROP_TABLES) || {}).forEach((k) => C.DROP_TABLES[k].forEach((row) => add(row[0], 'drop:' + k)));
    return m;
  }
  const SRC = sources();
  const sourcesOf = (item) => (typeof item === 'string' && own.call(SRC, item) ? SRC[item].slice() : []);
  const known = (id) => typeof id === 'string' && BAD.indexOf(id) < 0 && (own.call(SRC, id) || own.call(RECIPES, id));
  const get = (id) => (typeof id === 'string' && own.call(RECIPES, id) ? RECIPES[id] : null);

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
    const ci = cleanInv(inv);
    if (ci[id] >= MAX_COUNT) return { ok: false, missing: [], reason: 'full' };
    if (!own.call(ci, id)) {
      const stacks = Object.keys(ci).filter((k) => ci[k] - (r.in[k] || 0) > 0).length;
      if (stacks >= MAX_STACKS) return { ok: false, missing: [], reason: 'full' };
    }
    return { ok: true, missing: [] };
  }
  // -> new frozen inventory (the input is never touched); an impossible craft returns a frozen clean copy unchanged
  function craft(inv, id) {
    const out = cleanInv(inv);
    if (!canCraft(inv, id).ok) return Object.freeze(out);
    const r = RECIPES[id];
    Object.keys(r.in).forEach((k) => { out[k] -= r.in[k]; if (out[k] <= 0) delete out[k]; });
    out[id] = Math.min(MAX_COUNT, (out[id] || 0) + r.out);
    return Object.freeze(out);
  }

  // cross-check of a recipe table (default: RECIPES): every input needs 2+ sources; every MMCreatures saddle has a recipe
  function validate(recipes) {
    const tbl = recipes || RECIPES;
    const errors = [];
    const saddles = C.list().map((d) => d.ride && d.ride.saddle).filter(Boolean);
    saddles.forEach((s) => { if (!own.call(tbl, s)) errors.push('no recipe for saddle ' + s); });
    Object.keys(tbl).forEach((id) => {
      const r = tbl[id]; const ks = Object.keys(r.in);
      if (/^saddle_/.test(id) && saddles.indexOf(id) < 0) errors.push('recipe ' + id + ' has no creature');
      if (ks.length < 2 || ks.length > 4) errors.push(id + ': needs 2-4 inputs');
      ks.forEach((k) => {
        const n = sourcesOf(k).length;
        if (n === 0) errors.push(id + ': input ' + k + ' is produced by no pack or drop table');
        else if (n < 2) errors.push(id + ': input ' + k + ' has only 1 source');
        if (!Number.isInteger(r.in[k]) || r.in[k] < 1 || r.in[k] > 9) errors.push(id + ': bad count for ' + k);
      });
    });
    return { ok: errors.length === 0, errors: errors };
  }

  return Object.freeze({ RECIPES, IDS, MAX_STACKS, MAX_COUNT, get, sourcesOf, cleanInv, canCraft, craft, validate });
}));
