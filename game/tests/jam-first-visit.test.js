// Campfire Jam first visit: the optional timing check never blocks the song list.
// Playwright, phone 390x844. Run: NODE_PATH=$(npm root -g) BASE=http://localhost:8440/game/index.html node game/tests/jam-first-visit.test.js
const { chromium } = require('playwright');
let failed = 0;
function check(name, cond, extra = '') { console.log((cond ? 'PASS ' : 'FAIL ') + name + (cond ? '' : ' ' + extra)); if (!cond) failed++; }
const ORIGIN = (process.env.BASE || 'http://localhost:8440/game/index.html').replace(/\/game\/index\.html.*$/, '');
const URL = ORIGIN + '/game/games/jam/index.html?test=1';
const KEY = 'pixeltown-jam-v1';

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  const page = await ctx.newPage(); const errors = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  await page.goto(URL); await page.waitForFunction(() => window.__jam);

  check('first visit: song list shown with the first song playable, offset 0', await page.evaluate(() => { const b = document.querySelector('button[data-song="warm-embers"][data-tier="easy"]'); return !!b && !b.disabled && window.__jam.offset === 0 && window.__jam.mode === 'menu'; }));
  check('timing check is an optional card after the song list', await page.evaluate(() => { const c = document.getElementById('cal-card'), l = document.querySelector('.songs'); return !!c && !!l && /recommended/i.test(c.textContent) && !!(l.compareDocumentPosition(c) & Node.DOCUMENT_POSITION_FOLLOWING); }));
  check('no horizontal scroll at 390', await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth));
  check('card buttons are >= 44 px', await page.evaluate(() => [...document.querySelectorAll('#cal-card button')].every((b) => b.getBoundingClientRect().height >= 44)));
  await page.click('button[data-song="warm-embers"][data-tier="easy"]');
  check('Play works at once without calibrating', await page.evaluate((k) => window.__jam.mode === 'play' && !('offsetMs' in (JSON.parse(localStorage.getItem(k) || '{}'))), KEY));
  check('no console errors', errors.length === 0, errors.join(' | '));
  await browser.close();
  console.log(failed ? failed + ' FAILED' : 'ALL PASSED');
  process.exit(failed ? 1 : 0);
})();
