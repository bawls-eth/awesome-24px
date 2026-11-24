// R4 D4 mobile scaling (Town only through the offline stub; database blocked: blockDb + the Firebase SDK stubbed, 0 DB requests).
//  b15-06      Town join card at 320x568 with ?from=hub: the "Home" pill (>= 44 px) does not cover the title; the hero grid stays inside the card
//  b15-r2-18   Hub at 195x422 (200% zoom): the moon is not drawn over the PIXELTOWN logo
//  b15-05      Town at 844x390 (landscape phone): quick chat and Hold to talk share the bottom strip, overlapping nothing
//  b10-r2 note Angler at 260x563 (150% zoom): the spot title is not truncated, the Bells chip is fully on screen, Journal keeps its name
// Run: BASE=http://localhost:8440/game/index.html node game/tests/beta-r4-d4-mobile.test.js
const { chromium } = require('playwright');
const { check, done, offlineStub, exposeGame, joinOffline } = require('./helpers');
const BASE = process.env.BASE || 'http://localhost:8440/game/index.html';
const ROOT = BASE.replace(/game\/index\.html.*$/, '');
const SHOTS = process.env.SHOTS || null;
const box = (page, sel) => page.evaluate((s) => { const e = document.querySelector(s); if (!e) return null; const r = e.getBoundingClientRect(); return { x: r.left, y: r.top, r: r.right, b: r.bottom, w: r.width, h: r.height, sw: e.scrollWidth, cw: e.clientWidth }; }, sel);
const hit = (a, b) => !!(a && b && a.x < b.r - 0.5 && b.x < a.r - 0.5 && a.y < b.b - 0.5 && b.y < a.b - 0.5);

