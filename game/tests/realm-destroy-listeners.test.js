// cycle0 L-11: RealmArena.destroy() removes every window / document listener the arena added, the `storage` one included. It was an
// anonymous arrow, so a destroyed arena stayed referenced by the window and kept merging the stored save into itself on every
// storage event. The live arena must of course still get the event.
// Offline: blockDb + every WebSocket closed. Never chats, never writes to Firebase.
// Run: BASE=http://localhost:9701/game/index.html NODE_PATH=$(npm root -g) node game/tests/realm-destroy-listeners.test.js
const { chromium } = require('playwright');
const { check, done, blockDb } = require('./helpers');
const ORIGIN = (process.env.BASE || 'http://localhost:8440/game/index.html').replace(/\/game\/index\.html.*$/, '');
const PAGE = ORIGIN + '/game/games/mad-maze/index.html?mode=dungeon&seed=5&test=1&offline=1';

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  const db = await blockDb(ctx);
  await ctx.routeWebSocket(/.*/, (ws) => ws.close());
  const page = await ctx.newPage(); const errors = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  await page.goto(PAGE);
  await page.waitForFunction(() => window.__mm && window.__mm.arena && window.__mm.arena.active && window.__mm.arena.state === 'play', null, { timeout: 30000 });

  const r = await page.evaluate(() => {
    const live = window.__mm.arena; const out = { live: 0, dead: 0, canvasGone: false, writes: 0 };
    const box = document.createElement('div'); document.body.appendChild(box);
    const second = new RealmArena({ container: box, save: {}, onSave: () => { out.writes++; }, onExit: () => {} }); // never started: no loop, no HUD
    const liveReal = live.resyncSave.bind(live); live.resyncSave = () => { out.live++; return liveReal(); };
    second.resyncSave = () => { out.dead++; return false; };
    second.destroy();
    out.canvasGone = !box.querySelector('canvas');
    window.dispatchEvent(new StorageEvent('storage', { key: 'pixeltown-save-v1' }));
    window.dispatchEvent(new StorageEvent('storage', { key: null })); // storage.clear() in another tab
    window.dispatchEvent(new Event('pagehide'));
    box.remove();
    return out;
  });
  check('the live arena still resyncs on a storage event for the save key (and on a clear)', r.live === 2, JSON.stringify(r));
  check('a destroyed arena no longer hears storage events', r.dead === 0, `resyncSave ran ${r.dead} times on the destroyed arena`);
  check('destroy() took its canvas out and a later pagehide does not make it write', r.canvasGone && r.writes === 0, JSON.stringify(r));
  check('no page errors', errors.length === 0, errors.join(' | '));
  check('offline: no database traffic', db.attempts() === 0, String(db.attempts()));
  await browser.close();
  done();
})().catch((e) => { console.error(e); process.exit(1); });
