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

  // ---- AW2: b35 meadow-home set (pack 'meadow') ----
  const NM = O.TERRAIN_NAMES, ID = O.TERRAIN_ALL;
  const mmap = A.idMap(NM, 'meadow');
  check('meadow: the 4 home terrains map to ids 18..21 (pack name -> b35 name table)', JSON.stringify(mmap) === JSON.stringify({ 18: 'tilled_soil', 19: 'tilled_wet', 20: 'clover_patch', 21: 'garden_path' })
    && Object.keys(A.MEADOW_TILES).every((k) => A.MEADOW_TILES[k] === k));
  const murl = [];
  const mli = (u) => { murl.push(u); return Promise.resolve({ u, width: 32, height: 32 }); };
  const mart = await A.load({ pack: 'meadow', names: NM, loadImage: mli });
  check('meadow load asks 16 variants + 64 edge masks from b35 tiles', murl.length === 80 && murl.every((u) => /b35-meadow-home\/tiles\/tile_(tilled_soil|tilled_wet|clover_patch|garden_path)_([a-d]|edge_(0\d|1[0-5]))\.png$/.test(u))
    && Object.keys(mart).join() === '18,19,20,21' && mart.edges[21].imgs.length === 16 && mart.edges[21].imgs.every(Boolean));
  check('edge blend sets: grass-family for soil / clover / path, tilled_wet into tilled_soil', mart.edges[21].blend[ID.grass] === 1 && mart.edges[21].blend[ID.tall_grass] === 1
    && mart.edges[19].blend[ID.tilled_soil] === 1 && !mart.edges[19].blend[ID.grass]);
  // a plus-shaped garden path in grass: centre has 4 same neighbours (variant), the arms are edge masks, a far grass tile is code-drawn
  const MW = 16, mt = new Uint8Array(MW * MW).fill(ID.grass);
  const P = (x, y) => { mt[y * MW + x] = ID.garden_path; };
  P(5, 5); P(4, 5); P(6, 5); P(5, 4); P(5, 6);
  const misle = A.create({ pack: 'meadow', names: NM, loadImage: mli }); await misle.ready;
  const mc = stub(); misle.bake(mc, mt, MW, 0, 0);
  const di = mc.calls.filter((c) => c.m === 'drawImage');
  const at = (x, y) => di.filter((c) => c.a[c.a.length - 4] === x * 32 && c.a[c.a.length - 3] === y * 32);
  check('meadow bake: path centre = a b35 variant, west arm = edge mask 2 (east connected), north arm = mask 4', misle.active() && misle.pack === 'meadow'
    && /tile_garden_path_[a-d]\.png$/.test(at(5, 5)[0].a[0].u) && /tile_garden_path_edge_02\.png$/.test(at(4, 5)[0].a[0].u) && /tile_garden_path_edge_04\.png$/.test(at(5, 4)[0].a[0].u));
  check('meadow bake: grass keeps the code palette, with no 2 px edge line toward a blended path tile', di.length === 5 && mc.calls.filter((c) => c.m === 'fillRect' && ((c.a[2] === 2 && c.a[3] === 32) || (c.a[2] === 32 && c.a[3] === 2))).length === 0);
  const hard = new Uint8Array(MW * MW).fill(ID.grass); hard[5 * MW + 5] = ID.garden_path; const hc = stub(); A.create({ pack: 'meadow', names: NM, art: false }).bake(hc, hard, MW, 0, 0);
  check('without art the same grass draws its edge lines (4 round the lone path tile, 4 on it)', hc.calls.filter((c) => c.m === 'fillRect' && ((c.a[2] === 2 && c.a[3] === 32) || (c.a[2] === 32 && c.a[3] === 2))).length === 8);
  // a 2x2 path block: every tile is an L (two connected sides over a same-terrain diagonal) -> the inner quarter is repainted from the variant
  const bt = new Uint8Array(MW * MW).fill(ID.grass); [[3, 3], [4, 3], [3, 4], [4, 4]].forEach((q) => { bt[q[1] * MW + q[0]] = ID.garden_path; });
  const bc = stub(); misle.bake(bc, bt, MW, 0, 0);
  const tl = bc.calls.filter((c) => c.m === 'drawImage' && c.a[c.a.length - 4] >= 96 && c.a[c.a.length - 4] < 128 && c.a[c.a.length - 3] >= 96 && c.a[c.a.length - 3] < 128);
  check('inner corners: an L tile draws its edge mask (6 = E+S) then the variant quarter at its SE corner', tl.length === 2 && /edge_06/.test(tl[0].a[0].u) && tl[1].a.length === 9
    && tl[1].a[5] === 112 && tl[1].a[6] === 112 && tl[1].a[7] === 16);
  const moff = A.create({ pack: 'meadow', names: NM, art: false }); await moff.ready;
  const mf = stub(); moff.bake(mf, mt, MW, 0, 0);
  check('meadow art:false: code palette only (the b35 fallback colours)', !moff.active() && mf.calls.every((c) => c.m === 'fillRect') && mf.calls.some((c) => c.a[2] === 32))
  check('meadow fallback palette covers the 4 terrains + dock planks', ['tilled_soil', 'tilled_wet', 'clover_patch', 'garden_path', 'dock_planks', 'grass'].every((x) => K.resolvePalette(A.MEADOW_PALETTE)[x]));
  const half = await A.load({ pack: 'meadow', names: NM, loadImage: (u) => Promise.resolve(/garden_path_[a-d]\.png|tilled_wet_edge_07/.test(u) ? null : { u }) });
  check('a terrain whose variants all fail falls back (no edges either); one missing mask is just absent', half[21] === undefined && half.edges[21] === undefined && half.edges[19].imgs[7] === null && half.edges[19].imgs[6]);
  // regrass: the 3 b35 grass colours become palette.grass [base, shade2, edge]; other pixels stay; no canvas -> the image as delivered
  const px = new Uint8ClampedArray([0x36, 0x6f, 0x3d, 255, 0x4f, 0x8b, 0x46, 255, 0x26, 0x52, 0x31, 255, 0xa7, 0x8a, 0x68, 255, 0x36, 0x6f, 0x3d, 0]);
  const rc = { getContext: () => ({ drawImage: () => {}, getImageData: () => ({ data: px }), putImageData: () => {} }) };
  const out = A.regrass({ width: 5, height: 1 }, A.MEADOW_GRASS, { grass: ['#6cbf55', '#62b24c', '#78cb62', '#468a38'] }, () => rc);
  check('regrass swaps exactly the b35 grass colours (transparent and path pixels untouched)', out === rc && out.regrassed === 3 && px[0] === 0x6c && px[1] === 0xbf && px[4] === 0x78 && px[8] === 0x46
    && px[12] === 0xa7 && px[16] === 0x36);
  const raw = { width: 1 };
  check('regrass without a canvas (node) or a throwing one returns the PNG unchanged', A.regrass(raw, A.MEADOW_GRASS, A.MEADOW_PALETTE, null) === raw && A.regrass(raw, A.MEADOW_GRASS, A.MEADOW_PALETTE, () => { throw new Error('x'); }) === raw);
  const ja = []; await A.load({ loadImage: (u) => { ja.push(u); return Promise.resolve({ u }); } });
  check('jungle set unchanged: the default load still asks only the 48 b30 tiles', ja.length === 48 && ja.every((u) => /b30-jungle-terrain-base/.test(u)));
  console.log(bad ? bad + ' of ' + n + ' FAILED' : 'shared-mm-isle-art: ' + n + ' checks passed');
  process.exit(bad ? 1 : 0);
})();
