// cycle0 L-01: the Town's daily hour windows (Bug-Off, fishing tournament, Mystery Merchant) hash their start hour from the UTC
// day number. They used to compare it with the LOCAL hour, so for every player outside UTC the start hour was re-rolled in the
// middle of their day: a sign said "next: 19:00-21:00" and at 19:00 nothing happened. This sweeps real clock instants in three
// time zones and checks the promise each sign makes: the window it announces is live at the announced time on the player's clock.
// OFFLINE: helpers.offlineStub (database blocked, Firebase SDK answered empty). Nothing is written anywhere but the page's own storage.
// Run: BASE=http://localhost:9701/game/index.html NODE_PATH=$(npm root -g) node game/tests/town-hour-windows.test.js
const { chromium } = require('playwright');
const { check, done, offlineStub, exposeGame, joinOffline } = require('./helpers');
const BASE = process.env.BASE || 'http://localhost:8440/game/index.html';
const DAY0 = Date.UTC(2026, 5, 10); // a fixed range, so the test never depends on the day it runs
const HOUR = 3600000;

// One sample per hour at :15 UTC: what the three signs say and whether each window is open, read through the real code paths.
async function sweep(browser, timezoneId, days) {
  const ctx = await browser.newContext({ viewport: { width: 1000, height: 700 }, timezoneId });
  const db = await offlineStub(ctx); // before any page navigates
  const page = await ctx.newPage();
  await exposeGame(page);
  await page.goto(BASE);
  await joinOffline(page, 'ADMINhours');
  const out = [];
  for (let h = 0; h < days * 24; h++) {
    const t = DAY0 + h * HOUR + 15 * 60000;
    await page.clock.setFixedTime(t);
    out.push(await page.evaluate((at) => {
      const s = window.__g.scene.getScene('Town'); const d = new Date();
      s.refreshBugOffSign(); s.refreshTournamentSign(); s.refreshMerchantSign();
      return { t: at, now: Date.now(), lh: d.getHours(), lm: d.getMinutes(), ld: d.getDate(),
        bug: { live: s.isBugOffTime(), phase: s.bugOffPhase(), sign: s.bugOffSignText.text },
        tour: { live: s.isFishTournamentTime(), sign: s.tournamentSignText.text },
        mer: { live: s.isMerchantVisiting(), sign: s.merchantSign.text, shown: s.merchantSprite.visible },
        daily: (s.dailyItems ? (s.dailyItems().find((i) => i.id === 'bugoff') || {}).detail : '') || '' };
    }, t));
  }
  const clean = db.attempts() === 0; // offlineStub: the SDK never loads, so not one request may reach a database host
  await ctx.close();
  return { rows: out, clean };
}

// The first later sample whose local clock reads hour `h` at or after minute `m` (on local date `date`, when one is given).
const nextAt = (rows, i, h, m, date) => rows.slice(i + 1, i + 50).find((r) => r.lh === h && r.lm >= m && (date === undefined || r.ld === date));

function promises(tz, rows) {
  const res = { bug: { n: 0, bad: [] }, tour: { n: 0, bad: [] }, mer: { n: 0, bad: [] }, runs: { bug: [], tour: [], mer: [] }, clock: rows.every((r) => r.now === r.t) };
  rows.forEach((r, i) => {
    if (i + 50 > rows.length) return; // the last two days only serve as the "later" of earlier samples
    for (const k of ['bug', 'tour']) {
      const m = /next: (\d{1,2}):(\d\d)-(\d{1,2}):(\d\d)/.exec(r[k].sign);
      if (!m) continue;
      res[k].n++;
      const at = nextAt(rows, i, Number(m[1]), Number(m[2]));
      if (!at || !at[k].live) res[k].bad.push(`${new Date(r.t).toISOString()} said "${m[0]}"; at ${at ? new Date(at.t).toISOString() : 'no such time'} live=${at ? at[k].live : '-'}`);
    }
    const mm = /back at (\d{1,2}):(\d\d) (today|tomorrow|in 2 days)/.exec(r.mer.sign);
    if (mm) {
      res.mer.n++;
      const dates = rows.slice(i, i + 50).map((x) => x.ld).filter((d, j, a) => a.indexOf(d) === j); // local dates from now on, in order
      const at = nextAt(rows, i, Number(mm[1]), Number(mm[2]), dates[['today', 'tomorrow', 'in 2 days'].indexOf(mm[3])]);
      if (!at || !at.mer.live) res.mer.bad.push(`${new Date(r.t).toISOString()} said "${mm[0]}"; at ${at ? new Date(at.t).toISOString() : 'no such time'} visiting=${at ? at.mer.live : '-'}`);
    }
  });
  // every live run (a stretch of consecutive live samples) has the window's full length: never cut short by a re-rolled hour
  for (const k of ['bug', 'tour', 'mer']) {
    let run = 0;
    rows.forEach((r, i) => { if (r[k].live) run++; if ((!r[k].live || i === rows.length - 1) && run) { if (i > run && i < rows.length - 1) res.runs[k].push(run); run = 0; } });
  }
  return res;
}

