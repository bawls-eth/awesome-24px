// Cycle 3 D: one-dungeon-floor bot. Real input only (page.mouse.move to aim, Space held to fire, WASD to move); the state it reads is the arena's own (enemies, enemy bolts, doors).
// Offline (route abort + WebSocket close), 0 DB requests. Logs per room: seconds, damage taken, enemies seen, doors used. Run:
//   BASE_ORIGIN=http://localhost:9734 NODE_PATH=$(npm root -g) node dungeon-bot.js <biome> <heroLevel> <seed> [maxSeconds]
const { chromium } = require('playwright');
const ORIGIN = process.env.BASE_ORIGIN || 'http://localhost:9734';
const BIOME = process.argv[2] || 'warren', LEVEL = +process.argv[3] || 8, SEED = process.argv[4] || '7', MAXS = +process.argv[5] || 240;
const STAND = +process.env.STAND || 150;
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
  if (process.env.DBG) await page.evaluate(() => { window.__bd = []; const a = window.__mm.arena; let last = new Map(); const f = () => { const cur = new Map(); a.pBullets.forEach((b, i) => { if (b.active) cur.set(i, [b.x | 0, b.y | 0, +b.life.toFixed(2)]); }); last.forEach((v, k) => { if (!cur.has(k) && v[2] > 0.25) window.__bd.push(v); }); last = cur; requestAnimationFrame(f); }; f(); });
  const graph = await E(page, (a, d) => (d.graph ? { doors: d.graph.doors.map((g) => ({ a: g.a, b: g.b, cracked: !!g.cracked, locked: !!g.locked })), boss: d.graph.bossRoomId } : null));
  await page.mouse.move(500, 300);
  const held = new Set();
  async function key(k, on) { if (on && !held.has(k)) { held.add(k); await page.keyboard.down(k); } else if (!on && held.has(k)) { held.delete(k); await page.keyboard.up(k); } }
  let grid = null; const wall = (x, y) => { if (!grid) return false; const c = Math.floor(x / 40), r = Math.floor(y / 40); return r < 0 || c < 0 || r >= grid.length || c >= grid[0].length || grid[r][c] === '#'; };
  // hero box: the hero's radius is 11, so a 10 px box let the bot press into a 1-tile gap 10 px off its centre line and stand there (cycle 6 S, seed 11 room 5: 30 s at (291, 250)); 12 px makes it align first
  const body = (x, y) => wall(x - 12, y - 12) || wall(x + 12, y - 12) || wall(x - 12, y + 12) || wall(x + 12, y + 12);
  // cycle 4: pillars stop bolts, so the bot needs line of sight. Cycle 6 S: the 10 px samples skipped the corners of diagonal walls (warren
  // room 2, seed 7: a 6 px wall corner between the hero and a mob that hugged it, so every bolt died there and the bot stood still for 60 s+);
  // now 3 px samples along the centre line and two lines 6 px to each side (the wand's bolts leave from the hero's edge and spread a little).
  const los1 = (x0, y0, x1, y1) => { const n = Math.max(1, Math.ceil(Math.hypot(x1 - x0, y1 - y0) / 3)); for (let i = 1; i < n; i++) if (wall(x0 + (x1 - x0) * i / n, y0 + (y1 - y0) * i / n)) return false; return true; };
  const los = (x0, y0, x1, y1) => { const L = Math.hypot(x1 - x0, y1 - y0) || 1, ox = -(y1 - y0) / L * 6, oy = (x1 - x0) / L * 6; return los1(x0, y0, x1, y1) && los1(x0 + ox, y0 + oy, x1 + ox * 0.3, y1 + oy * 0.3) && los1(x0 - ox, y0 - oy, x1 - ox * 0.3, y1 - oy * 0.3); };
  // BFS over open tiles: the centre of the first tile on the shortest path to any tile where ok(cx, cy) holds, or null
  const pathNext = (px, py, ok) => {
    if (!grid) return null; const R = grid.length, C = grid[0].length, c0 = Math.floor(px / 40), r0 = Math.floor(py / 40); const prev = new Map(); const q = [[c0, r0]]; prev.set(c0 + ',' + r0, null);
    while (q.length) {
      const [c, r] = q.shift();
      if (ok((c + 0.5) * 40, (r + 0.5) * 40) && (c !== c0 || r !== r0)) { let k = c + ',' + r, cur = [c, r]; while (prev.get(k)) { const pv = prev.get(k); if (pv[0] === c0 && pv[1] === r0) break; cur = pv; k = pv[0] + ',' + pv[1]; } return { x: (cur[0] + 0.5) * 40, y: (cur[1] + 0.5) * 40 }; }
      for (const [dc, dr] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const nc = c + dc, nr = r + dr; if (nc < 0 || nr < 0 || nc >= C || nr >= R || grid[nr][nc] === '#' || prev.has(nc + ',' + nr)) continue; prev.set(nc + ',' + nr, [c, r]); q.push([nc, nr]); }
    }
    return null;
  };
  const rooms = []; const visited = new Set(); let cur = null, rec = null, t0 = Date.now(), minHp = 1e9, hp0 = null, boltsSum = 0, boltsN = 0, ended = 'time'; const stall = { sig: '', t: Date.now(), told: 0, n: 0 }; const still = { x: 0, y: 0, t: Date.now(), n: 0, centre: 0 };
  const dirs = [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1], [.7, .7], [.7, -.7], [-.7, .7], [-.7, -.7]];
  while ((Date.now() - t0) / 1000 < MAXS) {
    const s = await E(page, (a, d) => {
      const p = a.player, cr = a.canvas.getBoundingClientRect();
      const bl = []; let live = 0; for (const b of a.eBullets) if (b.active) { live++; if (Math.hypot(b.x - p.x, b.y - p.y) < 260) bl.push([b.x, b.y, b.vx, b.vy]); }
      const en = a.enemies.filter((e) => e.active).map((e) => [e.x, e.y, e.dg || '', e.hp]);
      const doors = d.doors().map((o) => ({ dir: o.dir, other: o.other, status: o.status, x: (o.tile.x + 0.5) * 40, y: (o.tile.y + 0.5) * 40 }));
      const sum = document.getElementById('mm-summary');
      return { room: d.room, hp: p.hp, maxHp: a.stats.maxHp, px: p.x, py: p.y, cx: a.camera ? a.camera.x : 0, cy: a.camera ? a.camera.y : 0, W: a._dv ? a._dv.vw : a.W, H: a.H, cw: cr.width, ch: cr.height, cl: cr.left, ct: cr.top, bl, live, en, doors, portal: d.portalPos(), key: d.keyPos(), dead: a.state === 'dead', summary: !!(sum && !sum.classList.contains('hidden')), mobs: d.mobs(), dbg: { aim: a.player.aim, mouse: [a.mouse.x, a.mouse.y, a.mouse.seen], keys: Object.keys(a.keys).filter((k) => a.keys[k]), st: a.state, pb: a.pBullets.filter((b) => b.active).map((b) => [b.x | 0, b.y | 0, b.vx | 0, b.vy | 0, b.life]), eh: a.enemies.filter((e) => e.active).map((e) => [e.hp, e.maxHp, e.x | 0, e.y | 0, e.kind || e.type || '', e.shield || 0]), cd: a.player.cd, w: a.stats && a.stats.weaponName } };
    });
    if (s.dead) { ended = 'died'; break; }
    if (s.summary) { ended = 'summary'; break; }
    if (hp0 === null) hp0 = s.hp;
    minHp = Math.min(minHp, s.hp); boltsSum += s.live; boltsN++;
    if (s.room !== cur) { if (rec) { rec.secs = +((Date.now() - rec.t) / 1000).toFixed(1); rec.hpEnd = s.hp; delete rec.t; rooms.push(rec); console.log(JSON.stringify(rec)); } cur = s.room; visited.add(cur); grid = (await E(page, (a) => { const o = []; for (let y = 0; y < 13; y++) { let r = ''; for (let x = 0; x < 17; x++) r += a.isWallAt(x * 40 + 20, y * 40 + 20) ? '#' : '.'; o.push(r); } return o; })); rec = { room: cur, t: Date.now(), hpStart: s.hp, enemiesSeen: s.en.length, maxBolts: 0 }; }
    rec.maxBolts = Math.max(rec.maxBolts, s.live); rec.enemiesSeen = Math.max(rec.enemiesSeen, s.en.length);
    // target: nearest enemy in the room; else the nearest open door to a room not yet visited (else any open door)
    let tgt = null, td = 1e9;
    for (const e of s.en) { const d = Math.hypot(e[0] - s.px, e[1] - s.py); if (d < td) { td = d; tgt = { x: e[0], y: e[1], enemy: true }; } }
    let goal = null;
    // cycle 6 S: after the boss the floor is cleared by walking into the portal (dungeon.js finish() at < 30 px); a key on the floor is picked up first.
    // Before this the bot only knew doors, so it ping-ponged between the last two rooms and never reached the summary.
    if (!tgt && s.portal) goal = { x: s.portal.x, y: s.portal.y, spot: true };
    else if (!tgt && s.key) goal = { x: s.key.x, y: s.key.y, spot: true };
    if (!tgt && !goal) {
      const open = s.doors.filter((o) => o.status === 'open'); const fresh = open.filter((o) => !visited.has(o.other));
      // Cycle 6 S: with no fresh door here the bot used to take the NEAREST open door, so it ping-ponged between a dead end and its neighbour
      // (warren seed 11: rooms 4 <-> 5 for 230 s while the start room still had unexplored doors). Now: walk the floor graph (BFS over the
      // rooms already seen) to the closest visited room that still has a door to an unvisited, non-secret room, and take the first door on that path.
      let pick = fresh.sort((a, b) => Math.hypot(a.x - s.px, a.y - s.py) - Math.hypot(b.x - s.px, b.y - s.py))[0];
      if (!pick && graph) {
        const nb = (r) => graph.doors.filter((g) => !g.cracked && (g.a === r || g.b === r)).map((g) => (g.a === r ? g.b : g.a));
        const prev = new Map([[s.room, null]]); const q = [s.room]; let hit = null;
        while (q.length && hit === null) { const r = q.shift(); for (const o of nb(r)) { if (prev.has(o)) continue; prev.set(o, r); if (!visited.has(o)) { hit = o; break; } q.push(o); } }
        if (hit !== null) { let step = hit; while (prev.get(step) !== s.room) step = prev.get(step); pick = open.find((o) => o.other === step); }
      }
      if (!pick) pick = open.sort((a, b) => Math.hypot(a.x - s.px, a.y - s.py) - Math.hypot(b.x - s.px, b.y - s.py))[0];
      if (pick) goal = pick;
    }
    let wp = null; // waypoint around pillars: toward a tile with a clear shot (enemy) or toward the door tile
    if (tgt) { if (!(los(s.px, s.py, tgt.x, tgt.y) && Math.hypot(tgt.x - s.px, tgt.y - s.py) < STAND + 110)) wp = pathNext(s.px, s.py, (cx, cy) => los(cx, cy, tgt.x, tgt.y) && Math.hypot(tgt.x - cx, tgt.y - cy) < STAND + 60 && Math.hypot(tgt.x - cx, tgt.y - cy) > 70); }
    // an open floor spot (portal / key): tile-centre BFS path to its tile (a straight line clipped pillar corners: seed 11 boss room, hero parked
    // at (380, 241) for 200 s, 45 px from the portal with a pillar corner in the way), straight in for the last 30 px
    else if (goal && goal.spot) wp = Math.hypot(goal.x - s.px, goal.y - s.py) < 30 ? goal : (pathNext(s.px, s.py, (cx, cy) => Math.hypot(cx - goal.x, cy - goal.y) < 21) || goal);
    else if (goal) wp = pathNext(s.px, s.py, (cx, cy) => Math.hypot(cx - goal.x, cy - goal.y) < 45 && !(cx === goal.x && cy === goal.y)) || goal; // the door tile itself reads as wall on the grid: path to the tile in front of it
    // Cycle 6 S, the real "one enemy survives" bug: the ability bar (#realm-abilities, buttons over the bottom of the canvas) swallows pointermove
    // (realm.js listens on the canvas), so aiming at a mob near the bottom wall left the aim frozen at the last canvas point and every bolt flew
    // past it (seed 11 room 4: mob at y 473 for 80 s, bolts ending at y 477 far to its right). Aim only needs the direction, so the bot moves the
    // mouse to the farthest point on the hero->target ray that is really over the canvas.
    // un-stick: for 0.7 s after a STUCK the waypoint is the centre of the hero's own tile (a 12 px box always fits there), which breaks the
    // local minimum of "every step is blocked or longer" beside a wall row (seed 11 room 1: (298, 161) under a 4-tile wall)
    if (Date.now() < still.centre) wp = { x: (Math.floor(s.px / 40) + 0.5) * 40, y: (Math.floor(s.py / 40) + 0.5) * 40 };
    if (tgt) {
      const pt = await page.evaluate(([px, py, tx, ty, cx, cy, W, H]) => { const cv = window.__mm.arena.canvas, cr = cv.getBoundingClientRect(); const L = Math.hypot(tx - px, ty - py) || 1;
        const scr = (wx, wy) => [(wx - cx) / W * cr.width + cr.left, (wy - cy) / H * cr.height + cr.top];
        for (let d = L; d > 12; d -= 12) { const q = scr(px + (tx - px) * d / L, py + (ty - py) * d / L); if (q[0] >= 0 && q[1] >= 0 && q[0] < innerWidth && q[1] < innerHeight && document.elementFromPoint(q[0], q[1]) === cv) return q; }
        return scr(tx, ty); }, [s.px, s.py, tgt.x, tgt.y, s.cx, s.cy, s.W, s.H]);
      await page.mouse.move(Math.max(0, Math.min(999, pt[0])), Math.max(0, Math.min(699, pt[1])));
    }
    await key(' ', !!tgt);
    const SP = 235; let best = null;
    for (const [dx, dy] of dirs) {
      let cost = 0;
      for (let tt = 0.05; tt <= 0.45; tt += 0.05) { const qx = s.px + dx * SP * tt, qy = s.py + dy * SP * tt; for (const b of s.bl) { const d = Math.hypot(b[0] + b[2] * tt - qx, b[1] + b[3] * tt - qy); if (d < 34) cost += (34 - d) * (1.2 - tt); } }
      if (tgt && !wp) { const qx = s.px + dx * SP * 0.3, qy = s.py + dy * SP * 0.3, nd = Math.hypot(tgt.x - qx, tgt.y - qy); cost += Math.abs(nd - STAND) * 0.04 + (dx || dy ? 0.2 : 0); if (body(qx, qy) || body(s.px + dx * 14, s.py + dy * 14)) cost += 40; if (!los(qx, qy, tgt.x, tgt.y)) cost += 6; }
      else if (wp) { const gd = Math.hypot(wp.x - s.px, wp.y - s.py), st = Math.min(SP * 0.3, gd), nl = Math.hypot(dx, dy) || 1; const qx = s.px + dx / nl * st, qy = s.py + dy / nl * st; if (grid && (dx || dy) && !(goal && !goal.spot && !tgt && Math.hypot(goal.x - s.px, goal.y - s.py) < 70) && body(s.px + dx / nl * 14, s.py + dy / nl * 14)) cost += 30; const nd = Math.hypot(wp.x - qx, wp.y - qy); cost += nd * 0.05 + (dx || dy ? 0 : 0.05); }  // cycle 4: the step is capped at the goal distance (the old 70 px look-ahead overshot a door at the wall and parked the hero at x=54)
      if (!best || cost < best.c) best = { c: cost, dx, dy };
    }
    { const hs = s.en.reduce((q, e) => q + e[3], 0) + ':' + s.en.length + ':' + s.room; if (hs !== stall.sig) { stall.sig = hs; stall.t = Date.now(); stall.told = 0; } else if (s.en.length && Date.now() - stall.t > 8000 && Date.now() - stall.told > 8000) { stall.told = Date.now(); stall.n++; console.log('STALL', JSON.stringify({ room: s.room, secs: +((Date.now() - stall.t) / 1000).toFixed(1), p: [s.px | 0, s.py | 0], en: s.en.map((e) => [e[0] | 0, e[1] | 0, e[2], +(+e[3]).toFixed(1), los(s.px, s.py, e[0], e[1]), wall(e[0], e[1])]), tgt, wp, best, grid })); } }
    // cycle 6 S: a hero that has not moved for 1.5 s while it has somewhere to go re-reads the room grid (logged as STUCK with the grid
    // and waypoint, so a stale or wrong grid shows in the log instead of a silent 200 s stand-still)
    if (Math.hypot(s.px - still.x, s.py - still.y) > 4) { still.x = s.px; still.y = s.py; still.t = Date.now(); }
    else if ((goal || tgt) && Date.now() - still.t > 1500) {
      still.t = Date.now(); still.n++; still.centre = Date.now() + 700;
      const g2 = await E(page, (a) => { const o = []; for (let y = 0; y < 13; y++) { let r = ''; for (let x = 0; x < 17; x++) r += a.isWallAt(x * 40 + 20, y * 40 + 20) ? '#' : '.'; o.push(r); } return o; });
      console.log('STUCK', JSON.stringify({ room: s.room, p: [s.px | 0, s.py | 0], goal, wp, best, gridChanged: JSON.stringify(g2) !== JSON.stringify(grid), grid: g2 }));
      grid = g2;
    }
    if (process.env.DBG && boltsN % 40 === 0) console.log('DBG', boltsN, ((Date.now() - t0) / 1000).toFixed(1), JSON.stringify({ p: [s.px | 0, s.py | 0], goal, best, doors: s.doors, mobs: s.mobs, en: s.en.length, dbg: s.dbg, tgt, cam: [s.cx, s.cy, s.W, s.H, s.cw, s.ch, s.cl, s.ct] }));
    await key('d', best.dx > 0.3); await key('a', best.dx < -0.3); await key('s', best.dy > 0.3); await key('w', best.dy < -0.3);
  }
  if (process.env.DBG) console.log('BOLTEND', JSON.stringify(await page.evaluate(() => window.__bd.slice(-25))));
  const fin = await E(page, (a, d) => ({ hp: a.player.hp, kills: a.run ? a.run.kills : 0, shards: a.run ? a.run.shards : 0, room: d.room }));
  if (rec) { rec.secs = +((Date.now() - rec.t) / 1000).toFixed(1); delete rec.t; rooms.push(rec); }
  for (const k of Array.from(held)) await key(k, false);
  console.log('RESULT', JSON.stringify({ biome: BIOME, level: LEVEL, seed: SEED, ended, wallSecs: +((Date.now() - t0) / 1000).toFixed(1), roomsVisited: visited.size, minHp, hpStart: hp0, hpEnd: fin.hp, avgBolts: +(boltsSum / Math.max(1, boltsN)).toFixed(1), stalls: stall.n, stuck: still.n, kills: fin.kills, shards: fin.shards, db, errs: errs.slice(0, 3), rooms }));
  await browser.close();
})().catch((e) => { console.error(e); process.exit(1); });
