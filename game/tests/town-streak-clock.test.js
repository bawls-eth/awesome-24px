// cycle1 L-07: a stored streak date in the FUTURE (the device clock was ahead when it was written, then put right) used to reset
// the login streak and the sell streak to 1, because the date was neither today nor yesterday. Rule now (main.js streakStep):
//  1-2 days ahead: wait for that day (nothing written, nothing paid); more than 2 days ahead: the stored date is ignored, the
//  streak is kept and counts on from today (no bonus today); a device date before 2026-11-01 never touches an existing streak.
//  A real gap still resets, yesterday still gives +1, a new player still gets Day 1. No save key added.
// OFFLINE: helpers.offlineStub (database blocked, Firebase SDK answered empty). Never chats, never writes to Firebase.
// Run: BASE=http://localhost:9711/game/index.html NODE_PATH=$(npm root -g) node game/tests/town-streak-clock.test.js
const { chromium } = require('playwright');
const { check, done, offlineStub, exposeGame, joinOffline } = require('./helpers');
const BASE = process.env.BASE || 'http://localhost:8440/game/index.html';

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1000, height: 700 } });
  const db = await offlineStub(ctx);
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await exposeGame(page);
  await page.goto(BASE);
  await joinOffline(page, 'ADMINstreak');
  const keys0 = await page.evaluate(() => Object.keys(loadSave()).sort());

  // 1. the rule itself (pure)
  const has = await page.evaluate(() => typeof streakStep === 'function');
  check('main.js has streakStep (the rule in one place)', has);
  const T = '2026-11-24';
  const table = [
    // [stored date, stored streak, today] -> [streak, date, counted, write]
    ['same day: nothing', [T, 7, T], [7, T, false, false]],
    ['yesterday: +1, counted', ['2026-11-23', 7, T], [8, T, true, true]],
    ['a real gap of 2 days: back to 1', ['2026-11-22', 7, T], [1, T, true, true]],
    ['a real gap of a year: back to 1', ['2025-11-24', 7, T], [1, T, true, true]],
    ['no stored date (new player): Day 1', [undefined, 0, T], [1, T, true, true]],
    ['unreadable stored date: Day 1 (as before)', ['soon', 7, T], [1, T, true, true]],
    ['impossible date 2026-02-31: Day 1 (as before)', ['2026-02-31', 7, T], [1, T, true, true]],
    ['1 day ahead: kept, wait, nothing written', ['2026-11-25', 7, T], [7, '2026-11-25', false, false]],
    ['2 days ahead: kept, wait, nothing written', ['2026-11-26', 7, T], [7, '2026-11-26', false, false]],
    ['3 days ahead: kept, counts on from today, no bonus', ['2026-11-27', 7, T], [7, T, false, true]],
    ['a year ahead: kept, counts on from today, no bonus', ['2027-11-24', 7, T], [7, T, false, true]],
    ['ahead across a month end (Dec 1 seen on Nov 30): wait', ['2026-12-01', 3, '2026-11-30'], [3, '2026-12-01', false, false]],
    ['ahead, but no streak to protect: Day 1', ['2027-01-01', 0, T], [1, T, true, true]],
    ['device clock at 1970 with a real streak: untouched', [T, 7, '1970-01-01'], [7, T, false, false]],
    ['device clock at 2000, stored date older still: untouched (no reset on a wrong clock)', ['1999-12-01', 7, '2000-01-05'], [7, '1999-12-01', false, false]],
    ['device clock at 1970, new player: Day 1 still works', [undefined, 0, '1970-01-01'], [1, '1970-01-01', true, true]],
    ['a streak of 1 a year ahead is kept too', ['2027-11-24', 1, T], [1, T, false, true]],
  ];
  if (has) {
    const got = await page.evaluate((rows) => rows.map((r) => { const o = streakStep(r[1][0], r[1][1], r[1][2]); return [o.streak, o.date, o.counted, o.write]; }), table);
    table.forEach((r, i) => check('rule: ' + r[0], JSON.stringify(got[i]) === JSON.stringify(r[2]), JSON.stringify(got[i]) + ' want ' + JSON.stringify(r[2])));
    // the two-step story: a clock 2 days ahead, put right, then played every day: no reset, no double pay
    const story = await page.evaluate(() => {
      let d = '2026-11-26'; let n = 7; const pay = [];
      ['2026-11-24', '2026-11-25', '2026-11-26', '2026-11-27', '2026-11-28'].forEach((today) => { const o = streakStep(d, n, today); if (o.write) { d = o.date; n = o.streak; } pay.push(o.counted ? o.streak : 0); });
      return { n, d, pay };
    });
    check('story: counted on the 26th by a fast clock, then daily play 24th..28th: 7, 7, 7, then 8 and 9 (paid only for the 27th and 28th)', JSON.stringify(story) === JSON.stringify({ n: 9, d: '2026-11-28', pay: [0, 0, 0, 8, 9] }), JSON.stringify(story));
  }

  // 2. the Town: login streak (setupLoginStreak is what a join runs) and sell streak (updateSellStreak is what a sale runs)
  const run = (kind, streak, offsetDays) => page.evaluate(([kind, streak, offsetDays]) => {
    const s = window.__g.scene.getScene('Town');
    const day = (n) => new Date(Date.now() + n * 86400000).toISOString().slice(0, 10);
    const score0 = s.localScore;
    if (kind === 'login') { writeSave({ loginStreak: streak, lastLoginDate: day(offsetDays) }); s.setupLoginStreak(); } else { writeSave({ sellStreak: streak, lastSellDate: day(offsetDays) }); s.sellStreak = streak; s.updateSellStreak(); }
    const sv = loadSave();
    return kind === 'login'
      ? { streak: sv.loginStreak, date: sv.lastLoginDate, shown: document.getElementById('streak-count').textContent, mem: s.loginStreak, paid: s.localScore - score0, today: day(0), stored: day(offsetDays) }
      : { streak: sv.sellStreak, date: sv.lastSellDate, mem: s.sellStreak, paid: s.localScore - score0, today: day(0), stored: day(offsetDays) };
  }, [kind, streak, offsetDays]);

  let r = await run('login', 7, 5);
  check('login: stored date 5 days ahead: the streak of 7 is kept (was reset to 1), shown as 7', r.streak === 7 && r.mem === 7 && r.shown === '7', JSON.stringify(r));
  check('login: ... it counts on from today and pays nothing today', r.date === r.today && r.paid === 0, JSON.stringify(r));
  r = await run('login', 7, -1);
  check('login: the next real day gives Day 8 and its bonus (+5)', r.streak === 8 && r.date === r.today && r.paid === 5 && r.shown === '8', JSON.stringify(r));
  r = await run('login', 7, 1);
  check('login: stored date 1 day ahead: kept at 7, date left alone, nothing paid (was reset to 1)', r.streak === 7 && r.date === r.stored && r.paid === 0 && r.shown === '7', JSON.stringify(r));
  r = await run('login', 7, -3);
  check('login: a real 3-day gap still resets to Day 1 (+1)', r.streak === 1 && r.date === r.today && r.paid === 1, JSON.stringify(r));
  r = await run('login', 4, 0);
  check('login: same day: nothing changes, nothing paid', r.streak === 4 && r.date === r.today && r.paid === 0, JSON.stringify(r));

  r = await run('sell', 4, 9);
  check('sell: stored date 9 days ahead: the streak of 4 is kept (was reset to 1), no bonus today', r.streak === 4 && r.mem === 4 && r.date === r.today && r.paid === 0, JSON.stringify(r));
  r = await run('sell', 4, 2);
  check('sell: stored date 2 days ahead: kept at 4, date left alone, nothing paid (was reset to 1)', r.streak === 4 && r.mem === 4 && r.date === r.stored && r.paid === 0, JSON.stringify(r));
  r = await run('sell', 4, -1);
  check('sell: yesterday still gives 5 and the loyalty bonus (+5)', r.streak === 5 && r.mem === 5 && r.date === r.today && r.paid >= 5, JSON.stringify(r)); // + any achievement the streak unlocks
  r = await run('sell', 4, -2);
  check('sell: a real gap still resets to 1', r.streak === 1 && r.date === r.today, JSON.stringify(r));

  const keys1 = await page.evaluate(() => Object.keys(loadSave()).sort());
  const added = keys1.filter((k) => keys0.indexOf(k) < 0 && ['sellStreak', 'lastSellDate', 'loginStreak', 'lastLoginDate', 'achievementsUnlocked', 'lifetimeStats'].indexOf(k) < 0); // a counted sale saves achievements, as before
  check('save format: no key beyond the existing streak / achievement keys was added', added.length === 0, JSON.stringify(added));
  check('no page errors', errors.length === 0, errors.join(' | '));
  check('offline: no database request was attempted', db.attempts() === 0, JSON.stringify(db.http.concat(db.ws).slice(0, 3)));
  await browser.close();
  done();
})();
