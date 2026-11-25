// ID-08 (cycle 6 S): dungeon first-clear milestone. The first time a biome's floor-1 boss falls on this device (pixeltown-deep-v1 had no
// floor for that biome), the summary banner turns gold and a "First clear <Biome> · next: <next uncleared biome>" row appears; a second
// clear of the same biome shows neither; with every other biome cleared the row says "every dungeon cleared". No new save key: the dungeon's
// own pixeltown-deep-v1 (G-25) is the record. Offline: blockDb + every WebSocket closed, db.attempts() === 0, no chat.
// Run: BASE=http://localhost:8440/game/index.html NODE_PATH=$(npm root -g) node game/tests/cyc6-dungeon-first-clear.test.js
const { chromium } = require('playwright');
const { check, done, blockDb } = require('./helpers');
const ORIGIN = (process.env.BASE || 'http://localhost:8440/game/index.html').replace(/\/game\/index\.html.*$/, '');
const PAGE = ORIGIN + '/game/games/mad-maze/index.html';

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1000, height: 700 } });
  const db = await blockDb(ctx); await ctx.routeWebSocket(/.*/, (ws) => ws.close());
  await ctx.route('**/game/index.html*', (r) => r.fulfill({ contentType: 'text/html', body: '<!doctype html>town' }));
  await ctx.route('**/hub/index.html*', (r) => r.fulfill({ contentType: 'text/html', body: '<!doctype html>hub' }));
  const page = await ctx.newPage(); const errors = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  await page.goto(ORIGIN + '/game/games/mad-maze/lantern.css');
  await page.evaluate(() => localStorage.clear());
  const clearOnce = async (biome, seed) => {
    await page.goto(PAGE + '?mode=dungeon&test=1&notebook=0&biome=' + biome + '&seed=' + seed);
    await page.waitForFunction(() => window.__mm && window.__mm.dungeon && window.__mm.dungeon.room !== null, null, { timeout: 20000 });
    await page.waitForTimeout(300);
    await page.evaluate(() => { window.__mm.arena._hitPlayer = () => {}; }); // the milestone is the subject, not the dodging
    const walked = await page.evaluate(() => { // the mad-maze-dungeon.test.js walk: through doors to the boss room, clearing rooms on the way
      const d = window.__mm.dungeon; const g = d.graph; const target = g.bossRoomId;
      const nbrs = (id) => g.doors.filter((x) => !x.cracked && (x.a === id || x.b === id)).map((x) => (x.a === id ? x.b : x.a));
      const prev = { [d.room]: null }; const q = [d.room];
      while (q.length) { const u = q.shift(); if (u === target) break; nbrs(u).forEach((v) => { if (!(v in prev)) { prev[v] = u; q.push(v); } }); }
      const path = []; for (let u = target; u !== null && u !== undefined; u = prev[u]) path.unshift(u);
      for (let i = 1; i < path.length; i++) { if (d.state.room(d.room).enemiesAlive > 0 && g.rooms[d.room].type !== 'boss') d.clearRoom(); const r = d.enter(path[i]); if (!r.ok) return 'blocked ' + r.reason; }
      return g.rooms[d.room].type;
    });
    for (let k = 0; k < 12; k++) { // boss: hits through the opening shield and phase changes (real _hitEnemy, real kill path)
      await page.waitForTimeout(1300);
      const dead = await page.evaluate(() => { const d = window.__mm.dungeon; const e = d.boss(); if (e) window.__mm.arena._hitEnemy(e, 200); return d.state.boss.dead; });
      if (dead) break;
    }
    const portal = await page.evaluate(() => window.__mm.dungeon.portalPos());
    if (portal) await page.evaluate((q) => { const a = window.__mm.arena; a.player.x = q.x; a.player.y = q.y; }, portal);
    await page.waitForFunction(() => { const el = document.getElementById('mm-summary'); return el && !el.classList.contains('hidden'); }, null, { timeout: 8000 }).catch(() => {});
    return page.evaluate((w) => { const h2 = document.querySelector('#mm-summary h2'); const row = document.getElementById('mm-sum-firstclear');
      return { walked: w, shown: !!h2, title: h2 ? h2.textContent : '', gold: !!(h2 && h2.classList.contains('mm-sum-first')), color: h2 ? getComputedStyle(h2).color : '', row: row ? row.textContent : null, api: window.__mm.dungeon.firstClear || null, deep: localStorage.getItem('pixeltown-deep-v1') }; }, walked);
  };
  const a = await clearOnce('warren', 7);
  check('1. first Warren clear: summary shown, banner gold, row "First clear Warren · next: Bramble"', a.walked === 'boss' && a.shown && a.gold && a.color === 'rgb(255, 212, 90)' && a.row === 'First clear Warren · next: Bramble' && a.api && a.api.next === 'Bramble', JSON.stringify(a));
  check('1b. the clear is recorded in pixeltown-deep-v1 (warren: 1)', a.deep && JSON.parse(a.deep).f.warren === 1, a.deep);
  const b = await clearOnce('warren', 8);
  check('2. a second Warren clear: no gold banner, no first-clear row', b.walked === 'boss' && b.shown && !b.gold && b.row === null && !b.api, JSON.stringify(b));
  await page.evaluate(() => localStorage.setItem('pixeltown-deep-v1', JSON.stringify({ v: 1, f: { warren: 1, bramble: 2, meadow: 1 } })));
  const c = await clearOnce('crypt', 5);
  check('3. the last uncleared biome (Crypt): "every dungeon cleared"', c.walked === 'boss' && c.gold && c.row === 'First clear Crypt · every dungeon cleared', JSON.stringify(c));
  check('no page errors', errors.length === 0, errors.join(' | '));
  check('DB: 0 requests (db.attempts() === 0)', db.attempts() === 0, String(db.attempts()));
  await browser.close();
  done();
})().catch((e) => { console.error(e); process.exit(1); });
