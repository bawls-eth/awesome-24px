// PLAYTEST-REVIEW-3 Realm polish: (1) the "Visit the Nexus" pill never draws over an open backpack / shop / board / menu (it covered an Equip
// button); (2) the Nexus vendor's Shop and Forge open over the Nexus and closing them returns to the Nexus stall (only when opened from there);
// (3) the phone dungeon room is no longer a letterboxed strip: at 390x844 the room uses >= 55% of the screen height and pans sideways with the
// hero (desktop and ?dview=0 unchanged); (4) a fresh visitor's hero picker leaves the shared Menu button visible and tappable; (5) Realm HUD
// text (ability key letters, the desktop key hint, the gear button, the coach progress) is >= 12 px.
// Offline: blockDb + every WebSocket closed, 0 DB traffic, 0 console errors. Never chats, never writes to Firebase.
// Run: python3 -m http.server 8440 &   BASE=http://localhost:8440/game/index.html NODE_PATH=$(npm root -g) node game/tests/realm-polish3.test.js
const { chromium } = require('playwright');
const { check, done, blockDb } = require('./helpers');
const ORIGIN = (process.env.BASE || 'http://localhost:8440/game/index.html').replace(/\/game\/index\.html.*$/, '');
const PAGE = ORIGIN + '/game/games/mad-maze/index.html';
const WORLD = PAGE + '?mode=world&test=1&offline=1&seed=12345&qdate=2030-05-01';
const DUNGEON = PAGE + '?mode=dungeon&seed=5&test=1&offline=1';
const SAVE = 'pixeltown-save-v1';
const RM = { level: 6, xp: 0, shards: 5000, dust: 0, bestWave: 5, items: [{ n: 1, id: 'sparkwand', r: 0, t: 2 }, { n: 3, id: 'sparkwand', r: 1 }, { n: 5, id: 'heartcharm', r: 0 }], nextUid: 10, eq: { weapon: 1 } };
const PHONE = { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true };
const DESK = { viewport: { width: 1280, height: 720 } };

async function open(browser, ctxOpts, url, save, wait) {
  const ctx = await browser.newContext(ctxOpts);
  const db = await blockDb(ctx);
  await ctx.route('**/game/index.html*', (r) => r.fulfill({ contentType: 'text/html', body: '<!doctype html><title>town</title>town' }));
  await ctx.route('**/hub/index.html*', (r) => r.fulfill({ contentType: 'text/html', body: '<!doctype html><title>hub</title>hub' }));
  await ctx.routeWebSocket(/.*/, (ws) => ws.close()); // never reach the live DB
  const page = await ctx.newPage(); const errors = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errors.push('console: ' + m.text()); });
  await page.goto(ORIGIN + '/game/games/mad-maze/lantern.css');
  await page.evaluate(([k, v]) => { localStorage.clear(); if (v) localStorage.setItem(k, v); localStorage.setItem('mm-aim-assist', '0'); }, [SAVE, save ? JSON.stringify(save) : '']);
  errors.length = 0;
  await page.goto(url);
  if (wait !== false) await page.waitForFunction(() => window.__mm && window.__mm.arena && window.__mm.arena.active && window.__mm.arena.state === 'play', null, { timeout: 30000 });
  return { ctx, page, errors, db };
}
const E = (page, fn, arg) => page.evaluate(`(${fn.toString()})(window.__mm.arena, window.__mm.world, ${JSON.stringify(arg)})`);
const calm = (page) => E(page, (a) => { a.player.iframes = 1e9; a._hitPlayer = () => {}; a.eBullets.forEach((b) => { b.active = false; }); a.enemies.forEach((e) => { e.active = false; }); });
const frames = (page, n) => page.evaluate((k) => new Promise((res) => { let i = 0; const f = () => (++i >= k ? res() : requestAnimationFrame(f)); requestAnimationFrame(f); }), n);
const pillShown = (page) => page.evaluate(() => { const b = document.getElementById('rw-nexus-go'); if (!b) return false; const r = b.getBoundingClientRect(); return r.width > 0 && r.height > 0 && getComputedStyle(b).display !== 'none'; });
// controls in a panel that sit under the pill's box: is each one the top element at its centre?
const coveredIn = (page, sel) => page.evaluate((q) => {
  const pill = document.getElementById('rw-nexus-go'); const pr = pill.getBoundingClientRect();
  const out = [];
  document.querySelectorAll(q + ' button').forEach((b) => {
    const r = b.getBoundingClientRect(); if (!r.width || !r.height) return;
    const x = r.left + r.width / 2; const y = r.top + r.height / 2; if (x < 0 || y < 0 || x >= innerWidth || y >= innerHeight) return;
    const t = document.elementFromPoint(x, y);
    if (t && !(t === b || b.contains(t))) out.push((b.textContent || b.id).trim().slice(0, 20) + ' under ' + (t.id || t.className || t.tagName));
  });
  return { out, pill: pr.width > 0 };
}, sel);

