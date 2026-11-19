// A small Three.js voxel cave, entered by digging/jumping into a hole in the
// 2D town. Fully local — nothing here syncs over the network (same as the
// 2D game's fishing/chopping), so what you mine and build underground is
// only ever seen by you.
//
// Visuals (slice A1): every block is a 16x16 pixel-art texture drawn
// procedurally to a canvas (seeded, so identical every run), sampled with
// nearest-neighbour filtering for the crisp Minecraft look. The camera is
// first-person at eye height by default, with a held pickaxe and the
// selected block in view; F5 (or the View button) toggles third-person.
//
// Controls: WASD/dpad moves in the direction you're looking (so looking down
// and walking forward takes you deeper — no separate up/down buttons needed).
// Drag (mouse or touch) on the view to look around. Mine/Place act on
// whichever block is dead ahead, within reach. Walk back up into the shaft
// near the surface and press Exit to pop back to the 2D town.

const UG_BLOCK = 2; // world units per voxel
const UG_SIZE = 12; // cave spans x,z in [-UG_SIZE, UG_SIZE] (25 x 25 columns)
const UG_DEPTH = 8; // y levels 0 (surface) down to -UG_DEPTH
const UG_REACH = 7.5; // units — how far mine/place can reach
const UG_PLACED_CAPACITY = 150;
// Light (A4b). Out under the sky the ambient + sun follow the clock; underground it falls to a dim
// cave ambient, so you see by your head light, a held torch and the torches you place.
const UG_DAY_LENGTH = 240; // seconds for a full day / night cycle
const UG_AMBIENT_CAVE = 0.5;
const UG_AMBIENT_DAY = 2.0;
const UG_AMBIENT_NIGHT = 0.45;
const UG_HEAD_LIGHT = 4.5; // your own glow
const UG_HEAD_LIGHT_TORCH = 9; // holding a torch (hotbar slot 2) lights up much more
const UG_START_TIME = 0.2; // morning, so a new visit starts in daylight
const UG_SKY_DAY = [0.53, 0.77, 1.0];
const UG_SKY_DUSK = [0.95, 0.52, 0.28];
const UG_SKY_NIGHT = [0.03, 0.04, 0.09];
const UG_CAVE_DARK = [0.04, 0.055, 0.08];
const UG_LAVA_DAMAGE = 2; // hit points every UG_LAVA_TICK seconds while standing in lava
const UG_LAVA_TICK = 0.5;
// Physics (A2). rig.position is the player's FEET. The body is a 1.2 x 3.6 box (a bit under 2
// blocks tall); a block is 2 units, so the jump clears one block and a 2-block wall stops you.
const UG_HALF_W = 0.6;
const UG_BODY_H = 3.6;
const UG_EYE_HEIGHT = 3.24; // eye is this far above rig.position (also the mine/place ray origin)
const UG_GRAVITY = 30;
const UG_JUMP_V = 12.25; // sqrt(2 * 30 * 2.5): a 2.5 unit jump
const UG_TERMINAL_V = 40;
const UG_WALK = 7;
const UG_SWIM = 3.5;
const UG_FLY = 11;
const UG_MAX_HEALTH = 20;
const UG_FALL_SAFE = 6; // units you can drop without taking damage
const UG_SPAWN = [5.2, -1, 0]; // feet; standing on the surface grass beside the shaft
const UG_THIRD_PERSON_DIST = 6;
const UG_THIRD_PIVOT = 2.5; // third-person camera orbits this far above the feet
const UG_ORE_KINDS = ['coal', 'iron', 'gold'];
// Timed mining (A3): seconds to break each block with the pickaxe.
const UG_MINE_TIME = { leaves: 0.2, grass: 0.5, dirt: 0.4, wood: 0.8, stone: 1.0, coal: 1.2, iron: 1.6, gold: 2.0, placed_wall: 0.8, placed_dirt: 0.4, placed_table: 0.6, torch: 0.1 };
const UG_CRACK_STAGES = 10;
const UG_DROP_CAPACITY = 24;
const UG_PICKUP_RADIUS = 2.6;
const UG_MAGNET_RADIUS = 5;
// The 9-slot hotbar. wall/torch/dirt are placeable; coal/iron/gold are collected materials; the
// empty slots are kept free for crafting (a later slice).
const UG_SLOTS = ['wall', 'torch', 'dirt', 'coal', 'iron', 'gold', 'table', null, null];
const UG_TABLE_WOOD = 4; // a crafting table costs 4 wood
// Pickaxe tiers (A5). Tier 0 is the free wooden one; the others wear out and fall back to it.
const UG_PICKS = [
  { id: 'wood', name: 'Wooden', mult: 1, dur: 0, color: 0xb8c2cc },
  { id: 'stone', name: 'Stone', mult: 0.7, dur: 150, color: 0x9aa0a8 },
  { id: 'iron', name: 'Iron', mult: 0.5, dur: 300, color: 0xe0a47a },
  { id: 'gold', name: 'Gold', mult: 0.35, dur: 120, color: 0xf4d03e },
];
function ugCleanPick(p) {
  p = p && typeof p === 'object' ? p : {};
  let tier = Math.floor(Number(p.tier)); tier = tier >= 1 && tier < UG_PICKS.length ? tier : 0;
  let dur = Math.floor(Number(p.dur)); dur = Number.isFinite(dur) ? Math.max(0, Math.min(UG_PICKS[tier].dur, dur)) : 0;
  if (tier > 0 && dur < 1) tier = 0;
  return { tier, dur: tier ? dur : 0 };
}
const UG_INV_KEYS = ['dirt', 'coal', 'iron', 'gold'];
const UG_TEXTURE_NAMES = ['grass_top', 'grass_side', 'dirt', 'stone', 'coal', 'iron', 'gold', 'wood_side', 'wood_top', 'cobble', 'leaves', 'lava', 'table'];
const UG_FLAT_RADIUS = 4; // cells around the shaft that stay flat and tree-free (spawn + entry hole)

// Integer hash -> [0,1). Terrain is a pure function of (seed, cell), so the same seed always makes
// the same cave — no Math.random in world generation.
function ugHash(a, b, c, seed) {
  let h = (Math.imul(a | 0, 374761393) ^ Math.imul(b | 0, 668265263) ^ Math.imul(c | 0, 2147483647) ^ Math.imul(seed | 0, 1274126177)) >>> 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177) >>> 0;
  h = Math.imul(h ^ (h >>> 16), 2246822519) >>> 0;
  return (h >>> 0) / 4294967296;
}

// Smooth 2D value noise (bilinear on a smoothstep) in [0,1).
function ugNoise2(x, z, seed) {
  const x0 = Math.floor(x); const z0 = Math.floor(z);
  const fx = x - x0; const fz = z - z0;
  const sx = fx * fx * (3 - 2 * fx); const sz = fz * fz * (3 - 2 * fz);
  const a = ugHash(x0, 0, z0, seed); const b = ugHash(x0 + 1, 0, z0, seed);
  const c = ugHash(x0, 0, z0 + 1, seed); const d = ugHash(x0 + 1, 0, z0 + 1, seed);
  return (a + (b - a) * sx) + ((c + (d - c) * sx) - (a + (b - a) * sx)) * sz;
}

