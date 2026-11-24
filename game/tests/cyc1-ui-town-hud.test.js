// Cycle 1 U (UI/UX): Town phone HUD, OFFLINE only (helpers.offlineStub: database hosts blocked, Firebase SDK answered empty).
// U-01 (b08-r2-07): offline, quick chat and Hold to talk are gone (they only answered "Chat needs the online town");
//        the test-only ?hud=online hook keeps them, so the layout tests measure the online HUD explicitly.
// U-02: on phones the bag bar is ONE row: the bag + the 3 most recently changed counts; tapping the bag expands all of them (10 + crafted goods once owned).
// U-03: at 160x284 (320x568 at 200% zoom) the joystick / action buttons never cover the bag bar.
// U-04: at 150% Text size the Realm Gate chip never covers the bag bar.
// Never chats, never writes to Firebase (0 DB requests).
// Run: BASE=http://localhost:8440/game/index.html node game/tests/cyc1-ui-town-hud.test.js
const { chromium } = require('playwright');
const { check, done, offlineStub } = require('./helpers');
const BASE = process.env.BASE || 'http://localhost:8440/game/index.html';
const SHOTS = process.env.SHOTS || null;

async function open(browser, ctxOpts, qs, prefs) {
  const ctx = await browser.newContext(ctxOpts);
  const db = await offlineStub(ctx);
  if (prefs) await ctx.addInitScript((v) => { try { if (!sessionStorage.seededPrefs) { sessionStorage.seededPrefs = '1'; localStorage.setItem('pixeltown-access-v1', v); } } catch (e) { /* storage blocked */ } }, prefs);
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  await page.route('**/main.js*', async (route) => { const resp = await route.fetch(); const body = (await resp.text()).replace('const game = new Phaser.Game(config);', 'const game = window.__g = new Phaser.Game(config);'); route.fulfill({ response: resp, body }); });
  await page.goto(BASE + (qs || ''));
  await page.fill('#name-input', 'ADMINcyc1u');
  await page.click('.species-tab'); await page.click('.avatar-choice');
  await page.click('button:has-text("Join Town")');
  await page.waitForSelector('#join-offline-btn:not(.hidden)', { timeout: 9000 });
  await page.click('#join-offline-btn');
  await page.waitForFunction(() => window.__g && window.__g.scene.getScene('Town') && window.__g.scene.getScene('Town').localBody, null, { timeout: 25000 });
  await page.waitForTimeout(1200);
  return { ctx, page, db, errors };
}
const box = (page, sel) => page.evaluate((s) => { const e = document.querySelector(s); if (!e) return null; const cs = getComputedStyle(e); const r = e.getBoundingClientRect(); if (cs.display === 'none' || cs.visibility === 'hidden' || r.width === 0 || r.height === 0) return null; return { x: r.left, y: r.top, r: r.right, b: r.bottom, w: r.width, h: r.height }; }, sel);
const hit = (a, b) => !!(a && b && a.x < b.r - 0.5 && b.x < a.r - 0.5 && a.y < b.b - 0.5 && b.y < a.b - 0.5);
const PHONE = { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true };
// visible bag chips (spans with a count) and how many rows they take
const bagState = (page) => page.evaluate(() => {
  const p = document.getElementById('inventory-panel');
  const vis = [...p.children].filter((e) => e.id !== 'bag-icon' && getComputedStyle(e).display !== 'none' && e.getBoundingClientRect().width > 0)
    .sort((a, b) => a.getBoundingClientRect().top - b.getBoundingClientRect().top || a.getBoundingClientRect().left - b.getBoundingClientRect().left); // visual order
  const tops = new Set(vis.map((e) => Math.round(e.getBoundingClientRect().top)));
  const bag = document.getElementById('bag-icon'); const br = bag.getBoundingClientRect(); const pr = p.getBoundingClientRect();
  const out = vis.filter((e) => { const r = e.getBoundingClientRect(); return r.right > pr.right + 0.5 || r.left < pr.left - 0.5; }).map((e) => (e.querySelector('b') || {}).id);
  return { n: vis.length, out, rows: tops.size, ids: vis.map((e) => (e.querySelector('b') || {}).id), h: p.getBoundingClientRect().height, expanded: bag.getAttribute('aria-expanded'), role: bag.getAttribute('role'), bagH: br.height, bagW: br.width };
});

