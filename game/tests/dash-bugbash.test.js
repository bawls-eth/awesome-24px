// Lantern Dash bug bash: shared wiring (MMInput / MMChip / MMSettings), pause on blur/hidden/P, exact ghost replay of same-frame taps,
// hostile ghost saves, 150% text, landscape, course generation cost.
//   python3 -m http.server 9431 &   BASE=http://localhost:9431/game/index.html NODE_PATH=$(npm root -g) node game/tests/dash-bugbash.test.js
const { chromium } = require('playwright');
const { check, done, blockDb } = require('./helpers');
const BASE = process.env.BASE || 'http://localhost:9431/game/index.html';
const PAGE = BASE.replace(/index\.html.*$/, '') + 'games/dash/index.html';
const KEY = 'pixeltown-dash-v1';

async function open(browser, ctxOpts, query, init) {
  const ctx = await browser.newContext(ctxOpts);
  await blockDb(ctx);
  if (init) await ctx.addInitScript((kv) => { if (!sessionStorage.seeded) { sessionStorage.seeded = '1'; Object.keys(kv).forEach((k) => localStorage.setItem(k, kv[k])); } }, init);
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  await page.goto(PAGE + (query || '?test=1'));
  await page.waitForFunction(() => window.__dash);
  return { ctx, page, errors };
}

