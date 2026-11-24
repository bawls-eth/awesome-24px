// Cycle 4 art (G): Isles tundra and jungle ground detail. Frostfang Tundra snow / ice / rock / moss were flat single-colour tiles boxed
// by dashed 32 px seams. A separate overlay (MMIsleArt.biomeDetail, after detail() / fieldDetail(), whose outputs the node tests pin; the
// b30 PNGs are not changed) seeds snow drifts, sparkles, ice cracks and frost on tundra tiles, roots / leaf litter / moss on jungle tiles,
// and softens the seams (soft outer row + neighbour-colour bumps). Bake time only. ?tundradetail=0 / ?jungledetail=0 = off.
// Serve the repo root first:  python3 -m http.server 8440 &
// Run: BASE=http://localhost:8440/game/index.html NODE_PATH=$(npm root -g) node game/tests/cyc4-art-isles-biome-ground.test.js
// No Firebase (blockDb), no network.
const { chromium } = require('playwright');
const { check, done, blockDb } = require('./helpers');
const ORIGIN = (process.env.BASE || 'http://localhost:8440/game/index.html').replace(/\/game\/index\.html.*$/, '');

async function sample(browser, isle, q, names, extra) {
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
  out.stat = await page.evaluate(() => window.__isles.biomeDetail());
  if (extra) out.extra = await page.evaluate(extra);
  await ctx.close();
  return { out, errors, db: db.count() };
}

// per-frame cost: once the chunks round the hero are baked, 90 rendered frames call the overlay 0 times
const perFrame = async () => {
  const I = window.__isles, A = window.MMIsleArt;
  for (let i = 0; i < 10; i++) I.render();
  const real = A.biomeDetail; let calls = 0; A.biomeDetail = function () { calls++; return real.apply(this, arguments); };
  const c0 = I.biomeDetail().chunks;
  for (let i = 0; i < 90; i++) I.render();
  A.biomeDetail = real;
  // pure-function checks on a fixed 16x16 terrain
  const mkc = () => { const c = document.createElement('canvas'); c.width = c.height = 512; return c; };
  const names = ['snow', 'ice_sheet', 'sand', 'jungle_floor'];
  const pal = { snow: ['#e8eef4', '#dbe3eb', '#f5f8fb', '#aab6c4'], ice_sheet: ['#b8d8f0', '#a8c8e0', '#c8e4f8', '#7a9ab8'], sand: ['#e0c98a', '#c8ae6e', '#f0dca0', '#a88e50'], jungle_floor: ['#3f7a35', '#376d2f', '#4a8740', '#285423'] };
  const run = (fill, mixed, biomes) => {
    const c = mkc(), g = c.getContext('2d'), terr = new Uint8Array(256).fill(fill);
    if (mixed) for (let i = 0; i < 256; i++) if ((i % 16) >= 8) terr[i] = mixed;
    const r = A.biomeDetail(g, terr, 16, 16, 0, 0, { names, palette: pal, tile: 32, ch: 16, seed: 11, biomes });
    const d = g.getImageData(0, 0, 512, 512).data; let h = 2166136261, painted = 0;
    for (let i = 0; i < d.length; i += 4) { if (d[i + 3]) painted++; h = Math.imul(h ^ d[i] ^ (d[i + 1] << 8) ^ (d[i + 2] << 16) ^ (d[i + 3] << 24), 16777619); }
    return { r, h: h >>> 0, painted };
  };
  const snowA = run(0), snowB = run(0), sand = run(2), seam = run(0, 2), off = run(0, 0, { tundra: false, jungle: true }), jungle = run(3);
  let ms = 0; for (let k = 0; k < 20; k++) { const c = mkc(), g = c.getContext('2d'), terr = new Uint8Array(256); for (let i = 0; i < 256; i++) terr[i] = (i * 7 + k) % 4 === 2 ? 1 : (i % 5 === 0 ? 3 : 0); const t0 = performance.now(); A.biomeDetail(g, terr, 16, 16, 0, 0, { names, palette: pal, tile: 32, ch: 16, seed: k }); ms += performance.now() - t0; }
  return { calls, chunksDuring: I.biomeDetail().chunks - c0, snowA, same: snowA.h === snowB.h, sand, seam, off, jungle, ms: ms / 20 };
};

