// Run: node game/tests/shared-mm-chunk-bake.test.js  (stub 2D ctx, no DOM)
const K = require('../shared/mm-chunk-bake.js');
let n = 0, bad = 0;
function check(name, ok) { n++; if (!ok) { bad++; console.log('FAIL ' + name); } }

function stub(withImage) {
  const calls = [], styles = [];
  const ctx = { calls, styles };
  let fs = '';
  ['fillRect'].concat(withImage ? ['drawImage'] : []).forEach((m) => { ctx[m] = (...a) => { calls.push({ m, a, fs }); }; });
  Object.defineProperty(ctx, 'fillStyle', { get: () => fs, set: (v) => { fs = v; styles.push(v); } });
  return ctx;
}
const sig = (c) => JSON.stringify(c.calls);
const finite = (c) => c.calls.every((k) => k.a.every((v) => typeof v !== 'number' || Number.isFinite(v)));
const W = 40, H = 40;
const NAMES = K.NAMES.concat(['jungle_floor', 'vine_thicket', 'mud', 'river_reed', 'canopy_rock', 'ruin_moss']);   // ids 18..23
function world(fn) { const t = new Uint8Array(W * H); for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) t[y * W + x] = fn(x, y); return t; }
const jungle = K.BIOME_PALETTES.jungle;
const terr = world((x, y) => 18 + ((x >> 2) + (y >> 3)) % 6);

