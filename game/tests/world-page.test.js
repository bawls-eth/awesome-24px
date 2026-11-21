// Slices 5-7: the Realm World page (games/mad-maze/index.html?mode=world) end to end: big map, chunk renderer, collisions, zone HUD +
// minimap, zone spawner + drops + boss sites, portal -> Warren dungeon -> back to the portal tile, death -> restart at spawn, the
// additive pixeltown-realm-v1 save, seed params, the old page behaviour without ?mode, and a 390x844 phone.
// Run: BASE=http://localhost:8501/game/index.html NODE_PATH=$(npm root -g) node game/tests/world-page.test.js
const { chromium } = require('playwright');
const { check, done } = require('./helpers');
const ORIGIN = (process.env.BASE || 'http://localhost:8440/game/index.html').replace(/\/game\/index\.html.*$/, '');
const PAGE = ORIGIN + '/game/games/mad-maze/index.html';
const WORLD = PAGE + '?mode=world&test=1&seed=12345';
const SAVE = { realm: { level: 4, xp: 0, shards: 50, bestWave: 2, items: [{ n: 1, id: 'sparkwand', r: 0 }], nextUid: 2, eq: { weapon: 1 } } };
const RKEY = 'pixeltown-realm-v1';

async function context(browser, opts) {
  const ctx = await browser.newContext(opts || { viewport: { width: 1000, height: 700 } });
  await ctx.route('**/game/index.html*', (r) => r.fulfill({ contentType: 'text/html', body: '<!doctype html><title>town</title>town' })); // the town exit: no network
  const page = await ctx.newPage();
  const errors = []; const bad = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  page.on('response', (r) => { if (r.status() >= 400) bad.push(r.status() + ' ' + r.url()); });
  await page.goto(ORIGIN + '/game/games/mad-maze/lantern.css');
  await page.evaluate((v) => { localStorage.clear(); localStorage.setItem('pixeltown-save-v1', v); localStorage.setItem('mm-aim-assist', '0'); }, JSON.stringify(SAVE));
  errors.length = 0;
  return { ctx, page, errors, bad };
}
const waitWorld = (page) => page.waitForFunction(() => window.__mm && window.__mm.world && window.__mm.arena.active && window.__mm.arena.state === 'play', null, { timeout: 15000 });
const A = (page, fn, arg) => page.evaluate(`(${fn.toString()})(window.__mm.arena, window.__mm.world, ${JSON.stringify(arg)})`);
const frames = (page, n) => page.evaluate((k) => new Promise((res) => { let i = 0; const f = () => (++i >= k ? res() : requestAnimationFrame(f)); requestAnimationFrame(f); }), n);
const vis = (page, sel) => page.evaluate((s) => { const e = document.querySelector(s); if (!e || e.classList.contains('hidden')) return false; const cs = getComputedStyle(e); const r = e.getBoundingClientRect(); return cs.display !== 'none' && cs.visibility !== 'hidden' && r.width > 0 && r.height > 0; }, sel);
const godMode = (page) => A(page, (a) => { a.player.iframes = 1e9; a._hitPlayer = () => {}; });
// BFS over walkable tiles from (sx,sy) to the first tile matching `want` ('center' | zone number); returns the tile path
const pathTo = (page, from, want) => A(page, (a, w, q) => {
  const W = w.world; const N = W.w; const prev = new Int32Array(N * W.h).fill(-1); const s = q.from[1] * N + q.from[0]; prev[s] = s;
  const queue = [s]; let goal = -1;
  for (let h = 0; h < queue.length && goal < 0; h++) {
    const c = queue[h]; const x = c % N; const y = (c / N) | 0;
    const hit = q.want === 'center' ? (x === W.center.x && y === W.center.y) : W.zone[c] === q.want;
    if (hit) { goal = c; break; }
    [[1, 0], [-1, 0], [0, 1], [0, -1]].forEach(([dx, dy]) => { const nx = x + dx; const ny = y + dy; if (nx < 0 || ny < 0 || nx >= N || ny >= W.h) return; const n = ny * N + nx; if (prev[n] >= 0 || W.solid[n]) return; prev[n] = c; queue.push(n); });
  }
  if (goal < 0) return null;
  const out = []; for (let c = goal; c !== s; c = prev[c]) out.push([c % N, (c / N) | 0]); out.push(q.from); return out.reverse();
}, { from, want });
const walk = (page, path) => A(page, async (a, w, path) => {
  let maxChunks = 0; const cam0 = { x: a.camera.x, y: a.camera.y }; const zonesSeen = {};
  for (const [tx, ty] of path) {
    a.player.x = (tx + 0.5) * 32; a.player.y = (ty + 0.5) * 32;
    await new Promise((r) => requestAnimationFrame(r));
    maxChunks = Math.max(maxChunks, w.chunkCount()); zonesSeen[w.world.zone[ty * w.world.w + tx]] = 1;
  }
  for (let i = 0; i < 30; i++) await new Promise((r) => requestAnimationFrame(r));
  return { maxChunks, builds: w.chunkBuilds(), cam0, cam1: { x: a.camera.x, y: a.camera.y }, W: a.W, H: a.H, zonesSeen: Object.keys(zonesSeen).map(Number) };
}, path);

