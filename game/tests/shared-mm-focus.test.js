// Unit tests for shared/mm-focus.js (MMFocus). Run: node game/tests/shared-mm-focus.test.js
const F = require('../shared/mm-focus.js');
let failed = 0;
function check(name, cond, extra = '') { console.log((cond ? 'PASS ' : 'FAIL ') + name + (cond ? '' : ' ' + extra)); if (!cond) failed++; }

const a = F.create('knight', 1);
check('level 1 max is 100 and starts full', a.max === 100 && a.cur === 100);
check('+5 max per level', F.create('knight', 5).max === 120 && F.create('mage', 11).max === 150);
check('max caps at 200', F.create('knight', 21).max === 200 && F.create('knight', 99).max === 200 && F.create('knight', 100000).max === 200);
check('base regen is 6/s', a.regen === 6);
check('wit raises regen', F.create('mage', 1, 10).regen > 6 && F.create('mage', 1, 10).regen < 8);
check('hostile level/wit fall back', F.create('x', NaN).max === 100 && F.create('x', -5).max === 100 && F.create(null, 'zz', 'q').regen === 6);

check('costs match the table', F.cost('dash') === 0 && F.cost('nova') === 25 && F.cost('shield') === 30 && F.cost('overdrive') === 40 && F.cost('signature') === 40);
const s1 = F.spend(a, 'nova');
check('spend returns a copy with cost removed', s1.ok && s1.state.cur === 75 && a.cur === 100 && s1.state !== a);
check('dash is free and always ok', F.spend({ max: 100, cur: 0, regen: 6 }, 'dash').ok === true);
const low = { max: 100, cur: 24, regen: 6 };
const r = F.spend(low, 'nova');
check('refuses when short and leaves focus unchanged', !r.ok && r.reason === 'short' && r.state.cur === 24 && low.cur === 24);
check('exact amount is enough', F.spend({ max: 100, cur: 40, regen: 6 }, 'signature').state.cur === 0);
check('unknown ability refused', !F.spend(a, 'bogus').ok && !F.spend(a, '__proto__').ok && !F.spend(a, 7).ok);

const empty = { max: 100, cur: 0, regen: 6 };
check('focus orb restores 15', F.restore(empty, 'focus').cur === 15);
check('focus potion restores 50% of max', F.restore(empty, 'potion_focus').cur === 50 && F.restore({ max: 160, cur: 0, regen: 6 }, 'potion_focus').cur === 80);
check('restore never exceeds max', F.restore({ max: 100, cur: 95, regen: 6 }, 'focus').cur === 100 && F.restore({ max: 100, cur: 80, regen: 6 }, 'potion_focus').cur === 100);
check('unknown restore kind changes nothing', F.restore(empty, 'zzz').cur === 0);
check('restore does not mutate input', empty.cur === 0);

const t = F.tick(empty, 2);
check('tick regens 6/s and caps at max', t.cur === 12 && F.tick({ max: 100, cur: 99, regen: 6 }, 10).cur === 100 && empty.cur === 0);
check('tick ignores negative/NaN dt', F.tick(empty, -3).cur === 0 && F.tick(empty, NaN).cur === 0);

const hostile = [null, undefined, 5, 'x', [], {}, { cur: 'a', max: NaN }, { cur: Infinity, max: Infinity }, { cur: -50, max: -1 }];
let safe = true;
for (const h of hostile) {
  try {
    for (const out of [F.spend(h, 'nova').state, F.restore(h, 'focus'), F.tick(h, 1)]) {
      if (!(out.cur >= 0 && out.cur <= out.max && out.max <= 200 && isFinite(out.cur))) safe = false;
    }
  } catch (e) { safe = false; }
}
check('hostile state never throws and stays in bounds', safe);
check('deterministic', JSON.stringify(F.spend(a, 'shield')) === JSON.stringify(F.spend(a, 'shield')) && JSON.stringify(F.create('k', 7, 3)) === JSON.stringify(F.create('k', 7, 3)));

console.log(failed ? `${failed} FAILED` : 'ALL PASSED');
process.exitCode = failed ? 1 : 0;
