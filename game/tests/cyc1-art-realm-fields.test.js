// Cycle 1 art (G), two Realm overworld bake-time changes (nothing per frame):
//  1. field detail: grass / tall grass / meadow / dark grass get sparse seeded flowers, pebbles and tufts (?fielddetail=0 = off),
//     measured: the field pass costs < 8 ms per chunk.
//  2. tree fix: the R03 prop_tree_medium / prop_tree_small canopy is no longer a round ball (bumps + notches + redrawn outline, the
//     strip's own palette only, trunk untouched) (?treefix=0 = the R03 pixels).
// Serve the repo root first:  python3 -m http.server 8440 &
// Run: BASE=http://localhost:8440/game/index.html NODE_PATH=$(npm root -g) node game/tests/cyc1-art-realm-fields.test.js
// Firebase blocked (blockDb), offline, nothing written to any DB.
const { chromium } = require('playwright');
const { check, done, blockDb } = require('./helpers');
const ORIGIN = (process.env.BASE || 'http://localhost:8440/game/index.html').replace(/\/game\/index\.html.*$/, '');
const URL = ORIGIN + '/game/games/mad-maze/index.html?mode=world&test=1&offline=1&heropick=0&tutorial=0&seed=12345';

async function sample(browser, q) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const db = await blockDb(ctx);
  const page = await ctx.newPage(); const errors = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  await page.goto(URL + (q || ''));
  await page.waitForFunction(() => window.__mm && window.__mm.world && window.__mm.arena.active, null, { timeout: 30000 });
  // wait for the R03 strips (world art) so chunks bake with the PNG trees
  await page.waitForFunction(() => { const t = window.__mm.world.treeFix(); const m = t.art('prop_tree_medium'), sm = t.art('prop_tree_small'); return !!m && !!sm && /^r03-/.test(m.src) && /^r03-/.test(sm.src); }, null, { timeout: 20000 }).catch(() => {});
  await page.waitForTimeout(600);
  const r = await page.evaluate(() => {
    const W = window.__mm.world, CH = W.CPX / W.TILE;
    // bake a 7x7 block of chunks round the hero (fresh bakes, so the field stats count them)
    const h = window.__mm.arena.player || window.__mm.arena.hero || { x: W.world.w * W.TILE / 2, y: W.world.h * W.TILE / 2 };
    const hx = Math.floor(h.x / W.TILE / CH), hy = Math.floor(h.y / W.TILE / CH);
    let grassTiles = 0;
    for (let j = -3; j <= 3; j++) for (let i = -3; i <= 3; i++) { const cx = hx + i, cy = hy + j; if (cx < 0 || cy < 0) continue; W.bakeChunk(cx, cy); }
    for (let y = (hy - 3) * CH; y < (hy + 4) * CH; y++) for (let x = (hx - 3) * CH; x < (hx + 4) * CH; x++) if (x >= 0 && y >= 0 && /grass|meadow/.test(W.drawName(x, y))) grassTiles++;
    const tf = W.treeFix();
    const shape = (cv, fw, fh) => { // canopy = opaque px above the trunk band; compactness = perimeter^2 / area (a disc is the minimum)
      const c2 = document.createElement('canvas'); c2.width = fw; c2.height = fh; c2.getContext('2d').drawImage(cv, 0, 0, fw, fh, 0, 0, fw, fh); const d = c2.getContext('2d').getImageData(0, 0, fw, fh).data; const op = (x, y) => x >= 0 && y >= 0 && x < fw && y < fh && d[(y * fw + x) * 4 + 3] >= 128;
      const top = Math.round(fh * (fh > 40 ? 0.47 : 0.72)); let area = 0, per = 0, semi = 0; const cols = {};
      for (let y = 0; y < fh; y++) for (let x = 0; x < fw; x++) { const i = (y * fw + x) * 4; if (d[i + 3] > 0 && d[i + 3] < 255) semi++; if (d[i + 3] >= 128) cols[d[i] + ',' + d[i + 1] + ',' + d[i + 2]] = 1; }
      for (let y = 0; y < top; y++) for (let x = 0; x < fw; x++) if (op(x, y)) { area++; per += (!op(x - 1, y)) + (!op(x + 1, y)) + (!op(x, y - 1)) + (!op(x, y + 1)); }
      let trunk = ''; for (let y = top + 4; y < fh; y++) for (let x = 0; x < fw; x++) trunk += d[(y * fw + x) * 4 + 3] >= 128 ? d[(y * fw + x) * 4] + '.' + d[(y * fw + x) * 4 + 1] : '_';
      // silhouette turns: sign changes of the left / right edge (per row) and the top / bottom edge (per column) of the canopy.
      // A ball (any convex blob) has 1 per side = 4; separate leaf clumps add a turn at every dip between two clumps.
      const turns = (seq) => { let n = 0, last = 0; for (let k = 1; k < seq.length; k++) { const s = Math.sign(seq[k] - seq[k - 1]); if (s && last && s !== last) n++; if (s) last = s; } return n; };
      const L = [], Rt = [], Tp = [], Bt = [];
      for (let y = 0; y < top; y++) { let a = -1, b = -1; for (let x = 0; x < fw; x++) if (op(x, y)) { if (a < 0) a = x; b = x; } if (a >= 0) { L.push(a); Rt.push(b); } }
      for (let x = 0; x < fw; x++) { let a = -1, b = -1; for (let y = 0; y < top; y++) if (op(x, y)) { if (a < 0) a = y; b = y; } if (a >= 0) { Tp.push(a); Bt.push(b); } }
      // solidity = canopy area / convex hull area (pixel corners): a ball is close to 1, separate clumps leave notches (lower)
      const pts = []; for (let y = 0; y < top; y++) for (let x = 0; x < fw; x++) if (op(x, y)) pts.push([x, y], [x + 1, y], [x, y + 1], [x + 1, y + 1]);
      pts.sort((p, q) => p[0] - q[0] || p[1] - q[1]); const cr = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
      const lo = [], up = []; pts.forEach((p) => { while (lo.length >= 2 && cr(lo[lo.length - 2], lo[lo.length - 1], p) <= 0) lo.pop(); lo.push(p); });
      for (let k = pts.length - 1; k >= 0; k--) { const p = pts[k]; while (up.length >= 2 && cr(up[up.length - 2], up[up.length - 1], p) <= 0) up.pop(); up.push(p); }
      const hl = lo.slice(0, -1).concat(up.slice(0, -1)); let ha = 0; for (let k = 0; k < hl.length; k++) { const p = hl[k], q = hl[(k + 1) % hl.length]; ha += p[0] * q[1] - q[0] * p[1]; }
      return { area, per, c: turns(L) + turns(Rt) + turns(Tp) + turns(Bt), sol: +(area / Math.max(1, Math.abs(ha) / 2)).toFixed(3), semi, cols: Object.keys(cols), trunk };
    };
    const trees = {};
    ['prop_tree_medium', 'prop_tree_small'].forEach((id) => { const a = tf.art(id); if (!a) return; const o = shape(a.orig, a.fw, a.fh), f = shape(a.fixed, a.fw, a.fh);
      trees[id] = { same: a.orig === a.fixed, oc: o.c, fc: f.c, os: o.sol, fs: f.sol, semi: f.semi, newCols: f.cols.filter((c) => o.cols.indexOf(c) < 0), trunkSame: o.trunk === f.trunk, oArea: o.area, fArea: f.area }; });
    const fs = W.fieldStats();
    return { fs, grassTiles, tf: { on: tf.on, built: tf.built, draws: tf.draws, ms: tf.ms }, trees };
  });
  await ctx.close();
  return Object.assign(r, { errors, db: db.count() });
}

