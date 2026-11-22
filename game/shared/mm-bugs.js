// MMBugs: Bug Safari 90 s run logic. Pure and time-stepped; the caller draws and feeds input.
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.MMBugs = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  const RUN_SECONDS = 90;
  const SWING_COOLDOWN = 0.35;
  const SCARE_TILES = 3;
  const CATCH_RADIUS = 1.2;
  const COMBO_WINDOW = 2;
  const COMBO_MULT = 1.2;
  const COMBO_CAP = 6;
  const RARE_AT = 30;
  const HIDE_SECONDS = 2;
  const FLUSH_RADIUS = 1.6;   // walking this close flushes a bug out of a flower patch
  const BURROW_RADIUS = 3;    // a burrower surfaces only when you stand still this close
  const STILL_SECONDS = 0.6;  // how long you must stand still
  const FLEE_SECONDS = 1.2;   // flushed and swarm bugs keep running this long

  const TYPES = {
    ladybug: { points: 10, speed: 0.8, burrower: false },
    butterfly: { points: 15, speed: 1.4, burrower: false },
    beetle: { points: 20, speed: 0.6, burrower: false },
    cricket: { points: 25, speed: 1.8, burrower: false },
    antlion: { points: 30, speed: 0.4, burrower: true },
    goldbeetle: { points: 150, speed: 1.2, burrower: false, rare: true },
    moonwing: { points: 300, speed: 1.6, burrower: false, rare: true, night: true },
    // MG1 night glade band (additive): only spawn in the glade. A firefly dims and drifts off if you walk up fast; sneak up slowly.
    firefly: { points: 20, speed: 0.7, burrower: false, glade: true, wary: true },
    glowmoth: { points: 35, speed: 1.1, burrower: false, glade: true }
  };
  const BASE_SPECIES = ['ladybug', 'butterfly', 'beetle', 'cricket', 'antlion', 'goldbeetle', 'moonwing'];
  const GLADE_SPECIES = ['firefly', 'glowmoth'];
  const WARY_RADIUS = 3.5;   // a firefly notices a fast walker this close
  const DIM_SECONDS = 1.5;   // and stays dim (not catchable) this long
  const GLADE_FIREFLIES = 4, GLADE_MOTHS = 2;
  const COMMON = ['ladybug', 'butterfly', 'beetle', 'cricket', 'antlion'];

  // 8 arenas; stars at score thresholds [1 star, 2 stars, 3 stars]
  const ARENAS = [
    { id: 'meadow', stars: [60, 120, 200] },
    { id: 'orchard', stars: [80, 150, 240] },
    { id: 'pond', stars: [90, 170, 270] },
    { id: 'forest', stars: [100, 190, 300] },
    { id: 'dunes', stars: [110, 210, 330] },
    { id: 'cliffs', stars: [120, 230, 360] },
    { id: 'marsh', stars: [130, 250, 390] },
    { id: 'lantern', stars: [150, 280, 430], night: true }
  ];
  // MG1 additive band: arena variants. The Night Glade is a variant of Lantern Glade with its own bugs; it opens by stars
  // like every arena (never by time). ALL_ARENAS = ARENAS then VARIANTS (unlock order).
  const VARIANTS = [
    { id: 'glade', stars: [140, 260, 400], night: true, glade: true, variant: 'lantern' }
  ];
  const ALL_ARENAS = ARENAS.concat(VARIANTS);

  // MG1 journal goals: 3 calm "things to find" per arena, checked at the end of a normal run. Done goals stay done forever.
  // k: catch (n of sp), sneak (n of sp while sneaking), combo (reach n), total (n bugs), flower (n flushed from flowers)
  const GOALS = {
    meadow: [{ id: 'm1', k: 'catch', sp: 'ladybug', n: 3, text: 'Catch 3 ladybugs' }, { id: 'm2', k: 'sneak', sp: 'cricket', n: 3, text: 'Catch 3 crickets sneaking' }, { id: 'm3', k: 'flower', n: 1, text: 'Net a bug that hid in a flower' }],
    orchard: [{ id: 'o1', k: 'catch', sp: 'butterfly', n: 3, text: 'Catch 3 butterflies' }, { id: 'o2', k: 'combo', n: 3, text: 'Reach a 3 catch combo' }, { id: 'o3', k: 'total', n: 8, text: 'Catch 8 bugs in one visit' }],
    pond: [{ id: 'p1', k: 'catch', sp: 'beetle', n: 3, text: 'Catch 3 beetles' }, { id: 'p2', k: 'sneak', sp: 'butterfly', n: 2, text: 'Catch 2 butterflies sneaking' }, { id: 'p3', k: 'combo', n: 3, text: 'Reach a 3 catch combo' }],
    forest: [{ id: 'f1', k: 'catch', sp: 'antlion', n: 2, text: 'Lure out 2 antlions' }, { id: 'f2', k: 'total', n: 10, text: 'Catch 10 bugs in one visit' }, { id: 'f3', k: 'sneak', sp: 'beetle', n: 3, text: 'Catch 3 beetles sneaking' }],
    dunes: [{ id: 'd1', k: 'catch', sp: 'antlion', n: 3, text: 'Lure out 3 antlions' }, { id: 'd2', k: 'catch', sp: 'cricket', n: 4, text: 'Catch 4 crickets' }, { id: 'd3', k: 'combo', n: 4, text: 'Reach a 4 catch combo' }],
    cliffs: [{ id: 'c1', k: 'catch', sp: 'butterfly', n: 4, text: 'Catch 4 butterflies' }, { id: 'c2', k: 'sneak', sp: 'ladybug', n: 4, text: 'Catch 4 ladybugs sneaking' }, { id: 'c3', k: 'total', n: 12, text: 'Catch 12 bugs in one visit' }],
    marsh: [{ id: 'h1', k: 'catch', sp: 'beetle', n: 4, text: 'Catch 4 beetles' }, { id: 'h2', k: 'flower', n: 2, text: 'Net 2 bugs that hid in flowers' }, { id: 'h3', k: 'combo', n: 4, text: 'Reach a 4 catch combo' }],
    lantern: [{ id: 'l1', k: 'catch', sp: 'moonwing', n: 1, text: 'Find the Moonwing' }, { id: 'l2', k: 'sneak', sp: 'cricket', n: 4, text: 'Catch 4 crickets sneaking' }, { id: 'l3', k: 'total', n: 12, text: 'Catch 12 bugs in one visit' }],
    glade: [{ id: 'g1', k: 'catch', sp: 'firefly', n: 3, text: 'Catch 3 fireflies (walk up slowly)' }, { id: 'g2', k: 'catch', sp: 'glowmoth', n: 2, text: 'Catch 2 glowmoths' }, { id: 'g3', k: 'total', n: 10, text: 'Catch 10 bugs in one visit' }]
  };
  function goalsFor(id) { return Object.prototype.hasOwnProperty.call(GOALS, id) ? GOALS[id] : []; }
  // Which goals of `arenaId` a finished (or running) run state meets. Pure.
  function goalsMet(arenaId, st) {
    const log = (st && Array.isArray(st.catchLog)) ? st.catchLog : [];
    return goalsFor(arenaId).filter((g) => {
      if (g.k === 'catch') return log.filter((c) => c.type === g.sp).length >= g.n;
      if (g.k === 'sneak') return log.filter((c) => c.type === g.sp && c.sneak).length >= g.n;
      if (g.k === 'combo') return (st.bestCombo || 0) >= g.n;
      if (g.k === 'total') return log.length >= g.n;
      if (g.k === 'flower') return log.filter((c) => c.flushed).length >= g.n;
      return false;
    }).map((g) => g.id);
  }
  // Goals save `pixeltown-bugs-goals-v1` = {v:1, done:{arena:[goalId...]}}. Any input -> valid; only known ids survive.
  function cleanGoals(raw) {
    if (typeof raw === 'string') { try { raw = JSON.parse(raw); } catch (e) { raw = null; } }
    const done = raw && typeof raw === 'object' && !Array.isArray(raw) && raw.done && typeof raw.done === 'object' && !Array.isArray(raw.done) ? raw.done : {};
    const out = { v: 1, done: {} };
    Object.keys(GOALS).forEach((a) => {
      const list = Object.prototype.hasOwnProperty.call(done, a) && Array.isArray(done[a]) ? done[a] : [];
      const ok = GOALS[a].map((g) => g.id);
      out.done[a] = ok.filter((id) => list.indexOf(id) >= 0);
    });
    return out;
  }
  function goalStars(goals) { const g = cleanGoals(goals); return Object.keys(g.done).reduce((n, a) => n + g.done[a].length, 0); }
  const GOAL_COUNT = Object.keys(GOALS).reduce((n, a) => n + GOALS[a].length, 0);
  // Hub medals for `pixeltown-medals-bugs-v1` = {v:1, m:[...]}: from the cleaned save + goals.
  const MEDAL_IDS = ['first_catch', 'species7', 'stars10', 'moonwing'];
  function medalsFor(save, goals) {
    const s = cleanSave(save), j = s.journal;
    const stars = ALL_ARENAS.reduce((n, a) => n + s.stars[a.id], 0) + goalStars(goals);
    const m = [];
    if (Object.keys(j).some((k) => j[k] > 0)) m.push('first_catch');
    if (BASE_SPECIES.every((k) => j[k] > 0)) m.push('species7');
    if (stars >= 10) m.push('stars10');
    if (j.moonwing > 0) m.push('moonwing');
    return m;
  }

  function rng(seed) {
    let h = 2166136261 >>> 0;
    const str = String(seed);
    for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; }
    return function () {
      h = (h + 0x6D2B79F5) >>> 0;
      let t = h;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function arena(id) { return ALL_ARENAS.find((a) => a.id === id) || null; }
  function starsFor(id, score) {
    const a = arena(id); if (!a) return 0;
    let s = 0; for (const t of a.stars) if (score >= t) s++;
    return s;
  }
  // Moonwing only at night; glade bugs only in the Night Glade
  function canSpawn(type, night, glade) { const t = Object.prototype.hasOwnProperty.call(TYPES, type) ? TYPES[type] : null; return !!t && (!t.night || !!night) && (!t.glade || !!glade); }

  // Save shape for `pixeltown-bugs-v1`: {v, stars{arena:0..3}, best{arena:0..99999}, journal{type:0..999999}}.
  // Any input -> a valid save; only known arena / species names survive. stars/best also hold the MG1 variants (glade); journal holds the glade bugs.
  function clampInt(v, lo, hi) { v = Math.floor(Number(v)); return Number.isFinite(v) ? Math.max(lo, Math.min(hi, v)) : lo; }
  function cleanSave(raw) {
    if (typeof raw === 'string') { try { raw = JSON.parse(raw); } catch (e) { raw = null; } }
    const isO = (v) => !!v && typeof v === 'object' && !Array.isArray(v);
    const own = (o, k) => isO(o) && Object.prototype.hasOwnProperty.call(o, k) ? o[k] : 0;
    if (!isO(raw)) raw = {};
    const out = { v: 1, stars: {}, best: {}, journal: {} };
    ALL_ARENAS.forEach((a) => { out.stars[a.id] = clampInt(own(raw.stars, a.id), 0, 3); out.best[a.id] = clampInt(own(raw.best, a.id), 0, 99999); });
    Object.keys(TYPES).forEach((t) => { out.journal[t] = clampInt(own(raw.journal, t), 0, 999999); });
    return out;
  }

  function createRun(opts) {
    opts = opts || {};
    const r = rng(opts.seed === undefined ? 'bugs' : opts.seed);
    const night = !!opts.night, glade = !!opts.glade;
    const W = opts.width || 20, H = opts.height || 14;
    const run = {
      time: 0, score: 0, caught: 0, combo: 0, bestCombo: 0, stillT: 0, flowers: [], nextGroup: 1, lastCatchAt: -1e9, cooldown: 0, rareSpawned: false, done: false,
      player: { x: W / 2, y: H / 2, sneaking: false }, bugs: [], nextId: 1, caughtTypes: [], catchLog: []
    };
    // o.mound: a burrower that stays underground until you stand still near it; o.flower: hides in a flower patch.
    function spawn(type, x, y, o) {
      if (!canSpawn(type, night, glade)) return null;
      o = o || {};
      const b = { id: run.nextId++, type, x: x === undefined ? r() * W : x, y: y === undefined ? r() * H : y,
        state: 'idle', hideT: 0, hideKind: null, group: 0, fleeT: 0, mound: false };
      if (o.mound && TYPES[type].burrower) { b.mound = true; b.state = 'hidden'; b.hideKind = 'burrow'; }
      if (o.flower) { b.state = 'hidden'; b.hideKind = 'flower'; run.flowers.push({ x: b.x, y: b.y }); }
      run.bugs.push(b); return b;
    }
    function hideInFlower(type, x, y) { return spawn(type, x, y, { flower: true }); }
    // A few bugs that move as one and scatter together.
    function spawnSwarm(type, x, y, n) {
      const gid = run.nextGroup++, out = [];
      for (let i = 0; i < (n || 3); i++) {
        const b = spawn(type, x + (i % 2) * 0.5, y + (i >> 1) * 0.5);
        if (b) { b.group = gid; out.push(b); }
      }
      return out;
    }
    const count = opts.count === undefined ? 12 : opts.count;
    if (!opts.empty) {
      let left = count;
      if (count >= 8) {
        for (let i = 0; i < 2; i++) { hideInFlower(i ? 'butterfly' : 'ladybug', 2 + r() * (W - 4), 2 + r() * (H - 4)); left--; }
        const sx = 2 + r() * (W - 4), sy = 2 + r() * (H - 4);
        spawnSwarm('ladybug', sx, sy, 3); left -= 3;
      }
      if (glade) {
        for (let i = 0; i < GLADE_FIREFLIES; i++) spawn('firefly', 1 + r() * (W - 2), 1 + r() * (H - 2));
        for (let i = 0; i < GLADE_MOTHS; i++) spawn('glowmoth', 1 + r() * (W - 2), 1 + r() * (H - 2));
        left = Math.max(0, left - GLADE_FIREFLIES - GLADE_MOTHS);
      }
      for (let i = 0; i < left; i++) { const t = COMMON[Math.floor(r() * COMMON.length)]; spawn(t, undefined, undefined, { mound: true }); }
    }

    const lastP = { x: run.player.x, y: run.player.y };
    const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

    function setPlayer(x, y, sneaking) { run.player.x = x; run.player.y = y; run.player.sneaking = !!sneaking; }

    function swing() {
      if (run.done || run.cooldown > 0) return { swung: false, caught: [] };
      run.cooldown = SWING_COOLDOWN;
      const hit = [];
      for (const b of run.bugs) {
        if (b.state === 'hidden' || b.state === 'caught') continue;
        if (dist(b, run.player) <= CATCH_RADIUS) hit.push(b);
      }
      for (const b of hit) {
        b.state = 'caught';
        run.combo = (run.time - run.lastCatchAt <= COMBO_WINDOW) ? run.combo + 1 : 1;
        run.lastCatchAt = run.time;
        const mult = Math.pow(COMBO_MULT, Math.min(run.combo, COMBO_CAP) - 1);
        run.score += TYPES[b.type].points * mult;
        run.bestCombo = Math.max(run.bestCombo, run.combo);
        run.caught++; run.caughtTypes.push(b.type);
        run.catchLog.push({ type: b.type, sneak: !!run.player.sneaking, flushed: !!b.flushed });
      }
      run.score = Math.round(run.score * 100) / 100;
      return { swung: true, caught: hit.map((b) => b.id) };
    }

    function update(dt) {
      if (run.done) return;
      run.time += dt;
      run.cooldown = Math.max(0, run.cooldown - dt);
      if (run.time - run.lastCatchAt > COMBO_WINDOW) run.combo = 0;
      if (!run.rareSpawned && run.time >= RARE_AT) {
        run.rareSpawned = true;
        spawn(night ? 'moonwing' : 'goldbeetle');
      }
      const moved = Math.hypot(run.player.x - lastP.x, run.player.y - lastP.y) > 0.001;
      lastP.x = run.player.x; lastP.y = run.player.y;
      run.stillT = moved ? 0 : run.stillT + dt;
      const sneaking = run.player.sneaking;
      const scaredGroups = {};
      for (const b of run.bugs) if (b.group && b.state !== 'caught' && b.state !== 'hidden' && dist(b, run.player) <= SCARE_TILES && !sneaking) scaredGroups[b.group] = true;
      const runAway = (b, sp, dt2, spread) => {
        let dx = b.x - run.player.x, dy = b.y - run.player.y;
        const L = Math.hypot(dx, dy) || 1, ang = Math.atan2(dy, dx) + (spread ? ((b.id % 5) - 2) * 0.25 : 0);
        b.x += Math.cos(ang) * sp * 2.5 * dt2; b.y += Math.sin(ang) * sp * 2.5 * dt2; void L;
      };
      for (const b of run.bugs) {
        if (b.state === 'caught') continue;
        const t = TYPES[b.type];
        if (t.wary) {
          // Firefly: a fast walker nearby makes it dim (uncatchable) and drift; sneaking or standing still never does.
          if (b.state === 'hidden' && b.hideKind === 'dim') {
            b.hideT -= dt; runAway(b, t.speed * 0.4, dt, false);
            if (b.hideT <= 0) { b.state = 'idle'; b.hideKind = null; }
          } else if (moved && !sneaking && dist(b, run.player) <= WARY_RADIUS) {
            b.state = 'hidden'; b.hideKind = 'dim'; b.hideT = DIM_SECONDS; b.dimmed = (b.dimmed || 0) + 1;
          } else if (b.state === 'flee') b.state = 'idle';
          continue;
        }
        if (b.state === 'hidden') {
          const d = dist(b, run.player);
          if (b.hideKind === 'flower') {
            if (d <= FLUSH_RADIUS) { b.state = 'flee'; b.hideKind = null; b.fleeT = FLEE_SECONDS; b.flushed = true; }
          } else if (b.hideKind === 'burrow') {
            if (d <= BURROW_RADIUS && run.stillT >= STILL_SECONDS) { b.state = 'idle'; b.hideKind = null; }
          } else { b.hideT -= dt; if (b.hideT <= 0) b.state = 'idle'; }
          continue;
        }
        if (b.fleeT > 0) { b.fleeT -= dt; b.state = 'flee'; runAway(b, t.speed, dt, !!b.group); if (b.fleeT <= 0) b.state = 'idle'; continue; }
        if (b.mound && (dist(b, run.player) > BURROW_RADIUS + 0.5 || (moved && !sneaking))) { b.state = 'hidden'; b.hideKind = 'burrow'; continue; }
        const scared = (dist(b, run.player) <= SCARE_TILES && !sneaking) || (b.group && scaredGroups[b.group]);
        if (scared) {
          if (t.burrower && !b.mound) { b.state = 'hidden'; b.hideT = HIDE_SECONDS; b.hideKind = null; continue; }
          b.state = 'flee';
          if (b.group) b.fleeT = FLEE_SECONDS;
          runAway(b, t.speed, dt, !!b.group);
        } else if (b.state === 'flee') b.state = 'idle';
      }
      if (run.time >= RUN_SECONDS) { run.time = RUN_SECONDS; run.done = true; }
    }

    return { state: run, spawn, spawnSwarm, hideInFlower, setPlayer, swing, update, stars: () => starsFor(opts.arena, run.score) };
  }

  return { BASE_SPECIES, GLADE_SPECIES, WARY_RADIUS, DIM_SECONDS, GOALS, GOAL_COUNT, goalsFor, goalsMet, cleanGoals, goalStars, MEDAL_IDS, medalsFor, RUN_SECONDS, SWING_COOLDOWN, SCARE_TILES, FLUSH_RADIUS, BURROW_RADIUS, STILL_SECONDS, FLEE_SECONDS, COMBO_WINDOW, COMBO_MULT, RARE_AT, TYPES, ARENAS, VARIANTS, ALL_ARENAS, arena, starsFor, canSpawn, createRun, cleanSave };
});
