// b15-r2-16: the Lantern Camp page with site data blocked (the localStorage getter throws): no uncaught error on boot or on Download backup.
// Run: BASE=http://localhost:8440/game/index.html node game/tests/beta-r3-lantern-blocked.test.js
const { chromium } = require('playwright');
const { check, done, blockDb } = require('./helpers');
const ORIGIN = (process.env.BASE || 'http://localhost:8440/game/index.html').replace(/\/game\/index\.html.*$/, '');

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  await blockDb(ctx);
  await ctx.addInitScript(() => { Object.defineProperty(window, 'localStorage', { configurable: true, get() { throw new DOMException('The operation is insecure.', 'SecurityError'); } }); });
  const page = await ctx.newPage(); const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(ORIGIN + '/game/games/mad-maze/lantern.html');
  await page.waitForTimeout(2000);
  check('Lantern boots with storage blocked: zero pageerror', errors.length === 0, errors.join(' | '));
  const vis = await page.evaluate(() => document.body && document.body.getBoundingClientRect().height > 100);
  check('the page renders', vis);
  const n0 = errors.length;
  const clicked = await page.evaluate(() => { const b = Array.from(document.querySelectorAll('button')).find((x) => /backup|download/i.test(x.textContent) && x.offsetParent); if (!b) return false; b.click(); return true; });
  await page.waitForTimeout(500);
  check('Download backup with storage blocked raises no error (or is not offered)', errors.length === n0, (clicked ? 'clicked ' : 'no button ') + errors.slice(n0).join(' | '));
  await ctx.close(); await browser.close();
  done();
})().catch((e) => { console.error(e); process.exit(1); });
