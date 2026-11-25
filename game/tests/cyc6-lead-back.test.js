// Cycle 6 L: the shared Back guard (MMNav.backLayer / backWatch) on the overlays cycle 5 left open.
//  Realm: the first-visit hero picker takes NO Back entry (one Back leaves, no trap); settings sheet; fall card (Back = Try again,
//  Leave still leaves); Nexus. Isles: Settings sheet. Deepdelve: Craft / Goals panels. Angler: Journal card. Dash: Settings sheet.
//  Each: open with a real tap / click, real page.goBack(), the overlay is closed, the page is the same, no Menu entry is left on top.
// OFFLINE only (offlineStub: blockDb + Firebase SDK stubbed). test=1 on the Realm only exposes the arena (to fell the hero and to stand
// beside the Nexus portal); every open and every Back is real input.
// Run: BASE=http://localhost:8440/game/index.html node game/tests/cyc6-lead-back.test.js
const { chromium } = require('playwright');
const { check, done, offlineStub } = require('./helpers');
const BASE = process.env.BASE || 'http://localhost:8440/game/index.html';
const ROOT = BASE.replace(/game\/index\.html.*$/, '');
const SHOTS = process.env.SHOTS || null;
const REALM = ROOT + 'game/games/mad-maze/index.html?mode=world&test=1&seed=777';

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
    const T = (s) => `${V.tag}: ${s}`;
    const shot = async (n) => { if (SHOTS) await page.screenshot({ path: `${SHOTS}/cyc6-lead-back-${V.tag}-${n}.jpg`, type: 'jpeg', quality: 70 }); };
    const st = (ids) => page.evaluate((list) => {
      const shown = (id) => { const d = document.getElementById(id); return !!d && !d.classList.contains('hidden') && !d.hidden && d.getClientRects().length > 0; };
      const o = { path: location.pathname, flag: !!(history.state && history.state.mmNavSheet), layers: window.MMNav && window.MMNav.backLayers ? window.MMNav.backLayers() : null, nav: !!(window.MMNav && window.MMNav.isOpen()) };
      (list || []).forEach((id) => { o[id] = shown(id); });
      return o;
    }, ids || []).catch(() => ({ path: 'gone' }));
    const back = async () => { await page.goBack({ timeout: 2500 }).catch(() => null); await page.waitForTimeout(600); };
    const backLeaves = async () => { await page.goBack({ waitUntil: 'domcontentloaded', timeout: 5000 }).catch(() => null); await page.waitForTimeout(500); };
    // one overlay: open it for real, Back closes it and stays; then the next Back leaves (nothing is trapped, nothing is left on top)
    async function guarded(name, re, ids, open, shotName) {
      await open(); await page.waitForTimeout(400);
      const a = await st(ids);
      if (shotName) await shot(shotName);
      await back();
      const b = await st(ids);
      check(T(`${name}: opens, and Back closes it and stays on the page`), ids.some((id) => a[id]) && ids.every((id) => !b[id]) && re.test(b.path) && b.nav === false, JSON.stringify([a, b]));
      check(T(`${name}: no Menu entry left as the current history state after Back`), b.flag === false && Array.isArray(b.layers) && b.layers.length === 0, JSON.stringify(b));
    }

    // ---- Realm: first-visit hero picker (opens by itself, the player has not touched the page) ----
    await page.goto(ROOT + 'game/hub/index.html');
    await page.goto(ROOT + 'game/games/mad-maze/index.html?mode=world'); // no test flag: a test page skips the first-visit picker
    await page.waitForSelector('.hp-hero', { timeout: 20000 });
    await page.waitForTimeout(500);
    const h0 = await st(['realm-hero']);
    check(T('Realm first visit: the hero picker is open and owns NO Back entry'), h0['realm-hero'] === true && h0.flag === false && h0.layers.indexOf('realm-panel') < 0, JSON.stringify(h0));
    await shot('1-first-picker');
    await backLeaves();
    check(T('Realm first visit: ONE Back from the untouched hero picker leaves (no trap)'), /hub\/index\.html/.test(page.url()), page.url());

    // ---- Realm: pick a hero, then settings sheet, fall card, Nexus ----
    await page.goto(REALM);
    await page.waitForFunction(() => !!document.querySelector('.hp-hero') || !!(window.__mm && window.__mm.arena && window.__mm.arena.active && window.__mm.arena.state === 'play'), null, { timeout: 20000 }).catch(() => null);
    if (await page.evaluate(() => { const d = document.getElementById('realm-hero'); return !!d && !d.classList.contains('hidden') && !!document.querySelector('.hp-hero'); })) await act('.hp-hero');
    await page.waitForFunction(() => { const d = document.getElementById('realm-hero'); const a = window.__mm && window.__mm.arena; return (!d || d.classList.contains('hidden')) && a && a.active && a.state === 'play'; }, null, { timeout: 15000 }).catch(() => null);
    await page.waitForTimeout(400);
    const RE_REALM = /mad-maze\/index\.html$/;

    await guarded('Realm settings sheet (gear)', RE_REALM, ['mm-settings', 'mmset', 'realm-pause'], () => act('#mm-gear-btn'), '2-realm-settings');

    // the hero picker opened by the player (Menu > Pick hero) IS guarded
    await act('#realm-menu-btn'); await page.waitForTimeout(300);
    const pickBtn = await page.$('#realm-pause button[data-m="hero"]');
    if (pickBtn) {
      await guarded('Realm hero picker opened by the player', RE_REALM, ['realm-hero'], () => act('#realm-pause button[data-m="hero"]'));
    } else { await act('#realm-pause button[data-m="resume"].rm-btn'); await page.waitForTimeout(400); }

    // fall card: Back = Try again
    const fell = async () => {
      await page.evaluate(() => { const a = window.__mm.arena; a.paused = false; a.player.iframes = 0; a.shield.hits = 0; a.player.hp = 1; a._hitPlayer(9999); });
      await page.waitForFunction(() => { const d = document.getElementById('realm-death'); return !!d && !d.classList.contains('hidden'); }, null, { timeout: 15000 }).catch(() => null);
      await page.waitForTimeout(300);
    };
    await fell();
    const d1 = await st(['realm-death']);
    await shot('3-fall-card');
    await back();
    const d2 = await st(['realm-death']);
    const run = await page.evaluate(() => { const a = window.__mm.arena; return { state: a.state, hp: a.player.hp, max: a.stats.maxHp, active: a.active, deaths: a.save.deaths }; });
    check(T('Realm fall card: Back closes it, stays in the Realm and starts a fresh run (Try again)'), d1['realm-death'] === true && d2['realm-death'] === false && RE_REALM.test(d2.path) && run.active && run.state !== 'dead' && run.hp === run.max, JSON.stringify([d1, d2, run]));
    check(T('Realm fall card: no Menu entry left on top after Back'), d2.flag === false && d2.layers.length === 0, JSON.stringify(d2));
    await shot('4-after-back');

    // Nexus
    await page.waitForFunction(() => window.__mm.arena.state === 'play', null, { timeout: 15000 }).catch(() => null);
    const nxOk = await page.evaluate(() => { const a = window.__mm.arena, w = window.__mm.world; if (!w || !w.nexus || !w.nexus.on || !w.nexus.site) return false; a.player.x = w.nexus.site.x - 20; a.player.y = w.nexus.site.y; return true; });
    if (nxOk) {
      await page.waitForFunction(() => { const b = document.getElementById('rw-nexus-go'); return !!b && !b.classList.contains('hidden'); }, null, { timeout: 8000 }).catch(() => null);
      await guarded('Realm Nexus', RE_REALM, ['rw-nexus'], () => act('#rw-nexus-go'), '5-nexus');
      const after = await page.evaluate(() => ({ paused: window.__mm.arena.paused, state: window.__mm.arena.state }));
      check(T('Realm Nexus: the run goes on after Back (not paused)'), after.paused === false && after.state === 'play', JSON.stringify(after));
    } else check(T('Realm Nexus is reachable in this world'), false, 'no nexus site');

    // fall card: Leave still leaves and is never pulled back
    await fell();
    await act('#realm-death button[data-d="leave"]');
    await page.waitForFunction(() => !/mad-maze/.test(location.pathname), null, { timeout: 8000 }).catch(() => null);
    await page.waitForTimeout(900);
    check(T('Realm fall card: Leave leaves the Realm and stays away'), !/mad-maze/.test(page.url()), page.url());

    // ---- Isles: Settings sheet (Menu > Settings) ----
    await page.goto(ROOT + 'game/hub/index.html');
    await page.goto(ROOT + 'game/games/isles/index.html');
    await page.waitForSelector('#btn-pack', { timeout: 20000 });
    await page.waitForTimeout(1200);
    if (await page.evaluate(() => { const h = document.getElementById('howto'); return !!h && !h.hidden; })) await act('#howto-close').catch(() => null);
    const viaMenu = async () => { await act('#mm-nav-btn'); await page.waitForTimeout(300); await act('#mm-nav-settings'); };
    await guarded('Isles Settings sheet', /isles\/index\.html$/, ['mmset'], viaMenu, '6-isles-settings');
    await backLeaves();
    check(T('Isles: the next Back (nothing open) leaves the island'), !/isles\/index\.html/.test(page.url()), page.url());

    // ---- Deepdelve: Craft and Goals panels ----
    await page.goto(ROOT + 'game/hub/index.html');
    await page.goto(ROOT + 'game/games/deepdelve/index.html');
    await page.waitForSelector('#open-craft', { state: 'attached', timeout: 20000 });
    await page.waitForTimeout(1500);
    const ddOpen = (name) => async () => {
      const vis = await page.evaluate((n) => { const b = document.getElementById('open-' + n); return !!b && b.getClientRects().length > 0; }, name);
      if (vis) await act('#open-' + name); else { await page.mouse.click(5, 5).catch(() => null); await page.keyboard.press(name === 'craft' ? 'c' : 'g'); } // desktop: the C / G keys (the touch row is hidden)
    };
    await guarded('Deepdelve Craft panel', /deepdelve\/index\.html$/, ['craft-panel'], ddOpen('craft'), '7-deepdelve-craft');
    await guarded('Deepdelve Goals panel', /deepdelve\/index\.html$/, ['goals-panel'], ddOpen('goals'));
    await backLeaves();
    check(T('Deepdelve: the next Back (nothing open) leaves the page'), !/deepdelve\/index\.html/.test(page.url()), page.url());

    // ---- Angler: Journal card ----
    await page.goto(ROOT + 'game/hub/index.html');
    await page.goto(ROOT + 'game/games/angler/index.html');
    await page.waitForSelector('#journal-btn', { timeout: 20000 });
    await page.waitForTimeout(1000);
    if (await page.evaluate(() => { const g = document.getElementById('pregame'); return !!g && !g.hidden; })) { await act('#pg-play'); await page.waitForTimeout(300); } // the How-to card of a first visit
    await guarded('Angler Journal card', /angler\/index\.html$/, ['journal'], () => act('#journal-btn'), '8-angler-journal');
    await act('#journal-btn'); await page.waitForTimeout(250); await act('#journal-close'); await page.waitForTimeout(400);
    const j = await st(['journal']);
    check(T('Angler: closing the Journal with its own button leaves no Menu entry on top'), j.journal === false && j.flag === false && j.layers.length === 0, JSON.stringify(j));
    await backLeaves();
    check(T('Angler: the next Back (nothing open) leaves the page'), !/angler\/index\.html/.test(page.url()), page.url());

    // ---- a mini (Dash): Settings sheet ----
    await page.goto(ROOT + 'game/hub/index.html');
    await page.goto(ROOT + 'game/games/dash/index.html');
    await page.waitForSelector('#mm-nav-btn', { timeout: 20000 });
    await page.waitForTimeout(800);
    await guarded('Dash Settings sheet', /dash\/index\.html$/, ['mmset'], viaMenu, '9-dash-settings');

    check(T('no page errors'), errors.length === 0, errors.join(' | '));
    check(T('no database traffic (literal 0 attempts)'), db.attempts() === 0, String(db.attempts()));
    await ctx.close();
  }
  await browser.close();
  done();
})().catch((e) => { console.error(e); process.exit(1); });
