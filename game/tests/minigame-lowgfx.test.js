// AC1 (design/NEXT-SLICES-4.md): Bug Safari and Angler follow the shared graphics and motion prefs (pixeltown-access-v1, MMAccess).
//  - lowGfx:true -> MMPerf's low tier (MMPerf.applyCanvas tags the canvas, dpr 1): Bug Safari draws fewer catch sparks (MMPerf low cap),
//    no gold beetle / moonwing halo, still flower patches; Angler drops the water shimmer, draws fewer rain drops and one splash ring.
//    Measured with a draw-call counter on the game canvas (test side: CanvasRenderingContext2D is wrapped by an init script).
//  - flashes:false (the shared reduced-motion setting, via MMSideAccess) -> two frames at different times are pixel-identical
//    (no shimmer, glow pulse, wing flap, flower sway or rain drift); without it they differ.
//  - defaults unchanged: with no prefs the tier is 'high', and one seeded frame is pixel-identical to the same page with MMPerf removed
//    (the pre-AC1 code path), with the same draw-call count.
// Phone 390x844 (touch). Safety: blockDb (HTTP route + routeWebSocket); these pages never load Firebase; 0 DB requests, 0 sockets,
// no off-origin requests, no console errors. Frame times under a 4x CDP CPU throttle are printed for information only.
// Run: python3 -m http.server 8440 &   BASE=http://localhost:8440/game/index.html NODE_PATH=$(npm root -g) node game/tests/minigame-lowgfx.test.js
const { chromium } = require('playwright');
const { check, done, blockDb } = require('./helpers');
const ORIGIN = (process.env.BASE || 'http://localhost:8440/game/index.html').replace(/\/game\/index\.html.*$/, '');
const BUGS = ORIGIN + '/game/games/festival/bugs.html?test=1';
const ANGLER = ORIGIN + '/game/games/angler/index.html?test=1&weather=rain&seed=lowgfx';
const ACCESS = 'pixeltown-access-v1';
const PHONE = { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true };

async function open(browser, url, prefs, opts) {
  opts = opts || {};
  const ctx = await browser.newContext(PHONE);
  const db = await blockDb(ctx);
  if (opts.noPerf) await ctx.route(/\/shared\/mm-perf\.js/, (r) => r.fulfill({ status: 200, contentType: 'application/javascript', body: '/* MMPerf removed by minigame-lowgfx.test.js */' }));
  await ctx.addInitScript(([key, p]) => {
    try {
      localStorage.setItem('pixeltown-bugs-hint-v1', '1');
      if (p) localStorage.setItem(key, JSON.stringify(p)); else localStorage.removeItem(key);
    } catch (e) { /* ignore */ }
    const P = CanvasRenderingContext2D.prototype, n = { calls: 0 };
    window.__draw = n;
    ['fillRect', 'strokeRect', 'fill', 'stroke', 'fillText', 'drawImage', 'arc', 'ellipse'].forEach((k) => {
      const o = P[k];
      P[k] = function () { if (this.canvas && (this.canvas.id === 'game' || this.canvas.id === 'scene')) n.calls++; return o.apply(this, arguments); };
    });
  }, [ACCESS, prefs || null]);
  const page = await ctx.newPage();
  const rec = { errors: [], off: [], sockets: [] };
  page.on('pageerror', (e) => rec.errors.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error') rec.errors.push('console: ' + m.text()); });
  page.on('request', (r) => { if (!r.url().startsWith(ORIGIN) && !/^(data|blob):/.test(r.url())) rec.off.push(r.url()); });
  page.on('websocket', (ws) => rec.sockets.push(ws.url()));
  await page.goto(url);
  await page.waitForFunction(() => window.__bugs || window.__angler);
  return { ctx, page, db, rec };
}
function clean(L, t) {
  check(L + ': 0 database requests, 0 sockets, no off-origin requests', t.db.attempts() === 0 && t.rec.sockets.length === 0 && t.rec.off.length === 0, JSON.stringify([t.db.http, t.db.ws, t.rec.sockets, t.rec.off]));
  check(L + ': no console errors', t.rec.errors.length === 0, t.rec.errors.join(' | '));
}

// ---- Bug Safari scenes (all in one evaluate, so the page's own rAF never interleaves) ----
const bugsDraw = () => {
  const B = window.__bugs;
  B.start('meadow', { seed: 'lowgfx-draw' });
  B.spawn('goldbeetle', 4, 4); B.spawn('moonwing', 15, 10); B.spawn('butterfly', 8, 3);
  window.__draw.calls = 0;
  for (let i = 0; i < 20; i++) B.renderAt(1 + i * 0.05);
  return { calls: window.__draw.calls / 20, gfx: B.gfx, tierAttr: document.getElementById('game').getAttribute('data-mm-tier'), w: document.getElementById('game').width };
};
const bugsSparks = () => {
  const B = window.__bugs;
  B.start('meadow', { seed: 'lowgfx-sparks', empty: true });
  B.setPlayer(10, 7, true);
  let max = 0, caught = 0;
  for (let k = 0; k < 6; k++) {
    for (let j = 0; j < 3; j++) B.spawn('ladybug', 10 + 0.3 * Math.cos(j * 2.1), 7 + 0.3 * Math.sin(j * 2.1));
    const r = B.swing(); caught += r.caught.length;
    max = Math.max(max, B.particles);
    B.step(0.1); max = Math.max(max, B.particles);
  }
  return { max, caught };
};
const bugsFrames = () => {
  const B = window.__bugs, cv = document.getElementById('game');
  B.start('meadow', { seed: 'lowgfx-motion' });
  B.spawn('goldbeetle', 4, 4); B.spawn('butterfly', 8, 3); B.spawn('moonwing', 15, 10);
  B.renderAt(1.0); const a = cv.toDataURL();
  B.renderAt(1.37); const b = cv.toDataURL();
  return { same: a === b, a };
};
// ---- Angler (test mode has no rAF loop: frames are drawn on demand) ----
const anglerDraw = () => {
  const A = window.__angler;
  window.__draw.calls = 0;
  for (let i = 0; i < 20; i++) { A.advance(0.05); }
  return { calls: window.__draw.calls / 20, gfx: A.gfx, state: A.state, weather: A.weather, tierAttr: document.getElementById('scene').getAttribute('data-mm-tier') };
};
const anglerFrames = () => {
  const A = window.__angler, cv = document.getElementById('scene');
  A.advance(1); const a = cv.toDataURL();
  A.advance(0.37); const b = cv.toDataURL();
  return { same: a === b, a };
};

async function frameMs(page, fn) {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
  const ms = await page.evaluate(fn);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 });
  return ms;
}
const median = (a) => { const s = a.slice().sort((x, y) => x - y); return s[s.length >> 1]; };