(async () => {
  const browser = await chromium.launch();
  const errs = []; const bads = [];

  // ================= load + spawn =================
  const P = await context(browser); const page = P.page;
  await page.goto(WORLD); await waitWorld(page);
  const s0 = await A(page, (a, w) => ({
    seed: w.seed, gen: w.genMs, mode: a.mode, hasWorld: !!a.world, ww: a.world.w, sp: w.world.spawnPoint, ptile: [Math.floor(a.player.x / 32), Math.floor(a.player.y / 32)],
    zone: w.world.zone[Math.floor(a.player.y / 32) * w.world.w + Math.floor(a.player.x / 32)], tile: w.tileAt(a.player.x, a.player.y), solid: w.solidAt(a.player.x, a.player.y),
  }));
  check('?mode=world loads the world controller (mode world, 256x256 tiles of 32 px)', s0.mode === 'world' && s0.hasWorld && s0.ww === 8192 && s0.seed === '12345', JSON.stringify(s0));
  console.log('INFO world generation ms:', Math.round(s0.gen));
  check('the player spawns on the spawn point, on the shore, on a walkable tile', s0.ptile[0] === s0.sp.x && s0.ptile[1] === s0.sp.y && s0.zone === 0 && !s0.solid, JSON.stringify(s0));
  await page.waitForTimeout(2500);
  const s1 = await A(page, (a) => ({ wave: a.run.wave, state: a.state, banner: document.getElementById('realm-banner').textContent }));
  check('no waves in world mode (wave stays 0, no wave banner)', s1.wave === 0 && s1.state === 'play' && !/Wave/.test(s1.banner), JSON.stringify(s1));
  check('zone HUD shows the Shore and a danger label', await A(page, (a, w) => w.hudText().zone === 'Shore · Safe-ish' && document.getElementById('realm-wave').textContent === 'Shore'));
  check('minimap canvas (96x96) and zone label are visible', await vis(page, '#rw-minimap') && await vis(page, '#rw-zone') && await page.evaluate(() => { const c = document.getElementById('rw-minimap'); return c.width === 96 && c.height === 96; }));
  check('terrain art (Codex b10t shore/midlands tiles) is used where delivered, with cached chunks', await A(page, (a, w) => w.artTiles() > 0 && w.chunkCount() > 0));
  const sp0 = await A(page, (a, w) => w.liveEnemies());
  const ct = await page.evaluate(() => MMOverworld.CREATURE_TIERS);
  const near0 = sp0.slice().sort((a, b) => Math.hypot(a.x - s0.sp.x * 32, a.y - s0.sp.y * 32) - Math.hypot(b.x - s0.sp.x * 32, b.y - s0.sp.y * 32))[0];
  check('enemies spawned around the shore spawn are shore / midlands tiers only (0-1), none inside the 20-tile spawn halo', sp0.length > 0 && sp0.every((e) => e.tier <= 1) && sp0.some((e) => e.zone === 0) && Math.hypot(near0.x - (s0.sp.x + 0.5) * 32, near0.y - (s0.sp.y + 0.5) * 32) > 18 * 32, JSON.stringify(near0));
  check('every spawned enemy carries its zone tier and a creature of that tier', sp0.every((e) => e.tier === e.zone && ct[e.type][e.tier].includes(e.art)), JSON.stringify(sp0.slice(0, 3)));

  // ================= a few seconds of real play: perf sample + no canvas per frame =================
  await godMode(page);
  const perf = await page.evaluate(async () => {
    const ts = []; await new Promise((res) => { let i = 0; const f = (t) => { ts.push(t); if (++i >= 120) res(); else requestAnimationFrame(f); }; requestAnimationFrame(f); });
    const d = []; for (let i = 1; i < ts.length; i++) d.push(ts[i] - ts[i - 1]);
    const a = window.__mm.arena; const u0 = a._update; const d0 = a._draw; let work = 0; let wn = 0; // CPU time spent in update + draw per frame
    a._update = function (dt) { const t = performance.now(); u0.call(a, dt); work += performance.now() - t; };
    a._draw = function () { const t = performance.now(); d0.call(a); work += performance.now() - t; wn++; };
    await new Promise((res) => { let i = 0; const f = () => (++i >= 120 ? res() : requestAnimationFrame(f)); requestAnimationFrame(f); });
    delete a._update; delete a._draw;
    const orig = document.createElement.bind(document); let n = 0;
    document.createElement = (t, o) => { if (String(t).toLowerCase() === 'canvas') n++; return orig(t, o); };
    await new Promise((res) => { let i = 0; const f = () => (++i >= 60 ? res() : requestAnimationFrame(f)); requestAnimationFrame(f); });
    document.createElement = orig;
    return { avg: d.reduce((s, x) => s + x, 0) / d.length, max: Math.max(...d), canv: n, work: work / Math.max(1, wn), ema: window.__mm.arena.perfState().ema, enemies: window.__mm.arena.enemies.filter((e) => e.active).length };
  });
  console.log('INFO frame time (headless, standing at spawn): avg', perf.avg.toFixed(1), 'ms, max', perf.max.toFixed(1), 'ms, arena ema', perf.ema.toFixed(1), 'ms; update+draw work', perf.work.toFixed(2), 'ms/frame; live enemies', perf.enemies);
  check('no canvas is created per frame while standing still', perf.canv === 0, String(perf.canv));

  // ================= real keyboard walk =================
  const k0 = await A(page, (a) => ({ x: a.player.x, y: a.player.y, cx: a.camera.x, cy: a.camera.y }));
  const keyDir = await A(page, (a, w) => { const tx = Math.floor(a.player.x / 32); const ty = Math.floor(a.player.y / 32); const free = (x, y) => !w.world.solid[y * w.world.w + x]; const ok = (dx, dy) => { for (let k = 1; k <= 4; k++) if (!free(tx + dx * k, ty + dy * k)) return false; return true; }; return ok(1, 0) ? 'd' : ok(0, -1) ? 'w' : ok(-1, 0) ? 'a' : 's'; });
  await page.keyboard.down(keyDir); await page.waitForTimeout(600); await page.keyboard.up(keyDir);
  const k1 = await A(page, (a) => ({ x: a.player.x, y: a.player.y, cx: a.camera.x, cy: a.camera.y }));
  check('keyboard: walking moves the player and the camera follows', Math.hypot(k1.x - k0.x, k1.y - k0.y) > 60 && Math.hypot(k1.cx - k0.cx, k1.cy - k0.cy) > 30, JSON.stringify([keyDir, k0, k1]));

  // ================= walk to the centre: >= 3 screens, chunk cache cap, zones change, tiers rise =================
  const sp = s0.sp;
  const path = await pathTo(page, [sp.x, sp.y], 'center');
  check('a walkable path exists from the spawn to the centre', !!path && path.length > 50, String(path && path.length));
  const zoneSeen = {};
  const tiers = {};
  let hudZones = new Set(); let miniBefore = await A(page, (a, w) => w.miniDraws());
  let maxChunks = 0; let builds = 0;
  const cam0 = await A(page, (a) => ({ x: a.camera.x, y: a.camera.y, W: a.W }));
  for (let i = 0; i < path.length; i += 12) {
    const r = await walk(page, path.slice(i, i + 12));
    maxChunks = Math.max(maxChunks, r.maxChunks); builds = r.builds; r.zonesSeen.forEach((z) => { zoneSeen[z] = 1; });
    hudZones.add(await A(page, (a, w) => w.hudText().zone));
    (await A(page, (a, w) => w.liveEnemies())).forEach((e) => { (tiers[e.zone] = tiers[e.zone] || []).push(e); });
  }
  const cam1 = await A(page, (a) => ({ x: a.camera.x, y: a.camera.y }));
  const camMoved = Math.hypot(cam1.x - cam0.x, cam1.y - cam0.y);
  check('walking moves the camera across >= 3 screens', camMoved >= 3 * cam0.W, `${Math.round(camMoved)} px vs screen ${cam0.W}`);
  // ... and on across the island to the far shore (more chunks than the cache holds)
  const far = await A(page, (a, w) => { const W = w.world; const tx = W.w - 1 - W.spawnPoint.x; const ty = W.h - 1 - W.spawnPoint.y; return w.nearestFree(tx, ty, 30) || W.center; });
  const path2 = await A(page, (a, w, q) => {
    const W = w.world; const N = W.w; const prev = new Int32Array(N * W.h).fill(-1); const s = q.from[1] * N + q.from[0]; prev[s] = s; const queue = [s]; let goal = -1;
    for (let h = 0; h < queue.length; h++) { const c = queue[h]; const x = c % N; const y = (c / N) | 0; if (x === q.to.x && y === q.to.y) { goal = c; break; }
      [[1, 0], [-1, 0], [0, 1], [0, -1]].forEach(([dx, dy]) => { const nx = x + dx; const ny = y + dy; if (nx < 0 || ny < 0 || nx >= N || ny >= W.h) return; const n = ny * N + nx; if (prev[n] >= 0 || W.solid[n]) return; prev[n] = c; queue.push(n); }); }
    if (goal < 0) return null; const out = []; for (let c = goal; c !== s; c = prev[c]) out.push([c % N, (c / N) | 0]); return out.reverse();
  }, { from: path[path.length - 1], to: far });
  check('the far shore is reachable from the centre', !!path2 && path2.length > 40, String(path2 && path2.length));
  for (let i = 0; path2 && i < path2.length; i += 24) { const r = await walk(page, path2.slice(i, i + 24)); maxChunks = Math.max(maxChunks, r.maxChunks); builds = r.builds; }
  check('the chunk cache stays at or under its cap (24) while chunks are built and evicted', maxChunks <= 24 && builds > 24, JSON.stringify({ maxChunks, builds }));
  check('the walk crosses shore -> midlands -> highlands -> godlands', [0, 1, 2, 3].every((z) => zoneSeen[z]), JSON.stringify(Object.keys(zoneSeen)));
  hudZones = [...hudZones];
  check('the zone HUD updates as the zones change', hudZones.some((z) => /Midlands/.test(z)) && hudZones.some((z) => /Godlands|Highlands/.test(z)), JSON.stringify(hudZones));
  check('the minimap redraws as the player moves', (await A(page, (a, w) => w.miniDraws())) > miniBefore + 5);
  const tierOk = Object.keys(tiers).every((z) => tiers[z].every((e) => e.tier === Number(z)));
  const hpBy = (z) => Math.max(...(tiers[z] || [{ hp: 0 }]).map((e) => e.hp));
  check('enemies spawn by zone tier (tier = zone, deeper zones met on the way)', tierOk && Object.keys(tiers).length >= 3, JSON.stringify(Object.keys(tiers).map((z) => [z, tiers[z].length])));
  check('deeper zones have tougher enemies (hp and damage multipliers rise)', hpBy(2) > hpBy(0) && Math.max(...(tiers[2] || []).map((e) => e.dmg)) > 1, JSON.stringify([hpBy(0), hpBy(1), hpBy(2), hpBy(3)]));
  const cap = await A(page, (a, w) => w.liveCount());
  check('the live enemy count respects the 60 cap', cap <= 60, String(cap));
  // cull: go back to the spawn, far groups despawn
  const desp0 = await A(page, (a, w) => w.despawned());
  await A(page, (a, w) => { const s = w.world.spawnPoint; a.player.x = (s.x + 0.5) * 32; a.player.y = (s.y + 0.5) * 32; });
  await frames(page, 10);
  const cull = await A(page, (a, w) => ({ d: w.despawned(), far: w.liveEnemies().filter((e) => Math.hypot(e.x - a.player.x, e.y - a.player.y) > 1500 * 2.5 + 200).length, zones: [...new Set(w.liveEnemies().map((e) => e.zone))] }));
  check('far groups are culled (despawned) when the player leaves', cull.d > desp0 && cull.far === 0, JSON.stringify(cull));

  // ================= solid tiles block the player and enemies =================
  const wallCase = await A(page, (a, w) => {
    const W = w.world; const N = W.w;
    for (let y = 2; y < W.h - 2; y++) for (let x = 8; x < N - 8; x++) {
      const i = y * N + x;
      if (!W.solid[i] || W.terrain[i] === 0) continue; // a wall (cliff / ruin), not water
      let ok = true; for (let k = 1; k <= 7; k++) if (W.solid[i - k] || (k <= 6 && W.solid[i + k])) ok = false;
      if (W.solid[i + 7]) ok = false;
      if (ok) return { x, y };
    }
    return null;
  });
  check('found a one-tile wall with open ground on both sides', !!wallCase, JSON.stringify(wallCase));
  if (wallCase) {
    const blk = await A(page, (a, w, c) => {
      a.eBullets.forEach((b) => { b.active = false; });
      const wallL = c.x * 32; a.player.x = (c.x - 2 + 0.5) * 32; a.player.y = (c.y + 0.5) * 32;
      for (let i = 0; i < 30; i++) a._movePlayer(4, 0);
      const px = a.player.x;
      const e = a.spawnEnemy('ring', (c.x - 1 + 0.5) * 32, (c.y + 0.5) * 32); e.cd = 99;
      a.player.x = (c.x + 6 + 0.5) * 32;
      for (let i = 0; i < 40; i++) a._updateEnemies(0.05);
      const ex = e.x; e.active = false;
      const b = a._take(a.pBullets); b.active = true; b.x = wallL - 6; b.y = (c.y + 0.5) * 32; b.vx = 580; b.vy = 0; b.life = 1; b.dmg = 1;
      a._updateBullets(0.02);
      return { px, ex, wallL, bolt: b.active, shot: w.shotSolidAt(wallL + 5, b.y) };
    }, wallCase);
    check('a solid tile blocks the player', blk.px <= blk.wallL - 11 + 0.01, JSON.stringify(blk));
    check('a solid tile blocks enemies', blk.ex <= blk.wallL - 8 + 0.01, JSON.stringify(blk));
    check('a wall absorbs player bolts', blk.shot && blk.bolt === false, JSON.stringify(blk));
  }
  const water = await A(page, (a, w) => { const s = w.world.spawnPoint; for (let x = s.x; x >= 0; x--) if (w.world.terrain[s.y * w.world.w + x] === 0) return { blocks: w.solidAt((x + 0.5) * 32, (s.y + 0.5) * 32), shot: w.shotSolidAt((x + 0.5) * 32, (s.y + 0.5) * 32) }; return null; });
  check('deep water blocks walking but lets bolts fly over it', water && water.blocks && !water.shot, JSON.stringify(water));

  // ================= kills drop bags with rolled items =================
  await A(page, (a, w) => { const s = w.world.spawnPoint; a.player.x = (s.x + 0.5) * 32; a.player.y = (s.y + 0.5) * 32; w.setDropAll(true); a.bags.forEach((b) => { b.active = false; }); });
  await page.waitForFunction(() => window.__mm.world.liveCount() > 3, null, { timeout: 8000 });
  const drop = await A(page, (a, w) => {
    const sh0 = a.save.shards; const k0 = w.kills(); const before = w.lastDrops().length; let withItems = null; let n = 0;
    for (const le of w.liveEnemies()) {
      const e = w.enemyById(le.id); if (!e || !e.active) continue;
      e.x = a.player.x + 400; e.y = a.player.y; a._hitEnemy(e, 99999); n++;
      const d = w.lastDrops(); const last = d[d.length - 1];
      if (last && last.items.length) { withItems = last; break; }
    }
    const bags = a.bags.filter((b) => b.active).map((b) => ({ id: b.id, r: b.r }));
    return { n, kills: w.kills() - k0, drops: w.lastDrops().length - before, withItems, bags, shards: a.save.shards - sh0, alive: w.liveCount() };
  });
  check('kills are counted and every forced kill rolls a zone drop', drop.kills === drop.n && drop.drops === drop.n && drop.n > 0, JSON.stringify(drop));
  check('a rolled bag puts its items on the floor as loot bags (same ids / rarity)', !!drop.withItems && drop.withItems.items.every((it) => drop.bags.some((b) => b.id === it.id && b.r === it.r)), JSON.stringify(drop));
  check('rolled shards are banked', drop.shards > 0, JSON.stringify(drop));
  await A(page, (a, w) => w.setDropAll(false));
  const det = await page.evaluate(() => JSON.stringify(MMZones.rollDrop({ zone: 1, tier: 1 }, '12345:g7:3')) === JSON.stringify(MMZones.rollDrop({ zone: 1, tier: 1 }, '12345:g7:3')));
  check('zone drops are deterministic for a seed', det);
  // walk onto the bags: they are picked up into the backpack
  const pick = await A(page, async (a) => {
    const n0 = a.save.items.length; const bs = a.bags.filter((b) => b.active);
    for (const b of bs) { a.player.x = b.x; a.player.y = b.y; b.t = 1; for (let i = 0; i < 3; i++) await new Promise((r) => requestAnimationFrame(r)); }
    return { n0, n1: a.save.items.length, left: a.bags.filter((b) => b.active).length, had: bs.length };
  });
  check('walking onto the dropped bags picks the items up', pick.had > 0 && pick.n1 > pick.n0, JSON.stringify(pick));

  // ================= a boss site spawns a boss =================
  const bs = await A(page, (a, w) => w.bossSites()[0]);
  await A(page, (a, w, b) => { const f = w.nearestFree(b.x + 5, b.y, 6); a.player.x = (f.x + 0.5) * 32; a.player.y = (f.y + 0.5) * 32; a.enemies.forEach((e) => { e.active = false; }); }, bs);
  await page.waitForFunction(() => window.__mm.world.bossSites()[0].live, null, { timeout: 5000 }).catch(() => {});
  const boss = await A(page, (a, w) => { const e = w.bossEntity(0); return { site: w.bossSites()[0], name: e && e.bossName, hp: e && e.maxHp, tier: e && e.bossTier, type: e && e.type, bar: !document.getElementById('realm-boss').classList.contains('hidden'), barName: document.getElementById('realm-boss-name').textContent }; });
  check('walking near a ready boss site spawns its boss', boss.site.live && boss.type === 'boss' && boss.name === boss.site.name && boss.tier === boss.site.zone + 1, JSON.stringify(boss));
  check('the boss bar shows the site boss name', boss.bar && boss.barName.indexOf(boss.site.name) === 0, JSON.stringify(boss));
  check('boss hp scales with its zone (tougher than the arena Gloomheart)', boss.hp > 120, String(boss.hp));
  const bk = await A(page, (a, w) => { w.setDropAll(true); const e = w.bossEntity(0); e.invuln = 0; const k0 = a.save.kb.boss; a._hitEnemy(e, 99999); w.setDropAll(false); const d = w.lastDrops(); return { dead: !e.active, ready: w.bossSites()[0].ready, live: w.bossSites()[0].live, last: d[d.length - 1], kb: a.save.kb.boss - k0, banner: document.getElementById('realm-banner').textContent }; });
  check('killing the boss drops a boss bag and starts the site cooldown', bk.dead && !bk.ready && !bk.live && bk.last && bk.last.boss && bk.kb === 1 && /defeated/.test(bk.banner), JSON.stringify(bk));

  // ================= portal prompt -> dungeon -> back to the portal tile =================
  const portal = await A(page, (a, w) => w.portals()[0]);
  check('portal prompt is hidden away from portals', !(await vis(page, '#rw-portal')));
  await A(page, (a, w, q) => { a.player.x = q.x + 10; a.player.y = q.y; }, portal);
  await frames(page, 3);
  const BN = { warren: 'Warren', bramble: 'Bramble', meadow: 'Meadow', crypt: 'Crypt' }[portal.biome];
  check('standing on a portal shows the "Enter <Biome> dungeon" prompt button', !!BN && await vis(page, '#rw-portal') && (await page.textContent('#rw-portal')) === 'Enter ' + BN + ' dungeon' && await A(page, (a, w) => w.portalPrompt() === 0));
  const pb = await page.evaluate(() => { const r = document.getElementById('rw-portal').getBoundingClientRect(); return { w: r.width, h: r.height }; });
  check('the portal button is a >= 44 px touch target', pb.w >= 44 && pb.h >= 44, JSON.stringify(pb));
  await page.click('#rw-portal');
  await page.waitForURL(/mode=dungeon/, { timeout: 10000 });
  await page.waitForFunction(() => window.__mm && window.__mm.dungeon && window.__mm.arena.active, null, { timeout: 15000 });
  const dg = await page.evaluate(() => ({ url: location.href, seed: window.__mm.dungeon.seed, leave: document.getElementById('realm-leave-btn').textContent + ' | ' + document.getElementById('realm-leave-btn').getAttribute('aria-label'), save: JSON.parse(localStorage.getItem('pixeltown-realm-v1')) }));
  const ret = new URL(dg.url).searchParams.get('return');
  check('entering the portal starts a dungeon run of the portal biome with a seed derived from (world seed, portal)', /mode=dungeon/.test(dg.url) && new URL(dg.url).searchParams.get('biome') === portal.biome && /^\d{1,5}$/.test(dg.seed) && ret === `index.html?mode=world&seed=12345&at=${portal.tx},${portal.ty}&test=1`, JSON.stringify(dg));
  check('the world position and seed were saved before leaving', dg.save.seed === '12345' && dg.save.pos.x === portal.tx && dg.save.pos.y === portal.ty && dg.save.returnTo && dg.save.returnTo.x === portal.tx && dg.save.stats.portals === 1, JSON.stringify(dg.save));
  check('the dungeon Leave button goes back to the world', /world/.test(dg.leave), dg.leave);
  await page.evaluate(() => window.__mm.dungeon.finish());
  await page.waitForSelector('#mm-sum-home');
  const home = await page.getAttribute('#mm-sum-home', 'href');
  check('the dungeon summary links back to the world at the portal tile', home === ret && (await page.textContent('#mm-sum-home')) === 'Back to the world', home);
  await page.click('#mm-sum-home');
  await page.waitForURL(/mode=world/, { timeout: 10000 }); await waitWorld(page);
  const back = await A(page, (a, w) => ({ t: [Math.floor(a.player.x / 32), Math.floor(a.player.y / 32)], iframes: a.player.iframes, prompt: w.portalPrompt(), seed: w.seed, rt: w.save().returnTo }));
  await frames(page, 3);
  check('exiting returns to the world on the portal tile (same seed)', back.t[0] === portal.tx && back.t[1] === portal.ty && back.seed === '12345', JSON.stringify(back));
  check('back on the portal: the prompt shows again, returnTo is cleared', await vis(page, '#rw-portal') && back.rt === null, JSON.stringify(back));
  // a forged return param is ignored by the dungeon page
  await page.goto(PAGE + '?mode=dungeon&seed=5&test=1&return=' + encodeURIComponent('https://evil.example/x'));
  await page.waitForFunction(() => window.__mm && window.__mm.dungeon);
  check('a foreign ?return= is rejected (Leave keeps its normal label)', !/world/.test(await page.textContent('#realm-leave-btn')));

  // ================= death -> menu -> restart respawns at the spawn =================
  await page.goto(WORLD); await waitWorld(page);
  await A(page, (a, w) => { const sp = w.world.spawnPoint; const f = w.nearestFree(sp.x + 12, sp.y - 12, 10); a.player.x = (f.x + 0.5) * 32; a.player.y = (f.y + 0.5) * 32; a.player.iframes = 0; a.shield.hits = 0; a._hitPlayer(99999); });
  check('dying ends the run (state dead)', await A(page, (a) => a.state === 'dead'));
  await page.waitForSelector('#realm-death:not(.hidden)', { timeout: 6000 });
  check('the death screen (menu) shows Try again', await vis(page, '#realm-death') && /Try again/.test(await page.textContent('#realm-death')));
  await page.click('#realm-death button[data-d="again"]');
  await frames(page, 5);
  const rs = await A(page, (a, w) => ({ t: [Math.floor(a.player.x / 32), Math.floor(a.player.y / 32)], sp: w.world.spawnPoint, state: a.state, mode: a.mode, wave: a.run.wave, hp: a.player.hp, max: a.stats.maxHp, seed: w.seed }));
  check('Try again respawns at the spawn point, full hp, same world, no waves', rs.t[0] === rs.sp.x && rs.t[1] === rs.sp.y && rs.state === 'play' && rs.mode === 'world' && rs.wave === 0 && rs.hp === rs.max && rs.seed === '12345', JSON.stringify(rs));
  await page.waitForFunction(() => window.__mm.world.liveCount() > 0, null, { timeout: 8000 }).catch(() => {});
  check('enemies come back after the restart', await A(page, (a, w) => w.liveCount() > 0));
  await A(page, (a) => { a.player.x += 64; a.setMenu(true); });
  await page.click('#realm-pause button[data-m="restart"]'); await page.click('#realm-pause button[data-m="restart-yes"]');
  check('menu Restart also respawns at the spawn point', await A(page, (a, w) => Math.floor(a.player.x / 32) === w.world.spawnPoint.x && a.state === 'play' && a.panel === null));

  // ================= saves =================
  const sv = await page.evaluate((k) => ({ realm: JSON.parse(localStorage.getItem(k)), main: JSON.parse(localStorage.getItem('pixeltown-save-v1')) }), RKEY);
  check('pixeltown-realm-v1 holds {v:1, seed, version, pos, stats}', sv.realm.v === 1 && sv.realm.seed === '12345' && sv.realm.version >= 1 && Number.isInteger(sv.realm.pos.x) && sv.realm.stats.kills > 0, JSON.stringify(sv.realm));
  check('pixeltown-save-v1 keeps its shape (realm only, no world keys added)', Object.keys(sv.main).join() === 'realm' && sv.main.realm.level >= 4 && !('seed' in sv.main.realm) && !('pos' in sv.main.realm), JSON.stringify(Object.keys(sv.main.realm)));
  const offPage = ORIGIN + '/game/games/mad-maze/lantern.css'; // leave the world page first: its pagehide save would overwrite what we plant
  await page.goto(offPage); await page.evaluate((k) => localStorage.setItem(k, '{not json'), RKEY);
  await page.goto(PAGE + '?mode=world&test=1'); await waitWorld(page);
  const cor = await page.evaluate((k) => ({ seed: window.__mm.world.seed, raw: JSON.parse(localStorage.getItem(k)) }), RKEY);
  check('a corrupt pixeltown-realm-v1 recovers (fresh valid save, new seed, page plays)', /^\d{1,10}$/.test(cor.seed) && cor.seed !== '12345' && cor.raw.v === 1 && cor.raw.seed === cor.seed, JSON.stringify(cor));
  await page.goto(offPage); await page.evaluate((k) => localStorage.setItem(k, JSON.stringify([1, 2, 3])), RKEY);
  await page.goto(PAGE + '?world=1&test=1'); await waitWorld(page);
  check('?world=1 also opens the world, and an array save recovers too', await page.evaluate(() => window.__mm.arena.mode === 'world' && /^\d+$/.test(window.__mm.world.seed)));
  await page.goto(offPage);
  const kept = await page.evaluate((k) => { localStorage.setItem(k, JSON.stringify({ v: 1, seed: 'abc', version: 1, pos: { x: 3, y: 4 }, future: { a: 1 }, stats: { kills: 'x' } })); return { future: JSON.parse(localStorage.getItem(k)).future }; }, RKEY);
  const cleaned = await page.goto(PAGE + '?mode=world&test=1').then(() => waitWorld(page)).then(() => page.evaluate(() => RealmWorld.cleanSave(JSON.stringify({ v: 1, seed: 'abc', version: 1, pos: { x: 3, y: 4 }, future: { a: 1 }, stats: { kills: 'x' }, returnTo: { x: -1 } }))));
  check('cleanSave keeps unknown future keys and sanitises bad fields', kept.future.a === 1 && cleaned.future && cleaned.future.a === 1 && cleaned.stats.kills === 0 && cleaned.seed === 'abc' && cleaned.returnTo === null, JSON.stringify(cleaned));
  const reused = await page.evaluate((k) => ({ seed: window.__mm.world.seed, raw: JSON.parse(localStorage.getItem(k)) }), RKEY);
  check('the saved seed is reused when no ?seed is given (and unknown keys survive a write)', reused.seed === 'abc' && reused.raw.future && reused.raw.future.a === 1, JSON.stringify(reused));

  // ================= seed params =================
  await page.goto(PAGE + '?mode=world&test=1&seed=99999999999999'); await waitWorld(page);
  check('a huge numeric seed is clamped to int32', (await page.evaluate(() => window.__mm.world.seed)) === '2147483647');
  await page.goto(PAGE + '?mode=world&test=1&seed=' + encodeURIComponent('<img src=x>')); await waitWorld(page);
  const bs2 = await page.evaluate(() => window.__mm.world.seed);
  check('a malformed seed param is ignored (falls back to the saved seed)', bs2 === '2147483647', bs2);
  await page.goto(PAGE + '?mode=world&test=1&seed=12345&at=99999,5'); await waitWorld(page);
  check('a bad ?at= is ignored (spawn point instead)', await A(page, (a, w) => Math.floor(a.player.x / 32) === w.world.spawnPoint.x));
  errs.push(...P.errors); bads.push(...P.bad); await P.ctx.close();

  // ================= no ?mode: the old page =================
  const O = await context(browser);
  await O.page.goto(PAGE + '?test=1&offline=1');
  await O.page.waitForFunction(() => window.__mm && window.__mm.arena && window.__mm.arena.run.wave >= 1, null, { timeout: 8000 });
  const old = await O.page.evaluate(() => ({ world: window.__mm.world, aw: window.__mm.arena.world, mode: window.__mm.arena.mode, mini: !!document.getElementById('rw-minimap'), portal: !!document.getElementById('rw-portal'), realmKey: localStorage.getItem('pixeltown-realm-v1'), kill: window.__mm.arena.onEnemyKilled }));
  check('?mode absent: the classic arena (waves, no world, no world HUD, no realm save written)', old.world === null && old.aw === null && old.mode === 'waves' && !old.mini && !old.portal && old.realmKey === null && old.kill === null, JSON.stringify(old));
  errs.push(...O.errors); bads.push(...O.bad); await O.ctx.close();

  // ================= phone 390x844 =================
  const PH = await context(browser, { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  await PH.page.goto(WORLD); await waitWorld(PH.page);
  await PH.page.waitForTimeout(800);
  const lay = await PH.page.evaluate(() => {
    const r = (id) => { const e = document.getElementById(id); const b = e.getBoundingClientRect(); return { l: b.left, t: b.top, r: b.right, b: b.bottom }; };
    return { mini: r('rw-minimap'), zone: r('rw-zone'), aim: r('realm-aim-btn'), hud: r('realm-hud'), xp: r('realm-xp'), vw: innerWidth, vh: innerHeight, scroll: document.documentElement.scrollWidth, W: window.__mm.arena.W, H: window.__mm.arena.H };
  });
  const inside = (b) => b.l >= 0 && b.t >= 0 && b.r <= lay.vw && b.b <= lay.vh;
  const overlap = (a, b) => a.l < b.r && b.l < a.r && a.t < b.b && b.t < a.b;
  check('phone: minimap and zone label sit inside the screen, clear of the HUD and the aim toggle', inside(lay.mini) && inside(lay.zone) && !overlap(lay.mini, lay.aim) && !overlap(lay.mini, lay.hud) && !overlap(lay.zone, lay.xp), JSON.stringify(lay));
  check('phone: no horizontal scroll, portrait world view', lay.scroll <= lay.vw && lay.W === 540 && lay.H > lay.W, JSON.stringify(lay));
  await PH.page.tap('#rw-minimap');
  check('phone: tapping the minimap enlarges it', await PH.page.evaluate(() => document.getElementById('rw-minimap').classList.contains('big') && document.getElementById('rw-minimap').getBoundingClientRect().width >= 190));
  await PH.page.tap('#rw-minimap');
  const q = await A(PH.page, (a, w) => w.portals()[1]);
  await A(PH.page, (a, w, p) => { a.player.x = p.x; a.player.y = p.y; }, q);
  await frames(PH.page, 3);
  const pr = await PH.page.evaluate(() => { const b = document.getElementById('rw-portal').getBoundingClientRect(); const m = document.getElementById('realm-stick-move').getBoundingClientRect(); const s = document.getElementById('realm-stick-aim').getBoundingClientRect(); return { b: { l: b.left, r: b.right, t: b.top, bb: b.bottom }, m: { r: m.right, t: m.top }, s: { l: s.left, t: s.top }, vw: innerWidth }; });
  check('phone: the portal button shows, on screen, above the sticks', await vis(PH.page, '#rw-portal') && pr.b.l >= 0 && pr.b.r <= pr.vw && pr.b.bb <= Math.min(pr.m.t, pr.s.t) + 1, JSON.stringify(pr));
  errs.push(...PH.errors); bads.push(...PH.bad); await PH.ctx.close();

  check('no failed requests (404s)', bads.length === 0, bads.join(' | '));
  check('no console errors', errs.length === 0, errs.join(' | '));
  await browser.close();
  done();
})();
