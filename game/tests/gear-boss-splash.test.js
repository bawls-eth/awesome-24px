// G12: boss ground-slam splash. From phase 2 a non-shore world boss (and every dungeon boss) shows a ring zone (tgFor + MMSplash.drawSlam) for
// MMSplash.SLAM.WIND (0.9 s), then damages only a hero still inside the radius: _guarded(min(30, round(8 x dmgMul x 1.5 x falloff))).
// ?telegraph=0, ?bossslam=0 and ?bosses=classic turn it off; the shore boss never slams; reduce motion makes the ring static; <= 1 live slam per boss.
// Offline (blockDb), own server, no chat, no DB writes. Run: BASE=http://localhost:8791/game/index.html NODE_PATH=$(npm root -g) node game/tests/gear-boss-splash.test.js
const { chromium } = require('playwright');
const { check, done, blockDb } = require('./helpers');
const SP = require('../shared/mm-splash.js');
const ORIGIN = (process.env.BASE || 'http://localhost:8440/game/index.html').replace(/\/game\/index\.html.*$/, '');
const PAGE = ORIGIN + '/game/games/mad-maze/index.html';
const SAVE = { realm: { level: 6, xp: 0, shards: 50, bestWave: 2, items: [{ n: 1, id: 'sparkwand', r: 0 }], nextUid: 2, eq: { weapon: 1 } } };

// ---- pure kernel ----
check('SLAM.WIND is at least 0.8 s and the damage cap holds', SP.SLAM.WIND >= 0.8 && SP.slamDmg(50, 0, 100) === SP.SLAM.CAP);
check('slamDmg: 0 outside the radius or for hostile input, round(8*mul*1.5) at the centre, falloff to the edge',
  SP.slamDmg(1, 101, 100) === 0 && SP.slamDmg(NaN, 0, 100) === 0 && SP.slamDmg(1, NaN, 100) === 0 && SP.slamDmg(1, 0, 100) === 12 && SP.slamDmg(1, 100, 100) === Math.round(12 * SP.SLAM.EDGE) && SP.slamDmg(2, 0, 100) === 24);
{ const s = SP.slamNew(6); const seq = []; let landed = -1;
  for (let i = 0; i < 1200 && landed < 0; i++) { const r = SP.slamStep(s, 1 / 60, true, 6); if (r !== 0) seq.push(r); if (r === 3) landed = i; }
  check('slamStep order: start (1) -> winding (2...) -> land (3) after >= 0.8 s, nothing without `can`', seq[0] === 1 && seq[seq.length - 1] === 3 && seq.length >= 0.8 * 60 && SP.slamStep(SP.slamNew(1), 5, false, 1) === 0, seq.length + ' steps'); }

async function open(browser, url, o) {
  o = o || {};
  const ctx = await browser.newContext(o.phone ? { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true } : { viewport: { width: 1000, height: 700 } });
  await blockDb(ctx);
  await ctx.route('**/game/index.html*', (r) => r.fulfill({ contentType: 'text/html', body: '<!doctype html>town' }));
  await ctx.route('**/hub/index.html*', (r) => r.fulfill({ contentType: 'text/html', body: '<!doctype html>hub' }));
  const page = await ctx.newPage(); const errors = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  await page.goto(ORIGIN + '/game/games/mad-maze/lantern.css');
  await page.evaluate((a) => { localStorage.clear(); localStorage.setItem('pixeltown-save-v1', a.v); localStorage.setItem('mm-aim-assist', '0'); localStorage.setItem('mm-reduce-motion', a.red ? '1' : '0'); }, { v: JSON.stringify(SAVE), red: !!o.reduced });
  await page.goto(url);
  await page.waitForFunction((dg) => window.__mm && window.__mm[dg ? 'dungeon' : 'world'] && window.__mm.arena.active && window.__mm.arena.state === 'play', !!o.dungeon, { timeout: 15000 });
  await page.evaluate(() => { const a = window.__mm.arena; a.active = false; cancelAnimationFrame(a._raf); a.paused = false; a.player.iframes = 1e9; a.refreshAccess && a.refreshAccess(); a._readReduced && a._readReduced(); });
  return { ctx, page, errors };
}

