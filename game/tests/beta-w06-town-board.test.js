// W-06 (b12-06): the Town Top Scores board is readable: cap height >= 8 screen px at 1280x720 and 390x844, text inside the board, crisp
// (rendered at >= 2x). OFFLINE only (blockDb + Firebase SDK stubbed, "Play offline"): 0 DB requests, 0 sockets, never chats.
// Run: BASE=http://localhost:8440/game/index.html node game/tests/beta-w06-town-board.test.js
const { chromium } = require('playwright');
const { check, done, blockDb } = require('./helpers');
const BASE = process.env.BASE || 'http://localhost:8440/game/index.html';
const SHOTS = process.env.SHOTS || null;

async function open(browser, viewport) {
  const ctx = await browser.newContext(viewport.width < 600 ? { viewport, hasTouch: true, isMobile: true } : { viewport });
  const db = await blockDb(ctx);
  await ctx.route(/gstatic\.com\/firebasejs\//, (r) => r.fulfill({ status: 200, contentType: 'application/javascript', body: '/* firebase SDK blocked by beta-w06-town-board.test.js */' }));
  const sockets = [];
  const page = await ctx.newPage();
  page.on('websocket', (ws) => sockets.push(ws.url()));
  const errors = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  await page.route('**/main.js*', async (route) => { const resp = await route.fetch(); const body = (await resp.text()).replace('const game = new Phaser.Game(config);', 'const game = window.__g = new Phaser.Game(config);'); route.fulfill({ response: resp, body }); });
  await page.goto(BASE);
  await page.fill('#name-input', 'ADMINw06');
  await page.click('.species-tab'); await page.click('.avatar-choice');
  await page.click('button:has-text("Join Town")');
  await page.waitForSelector('#join-offline-btn:not(.hidden)', { timeout: 9000 });
  await page.click('#join-offline-btn');
  await page.waitForFunction(() => window.__g && window.__g.scene.getScene('Town') && window.__g.scene.getScene('Town').localBody, null, { timeout: 25000 });
  await page.waitForTimeout(1200);
  return { ctx, page, db, sockets, errors };
}

(async () => {
  const browser = await chromium.launch();
  for (const vp of [{ width: 1280, height: 720 }, { width: 390, height: 844 }]) {
    const tag = vp.width + 'x' + vp.height;
    const T = await open(browser, vp); const p = T.page;
    const m = await p.evaluate(() => { const s = window.__g.scene.getScene('Town'); const t = s.noticeBoardText; const cv = window.__g.canvas; const k = cv.getBoundingClientRect().width / window.__g.scale.width; const z = s.cameras.main.zoom * k;
      const fs = parseFloat(t.style.fontSize); const b = t.getBounds(); const r = s.noticeBoardRect || null;
      return { fs, z, cap: fs * 0.7 * z, res: t.style.resolution || t.resolution || 1, text: t.text, b: { x: b.x, y: b.y, w: b.width, h: b.height }, r }; });
    check(tag + ': TOP SCORES cap height >= 8 screen px', m.cap >= 8 && /TOP SCORES/.test(m.text), JSON.stringify(m));
    check(tag + ': the board text sits inside the board', m.r && m.b.x >= m.r.x && m.b.x + m.b.w <= m.r.x + m.r.w && m.b.y >= m.r.y && m.b.y + m.b.h <= m.r.y + m.r.h, JSON.stringify(m));
    check(tag + ': the text renders at >= 2x resolution (crisp when zoomed)', m.res >= 2, JSON.stringify(m.res));
    if (SHOTS) { await p.evaluate(() => { const s = window.__g.scene.getScene('Town'); s.cameras.main.stopFollow(); s.cameras.main.centerOn(1380, 480); }); await p.waitForTimeout(300); await p.screenshot({ path: SHOTS + '/w06-board-' + tag + '.png' }); }
    check(tag + ': offline: 0 database requests and 0 sockets; no page errors', T.db.attempts() === 0 && T.sockets.length === 0 && T.errors.length === 0, JSON.stringify({ e: T.errors }));
    await T.ctx.close();
  }
  await browser.close();
  done();
})().catch((e) => { console.error(e); process.exit(1); });