// Small seeded PRNG so every texture is the same on every machine and run.
function ugRng(seed) {
  let t = seed >>> 0;
  return () => {
    t = (t + 0x6D2B79F5) >>> 0;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r = (r + Math.imul(r ^ (r >>> 7), 61 | r)) ^ r;
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

// Draws one 16x16 pixel-art tile onto a canvas and returns it. `kind` picks
// the design; everything is per-pixel (no smoothing) so it stays crisp.
function ugDrawTile(kind) {
  const N = 16;
  const c = document.createElement('canvas');
  c.width = N; c.height = N;
  const g = c.getContext('2d');
  const rng = ugRng(kind.split('').reduce((a, ch) => a * 31 + ch.charCodeAt(0), 7));
  const clamp = (v) => Math.max(0, Math.min(255, Math.round(v)));
  const px = (x, y, r, gr, b) => { g.fillStyle = `rgb(${clamp(r)},${clamp(gr)},${clamp(b)})`; g.fillRect(x, y, 1, 1); };
  const noisy = (base, jitter, x0 = 0, y0 = 0, x1 = N, y1 = N) => {
    for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
      const j = (rng() - 0.5) * 2 * jitter;
      px(x, y, base[0] + j, base[1] + j, base[2] + j * 0.9);
    }
  };
  const blob = (cx, cy, color, size = 2) => {
    for (let dy = 0; dy < size; dy++) for (let dx = 0; dx < size; dx++) {
      if (rng() < 0.18 && size > 1) continue; // ragged edges
      const j = (rng() - 0.5) * 24;
      px(cx + dx, cy + dy, color[0] + j, color[1] + j, color[2] + j);
    }
  };
  const stoneBase = () => {
    noisy([128, 128, 132], 15);
    // a few dark cracks / pits
    for (let i = 0; i < 7; i++) px((rng() * N) | 0, (rng() * N) | 0, 92, 92, 98);
  };
  switch (kind) {
    case 'dirt':
      noisy([121, 85, 58], 14);
      for (let i = 0; i < 10; i++) px((rng() * N) | 0, (rng() * N) | 0, 92, 62, 40);
      for (let i = 0; i < 6; i++) px((rng() * N) | 0, (rng() * N) | 0, 150, 108, 76);
      break;
    case 'grass_top':
      noisy([88, 150, 52], 18);
      for (let i = 0; i < 14; i++) px((rng() * N) | 0, (rng() * N) | 0, 64, 118, 38);
      for (let i = 0; i < 8; i++) px((rng() * N) | 0, (rng() * N) | 0, 120, 178, 74);
      break;
    case 'grass_side': {
      noisy([121, 85, 58], 14);
      for (let i = 0; i < 8; i++) px((rng() * N) | 0, (rng() * N) | 0, 92, 62, 40);
      // grass cap with a ragged fringe
      for (let x = 0; x < N; x++) {
        const depth = 3 + ((rng() * 3) | 0);
        for (let y = 0; y < depth; y++) { const j = (rng() - 0.5) * 30; px(x, y, 88 + j, 150 + j, 52 + j * 0.5); }
      }
      break;
    }
    case 'stone':
      stoneBase();
      break;
    case 'coal':
      stoneBase();
      [[2, 3], [9, 2], [5, 9], [11, 11], [1, 12]].forEach(([x, y]) => blob(x, y, [34, 34, 38], 2 + ((rng() * 2) | 0)));
      break;
    case 'iron':
      stoneBase();
      [[3, 2], [10, 4], [6, 10], [12, 11], [1, 11]].forEach(([x, y]) => blob(x, y, [216, 160, 120], 2));
      break;
    case 'gold':
      stoneBase();
      [[2, 4], [9, 1], [5, 9], [11, 10], [2, 12]].forEach(([x, y]) => blob(x, y, [244, 208, 54], 2));
      break;
    case 'wood_side':
      for (let x = 0; x < N; x++) {
        const stripe = 108 + ((x % 4 === 0) ? -28 : (x % 4 === 2 ? 10 : 0));
        for (let y = 0; y < N; y++) { const j = (rng() - 0.5) * 10; px(x, y, stripe + j, stripe * 0.68 + j, stripe * 0.36 + j); }
      }
      break;
    case 'wood_top':
      for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
        const ring = Math.floor(Math.hypot(x - 7.5, y - 7.5)) % 3;
        const base = ring === 0 ? 178 : ring === 1 ? 150 : 128;
        const edge = (x === 0 || y === 0 || x === N - 1 || y === N - 1) ? -40 : 0;
        const j = (rng() - 0.5) * 8;
        px(x, y, base + edge + j, base * 0.74 + edge + j, base * 0.42 + edge + j);
      }
      break;
    case 'table':
      for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) { const j = (rng() - 0.5) * 10; const plank = (y % 5 === 0) ? -26 : 0; px(x, y, 168 + plank + j, 120 + plank + j, 70 + plank + j); }
      for (let i = 2; i < 8; i++) px(i, 3, 70, 74, 84); // a saw blade across the top left
      for (let i = 3; i < 6; i++) px(i, 4, 110, 114, 124);
      for (let i = 9; i < 14; i++) px(11, i, 96, 62, 30); // a hammer handle ...
      for (let i = 9; i < 14; i++) px(i, 9, 84, 88, 98); // ... and head
      px(2, 6, 80, 50, 24); px(3, 6, 80, 50, 24); // saw handle
      break;
    case 'lava':
      for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
        const w = Math.sin(x * 0.9 + y * 0.35) + Math.sin(y * 1.1 - x * 0.2) + (rng() - 0.5) * 0.9;
        const hot = w > 1.0 ? 1 : w > 0.1 ? 0.55 : 0;
        px(x, y, 170 + hot * 85, 40 + hot * 150, 8 + hot * 28);
      }
      break;
    case 'leaves':
      for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
        const dark = rng() < 0.28;
        const j = (rng() - 0.5) * 14;
        if (dark) px(x, y, 38 + j, 92 + j, 34 + j); else px(x, y, 70 + j, 140 + j, 58 + j);
      }
      break;
    case 'cobble':
      noisy([118, 118, 122], 12);
      // brick-ish mortar lines
      for (let x = 0; x < N; x++) { px(x, 0, 80, 80, 86); px(x, 7, 80, 80, 86); px(x, 15, 80, 80, 86); }
      for (let y = 0; y < 8; y++) px(4, y, 80, 80, 86);
      for (let y = 8; y < N; y++) px(11, y, 80, 80, 86);
      break;
    default:
      noisy([200, 0, 200], 0);
  }
  return c;
}

// All textures once: nearest-neighbour, no mipmaps, sRGB.
function ugBuildTextures() {
  const out = {};
  UG_TEXTURE_NAMES.forEach((name) => {
    const tex = new THREE.CanvasTexture(ugDrawTile(name));
    tex.magFilter = THREE.NearestFilter;
    tex.minFilter = THREE.NearestFilter;
    tex.generateMipmaps = false;
    tex.colorSpace = THREE.SRGBColorSpace;
    if (name === 'lava') { tex.wrapS = THREE.RepeatWrapping; tex.wrapT = THREE.RepeatWrapping; } // scrolled to make it flow
    tex.needsUpdate = true;
    out[name] = tex;
  });
  return out;
}

class UndergroundWorld {
  constructor({ canvasWrap, resources, inventory, seed, onResourceChange, onExit, onHealthChange, onFlyChange, onHotbarChange, onClockChange, pick, onPickChange, onOpenTable }) {
    this.canvasWrap = canvasWrap;
    this.resources = resources; // shared reference to main.js's resources object
    this.onResourceChange = onResourceChange; // () => void — call after any resource change
    this.inventory = inventory || {}; // extra collected counts: dirt / coal / iron / gold (saved by main.js)
    UG_INV_KEYS.forEach((k) => { this.inventory[k] = Math.max(0, Math.floor(Number(this.inventory[k])) || 0); });
    this.onHotbarChange = onHotbarChange || (() => {});
    this.pick = ugCleanPick(pick); // { tier, dur } — saved by main.js
    this.onPickChange = onPickChange || (() => {});
    this.onOpenTable = onOpenTable || (() => {});
    this.paused = false; // true while the crafting table is open
    // Seed 0 is the classic flat cave (no hills or trees); any other seed grows a hilly, wooded one.
    this.seed = Number.isInteger(seed) && seed >= 0 && seed < 4294967296 ? seed : 0;
    this.onExit = onExit;
    this.active = false;
    this.yaw = Math.PI;
    this.pitch = -0.4;
    this.keys = {};
    this.moveInput = { fwd: 0, strafe: 0, vert: 0 };
    this.dragging = false;
    this.lastDrag = null;
    this.occupied = new Set(); // "gx,gy,gz" currently solid (terrain, wall or torch)
    this.lookup = new Map(); // "gx,gy,gz" -> { mesh, instanceId, kind }
    this.pools = {}; // placed-block pools: wall (cobble) and dirt
    this.slotIndex = 0;
    this.mineHeld = false; // pickaxe held down (timed mining)
    this.mining = null; // { key, t, need } for the block being broken
    this.drops = []; // dropped item entities
    this.torches = new Map(); // "gx,gy,gz" -> { group, light, mesh }
    this.hotbar = 'wall'; // 'wall' (costs stone) | 'torch' (costs wood)
    this.viewMode = 'first'; // 'first' (eye height) | 'third' (behind the player)
    this.water = new Set(); // "gx,gy,gz" water cells (not solid; swimmable)
    this.lava = new Set(); // lava cells: slow like water, but they burn
    this.inLava = false;
    this._lavaT = 0;
    this.timeOfDay = UG_START_TIME; // 0 sunrise, 0.25 noon, 0.5 sunset, 0.75 midnight
    this.clockPhase = '';
    this.skyLight = 1; // 1 under open sky, 0 roofed over (smoothed)
    this.onClockChange = onClockChange || (() => {});
    this.physicsEnabled = true; // tests can freeze movement to pose the rig
    this.vel = { x: 0, y: 0, z: 0 };
    this.onGround = false;
    this.flying = false;
    this.inWater = false;
    this.health = UG_MAX_HEALTH;
    this.maxHealth = UG_MAX_HEALTH;
    this.deaths = 0;
    this.lastFall = 0; // distance of the most recent landing, for the HUD / tests
    this._peakY = UG_SPAWN[1];
    this._regenT = 0;
    this._lastSpaceT = -1e9;
    this.onHealthChange = onHealthChange || (() => {});
    this.onFlyChange = onFlyChange || (() => {});

    this._initThree();
    this._buildTerrain();
    this._buildPlacedPool();
    this._buildCrackOverlay();
    this._bindInput();
  }

  // Switches what Place puts down — a stone wall or a lit torch — same
  // idea as a Minecraft hotbar, just two slots instead of nine.
  setHotbar(type) {
    const i = UG_SLOTS.indexOf(type);
    if (i >= 0) this.selectSlot(i);
  }

  // 0..8. Number keys, the mouse wheel and tapping a slot all land here.
  selectSlot(i) {
    i = ((Math.floor(i) % 9) + 9) % 9;
    this.slotIndex = i;
    this.hotbar = UG_SLOTS[i] || 'empty';
    this._refreshHeldItem();
    this.onHotbarChange(this.getHotbarState());
  }

  // [{ id, count, selected }] for the on-screen hotbar.
  getHotbarState() {
    const count = (id) => (id === 'wall' ? this.resources.stone : id === 'torch' ? this.resources.wood : id === 'table' ? Math.floor((this.resources.wood || 0) / UG_TABLE_WOOD) : this.inventory[id]) || 0;
    return UG_SLOTS.map((id, i) => ({ id, count: id ? count(id) : 0, selected: i === this.slotIndex }));
  }

