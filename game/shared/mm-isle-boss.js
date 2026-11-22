// Isle big-creature boss engine (slice X3). Pure, seeded, no DOM / timers / network / Date / Math.random.
// UMD: browser global MMIsleBoss (needs MMRng, MMCreatures, MMTame), or require().
// step(state, input, dt) -> { state, events }. Every call returns a FRESH state; inputs are never mutated.
// Fair-fight rules baked in: every attack is telegraphed for its windup (>= 0.6 s, >= 0.8 s for ground slams),
// at most 2 live hazards (1 in phases 1-2), no enrage timer, no instant kill (one hit per hazard, dmgMul <= 1.2),
// and every attack shape leaves a safe zone.
// XB (NEXT-SLICES-3): one signature mechanic per boss, inside its phase scripts (`sig` on an attack, extra keys on a script):
//   tide_hydra: 3 heads (state.heads, input.head picks one; cut in any order, overflow spills to the next) and a submerged dive
//     whose rising spots are `burst` bubble telegraphs (state.sub while it is under);
//   frost_dragon: a cone breath that leaves `ice_thin` patches (state.ice, footing only, never a hazard) and 2 hot springs
//     (state.springs) that every frost attack leaves out (zone.holes), so standing in a spring is always safe;
//   red_titan: a burrow line (state.dig while it tunnels) and lava vents (`burst` discs around the arena);
//   fernjaw_tyrant: a roar ring that is always followed by a charge line aimed where you stand.
// The tyrant's roar and the dragon's ice breath join from phase 2 on, so a first meeting (phase 1) stays as gentle as before.
// opts.rematch (the home pedestal): the same fight, but it can never be tamed (weary says canTame false, a feast gets no_tame).
// The fairness rules apply to every new attack: windups >= 0.6 s (>= 0.8 s for slams and bursts), the live cap, no enrage.
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
  const EXTRA_SHAPES = ['burst']; // XB: a few discs (bubbles, lava vents); a ground eruption, so it keeps the slam windup
  const TROPHY = { fernjaw_tyrant: 'trophy_tyrant', tide_hydra: 'trophy_hydra', frost_dragon: 'trophy_dragon', red_titan: 'trophy_titan' };
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
    // burst (XB: bubbles / lava vents): `count` discs of radius r, placed around the hero ('hero', `spread` px apart) or the arena
    burst: (id, windup, count, r, at, spread, dmgMul, dur) => ({ id, shape: 'burst', slam: true, windup, count, r, at, spread: spread || 0, dmgMul: dmgMul || 1, dur: dur || 0.45 }),
  };
  const sig = (a, extra) => Object.assign(a, extra); // XB: tag an attack with its signature mechanic

  // ---- phase scripts: phases[0] >70%, phases[1] 35-70%, phases[2] <35%. rest = [min, max] seconds between attacks. ----
  const SCRIPTS = {
    fernjaw_tyrant: { simMul: 13.6, sig: 'roar', hint: 'A roar ring, then a charge along the line where you stood: hug it or step clear, then sidestep.', phases: [
      { name: 'Hunting', maxLive: 1, rest: [2.4, 3.4], attacks: [A.line('tyrant_charge', 0.8, 70, 520, 1), A.cone('tail_lash', 0.7, 1.4, 280, 0.9)] },
      { name: 'Roaring', maxLive: 1, rest: [2.0, 3.0], attacks: [A.line('tyrant_charge', 0.7, 70, 540, 1.1), A.cone('tail_lash', 0.65, 1.6, 300, 1), A.ring('tyrant_stomp', 0.9, 90, 230, 1), sig(A.ring('tyrant_roar', 0.85, 110, 260, 1), { sig: 'roar', next: 'tyrant_charge' })] },
      { name: 'Frenzied', maxLive: 2, rest: [1.8, 2.6], attacks: [A.line('tyrant_charge', 0.65, 70, 560, 1.1), A.cone('tail_lash', 0.6, 1.6, 300, 1), A.ring('tyrant_stomp', 0.85, 90, 240, 1.1), A.spiral('roar_spiral', 0.7, 3, 0.3, 380, 0.9, 2.4, 0.8), sig(A.ring('tyrant_roar', 0.8, 110, 260, 1), { sig: 'roar', next: 'tyrant_charge' })] },
    ] },
    tide_hydra: { simMul: 16.3, sig: 'heads', heads: 3, hint: 'Three heads: cut them in any order. When it dives, step off the bubbles before it rises.', phases: [
      { name: 'Surfacing', maxLive: 1, rest: [2.5, 3.5], attacks: [A.cone('head_snap', 0.7, 1.3, 290, 0.9), A.line('water_jet', 0.8, 60, 560, 1)] },
      { name: 'Many heads', maxLive: 1, rest: [2.1, 3.1], attacks: [A.cone('head_snap', 0.65, 1.5, 300, 1), A.line('water_jet', 0.7, 60, 580, 1.1), A.ring('tidal_slam', 0.9, 100, 240, 1), sig(A.burst('bubble_rise', 0.9, 3, 62, 'hero', 130, 1, 0.45), { sig: 'submerge' })] },
      { name: 'Maelstrom', maxLive: 2, rest: [1.8, 2.7], attacks: [A.cone('head_snap', 0.6, 1.5, 310, 1), A.line('water_jet', 0.65, 60, 600, 1.1), A.ring('tidal_slam', 0.85, 100, 250, 1.1), A.spiral('whirlpool', 0.75, 4, 0.22, 400, 0.8, 2.6, 0.8), sig(A.burst('bubble_rise', 0.85, 3, 62, 'hero', 130, 1.1, 0.45), { sig: 'submerge' })] },
    ] },
    frost_dragon: { simMul: 22, sig: 'ice', springs: { n: 2, dist: 240, r: 54 }, hint: 'Its cone breath leaves thin ice. The two hot springs are always safe: stand in one.', phases: [
      { name: 'Circling', maxLive: 1, rest: [2.4, 3.4], attacks: [A.line('frost_breath', 0.8, 80, 560, 1), A.cone('wing_gust', 0.7, 1.5, 300, 0.9)] },
      { name: 'Blizzard', maxLive: 1, rest: [2.0, 3.0], attacks: [A.line('frost_breath', 0.7, 80, 580, 1.1), A.cone('wing_gust', 0.65, 1.6, 320, 1), A.ring('frost_nova', 0.9, 100, 250, 1), sig(A.cone('frost_cone', 0.75, 1.2, 330, 1, 0.4), { sig: 'ice', ttl: 6 })] },
      { name: 'Whiteout', maxLive: 2, rest: [1.8, 2.6], attacks: [A.line('frost_breath', 0.65, 80, 600, 1.1), A.cone('wing_gust', 0.6, 1.6, 330, 1), A.ring('frost_nova', 0.85, 100, 260, 1.1), A.spiral('shard_spiral', 0.7, 3, 0.28, 400, 1, 2.4, 0.8), sig(A.cone('frost_cone', 0.7, 1.2, 340, 1, 0.4), { sig: 'ice', ttl: 6 })] },
    ] },
    red_titan: { simMul: 26.8, sig: 'burrow', hint: 'It burrows along a marked line, and lava vents glow before they erupt. Step off both.', phases: [
      { name: 'Waking', maxLive: 1, rest: [2.5, 3.5], attacks: [A.ring('titan_quake', 0.9, 100, 250, 1), A.line('titan_charge', 0.8, 90, 540, 1), sig(A.line('titan_burrow', 0.9, 80, 520, 1, 0.5), { sig: 'burrow' })] },
      { name: 'Quaking', maxLive: 1, rest: [2.1, 3.1], attacks: [A.ring('titan_quake', 0.85, 100, 270, 1.1), A.line('titan_charge', 0.7, 90, 560, 1.1), A.cone('arm_sweep', 0.65, 1.6, 320, 1), sig(A.line('titan_burrow', 0.85, 80, 540, 1, 0.5), { sig: 'burrow' }), sig(A.burst('lava_vents', 0.9, 3, 58, 'arena', 0, 1, 0.6), { sig: 'vents' })] },
      { name: 'Meltdown', maxLive: 2, rest: [1.8, 2.7], attacks: [A.ring('titan_quake', 0.85, 100, 280, 1.1), A.line('titan_charge', 0.65, 90, 580, 1.1), A.cone('arm_sweep', 0.6, 1.7, 330, 1), A.spiral('rock_spiral', 0.75, 3, 0.3, 420, 0.8, 2.6, 0.8), sig(A.burst('lava_vents', 0.85, 3, 58, 'arena', 0, 1.1, 0.6), { sig: 'vents' })] },
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
    if (Array.isArray(z.holes)) for (let i = 0; i < z.holes.length; i++) { const h = z.holes[i]; if (Math.hypot(x - h.x, y - h.y) <= h.r) return false; } // XB hot springs
    const dx = x - z.x, dy = y - z.y, d = Math.hypot(dx, dy);
    if (z.shape === 'burst') { const p = Array.isArray(z.pts) ? z.pts : []; for (let i = 0; i < p.length; i++) if (Math.hypot(dx - p[i].dx, dy - p[i].dy) <= z.r) return true; return false; }
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
  const minWindup = (a) => ((a.shape === 'ring' && a.slam) || a.shape === 'burst' ? K.MIN_SLAM : K.MIN_WINDUP);
  // XB: where a burst's discs go (offsets from the boss). 'hero': one on you, the rest `spread` px around you; 'arena': spread over the
  // band 110-330 px out. Seeded by the caller's rng; every disc stays inside the arena.
  function burstPts(atk, bx, by, hero, rng) {
    const pts = [], R = K.ARENA_R - atk.r;
    const clampIn = (dx, dy) => { const d = Math.hypot(dx, dy); return d > R ? { dx: r2(dx * R / d), dy: r2(dy * R / d) } : { dx: r2(dx), dy: r2(dy) }; };
    if (atk.at === 'hero') {
      const hx = hero.x - bx, hy = hero.y - by, a0 = rng.next() * Math.PI * 2;
      pts.push(clampIn(hx, hy));
      for (let i = 1; i < atk.count; i++) { const a = a0 + i * Math.PI * 2 / (atk.count - 1 || 1); pts.push(clampIn(hx + Math.cos(a) * atk.spread, hy + Math.sin(a) * atk.spread)); }
    } else {
      const a0 = rng.next() * Math.PI * 2;
      for (let i = 0; i < atk.count; i++) { const a = a0 + i * Math.PI * 2 / atk.count + (rng.next() - 0.5) * 0.6, d = 110 + rng.next() * 220; pts.push(clampIn(Math.cos(a) * d, Math.sin(a) * d)); }
    }
    return pts;
  }
  // XB: the frost dragon's hot springs, seeded from the fight seed (no attack rng is used)
  function springsFor(sc, seed, id, x, y) {
    if (!sc.springs) return null;
    const rng = MMRng.create(seed + ':' + id + ':springs'), a0 = rng.next() * Math.PI * 2, out = [];
    for (let i = 0; i < sc.springs.n; i++) { const a = a0 + i * Math.PI * 2 / sc.springs.n; out.push({ x: r2(x + Math.cos(a) * sc.springs.dist), y: r2(y + Math.sin(a) * sc.springs.dist), r: sc.springs.r }); }
    return out;
  }

  // ---- state ----
  function init(id, opts) {
    const def = defOf(id);
    if (!def) return null;
    const o = opts && typeof opts === 'object' ? opts : {};
    const sc = script(id), seed = String(o.seed === undefined ? '' : o.seed).slice(0, 48), x = fin(o.x, 0, -1e6, 1e6), y = fin(o.y, 0, -1e6, 1e6);
    return {
      v: 1, id: def.id, seed: seed, n: 0, t: 0,
      hp: def.hp, hpMax: def.hp, phase: 0, st: 'fight', // fight | weary | taming | tamed | dead | escaped
      x: x, y: y, cd: 2.5, last: '', hid: 0, hazards: [], tame: null,
      // XB: heads (hydra), springs + ice (dragon), sub / dig (diving / burrowing), queue (the tyrant's charge after a roar), rematch
      heads: sc.heads ? Array.from({ length: sc.heads }, () => r2(def.hp * (1 - K.WEARY) / sc.heads)) : null,
      springs: springsFor(sc, seed, def.id, x, y), ice: [], sub: false, dig: false, queue: '', rematch: o.rematch === true,
    };
  }
  function clone(s) {
    return Object.assign({}, s, { hazards: s.hazards.map((h) => Object.assign({}, h)), tame: s.tame ? Object.assign({}, s.tame) : null,
      heads: Array.isArray(s.heads) ? s.heads.slice() : null, springs: Array.isArray(s.springs) ? s.springs.map((p) => Object.assign({}, p)) : null,
      ice: Array.isArray(s.ice) ? s.ice.map((p) => Object.assign({}, p)) : [] });
  }
  function rngFor(s) { return MMRng.create(s.seed + ':' + s.id + ':' + (s.n++)); }
  const zoneOf = (h) => {
    const z = { shape: h.shape, x: h.x, y: h.y, angle: h.angle, width: h.width, len: h.len, inner: h.inner, outer: h.outer, arc: h.arc, radius: h.radius, arms: h.arms, armHalf: h.armHalf, spin: h.spin };
    if (h.pts) { z.pts = h.pts.map((p) => ({ dx: p.dx, dy: p.dy })); z.r = h.r; }
    if (h.holes) z.holes = h.holes.map((p) => ({ x: p.x, y: p.y, r: p.r }));
    if (h.sig) z.sig = h.sig;
    return z;
  };
  function describeSafe(h) {
    if (h.shape === 'ring') return 'inside ' + h.inner + ' px or beyond ' + h.outer + ' px';
    if (h.shape === 'line') return 'more than ' + h.width / 2 + ' px off the line';
    if (h.shape === 'cone') return 'outside the ' + Math.round(h.arc * 57.3) + ' degree wedge or beyond ' + h.radius + ' px';
    if (h.shape === 'burst') return 'outside the ' + h.pts.length + ' circles (' + h.r + ' px each)';
    return 'between the arms (' + h.arms + ' arms, ' + Math.round(h.armHalf * 2 * 57.3) + ' degrees wide each)';
  }
  function spawn(s, atk, hero, events) {
    const h = { id: s.id + '#' + (s.hid++), atk: atk.id, shape: atk.shape, t: 0, windup: atk.windup, dur: atk.dur, live: false, x: s.x, y: s.y,
      angle: r2(Math.atan2(hero.y - s.y, hero.x - s.x)), dmgMul: atk.dmgMul, slam: !!atk.slam };
    ['width', 'len', 'inner', 'outer', 'arc', 'radius', 'arms', 'armHalf', 'spin', 'r', 'sig', 'ttl'].forEach((k) => { if (atk[k] !== undefined) h[k] = atk[k]; });
    if (atk.shape === 'burst') h.pts = burstPts(atk, s.x, s.y, hero, rngFor(s));
    if (s.springs) h.holes = s.springs.map((p) => ({ x: p.x, y: p.y, r: p.r }));
    s.hazards.push(h);
    const tg = { type: 'telegraph', id: h.id, atk: h.atk, windup: h.windup, zone: zoneOf(h), safe: describeSafe(h) };
    if (h.sig) tg.sig = h.sig;
    events.push(tg);
    if (h.sig === 'submerge' && !s.sub) { s.sub = true; events.push({ type: 'submerge', id: h.id }); }
    if (h.sig === 'burrow' && !s.dig) { s.dig = true; events.push({ type: 'dig', id: h.id, zone: zoneOf(h) }); }
    if (atk.next) s.queue = atk.next;
  }
  // XB: a hazard that leaves the field (end / cancel) brings a diving or burrowing boss back up
  function settle(s, h, events) {
    if (h.sig === 'submerge' && s.sub && !s.hazards.some((o) => o !== h && o.sig === 'submerge')) { s.sub = false; events.push({ type: 'surface', id: h.id }); }
    if (h.sig === 'burrow' && s.dig && !s.hazards.some((o) => o !== h && o.sig === 'burrow')) { s.dig = false; events.push({ type: 'rise', id: h.id }); }
  }
  // XB: hydra heads. `dealt` HP goes to the chosen head (input.head, else the first one left); overflow spills to the next head left.
  function cutHeads(s, dealt, want, events) {
    if (!s.heads || dealt <= 0) return;
    let left = dealt, guard = 0;
    let i = Number.isInteger(want) && want >= 0 && want < s.heads.length && s.heads[want] > 0 ? want : s.heads.findIndex((h) => h > 0);
    while (left > 1e-9 && i >= 0 && guard++ < 8) {
      const take = Math.min(left, s.heads[i]);
      s.heads[i] = r2(s.heads[i] - take); left -= take;
      if (s.heads[i] <= 0.001) { s.heads[i] = 0; events.push({ type: 'head_cut', head: i, left: s.heads.filter((h) => h > 0).length }); }
      i = s.heads.findIndex((h) => h > 0);
    }
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
    if (dmg > 0 && s.st === 'fight') { const hp0 = s.hp; s.hp = Math.max(s.hpMax * K.WEARY - 0.001, s.hp - dmg); cutHeads(s, hp0 - s.hp, inp.head, events); }
    else if (dmg > 0 && s.st === 'weary') s.hp -= dmg;
    // 2. phase changes (every crossed phase is reported, in order)
    if (s.st === 'fight') {
      const f = s.hp / s.hpMax, want = f <= K.PHASE3 ? 2 : f <= K.PHASE2 ? 1 : 0;
      while (s.phase < want) { s.phase++; s.cd = Math.max(s.cd, K.PHASE_PAUSE); events.push({ type: 'phase', phase: s.phase, name: sc.phases[s.phase].name }); }
      if (s.hp <= s.hpMax * K.WEARY) {
        s.st = 'weary';
        s.hazards.forEach((h) => events.push({ type: 'cancel', id: h.id }));
        s.hazards.slice().forEach((h) => settle(s, h, events));
        s.hazards = []; s.queue = '';
        if (s.heads) s.heads.forEach((h, i) => { if (h > 0) { s.heads[i] = 0; events.push({ type: 'head_cut', head: i, left: s.heads.filter((v) => v > 0).length }); } });
        s.ice.forEach((p) => events.push({ type: 'thaw', id: p.id }));
        s.ice = [];
        events.push({ type: 'weary', canTame: !s.rematch && !!(def.tame && def.diet.indexOf('feast') >= 0) });
      }
    }
    // 3. weary: a feast begins a boss-tame through MMTame's knockout path; damage kills it normally
    if (s.st === 'weary') {
      if (inp.feast === true && !s.rematch && def.tame && def.tame.method === 'knockout' && def.diet.indexOf('feast') >= 0) {
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
        if (!h.live && h.t >= h.windup) {
          h.live = true; events.push({ type: 'hit', id: h.id, atk: h.atk, dmg: r2(def.dmg * h.dmgMul), dmgMul: h.dmgMul, once: true, dur: h.dur, zone: zoneOf(h) });
          if (h.sig === 'ice') { // the breath leaves thin ice where it blew (at most 2 patches; footing only, never damage)
            const z = zoneOf(h); delete z.holes;
            s.ice.push({ id: h.id, zone: z, ttl: h.ttl || 6 });
            while (s.ice.length > K.MAX_LIVE) events.push({ type: 'thaw', id: s.ice.shift().id });
            events.push({ type: 'ice', id: h.id, tile: 'ice_thin', zone: z, ttl: h.ttl || 6, springs: (s.springs || []).map((p) => ({ x: p.x, y: p.y, r: p.r })) });
          }
        }
        if (h.live && h.t >= h.windup + h.dur) { events.push({ type: 'end', id: h.id }); settle(s, h, events); }
        else keep.push(h);
      });
      s.hazards = keep;
      if (s.ice.length) s.ice = s.ice.filter((p) => { p.ttl = r2(p.ttl - d); if (p.ttl > 0) return true; events.push({ type: 'thaw', id: p.id }); return false; });
      // 5. pick the next attack (never while weary, never during the phase pause, never above the live cap)
      s.cd = Math.max(0, s.cd - d);
      const ph = sc.phases[s.phase], cap = Math.min(K.MAX_LIVE, ph.maxLive);
      if (s.cd <= 0 && s.hazards.length < cap) {
        const rng = rngFor(s);
        let pool = ph.attacks.filter((a) => a.id !== s.last);
        const live = s.hazards.map((h) => h.shape);
        if (s.hazards.length) pool = pool.filter((a) => live.indexOf(a.shape) < 0 && a.shape !== 'spiral'); // second hazard: a different shape, never a second spiral
        const q = s.queue ? ph.attacks.find((a) => a.id === s.queue && (!s.hazards.length || (live.indexOf(a.shape) < 0 && a.shape !== 'spiral'))) : null;
        s.queue = '';
        if (q) pool = [q]; // XB: the tyrant's roar is always answered by its charge
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
        if (SHAPES.indexOf(a.shape) < 0 && EXTRA_SHAPES.indexOf(a.shape) < 0) bad.push(id + ' ' + a.id + ' shape');
        const z = Object.assign({ x: 0, y: 0, angle: 0 }, a);
        if (a.shape === 'burst') z.pts = burstPts(a, 0, 0, { x: 200, y: 0 }, MMRng.create('audit:' + a.id));
        if (safeFraction([z], 0) < 0.4) bad.push(id + ' ' + a.id + ' safe');
        if (a.sig && ['roar', 'submerge', 'ice', 'burrow', 'vents'].indexOf(a.sig) < 0) bad.push(id + ' ' + a.id + ' sig');
      });
    }));
    return bad;
  }

  // XB: trophies (MMIsleCraft trophy_* recipes) <-> bosses, the per-boss signature hint, and the signatures each script carries
  const trophyFor = (id) => (typeof id === 'string' && hasOwn(TROPHY, id) ? TROPHY[id] : '');
  const bossForTrophy = (t) => ids().find((id) => TROPHY[id] === t) || '';
  const hint = (id) => (script(id) ? script(id).hint : '');
  const signatures = (id) => { const sc = script(id); if (!sc) return []; const out = []; sc.phases.forEach((p) => p.attacks.forEach((a) => { if (a.sig && out.indexOf(a.sig) < 0) out.push(a.sig); })); return out; };

  return { K, SHAPES, EXTRA_SHAPES, SCRIPTS, TROPHY, ids, script, init, step, hitTest, safeFraction, audit, minWindup, burstPts, trophyFor, bossForTrophy, hint, signatures, version: 2 };
}));
