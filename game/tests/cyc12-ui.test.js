// Cycle 12 U (UI/UX). Every check below failed on the cycle-11 tip (0207dda) and passes with this branch:
//  1. Isles at 160x284 (a 320 px phone at 200% zoom): the action column (Decor / Sail / Soothe) ran from y 42 to 178 over the HUD and the
//     Pack button, and the compact how-to column sat on the stick. Now no two controls cover each other (the a11y sweep's own OVERLAP
//     rule, which also runs at 160x284 now), the action buttons are one 44 px row under the HUD and above the stick / Attack, every
//     action button is reachable (inside the row's scroll box, or on screen once the how-to is closed with a real tap), and 195x422 keeps
//     its old column layout.
//  2. Town Museum at 195x422 and 390x844: every wing tab is >= 44 px tall (was 29); after scrolling the card the close button is still on
//     screen and on top (it was at y -366 / -340), no tab slides under it, a real tap on it closes the Museum; the corner Menu
//     (#mm-nav-btn) is hidden while the Museum is open (it drew over the card's top-left corner and the Fossils tab) and back after
//     closing; the active wing's tab is scrolled into view in the one-row tab bar.
//  3. Phone Town with the What's-new banner (390x844, old lastSeenVersion): the region the compositor painted as a ~190x265 black block
//     (the banner's scroller layer mirrored top-to-bottom over the WebGL canvas, y 558-825) is not black any more.
// OFFLINE: offlineStub (Town) / blockDb (Isles); literal 0 database attempts. The Town join is an ADMIN bot, offline.
// Run: BASE=http://localhost:8440/game/index.html node game/tests/cyc12-ui.test.js   (SHOTS=<dir> also saves screenshots)
const { chromium } = require('playwright');
const { check, done, blockDb, offlineStub, exposeGame, joinOffline } = require('./helpers');
const LS = require('./lib/load-scale');
const ORIGIN = (process.env.BASE || 'http://localhost:8440/game/index.html').replace(/\/game\/index\.html.*$/, '');
const SHOT = (page, name) => (process.env.SHOTS ? page.screenshot({ path: process.env.SHOTS + '/cyc12-ui-' + name + '.jpg', type: 'jpeg', quality: 70 }).catch(() => null) : null);
const PROFILE = { v: 1, heroes: [{ id: 'h1', name: 'Fern', cls: 'druid', level: 7, xp: 10, items: [] }], stash: [], fame: 0, mode: 'classic', hall: [] };
const SEED = { 'pixeltown-mm-v1': JSON.stringify(PROFILE), 'pixeltown-mm-active-v1': JSON.stringify({ v: 1, heroId: 'h1' }), 'pixeltown-nav-v1': JSON.stringify({ v: 1, last: null, prev: null }) };
const ONLY = new Set((process.env.ONLY || 'isles,museum,banner').split(','));

