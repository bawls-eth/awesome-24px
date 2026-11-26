// cycle 12 L (2): the Town Museum dialog, from the cycle 11 U notes (measured first, old code, same script):
//   195x422: ✕ at y -810 after scrolling the card to its end, tabs 29 px tall, the compass (#mm-nav-btn, z 9000) on the card corner;
//   160x284: ✕ at y -839, tabs 29 px, compass on the card; 1280x720: ✕ 28 px.
// Now: the ✕ is sticky (it stays top right while the card scrolls, and a real tap on it closes the Museum from the end of the list),
// tabs and ✕ are 44 px, the stuck tab bar ends before the ✕ (no tab is drawn or tappable under it), and the compass is hidden on a
// narrow / short screen while the dialog is open and back when it closes. The Museum is also a view of a11y-viewport-sweep.test.js.
// Also here: the "Overall collection" label and count are readable on the cream card (they were 2.34:1 and 1.25:1).
// Screenshots (SHOTS=1): game/design/beta/img/cyc12-lead-museum-<vp>[-end].jpg
// OFFLINE: helpers.offlineStub, db.attempts() === 0. Never chats, never writes to Firebase.
// Run: BASE=http://localhost:9121/game/index.html NODE_PATH=$(npm root -g) node game/tests/cyc12-lead-museum-panel.test.js
const { chromium } = require('playwright');
const path = require('path');
const { check, done, offlineStub, exposeGame, joinOffline } = require('./helpers');
const BASE = process.env.BASE || 'http://localhost:8440/game/index.html';
const IMG = path.join(__dirname, '..', 'design', 'beta', 'img');
const VPS = [{ w: 195, h: 422, touch: true }, { w: 160, h: 284, touch: true }, { w: 390, h: 844, touch: true }, { w: 667, h: 375, touch: true }, { w: 1280, h: 720, touch: false }];

