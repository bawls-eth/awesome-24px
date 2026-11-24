// Round 4 QA replays (D5) of round-3 Realm fixes that the testers had not replayed by actual play. Real input and the real game loop:
// the hooks below only SET UP a situation (place the hero, spawn a boss, lower HP); the thing under test is never called directly.
//  A. b04-13 (P3): a Lv 1 hero inside a Godlands altar's wake radius: the real 2 Hz boss tick leaves the boss asleep and a warning line
//     is on screen; the hero then WALKS (W/A/S/D keys) onto the altar and the boss wakes (soft gate, not a wall).
//  B. b01-07 (P3): with that boss awake (bar up), the hero really dies (HP 1, damage back on, no test call to _die): on the "You fell"
//     card the boss bar is not on screen while the boss is still alive.
//  C. b15-r2-15 / b15-04 (P2): Realm HUD at 150% zoom (260x563) and 320x568 on touch: the XP bar is not painted over the Menu button
//     (every sampled point of the button hit-tests to the button), a TAP on the button's bottom edge opens the pause menu, and a tap on
//     Close resumes play.
// Proof run by D5: A, B, C fail on the tree before round 3 (d267d0b) and pass on the round-3 tip (see design/beta/fixes/r4-d5.md).
// Offline: blockDb, no chat, no Firebase writes. Run: BASE=http://localhost:8440/game/index.html node game/tests/beta-r4-replay-realm.test.js
const { chromium } = require('playwright');
const { check, done, blockDb } = require('./helpers');
const LS = require('./lib/load-scale');
const ORIGIN = (process.env.BASE || 'http://localhost:8440/game/index.html').replace(/\/game\/index\.html.*$/, '');
const WORLD = ORIGIN + '/game/games/mad-maze/index.html?mode=world&test=1&offline=1&heropick=0&tutorial=0&seed=12345';
const E = (page, fn, arg) => page.evaluate(`(${fn.toString()})(window.__mm.arena, window.__mm.world, ${JSON.stringify(arg === undefined ? null : arg)})`);
// what a player can see: an element that has a box, is not hidden, and (when given) whose text matches
const SEEN = ([sel, re]) => Array.from(document.querySelectorAll(sel)).filter((e) => { const cs = getComputedStyle(e); const r = e.getBoundingClientRect(); return cs.display !== 'none' && cs.visibility !== 'hidden' && parseFloat(cs.opacity) > 0.05 && r.width > 2 && r.height > 2 && r.bottom > 0 && r.top < innerHeight && (!re || new RegExp(re, 'i').test(e.textContent)); }).map((e) => (e.id || e.className || e.tagName) + ': ' + e.textContent.trim().slice(0, 90));

async function open(browser, vp, touch) {
  const ctx = await browser.newContext(touch ? { viewport: vp, hasTouch: true, isMobile: true } : { viewport: vp });
  const db = await blockDb(ctx);
  await ctx.route('**/game/index.html*', (r) => r.fulfill({ contentType: 'text/html', body: '<!doctype html>town' }));
  const page = await ctx.newPage(); const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(WORLD);
  await page.waitForFunction(() => window.__mm && window.__mm.world && window.__mm.arena.active && window.__mm.arena.state === 'play', null, { timeout: LS.budget(30000) });
  await page.waitForTimeout(500);
  return { ctx, page, errors, db };
}

