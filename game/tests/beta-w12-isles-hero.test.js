// W-12 (b12-09): the Isles hero turns and walks: a different baked view for down / up / right (left mirrors right), a 2-frame walk cycle
// while moving, a static frame when idle and under reduced motion. Also reports the terrain of the dark 2x2 block next to the jungle start.
// Run: BASE=http://localhost:8440/game/index.html node game/tests/beta-w12-isles-hero.test.js
const { chromium } = require('playwright');
const { check, done, blockDb } = require('./helpers');
const ORIGIN = (process.env.BASE || 'http://localhost:8440/game/index.html').replace(/\/game\/index\.html.*$/, '');
const PAGE = ORIGIN + '/game/games/isles/index.html?test=1&seed=123&isle=jungle';
const PROFILE = { v: 1, heroes: [{ id: 'h1', name: 'Fern', cls: 'druid', level: 7, xp: 10, items: [] }], stash: [], fame: 0, mode: 'classic', hall: [] };

async function open(browser, reduced) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 }, reducedMotion: reduced ? 'reduce' : 'no-preference' });
  await blockDb(ctx);
  const page = await ctx.newPage(); const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.addInitScript((p) => { if (sessionStorage.seeded) return; sessionStorage.seeded = '1'; localStorage.clear(); localStorage.setItem('pixeltown-mm-v1', JSON.stringify(p)); localStorage.setItem('pixeltown-mm-active-v1', JSON.stringify({ v: 1, heroId: 'h1' })); }, PROFILE);
  await page.goto(PAGE);
  await page.waitForFunction(() => window.__isles && window.__isles.world);
  await page.evaluate(() => { window.__isles.pause(true); window.__isles.god && window.__isles.god(true); });
  return { ctx, page, errors };
}
// walk in a direction for a few short steps; return the drawn view / frame / flip per step, plus a pixel hash of the hero cell
const walk = (page, mx, my, n, dt) => page.evaluate(([mx, my, n, dt]) => {
  const I = window.__isles, out = [];
  for (let i = 0; i < n; i++) { I.step(mx, my, dt); I.render(); const d = I.heroDraw(); out.push(d.id); }
  return out;
}, [mx, my, n, dt]);

(async () => {
  const browser = await chromium.launch();
  const A = await open(browser, false); const p = A.page;
  await p.evaluate(() => window.__isles.face(0, 1));
  const idle0 = await walk(p, 0, 0, 6, 0.09);
  const left = await walk(p, -1, 0, 8, 0.09), right = await walk(p, 1, 0, 8, 0.09), up = await walk(p, 0, -1, 8, 0.09), down = await walk(p, 0, 1, 8, 0.09);
  const idle = await walk(p, 0, 0, 6, 0.09);
  const set = (a) => Array.from(new Set(a)).sort().join(',');
  check('walking left / right / up each show their own view (not the idle front)', /^right/.test(left[0]) && /L$/.test(left[0]) && /^right/.test(right[0]) && !/L$/.test(right[0]) && /^up/.test(up[0]) && /^down/.test(idle0[0]), JSON.stringify({ idle0, left, right, up }));
  check('views are distinct frame sets (left / right / up / down share no frame id)', [left, right, up, down].map(set).every((s, i, all) => all.every((t, j) => i === j || s.split(',').every((x) => t.split(',').indexOf(x) < 0))), JSON.stringify([left, right, up, down].map(set)));
  check('a 2-frame walk cycle while moving (both frames seen in each direction)', [left, right, up, down].every((a) => new Set(a).size === 2), JSON.stringify([left, right, up, down].map(set)));
  check('static when idle (one frame id)', new Set(idle).size === 1 && new Set(idle0).size === 1, JSON.stringify({ idle0, idle }));
  // the baked views really differ in pixels (not one image re-labelled)
  const px = await p.evaluate(() => { const I = window.__isles; const cv = document.querySelector('canvas'); const r = cv.getBoundingClientRect(); const out = {};
    [['down', 0, 1], ['up', 0, -1], ['right', 1, 0]].forEach(([n, x, y]) => { I.face(x, y); I.step(0, 0, 0.01); I.render(); const g = cv.getContext('2d'); const k = cv.width / r.width; const cx = Math.round(cv.width / 2), cy = Math.round(cv.height / 2); const d = g.getImageData(cx - Math.round(20 * k), cy - Math.round(40 * k), Math.round(40 * k), Math.round(44 * k)).data; let h = 0; for (let i = 0; i < d.length; i += 4) h = (h * 31 + d[i] + 3 * d[i + 1] + 7 * d[i + 2]) >>> 0; out[n] = h; });
    return out; });
  check('down / up / right views differ by pixel hash on screen', px.down !== px.up && px.down !== px.right && px.up !== px.right, JSON.stringify(px));
  // the dark 2x2 block near the jungle start (b12-09): report the terrain names around the spawn
  const near = await p.evaluate(() => { const I = window.__isles, w = I.world, sp = w.spawnPoint; const names = {}; for (let y = sp.y - 4; y <= sp.y + 4; y++) for (let x = sp.x - 5; x <= sp.x + 2; x++) { const n = MMOverworld.TERRAIN_NAMES[MMOverworld.tileAt(w, x, y)]; if (n) names[n] = (names[n] || 0) + 1; } return { sp, names }; });
  console.log('INFO terrain around the jungle spawn (b12-09 dark block):', JSON.stringify(near));
  check('no page errors', A.errors.length === 0, A.errors.join('|'));
  await A.ctx.close();
  const R = await open(browser, true);
  const rl = await walk(R.page, -1, 0, 8, 0.09);
  check('reduced motion: walking keeps one static frame (the view still turns)', new Set(rl).size === 1 && /^right0L$/.test(rl[0]), JSON.stringify(rl));
  await R.ctx.close();
  await browser.close();
  done();
})().catch((e) => { console.error(e); process.exit(1); });
