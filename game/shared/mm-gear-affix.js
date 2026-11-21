// MMGearAffix: the 12 tier affixes of T7+ gear (GEAR-DROPS-BUILD-PLAN section (c), slice G3).
// An item's affixes are a pure function of (id, t, a) plus its quality r: seeded by MMRng.create('gear-aff:' + id + ':' + t + ':' + a), where `a`
// is the uint32 affix seed fixed at drop time, so every device agrees. No rerolls, currency or boxes. Rarity improves the rolled VALUES, not the count:
// r0/r1 take one draw, r2 the best of 2, r3 the best of 3.
// Count: T7-8 one affix, T9-11 two, T12 two plus the boss signature (when a valid one is passed). No duplicates.
// Pure: no DOM, no clock, no Math.random; frozen output; hostile input yields [] / safe numbers; inputs are never mutated.
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./rng.js'));
  else root.MMGearAffix = factory(root.MMRng);
})(typeof self !== 'undefined' ? self : this, function (MMRng) {
  const has = (o, k) => Object.prototype.hasOwnProperty.call(o, k);
  const isInt = (v) => typeof v === 'number' && Number.isFinite(v) && Math.floor(v) === v;
  const MIN_T = 7, MAX_T = 12, MAX_A = 4294967295;
  const CAPS = Object.freeze([1.06, 1.10, 1.14]); // weapon affix power product cap per range band (T7-8, T9-10, T11-12)

  // unit: 'pct' (fraction, 0.001 grid), 'int' (whole numbers) or 'num' (one decimal+). Ranges per band [T7-8, T9-10, T11-12]; null = not available.
  const DEF = [
    ['keen', 'weapon', 'pct', [[0.03, 0.05], [0.04, 0.07], [0.06, 0.09]]],
    ['blast', 'weapon', 'int', [[4, 6], [6, 9], [8, 12]]],
    ['venom', 'weapon', 'pct', [[0.04, 0.06], [0.06, 0.09], [0.08, 0.12]]],
    ['swift', 'weapon', 'pct', [[0.02, 0.03], [0.03, 0.04], [0.04, 0.06]]],
    ['reach', 'weapon', 'pct', [[0.04, 0.06], [0.06, 0.08], [0.08, 0.10]]],
    ['leech', 'weapon', 'pct', [null, [0.015, 0.025], [0.025, 0.035]]],
    ['pierce', 'weapon', 'int', [null, [1, 1], [1, 1]]],
    ['vital', 'armor', 'pct', [[0.04, 0.06], [0.06, 0.09], [0.08, 0.12]]],
    ['ward', 'armor', 'int', [[1, 1], [1, 1], [2, 2]]],
    ['fleet', 'armor', 'int', [[4, 6], [6, 8], [8, 12]]],
    ['resist', 'armor', 'pct', [[0.05, 0.08], [0.08, 0.12], [0.10, 0.15]]],
    ['mend', 'armor', 'num', [[0.5, 0.5], [0.8, 0.8], [1.2, 1.2]]],
  ];
  const AFFIXES = {}, IDS = [];
  DEF.forEach((d) => {
    AFFIXES[d[0]] = Object.freeze({ id: d[0], slot: d[1], unit: d[2], ranges: Object.freeze(d[3].map((r) => (r ? Object.freeze(r.slice()) : null))) });
    IDS.push(d[0]);
  });
  Object.freeze(AFFIXES); Object.freeze(IDS);
  const SLOTS = Object.freeze({ weapon: Object.freeze(IDS.filter((i) => AFFIXES[i].slot === 'weapon')), armor: Object.freeze(IDS.filter((i) => AFFIXES[i].slot === 'armor')) });
  const get = (id) => (typeof id === 'string' && has(AFFIXES, id) ? AFFIXES[id] : null);

  const bandOf = (t) => (t >= 11 ? 2 : t >= 9 ? 1 : 0);
  const countFor = (t) => (t >= 9 ? 2 : 1);
  // cap(t): the weapon affix power cap for tier t (1 below T7).
  function cap(t) { return isInt(t) && t >= MIN_T && t <= MAX_T ? CAPS[bandOf(t)] : 1; }
  const rangeOf = (id, t) => { const d = get(id); return d && isInt(t) && t >= MIN_T && t <= MAX_T ? d.ranges[bandOf(t)] : null; };

  // Marginal DPS weight of each affix value (crit x rate x splash weight x status V). Reach, leech, pierce and armor affixes carry no DPS weight.
  //  keen: expected crit gain (crit x2); swift: rate; venom: status chance counts half; blast: shapeIdx splash term 0.25 x frac 0.30 per 24 px.
  function factor(id, v) {
    switch (id) {
      case 'keen': case 'swift': return 1 + v;
      case 'venom': return 1 + 0.5 * v;
      case 'blast': return 1 + Math.min(0.45, 0.25 * 0.30 * (v / 24));
      default: return 1;
    }
  }
  const POWER_IDS = Object.freeze(['keen', 'swift', 'venom', 'blast']);
  // value(list) -> the weapon affix power product (>= 1). Hostile lists give 1.
  function value(list) {
    if (!Array.isArray(list)) return 1;
    let p = 1;
    list.forEach((e) => { if (e && typeof e === 'object' && typeof e.id === 'string' && typeof e.v === 'number' && Number.isFinite(e.v) && e.v > 0 && POWER_IDS.indexOf(e.id) >= 0 && AFFIXES[e.id].slot === 'weapon') p *= factor(e.id, e.v); });
    return p;
  }
  function quant(unit, v) {
    if (unit === 'int') return Math.round(v);
    if (unit === 'pct') return Math.round(v * 1000) / 1000;
    return Math.round(v * 10) / 10;
  }

  // roll(id, slot, t, r, a, sig?) -> frozen [{ id, v }]. [] for tiers below T7 and for any invalid argument.
  //  `sig` (T12 only) is the boss signature affix id; it is added as a third entry when its slot matches the item slot.
  function roll(id, slot, t, r, a, sig) {
    if (typeof id !== 'string' || id.length > 64 || (slot !== 'weapon' && slot !== 'armor') || !isInt(t) || t < MIN_T || t > MAX_T || !isInt(a) || a < 1 || a > MAX_A) return Object.freeze([]);
    const draws = 1 + Math.max(0, Math.min(2, typeof r === 'number' && Number.isFinite(r) ? Math.floor(r) - 1 : 0)); // r0/r1: 1, r2: 2, r3: 3
    const rng = MMRng.create('gear-aff:' + id + ':' + t + ':' + a);
    const sg = t === MAX_T && typeof sig === 'string' && has(AFFIXES, sig) && AFFIXES[sig].slot === slot && rangeOf(sig, t) ? sig : null;
    const pool = SLOTS[slot].filter((x) => x !== sg && rangeOf(x, t));
    const picks = [];
    for (let i = 0, n = Math.min(countFor(t), pool.length); i < n; i++) picks.push(pool.splice(rng.int(0, pool.length - 1), 1)[0]);
    if (sg) picks.push(sg);
    const list = picks.map((pid) => {
      const rg = rangeOf(pid, t);
      let u = rng.next();
      for (let k = 1; k < draws; k++) u = Math.max(u, rng.next());
      return { id: pid, v: quant(AFFIXES[pid].unit, rg[0] + u * (rg[1] - rg[0])) };
    });
    // power cap: scale the DPS-weighted values down pro rata (floored, so rounding can never push the product over the cap)
    const c = cap(t), P = value(list);
    if (slot === 'weapon' && P > c) {
      const s = (c - 1) / (P - 1);
      list.forEach((e) => {
        if (POWER_IDS.indexOf(e.id) < 0) return;
        e.v = AFFIXES[e.id].unit === 'int' ? Math.floor(e.v * s) : Math.floor(e.v * s * 1000) / 1000;
      });
    }
    return Object.freeze(list.map((e) => Object.freeze({ id: e.id, v: e.v })));
  }

  const pct = (v) => Math.round(v * 1000) / 10 + '%';
  const TEXT = {
    keen: (v) => 'Keen +' + pct(v) + ' crit', blast: (v) => 'Blast +' + v + ' px splash', venom: (v) => 'Venom +' + pct(v) + ' status chance',
    swift: (v) => 'Swift +' + pct(v) + ' fire rate', reach: (v) => 'Reach +' + pct(v) + ' range', leech: (v) => 'Leech ' + pct(v) + ' of damage as HP',
    pierce: (v) => 'Pierce +' + v, vital: (v) => 'Vital +' + pct(v) + ' HP', ward: (v) => 'Ward +' + v + ' guard', fleet: (v) => 'Fleet +' + v + ' speed',
    resist: (v) => 'Resist +' + pct(v) + ' status', mend: (v) => 'Mend ' + v + ' HP/s after 3 s',
  };
  // describe(list) -> frozen array of plain text lines (the capped values). Hostile entries are skipped; never contains markup.
  function describe(list) {
    if (!Array.isArray(list)) return Object.freeze([]);
    const out = [];
    list.forEach((e) => { if (e && typeof e === 'object' && typeof e.id === 'string' && has(TEXT, e.id) && typeof e.v === 'number' && Number.isFinite(e.v)) out.push(TEXT[e.id](e.v)); });
    return Object.freeze(out);
  }
  // sum(list) -> { id: total } for the stats pipeline (hostile lists give {}).
  function sum(list) {
    const out = {};
    if (!Array.isArray(list)) return Object.freeze(out);
    list.forEach((e) => { if (e && typeof e === 'object' && typeof e.id === 'string' && has(AFFIXES, e.id) && typeof e.v === 'number' && Number.isFinite(e.v)) out[e.id] = (out[e.id] || 0) + e.v; });
    return Object.freeze(out);
  }

  return Object.freeze({ AFFIXES, IDS, SLOTS, CAPS, MIN_T, get, rangeOf, roll, value, cap, describe, sum });
});
