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
const UG_SIZE = 8; // cave spans x,z in [-UG_SIZE, UG_SIZE]
const UG_DEPTH = 8; // y levels 0 (surface) down to -UG_DEPTH
const UG_REACH = 7.5; // units — how far mine/place can reach
const UG_PLACED_CAPACITY = 150;
const UG_AMBIENT = 1.6;
const UG_HEAD_LIGHT = 6;
const UG_EYE_HEIGHT = 0.8; // eye is this far above rig.position (matches the mine/place ray origin)
const UG_THIRD_PERSON_DIST = 6;
const UG_ORE_KINDS = ['coal', 'iron', 'gold'];
const UG_TEXTURE_NAMES = ['grass_top', 'grass_side', 'dirt', 'stone', 'coal', 'iron', 'gold', 'wood_side', 'wood_top', 'cobble'];

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
    tex.needsUpdate = true;
    out[name] = tex;
  });
  return out;
}

class UndergroundWorld {
  constructor({ canvasWrap, resources, onResourceChange, onExit }) {
    this.canvasWrap = canvasWrap;
    this.resources = resources; // shared reference to main.js's resources object
    this.onResourceChange = onResourceChange; // () => void — call after any resource change
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
    this.placedFree = [];
    this.placedNext = 0;
    this.torches = new Map(); // "gx,gy,gz" -> { group, light, mesh }
    this.hotbar = 'wall'; // 'wall' (costs stone) | 'torch' (costs wood)
    this.viewMode = 'first'; // 'first' (eye height) | 'third' (behind the player)

    this._initThree();
    this._buildTerrain();
    this._buildPlacedPool();
    this._bindInput();
  }