// the a11y sweep's OVERLAP rule (visible tap targets, clipped by overflow ancestors and the viewport)
const OVERLAP = () => {
  const vw = innerWidth, vh = innerHeight;
  const sel = (e) => (e.id ? '#' + e.id : e.tagName.toLowerCase());
  const hidden = (e) => { for (let n = e; n && n.nodeType === 1; n = n.parentElement) { const cs = getComputedStyle(n); if (cs.display === 'none' || cs.visibility === 'hidden' || n.hidden || n.getAttribute('aria-hidden') === 'true' || parseFloat(cs.opacity) === 0) return true; } return false; };
  const clipRect = (e) => {
    const r = e.getBoundingClientRect();
    let x = Math.max(0, r.left), y = Math.max(0, r.top), R = Math.min(vw, r.right), B = Math.min(vh, r.bottom);
    for (let n = e.parentElement; n && n !== document.body; n = n.parentElement) {
      const cs = getComputedStyle(n);
      if (/hidden|clip|auto|scroll/.test(cs.overflowX + cs.overflowY)) { const p = n.getBoundingClientRect(); x = Math.max(x, p.left); y = Math.max(y, p.top); R = Math.min(R, p.right); B = Math.min(B, p.bottom); }
      if (cs.position === 'fixed') break;
    }
    return R - x > 2 && B - y > 2 ? { x, y, R, B } : null;
  };
  const Q = 'a[href],button,input:not([type=hidden]),select,textarea,summary,[role=button],[role=link],[role=tab],[role=application],[tabindex]:not([tabindex="-1"])';
  const els = [...document.querySelectorAll(Q)].filter((e) => !e.disabled && !hidden(e))
    .filter((e) => { if (e.tagName !== 'CANVAS' && e.getAttribute('role') !== 'application') return true; const r = e.getBoundingClientRect(); return r.width * r.height < 0.5 * vw * vh; })
    .map((e) => ({ e, r: clipRect(e) })).filter((o) => o.r);
  const out = [];
  for (let i = 0; i < els.length; i++) for (let j = i + 1; j < els.length; j++) {
    const a = els[i], b = els[j];
    if (a.e.contains(b.e) || b.e.contains(a.e)) continue;
    const ox = Math.min(a.r.R, b.r.R) - Math.max(a.r.x, b.r.x), oy = Math.min(a.r.B, b.r.B) - Math.max(a.r.y, b.r.y);
    if (ox > 2 && oy > 2) out.push(`${sel(a.e)}+${sel(b.e)} ${Math.round(ox)}x${Math.round(oy)}`);
  }
  return out;
};
const RECTS = () => {
  const R = (id) => { const e = document.getElementById(id); if (!e || e.hidden) return null; const cs = getComputedStyle(e); if (cs.display === 'none' || cs.visibility === 'hidden') return null; const r = e.getBoundingClientRect(); return r.width ? { l: r.left, t: r.top, r: r.right, b: r.bottom, w: r.width, h: r.height } : null; };
  const o = {}; ['hud', 'btn-pack', 'acts', 'btn-fire', 'stick', 'howto', 'btn-map', 'mini-wrap'].forEach((id) => { o[id] = R(id); });
  o.actBtns = [...document.querySelectorAll('#acts > button')].filter((b) => !b.hidden && getComputedStyle(b).display !== 'none').map((b) => ({ id: b.id, ...(() => { const r = b.getBoundingClientRect(); return { l: r.left, t: r.top, r: r.right, b: r.bottom, h: r.height, w: r.width }; })() }));
  const a = document.getElementById('acts'); o.actsScroll = a ? { sw: a.scrollWidth, cw: a.clientWidth, ox: getComputedStyle(a).overflowX } : null;
  o.vw = innerWidth; o.vh = innerHeight; return o;
};

async function isles(browser) {
  for (const [w, h] of [[160, 284], [195, 422]]) {
    const tag = `isles ${w}x${h}`;
    const ctx = await browser.newContext({ viewport: { width: w, height: h }, hasTouch: true, isMobile: true });
    const db = await blockDb(ctx);
    await ctx.addInitScript((s) => { if (!sessionStorage.cyc12Seeded) { sessionStorage.cyc12Seeded = '1'; Object.keys(s).forEach((k) => localStorage.setItem(k, s[k])); } }, SEED);
    const page = await ctx.newPage(); const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto(ORIGIN + '/game/games/isles/index.html?isle=reef', { waitUntil: 'load' });
    await page.waitForFunction(() => document.body.classList.contains('touch') && [...document.querySelectorAll('#acts > button')].some((b) => !b.hidden), null, { timeout: LS.budget(20000) });
    await page.waitForTimeout(800);
    const m = await page.evaluate(RECTS);
    const ov = await page.evaluate(OVERLAP);
    check(tag + ': no two controls cover each other (sweep OVERLAP rule; old code at 160: Pack under Sail / Decor, Decor under Map, Soothe under Tips)', ov.length === 0, ov.join('; '));
    const hud = m.hud, acts = m.actBtns;
    check(tag + ': the action buttons show (' + acts.map((a) => a.id).join(',') + ')', acts.length >= 2, JSON.stringify(acts));
    check(tag + ': no action button overlaps the HUD box (old code at 160: the column started at y 42, HUD y 76-159)', acts.every((a) => a.t >= hud.b - 0.5 || a.b <= hud.t + 0.5), JSON.stringify({ hud, acts }));
    check(tag + ': every action button is >= 44 px tall and the row stays above the stick and Attack', acts.every((a) => a.h >= 44 && a.b <= Math.min(m.stick.t, m['btn-fire'].t) + 0.5), JSON.stringify(m));
    check(tag + ': the stick and Attack are >= 44 px and do not cover each other', m.stick.w >= 44 && m['btn-fire'].w >= 44 && (m.stick.r <= m['btn-fire'].l || m.stick.b <= m['btn-fire'].t), JSON.stringify([m.stick, m['btn-fire']]));
    if (w < 190) {
      check(tag + ': the action buttons are one row (same top) and the row scrolls sideways when it cannot show them all', new Set(acts.map((a) => Math.round(a.t))).size === 1 && (m.actsScroll.sw <= m.actsScroll.cw + 1 || /auto|scroll/.test(m.actsScroll.ox)), JSON.stringify(m.actsScroll));
      await SHOT(page, `isles-${w}x${h}-howto`);
      // a real tap on the how-to close: all the action buttons are then on screen
      const r = await page.evaluate(() => { const b = document.getElementById('howto-close').getBoundingClientRect(); return { x: b.left + b.width / 2, y: b.top + b.height / 2 }; });
      await page.touchscreen.tap(r.x, r.y); await page.waitForTimeout(300);
      const m2 = await page.evaluate(RECTS);
      const ov2 = await page.evaluate(OVERLAP);
      check(tag + ': after a real tap on the how-to close, every action button is fully on screen and nothing covers anything', !m2.howto && m2.actBtns.every((a) => a.l >= 0 && a.r <= m2.vw + 0.5) && ov2.length === 0, JSON.stringify({ acts: m2.actBtns, ov2 }));
      await SHOT(page, `isles-${w}x${h}`);
    } else {
      check(tag + ': 195 px keeps the cycle-3 layout (one column above Attack, right edge)', new Set(acts.map((a) => Math.round(a.r))).size === 1 && new Set(acts.map((a) => Math.round(a.t))).size === acts.length, JSON.stringify(acts));
    }
    check(tag + ': no page errors, no database traffic (literal 0)', errors.length === 0 && db.attempts() === 0, errors.join(' | ') + ' db=' + db.attempts());
    await ctx.close();
  }
}

