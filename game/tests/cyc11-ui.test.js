// Cycle 11 U (UI/UX). Every check below failed on the cycle-10 tip (bd92da2) and passes with this branch:
//  1. ID-53 just-in-time hint below 300 px wide: on the old code it never showed at 195x422 (no free band: why = 'overlap'). Now it briefly
//     takes the goal line's box (same left/top/width), the goal line is visibility:hidden only while it shows, the close button is on top,
//     text >= 12 px, >= 44 px close, 8 px or more above the sticks, covers no control / HUD strip; a real tap on the close button hides it
//     and brings the goal line back. 390x844 is unchanged (main slot, goal line visible).
//  2. ID-55 first-session card below 300 px wide: on the old code it was 311 px tall at 195x422 (y 6-317) and covered the hero at the
//     screen centre. Now it ends at least 16 px above the hero's centre at 195x422 and 240x480, fits the screen, no sideways scroll,
//     both buttons >= 44 px on one row, no word broken across lines, all text >= 12 px.
//  3. Kill board (#realm-board): on the old code the whole card scrolled and its close button left the screen at 195x422 (y -82). Now only
//     #realm-board-body scrolls; after scrolling it to the end the close button is on screen and on top, the Hero stats button is on screen,
//     and a real tap / click on the close button closes the board (195x422, 390x844, 1280x720).
//  4. Museum tab bar at <= 480 px: on the old code the stuck bar sat 20 px under the card's top edge, so scrolled specimen cards showed in
//     a strip above it. Now the stuck bar is flush with the card's top edge (the point just under the edge is the bar), it is <= 40 px tall
//     at 195x422, and a specimen card scrolled into view with block 'start' lands fully below the bar (scroll-padding-top).
// OFFLINE: blockDb / offlineStub, every WebSocket closed; literal 0 database attempts. The Town join is an ADMIN bot, offline.
// Run: BASE=http://localhost:8440/game/index.html node game/tests/cyc11-ui.test.js   (SHOTS=<dir> also saves screenshots)
const { chromium } = require('playwright');
const { check, done, blockDb, offlineStub, exposeGame, joinOffline } = require('./helpers');
const LS = require('./lib/load-scale');
const ORIGIN = (process.env.BASE || 'http://localhost:8440/game/index.html').replace(/\/game\/index\.html.*$/, '');
const MM = ORIGIN + '/game/games/mad-maze/index.html?mode=world&from=hub&test=1&seed=12345&heropick=0&tutorial=0&qdate=2030-05-01';
const SHOT = (page, name) => (process.env.SHOTS ? page.screenshot({ path: process.env.SHOTS + '/cyc11-ui-' + name + '.jpg', type: 'jpeg', quality: 60 }).catch(() => null) : null);

async function openMM(browser, w, h, q) {
  const touch = w < 600;
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, hasTouch: touch, isMobile: touch });
  const db = await blockDb(ctx); await ctx.routeWebSocket(/.*/, (ws) => ws.close());
  await ctx.route('**/game/index.html*', (r) => r.fulfill({ contentType: 'text/html', body: '<!doctype html>town' }));
  const page = await ctx.newPage(); const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(MM + q);
  await page.waitForFunction(() => window.__mm && window.__mm.world && window.__mm.arena.active && window.__mm.arena.state === 'play', null, { timeout: LS.budget(40000) });
  await page.evaluate(() => { const a = window.__mm.arena; a.player.iframes = 1e9; a._autoFire = false; a.enemies.forEach((e) => { e.active = false; }); });
  return { ctx, page, db, errors, touch };
}
const tapAt = async (s, sel) => { const r = await s.page.evaluate((q) => { const b = document.querySelector(q).getBoundingClientRect(); return { x: b.left + b.width / 2, y: b.top + b.height / 2 }; }, sel); if (s.touch) await s.page.touchscreen.tap(r.x, r.y); else await s.page.mouse.click(r.x, r.y); };
const clean = async (s, tag) => { check(tag + ': no page errors, no database traffic (literal 0)', s.errors.length === 0 && s.db.attempts() === 0, s.errors.join(' | ') + ' db=' + s.db.attempts()); await s.ctx.close(); };

