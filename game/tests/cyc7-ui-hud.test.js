// cyc7-ui (U-01 cycle-6 proposal + retest 3 b15-r3-04): HUD moves, checked in a real browser.
//   Town (OFFLINE only, helpers.offlineStub, 0 DB requests, never chats) at 1280x720, 390x844, 195x422 and 667x375:
//     - the join screen shows no corner Menu button;
//     - wide screens: after joining, the shared corner Menu (#mm-nav-btn) is top-left (<= 16 px), >= 44 px, on top at its centre, and
//       no other visible control overlaps it; the corner Menu and "Where to?" open the SAME sheet (#mm-nav-sheet), aria-expanded follows
//       on both, Esc closes it, and a sheet opened from "Where to?" hands focus back to it;
//     - phones (<= 600 px or short landscape): no corner button yet (HUD diet), "Where to?" opens the sheet.
//   Realm world (touch, portrait) at 414x896, 390x844, 360x640, 320x568 and 195x422:
//     - the settings gear and the Daily link are not in the bottom band between the two sticks and overlap no stick, ability pad,
//       mini-map, goal / zone text or other control;
//     - above 260 px both sit in the right column (gear, then Daily) above the ability pad (off the move stick's column);
//   Realm world desktop 1280x720: gear and Daily keep their old bottom-left spots (unchanged).
//   Stalk Market (retest 3 P3 b15-r3-05) at 195x422 and 390x844: stat labels never split inside a word.
// Run: BASE=http://localhost:8440/game/index.html node game/tests/cyc7-ui-hud.test.js
const { chromium } = require('playwright');
const path = require('path');
const { check, done, offlineStub, blockDb } = require('./helpers');
const BASE = process.env.BASE || 'http://localhost:8440/game/index.html';
const ORIGIN = new URL(BASE).origin;
const IMG = path.join(__dirname, '..', 'design', 'beta', 'img');
const PROFILE = { v: 1, heroes: [{ id: 'h1', name: 'Fern', cls: 'druid', level: 7, xp: 10, items: [] }], stash: [], fame: 0, mode: 'classic', hall: [] };

const rectsOf = (page, sels) => page.evaluate((sels) => {
  const out = {};
  sels.forEach((s) => {
    const e = document.querySelector(s); if (!e) { out[s] = null; return; }
    const cs = getComputedStyle(e); const r = e.getBoundingClientRect();
    if (cs.display === 'none' || cs.visibility === 'hidden' || r.width === 0) { out[s] = null; return; }
    out[s] = { x: r.left, y: r.top, r: r.right, b: r.bottom, w: Math.round(r.width), h: Math.round(r.height) };
  });
  return out;
}, sels);
const wide = (w, h) => !(w <= 600 || (w > h && h <= 500)); // main.js townNarrow()
const hit = (a, b) => !!(a && b && a.x < b.r - 0.5 && b.x < a.r - 0.5 && a.y < b.b - 0.5 && b.y < a.b - 0.5);