(async () => {
  const browser = await chromium.launch();
  const f = LS.factor();

  // ---------- A. b04-13 Godlands soft gate, by walking
  {
    const { ctx, page, errors, db } = await open(browser, { width: 1280, height: 720 }, false);
    await page.mouse.click(640, 360);
    await E(page, (a) => { a.player.iframes = 1e9; a.__hp0 = a._hitPlayer; a._hitPlayer = () => {}; }); // setup only: the Lv 1 hero must survive the Godlands mobs to reach the altar
    const site = await E(page, (a, w) => { const s = w.bossSites(); const i = s.findIndex((q) => q.zone === 3); return i < 0 ? null : { i, x: s[i].x, y: s[i].y, lv: a.save.level }; });
    check('A0. a Godlands altar exists on this seed and the hero is level 1', !!site && site.lv === 1, JSON.stringify(site));
    // stand 5-8 tiles from the altar on a Godlands tile (inside the 9 tile wake radius), then let the REAL loop run
    const spot = await E(page, (a, w, s) => { const Z = window.MMZones; let spot = null;
      for (let r = 5; r <= 8 && !spot; r++) for (let dy = -r; dy <= r && !spot; dy++) for (let dx = -r; dx <= r && !spot; dx++) { if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue; if (Z.zoneInfoAt(w.world, s.x + dx + 0.5, s.y + dy + 0.5).zone === 3) spot = { x: s.x + dx, y: s.y + dy }; }
      if (spot) { a.player.x = (spot.x + 0.5) * 32; a.player.y = (spot.y + 0.5) * 32; } return spot; }, site);
    // the note stays about 3 s: watch for it while the real loop runs (at least three 2 Hz boss ticks)
    const tA = Date.now();
    const warnText = await page.waitForFunction(() => { const m = /[^\n]*far above your level[^\n]*/i.exec(document.body.innerText); return m ? m[0] : false; }, null, { timeout: LS.budget(4000), polling: 100 }).then((h) => h.jsonValue()).catch(() => '');
    await page.waitForTimeout(Math.max(0, Math.round(1800 * f) - (Date.now() - tA)));
    const st = await E(page, (a, w, s) => ({ live: w.bossSites()[s.i].live, boss: !!a._boss(), d: Math.round(Math.hypot(a.player.x - (s.x + 0.5) * 32, a.player.y - (s.y + 0.5) * 32) / 32) }), site);
    const barA = await page.evaluate(SEEN, ['#realm-boss', null]);
    check('A1. b04-13: after 1.8 s inside the wake radius the Godlands boss is still asleep (it used to wake at once)', !!spot && !st.live && !st.boss && barA.length === 0, JSON.stringify({ spot, st, barA }));
    check('A2. b04-13: a warning on screen gives the recommended level and says how to wake the boss', /rec\. Lv \d+/.test(warnText) && /altar/i.test(warnText), warnText);
    // walk onto the altar with the keyboard
    const keyOf = { '-1,0': 'a', '1,0': 'd', '0,-1': 'w', '0,1': 's' };
    let held = []; let reached = false; const t0 = Date.now();
    while (Date.now() - t0 < LS.budget(14000)) {
      const q = await E(page, (a, w, s) => ({ dx: (s.x + 0.5) * 32 - a.player.x, dy: (s.y + 0.5) * 32 - a.player.y, live: w.bossSites()[s.i].live }), site);
      if (q.live || Math.hypot(q.dx, q.dy) < 1.5 * 32) { reached = true; break; }
      const want = []; if (Math.abs(q.dx) > 10) want.push(keyOf[(q.dx > 0 ? 1 : -1) + ',0']); if (Math.abs(q.dy) > 10) want.push(keyOf['0,' + (q.dy > 0 ? 1 : -1)]);
      for (const k of held) if (!want.includes(k)) await page.keyboard.up(k);
      for (const k of want) if (!held.includes(k)) await page.keyboard.down(k);
      held = want; await page.waitForTimeout(120);
    }
    for (const k of held) await page.keyboard.up(k);
    const walked = await E(page, (a, w, s) => ({ d: Math.round(Math.hypot(a.player.x - (s.x + 0.5) * 32, a.player.y - (s.y + 0.5) * 32) / 3.2) / 10 }), site);
    check('A3. the hero walked from the wake ring to the altar with W/A/S/D', reached && walked.d < 3.5, JSON.stringify({ reached, walked, from: st.d }));
    const woke = await page.waitForFunction((i) => window.__mm.world.bossSites()[i].live && !!window.__mm.arena._boss(), site.i, { timeout: LS.budget(4000) }).then(() => true).catch(() => false);
    await page.waitForTimeout(300);
    const barUp = await page.evaluate(SEEN, ['#realm-boss', null]);
    check('A4. stepping onto the altar wakes the boss on purpose (soft gate) and its bar shows', woke && barUp.length === 1, JSON.stringify({ woke, barUp }));
    // ---------- B. b01-07: the boss woken above is alive; the hero now really dies to it
    check('B1. the woken boss shows its bar during the fight', barUp.length === 1, JSON.stringify(barUp));
    await E(page, (a) => { a._hitPlayer = a.__hp0; a.player.hp = 1; a.player.iframes = 0; if (a.player.shield) a.player.shield = 0; }); // setup: damage back on, one hit from death
    const dead = await page.waitForFunction(() => window.__mm.arena.state === 'dead', null, { timeout: LS.budget(25000) }).then(() => true).catch(() => false);
    check('B2. the hero fell through real damage beside the boss (no test call to the death code)', dead);
    await page.waitForTimeout(700);
    const card = await page.evaluate(SEEN, ['#realm-banner', 'You fell']);
    const bar = await page.evaluate(SEEN, ['#realm-boss', null]);
    const alive = await E(page, (a) => !!a._boss());
    check('B3. the "You fell" card is up and the boss is still alive', card.length === 1 && alive, JSON.stringify({ card, alive }));
    check('B4. b01-07: no boss bar on screen with the "You fell" card', bar.length === 0, JSON.stringify(bar));
    if (process.env.R4_SHOTS) await page.screenshot({ path: process.env.R4_SHOTS + '/b01-07-fall.png' });
    check('A/B. no page errors, no database traffic', errors.length === 0 && db.attempts() === 0, errors.join(' | '));
    await ctx.close();
  }

  // ---------- C. narrow HUD: Menu vs XP bar, by tapping
  for (const [w, h] of [[260, 563], [320, 568]]) {
    const { ctx, page, errors } = await open(browser, { width: w, height: h }, true); const tag = w + 'x' + h;
    const g = await page.evaluate(() => {
      const m = document.getElementById('realm-menu-btn'), x = document.getElementById('realm-xp'); const b = m.getBoundingClientRect(), xb = x.getBoundingClientRect();
      const pts = []; for (let i = 1; i <= 4; i++) for (let j = 1; j <= 5; j++) { const px = b.left + (b.width * i) / 5, py = b.top + (b.height * j) / 6; const top = document.elementFromPoint(px, py); pts.push(!!top && (top === m || m.contains(top))); }
      const overlap = Math.max(0, Math.min(b.right, xb.right) - Math.max(b.left, xb.left)) * Math.max(0, Math.min(b.bottom, xb.bottom) - Math.max(b.top, xb.top));
      return { menu: [b.left, b.top, b.right, b.bottom].map(Math.round), xp: [xb.left, xb.top, xb.right, xb.bottom].map(Math.round), own: pts.filter(Boolean).length, n: pts.length, overlap: Math.round(overlap), tap: [b.left + b.width / 2, b.bottom - 5] };
    });
    check(tag + ' C1. b15-r2-15: the XP bar is not drawn across the Menu button (0 px overlap; it was 44x16 px)', g.overlap === 0, JSON.stringify(g));
    check(tag + ' C2. every sampled point of the Menu button belongs to the button', g.own === g.n, g.own + '/' + g.n);
    await page.touchscreen.tap(g.tap[0], g.tap[1]);
    const opened = await page.waitForFunction(() => { const p = document.getElementById('realm-pause'); return window.__mm.arena.paused && p && p.getClientRects().length > 0 && getComputedStyle(p).visibility !== 'hidden'; }, null, { timeout: LS.budget(3000) }).then(() => true).catch(() => false);
    check(tag + ' C3. a tap on the bottom edge of the Menu button (where the XP bar used to lie) opens the pause menu', opened);
    const close = await page.evaluate(() => { const c = document.getElementById('realm-menu-close'); if (!c || !c.getClientRects().length) return null; const b = c.getBoundingClientRect(); return { x: b.left + b.width / 2, y: b.top + b.height / 2, in: b.left >= 0 && b.right <= innerWidth && b.top >= 0 && b.bottom <= innerHeight }; });
    check(tag + ' C4. the Close button of the menu is inside the screen', !!close && close.in, JSON.stringify(close));
    if (close) await page.touchscreen.tap(close.x, close.y);
    const resumed = await page.waitForFunction(() => !window.__mm.arena.paused, null, { timeout: LS.budget(3000) }).then(() => true).catch(() => false);
    check(tag + ' C5. tapping Close resumes play', resumed);
    check(tag + ' C. no page errors', errors.length === 0, errors.join(' | '));
    await ctx.close();
  }

  await browser.close();
  done();
})().catch((e) => { console.error(e); process.exit(1); });