const HINT = () => {
  const el = document.getElementById('rw-jhint'); const st = window.__mm.world.jitHint.state(); const g = document.getElementById('rw-goal');
  const r = el.getBoundingClientRect(); const shown = !el.classList.contains('hidden') && getComputedStyle(el).display !== 'none' && r.width > 0;
  const vis = (e) => !!e && !e.classList.contains('hidden') && !e.hidden && e.getClientRects().length > 0 && getComputedStyle(e).display !== 'none' && getComputedStyle(e).visibility !== 'hidden';
  const hit = []; let stickGap = 1e9;
  ['realm-abilities', 'rw-zone', 'rw-goal', 'rw-minimap', 'realm-hp', 'realm-info', 'realm-xp', 'realm-stick-move', 'realm-stick-aim'].forEach((id) => {
    const e = document.getElementById(id); if (!shown || !vis(e)) return; const q = e.getBoundingClientRect(); if (q.width <= 0 || q.height <= 0) return;
    if (/stick/.test(id) && q.left < r.right && q.right > r.left) stickGap = Math.min(stickGap, q.top - r.bottom);
    if (q.left < r.right && q.right > r.left && q.top < r.bottom && q.bottom > r.top) hit.push(id);
  });
  if (shown) document.querySelectorAll('button, a[href], [role="button"]').forEach((e) => {
    if (el.contains(e) || !vis(e)) return; const q = e.getBoundingClientRect(); if (q.width <= 0 || q.height <= 0) return;
    if (q.left < r.right && q.right > r.left && q.top < r.bottom && q.bottom > r.top) hit.push(e.id || e.className || e.tagName);
  });
  const x = el.querySelector('.rw-jhint-x').getBoundingClientRect(); const gr = g.getBoundingClientRect();
  return { shown, st, text: el.textContent, box: [r.left, r.top, r.right, r.bottom].map(Math.round), goal: [gr.left, gr.top, gr.right, gr.bottom].map(Math.round), goalVis: getComputedStyle(g).visibility, goalShown: vis(g),
    fs: parseFloat(getComputedStyle(el.querySelector('.rw-jhint-txt')).fontSize), x: [Math.round(x.width), Math.round(x.height)], xAbove: x.bottom <= el.querySelector('.rw-jhint-txt').getBoundingClientRect().top + 0.5,
    hit, stickGap, inView: r.left >= -0.5 && r.top >= -0.5 && r.right <= innerWidth + 0.5 && r.bottom <= innerHeight + 0.5, hscroll: document.documentElement.scrollWidth > innerWidth + 1 };
};
const BROKEN_SMALL = (root) => { // words split across lines + text under 12 px inside root
  const out = { broken: [], small: [] }; const tw = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  for (let n = tw.nextNode(); n; n = tw.nextNode()) {
    const el = n.parentElement; if (!el || !el.getClientRects().length || !n.data.trim()) continue;
    if (parseFloat(getComputedStyle(el).fontSize) < 11.95) out.small.push(n.data.trim().slice(0, 16));
    const re = /\S+/g; let m;
    while ((m = re.exec(n.data))) { if (m[0].length < 2) continue; const rg = document.createRange(); rg.setStart(n, m.index); rg.setEnd(n, m.index + m[0].length); const tops = new Set([...rg.getClientRects()].filter((q) => q.width > 0).map((q) => Math.round(q.top))); if (tops.size > 1) out.broken.push(m[0]); }
  }
  return out;
};

