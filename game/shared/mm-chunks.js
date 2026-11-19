// MMChunks: pure 16x16x16 chunk data for Deepdelve (no three.js, no DOM, no Firebase).
// World axes: x,z horizontal (0..127), y is DEPTH from the top (0 = sky, 63 = bedrock), 8x4x8 chunks.
// Index inside a chunk: x + z*16 + y*256. Same (seed,cx,cy,cz) always gives the same bytes.
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.MMChunks = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  const SIZE = 16, VOL = 4096;
  const WORLD = { cx: 8, cy: 4, cz: 8 };
  const B = { AIR: 0, GRASS: 1, DIRT: 2, STONE: 3, COAL: 4, IRON: 5, GOLD: 6, CRYSTAL: 7, LAVA: 8, WATER: 9, BEDROCK: 10, TORCH: 11, FURNACE: 12 };
  // Ore depth bands (inclusive world y, y grows downward): coal/iron in stone, gold deep, crystal at the core.
  const ORE_BANDS = {
    [B.COAL]: { min: 4, max: 40, chance: 0.03 },
    [B.IRON]: { min: 8, max: 47, chance: 0.018 },
    [B.GOLD]: { min: 24, max: 47, chance: 0.012 },
    [B.CRYSTAL]: { min: 48, max: 62, chance: 0.02 },
  };
  const LAVA_BAND = { min: 30, max: 46, chance: 0.012 };
  // The Lava Lake: a fixed cavern (same in every seed). Air y 38..41 over a single lava layer at y 42.
  const LAKE = { x0: 76, x1: 92, z0: 60, z1: 68, airY0: 38, airY1: 41, lavaY: 42 };
  const inLake = (wx, wz) => wx >= LAKE.x0 && wx <= LAKE.x1 && wz >= LAKE.z0 && wz <= LAKE.z1;
  const MAX_DIFFS = 20000;

  function hash(a, b, c, seed) {
    let h = (Math.imul(a | 0, 374761393) ^ Math.imul(b | 0, 668265263) ^ Math.imul(c | 0, 2147483647) ^ Math.imul(seed | 0, 1274126177)) >>> 0;
    h = Math.imul(h ^ (h >>> 13), 1274126177) >>> 0;
    h = Math.imul(h ^ (h >>> 16), 2246822519) >>> 0;
    return (h >>> 0) / 4294967296;
  }
  function noise2(x, z, seed) {
    const x0 = Math.floor(x), z0 = Math.floor(z), fx = x - x0, fz = z - z0;
    const sx = fx * fx * (3 - 2 * fx), sz = fz * fz * (3 - 2 * fz);
    const a = hash(x0, 0, z0, seed), b = hash(x0 + 1, 0, z0, seed), c = hash(x0, 0, z0 + 1, seed), d = hash(x0 + 1, 0, z0 + 1, seed);
    const t = a + (b - a) * sx;
    return t + ((c + (d - c) * sx) - t) * sz;
  }
  const surfaceY = (wx, wz, seed) => 3 + Math.floor((noise2(wx / 9, wz / 9, seed) * 0.7 + noise2(wx / 4, wz / 4, seed + 17) * 0.3) * 3);
  const inWorld = (cx, cy, cz) => cx >= 0 && cy >= 0 && cz >= 0 && cx < WORLD.cx && cy < WORLD.cy && cz < WORLD.cz;
  const key = (cx, cy, cz) => cx + ',' + cy + ',' + cz;

  function blockAt(wx, wy, wz, seed) {
    if (wy >= WORLD.cy * SIZE - 1) return B.BEDROCK;
    const s = surfaceY(wx, wz, seed);
    if (wy < s) return B.AIR;
    if (wy === s) return B.GRASS;
    if (wy <= s + 3) return B.DIRT;
    if (inLake(wx, wz)) { if (wy >= LAKE.airY0 && wy <= LAKE.airY1) return B.AIR; if (wy === LAKE.lavaY) return B.LAVA; }
    if (wy >= LAVA_BAND.min && wy <= LAVA_BAND.max && hash(wx, wy, wz, seed + 91) < LAVA_BAND.chance) return B.LAVA;
    if (wy > s + 6 && hash(wx >> 2, wy >> 2, wz >> 2, seed + 5) < 0.04 && hash(wx, wy, wz, seed + 6) < 0.8) return B.AIR; // cave pockets
    const r = hash(wx, wy, wz, seed + 33);
    let acc = 0;
    for (const id of [B.CRYSTAL, B.GOLD, B.IRON, B.COAL]) {
      const o = ORE_BANDS[id];
      if (wy >= o.min && wy <= o.max) { acc += o.chance; if (r < acc) return id; }
    }
    return B.STONE;
  }

  function generate(seed, cx, cy, cz) {
    const data = new Uint8Array(VOL);
    if (inWorld(cx, cy, cz)) {
      for (let y = 0; y < SIZE; y++) for (let z = 0; z < SIZE; z++) for (let x = 0; x < SIZE; x++) {
        data[x + z * SIZE + y * 256] = blockAt(cx * SIZE + x, cy * SIZE + y, cz * SIZE + z, seed);
      }
    }
    return { cx, cy, cz, data, version: 0 };
  }

  const drawn = (id) => id !== B.AIR && id !== B.TORCH;
  const occluding = (id) => drawn(id) && id !== B.WATER;
  const FACES = [
    { n: [1, 0, 0], v: [[1, 0, 0], [1, 1, 0], [1, 1, 1], [1, 0, 1]] },
    { n: [-1, 0, 0], v: [[0, 0, 1], [0, 1, 1], [0, 1, 0], [0, 0, 0]] },
    { n: [0, 1, 0], v: [[0, 1, 1], [1, 1, 1], [1, 1, 0], [0, 1, 0]] },
    { n: [0, -1, 0], v: [[0, 0, 0], [1, 0, 0], [1, 0, 1], [0, 0, 1]] },
    { n: [0, 0, 1], v: [[1, 0, 1], [1, 1, 1], [0, 1, 1], [0, 0, 1]] },
    { n: [0, 0, -1], v: [[0, 0, 0], [0, 1, 0], [1, 1, 0], [1, 0, 0]] },
  ];
  // Block id at local coords up to 1 outside the chunk; a missing neighbour counts as solid (no face).
  function sample(chunk, nbs, x, y, z) {
    if (x >= 0 && x < SIZE && y >= 0 && y < SIZE && z >= 0 && z < SIZE) return chunk.data[x + z * SIZE + y * 256];
    const name = x < 0 ? 'nx' : x >= SIZE ? 'px' : y < 0 ? 'ny' : y >= SIZE ? 'py' : z < 0 ? 'nz' : 'pz';
    const c = nbs && nbs[name];
    if (!c) return B.STONE;
    return c.data[((x + SIZE) % SIZE) + ((z + SIZE) % SIZE) * SIZE + ((y + SIZE) % SIZE) * 256];
  }
  // Face-culled mesh buffers; positions are chunk-local. blocks[] = block id per face (atlas lookup).
  function mesh(chunk, neighbours) {
    const pos = [], nor = [], idx = [], blocks = [];
    let faces = 0;
    for (let y = 0; y < SIZE; y++) for (let z = 0; z < SIZE; z++) for (let x = 0; x < SIZE; x++) {
      const id = chunk.data[x + z * SIZE + y * 256];
      if (!drawn(id)) continue;
      for (const f of FACES) {
        const o = sample(chunk, neighbours, x + f.n[0], y + f.n[1], z + f.n[2]);
        if (occluding(o) || (id === B.WATER && o === B.WATER)) continue;
        const base = pos.length / 3;
        for (const c of f.v) { pos.push(x + c[0], y + c[1], z + c[2]); nor.push(f.n[0], f.n[1], f.n[2]); }
        idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
        blocks.push(id); faces++;
      }
    }
    return { positions: new Float32Array(pos), normals: new Float32Array(nor), indices: new Uint32Array(idx), blocks: new Uint8Array(blocks), faceCount: faces };
  }

  // Chunks within `radius` (Chebyshev) of centre {cx,cy,cz}, clipped to the world, nearest first.
  function visible(centre, radius) {
    const out = [];
    for (let cy = Math.max(0, centre.cy - radius); cy <= Math.min(WORLD.cy - 1, centre.cy + radius); cy++)
      for (let cz = Math.max(0, centre.cz - radius); cz <= Math.min(WORLD.cz - 1, centre.cz + radius); cz++)
        for (let cx = Math.max(0, centre.cx - radius); cx <= Math.min(WORLD.cx - 1, centre.cx + radius); cx++)
          out.push({ cx, cy, cz, d: Math.max(Math.abs(cx - centre.cx), Math.abs(cy - centre.cy), Math.abs(cz - centre.cz)) });
    out.sort((a, b) => a.d - b.d || a.cy - b.cy || a.cz - b.cz || a.cx - b.cx);
    return out;
  }
  // Loaded keys beyond radius+1 (one ring of hysteresis so edges don't thrash).
  function unload(loadedKeys, centre, radius) {
    const out = [];
    for (const k of loadedKeys) {
      const [cx, cy, cz] = k.split(',').map(Number);
      if (Math.max(Math.abs(cx - centre.cx), Math.abs(cy - centre.cy), Math.abs(cz - centre.cz)) > radius + 1) out.push(k);
    }
    return out;
  }

  // World = generated data + bounded diffs. diffs: chunk key -> { idx: block }.
  function createWorld(seed, savedDiffs) {
    const chunks = new Map();
    let diffs = new Map(), diffCount = 0;
    function getChunk(cx, cy, cz) {
      const k = key(cx, cy, cz);
      let c = chunks.get(k);
      if (!c) {
        c = generate(seed, cx, cy, cz);
        const d = diffs.get(k);
        if (d) for (const i in d) c.data[i] = d[i];
        chunks.set(k, c);
      }
      return c;
    }
    function getBlock(wx, wy, wz) {
      const cx = Math.floor(wx / SIZE), cy = Math.floor(wy / SIZE), cz = Math.floor(wz / SIZE);
      if (!inWorld(cx, cy, cz)) return B.AIR;
      return getChunk(cx, cy, cz).data[(wx - cx * SIZE) + (wz - cz * SIZE) * SIZE + (wy - cy * SIZE) * 256];
    }
    // Returns keys of chunks whose mesh must rebuild ([] if rejected or unchanged).
    function setBlock(wx, wy, wz, id) {
      const cx = Math.floor(wx / SIZE), cy = Math.floor(wy / SIZE), cz = Math.floor(wz / SIZE);
      if (!inWorld(cx, cy, cz)) return [];
      const c = getChunk(cx, cy, cz);
      const lx = wx - cx * SIZE, ly = wy - cy * SIZE, lz = wz - cz * SIZE, i = lx + lz * SIZE + ly * 256;
      if (c.data[i] === id) return [];
      const k = key(cx, cy, cz);
      const gen = blockAt(wx, wy, wz, seed);
      let d = diffs.get(k);
      const had = !!d && (i in d);
      if (id === gen) {
        if (had) { delete d[i]; diffCount--; if (!Object.keys(d).length) diffs.delete(k); }
      } else {
        if (!had && diffCount >= MAX_DIFFS) return [];
        if (!d) { d = {}; diffs.set(k, d); }
        if (!had) diffCount++;
        d[i] = id;
      }
      c.data[i] = id; c.version++;
      const dirty = [k];
      const edge = (v, ax) => {
        for (const step of [v === 0 ? -1 : 0, v === SIZE - 1 ? 1 : 0]) {
          if (!step) continue;
          const o = [cx, cy, cz]; o[ax] += step;
          if (inWorld(o[0], o[1], o[2])) dirty.push(key(o[0], o[1], o[2]));
        }
      };
      edge(lx, 0); edge(ly, 1); edge(lz, 2);
      return dirty;
    }
    function neighbours(cx, cy, cz) {
      const g = (a, b, c) => (inWorld(a, b, c) ? getChunk(a, b, c) : null);
      return { px: g(cx + 1, cy, cz), nx: g(cx - 1, cy, cz), py: g(cx, cy + 1, cz), ny: g(cx, cy - 1, cz), pz: g(cx, cy, cz + 1), nz: g(cx, cy, cz - 1) };
    }
    // Compact JSON: {v,seed,d:[[cx,cy,cz,[idx,block,idx,block,...]], ...]}, sorted so equal diffs give equal strings.
    function serialise() {
      const out = [];
      for (const [k, d] of diffs) {
        const p = k.split(',').map(Number), f = [];
        for (const i of Object.keys(d).map(Number).sort((a, b) => a - b)) f.push(i, d[i]);
        out.push([p[0], p[1], p[2], f]);
      }
      out.sort((a, b) => a[0] - b[0] || a[1] - b[1] || a[2] - b[2]);
      return JSON.stringify({ v: 1, seed, d: out });
    }
    function load(str) {
      diffs = new Map(); diffCount = 0; chunks.clear();
      let o;
      try { o = JSON.parse(str); } catch (e) { return false; }
      if (!o || o.v !== 1 || !Array.isArray(o.d)) return false;
      for (const e of o.d) {
        if (!Array.isArray(e) || !Array.isArray(e[3]) || !inWorld(e[0], e[1], e[2])) continue;
        const d = {};
        for (let j = 0; j + 1 < e[3].length && diffCount < MAX_DIFFS; j += 2) {
          const i = e[3][j], b = e[3][j + 1];
          if (i >= 0 && i < VOL && b >= 0 && b <= 12) { d[i] = b; diffCount++; }
        }
        if (Object.keys(d).length) diffs.set(key(e[0], e[1], e[2]), d);
      }
      return true;
    }
    if (savedDiffs) load(savedDiffs);
    return { seed, getChunk, getBlock, setBlock, neighbours, serialise, load, diffCount: () => diffCount, unloadChunk: (k) => chunks.delete(k), loadedKeys: () => Array.from(chunks.keys()) };
  }

  return { SIZE, VOL, WORLD, B, ORE_BANDS, LAVA_BAND, LAKE, MAX_DIFFS, generate, blockAt, mesh, visible, unload, createWorld, key, inWorld, surfaceY };
});
