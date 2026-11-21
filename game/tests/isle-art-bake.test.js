// Browser check of the b30 jungle tile art through the shared layer only (MMChunkBake + MMIsleArt, no Phaser, no Firebase).
// Bakes a chunk with the real PNGs and asserts: real tile pixels (not the fallback), determinism, art:false fallback, a missing base falls back.
// Run: BASE=http://localhost:8801/game/index.html NODE_PATH=$(npm root -g) node game/tests/isle-art-bake.test.js
const { chromium } = require('playwright');
const { check, done, blockDb } = require('./helpers');
const ORIGIN = (process.env.BASE || 'http://localhost:8440/game/index.html').replace(/\/game\/index\.html.*$/, '');
const PAGE = ORIGIN + '/game/tests/fixtures/isle-art-bake.html';
const NAMES = ['jungle_floor', 'jungle_moss', 'fern_thicket', 'mud', 'mud_deep', 'river_murk', 'black_sand', 'temple_stone', 'temple_moss', 'orchid_moss', 'vine_root', 'jungle_cliff'];

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 800, height: 600 } });
  const db = await blockDb(ctx);
  const page = await ctx.newPage();
  const errors = [], offsite = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errors.push('console: ' + m.text()); });
  page.on('request', (r) => { const u = r.url(); if (!u.startsWith(ORIGIN + '/') && !u.startsWith('data:')) offsite.push(u); });
  await page.goto(PAGE);
  await page.waitForFunction(() => window.ready === true);

  const art = await page.evaluate(() => window.run({}));
  const art2 = await page.evaluate(() => window.run({}));
  const off = await page.evaluate(() => window.run({ art: false }));
  const miss = await page.evaluate(() => window.run({ base: '../../assets/arcane/nope/' }));

  check('chunk is 512x512 and real art is active', art.active && art.size[0] === 512 && art.size[1] === 512);
  check('second chunk() call returns the cached canvas', art.cached === true);
  check('deterministic: two fresh bakes and two page loads give the same pixels', art.h32 === art.h32b && art.h32 === art2.h32);
  check('art:false is inactive and differs from the art bake', !off.active && off.h32 !== art.h32);
  check('art:false is deterministic too', off.h32 === (await page.evaluate(() => window.run({ art: false }))).h32);
  check('missing art base falls back to the exact art:false pixels', !miss.active && miss.h32 === off.h32);

  // every 32x32 tile of the art bake equals one of the 4 PNG variants of its terrain (exact, opaque pixels)
  const ids = await page.evaluate(() => window.terrainIds);
  const png = {};
  for (const n of NAMES) for (const v of 'abcd') png[n + '_' + v] = await page.evaluate((k) => window.pngTile('tile_' + k), n + '_' + v);
  check('all 48 b30 PNGs load', Object.values(png).every((p) => p && p.length === 4096));
  let exact = 0, variants = new Set(), total = 0, fb = 0;
  for (let ty = 0; ty < 16; ty++) for (let tx = 0; tx < 16; tx++) {
    total++;
    const name = NAMES[ids[ty * 32 + tx] - 22];
    const px = []; for (let y = 0; y < 32; y++) for (let x = 0; x < 32; x++) { const o = ((ty * 32 + y) * 512 + tx * 32 + x) * 4; px.push(art.data[o], art.data[o + 1], art.data[o + 2], art.data[o + 3]); }
    const hit = 'abcd'.split('').find((v) => png[name + '_' + v].every((b, i) => b === px[i]));
    if (hit) { exact++; variants.add(name + hit); }
    const o2 = ((ty * 32) * 512 + tx * 32) * 4;
    if (off.data[o2] === art.data[o2] && off.data[o2 + 1] === art.data[o2 + 1] && off.data[o2 + 2] === art.data[o2 + 2]) fb++;
  }
  check('all 256 baked tiles are exact b30 PNG pixels (non-fallback)', exact === total, exact + '/' + total);
  check('variants a..d are mixed by the coordinate hash', variants.size > 12, String(variants.size));
  let diff = 0; for (let i = 0; i < art.data.length; i += 4) if (art.data[i] !== off.data[i] || art.data[i + 1] !== off.data[i + 1]) diff++;
  check('art bake differs from the fallback on most pixels', diff > 512 * 512 * 0.8, String(diff));
  check('art bake is fully opaque', art.data.every((v, i) => i % 4 !== 3 || v === 255));
  check('no page errors, no offsite requests, no DB traffic', errors.length === 0 && offsite.length === 0 && db.count() === 0, errors.concat(offsite).join(' | '));
  await browser.close();
  done();
})().catch((e) => { console.error(e); process.exit(1); });
