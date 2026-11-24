// R4 D4 Town UI / navigation (OFFLINE only: blockDb + the Firebase SDK stubbed, "Play offline"; never chats or writes the DB).
//  b07-r2-04 join card says "Pick your hero"; the lone "Heroes" tab is a working "Surprise me" chip
//  b07-r2-08 build banner / Material / Undo at 390x844: no overlap with each other or the top HUD; buttons >= 44 px
//  b07-r2-09 Town Settings: the combat toggles sit under "Realm combat" (after See / Hear) with a where-it-applies note
//  b07-r2-10 only ONE "More" button (the bottom tray is "Tools")
//  b07-r2-13 the stall price is not drawn on the shopper's name; a refused buy says why (live region + float)
//  b07-r2-14 browser Back from the Isles returns to the town, not the join card
//  b15-13   browser Back with the shared Menu open closes the Menu and stays on the page (hub + town)
// Run: BASE=http://localhost:8440/game/index.html node game/tests/beta-r4-d4-town.test.js
const { chromium } = require('playwright');
const { check, done, offlineStub, exposeGame, joinOffline } = require('./helpers');
const BASE = process.env.BASE || 'http://localhost:8440/game/index.html';
const ROOT = BASE.replace(/game\/index\.html.*$/, '');
const SHOTS = process.env.SHOTS || null;

