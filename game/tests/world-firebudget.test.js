// PLAYTEST-REVIEW-2 #2: enemy fire budget in the overworld. Enemies fire only inside the view (+ a margin: off-screen shooters hold), a
// bolt flies at most 0.6 x the view's long side (its lifetime is cut), and the live enemy bullets are capped per zone (shore 40, midlands 80).
// World mode only: the classic arena keeps 6 s bolts and no cap; ?firebudget=0 restores today's world bullets. Phone 390x844, no errors.
// Run: BASE=http://localhost:8440/game/index.html NODE_PATH=$(npm root -g) node game/tests/world-firebudget.test.js
const { chromium } = require('playwright');
const { check, done } = require('./helpers');
const ORIGIN = (process.env.BASE || 'http://localhost:8440/game/index.html').replace(/\/game\/index\.html.*$/, '');
const PAGE = ORIGIN + '/game/games/mad-maze/index.html';
const SAVE = { realm: { level: 1, xp: 0, shards: 0, bestWave: 0, items: [], nextUid: 1, eq: {} } };

async function open(browser, q) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  await ctx.routeWebSocket(/.*/, (ws) => ws.close());
  await ctx.route('**/game/index.html*', (r) => r.fulfill({ contentType: 'text/html', body: '<!doctype html><title>town</title>town' }));
  const page = await ctx.newPage();
  page.errors = [];
  page.on('pageerror', (e) => page.errors.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error') page.errors.push('console: ' + m.text()); });
  await page.goto(ORIGIN + '/game/games/mad-maze/lantern.css');
  await page.evaluate((v) => { localStorage.clear(); localStorage.setItem('pixeltown-save-v1', v); localStorage.setItem('mm-aim-assist', '0'); }, JSON.stringify(SAVE));
  page.errors.length = 0;
  await page.goto(PAGE + '?' + q);
  await page.waitForFunction(() => window.__mm && window.__mm.arena && window.__mm.arena.active && (window.__mm.arena.mode !== 'world' || window.__mm.arena.state === 'play'), null, { timeout: 15000 });
  await page.evaluate(() => { const a = window.__mm.arena; a.player.iframes = 1e9; a._hitPlayer = () => {}; });
  return { ctx, page };
}
// synchronous probe: clear the enemy bolts, fire n bolts from the player's spot in one go, read the pool
const burst = (page, n) => page.evaluate((k) => {
  const a = window.__mm.arena; a.eBullets.forEach((b) => { b.active = false; }); a._ebLive = 0; const c0 = a._ebCapped;
  for (let i = 0; i < k; i++) a.fireEnemyBullet(a.player.x + 300, a.player.y, Math.PI, 150, 1);
  const act = a.eBullets.filter((b) => b.active); const life = act.length ? act[0].life : null;
  const out = { active: act.length, capped: a._ebCapped - c0, life, long: Math.max(a.W, a.H), fb: a._fireBudget() ? Object.assign({}, a._fireBudget()) : null };
  a.eBullets.forEach((b) => { b.active = false; }); a._ebLive = 0;
  return out;
}, n);

