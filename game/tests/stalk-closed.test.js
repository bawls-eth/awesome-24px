// Stalk Market: disabled Buy/Sell buttons explain why. Playwright, phone 390x844.
// Run: NODE_PATH=$(npm root -g) BASE=http://localhost:8440/game/index.html node game/tests/stalk-closed.test.js
const { chromium } = require('playwright');
let failed = 0;
function check(name, cond, extra = '') { console.log((cond ? 'PASS ' : 'FAIL ') + name + (cond ? '' : ' ' + extra)); if (!cond) failed++; }
const ORIGIN = (process.env.BASE || 'http://localhost:8440/game/index.html').replace(/\/game\/index\.html.*$/, '');
const PAGE = ORIGIN + '/game/games/stalk/index.html';

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  const page = await ctx.newPage(); const errors = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  await page.goto(PAGE + '?test=1&week=100&slot=0'); await page.waitForFunction(() => window.__stalk);

  const reason = () => page.evaluate(() => document.getElementById('market-reason').textContent);
  check('Sunday: sell disabled and the reason says selling is closed', await page.evaluate(() => document.getElementById('sell1').disabled && document.getElementById('sellall').disabled) && /Selling closed/.test(await reason()), await reason());
  check('all four buttons point to the reason with aria-describedby', await page.evaluate(() => ['buy1', 'buy10', 'sell1', 'sellall'].every((i) => document.getElementById(i).getAttribute('aria-describedby') === 'market-reason')));
  await page.evaluate(() => window.__stalk.setTime(100, 3));
  check('weekday: buy disabled and the reason says buy on Sunday', await page.evaluate(() => document.getElementById('buy1').disabled && document.getElementById('buy10').disabled) && /Buying closed.*Sunday/.test(await reason()), await reason());
  check('reason is visible beside the buttons, no horizontal scroll', await page.evaluate(() => { const r = document.getElementById('market-reason').getBoundingClientRect(), a = document.getElementById('actions').getBoundingClientRect(); return r.height > 0 && r.top >= a.bottom - 1 && Math.abs(r.top - a.bottom) < 60 && document.documentElement.scrollWidth <= window.innerWidth; }));
  check('reason element holds plain text only (no child elements)', await page.evaluate(() => document.getElementById('market-reason').children.length === 0));
  check('no console errors', errors.length === 0, errors.join(' | '));
  await browser.close();
  console.log(failed ? `${failed} FAILED` : 'ALL PASSED');
  process.exitCode = failed ? 1 : 0;
})();