(async () => {
  const browser = await chromium.launch();
  const s = await open(browser, { viewport: { width: 1280, height: 720 } }, '?test=1&seed=bb1');
  const p = s.page;
  check('shared wiring present: MMInput, MMChip, MMSettings, MMSfx', await p.evaluate(() => !!(window.MMInput && window.MMChip && window.MMSettings && window.MMSfx)));
  await p.click('#mm-nav-btn');
  check('Settings entry shown in the Menu sheet and opens the panel', await p.evaluate(() => { const b = document.getElementById('mm-nav-settings'); return !!b && !b.hidden; }));
  await p.click('#mm-nav-settings');
  check('shared Settings dialog opens', await p.evaluate(() => MMSettings.mount({ page: 'dash' }).isOpen()));
  await p.evaluate(() => MMSettings.mount({ page: 'dash' }).close());
  await p.click('#play');
  // Enter is the universal primary key: it jumps like Space
  await p.evaluate(() => { document.activeElement && document.activeElement.blur(); });
  await p.keyboard.down('Enter'); await p.evaluate(() => __dash.step(3)); await p.keyboard.up('Enter');
  check('Enter jumps (MMInput primary)', await p.evaluate(() => __dash.player.jumps === 1));
  // pause: P toggles, hidden tab pauses and releases the jump, the resuming tap is not a jump
  await p.evaluate(() => __dash.start('bb1'));
  await p.keyboard.down(' ');
  check('jump held before pause', await p.evaluate(() => __dash.run.open >= 0));
  await p.evaluate(() => { Object.defineProperty(document, 'hidden', { configurable: true, get: () => true }); document.dispatchEvent(new Event('visibilitychange')); });
  check('hiding the tab pauses the run and lets go of the jump', await p.evaluate(() => __dash.paused === true && __dash.run.open < 0));
  await p.evaluate(() => { Object.defineProperty(document, 'hidden', { configurable: true, get: () => false }); });
  await p.keyboard.up(' ');
  const j0 = await p.evaluate(() => __dash.player.jumps);
  await p.keyboard.press(' ');
  check('the tap that resumes is not a jump', await p.evaluate((j) => __dash.paused === false && __dash.player.jumps === j, j0));
  await p.keyboard.press('p');
  check('P pauses', await p.evaluate(() => __dash.paused === true));
  await p.keyboard.press('p');
  check('P resumes', await p.evaluate(() => __dash.paused === false));

  // ghost replay is exact even for same-frame taps and back-to-back taps (release and next press on one frame)
  const gh = await p.evaluate(() => {
    const D = __dash; D.start('ghostsync');
    D.save.ghost = null;
    const script = { 40: 'tap0', 90: 'down', 96: 'up', 96.5: 'down', 100: 'up', 140: 'tap0', 141: 'tap0' };
    let f = 0, guard = 0;
    while (D.run.state === 'play' && guard++ < 3000) {
      const k = script[f]; const k2 = script[f + 0.5];
      if (k === 'tap0') { D.down(); D.up(); } else if (k === 'down') D.down(); else if (k === 'up') D.up();
      if (k2 === 'down') { D.up(); D.down(); }
      D.step(1); f++;
    }
    const die = D.run.f, ins = D.run.ins.slice(0, 8);
    D.start('ghostsync');
    const hasGhost = !!D.ghost;
    let gf = -1, guard2 = 0;
    while (D.run.state === 'play' && guard2++ < 4000) { D.step(1); if (D.ghost && D.ghost.dead && gf < 0) gf = D.run.f; }
    return { die, gf, hasGhost, ins };
  });
  check('ghost replays inputs exactly: it dies on the same frame as the recorded run', gh.hasGhost && gh.gf === gh.die, JSON.stringify(gh));

  // hostile ghost saves: no throw, ignored or cleaned
  const bad = { v: 1, best: 'x', ghost: { seed: 'bad seed!!', in: [[1, 2]], pv: 2 }, medals: 'no' };
  const s2 = await open(browser, { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true }, '?test=1', { [KEY]: JSON.stringify(bad) });
  check('hostile ghost seed ignored, page alive', await s2.page.evaluate(() => __dash.save.ghost === null && __dash.save.best === 0) && s2.errors.length === 0, s2.errors.join('|'));
  const wild = { v: 1, ghost: { seed: 'wild', pv: 2, dist: 5, in: [[50, 3], [3, 1], [1e9, 5], [7, 7], 'x', [1, 2, 3], [20, 30]] } };
  const s3 = await open(browser, { viewport: { width: 390, height: 844 } }, '?test=1&seed=wild', { [KEY]: JSON.stringify(wild) });
  const wr = await s3.page.evaluate(() => { __dash.start('wild'); __dash.step(1500); return __dash.run.state; });
  check('out-of-order ghost inputs replay without hanging or throwing', wr === 'over' && s3.errors.length === 0, s3.errors.join('|'));

  // 150% text + landscape: nothing overflows horizontally
  const s4 = await open(browser, { viewport: { width: 360, height: 640 } }, '?test=1', { 'pixeltown-access-v1': JSON.stringify({ v: 1, hudScale: 1.5 }) });
  await s4.page.evaluate(() => document.documentElement.style.setProperty('--ui-scale', '1.5'));
  await s4.page.click('#play'); await s4.page.evaluate(() => __dash.step(3000));
  check('150% text: no horizontal scroll, HUD and result readable', await s4.page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1 && parseFloat(getComputedStyle(document.getElementById('h-dist')).fontSize) >= 26, JSON.stringify(await s4.page.evaluate(() => [document.documentElement.scrollWidth, innerWidth, getComputedStyle(document.getElementById('h-dist')).fontSize]))));
  const s5 = await open(browser, { viewport: { width: 740, height: 360 }, hasTouch: true, isMobile: true }, '?test=1');
  check('landscape phone: canvas and jump button fit without horizontal scroll', await s5.page.evaluate(() => { const v = document.getElementById('view').getBoundingClientRect(); return document.documentElement.scrollWidth <= window.innerWidth + 1 && v.height <= window.innerHeight * 0.5; }));

  // course generation: seeded, cheap, bounded
  const cg = await p.evaluate(() => { const t0 = performance.now(); const c = __dash.course('perf'); return { ms: performance.now() - t0, n: c.obs.length, last: c.obs[c.obs.length - 1].x }; });
  check('course for 40 km generates quickly and has bounded size', cg.ms < 300 && cg.n < 5000, JSON.stringify(cg));
  check('no console errors', s.errors.length === 0 && s4.errors.length === 0 && s5.errors.length === 0, [].concat(s.errors, s4.errors, s5.errors).join('|'));
  await browser.close();
  done();
})();