(async () => {
  const browser = await chromium.launch();
  const on = await sample(browser, '');
  const off = await sample(browser, '&fielddetail=0&treefix=0');
  console.log('INFO field', JSON.stringify(on.fs), 'grass tiles', on.grassTiles, 'trees', JSON.stringify(on.trees), 'treefix', JSON.stringify(on.tf));
  check('the sampled block has grass ground', on.grassTiles > 200, String(on.grassTiles));
  check('default: field detail on, flowers + pebbles + tufts placed', on.fs.on && on.fs.flowers > 10 && on.fs.pebbles > 10 && on.fs.tufts > 10, JSON.stringify(on.fs));
  check('default: detail density stays sparse (< 45% of grass tiles touched)', (on.fs.flowers + on.fs.pebbles + on.fs.tufts) < on.grassTiles * 0.45 * 1.6, JSON.stringify(on.fs));
  // the pass alone, averaged over the fresh chunk bakes (a single chunk can catch a GC pause on a loaded 4-core box: logged, not gated)
  check('default: the field pass costs < 8 ms per chunk (mean over the baked chunks)', on.fs.chunks > 0 && on.fs.ms / on.fs.chunks < 8, `avg ${(on.fs.ms / Math.max(1, on.fs.chunks)).toFixed(2)} ms, worst ${on.fs.maxMs.toFixed(2)} ms, whole chunk max ${on.fs.chunkMaxMs.toFixed(1)} ms over ${on.fs.chunks} chunks`);
  check('?fielddetail=0: nothing placed', !off.fs.on && off.fs.flowers + off.fs.pebbles + off.fs.tufts === 0, JSON.stringify(off.fs));
  ['prop_tree_medium', 'prop_tree_small'].forEach((id) => {
    const t = on.trees[id];
    check(id + ': R03 strip loaded', !!t, JSON.stringify(on.trees));
    if (!t) return;
    check(id + ': canopy silhouette is no longer one ball (solidity down >= 0.012 and more edge turns or deeper notches: dips between leaf clumps)', !t.same && t.fs <= t.os - 0.012 && (t.fc > t.oc || t.fs <= t.os - 0.025), `solidity ${t.os} -> ${t.fs}, edge turns ${t.oc} -> ${t.fc}`);
    check(id + ': only the strip\'s own colours, crisp alpha, canopy size kept (+-15%)', t.newCols.length === 0 && t.semi === 0 && Math.abs(t.fArea - t.oArea) <= t.oArea * 0.15, JSON.stringify(t));
    check(id + ': trunk pixels untouched', t.trunkSame);
  });
  check('default: fixed trees drawn into the baked chunks', on.tf.on && on.tf.built >= 2 && on.tf.draws > 0 && on.tf.ms < 50, JSON.stringify(on.tf));
  check('?treefix=0: no tree fixed or drawn fixed', !off.tf.on && off.tf.built === 0 && off.tf.draws === 0 && off.trees.prop_tree_medium && off.trees.prop_tree_medium.same, JSON.stringify(off.tf));
  check('no page errors', !on.errors.length && !off.errors.length, on.errors.concat(off.errors).join(' | '));
  check('Firebase never reached', on.db === 0 && off.db === 0, `${on.db} ${off.db}`);
  await browser.close();
  done();
})().catch((e) => { console.error(e); process.exit(1); });
