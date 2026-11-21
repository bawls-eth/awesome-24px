// MMBiomePacks: pure data for the biome islands (BIOME-ARCH-PLAN 1.2, slice A1). UMD: browser global MMBiomePacks, or require().
// A pack is read by MMOverworld.generate(seed, { pack: id }): the same island pipeline as the Realm overworld, but with the pack's bands,
// table classifier, terrain, props, resources, creatures and bosses, in its own seed space (pack.id + '|' + seed). No DOM, no randomness,
// no network. Terrain names are MMOverworld.TERRAIN_NAMES entries (realm ids 0..17 plus the appended biome ids from 18 up).
// Creature ids are provisional skeleton ids: shared/mm-creatures.js (slice A2) owns the definitions; `base` maps each one to the realm.js
// enemy type (spiral | aimed | ring) it counts as for shards, XP and save.kb.
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.MMBiomePacks = factory();
}(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  const VERSION = 1;

  // ---- palette hints: [base, shade, light, dark] like realm-world PAL, derived from one base colour ----
  function hex2(n) { n = Math.max(0, Math.min(255, Math.round(n))); return (n < 16 ? '0' : '') + n.toString(16); }
  function tone(hex, k) {
    const v = parseInt(hex.slice(1), 16), r = (v >> 16) & 255, g = (v >> 8) & 255, b = v & 255;
    const f = k >= 0 ? function (c) { return c + (255 - c) * k; } : function (c) { return c * (1 + k); };
    return '#' + hex2(f(r)) + hex2(f(g)) + hex2(f(b));
  }
  function pal(hex) { return [hex, tone(hex, -0.08), tone(hex, 0.12), tone(hex, -0.3)]; }
  function palettes(map) { const out = {}; Object.keys(map).forEach(function (k) { out[k] = pal(map[k]); }); return out; }

  // the island shape every pack shares: a wide shore ring (spawn + dock), then three interior rings (dw = warped distance, 0 = centre)
  function bands(names) {
    return [
      { id: 0, name: names[0], dwMin: 0.62, dwMax: 0.97 },
      { id: 1, name: names[1], dwMin: 0.34, dwMax: 0.62 },
      { id: 2, name: names[2], dwMin: 0.17, dwMax: 0.34 },
      { id: 3, name: names[3], dwMin: 0, dwMax: 0.17 },
    ];
  }
  // classifier rules: per band, ordered [terrain, [[field, op, value], ...]]; fields m (moisture), det (detail), dw (warped distance), all 0..1.
  // The first rule whose conditions all hold wins; the last rule of a band has no conditions (the default).

  const PACKS = {
    // ---- 0. Hearth Isle: the safe home meadow (no hostiles) ----
    meadow: {
      id: 'meadow', name: 'Hearth Isle', size: 128, sizes: [96, 160],
      bands: bands(['beach', 'meadow', 'orchard', 'hearth']),
      safeShore: 40,
      terrain: ['sand', 'wet_sand', 'shallow_water', 'deep_water', 'grass', 'tall_grass', 'flower_meadow', 'dirt_road', 'stone_road', 'gravel',
        'tilled_soil', 'tilled_wet', 'clover_patch', 'garden_path', 'dock_planks'],
      coast: ['deep_water', 'shallow_water', 'wet_sand', 'sand'],
      classify: [
        [['sand', [['dw', '>', 0.76], ['det', '>', 0.8]]], ['flower_meadow', [['m', '>', 0.72], ['det', '>', 0.5]]], ['tall_grass', [['m', '>', 0.55]]], ['grass', []]],
        [['clover_patch', [['m', '>', 0.66], ['det', '>', 0.55]]], ['flower_meadow', [['det', '>', 0.78]]], ['tall_grass', [['m', '>', 0.6]]], ['grass', []]],
        [['tilled_soil', [['m', '<', 0.32]]], ['tilled_wet', [['m', '>', 0.74]]], ['clover_patch', [['det', '>', 0.7]]], ['grass', []]],
        [['flower_meadow', [['det', '>', 0.6]]], ['clover_patch', [['m', '>', 0.6]]], ['grass', []]],
      ],
      solid: [], water: [],
      tiles: { pad: 'sand', ford: 'grass', road: ['dirt_road', 'garden_path', 'garden_path', 'stone_road'], floor: ['grass', 'grass', 'clover_patch', 'grass'],
        boss: ['dirt_road', 'dirt_road', 'stone_road', 'stone_road'], portal: 'stone_road', camp: 'dirt_road', shrine: 'stone_road', grave: ['grass', 'grass', 'grass', 'grass'],
        event: ['dirt_road', 'dirt_road', 'garden_path', 'stone_road'], tower: 'stone_road', wall: 'gravel', ruin: ['gravel', 'gravel', 'gravel', 'gravel'],
        lakeDeep: 'deep_water', lakeShallow: 'shallow_water', cliff: null, cliffBand: -1, dock: 'dock_planks', thaw: { deep_water: 'shallow_water', gravel: 'garden_path' } },
      lakes: { per64k: 4, min: 2, rivers: 1, skipBand: 3 },
      structures: [['camp', [1, 1, 0, 0], 3], ['shrine', [0, 1, 1, 0], 3], ['event_site', [0, 1, 1, 1], 6]],
      portals: [{ biome: 'rift', zone: 2 }],
      bosses: [],
      groups: { cell: [12, 11, 11, 11], count: [[1, 2], [1, 3], [1, 3], [1, 2]], prob: [0.45, 0.5, 0.5, 0.4] },
      creatures: { 0: ['clover_hopper', 'puffwool'], 1: ['puffwool', 'bumble_mote', 'pebble_tortle'], 2: ['bumble_mote', 'thistle_boar', 'pebble_tortle'], 3: ['meadow_strider', 'thistle_boar'] },
      base: { clover_hopper: 'spiral', puffwool: 'ring', bumble_mote: 'spiral', pebble_tortle: 'ring', thistle_boar: 'aimed', meadow_strider: 'aimed', oakback: 'ring' },
      rare: { oakback: { zone: 3 } },
      props: { grass: ['tree', 0.025], tall_grass: ['bush_berry', 0.04], flower_meadow: ['flower', 0.06], clover_patch: ['clover', 0.05], sand: ['shell', 0.006], wet_sand: ['shell', 0.005], tilled_soil: ['garden_plot', 0.02] },
      resources: [{ id: 'wood', terrain: ['grass', 'tall_grass'], chance: 0.006, respawn: 300 }, { id: 'stone', terrain: ['gravel', 'garden_path'], chance: 0.02, respawn: 300 },
        { id: 'fiber', terrain: ['tall_grass'], chance: 0.008, respawn: 180 }, { id: 'clover', terrain: ['clover_patch'], chance: 0.012, respawn: 180 }, { id: 'apple', terrain: ['grass'], chance: 0.003, respawn: 600 }],
      hazards: {},
      palette: palettes({ tilled_soil: '#6b4a2f', tilled_wet: '#4f3622', clover_patch: '#4f9a3f', garden_path: '#cbb890', dock_planks: '#8a5a3b' }),
      tint: { sky: '#bfe6ff', light: '#fff4d6' },
      verify: { groupsPer64k: 30, minStructures: 4, reachBand: 3 },
    },

    // ---- 1. Verdant Jungle (first playable) ----
    jungle: {
      id: 'jungle', name: 'Verdant Jungle', size: 160, sizes: [128, 192],
      bands: bands(['beach', 'canopy', 'deep_jungle', 'temple_heart']),
      safeShore: 40,
      terrain: ['deep_water', 'shallow_water', 'wet_sand', 'sand', 'jungle_floor', 'jungle_moss', 'fern_thicket', 'mud', 'mud_deep', 'river_murk', 'black_sand',
        'temple_stone', 'temple_moss', 'orchid_moss', 'vine_root', 'jungle_cliff', 'dock_planks'],
      coast: ['deep_water', 'shallow_water', 'wet_sand', 'sand'],
      classify: [
        [['black_sand', [['dw', '>', 0.76], ['det', '>', 0.78]]], ['jungle_moss', [['m', '>', 0.7]]], ['fern_thicket', [['det', '>', 0.82]]], ['jungle_floor', []]],
        [['vine_root', [['det', '>', 0.88]]], ['mud', [['m', '<', 0.3]]], ['orchid_moss', [['m', '>', 0.5], ['m', '<', 0.56], ['det', '>', 0.6]]], ['fern_thicket', [['det', '>', 0.76]]], ['jungle_moss', [['m', '>', 0.64]]], ['jungle_floor', []]],
        [['vine_root', [['det', '>', 0.86]]], ['mud_deep', [['m', '<', 0.3]]], ['mud', [['m', '<', 0.4]]], ['fern_thicket', [['det', '>', 0.7]]], ['jungle_moss', [['m', '>', 0.6]]], ['jungle_floor', []]],
        [['orchid_moss', [['det', '>', 0.85]]], ['temple_stone', [['m', '<', 0.42]]], ['temple_moss', [['m', '>', 0.6]]], ['jungle_moss', []]],
      ],
      solid: ['vine_root', 'jungle_cliff'], water: ['river_murk'],
      tiles: { pad: 'sand', ford: 'jungle_floor', road: ['jungle_floor', 'jungle_moss', 'temple_moss', 'temple_stone'], floor: ['jungle_floor', 'jungle_floor', 'jungle_moss', ['temple_stone', 'temple_moss', 150]],
        boss: ['jungle_floor', 'jungle_moss', 'temple_stone', 'temple_stone'], portal: 'temple_stone', camp: 'jungle_floor', shrine: 'temple_stone', grave: ['jungle_moss', 'jungle_moss', 'temple_moss', 'temple_moss'],
        event: ['jungle_floor', 'jungle_floor', 'temple_moss', 'temple_stone'], tower: 'temple_stone', wall: 'temple_stone', ruin: ['temple_moss', 'temple_moss', 'temple_stone', 'temple_stone'],
        lakeDeep: 'deep_water', lakeShallow: 'river_murk', cliff: 'jungle_cliff', cliffBand: 2, dock: 'dock_planks',
        thaw: { deep_water: 'river_murk', vine_root: 'jungle_floor', jungle_cliff: 'fern_thicket', temple_stone: 'temple_moss' } },
      lakes: { per64k: 6, min: 3, rivers: 2, skipBand: 3 },
      structures: [['camp', [2, 2, 0, 0], 3], ['temple_ruin', [0, 2, 2, 2], 5, 'ruin'], ['shrine', [0, 1, 2, 1], 3], ['totem', [0, 0, 1, 1], 4, 'tower'], ['event_site', [1, 1, 1, 1], 6]],
      portals: [{ biome: 'rift', zone: 2 }],
      bosses: [{ boss: 'fernjaw_tyrant', zone: 3 }],
      groups: { cell: [11, 10, 9, 8], count: [[1, 3], [2, 3], [2, 4], [1, 3]], prob: [0.5, 0.62, 0.7, 0.75] },
      creatures: { 0: ['parrotlet', 'shellback'], 1: ['raptor_jr', 'boarhog', 'shellback'], 2: ['raptor', 'stegolith', 'boarhog'], 3: ['raptor', 'stegolith'] },
      base: { parrotlet: 'spiral', shellback: 'ring', boarhog: 'ring', raptor_jr: 'aimed', raptor: 'aimed', stegolith: 'ring', fernjaw_tyrant: 'aimed' },
      // the jungle keeps its first-playable spawn ids (saves, tests and seeds use them); each one plays as this MMCreatures species
      // (games/isles/isle-creatures.js ALIAS mirrors it; boarhog herds are plain boars except every 3rd group, which is a full tusktop)
      species: { parrotlet: 'chompbill', shellback: 'canopy_glider', raptor_jr: 'fernraptor', raptor: 'fernraptor', boarhog: 'tusktop' },
      props: { jungle_floor: ['jungle_tree', 0.05], jungle_moss: ['giant_fern', 0.05], fern_thicket: ['hanging_vine', 0.04], mud: ['reeds', 0.02], black_sand: ['log', 0.01],
        sand: ['tree_palm', 0.012], wet_sand: ['shell', 0.005], temple_stone: ['temple_pillar', 0.015], temple_moss: ['temple_idol', 0.006], orchid_moss: ['banana_plant', 0.03] },
      resources: [{ id: 'wood', terrain: ['jungle_floor'], chance: 0.006, respawn: 300 }, { id: 'vine_rope', terrain: ['fern_thicket', 'jungle_moss'], chance: 0.008, respawn: 240 },
        { id: 'amber', terrain: ['temple_stone', 'temple_moss'], chance: 0.01, respawn: 600 }, { id: 'cocoa', terrain: ['jungle_moss'], chance: 0.004, respawn: 420 },
        { id: 'jungle_berry', terrain: ['jungle_floor', 'orchid_moss'], chance: 0.006, respawn: 180 }],
      hazards: { mud: { slow: 0.6 }, mud_deep: { slow: 0.5 }, fern_thicket: { slow: 0.85, spores: 'night' }, river_murk: { slow: 0.75 } },
      palette: palettes({ jungle_floor: '#1f6b4a', jungle_moss: '#3fa36b', fern_thicket: '#2c7d4f', mud: '#6e4f33', mud_deep: '#4a3524', river_murk: '#3d6b5a', black_sand: '#3a3634',
        temple_stone: '#7d8a78', temple_moss: '#a9b59e', orchid_moss: '#8f5d8a', vine_root: '#0f3b2e', jungle_cliff: '#2e4a3c', dock_planks: '#8a5a3b' }),
      tint: { sky: '#b8e0c8', light: '#f2ffe0' },
      verify: { groupsPer64k: 80, minStructures: 10, reachBand: 2 },
    },

    // ---- 2. Coral Reef: lagoons, coral gardens, wrecks; the abyss ring is boat-only ----
    reef: {
      id: 'reef', name: 'Coral Reef', size: 192, sizes: [128, 192],
      bands: bands(['shell_coast', 'lagoon_ring', 'coral_garden', 'wreck_heart']),
      safeShore: 40,
      terrain: ['abyss', 'lagoon', 'shell_beach', 'reef_sand', 'pearl_sand', 'seagrass', 'tide_pool', 'sandbar', 'coral_shallows', 'kelp_bed', 'wreck_planks', 'sea_rock', 'dock_planks'],
      coast: ['abyss', 'lagoon', 'shell_beach', 'reef_sand'],
      classify: [
        [['pearl_sand', [['dw', '>', 0.76], ['det', '>', 0.82]]], ['seagrass', [['m', '>', 0.68]]], ['tide_pool', [['det', '>', 0.86]]], ['reef_sand', []]],
        [['sea_rock', [['det', '>', 0.94]]], ['tide_pool', [['m', '>', 0.78]]], ['seagrass', [['m', '>', 0.55]]], ['sandbar', [['det', '>', 0.7]]], ['reef_sand', []]],
        [['sea_rock', [['det', '>', 0.92]]], ['coral_shallows', [['m', '>', 0.7]]], ['kelp_bed', [['m', '<', 0.3]]], ['seagrass', [['det', '>', 0.62]]], ['sandbar', []]],
        [['wreck_planks', [['det', '>', 0.7]]], ['pearl_sand', [['m', '>', 0.6]]], ['sandbar', []]],
      ],
      solid: ['abyss', 'sea_rock'], water: ['lagoon', 'coral_shallows', 'kelp_bed', 'tide_pool'],
      tiles: { pad: 'reef_sand', ford: 'sandbar', road: ['sandbar', 'sandbar', 'wreck_planks', 'wreck_planks'], floor: ['reef_sand', 'sandbar', 'sandbar', ['pearl_sand', 'wreck_planks', 150]],
        boss: ['sandbar', 'sandbar', 'pearl_sand', 'wreck_planks'], portal: 'pearl_sand', camp: 'reef_sand', shrine: 'pearl_sand', grave: ['seagrass', 'seagrass', 'seagrass', 'seagrass'],
        event: ['sandbar', 'sandbar', 'pearl_sand', 'wreck_planks'], tower: 'pearl_sand', wall: 'sea_rock', ruin: ['wreck_planks', 'wreck_planks', 'wreck_planks', 'wreck_planks'],
        lakeDeep: 'abyss', lakeShallow: 'lagoon', cliff: 'sea_rock', cliffBand: 2, dock: 'dock_planks', thaw: { abyss: 'lagoon', sea_rock: 'sandbar' } },
      lakes: { per64k: 10, min: 4, rivers: 2, skipBand: -1 },
      structures: [['camp', [2, 2, 0, 0], 3], ['wreck', [0, 2, 2, 2], 5, 'ruin'], ['lighthouse', [1, 0, 1, 0], 4, 'tower'], ['shrine', [0, 1, 1, 1], 3], ['event_site', [1, 1, 1, 1], 6]],
      portals: [{ biome: 'rift', zone: 2 }],
      bosses: [{ boss: 'tide_hydra', zone: 3 }],
      groups: { cell: [11, 10, 9, 8], count: [[1, 3], [2, 3], [2, 4], [1, 3]], prob: [0.5, 0.6, 0.68, 0.72] },
      creatures: { 0: ['reef_puffer', 'shellcrab'], 1: ['shellcrab', 'fin_raider', 'tidesteed'], 2: ['fin_raider', 'glowjelly', 'skimray'], 3: ['skimray', 'glowjelly'] },
      base: { reef_puffer: 'spiral', shellcrab: 'ring', glowjelly: 'ring', fin_raider: 'aimed', tidesteed: 'spiral', skimray: 'aimed', isleback_turtle: 'ring', tide_hydra: 'ring' },
      rare: { isleback_turtle: { zone: 2 } },
      props: { reef_sand: ['shell', 0.012], shell_beach: ['driftwood', 0.01], pearl_sand: ['pearl_clam', 0.012], seagrass: ['kelp_tall', 0.04], tide_pool: ['anemone', 0.04], sandbar: ['coral', 0.02], wreck_planks: ['wreck_mast', 0.01] },
      resources: [{ id: 'pearl', terrain: ['pearl_sand'], chance: 0.01, respawn: 600 }, { id: 'kelp', terrain: ['seagrass', 'kelp_bed'], chance: 0.01, respawn: 180 },
        { id: 'salt', terrain: ['tide_pool'], chance: 0.01, respawn: 300 }, { id: 'shell', terrain: ['reef_sand', 'shell_beach'], chance: 0.008, respawn: 180 }, { id: 'driftwood', terrain: ['shell_beach', 'sandbar'], chance: 0.006, respawn: 300 }],
      hazards: { coral_shallows: { breath: 20, slow: 0.7 }, kelp_bed: { breath: 20, slow: 0.65 }, lagoon: { slow: 0.75, swim: true }, tide_pool: { slow: 0.85 } },
      palette: palettes({ abyss: '#0b2a4a', lagoon: '#2fb5c9', shell_beach: '#f2e2b3', reef_sand: '#e9d6a0', pearl_sand: '#f6ecd6', seagrass: '#4f9a7a', tide_pool: '#58c4c9',
        sandbar: '#dcc58f', coral_shallows: '#ff7f6e', kelp_bed: '#3c6e4e', wreck_planks: '#7a5a3a', sea_rock: '#5a6470', dock_planks: '#8a5a3b' }),
      tint: { sky: '#bdf2ff', light: '#fffbe8' },
      verify: { groupsPer64k: 80, minStructures: 10, reachBand: 2 },
    },

    // ---- 3. Frostfang Tundra ----
    tundra: {
      id: 'tundra', name: 'Frostfang Tundra', size: 192, sizes: [128, 192],
      bands: bands(['ice_coast', 'taiga', 'glacier', 'aurora_heart']),
      safeShore: 40,
      terrain: ['deep_water', 'shallow_water', 'ice_sheet', 'packed_snow', 'snow', 'powder_snow', 'ice_thin', 'frost_rock', 'permafrost', 'tundra_moss', 'slush', 'frozen_road',
        'hot_spring', 'aurora_crystal', 'glacier_wall', 'dock_planks'],
      coast: ['deep_water', 'shallow_water', 'ice_sheet', 'packed_snow'],
      classify: [
        [['ice_thin', [['dw', '>', 0.76], ['det', '>', 0.84]]], ['tundra_moss', [['m', '>', 0.66]]], ['slush', [['m', '<', 0.28]]], ['packed_snow', []]],
        [['frost_rock', [['det', '>', 0.9]]], ['hot_spring', [['m', '>', 0.5], ['m', '<', 0.53], ['det', '>', 0.7]]], ['powder_snow', [['m', '>', 0.66]]], ['tundra_moss', [['m', '<', 0.34]]], ['snow', []]],
        [['glacier_wall', [['det', '>', 0.93]]], ['ice_sheet', [['m', '>', 0.72]]], ['frost_rock', [['m', '<', 0.36]]], ['permafrost', [['det', '>', 0.6]]], ['powder_snow', []]],
        [['aurora_crystal', [['det', '>', 0.84]]], ['ice_sheet', [['m', '>', 0.6]]], ['permafrost', []]],
      ],
      solid: ['glacier_wall', 'aurora_crystal'], water: ['hot_spring'],
      tiles: { pad: 'packed_snow', ford: 'packed_snow', road: ['frozen_road', 'frozen_road', 'frozen_road', 'frozen_road'], floor: ['packed_snow', 'snow', 'permafrost', ['permafrost', 'ice_sheet', 150]],
        boss: ['frozen_road', 'frozen_road', 'permafrost', 'permafrost'], portal: 'frozen_road', camp: 'packed_snow', shrine: 'frozen_road', grave: ['tundra_moss', 'tundra_moss', 'permafrost', 'permafrost'],
        event: ['packed_snow', 'packed_snow', 'permafrost', 'permafrost'], tower: 'frozen_road', wall: 'frost_rock', ruin: ['frost_rock', 'frost_rock', 'permafrost', 'permafrost'],
        lakeDeep: 'deep_water', lakeShallow: 'ice_thin', cliff: 'glacier_wall', cliffBand: 2, dock: 'dock_planks',
        thaw: { deep_water: 'ice_sheet', glacier_wall: 'packed_snow', aurora_crystal: 'permafrost', frost_rock: 'frost_rock' } },
      lakes: { per64k: 6, min: 3, rivers: 2, skipBand: 3 },
      structures: [['camp', [2, 2, 0, 0], 3], ['igloo_ruin', [0, 2, 2, 2], 5, 'ruin'], ['shrine', [0, 2, 1, 1], 3], ['ice_arch', [0, 0, 2, 1], 4, 'tower'], ['event_site', [1, 1, 1, 1], 6]],
      portals: [{ biome: 'rift', zone: 2 }],
      bosses: [{ boss: 'frost_dragon', zone: 3 }],
      groups: { cell: [11, 10, 9, 8], count: [[1, 3], [2, 3], [2, 4], [1, 3]], prob: [0.5, 0.62, 0.7, 0.75] },
      creatures: { 0: ['pengling', 'glacier_shellback'], 1: ['frostfox', 'glacier_shellback', 'icicle_bat'], 2: ['rimewolf', 'shagtusk', 'icicle_bat'], 3: ['sabrefang', 'rimewolf'] },
      base: { pengling: 'spiral', frostfox: 'aimed', icicle_bat: 'spiral', rimewolf: 'aimed', glacier_shellback: 'ring', shagtusk: 'ring', sabrefang: 'aimed', frost_dragon: 'ring' },
      props: { packed_snow: ['pine_snowy', 0.03], snow: ['snow_drift', 0.03], powder_snow: ['pine_snowy', 0.02], tundra_moss: ['frostberry_bush', 0.02], permafrost: ['ice_spike', 0.02],
        ice_sheet: ['frozen_mammoth_tusk', 0.003], hot_spring: ['hot_spring_steam', 0.2], frost_rock: ['crystal_blue', 0.02] },
      resources: [{ id: 'frost_crystal', terrain: ['permafrost', 'frost_rock'], chance: 0.01, respawn: 600 }, { id: 'ice', terrain: ['ice_sheet'], chance: 0.01, respawn: 240 },
        { id: 'frostberry', terrain: ['tundra_moss'], chance: 0.01, respawn: 180 }, { id: 'spring_salt', terrain: ['hot_spring'], chance: 0.05, respawn: 300 }, { id: 'wood', terrain: ['packed_snow', 'snow'], chance: 0.003, respawn: 300 }],
      hazards: { powder_snow: { slow: 0.7 }, ice_sheet: { slide: 0.9 }, ice_thin: { crack: 1, slow: 0.85 }, slush: { slow: 0.8 }, hot_spring: { warm: true }, cold: { warmthDrain: 0.01 } },
      palette: palettes({ ice_sheet: '#b8d8f0', packed_snow: '#d8e8ff', powder_snow: '#f4f8ff', ice_thin: '#9cc4e4', frost_rock: '#5d6f8a', permafrost: '#7a8aa0', tundra_moss: '#6f8a6a',
        slush: '#a4b4c4', frozen_road: '#8a96aa', hot_spring: '#7fd4d4', aurora_crystal: '#7fffd4', glacier_wall: '#3b4f8a', dock_planks: '#8a5a3b' }),
      tint: { sky: '#1b2240', light: '#d8e8ff' },
      verify: { groupsPer64k: 80, minStructures: 10, reachBand: 2 },
    },

    // ---- 4. Red Waste (Mars): a rust island in a dust sea; the landing pad is its dock ----
    mars: {
      id: 'mars', name: 'Red Waste', size: 192, sizes: [128, 192],
      bands: bands(['dust_rim', 'regolith_plain', 'crater_field', 'canyon_heart']),
      safeShore: 40,
      terrain: ['dust_sea', 'dust_shallows', 'red_dust', 'regolith', 'dune_red', 'basalt', 'oxide_rock', 'crater_floor', 'crater_rim', 'co2_frost', 'canyon_wall', 'lava_vent',
        'habitat_floor', 'landing_pad'],
      coast: ['dust_sea', 'dust_shallows', 'red_dust', 'regolith'],
      classify: [
        [['dune_red', [['m', '>', 0.68]]], ['oxide_rock', [['det', '>', 0.86]]], ['regolith', []]],
        [['crater_rim', [['det', '>', 0.94]]], ['dune_red', [['m', '>', 0.7]]], ['co2_frost', [['m', '<', 0.26]]], ['basalt', [['det', '>', 0.72]]], ['regolith', []]],
        [['canyon_wall', [['det', '>', 0.92]]], ['crater_floor', [['m', '>', 0.6]]], ['oxide_rock', [['m', '<', 0.36]]], ['basalt', []]],
        [['lava_vent', [['det', '>', 0.88]]], ['oxide_rock', [['m', '>', 0.62]]], ['basalt', []]],
      ],
      solid: ['dust_sea', 'crater_rim', 'canyon_wall'], water: ['dust_shallows'],
      tiles: { pad: 'landing_pad', ford: 'regolith', road: ['habitat_floor', 'habitat_floor', 'basalt', 'basalt'], floor: ['regolith', 'regolith', 'crater_floor', ['basalt', 'oxide_rock', 150]],
        boss: ['regolith', 'regolith', 'crater_floor', 'basalt'], portal: 'habitat_floor', camp: 'habitat_floor', shrine: 'habitat_floor', grave: ['red_dust', 'red_dust', 'oxide_rock', 'oxide_rock'],
        event: ['regolith', 'regolith', 'crater_floor', 'basalt'], tower: 'habitat_floor', wall: 'basalt', ruin: ['habitat_floor', 'habitat_floor', 'basalt', 'basalt'],
        lakeDeep: 'crater_rim', lakeShallow: 'crater_floor', cliff: 'canyon_wall', cliffBand: 2, dock: 'landing_pad',
        thaw: { dust_sea: 'dust_shallows', crater_rim: 'crater_floor', canyon_wall: 'basalt', basalt: 'regolith' } },
      lakes: { per64k: 7, min: 3, rivers: 1, skipBand: 3 },
      structures: [['outpost', [2, 2, 0, 0], 3, 'camp'], ['probe_wreck', [0, 2, 2, 2], 5, 'ruin'], ['antenna', [0, 1, 2, 1], 4, 'tower'], ['greenhouse', [0, 1, 1, 0], 3, 'shrine'], ['event_site', [1, 1, 1, 1], 6]],
      portals: [{ biome: 'rift', zone: 2 }],
      bosses: [{ boss: 'red_titan', zone: 3 }],
      groups: { cell: [11, 10, 9, 8], count: [[1, 3], [2, 3], [2, 4], [1, 3]], prob: [0.5, 0.62, 0.7, 0.75] },
      creatures: { 0: ['regolith_roly', 'bubblemoth'], 1: ['rustbeetle', 'bubblemoth', 'dust_devil'], 2: ['dust_devil', 'crater_strider', 'rustbeetle'], 3: ['crater_strider', 'dust_devil'] },
      base: { regolith_roly: 'ring', bubblemoth: 'spiral', rustbeetle: 'ring', dust_devil: 'spiral', crater_strider: 'aimed', red_titan: 'ring' },
      props: { regolith: ['meteor_rock', 0.02], red_dust: ['rover_wreck', 0.002], basalt: ['crystal_red', 0.015], oxide_rock: ['meteor_rock', 0.02], crater_floor: ['oxygen_plant', 0.01],
        habitat_floor: ['solar_panel', 0.02], co2_frost: ['probe_lander', 0.003] },
      resources: [{ id: 'iron', terrain: ['basalt', 'oxide_rock'], chance: 0.01, respawn: 420 }, { id: 'oxide_dust', terrain: ['regolith', 'dune_red'], chance: 0.008, respawn: 180 },
        { id: 'ice_core', terrain: ['co2_frost'], chance: 0.02, respawn: 600 }, { id: 'meteor_glass', terrain: ['crater_floor'], chance: 0.008, respawn: 600 }],
      hazards: { dune_red: { slow: 0.85 }, lava_vent: { burn: 1, telegraph: 1 }, dust_shallows: { slow: 0.8 }, oxygen: { seconds: 90 }, gravity: { move: 1.15, dash: 1.4 } },
      palette: palettes({ dust_sea: '#3a1410', dust_shallows: '#7a2e1c', red_dust: '#c0582f', regolith: '#b4562e', dune_red: '#e8945a', basalt: '#4a2a24', oxide_rock: '#8a3a22',
        crater_floor: '#a0502e', crater_rim: '#5a2216', co2_frost: '#f4c99a', canyon_wall: '#3a1a14', lava_vent: '#ff6a2a', habitat_floor: '#9aa4ae', landing_pad: '#c8ccd0' }),
      tint: { sky: '#f0a0a0', light: '#ffe0c8' },
      verify: { groupsPer64k: 80, minStructures: 10, reachBand: 2 },
    },
  };
  // names used elsewhere in the plans: 'home' (MMIsles) and 'ice' resolve to the canonical packs (same id, same seed space)
  const ALIASES = { home: 'meadow', ice: 'tundra' };
  const IDS = Object.keys(PACKS);
  const own = Object.prototype.hasOwnProperty;

  function freeze(o) { if (o && typeof o === 'object' && !Object.isFrozen(o)) { Object.freeze(o); Object.keys(o).forEach(function (k) { freeze(o[k]); }); } return o; }
  IDS.forEach(function (id) { freeze(PACKS[id]); });

  // resolve an id (or alias) to its frozen pack; anything else (non-string, unknown, prototype keys, junk) -> null
  function resolveId(id) {
    if (typeof id !== 'string' || id.length > 24 || !/^[a-z][a-z0-9_]*$/.test(id)) return null;
    if (own.call(ALIASES, id)) id = ALIASES[id];
    return own.call(PACKS, id) ? id : null;
  }
  function get(id) { const k = resolveId(id); return k ? PACKS[k] : null; }

  // structural check of a pack against a terrain name list (MMOverworld.TERRAIN_NAMES); returns a list of problems
  function validate(p, terrainNames) {
    const out = [];
    const known = function (n) { return !terrainNames || terrainNames.indexOf(n) >= 0; };
    if (!p || typeof p !== 'object') return ['not an object'];
    if (!/^[a-z][a-z0-9_]*$/.test(p.id || '')) out.push('bad id');
    if (!(p.size >= 64 && p.size <= 256)) out.push('bad size');
    if (!Array.isArray(p.bands) || p.bands.length < 2 || p.bands.length > 4) out.push('bands must be 2..4');
    const nb = Array.isArray(p.bands) ? p.bands.length : 0;
    (p.bands || []).forEach(function (b, i) { if (b.id !== i || !(b.dwMin >= 0 && b.dwMax > b.dwMin)) out.push('bad band ' + i); if (i > 0 && p.bands[i - 1].dwMin !== b.dwMax) out.push('band gap at ' + i); });
    if (!Array.isArray(p.coast) || p.coast.length !== 4) out.push('coast must list deep, shallow, wet, sand');
    if (!Array.isArray(p.classify) || p.classify.length !== nb) out.push('one classifier per band');
    const names = [];
    (p.coast || []).forEach(function (n) { names.push(n); });
    (p.classify || []).forEach(function (rules, z) {
      if (!Array.isArray(rules) || !rules.length) { out.push('empty classifier band ' + z); return; }
      const last = rules[rules.length - 1];
      if (!last || last[1].length !== 0) out.push('band ' + z + ' needs a default rule last');
      rules.forEach(function (r) {
        names.push(r[0]);
        (r[1] || []).forEach(function (c) { if (['m', 'det', 'dw'].indexOf(c[0]) < 0 || ['<', '>'].indexOf(c[1]) < 0 || typeof c[2] !== 'number') out.push('bad condition in band ' + z); });
      });
    });
    const t = p.tiles || {};
    ['pad', 'ford', 'portal', 'camp', 'shrine', 'tower', 'wall', 'lakeDeep', 'lakeShallow', 'dock'].forEach(function (k) { if (typeof t[k] !== 'string') out.push('tiles.' + k + ' missing'); else names.push(t[k]); });
    ['road', 'floor', 'boss', 'grave', 'event', 'ruin'].forEach(function (k) {
      if (!Array.isArray(t[k]) || t[k].length !== nb) out.push('tiles.' + k + ' needs one entry per band');
      else t[k].forEach(function (e) { if (Array.isArray(e)) { names.push(e[0]); names.push(e[1]); } else names.push(e); });
    });
    if (t.cliff) names.push(t.cliff);
    Object.keys(t.thaw || {}).forEach(function (k) { names.push(k); names.push(t.thaw[k]); });
    [].concat(p.solid || [], p.water || []).forEach(function (n) { names.push(n); });
    names.forEach(function (n) { if (typeof n !== 'string' || !known(n)) out.push('unknown terrain ' + n); if (p.terrain && p.terrain.indexOf(n) < 0) out.push('terrain ' + n + ' not in the pack terrain list'); });
    (p.solid || []).forEach(function (n) { if (n === t.pad || n === t.ford || n === t.dock) out.push('pad/ford/dock may not be solid: ' + n); });
    Object.keys(p.props || {}).forEach(function (n) { if (!known(n)) out.push('prop on unknown terrain ' + n); const r = p.props[n]; if (!Array.isArray(r) || typeof r[0] !== 'string' || !(r[1] > 0 && r[1] < 1)) out.push('bad prop rule ' + n); });
    (p.resources || []).forEach(function (r) { if (!r || !/^[a-z][a-z0-9_]*$/.test(r.id) || !Array.isArray(r.terrain) || !r.terrain.every(known) || !(r.chance > 0 && r.chance < 1) || !(r.respawn > 0)) out.push('bad resource ' + (r && r.id)); });
    const g = p.groups || {};
    ['cell', 'count', 'prob'].forEach(function (k) { if (!Array.isArray(g[k]) || g[k].length !== nb) out.push('groups.' + k + ' needs one entry per band'); });
    for (let z = 0; z < nb; z++) {
      const list = p.creatures && p.creatures[z];
      if (!Array.isArray(list)) { out.push('creatures band ' + z + ' missing'); continue; }
      list.forEach(function (id) { if (!/^[a-z][a-z0-9_]*$/.test(id)) out.push('bad creature id ' + id); if (!p.base || ['spiral', 'aimed', 'ring'].indexOf(p.base[id]) < 0) out.push('creature ' + id + ' has no base type'); });
    }
    (p.bosses || []).forEach(function (b) { if (!b || !/^[a-z][a-z0-9_]*$/.test(b.boss) || !(b.zone >= 0 && b.zone < nb)) out.push('bad boss'); });
    (p.portals || []).forEach(function (b) { if (!b || !/^[a-z][a-z0-9_]*$/.test(b.biome) || !(b.zone >= 0 && b.zone < nb)) out.push('bad portal'); });
    (p.structures || []).forEach(function (s) { if (!Array.isArray(s) || !Array.isArray(s[1]) || s[1].length !== nb || ['camp', 'ruin', 'shrine', 'tower', 'graveyard', 'event_site'].indexOf(s[3] || s[0]) < 0) out.push('bad structure plan ' + (s && s[0])); });
    if (!p.verify || !(p.verify.groupsPer64k > 0) || !(p.verify.reachBand >= 0 && p.verify.reachBand < nb)) out.push('verify thresholds missing');
    Object.keys(p.palette || {}).forEach(function (n) { const c = p.palette[n]; if (!known(n) || !Array.isArray(c) || c.length !== 4 || !c.every(function (x) { return /^#[0-9a-f]{6}$/.test(x); })) out.push('bad palette ' + n); });
    return out;
  }

  // every creature id a pack can place (spawn tables plus rares and bosses), for art preloading and the creature-def cross-check
  function creatureIds(id) {
    const p = get(id); if (!p) return [];
    const s = [];
    Object.keys(p.creatures).forEach(function (z) { p.creatures[z].forEach(function (c) { if (s.indexOf(c) < 0) s.push(c); }); });
    Object.keys(p.rare || {}).forEach(function (c) { if (s.indexOf(c) < 0) s.push(c); });
    return s;
  }

  // ---- species canon (slice X1): every legacy / placeholder spawn id -> the MMCreatures species it plays as ----
  // The spawn tables above keep their ids (saves, seeds and the golden hashes use them); this table is the single place that says
  // which real def each one is. The jungle first-playable ids moved here from games/isles/isle-creatures.js ALIAS; `shellback_glacier`
  // and `canopy_queen` are the old tundra / jungle-boss names from the plans. Ids not listed are already MMCreatures ids.
  const CANON = Object.freeze({
    parrotlet: 'chompbill', shellback: 'canopy_glider', raptor_jr: 'fernraptor', raptor: 'fernraptor', boarhog: 'tusktop',
    canopy_queen: 'fernjaw_tyrant', shellback_glacier: 'glacier_shellback',
  });
  // canon(id) -> the species id (CANON entry, else the id itself); junk (non-string, bad shape, prototype keys) -> null
  function canon(cid) {
    if (typeof cid !== 'string' || cid.length > 32 || !/^[a-z][a-z0-9_]*$/.test(cid)) return null;
    return own.call(CANON, cid) ? CANON[cid] : cid;
  }
  // the MMCreatures species id a pack creature or boss id stands for: the pack's species table, else the canon, else the id itself
  function speciesOf(id, cid) {
    const p = get(id); if (!p || typeof cid !== 'string') return null;
    if (p.species && own.call(p.species, cid)) return p.species[cid];
    return canon(cid) || cid;
  }
  // every id a pack places: spawn tables, rares and bosses
  function allIds(id) {
    const p = get(id); if (!p) return [];
    const s = creatureIds(id);
    (p.bosses || []).forEach(function (b) { if (s.indexOf(b.boss) < 0) s.push(b.boss); });
    return s;
  }

  return { VERSION: VERSION, IDS: IDS, ALIASES: ALIASES, get: get, resolveId: resolveId, validate: validate, creatureIds: creatureIds, allIds: allIds, speciesOf: speciesOf, palette: pal,
    CANON: CANON, canon: canon };
}));
