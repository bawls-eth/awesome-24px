// Pure tests for MMStalkMarket.advise. Run: node game/tests/stalk-advisor.test.js
const M = require('../shared/mm-stalk-market.js');
let failed = 0;
function check(name, cond, extra = '') { console.log((cond ? 'PASS ' : 'FAIL ') + name + (cond ? '' : ' ' + extra)); if (!cond) failed++; }
const known = (wk, slot) => M.knownPrices(wk, slot);

check('not ready before two sell prices, prior probabilities', (() => { const a = M.advise(known(M.generateWeek(5), 1)); return !a.ready && Math.abs(Object.values(a.probs).reduce((x, y) => x + y, 0) - 1) < 1e-9 && /need two/.test(a.text); })());
check('ready after the first two sell prices', M.advise(known(M.generateWeek(5), 2)).ready === true);
check('deterministic (same input, same output)', JSON.stringify(M.advise(known(M.generateWeek(9), 4))) === JSON.stringify(M.advise(known(M.generateWeek(9), 4))));
check('probabilities sum to 1 and are in 0..1 for 200 weeks', (() => { for (let i = 0; i < 200; i++) { const a = M.advise(known(M.generateWeek(i), 2 + (i % 8))); const v = Object.values(a.probs); if (Math.abs(v.reduce((x, y) => x + y, 0) - 1) > 0.01 || v.some((x) => x < 0 || x > 1)) return false; } return true; })());
check('wording says estimate', /estimate/i.test(M.advise(known(M.generateWeek(3), 3)).text));
check('garbage input is safe', [null, undefined, 'x', [], [0, 0, 0], [NaN, 1, 2], [100, -5, 'z']].every((g) => { const a = M.advise(g); return a && a.ready === false; }));
// narrowing: the advisor should beat the prior on average
let decTop = 0, decN = 0, allTop = 0, allN = 0;
for (let i = 0; i < 400; i++) {
  const w = M.generateWeek(1000 + i); const a = M.advise(known(w, 3));
  allN++; if (a.top === w.pattern) allTop++;
  if (w.pattern === 'decreasing') { decN++; if (a.top === 'decreasing') decTop++; }
}
check('advisor beats the 30% prior on average (top pick right > 45%)', allTop / allN > 0.45, String(allTop / allN));
check('decreasing weeks are recognised most of the time', decTop / decN > 0.7, String(decTop / decN));
check('a falling start makes decreasing more likely than the prior', M.advise([100, 90, 86, 82]).probs.decreasing > 0.25);
check('a clearly high start rules out decreasing', M.advise([100, 135, 140]).probs.decreasing < 0.05);
check('uses no Math.random', !/Math\.random/.test(require('fs').readFileSync(require.resolve('../shared/mm-stalk-market.js'), 'utf8').replace(/\/\/.*$/gm, '')));
console.log(failed ? `${failed} FAILED` : 'ALL PASSED');
process.exitCode = failed ? 1 : 0;