(async () => {
  const browser = await chromium.launch();
  for (const [tz, days] of [['America/Los_Angeles', 12], ['Asia/Kolkata', 6], ['UTC', 5]]) {
    const { rows, clean } = await sweep(browser, tz, days);
    check(`[${tz}] offline: no request reached the database hosts`, clean);
    const p = promises(tz, rows);
    check(`[${tz}] the page clock followed the test clock on every sample`, p.clock && rows.length === days * 24, String(rows.length));
    check(`[${tz}] Bug-Off: every announced "next:" window is live at the announced local time`, p.bug.n > 20 && p.bug.bad.length === 0, `${p.bug.bad.length}/${p.bug.n} broken, e.g. ${p.bug.bad[0]}`);
    check(`[${tz}] Fish tourney: every announced "next:" window is live at the announced local time`, p.tour.n > 20 && p.tour.bad.length === 0, `${p.tour.bad.length}/${p.tour.n} broken, e.g. ${p.tour.bad[0]}`);
    check(`[${tz}] Merchant: "back at H:MM today / tomorrow / in 2 days" is kept (he is there at that local time, on that local day)`, p.mer.n > 20 && p.mer.bad.length === 0, `${p.mer.bad.length}/${p.mer.n} broken, e.g. ${p.mer.bad[0]}`);
    const lens = (a) => a.filter((v, i, x) => x.indexOf(v) === i).join(',');
    check(`[${tz}] every Bug-Off / tourney / merchant window runs its full length (one length each, never cut short)`,
      p.runs.bug.length >= days - 3 && lens(p.runs.bug).indexOf(',') < 0 && p.runs.tour.length >= days - 3 && lens(p.runs.tour).indexOf(',') < 0 && p.runs.mer.length >= days - 3 && lens(p.runs.mer) === '3',
      `bug ${lens(p.runs.bug)} tour ${lens(p.runs.tour)} merchant ${lens(p.runs.mer)}`);
    check(`[${tz}] the merchant is on the map exactly while he is visiting; the sign never says closed while he is there`, rows.every((r) => r.mer.shown === r.mer.live && /closed/.test(r.mer.sign) === !r.mer.live));
    check(`[${tz}] a live sign says LIVE and a past one says ended, in step with the phase`, rows.every((r) => /LIVE now/.test(r.bug.sign) === r.bug.live && /ended/.test(r.bug.sign) === (r.bug.phase === 'after') && /LIVE now/.test(r.tour.sign) === r.tour.live));
    if (tz === 'Asia/Kolkata') check('[Asia/Kolkata] a half-hour zone shows half-hour times (H:30), never a wrong whole hour', rows.every((r) => !/next: |LIVE now|ended/.test(r.bug.sign) || /\d{1,2}:30-\d{1,2}:30/.test(r.bug.sign)), rows[0].bug.sign);
    if (tz === 'UTC') check('[UTC] times read H:00 as before, and the Daily list shows the same window as the sign', rows.every((r) => /\d{1,2}:00-\d{1,2}:00/.test(r.bug.sign) && (r.bug.live || (/window (\d{1,2}:00-\d{1,2}:00)/.exec(r.daily) || [])[1] === (/(\d{1,2}:00-\d{1,2}:00)/.exec(r.bug.sign) || [])[1])), rows[0].bug.sign + ' | ' + rows[0].daily);
  }
  await browser.close();
  done();
})().catch((e) => { console.error(e); process.exit(1); });
