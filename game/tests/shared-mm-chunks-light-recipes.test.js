// Node test for MMChunks / MMLight / MMRecipes. Run: node game/tests/shared-mm-chunks-light-recipes.test.js
const path = require('path');
const C = require(path.join(__dirname, '../shared/mm-chunks.js'));
const L = require(path.join(__dirname, '../shared/mm-light.js'));
const R = require(path.join(__dirname, '../shared/mm-recipes.js'));

let passed = 0, failed = 0;
function check(name, cond) { if (cond) passed++; else { failed++; console.log('FAIL: ' + name); } }
function done() { console.log(passed + ' passed, ' + failed + ' failed'); process.exit(failed ? 1 : 0); }
const same = (a, b) => a.length === b.length && a.every((v, i) => v === b[i]);

// --- chunks: determinism
const a = C.generate(42, 3, 1, 4), b = C.generate(42, 3, 1, 4), c = C.generate(43, 3, 1, 4);
check('same seed same bytes', same(a.data, b.data));
check('different seed differs', !same(a.data, c.data));

// --- ore bands over the whole world column set
let bad = 0, seen = {};
for (let cx = 0; cx < 8; cx += 3) for (let cz = 0; cz < 8; cz += 3) for (let cy = 0; cy < 4; cy++) {
  const ch = C.generate(7, cx, cy, cz);
  for (let i = 0; i < C.VOL; i++) {
    const id = ch.data[i], band = C.ORE_BANDS[id];
    if (band) { const y = cy * 16 + (i >> 8); seen[id] = (seen[id] || 0) + 1; if (y < band.min || y > band.max) bad++; }
  }
}
check('ores only inside depth bands', bad === 0);
check('all four ores generated', [4, 5, 6, 7].every((id) => seen[id] > 0));

// --- meshing
const solid = { cx: 0, cy: 0, cz: 0, data: new Uint8Array(C.VOL).fill(C.B.STONE) };
const full = { px: solid, nx: solid, py: solid, ny: solid, pz: solid, nz: solid };
check('fully buried solid chunk has 0 faces', C.mesh(solid, full).faceCount === 0);
const two = { cx: 0, cy: 0, cz: 0, data: new Uint8Array(C.VOL) };
two.data[5 + 5 * 16 + 5 * 256] = C.B.STONE; two.data[6 + 5 * 16 + 5 * 256] = C.B.STONE;
const m2 = C.mesh(two, null);
check('two adjacent blocks: hidden shared faces culled (10 faces)', m2.faceCount === 10 && m2.indices.length === 60);
check('missing neighbour hides border face', C.mesh(solid, null).faceCount === 0);

// --- one edit rebuilds only affected chunks
const w = C.createWorld(9);
check('interior edit dirties exactly 1 chunk', w.setBlock(24, 24, 24, C.B.AIR).length === 1);
check('edge edit dirties chunk + 1 neighbour', w.setBlock(32, 20, 20, C.B.AIR).length === 2);
const before = C.mesh(w.getChunk(5, 0, 5), w.neighbours(5, 0, 5)).faceCount;
const after0 = C.mesh(w.getChunk(5, 0, 5), w.neighbours(5, 0, 5)).faceCount;
check('untouched chunk mesh is stable', before === after0);

// --- visible / unload
const centre = { cx: 4, cy: 1, cz: 4 };
check('visible radius 3 (phone) count', C.visible(centre, 3).length === 7 * 4 * 7);
check('visible radius 5 (desktop) clipped to world', C.visible(centre, 5).length === 8 * 4 * 8);
check('visible nearest first', C.visible(centre, 3)[0].d === 0);
const far = ['0,0,0', '4,1,4', '5,1,4', '7,3,7'];
const un = C.unload(far, centre, 1);
check('unload set = beyond radius+1', same(un.sort(), ['0,0,0', '7,3,7'].sort()));

