// Front door (game/index.html inline head script), OFFLINE only: every database host is blocked (blockDb, HTTP + WebSocket), the
// Firebase SDK is answered with an empty stub, the bot types an ADMIN* name and enters through "Play offline"; it never chats.
// navigator.webdriver is forced to false (an init script) so the page behaves as for a real visitor:
//  - a plain visit (no query, no same-origin referrer, top window) lands on the Hub Home (hub/index.html)
//  - ?from=hub and ?town=1 stay in the Town, and Play offline still works at 1280x720 and 390x844 with 0 console errors
//  - a link from inside the game (same-origin referrer) stays; the Town inside an iframe (no referrer) stays
//  - an automated browser (webdriver true, every other Town test) is never redirected
// Run: python3 -m http.server 8440 &   BASE=http://localhost:8440/game/index.html NODE_PATH=$(npm root -g) node game/tests/town-front-door.test.js
const { chromium } = require('playwright');
const { check, done, blockDb } = require('./helpers');
const BASE = process.env.BASE || 'http://localhost:8440/game/index.html';
const ORIGIN = new URL(BASE).origin;

async function ctxFor(browser, viewport, touch, human) {
  const ctx = await browser.newContext(touch ? { viewport, hasTouch: true, isMobile: true } : { viewport });
  const db = await blockDb(ctx);
  await ctx.route(/gstatic\.com\/firebasejs\//, (r) => r.fulfill({ status: 200, contentType: 'application/javascript', body: '/* firebase SDK blocked by town-front-door.test.js */' }));
  if (human) await ctx.addInitScript(() => { try { Object.defineProperty(Navigator.prototype, 'webdriver', { get: () => false, configurable: true }); } catch (e) { /* ignore */ } });
  // a same-origin page with a link and a no-referrer iframe, served by the test (never on disk)
  await ctx.route(ORIGIN + '/game/__front_door_host.html', (r) => r.fulfill({ status: 200, contentType: 'text/html',
    body: '<!doctype html><meta charset="utf-8"><a id="go" href="index.html">Town</a><iframe id="f" referrerpolicy="no-referrer" style="width:390px;height:600px"></iframe>' }));
  return { ctx, db };
}
const errs = (page) => { const e = []; page.on('pageerror', (x) => e.push('pageerror: ' + x.message)); page.on('console', (m) => { if (m.type() === 'error') e.push('console: ' + m.text()); }); return e; };

(async () => {
  const browser = await chromium.launch();
  // 1) plain visit -> Hub Home
  {
    const { ctx, db } = await ctxFor(browser, { width: 390, height: 844 }, true, true);
    const page = await ctx.newPage();
    await page.goto(BASE, { waitUntil: 'domcontentloaded' });
    await page.waitForURL(/\/hub\/index\.html/, { timeout: 15000 }).catch(() => {});
    const u = new URL(page.url());
    check('plain visit lands on the Hub Home (hub/index.html)', /\/game\/hub\/index\.html$/.test(u.pathname) && !u.search, page.url());
    await page.waitForSelector('#home-play', { timeout: 15000 }).catch(() => {});
    const play = await page.evaluate(() => { const a = document.getElementById('home-play'); return a && a.getAttribute('href'); });
    check('the Home Play button leads back into the Town (?from=hub)', play === '../index.html?from=hub', String(play));
    await page.goBack().catch(() => {});
    check('Back does not bounce into the redirect again (location.replace)', !/\/game\/index\.html$/.test(new URL(page.url()).pathname) || page.url() === 'about:blank', page.url());
    check('plain visit: 0 database requests', db.count() === 0);
    await ctx.close();
  }
  // 2) ?from=hub and ?town=1 stay; Play offline works at both sizes
  for (const [label, vp, touch, qs] of [['desktop 1280x720 ?from=hub', { width: 1280, height: 720 }, false, '?from=hub'], ['phone 390x844 ?town=1', { width: 390, height: 844 }, true, '?town=1']]) {
    const { ctx, db } = await ctxFor(browser, vp, touch, true);
    const page = await ctx.newPage();
    const e = errs(page);
    await page.route('**/main.js*', async (route) => { const resp = await route.fetch(); route.fulfill({ response: resp, body: (await resp.text()).replace('const game = new Phaser.Game(config);', 'const game = window.__g = new Phaser.Game(config);') }); });
    await page.goto(BASE + qs, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('#avatar-grid .avatar-choice', { timeout: 15000 });
    check(`${label}: stays in the Town`, /\/game\/index\.html$/.test(new URL(page.url()).pathname), page.url());
    await page.fill('#name-input', 'ADMINdoor');
    await page.click('button:has-text("Join Town")');
    await page.waitForSelector('#join-offline-btn:not(.hidden)', { timeout: 20000 });
    await page.click('#join-offline-btn');
    const ok = await page.waitForFunction(() => window.__g && window.__g.scene.getScene('Town') && window.__g.scene.getScene('Town').localBody, null, { timeout: 30000 }).then(() => true).catch(() => false);
    check(`${label}: Play offline enters the Town`, ok);
    const sw = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, iw: innerWidth }));
    check(`${label}: no horizontal scroll`, sw.sw <= sw.iw, JSON.stringify(sw));
    check(`${label}: 0 console errors`, e.length === 0, e.slice(0, 3).join(' | '));
    check(`${label}: 0 database requests`, db.count() === 0);
    await ctx.close();
  }
  // 3) same-origin link and a no-referrer iframe stay in the Town
  {
    const { ctx, db } = await ctxFor(browser, { width: 1280, height: 720 }, false, true);
    const page = await ctx.newPage();
    await page.goto(ORIGIN + '/game/__front_door_host.html');
    await page.evaluate(() => { document.getElementById('f').src = 'index.html'; });
    const frame = await (await page.waitForSelector('#f')).contentFrame();
    await frame.waitForSelector('#name-input', { timeout: 15000 }).catch(() => {});
    check('the Town inside an iframe is not redirected', /\/game\/index\.html$/.test(new URL(frame.url()).pathname), frame.url());
    await Promise.all([page.waitForNavigation({ waitUntil: 'domcontentloaded' }), page.click('#go')]);
    await page.waitForTimeout(800);
    check('a link from inside the game (same-origin referrer) stays in the Town', /\/game\/index\.html$/.test(new URL(page.url()).pathname), page.url());
    check('links/iframe: 0 database requests', db.count() === 0);
    await ctx.close();
  }
  // 4) automated browsers (every other Town test) are never redirected
  {
    const { ctx, db } = await ctxFor(browser, { width: 390, height: 844 }, true, false);
    const page = await ctx.newPage();
    await page.goto(BASE, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(800);
    check('webdriver: a plain visit stays in the Town (existing tests keep working)', /\/game\/index\.html$/.test(new URL(page.url()).pathname), page.url());
    check('webdriver: 0 database requests', db.count() === 0);
    await ctx.close();
  }
  await browser.close();
  done();
})().catch((e) => { console.error(e); process.exitCode = 1; });
