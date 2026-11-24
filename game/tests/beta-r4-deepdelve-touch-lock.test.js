// R4 (b13-r2-05 / the hung 4x tap scripts): a finger tap on the Deepdelve view must not request pointer lock (its compatibility
// mousedown used to), and the page keeps drawing after a tap. A real mouse press still locks the pointer (desktop mouse-look).
// Old build: after one touch tap document.pointerLockElement was the canvas and the page dropped from ~60 to ~5 frames/s with
// long tasks of 0.3-1.2 s (headless emulator). No network beyond the page. Run: BASE=http://localhost:8440/game/index.html node game/tests/beta-r4-deepdelve-touch-lock.test.js
const { chromium } = require('playwright');
const { check, done } = require('./helpers');
const ORIGIN = (process.env.BASE || 'http://localhost:8440/game/index.html').replace(/\/game\/.*$/, '');
const URL = ORIGIN + '/game/games/deepdelve/index.html?test=1';
async function open(b, opts) {
  const ctx = await b.newContext(opts);
  await ctx.route(/firebaseio|firebasedatabase|gstatic\.com\/firebasejs/, (r) => r.abort());
  const p = await ctx.newPage();
  const errors = [];
  p.on('pageerror', (e) => errors.push(e.message));
  await p.addInitScript(() => { window.__fc = 0; const R = window.requestAnimationFrame.bind(window); window.requestAnimationFrame = (cb) => R((t) => { window.__fc++; cb(t); }); });
  await p.goto(URL);
  await p.waitForFunction(() => window.__dd && window.__dd.ready, null, { timeout: 60000 });
  await p.waitForTimeout(1500);
  return { ctx, p, errors };
}
const fps = async (p, ms) => { const a = await p.evaluate(() => window.__fc); await p.waitForTimeout(ms); return Math.round(((await p.evaluate(() => window.__fc)) - a) * 1000 / ms); };
(async () => {
  const b = await chromium.launch();
  const T = await open(b, { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  const before = await fps(T.p, 3000);
  await T.p.touchscreen.tap(195, 500);
  await T.p.waitForTimeout(300);
  const lockedT = await T.p.evaluate(() => !!document.pointerLockElement);
  const after = await fps(T.p, 3000);
  check('a finger tap on the view does not lock the pointer', lockedT === false);
  check('the page keeps its frame rate after a tap (>= half of before)', after >= before / 2, `${before} -> ${after} frames/s`);
  check('no page errors (touch)', T.errors.length === 0, T.errors.join(' | '));
  await T.ctx.close();
  const M = await open(b, { viewport: { width: 1000, height: 700 } });
  await M.p.mouse.click(500, 350);
  await M.p.waitForTimeout(300);
  const lockedM = await M.p.evaluate(() => (document.pointerLockElement ? document.pointerLockElement.id : ''));
  check('a real mouse press still locks the pointer to the view (mouse-look)', lockedM === 'gl', JSON.stringify(lockedM));
  check('no page errors (mouse)', M.errors.length === 0, M.errors.join(' | '));
  await M.ctx.close();
  await b.close();
  done();
})().catch((e) => { console.error(e); process.exit(1); });
