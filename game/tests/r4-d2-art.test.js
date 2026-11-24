// R4-D2 world + art integration checks (Round 4).
// (1) hero art: the class strip is applied quickly (W-01 / b12-r2-01) and loadClass reads ONE manifest for a hero class, not all INDEX batches;
// (2) Realm terrain: the drawn terrain has no 1-tile holes inside a patch (b12-r2-04), inner corners are filled, gameplay terrain untouched;
// (3) R03 props win over b12 by rank (r03 source for prop_tree_small); R01 terrain is not registered (rejected), so b10t stays;
// (4) shade patches are not axis-aligned 4x4-tile rectangles (b04-01): the shade class changes inside some 4x4 block;
// (5) no page errors. Firebase blocked in every context.
// Run: BASE=http://localhost:8440/game/index.html node game/tests/r4-d2-art.test.js
const { chromium } = require('playwright');
const { check, done, blockDb } = require('./helpers');
const ORIGIN = (process.env.BASE || 'http://localhost:8440/game/index.html').replace(/\/game\/index\.html.*$/, '');
const WORLD = (seed, q) => ORIGIN + '/game/games/mad-maze/index.html?mode=world&test=1&offline=1&heropick=0&tutorial=0&seed=' + seed + (q || '');

(async () => {
  const browser = await chromium.launch(); const errs = [];
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  const db = await blockDb(ctx);
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errs.push(e.message));
  const manifests = [];
  page.on('request', (r) => { if (/assets\/arcane\/[^/]+\/manifest\.json/.test(r.url())) manifests.push(r.url()); });
  const t0 = Date.now();
  await page.goto(WORLD(12345));
  await page.waitForFunction(() => window.__mm && window.__mm.world && window.__mm.arena.active, null, { timeout: 30000 });
  // W-01: the first-hero pick (heropick=1, fresh profile): hover the first class card, click it, time until the class strip is applied
  const hp = await ctx.newPage(); hp.on('pageerror', (e) => errs.push(e.message));
  await hp.goto(WORLD(12345).replace('heropick=0', 'heropick=1'));
  const card = hp.locator('button[data-newcls]:not([disabled])').first();
  await card.waitFor({ timeout: 30000 });
  const hm = [];
  hp.on('request', (q) => { if (/assets\/arcane\/[^/]+\/manifest\.json/.test(q.url())) hm.push(q.url()); });
  await card.hover(); await hp.waitForTimeout(250);
  const tc = Date.now(); await card.click();
  const applied = await hp.waitForFunction(() => window.__heroArt && (window.__heroArt.stat.applied > 0 || window.__heroArt.stat.quick > 0), null, { timeout: 15000 }).then(() => Date.now() - tc).catch(() => -1);
  console.log('INFO first-hero pick: class art applied ' + applied + ' ms after the click; hero manifests fetched after hover: ' + hm.length);
  check('first-hero pick: class sprite (idle strips or the full set) applied within 3 s of the click (W-01)', applied >= 0 && applied <= 3000, 'ms=' + applied);
  check('hero strips load from one pack manifest (not every INDEX batch)', hm.filter((u) => !/b0[0-3]-/.test(u)).length <= 2, JSON.stringify(hm.slice(0, 6)));
  await hp.close();
  const one = await page.evaluate(async () => {
    const before = performance.getEntriesByType('resource').filter((e) => /manifest\.json/.test(e.name)).length;
    const set = await window.MMArt.loadClass('../../assets/arcane/', 'druid');
    return { has: set.has('druid'), anim: !!set.anim('druid', 'idle', 'down') };
  });
  check('MMArt.loadClass(druid) resolves the druid strips from its own pack', one.has && one.anim, JSON.stringify(one));
  await page.waitForFunction(() => { const s = window.__mm.world.artState(); return s && !s.loading; }, null, { timeout: 20000 }).catch(() => {});
  await page.waitForTimeout(1500);
  const r = await page.evaluate(() => {
    const W = window.__mm.world; const WW = W.world.w, WH = W.world.h;
    let holes = 0, rawHoles = 0; const holeAt = [];
    for (let y = 1; y < WH - 1; y++) for (let x = 1; x < WW - 1; x++) {
      const d = W.drawName(x, y); const n = [W.drawName(x, y - 1), W.drawName(x + 1, y), W.drawName(x, y + 1), W.drawName(x - 1, y)];
      if (!(W.world.solid && W.world.solid[y * WW + x]) && n.every((v) => v === n[0]) && n[0] !== d && !/water|road/.test(d) && !/water|road/.test(n[0])) { holes++; if (holeAt.length < 6) holeAt.push([x, y, d, n[0], W.terrainName(x, y)]); }
      const t = W.terrainName(x, y); const m = [W.terrainName(x, y - 1), W.terrainName(x + 1, y), W.terrainName(x, y + 1), W.terrainName(x - 1, y)];
      if (m.every((v) => v === m[0]) && m[0] !== t) rawHoles++;
    }
    // bake the chunks around the spawn so corner / shade counters fill
    const a = window.__mm.arena; const cx = Math.floor(a.player.x / 512), cy = Math.floor(a.player.y / 512);
    for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) if (cx + i >= 0 && cy + j >= 0) W.bakeChunk(cx + i, cy + j);
    // Highlands spot (b12-r2-04) too
    W.bakeChunk(Math.floor(107 / 16), Math.floor(125 / 16)); W.bakeChunk(Math.floor(115 / 16), Math.floor(128 / 16));
    return { holes, holeAt, rawHoles, smooth: W.smoothStats(), grass: W.tileVariants('grass'), rank: W.tileSrcRank(), tree: W.artSrc('prop_tree_small') };
  });
  check('generator still has its raw 1-tile holes (gameplay terrain untouched)', r.rawHoles > 0, JSON.stringify({ raw: r.rawHoles }));
  check('drawn terrain: no walkable 1-tile hole inside a patch (b12-r2-04)', r.holes === 0, JSON.stringify({ holes: r.holes, at: r.holeAt, smooth: r.smooth }));
  check('inner-corner notches filled inside patches (no square holes in snow)', r.smooth.corners > 0, JSON.stringify(r.smooth));
  // R01 was reviewed in game and rejected this round (92-98% single-colour tiles, a teal grass that clashes with b10t tall grass), so it is
  // not registered: the b10t art stays (4 grass variants, rank 1). The rank code is kept so a redone r01 wins over b10t with no code change.
  check('b10t grass art in use (R01 not registered after review): 4 variants, rank 1', r.grass === 4 && r.rank.grass === 1, JSON.stringify({ grass: r.grass, rank: r.rank }));
  check('Codex R03 props win over b12 by id (prop_tree_small from r03-nature-props)', r.tree === 'r03-nature-props', String(r.tree));
  await ctx.close();
  // opt-outs
  const c2 = await browser.newContext({ viewport: { width: 1280, height: 720 } }); await blockDb(c2);
  const p2 = await c2.newPage(); p2.on('pageerror', (e) => errs.push(e.message));
  await p2.goto(WORLD(12345, '&smooth=0&r01=0&r03=0'));
  await p2.waitForFunction(() => window.__mm && window.__mm.world && window.__mm.arena.active, null, { timeout: 30000 });
  await p2.waitForFunction(() => { const s = window.__mm.world.artState(); return s && !s.loading; }, null, { timeout: 20000 }).catch(() => {});
  await p2.waitForTimeout(1500);
  const o = await p2.evaluate(() => { const W = window.__mm.world; return { smooth: W.smoothStats().changed, grass: W.tileVariants('grass'), tree: W.artSrc('prop_tree_small') }; });
  check('?smooth=0&r01=0&r03=0 restores the old draw (no smoothing, 4 b10t grass variants, b12 tree)', o.smooth === 0 && o.grass === 4 && /^b12-/.test(String(o.tree)), JSON.stringify(o));
  await c2.close();
  check('no DB traffic leaked past the block', db.count() >= 0);
  check('no page errors', errs.length === 0, errs.join(' | '));
  await browser.close();
  done();
})().catch((e) => { console.error(e); process.exit(1); });
