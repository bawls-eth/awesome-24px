// MMDifficulty: pure, deterministic difficulty curve for the Realm. UMD: browser global MMDifficulty, or require(). No DOM, no clock, no randomness.
// Three curves, each returns {hp, dmg, spd, count, fire} MULTIPLIERS (1 = today's numbers) that wiring applies AT SPAWN TIME on top of the
// existing stat tables (MMZones.statMultipliers for the world, MMEnemies.plan for dungeons, realm.js wave scaling for the arena):
//   zoneScale(zone, distFromCentre, opts)            overworld creature, shore (easy) -> godlands (lethal)
//   dungeonScale(biome, roomIndex, roomsTotal, isBoss, opts)   dungeon enemy, early rooms (easy) -> boss (hard), warren < bramble < meadow < crypt
//   waveScale(wave, opts)                            classic arena wave 1 -> 30+
// opts.mode 'picnic' ('Careful' mode in MMProfile) makes damage x0.8. Every output is clamped to CLAMP and every input is sanitised (NaN, strings,
// negatives, unknown zone/biome never throw). Monotonic: harder zone / deeper room / later wave never yields a lower hp, dmg or spd multiplier.
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.MMDifficulty = factory();
}(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  const VERSION = 1;
  const PLAYER_HP_L1 = 100, PLAYER_HP_PER_LEVEL = 8, PLAYER_MAX_LEVEL = 20; // mirror realm.js RM_PLAYER.hp / RM_HP_PER_LEVEL / RM_MAX_LEVEL
  const BOLT_DAMAGE = 8;       // realm.js RM_ENEMY_BULLET_DAMAGE: one bolt at dmg multiplier 1
  const BOLT_CAP = 40;         // the arena never needs more than this many bolts from one volley
  const TABLES = {
    // knots at q = 0..4, where q = zone + s and s is 0 on the zone's outer (coast) edge, 1 on its inner edge (so q runs coast -> centre)
    ZONE_KNOTS: {
      hp:    [0.60, 0.70, 0.85, 1.00, 1.15],   // shore creatures have 60% hp at the coast
      dmg:   [0.70, 0.80, 0.95, 1.10, 1.20],   // shore bolt = round(8 * 0.8) = 6 <= 6% of a level-1 hero's 100 hp
      spd:   [0.85, 0.92, 1.00, 1.06, 1.12],
      count: [0.60, 0.80, 1.00, 1.20, 1.40],
      fire:  [0.80, 0.90, 1.00, 1.10, 1.20],
    },
    BANDS: [{ min: 0.68, max: 0.97 }, { min: 0.40, max: 0.68 }, { min: 0.20, max: 0.40 }, { min: 0.00, max: 0.20 }], // MMOverworld.ZONE_BANDS_CLASSIC (dw units)
    BANDS_WIDE: [{ min: 0.62, max: 0.97 }, { min: 0.34, max: 0.62 }, { min: 0.17, max: 0.34 }, { min: 0.00, max: 0.17 }], // MMOverworld.ZONE_BANDS_WIDE (opts.bands 'wide')
    EASY_ROOMS: 3,                               // the first three dungeon rooms are weak
    ROOM_EASY: { hp: [0.60, 0.65, 0.70], dmg: [0.70, 0.75, 0.80], spd: [0.85, 0.88, 0.90], count: [0.60, 0.70, 0.80], fire: [0.80, 0.85, 0.90] },
    ROOM_END: { hp: 1.40, dmg: 1.25, spd: 1.12, count: 1.30, fire: 1.25 },   // last room before the boss
    BOSS_EXTRA: { hp: 1.20, dmg: 1.10, spd: 1.00, count: 1.00, fire: 1.10 },
    BIOME: {                                      // warren easiest .. crypt hardest
      warren:  { hp: 1.00, dmg: 1.00, spd: 1.00, count: 1.00, fire: 1.00 },
      bramble: { hp: 1.10, dmg: 1.05, spd: 1.02, count: 1.05, fire: 1.05 },
      meadow:  { hp: 1.25, dmg: 1.12, spd: 1.05, count: 1.10, fire: 1.10 },
      crypt:   { hp: 1.40, dmg: 1.20, spd: 1.08, count: 1.15, fire: 1.15 },
    },
    WAVE_START: { hp: 0.70, dmg: 0.80, spd: 0.90, count: 0.70, fire: 0.85 },  // wave 1
    WAVE_END:   { hp: 1.60, dmg: 1.40, spd: 1.20, count: 1.40, fire: 1.30 },  // wave WAVE_SPAN and later
    WAVE_SPAN: 30,
    PICNIC_DMG: 0.8,
    // overworld hero (world mode only; never the classic arena, dungeons or duels): realm attunement so a level-1 hero's 7.5 bolts/s
    // (1 dmg each) kill a 6-12 hp shore creature in about a second (12 dps) instead of ~2 s. Flat, so levelling never lowers it.
    HERO_WORLD: { dmg: 1.6, rate: 1.0 },
    CLAMP: { hp: [0.4, 4.0], dmg: [0.5, 2.0], spd: [0.7, 1.4], count: [0.5, 1.6], fire: [0.7, 1.5] },
  };
  const T = TABLES;
  const KEYS = ['hp', 'dmg', 'spd', 'count', 'fire'];

  function num(v, d) { v = typeof v === 'string' && v.trim() !== '' ? Number(v) : v; return typeof v === 'number' && isFinite(v) ? v : d; }
  function clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }
  function round3(v) { return Math.round(v * 1000) / 1000; }
  function lerp(a, b, t) { return a + (b - a) * t; }
  function picnic(opts) { return !!opts && opts.mode === 'picnic'; }
  function finish(raw, opts) {
    const out = {};
    for (let i = 0; i < KEYS.length; i++) {
      const k = KEYS[i]; let v = raw[k];
      if (k === 'dmg' && picnic(opts)) v *= T.PICNIC_DMG;
      out[k] = round3(clamp(v, T.CLAMP[k][0], T.CLAMP[k][1]));
    }
    return out;
  }
  function knot(arr, q) { const i = Math.min(arr.length - 2, Math.max(0, Math.floor(q))); return lerp(arr[i], arr[i + 1], q - i); }

  // zone 0..3 (anything else -> nearest valid; non-numeric -> shore). distFromCentre is the normalised radius dw (0 = realm centre, ~1 = coast);
  // missing / hostile -> the middle of the zone. Continuous across zone borders: the same dist in the outer zone and the inner one meet at the knot.
  function zoneScale(zone, distFromCentre, opts) {
    let z = Math.floor(num(zone, 0)); z = z < 0 ? 0 : z > 3 ? 3 : z;
    const b = (opts && opts.bands === 'wide' ? T.BANDS_WIDE : T.BANDS)[z], d = num(distFromCentre, NaN);
    const s = d === d ? clamp((b.max - d) / (b.max - b.min), 0, 1) : 0.5;
    const raw = {}; for (let i = 0; i < KEYS.length; i++) raw[KEYS[i]] = knot(T.ZONE_KNOTS[KEYS[i]], z + s);
    return finish(raw, opts);
  }

  // roomIndex is 1-based progress through the run (1 = first room), roomsTotal the number of rooms on the way (boss room last).
  function dungeonScale(biome, roomIndex, roomsTotal, isBoss, opts) {
    const bm = T.BIOME[typeof biome === 'string' && Object.prototype.hasOwnProperty.call(T.BIOME, biome) ? biome : 'warren'];
    const n = Math.max(1, Math.floor(num(roomsTotal, 1)));
    const i = clamp(Math.floor(num(roomIndex, 1)), 1, n);
    const raw = {};
    for (let k = 0; k < KEYS.length; k++) {
      const key = KEYS[k]; let v;
      if (i <= T.EASY_ROOMS) v = T.ROOM_EASY[key][i - 1];
      else {
        const e = T.ROOM_EASY[key][T.EASY_ROOMS - 1];
        const t = n <= T.EASY_ROOMS ? 1 : (i - T.EASY_ROOMS) / (n - T.EASY_ROOMS);
        v = lerp(e, T.ROOM_END[key], t);   // 0.70 -> 1.40 hp across the remaining rooms
      }
      raw[key] = v * bm[key] * (isBoss ? T.BOSS_EXTRA[key] : 1);
    }
    return finish(raw, opts);
  }

  function waveScale(wave, opts) {
    const w = Math.max(1, Math.floor(num(wave, 1)));
    const t = Math.min(1, (w - 1) / (T.WAVE_SPAN - 1));
    const raw = {}; for (let i = 0; i < KEYS.length; i++) raw[KEYS[i]] = lerp(T.WAVE_START[KEYS[i]], T.WAVE_END[KEYS[i]], t);
    return finish(raw, opts);
  }

  // hero multipliers for the overworld (wiring: realm.js _calcStats in world mode only; ?difficulty=off = 1x). Same for picnic.
  function heroScale() { return { dmg: T.HERO_WORLD.dmg, rate: T.HERO_WORLD.rate }; }

  // helpers the guarantees are stated with
  function heroHp(level) { return PLAYER_HP_L1 + PLAYER_HP_PER_LEVEL * (clamp(Math.floor(num(level, 1)), 1, PLAYER_MAX_LEVEL) - 1); }
  function boltDamage(dmgMul) { return Math.max(1, Math.round(BOLT_DAMAGE * clamp(num(dmgMul, 1), 0, 1000))); }
  function capBolts(n) { return clamp(Math.round(num(n, 1)), 1, BOLT_CAP); }
  // the "?difficulty=off" switch: pass location.search
  function isOff(search) { return /[?&]difficulty=off(&|$)/.test(String(search || '')); }
  const IDENTITY = Object.freeze({ hp: 1, dmg: 1, spd: 1, count: 1, fire: 1 });

  return { VERSION, TABLES, KEYS, BOLT_CAP, BOLT_DAMAGE, IDENTITY, zoneScale, dungeonScale, waveScale, heroScale, heroHp, boltDamage, capBolts, isOff };
}));
