// Town polish (TP1): offline-join card fits 1280x720, PTT pill clear of the inventory bar, access prefs mirrored.
// OFFLINE: helpers.offlineStub (every database host blocked, Firebase SDK answered empty), so this never touches the live town.
// Run: BASE=http://localhost:8665/game/index.html NODE_PATH=$(npm root -g) node game/tests/town-polish.test.js
const { chromium } = require('playwright');
const { check, done, offlineStub } = require('./helpers');
const BASE = process.env.BASE || 'http://localhost:8440/game/index.html';
const overlap = (a, b) => a && b && a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;

async function open(browser, viewport, touch, prefs) {
  const ctx = await browser.newContext(touch ? { viewport, hasTouch: true, isMobile: true } : { viewport });
  const db = await offlineStub(ctx); // database blocked + Firebase SDK answered empty (the join still ends on "Can't reach the town server")
  if (prefs) await ctx.addInitScript((v) => { try { localStorage.setItem('pixeltown-access-v1', v); } catch (e) {} }, prefs);
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  const real = () => errors.filter((e) => !/ERR_FAILED|ERR_BLOCKED|net::|WebSocket|firebase|FIREBASE|Failed to load resource|ERR_INTERNET|ERR_NAME|Can't reach/i.test(e));
  return { ctx, page, real, db };
}
async function joinOffline(page) {
  await page.goto(BASE);
  await page.fill('#name-input', 'ADMINpolish');
  await page.click('.species-tab');
  await page.click('.avatar-choice');
  await page.click('button:has-text("Join Town")');
  await page.waitForFunction(() => /Can't reach the town server/.test(document.getElementById('join-status').textContent), null, { timeout: 9000 });
}

(async () => {
  const browser = await chromium.launch();
  for (const [label, vp, touch] of [['1280x720', { width: 1280, height: 720 }, false], ['phone 390x844', { width: 390, height: 844 }, true]]) {
    const { page, real, ctx, db } = await open(browser, vp, touch);
    await joinOffline(page);
    const b = await page.locator('#join-offline-btn').boundingBox();
    check(`[${label}] Play offline fully inside the viewport`, b && b.x >= 0 && b.y >= 0 && b.x + b.width <= vp.width && b.y + b.height <= vp.height, JSON.stringify(b));
    check(`[${label}] Play offline is at least 44 px tall`, b && b.height >= 44);
    const card = await page.locator('#join-overlay .join-card').boundingBox();
    check(`[${label}] join card inside the viewport`, card && card.y >= 0 && card.y + card.height <= vp.height + 0.5, JSON.stringify(card));
    await page.click('#join-offline-btn');
    await page.waitForSelector('#player-list-panel', { timeout: 20000 });
    await page.waitForTimeout(1500);
    const inv = await page.locator('#inventory-panel').boundingBox();
    const ptt = await page.locator('#walkie-talk-btn').boundingBox();
    check(`[${label}] PTT pill does not overlap the inventory bar`, !overlap(inv, ptt), JSON.stringify({ inv, ptt }));
    check(`[${label}] PTT pill stays inside the viewport`, ptt && ptt.x >= 0 && ptt.x + ptt.width <= vp.width && ptt.y + ptt.height <= vp.height);
    const sw = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, iw: window.innerWidth }));
    check(`[${label}] no horizontal scroll`, sw.sw <= sw.iw, JSON.stringify(sw));
    check(`[${label}] no console errors`, real().length === 0, real().join(' | '));
    check(`[${label}] no database traffic`, db.attempts() === 0, String(db.attempts()));
    await ctx.close();
  }
  let t = await open(browser, { width: 1280, height: 720 }, false, JSON.stringify({ v: 1, hudScale: 1.5, flashes: false }));
  await t.page.goto(BASE);
  let st = await t.page.evaluate(() => ({ rm: document.body.classList.contains('a11y-reduce-motion'), hs: document.body.classList.contains('a11y-hud-scaled'), v: document.body.style.getPropertyValue('--hud-scale') }));
  check('access prefs: flashes off adds a11y-reduce-motion', st.rm);
  check('access prefs: hudScale 1.5 sets --hud-scale and body class', st.hs && st.v === '1.5', JSON.stringify(st));
  await t.ctx.close();
  t = await open(browser, { width: 1280, height: 720 }, false, '{not json');
  await t.page.goto(BASE);
  st = await t.page.evaluate(() => ({ hs: document.body.classList.contains('a11y-hud-scaled'), v: document.body.style.getPropertyValue('--hud-scale') }));
  check('access prefs: corrupt value falls back to defaults', !st.hs && st.v === '1', JSON.stringify(st));
  check('access prefs: no console errors', t.real().length === 0, t.real().join(' | '));
  await t.ctx.close();
  await browser.close();
  done();
})();
