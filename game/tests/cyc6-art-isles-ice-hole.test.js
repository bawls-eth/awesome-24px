// cyc6 art (G): Frostfang Tundra water that meets ice / snow (frozen-lake holes, the ice-shelf coast) was a flat navy block boxed by a
// dashed edge, and the cycle-4 seam pass pushed navy bumps INTO the ice. MMIsleArt.biomeDetail now (opts.biomes.holes === true) draws an
// ice ledge on the water side of every ice/snow edge (lit #eef6ff outer row, pale lip, dark under-ice shadow), ripple glints and the odd
// floating chip, and no longer pushes water-coloured bumps into the ice. ?icehole=0 turns it off; jungle water is untouched.
// Run: BASE=http://localhost:9603/game/index.html NODE_PATH=$(npm root -g) node game/tests/cyc6-art-isles-ice-hole.test.js
// No Firebase (blockDb), no network.
const { chromium } = require('playwright');
const { check, done, blockDb } = require('./helpers');
const ORIGIN = (process.env.BASE || 'http://localhost:8440/game/index.html').replace(/\/game\/index\.html.*$/, '');

async function open(browser, isle, q) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  const db = await blockDb(ctx);
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  await page.goto(ORIGIN + '/game/games/isles/index.html?test=1&isle=' + isle + (q || ''));
  await page.waitForFunction(() => window.__isles && window.__isles.world, null, { timeout: 30000 });
  await page.evaluate(() => Promise.resolve(window.__isles.isleArt()));
  await page.waitForTimeout(1500);
  await page.evaluate(() => { for (let i = 0; i < 5; i++) window.__isles.render(); });
  return { ctx, page, errors, db };
}

// Pure function on a fixed 16x16 terrain: left half snow (0), right half deep water (1); tile 32 px, 2 px per art px.
const PURE = () => {
  const A = window.MMIsleArt; const names = ['snow', 'deep_water', 'jungle_floor'];
  const pal = { snow: ['#e8eef4', '#dbe3eb', '#f5f8fb', '#aab6c4'], deep_water: ['#1e3f7a', '#1a3870', '#24488a', '#102650'], jungle_floor: ['#3f7a35', '#376d2f', '#4a8740', '#285423'] };
  const run = (left, holes) => {
    const c = document.createElement('canvas'); c.width = c.height = 512; const g = c.getContext('2d');
    const terr = new Uint8Array(256); for (let i = 0; i < 256; i++) terr[i] = (i % 16) >= 8 ? 1 : left;
    const r = A.biomeDetail(g, terr, 16, 16, 0, 0, { names, palette: pal, tile: 32, ch: 16, seed: 5, biomes: { tundra: true, jungle: true, holes } });
    const d = g.getImageData(0, 0, 512, 512).data; const px = (x, y) => { const i = (y * 512 + x) * 4; return [d[i], d[i + 1], d[i + 2], d[i + 3]]; };
    let water = 0, navyInIce = 0, lit = 0;
    for (let y = 0; y < 512; y++) for (let x = 0; x < 512; x++) { const p = px(x, y); if (!p[3]) continue;
      if (x >= 256) { water++; if (x < 258 && p[0] > 230 && p[1] > 240 && p[2] > 250) lit++; }
      else if (x >= 250 && p[2] > p[0] + 60 && p[0] < 60) navyInIce++; }
    return { r, water, navyInIce, lit };
  };
  return { on: run(0, true), off: run(0, false), jungle: run(2, true) };
};

(async () => {
  const browser = await chromium.launch();
  const T = await open(browser, 'tundra', '');
  const pure = await T.page.evaluate(PURE);
  check('holes on: water beside snow gets an ice ledge (hole + lip counted, lit outer row on every water edge pixel row)', pure.on.r.iceHoles === 16 && pure.on.r.lips === 16 && pure.on.lit >= 16 * 16 * 2, JSON.stringify(pure.on));
  check('holes on: no navy water bumps pushed into the snow side of the edge', pure.on.navyInIce === 0, JSON.stringify(pure.on));
  check('holes off: water tiles get no paint (old behaviour) and the seam bumps are still there', pure.off.r.iceHoles === 0 && pure.off.water === 0 && pure.off.navyInIce > 0, JSON.stringify(pure.off));
  check('jungle water is untouched (jungle floor is not ice)', pure.jungle.r.iceHoles === 0 && pure.jungle.water === 0, JSON.stringify(pure.jungle));
  const st = await T.page.evaluate(() => window.__isles.biomeDetail());
  check('tundra isle: the bake drew ice ledges (holes on, lips > 0)', st.holes === true && st.lips > 0, JSON.stringify(st));
  if (process.env.SHOTS) await T.page.screenshot({ path: process.env.SHOTS + '/cyc6-art-ice-hole-test.jpg', quality: 80 });
  check('tundra: no page errors, no DB traffic', T.errors.length === 0 && T.db.count() === 0, T.errors.join(' | '));
  await T.ctx.close();
  const off = await open(browser, 'tundra', '&icehole=0');
  const so = await off.page.evaluate(() => window.__isles.biomeDetail());
  check('?icehole=0: no ice ledges', so.holes === false && !(so.lips > 0), JSON.stringify(so));
  await off.ctx.close();
  const J = await open(browser, 'jungle', '');
  const sj = await J.page.evaluate(() => window.__isles.biomeDetail());
  check('jungle isle: no ice ledges', !(sj.lips > 0), JSON.stringify(sj));
  check('jungle: no page errors, no DB traffic', J.errors.length === 0 && J.db.count() === 0, J.errors.join(' | '));
  await J.ctx.close();
  await browser.close();
  done();
})().catch((e) => { console.error(e); process.exit(1); });
