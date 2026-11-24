// Cycle 3 (L): the shared day helper MMGameDay and the Angler tournament streak on it (the L-07 class weakness: a device clock that was
// ahead once reset the streak to 1).
// Node: (a) utcKey / localNumber give exactly what the callers computed before, in 6 time zones over 2026-2028 (DST edges: Lord Howe
// 30 min, Chatham 45 min, Samoa, Kiritimati +14); (b) streakStep is the Town rule (main.js streakStep, read from the file and run side
// by side on 60000 random cases); (c) the Angler rules. Browser: the real Angler page under a faked device date in 3 time zones: play
// with the clock a day ahead, put the clock right, and the streak is still there (no Start button that does nothing, a message instead).
// The game-day rule itself (L-08) is NOT decided here: every caller keeps the day it used before.
// Run: BASE=http://localhost:8440/game/index.html NODE_PATH=$(npm root -g) node game/tests/cyc3-gameday-streak.test.js   (NODE_ONLY=1: node part)
const fs = require('fs');
const path = require('path');
const { check, done } = require('./helpers');
const GD = require('../shared/mm-gameday.js');
const A = require('../shared/mm-angler.js');
const D = require('../shared/mm-angler-depth.js');
const T = D.tournament;

// ---- (a) the same days as before, in every zone ----
const ZONES = ['UTC', 'America/Los_Angeles', 'Pacific/Kiritimati', 'Australia/Lord_Howe', 'Pacific/Chatham', 'Pacific/Apia'];
const tz0 = process.env.TZ;
ZONES.forEach((tz) => {
  process.env.TZ = tz;
  let bad = 0, n = 0, back = 0, jump = 0, prev = -1;
  for (let t = Date.UTC(2026, 0, 1); t < Date.UTC(2029, 0, 1); t += 41 * 60000 + 7777) {
    const d = new Date(t); n++;
    if (GD.utcKey(t) !== d.toISOString().slice(0, 10)) bad++;                                        // Isles DAY
    if (GD.localNumber(t) !== D.dayNumber(d.getFullYear(), d.getMonth() + 1, d.getDate())) bad++;     // Angler realDay
    if (GD.keyNumber(GD.localKey(t)) !== GD.localNumber(t) || GD.keyNumber(GD.utcKey(t)) !== GD.utcNumber(t)) bad++;
    const ln = GD.localNumber(t); if (prev >= 0) { if (ln < prev) back++; if (ln > prev + 1) jump++; } prev = ln;
  }
  check(tz + ': utcKey = toISOString date, localNumber = the Angler day number, key <-> number agree (' + n + ' times, 2026-2028)', bad === 0 && n > 38000, bad + ' bad');
  check(tz + ': the local day never goes back and never skips a number across DST changes', back === 0 && jump === 0, back + ' back, ' + jump + ' jumps');
});
if (tz0 === undefined) delete process.env.TZ; else process.env.TZ = tz0;
check('junk times give "" / NaN, never a throw', GD.utcKey(NaN) === '' && GD.utcKey(1e300) === '' && GD.localKey(Infinity) === '' && isNaN(GD.localNumber(NaN)) && isNaN(GD.utcNumber('x' * 1)) && isNaN(GD.keyNumber('2026-02-30')) && isNaN(GD.keyNumber(null)));
check('the default rule is still the UTC date (L-08 not decided here)', GD.key(Date.UTC(2026, 10, 24, 23, 59)) === '2026-11-24' && GD.number(Date.UTC(2026, 10, 24, 23, 59)) === GD.keyNumber('2026-11-24'));

