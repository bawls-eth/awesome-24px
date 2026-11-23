// G-10 (b11-02): a Deepdelve dive scores nothing for blocks the player placed. 100 place / mine cycles of coal at depth 0: score, ores and
// best combo stay 0 and the coal comes back every time; a natural ore still scores and combos. Pure dd-run module + the page (local only).
// Run: BASE=http://localhost:8440/game/index.html node game/tests/beta-g10-placed-blocks.test.js
const { chromium } = require('playwright');
const { check, done, blockDb } = require('./helpers');
const R = require('../games/deepdelve/dd-run.js');
const ORIGIN = (process.env.BASE || 'http://localhost:8440/game/index.html').replace(/\/game\/.*$/, '').replace(/\/$/, '');

(async () => {
  // module
  const run = R.start(0);
  for (let i = 0; i < 100; i++) R.mined(run, 'coal', i * 0.2, { placed: true });
  check('module: 100 placed coal mined: blocks, ores, best combo and score all 0', run.blocks === 0 && run.ores === 0 && run.bestCombo === 0 && R.score(run, false) === 0, JSON.stringify(run));
  R.mined(run, 'coal', 30); R.mined(run, 'coal', 30.5);
  check('module: natural ore still scores and combos', run.ores === 2 && run.bestCombo === 2 && R.score(run, false) > 0, JSON.stringify(run));

  const browser = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const ctx = await browser.newContext({ viewport: { width: 1000, height: 700 } });
  await blockDb(ctx);
  const page = await ctx.newPage(); const errors = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  await page.goto(ORIGIN + '/game/games/deepdelve/index.html?test=1&seed=7');
  await page.waitForFunction(() => window.__dd && window.__dd.ready, null, { timeout: 30000 });
  const r = await page.evaluate(() => {
    const d = window.__dd; const p = d.player; d.run.start();
    const x = Math.floor(p.x) + 2, z = Math.floor(p.z); let y = 0; // an air cell two blocks to the side at head height
    for (let yy = 0; yy < 40; yy++) { if (d.getBlock(x, yy, z) === 0 && d.getBlock(x, yy + 1, z) !== 0) { y = yy; break; } }
    d.inv.coal = 1; let back = 0, placedOk = 0;
    for (let i = 0; i < 100; i++) { if (d.placeAt(x, y, z, 'coal')) placedOk++; if (d.mineAt(x, y, z)) { if (d.inv.coal === 1) back++; } }
    const st = d.run.state;
    return { placedOk, back, blocks: st.blocks, ores: st.ores, bestCombo: st.bestCombo, orePts: st.orePts, coal: d.inv.coal };
  });
  check('page: 100 place / mine cycles of coal: ores, ore points, blocks and best combo all 0', r.placedOk === 100 && r.ores === 0 && r.orePts === 0 && r.blocks === 0 && r.bestCombo === 0, JSON.stringify(r));
  check('page: the coal comes back to the inventory every time', r.back === 100 && r.coal === 1, JSON.stringify(r));
  const nat = await page.evaluate(() => {
    const d = window.__dd; const p = d.player; const st0 = d.run.state.ores;
    // a natural coal / stone block nearby (never placed this session)
    for (let dx = -6; dx <= 6; dx++) for (let dz = -6; dz <= 6; dz++) for (let y = 0; y < 30; y++) {
      const x = Math.floor(p.x) + dx, z = Math.floor(p.z) + dz, id = d.getBlock(x, y, z);
      if (id && d.mineAt(x, y, z)) return { mined: true, blocks: d.run.state.blocks, ores: d.run.state.ores - st0 };
    }
    return { mined: false };
  });
  check('page: a natural block still counts for the dive', nat.mined && nat.blocks >= 1, JSON.stringify(nat));
  check('no page errors', errors.length === 0, errors.join(' | '));
  await ctx.close(); await browser.close();
  done();
})().catch((e) => { console.error(e); process.exit(1); });
