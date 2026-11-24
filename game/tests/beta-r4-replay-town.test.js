// Round 4 QA replays (D5) of the two round-3 Town performance fixes, by actual play (keyboard walk, E to enter the cave, Esc to leave).
//  S-07 (b13-r2-03, camera culling 458cc5f): while the hero WALKS across the island nothing a player could see is missing: every
//       visible object whose box touches the camera view is drawn by the camera, in every sample; most of the world is culled.
//       The pass runs every 4th frame: an object caught culled in view is INFO up to 8 rendered frames, longer than that fails.
//  S-08 (b13-r2-02, lazy three.js 5a1bffb): a Town session without the cave never requests three.js; walking onto the dig hole and
//       pressing E loads it once and shows the 3D cave; Esc returns to the Town at the hole; a second visit requests nothing; no
//       "three.min.js is deprecated" console warning.
// Proof run by D5: S-07 "most of the world is culled" and S-08 "no three.js before the cave" fail on the tree before round 3 (d267d0b).
// OFFLINE ONLY: blockDb + the Firebase SDK answered empty, "Play offline"; never chats, never writes to Firebase.
// Run: BASE=http://localhost:8440/game/index.html node game/tests/beta-r4-replay-town.test.js
const { chromium } = require('playwright');
const { check, done, blockDb } = require('./helpers');
const LS = require('./lib/load-scale');
const BASE = process.env.BASE || 'http://localhost:8440/game/index.html';
const THREE_RE = /three(\.module)?(\.min)?\.js|\/npm\/three@/;

// visible objects in the camera view that the camera filter hides (what a player would see missing)
const MISSING = () => {
  const t = window.__g.scene.getScene('Town'); const cam = t.cameras.main; const v = cam.worldView; const bad = [];
  t.sys.displayList.list.forEach((o, i) => {
    if (!(o.cameraFilter & cam.id) || !o.getBounds || !o.visible || !(o.alpha > 0.02)) return;
    const b = o.getBounds();
    if (b.right >= v.x && b.left <= v.right && b.bottom >= v.y && b.top <= v.bottom) bad.push(i + ':' + o.type + (o.texture ? ':' + o.texture.key : '') + '@' + Math.round(o.x) + ',' + Math.round(o.y));
  });
  return { bad, frame: window.__g.loop.frame, x: Math.round(t.localBody.x), y: Math.round(t.localBody.y), culled: t._culled | 0, total: t.sys.displayList.list.length };
};

