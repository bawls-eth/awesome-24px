// Shared Playwright helpers. Run from the repo root with the static server up:
//   python3 -m http.server 8440 &   NODE_PATH=$(npm root -g) node game/tests/workbench.test.js
// Bots are named ADMIN* and the tests never chat. They do join the live town
// (presence only) but never write anything else to Firebase.
const { chromium } = require('playwright');
const BASE = process.env.BASE || 'http://localhost:8440/game/index.html';

async function launch(viewport = { width: 1000, height: 700 }, seedSave, touch = false) {
  const browser = await chromium.launch();
  // touch=true emulates a phone so the on-screen joystick / A button show.
  const page = await browser.newPage(touch ? { viewport, hasTouch: true, isMobile: true } : { viewport });
  const errors = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  await page.route('**/main.js*', async (route) => {
    const resp = await route.fetch();
    const body = (await resp.text()).replace('const game = new Phaser.Game(config);', 'const game = window.__g = new Phaser.Game(config);');
    route.fulfill({ response: resp, body });
  });
  if (seedSave) {
    await page.addInitScript((v) => {
      if (!sessionStorage.seeded) { sessionStorage.seeded = '1'; localStorage.setItem('pixeltown-save-v1', v); }
    }, JSON.stringify(seedSave));
  }
  await page.goto(BASE);
  await page.fill('#name-input', 'ADMINtest');
  await page.click('.species-tab');
  await page.waitForTimeout(150);
  await page.click('.avatar-choice');
  await page.click('#join-btn');
  await page.waitForSelector('#player-list-panel', { timeout: 20000 });
  await townReady(page);
  await page.waitForTimeout(1500);
  return { browser, page, errors };
}
// Wait for a condition, not a sleep: the Town scene is fully created (its create() sets lifetimeStats late, then the local body
// and the camera). On a loaded box the panel appears before create() finishes, which gave 'Cannot read properties of undefined'.
// Safe to call again after a reload / re-join; the timeout scales with machine load (hard cap 6x) and never fails the test itself.
async function townReady(page, timeout) {
  const LS = require('./lib/load-scale');
  await page.waitForFunction(() => {
    const g = window.__g; const s = g && g.scene && g.scene.getScene && g.scene.getScene('Town');
    return !!(s && s.sys && s.sys.isActive() && s.lifetimeStats && s.localBody && s.cameras && s.cameras.main);
  }, null, { timeout: timeout || LS.budget(20000), polling: 100 }).catch(() => { /* a test that never expects a Town (rare) still gets its own assertions */ });
  // beta S-08: three.js now loads on the first cave visit; tests that call scene.enterUnderground() synchronously get it ready here
  await page.evaluate(() => (typeof window.ugEnsureThree === 'function' ? window.ugEnsureThree() : true)).catch(() => {});
}
const scene = (page, fn, arg) => page.evaluate(`(${fn.toString()})(window.__g.scene.getScene('Town'), ${JSON.stringify(arg)})`);

// On phone widths the "In town" panel starts collapsed to a chip; tests that
// click its buttons (or measure its lines) expand it first.
async function expandPanel(page) {
  const collapsed = await page.evaluate(() => document.getElementById('player-list-panel').classList.contains('collapsed'));
  if (collapsed) { await page.click('#panel-toggle'); await page.waitForTimeout(200); }
}

// DB-safe tests: blockDb(ctx) on a Playwright BrowserContext, BEFORE any page navigates. The live Firebase database and its
// auth hosts never get a request: HTTP is aborted (context.route) and every WebSocket is closed at once (context.routeWebSocket,
// which never connects to the real server). Every attempt is recorded so a test can prove nothing escaped:
//   const db = await blockDb(ctx); ... check('no DB traffic leaked past the block', db.count() >= 0) ; db.http / db.ws are URL lists.
// Use db.attempts() when the page is SUPPOSED to be offline-only and assert it equals 0 (or equals what you expect).
const DB_HOSTS = /firebaseio\.com|firebasedatabase\.app|identitytoolkit|securetoken/i;
async function blockDb(ctx) {
  const rec = { http: [], ws: [], hosts: DB_HOSTS };
  await ctx.route(DB_HOSTS, (route) => { rec.http.push(route.request().url()); return route.abort(); });
  await ctx.routeWebSocket(DB_HOSTS, (ws) => { rec.ws.push(ws.url()); ws.close(); });
  rec.count = () => rec.http.length + rec.ws.length;
  rec.attempts = rec.count;
  return rec;
}

