// W-08 (b10-01, b10-02, b10-16, b12-13): the Angler scene keeps a playable size at 150% text portrait, phone landscape and desktop.
// Run: BASE=http://localhost:8440/game/index.html node game/tests/beta-w08-angler-layout.test.js
const { chromium } = require('playwright');
const { check, done, blockDb } = require('./helpers');
const ORIGIN = (process.env.BASE || 'http://localhost:8440/game/index.html').replace(/\/game\/index\.html.*$/, '');
const URL = ORIGIN + '/game/games/angler/index.html?test=1';

async function measure(browser, vp, touch) {
  const ctx = await browser.newContext(Object.assign({ viewport: vp }, touch ? { isMobile: true, hasTouch: true } : {}));
  await blockDb(ctx);
  const page = await ctx.newPage(); const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(URL);
  await page.waitForFunction(() => window.__angler);
  await page.evaluate(() => { const p = document.getElementById('pregame'); if (p && !p.hidden) { const b = document.getElementById('pg-play'); if (b) b.click(); } });
  // hook a fish (the reel meter is drawn inside the scene canvas, so the scene rect is the meter's rect)
  await page.evaluate(() => { const a = window.__angler; try { if (a.cast) a.cast(); } catch (e) { /* layout only */ } });
  await page.waitForTimeout(300);
  const m = await page.evaluate(() => {
    const r = (el) => { if (!el) return null; const b = el.getBoundingClientRect(); return { x: b.left, y: b.top, w: b.width, h: b.height, b: b.bottom, r: b.right }; };
    const btns = Array.from(document.querySelectorAll('.bar .btn, #status .btn, #spots .btn')).filter((b) => b.offsetParent && b.getBoundingClientRect().width > 2).map((b) => ({ id: b.id || b.textContent.trim().slice(0, 12), h: b.getBoundingClientRect().height, w: b.getBoundingClientRect().width }));
    return { scene: r(document.getElementById('scene')), msg: r(document.getElementById('msg')), ih: innerHeight, iw: innerWidth, sy: scrollY, sh: document.documentElement.scrollHeight, btns };
  });
  await ctx.close();
  return { m, errors };
}

(async () => {
  const browser = await chromium.launch();
  // (1) 390x844 at 150% text: the same 260x563 CSS px the b10 tester used
  const A = await measure(browser, { width: 260, height: 563 }, true);
  const s = A.m.scene;
  check('260x563 (150% text portrait): scene >= 200x300', s.w >= 200 && s.h >= 300, JSON.stringify(s));
  check('260x563: the scene (reel meter) is fully inside the viewport without scrolling', s.y >= 0 && s.b <= A.m.ih + 0.5 && s.r <= A.m.iw + 0.5 && A.m.sy === 0, JSON.stringify(A.m));
  check('260x563: every chrome button stays >= 44 px tall', A.m.btns.every((b) => b.h >= 44), JSON.stringify(A.m.btns.filter((b) => b.h < 44)));
  // (2) 844x390 landscape phone
  const L = await measure(browser, { width: 844, height: 390 }, true);
  check('844x390 landscape: scene bottom <= innerHeight and >= 300 px tall (meter visible without scroll)', L.m.scene.b <= L.m.ih + 0.5 && L.m.scene.y >= 0 && L.m.scene.h >= 300 && L.m.sy === 0, JSON.stringify(L.m.scene));
  check('844x390 landscape: the status line is visible too', L.m.msg.b <= L.m.ih + 0.5, JSON.stringify(L.m.msg));
  // (3) desktop
  const D = await measure(browser, { width: 1280, height: 720 }, false);
  check('1280x720: scene height >= 480 px and fully on screen', D.m.scene.h >= 480 && D.m.scene.b <= D.m.ih + 0.5, JSON.stringify(D.m.scene));
  // (4) phone default: buttons still >= 44 px, scene not smaller than before (>= 360 px tall)
  const P = await measure(browser, { width: 390, height: 844 }, true);
  check('390x844: every chrome button >= 44 px and the scene >= 360 px tall inside the viewport', P.m.btns.every((b) => b.h >= 44) && P.m.scene.h >= 360 && P.m.scene.b <= P.m.ih + 0.5, JSON.stringify([P.m.scene, P.m.btns.filter((b) => b.h < 44)]));
  check('no page errors', [A, L, D, P].every((x) => x.errors.length === 0), [A, L, D, P].map((x) => x.errors.join('|')).join(' / '));
  await browser.close();
  done();
})().catch((e) => { console.error(e); process.exit(1); });
