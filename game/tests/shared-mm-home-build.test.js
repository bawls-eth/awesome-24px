// Pure-node tests for shared/mm-home-build.js (NEXT-SLICES-2 X7, BIOME-ARCH-PLAN B10): decor crafted from the crafting pack into the
// homestead stock, placed / picked up on the 20x20 grid (with undo), clean() of hostile input, caps, the additive home.made key surviving
// MMIsles.clean, and source hygiene (no Town build code, no network, no storage, no randomness).
// Run: node game/tests/shared-mm-home-build.test.js
const fs = require('fs');
const path = require('path');
const HB = require('../shared/mm-home-build.js');
const HS = require('../shared/mm-homestead.js');
const ISL = require('../shared/mm-isles.js');
const CRAFT = require('../shared/mm-isle-craft.js');
let failed = 0;
function check(name, cond, extra = '') { console.log((cond ? 'PASS ' : 'FAIL ') + name + (cond ? '' : ' ' + extra)); if (!cond) failed++; }
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

// ---- source hygiene ----
const src = fs.readFileSync(path.join(__dirname, '..', 'shared', 'mm-home-build.js'), 'utf8').split('\n').map((l) => l.replace(/\/\/.*$/, '')).join('\n');
check('no Math.random, Date, DOM, storage, Firebase, Town blocks / placeBlock or network', src.indexOf('Math.random') < 0 &&
  !/\bDate\b|document\.|window\.|localStorage|fetch\(|XMLHttpRequest|firebase|net\.js|placeBlock|ref\(\s*['"]blocks|BLOCK_TYPES/i.test(src));

// ---- recipe table ----
check('every recipe is a homestead decor kind, 2-3 inputs, counts 1..9', HB.IDS.length === HS.ORDER.length && HB.IDS.every((k) => {
  const r = HB.get(k), ks = Object.keys(r.in);
  return !!HS.KINDS[k] && ks.length >= 2 && ks.length <= 3 && ks.every((i) => Number.isInteger(r.in[i]) && r.in[i] >= 1 && r.in[i] <= 9) && r.out === 1;
}), HB.IDS.join(','));
check('every input is a real pack resource or drop the crafting pack keeps (MMIsleCraft.cleanInv)', HB.IDS.every((k) => Object.keys(HB.get(k).in).every((i) => CRAFT.sourcesOf(i).length >= 1 && CRAFT.cleanInv({ [i]: 1 })[i] === 1)));
check('get / name reject unknown and prototype keys', HB.get('castle') === null && HB.get('__proto__') === null && HB.get('constructor') === null && HB.get(7) === null && HB.name('x') === '');
check('the table is frozen', Object.isFrozen(HB.RECIPES) && Object.isFrozen(HB.RECIPES.fence) && Object.isFrozen(HB.RECIPES.fence.in));

// ---- craft ----
(() => {
  const home = { grid: [], stable: { slots: 12 } };
  HB.ensure(home);
  const inv0 = { wood: 5, fiber: 2, stone: 1 };
  const frozen = JSON.stringify(inv0);
  const a = HB.craft(inv0, home, 'fence');
  check('craft fence: takes wood 2 + fiber 1, adds 1 to the decor stock and to made', a.ok && same(a.inv, { wood: 3, fiber: 1, stone: 1 }) && home.inv.fence === HS.STARTER_INV.fence + 1 && home.made.fence === 1 && a.stock === home.inv.fence, JSON.stringify({ a, home }));
  check('craft never mutates the input pack', JSON.stringify(inv0) === frozen);
  const b = HB.craft(a.inv, home, 'pen');
  check('craft pen with too little: refused with the missing list, nothing used', !b.ok && b.why === 'missing' && same(b.inv, a.inv) && b.missing.find((m) => m.id === 'wood' && m.have === 3 && m.need === 4) && home.inv.pen === HS.STARTER_INV.pen, JSON.stringify(b));
  const c = HB.craft({ wood: 2, fiber: 1 }, home, 'fence');
  check('a used-up input disappears from the pack (no zero stacks)', c.ok && same(c.inv, {}) && home.made.fence === 2, JSON.stringify(c));
  check('unknown kind -> unknown', HB.craft({ wood: 9 }, home, 'castle').why === 'unknown' && HB.craft({ wood: 9 }, home, '__proto__').why === 'unknown');
  check('no home -> refused', !HB.craft({ wood: 9 }, null, 'fence').ok);
})();

// ---- place / pick up / undo through the build module ----
(() => {
  const home = { grid: [], stable: { slots: 12 } };
  HB.ensure(home);
  HB.craft({ wood: 4, fiber: 2, stone: 1 }, home, 'pen');
  const pens0 = home.inv.pen;
  const free = (x, y) => !(x === 0 && y === 0);
  const p = HB.place(home, 5, 6, 'pen', free, 1000);
  check('place a crafted pen on the grid', p.ok && same(home.grid, [[5, 6, 'pen']]) && home.inv.pen === pens0 - 1, JSON.stringify(p));
  check('place refuses a taken cell, outside the grid and blocked ground', HB.place(home, 5, 6, 'fence', free, 1000).why === 'taken' && HB.place(home, 20, 0, 'fence', free, 1000).why === 'outside' && HB.place(home, 0, 0, 'fence', free, 1000).why === 'ground');
  const f = HB.place(home, 7, 7, 'fence', free, 2000);
  const u = HB.pickUp(home, 7, 7, 3000);
  check('pick up returns the fence to stock', f.ok && u.ok && u.kind === 'fence' && HS.itemAt(home, 7, 7) === null && home.inv.fence === HS.STARTER_INV.fence, JSON.stringify(u));
  check('undo within 10 s puts the fence back; after 10 s it is refused', HB.undo(home, u.act, 9000) && HS.itemAt(home, 7, 7) === 'fence' && !HB.undo(home, p.act, 1000 + 10001));
  // round trip through the archipelago save
  const save = ISL.defaults(); save.home = home;
  const back = ISL.clean(JSON.parse(JSON.stringify(save)));
  check('home.made survives MMIsles.clean (additive key) with the grid', same(back.home.made, home.made) && same(HB.clean(back.home).grid, home.grid), JSON.stringify(back.home));
  check('an old save without made loads fine and stays without it', ISL.clean({ v: 1, home: { grid: [[1, 1, 'pen']] } }).home.made === undefined && same(HB.clean({ grid: [[1, 1, 'pen']] }).made, {}));
})();

// ---- clean: hostile input ----
(() => {
  const hostile = { grid: [[1, 1, 'pen'], [1, 1, 'fence'], [2, 2, '__proto__'], [30, 1, 'bench'], 'x'], inv: { fence: 1e9, pen: -3, __proto__: 4 },
    made: { fence: 1e9, pen: -1, castle: 3, constructor: 2, bench: 2.5, lantern: '4', flowerbed: 2 }, seeded: 'yes' };
  const c = HB.clean(hostile);
  check('clean drops junk cells, clamps stock and keeps only valid integer made counts (capped at 999)', same(c.grid, [[1, 1, 'pen']]) && c.inv.fence === 99 && c.inv.pen === 0 &&
    same(c.made, { fence: 999, flowerbed: 2 }) && c.seeded === 0, JSON.stringify(c));
  check('clean never throws on junk', [null, undefined, 7, 'x', [], true, NaN, { made: [] }, { made: 'x' }].every((v) => { try { const o = HB.clean(v); return Array.isArray(o.grid) && same(o.made, {}); } catch (e) { return false; } }));
  check('cleanMade ignores prototype keys', same(HB.cleanMade(JSON.parse('{"__proto__":{"x":1},"fence":3}')), { fence: 3 }));
  const s2 = ISL.clean({ home: { grid: [], made: { fence: 1e9, 'Bad Key': 2, __proto__: 1, pen: 0 } } });
  check('MMIsles.clean caps home.made at 999 and drops bad keys / zeros', same(s2.home.made, { fence: 999 }), JSON.stringify(s2.home));
})();

// ---- caps ----
(() => {
  const home = { grid: [], inv: { fence: 99 }, seeded: 1 };
  HB.ensure(home);
  const r = HB.craft({ wood: 9, fiber: 9 }, home, 'fence');
  check('a full stock (99) refuses the craft and keeps the pack', !r.ok && r.why === 'stock' && same(r.inv, { wood: 9, fiber: 9 }) && home.inv.fence === 99, JSON.stringify(r));
  const h2 = { grid: [], inv: {}, seeded: 1, made: { bench: 999 } };
  HB.ensure(h2);
  check('the lifetime made counter caps at 999', HB.canCraft({ wood: 9, fiber: 9 }, h2, 'bench').reason === 'made');
  // many crafts: stock never passes 99
  const h3 = { grid: [], inv: {}, seeded: 1 }; HB.ensure(h3);
  let inv = { wood: 999, fiber: 999 };
  for (let i = 0; i < 150; i++) { const x = HB.craft(inv, h3, 'fence'); if (x.ok) inv = x.inv; }
  check('150 fence crafts stop at a stock of 99 and use exactly 99 recipes', h3.inv.fence === 99 && inv.wood === 999 - 198 && inv.fiber === 999 - 99 && h3.made.fence === 99, JSON.stringify({ inv, s: h3.inv.fence }));
  const big = {}; for (let i = 0; i < 300; i++) big['k' + i] = 5; big.wood = 5; big.fiber = 5;
  const r4 = HB.craft(big, h2, 'fence');
  check('a hostile 300-stack pack is capped to 64 stacks on the way out', Object.keys(r4.inv).length <= 64, String(Object.keys(r4.inv).length));
  check('the whole archipelago save stays under the 20 KB cap with a full made table', JSON.stringify(ISL.clean({ home: { made: { flowerbed: 999, lantern: 999, bench: 999, fence: 999, birdbath: 999, pen: 999 } } })).length < ISL.MAX_BYTES);
})();

if (failed) { console.log(failed + ' failed'); process.exit(1); }
console.log('ALL PASSED');
