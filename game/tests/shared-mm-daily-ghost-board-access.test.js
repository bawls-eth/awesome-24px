const D = require('../shared/mm-daily.js'), G = require('../shared/mm-ghost.js'),
  A = require('../shared/mm-access.js'), T = require('../shared/mm-tutorial.js');
let fails = 0, n = 0;
function check(name, cond) { n++; if (!cond) { fails++; console.log('FAIL ' + name); } else console.log('ok   ' + name); }
function done() { console.log(n + ' checks, ' + fails + ' failed'); process.exit(fails ? 1 : 0); }

// daily
check('seed same date', D.seedFor('2026-11-19') === D.seedFor('2026-11-19'));
check('seed next day differs', D.seedFor('2026-11-19') !== D.seedFor('2026-11-20'));
let r = D.recordBest({}, 'd', 90000); r = D.recordBest(r.records, 'd', 80000);
check('best keeps lowest', r.best === 80000 && r.improved);
r = D.recordBest(r.records, 'd', 95000);
check('slower not kept', r.best === 80000 && !r.improved);
check('rejects non-numbers', D.recordBest({}, 'd', 'fast').best === null && D.recordBest({}, 'd', NaN).improved === false);
check('stroll has no Hedge Tide', D.modeOptions('stroll').hedgeTide === false && D.modeOptions('daily').hedgeTide === true);

// ghost
const rec = G.recorder(); let acc = 0;
for (let t = 0; t < 600000; t += 16) if (rec.tick(t, t / 10, Math.sin(t / 1000) * 100)) acc++;
check('4 Hz sampling', acc > 2300 && acc <= 2400);
check('payload <= 3KB', rec.finish(600000).length <= 3072);
const dec = G.decode(G.encode({ timeMs: 70000, points: [[0, 0], [5, -3], [12, 4], [-7, 9]] }));
check('round trip', dec.timeMs === 70000 && JSON.stringify(dec.points) === '[[0,0],[5,-3],[12,4],[-7,9]]');
check('decode garbage', G.decode('zzz') === null && G.decode(null) === null && G.decode('g1|1|x|1,2,3') === null && G.encode(42) === null);
const top = G.topN([{ timeMs: 90 }, { timeMs: 'x' }, null, { timeMs: 50 }, { timeMs: 70 }, { timeMs: 60 }], 3);
check('topN best 3', top.map((g) => g.timeMs).join() === '50,60,70' && G.topN('bad', 3).length === 0);

// board: the mm-board module was removed in cycle 2 (L-13, D's decision: no leaderboard write path is planned); its 7 checks went with it.
{
  // access
  check('palette presets', ['normal', 'deuteranopia', 'protanopia', 'tritanopia'].every((k) => A.PALETTES[k]));
  check('min contrast all palettes', A.names().every((k) => A.passesContrast(k)));
  check('2px bullet outline', A.palette('protanopia').bulletOutline === true && A.palette('x').outlinePx === 2);
  const k = { shoot: 'Space', dodge: 'Shift' };
  const m1 = A.remap(k, 'shoot', 'KeyZ'), m2 = A.remap(k, 'shoot', 'Shift');
  check('remap rebinds', m1.ok && m1.keys.shoot === 'KeyZ' && k.shoot === 'Space');
  check('remap conflict', !m2.ok && m2.conflict === 'dodge');

  // tutorial
  check('new profile only', T.start({}) !== null && T.start({ tutorialDone: true }) === null && T.start({ runs: 3 }) === null);
  let s = T.start({}), rewards = 0;
  for (const ev of ['moved', 'shot', 'dodged', 'pickedUp', 'continue']) { const o = T.advance(s, ev); s = o.state; if (o.reward) rewards++; }
  check('steps to finish, reward once', s.done && rewards === 1);
  check('no second reward', T.skip(s).reward === null && T.advance(s, 'moved').reward === null);
  const sk = T.skip(T.start({}));
  check('skip works and rewards once', sk.state.done && sk.state.skipped && sk.reward.item === 'life-potion');
  check('wrong event ignored', T.advance(T.start({}), 'shot').state.name === 'move');
  done();
}
