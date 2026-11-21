// PF3: low graphics mode. The pref (or 3 s of slow frames, via MMPerf.profile) caps sparks / death ghosts, lowers the render resolution
// through the arena's existing perf guard and stops CSS animation; turning it off restores everything.
// Run: BASE=http://localhost:8663/game/index.html NODE_PATH=$(npm root -g) node game/tests/realm-lowgfx.test.js
const { chromium } = require('playwright');
const { check, done } = require('./helpers');
const ORIGIN = (process.env.BASE || 'http://localhost:8440/game/index.html').replace(/\/game\/index\.html.*$/, '');
const WORLD = ORIGIN + '/game/games/mad-maze/index.html?mode=world&test=1&seed=12345';
const SHOTS = process.env.SHOTS || require('os').tmpdir();

async function open(browser, opts, seed) {
  const ctx = await browser.newContext(opts);
  await ctx.route('**/game/index.html*', (r) => r.fulfill({ contentType: 'text/html', body: '<!doctype html><title>town</title>town' }));
  const page = await ctx.newPage(); const errors = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  await page.goto(ORIGIN + '/game/games/mad-maze/lantern.css');
  await page.evaluate((s) => { localStorage.clear(); localStorage.setItem('mm-aim-assist', '0'); if (s) localStorage.setItem('pixeltown-access-v1', s); }, seed || null);
  await page.goto(WORLD);
  await page.waitForFunction(() => window.__mm && window.__mm.world && window.__mm.arena.active && window.__mm.arena.state === 'play', null, { timeout: 15000 });
  return { ctx, page, errors };
}
const perf = (page) => page.evaluate(() => { const a = window.__mm.arena; const s = a.perfState(); return { tier: window.__mmPerf.tier, forced: window.__mmPerf.forced, auto: window.__mmPerf.auto, sparks: a._sparks ? a._sparks.length : -1, ghosts: a._edGhosts ? a._edGhosts.length : -1, q: s.quality, cw: s.w, low: document.body.classList.contains('mm-low-gfx'), anim: getComputedStyle(document.getElementById('realm-banner')).animationName }; });

