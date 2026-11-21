// Tests for shared/mm-stalk-market.js. Run: node game/tests/shared-mm-stalk-market.test.js
const M = require('../shared/mm-stalk-market.js');
let failed = 0;
function check(name, cond, extra = '') { console.log((cond ? 'PASS ' : 'FAIL ') + name + (cond ? '' : ' ' + extra)); if (!cond) failed++; }

check('play money only, no real money / loot', M.CURRENCY.realMoney === false && M.CURRENCY.purchasable === false && M.CURRENCY.randomRewards === false && Object.isFrozen(M.CURRENCY));
check('same seed same week', JSON.stringify(M.generateWeek(7)) === JSON.stringify(M.generateWeek(7)));
check('different seeds differ', JSON.stringify(M.generateWeek(7)) !== JSON.stringify(M.generateWeek(8)));
const seen = {}; let bounds = true, len = true;
for (let i = 0; i < 600; i++) {
  const w = M.generateWeek(i); seen[w.pattern] = (seen[w.pattern] || 0) + 1;
  len = len && w.sell.length === 12;
  const b = w.buyPrice;
  if (b < 90 || b > 110) bounds = false;
  const mx = Math.max.apply(null, w.sell), mn = Math.min.apply(null, w.sell);
  if (mn < 1 || mn < Math.floor(0.3 * b) - 1) bounds = false;
  if (w.pattern === 'decreasing' && (mx > Math.round(0.9 * b) + 1 || w.sell.some((p, k) => k && p > w.sell[k - 1] + 1))) bounds = false;
  if (w.pattern === 'random' && mx > Math.round(1.4 * b) + 1) bounds = false;
  if (w.pattern === 'smallSpike' && (mx > Math.round(2.0 * b) + 1 || mx < Math.round(1.4 * b) - 1)) bounds = false;
  if (w.pattern === 'largeSpike' && (mx > 6 * b + 1 || mx < Math.round(2.0 * b) - 1)) bounds = false;
}
check('all four pattern families appear', M.PATTERNS.every((p) => seen[p] > 20), JSON.stringify(seen));
check('12 sell prices, buy 90..110, per-pattern bounds hold', len && bounds);

const wk = M.generateWeek(42);
check('Sunday slot returns the buy price', M.priceAt(wk, 0) === wk.buyPrice);
check('knownPrices reveals only up to the current slot', M.knownPrices(wk, 0).length === 1 && M.knownPrices(wk, 5).length === 6 && M.knownPrices(wk, 99).length === 13);
check('slot out of range is clamped', M.priceAt(wk, -3) === wk.buyPrice && M.priceAt(wk, 99) === wk.sell[11] && M.clampSlot('x') === 0);
const sun = new Date(2026, 10, 15, 23, 59), mon = new Date(2026, 10, 16, 8), monpm = new Date(2026, 10, 16, 12), sat = new Date(2026, 10, 21, 18);
check('Sunday all day is slot 0', M.slotOf(sun) === 0 && M.slotOf(new Date(2026, 10, 15, 0, 0)) === 0);
check('Mon AM 1, Mon PM 2 (twice a day), Sat PM 12', M.slotOf(mon) === 1 && M.slotOf(monpm) === 2 && M.slotOf(sat) === 12);
check('price changes only at 12:00 and midnight', M.slotOf(new Date(2026, 10, 17, 11, 59)) === 3 && M.slotOf(new Date(2026, 10, 17, 12, 0)) === 4 && M.slotOf(new Date(2026, 10, 17, 0, 0)) === 3);
check('slot labels', M.slotLabel(0) === 'Sunday' && M.slotLabel(1) === 'Mon AM' && M.slotLabel(12) === 'Sat PM');

