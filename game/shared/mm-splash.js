// MMSplash: pure splash-damage kernel for the Mad Maze arena (GEAR-DROPS-BUILD-PLAN.md section d).
// No DOM, no Math.random, no per-call allocation in pick(); hostile input never throws (it yields 0 targets / 0 damage).
//  - spec: { r, frac, inner: 0.35, edge: 0.5, max } (r px 0-80, frac 0-0.8 of the hit, max targets 0-6).
//  - frac(d, spec): 1 inside inner*r, falls linearly to `edge` at r, 0 beyond r.
//  - pick(xs, ys, rs, n, x, y, spec, skip, out, ok): writes the indexes of the nearest enemies inside the radius into `out`
//    (nearest first, at most min(spec.max, 6, out.length)); the primary target `skip` is excluded; `ok` is an optional mask
//    (falsy entries are never picked: partners, drifters, critters, camp NPCs are simply not hostile). Returns the count.
//    The distances (minus enemy radius) of the picked targets are left in MMSplash.dist[0..count).
//  - claim(bolt): true only the first time for a bolt (one splash per bolt), then sets bolt.sp = 1.
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.MMSplash = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  const MAX_TARGETS = 6, MAX_R = 80, MAX_FRAC = 0.8, DEF_INNER = 0.35, DEF_EDGE = 0.5;
  const dist = new Float32Array(MAX_TARGETS);
  const fin = (v) => typeof v === 'number' && v === v && v !== Infinity && v !== -Infinity;
  const num = (v, d) => (fin(v) ? v : d);
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

  // Normalised copy of a (possibly hostile) spec; r 0 means "no splash".
  function clean(s) {
    if (!s || typeof s !== 'object') return { r: 0, frac: 0, inner: DEF_INNER, edge: DEF_EDGE, max: 0 };
    const r = clamp(num(s.r, 0), 0, MAX_R), max = clamp(Math.floor(num(s.max, 0)), 0, MAX_TARGETS);
    return { r, frac: clamp(num(s.frac, 0), 0, MAX_FRAC), inner: clamp(num(s.inner, DEF_INNER), 0, 1), edge: clamp(num(s.edge, DEF_EDGE), 0, 1), max: r > 0 ? max : 0 };
  }
  // Damage fraction at distance d (edge of the enemy to the impact point). Allocation-free.
  function frac(d, s) {
    if (!s || typeof s !== 'object') return 0;
    const r = num(s.r, 0);
    if (!(r > 0) || !fin(d)) return 0;
    if (d < 0) d = 0;
    if (d > r) return 0;
    const inner = clamp(num(s.inner, DEF_INNER), 0, 1) * r, edge = clamp(num(s.edge, DEF_EDGE), 0, 1);
    if (d <= inner || r <= inner) return 1;
    return 1 - (1 - edge) * (d - inner) / (r - inner);
  }
  // Damage one splashed enemy takes: hit already includes crit and status mods.
  function dmg(hit, d, s) {
    if (!s || typeof s !== 'object' || !fin(hit) || hit <= 0) return 0;
    return hit * clamp(num(s.frac, 0), 0, MAX_FRAC) * frac(d, s);
  }
  function pick(xs, ys, rs, n, x, y, s, skip, out, ok) {
    if (!s || typeof s !== 'object' || !xs || !ys || !out || typeof out.length !== 'number') return 0;
    const r = num(s.r, 0);
    if (!(r > 0) || !fin(x) || !fin(y)) return 0;
    const lim = Math.min(clamp(Math.floor(num(s.max, 0)), 0, MAX_TARGETS), out.length | 0);
    if (lim <= 0) return 0;
    const cnt = Math.min(Math.floor(num(n, 0)), xs.length | 0, ys.length | 0);
    let k = 0;
    for (let i = 0; i < cnt; i++) {
      if (i === skip) continue;
      if (ok && !ok[i]) continue;
      const ex = xs[i], ey = ys[i];
      if (!fin(ex) || !fin(ey)) continue;
      const dx = ex - x, dy = ey - y;
      let d = Math.sqrt(dx * dx + dy * dy) - (rs ? num(rs[i], 0) : 0);
      if (d < 0) d = 0;
      if (d > r) continue;
      if (k === lim && d >= dist[k - 1]) continue;
      let j = k < lim ? k : k - 1;
      while (j > 0 && dist[j - 1] > d) { dist[j] = dist[j - 1]; out[j] = out[j - 1]; j--; }
      dist[j] = d; out[j] = i;
      if (k < lim) k++;
    }
    return k;
  }
  // One splash per bolt: pierce/bounce bolts splash on the first hit only.
  function claim(b) {
    if (!b || typeof b !== 'object' || b.sp) return false;
    try { b.sp = 1; } catch (e) { return false; }
    return b.sp === 1;
  }
  return { MAX_TARGETS, MAX_R, MAX_FRAC, DEF_INNER, DEF_EDGE, dist, clean, frac, dmg, pick, claim };
});
