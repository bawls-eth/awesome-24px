// Tests for shared/mm-jam-songs.js (songs, charts, stars, unlocks, save validation) on top of shared/mm-jam.js.
// Run: node game/tests/shared-mm-jam.test.js
const fs = require('fs');
const path = require('path');
const Jam = require('../shared/mm-jam.js');
const SG = require('../shared/mm-jam-songs.js');
let failed = 0;
function check(name, cond, extra = '') { console.log((cond ? 'PASS ' : 'FAIL ') + name + (cond ? '' : ' ' + extra)); if (!cond) failed++; }
const done = () => { console.log(failed ? `${failed} FAILED` : 'ALL PASSED'); process.exitCode = failed ? 1 : 0; };

// songs as data
check('4 original songs with unique ids', SG.SONGS.length === 4 && new Set(SG.songIds()).size === 4);
check('BPMs ascend within 80..160', SG.SONGS.every((s, i) => s.bpm >= 80 && s.bpm <= 160 && (!i || s.bpm > SG.SONGS[i - 1].bpm)));
check('3 difficulty tiers', SG.TIERS.join() === 'easy,normal,hard');

// judging windows (re-checked through the page's own run)
{
  let now = 0;
  const c = { notes: [{ t: 1000, lane: 'D' }, { t: 2000, lane: 'F' }, { t: 3000, lane: 'J' }, { t: 4000, lane: 'K' }] };
  const run = Jam.createRun(c, { clock: () => now });
  now = 1040; const a = run.press('D');
  now = 2080; const b = run.press('F');
  now = 3130; const g = run.press('J');
  now = 4141; run.update(); const early = run.press('K');
  check('perfect at +40, great at +80, good at +130', a === 'perfect' && b === 'great' && g === 'good');
  check('note unhit beyond +140 is a miss', early === null && run.state.counts.miss === 1 && run.state.combo === 0 && run.state.maxCombo === 3);
  check('score 100+70+40', run.state.score === 210);
  check('a press 200 ms early finds no note', Jam.createRun(c, { clock: () => 800 }).press('D') === null);
}

// charts: deterministic, lint-clean, capped, no Math.random
{
  const orig = Math.random; let called = 0; Math.random = () => { called++; return 0.5; };
  const first = SG.chartFor('moth-parade', 'hard', 'x');
  Math.random = orig;
  check('chart generation never calls Math.random', called === 0);
  check('same seed gives identical chart', JSON.stringify(first) === JSON.stringify(SG.chartFor('moth-parade', 'hard', 'x')));
  check('different seed differs', JSON.stringify(first.notes) !== JSON.stringify(SG.chartFor('moth-parade', 'hard', 'y').notes));
  let allOk = true, bad = '';
  const counts = {};
  for (const s of SG.SONGS) for (const t of SG.TIERS) {
    const c = SG.chartFor(s.id, t);
    const l = Jam.lint(c); counts[s.id + t] = c.count;
    if (!l.ok || c.count < 40) { allOk = false; bad += s.id + '/' + t + ':' + l.errors.join(',') + c.count + ' '; }
  }
  check('all 12 charts lint clean with >= 40 notes', allOk, bad);
  check('density rises with tier', SG.SONGS.every((s) => counts[s.id + 'easy'] < counts[s.id + 'hard']));
  const hard = SG.chartFor('starlit-stomp', 'hard');
  let minGap = 1e9; for (let i = 1; i < hard.notes.length; i++) minGap = Math.min(minGap, hard.notes[i].t - hard.notes[i - 1].t);
  check('hard respects its 5.5 notes/sec cap', minGap >= 1000 / 5.5 - 1, String(minGap));
  check('chart starts after a 4-beat lead-in and has hold notes', hard.notes[0].t >= SG.beatMs(SG.song('starlit-stomp')) * 4 - 1 && hard.notes.some((n) => n.hold));
  const bc = SG.chartFor('no-such-song', 'bogus');
  check('unknown song/tier fall back safely', bc.song === 'warm-embers' && bc.difficulty === 'normal' && Jam.lint(bc).ok);
  // a hold never overlaps another note in its own lane
  let overlap = false;
  for (const s of SG.SONGS) for (const t of SG.TIERS) {
    const ns = SG.chartFor(s.id, t).notes;
    ns.forEach((n, i) => { if (n.hold) for (let j = i + 1; j < ns.length; j++) if (ns[j].lane === n.lane && ns[j].t < n.t + n.hold) overlap = true; });
  }
  check('hold notes never overlap a later note in their lane', !overlap);
  // a perfect player gets S and 3 stars on every chart
  let allS = true;
  for (const s of SG.SONGS) for (const t of SG.TIERS) {
    const c = SG.chartFor(s.id, t); let now = 0; const run = Jam.createRun(c, { clock: () => now });
    for (const n of c.notes) { now = n.t; run.press(n.lane); if (n.hold) { now = n.t + n.hold; run.release(n.lane); } }
    const r = run.result(); if (r.rank !== 'S' || SG.starsFor(r.accuracy) !== 3 || r.maxCombo !== c.count) allS = false;
  }
  check('perfect play on every chart: S rank, 3 stars, full combo', allS);
}

// backing events and tones
{
  const ev = SG.backing('warm-embers', 'normal');
  check('backing has kick/snare/hat/bass, sorted per beat', ['kick', 'snare', 'hat', 'bass'].every((k) => ev.some((e) => e.kind === k)) && ev.filter((e) => e.kind === 'bass').every((e) => e.hz > 20 && e.hz < 400));
  check('easy backing has fewer hats than hard', SG.backing('warm-embers', 'easy').filter((e) => e.kind === 'hat').length < ev.filter((e) => e.kind === 'hat').length);
  check('tone frequencies are deterministic and audible', SG.toneHz('moth-parade', 2, 5000) === SG.toneHz('moth-parade', 2, 5000) && SG.toneHz('moth-parade', 0, 0) > 100 && SG.toneHz('moth-parade', 3, 90000) < 4000);
}

