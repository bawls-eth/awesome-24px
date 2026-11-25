// Cycle 11 art (G): Realm font consistency. A computed-style audit of the live Realm (world mode, HUD + backpack + shop open) found the
// HUD, abilities, backpack and shop on the pixel font (--px-font, shared/mm-8bit.css) but the zone strip (#rw-zone: zone name, danger,
// coords, raid timer), the Daily button, the world prompts / toasts, the Nexus panel and three inline-styled backpack / toast pieces
// still in system-ui, and the canvas world labels (zone / boss / lair labels, co-op names, pip "+N") in system-ui next to the mono
// portal / NPC labels. Now every visible Realm text element computes to the pixel font and every canvas label is mono. The combat
// text (_txtFont) keeps its pinned 'bold 14px system-ui' (realm-access2.test.js) and is not checked here.
// Serve the repo root first:  python3 -m http.server 8440 &
// Run: BASE=http://localhost:8440/game/index.html NODE_PATH=$(npm root -g) node game/tests/cyc11-art-realm-fonts.test.js
// Firebase blocked (blockDb), no socket, the Town page stubbed; nothing written anywhere but this tab's localStorage.
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');
const { check, done, blockDb } = require('./helpers');
const LS = require('./lib/load-scale');
const BASE = process.env.BASE || 'http://localhost:8440/game/index.html';
const ORIGIN = new URL(BASE).origin;
const URL_WORLD = '/game/games/mad-maze/index.html?mode=world&from=hub&test=1&seed=12345&heropick=0&tutorial=0&qdate=2030-05-01';
const PX = /Courier New/;

async function world(browser, w, h) {
  const touch = w < 900;
  const ctx = await browser.newContext(touch ? { viewport: { width: w, height: h }, hasTouch: true, isMobile: true } : { viewport: { width: w, height: h } });
  const db = await blockDb(ctx);
  await ctx.routeWebSocket(/.*/, (ws) => ws.close());
  await ctx.route('**/game/index.html*', (r) => r.fulfill({ contentType: 'text/html', body: '<!doctype html>town' }));
  const page = await ctx.newPage(); const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(ORIGIN + '/game/games/mad-maze/lantern.css');
  await page.evaluate(() => { localStorage.clear(); localStorage.setItem('pixeltown-save-v1', JSON.stringify({ realm: { level: 9, xp: 0, shards: 500, bestWave: 6, items: [], nextUid: 20, eq: {} } })); localStorage.setItem('mm-aim-assist', '0'); });
  // spy on canvas text before any game script runs: font in effect for every fillText
  await page.addInitScript(() => {
    window.__fonts = new Map();
    const P = CanvasRenderingContext2D.prototype; const f0 = P.fillText;
    P.fillText = function (t, x, y, m) { const k = this.font; if (!window.__fonts.has(k)) window.__fonts.set(k, String(t).slice(0, 20)); return f0.call(this, t, x, y, m); };
  });
  await page.goto(ORIGIN + URL_WORLD);
  await page.waitForFunction(() => window.__mm && window.__mm.world && window.__mm.arena.active && window.__mm.arena.state === 'play', null, { timeout: LS.budget(40000) });
  await page.evaluate(() => { window.__mm.arena.player.iframes = 1e9; });
  return { ctx, db, page, errors, touch };
}

// every visible element with its own text, outside the shared nav / sr-only / skip link, whose text has a letter or digit
const audit = (page) => page.evaluate((src) => {
  const PX = new RegExp(src); const bad = []; let n = 0;
  document.querySelectorAll('body *').forEach((e) => {
    if (['SCRIPT', 'STYLE', 'CANVAS', 'NOSCRIPT'].includes(e.tagName)) return;
    if (e.closest('#mm-nav-root, .rm-sr-only, #realm-play-focus')) return;
    const txt = [...e.childNodes].filter((c) => c.nodeType === 3).map((c) => c.textContent.trim()).join('');
    if (!/[A-Za-z0-9]/.test(txt)) return; // emoji / glyph-only spans keep the emoji font
    const r = e.getBoundingClientRect(); const cs = getComputedStyle(e);
    if (!r.width || !r.height || cs.visibility === 'hidden' || +cs.opacity === 0) return;
    for (let p = e; p; p = p.parentElement) if (getComputedStyle(p).display === 'none') return;
    n++;
    if (!PX.test(cs.fontFamily)) bad.push(`${e.id ? '#' + e.id : e.tagName.toLowerCase() + '.' + String(e.className).split(' ')[0]} "${txt.slice(0, 24)}" (${cs.fontFamily.slice(0, 24)})`);
  });
  return { n, bad };
}, PX.source);

