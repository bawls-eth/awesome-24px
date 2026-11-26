// Cycle 13 U (UI/UX). Every check marked (was ...) failed on the cycle-12 tip (1e6b3b6) and passes with this branch:
//  1. Town Museum at 1280x720, natural scroll (Wild Fauna, no forced card height): the stuck tab bar sits flush with the card's top
//     edge (was 20 px under it, and scrolled specimen cards showed in that strip between the bar and the ✕); the ✕ stays on screen,
//     inside the card and on top, and a real click on it closes the Museum. The wrapped desktop bar shows no scroll cue.
//  2. Museum one-row tab bar at 195x422 and 390x844: when tabs are hidden to the right, the bar has a cue (fade + arrow, ::after) whose
//     drawn box ends left of the ✕ (was: no cue); scrolled to the end, the right cue goes and a left cue shows; a real tap through the
//     cue area still lands on the tab under it.
//  3. Isles 160x284 with the how-to up (the action row shows one button of three): the row has a right-edge cue (was none); after a
//     real tap on the how-to close all buttons fit and the cue is gone. 195x422 (column layout) and 390x844 never show it.
//  4. Isles hint under 300 px portrait: it lay under the HUD (z 2 < 3; at 160x284 fully covered). Now, while new, it is drawn above
//     the HUD, on screen, clear of every button and of Pack; after 6 s it tucks away (opacity 0) so the HUD is whole; it comes back
//     when it becomes visible again (after the Pack closes). At 390x844 it is unchanged (always shown, no tucking).
// OFFLINE: offlineStub (Town, ADMIN bot) / blockDb (Isles); literal 0 database attempts. Never chats, never writes to Firebase.
// Run: BASE=http://localhost:8440/game/index.html NODE_PATH=$(npm root -g) node game/tests/cyc13-ui.test.js   (SHOTS=<dir> saves screenshots)
const { chromium } = require('playwright');
const { check, done, blockDb, offlineStub, exposeGame, joinOffline } = require('./helpers');
const LS = require('./lib/load-scale');
const ORIGIN = (process.env.BASE || 'http://localhost:8440/game/index.html').replace(/\/game\/index\.html.*$/, '');
const SHOT = (page, name) => (process.env.SHOTS ? page.screenshot({ path: process.env.SHOTS + '/cyc13-ui-' + name + '.jpg', type: 'jpeg', quality: 75 }).catch(() => null) : null);
const PROFILE = { v: 1, heroes: [{ id: 'h1', name: 'Fern', cls: 'druid', level: 7, xp: 10, items: [] }], stash: [], fame: 0, mode: 'classic', hall: [] };
const SEED = { 'pixeltown-mm-v1': JSON.stringify(PROFILE), 'pixeltown-mm-active-v1': JSON.stringify({ v: 1, heroId: 'h1' }), 'pixeltown-nav-v1': JSON.stringify({ v: 1, last: null, prev: null }) };
const ONLY = new Set((process.env.ONLY || 'museum,isles').split(','));
const J = (o) => JSON.stringify(o, (k, v) => (typeof v === 'number' ? Math.round(v * 10) / 10 : v));
let attempts = 0; const errors = [];

async function openTown(browser, w, h, touch) {
  const ctx = await browser.newContext(touch ? { viewport: { width: w, height: h }, hasTouch: true, isMobile: true } : { viewport: { width: w, height: h } });
  const db = await offlineStub(ctx);
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push(`[town ${w}x${h}] ` + e.message));
  await exposeGame(page); await page.goto(ORIGIN + '/game/index.html'); await joinOffline(page, 'ADMINcyc13ui');
  await page.waitForFunction(() => window.__g && window.__g.scene.getScene('Town') && window.__g.scene.getScene('Town').localBody, null, { timeout: LS.budget(40000) });
  await page.waitForTimeout(800);
  return { ctx, db, page };
}

// the cue pseudo-element's drawn box (sticky inside the bar's scroll box), or null when it is not rendered
const CUE = (sel, side) => {
  const el = document.querySelector(sel); const cs = getComputedStyle(el, side === 'r' ? '::after' : '::before');
  if (!cs || cs.content === 'none' || cs.content === 'normal' || cs.display === 'none') return null;
  const r = el.getBoundingClientRect(), w = parseFloat(cs.width);
  const cl = r.left + el.clientLeft, cr = cl + el.clientWidth; // the scroll box (padding box)
  return side === 'r' ? { l: cr - w, r: cr, w, content: cs.content } : { l: cl, r: cl + w, w, content: cs.content };
};

