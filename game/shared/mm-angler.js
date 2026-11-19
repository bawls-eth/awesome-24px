// Lakeside Angler core (pure, no DOM). UMD: browser global MMAngler, or require().
// 48 fish, spot pools, weighted rolls, reel tension model, bosses, bite timing, journal.
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.MMAngler = factory();
}(typeof self !== 'undefined' ? self : this, function () {
  const SPOTS = ['west', 'east', 'river', 'pier', 'ice', 'mangrove'];
  const SPOT_NAMES = { west: 'West Pond', east: 'East Pond', river: 'River Run', pier: 'Sea Pier', ice: 'Ice Hole', mangrove: 'Mangrove' };
  const ICE_MONTHS = [12, 1, 2];
  const RATES = { hold: 1.2, release: 1.6, fill: 0.25, drain: 0.15, snapLimit: 1.0, bossSnapLimit: 1.5 };
  const BITE = { windowSec: 1.0, minWait: 1.5, maxWait: 4.5 };
  const SEASONS = ['winter', 'spring', 'summer', 'autumn'];

  // [id, icon, name, rarity, spots, behaviour, extras]
  // extras: seasons, time, weather ('rain' = only in rain), rain (boost), boss, secret, size [min,max]
  const T = [
    // 12 existing species (ids kept)
    ['minnow', '🐟', 'Minnow', 1, 'west,east,river', 'darter', { size: [4, 9] }],
    ['shrimp', '🦐', 'Shrimp', 1, 'west,east,pier,mangrove', 'darter', { size: [3, 8] }],
    ['frog', '🐸', 'Pond Frog', 1, 'west,mangrove', 'zigzag', { seasons: ['spring', 'summer'], size: [6, 14] }],
    ['koi', '🐠', 'Koi', 2, 'west', 'calm', { size: [30, 70] }],
    ['puffer', '🐡', 'Pufferfish', 2, 'east,pier', 'calm', { size: [15, 35] }],
    ['crab', '🦀', 'Mud Crab', 2, 'pier,mangrove', 'sinker', { time: 'night', size: [10, 25] }],
    ['turtle', '🐢', 'Snapping Turtle', 2, 'east,mangrove', 'sinker', { time: 'day', size: [25, 60] }],
    ['squid', '🦑', 'Squid', 3, 'pier', 'darter', { time: 'night', size: [20, 70] }],
    ['jelly', '🪼', 'Jellyfish', 3, 'pier', 'calm', { seasons: ['summer'], size: [10, 40] }],
    ['octopus', '🐙', 'Octopus', 3, 'east,pier', 'zigzag', { time: 'night', size: [30, 90] }],
    ['shark', '🦈', 'Baby Shark', 4, 'pier', 'darter', { time: 'day', seasons: ['summer', 'autumn'], size: [60, 130] }],
    ['goldfish', '✨', 'Golden Fish', 4, 'west,ice', 'zigzag', { seasons: ['winter'], size: [15, 30] }],
    // 36 new
    ['bluegill', '🐟', 'Bluegill', 1, 'west,east', 'calm', { size: [10, 25] }],
    ['sunfish', '🐟', 'Sunfish', 1, 'west', 'calm', { size: [8, 20] }],
    ['perch', '🐟', 'Perch', 2, 'west,east', 'zigzag', { size: [15, 40] }],
    ['carp', '🐟', 'Common Carp', 2, 'west,east', 'sinker', { size: [35, 90] }],
    ['bullhead', '🐟', 'Bullhead', 2, 'west,east', 'sinker', { time: 'night', size: [20, 45] }],
    ['pond_eel', '🐍', 'Pond Eel', 3, 'east', 'zigzag', { time: 'night', size: [40, 100] }],
    ['pike', '🐟', 'Northern Pike', 3, 'east', 'darter', { rain: true, size: [50, 120] }],
    ['old_whiskers', '🐱', 'Old Whiskers', 5, 'east', 'boss', { boss: true, time: 'night', size: [110, 160] }],
    ['chub', '🐟', 'Chub', 1, 'river', 'calm', { rain: true, size: [15, 35] }],
    ['crayfish', '🦞', 'Crayfish', 1, 'river', 'sinker', { size: [6, 15] }],
    ['river_trout', '🐟', 'River Trout', 2, 'river', 'darter', { size: [20, 55] }],
    ['grayling', '🐟', 'Grayling', 2, 'river', 'zigzag', { seasons: ['autumn', 'winter'], size: [25, 45] }],
    ['smallmouth', '🐟', 'Smallmouth Bass', 2, 'river', 'darter', { size: [25, 50] }],
    ['salmon', '🍣', 'Salmon', 3, 'river', 'zigzag', { seasons: ['autumn'], size: [50, 100] }],
    ['sturgeon', '🐟', 'Sturgeon', 4, 'river', 'sinker', { time: 'night', size: [90, 200] }],
    ['golden_trout', '🌟', 'Golden River Trout', 5, 'river', 'darter', { secret: true, time: 'day', size: [30, 50] }],
    ['sardine', '🐟', 'Sardine', 1, 'pier', 'darter', { size: [8, 20] }],
    ['mackerel', '🐟', 'Mackerel', 2, 'pier', 'darter', { size: [25, 45] }],
    ['sea_bass', '🐟', 'Sea Bass', 2, 'pier', 'calm', { size: [30, 80] }],
    ['flounder', '🐟', 'Flounder', 2, 'pier', 'sinker', { size: [25, 60] }],
    ['seahorse', '🐴', 'Seahorse', 3, 'pier,mangrove', 'calm', { size: [8, 20] }],
    ['stingray', '🐟', 'Stingray', 3, 'pier', 'sinker', { time: 'day', size: [50, 120] }],
    ['tuna', '🐟', 'Tuna', 4, 'pier', 'darter', { time: 'day', seasons: ['summer'], size: [80, 180] }],
    ['pier_kraken', '🦑', 'Pier Kraken', 5, 'pier', 'boss', { boss: true, time: 'night', size: [200, 400] }],
    ['ice_smelt', '🐟', 'Ice Smelt', 1, 'ice', 'darter', { size: [8, 18] }],
    ['ice_perch', '🐟', 'Ice Perch', 1, 'ice', 'calm', { size: [12, 28] }],
    ['arctic_char', '🐟', 'Arctic Char', 2, 'ice', 'zigzag', { size: [25, 60] }],
    ['burbot', '🐟', 'Burbot', 3, 'ice', 'sinker', { time: 'night', size: [40, 90] }],
    ['glass_fish', '💎', 'Glass Fish', 3, 'ice', 'calm', { size: [10, 22] }],
    ['ice_queen_pike', '👑', 'Ice Queen Pike', 5, 'ice', 'boss', { boss: true, size: [120, 190] }],
    ['mudskipper', '🐟', 'Mudskipper', 1, 'mangrove', 'zigzag', { size: [8, 20] }],
    ['archerfish', '🐟', 'Archerfish', 2, 'mangrove', 'darter', { size: [12, 28] }],
    ['mangrove_snapper', '🐟', 'Mangrove Snapper', 2, 'mangrove', 'calm', { size: [25, 60] }],
    ['barramundi', '🐟', 'Barramundi', 3, 'mangrove', 'zigzag', { size: [50, 120] }],
    ['tarpon', '🐟', 'Tarpon', 4, 'mangrove', 'darter', { weather: 'rain', size: [90, 200] }],
    ['glow_eel', '🐍', 'Glow Eel', 4, 'mangrove', 'zigzag', { time: 'night', size: [50, 110] }],
  ];
  const FISH = T.map((r) => Object.assign({
    id: r[0], icon: r[1], name: r[2], rarity: r[3], spots: r[4].split(','), behaviour: r[5],
  }, r[6] || {}));
  const BY_ID = Object.create(null);
  FISH.forEach((f) => { BY_ID[f.id] = f; });
  const EXISTING_IDS = T.slice(0, 12).map((r) => r[0]);

  const RODS = {
    stick: { id: 'stick', zone: 0.28 },
    bamboo: { id: 'bamboo', zone: 0.33 },
    steel: { id: 'steel', zone: 0.39 },
    golden: { id: 'golden', zone: 0.44 },
  };
  const LURES = {
    none: { id: 'none' },
    worm: { id: 'worm', mult: (f) => (f.rarity <= 2 ? 1.6 : 1) },
    spinner: { id: 'spinner', mult: (f) => (f.behaviour === 'darter' ? 2 : 1) },
    glow: { id: 'glow', mult: (f) => (f.time === 'night' ? 2.5 : 1) },
    deep: { id: 'deep', mult: (f) => (f.behaviour === 'sinker' ? 2.5 : 1) },
    shiny: { id: 'shiny', mult: (f) => (f.rarity >= 4 ? 3 : f.rarity === 3 ? 1.8 : 1) },
    rainbow: { id: 'rainbow', mult: (f) => (f.rain || f.weather === 'rain' ? 3 : 1.2) },
  };
  const RARITY_WEIGHT = { 1: 50, 2: 28, 3: 14, 4: 6, 5: 2 };

  function seasonOf(month) { return month === 12 || month <= 2 ? 'winter' : month <= 5 ? 'spring' : month <= 8 ? 'summer' : 'autumn'; }
  function timeOf(hour) { return hour >= 19 || hour < 6 ? 'night' : 'day'; }
  function iceOpen(month) { return ICE_MONTHS.indexOf(month) >= 0; }

  // ctx: {month 1-12, hour 0-23, weather 'rain'|'clear'|..., secret: bool}
  function pool(spot, ctx, opts) {
    ctx = ctx || {}; opts = opts || {};
    if (SPOTS.indexOf(spot) < 0) return [];
    const month = ctx.month || 6;
    if (spot === 'ice' && !iceOpen(month)) return [];
    const season = seasonOf(month), tm = timeOf(ctx.hour === undefined ? 12 : ctx.hour);
    return FISH.filter((f) => {
      if (f.spots.indexOf(spot) < 0) return false;
      if (f.boss && !opts.bosses) return false;
      if (f.secret && !ctx.secret) return false;
      if (f.seasons && f.seasons.indexOf(season) < 0) return false;
      if (f.time && f.time !== tm) return false;
      if (f.weather && f.weather !== ctx.weather) return false;
      return true;
    });
  }
  function weightOf(f, ctx, gear) {
    gear = gear || {};
    let w = RARITY_WEIGHT[f.rarity] || 1;
    if (f.rain && ctx && ctx.weather === 'rain') w *= 1.8;
    const lure = LURES[gear.lure];
    if (lure && lure.mult) w *= lure.mult(f);
    if (gear.bait && f.rarity >= 2) w *= 1.2;
    return w;
  }
  function rollFish(rng, spot, ctx, gear) {
    const p = pool(spot, ctx);
    if (!p.length) return null;
    const ws = p.map((f) => weightOf(f, ctx, gear));
    let total = 0; ws.forEach((w) => { total += w; });
    let r = rng() * total;
    for (let i = 0; i < p.length; i++) { r -= ws[i]; if (r < 0) return p[i]; }
    return p[p.length - 1];
  }
  function rollSize(rng, fish) {
    const s = fish.size || [10, 30];
    return Math.round(s[0] + rng() * (s[1] - s[0]));
  }

  // seeded rng for fish paths (mulberry32)
  function seedRng(seed) {
    let a = (seed === undefined ? 1 : Math.floor(Number(seed))) >>> 0 || 1;
    return function () {
      a = (a + 0x6D2B79F5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  // ---- bosses ----
  const BOSSES = {
    old_whiskers: {
      id: 'old_whiskers', snapLimit: RATES.bossSnapLimit, duelSec: [30, 60],
      phases: [
        { from: 0, behaviour: 'calm', speed: 0.35 },
        { from: 0.34, behaviour: 'darter', speed: 0.6 },
        { from: 0.67, behaviour: 'zigzag', speed: 0.9 },
      ],
      showTensionRed: true,
    },
    pier_kraken: {
      id: 'pier_kraken', snapLimit: RATES.bossSnapLimit, duelSec: [30, 60],
      phases: [{ from: 0, behaviour: 'zigzag', speed: 0.6 }, { from: 0.5, behaviour: 'darter', speed: 0.8 }],
      sidePull: { amp: 0.8, period: 4 },
    },
    ice_queen_pike: {
      id: 'ice_queen_pike', snapLimit: RATES.bossSnapLimit, duelSec: [30, 60],
      phases: [{ from: 0, behaviour: 'darter', speed: 0.7 }, { from: 0.5, behaviour: 'zigswap', speed: 1.0 }],
      zoneShrinkAt: 0.5,
    },
  };

  // ---- reel model ----
  // Positions are 0..1 on the bar. Tension is the catch-zone centre: rises 120%/s
  // held, falls 160%/s released. At max tension a snap timer runs.
  const BEHAVIOUR_SPEED = { calm: 0.18, darter: 0.7, sinker: 0.3, zigzag: 0.45, zigswap: 0.5 };
  function create(fish, rod, opts) {
    opts = opts || {};
    if (typeof fish === 'string') fish = BY_ID[fish];
    fish = fish || FISH[0];
    const rodDef = (typeof rod === 'string' ? RODS[rod] : rod) || RODS.stick;
    const boss = BOSSES[fish.id] || null;
    const rng = seedRng(opts.seed);
    const baseZone = Math.min(1, rodDef.zone * (opts.calm ? 1.3 : 1));
    const snapLimit = boss ? boss.snapLimit : (fish.snapLimit || RATES.snapLimit);
    const s = {
      fish: fish.id, boss: !!boss, tension: 0.5, meter: 0.25, pos: 0.5, side: 0,
      zone: baseZone, atMax: 0, snapLimit, time: 0, status: 'reeling', phase: 0,
      _target: 0.5, _hold: 0, _dir: 1,
    };
    function behaviourNow() {
      if (!boss) return { behaviour: fish.behaviour, speed: 1 };
      let ph = boss.phases[0], idx = 0;
      boss.phases.forEach((p, i) => { if (s.meter >= p.from) { ph = p; idx = i; } });
      s.phase = idx;
      return ph;
    }
    function moveFish(dt) {
      const ph = behaviourNow();
      let b = ph.behaviour;
      if (b === 'zigswap') b = Math.floor(s.time / 2) % 2 ? 'zigzag' : 'darter';
      if (b === 'boss') b = 'zigzag';
      const sp = (BEHAVIOUR_SPEED[b] || 0.3) * (boss ? ph.speed + 0.3 : 1);
      if (b === 'calm') {
        s._target = 0.5 + 0.35 * Math.sin(s.time * 0.9 + 1);
        s.pos += (s._target - s.pos) * Math.min(1, dt * 2);
      } else if (b === 'darter') {
        s._hold -= dt;
        if (s._hold <= 0) { s._target = 0.05 + rng() * 0.9; s._hold = 0.4 + rng() * 0.9; }
        const d = s._target - s.pos, step = sp * 2.2 * dt;
        s.pos += Math.abs(d) <= step ? d : Math.sign(d) * step;
      } else if (b === 'sinker') {
        s._hold -= dt;
        if (s._hold <= 0) { s._dir = rng() < 0.3 ? 1 : -1; s._hold = 0.6 + rng() * 1.2; }
        s.pos += s._dir * sp * dt * (s._dir < 0 ? 1.4 : 1);
      } else { // zigzag
        s._hold -= dt;
        if (s._hold <= 0) { s._dir = s._dir > 0 ? -1 : 1; s._hold = 0.5 + rng() * 0.7; }
        s.pos += s._dir * sp * 1.6 * dt;
      }
      if (s.pos < 0) { s.pos = 0; s._dir = 1; }
      if (s.pos > 1) { s.pos = 1; s._dir = -1; }
    }
    function inZone() { return Math.abs(s.pos - s.tension) <= s.zone / 2; }
    s.tick = function (dt, holding) {
      if (s.status !== 'reeling' || !(dt > 0)) return s;
      s.time += dt;
      s.tension += (holding ? RATES.hold : -RATES.release) * dt;
      s.tension = Math.max(0, Math.min(1, s.tension));
      moveFish(dt);
      s.zone = boss && boss.zoneShrinkAt && s.meter >= boss.zoneShrinkAt ? baseZone * 0.8 : baseZone;
      if (boss && boss.sidePull) s.side = boss.sidePull.amp * Math.sin((s.time / boss.sidePull.period) * Math.PI * 2);
      if (s.tension >= 1) s.atMax += dt; else s.atMax = 0;
      if (s.atMax > s.snapLimit + 1e-9) { s.status = 'snapped'; return s; }
      s.meter += (inZone() ? RATES.fill : -RATES.drain) * dt;
      s.meter = Math.max(0, Math.min(1, s.meter));
      if (s.meter >= 1) s.status = 'caught';
      return s;
    };
    s.inZone = inZone;
    return s;
  }

  // ---- bite timing ----
  // hidden wait, then a ~1 s window. Pressing early spooks the fish.
  function bite(rng) {
    rng = rng || Math.random;
    const wait = BITE.minWait + rng() * (BITE.maxWait - BITE.minWait);
    const b = { wait, window: BITE.windowSec, t: 0, state: 'waiting' };
    b.tick = function (dt) {
      if (b.state === 'waiting' || b.state === 'biting') {
        b.t += dt;
        if (b.t >= b.wait + b.window) b.state = 'missed';
        else if (b.t >= b.wait) b.state = 'biting';
      }
      return b.state;
    };
    b.press = function () {
      if (b.state === 'waiting') { b.state = 'spooked'; return 'spooked'; }
      if (b.state === 'biting') { b.state = 'hooked'; return 'hooked'; }
      return b.state;
    };
    return b;
  }

  // ---- journal: {caught: {id: {n, best}}, bosses: {id: true}, trophies: {id: true}, gear: {rod, lure}, bait: 0-99} ----
  // Gear unlocks by journal milestones (species caught / trophies). Own rule, shown on the page.
  const GEAR_RULES = {
    rod: { stick: { species: 0 }, bamboo: { species: 5 }, steel: { species: 12 }, golden: { trophies: 1 } },
    lure: { none: { species: 0 }, worm: { species: 2 }, spinner: { species: 4 }, deep: { species: 7 }, glow: { species: 10 }, shiny: { species: 16 }, rainbow: { species: 22 } },
  };
  // Boss lairs: which spot, and how many species of that spot must be in the journal first.
  const BOSS_SPOTS = { west: { boss: 'old_whiskers', need: 4 }, pier: { boss: 'pier_kraken', need: 5 }, ice: { boss: 'ice_queen_pike', need: 3 } };
  function clampInt(v, lo, hi) { v = Math.floor(Number(v)); return isFinite(v) ? Math.max(lo, Math.min(hi, v)) : lo; }
  function ownKey(o, k) { return Object.prototype.hasOwnProperty.call(o, k); }
  function trophyCount(j) { return Object.keys(j.trophies || {}).length; }
  function gearUnlocked(journal, kind, id) {
    const j = clean(journal), r = GEAR_RULES[kind] && ownKey(GEAR_RULES[kind], id) ? GEAR_RULES[kind][id] : null;
    if (!r) return false;
    return Object.keys(j.caught).length >= (r.species || 0) && trophyCount(j) >= (r.trophies || 0);
  }
  function spotSpecies(journal, spot) {
    const j = clean(journal);
    return Object.keys(j.caught).filter((id) => !BY_ID[id].boss && BY_ID[id].spots.indexOf(spot) >= 0).length;
  }
  function bossFor(journal, spot) {
    const b = ownKey(BOSS_SPOTS, spot) ? BOSS_SPOTS[spot] : null;
    if (!b) return null;
    const have = spotSpecies(journal, spot);
    return { boss: b.boss, need: b.need, have, ready: have >= b.need };
  }
  function clean(raw) {
    let o = raw;
    if (typeof raw === 'string') { try { o = JSON.parse(raw); } catch (e) { o = null; } }
    const out = { caught: {}, bosses: {}, trophies: {}, gear: { rod: 'stick', lure: 'none' }, bait: 0 };
    if (!o || typeof o !== 'object' || Array.isArray(o)) return out;
    const c = o.caught && typeof o.caught === 'object' ? o.caught : {};
    Object.keys(c).forEach((id) => {
      if (!BY_ID[id] || !c[id] || typeof c[id] !== 'object') return;
      const n = clampInt(c[id].n, 0, 99999);
      if (n < 1) return;
      out.caught[id] = { n, best: clampInt(c[id].best, 0, 9999) };
    });
    const b = o.bosses && typeof o.bosses === 'object' ? o.bosses : {};
    Object.keys(b).forEach((id) => { if (ownKey(BOSSES, id) && b[id] === true) out.bosses[id] = true; });
    const t = o.trophies && typeof o.trophies === 'object' ? o.trophies : {};
    Object.keys(t).forEach((id) => { if (ownKey(BOSSES, id) && t[id] === true) out.trophies[id] = true; });
    const g = o.gear && typeof o.gear === 'object' ? o.gear : {};
    if (typeof g.rod === 'string' && ownKey(RODS, g.rod)) out.gear.rod = g.rod;
    if (typeof g.lure === 'string' && ownKey(LURES, g.lure)) out.gear.lure = g.lure;
    out.bait = clampInt(o.bait, 0, 99);
    return out;
  }
  function addTrophy(journal, bossId) {
    const j = clean(journal);
    if (ownKey(BOSSES, bossId)) j.trophies[bossId] = true;
    return j;
  }
  function record(journal, fishId, size) {
    const j = clean(journal);
    if (!BY_ID[fishId]) return j;
    const e = j.caught[fishId] || { n: 0, best: 0 };
    e.n = Math.min(99999, e.n + 1);
    e.best = Math.max(e.best, clampInt(size, 0, 9999));
    j.caught[fishId] = e;
    if (Object.prototype.hasOwnProperty.call(BOSSES, fishId)) j.bosses[fishId] = true;
    return j;
  }
  function serialize(journal) { return JSON.stringify(clean(journal)); }
  function speciesCount(journal) { return Object.keys(clean(journal).caught).length; }

  return {
    SPOTS, SPOT_NAMES, ICE_MONTHS, RATES, BITE, SEASONS, FISH, BY_ID, EXISTING_IDS, RODS, LURES, BOSSES,
    seasonOf, timeOf, iceOpen, pool, weightOf, rollFish, rollSize, seedRng,
    reel: { create },
    bite, journal: { clean, record, serialize, speciesCount, addTrophy, gearUnlocked, bossFor, trophyCount }, clean, serialize,
    GEAR_RULES, BOSS_SPOTS,
  };
}));