const vis = (page, sel) => page.evaluate((s) => Array.from(document.querySelectorAll(s)).filter((e) => { const cs = getComputedStyle(e); const r = e.getBoundingClientRect(); return cs.display !== 'none' && cs.visibility !== 'hidden' && r.width > 0 && r.height > 0; }).map((e) => { const r = e.getBoundingClientRect(); return { id: e.id || e.textContent.trim().slice(0, 14), x: r.left, y: r.top, r: r.right, b: r.bottom, w: r.width, h: r.height }; }), sel);
const hit = (a, b) => !!(a && b && a.x < b.r - 0.5 && b.x < a.r - 0.5 && a.y < b.b - 0.5 && b.y < a.b - 0.5);

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  const db = await offlineStub(ctx);
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  await exposeGame(page);
  await page.goto(BASE + '?from=hub&hud=online'); // U-01: Hold to talk stays in the build-banner checks

  // a11y: every Town overlay card (the *-overlay sheets with a close button) is announced as a named modal dialog
  const dl = await page.evaluate(() => [...document.querySelectorAll('[id$="-overlay"]')].filter((o) => o.querySelector('button[id$="close-btn"]')).map((o) => ({ id: o.id, ok: o.getAttribute('role') === 'dialog' && o.getAttribute('aria-modal') === 'true' && !!(o.getAttribute('aria-label') || o.getAttribute('aria-labelledby')) })).filter((o) => !o.ok));
  check('every Town overlay with a close button is role=dialog, aria-modal and named', dl.length === 0, JSON.stringify(dl));

  // b07-r2-04
  const pick = await page.evaluate(() => ({ label: (document.querySelector('label[id="hero-pick-label"]') || {}).textContent || '', tabs: [...document.querySelectorAll('#species-tabs .species-tab')].map((b) => b.textContent), old: /villager/i.test(document.getElementById('join-overlay').textContent.match(/Pick your \w+/) || '') }));
  check('join card: "Pick your hero" (no "Pick your villager")', pick.label === 'Pick your hero' && !pick.old, JSON.stringify(pick));
  check('join card: no one-option "Heroes" tab; the slot is the Surprise me chip', pick.tabs.length === 1 && /Surprise me/.test(pick.tabs[0]), JSON.stringify(pick.tabs));
  const before = await page.evaluate(() => (document.querySelector('#avatar-grid .avatar-choice.selected') || {}).dataset.hero);
  await page.tap('#species-tabs .species-tab');
  const after = await page.evaluate(() => (document.querySelector('#avatar-grid .avatar-choice.selected') || {}).dataset.hero);
  check('Surprise me picks a different hero', !!after && after !== before, JSON.stringify([before, after]));

  await joinOffline(page, 'ADMINr4d4');
  await page.waitForTimeout(600);

  // b07-r2-10
  const mores = await page.evaluate(() => [...document.querySelectorAll('button')].filter((b) => /\bMore\b/.test(b.textContent) && b.offsetParent !== null).map((b) => b.id));
  const tools = await page.evaluate(() => (document.getElementById('hud-more-btn') || {}).textContent);
  check('only one visible "More" button; the touch tray button reads Tools', mores.length <= 1 && /Tools/.test(tools || ''), JSON.stringify([mores, tools]));

  // b07-r2-08: panel expanded first (the worst case), then build mode
  await page.evaluate(() => { const s = window.__g.scene.getScene('Town'); if (s.setPanelCollapsed) s.setPanelCollapsed(false); });
  await page.waitForTimeout(250);
  await page.evaluate(() => window.__g.scene.getScene('Town').toggleBuildMode());
  await page.waitForTimeout(300);
  const b = Object.fromEntries((await vis(page, '#build-mode-banner, #build-material-btn, #build-undo-btn')).map((r) => [r.id, r]));
  const top = await vis(page, '#inventory-panel, #player-list-panel, #where-to-btn, #walkie-talk-btn, #gate-pointer');
  const ctl = [b['build-mode-banner'], b['build-material-btn'], b['build-undo-btn']];
  const self = hit(ctl[0], ctl[1]) || hit(ctl[0], ctl[2]) || hit(ctl[1], ctl[2]);
  const over = [];
  ctl.forEach((c) => top.forEach((t) => { if (hit(c, t)) over.push([c.id, t.id]); }));
  check('build mode 390x844: banner, Material and Undo all shown and do not overlap each other', ctl.every(Boolean) && !self, JSON.stringify(ctl));
  check('build mode 390x844: no build control overlaps the people panel, Where to?, inventory, Hold to talk or the gate chip', over.length === 0, JSON.stringify({ over, ctl, top }));
  check('build mode 390x844: Material and Undo are >= 44 px tall and inside the screen', ctl[1] && ctl[2] && ctl[1].h >= 44 && ctl[2].h >= 44 && ctl.every((c) => c.x >= 0 && c.r <= 390), JSON.stringify(ctl));
  if (SHOTS) await page.screenshot({ path: SHOTS + '/r4-d4-build.jpg', type: 'jpeg', quality: 60 });
  await page.evaluate(() => window.__g.scene.getScene('Town').toggleBuildMode());
  const restored = await page.evaluate(() => !document.getElementById('player-list-panel').classList.contains('collapsed'));
  check('leaving build mode restores the expanded panel', restored);
  await page.evaluate(() => { const s = window.__g.scene.getScene('Town'); if (s.setPanelCollapsed) s.setPanelCollapsed(true); });

  // b07-r2-13
  const stall = await page.evaluate(() => {
    const s = window.__g.scene.getScene('Town');
    s.localBody.setPosition(1760, 770);
    s.localScore = 0;
    s.updateTurnipPriceLabels(1e9);
    const lbl = s.turnipBuyLabel;
    s.buyTurnips();
    const toast = document.getElementById('achievement-toast');
    return { lblY: lbl.y, bodyY: s.localBody.y, note: s.lastStallNote || '', toast: toast && !toast.classList.contains('hidden') ? toast.textContent : '', live: toast && toast.getAttribute('aria-live'), turnips: s.resources.turnips || 0 };
  });
  check('stall price label sits above the stall sign, well clear of a shopper\'s name (body y - 40)', stall.lblY < stall.bodyY - 70, JSON.stringify(stall));
  check('a refused buy says why in a polite live region (not enough stars, price and what you have)', /Not enough stars/.test(stall.toast) && /⭐/.test(stall.toast) && stall.live === 'polite' && stall.turnips === 0, JSON.stringify(stall));

  // b07-r2-09
  await page.evaluate(() => { const b = document.getElementById('town-settings-btn'); if (b) b.click(); });
  await page.waitForSelector('#mmset:not([hidden])', { timeout: 5000 }).catch(() => {});
  const set = await page.evaluate(() => ({ groups: [...document.querySelectorAll('#mmset .mmset-group')].map((g) => g.getAttribute('data-group') + ':' + (g.querySelector('.mmset-gh') || {}).textContent), note: (document.querySelector('#mmset [data-group="play"] .mmset-gnote') || {}).textContent || '' }));
  const pi = set.groups.findIndex((g) => /^play:/.test(g));
  check('Town Settings: combat toggles are under "Realm combat", after See and Hear, with a "Realm arena only" note', pi > 1 && /Realm combat/.test(set.groups[pi]) && set.groups.slice(0, pi).some((g) => /^see:/.test(g)) && set.groups.slice(0, pi).some((g) => /^hear:/.test(g)) && /Realm arena/.test(set.note), JSON.stringify(set));
  await page.keyboard.press('Escape');
  await page.waitForTimeout(200);

  // b15-13 (town): Back with the Menu open closes it and stays
  const url0 = page.url();
  await page.evaluate(() => MMNav.open());
  await page.waitForTimeout(150);
  await page.goBack({ timeout: 1500 }).catch(() => null);
  await page.waitForTimeout(500);
  const tb = await page.evaluate(() => ({ open: MMNav.isOpen(), town: !!(window.__g && window.__g.scene.getScene('Town')), joinHidden: document.getElementById('join-overlay').classList.contains('hidden') })).catch(() => ({ left: true }));
  check('Town: browser Back with the Menu open closes the Menu and stays in town', !tb.left && tb.open === false && tb.town && tb.joinHidden && page.url() === url0, JSON.stringify([tb, page.url()]));
  // closing the Menu with its own button pops the entry again: a second open + close leaves no extra history entry
  const hl = await page.evaluate(async () => { const n0 = history.length; MMNav.open(); MMNav.close(); await new Promise((r) => setTimeout(r, 300)); return { n0, flag: !!(history.state && history.state.mmNavSheet) }; });
  check('Town: closing the Menu with its button leaves no Menu entry as the current history state', hl.flag === false, JSON.stringify(hl));

  // b07-r2-14: Isles then browser Back -> back in town (offline stays offline), not the join card
  await page.goto(ROOT + 'game/games/isles/index.html?from=town', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(800);
  await page.goBack({ waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.__g && window.__g.scene.getScene('Town') && window.__g.scene.getScene('Town').localBody, null, { timeout: 25000 }).catch(() => {});
  const back = await page.evaluate(() => ({ joinHidden: document.getElementById('join-overlay').classList.contains('hidden'), town: !!(window.__g && window.__g.scene.getScene('Town') && window.__g.scene.getScene('Town').localBody), name: (window.__g && window.__g.scene.getScene('Town') && window.__g.scene.getScene('Town').net && window.__g.scene.getScene('Town').net.constructor.name) || '' }));
  check('browser Back from the Isles lands in the town (join card hidden, offline net kept)', back.joinHidden && back.town && back.name === 'OfflineNet', JSON.stringify(back));

  // a fresh visit (typed URL / new load) still shows the join card
  await page.goto(BASE);
  await page.waitForTimeout(600);
  const fresh = await page.evaluate(() => !document.getElementById('join-overlay').classList.contains('hidden'));
  check('a fresh (non-Back) load still shows the join card', fresh);

  // b15-13 (hub): Back with the Menu open stays on the hub
  await page.goto(ROOT + 'game/hub/index.html');
  await page.waitForSelector('#mm-nav-btn', { timeout: 8000 });
  await page.click('#mm-nav-btn');
  await page.waitForTimeout(200);
  await page.goBack({ timeout: 1500 }).catch(() => null);
  await page.waitForTimeout(500);
  const hb = await page.evaluate(() => ({ path: location.pathname, open: window.MMNav && MMNav.isOpen(), focus: document.activeElement && document.activeElement.id })).catch(() => ({ left: true }));
  check('Hub: browser Back with the Menu open closes it, stays on the hub, focus back on Menu', /hub\/index\.html$/.test(hb.path || '') && hb.open === false && hb.focus === 'mm-nav-btn', JSON.stringify(hb));
  await page.goBack({ waitUntil: 'domcontentloaded' }).catch(() => null);
  check('Hub: a second Back (Menu closed) leaves the hub as usual', !/hub\/index\.html/.test(page.url()), page.url());

  check('offline: 0 database requests', db.attempts() === 0, JSON.stringify(db.http));
  check('no page errors', errors.length === 0, errors.join('|'));
  await browser.close();
  done();
})().catch((e) => { console.error(e); process.exit(1); });
