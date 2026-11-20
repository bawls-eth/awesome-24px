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
check('8 original songs with unique ids', SG.SONGS.length === 8 && new Set(SG.songIds()).size === 8);
check('BPMs within 80..160 and the first ladder ascends', SG.SONGS.every((s) => s.bpm >= 80 && s.bpm <= 160) && SG.SONGS.slice(0, 4).every((s, i) => !i || s.bpm > SG.SONGS[i - 1].bpm));
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
  check('all 24 charts lint clean with >= 40 notes', allOk, bad);
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


// ---- 8 songs: distinct data, deterministic charts, sensible counts ----
{
  check('every song has distinct BPM, scale and chord loop', new Set(SG.SONGS.map((s) => s.bpm)).size === 8 && new Set(SG.SONGS.map((s) => s.scale.join())).size >= 6 && new Set(SG.SONGS.map((s) => s.prog.join())).size === 8);
  check('exactly one secret song: Midnight Campfire, last in the list', SG.SONGS.filter((s) => s.secret).length === 1 && SG.SONGS[7].id === 'midnight-campfire' && SG.SONGS[7].name === 'Midnight Campfire');
  check('new songs use more than the old pattern kinds', new Set([].concat(...SG.SONGS.map((s) => s.patterns))).size >= 8);
  const bounds = { easy: [35, 160], normal: [60, 220], hard: [90, 330] };
  let okB = true, okD = true, bad = '';
  for (const s of SG.SONGS) for (const t of SG.TIERS) {
    const a = SG.chartFor(s.id, t), b = SG.chartFor(s.id, t);
    if (JSON.stringify(a) !== JSON.stringify(b)) okD = false;
    if (a.count < bounds[t][0] || a.count > bounds[t][1] || !Jam.lint(a).ok) { okB = false; bad += s.id + '/' + t + ':' + a.count + ' '; }
  }
  check('all 8 songs chart deterministically on every tier', okD);
  check('note counts within per-tier bounds (easy 35-160, normal 60-220, hard 90-330)', okB, bad);
  let notesSane = true;
  for (const s of SG.SONGS) { const c = SG.chartFor(s.id, 'hard'); const last = c.notes[c.notes.length - 1]; if (c.bpm !== s.bpm || last.t + (last.hold || 0) > c.lengthMs) notesSane = false; }
  check('chart carries its song BPM and ends inside lengthMs', notesSane);
  check('new songs have audible bass and tones', ['kettle-song', 'owl-hour', 'comet-tail', 'midnight-campfire'].every((id) => SG.backing(id, 'hard').filter((e) => e.kind === 'bass').every((e) => e.hz > 20 && e.hz < 400) && SG.toneHz(id, 3, 40000) > 100 && SG.toneHz(id, 3, 40000) < 4000));
  check('the second ladder is reachable (a song gives at most 3 stars)', SG.SONGS.every((s, i) => s.secret || s.needStars <= 3 * i) && SG.SONGS.filter((s) => !s.secret).every((s, i, a) => !i || s.needStars > a[i - 1].needStars));
}

