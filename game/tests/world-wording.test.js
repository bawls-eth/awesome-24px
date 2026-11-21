// World-mode wording (PLAYTEST-REVIEW #15, #16) and HUD-safe floating numbers (#18).
// In the world (no waves) the HUD, banners, death screen and shop footer never say 'wave' / 'Get ready' / 'Reach wave 2'; the death
// screen names the zone; the shop also unlocks by hero level there. The classic arena keeps its wave wording.
// Floating numbers are drawn below the top-right HUD buttons, never under them.
// Run: BASE=http://localhost:8440/game/index.html NODE_PATH=$(npm root -g) node game/tests/world-wording.test.js
const { chromium } = require('playwright');
const { check, done } = require('./helpers');
const ORIGIN = (process.env.BASE || 'http://localhost:8440/game/index.html').replace(/\/game\/index\.html.*$/, '');
const PAGE = ORIGIN + '/game/games/mad-maze/index.html';
const SAVE = { realm: { level: 1, xp: 0, shards: 900, bestWave: 0, items: [], nextUid: 1, eq: {} } };

async function open(browser, q, opts) {
  const ctx = await browser.newContext(opts || { viewport: { width: 1000, height: 700 } });
  await ctx.routeWebSocket(/.*/, (ws) => ws.close());
  await ctx.route('**/game/index.html*', (r) => r.fulfill({ contentType: 'text/html', body: '<!doctype html><title>town</title>town' }));
  const page = await ctx.newPage();
  page.errors = [];
  page.on('pageerror', (e) => page.errors.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error') page.errors.push('console: ' + m.text()); });
  await page.goto(ORIGIN + '/game/games/mad-maze/lantern.css');
  await page.evaluate((v) => { localStorage.clear(); localStorage.setItem('pixeltown-save-v1', v); localStorage.setItem('mm-aim-assist', '0'); }, JSON.stringify(SAVE));
  page.errors.length = 0;
  await page.goto(PAGE + '?' + q);
  await page.waitForFunction(() => window.__mm && window.__mm.arena && window.__mm.arena.active, null, { timeout: 15000 });
  return { ctx, page };
}
const txt = (id) => { const e = document.getElementById(id); return e ? e.textContent : ''; };

(async () => {
  const browser = await chromium.launch();
  const errs = [];

  // ===== world =====
  const W = await open(browser, 'mode=world&test=1&seed=12345');
  await W.page.waitForFunction(() => window.__mm.arena.state === 'play' && document.getElementById('realm-wave').textContent === 'Shore');
  const w1 = await W.page.evaluate(() => {
    const a = window.__mm.arena; const t = (id) => { const e = document.getElementById(id); return e ? e.textContent : ''; };
    a._syncHud(true); // a HUD refresh must not bring 'Get ready' back over the zone
    const hud = { wave: t('realm-wave'), best: t('realm-best') };
    a.save.bestWave = 0; a.save.level = 1; const stock1 = a.shopStock().map((o) => o.r);
    a.setShop(true); const shop1 = t('realm-shop-body'); a.setShop(false);
    a.save.level = 4; const stock4 = a.shopStock().map((o) => o.r);
    a.setShop(true); const shop4 = t('realm-shop-body'); a.setShop(false);
    a.save.level = 1;
    return { hud, stock1: [...new Set(stock1)], stock4: [...new Set(stock4)], shop1, shop4, banner: a.bannerText };
  });
  check('world HUD keeps the zone after a refresh (no "Get ready", no best wave)', w1.hud.wave === 'Shore' && w1.hud.best === '', JSON.stringify(w1.hud));
  check('world shop footer uses level wording ("Reach level 4 to unlock Uncommon gear.") and never says wave', /Reach level 4 to unlock Uncommon gear\./.test(w1.shop1) && !/wave/i.test(w1.shop1) && /Reach level 8 to unlock Rare gear\./.test(w1.shop4) && !/wave/i.test(w1.shop4), JSON.stringify([w1.shop1.slice(-80), w1.shop4.slice(-80)]));
  check('world shop: level 4 really unlocks Uncommon (as the footer says)', w1.stock1.join() === '0' && w1.stock4.join() === '0,1', JSON.stringify([w1.stock1, w1.stock4]));
  check('world start banner is not the wave banner', !/wave/i.test(w1.banner), w1.banner);
  const d = await W.page.evaluate(async () => {
    const a = window.__mm.arena; const t = (id) => { const e = document.getElementById(id); return e ? e.textContent : ''; };
    a.player.iframes = 0; a.shield.hits = 0; a._hitPlayer(9999);
    const banner = t('realm-banner'); const hudWave = t('realm-wave');
    a._showDeath();
    const recap = (document.querySelector('#realm-death .rm-recap') || {}).textContent || '';
    const zoneRow = (document.querySelector('#realm-death .rm-zone-row b') || {}).textContent || '';
    return { state: a.state, banner, hudWave, recap, zoneRow };
  });
  check('world death banner names the zone and never says wave', d.state === 'dead' && /in Shore/.test(d.banner) && !/wave/i.test(d.banner), d.banner);
  check('world HUD after a death does not say "Get ready" or "Wave"', !/get ready|wave/i.test(d.hudWave), d.hudWave);
  check('world death screen shows the zone row (Shore) and no "Wave reached"', d.zoneRow === 'Shore' && !/wave/i.test(d.recap), JSON.stringify(d));
  // (6) floating numbers under the top-right HUD buttons are drawn just below them
  const ft = await W.page.evaluate(() => {
    const a = window.__mm.arena; a.restart(); a.paused = true;
    const cr = a.canvas.getBoundingClientRect(); const k = a._cssK;
    const ids = ['realm-bp-btn', 'realm-board-btn', 'realm-menu-btn', 'realm-leave-btn'].map((id) => document.getElementById(id)).filter((e) => e && e.getClientRects().length);
    const rs = ids.map((e) => e.getBoundingClientRect()); const bottom = Math.max(...rs.map((r) => r.bottom)); const left = Math.min(...rs.map((r) => r.left));
    const r0 = rs[0];
    a._stAnchorT = -1e9; a._draw();
    const sx = (r0.left + r0.width / 2 - cr.left) / k, sy = (r0.top + r0.height / 2 - cr.top) / k;
    a.texts.forEach((t) => { t.active = false; });
    const t = a._floatText(a.camera.x + sx, a.camera.y + sy, '42', '#fff'); t.vy = 0;
    const g = a.ctx; const orig = g.fillText; const ys = [];
    g.fillText = function (s, x, y) { if (s === '42') { const m = g.getTransform(); ys.push(cr.top + (m.f + m.d * y) / (a.canvas.height / cr.height)); } return orig.apply(this, arguments); };
    a._draw(); g.fillText = orig;
    const kept = t.y === a.camera.y + sy; // the number's own position is untouched (only where it is drawn)
    const low = a._floatText(a.camera.x + sx, a.camera.y + a.H / 2, '43', '#fff'); const lowY = low.y; a._draw();
    t.active = false; low.active = false; a.paused = false;
    return { ys, bottom, left, n: ids.length, kept, lowSame: low.y === lowY };
  });
  check('a floating number under the top-right buttons is drawn below them', ft.n >= 2 && ft.ys.length > 0 && ft.ys.every((y) => y - 12 >= ft.bottom - 1), JSON.stringify(ft));
  check('... only where it is drawn: its position and numbers elsewhere are untouched', ft.kept && ft.lowSame, JSON.stringify(ft));
  errs.push(...W.page.errors); await W.ctx.close();

  // ===== classic arena keeps its wave wording =====
  const C = await open(browser, 'test=1&seed=3');
  await C.page.waitForFunction(() => window.__mm.arena.run.wave >= 1, null, { timeout: 8000 });
  const c = await C.page.evaluate(() => {
    const a = window.__mm.arena; const t = (id) => { const e = document.getElementById(id); return e ? e.textContent : ''; };
    a.setShop(true); const shop = t('realm-shop-body'); a.setShop(false);
    const wave = t('realm-wave');
    a.player.iframes = 0; a.shield.hits = 0; a._hitPlayer(9999); const banner = t('realm-banner');
    a._showDeath(); const recap = (document.querySelector('#realm-death .rm-recap') || {}).textContent || '';
    return { shop, wave, banner, recap, stock: [...new Set(a.shopStock().map((o) => o.r))] };
  });
  check('classic arena: HUD says "Wave N"', /^Wave \d+$/.test(c.wave), c.wave);
  check('classic arena: shop footer still says "Reach wave 2 to unlock Uncommon gear." and only Common is stocked at best wave 0', /Reach wave 2 to unlock Uncommon gear\./.test(c.shop) && c.stock.join() === '0', JSON.stringify([c.shop.slice(-80), c.stock]));
  check('classic arena: death banner and recap keep the wave', /wave \d+/.test(c.banner) && /Wave reached/.test(c.recap), JSON.stringify([c.banner, c.recap]));
  errs.push(...C.page.errors); await C.ctx.close();

  // ===== phone world: same wording, no horizontal scroll =====
  const PH = await open(browser, 'mode=world&test=1&seed=12345', { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  await PH.page.waitForFunction(() => window.__mm.arena.state === 'play');
  const ph = await PH.page.evaluate(() => { const a = window.__mm.arena; a._syncHud(true); return { wave: document.getElementById('realm-wave').textContent, scroll: document.documentElement.scrollWidth <= window.innerWidth + 1 }; });
  check('phone world: no wave wording in the HUD, no horizontal scroll', !/wave|get ready/i.test(ph.wave) && ph.scroll, JSON.stringify(ph));
  errs.push(...PH.page.errors); await PH.ctx.close();

  check('no console or page errors', errs.length === 0, errs.slice(0, 3).join(' | '));
  await browser.close();
  done();
})();
