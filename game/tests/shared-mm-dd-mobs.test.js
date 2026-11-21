// Node test for MMDDMobs. Run: node game/tests/shared-mm-dd-mobs.test.js
const path = require('path');
const fs = require('fs');
const M = require(path.join(__dirname, '../shared/mm-dd-mobs.js'));
let passed = 0, failed = 0;
function check(name, cond) { if (cond) passed++; else { failed++; console.log('FAIL: ' + name); } }

const sweep = (seed) => { const o = []; for (let cx = 2; cx < 6; cx++) for (let cy = 0; cy < 4; cy++) for (let cz = 2; cz < 6; cz++) o.push(M.chunkSpawns(seed, cx, cy, cz)); return JSON.stringify(o); };
check('same seed + chunks give identical spawn candidates', sweep(5) === sweep(5));
check('a different seed gives different candidates', sweep(5) !== sweep(6));
const flat = [].concat(...JSON.parse(sweep(5)));
check('candidates exist, are 0..2 per chunk, and are both kinds', flat.length > 10 && flat.some((c) => c.kind === 'crawler') && flat.some((c) => c.kind === 'bat') && M.chunkSpawns(5, 3, 1, 3).length <= 2);
check('candidates sit inside their own chunk, off the seams', flat.every((c) => { const p = c.id.split('#')[0].split(',').map(Number); return c.wx >= p[0] * 16 + 1 && c.wx <= p[0] * 16 + 14 && c.wy >= p[1] * 16 + 1 && c.wy <= p[1] * 16 + 14 && c.wz >= p[2] * 16 + 1 && c.wz <= p[2] * 16 + 14; }));
check('candidate ids are unique', new Set(flat.map((c) => c.id)).size === flat.length);

const cands = Array.from({ length: 30 }, (_, i) => ({ id: 'c' + i, kind: 'bat', wx: 10 + i, wy: 0, wz: 0 }));
const ctx = { px: 0, py: 0, pz: 0, active: 0, activeIds: [], slain: [], cap: 8 };
const sel = M.select(cands, ctx);
check('select respects the 8 cap and the 9..28 distance band, nearest first', sel.length === 8 && sel.every((c) => c.wx >= 9 && c.wx <= 28) && sel[0].id === 'c0' && M.MAX_ACTIVE === 8, JSON.stringify(sel.map((c) => c.id)));
check('select leaves room for already-active creatures', M.select(cands, Object.assign({}, ctx, { active: 6 })).length === 2 && M.select(cands, Object.assign({}, ctx, { active: 8 })).length === 0);
check('select skips active and slain ids', M.select(cands, Object.assign({}, ctx, { activeIds: ['c0'], slain: new Set(['c1']) })).every((c) => c.id !== 'c0' && c.id !== 'c1'));
check('culling beyond 40 blocks only', M.shouldCull(40.5) && !M.shouldCull(39));

const kb = M.knockback(3, 4, 5);
check('knockback pushes away from the player at the given strength', Math.abs(kb.vx - 3) < 1e-9 && Math.abs(kb.vz - 4) < 1e-9 && kb.vy > 0 && Number.isFinite(M.knockback(0, 0, 5).vx));
check('melee damage grows with pick tier and is clamped', M.meleeDamage(0) === 1 && M.meleeDamage(2) > M.meleeDamage(0) && M.meleeDamage(99) === M.meleeDamage(3) && M.meleeDamage(-4) === 1);
const b1 = M.batMove(1, 2, 5, 0, 0, 3), b2 = M.batMove(1, 2, 5, 0, 0, 3);
check('bat flutter is deterministic and heads toward the player', JSON.stringify(b1) === JSON.stringify(b2) && b1.vx > 0);

const inv = { stone: 11, dirt: 5, coal: 3, iron: 2, torch: 4, pick: 1 }, before = JSON.stringify(inv);
const k = M.deathKeep(inv);
check('death keeps tools, ores, ingots and torches and loses half of loose stone/dirt (rounded down)', k.inv.stone === 6 && k.inv.dirt === 3 && k.inv.coal === 3 && k.inv.iron === 2 && k.inv.torch === 4 && k.lost.stone === 5 && k.lost.dirt === 2);
check('deathKeep never mutates its input and loses nothing from 1 block', JSON.stringify(inv) === before && Object.keys(M.deathKeep({ stone: 1 }).lost).length === 0);
check('no Math.random anywhere in the module', !/Math\.random/.test(fs.readFileSync(path.join(__dirname, '../shared/mm-dd-mobs.js'), 'utf8')));
console.log(passed + ' passed, ' + failed + ' failed');
process.exit(failed ? 1 : 0);
