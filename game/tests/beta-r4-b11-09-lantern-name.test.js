// Round 4 (D1), b11-09: on a fresh Lantern Camp, pressing Create hero with an empty name was stopped by the browser's own required check
// and left the old status line ("Create a hero first ...") unchanged. Now the status says what to do. Phone 390x844, DB blocked.
// Run: NODE_PATH=$(npm root -g) BASE=http://localhost:8440/game/index.html node game/tests/beta-r4-b11-09-lantern-name.test.js
const { chromium } = require('playwright');
const { check, done, blockDb } = require('./helpers');
const ORIGIN = (process.env.BASE || 'http://localhost:8440/game/index.html').replace(/\/game\/index\.html.*$/, '');

(async () => {
  const browser = await chromium.launch();
  try {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
    await blockDb(ctx);
    const page = await ctx.newPage(); const errors = []; page.on('pageerror', (e) => errors.push(e.message));
    await page.goto(ORIGIN + '/game/games/mad-maze/lantern.css');
    await page.evaluate(() => localStorage.clear());
    await page.goto(ORIGIN + '/game/games/mad-maze/lantern.html?test=1');
    await page.waitForSelector('#new-create');
    const s0 = await page.textContent('#status');
    await page.fill('#new-name', '');
    await page.click('#new-create');
    const s1 = await page.evaluate(() => ({ t: document.getElementById('status').textContent, err: document.getElementById('status').className }));
    check('b11-09: an empty-name Create changes the status to a clear "give your hero a name" message', s1.t !== s0 && /name/i.test(s1.t) && s1.err === 'err', JSON.stringify({ s0, s1 }));
    const heroes = await page.evaluate(() => { try { return JSON.parse(localStorage.getItem('pixeltown-mm-v1') || '{}').heroes || []; } catch (e) { return 'bad'; } });
    check('b11-09: no hero was created', Array.isArray(heroes) && heroes.length === 0, JSON.stringify(heroes));
    await page.fill('#new-name', 'ADMIN Ranger');
    await page.click('#new-create');
    const s2 = await page.textContent('#status');
    check('b11-09: with a name the hero is created and the warning goes', !/give your hero a name/i.test(s2), s2);
    check('no pageerror', errors.length === 0, errors.join(' | '));
    await ctx.close();
  } finally { await browser.close(); }
  done();
})();
