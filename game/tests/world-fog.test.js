// Slice A1: fog of discovered tiles on the Realm World minimap (shared/mm-fog.js + realm-world.js). Undiscovered 8x8-tile cells draw dark,
// walking reveals cells within ~12 tiles, the `discovered` bitset is saved additively in pixeltown-realm-v1 (missing/corrupt -> fogged,
// a new seed starts fogged), the minimap redraws only when a new cell is revealed, ?fog=0 turns it off, and a 390x844 phone is fine.
// Run: BASE=http://localhost:8521/game/index.html NODE_PATH=$(npm root -g) node game/tests/world-fog.test.js
const { chromium } = require('playwright');
const { check, done } = require('./helpers');
const ORIGIN = (process.env.BASE || 'http://localhost:8440/game/index.html').replace(/\/game\/index\.html.*$/, '');
const PAGE = ORIGIN + '/game/games/mad-maze/index.html';
const WORLD = PAGE + '?mode=world&test=1&seed=12345';
const RKEY = 'pixeltown-realm-v1';
const FOGRGB = [10, 13, 20];

async function context(browser, save, opts) {
  const ctx = await browser.newContext(opts || { viewport: { width: 1000, height: 700 } });
  await ctx.route('**/game/index.html*', (r) => r.fulfill({ contentType: 'text/html', body: '<!doctype html><title>town</title>town' }));
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  await page.goto(ORIGIN + '/game/games/mad-maze/lantern.css');
  await page.evaluate((s) => { localStorage.clear(); localStorage.setItem('mm-aim-assist', '0'); if (s !== null) localStorage.setItem('pixeltown-realm-v1', typeof s === 'string' ? s : JSON.stringify(s)); }, save);
  errors.length = 0;
  return { ctx, page, errors };
}
const waitWorld = (page) => page.waitForFunction(() => window.__mm && window.__mm.world && window.__mm.arena.active && window.__mm.arena.state === 'play', null, { timeout: 15000 });
const W = (page, fn, arg) => page.evaluate(`(${fn.toString()})(window.__mm.arena, window.__mm.world, ${JSON.stringify(arg)})`);
const frames = (page, n) => page.evaluate((k) => new Promise((res) => { let i = 0; const f = () => (++i >= k ? res() : requestAnimationFrame(f)); requestAnimationFrame(f); }), n);
const LS = (page) => page.evaluate((k) => JSON.parse(localStorage.getItem(k)), RKEY);
// minimap pixel colour at the centre of cell (cx,cy)
const px = (page, cx, cy) => page.evaluate(([x, y]) => { const c = document.getElementById('rw-minimap'); const d = c.getContext('2d').getImageData(Math.floor(x * 3 + 1), Math.floor(y * 3 + 1), 1, 1).data; return [d[0], d[1], d[2]]; }, [cx, cy]);
const isFog = (c) => c[0] === FOGRGB[0] && c[1] === FOGRGB[1] && c[2] === FOGRGB[2];