// ---- (b) streakStep = the Town rule, read out of main.js ----
{
  const src = fs.readFileSync(path.join(__dirname, '../main.js'), 'utf8');
  const cut = (from, to) => { const a = src.indexOf(from); const b = src.indexOf(to, a); if (a < 0 || b < 0) throw new Error('main.js: ' + from); return src.slice(a, b + to.length); };
  const town = new Function(cut('function cleanCount(v) {', '\n}') + '\n' + cut('const STREAK_FUTURE_DAYS', "return { streak: was === now - 1 ? streak + 1 : 1, date: today, counted: true, write: true };\n}") + '\nreturn { streakStep, STREAK_CLOCK_FLOOR, STREAK_FUTURE_DAYS };')();
  check('same floor and future window as the Town rule', GD.keyNumber(town.STREAK_CLOCK_FLOOR) === GD.FLOOR && town.STREAK_FUTURE_DAYS === GD.FUTURE_DAYS);
  const keyOf = (n) => new Date(n * 86400000).toISOString().slice(0, 10);
  let s = 12345, bad = 0, first = '', kinds = { counted: 0, wait: 0, clock: 0, restart: 0, same: 0 };
  const rnd = () => { s = (Math.imul(s, 1103515245) + 12345) >>> 0; return s / 4294967296; };
  for (let i = 0; i < 60000; i++) {
    const today = rnd() < 0.08 ? Math.floor(rnd() * GD.FLOOR) : GD.FLOOR + Math.floor(rnd() * 900);
    const r = rnd(); const last = r < 0.05 ? -1 : r < 0.75 ? today + Math.floor(rnd() * 11) - 5 : Math.floor(rnd() * (GD.FLOOR + 1200));
    const streak = rnd() < 0.15 ? 0 : 1 + Math.floor(rnd() * 40);
    const want = town.streakStep(last < 0 ? undefined : keyOf(last), streak, keyOf(today));
    const got = GD.streakStep(last, streak, today);
    const wantLast = want.write ? today : last; // the Town writes `date` only when write is true
    if (got.streak !== want.streak || got.counted !== want.counted || got.last !== wantLast) { bad++; if (!first) first = JSON.stringify({ last, streak, today, want, got }); }
    kinds[got.counted ? 'counted' : got.wait ? 'wait' : got.clock ? 'clock' : last === today ? 'same' : 'restart']++;
  }
  check('streakStep on day numbers = main.js streakStep on date keys (60000 random cases)', bad === 0, bad + ' differ; first ' + first);
  check('every branch was exercised', Object.keys(kinds).every((k) => kinds[k] > 200), JSON.stringify(kinds));
}