(async () => {
  const browser = await chromium.launch();

  // ---- 1) ID-53 hint below 300 px: takes the goal line's place; 390x844 unchanged ----
  for (const [w, h] of [[195, 422], [240, 480], [390, 844]]) {
    const tag = `hint ${w}x${h}`; const s = await openMM(browser, w, h, '&firstend=0');
    // a quiet moment first (no notice / banner / coach toast: the game itself hides the hint for those), as the real 20 s trigger requires
    await s.page.waitForFunction(() => window.__mm.world.jitHint.state().block === '', null, { timeout: LS.budget(20000) }).catch(() => null);
    await s.page.waitForTimeout(300);
    await s.page.evaluate(() => window.__mm.world.jitHint.showNow());
    const m = await s.page.evaluate(HINT);
    if (w < 300) {
      check(tag + ': the hint shows (old code: refused, no free slot) and sits in the goal line box (slot goal, same left / top / width)', m.shown && m.st.slot === 'goal' && Math.abs(m.box[0] - m.goal[0]) <= 1 && Math.abs(m.box[1] - m.goal[1]) <= 1 && Math.abs(m.box[2] - m.goal[2]) <= 1, JSON.stringify(m));
      check(tag + ': the goal line is hidden (visibility) only while the hint shows', m.goalVis === 'hidden', m.goalVis);
      check(tag + ': inside the screen, covers no control or HUD strip, 8 px or more above the sticks, no sideways scroll', m.inView && m.hit.length === 0 && m.stickGap >= 8 && !m.hscroll, JSON.stringify(m));
      check(tag + ': short touch wording, text >= 12 px, close button >= 44 x 44 and above the text (away from the sticks)', /Tap ability 1|Open the Menu|Pick up the drops/.test(m.text) && m.fs >= 12 && m.x[0] >= 44 && m.x[1] >= 44 && m.xAbove, JSON.stringify(m));
      if (w === 195) await SHOT(s.page, 'hint-195x422');
      await tapAt(s, '#rw-jhint .rw-jhint-x'); await s.page.waitForTimeout(250);
      const a = await s.page.evaluate(HINT);
      check(tag + ': a real tap on the close button hides the hint and the goal line comes back', !a.shown && a.st.why === 'close' && a.goalVis === 'visible' && a.goalShown, JSON.stringify({ st: a.st, goalVis: a.goalVis, goalShown: a.goalShown }));
    } else {
      check(tag + ': unchanged on a normal phone: main slot, goal line still visible, covers nothing', m.shown && m.st.slot === 'main' && m.goalVis === 'visible' && m.hit.length === 0 && m.stickGap >= 40, JSON.stringify(m));
      await SHOT(s.page, 'hint-390x844');
    }
    await clean(s, tag);
  }

  // ---- 2) ID-55 first-session card below 300 px: compact, clear of the hero ----
  for (const [w, h] of [[195, 422], [240, 480], [390, 844]]) {
    const tag = `first-session card ${w}x${h}`; const s = await openMM(browser, w, h, '&fesec=3&jithint=0');
    const op = await s.page.waitForFunction(() => window.__mm.world.firstEnd.state().open, null, { timeout: LS.budget(20000) }).then(() => true).catch(() => false);
    const m = await s.page.evaluate(`(() => {
      const el = document.getElementById('rw-firstend'); const r = el.getBoundingClientRect(); const a = window.__mm.arena;
      const c = document.getElementById('realm-canvas').getBoundingClientRect(); const k = c.width / a.W; const p = a.worldToScreen(a.player.x, a.player.y);
      const btns = [...el.querySelectorAll('button')].map((b) => { const q = b.getBoundingClientRect(); return { t: b.textContent, w: Math.round(q.width), h: Math.round(q.height), top: Math.round(q.top) }; });
      return { box: [r.left, r.top, r.right, r.bottom].map(Math.round), hero: { x: Math.round(c.left + p.x * k), y: Math.round(c.top + p.y * k) }, btns,
        inView: r.left >= -0.5 && r.top >= -0.5 && r.right <= innerWidth + 0.5 && r.bottom <= innerHeight + 0.5, innerX: el.scrollWidth > el.clientWidth + 1, innerY: el.scrollHeight > el.clientHeight + 1,
        hscroll: document.documentElement.scrollWidth > innerWidth + 1, ...(${BROKEN_SMALL.toString()})(el) };
    })()`);
    check(tag + ': the card opens, fits the screen, no sideways scroll, nothing cut (no inner scroll)', op && m.inView && !m.innerX && !m.innerY && !m.hscroll, JSON.stringify(m));
    check(tag + ': both buttons >= 44 x 44, no word broken across lines, all text >= 12 px', m.btns.length === 2 && m.btns.every((b) => b.w >= 44 && b.h >= 44) && m.broken.length === 0 && m.small.length === 0, JSON.stringify(m));
    if (w < 300) {
      check(tag + ': the card ends 16 px or more above the hero (old code: 311 px tall, over the hero at 195x422)', m.box[3] <= m.hero.y - 16, JSON.stringify({ box: m.box, hero: m.hero }));
      check(tag + ': both buttons on one row (compact layout)', m.btns.length === 2 && m.btns[0].top === m.btns[1].top, JSON.stringify(m.btns));
    }
    await SHOT(s.page, `first-end-${w}x${h}`);
    await clean(s, tag);
  }

  // ---- 3) kill board: the title row with the close button stays put, only the body scrolls ----
  for (const [w, h] of [[195, 422], [390, 844], [1280, 720]]) {
    const tag = `kill board ${w}x${h}`; const s = await openMM(browser, w, h, '&firstend=0&jithint=0');
    await s.page.evaluate(() => window.__mm.arena.setBoard(true)); await s.page.waitForTimeout(300);
    const m = await s.page.evaluate(() => {
      const card = document.querySelector('#realm-board .realm-bp-card'); const body = document.getElementById('realm-board-body'); const x = document.getElementById('realm-board-close'); const hb = document.getElementById('realm-board-hero');
      body.scrollTop = 1e6; card.scrollTop = 1e6;
      const r = x.getBoundingClientRect(); const at = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
      const hr = hb && !hb.hidden ? hb.getBoundingClientRect() : null;
      return { x: [r.left, r.top, r.right, r.bottom].map(Math.round), onTop: at === x || x.contains(at), cardScroll: card.scrollTop, bodyScroll: body.scrollTop, bodyOv: getComputedStyle(body).overflowY, bodyOverflows: body.scrollHeight > body.clientHeight + 1,
        hero: hr ? [Math.round(hr.top), Math.round(hr.bottom)] : null, vh: innerHeight };
    });
    check(tag + ': the card itself never scrolls; the body is the scroller', m.cardScroll === 0 && m.bodyOv === 'auto', JSON.stringify(m));
    if (w === 195) check(tag + ': the body really scrolls here (more rows than room)', m.bodyOverflows && m.bodyScroll > 0, JSON.stringify(m));
    check(tag + ': after scrolling to the end the close button is on screen and on top (old code at 195x422: y -82)', m.x[1] >= -0.5 && m.x[3] <= m.vh + 0.5 && m.onTop, JSON.stringify(m));
    check(tag + ': the Hero stats button is still on screen', !m.hero || (m.hero[0] >= -0.5 && m.hero[1] <= m.vh + 0.5), JSON.stringify(m));
    await SHOT(s.page, `board-${w}x${h}`);
    await tapAt(s, '#realm-board-close'); await s.page.waitForTimeout(250);
    const closed = await s.page.evaluate(() => document.getElementById('realm-board').classList.contains('hidden'));
    check(tag + ': a real ' + (s.touch ? 'tap' : 'click') + ' on the close button closes the board', closed, String(closed));
    await clean(s, tag);
  }

  // ---- 4) Museum tab bar on phones ----
  for (const [w, h] of [[195, 422], [390, 844]]) {
    const tag = `museum ${w}x${h}`;
    const ctx = await browser.newContext({ viewport: { width: w, height: h }, hasTouch: true, isMobile: true });
    const db = await offlineStub(ctx); const page = await ctx.newPage(); const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await exposeGame(page); await page.goto(ORIGIN + '/game/index.html'); await joinOffline(page, 'ADMINcyc11ui');
    await page.waitForFunction(() => window.__g && window.__g.scene.getScene('Town') && window.__g.scene.getScene('Town').localBody, null, { timeout: LS.budget(40000) });
    await page.evaluate(() => { const s = window.__g.scene.getScene('Town'); ['honeybee', 'fox', 'frog'].forEach((id) => s.ffDiscovered.add(id)); s.openMuseum(); s.museumWing = 'wildfauna'; s.showMuseumWing(); });
    await page.waitForTimeout(500);
    const m = await page.evaluate(() => {
      const card = document.querySelector('#museum-overlay .museum-card'); const tabs = card.querySelector('.museum-tabs'); const cs = getComputedStyle(card);
      const edge = card.getBoundingClientRect().top + parseFloat(cs.borderTopWidth);
      card.scrollTop = 400; const t = tabs.getBoundingClientRect(); const cr = card.getBoundingClientRect();
      const at = document.elementFromPoint(cr.left + cr.width / 2, edge + 2);
      const items = [...document.querySelectorAll('#museum-wildfauna-list > li')]; const target = items[2] || items[items.length - 1];
      target.scrollIntoView({ block: 'start' }); const ir = target.getBoundingClientRect(); const t2 = tabs.getBoundingClientRect();
      card.scrollTop = 0;
      return { edge: Math.round(edge), barTop: Math.round(t.top), barH: Math.round(t.height), topIsBar: !!at && (at === tabs || tabs.contains(at)), atTag: at ? (at.className || at.tagName) : null, itemTop: Math.round(ir.top), barBottom: Math.round(t2.bottom) };
    });
    check(tag + ': the stuck tab bar is flush with the card top edge, nothing scrolled shows above it (old code: 20 px strip)', Math.abs(m.barTop - m.edge) <= 1 && m.topIsBar, JSON.stringify(m));
    check(tag + ': a specimen card scrolled into view (block start) lands fully below the bar', m.itemTop >= m.barBottom - 0.5, JSON.stringify(m));
    // cycle 12 U raised the tabs to the 44 px target (owner item "Museum tabs to 44 px"), so the bar is 44 + 2 x 4 px padding at 195 px;
    // it must still be no taller than that (the cycle-10 bar was 45 px with 29 px tabs)
    if (w < 300) check(tag + ': the bar is 52 px tall or less with 44 px tabs (cycle 11: <= 40 px with 29 px tabs; cycle 12 raised the tabs)', m.barH <= 52, JSON.stringify(m));
    await page.evaluate(() => { const c = document.querySelector('#museum-overlay .museum-card'); const it = document.querySelectorAll('#museum-wildfauna-list > li')[1]; if (it) c.scrollTop = it.offsetTop - 60; });
    await page.waitForTimeout(150);
    await SHOT(page, `museum-${w}x${h}`);
    check(tag + ': no page errors, no database traffic (literal 0)', errors.length === 0 && db.attempts() === 0, errors.join(' | ') + ' db=' + db.attempts());
    await ctx.close();
  }

  await browser.close();
  done();
})();
