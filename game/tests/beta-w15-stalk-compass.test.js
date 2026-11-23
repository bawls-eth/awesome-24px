// W-15 (b11-06, b12-17): after "Play a practice week" scrolls to its section, the heading is not under the fixed Menu (compass) button.
// Run: BASE=http://localhost:8440/game/index.html node game/tests/beta-w15-stalk-compass.test.js
const { chromium } = require('playwright');
const { check, done, blockDb } = require('./helpers');
const ORIGIN = (process.env.BASE || 'http://localhost:8440/game/index.html').replace(/\/game\/index\.html.*$/, '');
const hit = (a, b) => !!(a && b && a.x < b.r - 0.5 && b.x < a.r - 0.5 && a.y < b.b - 0.5 && b.y < a.b - 0.5);

(async () => {
  const browser = await chromium.launch(); const errs = [];
  for (const vp of [{ width: 390, height: 844 }, { width: 1280, height: 720 }]) {
    const ctx = await browser.newContext(Object.assign({ viewport: vp, reducedMotion: 'reduce' }, vp.width < 500 ? { hasTouch: true, isMobile: true } : {}));
    await blockDb(ctx);
    const page = await ctx.newPage(); page.on('pageerror', (e) => errs.push(e.message));
    await page.goto(ORIGIN + '/game/games/stalk/index.html?test=1');
    await page.waitForTimeout(800);
    await page.evaluate(() => { const b = document.getElementById('entry-practice') || document.getElementById('go-practice'); if (b) b.click(); else document.getElementById('practice').scrollIntoView({ block: 'start' }); });
    await page.waitForTimeout(500);
    const m = await page.evaluate(() => { const r = (e) => { if (!e) return null; const q = e.getBoundingClientRect(); return { x: q.left, y: q.top, r: q.right, b: q.bottom }; };
      const sec = document.getElementById('practice'); const h = sec.querySelector('h2, h3') || sec; const nav = document.getElementById('mm-nav-btn'); return { h: r(h), nav: r(nav), sy: scrollY, sm: getComputedStyle(sec).scrollMarginTop }; });
    const tag = vp.width + 'x' + vp.height;
    check(tag + ': the page scrolled to the practice section', m.sy > 0 || m.h.y < 200, JSON.stringify(m));
    check(tag + ': the practice heading does not intersect the Menu button', m.nav && !hit(m.h, m.nav), JSON.stringify(m));
    check(tag + ': the heading top is below the Menu button bottom + 4 px', m.nav && m.h.y >= m.nav.b + 4 - 0.5, JSON.stringify(m));
    await ctx.close();
  }
  check('no page errors', errs.length === 0, errs.join('|'));
  await browser.close();
  done();
})().catch((e) => { console.error(e); process.exit(1); });
