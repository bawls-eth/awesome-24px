// cycle 2 (L, hot path): the Isles frame was measured with the browser's sampling heap profiler at 2.5 to 3.0 KB per frame in all
// (idle and walking, 300 and 600 frames): already lean. The one thing left that ran on every frame was in stepCreatures:
// creatures.some((c) => ...) with a new closure each frame, to look for a creature that has finished running off.
// Now a plain scan with one shared predicate. This test counts Array.prototype.some over 120 frames (was 1 per frame).
// Run: BASE=http://localhost:9721/game/index.html NODE_PATH=$(npm root -g) node game/tests/isles-frame-some.test.js
// Standalone page, no Firebase; every WebSocket is closed and any request that leaves the origin fails the test.
const { chromium } = require('playwright');
const { check, done } = require('./helpers');
const ORIGIN = (process.env.BASE || 'http://localhost:8440/game/index.html').replace(/\/game\/index\.html.*$/, '');
const PAGE = ORIGIN + '/game/games/isles/index.html?test=1&seed=123';
const FRAMES = 120;

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  await ctx.routeWebSocket(/.*/, (ws) => ws.close());
  const page = await ctx.newPage(); const errors = [], off = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('request', (r) => { if (!r.url().startsWith(ORIGIN) && !/^(data|blob):/.test(r.url())) off.push(r.url()); });
  await page.goto(PAGE);
  await page.waitForFunction(() => window.__isles && window.__isles.world, null, { timeout: 20000 });
  await page.waitForTimeout(1200);
  const r = await page.evaluate((FRAMES) => new Promise((res) => {
    const I = window.__isles; I.spawnTick(); I.spawnTick();
    const n = { some: 0, frames: 0, creatures: I.creatures().length, t0: typeof I.simT === "function" ? I.simT() : I.simT };
    const some = Array.prototype.some; Array.prototype.some = function () { n.some++; return some.apply(this, arguments); };
    const step = () => {
      if (++n.frames < FRAMES) return requestAnimationFrame(step);
      Array.prototype.some = some; n.t1 = typeof I.simT === "function" ? I.simT() : I.simT; n.after = I.creatures().length; res(n);
    };
    requestAnimationFrame(step);
  }), FRAMES);
  console.log('measured: ' + JSON.stringify(r));
  check('the island is running with creatures on it', r.frames === FRAMES && r.creatures > 0 && r.after > 0 && r.t1 > r.t0, JSON.stringify(r));
  check('no Array some() per frame in the creature step (was 1 a frame; the 2 Hz hint check may still use it): ' + r.some + ' in ' + FRAMES + ' frames', r.some <= FRAMES / 5, JSON.stringify(r));
  check('no page errors, nothing left the origin', errors.length === 0 && off.length === 0, errors.concat(off).join(' | '));
  await browser.close();
  done();
})();
