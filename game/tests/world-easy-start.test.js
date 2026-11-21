// Easy start (PLAYTEST-REVIEW #3, #5): a level-1 hero survives 20 s standing still at the shore spawn with the default spawns, and a
// hero that fights kills a shore creature in 2-4 bolts (world-only hero scale from MMDifficulty.heroScale + the shore TTK factor).
// The classic arena and ?difficulty=off keep the old hero numbers.
// Run: BASE=http://localhost:8440/game/index.html NODE_PATH=$(npm root -g) node game/tests/world-easy-start.test.js
const { chromium } = require('playwright');
const { check, done } = require('./helpers');
const ORIGIN = (process.env.BASE || 'http://localhost:8440/game/index.html').replace(/\/game\/index\.html.*$/, '');
const PAGE = ORIGIN + '/game/games/mad-maze/index.html';
const SAVE = { realm: { level: 1, xp: 0, shards: 0, bestWave: 0, items: [], nextUid: 1, eq: {} } };

async function open(browser, q) {
  const ctx = await browser.newContext({ viewport: { width: 1000, height: 700 } });
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
  return { ctx, page };
}

// Hold fire at one shore creature held in place (the real loop, the real bolts): seconds until it dies.
const ttk = (page) => page.evaluate(async () => {
  const a = window.__mm.arena, w = window.__mm.world, p = a.player; p.iframes = 1e9; a._hitPlayer = () => {};
  const gs = w.world.spawnGroups.filter((g) => g.zone === 0);
  const out = [];
  for (const g of gs.slice(0, 6)) {
    p.x = (g.x + 0.5) * 32; p.y = (g.y + 0.5) * 32; a._camStep(-1);
    for (let i = 0; i < 10; i++) await new Promise((r) => requestAnimationFrame(r));
    const e = a.enemies.find((x) => x.active && x.zone === 0 && Math.hypot(x.x - p.x, x.y - p.y) < 420);
    if (!e) continue;
    a.enemies.forEach((x) => { if (x !== e && x.active && Math.hypot(x.x - p.x, x.y - p.y) < 500) x.cd = 1e9; }); // only the target matters
    e.spdMul = 0; e.cd = 1e9; p.x = e.x - 150; p.y = e.y; a._camStep(-1);
    if (a._solidAt && a._blocked(p.x, p.y, 11)) continue;
    const hp = e.maxHp; const t0 = a.clock;
    a.mouse.seen = true; a.mouse.down = true;
    const ex = e.x, ey = e.y; // the world's leash / camp logic may still nudge it: keep the target where it is (we measure damage, not aim)
    while (e.active && a.clock - t0 < 4) { e.x = ex; e.y = ey; a.mouse.x = e.x - a.camera.x; a.mouse.y = e.y - a.camera.y; await new Promise((r) => requestAnimationFrame(r)); }
    a.mouse.down = false;
    out.push({ hp, t: Math.round((a.clock - t0) * 100) / 100, dead: !e.active, type: e.type });
    if (out.length >= 3) break;
  }
  return { out, dmg: a.stats.dmg, rate: a.stats.rate };
});

(async () => {
  const browser = await chromium.launch();
  const errs = [];

  // ===== stand still 20 s at the shore spawn =====
  const S = await open(browser, 'mode=world&test=1&seed=12345');
  const still = await S.page.evaluate(async () => {
    const a = window.__mm.arena, w = window.__mm.world, p = a.player;
    const hp0 = p.hp; let hits = 0; const orig = a._hitPlayer.bind(a); a._hitPlayer = (d) => { hits++; orig(d); };
    const t0 = a.clock; let minHp = p.hp; const x0 = p.x, y0 = p.y;
    while (a.clock - t0 < 20 && a.state === 'play') { await new Promise((r) => requestAnimationFrame(r)); minHp = Math.min(minHp, p.hp); }
    const zone = w.liveEnemies().length; // the spawner is running (default spawns)
    return { hp0, hp: p.hp, minHp, hits, state: a.state, secs: a.clock - t0, moved: Math.hypot(p.x - x0, p.y - y0), live: zone, lv: a.save.level };
  });
  check('level-1 hero standing still 20 s at the shore spawn is alive (default spawns running)', still.lv === 1 && still.state === 'play' && still.secs >= 20 && still.hp > 0 && still.live > 0 && still.moved < 1, JSON.stringify(still));
  check('... and comfortably so: at least 70% hp left', still.minHp >= 0.7 * still.hp0, JSON.stringify(still));
  const k = await ttk(S.page);
  console.log('INFO shore ttk:', JSON.stringify(k));
  check('world hero has the easy-start scale (1.6 dmg per bolt, 7.5 bolts/s)', Math.abs(k.dmg - 1.6) < 1e-9 && Math.abs(k.rate - 7.5) < 1e-9, JSON.stringify(k));
  // PLAYTEST-REVIEW-2 #3 (honest update): shore creatures now have half the hp (MMDifficulty SHORE_TTK, ?ttk=0 restores it), so a shore kill
  // takes 2-4 bolts and well under a second (was "about a second", <= 1.25 s, at 6-12 hp). See world-ttk.test.js for the switch.
  check('a fighting hero kills a shore creature in 2-4 bolts and under 0.8 s of sustained fire', k.out.length >= 2 && k.out.every((r) => r.dead && r.t <= 0.8 && Math.ceil(r.hp / k.dmg) >= 2 && Math.ceil(r.hp / k.dmg) <= 4), JSON.stringify(k.out));
  errs.push(...S.page.errors); await S.ctx.close();

  // ===== ?difficulty=off and the classic arena keep today's hero =====
  const O = await open(browser, 'mode=world&test=1&seed=12345&difficulty=off');
  const off = await O.page.evaluate(() => ({ dmg: window.__mm.arena.stats.dmg, rate: window.__mm.arena.stats.rate }));
  check('?difficulty=off: world hero is back to 1 dmg, 7.5 bolts/s', off.dmg === 1 && off.rate === 7.5, JSON.stringify(off));
  errs.push(...O.page.errors); await O.ctx.close();
  const C = await open(browser, 'test=1&seed=3');
  const cl = await C.page.evaluate(() => ({ dmg: window.__mm.arena.stats.dmg, rate: window.__mm.arena.stats.rate, mode: window.__mm.arena.mode }));
  check('classic arena hero unchanged (1 dmg, 7.5 bolts/s)', cl.mode === 'waves' && cl.dmg === 1 && cl.rate === 7.5, JSON.stringify(cl));
  errs.push(...C.page.errors); await C.ctx.close();

  check('no console or page errors', errs.length === 0, errs.slice(0, 3).join(' | '));
  await browser.close();
  done();
})();
