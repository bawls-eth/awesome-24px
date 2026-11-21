// Isle big-creature boss engine (slice X3). Pure, seeded, no DOM / timers / network / Date / Math.random.
// UMD: browser global MMIsleBoss (needs MMRng, MMCreatures, MMTame), or require().
// step(state, input, dt) -> { state, events }. Every call returns a FRESH state; inputs are never mutated.
// Fair-fight rules baked in: every attack is telegraphed for its windup (>= 0.6 s, >= 0.8 s for ground slams),
// at most 2 live hazards (1 in phases 1-2), no enrage timer, no instant kill (one hit per hazard, dmgMul <= 1.2),
// and every attack shape leaves a safe zone.
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./rng.js'), require('./mm-creatures.js'), require('./mm-tame.js'));
  else root.MMIsleBoss = factory(root.MMRng, root.MMCreatures, root.MMTame);
}(typeof self !== 'undefined' ? self : this, function (MMRng, MMCreatures, MMTame) {
  'use strict';

  const K = {
    PHASE2: 0.7, PHASE3: 0.35,      // phase changes at 70% / 35% HP
    WEARY: 0.1,                     // weary at 10% HP (a hit can never skip past it)
    MIN_WINDUP: 0.6, MIN_SLAM: 0.8, // seconds of telegraph before any hit zone is live
    MAX_LIVE: 2,                    // hard cap on live hazards (phases 1-2 allow only 1)
    MAX_DMG_MUL: 1.2,               // x def.dmg per hit, one hit per hazard
    PHASE_PAUSE: 1.5,               // quiet seconds after a phase change
    ARENA_R: 420,                   // px, reference arena radius used by the safe-zone checks
    MAX_DT: 0.5,
  };
  const SHAPES = ['line', 'ring', 'cone', 'spiral'];
  const hasOwn = (o, k) => Object.prototype.hasOwnProperty.call(o, k);
  const fin = (v, d, lo, hi) => { const n = typeof v === 'number' && isFinite(v) ? v : d; return n < lo ? lo : n > hi ? hi : n; };
  const r2 = (n) => Math.round(n * 1000) / 1000;

  // ---- attack library: shape params are px / radians / seconds ----
  const A = {
    // line (charge / breath / jet): a rectangle from the boss along the aim angle
    line: (id, windup, width, len, dmgMul, dur) => ({ id, shape: 'line', windup, width, len: len || 520, dmgMul: dmgMul || 1, dur: dur || 0.35 }),
    // ring (stomp / roar / nova): a band, safe both inside `inner` (hug the boss) and outside `outer`
    ring: (id, windup, inner, outer, dmgMul, dur) => ({ id, shape: 'ring', slam: windup >= K.MIN_SLAM, windup, inner, outer, dmgMul: dmgMul || 1, dur: dur || 0.4 }),
    // cone (tail / wing / heads): a wedge along the aim angle, arc in radians (< 2 rad)
    cone: (id, windup, arc, radius, dmgMul, dur) => ({ id, shape: 'cone', windup, arc, radius: radius || 300, dmgMul: dmgMul || 1, dur: dur || 0.35 }),
    // spiral (base): `arms` rotating arms with clear gaps between them, slow spin, lasts `dur`
    spiral: (id, windup, arms, armHalf, radius, spin, dur, dmgMul) => ({ id, shape: 'spiral', windup, arms, armHalf, radius: radius || 380, spin, dmgMul: dmgMul || 0.8, dur: dur || 2.4 }),
  };

  // ---- phase scripts: phases[0] >70%, phases[1] 35-70%, phases[2] <35%. rest = [min, max] seconds between attacks. ----
  const SCRIPTS = {
    fernjaw_tyrant: { simMul: 13.6, phases: [
      { name: 'Hunting', maxLive: 1, rest: [2.4, 3.4], attacks: [A.line('tyrant_charge', 0.8, 70, 520, 1), A.cone('tail_lash', 0.7, 1.4, 280, 0.9)] },
      { name: 'Roaring', maxLive: 1, rest: [2.0, 3.0], attacks: [A.line('tyrant_charge', 0.7, 70, 540, 1.1), A.cone('tail_lash', 0.65, 1.6, 300, 1), A.ring('tyrant_stomp', 0.9, 90, 230, 1)] },
      { name: 'Frenzied', maxLive: 2, rest: [1.8, 2.6], attacks: [A.line('tyrant_charge', 0.65, 70, 560, 1.1), A.cone('tail_lash', 0.6, 1.6, 300, 1), A.ring('tyrant_stomp', 0.85, 90, 240, 1.1), A.spiral('roar_spiral', 0.7, 3, 0.3, 380, 0.9, 2.4, 0.8)] },
    ] },
    tide_hydra: { simMul: 16.3, phases: [
      { name: 'Surfacing', maxLive: 1, rest: [2.5, 3.5], attacks: [A.cone('head_snap', 0.7, 1.3, 290, 0.9), A.line('water_jet', 0.8, 60, 560, 1)] },
      { name: 'Many heads', maxLive: 1, rest: [2.1, 3.1], attacks: [A.cone('head_snap', 0.65, 1.5, 300, 1), A.line('water_jet', 0.7, 60, 580, 1.1), A.ring('tidal_slam', 0.9, 100, 240, 1)] },
      { name: 'Maelstrom', maxLive: 2, rest: [1.8, 2.7], attacks: [A.cone('head_snap', 0.6, 1.5, 310, 1), A.line('water_jet', 0.65, 60, 600, 1.1), A.ring('tidal_slam', 0.85, 100, 250, 1.1), A.spiral('whirlpool', 0.75, 4, 0.22, 400, 0.8, 2.6, 0.8)] },
    ] },
    frost_dragon: { simMul: 22, phases: [
      { name: 'Circling', maxLive: 1, rest: [2.4, 3.4], attacks: [A.line('frost_breath', 0.8, 80, 560, 1), A.cone('wing_gust', 0.7, 1.5, 300, 0.9)] },
      { name: 'Blizzard', maxLive: 1, rest: [2.0, 3.0], attacks: [A.line('frost_breath', 0.7, 80, 580, 1.1), A.cone('wing_gust', 0.65, 1.6, 320, 1), A.ring('frost_nova', 0.9, 100, 250, 1)] },
      { name: 'Whiteout', maxLive: 2, rest: [1.8, 2.6], attacks: [A.line('frost_breath', 0.65, 80, 600, 1.1), A.cone('wing_gust', 0.6, 1.6, 330, 1), A.ring('frost_nova', 0.85, 100, 260, 1.1), A.spiral('shard_spiral', 0.7, 3, 0.28, 400, 1, 2.4, 0.8)] },
    ] },
    red_titan: { simMul: 26.8, phases: [
      { name: 'Waking', maxLive: 1, rest: [2.5, 3.5], attacks: [A.ring('titan_quake', 0.9, 100, 250, 1), A.line('titan_charge', 0.8, 90, 540, 1)] },
      { name: 'Quaking', maxLive: 1, rest: [2.1, 3.1], attacks: [A.ring('titan_quake', 0.85, 100, 270, 1.1), A.line('titan_charge', 0.7, 90, 560, 1.1), A.cone('arm_sweep', 0.65, 1.6, 320, 1)] },
      { name: 'Meltdown', maxLive: 2, rest: [1.8, 2.7], attacks: [A.ring('titan_quake', 0.85, 100, 280, 1.1), A.line('titan_charge', 0.65, 90, 580, 1.1), A.cone('arm_sweep', 0.6, 1.7, 330, 1), A.spiral('rock_spiral', 0.75, 3, 0.3, 420, 0.8, 2.6, 0.8)] },
    ] },
  };
  function deepFreeze(o) { if (o && typeof o === 'object' && !Object.isFrozen(o)) { Object.freeze(o); Object.values(o).forEach(deepFreeze); } return o; }
  deepFreeze(SCRIPTS);

  const ids = () => Object.keys(SCRIPTS);
  function script(id) { return typeof id === 'string' && hasOwn(SCRIPTS, id) ? SCRIPTS[id] : null; }
  function defOf(id) { return script(id) && MMCreatures ? MMCreatures.get(id) : null; }

  // ---- geometry (angles in radians, 0 = +x; the boss is the zone origin) ----
  function angDiff(a, b) { let d = (a - b) % (Math.PI * 2); if (d > Math.PI) d -= Math.PI * 2; if (d < -Math.PI) d += Math.PI * 2; return Math.abs(d); }
  // Does a live hit zone (a 'hit' event's zone) cover point (x, y)? tau = seconds since it went live (spirals spin).
  function hitTest(z, x, y, tau) {
    if (!z) return false;
    const dx = x - z.x, dy = y - z.y, d = Math.hypot(dx, dy);
    if (z.shape === 'ring') return d >= z.inner && d <= z.outer;
    if (z.shape === 'cone') return d <= z.radius && (d < 1 || angDiff(Math.atan2(dy, dx), z.angle) <= z.arc / 2);
    if (z.shape === 'line') {
      const ca = Math.cos(z.angle), sa = Math.sin(z.angle), along = dx * ca + dy * sa, side = -dx * sa + dy * ca;
      return along >= 0 && along <= z.len && Math.abs(side) <= z.width / 2;
    }
    if (z.shape === 'spiral') {
      if (d > z.radius) return false;
      const base = z.angle + z.spin * fin(tau, 0, 0, 60), step = Math.PI * 2 / z.arms;
      const a = Math.atan2(dy, dx);
      for (let i = 0; i < z.arms; i++) if (angDiff(a, base + i * step) <= z.armHalf) return true;
      return false;
    }
    return false;
  }
  // Fraction of the arena (radius ARENA_R, boss at centre) that a set of zones leaves safe, by grid sampling.
  function safeFraction(zones, tau, grid) {
    const R = K.ARENA_R, n = Math.floor(fin(grid, 28, 6, 64)); let safe = 0, tot = 0;
    for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
      const x = -R + (i + 0.5) * 2 * R / n, y = -R + (j + 0.5) * 2 * R / n;
      if (Math.hypot(x, y) > R) continue;
      tot++;
      if (!zones.some((z) => hitTest(z, x, y, tau || 0))) safe++;
    }
    return tot ? safe / tot : 0;
  }
  const minWindup = (a) => (a.shape === 'ring' && a.slam ? K.MIN_SLAM : K.MIN_WINDUP);

  // ---- state ----
  function init(id, opts) {
    const def = defOf(id);
    if (!def) return null;
    const o = opts && typeof opts === 'object' ? opts : {};
    return {
      v: 1, id: def.id, seed: String(o.seed === undefined ? '' : o.seed).slice(0, 48), n: 0, t: 0,
      hp: def.hp, hpMax: def.hp, phase: 0, st: 'fight', // fight | weary | taming | tamed | dead | escaped
      x: fin(o.x, 0, -1e6, 1e6), y: fin(o.y, 0, -1e6, 1e6), cd: 2.5, last: '', hid: 0, hazards: [], tame: null,
    };
  }
  function clone(s) { return Object.assign({}, s, { hazards: s.hazards.map((h) => Object.assign({}, h)), tame: s.tame ? Object.assign({}, s.tame) : null }); }
  function rngFor(s) { return MMRng.create(s.seed + ':' + s.id + ':' + (s.n++)); }
  const zoneOf = (h) => ({ shape: h.shape, x: h.x, y: h.y, angle: h.angle, width: h.width, len: h.len, inner: h.inner, outer: h.outer, arc: h.arc, radius: h.radius, arms: h.arms, armHalf: h.armHalf, spin: h.spin });
  function describeSafe(h) {
    if (h.shape === 'ring') return 'inside ' + h.inner + ' px or beyond ' + h.outer + ' px';
    if (h.shape === 'line') return 'more than ' + h.width / 2 + ' px off the line';
    if (h.shape === 'cone') return 'outside the ' + Math.round(h.arc * 57.3) + ' degree wedge or beyond ' + h.radius + ' px';
    return 'between the arms (' + h.arms + ' arms, ' + Math.round(h.armHalf * 2 * 57.3) + ' degrees wide each)';
  }
  function spawn(s, atk, hero, events) {
    const h = { id: s.id + '#' + (s.hid++), atk: atk.id, shape: atk.shape, t: 0, windup: atk.windup, dur: atk.dur, live: false, x: s.x, y: s.y,
      angle: r2(Math.atan2(hero.y - s.y, hero.x - s.x)), dmgMul: atk.dmgMul, slam: !!atk.slam };
    ['width', 'len', 'inner', 'outer', 'arc', 'radius', 'arms', 'armHalf', 'spin'].forEach((k) => { if (atk[k] !== undefined) h[k] = atk[k]; });
    s.hazards.push(h);
    events.push({ type: 'telegraph', id: h.id, atk: h.atk, windup: h.windup, zone: zoneOf(h), safe: describeSafe(h) });
  }

  function step(state, input, dt) {
    if (!state || typeof state !== 'object' || !hasOwn(SCRIPTS, state.id) || !Array.isArray(state.hazards)) return { state: state || null, events: [{ type: 'invalid' }] };
    const def = defOf(state.id), sc = script(state.id);
    const s = clone(state), events = [];
    const inp = input && typeof input === 'object' ? input : {};
    const d = fin(dt, 0, 0, K.MAX_DT);
    if (s.st === 'dead' || s.st === 'tamed' || s.st === 'escaped') return { state: s, events };
    s.t = r2(s.t + d);
    const hero = { x: fin(inp.hero && inp.hero.x, s.x + 200, -1e6, 1e6), y: fin(inp.hero && inp.hero.y, s.y, -1e6, 1e6) };

    // 1. damage: a hit from the fight can never skip weary (hp stops just under the weary line)
    const dmg = fin(inp.dmg, 0, 0, 1e7);
    if (dmg > 0 && s.st === 'fight') s.hp = Math.max(s.hpMax * K.WEARY - 0.001, s.hp - dmg);
    else if (dmg > 0 && s.st === 'weary') s.hp -= dmg;
    // 2. phase changes (every crossed phase is reported, in order)
    if (s.st === 'fight') {
      const f = s.hp / s.hpMax, want = f <= K.PHASE3 ? 2 : f <= K.PHASE2 ? 1 : 0;
      while (s.phase < want) { s.phase++; s.cd = Math.max(s.cd, K.PHASE_PAUSE); events.push({ type: 'phase', phase: s.phase, name: sc.phases[s.phase].name }); }
      if (s.hp <= s.hpMax * K.WEARY) {
        s.st = 'weary';
        s.hazards.forEach((h) => events.push({ type: 'cancel', id: h.id }));
        s.hazards = [];
        events.push({ type: 'weary', canTame: !!(def.tame && def.diet.indexOf('feast') >= 0) });
      }
    }
    // 3. weary: a feast begins a boss-tame through MMTame's knockout path; damage kills it normally
    if (s.st === 'weary') {
      if (inp.feast === true && def.tame && def.tame.method === 'knockout' && def.diet.indexOf('feast') >= 0) {
        if (!s.tame) s.tame = MMTame.init(def, { seed: s.seed, wildId: s.id, level: 1 });
        s.st = 'taming'; events.push({ type: 'tame_start' });
      } else if (inp.feast === true) events.push({ type: 'no_tame' });
      if (s.st === 'weary' && s.hp <= 0) { s.st = 'dead'; events.push({ type: 'dead' }); return { state: s, events }; }
    }
    if (s.st === 'taming') {
      const r = MMTame.step(def, s.tame, { torporHit: fin(inp.torporHit, 0, 0, 1e5), dmg: dmg, hpFrac: Math.max(0, s.hp / s.hpMax), offer: inp.offer || null, extend: inp.extend, playerDist: fin(inp.playerDist, 100, 0, 1e6) }, d);
      s.tame = r.state;
      r.events.forEach((e) => events.push({ type: 'tame', ev: e }));
      if (r.state.st === 'tamed') { s.st = 'tamed'; events.push({ type: 'tamed' }); }
      else if (r.state.st === 'dead') { s.st = 'dead'; events.push({ type: 'dead' }); }
      else if (r.state.st === 'escaped') { s.st = 'escaped'; events.push({ type: 'escaped' }); }
      else if (r.state.st === 'wild' && r.events.indexOf('wake') >= 0) { s.st = 'weary'; } // woke up (progress kept by MMTame): weary again, no timer, no punishment
      return { state: s, events };
    }

    // 4. advance live hazards
    if (s.st === 'fight') {
      const keep = [];
      s.hazards.forEach((h) => {
        h.t = r2(h.t + d);
        if (!h.live && h.t >= h.windup) { h.live = true; events.push({ type: 'hit', id: h.id, atk: h.atk, dmg: r2(def.dmg * h.dmgMul), dmgMul: h.dmgMul, once: true, dur: h.dur, zone: zoneOf(h) }); }
        if (h.live && h.t >= h.windup + h.dur) events.push({ type: 'end', id: h.id });
        else keep.push(h);
      });
      s.hazards = keep;
      // 5. pick the next attack (never while weary, never during the phase pause, never above the live cap)
      s.cd = Math.max(0, s.cd - d);
      const ph = sc.phases[s.phase], cap = Math.min(K.MAX_LIVE, ph.maxLive);
      if (s.cd <= 0 && s.hazards.length < cap) {
        const rng = rngFor(s);
        let pool = ph.attacks.filter((a) => a.id !== s.last);
        if (s.hazards.length) { // second hazard: a different shape, never a second spiral
          const live = s.hazards.map((h) => h.shape);
          pool = pool.filter((a) => live.indexOf(a.shape) < 0 && a.shape !== 'spiral');
        }
        if (pool.length) {
          const atk = pool[Math.floor(rng.next() * pool.length)];
          spawn(s, atk, hero, events); s.last = atk.id;
          s.cd = r2(ph.rest[0] + rng.next() * (ph.rest[1] - ph.rest[0]));
        } else s.cd = 0.5;
      }
    }
    return { state: s, events };
  }

  // Self-check used by tests: every attack in every script obeys the fairness rules. Returns a list of problems.
  function audit() {
    const bad = [];
    ids().forEach((id) => SCRIPTS[id].phases.forEach((ph, pi) => {
      if (ph.maxLive > K.MAX_LIVE) bad.push(id + ' p' + pi + ' maxLive');
      ph.attacks.forEach((a) => {
        if (a.windup < minWindup(a)) bad.push(id + ' ' + a.id + ' windup');
        if (a.dmgMul > K.MAX_DMG_MUL) bad.push(id + ' ' + a.id + ' dmgMul');
        if (SHAPES.indexOf(a.shape) < 0) bad.push(id + ' ' + a.id + ' shape');
        if (safeFraction([Object.assign({ x: 0, y: 0, angle: 0 }, a)], 0) < 0.4) bad.push(id + ' ' + a.id + ' safe');
      });
    }));
    return bad;
  }

  return { K, SHAPES, SCRIPTS, ids, script, init, step, hitTest, safeFraction, audit, minWindup, version: 1 };
}));
