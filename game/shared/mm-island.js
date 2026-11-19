// Wilds island generator. UMD: browser global MMIsland, or require(). Needs MMRng.
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./rng.js'));
  else root.MMIsland = factory(root.MMRng);
}(typeof self !== 'undefined' ? self : this, function (MMRng) {
  const SIZE = 192, TILE = 24;
  // Band edges as fraction of island radius: [lo, hi) from the inside out.
  const BANDS = [
    { id: 0, name: 'shore', lo: 0.85, hi: 1.0, tiers: [1, 1] },
    { id: 1, name: 'bramble', lo: 0.65, hi: 0.85, tiers: [1, 2] },
    { id: 2, name: 'fogfen', lo: 0.45, hi: 0.65, tiers: [2, 3] },
    { id: 3, name: 'ember', lo: 0.25, hi: 0.45, tiers: [3, 4] },
    { id: 4, name: 'heart', lo: 0.0, hi: 0.25, tiers: [4, 5] },
  ];
  const WATER = 0, SAND = 1, SHALLOW = 2, GRASS = 3, MARSH = 4, ASH = 5, HEDGE = 6;
  const BIOME_NAMES = ['water', 'sand', 'shallow', 'grass', 'marsh', 'ash', 'hedge'];

  const R = SIZE / 2 - 1;
  function center() { return { x: SIZE / 2 - 0.5, y: SIZE / 2 - 0.5 }; }
  // distance from island centre as a fraction of the radius
  function radialFrac(tx, ty) {
    const c = center();
    return Math.hypot(tx - c.x, ty - c.y) / R;
  }
  // band index (0 shore .. 4 heart) for a fraction, or -1 beyond the shore (open water)
  function bandOfFrac(f) {
    if (f >= 1.0) return -1;
    for (let i = 0; i < BANDS.length; i++) if (f >= BANDS[i].lo) return i;
    return 4;
  }
  function bandAt(tx, ty) { return bandOfFrac(radialFrac(tx, ty)); }

  function lattice(rng, n) {
    const g = [];
    for (let i = 0; i <= n; i++) { g.push([]); for (let j = 0; j <= n; j++) g[i].push(rng.next()); }
    return function (x, y) { // x,y in [0,1]
      const fx = x * n, fy = y * n;
      const i = Math.min(n - 1, Math.floor(fx)), j = Math.min(n - 1, Math.floor(fy));
      let u = fx - i, v = fy - j;
      u = u * u * (3 - 2 * u); v = v * v * (3 - 2 * v);
      const a = g[i][j] + (g[i + 1][j] - g[i][j]) * u;
      const b = g[i][j + 1] + (g[i + 1][j + 1] - g[i][j + 1]) * u;
      return a + (b - a) * v;
    };
  }

  function generate(seed) {
    const rng = MMRng.create('island:' + seed);
    const elev = lattice(rng, 12), moist = lattice(rng, 8);
    const biome = new Uint8Array(SIZE * SIZE);
    const band = new Int8Array(SIZE * SIZE);
    for (let y = 0; y < SIZE; y++) for (let x = 0; x < SIZE; x++) {
      const f = radialFrac(x, y);
      const b = bandOfFrac(f);
      const i = y * SIZE + x;
      band[i] = b;
      if (b < 0) { biome[i] = WATER; continue; }
      const e = elev(x / SIZE, y / SIZE), m = moist(x / SIZE, y / SIZE);
      let t;
      if (b === 0) t = f > 0.95 && e < 0.5 ? SHALLOW : SAND;
      else if (b === 1) t = GRASS;
      else if (b === 2) t = m > 0.35 ? MARSH : GRASS;
      else if (b === 3) t = ASH;
      else t = (x + y) % 6 < 3 && e > 0.55 ? HEDGE : ASH;
      biome[i] = t;
    }
    // spawn: a sand tile on the shore at a seeded angle
    const c = center();
    let spawn = null;
    const a0 = rng.next() * Math.PI * 2;
    for (let k = 0; k < 720 && !spawn; k++) {
      const a = a0 + k * 0.0087;
      const r = R * (0.88 + 0.05 * rng.next());
      const tx = Math.round(c.x + Math.cos(a) * r), ty = Math.round(c.y + Math.sin(a) * r);
      const i = ty * SIZE + tx;
      if (tx >= 0 && ty >= 0 && tx < SIZE && ty < SIZE && band[i] === 0 && biome[i] === SAND) spawn = { tx, ty };
    }
    return { seed, size: SIZE, tile: TILE, biome, band, spawn, center: c, radius: R };
  }

  function bandAtIsland(isl, tx, ty) {
    if (tx < 0 || ty < 0 || tx >= isl.size || ty >= isl.size) return -1;
    return isl.band[ty * isl.size + tx];
  }
  function isLand(isl, tx, ty) {
    if (tx < 0 || ty < 0 || tx >= isl.size || ty >= isl.size) return false;
    const t = isl.biome[ty * isl.size + tx];
    return t !== WATER && t !== SHALLOW && t !== HEDGE;
  }
  // distance in tiles from the spawn point
  function distFromSpawn(isl, tx, ty) { return Math.hypot(tx - isl.spawn.tx, ty - isl.spawn.ty); }

  // returns an array of problems (empty = valid)
  function validate(isl) {
    const p = [];
    if (!isl || isl.size !== SIZE) return ['size'];
    if (isl.biome.length !== SIZE * SIZE || isl.band.length !== SIZE * SIZE) p.push('array length');
    if (!isl.spawn) return p.concat('no spawn');
    if (bandAtIsland(isl, isl.spawn.tx, isl.spawn.ty) !== 0) p.push('spawn not on shore');
    if (!isLand(isl, isl.spawn.tx, isl.spawn.ty)) p.push('spawn not on land');
    for (let i = 0; i < isl.band.length; i++) {
      const x = i % SIZE, y = (i / SIZE) | 0;
      if (isl.band[i] !== bandAt(x, y)) { p.push('band mismatch at ' + x + ',' + y); break; }
    }
    const seen = new Array(5).fill(0);
    for (let i = 0; i < isl.band.length; i++) if (isl.band[i] >= 0) seen[isl.band[i]]++;
    seen.forEach((n, b) => { if (!n) p.push('empty band ' + b); });
    return p;
  }

  return { SIZE, TILE, BANDS, BIOME_NAMES, generate, validate, bandAt, bandOfFrac, radialFrac, bandAtIsland, isLand, distFromSpawn,
    BIOME: { WATER, SAND, SHALLOW, GRASS, MARSH, ASH, HEDGE } };
}));
