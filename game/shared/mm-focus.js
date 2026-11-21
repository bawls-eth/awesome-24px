// MMFocus: focus (mana) resource for the arena. Pure; never mutates input; no randomness.
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.MMFocus = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  const BASE_MAX = 100, PER_LEVEL = 5, CAP = 200, BASE_REGEN = 6, WIT_REGEN = 0.12, MAX_LEVEL = 200;
  const COSTS = { dash: 0, nova: 25, shield: 30, overdrive: 40, signature: 40 };
  const ORB_RESTORE = 15, POTION_FRACTION = 0.5;
  const hasOwn = (o, k) => Object.prototype.hasOwnProperty.call(o, k);
  function num(v, d) { return typeof v === 'number' && isFinite(v) ? v : d; }
  function lvl(level) { return Math.min(MAX_LEVEL, Math.max(1, Math.floor(num(level, 1)))); }
  function maxFor(level) { return Math.min(CAP, BASE_MAX + PER_LEVEL * (lvl(level) - 1)); }
  function regenFor(wit) { return BASE_REGEN + WIT_REGEN * Math.min(1000, Math.max(0, num(wit, 0))); }
  // classId is kept for future per-class tuning; every class shares the curve today.
  function create(classId, level, wit) {
    const max = maxFor(level);
    return { classId: typeof classId === 'string' ? classId : '', level: lvl(level), max, cur: max, regen: regenFor(wit) };
  }
  function clean(st) {
    const s = st && typeof st === 'object' ? st : {};
    const max = Math.min(CAP, Math.max(1, num(s.max, BASE_MAX)));
    return { classId: typeof s.classId === 'string' ? s.classId : '', level: num(s.level, 1), max, cur: Math.min(max, Math.max(0, num(s.cur, max))), regen: Math.max(0, num(s.regen, BASE_REGEN)) };
  }
  function cost(abilityId) { return typeof abilityId === 'string' && hasOwn(COSTS, abilityId) ? COSTS[abilityId] : null; }
  function tick(st, dt) {
    const s = clean(st);
    s.cur = Math.min(s.max, s.cur + s.regen * Math.min(5, Math.max(0, num(dt, 0))));
    return s;
  }
  // Returns {ok, state, cost, reason?}; state is always a fresh copy.
  function spend(st, abilityId) {
    const s = clean(st), c = cost(abilityId);
    if (c === null) return { ok: false, state: s, cost: 0, reason: 'unknown-ability' };
    if (s.cur < c) return { ok: false, state: s, cost: c, reason: 'short' };
    s.cur -= c;
    return { ok: true, state: s, cost: c };
  }
  function restore(st, kind) {
    const s = clean(st);
    if (kind === 'focus') s.cur = Math.min(s.max, s.cur + ORB_RESTORE);
    else if (kind === 'potion_focus') s.cur = Math.min(s.max, s.cur + s.max * POTION_FRACTION);
    return s;
  }
  return { BASE_MAX, PER_LEVEL, CAP, BASE_REGEN, COSTS, ORB_RESTORE, POTION_FRACTION, create, tick, spend, restore, cost, maxFor, regenFor };
});