  // Switches what Place puts down — a stone wall or a lit torch — same
  // idea as a Minecraft hotbar, just two slots instead of nine.
  setHotbar(type) {
    this.hotbar = type;
    this._refreshHeldItem();
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

    this.camera = new THREE.PerspectiveCamera(70, 1, 0.1, 200);

    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    // Phones are fill-rate bound: cap the pixel ratio lower there (the chunky pixel-art look doesn't need more).
    const coarse = window.matchMedia && window.matchMedia('(pointer: coarse)').matches;
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, coarse ? 1.5 : 2));
    this.canvasWrap.appendChild(this.renderer.domElement);

    // Tuned for the (brighter) pixel-art textures: dim ambient + a head-torch that fades with distance.
    this.scene.add(new THREE.AmbientLight(0x8a96b0, UG_AMBIENT));
    this.torch = new THREE.PointLight(0xffe2b8, UG_HEAD_LIGHT, 30, 1.6);
    this.scene.add(this.torch);

    const playerGeo = new THREE.CapsuleGeometry(0.6, 1.1, 4, 8);
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
  }

  _refreshHeldItem() {
    if (!this.fpItem) return;
    const cube = this.fpItem.getObjectByName('fp-cube');
    const torch = this.fpItem.getObjectByName('fp-torch');
    if (cube) cube.visible = this.hotbar !== 'torch';
    if (torch) torch.visible = this.hotbar === 'torch';
  }

  // Carved with a short random walk per depth level so it reads as tunnels,
  // not a flat grid — but always keeps a clear vertical shaft at the origin
  // so the entry hole is visible from the surface and you can always find
  // your way back up.
  _buildTerrain() {
    const solid = new Map(); // key -> 'grass' | 'dirt' | 'stone' | 'coal' | 'iron' | 'gold' | 'wood'
    const inBounds = (x, z) => Math.abs(x) <= UG_SIZE && Math.abs(z) <= UG_SIZE;

    for (let y = -1; y >= -UG_DEPTH; y--) {
      for (let x = -UG_SIZE; x <= UG_SIZE; x++) {
        for (let z = -UG_SIZE; z <= UG_SIZE; z++) {
          let type = y === -1 ? 'grass' : y <= -5 ? 'stone' : 'dirt';
          if (type === 'stone') {
            const roll = Math.random();
            if (roll < 0.01 && y <= -6) type = 'gold';
            else if (roll < 0.035 && y <= -5) type = 'iron';
            else if (roll < 0.075) type = 'coal';
          }
          // Old log veins running through the dirt layer — a wood source
          // underground, so a mining trip can restock the 2D shop loop too.
          if ((type === 'dirt' || type === 'grass') && Math.random() < 0.05) type = 'wood';
          solid.set(`${x},${y},${z}`, type);
        }
      }
      // Carve the central shaft clear at every level.
      for (let x = -1; x <= 1; x++) for (let z = -1; z <= 1; z++) solid.delete(`${x},${y},${z}`);
      // A couple of wandering tunnels off the shaft, per level.
      for (let t = 0; t < 2; t++) {
        let cx = 0; let cz = 0;
        for (let step = 0; step < 16; step++) {
          cx += Math.round(Math.random() * 2 - 1);
          cz += Math.round(Math.random() * 2 - 1);
          if (!inBounds(cx, cz)) break;
          solid.delete(`${cx},${y},${cz}`);
          solid.delete(`${cx},${y - 1},${cz}`);
        }
      }
    }

    const kinds = ['grass', 'dirt', 'stone', 'coal', 'iron', 'gold', 'wood'];
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
  }

  _buildPlacedPool() {
    const geo = new THREE.BoxGeometry(UG_BLOCK * 0.98, UG_BLOCK * 0.98, UG_BLOCK * 0.98);
    const mat = new THREE.MeshStandardMaterial({ map: this.textures.cobble, roughness: 1, metalness: 0 });
    this.placedMesh = new THREE.InstancedMesh(geo, mat, UG_PLACED_CAPACITY);
    this.placedMesh.count = UG_PLACED_CAPACITY;
    const hidden = new THREE.Matrix4().makeTranslation(0, -9999, 0);
    for (let i = 0; i < UG_PLACED_CAPACITY; i++) this.placedMesh.setMatrixAt(i, hidden);
    this.scene.add(this.placedMesh);
  }

  // ---------- input ----------

  _bindInput() {
    this.onKeyDown = (e) => { this.keys[e.key.toLowerCase()] = true; };
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

    this.onResize = () => { if (this.active) this._resize(); };
    window.addEventListener('resize', this.onResize);
  }

  setMoveInput(fwd, strafe, vert) {
    this.moveInput.fwd = fwd;
    this.moveInput.strafe = strafe;
    if (vert !== undefined) this.moveInput.vert = vert;
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
    this.rig.position.set(0, -0.2, 0);
    this.yaw = Math.PI;
    this.pitch = -0.5;
    this._applyViewVisibility();
    this._resize();
    this._lastT = performance.now();
    this._raf = requestAnimationFrame(this._loop);
  }

  stop() {
    this.active = false;
    if (this._raf) cancelAnimationFrame(this._raf);
  }

  destroy() {
    this.stop();
    window.removeEventListener('keydown', this.onKeyDown);
    window.removeEventListener('keyup', this.onKeyUp);
    window.removeEventListener('pointerup', this.onPointerUp);
    window.removeEventListener('resize', this.onResize);
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

  // Minecraft-style flight: WASD/dpad moves on the flat horizontal plane
  // relative to the direction you're facing (yaw only, pitch ignored) —
  // looking up or down to aim never changes where forward takes you.
  // Up/down are their own dedicated controls, same as Minecraft creative
  // mode, not tied to where the camera happens to be pointed.
  _update(delta) {
    let fwd = this.moveInput.fwd;
    let strafe = this.moveInput.strafe;
    let vert = this.moveInput.vert || 0;
    if (this.keys.w || this.keys.arrowup) fwd += 1;
    if (this.keys.s || this.keys.arrowdown) fwd -= 1;
    if (this.keys.a || this.keys.arrowleft) strafe -= 1;
    if (this.keys.d || this.keys.arrowright) strafe += 1;
    if (this.keys[' '] || this.keys.spacebar) vert += 1;
    if (this.keys.shift || this.keys.c) vert -= 1;

    const speed = 6.5;
    const flatFwd = new THREE.Vector3(Math.sin(this.yaw), 0, Math.cos(this.yaw)).multiplyScalar(-1);
    const right = new THREE.Vector3(flatFwd.z, 0, -flatFwd.x);
    const dir = new THREE.Vector3()
      .addScaledVector(flatFwd, fwd)
      .addScaledVector(right, strafe);
    dir.y = 0;
    if (dir.lengthSq() > 0 || vert) {
      if (dir.lengthSq() > 0) dir.normalize();
      dir.y = vert;
      dir.multiplyScalar(speed * delta);
      const next = this.rig.position.clone().add(dir);
      const bound = (UG_SIZE + 1) * UG_BLOCK;
      next.x = Math.max(-bound, Math.min(bound, next.x));
      next.z = Math.max(-bound, Math.min(bound, next.z));
      next.y = Math.max(-(UG_DEPTH + 1) * UG_BLOCK, Math.min(1.5 * UG_BLOCK, next.y));
      this.rig.position.copy(next);
    }

    this.playerMesh.position.copy(this.rig.position);
    this.playerMesh.rotation.y = this.yaw;
    this.tool.position.copy(this.rig.position);
    this.tool.rotation.y = this.yaw;
    this.swingT = Math.max(0, this.swingT - delta);
    this.toolGrip.rotation.x = -0.35 - Math.sin((this.swingT / 0.25) * Math.PI) * 1.2;
    if (this.viewMode === 'first') {
      // Eye height; same origin the mine/place ray uses, so the crosshair is exact.
      this.camera.position.set(this.rig.position.x, this.rig.position.y + UG_EYE_HEIGHT, this.rig.position.z);
      this.camera.rotation.set(this.pitch, this.yaw, 0, 'YXZ');
      // Pickaxe swing (the whole arm kicks forward and back).
      const k = Math.sin((this.swingT / 0.25) * Math.PI);
      this.fpPick.rotation.set(-0.5 - k * 1.1, -0.35, 0.25);
      this.fpPick.position.set(0.5, -0.42 + k * 0.05, -0.85 - k * 0.15);
    } else {
      const look = this._forwardVector();
      this.camera.position.copy(this.rig.position).addScaledVector(look, -UG_THIRD_PERSON_DIST);
      this.camera.position.y += 1.5;
      this.camera.lookAt(this.rig.position.x, this.rig.position.y + 0.8, this.rig.position.z);
    }
    this.torch.position.copy(this.camera.position);

    this.nearExit = Math.abs(this.rig.position.x) < UG_BLOCK * 1.5
      && Math.abs(this.rig.position.z) < UG_BLOCK * 1.5
      && this.rig.position.y > -UG_BLOCK * 1.5;
  }

  // ---------- mine / place ----------

  // Cast from the player's own position (not the camera, which sits well
  // behind/above in third-person and would give an unreliable reach,
  // especially when looking steeply up/down) along the look direction.
  _raycastTargets() {
    const objs = [this.placedMesh];
    Object.values(this.terrainMeshes || {}).forEach((m) => objs.push(m));
    this.torches.forEach((t) => objs.push(t.mesh));
    const origin = this.rig.position.clone();
    origin.y += 0.8;
    this.raycaster.set(origin, this._forwardVector());
    return this.raycaster.intersectObjects(objs);
  }

  _torchKeyForMesh(mesh) {
    let found = null;
    this.torches.forEach((t, key) => { if (t.mesh === mesh) found = key; });
    return found;
  }

  mine() {
    this.swingT = 0.25;
    const hits = this._raycastTargets();
    if (!hits.length) return false;
    const hit = hits[0];

    const torchKey = this._torchKeyForMesh(hit.object);
    if (torchKey) {
      this._removeTorch(torchKey);
      this.resources.wood = (this.resources.wood || 0) + 1;
      this.onResourceChange();
      return true;
    }

    if (hit.object === this.placedMesh) {
      // Find which placed cell this instance belongs to.
      let foundKey = null;
      this.lookup.forEach((v, key) => {
        if (v.mesh === this.placedMesh && v.instanceId === hit.instanceId) foundKey = key;
      });
      if (!foundKey) return false;
      this._hidePlacedInstance(hit.instanceId);
      this.lookup.delete(foundKey);
      this.occupied.delete(foundKey);
      this.resources.stone = (this.resources.stone || 0) + 1;
      this.onResourceChange();
      return true;
    }

    // Terrain block: find its grid key by matching mesh+instanceId.
    let foundKey = null;
    let kind = null;
    this.lookup.forEach((v, key) => {
      if (v.mesh === hit.object && v.instanceId === hit.instanceId) { foundKey = key; kind = v.kind; }
    });
    if (!foundKey) return false;
    const hideMatrix = new THREE.Matrix4().makeTranslation(0, -9999, 0);
    hit.object.setMatrixAt(hit.instanceId, hideMatrix);
    hit.object.instanceMatrix.needsUpdate = true;
    this.lookup.delete(foundKey);
    this.occupied.delete(foundKey);
    if (UG_ORE_KINDS.includes(kind)) { this.resources.stone = (this.resources.stone || 0) + 3; } else if (kind === 'stone') { this.resources.stone = (this.resources.stone || 0) + 1; } else if (kind === 'wood') { this.resources.wood = (this.resources.wood || 0) + 1; }
    this.onResourceChange();
    return true;
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

  _hidePlacedInstance(instanceId) {
    const hidden = new THREE.Matrix4().makeTranslation(0, -9999, 0);
    this.placedMesh.setMatrixAt(instanceId, hidden);
    this.placedMesh.instanceMatrix.needsUpdate = true;
    this.placedFree.push(instanceId);
  }

  place() {
    const cost = this.hotbar === 'torch' ? 'wood' : 'stone';
    if ((this.resources[cost] || 0) < 1) return false;
    const hits = this._raycastTargets();
    if (!hits.length) return false;
    const hit = hits[0];
    const normal = hit.face.normal.clone().applyMatrix3(new THREE.Matrix3().getNormalMatrix(hit.object.matrixWorld)).normalize();
    const cell = hit.point.clone().addScaledVector(normal, UG_BLOCK * 0.5);
    const gx = Math.round(cell.x / UG_BLOCK);
    const gy = Math.round(cell.y / UG_BLOCK);
    const gz = Math.round(cell.z / UG_BLOCK);
    const key = `${gx},${gy},${gz}`;
    if (this.occupied.has(key)) return false;

    if (this.hotbar === 'torch') {
      this._addTorch(gx, gy, gz);
      this.resources.wood -= 1;
      this.onResourceChange();
      return true;
    }

    const slot = this.placedFree.length ? this.placedFree.pop() : (this.placedNext < UG_PLACED_CAPACITY ? this.placedNext++ : null);
    if (slot === null) return false;

    const m = new THREE.Matrix4().makeTranslation(gx * UG_BLOCK, gy * UG_BLOCK, gz * UG_BLOCK);
    this.placedMesh.setMatrixAt(slot, m);
    this.placedMesh.instanceMatrix.needsUpdate = true;
    this.lookup.set(key, { mesh: this.placedMesh, instanceId: slot, kind: 'placed' });
    this.occupied.add(key);
    this.resources.stone -= 1;
    this.onResourceChange();
    return true;
  }
}
