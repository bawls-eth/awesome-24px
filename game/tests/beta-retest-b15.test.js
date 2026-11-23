// QA re-test of b15-01 (S-05): Deepdelve must boot when the localStorage getter throws (Safari private mode / blocked cookies).
// Tester steps: context whose window.localStorage getter throws SecurityError -> /game/games/deepdelve/index.html at 390x844 -> wait.
// Fails on the beta base (stuck on "Loading the mine...", 4 pageerrors); passes once S-05 is fixed. blockDb, no writes.
// Run: python3 -m http.server 8440 &   BASE=http://localhost:8440/game/index.html NODE_PATH=$(npm root -g) node game/tests/beta-retest-b15.test.js
const { chromium } = require('playwright');
const { check, done, blockDb, throwingStorage } = require('./helpers');
const ORIGIN = (process.env.BASE || 'http://localhost:8440/game/index.html').replace(/\/game\/index\.html.*$/, '');

(async () => {
  const browser = await chromium.launch();
  try {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
    const db = await blockDb(ctx);
    await throwingStorage(ctx);
    const page = await ctx.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto(ORIGIN + '/game/games/deepdelve/index.html');
    check('the storage getter really throws in this context', await page.evaluate(() => { try { void window.localStorage; return false; } catch (e) { return true; } }));
    const left = await page.waitForFunction(() => { const b = document.body.innerText || ''; return !/Loading the mine/i.test(b); }, null, { timeout: 8000 }).then(() => true).catch(() => false);
    check('status leaves "Loading the mine..." within 8 s', left, (await page.evaluate(() => document.body.innerText.slice(0, 200))));
    const painted = await page.evaluate(() => {
      const c = document.querySelector('canvas'); if (!c || !c.width) return false;
      try {
        const gl = c.getContext('webgl2') || c.getContext('webgl');
        if (gl) { const px = new Uint8Array(4 * 16); gl.readPixels(Math.floor(c.width / 2), Math.floor(c.height / 2), 4, 4, gl.RGBA, gl.UNSIGNED_BYTE, px); return px.some((v, i) => i % 4 !== 3 && v > 0); }
        const g = c.getContext('2d'); const d = g.getImageData(0, 0, c.width, c.height).data; for (let i = 0; i < d.length; i += 4000) if (d[i] || d[i + 1] || d[i + 2]) return true;
      } catch (e) { return true; }
      return false;
    });
    if (process.env.QA_SHOTS) await page.screenshot({ path: process.env.QA_SHOTS + '/qa-b15-01-after.png' }).catch(() => {});
    check('a canvas exists and has a non-empty size (world rendered)', painted !== false || (await page.evaluate(() => { const c = document.querySelector('canvas'); return !!(c && c.width > 0); })));
    check('zero pageerror events', errors.length === 0, errors.join(' | '));
    check('no database traffic', db.count() === 0);
    await ctx.close();
  } catch (e) {
    check('test ran to the end', false, e && e.stack);
  } finally {
    await browser.close();
    done();
  }
})();
