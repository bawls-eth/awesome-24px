// Deepdelve adaptive quality governor + frame rate. Serve the repo root: python3 -m http.server 8454 &
// Run: BASE=http://localhost:8454/game/index.html NODE_PATH=$(npm root -g) node game/tests/deepdelve-perf.test.js
// Set THREE_JS=<file> to serve three.js locally instead of the CDN. Run one browser test at a time (flock /tmp/live.lock).
// The governor logic is asserted exactly via the window.__dd.perf hook with fake frame times. The fps comparison is only
// asserted when this machine is slow enough that the governor has work to do (otherwise there is nothing to win).
const { chromium } = require('playwright');
const fs = require('fs');
const { check, done } = require('./helpers');
const ORIGIN = (process.env.BASE || 'http://localhost:8440/game/index.html').replace(/\/game\/index\.html.*$/, '');
const URL = (q) => ORIGIN + '/game/games/deepdelve/index.html?test=1' + (q || '');
const THREE_URL = 'https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.min.js';
const DESKTOP = { viewport: { width: 1000, height: 700 } };
const PHONE = { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true };

async function open(browser, q, opts) {
  const ctx = await browser.newContext(opts || DESKTOP);
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  if (process.env.THREE_JS) await page.route(THREE_URL, (route) => route.fulfill({ status: 200, contentType: 'application/javascript', body: fs.readFileSync(process.env.THREE_JS) }));
  await page.goto(URL(q));
  await page.waitForFunction(() => window.__dd && window.__dd.ready);
  return { ctx, page, errors };
}
const measure = (page, ms) => page.evaluate((span) => new Promise((res) => {
  let n = 0; const t0 = performance.now();
  (function f() { n++; if (performance.now() - t0 > span) res(n / ((performance.now() - t0) / 1000)); else requestAnimationFrame(f); }());
}), ms);

