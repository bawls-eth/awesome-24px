// Cycle 2 art (G): Isles field detail. Hearth Isle grass / clover and the jungle moss were wide single-tone fields at phone zoom. A
// separate overlay (MMIsleArt.fieldDetail, run after MMIsleArt.detail, whose pixels the node tests pin) seeds square flowers, pebbles and
// tufts on grass-like tiles only; PNG terrains (b35 garden_path, b30 jungle_floor) are never touched. ?islefield=0 = off.
// Serve the repo root first:  python3 -m http.server 8440 &
// Run: BASE=http://localhost:8440/game/index.html NODE_PATH=$(npm root -g) node game/tests/cyc2-art-isles-field.test.js
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
  out.field = await page.evaluate(() => window.__isles.fieldDetail());
  // pure-function checks: deterministic, and a non-field terrain is never painted
  out.pure = await page.evaluate(() => {
    const A = window.MMIsleArt, mkc = () => { const c = document.createElement('canvas'); c.width = c.height = 16 * 32; return c; };
    const names = ['grass', 'sand'], pal = { grass: ['#5a9a48', '#447a38', '#79b860', '#33602a'], sand: ['#e0c98a', '#c8ae6e', '#f0dca0', '#a88e50'] };
    const run = (tid) => { const c = mkc(), g = c.getContext('2d'), terr = new Uint8Array(256).fill(tid); const r = A.fieldDetail(g, terr, 16, 16, 0, 0, { names: names, palette: pal, tile: 32, ch: 16, seed: 7 });
      const d = g.getImageData(0, 0, c.width, c.height).data; let h = 2166136261, painted = 0; for (let i = 0; i < d.length; i += 4) { if (d[i + 3]) painted++; h = Math.imul(h ^ d[i] ^ (d[i + 1] << 8) ^ (d[i + 2] << 16) ^ (d[i + 3] << 24), 16777619); } return { r: r, h: h >>> 0, painted: painted }; };
    const a = run(0), b = run(0), s = run(1);
    const tc = mkc(), tg = tc.getContext('2d'), tt = new Uint8Array(256); let ms = 0; for (let k = 0; k < 20; k++) { const t0 = performance.now(); A.fieldDetail(tg, tt, 16, 16, 0, 0, { names: names, palette: pal, tile: 32, ch: 16, seed: k }); ms += performance.now() - t0; } ms /= 20; // the overlay call alone (no readback)
    return { a: a, same: a.h === b.h, sand: s, ms: ms };
  });
  await ctx.close();
  return { out, errors, db: db.count() };
}

(async () => {
  const browser = await chromium.launch();
  const on = await sample(browser, 'meadow', '', ['grass', 'clover_patch', 'garden_path']);
  const off = await sample(browser, 'meadow', '&islefield=0', ['grass', 'clover_patch', 'garden_path']);
  const o = on.out, f = off.out;
  check('meadow: field overlay ran on baked chunks', o.field.on && o.field.chunks > 0, JSON.stringify(o.field));
  check('meadow: flowers, pebbles and tufts each placed (> 5)', o.field.flowers > 5 && o.field.pebbles > 5 && o.field.tufts > 5, JSON.stringify(o.field));
  check('meadow: mean overlay cost < 4 ms per chunk', o.field.ms / Math.max(1, o.field.chunks) < 4, (o.field.ms / Math.max(1, o.field.chunks)).toFixed(2) + ' ms');
  check('?islefield=0: nothing placed', !f.field.on && f.field.flowers + f.field.pebbles + f.field.tufts === 0 && f.field.chunks === 0, JSON.stringify(f.field));
  check('grass: more colours with the overlay than without', o.grass && f.grass && o.grass.colors > f.grass.colors, JSON.stringify([o.grass, f.grass]));
  check('b35 garden_path PNG tiles pixel-identical with and without the overlay', o.garden_path && f.garden_path && o.garden_path.hash === f.garden_path.hash, JSON.stringify([o.garden_path, f.garden_path]));
  check('pure: same inputs paint the same pixels', o.pure.same && o.pure.a.painted > 0, JSON.stringify(o.pure.a));
  check('pure: sand (not a field terrain) gets 0 painted pixels', o.pure.sand.painted === 0 && o.pure.sand.r.flowers + o.pure.sand.r.pebbles + o.pure.sand.r.tufts === 0, JSON.stringify(o.pure.sand));
  check('pure: one full grass chunk < 3 ms', o.pure.ms < 3, o.pure.ms.toFixed(2) + ' ms');
  const j = await sample(browser, 'jungle', '', ['jungle_floor']), jf = await sample(browser, 'jungle', '&islefield=0', ['jungle_floor']);
  check('jungle: b30 jungle_floor PNG tiles untouched by the overlay', j.out.jungle_floor && jf.out.jungle_floor && j.out.jungle_floor.hash === jf.out.jungle_floor.hash, JSON.stringify([j.out.jungle_floor, jf.out.jungle_floor]));
  check('no page errors, no DB traffic', [on, off, j, jf].every((r) => r.errors.length === 0 && r.db === 0), [on, off, j, jf].map((r) => r.errors.join(' | ')).join(' '));
  await browser.close();
  done();
})().catch((e) => { console.error(e); process.exit(1); });