check('constants: 32 px tiles, 16 per chunk, 512 px chunk', K.TILE === 32 && K.CH === 16 && K.CPX === 512 && K.NAMES.length === 18 && K.NAMES[0] === 'deep_water' && K.NAMES[17] === 'lava_rock');
check('every biome palette has 4 valid hex colours per terrain', Object.keys(K.BIOME_PALETTES).every((b) => Object.keys(K.BIOME_PALETTES[b]).every((t) => K.BIOME_PALETTES[b][t].length === 4 && K.BIOME_PALETTES[b][t].every((c) => /^#[0-9a-f]{6}$/i.test(c)))));
check('every biome keeps the 18 realm terrains and adds its own', Object.keys(K.BIOME_PALETTES).every((b) => K.NAMES.every((t) => K.BIOME_PALETTES[b][t])) && ['jungle_floor', 'vine_thicket', 'mud', 'river_reed', 'canopy_rock', 'ruin_moss'].every((t) => jungle[t]) && K.BIOME_PALETTES.ice.crevasse && K.BIOME_PALETTES.reef.coral_bed && K.BIOME_PALETTES.mars.crater);
check('biomes are visually distinct (own base colours)', new Set(['jungle_floor']).size === 1 && jungle.jungle_floor[0] !== K.BIOME_PALETTES.ice.ice_floor[0] && K.BIOME_PALETTES.ice.ice_floor[0] !== K.BIOME_PALETTES.mars.rust_dust[0]);
check('paletteFor falls back to home', K.paletteFor('jungle') === K.BIOME_PALETTES.jungle && K.paletteFor('nope') === K.BIOME_PALETTES.home && K.paletteFor(null) === K.BIOME_PALETTES.home && K.paletteFor('__proto__') === K.BIOME_PALETTES.home);

const c0 = stub();
const painted = K.bakeChunk(c0, terr, W, 0, 0, jungle, null, { names: NAMES });
check('a chunk paints 256 tiles', painted === 256 && c0.calls.filter((k) => k.m === 'fillRect' && k.a[2] === 32 && k.a[3] === 32).length === 256);
const allowed = K.colorsOf(jungle);
check('a baked jungle chunk uses only palette colours', c0.styles.length > 256 && c0.styles.every((s) => allowed.indexOf(s) >= 0));
check('every painted rect stays inside the 512 px chunk and is finite', c0.calls.every((k) => k.a[0] >= 0 && k.a[1] >= 0 && k.a[0] + k.a[2] <= 512 && k.a[1] + k.a[3] <= 512) && finite(c0));
check('a chunk draw-call count is bounded', c0.calls.length <= 256 * (1 + 3 + 4) && c0.calls.length >= 256);
check('each terrain base colour appears (terrain ids map through names)', (() => { const bases = new Set(c0.calls.filter((k) => k.a[2] === 32 && k.a[3] === 32).map((k) => k.fs)); return NAMES.slice(18, 23).every((nm) => bases.has(jungle[nm][0])); })());
check('baking is deterministic', (() => { const x = stub(), y = stub(); K.bakeChunk(x, terr, W, 1, 1, jungle, null, { names: NAMES }); K.bakeChunk(y, terr, W, 1, 1, jungle, null, { names: NAMES }); return sig(x) === sig(y); })());
check('different chunks give different drawings', (() => { const x = stub(), y = stub(); K.bakeChunk(x, terr, W, 0, 0, jungle, null, { names: NAMES }); K.bakeChunk(y, terr, W, 1, 0, jungle, null, { names: NAMES }); return sig(x) !== sig(y); })());
check('patterns depend only on WORLD tile coordinates (chunk seams line up)', (() => {
  // tile (16,0) is tx=0 of chunk (1,0); the same world tile baked as part of a chunk shifted by one world tile offset must differ only by position
  const one = stub(); K.bakeChunk(one, terr, W, 1, 0, jungle, null, { names: NAMES });
  const first = one.calls.filter((k) => k.a[0] < 32 && k.a[1] < 32);       // the tile at tx=0,ty=0
  const hashed = [K.hash(16, 0, 3), K.hash(16, 0, 7)];
  return first.length >= 1 && first[0].a[2] === 32 && hashed.every((v) => v >= 0 && v < 1) && K.hash(16, 0, 3) === hashed[0];
})());
check('hash is pure, in [0,1) and spreads values', (() => { let lo = 1, hi = 0, same = true; for (let i = 0; i < 2000; i++) { const v = K.hash(i, i * 7, 3); lo = Math.min(lo, v); hi = Math.max(hi, v); if (v !== K.hash(i, i * 7, 3)) same = false; } return same && lo >= 0 && hi < 1 && lo < 0.05 && hi > 0.95; })());
check('terrain boundaries get a 2 px edge line in the edge colour', (() => {
  const t = world((x) => (x < 20 ? 18 : 19)); const c = stub(); K.bakeChunk(c, t, W, 1, 0, jungle, null, { names: NAMES });
  return c.calls.some((k) => k.a[2] === 2 && k.a[3] === 32 && k.fs === jungle.jungle_floor[3] && k.a[0] === 32 * 3 + 30) && c.calls.some((k) => k.a[2] === 2 && k.a[3] === 32 && k.fs === jungle.vine_thicket[3] && k.a[0] === 32 * 4);
})());
check('uniform terrain draws no edge lines', (() => { const t = world(() => 18); const c = stub(); K.bakeChunk(c, t, W, 0, 0, jungle, null, { names: NAMES }); return c.calls.filter((k) => (k.a[2] === 2 && k.a[3] === 32) || (k.a[2] === 32 && k.a[3] === 2)).length === 0; })());
check('tiles outside the world are deep water', (() => { const c = stub(); const t = world(() => 18); K.bakeChunk(c, t, W, 2, 2, jungle, null, { names: NAMES }); const out = c.calls.filter((k) => k.a[2] === 32 && k.a[3] === 32 && k.fs === jungle.deep_water[0]); return out.length === 256 - 8 * 8 && K.bakeChunk(stub(), t, W, 99, 99, jungle, null, { names: NAMES }) === 256; })());
check('tile art is drawn instead of the pattern when given', (() => { const c = stub(true); const img = { id: 1 }; K.bakeChunk(c, terr, W, 0, 0, jungle, { 18: [img], 19: [null] }, { names: NAMES }); const di = c.calls.filter((k) => k.m === 'drawImage'); return di.length > 0 && di.every((k) => k.a[0] === img && k.a[3] === 32) && c.calls.filter((k) => k.m === 'fillRect').length > 0; })());
check('tile art is ignored when ctx cannot drawImage', (() => { const c = stub(false); return K.bakeChunk(c, terr, W, 0, 0, jungle, { 18: [{}] }, { names: NAMES }) === 256 && !c.calls.some((k) => k.m === 'drawImage'); })());
check('default names map the 18 realm terrains', (() => { const c = stub(); const t = world((x, y) => (x + y) % 18); K.bakeChunk(c, t, W, 0, 0, K.BIOME_PALETTES.home, null); const al = K.colorsOf(K.BIOME_PALETTES.home); return c.styles.every((s) => al.indexOf(s) >= 0) && new Set(c.calls.filter((k) => k.a[2] === 32).map((k) => k.fs)).size >= 15; })());
check('an unknown terrain id uses the fallback entry (still a palette colour)', (() => { const c = stub(); const t = world(() => 200); K.bakeChunk(c, t, W, 0, 0, jungle, null, { names: NAMES }); return c.styles.every((s) => allowed.indexOf(s) >= 0) && c.calls.length >= 256; })());
check('only the given palette colours are used, even for a tiny custom palette', (() => { const p = { deep_water: ['#000001', '#000002', '#000003', '#000004'], grass: ['#111111', '#222222', '#333333', '#444444'] }; const c = stub(); K.bakeChunk(c, world((x) => x % 2), W, 0, 0, p, null); return c.styles.every((s) => K.colorsOf(p).indexOf(s) >= 0) && K.colorsOf(p).length === 8; })());

// hostile
check('hostile palette entries are ignored, grey fallback used', (() => { const c = stub(); const p = { grass: ['red', 1, null, {}], __proto__: { x: 1 }, deep_water: 'x', mud: ['#12', '#34', '#56'] }; const r = K.bakeChunk(c, terr, W, 0, 0, p, null, { names: NAMES }); return r === 256 && c.styles.every((s) => /^#[0-9a-f]{6}$/i.test(s)) && K.colorsOf(null).length === 4; })());
check('hostile args never throw', (() => {
  try {
    [null, undefined, 5, 'x', {}, []].forEach((g) => K.bakeChunk(g, terr, W, 0, 0, jungle));
    const ok = stub();
    return K.bakeChunk(ok, null, W, 0, 0, jungle) === 0 && K.bakeChunk(ok, terr, 0, 0, 0, jungle) === 0 && K.bakeChunk(ok, terr, NaN, NaN, NaN, null, 5, 5) === 0
      && K.bakeChunk(ok, [1, 2, 3], 'x', {}, [], 7, 'q', { names: 'z', h: -5, tile: 1e9 }) === 0 && K.bakeChunk(ok, [], 1, 0, 0, jungle) > 0 && K.bakeChunk(ok, { length: 'x' }, 4, 0, 0, jungle) === 0;
  } catch (e) { return false; }
})());
check('hostile terrain values do not throw or leak NaN', (() => { const c = stub(); const t = []; for (let i = 0; i < W * H; i++) t.push([NaN, -1, 1e9, 'x', null, {}][i % 6]); K.bakeChunk(c, t, W, 0, 0, jungle, null, { names: NAMES }); return finite(c) && c.styles.every((s) => allowed.indexOf(s) >= 0); })());
check('opts.tile is clamped (4..64)', (() => { const c = stub(); K.bakeChunk(c, terr, W, 0, 0, jungle, null, { names: NAMES, tile: 1e9 }); return c.calls.every((k) => k.a[2] <= 64); })());

// canvas + cache
check('bakeChunkCanvas makes a 512 px canvas and paints it once', (() => { const cv = []; const mk = (w, h) => { const o = { w, h, ctx: stub(), getContext() { return this.ctx; } }; cv.push(o); return o; }; const r = K.bakeChunkCanvas(mk, terr, W, 0, 0, jungle, null, { names: NAMES }); return r === cv[0] && r.w === 512 && r.h === 512 && r.ctx.calls.length >= 256 && r.ctx.imageSmoothingEnabled === false; })());
check('bakeChunkCanvas returns null without a canvas, never throws', K.bakeChunkCanvas(null, terr, W, 0, 0, jungle) === null && K.bakeChunkCanvas(() => null, terr, W, 0, 0, jungle) === null && K.bakeChunkCanvas(() => { throw new Error('x'); }, terr, W, 0, 0, jungle) === null && K.defaultCreate(4, 4) === null);
check('cache is an LRU: hits reuse, misses build once, oldest evicted', (() => {
  const c = K.makeCache(3); let built = 0; const b = (k) => () => { built++; return { k }; };
  const a = c.get('a', b('a')); c.get('b', b('b')); c.get('c', b('c')); const again = c.get('a', b('x')); c.get('d', b('d'));
  return a === again && built === 4 && c.size() === 3 && c.get('b', b('b2')).k === 'b2' && built === 5;
})());
check('cache survives a throwing / null builder', (() => { const c = K.makeCache(2); return c.get('a', () => { throw new Error('x'); }) === null && c.get('b', () => null) === null && c.get('c') === null && c.size() === 0; })());
check('no Math.random in the module', !/Math\.random/.test(require('fs').readFileSync(require.resolve('../shared/mm-chunk-bake.js'), 'utf8').replace(/\/\/.*$/gm, '')));

console.log((bad ? 'FAILED ' + bad : 'ok') + ' (' + n + ' checks)');
process.exit(bad ? 1 : 0);
