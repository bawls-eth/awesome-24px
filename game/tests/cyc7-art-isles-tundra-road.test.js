// cyc7 art (G): Frostfang Tundra frozen road and tundra moss were flat fills (grey with specks / plain olive). MMIsleArt.biomeDetail now
// (opts.biomes.road === true) draws two wheel ruts along the road's direction (dark groove + lit snow lip, seeded gaps) and frost-heaved
// cobbles on frozen_road (flagstone joints instead of ruts on a plaza tile), and lichen crust (rust / sage) plus the odd crowberry on tundra_moss tiles that drew no frost. ?tundraroad=0 = off.
// Bake time only. Pure function check on a fixed terrain + the real tundra isle bake counters.
// Run: BASE=http://localhost:9703/game/index.html NODE_PATH=$(npm root -g) node game/tests/cyc7-art-isles-tundra-road.test.js
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
  await page.goto(ORIGIN + '/game/games/isles/index.html?test=1&howto=0&isle=' + isle + (q || ''));
  await page.waitForFunction(() => window.__isles && window.__isles.world, null, { timeout: 30000 });
  await page.evaluate(() => Promise.resolve(window.__isles.isleArt()));
  await page.waitForTimeout(1500);
  await page.evaluate(() => { for (let i = 0; i < 5; i++) window.__isles.render(); });
  return { ctx, page, errors, db };
}

// 16x16 tiles of 32 px (2 px per art px): rows 0-5 snow, rows 6-7 a horizontal frozen_road, rows 8-15 columns 0-7 tundra_moss, 8-15 snow,
// plus a vertical road (column 12, rows 8-15). Runs with road on / off; compares a snow-only tile's pixels and the road groove rows.
const PURE = () => {
  const A = window.MMIsleArt; const names = ['snow', 'frozen_road', 'tundra_moss'];
  const pal = { snow: ['#e8eef4', '#dbe3eb', '#f5f8fb', '#aab6c4'], frozen_road: ['#8f98a6', '#848d9b', '#9aa3b0', '#646c7a'], tundra_moss: ['#6f7a4a', '#66714a', '#7a8556', '#4d5634'] };
  const terr = new Uint8Array(256);
  for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) terr[y * 16 + x] = (y === 6 || y === 7) ? 1 : (y >= 8 && x === 12) ? 1 : (y >= 8 && x < 8) ? 2 : 0;
  const run = (road) => {
    const c = document.createElement('canvas'); c.width = c.height = 512; const g = c.getContext('2d');
    for (let i = 0; i < 256; i++) { g.fillStyle = pal[names[terr[i]]][0]; g.fillRect((i % 16) * 32, (i >> 4) * 32, 32, 32); }
    const r = A.biomeDetail(g, terr, 16, 16, 0, 0, { names, palette: pal, tile: 32, ch: 16, seed: 5, biomes: { tundra: true, jungle: true, road } });
    const d = g.getImageData(0, 0, 512, 512).data;
    const lum = (x, y) => { const i = (y * 512 + x) * 4; return d[i] * 0.3 + d[i + 1] * 0.59 + d[i + 2] * 0.11; };
    // horizontal road tile (3,6): mean luma of each art row (2 px rows), inner columns
    const rows = []; for (let ay = 0; ay < 16; ay++) { let s = 0, n = 0; for (let x = 3 * 32 + 2; x < 4 * 32 - 2; x++) { s += lum(x, 6 * 32 + ay * 2); n++; } rows.push(Math.round(s / n)); }
    // vertical road tile (12,11): mean luma per art column
    const cols = []; for (let ax = 0; ax < 16; ax++) { let s = 0, n = 0; for (let y = 11 * 32 + 2; y < 12 * 32 - 2; y++) { s += lum(12 * 32 + ax * 2, y); n++; } cols.push(Math.round(s / n)); }
    // a snow-only tile far from every seam (5,2) and all moss tiles: hash of their pixels / count of warm (lichen) pixels
    let snowHash = 0; for (let y = 2 * 32; y < 3 * 32; y++) for (let x = 5 * 32; x < 6 * 32; x++) { const i = (y * 512 + x) * 4; snowHash = (snowHash * 31 + d[i] + d[i + 1] * 7 + d[i + 2] * 13) | 0; }
    let warm = 0; for (let y = 8 * 32 + 2; y < 16 * 32 - 2; y++) for (let x = 2; x < 8 * 32 - 2; x++) { const i = (y * 512 + x) * 4; if (d[i] > d[i + 2] + 60 && d[i] > 150) warm++; }
    return { r, rows, cols, snowHash, warm };
  };
  return { on: run(true), off: run(false) };
};

(async () => {
  const browser = await chromium.launch();
  const T = await open(browser, 'tundra', '');
  const p = await T.page.evaluate(PURE);
  console.log('INFO ' + JSON.stringify({ on: p.on.r, off: p.off.r, rowsOn: p.on.rows, rowsOff: p.off.rows, colsOn: p.on.cols, warm: [p.on.warm, p.off.warm] }));
  const dip = (a, i) => a[i] < Math.min(a[i - 2], a[i + 3]) - 6; // the groove row is darker than the road around it
  check('road on: every road tile got ruts (40 road tiles: 2 rows of 16 + 8) except the one plaza tile (12,7: road on all four sides) which gets paving, cobbles placed',
    p.on.r.ruts === 39 && p.on.r.paving === 1 && p.on.r.cobbles > 3, JSON.stringify(p.on.r));
  check('road on: the horizontal road shows two dark groove rows (art rows 5 and 10) with a lit lip under them', dip(p.on.rows, 5) && dip(p.on.rows, 10) && p.on.rows[6] > p.on.rows[5] + 10 && p.on.rows[11] > p.on.rows[10] + 10, JSON.stringify(p.on.rows));
  check('road on: the vertical road runs its ruts north-south (dark columns 5 and 10)', dip(p.on.cols, 5) && dip(p.on.cols, 10), JSON.stringify(p.on.cols));
  check('road on: tundra moss gets lichen crust (warm rust pixels) on most tiles', p.on.r.lichen > 10 && p.on.warm > 40 && p.off.warm === 0, JSON.stringify([p.on.r.lichen, p.on.warm, p.off.warm]));
  check('road off: no ruts / paving / cobbles / lichen, flat road rows (old look)', p.off.r.ruts === 0 && p.off.r.paving === 0 && p.off.r.cobbles === 0 && p.off.r.lichen === 0 && !dip(p.off.rows, 5) && !dip(p.off.rows, 10), JSON.stringify([p.off.r, p.off.rows]));
  check('snow tiles are pixel-identical with the road pass on and off', p.on.snowHash === p.off.snowHash, p.on.snowHash + ' / ' + p.off.snowHash);
  const st = await T.page.evaluate(() => window.__isles.biomeDetail());
  check('tundra isle: the real bake drew ruts and lichen (road on)', st.road === true && st.ruts > 0 && st.lichen > 0, JSON.stringify(st));
  check('tundra: no page errors, no DB traffic', T.errors.length === 0 && T.db.attempts() === 0, T.errors.join(' | '));
  await T.ctx.close();
  const off = await open(browser, 'tundra', '&tundraroad=0');
  const so = await off.page.evaluate(() => window.__isles.biomeDetail());
  check('?tundraroad=0: no ruts / cobbles / lichen on the real bake', so.road === false && !(so.ruts > 0) && !(so.lichen > 0), JSON.stringify(so));
  await off.ctx.close();
  await browser.close();
  done();
})().catch((e) => { console.error(e); process.exit(1); });
