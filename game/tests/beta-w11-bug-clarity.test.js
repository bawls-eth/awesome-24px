// W-11 (b10-11): Bug Safari bugs are readable on a phone: drawn at 2x with a 1 px rim when the field is shown under 1.8x, the rim contrasts
// with every arena's ground (>= 3:1), the ground checker is calmer, the desktop keeps 1x, and the sim (catches / score) is untouched.
// Run: BASE=http://localhost:8440/game/index.html node game/tests/beta-w11-bug-clarity.test.js
const { chromium } = require('playwright');
const { check, done, blockDb } = require('./helpers');
const ORIGIN = (process.env.BASE || 'http://localhost:8440/game/index.html').replace(/\/game\/index\.html.*$/, '');
const URL = ORIGIN + '/game/games/festival/bugs.html?test=1';
const SHOTS = process.env.SHOTS || null;
const SPECIES = ['ladybug', 'butterfly', 'beetle', 'cricket', 'antlion', 'goldbeetle', 'moonwing'];
const lum = (hex) => { const n = parseInt(hex.slice(1), 16); const c = [n >> 16 & 255, n >> 8 & 255, n & 255].map((v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }); return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]; };
const ratio = (a, b) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };

async function open(browser, vp, touch) {
  const ctx = await browser.newContext(Object.assign({ viewport: vp, deviceScaleFactor: 1 }, touch ? { hasTouch: true, isMobile: true } : {}));
  await blockDb(ctx);
  const page = await ctx.newPage(); const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(URL); await page.waitForFunction(() => window.__bugs);
  return { ctx, page, errors };
}
// each species alone on the meadow at a fixed spot: the on-screen box of non-ground pixels around it
const measure = (page) => page.evaluate((SP) => {
  const B = window.__bugs; B.start('meadow'); B.setPaused && B.setPaused(false);
  const cv = document.getElementById('game'); const r = cv.getBoundingClientRect(); const k = r.width / cv.width; const g = cv.getContext('2d');
  const out = {};
  SP.forEach((sp) => {
    B.run.bugs.length = 0; B.setPlayer(2, 12);
    const bug = B.spawn(sp, 10, 7, {}); if (!bug) { out[sp] = null; return; }
    B.render(); B.render(); // the layout-read cache settles on the first frame
    // ground reference: same spot without the bug
    const bx = Math.round(bug.x * 16), by = Math.round(bug.y * 16), R = 26;
    const withBug = g.getImageData(bx - R, by - R, 2 * R, 2 * R).data;
    B.run.bugs.length = 0; B.render(); const ground = g.getImageData(bx - R, by - R, 2 * R, 2 * R).data;
    let x0 = 1e9, y0 = 1e9, x1 = -1, y1 = -1;
    for (let i = 0; i < withBug.length; i += 4) { const d = Math.abs(withBug[i] - ground[i]) + Math.abs(withBug[i + 1] - ground[i + 1]) + Math.abs(withBug[i + 2] - ground[i + 2]); if (d > 40) { const p = i / 4, x = p % (2 * R), y = Math.floor(p / (2 * R)); x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); } }
    out[sp] = x1 < 0 ? 0 : Math.max(x1 - x0 + 1, y1 - y0 + 1) * k;
  });
  return { out, k, art: window.__bugs.bugArt() };
}, SPECIES);

(async () => {
  const browser = await chromium.launch();
  const P = await open(browser, { width: 390, height: 844 }, true);
  const m = await measure(P.page);
  check('390x844: bugs draw at 2x (field shown under 1.8x)', m.art.scale === 2 && m.k < 1.8 && m.art.draws > 0, JSON.stringify({ k: m.k, s: m.art.scale }));
  check('390x844: every meadow-spawnable species (>= 6; moonwing is night-only) is >= 16 screen px on its long side', SPECIES.filter((sp) => m.out[sp] !== null).length >= 6 && SPECIES.every((sp) => m.out[sp] === null || m.out[sp] >= 16), JSON.stringify(m.out));
  const rows = m.art.inks.map(([id, ink]) => { const th = m.art.theme[id]; return { id, ink, r: Math.min(ratio(ink, th[0]), ratio(ink, th[1])) }; });
  check('the bug rim contrasts with the ground of every arena (>= 3:1)', rows.every((q) => q.r >= 3), JSON.stringify(rows));
  if (SHOTS) await P.page.screenshot({ path: SHOTS + '/w11-phone.png', clip: { x: 0, y: 0, width: 390, height: 500 } });
  check('390x844: no page errors', P.errors.length === 0, P.errors.join('|'));
  await P.ctx.close();
  const D = await open(browser, { width: 1280, height: 720 }, false);
  const d = await measure(D.page);
  check('1280x720: the larger desktop field keeps 1x bugs (scale >= 1.8 there)', d.art.scale === 1 && d.k >= 1.8, JSON.stringify({ k: d.k, s: d.art.scale }));
  // sim untouched: the same seeded swing catches the same bug and adds the same score at both sizes
  const sim = async (page) => page.evaluate(() => { const B = window.__bugs; B.start('meadow'); B.run.bugs.length = 0; B.setPlayer(10, 7); const b = B.spawn('ladybug', 10.6, 7, {}); const s0 = B.run.score || 0; B.swing && B.swing(); for (let i = 0; i < 10; i++) B.step(1 / 30); return { caught: b.state, score: (B.run.score || 0) - s0 }; });
  const sd = await sim(D.page);
  await D.ctx.close();
  const P2 = await open(browser, { width: 390, height: 844 }, true); const sp = await sim(P2.page); await P2.ctx.close();
  check('rendering does not change the sim: same catch and score at phone and desktop size', JSON.stringify(sd) === JSON.stringify(sp), JSON.stringify([sd, sp]));
  await browser.close();
  done();
})().catch((e) => { console.error(e); process.exit(1); });