(async () => {
  const browser = await chromium.launch();

  // ---- the pref ----
  let T = await open(browser, { viewport: { width: 1000, height: 700 } });
  let page = T.page;
  await page.waitForFunction(() => window.__mm.arena._sparks && window.__mm.arena._edGhosts, null, { timeout: 15000 }).catch(() => {});
  let p0 = await perf(page);
  check('baseline: full tier, both pools exist at full size, full resolution', p0.tier === 'high' && !p0.low && p0.q === 1 && p0.sparks === 24 && p0.ghosts === 24, JSON.stringify(p0));
  await page.evaluate(() => window.__mmAccess.set('lowGfx', true));
  let p1 = await perf(page);
  check('Low graphics pref: tier low, forced, body class on', p1.tier === 'low' && p1.forced === true && p1.low, JSON.stringify(p1));
  check('Low graphics caps sparks (<= 12) and death ghosts (<= 4) ', p1.sparks === 12 && p1.ghosts === 4, JSON.stringify(p1));
  check('Low graphics lowers the render resolution through the perf guard', p1.q === 0.75 && (p0.cw === 0 || p1.cw < p0.cw), 'cw ' + p0.cw + ' -> ' + p1.cw);
  check('Low graphics stops CSS animation and exposes terrainAnim=false on __mmPerf', await page.evaluate(() => window.__mmPerf.terrainAnim === false && window.__mmPerf.caps.sparks === 12 && window.__mmPerf.caps.deathGhosts === 4 && window.__mmPerf.caps.dpr === 1));
  check('the perf guard cannot undo it: slow-then-fast frames keep quality 0.75', await page.evaluate(() => { const a = window.__mm.arena; for (let i = 0; i < 600; i++) a.perfFeed(8); return a.perfState().quality === 0.75; }));
  check('the game still runs under low graphics (sparks pool is usable, bullets fire)', await page.evaluate(async () => { const a = window.__mm.arena; a.firePlayerBullet(0); await new Promise((r) => requestAnimationFrame(r)); return a.pBullets.some((b) => b.active) && a.state === 'play'; }));
  let st = await page.evaluate(() => JSON.parse(localStorage.getItem('pixeltown-access-v1')));
  check('the pref persists in pixeltown-access-v1', st.lowGfx === true);
  await page.evaluate(() => window.__mmAccess.set('lowGfx', false));
  let p2 = await perf(page);
  check('turning it off restores tier, pools, resolution and animation', p2.tier === 'high' && !p2.low && p2.q === 1 && p2.sparks === 24 && p2.ghosts === 24 && p2.cw === p0.cw, JSON.stringify(p2));
  check('no console errors (pref)', T.errors.length === 0, T.errors.join(' | '));
  await T.ctx.close();

  // ---- auto: slow frames ----
  T = await open(browser, { viewport: { width: 1000, height: 700 } });
  page = T.page;
  await page.evaluate(() => window.__mmPerf.feed(new Array(150).fill(55))); // ~8 s of 55 ms frames
  let a1 = await perf(page);
  check('3+ s of slow frames switch to the low tier automatically (not forced)', a1.tier === 'low' && a1.forced === false && a1.auto === true && a1.low && a1.q === 0.75, JSON.stringify(a1));
  check('the settings sheet says Low graphics is on automatically', await page.evaluate(() => { window.__mmAccess.open(); return /auto/i.test(document.querySelector('#mm-settings button[data-ax="lowGfx"]').textContent); }));
  await page.evaluate(() => { document.querySelector('#mm-settings button[data-ax="lowGfx"]').click(); }); // pref on, then off again
  await page.evaluate(() => { document.querySelector('#mm-settings button[data-ax="lowGfx"]').click(); });
  let a2 = await perf(page);
  check('switching the pref off after auto restores the high tier', a2.tier === 'high' && !a2.low && a2.q === 1 && a2.auto === false, JSON.stringify(a2));
  check('no console errors (auto)', T.errors.length === 0, T.errors.join(' | '));
  await T.ctx.close();

  // ---- saved pref on load + corrupt value ----
  T = await open(browser, { viewport: { width: 1000, height: 700 } }, JSON.stringify({ v: 1, lowGfx: true }));
  let l1 = await perf(T.page);
  check('a saved lowGfx pref applies on load', l1.tier === 'low' && l1.forced && l1.q === 0.75, JSON.stringify(l1));
  await T.ctx.close();
  T = await open(browser, { viewport: { width: 1000, height: 700 } }, JSON.stringify({ v: 1, lowGfx: 'yes' }));
  l1 = await perf(T.page);
  check('a corrupt lowGfx value is ignored (not low)', l1.tier === 'high' && !l1.low, JSON.stringify(l1));
  await T.ctx.close();

  // ---- phone ----
  T = await open(browser, { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  page = T.page;
  await page.tap('#mm-gear-btn'); await page.waitForTimeout(150);
  const tg = await page.evaluate(() => { const b = document.querySelector('#mm-settings button[data-ax="lowGfx"]'); const r = b.getBoundingClientRect(); return { w: r.width, h: r.height }; });
  check('phone: the Low graphics toggle is >= 44 px', tg.w >= 44 && tg.h >= 44, JSON.stringify(tg));
  await page.tap('#mm-settings button[data-ax="lowGfx"]'); await page.tap('#mm-settings button[data-ax="done"]'); await page.waitForTimeout(300);
  const pp = await perf(page);
  check('phone: low graphics on, no horizontal scroll', pp.tier === 'low' && await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), JSON.stringify(pp));
  await page.screenshot({ path: SHOTS + '/realm-lowgfx-phone.png' });
  check('no console errors (phone)', T.errors.length === 0, T.errors.join(' | '));
  await T.ctx.close();

  await browser.close();
  done();
})();
