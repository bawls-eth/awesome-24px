// Tests for shared/mm-jam.js, mm-stalk.js, mm-bugs.js. Run: node game/tests/shared-mm-festival.test.js
const MMJam = require('../shared/mm-jam.js');
const MMStalk = require('../shared/mm-stalk.js');
const MMBugs = require('../shared/mm-bugs.js');
let failed = 0;
function check(name, cond, extra = '') { console.log((cond ? 'PASS ' : 'FAIL ') + name + (cond ? '' : ' ' + extra)); if (!cond) failed++; }
const done = () => { console.log(failed ? `${failed} FAILED` : 'ALL PASSED'); process.exitCode = failed ? 1 : 0; };

// --- Jam
check('judge +-40 perfect', MMJam.judge(40) === 'perfect' && MMJam.judge(-40) === 'perfect');
check('judge 41..80 great', MMJam.judge(41) === 'great' && MMJam.judge(80) === 'great');
check('judge 81..130 good', MMJam.judge(81) === 'good' && MMJam.judge(130) === 'good');
check('judge 140 / beyond is miss', MMJam.judge(140) === 'miss' && MMJam.judge(-200) === 'miss');
check('expired only beyond +140 late', !MMJam.expired(1000, 1140) && MMJam.expired(1000, 1141));
{
  let now = 0;
  const chart = { notes: [{ t: 1000, lane: 'D' }, { t: 1500, lane: 'F', hold: 400 }, { t: 2000, lane: 'J' }] };
  const run = MMJam.createRun(chart, { clock: () => now });
  now = 1030; const a = run.press('D');
  now = 1500; const b = run.press('F');
  now = 1950; const rel = run.release('F');
  now = 2200; run.update();
  const res = run.result();
  check('run judges against injected clock', a === 'perfect' && b === 'perfect' && rel === 'held');
  check('unhit note becomes miss, combo kept as max', res.counts.miss === 1 && res.maxCombo === 2);
  const all = MMJam.createRun(chart, { clock: () => now });
  for (const n of chart.notes) { now = n.t; all.press(n.lane); if (n.hold) { now = n.t + n.hold; all.release(n.lane); } }
  check('S rank at >= 95%', all.result().rank === 'S' && MMJam.rankFor(0.95) === 'S' && MMJam.rankFor(0.949) === 'A');
}
{
  const now = 1100; // player runs 100 ms late; offset 100 corrects it
  const run = MMJam.createRun({ notes: [{ t: 1000, lane: 'K' }] }, { clock: () => now, offset: 100 });
  check('calibration offset applied', run.press('K') === 'perfect');
  check('calibration helper takes median and clamps', MMJam.calibrationOffset([90, 100, 110, 500]) === 105 && MMJam.calibrationOffset([900]) === 200 && MMJam.calibrationOffset([]) === 0);
}
for (const diff of Object.keys(MMJam.DIFFS)) {
  const c = MMJam.generateChart('song-1', diff, 1);
  const l = MMJam.lint(c);
  check(`chart ${diff} lints ok and is non-empty`, l.ok && c.notes.length > 8, JSON.stringify(l.errors));
  const maxRate = Math.max(...c.notes.slice(1).map((n, i) => 1000 / (n.t - c.notes[i].t)));
  check(`chart ${diff} respects density cap`, maxRate <= MMJam.DIFFS[diff].cap + 0.01, String(maxRate));
}
check('generateChart is deterministic', JSON.stringify(MMJam.generateChart('x', 'hard', 0.7)) === JSON.stringify(MMJam.generateChart('x', 'hard', 0.7)));
{
  const c = MMJam.generateChart('y', 'normal', 1);
  const bad = Object.assign({}, c, { notes: c.notes.slice().reverse() });
  check('lint flags unsorted beats', !MMJam.lint(bad).ok);
  check('lint flags length/count mismatch', !MMJam.lint(Object.assign({}, c, { count: c.count + 1 })).ok && !MMJam.lint(Object.assign({}, c, { lengthMs: 10 })).ok);
}

