// R4 (b13-07 / b13-r2-07): a Realm rotate storm no longer re-allocates the canvas backing store on every event.
// 60 viewport flips 844x390 <-> 390x844 every 40 ms: resize work coalesced per frame, backing store applied once 150 ms after the
// last event (old code: 61 re-allocations, 35 long tasks / 290 ms on b13's box). Also: the final canvas equals a fresh load, the
// perf guard is not tripped by the storm, a single rotation still settles to the right backing size within 1 s.
// Counts, not times, so the machine load does not matter; the one timing check is load-scaled (lib/load-scale.js).
// No network: the town exit is stubbed, Firebase hosts aborted. Run: BASE=http://localhost:8440/game/index.html node game/tests/beta-r4-realm-rotate.test.js
const { chromium } = require('playwright');
const { check, done } = require('./helpers');
const LS = require('./lib/load-scale');
const ORIGIN = (process.env.BASE || 'http://localhost:8440/game/index.html').replace(/\/game\/.*$/, '');
(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  await ctx.route(/firebaseio|firebasedatabase|gstatic\.com\/firebasejs/, (r) => r.abort());
  await ctx.route('**/game/index.html*', (r) => r.fulfill({ contentType: 'text/html', body: 'town' }));
  const p = await ctx.newPage();
  const errors = [];
  p.on('pageerror', (e) => errors.push(e.message));
  await p.goto(ORIGIN + '/game/games/mad-maze/lantern.css');
  await p.evaluate(() => { localStorage.clear(); localStorage.setItem('pixeltown-save-v1', JSON.stringify({ realm: { level: 4, xp: 0, items: [], nextUid: 1 } })); });
  await p.goto(ORIGIN + '/game/games/mad-maze/index.html?mode=world&test=1&seed=12345');
  await p.waitForFunction(() => window.__mm && window.__mm.world && window.__mm.arena.active && window.__mm.arena.state === 'play', null, { timeout: 30000 });
  await p.waitForTimeout(1000);
  const fresh = await p.evaluate(() => { const a = window.__mm.arena; return { w: a.canvas.width, h: a.canvas.height, css: a.canvas.style.width + 'x' + a.canvas.style.height, q: a._pf.q }; });
  await p.evaluate(() => {
    window.__bk = 0; const c = window.__mm.arena.canvas; const d = Object.getOwnPropertyDescriptor(HTMLCanvasElement.prototype, 'width');
    Object.defineProperty(c, 'width', { get() { return d.get.call(this); }, set(v) { if (v !== d.get.call(this)) window.__bk++; d.set.call(this, v); }, configurable: true });
  });
  for (let i = 0; i < 60; i++) { await p.setViewportSize(i % 2 ? { width: 390, height: 844 } : { width: 844, height: 390 }); await p.waitForTimeout(40); }
  await p.setViewportSize({ width: 390, height: 844 });
  await p.waitForTimeout(LS.budget(1500));
  const after = await p.evaluate(() => { const a = window.__mm.arena; return { w: a.canvas.width, h: a.canvas.height, css: a.canvas.style.width + 'x' + a.canvas.style.height, q: a._pf.q, bk: window.__bk }; });
  // 20, not 1-2: on a loaded box one setViewportSize can take longer than the 150 ms settle, so some flips settle on their own
  check('60 rotations re-allocate the backing store at most 20 times (old code: 61)', after.bk <= 20, String(after.bk));
  check('after the storm the canvas equals a fresh load (backing + CSS)', after.w === fresh.w && after.h === fresh.h && after.css === fresh.css, JSON.stringify({ fresh, after }));
  check('the storm did not drop the render quality', after.q === fresh.q, JSON.stringify(after));
  // one real rotation still lands: landscape backing differs and is applied within ~1 s
  await p.setViewportSize({ width: 844, height: 390 });
  await p.waitForTimeout(LS.budget(1000));
  const land = await p.evaluate(() => { const a = window.__mm.arena; return { w: a.canvas.width, h: a.canvas.height, W: a.W, H: a.H, scale: a.scale }; });
  check('a single rotation applies the landscape backing store', land.w > land.h && land.W > land.H && Math.abs(land.w / land.W - land.scale) < 0.01, JSON.stringify(land));
  // the perf guard still reacts to genuinely slow frames once the resize is over
  const guard = await p.evaluate(() => new Promise((res) => {
    const a = window.__mm.arena; a._rzAt = 0; a.setPerfPhone(true);
    for (let i = 0; i < 120; i++) a.perfFeed(60);
    res(a.perfState().quality);
  }));
  check('the perf guard still drops quality on real slow frames', guard === 0.75, String(guard));
  check('no page errors', errors.length === 0, errors.join(' | '));
  await b.close();
  done();
})().catch((e) => { console.error(e); process.exit(1); });
