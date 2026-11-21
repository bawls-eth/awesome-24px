// Unit tests for shared/mm-angler-boss.js (lair gate, surge schedule, strain step, hall entry, save keys).
// Run: node game/tests/shared-mm-angler-boss.test.js
const fs = require('fs');
const A = require('../shared/mm-angler.js');
const B = require('../shared/mm-angler-boss.js');
let failed = 0;
function check(name, cond, extra = '') { console.log((cond ? 'PASS ' : 'FAIL ') + name + (cond ? '' : ' ' + extra)); if (!cond) failed++; }
const done = () => { console.log(failed ? `${failed} FAILED` : 'ALL PASSED'); process.exitCode = failed ? 1 : 0; };
const IDS = Object.keys(A.BOSSES);

check('three bosses', IDS.length === 3);
check('gate is 3..5 and stable per boss', IDS.every((id) => { const n = B.gateFor(id); return n >= 3 && n <= 5 && n === B.gateFor(id); }));
check('gate for a normal fish is 0', B.gateFor('minnow') === 0 && !B.gateOpen(null, 'minnow'));
check('every boss has an intro line', IDS.every((id) => typeof B.INTRO[id] === 'string' && B.INTRO[id].length > 10));

// schedule
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
check('schedule is deterministic per boss + seed', IDS.every((id) => same(B.schedule(id, 42), B.schedule(id, 42))));
check('schedule differs by boss and by seed', !same(B.schedule('old_whiskers', 1), B.schedule('pier_kraken', 1)) && !same(B.schedule('old_whiskers', 1), B.schedule('old_whiskers', 2)));
check('windows are sorted, spaced, bounded and long enough to react', IDS.every((id) => [1, 7, 99, 123456].every((sd) => {
  const s = B.schedule(id, sd);
  return s.length >= 3 && s[0].start >= B.CFG.firstAt && s.every((w, i) => w.end - w.start >= B.CFG.minDur - 1e-9 && w.end - w.start <= B.CFG.maxDur + 1e-9 && w.end <= B.CFG.len && (i === 0 || w.start - s[i - 1].end >= B.CFG.minGap - 1e-9));
})));
{
  const s = B.schedule('old_whiskers', 5), w = s[0];
  check('phaseAt: calm, warn, surge, calm again', B.phaseAt(s, 0) === 'calm' && B.phaseAt(s, w.start - 0.3) === 'warn' && B.phaseAt(s, w.start + 0.1) === 'surge' && B.phaseAt(s, w.end + 0.01) !== 'surge');
  check('phaseAt wraps every CFG.len seconds', B.phaseAt(s, w.start + 0.1 + B.CFG.len) === 'surge');
}

// strain
{
  let st = 0, snapped = false;
  for (let i = 0; i < 100 && !snapped; i++) { const r = B.tensionStep(st, 0.05, true, true); st = r.strain; snapped = r.snapped; }
  check('holding through a surge snaps the line', snapped && st === 1);
  const mid = B.tensionStep(0, 0.5, true, true).strain;
  check('easing off recovers strain', B.tensionStep(mid, 0.5, false, true).strain < mid);
  check('holding outside a surge never builds strain', B.tensionStep(0.4, 1, true, false).strain < 0.4);
  check('a reaction-time ease-off (0.6 s into a surge) survives', (() => { let s = 0; for (let i = 0; i < 12; i++) s = B.tensionStep(s, 0.05, true, true).strain; return !B.tensionStep(s, 0.05, false, true).snapped && s < 1; })());
  check('bad input is clamped', B.tensionStep(NaN, 0.1, true, true).strain >= 0 && B.tensionStep(5, 0, false, false).strain === 1);
}

// lair gate + journal
{
  let j = A.journal.cleanFull(null);
  const need = B.gateFor('old_whiskers');
  check('gate closed at start', !B.gateOpen(j, 'old_whiskers') && B.lairCount(j, 'west') === 0);
  for (let i = 0; i < need - 1; i++) j = B.noteCatch(j, 'minnow', 'west');
  check('gate still closed one catch short', !B.gateOpen(j, 'old_whiskers'));
  j = B.noteCatch(j, 'minnow', 'west');
  check('gate opens after N normal catches', B.gateOpen(j, 'old_whiskers'));
  check('catches at another spot or a boss do not count', B.lairCount(B.noteCatch(B.noteCatch(null, 'minnow', 'east'), 'old_whiskers', 'west'), 'west') === 0);
  j = B.resetLair(j, 'west');
  check('lair goes quiet after the boss appears', !B.gateOpen(j, 'old_whiskers'));
  check('lair count is capped', B.lairCount(Array.from({ length: 150 }).reduce((a) => B.noteCatch(a, 'minnow', 'west'), A.journal.cleanFull(null)), 'west') === B.CFG.lairCap);
}

// hall
{
  let j = B.addHall(null, 'old_whiskers', 120, '2026-07-15');
  check('hall entry stores size and date', same(B.hallEntry(j, 'old_whiskers'), { size: 120, date: '2026-07-15' }));
  j = B.addHall(j, 'old_whiskers', 100, '2026-08-01');
  check('a smaller later catch keeps the record', B.hallEntry(j, 'old_whiskers').size === 120);
  j = B.addHall(j, 'old_whiskers', 130, '2026-08-02');
  check('a bigger catch replaces it', B.hallEntry(j, 'old_whiskers').date === '2026-08-02');
  check('bad boss / bad date are refused', B.hallEntry(B.addHall(null, 'minnow', 5, '2026-07-15'), 'minnow') === null && B.hallEntry(B.addHall(null, 'pier_kraken', 5, '<b>x</b>'), 'pier_kraken') === null && B.hallEntry(B.addHall(null, 'pier_kraken', 5, '2026-13-40'), 'pier_kraken') === null);
  check('survives serialize round trip', same(B.hallEntry(A.journal.serialize(j), 'old_whiskers'), { size: 130, date: '2026-08-02' }));
}

// save compat
check('plain save keeps the old key set', Object.keys(A.clean(null)).sort().join() === 'bait,bosses,caught,gear,trophies');
check('corrupt lair/hall fall back to defaults', [
  { lair: 5, hall: 'x' }, { lair: [1], hall: [1] }, { lair: { west: 'zz', nope: 3 }, hall: { old_whiskers: { size: 'a', date: 'bad' }, minnow: { size: 1, date: '2026-01-01' } } }, { hall: { old_whiskers: null } },
].every((raw) => { const c = A.journal.cleanFull(raw); return Object.keys(c.lair).length === 0 && Object.keys(c.hall).length === 0; }));
check('hall size clamped and lair clamped', (() => { const c = A.journal.cleanFull({ lair: { west: 5000 }, hall: { pier_kraken: { size: 999999, date: '2026-02-03' } } }); return c.lair.west === 99 && c.hall.pier_kraken.size === 9999; })());
check('boss fillMult slows the catch meter only for bosses', (() => {
  const run = (id, m) => { const r = A.reel.create(id, 'golden', { seed: 1, fillMult: m }); r.pos = 0.5; r.tick(0.1, false); return r.meter; };
  return run('koi', 0.6) === run('koi', 1);
})());
check('no Math.random in the boss module', !/Math\.random/.test(fs.readFileSync(require.resolve('../shared/mm-angler-boss.js'), 'utf8')));
done();