// stars and ranks
check('star thresholds 50 / 75 / 90 percent', SG.starsFor(0.49) === 0 && SG.starsFor(0.5) === 1 && SG.starsFor(0.75) === 2 && SG.starsFor(0.9) === 3 && SG.starsFor(1) === 3);
check('rank thresholds S 95, A 85, B 70, C 50', Jam.rankFor(0.95) === 'S' && Jam.rankFor(0.85) === 'A' && Jam.rankFor(0.7) === 'B' && Jam.rankFor(0.5) === 'C' && Jam.rankFor(0.1) === 'D');

// save: defaults, validation, record, unlocks
{
  const d = SG.cleanSave(null);
  check('null / junk loads defaults', JSON.stringify(SG.cleanSave('str')) === JSON.stringify(d) && JSON.stringify(SG.cleanSave([1, 2])) === JSON.stringify(d) && d.unlocked.join() === 'warm-embers' && d.plays === 0 && d.hint === false);
  const h = SG.cleanSave({ junk: 1, plays: -4, hint: 'yes', unlocked: ['evil', 7, 'moth-parade'], best: { 'warm-embers': { easy: { score: 1e12, stars: 99, rank: '<b>', combo: -5 }, normal: 'x', hard: null, bogus: { score: 5 } }, evil: { easy: { score: 5, stars: 1 } }, 'moth-parade': 5 } });
  const e = h.best['warm-embers'].easy;
  check('hostile fields clamped', e.score === 999999 && e.stars === 3 && e.rank === 'D' && e.combo === 0 && h.plays === 0 && h.hint === false);
  check('unknown songs, tiers and keys dropped', !('evil' in h.best) && !('bogus' in h.best['warm-embers']) && !('normal' in h.best['warm-embers']) && !('junk' in h) && !('moth-parade' in h.best));
  check('unlocked list is derived from stars, a tampered list cannot unlock', h.unlocked.join() === 'warm-embers,lantern-shuffle', h.unlocked.join());
  const nan = SG.cleanSave({ best: { 'warm-embers': { easy: { score: NaN, stars: 'x', combo: Infinity } } } });
  check('NaN / Infinity entries collapse to nothing', !nan.best['warm-embers']);
  check('cleanSave is idempotent', JSON.stringify(SG.cleanSave(h)) === JSON.stringify(h));
}
{
  const save = SG.emptySave();
  check('start: only Warm Embers open, hard locked, normal open', SG.songUnlocked(save, 'warm-embers') && !SG.songUnlocked(save, 'lantern-shuffle') && SG.tierUnlocked(save, 'warm-embers', 'normal') && !SG.tierUnlocked(save, 'warm-embers', 'hard'));
  const rep = SG.record(save, 'warm-embers', 'easy', { score: 6000, maxCombo: 50, accuracy: 0.8, rank: 'B' });
  check('record: 2 stars, new best, Lantern Shuffle unlocks at 2 stars', rep.stars === 2 && rep.newBest && rep.starsGained === 2 && rep.newlyUnlocked.join() === 'lantern-shuffle' && SG.songUnlocked(save, 'lantern-shuffle') && save.unlocked.join() === 'warm-embers,lantern-shuffle' && save.plays === 1);
  const worse = SG.record(save, 'warm-embers', 'easy', { score: 100, maxCombo: 3, accuracy: 0.3, rank: 'D' });
  check('worse run never lowers best/stars/rank', !worse.newBest && save.best['warm-embers'].easy.score === 6000 && save.best['warm-embers'].easy.stars === 2 && save.best['warm-embers'].easy.rank === 'B' && save.best['warm-embers'].easy.combo === 50);
  SG.record(save, 'warm-embers', 'normal', { score: 7000, maxCombo: 60, accuracy: 0.8, rank: 'B' });
  check('hard unlocks at 2 stars on Normal', SG.tierUnlocked(save, 'warm-embers', 'hard') && SG.songStars(save, 'warm-embers') === 2 && SG.totalStars(save) === 2);
  SG.record(save, 'lantern-shuffle', 'normal', { score: 9000, maxCombo: 80, accuracy: 0.95, rank: 'S' });
  check('stars sum across songs; Moth Parade needs 5', SG.totalStars(save) === 5 && SG.songUnlocked(save, 'moth-parade') && !SG.songUnlocked(save, 'starlit-stomp'));
  SG.record(save, 'moth-parade', 'easy', { score: 1, maxCombo: 1, accuracy: 0.95, rank: 'S' });
  check('Starlit Stomp opens at 8 stars', SG.totalStars(save) === 8 && SG.songUnlocked(save, 'starlit-stomp') && save.unlocked.length === 4);
  check('record of an unknown song is ignored', SG.record(save, 'nope', 'easy', { score: 5, maxCombo: 1, accuracy: 1, rank: 'S' }).starsGained === 0 && !save.best.nope);
  check('saved record survives cleanSave round trip', JSON.stringify(SG.cleanSave(JSON.parse(JSON.stringify(save)))) === JSON.stringify(save));
}

// song names are original (no real song or artist names)
check('song names are not borrowed', SG.SONGS.every((s) => !/slider|k\.k\.|animal|nintendo/i.test(s.name + s.blurb)));
// source hygiene
for (const f of ['../shared/mm-jam-songs.js', '../games/jam/jam.js']) {
  const src = fs.readFileSync(path.join(__dirname, f), 'utf8');
  check(`${path.basename(f)}: no Math.random, no innerHTML`, !/Math\.random/.test(src) && !/innerHTML/.test(src));
}
done();
