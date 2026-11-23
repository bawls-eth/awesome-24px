// b01-07 (round 3): the overworld boss bar is hidden on the "You fell" card (a boss still alive after the hero falls).
// Offline: blockDb + every WebSocket closed, town stubbed, no chat, no Firebase writes.
// Run: BASE=http://localhost:8440/game/index.html node game/tests/beta-r3-boss-bar-fall.test.js
const { chromium } = require('playwright');
const { check, done, blockDb } = require('./helpers');
const ORIGIN = (process.env.BASE || 'http://localhost:8440/game/index.html').replace(/\/game\/index\.html.*$/, '');
const WORLD = ORIGIN + '/game/games/mad-maze/index.html?mode=world&test=1&seed=4242&qdate=2030-05-01';
const frames = (page, n) => page.evaluate((k) => new Promise((res) => { let i = 0; const f = () => (++i >= k ? res() : requestAnimationFrame(f)); requestAnimationFrame(f); }), n);
const bar = (page) => page.evaluate(() => { const e = document.getElementById('realm-boss'); return { shown: !!e && !e.classList.contains('hidden'), state: window.__mm.arena.state, boss: !!window.__mm.arena._boss() }; });

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  const db = await blockDb(ctx); await ctx.routeWebSocket(/.*/, (ws) => ws.close());
  await ctx.route('**/game/index.html*', (r) => r.fulfill({ contentType: 'text/html', body: '<!doctype html>town' }));
  const page = await ctx.newPage(); const errors = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  await page.goto(ORIGIN + '/game/games/mad-maze/lantern.css');
  await page.evaluate(() => { localStorage.clear(); localStorage.setItem('mm-aim-assist', '0'); });
  await page.goto(WORLD);
  await page.waitForFunction(() => window.__mm && window.__mm.world && window.__mm.arena.active && window.__mm.arena.state === 'play', null, { timeout: 30000 });
  // a boss beside the hero (the hero takes no damage until the scripted fall)
  await page.evaluate(() => { const a = window.__mm.arena; a.player.iframes = 1e9; a._hitPlayer = () => {}; a.spawnEnemy('boss', a.player.x + 120, a.player.y); a._syncBoss(); });
  await frames(page, 20);
  const up = await bar(page);
  check('1. a live boss shows its bar during the fight', up.shown && up.boss && up.state === 'play', JSON.stringify(up));
  await page.evaluate(() => { const a = window.__mm.arena; a.player.iframes = 0; a._die(); });
  await frames(page, 30);
  const dead = await bar(page);
  check('2. b01-07: the boss is still alive, but its bar is hidden on the "You fell" card', dead.state === 'dead' && dead.boss && !dead.shown, JSON.stringify(dead));
  check('3. the fall card itself is up', await page.evaluate(() => /You fell/.test((document.getElementById('realm-banner') || {}).textContent || '')), '');
  check('no page errors', errors.length === 0, errors.join(' | '));
  check('no database traffic', db.attempts() === 0);
  await ctx.close(); await browser.close();
  done();
})().catch((e) => { console.error(e); process.exit(1); });
