// Run: node game/tests/shared-mm-events-bounties.test.js
const E = require('../shared/mm-events.js');
const B = require('../shared/mm-bounties.js');
let n = 0, bad = 0;
function check(name, ok) { n++; if (!ok) { bad++; console.log('FAIL ' + name); } }
function done() { console.log((bad ? 'FAILED ' + bad + ' of ' : 'ok ') + n + ' assertions'); process.exit(bad ? 1 : 0); }

let spacingOk = true, textOk = true;
for (let seed = 1; seed <= 300; seed++) {
  const s = E.create(seed);
  let prev = 0;
  for (let i = 0; i < 12; i++) {
    const ev = s.event(i), gap = ev.at - prev; prev = ev.at;
    if (gap < 180 - 1e-9 || gap > 300 + 1e-9) spacingOk = false;
    if (!ev.banner || !ev.mazewright || ev.mazewright.indexOf('Mazewright') < 0) textOk = false;
  }
}
check('spacing 3-5 min over 300 seeds', spacingOk);
check('banner + Mazewright line present', textOk);
const a = E.create(42), b = E.create(42), c = E.create(43);
check('deterministic', JSON.stringify(a.event(5)) === JSON.stringify(b.event(5)));
check('different seed differs', a.event(0).at !== c.event(0).at);
check('next(t) returns first event at/after t', a.next(0).index === 0 && a.next(a.event(2).at - 1).index === 2);
const h = E.hollowstump();
check('Hollowstump 3 phases', h.phases.length === 3);
check('Hollowstump 45 s portal', h.portalSec === 45);
check('Hollowstump guaranteed Brown bag', h.drops.guaranteed[0].bag === 'brown');
const d = E.drownedBell();
check('Bell two rings 0.3 s apart', d.phases[0].patterns[1].delaySec - d.phases[0].patterns[0].delaySec === 0.3);
check('Bell wallGap from 2 sides', d.phases[1].patterns[0].type === 'wallGap' && d.phases[1].patterns[0].sides === 2);
check('Bell phase 3 homing', d.phases[2].patterns.some(p => p.type === 'homing'));

let cl = E.closingCreate(9);
for (let i = 0; i < 5; i++) cl = E.closingEventCleared(cl, 100 + i);
check('no countdown after 5 events', cl.phase === 'open');
cl = E.closingEventCleared(cl, 500);
check('countdown starts after 6th', cl.phase === 'countdown' && E.closingRemaining(cl, 500) === 60);
check('Enough shout', /Enough/.test(cl.shout));
let r = E.closingTick(cl, 540, [{ id: 'a' }]);
check('no pull before 60 s', r.pulled.length === 0 && r.state.phase === 'countdown');
r = E.closingTick(cl, 560, [{ id: 'a', inDungeon: false }, { id: 'b', inDungeon: true }]);
check('dungeon hero not pulled', r.pulled.length === 1 && r.pulled[0] === 'a');
check('new seed issued, reset', r.state.seed !== 9 && r.state.phase === 'open' && r.state.cleared === 0);

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
