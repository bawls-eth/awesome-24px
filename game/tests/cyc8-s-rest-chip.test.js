// Cycle 8 S, ID-51 follow-up: a resting hero used to show no sign at all (cycle 7 S report, proposal 2). Now a small "Resting" chip
// (#rw-rest, role=status, inside the zone label #rw-zone) shows while arena.resting is true and hides on the first real input.
// Checked at 1280x720 (keyboard) and 390x844 (touch): hidden at the start, visible within 9 s of no input, inside the viewport, 12 px text
// floor, no horizontal scroll; one real key press / touch tap hides it on the next frame. Also (cycle 9): it shows on a Midlands tile, never on a Highlands tile.
// OFFLINE: blockDb + every WebSocket closed + the town page stubbed; literal 0 database attempts.
// Run: BASE=http://localhost:8440/game/index.html node game/tests/cyc8-s-rest-chip.test.js   (SHOTS=<dir> also saves screenshots)
const { chromium } = require('playwright');
const { check, done, blockDb } = require('./helpers');
const LS = require('./lib/load-scale');
const ORIGIN = (process.env.BASE || 'http://localhost:8440/game/index.html').replace(/\/game\/index\.html.*$/, '');
const URL = ORIGIN + '/game/games/mad-maze/index.html?mode=world&from=hub&test=1&seed=12345&heropick=0&tutorial=0&qdate=2030-05-01';
const E = (page, fn, arg) => page.evaluate(`(${fn.toString()})(window.__mm.arena, window.__mm.world, ${JSON.stringify(arg === undefined ? null : arg)})`);
const chip = (page) => page.evaluate(() => {
  const el = document.getElementById('rw-rest'); const a = window.__mm.arena;
  if (!el) return { exists: false, resting: a.resting };
  const r = el.getBoundingClientRect(); const cs = getComputedStyle(el);
  return { exists: true, resting: a.resting, idleT: a._idleT, shown: !el.classList.contains('hidden') && cs.display !== 'none' && r.width > 0 && r.height > 0,
    text: el.textContent, role: el.getAttribute('role'), inZone: !!el.closest('#rw-zone'), fs: parseFloat(cs.fontSize),
    inView: r.left >= 0 && r.top >= 0 && r.right <= innerWidth + 0.5 && r.bottom <= innerHeight + 0.5, hscroll: document.documentElement.scrollWidth > innerWidth + 1 };
});

