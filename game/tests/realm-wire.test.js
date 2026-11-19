// Realm wiring of the shared modules: spatial hash, gamepad, aim assist, sfx, reduce-motion.
// Runs on the standalone Mad Maze page (same realm.js, no Firebase). Serve the repo root first.
const { chromium } = require('playwright');
const { check, done } = require('./helpers');
const ORIGIN = (process.env.BASE || 'http://localhost:8440/game/index.html').replace(/\/game\/index\.html.*$/, '');
const URL = ORIGIN + '/game/games/mad-maze/index.html?test=1&offline=1';

async function open(browser, opts, reduced) {
  const ctx = await browser.newContext(opts);
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  if (reduced) await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto(URL);
  await page.waitForFunction(() => window.__mm && window.__mm.arena);
  await page.waitForTimeout(300);
  await page.evaluate(() => { window.freeze = () => { const r = window.__mm.arena; cancelAnimationFrame(r._raf); r.active = true; r.state = 'play'; r.run.wave = 1; r.player.hp = 1e6; r.player.iframes = 1e6; r.enemies.forEach((e) => { e.active = false; }); r.pBullets.forEach((b) => { b.active = false; }); r.eBullets.forEach((b) => { b.active = false; }); return r; }; });
  return { ctx, page, errors };
}

