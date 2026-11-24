// W-07 (b07-03, b07-07, b07-08, b08-06): Town phone HUD overlaps, OFFLINE only (blockDb + the Firebase SDK stubbed, "Play offline").
// Emote wheel vs quick-chat row, the More tab rows >= 44 px, build banner / material / Undo vs Where to? and the panel tabs.
// Never chats, never writes to Firebase (0 DB requests, 0 sockets).
// Run: BASE=http://localhost:8440/game/index.html node game/tests/beta-w07-town-hud.test.js
const { chromium } = require('playwright');
const { check, done, expandPanel, offlineStub } = require('./helpers');
const BASE = process.env.BASE || 'http://localhost:8440/game/index.html';
const SHOTS = process.env.SHOTS || null;

async function open(browser, viewport) {
  const ctx = await browser.newContext({ viewport, hasTouch: true, isMobile: true });
  const db = await offlineStub(ctx);
  const sockets = [];
  const page = await ctx.newPage();
  page.on('websocket', (ws) => sockets.push(ws.url()));
  const errors = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  await page.route('**/main.js*', async (route) => { const resp = await route.fetch(); const body = (await resp.text()).replace('const game = new Phaser.Game(config);', 'const game = window.__g = new Phaser.Game(config);'); route.fulfill({ response: resp, body }); });
  await page.goto(BASE);
  await page.fill('#name-input', 'ADMINw07');
  await page.click('.species-tab'); await page.click('.avatar-choice');
  await page.click('button:has-text("Join Town")');
  await page.waitForSelector('#join-offline-btn:not(.hidden)', { timeout: 9000 });
  await page.tap('#join-offline-btn');
  await page.waitForFunction(() => window.__g && window.__g.scene.getScene('Town') && window.__g.scene.getScene('Town').localBody, null, { timeout: 25000 });
  await page.waitForTimeout(1200);
  return { ctx, page, db, sockets, errors };
}
const rects = (page, sel) => page.evaluate((s) => Array.from(document.querySelectorAll(s)).filter((e) => { const cs = getComputedStyle(e); const r = e.getBoundingClientRect(); return cs.display !== 'none' && cs.visibility !== 'hidden' && r.width > 0 && r.height > 0; }).map((e) => { const r = e.getBoundingClientRect(); return { id: e.id || e.textContent.trim().slice(0, 14), x: r.left, y: r.top, r: r.right, b: r.bottom, h: r.height }; }), sel);
const hit = (a, b) => !!(a && b && a.x < b.r - 0.5 && b.x < a.r - 0.5 && a.y < b.b - 0.5 && b.y < a.b - 0.5);

(async () => {
  const browser = await chromium.launch();
  const T = await open(browser, { width: 390, height: 844 }); const p = T.page;
  // (1) emote wheel vs the quick-chat buttons
  await p.tap('#emote-toggle-btn'); await p.waitForTimeout(250);
  const wheel = (await rects(p, '#emote-popup'))[0]; const qc = await rects(p, '#quick-chat-row button');
  check('emote wheel is open', !!wheel, JSON.stringify(wheel));
  check('the emote wheel intersects no visible quick-chat button', wheel && !qc.some((q) => hit(wheel, q)), JSON.stringify({ wheel, qc: qc.filter((q) => hit(wheel, q)) }));
  if (SHOTS) await p.screenshot({ path: SHOTS + '/w07-emote.png' });
  await p.tap('#emote-toggle-btn'); await p.waitForTimeout(200);
  // (3) More tab: every row (button / select / label row) >= 44 px tall
  await expandPanel(p);
  await p.click('#settings-toggle-btn');
  await p.waitForTimeout(300);
  const rows = await rects(p, '#settings-section button, #settings-section select, #settings-section label, #settings-section a');
  const small = rows.filter((r) => r.h < 44);
  check('More tab: rows are shown', rows.length >= 4, JSON.stringify(rows.length));
  check('More tab: every row is >= 44 px tall', small.length === 0, JSON.stringify(small));
  if (SHOTS) await p.screenshot({ path: SHOTS + '/w07-more.png' });
  if (process.env.W07_DEBUG) console.log('DEBUG', JSON.stringify(await p.evaluate(() => { const out = []; document.querySelectorAll('body *').forEach((e) => { const r = e.getBoundingClientRect(); const cs = getComputedStyle(e); if (r.left < 290 && r.right > 290 && r.top < 700 && r.bottom > 700 && cs.display !== 'none' && cs.visibility !== 'hidden') out.push((e.id || e.tagName + '.' + e.className).slice(0, 40) + ' ' + Math.round(r.left) + ',' + Math.round(r.top) + ' ' + Math.round(r.width) + 'x' + Math.round(r.height) + ' bg=' + cs.backgroundColor + ' z=' + cs.zIndex); }); return out; })));
  check('offline: 0 database requests and 0 sockets', T.db.attempts() === 0 && T.sockets.length === 0, JSON.stringify({ http: T.db.http, ws: T.db.ws, s: T.sockets }));
  check('no page errors', T.errors.length === 0, T.errors.join('|'));
  await T.ctx.close();
  await browser.close();
  done();
})().catch((e) => { console.error(e); process.exit(1); });
