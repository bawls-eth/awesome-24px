// MMPatterns: pure bullet pattern generators. Each returns [{x,y,vx,vy,life}]. Angles in radians.
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.MMPatterns = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  const TAU = Math.PI * 2;
  const DEF_LIFE = 3;
  function mk(origin, ang, speed, life) {
    return { x: origin.x, y: origin.y, vx: Math.cos(ang) * speed, vy: Math.sin(ang) * speed, life: life === undefined ? DEF_LIFE : life };
  }
  // n bullets evenly spaced around origin, starting at offsetRad.
  function ring(n, origin, speed, offsetRad, life) {
    const out = [];
    for (let i = 0; i < n; i++) out.push(mk(origin, (offsetRad || 0) + (TAU * i) / n, speed, life));
    return out;
  }
  // One volley of a spiral: `arms` bullets TAU/arms apart, whole pattern advanced by `step`
  // radians per volley index. opts: {origin, speed, volley, life}.
  function spiral(step, arms, opts) {
    opts = opts || {};
    const origin = opts.origin || { x: 0, y: 0 };
    const a = Math.max(1, arms || 1);
    const base = (opts.volley || 0) * step;
    const out = [];
    for (let i = 0; i < a; i++) out.push(mk(origin, base + (TAU * i) / a, opts.speed === undefined ? 5 : opts.speed, opts.life));
    return out;
  }
  // `count` bullets fanned over `spread` radians centred on the direction to target.
  // rng (optional, () => [0,1)) adds up to +-opts.jitter radians of inaccuracy.
  function aimed(origin, target, spread, count, opts, rng) {
    opts = opts || {};
    const speed = opts.speed === undefined ? 7 : opts.speed;
    const jitter = opts.jitter || 0;
    const base = Math.atan2(target.y - origin.y, target.x - origin.x);
    const n = Math.max(1, count || 1);
    const out = [];
    for (let i = 0; i < n; i++) {
      let ang = base + (n === 1 ? 0 : (i / (n - 1) - 0.5) * (spread || 0));
      if (jitter && rng) ang += (rng() * 2 - 1) * jitter;
      out.push(mk(origin, ang, speed, opts.life));
    }
    return out;
  }
  // Allocation-free angle helpers (hot paths fire these per bolt; no arrays/objects made).
  // ringAngle(i, n, off): i-th of n evenly spaced angles from off.
  function ringAngle(i, n, off) { return (off || 0) + (i / n) * TAU; }
  // spiralAngle(base, arm, arms): arm-th of `arms` angles TAU/arms apart, from base.
  function spiralAngle(base, arm, arms) { return base + (arm * TAU) / arms; }
  // aimedAngle(base, i, n, spread): i-th of n bolts fanned over `spread` centred on base.
  function aimedAngle(base, i, n, spread) { return n <= 1 ? base : base + (i - (n - 1) / 2) * (spread / (n - 1)); }
  return { ring, spiral, aimed, ringAngle, spiralAngle, aimedAngle };
});