// In the page: a quiet boss, the hero `off` px away (relative to the boss every frame), a stubbed _hitPlayer that records the damage and the frame.
const SETUP = `(tier, phase, off, dungeon) => {
  const a = window.__mm.arena; const keep = dungeon ? window.__mm.dungeon.boss() : null; a.enemies.forEach((q) => { if (q !== keep) q.active = false; }); a.eBullets.forEach((b) => { b.active = false; });
  const p = a.player; let e;
  if (dungeon) { e = keep; if (!e) return false; } else { e = a.spawnEnemy('boss', p.x + 300, p.y); e.bossTier = tier; e.dmgMul = 1.5; e.hp = e.maxHp = 1e7; e.cd = 99; e.cd2 = 99; }
  e._sl = null; e.phase = phase; e.invuln = 0; e.spdMul = 0; e.dir = 1; e.angle = 0; e.ax = e.x; e.ay = e.y; e.hp = e.maxHp = 1e7;
  const S = window.__S = { e, off, hits: [], f: 0, tgFirst: -1, tgLast: -1, tgMs: [], zoneFirst: -1, ring: null };
  a._hitPlayer = (d) => { S.hits.push({ d, f: S.f }); };
  a._camStep && a._camStep(-1); return true;
}`;
const STEP = `(n) => { const a = window.__mm.arena; const S = window.__S; const e = S.e;
  for (let i = 0; i < n; i++) {
    a.enemies.forEach((q) => { if (q !== e && q.active) q.active = false; }); a.eBullets.forEach((b) => { b.active = false; }); // quiet: only the slam can hurt
    a.player.x = e.x + S.off; a.player.y = e.y; S.f++; a._update(1 / 60);
    const t = a.telegraphOf && a.telegraphOf(e); const w = e._sl ? e._sl.w : (window.__mm.dungeon && window.__mm.dungeon.slam.wind() ? window.__mm.dungeon.slam.wind().left : 0);
    if (w > 0 && S.zoneFirst < 0) S.zoneFirst = S.f; if (t && S.tgFirst < 0) { S.tgFirst = S.f; S.ring = t; } if (t) S.tgLast = S.f;
  } return { f: S.f, hits: S.hits, tgFirst: S.tgFirst, zoneFirst: S.zoneFirst, ring: S.ring, dmgMul: e.dmgMul }; }`;
const run = (page, n) => page.evaluate(`(${STEP})(${n})`);
const setup = (page, ...args) => page.evaluate(`(${SETUP})(${args.map((x) => JSON.stringify(x)).join(',')})`);

