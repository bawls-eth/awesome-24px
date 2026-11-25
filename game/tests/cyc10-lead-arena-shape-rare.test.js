// cycle 10 L (3): the pool-shape rule (cycle 8 / 9: an object keeps ONE list of fields, declared where it is made) for the Realm
// arena on its RARER paths. Cycle 9 declared the 15 fields an ordinary fight added; a scan of every `this.x =` in RealmArena
// against the arena's own keys at the first frame of play listed 60 more, added the first time a player lands a splash hit,
// heals by leech, opens the backpack / shop / forge, resizes the window or falls. Each such first time changed the arena's hidden
// shape and threw away the optimised code of the hot functions that read it. All 60 are declared in the constructor now (with
// the value every read saw before, undefined).
// Proven here, in one real session on the world page: a splash weapon hit, a leech heal, the backpack, a shop buy, the forge
// panel, a window resize, a fall and Try again; after all of it the arena has exactly the fields it had at the first frame.
// Deterministic (field lists, not bytes). OFFLINE: blockDb + town stubbed; literal db.attempts() === 0. Never chats.
// Run: BASE=http://localhost:9101/game/index.html NODE_PATH=$(npm root -g) node game/tests/cyc10-lead-arena-shape-rare.test.js
const { chromium } = require('playwright');
const { check, done, blockDb } = require('./helpers');
const LS = require('./lib/load-scale');
const BASE = process.env.BASE || 'http://localhost:8440/game/index.html';
const ORIGIN = new URL(BASE).origin;
const WORLD = ORIGIN + '/game/games/mad-maze/index.html?mode=world&test=1&offline=1&heropick=0&tutorial=0&seed=12345&qdate=2030-05-01';
const SAVE = { realm: { level: 6, xp: 0, shards: 500, dust: 200, bestWave: 2, items: [{ n: 1, id: 'sparkwand', r: 0, t: 9, a: 12345 }], nextUid: 100, eq: { weapon: 1 } } };
const frames = (page, n) => page.evaluate((k) => new Promise((res) => { let i = 0; const f = () => (++i >= k ? res() : requestAnimationFrame(f)); requestAnimationFrame(f); }), n);

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  const db = await blockDb(ctx); await ctx.routeWebSocket(/.*/, (ws) => ws.close());
  await ctx.route('**/game/index.html*', (rt) => rt.fulfill({ contentType: 'text/html', body: '<!doctype html>town' }));
  const page = await ctx.newPage(); const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(ORIGIN + '/game/games/mad-maze/lantern.css');
  await page.evaluate((s) => { localStorage.clear(); localStorage.setItem('pixeltown-save-v1', s); localStorage.setItem('mm-aim-assist', '0'); }, JSON.stringify(SAVE));
  await page.goto(WORLD, { waitUntil: 'domcontentloaded', timeout: LS.budget(30000) });
  const ready = () => page.waitForFunction(() => window.__mm && window.__mm.world && window.__mm.arena.active && window.__mm.arena.state === 'play', null, { timeout: LS.budget(40000) });
  await ready();
  await page.evaluate(() => { const a = window.__mm.arena; window.__keys0 = Object.keys(a); a.player.iframes = 1e9; });
  const late = () => page.evaluate(() => Object.keys(window.__mm.arena).filter((k) => !window.__keys0.includes(k)));
  const seen = {};

  // 1. a splash weapon: one bolt into a cluster of sturdy, still enemies (through the real bullet update)
  seen.splash = await page.evaluate(async () => {
    const a = window.__mm.arena; const p = a.player;
    const fr = (n) => new Promise((res) => { let i = 0; const f = () => (++i >= n ? res() : requestAnimationFrame(f)); requestAnimationFrame(f); });
    a.enemies.forEach((e) => { e.active = false; }); a.eBullets.forEach((b) => { b.active = false; });
    const on = a.setHeroWeapon(MMWeapons.resolve('warlock', 'staff_comet', 0));
    [0, -14, 14, -26, 26].forEach((dy) => { const e = a.spawnEnemy('spiral', p.x + 110, p.y + dy); e.hp = e.maxHp = 1000; e.cd = 1e9; });
    const n0 = a.splashN || 0;
    for (let k = 0; k < 6 && (a.splashN || 0) === n0; k++) { const b = a.firePlayerBulletFrom(p.x, p.y, 0, 10, 0); a._styleBolt(b, a.weapon, 0, 0, 0); await fr(40); }
    return { on: !!on, splashes: (a.splashN || 0) - n0, hit: a.lastSplash ? a.lastSplash.n : 0 };
  });
  check('1. a splash weapon bolt splashed into the cluster (the _sp* scratch arrays, ring and number paths ran)', seen.splash.on && seen.splash.splashes >= 1 && seen.splash.hit >= 1, JSON.stringify(seen.splash));

  // 2. leech: a hurt hero with a leech stat and banked leech heals through the gear tick of the real loop
  seen.leech = await page.evaluate(async () => {
    const a = window.__mm.arena; const p = a.player;
    const fr = (n) => new Promise((res) => { let i = 0; const f = () => (++i >= n ? res() : requestAnimationFrame(f)); requestAnimationFrame(f); });
    p.hp = Math.max(1, Math.floor(a.stats.maxHp / 2)); const hp0 = p.hp;
    for (let i = 0; i < 90 && !(a.leechHealed > 0); i++) { a.stats.leech = 0.2; a._leechAcc = 5; await fr(1); } // the stat is rebuilt from gear; hold it for the tick
    const out = { healed: a.leechHealed || 0, hp0, hp: p.hp };
    a._calcStats(); return out;
  });
  check('2. a leech heal was paid out by the gear tick', seen.leech.healed >= 1 && seen.leech.hp > seen.leech.hp0, JSON.stringify(seen.leech));

  // 3. the backpack, a shop buy, the forge panel (real clicks)
  await page.click('#realm-bp-btn'); await page.waitForTimeout(200);
  const bp = await page.evaluate(() => window.__mm.arena.panel);
  await page.click('#realm-backpack-body button[data-open-shop]'); await page.waitForTimeout(200);
  const n0 = await page.evaluate(() => window.__mm.arena.save.items.length);
  await page.locator('#realm-shop-body button[data-buy="heartcharm"][data-r="0"]').scrollIntoViewIfNeeded();
  await page.click('#realm-shop-body button[data-buy="heartcharm"][data-r="0"]'); await page.waitForTimeout(200);
  const shop = await page.evaluate(() => ({ panel: window.__mm.arena.panel, n: window.__mm.arena.save.items.length, msg: (document.getElementById('realm-shop-msg') || {}).textContent || '' }));
  await page.evaluate(() => window.__mm.arena.setShop(false)); await page.waitForTimeout(100);
  if ((await page.evaluate(() => window.__mm.arena.panel)) !== 'bp') { await page.click('#realm-bp-btn'); await page.waitForTimeout(200); }
  await page.waitForFunction(() => !document.querySelector('#realm-bp-list button[data-arm]'), null, { timeout: 3000 }).catch(() => {});
  const fbtn = page.locator('button.fg[data-forge-open="1"]').first();
  await fbtn.scrollIntoViewIfNeeded(); await fbtn.click(); await page.waitForTimeout(200);
  const forge = await page.evaluate(() => { const a = window.__mm.arena; const b = document.getElementById('realm-bp-forge'); return { uid: a._forgeUid, box: b ? b.textContent.length : 0 }; });
  await page.keyboard.press('Escape'); await page.waitForTimeout(150);
  await page.evaluate(() => { const a = window.__mm.arena; if (a.panel) a._panel(null); a.setPaused(false); });
  check('3. the backpack opened, the shop sold one item, the forge panel opened for the worn weapon', bp === 'bp' && shop.panel === 'shop' && shop.n === n0 + 1 && /^Bought/.test(shop.msg) && forge.uid === 1 && forge.box > 0, JSON.stringify({ bp, shop, forge }));

  // 4. a window resize
  await page.setViewportSize({ width: 1000, height: 640 }); await frames(page, 30);
  await page.setViewportSize({ width: 1280, height: 720 }); await frames(page, 30);

  // 5. a fall, the fall card, Try again
  seen.fall = await page.evaluate(async () => {
    const a = window.__mm.arena; const fr = (n) => new Promise((res) => { let i = 0; const f = () => (++i >= n ? res() : requestAnimationFrame(f)); requestAnimationFrame(f); });
    a.shield.hits = 0; a.player.iframes = 0; a._hitPlayer(99999);
    for (let i = 0; i < 500 && !a._deathShown; i++) await fr(1);
    const out = { state: a.state, shown: !!a._deathShown };
    const again = document.querySelector('#realm-death button[data-d="again"]'); if (again) again.click(); await fr(10);
    out.after = a.state; return out;
  });
  check('5. the hero fell, the fall card showed, Try again started a new run', seen.fall.state === 'dead' && seen.fall.shown && seen.fall.after === 'play', JSON.stringify(seen.fall));
  await frames(page, 120);

  const L = await late();
  check('the arena has exactly the fields it had at the first frame of play (no field added by any of these paths)', L.length === 0, L.length + ' added late: ' + L.join(', '));
  if (process.env.SHOTS) await page.screenshot({ path: process.env.SHOTS + '/cyc10-lead-arena-rare-1280x720.jpg', type: 'jpeg', quality: 60 }).catch(() => null);
  check('no page errors, no database traffic (literal 0)', errors.length === 0 && db.attempts() === 0, errors.join(' | ') + ' db=' + db.attempts());
  await browser.close();
  done();
})().catch((e) => { console.error(e); process.exit(1); });
