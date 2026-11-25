// cyc6 G: Realm hit feedback stays readable (beta r3: b08 "tinted ground with leftover red dots", hit flash read magenta over water).
// 1. The hit vignette is a warm palette red: over Realm water its estimated colour has green >= blue (the old #ff2850 flash had
//    blue > green, i.e. magenta/purple), it still changes the screen edge clearly (visible), and it leaves the middle of the view (the
//    ground under the hero) untouched at 1280x720 AND 390x844 (the old radial gradient tinted most of a phone screen).
// 2. A slow enemy bullet (speed 135, the ring pattern) is drawn longer along its flight than across it (a motion trail) and carries a
//    bright white core, so a moving shot no longer reads as a red dot lying on the ground. Fast shots (230) get no trail.
// 3. flashes: false still paints nothing (access pref unchanged).
// Offline: WebSockets closed, town/hub pages stubbed, no chat, no DB writes (the Realm page here never loads Firebase).
// Run: BASE=http://localhost:9603/game/index.html NODE_PATH=$(npm root -g) node game/tests/cyc6-art-realm-hit-cue.test.js
const { chromium } = require('playwright');
const { check, done } = require('./helpers');
const ORIGIN = (process.env.BASE || 'http://localhost:8440/game/index.html').replace(/\/game\/index\.html.*$/, '');
const WORLD = ORIGIN + '/game/games/mad-maze/index.html?mode=world&test=1&seed=12345';
const MM = 'pixeltown-mm-v1', ACTIVE = 'pixeltown-mm-active-v1', ACC = 'pixeltown-access-v1';
const hero = (id, cls, level) => ({ id, name: cls, cls, level, xp: 0, fame: 0, bonus: 0, mode: 'classic', items: [] });
const prof = (heroes) => ({ v: 1, heroes, stash: new Array(16).fill(null), fame: 0, mode: 'classic', hall: [], migratedFrom: null });
const WATER = [52, 104, 150]; // a Realm water blue (sampled from the shore at 390x844)
// Over water: delta = a * (c - water); estimate the flash colour c for any plausible edge alpha 0.3..0.6 and demand a warm red (G >= B, R high).
const warm = (f) => !!f.w1 && [0.3, 0.4, 0.5, 0.6].every((al) => { const c = f.w1.map((v, i) => WATER[i] + (v - f.w0[i]) / al); return c[1] >= c[2] - 4 && c[0] > c[2] + 80; });

async function open(browser, viewport, query) {
  const ctx = await browser.newContext({ viewport });
  await ctx.route('**/game/index.html*', (r) => r.fulfill({ contentType: 'text/html', body: '<!doctype html><title>town</title>town' }));
  await ctx.route('**/hub/index.html*', (r) => r.fulfill({ contentType: 'text/html', body: '<!doctype html><title>hub</title>hub' }));
  await ctx.routeWebSocket(/.*/, (ws) => ws.close()); // never reach the live DB
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  await page.goto(ORIGIN + '/game/games/mad-maze/lantern.css');
  await page.evaluate(([k1, p, k2, a, k3]) => { localStorage.setItem(k1, JSON.stringify(p)); localStorage.setItem(k2, a); localStorage.removeItem(k3); localStorage.setItem('mm-reduce-motion', '0'); },
    [MM, prof([hero('h-r', 'ranger', 6)]), ACTIVE, JSON.stringify({ v: 1, heroId: 'h-r' }), ACC]);
  errors.length = 0;
  await page.goto(WORLD + (query || ''));
  await page.waitForFunction(() => window.__mm && window.__mm.arena && window.__mm.arena.active && window.__mm.arena.state === 'play', null, { timeout: 20000 });
  await page.evaluate(() => { const a = window.__mm.arena; a.active = false; cancelAnimationFrame(a._raf); a.paused = false; a.player.iframes = 1e9; a.refreshAccess(); a._readReduced();
    a.enemies.forEach((q) => { q.active = false; }); a.eBullets.forEach((b) => { b.active = false; }); a.shake = 0; a.flash = 0; });
  return { ctx, page, errors };
}

// Pixel probes in device pixels (the canvas backing store).
const FLASH = `(water) => {
  const a = window.__mm.arena; const c = a.canvas; const g = c.getContext('2d'); const W = c.width, H = c.height;
  const px = (x, y) => Array.from(g.getImageData(x, y, 1, 1).data).slice(0, 3);
  const probes = () => ({ left: px(2, H >> 1), top: px(W >> 1, 2), mid: px(W >> 1, H >> 1), q: px(W >> 1, Math.round(H * 0.3)) });
  a.shake = 0; a.flash = 0; a._draw(); const p0 = probes();
  a.flash = 1; a._draw(); const p1 = probes();
  // over flat water: the same flash drawn on a water-filled frame (screen space, as _draw leaves the transform)
  g.save(); g.setTransform(1, 0, 0, 1, 0, 0); g.fillStyle = 'rgb(' + water.join(',') + ')'; g.fillRect(0, 0, W, H); g.restore();
  const w0 = px(2, H >> 1);
  g.save(); g.setTransform(a.scale || 1, 0, 0, a.scale || 1, 0, 0); a.flash = 1; if (a._drawHitFlash) a._drawHitFlash(g); else { a._draw(); } g.restore();
  const w1 = a._drawHitFlash ? px(2, H >> 1) : null;
  a.flash = 0;
  return { W, H, p0, p1, w0, w1 };
}`;

