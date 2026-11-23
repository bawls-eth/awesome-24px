// W-18 (b05-10, b06-09, b15-14): the Isles first-visit how-to card: a 44 px close button that works, off the hero on desktop, and a toast
// shown while it is up never prints on its text (phone).
// Run: BASE=http://localhost:8440/game/index.html node game/tests/beta-w18-isles-howto.test.js
const { chromium } = require('playwright');
const { check, done, blockDb } = require('./helpers');
const ORIGIN = (process.env.BASE || 'http://localhost:8440/game/index.html').replace(/\/game\/index\.html.*$/, '');
const PAGE = ORIGIN + '/game/games/isles/index.html?test=1&seed=123&isle=jungle';
const hit = (a, b) => !!(a && b && a.x < b.r - 0.5 && b.x < a.r - 0.5 && a.y < b.b - 0.5 && b.y < a.b - 0.5);

async function open(browser, vp, touch) {
  const ctx = await browser.newContext(Object.assign({ viewport: vp }, touch ? { hasTouch: true, isMobile: true } : {}));
  await blockDb(ctx);
  const page = await ctx.newPage(); const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.addInitScript(() => { if (sessionStorage.s) return; sessionStorage.s = 1; localStorage.clear(); });
  await page.goto(PAGE);
  await page.waitForFunction(() => window.__isles && window.__isles.world);
  await page.waitForTimeout(300);
  return { ctx, page, errors };
}
const box = (page, sel) => page.evaluate((s) => { const e = document.querySelector(s); if (!e || e.hidden) return null; const cs = getComputedStyle(e); if (cs.display === 'none' || cs.visibility === 'hidden' || cs.opacity === '0') return null; const r = e.getBoundingClientRect(); return { x: r.left, y: r.top, r: r.right, b: r.bottom, w: r.width, h: r.height }; }, sel);

(async () => {
  const browser = await chromium.launch(); const errs = [];
  const D = await open(browser, { width: 1280, height: 720 }, false); const dp = D.page;
  const card = await box(dp, '#howto'); const hero = { x: 640 - 16, r: 640 + 16, y: 360 - 40, b: 360 + 4 };
  check('desktop: the how-to card shows on a first visit and does not cover the hero at the screen centre', card && !hit(card, hero), JSON.stringify(card));
  const x = await box(dp, '#howto-close');
  check('the card has a close button >= 44x44 px', x && x.w >= 44 && x.h >= 44, JSON.stringify(x));
  await dp.click('#howto-close');
  check('the close button hides the card', (await box(dp, '#howto')) === null);
  errs.push(...D.errors); await D.ctx.close();
  const P = await open(browser, { width: 390, height: 844 }, true); const pp = P.page;
  await pp.evaluate(() => { const t = document.getElementById('toast'); t.textContent = 'New in your journal: Glowmoth'; t.classList.add('on'); });
  await pp.waitForTimeout(250);
  const c2 = await box(pp, '#howto'), t2 = await box(pp, '#toast');
  check('phone: with the card up, a toast does not print on the card', c2 && t2 && !hit(c2, t2), JSON.stringify({ c2, t2 }));
  await pp.focus('#howto-close'); await pp.keyboard.press('Enter');
  check('phone: the close button works from the keyboard', (await box(pp, '#howto')) === null);
  errs.push(...P.errors); await P.ctx.close();
  check('no page errors', errs.length === 0, errs.join('|'));
  await browser.close();
  done();
})().catch((e) => { console.error(e); process.exit(1); });