async function museumDesktop(browser) {
  const tag = 'museum 1280x720';
  const { ctx, db, page } = await openTown(browser, 1280, 720, false);
  await page.evaluate(() => { const s = window.__g.scene.getScene('Town'); s.openMuseum(); s.museumWing = 'wildfauna'; s.showMuseumWing(); });
  await page.waitForTimeout(300);
  await page.evaluate(() => { const c = document.querySelector('#museum-overlay .museum-card'); c.scrollTop = c.scrollHeight; });
  await page.waitForTimeout(250);
  const m = await page.evaluate(() => {
    const card = document.querySelector('#museum-overlay .museum-card'), bar = card.querySelector('.museum-tabs'), x = document.getElementById('museum-close-btn');
    const R = (e) => { const r = e.getBoundingClientRect(); return { l: r.left, t: r.top, r: r.right, b: r.bottom, w: r.width, h: r.height }; };
    const C = R(card), B = R(bar), X = R(x);
    const hit = document.elementFromPoint(X.l + X.w / 2, X.t + X.h / 2);
    // the strip between the card's top edge and the bar: what is drawn there (a specimen card showed through before)
    const strip = document.elementFromPoint(C.l + C.w / 3, C.t + card.clientTop + 6);
    return { C, B, X, scrolled: card.scrollTop, natural: card.style.maxHeight === '', xOnTop: hit === x || x.contains(hit), stripIsSpecimen: !!(strip && strip.closest('.museum-wing')),
      stripWhat: strip ? (strip.className || strip.tagName) + '' : null, cueR: bar.classList.contains('cue-r'), cueL: bar.classList.contains('cue-l'), vh: innerHeight, vw: innerWidth };
  });
  check(tag + ': the card really scrolls at its natural size (no forced height) - the check is real', m.natural && m.scrolled > 300, J({ scrolled: m.scrolled }));
  check(tag + ': scrolled, the stuck tab bar is flush with the card top (was 20 px under it) and no specimen shows above it', m.B.t - m.C.t <= 3 && !m.stripIsSpecimen, J({ gap: m.B.t - m.C.t, strip: m.stripWhat }));
  check(tag + ': scrolled, the ✕ is on screen, 44 px, inside the card, in the bar row and on top', m.X.t >= 0 && m.X.b <= m.vh && m.X.w >= 43.5 && m.X.t >= m.C.t && m.X.r <= m.C.r + 0.5 && m.X.t < m.B.b && m.xOnTop, J({ X: m.X, C: m.C, B: m.B, onTop: m.xOnTop }));
  check(tag + ': the wrapped desktop bar shows no scroll cue', !m.cueR && !m.cueL, J({ cueR: m.cueR, cueL: m.cueL }));
  await SHOT(page, 'museum-1280x720-end');
  await page.mouse.click(m.X.l + m.X.w / 2, m.X.t + m.X.h / 2); await page.waitForTimeout(250);
  const closed = await page.evaluate(() => document.getElementById('museum-overlay').classList.contains('hidden') && window.__g.scene.getScene('Town').museumOpen === false);
  check(tag + ': a real click on the ✕ at the end of the list closes the Museum', closed, String(closed));
  check(tag + ': no database request from the Town page', db.attempts() === 0, String(db.attempts()));
  attempts += db.attempts(); await ctx.close();
}

