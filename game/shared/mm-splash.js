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
  // ---- G12 boss ground-slam: pure helpers shared by the world bosses (realm-world.js) and the dungeon bosses (dungeon.js) ----
  //  - the warning (ring zone) is shown SLAM.WIND seconds before the damage lands; damage = round(8 x dmgMul x 1.5 x falloff), capped at SLAM.CAP
  //    (dmgMul already carries MMDifficulty); outside the radius it is 0. slamStep() is the wind-up clock: 0 idle, 1 wind-up starts, 2 winding, 3 lands.
  const SLAM = { WIND: 0.9, BASE: 8, MUL: 1.5, CAP: 30, FIRST: 0.6, EDGE: 0.7, INNER: 0.5 };
  function slamR(tier) { const t = clamp(Math.floor(num(tier, 1)), 1, 6); return 88 + 6 * t; }
  function slamDmg(dmgMul, d, r) {
    const m = dmgMul, rr = num(r, 0);
    if (!(rr > 0) || !fin(d) || d > rr || !fin(m) || !(m > 0)) return 0;
    const f = frac(d, { r: rr, inner: SLAM.INNER, edge: SLAM.EDGE });
    return Math.min(SLAM.CAP, Math.max(1, Math.round(SLAM.BASE * m * SLAM.MUL * f)));
  }
  function slamNew(every) { return { t: num(every, 6) * SLAM.FIRST, w: 0 }; }
  function slamStep(s, dt, can, every) {
    if (!s || !fin(dt) || dt < 0) return 0;
    if (s.w > 0) { s.w -= dt; if (s.w > 0) return 2; s.w = 0; s.t = num(every, 6); return 3; }
    if (!can) return 0;
    s.t -= dt;
    if (s.t > 0) return 0;
    s.w = SLAM.WIND; return 1;
  }
  // Baked once per colour (no per-frame paths): a filled disc and a ring, 128 px. drawSlam stretches them to the slam radius `r`.
  let spr = null;
  function slamSprites(color) {
    if (spr && spr.color === color) return spr;
    if (typeof document === 'undefined') return null;
    const mk = (draw) => { const c = document.createElement('canvas'); c.width = 128; c.height = 128; draw(c.getContext('2d')); return c; };
    spr = {
      color,
      disc: mk((g) => { g.fillStyle = color; g.beginPath(); g.arc(64, 64, 62, 0, Math.PI * 2); g.fill(); }),
      ring: mk((g) => {
        g.strokeStyle = '#140a14'; g.lineWidth = 8; g.beginPath(); g.arc(64, 64, 59, 0, Math.PI * 2); g.stroke();
        g.strokeStyle = color; g.lineWidth = 4; g.beginPath(); g.arc(64, 64, 59, 0, Math.PI * 2); g.stroke();
      })
    };
    return spr;
  }
  // p = 0..1 wind-up progress. reduced: one static look (no fill growth, no pulse). Draws on a 2D canvas context; a no-op without a document.
  function drawSlam(g, x, y, r, p, reduced, color) {
    const sp = slamSprites(color || '#ff4a4a'); if (!sp || !g || !(r > 0)) return false;
    const q = clamp(num(p, 0), 0, 1); const a0 = g.globalAlpha;
    g.globalAlpha = reduced ? 0.22 : 0.1 + 0.1 * q; g.drawImage(sp.disc, x - r, y - r, r * 2, r * 2);
    if (!reduced) { const k = Math.max(0.05, q) * r; g.globalAlpha = 0.28 + 0.2 * q; g.drawImage(sp.disc, x - k, y - k, k * 2, k * 2); }
    g.globalAlpha = reduced ? 0.8 : 0.6 + 0.4 * q; g.drawImage(sp.ring, x - r, y - r, r * 2, r * 2);
    g.globalAlpha = a0; return true;
  }
  return { MAX_TARGETS, MAX_R, MAX_FRAC, DEF_INNER, DEF_EDGE, dist, clean, frac, dmg, pick, claim, SLAM, slamR, slamDmg, slamNew, slamStep, drawSlam };
});