(async () => {
  const browser = await chromium.launch();
  const errs = [];

  // ===== default world (shore spawn) =====
  const D = await open(browser, 'mode=world&test=1&seed=12345');
  const fb0 = await D.page.evaluate(() => { const w = window.__mm.world; return { on: w.fireBudget.on, now: w.fireBudget.now(), caps: [0, 1, 2, 3].map(w.fireBudget.capFor) }; });
  check('world: fire budget on, shore cap 40 at the spawn, caps 40/80/140/200 by zone, travel 0.6', fb0.on === true && fb0.now && fb0.now.cap === 40 && fb0.now.zone === 0 && fb0.now.travel === 0.6 && fb0.caps.join() === '40,80,140,200', JSON.stringify(fb0));
  const b1 = await burst(D.page, 100);
  check('shore: 100 bolts fired at once -> only 40 live, 60 held back', b1.active === 40 && b1.capped === 60, JSON.stringify(b1));
  check('a 150 px/s bolt lives 0.6 x the view long side / speed (travel capped), not 6 s', b1.life !== null && Math.abs(b1.life - 0.6 * b1.long / 150) < 1e-6 && b1.life < 6, JSON.stringify(b1));
  // the Midlands raise the cap
  const mid = await D.page.evaluate(() => { const W = window.__mm.world.world; for (let i = 0; i < W.zone.length; i++) if (W.zone[i] === 1 && !W.solid[i]) return [i % W.w, (i / W.w) | 0]; return null; });
  await D.page.evaluate((t) => { const a = window.__mm.arena; a.player.x = (t[0] + 0.5) * 32; a.player.y = (t[1] + 0.5) * 32; window.__mm.world.syncHud(true); }, mid);
  const b2 = await burst(D.page, 120);
  check('midlands: the cap is 80', b2.fb && b2.fb.cap === 80 && b2.active === 80 && b2.capped === 40, JSON.stringify(b2));
  // real play at the spawn for 6 s: the live count never passes the shore cap, and every enemy bolt stays near the view
  await D.page.evaluate(() => { const a = window.__mm.arena, W = window.__mm.world.world; a.player.x = (W.spawnPoint.x + 0.5) * 32; a.player.y = (W.spawnPoint.y + 0.5) * 32; a._camStep(-1); window.__mm.world.syncHud(true); });
  const play = await D.page.evaluate(async () => {
    const a = window.__mm.arena, W = window.__mm.world.world, p = a.player;
    const g = W.spawnGroups.filter((q) => q.zone === 0).sort((x, y) => Math.hypot(x.x - W.spawnPoint.x, x.y - W.spawnPoint.y) - Math.hypot(y.x - W.spawnPoint.x, y.y - W.spawnPoint.y))[0];
    p.x = (g.x + 0.5) * 32 - 120; p.y = (g.y + 0.5) * 32; a._camStep(-1); window.__mm.world.syncHud(true);
    let maxLive = 0, fired = 0, far = 0; const lim = 0.6 * Math.max(a.W, a.H) + Math.hypot(a.W, a.H) / 2 + 40; const t0 = a.clock; const seen = new Set();
    while (a.clock - t0 < 6) {
      await new Promise((r) => requestAnimationFrame(r)); p.x = (g.x + 0.5) * 32 - 120; p.y = (g.y + 0.5) * 32;
      let n = 0; a.eBullets.forEach((b) => { if (b.active) { n++; if (!seen.has(b)) { seen.add(b); fired++; } if (Math.hypot(b.x - p.x, b.y - p.y) > lim) far++; } else seen.delete(b); });
      maxLive = Math.max(maxLive, n);
    }
    return { maxLive, fired, far, cap: a.fireBudget.cap };
  });
  check('6 s of real shore play beside a group: enemies fire, live bolts never exceed 40, none far outside the view', play.fired > 0 && play.maxLive <= 40 && play.far === 0 && play.cap === 40, JSON.stringify(play));
  const off = await D.page.evaluate(async () => { // an enemy well outside the view (+64 px) never fires
    const a = window.__mm.arena, p = a.player; a.enemies.forEach((e) => { e.active = false; }); a.eBullets.forEach((b) => { b.active = false; });
    const e = a.spawnEnemy('aimed', a.camera.x + a.W + 200, p.y); e.cd = 0; e.spdMul = 0;
    const t0 = a.clock; let shots = 0;
    while (a.clock - t0 < 1.5) { await new Promise((r) => requestAnimationFrame(r)); e.x = a.camera.x + a.W + 200; e.y = p.y; a.eBullets.forEach((b) => { if (b.active) shots++; }); }
    e.active = false; return { shots };
  });
  check('an enemy 200 px outside the view holds its fire', off.shots === 0, JSON.stringify(off));
  const sw = await D.page.evaluate(() => document.documentElement.scrollWidth <= innerWidth);
  check('390x844: no horizontal scroll', sw);
  errs.push(...D.page.errors); await D.ctx.close();

  // ===== ?firebudget=0: today's bullets =====
  const F = await open(browser, 'mode=world&test=1&seed=12345&firebudget=0');
  const bf = await burst(F.page, 100);
  const fon = await F.page.evaluate(() => window.__mm.world.fireBudget.on);
  check('?firebudget=0: no cap (100 live) and 6 s bolts', fon === false && bf.fb === null && bf.active === 100 && bf.capped === 0 && bf.life === 6, JSON.stringify(bf));
  errs.push(...F.page.errors); await F.ctx.close();

  // ===== the classic arena is unchanged =====
  const C = await open(browser, 'test=1&seed=3');
  await C.page.evaluate(() => { window.__mm.arena.fireBudget = { cap: 5, travel: 0.1 }; }); // even a stray budget is ignored outside the world
  const bc = await burst(C.page, 60);
  check('classic arena: no cap, 6 s bolts (a budget object is ignored outside world mode)', bc.fb === null && bc.active === 60 && bc.life === 6, JSON.stringify(bc));
  errs.push(...C.page.errors); await C.ctx.close();

  check('no console or page errors', errs.length === 0, errs.slice(0, 3).join(' | '));
  await browser.close();
  done();
})();
