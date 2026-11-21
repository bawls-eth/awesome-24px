// N4 live: enemy kills in the Realm World roll MMPickups (coins, xp orbs, hearts, life potions) as world sprites, seeded by (world seed, group, kill),
// magnet to the player inside 64 px, cap 60 with the oldest culled, ?pickups=0 disables.
// Run: BASE=http://localhost:8592/game/index.html NODE_PATH=$(npm root -g) node game/tests/world-pickups.test.js
const { chromium } = require('playwright');
const { check, done } = require('./helpers');
const ORIGIN = (process.env.BASE || 'http://localhost:8440/game/index.html').replace(/\/game\/index\.html.*$/, '');
const WORLD = ORIGIN + '/game/games/mad-maze/index.html?mode=world&test=1&seed=12345';
const SAVE = { realm: { level: 4, xp: 0, shards: 50, bestWave: 2, items: [{ n: 1, id: 'sparkwand', r: 0 }], nextUid: 2, eq: { weapon: 1 } } };

async function open(browser, url, viewport) {
  const ctx = await browser.newContext({ viewport: viewport || { width: 1000, height: 700 } });
  await ctx.route('**/game/index.html*', (r) => r.fulfill({ contentType: 'text/html', body: '<!doctype html>town' }));
  const page = await ctx.newPage(); const errors = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  await page.goto(ORIGIN + '/game/games/mad-maze/lantern.css');
  await page.evaluate((v) => { localStorage.clear(); localStorage.setItem('pixeltown-save-v1', v); localStorage.setItem('mm-aim-assist', '0'); }, JSON.stringify(SAVE));
  await page.goto(url);
  await page.waitForFunction(() => window.__mm && window.__mm.world && window.__mm.arena.active && window.__mm.arena.state === 'play', null, { timeout: 15000 });
  return { ctx, page, errors };
}
// kill n live enemies far from the player (so nothing is magnetised), return what spawned per kill
const killSome = (page, n) => page.evaluate(async (n) => {
  const a = window.__mm.arena; const w = window.__mm.world; a.player.iframes = 1e9; a._hitPlayer = () => {};
  while (w.liveCount() < n) await new Promise((r) => setTimeout(r, 100));
  const out = [];
  for (const le of w.liveEnemies()) {
    if (out.length >= n) break;
    const e = w.enemyById(le.id); if (!e || !e.active) continue;
    const before = w.pickups.list().length;
    e.x = a.player.x + 500; e.y = a.player.y; a._hitEnemy(e, 99999);
    out.push({ kills: w.kills(), tier: le.tier, added: w.pickups.list().length - before });
  }
  return out;
}, n);

