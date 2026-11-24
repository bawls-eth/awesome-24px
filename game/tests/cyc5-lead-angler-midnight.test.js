// Cycle 5 L (b10-r3-01): the Angler tournament card after the calendar day turned.
// Before: renderTourney showed g.tourResult for ever, so a run that ended past midnight (or a card reopened after midnight)
// showed the old "Final: N points" and NO Start button for the new day until a reload.
// Now: a Final of an earlier day is labelled "Yesterday's final: ..." and the new day's Start button sits under it; today's Final
// still stands alone (no second run on the same day). The page reads the REAL device date (day=real); the clock is shifted
// with page.clock. Standalone page, no Firebase, no external network (asserted: 0 requests off the local origin).
// Run: BASE=http://localhost:8440/game/index.html node game/tests/cyc5-lead-angler-midnight.test.js
const { chromium } = require('playwright');
const { check, done, blockDb } = require('./helpers');
const ORIGIN = (process.env.BASE || 'http://localhost:8440/game/index.html').replace(/\/game\/index\.html.*$/, '');
const URL = ORIGIN + '/game/games/angler/index.html?test=1&seed=mid&day=real';
const SHOTS = process.env.SHOTS || null;

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
const card = (page) => page.evaluate(() => {
  const vis = (e) => !!e && e.getClientRects().length > 0;
  const o = document.getElementById('tourney'), r = document.getElementById('tour-result'), s = document.getElementById('tour-start');
  return { open: !!o && !o.hidden, result: vis(r) ? r.textContent : null, start: vis(s) ? { text: s.textContent, disabled: s.disabled, h: Math.round(s.getBoundingClientRect().height), inView: s.getBoundingClientRect().bottom <= innerHeight && s.getBoundingClientRect().top >= 0 } : null, body: document.getElementById('tourney-body').textContent };
});

async function open(browser, tag, ctxOpts, h, m, s) {
  const ctx = await browser.newContext(Object.assign({ timezoneId: 'UTC' }, ctxOpts));
  const db = await blockDb(ctx);
  const page = await ctx.newPage();
  const errors = []; const off = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('request', (r) => { if (r.url().indexOf(ORIGIN) !== 0 && !/^data:|^blob:/.test(r.url())) off.push(r.url()); });
  await page.goto(ORIGIN + '/game/games/angler/index.html?test=1');
  await page.evaluate(() => localStorage.clear());
  const late = await page.evaluate(([hh, mm, ss]) => new Date(2026, 10, 24, hh, mm, ss).getTime(), [h, m, s]);
  await page.clock.setFixedTime(late);
  await page.goto(URL);
  await page.waitForFunction(() => window.__angler);
  return { ctx, page, errors, off, db, late };
}

(async () => {
  const browser = await chromium.launch();
  const VIEWS = [['desktop', { viewport: { width: 1280, height: 720 } }], ['phone', { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true }]];
  for (const [tag, opts] of VIEWS) {
    const T = (s) => `${tag}: ${s}`;
    const act = (page, sel) => (opts.hasTouch ? page.tap(sel) : page.click(sel));

    // A. the run starts at 23:59:30 and its last casts land after midnight
    {
      const s = await open(browser, tag, opts, 23, 59, 30);
      const day0 = await s.page.evaluate(() => { __angler.tourney.start(); return __angler.day; });
      await castOnce(s.page); await castOnce(s.page);
      await s.page.clock.setFixedTime(s.late + 60000); // 00:00:30 the next day
      for (let i = 0; i < 3; i++) await castOnce(s.page);
      const st = await s.page.evaluate(() => ({ day: __angler.day, r: __angler.tourney.result, active: __angler.tourney.active }));
      check(T('A: the run ended after midnight and counts for its start day'), st.day === day0 + 1 && !!st.r && st.r.day === day0 && st.active === false, JSON.stringify(st));
      const c = await card(s.page);
      check(T('A: the card opens with that run\'s Final, labelled with its day'), c.open && !!c.result && c.result.indexOf('Yesterday\'s final: ') === 0, JSON.stringify(c));
      check(T('A: the new day\'s Start button is there without a reload (enabled, >= 40 px, in view)'), !!c.start && /Start tournament/.test(c.start.text) && c.start.disabled === false && c.start.h >= 40 && c.start.inView, JSON.stringify(c.start));
      check(T('A: the card header is the new day'), c.body.indexOf('Day ' + (day0 + 1) + ' -') === 0, c.body.slice(0, 40));
      if (SHOTS) await s.page.screenshot({ path: `${SHOTS}/cyc5-lead-angler-${tag}-1-after-midnight.jpg`, type: 'jpeg', quality: 70 });
      if (c.start) await act(s.page, '#tour-start');
      await s.page.waitForTimeout(150);
      const nx = await s.page.evaluate(() => ({ active: __angler.tourney.active, run: __angler.tourney.run && __angler.tourney.run.day, r: __angler.tourney.result }));
      check(T('A: pressing Start begins the new day\'s run'), nx.active === true && nx.run === day0 + 1 && nx.r === null, JSON.stringify(nx));
      for (let i = 0; i < 5; i++) await castOnce(s.page);
      const c2 = await card(s.page);
      check(T('A: that run\'s Final is today\'s: "Final: ...", no second Start on the same day'), c2.open && !!c2.result && c2.result.indexOf('Final: ') === 0 && c2.start === null, JSON.stringify(c2));
      check(T('A: no page errors, nothing off the local origin, 0 database attempts'), s.errors.length === 0 && s.off.length === 0 && s.db.attempts() === 0, JSON.stringify([s.errors, s.off, s.db.attempts()]));
      await s.ctx.close();
    }

    // B. the run ends at 23:50; the card is closed and opened again after midnight
    {
      const s = await open(browser, tag, opts, 23, 50, 0);
      const day0 = await s.page.evaluate(() => { __angler.tourney.start(); return __angler.day; });
      for (let i = 0; i < 5; i++) await castOnce(s.page);
      const c0 = await card(s.page);
      check(T('B: same day: the Final stands alone (no Start: one tournament per day)'), c0.open && !!c0.result && c0.result.indexOf('Final: ') === 0 && c0.start === null, JSON.stringify(c0));
      await act(s.page, '#tourney-close');
      await s.page.clock.setFixedTime(s.late + 11 * 60000); // 00:01 the next day
      await act(s.page, '#tourney-btn');
      await s.page.waitForTimeout(150);
      const c1 = await card(s.page);
      check(T('B: reopened after midnight: yesterday\'s Final is labelled and Start is offered'), c1.open && !!c1.result && c1.result.indexOf('Yesterday\'s final: ') === 0 && !!c1.start && c1.start.disabled === false, JSON.stringify(c1));
      if (SHOTS) await s.page.screenshot({ path: `${SHOTS}/cyc5-lead-angler-${tag}-2-reopened.jpg`, type: 'jpeg', quality: 70 });
      if (c1.start) await act(s.page, '#tour-start');
      await s.page.waitForTimeout(150);
      const nx = await s.page.evaluate(() => ({ active: __angler.tourney.active, run: __angler.tourney.run && __angler.tourney.run.day }));
      check(T('B: Start begins day + 1'), nx.active === true && nx.run === day0 + 1, JSON.stringify(nx));
      check(T('B: no page errors, nothing off the local origin, 0 database attempts'), s.errors.length === 0 && s.off.length === 0 && s.db.attempts() === 0, JSON.stringify([s.errors, s.off, s.db.attempts()]));
      await s.ctx.close();
    }
  }
  await browser.close();
  done();
})();
