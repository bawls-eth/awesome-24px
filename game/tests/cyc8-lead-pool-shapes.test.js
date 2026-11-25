// cycle 8 L (2): cycle 7 measured about 13.5 KB per frame allocated inside realm.js _updateBullets while the hero fires and walks, and
// did not find the cause. Cause (V8 --trace-deopt in a real Realm page): the pooled enemies, bolts and floating texts left their pool
// literal with a few fields and were given the rest later, one by one (an enemy 16 -> 51, later 61 fields; a hero bolt 23 -> 31; an
// enemy bolt 11 -> 13; a text 10 -> 12). Every addition gives the object a new hidden shape and invalidates the optimised code of
// each function that assumed the old one, so _updateBullets (and _updateEnemies, _buildHash, _draw...) kept falling back to the
// interpreter, where bullet maths allocates a number object per operation.
// Fix: every field is declared in the pool literal (realm.js _makePools), with the value the old code wrote first.
// Proven here, deterministically: after 15 s of firing and walking among >= 20 enemies, every object of each pool has the SAME
// list of fields in the same order, used or not (before the fix: enemies 2-3 different lists, hero bolts 2, enemy bolts 2, texts 2).
// Bytes per frame are printed by the heap sampler as INFO only: the figure swings with machine load (how soon the browser
// re-optimises), so it is not asserted. Offline: blockDb, db.attempts() === 0. Never chats, never writes to Firebase.
// Run: BASE=http://localhost:9801/game/index.html NODE_PATH=$(npm root -g) node game/tests/cyc8-lead-pool-shapes.test.js
const { chromium } = require('playwright');
const { check, done, blockDb } = require('./helpers');
const LS = require('./lib/load-scale');
const BASE = process.env.BASE || 'http://localhost:8440/game/index.html';
const ORIGIN = new URL(BASE).origin;
const WORLD = ORIGIN + '/game/games/mad-maze/index.html?mode=world&test=1&offline=1&heropick=0&tutorial=0&seed=12345&qdate=2030-05-01';
const SAVE = { realm: { level: 4, xp: 0, shards: 50, bestWave: 2, items: [{ n: 1, id: 'sparkwand', r: 0 }], nextUid: 2, eq: { weapon: 1 } } };
const POOLS = ['enemies', 'pBullets', 'eBullets', 'texts', 'particles', 'bags', 'drifters', 'hazards'];
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
  await page.goto(WORLD, { waitUntil: 'domcontentloaded', timeout: LS.budget(30000) });
  await page.waitForFunction(() => window.__mm && window.__mm.world && window.__mm.arena.active && window.__mm.arena.state === 'play', null, { timeout: LS.budget(30000) });
  // the hero cannot fall, holds fire to the right and walks a square (new ground, new enemies)
  await page.evaluate(() => {
    const a = window.__mm.arena; a.player.iframes = 1e9; a._hitPlayer = () => {}; a.mouse.seen = true; a.mouse.down = true; a.mouse.x = a.W * 0.7; a.mouse.y = a.H * 0.4;
    let t = 0; setInterval(() => { t++; const k = ['d', 's', 'a', 'w'][Math.floor(t / 8) % 4]; a.keys = {}; a.keys[k] = true; }, 250);
    window.__used = { pb: 0, eb: 0, tx: 0 };
    const tick = () => { for (const b of a.pBullets) if (b.active) { window.__used.pb++; break; } for (const b of a.eBullets) if (b.active) { window.__used.eb++; break; } for (const b of a.texts) if (b.active) { window.__used.tx++; break; } requestAnimationFrame(tick); };
    requestAnimationFrame(tick);
  });
  await page.waitForFunction(() => window.__mm.arena.enemies.filter((e) => e.active).length >= 20, null, { timeout: LS.budget(30000) });
  await frames(page, 600);

  // INFO only: bytes per frame inside _updateBullets (own allocations) over 300 frames
  const N = 300;
  const cdp = await ctx.newCDPSession(page);
  await cdp.send('HeapProfiler.enable');
  await cdp.send('HeapProfiler.startSampling', { samplingInterval: 128, includeObjectsCollectedByMajorGC: true, includeObjectsCollectedByMinorGC: true });
  await frames(page, N);
  const { profile } = await cdp.send('HeapProfiler.stopSampling');
  await cdp.detach();
  let ub = 0, total = 0;
  (function walk(n) {
    const file = n.callFrame.url.replace(/.*\//, '').replace(/\?.*/, '');
    if (/realm|mad-maze|mm-/.test(file)) total += n.selfSize;
    if (file === 'realm.js' && n.callFrame.functionName === '_updateBullets') ub += n.selfSize;
    n.children.forEach(walk);
  })(profile.head);
  console.log('INFO hero firing and walking: _updateBullets itself ' + Math.round(ub / N) + ' B/frame, the game\'s own code ' + Math.round(total / N) + ' B/frame (' + N + ' frames; not asserted, swings with machine load)');

  const st = await page.evaluate((pools) => {
    const a = window.__mm.arena; const out = { used: window.__used, live: a.enemies.filter((e) => e.active).length, pools: {} };
    for (const p of pools) {
      const sig = new Map();
      for (const o of a[p]) { const s = Object.keys(o).join(','); sig.set(s, (sig.get(s) || 0) + 1); }
      out.pools[p] = { n: a[p].length, shapes: [...sig.entries()].map(([s, n]) => n + ' x ' + s.split(',').length + ' fields') };
    }
    return out;
  }, POOLS);
  check('the scene is busy: >= 20 live enemies, hero bolts, enemy bolts and floating texts were all in use', st.live >= 20 && st.used.pb > 100 && st.used.eb > 20 && st.used.tx > 5, JSON.stringify([st.live, st.used]));
  for (const p of POOLS) check(p + ': every pooled object has one and the same list of fields, used or not', st.pools[p].shapes.length === 1, st.pools[p].n + ' objects: ' + st.pools[p].shapes.join(' | '));

  // The world grows the enemy and enemy-bolt pools (setWorld). Objects from two different literals never share a hidden shape, even
  // with the same fields (that second literal was the larger half of the cost), so both places must use the one factory.
  const src = require('fs').readFileSync(require('path').join(__dirname, '..', 'realm.js'), 'utf8');
  const count = (re) => (src.match(re) || []).length;
  check('realm.js: one enemy literal and one enemy-bolt literal, shared by the pool and by its growth (factory used twice each)',
    count(/active: false, type: 'aimed'/g) === 1 && count(/kind: 0, ea: null/g) === 1 && count(/\bRM_NEW_ENEMY\b/g) === 3 && count(/\bRM_NEW_EBOLT\b/g) === 3,
    JSON.stringify([count(/active: false, type: 'aimed'/g), count(/kind: 0, ea: null/g), count(/\bRM_NEW_ENEMY\b/g), count(/\bRM_NEW_EBOLT\b/g)]));
  check('the pools were grown by the world (enemies > 24, enemy bolts > 420), so the shape check above covers the grown objects', st.pools.enemies.n > 24 && st.pools.eBullets.n > 420, st.pools.enemies.n + ' / ' + st.pools.eBullets.n);

  check('no page errors', errors.length === 0, errors.join(' | '));
  check('offline: no database traffic', db.attempts() === 0, String(db.attempts()));
  await ctx.close(); await browser.close();
  done();
})().catch((e) => { console.error(e); process.exit(1); });
