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

  const TYPES = {
    ladybug: { points: 10, speed: 0.8, burrower: false },
    butterfly: { points: 15, speed: 1.4, burrower: false },
    beetle: { points: 20, speed: 0.6, burrower: false },
    cricket: { points: 25, speed: 1.8, burrower: false },
    antlion: { points: 30, speed: 0.4, burrower: true },
    goldbeetle: { points: 150, speed: 1.2, burrower: false, rare: true },
    moonwing: { points: 300, speed: 1.6, burrower: false, rare: true, night: true }
  };
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

  function arena(id) { return ARENAS.find((a) => a.id === id) || null; }
  function starsFor(id, score) {
    const a = arena(id); if (!a) return 0;
    let s = 0; for (const t of a.stars) if (score >= t) s++;
    return s;
  }
  // Moonwing only at night
  function canSpawn(type, night) { const t = Object.prototype.hasOwnProperty.call(TYPES, type) ? TYPES[type] : null; return !!t && (!t.night || !!night); }

  // Save shape for `pixeltown-bugs-v1`: {v, stars{arena:0..3}, best{arena:0..99999}, journal{type:0..999999}}.
  // Any input -> a valid save; only known arena / species names survive.
  function clampInt(v, lo, hi) { v = Math.floor(Number(v)); return Number.isFinite(v) ? Math.max(lo, Math.min(hi, v)) : lo; }
  function cleanSave(raw) {
    if (typeof raw === 'string') { try { raw = JSON.parse(raw); } catch (e) { raw = null; } }
    const isO = (v) => !!v && typeof v === 'object' && !Array.isArray(v);
    const own = (o, k) => isO(o) && Object.prototype.hasOwnProperty.call(o, k) ? o[k] : 0;
    if (!isO(raw)) raw = {};
    const out = { v: 1, stars: {}, best: {}, journal: {} };
    ARENAS.forEach((a) => { out.stars[a.id] = clampInt(own(raw.stars, a.id), 0, 3); out.best[a.id] = clampInt(own(raw.best, a.id), 0, 99999); });
    Object.keys(TYPES).forEach((t) => { out.journal[t] = clampInt(own(raw.journal, t), 0, 999999); });
    return out;
  }

  function createRun(opts) {
    opts = opts || {};
    const r = rng(opts.seed === undefined ? 'bugs' : opts.seed);
    const night = !!opts.night;
    const W = opts.width || 20, H = opts.height || 14;
    const run = {
      time: 0, score: 0, caught: 0, combo: 0, lastCatchAt: -1e9, cooldown: 0, rareSpawned: false, done: false,
      player: { x: W / 2, y: H / 2, sneaking: false }, bugs: [], nextId: 1, caughtTypes: []
    };
    function spawn(type, x, y) {
      if (!canSpawn(type, night)) return null;
      const b = { id: run.nextId++, type, x: x === undefined ? r() * W : x, y: y === undefined ? r() * H : y,
        state: 'idle', hideT: 0 };
      run.bugs.push(b); return b;
    }
    const count = opts.count === undefined ? 12 : opts.count;
    if (!opts.empty) for (let i = 0; i < count; i++) spawn(COMMON[Math.floor(r() * COMMON.length)]);

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
        run.caught++; run.caughtTypes.push(b.type);
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
      for (const b of run.bugs) {
        if (b.state === 'caught') continue;
        const t = TYPES[b.type];
        if (b.state === 'hidden') { b.hideT -= dt; if (b.hideT <= 0) b.state = 'idle'; continue; }
        const scared = dist(b, run.player) <= SCARE_TILES && !run.player.sneaking;
        if (scared) {
          if (t.burrower) { b.state = 'hidden'; b.hideT = HIDE_SECONDS; continue; }
          b.state = 'flee';
          const dx = b.x - run.player.x, dy = b.y - run.player.y, L = Math.hypot(dx, dy) || 1;
          b.x += (dx / L) * t.speed * 2.5 * dt; b.y += (dy / L) * t.speed * 2.5 * dt;
        } else if (b.state === 'flee') b.state = 'idle';
      }
      if (run.time >= RUN_SECONDS) { run.time = RUN_SECONDS; run.done = true; }
    }

    return { state: run, spawn, setPlayer, swing, update, stars: () => starsFor(opts.arena, run.score) };
  }

  return { RUN_SECONDS, SWING_COOLDOWN, SCARE_TILES, COMBO_WINDOW, COMBO_MULT, RARE_AT, TYPES, ARENAS, arena, starsFor, canSpawn, createRun, cleanSave };
});