(async () => {
  const browser = await chromium.launch();

  // ===== Bug Safari =====
  const bDef = await open(browser, BUGS, null);
  const bLow = await open(browser, BUGS, { v: 1, lowGfx: true });
  const bRm = await open(browser, BUGS, { v: 1, flashes: false });
  const bOld = await open(browser, BUGS, null, { noPerf: true });
  const dDef = await bDef.page.evaluate(bugsDraw), dLow = await bLow.page.evaluate(bugsDraw), dOld = await bOld.page.evaluate(bugsDraw);
  check('bugs: default tier is high (cap 24, 4 sparks a catch, canvas 320 wide, tagged high)', dDef.gfx.tier === 'high' && dDef.gfx.cap === 24 && dDef.gfx.burst === 4 && dDef.w === 320 && dDef.tierAttr === 'high', JSON.stringify(dDef));
  check('bugs: lowGfx forces the low tier (dpr 1, MMPerf low spark cap 12, canvas tagged low)', dLow.gfx.tier === 'low' && dLow.gfx.dpr === 1 && dLow.gfx.cap === 12 && dLow.gfx.burst === 2 && dLow.w === 320 && dLow.tierAttr === 'low', JSON.stringify(dLow));
  check(`bugs: the low tier draws less per frame (${dLow.calls} vs ${dDef.calls} canvas calls)`, dLow.calls < dDef.calls * 0.95, JSON.stringify([dLow.calls, dDef.calls]));
  const sDef = await bDef.page.evaluate(bugsSparks), sLow = await bLow.page.evaluate(bugsSparks);
  check(`bugs: catch sparks are capped on the low tier (max ${sLow.max} <= 12; default max ${sDef.max})`, sLow.caught > 0 && sLow.max > 0 && sLow.max <= 12 && sLow.max < sDef.max, JSON.stringify([sLow, sDef]));
  // defaults unchanged: same seeded frame and same work as the page without MMPerf (the pre-AC1 path)
  const fDef = await bDef.page.evaluate(bugsFrames), fOld = await bOld.page.evaluate(bugsFrames);
  check('bugs: default frame is pixel-identical to the page without MMPerf, with the same draw count', fDef.a === fOld.a && dDef.calls === dOld.calls && dOld.gfx.tier === 'high', JSON.stringify([dDef.calls, dOld.calls]));
  check('bugs: by default the scene animates (two times give different frames)', !fDef.same);
  const fRm = await bRm.page.evaluate(bugsFrames);
  check('bugs: reduced motion (flashes off) stops flower sway, glow pulse and wing flap (two times, identical frames)', await bRm.page.evaluate(() => window.__bugs.reduced) && fRm.same);
  const glow = await bRm.page.evaluate(() => [window.__bugs.glowAlpha(0), window.__bugs.glowAlpha(1.3)]);
  check('bugs: reduced motion keeps the glade glow static', glow[0] === glow[1], JSON.stringify(glow));
  const fLow = await bLow.page.evaluate(bugsFrames);
  check('bugs: the low tier still draws a full frame (not blank, differs from default only in the trimmed extras)', fLow.a.length > 1000 && fLow.a !== fDef.a);
  const render = () => { const B = window.__bugs, t = []; for (let k = 0; k < 15; k++) { const s = performance.now(); for (let i = 0; i < 20; i++) B.renderAt(1 + i * 0.01); t.push((performance.now() - s) / 20); } return t; };
  const msDef = median(await frameMs(bDef.page, render)), msLow = median(await frameMs(bLow.page, render));
  console.log(`INFO bugs: median frame draw time (blocks of 20) under 4x CPU throttle: default ${msDef.toFixed(3)} ms, low ${msLow.toFixed(3)} ms (information only; the counters above are the gate)`);
  for (const [L, t] of [['bugs default', bDef], ['bugs low', bLow], ['bugs reduced', bRm], ['bugs no-MMPerf', bOld]]) { clean(L, t); await t.ctx.close(); }

  // ===== Angler =====
  const aDef = await open(browser, ANGLER, null);
  const aLow = await open(browser, ANGLER, { v: 1, lowGfx: true });
  const aRm = await open(browser, ANGLER, { v: 1, flashes: false });
  const aOld = await open(browser, ANGLER, null, { noPerf: true });
  const gDef = await aDef.page.evaluate(anglerDraw), gLow = await aLow.page.evaluate(anglerDraw), gOld = await aOld.page.evaluate(anglerDraw);
  check('angler: default tier is high (40 rain drops, 3 splash rings, no spark cap)', gDef.gfx.tier === 'high' && gDef.gfx.drops === 40 && gDef.gfx.rings === 3 && gDef.gfx.cap === null && gDef.tierAttr === 'high' && gDef.weather === 'rain', JSON.stringify(gDef));
  check('angler: lowGfx forces the low tier (dpr 1, 16 drops, 1 ring, fanfare capped at 12)', gLow.gfx.tier === 'low' && gLow.gfx.dpr === 1 && gLow.gfx.drops === 16 && gLow.gfx.rings === 1 && gLow.gfx.cap === 12 && gLow.tierAttr === 'low', JSON.stringify(gLow));
  check(`angler: the low tier draws less per frame (${gLow.calls} vs ${gDef.calls} canvas calls; no shimmer)`, gLow.calls <= gDef.calls - 18 - 24, JSON.stringify([gLow.calls, gDef.calls]));
  const hDef = await aDef.page.evaluate(anglerFrames), hOld = await aOld.page.evaluate(anglerFrames);
  check('angler: default frame is pixel-identical to the page without MMPerf, with the same draw count', hDef.a === hOld.a && gDef.calls === gOld.calls && gOld.gfx.tier === 'high', JSON.stringify([gDef.calls, gOld.calls]));
  check('angler: by default the water shimmers and the rain drifts (two times give different frames)', !hDef.same);
  const hRm = await aRm.page.evaluate(anglerFrames);
  check('angler: reduced motion (flashes off) stops shimmer and rain drift (two times, identical frames)', await aRm.page.evaluate(() => window.__angler.reduced) && hRm.same);
  const aRender = () => { const A = window.__angler, t = []; for (let k = 0; k < 15; k++) { const s = performance.now(); for (let i = 0; i < 20; i++) A.redraw(); t.push((performance.now() - s) / 20); } return t; };
  const amDef = median(await frameMs(aDef.page, aRender)), amLow = median(await frameMs(aLow.page, aRender));
  console.log(`INFO angler: median frame draw time (blocks of 20) under 4x CPU throttle: default ${amDef.toFixed(3)} ms, low ${amLow.toFixed(3)} ms (information only)`);
  for (const [L, t] of [['angler default', aDef], ['angler low', aLow], ['angler reduced', aRm], ['angler no-MMPerf', aOld]]) { clean(L, t); await t.ctx.close(); }

  // ===== MMPerf.applyCanvas (pure part, in the page) =====
  const t = await open(browser, BUGS, null);
  const ac = await t.page.evaluate(() => {
    const c = document.createElement('canvas'); c.width = 10; c.height = 10;
    const low = MMPerf.applyCanvas(c, 'low', { w: 100, h: 50 });
    const lowSize = [c.width, c.height, c.getAttribute('data-mm-tier')];
    const bad = MMPerf.applyCanvas(null, 'nope');
    const keep = document.createElement('canvas'); keep.width = 7; keep.height = 9; MMPerf.applyCanvas(keep, 'high');
    return { low, lowSize, bad, keep: [keep.width, keep.height] };
  });
  check('MMPerf.applyCanvas: low = dpr 1 and resizes to the logical size; no logical size = canvas untouched; bad input reads as high', ac.low.tier === 'low' && ac.low.dpr === 1 && ac.lowSize.join() === '100,50,low' && ac.bad.tier === 'high' && ac.keep.join() === '7,9', JSON.stringify(ac));
  clean('applyCanvas page', t); await t.ctx.close();

  await browser.close();
  done();
})();