const BULLET = `(speed) => {
  const a = window.__mm.arena; const c = a.canvas; const g = c.getContext('2d'); const W = c.width, H = c.height;
  a.eBullets.forEach((b) => { b.active = false; }); a.flash = 0; a.shake = 0;
  a._draw(); const img0 = g.getImageData(0, 0, W, H).data;
  const p = a.player; a.fireEnemyBullet(p.x + 70, p.y - 40, 0, speed, 2); // flying right (+x)
  a._draw(); const img1 = g.getImageData(0, 0, W, H).data;
  a.eBullets.forEach((b) => { b.active = false; });
  let x0 = 1e9, x1 = -1, y0 = 1e9, y1 = -1, white = 0, n = 0;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const i = (y * W + x) * 4;
    const d = Math.max(Math.abs(img1[i] - img0[i]), Math.abs(img1[i + 1] - img0[i + 1]), Math.abs(img1[i + 2] - img0[i + 2]));
    if (d > 24) { n++; if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; if (img1[i] > 235 && img1[i + 1] > 235 && img1[i + 2] > 235) white++; } }
  const s = W / (a._dv ? a._dv.vw : a.W);
  return { n, len: x1 - x0 + 1, wid: y1 - y0 + 1, white, s, whiteLogical: white / (s * s) };
}`;

(async () => {
  const browser = await chromium.launch();
  for (const vp of [{ width: 1280, height: 720 }, { width: 390, height: 844 }]) {
    const tag = vp.width + 'x' + vp.height;
    const O = await open(browser, vp); const page = O.page;
    const f = await page.evaluate(`(${FLASH})(${JSON.stringify(WATER)})`);
    const diff = (x, y) => Math.max(...x.map((v, i) => Math.abs(v - y[i])));
    check(tag + ': the hit flash changes the screen edge clearly (left and top edge both visible)', diff(f.p1.left, f.p0.left) > 30 && diff(f.p1.top, f.p0.top) > 30, JSON.stringify(f));
    check(tag + ': the ground under the hero is not tinted (centre and 30% height unchanged by the flash)', diff(f.p1.mid, f.p0.mid) <= 4 && diff(f.p1.q, f.p0.q) <= 6, JSON.stringify({ mid: [f.p0.mid, f.p1.mid], q: [f.p0.q, f.p1.q] }));
    // Over water: delta = a * (c - water); estimate c for any plausible edge alpha 0.3..0.6 and demand a warm red (G >= B, R high).
    const ok = warm(f);
    check(tag + ': over blue water the flash is visible (> 40 levels) and a warm red, not magenta/purple (estimated flash G >= B)', !!f.w1 && diff(f.w1, f.w0) > 40 && ok, JSON.stringify({ w0: f.w0, w1: f.w1 }));
    const slow = await page.evaluate(`(${BULLET})(135)`);
    const fast = await page.evaluate(`(${BULLET})(230)`);
    check(tag + ': a slow enemy bullet has a motion trail (drawn at least 1.5x longer along its flight than across it)', slow.n > 0 && slow.len >= 1.5 * slow.wid, JSON.stringify(slow));
    check(tag + ': a slow enemy bullet has a bright white core (>= 12 logical px of near-white)', slow.whiteLogical >= 12, JSON.stringify(slow));
    check(tag + ': a fast enemy bullet keeps a round shape (no trail)', fast.n > 0 && fast.len <= 1.25 * fast.wid, JSON.stringify(fast));
    // flashes: false paints nothing
    const off = await page.evaluate((k) => {
      const a = window.__mm.arena; const g = a.canvas.getContext('2d'); const px = () => Array.from(g.getImageData(2, a.canvas.height >> 1, 1, 1).data).slice(0, 3);
      a.flash = 0; a._draw(); const p0 = px();
      localStorage.setItem(k, JSON.stringify({ v: 1, palette: 'normal', hudScale: 1, flashes: false, bulletOutline: true, lowGfx: false })); a.refreshAccess();
      a.flash = 1; a._draw(); const p1 = px(); a.flash = 0; localStorage.removeItem(k); a.refreshAccess(); return { p0, p1 };
    }, ACC);
    check(tag + ': flashes off still paints no hit vignette', diff(off.p1, off.p0) <= 4, JSON.stringify(off));
    if (process.env.SHOTS) {
      await page.evaluate(() => { const a = window.__mm.arena; const p = a.player; for (let k = 0; k < 14; k++) a.fireEnemyBullet(p.x + 110, p.y - 60, k * Math.PI * 2 / 14, 135, 2); for (let i = 0; i < 6; i++) a._update(1 / 60); a.flash = 1; a._draw(); });
      await page.screenshot({ path: process.env.SHOTS + '/cyc6-art-hitcue-' + tag + '.jpg', quality: 82 });
    }
    check(tag + ': no page errors', O.errors.length === 0, O.errors.join(' | '));
    await O.ctx.close();
  }
  // Detector sanity: the old look (?hitfx=0, same draw path) must be caught by the colour and ground checks above.
  { const O = await open(browser, { width: 390, height: 844 }, '&hitfx=0'); const f = await O.page.evaluate(`(${FLASH})(${JSON.stringify(WATER)})`);
    const diff = (x, y) => Math.max(...x.map((v, i) => Math.abs(v - y[i])));
    check('detector: the old magenta flash (?hitfx=0) fails the warm-red check and tints the ground at 30% height', f.w1 && !warm(f) && diff(f.p1.q, f.p0.q) > 6, JSON.stringify(f));
    await O.ctx.close(); }
  await browser.close();
  done();
})().catch((e) => { console.error(e); process.exit(1); });
