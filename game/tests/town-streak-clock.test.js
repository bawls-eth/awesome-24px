// cycle1 L-07: a stored streak date in the FUTURE (the device clock was ahead when it was written, then put right) used to reset
// the login streak and the sell streak to 1, because the date was neither today nor yesterday. Rule now (main.js streakStep):
//  1-2 days ahead: wait for that day (nothing written, nothing paid); more than 2 days ahead: the stored date is ignored, the
//  streak is kept and counts on from today (no bonus today); a device date before 2026-11-01 never touches an existing streak.
//  A real gap still resets, yesterday still gives +1, a new player still gets Day 1. No save key added.
// Cycle 8 S (ID-09): streakStep (part 1) is unchanged and still writes the old keys; what the badge shows and what the daily bonus pays
//  now follow the forgiving counts visitDays / sellDays (four additive keys): a gap is +1, never a reset. Part 2 checks both, same clock cases.
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

  // 2. the Town. Cycle 8 S (ID-09, owner-approved forgiving day count, IDEAS.md "ID-09 / ID-18 implementation specs"): the badge and the
  // daily bonus now follow the never-reset counts visitDays / sellDays (MMGameDay.visitStep), not the streak. streakStep above is unchanged
  // and still writes loginStreak / sellStreak (rollback safe), so every old clock check below is kept on those keys, and the shown count and
  // the payout are now checked on the day counts with the same clock cases. A real gap used to reset the shown streak; it is now +1.
  const run = (kind, streak, offsetDays, days, dayOffset) => page.evaluate(([kind, streak, offsetDays, days, dayOffset]) => {
    const s = window.__g.scene.getScene('Town');
    const day = (n) => new Date(Date.now() + n * 86400000).toISOString().slice(0, 10);
    const score0 = s.localScore; s.welcomeToast = '';
    const dd = dayOffset === undefined ? offsetDays : dayOffset;
    if (kind === 'login') { writeSave({ loginStreak: streak, lastLoginDate: day(offsetDays), visitDays: days, lastVisitDate: days === undefined ? undefined : day(dd) }); s.setupLoginStreak(); } else { writeSave({ sellStreak: streak, lastSellDate: day(offsetDays), sellDays: days, lastSellDay: days === undefined ? undefined : day(dd) }); s.sellStreak = streak; s.updateSellStreak(); }
    const sv = loadSave();
    return kind === 'login'
      ? { streak: sv.loginStreak, date: sv.lastLoginDate, days: sv.visitDays, vdate: sv.lastVisitDate, shown: document.getElementById('streak-count').textContent, badge: document.getElementById('streak-badge').textContent, mem: s.visitDays, toast: s.welcomeToast, paid: s.localScore - score0, today: day(0), stored: day(offsetDays) }
      : { streak: sv.sellStreak, date: sv.lastSellDate, days: sv.sellDays, sdate: sv.lastSellDay, mem: s.sellStreak, memDays: s.sellDays, paid: s.localScore - score0, today: day(0), stored: day(offsetDays) };
  }, [kind, streak, offsetDays, days, dayOffset]);

  let r = await run('login', 7, 5, 7);
  check('login: stored date 5 days ahead: the old streak key keeps 7 (was reset to 1) and counts on from today', r.streak === 7 && r.date === r.today, JSON.stringify(r));
  check('login: ... the day count keeps 7, is shown as 7, its date resets to today and nothing is paid today', r.days === 7 && r.shown === '7' && r.mem === 7 && r.vdate === r.today && r.paid === 0, JSON.stringify(r));
  r = await run('login', 7, -1, 7);
  check('login: the next real day: day count 8, shown 8, bonus +5 with the "Welcome back!" toast (old key: 8)', r.days === 8 && r.shown === '8' && r.vdate === r.today && r.paid === 5 && /^👋 Welcome back! Day 8 in the village\. \+5 ⭐$/.test(r.toast) && r.streak === 8, JSON.stringify(r));
  r = await run('login', 7, 1, 7);
  check('login: stored date 1 day ahead: day count kept at 7, date left alone, nothing paid (old key: same)', r.days === 7 && r.shown === '7' && r.vdate === r.stored && r.paid === 0 && r.streak === 7 && r.date === r.stored, JSON.stringify(r));
  r = await run('login', 7, -3, 7);
  check('login: a real 3-day gap: the day count goes UP to 8 (+5), never a reset (was: Day 1, +1)', r.days === 8 && r.shown === '8' && r.vdate === r.today && r.paid === 5, JSON.stringify(r));
  check('login: ... the old streak key is still written by the unchanged rule (reset to 1, not shown)', r.streak === 1 && r.date === r.today, JSON.stringify(r));
  r = await run('login', 4, 0, 4);
  check('login: same day: nothing changes, nothing paid, no toast', r.days === 4 && r.streak === 4 && r.vdate === r.today && r.paid === 0 && r.toast === '', JSON.stringify(r));
  r = await run('login', 9, -1, undefined);
  check('login: an old save (loginStreak 9, no visitDays) is seeded at 9, then today counts: 10, +5', r.days === 10 && r.shown === '10' && r.paid === 5, JSON.stringify(r));
  r = await run('login', 9, 0, undefined);
  check('login: an old save already counted today by the old code: seeded 9, written, NOT paid again', r.days === 9 && r.shown === '9' && r.vdate === r.today && r.paid === 0, JSON.stringify(r));
  check('login: the badge reads "Days in town N" and no shown text says streak', /^Days in town \d+$/.test(r.badge.trim()) && !/streak/i.test(r.badge), JSON.stringify(r.badge));

  r = await run('sell', 4, 9, 4);
  check('sell: stored date 9 days ahead: old key keeps 4 (was reset to 1); sell days kept at 4, date today, no bonus today', r.streak === 4 && r.mem === 4 && r.date === r.today && r.days === 4 && r.memDays === 4 && r.sdate === r.today && r.paid === 0, JSON.stringify(r));
  r = await run('sell', 4, 2, 4);
  check('sell: stored date 2 days ahead: kept at 4, dates left alone, nothing paid (old key: same)', r.streak === 4 && r.mem === 4 && r.date === r.stored && r.days === 4 && r.sdate === r.stored && r.paid === 0, JSON.stringify(r));
  r = await run('sell', 4, -1, 4);
  check('sell: yesterday: sell day 5 and the loyalty bonus (+5) (old key: 5)', r.days === 5 && r.memDays === 5 && r.sdate === r.today && r.paid >= 5 && r.streak === 5 && r.mem === 5, JSON.stringify(r)); // + any achievement it unlocks
  r = await run('sell', 4, -2, 4);
  check('sell: a real gap: sell days still go up to 5 and pay +5 (was: reset to 1); the old key is still reset to 1 by the unchanged rule', r.days === 5 && r.sdate === r.today && r.paid >= 5 && r.streak === 1 && r.date === r.today, JSON.stringify(r));
  r = await run('sell', 3, -1, undefined);
  check('sell: an old save (sellStreak 3, no sellDays) is seeded at 3, then today counts: 4', r.days === 4 && r.memDays === 4 && r.paid >= 4, JSON.stringify(r));
  const ach = await page.evaluate(() => { const a = ACHIEVEMENTS.find((x) => x.id === 'sellstreak3'); return { desc: a.desc, viaDays: a.check({}, { sellDays: 3 }), viaOld: a.check({ bestSellStreak: 3 }, {}), none: a.check({}, { sellDays: 2 }) }; });
  check('sellstreak3 (same id): "Sell at the shop on 3 different days", unlocked by 3 sell days or the old best streak of 3', ach.desc === 'Sell at the shop on 3 different days' && ach.viaDays && ach.viaOld && !ach.none, JSON.stringify(ach));

  const keys1 = await page.evaluate(() => Object.keys(loadSave()).sort());
  const added = keys1.filter((k) => keys0.indexOf(k) < 0 && ['sellStreak', 'lastSellDate', 'loginStreak', 'lastLoginDate', 'achievementsUnlocked', 'lifetimeStats', 'visitDays', 'lastVisitDate', 'sellDays', 'lastSellDay'].indexOf(k) < 0); // a counted sale saves achievements, as before
  check('save format: no key beyond the existing streak / achievement keys and the four approved ID-09 day-count keys was added', added.length === 0, JSON.stringify(added));
  const tk = await page.evaluate(() => ['visitDays', 'lastVisitDate', 'sellDays', 'lastSellDay'].every((k) => TOWN_SAVE_FIELDS.indexOf(k) >= 0));
  check('save format: the four day-count keys are in the Town restore key list (TOWN_SAVE_FIELDS)', tk);
  check('no page errors', errors.length === 0, errors.join(' | '));
  check('offline: no database request was attempted', db.attempts() === 0, JSON.stringify(db.http.concat(db.ws).slice(0, 3)));
  await browser.close();
  done();
})();
