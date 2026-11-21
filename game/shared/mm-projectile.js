// MMProjectile: pure motion kernels for weapon-style bolts (CLASS-WEAPON-BUILD-PLAN.md, "Motion kernels").
// No DOM, no Math.random. step() never mutates its input: it returns {state, bolt} with a fresh bolt.
// state: 'alive' | 'dead' | 'bounced' | 'returned'. World: {isWall(x,y), nearest(x,y,range,cone,dir), hero:{x,y}}.
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.MMProjectile = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  const SPD = 580, TWO_PI = Math.PI * 2;
  const num = (v, d) => (typeof v === 'number' || typeof v === 'string') && v !== '' && Number.isFinite(Number(v)) ? Number(v) : d;
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const own = (o, k) => (o && typeof o === 'object' && Object.prototype.hasOwnProperty.call(o, k) ? o[k] : undefined);
  const HOMING_CONE = 70 * Math.PI / 180, HOMING_RANGE = 260, RETURN_R = 16;

  // Sanitised read of the motion fields of a spec.
  function norm(spec) {
    const s = spec && typeof spec === 'object' ? spec : {};
    const w = own(s, 'wave');
    const wave = w && typeof w === 'object' ? { amp: clamp(num(own(w, 'amp'), 0), 0, 60), cycles: clamp(num(own(w, 'cycles'), 2.75), 0, 12) } : { amp: 0, cycles: 2.75 };
    return {
      spd: clamp(num(own(s, 'spd'), 1), 0.05, 4),
      life: clamp(num(own(s, 'life'), 0.85), 0.05, 5),
      homing: clamp(num(own(s, 'homing'), 0), 0, 20),
      bounce: Math.floor(clamp(num(own(s, 'bounce'), 0), 0, 3)),
      boomerang: own(s, 'boomerang') === true,
      wave,
    };
  }

  // New bolt at (x,y) heading `angle`. ph: wave phase (use Math.PI for the alternate bolt of a helix).
  function make(x, y, angle, spec, ph) {
    const n = norm(spec), a = num(angle, 0), sp = SPD * n.spd;
    const ux = Math.cos(a), uy = Math.sin(a);
    return { x: num(x, 0), y: num(y, 0), cx: num(x, 0), cy: num(y, 0), ux, uy, vx: ux * sp, vy: uy * sp, sp, age: 0, ph: num(ph, 0), bounces: 0, back: false, tx: 0, ty: 0 };
  }

  // Wave offset in px at `age` (perpendicular to the launch direction).
  function waveOffset(spec, age, ph) {
    const n = norm(spec), w = n.wave;
    if (w.amp <= 0) return 0;
    return w.amp * Math.min(1, age / (0.25 * n.life)) * Math.sin(TWO_PI * w.cycles * age / n.life + num(ph, 0));
  }

  function turnToward(vx, vy, tx, ty, maxTurn) {
    const cur = Math.atan2(vy, vx), want = Math.atan2(ty, tx);
    let d = want - cur;
    while (d > Math.PI) d -= TWO_PI;
    while (d < -Math.PI) d += TWO_PI;
    return cur + clamp(d, -maxTurn, maxTurn);
  }

  function step(bolt, spec, dt, world) {
    const b0 = bolt && typeof bolt === 'object' ? bolt : {};
    const g = (k, d) => num(own(b0, k), d);
    const b = {
      x: g('x', 0), y: g('y', 0), cx: g('cx', g('x', 0)), cy: g('cy', g('y', 0)),
      ux: g('ux', 1), uy: g('uy', 0), vx: g('vx', 0), vy: g('vy', 0), sp: g('sp', SPD),
      age: Math.max(0, g('age', 0)), ph: g('ph', 0), bounces: Math.floor(g('bounces', 0)), back: own(b0, 'back') === true, tx: g('tx', 0), ty: g('ty', 0),
    };
    const n = norm(spec), h = clamp(num(dt, 0), 0, 0.1);
    const wd = world && typeof world === 'object' ? world : {};
    const isWall = typeof wd.isWall === 'function' ? wd.isWall : () => false;
    const hero = wd.hero && typeof wd.hero === 'object' ? { x: num(wd.hero.x, b.x), y: num(wd.hero.y, b.y) } : null;
    let state = 'alive';
    const prevAge = b.age;
    b.age += h;

    if (n.boomerang && hero) {
      const half = n.life / 2;
      if (!b.back && b.age >= half) { b.back = true; b.tx = b.cx; b.ty = b.cy; }
      if (b.back) {
        const t = clamp((b.age - half) / half, 0, 1), e = t * t * (3 - 2 * t);
        const nx = b.tx + (hero.x - b.tx) * e, ny = b.ty + (hero.y - b.ty) * e;
        if (h > 0) { b.vx = (nx - b.x) / h; b.vy = (ny - b.y) / h; }
        b.x = b.cx = nx; b.y = b.cy = ny;
        if (t >= 1 || Math.hypot(hero.x - nx, hero.y - ny) <= RETURN_R) { b.x = b.cx = hero.x; b.y = b.cy = hero.y; state = 'returned'; }
        return { state, bolt: b };
      }
    } else if (b.age >= n.life) {
      state = 'dead';
    }

    // On the last step only the time left in the bolt's life is consumed.
    const live = state === 'alive' ? h : Math.max(0, Math.min(h, n.life - prevAge));
    // Homing steers the centreline velocity by at most homing * dt.
    if (n.homing > 0 && typeof wd.nearest === 'function' && live > 0) {
      const dir = Math.atan2(b.vy, b.vx);
      const t = wd.nearest(b.cx, b.cy, HOMING_RANGE, HOMING_CONE, dir);
      if (t && typeof t === 'object' && Number.isFinite(Number(t.x)) && Number.isFinite(Number(t.y))) {
        const a = turnToward(b.vx, b.vy, Number(t.x) - b.cx, Number(t.y) - b.cy, n.homing * h);
        b.vx = Math.cos(a) * b.sp; b.vy = Math.sin(a) * b.sp;
        b.ux = Math.cos(a); b.uy = Math.sin(a);
      }
    }
    // Move the centreline, with wall handling.
    const nx = b.cx + b.vx * live, ny = b.cy + b.vy * live;
    if (live > 0 && isWall(nx, ny)) {
      if (n.bounce > 0 && b.bounces < n.bounce) {
        const wx = isWall(nx, b.cy), wy = isWall(b.cx, ny);
        if (wx || !wy) b.vx = -b.vx;
        if (wy || !wx) b.vy = -b.vy;
        const sp = Math.hypot(b.vx, b.vy) || 1;
        b.ux = b.vx / sp; b.uy = b.vy / sp;
        b.bounces++;
        state = 'bounced';
        // stay at the previous position so the bolt cannot tunnel into the wall
      } else {
        return { state: 'dead', bolt: b };
      }
    } else { b.cx = nx; b.cy = ny; }
    const off = waveOffset(spec, b.age, b.ph);
    b.x = b.cx - b.uy * off; b.y = b.cy + b.ux * off;
    return { state, bolt: b };
  }

  // Chain: after a hit, pick the nearest enemy not yet hit within chain range; returns a child descriptor or null.
  // enemies: [{id,x,y}], hitIds: array of ids already struck.
  function chainNext(from, enemies, hitIds, spec, dmg) {
    const c = spec && typeof spec === 'object' ? own(spec, 'chain') : null;
    if (!c || typeof c !== 'object') return null;
    const n = Math.floor(clamp(num(own(c, 'n'), 0), 0, 3));
    if (n <= 0 || !from || typeof from !== 'object' || !Array.isArray(enemies)) return null;
    const range = clamp(num(own(c, 'range'), 120), 0, 400), fall = clamp(num(own(c, 'falloff'), 0.7), 0, 1);
    const hit = Array.isArray(hitIds) ? hitIds : [];
    const fx = num(from.x, 0), fy = num(from.y, 0);
    let best = null, bd = Infinity;
    for (const e of enemies.slice(0, 256)) {
      if (!e || typeof e !== 'object' || hit.indexOf(e.id) >= 0) continue;
      const ex = num(e.x, NaN), ey = num(e.y, NaN);
      if (!Number.isFinite(ex) || !Number.isFinite(ey)) continue;
      const d = Math.hypot(ex - fx, ey - fy);
      if (d <= range && d < bd) { bd = d; best = { id: e.id, x: ex, y: ey }; }
    }
    if (!best) return null;
    return { x: fx, y: fy, target: best, dmg: num(dmg, 1) * fall, chainLeft: n - 1 };
  }

  // Orbit: position of orbiter i of count (max 3) around the hero at time t seconds.
  function orbitPos(i, count, t, spec, hero) {
    const o = spec && typeof spec === 'object' ? own(spec, 'orbit') : null;
    const r = o && typeof o === 'object' ? clamp(num(own(o, 'radius'), 34), 0, 200) : 34;
    const period = o && typeof o === 'object' ? clamp(num(own(o, 'period'), 0.9), 0.1, 20) : 0.9;
    const k = Math.max(1, Math.min(3, Math.floor(num(count, 1))));
    const a = TWO_PI * (num(t, 0) / period + (Math.floor(num(i, 0)) % k) / k);
    const hx = hero && typeof hero === 'object' ? num(hero.x, 0) : 0, hy = hero && typeof hero === 'object' ? num(hero.y, 0) : 0;
    return { x: hx + Math.cos(a) * r, y: hy + Math.sin(a) * r };
  }

  // Burst: shot delays in seconds for burst {n, gap}.
  function burstTimes(spec) {
    const b = spec && typeof spec === 'object' ? own(spec, 'burst') : null;
    const ok = b && typeof b === 'object';
    const n = ok ? Math.floor(clamp(num(own(b, 'n'), 1), 1, 5)) : 1;
    const gap = ok ? clamp(num(own(b, 'gap'), 0), 0, 0.5) : 0;
    const out = [];
    for (let i = 0; i < n; i++) out.push(i * gap);
    return out;
  }

  // Lob: flies to the aim point (capped at maxRange) without colliding, telegraphs 0.25 s, then lands.
  function lobStep(lob, spec, dt) {
    const l0 = lob && typeof lob === 'object' ? lob : {};
    const ls = spec && typeof spec === 'object' ? own(spec, 'lob') : null;
    const maxRange = ls && typeof ls === 'object' ? clamp(num(own(ls, 'maxRange'), 260), 0, 600) : 260;
    const sx = num(own(l0, 'sx'), 0), sy = num(own(l0, 'sy'), 0);
    let dx = num(own(l0, 'ax'), sx) - sx, dy = num(own(l0, 'ay'), sy) - sy;
    const d = Math.hypot(dx, dy);
    if (d > maxRange) { dx = dx / d * maxRange; dy = dy / d * maxRange; }
    const flight = 0.4, tele = 0.25;
    const age = Math.max(0, num(own(l0, 'age'), 0)) + clamp(num(dt, 0), 0, 0.1);
    const f = clamp(age / flight, 0, 1);
    const phase = age >= flight + tele ? 'land' : age >= flight ? 'telegraph' : 'fly';
    return { phase, age, x: sx + dx * f, y: sy + dy * f, lx: sx + dx, ly: sy + dy, sx, sy, ax: sx + dx, ay: sy + dy };
  }

  return { SPD, make, step, waveOffset, chainNext, orbitPos, burstTimes, lobStep, norm };
});
