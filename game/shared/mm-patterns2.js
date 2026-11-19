// MMPatterns2: more pure bullet pattern generators (no Phaser, no Firebase).
// Each returns [{x,y,vx,vy,life,homing?,homeTime?,telegraph?}]. Angles in radians, distances in px.
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.MMPatterns2 = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  const TAU = Math.PI * 2;
  const TILE = 40;
  const TELEGRAPH_SECS = 0.8;
  function mk(o, ang, speed, life) {
    return { x: o.x, y: o.y, vx: Math.cos(ang) * speed, vy: Math.sin(ang) * speed, life: life === undefined ? 3 : life };
  }
  // Fan of `count` bullets across `arc` radians centred on `center`. The sweep direction
  // alternates with opts.call (0,1,2...): even calls go low->high angle, odd calls reverse.
  // Each bullet carries `delay` (s) so the fan is released in sweep order, and `dir` (+1/-1).
  function sweep(origin, center, opts) {
    opts = opts || {};
    const count = opts.count || 8, arc = opts.arc === undefined ? (120 * Math.PI) / 180 : opts.arc;
    const speed = opts.speed === undefined ? 6 : opts.speed, every = opts.every === undefined ? 0.06 : opts.every;
    const dir = (opts.call || 0) % 2 === 0 ? 1 : -1;
    const out = [];
    for (let k = 0; k < count; k++) {
      const frac = count === 1 ? 0.5 : k / (count - 1);
      const ang = center + (frac - 0.5) * arc * dir;
      const b = mk(origin, ang, speed, opts.life);
      b.delay = k * every;
      b.dir = dir;
      out.push(b);
    }
    return out;
  }
  // Wall of bullets across an arena edge moving inward, with one safe gap (>= 2.5 tiles).
  // arena {x,y,w,h}; edge 'top'|'bottom'|'left'|'right'; rng () => [0,1) picks the gap position.
  function wallGap(arena, edge, rng, opts) {
    opts = opts || {};
    const spacing = (opts.spacingTiles || 0.75) * TILE;
    const gap = Math.max(2.5, opts.gapTiles || 2.5) * TILE;
    const speed = opts.speed === undefined ? 4 : opts.speed;
    const horizontal = edge === 'top' || edge === 'bottom';
    const len = horizontal ? arena.w : arena.h;
    const lo = gap / 2, hi = Math.max(lo, len - gap / 2);
    const centre = lo + (hi - lo) * (rng ? rng() : 0.5);
    const out = [];
    for (let p = 0; p <= len + 1e-6; p += spacing) {
      if (Math.abs(p - centre) < gap / 2) continue; // leaves >= gap between neighbours
      let b;
      if (edge === 'top') b = { x: arena.x + p, y: arena.y, vx: 0, vy: speed };
      else if (edge === 'bottom') b = { x: arena.x + p, y: arena.y + arena.h, vx: 0, vy: -speed };
      else if (edge === 'left') b = { x: arena.x, y: arena.y + p, vx: speed, vy: 0 };
      else b = { x: arena.x + arena.w, y: arena.y + p, vx: -speed, vy: 0 };
      b.life = opts.life === undefined ? 6 : opts.life;
      out.push(b);
    }
    out.gapCentre = centre; out.gapSize = gap;
    return out;
  }
  // Bullets fanned at the target that home for homeTime seconds, then fly straight.
  function homing(origin, target, opts) {
    opts = opts || {};
    const count = opts.count || 4, speed = opts.speed === undefined ? 4 : opts.speed;
    const base = Math.atan2(target.y - origin.y, target.x - origin.x);
    const out = [];
    for (let i = 0; i < count; i++) {
      const ang = base + (count === 1 ? 0 : (i / (count - 1) - 0.5) * (opts.spread === undefined ? 0.6 : opts.spread));
      const b = mk(origin, ang, speed, opts.life === undefined ? 4 : opts.life);
      b.homing = true; b.homeTime = opts.homeTime === undefined ? 1.2 : opts.homeTime;
      b.turnRate = opts.turnDegPerSec === undefined ? 90 : opts.turnDegPerSec;
      out.push(b);
    }
    return out;
  }
  // True while a homing bullet that has lived `age` seconds should still steer.
  function isHoming(b, age) { return !!b.homing && age < b.homeTime; }
  // 16-bullet rosette: evenly spaced, speed pulsing with `petals` lobes.
  function flower(origin, opts) {
    opts = opts || {};
    const count = 16, petals = opts.petals || 4, off = opts.offset || 0;
    const out = [];
    for (let i = 0; i < count; i++) {
      const sp = 3 + 2 * Math.sin((i * petals * TAU) / count);
      out.push(mk(origin, off + (TAU * i) / count, sp, opts.life));
    }
    return out;
  }
  // 5 shots in a narrow cone (default 50 deg) at the target, speeds 6-8 from rng.
  function shotgun(origin, target, rng, opts) {
    opts = opts || {};
    const shots = 5, spread = opts.spread === undefined ? (50 * Math.PI) / 180 : opts.spread;
    const base = Math.atan2(target.y - origin.y, target.x - origin.x);
    const out = [];
    for (let i = 0; i < shots; i++) {
      const ang = base + (i / (shots - 1) - 0.5) * spread;
      out.push(mk(origin, ang, 6 + 2 * (rng ? rng() : 0.5), opts.life));
    }
    return out;
  }
  // Red warning descriptor shown before a pattern fires (0.8 s).
  function telegraph(kind, at) {
    return { kind: kind, x: at ? at.x : 0, y: at ? at.y : 0, duration: TELEGRAPH_SECS, life: TELEGRAPH_SECS, color: '#ff2222', telegraph: true };
  }
  return { sweep, wallGap, homing, isHoming, flower, shotgun, telegraph, TILE, TELEGRAPH_SECS };
});
