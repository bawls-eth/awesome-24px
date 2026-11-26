// cyc14-ui: three cycle 13 open UI items.
//  A. ID-59 hello heart vs the DOM HUD (Town, 195x422 / 390x844 / 1280x720): an animal right under the bag bar used to get its heart
//     drawn UNDER the bag bar (the canvas is below the DOM HUD). Now the heart takes the first side of the animal nothing covers: the
//     heart must be fully on screen and the game canvas must be the top element at its centre and corners. An animal in the open still
//     gets its heart above it.
//  B. Compass vs the modal Town dialogs (1280x720 / 390x844 / 195x422): hidden (display none) while ANY aria-modal *-overlay dialog is
//     open, not just the Museum; shown again when it closes. Each of those dialogs has its own close button (so hiding is safe).
//  C. Realm world 160x284 (folded "More" layout): the zone name had a 17 px slot ("S…"). Now it has its own row, >= 48 px wide, "Shore"
//     is not cut, and the zone block still sits on no control and inside the left column above the move stick; 195x422 is unchanged.
// OFFLINE: Town via helpers.offlineStub + joinOffline (literal db.attempts() === 0); Realm via blockDb (never joins).
// Run: BASE=http://localhost:9102/game/index.html node game/tests/cyc14-ui.test.js   (SHOTS=<dir> saves screenshots)
const { chromium } = require('playwright');
const { check, done, offlineStub, blockDb, exposeGame, joinOffline } = require('./helpers');
const BASE = process.env.BASE || 'http://localhost:8440/game/index.html';
const SHOTS = process.env.SHOTS || '';
const VERSION = 'v34-aquarium';
const W0 = (2 ** 30 - 1) - 3, W1 = 2 ** 27 - 1; // every fauna bit but fox (0) and deer (1): only those two can be greeted
const SAVE = { name: 'ADMINu14', species: 'cat', frame: 0, lastSeenVersion: VERSION, animalHello: [W0, W1] };

const townCtx = async (browser, vp) => {
  const ctx = await browser.newContext(vp.touch ? { viewport: { width: vp.width, height: vp.height }, hasTouch: true, isMobile: true, reducedMotion: 'reduce' } : { viewport: { width: vp.width, height: vp.height }, reducedMotion: 'reduce' });
  const db = await offlineStub(ctx);
  await ctx.addInitScript((o) => {
    if (!localStorage.getItem('__cyc14u')) {
      localStorage.setItem('pixeltown-save-v1', JSON.stringify(o)); localStorage.setItem('__cyc14u', '1');
      localStorage.setItem('pixeltown-gate-pointer-v1', JSON.stringify({ v: 1, dismissed: true, reached: false }));
    }
  }, SAVE);
  const page = await ctx.newPage(); const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await exposeGame(page);
  await page.goto(BASE);
  await joinOffline(page, 'ADMINu14');
  await page.waitForTimeout(800);
  await page.keyboard.press('Escape'); await page.waitForTimeout(200);
  return { ctx, db, page, errors };
};

