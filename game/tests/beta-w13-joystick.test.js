// W-13 (b12-10): Realm touch sticks are code-drawn pixel art: a round stepped knob (not a flat square) in a round stepped ring, the ring 20%
// smaller on <= 390 px phones, integer pixel scale, and the sticks still steer.
// Run: BASE=http://localhost:8440/game/index.html node game/tests/beta-w13-joystick.test.js
const { chromium } = require('playwright');
const { check, done, blockDb } = require('./helpers');
const ORIGIN = (process.env.BASE || 'http://localhost:8440/game/index.html').replace(/\/game\/index\.html.*$/, '');
const WORLD = ORIGIN + '/game/games/mad-maze/index.html?mode=world&test=1&offline=1&heropick=0&seed=12345';
const SHOTS = process.env.SHOTS || null;

async function open(browser, w, h) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, hasTouch: true, isMobile: true, deviceScaleFactor: 1 });
  await blockDb(ctx);
  const page = await ctx.newPage(); const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(WORLD);
  await page.waitForFunction(() => window.__mm && window.__mm.arena.active && window.__mm.arena.state === 'play', null, { timeout: 20000 });
  await page.waitForTimeout(500);
  return { ctx, page, errors };
}
const rect = (page, sel) => page.evaluate((s) => { const r = document.querySelector(s).getBoundingClientRect(); return { x: r.left, y: r.top, w: r.width, h: r.height }; }, sel);
// pixel probe of a screenshot clip: rgb at (x, y) in page coordinates
async function pixels(page, clip, pts) {
  const buf = await page.screenshot({ clip });
  // decode the PNG in the page (no npm image deps): draw it to a canvas and read the pixels back
  return page.evaluate(async ([b64, pts, cx, cy]) => {
    const im = new Image(); im.src = 'data:image/png;base64,' + b64; await im.decode();
    const c = document.createElement('canvas'); c.width = im.width; c.height = im.height; const g = c.getContext('2d'); g.drawImage(im, 0, 0);
    return pts.map(([x, y]) => Array.from(g.getImageData(Math.round(x - cx), Math.round(y - cy), 1, 1).data.slice(0, 3)));
  }, [buf.toString('base64'), pts, clip.x, clip.y]);
}
const near = (a, b, t) => a && b && Math.abs(a[0] - b[0]) <= t && Math.abs(a[1] - b[1]) <= t && Math.abs(a[2] - b[2]) <= t;

(async () => {
  const browser = await chromium.launch();
  const P = await open(browser, 390, 844); const pg = P.page;
  // freeze the scene behind the stick so the probe reads the stick art only
  await pg.evaluate(() => window.__mm.arena.setPaused && window.__mm.arena.setPaused(true));
  await pg.evaluate(() => { const b = document.getElementById('realm-backpack'); if (b) b.classList.add('hidden'); });
  const ring = await rect(pg, '#realm-stick-move'), knob = await rect(pg, '#realm-stick-move .knob');
  check('390x844: the ring is 20% smaller than the 124 px disc (<= 100 px) and keeps a 44 px+ target', ring.w <= 100 && ring.w >= 88 && ring.h === ring.w, JSON.stringify(ring));
  check('390x844: integer pixel scale (ring 25 cells, knob 13 cells)', Number.isInteger(ring.w / 25) && Number.isInteger(knob.w / 13), JSON.stringify({ ring, knob }));
  const css = await pg.evaluate(() => { const k = getComputedStyle(document.querySelector('#realm-stick-move .knob')); const r = getComputedStyle(document.querySelector('#realm-stick-move')); return { kb: k.backgroundImage.slice(0, 40), rb: r.backgroundImage.slice(0, 40), kbc: k.backgroundColor, rr: r.image || k.imageRendering }; });
  check('the knob and ring are code-drawn pixel images (svg, pixelated), not flat fills', /svg/.test(css.kb) && /svg/.test(css.rb) && /rgba\(0, 0, 0, 0\)|transparent/.test(css.kbc), JSON.stringify(css));
  const kc = { x: Math.floor(knob.x), y: Math.floor(knob.y), width: Math.ceil(knob.w), height: Math.ceil(knob.h) };
  const px = await pixels(pg, kc, [[knob.x + 1, knob.y + 1], [knob.x + knob.w / 2, knob.y + knob.h / 2], [knob.x + knob.w - 2, knob.y + knob.h - 2]]);
  check('the knob is round: its bounding-box corners are not knob colour, its centre is gold', !near(px[0], [255, 163, 0], 40) && !near(px[2], [255, 163, 0], 40) && near(px[1], [255, 163, 0], 40), JSON.stringify(px));
  if (SHOTS) await pg.screenshot({ path: SHOTS + '/w13-390.png', clip: { x: 0, y: 600, width: 390, height: 244 } });
  // the stick still steers
  await pg.evaluate(() => window.__mm.arena.setPaused && window.__mm.arena.setPaused(false));
  await pg.evaluate(() => { const a = window.__mm.arena; window.__w13 = []; const o = a.setMoveStick.bind(a); a.setMoveStick = (x, y) => { window.__w13.push([x, y]); return o(x, y); }; });
  const cx = ring.x + ring.w / 2, cy = ring.y + ring.h / 2;
  await pg.mouse.move(cx, cy); await pg.mouse.down(); await pg.mouse.move(cx + 40, cy, { steps: 4 });
  const moved = await pg.evaluate(() => window.__w13.slice(-1)[0]);
  const kt = await pg.evaluate(() => document.querySelector('#realm-stick-move .knob').style.transform);
  await pg.mouse.up();
  check('dragging the move stick still steers (setMoveStick x > 0.5) and moves the knob', moved && moved[0] > 0.5 && /translate/.test(kt), JSON.stringify({ moved, kt }));
  check('390x844: no page errors', P.errors.length === 0, P.errors.join('|'));
  await P.ctx.close();
  const B = await open(browser, 430, 932);
  const r2 = await rect(B.page, '#realm-stick-aim');
  check('430x932: the ring stays the full 125 px (25 cells x 5 px)', r2.w === 125, JSON.stringify(r2));
  await B.ctx.close();
  await browser.close();
  done();
})().catch((e) => { console.error(e); process.exit(1); });