check('week number shared across a calendar week, +1 next Sunday', M.weekNumber(sun) === M.weekNumber(new Date(2026, 10, 15, 0, 1)) && M.weekNumber(sat) === M.weekNumber(sun) && M.weekNumber(new Date(2026, 10, 22)) === M.weekNumber(sun) + 1);
check('week number is an integer', Number.isInteger(M.weekNumber()));
check('?week override clamps to an integer', M.clampWeek('12.9') === 12 && M.clampWeek('-5') === 0 && M.clampWeek('1e12') === 1000000 && M.clampWeek('abc') === null && M.clampWeek('') === null && M.clampWeek(null) === null);

let s = M.syncWeek(M.defaultSave(), 100).save;
const r = M.buy(s, wk, 0, 10);
check('buy on Sunday deducts cost and adds stalks', r.ok && r.save.balance === 2000 - 10 * wk.buyPrice && r.save.holdings === 10 && r.save.invested === 10 * wk.buyPrice);
check('input save is not mutated', s.holdings === 0 && s.balance === 2000);
check('cannot buy Mon-Sat', !M.buy(s, wk, 3, 1).ok && M.buy(s, wk, 3, 1).reason === 'sunday-only');
check('cannot sell on Sunday', !M.sell(r.save, wk, 0, 1).ok);
check('cannot buy more than funds', M.buy(s, wk, 0, 200).reason === 'funds' && M.maxBuy(s, wk) === Math.floor(2000 / wk.buyPrice));
check('inventory limit', (() => { const rich = Object.assign(M.defaultSave(), { week: 1, balance: 99999999, holdings: 195 }); return M.buy(rich, wk, 0, 6).reason === 'limit' && M.buy(rich, wk, 0, 5).ok && M.maxBuy(rich, wk) === 5; })());
check('zero / negative / NaN quantity rejected', !M.buy(s, wk, 0, 0).ok && !M.buy(s, wk, 0, -2).ok && !M.buy(s, wk, 0, NaN).ok && !M.sell(r.save, wk, 4, 0).ok);
const sold = M.sell(r.save, wk, 4, 4);
check('sell pays slot price and tracks earnings', sold.ok && sold.gain === 4 * M.priceAt(wk, 4) && sold.save.holdings === 6 && sold.save.earned === sold.gain);
check('cannot sell more than owned', M.sell(r.save, wk, 4, 11).reason === 'holdings');
check('profit = earned - invested', M.weekProfit(sold.save) === sold.gain - 10 * wk.buyPrice);

const held = M.buy(M.syncWeek(M.defaultSave(), 100).save, wk, 0, 10).save;
const same = M.syncWeek(held, 100);
check('same week keeps holdings', !same.rolled && same.save.holdings === 10);
const next = M.syncWeek(held, 101);
check('next week: stalks spoil, week advances', next.rolled && next.spoiled === 10 && next.save.holdings === 0 && next.save.week === 101 && next.save.invested === 0);
check('spoiled stalks count as a loss in history', next.save.history.length === 1 && next.save.history[0].profit === -10 * wk.buyPrice && next.save.history[0].week === 100);
check('previous pattern is revealed', next.save.last.pattern === M.generateWeek(100).pattern && next.save.last.week === 100);
check('first run does not create history', M.syncWeek(M.defaultSave(), 5).save.history.length === 0 && M.syncWeek(M.defaultSave(), 5).spoiled === 0);
check('going back to an earlier week also resets', M.syncWeek(held, 50).save.holdings === 0);
check('allowance floor when nearly broke', M.syncWeek(M.cleanSave({ week: 3, balance: 5 }), 4).save.balance === M.ALLOWANCE_FLOOR);
check('big week earns medals and best', (() => { const y = M.syncWeek(M.cleanSave({ week: 9, invested: 1000, earned: 12000, balance: 5000 }), 10).save; return y.best === 11000 && y.medals.bronze && y.medals.silver && y.medals.gold; })());
check('medal thresholds and ranks', M.medalFor(499) === 'none' && M.medalFor(500) === 'bronze' && M.medalFor(2000) === 'silver' && M.medalFor(10000) === 'gold' && M.rankFor(0) === 'Sprout Seller' && M.rankFor(2000) === 'Sharp Trader' && M.rankFor(10000) === 'Stalk Sage');
check('history is capped', (() => { let x = M.defaultSave(); for (let i = 0; i < 30; i++) { x = M.syncWeek(x, i).save; x.invested = 100; x = M.syncWeek(x, i + 1000).save; } return x.history.length <= 12 && x.history.length > 0; })());

