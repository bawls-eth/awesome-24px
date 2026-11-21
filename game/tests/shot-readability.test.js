// Shot readability (PLAYTEST-REVIEW #4, #6): world-mode enemies only fire while on screen and within 0.95 x the view's half-diagonal;
// far enemy bullets are dropped; the player's bolt is the brighter, outlined one and enemy bullets (dark rim, own hue per pattern)
// are never more than 1.3x its size; at most RM_EB_DRAW enemy bullets are drawn. The classic arena keeps its behaviour.
// Run: BASE=http://localhost:8440/game/index.html NODE_PATH=$(npm root -g) node game/tests/shot-readability.test.js
const { chromium } = require('playwright');
const { check, done } = require('./helpers');
const ORIGIN = (process.env.BASE || 'http://localhost:8440/game/index.html').replace(/\/game\/index\.html.*$/, '');
const PAGE = ORIGIN + '/game/games/mad-maze/index.html';

async function open(browser, q, opts) {
  const ctx = await browser.newContext(opts || { viewport: { width: 1000, height: 700 } });
  await ctx.routeWebSocket(/.*/, (ws) => ws.close());
  await ctx.route('**/game/index.html*', (r) => r.fulfill({ contentType: 'text/html', body: '<!doctype html><title>town</title>town' }));
  const page = await ctx.newPage();
  page.errors = [];
  page.on('pageerror', (e) => page.errors.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error') page.errors.push('console: ' + m.text()); });
  await page.goto(ORIGIN + '/game/games/mad-maze/lantern.css');
  await page.evaluate(() => { localStorage.clear(); localStorage.setItem('mm-aim-assist', '0'); });
  page.errors.length = 0;
  await page.goto(PAGE + '?' + q);
  await page.waitForFunction(() => window.__mm && window.__mm.arena && window.__mm.arena.active && window.__mm.arena.state !== 'idle', null, { timeout: 15000 });
  return { ctx, page };
}

// Put one Sniper at (dx, dy) from the player with its cooldown ready, step the enemies, count the bolts it fired.
const shooter = (page, dx, dy, type) => page.evaluate(([dx, dy, type]) => {
  const a = window.__mm.arena, p = a.player; a.paused = true; p.iframes = 1e9;
  a.enemies.forEach((e) => { e.active = false; }); a.eBullets.forEach((b) => { b.active = false; });
  if (a.world) a._camStep(-1);
  const e = a.spawnEnemy(type || 'aimed', p.x + dx, p.y + dy); e.cd = 0; e.spdMul = 0; e.ax = e.x; e.ay = e.y;
  const ex = e.x, ey = e.y;
  for (let i = 0; i < 60; i++) a._updateEnemies(1 / 60);
  const n = a.eBullets.filter((b) => b.active).length;
  const c = a.camera; const on = ex >= c.x && ex <= c.x + a.W && ey >= c.y && ey <= c.y + a.H;
  a.enemies.forEach((x) => { x.active = false; }); a.eBullets.forEach((b) => { b.active = false; });
  return { n, on, W: a.W, H: a.H, dist: Math.hypot(dx, dy) };
}, [dx, dy, type]);

(async () => {
  const browser = await chromium.launch();
  const errs = [];

  // ===== world mode (desktop) =====
  const W = await open(browser, 'mode=world&test=1&seed=12345');
  await W.page.waitForFunction(() => window.__mm.arena.state === 'play');
  const view = await W.page.evaluate(() => ({ W: window.__mm.arena.W, H: window.__mm.arena.H }));
  const onS = await shooter(W.page, 200, 60);
  const offX = await shooter(W.page, view.W / 2 + 120, 0);
  const offY = await shooter(W.page, 0, view.H / 2 + 90); // off screen but well inside the half-diagonal
  const far = await shooter(W.page, view.W / 2 + 500, 0);
  const ring = await shooter(W.page, view.W / 2 + 150, 40, 'ring');
  check('world: an on-screen Sniper fires', onS.on && onS.n >= 3, JSON.stringify(onS));
  check('world: a Sniper just off the right edge does not fire', !offX.on && offX.n === 0, JSON.stringify(offX));
  check('world: a Sniper just below the view (inside the half-diagonal) does not fire either', !offY.on && offY.n === 0 && offY.dist < Math.hypot(view.W, view.H) / 2, JSON.stringify(offY));
  check('world: far off-screen Snipers and Bursters hold their fire', far.n === 0 && ring.n === 0, JSON.stringify([far, ring]));
  const back = await W.page.evaluate(() => { // walks onto the screen: fires within 0.2 s of becoming visible
    const a = window.__mm.arena, p = a.player; a.paused = true;
    a.enemies.forEach((e) => { e.active = false; }); a.eBullets.forEach((b) => { b.active = false; }); a._camStep(-1);
    const e = a.spawnEnemy('aimed', p.x + a.W / 2 + 120, p.y); e.cd = 0; e.spdMul = 0;
    for (let i = 0; i < 30; i++) a._updateEnemies(1 / 60);
    const before = a.eBullets.filter((b) => b.active).length;
    e.x = p.x + 200; let at = -1;
    for (let i = 0; i < 30 && at < 0; i++) { a._updateEnemies(1 / 60); if (a.eBullets.some((b) => b.active)) at = i + 1; }
    a.enemies.forEach((x) => { x.active = false; }); a.eBullets.forEach((b) => { b.active = false; });
    return { before, at };
  });
  check('world: a held shooter fires within 0.2 s once it is on screen', back.before === 0 && back.at > 0 && back.at <= 13, JSON.stringify(back));
  const cull = await W.page.evaluate(() => {
    const a = window.__mm.arena, p = a.player; a.paused = true; a.eBullets.forEach((b) => { b.active = false; });
    const D = Math.hypot(a.W, a.H);
    a.fireEnemyBullet(p.x + D + 40, p.y, 0, 10, 0); a.fireEnemyBullet(p.x + 300, p.y + 40, 0, 10, 1);
    a._updateBullets(1 / 60);
    const left = a.eBullets.filter((b) => b.active).map((b) => Math.round(b.x - p.x));
    a.eBullets.forEach((b) => { b.active = false; });
    return left;
  });
  check('world: an enemy bullet more than one view diagonal away is dropped, a near one is kept', cull.length === 1 && cull[0] > 290 && cull[0] < 320, JSON.stringify(cull));

  // Sprites: the player's bolt vs enemy bullets (opaque radius measured on the baked canvases).
  const spr = await W.page.evaluate(() => {
    const a = window.__mm.arena;
    const measure = (cv, thr) => { const g = cv.getContext('2d'); const d = g.getImageData(0, 0, cv.width, cv.height).data; const cx = cv.width / 2, cy = cv.height / 2; let r = 0;
      for (let y = 0; y < cv.height; y++) for (let x = 0; x < cv.width; x++) if (d[(y * cv.width + x) * 4 + 3] >= thr) r = Math.max(r, Math.hypot(x + 0.5 - cx, y + 0.5 - cy)); return r; };
    const px = (cv, x, y) => Array.from(cv.getContext('2d').getImageData(x, y, 1, 1).data);
    const pb = a.sprites.pBullet; const eb = a.sprites.eBullet;
    return { R: RM_BOLT_R, pR: measure(pb, 200), eR: eb.map((c) => measure(c, 200)), pCore: px(pb, 10, 10), pEdge: px(pb, 10, 10 - RM_BOLT_R.player + 1),
      eRim: eb.map((c) => px(c, 8, 8 - RM_BOLT_R.enemy + 0.5 | 0)), eBody: eb.map((c) => px(c, 8, 5)), cap: RM_EB_DRAW };
  });
  const lum = (c) => 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
  check('player bolt: solid radius ~5 px with a white core and a light (near-white) outline', spr.pR >= 4.5 && spr.pR <= 6 && lum(spr.pCore) > 245 && lum(spr.pEdge) > 200, JSON.stringify(spr));
  check('enemy bullets are never larger than 1.3x the player bolt (constants and baked pixels)', spr.R.enemy / spr.R.player <= 1.3 && spr.eR.every((r) => r / spr.pR <= 1.3), JSON.stringify([spr.R, spr.pR, spr.eR]));
  check('enemy bullets have a dark rim and three distinct hues', spr.eRim.every((c) => lum(c) < 40 && c[3] > 200) && new Set(spr.eBody.map((c) => c.slice(0, 3).join())).size === 3, JSON.stringify([spr.eRim, spr.eBody]));
  check('the player bolt core is brighter than any enemy bullet body', spr.eBody.every((c) => lum(c) < lum(spr.pCore) - 60), JSON.stringify(spr.eBody));
  const cap = await W.page.evaluate(() => {
    const a = window.__mm.arena, p = a.player; a.paused = true; a.eBullets.forEach((b) => { b.active = false; });
    for (let i = 0; i < 600; i++) a.fireEnemyBullet(p.x + (i % 40) * 10 - 200, p.y + Math.floor(i / 40) * 10 - 80, 0, 0, i % 3);
    const live = a.eBullets.filter((b) => b.active).length; a._draw(); const drawn = a._ebDrawn;
    a.eBullets.forEach((b) => { b.active = false; });
    return { live, drawn };
  });
  check('at most RM_EB_DRAW enemy bullets are drawn per frame', cap.live >= 500 && cap.drawn === spr.cap, JSON.stringify(cap));
  errs.push(...W.page.errors); await W.ctx.close();

  // ===== classic arena: unchanged (the whole arena is the view; a far enemy still fires) =====
  const C = await open(browser, 'test=1&seed=3');
  const cf = await C.page.evaluate(() => {
    const a = window.__mm.arena, p = a.player; a.paused = true; a.state = 'play'; p.x = 60; p.y = 60;
    a.enemies.forEach((e) => { e.active = false; }); a.eBullets.forEach((b) => { b.active = false; });
    const e = a.spawnEnemy('aimed', a.W - 40, a.H - 40); e.cd = 0; e.spdMul = 0;
    for (let i = 0; i < 30; i++) a._updateEnemies(1 / 60);
    const n = a.eBullets.filter((b) => b.active).length;
    a.fireEnemyBullet(a.W - 10, a.H - 10, 0, 0, 0); a._updateBullets(1 / 60);
    const kept = a.eBullets.filter((b) => b.active).length;
    a.enemies.forEach((x) => { x.active = false; }); a.eBullets.forEach((b) => { b.active = false; });
    return { n, kept, canFire: a._canFire(e, p) };
  });
  check('classic arena: a far corner Sniper still fires and its bullets are kept', cf.n >= 3 && cf.kept === cf.n + 1 && cf.canFire === true, JSON.stringify(cf));
  errs.push(...C.page.errors); await C.ctx.close();

  // ===== phone portrait world: the narrow view gates sideways shooters =====
  const PH = await open(browser, 'mode=world&test=1&seed=12345', { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  await PH.page.waitForFunction(() => window.__mm.arena.state === 'play');
  const pv = await PH.page.evaluate(() => ({ W: window.__mm.arena.W, H: window.__mm.arena.H }));
  const side = await shooter(PH.page, pv.W / 2 + 80, 0);
  const up = await shooter(PH.page, 0, -300);
  check('phone: a Sniper off the side of the narrow view holds fire, one on screen above fires', side.n === 0 && up.on && up.n >= 3, JSON.stringify([pv, side, up]));
  check('phone: no horizontal scroll', await PH.page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1));
  errs.push(...PH.page.errors); await PH.ctx.close();

  check('no console or page errors', errs.length === 0, errs.slice(0, 3).join(' | '));
  await browser.close();
  done();
})();