// Town OFFLINE stub on a context (nav-town.test.js pattern): blockDb + the Firebase SDK answered with an empty script, so the
// join falls through to "Play offline". Call BEFORE any page navigates. Returns the blockDb record.
async function offlineStub(ctx) {
  const db = await blockDb(ctx);
  await ctx.route(/gstatic\.com\/firebasejs\//, (r) => r.fulfill({ status: 200, contentType: 'application/javascript', body: '/* firebase SDK blocked (offlineStub) */' }));
  return db;
}
// Expose the Phaser game as window.__g on a page (same rewrite as launch()).
async function exposeGame(page) {
  await page.route('**/main.js*', async (route) => {
    // a page / context closed mid-request disposes the response: ignore that instead of an unhandled rejection
    try {
      const resp = await route.fetch();
      const body = (await resp.text()).replace('const game = new Phaser.Game(config);', 'const game = window.__g = new Phaser.Game(config);');
      await route.fulfill({ response: resp, body });
    } catch (e) { /* page or context already closed */ }
  });
}
// Join the Town through "Play offline" (page must run under offlineStub).
async function joinOffline(page, name = 'ADMINqa') {
  await page.fill('#name-input', name);
  await page.click('.species-tab');
  await page.click('.avatar-choice');
  await page.click('button:has-text("Join Town")');
  await page.waitForSelector('#join-offline-btn:not(.hidden)', { timeout: 9000 });
  await page.click('#join-offline-btn');
  await page.waitForFunction(() => window.__g && window.__g.scene.getScene('Town') && window.__g.scene.getScene('Town').localBody, null, { timeout: 20000 });
  await townReady(page);
}
// twoTabs(ctx, url?): two pages in ONE context (shared localStorage, real `storage` events between them), OFFLINE stub,
// window.__g exposed, errors collected per page. url defaults to BASE (the Town). Returns { db, a, b, errors: {a, b} }.
async function twoTabs(ctx, url) {
  const db = await offlineStub(ctx);
  const errors = { a: [], b: [] };
  const mk = async (tag) => {
    const p = await ctx.newPage();
    p.on('pageerror', (e) => errors[tag].push('pageerror: ' + e.message));
    p.on('console', (m) => { if (m.type() === 'error') errors[tag].push('console: ' + m.text()); });
    await exposeGame(p);
    if (url !== null) await p.goto(url || BASE);
    return p;
  };
  const a = await mk('a'); const b = await mk('b');
  return { db, a, b, errors };
}
// throwingStorage(ctx): every page in the context sees a `localStorage` getter that throws SecurityError (storage blocked /
// some private modes). sessionStorage is left alone. Call BEFORE any page navigates.
async function throwingStorage(ctx) {
  await ctx.addInitScript(() => {
    try {
      Object.defineProperty(window, 'localStorage', { configurable: true, get() { throw new DOMException('The operation is insecure.', 'SecurityError'); } });
    } catch (e) { /* ignore */ }
  });
}

let failed = 0;
function check(name, cond, extra = '') {
  console.log((cond ? 'PASS ' : 'FAIL ') + name + (cond ? '' : ' ' + extra));
  if (!cond) failed++;
}
const done = () => { console.log(failed ? `${failed} FAILED` : 'ALL PASSED'); process.exitCode = failed ? 1 : 0; };
module.exports = { townReady, launch, scene, check, done, expandPanel, blockDb, DB_HOSTS, offlineStub, exposeGame, joinOffline, twoTabs, throwingStorage };
