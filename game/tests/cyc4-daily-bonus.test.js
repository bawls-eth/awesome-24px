// Cycle 4 D (item 3): the all-chores bonus is 40 stars (was 5), paid exactly once per day, shown in the chores panel footer.
// Town, Firebase blocked (offlineStub), joined as an ADMIN bot. Every dailyItems() entry is forced to 'done' so the card completes without a real day of play.
// Serve the repo root first:  python3 -m http.server 8440 &
// Run: BASE=http://localhost:8440/game/index.html NODE_PATH=$(npm root -g) node game/tests/cyc4-daily-bonus.test.js
const { chromium } = require('playwright');
const { check, done, offlineStub, exposeGame, joinOffline } = require('./helpers');
const ORIGIN = (process.env.BASE || 'http://localhost:8440/game/index.html').replace(/\/game\/index\.html.*$/, '');
(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  const db = await offlineStub(ctx);
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  await exposeGame(page);
  await page.goto(ORIGIN + '/game/index.html');
  await joinOffline(page, 'ADMINcyc4daily');
  await page.waitForTimeout(600);
  const r = await page.evaluate(() => {
    const s = window.__g.scene.getScene('Town');
    const bonus = typeof DAILY_BONUS !== 'undefined' ? DAILY_BONUS : null;
    const base = s.dailyItems.bind(s);
    s.dailyItems = () => base().map((i) => (i.status === 'na' ? i : Object.assign({}, i, { status: 'done' })));
    const rec0 = s.dailiesRecord();
    const paid = []; const ap = s.awardPoint.bind(s); s.awardPoint = (a, ...r) => { paid.push(a); return ap(a, ...r); }; // an achievement may pay on top (daily7 etc.), so count the bonus call itself
    s.refreshDailies();
    const first = paid.filter((a) => a === 40).length;
    s.refreshDailies(); s.refreshDailies();
    const total = paid.filter((a) => a === 40).length;
    s.openDailies(); s.renderDailies();
    const summary = document.getElementById('dailies-summary').textContent;
    return { bonus, paid0: rec0.paid, first, total, summary, paid1: s.dailiesRecord().paid };
  });
  check('DAILY_BONUS is 40 (30-60 band; was 5)', r.bonus === 40, String(r.bonus));
  check('the card was not paid before the test', r.paid0 === false, JSON.stringify(r));
  check('finishing every chore pays the bonus once (one 40-star award)', r.first === 1, 'bonus calls ' + r.first);
  check('two more polls pay nothing (once a day)', r.total === 1 && r.paid1 === true, JSON.stringify(r));
  check('the panel footer names the +40 bonus as collected', /\+40 ⭐ collected/.test(r.summary), r.summary);
  check('no page errors', errors.length === 0, errors.join(' | '));
  check('offline: db.attempts() === 0', db.attempts() === 0, String(db.attempts()));
  await browser.close();
  done();
})();
