// Cycle 3 art (G), R01b stopgap: Realm inner corners on the Highlands / Godlands seams (snow, lava rock, dry grass, gravel). A plain
// tile whose four sides are its own terrain but whose diagonal is another terrain gets that corner from the terrain's own edge tile
// (the artist's notch), so the two neighbours' edge strips no longer meet in a square stair-step. ?icorner=0 = off.
// Run: BASE=http://localhost:8440/game/index.html NODE_PATH=$(npm root -g) node game/tests/cyc3-art-realm-icorner.test.js
// No Firebase (blockDb); nothing written anywhere.
const { chromium } = require('playwright');
const { check, done, blockDb } = require('./helpers');
const ORIGIN = (process.env.BASE || 'http://localhost:8440/game/index.html').replace(/\/game\/index\.html.*$/, '');
const WORLD = ORIGIN + '/game/games/mad-maze/index.html?mode=world&test=1&offline=1&heropick=0&tutorial=0&seed=12345';
const NAMES = ['snow', 'lava_rock', 'dry_grass', 'gravel'];

async function sample(browser, q) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  await blockDb(ctx);
  const page = await ctx.newPage(); const errors = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  await page.goto(WORLD + (q || ''));
  await page.waitForFunction(() => window.__mm && window.__mm.world && window.__mm.arena.active, null, { timeout: 30000 });
  await page.waitForFunction(() => { const s = window.__mm.world.artState(); return !s.loading; }, null, { timeout: 25000 }).catch(() => {});
  await page.waitForTimeout(1500);
  const r = await page.evaluate((NAMES) => {
    const W = window.__mm.world, w = W.world.w, h = W.world.h, T = W.TILE, CH = W.CPX / T;
    // candidates: a non-transition tile of a target terrain, 4 sides same, a diagonal that differs and has an edge tile set (hasTransition on the neighbours)
    const name = (x, y) => W.drawName(x, y);
    const cands = [];
    for (let y = 2; y < h - 2 && cands.length < 400; y++) for (let x = 2; x < w - 2; x++) {
      const n = name(x, y); if (NAMES.indexOf(n) < 0 || W.hasTransition(x, y)) continue;
      if (name(x, y - 1) !== n || name(x + 1, y) !== n || name(x, y + 1) !== n || name(x - 1, y) !== n) continue;
      const diag = [[1, -1], [1, 1], [-1, 1], [-1, -1]].filter(([dx, dy]) => name(x + dx, y + dy) !== n && W.hasTransition(x + dx, y) && W.hasTransition(x, y + dy));
      if (diag.length) cands.push({ x, y, n, dx: diag[0][0], dy: diag[0][1] });
    }
    const chunks = new Map(); cands.slice(0, 60).forEach((c) => { const k = Math.floor(c.x / CH) + ',' + Math.floor(c.y / CH); if (!chunks.has(k)) chunks.set(k, c); });
    const s0 = W.smoothStats().icorners || 0; const t0 = performance.now(); const crops = [];
    let n = 0;
    for (const [k, c] of chunks) {
      if (n++ >= 8) break;
      const [cx, cy] = k.split(',').map(Number); const cv = W.bakeChunk(cx, cy); const g = cv.getContext('2d');
      const px = (c.x - cx * CH) * T + (c.dx > 0 ? T - 10 : 0), py = (c.y - cy * CH) * T + (c.dy > 0 ? T - 10 : 0);
      const d = g.getImageData(px, py, 10, 10).data; let hsh = 0; for (let i = 0; i < d.length; i++) hsh = (hsh * 31 + d[i]) >>> 0;
      crops.push({ k, n: c.n, hsh });
    }
    const ms = (performance.now() - t0) / Math.max(1, Math.min(8, chunks.size));
    const st = W.smoothStats();
    return { cands: cands.length, byT: NAMES.map((t) => cands.filter((c) => c.n === t).length), filled: (st.icorners || 0) - s0, on: st.icornerOn, crops, ms };
  }, NAMES);
  await ctx.close();
  return Object.assign(r, { errors });
}

(async () => {
  const browser = await chromium.launch();
  const on = await sample(browser, '');
  check('the seed has Highlands / Godlands inner-corner seams to fix (>= 5 candidates)', on.cands >= 5, JSON.stringify({ cands: on.cands, byT: on.byT }));
  check('icorner pass on and filled corners while baking those chunks', on.on === true && on.filled >= on.crops.length && on.filled > 0, JSON.stringify({ filled: on.filled, crops: on.crops.length }));
  const off = await sample(browser, '?icorner=0');
  check('?icorner=0: pass off, nothing filled', off.on === false && off.filled === 0, JSON.stringify({ on: off.on, filled: off.filled }));
  const same = on.crops.filter((c) => { const o = off.crops.find((x) => x.k === c.k); return o && o.hsh === c.hsh; });
  check('the corner pixels differ from the old bake in every sampled chunk', on.crops.length > 0 && same.length === 0 && off.crops.length === on.crops.length, JSON.stringify({ n: on.crops.length, same: same.map((c) => c.k) }));
  check('chunk bake stays cheap (< 60 ms per chunk incl. the pass)', on.ms < 60, on.ms.toFixed(1));
  check('no page errors', on.errors.length === 0 && off.errors.length === 0, on.errors.concat(off.errors).join(' | '));
  console.log('INFO icorner candidates', on.cands, JSON.stringify(on.byT), 'filled', on.filled, 'bake ms/chunk', on.ms.toFixed(1));
  await browser.close();
  done();
})().catch((e) => { console.error(e); process.exit(1); });