// --- diffs
const w2 = C.createWorld(11);
w2.setBlock(10, 10, 10, C.B.TORCH); w2.setBlock(33, 40, 70, C.B.AIR); w2.setBlock(0, 0, 0, C.B.GOLD);
const s = w2.serialise();
const w3 = C.createWorld(11, s);
check('diff round-trip same blocks', w3.getBlock(10, 10, 10) === C.B.TORCH && w3.getBlock(33, 40, 70) === C.B.AIR && w3.getBlock(0, 0, 0) === C.B.GOLD);
check('diff round-trip same serialisation', w3.serialise() === s);
check('diffs are sparse (3 stored)', w2.diffCount() === 3);
w2.setBlock(10, 10, 10, C.blockAt(10, 10, 10, 11));
check('reverting to generated value drops the diff', w2.diffCount() === 2);
check('corrupt save rejected', C.createWorld(1).load('{nope') === false);
const w4 = C.createWorld(5);
let rejected = false;
for (let i = 0; i < C.MAX_DIFFS + 50 && !rejected; i++) {
  const x = i % 128, z = Math.floor(i / 128) % 128, y = 20 + Math.floor(i / 16384);
  const g = C.blockAt(x, y, z, 5);
  if (w4.setBlock(x, y, z, g === C.B.TORCH ? C.B.AIR : C.B.TORCH).length === 0 && w4.diffCount() >= C.MAX_DIFFS) rejected = true;
}
check('diff count bounded', rejected && w4.diffCount() <= C.MAX_DIFFS);

// --- light
function grid(w, h, d) { return { w, h, d, blocks: new Uint8Array(w * h * d).fill(C.B.STONE) }; }
const g = grid(31, 20, 31);
const at = (x, y, z) => x + z * 31 + y * 31 * 31;
for (let y = 0; y < 3; y++) g.blocks[at(0, y, 0)] = C.B.AIR; // open shaft to the sky
for (let x = 0; x < 31; x++) g.blocks[at(x, 10, 15)] = C.B.AIR; // tunnel
g.blocks[at(2, 10, 15)] = C.B.TORCH;
const lt = L.propagate(g);
check('torch light is 14', lt.block[at(2, 10, 15)] === 14);
check('light falls off 1 per block', lt.block[at(5, 10, 15)] === 11 && lt.block[at(15, 10, 15)] === 1 && lt.block[at(16, 10, 15)] === 0);
check('sky light 15 at surface', lt.sky[at(0, 0, 0)] === 15 && lt.sky[at(0, 2, 0)] === 15);
check('buried stone gets no light, never negative or >15', Array.from(lt.light).every((v) => v >= 0 && v <= 15) && lt.light[at(20, 15, 20)] === 0);
check('light deterministic', same(L.propagate(g).light, lt.light));

// --- recipes
check('24 recipes', R.RECIPES.length === 24 && new Set(R.ids()).size === 24);
const old = ['plank', 'brick', 'stew', 'bugjar', 'pie', 'crown', 'chime', 'lantern', 'wreath', 'umbrella', 'jacko', 'snowman', 'stone_pick', 'iron_pick', 'gold_pick', 'table'];
check('existing recipe ids preserved', old.every((id) => R.get(id)));
check('new sets present', ['ladder', 'door', 'chest', 'bed'].every((id) => R.get(id)));
check('table costs 4 wood', R.get('table').cost.wood === 4);
check('canCraft exact inputs', R.canCraft({ wood: 4 }, 'table') && !R.canCraft({ wood: 3 }, 'table') && !R.canCraft({}, 'nope'));
const inv = { wood: 10, stone: 1 };
check('craft consumes exactly and adds output', R.craft(inv, 'table') && inv.wood === 6 && inv.table === 1 && inv.stone === 1);
const inv2 = { stone: 5, wood: 2 };
check('failed craft leaves inventory untouched', !R.craft(inv2, 'stone_pick') && inv2.stone === 5 && inv2.wood === 2);
check('survival: fall damage on, no flight', R.mode('survival').fallDamage === true && R.mode('survival').flight === false);
check('creative: no fall damage, flight on', R.mode('creative').fallDamage === false && R.mode('creative').flight === true);

done();