(async () => {
  const browser = await chromium.launch();

  // ---- U-01: offline, no hook ----
  {
    const T = await open(browser, PHONE); const p = T.page;
    const qc = await box(p, '#quick-chat-row'); const wt = await box(p, '#walkie-talk-btn');
    check('U-01 offline 390x844: the quick-chat phrases are not on the HUD', qc === null, JSON.stringify(qc));
    check('U-01 offline 390x844: Hold to talk is not on the HUD', wt === null, JSON.stringify(wt));
    const ph = await p.evaluate(() => document.getElementById('chat-input').placeholder);
    check('U-01 offline: the chat input says chat needs the online town', /online town/i.test(ph), ph);
    if (SHOTS) await p.screenshot({ path: SHOTS + '/cyc1-ui-town-390-offline.jpg', type: 'jpeg', quality: 60 });

    // ---- U-02: compact bag bar on the phone ----
    let s = await bagState(p);
    check('U-02 phone: the bag bar is one row with at most 3 counts, none spilling out of the bar', s.rows <= 1 && s.n <= 3 && s.n >= 1 && s.out.length === 0, JSON.stringify(s));
    check('U-02 phone: the bag is a button with aria-expanded=false and a >= 44 px tap target', s.role === 'button' && s.expanded === 'false' && s.bagH >= 44 && s.bagW >= 44, JSON.stringify(s));
    // a count that changes moves into the compact bar (most recent first)
    await p.evaluate(() => { const s = window.__g.scene.getScene('Town'); s.resources.shells = (s.resources.shells || 0) + 2; s.updateInventoryHUD(); });
    await p.waitForTimeout(150);
    s = await bagState(p);
    check('U-02 phone: a changed count (shells) shows first in the compact bar', s.ids[0] === 'shell-count' && s.n <= 3 && s.rows <= 1, JSON.stringify(s));
    await p.evaluate(() => { const s = window.__g.scene.getScene('Town'); s.resources.flowers = (s.resources.flowers || 0) + 1; s.updateInventoryHUD(); });
    await p.waitForTimeout(150);
    s = await bagState(p);
    check('U-02 phone: the next change (flowers) leads, shells stays in the 3', s.ids[0] === 'flower-count' && s.ids.includes('shell-count'), JSON.stringify(s));
    await p.tap('#bag-icon'); await p.waitForTimeout(150);
    s = await bagState(p);
    check('U-02 phone: tapping the bag expands every count (10 shown)', s.n === 10 && s.expanded === 'true', JSON.stringify(s));
    await p.tap('#bag-icon'); await p.waitForTimeout(150);
    s = await bagState(p);
    check('U-02 phone: tapping again collapses back to one row', s.n <= 3 && s.rows <= 1 && s.expanded === 'false', JSON.stringify(s));
    if (SHOTS) await p.screenshot({ path: SHOTS + '/cyc1-ui-town-390-bag.jpg', type: 'jpeg', quality: 60 });
    check('U-01/U-02: 0 database requests', T.db.attempts() === 0, JSON.stringify(T.db.http));
    check('U-01/U-02: no page errors', T.errors.length === 0, T.errors.join('|'));
    await T.ctx.close();
  }
  // ---- U-01: the test-only hook keeps the online HUD ----
  {
    const T = await open(browser, PHONE, '?hud=online'); const p = T.page;
    check('U-01 ?hud=online: quick chat is on the HUD (online layout)', !!(await box(p, '#quick-chat-row')));
    check('U-01 ?hud=online: Hold to talk is on the HUD (online layout)', !!(await box(p, '#walkie-talk-btn')));
    check('U-01 ?hud=online: 0 database requests', T.db.attempts() === 0, JSON.stringify(T.db.http));
    await T.ctx.close();
  }
  // ---- desktop keeps the full bag bar ----
  {
    const T = await open(browser, { viewport: { width: 1280, height: 720 } }); const p = T.page;
    const s = await bagState(p);
    check('desktop 1280x720: the bag bar still shows every count on one row', s.n === 10 && s.rows === 1, JSON.stringify(s));
    check('desktop: 0 database requests', T.db.attempts() === 0);
    await T.ctx.close();
  }
  // ---- U-03: 160x284 (a 320x568 phone at 200% zoom) ----
  {
    const T = await open(browser, { viewport: { width: 160, height: 284 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true }); const p = T.page;
    const inv = await box(p, '#inventory-panel');
    const hits = [];
    for (const sel of ['#joystick', '#action-buttons', '#player-list-panel', '#where-to-btn', '#chat-panel']) { const b = await box(p, sel); if (hit(inv, b)) hits.push(sel); }
    check('U-03 160x284: the bag bar overlaps no joystick / action button / panel / chat bar', inv && hits.length === 0, JSON.stringify({ inv, hits }));
    if (SHOTS) await p.screenshot({ path: SHOTS + '/cyc1-ui-town-160.jpg', type: 'jpeg', quality: 70 });
    check('U-03: 0 database requests', T.db.attempts() === 0);
    await T.ctx.close();
  }
  // ---- U-04: Realm Gate chip at 150% Text size ----
  {
    const T = await open(browser, PHONE, '', JSON.stringify({ v: 1, hudScale: 1.5 })); const p = T.page;
    await p.evaluate(() => { const g = document.getElementById('gate-pointer'); g.classList.remove('hidden'); const s = window.__g.scene.getScene('Town'); if (s.updateGatePointer) try { s.updateGatePointer(); } catch (e) { /* best effort */ } });
    await p.waitForTimeout(300);
    const scaled = await p.evaluate(() => document.body.classList.contains('a11y-hud-scaled'));
    const inv = await box(p, '#inventory-panel'); const gate = await box(p, '#gate-pointer');
    check('U-04 150% text: Text size is applied', scaled);
    const s = await bagState(p);
    check('U-02 150% text: the bag bar is still one row and no count spills out of it', s.rows <= 1 && s.n >= 1 && s.out.length === 0, JSON.stringify(s));
    check('U-04 150% text: the Realm Gate chip does not overlap the bag bar', inv && gate && !hit(inv, gate), JSON.stringify({ inv, gate }));
    if (SHOTS) await p.screenshot({ path: SHOTS + '/cyc1-ui-town-text150.jpg', type: 'jpeg', quality: 60 });
    check('U-04: 0 database requests', T.db.attempts() === 0);
    await T.ctx.close();
  }
  await browser.close();
  done();
})();