  // 'first' | 'third'. F5 / the View button flip between them.
  setView(mode) {
    this.viewMode = mode === 'third' ? 'third' : 'first';
    this._applyViewVisibility();
  }

  toggleView() {
    this.setView(this.viewMode === 'first' ? 'third' : 'first');
    return this.viewMode;
  }

  _applyViewVisibility() {
    const first = this.viewMode === 'first';
    if (this.playerMesh) this.playerMesh.visible = !first;
    if (this.tool) this.tool.visible = !first;
    if (this.fpHand) this.fpHand.visible = first;
  }

  // ---------- setup ----------

  _initThree() {
    this.textures = ugBuildTextures();
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x0a0e14);
    this.scene.fog = new THREE.FogExp2(0x0a0e14, 0.03);
    this._skyColor = new THREE.Color();

    this.camera = new THREE.PerspectiveCamera(70, 1, 0.1, 200);

    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    // Phones are fill-rate bound: cap the pixel ratio lower there (the chunky pixel-art look doesn't need more).
    const coarse = window.matchMedia && window.matchMedia('(pointer: coarse)').matches;
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, coarse ? 1.5 : 2));
    this.canvasWrap.appendChild(this.renderer.domElement);

    // Tuned for the (brighter) pixel-art textures: dim ambient + a head-torch that fades with distance.
    this.ambient = new THREE.AmbientLight(0x8a96b0, UG_AMBIENT_DAY);
    this.scene.add(this.ambient);
    this.sun = new THREE.DirectionalLight(0xfff0cc, 1);
    this.sun.position.set(40, 90, 25);
    this.scene.add(this.sun);
    this.torch = new THREE.PointLight(0xffe2b8, UG_HEAD_LIGHT, 30, 1.6);
    this.scene.add(this.torch);

    const playerGeo = new THREE.CapsuleGeometry(UG_HALF_W, UG_BODY_H - 2 * UG_HALF_W, 4, 8);
    const playerMat = new THREE.MeshStandardMaterial({ color: 0x6fbf73 });
    this.playerMesh = new THREE.Mesh(playerGeo, playerMat);
    this.scene.add(this.playerMesh);

    this.rig = new THREE.Object3D();
    this.scene.add(this.rig);

    // Pickaxe held at the player's right side; swings on every mine().
    this.tool = new THREE.Group();
    const grip = new THREE.Group();
    const handle = new THREE.Mesh(new THREE.BoxGeometry(0.14, 1.4, 0.14), new THREE.MeshStandardMaterial({ color: 0x8a5a2b }));
    handle.position.y = 0.6;
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.2, 1.1), new THREE.MeshStandardMaterial({ color: 0xb8c2cc }));
    this._toolHead = head;
    head.position.y = 1.25;
    grip.add(handle, head);
    grip.position.set(1.25, -0.5, -0.35);
    this.tool.add(grip);
    this.toolGrip = grip;
    this.swingT = 0;
    this.scene.add(this.tool);

    this.reticle = new THREE.Mesh(
      new THREE.RingGeometry(0.006, 0.01, 12),
      new THREE.MeshBasicMaterial({ color: 0xffffff, depthTest: false, transparent: true, opacity: 0.8 })
    );
    this.camera.add(this.reticle);
    this.reticle.position.set(0, 0, -1);
    this.scene.add(this.camera);

    this.raycaster = new THREE.Raycaster();
    this.raycaster.far = UG_REACH;

    this._buildFirstPersonHand();
    this._applyViewVisibility();
  }

  // Held items for first-person, parented to the camera: the pickaxe in the
  // right hand (swings on mine) and the selected block / torch in the left.
  _buildFirstPersonHand() {
    this.fpHand = new THREE.Group();
    const handMat = (color) => new THREE.MeshBasicMaterial({ color, depthTest: false });
    const pick = new THREE.Group();
    const handle = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.62, 0.07), handMat(0x8a5a2b));
    handle.position.y = 0.05;
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.09, 0.5), handMat(0xb8c2cc));
    this._fpHead = head;
    head.position.y = 0.36;
    pick.add(handle, head);
    pick.position.set(0.5, -0.42, -0.85);
    pick.rotation.set(-0.5, -0.35, 0.25);
    this.fpPick = pick;

    // Selected block (cobble cube for walls) or a torch, in the left hand.
    this.fpItem = new THREE.Group();
    this.fpItem.position.set(-0.5, -0.4, -0.85);
    this.fpItem.rotation.set(0.35, 0.6, 0);
    const cube = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.24, 0.24), new THREE.MeshBasicMaterial({ map: this.textures.cobble, color: 0xcfcfcf, depthTest: false }));
    cube.name = 'fp-cube';
    const torchHeld = new THREE.Group();
    torchHeld.name = 'fp-torch';
    const stick = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.34, 0.06), handMat(0x7a4a26));
    const flame = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.09, 0.09), new THREE.MeshBasicMaterial({ color: 0xffcf5c, depthTest: false }));
    flame.position.y = 0.2;
    torchHeld.add(stick, flame);
    this.fpItem.add(cube, torchHeld);

    [pick, this.fpItem].forEach((grp) => grp.traverse((o) => { if (o.isMesh) o.renderOrder = 999; }));
    this.fpHand.add(pick, this.fpItem);
    this.camera.add(this.fpHand);
    this._refreshHeldItem();
    this._applyPickLook();
  }

  // The pickaxe head takes the colour of the tier you are holding.
  _applyPickLook() {
    const c = UG_PICKS[this.pick.tier].color;
    if (this._toolHead) this._toolHead.material.color.setHex(c);
    if (this._fpHead) this._fpHead.material.color.setHex(c);
  }

  setPick(tier, dur) {
    this.pick = ugCleanPick({ tier, dur });
    this._applyPickLook();
    this.onPickChange(this.pick, false);
  }

  // One block broken with a tiered pickaxe costs one durability; at zero it breaks and you are back to the wooden one.
  _wearPick() {
    if (!this.pick.tier) return;
    this.pick.dur -= 1;
    let broke = false;
    if (this.pick.dur <= 0) { this.pick = { tier: 0, dur: 0 }; broke = true; this._applyPickLook(); }
    this.onPickChange(this.pick, broke);
  }

  setPaused(on) { this.paused = !!on; if (on) { this.mineHeld = false; this._cancelMining(); this.keys = {}; this.moveInput.fwd = 0; this.moveInput.strafe = 0; this.moveInput.vert = 0; } }

  // The crafting table under the crosshair (within reach)? Opens the table, returns true.
  useTable() {
    if (this.paused) return false;
    const hits = this._raycastTargets();
    const t = hits.length ? this._targetFromHit(hits[0]) : null;
    if (!t || t.type !== 'placed' || t.entry.pool !== 'table') return false;
    this.onOpenTable();
    return true;
  }

  _refreshHeldItem() {
    if (!this.fpItem) return;
    const cube = this.fpItem.getObjectByName('fp-cube');
    const torch = this.fpItem.getObjectByName('fp-torch');
    const texFor = { wall: 'cobble', dirt: 'dirt', coal: 'coal', iron: 'iron', gold: 'gold', table: 'table' }[this.hotbar];
    if (cube) {
      cube.visible = !!texFor;
      if (texFor) { cube.material.map = this.textures[texFor]; cube.material.needsUpdate = true; }
    }
    if (torch) torch.visible = this.hotbar === 'torch';
  }

  // Carved with a short random walk per depth level so it reads as tunnels,
  // not a flat grid — but always keeps a clear vertical shaft at the origin
  // so the entry hole is visible from the surface and you can always find
  // your way back up.
  _buildTerrain() {
    const solid = new Map(); // key -> 'grass' | 'dirt' | 'stone' | 'coal' | 'iron' | 'gold' | 'wood' | 'leaves'
    const seed = this.seed;
    const flat = seed === 0;
    const inBounds = (x, z) => Math.abs(x) <= UG_SIZE && Math.abs(z) <= UG_SIZE;
    const inFlat = (x, z) => Math.max(Math.abs(x), Math.abs(z)) <= UG_FLAT_RADIUS;

    // Surface height above the old flat level, in blocks: 0, 1 or 2. Rolling hills from two octaves
    // of value noise; the area around the shaft is always flat.
    const rise = (x, z) => {
      if (flat || inFlat(x, z)) return 0;
      const n = ugNoise2(x / 7, z / 7, seed) * 0.7 + ugNoise2(x / 3.2, z / 3.2, seed + 17) * 0.3;
      return n < 0.46 ? 0 : n < 0.62 ? 1 : 2;
    };
    this.surfaceRise = (x, z) => rise(x, z); // exposed for tests / later slices

    for (let x = -UG_SIZE; x <= UG_SIZE; x++) {
      for (let z = -UG_SIZE; z <= UG_SIZE; z++) {
        const top = -1 + rise(x, z); // gy of the grass block
        for (let y = top; y >= -UG_DEPTH; y--) {
          const depth = top - y;
          let type = depth === 0 ? 'grass' : y >= -4 ? 'dirt' : 'stone';
          if (type === 'stone') {
            const roll = ugHash(x, y, z, seed + 101);
            if (roll < 0.01 && y <= -6) type = 'gold';
            else if (roll < 0.035 && y <= -5) type = 'iron';
            else if (roll < 0.075) type = 'coal';
          }
          // Old log veins running through the dirt layer — a wood source underground.
          if ((type === 'dirt' || type === 'grass') && ugHash(x, y, z, seed + 202) < 0.05) type = 'wood';
          solid.set(`${x},${y},${z}`, type);
        }
      }
    }

    // Trees on the hills: a 2-block trunk with a leafy crown, never near the shaft, never touching.
    this.trees = 0;
    const treeRoots = new Set(); // columns that carry a tree: the surface under them is never tunnelled
    if (!flat) {
      const taken = new Set();
      for (let x = -UG_SIZE + 2; x <= UG_SIZE - 2; x++) {
        for (let z = -UG_SIZE + 2; z <= UG_SIZE - 2; z++) {
          if (inFlat(x, z) || ugHash(x, 0, z, seed + 303) > 0.045) continue;
          const r = rise(x, z);
          let ok = true;
          for (let dx = -2; dx <= 2 && ok; dx++) for (let dz = -2; dz <= 2; dz++) if (taken.has(`${x + dx},${z + dz}`)) { ok = false; break; }
          for (let dx = -1; dx <= 1 && ok; dx++) for (let dz = -1; dz <= 1; dz++) if (rise(x + dx, z + dz) !== r) { ok = false; break; } // level ground only
          if (!ok) continue;
          taken.add(`${x},${z}`);
          treeRoots.add(`${x},${z}`);
          const base = -1 + r; // grass block under the trunk
          solid.set(`${x},${base + 1},${z}`, 'wood');
          solid.set(`${x},${base + 2},${z}`, 'wood');
          for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) solid.set(`${x + dx},${base + 3},${z + dz}`, 'leaves');
          solid.set(`${x},${base + 4},${z}`, 'leaves');
          this.trees += 1;
        }
      }
    }

    const carve = (x, y, z) => solid.delete(`${x},${y},${z}`);
    for (let y = -1; y >= -UG_DEPTH; y--) {
      // Carve the central shaft clear at every level (and up through any hill that grew over it).
      for (let x = -1; x <= 1; x++) for (let z = -1; z <= 1; z++) carve(x, y, z);
      // A couple of wandering tunnels off the shaft, per level (seeded walk).
      for (let t = 0; t < 2; t++) {
        let cx = 0; let cz = 0;
        for (let step = 0; step < 16; step++) {
          cx += Math.round(ugHash(step, y * 2 + t, 1, seed + 404) * 2 - 1);
          cz += Math.round(ugHash(step, y * 2 + t, 2, seed + 404) * 2 - 1);
          if (!inBounds(cx, cz)) break;
          // The grass layer is never cut inside the flat clearing (spawn!) or under a tree.
          if (!(y === -1 && (inFlat(cx, cz) || treeRoots.has(`${cx},${cz}`)))) carve(cx, y, cz);
          carve(cx, y - 1, cz);
        }
      }
    }

    // A flooded cavern off the shaft (levels -5..-7): the swimming spot. It is joined to the
    // shaft by carving x = 2..6, and the lower two levels of x = 3..6 are filled with water.
    for (let x = 2; x <= 6; x++) {
      for (let z = -1; z <= 1; z++) {
        for (let y = -5; y >= -7; y--) solid.delete(`${x},${y},${z}`);
        if (x >= 3) { this.water.add(`${x},-6,${z}`); this.water.add(`${x},-7,${z}`); }
      }
    }

    // A lava cavern on the other side of the shaft: x = -6..-2 is carved, the lower level of
    // x = -6..-3 is lava, and the lit ledge at x = -2 is how you walk in (and out).
    for (let x = -6; x <= -2; x++) {
      for (let z = -1; z <= 1; z++) {
        for (let y = -5; y >= -7; y--) solid.delete(`${x},${y},${z}`);
        if (x <= -3) this.lava.add(`${x},-7,${z}`);
      }
    }

    const kinds = ['grass', 'dirt', 'stone', 'coal', 'iron', 'gold', 'wood', 'leaves'];
    const counts = {};
    kinds.forEach((k) => { counts[k] = 0; });
    solid.forEach((type) => { counts[type]++; });
    const meshes = {};
    // Per-pixel lighting (Standard, fully rough): the 2-unit block faces are too large for
    // cheap per-vertex lighting to look right next to a point light.
    const lambert = (name) => new THREE.MeshStandardMaterial({ map: this.textures[name], roughness: 1, metalness: 0 });
    // Per-face materials (BoxGeometry order: +x, -x, +y, -y, +z, -z).
    const faces = {
      grass: () => { const side = lambert('grass_side'); return [side, side, lambert('grass_top'), lambert('dirt'), side, side]; },
      wood: () => { const side = lambert('wood_side'); const top = lambert('wood_top'); return [side, side, top, top, side, side]; },
      dirt: () => lambert('dirt'),
      stone: () => lambert('stone'),
      coal: () => lambert('coal'),
      iron: () => lambert('iron'),
      gold: () => lambert('gold'),
      leaves: () => lambert('leaves'),
    };
    kinds.forEach((type) => {
      if (!counts[type]) return;
      const geo = new THREE.BoxGeometry(UG_BLOCK * 0.98, UG_BLOCK * 0.98, UG_BLOCK * 0.98);
      const mesh = new THREE.InstancedMesh(geo, faces[type](), counts[type]);
      mesh.count = 0;
      this.scene.add(mesh);
      meshes[type] = mesh;
    });

    const m = new THREE.Matrix4();
    solid.forEach((type, key) => {
      const [gx, gy, gz] = key.split(',').map(Number);
      const mesh = meshes[type];
      const idx = mesh.count++;
      m.makeTranslation(gx * UG_BLOCK, gy * UG_BLOCK, gz * UG_BLOCK);
      mesh.setMatrixAt(idx, m);
      this.lookup.set(key, { mesh, instanceId: idx, kind: type });
      this.occupied.add(key);
    });
    Object.values(meshes).forEach((mesh) => { mesh.instanceMatrix.needsUpdate = true; });
    this.terrainMeshes = meshes;

    const waterMesh = new THREE.InstancedMesh(
      new THREE.BoxGeometry(UG_BLOCK * 0.98, UG_BLOCK * 0.98, UG_BLOCK * 0.98),
      new THREE.MeshStandardMaterial({ color: 0x3a6fe0, roughness: 0.3, metalness: 0, transparent: true, opacity: 0.55, depthWrite: false }),
      Math.max(1, this.water.size)
    );
    let wi = 0;
    this.water.forEach((key) => {
      const [gx, gy, gz] = key.split(',').map(Number);
      m.makeTranslation(gx * UG_BLOCK, gy * UG_BLOCK, gz * UG_BLOCK);
      waterMesh.setMatrixAt(wi++, m);
    });
    waterMesh.count = wi;
    this.scene.add(waterMesh);
    this.waterMesh = waterMesh;

    // Lava: a glowing, scrolling texture and two warm lights so the cavern shows up in the dark.
    const lavaMesh = new THREE.InstancedMesh(
      new THREE.BoxGeometry(UG_BLOCK * 0.98, UG_BLOCK * 0.98, UG_BLOCK * 0.98),
      new THREE.MeshStandardMaterial({ map: this.textures.lava, emissive: 0xff5a14, emissiveMap: this.textures.lava, emissiveIntensity: 1.1, roughness: 0.6, metalness: 0 }),
      Math.max(1, this.lava.size)
    );
    let li = 0;
    this.lava.forEach((key) => {
      const [gx, gy, gz] = key.split(',').map(Number);
      m.makeTranslation(gx * UG_BLOCK, gy * UG_BLOCK, gz * UG_BLOCK);
      lavaMesh.setMatrixAt(li++, m);
    });
    lavaMesh.count = li;
    this.scene.add(lavaMesh);
    this.lavaMesh = lavaMesh;
    [-9, -13].forEach((x) => {
      const light = new THREE.PointLight(0xff7a2a, 3.2, 17, 1.6);
      light.position.set(x, -12.2, 0);
      this.scene.add(light);
    });
  }

  _buildPlacedPool() {
    const geo = new THREE.BoxGeometry(UG_BLOCK * 0.98, UG_BLOCK * 0.98, UG_BLOCK * 0.98);
    const hidden = new THREE.Matrix4().makeTranslation(0, -9999, 0);
    const make = (name, tex, capacity) => {
      const mat = new THREE.MeshStandardMaterial({ map: this.textures[tex], roughness: 1, metalness: 0 });
      const mesh = new THREE.InstancedMesh(geo, mat, capacity);
      mesh.count = capacity;
      for (let i = 0; i < capacity; i++) mesh.setMatrixAt(i, hidden);
      this.scene.add(mesh);
      this.pools[name] = { name, mesh, free: [], next: 0, capacity };
    };
    make('wall', 'cobble', UG_PLACED_CAPACITY);
    make('dirt', 'dirt', 100);
    make('table', 'table', 20);
    this.placedMesh = this.pools.wall.mesh; // kept for older callers / tests
  }

  // ---------- input ----------

  _bindInput() {
    this.onKeyDown = (e) => {
      const k = e.key.toLowerCase();
      if ((k === ' ' || k === 'spacebar') && !e.repeat && this.active) this.tapJump();
      this.keys[k] = true;
    };
    this.onKeyUp = (e) => { this.keys[e.key.toLowerCase()] = false; };
    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);

    const dom = this.renderer.domElement;
    dom.style.touchAction = 'none';
    const start = (x, y) => { this.dragging = true; this.lastDrag = { x, y }; };
    const move = (x, y) => {
      if (!this.dragging) return;
      const dx = x - this.lastDrag.x;
      const dy = y - this.lastDrag.y;
      this.lastDrag = { x, y };
      this.yaw -= dx * 0.004;
      this.pitch = Math.max(-1.3, Math.min(1.3, this.pitch - dy * 0.004));
    };
    const end = () => { this.dragging = false; };

    this.onPointerDown = (e) => start(e.clientX, e.clientY);
    this.onPointerMove = (e) => move(e.clientX, e.clientY);
    this.onPointerUp = () => end();
    dom.addEventListener('pointerdown', this.onPointerDown);
    dom.addEventListener('pointermove', this.onPointerMove);
    window.addEventListener('pointerup', this.onPointerUp);

    // Mouse wheel cycles the hotbar (down = next slot).
    this.onWheel = (e) => {
      e.preventDefault();
      const now = performance.now();
      if (!e.deltaY || now - (this._lastWheelT || 0) < 80) return; // sideways scroll / trackpad burst: one slot per gesture tick
      this._lastWheelT = now;
      this.selectSlot(this.slotIndex + (e.deltaY > 0 ? 1 : -1));
    };
    dom.addEventListener('wheel', this.onWheel, { passive: false });

    this.onResize = () => { if (this.active) this._resize(); };
    window.addEventListener('resize', this.onResize);
  }

  setMoveInput(fwd, strafe, vert) {
    this.moveInput.fwd = fwd;
    this.moveInput.strafe = strafe;
    if (vert !== undefined) this.moveInput.vert = vert;
  }

  // A fresh press of Jump. Two presses within 300 ms toggle creative flight.
  tapJump() {
    const now = performance.now();
    if (now - this._lastSpaceT < 300) { this.toggleFly(); this._lastSpaceT = -1e9; } else this._lastSpaceT = now;
  }

  toggleFly(on) {
    this.flying = on === undefined ? !this.flying : !!on;
    this.vel.y = 0;
    this._peakY = this.rig.position.y;
    this.onFlyChange(this.flying);
    return this.flying;
  }

  // ---------- physics ----------

  // Cell (gx,gy,gz) blocks the body? Outside the cave on the sides and below the last layer is
  // solid (invisible wall / bedrock floor); above the surface is open air. Torches do not collide.
  _solidAt(gx, gy, gz) {
    if (gx < -UG_SIZE || gx > UG_SIZE || gz < -UG_SIZE || gz > UG_SIZE || gy < -UG_DEPTH) return true;
    const key = `${gx},${gy},${gz}`;
    return this.occupied.has(key) && !this.torches.has(key);
  }

  _boxHits(x, y, z) {
    const e = 1e-6;
    const x0 = Math.floor((x - UG_HALF_W + 1) / UG_BLOCK);
    const x1 = Math.floor((x + UG_HALF_W + 1 - e) / UG_BLOCK);
    const y0 = Math.floor((y + 1) / UG_BLOCK);
    const y1 = Math.floor((y + UG_BODY_H + 1 - e) / UG_BLOCK);
    const z0 = Math.floor((z - UG_HALF_W + 1) / UG_BLOCK);
    const z1 = Math.floor((z + UG_HALF_W + 1 - e) / UG_BLOCK);
    for (let gx = x0; gx <= x1; gx++) for (let gy = y0; gy <= y1; gy++) for (let gz = z0; gz <= z1; gz++) if (this._solidAt(gx, gy, gz)) return true;
    return false;
  }

  // Moves along one axis in <= 0.4 unit sub-steps (so a fast fall can't tunnel through a 2 unit
  // block) and bisects to the surface on contact. Axes resolve one at a time, which makes
  // sliding along walls and corners work. Returns true if it was blocked.
  _moveAxis(axis, d) {
    if (!d) return false;
    const p = this.rig.position;
    const n = Math.ceil(Math.abs(d) / 0.4);
    const step = d / n;
    for (let i = 0; i < n; i++) {
      const prev = p[axis];
      p[axis] = prev + step;
      if (this._boxHits(p.x, p.y, p.z)) {
        let lo = prev; let hi = prev + step;
        for (let k = 0; k < 8; k++) {
          const mid = (lo + hi) / 2;
          p[axis] = mid;
          if (this._boxHits(p.x, p.y, p.z)) hi = mid; else lo = mid;
        }
        p[axis] = lo;
        return true;
      }
    }
    return false;
  }

  _inWaterCell() {
    const p = this.rig.position;
    return this.water.has(`${Math.round(p.x / UG_BLOCK)},${Math.round((p.y + 1.2) / UG_BLOCK)},${Math.round(p.z / UG_BLOCK)}`);
  }

  _inLavaCell() {
    if (!this.lava.size) return false;
    const p = this.rig.position;
    const gx = Math.round(p.x / UG_BLOCK); const gz = Math.round(p.z / UG_BLOCK);
    // feet or upper body in a lava cell (a pit under the lava still burns you)
    return this.lava.has(`${gx},${Math.round((p.y + 0.3) / UG_BLOCK)},${gz}`) || this.lava.has(`${gx},${Math.round((p.y + 2.2) / UG_BLOCK)},${gz}`);
  }

  _damage(n) {
    if (n <= 0) return;
    this.health = Math.max(0, this.health - n);
    this._regenT = 0;
    if (this.health <= 0) {
      this.deaths += 1;
      this.respawn();
    } else this.onHealthChange(this.health, this.maxHealth);
  }

  respawn() {
    this.rig.position.set(UG_SPAWN[0], UG_SPAWN[1], UG_SPAWN[2]);
    this.vel.x = 0; this.vel.y = 0; this.vel.z = 0;
    this.health = this.maxHealth;
    this.flying = false;
    this._peakY = UG_SPAWN[1];
    this.onHealthChange(this.health, this.maxHealth);
    this.onFlyChange(false);
  }

  // Would a block in cell (gx,gy,gz) overlap the player's body?
  _cellOverlapsPlayer(gx, gy, gz) {
    const p = this.rig.position;
    const B = UG_BLOCK;
    return p.x + UG_HALF_W > gx * B - 1 && p.x - UG_HALF_W < gx * B + 1
      && p.y + UG_BODY_H > gy * B - 1 && p.y < gy * B + 1
      && p.z + UG_HALF_W > gz * B - 1 && p.z - UG_HALF_W < gz * B + 1;
  }

  // Extrudes one 24x24 frame of a sprite strip into a voxel figure: every
  // opaque pixel becomes a small box, so the 2D villager keeps its exact
  // look in 3D. Replaces the placeholder capsule once the image loads.
  setAvatar(url, frame, frameSize) {
    const img = new Image();
    img.onload = () => {
      const c = document.createElement('canvas');
      c.width = frameSize; c.height = frameSize;
      const g = c.getContext('2d');
      g.drawImage(img, frame * frameSize, 0, frameSize, frameSize, 0, 0, frameSize, frameSize);
      const px = g.getImageData(0, 0, frameSize, frameSize).data;
      const cells = [];
      for (let y = 0; y < frameSize; y++) {
        for (let x = 0; x < frameSize; x++) {
          const i = (y * frameSize + x) * 4;
          if (px[i + 3] > 127) cells.push([x, y, px[i], px[i + 1], px[i + 2]]);
        }
      }
      if (!cells.length) return;
      const s = 2.4 / frameSize;
      const mesh = new THREE.InstancedMesh(
        new THREE.BoxGeometry(s, s, s * 4),
        new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.8 }),
        cells.length
      );
      const m = new THREE.Matrix4();
      const col = new THREE.Color();
      cells.forEach(([x, y, r, gr, b], i) => {
        m.makeTranslation((x - frameSize / 2 + 0.5) * s, (frameSize / 2 - y - 0.5) * s, 0);
        mesh.setMatrixAt(i, m);
        col.setRGB(r / 255, gr / 255, b / 255, THREE.SRGBColorSpace);
        mesh.setColorAt(i, col);
      });
      mesh.instanceColor.needsUpdate = true;
      mesh.scale.setScalar(UG_BODY_H / 2.4); // sprite is 2.4 tall; the body is 3.6
      this.scene.remove(this.playerMesh);
      this.playerMesh = mesh;
      this.scene.add(mesh);
      this._applyViewVisibility(); // the voxel avatar arrives async: honour the current view
    };
    img.src = url;
  }

  // ---------- lifecycle ----------

  start() {
    this.active = true;
    this.respawn();
    this.paused = false;
    this._applyPickLook();
    this.timeOfDay = UG_START_TIME;
    this.skyLight = 1;
    this._applyLighting(0);
    this.yaw = Math.PI / 2; // facing the shaft
    this.pitch = -0.15;
    this._applyViewVisibility();
    this._resize();
    this._lastT = performance.now();
    this._raf = requestAnimationFrame(this._loop);
  }

  stop() {
    this.active = false;
    this.mineHeld = false;
    this._cancelMining();
    this._collectAllDrops(); // anything still on the ground is handed over, never lost
    if (this._raf) cancelAnimationFrame(this._raf);
  }

  destroy() {
    this.stop();
    this.renderer.domElement.removeEventListener('wheel', this.onWheel);
    window.removeEventListener('keydown', this.onKeyDown);
    window.removeEventListener('keyup', this.onKeyUp);
    window.removeEventListener('pointerup', this.onPointerUp);
    window.removeEventListener('resize', this.onResize);
    // Free GPU resources: textures and the per-kind material sets.
    Object.values(this.textures || {}).forEach((t) => t.dispose());
    Object.values(this.terrainMeshes || {}).forEach((m) => {
      (Array.isArray(m.material) ? m.material : [m.material]).forEach((mat) => mat.dispose());
      m.geometry.dispose();
    });
    (this.crackTextures || []).forEach((t) => t.dispose());
    this.drops.forEach((d) => this.scene.remove(d.mesh));
    if (this._dropGeo) this._dropGeo.dispose();
    Object.values(this._dropMats || {}).forEach((m) => m.dispose());
    if (this.lavaMesh) { this.lavaMesh.geometry.dispose(); this.lavaMesh.material.dispose(); }
    if (this.waterMesh) { this.waterMesh.geometry.dispose(); this.waterMesh.material.dispose(); }
    this.renderer.dispose();
    if (this.renderer.domElement.parentNode) this.renderer.domElement.parentNode.removeChild(this.renderer.domElement);
  }

  _resize() {
    const w = this.canvasWrap.clientWidth || window.innerWidth;
    const h = this.canvasWrap.clientHeight || window.innerHeight;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
  }

  // ---------- frame loop ----------

  _loop = (now) => {
    if (!this.active) return;
    const delta = Math.min((now - this._lastT) / 1000, 0.1);
    this._lastT = now;
    this._update(delta);
    this.renderer.render(this.scene, this.camera);
    this._raf = requestAnimationFrame(this._loop);
  };

  _forwardVector() {
    return new THREE.Vector3(0, 0, -1).applyEuler(new THREE.Euler(this.pitch, this.yaw, 0, 'YXZ'));
  }

  // Walking physics (A2): gravity, jump, voxel collision with auto-jump up a one-block ledge,
  // swimming, fall damage; creative flight (double-tap Jump) is a toggle. WASD / the dpad move
  // on the flat plane relative to where you face; looking up/down only aims.
  _update(delta) {
    if (this.paused) return; // the crafting table is open
    const dt = Math.min(delta, 0.05);
    let fwd = this.moveInput.fwd;
    let strafe = this.moveInput.strafe;
    const vert = this.moveInput.vert || 0;
    if (this.keys.w || this.keys.arrowup) fwd += 1;
    if (this.keys.s || this.keys.arrowdown) fwd -= 1;
    if (this.keys.a || this.keys.arrowleft) strafe -= 1;
    if (this.keys.d || this.keys.arrowright) strafe += 1;
    const jumpHeld = !!(this.keys[' '] || this.keys.spacebar) || vert > 0;
    const downHeld = !!(this.keys.shift || this.keys.c) || vert < 0;

    const p = this.rig.position;
    if (this.physicsEnabled) {
      if (this._boxHits(p.x, p.y, p.z)) { // never start inside a block: pop up to the first free spot
        const y0 = p.y; let guard = 0;
        while (guard++ < 24 && this._boxHits(p.x, p.y, p.z)) p.y += 0.5;
        if (this._boxHits(p.x, p.y, p.z)) p.y = y0;
      }
      const wasGround = this.onGround;
      this.inWater = this._inWaterCell();
      this.inLava = this._inLavaCell();
      const fluid = this.inWater || this.inLava; // both slow you and cancel fall damage
      const flatFwd = new THREE.Vector3(Math.sin(this.yaw), 0, Math.cos(this.yaw)).multiplyScalar(-1);
      const right = new THREE.Vector3(flatFwd.z, 0, -flatFwd.x);
      const dir = new THREE.Vector3().addScaledVector(flatFwd, fwd).addScaledVector(right, strafe);
      const moving = dir.lengthSq() > 0;
      if (moving) dir.normalize();
      const speed = this.flying ? UG_FLY : fluid ? UG_SWIM : UG_WALK;
      this.vel.x = dir.x * speed;
      this.vel.z = dir.z * speed;

      if (this.flying) {
        this.vel.y = ((jumpHeld ? 1 : 0) - (downHeld ? 1 : 0)) * 8;
        if (downHeld && wasGround) this.toggleFly(false); // touching down ends flight
      } else if (fluid) {
        this.vel.y = Math.max(this.vel.y - UG_GRAVITY * 0.15 * dt, -3);
        if (jumpHeld) this.vel.y = 4.5; else if (downHeld) this.vel.y = -4.5;
        this.vel.y *= 0.96;
      } else {
        this.vel.y = Math.max(this.vel.y - UG_GRAVITY * dt, -UG_TERMINAL_V);
        if (jumpHeld && wasGround) this.vel.y = UG_JUMP_V;
      }

      const bx = this._moveAxis('x', this.vel.x * dt);
      const bz = this._moveAxis('z', this.vel.z * dt);
      if ((bx || bz) && wasGround && moving && !this.flying && !fluid && this.vel.y <= 0.01) {
        // Auto-jump: walk into a one-block ledge and hop up it, but only if the space on top is
        // clear — a two-block wall still stops you.
        const ox = p.x + dir.x * 0.4; const oz = p.z + dir.z * 0.4;
        if (this._boxHits(ox, p.y, oz) && !this._boxHits(ox, p.y + UG_BLOCK + 0.02, oz)) this.vel.y = UG_JUMP_V;
      }

      if (this.flying && p.y > 14 && this.vel.y > 0) this.vel.y = 0; // flight ceiling, as before
      const by = this._moveAxis('y', this.vel.y * dt);
      const wasAir = !wasGround;
      this.onGround = by && this.vel.y < 0;
      if (by) {
        if (this.vel.y < 0 && wasAir && !this.flying && !fluid) {
          const fall = this._peakY - p.y;
          this.lastFall = fall;
          if (fall > UG_FALL_SAFE) this._damage(Math.floor((fall - UG_FALL_SAFE) / 1.5));
        }
        this.vel.y = 0;
      }
      if (this.onGround || this.flying || fluid) this._peakY = p.y; else this._peakY = Math.max(this._peakY, p.y);

      if (this.inLava) {
        this._lavaT += dt;
        if (this._lavaT >= UG_LAVA_TICK) { this._lavaT -= UG_LAVA_TICK; this._damage(UG_LAVA_DAMAGE); }
      } else this._lavaT = 0;

      this._regenT += dt;
      if (this._regenT >= 3 && this.health < this.maxHealth) {
        this.health += 1; this._regenT = 0; this.onHealthChange(this.health, this.maxHealth);
      }
    }

    this._updateMining(dt);
    this._updateDrops(dt);
    this._updateLighting(dt);

    // The mesh origins are body centres; the rig is the feet.
    this.playerMesh.position.set(p.x, p.y + UG_BODY_H / 2, p.z);
    this.playerMesh.rotation.y = this.yaw;
    this.tool.position.set(p.x, p.y + UG_BODY_H / 2, p.z);
    this.tool.rotation.y = this.yaw;
    this.swingT = Math.max(0, this.swingT - delta);
    this.toolGrip.rotation.x = -0.35 - Math.sin((this.swingT / 0.25) * Math.PI) * 1.2;
    if (this.viewMode === 'first') {
      // Eye height; same origin the mine/place ray uses, so the crosshair is exact.
      this.camera.position.set(p.x, p.y + UG_EYE_HEIGHT, p.z);
      this.camera.rotation.set(this.pitch, this.yaw, 0, 'YXZ');
      // Pickaxe swing (the whole arm kicks forward and back).
      const k = Math.sin((this.swingT / 0.25) * Math.PI);
      this.fpPick.rotation.set(-0.5 - k * 1.1, -0.35, 0.25);
      this.fpPick.position.set(0.5, -0.42 + k * 0.05, -0.85 - k * 0.15);
    } else {
      const look = this._forwardVector();
      this.camera.position.set(p.x, p.y + UG_THIRD_PIVOT, p.z).addScaledVector(look, -UG_THIRD_PERSON_DIST);
      this.camera.lookAt(p.x, p.y + UG_THIRD_PIVOT, p.z);
    }
    this.torch.position.copy(this.camera.position);

    this.nearExit = Math.abs(p.x) < UG_BLOCK * 1.5 && Math.abs(p.z) < UG_BLOCK * 1.5 && p.y > -UG_BLOCK * 1.5;
  }

  // ---------- mine / place ----------

  // Cast from the player's own position (not the camera, which sits well
  // behind/above in third-person and would give an unreliable reach,
  // especially when looking steeply up/down) along the look direction.
  _raycastTargets() {
    const objs = Object.values(this.pools).map((p) => p.mesh);
    Object.values(this.terrainMeshes || {}).forEach((m) => objs.push(m));
    this.torches.forEach((t) => objs.push(t.mesh));
    const origin = this.rig.position.clone();
    origin.y += UG_EYE_HEIGHT;
    this.raycaster.set(origin, this._forwardVector());
    return this.raycaster.intersectObjects(objs);
  }

  _torchKeyForMesh(mesh) {
    let found = null;
    this.torches.forEach((t, key) => { if (t.mesh === mesh) found = key; });
    return found;
  }

  // What does a raycast hit refer to? { type: 'torch'|'placed'|'terrain', key, kind, pool? } or null.
  // The cell is recovered from the hit point (half a block back along the normal), so there is no
  // scan over every block.
  _targetFromHit(hit) {
    const torchKey = this._torchKeyForMesh(hit.object);
    if (torchKey) return { type: 'torch', key: torchKey, kind: 'torch' };
    const normal = hit.face.normal.clone().applyMatrix3(new THREE.Matrix3().getNormalMatrix(hit.object.matrixWorld)).normalize();
    const p = hit.point.clone().addScaledVector(normal, -UG_BLOCK * 0.5);
    let key = `${Math.round(p.x / UG_BLOCK)},${Math.round(p.y / UG_BLOCK)},${Math.round(p.z / UG_BLOCK)}`;
    let e = this.lookup.get(key);
    if (!e || e.mesh !== hit.object || e.instanceId !== hit.instanceId) {
      e = null; key = null;
      this.lookup.forEach((v, k) => { if (v.mesh === hit.object && v.instanceId === hit.instanceId) { e = v; key = k; } });
    }
    if (!e) return null;
    if (e.kind === 'placed') return { type: 'placed', key, kind: `placed_${e.pool}`, entry: e };
    return { type: 'terrain', key, kind: e.kind, entry: e };
  }

  _mineTime(kind) { return (UG_MINE_TIME[kind] || 1) * UG_PICKS[this.pick.tier].mult; }

  // What breaking a block gives: { stone, wood, dirt, coal, iron, gold } counts + the block to draw.
  _lootFor(kind) {
    if (UG_ORE_KINDS.includes(kind)) return { loot: { stone: 3, [kind]: 1 }, look: kind };
    switch (kind) {
      case 'stone': return { loot: { stone: 1 }, look: 'stone' };
      case 'wood': return { loot: { wood: 1 }, look: 'wood_side' };
      case 'dirt': return { loot: { dirt: 1 }, look: 'dirt' };
      case 'grass': return { loot: { dirt: 1 }, look: 'dirt' };
      case 'placed_wall': return { loot: { stone: 1 }, look: 'cobble' };
      case 'placed_dirt': return { loot: { dirt: 1 }, look: 'dirt' };
      case 'placed_table': return { loot: { wood: UG_TABLE_WOOD - 1 }, look: 'table' };
      case 'torch': return { loot: { wood: 1 }, look: 'wood_side' };
      case 'leaves': return { loot: {}, look: 'leaves' };
      default: return { loot: {}, look: 'stone' };
    }
  }

  _collect(loot) {
    Object.keys(loot).forEach((k) => {
      if (k === 'stone' || k === 'wood') this.resources[k] = (this.resources[k] || 0) + loot[k];
      else if (UG_INV_KEYS.includes(k)) this.inventory[k] = (this.inventory[k] || 0) + loot[k];
    });
    this.onResourceChange();
    this.onHotbarChange(this.getHotbarState());
  }

  // Removes the targeted block and returns { loot, look, pos } (pos = the block's centre).
  _removeTarget(t) {
    const [gx, gy, gz] = t.key.split(',').map(Number);
    const pos = new THREE.Vector3(gx * UG_BLOCK, gy * UG_BLOCK, gz * UG_BLOCK);
    if (t.type === 'torch') {
      this._removeTorch(t.key);
    } else if (t.type === 'placed') {
      const pool = this.pools[t.entry.pool];
      this._hidePlacedInstance(pool, t.entry.instanceId);
      this.lookup.delete(t.key);
      this.occupied.delete(t.key);
    } else {
      const mesh = t.entry.mesh;
      mesh.setMatrixAt(t.entry.instanceId, new THREE.Matrix4().makeTranslation(0, -9999, 0));
      mesh.instanceMatrix.needsUpdate = true;
      this.lookup.delete(t.key);
      this.occupied.delete(t.key);
    }
    if (t.type !== 'torch') this._wearPick();
    return { ...this._lootFor(t.kind), pos };
  }

  // Instant mine: breaks the targeted block right now and collects the loot straight into the
  // inventory (the original one-press behaviour; kept so existing callers keep working).
  mine() {
    this.swingT = 0.25;
    const hits = this._raycastTargets();
    if (!hits.length) return false;
    const t = this._targetFromHit(hits[0]);
    if (!t) return false;
    this._collect(this._removeTarget(t).loot);
    return true;
  }

  // Timed mining: hold the pickaxe on a block and it cracks apart over UG_MINE_TIME seconds, then
  // drops an item you walk over to pick up. Looking away or releasing resets the progress.
  setMining(on) {
    this.mineHeld = !!on;
    if (!on) this._cancelMining();
  }

  _cancelMining() {
    this.mining = null;
    if (this.crackMesh) this.crackMesh.visible = false;
  }

  _buildCrackOverlay() {
    this.crackTextures = [];
    for (let i = 0; i < UG_CRACK_STAGES; i++) {
      const c = document.createElement('canvas');
      c.width = 16; c.height = 16;
      const g = c.getContext('2d');
      const rnd = ugRng(9100 + i);
      g.fillStyle = 'rgba(10,10,10,0.9)';
      // Each stage adds more crack pixels (deterministic walks from the centre).
      const walks = 2 + Math.floor(i * 0.9);
      for (let w = 0; w < walks; w++) {
        let x = 4 + Math.floor(rnd() * 8); let y = 4 + Math.floor(rnd() * 8);
        const len = 3 + Math.floor(i * 0.8);
        for (let k = 0; k < len; k++) {
          g.fillRect(x, y, 1, 1);
          x += Math.floor(rnd() * 3) - 1; y += Math.floor(rnd() * 3) - 1;
          x = Math.max(0, Math.min(15, x)); y = Math.max(0, Math.min(15, y));
        }
      }
      const tex = new THREE.CanvasTexture(c);
      tex.magFilter = THREE.NearestFilter; tex.minFilter = THREE.NearestFilter; tex.generateMipmaps = false;
      this.crackTextures.push(tex);
    }
    this.crackMesh = new THREE.Mesh(
      new THREE.BoxGeometry(UG_BLOCK * 1.01, UG_BLOCK * 1.01, UG_BLOCK * 1.01),
      new THREE.MeshBasicMaterial({ map: this.crackTextures[0], transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 })
    );
    this.crackMesh.visible = false;
    this.crackMesh.renderOrder = 5;
    this.scene.add(this.crackMesh);
  }

  _updateMining(dt) {
    if (!this.mineHeld) return;
    if (this.swingT <= 0) this.swingT = 0.25; // keep the pickaxe swinging while you hold
    const hits = this._raycastTargets();
    const t = hits.length ? this._targetFromHit(hits[0]) : null;
    if (!t) { this._cancelMining(); return; }
    if (!this.mining || this.mining.key !== t.key) this.mining = { key: t.key, t: 0, need: this._mineTime(t.kind) };
    this.mining.t += dt;
    const progress = Math.min(1, this.mining.t / this.mining.need);
    if (progress >= 1) {
      const r = this._removeTarget(t);
      this._cancelMining();
      if (Object.keys(r.loot).length) this._spawnDrop(r.pos, r.loot, r.look);
      return;
    }
    const [gx, gy, gz] = t.key.split(',').map(Number);
    this.crackMesh.position.set(gx * UG_BLOCK, gy * UG_BLOCK, gz * UG_BLOCK);
    this.crackMesh.material.map = this.crackTextures[Math.min(UG_CRACK_STAGES - 1, Math.floor(progress * UG_CRACK_STAGES))];
    this.crackMesh.visible = true;
  }

  // ---------- day / night and light ----------

  // The sun, sky colour, fog and ambient follow the clock; roofed-over (underground) air fades the
  // sky out so caves stay dark at noon and you need your head light or torches there.
  setTime(t) {
    this.timeOfDay = ((t % 1) + 1) % 1;
    this._applyLighting(0);
  }

  _skyExposure() {
    const p = this.rig.position;
    const gx = Math.round(p.x / UG_BLOCK); const gz = Math.round(p.z / UG_BLOCK);
    const gy0 = Math.floor((p.y + UG_BODY_H + 1) / UG_BLOCK) + 1;
    for (let gy = gy0; gy <= 6; gy++) {
      if (!this._solidAt(gx, gy, gz)) continue;
      const e = this.lookup.get(`${gx},${gy},${gz}`);
      if (!(e && e.kind === 'leaves')) return 0; // tree leaves don't roof you over
    }
    return Math.max(0, 1 - Math.max(0, -1 - p.y) / 12); // the open shaft lets daylight in, fading with depth
  }

  _updateLighting(dt) {
    this.timeOfDay = (this.timeOfDay + dt / UG_DAY_LENGTH) % 1;
    const target = this._skyExposure();
    this.skyLight += (target - this.skyLight) * Math.min(1, dt * 3);
    this._applyLighting(dt);
  }

  _applyLighting(dt) {
    const t = this.timeOfDay;
    const sn = Math.sin(t * Math.PI * 2); // 1 at noon, -1 at midnight
    const sm = (a, b, x) => { const k = Math.max(0, Math.min(1, (x - a) / (b - a))); return k * k * (3 - 2 * k); };
    const day = sm(-0.15, 0.35, sn);
    const warm = 1 - sm(0, 0.45, Math.abs(sn)); // strongest at the horizon
    const lerp = (a, b, k) => a + (b - a) * k;
    const sky = [0, 1, 2].map((i) => {
      const base = lerp(UG_SKY_NIGHT[i], UG_SKY_DAY[i], day);
      return lerp(lerp(base, UG_SKY_DUSK[i], warm * 0.75), UG_CAVE_DARK[i], 1 - this.skyLight);
    });
    this._skyColor.setRGB(sky[0], sky[1], sky[2]);
    this.scene.background.copy(this._skyColor);
    this.scene.fog.color.copy(this._skyColor);
    this.scene.fog.density = lerp(0.03, 0.018, day * this.skyLight);
    const outdoor = lerp(UG_AMBIENT_NIGHT, UG_AMBIENT_DAY, day);
    this.ambient.intensity = lerp(UG_AMBIENT_CAVE, outdoor, this.skyLight);
    this.sun.intensity = day * this.skyLight * 1.1;
    const glow = this.hotbar === 'torch' ? UG_HEAD_LIGHT_TORCH : UG_HEAD_LIGHT;
    this.torch.intensity = glow * (1 - 0.65 * day * this.skyLight);
    this.torch.color.setHex(this.hotbar === 'torch' ? 0xffc27a : 0xffe2b8);
    const phase = sn > 0.35 ? 'day' : sn > -0.15 ? (Math.cos(t * Math.PI * 2) > 0 ? 'dawn' : 'dusk') : 'night';
    if (phase !== this.clockPhase) { this.clockPhase = phase; this.onClockChange(phase); }
    if (this.lavaMesh) { // flowing lava
      this.textures.lava.offset.y = (this.textures.lava.offset.y + 0.036 * (dt || 0)) % 1; // per second, not per frame
      this.textures.lava.offset.x = (this.textures.lava.offset.x + 0.018 * (dt || 0)) % 1;
    }
  }

  // ---------- dropped items ----------

  _dropMaterial(look) {
    this._dropMats = this._dropMats || {};
    if (!this._dropMats[look]) this._dropMats[look] = new THREE.MeshStandardMaterial({ map: this.textures[look], roughness: 1, metalness: 0 });
    return this._dropMats[look];
  }

  _spawnDrop(pos, loot, look) {
    if (!this._dropGeo) this._dropGeo = new THREE.BoxGeometry(0.55, 0.55, 0.55);
    if (this.drops.length >= UG_DROP_CAPACITY) { // pool full: the oldest is handed over immediately
      const old = this.drops.shift();
      this._collect(old.loot);
      this.scene.remove(old.mesh);
    }
    const mesh = new THREE.Mesh(this._dropGeo, this._dropMaterial(look));
    mesh.position.copy(pos);
    this.scene.add(mesh);
    this.drops.push({ mesh, loot, x: pos.x, y: pos.y, z: pos.z, vx: (Math.random() - 0.5) * 3, vy: 5, vz: (Math.random() - 0.5) * 3, age: 0 });
  }

  _collectAllDrops() {
    if (!this.drops.length) return;
    this.drops.forEach((d) => { this._collect(d.loot); this.scene.remove(d.mesh); });
    this.drops = [];
  }

  _updateDrops(dt) {
    if (!this.drops.length) return;
    const p = this.rig.position;
    const cx = p.x; const cy = p.y + UG_BODY_H / 2; const cz = p.z;
    for (let i = this.drops.length - 1; i >= 0; i--) {
      const d = this.drops[i];
      d.age += dt;
      const dx = cx - d.x; const dy = cy - d.y; const dz = cz - d.z;
      const dist = Math.hypot(dx, dy, dz);
      if (d.age > 0.3 && dist < UG_PICKUP_RADIUS) {
        this._collect(d.loot);
        this.scene.remove(d.mesh);
        this.drops.splice(i, 1);
        continue;
      }
      if (d.age > 0.5 && dist < UG_MAGNET_RADIUS) { // drift toward you once close
        const k = (10 * dt) / Math.max(dist, 0.001);
        d.x += dx * k; d.y += dy * k; d.z += dz * k; d.vy = 0;
      } else {
        d.vy -= 25 * dt;
        d.x += d.vx * dt; d.z += d.vz * dt; d.y += d.vy * dt;
        const damp = Math.pow(0.96, dt * 60); d.vx *= damp; d.vz *= damp; // frame-rate independent
        const gx = Math.floor((d.x + 1) / UG_BLOCK); const gz = Math.floor((d.z + 1) / UG_BLOCK);
        const gyb = Math.floor((d.y - 0.28 + 1) / UG_BLOCK);
        if (this._solidAt(gx, gyb, gz)) { d.y = gyb * UG_BLOCK + 1 + 0.28; d.vy = 0; d.vx = 0; d.vz = 0; }
        if (d.y < -UG_DEPTH * UG_BLOCK - 4) { d.y = -UG_DEPTH * UG_BLOCK - 1 + 0.28; d.vy = 0; }
      }
      d.mesh.position.set(d.x, d.y + Math.sin(d.age * 3) * 0.08 + 0.1, d.z);
      d.mesh.rotation.y = d.age * 1.8;
    }
  }

  _removeTorch(key) {
    const t = this.torches.get(key);
    if (!t) return;
    this.scene.remove(t.group);
    t.light.dispose();
    this.torches.delete(key);
    this.occupied.delete(key);
  }

  _addTorch(gx, gy, gz) {
    const key = `${gx},${gy},${gz}`;
    const group = new THREE.Group();
    const post = new THREE.Mesh(
      new THREE.CylinderGeometry(0.06, 0.06, 0.55, 6),
      new THREE.MeshStandardMaterial({ color: 0x7a4a26 })
    );
    const flame = new THREE.Mesh(
      new THREE.SphereGeometry(0.12, 6, 6),
      new THREE.MeshStandardMaterial({ color: 0xffcf5c, emissive: 0xff9c2e, emissiveIntensity: 1.6 })
    );
    flame.position.y = 0.32;
    // The visible flame is tiny next to a full block — give mine/place
    // raycasting a properly block-sized, invisible target instead, or
    // hitting a torch square-on from a normal walking distance would be
    // unreliable and it'd read as "mining does nothing" here.
    // transparent+opacity 0, not material.visible=false — three.js's
    // raycaster skips an object outright when its material.visible is
    // false, which would make this hitbox unhittable, not just invisible.
    const hitbox = new THREE.Mesh(
      new THREE.BoxGeometry(UG_BLOCK * 0.9, UG_BLOCK * 0.9, UG_BLOCK * 0.9),
      new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false })
    );
    hitbox.position.y = 0.2;
    group.add(post, flame, hitbox);
    group.position.set(gx * UG_BLOCK, gy * UG_BLOCK, gz * UG_BLOCK);
    const light = new THREE.PointLight(0xffb366, 2.4, 11, 1.8);
    light.position.y = 0.32;
    group.add(light);
    this.scene.add(group);
    this.torches.set(key, { group, light, mesh: hitbox });
    this.occupied.add(key);
  }

  _hidePlacedInstance(pool, instanceId) {
    pool.mesh.setMatrixAt(instanceId, new THREE.Matrix4().makeTranslation(0, -9999, 0));
    pool.mesh.instanceMatrix.needsUpdate = true;
    pool.mesh.boundingSphere = null;
    pool.free.push(instanceId);
  }

  place() {
    const type = this.hotbar;
    const costKey = type === 'torch' ? 'wood' : type === 'wall' ? 'stone' : type === 'dirt' ? 'dirt' : type === 'table' ? 'wood' : null;
    if (!costKey) return false; // coal / iron / gold / empty slots can't be placed (yet)
    const have = costKey === 'dirt' ? this.inventory.dirt : this.resources[costKey];
    if ((have || 0) < (type === 'table' ? UG_TABLE_WOOD : 1)) return false;
    const hits = this._raycastTargets();
    if (!hits.length) return false;
    const hit = hits[0];
    const normal = hit.face.normal.clone().applyMatrix3(new THREE.Matrix3().getNormalMatrix(hit.object.matrixWorld)).normalize();
    const cell = hit.point.clone().addScaledVector(normal, UG_BLOCK * 0.5);
    const gx = Math.round(cell.x / UG_BLOCK);
    const gy = Math.round(cell.y / UG_BLOCK);
    const gz = Math.round(cell.z / UG_BLOCK);
    const key = `${gx},${gy},${gz}`;
    if (this.occupied.has(key) || this.water.has(key) || this.lava.has(key)) return false;
    if (type !== 'torch' && this._cellOverlapsPlayer(gx, gy, gz)) return false; // don't wall yourself in

    if (type === 'torch') {
      this._addTorch(gx, gy, gz);
      this.resources.wood -= 1;
    } else {
      if (!this._putBlock(type === 'dirt' ? 'dirt' : type === 'table' ? 'table' : 'wall', gx, gy, gz)) return false;
      if (type === 'dirt') this.inventory.dirt -= 1; else if (type === 'table') this.resources.wood -= UG_TABLE_WOOD; else this.resources.stone -= 1;
    }
    this.onResourceChange();
    this.onHotbarChange(this.getHotbarState());
    return true;
  }

  // Puts a block from a pool into a cell with no cost / reach checks (used by place(), and handy for
  // tests and later features like crafting). False if the cell is taken or the pool is full.
  _putBlock(poolName, gx, gy, gz) {
    const key = `${gx},${gy},${gz}`;
    if (this.occupied.has(key)) return false;
    const pool = this.pools[poolName];
    const slot = pool.free.length ? pool.free.pop() : (pool.next < pool.capacity ? pool.next++ : null);
    if (slot === null) return false;
    pool.mesh.setMatrixAt(slot, new THREE.Matrix4().makeTranslation(gx * UG_BLOCK, gy * UG_BLOCK, gz * UG_BLOCK));
    pool.mesh.instanceMatrix.needsUpdate = true;
    pool.mesh.boundingSphere = null; // three caches it from the all-hidden pool; without this a placed block can never be hit by the ray
    this.lookup.set(key, { mesh: pool.mesh, instanceId: slot, kind: 'placed', pool: poolName });
    this.occupied.add(key);
    return true;
  }

  _putStone(gx, gy, gz) { return this._putBlock('wall', gx, gy, gz); }
}
