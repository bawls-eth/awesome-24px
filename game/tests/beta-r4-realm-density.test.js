// R4 D4 (b15-04 / b15-r2-15): Realm world HUD density on narrow phones. The touch controls (two sticks + the 2x2 ability pad) covered
// 17.9% of a 320x568 screen and 22.2% of 260x563 (150% zoom) on r4-integ b2de815; they now cover <= 13% / 16%, every button and stick
// stays >= 44 px, nothing overlaps another control, and 390x844 is unchanged (<= 10%). Database blocked (blockDb), never written.
// Run: BASE=http://localhost:8440/game/index.html node game/tests/beta-r4-realm-density.test.js
const { chromium } = require('playwright');
const { check, done, blockDb } = require('./helpers');
const ORIGIN = (process.env.BASE || 'http://localhost:8440/game/index.html').replace(/\/game\/index\.html.*$/, '');
const URL_ = ORIGIN + '/game/games/mad-maze/index.html?mode=world&test=1&seed=12345';

(async () => {
  const browser = await chromium.launch();
  const errors = [];
  for (const [w, h, max] of [[320, 568, 13], [260, 563, 16], [390, 844, 10]]) {
    const ctx = await browser.newContext({ viewport: { width: w, height: h }, hasTouch: true, isMobile: true });
    const db = await blockDb(ctx);
    const page = await ctx.newPage();
    page.on('pageerror', (e) => errors.push(w + ': ' + e.message));
    await page.goto(URL_);
    await page.waitForFunction(() => window.__mm && window.__mm.arena && window.__mm.arena.active, null, { timeout: 30000 });
    await page.waitForTimeout(1500);
    const r = await page.evaluate(() => {
      const vis = (e) => { const cs = getComputedStyle(e); const b = e.getBoundingClientRect(); return cs.display !== 'none' && cs.visibility !== 'hidden' && b.width > 0 && b.height > 0; };
      const els = [...document.querySelectorAll('#realm-abilities .realm-ab, #realm-stick-move, #realm-stick-aim')].filter(vis);
      const bs = els.map((e) => e.getBoundingClientRect());
      let n = 0, c = 0;
      for (let y = 0; y < innerHeight; y += 4) for (let x = 0; x < innerWidth; x += 4) { n++; if (bs.some((b) => x >= b.left && x < b.right && y >= b.top && y < b.bottom)) c++; }
      const hit = (a, b) => a.left < b.right - 0.5 && b.left < a.right - 0.5 && a.top < b.bottom - 0.5 && b.top < a.bottom - 0.5;
      let overlap = 0; for (let i = 0; i < bs.length; i++) for (let j = i + 1; j < bs.length; j++) if (hit(bs[i], bs[j])) overlap++;
      return { n: els.length, share: Math.round(1000 * c / n) / 10, min: Math.min(...bs.map((b) => Math.min(b.width, b.height))), overlap, inside: bs.every((b) => b.left >= 0 && b.right <= innerWidth && b.bottom <= innerHeight) };
    });
    const tag = `${w}x${h}: `;
    check(tag + `sticks + 4 ability buttons cover <= ${max}% of the screen (now ${r.share}%)`, r.n === 6 && r.share <= max, JSON.stringify(r));
    check(tag + 'every stick / ability button is >= 44 px, inside the screen, and none overlaps another', r.min >= 44 && r.inside && r.overlap === 0, JSON.stringify(r));
    check(tag + '0 database requests', db.attempts() === 0, JSON.stringify(db.http));
    await ctx.close();
  }
  check('no page errors', errors.length === 0, errors.join('|'));
  await browser.close();
  done();
})().catch((e) => { console.error(e); process.exit(1); });
