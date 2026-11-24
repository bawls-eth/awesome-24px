// R4 (b13-05 Deepdelve tap spikes): the WebGL programs for the block outline, torches and textured sprites are compiled at boot
// (deepdelve.js prewarmPrograms), so the first tap that shows the outline, the first torch and the first slime do not compile a
// shader inside a play frame. Check: the renderer's program count does not grow when those first appear.
// Old build: the outline / slime programs were compiled on first draw (count grew) and the programs() hook did not exist.
// No network beyond the page (three.js CDN as the page loads it). Run: BASE=http://localhost:8440/game/index.html node game/tests/beta-r4-deepdelve-prewarm.test.js
const { chromium } = require('playwright');
const { check, done } = require('./helpers');
const ORIGIN = (process.env.BASE || 'http://localhost:8440/game/index.html').replace(/\/game\/.*$/, '');
const frames = (p, n) => p.evaluate((k) => new Promise((res) => { let i = 0; const f = () => (++i >= k ? res() : requestAnimationFrame(f)); requestAnimationFrame(f); }), n);
(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 800, height: 600 } });
  await ctx.route(/firebaseio|firebasedatabase|gstatic\.com\/firebasejs/, (r) => r.abort());
  const p = await ctx.newPage();
  const errors = [];
  p.on('pageerror', (e) => errors.push(e.message));
  await p.goto(ORIGIN + '/game/games/deepdelve/index.html?test=1');
  await p.waitForFunction(() => window.__dd && window.__dd.ready, null, { timeout: 60000 });
  await p.evaluate(() => window.__dd.settle());
  await frames(p, 10);
  const n0 = await p.evaluate(() => (typeof window.__dd.programs === 'function' ? window.__dd.programs() : -1));
  check('the renderer reports its compiled programs (hook present)', n0 > 0, String(n0));
  // first outline: look straight down at the ground and aim
  await p.evaluate(() => { const d = window.__dd; d.player.pitch = -1.5; d.aim(); });
  await frames(p, 10);
  const vis = await p.evaluate(() => window.__dd.outlineVisible());
  const n1 = await p.evaluate(() => window.__dd.programs());
  check('the block outline is drawn', vis === true);
  check('drawing the outline for the first time compiles no new program', n1 === n0, `${n0} -> ${n1}`);
  // first slime (textured sprite)
  await p.evaluate(() => { const d = window.__dd, pl = d.player; d.spawnSlime(pl.x + 2, pl.y, pl.z + 2); });
  await frames(p, 10);
  const n2 = await p.evaluate(() => window.__dd.programs());
  check('the first slime compiles no new program', n2 === n0, `${n0} -> ${n2}`);
  check('no page errors', errors.length === 0, errors.join(' | '));
  await b.close();
  done();
})().catch((e) => { console.error(e); process.exit(1); });
