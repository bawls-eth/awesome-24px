// Cycle 5 L (b15-13, open 3 rounds): browser / phone Back with an in-page overlay open closes the overlay and STAYS on the page.
//  Realm: the pause Menu (Resume / Pick hero / Leave) and the backpack; Isles: the Pack panel. A second Back leaves as usual.
//  Closing the overlay with its own button leaves no Menu entry as the current history state; Leave from the Menu still leaves.
// OFFLINE only (offlineStub: blockDb + Firebase SDK stubbed); real taps / clicks and a real page.goBack().
// Run: BASE=http://localhost:8440/game/index.html node game/tests/cyc5-lead-back.test.js
const { chromium } = require('playwright');
const { check, done, offlineStub } = require('./helpers');
const BASE = process.env.BASE || 'http://localhost:8440/game/index.html';
const ROOT = BASE.replace(/game\/index\.html.*$/, '');
const SHOTS = process.env.SHOTS || null;

const VIEWS = [
  { tag: 'phone', ctx: { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true } },
  { tag: 'desktop', ctx: { viewport: { width: 1280, height: 720 } } },
];

(async () => {
  const browser = await chromium.launch();
  for (const V of VIEWS) {
    const ctx = await browser.newContext(V.ctx);
    const db = await offlineStub(ctx);
    const page = await ctx.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    const act = (sel) => (V.ctx.hasTouch ? page.tap(sel) : page.click(sel));
    const st = () => page.evaluate(() => {
      const shown = (id) => { const d = document.getElementById(id); return !!d && !d.classList.contains('hidden') && !d.hidden && d.getClientRects().length > 0; };
      return { path: location.pathname, flag: !!(history.state && history.state.mmNavSheet), pause: shown('realm-pause'), bp: shown('realm-backpack'), panel: shown('panel'), nav: !!(window.MMNav && window.MMNav.isOpen()) };
    }).catch(() => ({ path: 'gone' }));
    const T = (s) => `${V.tag}: ${s}`;

    // ---- Realm ----
    await page.goto(ROOT + 'game/hub/index.html');
    await page.goto(ROOT + 'game/games/mad-maze/index.html?mode=world');
    await page.waitForSelector('.hp-hero', { timeout: 20000 });
    await act('.hp-hero');
    await page.waitForTimeout(500);
    if (await page.$('#mm-coach-skip')) await act('#mm-coach-skip').catch(() => null);
    await page.waitForFunction(() => { const d = document.getElementById('realm-hero'); return !d || d.classList.contains('hidden'); }, null, { timeout: 8000 }).catch(() => null);
    await page.waitForTimeout(400);

    await act('#realm-menu-btn');
    await page.waitForTimeout(300);
    const m1 = await st();
    check(T('Realm ☰ opens the pause Menu'), m1.pause === true, JSON.stringify(m1));
    if (SHOTS) await page.screenshot({ path: `${SHOTS}/cyc5-lead-back-${V.tag}-1-menu.jpg`, type: 'jpeg', quality: 70 });
    await page.goBack({ timeout: 2500 }).catch(() => null);
    await page.waitForTimeout(600);
    const m2 = await st();
    check(T('Realm: Back with the pause Menu open closes it and stays in the Realm'), /mad-maze\/index\.html$/.test(m2.path) && m2.pause === false, JSON.stringify(m2));
    check(T('Realm: no Menu entry left as the current history state after Back'), m2.flag === false, JSON.stringify(m2));
    if (SHOTS) await page.screenshot({ path: `${SHOTS}/cyc5-lead-back-${V.tag}-2-after.jpg`, type: 'jpeg', quality: 70 });

    await act('#realm-bp-btn');
    await page.waitForTimeout(300);
    const b1 = await st();
    await page.goBack({ timeout: 2500 }).catch(() => null);
    await page.waitForTimeout(600);
    const b2 = await st();
    check(T('Realm: Back with the backpack open closes it and stays'), b1.bp === true && /mad-maze\/index\.html$/.test(b2.path) && b2.bp === false, JSON.stringify([b1, b2]));

    // Resume (own button) pops the entry again: history is not one step deeper per open
    await act('#realm-menu-btn');
    await page.waitForTimeout(250);
    await act('#realm-pause button[data-m="resume"].rm-btn');
    await page.waitForTimeout(500);
    const r1 = await st();
    check(T('Realm: Resume closes the Menu and leaves no Menu entry on top'), r1.pause === false && r1.flag === false && /mad-maze/.test(r1.path), JSON.stringify(r1));

    // Leave from the Menu still leaves (the guard never pulls the page back)
    await act('#realm-menu-btn');
    await page.waitForTimeout(250);
    await act('#realm-pause button[data-m="leave"]');
    await page.waitForFunction(() => !/mad-maze/.test(location.pathname), null, { timeout: 8000 }).catch(() => null);
    await page.waitForTimeout(900);
    check(T('Realm: Leave from the Menu leaves the Realm and stays away'), !/mad-maze/.test(page.url()), page.url());

    // Menu closed: one Back leaves the Realm as usual (fresh visit, hero already picked)
    await page.goto(ROOT + 'game/hub/index.html');
    await page.goto(ROOT + 'game/games/mad-maze/index.html?mode=world');
    await page.waitForSelector('#realm-menu-btn', { timeout: 20000 });
    await page.waitForTimeout(1200);
    const hp = await page.evaluate(() => { const d = document.getElementById('realm-hero'); return !!d && !d.classList.contains('hidden'); });
    if (hp) { await act('#realm-hero-close').catch(() => null); await page.waitForTimeout(500); }
    const c0 = await st();
    await page.goBack({ waitUntil: 'domcontentloaded', timeout: 5000 }).catch(() => null);
    await page.waitForTimeout(500);
    check(T('Realm: Back with nothing open leaves the Realm as usual'), c0.flag === false && /hub\/index\.html/.test(page.url()), JSON.stringify([c0, page.url()]));

    // ---- Isles ----
    await page.goto(ROOT + 'game/games/isles/index.html');
    await page.waitForSelector('#btn-pack', { timeout: 20000 });
    await page.waitForTimeout(1200);
    if (await page.evaluate(() => { const h = document.getElementById('howto'); return !!h && !h.hidden; })) await act('#howto-close').catch(() => null);
    await act('#btn-pack');
    await page.waitForTimeout(300);
    const i1 = await st();
    if (SHOTS) await page.screenshot({ path: `${SHOTS}/cyc5-lead-back-${V.tag}-3-isles-pack.jpg`, type: 'jpeg', quality: 70 });
    await page.goBack({ timeout: 2500 }).catch(() => null);
    await page.waitForTimeout(600);
    const i2 = await st();
    check(T('Isles: Back with the Pack open closes it and stays on the island'), i1.panel === true && /isles\/index\.html$/.test(i2.path) && i2.panel === false && i2.flag === false, JSON.stringify([i1, i2]));
    // Pack -> Menu sheet swap -> Back closes the sheet, still on the island
    await act('#btn-pack');
    await page.waitForTimeout(250);
    await act('#panel-close');
    await page.waitForTimeout(400);
    const i3 = await st();
    check(T('Isles: closing the Pack with its button leaves no Menu entry on top'), i3.panel === false && i3.flag === false, JSON.stringify(i3));
    await act('#mm-nav-btn');
    await page.waitForTimeout(300);
    const n1 = await st();
    await page.goBack({ timeout: 2500 }).catch(() => null);
    await page.waitForTimeout(600);
    const n2 = await st();
    check(T('Isles: Back with the shared Menu sheet open closes it and stays'), n1.nav === true && n2.nav === false && /isles\/index\.html$/.test(n2.path), JSON.stringify([n1, n2]));
    await page.goBack({ waitUntil: 'domcontentloaded', timeout: 5000 }).catch(() => null);
    await page.waitForTimeout(400);
    check(T('Isles: the next Back (nothing open) leaves the island'), !/isles\/index\.html/.test(page.url()), page.url());

    check(T('no page errors'), errors.length === 0, errors.join(' | '));
    check(T('0 database attempts'), db.attempts() === 0, String(db.attempts()));
    await ctx.close();
  }
  await browser.close();
  done();
})();