const bad = [null, undefined, 5, 'x', [], { balance: 'NaN', holdings: -4, week: 'q' }];
check('corrupt saves give safe defaults', bad.every((b) => { const c = M.cleanSave(b); return c.balance === 2000 && c.holdings === 0 && c.week === -1 && c.history.length === 0; }));
const h = M.cleanSave({ balance: 1e30, holdings: 5000, week: 5.7, invested: -3, earned: 'z', best: -9, history: [{ week: 1, pattern: 'evil', profit: 3 }, { week: 'x', pattern: 'random', profit: 1e99 }, 7], medals: { gold: 'yes', silver: true }, junk: 1, hint: 'yes', last: { pattern: '<img>' } });
check('hostile fields clamped', h.balance === 99999999 && h.holdings === 200 && h.week === 5 && h.invested === 0 && h.earned === 0 && h.best === 0 && h.history.length === 1 && h.history[0].pattern === 'random' && h.history[0].profit === 99999999 && h.medals.gold === false && h.medals.silver === true && !('junk' in h) && h.hint === false && h.last === null, JSON.stringify(h));
check('no week means no holdings', M.cleanSave({ week: -1, holdings: 9 }).holdings === 0);
check('every pattern has a name and hint', M.PATTERNS.every((p) => M.PATTERN_NAMES[p] && M.PATTERN_HINTS[p]));
function PATTERN_SUM(a) { return Math.abs(Object.values(a.probs).reduce((x, y) => x + y, 0) - 1) < 0.01; }
check('advise is exported, pure and bounded', typeof M.advise === 'function' && (() => { const a = M.advise(M.knownPrices(M.generateWeek(11), 3)); return a.ready && PATTERN_SUM(a) && /estimate/.test(a.text); })());
check('goals: three defined, break-even needs a sale and an empty stall', (() => { const w = M.generateWeek(100); let x = M.syncWeek(M.defaultSave(), 100).save; const open = (z) => M.goalStatus(z, w).filter((g) => !g.done).length; return M.GOALS.length === 3 && open(x) === 3 && open(M.buy(x, w, 0, 5).save) === 3; })());
check('goals: profit goal at 500', (() => { const w = M.generateWeek(100); const x = Object.assign(M.syncWeek(M.defaultSave(), 100).save, { invested: 100, earned: 600 }); return M.goalStatus(x, w).find((g) => g.id === 'profit').done; })());
check('lifetime stats and goal fields clamp', (() => { const c = M.cleanSave({ week: 3, goals: 99, wkBest: 1e9, total: 1e99, played: -3 }); return c.goals === 7 && c.wkBest === M.MAX_PRICE && c.total === 99999999 && c.played === 0 && M.lifetime(c).played === 0; })());
check('neighbours: 3 offline NPCs, bounded prices, fixed fee', M.NEIGHBOURS.length === 3 && M.NEIGHBOUR_FEE > 0 && M.NEIGHBOURS.every((n) => M.neighbourWeek(n.id, 7).sell.every((v) => v >= 1 && v <= M.MAX_PRICE)));
check('neighbours: sale nets price*qty minus fee', (() => { const w = M.generateWeek(100); const x = M.buy(M.syncWeek(M.defaultSave(), 100).save, w, 0, 5).save; const r = M.sellToNeighbour(x, 'pip', 100, 3, 5); return r.ok && r.gain === 5 * M.neighbourPrice('pip', 100, 3) - M.NEIGHBOUR_FEE; })());
console.log(failed ? `${failed} FAILED` : 'ALL PASSED');
process.exitCode = failed ? 1 : 0;