// Put animal `sid` so that its heart's default spot (above it) is under the DOM element `under` (or in the open when under is null),
// within the hello radius of the hero, then let the hello run. Returns the heart's screen box and what is on top there.
const heartAt = (page, sid, under) => page.evaluate(async ({ sid, under }) => {
  const s = window.__g.scene.getScene('Town'); const cam = s.cameras.main; const cv = s.game.canvas;
  const spec = s.ffSpecimens.find((x) => x.id === sid && !x.pond && !x.ocean);
  s.tweens.killTweensOf(spec.sprite);
  // no toast line during this check (the 30 s line gap, as for a second animal): the line is the hello's own, tested by cyc13-s; here
  // only the bag bar / HUD decide where the heart goes
  s._animalHelloLineAt = Date.now(); const t0 = document.getElementById('achievement-toast'); if (t0) t0.classList.add('hidden');
  const cr = cv.getBoundingClientRect(); const k = cr.width / s.scale.width * cam.zoom;
  const toWorld = (x, y) => ({ x: cam.worldView.x + (x - cr.left) / k, y: cam.worldView.y + (y - cr.top) / k });
  let target;
  if (under) {
    const r = document.querySelector(under).getBoundingClientRect();
    // the heart's default spot is 4 px above the sprite top: put the sprite top just under the element's bottom edge
    const w = toWorld(r.left + r.width / 2, r.bottom - 6);
    target = { x: w.x, y: w.y + 4 + spec.sprite.displayHeight / 2 };
  } else {
    // in the open: the first spot near the hero where the area above the animal (heart size, 27 x 24 world px) is all canvas,
    // measured here with the test's own geometry (at 195 px the bag bar, Emotes and Tools cover much of the field)
    const free = (wx, wy) => { const L = cr.left + (wx - 14 - cam.worldView.x) * k, T = cr.top + (wy - 28 - cam.worldView.y) * k, W = 27 * k, H = 24 * k;
      return [[L + W / 2, T + H / 2], [L + 2, T + 2], [L + W - 2, T + 2], [L + 2, T + H - 2], [L + W - 2, T + H - 2]].every(([x, y]) => x > 0 && y > 0 && x < innerWidth && y < innerHeight && document.elementFromPoint(x, y) === cv); };
    const hx = s.localBody.x, hy = s.localBody.y, sh = spec.sprite.displayHeight / 2;
    const offs = [[40, 70], [-50, 70], [-60, 10], [0, 100], [-40, 120], [60, 120], [-70, -40], [40, -60]];
    const o = offs.find(([dx, dy]) => free(hx + dx, hy + dy - sh)) || offs[0];
    target = { x: hx + o[0], y: hy + o[1] };
  }
  spec.sprite.setPosition(target.x, target.y);
  s.refreshFloraFaunaNear();
  // in the open: the real proximity sweep greets it. Under the bag bar the spot can be farther than the hello radius from the hero on
  // the wider screens, so the greeting is called directly there (the same animalHelloGreet the sweep calls; the heart code is the same).
  if (under && Math.hypot(target.x - s.localBody.x, target.y - s.localBody.y) >= 150) s.animalHelloGreet(spec, s.time.now);
  for (let t = 0; t < 40 && (s.animalHelloLog || []).indexOf(sid) < 0; t++) await new Promise((r) => setTimeout(r, 100));
  await new Promise((r) => setTimeout(r, 300)); // a few frames: the heart picks its side
  const h = (s.animalHelloHearts || []).find((x) => x.spec.id === sid);
  if (!h) return { greeted: (s.animalHelloLog || []).indexOf(sid) >= 0, heart: false, dist: Math.hypot(target.x - s.localBody.x, target.y - s.localBody.y) };
  const b = h.heart.getBounds();
  const L = cr.left + (b.x - cam.worldView.x) * k, T = cr.top + (b.y - cam.worldView.y) * k, W = b.width * k, H = b.height * k;
  const pts = [[L + W / 2, T + H / 2], [L + 2, T + 2], [L + W - 2, T + 2], [L + 2, T + H - 2], [L + W - 2, T + H - 2]];
  const tops = pts.map(([x, y]) => { const e = document.elementFromPoint(x, y); return e === cv ? 'canvas' : (e ? (e.id || e.className || e.tagName) : 'none'); });
  const up = { x: spec.sprite.x, y: spec.sprite.y - spec.sprite.displayHeight / 2 - 4 }; const ux = cr.left + (up.x - cam.worldView.x) * k, uy = cr.top + (up.y - cam.worldView.y) * k - H / 2;
  const ue = document.elementFromPoint(ux, uy); const upTop = ue === cv ? 'canvas' : (ue ? (ue.id || ue.className || ue.tagName) : 'off-screen');
  const u = under ? document.querySelector(under).getBoundingClientRect() : null;
  const onUnder = !!u && L < u.right && L + W > u.left && T < u.bottom && T + H > u.top;
  return { greeted: true, heart: true, side: h.side || 'up', box: [Math.round(L), Math.round(T), Math.round(W), Math.round(H)], onScreen: L >= 0 && T >= 0 && L + W <= innerWidth && T + H <= innerHeight, tops, clear: tops.every((t) => t === "canvas"), onUnder, upTop };
}, { sid, under });

const compass = () => { const b = document.getElementById('mm-nav-btn'); if (!b) return { there: false }; const cs = getComputedStyle(b); return { there: true, display: cs.display, shown: cs.display !== 'none' && b.getBoundingClientRect().width > 0 }; };