(async () => {
  const browser = await chromium.launch();
  const errs = [];

  // ===== fresh save: fully fogged but for the spawn area =====
  const F = await context(browser, null); const page = F.page;
  await page.goto(WORLD); await waitWorld(page); await frames(page, 30);
  const s0 = await W(page, (a, w) => { const d = w.discovered(); const sp = w.world.spawnPoint; return { on: d.on, count: d.count, home: d.has(Math.floor(sp.x / 8), Math.floor(sp.y / 8)), spx: Math.floor(sp.x / 8), spy: Math.floor(sp.y / 8), size: w.world.w }; });
  check('a fresh save starts fogged: only cells near the spawn are discovered', s0.on && s0.count >= 1 && s0.count <= 16 && s0.home && s0.size === 256, JSON.stringify(s0));
  const farCx = s0.spx < 16 ? 30 : 1; const farCy = s0.spy < 16 ? 30 : 1;
  check('the minimap draws a far undiscovered cell dark and the spawn cell as terrain', isFog(await px(page, farCx, farCy)) && !isFog(await px(page, s0.spx, s0.spy)), JSON.stringify([await px(page, farCx, farCy), await px(page, s0.spx, s0.spy)]));
  const sv0 = await LS(page);
  check('the discovery is saved in pixeltown-realm-v1 as a 172-char base64 bitset, older keys intact', typeof sv0.discovered === 'string' && sv0.discovered.length === 172 && sv0.seed === '12345' && sv0.v === 1, JSON.stringify(sv0).slice(0, 200));

  // ===== walking reveals cells; redraw only on a new cell =====
  const d0 = await W(page, (a, w) => ({ n: w.discovered().count, draws: w.miniDraws() }));
  await frames(page, 90);
  const d1 = await W(page, (a, w) => ({ n: w.discovered().count, draws: w.miniDraws() }));
  check('standing still: nothing new revealed and no minimap redraw', d1.n === d0.n && d1.draws === d0.draws, JSON.stringify([d0, d1]));
  const tp = await W(page, (a, w, fc) => { const t = w.world.spawnPoint; let best = null; for (let r = 30; r < 90 && !best; r += 6) for (const [ox, oy] of [[r, 0], [-r, 0], [0, r], [0, -r]]) { const c = w.nearestFree(t.x + ox, t.y + oy, 4); if (c && !best) best = c; } a.player.x = (best.x + 0.5) * 32; a.player.y = (best.y + 0.5) * 32; return best; });
  await frames(page, 40);
  const d2 = await W(page, (a, w, t) => ({ n: w.discovered().count, draws: w.miniDraws(), here: w.discovered().has(Math.floor(t.x / 8), Math.floor(t.y / 8)) }), tp);
  check('walking to a new place reveals cells there and redraws the minimap', d2.n > d1.n && d2.here && d2.draws > d1.draws, JSON.stringify([d1, d2]));
  await frames(page, 90);
  const d3 = await W(page, (a, w) => ({ n: w.discovered().count, draws: w.miniDraws() }));
  check('after the reveal, standing still draws nothing more', d3.n === d2.n && d3.draws === d2.draws, JSON.stringify([d2, d3]));
  const hook = await W(page, (a, w) => { const before = w.discovered().count; const x = w.revealAt(250, 250); const again = w.revealAt(250, 250); return { before, x, again, after: w.discovered().count, has: w.discovered().has(31, 31) }; });
  check('revealAt reveals cells (>0 once, 0 the second time)', hook.x > 0 && hook.again === 0 && hook.after === hook.before + hook.x && hook.has, JSON.stringify(hook));
  const sv1 = await LS(page);
  const live = await W(page, (a, w) => w.discovered().b64);
  check('the save holds the live bitset', sv1.discovered === live, '');
  errs.push(...F.errors); await F.ctx.close();

  // ===== reload keeps it; a restart of the page with the saved bitset =====
  const R = await context(browser, { v: 1, seed: '12345', version: 1, discovered: live });
  await R.page.goto(WORLD); await waitWorld(R.page);
  const rr = await W(R.page, (a, w) => ({ n: w.discovered().count, far: w.discovered().has(31, 31), b64: w.discovered().b64 }));
  check('a saved bitset loads back (the far cell stays discovered, nothing lost)', rr.far && rr.n >= 1 && rr.b64.length === 172, JSON.stringify(rr));
  errs.push(...R.errors); await R.ctx.close();

  // ===== corrupt / missing / other seed =====
  for (const [name, save] of [['corrupt string', { v: 1, seed: '12345', discovered: 'not-base64!' }], ['wrong type', { v: 1, seed: '12345', discovered: 12345 }], ['wrong length', { v: 1, seed: '12345', discovered: 'AAAA' }], ['no key (older save)', { v: 1, seed: '12345', version: 1, pos: null, stats: { kills: 3 } }]]) {
    const C = await context(browser, save);
    await C.page.goto(WORLD); await waitWorld(C.page);
    const c = await W(C.page, (a, w) => ({ n: w.discovered().count, far: w.discovered().has(31, 31) }));
    check('fogged on load: ' + name, c.n >= 1 && c.n <= 16 && !c.far, JSON.stringify(c));
    errs.push(...C.errors); await C.ctx.close();
  }
  const O = await context(browser, { v: 1, seed: '999', discovered: live });
  await O.page.goto(WORLD); await waitWorld(O.page);
  const o = await W(O.page, (a, w) => ({ n: w.discovered().count, far: w.discovered().has(31, 31) }));
  const osv = await LS(O.page);
  check('a different world seed starts fogged (the old seed\'s discovery is not reused)', o.n >= 1 && o.n <= 16 && !o.far && osv.seed === '12345', JSON.stringify([o, osv.seed]));
  errs.push(...O.errors); await O.ctx.close();

  // ===== ?fog=0 =====
  const N = await context(browser, null);
  await N.page.goto(WORLD + '&fog=0'); await waitWorld(N.page); await frames(N.page, 20);
  const nf = await W(N.page, (a, w) => ({ on: w.discovered().on }));
  check('?fog=0 turns the fog off: far minimap cells are drawn as terrain', nf.on === false && !isFog(await px(N.page, 30, 30)) && !isFog(await px(N.page, 1, 30)));
  errs.push(...N.errors); await N.ctx.close();

  // ===== phone =====
  const PH = await context(browser, null, { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  await PH.page.goto(WORLD); await waitWorld(PH.page); await frames(PH.page, 20);
  const ph = await PH.page.evaluate(() => { const m = document.getElementById('rw-minimap').getBoundingClientRect(); return { scroll: document.documentElement.scrollWidth <= innerWidth, w: m.width, h: m.height, r: m.right, vw: innerWidth }; });
  check('phone: no horizontal scroll and the minimap is on screen', ph.scroll && ph.r <= ph.vw && ph.w > 0, JSON.stringify(ph));
  errs.push(...PH.errors); await PH.ctx.close();

  check('no console errors', errs.length === 0, errs.join(' | '));
  await browser.close();
  done();
})();
