// Cycle 1 art (G): the Isles hit flash is the creature's own white silhouette (PNG strip or code-drawn frame), not a white circle laid
// over the body and the ground round it. White copies are built once per source canvas on the first hit; the per-frame cost is one
// extra blit per flashing creature (measured here). ?hitflash=0 = the old circle.
// Serve the repo root first:  python3 -m http.server 8440 &
// Run: BASE=http://localhost:8440/game/index.html NODE_PATH=$(npm root -g) node game/tests/cyc1-art-isles-hitflash.test.js
// No Firebase (blockDb), offline, nothing written to any DB.
const { chromium } = require('playwright');
const { check, done, blockDb } = require('./helpers');
const ORIGIN = (process.env.BASE || 'http://localhost:8440/game/index.html').replace(/\/game\/index\.html.*$/, '');
const isles = (q) => ORIGIN + '/game/games/isles/index.html?test=1&tutorial=0&howto=0' + q;

async function sample(browser, isle, species, q) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  const db = await blockDb(ctx);
  const page = await ctx.newPage(); const errors = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  await page.goto(isles('&isle=' + isle + (q || '')));
  await page.waitForFunction(() => window.__isles && window.__isles.world, null, { timeout: 30000 });
  await page.evaluate(() => Promise.resolve(window.__isles.isleArt && window.__isles.isleArt()));
  await page.evaluate(() => Promise.resolve(window.__isles.stripsReady()));
  await page.waitForTimeout(800);
  const r = await page.evaluate((sp) => {
    const I = window.__isles; I.god(true); I.pause(true);
    const h = I.hero(), tx = Math.floor(h.x / I.tile), ty = Math.floor(h.y / I.tile);
    sp.forEach((s, i) => I.spawn(s, tx - 3 + i * 3, ty + 2));
    I.render();
    const before = I.hitFlash();
    I.hitFlash('all'); I.render();
    const after = I.hitFlash();
    const drawn = I.creatures().filter((c) => Math.abs(c.x - h.x) < 600 && Math.abs(c.y - h.y) < 340).map((c) => c.src);
    return { before, after, drawn };
  }, species);
  await ctx.close();
  return Object.assign(r, { errors, db: db.count() });
}

(async () => {
  const browser = await chromium.launch();
  const png = await sample(browser, 'meadow', [], '');
  const code = await sample(browser, 'tundra', ['shagtusk', 'regolith_roly'], '');
  const off = await sample(browser, 'meadow', [], '&hitflash=0');
  const d = (r, k) => r.after[k] - r.before[k];
  console.log('INFO', JSON.stringify({ png: [png.after, png.drawn], code: [code.after, code.drawn], off: off.after }));
  check('meadow: PNG creatures in view', png.drawn.indexOf('png') >= 0, JSON.stringify(png.drawn));
  check('meadow: flashing PNG creatures drew a white silhouette, no circle', d(png, 'silPng') > 0 && d(png, 'circle') === 0, JSON.stringify(png.after));
  check('tundra: flashing code-drawn creatures drew a white silhouette', code.drawn.indexOf('code') >= 0 && d(code, 'silCode') > 0, JSON.stringify([code.after, code.drawn]));
  check('tundra: no circle on a creature that has art', code.drawn.indexOf('plain') >= 0 || d(code, 'circle') === 0, JSON.stringify(code.after));
  check('white copies are built once per source, then cached', png.after.built > 0 && png.after.built <= d(png, 'sil') + 64, JSON.stringify(png.after));
  const per = (png.after.ms + code.after.ms) / Math.max(1, png.after.sil + code.after.sil);
  check('per-frame cost of the silhouette flash < 1 ms per flashing creature (first-hit build included)', per < 1, per.toFixed(3) + ' ms');
  check('?hitflash=0: the old circle, no silhouette', !off.after.on && d(off, 'circle') > 0 && off.after.sil === 0, JSON.stringify(off.after));
  check('no page errors', !png.errors.length && !code.errors.length && !off.errors.length, png.errors.concat(code.errors, off.errors).join(' | '));
  check('Firebase never reached', png.db === 0 && code.db === 0 && off.db === 0);
  await browser.close();
  done();
})().catch((e) => { console.error(e); process.exit(1); });