(async () => {
  const browser = await chromium.launch();
  // ---------------- A + B: Town ----------------
  for (const vp of [{ width: 195, height: 422, touch: true }, { width: 390, height: 844, touch: true }, { width: 1280, height: 720 }]) {
    const L = `[${vp.width}x${vp.height}]`;
    const { ctx, db, page, errors } = await townCtx(browser, vp);
    // A. the bag bar (or, on desktop, the bag panel) right above the fox
    const bagShown = await page.evaluate(() => { const e = document.getElementById('inventory-panel'); if (!e) return false; const r = e.getBoundingClientRect(); return getComputedStyle(e).display !== 'none' && r.width > 0 && r.bottom > 0 && r.bottom < innerHeight * 0.6; });
    if (bagShown) {
      const a = await heartAt(page, 'fox', '#inventory-panel');
      check(`${L} A: the fox right under the bag bar is greeted with a heart`, a.greeted && a.heart, JSON.stringify(a));
      check(`${L} A: that heart is fully on screen and nothing covers it (canvas on top at its centre and corners)`, a.heart && a.onScreen && a.clear, JSON.stringify(a));
      check(`${L} A: that heart is not drawn under the bag bar`, a.heart && !a.onUnder, JSON.stringify(a));
      if (SHOTS) await page.screenshot({ path: `${SHOTS}/cyc14-ui-heart-${vp.width}x${vp.height}.jpg`, type: 'jpeg', quality: 80 });
    } else check(`${L} A: the bag bar is in the top part of the screen (needed for the heart check)`, vp.width > 1000, 'bag not found high on screen');
    await page.waitForTimeout(1400);
    const o = await heartAt(page, 'deer', null);
    check(`${L} A: an animal in the open still gets its heart above it, fully on screen and uncovered`, o.heart && o.side === 'up' && o.onScreen && o.clear, JSON.stringify(o));

    // B. the compass and every modal Town dialog
    let c = await page.evaluate(compass);
    check(`${L} B: no dialog open: the compass is shown`, c.there && c.shown, JSON.stringify(c));
    const ids = await page.evaluate(() => [...document.querySelectorAll('[role=dialog][aria-modal="true"].hidden')].map((d) => d.id).filter((id) => /-overlay$/.test(id)));
    check(`${L} B: the Town has its modal dialogs (>= 15)`, ids.length >= 15, ids.join(','));
    const bad = [], noClose = [];
    for (const id of ids) {
      const r = await page.evaluate(({ id, fn }) => {
        const d = document.getElementById(id); d.classList.remove('hidden');
        // eslint-disable-next-line no-new-func
        const out = (new Function('return (' + fn + ')()'))();
        out.close = !!d.querySelector('button[aria-label^="Close"], [id$="-close-btn"]');
        d.classList.add('hidden');
        out.back = (new Function('return (' + fn + ')()'))().shown;
        return out;
      }, { id, fn: compass.toString() });
      if (r.shown || !r.back) bad.push(`${id} open:${r.display} closed:${r.back}`);
      if (!r.close) noClose.push(id);
    }
    check(`${L} B: the compass is hidden while each modal dialog is open and back when it closes (${ids.length} dialogs)`, bad.length === 0, bad.join(' | '));
    check(`${L} B: each of those dialogs has its own close button`, noClose.length === 0, noClose.join(','));
    // the Museum, opened the real way, still hides it (cycle 12 / 13 rule kept)
    await page.evaluate(() => window.__g.scene.getScene('Town').openMuseum());
    await page.waitForSelector('#museum-overlay:not(.hidden)');
    c = await page.evaluate(compass);
    check(`${L} B: the Museum opened by openMuseum(): compass hidden`, c.there && !c.shown, JSON.stringify(c));
    await page.evaluate(() => window.__g.scene.getScene('Town').closeMuseum());
    await page.waitForTimeout(200);
    c = await page.evaluate(compass);
    check(`${L} B: after closeMuseum(): compass shown again`, c.shown, JSON.stringify(c));
    check(`${L} no page error, 0 database attempts`, errors.length === 0 && db.attempts() === 0, JSON.stringify([errors.slice(0, 3), db.attempts()]));
    await ctx.close();
  }

  // ---------------- C: Realm world, 160x284 ----------------
  const URL_W = new URL(BASE).origin + '/game/games/mad-maze/index.html?mode=world&test=1&seed=12345';
  const PROFILE = { v: 1, heroes: [{ id: 'h1', name: 'Fern', cls: 'druid', level: 7, xp: 10, items: [] }], stash: [], fame: 0, mode: 'classic', hall: [] };
  for (const [w, h] of [[160, 284], [195, 422]]) {
    const L = `[${w}x${h}]`;
    const ctx = await browser.newContext({ viewport: { width: w, height: h }, hasTouch: true, isMobile: true });
    const db = await blockDb(ctx);
    await ctx.addInitScript((p) => { if (!sessionStorage.s) { sessionStorage.s = '1'; localStorage.setItem('pixeltown-mm-v1', JSON.stringify(p)); localStorage.setItem('pixeltown-mm-active-v1', JSON.stringify({ v: 1, heroId: 'h1' })); } }, PROFILE);
    const p = await ctx.newPage(); const errors = []; p.on('pageerror', (e) => errors.push(e.message));
    await p.goto(URL_W, { waitUntil: 'load' });
    await p.waitForSelector('#rw-zone .rw-zn', { state: 'attached', timeout: 15000 });
    await p.waitForFunction(() => (document.querySelector('#rw-zone .rw-zn') || {}).textContent, null, { timeout: 10000 });
    await p.waitForTimeout(800);
    // the idle "Resting" chip (ID-51) stands in for the whole strip by design (cyc9-ui); on a loaded machine it can come up before
    // this check, so a short real key press ends the rest first and the strip itself is measured
    const resting = () => p.evaluate(() => { const r = document.querySelector('#rw-zone .rw-rest'); return !!r && !r.classList.contains('hidden'); });
    for (let i = 0; i < 3 && await resting(); i++) { await p.keyboard.down('d'); await p.waitForTimeout(80); await p.keyboard.up('d'); await p.waitForTimeout(300); }
    check(`${L} C: (setup) the Resting chip is down, so the zone strip itself is measured`, !(await resting()));
    const z = await p.evaluate(() => {
      const zn = document.querySelector('#rw-zone .rw-zname'), n = document.querySelector('#rw-zone .rw-zn'), zone = document.getElementById('rw-zone');
      const a = zn.getBoundingClientRect(), zr = zone.getBoundingClientRect();
      const ctl = [...document.querySelectorAll('#realm-overlay button, #mm-nav-btn, #rw-minimap, .realm-stick, #realm-abilities button')].filter((e) => { const cs = getComputedStyle(e); const r = e.getBoundingClientRect(); return cs.display !== 'none' && cs.visibility !== 'hidden' && r.width > 0 && r.left >= 0; });
      const hits = [];
      [zone, document.getElementById('realm-info')].forEach((el) => { const q = el.getBoundingClientRect(); ctl.forEach((c) => { const b = c.getBoundingClientRect(); const ox = Math.min(q.right, b.right) - Math.max(q.left, b.left), oy = Math.min(q.bottom, b.bottom) - Math.max(q.top, b.top); if (ox > 2 && oy > 2) hits.push(el.id + ' on ' + (c.id || c.className) + ' ' + Math.round(ox) + 'x' + Math.round(oy)); }); });
      // how much of the name is shown: the name span's own width vs the space the name box gives it
      const shownW = Math.min(a.right, zr.right) - Math.max(a.left, zr.left);
      const info = document.getElementById('realm-info'); const lines = [...info.children].filter((e) => getComputedStyle(e).display !== 'none' && e.getClientRects().length && !/rw-|sr-only/.test(e.className)).map((e) => { const r = e.getBoundingClientRect(); return { id: e.id, t: r.top, b: r.bottom, cut: e.scrollHeight > e.clientHeight + 1 }; });
      const infoR = info.getBoundingClientRect();
      return { name: n.textContent, nameW: Math.round(shownW), need: Math.ceil(n.getBoundingClientRect().width), whole: shownW + 0.5 >= n.getBoundingClientRect().width, zone: [Math.round(zr.left), Math.round(zr.top), Math.round(zr.width), Math.round(zr.height)], inScreen: zr.left >= 0 && zr.right <= innerWidth && zr.bottom <= innerHeight, hits, info: [Math.round(infoR.top), Math.round(infoR.bottom)], lines, fs: parseFloat(getComputedStyle(n).fontSize) };
    });
    if (w === 160) {
      check(`${L} C: the zone name has its own row at least 48 px wide (was 17 px)`, z.nameW >= 48, JSON.stringify(z));
      check(`${L} C: "${z.name}" is shown whole (not cut to one letter)`, z.whole, JSON.stringify(z));
      check(`${L} C: the zone text is 12 px or more`, z.fs >= 12, String(z.fs));
      check(`${L} C: the zone block and the Lv / shards lines sit on no control and inside the screen`, z.hits.length === 0 && z.inScreen, JSON.stringify(z));
      // the longer zone names: set the real span to each and measure how much of it shows
      const longs = await p.evaluate(() => { const n = document.querySelector('#rw-zone .rw-zn'), zn = document.querySelector('#rw-zone .rw-zname'); const old = n.textContent; const out = {}; for (const t of ['Midlands', 'Highlands', 'Godlands']) { n.textContent = t; out[t] = Math.round(zn.getBoundingClientRect().width) + '/' + Math.ceil(n.getBoundingClientRect().width); } n.textContent = old; return out; });
      check(`${L} C: the longer names get the full row too (shown/needed px: ${JSON.stringify(longs)})`, Object.values(longs).every((v) => +v.split('/')[0] >= 48), JSON.stringify(longs));
      if (SHOTS) await p.screenshot({ path: `${SHOTS}/cyc14-ui-realm-160x284-zone.jpg`, type: 'jpeg', quality: 85 });
    } else {
      check(`${L} C: wider screens unchanged: one-line zone strip, name shown whole`, z.whole && z.zone[3] <= 20, JSON.stringify(z));
    }
    check(`${L} no page error, 0 database attempts`, errors.length === 0 && db.attempts() === 0, JSON.stringify([errors.slice(0, 3), db.attempts()]));
    await ctx.close();
  }
  await browser.close();
  done();
})();
