// Deepdelve frame-rate regression at 1280x720 (software GL). Serve the repo root: python3 -m http.server 8553 &
// Run: BASE=http://localhost:8553/game/index.html THREE_JS=/tmp/three.min.js NODE_PATH=$(npm root -g) node game/tests/deepdelve-fps.test.js
// The camera turns every frame so the idle-frame skip cannot help: this measures real rasterisation. Baseline = governor
// forced off (full quality); managed = the adaptive governor (perf=1) after a warmup. Run one browser test at a time.
const { chromium } = require('playwright');
const fs = require('fs');
const { check, done } = require('./helpers');
const ORIGIN = (process.env.BASE || 'http://localhost:8440/game/index.html').replace(/\/game\/index\.html.*$/, '');
const URL = (q) => ORIGIN + '/game/games/deepdelve/index.html?test=1' + (q || '');
const THREE_URL = 'https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.min.js';

async function open(browser, q) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  if (process.env.THREE_JS) await page.route(THREE_URL, (route) => route.fulfill({ status: 200, contentType: 'application/javascript', body: fs.readFileSync(process.env.THREE_JS) }));
  await page.goto(URL(q));
  await page.waitForFunction(() => window.__dd && window.__dd.ready);
  await page.evaluate(() => { window.__dd.player.pitch = -0.9; });
  return { ctx, page, errors };
}
// avg fps + long frames (>50 ms) over `ms`, turning the camera each frame
const measure = (page, ms) => page.evaluate((span) => new Promise((res) => {
  const d = window.__dd; let n = 0, long = 0, worst = 0; const t0 = performance.now(); let last = t0;
  (function f() {
    const t = performance.now(), dt = t - last; last = t; n++; if (dt > 50) long++; if (dt > worst) worst = dt;
    d.player.yaw += 0.02;
    if (t - t0 > span) res({ fps: n / ((t - t0) / 1000), long, worst: Math.round(worst), view: d.view, w: document.getElementById('gl').width }); else requestAnimationFrame(f);
  }());
}), ms);

(async () => {
  const browser = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const a = await open(browser, '&seed=5&perf=0');
  await a.page.waitForTimeout(2500);
  const base = await measure(a.page, 6000);
  // gameplay still works at full quality: mine one block, place one
  const g = await a.page.evaluate(() => {
    const d = window.__dd, s = d.surfaceY(40, 40);
    d.setPos(45.5, -s, 45.5);
    const before = d.getBlock(40, s + 5, 40), ok = d.mineAt(40, s + 5, 40), after = d.getBlock(40, s + 5, 40);
    const item = d.hotbar()[0].item, placed = d.placeAt(40, s + 5, 40, item);
    return { before, ok, after, item, placed, back: d.getBlock(40, s + 5, 40) };
  });
  await a.ctx.close(); // one rendering page at a time
  const b = await open(browser, '&seed=5');
  await b.page.waitForTimeout(1000);
  await measure(b.page, 14000); // warmup: the governor settles
  const man = await measure(b.page, 6000);
  const st = await b.page.evaluate(() => window.__dd.perf.state());
  // gameplay after the governor lowered quality
  const g2 = await b.page.evaluate(() => {
    const d = window.__dd, s = d.surfaceY(41, 41);
    d.setPos(46.5, -s, 46.5);
    const before = d.getBlock(41, s + 5, 41), ok = d.mineAt(41, s + 5, 41), item = d.hotbar()[0].item, placed = d.placeAt(41, s + 5, 41, item);
    return { before, ok, item, placed, back: d.getBlock(41, s + 5, 41) };
  });
  console.log('baseline (full quality): ' + base.fps.toFixed(1) + ' fps, long frames ' + base.long + ', worst ' + base.worst + ' ms, canvas ' + base.w);
  console.log('managed  (governor on):  ' + man.fps.toFixed(1) + ' fps, long frames ' + man.long + ', worst ' + man.worst + ' ms, canvas ' + man.w + ', level ' + st.level + ' scale ' + st.scale + ' view ' + st.view);
  check('governor-managed fps is >= 1.4x the full-quality baseline, or >= 20 fps absolute, or the baseline already reaches 30', man.fps >= base.fps * 1.4 || man.fps >= 20 || base.fps >= 30, 'base ' + base.fps.toFixed(1) + ' managed ' + man.fps.toFixed(1));
  check('managed run is not meaningfully worse than the baseline (machine-load tolerance)', man.fps >= base.fps * 0.7, 'base ' + base.fps.toFixed(1) + ' managed ' + man.fps.toFixed(1));
  check('managed run has no stall over 1.5 s', man.worst < 1500, 'worst ' + man.worst + ' ms (baseline worst ' + base.worst + ', long frames ' + base.long + ' vs ' + man.long + ')');
  check('mining and placing a block work at full quality', g.ok && g.before !== 0 && g.after === 0 && g.placed && g.back === g.before, JSON.stringify(g));
  check('mining and placing a block work under the governor', g2.ok && g2.placed && g2.back === g2.before, JSON.stringify(g2));
  check('no console errors', a.errors.concat(b.errors).length === 0, JSON.stringify(a.errors.concat(b.errors)));
  await browser.close();
  done();
})().catch((e) => { console.error(e); process.exitCode = 1; });
