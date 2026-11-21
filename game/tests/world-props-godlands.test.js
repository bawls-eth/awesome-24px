// Godlands props must never read as enemy bullets: no skull/bone sprites on Godlands-family ground, every dimmed prop colour is low-saturation
// and dim (max channel <= 128 = under 60% of the bright player bolt), and ?props=classic restores the old pool.
// Run: BASE=http://localhost:8632/game/index.html NODE_PATH=$(npm root -g) node game/tests/world-props-godlands.test.js
const { chromium } = require('playwright');
const { check, done } = require('./helpers');
const ORIGIN = (process.env.BASE || 'http://localhost:8440/game/index.html').replace(/\/game\/index\.html.*$/, '');
const WORLD = ORIGIN + '/game/games/mad-maze/index.html?mode=world&test=1&seed=12345';
const waitPlay = (page) => page.waitForFunction(() => window.__mm && window.__mm.arena.active && window.__mm.arena.state === 'play', null, { timeout: 15000 });
const W = (page, fn) => page.evaluate(`(${fn.toString()})(window.__mm.arena, window.__mm.world)`);
async function open(browser, url) {
  const ctx = await browser.newContext({ viewport: { width: 1000, height: 700 } });
  await ctx.route('**/game/index.html*', (r) => r.fulfill({ contentType: 'text/html', body: '<!doctype html><title>town</title>town' }));
  await ctx.route('**/hub/index.html*', (r) => r.fulfill({ contentType: 'text/html', body: '<!doctype html><title>hub</title>hub' }));
  const page = await ctx.newPage(); const errors = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  await page.goto(url); await waitPlay(page);
  await page.waitForFunction(() => { const s = window.__mm.world.artState(); return !s.loading && s.loaded.indexOf('prop_tree_dead') >= 0; }, null, { timeout: 15000 });
  return { ctx, page, errors };
}
const godProps = (page) => W(page, (a, w) => {
  const g = w.chunkGrid(); const q = w.world; const T = window.MMOverworld.TERRAIN_NAMES; const o = [];
  for (let cy = 0; cy < g.rows; cy++) for (let cx = 0; cx < g.cols; cx++) w.artProps(cx, cy).forEach((p) => { const tn = T[q.terrain[p.y * q.w + p.x]]; if (/^(godland_ash|blood_ruins|cracked_stone|lava_rock)$/.test(tn)) o.push({ id: p.id, dim: p.dim, tn }); });
  return o;
});
// Enemy-bullet colours are saturated pink / purple / orange / red / cyan glow dots: any hue with real saturation and brightness.
function isBulletLike(rgb) {
  const [r, g, b] = rgb.split(',').map(Number); const mx = Math.max(r, g, b); const mn = Math.min(r, g, b); const s = mx ? (mx - mn) / mx : 0;
  if (mx > 160 && s > 0.3) return true; // bright and coloured
  if (s > 0.32 && mx > 90) return true; // saturated at any visible brightness
  return false;
}

(async () => {
  const browser = await chromium.launch();
  const A = await open(browser, WORLD);
  const props = await godProps(A.page);
  check('Godlands-family ground gets props', props.length >= 10, String(props.length));
  check('no skull/bone/crystal sprite on Godlands ground', !props.some((p) => /skeleton|crystal/.test(p.id)), JSON.stringify([...new Set(props.map((p) => p.id))]));
  check('every Godlands prop is flagged dim', props.every((p) => p.dim === true));
  const pal = await W(A.page, (a, w) => w.godPropPalette());
  check('palette was measured from real sprites', pal.length >= 12, String(pal.length));
  const hot = pal.filter(isBulletLike);
  check('no Godlands prop colour is within the enemy-bullet hue / saturation set', hot.length === 0, hot.slice(0, 5).join(' | '));
  const peak = Math.max.apply(null, pal.map((c) => Math.max.apply(null, c.split(',').map(Number))));
  check('Godlands props stay under 60% of the player bolt luminance (peak channel <= 153)', peak <= 153, String(peak));
  check('no console errors (new look)', A.errors.length === 0, A.errors.join('; '));
  await A.ctx.close();

  const C = await open(browser, WORLD + '&props=classic');
  check('?props=classic reports classic', (await W(C.page, (a, w) => w.propsClassic())) === true);
  const old = await godProps(C.page);
  check('?props=classic restores the old pools (skeleton / crystal props back, nothing dimmed)', old.some((p) => /skeleton|crystal/.test(p.id)) && old.every((p) => !p.dim), JSON.stringify([...new Set(old.map((p) => p.id))]));
  check('no console errors (classic)', C.errors.length === 0, C.errors.join('; '));
  await C.ctx.close();
  await browser.close(); done();
})();
