// Cycle 12 S: ID-61 welcome-back line (spec: U cycle 11 in design/IDEAS.md).
// A returning profile whose last saved visit day (lastVisitDate, ID-09) is 1+ UTC days before today gets ONE line,
// #town-welcome (role=status, aria-live=polite): "Welcome back! Your hero is Lv N in the Realm." (or "Welcome back to Pixeltown!"
// without a realm level). It is read BEFORE ID-09 rewrites lastVisitDate on this load, so a same-day reload shows nothing.
// Checks at 1280x720, 390x844, 195x422: shown once, inside the screen, clear of the top HUD row, A / C, Menu, Tools, the bag bar
// and the joystick, the close button >= 44 x 44; Esc closes it and does NOT open the Esc menu; same-day reload = nothing;
// no lastVisitDate = nothing; the visit count still goes up exactly once; it waits for the What's-new banner; it hides 3 s after
// the hero moves; no new save key. OFFLINE: helpers.offlineStub, literal db.attempts() === 0. Never chats, never writes Firebase.
// Run: BASE=http://localhost:9125/game/index.html NODE_PATH=$(npm root -g) node game/tests/cyc12-s-welcome-back.test.js  (SHOTS=<dir>)
const { chromium } = require('playwright');
const { check, done, offlineStub, exposeGame, joinOffline } = require('./helpers');
const BASE = process.env.BASE || 'http://localhost:8440/game/index.html';
const SHOTS = process.env.SHOTS || '';
const KEY = 'pixeltown-save-v1';
const VERSION = 'v34-aquarium'; // GAME_VERSION in main.js: seeded as seen so the What's-new banner stays down (except in part C)

const utc = (daysAgo) => new Date(Date.now() - daysAgo * 86400000).toISOString().slice(0, 10);
const seedSave = (ctx, obj) => ctx.addInitScript((o) => {
  if (!localStorage.getItem('__cyc12seeded')) { localStorage.setItem('pixeltown-save-v1', JSON.stringify(o)); localStorage.setItem('__cyc12seeded', '1'); }
}, obj);

async function openTown(ctx, name) {
  const page = await ctx.newPage(); const errors = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  await exposeGame(page);
  await page.goto(BASE);
  await joinOffline(page, name);
  await page.waitForTimeout(500);
  return { page, errors };
}
const state = (page) => page.evaluate(() => {
  const el = document.getElementById('town-welcome');
  const vis = (e) => !!e && !e.classList.contains('hidden') && getComputedStyle(e).display !== 'none' && e.getBoundingClientRect().width > 0;
  const r = el ? el.getBoundingClientRect() : null;
  const close = document.getElementById('town-welcome-close');
  const cr = close ? close.getBoundingClientRect() : null;
  const txt = document.getElementById('town-welcome-text');
  const lh = txt ? parseFloat(getComputedStyle(txt).lineHeight) : 0;
  const overlaps = [];
  const avoid = ['interact-btn', 'mobile-chat-btn', 'mm-nav-btn', 'hud-more-btn', 'inventory-panel', 'joystick', 'player-list-panel', 'where-to-btn', 'achievement-toast'];
  if (r && vis(el)) avoid.forEach((id) => {
    const o = document.getElementById(id); if (!vis(o)) return;
    const q = o.getBoundingClientRect();
    if (q.left < r.right - 0.5 && q.right > r.left + 0.5 && q.top < r.bottom - 0.5 && q.bottom > r.top + 0.5) overlaps.push(id);
  });
  let raw = {}; try { raw = JSON.parse(localStorage.getItem('pixeltown-save-v1') || '{}'); } catch (e) { raw = {}; }
  const s = window.__g.scene.getScene('Town');
  return {
    shown: vis(el), text: txt ? txt.textContent : '', role: el && el.getAttribute('role'), live: el && el.getAttribute('aria-live'),
    rect: r && { l: Math.round(r.left), t: Math.round(r.top), r: Math.round(r.right), b: Math.round(r.bottom), w: Math.round(r.width) },
    vw: innerWidth, vh: innerHeight, sw: document.documentElement.scrollWidth,
    close: cr && { w: Math.round(cr.width), h: Math.round(cr.height), label: close.getAttribute('aria-label') },
    lines: txt && lh ? Math.round(txt.getBoundingClientRect().height / lh) : 0,
    fs: txt ? parseFloat(getComputedStyle(txt).fontSize) : 0,
    overlaps, shownCount: s.welcomeBackShown || 0, visitDays: raw.visitDays, lastVisitDate: raw.lastVisitDate, keys: Object.keys(raw).sort(),
    escMenu: s.navSheetOpen() || !!(s.sharedSettings && s.sharedSettings.isOpen && s.sharedSettings.isOpen()) || !!document.querySelector('.mm-settings-overlay:not(.hidden), #mm-settings:not(.hidden)'),
  };
});

