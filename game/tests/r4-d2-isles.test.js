// R4-D2 Isles first screen (b06-r2-05 / b06-r2-06), how-to card (b06-r2-09) and lift-off framing (b06-r2-08). Phone 390x844.
// (1) meadow and jungle: wildlife in view on arrival (calm groups from 3 tiles), never a hostile or big creature within 7 tiles;
//     ?firstfill=0 keeps the old empty start; (2) the first-visit how-to closes when a hostile creature comes within 9 tiles;
// (3) the lift-off pad sits at 60% of the view. Fresh storage per context = first visit. Firebase blocked in every context.
// Run: BASE=http://localhost:8440/game/index.html node game/tests/r4-d2-isles.test.js
const { chromium } = require('playwright');
const { check, done, blockDb } = require('./helpers');
const ORIGIN = (process.env.BASE || 'http://localhost:8440/game/index.html').replace(/\/game\/index\.html.*$/, '');
const ISLE = (q) => ORIGIN + '/game/games/isles/index.html?test=1&' + q;

async function open(browser, q) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  await blockDb(ctx);
  const page = await ctx.newPage(); const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(ISLE(q));
  await page.waitForFunction(() => window.__isles && window.__isles.hero, null, { timeout: 30000 });
  await page.waitForTimeout(1500); // a few spawn ticks
  return { ctx, page, errors };
}
const VIEW = () => { const I = window.__isles, h = I.hero(), T = I.tile; const cs = I.creatures();
  const inView = cs.filter((c) => Math.abs(c.x - h.x) < 195 && Math.abs(c.y - h.y) < 422);
  const close = cs.filter((c) => Math.hypot(c.x - h.x, c.y - h.y) < 7 * T);
  return { n: cs.length, view: inView.length, closeBad: close.filter((c) => c.mood === 'hostile' || c.size === 'L' || c.size === 'XL').length, close: close.length }; };

(async () => {
  const browser = await chromium.launch(); const errs = [];
  for (const isle of ['meadow', 'jungle']) {
    const A = await open(browser, 'isle=' + isle);
    const a = await A.page.evaluate(VIEW);
    const B = await open(browser, 'isle=' + isle + '&firstfill=0');
    const b = await B.page.evaluate(VIEW);
    console.log('INFO ' + isle + ' first screen: now ' + JSON.stringify(a) + ', ?firstfill=0 ' + JSON.stringify(b));
    check(isle + ': wildlife on the first screen at arrival (b06-r2-05)', a.view >= 1, JSON.stringify(a));
    check(isle + ': no hostile or big creature placed within 7 tiles of the arrival', a.closeBad === 0, JSON.stringify(a));
    check(isle + ': ?firstfill=0 keeps the old start (nothing within 7 tiles)', b.close === 0, JSON.stringify(b));
    errs.push(...A.errors, ...B.errors); await A.ctx.close(); await B.ctx.close();
  }
  { // how-to card: open on a first visit, closes when a hostile comes close
    const C = await open(browser, 'isle=jungle&firstfill=0');
    const before = await C.page.evaluate(() => window.__isles.howto());
    const r = await C.page.evaluate(async () => {
      const I = window.__isles, h = I.hero(); const sp = I.packSpecies.find((s) => !/turtle|tyrant|tusktop|stegolith/.test(s)) || I.packSpecies[0];
      const id = I.spawn(sp, h.tx + 3, h.ty); I.anger(id);
      await new Promise((res) => setTimeout(res, 1500));
      return Object.assign(I.howto(), { sp });
    });
    check('how-to card is shown on a first visit', before.open === true, JSON.stringify(before));
    check('how-to card closes by itself when a hostile creature is within 9 tiles (b06-r2-09)', r.open === false && r.auto >= 1, JSON.stringify(r));
    const pad = await C.page.evaluate(() => window.__isles.launchPad());
    check('lift-off pad at 60% of the view height (b06-r2-08: was 78%)', pad === Math.round(844 * 0.6), String(pad));
    errs.push(...C.errors); await C.ctx.close();
  }
  check('no page errors', errs.length === 0, errs.join(' | '));
  await browser.close();
  done();
})().catch((e) => { console.error(e); process.exit(1); });