async function museumPhone(browser) {
  for (const [w, h] of [[195, 422], [390, 844]]) {
    const tag = `museum ${w}x${h}`;
    const { ctx, db, page } = await openTown(browser, w, h, true);
    await page.evaluate(() => window.__g.scene.getScene('Town').openMuseum());
    await page.waitForTimeout(300);
    const a = await page.evaluate((CUEs) => {
      const CUE = eval(CUEs); const bar = document.querySelector('#museum-overlay .museum-tabs'), x = document.getElementById('museum-close-btn').getBoundingClientRect();
      return { more: bar.scrollWidth - bar.clientWidth, sl: bar.scrollLeft, cueR: bar.classList.contains('cue-r'), cueL: bar.classList.contains('cue-l'), r: CUE('#museum-overlay .museum-tabs', 'r'), l: CUE('#museum-overlay .museum-tabs', 'l'), xL: x.left };
    }, '(' + CUE.toString() + ')');
    check(tag + ': the one-row bar hides tabs to the right (the check is real)', a.more > 40 && a.sl < 2, J(a));
    check(tag + ': a right-edge scroll cue (arrow) is drawn, at least 18 px, and ends left of the ✕ (was: no cue)', a.cueR && !!a.r && a.r.w >= 18 && /›/.test(a.r.content) && a.r.r <= a.xL + 0.5 && !a.cueL && !a.l, J(a));
    await SHOT(page, `museum-${w}x${h}-cue`);
    // scroll the bar to its end (a real swipe is flaky on a 40 px strip: scrollLeft fires the same scroll event)
    await page.evaluate(() => { const b = document.querySelector('#museum-overlay .museum-tabs'); b.scrollLeft = b.scrollWidth; });
    await page.waitForTimeout(250);
    const b = await page.evaluate((CUEs) => { const CUE = eval(CUEs); const bar = document.querySelector('#museum-overlay .museum-tabs'); return { cueR: bar.classList.contains('cue-r'), cueL: bar.classList.contains('cue-l'), r: CUE('#museum-overlay .museum-tabs', 'r'), l: CUE('#museum-overlay .museum-tabs', 'l') }; }, '(' + CUE.toString() + ')');
    check(tag + ': scrolled to the end, the right cue is gone and a left cue (arrow) shows', !b.cueR && !b.r && b.cueL && !!b.l && /‹/.test(b.l.content), J(b));
    await SHOT(page, `museum-${w}x${h}-cue-end`);
    // a real tap at the left cue's centre lands on the tab under it (pointer-events none)
    const t = await page.evaluate((CUEs) => { const CUE = eval(CUEs); const bar = document.querySelector('#museum-overlay .museum-tabs'), l = CUE('#museum-overlay .museum-tabs', 'l'), r = bar.getBoundingClientRect(); if (!l) return { x: 0, y: 0, wing: null, noCue: true }; const y = r.top + r.height / 2; const hit = document.elementFromPoint((l.l + l.r) / 2, y); const tab = hit && hit.closest('.museum-tab'); return { x: (l.l + l.r) / 2, y, wing: tab ? tab.dataset.wing : null }; }, '(' + CUE.toString() + ')');
    if (t.wing) { await page.touchscreen.tap(t.x, t.y); await page.waitForTimeout(250); }
    const wing = await page.evaluate(() => window.__g.scene.getScene('Town').museumWing);
    check(tag + ': a real tap on the cue area opens the tab under it (the cue does not catch taps)', !!t.wing && wing === t.wing, J(Object.assign(t, { got: wing })));
    attempts += db.attempts(); await ctx.close();
  }
}

const ISLE_M = () => {
  const R = (id) => { const e = document.getElementById(id); if (!e || e.hidden) return null; const cs = getComputedStyle(e); if (cs.display === 'none' || cs.visibility === 'hidden') return null; const r = e.getBoundingClientRect(); return r.width ? { l: r.left, t: r.top, r: r.right, b: r.bottom, w: r.width, h: r.height } : null; };
  const h = document.getElementById('hint'), a = document.getElementById('acts');
  const hc = getComputedStyle(h), ac = getComputedStyle(a, '::after');
  const btns = [...document.querySelectorAll('#acts > button, #touch-btns button, #btn-pack, #btn-map, #howto button')].filter((b) => !b.hidden && b.offsetParent && getComputedStyle(b).visibility !== 'hidden')
    .map((b) => { const r = b.getBoundingClientRect(); return { id: b.id, l: r.left, t: r.top, r: r.right, b: r.bottom }; }).filter((b) => b.r - b.l > 0);
  return { hint: R('hint'), hintOpacity: parseFloat(hc.opacity), hintZ: parseInt(hc.zIndex, 10) || 0, hudZ: parseInt(getComputedStyle(document.getElementById('hud')).zIndex, 10) || 0, hud: R('hud'), btns,
    cueR: a.classList.contains('cue-r'), cueAfter: ac.content !== 'none' && ac.content !== 'normal', more: a.scrollWidth - a.clientWidth, dir: getComputedStyle(a).flexDirection, howto: R('howto'), vw: innerWidth, vh: innerHeight,
    tucked: document.body.classList.contains('hint-tucked') };
};
const over = (a, b) => Math.min(a.r, b.r) - Math.max(a.l, b.l) > 1.5 && Math.min(a.b, b.b) - Math.max(a.t, b.t) > 1.5;

