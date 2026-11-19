/* Arcane Frontier - game data tables. Every sprite reference is a manifest ID (validated at boot). */
(function () {
  const D = (AF.DATA = {});
  const PI = Math.PI;

  // ---------------------------------------------------------------- classes
  // attack.kind: 'proj' (pooled projectiles) or 'arc' (instant melee cone, drawn with slash_arc).
  // rate = attacks per second. life = projectile lifetime (s). r = projectile hit radius.
  D.CLASSES = [
    {
      id: 'vanguard', name: 'Vanguard', role: 'Frontline bruiser', prototype: false, color: '#7fb4ff',
      desc: 'Heavy blade sweeps in a wide arc at close range. Shrugs off hits and slams the ground to stun crowds.',
      stats: { hp: 165, mp: 60, speed: 120, armor: 6, crit: 0.06, dodgeCd: 1.1, mpRegen: 4, hpRegen: 1.2 },
      growth: { hp: 16, mp: 3, dmg: 2.2, armor: 0.6 },
      attack: { kind: 'arc', range: 58, arc: 1.95, dmg: 22, rate: 2.6, tint: 0xcfe4ff },
      skill: { id: 'slam', name: 'Earthbreaker', mp: 25, cd: 4, desc: 'Slam the ground: damage, knockback and a short stun around you.', radius: 96, dmg: 42, stun: 0.9 },
      weaponTypes: ['blade'], start: ['sword_iron'],
    },
    {
      id: 'ranger', name: 'Ranger', role: 'Swift marksman', prototype: false, color: '#9df07a',
      desc: 'Rapid, long-reaching arrows. Dash-shot rolls you clear while loosing a fan of arrows at the cursor.',
      stats: { hp: 112, mp: 80, speed: 134, armor: 2, crit: 0.12, dodgeCd: 0.9, mpRegen: 5, hpRegen: 0.8 },
      growth: { hp: 10, mp: 4, dmg: 1.1, armor: 0.3 },
      attack: { kind: 'proj', sprite: 'projectile_arrow', rot: PI / 2, tint: 0xd8ffb0, speed: 540, life: 0.55, dmg: 11, rate: 4.4, r: 4, count: 1, spread: 0, pierce: 0 },
      skill: { id: 'dashShot', name: 'Wind Volley', mp: 22, cd: 3, desc: 'Dash in your move direction and fire 7 arrows toward the cursor.', dash: 120, n: 7, spread: 0.13, dmg: 15 },
      weaponTypes: ['bow'], start: ['bow_oak'],
    },
    {
      id: 'arcanist', name: 'Arcanist', role: 'Glass-cannon caster', prototype: false, color: '#c890ff',
      desc: 'Slow, heavy arcane bolts that pierce. Blink to the cursor and erupt in a ring of force.',
      stats: { hp: 96, mp: 125, speed: 122, armor: 1, crit: 0.08, dodgeCd: 1.0, mpRegen: 7, hpRegen: 0.7 },
      growth: { hp: 8, mp: 7, dmg: 3.2, armor: 0.2 },
      attack: { kind: 'proj', sprite: 'projectile_arcane', rot: 0, tint: 0xe2b8ff, speed: 275, life: 1.0, dmg: 34, rate: 1.7, r: 7, count: 1, spread: 0, pierce: 1, scale: 1 },
      skill: { id: 'blinkNova', name: 'Rift Step', mp: 35, cd: 5, desc: 'Blink toward the cursor, then release a nova of 14 bolts.', range: 160, n: 14, dmg: 24 },
      weaponTypes: ['staff'], start: ['staff_arcane'],
    },
    {
      id: 'guardian', name: 'Guardian', role: 'Shield wall (prototype)', prototype: true, color: '#e8d27a',
      desc: 'Short, narrow sword chops. Raises a ward that hardens armour and shoves foes back.',
      stats: { hp: 190, mp: 55, speed: 108, armor: 9, crit: 0.04, dodgeCd: 1.3, mpRegen: 4, hpRegen: 1.5 },
      growth: { hp: 18, mp: 2, dmg: 1.8, armor: 0.8 },
      attack: { kind: 'arc', range: 48, arc: 1.4, dmg: 19, rate: 2.3, tint: 0xfff0b0 },
      skill: { id: 'bulwark', name: 'Bulwark', mp: 25, cd: 6, desc: '+14 armour for 3 s and a knockback pulse.', armor: 14, time: 3, radius: 76, dmg: 18 },
      weaponTypes: ['blade'], start: ['sword_iron', 'shield_wood'],
    },
    {
      id: 'duelist', name: 'Duelist', role: 'Fencer (prototype)', prototype: true, color: '#7fe8e0',
      desc: 'Lightning-fast thrusts in a tight arc. Lunges through enemies.',
      stats: { hp: 122, mp: 70, speed: 140, armor: 3, crit: 0.18, dodgeCd: 0.8, mpRegen: 5, hpRegen: 0.9 },
      growth: { hp: 11, mp: 3, dmg: 1.2, armor: 0.3 },
      attack: { kind: 'arc', range: 52, arc: 1.05, dmg: 12, rate: 4.6, tint: 0xb8fff8 },
      skill: { id: 'lunge', name: 'Riposte Lunge', mp: 20, cd: 2.5, desc: 'Lunge 140 px toward the cursor, cutting everything in the path.', dist: 140, dmg: 32 },
      weaponTypes: ['blade'], start: ['sword_iron'],
    },
    {
      id: 'pyromancer', name: 'Pyromancer', role: 'Fire caster (prototype)', prototype: true, color: '#ff9a4a',
      desc: 'Fireballs burst on impact. Calls down a delayed firestorm at the cursor.',
      stats: { hp: 100, mp: 115, speed: 122, armor: 1, crit: 0.07, dodgeCd: 1.0, mpRegen: 6, hpRegen: 0.7 },
      growth: { hp: 8, mp: 6, dmg: 2.0, armor: 0.2 },
      attack: { kind: 'proj', sprite: 'projectile_fireball', rot: 0, tint: 0xffd0a0, speed: 300, life: 0.8, dmg: 19, rate: 2.4, r: 6, count: 1, spread: 0, pierce: 0, splash: 36 },
      skill: { id: 'firestorm', name: 'Cinderfall', mp: 30, cd: 4.5, desc: 'Three explosions land around the cursor after a short delay.', radius: 56, dmg: 46, delay: 0.55 },
      weaponTypes: ['staff'], start: ['staff_arcane'],
    },
    {
      id: 'frostbinder', name: 'Frostbinder', role: 'Control caster (prototype)', prototype: true, color: '#9fe6ff',
      desc: 'Ice shards slow on hit. Shatters a frost ring that chills everything nearby.',
      stats: { hp: 104, mp: 110, speed: 122, armor: 2, crit: 0.07, dodgeCd: 1.0, mpRegen: 6, hpRegen: 0.8 },
      growth: { hp: 9, mp: 6, dmg: 1.4, armor: 0.25 },
      attack: { kind: 'proj', sprite: 'projectile_ice', rot: 0, tint: 0xe0f8ff, speed: 360, life: 0.75, dmg: 15, rate: 2.8, r: 5, count: 1, spread: 0, pierce: 0, slow: 0.4 },
      skill: { id: 'frostRing', name: 'Hoarfrost Ring', mp: 28, cd: 5, desc: 'Radial burst of 18 shards; slows foes within 110 px.', n: 18, dmg: 16, radius: 110 },
      weaponTypes: ['staff'], start: ['staff_frost'],
    },
    {
      id: 'shadowblade', name: 'Shadowblade', role: 'Assassin (prototype)', prototype: true, color: '#b48cff',
      desc: 'Throws twin venom darts. Steps into shadow: untouchable, faster, next hits crit.',
      stats: { hp: 108, mp: 75, speed: 142, armor: 2, crit: 0.2, dodgeCd: 0.8, mpRegen: 5, hpRegen: 0.8 },
      growth: { hp: 9, mp: 3, dmg: 0.9, armor: 0.25 },
      attack: { kind: 'proj', sprite: 'projectile_poison', rot: 0, tint: 0xd0a0ff, speed: 470, life: 0.45, dmg: 10, rate: 3.4, r: 4, count: 2, spread: 0.12, pierce: 0 },
      skill: { id: 'shadowStep', name: 'Veilstep', mp: 25, cd: 6, desc: '1.2 s untouchable, +40% speed, guaranteed crits for 2 s.', time: 1.2 },
      weaponTypes: ['blade'], start: ['dagger_shadow'],
    },
    {
      id: 'cleric', name: 'Cleric', role: 'Battle healer (prototype)', prototype: true, color: '#ffe680',
      desc: 'Radiant orbs. Sanctuary heals you and scorches nearby foes.',
      stats: { hp: 130, mp: 100, speed: 120, armor: 4, crit: 0.05, dodgeCd: 1.1, mpRegen: 6, hpRegen: 1.4 },
      growth: { hp: 12, mp: 5, dmg: 1.2, armor: 0.4 },
      attack: { kind: 'proj', sprite: 'projectile_arcane', rot: 0, tint: 0xfff2a0, speed: 330, life: 0.8, dmg: 14, rate: 2.6, r: 5, count: 1, spread: 0, pierce: 0 },
      skill: { id: 'sanctuary', name: 'Sanctuary', mp: 35, cd: 7, desc: 'Heal 40% HP and deal radiant damage around you.', heal: 0.4, radius: 84, dmg: 26 },
      weaponTypes: ['staff'], start: ['wand_spark'],
    },
    {
      id: 'stormcaller', name: 'Stormcaller', role: 'Storm caster (prototype)', prototype: true, color: '#8fd8ff',
      desc: 'Weaving sparks. Chain lightning arcs between up to five foes.',
      stats: { hp: 102, mp: 110, speed: 124, armor: 2, crit: 0.09, dodgeCd: 1.0, mpRegen: 6, hpRegen: 0.7 },
      growth: { hp: 8, mp: 6, dmg: 1.3, armor: 0.2 },
      attack: { kind: 'proj', sprite: 'projectile_arcane', rot: 0, tint: 0xa8f0ff, speed: 380, life: 0.7, dmg: 13, rate: 3.0, r: 5, count: 1, spread: 0, pierce: 0, wave: 18 },
      skill: { id: 'chainBolt', name: 'Forked Sky', mp: 30, cd: 4, desc: 'Lightning strikes the 5 nearest foes within 230 px.', n: 5, range: 230, dmg: 38 },
      weaponTypes: ['staff'], start: ['wand_spark'],
    },
  ];
  D.CLASS = {}; D.CLASSES.forEach((c) => { D.CLASS[c.id] = c; });

  // ---------------------------------------------------------------- items (16 equipment ids)
  D.ITEMS = {
    sword_iron:    { name: 'Iron Brand', slot: 'weapon', wtype: 'blade', stats: { dmg: 4 } },
    sword_flame:   { name: 'Emberedge', slot: 'weapon', wtype: 'blade', stats: { dmg: 9, rate: 0.05 }, proj: { tint: 0xff9040 } },
    dagger_shadow: { name: 'Nightfang', slot: 'weapon', wtype: 'blade', stats: { dmg: 6, rate: 0.16, crit: 0.05 }, proj: { tint: 0xb080ff } },
    bow_oak:       { name: 'Oakstring Bow', slot: 'weapon', wtype: 'bow', stats: { dmg: 3 } },
    bow_moon:      { name: 'Moonwhisper', slot: 'weapon', wtype: 'bow', stats: { dmg: 7, rate: 0.08, projSpeed: 0.15 }, proj: { tint: 0xc8e0ff } },
    staff_arcane:  { name: 'Runestaff', slot: 'weapon', wtype: 'staff', stats: { dmg: 6 } },
    staff_frost:   { name: 'Rimecall Staff', slot: 'weapon', wtype: 'staff', stats: { dmg: 8, projSpeed: 0.08 }, proj: { sprite: 'projectile_ice', rot: 0, tint: 0xd0f4ff } },
    wand_spark:    { name: 'Sparkwand', slot: 'weapon', wtype: 'staff', stats: { dmg: 4, rate: 0.22, projSpeed: 0.18 }, proj: { tint: 0xffe070 } },
    armor_leather: { name: 'Hide Jerkin', slot: 'armor', stats: { armor: 3, hp: 10 } },
    armor_plate:   { name: 'Bastion Plate', slot: 'armor', stats: { armor: 7, hp: 22, speed: -6 } },
    helmet_knight: { name: 'Visored Helm', slot: 'head', stats: { armor: 3, hp: 8 } },
    hood_mage:     { name: 'Seer Hood', slot: 'head', stats: { mp: 20, crit: 0.03 } },
    shield_wood:   { name: 'Plank Buckler', slot: 'offhand', stats: { armor: 2 } },
    shield_steel:  { name: 'Tower Aegis', slot: 'offhand', stats: { armor: 5, hp: 15 } },
    potion_health: { name: 'Healing Draught', slot: 'consumable', use: 'hp', amount: 0.45, flat: 30, stack: 12, desc: 'Restores 45% HP + 30.' },
    potion_mana:   { name: 'Mana Draught', slot: 'consumable', use: 'mp', amount: 0.5, flat: 20, stack: 12, desc: 'Restores 50% MP + 20.' },
  };
  D.SLOTS = ['weapon', 'armor', 'head', 'offhand', 'consumable'];
  D.SLOT_LABEL = { weapon: 'Weapon', armor: 'Armour', head: 'Head', offhand: 'Offhand', consumable: 'Potion' };
  D.STAT_LABEL = { dmg: 'Damage', rate: 'Attack speed', projSpeed: 'Projectile speed', armor: 'Armour', hp: 'Max HP', mp: 'Max MP', crit: 'Crit chance', speed: 'Move speed' };
  // random affixes rolled on uncommon+ items
  D.AFFIXES = [
    { stat: 'hp', min: 8, max: 22 }, { stat: 'mp', min: 8, max: 20 }, { stat: 'crit', min: 0.02, max: 0.05 },
    { stat: 'speed', min: 3, max: 8 }, { stat: 'armor', min: 1, max: 3 }, { stat: 'dmg', min: 2, max: 5, weaponOnly: true },
    { stat: 'rate', min: 0.04, max: 0.1, weaponOnly: true },
  ];

  // ---------------------------------------------------------------- loot tables (weighted)
  D.LOOT = {
    forest: {
      gold: [1, 5], bagChance: 0.3, rolls: 1,
      entries: [['potion_health', 26], ['potion_mana', 12], ['sword_iron', 6], ['bow_oak', 6], ['staff_arcane', 6], ['wand_spark', 3],
        ['armor_leather', 7], ['hood_mage', 5], ['shield_wood', 6], ['helmet_knight', 3], ['dagger_shadow', 2]],
      rarity: { common: 66, uncommon: 27, rare: 6, epic: 1 },
    },
    forest_boss: {
      gold: [22, 36], bagChance: 1, rolls: 2, floor: 'uncommon',
      entries: [['bow_moon', 6], ['sword_flame', 6], ['staff_frost', 6], ['wand_spark', 5], ['armor_leather', 4], ['helmet_knight', 4], ['shield_steel', 3], ['potion_health', 6]],
      rarity: { common: 0, uncommon: 55, rare: 35, epic: 10 },
    },
    crypt: {
      gold: [2, 8], bagChance: 0.34, rolls: 1,
      entries: [['potion_health', 22], ['potion_mana', 12], ['sword_flame', 4], ['dagger_shadow', 4], ['bow_moon', 4], ['staff_frost', 4], ['wand_spark', 4],
        ['armor_plate', 5], ['armor_leather', 4], ['helmet_knight', 5], ['hood_mage', 5], ['shield_steel', 4], ['shield_wood', 2]],
      rarity: { common: 50, uncommon: 34, rare: 13, epic: 3 },
    },
    crypt_boss: {
      gold: [60, 95], bagChance: 1, rolls: 3, floor: 'rare',
      entries: [['sword_flame', 5], ['bow_moon', 5], ['staff_frost', 5], ['dagger_shadow', 4], ['wand_spark', 4], ['armor_plate', 5], ['shield_steel', 4], ['helmet_knight', 4], ['hood_mage', 4]],
      rarity: { common: 0, uncommon: 0, rare: 70, epic: 30 },
    },
    arena: {
      gold: [4, 12], bagChance: 0.36, rolls: 1,
      entries: [['potion_health', 20], ['potion_mana', 10], ['sword_flame', 5], ['bow_moon', 5], ['staff_frost', 5], ['wand_spark', 5], ['dagger_shadow', 4],
        ['armor_plate', 5], ['helmet_knight', 4], ['hood_mage', 4], ['shield_steel', 4]],
      rarity: { common: 30, uncommon: 40, rare: 23, epic: 7 },
    },
    arena_boss: {
      gold: [90, 140], bagChance: 1, rolls: 3, floor: 'rare',
      entries: [['sword_flame', 5], ['bow_moon', 5], ['staff_frost', 5], ['dagger_shadow', 4], ['wand_spark', 4], ['armor_plate', 5], ['shield_steel', 4], ['helmet_knight', 4], ['hood_mage', 4]],
      rarity: { common: 0, uncommon: 0, rare: 55, epic: 45 },
    },
  };

  // ---------------------------------------------------------------- enemy attacks
  // p: pattern. aimed/fan: n bullets spread rad apart at the player. radial: n bullets all round (gap = bullets skipped
  // to leave a safe lane). spiral: emitter for dur s. volley: telegraphed markers at the player's position that burst
  // after windup. circle/line/cone: telegraphed ground zones that damage only after the wind-up fills.
  const A = (o) => Object.assign({ cd: 2, windup: 0.4, n: 1, spread: 0.2, speed: 160, dmg: 10, sprite: 'projectile_poison', tint: 0xffffff, r: 5, range: 220, life: 2.2 }, o);

  // ---------------------------------------------------------------- enemies (24 ids)
  // move: chase | keepDistance | patrol | ambush | stationary | orbit | charge ; flee: HP fraction below which it runs.
  D.ENEMIES = {
    slime_green:     { name: 'Moss Slime', hp: 32, speed: 62, r: 9, contact: 9, xp: 5, move: 'chase', anim: 'hop', aggro: 210, attacks: [] , loot: 1 },
    slime_red:       { name: 'Ember Slime', hp: 58, speed: 58, r: 9, contact: 12, xp: 9, move: 'chase', anim: 'hop', aggro: 230, attacks: [A({ p: 'radial', n: 8, cd: 2.8, windup: 0.55, speed: 120, dmg: 11, sprite: 'projectile_fireball', tint: 0xffb080, range: 160 })] },
    slime_blue:      { name: 'Frost Slime', hp: 46, speed: 66, r: 9, contact: 10, xp: 7, move: 'chase', anim: 'hop', aggro: 230, attacks: [A({ p: 'aimed', cd: 2.0, speed: 150, dmg: 10, sprite: 'projectile_ice', tint: 0xd8f6ff })] },
    goblin_scout:    { name: 'Goblin Skulker', hp: 36, speed: 88, r: 8, contact: 6, xp: 8, move: 'keepDistance', range: 160, flee: 0.3, anim: 'walk', aggro: 260,
                       attacks: [A({ p: 'aimed', cd: 1.35, windup: 0.25, speed: 215, dmg: 9, sprite: 'projectile_arrow', rot: Math.PI / 2, tint: 0xffe0a0, r: 4, range: 240 })] },
    goblin_shaman:   { name: 'Goblin Hexer', hp: 52, speed: 0, r: 9, contact: 6, xp: 12, move: 'stationary', anim: 'float', aggro: 280,
                       attacks: [A({ p: 'radial', n: 12, gap: 2, cd: 3.0, windup: 0.75, speed: 115, dmg: 10, sprite: 'projectile_poison', tint: 0xc8ff90, range: 260 }),
                                 A({ p: 'circle', cd: 4.2, windup: 1.1, radius: 42, dmg: 18, range: 260 })] },
    skeleton:        { name: 'Rattlebones', hp: 62, speed: 70, r: 9, contact: 12, xp: 10, move: 'patrol', anim: 'walk', aggro: 230,
                       attacks: [A({ p: 'aimed', cd: 1.7, windup: 0.3, speed: 170, dmg: 11, sprite: 'impact_spark', tint: 0xf4ecd0, r: 5 })] },
    skeleton_archer: { name: 'Bone Archer', hp: 48, speed: 72, r: 8, contact: 8, xp: 12, move: 'keepDistance', range: 190, anim: 'walk', aggro: 280,
                       attacks: [A({ p: 'fan', n: 3, spread: 0.22, cd: 1.9, windup: 0.4, speed: 230, dmg: 11, sprite: 'projectile_arrow', rot: Math.PI / 2, tint: 0xfff4dc, r: 4, range: 280 })] },
    bone_knight:     { name: 'Grave Knight', hp: 150, speed: 64, r: 11, contact: 24, xp: 22, armor: 4, move: 'charge', anim: 'walk', aggro: 240, chargeSpeed: 330, chargeTime: 0.5, chargeWindup: 0.7, attacks: [] },
    cave_bat:        { name: 'Dusk Bat', hp: 24, speed: 128, r: 7, contact: 8, xp: 6, move: 'orbit', orbit: 95, anim: 'flap', aggro: 260,
                       attacks: [A({ p: 'aimed', cd: 1.8, windup: 0.2, speed: 160, dmg: 8, sprite: 'projectile_poison', tint: 0xff9ad8, r: 4 })] },
    dark_spider:     { name: 'Gloom Spider', hp: 54, speed: 108, r: 9, contact: 12, xp: 12, move: 'ambush', trigger: 92, anim: 'skitter', aggro: 260,
                       attacks: [A({ p: 'fan', n: 5, spread: 0.26, cd: 2.4, windup: 0.4, speed: 150, dmg: 9, sprite: 'projectile_poison', tint: 0xe8e8ff })] },
    forest_wolf:     { name: 'Thornpelt Wolf', hp: 54, speed: 98, r: 9, contact: 14, xp: 10, move: 'charge', anim: 'walk', aggro: 250, chargeSpeed: 340, chargeTime: 0.42, chargeWindup: 0.55, attacks: [] },
    stone_golem:     { name: 'Rubble Golem', hp: 220, speed: 42, r: 12, contact: 20, xp: 30, armor: 6, move: 'chase', anim: 'stomp', aggro: 220,
                       attacks: [A({ p: 'cone', cd: 3.2, windup: 0.9, radius: 86, arc: 1.4, dmg: 26, range: 90 })] },
    ember_imp:       { name: 'Cinder Imp', hp: 40, speed: 118, r: 8, contact: 8, xp: 11, move: 'orbit', orbit: 120, anim: 'flap', aggro: 280,
                       attacks: [A({ p: 'fan', n: 3, spread: 0.2, cd: 1.7, windup: 0.3, speed: 190, dmg: 12, sprite: 'projectile_fireball', tint: 0xffc080 })] },
    ice_wraith:      { name: 'Rime Wraith', hp: 70, speed: 104, r: 9, contact: 10, xp: 16, move: 'orbit', orbit: 130, anim: 'float', aggro: 300,
                       attacks: [A({ p: 'radial', n: 10, gap: 2, cd: 2.6, windup: 0.5, speed: 140, dmg: 12, sprite: 'projectile_ice', tint: 0xe8fbff })] },
    mushroom_monster:{ name: 'Puffcap', hp: 46, speed: 54, r: 9, contact: 10, xp: 9, move: 'ambush', trigger: 80, anim: 'hop', aggro: 220,
                       attacks: [A({ p: 'radial', n: 10, gap: 0, cd: 2.6, windup: 0.6, speed: 105, dmg: 9, sprite: 'projectile_poison', tint: 0xd0ffb0, range: 170 })] },
    shadow_cultist:  { name: 'Veil Cultist', hp: 60, speed: 80, r: 8, contact: 8, xp: 15, move: 'keepDistance', range: 200, flee: 0.25, anim: 'float', aggro: 290,
                       attacks: [A({ p: 'volley', n: 3, cd: 3.6, windup: 0.9, radius: 20, speed: 120, dmg: 11, sprite: 'projectile_arcane', tint: 0xd0a0ff, burst: 6, range: 280 })] },
    swamp_leech:     { name: 'Bog Leech', hp: 64, speed: 50, r: 9, contact: 14, xp: 9, move: 'chase', anim: 'skitter', aggro: 200, attacks: [] },
    crystal_beetle:  { name: 'Prism Beetle', hp: 80, speed: 70, r: 9, contact: 12, xp: 15, armor: 3, move: 'patrol', anim: 'skitter', aggro: 240,
                       attacks: [A({ p: 'radial', n: 8, cd: 2.4, windup: 0.5, speed: 150, dmg: 12, sprite: 'projectile_ice', tint: 0xffd0ff })] },
    spectral_eye:    { name: 'Watcher Eye', hp: 90, speed: 0, r: 10, contact: 8, xp: 18, move: 'stationary', anim: 'float', aggro: 300,
                       attacks: [A({ p: 'spiral', n: 3, cd: 5.2, windup: 0.8, dur: 2.2, rate: 9, spin: 2.2, speed: 120, dmg: 10, sprite: 'projectile_arcane', tint: 0xffa0d8, range: 300 })] },
    bandit:          { name: 'Road Bandit', hp: 58, speed: 84, r: 9, contact: 10, xp: 11, move: 'patrol', flee: 0.22, anim: 'walk', aggro: 240,
                       attacks: [A({ p: 'fan', n: 2, spread: 0.14, cd: 1.6, windup: 0.3, speed: 200, dmg: 10, sprite: 'impact_spark', tint: 0xffe8b0, r: 4 })] },
    sand_scorpion:   { name: 'Dune Stinger', hp: 76, speed: 92, r: 10, contact: 16, xp: 15, move: 'charge', anim: 'skitter', aggro: 250, chargeSpeed: 320, chargeTime: 0.45, chargeWindup: 0.6,
                       attacks: [A({ p: 'fan', n: 3, spread: 0.3, cd: 2.4, windup: 0.4, speed: 170, dmg: 11, sprite: 'projectile_poison', tint: 0xfff090 })] },
    toxic_serpent:   { name: 'Venom Adder', hp: 62, speed: 90, r: 9, contact: 10, xp: 14, move: 'keepDistance', range: 170, anim: 'skitter', aggro: 260,
                       attacks: [A({ p: 'aimed', cd: 1.4, windup: 0.3, speed: 190, dmg: 11, wave: 22, sprite: 'projectile_poison', tint: 0xb0ff80 })] },
    mimic_chest:     { name: 'Greedmaw', hp: 120, speed: 96, r: 11, contact: 18, xp: 30, move: 'ambush', trigger: 70, anim: 'hop', aggro: 260, lootBonus: 1,
                       attacks: [A({ p: 'radial', n: 14, gap: 2, cd: 2.6, windup: 0.5, speed: 140, dmg: 12, sprite: 'impact_spark', tint: 0xffe070 })] },
    undead_soldier:  { name: 'Hollow Legionary', hp: 84, speed: 74, r: 9, contact: 14, xp: 14, armor: 2, move: 'chase', anim: 'walk', aggro: 230,
                       attacks: [A({ p: 'cone', cd: 2.3, windup: 0.6, radius: 60, arc: 1.3, dmg: 16, range: 64 })] },
  };

  // ---------------------------------------------------------------- bosses (8 ids)
  // Each phase lists attacks cycled in order; 'at' = HP fraction at which the NEXT phase starts.
  const B = (o) => A(Object.assign({ cd: 0 }, o));
  D.BOSSES = {
    forest_warden: {
      name: 'Thornheart Warden', hp: 700, r: 15, xp: 120, speed: 46, contact: 16, loot: 'forest_boss', scale: 2,
      phases: [
        { at: 0.5, gap: 0.9, attacks: [
          B({ p: 'radial', n: 18, gap: 3, windup: 0.8, speed: 125, dmg: 12, sprite: 'projectile_poison', tint: 0xb8ff90 }),
          B({ p: 'fan', n: 5, spread: 0.18, windup: 0.5, speed: 190, dmg: 12, sprite: 'projectile_poison', tint: 0xe0ffb0 }),
          B({ p: 'circle', n: 3, windup: 1.1, radius: 46, dmg: 20 }) ] },
        { gap: 0.7, speed: 60, attacks: [
          B({ p: 'spiral', n: 3, windup: 0.8, dur: 2.6, rate: 11, spin: 1.9, speed: 125, dmg: 11, sprite: 'projectile_poison', tint: 0xc8ff90 }),
          B({ p: 'line', n: 3, windup: 0.95, len: 300, width: 30, dmg: 22 }),
          B({ p: 'summon', id: 'slime_green', n: 3, windup: 0.7 }),
          B({ p: 'radial', n: 22, gap: 3, windup: 0.7, speed: 135, dmg: 12, sprite: 'projectile_poison', tint: 0xb8ff90 }) ] },
      ],
    },
    bone_colossus: {
      name: 'The Ossuary Colossus', hp: 1700, r: 17, xp: 380, speed: 40, contact: 22, loot: 'crypt_boss', scale: 2,
      phases: [
        { at: 0.5, gap: 0.9, attacks: [
          B({ p: 'radial', n: 20, gap: 3, windup: 0.85, speed: 130, dmg: 14, sprite: 'impact_spark', tint: 0xf4ecd0, r: 6 }),
          B({ p: 'fan', n: 5, spread: 0.17, windup: 0.5, speed: 200, dmg: 14, sprite: 'projectile_arrow', rot: Math.PI / 2, tint: 0xfff4dc, r: 4, repeat: 2 }),
          B({ p: 'circle', n: 4, windup: 1.1, radius: 48, dmg: 24 }),
          B({ p: 'radial', n: 20, gap: 3, windup: 0.85, speed: 130, dmg: 14, sprite: 'impact_spark', tint: 0xf4ecd0, r: 6, offset: 0.16 }) ] },
        { gap: 0.6, speed: 58, attacks: [
          B({ p: 'spiral', n: 4, windup: 0.9, dur: 3.0, rate: 10, spin: 1.7, speed: 130, dmg: 13, sprite: 'projectile_arcane', tint: 0xff9ad0 }),
          B({ p: 'line', n: 4, windup: 1.0, len: 360, width: 34, dmg: 26 }),
          B({ p: 'volley', n: 4, windup: 1.0, radius: 22, burst: 8, speed: 120, dmg: 12, sprite: 'impact_spark', tint: 0xf4ecd0 }),
          B({ p: 'summon', id: 'skeleton', n: 2, windup: 0.8 }),
          B({ p: 'radial', n: 26, gap: 3, windup: 0.7, speed: 145, dmg: 14, sprite: 'impact_spark', tint: 0xf4ecd0, r: 6, repeat: 2 }) ] },
      ],
    },
    crystal_titan: {
      name: 'Rimeglass Titan', hp: 2300, r: 17, xp: 520, speed: 44, contact: 24, loot: 'arena_boss', scale: 2,
      phases: [
        { at: 0.5, gap: 0.8, attacks: [
          B({ p: 'radial', n: 24, gap: 3, windup: 0.8, speed: 140, dmg: 16, sprite: 'projectile_ice', tint: 0xe8fbff }),
          B({ p: 'cone', windup: 0.9, radius: 150, arc: 1.1, dmg: 30 }),
          B({ p: 'fan', n: 7, spread: 0.14, windup: 0.5, speed: 210, dmg: 15, sprite: 'projectile_ice', tint: 0xffffff }) ] },
        { gap: 0.6, speed: 60, attacks: [
          B({ p: 'spiral', n: 5, windup: 0.8, dur: 3, rate: 9, spin: -1.6, speed: 135, dmg: 14, sprite: 'projectile_ice', tint: 0xd8f6ff }),
          B({ p: 'circle', n: 5, windup: 1.0, radius: 50, dmg: 28 }),
          B({ p: 'summon', id: 'ice_wraith', n: 2, windup: 0.7 }) ] },
      ],
    },
    inferno_wyrm: {
      name: 'Cinderscale Wyrm', hp: 2600, r: 17, xp: 600, speed: 50, contact: 26, loot: 'arena_boss', scale: 2,
      phases: [
        { at: 0.5, gap: 0.8, attacks: [
          B({ p: 'fan', n: 9, spread: 0.12, windup: 0.55, speed: 200, dmg: 16, sprite: 'projectile_fireball', tint: 0xffc080, repeat: 2 }),
          B({ p: 'volley', n: 5, windup: 1.0, radius: 24, burst: 8, speed: 120, dmg: 14, sprite: 'projectile_fireball', tint: 0xffa060 }),
          B({ p: 'line', n: 3, windup: 0.95, len: 380, width: 34, dmg: 28 }) ] },
        { gap: 0.55, speed: 66, attacks: [
          B({ p: 'spiral', n: 6, windup: 0.8, dur: 3.2, rate: 9, spin: 2.0, speed: 140, dmg: 14, sprite: 'projectile_fireball', tint: 0xffb070 }),
          B({ p: 'radial', n: 28, gap: 4, windup: 0.75, speed: 150, dmg: 16, sprite: 'projectile_fireball', tint: 0xffd0a0, repeat: 2 }),
          B({ p: 'summon', id: 'ember_imp', n: 2, windup: 0.7 }) ] },
      ],
    },
    storm_harbinger: {
      name: 'Tempest Herald', hp: 2400, r: 16, xp: 560, speed: 56, contact: 22, loot: 'arena_boss', scale: 2,
      phases: [
        { at: 0.5, gap: 0.8, attacks: [
          B({ p: 'radial', n: 20, gap: 3, windup: 0.75, speed: 160, dmg: 15, sprite: 'projectile_arcane', tint: 0xa8f0ff }),
          B({ p: 'line', n: 4, windup: 0.9, len: 340, width: 28, dmg: 26 }),
          B({ p: 'aimed', n: 1, windup: 0.3, speed: 260, dmg: 18, sprite: 'projectile_arcane', tint: 0xffffff, repeat: 4 }) ] },
        { gap: 0.6, speed: 70, attacks: [
          B({ p: 'spiral', n: 4, windup: 0.8, dur: 3, rate: 11, spin: -2.2, speed: 150, dmg: 14, sprite: 'projectile_arcane', tint: 0xa8f0ff }),
          B({ p: 'circle', n: 6, windup: 1.0, radius: 46, dmg: 26 }),
          B({ p: 'summon', id: 'sand_scorpion', n: 2, windup: 0.7 }) ] },
      ],
    },
    // Defined for future zones (data-driven, not yet placed in a zone):
    dread_knight: { name: 'Gravemarch Knight', hp: 2000, r: 16, xp: 400, speed: 60, contact: 24, loot: 'arena_boss', scale: 2,
      phases: [{ at: 0.5, gap: 0.8, attacks: [B({ p: 'line', n: 2, windup: 0.9, len: 320, width: 32, dmg: 24 }), B({ p: 'fan', n: 5, spread: 0.2, windup: 0.5, speed: 200, dmg: 14, sprite: 'impact_spark' })] },
        { gap: 0.6, attacks: [B({ p: 'radial', n: 24, gap: 3, windup: 0.7, speed: 150, dmg: 15, sprite: 'impact_spark' })] }] },
    void_oracle: { name: 'Hollow Seer', hp: 2000, r: 16, xp: 400, speed: 40, contact: 18, loot: 'arena_boss', scale: 2,
      phases: [{ at: 0.5, gap: 0.8, attacks: [B({ p: 'spiral', n: 3, windup: 0.8, dur: 2.5, rate: 10, spin: 2, speed: 130, dmg: 12, sprite: 'projectile_arcane' })] },
        { gap: 0.6, attacks: [B({ p: 'volley', n: 5, windup: 1, radius: 22, burst: 8, speed: 120, dmg: 12, sprite: 'projectile_arcane' })] }] },
    mire_queen: { name: 'Fenmother', hp: 2000, r: 16, xp: 400, speed: 44, contact: 20, loot: 'arena_boss', scale: 2,
      phases: [{ at: 0.5, gap: 0.8, attacks: [B({ p: 'circle', n: 4, windup: 1.1, radius: 48, dmg: 22 })] },
        { gap: 0.6, attacks: [B({ p: 'radial', n: 20, gap: 3, windup: 0.8, speed: 130, dmg: 13, sprite: 'projectile_poison' })] }] },
  };

  // ---------------------------------------------------------------- zones
  // tier scales enemy HP/damage, ilvl scales item stats. spawns: weighted enemy ids.
  D.ZONES = {
    hub:     { name: 'Lanternrest', kind: 'hub', safe: true, tier: 0 },
    forest:  { name: 'Whisperwood', kind: 'forest', tier: 1, ilvl: 1, loot: 'forest', boss: 'forest_warden', maxAlive: 20, initial: 26,
               spawns: [['slime_green', 26], ['forest_wolf', 16], ['goblin_scout', 18], ['goblin_shaman', 9], ['mushroom_monster', 10], ['bandit', 10], ['cave_bat', 8]],
               unlocks: 'crypt', recommended: '1-5' },
    crypt:   { name: 'Hollow Crypt', kind: 'dungeon', tier: 1.55, ilvl: 4, loot: 'crypt', boss: 'bone_colossus', maxAlive: 22, initial: 30, gateKills: 10,
               spawns: [['skeleton', 28], ['skeleton_archer', 18], ['bone_knight', 9], ['cave_bat', 10], ['spectral_eye', 7], ['dark_spider', 8], ['mimic_chest', 3], ['shadow_cultist', 9], ['undead_soldier', 12]],
               unlocks: ['frost', 'dunes', 'caldera'], recommended: '4-9' },
    frost:   { name: 'Rimeglass Hollow', kind: 'arena', theme: 'snow', tier: 2.3, ilvl: 7, loot: 'arena', boss: 'crystal_titan', maxAlive: 10, initial: 12,
               spawns: [['ice_wraith', 10], ['slime_blue', 14], ['crystal_beetle', 10]], recommended: '8-14' },
    dunes:   { name: 'Sunscar Basin', kind: 'arena', theme: 'sand', tier: 2.6, ilvl: 9, loot: 'arena', boss: 'storm_harbinger', maxAlive: 10, initial: 12,
               spawns: [['sand_scorpion', 12], ['toxic_serpent', 12], ['bandit', 8]], recommended: '10-16' },
    caldera: { name: 'Cinder Caldera', kind: 'arena', theme: 'lava', tier: 3.0, ilvl: 11, loot: 'arena', boss: 'inferno_wyrm', maxAlive: 10, initial: 12,
               spawns: [['ember_imp', 12], ['slime_red', 12], ['stone_golem', 6], ['swamp_leech', 4]], recommended: '12-20' },
  };
  D.ZONE_ORDER = ['forest', 'crypt', 'frost', 'dunes', 'caldera'];

  // Terrain tile metadata. solid = blocks movement, opaque = blocks projectiles + line of sight.
  D.TERRAIN = {
    grass_tile: {}, grass_dark_tile: {}, dirt_tile: {}, sand_tile: {}, snow_tile: {}, stone_floor_tile: {},
    stone_wall_tile: { solid: 1, opaque: 1 }, brick_floor_tile: {}, brick_wall_tile: { solid: 1, opaque: 1 }, wood_floor_tile: {},
    water_tile: { solid: 1 }, deep_water_tile: { solid: 1 }, lava_tile: { solid: 1 }, ice_tile: {}, mud_tile: {}, cobble_tile: {},
    path_tile: {}, moss_stone_tile: {}, cracked_floor_tile: {}, void_floor_tile: {},
  };
  // Prop metadata: solid props mark their tile as blocking.
  D.PROPS = {
    barrel: { solid: 1, opaque: 0 }, boulder: { solid: 1, opaque: 1 }, healing_shrine: { solid: 1, opaque: 0 }, locked_chest: { solid: 1 },
    oak_tree: { solid: 1, opaque: 1 }, pine_tree: { solid: 1, opaque: 1 }, portal_arch: { solid: 0 }, rock_cluster: { solid: 1, opaque: 0 },
    stone_pillar: { solid: 1, opaque: 1 }, torch_wall: { solid: 0 }, treasure_chest: { solid: 1 }, wooden_crate: { solid: 1, opaque: 0 },
  };
})();