async function town(browser, w, h) {
  const touch = w < 900;
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, hasTouch: touch, isMobile: touch });
  const db = await offlineStub(ctx);
  const page = await ctx.newPage(); const errors = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  const tag = `[town ${w}x${h}] `;
  await page.goto(BASE);
  await page.waitForSelector('#name-input');
  const pre = await rectsOf(page, ['#mm-nav-btn']);
  check(tag + 'the join screen shows no corner Menu button', pre['#mm-nav-btn'] === null, JSON.stringify(pre));
  await page.fill('#name-input', 'ADMINcyc7u');
  await page.click('.species-tab'); await page.click('.avatar-choice');
  await page.click('button:has-text("Join Town")');
  await page.waitForSelector('#join-offline-btn:not(.hidden)', { timeout: 9000 });
  await page.click('#join-offline-btn');
  await page.waitForFunction(() => { const h = document.getElementById('hud'); return h && !h.classList.contains('hidden'); }, null, { timeout: 25000 });
  await page.waitForTimeout(1800);
  const m = await page.evaluate(() => {
    const b = document.getElementById('mm-nav-btn'); if (!b) return null;
    const r = b.getBoundingClientRect(); const top = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
    const vis = (e) => { const cs = getComputedStyle(e); const q = e.getBoundingClientRect(); return cs.display !== 'none' && cs.visibility !== 'hidden' && q.width > 0 && q.height > 0; };
    const over = [...document.querySelectorAll('button, a[href], [role=button], input, #inventory-panel, #player-list-panel, #goal-chip, .goal-chip')]
      .filter((e) => e !== b && !b.contains(e) && !e.closest('#mm-nav-root') && vis(e))
      .filter((e) => { const q = e.getBoundingClientRect(); return Math.min(q.right, r.right) - Math.max(q.left, r.left) > 1 && Math.min(q.bottom, r.bottom) - Math.max(q.top, r.top) > 1; })
      .map((e) => e.id || e.className || e.tagName);
    return { x: r.left, y: r.top, w: r.width, h: r.height, onTop: !!top && !!top.closest('#mm-nav-btn'), over };
  });
  await page.screenshot({ path: path.join(IMG, `cyc7-ui-town-menu-${w}x${h}.jpg`), type: 'jpeg', quality: 70 }).catch(() => {});
  const tap = (s) => (touch ? page.tap(s) : page.click(s));
  if (wide(w, h)) {
    check(tag + 'corner Menu is top-left (<= 16 px), >= 44 px and on top', m && m.x <= 16 && m.y <= 16 && m.w >= 44 && m.h >= 44 && m.onTop, JSON.stringify(m));
    check(tag + 'no other visible control overlaps the corner Menu', m && m.over.length === 0, JSON.stringify(m && m.over));
  } else {
    // phone: the HUD diet keeps "Where to?" as the only Menu (no corner button yet); it must still open the sheet and hand focus back
    check(tag + 'phone: no corner Menu button', m === null, JSON.stringify(m));
    await tap('#where-to-btn'); await page.waitForTimeout(250);
    const o = await page.evaluate(() => ({ open: !document.getElementById('mm-nav-sheet').hidden, where: document.getElementById('where-to-btn').getAttribute('aria-expanded') }));
    check(tag + '"Where to?" opens the sheet', o.open && o.where === 'true', JSON.stringify(o));
    await page.keyboard.press('Escape'); await page.waitForTimeout(200);
    check(tag + 'no database request (offline stub)', db.attempts() === 0, String(db.attempts()));
    check(tag + 'no page errors', errors.length === 0, errors.join(' | '));
    await ctx.close();
    return db.attempts();
  }
  if (!m) { check(tag + 'corner Menu exists (sheet checks skipped)', false); await ctx.close(); return db.attempts(); }
  const state = () => page.evaluate(() => ({ open: !document.getElementById('mm-nav-sheet').hidden, corner: document.getElementById('mm-nav-btn').getAttribute('aria-expanded'), where: document.getElementById('where-to-btn').getAttribute('aria-expanded') }));
  await tap('#mm-nav-btn'); await page.waitForTimeout(250);
  const a = await state();
  check(tag + 'the corner Menu opens the "Where to?" sheet', a.open && a.corner === 'true' && a.where === 'true', JSON.stringify(a));
  await page.keyboard.press('Escape'); await page.waitForTimeout(250);
  const c = await state();
  check(tag + 'Esc closes it and both buttons read aria-expanded false', !c.open && c.corner === 'false' && c.where === 'false', JSON.stringify(c));
  // "Where to?" may sit in the collapsed panel on a phone (still visible); open it the way a player would
  await tap('#where-to-btn'); await page.waitForTimeout(250);
  const d = await state();
  check(tag + '"Where to?" opens the same sheet', d.open && d.where === 'true' && d.corner === 'true', JSON.stringify(d));
  await page.keyboard.press('Escape'); await page.waitForTimeout(250);
  const f = await page.evaluate(() => document.activeElement && document.activeElement.id);
  check(tag + 'closing a sheet opened from "Where to?" puts focus back on "Where to?"', f === 'where-to-btn', String(f));
  check(tag + 'no database request (offline stub)', db.attempts() === 0, String(db.attempts()));
  check(tag + 'no page errors', errors.length === 0, errors.join(' | '));
  await ctx.close();
  return db.attempts();
}

