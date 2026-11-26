// cyc15-ui: three cycle 14 open UI items.
//  A. ID-65 Realm "Not saved" chip at <= 300 px. At 195x422 it was walked down from under Leave to y 312 (166 px from Leave, over the
//     top of the aim stick); at 160x284 it sat on the aim stick (tray closed) and on Daily (tray open). Now: 195x422 = right above Leave
//     (gap <= 8 px, Board / Menu nudged left); 160x284 = in the More tray (tray closed: chip tucked, the More button carries an amber "!"
//     and says "Progress not saved" in its label; tray open: the chip in the tray's left cell, <= 56 px from Leave). Everywhere: 44 x 44,
//     12 px text not clipped, inside the screen, on no control and on neither stick; the tap still opens the note; a landed write clears
//     the chip and the More warning. 1280x720 and 390x844: unchanged (in the HUD row left of the info line).
//  B. ID-59 hello heart size (Town, 195x422 / 390x844 / 1280x720): it was 27 x 24 world px (3x) over 14-24 px animals. Now an integer
//     scale of G's 9 x 8 heart: 1x, or 2x where 1x would be under 10 CSS px tall; it still reads (>= 10 CSS px tall on screen), is
//     fully on screen and uncovered (the post-render side decision is kept: cyc14-ui A / cyc13-s-animal-hello still cover it).
//  C. Isles toast (the game's own toast path) with the longest journal line: 195x422 with the how-to card (was on Soothe), 195x422
//     without it (was on the HUD), 160x284 without it (was on the HUD), 160x284 with it and 390x844 both: inside the screen and off the
//     HUD, the how-to card and every action-row button (Soothe shown); <= 300 px tall it keeps the bottom edge (over the stick, see-through).
// OFFLINE: Realm and Isles = blockDb (never join); Town = offlineStub + joinOffline, literal db.attempts() === 0. Nothing is written to Firebase.
// Run: BASE=http://localhost:9102/game/index.html NODE_PATH=$(npm root -g) node game/tests/cyc15-ui.test.js   (SHOTS=<dir>; ONLY=A,B,C)
const { chromium } = require('playwright');
const { check, done, offlineStub, blockDb, exposeGame, joinOffline } = require('./helpers');
const BASE = process.env.BASE || 'http://localhost:8440/game/index.html';
const ORIGIN = BASE.replace(/\/game\/index\.html.*$/, '');
const SHOTS = process.env.SHOTS || '';
const ONLY = process.env.ONLY ? process.env.ONLY.split(',') : null;
const want = (k) => !ONLY || ONLY.includes(k);
const J = JSON.stringify;
const WORLD = ORIGIN + '/game/games/mad-maze/index.html?mode=world&test=1&offline=1&seed=12345&qdate=2030-05-01&tutorial=0';
const QUOTA = () => {
  const orig = Storage.prototype.setItem;
  Storage.prototype.setItem = function (k, v) { if (window.__quota && k === 'pixeltown-save-v1') { const e = new Error('QuotaExceededError'); e.name = 'QuotaExceededError'; throw e; } return orig.call(this, k, v); };
};
const hit = (a, b, m = 2) => !!(a && b && Math.min(a.r, b.r) - Math.max(a.x, b.x) > m && Math.min(a.b, b.b) - Math.max(a.y, b.y) > m);
const gap = (a, b) => Math.max(0, Math.max(a.x, b.x) - Math.min(a.r, b.r)) + Math.max(0, Math.max(a.y, b.y) - Math.min(a.b, b.b));

