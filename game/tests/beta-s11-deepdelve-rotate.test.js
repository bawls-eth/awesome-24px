// Beta S-11 (b13-07, deepdelve part): 60 rapid rotations no longer leave Deepdelve at a lowered render scale, and the drawing buffer
// is re-sized once per storm instead of on every event. No Firebase on this page.
// Run: BASE=http://localhost:8440/game/index.html node game/tests/beta-s11-deepdelve-rotate.test.js
//  1. After the storm (back to 390x844) the canvas backing size equals a fresh load's at the same viewport.
//  2. The quality governor did not drop a level because of the storm (resize frames are not render cost).
//  3. The renderer was re-sized a handful of times, not 60; zero pageerror.
const { chromium } = require('playwright');
const { check, done } = require('./helpers');
const ORIGIN = (process.env.BASE || 'http://localhost:8440/game/index.html').replace(/\/game\/index\.html.*$/, '');
const URL = ORIGIN + '/game/games/deepdelve/index.html?test=1&seed=5';
const PHONE = { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true };
const backing = (p) => p.evaluate(() => { const c = document.getElementById('gl'); return { w: c.width, h: c.height }; });

(async () => {
  const browser = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const open = async () => {
    const ctx = await browser.newContext(PHONE);
    const page = await ctx.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto(URL);
    await page.waitForFunction(() => window.__dd && window.__dd.ready, null, { timeout: 20000 });
    await page.waitForTimeout(1500);
    return { ctx, page, errors };
  };
  const fresh = await open();
  const ref = await backing(fresh.page);
  await fresh.ctx.close();

  const { ctx, page, errors } = await open();
  // count drawing-buffer reallocations (canvas width/height writes)
  await page.evaluate(() => {
    const c = document.getElementById('gl'); window.__sizes = 0;
    const d = Object.getOwnPropertyDescriptor(HTMLCanvasElement.prototype, 'width');
    Object.defineProperty(c, 'width', { configurable: true, get() { return d.get.call(this); }, set(v) { window.__sizes++; d.set.call(this, v); } });
  });
  const lvl0 = await page.evaluate(() => window.__dd.perf.state().level);
  const cdp = await ctx.newCDPSession(page);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
  for (let i = 0; i < 60; i++) {
    await page.setViewportSize(i % 2 ? { width: 390, height: 844 } : { width: 844, height: 390 });
    await page.waitForTimeout(40);
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 });
  await page.waitForTimeout(2500);
  const after = await backing(page);
  const st = await page.evaluate(() => ({ level: window.__dd.perf.state().level, sizes: window.__sizes }));
  check('[1] canvas backing size after the storm equals a fresh load', after.w === ref.w && after.h === ref.h, JSON.stringify({ ref, after }));
  check('[2] the governor did not lower quality because of the storm', st.level === lvl0, `level ${lvl0} -> ${st.level}`);
  check('[3] the drawing buffer was re-sized a few times, not once per event', st.sizes >= 1 && st.sizes <= 12, String(st.sizes));
  check('[3] zero pageerror', errors.length === 0, errors.join(' | '));
  const gov = await page.evaluate(() => { const p = window.__dd.perf; p.reset(); let changed = false; for (let i = 0; i < 40; i++) changed = p.frame(60, 1e7 + i * 100) || changed; return { changed, level: p.state().level }; });
  check('governor still lowers quality for real slow frames (outside a resize)', gov.changed && gov.level > 0, JSON.stringify(gov));
  await ctx.close();
  await browser.close();
  done();
})().catch((e) => { console.error(e); process.exit(1); });