(async () => {
  const browser = await chromium.launch();
  let attempts = 0; const errors = [];
  for (const vp of VPS) {
    const L = `[${vp.w}x${vp.h}]`;
    const ctx = await browser.newContext(vp.touch ? { viewport: { width: vp.w, height: vp.h }, hasTouch: true, isMobile: true } : { viewport: { width: vp.w, height: vp.h } });
    const db = await offlineStub(ctx);
    const page = await ctx.newPage();
    page.on('pageerror', (e) => errors.push(L + ' ' + e.message));
    await exposeGame(page);
    await page.goto(BASE);
    await joinOffline(page, 'ADMINcyc12mus');
    await page.waitForTimeout(800);
    const navBefore = await page.evaluate(() => { const n = document.getElementById('mm-nav-btn'); return !!n && n.getBoundingClientRect().width > 0; });
    await page.evaluate(() => window.__g.scene.getScene('Town').openMuseum());
    await page.waitForTimeout(400);
    if (process.env.SHOTS) await page.screenshot({ path: path.join(IMG, `cyc12-lead-museum-${vp.w}x${vp.h}.jpg`), type: 'jpeg', quality: 80 });

    const M = () => {
      const ov = document.getElementById('museum-overlay'), card = ov.querySelector('.museum-card'), x = document.getElementById('museum-close-btn'), bar = ov.querySelector('.museum-tabs');
      const q = (e) => { const r = e.getBoundingClientRect(); return { l: r.left, t: r.top, r: r.right, b: r.bottom, w: r.width, h: r.height }; };
      const X = q(x), C = q(card), B = q(bar);
      const top = document.elementFromPoint(X.l + X.w / 2, X.t + X.h / 2);
      const nav = document.getElementById('mm-nav-btn'); const N = nav ? q(nav) : null;
      const navShown = !!N && N.w > 0 && getComputedStyle(nav).visibility !== 'hidden';
      // the part of each tab that is really drawn: clipped by the bar's scroll box (its padding box)
      const clipR = B.l + bar.clientLeft + bar.clientWidth;
      const tabs = [...ov.querySelectorAll('.museum-tab')].map((t) => { const r = q(t); return { h: r.h, w: r.w, l: r.l, r: Math.min(r.r, clipR), t: r.t, b: r.b }; });
      const tabUnderX = tabs.filter((t) => t.r - t.l > 1 && Math.min(t.r, X.r) - Math.max(t.l, X.l) > 1 && Math.min(t.b, X.b) - Math.max(t.t, X.t) > 1).length;
      const lum = (c) => { const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }; return 0.2126 * f(c[0]) + 0.7152 * f(c[1]) + 0.0722 * f(c[2]); };
      const rgb = (s) => /rgba?\(([^)]+)\)/.exec(s)[1].split(/[ ,]+/).slice(0, 3).map(parseFloat);
      const ratio = (e) => { const a = lum(rgb(getComputedStyle(e).color)), b = lum(rgb(getComputedStyle(card).backgroundColor)); return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05); };
      return { X, C, B, xOnTop: top === x, xInCard: X.l >= C.l && X.r <= C.r + 0.5 && X.t >= C.t && X.b <= C.b, xOnScreen: X.l >= 0 && X.t >= 0 && X.r <= innerWidth && X.b <= innerHeight,
        tabMinH: Math.min(...tabs.map((t) => t.h)), tabUnderX, navShown, navOverCard: navShown && Math.min(N.r, C.r) - Math.max(N.l, C.l) > 2 && Math.min(N.b, C.b) - Math.max(N.t, C.t) > 2,
        scrollable: card.scrollHeight - card.clientHeight, scrollTop: card.scrollTop, labelRatio: ratio(ov.querySelector('.museum-progress-label span')), countRatio: ratio(document.getElementById('museum-total-count')),
        countPx: parseFloat(getComputedStyle(ov.querySelector('.museum-tab-count')).fontSize) };
    };
    const a = await page.evaluate(M);
    const R = (o) => JSON.stringify(o, (k, v) => (typeof v === 'number' ? Math.round(v * 10) / 10 : v));
    check(`${L} open: the ✕ is at least 44 px, on screen, inside the card and on top at its centre`, a.X.w >= 43.5 && a.X.h >= 43.5 && a.xOnScreen && a.xInCard && a.xOnTop, R(a.X));
    check(`${L} open: every tab is at least 44 px tall (was 29)`, a.tabMinH >= 43.5, String(a.tabMinH));
    check(`${L} open: the compass does not lie on the Museum card`, a.navOverCard === false && navBefore === true, R({ navBefore, navShown: a.navShown, navOverCard: a.navOverCard }));
    check(`${L} "Overall collection" and its count are readable on the card (>= 4.5:1; were 2.34 and 1.25)`, a.labelRatio >= 4.5 && a.countRatio >= 4.5 && a.countPx >= 11.95, R({ label: a.labelRatio, count: a.countRatio, countPx: a.countPx }));

    // scroll the card to its end (the Fossils wing is taller than the card on phones; on the desktop make the card short to force it)
    if (a.scrollable < 40) await page.evaluate(() => { document.querySelector('#museum-overlay .museum-card').style.maxHeight = '260px'; });
    await page.evaluate(() => { const c = document.querySelector('#museum-overlay .museum-card'); c.scrollTop = c.scrollHeight; });
    await page.waitForTimeout(200);
    const b = await page.evaluate(M);
    if (process.env.SHOTS) await page.screenshot({ path: path.join(IMG, `cyc12-lead-museum-${vp.w}x${vp.h}-end.jpg`), type: 'jpeg', quality: 80 });
    check(`${L} scrolled to the end (the check is real: the card moved by more than its ✕)`, b.scrollTop > 60, String(b.scrollTop));
    check(`${L} scrolled: the ✕ is still on screen, inside the card and on top (it used to scroll away with the list)`, b.xOnScreen && b.xInCard && b.xOnTop && Math.abs((b.X.t - b.C.t) - (a.X.t - a.C.t)) < 1.5, R({ fromCardTopBefore: a.X.t - a.C.t, after: b.X.t - b.C.t, onTop: b.xOnTop })); // from the card's top: the desktop card is made shorter above and re-centres
    check(`${L} scrolled: the tab bar is stuck at the top and no tab is drawn under the ✕`, b.B.t <= b.X.b && b.B.b >= b.X.t - 12 && b.tabUnderX === 0, R({ bar: b.B, x: b.X, tabUnderX: b.tabUnderX }));
    // the last tab can still be reached: scroll the bar sideways to its end, the tab is drawn clear of the ✕, and a tap on it switches wing
    const last = await page.evaluate(() => {
      const ov = document.getElementById('museum-overlay'), bar = ov.querySelector('.museum-tabs'), tabs = [...ov.querySelectorAll('.museum-tab')], t = tabs[tabs.length - 1];
      bar.scrollLeft = bar.scrollWidth;
      const r = t.getBoundingClientRect(), B = bar.getBoundingClientRect(), clipR = B.left + bar.clientLeft + bar.clientWidth, clipL = B.left + bar.clientLeft;
      const x = document.getElementById('museum-close-btn').getBoundingClientRect();
      const l = Math.max(r.left, clipL), rr = Math.min(r.right, clipR);
      return { seen: rr - l, w: r.width, cx: (l + rr) / 2, cy: r.top + r.height / 2, clearOfX: rr <= x.left + 0.5 || r.bottom <= x.top || r.top >= x.bottom, wing: t.dataset.wing };
    });
    if (vp.touch) await page.touchscreen.tap(last.cx, last.cy); else await page.mouse.click(last.cx, last.cy);
    await page.waitForTimeout(200);
    const wing = await page.evaluate(() => window.__g.scene.getScene('Town').museumWing);
    check(`${L} the last tab is drawn clear of the ✕ (at least 40 px of it) and a real tap on it opens its wing`, last.seen >= 40 && last.clearOfX && wing === last.wing, R(Object.assign(last, { got: wing })));

    // a real tap on the ✕ from the end of the list closes the Museum, and the compass is back
    await page.evaluate(() => { const c = document.querySelector('#museum-overlay .museum-card'); c.scrollTop = c.scrollHeight; });
    await page.waitForTimeout(150);
    const xr = await page.evaluate(() => { const r = document.getElementById('museum-close-btn').getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; });
    if (vp.touch) await page.touchscreen.tap(xr.x, xr.y); else await page.mouse.click(xr.x, xr.y);
    await page.waitForTimeout(250);
    const c = await page.evaluate(() => { const n = document.getElementById('mm-nav-btn'); return { open: window.__g.scene.getScene('Town').museumOpen, hidden: document.getElementById('museum-overlay').classList.contains('hidden'), nav: !!n && n.getBoundingClientRect().width > 0 }; });
    check(`${L} a real ${vp.touch ? 'tap' : 'click'} on the ✕ at the end of the list closes the Museum; the compass is shown again`, c.open === false && c.hidden === true && c.nav === true, R(c));
    attempts += db.attempts();
    await ctx.close();
  }
  check('zero page errors', errors.length === 0, errors.join(' | '));
  check('no database traffic (literal 0)', attempts === 0, String(attempts));
  await browser.close();
  done();
})().catch((e) => { console.error(e); process.exit(1); });