// every visible control / HUD box (the a11y sweep's interactive set plus the sticks and the HUD bars), minus `id`
const boxes = (page, id) => page.evaluate((cid) => {
  const hidden = (e) => { for (let n = e; n && n.nodeType === 1; n = n.parentElement) { const cs = getComputedStyle(n); if (cs.display === 'none' || cs.visibility === 'hidden' || n.hidden || n.getAttribute('aria-hidden') === 'true' || parseFloat(cs.opacity) === 0) return true; } return false; };
  const Q = 'a[href],button,input:not([type=hidden]),select,[role=button],[role=application],[tabindex]:not([tabindex="-1"]),.realm-stick,#realm-hp,#realm-xp,#realm-info,#rw-minimap,#rw-zone';
  const me = document.getElementById(cid);
  return [...document.querySelectorAll(Q)].filter((e) => e !== me && !hidden(e) && !(me && (me.contains(e) || e.contains(me)))).map((e) => {
    const r = e.getBoundingClientRect(); return { id: e.id || e.className || e.tagName, x: r.left, y: r.top, r: r.right, b: r.bottom, a: r.width * r.height };
  }).filter((q) => q.a > 4 && q.a < 0.5 * innerWidth * innerHeight);
}, id);
const box = (page, sel) => page.evaluate((s) => {
  const e = document.querySelector(s); if (!e || e.hidden) return null; const cs = getComputedStyle(e);
  if (cs.display === 'none' || cs.visibility === 'hidden' || cs.opacity === '0') return null;
  const r = e.getBoundingClientRect(); if (!r.width) return null;
  return { x: r.left, y: r.top, r: r.right, b: r.bottom, w: r.width, h: r.height, fs: parseFloat(cs.fontSize), clip: e.scrollWidth > e.clientWidth + 1 || e.scrollHeight > e.clientHeight + 1 };
}, sel);

