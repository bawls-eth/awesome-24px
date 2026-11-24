// Cycle 0 art (G), b06-r2-01/02/03: the code-drawn Isles creatures (MMCreatureDraw, the fallback for tundra / mars species and the
// Frost Dragon / Red Titan bosses until Codex strips land) get (1) a pixel finish at bake time: alpha snapped to 0/255 and a 1-art-px
// colour-matched outline in the palette's line colour, and (2) per-id boss features: Frost Dragon wings / tail / snout / horns,
// Red Titan spines / shoulder rocks / horns / lava seams. Real canvases in a browser page (the Node test stubs skip the finish).
// Serve the repo root first:  python3 -m http.server 8440 &
// Run: BASE=http://localhost:8440/game/index.html NODE_PATH=$(npm root -g) node game/tests/cyc0-art-creature-finish.test.js
// No Firebase (blockDb), no network.
const { chromium } = require('playwright');
const { check, done, blockDb } = require('./helpers');
const ORIGIN = (process.env.BASE || 'http://localhost:8440/game/index.html').replace(/\/game\/index\.html.*$/, '');

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 800, height: 600 } });
  const db = await blockDb(ctx);
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  await page.goto(ORIGIN + '/game/games/isles/index.html?test=1&isle=tundra&howto=0');
  await page.waitForFunction(() => window.MMCreatureDraw && window.__isles && window.__isles.world, null, { timeout: 30000 });
  const r = await page.evaluate(() => {
    const D = window.MMCreatureDraw;
    const stats = (cv, lineHex) => {
      const d = cv.getContext('2d').getImageData(0, 0, cv.width, cv.height).data;
      const lr = parseInt(lineHex.slice(1, 3), 16), lg = parseInt(lineHex.slice(3, 5), 16), lb = parseInt(lineHex.slice(5, 7), 16);
      let op = 0, semi = 0, line = 0, edgeLine = 0, edges = 0; const W = cv.width;
      for (let i = 0; i < d.length; i += 4) {
        const a = d[i + 3]; if (a > 0 && a < 255) semi++; if (a === 255) op++;
        if (a === 255 && d[i] === lr && d[i + 1] === lg && d[i + 2] === lb) line++;
      }
      // every opaque pixel that touches transparency (the silhouette edge) should be outline colour
      for (let y = 1; y < cv.height - 1; y++) for (let x = 1; x < W - 1; x++) {
        const o = (y * W + x) * 4; if (d[o + 3] !== 255) continue;
        if (d[o + 7] === 0 || d[o - 1] === 0 || d[o + W * 4 + 3] === 0 || d[o - W * 4 + 3] === 0) { edges++; if (d[o] === lr && d[o + 1] === lg && d[o + 2] === lb) edgeLine++; }
      }
      return { op, semi, line, edges, edgeLine };
    };
    const mk = (w, h) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; };
    const fin = D.makeBaker(mk, 64), raw = D.makeBaker(mk, 64, { finish: false });
    const out = {};
    for (const [id, biome] of [['frost_dragon', 'ice'], ['red_titan', 'mars'], ['giant_plain', 'ice'], ['giant_plain_m', 'mars'], ['shagtusk', 'ice'], ['rustbeetle', 'mars']]) {
      const arch = /dragon|titan|giant/.test(id) ? 'giant' : id === 'shagtusk' ? 'quadruped' : 'blob';
      const t0 = performance.now();
      const b = fin.bake({ id, archetype: arch, size: /dragon|titan|giant/.test(id) ? 'XL' : 'L', biome }, { dpr: 2 });
      const ms = performance.now() - t0;
      const rb = raw.bake({ id, archetype: arch, size: /dragon|titan|giant/.test(id) ? 'XL' : 'L', biome }, { dpr: 2 });
      const P = D.paletteFor(biome);
      out[id] = { ms, fin: stats(b.frames.idle[0], P.line), raw: stats(rb.frames.idle[0], P.line), move: b.frames.move.map((c) => c.toDataURL().length), w: b.w };
    }
    out.extras = D.EXTRA_IDS.slice();
    return out;
  });
  check('EXTRA_IDS lists the two Isles bosses', r.extras.indexOf('frost_dragon') >= 0 && r.extras.indexOf('red_titan') >= 0);
  for (const id of ['frost_dragon', 'red_titan', 'shagtusk', 'rustbeetle']) {
    const s = r[id];
    check(id + ': finished bake has 0 semi-transparent pixels (raw vector bake has ' + s.raw.semi + ')', s.fin.semi === 0 && s.raw.semi > 0, JSON.stringify(s.fin));
    check(id + ': >= 90% of the silhouette edge is the palette line colour (outline)', s.fin.edges > 50 && s.fin.edgeLine >= s.fin.edges * 0.9, JSON.stringify(s.fin));
    check(id + ': bake with finish <= 250 ms (XL / L at dpr 2, 8 frames, once per creature)', s.ms <= 250, s.ms.toFixed(1) + ' ms');
  }
  check('Frost Dragon reads bigger than the plain giant (wings + tail: >= 25% more opaque px)', r.frost_dragon.fin.op >= r.giant_plain.fin.op * 1.25, r.frost_dragon.fin.op + ' vs ' + r.giant_plain.fin.op);
  check('Red Titan differs from the plain giant (spines / plates / horns: >= 8% more opaque px)', r.red_titan.fin.op >= r.giant_plain_m.fin.op * 1.08, r.red_titan.fin.op + ' vs ' + r.giant_plain_m.fin.op);
  check('Frost Dragon wings flap: the 4 move frames differ', new Set(r.frost_dragon.move).size === 4);
  check('no page errors, no DB traffic', errors.length === 0 && db.count() === 0, errors.join(' | '));
  console.log('bake ms (finish on): ' + ['frost_dragon', 'red_titan', 'giant_plain', 'shagtusk', 'rustbeetle'].map((k) => k + ' ' + r[k].ms.toFixed(1)).join(', '));
  await browser.close();
  done();
})().catch((e) => { console.error(e); process.exit(1); });
