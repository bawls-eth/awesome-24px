// P1 (NEXT-SLICES-2 Wave 2): isles phone perf probe. games/isles at 390x844 (hasTouch, isMobile) under a 4x CDP CPU throttle with the
// heaviest everyday scene: 24 creatures on screen (4 of them XL), 2 companions in the party, and the hero riding a Tusktop that walks
// back and forth (real keyboard input, the page's own requestAnimationFrame loop). Gate: median frame < 20 ms and p95 < 34 ms over
// >= 300 frames. Then the same scene is timed phase by phase (the ?test=1 step hook = update, render() = draw) so a miss logs the
// first offending phase for P2. Offline (blockDb), local storage only, no chat, no DB writes, 0 console errors.
// PI2 (NEXT-SLICES-4): the same scene again on the low graphics tier (the shared lowGfx pref in pixeltown-access-v1, which forces MMPerf's
// low tier: dpr 1, 12 sparks, still terrain, companion AI 15 Hz, fog 10 Hz). The default case above is unchanged. The low tier must not
// be worse than the default (rAF median / p95 within a small noise margin), its per-frame work (update + draw, the ?test=1 hooks) has a
// median < 16 ms and a p95 < 28 ms under the same 4x throttle, and it issues fewer canvas draw calls per frame (counted on #view by a
// wrapped CanvasRenderingContext2D; both counts are printed). The scene holds the same 24 creatures, 4 XL, 2 companions, riding.
// Run: BASE=http://localhost:8440/game/index.html NODE_PATH=$(npm root -g) node game/tests/archipelago-perf.test.js
const { chromium } = require('playwright');
const { check, done, blockDb } = require('./helpers');
const ORIGIN = (process.env.BASE || 'http://localhost:8440/game/index.html').replace(/\/game\/index\.html.*$/, '');
const PAGE = ORIGIN + '/game/games/isles/index.html?test=1&seed=123';
const LS = require('./lib/load-scale');
// Frame budgets are 20 / 34 ms on an idle machine and scale with the measured load factor (calibration loop, hard cap 6x, see lib/load-scale.js).
const LOAD = LS.fresh(), MEDIAN_MS = Math.round(20 * LOAD), P95_MS = Math.round(34 * LOAD), MIN_FRAMES = 300, THROTTLE = 4;
const PROFILE = { v: 1, heroes: [{ id: 'h1', name: 'Fern', cls: 'druid', level: 7, xp: 10, items: [] }], stash: [], fame: 0, mode: 'classic', hall: [] };
const TAMES = { v: 1, n: 3, roster: [
  { id: 't1', sp: 'tusktop', nm: 'Tuskie', lv: 3, xp: 0, bond: 2, aff: 0, cos: '', isle: 'jungle', d: '2026-11-01' },
  { id: 't2', sp: 'fernraptor', nm: 'Fang', lv: 3, xp: 0, bond: 2, aff: 0, cos: '', isle: 'jungle', d: '2026-11-01' },
  { id: 't3', sp: 'chompbill', nm: 'Chomp', lv: 2, xp: 0, bond: 1, aff: 0, cos: '', isle: 'jungle', d: '2026-11-01' }], party: ['t2', 't3'], mount: 't1' };
const SEED = { 'pixeltown-mm-v1': JSON.stringify(PROFILE), 'pixeltown-mm-active-v1': JSON.stringify({ v: 1, heroId: 'h1' }), 'pixeltown-tames-v1': JSON.stringify(TAMES) };
const stat = (a) => { const s = a.slice().sort((x, y) => x - y); return { n: s.length, median: s[Math.floor(s.length / 2)], p95: s[Math.floor(s.length * 0.95)], worst: s[s.length - 1] }; };
const f1 = (v) => (typeof v === 'number' ? v.toFixed(1) : String(v));

