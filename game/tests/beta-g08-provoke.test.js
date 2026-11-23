// G-08 (b01-03): no off-screen farming. A world shooter hit while it holds its fire (beyond the view) is provoked for 4 s: it fires and a
// non-approaching Whirler walks in. Unprovoked off-screen shooters still never fire; the bullet cap holds. Desktop and phone (390x844).
// Offline: blockDb + every WebSocket closed, town stubbed, no chat, no Firebase writes.
// Run: BASE=http://localhost:8440/game/index.html node game/tests/beta-g08-provoke.test.js
const { chromium } = require('playwright');
const { check, done, blockDb } = require('./helpers');
const ORIGIN = (process.env.BASE || 'http://localhost:8440/game/index.html').replace(/\/game\/index\.html.*$/, '');
const WORLD = ORIGIN + '/game/games/mad-maze/index.html?mode=world&test=1&offline=1&seed=12345&qdate=2030-05-01';
const A = (page, fn, arg) => page.evaluate(`(${fn.toString()})(window.__mm.arena, window.__mm.world, ${JSON.stringify(arg === undefined ? null : arg)})`);

(async () => {
  const browser = await chromium.launch();
  for (const [label, opts] of [['1280x720', { viewport: { width: 1280, height: 720 } }], ['390x844', { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true }]]) {
    const ctx = await browser.newContext(opts);
    await blockDb(ctx); await ctx.routeWebSocket(/.*/, (ws) => ws.close());
    await ctx.route('**/game/index.html*', (r) => r.fulfill({ contentType: 'text/html', body: '<!doctype html>town' }));
    const page = await ctx.newPage(); const errors = [];
    page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
    await page.goto(ORIGIN + '/game/games/mad-maze/lantern.css');
    await page.evaluate(() => { localStorage.clear(); localStorage.setItem('mm-aim-assist', '0'); localStorage.setItem('pixeltown-save-v1', JSON.stringify({ realm: { level: 8, xp: 0, shards: 5, bestWave: 1, items: [], nextUid: 1, eq: {} } })); });
    await page.goto(WORLD);
    await page.waitForFunction(() => window.__mm && window.__mm.world && window.__mm.arena.active && window.__mm.arena.state === 'play', null, { timeout: 30000 });
    // freeze the page loop, place two Whirlers 400 px above the view; only one is hit; step the arena by hand for 2 s
    const r = await A(page, (a) => {
      a.player.iframes = 1e9; a._hitPlayer = () => {}; a.paused = true;
      a.enemies.forEach((e) => { e.active = false; }); a.eBullets.forEach((b) => { b.active = false; });
      const p = a.player; const top = a.camera.y;
      const hit = a.spawnEnemy('spiral', p.x - 60, top - 400), calm = a.spawnEnemy('spiral', p.x + 60, top - 400);
      [hit, calm].forEach((e) => { e.ax = e.x; e.ay = e.y; e.hp = e.maxHp = 9999; e.cd = 0; });
      const shots = new Map([[hit, 0], [calm, 0]]); const of = a.fireEnemyBullet;
      a.fireEnemyBullet = function () { if (shots.has(this._curE)) shots.set(this._curE, shots.get(this._curE) + 1); return of.apply(this, arguments); };
      const d0 = Math.hypot(hit.x - p.x, hit.y - p.y);
      const canBefore = a._canFire(hit, p);
      a._hitEnemy(hit, 1);
      const prov = hit.provT;
      let maxB = 0;
      for (let k = 0; k < 120; k++) { a._updateEnemies(1 / 60); a._updateBullets(1 / 60); maxB = Math.max(maxB, a.eBullets.filter((b) => b.active).length); p.x = p.x; }
      const d1 = Math.hypot(hit.x - p.x, hit.y - p.y);
      a.fireEnemyBullet = of; a.paused = false;
      return { canBefore, prov, shotsHit: shots.get(hit), shotsCalm: shots.get(calm), moved: d0 - d1, maxB, cap: a.eBullets.length };
    });
    check(`${label}: setup: the Whirler 400 px above the view holds its fire before the hit`, r.canBefore === false, JSON.stringify(r));
    check(`${label}: 1. hit from off screen: provoked for 4 s, and within 2 s it has fired or moved >= 60 px toward the hero`, r.prov === 4 && (r.shotsHit > 0 || r.moved >= 60), JSON.stringify(r));
    check(`${label}: 2. the unprovoked off-screen Whirler never fires`, r.shotsCalm === 0, JSON.stringify(r));
    check(`${label}: 3. enemy bullets stay within the pool cap`, r.maxB <= r.cap, JSON.stringify(r));
    check(`${label}: no page errors`, errors.length === 0, errors.join(' | '));
    await ctx.close();
  }
  await browser.close();
  done();
})().catch((e) => { console.error(e); process.exit(1); });
