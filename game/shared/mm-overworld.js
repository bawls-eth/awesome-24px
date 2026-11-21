// MMOverworld: pure, deterministic generator for the unified Realm overworld (256x256 tiles by default).
// UMD: browser global MMOverworld, or require(). No DOM, no unseeded randomness: every random choice comes from MMRng (shared/rng.js)
// streams or a coordinate hash seeded from the world seed. Same seed + opts => byte-identical world.
// See game/design/REALM-UNIFIED-DESIGN.md. Typed arrays are row-major: index = y * w + x.
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./rng.js'), function () { try { return require('./mm-biome-packs.js'); } catch (e) { return null; } });
  else root.MMOverworld = factory(root.MMRng, function () { return root.MMBiomePacks || null; });
}(typeof self !== 'undefined' ? self : this, function (MMRng, biomePacks) {
  'use strict';
  const VERSION = 1;

  // ---- terrain ids (match the Codex art ids) ----
  const TERRAIN = {
    deep_water: 0, shallow_water: 1, sand: 2, wet_sand: 3, grass: 4, tall_grass: 5, dirt_road: 6, flower_meadow: 7,
    highland_rock: 8, gravel: 9, dry_grass: 10, snow: 11, stone_road: 12, cracked_stone: 13, godland_ash: 14,
    blood_ruins: 15, dark_grass: 16, lava_rock: 17,
  };
  // biome-pack terrain (BIOME-ARCH-PLAN 1.2 rule 1): APPEND-ONLY ids from 18 up. Never reorder, rename or insert: ids 0..17 above and every id
  // here are stored in worlds and art manifests. TERRAIN keeps the 18 realm ids; TERRAIN_ALL / TERRAIN_NAMES also hold these.
  const TERRAIN_EXT_NAMES = [
    'tilled_soil', 'tilled_wet', 'clover_patch', 'garden_path', // 18..21 meadow (Hearth Isle)
    'jungle_floor', 'jungle_moss', 'fern_thicket', 'mud', 'mud_deep', 'river_murk', 'black_sand', 'temple_stone', 'temple_moss', 'orchid_moss', 'vine_root', 'jungle_cliff', // 22..33
    'reef_sand', 'coral_shallows', 'kelp_bed', 'seagrass', 'tide_pool', 'pearl_sand', 'lagoon', 'sandbar', 'shell_beach', 'wreck_planks', 'abyss', 'sea_rock', // 34..45
    'packed_snow', 'powder_snow', 'ice_sheet', 'ice_thin', 'frost_rock', 'permafrost', 'tundra_moss', 'slush', 'frozen_road', 'hot_spring', 'aurora_crystal', 'glacier_wall', // 46..57
    'regolith', 'red_dust', 'dune_red', 'basalt', 'oxide_rock', 'crater_floor', 'crater_rim', 'co2_frost', 'canyon_wall', 'lava_vent', 'habitat_floor', 'landing_pad', 'dust_sea', 'dust_shallows', // 58..71
    'dock_planks', // 72
  ];
  const TERRAIN_EXT = {};
  TERRAIN_EXT_NAMES.forEach(function (n, k) { TERRAIN_EXT[n] = 18 + k; });
  const TERRAIN_NAMES = Object.keys(TERRAIN).concat(TERRAIN_EXT_NAMES);
  const TERRAIN_ALL = {};
  TERRAIN_NAMES.forEach(function (n, k) { TERRAIN_ALL[n] = k; });
  const T = TERRAIN;
  const ZONES = { SHORE: 0, MIDLANDS: 1, HIGHLANDS: 2, GODLANDS: 3, VOID: 255 };
  // radial bands in warped-distance units (0 = centre, 1 = nominal coast radius).
  // PLAYTEST-REVIEW-2 #1 (zone gradient): the default bands are WIDE (a much wider shore, the midlands pushed inward) and the zone field is
  // bulged around the spawn so the first midlands tile is at least SAFE_SHORE tiles (x size/256) from it. ZONE_BANDS_CLASSIC is the original
  // layout: generate(seed, { bands: 'classic' }) (page ?bands=classic) reproduces the old worlds byte for byte (same hash).
  const ZONE_BANDS_CLASSIC = [
    { id: 0, name: 'shore', dwMin: 0.68, dwMax: 0.97 },
    { id: 1, name: 'midlands', dwMin: 0.40, dwMax: 0.68 },
    { id: 2, name: 'highlands', dwMin: 0.20, dwMax: 0.40 },
    { id: 3, name: 'godlands', dwMin: 0, dwMax: 0.20 },
  ];
  const ZONE_BANDS_WIDE = [
    { id: 0, name: 'shore', dwMin: 0.62, dwMax: 0.97 },
    { id: 1, name: 'midlands', dwMin: 0.34, dwMax: 0.62 },
    { id: 2, name: 'highlands', dwMin: 0.17, dwMax: 0.34 },
    { id: 3, name: 'godlands', dwMin: 0, dwMax: 0.17 },
  ];
  const ZONE_BANDS = ZONE_BANDS_WIDE;
  const SAFE_SHORE = 40;     // tiles (at 256x256): no midlands (or worse) tile closer than this to the spawn
  const SAFE_FALLOFF = 1.6;  // beyond SAFE_SHORE the bulge sinks back to the natural field this many times faster than the radial slope
  function bandsFor(opts) { return opts && opts.bands === 'classic' ? ZONE_BANDS_CLASSIC : ZONE_BANDS_WIDE; }
  const BIOMES = ['warren', 'bramble', 'meadow', 'crypt'];
  const BOSSES = [
    { boss: 'forest_warden', zone: 1 }, { boss: 'mire_queen', zone: 1 },
    { boss: 'bone_colossus', zone: 2 }, { boss: 'storm_harbinger', zone: 2 }, { boss: 'crystal_titan', zone: 2 },
    { boss: 'dread_knight', zone: 3 }, { boss: 'inferno_wyrm', zone: 3 }, { boss: 'void_oracle', zone: 3 },
  ];
  // b23 bosses-extra: per-zone boss pools. A site keeps its LOCATION (found with the 'sites' stream, untouched); only its boss id is drawn from the
  // zone pool by a seeded hash sort (no stream consumed). `classic` (generate opts.bosses === 'classic', page ?bosses=classic) keeps the BOSSES ids above.
  // Zone 0 (shore) holds no boss site; its two thematic bosses (treant_elder, sand_titan) live in the midlands pool.
  const BOSS_POOLS = {
    1: ['forest_warden', 'mire_queen', 'treant_elder', 'sand_titan'],
    2: ['bone_colossus', 'storm_harbinger', 'crystal_titan', 'hydra', 'frost_dragon', 'clockwork_golem'],
    3: ['dread_knight', 'inferno_wyrm', 'void_oracle', 'lich_king', 'shadow_hydra', 'void_maw'],
  };
  const PORTAL_ZONES = { warren: 1, bramble: 1, meadow: 2, crypt: 2 };
  // existing enemy TYPES (realm.js RM_ENEMIES: spiral = whirler / aimed = sniper / ring = burster) -> art creature ids by zone tier 0..3.
  // CREATURE_TIERS_CLASSIC is the original table (page ?roster=classic, generate opts.roster === 'classic'). CREATURE_TIERS adds the b24 wave-2 creatures,
  // each under the behaviour that fits it: shore crab_giant / wind_sprite / water_elemental (weak); midlands ghoul, ogre, harpy, thorn_vine; highlands
  // minotaur, golem_lava, wraith_knight, fire_elemental. The selection still consumes exactly one 'groups' RNG draw per cell, so spawn POSITIONS never change.
  const CREATURE_TIERS_CLASSIC = {
    spiral: [['mothling', 'sprout_mini'], ['moth', 'cave_bat', 'sprout'], ['ice_wraith', 'goblin_shaman', 'skeleton'], ['shadow_cultist', 'ember_imp']],
    aimed: [['goblin_scout', 'sprout'], ['archer', 'forest_wolf'], ['skeleton_archer', 'dark_spider', 'sand_scorpion'], ['dark_spider', 'skeleton_archer', 'bone_knight']],
    ring: [['puffcap', 'slime_green'], ['beetle', 'slime_blue', 'swamp_leech'], ['stone_golem', 'crystal_beetle', 'slime_red'], ['bone_knight', 'toxic_serpent', 'stone_golem']],
  };
  const CREATURE_TIERS = {
    spiral: [['mothling', 'sprout_mini', 'wind_sprite'], ['moth', 'cave_bat', 'sprout', 'harpy'], ['ice_wraith', 'goblin_shaman', 'skeleton', 'wraith_knight'], ['shadow_cultist', 'ember_imp']],
    aimed: [['goblin_scout', 'sprout', 'water_elemental'], ['archer', 'forest_wolf', 'thorn_vine'], ['skeleton_archer', 'dark_spider', 'sand_scorpion', 'fire_elemental'], ['dark_spider', 'skeleton_archer', 'bone_knight', 'giant_spider_queen']],
    ring: [['puffcap', 'slime_green', 'crab_giant'], ['beetle', 'slime_blue', 'swamp_leech', 'ghoul', 'ogre'], ['stone_golem', 'crystal_beetle', 'slime_red', 'minotaur', 'golem_lava'], ['bone_knight', 'toxic_serpent', 'stone_golem']],
  };
  // The one rare elite: a godland sniper group (zone 3, type 'aimed') becomes a lone giant_spider_queen with this chance, drawn from a seeded hash of its cell
  // (NOT from the stream), so nothing else shifts. It is listed last in aimed[3] so the page preloads its art and validate() accepts it, but the plain pick skips it (RARE_ONLY). Elite = a single creature with extra hp (MMZones, group.elite).
  const RARE_ELITE = { zone: 3, type: 'aimed', creature: 'giant_spider_queen', chance: 0.2 };
  const RARE_ONLY = ['giant_spider_queen'];
  const WAVE2 = ['ghoul', 'harpy', 'minotaur', 'ogre', 'wraith_knight', 'fire_elemental', 'water_elemental', 'wind_sprite', 'thorn_vine', 'giant_spider_queen', 'golem_lava', 'crab_giant'];
  const BOSS_IDS = BOSSES.map(function (b) { return b.boss; }).concat([].concat(BOSS_POOLS[1], BOSS_POOLS[2], BOSS_POOLS[3]).filter(function (id) { return !BOSSES.some(function (b) { return b.boss === id; }); }));
  // site boss ids for a seed: per zone, the zone pool ordered by a seeded hash, assigned to that zone's sites in BOSSES order (distinct per zone).
  function bossIdsFor(seedStr, classic) {
    const out = BOSSES.map(function (b) { return b.boss; });
    if (classic) return out;
    [1, 2, 3].forEach(function (z) {
      const order = BOSS_POOLS[z].map(function (id) { return { id: id, k: MMRng.hash(seedStr + ':boss:' + z + ':' + id) >>> 0 }; }).sort(function (a, b) { return a.k - b.k || (a.id < b.id ? -1 : 1); });
      let n = 0; BOSSES.forEach(function (b, i) { if (b.zone === z) out[i] = order[n++].id; });
    });
    return out;
  }
  const GROUP_COUNT = [[1, 3], [2, 4], [3, 5], [4, 6]];
  const GROUP_CELL = [11, 10, 9, 8];
  const GROUP_PROB = [0.5, 0.62, 0.7, 0.8];

  // ---- noise (coordinate hash, integer seeded) ----
  function h2(x, y, s) {
    let h = (Math.imul(x, 374761393) + Math.imul(y, 668265263) + Math.imul(s, 1442695041)) | 0;
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
  }
  function vnoise(x, y, s) {
    const xi = Math.floor(x), yi = Math.floor(y);
    let fx = x - xi, fy = y - yi;
    fx = fx * fx * (3 - 2 * fx); fy = fy * fy * (3 - 2 * fy);
    const a = h2(xi, yi, s), b = h2(xi + 1, yi, s), c = h2(xi, yi + 1, s), d = h2(xi + 1, yi + 1, s);
    return a + (b - a) * fx + (c - a) * fy + (a - b - c + d) * fx * fy;
  }
  function fbm(x, y, oct, s) {
    let v = 0, amp = 0.5, f = 1, tot = 0;
    for (let i = 0; i < oct; i++) { v += amp * vnoise(x * f, y * f, s + i * 101); tot += amp; amp *= 0.5; f *= 2; }
    return v / tot;
  }
  function smooth(t) { t = t < 0 ? 0 : t > 1 ? 1 : t; return t * t * (3 - 2 * t); }

  const FLAG_OPEN = 1; // road / clearing / stamped: no props, no cliffs

  // ---- generation parameters ("P"): the Realm pack (today's constants, verbatim) or a compiled biome pack ----
  const COAST = [0.97, 0.90, 0.86, 0.80]; // dw thresholds: deep water, shallow water, wet sand, sand (spawn placement relies on 0.90)
  // the Realm classifier, kept verbatim (the land part of the base-terrain switch; z = zone band, m = moisture, det = detail, dw = warped distance)
  function classifyRealm(z, m, det, dw) {
    let t;
    if (z === 0) {
      if (dw > 0.76 && det > 0.8) t = T.sand;
      else if (m > 0.72 && det > 0.5) t = T.flower_meadow;
      else if (m > 0.5) t = T.tall_grass;
      else t = T.grass;
    } else if (z === 1) {
      if (det > 0.88) t = T.gravel;
      else if (m < 0.3) t = T.dry_grass;
      else if (m > 0.8) t = T.dark_grass;
      else if (m > 0.5 && m < 0.6 && det > 0.65) t = T.flower_meadow;
      else if (m > 0.62) t = T.tall_grass;
      else t = T.grass;
    } else if (z === 2) {
      if (m > 0.72 && det > 0.45) t = T.snow;
      else if (m < 0.38) t = T.gravel;
      else if (m > 0.42 && m < 0.52 && det > 0.6) t = T.dry_grass;
      else t = T.highland_rock;
    } else {
      if (det > 0.86) t = T.lava_rock;
      else if (m < 0.35) t = T.cracked_stone;
      else if (m > 0.78) t = T.blood_ruins;
      else if (dw > 0.17 && m > 0.6) t = T.dark_grass;
      else t = T.godland_ash;
    }
    return t;
  }
  function lut(ids) { const a = new Uint8Array(256); ids.forEach(function (t) { a[t] = 1; }); return a; }
  function realmThaw(t) { return t === T.deep_water ? T.shallow_water : t === T.highland_rock ? T.gravel : (t === T.cracked_stone ? T.cracked_stone : T.gravel); }
  const REALM_PROPS = (function () {
    const r = [];
    r[T.grass] = ['tree', 0.03]; r[T.tall_grass] = ['bush', 0.05]; r[T.flower_meadow] = ['flower', 0.05];
    r[T.sand] = ['shell', 0.006]; r[T.wet_sand] = ['shell', 0.005]; r[T.highland_rock] = ['rock', 0.04];
    r[T.gravel] = ['rock', 0.02]; r[T.snow] = ['pine', 0.04]; r[T.dry_grass] = ['dead_bush', 0.03];
    r[T.godland_ash] = ['dead_tree', 0.025]; r[T.blood_ruins] = ['bones', 0.02]; r[T.cracked_stone] = ['bones', 0.01];
    r[T.dark_grass] = ['dead_tree', 0.04]; r[T.lava_rock] = ['ember_vent', 0.03];
    return r;
  }());
  // kind -> [per-zone counts 0..3, clearance]
  const STRUCT_PLAN = [
    ['camp', [4, 3, 0, 0], 3], ['ruin', [0, 3, 3, 2], 5], ['shrine', [0, 2, 2, 1], 3], ['tower', [0, 0, 3, 1], 4],
    ['graveyard', [0, 2, 2, 2], 4], ['event_site', [1, 2, 2, 2], 6],
  ];
  const realmCache = {};
  function realmParams(opts) {
    const B = bandsFor(opts), classicRoster = opts.roster === 'classic', classicBosses = opts.bosses === 'classic';
    const key = (B === ZONE_BANDS_CLASSIC ? 'c' : 'w') + (classicRoster ? 'r' : '') + (classicBosses ? 'b' : '');
    if (realmCache[key]) return realmCache[key];
    const tiers = classicRoster ? CREATURE_TIERS_CLASSIC : CREATURE_TIERS;
    return (realmCache[key] = {
      id: null, B: B, flatZones: B === ZONE_BANDS_CLASSIC, safeShore: SAFE_SHORE,
      coast: [T.deep_water, T.shallow_water, T.wet_sand, T.sand], classify: classifyRealm,
      solid: lut([T.deep_water]), water: lut([T.deep_water, T.shallow_water]), deep: T.deep_water, shallow: T.shallow_water,
      pad: T.sand, lakeDeep: T.deep_water, lakeShallow: T.shallow_water, lakesPer64k: 6, lakesMin: 3, rivers: 2, lakeSkip: 3,
      road: [T.dirt_road, T.dirt_road, T.stone_road, T.stone_road], cliff: T.highland_rock, cliffZone: 2,
      floor: [[T.grass], [T.grass], [T.gravel], [T.cracked_stone, T.blood_ruins, 150]],
      bossPlan: BOSSES, bossIds: function (seedStr) { return bossIdsFor(seedStr, classicBosses); }, bossFloor: [T.dirt_road, T.dirt_road, T.stone_road, T.cracked_stone],
      portals: BIOMES.map(function (b) { return { biome: b, zone: PORTAL_ZONES[b] }; }), portalFloor: T.stone_road,
      structPlan: STRUCT_PLAN, camp: T.dirt_road, shrine: T.stone_road, grave: [T.dark_grass, T.dark_grass, T.dark_grass, T.godland_ash],
      event: [T.dirt_road, T.dirt_road, T.stone_road, T.cracked_stone], tower: T.stone_road, wall: T.cracked_stone, ruin: [T.cracked_stone, T.cracked_stone, T.cracked_stone, T.blood_ruins],
      thaw: realmThaw, props: REALM_PROPS, groupCell: GROUP_CELL, groupCount: GROUP_COUNT, groupProb: GROUP_PROB,
      creatureList: function (type, z) { return tiers[type][z].filter(function (id) { return RARE_ONLY.indexOf(id) < 0; }); },
      elite: !classicRoster, reachZone: 2, opts: { roster: classicRoster ? 'classic' : undefined, bosses: classicBosses ? 'classic' : undefined },
    });
  }

  // ---- biome packs (shared/mm-biome-packs.js): compiled once per id into the same parameter shape ----
  const packCache = {};
  function tid(name, where) {
    if (typeof name !== 'string' || !Object.prototype.hasOwnProperty.call(TERRAIN_ALL, name)) throw new Error('MMOverworld: unknown terrain ' + name + ' in ' + where);
    return TERRAIN_ALL[name];
  }
  function findPack(id) {
    const BP = biomePacks();
    return BP && typeof BP.get === 'function' ? BP.get(id) : null;
  }
  function packParams(pk) {
    if (packCache[pk.id]) return packCache[pk.id];
    const nb = pk.bands.length, tl = pk.tiles, w = pk.id;
    const per = function (arr, k) { return arr.map(function (n) { return tid(n, w + '.' + k); }); };
    const rules = pk.classify.map(function (band) {
      return band.map(function (r) {
        return { t: tid(r[0], w + '.classify'), c: r[1].map(function (c) { return { f: c[0] === 'm' ? 0 : c[0] === 'det' ? 1 : 2, gt: c[1] === '>', v: c[2] }; }) };
      });
    });
    const classify = function (z, m, det, dw) {
      const band = rules[z], vals = [m, det, dw];
      for (let k = 0; k < band.length; k++) {
        const r = band[k];
        let ok = true;
        for (let j = 0; j < r.c.length; j++) { const c = r.c[j], x = vals[c.f]; if (c.gt ? !(x > c.v) : !(x < c.v)) { ok = false; break; } }
        if (ok) return r.t;
      }
      return band[band.length - 1].t;
    };
    const coast = per(pk.coast, 'coast');
    const thawMap = {};
    Object.keys(tl.thaw || {}).forEach(function (k) { thawMap[tid(k, w + '.thaw')] = tid(tl.thaw[k], w + '.thaw'); });
    const ford = tid(tl.ford, w + '.ford');
    const props = [];
    Object.keys(pk.props || {}).forEach(function (n) { props[tid(n, w + '.props')] = pk.props[n]; });
    const resources = (pk.resources || []).map(function (r) { return { id: r.id, chance: r.chance, on: lut(r.terrain.map(function (n) { return tid(n, w + '.resources'); })) }; });
    const lists = [];
    for (let z = 0; z < nb; z++) lists.push(((pk.creatures && pk.creatures[z]) || []).slice());
    return (packCache[pk.id] = {
      id: pk.id, pack: pk, sizeMin: pk.sizes[0], sizeMax: pk.sizes[1], B: pk.bands, flatZones: false, safeShore: pk.safeShore || SAFE_SHORE,
      coast: coast, classify: classify,
      solid: lut([coast[0]].concat(per(pk.solid || [], 'solid'))), water: lut([coast[0], coast[1]].concat(per(pk.water || [], 'water'))), deep: coast[0], shallow: coast[1],
      pad: tid(tl.pad, w + '.pad'), lakeDeep: tid(tl.lakeDeep, w + '.lakeDeep'), lakeShallow: tid(tl.lakeShallow, w + '.lakeShallow'),
      lakesPer64k: pk.lakes.per64k, lakesMin: pk.lakes.min, rivers: pk.lakes.rivers, lakeSkip: pk.lakes.skipBand,
      road: per(tl.road, 'road'), cliff: tl.cliff ? tid(tl.cliff, w + '.cliff') : -1, cliffZone: tl.cliff ? tl.cliffBand : -1,
      floor: tl.floor.map(function (f) { return Array.isArray(f) ? [tid(f[0], w + '.floor'), tid(f[1], w + '.floor'), f[2]] : [tid(f, w + '.floor')]; }),
      bossPlan: (pk.bosses || []).map(function (b) { return { boss: b.boss, zone: b.zone }; }), bossIds: null, bossFloor: per(tl.boss, 'boss'),
      portals: (pk.portals || []).map(function (p) { return { biome: p.biome, zone: p.zone }; }), portalFloor: tid(tl.portal, w + '.portal'),
      structPlan: (pk.structures || []).map(function (s) { return [s[0], s[1], s[2], s[3] || s[0]]; }),
      camp: tid(tl.camp, w + '.camp'), shrine: tid(tl.shrine, w + '.shrine'), grave: per(tl.grave, 'grave'), event: per(tl.event, 'event'),
      tower: tid(tl.tower, w + '.tower'), wall: tid(tl.wall, w + '.wall'), ruin: per(tl.ruin, 'ruin'), dockTile: tid(tl.dock, w + '.dock'),
      thaw: function (t) { return Object.prototype.hasOwnProperty.call(thawMap, t) ? thawMap[t] : ford; },
      props: props, resources: resources, groupCell: pk.groups.cell, groupCount: pk.groups.count, groupProb: pk.groups.prob,
      creatureList: function (type, z) { return lists[z] || []; }, base: pk.base || {},
      elite: false, reachZone: pk.verify.reachBand, groupsPer64k: pk.verify.groupsPer64k, minStructures: pk.verify.minStructures || 0,
      opts: {},
    });
  }

  // generate(seed, opts): opts.size, opts.bands ('classic'), opts.roster ('classic'), opts.bosses ('classic'), opts.pack (a MMBiomePacks id).
  // Without a (known) pack this is exactly the pre-pack generator: tests/fixtures/overworld-golden.json guards every hash.
  function paramsFor(opts) {
    opts = opts || {};
    const pk = opts.pack !== undefined ? findPack(opts.pack) : null; // hostile / unknown pack ids are ignored: the Realm world
    return pk ? packParams(pk) : realmParams(opts);
  }
  function packOf(opts) { const P = paramsFor(opts); return P.id || null; }
  function generate(seed, opts) {
    opts = opts || {};
    return generateWith(seed, opts, paramsFor(opts));
  }

  function generateWith(seed, opts, P) {
    opts = opts || {};
    const isPack = !!P.id;
    // a pack island is clamped into the pack's size range (pack.sizes, e.g. 128..192); the Realm keeps any size >= 64
    const N = isPack ? Math.min(P.sizeMax, Math.max(P.sizeMin, Math.floor(Number(opts.size) || P.pack.size)))
      : Math.max(64, Math.floor(opts.size || 256));
    const w = N, h = N, area = N * N;
    const R = N * 0.47; // nominal coast radius in tiles
    const cx = (N - 1) / 2, cy = (N - 1) / 2;
    const seedStr = String(seed === undefined ? '' : seed);
    const hashStr = isPack ? P.id + '|' + seedStr : seedStr; // packs live in their own seed space (rule 3)
    const sn = (MMRng.hash(hashStr + ':noise') >>> 0) | 0;
    const rngFor = function (tag) { return MMRng.create(hashStr + ':' + tag); };

    const terrain = new Uint8Array(area);
    const zone = new Uint8Array(area);
    const solid = new Uint8Array(area);
    const flags = new Uint8Array(area);
    const height = new Uint8Array(area);
    const difficulty = new Uint8Array(area);
    const dwA = new Float32Array(area);
    const moistA = new Uint8Array(area);
    const detA = new Uint8Array(area);
    const B = P.B, nb = B.length, flatZones = P.flatZones;
    const b0 = B[0].dwMin;
    const SOLID = P.solid, WATER = P.water, DEEP = P.deep;

    // ---- 1a. the warped-distance field (spawn placement only reads this, so it can run before the zones) ----
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const dx = x - cx, dy = y - cy;
        const d = Math.sqrt(dx * dx + dy * dy) / R;
        const warp = fbm(x / 38, y / 38, 4, sn + 1);
        dwA[y * w + x] = d + (warp - 0.5) * 0.24 + (fbm(x / 9, y / 9, 2, sn + 2) - 0.5) * 0.03;
      }
    }
    const inb = function (x, y) { return x >= 0 && y >= 0 && x < w && y < h; };
    const isWater = function (t) { return WATER[t] === 1; };
    const dist = function (ax, ay, bx, by) { const a = ax - bx, b = ay - by; return Math.sqrt(a * a + b * b); };

    // ---- 2. spawn point on the shore ring (base terrain is water exactly where dw >= 0.90, so the field alone decides) ----
    const rs = rngFor('spawn');
    let spawn = null;
    const a0 = rs.next() * Math.PI * 2;
    for (let k = 0; k < 360 && !spawn; k++) {
      const ang = a0 + (k % 2 ? 1 : -1) * Math.ceil(k / 2) * (Math.PI / 180) * 2;
      for (let r = R * 0.9; r > R * 0.7 && !spawn; r -= 0.5) {
        const x = Math.round(cx + Math.cos(ang) * r), y = Math.round(cy + Math.sin(ang) * r);
        if (!inb(x, y)) continue;
        const i = y * w + x;
        if (dwA[i] < b0 || dwA[i] > 0.84 || dwA[i] < 0.74) continue;
        let ok = true;
        for (let oy = -4; oy <= 4 && ok; oy++) for (let ox = -4; ox <= 4; ox++) {
          if (!inb(x + ox, y + oy) || dwA[(y + oy) * w + x + ox] >= 0.90) { ok = false; break; }
        }
        if (ok) spawn = { x: x, y: y };
      }
    }
    if (!spawn) { // extreme fallback: walk the +x axis from the centre until the shore band
      for (let x = Math.floor(cx + R * 0.8); x > cx && !spawn; x--) if (dwA[Math.floor(cy) * w + x] < 0.90) spawn = { x: x, y: Math.floor(cy) };
    }
    // the zone field: classic = dw; wide = dw bulged around the spawn (flat shore plateau out to SAFE tiles, then a steep fall back to dw)
    const safeR = P.safeShore * N / 256, plateau = b0 + 0.02;
    const zoneField = function (x, y, dw) {
      if (flatZones) return dw;
      const ds = dist(x, y, spawn.x, spawn.y);
      const bulge = ds <= safeR ? plateau : plateau - (ds - safeR) * SAFE_FALLOFF / R;
      return dw > bulge ? dw : bulge;
    };
    const zoneOf = function (dz) { for (let k = 0; k < nb - 1; k++) if (dz >= B[k].dwMin) return k; return nb - 1; };

    // ---- 1b. fields + base terrain ----
    const C = P.coast, classify = P.classify;
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const i = y * w + x;
        const dw = dwA[i], dz = zoneField(x, y, dw);
        const m = fbm(x / 22, y / 22, 3, sn + 3), det = fbm(x / 7, y / 7, 2, sn + 4);
        moistA[i] = (m * 255) | 0; detA[i] = (det * 255) | 0;
        difficulty[i] = (smooth(1 - dz / 0.9) * 255 + 0.5) | 0;
        height[i] = (Math.min(1, Math.max(0, (1 - dw) * 0.8 + (fbm(x / 16, y / 16, 3, sn + 5) - 0.5) * 0.4)) * 255) | 0;
        const z = zoneOf(dz);
        zone[i] = z;
        let t;
        if (dw >= COAST[0]) t = C[0];
        else if (dw >= COAST[1]) t = C[1];
        else if (dw >= COAST[2]) t = C[2];
        else if (dw >= COAST[3]) t = C[3];
        else t = classify(z, m, det, dw);
        terrain[i] = t;
        if (SOLID[t]) solid[i] = 1;
      }
    }
    function setTile(x, y, t, sol, open) {
      if (!inb(x, y)) return;
      const i = y * w + x;
      terrain[i] = t; solid[i] = sol ? 1 : 0;
      if (open) flags[i] |= FLAG_OPEN;
    }
    const ROAD = P.road;
    function roadTerrain(i) { return ROAD[zone[i]]; }

    // ---- 2b. clear the spawn pad ----
    for (let oy = -3; oy <= 3; oy++) for (let ox = -3; ox <= 3; ox++) {
      if (ox * ox + oy * oy > 9) continue;
      const i = (spawn.y + oy) * w + spawn.x + ox;
      if (isWater(terrain[i]) || solid[i]) terrain[i] = P.pad;
      solid[i] = 0; flags[i] |= FLAG_OPEN;
    }

    // ---- 3. lakes and rivers (only on the island interior) ----
    const rl = rngFor('lakes');
    const lakes = [];
    const LSKIP = P.lakeSkip, LDEEP = P.lakeDeep, LSHAL = P.lakeShallow;
    const nLakes = Math.max(P.lakesMin, Math.round(P.lakesPer64k * area / 65536));
    for (let tries = 0; tries < 400 && lakes.length < nLakes; tries++) {
      const ang = rl.next() * Math.PI * 2, rr = R * (0.28 + rl.next() * 0.5);
      const lx = Math.round(cx + Math.cos(ang) * rr), ly = Math.round(cy + Math.sin(ang) * rr);
      const lr = (5 + rl.next() * 6) * (N / 256 > 0.5 ? N / 256 : 0.5);
      if (!inb(lx, ly) || zone[ly * w + lx] === LSKIP || dist(lx, ly, spawn.x, spawn.y) < lr + 16) continue;
      if (lakes.some(function (l) { return dist(l.x, l.y, lx, ly) < l.r + lr + 6; })) continue;
      lakes.push({ x: lx, y: ly, r: lr });
    }
    lakes.forEach(function (l, li) {
      const r1 = Math.ceil(l.r * 1.4);
      for (let y = l.y - r1; y <= l.y + r1; y++) for (let x = l.x - r1; x <= l.x + r1; x++) {
        if (!inb(x, y)) continue;
        const i = y * w + x;
        if (zone[i] === LSKIP || (flags[i] & FLAG_OPEN) || dwA[i] >= 0.86) continue;
        const dd = dist(x, y, l.x, l.y) / l.r + (fbm(x / 5, y / 5, 2, sn + 40 + li) - 0.5) * 0.7;
        if (dd < 0.55) { terrain[i] = LDEEP; solid[i] = 1; }
        else if (dd < 1.0 && terrain[i] !== LDEEP) terrain[i] = LSHAL;
      }
    });
    for (let ri = 0; ri < Math.min(P.rivers, lakes.length); ri++) {
      const l = lakes[ri];
      let ang = Math.atan2(l.y - cy, l.x - cx) + (ri ? 0.5 : -0.5);
      let px = l.x, py = l.y;
      for (let s = 0; s < 400; s++) {
        ang += (rl.next() - 0.5) * 0.5;
        px += Math.cos(ang); py += Math.sin(ang);
        const xi = Math.round(px), yi = Math.round(py);
        if (!inb(xi, yi) || dwA[yi * w + xi] >= 0.88) break;
        const ford = (s % 18) < 3;
        for (let oy = -1; oy <= 1; oy++) for (let ox = -1; ox <= 1; ox++) {
          const x = xi + ox, y = yi + oy;
          if (!inb(x, y)) continue;
          const i = y * w + x;
          if (zone[i] === LSKIP || (flags[i] & FLAG_OPEN)) continue;
          if (ox === 0 && oy === 0 && !ford) { terrain[i] = LDEEP; solid[i] = 1; }
          else if (terrain[i] !== LDEEP) terrain[i] = LSHAL;
        }
      }
    }

    // ---- 4. main road spawn -> centre (water on its path becomes a bridge) ----
    const rr0 = rngFor('road');
    const rphase = rr0.next() * 6.28, ramp = 4 + rr0.next() * 5, rfreq = 3 + rr0.next() * 3;
    {
      const len = dist(spawn.x, spawn.y, cx, cy);
      const nx = -(cy - spawn.y) / len, ny = (cx - spawn.x) / len;
      const steps = Math.ceil(len * 2);
      for (let s = 0; s <= steps; s++) {
        const t = s / steps, off = Math.sin(t * rfreq + rphase) * ramp * Math.sin(t * Math.PI);
        const x = Math.round(spawn.x + (cx - spawn.x) * t + nx * off), y = Math.round(spawn.y + (cy - spawn.y) * t + ny * off);
        for (let oy = 0; oy <= 1; oy++) for (let ox = 0; ox <= 1; ox++) {
          if (!inb(x + ox, y + oy)) continue;
          setTile(x + ox, y + oy, roadTerrain((y + oy) * w + x + ox), false, true);
        }
      }
    }

    // ---- 5. cliffs in the highlands ----
    if (P.cliffZone >= 0) {
      const CZ = P.cliffZone, CLIFF = P.cliff;
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
        const i = y * w + x;
        if (zone[i] !== CZ || (flags[i] & FLAG_OPEN) || isWater(terrain[i])) continue;
        if (Math.abs(fbm(x / 14, y / 14, 3, sn + 60) - 0.5) < 0.016) { terrain[i] = CLIFF; solid[i] = 1; }
      }
    }

    // ---- 6. sites: bosses, portals, structures ----
    const sites = []; // {x,y,r} for spacing
    const rsite = rngFor('sites');
    function siteOk(x, y, z, minD, clr) {
      if (!inb(x, y) || !inb(x - clr, y - clr) || !inb(x + clr, y + clr)) return false;
      if (zone[y * w + x] !== z) return false;
      if (dist(x, y, spawn.x, spawn.y) < 18) return false;
      for (let oy = -clr; oy <= clr; oy++) for (let ox = -clr; ox <= clr; ox++) {
        const i = (y + oy) * w + x + ox;
        if (isWater(terrain[i]) || (flags[i] & FLAG_OPEN)) return false;
      }
      for (let s = 0; s < sites.length; s++) if (dist(x, y, sites[s].x, sites[s].y) < minD) return false;
      return true;
    }
    function findSite(z, minD, clr) {
      const band = B[z];
      const rmin = Math.max(0, band.dwMin) * R * 0.9, rmax = Math.min(band.dwMax, 0.9) * R * 1.05;
      for (let relax = 0; relax < 6; relax++) {
        const md = minD * (1 - relax * 0.15);
        for (let k = 0; k < 250; k++) {
          const ang = rsite.next() * Math.PI * 2, r = rmin + rsite.next() * (rmax - rmin);
          const x = Math.round(cx + Math.cos(ang) * r), y = Math.round(cy + Math.sin(ang) * r);
          if (siteOk(x, y, z, md, clr)) { sites.push({ x: x, y: y }); return { x: x, y: y }; }
        }
      }
      return null;
    }
    const FLOOR = P.floor;
    function floorFor(z, i) { const f = FLOOR[z]; return f.length > 1 ? (moistA[i] > f[2] ? f[1] : f[0]) : f[0]; }
    function clearing(x, y, r, tid) {
      for (let oy = -r; oy <= r; oy++) for (let ox = -r; ox <= r; ox++) {
        if (ox * ox + oy * oy > r * r + 1) continue;
        const i = (y + oy) * w + x + ox;
        setTile(x + ox, y + oy, tid === undefined ? floorFor(zone[i], i) : tid, false, true);
      }
    }
    const props = [];
    const structures = [], bossSites = [], portalSites = [];

    const bossIds = P.bossIds ? P.bossIds(seedStr) : P.bossPlan.map(function (b) { return b.boss; });
    P.bossPlan.forEach(function (b, bi) {
      const p = findSite(b.zone, 13, 4);
      if (!p) return;
      clearing(p.x, p.y, 4, P.bossFloor[b.zone]);
      bossSites.push({ x: p.x, y: p.y, boss: bossIds[bi], zone: b.zone });
      props.push({ x: p.x, y: p.y, kind: 'boss_altar' });
    });
    P.portals.forEach(function (pt) {
      const biome = pt.biome, z = pt.zone;
      const p = findSite(z, 16, 3);
      if (!p) return;
      clearing(p.x, p.y, 3, P.portalFloor);
      portalSites.push({ x: p.x, y: p.y, biome: biome, zone: z });
      structures.push({ x: p.x, y: p.y, kind: 'portal_site', zone: z });
      props.push({ x: p.x, y: p.y, kind: 'portal_' + biome });
    });
    const scale = Math.max(0.5, area / 65536);
    P.structPlan.forEach(function (pl) {
      for (let z = 0; z < nb; z++) {
        const n = Math.round(pl[1][z] * scale + (pl[1][z] > 0 && scale < 1 ? 0.01 : 0));
        for (let k = 0; k < n; k++) {
          const p = findSite(z, 12, pl[2]);
          if (!p) continue;
          structures.push({ x: p.x, y: p.y, kind: pl[0], zone: z });
          stampStructure(pl[3] || pl[0], p.x, p.y, z);
        }
      }
    });
    function stampStructure(kind, x, y, z) {
      if (kind === 'camp') { clearing(x, y, 2, P.camp); props.push({ x: x, y: y, kind: 'campfire' }); props.push({ x: x + 2, y: y, kind: 'tent' }); props.push({ x: x - 2, y: y + 1, kind: 'tent' }); }
      else if (kind === 'shrine') { clearing(x, y, 2, P.shrine); props.push({ x: x, y: y, kind: 'shrine' }); }
      else if (kind === 'graveyard') { clearing(x, y, 3, P.grave[z]); for (let k = 0; k < 6; k++) props.push({ x: x - 2 + (k % 3) * 2, y: y - 1 + Math.floor(k / 3) * 2, kind: 'gravestone' }); }
      else if (kind === 'event_site') { clearing(x, y, 5, P.event[z]); }
      else if (kind === 'tower') {
        clearing(x, y, 3, P.tower);
        for (let oy = -2; oy <= -1; oy++) for (let ox = 1; ox <= 2; ox++) setTile(x + ox, y + oy, P.wall, true, true);
        props.push({ x: x + 1, y: y - 2, kind: 'tower' });
      } else if (kind === 'ruin') {
        const floor = P.ruin[z];
        clearing(x, y, 4, floor);
        for (let k = -3; k <= 3; k++) {
          [[k, -3], [k, 3], [-3, k], [3, k]].forEach(function (c) {
            if (c[0] === 0 || c[1] === 0) return; // doors on all four sides
            if (((c[0] * 7 + c[1] * 13 + x + y) & 3) === 0) return; // broken wall gap
            setTile(x + c[0], y + c[1], P.wall, true, true);
          });
        }
        props.push({ x: x, y: y, kind: 'ruin_pillar' });
      }
    }

    // ---- 6b. packs only: the dock on the beach band, at the outermost land tile of a ray, next to open sea (own 'dock' stream) ----
    let dock = null;
    if (isPack) {
      const rd = rngFor('dock');
      const d0 = rd.next() * Math.PI * 2;
      const dockOk = function (x, y) {
        if (!inb(x - 3, y - 3) || !inb(x + 3, y + 3)) return false;
        const i = y * w + x;
        if (zone[i] !== 0 || dist(x, y, spawn.x, spawn.y) < 24) return false;
        for (let s = 0; s < sites.length; s++) if (dist(x, y, sites[s].x, sites[s].y) < 8) return false;
        for (let oy = -3; oy <= 3; oy++) for (let ox = -3; ox <= 3; ox++) if (dwA[(y + oy) * w + x + ox] >= 0.90) return true;
        return false;
      };
      for (let k = 0; k < 180 && !dock; k++) {
        const ang = d0 + (k % 2 ? 1 : -1) * Math.ceil(k / 2) * (Math.PI / 90);
        for (let r = R * 1.02; r > R * 0.7; r -= 0.5) {
          const x = Math.round(cx + Math.cos(ang) * r), y = Math.round(cy + Math.sin(ang) * r);
          if (!inb(x, y) || isWater(terrain[y * w + x]) || solid[y * w + x]) continue;
          if (dockOk(x, y)) dock = { x: x, y: y };
          break; // only the outermost land tile on this ray
        }
      }
      if (!dock) dock = { x: spawn.x, y: spawn.y }; // never seen in the 50-seed sweeps; the spawn pad doubles as the landing
      clearing(dock.x, dock.y, 1, P.dockTile);
      sites.push({ x: dock.x, y: dock.y });
      structures.push({ x: dock.x, y: dock.y, kind: 'dock', zone: 0 });
      props.push({ x: dock.x, y: dock.y, kind: 'dock' });
    }

    // ---- 7. connectivity: ford / cut so every walkable region joins the spawn's ----
    (function connect() {
      const label = new Int32Array(area).fill(-1);
      const queue = new Int32Array(area);
      let nl = 0;
      const sizes = [];
      for (let s = 0; s < area; s++) {
        if (solid[s] || label[s] >= 0) continue;
        let qh = 0, qt = 0; queue[qt++] = s; label[s] = nl; let sz = 0;
        while (qh < qt) {
          const c = queue[qh++]; sz++;
          const x = c % w, y = (c / w) | 0;
          if (x > 0 && !solid[c - 1] && label[c - 1] < 0) { label[c - 1] = nl; queue[qt++] = c - 1; }
          if (x < w - 1 && !solid[c + 1] && label[c + 1] < 0) { label[c + 1] = nl; queue[qt++] = c + 1; }
          if (y > 0 && !solid[c - w] && label[c - w] < 0) { label[c - w] = nl; queue[qt++] = c - w; }
          if (y < h - 1 && !solid[c + w] && label[c + w] < 0) { label[c + w] = nl; queue[qt++] = c + w; }
        }
        sizes.push(sz); nl++;
      }
      const main = label[spawn.y * w + spawn.x];
      if (nl <= 1) return;
      // multi-source BFS from the main component over ALL tiles
      const par = new Int32Array(area).fill(-2);
      const dd = new Int32Array(area);
      let qh = 0, qt = 0;
      for (let i = 0; i < area; i++) if (label[i] === main) { par[i] = -1; queue[qt++] = i; }
      while (qh < qt) {
        const c = queue[qh++];
        const x = c % w, y = (c / w) | 0;
        const nb4 = [x > 0 ? c - 1 : -1, x < w - 1 ? c + 1 : -1, y > 0 ? c - w : -1, y < h - 1 ? c + w : -1];
        for (let k = 0; k < 4; k++) { const n = nb4[k]; if (n >= 0 && par[n] === -2) { par[n] = c; dd[n] = dd[c] + 1; queue[qt++] = n; } }
      }
      const best = new Int32Array(nl).fill(-1);
      for (let i = 0; i < area; i++) {
        const l = label[i];
        if (l < 0 || l === main) continue;
        if (best[l] < 0 || dd[i] < dd[best[l]]) best[l] = i;
      }
      for (let l = 0; l < nl; l++) {
        if (l === main || best[l] < 0) continue;
        let c = par[best[l]];
        while (c >= 0 && par[c] !== -1) { // walk back until the main component (par -1)
          if (solid[c]) {
            terrain[c] = P.thaw(terrain[c]);
            solid[c] = 0;
          }
          flags[c] |= FLAG_OPEN;
          c = par[c];
        }
      }
    })();

    // ---- 8. final zone array: deep water and the open sea are void ----
    for (let i = 0; i < area; i++) {
      if (terrain[i] === DEEP || dwA[i] >= 0.90) zone[i] = ZONES.VOID;
    }

    // ---- 9. props (coordinate-hashed so they never perturb other streams) ----
    const PROPS = P.props;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const i = y * w + x;
      if (solid[i] || (flags[i] & FLAG_OPEN)) continue;
      const rule = PROPS[terrain[i]];
      if (rule && h2(x, y, sn + 777) < rule[1]) props.push({ x: x, y: y, kind: rule[0] });
    }
    // packs only: resource nodes, on their own coordinate hash (sn + 778 + k), never on a prop tile
    let resources = null;
    if (isPack) {
      resources = [];
      const taken = new Uint8Array(area);
      props.forEach(function (p) { if (inb(p.x, p.y)) taken[p.y * w + p.x] = 1; });
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
        const i = y * w + x;
        if (solid[i] || taken[i] || (flags[i] & FLAG_OPEN) || zone[i] === ZONES.VOID) continue;
        for (let k = 0; k < P.resources.length; k++) {
          const r = P.resources[k];
          if (r.on[terrain[i]] && h2(x, y, sn + 778 + k) < r.chance) { resources.push({ x: x, y: y, kind: r.id }); break; }
        }
      }
    }

    // ---- 10. spawn groups from the zone/tier tables ----
    const rg = rngFor('groups');
    const spawnGroups = [];
    const TYPES = ['spiral', 'aimed', 'ring'];
    for (let z = 0; z < nb; z++) {
      const cell = P.groupCell[z];
      for (let gy = 0; gy < h; gy += cell) for (let gx = 0; gx < w; gx += cell) {
        const x = gx + rg.int(0, cell - 1), y = gy + rg.int(0, cell - 1);
        const roll = rg.next(), type = rg.pick(TYPES), cnt = rg.int(P.groupCount[z][0], P.groupCount[z][1]);
        const creatures = P.creatureList(type, z), creature = creatures.length ? creatures[rg.int(0, creatures.length - 1)] : null;
        if (!inb(x, y) || creature === null) continue;
        const i = y * w + x;
        if (zone[i] !== z || roll > P.groupProb[z] || solid[i] || isWater(terrain[i]) || (flags[i] & FLAG_OPEN)) continue;
        if (dist(x, y, spawn.x, spawn.y) < 20) continue;
        const grp = { x: x, y: y, zone: z, tier: z, creature: creature, type: isPack ? (P.base[creature] || type) : type, count: cnt, difficulty: difficulty[i] / 255 };
        if (P.elite && z === RARE_ELITE.zone && type === RARE_ELITE.type && (MMRng.hash(seedStr + ':elite:' + x + ',' + y) >>> 0) / 4294967296 < RARE_ELITE.chance) { grp.creature = RARE_ELITE.creature; grp.count = 1; grp.elite = true; }
        spawnGroups.push(grp);
      }
    }

    const world = {
      w: w, h: h, seed: seedStr, version: VERSION, terrain: terrain, zone: zone, solid: solid, height: height, difficulty: difficulty,
      props: props, structures: structures, spawnPoint: spawn, spawnGroups: spawnGroups, bossSites: bossSites, portalSites: portalSites,
      center: { x: Math.round(cx), y: Math.round(cy) }, coastRadius: R, bands: isPack ? 'pack' : (flatZones ? 'classic' : 'wide'),
    };
    // non-default switches are recorded (only when set) so verify() can re-generate the same world; O.hash() never reads these keys
    if (P.opts.roster) world.roster = P.opts.roster;
    if (P.opts.bosses) world.bosses = P.opts.bosses;
    if (isPack) { world.pack = P.id; world.dock = dock; world.resources = resources; }
    return world;
  }

  // ---- accessors ----
  function tileAt(world, x, y) {
    x = Math.floor(x); y = Math.floor(y);
    if (x < 0 || y < 0 || x >= world.w || y >= world.h) return TERRAIN.deep_water;
    return world.terrain[y * world.w + x];
  }
  function isSolid(world, x, y) {
    x = Math.floor(x); y = Math.floor(y);
    if (x < 0 || y < 0 || x >= world.w || y >= world.h) return true;
    return world.solid[y * world.w + x] === 1;
  }
  function zoneAt(world, x, y) {
    x = Math.floor(x); y = Math.floor(y);
    if (x < 0 || y < 0 || x >= world.w || y >= world.h) return ZONES.VOID;
    return world.zone[y * world.w + x];
  }
  // 0..1, bilinear over tile centres so it is smooth for fractional positions
  function difficultyAt(world, x, y) {
    const fx = Math.min(world.w - 1, Math.max(0, x - 0.5)), fy = Math.min(world.h - 1, Math.max(0, y - 0.5));
    const x0 = Math.floor(fx), y0 = Math.floor(fy), x1 = Math.min(world.w - 1, x0 + 1), y1 = Math.min(world.h - 1, y0 + 1);
    const tx = fx - x0, ty = fy - y0, d = world.difficulty, w = world.w;
    const a = d[y0 * w + x0], b = d[y0 * w + x1], c = d[y1 * w + x0], e = d[y1 * w + x1];
    return ((a + (b - a) * tx) * (1 - ty) + (c + (e - c) * tx) * ty) / 255;
  }
  const gridCache = typeof WeakMap === 'function' ? new WeakMap() : null;
  const GCELL = 16;
  function groupIndex(world) {
    let g = gridCache && gridCache.get(world);
    if (g) return g;
    g = { cols: Math.ceil(world.w / GCELL), cells: {} };
    world.spawnGroups.forEach(function (s) {
      const k = Math.floor(s.y / GCELL) * g.cols + Math.floor(s.x / GCELL);
      (g.cells[k] = g.cells[k] || []).push(s);
    });
    if (gridCache) gridCache.set(world, g);
    return g;
  }
  function nearestSpawnGroups(world, x, y, radius) {
    const g = groupIndex(world), out = [];
    const c0 = Math.floor((x - radius) / GCELL), c1 = Math.floor((x + radius) / GCELL);
    const r0 = Math.floor((y - radius) / GCELL), r1 = Math.floor((y + radius) / GCELL);
    for (let r = Math.max(0, r0); r <= r1; r++) for (let c = Math.max(0, c0); c <= Math.min(g.cols - 1, c1); c++) {
      const list = g.cells[r * g.cols + c];
      if (!list) continue;
      for (let k = 0; k < list.length; k++) {
        const s = list[k], d = Math.sqrt((s.x - x) * (s.x - x) + (s.y - y) * (s.y - y));
        if (d <= radius) out.push({ group: s, dist: d });
      }
    }
    out.sort(function (a, b) { return a.dist - b.dist || a.group.y - b.group.y || a.group.x - b.group.x; });
    return out.map(function (o) { return o.group; });
  }
  // typed sub-grid for rendering; out-of-bounds cells read as solid deep water / void
  function chunk(world, cx, cy, size) {
    size = size || 32;
    const x0 = cx * size, y0 = cy * size, n = size * size;
    const out = { cx: cx, cy: cy, size: size, x0: x0, y0: y0, terrain: new Uint8Array(n), zone: new Uint8Array(n), solid: new Uint8Array(n) };
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
      const wx = x0 + x, wy = y0 + y, o = y * size + x;
      if (wx < 0 || wy < 0 || wx >= world.w || wy >= world.h) { out.terrain[o] = TERRAIN.deep_water; out.zone[o] = ZONES.VOID; out.solid[o] = 1; continue; }
      const i = wy * world.w + wx;
      out.terrain[o] = world.terrain[i]; out.zone[o] = world.zone[i]; out.solid[o] = world.solid[i];
    }
    return out;
  }

  // ---- verification ----
  function fnv(world) {
    let h = 2166136261 >>> 0;
    const mix = function (arr) { for (let i = 0; i < arr.length; i++) { h ^= arr[i]; h = Math.imul(h, 16777619) >>> 0; } };
    mix(world.terrain); mix(world.zone); mix(world.solid);
    const s = JSON.stringify([world.spawnPoint, world.spawnGroups, world.props, world.structures, world.bossSites, world.portalSites]);
    for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; }
    return h >>> 0;
  }
  function reach(world) {
    const w = world.w, h = world.h, seen = new Uint8Array(w * h), q = new Int32Array(w * h);
    let qh = 0, qt = 0;
    const s = world.spawnPoint.y * w + world.spawnPoint.x;
    if (world.solid[s]) return seen;
    seen[s] = 1; q[qt++] = s;
    while (qh < qt) {
      const c = q[qh++], x = c % w, y = (c / w) | 0;
      if (x > 0 && !seen[c - 1] && !world.solid[c - 1]) { seen[c - 1] = 1; q[qt++] = c - 1; }
      if (x < w - 1 && !seen[c + 1] && !world.solid[c + 1]) { seen[c + 1] = 1; q[qt++] = c + 1; }
      if (y > 0 && !seen[c - w] && !world.solid[c - w]) { seen[c - w] = 1; q[qt++] = c - w; }
      if (y < h - 1 && !seen[c + w] && !world.solid[c + w]) { seen[c + w] = 1; q[qt++] = c + w; }
    }
    return seen;
  }
  function verify(world, vopts) {
    vopts = vopts || {};
    const problems = [];
    const w = world.w, h = world.h, area = w * h;
    if (!world || !world.terrain || world.terrain.length !== area || world.zone.length !== area || world.solid.length !== area) problems.push('array sizes do not match w*h');
    if (problems.length) return { ok: false, problems: problems };
    const inb = function (p) { return p && p.x >= 0 && p.y >= 0 && p.x < w && p.y < h; };
    const all = [].concat(world.structures, world.bossSites, world.portalSites, world.spawnGroups, world.props);
    all.forEach(function (p, k) { if (!inb(p)) problems.push('out of bounds entry #' + k); });
    if (!inb(world.spawnPoint)) { problems.push('spawn out of bounds'); return { ok: false, problems: problems }; }
    const sp = world.spawnPoint, si = sp.y * w + sp.x;
    if (world.solid[si]) problems.push('spawn is solid');
    if (world.zone[si] !== 0) problems.push('spawn is not in the shore zone');
    for (let i = 0; i < area; i++) if (world.terrain[i] >= TERRAIN_NAMES.length) { problems.push('bad terrain id at ' + i); break; }
    const seen = reach(world);
    const chk = function (list, label) { list.forEach(function (p) { if (inb(p) && !seen[p.y * w + p.x]) problems.push(label + ' unreachable at ' + p.x + ',' + p.y + (p.kind ? ' (' + p.kind + ')' : '')); }); };
    chk(world.portalSites, 'portal site'); chk(world.bossSites, 'boss site'); chk(world.structures, 'structure');
    // a pack world is checked against its own pack (water, reach band, creature and boss tables, dock, group floor)
    const pk = world.pack !== undefined ? findPack(world.pack) : null;
    if (world.pack !== undefined && (!pk || pk.id !== world.pack)) { problems.push('unknown pack ' + String(world.pack).slice(0, 24)); return { ok: false, problems: problems }; }
    const PP = pk ? packParams(pk) : null;
    const reachZone = PP ? PP.reachZone : 2;
    let land = 0, got = 0;
    for (let i = 0; i < area; i++) {
      const t = world.terrain[i];
      if ((PP ? PP.water[t] === 1 : (t === TERRAIN.deep_water || t === TERRAIN.shallow_water)) || world.solid[i] || world.zone[i] > reachZone) continue;
      land++; if (seen[i]) got++;
    }
    if (land === 0 || got / land < 0.95) problems.push('only ' + got + '/' + land + ' land tiles in zones 0-' + reachZone + ' reachable');
    if (PP) {
      world.spawnGroups.forEach(function (g) {
        const list = PP.creatureList(g.type, g.tier);
        if (list.indexOf(g.creature) < 0 || g.type !== (PP.base[g.creature] || g.type) || g.elite) problems.push('bad creature ' + g.creature + ' for pack ' + PP.id + ' tier ' + g.tier);
      });
      world.bossSites.forEach(function (b) { if (!PP.bossPlan.some(function (q) { return q.boss === b.boss && q.zone === b.zone; })) problems.push('unknown boss ' + b.boss + ' for pack ' + PP.id); });
      const minGroups = Math.ceil(PP.groupsPer64k * area / 65536); // the creature-group floor scales with the island area
      if (world.spawnGroups.length < minGroups) problems.push('only ' + world.spawnGroups.length + ' spawn groups (pack needs ' + minGroups + ')');
      if (world.structures.length < PP.minStructures) problems.push('only ' + world.structures.length + ' structures (pack needs ' + PP.minStructures + ')');
      if (world.bossSites.length !== PP.bossPlan.length) problems.push('boss sites ' + world.bossSites.length + ' of ' + PP.bossPlan.length);
      const d = world.dock;
      if (!inb(d)) problems.push('dock missing');
      else {
        const di = d.y * w + d.x;
        if (!seen[di]) problems.push('dock unreachable at ' + d.x + ',' + d.y);
        if (world.solid[di] || world.zone[di] !== 0) problems.push('dock not on open shore ground');
        if (d.x === sp.x && d.y === sp.y) problems.push('dock fell back to the spawn');
      }
      (world.resources || []).forEach(function (r) { if (!inb(r) || world.solid[r.y * w + r.x]) problems.push('bad resource node ' + r.kind); });
    } else {
      world.spawnGroups.forEach(function (g) {
        const list = CREATURE_TIERS[g.type] && CREATURE_TIERS[g.type][g.tier];
        if ((!list || list.indexOf(g.creature) < 0) && !(g.elite && g.creature === RARE_ELITE.creature)) problems.push('bad creature ' + g.creature + ' for ' + g.type + ' tier ' + g.tier);
      });
      world.bossSites.forEach(function (b) { if (BOSS_IDS.indexOf(b.boss) < 0) problems.push('unknown boss ' + b.boss); });
    }
    if (vopts.determinism !== false) {
      // re-generate with every switch the world carries: bands, and (only when set) roster / bosses / pack (BIOME-ARCH-PLAN 1.2 rule 4)
      const again = generate(world.seed, { size: w, bands: world.bands === 'classic' ? 'classic' : undefined,
        roster: world.roster === 'classic' ? 'classic' : undefined, bosses: world.bosses === 'classic' ? 'classic' : undefined, pack: pk ? pk.id : undefined });
      if (fnv(again) !== fnv(world)) problems.push('not deterministic: regenerating gives a different world');
    }
    return { ok: problems.length === 0, problems: problems };
  }

  return {
    VERSION: VERSION, TERRAIN: TERRAIN, TERRAIN_NAMES: TERRAIN_NAMES, ZONES: ZONES, ZONE_BANDS: ZONE_BANDS, ZONE_BANDS_CLASSIC: ZONE_BANDS_CLASSIC, ZONE_BANDS_WIDE: ZONE_BANDS_WIDE, SAFE_SHORE: SAFE_SHORE, BIOMES: BIOMES,
    BOSSES: BOSSES, BOSS_POOLS: BOSS_POOLS, bossIdsFor: bossIdsFor, CREATURE_TIERS: CREATURE_TIERS, CREATURE_TIERS_CLASSIC: CREATURE_TIERS_CLASSIC, RARE_ELITE: RARE_ELITE, WAVE2: WAVE2, generate: generate, tileAt: tileAt, isSolid: isSolid, zoneAt: zoneAt,
    difficultyAt: difficultyAt, nearestSpawnGroups: nearestSpawnGroups, chunk: chunk, verify: verify, hash: fnv,
    // biome packs (BIOME-ARCH-PLAN 1.2): appended terrain ids, the parameter object generate() picks for opts, and the pack id it resolves to
    TERRAIN_EXT: TERRAIN_EXT, TERRAIN_ALL: TERRAIN_ALL, generateWith: generateWith, paramsFor: paramsFor, packOf: packOf,
  };
}));
