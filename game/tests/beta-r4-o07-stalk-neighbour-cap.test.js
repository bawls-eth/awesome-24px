// Round 4 (D1), O-07 (b11-04, b11-13): a Stalk neighbour paid up to 204 while the stall paid 122 on the same half-day, so neighbours were a
// free max-of-4 sell. Owner default (ROUND4.md): a neighbour offer is capped at the stall price +15%. Run: node game/tests/beta-r4-o07-stalk-neighbour-cap.test.js
const M = require('../shared/mm-stalk-market.js');
let failed = 0;
function check(name, cond, extra = '') { console.log((cond ? 'PASS ' : 'FAIL ') + name + (cond ? '' : ' ' + extra)); if (!cond) failed++; }
const stall = (w, s) => M.generateWeek(w).sell[s - 1];
let worst = null, over = 0, n = 0;
for (let w = 0; w < 400; w++) for (let s = 1; s <= 12; s++) for (const nb of M.NEIGHBOURS) {
  const p = M.neighbourPrice(nb.id, w, s), cap = Math.floor(stall(w, s) * 1.15); n++;
  if (p > cap) { over++; if (!worst || p - cap > worst.d) worst = { w, s, id: nb.id, p, stall: stall(w, s), d: p - cap }; }
}
check('over 400 weeks every neighbour offer is <= stall price * 1.15', over === 0, JSON.stringify({ over, n, worst }));
check("the tester's half-day (week 2900, slot 8): Maple no longer pays far above the stall", M.neighbourPrice('maple', 2900, 8) <= Math.floor(stall(2900, 8) * 1.15), JSON.stringify({ maple: M.neighbourPrice('maple', 2900, 8), stall: stall(2900, 8) }));
check('neighbours can still beat the stall sometimes (a trade-off, not useless)', (() => { for (let w = 0; w < 100; w++) for (let s = 1; s <= 12; s++) if (M.NEIGHBOURS.some((nb) => M.neighbourPrice(nb.id, w, s) - M.NEIGHBOUR_FEE / 20 > stall(w, s))) return true; return false; })());
check('Sunday still pays 0 and prices stay >= 1 Mon-Sat', M.neighbourPrice('pip', 10, 0) === 0 && M.NEIGHBOURS.every((nb) => M.neighbourPrice(nb.id, 10, 3) >= 1));
check('a sale to a neighbour pays the capped price', (() => { const w = 2900; const base = M.buy(M.syncWeek(M.defaultSave(), w).save, M.generateWeek(w), 0, 20).save; const r = M.sellToNeighbour(base, 'maple', w, 8, 20); return r.ok && r.price === M.neighbourPrice('maple', w, 8) && r.price <= Math.floor(stall(w, 8) * 1.15); })());
console.log(failed ? failed + ' FAILED' : 'ALL PASSED');
process.exit(failed ? 1 : 0);
