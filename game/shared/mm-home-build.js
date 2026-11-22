// MMHomeBuild: the simple build / decorate upgrade for Hearth Isle (NEXT-SLICES-2 X7, BIOME-ARCH-PLAN B10). Decor for the 20x20
// homestead grid (MMHomestead kinds: flower bed, lantern, bench, fence, bird bath, tame pen) is CRAFTED from the archipelago crafting
// pack (`inv`, MMIsleCraft-style recipes {in:{item:n}, out:1}) into the decor stock (save.home.inv), then placed / picked up on the
// grid through MMHomestead (undo within 10 s). It counts what you made in the additive key save.home.made {kind:n} (<= 999 each).
// LOCAL ONLY: it never uses the Town building code, the Town 'blocks' ref, Firebase or the network, and never touches
// `pixeltown-save-v1`. Pure: no DOM, no storage, no clock, no randomness of its own (the starter layout is seeded in MMHomestead).
// UMD: browser global MMHomeBuild (needs MMHomestead), or require().
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./mm-homestead.js'));
  else root.MMHomeBuild = factory(root.MMHomestead);
}(typeof self !== 'undefined' ? self : this, function (HS) {
  'use strict';
  const MAX_MADE = 999;            // lifetime craft count per kind
  const MAX_STOCK = 99;            // decor stock per kind (matches MMHomestead MAX_INV)
  const MAX_INV = 999, MAX_STACKS = 64; // the crafting pack caps (match MMIsleCraft)
  const KEY_RE = /^[a-z][a-z0-9_]{0,23}$/;
  const BAD = ['__proto__', 'constructor', 'prototype'];
  const own = (o, k) => !!o && typeof o === 'object' && Object.prototype.hasOwnProperty.call(o, k);
  const isObj = (v) => !!v && typeof v === 'object' && !Array.isArray(v);

  // kind -> { in, out, note }. Inputs are meadow / jungle resources and common drops, so a home visit plus a little gathering covers them.
  const R = (inp, note) => ({ in: inp, out: 1, note: note });
  const RECIPES = {
    flowerbed: R({ clover: 2, fiber: 1 }, 'a splash of colour'),
    lantern: R({ wood: 1, stone: 2 }, 'a warm light'),
    bench: R({ wood: 3, fiber: 1 }, 'a place to sit'),
    fence: R({ wood: 2, fiber: 1 }, 'edges a garden or a pen'),
    birdbath: R({ stone: 3, clover: 1 }, 'birds stop by'),
    pen: R({ wood: 4, fiber: 2, stone: 1 }, 'rests up to 3 benched tames'),
  };
  (function freezeAll(o) { Object.freeze(o); Object.keys(o).forEach((k) => { if (o[k] && typeof o[k] === 'object') freezeAll(o[k]); }); })(RECIPES);
  const IDS = Object.freeze(Object.keys(RECIPES).filter((k) => own(HS.KINDS, k)));
  const get = (kind) => (typeof kind === 'string' && own(RECIPES, kind) && own(HS.KINDS, kind) ? RECIPES[kind] : null);
  const name = (kind) => (own(HS.KINDS, kind) ? HS.KINDS[kind].name : '');

  // a shape-only copy of the crafting pack (valid keys, integers 1..999, <= 64 stacks); the page's pack is already MMIsleCraft-clean
  function cleanPack(inv) {
    const next = {};
    if (isObj(inv)) Object.keys(inv).slice(0, 512).forEach((k) => { if (Object.keys(next).length < MAX_STACKS && KEY_RE.test(k) && BAD.indexOf(k) < 0 && Number.isInteger(inv[k]) && inv[k] >= 1) next[k] = Math.min(MAX_INV, inv[k]); });
    return next;
  }
  const cnt = (inv, id) => (own(inv, id) && Number.isInteger(inv[id]) && inv[id] > 0 ? inv[id] : 0);

  // made counter {kind: 1..999}: known kinds only, integers only; hostile input -> {}
  function cleanMade(raw) {
    const out = {};
    if (!isObj(raw)) return out;
    Object.keys(raw).slice(0, 64).forEach((k) => {
      if (!KEY_RE.test(k) || BAD.indexOf(k) >= 0 || !get(k)) return;
      const v = raw[k];
      if (typeof v === 'number' && Number.isInteger(v) && v >= 1) out[k] = Math.min(MAX_MADE, v);
    });
    return out;
  }
  // the build state inside save.home: MMHomestead's grid / inv / seeded, plus made. Other fields (stable...) are kept.
  function clean(home) {
    const h = HS.clean(home);
    h.made = cleanMade(isObj(home) ? home.made : null);
    return h;
  }
  function ensure(home) {
    const c = clean(home);
    home.grid = c.grid; home.inv = c.inv; home.seeded = c.seeded;
    if (Object.keys(c.made).length) home.made = c.made; else delete home.made;
    return home;
  }

  // -> { ok, missing:[{id,need,have}], reason? } where reason is 'unknown' | 'stock' (99 of that kind in stock) | 'made' | 'full'
  function canCraft(inv, home, kind) {
    const r = get(kind);
    if (!r) return { ok: false, missing: [], reason: 'unknown' };
    const missing = [];
    Object.keys(r.in).forEach((k) => { const have = cnt(inv, k); if (have < r.in[k]) missing.push({ id: k, need: r.in[k], have: have }); });
    if (missing.length) return { ok: false, missing: missing };
    const stock = isObj(home) && isObj(home.inv) ? cnt(home.inv, kind) : 0;
    const onGrid = isObj(home) && Array.isArray(home.grid) ? home.grid.length : 0;
    if (stock >= MAX_STOCK) return { ok: false, missing: [], reason: 'stock' };
    if (onGrid + stock >= HS.MAX_ITEMS + MAX_STOCK) return { ok: false, missing: [], reason: 'full' };
    if (isObj(home) && cnt(cleanMade(home.made), kind) >= MAX_MADE) return { ok: false, missing: [], reason: 'made' };
    return { ok: true, missing: [] };
  }
  // craft one decor item: takes the inputs from `inv` (returns a NEW pack object, the input is not touched) and adds 1 to home.inv[kind]
  // and home.made[kind] (home is mutated in place, like MMHomestead.place). -> { ok, why, inv, stock }
  function craft(inv, home, kind) {
    if (!isObj(home)) return { ok: false, why: 'home', inv: cleanPack(inv) };
    ensure(home);
    const next = cleanPack(inv);
    const c = canCraft(next, home, kind); // checked against the capped copy, so what is counted is what is taken
    if (!c.ok) return { ok: false, why: c.reason || 'missing', missing: c.missing, inv: next, stock: cnt(home.inv, kind) };
    const r = RECIPES[kind];
    Object.keys(r.in).forEach((k) => { next[k] -= r.in[k]; if (next[k] <= 0) delete next[k]; });
    home.inv[kind] = Math.min(MAX_STOCK, cnt(home.inv, kind) + r.out);
    const made = cleanMade(home.made);
    made[kind] = Math.min(MAX_MADE, cnt(made, kind) + r.out);
    home.made = made;
    return { ok: true, why: '', inv: next, stock: home.inv[kind] };
  }
  // placing and picking up go through MMHomestead (same rules, same 10 s undo); free(x,y) says which grid cells are open ground
  const place = (home, x, y, kind, free, nowMs) => HS.place(home, x, y, kind, free, nowMs);
  const pickUp = (home, x, y, nowMs) => HS.pickUp(home, x, y, nowMs);
  const undo = (home, act, nowMs) => HS.undo(home, act, nowMs);

  return Object.freeze({ RECIPES, IDS, MAX_MADE, MAX_STOCK, get, name, cleanMade, clean, ensure, canCraft, craft, place, pickUp, undo });
}));
