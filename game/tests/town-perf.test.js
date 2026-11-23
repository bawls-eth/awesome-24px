// Town desktop performance + desktop HUD target sizes. OFFLINE only (bug bash 2026-11-23, netsafety P2-3): every database host is
// blocked for HTTP AND WebSocket (blockDb), the Firebase SDK is answered with an empty stub and the bot enters through "Play offline",
// so it never joins live presence (it used to: blocking HTTP alone let the SDK socket through). ADMIN* name, never chats.
// Run: BASE=http://localhost:8440/game/index.html NODE_PATH=$(npm root -g) node game/tests/town-perf.test.js
//
// Pre-fix baseline (recorded on the CI-like box, 1280x720, headless software rendering, Town idle, DB blocked):
//   long frames (>50 ms): 8.1 per second (every single frame was long, ~3-8 fps while the box was loaded; the beta gate saw ~17.8 fps
//   average with 166 long frames). The cost was GPU/fill-rate bound (CPU profile: ~95% "(program)", JS < 5%): a full-screen blended
//   overlay rectangle that never showed anything, a second full-screen season wash, and ~30 live Graphics objects re-tessellated
//   and flushed every frame. Fixes: one ambient layer drawn only when visible, static Graphics baked to textures, and an adaptive
//   render resolution on desktop (steps 1 -> 0.75 -> 0.5 while frames stay under 28 fps; the canvas keeps its CSS size).
const { chromium } = require('playwright');
const { check, done, blockDb } = require('./helpers');
const LS = require('./lib/load-scale');
const BASE = process.env.BASE || 'http://localhost:8440/game/index.html';
const SDK = /gstatic\.com\/firebasejs\//;
// The SDK stub makes "Join Town" fall through to the offline offer; take it.
async function joinOffline(page, name) {
  await page.fill('#name-input', name);
  await page.click('button:has-text("Join Town")');
  await page.waitForSelector('#join-offline-btn:not(.hidden)', { timeout: 30000 });
  await page.click('#join-offline-btn');
}
const BASELINE_LONG_PER_S = 8.1;

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  const errors = [];
  const db = await blockDb(ctx);
  await ctx.route(SDK, (r) => r.fulfill({ status: 200, contentType: 'application/javascript', body: '/* firebase SDK blocked by town-perf.test.js */' }));
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource|ERR_FAILED|net::/.test(m.text())) errors.push('console: ' + m.text()); });
  await page.route('**/main.js*', async (route) => { const resp = await route.fetch(); route.fulfill({ response: resp, body: (await resp.text()).replace('const game = new Phaser.Game(config);', 'const game = window.__g = new Phaser.Game(config);') }); });
  const scene = (fn, arg) => page.evaluate(`(${fn.toString()})(window.__g.scene.getScene('Town'), ${JSON.stringify(arg)})`);

  await page.goto(BASE);
  await joinOffline(page, 'ADMINperf');
  await page.waitForSelector('#player-list-panel', { timeout: 30000 });
  await page.waitForFunction(() => window.__g && window.__g.scene.getScene('Town') && window.__g.scene.getScene('Town').localBody, null, { timeout: 30000 });

  // ---- structure: no per-frame Graphics, one ambient layer ----
  const st = await scene((s) => {
    const kids = s.children.list;
    const fullScreen = kids.filter((c) => c.type === 'Rectangle' && c.scrollFactorX === 0 && c.width >= s.scale.width && c.height >= s.scale.height && c.visible);
    return { graphics: kids.filter((c) => c.type === 'Graphics').length, fullScreen: fullScreen.length, baked: kids.filter((c) => c.texture && /^baked_/.test(c.texture.key)).length };
  });
  check('static scenery Graphics are baked to textures (only the fishing rod stays live)', st.graphics <= 1 && st.baked >= 20, JSON.stringify(st));
  check('at most ONE full-screen ambient overlay is drawn per frame', st.fullScreen <= 1, JSON.stringify(st));

  // ---- let the adaptive resolution settle, then measure 5 s ----
  // condition, not a sleep: the adaptive scaler is settled once the render scale has not changed for 3 s (at least 5 s in, at most a load-scaled 13 s)
  { const tEnd = Date.now() + LS.budget(13000), tMin = Date.now() + 5000; let last = null, since = Date.now();
    while (Date.now() < tEnd) {
      const cur = await page.evaluate(() => document.getElementById('game-container').dataset.renderScale || '1');
      if (cur !== last) { last = cur; since = Date.now(); }
      if (Date.now() >= tMin && Date.now() - since >= 3000) break;
      await page.waitForTimeout(500);
    } }
  const rs = await page.evaluate(() => Number(document.getElementById('game-container').dataset.renderScale || 1));
  const frames = await page.evaluate(() => new Promise((res) => { const t = []; let last = performance.now(); const t0 = last; const f = (n) => { t.push(n - last); last = n; if (n - t0 < 5000) requestAnimationFrame(f); else res(t); }; requestAnimationFrame(f); }));
  frames.shift();
  const secs = frames.reduce((a, b) => a + b, 0) / 1000;
  const LONG_MS = 50 * LS.fresh(); // a 'long' frame is 50 ms on an idle machine; on a loaded one the threshold scales with the measured slowdown (hard cap 6x)
  const longPerS = frames.filter((x) => x > LONG_MS).length / secs;
  const fps = frames.length / secs;
  console.log(`INFO ${fps.toFixed(1)} fps avg, ${longPerS.toFixed(2)} long frames/s (baseline ${BASELINE_LONG_PER_S}), render scale ${rs}`);
  check(`long frames (>${LONG_MS.toFixed(0)} ms; 50 ms idle) per second reduced vs the pre-fix baseline (${BASELINE_LONG_PER_S}/s)`, longPerS < BASELINE_LONG_PER_S * 0.9, longPerS.toFixed(2));
  check('render scale only ever steps down within its allowed range', [1, 0.75, 0.5].includes(rs), String(rs));
  const cv = await page.evaluate(() => { const r = document.querySelector('#game-container canvas').getBoundingClientRect(); return { w: Math.round(r.width), h: Math.round(r.height) }; });
  check('the canvas still fills the 1280x720 viewport whatever the internal resolution', Math.abs(cv.w - 1280) <= 2 && Math.abs(cv.h - 720) <= 2, JSON.stringify(cv));

  // input still lands on the right world spot after a resolution change: the pointer maps through the scale manager
  // Read the zoom and the render scale in ONE evaluate: the adaptive scaler can step down at any moment on a slow machine (during the 5 s frame sample above), so a scale read earlier no longer matches the zoom read now.
  const pt = await scene((s) => { const cam = s.cameras.main; const gc = document.getElementById('game-container'); return { zoom: cam.zoom, base: s.baseZoom, gw: s.scale.width, rs: Number(gc.dataset.renderScale || 1), k: Number(gc.dataset.renderZoom || gc.dataset.renderScale || 1) }; });
  check('camera zoom is scaled with the render scale so the visible world is unchanged', Math.abs(pt.zoom - pt.base * pt.k) < 1e-6 && [1, 0.75, 0.5].includes(pt.rs), JSON.stringify(pt));

  // ---- desktop HUD targets ----
  const ids = ['achievements-badge', 'map-btn', 'world-map-link', 'museum-badge', 'dailies-btn', 'journal-btn', 'settings-toggle-btn', 'chat-input'];
  const rects = await page.evaluate((list) => list.map((id) => { const e = document.getElementById(id); const r = e.getBoundingClientRect(); return { id, w: Math.round(r.width), h: Math.round(r.height), l: r.left, t: r.top, r: r.right, b: r.bottom }; }), ids);
  rects.forEach((r) => check(`#${r.id} is at least 40 px tall at 1280x720 (${r.w}x${r.h})`, r.h >= 40, JSON.stringify(r)));
  let overlap = null;
  for (let i = 0; i < rects.length; i++) for (let j = i + 1; j < rects.length; j++) {
    const a = rects[i]; const b = rects[j];
    if (a.l < b.r - 1 && b.l < a.r - 1 && a.t < b.b - 1 && b.t < a.b - 1) overlap = `${a.id} x ${b.id}`;
  }
  check('the enlarged HUD buttons do not overlap each other', !overlap, overlap);
  const panel = await page.evaluate(() => { const p = document.getElementById('player-list-panel').getBoundingClientRect(); const c = document.getElementById('chat-input-row').getBoundingClientRect(); return { pr: p.right, pb: p.bottom, pl: p.left, cr: c.right, ct: c.top }; });
  check('the HUD panel stays on screen and clear of the chat bar', panel.pr <= 1280 && panel.pb <= 720 && (panel.pl >= panel.cr || panel.pb <= panel.ct), JSON.stringify(panel));

  check('no console errors', errors.length === 0, errors.join(' | '));
  await browser.close();

  // ---- phone: layout intact ----
  const b2 = await chromium.launch();
  const c2 = await b2.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  const db2 = await blockDb(c2);
  await c2.route(SDK, (r) => r.fulfill({ status: 200, contentType: 'application/javascript', body: '/* firebase SDK blocked by town-perf.test.js */' }));
  const p2 = await c2.newPage();
  const e2 = [];
  p2.on('pageerror', (e) => e2.push(e.message));
  p2.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource|ERR_FAILED|net::/.test(m.text())) e2.push(m.text()); });
  await p2.goto(BASE);
  await joinOffline(p2, 'ADMINperfm');
  await p2.waitForSelector('#player-list-panel', { timeout: 30000 });
  await p2.waitForTimeout(1500);
  const ph = await p2.evaluate(() => ({ sw: document.documentElement.scrollWidth, iw: window.innerWidth, chat: document.getElementById('chat-input').getBoundingClientRect().height, scale: document.getElementById('game-container').dataset.renderScale || '1' }));
  check('phone 390x844: no horizontal scroll, render scale untouched (adaptive scaling is desktop-only)', ph.sw <= ph.iw && ph.scale === '1', JSON.stringify(ph));
  check('phone: no console errors', e2.length === 0, e2.join(' | '));
  check('0 database requests or sockets (desktop + phone)', db.count() === 0 && db2.count() === 0, JSON.stringify({ d: db.http.concat(db.ws).slice(0, 2), p: db2.http.concat(db2.ws).slice(0, 2) }));
  await b2.close();
  done();
})().catch((e) => { console.error(e); process.exit(1); });