// ---- (c) Angler tournament rules ----
const X = GD.FLOOR + 30; // a real day in December 2026
function playDay(j, day) { // start, 5 casts, finish; null when the start is refused
  const st = T.start(j, day); if (!st.ok) return { refused: st.reason, journal: st.journal };
  let jj = st.journal; for (let i = 0; i < D.CASTS; i++) { jj = T.takeCast(jj, day).journal; jj = T.addScore(jj, 10); }
  const f = T.finish(jj, day); return { journal: f.journal, result: f.result };
}
{
  let j = A.journal.cleanFull(null);
  for (let d = X - 2; d <= X; d++) j = playDay(j, d).journal;
  check('three days in a row: streak 3', j.tour.streak === 3 && j.tour.last === X);
  // the device clock is a day ahead on the same real day: the player plays "tomorrow"
  const ahead = playDay(j, X + 1); j = ahead.journal;
  check('clock one day ahead: that tournament counts (streak 4, dated X+1)', ahead.result.streak === 4 && j.tour.last === X + 1);
  // the clock is right again: it is X once more
  const back = playDay(j, X);
  check('clock right again: today is not offered a second time (reason "ahead"), the streak stays 4 (was: playable, and reset to 1)', back.refused === 'ahead' && back.journal.tour.streak === 4 && back.journal.tour.last === X + 1 && T.liveStreak(j, X) === 4, JSON.stringify({ r: back.refused, t: back.journal.tour, live: T.liveStreak(j, X) }));
  check('blockedWhy says the same, and nothing was written by the refusal', T.blockedWhy(j, X) === 'ahead' && JSON.stringify(back.journal.tour) === JSON.stringify(j.tour));
  const real1 = playDay(j, X + 1);
  check('the real X+1: already played (done), streak shown 4', real1.refused === 'done' && T.liveStreak(j, X + 1) === 4);
  const real2 = playDay(j, X + 2);
  check('the real X+2: streak 5', real2.result && real2.result.streak === 5 && real2.journal.tour.last === X + 2);
  // toggling the clock between two days cannot farm the streak
  let k = A.journal.cleanFull(null); k = playDay(k, X).journal; let most = k.tour.streak, plays = k.tour.played;
  for (let i = 0; i < 12; i++) { const r = playDay(k, i % 2 ? X : X + 1); k = r.journal; most = Math.max(most, k.tour.streak); }
  check('12 clock flips between X and X+1: streak 2 at most, 2 tournaments played in all', most === 2 && k.tour.played === plays + 1, most + ' ' + k.tour.played);
}
{ // far ahead (more than 2 days): the stored day is ignored, no +1, never a reset
  let j = A.journal.cleanFull({ tour: { last: X + 10, streak: 6, played: 9 } });
  check('stored day 10 ahead: the tournament can be played', T.blockedWhy(j, X) === '' && T.liveStreak(j, X) === 6);
  const r = playDay(j, X);
  check('...and finishing keeps streak 6 (not 7, not 1), dated today', r.result.streak === 6 && r.journal.tour.last === X && r.journal.tour.played === 10, JSON.stringify(r.journal.tour));
  const n = playDay(r.journal, X + 1);
  check('the next day counts again: 7', n.result.streak === 7);
}
{ // a dead clock (1970)
  const j = A.journal.cleanFull({ tour: { last: X, streak: 4, played: 4 } });
  const r = playDay(j, 3);
  check('device date in 1970 with a streak: refused ("clock"), streak 4 untouched and still shown', r.refused === 'clock' && r.journal.tour.streak === 4 && r.journal.tour.last === X && T.liveStreak(j, 3) === 4);
  const fresh = playDay(A.journal.cleanFull(null), 3);
  check('a new angler on a 1970 clock just plays (streak 1)', fresh.result && fresh.result.streak === 1);
}
{ // unchanged rules
  let j = A.journal.cleanFull(null); j = playDay(j, X).journal;
  const miss = playDay(j, X + 2);
  check('a missed day still restarts at 1; the shown streak is 0 on a missed day', miss.result.streak === 1 && T.liveStreak(j, X + 2) === 0 && T.liveStreak(j, X + 1) === 1);
  const st = T.start(j, X + 1); const mid = T.takeCast(st.journal, X + 1).journal;
  check('a run in progress is always resumable', T.start(mid, X + 1).resumed === true && T.blockedWhy(mid, X + 1) === '');
  check('save shape: no new field in tour', Object.keys(miss.journal.tour).sort().join() === 'best,last,medals,played,run,streak');
}

if (process.env.NODE_ONLY) { done(); return; }