(async () => {
  const browser = await chromium.launch();
  const errors = [];
  const mk = async (viewport, dsf) => {
    const ctx = await browser.newContext({ viewport, deviceScaleFactor: dsf || 1, hasTouch: true, isMobile: true });
    const db = await offlineStub(ctx);
    const page = await ctx.newPage();
    page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
    return { ctx, db, page };
  };

  // b15-06
  {
    const { ctx, db, page } = await mk({ width: 320, height: 568 });
    await page.goto(BASE + '?from=hub');
    await page.waitForTimeout(800);
    const pill = await box(page, '#back-to-map-pill');
    const h1 = await box(page, '#join-overlay .join-card h1');
    const card = await box(page, '#join-overlay .join-card');
    const grid = await page.evaluate(() => [...document.querySelectorAll('#avatar-grid .avatar-choice')].map((e) => { const r = e.getBoundingClientRect(); return { x: r.left, r: r.right, w: r.width, h: r.height }; }));
    check('320x568: the Home pill is >= 44 px tall and does not overlap the Hearthvale title or its icon', pill && pill.h >= 44 && !hit(pill, h1) && !hit(pill, card), JSON.stringify({ pill, h1, card }));
    check('320x568: all 10 hero buttons sit inside the card and are >= 44 px', grid.length === 10 && grid.every((g) => g.x >= card.x && g.r <= card.r + 0.5 && g.w >= 44 && g.h >= 44), JSON.stringify({ card, grid }));
    const sw = await page.evaluate(() => document.documentElement.scrollWidth);
    check('320x568: no horizontal page scroll', sw <= 320, String(sw));
    if (SHOTS) await page.screenshot({ path: SHOTS + '/r4-d4-join320.jpg', type: 'jpeg', quality: 60 });
    check('join card: 0 database requests', db.attempts() === 0, JSON.stringify(db.http));
    await ctx.close();
  }

  // b15-r2-18
  {
    const { ctx, page } = await mk({ width: 195, height: 422 }, 2);
    await page.goto(ROOT + 'game/hub/index.html');
    await page.waitForTimeout(1200);
    const m = await page.evaluate(() => {
      const home = document.getElementById('home'); const logo = document.getElementById('home-logo');
      if (!home || !logo || !window.__homeMoon) return null;
      const hr = home.getBoundingClientRect(); const lr = logo.getBoundingClientRect(); const mo = window.__homeMoon;
      return { moon: { x: hr.left + mo.x, y: hr.top + mo.y, r: hr.left + mo.x + mo.w, b: hr.top + mo.y + mo.h }, logo: { x: lr.left, y: lr.top, r: lr.right, b: lr.bottom } };
    });
    check('195x422 hub: the moon does not overlap the PIXELTOWN logo', !!m && !hit(m.moon, m.logo), JSON.stringify(m));
    if (SHOTS) await page.screenshot({ path: SHOTS + '/r4-d4-hub195.jpg', type: 'jpeg', quality: 60 });
    await ctx.close();
    const w = await mk({ width: 1280, height: 720 });
    await w.page.goto(ROOT + 'game/hub/index.html');
    await w.page.waitForTimeout(1000);
    const wide = await w.page.evaluate(() => window.__homeMoon && window.__homeMoon.y);
    check('1280x720 hub: the moon keeps its top-corner spot', wide === 24, String(wide));
    await w.ctx.close();
  }

  // Angler 260
  {
    const { ctx, page } = await mk({ width: 260, height: 563 }, 3);
    await page.goto(ROOT + 'game/games/angler/index.html');
    await page.waitForTimeout(1000);
    await page.evaluate(() => { const b = document.getElementById('pg-play'); if (b) b.click(); });
    await page.waitForTimeout(400);
    const t = await box(page, '#spot-title');
    const bells = await box(page, '#bells-box');
    const j = await page.evaluate(() => { const b = document.getElementById('journal-btn'); const r = b.getBoundingClientRect(); return { name: b.textContent.replace(/\s+/g, ' ').trim(), h: r.height, r: r.right }; });
    check('260x563 Angler: the spot title is not truncated', t && t.sw <= t.cw + 1 && t.w > 0, JSON.stringify(t));
    check('260x563 Angler: the Bells chip is fully on screen', bells && bells.x >= 0 && bells.r <= 260, JSON.stringify(bells));
    check('260x563 Angler: Journal keeps its accessible name and a 44 px target, inside the screen', /Journal\s*\d+\/\d+/.test(j.name) && j.h >= 44 && j.r <= 260, JSON.stringify(j));
    if (SHOTS) await page.screenshot({ path: SHOTS + '/r4-d4-angler260.jpg', type: 'jpeg', quality: 60 });
    await ctx.close();
  }

  // b15-05 Town on a landscape phone (844x390): quick chat + Hold to talk share the bottom strip and overlap no other control
  {
    const { ctx, db, page } = await mk({ width: 844, height: 390 });
    await exposeGame(page);
    await page.goto(BASE + '?hud=online'); // U-01: the online HUD layout (quick chat / Hold to talk)
    await joinOffline(page, 'ADMINr4land');
    await page.waitForTimeout(800);
    const r = await page.evaluate(() => {
      const box = (id) => { const e = document.getElementById(id); if (!e || e.classList.contains('hidden')) return null; const cs = getComputedStyle(e); const b = e.getBoundingClientRect(); return cs.display === 'none' || cs.visibility === 'hidden' || b.width === 0 ? null : { id, x: b.left, y: b.top, r: b.right, b: b.bottom }; };
      const qc = box('quick-chat-row'), wt = box('walkie-talk-btn');
      const others = ['joystick', 'action-buttons', 'where-to-btn', 'gate-pointer', 'player-list-panel', 'inventory-panel', 'mobile-chat-btn'].map(box).filter(Boolean);
      return { qc, wt, others, ih: innerHeight };
    });
    const over = [];
    [r.qc, r.wt].filter(Boolean).forEach((a) => r.others.concat([r.qc, r.wt].filter((x) => x && x !== a)).forEach((b) => { if (hit(a, b)) over.push([a.id, b.id]); }));
    check('844x390 Town: quick chat and Hold to talk sit in the bottom strip (bottom 60 px)', r.qc && r.wt && r.qc.y >= r.ih - 60 && r.wt.y >= r.ih - 60, JSON.stringify(r));
    check('844x390 Town: quick chat / Hold to talk overlap no other control or each other', over.length === 0, JSON.stringify({ over, r }));
    if (SHOTS) await page.screenshot({ path: SHOTS + '/r4-d4-town-landscape.jpg', type: 'jpeg', quality: 60 });
    check('landscape Town: 0 database requests', db.attempts() === 0, JSON.stringify(db.http));
    await ctx.close();
  }

  check('no page errors', errors.length === 0, errors.join('|'));
  await browser.close();
  done();
})().catch((e) => { console.error(e); process.exit(1); });
