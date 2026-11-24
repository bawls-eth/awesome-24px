// MMGearForge: salvage, deterministic reforge and the fixed vendor list (NEXT-SLICES-2 Wave 2, slice GF).
// Pure and fully deterministic: no rng, no clock. Frozen output, inputs are never mutated, hostile input returns null.
// Currencies are free in-game dust and shards only; there is no real money and no paid pack anywhere.
// Item shape (additive): { n, id, r, t?, a?, sig?, f? } where `f` = { id, v } is the one forged affix (only on t >= 7).
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./mm-gear.js'), require('./mm-gear-affix.js'));
  else root.MMGearForge = factory(root.MMGear, root.MMGearAffix);
})(typeof self !== 'undefined' ? self : this, function (MMGear, MMGearAffix) {
  const has = (o, k) => Object.prototype.hasOwnProperty.call(o, k);
  const MIN_T = 7, MAX_T = 12;
  const BUYBACK_RATIO = 0.5;               // buy-back pays this share of sellValue (in dust)
  const PRICE_MULT = 4;                    // vendor price (dust) = sellValue(Common, t) x this
  const VENDOR_MAX_T = 3;
  const RARITY_FACTOR = Object.freeze([1, 1.02, 1.05, 1.08]); // forged value = range midpoint x this, never above the range max
  const WEEK_RE = /^\d{4}-W\d{2}$/;

  // validated view of a backpack entry through MMGear.clean; the forge acts only on exact data (no silent tier / rarity repair).
  function view(item) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) return null;
    if (has(item, '__proto__') || has(item, 'constructor') || has(item, 'prototype')) return null;
    if (typeof item.id !== 'string') return null;
    const c = MMGear.clean({ n: has(item, 'n') ? item.n : 1, id: item.id, r: has(item, 'r') ? item.r : 0, t: has(item, 't') ? item.t : undefined, a: has(item, 'a') ? item.a : undefined, sig: has(item, 'sig') ? item.sig : undefined }); // sig: a T12 weapon's boss signature (review F5)
    if (!c) return null;
    if (has(item, 't') && item.t !== undefined && item.t !== (c.t || 0)) return null;
    if (has(item, 'r') && item.r !== c.r) return null;
    if (has(item, 'a') && item.a !== undefined && item.a !== c.a) return null;
    return c;
  }
  const slotOf = (id) => (id.indexOf('arm_') === 0 ? 'armor' : 'weapon');

  const dustFor = (t, r) => 1 + (t || 0) * (1 + r);
  // salvage(item) -> frozen { dust, t, r, soulbound } or null. Soulbound items may be salvaged. The caller removes the item and adds the dust.
  function salvage(item) {
    const c = view(item);
    if (!c) return null;
    const t = c.t || 0;
    return Object.freeze({ dust: dustFor(t, c.r), t: t, r: c.r, soulbound: MMGear.soulbound(t) });
  }

  function forgedValue(affixId, t, r) {
    const rg = MMGearAffix.rangeOf(affixId, t), d = MMGearAffix.get(affixId);
    if (!rg || !d) return null;
    const raw = Math.min(rg[1], (rg[0] + rg[1]) / 2 * RARITY_FACTOR[r]);
    if (d.unit === 'int') return Math.round(raw);
    if (d.unit === 'pct') return Math.round(raw * 1000) / 1000;
    return Math.round(raw * 10) / 10;
  }
  const costFor = (t, r) => Object.freeze({ dust: 20 * (t - 6) + 10 * r, shards: 25 * (t - 6) }); // cycle 3 D: was t - 6 (1-6 shards: never a real sink, see beta/cycle3-design.md and tools/economy-sim.js)
  const forgedOf = (item) => {
    const f = has(item, 'f') ? item.f : null;
    return f && typeof f === 'object' && !Array.isArray(f) && typeof f.id === 'string' && has(MMGearAffix.AFFIXES, f.id) ? f : null;
  };

  // reforgeOptions(item) -> frozen [{ id, v, text, cost: { dust, shards }, current }] for every legal affix of the item's slot, or null.
  // Legal: the slot's affixes that exist at this tier, minus those already rolled on the item (with its signature: `sig` changes the seeded picks and
  // is itself an affix the item has, so it is never offered either). Value and cost are exact and fixed, so the outcome is known before paying. Only t >= 7.
  function reforgeOptions(item) {
    const c = view(item);
    if (!c || !c.t || c.t < MIN_T || c.t > MAX_T) return null;
    const slot = slotOf(c.id);
    const rolled = c.a ? MMGearAffix.roll(c.id, slot, c.t, c.r, c.a, c.sig || null).map((e) => e.id) : [];
    const cur = forgedOf(item);
    const out = [];
    MMGearAffix.SLOTS[slot].forEach((aid) => {
      if (rolled.indexOf(aid) >= 0) return;
      const v = forgedValue(aid, c.t, c.r);
      if (v === null) return;
      out.push(Object.freeze({ id: aid, v: v, text: MMGearAffix.describe([{ id: aid, v: v }])[0], cost: costFor(c.t, c.r), current: !!(cur && cur.id === aid) }));
    });
    return Object.freeze(out);
  }
  // reforge(item, affixId) -> a NEW frozen item with f = { id, v } (replaces any earlier forged affix), or null. The caller charges the cost shown by reforgeOptions.
  function reforge(item, affixId) {
    if (typeof affixId !== 'string') return null;
    const opts = reforgeOptions(item);
    if (!opts) return null;
    const o = opts.find((e) => e.id === affixId);
    if (!o) return null;
    const c = view(item);
    const out = { n: c.n, id: c.id, r: c.r, t: c.t };
    if (c.a) out.a = c.a;
    if (c.sig) out.sig = c.sig;
    out.f = Object.freeze({ id: o.id, v: o.v });
    return Object.freeze(out);
  }

  // vendorStock(weekKey) -> frozen [{ id, t, r: 0, price }] (dust). A fixed T1-T3 list: it does not vary with the week, never holds soulbound items
  // and rolls nothing. weekKey must look like '2026-W47'; anything else returns null.
  const STOCK = [];
  [1, 2, 3].forEach((t) => {
    STOCK.push({ id: 'sparkwand', t: t });
    MMGear.FAMILY_KEYS.forEach((fam) => STOCK.push({ id: MMGear.armorId(fam, t), t: t }));
  });
  const STOCK_FROZEN = Object.freeze(STOCK.map((s) => Object.freeze({ id: s.id, t: s.t, r: 0, price: MMGear.sellValue(0, s.t) * PRICE_MULT })));
  function vendorStock(weekKey) {
    if (typeof weekKey !== 'string' || !WEEK_RE.test(weekKey)) return null;
    return STOCK_FROZEN;
  }

  // buyBack(item) -> frozen { dust } at BUYBACK_RATIO of sellValue, or null. Only items the vendor could sell (T1-T3, never soulbound) qualify.
  function buyBack(item) {
    const c = view(item);
    if (!c || !c.t || c.t > VENDOR_MAX_T || MMGear.soulbound(c.t)) return null;
    return Object.freeze({ dust: Math.floor(MMGear.sellValue(c.r, c.t) * BUYBACK_RATIO) });
  }

  return Object.freeze({ MIN_T, BUYBACK_RATIO, PRICE_MULT, RARITY_FACTOR, salvage, reforgeOptions, reforge, vendorStock, buyBack });
});
