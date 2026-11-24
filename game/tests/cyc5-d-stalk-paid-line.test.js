// Cycle 5 D, b11-r3-08 (P3): the Stalk price note said "You paid about 90 on Sunday" with 0 stalks owned. It must claim a purchase only when
// stalks were bought this week; with nothing bought it says so. Local page only (blockDb), no chat, no DB writes.
// Run: BASE=http://localhost:PORT/game/index.html node game/tests/cyc5-d-stalk-paid-line.test.js
const { chromium } = require('playwright');
const { check, done, blockDb } = require('./helpers');
const ORIGIN = (process.env.BASE || 'http://localhost:8440/game/index.html').replace(/\/game\/index\.html.*$/, '');
const PAGE = ORIGIN + '/game/games/stalk/index.html';
(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  await blockDb(ctx);
  const page = await ctx.newPage(); const errors = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  await page.goto(PAGE + '?test=1&week=100&slot=0');
  await page.waitForFunction(() => window.__stalk);
  const note = () => page.evaluate(() => document.getElementById('price-note').textContent);
  // Tuesday, nothing bought on Sunday
  await page.evaluate(() => window.__stalk.setTime(100, 3));
  const a = await note();
  check('0 stalks bought: no "You paid" line, says so instead', !/You paid/.test(a) && /no stalks this week/.test(a), a);
  // Sunday buy, then Tuesday: the line returns
  await page.evaluate(() => { const s = window.__stalk; s.setTime(101, 0); s.buy(5); s.setTime(101, 3); });
  const b = await note();
  check('stalks held: "You paid up to about N on Sunday" shown', /You paid up to about \d+ on Sunday/.test(b), b);
  // sold out after buying: the purchase was real, the line stays truthful
  await page.evaluate(() => { const s = window.__stalk; s.sell(s.save.holdings); });
  const c = await page.evaluate(() => ({ h: window.__stalk.save.holdings, t: document.getElementById('price-note').textContent }));
  check('sold out after buying: still says what was paid (no false "no stalks" claim)', c.h === 0 && /You paid about \d+ on Sunday/.test(c.t), JSON.stringify(c));
  check('no page errors', errors.length === 0, errors.join(' | '));
  await ctx.close(); await browser.close();
  done();
})().catch((e) => { console.error(e); process.exit(1); });
