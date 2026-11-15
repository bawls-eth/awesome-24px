// A small Three.js voxel cave, entered by digging/jumping into a hole in the
// 2D town. Fully local — nothing here syncs over the network (same as the
// 2D game's fishing/chopping), so what you mine and build underground is
// only ever seen by you.
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
    this.moveInput = { fwd: 0, strafe: 0 };
    this.dragging = false;
    this.lastDrag = null;
    this.occupied = new Set(); // "gx,gy,gz" currently solid (terrain or placed)
    this.lookup = new Map(); // "gx,gy,gz" -> { mesh, instanceId, kind }
    this.placedFree = [];
    this.placedNext = 0;

    this._initThree();
    this._buildTerrain();
    this._buildPlacedPool();
    this._bindInput();
  }

  // ---------- setup ----------

  _initThree() {
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x0a0e14);
    this.scene.fog = new THREE.FogExp2(0x0a0e14, 0.03);

    this.camera = new THREE.PerspectiveCamera(70, 1, 0.1, 200);

    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.canvasWrap.appendChild(this.renderer.domElement);

    this.scene.add(new THREE.AmbientLight(0x8a96b0, 2.2));
    this.torch = new THREE.PointLight(0xffc98a, 60, 30, 1.6);
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
  }

  // Carved with a short random walk per depth level so it reads as tunnels,
  // not a flat grid — but always keeps a clear vertical shaft at the origin
  // so the entry hole is visible from the surface and you can always find
  // your way back up.
  _buildTerrain() {
    const solid = new Map(); // key -> 'dirt' | 'stone' | 'ore'
    const inBounds = (x, z) => Math.abs(x) <= UG_SIZE && Math.abs(z) <= UG_SIZE;

    for (let y = -1; y >= -UG_DEPTH; y--) {
      for (let x = -UG_SIZE; x <= UG_SIZE; x++) {
        for (let z = -UG_SIZE; z <= UG_SIZE; z++) {
          let type = y <= -5 ? 'stone' : 'dirt';
          if (type === 'stone' && Math.random() < 0.05) type = 'ore';
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

    const counts = { dirt: 0, stone: 0, ore: 0 };
    solid.forEach((type) => { counts[type]++; });
    const meshes = {};
    ['dirt', 'stone', 'ore'].forEach((type) => {
      if (!counts[type]) return;
      const color = type === 'dirt' ? 0x6b4a32 : type === 'stone' ? 0x6e7480 : 0xdcb94e;
      const geo = new THREE.BoxGeometry(UG_BLOCK * 0.98, UG_BLOCK * 0.98, UG_BLOCK * 0.98);
      const mat = new THREE.MeshStandardMaterial({ color, roughness: 0.9 });
      const mesh = new THREE.InstancedMesh(geo, mat, counts[type]);
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
    const mat = new THREE.MeshStandardMaterial({ color: 0x8c96a6, roughness: 0.9 });
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

  setMoveInput(fwd, strafe) {
    this.moveInput.fwd = fwd;
    this.moveInput.strafe = strafe;
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
    };
    img.src = url;
  }

  // ---------- lifecycle ----------

  start() {
    this.active = true;
    this.rig.position.set(0, -0.2, 0);
    this.yaw = Math.PI;
    this.pitch = -0.5;
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

  _update(delta) {
    let fwd = this.moveInput.fwd;
    let strafe = this.moveInput.strafe;
    if (this.keys.w || this.keys.arrowup) fwd += 1;
    if (this.keys.s || this.keys.arrowdown) fwd -= 1;
    if (this.keys.a || this.keys.arrowleft) strafe -= 1;
    if (this.keys.d || this.keys.arrowright) strafe += 1;

    const speed = 6.5;
    if (fwd || strafe) {
      const look = this._forwardVector();
      const flatFwd = new THREE.Vector3(look.x, 0, look.z).normalize();
      const right = new THREE.Vector3(flatFwd.z, 0, -flatFwd.x);
      const dir = new THREE.Vector3()
        .addScaledVector(look.clone().normalize(), Math.max(fwd, 0))
        .addScaledVector(flatFwd, Math.min(fwd, 0))
        .addScaledVector(right, strafe);
      if (dir.lengthSq() > 0) {
        dir.normalize().multiplyScalar(speed * delta);
        const next = this.rig.position.clone().add(dir);
        const bound = (UG_SIZE + 1) * UG_BLOCK;
        next.x = Math.max(-bound, Math.min(bound, next.x));
        next.z = Math.max(-bound, Math.min(bound, next.z));
        next.y = Math.max(-(UG_DEPTH + 1) * UG_BLOCK, Math.min(1.5 * UG_BLOCK, next.y));
        this.rig.position.copy(next);
      }
    }

    this.playerMesh.position.copy(this.rig.position);
    this.playerMesh.rotation.y = this.yaw;
    this.tool.position.copy(this.rig.position);
    this.tool.rotation.y = this.yaw;
    this.swingT = Math.max(0, this.swingT - delta);
    this.toolGrip.rotation.x = -0.35 - Math.sin((this.swingT / 0.25) * Math.PI) * 1.2;
    const camDist = 6;
    const look = this._forwardVector();
    this.camera.position.copy(this.rig.position).addScaledVector(look, -camDist);
    this.camera.position.y += 1.5;
    this.camera.lookAt(this.rig.position.x, this.rig.position.y + 0.8, this.rig.position.z);
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
    const origin = this.rig.position.clone();
    origin.y += 0.8;
    this.raycaster.set(origin, this._forwardVector());
    return this.raycaster.intersectObjects(objs);
  }

  mine() {
    this.swingT = 0.25;
    const hits = this._raycastTargets();
    if (!hits.length) return false;
    const hit = hits[0];
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
    if (kind === 'ore') { this.resources.stone = (this.resources.stone || 0) + 3; } else if (kind === 'stone') { this.resources.stone = (this.resources.stone || 0) + 1; }
    this.onResourceChange();
    return true;
  }

  _hidePlacedInstance(instanceId) {
    const hidden = new THREE.Matrix4().makeTranslation(0, -9999, 0);
    this.placedMesh.setMatrixAt(instanceId, hidden);
    this.placedMesh.instanceMatrix.needsUpdate = true;
    this.placedFree.push(instanceId);
  }

  place() {
    if ((this.resources.stone || 0) < 1) return false;
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
