// Cycle 0 art (G), b12-r2-09: the jungle black sand (b30 tile_black_sand_*, 95% #323039 blue-black) no longer reads as a navy void
// block. MMIsleArt.warmSand re-lights every baked black-sand tile into a warm volcanic ramp (overlay on the Isles page's own chunk;
// the b30 PNGs and tests/isle-art-bake stay exact). ?warmsand=0 = the old pixels.
// Serve the repo root first:  python3 -m http.server 8440 &
// Run: BASE=http://localhost:8440/game/index.html NODE_PATH=$(npm root -g) node game/tests/cyc0-art-black-sand.test.js
// No Firebase (blockDb), no network, nothing written to any DB.
const { chromium } = require('playwright');
const { check, done, blockDb } = require('./helpers');
const IA = require('../shared/mm-isle-art.js');
const ORIGIN = (process.env.BASE || 'http://localhost:8440/game/index.html').replace(/\/game\/index\.html.*$/, '');
const URL = ORIGIN + '/game/games/isles/index.html?test=1&tutorial=0&isle=jungle';

check('MMIsleArt.warmSand is exported with a 5-step warm ramp (red > blue on every step)', typeof IA.warmSand === 'function' && IA.WARM_SAND.length === 5
  && IA.WARM_SAND.every((h) => parseInt(h.slice(1, 3), 16) > parseInt(h.slice(5, 7), 16) + 10));
check('warmSand without a canvas is a safe no-op', IA.warmSand(null, null, 0, 0, 0) === 0);

async function sample(browser, q) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  const db = await blockDb(ctx);
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  await page.goto(URL + (q || ''));
  await page.waitForFunction(() => window.__isles && window.__isles.world, null, { timeout: 30000 });
  await page.evaluate(() => Promise.resolve(window.__isles.isleArt()));
  const at = await page.evaluate(() => { const I = window.__isles; I.god(true); const t = I.findTile('black_sand', 2) || I.findTile('black_sand', 0); if (t) I.teleport(t.x, t.y); return t; });
  let col = null;
  for (let i = 0; i < 40 && !col; i++) { await page.waitForTimeout(150); col = await page.evaluate(() => window.__isles.sandColor()); }
  const warm = await page.evaluate(() => window.__isles.sandWarmed());
  await ctx.close();
  return { at, col, warm, errors, db: db.count() };
}

(async () => {
  const browser = await chromium.launch();
  const on = await sample(browser, '');
  const off = await sample(browser, '&warmsand=0');
  check('the jungle has black sand to stand on', !!on.at && !!off.at, JSON.stringify(on.at));
  check('default: black-sand tiles were re-lit at bake time', on.warm.on && on.warm.tiles > 0, JSON.stringify(on.warm));
  check('default: baked black sand is warm (red > blue + 12) and not a void (mean > 60)', on.col && on.col.r > on.col.b + 12 && (on.col.r + on.col.g + on.col.b) / 3 > 60, JSON.stringify(on.col));
  check('?warmsand=0: the old blue-black b30 pixels (blue >= red, mean < 60), nothing re-lit', off.col && off.col.b >= off.col.r && (off.col.r + off.col.g + off.col.b) / 3 < 60 && off.warm.tiles === 0, JSON.stringify([off.col, off.warm]));
  check('no page errors, no DB traffic', on.errors.length + off.errors.length === 0 && on.db + off.db === 0, on.errors.concat(off.errors).join(' | '));
  await browser.close();
  done();
})().catch((e) => { console.error(e); process.exit(1); });
