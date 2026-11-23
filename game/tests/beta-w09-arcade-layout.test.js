// W-09 (b09-01, b09-08, b09-09, b10-03, b15-03): arcade / hub layout at phone sizes.
// Run: BASE=http://localhost:8440/game/index.html node game/tests/beta-w09-arcade-layout.test.js
const { chromium } = require('playwright');
const { check, done, blockDb } = require('./helpers');
const ORIGIN = (process.env.BASE || 'http://localhost:8440/game/index.html').replace(/\/game\/index\.html.*$/, '');
const G = (p) => ORIGIN + '/game/' + p;
const hit = (a, b) => !!(a && b && a.x < b.r - 0.5 && b.x < a.r - 0.5 && a.y < b.b - 0.5 && b.y < a.b - 0.5);
const rect = (page, sel) => page.evaluate((s) => { const e = document.querySelector(s); if (!e || !e.getClientRects().length) return null; const r = e.getBoundingClientRect(); return { x: r.left, y: r.top, r: r.right, b: r.bottom, w: r.width, h: r.height }; }, sel);

async function open(browser, url, vp, touch) {
  const ctx = await browser.newContext(Object.assign({ viewport: vp }, touch ? { hasTouch: true, isMobile: true } : {}));
  await blockDb(ctx);
  await ctx.route('**/game/index.html*', (r) => r.fulfill({ contentType: 'text/html', body: '<!doctype html><title>town</title>town' }));
  const page = await ctx.newPage(); const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(url); await page.waitForTimeout(500);
  return { ctx, page, errors };
}

(async () => {
  const browser = await chromium.launch(); const errs = [];
  // (1) Pop: a 6-digit score keeps the score stat on one line (height unchanged vs a 1-digit score)
  { const P = await open(browser, G('games/pop/index.html?test=1&seed=w09'), { width: 390, height: 844 }, true); const p = P.page;
    await p.waitForFunction(() => window.__pop); await p.click('#play').catch(() => {});
    const h = await p.evaluate(async () => { const s = document.querySelector('#hud .stat strong'); const box = s.closest('.stat'); s.textContent = '7'; await new Promise((r) => requestAnimationFrame(r)); const h1 = box.getBoundingClientRect().height; s.textContent = '244470'; await new Promise((r) => requestAnimationFrame(r)); const h6 = box.getBoundingClientRect().height; return { h1, h6, sw: s.scrollWidth, cw: box.clientWidth }; });
    check('Pop 390: a 6-digit score keeps the stat box height (one line)', h.h6 === h.h1, JSON.stringify(h));
    errs.push(...P.errors); await P.ctx.close(); }
  // (2) Jam at 150% portrait (260x563): all four pads fully inside the viewport during play
  { const J = await open(browser, G('games/jam/index.html?test=1'), { width: 260, height: 563 }, true); const p = J.page;
    await p.waitForFunction(() => window.__jam);
    await p.evaluate(() => { const b = Array.from(document.querySelectorAll('#overlay button')).find((x) => /^Play/.test(x.textContent)); if (b) b.click(); });
    await p.waitForTimeout(600);
    const pads = await p.evaluate(() => Array.from(document.querySelectorAll('#pads .pad')).map((e) => { const r = e.getBoundingClientRect(); return { t: r.top, b: r.bottom, h: r.height }; }));
    const ov = await p.evaluate(() => { const o = document.getElementById('overlay'); return !!o && !o.hidden; });
    check('Jam 260x563: four pads fully inside the viewport while a song plays (>= 44 px tall)', !ov && pads.length === 4 && pads.every((q) => q.t >= 0 && q.b <= 563 && q.h >= 44), JSON.stringify({ ov, pads }));
    errs.push(...J.errors); await J.ctx.close(); }
  // (3) Dash result card above the fold: left open (dash-page pins the card below the scene and the card is ~590 px tall; needs a compact card in dash.js)
  // (4) Stack / Pop: the intro card does not cover the Sound button
  for (const g of ['stack', 'pop']) {
    const S = await open(browser, G('games/' + g + '/index.html?test=1'), { width: 390, height: 844 }, true); const p = S.page;
    const intro = await rect(p, '#intro'), mute = await rect(p, '#btn-mute');
    check(g + ' 390: the intro card and the Sound button are disjoint', intro && mute && !hit(intro, mute), JSON.stringify({ intro, mute }));
    errs.push(...S.errors); await S.ctx.close();
  }
  // (5) Hub at 195 CSS px: one column, card titles not ellipsised, bottom bar inside the viewport
  { const H = await open(browser, G('hub/index.html'), { width: 195, height: 422 }, true); const p = H.page;
    await p.waitForTimeout(800);
    const m = await p.evaluate(() => { const cards = Array.from(document.querySelectorAll('.home-cards')).map((u) => getComputedStyle(u).gridTemplateColumns.split(' ').length); const names = Array.from(document.querySelectorAll('.hc-name')).filter((e) => e.getClientRects().length).map((e) => ({ t: e.textContent, clipped: e.scrollWidth > e.clientWidth + 1 }));
      const bar = document.getElementById('bar').getBoundingClientRect(); const kids = Array.from(document.querySelectorAll('#bar > *')).filter((e) => e.getClientRects().length).map((e) => { const r = e.getBoundingClientRect(); return { l: r.left, r: r.right }; });
      return { cards, names, bar: { l: bar.left, r: bar.right, b: bar.bottom }, kids, iw: innerWidth }; });
    check('Hub 195 px: the card grid is one column', m.cards.length > 0 && m.cards.every((n) => n === 1), JSON.stringify(m.cards));
    check('Hub 195 px: no card title is ellipsised', m.names.length > 0 && m.names.every((n) => !n.clipped), JSON.stringify(m.names.filter((n) => n.clipped)));
    check('Hub 195 px: the bottom bar and its buttons are inside the viewport', m.bar.l >= -0.5 && m.bar.r <= m.iw + 0.5 && m.kids.every((k) => k.l >= -0.5 && k.r <= m.iw + 0.5), JSON.stringify(m));
    errs.push(...H.errors); await H.ctx.close(); }
  check('no page errors', errs.length === 0, errs.join(' | '));
  await browser.close();
  done();
})().catch((e) => { console.error(e); process.exit(1); });
