// G-23 (b03-01): Enter (a fire key) never opens the Nexus mid Trial of Six. During the fight the Nexus button reads "Finish the fight first"
// and is disabled, Enter keeps firing and the arena is never paused; after the Trial ends both work again; outside a fight Enter by the
// Nexus opens it as before. Offline: blockDb + every WebSocket closed, town stubbed, no chat, no Firebase writes.
// Run: BASE=http://localhost:8440/game/index.html node game/tests/beta-g23-trial-enter.test.js
const { chromium } = require('playwright');
const { check, done, blockDb } = require('./helpers');
const ORIGIN = (process.env.BASE || 'http://localhost:8440/game/index.html').replace(/\/game\/index\.html.*$/, '');
const WORLD = ORIGIN + '/game/games/mad-maze/index.html?mode=world&test=1&seed=12345&qdate=2030-05-01';
const save = (level) => ({ realm: { level, xp: 0, shards: 50, bestWave: 2, items: [{ n: 1, id: 'sparkwand', r: 0 }], nextUid: 2, eq: { weapon: 1 }, gv: 1, gp: { b: 0, d: 0 } } });
const E = (page, fn, arg) => page.evaluate(`(${fn.toString()})(window.__mm.arena, window.__mm.world, ${JSON.stringify(arg)})`);
const frames = (page, n) => page.evaluate((k) => new Promise((res) => { let i = 0; const f = () => (++i >= k ? res() : requestAnimationFrame(f)); requestAnimationFrame(f); }), n);

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1000, height: 700 } });
  await blockDb(ctx); await ctx.routeWebSocket(/.*/, (ws) => ws.close());
  await ctx.route('**/game/index.html*', (r) => r.fulfill({ contentType: 'text/html', body: '<!doctype html>town' }));
  const page = await ctx.newPage(); const errors = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  await page.goto(ORIGIN + '/game/games/mad-maze/lantern.css');
  await page.evaluate((v) => { localStorage.clear(); localStorage.setItem('pixeltown-save-v1', v); localStorage.setItem('mm-aim-assist', '0'); }, JSON.stringify(save(25)));
  await page.goto(WORLD);
  await page.waitForFunction(() => window.__mm && window.__mm.world && window.__mm.arena.active && window.__mm.arena.state === 'play', null, { timeout: 30000 });
  await E(page, (a) => { a.player.iframes = 1e9; a._hitPlayer = () => {}; });
  const toPortal = () => E(page, (a, w) => { const s = w.nexus.site; a.player.x = s.x - 20; a.player.y = s.y; return true; });

  // 3: outside a fight, Enter by the Nexus opens it (unchanged)
  await toPortal(); await frames(page, 15);
  const pre = await page.evaluate(() => { const b = document.getElementById('rw-nexus-go'); return { hidden: b.classList.contains('hidden'), dis: b.disabled, t: b.textContent }; });
  await page.keyboard.press('Enter'); await frames(page, 4);
  check('3. outside a fight Enter by the Nexus opens it (prompt "Visit the Nexus")', !pre.hidden && !pre.dis && /Visit the Nexus/.test(pre.t) && (await E(page, (a, w) => w.nexus.isOpen())), JSON.stringify(pre));

  // start the Trial from inside the Nexus (the gate), then stand by the Nexus portal during phase 'fight'
  const st = await E(page, (a, w) => { const r = w.rush.start(); return { r, st: w.rush.state(), open: w.nexus.isOpen() }; });
  check('setup: the Trial of Six starts (phase fight) and the Nexus closes', st.r === 'rush' && st.st.on && st.st.phase === 'fight' && !st.open, JSON.stringify(st));
  await toPortal(); await frames(page, 15);
  const shots0 = await E(page, (a) => { a.mouse.down = false; a.pBullets.forEach((b) => { b.active = false; }); a.player.fireCd = 0; return 0; });
  await page.keyboard.down('Enter'); await frames(page, 12);
  const mid = await E(page, (a, w) => ({ open: w.nexus.isOpen(), paused: a.paused, shots: a.pBullets.filter((b) => b.active).length, phase: w.rush.state().phase }));
  await page.keyboard.up('Enter');
  check('1. Enter during the Trial fight does not open the Nexus and does not pause the arena', !mid.open && !mid.paused && mid.phase === 'fight', JSON.stringify(mid));
  check('1b. Enter still fires during the fight (shots spawned)', mid.shots > shots0, JSON.stringify(mid));
  const btn = await page.evaluate(() => { const b = document.getElementById('rw-nexus-go'); return { hidden: b.classList.contains('hidden'), dis: b.disabled, t: b.textContent }; });
  check('2. during the fight the Nexus button is disabled and reads "Finish the fight first"', btn.hidden || (btn.dis && /Finish the fight first/.test(btn.t)), JSON.stringify(btn));
  const clk = await E(page, (a, w) => { document.getElementById('rw-nexus-go').click(); return { open: w.nexus.isOpen(), paused: a.paused }; });
  check('2b. a click on the button (even scripted) does not open the Nexus mid fight', !clk.open && !clk.paused, JSON.stringify(clk));

  // after the Trial ends (leave), both work again
  await E(page, (a, w) => { w.rush.leave(); return true; });
  await toPortal(); await frames(page, 15);
  const post = await page.evaluate(() => { const b = document.getElementById('rw-nexus-go'); return { hidden: b.classList.contains('hidden'), dis: b.disabled, t: b.textContent }; });
  await page.keyboard.press('Enter'); await frames(page, 4);
  check('2c. after the Trial ends the button is back ("Visit the Nexus", enabled) and Enter opens the Nexus', !post.hidden && !post.dis && /Visit the Nexus/.test(post.t) && (await E(page, (a, w) => w.nexus.isOpen())), JSON.stringify(post));
  check('no page errors', errors.length === 0, errors.join(' | '));
  await ctx.close(); await browser.close();
  done();
})().catch((e) => { console.error(e); process.exit(1); });
