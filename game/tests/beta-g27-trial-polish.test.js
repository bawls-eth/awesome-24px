// G-27 Trial of Six polish (b03-09, b03-10): the Trial is fought on a clear field (world mobs and their bolts rest when it starts, no world
// spawns and no Raid / Swarm timer while it runs), and a fall says how far the Trial went ("Trial of Six: you fell at fight N of 6 ...").
// Offline: blockDb + every WebSocket closed, town stubbed, no chat, no Firebase writes.
// Run: BASE=http://localhost:8440/game/index.html node game/tests/beta-g27-trial-polish.test.js
const { chromium } = require('playwright');
const { check, done, blockDb } = require('./helpers');
const ORIGIN = (process.env.BASE || 'http://localhost:8440/game/index.html').replace(/\/game\/index\.html.*$/, '');
const WORLD = ORIGIN + '/game/games/mad-maze/index.html?mode=world&test=1&seed=12345&qdate=2030-05-01';
const E = (page, fn, arg) => page.evaluate(`(${fn.toString()})(window.__mm.arena, window.__mm.world, ${JSON.stringify(arg === undefined ? null : arg)})`);
const frames = (page, n) => page.evaluate((k) => new Promise((res) => { let i = 0; const f = () => (++i >= k ? res() : requestAnimationFrame(f)); requestAnimationFrame(f); }), n);

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1000, height: 700 } });
  await blockDb(ctx); await ctx.routeWebSocket(/.*/, (ws) => ws.close());
  await ctx.route('**/game/index.html*', (r) => r.fulfill({ contentType: 'text/html', body: '<!doctype html>town' }));
  const page = await ctx.newPage(); const errors = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  await page.goto(ORIGIN + '/game/games/mad-maze/lantern.css');
  await page.evaluate((v) => { localStorage.clear(); localStorage.setItem('pixeltown-save-v1', v); localStorage.setItem('mm-aim-assist', '0'); },
    JSON.stringify({ realm: { level: 25, xp: 0, shards: 50, bestWave: 2, items: [{ n: 1, id: 'sparkwand', r: 0 }], nextUid: 2, eq: { weapon: 1 }, gv: 1, gp: { b: 0, d: 0 } } }));
  await page.goto(WORLD);
  await page.waitForFunction(() => window.__mm && window.__mm.world && window.__mm.arena.active && window.__mm.arena.state === 'play', null, { timeout: 30000 });
  await E(page, (a) => { a.player.iframes = 1e9; a._hitPlayer = () => {}; return true; });
  // walk the hero somewhere with world mobs around (wait for the spawner), then start the Trial there
  await frames(page, 90);
  const pre = await E(page, (a) => ({ mobs: a.enemies.filter((e) => e.active && e.type !== 'boss').length }));
  const st = await E(page, (a, w) => { const r = w.rush.start(); const mobs = a.enemies.filter((e) => e.active && !e.rushStep).length; const bolts = a.eBullets.filter((b) => b.active).length; return { r, mobs, bolts, boss: !!w.rush.entity() }; });
  check('1. starting the Trial clears the field: no world mob or enemy bolt left, only the Trial boss', st.r === 'rush' && st.boss && st.mobs === 0 && st.bolts === 0, JSON.stringify({ pre, st }));
  await frames(page, 120);
  const mid = await E(page, (a, w) => ({ mobs: a.enemies.filter((e) => e.active && !e.rushStep).length, hud: w.eventHud(), on: w.rush.state().on }));
  check('1b. while the Trial runs no world mob spawns and no Raid / Swarm timer shows', mid.on && mid.mobs === 0 && mid.hud.hidden, JSON.stringify(mid));
  // fall during the Trial: the result line names the fight reached
  await E(page, (a) => { a.player.iframes = 0; a._die(); return true; });
  await page.waitForFunction(() => /Trial of Six: you fell at fight \d of \d/.test((document.getElementById('realm-banner') || {}).textContent || ''), null, { timeout: 6000 }).catch(() => {});
  const fell = await page.evaluate(() => ({ banner: (document.getElementById('realm-banner') || {}).textContent || '', phase: window.__mm.world.rush.state().phase }));
  check('2. a fall in the Trial says how far it went (fight 1 of 6, 0 beaten, drops kept)', fell.phase === 'fell' && /Trial of Six: you fell at fight 1 of 6 · 0 beaten · every drop is in your pack/.test(fell.banner), JSON.stringify(fell));
  check('no page errors', errors.length === 0, errors.join(' | '));
  await ctx.close(); await browser.close();
  done();
})().catch((e) => { console.error(e); process.exit(1); });
