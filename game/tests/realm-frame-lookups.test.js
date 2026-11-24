// cycle1 L-18 (perf): the Realm frame used to build a new matchMedia('(prefers-reduced-motion: reduce)') object and read
// localStorage['mm-reduce-motion'] on EVERY frame (_update -> _readReduced), and the dungeon looked up #realm-wave and #realm-biome
// every frame. Now: one MediaQueryList kept on the arena (its .matches is live), the stored override re-read at most every 50 ms,
// the two dungeon elements cached. Behaviour kept: an OS flip is seen on the next update, a stored flip within 100 ms, and an
// explicit _readReduced() is immediate (telegraph-arena, realm-polish, enemy-death-art rely on those).
// Offline: blockDb + every WebSocket closed. Never chats, never writes to Firebase.
// Run: BASE=http://localhost:9711/game/index.html NODE_PATH=$(npm root -g) node game/tests/realm-frame-lookups.test.js
const { chromium } = require('playwright');
const { check, done, blockDb } = require('./helpers');
const ORIGIN = (process.env.BASE || 'http://localhost:8440/game/index.html').replace(/\/game\/index\.html.*$/, '');
const PAGE = ORIGIN + '/game/games/mad-maze/index.html?mode=dungeon&seed=5&test=1&offline=1';
const SAVE = { realm: { level: 6, xp: 10, shards: 1000, dust: 0, bestWave: 5, items: [{ n: 1, id: 'sparkwand', r: 0 }], nextUid: 5, eq: { weapon: 1 } } };
const FRAMES = 120;

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
  await page.waitForTimeout(1500); // let the first HUD writes settle

  // 1. count the per-frame lookups over 120 real frames of play
  const r = await page.evaluate((FRAMES) => new Promise((res) => {
    const a = window.__mm.arena;
    a.player.iframes = 1e9; a._hitPlayer = () => {};
    const n = { mm: 0, get: 0, wave: 0, biome: 0, frames: 0 };
    const mm = window.matchMedia; window.matchMedia = function (q) { if (/prefers-reduced-motion/.test(q)) n.mm++; return mm.call(window, q); };
    const gi = Storage.prototype.getItem; Storage.prototype.getItem = function (k) { if (k === 'mm-reduce-motion') n.get++; return gi.call(this, k); };
    const ge = Document.prototype.getElementById; Document.prototype.getElementById = function (id) { if (id === 'realm-wave') n.wave++; if (id === 'realm-biome') n.biome++; return ge.call(this, id); };
    const upd = a._update; a._update = function (dt) { n.frames++; return upd.call(this, dt); };
    const t0 = performance.now();
    const step = () => {
      if (n.frames < FRAMES) return requestAnimationFrame(step);
      window.matchMedia = mm; Storage.prototype.getItem = gi; Document.prototype.getElementById = ge; a._update = upd;
      n.ms = Math.round(performance.now() - t0); n.wave0 = document.getElementById('realm-wave').textContent; res(n);
    };
    requestAnimationFrame(step);
  }), FRAMES);
  console.log('measured over ' + r.frames + ' updates (' + r.ms + ' ms): ' + JSON.stringify(r));
  check('the probe saw at least ' + FRAMES + ' updates', r.frames >= FRAMES, JSON.stringify(r));
  check('no matchMedia object is built per frame for reduce motion (was 1 per frame)', r.mm === 0, JSON.stringify(r));
  const cap = Math.ceil(r.ms / 50) + 2;
  check('the stored reduce-motion override is read at most every 50 ms (was every frame): ' + r.get + ' reads <= ' + cap, r.get <= cap && r.get < r.frames, JSON.stringify(r));
  check('the dungeon HUD does not look up #realm-wave / #realm-biome per frame (was 1 each per frame)', r.wave <= 2 && r.biome <= 2, JSON.stringify(r));
  check('the dungeon HUD line is still written', /Room \d+\/\d+/.test(r.wave0), r.wave0);

  // 2. behaviour kept
  check('default: not reduced', await page.evaluate(() => { const a = window.__mm.arena; a._update(0); return a._reduced === false; }));
  await page.emulateMedia({ reducedMotion: 'reduce' });
  check('an OS reduce-motion flip is seen on the very next update', await page.evaluate(() => { const a = window.__mm.arena; a._update(0); return a._reduced === true; }));
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  check('and back on the next update', await page.evaluate(() => { const a = window.__mm.arena; a._update(0); return a._reduced === false; }));
  await page.evaluate(() => localStorage.setItem('mm-reduce-motion', '1')); await page.waitForTimeout(100);
  check('a stored override written by another script is seen within 100 ms of play', await page.evaluate(() => window.__mm.arena._reduced === true));
  await page.evaluate(() => localStorage.setItem('mm-reduce-motion', '0')); await page.waitForTimeout(100);
  check('and its removal too', await page.evaluate(() => window.__mm.arena._reduced === false));
  check('an explicit _readReduced() is immediate (stored override)', await page.evaluate(() => { const a = window.__mm.arena; localStorage.setItem('mm-reduce-motion', '1'); a._readReduced(); const on = a._reduced; localStorage.setItem('mm-reduce-motion', '0'); a._readReduced(); return on === true && a._reduced === false; }));
  check('setReduceMotion() is immediate and stored', await page.evaluate(() => { const a = window.__mm.arena; a.setReduceMotion(true); const on = a._reduced && localStorage.getItem('mm-reduce-motion') === '1'; a.setReduceMotion(false); return on && a._reduced === false; }));
  check('the stored override still beats the OS setting', await (async () => { await page.emulateMedia({ reducedMotion: 'reduce' }); return page.evaluate(() => { const a = window.__mm.arena; localStorage.setItem('mm-reduce-motion', '0'); a._readReduced(); a._update(0); return a._reduced === false; }); })());
  // a frozen clock (page.clock tests) must not freeze the setting: with no time passing the frame reads the store itself
  check('with a frozen clock the frame still follows the store', await page.evaluate(() => {
    const a = window.__mm.arena; const pn = performance.now; const t = pn.call(performance); performance.now = () => t;
    try { a._update(0); localStorage.setItem('mm-reduce-motion', '1'); a._update(0); const on = a._reduced; localStorage.setItem('mm-reduce-motion', '0'); a._update(0); return on === true && a._reduced === false; } finally { performance.now = pn; }
  }));

  check('no page errors', errors.length === 0, errors.join(' | '));
  check('no database traffic', db.count() === 0, JSON.stringify(db.http.concat(db.ws).slice(0, 3)));
  await browser.close();
  done();
})();