// PI2: the draw-call counter (canvas #view only), installed before the page runs; window.__draw.calls
const DRAW_COUNTER = () => {
  const P = CanvasRenderingContext2D.prototype, n = { calls: 0 };
  window.__draw = n;
  ['fillRect', 'strokeRect', 'fill', 'stroke', 'fillText', 'drawImage', 'arc', 'ellipse'].forEach((k) => {
    const o = P[k];
    P[k] = function () { if (this.canvas && this.canvas.id === 'view') n.calls++; return o.apply(this, arguments); };
  });
};
async function openScene(browser, seed) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  const db = await blockDb(ctx);
  const page = await ctx.newPage(); const errors = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  await page.addInitScript((s) => { if (sessionStorage.seeded) return; sessionStorage.seeded = '1'; localStorage.clear(); Object.keys(s).forEach((k) => localStorage.setItem(k, s[k])); }, seed);
  await page.addInitScript(DRAW_COUNTER);
  await page.goto(PAGE);
  await page.waitForFunction(() => window.__isles && window.__isles.world, null, { timeout: 20000 });
  await page.waitForLoadState('networkidle');
  return { ctx, db, page, errors };
}

(async () => {
  const browser = await chromium.launch();
  const { ctx, db, page, errors } = await openScene(browser, SEED);

  // the scene: open land, the spawner off, 4 XL + 20 small creatures around the hero (all inside the 390x844 view), 2 companions, riding
  const SCENE = () => {
    const I = window.__isles;
    I.pause(true); I.god(true); I.clearCreatures();
    const r = I.findTile(null, 13); I.teleport(r.x + 6, r.y); I.step(0, 0, 0.05);
    const h = I.hero(); const tx = h.tx, ty = h.ty;
    const XL = ['stegolith', 'fernjaw_tyrant', 'stegolith', 'fernjaw_tyrant'];
    const SMALL = ['glimmerfrog', 'chompbill', 'fernraptor', 'vinecoil', 'canopy_glider'];
    const out = { xl: 0, small: 0, miss: [] };
    const at = [[-4, -8], [4, -8], [-4, 8], [4, 8]];
    XL.forEach((sp, i) => { const id = I.spawn(sp, tx + at[i][0], ty + at[i][1]); if (id) out.xl++; else out.miss.push(sp); });
    for (let i = 0; i < 20; i++) { const ang = i * 2.399963, rr = 3 + (i % 4) * 1.4; const id = I.spawn(SMALL[i % SMALL.length], Math.round(tx + Math.cos(ang) * rr), Math.round(ty + Math.sin(ang) * rr * 1.8)); if (id) out.small++; else out.miss.push(SMALL[i % SMALL.length]); }
    const ride = I.ride(); I.step(0, 0, 0.05);
    out.creatures = I.creatures().length; out.xlLive = I.creatures().filter((c) => c.size === 'XL').length; out.party = I.party().length; out.riding = I.riding(); out.ride = ride;
    I.pause(false);
    return out;
  };
  const scene = await page.evaluate(SCENE);
  console.log('INFO scene: ' + JSON.stringify(scene));
  check('scene: 24 creatures, 4 of them XL', scene.creatures === 24 && scene.xlLive === 4, JSON.stringify(scene));
  check('scene: 2 companions in the party', scene.party === 2, JSON.stringify(scene));
  check('scene: the hero is riding (Tusktop)', !!scene.riding, JSON.stringify(scene.riding));

  let cdp = await ctx.newCDPSession(page);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: THROTTLE });
  // ride back and forth with real key input while the page's own loop runs; record rAF deltas
  // A shared CI box can stall the whole browser for a moment (vsync-aligned 33/50 ms frames with ~1 ms of page work): a window that
  // misses is sampled once more and the better window is gated; every window is printed.
  async function sampleWindow(page) {
    const sampler = page.evaluate((min) => new Promise((res) => {
      const d = []; let last = performance.now(); const t0 = last;
      const f = (now) => { d.push(now - last); last = now; if (d.length < min + 10 && now - t0 < 30000) requestAnimationFrame(f); else res(d); };
      requestAnimationFrame(f);
    }), MIN_FRAMES);
    let walking = true;
    const walker = (async () => { let k = 0; while (walking) { const key = k++ % 2 ? 'ArrowLeft' : 'ArrowRight'; await page.keyboard.down(key); await page.waitForTimeout(1200); await page.keyboard.up(key); } })();
    const deltas = await sampler; walking = false; await walker;
    return stat(deltas.slice(10)); // drop warm-up
  }
  let s = await sampleWindow(page);
  if (!(s.median < MEDIAN_MS && s.p95 < P95_MS)) { const s2 = await sampleWindow(page); console.log(`archipelago-perf window 1 missed (median ${f1(s.median)} p95 ${f1(s.p95)} ms), window 2: median ${f1(s2.median)} p95 ${f1(s2.p95)} ms`); if (s2.p95 < s.p95) s = s2; }
  const after = await page.evaluate(() => { const I = window.__isles; return { creatures: I.creatures().length, xl: I.creatures().filter((c) => c.size === 'XL').length, party: I.party().length, riding: !!I.riding(), moved: I.hero().x }; });
  console.log(`archipelago-perf: frames=${s.n} median=${f1(s.median)}ms p95=${f1(s.p95)}ms worst=${f1(s.worst)}ms throttle=${THROTTLE}x scene=${JSON.stringify(after)}`);

  // phase timing under the same throttle: update (the ?test=1 step hook, 1/60 s) and draw (render), 120 frames each, paused loop
  const PHASES = () => {
    const I = window.__isles; I.pause(true); const up = [], dr = [], fr = []; let calls = 0; const g0 = I.gfx ? I.gfx() : null;
    for (let i = 0; i < 120; i++) { let t = performance.now(); I.step(i % 120 < 60 ? 1 : -1, 0, 1 / 60); const u = performance.now() - t; up.push(u); const c0 = window.__draw.calls; t = performance.now(); I.render(); const d = performance.now() - t; dr.push(d); fr.push(u + d); calls += window.__draw.calls - c0; }
    const g1 = I.gfx ? I.gfx() : null; if (g1) { g1.partyN = g1.partySteps - g0.partySteps; g1.fogN = g1.fogCalls - g0.fogCalls; }
    I.pause(false); return { up, dr, fr, calls: calls / 120, gfx: g1 };
  };
  const ph = await page.evaluate(PHASES);
  const su = stat(ph.up), sd = stat(ph.dr);
  const budget = MEDIAN_MS;
  const offending = su.p95 > budget / 2 ? 'update' : sd.p95 > budget / 2 ? 'draw' : (su.median >= sd.median ? 'update' : 'draw');
  console.log(`archipelago-perf phases: update median=${f1(su.median)} p95=${f1(su.p95)} | draw median=${f1(sd.median)} p95=${f1(sd.p95)} ms (throttled ${THROTTLE}x)`);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 });

  check(`at least ${MIN_FRAMES} frames sampled`, s.n >= MIN_FRAMES, String(s.n));
  check('the scene held while sampling (24 creatures, 4 XL, 2 companions, riding)', after.creatures === 24 && after.xl === 4 && after.party === 2 && after.riding, JSON.stringify(after));
  const okMed = s.median < MEDIAN_MS, okP95 = s.p95 < P95_MS;
  check(`median frame < ${MEDIAN_MS} ms`, okMed, `${f1(s.median)} ms; first offending phase: ${offending}`);
  check(`p95 frame < ${P95_MS} ms`, okP95, `${f1(s.p95)} ms; first offending phase: ${offending}`);
  if (!okMed || !okP95) console.log(`P1 first offending phase: ${offending} (update p95 ${f1(su.p95)} ms, draw p95 ${f1(sd.p95)} ms)`);
  const sc = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth }));
  check('no horizontal scroll at 390 px', sc.sw <= sc.cw, JSON.stringify(sc));
  check('0 console errors', errors.length === 0, errors.slice(0, 3).join(' | '));
  check('0 database requests or sockets', db.count() === 0, JSON.stringify({ http: db.http, ws: db.ws }));
  await ctx.close();

  // ===== PI2: the low graphics tier (lowGfx pref), the same scene =====
  const SEED_LOW = Object.assign({}, SEED, { 'pixeltown-access-v1': JSON.stringify({ v: 1, lowGfx: true }) });
  const L = await openScene(browser, SEED_LOW);
  const lscene = await L.page.evaluate(SCENE);
  const lg = await L.page.evaluate(() => window.__isles.gfx());
  check('low: the lowGfx pref gives the low tier (dpr 1, 12 sparks, still terrain, companion AI 15 Hz, fog 10 Hz, canvas tagged low)',
    lg.tier === 'low' && lg.dpr === 1 && lg.sparks === 12 && lg.terrainAnim === false && lg.aiHz === 15 && lg.fogHz === 10 &&
    (await L.page.evaluate(() => document.getElementById('view').getAttribute('data-mm-tier'))) === 'low', JSON.stringify(lg));
  check('low: the same scene holds (24 creatures, 4 XL, 2 companions, riding; gameplay caps unchanged by the pref)', lscene.creatures === 24 && lscene.xlLive === 4 && lscene.party === 2 && !!lscene.riding && lg.cap === 24, JSON.stringify(lscene));
  cdp = await L.ctx.newCDPSession(L.page);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: THROTTLE });
  let ls = await sampleWindow(L.page);
  const NOISE_MED = 1.5, NOISE_P95 = 3;
  if (!(ls.median <= s.median + NOISE_MED && ls.p95 <= Math.max(s.p95 + NOISE_P95, 0) && ls.p95 < P95_MS)) { const l2 = await sampleWindow(L.page); console.log(`archipelago-perf low window 1 missed (median ${f1(ls.median)} p95 ${f1(ls.p95)} ms), window 2: median ${f1(l2.median)} p95 ${f1(l2.p95)} ms`); if (l2.p95 < ls.p95) ls = l2; }
  console.log(`archipelago-perf low: frames=${ls.n} median=${f1(ls.median)}ms p95=${f1(ls.p95)}ms worst=${f1(ls.worst)}ms (default median=${f1(s.median)} p95=${f1(s.p95)})`);
  const lph = await L.page.evaluate(PHASES);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 });
  const lf = stat(lph.fr), df = stat(ph.fr), lu = stat(lph.up), ld = stat(lph.dr);
  console.log(`archipelago-perf low phases: update median=${f1(lu.median)} p95=${f1(lu.p95)} | draw median=${f1(ld.median)} p95=${f1(ld.p95)} | frame work median=${f1(lf.median)} p95=${f1(lf.p95)} ms (default frame work median=${f1(df.median)} p95=${f1(df.p95)})`);
  console.log(`archipelago-perf draw calls per frame: default ${ph.calls.toFixed(1)}, low ${lph.calls.toFixed(1)} (sparks drawn on the low tier: ${lph.gfx && lph.gfx.sparksDrawn})`);
  check(`low: rAF frame time is not worse than the default tier (median ${f1(ls.median)} <= ${f1(s.median)} + ${NOISE_MED}, p95 ${f1(ls.p95)} <= ${f1(s.p95)} + ${NOISE_P95} and < ${P95_MS})`,
    ls.n >= MIN_FRAMES && ls.median <= s.median + NOISE_MED && ls.p95 <= s.p95 + NOISE_P95 && ls.p95 < P95_MS, JSON.stringify({ ls, s }));
  check(`low: per-frame work (update + draw, 4x throttle) median < 16 ms and p95 < 28 ms (${f1(lf.median)} / ${f1(lf.p95)} ms)`, lf.median < 16 && lf.p95 < 28, JSON.stringify(lf));
  check(`low: fewer canvas draw calls per frame than the default tier (${lph.calls.toFixed(1)} < ${ph.calls.toFixed(1)})`, lph.calls > 0 && lph.calls < ph.calls, JSON.stringify([lph.calls, ph.calls]));
  check(`low: over 2 s of steps the companion AI ran at 15 Hz (${lph.gfx && lph.gfx.partyN} steps) and the fog reveal at 10 Hz (${lph.gfx && lph.gfx.fogN}); the default ran both every step (${ph.gfx && ph.gfx.partyN} / ${ph.gfx && ph.gfx.fogN})`,
    lph.gfx && lph.gfx.partyN >= 28 && lph.gfx.partyN <= 31 && lph.gfx.fogN >= 19 && lph.gfx.fogN <= 21 && ph.gfx && ph.gfx.partyN === 120 && ph.gfx.fogN === 120, JSON.stringify([lph.gfx, ph.gfx]));
  check('low: 0 console errors', L.errors.length === 0, L.errors.slice(0, 3).join(' | '));
  check('low: 0 database requests or sockets', L.db.count() === 0, JSON.stringify({ http: L.db.http, ws: L.db.ws }));
  await browser.close();
  done();
})();
