// World art wiring (b12/b13/b14 sprites in realm-world.js): animated portal sprite with ?art=0 fallback, deterministic capped decorative props,
// stacked (non-overlapping) portal + site prompts, and the minimap / zone text stepping aside while a panel is open on a phone.
// Run: BASE=http://localhost:8562/game/index.html NODE_PATH=$(npm root -g) node game/tests/world-art.test.js
const { chromium } = require('playwright');
const { check, done } = require('./helpers');
const ORIGIN = (process.env.BASE || 'http://localhost:8440/game/index.html').replace(/\/game\/index\.html.*$/, '');
const PAGE = ORIGIN + '/game/games/mad-maze/index.html';
const WORLD = PAGE + '?mode=world&test=1&seed=12345';
const waitPlay = (page) => page.waitForFunction(() => window.__mm && window.__mm.arena.active && window.__mm.arena.state === 'play', null, { timeout: 15000 });
const W = (page, fn, arg) => page.evaluate(`(${fn.toString()})(window.__mm.arena, window.__mm.world, ${JSON.stringify(arg)})`);

async function open(browser, url, vp) {
  const ctx = await browser.newContext(vp || { viewport: { width: 1000, height: 700 } });
  await ctx.route('**/game/index.html*', (r) => r.fulfill({ contentType: 'text/html', body: '<!doctype html><title>town</title>town' }));
  await ctx.route('**/hub/index.html*', (r) => r.fulfill({ contentType: 'text/html', body: '<!doctype html><title>hub</title>hub' }));
  const page = await ctx.newPage(); const errors = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  await page.goto(url); await waitPlay(page);
  return { ctx, page, errors };
}
const tpTo = (page, x, y) => W(page, (a, w, t) => { a.player.x = (t.x + 0.5) * 32; a.player.y = (t.y + 0.5) * 32; a.player.iframes = 1e9; }, { x, y });
const allProps = (page) => W(page, (a, w) => { const g = w.chunkGrid(); const o = []; for (let cy = 0; cy < g.rows; cy++) for (let cx = 0; cx < g.cols; cx++) o.push({ cx, cy, p: w.artProps(cx, cy) }); return o; });