// ---- browser: the real page, a faked device date, three time zones ----
const { chromium } = require('playwright');
const BASE = process.env.BASE || 'http://localhost:8440/game/index.html';
const ORIGIN = new URL(BASE).origin;
const URL1 = ORIGIN + '/game/games/angler/index.html?test=1&seed=gd&day=real'; // day=real is not a number, so the page uses the device date
const KEY = 'pixeltown-angler-v1';
const castOnce = (page) => page.evaluate(() => {
  const a = window.__angler;
  a.tap(); if (!a.bite) return 'nocast:' + a.state;
  a.advance(a.bite.wait + 0.2); a.tap();
  for (let i = 0; i < 4000 && a.state === 'reeling'; i++) { a.setHold(a.reel.tension < a.reel.pos); a.advance(1 / 30); }
  a.setHold(false);
  const out = a.result ? a.result.outcome + ':' + a.result.fish : a.state;
  a.dismiss();
  return out;
});
(async () => {
  const browser = await chromium.launch();
  for (const tz of ['UTC', 'America/Los_Angeles', 'Pacific/Kiritimati']) {
    const ctx = await browser.newContext({ viewport: { width: 1000, height: 700 }, timezoneId: tz });
    const page = await ctx.newPage(); const errors = []; let dbReq = 0;
    page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
    page.on('request', (r) => { if (/firebase|googleapis/.test(r.url())) dbReq++; });
    await page.goto(URL1);
    const noon = await page.evaluate(() => new Date(2026, 11, 10, 12, 0, 0).getTime()); // 10 Dec 2026, 12:00 local
    const day = Math.floor(Date.UTC(2026, 11, 10) / 86400000);
    // the angler has a 3 day streak up to yesterday (9 Dec)
    await page.evaluate(([k, d]) => { const j = JSON.parse(localStorage.getItem(k) || '{}'); j.tour = { last: d - 1, streak: 3, played: 3 }; localStorage.setItem(k, JSON.stringify(j)); }, [KEY, day]);
    await page.clock.setFixedTime(noon + 86400000); // the device clock is one day ahead: it says 11 Dec
    await page.goto(URL1);
    await page.waitForFunction(() => window.__angler && window.MMGameDay);
    check(tz + ': the page reads the (wrong) device day, 11 Dec', await page.evaluate(() => __angler.day) === day + 1);
    // 9 Dec -> 11 Dec is a missed day by this clock: a new streak of 1, dated 11 Dec
    await page.evaluate(() => __angler.tourney.start());
    for (let i = 0; i < 5; i++) await castOnce(page);
    const st1 = await page.evaluate(() => __angler.tourney.state);
    check(tz + ': played with the clock ahead: dated 11 Dec', st1.last === day + 1 && st1.played === 4 && st1.run === null, JSON.stringify(st1));
    // the next (wrong) day, 12 Dec: streak goes on
    await page.clock.setFixedTime(noon + 2 * 86400000);
    await page.goto(URL1); await page.waitForFunction(() => window.__angler);
    await page.evaluate(() => __angler.tourney.start());
    for (let i = 0; i < 5; i++) await castOnce(page);
    const st2 = await page.evaluate(() => __angler.tourney.state);
    check(tz + ': and the day after by that clock: streak ' + (st1.streak + 1), st2.last === day + 2 && st2.streak === st1.streak + 1, JSON.stringify(st2));
    // the clock is put right: it is 11 Dec for real (one day behind the stored 12 Dec)
    await page.clock.setFixedTime(noon + 86400000);
    await page.goto(URL1); await page.waitForFunction(() => window.__angler);
    const ui = await page.evaluate(() => {
      const a = __angler; const started = a.tourney.start();
      document.getElementById('tourney-btn').click();
      const body = document.getElementById('tourney-body');
      return { started, wait: !!document.getElementById('tour-wait'), startBtn: !!document.getElementById('tour-start'), text: body.textContent, st: a.tourney.state, active: a.tourney.active };
    });
    check(tz + ': clock right again: the tournament does not start a second time and the streak is not reset', ui.started === false && ui.active === false && ui.st.streak === st2.streak && ui.st.last === day + 2, JSON.stringify(ui.st));
    check(tz + ': the panel says why (no Start button that does nothing) and still shows the streak', ui.wait && !ui.startBtn && /Your streak is safe/.test(ui.text) && ui.text.indexOf('Streak: ' + st2.streak + ' day') >= 0, ui.text.slice(0, 400));
    check(tz + ': normal fishing is not locked', await page.evaluate(() => { const a = __angler; document.getElementById('tourney-close').click(); a.tap(); const ok = !!a.bite; return ok; }));
    // two real days later (13 Dec): the day after the stored one: +1
    await page.clock.setFixedTime(noon + 3 * 86400000);
    await page.goto(URL1); await page.waitForFunction(() => window.__angler);
    await page.evaluate(() => __angler.tourney.start());
    for (let i = 0; i < 5; i++) await castOnce(page);
    const st3 = await page.evaluate(() => __angler.tourney.state);
    check(tz + ': 13 Dec: the streak goes on (' + (st2.streak + 1) + ')', st3.last === day + 3 && st3.streak === st2.streak + 1, JSON.stringify(st3));
    const saved = JSON.parse(await page.evaluate((k) => localStorage.getItem(k), KEY));
    check(tz + ': saved tour has the same fields as before', Object.keys(saved.tour).every((k) => ['last', 'streak', 'played', 'best', 'medals', 'run'].indexOf(k) >= 0), Object.keys(saved.tour).join());
    check(tz + ': no page errors, no database request', errors.length === 0 && dbReq === 0, errors.join(' | ') + ' ' + dbReq);
    await ctx.close();
  }
  await browser.close();
  done();
})().catch((e) => { console.error(e); process.exit(1); });
