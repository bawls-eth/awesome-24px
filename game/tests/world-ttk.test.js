// PLAYTEST-REVIEW-2 #3: early time-to-kill and the loot loop. Every shore creature dies in 2-4 bolts of the level-1 world hero (1.6 dmg;
// MMDifficulty SHORE_TTK halves shore hp), a real held-fire kill takes 2-4 hits, and the pickup magnet reaches 120 px (a fight's drop
// scatter) instead of 64. ?ttk=0 restores today's hp and magnet. Deterministic seed, phone 390x844, no console errors.
// Run: BASE=http://localhost:8440/game/index.html NODE_PATH=$(npm root -g) node game/tests/world-ttk.test.js
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
  await page.goto(PAGE + '?mode=world&test=1&seed=12345' + q);
  await page.waitForFunction(() => window.__mm && window.__mm.world && window.__mm.arena.active && window.__mm.arena.state === 'play', null, { timeout: 30000 });
  await page.evaluate(() => { const a = window.__mm.arena; a.player.iframes = 1e9; a._hitPlayer = () => {}; });
  return { ctx, page };
}
// shore creatures the spawner activated around the first shore groups (sorted by spawner id: deterministic)
const shoreHp = (page) => page.evaluate(async () => {
  const a = window.__mm.arena, w = window.__mm.world, W = w.world, p = a.player;
  const gs = W.spawnGroups.filter((g) => g.zone === 0).slice(0, 8);
  const seen = new Map();
  for (const g of gs) {
    p.x = (g.x + 0.5) * 32; p.y = (g.y + 0.5) * 32; a._camStep(-1);
    for (let i = 0; i < 4; i++) await new Promise((r) => requestAnimationFrame(r));
    w.liveEnemies().forEach((e) => { if (e.zone === 0 && !seen.has(e.id)) seen.set(e.id, { id: e.id, hp: e.hp, type: e.type }); });
  }
  return { list: [...seen.values()].sort((x, y) => x.id - y.id), dmg: a.stats.dmg };
});
// hold fire at one shore creature pinned in place: hits until it dies
const hits = (page) => page.evaluate(async () => {
  const a = window.__mm.arena, w = window.__mm.world, p = a.player; const out = [];
  for (const g of w.world.spawnGroups.filter((q) => q.zone === 0).slice(0, 8)) {
    p.x = (g.x + 0.5) * 32; p.y = (g.y + 0.5) * 32; a._camStep(-1);
    for (let i = 0; i < 8; i++) await new Promise((r) => requestAnimationFrame(r));
    const e = a.enemies.find((x) => x.active && x.zone === 0 && Math.hypot(x.x - p.x, x.y - p.y) < 420);
    if (!e) continue;
    a.enemies.forEach((x) => { if (x !== e && x.active) x.active = false; });
    e.spdMul = 0; e.cd = 1e9; p.x = e.x - 150; p.y = e.y; a._camStep(-1);
    if (a._solidAt && a._blocked(p.x, p.y, 11)) continue;
    let n = 0; const orig = a.onEnemyHit; a.onEnemyHit = (x, d) => { if (x === e) n++; if (orig) orig(x, d); };
    const ex = e.x, ey = e.y, hp = e.maxHp, t0 = a.clock; a.mouse.seen = true; a.mouse.down = true;
    while (e.active && a.clock - t0 < 4) { e.x = ex; e.y = ey; a.mouse.x = e.x - a.camera.x; a.mouse.y = e.y - a.camera.y; await new Promise((r) => requestAnimationFrame(r)); }
    a.mouse.down = false; a.onEnemyHit = orig;
    out.push({ hp, n, dead: !e.active, type: e.type });
    if (out.length >= 3) break;
  }
  return out;
});
// six pickups dropped 100 px to the right of a still hero: how many arrive in 1.2 s
const magnet = (page) => page.evaluate(async () => {
  const a = window.__mm.arena, w = window.__mm.world, p = a.player, W = w.world;
  p.x = (W.spawnPoint.x + 0.5) * 32; p.y = (W.spawnPoint.y + 0.5) * 32; a.enemies.forEach((e) => { e.active = false; });
  const g0 = w.pickups.got(); const before = Object.values(g0).reduce((s, v) => s + v, 0);
  let n = 0; for (let k = 0; k < 3; k++) n += w.pickups.spawn(p.x + 100, p.y, 'mag', 900 + k, 1);
  const t0 = a.clock; while (a.clock - t0 < 1.2) { p.x = (W.spawnPoint.x + 0.5) * 32; p.y = (W.spawnPoint.y + 0.5) * 32; await new Promise((r) => requestAnimationFrame(r)); }
  const got = Object.values(w.pickups.got()).reduce((s, v) => s + v, 0) - before;
  return { spawned: n, got, radius: w.pickups.magnet, on: w.ttk.on };
});

(async () => {
  const browser = await chromium.launch();
  const errs = [];

  const D = await open(browser, '');
  const s1 = await shoreHp(D.page);
  const bolts = s1.list.map((e) => Math.ceil(e.hp / s1.dmg));
  check('>= 6 shore creatures sampled around the first shore groups', s1.list.length >= 6, JSON.stringify(s1));
  check('every sampled shore creature dies in 2-4 bolts of the level-1 hero (1.6 dmg)', s1.dmg === 1.6 && bolts.every((b) => b >= 2 && b <= 4), JSON.stringify({ bolts, list: s1.list }));
  const h1 = await hits(D.page);
  check('held fire at a pinned shore creature: killed in 2-4 hits (real bolts)', h1.length >= 2 && h1.every((r) => r.dead && r.n >= 2 && r.n <= 4), JSON.stringify(h1));
  const m1 = await magnet(D.page);
  check('pickup magnet is 120 px: drops 100 px away are collected within 1.2 s', m1.on === true && m1.radius === 120 && m1.spawned >= 6 && m1.got >= m1.spawned - 1, JSON.stringify(m1));
  const sw = await D.page.evaluate(() => document.documentElement.scrollWidth <= innerWidth);
  check('390x844: no horizontal scroll', sw);
  errs.push(...D.page.errors); await D.ctx.close();

  const O = await open(browser, '&ttk=0');
  const s0 = await shoreHp(O.page);
  const byId = new Map(s0.list.map((e) => [e.id, e.hp]));
  const pairs = s1.list.filter((e) => byId.has(e.id)).map((e) => [byId.get(e.id), e.hp]);
  check('?ttk=0: today\'s shore hp (the same creatures have about twice the hp, several need 5+ bolts)', pairs.length >= 4 && pairs.every(([o, n]) => o >= 2 * n - 2 && o > n) && s0.list.some((e) => Math.ceil(e.hp / s0.dmg) >= 5), JSON.stringify({ pairs, old: s0.list }));
  const m0 = await magnet(O.page);
  check('?ttk=0: the 64 px magnet leaves drops 100 px away where they are', m0.on === false && m0.radius === 64 && m0.got === 0, JSON.stringify(m0));
  errs.push(...O.page.errors); await O.ctx.close();

  check('no console or page errors', errs.length === 0, errs.slice(0, 3).join(' | '));
  await browser.close();
  done();
})();