(async () => {
  const browser = await chromium.launch();
  for (const v of [{ view: [1280, 720], touch: false, name: '1280x720' }, { view: [390, 844], touch: true, name: '390x844' }]) {
    const ctx = await browser.newContext({ viewport: { width: v.view[0], height: v.view[1] }, hasTouch: v.touch, isMobile: v.touch });
    const db = await blockDb(ctx); await ctx.routeWebSocket(/.*/, (ws) => ws.close());
    await ctx.route('**/game/index.html*', (r) => r.fulfill({ contentType: 'text/html', body: '<!doctype html>town' }));
    const page = await ctx.newPage(); const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto(URL);
    await page.waitForFunction(() => window.__mm && window.__mm.world && window.__mm.arena.active && window.__mm.arena.state === 'play', null, { timeout: LS.budget(40000) });
    await E(page, (a) => { a.player.iframes = 1e9; return true; }); // survive to be measured
    // cycle 9: the page can sit idle past RM_IDLE_REST_S (5 s) while it loads on a busy machine; one real input wakes the hero first
    if (v.touch) await page.touchscreen.tap(Math.round(v.view[0] / 2), Math.round(v.view[1] * 0.35));
    else { await page.keyboard.down('d'); await page.waitForTimeout(60); await page.keyboard.up('d'); }
    await page.waitForTimeout(120);
    const c0 = await chip(page);
    check(v.name + ': the chip exists inside the zone label, role=status, and is hidden while the hero is awake', c0.exists && c0.inZone && c0.role === 'status' && !c0.shown && !c0.resting, JSON.stringify(c0));
    await page.waitForFunction(() => window.__mm.arena.resting || window.__mm.arena.state !== 'play', null, { timeout: LS.budget(40000) }).catch(() => null);
    await page.waitForTimeout(150);
    const c1 = await chip(page);
    check(v.name + ': after RM_IDLE_REST_S (5 s) with no input the hero rests and the chip shows "Resting"', c1.resting && c1.shown && /Resting/.test(c1.text), JSON.stringify(c1));
    check(v.name + ': the chip is on screen, at least 12 px text, no horizontal scroll', c1.inView && c1.fs >= 12 && !c1.hscroll, JSON.stringify(c1));
    if (process.env.SHOTS) await page.screenshot({ path: process.env.SHOTS + '/cyc8-systems-rest-chip-' + v.name + '.jpg', type: 'jpeg', quality: 60 }).catch(() => null);
    if (v.touch) await page.touchscreen.tap(Math.round(v.view[0] / 2), Math.round(v.view[1] * 0.35));
    else { await page.keyboard.down('d'); await page.waitForTimeout(60); await page.keyboard.up('d'); }
    await page.waitForTimeout(120);
    const c2 = await chip(page);
    check(v.name + ': one real ' + (v.touch ? 'touch tap' : 'key press') + ' ends the rest and hides the chip', !c2.resting && !c2.shown, JSON.stringify(c2));
    if (!v.touch) {
      // cycle 9 (ID-51 extended to zone <= 1): on a Midlands tile the idle hero rests and the chip shows; on a Highlands tile (zone 2)
      // there is no rest, so the chip never shows (11 s with no input)
      const goZone = (zone) => E(page, (a, w, zone) => {
        const Z = window.MMZones; const T = 32; const px = Math.floor(a.player.x / T), py = Math.floor(a.player.y / T);
        for (let r = 4; r < 400; r++) for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
          if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue; const tx = px + dx, ty = py + dy;
          if (tx < 2 || ty < 2 || tx >= w.world.w - 2 || ty >= w.world.h - 2) continue;
          if (Z.zoneInfoAt(w.world, tx + 0.5, ty + 0.5).zone !== zone) continue;
          if (w.solidAt && w.solidAt((tx + 0.5) * T, (ty + 0.5) * T)) continue;
          a.player.x = (tx + 0.5) * T; a.player.y = (ty + 0.5) * T; a._camStep(-1); return { tx, ty };
        }
        return null;
      }, zone);
      for (const zc of [{ zone: 1, name: 'Midlands', rests: true }, { zone: 2, name: 'Highlands', rests: false }]) {
        const spot = await goZone(zc.zone);
        await E(page, (a) => { a._idleT = 0; return true; });
        // the rest flag is recomputed on the next frame: wait for it to clear after the teleport so no stale Midlands sample is read here
        await page.waitForFunction(() => !window.__mm.arena.resting || window.__mm.arena.state !== 'play', null, { timeout: LS.budget(5000) }).catch(() => null);
        const t0 = await E(page, (a) => a.clock); let everShown = false; let idle = 0;
        while (true) { const c = await chip(page); everShown = everShown || c.shown; idle = c.idleT; const t = await E(page, (a) => a.clock); if (t - t0 >= 11 || (await E(page, (a) => a.state)) !== 'play') break; await page.waitForTimeout(400); }
        if (zc.rests) check(v.name + ': an idle hero on a Midlands tile rests and shows the chip (ID-51 zone <= 1)', !!spot && everShown, JSON.stringify({ spot, everShown, idle }));
        else check(v.name + ': an idle hero on a Highlands tile never shows the chip (idle >= 8 s there, no rest in zone 2+)', !!spot && !everShown && idle >= 8, JSON.stringify({ spot, everShown, idle }));
      }
    }
    check(v.name + ': no page errors, no database traffic (literal 0)', errors.length === 0 && db.attempts() === 0, errors.join(' | ') + ' db=' + db.attempts());
    await ctx.close();
  }
  await browser.close();
  done();
})();
