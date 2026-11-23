// W-10 (b09-03, b12-12): Echo Garden labels are never overprinted. The "+N in bloom" line sits above the board (DOM), not on a flower name
// or the centre tune / leaves widget; the selection frame and the pip row cross no name label; the "wilt" float stays inside its card for
// its whole rise; the 2x2 board fits 1280x720 without scrolling.
// Run: BASE=http://localhost:8440/game/index.html node game/tests/beta-w10-echo-labels.test.js
const { chromium } = require('playwright');
const { check, done, blockDb } = require('./helpers');
const BASE = process.env.BASE || 'http://localhost:8440/game/index.html';
const PAGE = BASE.replace(/index\.html.*$/, '') + 'games/echo/index.html?test=1&seed=bloom1';
const SHOTS = process.env.SHOTS || null;
const hit = (a, b) => !!(a && b && a.x < b.x + b.w - 0.01 && b.x < a.x + a.w - 0.01 && a.y < b.y + b.h - 0.01 && b.y < a.y + a.h - 0.01);

async function run(browser, vp, touch) {
  const ctx = await browser.newContext(Object.assign({ viewport: vp }, touch ? { hasTouch: true, isMobile: true } : {}));
  await blockDb(ctx);
  const page = await ctx.newPage(); const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(PAGE); await page.waitForFunction(() => window.__echo);
  await page.click('#play');
  const tag = vp.width + 'x' + vp.height;
  // echo the tune correctly: the bloom line appears
  const r = await page.evaluate(() => { __echo.listen(); const s = __echo.seq(); s.forEach((i) => __echo.tap(i)); const c = document.getElementById('board').getBoundingClientRect(); const k = c.width / 360;
    const toScr = (q) => ({ x: c.left + q.x * k, y: c.top + q.y * k, w: q.w * k, h: q.h * k });
    const b = __echo.bloomEl(); const br = b.getBoundingClientRect(); const tr = (() => { const rg = document.createRange(); rg.selectNodeContents(b); const x = rg.getBoundingClientRect(); return { x: x.left, y: x.top, w: x.width, h: x.height }; })();
    return { shown: b.classList.contains('on') && getComputedStyle(b).visibility === 'visible', text: b.textContent, bloom: tr, labels: __echo.labels().map(toScr), widget: toScr(__echo.widget()), canvasFloats: __echo.floatRects().filter((f) => /bloom/i.test(f.text)).length, board: { x: c.left, y: c.top, w: c.width, h: c.height } }; });
  if (SHOTS) await page.screenshot({ path: SHOTS + '/w10-' + tag + '.png' });
  check(tag + ': the "+N in bloom" line is shown (DOM, not a canvas float)', r.shown && /IN BLOOM|in bloom/i.test(r.text) && r.canvasFloats === 0, JSON.stringify(r));
  check(tag + ': the bloom line intersects no flower name label and not the centre widget', !r.labels.some((l) => hit(r.bloom, l)) && !hit(r.bloom, r.widget), JSON.stringify({ bloom: r.bloom, labels: r.labels, widget: r.widget }));
  // geometry in canvas units: selection frame bars and the pip row vs the labels
  const g = await page.evaluate(() => {
    const labels = __echo.labels(); const PADS = [[0, 0], [1, 0], [0, 1], [1, 1]].map((q) => ({ x: q[0] * 180, y: q[1] * 200, w: 180, h: 200 }));
    const bars = []; PADS.forEach((p) => { const x0 = p.x + 4, y0 = p.y + 4, w0 = p.w - 8, h0 = p.h - 8; bars.push({ x: x0 + 6, y: y0 + 6, w: w0 - 12, h: 3 }, { x: x0 + 6, y: y0 + h0 - 9, w: w0 - 12, h: 3 }, { x: x0 + 6, y: y0 + 6, w: 3, h: h0 - 12 }, { x: x0 + w0 - 9, y: y0 + 6, w: 3, h: h0 - 12 }); });
    const n = 12, w = Math.max(4, Math.floor(Math.min(14, (360 - 40) / n) / 2) * 2), px0 = Math.round(180 - (n * w) / 2); const pips = { x: px0 - 4, y: 192, w: n * w + 8, h: 16 };
    return { labels, bars, pips };
  });
  check(tag + ': selection frame bars and the pip row cross no name label', !g.labels.some((l) => g.bars.some((b) => hit(b, l)) || hit(g.pips, l)), JSON.stringify(g.labels));
  // a miss: the wilt float stays inside its card for its whole rise
  const w = await page.evaluate(() => { __echo.listen(); const s = __echo.seq(); const wrong = (s[0] + 1) % 4; __echo.tap(wrong); const pad = { x: (wrong % 2) * 180, y: Math.floor(wrong / 2) * 200 };
    let minY = 1e9, maxY = -1e9, ok = true; for (let k = 0; k < 30; k++) { __echo.floatRects().filter((f) => /wilt/i.test(f.text)).forEach((f) => { minY = Math.min(minY, f.y); maxY = Math.max(maxY, f.y + f.h); if (f.y < pad.y + 4 || f.y + f.h > pad.y + 196 || f.x < pad.x + 4 || f.x + f.w > pad.x + 176) ok = false; }); __echo.step(0.05); }
    return { ok, minY, maxY, pad }; });
  check(tag + ': the WILT float stays fully inside its card while it rises', w.ok && w.minY < 1e9, JSON.stringify(w));
  const sc = await page.evaluate(() => ({ b: document.getElementById('board').getBoundingClientRect().bottom, ih: innerHeight }));
  await ctx.close();
  return { errors, sc };
}

(async () => {
  const browser = await chromium.launch();
  const P = await run(browser, { width: 390, height: 844 }, true);
  const D = await run(browser, { width: 1280, height: 720 }, false);
  check('1280x720: the whole 2x2 board fits without scrolling', D.sc.b <= D.sc.ih, JSON.stringify(D.sc));
  check('no page errors', P.errors.length === 0 && D.errors.length === 0, P.errors.concat(D.errors).join('|'));
  await browser.close();
  done();
})().catch((e) => { console.error(e); process.exit(1); });
