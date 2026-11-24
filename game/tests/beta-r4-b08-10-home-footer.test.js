// Round 4 (D1), b08-r2-10: on a fresh phone Home the footer read "<- Town", "Daily gift", "Map", "Open": "<- Town" duplicated the Town
// card / PLAY and "Open" acts on a map node Home does not show. On Home the footer now shows Daily gift + Map only; the map view keeps
// all four (nothing removed). Phone 390x844, DB blocked. Run: NODE_PATH=$(npm root -g) BASE=http://localhost:8440/game/index.html node game/tests/beta-r4-b08-10-home-footer.test.js
const { chromium } = require('playwright');
const { check, done, blockDb } = require('./helpers');
const ORIGIN = (process.env.BASE || 'http://localhost:8440/game/index.html').replace(/\/game\/index\.html.*$/, '');
const shown = (page) => page.evaluate(() => Array.from(document.querySelectorAll('#bar a, #bar button')).filter((e) => e.getClientRects().length > 0 && getComputedStyle(e).visibility !== 'hidden').map((e) => e.id));

(async () => {
  const browser = await chromium.launch();
  try {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
    const db = await blockDb(ctx);
    const page = await ctx.newPage(); const errors = []; page.on('pageerror', (e) => errors.push(e.message));
    await page.goto(ORIGIN + '/game/hub/index.html');
    await page.evaluate(() => localStorage.clear());
    await page.goto(ORIGIN + '/game/hub/index.html');
    await page.waitForFunction(() => document.body.classList.contains('home-on'), null, { timeout: 15000 });
    const h = await shown(page);
    check('b08-r2-10: Home footer shows Daily gift and Map only (no "<- Town", no "Open")', JSON.stringify(h) === JSON.stringify(['gift-btn', 'view-toggle']), JSON.stringify(h));
    const town = await page.evaluate(() => !!document.querySelector('#home a.home-card[data-place="town"]'));
    check('the Town is still one tap away on Home (its card)', town);
    await page.click('#view-toggle');
    await page.waitForFunction(() => !document.body.classList.contains('home-on'), null, { timeout: 5000 });
    const m = await shown(page);
    check('map view keeps "<- Town", Daily gift, Home and Open', ['hub-town', 'gift-btn', 'view-toggle', 'open-btn'].every((id) => m.includes(id)), JSON.stringify(m));
    await page.click('#view-toggle');
    const h2 = await shown(page);
    check('back on Home the footer is Daily gift + Map again', JSON.stringify(h2) === JSON.stringify(['gift-btn', 'view-toggle']), JSON.stringify(h2));
    check('no pageerror, no database traffic', errors.length === 0 && db.attempts() === 0, errors.join(' | '));
    await ctx.close();
  } finally { await browser.close(); }
  done();
})();