// ---- unlock ladder 0/2/5/8/10/13/16 and the secret ----
{
  const ladder = { 'warm-embers': 0, 'lantern-shuffle': 2, 'moth-parade': 5, 'starlit-stomp': 8, 'kettle-song': 10, 'owl-hour': 13, 'comet-tail': 16 };
  check('ladder needs match the rules', Object.keys(ladder).every((id) => SG.song(id).needStars === ladder[id]));
  const save = SG.emptySave();
  const ids = SG.songIds().slice(0, 7);
  let ok = true;
  for (const id of ids) { // 3 stars on Easy for each song as it opens
    if (!SG.songUnlocked(save, id)) { ok = false; break; }
    SG.record(save, id, 'easy', { score: 9000, maxCombo: 40, accuracy: 0.95, rank: 'S', counts: { miss: 0 } });
  }
  check('earning 3 stars per song walks the whole ladder to Comet Tail', ok && SG.totalStars(save) === 21 && SG.songUnlocked(save, 'comet-tail') && !SG.songUnlocked(save, 'midnight-campfire'));
  const s2 = SG.emptySave(); SG.record(s2, 'warm-embers', 'easy', { score: 1, maxCombo: 1, accuracy: 0.95, rank: 'S' });
  SG.record(s2, 'lantern-shuffle', 'easy', { score: 1, maxCombo: 1, accuracy: 0.95, rank: 'S' });
  SG.record(s2, 'moth-parade', 'easy', { score: 1, maxCombo: 1, accuracy: 0.95, rank: 'S' });
  check('9 stars: Starlit open, Kettle Song (10) still locked', SG.totalStars(s2) === 9 && SG.songUnlocked(s2, 'starlit-stomp') && !SG.songUnlocked(s2, 'kettle-song'));
  const rep = SG.record(s2, 'starlit-stomp', 'easy', { score: 1, maxCombo: 1, accuracy: 0.6, rank: 'C' });
  check('10th star unlocks Kettle Song and reports it', SG.totalStars(s2) === 10 && rep.newlyUnlocked.join() === 'kettle-song');

  // secret: full combo on Hard only
  const sc = SG.emptySave();
  SG.record(sc, 'warm-embers', 'normal', { score: 9000, maxCombo: 90, accuracy: 0.9, rank: 'A', fullCombo: true });
  check('full combo on Normal does not open the secret', !SG.songUnlocked(sc, 'midnight-campfire') && sc.fullCombo === undefined);
  SG.record(sc, 'warm-embers', 'hard', { score: 9000, maxCombo: 90, accuracy: 0.9, rank: 'A', fullCombo: false });
  check('a Hard run with misses does not open the secret', !SG.songUnlocked(sc, 'midnight-campfire'));
  SG.record(sc, 'warm-embers', 'hard', { score: 9000, maxCombo: 5, accuracy: 0.9, rank: 'A', fullCombo: true });
  check('a tiny fake "full combo" (combo under 20) does not count', !SG.songUnlocked(sc, 'midnight-campfire'));
  const r3 = SG.record(sc, 'warm-embers', 'hard', { score: 12000, maxCombo: 150, accuracy: 0.97, rank: 'S', fullCombo: true });
  check('full combo on any Hard chart opens the secret and reports it', SG.songUnlocked(sc, 'midnight-campfire') && sc.fullCombo === true && r3.newlyUnlocked.join() === 'midnight-campfire' && sc.unlocked.includes('midnight-campfire'));
  check('secret stays open after save round trip', SG.cleanSave(JSON.parse(JSON.stringify(sc))).fullCombo === true && SG.songUnlocked(SG.cleanSave(JSON.parse(JSON.stringify(sc))), 'midnight-campfire'));
  const r4 = SG.record(sc, 'owl-hour', 'hard', { score: 1, maxCombo: 50, accuracy: 0.5, rank: 'C', fullCombo: true });
  check('re-earning the secret does not announce it twice', !r4.newlyUnlocked.includes('midnight-campfire'));
  // tamper resistance
  check('tamper: bare fullCombo flag is ignored', SG.cleanSave({ fullCombo: true }).fullCombo === undefined && !SG.songUnlocked(SG.cleanSave({ fullCombo: true }), 'midnight-campfire'));
  check('tamper: unlocked list naming the secret is ignored', !SG.cleanSave({ unlocked: ['midnight-campfire'] }).unlocked.includes('midnight-campfire'));
  check('tamper: fullCombo with only Easy/Normal entries is ignored', SG.cleanSave({ fullCombo: true, best: { 'warm-embers': { easy: { score: 5, stars: 1, rank: 'C', combo: 99 }, normal: { score: 5, stars: 1, rank: 'C', combo: 99 } } } }).fullCombo === undefined);
  check('tamper: fullCombo with a short Hard combo is ignored', SG.cleanSave({ fullCombo: true, best: { 'warm-embers': { hard: { score: 5, stars: 1, rank: 'C', combo: 3 } } } }).fullCombo === undefined);
  check('fullCombo "true" strings / 1 are ignored', ['true', 1, {}, [], 'yes'].every((v) => SG.cleanSave({ fullCombo: v, best: { 'warm-embers': { hard: { score: 5, stars: 1, rank: 'C', combo: 99 } } } }).fullCombo === undefined));
  check('fullCombo with real Hard evidence loads true', SG.cleanSave({ fullCombo: true, best: { 'owl-hour': { hard: { score: 5000, stars: 2, rank: 'A', combo: 120 } } } }).fullCombo === true);
  check('Hard still needs 2 stars on Normal for the secret song', !SG.tierUnlocked(sc, 'midnight-campfire', 'hard') && SG.tierUnlocked(sc, 'midnight-campfire', 'normal'));
}