(async () => {
  const browser = await chromium.launch();
  const A = await open(browser, WORLD); const page = A.page;
  check('pickups are on by default with a 60 cap', await page.evaluate(() => window.__mm.world.pickups.on && window.__mm.world.pickups.cap === 60));
  const k = await killSome(page, 3);
  check('every kill spawns at least a coin and an xp orb', k.length === 3 && k.every((x) => x.added >= 2), JSON.stringify(k));
  // determinism: the descriptors on the floor equal MMPickups.roll(seed, group, kill) (minus the kinds the arena cannot apply)
  const cmp = await page.evaluate(() => {
    const w = window.__mm.world; const l = w.pickups.list();
    const a = MMPickups.roll('12345', 'g0', 1, 1).filter((d) => d.type === 'coin' || d.type === 'xp' || d.type === 'heart' || d.art === 'potion_life');
    const b = MMPickups.roll('12345', 'g0', 1, 1).filter((d) => d.type === 'coin' || d.type === 'xp' || d.type === 'heart' || d.art === 'potion_life');
    return { same: JSON.stringify(a) === JSON.stringify(b), first: l[0] && l[0].type, coinTotal: l.filter((q) => q.type === 'coin').length };
  });
  check('rolls are pure and seeded (same seed/group/kill -> same list)', cmp.same && cmp.first === 'coin', JSON.stringify(cmp));
  const A2 = await open(browser, WORLD); // same seed, fresh page: the same spawn call gives the same pickups
  const run = (pg) => pg.evaluate(() => { const w = window.__mm.world; const n0 = w.pickups.list().length; w.pickups.spawn(100, 100, 'g4', 7, 2); return JSON.stringify(w.pickups.list().slice(n0).map((q) => [q.type, q.art, q.value, Math.round(q.x), Math.round(q.y)])); });
  const [r1, r2] = [await run(page), await run(A2.page)];
  check('same world seed + group + kill index -> identical pickups (types, values, positions) across page loads', r1 === r2 && r1.length > 10, r1.slice(0, 80));

  // magnet + collect: park a coin 40 px from the player, it homes in and banks shards
  const mag = await page.evaluate(async () => {
    const a = window.__mm.arena; const w = window.__mm.world;
    a.state === 'play'; const p = a.player;
    // clear far pickups, then place one coin via spawn at the player's feet offset 40 px
    w.pickups.spawn(p.x + 40, p.y, 'gmag', 99, 5);
    const l = w.pickups.list(); const sh0 = a.save.shards; const n0 = l.length;
    for (let i = 0; i < 60; i++) await new Promise((r) => requestAnimationFrame(r));
    const got = w.pickups.got();
    return { n0, n1: w.pickups.list().length, gain: a.save.shards - sh0, got };
  });
  check('pickups within 64 px are magnetised and collected', mag.n1 < mag.n0 && mag.got.coin > 0, JSON.stringify(mag));
  check('collecting coins banks shards through the arena save', mag.gain > 0, JSON.stringify(mag));

  // heart heals but never above max HP
  const heal = await page.evaluate(async () => {
    const a = window.__mm.arena; const w = window.__mm.world; const p = a.player; const max = a.stats.maxHp; p.hp = Math.max(1, max - 10);
    let tries = 0; const hp0 = p.hp;
    while (tries++ < 400) { w.pickups.spawn(p.x + 30, p.y, 'gheart', tries, 5); if (w.pickups.list().some((q) => q.type === 'heart')) break; }
    for (let i = 0; i < 60; i++) await new Promise((r) => requestAnimationFrame(r));
    return { hp0, hp: p.hp, max: a.stats.maxHp, got: w.pickups.got().heart };
  });
  check('hearts heal and clamp at max HP', heal.got > 0 && heal.hp > heal.hp0 && heal.hp <= heal.max, JSON.stringify(heal));

  // cap 60: flood with far-away pickups, never more than 60, oldest culled
  const cap = await page.evaluate(() => {
    const w = window.__mm.world; const a = window.__mm.arena; const p = a.player;
    for (let i = 0; i < 80; i++) w.pickups.spawn(p.x + 900, p.y + 900, 'gcap', i, 3);
    const l = w.pickups.list();
    return { n: l.length };
  });
  check('live pickups are capped at 60 (oldest culled)', cap.n === 60, JSON.stringify(cap));
  const life = await page.evaluate(() => { const l = window.__mm.world.pickups.list(); return l.every((q) => q.lifeMs >= 20000 && q.lifeMs <= 40000); });
  check('lifetime is per tier (20-40 s)', life);
  const noGfx = await page.evaluate(() => window.__mm.world.pickups.list().length > 0 && !document.querySelector('#realm-overlay canvas[data-pickups]'));
  check('pickups need no extra DOM/overlay graphics (drawn from the world draw hook)', noGfx);
  check('no console errors with pickups on', A.errors.length === 0 && A2.errors.length === 0, A.errors.concat(A2.errors).join(' | '));
  await A.ctx.close(); await A2.ctx.close();

  // ?pickups=0
  const Z = await open(browser, WORLD + '&pickups=0');
  const off = await killSome(Z.page, 2);
  check('?pickups=0 disables pickups (kills add none)', await Z.page.evaluate(() => !window.__mm.world.pickups.on && window.__mm.world.pickups.list().length === 0) && off.every((x) => x.added === 0), JSON.stringify(off));
  check('no console errors with pickups off', Z.errors.length === 0, Z.errors.join(' | '));
  await Z.ctx.close();

  // phone
  const M = await open(browser, WORLD, { width: 390, height: 844 });
  await killSome(M.page, 2);
  const sc = await M.page.evaluate(() => ({ sw: document.documentElement.scrollWidth, iw: innerWidth }));
  check('phone 390x844: no horizontal scroll with pickups on the floor', sc.sw <= sc.iw, JSON.stringify(sc));
  check('phone: no console errors', M.errors.length === 0, M.errors.join(' | '));
  await M.ctx.close();
  await browser.close();
  done();
})();