(async () => {
  const browser = await chromium.launch();

  // ---------------- A. Realm "Not saved" chip ----------------
  if (want('A')) for (const [w, h, touch] of [[1280, 720, false], [390, 844, true], [195, 422, true], [160, 284, true]]) {
    const tag = `[A ${w}x${h}]`;
    const ctx = await browser.newContext(touch ? { viewport: { width: w, height: h }, hasTouch: true, isMobile: true } : { viewport: { width: w, height: h } });
    const db = await blockDb(ctx); await ctx.routeWebSocket(/.*/, (ws) => ws.close());
    await ctx.route('**/game/index.html*', (r) => r.fulfill({ contentType: 'text/html', body: '<!doctype html><title>town</title>town' }));
    const page = await ctx.newPage(); const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto(ORIGIN + '/game/games/mad-maze/lantern.css');
    await page.evaluate(() => { localStorage.clear(); localStorage.setItem('pixeltown-save-v1', JSON.stringify({ realm: { level: 1, xp: 0, shards: 100, bestWave: 0, items: [], nextUid: 20, eq: {} } })); localStorage.setItem('mm-aim-assist', '0'); });
    await page.addInitScript(QUOTA);
    await page.goto(WORLD);
    await page.waitForFunction(() => window.__mm && window.__mm.arena && window.__mm.arena.active && window.__mm.arena.state === 'play', null, { timeout: 60000 });
    await page.evaluate(() => { const a = window.__mm.arena; a.player.iframes = 1e9; a._hitPlayer = () => {}; window.__quota = true; a.save.shards += 1; a.onSave(a.save); });
    await page.waitForTimeout(700);
    const tray = !!(await box(page, '#rw-more-btn'));
    const chipOk = async (label) => {
      const c = await box(page, '#realm-save-warn');
      const others = await boxes(page, 'realm-save-warn');
      const on = c ? others.filter((q) => hit(c, q)).map((q) => q.id) : ['(no chip)'];
      check(`${tag} ${label}: the chip shows, >= 44 x 44, inside the screen, 12 px text not clipped`, !!c && c.w >= 44 && c.h >= 44 && c.x >= 0 && c.y >= 0 && c.r <= w && c.b <= h && c.fs >= 12 && !c.clip, J(c));
      check(`${tag} ${label}: the chip is on no control, HUD bar or stick`, on.length === 0, on.join(', '));
      return c;
    };
    if (w > 300) {
      const c = await chipOk('wide');
      const i = await box(page, '#realm-info');
      check(`${tag} wide: unchanged, in the HUD row left of the info line (or on the button row above a wrapped info line)`, !!c && !!i && (c.r <= i.x + 1 || Math.abs((c.y + c.b) / 2 - (i.y + i.b) / 2) >= 30), J({ c, i }));
    } else if (!tray) {
      const c = await chipOk('no tray');
      const l = await box(page, '#realm-leave-btn');
      check(`${tag} no tray: the chip is right next to Leave (edge gap <= 8 px; it was 166 px under it, at y 312)`, !!c && !!l && gap(c, l) <= 8, J({ c, l, gap: c && l && gap(c, l) }));
    } else {
      const c0 = await box(page, '#realm-save-warn');
      const m = await page.evaluate(() => { const b = document.getElementById('rw-more-btn'); return { warn: b.classList.contains('rw-more-warn'), label: b.getAttribute('aria-label'), badge: getComputedStyle(b, '::after').content }; });
      check(`${tag} tray closed: the chip is tucked into the tray (it sat on the aim stick)`, !c0, J(c0));
      check(`${tag} tray closed: the More button carries the warning (amber "!" badge, label says progress is not saved)`, m.warn && /not saved/i.test(m.label) && /!/.test(m.badge), J(m));
      if (SHOTS) await page.screenshot({ path: `${SHOTS}/cyc15-ui-savewarn-realm-${w}x${h}-closed.jpg`, type: 'jpeg', quality: 80 });
      await page.tap('#rw-more-btn'); await page.waitForTimeout(300);
      const c = await chipOk('tray open');
      const items = (await Promise.all(['#realm-leave-btn', '#realm-bp-btn', '#realm-board-btn', '#mm-gear-btn', '#mm-daily-btn'].map((sel) => box(page, sel)))).filter(Boolean);
      const near = c ? Math.min(...items.map((q) => gap(c, q))) : 999;
      check(`${tag} tray open: the chip is in the tray, beside a tray item (edge gap <= 8 px; Leave is one cell away)`, !!c && items.length === 5 && near <= 8, J({ c, near }));
    }
    if (SHOTS) await page.screenshot({ path: `${SHOTS}/cyc15-ui-savewarn-realm-${w}x${h}.jpg`, type: 'jpeg', quality: 80 });
    if (w <= 300) {
      const tapped = await page.tap('#realm-save-warn', { timeout: 4000 }).then(() => true).catch((e) => String(e.message).split('\n').find((l) => /intercepts/.test(l)) || 'tap failed');
      await page.waitForTimeout(250);
      const n = await page.evaluate(() => !document.getElementById('realm-save-warn-note').classList.contains('hidden'));
      check(`${tag} a real tap on the chip reaches it and opens the note`, tapped === true && n, J({ tapped, n }));
      await page.keyboard.press('Escape'); await page.waitForTimeout(150);
    }
    await page.evaluate(() => { window.__quota = false; const a = window.__mm.arena; a.save.shards += 1; a.onSave(a.save); });
    await page.waitForTimeout(500);
    const after = await page.evaluate(() => { const c = document.getElementById('realm-save-warn'); const b = document.getElementById('rw-more-btn'); return { chip: !!c && !c.hidden, warn: !!b && b.classList.contains('rw-more-warn'), nudge: document.body.classList.contains('rm-sw-on') }; });
    check(`${tag} a landed write clears the chip, the More warning and the Board / Menu nudge`, !after.chip && !after.warn && !after.nudge, J(after));
    check(`${tag} no page errors, 0 database attempts`, errors.length === 0 && db.attempts() === 0, J([errors.slice(0, 3), db.attempts()]));
    await ctx.close();
  }

  // ---------------- B. hello heart size ----------------
  if (want('B')) for (const vp of [{ width: 195, height: 422, touch: true }, { width: 390, height: 844, touch: true }, { width: 1280, height: 720 }]) {
    const tag = `[B ${vp.width}x${vp.height}]`;
    // reduced motion (as cyc14-ui A): the animals hold still, so the fox stays where it is put while the heart is measured
    const ctx = await browser.newContext(vp.touch ? { viewport: { width: vp.width, height: vp.height }, hasTouch: true, isMobile: true, reducedMotion: 'reduce' } : { viewport: { width: vp.width, height: vp.height }, reducedMotion: 'reduce' });
    const db = await offlineStub(ctx);
    await ctx.addInitScript((o) => {
      if (!localStorage.getItem('__cyc15u')) {
        localStorage.setItem('pixeltown-save-v1', JSON.stringify(o)); localStorage.setItem('__cyc15u', '1');
        localStorage.setItem('pixeltown-gate-pointer-v1', JSON.stringify({ v: 1, dismissed: true, reached: false }));
      }
    }, { name: 'ADMINu15', species: 'cat', frame: 0, lastSeenVersion: 'v34-aquarium', animalHello: [(2 ** 30 - 1) - 3, 2 ** 27 - 1] });
    const page = await ctx.newPage(); const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await exposeGame(page);
    await page.goto(BASE);
    await joinOffline(page, 'ADMINu15');
    await page.waitForTimeout(800);
    await page.keyboard.press('Escape'); await page.waitForTimeout(200);
    const r = await page.evaluate(async () => {
      const s = window.__g.scene.getScene('Town'); const cam = s.cameras.main; const cv = s.game.canvas; const cr = cv.getBoundingClientRect();
      const k = cr.width / s.scale.width * cam.zoom;
      s._animalHelloLineAt = Date.now();
      const spec = s.ffSpecimens.find((x) => x.id === 'fox' && !x.pond && !x.ocean); s.tweens.killTweensOf(spec.sprite);
      // a spot near the hero whose area above is canvas (the open field)
      const free = (wx, wy) => { const L = cr.left + (wx - 14 - cam.worldView.x) * k, T = cr.top + (wy - 28 - cam.worldView.y) * k, W = 27 * k, H = 24 * k;
        return [[L + W / 2, T + H / 2], [L + 2, T + 2], [L + W - 2, T + 2], [L + 2, T + H - 2], [L + W - 2, T + H - 2]].every(([x, y]) => x > 0 && y > 0 && x < innerWidth && y < innerHeight && document.elementFromPoint(x, y) === cv); };
      const hx = s.localBody.x, hy = s.localBody.y, sh = spec.sprite.displayHeight / 2;
      const offs = [[40, 70], [-50, 70], [-60, 10], [0, 100], [-40, 120], [60, 120], [-70, -40], [40, -60]];
      const o = offs.find(([dx, dy]) => free(hx + dx, hy + dy - sh)) || offs[0];
      spec.sprite.setPosition(hx + o[0], hy + o[1]); s.refreshFloraFaunaNear();
      for (let t = 0; t < 40 && !(s.animalHelloHearts || []).length; t++) await new Promise((res) => setTimeout(res, 100));
      await new Promise((res) => setTimeout(res, 250));
      const hh = (s.animalHelloHearts || [])[0];
      if (!hh) return { heart: false };
      const b = hh.heart.getBounds();
      const L = cr.left + (b.x - cam.worldView.x) * k, T = cr.top + (b.y - cam.worldView.y) * k, W = b.width * k, H = b.height * k;
      const pts = [[L + W / 2, T + H / 2], [L + 2, T + 2], [L + W - 2, T + 2], [L + 2, T + H - 2], [L + W - 2, T + H - 2]];
      return { heart: true, key: hh.heart.texture.key, scale: hh.heart.scaleX, world: [hh.heart.displayWidth, hh.heart.displayHeight], css: [Math.round(W), Math.round(H)], animal: [spec.sprite.displayWidth, spec.sprite.displayHeight],
        clear: pts.every(([x, y]) => document.elementFromPoint(x, y) === cv), onScreen: L >= 0 && T >= 0 && L + W <= innerWidth && T + H <= innerHeight, side: hh.side || 'up' };
    });
    check(`${tag} the fox is greeted with G's baked heart`, r.heart && r.key === 'fft_heart', J(r));
    check(`${tag} the heart is on the animals' pixel grid: integer scale 1 or 2, <= 18 x 16 world px (was 3x = 27 x 24)`, r.heart && (r.scale === 1 || r.scale === 2) && r.world[0] <= 18 && r.world[1] <= 16, J(r));
    check(`${tag} 2x only where 1x would be under 10 CSS px tall; it still reads (>= 10 CSS px tall on screen)`, r.heart && r.css[1] >= 10 && (r.scale === 1 || 8 * (r.css[1] / r.world[1]) < 10), J(r));
    check(`${tag} the heart is fully on screen and uncovered (canvas on top at 5 points)`, r.heart && r.onScreen && r.clear, J(r));
    if (SHOTS) await page.screenshot({ path: `${SHOTS}/cyc15-ui-heart-${vp.width}x${vp.height}.jpg`, type: 'jpeg', quality: 80 });
    check(`${tag} no page errors, 0 database attempts`, errors.length === 0 && db.attempts() === 0, J([errors.slice(0, 3), db.attempts()]));
    await ctx.close();
  }

  // ---------------- C. Isles toast ----------------
  const LONG = 'New in your journal: Scarlet Macaw (rare)!'; // the shape of isles.js line 829, the longest journal toast
  if (want('C')) for (const [w, h] of [[195, 422], [160, 284], [390, 844]]) for (const card of [true, false]) {
    const tag = `[C Isles ${w}x${h} ${card ? 'how-to up' : 'no how-to'}]`;
    const ctx = await browser.newContext({ viewport: { width: w, height: h }, hasTouch: true, isMobile: true });
    const db = await blockDb(ctx);
    const page = await ctx.newPage(); const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.addInitScript(() => { if (sessionStorage.s) return; sessionStorage.s = 1; localStorage.clear(); });
    await page.goto(ORIGIN + '/game/games/isles/index.html?test=1&seed=5&isle=jungle');
    await page.waitForFunction(() => window.__isles && window.__isles.world);
    await page.waitForTimeout(500);
    if (!card) { await page.tap('#howto .howto-x'); await page.waitForTimeout(250); }
    const hc = await box(page, '#howto');
    check(`${tag} the how-to card is ${card ? 'up' : 'closed'}`, card ? !!hc : !hc, J(hc));
    // Soothe shown (as next to a creature to soothe); the toast through the game's own toast(); measured in the same step (its timer can end it)
    const t = await page.evaluate((txt) => {
      document.getElementById('btn-soothe').hidden = false;
      const e = document.getElementById('toast'); e.style.transition = 'none';
      if (window.__isles.toast) window.__isles.toast(txt); else { e.textContent = txt; e.classList.add('on'); }
      const r = e.getBoundingClientRect(); return { x: r.left, y: r.top, r: r.right, b: r.bottom, clip: e.scrollHeight > e.clientHeight + 1 };
    }, LONG);
    const hud = await box(page, '#hud'), how = await box(page, '#howto');
    const acts = await page.evaluate(() => [...document.querySelectorAll('#acts button')].filter((b) => !b.hidden && b.offsetParent).map((b) => { const r = b.getBoundingClientRect(); return { id: b.id, x: r.left, y: r.top, r: r.right, b: r.bottom }; }).filter((q) => q.r > q.x && q.x < innerWidth && q.r > 0));
    const fire = await box(page, '#touch-btns');
    check(`${tag} the journal toast is inside the screen, text not clipped`, t.x >= 0 && t.y >= 0 && t.r <= w + 0.5 && t.b <= h + 0.5 && !t.clip, J(t));
    check(`${tag} it is off the HUD and the how-to card (was on the HUD at 195 / 160 without the card)`, !hit(t, hud, 0.5) && !hit(t, how, 0.5), J({ t, hud, how }));
    check(`${tag} it is off every action-row button, Soothe shown (was on Soothe at 195 with the card)`, acts.every((b) => !hit(t, b, 0.5)), J({ t, on: acts.filter((b) => hit(t, b, 0.5)) }));
    if (h > 300) check(`${tag} it is off the Attack button too`, !hit(t, fire, 0.5), J({ t, fire }));
    else check(`${tag} <= 300 px tall: on the bottom edge at the full width (see-through to taps)`, Math.abs(t.x - 8) <= 1 && Math.abs(t.r - (w - 8)) <= 1 && h - t.b <= 8 && await page.evaluate(() => getComputedStyle(document.getElementById('toast')).pointerEvents === 'none'), J(t));
    if (SHOTS && w < 300) await page.screenshot({ path: `${SHOTS}/cyc15-ui-isles-toast-${w}x${h}-${card ? 'card' : 'nocard'}.jpg`, type: 'jpeg', quality: 80 });
    check(`${tag} no page errors, 0 database attempts`, errors.length === 0 && db.count() === 0, J([errors.slice(0, 3), db.count()]));
    await ctx.close();
  }

  await browser.close();
  done();
})();
