// Cycle 1 U-08: Bug Safari arena cards at 195 px wide (a 390 px phone at 200% zoom). Before, the two-column card grid was
// ~85 px per card and `overflow-wrap: anywhere` broke words mid-word ("Butterfl-ies"). Every word of every card must sit on
// one line (a word may only break when it alone is wider than the card), no horizontal scroll, cards >= 44 px tall.
// Static page, no database. Run: BASE=http://localhost:8440/game/index.html node game/tests/cyc1-ui-arena-cards.test.js
const { chromium } = require('playwright');
const { check, done, blockDb } = require('./helpers');
const BASE = process.env.BASE || 'http://localhost:8440/game/index.html';
const ROOT = BASE.replace(/game\/index\.html.*$/, '');
const SHOTS = process.env.SHOTS || null;

(async () => {
  const browser = await chromium.launch();
  for (const [w, h, dpr] of [[195, 422, 2], [390, 844, 1]]) {
    const tag = `${w}x${h}`;
    const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: dpr, hasTouch: true, isMobile: true });
    await blockDb(ctx);
    const page = await ctx.newPage();
    const errors = []; page.on('pageerror', (e) => errors.push(e.message));
    await page.goto(ROOT + 'game/games/festival/bugs.html');
    await page.waitForSelector('#overlay button.card', { timeout: 10000 });
    await page.waitForTimeout(300);
    const r = await page.evaluate(() => {
      const split = []; const cards = [...document.querySelectorAll('#overlay button.card')];
      cards.forEach((card) => {
        const cw = card.getBoundingClientRect().width;
        const walker = document.createTreeWalker(card, NodeFilter.SHOW_TEXT);
        for (let n = walker.nextNode(); n; n = walker.nextNode()) {
          const re = /\S+/g; let m;
          while ((m = re.exec(n.data))) {
            const range = document.createRange(); range.setStart(n, m.index); range.setEnd(n, m.index + m[0].length);
            const rects = [...range.getClientRects()].filter((x) => x.width > 0);
            const lines = new Set(rects.map((x) => Math.round(x.top)));
            const whole = rects.reduce((a, x) => a + x.width, 0);
            if (lines.size > 1 && whole < cw - 8) split.push(m[0]); // broke although the word alone fits the card
          }
        }
      });
      return { n: cards.length, split, minH: Math.min(...cards.map((c) => c.getBoundingClientRect().height)), sw: document.documentElement.scrollWidth, iw: innerWidth };
    });
    check(`${tag}: arena cards are shown`, r.n >= 3, JSON.stringify(r));
    check(`${tag}: no arena card word breaks mid-word`, r.split.length === 0, JSON.stringify(r.split));
    check(`${tag}: cards stay >= 44 px tall and the page has no horizontal scroll`, r.minH >= 44 && r.sw <= r.iw, JSON.stringify(r));
    check(`${tag}: no page errors`, errors.length === 0, errors.join('|'));
    if (SHOTS) await page.screenshot({ path: `${SHOTS}/cyc1-ui-bugs-${tag}.jpg`, type: 'jpeg', quality: 60 });
    await ctx.close();
  }
  await browser.close();
  done();
})();
