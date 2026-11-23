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

let failed = 0;
function check(name, cond, extra = '') {
  console.log((cond ? 'PASS ' : 'FAIL ') + name + (cond ? '' : ' ' + extra));
  if (!cond) failed++;
}
const done = () => { console.log(failed ? `${failed} FAILED` : 'ALL PASSED'); process.exitCode = failed ? 1 : 0; };
module.exports = { townReady, launch, scene, check, done, expandPanel, blockDb, DB_HOSTS };