(async () => {
  const browser = await chromium.launch();
  const today = utc(0);

  // ---------- A. two days away: the line shows once, fits, Esc closes it (three viewports) ----------
  for (const vp of [{ width: 1280, height: 720, touch: false }, { width: 390, height: 844, touch: true }, { width: 195, height: 422, touch: true }]) {
    const tag = `${vp.width}x${vp.height}`;
    const ctx = await browser.newContext(vp.touch ? { viewport: vp, hasTouch: true, isMobile: true } : { viewport: vp });
    const db = await offlineStub(ctx);
    const OLD = { name: 'ADMINwb', species: 'cat', frame: 0, visitDays: 4, lastVisitDate: utc(2), lastSeenVersion: VERSION, realm: { level: 6, shards: 10 }, futureKey: { keep: 1 } };
    await seedSave(ctx, OLD);
    let { page, errors } = await openTown(ctx, 'ADMINwb');
    let s = await state(page);
    check(`[${tag}] 2 days away: #town-welcome is shown with the realm level line`, s.shown && s.text === 'Welcome back! Your hero is Lv 6 in the Realm.', JSON.stringify(s));
    check(`[${tag}] role=status, aria-live=polite, text >= 12 px`, s.role === 'status' && s.live === 'polite' && s.fs >= 12, JSON.stringify({ role: s.role, live: s.live, fs: s.fs }));
    check(`[${tag}] inside the screen, no sideways scroll`, s.rect && s.rect.l >= 0 && s.rect.t >= 0 && s.rect.r <= s.vw && s.rect.b <= s.vh && s.sw <= s.vw, JSON.stringify({ rect: s.rect, vw: s.vw, sw: s.sw }));
    // at <= 300 px the 283 px sentence beside the 44 px close button needs 3 lines (measured; see cycle12-systems.md), else <= 2
    const maxLines = vp.width <= 300 ? 3 : 2;
    check(`[${tag}] max width min(92vw, 420px), at most ${maxLines} lines`, s.rect && s.rect.w <= Math.min(0.92 * s.vw, 420) + 1 && s.lines >= 1 && s.lines <= maxLines, JSON.stringify({ w: s.rect && s.rect.w, lines: s.lines }));
    check(`[${tag}] covers none of: top HUD row, A, C, Menu, Tools, bag bar, joystick, achievement toast`, s.overlaps.length === 0, s.overlaps.join(','));
    check(`[${tag}] the close button is >= 44 x 44 and labelled Dismiss`, s.close && s.close.w >= 44 && s.close.h >= 44 && s.close.label === 'Dismiss', JSON.stringify(s.close));
    check(`[${tag}] ID-09 ran after the read: visit count 4 -> 5, lastVisitDate now today`, s.visitDays === 5 && s.lastVisitDate === today, JSON.stringify({ v: s.visitDays, d: s.lastVisitDate }));
    // the Town itself adds a few keys on every load (cave seed, the old login streak, offline stars); ID-61 adds none
    const ALWAYS = ['caveSeed', 'lastLoginDate', 'loginStreak', 'stars'];
    const added = s.keys.filter((k) => !(k in OLD));
    check(`[${tag}] no new save key from ID-61 (added only the Town's every-load keys)`, added.every((k) => ALWAYS.includes(k)) && !s.keys.some((k) => /welcome/i.test(k)), added.join(','));
    if (SHOTS) await page.screenshot({ path: `${SHOTS}/cyc12-systems-welcome-${tag}.jpg`, type: 'jpeg', quality: 80 });
    if (!vp.touch) {
      // a bubble-phase window listener (where the Town's own Esc handler lives) records whether Esc reached the page
      await page.evaluate(() => { window.__escSeen = 0; window.addEventListener('keydown', (e) => { if (e.key === 'Escape') window.__escSeen++; }); });
      await page.keyboard.press('Escape');
      await page.waitForTimeout(250);
      s = await state(page);
      const seen = await page.evaluate(() => window.__escSeen);
      check(`[${tag}] Esc closes the line, is captured (the page's Esc handlers never see it) and no menu opens`, !s.shown && !s.escMenu && seen === 0, JSON.stringify({ shown: s.shown, esc: s.escMenu, seen }));
      await page.keyboard.press('Escape'); await page.waitForTimeout(150);
      const seen2 = await page.evaluate(() => window.__escSeen);
      check(`[${tag}] control: with the line gone, the next Esc reaches the page again`, seen2 === 1, 'seen=' + seen2);
    } else {
      await page.locator('#town-welcome-close').tap();
      await page.waitForTimeout(250);
      s = await state(page);
      check(`[${tag}] a tap on the close button hides it`, !s.shown, JSON.stringify(s.shown));
    }
    // same day reload: nothing, visit count unchanged
    await page.close();
    ({ page, errors: errors } = await openTown(ctx, 'ADMINwb'));
    s = await state(page);
    check(`[${tag}] same-day reload: no line, visit count still 5 (counted exactly once)`, !s.shown && s.shownCount === 0 && s.visitDays === 5, JSON.stringify({ shown: s.shown, n: s.shownCount, v: s.visitDays }));
    check(`[${tag}] no page errors, no database traffic (literal 0)`, errors.length === 0 && db.attempts() === 0, errors.join(' | ') + ' db=' + db.attempts());
    await ctx.close();
  }

  // ---------- B. no lastVisitDate (first-ever visit and an old save from before ID-09): nothing ----------
  for (const [label, save] of [['first-ever visit (no save)', null], ['save without lastVisitDate', { name: 'ADMINwb2', species: 'cat', frame: 0, lastSeenVersion: VERSION, realm: { level: 3 } }]]) {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
    const db = await offlineStub(ctx);
    if (save) await seedSave(ctx, save);
    const { page, errors } = await openTown(ctx, 'ADMINwb2');
    const s = await state(page);
    check(`[B] ${label}: no welcome-back line`, !s.shown && s.shownCount === 0, JSON.stringify({ shown: s.shown, n: s.shownCount }));
    check(`[B] ${label}: no errors, 0 db`, errors.length === 0 && db.attempts() === 0, errors.join(' | ') + ' db=' + db.attempts());
    await ctx.close();
  }

  // ---------- C. no realm level: generic line; it waits for the What's-new banner; hides 3 s after the hero moves ----------
  {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
    const db = await offlineStub(ctx);
    await seedSave(ctx, { name: 'ADMINwb3', species: 'cat', frame: 0, visitDays: 2, lastVisitDate: utc(1), lastSeenVersion: 'old-version' });
    const { page, errors } = await openTown(ctx, 'ADMINwb3');
    const news = await page.evaluate(() => !document.getElementById('whats-new-banner').classList.contains('hidden'));
    let s = await state(page);
    check('[C] the What\'s-new banner is up and the welcome line waits behind it', news && !s.shown, JSON.stringify({ news, shown: s.shown }));
    await page.click('#whats-new-close-btn');
    await page.waitForTimeout(700);
    s = await state(page);
    check('[C] banner closed: the generic line shows (no realm level in the save)', s.shown && s.text === 'Welcome back to Pixeltown!', JSON.stringify(s.text));
    // real movement: hold the right arrow
    await page.keyboard.down('ArrowRight'); await page.waitForTimeout(500); await page.keyboard.up('ArrowRight');
    await page.waitForTimeout(1500);
    s = await state(page);
    check('[C] 1.5 s after moving it is still up', s.shown, JSON.stringify(s.shown));
    await page.waitForTimeout(2200);
    s = await state(page);
    check('[C] about 3 s after the hero first moved it has hidden itself', !s.shown && s.shownCount === 1, JSON.stringify({ shown: s.shown, n: s.shownCount }));
    check('[C] no errors, 0 db', errors.length === 0 && db.attempts() === 0, errors.join(' | ') + ' db=' + db.attempts());
    await ctx.close();
  }

  // ---------- D. helper truth table (pure) ----------
  {
    const ctx = await browser.newContext({ viewport: { width: 800, height: 600 } });
    const db = await offlineStub(ctx);
    const page = await ctx.newPage(); await page.goto(BASE);
    const r = await page.evaluate(() => [
      townWelcomeBackDue('2026-01-01', '2026-01-02'), townWelcomeBackDue('2026-01-02', '2026-01-02'), townWelcomeBackDue(undefined, '2026-01-02'),
      townWelcomeBackDue('2027-01-01', '2026-01-02'), townWelcomeBackDue('garbage', '2026-01-02'),
      townWelcomeBackText({ realm: { level: 12 } }), townWelcomeBackText({ realm: { level: 'x' } }), townWelcomeBackText({}), townWelcomeBackText({ realm: [] }),
    ]);
    check('[D] due: 1 day before = yes; same day, missing, future, garbage = no', JSON.stringify(r.slice(0, 5)) === '[true,false,false,false,false]', JSON.stringify(r));
    check('[D] text: level 12 named; bad / missing level = generic line', r[5] === 'Welcome back! Your hero is Lv 12 in the Realm.' && r.slice(6).every((t) => t === 'Welcome back to Pixeltown!'), JSON.stringify(r.slice(5)));
    check('[D] 0 db', db.attempts() === 0, 'db=' + db.attempts());
    await ctx.close();
  }

  await browser.close();
  done();
})().catch((e) => { console.error(e); process.exit(1); });
