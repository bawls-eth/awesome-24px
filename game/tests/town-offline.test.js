// Town join with the database UNREACHABLE: status line + 6 s timeout + "Play offline" mode.
// Every database host is blocked (http + websocket), so this test never touches the live town.
// Run: BASE=http://localhost:8564/game/index.html NODE_PATH=$(npm root -g) node game/tests/town-offline.test.js
const { chromium } = require('playwright');
const { check, done } = require('./helpers');
const BASE = process.env.BASE || 'http://localhost:8440/game/index.html';
const DB_HOST = /firebaseio\.com|firebasedatabase\.app|identitytoolkit|securetoken/;

async function run(browser, viewport, touch) {
  const ctx = await browser.newContext(touch ? { viewport, hasTouch: true, isMobile: true } : { viewport });
  const blocked = { http: [], ws: 0, wsSent: 0 };
  await ctx.route(DB_HOST, (r) => { blocked.http.push(r.request().url()); r.abort(); });
  await ctx.routeWebSocket(DB_HOST, () => { blocked.ws++; /* never connect to the server and never answer: a silent, hung database */ });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  await page.route('**/main.js*', async (route) => {
    const resp = await route.fetch();
    const body = (await resp.text()).replace('const game = new Phaser.Game(config);', 'const game = window.__g = new Phaser.Game(config);');
    route.fulfill({ response: resp, body });
  });
  // Blocked-request noise only (the database being unreachable is the point of the test).
  const real = () => errors.filter((e) => !/ERR_FAILED|ERR_BLOCKED|net::|WebSocket|firebase|FIREBASE|Failed to load resource|ERR_INTERNET|ERR_NAME/i.test(e));
  return { ctx, page, blocked, real, errors };
}

(async () => {
  const browser = await chromium.launch();
  for (const [label, viewport, touch] of [['desktop', { width: 1000, height: 700 }, false], ['phone 390x844', { width: 390, height: 844 }, true]]) {
    const { ctx, page, blocked, real } = await run(browser, viewport, touch);
    await page.goto(BASE);
    await page.fill('#name-input', 'ADMINoffline');
    await page.click('.species-tab');
    await page.click('.avatar-choice');
    check(`[${label}] offline button hidden before joining`, await page.locator('#join-offline-btn').isHidden());
    await page.click('button:has-text("Join Town")');
    const t0 = Date.now();
    check(`[${label}] status line shows "Connecting to the town…" right away`, /Connecting to the town…/.test(await page.textContent('#join-status')));
    await page.waitForFunction(() => /Can't reach the town server/.test(document.getElementById('join-status').textContent), null, { timeout: 8000 });
    const took = Date.now() - t0;
    check(`[${label}] timeout message appears within ~7 s (took ${took} ms)`, took < 7500);
    const msg = await page.textContent('#join-status');
    check(`[${label}] message text is the spec text`, msg === "Can't reach the town server. Check your connection, or play offline.", msg);
    check(`[${label}] [Play offline] button is visible`, await page.locator('#join-offline-btn').isVisible());
    const box = await page.locator('#join-offline-btn').boundingBox();
    check(`[${label}] Play offline target is at least 44 px tall`, box && box.height >= 44, JSON.stringify(box));
    if (touch) {
      const sw = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, iw: window.innerWidth }));
      check('[phone] no horizontal scroll on the join screen', sw.sw <= sw.iw, JSON.stringify(sw));
      const inView = box && box.x >= 0 && box.x + box.width <= 390;
      check('[phone] Play offline fits inside 390 px width', inView, JSON.stringify(box));
    }
    const wsBefore = blocked.ws;
    await page.click('#join-offline-btn');
    await page.waitForSelector('#player-list-panel', { timeout: 20000 });
    await page.waitForFunction(() => window.__g && window.__g.scene.getScene('Town') && window.__g.scene.getScene('Town').localBody, null, { timeout: 15000 });
    check(`[${label}] join overlay hides and the town scene runs offline`, await page.evaluate(() => document.getElementById('join-overlay').classList.contains('hidden')) && await page.evaluate(() => window.__g.scene.getScene('Town').net.offline === true));
    const p0 = await page.evaluate(() => { const b = window.__g.scene.getScene('Town').localBody; return { x: b.x, y: b.y }; });
    await page.evaluate(() => { const s = window.__g.scene.getScene('Town'); s.localBody.setVelocityX(120); });
    await page.keyboard.down('ArrowRight'); await page.waitForTimeout(700); await page.keyboard.up('ArrowRight');
    const p1 = await page.evaluate(() => { const b = window.__g.scene.getScene('Town').localBody; return { x: b.x, y: b.y }; });
    check(`[${label}] the player moves (${Math.round(p0.x)} -> ${Math.round(p1.x)})`, Math.abs(p1.x - p0.x) > 5 || Math.abs(p1.y - p0.y) > 5);
    check(`[${label}] alone in town (no other players)`, await page.evaluate(() => window.__g.scene.getScene('Town').allPlayers.size === 1));

    // Chat never sends; says so instead.
    await page.evaluate(() => { const s = window.__g.scene.getScene('Town'); document.getElementById('chat-input').value = 'hello'; s.sendChatMessage(); });
    check(`[${label}] chat is refused locally with an explanation`, await page.evaluate(() => /offline/i.test(document.getElementById('chat-log').innerText)));

    // Town Gate -> Enter the Realm -> in-page frame.
    await page.evaluate(() => { const s = window.__g.scene.getScene('Town'); s.realmMenuOpen = false; s.inRealm = false; s.inUnderground = false; s.openRealmGateMenu(); });
    check(`[${label}] Town Gate menu opens`, await page.evaluate(() => !document.getElementById('realm-menu').classList.contains('hidden')));
    check(`[${label}] co-op/team list is disabled offline (needs the online town)`, await page.evaluate(() => /needs the online town/i.test(document.getElementById('realm-menu').innerText)));
    await page.click('#realm-menu-madmaze');
    await page.waitForSelector('#realm-embed iframe', { timeout: 5000 });
    check(`[${label}] "Enter the Realm" opens the in-page Realm frame`, await page.locator('#realm-embed iframe').count() === 1);
    await page.waitForTimeout(1500);
    await page.evaluate(() => window.postMessage({ pixeltown: 'close-realm' }, location.origin));
    await page.waitForSelector('#realm-embed', { state: 'detached', timeout: 5000 });

    await page.waitForTimeout(1500);
    // The database was never reached and nothing was sent: the only websocket attempts happened
    // before "Play offline" (the join try), and none came after it.
    check(`[${label}] no websocket attempts to the database after choosing offline`, blocked.ws === wsBefore, `${wsBefore} -> ${blocked.ws}`);
    check(`[${label}] the block was effective: the join try hit the blocked database (${blocked.http.length} http + ${blocked.ws} ws), nothing got through`, blocked.http.length + blocked.ws > 0);
    const save = await page.evaluate(() => JSON.parse(localStorage.getItem('pixeltown-save-v1') || '{}'));
    check(`[${label}] pixeltown-save-v1 keeps the name`, save.name === 'ADMINoffline');
    check(`[${label}] no console errors beyond blocked-request noise`, real().length === 0, real().join(' | '));
    await ctx.close();
  }
  await browser.close();
  done();
})();
