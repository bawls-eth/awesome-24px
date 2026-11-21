// Run: node game/tests/shared-mm-isle-art.test.js  (stub image loader + stub 2D ctx, no DOM)
const K = require('../shared/mm-chunk-bake.js');
const A = require('../shared/mm-isle-art.js');
const O = require('../shared/mm-overworld.js');
let n = 0, bad = 0;
function check(name, ok) { n++; if (!ok) { bad++; console.log('FAIL ' + name); } }
function stub() {
  const calls = []; const ctx = { calls, fillStyle: '' };
  ctx.fillRect = (...a) => calls.push({ m: 'fillRect', a });
  ctx.drawImage = (...a) => calls.push({ m: 'drawImage', a });
  return ctx;
}
(async () => {
  check('names match MMOverworld.TERRAIN_NAMES prefix', A.NAMES.every((nm, i) => O.TERRAIN_NAMES[i] === nm));
  const map = A.idMap();
  check('12 pack terrains map to ids 22..33 in order', Object.keys(map).length === 12 && Object.keys(map).every((k) => O.TERRAIN_NAMES[k] === map[k]) && Object.keys(map)[0] === '22' && Object.keys(map)[11] === '33');
  check('tileId format', A.tileId('jungle_floor', 'a') === 'tile_jungle_floor_a');
  const asked = [];
  const li = (url) => { asked.push(url); return Promise.resolve({ url }); };
  const art = await A.load({ loadImage: li });
  check('loads 48 images from the b30 tiles dir', asked.length === 48 && asked.every((u) => /b30-jungle-terrain-base\/tiles\/tile_[a-z_]+_[a-d]\.png$/.test(u)));
  check('every pack id has 4 variants', Object.keys(art).length === 12 && Object.keys(art).every((k) => art[k].length === 4));
  const art2 = await A.load({ loadImage: (u) => Promise.resolve(/jungle_floor_b|tile_mud_[a-d]\.png/.test(u) ? null : { u }) });
  check('missing images are skipped, empty terrain dropped', art2[22].length === 3 && art2[25] === undefined && art2[26].length === 4);
  check('all-fail and throwing loaders give null, never reject', (await A.load({ loadImage: () => Promise.resolve(null) })) === null && (await A.load({ loadImage: () => { throw new Error('x'); } })) === null);

  const W = 32, t = new Uint8Array(W * W); for (let i = 0; i < t.length; i++) t[i] = 22 + (i % 12);
  const isle = A.create({ loadImage: li });
  const before = stub(); isle.bake(before, t, W, 0, 0);
  check('before ready: palette fallback only', !isle.active() && before.calls.every((c) => c.m === 'fillRect'));
  await isle.ready;
  const c1 = stub(), c2 = stub(); isle.bake(c1, t, W, 0, 0); isle.bake(c2, t, W, 0, 0);
  const draws = c1.calls.filter((c) => c.m === 'drawImage');
  check('after ready: 256 tile images, no fills', isle.active() && draws.length === 256 && c1.calls.length === 256);
  check('deterministic', JSON.stringify(c1.calls) === JSON.stringify(c2.calls));
  check('variants vary across tiles', new Set(draws.map((c) => c.a[0].url)).size > 12);
  const other = stub(); isle.bake(other, t, W, 1, 0);
  check('neighbouring chunk bakes with world coords', JSON.stringify(other.calls) !== JSON.stringify(c1.calls));

  const off = A.create({ art: false, loadImage: li }); await off.ready;
  const f = stub(); off.bake(f, t, W, 0, 0);
  check('art:false uses code-drawn palette', !off.active() && f.calls.every((c) => c.m === 'fillRect') && f.calls.length > 256);
  check('fallback palette covers all 12 pack terrains', A.TERRAINS.every((x) => K.resolvePalette(A.PALETTE)[x]));
  const bad2 = A.create({ loadImage: () => Promise.reject(new Error('no')) }); await bad2.ready;
  const f2 = stub(); check('loader failure falls back and still paints', !bad2.active() && bad2.bake(f2, t, W, 0, 0) === 256);

  let made = 0;
  const create = () => { made++; const c = stub(); return { getContext: () => c }; };
  const cc = A.create({ loadImage: li, create }); await cc.ready;
  const a = cc.chunk(t, W, 0, 0), b = cc.chunk(t, W, 0, 0);
  check('chunk() caches the baked canvas', a && a === b && made === 1 && cc.cacheSize() === 1);
  check('chunk() returns null without a canvas factory in node', A.create({ art: false }).chunk(t, W, 0, 0) === null);
  check('bakeChunk signature unchanged', K.bakeChunk.length === 8);
  console.log(bad ? bad + ' of ' + n + ' FAILED' : 'shared-mm-isle-art: ' + n + ' checks passed');
  process.exit(bad ? 1 : 0);
})();