async function openTown(browser, w, h, seed) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, hasTouch: true, isMobile: true });
  const db = await offlineStub(ctx);
  if (seed) await ctx.addInitScript((o) => { if (!localStorage.getItem('pixeltown-save-v1')) localStorage.setItem('pixeltown-save-v1', JSON.stringify(o)); }, seed);
  const page = await ctx.newPage(); const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await exposeGame(page); await page.goto(ORIGIN + '/game/index.html'); await joinOffline(page, 'ADMINcyc12ui');
  await page.waitForFunction(() => window.__g && window.__g.scene.getScene('Town') && window.__g.scene.getScene('Town').localBody, null, { timeout: LS.budget(40000) });
  await page.waitForTimeout(800);
  return { ctx, db, page, errors };
}

async function museum(browser) {
  for (const [w, h] of [[195, 422], [390, 844]]) {
    const tag = `museum ${w}x${h}`;
    const { ctx, db, page, errors } = await openTown(browser, w, h);
    const navBefore = await page.evaluate(() => { const n = document.getElementById('mm-nav-btn'); return !!n && getComputedStyle(n).visibility !== 'hidden' && n.getBoundingClientRect().width > 0; });
    await page.evaluate(() => { const s = window.__g.scene.getScene('Town'); ['honeybee', 'fox', 'frog'].forEach((id) => s.ffDiscovered.add(id)); s.openMuseum(); s.museumWing = 'wildfauna'; s.showMuseumWing(); });
    await page.waitForTimeout(400);
    const m = await page.evaluate(() => {
      const card = document.querySelector('#museum-overlay .museum-card'); const bar = card.querySelector('.museum-tabs');
      const R = (e) => { const r = e.getBoundingClientRect(); return { l: r.left, t: r.top, r: r.right, b: r.bottom, w: r.width, h: r.height }; };
      const tabs = [...bar.querySelectorAll('.museum-tab')].map(R);
      const active = R(bar.querySelector('.museum-tab.active')); const barR = R(bar);
      const nav = document.getElementById('mm-nav-btn'); const nr = nav.getBoundingClientRect(); const cr = R(card);
      const navHit = document.elementFromPoint(Math.min(nr.right, cr.r) - 4 > cr.l ? Math.max(nr.left, cr.l) + 4 : nr.left + 4, Math.max(nr.top, cr.t) + 4);
      const navShows = getComputedStyle(nav).visibility !== 'hidden' && (nav === navHit || nav.contains(navHit));
      card.scrollTop = 400;
      const close = document.getElementById('museum-close-btn'); const c = R(close);
      const hit = document.elementFromPoint(c.l + c.w / 2, c.t + c.h / 2);
      const bar2 = R(bar);
      return { tabs, active, barR, bar2, close: c, closeOnTop: hit === close || close.contains(hit), scrolled: card.scrollTop, navShows, vh: innerHeight };
    });
    check(tag + ': every wing tab is >= 44 px tall (was 29)', m.tabs.every((t) => t.h >= 44), JSON.stringify(m.tabs.map((t) => t.h)));
    check(tag + ': after scrolling the card, the close button is on screen and on top (old code: y -366 / -340)', m.scrolled > 100 && m.close.t >= 0 && m.close.b <= m.vh && m.close.w >= 44 && m.close.h >= 44 && m.closeOnTop, JSON.stringify(m));
    check(tag + ': the stuck tab bar ends left of the close button, so no tab slides under it', m.bar2.r <= m.close.l + 0.5 && m.close.t >= m.bar2.t - 0.5 && m.close.b <= m.bar2.b + 0.5, JSON.stringify({ bar: m.bar2, close: m.close }));
    check(tag + ': the active wing tab (Wild Fauna) is scrolled into view in the tab bar (its start, when it is wider than the bar)', m.active.l >= m.barR.l - 0.5 && (m.active.r <= m.barR.r + 0.5 || m.active.w > m.barR.w - 24), JSON.stringify({ active: m.active, bar: m.barR }));
    check(tag + ': the corner Menu shows before, and does not draw over the open Museum', navBefore && !m.navShows, JSON.stringify({ navBefore, navShows: m.navShows }));
    await SHOT(page, `museum-${w}x${h}`);
    await page.touchscreen.tap(m.close.l + m.close.w / 2, m.close.t + m.close.h / 2); await page.waitForTimeout(300);
    const after = await page.evaluate(() => ({ hidden: document.getElementById('museum-overlay').classList.contains('hidden'), nav: getComputedStyle(document.getElementById('mm-nav-btn')).visibility }));
    check(tag + ': a real tap on the scrolled close button closes the Museum, and the corner Menu is back', after.hidden && after.nav !== 'hidden', JSON.stringify(after));
    check(tag + ': no page errors, no database traffic (literal 0)', errors.length === 0 && db.attempts() === 0, errors.join(' | ') + ' db=' + db.attempts());
    await ctx.close();
  }
}

