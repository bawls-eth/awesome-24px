// Run: node game/tests/shared-mm-events-bounties.test.js
const B = require('../shared/mm-bounties.js');
let n = 0, bad = 0;
function check(name, ok) { n++; if (!ok) { bad++; console.log('FAIL ' + name); } }
function done() { console.log((bad ? 'FAILED ' + bad + ' of ' : 'ok ') + n + ' assertions'); process.exit(bad ? 1 : 0); }

// the mm-events module was removed in cycle 2 (L-13, D's decision: the Wilds mode never shipped); its 17 checks went with it.
const d1 = B.forDate('2026-11-19', 'x'), d2 = B.forDate('2026-11-19', 'x'), d3 = B.forDate('2026-11-20', 'x');
check('3 distinct bounties', d1.length === 3 && new Set(d1.map(x => x.id)).size === 3);
check('same date same bounties', JSON.stringify(d1) === JSON.stringify(d2));
check('next day differs', JSON.stringify(d1) !== JSON.stringify(d3));
check('fame 10-40', d1.every(x => x.reward.fame >= 10 && x.reward.fame <= 40));
const keys = JSON.stringify(d1.concat(d3)) + JSON.stringify(Object.keys(B));
check('no streak/urgency keys', !/streak|urgent|urgency|expire|deadline|penalt|timer|countdown/i.test(keys));
let st = null; const bo = d1[0];
for (let i = 0; i < bo.goal; i++) st = B.progress(bo, st, { type: bo.event });
check('progress completes', st.done && st.count === bo.goal);
const cr = B.claim(bo, st);
check('claim once', cr && cr.reward.petTreat === 1 && B.claim(bo, cr.state) === null);
done();
