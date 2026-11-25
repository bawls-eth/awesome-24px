// cycle 7 L (3): the Realm rebuilds its bullet-vs-enemy spatial hash (shared/mm-hash.js, called from realm.js _buildHash) on every
// frame the hero has a bolt in the air. That rebuild allocated about 9 KB per frame with 58 enemies (heap sampler: mm-hash insert
// 7.4-7.6 KB + key 1.7 KB + _buildHash 1.4 KB; 8.9 KB under _buildHash when inlined), a fifth of everything the Realm allocated per
// frame in combat: clear() set every used cell array's length to 0, which drops its storage, so each cell grew a fresh one on the
// next insert; and the cell key (up to 2^32) did not fit a small integer, so every Map lookup boxed a heap number.
// Now a cell is { n, a } (the count is reset, the array is kept) and the key is a small integer within +-16384 cells.
// Proven here: [1] bytes per frame with the browser's sampling heap profiler over CDP (128 byte interval, collected objects
// included) in the Realm world while the hero fires among >= 20 enemies; [2] the hash still answers exactly like brute force over
// 60 rebuilt frames, including cells beyond the small-key range, negative coordinates and the BIG overflow list.
// Bytes only, no millisecond claims. Offline: blockDb, db.attempts() === 0. Never chats, never writes to Firebase.
// Run: BASE=http://localhost:9701/game/index.html NODE_PATH=$(npm root -g) node game/tests/cyc7-lead-hash-alloc.test.js
const { chromium } = require('playwright');
const { check, done, blockDb } = require('./helpers');
const BASE = process.env.BASE || 'http://localhost:8440/game/index.html';
const ORIGIN = new URL(BASE).origin;
const WORLD = ORIGIN + '/game/games/mad-maze/index.html?mode=world&test=1&offline=1&heropick=0&tutorial=0&seed=12345&qdate=2030-05-01';
const SAVE = { realm: { level: 4, xp: 0, shards: 50, bestWave: 2, items: [{ n: 1, id: 'sparkwand', r: 0 }], nextUid: 2, eq: { weapon: 1 } } };
const frames = (page, n) => page.evaluate((k) => new Promise((res) => { let i = 0; const f = () => (++i >= k ? res() : requestAnimationFrame(f)); requestAnimationFrame(f); }), n);

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  const db = await blockDb(ctx);
  await ctx.route('**/game/index.html*', (rt) => rt.fulfill({ contentType: 'text/html', body: '<!doctype html>town' }));
  const page = await ctx.newPage(); const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(ORIGIN + '/game/games/mad-maze/lantern.css');
  await page.evaluate((s) => { localStorage.clear(); localStorage.setItem('pixeltown-save-v1', s); }, JSON.stringify(SAVE));
  await page.goto(WORLD);
  await page.waitForFunction(() => window.__mm && window.__mm.world && window.__mm.arena.active && window.__mm.arena.state === 'play', null, { timeout: 30000 });
  // the hero cannot fall, holds fire to the right and walks: the hash is rebuilt on every frame
  await page.evaluate(() => { const a = window.__mm.arena; a.player.iframes = 1e9; a._hitPlayer = () => {}; a.mouse.seen = true; a.mouse.down = true; a.mouse.x = a.W * 0.7; a.mouse.y = a.H * 0.4; });
  await page.waitForFunction(() => window.__mm.arena.enemies.filter((e) => e.active).length >= 20, null, { timeout: 30000 });
  await frames(page, 600); // warm: compiled, every cell the scene uses exists

  // ---- [1] heap sampling over N frames ----
  const N = 300;
  const cdp = await ctx.newCDPSession(page);
  await cdp.send('HeapProfiler.enable');
  await cdp.send('HeapProfiler.startSampling', { samplingInterval: 128, includeObjectsCollectedByMajorGC: true, includeObjectsCollectedByMinorGC: true });
  const live = await page.evaluate((n) => new Promise((res) => {
    const a = window.__mm.arena; let i = 0, en = 0, builds = 0; const real = a._buildHash; a._buildHash = function () { builds++; return real.call(this); };
    const f = () => { for (let k = 0; k < a.enemies.length; k++) if (a.enemies[k].active) en++; if (++i >= n) { a._buildHash = real; res({ en: en / n, builds: builds / n }); } else requestAnimationFrame(f); };
    requestAnimationFrame(f);
  }), N);
  const { profile } = await cdp.send('HeapProfiler.stopSampling');
  await cdp.detach();
  let hash = 0, build = 0, total = 0;
  (function walk(n, under) {
    const file = n.callFrame.url.replace(/.*\//, '').replace(/\?.*/, ''); const name = n.callFrame.functionName || '(anon)';
    const inBuild = under || (file === 'realm.js' && name === '_buildHash');
    if (/realm|mad-maze|mm-/.test(file)) total += n.selfSize;
    if (file === 'mm-hash.js') hash += n.selfSize;
    if (inBuild) build += n.selfSize; // _buildHash with everything under it (the wrapper above stops it being inlined away)
    n.children.forEach((c) => walk(c, inBuild));
  })(profile.head, false);
  const per = (v) => Math.round(v / N);
  console.log('Realm world, hero firing, ' + live.en.toFixed(1) + ' live enemies, ' + live.builds.toFixed(2) + ' hash rebuilds per frame: ' + per(total) + ' bytes per frame in the game\'s own code; _buildHash and its callees ' + per(build) + ' B/frame, mm-hash.js ' + per(hash) + ' B/frame (' + N + ' frames)');
  check('the scene is busy: >= 20 live enemies on average', live.en >= 20, String(live.en));
  check('the hash is rebuilt on (nearly) every frame while the hero fires', live.builds >= 0.8, String(live.builds));
  // what is left under _buildHash is the two position numbers per enemy handed to insert() (24 bytes per enemy when the call is not
  // inlined; the counting wrapper above can keep it from being inlined): measured 676 B/frame at 29 enemies, against 5556 before.
  check('_buildHash and its callees: at most the two boxed coordinates per enemy (was 5556 B/frame at 29 enemies, about 9 KB at 58)', per(build) <= 24 * live.en + 400, per(build) + ' B/frame at ' + live.en.toFixed(1) + ' enemies');
  check('mm-hash.js itself allocates (near) nothing per frame (insert + key were about 9 KB/frame)', per(hash) <= 600, per(hash) + ' B/frame');

  // ---- [2] same answers as brute force, over rebuilt frames ----
  const same = await page.evaluate(() => {
    let seed = 987654321; const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
    const g = MMHash.create(64); const out = { frames: 0, queries: 0, hits: 0, missed: 0, dup: 0, far: 0, big: 0 };
    for (let f = 0; f < 60; f++) {
      g.clear(); const items = [];
      const n = 20 + Math.floor(rnd() * 60);
      // every third frame sits far outside the small-key range (cells beyond +-16384) or deep in negative coordinates
      const ox = f % 3 === 1 ? 64 * 20000 : f % 3 === 2 ? -64 * 17000 : 0, oy = f % 3 === 1 ? -64 * 30000 : f % 3 === 2 ? 64 * 16380 : 0;
      for (let i = 0; i < n; i++) {
        const it = { id: i, x: ox + (rnd() - 0.5) * 1600, y: oy + (rnd() - 0.5) * 1600, r: 6 + rnd() * 40 };
        if (i === 7 && f % 5 === 0) { it.r = 64 * 40; out.big++; } // a huge footprint: the overflow list
        items.push(it); g.insert(it.id, it.x, it.y, it.r);
      }
      if (ox) out.far++;
      for (let q = 0; q < 120; q++) {
        const x = ox + (rnd() - 0.5) * 1700, y = oy + (rnd() - 0.5) * 1700, r = q % 4 === 0 ? 0 : rnd() * 30;
        const seen = new Map();
        g.query(x, y, r, (id, ix, iy, ir) => { seen.set(id, (seen.get(id) || 0) + 1); if (ix !== items[id].x || iy !== items[id].y || ir !== items[id].r) out.missed++; });
        seen.forEach((c) => { if (c > 1) out.dup++; });
        for (const it of items) { const hit = (x - it.x) * (x - it.x) + (y - it.y) * (y - it.y) < (r + it.r) * (r + it.r); if (hit) { out.hits++; if (!seen.has(it.id)) out.missed++; } }
        out.queries++;
      }
      out.frames++;
    }
    out.size = g.size;
    return out;
  });
  check('60 rebuilt frames x 120 queries: every true circle hit is a candidate, none twice, with its own x / y / r', same.missed === 0 && same.dup === 0 && same.hits > 500 && same.far === 40 && same.big > 0, JSON.stringify(same));

  check('no page errors', errors.length === 0, errors.join(' | '));
  check('offline: no database traffic', db.attempts() === 0, String(db.attempts()));
  await ctx.close(); await browser.close();
  done();
})().catch((e) => { console.error(e); process.exit(1); });
