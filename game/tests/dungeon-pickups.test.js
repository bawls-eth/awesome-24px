// DP3 dungeon pickups: room clears and chests drop MMPickups coins / XP orbs / hearts / life potions with the world rules (magnet 120 px), seeded, no focus without arena.restoreFocus.
// Serve the repo root, then:  BASE=http://localhost:8664/game/index.html NODE_PATH=$(npm root -g) node game/tests/dungeon-pickups.test.js
const { chromium } = require('playwright');
const { check, done } = require('./helpers');
const ORIGIN = (process.env.BASE || 'http://localhost:8440/game/index.html').replace(/\/game\/index\.html.*$/, '');
const URL = (q) => `${ORIGIN}/game/games/mad-maze/index.html?mode=dungeon&test=1&${q}`;
const PK = require('../shared/mm-pickups.js');

async function open(browser, q, ctxOpts) {
  const ctx = await browser.newContext(ctxOpts || { viewport: { width: 1100, height: 700 } });
  const page = await ctx.newPage(); page.errors = [];
  page.on('pageerror', (e) => page.errors.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error') page.errors.push('console: ' + m.text()); });
  await page.goto(URL(q));
  await page.waitForFunction(() => window.__mm && window.__mm.dungeon && window.__mm.dungeon.room !== null);
  await page.evaluate(() => { window.__mm.arena._hitPlayer = () => {}; });
  return { ctx, page };
}
const ev = (p, fn, arg) => p.evaluate(fn, arg);
// clear the start room's neighbour deterministically: stand at a fixed spot, advance into the first combat room, clear it
const clearFirst = (p) => ev(p, () => {
  const d = window.__mm.dungeon; const a = window.__mm.arena;
  const door = d.doors().find((o) => o.status === 'open'); d.clearRoom(); const r = d.enter(door.other);
  if (!r.ok) return { err: r.reason };
  a.player.x = 300; a.player.y = 300; d.clearRoom();
  return { room: d.room, picks: d.pickups().map((q) => [q.type, q.value, q.tier, Math.round(q.x), Math.round(q.y)]) };
});

(async () => {
  const browser = await chromium.launch();
  const errs = [];
  const r = await open(browser, 'biome=bramble&seed=5&lv=2&difficulty=off'); const p = r.page;
  const st0 = await ev(p, () => window.__mm.dungeon.pickStats());
  check('magnet radius equals the world rule (MMPickups.MAGNET_RADIUS_WORLD = 120 px), pickups on', st0.magnet === PK.MAGNET_RADIUS_WORLD && st0.magnet === 120 && st0.on, JSON.stringify(st0));
  const c1 = await clearFirst(p);
  const types = Array.from(new Set(c1.picks.map((q) => q[0])));
  check('clearing a room drops coins and XP orbs (and only world-legal types: coin / xp / heart / life potion; no focus without arena.restoreFocus)', !c1.err && c1.picks.length >= 6 && types.includes('coin') && types.includes('xp') && types.every((t) => ['coin', 'xp', 'heart', 'potion'].includes(t)), JSON.stringify(c1));
  // the world magnet: a coin 100 px away (beyond the old 64 px, inside 120 px) is pulled in and paid out
  const mag = await ev(p, () => {
    const d = window.__mm.dungeon; const a = window.__mm.arena; a.player.x = 300; a.player.y = 300; const s0 = a.save.shards;
    const coin = d.pickups().find((q) => q.type === 'coin'); return { s0, n0: d.pickups().length, dist: coin ? Math.hypot(coin.x - 300, coin.y - 300) : -1 };
  });
  await p.waitForTimeout(250);
  // move the hero so the nearest coin sits ~100 px away, then let the magnet pull it
  const pulled = await ev(p, () => {
    const d = window.__mm.dungeon; const a = window.__mm.arena; const coin = d.pickups().find((q) => q.type === 'coin');
    if (!coin) return { none: true, got: d.pickStats().got, shards: a.save.shards };
    a.player.x = coin.x - 100; a.player.y = coin.y; return { x: coin.x, y: coin.y, s0: a.save.shards, got0: d.pickStats().got.coin };
  });
  await p.waitForTimeout(700);
  const after = await ev(p, () => { const d = window.__mm.dungeon; const a = window.__mm.arena; return { got: d.pickStats().got, shards: a.save.shards, live: d.pickups().length }; });
  check('a coin 100 px away is magnetised and collected (shards rise)', (pulled.none ? after.got.coin >= 1 : after.got.coin > (pulled.got0 || 0)) && after.shards > (pulled.s0 || mag.s0), JSON.stringify({ mag, pulled, after }));
  errs.push(...p.errors); await r.ctx.close();

  // seeds give the same drops
  const runs = [];
  for (let i = 0; i < 2; i++) { const q = await open(browser, 'biome=bramble&seed=5&lv=2&difficulty=off'); runs.push(JSON.stringify(await clearFirst(q.page))); errs.push(...q.page.errors); await q.ctx.close(); }
  check('same seed, same room, same drops (types, values, tiers, positions)', runs[0] === runs[1] && runs[0].length > 40, runs[0].slice(0, 160) + ' || ' + runs[1].slice(0, 80));
  const other = await open(browser, 'biome=bramble&seed=6&lv=2&difficulty=off');
  const o = JSON.stringify(await clearFirst(other.page)); errs.push(...other.page.errors); await other.ctx.close();
  check('a different seed gives different drops', o !== runs[0], o.slice(0, 120));

  // chests drop too
  { const c = await open(browser, 'biome=meadow&seed=4&lv=2&difficulty=off'); const q = c.page;
    const res = await ev(q, () => {
      const d = window.__mm.dungeon; const g = d.graph; const a = window.__mm.arena;
      const tid = g.rooms.find((x) => x.type === 'treasure').id; d.state.pickKey(); d.state.pickKey();
      const nb = (id) => g.doors.filter((x) => !x.cracked && (x.a === id || x.b === id)).map((x) => (x.a === id ? x.b : x.a));
      const prev = { [d.room]: null }; const qq = [d.room];
      while (qq.length) { const u = qq.shift(); nb(u).forEach((v) => { if (!(v in prev)) { prev[v] = u; qq.push(v); } }); }
      const path = []; for (let u = tid; u !== null && u !== undefined; u = prev[u]) path.unshift(u);
      for (let i = 1; i < path.length; i++) { if (d.state.room(d.room).enemiesAlive > 0) d.clearRoom(); d.enter(path[i]); }
      const before = d.pickStats().total; const cp = d.chestPos(); a.player.x = cp.x; a.player.y = cp.y;
      return { room: d.room, tid, before };
    });
    await q.waitForTimeout(500);
    const post = await ev(q, () => { const d = window.__mm.dungeon; return { total: d.pickStats().total, chest: d.state.room(d.room).chestOpen }; });
    check('opening a chest drops pickups too', res.room === res.tid && post.chest && post.total > res.before, JSON.stringify({ res, post }));
    errs.push(...q.errors); await c.ctx.close(); }

  { const c = await open(browser, 'biome=bramble&seed=5&lv=2&pickups=0'); const q = await clearFirst(c.page);
    check('?pickups=0 drops nothing', !q.err && q.picks.length === 0, JSON.stringify(q)); errs.push(...c.page.errors); await c.ctx.close(); }
  { const c = await open(browser, 'biome=crypt&seed=5&lv=2', { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
    const hs = await ev(c.page, () => document.documentElement.scrollWidth <= window.innerWidth + 1); const q = await clearFirst(c.page); errs.push(...c.page.errors);
    check('phone 390x844: no horizontal scroll, drops still appear', hs && !q.err && q.picks.length > 0, JSON.stringify(q).slice(0, 100)); await c.ctx.close(); }
  check('no console / page errors', errs.length === 0, errs.slice(0, 3).join(' | '));
  await browser.close();
  done();
})();