(async () => {
  const browser = await chromium.launch();
  const errs = []; let dbHits = 0;
  const fin = async (A) => { errs.push(...A.errors); dbHits += A.db.attempts(); await A.ctx.close(); };

  // ---------- (1) + (2): the Nexus pill under panels, and the vendor's Shop / Forge return to the Nexus ----------
  for (const [label, opts] of [['phone 390x844', PHONE], ['desktop 1280x720', DESK]]) {
    const L = (s) => `[${label}] ${s}`;
    const A = await open(browser, opts, WORLD, { realm: RM }); const page = A.page;
    await calm(page);
    await E(page, (a, w) => { const s = w.nexus.site; a.player.x = s.x - 20; a.player.y = s.y; });
    await frames(page, 6);
    check(L('beside the Nexus portal the "Visit the Nexus" pill shows'), await pillShown(page));
    for (const [pn, openFn, sel] of [['backpack', (a) => a.setPaused(true), '#realm-backpack'], ['shop', (a) => a.setShop(true), '#realm-shop'], ['kill board', (a) => a.setBoard(true), '#realm-board']]) {
      await E(page, openFn); await frames(page, 3);
      const cov = await coveredIn(page, sel);
      check(L(`the pill is hidden while the ${pn} is open`), !(await pillShown(page)), '');
      check(L(`no ${pn} button is covered by the pill (Equip rows included)`), cov.out.length === 0, JSON.stringify(cov.out.slice(0, 4)));
      await E(page, (a) => a.setPaused(false)); await frames(page, 6);
    }
    check(L('the pill is back once the panels close (still beside the portal)'), await pillShown(page));

    // Shop from the Nexus stall -> close -> back in the Nexus with the stall open
    check(L('the Nexus opens'), await E(page, (a, w) => w.nexus.open()) === true);
    await E(page, (a, w) => { w.nexus.talk('vendor'); });
    await page.click('#rw-nx-shop');
    const sh = await E(page, (a, w) => ({ nx: w.nexus.isOpen(), panel: a.panel, buy: document.querySelectorAll('#realm-shop-body button[data-buy]').length }));
    check(L('the stall Shop opens the shard shop over the plaza (Nexus closed underneath)'), !sh.nx && sh.panel === 'shop' && sh.buy > 0, JSON.stringify(sh));
    await page.click('#realm-shop-close');
    const back = await E(page, (a, w) => ({ nx: w.nexus.isOpen(), stall: w.nexus.stall.isOpen(), panel: a.panel, paused: a.paused, shown: !document.getElementById('rw-nexus').classList.contains('hidden') }));
    check(L('closing the shop opened from the Nexus returns to the Nexus stall'), back.nx && back.stall && back.shown && back.panel === null && back.paused, JSON.stringify(back));
    // Forge from the stall -> close the backpack -> back in the Nexus
    await page.click('#rw-nx-forge');
    const fg = await E(page, (a, w) => ({ nx: w.nexus.isOpen(), panel: a.panel }));
    check(L('the stall Forge opens the backpack Forge (Nexus closed underneath)'), !fg.nx && fg.panel === 'bp', JSON.stringify(fg));
    await page.click('#realm-bp-close');
    const back2 = await E(page, (a, w) => ({ nx: w.nexus.isOpen(), stall: w.nexus.stall.isOpen(), panel: a.panel }));
    check(L('closing the Forge opened from the Nexus returns to the Nexus stall'), back2.nx && back2.stall && back2.panel === null, JSON.stringify(back2));
    // Escape closes the shop: still back to the Nexus (the Nexus' own Escape does not fire on the same key)
    await page.click('#rw-nx-shop');
    await page.keyboard.press('Escape'); await frames(page, 2);
    const back3 = await E(page, (a, w) => ({ nx: w.nexus.isOpen(), panel: a.panel }));
    if (label.startsWith('desktop')) check(L('Escape on the shop opened from the Nexus also returns to the Nexus'), back3.nx && back3.panel === null, JSON.stringify(back3));
    // leave the Nexus; a shop opened in the world closes into the world (the origin is not remembered)
    await E(page, (a, w) => { if (a.panel) a.setShop(false); w.nexus.close(); });
    await E(page, (a) => { a.player.x += 300; a.setShop(true); });
    await E(page, (a) => a.setShop(false));
    const w2 = await E(page, (a, w) => ({ nx: w.nexus.isOpen(), panel: a.panel, paused: a.paused }));
    check(L('a shop opened in the world closes into the world (no Nexus)'), !w2.nx && w2.panel === null && !w2.paused, JSON.stringify(w2));
    // the stall Shop then a menu: the origin is dropped
    await E(page, (a, w) => { const s = w.nexus.site; a.player.x = s.x - 20; a.player.y = s.y; w.nexus.open(); w.nexus.talk('vendor'); });
    await page.click('#rw-nx-shop');
    await E(page, (a) => { a.setBoard(true); a.setBoard(false); });
    check(L('switching from that shop to another panel forgets the Nexus origin'), !(await E(page, (a, w) => w.nexus.isOpen())));
    await fin(A);
  }

  // ---------- (3) the phone dungeon room height ----------
  // the generated floor (room graph + templates) as one string: the view must never change it
  const SIG = () => { const d = window.__mm.dungeon; return JSON.stringify({ rooms: d.graph.rooms.map((r) => [r.id, r.type]), tpl: d.narrowStats().rooms.map((r) => r.tpl), seed: d.seed }); };
  let sig = '';
  { const A = await open(browser, PHONE, DUNGEON, { realm: RM }); const page = A.page;
    await calm(page); await frames(page, 4);
    const g = await page.evaluate(() => { const c = document.getElementById('realm-canvas'); const r = c.getBoundingClientRect(); const a = window.__mm.arena; const h = (id) => { const e = document.getElementById(id); return e ? e.getBoundingClientRect() : null; }; const st = h('realm-stick-move'); return { top: r.top, bottom: r.bottom, left: r.left, right: r.right, h: r.height, vh: innerHeight, vw: innerWidth, W: a.W, H: a.H, cam: Object.assign({}, a.camera), dv: a._dv, stickTop: st ? st.top : null, ratio: r.height / innerHeight }; });
    check('phone 390x844 dungeon: the room uses >= 55% of the screen height (was ~35%)', g.ratio >= 0.55, JSON.stringify(g));
    check('phone dungeon: the canvas stays on screen, full width, above the move stick', g.top >= 0 && g.bottom <= g.vh && g.left >= -1 && g.right <= g.vw + 1 && g.right - g.left >= g.vw - 2 && (g.stickTop === null || g.bottom <= g.stickTop + 1), JSON.stringify(g));
    check('phone dungeon: the room itself is unchanged (17 x 13 tiles = 680 x 520, the full height shown)', g.W === 680 && g.H === 520 && g.dv && g.dv.vw < 680 && g.cam.vw === g.dv.vw, JSON.stringify(g));
    const pan = await E(page, (a) => { a.player.x = a.W - 40; a.player.y = a.H / 2; return null; });
    await frames(page, 40);
    const p1 = await E(page, (a) => ({ cx: a.camera.x, max: a.W - a._dv.vw, px: a.player.x, vw: a._dv.vw }));
    check('phone dungeon: the view pans sideways with the hero (the hero stays in view, clamped to the room)', p1.cx > 0 && p1.cx <= p1.max && p1.px > p1.cx && p1.px < p1.cx + p1.vw, JSON.stringify({ pan, p1 }));
    await E(page, (a) => { a.player.x = 40; });
    await frames(page, 40);
    check('phone dungeon: back on the left the view returns to the room edge', await E(page, (a) => a.camera.x) === 0);
    sig = await page.evaluate(SIG);
    await page.screenshot({ path: require('os').tmpdir() + '/realm-polish3-dungeon-390.png' });
    await fin(A);
  }
  { const A = await open(browser, PHONE, DUNGEON + '&dview=0', { realm: RM });
    const r = await A.page.evaluate(() => { const c = document.getElementById('realm-canvas').getBoundingClientRect(); return { ratio: c.height / innerHeight, dv: window.__mm.arena._dv }; });
    check('?dview=0 keeps the old full-room strip', r.ratio < 0.5 && !r.dv, JSON.stringify(r));
    const sig0 = await A.page.evaluate(SIG);
    check('phone dungeon: the generated floor (rooms, templates, seed) is identical with and without the view', sig && sig === sig0, sig.slice(0, 200) + ' vs ' + sig0.slice(0, 200));
    await fin(A); }
  { const A = await open(browser, DESK, DUNGEON, { realm: RM });
    const r = await A.page.evaluate(() => { const c = document.getElementById('realm-canvas').getBoundingClientRect(); const a = window.__mm.arena; return { w: c.width, h: c.height, dv: a._dv, cx: a.camera.x, cw: a.canvas.width / a.scale }; });
    check('desktop 1280x720 dungeon: the whole room shows as before (no dungeon view, no pan)', !r.dv && r.cx === 0 && Math.round(r.cw) === 680 && r.h >= 700, JSON.stringify(r));
    await fin(A); }

  // ---------- (4) the hero picker vs the Menu button (fresh visitor) ----------
  for (const [label, opts] of [['phone 390x844', PHONE], ['desktop 1280x720', DESK]]) {
    const A = await open(browser, opts, WORLD + '&heropick=1', null); const page = A.page;
    await page.waitForSelector('#realm-hero:not(.hidden) .hp-hero', { timeout: 15000 });
    await frames(page, 4); await page.waitForTimeout(600); // the dialog watch runs every 500 ms at most
    const m = await page.evaluate(() => {
      const b = document.getElementById('mm-nav-btn'); const card = document.querySelector('#realm-hero .rm-card');
      const r = b ? b.getBoundingClientRect() : null; const c = card.getBoundingClientRect();
      const top = r && r.width ? document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2) : null;
      return { shown: !!r && r.width > 0 && getComputedStyle(b).display !== 'none', onTop: !!top && (top === b || b.contains(top)), overlap: !!r && r.left < c.right && c.left < r.right && r.top < c.bottom && c.top < r.bottom, r: r && [r.left, r.top, r.width, r.height], c: [c.left, c.top, c.width, c.height], hero: !document.getElementById('realm-hero').classList.contains('hidden') };
    });
    check(`[${label}] a fresh visitor's hero picker leaves the Menu button visible, on top and clear of the picker card`, m.hero && m.shown && m.onTop && !m.overlap, JSON.stringify(m));
    if (m.shown && m.onTop) {
      await (opts.hasTouch ? page.tap('#mm-nav-btn') : page.click('#mm-nav-btn'));
      await page.waitForTimeout(700);
      check(`[${label}] tapping Menu over the picker opens the sheet (and it stays open)`, await page.evaluate(() => window.MMNav.isOpen()));
      await page.evaluate(() => window.MMNav.close());
    }
    await fin(A);
  }

  // ---------- (5) Realm text sizes ----------
  for (const [label, opts] of [['phone 390x844', PHONE], ['desktop 1280x720', DESK]]) {
    const A = await open(browser, opts, WORLD, { realm: RM }); const page = A.page;
    await frames(page, 6); await page.waitForTimeout(500);
    const t = await page.evaluate(() => {
      const vis = (e) => { for (let n = e; n && n.nodeType === 1; n = n.parentElement) { const cs = getComputedStyle(n); if (cs.display === 'none' || cs.visibility === 'hidden' || +cs.opacity === 0) return false; } const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
      const fs = (e) => parseFloat(getComputedStyle(e).fontSize);
      const tiny = []; const seen = [];
      document.querySelectorAll('#realm-overlay *').forEach((e) => {
        if (/^(SCRIPT|STYLE|CANVAS|svg|OPTION)$/.test(e.tagName)) return;
        if (![...e.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim())) return;
        if (!vis(e)) return;
        if (e.closest('#rw-nexus')) return; // the Nexus overlay is closed here
        if (e.matches('.realm-ab .key, .key-hint, #mm-gear-btn, #mm-gear-btn *, .mm-coach-prog')) seen.push(e.className || e.id);
        if (fs(e) < 12) tiny.push((e.id || e.className || e.tagName) + ' ' + fs(e) + 'px "' + e.textContent.trim().slice(0, 16) + '"');
      });
      const gear = document.getElementById('mm-gear-btn');
      return { tiny, seen, gearFont: gear ? fs(gear) : null, keyFont: (() => { const k = document.querySelector('.realm-ab .key'); return k ? fs(k) : null; })() };
    });
    check(`[${label}] no visible Realm HUD text under 12 px (key letters, key hint, gear label, coach progress)`, t.tiny.length === 0, JSON.stringify(t.tiny.slice(0, 6)));
    check(`[${label}] the gear button keeps a >= 12 px font (the glyph hides behind its icon, never 0 px text)`, t.gearFont >= 12 && t.keyFont >= 12, JSON.stringify(t));
    await fin(A);
  }

  check('0 console errors', errs.length === 0, errs.slice(0, 3).join(' | '));
  check('0 database requests or sockets', dbHits === 0, String(dbHits));
  await browser.close();
  done();
})().catch((e) => { console.error(e); process.exit(1); });
