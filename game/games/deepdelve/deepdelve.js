// Deepdelve first slice: chunked voxel world (MMChunks), face-culled meshes, MMLight vertex light,
// walk/mine/place, hotbar, IndexedDB diffs. No network, no Firebase. Text is set with textContent only.
(function () {
  'use strict';
  const B = MMChunks.B, SIZE = MMChunks.SIZE;
  const params = new URLSearchParams(location.search);
  const TEST = params.get('test') === '1';
  const DB_NAME = 'pixeltown-deepdelve-v1';
  const DEFAULT_SEED = 1;

  // ?seed=N: a plain integer string, clamped to 0..999999999; anything else falls back to the default.
  function parseSeed(raw) {
    if (typeof raw !== 'string' || !/^-?\d{1,12}$/.test(raw.trim())) return DEFAULT_SEED;
    const n = parseInt(raw.trim(), 10);
    if (!isFinite(n)) return DEFAULT_SEED;
    return Math.max(0, Math.min(999999999, n));
  }
  const SEED = parseSeed(params.get('seed'));

  const $ = (id) => document.getElementById(id);
  const say = (t) => { $('msg').textContent = t || ''; };
  let msgTimer = 0;
  function toast(t) { say(t); clearTimeout(msgTimer); msgTimer = setTimeout(() => say(''), 2200); }

  // ---------- storage: IndexedDB with an in-memory fallback ----------
  const memStore = new Map();
  let idb = null;
  function openDB() {
    return new Promise((resolve) => {
      let done = false;
      const fin = (v) => { if (!done) { done = true; resolve(v); } };
      try {
        if (typeof indexedDB === 'undefined' || !indexedDB) return fin(null);
        const req = indexedDB.open(DB_NAME, 1);
        req.onupgradeneeded = () => { try { req.result.createObjectStore('kv'); } catch (e) { /* ignore */ } };
        req.onsuccess = () => fin(req.result);
        req.onerror = () => fin(null);
        req.onblocked = () => fin(null);
        setTimeout(() => fin(null), 3000);
      } catch (e) { fin(null); }
    });
  }
  function kvGet(k) {
    return new Promise((resolve) => {
      if (!idb) return resolve(memStore.has(k) ? memStore.get(k) : null);
      try {
        const r = idb.transaction('kv', 'readonly').objectStore('kv').get(k);
        r.onsuccess = () => resolve(r.result === undefined ? null : r.result);
        r.onerror = () => resolve(memStore.has(k) ? memStore.get(k) : null);
      } catch (e) { resolve(memStore.has(k) ? memStore.get(k) : null); }
    });
  }
  function kvSet(k, v) {
    memStore.set(k, v);
    return new Promise((resolve) => {
      if (!idb) return resolve(false);
      try {
        const tx = idb.transaction('kv', 'readwrite');
        tx.objectStore('kv').put(v, k);
        tx.oncomplete = () => resolve(true);
        tx.onerror = () => resolve(false);
        tx.onabort = () => resolve(false);
      } catch (e) { resolve(false); }
    });
  }

  // ---------- items / blocks ----------
  const ITEM_OF = {}; ITEM_OF[B.GRASS] = 'dirt'; ITEM_OF[B.DIRT] = 'dirt'; ITEM_OF[B.STONE] = 'stone'; ITEM_OF[B.COAL] = 'coal';
  ITEM_OF[B.IRON] = 'iron'; ITEM_OF[B.GOLD] = 'gold'; ITEM_OF[B.CRYSTAL] = 'crystal'; ITEM_OF[B.TORCH] = 'torch';
  const PLACEABLE = [['dirt', B.DIRT], ['stone', B.STONE], ['coal', B.COAL], ['iron', B.IRON], ['gold', B.GOLD], ['crystal', B.CRYSTAL], ['torch', B.TORCH]];
  const BLOCK_OF = {}; PLACEABLE.forEach((p) => { BLOCK_OF[p[0]] = p[1]; });
  const HARDNESS = {}; HARDNESS[B.GRASS] = 0.3; HARDNESS[B.DIRT] = 0.3; HARDNESS[B.STONE] = 0.7; HARDNESS[B.COAL] = 0.9; HARDNESS[B.IRON] = 1.1;
  HARDNESS[B.GOLD] = 1.3; HARDNESS[B.CRYSTAL] = 1.5; HARDNESS[B.TORCH] = 0.1;
  const COLORS = ['#000', '#5fa63f', '#7a5230', '#7d8189', '#7d8189', '#7d8189', '#7d8189', '#7d8189', '#e8541a', '#3a6fd8', '#2a2a30', '#ffb02e'];
  const SWATCH = { dirt: '#7a5230', stone: '#7d8189', coal: '#2b2b30', iron: '#d8a77a', gold: '#f2c744', crystal: '#7fe8ff', torch: '#ffb02e' };

  // ---------- state ----------
  const inv = { wood: 4, coal: 1 };
  let sel = 'stone';
  const player = { x: 64.5, y: 0, z: 64.5, vy: 0, onGround: false, yaw: 0, pitch: 0, hp: 10, peak: 0 };
  const input = { fwd: 0, strafe: 0, jump: false, mine: false };
  const keys = {};
  let world = null, spawn = null;

  const coarse = !!(window.matchMedia && matchMedia('(pointer: coarse)').matches);
  const phone = coarse || window.innerWidth < 700;
  const VIEW = phone ? 3 : 5;

  function hotbarItems() { return PLACEABLE.filter((p) => (inv[p[0]] | 0) > 0).map((p) => ({ item: p[0], count: inv[p[0]] | 0 })); }
  function renderHud() {
    const hb = $('hotbar');
    while (hb.firstChild) hb.removeChild(hb.firstChild);
    const items = hotbarItems();
    if (!items.some((i) => i.item === sel) && items.length) sel = items[0].item;
    if (!items.length) {
      const h = document.createElement('span'); h.className = 'hint'; h.textContent = 'Mine blocks to fill your hotbar'; hb.appendChild(h);
    }
    items.forEach((it, n) => {
      const b = document.createElement('button');
      b.type = 'button'; b.className = 'btn slot' + (it.item === sel ? ' sel' : ''); b.dataset.item = it.item;
      const sw = document.createElement('span'); sw.className = 'sw'; sw.style.background = SWATCH[it.item];
      const t = document.createElement('span'); t.textContent = (n + 1) + ':' + it.count;
      b.appendChild(sw); b.appendChild(t);
      b.setAttribute('aria-label', it.item + ' ' + it.count);
      b.addEventListener('click', () => { sel = it.item; renderHud(); });
      hb.appendChild(b);
    });
    const cb = $('craft-btn');
    cb.disabled = !MMRecipes.canCraft(inv, 'torch');
    cb.textContent = 'Torch x' + (inv.torch | 0);
    cb.title = 'Craft 4 torches: 1 wood + 1 coal (wood ' + (inv.wood | 0) + ')';
    $('hud-hp').textContent = 'HP ' + player.hp + '/10';
    $('hud-seed').textContent = 'Seed ' + SEED;
    const have = ['coal', 'iron', 'gold', 'crystal'].filter((k) => (inv[k] | 0) > 0 || (found[k] | 0) > 0).length;
    $('hud-goal').textContent = 'Goal: find all 4 ores (' + have + '/4), crystal lies deepest';
  }
  const found = {};
  function craftTorch() {
    if (MMRecipes.craft(inv, 'torch')) { toast('Crafted 4 torches'); queueSave(); } else toast('Need 1 wood + 1 coal');
    renderHud();
  }

  // ---------- collision ----------
  const HALF = 0.3, HEIGHT = 1.8, EYE = 1.62, EPS = 1e-5;
  const solidId = (id) => id !== B.AIR && id !== B.TORCH && id !== B.WATER;
  function solidAt(wx, wy, wz) {
    if (wx < 0 || wz < 0 || wx >= SIZE * MMChunks.WORLD.cx || wz >= SIZE * MMChunks.WORLD.cz) return true;
    if (wy >= SIZE * MMChunks.WORLD.cy) return true;
    if (wy < 0) return false;
    return solidId(world.getBlock(wx, wy, wz));
  }
  // Cell wy spans three y in [-wy-1, -wy] (y is depth). Body box = feet y .. y+HEIGHT.
  function collides(x, y, z) {
    const x0 = Math.floor(x - HALF + EPS), x1 = Math.floor(x + HALF - EPS), z0 = Math.floor(z - HALF + EPS), z1 = Math.floor(z + HALF - EPS);
    const y0 = Math.floor(-(y + HEIGHT) + EPS), y1 = Math.ceil(-(y + EPS)) - 1;
    for (let wy = y0; wy <= y1; wy++) for (let wz = z0; wz <= z1; wz++) for (let wx = x0; wx <= x1; wx++) if (solidAt(wx, wy, wz)) return true;
    return false;
  }
  function respawn(msg) {
    player.x = spawn.x; player.y = spawn.y; player.z = spawn.z; player.vy = 0; player.hp = 10; player.peak = player.y;
    if (msg) toast(msg);
    renderHud();
  }
  const SPEED = 4.3, GRAV = 28, JUMP = 8.6;
  function physics(dt) {
    const p = player;
    let f = input.fwd, s = input.strafe;
    const len = Math.hypot(f, s);
    if (len > 1) { f /= len; s /= len; }
    const sn = Math.sin(p.yaw), cs = Math.cos(p.yaw);
    const vx = (-sn * f + cs * s) * SPEED, vz = (-cs * f - sn * s) * SPEED;
    const nx = p.x + vx * dt; if (!collides(nx, p.y, p.z)) p.x = nx;
    const nz = p.z + vz * dt; if (!collides(p.x, p.y, nz)) p.z = nz;
    if (input.jump && p.onGround) { p.vy = JUMP; p.onGround = false; }
    p.vy = Math.max(-40, p.vy - GRAV * dt);
    const ny = p.y + p.vy * dt;
    if (!collides(p.x, ny, p.z)) {
      if (p.vy < 0 && p.onGround) p.onGround = false;
      p.y = ny;
      if (p.y > p.peak || p.vy > 0) p.peak = Math.max(p.peak, p.y);
      if (p.vy < 0) p.onGround = false;
    } else {
      let lo = p.y, hi = ny;
      for (let i = 0; i < 12; i++) { const m = (lo + hi) / 2; if (collides(p.x, m, p.z)) hi = m; else lo = m; }
      p.y = lo;
      if (p.vy < 0) {
        const fall = p.peak - p.y;
        p.onGround = true;
        if (fall > 4.5) {
          p.hp -= Math.floor(fall - 3);
          if (p.hp <= 0) { respawn('You fell too far. Back to the surface.'); return; }
          toast('Ouch! Fall damage');
          renderHud();
        }
        p.peak = p.y;
      }
      p.vy = 0;
    }
    if (p.y < -70) respawn('You fell out of the world.');
  }

  // ---------- ray / edit ----------
  function eyePos() { return [player.x, player.y + EYE, player.z]; }
  function lookDir() {
    const cp = Math.cos(player.pitch);
    return [-Math.sin(player.yaw) * cp, Math.sin(player.pitch), -Math.cos(player.yaw) * cp];
  }
  const cellOf = (x, y, z) => [Math.floor(x), Math.floor(-y), Math.floor(z)];
  function raycast(reach) {
    const e = eyePos(), d = lookDir();
    let prev = null;
    for (let t = 0; t <= reach; t += 0.04) {
      const c = cellOf(e[0] + d[0] * t, e[1] + d[1] * t, e[2] + d[2] * t);
      if (c[1] < 0) { prev = c; continue; }
      const id = world.getBlock(c[0], c[1], c[2]);
      if (id !== B.AIR && id !== B.WATER) return { cell: c, id, prev };
      if (!prev || prev[0] !== c[0] || prev[1] !== c[1] || prev[2] !== c[2]) prev = c;
    }
    return null;
  }
  function afterEdit(dirty) {
    dirty.forEach((k) => stale.add(k));
    lightDirty = true;
    queueSave();
  }
  function mineBlock(wx, wy, wz) {
    const id = world.getBlock(wx, wy, wz);
    if (id === B.AIR || id === B.BEDROCK || id === B.LAVA || id === B.WATER) return false;
    const dirty = world.setBlock(wx, wy, wz, B.AIR);
    if (!dirty.length) return false;
    const item = ITEM_OF[id];
    if (item) { inv[item] = (inv[item] | 0) + 1; found[item] = 1; }
    afterEdit(dirty);
    renderHud();
    return true;
  }
  function placeBlock(wx, wy, wz, item) {
    item = item || sel;
    const id = BLOCK_OF[item];
    if (!id || (inv[item] | 0) <= 0) return false;
    if (wy < 0 || world.getBlock(wx, wy, wz) !== B.AIR) return false;
    if (id !== B.TORCH) {
      // refuse to entomb the player
      const sv = world.getBlock(wx, wy, wz);
      void sv;
      const x0 = player.x - HALF, x1 = player.x + HALF, z0 = player.z - HALF, z1 = player.z + HALF;
      const y0 = player.y, y1 = player.y + HEIGHT;
      if (wx + 1 > x0 && wx < x1 && wz + 1 > z0 && wz < z1 && -wy > y0 && -wy - 1 < y1) return false;
    }
    const dirty = world.setBlock(wx, wy, wz, id);
    if (!dirty.length) return false;
    inv[item] -= 1;
    afterEdit(dirty);
    renderHud();
    return true;
  }

  // ---------- persistence ----------
  let saveTimer = 0, savePending = false;
  function queueSave() { savePending = true; clearTimeout(saveTimer); saveTimer = setTimeout(flush, 400); }
  function flush() {
    clearTimeout(saveTimer);
    if (!world) return Promise.resolve(false);
    savePending = false;
    const doc = { inv: Object.assign({}, inv), pos: [player.x, player.y, player.z], sel, hp: player.hp };
    return Promise.all([kvSet('world:' + SEED, world.serialise()), kvSet('player:' + SEED, JSON.stringify(doc))]).then((r) => !!r[0]);
  }
  window.addEventListener('pagehide', () => { if (savePending) flush(); });
  document.addEventListener('visibilitychange', () => { if (document.hidden && savePending) flush(); });

  // ---------- rendering ----------
  let renderer = null, scene = null, camera = null, atlasTex = null, material = null, outline = null, torchGeo = null, torchMat = null;
  const meshes = new Map(); // key -> { mesh, torches }
  const stale = new Set();
  let lightDirty = true, win = null;
  const WIN = 5; // light window in chunks (xz), full depth
  function makeAtlas() {
    const c = document.createElement('canvas'); c.width = 64; c.height = 64;
    const g = c.getContext('2d');
    const base = ['#000', '#5fa63f', '#7a5230', '#7d8189', '#7d8189', '#7d8189', '#7d8189', '#7d8189', '#e8541a', '#3a6fd8', '#2a2a30', '#ffb02e'];
    const fleck = [null, '#4a8a2e', '#5c3a20', '#6a6e76', '#202024', '#d8a77a', '#f2c744', '#7fe8ff', '#ffd23a', '#6fa0f0', '#18181c', '#fff3a0'];
    for (let id = 0; id < 12; id++) {
      const rng = MMRng.create('tile' + id);
      const ox = (id % 4) * 16, oy = Math.floor(id / 4) * 16;
      g.fillStyle = base[id]; g.fillRect(ox, oy, 16, 16);
      if (id === 0) { g.clearRect(ox, oy, 16, 16); continue; }
      for (let i = 0; i < 40; i++) { g.fillStyle = rng.next() < 0.5 ? 'rgba(0,0,0,0.12)' : 'rgba(255,255,255,0.1)'; g.fillRect(ox + rng.int(0, 15), oy + rng.int(0, 15), 1 + rng.int(0, 1), 1); }
      if (fleck[id] && id >= 4 && id <= 7) {
        g.fillStyle = fleck[id];
        for (let i = 0; i < 9; i++) g.fillRect(ox + rng.int(1, 13), oy + rng.int(1, 13), 2, 2);
      } else if (fleck[id]) {
        g.fillStyle = fleck[id];
        for (let i = 0; i < 14; i++) g.fillRect(ox + rng.int(0, 15), oy + rng.int(0, 15), 1, 1);
      }
    }
    const t = new THREE.CanvasTexture(c);
    t.magFilter = THREE.NearestFilter; t.minFilter = THREE.NearestFilter; t.generateMipmaps = false;
    return t;
  }
  function initRenderer() {
    if (!window.THREE) { toast('3D engine failed to load'); return false; }
    try {
      renderer = new THREE.WebGLRenderer({ canvas: $('gl'), antialias: false, preserveDrawingBuffer: TEST });
    } catch (e) { renderer = null; say('WebGL is not available here'); return false; }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x8fd0ff);
    scene.fog = new THREE.Fog(0x8fd0ff, 8, VIEW * SIZE);
    camera = new THREE.PerspectiveCamera(70, 1, 0.05, VIEW * SIZE + 24);
    camera.rotation.order = 'YXZ';
    atlasTex = makeAtlas();
    material = new THREE.MeshBasicMaterial({ map: atlasTex, vertexColors: true, transparent: false });
    outline = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(1.01, 1.01, 1.01)), new THREE.LineBasicMaterial({ color: 0xffffff }));
    outline.visible = false; scene.add(outline);
    torchGeo = new THREE.BoxGeometry(0.2, 0.6, 0.2);
    torchMat = new THREE.MeshBasicMaterial({ color: 0xffb02e });
    resize();
    return true;
  }
  function resize() {
    if (!renderer) return;
    const c = $('gl'), w = c.clientWidth || 300, h = c.clientHeight || 300;
    renderer.setSize(w, h, false);
    camera.aspect = w / h; camera.updateProjectionMatrix();
  }
  window.addEventListener('resize', resize);

  function fillWindow(pcx, pcz) {
    const ox = Math.max(0, Math.min(MMChunks.WORLD.cx - WIN, pcx - 2)), oz = Math.max(0, Math.min(MMChunks.WORLD.cz - WIN, pcz - 2));
    win = { ox, oz, light: null, w: WIN * SIZE, h: MMChunks.WORLD.cy * SIZE };
    return win;
  }
  function relight() {
    const w = WIN * SIZE, h = MMChunks.WORLD.cy * SIZE, blocks = new Uint8Array(w * h * w);
    for (let cy = 0; cy < MMChunks.WORLD.cy; cy++) for (let cz = 0; cz < WIN; cz++) for (let cx = 0; cx < WIN; cx++) {
      const ch = world.getChunk(win.ox + cx, cy, win.oz + cz);
      for (let ly = 0; ly < SIZE; ly++) for (let lz = 0; lz < SIZE; lz++) {
        blocks.set(ch.data.subarray(lz * SIZE + ly * 256, lz * SIZE + ly * 256 + SIZE), cx * SIZE + (cz * SIZE + lz) * w + (cy * SIZE + ly) * w * w);
      }
    }
    win.light = MMLight.propagate({ w, h, d: w, blocks }).light;
    lightDirty = false;
  }
  function lightAt(wx, wy, wz) {
    if (!win || !win.light) return 7;
    const x = wx - win.ox * SIZE, z = wz - win.oz * SIZE, w = win.w;
    if (x < 0 || z < 0 || x >= w || z >= w || wy < 0 || wy >= win.h) return 7;
    return win.light[x + z * w + wy * w * w];
  }
  const UVS = [[0, 0], [1, 0], [1, 1], [0, 1]];
  function buildChunk(cx, cy, cz) {
    const k = MMChunks.key(cx, cy, cz);
    const old = meshes.get(k);
    if (old) disposeEntry(old);
    meshes.delete(k);
    const ch = world.getChunk(cx, cy, cz);
    const m = MMChunks.mesh(ch, world.neighbours(cx, cy, cz));
    const group = new THREE.Group();
    group.position.set(cx * SIZE, -cy * SIZE, cz * SIZE);
    const n = m.faceCount;
    if (n) {
      const pos = new Float32Array(n * 12), uv = new Float32Array(n * 8), col = new Float32Array(n * 12), idx = new Uint32Array(n * 6);
      for (let f = 0; f < n; f++) {
        const id = m.blocks[f], b = f * 12;
        let ax = 0, ay = 0, az = 0;
        for (let v = 0; v < 4; v++) {
          const x = m.positions[b + v * 3], y = m.positions[b + v * 3 + 1], z = m.positions[b + v * 3 + 2];
          pos[b + v * 3] = x; pos[b + v * 3 + 1] = -y; pos[b + v * 3 + 2] = z;
          ax += x; ay += y; az += z;
          const u = UVS[v], tc = id % 4, tr = Math.floor(id / 4);
          uv[f * 8 + v * 2] = (tc + 0.02 + u[0] * 0.96) / 4;
          uv[f * 8 + v * 2 + 1] = 1 - (tr + 1) / 4 + (0.02 + u[1] * 0.96) / 4;
        }
        const nx = m.normals[b], ny = m.normals[b + 1], nz = m.normals[b + 2];
        const wx = Math.floor(ax / 4 + 0.5 * nx) + cx * SIZE, wy = Math.floor(ay / 4 + 0.5 * ny) + cy * SIZE, wz = Math.floor(az / 4 + 0.5 * nz) + cz * SIZE;
        let br = 0.08 + 0.92 * Math.pow(lightAt(wx, wy, wz) / 15, 1.3);
        br *= ny === -1 ? 1 : ny === 1 ? 0.55 : nx !== 0 ? 0.8 : 0.9;
        if (id === B.LAVA) br = Math.max(br, 0.95); else if (id === B.CRYSTAL) br = Math.max(br, 0.35 + br * 0.65);
        for (let v = 0; v < 4; v++) { col[b + v * 3] = br; col[b + v * 3 + 1] = br; col[b + v * 3 + 2] = br; }
        const i = f * 6, q = f * 4;
        idx[i] = q; idx[i + 1] = q + 2; idx[i + 2] = q + 1; idx[i + 3] = q; idx[i + 4] = q + 3; idx[i + 5] = q + 2;
      }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
      geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
      geo.setIndex(new THREE.BufferAttribute(idx, 1));
      geo.computeBoundingSphere();
      group.add(new THREE.Mesh(geo, material));
    }
    for (let i = 0; i < ch.data.length; i++) {
      if (ch.data[i] !== B.TORCH) continue;
      const t = new THREE.Mesh(torchGeo, torchMat);
      t.position.set((i % 16) + 0.5, -(Math.floor(i / 256) + 1) + 0.3, (Math.floor(i / 16) % 16) + 0.5);
      group.add(t);
    }
    scene.add(group);
    meshes.set(k, { group, faces: n });
    stale.delete(k);
  }
  function disposeEntry(e) {
    scene.remove(e.group);
    e.group.children.forEach((c) => { if (c.geometry && c.geometry !== torchGeo) c.geometry.dispose(); });
  }
  function playerChunk() { return { cx: Math.floor(player.x / SIZE), cy: Math.max(0, Math.min(3, Math.floor(-(player.y + EYE) / SIZE))), cz: Math.floor(player.z / SIZE) }; }
  function manage(budgetMs) {
    if (!scene) return;
    const pc = playerChunk();
    if (!win || pc.cx < win.ox + 1 && win.ox > 0 || pc.cx > win.ox + WIN - 2 && win.ox < MMChunks.WORLD.cx - WIN || pc.cz < win.oz + 1 && win.oz > 0 || pc.cz > win.oz + WIN - 2 && win.oz < MMChunks.WORLD.cz - WIN) {
      const before = win;
      fillWindow(pc.cx, pc.cz);
      if (!before || before.ox !== win.ox || before.oz !== win.oz) { lightDirty = true; for (const k of meshes.keys()) stale.add(k); }
    }
    if (lightDirty) {
      relight();
      // light spreads at most 15 cells: refresh chunks near the edits
      for (const k of Array.from(stale)) {
        const p = k.split(',').map(Number);
        for (let dy = -1; dy <= 1; dy++) for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
          const kk = MMChunks.key(p[0] + dx, p[1] + dy, p[2] + dz);
          if (meshes.has(kk)) stale.add(kk);
        }
      }
    }
    const want = MMChunks.visible(pc, VIEW);
    const wantKeys = new Set(want.map((c) => MMChunks.key(c.cx, c.cy, c.cz)));
    const t0 = performance.now();
    for (const c of want) {
      const k = MMChunks.key(c.cx, c.cy, c.cz);
      if (meshes.has(k) && !stale.has(k)) continue;
      buildChunk(c.cx, c.cy, c.cz);
      if (budgetMs !== Infinity && performance.now() - t0 > budgetMs) break;
    }
    for (const k of MMChunks.unload(Array.from(meshes.keys()), pc, VIEW)) {
      const e = meshes.get(k); if (e) disposeEntry(e);
      meshes.delete(k); stale.delete(k);
    }
    void wantKeys;
  }

  // ---------- main loop ----------
  let mineTarget = null, mineProg = 0, last = 0;
  function updateMining(dt) {
    const hit = input.mine ? raycast(5) : null;
    if (!hit || hit.id === B.BEDROCK || hit.id === B.LAVA) { mineTarget = null; mineProg = 0; return; }
    const key = hit.cell.join(',');
    if (mineTarget !== key) { mineTarget = key; mineProg = 0; }
    mineProg += dt;
    if (mineProg >= (HARDNESS[hit.id] || 0.8)) { mineBlock(hit.cell[0], hit.cell[1], hit.cell[2]); mineTarget = null; mineProg = 0; }
  }
  function updateCamera() {
    if (!camera) return;
    camera.position.set(player.x, player.y + EYE, player.z);
    camera.rotation.set(player.pitch, player.yaw, 0);
    const surf = MMChunks.surfaceY(Math.floor(player.x), Math.floor(player.z), SEED);
    const deep = Math.max(0, Math.min(1, (-(player.y + EYE) - surf - 1) / 4));
    const r = 0x8f / 255 * (1 - deep) + 0.02 * deep, g = 0xd0 / 255 * (1 - deep) + 0.03 * deep, b = 1 * (1 - deep) + 0.05 * deep;
    scene.background.setRGB(r, g, b); scene.fog.color.setRGB(r, g, b);
    const hit = raycast(5);
    if (hit && hit.id !== B.AIR) { outline.visible = true; outline.position.set(hit.cell[0] + 0.5, -(hit.cell[1] + 0.5), hit.cell[2] + 0.5); } else outline.visible = false;
    $('hud-depth').textContent = 'Depth ' + Math.max(0, Math.floor(-player.y));
  }
  function frame(t) {
    requestAnimationFrame(frame);
    const dt = Math.min(0.05, (t - last) / 1000 || 0); last = t;
    if (!world) return;
    if (!TEST) { physics(dt); updateMining(dt); }
    manage(8);
    if (renderer) { updateCamera(); renderer.render(scene, camera); }
  }

  // ---------- controls ----------
  function bindControls() {
    const cv = $('gl');
    const KEYMAP = { w: 'fwd+', arrowup: 'fwd+', s: 'fwd-', arrowdown: 'fwd-', a: 'str-', arrowleft: 'str-', d: 'str+', arrowright: 'str+' };
    function syncKeys() {
      input.fwd = (keys.w || keys.arrowup ? 1 : 0) - (keys.s || keys.arrowdown ? 1 : 0) + joy.y;
      input.strafe = (keys.d || keys.arrowright ? 1 : 0) - (keys.a || keys.arrowleft ? 1 : 0) + joy.x;
      input.fwd = Math.max(-1, Math.min(1, input.fwd)); input.strafe = Math.max(-1, Math.min(1, input.strafe));
    }
    const joy = { x: 0, y: 0 };
    window.addEventListener('keydown', (e) => {
      const k = e.key.toLowerCase();
      if (KEYMAP[k]) { keys[k] = true; syncKeys(); e.preventDefault(); }
      else if (k === ' ') { input.jump = true; e.preventDefault(); }
      else if (k === 'c') craftTorch();
      else if (/^[1-9]$/.test(k)) { const it = hotbarItems()[+k - 1]; if (it) { sel = it.item; renderHud(); } }
    });
    window.addEventListener('keyup', (e) => {
      const k = e.key.toLowerCase();
      if (KEYMAP[k]) { keys[k] = false; syncKeys(); } else if (k === ' ') input.jump = false;
    });
    cv.addEventListener('contextmenu', (e) => e.preventDefault());
    cv.addEventListener('wheel', (e) => {
      const items = hotbarItems(); if (!items.length) return;
      const i = items.findIndex((x) => x.item === sel);
      sel = items[(i + (e.deltaY > 0 ? 1 : items.length - 1)) % items.length].item; renderHud(); e.preventDefault();
    }, { passive: false });
    const locked = () => document.pointerLockElement === cv;
    cv.addEventListener('mousedown', (e) => {
      if (!locked()) { try { const r = cv.requestPointerLock(); if (r && r.catch) r.catch(() => {}); } catch (err) { /* ignore */ } return; }
      if (e.button === 0) input.mine = true;
      else if (e.button === 2) placeAtLook();
    });
    window.addEventListener('mouseup', (e) => { if (e.button === 0) input.mine = false; });
    document.addEventListener('mousemove', (e) => {
      if (!locked()) return;
      player.yaw -= e.movementX * 0.0025; player.pitch = Math.max(-1.55, Math.min(1.55, player.pitch - e.movementY * 0.0025));
    });
    // touch: look by dragging the canvas, joystick, buttons
    if (coarse || 'ontouchstart' in window) $('touch').hidden = false;
    let lookId = null, lx = 0, ly = 0;
    cv.addEventListener('pointerdown', (e) => { if (e.pointerType === 'mouse') return; lookId = e.pointerId; lx = e.clientX; ly = e.clientY; try { cv.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ } });
    cv.addEventListener('pointermove', (e) => {
      if (e.pointerId !== lookId) return;
      player.yaw -= (e.clientX - lx) * 0.006; player.pitch = Math.max(-1.55, Math.min(1.55, player.pitch - (e.clientY - ly) * 0.006)); lx = e.clientX; ly = e.clientY;
    });
    const endLook = (e) => { if (e.pointerId === lookId) lookId = null; };
    cv.addEventListener('pointerup', endLook); cv.addEventListener('pointercancel', endLook);
    const jz = $('joy'), knob = $('knob');
    let joyId = null;
    function joyMove(e) {
      const r = jz.getBoundingClientRect(), cx = r.left + r.width / 2, cy = r.top + r.height / 2;
      let dx = (e.clientX - cx) / (r.width / 2), dy = (e.clientY - cy) / (r.height / 2);
      const l = Math.hypot(dx, dy); if (l > 1) { dx /= l; dy /= l; }
      joy.x = Math.abs(dx) < 0.15 ? 0 : dx; joy.y = Math.abs(dy) < 0.15 ? 0 : -dy;
      knob.style.transform = 'translate(' + dx * 40 + 'px,' + dy * 40 + 'px)'; syncKeys();
    }
    jz.addEventListener('pointerdown', (e) => { joyId = e.pointerId; try { jz.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ } joyMove(e); });
    jz.addEventListener('pointermove', (e) => { if (e.pointerId === joyId) joyMove(e); });
    const joyEnd = (e) => { if (e.pointerId !== joyId) return; joyId = null; joy.x = 0; joy.y = 0; knob.style.transform = ''; syncKeys(); };
    jz.addEventListener('pointerup', joyEnd); jz.addEventListener('pointercancel', joyEnd);
    const hold = (id, on, off) => {
      const el = $(id);
      el.addEventListener('pointerdown', (e) => { e.preventDefault(); on(); });
      ['pointerup', 'pointercancel', 'pointerleave'].forEach((n) => el.addEventListener(n, off));
    };
    hold('t-jump', () => { input.jump = true; }, () => { input.jump = false; });
    hold('t-mine', () => { input.mine = true; }, () => { input.mine = false; });
    hold('t-place', () => { placeAtLook(); }, () => {});
    $('craft-btn').addEventListener('click', craftTorch);
  }
  function placeAtLook() {
    const hit = raycast(5);
    if (!hit || !hit.prev) return false;
    return placeBlock(hit.prev[0], hit.prev[1], hit.prev[2], sel);
  }

  // ---------- test hooks ----------
  function hashData(w, cs) {
    let h = 2166136261 >>> 0;
    for (const c of cs) { const d = w.getChunk(c[0], c[1], c[2]).data; for (let i = 0; i < d.length; i++) { h ^= d[i]; h = Math.imul(h, 16777619) >>> 0; } }
    return h >>> 0;
  }
  function exposeTest() {
    window.__dd = {
      get world() { return world; }, player, input, inv, seed: SEED, view: VIEW, spawn, MMChunks,
      setPos(x, y, z) { player.x = x; player.y = y; player.z = z; player.vy = 0; player.peak = y; player.onGround = false; },
      step(dt, n) { for (let i = 0; i < (n || 1); i++) physics(dt || 1 / 60); },
      walk(fwd, strafe, n, jump) { input.fwd = fwd; input.strafe = strafe; input.jump = !!jump; this.step(1 / 60, n); input.fwd = 0; input.strafe = 0; input.jump = false; },
      getBlock: (x, y, z) => world.getBlock(x, y, z),
      mineAt: mineBlock, placeAt: placeBlock, raycast,
      hotbar: hotbarItems, select(i) { sel = i; renderHud(); },
      terrainHash() { const cs = []; for (let cy = 0; cy < 4; cy++) for (let cz = 3; cz < 5; cz++) for (let cx = 3; cx < 5; cx++) cs.push([cx, cy, cz]); return hashData(world, cs); },
      faceStats(cx, cy, cz) {
        const ch = world.getChunk(cx, cy, cz), m = MMChunks.mesh(ch, world.neighbours(cx, cy, cz));
        let solid = 0; for (let i = 0; i < ch.data.length; i++) if (ch.data[i] !== B.AIR && ch.data[i] !== B.TORCH) solid++;
        return { faces: m.faceCount, solid, naive: solid * 6 };
      },
      settle() { manage(Infinity); }, flush, loadedMeshes: () => meshes.size, meshFaces() { let n = 0; meshes.forEach((e) => { n += e.faces; }); return n; },
      craft: craftTorch, surfaceY: (x, z) => MMChunks.surfaceY(x, z, SEED), ready: true,
    };
  }

  // ---------- boot ----------
  async function boot() {
    $('hud-seed').textContent = 'Seed ' + SEED;
    idb = await openDB();
    const savedWorld = await kvGet('world:' + SEED);
    const savedPlayer = await kvGet('player:' + SEED);
    world = MMChunks.createWorld(SEED, typeof savedWorld === 'string' ? savedWorld : undefined);
    const sx = 64, sz = 64, s = MMChunks.surfaceY(sx, sz, SEED);
    spawn = { x: sx + 0.5, y: -s + 0.5, z: sz + 0.5 };
    player.x = spawn.x; player.y = spawn.y; player.z = spawn.z; player.peak = player.y;
    if (typeof savedPlayer === 'string') {
      try {
        const d = JSON.parse(savedPlayer);
        if (d && d.inv && typeof d.inv === 'object') for (const k of Object.keys(d.inv)) if (typeof d.inv[k] === 'number' && isFinite(d.inv[k])) inv[k] = Math.max(0, Math.min(9999, d.inv[k] | 0));
        if (Array.isArray(d.pos) && d.pos.every((v) => typeof v === 'number' && isFinite(v))) { player.x = d.pos[0]; player.y = d.pos[1]; player.z = d.pos[2]; player.peak = player.y; }
        if (typeof d.sel === 'string') sel = d.sel;
        if (typeof d.hp === 'number' && d.hp > 0) player.hp = Math.min(10, d.hp | 0);
      } catch (e) { /* ignore corrupt save */ }
    }
    initRenderer();
    bindControls();
    renderHud();
    if (TEST) exposeTest();
    say(TEST ? '' : 'Click the view to look around. Hold left to mine, right to place. WASD + Space.');
    if (!TEST) setTimeout(() => say(''), 5000);
    requestAnimationFrame(frame);
  }
  boot();
}());
