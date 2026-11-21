// b26 Godlands props (Codex godlands-props-fix): the muted obelisk / bone-pile / dead-tree strips replace the Godlands props by id
// (seeded positions unchanged), the dim code drawing stays the fallback, and ?props=classic or ?art=0 turn the swap off.
// Run: BASE=http://localhost:8641/game/index.html NODE_PATH=$(npm root -g) node game/tests/world-props-b26.test.js
const { chromium } = require('playwright');
const { check, done } = require('./helpers');
const ORIGIN = (process.env.BASE || 'http://localhost:8440/game/index.html').replace(/\/game\/index\.html.*$/, '');
const WORLD = ORIGIN + '/game/games/mad-maze/index.html?mode=world&test=1&seed=12345';
const SHOT = process.env.SHOTS || '';
const W = (page, fn, arg) => page.evaluate(`(${fn.toString()})(window.__mm.arena, window.__mm.world, ${JSON.stringify(arg)})`);
const frames = (page, n) => page.evaluate((k) => new Promise((res) => { let i = 0; const f = () => (++i >= k ? res() : requestAnimationFrame(f)); requestAnimationFrame(f); }), n);
async function open(browser, url, waitArt) {
  const ctx = await browser.newContext({ viewport: { width: 1000, height: 700 } });
  await ctx.route('**/game/index.html*', (r) => r.fulfill({ contentType: 'text/html', body: '<!doctype html><title>town</title>town' }));
  await ctx.route('**/hub/index.html*', (r) => r.fulfill({ contentType: 'text/html', body: '<!doctype html><title>hub</title>hub' }));
  const page = await ctx.newPage(); const errors = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  await page.goto(url);
  await page.waitForFunction(() => window.__mm && window.__mm.world && window.__mm.arena.active && window.__mm.arena.state === 'play', null, { timeout: 30000 });
  if (waitArt) await page.waitForFunction(() => { const s = window.__mm.world.artState(); return !s.loading && s.loaded.indexOf('prop_tree_dead') >= 0; }, null, { timeout: 20000 });
  await W(page, (a) => { a.player.iframes = 1e9; a._hitPlayer = () => {}; });
  return { ctx, page, errors };
}
const godProps = (page) => W(page, (a, w) => {
  const g = w.chunkGrid(); const q = w.world; const T = window.MMOverworld.TERRAIN_NAMES; const o = [];
  for (let cy = 0; cy < g.rows; cy++) for (let cx = 0; cx < g.cols; cx++) w.artProps(cx, cy).forEach((p) => { const tn = T[q.terrain[p.y * q.w + p.x]]; if (/^(godland_ash|blood_ruins|cracked_stone|lava_rock)$/.test(tn)) o.push(p); });
  return o;
});

(async () => {
  const browser = await chromium.launch();
  const A = await open(browser, WORLD, true);
  const st = await W(A.page, (a, w) => w.b26());
  check('b26 is on and all six Godlands strips loaded from the registered batch', st.on && st.ids.length === 6 && st.loaded.length === 6, JSON.stringify(st));
  const props = await godProps(A.page);
  const swapped = props.filter((p) => /^prop_godlands_/.test(p.id));
  check('Godlands obelisks / dead trees in the art pool use the b26 ids (old id kept as the fallback base)', swapped.length >= 1 && swapped.every((p) => /^prop_(obelisk|tree_dead)$/.test(p.base)), JSON.stringify(swapped.slice(0, 4)));
  check('no old obelisk / dead-tree sprite id is left on Godlands ground', !props.some((p) => /^prop_(obelisk|tree_dead)$/.test(p.id)));
  const used = [...new Set(swapped.map((p) => p.id).concat(st.codeIds))];
  check('both a and b variants are used (art pool + generator props)', used.some((id) => /_a$/.test(id)) && used.some((id) => /_b$/.test(id)), JSON.stringify(used));
  check('generator bones / dead trees on Godlands ground draw the b26 strips', st.codeCandidates > 0 && st.codeProps === st.codeCandidates, JSON.stringify(st));
  // walk the camera onto a swapped prop so its chunk is built and drawn
  const target = swapped[0];
  await W(A.page, (a, w, t) => { a.player.x = (t.x + 0.5) * 32; a.player.y = (t.y + 1.5) * 32; }, target);
  await frames(A.page, 30);
  const drawn = await W(A.page, (a, w) => w.b26().draws);
  check('b26 sprites are actually drawn into the Godlands chunks', drawn > 0, String(drawn));
  const pal = await W(A.page, (a, w) => w.godPropPalette());
  const peak = Math.max.apply(null, pal.map((c) => Math.max.apply(null, c.split(',').map(Number))));
  check('the b26 props stay muted (peak channel <= 153, like the dim rule)', peak <= 153, String(peak));
  if (SHOT) await A.page.screenshot({ path: SHOT + '/b26-godlands.png' });
  check('no console errors (b26)', A.errors.length === 0, A.errors.join('; '));
  await A.ctx.close();

  const C = await open(browser, WORLD + '&props=classic', true);
  const cs = await W(C.page, (a, w) => w.b26());
  const cp = await godProps(C.page);
  check('?props=classic: b26 off, the old ids are back and nothing is swapped', !cs.on && cs.codeProps === 0 && !cp.some((p) => /^prop_godlands_/.test(p.id) || p.base), JSON.stringify(cs));
  await W(C.page, (a, w, t) => { a.player.x = (t.x + 0.5) * 32; a.player.y = (t.y + 1.5) * 32; }, target); await frames(C.page, 30);
  check('?props=classic: no b26 sprite is drawn where the swapped prop stood', (await W(C.page, (a, w) => w.b26().draws)) === 0);
  check('no console errors (classic)', C.errors.length === 0, C.errors.join('; '));
  await C.ctx.close();

  const D = await open(browser, WORLD + '&art=0', false);
  const ds = await W(D.page, (a, w) => ({ b: w.b26(), n: w.artProps(0, 0).length + w.artProps(5, 5).length }));
  check('?art=0: b26 off and the code-drawn props are used', !ds.b.on && ds.b.draws === 0 && ds.b.codeProps === 0 && ds.n === 0, JSON.stringify(ds));
  check('no console errors (art=0)', D.errors.length === 0, D.errors.join('; '));
  await D.ctx.close();
  await browser.close(); done();
})();