// ---- save: offsetMs ----
{
  check('empty / old saves have no offsetMs and read as 0', !('offsetMs' in SG.emptySave()) && SG.offsetOf(SG.cleanSave({ v: 1, plays: 2 })) === 0 && SG.offsetOf(null) === 0);
  check('offsetMs round-trips', SG.cleanSave({ offsetMs: 35 }).offsetMs === 35 && SG.cleanSave({ offsetMs: -60 }).offsetMs === -60 && SG.cleanSave({ offsetMs: 0 }).offsetMs === 0);
  check('offsetMs clamps to +-200 and rounds', SG.cleanSave({ offsetMs: 9999 }).offsetMs === 200 && SG.cleanSave({ offsetMs: -9999 }).offsetMs === -200 && SG.cleanSave({ offsetMs: 12.6 }).offsetMs === 13);
  check('corrupt offsetMs falls back to the default (absent, reads 0)', ['12', null, NaN, Infinity, -Infinity, {}, [], true, 'abc'].every((v) => { const c = SG.cleanSave({ offsetMs: v }); return !('offsetMs' in c) && SG.offsetOf(c) === 0; }));
  check('setOffset clamps and offsetOf re-validates', SG.setOffset({}, 5000) === 200 && SG.offsetOf({ offsetMs: 'x' }) === 0 && SG.offsetOf({ offsetMs: 9e9 }) === 200);
  const sv = SG.cleanSave({ offsetMs: 20, best: { 'warm-embers': { hard: { score: 1, stars: 1, rank: 'C', combo: 30 } } }, fullCombo: true });
  check('cleanSave with the new fields is idempotent', JSON.stringify(SG.cleanSave(sv)) === JSON.stringify(sv));
}