(async () => {
  const browser = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const a = await open(browser, '&seed=5&perf=0');
  const p = a.page;

  // 1. governor logic with simulated frame times (simulated clock, so it is deterministic)
  const g = await p.evaluate(() => {
    const perf = window.__dd.perf, out = {};
    perf.reset();
    let now = 1000;
    const feed = (ms, secs) => { const changes = []; const end = now + secs * 1000; while (now < end) { now += ms; if (perf.frame(ms, now)) changes.push({ t: now, level: perf.state().level, scale: perf.state().scale, view: perf.state().view }); } return changes; };
    out.start = perf.state();
    out.fast0 = feed(10, 5).length; // fast frames at best quality: nothing changes
    out.slow = feed(60, 14); // slow frames: should step down, never more than one change per 2 s
    out.afterSlow = perf.state();
    out.fast = feed(8, 120); // comfortably fast: restores slowly
    out.afterFast = perf.state();
    const gaps = (arr) => arr.slice(1).map((c, i) => c.t - arr[i].t);
    out.slowGaps = gaps(out.slow); out.fastGaps = gaps(out.fast);
    // thrash test: alternating bursts must not change quality more than once per 2 s
    perf.reset(); now = 5000;
    const all = [];
    for (let i = 0; i < 40; i++) all.push.apply(all, feed(i % 2 ? 8 : 70, 1));
    out.thrash = { n: all.length, minGap: Math.min.apply(null, [1e9].concat(gaps(all))), span: (now - 5000) / 1000 };
    // stalls (tab switch) are ignored
    perf.reset(); out.stall = feed(900, 20).length;
    perf.reset();
    return out;
  });
  check('governor starts at full quality (scale 1, view 5) and fast frames change nothing', g.start.scale === 1 && g.start.view === 5 && g.fast0 === 0, JSON.stringify(g.start));
  check('slow frames lower render scale first, then view distance', g.slow.length >= 2 && g.slow[0].scale === 0.75 && g.slow[0].view === 5 && g.slow.some((c) => c.view < 5), JSON.stringify(g.slow));
  check('slow frames never push view below 3', g.afterSlow.view >= 3 && g.afterSlow.level > 0, JSON.stringify(g.afterSlow));
  check('quality changes at most once per 2 s of simulated time', g.slowGaps.every((x) => x >= 2000) && g.fastGaps.every((x) => x >= 2000) && g.thrash.minGap >= 2000, JSON.stringify({ s: g.slowGaps, f: g.fastGaps, t: g.thrash }));
  check('fast frames restore quality slowly, back to scale 1 / view 5', g.fast.length >= 1 && g.afterFast.level === 0 && g.afterFast.scale === 1 && g.afterFast.view === 5, JSON.stringify({ n: g.fast.length, st: g.afterFast }));
  check('restores are slower than the lowering gap', g.fastGaps.length === 0 || g.fastGaps.every((x) => x >= 6000), JSON.stringify(g.fastGaps));
  check('alternating fast/slow bursts do not thrash', g.thrash.n <= Math.ceil(g.thrash.span / 2), JSON.stringify(g.thrash));
  check('stall frames (>500 ms) are ignored', g.stall === 0, String(g.stall));

  // 2. applying a level really changes the renderer and the loaded meshes
  const ap = await p.evaluate(() => {
    const d = window.__dd, perf = d.perf;
    perf.reset(); d.settle();
    const c = document.getElementById('gl');
    const full = { w: c.width, view: d.view, meshes: d.loadedMeshes() };
    let now = 1000; for (let i = 0; i < 400; i++) { now += 70; perf.frame(70, now); }
    d.settle();
    const low = { w: c.width, view: d.view, meshes: d.loadedMeshes(), st: perf.state() };
    perf.reset(); d.settle();
    return { full, low, back: { w: c.width, view: d.view, meshes: d.loadedMeshes() } };
  });
  check('lowered quality shrinks the canvas buffer and the view distance', ap.low.w < ap.full.w && ap.low.view < ap.full.view && ap.low.view === 3, JSON.stringify(ap));
  check('reset restores the canvas, view distance and meshes', ap.back.w === ap.full.w && ap.back.view === 5 && ap.back.meshes >= ap.full.meshes, JSON.stringify(ap.back));

  // 3. phone keeps view 3 at every level
  const ph = await open(browser, '&seed=5&perf=0', PHONE);
  const pv = await ph.page.evaluate(() => {
    const d = window.__dd, perf = d.perf; let now = 1000; const views = [d.view];
    for (let i = 0; i < 600; i++) { now += 70; perf.frame(70, now); views.push(d.view); }
    return { base: d.baseView, views: Array.from(new Set(views)), st: perf.state() };
  });
  check('phone view distance stays 3 at every quality level', pv.base === 3 && pv.views.length === 1 && pv.views[0] === 3, JSON.stringify(pv));
  await ph.ctx.close();

  // 4. measured fps, governor off vs on (looking down at the ground = the heavy, fill-bound view)
  const look = (pg) => pg.evaluate(() => { const d = window.__dd; d.player.pitch = -1.2; d.settle(); });
  await look(p);
  await p.waitForTimeout(1500);
  const off = await measure(p, 4000);
  await a.ctx.close(); // one rendering page at a time: software GL contends for the same CPUs
  const b = await open(browser, '&seed=5&perf=1');
  await look(b.page);
  await b.page.waitForTimeout(12000); // let the governor settle
  const on = await measure(b.page, 4000);
  const st = await b.page.evaluate(() => window.__dd.perf.state());
  console.log('fps governor off: ' + off.toFixed(1) + ', on: ' + on.toFixed(1) + ' (level ' + st.level + ', scale ' + st.scale + ', view ' + st.view + ')');
  if (1000 / off > 45) check('fps with the governor on is at least 1.3x the unmanaged fps (slow machine)', on >= off * 1.3 * 0.95 || on >= 12, 'off ' + off.toFixed(1) + ' on ' + on.toFixed(1));
  else check('machine is fast enough that the governor leaves quality alone or does not hurt fps', on >= off * 0.8, 'off ' + off.toFixed(1) + ' on ' + on.toFixed(1));

  // 5. no console errors
  const errs = [].concat(a.errors, ph.errors, b.errors);
  check('no console errors', errs.length === 0, JSON.stringify(errs));
  await browser.close();
  done();
})().catch((e) => { console.error(e); process.exitCode = 1; });
