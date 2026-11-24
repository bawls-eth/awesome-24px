// Cycle 3 D: one-dungeon-floor bot. Real input only (page.mouse.move to aim, Space held to fire, WASD to move); the state it reads is the arena's own (enemies, enemy bolts, doors).
// Offline (route abort + WebSocket close), 0 DB requests. Logs per room: seconds, damage taken, enemies seen, doors used. Run:
//   BASE_ORIGIN=http://localhost:9734 NODE_PATH=$(npm root -g) node dungeon-bot.js <biome> <heroLevel> <seed> [maxSeconds]
const { chromium } = require('playwright');
const ORIGIN = process.env.BASE_ORIGIN || 'http://localhost:9734';
const BIOME = process.argv[2] || 'warren', LEVEL = +process.argv[3] || 8, SEED = process.argv[4] || '7', MAXS = +process.argv[5] || 240;
const sv = { realm: { level: LEVEL, xp: 0, shards: 50, bestWave: 2, items: [{ n: 1, id: 'sparkwand', r: 0 }], nextUid: 2, eq: { weapon: 1 }, gv: 1, gp: { b: 0, d: 0 } } };
const E = (page, fn, arg) => page.evaluate(`(${fn.toString()})(window.__mm.arena, window.__mm.dungeon, ${JSON.stringify(arg)})`);
(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1000, height: 700 } });
  let db = 0;
  await ctx.route(/firebase|googleapis|gstatic\.com\/firebasejs/, (r) => { db++; r.abort(); });
  await ctx.routeWebSocket(/.*/, (ws) => ws.close());
  await ctx.route('**/game/index.html*', (r) => r.fulfill({ contentType: 'text/html', body: '<!doctype html>town' }));
  await ctx.route('**/hub/index.html*', (r) => r.fulfill({ contentType: 'text/html', body: '<!doctype html>hub' }));
  const page = await ctx.newPage(); const errs = [];
  page.on('pageerror', (e) => errs.push(e.message));
  await page.goto(ORIGIN + '/game/games/mad-maze/lantern.css');
  await page.evaluate(([v, w]) => { localStorage.clear(); localStorage.setItem('pixeltown-save-v1', v); localStorage.setItem('pixeltown-realm-v1', w); localStorage.setItem('mm-aim-assist', '0'); }, [JSON.stringify(sv), JSON.stringify({ gp: sv.realm.gp })]);
  await page.goto(ORIGIN + '/game/games/mad-maze/index.html?mode=dungeon&test=1&biome=' + BIOME + '&lv=' + LEVEL + '&seed=' + SEED);
  await page.waitForFunction(() => window.__mm && window.__mm.dungeon && window.__mm.arena.active && window.__mm.arena.state === 'play', null, { timeout: 30000 });
  await page.mouse.move(500, 300);
  const held = new Set();
  async function key(k, on) { if (on && !held.has(k)) { held.add(k); await page.keyboard.down(k); } else if (!on && held.has(k)) { held.delete(k); await page.keyboard.up(k); } }
  const rooms = []; const visited = new Set(); let cur = null, rec = null, t0 = Date.now(), minHp = 1e9, hp0 = null, boltsSum = 0, boltsN = 0, ended = 'time';
  const dirs = [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1], [.7, .7], [.7, -.7], [-.7, .7], [-.7, -.7]];
  while ((Date.now() - t0) / 1000 < MAXS) {
    const s = await E(page, (a, d) => {
      const p = a.player, cr = a.canvas.getBoundingClientRect();
      const bl = []; let live = 0; for (const b of a.eBullets) if (b.active) { live++; if (Math.hypot(b.x - p.x, b.y - p.y) < 260) bl.push([b.x, b.y, b.vx, b.vy]); }
      const en = a.enemies.filter((e) => e.active).map((e) => [e.x, e.y, e.dg || '', e.hp]);
      const doors = d.doors().map((o) => ({ dir: o.dir, other: o.other, status: o.status, x: (o.tile.x + 0.5) * 40, y: (o.tile.y + 0.5) * 40 }));
      const sum = document.getElementById('mm-summary');
      return { room: d.room, hp: p.hp, maxHp: a.stats.maxHp, px: p.x, py: p.y, cx: a.camera ? a.camera.x : 0, cy: a.camera ? a.camera.y : 0, W: a._dv ? a._dv.vw : a.W, H: a.H, cw: cr.width, ch: cr.height, cl: cr.left, ct: cr.top, bl, live, en, doors, dead: a.state === 'dead', summary: !!(sum && !sum.classList.contains('hidden')), mobs: d.mobs() };
    });
    if (s.dead) { ended = 'died'; break; }
    if (s.summary) { ended = 'summary'; break; }
    if (hp0 === null) hp0 = s.hp;
    minHp = Math.min(minHp, s.hp); boltsSum += s.live; boltsN++;
    if (s.room !== cur) { if (rec) { rec.secs = +((Date.now() - rec.t) / 1000).toFixed(1); rec.hpEnd = s.hp; delete rec.t; rooms.push(rec); console.log(JSON.stringify(rec)); } cur = s.room; visited.add(cur); rec = { room: cur, t: Date.now(), hpStart: s.hp, enemiesSeen: s.en.length, maxBolts: 0 }; }
    rec.maxBolts = Math.max(rec.maxBolts, s.live); rec.enemiesSeen = Math.max(rec.enemiesSeen, s.en.length);
    // target: nearest enemy in the room; else the nearest open door to a room not yet visited (else any open door)
    let tgt = null, td = 1e9;
    for (const e of s.en) { const d = Math.hypot(e[0] - s.px, e[1] - s.py); if (d < td) { td = d; tgt = { x: e[0], y: e[1], enemy: true }; } }
    let goal = null;
    if (!tgt) { const open = s.doors.filter((o) => o.status === 'open'); const fresh = open.filter((o) => !visited.has(o.other)); const pick = (fresh.length ? fresh : open).sort((a, b) => Math.hypot(a.x - s.px, a.y - s.py) - Math.hypot(b.x - s.px, b.y - s.py))[0]; if (pick) goal = pick; }
    if (tgt) { const sx = (tgt.x - s.cx) / s.W * s.cw + s.cl, sy = (tgt.y - s.cy) / s.H * s.ch + s.ct; await page.mouse.move(Math.max(0, Math.min(999, sx)), Math.max(0, Math.min(699, sy))); }
    await key(' ', !!tgt);
    const SP = 235; let best = null;
    for (const [dx, dy] of dirs) {
      let cost = 0;
      for (let tt = 0.05; tt <= 0.45; tt += 0.05) { const qx = s.px + dx * SP * tt, qy = s.py + dy * SP * tt; for (const b of s.bl) { const d = Math.hypot(b[0] + b[2] * tt - qx, b[1] + b[3] * tt - qy); if (d < 34) cost += (34 - d) * (1.2 - tt); } }
      if (tgt) { const nd = Math.hypot(tgt.x - (s.px + dx * SP * 0.3), tgt.y - (s.py + dy * SP * 0.3)); cost += Math.abs(nd - 220) * 0.04 + (dx || dy ? 0.2 : 0); }
      else if (goal) { const nd = Math.hypot(goal.x - (s.px + dx * SP * 0.3), goal.y - (s.py + dy * SP * 0.3)); cost += nd * 0.05; }
      if (!best || cost < best.c) best = { c: cost, dx, dy };
    }
    await key('d', best.dx > 0.3); await key('a', best.dx < -0.3); await key('s', best.dy > 0.3); await key('w', best.dy < -0.3);
  }
  const fin = await E(page, (a, d) => ({ hp: a.player.hp, kills: a.run ? a.run.kills : 0, shards: a.run ? a.run.shards : 0, room: d.room }));
  if (rec) { rec.secs = +((Date.now() - rec.t) / 1000).toFixed(1); delete rec.t; rooms.push(rec); }
  for (const k of Array.from(held)) await key(k, false);
  console.log('RESULT', JSON.stringify({ biome: BIOME, level: LEVEL, seed: SEED, ended, wallSecs: +((Date.now() - t0) / 1000).toFixed(1), roomsVisited: visited.size, minHp, hpStart: hp0, hpEnd: fin.hp, avgBolts: +(boltsSum / Math.max(1, boltsN)).toFixed(1), kills: fin.kills, shards: fin.shards, db, errs: errs.slice(0, 3), rooms }));
  await browser.close();
})().catch((e) => { console.error(e); process.exit(1); });