// --- Stalk
check('same seed same week', JSON.stringify(MMStalk.week('abc')) === JSON.stringify(MMStalk.week('abc')));
{
  const seen = new Set(); let lenOk = true, big = false;
  for (let i = 0; i < 400; i++) {
    const w = MMStalk.week('s' + i); seen.add(w.pattern); lenOk = lenOk && w.prices.length === 14;
    if (w.pattern === 'largeSpike' && Math.max(...w.prices) >= 3 * w.buyPrice) big = true;
  }
  check('all 4 patterns appear over 400 seeds', seen.size === 4, [...seen].join());
  check('weeks have 14 half-day prices', lenOk);
  check('a large spike can reach 3x', big);
}
{
  const b = { qty: 5, boughtDay: 0 };
  check('turnips rot after 7 days', !MMStalk.isRotten(b, 6, false) && MMStalk.isRotten(b, 7, false));
  check('cellar upgrade adds 2 days', !MMStalk.isRotten(b, 8, true) && MMStalk.isRotten(b, 9, true));
  check('quick day is 2 minutes', MMStalk.clockState('quick', { elapsedMs: 119999 }).day === 0 && MMStalk.clockState('quick', { elapsedMs: 120000 }).day === 1);
  const cs = MMStalk.clockState('slow', { date: new Date(2026, 10, 16, 15) }); // Monday 3pm
  check('slow mode uses the real date', cs.day === 0 && cs.half === 1);
  const al = MMStalk.createAlmanac();
  const locked = !al.isUnlocked('largeSpike'); al.see('largeSpike');
  check('almanac unlocks a pattern after it is seen', locked && al.isUnlocked('largeSpike') && !al.isUnlocked('random'));
  check('3x sale is the secret goal', MMStalk.isSecretSale(100, 300) && !MMStalk.isSecretSale(100, 299));
}

// --- Bugs
{
  const g = MMBugs.createRun({ seed: 1, empty: true, arena: 'meadow' });
  g.spawn('ladybug', 10, 7); g.setPlayer(10, 7, true);
  check('swing catches and scores', g.swing().caught.length === 1 && g.state.score === 10);
  g.spawn('ladybug', 10, 7);
  const early = g.swing().swung; g.update(0.34); const mid = g.swing().swung; g.update(0.02);
  check('swing cooldown 0.35 s', !early && !mid && g.swing().swung);
}
{
  const g = MMBugs.createRun({ seed: 1, empty: true });
  const b = g.spawn('ladybug', 12, 7); g.setPlayer(10, 7, true); g.update(0.1);
  check('sneaking within 3 tiles does not scare', b.state === 'idle');
  g.setPlayer(10, 7, false); g.update(0.1);
  check('walking within 3 tiles makes a bug flee', b.state === 'flee');
  const bu = g.spawn('antlion', 11, 7); g.update(0.1);
  check('burrowers hide', bu.state === 'hidden');
  g.setPlayer(0, 0, true); g.update(2.1);
  check('burrower resurfaces after 2 s', bu.state === 'idle');
}
{
  const g = MMBugs.createRun({ seed: 2, empty: true }); g.setPlayer(5, 5, true);
  g.spawn('ladybug', 5, 5); g.spawn('ladybug', 5, 5);
  g.swing(); // two caught in one swing: x1 then x1.2
  check('combo x1.2 within 2 s', g.state.score === 22 && g.state.combo === 2, String(g.state.score));
  g.update(2.1);
  check('combo resets after 2 s', g.state.combo === 0);
}
{
  const g = MMBugs.createRun({ seed: 3, empty: true }); g.update(29.9);
  const n0 = g.state.bugs.length; g.update(0.2);
  check('rare bug spawns at 30 s', n0 === 0 && g.state.bugs.length === 1 && MMBugs.TYPES[g.state.bugs[0].type].rare);
  const day = MMBugs.createRun({ seed: 3, empty: true, night: false }); day.update(31);
  const night = MMBugs.createRun({ seed: 3, empty: true, night: true }); night.update(31);
  check('Moonwing only at night', day.state.bugs[0].type !== 'moonwing' && night.state.bugs[0].type === 'moonwing' && !MMBugs.canSpawn('moonwing', false) && !day.spawn('moonwing'));
  const run = MMBugs.createRun({ seed: 4, empty: true }); run.update(90.5);
  check('run lasts 90 s', run.state.done && run.state.time === 90);
}
check('8 arenas with star thresholds', MMBugs.ARENAS.length === 8 && MMBugs.starsFor('meadow', 59) === 0 && MMBugs.starsFor('meadow', 60) === 1 && MMBugs.starsFor('meadow', 120) === 2 && MMBugs.starsFor('meadow', 200) === 3);
done();