(async () => {
  const browser = await chromium.launch();

  // ---- art on: sprites load and the portal draws from the sprite strip ----
  const A = await open(browser, WORLD); const page = A.page;
  await page.waitForFunction(() => { const s = window.__mm.world.artState(); return !s.loading && s.loaded.indexOf('portal_warren') >= 0; }, null, { timeout: 15000 });
  const st0 = await W(page, (a, w) => w.artState());
  check('b14 / b12 / b13 art registered by id', st0.on && ['portal_warren', 'shrine_heal', 'loot_chest_gold', 'event_beacon', 'spawn_pad', 'prop_tree_small', 'prop_hut'].every((id) => st0.loaded.indexOf(id) >= 0), JSON.stringify(st0.loaded.length));
  const portals = await W(page, (a, w) => w.portals());
  await tpTo(page, portals[0].tx + 1, portals[0].ty + 2);
  await page.waitForTimeout(700);
  const st1 = await W(page, (a, w) => w.artState());
  check('portal sprite is drawn once the art has loaded', st1.draws.portal > 0, JSON.stringify(st1.draws));
  const sites = await W(page, (a, w) => w.sites());
  await tpTo(page, sites.shrines[0].x, sites.shrines[0].y); await page.waitForTimeout(500);
  const st2 = await W(page, (a, w) => w.artState());
  check('shrine sprite is drawn near a shrine', st2.draws.shrine > 0, JSON.stringify(st2.draws));
  await tpTo(page, sites.camps[0].chest.x, sites.camps[0].chest.y); await page.waitForTimeout(500);
  await W(page, (a, w, i) => w.openChest(i), sites.camps[0].i); await page.waitForTimeout(500);
  check('chest sprite is drawn and the chest opens', (await W(page, (a, w) => w.artState().draws.chest)) > 0 && (await W(page, (a, w) => w.sites().camps[0].opened)));

  // ---- props: bounded, deterministic, decorative ----
  const props = await allProps(page);
  const grid = await W(page, (a, w) => w.chunkGrid());
  const maxPer = Math.max.apply(null, props.map((c) => c.p.length)); const total = props.reduce((n, c) => n + c.p.length, 0);
  const tiles = grid.cols * grid.rows * 256;
  check('props exist but stay within the cap (<= 6 per chunk, <= 1 per 40 tiles)', total > 50 && maxPer <= 6 && total <= tiles / 40, JSON.stringify({ total, maxPer, tiles }));
  const bad = await W(page, (a, w) => {
    const g = w.chunkGrid(); const T = window.MMOverworld.TERRAIN; const q = w.world; const out = [];
    const ex = [q.spawnPoint].concat(w.portals().map((p) => ({ x: p.tx, y: p.ty })));
    for (let cy = 0; cy < g.rows; cy++) for (let cx = 0; cx < g.cols; cx++) w.artProps(cx, cy).forEach((p) => {
      const t = q.terrain[p.y * q.w + p.x];
      if (t === T.deep_water || t === T.shallow_water || q.solid[p.y * q.w + p.x]) out.push('terrain ' + p.id);
      if (ex.some((e) => Math.abs(e.x - p.x) <= 3 && Math.abs(e.y - p.y) <= 3)) out.push('near portal/spawn ' + p.id);
    });
    return out;
  });
  check('no props on water, solid tiles, portals or the spawn', bad.length === 0, bad.slice(0, 3).join(','));
  const B = await open(browser, WORLD);
  await B.page.waitForFunction(() => window.__mm.world.artState().on, null, { timeout: 15000 });
  const props2 = await allProps(B.page);
  check('same seed gives the same props', JSON.stringify(props) === JSON.stringify(props2));
  const C = await open(browser, PAGE + '?mode=world&test=1&seed=777');
  const props3 = await allProps(C.page);
  check('a different seed gives different props', JSON.stringify(props) !== JSON.stringify(props3));
  await B.ctx.close(); await C.ctx.close();

  // ---- both prompts: stacked, no overlap, >= 44 px, at phone size ----
  await page.setViewportSize({ width: 390, height: 844 });
  await tpTo(page, portals[0].tx, portals[0].ty); await page.waitForTimeout(500);
  await page.evaluate(() => { const s = document.getElementById('rw-site'); s.textContent = 'Talk to Nexus Guide (E)'; s.classList.remove('hidden'); document.getElementById('rw-portal').classList.remove('hidden'); });
  await page.waitForTimeout(200);
  const boxes = await page.evaluate(() => { const r = (id) => { const b = document.getElementById(id).getBoundingClientRect(); return { x: b.x, y: b.y, w: b.width, h: b.height }; }; return { p: r('rw-portal'), s: r('rw-site'), sw: document.documentElement.scrollWidth, iw: innerWidth }; });
  const overlap = boxes.p.x < boxes.s.x + boxes.s.w && boxes.s.x < boxes.p.x + boxes.p.w && boxes.p.y < boxes.s.y + boxes.s.h && boxes.s.y < boxes.p.y + boxes.p.h;
  check('portal and site prompts do not overlap', !overlap, JSON.stringify(boxes));
  check('portal prompt sits above the site prompt, both >= 44 px tall', boxes.p.y + boxes.p.h <= boxes.s.y && boxes.p.h >= 44 && boxes.s.h >= 44 && boxes.p.w >= 44 && boxes.s.w >= 44, JSON.stringify(boxes));
  check('no horizontal scroll at 390x844', boxes.sw <= boxes.iw, boxes.sw + '/' + boxes.iw);
  await page.evaluate(() => { document.getElementById('rw-site').classList.add('hidden'); document.getElementById('rw-portal').classList.add('hidden'); });
  const reset = await page.evaluate(() => [document.getElementById('rw-portal').style.bottom, document.getElementById('rw-site').style.bottom]);
  await page.waitForTimeout(100);

  // ---- minimap + zone text hide while the backpack is open ----
  const vis = () => page.evaluate(() => ['rw-minimap', 'rw-zone'].map((id) => getComputedStyle(document.getElementById(id)).display));
  check('minimap and zone text show while playing', (await vis()).every((d) => d !== 'none'));
  await page.click('#realm-bp-btn'); await page.waitForTimeout(250);
  check('minimap and zone text hidden while the backpack is open (390x844)', (await vis()).every((d) => d === 'none') && (await W(page, (a, w) => w.panelHidden())), JSON.stringify(await vis()));
  await page.click('#realm-bp-close'); await page.waitForTimeout(250);
  check('minimap and zone text return after closing', (await vis()).every((d) => d !== 'none'), JSON.stringify(await vis()));
  check('prompt overrides reset when hidden', reset.every((v) => v === ''), JSON.stringify(reset));
  check('no console errors with art on', A.errors.length === 0, A.errors.join(' | '));

  // ---- ?art=0: code fallback, no props ----
  const Z = await open(browser, WORLD + '&art=0');
  await tpTo(Z.page, portals[0].tx + 1, portals[0].ty + 2); await Z.page.waitForTimeout(700);
  const z = await W(Z.page, (a, w) => ({ s: w.artState(), n: w.artProps(10, 10).length, c: document.querySelector('canvas') !== null }));
  check('?art=0 loads no art and draws no sprites', !z.s.on && z.s.loaded.length === 0 && z.s.draws.portal === 0 && z.s.draws.shrine === 0, JSON.stringify(z.s));
  check('?art=0 scatters no props and the game still renders', z.n === 0 && z.c);
  check('no console errors with ?art=0', Z.errors.length === 0, Z.errors.join(' | '));

  await browser.close();
  done();
})().catch((e) => { console.error(e); process.exit(1); });
