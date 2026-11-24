// Round 4 (D1), b10-15: a tournament cast's result card showed the generic medal / "Next goal" list and no running total. Now it says
// "Tournament: cast N/5 - X points so far - K casts left." and leaves the medal list out; a normal cast card keeps its medals.
// Phone 390x844, DB blocked. Run: NODE_PATH=$(npm root -g) BASE=http://localhost:8440/game/index.html node game/tests/beta-r4-b10-15-tour-card.test.js
const { chromium } = require('playwright');
const { check, done, blockDb } = require('./helpers');
const ORIGIN = (process.env.BASE || 'http://localhost:8440/game/index.html').replace(/\/game\/index\.html.*$/, '');
const reel = (page) => page.evaluate(() => {
  const a = window.__angler; a.tap(); a.advance(a.bite.wait + 0.2); a.tap();
  for (let i = 0; i < 4000 && a.state === 'reeling'; i++) { a.setHold(a.reel.tension < a.reel.pos); a.advance(1 / 30); }
  a.setHold(false);
  const r = document.getElementById('result');
  return { state: a.state, text: r.textContent, medals: !!document.getElementById('res-medals'), tour: (document.getElementById('res-tour') || {}).textContent || '' };
});

(async () => {
  const browser = await chromium.launch();
  try {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
    await blockDb(ctx);
    const page = await ctx.newPage(); const errors = []; page.on('pageerror', (e) => errors.push(e.message));
    await page.goto(ORIGIN + '/game/games/angler/index.html?test=1&day=20000&seed=t');
    await page.waitForFunction(() => window.__angler && window.__angler.tourney, null, { timeout: 20000 });
    // a normal cast keeps the medal list
    const n = await reel(page);
    check('a normal cast card still lists the medals', n.state === 'result' && n.medals && !n.tour, JSON.stringify(n).slice(0, 300));
    await page.evaluate(() => window.__angler.dismiss());
    await page.evaluate(() => window.__angler.tourney.start());
    const c1 = await reel(page);
    check('b10-15: tournament cast 1 card shows "cast 1/5", points so far and 4 casts left', /cast 1\/5/.test(c1.tour) && /\d+ points so far/.test(c1.tour) && /4 casts left/.test(c1.tour), JSON.stringify(c1).slice(0, 400));
    check('b10-15: the tournament card has no medal / next-goal list', !c1.medals && !/Next goal/i.test(c1.text), JSON.stringify(c1).slice(0, 400));
    const pts1 = Number((/(\d+) points so far/.exec(c1.tour) || [])[1]);
    const sc = await page.evaluate(() => window.__angler.tourney.run.score);
    check('b10-15: the running total is the run score', pts1 === sc, JSON.stringify({ pts1, sc }));
    await page.evaluate(() => window.__angler.dismiss());
    let last = null;
    for (let i = 2; i <= 5; i++) { last = await reel(page); if (i < 5) await page.evaluate(() => window.__angler.dismiss()); }
    check('b10-15: cast 5 says it was the last cast', /cast 5\/5/.test(last.tour) && /last cast/.test(last.tour), JSON.stringify(last).slice(0, 300));
    check('no pageerror', errors.length === 0, errors.join(' | '));
    await ctx.close();
  } finally { await browser.close(); }
  done();
})();