(async () => {
  const browser = await chromium.launch();
  const on = await sample(browser, 'tundra', '', ['powder_snow', 'ice_sheet'], perFrame);
  const off = await sample(browser, 'tundra', '&tundradetail=0', ['powder_snow', 'ice_sheet']);
  const s = on.out.stat, f = off.out.stat, x = on.out.extra;
  check('tundra: overlay ran on baked chunks', s.tundra && s.chunks > 0 && s.tiles > 0, JSON.stringify(s));
  check('tundra: drifts, sparkles, cracks, frost and seams each placed (> 3)', s.drifts > 3 && s.sparkles > 3 && s.cracks > 3 && s.frost > 3 && s.seams > 3, JSON.stringify(s));
  const mean = s.ms / Math.max(1, s.chunks);
  console.log('cost: ' + mean.toFixed(2) + ' ms/chunk over ' + s.chunks + ' tundra chunks; pure mixed chunk ' + x.ms.toFixed(2) + ' ms; ' + JSON.stringify(s));
  check('tundra: mean overlay cost < 8 ms per chunk bake', mean < 8, mean.toFixed(2) + ' ms over ' + s.chunks + ' chunks');
  check('per frame: 0 overlay calls in 90 rendered frames once baked (0 ms per frame)', x.calls === 0 && x.chunksDuring === 0, JSON.stringify({ calls: x.calls, chunks: x.chunksDuring }));
  check('?tundradetail=0: no tundra tile touched', !f.tundra && f.tiles === 0 && (f.drifts || 0) + (f.cracks || 0) + (f.frost || 0) + (f.seams || 0) === 0, JSON.stringify(f));
  const ps = on.out.powder_snow, pf = off.out.powder_snow, is = on.out.ice_sheet, isf = off.out.ice_sheet;
  check('powder_snow: more colours with the overlay than without, pixels differ', ps && pf && ps.colors > pf.colors && ps.hash !== pf.hash, JSON.stringify([ps, pf]));
  check('ice_sheet: more colours with the overlay than without, pixels differ', is && isf && is.colors > isf.colors && is.hash !== isf.hash, JSON.stringify([is, isf]));
  check('pure: same inputs paint the same pixels', x.same && x.snowA.painted > 0, JSON.stringify(x.snowA));
  check('pure: sand (not a tundra / jungle terrain) gets 0 painted pixels', x.sand.painted === 0 && x.sand.r.tiles === 0, JSON.stringify(x.sand));
  check('pure: a snow / sand seam gets soft-seam bumps', x.seam.r.seams >= 16 && x.seam.painted > x.snowA.painted / 2, JSON.stringify([x.seam.r, x.seam.painted, x.snowA.painted]) /* half the tiles are sand: the 16 seam tiles add pixels beyond half of the all-snow run */);
  check('pure: biomes.tundra false paints nothing on snow', x.off.painted === 0, JSON.stringify(x.off));
  check('pure: jungle floor gets roots, litter or moss', x.jungle.r.roots + x.jungle.r.litter + x.jungle.r.moss > 20, JSON.stringify(x.jungle.r));
  check('pure: worst case (a seam on nearly every tile, 4 terrains) one chunk < 25 ms (real chunks are pinned < 8 ms above)', x.ms < 25, x.ms.toFixed(2) + ' ms');
  const j = await sample(browser, 'jungle', '', ['jungle_floor']), jf = await sample(browser, 'jungle', '&jungledetail=0', ['jungle_floor']);
  check('jungle: roots / litter / moss placed (> 3)', j.out.stat.jungle && j.out.stat.roots + j.out.stat.litter + j.out.stat.moss > 3, JSON.stringify(j.out.stat));
  check('jungle: jungle_floor chunk pixels change with the overlay, not with it off', j.out.jungle_floor && jf.out.jungle_floor && j.out.jungle_floor.hash !== jf.out.jungle_floor.hash && jf.out.stat.tiles === 0, JSON.stringify([j.out.jungle_floor, jf.out.jungle_floor]));
  const m = await sample(browser, 'meadow', '', ['grass']), mf = await sample(browser, 'meadow', '&tundradetail=0&jungledetail=0', ['grass']);
  check('meadow: grass pixel-identical with and without the overlay (not a tundra / jungle isle)', m.out.grass && mf.out.grass && m.out.grass.hash === mf.out.grass.hash, JSON.stringify([m.out.grass, mf.out.grass]));
  check('no page errors, no DB traffic', [on, off, j, jf, m, mf].every((r) => r.errors.length === 0 && r.db === 0), [on, off, j, jf, m, mf].map((r) => r.errors.join(' | ')).join(' '));
  await browser.close();
  done();
})().catch((e) => { console.error(e); process.exit(1); });