(async () => {
  const browser = await chromium.launch();
  const WORLD = PAGE + '?mode=world&test=1&seed=12345';

  // ---- world: warning first, damage only after the wind-up and only inside ----
  let o = await open(browser, WORLD);
  const on = await o.page.evaluate(() => window.__mm.world.slam.on);
  const R = SP.slamR(3);
  await setup(o.page, 3, 2, 20);
  let r = await run(o.page, 60 * 14);
  const land = r.hits.length ? r.hits[0].f : -1;
  check('world: the telegraph ring (tgFor, shape ring, windup >= 0.8) appears before any damage, and the zone is drawn from the same frame',
    on && r.tgFirst > 0 && r.ring && r.ring.shape === 'ring' && r.ring.windup >= 0.8 && r.zoneFirst > 0 && land > r.tgFirst, JSON.stringify({ on, tg: r.tgFirst, zone: r.zoneFirst, land, ring: r.ring }));
  check('world: damage lands >= 0.8 s (48 frames) after the ring first showed, exactly once per slam, and equals _guarded(slamDmg) for a hero inside', land - r.tgFirst >= 48 && r.hits[0].d === SP.slamDmg(1.5, 20 - 12, R) && r.hits.length === 2, JSON.stringify({ land, tg: r.tgFirst, hits: r.hits }));
  check('world: damage is capped (<= SLAM.CAP) even for a huge dmgMul', await o.page.evaluate((c) => { const e = window.__S.e; e.dmgMul = 40; return window.__S.hits.every((h) => h.d <= c); }, SP.SLAM.CAP) && SP.slamDmg(40, 0, R) === SP.SLAM.CAP);
  check('world: no console errors', o.errors.length === 0, o.errors.join(' | '));
  await o.ctx.close();

  // outside the radius: the slam lands (zone cleared, winds counted) but costs 0
  o = await open(browser, WORLD);
  await setup(o.page, 3, 2, R + 40);
  r = await run(o.page, 60 * 9);
  const outW = await o.page.evaluate(() => ({ winds: window.__mm.world.slam.winds(), hits: window.__mm.world.slam.hits(), w: window.__S.e._sl.w }));
  check('world: a hero outside the radius takes 0 from a slam that did wind up and land', outW.winds >= 1 && r.hits.length === 0 && outW.hits === 0 && r.tgFirst > 0, JSON.stringify(outW));
  // at the edge of the zone it is hit but softer than at the centre
  await setup(o.page, 3, 2, 12 + 80);
  r = await run(o.page, 60 * 9);
  check('world: inside near the rim takes less than at the centre (MMSplash falloff), still > 0', r.hits.length > 0 && r.hits[0].d > 0 && r.hits[0].d < SP.slamDmg(1.5, 0, R), JSON.stringify(r.hits.slice(0, 1)));
  // shore boss (bossTier 1) never slams; phase 1 never slams; at most one live slam per boss
  await setup(o.page, 1, 2, 20); r = await run(o.page, 60 * 14);
  const shore = await o.page.evaluate(() => !!window.__S.e._sl);
  check('world: the shore boss (tier 1) never slams, no telegraph and no damage', !shore && r.hits.length === 0 && r.tgFirst < 0, JSON.stringify(r));
  await setup(o.page, 3, 1, 20); r = await run(o.page, 60 * 14);
  check('world: phase 1 never slams', r.hits.length === 0 && r.zoneFirst < 0);
  await setup(o.page, 3, 3, 20);
  const live = await o.page.evaluate(`(() => { const a = window.__mm.arena; let max = 0; for (let i = 0; i < 60 * 20; i++) { window.__S.e.x = window.__S.e.ax; a.enemies.forEach((q) => { if (q !== window.__S.e && q.active) q.active = false; }); a.player.x = window.__S.e.x + 20; a.player.y = window.__S.e.y; a._update(1 / 60); max = Math.max(max, a.enemies.filter((q) => q.active && q._sl && q._sl.w > 0).length); } return max; })()`);
  check('world: at most one live slam per boss', live === 1, String(live));
  await o.ctx.close();

  // ---- switches ----
  for (const [q, label] of [['&telegraph=0', '?telegraph=0'], ['&bossslam=0', '?bossslam=0'], ['&bosses=classic', '?bosses=classic']]) {
    o = await open(browser, WORLD + q);
    await setup(o.page, 3, 2, 20); r = await run(o.page, 60 * 16);
    const st = await o.page.evaluate(() => ({ on: window.__mm.world.slam.on, winds: window.__mm.world.slam.winds() }));
    check(label + ': no slam, no ring, no damage over 16 s of a phase 2 boss', r.hits.length === 0 && r.zoneFirst < 0 && st.winds === 0 && (q !== '&bossslam=0' && q !== '&bosses=classic' ? true : st.on === false), JSON.stringify(st));
    await o.ctx.close();
  }

  // ---- accessibility: reduce motion = a static ring (no pulse), same timing; phone viewport keeps the page unscrolled ----
  o = await open(browser, WORLD, { reduced: true, phone: true });
  await setup(o.page, 3, 2, 20); r = await run(o.page, 60 * 14);
  check('reduce motion: the slam ring is static (no pulse) with the same 0.8 s+ wind-up, and it still hurts inside', r.ring && r.ring.pulse === false && r.ring.windup >= 0.8 && r.hits.length > 0 && r.hits[0].f - r.tgFirst >= 48, JSON.stringify(r.ring));
  check('phone 390x844: no horizontal scroll, no console errors', await o.page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1) && o.errors.length === 0, o.errors.join(' | '));
  await o.ctx.close();

  // ---- dungeon boss ----
  const DG = (q) => PAGE + '?mode=dungeon&test=1&seed=7' + (q || '');
  const toBoss = (page) => page.evaluate(() => {
    const d = window.__mm.dungeon; const g = d.graph; d.state.pickKey();
    const nb = (id) => g.doors.filter((x) => !x.cracked && (x.a === id || x.b === id)).map((x) => (x.a === id ? x.b : x.a));
    const prev = { [d.room]: null }; const q = [d.room];
    while (q.length) { const u = q.shift(); nb(u).forEach((v) => { if (!(v in prev)) { prev[v] = u; q.push(v); } }); }
    const path = []; for (let u = g.bossRoomId; u !== null && u !== undefined; u = prev[u]) path.unshift(u);
    for (let i = 1; i < path.length; i++) { if (d.state.room(d.room).enemiesAlive > 0) d.clearRoom(); d.enter(path[i]); }
    return !!d.boss();
  });
  o = await open(browser, DG(), { dungeon: true });
  const inBoss = await toBoss(o.page);
  await setup(o.page, 0, 2, 20, true);
  r = await run(o.page, 60 * 14);
  const dl = r.hits.length ? r.hits[0].f : -1;
  check('dungeon: the boss zone shows first (>= 0.8 s), then damages a hero inside once, never an unwarned hit', inBoss && r.zoneFirst > 0 && dl - r.zoneFirst >= 48 && r.hits[0].d === SP.slamDmg(r.dmgMul || 1, 20 - 12, SP.slamR(2)), JSON.stringify({ inBoss, zone: r.zoneFirst, dl, hits: r.hits.slice(0, 2), mul: r.dmgMul }));
  await o.ctx.close();
  o = await open(browser, DG(), { dungeon: true });
  await toBoss(o.page); await setup(o.page, 0, 2, 200, true); r = await run(o.page, 60 * 14);
  check('dungeon: a hero outside the radius takes 0 from the slam', r.zoneFirst > 0 && r.hits.length === 0 && await o.page.evaluate(() => window.__mm.dungeon.slam.winds() >= 1));
  await o.ctx.close();
  for (const [q, label] of [['&telegraph=0', '?telegraph=0'], ['&bosses=classic', '?bosses=classic'], ['&bossslam=0', '?bossslam=0']]) {
    o = await open(browser, DG(q), { dungeon: true });
    await toBoss(o.page); await setup(o.page, 0, 2, 20, true); r = await run(o.page, 60 * 14);
    check('dungeon ' + label + ': no slam', r.zoneFirst < 0 && r.hits.length === 0 && await o.page.evaluate(() => window.__mm.dungeon.slam.on === false));
    await o.ctx.close();
  }
  await browser.close();
  done();
})();