(async () => {
  const browser = await chromium.launch();
  const d = await open(browser, { viewport: { width: 1000, height: 700 } });
  const P = d.page;

  check('shared modules are defined', await P.evaluate(() => typeof MMHash === 'object' && typeof MMPad === 'object' && typeof MMAim === 'object' && typeof MMSfx === 'object' && typeof MMMotion === 'object'));
  const order = await P.evaluate(() => [...document.scripts].map((s) => s.src.split('/').pop()));
  check('script order: shared modules precede realm.js', ['mm-hash.js', 'mm-pad.js', 'mm-aim.js', 'sfx.js', 'motion.js'].every((n) => order.indexOf(n) >= 0 && order.indexOf(n) < order.indexOf('realm.js')), order.join(','));

  // gamepad: left stick moves, right stick aims and fires
  const g = await P.evaluate(() => {
    const r = freeze(); r.player.x = 400; r.player.y = 300;
    navigator.getGamepads = () => [{ connected: true, axes: [1, 0, 0, 0], buttons: [] }];
    const x0 = r.player.x; for (let i = 0; i < 10; i++) r._update(1 / 60);
    const moved = r.player.x - x0;
    navigator.getGamepads = () => [{ connected: true, axes: [0, 0, 0, 1], buttons: [] }];
    r.player.fireCd = 0; const before = r.pBullets.filter((b) => b.active).length;
    for (let i = 0; i < 3; i++) r._update(1 / 60);
    const after = r.pBullets.filter((b) => b.active).length;
    return { moved, after: after - before, aim: r.player.aim };
  });
  check('gamepad left stick moves the player right', g.moved > 10, JSON.stringify(g));
  check('gamepad right stick fires bolts', g.after > 0, JSON.stringify(g));
  check('gamepad right stick sets aim (down = pi/2)', Math.abs(g.aim - Math.PI / 2) < 0.01, String(g.aim));
  const ab = await P.evaluate(() => {
    const r = freeze(); r.save.level = 30; r.abilityCd = [0, 0, 0, 0]; r.player.x = 400; r.player.y = 300;
    navigator.getGamepads = () => [{ connected: true, axes: [0, 0, 0, 0], buttons: [{ pressed: true }] }];
    r._update(1 / 60); const cd1 = r.abilityCd[0]; r._update(1 / 60);
    const cd2 = r.abilityCd[0];
    navigator.getGamepads = () => [null];
    return { cd1, cd2 };
  });
  check('gamepad A button casts ability 0 once (edge)', ab.cd1 > 0 && ab.cd2 < ab.cd1, JSON.stringify(ab));
  check('no pad: keyboard still moves', await P.evaluate(() => { const r = freeze(); navigator.getGamepads = () => []; r.keys.d = true; const x = r.player.x; r._update(0.1); r.keys.d = false; return r.player.x > x; }));

  // aim assist
  const aim = (on, deg) => P.evaluate(([on, deg]) => {
    const r = freeze(); r.setAimAssist(on); navigator.getGamepads = () => [];
    r.player.x = 300; r.player.y = 300; r.player.fireCd = 1;
    const e = r.spawnEnemy('ring', 500, 300 + 200 * Math.tan(deg * Math.PI / 180)); e.cd = 99;
    r.setAimStick(1, 0, true); r._update(0.001); const a = r.player.aim; r.setAimStick(0, 0, false);
    return { a, target: Math.atan2(e.y - r.player.y, e.x - r.player.x) };
  }, [on, deg]);
  const on = await aim(true, 10);
  check('aim assist on: aim snaps to a target 10 degrees off', Math.abs(on.a - on.target) < 1e-6 && Math.abs(on.a) > 0.1, JSON.stringify(on));
  const off = await aim(false, 10);
  check('aim assist off (mm-aim-assist=0): aim stays on the stick', off.a === 0 && await P.evaluate(() => localStorage.getItem('mm-aim-assist') === '0'), JSON.stringify(off));
  const far = await aim(true, 20);
  check('aim assist ignores a target 20 degrees off', far.a === 0, JSON.stringify(far));
  check('toggle lives in its own key; realm save untouched', await P.evaluate(() => { const r = window.__mm.arena; r.setAimAssist(true); return localStorage.getItem('mm-aim-assist') === '1' && !('aimAssist' in r.save); }));

  // sfx via a fake MMSfx
  const sfx = await P.evaluate(() => {
    const r = freeze(); navigator.getGamepads = () => [];
    const log = []; r.sfx = { play: (n) => { log.push(n); return true; }, setMusic() {} };
    r.mouse.seen = true; r.mouse.x = 700; r.mouse.y = 300; r.mouse.down = true; r.player.x = 300; r.player.y = 300; r.player.fireCd = 0;
    r._update(1 / 60); r.mouse.down = false;
    const e = r.spawnEnemy('ring', 700, 500); e.hp = 100; e.maxHp = 100; r._hitEnemy(e, 1);
    r._hitEnemy(e, 1000);
    r.player.iframes = 0; r._hitPlayer(1);
    r.collectItem(RM_ITEMS[0].id, 0);
    r.save.level = 1; r.save.xp = 1e9; r._gainXp(1);
    return log;
  });
  ['shot', 'hit', 'kill', 'hurt', 'pickup', 'levelup'].forEach((n) => check('sfx "' + n + '" played on its event', sfx.includes(n), sfx.join(',')));
  const real = await open(browser, { viewport: { width: 800, height: 600 } });
  const pre = await real.page.evaluate(() => { const r = window.__mm.arena; r._snd('shot'); return r.sfx === null; });
  check('real MMSfx is not created before a user gesture', pre);
  await real.page.keyboard.press('x');
  const post = await real.page.evaluate(() => { const r = window.__mm.arena; r._snd('shot'); return !!r.sfx && r.sfx.musicOn === false; });
  check('after a gesture MMSfx exists and music is off', post);
  await real.ctx.close();

  // hash parity with brute force over a seeded scenario
  const par = await P.evaluate(() => {
    const r = freeze(); let s = 12345; const rnd = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
    const types = ['ring', 'aimed', 'spiral', 'boss'];
    for (let i = 0; i < 40; i++) { const e = r.spawnEnemy(types[i % 4], 40 + rnd() * (r.W - 80), 40 + rnd() * (r.H - 80)); if (e) e.cd = 99; }
    r._buildHash();
    let bad = 0, hits = 0; const N = 5000;
    for (let k = 0; k < N; k++) {
      const x = rnd() * r.W, y = rnd() * r.H; let want = -1;
      for (let j = 0; j < r.enemies.length; j++) { const e = r.enemies[j]; if (!e.active) continue; const rr = RM_ENEMIES[e.type].r + 5; if ((x - e.x) ** 2 + (y - e.y) ** 2 < rr * rr) { want = j; break; } }
      const got = r._boltHitIndex(x, y); if (got !== want) bad++; if (want >= 0) hits++;
    }
    return { bad, hits, N };
  });
  check('hash hit index equals brute force over 5000 seeded bolts', par.bad === 0 && par.hits > 50, JSON.stringify(par));
  const alloc = await P.evaluate(() => { const r = window.__mm.arena; const c = r._hash.size; r._buildHash(); r._buildHash(); return { n: r._hash.size, c }; });
  check('hash rebuilt in place (size stable across rebuilds)', alloc.n === alloc.c && alloc.n > 0, JSON.stringify(alloc));

  // frame budget with a full bolt storm
  const perf = await P.evaluate(() => {
    const r = freeze(); navigator.getGamepads = () => [];
    for (let i = 0; i < 12; i++) { const e = r.spawnEnemy('ring', 100 + i * 60, 200 + (i % 3) * 80); if (e) { e.cd = 99; e.hp = e.maxHp = 1e9; } }
    let tot = 0;
    for (let i = 0; i < 300; i++) {
      r.pBullets.forEach((b, k) => { if (!b.active) { b.active = true; b.x = 50 + (k * 37) % 800; b.y = 150 + (k * 53) % 300; b.vx = 100; b.vy = 20; b.life = 1; b.dmg = 0.001; } });
      const t = performance.now(); r._update(1 / 60); tot += performance.now() - t;
    }
    return tot / 300;
  });
  check('average update under 5 ms with all bolts live (' + perf.toFixed(3) + ' ms)', perf < 5, String(perf));
  check('no page errors', d.errors.length === 0, d.errors.join('|'));
  await d.ctx.close();

  // reduce motion
  const norm = await open(browser, { viewport: { width: 800, height: 600 } });
  const n = await norm.page.evaluate(() => { const r = window.__mm.arena; r.shake = 10; return { red: r._reduced, amt: r.shakeAmt() }; });
  check('normal motion: shake passes through', !n.red && n.amt === 10, JSON.stringify(n));
  await norm.ctx.close();
  const red = await open(browser, { viewport: { width: 800, height: 600 } }, true);
  const rd = await red.page.evaluate(() => { const r = window.__mm.arena; r.shake = 10; r.flash = 0.5; r._draw(); return { red: r._reduced, amt: r.shakeAmt() }; });
  check('reduced motion emulated: shake is 0', rd.red && rd.amt === 0, JSON.stringify(rd));
  check('no page errors (reduced)', red.errors.length === 0, red.errors.join('|'));
  await red.ctx.close();

  await browser.close();
  done();
})();
