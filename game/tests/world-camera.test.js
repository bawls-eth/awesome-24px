// Slice 4: RealmArena.setWorld (a world larger than the screen + a camera that follows the player) on the standalone Mad Maze page.
// Checks: null world = today's behaviour; camera follows, clamps, integer-snaps, snaps under reduced motion; mouse aim maps screen -> world
// through the camera; the right stick aims by direction; player / bullets use world bounds; enemies still target the player; phone 390x844.
// Run: BASE=http://localhost:8501/game/index.html NODE_PATH=$(npm root -g) node game/tests/world-camera.test.js
const { chromium } = require('playwright');
const { check, done } = require('./helpers');
const ORIGIN = (process.env.BASE || 'http://localhost:8440/game/index.html').replace(/\/game\/index\.html.*$/, '');
const MAZE = ORIGIN + '/game/games/mad-maze/index.html?test=1&offline=1';
const SAVE = { realm: { level: 3, xp: 0, shards: 10, bestWave: 1, items: [], nextUid: 1, eq: {} } };

async function open(browser, opts) {
  const ctx = await browser.newContext(opts || { viewport: { width: 1000, height: 700 } });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  await page.goto(ORIGIN + '/game/games/mad-maze/lantern.css');
  await page.evaluate((v) => { localStorage.clear(); localStorage.setItem('pixeltown-save-v1', v); localStorage.setItem('mm-aim-assist', '0'); }, JSON.stringify(SAVE));
  errors.length = 0;
  await page.goto(MAZE);
  await page.waitForFunction(() => window.__mm && window.__mm.arena && window.__mm.arena.active);
  return { ctx, page, errors };
}
const A = (page, fn, arg) => page.evaluate(`(${fn.toString()})(window.__mm.arena, ${JSON.stringify(arg)})`);
const frames = (page, n) => page.evaluate((k) => new Promise((res) => { let i = 0; const f = () => (++i >= k ? res() : requestAnimationFrame(f)); requestAnimationFrame(f); }), n);
// a quiet world: no waves, no enemies, no bullets, the player cannot die
const quiet = (page, w) => A(page, (a, w) => {
  a.setMode('world'); a.state = 'play'; a._hideBanner();
  [a.enemies, a.eBullets, a.pBullets, a.bags, a.drifters, a.hazards].forEach((p) => p.forEach((o) => { o.active = false; }));
  a.player.iframes = 9999; a._hitPlayer = () => {};
  return a.setWorld(w) && true;
}, w);