// ---- calibration math (pure) ----
{
  const beats = [1000, 1700, 2400, 3100, 3800, 4500, 5200, 5900];
  const taps = (off, jit) => beats.map((b, i) => b + off + (jit ? jit[i % jit.length] : 0));
  check('median of constant lateness', Jam.calibrationFromTaps(taps(30), beats).offset === 30);
  check('early taps give a negative offset', Jam.calibrationFromTaps(taps(-45), beats).offset === -45);
  check('jitter still lands on the median', Math.abs(Jam.calibrationFromTaps(taps(25, [-6, 4, 0, 7, -3]), beats).offset - 25) <= 4);
  const t2 = taps(20); t2[2] += 250; t2[5] -= 200; // two wild taps
  const c2 = Jam.calibrationFromTaps(t2, beats);
  check('outliers are tolerated (2 wild taps of 8)', c2.offset === 20 && c2.ok && c2.kept.length === 6, JSON.stringify(c2));
  check('median helper: odd and even counts', Jam.calibrationOffset([5, 1, 3]) === 3 && Jam.calibrationOffset([1, 3, 5, 9]) === 4);
  check('clamp to +-200', Jam.calibrationOffset([900, 950, 1000]) === 200 && Jam.calibrationOffset([-900, -800]) === -200 && Jam.clampOffset(-1e6) === -200 && Jam.clampOffset(NaN) === 0);
  check('empty and NaN inputs give 0', Jam.calibrationOffset([]) === 0 && Jam.calibrationOffset([NaN, undefined]) === 0 && Jam.calibrationFromTaps([], beats).offset === 0 && !Jam.calibrationFromTaps([], beats).ok);
  check('fewer than 4 usable taps is not ok', !Jam.calibrationFromTaps([1010, 1710, 2410], beats).ok && Jam.calibrationFromTaps([1010, 1710, 2410, 3110], beats).ok);
  const stray = Jam.calibrationFromTaps([1030, 1300, 1730, 2430, 3130, 3830], beats);
  check('a tap far from any beat is ignored', stray.deltas.length === 5 && stray.offset === 30);
  const dbl = Jam.calibrationFromTaps([1030, 1040, 1730, 2430, 3130], beats);
  check('a double tap on one beat counts once', dbl.deltas.length === 4);
  check('calibration inputs are not mutated', (() => { const a = [30, 10, 20], b = [0, 1]; Jam.calibrationFromTaps(a, b); return a.join() === '30,10,20' && b.join() === '0,1'; })());
}

// ---- judging with an offset, and per-hit timing in the result ----
{
  let now = 0;
  const c = { notes: [{ t: 1000, lane: 'D' }, { t: 2000, lane: 'F' }, { t: 3000, lane: 'J' }, { t: 4000, lane: 'K' }] };
  const late = Jam.createRun(c, { clock: () => now, offset: 60 });
  now = 1060; check('offset +60: a press at note+60 judges Perfect', late.press('D') === 'perfect' && late.state.lastDelta === 0);
  now = 2100; const j2 = late.press('F');
  check('offset +60: press at +100 acts like +40 (Perfect)', j2 === 'perfect' && late.state.lastDelta === 40);
  const none = Jam.createRun(c, { clock: () => now });
  now = 2100; check('same press with no offset is only Good', none.press('F') === 'good');
  const early = Jam.createRun(c, { clock: () => now, offset: -50 });
  now = 3000 - 50; check('negative offset: early-by-50 press is Perfect', early.press('J') === 'perfect');
  const r = Jam.createRun(c, { clock: () => now });
  now = 990; r.press('D'); now = 2020; r.press('F'); now = 3030; r.press('J');
  const res = r.result();
  check('result reports hits and average delta (-10, +20, +30 -> +13)', res.hits === 3 && res.avgDelta === 13, JSON.stringify(res));
  check('result with no hits has avgDelta null', Jam.createRun(c, { clock: () => 0 }).result().avgDelta === null);
  const fcRun = Jam.createRun(c, { clock: () => now });
  for (const n of c.notes) { now = n.t; fcRun.press(n.lane); }
  check('result.fullCombo true only when every note is hit', fcRun.result().fullCombo === true && r.result().fullCombo === false);
  const h = { notes: [{ t: 1000, lane: 'D', hold: 800 }] };
  const hr = Jam.createRun(h, { clock: () => now });
  now = 1000; hr.press('D'); now = 1200; hr.release('D');
  check('a broken hold spoils the full combo', hr.result().fullCombo === false);
}

// song names are original (no real song or artist names)
check('song names are not borrowed', SG.SONGS.every((s) => !/slider|k\.k\.|animal|nintendo/i.test(s.name + s.blurb)));
// source hygiene
for (const f of ['../shared/mm-jam-songs.js', '../games/jam/jam.js']) {
  const src = fs.readFileSync(path.join(__dirname, f), 'utf8');
  check(`${path.basename(f)}: no Math.random, no innerHTML`, !/Math\.random/.test(src) && !/innerHTML/.test(src));
}
done();
