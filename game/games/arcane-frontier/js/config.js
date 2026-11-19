/* Arcane Frontier - global config, key table and conventions.
 *
 * ===================== WORLD COORDINATE CONVENTION =====================
 *  - Unit: world pixels. One tile = AF.CFG.TILE = 32 world px (orthographic, top-down).
 *  - Origin (0,0) is the top-left corner of tile (0,0) of the CURRENT zone. +x = east/right, +y = south/down.
 *  - Tile (tx,ty) covers x in [tx*32, tx*32+32) and y in [ty*32, ty*32+32); its centre is (tx*32+16, ty*32+16).
 *    worldToTile: tx = Math.floor(x / 32).
 *  - Every entity's (x,y) is the centre of its collision shape (a circle of radius r for hits, an
 *    axis-aligned box of half-size r for wall collision). Sprites are drawn with that point near their feet.
 *  - Angles are radians, 0 = +x (east), increasing CLOCKWISE on screen (because +y points down),
 *    i.e. always Math.atan2(dy, dx).
 *  - Time is in seconds, speeds in world px / second. Simulation runs in fixed steps of CFG.SIM_DT.
 *  - Camera zoom is an integer (1..3) so 1 world px maps to an integer number of screen px (crisp pixels).
 * ======================================================================
 */
window.AF = window.AF || {};

AF.CFG = {
  TILE: 32,
  SIM_DT: 1 / 60,
  MAX_STEPS: 5,
  SAVE_KEY: 'arcane-frontier-save-v1',
  SAVE_VERSION: 1,
  MAX_LEVEL: 20,
  INV_W: 5,
  INV_H: 4,
  PLAYER_HURT_R: 6,     // player hitbox radius (sprite is ~20 px wide) - smaller than the silhouette
  PLAYER_BODY_R: 8,     // wall-collision half size
  GRACE_AFTER_HIT: 0.3, // i-frames after a normal hit (s)
  ROLL_TIME: 0.28,
  ROLL_IFRAMES: 0.34,
  ROLL_SPEED_MULT: 2.5,
  ACCEL: 16,            // movement easing (1/s): higher = snappier
  POOL_PLAYER_BULLETS: 320,
  POOL_ENEMY_BULLETS: 800,
  POOL_PARTICLES: 260,
  POOL_NUMBERS: 70,
  HASH_CELL: 64,
  BULLET_SUBSTEP: 6,    // max px a bullet travels per collision sub-step (prevents tunnelling)
  MOVE_SUBSTEP: 6,
  POTION_CD: 4,
  BAG_LIFETIME: 90,
  AUTOSAVE_SECS: 20,
};

// Remappable-ready key table (KeyboardEvent.code values). UI and input read ONLY from here.
AF.KEYS = {
  up: ['KeyW', 'ArrowUp'],
  down: ['KeyS', 'ArrowDown'],
  left: ['KeyA', 'ArrowLeft'],
  right: ['KeyD', 'ArrowRight'],
  skill: ['KeyQ'],
  dodge: ['Space', 'ShiftLeft'],
  interact: ['KeyE', 'KeyF'],
  inventory: ['KeyI', 'KeyB'],
  character: ['KeyC'],
  map: ['Tab'],
  minimap: ['KeyM'],
  pause: ['Escape', 'KeyP'],
  potionHp: ['Digit1'],
  potionMp: ['Digit2'],
  mute: ['KeyN'],
  fire: ['KeyX'],       // keyboard alternative to holding the mouse
};
AF.KEY_LABELS = {
  up: 'Move up', down: 'Move down', left: 'Move left', right: 'Move right', skill: 'Class skill (or right mouse)',
  dodge: 'Dodge roll', interact: 'Interact / pick up', inventory: 'Inventory', character: 'Hero sheet',
  map: 'Zone map', minimap: 'Expand minimap', pause: 'Pause', potionHp: 'Health potion', potionMp: 'Mana potion',
  mute: 'Mute', fire: 'Fire (or hold left mouse)',
};

AF.RARITY = {
  common:   { name: 'Common',   color: '#c9c9c9', tint: 0xc9c9c9, mult: 1.0,  affixes: 0, order: 0 },
  uncommon: { name: 'Uncommon', color: '#5fd068', tint: 0x5fd068, mult: 1.18, affixes: 1, order: 1 },
  rare:     { name: 'Rare',     color: '#4ea4ff', tint: 0x4ea4ff, mult: 1.38, affixes: 2, order: 2 },
  epic:     { name: 'Epic',     color: '#c27bff', tint: 0xc27bff, mult: 1.65, affixes: 3, order: 3 },
};
AF.RARITY_ORDER = ['common', 'uncommon', 'rare', 'epic'];

// XP needed to go from level l to l+1. Gentle early, steeper late. Level cap 20.
AF.xpToNext = function (l) {
  if (l >= AF.CFG.MAX_LEVEL) return Infinity;
  return Math.round(30 + 22 * Math.pow(l, 1.55));
};

AF.settings = { reduceMotion: false, outline: false, mute: false, showFps: false, hints: true };

// Optional query flags for tests/dev: ?nopause=1 disables pause-on-blur, ?fps=1 shows the counter.
AF.QUERY = (function () {
  const out = {};
  try { new URLSearchParams(location.search).forEach((v, k) => { out[k] = v; }); } catch (e) { /* ignore */ }
  return out;
})();