async function isles(browser) {
  for (const [w, h] of [[160, 284], [195, 422], [390, 844]]) {
    const tag = `isles ${w}x${h}`;
    const ctx = await browser.newContext({ viewport: { width: w, height: h }, hasTouch: true, isMobile: true });
    const db = await blockDb(ctx);
    await ctx.addInitScript((s) => { if (!sessionStorage.cyc13Seeded) { sessionStorage.cyc13Seeded = '1'; Object.keys(s).forEach((k) => localStorage.setItem(k, s[k])); } }, SEED);
    const page = await ctx.newPage();
    page.on('pageerror', (e) => errors.push(`[${tag}] ` + e.message));
    await page.goto(ORIGIN + '/game/games/isles/index.html?isle=reef', { waitUntil: 'load' });
    await page.waitForFunction(() => document.body.classList.contains('touch') && [...document.querySelectorAll('#acts > button')].some((b) => !b.hidden) && !document.getElementById('howto').hidden, null, { timeout: LS.budget(20000) });
    await page.waitForTimeout(1200);
    const a = await page.evaluate(ISLE_M);
    if (w < 190) {
      check(tag + ': with the how-to up the action row hides buttons to the right (the check is real)', a.dir === 'row' && a.more > 40 && !!a.howto, J({ more: a.more, dir: a.dir }));
      check(tag + ': ...and shows a right-edge scroll cue (was none)', a.cueR && a.cueAfter, J({ cueR: a.cueR, after: a.cueAfter }));
      await SHOT(page, `isles-${w}x${h}-howto`);
    } else {
      check(tag + ': the action buttons are not a scrolling row here, so no cue', !a.cueR && !a.cueAfter, J({ cueR: a.cueR, dir: a.dir, more: a.more }));
    }
    // a real tap on the how-to close
    const c = await page.evaluate(() => { const b = document.getElementById('howto-close').getBoundingClientRect(); return { x: b.left + b.width / 2, y: b.top + b.height / 2 }; });
    await page.touchscreen.tap(c.x, c.y); await page.waitForTimeout(900);
    const b = await page.evaluate(ISLE_M);
    if (w < 190) check(tag + ': after a real tap on the how-to close every button fits and the cue is gone', !b.howto && !b.cueR && !b.cueAfter, J({ more: b.more, cueR: b.cueR }));
    check(tag + ': the hint shows (the check is real)', !!b.hint && b.hintOpacity === 1, J({ hint: b.hint, op: b.hintOpacity }));
    if (w < 300) {
      check(tag + ': the new hint is drawn above the HUD (was under it: z 2 < 3)', b.hintZ > b.hudZ && over(b.hint, b.hud), J({ hintZ: b.hintZ, hudZ: b.hudZ }));
      check(tag + ': the hint is fully on screen and covers no button (actions, Attack, Pack, Map)', b.hint.l >= 0 && b.hint.t >= 0 && b.hint.r <= b.vw + 0.5 && b.hint.b <= b.vh + 0.5 && b.btns.every((x) => !over(b.hint, x)), J({ hint: b.hint, hit: b.btns.filter((x) => over(b.hint, x)).map((x) => x.id) }));
      await SHOT(page, `isles-${w}x${h}-hint`);
      await page.waitForTimeout(LS.budget(6800));
      const t = await page.evaluate(ISLE_M);
      check(tag + ': after 6 s the hint tucks away (opacity 0), so the HUD is whole again', t.tucked && t.hintOpacity === 0, J({ tucked: t.tucked, op: t.hintOpacity }));
      await SHOT(page, `isles-${w}x${h}-tucked`);
      // open and close the Pack (a real tap): the hint was hidden behind it, becomes visible again, so it shows for another 6 s
      const p = await page.evaluate(() => { const r = document.getElementById('btn-pack').getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; });
      await page.touchscreen.tap(p.x, p.y); await page.waitForTimeout(900);
      const opened = await page.evaluate(() => document.body.classList.contains('panel-open'));
      await page.keyboard.press('Escape'); await page.waitForTimeout(900);
      const s = await page.evaluate(ISLE_M);
      check(tag + ': after the Pack opens and closes, the hint is back (shown again, not tucked)', opened && !s.tucked && s.hintOpacity === 1, J({ opened, tucked: s.tucked, op: s.hintOpacity }));
    } else {
      await page.waitForTimeout(LS.budget(6800));
      const t = await page.evaluate(ISLE_M);
      check(tag + ': wide phones are unchanged: the hint never tucks, stays under the HUD z and off the HUD', !t.tucked && t.hintOpacity === 1 && t.hintZ <= t.hudZ && !over(t.hint, t.hud), J({ tucked: t.tucked, op: t.hintOpacity, z: t.hintZ }));
    }
    attempts += db.attempts(); await ctx.close();
  }
}

(async () => {
  const browser = await chromium.launch();
  if (ONLY.has('museum')) { await museumDesktop(browser); await museumPhone(browser); }
  if (ONLY.has('isles')) await isles(browser);
  check('zero page errors', errors.length === 0, errors.join(' | '));
  check('no database traffic (literal 0)', attempts === 0, String(attempts));
  await browser.close();
  done();
})().catch((e) => { console.error(e); process.exit(1); });