(async () => {
  const browser = await chromium.launch();
  const errs = [];
  const P = await open(browser); const page = P.page;

  // ---------- null world: identical to before ----------
  const base = await A(page, (a) => ({ world: a.world, mode: a.mode, cam: { ...a.camera }, W: a.W, H: a.H, hooks: [a.onEnemyKilled, a.onEnemyHit, a._solidAt] }));
  check('default: world is null, mode waves, hooks null', base.world === null && base.mode === 'waves' && base.hooks.every((h) => h === null), JSON.stringify(base));
  check('default: camera is (0,0) with the view size', base.cam.x === 0 && base.cam.y === 0 && base.cam.vw === base.W && base.cam.vh === base.H, JSON.stringify(base));
  const aim0 = await A(page, (a) => { a.mouse.seen = true; a.mouse.x = a.player.x + 100; a.mouse.y = a.player.y + 100; a._updatePlayer(0.016); return a.player.aim; });
  check('default: mouse aim is plain screen math (atan2 of the pointer offset)', Math.abs(aim0 - Math.PI / 4) < 1e-9, String(aim0));
  check('default: the waves still run (wave >= 1)', await page.waitForFunction(() => window.__mm.arena.run.wave >= 1, null, { timeout: 6000 }).then(() => true).catch(() => false));
  check('default: the player is clamped to the screen', await A(page, (a) => { a.player.x = 99999; a._movePlayer(1, 0); return a.player.x === a.W - 11; }));

  // ---------- setWorld + follow ----------
  await quiet(page, { w: 4000, h: 3000, tile: 32, camera: true });
  const w = await A(page, (a) => ({ world: { w: a.world.w, h: a.world.h, tile: a.world.tile, frozen: Object.isFrozen(a.world) }, mode: a.mode }));
  check('setWorld exposes a frozen world {w,h,tile} and setMode("world")', w.world.w === 4000 && w.world.h === 3000 && w.world.tile === 32 && w.world.frozen && w.mode === 'world', JSON.stringify(w));
  await A(page, (a) => { a.player.x = 2000; a.player.y = 1500; a._camStep(-1); });
  await frames(page, 4);
  const c1 = await A(page, (a) => ({ x: a.camera.x, y: a.camera.y, vw: a.camera.vw, vh: a.camera.vh, W: a.W, H: a.H }));
  check('camera centres on the player', Math.abs(c1.x - (2000 - c1.W / 2)) <= 1 && Math.abs(c1.y - (1500 - c1.H / 2)) <= 1, JSON.stringify(c1));
  check('camera is integer-snapped and reports the view size', Number.isInteger(c1.x) && Number.isInteger(c1.y) && c1.vw === c1.W && c1.vh === c1.H, JSON.stringify(c1));
  await page.keyboard.down('d'); await page.waitForTimeout(700); await page.keyboard.up('d');
  const c2 = await A(page, (a) => ({ x: a.camera.x, px: a.player.x, cf: a._camF.x }));
  check('walking right moves the player and the camera follows', c2.px > 2100 && c2.x > c1.x + 80, JSON.stringify([c1, c2]));
  await frames(page, 40);
  const c3 = await A(page, (a) => ({ x: a.camera.x, px: a.player.x, W: a.W }));
  check('camera settles on the player again (smoothed follow)', Math.abs(c3.x - Math.round(c3.px - c3.W / 2)) <= 2, JSON.stringify(c3));
  const smooth = await A(page, (a) => { a._readReduced(); if (a._reduced) return 'reduced'; a.player.x = 2600; const before = a.camera.x; a._camStep(0.016); return { before, after: a.camera.x, target: Math.round(a.player.x - a.W / 2) }; });
  check('one step moves the camera part of the way (not a jump)', smooth !== 'reduced' && smooth.after > smooth.before && smooth.after < smooth.target, JSON.stringify(smooth));
  await A(page, (a) => a.setReduceMotion(true));
  const snap = await A(page, (a) => { a.player.x = 1200; a.player.y = 900; a._camStep(0.016); return { x: a.camera.x, y: a.camera.y, tx: Math.round(1200 - a.W / 2), ty: Math.round(900 - a.H / 2) }; });
  check('reduced motion: the camera snaps (no smoothing)', snap.x === snap.tx && snap.y === snap.ty, JSON.stringify(snap));
  await A(page, (a) => a.setReduceMotion(false));

  // ---------- clamping ----------
  const cl = await A(page, (a) => {
    a.player.x = 20; a.player.y = 20; a._camStep(-1); const lo = { x: a.camera.x, y: a.camera.y };
    a.player.x = 3990; a.player.y = 2990; a._camStep(-1); const hi = { x: a.camera.x, y: a.camera.y };
    return { lo, hi, mx: 4000 - a.W, my: 3000 - a.H };
  });
  check('camera clamps to the world edges (top-left)', cl.lo.x === 0 && cl.lo.y === 0, JSON.stringify(cl));
  check('camera clamps to the world edges (bottom-right)', cl.hi.x === cl.mx && cl.hi.y === cl.my, JSON.stringify(cl));
  const pc = await A(page, (a) => { a.player.x = 3985; a.player.y = 1500; a._movePlayer(50, 0); const r = a.player.x; a.player.x = 5; a._movePlayer(-50, 0); return { r, l: a.player.x, W: a.W }; });
  check('player clamps to the world bounds (not the screen)', pc.r === 4000 - 11 && pc.l === 11 && pc.r > pc.W, JSON.stringify(pc));

  // ---------- aim with an offset camera ----------
  await A(page, (a) => { a.player.x = 2000; a.player.y = 1500; a._camStep(-1); a.setAimStick(0, 0, false); });
  await frames(page, 2);
  const toClient = (wx, wy) => A(page, (a, q) => { const r = a.canvas.getBoundingClientRect(); return { x: r.left + (q[0] - a.camera.x) / a.W * r.width, y: r.top + (q[1] - a.camera.y) / a.H * r.height, cam: [a.camera.x, a.camera.y] }; }, [wx, wy]);
  let cp = await toClient(2150, 1500);
  await page.mouse.move(cp.x, cp.y); await frames(page, 2);
  const aR = await A(page, (a) => a.player.aim);
  check('mouse: pointing right of the player aims right with the camera offset', Math.abs(aR) < 0.03 && cp.cam[0] > 1000, JSON.stringify([aR, cp]));
  cp = await toClient(2000, 1350);
  await page.mouse.move(cp.x, cp.y); await frames(page, 2);
  const aU = await A(page, (a) => a.player.aim);
  check('mouse: pointing above the player aims up', Math.abs(aU + Math.PI / 2) < 0.03, String(aU));
  cp = await toClient(1900, 1600);
  await page.mouse.move(cp.x, cp.y);
  await page.mouse.down(); await page.waitForTimeout(250); await page.mouse.up();
  const shots = await A(page, (a) => a.pBullets.filter((b) => b.active).map((b) => ({ x: b.x, y: b.y, vx: b.vx, vy: b.vy })));
  const dirOk = shots.length > 0 && shots.every((b) => Math.abs(Math.atan2(b.vy, b.vx) - Math.atan2(100, -100)) < 0.05);
  check('mouse: bolts fly toward the pointed world point (down-left)', dirOk, JSON.stringify(shots.slice(0, 3)));
  check('bolts far outside the screen rect stay alive inside the world', shots.some((b) => b.x > 1000), JSON.stringify(shots.slice(0, 2)));
  await page.waitForTimeout(1100);
  check('bolts despawn at their range', await A(page, (a) => a.pBullets.every((b) => !b.active)));
  await page.mouse.move(5, 5);
  await A(page, (a) => { a.mouse.seen = false; a.setAimStick(0, 1, true); });
  await page.waitForTimeout(250);
  const st = await A(page, (a) => ({ aim: a.player.aim, b: a.pBullets.filter((b) => b.active).map((b) => [b.vx, b.vy]) }));
  await A(page, (a) => a.setAimStick(0, 0, false));
  check('stick: aiming down fires straight down regardless of the camera', Math.abs(st.aim - Math.PI / 2) < 1e-6 && st.b.length > 0 && st.b.every((v) => Math.abs(v[0]) < 1e-6 && v[1] > 0), JSON.stringify(st));
  const conv = await A(page, (a) => { const s = a.worldToScreen(2100, 1450); const w2 = a.screenToWorld(s.x, s.y); return { s, w2, cam: [a.camera.x, a.camera.y] }; });
  check('worldToScreen / screenToWorld round-trip through the camera', conv.w2.x === 2100 && conv.w2.y === 1450 && conv.s.x === 2100 - conv.cam[0], JSON.stringify(conv));

  // ---------- enemies: targeting + sleeping far away ----------
  const en = await A(page, (a) => { a.player.iframes = 9999; const e = a.spawnEnemy('aimed', 2250, 1500); e.cd = 0.05; const far = a.spawnEnemy('ring', 3800, 200); far.cd = 0.05; return { ok: !!e && !!far }; });
  await page.waitForTimeout(500);
  const eb = await A(page, (a) => ({ list: a.eBullets.filter((b) => b.active).map((b) => ({ x: b.x, y: b.y, vx: b.vx })), far: a.enemies.find((e) => e.active && e.type === 'ring') }));
  check('an awake enemy near the player fires at the player (bullets head left toward it)', en.ok && eb.list.length > 0 && eb.list.filter((b) => b.x > 2000).every((b) => b.vx < 0), JSON.stringify(eb.list.slice(0, 3)));
  check('an enemy far outside the view sleeps (no ring fired near it)', eb.list.every((b) => Math.hypot(b.x - 3800, b.y - 200) > 300) && eb.far && eb.far.x === 3800, JSON.stringify(eb.far && [eb.far.x, eb.far.y]));
  await A(page, (a) => { a.enemies.forEach((e) => { e.active = false; }); a.eBullets.forEach((b) => { b.active = false; }); });

  // ---------- tile collision hook ----------
  const col = await A(page, (a) => {
    a.setWorld({ w: 4000, h: 3000, tile: 32, solidAt: (x, y) => x >= 2048 && x < 2080 });
    a.player.x = 2000; a.player.y = 1500; for (let i = 0; i < 20; i++) a._movePlayer(5, 0);
    const px = a.player.x;
    const e = a.spawnEnemy('ring', 2020, 1400); e.cd = 99; a.player.x = 2300; a.player.y = 1400; a._updateEnemies(0.5); a._updateEnemies(0.5);
    return { px, ex: e.x, wall: a.isWallAt(2050, 10) };
  });
  check('solidAt blocks the player at the tile edge', col.px <= 2048 - 11 + 0.01 && col.px > 2000, JSON.stringify(col));
  check('solidAt blocks enemies too', col.ex <= 2048 - 8 + 0.01 && col.wall, JSON.stringify(col));

  // ---------- per-frame allocation: no canvas per frame ----------
  const cv = await page.evaluate(async () => {
    const orig = document.createElement.bind(document); let n = 0;
    document.createElement = (t, o) => { if (String(t).toLowerCase() === 'canvas') n++; return orig(t, o); };
    await new Promise((res) => { let i = 0; const f = () => (++i >= 60 ? res() : requestAnimationFrame(f)); requestAnimationFrame(f); });
    document.createElement = orig; return n;
  });
  check('no canvas is created per frame with a world set', cv === 0, String(cv));

  // ---------- setWorld(null) restores the screen-sized arena ----------
  const off = await A(page, (a) => { a.setWorld(null); a.setMode('waves'); a._resize(true); return { world: a.world, cam: [a.camera.x, a.camera.y], px: a.player.x, W: a.W, solid: a._solidAt }; });
  check('setWorld(null): no world, camera (0,0), player back on screen, no collider', off.world === null && off.cam[0] === 0 && off.cam[1] === 0 && off.px <= off.W - 11 && off.solid === null, JSON.stringify(off));
  errs.push(...P.errors); await P.ctx.close();

  // ---------- phone 390x844 ----------
  const ph = await open(browser, { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  await quiet(ph.page, { w: 8192, h: 8192, tile: 32 });
  await A(ph.page, (a) => { a.player.x = 4000; a.player.y = 4000; a._camStep(-1); });
  await ph.page.waitForTimeout(300);
  const pc2 = await A(ph.page, (a) => ({ cam: { ...a.camera }, W: a.W, H: a.H, p: [a.player.x, a.player.y] }));
  check('phone: portrait view (W 540 < H) and the camera centres the player', pc2.W === 540 && pc2.H > pc2.W && Math.abs(pc2.cam.x - (pc2.p[0] - pc2.W / 2)) <= 1 && Math.abs(pc2.cam.y - (pc2.p[1] - pc2.H / 2)) <= 1, JSON.stringify(pc2));
  const box = await ph.page.evaluate(() => { const r = document.getElementById('realm-stick-move').getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; });
  await ph.page.evaluate((b) => { const el = document.getElementById('realm-stick-move'); el.dispatchEvent(new PointerEvent('pointerdown', { pointerId: 7, clientX: b.x, clientY: b.y - 40, bubbles: true })); }, box);
  await ph.page.waitForTimeout(600);
  await ph.page.evaluate((b) => { const el = document.getElementById('realm-stick-move'); el.dispatchEvent(new PointerEvent('pointerup', { pointerId: 7, clientX: b.x, clientY: b.y, bubbles: true })); }, box);
  const pc3 = await A(ph.page, (a) => ({ cy: a.camera.y, py: a.player.y }));
  check('phone: the move stick walks up and the camera follows', pc3.py < 3900 && pc3.cy < pc2.cam.y - 50, JSON.stringify([pc2.cam, pc3]));
  check('phone: no horizontal scroll', await ph.page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth));
  errs.push(...ph.errors); await ph.ctx.close();

  check('no console errors', errs.length === 0, errs.join(' | '));
  await browser.close();
  done();
})();
