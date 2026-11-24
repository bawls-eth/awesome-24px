// Round 4 (D1), b09-12: on a 390 px phone a 6-digit Pixel Pop score / best touched or overran its HUD box border. Every HUD number up to
// 7 digits stays inside its box with at least 2 px to spare, on one line, at 320, 360 and 390 px wide. No network.
// Run: NODE_PATH=$(npm root -g) BASE=http://localhost:8440/game/index.html node game/tests/beta-r4-b09-12-pop-hud-fit.test.js
const { chromium } = require('playwright');
const { check, done, blockDb } = require('./helpers');
const ORIGIN = (process.env.BASE || 'http://localhost:8440/game/index.html').replace(/\/game\/index\.html.*$/, '');

(async () => {
  const browser = await chromium.launch();
  try {
    for (const w of [320, 360, 390]) {
      const ctx = await browser.newContext({ viewport: { width: w, height: 844 }, hasTouch: true, isMobile: true });
      await blockDb(ctx);
      const page = await ctx.newPage(); const errors = []; page.on('pageerror', (e) => errors.push(e.message));
      await page.goto(ORIGIN + '/game/games/pop/index.html');
      await page.waitForSelector('#h-best');
      const r = await page.evaluate(() => {
        document.getElementById('h-score').textContent = '193820'; document.getElementById('h-best').textContent = '1938200';
        document.getElementById('h-tile').textContent = '12'; document.getElementById('h-time').textContent = '90';
        return Array.from(document.querySelectorAll('#hud .stat')).map((s) => {
          const st = s.querySelector('strong'); const rs = s.getBoundingClientRect(), rt = st.getBoundingClientRect();
          const rg = document.createRange(); rg.selectNodeContents(st); const tx = rg.getBoundingClientRect();
          return { id: st.id, spare: Math.round((rs.right - tx.right) * 10) / 10, left: Math.round((tx.left - rs.left) * 10) / 10, lines: Math.round(rt.height / parseFloat(getComputedStyle(st).lineHeight || rt.height)) || 1, h: Math.round(rt.height) };
        });
      });
      const bad = r.filter((x) => x.spare < 2 || x.left < 2);
      check(`[${w}px] b09-12: every HUD number (6-7 digits) sits inside its box with >= 2 px spare`, bad.length === 0, JSON.stringify(r));
      const one = r.every((x) => x.h <= 30);
      check(`[${w}px] b09-12: each HUD number stays on one line`, one, JSON.stringify(r));
      check(`[${w}px] no pageerror`, errors.length === 0, errors.join(' | '));
      await ctx.close();
    }
  } finally { await browser.close(); }
  done();
})();
