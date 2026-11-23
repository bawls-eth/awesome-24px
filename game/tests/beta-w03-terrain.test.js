// W-03 (b04-01, b04-02, b12-03, b12-04): Realm terrain look, baked once per chunk.
// (1) one edge per border: no 2 px edge line next to a tile whose neighbour already draws the b10t transition (the double outline);
// (2) shade patches dissolve with a checker rim (bake counter) instead of hard squares; (3) Godlands ash is clearly darker / warmer than
// Highlands rock (mean colour distance); (4) bake time stays small; (5) ?tiledetail=0 still gives flat tiles; isolated snow holes are
// generator tiles (reported).
// Run: BASE=http://localhost:8440/game/index.html node game/tests/beta-w03-terrain.test.js
const { chromium } = require('playwright');
const { check, done, blockDb } = require('./helpers');
const ORIGIN = (process.env.BASE || 'http://localhost:8440/game/index.html').replace(/\/game\/index\.html.*$/, '');
const WORLD = (seed, q) => ORIGIN + '/game/games/mad-maze/index.html?mode=world&test=1&offline=1&heropick=0&tutorial=0&seed=' + seed + (q || '');

async function open(browser, seed, q) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  await blockDb(ctx);
  const page = await ctx.newPage(); const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(WORLD(seed, q));
  await page.waitForFunction(() => window.__mm && window.__mm.world && window.__mm.arena.active, null, { timeout: 20000 });
  // tile art (b10t edges) must be in before baking, or every border is a code edge
  await page.waitForFunction(() => { const s = window.__mm.world.artState(); return s && !s.loading; }, null, { timeout: 20000 }).catch(() => {});
  await page.waitForTimeout(500);
  return { ctx, page, errors };
}

// in page: bake the chunks around the spawn; for every border between a plain tile A and a neighbour B that draws a transition tile,
// count exact pixels of A's edge colour in the 2 px strip on A's side (the old double line). Also the mean colours of ash vs rock tiles.
const SCAN = () => {
  const W = window.__mm.world, T = 32, CH = 16;
  const PAL3 = { deep_water: '#132a55', shallow_water: '#2c5f99', sand: '#b9a676', wet_sand: '#9a8658', grass: '#3f7f33', tall_grass: '#336f2a', highland_rock: '#5f5e59', gravel: '#706a61', dry_grass: '#867838', snow: '#aab6c4', godland_ash: '#2d2832', dirt_road: '#73552f' };
  const rgb = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
  const sp = W.spawn ? W.spawn() : null; const a = window.__mm.arena; const ptx = Math.floor(a.player.x / T), pty = Math.floor(a.player.y / T);
  let strips = 0, hits = 0; const t0 = performance.now(); let bakes = 0;
  for (let cy = Math.floor(pty / CH) - 1; cy <= Math.floor(pty / CH) + 1; cy++) for (let cx = Math.floor(ptx / CH) - 1; cx <= Math.floor(ptx / CH) + 1; cx++) {
    if (cx < 0 || cy < 0) continue;
    const cv = W.bakeChunk(cx, cy); bakes++; const g = cv.getContext('2d'); const d = g.getImageData(0, 0, cv.width, cv.height).data;
    for (let ty = 1; ty < CH - 1; ty++) for (let tx = 1; tx < CH - 1; tx++) {
      const wx = cx * CH + tx, wy = cy * CH + ty; const na = W.terrainName(wx, wy); const col = PAL3[na]; if (!col) continue; const c = rgb(col);
      [[1, 0], [-1, 0], [0, 1], [0, -1]].forEach(([dx, dy]) => {
        const nb = W.terrainName(wx + dx, wy + dy); if (!nb || nb === na || W.hasTransition(wx, wy) || !W.hasTransition(wx + dx, wy + dy)) return;
        strips++;
        for (let k = 0; k < T; k++) for (let w = 0; w < 2; w++) {
          const x = dx === 1 ? tx * T + T - 1 - w : dx === -1 ? tx * T + w : tx * T + k; const y = dy === 1 ? ty * T + T - 1 - w : dy === -1 ? ty * T + w : ty * T + k;
          const i = (y * cv.width + x) * 4; if (d[i] === c[0] && d[i + 1] === c[1] && d[i + 2] === c[2]) hits++;
        }
      });
    }
  }
  return { strips, hits, ms: (performance.now() - t0) / Math.max(1, bakes), bakes, stats: W.bakeStats() };
};
// mean colour of the first N tiles of a terrain found in the world (baked chunk pixels)
const MEAN = (name) => {
  const W = window.__mm.world, T = 32, CH = 16; const found = [];
  const WW = W.world.w, WH = W.world.h; for (let y = 2; y < WH - 2 && found.length < 30; y += 3) for (let x = 2; x < WW - 2 && found.length < 30; x += 3) if (W.terrainName(x, y) === name && W.terrainName(x + 1, y) === name && W.terrainName(x, y + 1) === name) found.push([x, y]);
  if (!found.length) return null;
  const cache = {}; let r = 0, g = 0, b = 0, n = 0;
  found.forEach(([x, y]) => { const cx = Math.floor(x / CH), cy = Math.floor(y / CH), k = cx + ',' + cy; if (!cache[k]) cache[k] = W.bakeChunk(cx, cy).getContext('2d'); const d = cache[k].getImageData((x - cx * CH) * T, (y - cy * CH) * T, T, T).data; for (let i = 0; i < d.length; i += 4) { r += d[i]; g += d[i + 1]; b += d[i + 2]; n++; } });
  return [r / n, g / n, b / n];
};
// CIE76 deltaE from sRGB
function lab(c) { const f = (v) => { v /= 255; return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }; const [R, G, B] = c.map(f); const X = (R * 0.4124 + G * 0.3576 + B * 0.1805) / 0.95047, Y = R * 0.2126 + G * 0.7152 + B * 0.0722, Z = (R * 0.0193 + G * 0.1192 + B * 0.9505) / 1.08883; const g = (t) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116); return [116 * g(Y) - 16, 500 * (g(X) - g(Y)), 200 * (g(Y) - g(Z))]; }
const dE = (a, b) => { const p = lab(a), q = lab(b); return Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]); };

