// Cycle 0 art (G), b06-r2-06 flat start terrain: on an art bake (Hearth Isle b35 / jungle b30) the tiles that have no PNG (grass, sand,
// water, flowers) were flat palette fields. They now get MMIsleArt.detail (seeded detail pixels + stepped edges) like the code bake,
// while the PNG terrains are left exactly as baked. ?tdetail=0 = flat as before.
// Serve the repo root first:  python3 -m http.server 8440 &
// Run: BASE=http://localhost:8440/game/index.html NODE_PATH=$(npm root -g) node game/tests/cyc0-art-isle-detail.test.js
// No Firebase (blockDb), no network.
const { chromium } = require('playwright');
const { check, done, blockDb } = require('./helpers');
const ORIGIN = (process.env.BASE || 'http://localhost:8440/game/index.html').replace(/\/game\/index\.html.*$/, '');

async function sample(browser, isle, q, names) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  const db = await blockDb(ctx);
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  await page.goto(ORIGIN + '/game/games/isles/index.html?test=1&isle=' + isle + (q || ''));
  await page.waitForFunction(() => window.__isles && window.__isles.world, null, { timeout: 30000 });
  await page.evaluate(() => Promise.resolve(window.__isles.isleArt()));
  const out = {};
  for (const n of names) {
    await page.evaluate((nm) => { const I = window.__isles; I.god(true); const t = I.findTile(nm, 1) || I.findTile(nm, 0); if (t) I.teleport(t.x, t.y); }, n);
    let st = null;
    for (let i = 0; i < 40 && !st; i++) { await page.waitForTimeout(150); st = await page.evaluate((nm) => window.__isles.tileStats(nm), n); }
    out[n] = st;
  }
  out.detail = await page.evaluate(() => window.__isles.detailBaked());
  out.art = await page.evaluate(() => Promise.resolve(window.__isles.isleArt()));
  await ctx.close();
  return { out, errors, db: db.count() };
}

(async () => {
  const browser = await chromium.launch();
  const on = await sample(browser, 'meadow', '', ['grass', 'sand', 'garden_path']);
  const off = await sample(browser, 'meadow', '&tdetail=0', ['grass', 'sand', 'garden_path']);
  const o = on.out, f = off.out;
  check('meadow bakes with b35 art', o.art.tiles === true && o.art.pack === 'meadow', JSON.stringify(o.art));
  check('default: non-PNG tiles were detailed on the art bake', o.detail.on && o.detail.tiles > 0, JSON.stringify(o.detail));
  check('?tdetail=0: nothing detailed (old flat bake)', f.detail.tiles === 0, JSON.stringify(f.detail));
  check('grass: more colours than the flat bake (detail pixels)', o.grass && f.grass && o.grass.colors > f.grass.colors && o.grass.colors >= 3, JSON.stringify([o.grass, f.grass]));
  check('sand: more colours than the flat bake', o.sand && f.sand && o.sand.colors > f.sand.colors, JSON.stringify([o.sand, f.sand]));
  check('b35 garden_path PNG tiles are pixel-identical with and without the detail pass', o.garden_path && f.garden_path && o.garden_path.hash === f.garden_path.hash && o.garden_path.tiles === f.garden_path.tiles, JSON.stringify([o.garden_path, f.garden_path]));
  const j = await sample(browser, 'jungle', '', ['jungle_floor']), jf = await sample(browser, 'jungle', '&tdetail=0', ['jungle_floor']);
  check('jungle: b30 jungle_floor PNG tiles are untouched by the pass', j.out.jungle_floor && jf.out.jungle_floor && j.out.jungle_floor.hash === jf.out.jungle_floor.hash, JSON.stringify([j.out.jungle_floor, jf.out.jungle_floor]));
  check('no page errors, no DB traffic', [on, off, j, jf].every((r) => r.errors.length === 0 && r.db === 0), [on, off, j, jf].map((r) => r.errors.join(' | ')).join(' '));
  await browser.close();
  done();
})().catch((e) => { console.error(e); process.exit(1); });