async function realm(browser, w, h, touch) {
  const ctx = await browser.newContext(touch ? { viewport: { width: w, height: h }, hasTouch: true, isMobile: true } : { viewport: { width: w, height: h } });
  const db = await blockDb(ctx);
  await ctx.addInitScript((p) => { localStorage.setItem('pixeltown-mm-v1', JSON.stringify(p)); localStorage.setItem('pixeltown-mm-active-v1', JSON.stringify({ v: 1, heroId: 'h1' })); }, PROFILE);
  const page = await ctx.newPage(); const errors = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  await page.goto(ORIGIN + '/game/games/mad-maze/index.html?mode=world&test=1&seed=12345');
  await page.waitForSelector('#mm-gear-btn', { timeout: 15000 });
  await page.waitForSelector('#mm-daily-btn', { timeout: 15000 });
  await page.waitForTimeout(2500);
  const tag = `[realm ${w}x${h}] `;
  const S = ['#mm-gear-btn', 'a#mm-daily-btn', '#realm-stick-move', '#realm-stick-aim', '#realm-abilities', '#rw-minimap', '#rw-goal', '#rw-zone', '#realm-aim-btn',
    '#realm-leave-btn', '#realm-menu-btn', '#realm-bp-btn', '#realm-board-btn', '#mm-nav-btn', '#realm-info', '#realm-xp', '#realm-hp'];
  const R = await rectsOf(page, S);
  const gear = R['#mm-gear-btn'], daily = R['a#mm-daily-btn'];
  if (!touch) {
    check(tag + 'desktop: gear and Daily keep their bottom-left spots', gear && daily && gear.x <= 12 && gear.b >= h - 14 && daily.x <= 70 && daily.b >= h - 14, JSON.stringify({ gear, daily }));
  } else {
    const mv = R['#realm-stick-move'], am = R['#realm-stick-aim'];
    const band = mv && am ? { x: mv.r, r: am.x, y: Math.min(mv.y, am.y) - 8, b: h } : null;
    check(tag + 'gear and Daily are on screen, >= 44 px', [gear, daily].every((q) => q && q.x >= 0 && q.y >= 0 && q.r <= w && q.b <= h && q.w >= 44 && q.h >= 44), JSON.stringify({ gear, daily }));
    check(tag + 'neither is in the bottom band between the two sticks', band && !hit(gear, band) && !hit(daily, band), JSON.stringify({ gear, daily, band }));
    const others = S.slice(2).filter((s) => R[s]);
    const clash = [];
    [['gear', gear], ['daily', daily]].forEach(([n, q]) => others.forEach((s) => { if (hit(q, R[s])) clash.push(n + '/' + s); }));
    if (hit(gear, daily)) clash.push('gear/daily');
    check(tag + 'gear and Daily overlap no stick, ability pad, mini-map, goal / zone text or other control', clash.length === 0, JSON.stringify({ clash, R }));
    if (w > 260) {
      const ab = R['#realm-abilities'];
      check(tag + 'right column: gear then Daily, right of the move stick and above the ability pad', gear.r >= w - 16 && daily.r >= w - 16 && gear.b <= daily.y && ab && daily.b <= ab.y && gear.x > mv.r && daily.x > mv.r, JSON.stringify({ gear, daily, ab, mv }));
    }
  }
  await page.screenshot({ path: path.join(IMG, `cyc7-ui-realm-hud-${w}x${h}.jpg`), type: 'jpeg', quality: 70 }).catch(() => {});
  check(tag + 'no database request', db.attempts() === 0, String(db.attempts()));
  check(tag + 'no page errors', errors.length === 0, errors.join(' | '));
  await ctx.close();
  return db.attempts();
}

// P3 b15-r3-05: Stalk Market stat labels at 195 px must not break inside a word (each word = one line box), and fit the screen
async function stalk(browser, w, h) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, hasTouch: true, isMobile: true });
  const db = await blockDb(ctx);
  const page = await ctx.newPage();
  await page.goto(ORIGIN + '/game/games/stalk/index.html'); await page.waitForSelector('#stats .stat'); await page.waitForTimeout(800);
  const r = await page.evaluate(() => {
    const broken = [], out = [];
    document.querySelectorAll('#stats .stat .lbl, #stats .stat strong').forEach((el) => {
      const b = el.getBoundingClientRect(); if (b.right > innerWidth + 0.5 || b.left < -0.5) out.push(el.textContent);
      const tw = document.createTreeWalker(el, NodeFilter.SHOW_TEXT); let n;
      while ((n = tw.nextNode())) {
        const re = /\S+/g; let m;
        while ((m = re.exec(n.nodeValue))) {
          const rg = document.createRange(); rg.setStart(n, m.index); rg.setEnd(n, m.index + m[0].length);
          const lines = new Set([...rg.getClientRects()].filter((q) => q.width > 0).map((q) => Math.round(q.top)));
          if (lines.size > 1) broken.push(m[0]);
        }
      }
    });
    return { broken, out, sw: document.documentElement.scrollWidth };
  });
  check(`[stalk ${w}x${h}] stat labels and values keep every word on one line (no "BEL LS")`, r.broken.length === 0, JSON.stringify(r));
  check(`[stalk ${w}x${h}] stats stay on screen, no horizontal scroll`, r.out.length === 0 && r.sw <= w, JSON.stringify(r));
  await page.locator('#stats').scrollIntoViewIfNeeded();
  await page.screenshot({ path: path.join(IMG, `cyc7-ui-stalk-stats-${w}x${h}.jpg`), type: 'jpeg', quality: 70 }).catch(() => {});
  check(`[stalk ${w}x${h}] no database request`, db.attempts() === 0, String(db.attempts()));
  await ctx.close();
  return db.attempts();
}

(async () => {
  const browser = await chromium.launch(); let attempts = 0;
  for (const [w, h] of [[195, 422], [390, 844]]) attempts += await stalk(browser, w, h);
  for (const [w, h] of [[1280, 720], [390, 844], [195, 422], [667, 375]]) attempts += await town(browser, w, h);
  for (const [w, h] of [[414, 896], [390, 844], [360, 640], [320, 568], [195, 422]]) attempts += await realm(browser, w, h, true);
  attempts += await realm(browser, 1280, 720, false);
  check('db.attempts() === 0 across every profile', attempts === 0, String(attempts));
  await browser.close();
  done();
})().catch((e) => { console.error(e); process.exit(1); });