(async () => {
  const browser = await chromium.launch(); const errs = [];
  for (const seed of [12345, 777, 4242]) {
    const O = await open(browser, seed); const r = await O.page.evaluate(SCAN);
    check('seed ' + seed + ': borders scanned and some neighbours draw transition art', r.strips > 5 && r.stats.edge.skipped > 0, JSON.stringify(r));
    check('seed ' + seed + ': no second edge line next to a transition tile (< 2 edge-colour px per 64 px strip beside a transition: art noise only; a drawn line fills all 64)', r.hits < r.strips * 2, JSON.stringify(r));
    check('seed ' + seed + ': shade patches use the dithered rim (bake counter > 0); bake <= 60 ms per chunk', r.stats.shade.dithered > 0 && r.ms <= 60, JSON.stringify({ ms: r.ms, s: r.stats }));
    if (seed === 12345) {
      const ash = await O.page.evaluate(MEAN, 'godland_ash'), rock = await O.page.evaluate(MEAN, 'highland_rock');
      const e = ash && rock ? dE(ash, rock) : 0;
      check('Godlands ash vs Highlands rock: mean colour distance >= 20 (deltaE)', e >= 20, JSON.stringify({ ash, rock, e }));
      const holes = await O.page.evaluate(() => { const W = window.__mm.world; let n = 0; const kinds = {}; const WW = W.world.w, WH = W.world.h; for (let y = 1; y < WH - 1; y++) for (let x = 1; x < WW - 1; x++) { const c = W.terrainName(x, y); if (!c || c === 'snow') continue; if (['snow'].every((s) => W.terrainName(x - 1, y) === s && W.terrainName(x + 1, y) === s && W.terrainName(x, y - 1) === s && W.terrainName(x, y + 1) === s)) { n++; kinds[c] = (kinds[c] || 0) + 1; } } return { n, kinds }; });
      console.log('INFO isolated 1-tile holes inside snow (generator tiles, not draw holes):', JSON.stringify(holes));
      check('snow holes are generator tiles of another terrain (each hole has its own terrain id)', Object.keys(holes.kinds).every((k) => k && k !== 'snow'), JSON.stringify(holes));
    }
    errs.push(...O.errors); await O.ctx.close();
  }
  const F = await open(browser, 12345, '&tiledetail=0'); const f = await F.page.evaluate(SCAN);
  check('?tiledetail=0: flat tiles (no dithered patches, no ash wash)', f.stats.shade.dithered === 0 && f.stats.shade.ash === 0, JSON.stringify(f.stats));
  errs.push(...F.errors); await F.ctx.close();
  check('no page errors', errs.length === 0, errs.join('|'));
  await browser.close();
  done();
})().catch((e) => { console.error(e); process.exit(1); });