async function banner(browser) {
  const tag = 'banner 390x844';
  const OLD = { name: 'ADMINcyc12ui', species: 'cat', frame: 0, resources: { wood: 4 }, achievementsUnlocked: [], lastSeenVersion: 'old' };
  const { ctx, db, page, errors } = await openTown(browser, 390, 844, OLD);
  await page.waitForTimeout(700);
  const b = await page.evaluate(() => { const e = document.getElementById('whats-new-banner'); const r = e.getBoundingClientRect(); return { shown: !e.classList.contains('hidden') && r.height > 0, l: r.left, t: r.top, w: r.width, h: r.height, scroller: e.scrollHeight > e.clientHeight }; });
  check(tag + ': the What\'s-new banner shows and scrolls inside (the case that drew the block)', b.shown && b.scroller, JSON.stringify(b));
  // the mirrored region: y = 844 - top - height .. 844 - top (the block was x 101-290, y 560-825)
  const clip = { x: Math.round(b.l + 6), y: Math.round(844 - b.t - b.h + 6), width: Math.round(b.w - 12), height: Math.round(b.h - 12) };
  // a full-viewport capture, cropped in the page (a clipped capture re-rasterises only the clip and did not show the block)
  const png = (await page.screenshot({ type: 'png' })).toString('base64');
  const dark = await page.evaluate(async ([src, cl]) => {
    const img = new Image(); img.src = 'data:image/png;base64,' + src; await img.decode();
    const c = document.createElement('canvas'); c.width = cl.width; c.height = cl.height; const g = c.getContext('2d'); g.drawImage(img, cl.x, cl.y, cl.width, cl.height, 0, 0, cl.width, cl.height);
    const d = g.getImageData(0, 0, c.width, c.height).data; let n = 0, k = 0;
    for (let i = 0; i < d.length; i += 4 * 7) { k++; if (d[i] + d[i + 1] + d[i + 2] < 30) n++; }
    return n / k;
  }, [png, clip]);
  check(tag + ': the mirrored region under the banner is not a black block (old code: ~89 % near-black pixels)', dark < 0.25, 'near-black share ' + dark.toFixed(3) + ' in ' + JSON.stringify(clip));
  await SHOT(page, 'town-banner-390x844');
  check(tag + ': no page errors, no database traffic (literal 0)', errors.length === 0 && db.attempts() === 0, errors.join(' | ') + ' db=' + db.attempts());
  await ctx.close();
}

(async () => {
  const browser = await chromium.launch();
  if (ONLY.has('isles')) await isles(browser);
  if (ONLY.has('museum')) await museum(browser);
  if (ONLY.has('banner')) await banner(browser);
  await browser.close();
  done();
})();
