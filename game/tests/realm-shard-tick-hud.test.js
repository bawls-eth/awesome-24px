// cycle0 L-04 (perf): while the shard counter ticks toward a new total (about half a second after EVERY kill, coin or sale) the
// Realm used to run a full _syncHud() each frame: about 25 element lookups and 15 DOM writes (HP text, level, XP, four ability
// aria-labels ...) to change one number. Now only the counter is written. This counts real DOM mutations during a tick.
// Offline: blockDb + every WebSocket closed. Never chats, never writes to Firebase.
// Run: BASE=http://localhost:9701/game/index.html NODE_PATH=$(npm root -g) node game/tests/realm-shard-tick-hud.test.js
const { chromium } = require('playwright');
const { check, done, blockDb } = require('./helpers');
const ORIGIN = (process.env.BASE || 'http://localhost:8440/game/index.html').replace(/\/game\/index\.html.*$/, '');
const PAGE = ORIGIN + '/game/games/mad-maze/index.html?mode=dungeon&seed=5&test=1&offline=1';
const SAVE = { realm: { level: 6, xp: 10, shards: 1000, dust: 0, bestWave: 5, items: [{ n: 1, id: 'sparkwand', r: 0 }], nextUid: 5, eq: { weapon: 1 } } };

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  const db = await blockDb(ctx);
  await ctx.routeWebSocket(/.*/, (ws) => ws.close());
  const page = await ctx.newPage(); const errors = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  await page.goto(ORIGIN + '/game/games/mad-maze/lantern.css');
  await page.evaluate((v) => { localStorage.clear(); localStorage.setItem('pixeltown-save-v1', v); }, JSON.stringify(SAVE));
  await page.goto(PAGE);
  await page.waitForFunction(() => window.__mm && window.__mm.arena && window.__mm.arena.active && window.__mm.arena.state === 'play', null, { timeout: 30000 });

  const r = await page.evaluate(() => new Promise((res) => {
    const a = window.__mm.arena;
    a.player.iframes = 1e9; a._hitPlayer = () => {}; a.eBullets.forEach((b) => { b.active = false; }); a.enemies.forEach((e) => { e.active = false; });
    a._syncHud(true); // a settled HUD first
    const idOf = (n) => { let e = n.nodeType === 1 ? n : n.parentElement; while (e && !e.id) e = e.parentElement; return e ? e.id : '?'; };
    const hits = {}; let frames = 0, full = 0;
    const real = a._syncHud.bind(a); a._syncHud = function (f) { full++; return real(f); };
    const mo = new MutationObserver((list) => list.forEach((m) => { const id = idOf(m.target); hits[id] = (hits[id] || 0) + 1; }));
    const start = () => {
      mo.observe(document.body, { subtree: true, childList: true, characterData: true, attributes: true });
      const from = a.displayShards; a.save.shards += 480; // what a kill / coin does: the total jumps, the counter ticks up to it
      const texts = [];
      const step = () => {
        frames++; texts.push(document.getElementById('realm-shards').textContent);
        if (a.displayShards !== a.save.shards && frames < 600) return requestAnimationFrame(step);
        requestAnimationFrame(() => { // one more frame so the last write is observed
          const recs = mo.takeRecords(); recs.forEach((m) => { const id = idOf(m.target); hits[id] = (hits[id] || 0) + 1; }); mo.disconnect();
          res({ hits, frames, full, from, to: a.save.shards, shown: document.getElementById('realm-shards').textContent, distinct: texts.filter((t, i) => texts.indexOf(t) === i).length });
        });
      };
      requestAnimationFrame(step);
    };
    requestAnimationFrame(() => requestAnimationFrame(start)); // two calm frames before observing
  }));
  const hud = ['realm-hp-fill', 'realm-hp-text', 'realm-level', 'realm-xp-fill', 'realm-xp-text', 'realm-wave', 'realm-biome', 'realm-best', 'realm-ab-0', 'realm-ab-1', 'realm-ab-2', 'realm-ab-3'];
  const touched = hud.filter((id) => r.hits[id]);
  check('the counter ticks over several frames and ends on the new total', r.frames >= 4 && r.distinct >= 4 && r.shown === `💎 ${r.to}` && r.to === r.from + 480, JSON.stringify(r));
  check('the counter element is what changes during the tick', (r.hits['realm-shards'] || 0) >= 3, JSON.stringify(r.hits));
  check('no other HUD element is rewritten while the counter ticks (HP, level, XP, wave, abilities)', touched.length === 0, 'rewritten: ' + touched.map((id) => `${id} x${r.hits[id]}`).join(', '));
  check('no full HUD sync runs per tick frame', r.full === 0, `${r.full} full syncs in ${r.frames} frames`);

  // the full sync still writes the counter (a jump with no tick, e.g. after a forge undo)
  const full = await page.evaluate(() => { const a = window.__mm.arena; a.save.shards = 77; a.displayShards = 77; a._syncHud(); return document.getElementById('realm-shards').textContent; });
  check('_syncHud still writes the counter itself', full === '💎 77', full);
  check('no page errors', errors.length === 0, errors.join(' | '));
  check('offline: no database traffic', db.attempts() === 0, String(db.attempts()));
  await browser.close();
  done();
})().catch((e) => { console.error(e); process.exit(1); });