(async () => {
  const browser = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const ctx = await browser.newContext({ viewport: { width: 1000, height: 700 } });
  const db = await blockDb(ctx);
  await ctx.route(/gstatic\.com\/firebasejs\//, (r) => r.fulfill({ status: 200, contentType: 'application/javascript', body: '/* firebase SDK blocked by beta-r4-replay-town */' }));
  await ctx.route('**/main.js*', async (route) => {
    try { const resp = await route.fetch(); const body = (await resp.text()).replace('const game = new Phaser.Game(config);', 'const game = window.__g = new Phaser.Game(config);'); await route.fulfill({ response: resp, body }); } catch (e) { /* page closed */ }
  });
  const page = await ctx.newPage();
  const errors = []; const warns = []; const three = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (/three(\.min)?\.js.*deprecated|deprecated.*three/i.test(m.text())) warns.push(m.text().slice(0, 120)); });
  page.on('request', (r) => { if (THREE_RE.test(r.url())) three.push(r.url()); });
  await page.goto(BASE);
  await page.fill('#name-input', 'ADMINr4town');
  await page.click('button:has-text("Join Town")'); // offline: the SDK is stubbed, so this only offers "Play offline"
  await page.waitForSelector('#join-offline-btn:not(.hidden)', { timeout: LS.budget(20000) });
  await page.click('#join-offline-btn');
  await page.waitForFunction(() => window.__g && window.__g.scene.getScene('Town') && window.__g.scene.getScene('Town').localBody, null, { timeout: LS.budget(30000) });
  await page.waitForTimeout(1500);
  await page.mouse.click(500, 350); // focus the game

  // ---------- S-07: walk and watch
  const s0 = await page.evaluate(MISSING);
  check('S-07 a. most of the world is outside the camera and culled at spawn (round 2: nothing was culled)', s0.culled > s0.total * 0.4, JSON.stringify({ culled: s0.culled, total: s0.total }));
  // The cull pass runs every 4th rendered frame, so an object that was just shown or moved into view may wait up to 4 frames. Longer
  // than MAX_FRAMES rendered frames (counted on the game loop, so a slow machine does not change the verdict) is a player-visible hole.
  const MAX_FRAMES = 8;
  const samples = []; let since = {}; const stuck = new Set(); const once = new Set();
  const sample = async () => { const s = await page.evaluate(MISSING); samples.push(s); const now = {}; for (const k of s.bad) { const id = k.split('@')[0]; once.add(id); now[id] = since[id] === undefined ? s.frame : since[id]; if (s.frame - now[id] > MAX_FRAMES) stuck.add(k + ' for ' + (s.frame - now[id]) + ' frames'); } since = now; return s; };
  const walk = async (key, ms) => { await page.keyboard.down(key); const t0 = Date.now(); while (Date.now() - t0 < ms) { await page.waitForTimeout(150); await sample(); } await page.keyboard.up(key); };
  const start = await sample();
  await walk('ArrowRight', 2500); await walk('ArrowDown', 2500); await walk('ArrowLeft', 2500); await walk('ArrowUp', 1500);
  const end = samples[samples.length - 1];
  const xs = samples.map((s) => s.x), ys = samples.map((s) => s.y);
  const span = (Math.max.apply(null, xs) - Math.min.apply(null, xs)) + (Math.max.apply(null, ys) - Math.min.apply(null, ys));
  check('S-07 b. the hero really walked with the arrow keys (the camera moved)', span > 150, JSON.stringify({ start: [start.x, start.y], end: [end.x, end.y], span }));
  // then cross the island the way a fast-travelling player does (three jumps), sampling after each
  for (const [x, y] of [[300, 300], [1800, 1000], [900, 1500]]) {
    await page.evaluate(([px, py]) => { window.__g.scene.getScene('Town').localBody.setPosition(px, py); }, [x, y]);
    for (let i = 0; i < 5; i++) { await page.waitForTimeout(150); await sample(); }
  }
  check('S-07 c. in ' + samples.length + ' samples no visible object in the camera view stayed culled for more than ' + MAX_FRAMES + ' rendered frames', stuck.size === 0, Array.from(stuck).slice(0, 6).join(' '));
  if (once.size) console.log('INFO S-07: visible objects caught culled in view within the ' + MAX_FRAMES + ' frame allowance (just shown / moved in between two cull passes): ' + Array.from(once).slice(0, 8).join(' '));
  const late = samples.slice(-3);
  check('S-07 d. culling keeps working after the walk (still most of the world culled)', late.every((s) => s.culled > s.total * 0.4), JSON.stringify(late.map((s) => s.culled + '/' + s.total)));

  // ---------- S-08: the cave by walking in
  check('S-08 a. a Town session before any cave visit requested no three.js', three.length === 0 && await page.evaluate(() => typeof THREE === 'undefined'), three.join(' | '));
  const hole = await page.evaluate(() => ({ x: DIG_HOLE_POS.x, y: DIG_HOLE_POS.y, r: DIG_HOLE_RADIUS }));
  await page.evaluate((h) => { window.__g.scene.getScene('Town').localBody.setPosition(h.x - h.r - 70, h.y); }, hole); // setup: stand a few steps left of the hole
  await page.waitForTimeout(300);
  await page.keyboard.down('ArrowRight');
  const near = await page.waitForFunction((h) => { const b = window.__g.scene.getScene('Town').localBody; return Math.hypot(b.x - h.x, b.y - h.y) < h.r - 8; }, hole, { timeout: LS.budget(8000), polling: 50 }).then(() => true).catch(() => false);
  await page.keyboard.up('ArrowRight');
  check('S-08 b. the hero walked onto the dig hole', near, JSON.stringify(await page.evaluate(() => { const b = window.__g.scene.getScene('Town').localBody; return [Math.round(b.x), Math.round(b.y)]; })));
  await page.keyboard.press('e');
  const inCave = await page.waitForFunction(() => { const t = window.__g.scene.getScene('Town'); return t.inUnderground && t.underground && !!document.querySelector('#underground-canvas-wrap canvas'); }, null, { timeout: LS.budget(30000) }).then(() => true).catch(() => false);
  check('S-08 c. pressing E on the hole opens the cave (three.js loaded on demand, once, as a module)', inCave && three.length === 1 && /three\.module/.test(three[0]), JSON.stringify(three));
  await page.waitForTimeout(800);
  const cave = await page.evaluate(() => { const c = document.querySelector('#underground-canvas-wrap canvas'); const r = c ? c.getBoundingClientRect() : null; return { w: r ? Math.round(r.width) : 0, h: r ? Math.round(r.height) : 0 }; });
  check('S-08 d. the cave view fills the screen', cave.w >= 600 && cave.h >= 400, JSON.stringify(cave));
  await page.keyboard.press('Escape');
  const out = await page.waitForFunction(() => !window.__g.scene.getScene('Town').inUnderground, null, { timeout: LS.budget(8000) }).then(() => true).catch(() => false);
  const back = await page.evaluate((h) => { const b = window.__g.scene.getScene('Town').localBody; return Math.round(Math.hypot(b.x - h.x, b.y - h.y)); }, hole);
  check('S-08 e. Esc returns to the Town, beside the hole', out && back < 200, 'distance ' + back);
  await page.waitForTimeout(400);
  await page.mouse.click(500, 350);
  // second visit: walk back onto the hole if the exit moved the hero off it, then E
  const again = await page.evaluate((h) => { const t = window.__g.scene.getScene('Town'); if (Math.hypot(t.localBody.x - h.x, t.localBody.y - h.y) >= h.r - 4) t.localBody.setPosition(h.x - 6, h.y); return true; }, hole);
  await page.waitForTimeout(200);
  await page.keyboard.press('e');
  const in2 = await page.waitForFunction(() => window.__g.scene.getScene('Town').inUnderground, null, { timeout: LS.budget(15000) }).then(() => true).catch(() => false);
  check('S-08 f. a second visit opens the cave again without another three.js request', again && in2 && three.length === 1, JSON.stringify(three));
  check('S-08 g. no three.js deprecation warning in the console', warns.length === 0, warns.join(' | '));
  check('no page errors', errors.length === 0, errors.join(' | '));
  check('no database traffic', db.attempts() === 0, String(db.attempts()));
  await ctx.close(); await browser.close();
  done();
})().catch((e) => { console.error(e); process.exit(1); });