(async () => {
  const browser = await chromium.launch();
  const res = {};
  for (const [w, h] of [[1280, 720], [390, 844]]) {
    const { ctx, db, page, errors, touch } = await world(browser, w, h);
    const tap = (sel) => (touch ? page.tap(sel) : page.click(sel));
    await page.waitForTimeout(1200);
    const hud = await audit(page);
    // the named overlays (present in the DOM, shown or not): computed family is the pixel font
    const named = await page.evaluate((src) => {
      const PX = new RegExp(src);
      return ['#rw-zone', '#rw-zone .rw-zn', '#rw-zone .rw-coords', '#mm-daily-btn', '#rw-portal', '#rw-event-hint', '#rw-site', '#rw-rush', '#mm-coach', '#rw-nexus', '#rw-lair']
        .map((s) => { const e = document.querySelector(s); return e ? { s, ok: PX.test(getComputedStyle(e).fontFamily) } : null; }).filter(Boolean);
    }, PX.source);
    await tap('#realm-bp-btn'); await page.waitForTimeout(400);
    const bp = await audit(page);
    await tap('#realm-backpack-body button[data-open-shop]');
    await page.waitForFunction(() => document.querySelectorAll('#realm-shop-body li').length > 0, null, { timeout: LS.budget(10000) }).catch(() => {});
    const shop = await audit(page);
    const fonts = await page.evaluate(() => ({ list: [...window.__fonts.entries()], txt: window.__mm.arena._txtFont }));
    if (w === 1280) await page.screenshot({ path: path.join(__dirname, '..', 'design', 'beta', 'img', 'cyc11-art-realm-fonts-desktop.jpg'), type: 'jpeg', quality: 75 }).catch(() => {});
    else await page.screenshot({ path: path.join(__dirname, '..', 'design', 'beta', 'img', 'cyc11-art-realm-fonts-phone.jpg'), type: 'jpeg', quality: 75 }).catch(() => {});
    res[w] = { hud, named, bp, shop, fonts, errors, db: db.attempts() };
    await ctx.close();
  }
  for (const w of [1280, 390]) {
    const r = res[w]; const tag = `[${w}] `;
    check(tag + 'HUD: every visible Realm text element (zone strip, HP / XP, abilities, Daily) uses the pixel font', r.hud.n >= 10 && r.hud.bad.length === 0, `${r.hud.n} els; ${r.hud.bad.slice(0, 6).join(' | ')}`);
    check(tag + 'zone strip, Daily button and world prompts / Nexus panel compute to the pixel font', r.named.length >= 4 && r.named.every((x) => x.ok), JSON.stringify(r.named));
    check(tag + 'backpack open: every visible text element uses the pixel font', r.bp.bad.length === 0, r.bp.bad.slice(0, 6).join(' | '));
    check(tag + 'shop open: every visible text element uses the pixel font', r.shop.n > r.hud.n && r.shop.bad.length === 0, `${r.shop.n} els; ${r.shop.bad.slice(0, 6).join(' | ')}`);
    const sysCanvas = r.fonts.list.filter(([f]) => /system-ui|sans-serif/.test(f) && f !== r.fonts.txt);
    check(tag + 'canvas: every label drawn in the world is mono (only the pinned combat text font may be system-ui)', r.fonts.list.length > 0 && sysCanvas.length === 0, JSON.stringify(sysCanvas.length ? sysCanvas : r.fonts.list).slice(0, 300));
    check(tag + 'no page errors', r.errors.length === 0, r.errors.slice(0, 3).join(' | '));
    check(tag + 'Firebase never contacted (blockDb attempts 0)', r.db === 0, String(r.db));
  }
  // source: the only system-ui left in realm.js / realm-world.js is the pinned combat text font
  const src = ['realm.js', 'games/mad-maze/realm-world.js'].map((f) => fs.readFileSync(path.join(__dirname, '..', f), 'utf8'));
  const hits = src.map((s) => s.split('\n').filter((l) => /system-ui/.test(l) && !/_txtFont/.test(l)).length);
  check('source: no system-ui left in realm.js / realm-world.js UI or canvas labels (combat _txtFont excepted)', hits[0] === 0 && hits[1] === 0, JSON.stringify(hits));
  await browser.close();
  done();
})().catch((e) => { console.error(e); process.exit(1); });
