// Biome creature roster: pure data + validation. UMD: browser global MMCreatures, or require().
// No Phaser, no DOM, no randomness, no network. Every table is data: edit the rows below to change the roster.
// Part of the Biome Archipelago plan (A2). Taming rules live in mm-tame.js; this file only describes creatures.
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.MMCreatures = factory();
}(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const BIOMES = ['meadow', 'jungle', 'tundra', 'reef', 'mars'];
  const TIERS = ['passive', 'neutral', 'hostile', 'boss'];
  const METHODS = ['feed', 'calm', 'knockout'];
  const BASES = ['spiral', 'aimed', 'ring'];                 // realm.js enemy types a creature counts as (shards, XP, kb)
  const ROLES = ['fighter', 'gatherer', 'builder', 'support', 'cosmetic', 'mount'];
  const BEHAVIOURS = ['wander', 'flee', 'aggro', 'retaliate', 'pack', 'lunge', 'pounce', 'charge', 'spit', 'swoop', 'night',
    'swim', 'fly', 'leap', 'burrow', 'roar', 'glide', 'slide', 'roll', 'float'];
  // display px, hit radius px, default windup (s), min windup for L/XL attackers (validated)
  const SIZES = {
    S: { px: 48, rad: 12, windup: 0.25 },
    M: { px: 64, rad: 18, windup: 0.35 },
    L: { px: 96, rad: 26, windup: 0.5 },
    XL: { px: 128, rad: 36, windup: 0.6 },
  };
  const BIG_MIN_WINDUP = 0.4;
  // food id -> { kind, quality }. quality scales taming progress (1 plain, more for crafted/golden food).
  const FOODS = {
    clover: { kind: 'plant', quality: 1 }, flower: { kind: 'plant', quality: 1 }, nectar: { kind: 'plant', quality: 1 },
    apple: { kind: 'fruit', quality: 1 }, golden_apple: { kind: 'fruit', quality: 1 },
    jungle_berry: { kind: 'berry', quality: 1 }, frostberry: { kind: 'berry', quality: 1 },
    kelp: { kind: 'plant', quality: 1 }, sea_melon: { kind: 'fruit', quality: 1 },
    bug: { kind: 'bug', quality: 1 }, fish: { kind: 'fish', quality: 1 }, raw_meat: { kind: 'meat', quality: 1 },
    oxide_dust: { kind: 'mineral', quality: 1 }, iron: { kind: 'mineral', quality: 1 }, meteor_glass: { kind: 'mineral', quality: 1 },
    greenhouse_potato: { kind: 'plant', quality: 1 }, hay: { kind: 'plant', quality: 1 },
    feast: { kind: 'meat', quality: 1.5 },
  };
  // drop table key -> [[item, min, max, weight], ...]. Rolled by the game with its own seeded RNG.
  const DROP_TABLES = {
    fluff: [['fiber', 1, 2, 3], ['feather', 1, 1, 1]],
    wool: [['wool', 1, 3, 1]],
    honey: [['honey', 1, 2, 1]],
    meat_small: [['raw_meat', 1, 2, 3], ['hide', 1, 1, 1]],
    meat_big: [['raw_meat', 2, 4, 3], ['hide', 1, 2, 2], ['bone', 1, 1, 1]],
    jungle_loot: [['vine_rope', 1, 2, 2], ['jungle_berry', 1, 3, 2], ['amber', 1, 1, 1]],
    jungle_boss: [['amber', 3, 5, 3], ['tyrant_scale', 1, 1, 1], ['hide', 2, 3, 2]],
    frost_loot: [['ice', 1, 2, 2], ['frost_crystal', 1, 1, 1], ['frostberry', 1, 3, 2]],
    frost_boss: [['frost_heart', 1, 1, 1], ['frost_crystal', 3, 5, 3]],
    reef_loot: [['shell', 1, 3, 3], ['pearl', 1, 1, 1], ['kelp', 1, 3, 2]],
    glow_gel: [['glow_gel', 1, 2, 1]],
    reef_boss: [['pearl', 3, 5, 3], ['rift_stone', 1, 1, 1]],
    mars_loot: [['iron', 1, 3, 3], ['oxide_dust', 1, 3, 2], ['data_chip', 1, 1, 1]],
    mars_boss: [['meteor_glass', 3, 5, 3], ['iron', 4, 6, 2]],
    nothing: [],
  };

  // ---- Roster. Each row is the data; defaults per size are applied by build(). ----
  // tame: null (cannot be tamed) or { method, torpor (knockout only), feedEvery (s), need (feeds), sleep (s a KO lasts), time (target seconds) }
  // ride: null or { saddle: crafted-item id or null (no saddle), speed (x hero), ability, swim, fly, lift (px) }
  const T = (method, torpor, feedEvery, need, sleep, time) => ({ method, torpor, feedEvery, need, sleep, time });
  const ROWS = [
    // ---- Hearth Isle meadow (safe) ----
    { id: 'clover_hopper', name: 'Clover Hopper', biome: 'meadow', tier: 'passive', size: 'S', lv: [1, 3], hp: 20, dmg: 0, speed: 170,
      behaviours: ['wander', 'flee'], diet: ['clover', 'flower'], tame: T('feed', 0, 6, 5, 0, 26), companion: { role: 'cosmetic', dps: 0, range: 0 }, drops: ['fluff'] },
    { id: 'puffwool', name: 'Puffwool', biome: 'meadow', tier: 'passive', size: 'S', lv: [1, 4], hp: 40, dmg: 0, speed: 90,
      behaviours: ['wander', 'flee'], diet: ['clover', 'hay'], tame: T('feed', 0, 6, 5, 0, 26), companion: { role: 'gatherer', dps: 0, range: 0 }, drops: ['wool'] },
    { id: 'bumble_mote', name: 'Bumble Mote', biome: 'meadow', tier: 'passive', size: 'S', lv: [1, 4], hp: 15, dmg: 0, speed: 120,
      behaviours: ['wander', 'fly', 'flee'], diet: ['flower', 'nectar'], tame: T('feed', 0, 6, 5, 0, 26), companion: { role: 'gatherer', dps: 0, range: 0 }, drops: ['honey'] },
    { id: 'pebble_tortle', name: 'Pebble Tortle', biome: 'meadow', tier: 'neutral', size: 'S', lv: [2, 5], hp: 90, dmg: 0.5, speed: 60, base: 'aimed',
      behaviours: ['wander', 'retaliate'], attack: { pattern: 'bump', windup: 0.3 }, diet: ['apple', 'clover'], tame: T('feed', 0, 6, 5, 0, 26),
      companion: { role: 'builder', dps: 1, range: 24 }, drops: ['fluff'] },
    { id: 'thistle_boar', name: 'Thistle Boar', biome: 'meadow', tier: 'neutral', size: 'M', lv: [3, 5], hp: 140, dmg: 0.8, speed: 140, base: 'aimed',
      behaviours: ['wander', 'retaliate', 'charge'], attack: { pattern: 'charge', windup: 0.4 }, diet: ['apple', 'clover'], tame: T('calm', 0, 8, 6, 0, 42),
      companion: { role: 'fighter', dps: 3, range: 30 }, drops: ['meat_small'] },
    { id: 'meadow_strider', name: 'Meadow Strider', biome: 'meadow', tier: 'passive', size: 'L', lv: [4, 5], hp: 300, dmg: 0.4, speed: 210,
      behaviours: ['wander', 'flee'], diet: ['golden_apple', 'apple'], tame: T('feed', 0, 10, 10, 0, 102),
      ride: { saddle: null, speed: 1.35, ability: 'sprint', swim: false, fly: false, lift: 16 }, companion: { role: 'mount', dps: 0, range: 0 }, drops: ['fluff'] },
    { id: 'oakback', name: 'Oakback', biome: 'meadow', tier: 'passive', size: 'XL', lv: [5, 5], hp: 900, dmg: 0, speed: 40,
      behaviours: ['wander'], diet: ['golden_apple'], tame: T('feed', 0, 14, 12, 0, 170),
      companion: { role: 'gatherer', dps: 0, range: 0 }, drops: ['fluff'], legendary: true },

    // ---- Verdant Jungle ----
    { id: 'glimmerfrog', name: 'Glimmerfrog', biome: 'jungle', tier: 'passive', size: 'S', lv: [3, 6], hp: 25, dmg: 0, speed: 150,
      behaviours: ['wander', 'flee', 'leap'], diet: ['bug'], tame: T('feed', 0, 6, 5, 0, 26), companion: { role: 'support', dps: 0, range: 0 }, drops: ['fluff'] },
    { id: 'chompbill', name: 'Chompbill', biome: 'jungle', tier: 'passive', size: 'S', lv: [3, 8], hp: 60, dmg: 0.5, speed: 110,
      behaviours: ['wander', 'flee'], diet: ['jungle_berry', 'bug'], tame: T('feed', 0, 6, 5, 0, 26), companion: { role: 'gatherer', dps: 0, range: 0 }, drops: ['jungle_loot'] },
    { id: 'fernraptor', name: 'Fern Raptor', biome: 'jungle', tier: 'hostile', size: 'S', lv: [5, 12], hp: 85, dmg: 1.2, speed: 190, base: 'aimed',
      behaviours: ['aggro', 'pack', 'lunge'], attack: { pattern: 'pounce', windup: 0.3 }, aggroR: 240, diet: ['raw_meat'], tame: T('knockout', 80, 6, 5, 60, 32),
      companion: { role: 'fighter', dps: 6, range: 36 }, drops: ['meat_small'] },
    { id: 'vinecoil', name: 'Vinecoil', biome: 'jungle', tier: 'hostile', size: 'S', lv: [6, 12], hp: 110, dmg: 1, speed: 80, base: 'ring',
      behaviours: ['aggro', 'spit'], attack: { pattern: 'ring_spit', windup: 0.35 }, aggroR: 220, diet: [], tame: null, drops: ['jungle_loot'] },
    { id: 'canopy_glider', name: 'Canopy Glider', biome: 'jungle', tier: 'neutral', size: 'S', lv: [6, 12], hp: 70, dmg: 0.8, speed: 160, base: 'spiral',
      behaviours: ['wander', 'retaliate', 'glide', 'fly'], attack: { pattern: 'swoop', windup: 0.3 }, diet: ['jungle_berry', 'nectar'], tame: T('calm', 0, 6, 5, 0, 26),
      companion: { role: 'support', dps: 2, range: 40 }, drops: ['fluff'] },
    { id: 'tusktop', name: 'Tusktop', biome: 'jungle', tier: 'neutral', size: 'L', lv: [8, 14], hp: 420, dmg: 1.8, speed: 120, base: 'aimed',
      behaviours: ['wander', 'retaliate', 'charge'], attack: { pattern: 'charge', windup: 0.5 }, diet: ['jungle_berry', 'raw_meat'], tame: T('knockout', 450, 10, 8, 110, 100),
      ride: { saddle: 'saddle_tusktop', speed: 1.3, ability: 'charge', swim: false, fly: false, lift: 18 }, companion: { role: 'mount', dps: 8, range: 44 }, drops: ['meat_big', 'jungle_loot'] },
    { id: 'stegolith', name: 'Stegolith', biome: 'jungle', tier: 'neutral', size: 'XL', lv: [10, 14], hp: 900, dmg: 2, speed: 90, base: 'ring',
      behaviours: ['wander', 'retaliate', 'roar'], attack: { pattern: 'tail_sweep', windup: 0.6 }, diet: ['jungle_berry'], tame: T('knockout', 850, 12, 10, 180, 156),
      ride: { saddle: 'saddle_stegolith', speed: 1.15, ability: 'stomp', swim: false, fly: false, lift: 24 }, companion: { role: 'mount', dps: 10, range: 52 }, drops: ['meat_big'] },
    { id: 'fernjaw_tyrant', name: 'Fernjaw Tyrant', biome: 'jungle', tier: 'boss', size: 'XL', lv: [14, 14], hp: 2600, dmg: 3.4, speed: 140, base: 'aimed',
      behaviours: ['aggro', 'lunge', 'roar'], attack: { pattern: 'tyrant_bite', windup: 0.6 }, aggroR: 360, diet: ['feast'], tame: T('knockout', 900, 10, 7, 150, 122),
      ride: { saddle: 'saddle_tyrant', speed: 1.5, ability: 'roar', swim: false, fly: false, lift: 28 }, companion: { role: 'mount', dps: 14, range: 60 }, drops: ['jungle_boss'] },

    // ---- Frostfang Tundra ----
    { id: 'pengling', name: 'Pengling', biome: 'tundra', tier: 'passive', size: 'S', lv: [12, 14], hp: 45, dmg: 0, speed: 100,
      behaviours: ['wander', 'flee', 'slide'], diet: ['fish'], tame: T('feed', 0, 6, 5, 0, 26), companion: { role: 'cosmetic', dps: 0, range: 0 }, drops: ['fluff'] },
    { id: 'frostfox', name: 'Frostfox', biome: 'tundra', tier: 'neutral', size: 'S', lv: [12, 18], hp: 120, dmg: 1.4, speed: 200, base: 'aimed',
      behaviours: ['wander', 'retaliate', 'lunge'], attack: { pattern: 'pounce', windup: 0.3 }, diet: ['fish', 'frostberry'], tame: T('calm', 0, 6, 5, 0, 26),
      companion: { role: 'fighter', dps: 7, range: 34 }, drops: ['meat_small'] },
    { id: 'icicle_bat', name: 'Icicle Bat', biome: 'tundra', tier: 'hostile', size: 'S', lv: [13, 20], hp: 80, dmg: 1.2, speed: 170, base: 'spiral',
      behaviours: ['aggro', 'night', 'swoop', 'fly'], attack: { pattern: 'swoop', windup: 0.3 }, aggroR: 260, diet: [], tame: null, drops: ['frost_loot'] },
    { id: 'rimewolf', name: 'Rimewolf', biome: 'tundra', tier: 'hostile', size: 'S', lv: [14, 22], hp: 170, dmg: 1.7, speed: 210, base: 'aimed',
      behaviours: ['aggro', 'pack', 'lunge'], attack: { pattern: 'pounce', windup: 0.3 }, aggroR: 260, diet: ['raw_meat'], tame: T('knockout', 100, 6, 5, 60, 34),
      companion: { role: 'fighter', dps: 8, range: 36 }, drops: ['meat_small'] },
    { id: 'glacier_shellback', name: 'Glacier Shellback', biome: 'tundra', tier: 'neutral', size: 'M', lv: [14, 20], hp: 260, dmg: 0.8, speed: 60, base: 'aimed',
      behaviours: ['wander', 'retaliate'], attack: { pattern: 'bump', windup: 0.35 }, diet: ['frostberry'], tame: T('feed', 0, 8, 7, 0, 50),
      companion: { role: 'builder', dps: 2, range: 28 }, drops: ['frost_loot'] },
    { id: 'shagtusk', name: 'Shagtusk', biome: 'tundra', tier: 'neutral', size: 'L', lv: [16, 22], hp: 700, dmg: 2.2, speed: 130, base: 'aimed',
      behaviours: ['wander', 'retaliate', 'charge'], attack: { pattern: 'charge', windup: 0.5 }, diet: ['frostberry', 'raw_meat'], tame: T('knockout', 500, 10, 8, 110, 100),
      ride: { saddle: 'saddle_shagtusk', speed: 1.25, ability: 'warm_aura', swim: false, fly: false, lift: 20 }, companion: { role: 'mount', dps: 9, range: 46 }, drops: ['meat_big', 'frost_loot'] },
    { id: 'sabrefang', name: 'Sabrefang', biome: 'tundra', tier: 'hostile', size: 'L', lv: [18, 22], hp: 520, dmg: 2.8, speed: 240, base: 'aimed',
      behaviours: ['aggro', 'lunge', 'pounce'], attack: { pattern: 'pounce', windup: 0.45 }, aggroR: 300, diet: ['raw_meat'], tame: T('knockout', 520, 10, 8, 110, 102),
      ride: { saddle: 'saddle_sabrefang', speed: 1.5, ability: 'pounce', swim: false, fly: false, lift: 18 }, companion: { role: 'mount', dps: 12, range: 48 }, drops: ['meat_big'] },
    { id: 'frost_dragon', name: 'Frost Dragon', biome: 'tundra', tier: 'boss', size: 'XL', lv: [22, 22], hp: 4200, dmg: 4.4, speed: 120, base: 'ring',
      behaviours: ['aggro', 'fly', 'spit'], attack: { pattern: 'frost_breath', windup: 0.7 }, aggroR: 380, diet: [], tame: null, drops: ['frost_boss'] },

    // ---- Coral Reef + Open Sea ----
    { id: 'reef_puffer', name: 'Reef Puffer', biome: 'reef', tier: 'passive', size: 'S', lv: [8, 10], hp: 40, dmg: 0, speed: 90,
      behaviours: ['wander', 'flee', 'swim'], diet: ['kelp'], tame: T('feed', 0, 6, 5, 0, 26), companion: { role: 'support', dps: 0, range: 0 }, drops: ['reef_loot'] },
    { id: 'shellcrab', name: 'Shellcrab', biome: 'reef', tier: 'neutral', size: 'S', lv: [8, 14], hp: 160, dmg: 1.2, speed: 70, base: 'aimed',
      behaviours: ['wander', 'retaliate'], attack: { pattern: 'pinch', windup: 0.3 }, diet: ['fish'], tame: T('feed', 0, 6, 5, 0, 26),
      companion: { role: 'builder', dps: 2, range: 26 }, drops: ['reef_loot'] },
    { id: 'glowjelly', name: 'Glowjelly', biome: 'reef', tier: 'hostile', size: 'S', lv: [9, 16], hp: 70, dmg: 1.3, speed: 50, base: 'ring',
      behaviours: ['aggro', 'night', 'swim', 'spit', 'float'], attack: { pattern: 'ring_spit', windup: 0.35 }, aggroR: 200, diet: [], tame: null, drops: ['glow_gel'] },
    { id: 'fin_raider', name: 'Fin Raider', biome: 'reef', tier: 'hostile', size: 'S', lv: [10, 18], hp: 150, dmg: 1.8, speed: 200, base: 'aimed',
      behaviours: ['aggro', 'swim', 'lunge'], attack: { pattern: 'dash', windup: 0.3 }, aggroR: 260, diet: ['fish'], tame: T('knockout', 90, 6, 5, 60, 33),
      companion: { role: 'fighter', dps: 6, range: 34 }, drops: ['reef_loot'] },
    { id: 'tidesteed', name: 'Tidesteed', biome: 'reef', tier: 'passive', size: 'L', lv: [10, 16], hp: 300, dmg: 0.5, speed: 230,
      behaviours: ['wander', 'flee', 'swim'], diet: ['kelp'], tame: T('feed', 0, 10, 10, 0, 102),
      ride: { saddle: 'saddle_tidesteed', speed: 1.4, ability: 'dive', swim: true, fly: false, lift: 10 }, companion: { role: 'mount', dps: 0, range: 0 }, drops: ['reef_loot'] },
    { id: 'skimray', name: 'Skimray', biome: 'reef', tier: 'neutral', size: 'L', lv: [12, 18], hp: 360, dmg: 1.6, speed: 260, base: 'spiral',
      behaviours: ['wander', 'retaliate', 'swim', 'glide'], attack: { pattern: 'swoop', windup: 0.45 }, diet: ['fish', 'kelp'], tame: T('calm', 0, 9, 9, 0, 74),
      ride: { saddle: 'saddle_skimray', speed: 1.7, ability: 'skim', swim: true, fly: false, lift: 6 }, companion: { role: 'mount', dps: 0, range: 0 }, drops: ['reef_loot'] },
    { id: 'isleback_turtle', name: 'Isleback Turtle', biome: 'reef', tier: 'passive', size: 'XL', lv: [16, 18], hp: 1800, dmg: 0, speed: 50,
      behaviours: ['wander', 'swim'], diet: ['sea_melon'], tame: T('feed', 0, 14, 12, 0, 170),
      ride: { saddle: null, speed: 0.9, ability: 'float_dock', swim: true, fly: false, lift: 12 }, companion: { role: 'mount', dps: 0, range: 0 }, drops: ['reef_loot'] },
    { id: 'tide_hydra', name: 'Tide Hydra', biome: 'reef', tier: 'boss', size: 'XL', lv: [18, 18], hp: 3200, dmg: 3.8, speed: 90, base: 'ring',
      behaviours: ['aggro', 'swim', 'spit'], attack: { pattern: 'hydra_heads', windup: 0.7 }, aggroR: 360, diet: [], tame: null, drops: ['reef_boss'] },

    // ---- Red Waste (Mars) ----
    { id: 'regolith_roly', name: 'Regolith Roly', biome: 'mars', tier: 'passive', size: 'S', lv: [18, 20], hp: 70, dmg: 0, speed: 90,
      behaviours: ['wander', 'flee', 'roll'], diet: ['oxide_dust'], tame: T('feed', 0, 6, 5, 0, 26), companion: { role: 'cosmetic', dps: 0, range: 0 }, drops: ['mars_loot'] },
    { id: 'bubblemoth', name: 'Bubblemoth', biome: 'mars', tier: 'passive', size: 'S', lv: [18, 24], hp: 60, dmg: 0, speed: 140,
      behaviours: ['wander', 'flee', 'fly'], diet: ['nectar', 'greenhouse_potato'], tame: T('calm', 0, 6, 5, 0, 26), companion: { role: 'support', dps: 0, range: 0 }, drops: ['fluff'] },
    { id: 'rustbeetle', name: 'Rustbeetle', biome: 'mars', tier: 'neutral', size: 'M', lv: [18, 26], hp: 300, dmg: 1.4, speed: 80, base: 'aimed',
      behaviours: ['wander', 'retaliate', 'burrow'], attack: { pattern: 'bump', windup: 0.35 }, diet: ['iron'], tame: T('feed', 0, 8, 7, 0, 50),
      companion: { role: 'gatherer', dps: 3, range: 28 }, drops: ['mars_loot'] },
    { id: 'dust_devil', name: 'Dust Devil', biome: 'mars', tier: 'hostile', size: 'S', lv: [20, 28], hp: 160, dmg: 1.8, speed: 180, base: 'spiral',
      behaviours: ['aggro', 'float', 'swoop'], attack: { pattern: 'whirl', windup: 0.3 }, aggroR: 260, diet: [], tame: null, drops: ['mars_loot'] },
    { id: 'scrapper_drone', name: 'Scrapper Drone', biome: 'mars', tier: 'hostile', size: 'S', lv: [24, 30], hp: 220, dmg: 2, speed: 160, base: 'aimed',
      behaviours: ['aggro', 'fly'], attack: { pattern: 'bolt', windup: 0.3 }, aggroR: 280, diet: ['iron'], tame: T('calm', 0, 6, 5, 0, 26),
      companion: { role: 'fighter', dps: 8, range: 90 }, drops: ['mars_loot'] },
    { id: 'crater_strider', name: 'Crater Strider', biome: 'mars', tier: 'neutral', size: 'L', lv: [22, 28], hp: 650, dmg: 2.4, speed: 220, base: 'aimed',
      behaviours: ['wander', 'retaliate', 'leap'], attack: { pattern: 'leap_slam', windup: 0.5 }, diet: ['greenhouse_potato'], tame: T('knockout', 480, 10, 8, 110, 100),
      ride: { saddle: 'saddle_strider', speed: 1.45, ability: 'leap', swim: false, fly: false, lift: 22 }, companion: { role: 'mount', dps: 9, range: 46 }, drops: ['meat_big', 'mars_loot'] },
    { id: 'void_grazer', name: 'Void Grazer', biome: 'mars', tier: 'passive', size: 'XL', lv: [28, 30], hp: 2400, dmg: 0, speed: 60,
      behaviours: ['wander', 'float', 'fly'], diet: ['meteor_glass'], tame: T('feed', 0, 14, 12, 0, 170),
      ride: { saddle: 'saddle_grazer', speed: 0.9, ability: 'hover', swim: false, fly: true, lift: 36 }, companion: { role: 'mount', dps: 0, range: 0 }, drops: ['mars_loot'] },
    { id: 'red_titan', name: 'Red Titan', biome: 'mars', tier: 'boss', size: 'XL', lv: [28, 28], hp: 5200, dmg: 5, speed: 100, base: 'ring',
      behaviours: ['aggro', 'burrow', 'roar'], attack: { pattern: 'titan_quake', windup: 0.7 }, aggroR: 380, diet: ['feast'], tame: T('knockout', 1000, 10, 7, 160, 160),
      ride: { saddle: 'saddle_titan', speed: 1.3, ability: 'burrow', swim: false, fly: false, lift: 30 }, companion: { role: 'mount', dps: 16, range: 64 }, drops: ['mars_boss'] },
  ];

  // ---- helpers ----
  const hasOwn = (o, k) => Object.prototype.hasOwnProperty.call(o, k);
  const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
  const num = (v, lo, hi) => typeof v === 'number' && isFinite(v) && v >= lo && v <= hi;
  const str = (v, re) => typeof v === 'string' && v.length <= 64 && re.test(v);
  const ID_RE = /^[a-z][a-z0-9_]{1,31}$/;
  const inList = (list, v) => typeof v === 'string' && list.indexOf(v) >= 0;

  // check(raw) -> { ok, errors, def }. def is a clean, frozen copy built field by field (never copies unknown keys).
  function check(raw) {
    try { return checkRaw(raw); } catch (e) { return { ok: false, errors: ['unreadable input'], def: null }; }
  }
  function checkRaw(raw) {
    const errors = [];
    const err = (m) => { errors.push(m); };
    if (!isObj(raw)) return { ok: false, errors: ['not an object'], def: null };
    const r = {};
    const get = (k) => (hasOwn(raw, k) ? raw[k] : undefined);

    if (!str(get('id'), ID_RE)) err('bad id'); r.id = get('id');
    if (!str(get('name'), /^[A-Za-z][A-Za-z '\-]{0,30}$/)) err('bad name'); r.name = get('name');
    if (!inList(BIOMES, get('biome'))) err('bad biome'); r.biome = get('biome');
    if (!inList(TIERS, get('tier'))) err('bad tier'); r.tier = get('tier');
    if (typeof get('size') !== 'string' || !hasOwn(SIZES, get('size'))) err('bad size'); r.size = get('size');
    const lv = get('lv');
    if (!Array.isArray(lv) || lv.length !== 2 || !num(lv[0], 1, 99) || !num(lv[1], 1, 99) || lv[0] > lv[1] || lv[0] % 1 || lv[1] % 1) err('bad lv');
    else r.lv = [lv[0], lv[1]];
    if (!num(get('hp'), 1, 100000)) err('bad hp'); r.hp = get('hp');
    if (!num(get('dmg'), 0, 50)) err('bad dmg'); r.dmg = get('dmg');
    if (!num(get('speed'), 0, 600)) err('bad speed'); r.speed = get('speed');
    const sz = typeof r.size === 'string' && hasOwn(SIZES, r.size) ? SIZES[r.size] : null;
    r.rad = get('rad') === undefined ? (sz ? sz.rad : 12) : get('rad');
    if (!num(r.rad, 4, 80)) err('bad rad');
    r.px = sz ? sz.px : 48;

    // base (realm enemy type)
    const base = get('base') === undefined ? (r.tier === 'passive' ? null : 'aimed') : get('base');
    if (base !== null && !inList(BASES, base)) err('bad base'); r.base = base;

    // behaviours
    const beh = get('behaviours');
    if (!Array.isArray(beh) || beh.length < 1 || beh.length > 8 || beh.some((b) => !inList(BEHAVIOURS, b)) || new Set(beh).size !== beh.length) err('bad behaviours');
    else r.behaviours = beh.slice();
    if (r.behaviours) {
      const hasAggro = r.behaviours.indexOf('aggro') >= 0, hasRet = r.behaviours.indexOf('retaliate') >= 0;
      if (r.tier === 'hostile' || r.tier === 'boss') { if (!hasAggro) err('hostile/boss needs aggro'); }
      else if (hasAggro) err('only hostile/boss may aggro');
      if (r.tier === 'neutral' && !hasRet) err('neutral needs retaliate');
      if (r.tier === 'passive' && hasRet) err('passive may not retaliate');
    }

    // attack
    let attack = get('attack');
    if (attack === undefined || attack === null) attack = null;
    if (r.tier === 'passive' && attack !== null) err('passive has no attack');
    if (r.tier !== 'passive' && attack === null) err('non-passive needs attack');
    if (attack !== null) {
      if (!isObj(attack) || !str(attack.pattern, /^[a-z_]{2,24}$/) || !num(attack.windup, 0.05, 3)) { err('bad attack'); attack = null; }
      else {
        attack = { pattern: attack.pattern, windup: attack.windup };
        if ((r.size === 'L' || r.size === 'XL') && attack.windup < BIG_MIN_WINDUP) err('big creature windup too short');
      }
    }
    r.attack = attack;
    if (r.tier === 'passive' || r.tier === 'neutral') { if (r.tier === 'passive' && r.dmg > 1) err('passive dmg too high'); }
    if (r.tier === 'hostile' || r.tier === 'boss') { if (!(r.dmg > 0)) err('hostile needs dmg'); }
    r.aggroR = get('aggroR') === undefined ? (r.tier === 'hostile' || r.tier === 'boss' ? 240 : 0) : get('aggroR');
    if (!num(r.aggroR, 0, 1000)) err('bad aggroR');
    r.leashR = get('leashR') === undefined ? 700 : get('leashR');
    if (!num(r.leashR, 100, 2000)) err('bad leashR');
    r.flee = get('flee') === undefined ? (r.tier === 'passive' ? 0.5 : 0.25) : get('flee');
    if (!num(r.flee, 0, 1)) err('bad flee');

    // diet
    const diet = get('diet');
    if (!Array.isArray(diet) || diet.length > 4 || diet.some((d) => typeof d !== 'string' || !hasOwn(FOODS, d)) || new Set(diet).size !== diet.length) err('bad diet');
    else r.diet = diet.slice();

    // tame
    let tame = get('tame');
    if (tame === undefined || tame === null) tame = null;
    if (tame !== null) {
      if (!isObj(tame) || !inList(METHODS, tame.method)) { err('bad tame method'); tame = null; }
      else {
        const t = { method: tame.method, torpor: tame.torpor, feedEvery: tame.feedEvery, need: tame.need, sleep: tame.sleep, time: tame.time };
        if (!num(t.feedEvery, 1, 60)) err('bad feedEvery');
        if (!num(t.need, 1, 30) || t.need % 1) err('bad need');
        if (!num(t.time, 5, 600)) err('bad tame time');
        if (t.method === 'knockout') {
          if (!num(t.torpor, 1, 5000)) err('knockout needs torpor');
          if (!num(t.sleep, 10, 300)) err('knockout needs sleep');
          else if (num(t.need, 1, 30) && num(t.feedEvery, 1, 60) && t.sleep < (t.need - 1) * t.feedEvery * 1.2) err('sleep shorter than feeding time');
        } else { t.torpor = 0; t.sleep = 0; }
        if (r.tier === 'boss' && t.method !== 'knockout') err('boss-tame is knockout');
        tame = t;
      }
      if (!Array.isArray(r.diet) || r.diet.length < 1) err('tameable creature needs a diet');
    }
    r.tame = tame;
    r.tameable = tame !== null;

    // ride
    let ride = get('ride');
    if (ride === undefined || ride === null) ride = null;
    if (ride !== null) {
      if (!isObj(ride) || !num(ride.speed, 0.5, 3) || !num(ride.lift, 0, 80) || typeof ride.swim !== 'boolean' || typeof ride.fly !== 'boolean' ||
          !str(ride.ability, /^[a-z_]{2,24}$/) || !(ride.saddle === null || str(ride.saddle, /^saddle_[a-z_]{2,24}$/))) { err('bad ride'); ride = null; }
      else ride = { saddle: ride.saddle, speed: ride.speed, ability: ride.ability, swim: ride.swim, fly: ride.fly, lift: ride.lift };
      if (ride && r.size === 'S') err('small creatures cannot be ridden');
      if (ride && !tame) err('rideable must be tameable');
    }
    r.ride = ride;
    r.rideable = ride !== null;
    r.needsSaddle = ride !== null && ride.saddle !== null;

    // companion
    let comp = get('companion');
    if (comp === undefined || comp === null) comp = null;
    if (comp !== null) {
      if (!isObj(comp) || !inList(ROLES, comp.role) || !num(comp.dps, 0, 100) || !num(comp.range, 0, 400)) { err('bad companion'); comp = null; }
      else comp = { role: comp.role, dps: comp.dps, range: comp.range };
      if (comp && !tame) err('companion must be tameable');
    } else if (tame) err('tameable creature needs a companion block');
    r.companion = comp;

    // drops
    const drops = get('drops');
    if (!Array.isArray(drops) || drops.length > 4 || drops.some((d) => typeof d !== 'string' || !hasOwn(DROP_TABLES, d))) err('bad drops');
    else r.drops = drops.slice();
    r.legendary = get('legendary') === true;
    r.boss = r.tier === 'boss';

    if (errors.length) return { ok: false, errors, def: null };
    return { ok: true, errors: [], def: deepFreeze(r) };
  }

  function deepFreeze(o) {
    if (o && typeof o === 'object' && !Object.isFrozen(o)) { Object.freeze(o); Object.keys(o).forEach((k) => deepFreeze(o[k])); }
    return o;
  }

  // ---- build the registry ----
  const REG = Object.create(null);
  const ORDER = [];
  const BUILD_ERRORS = [];
  ROWS.forEach((row) => {
    const c = check(row);
    if (!c.ok) { BUILD_ERRORS.push({ id: row && row.id, errors: c.errors }); return; }
    if (REG[c.def.id]) { BUILD_ERRORS.push({ id: c.def.id, errors: ['duplicate id'] }); return; }
    REG[c.def.id] = c.def; ORDER.push(c.def.id);
  });
  deepFreeze(FOODS); deepFreeze(DROP_TABLES); deepFreeze(SIZES);

  // ---- lookups (every lookup returns the frozen def, or null/[] for junk) ----
  function get(id) { return typeof id === 'string' && id.length < 64 && REG[id] ? REG[id] : null; }
  function list() { return ORDER.map((id) => REG[id]); }
  function byBiome(biome) { return typeof biome === 'string' ? ORDER.map((id) => REG[id]).filter((d) => d.biome === biome) : []; }
  function byTier(tier, biome) { return list().filter((d) => d.tier === tier && (biome === undefined || d.biome === biome)); }
  function big(biome) { return (biome === undefined ? list() : byBiome(biome)).filter((d) => d.size === 'L' || d.size === 'XL' || d.tier === 'boss'); }
  function tameable(biome) { return (biome === undefined ? list() : byBiome(biome)).filter((d) => d.tameable); }
  function rideable(biome) { return (biome === undefined ? list() : byBiome(biome)).filter((d) => d.rideable); }
  function byMethod(method) { return list().filter((d) => d.tame && d.tame.method === method); }
  function byRole(role) { return list().filter((d) => d.companion && d.companion.role === role); }
  function eatenBy(food) { return list().filter((d) => d.diet.indexOf(food) >= 0); }
  function levelBand(def) { return def ? [def.lv[0], def.lv[1]] : null; }
  function sizeInfo(size) { return typeof size === 'string' && hasOwn(SIZES, size) ? SIZES[size] : null; }
  function food(id) { return typeof id === 'string' && hasOwn(FOODS, id) ? FOODS[id] : null; }
  function dropTable(key) { return typeof key === 'string' && hasOwn(DROP_TABLES, key) ? DROP_TABLES[key] : null; }
  function validate(raw) { const c = check(raw); return { ok: c.ok, errors: c.errors.slice() }; }
  function clean(raw) { return check(raw).def; }          // clean frozen copy or null
  function errors() { return BUILD_ERRORS.slice(); }

  return Object.freeze({
    BIOMES: Object.freeze(BIOMES.slice()), TIERS: Object.freeze(TIERS.slice()), METHODS: Object.freeze(METHODS.slice()),
    BASES: Object.freeze(BASES.slice()), ROLES: Object.freeze(ROLES.slice()), BEHAVIOURS: Object.freeze(BEHAVIOURS.slice()),
    SIZES, FOODS, DROP_TABLES, BIG_MIN_WINDUP,
    get, list, byBiome, byTier, big, tameable, rideable, byMethod, byRole, eatenBy, levelBand, sizeInfo, food, dropTable,
    validate, clean, errors,
  });
}));
