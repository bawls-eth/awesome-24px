// Cycle 10 S, ID-53 (approved by L and U in cycle 9, design/IDEAS.md): the just-in-time hint. Before this change a player who stopped getting
// rewards had no prompt at all (#rw-jhint did not exist), so every check below failed.
// Checked at 1280x720 with a real hero and real keys:
//  - an idle hero on the Shore rests (ID-51) and gets NO hint, even after 25 game seconds (never stacks with the Resting chip);
//  - on a Highlands tile (no rest there), after one real move and 20 game seconds with no reward, ONE line shows: role=status, aria-live
//    polite, a verb other than "move", >= 12 px text, a >= 44 px close button, inside the screen, clear of the ability bar, the help line,
//    the zone strip, the goal line and the minimap; a real Esc closes it and the Menu does NOT open;
//  - the next one comes after another 20 s; a real click on its close button closes it; max 3 per visit (no 4th after 25 s more);
// and at 390x844, 844x390 and 195x422 (touch; the line is placed by the same code, shown through the test hook): the touch wording, inside
// the screen, 40 px or more above both sticks, not on the ability grid, the zone strip, the goal line or the minimap, no sideways scroll.
// OFFLINE: blockDb + every WebSocket closed + the town page stubbed; literal 0 database attempts.
// Run: BASE=http://localhost:8440/game/index.html node game/tests/cyc10-s-jit-hint.test.js   (SHOTS=<dir> also saves screenshots)
const { chromium } = require('playwright');
const { check, done, blockDb } = require('./helpers');
const LS = require('./lib/load-scale');
const ORIGIN = (process.env.BASE || 'http://localhost:8440/game/index.html').replace(/\/game\/index\.html.*$/, '');
const URL = ORIGIN + '/game/games/mad-maze/index.html?mode=world&from=hub&test=1&seed=12345&heropick=0&tutorial=0&qdate=2030-05-01&firstend=0';
const E = (page, fn, arg) => page.evaluate(`(${fn.toString()})(window.__mm.arena, window.__mm.world, ${JSON.stringify(arg === undefined ? null : arg)})`);
const hint = (page) => page.evaluate(() => {
  const el = document.getElementById('rw-jhint'); const w = window.__mm.world; const st = w.jitHint ? w.jitHint.state() : null;
  if (!el) return { exists: false, st };
  const r = el.getBoundingClientRect(); const cs = getComputedStyle(el); const x = el.querySelector('button'); const xr = x ? x.getBoundingClientRect() : null;
  const shown = !el.classList.contains('hidden') && cs.display !== 'none' && r.width > 0;
  const vis = (e) => !!e && !e.classList.contains('hidden') && !e.hidden && e.getClientRects().length > 0 && getComputedStyle(e).display !== 'none' && e.style.display !== 'none';
  const hit = []; let stickGap = 1e9;
  ['realm-abilities', 'realm-help', 'rw-zone', 'rw-goal', 'rw-minimap', 'realm-stick-move', 'realm-stick-aim'].forEach((id) => {
    const e = document.getElementById(id); if (!vis(e) || !shown) return; const q = e.getBoundingClientRect(); if (q.width <= 0 || q.height <= 0) return;
    if (/stick/.test(id)) stickGap = Math.min(stickGap, q.top - r.bottom);
    if (q.left < r.right && q.right > r.left && q.top < r.bottom && q.bottom > r.top) hit.push(id);
  });
  return { exists: true, shown, st, text: el.textContent, role: el.getAttribute('role'), live: el.getAttribute('aria-live'), fs: parseFloat(getComputedStyle(el.querySelector('.rw-jhint-txt') || el).fontSize),
    x: xr ? { w: xr.width, h: xr.height, label: x.getAttribute('aria-label') } : null, hit, stickGap,
    inView: r.left >= -0.5 && r.top >= -0.5 && r.right <= innerWidth + 0.5 && r.bottom <= innerHeight + 0.5, hscroll: document.documentElement.scrollWidth > innerWidth + 1, panel: window.__mm.arena.panel || null };
});
const goZone = (page, zone) => E(page, (a, w, zone) => {
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
const okPlace = (h) => h.shown && h.inView && h.hit.length === 0 && !h.hscroll;

async function open(browser, v) {
  const ctx = await browser.newContext({ viewport: { width: v.view[0], height: v.view[1] }, hasTouch: v.touch, isMobile: v.touch });
  const db = await blockDb(ctx); await ctx.routeWebSocket(/.*/, (ws) => ws.close());
  await ctx.route('**/game/index.html*', (r) => r.fulfill({ contentType: 'text/html', body: '<!doctype html>town' }));
  const page = await ctx.newPage(); const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(URL);
  await page.waitForFunction(() => window.__mm && window.__mm.world && window.__mm.arena.active && window.__mm.arena.state === 'play', null, { timeout: LS.budget(40000) });
  await E(page, (a) => { a.player.iframes = 1e9; a._autoFire = false; return true; }); // survive, and never kill by itself (a kill is a reward)
  return { ctx, page, db, errors };
}
const step = async (page) => { await page.keyboard.down('d'); await page.waitForTimeout(80); await page.keyboard.up('d'); };
const waitHint = (page, ms) => page.waitForFunction(() => window.__mm.world.jitHint.state().on, null, { timeout: LS.budget(ms) }).then(() => true).catch(() => false);

(async () => {
  const browser = await chromium.launch();
  {
    const v = { view: [1280, 720], touch: false, name: '1280x720' };
    const s = await open(browser, v); const { page } = s;
    await step(page);
    const t0 = await E(page, (a) => a.clock);
    await page.waitForFunction((t) => window.__mm.arena.clock - t >= 25 || window.__mm.arena.state !== 'play', t0, { timeout: LS.budget(60000) }).catch(() => null);
    const h0 = await hint(page);
    check(v.name + ': the hint line exists (role=status, aria-live=polite); an idle hero on the Shore rests and gets NO hint after 25 s', h0.exists && h0.role === 'status' && h0.live === 'polite' && !h0.shown && h0.st.shown === 0 && h0.st.block === 'resting', JSON.stringify(h0));
    // Highlands: no rest there. One real move, then hands off: 20 game seconds with no reward -> one hint
    const spot = await goZone(page, 2);
    await E(page, (a) => { a.enemies.forEach((e) => { e.active = false; }); return true; });
    await step(page);
    const shownA = await waitHint(page, 70000);
    const h1 = await hint(page);
    check(v.name + ': on a Highlands tile, after one move and 20 s with no reward, ONE hint shows naming a verb other than "move"', !!spot && shownA && h1.shown && h1.st.shown === 1 && ['bag', 'ab', 'menu'].includes(h1.st.verb) && !/\bmove\b/i.test(h1.text) && h1.st.t >= 20, JSON.stringify(h1));
    check(v.name + ': >= 12 px text, a >= 44 px close button with a label, inside the screen, clear of the ability bar / help line / zone / goal / minimap', h1.fs >= 12 && h1.x && h1.x.w >= 44 && h1.x.h >= 44 && !!h1.x.label && okPlace(h1), JSON.stringify(h1));
    check(v.name + ': the desktop wording names a key (Q / Esc / drops), not a touch control', /Press Q|Press Esc|drops/.test(h1.text), h1.text);
    if (process.env.SHOTS) await page.screenshot({ path: process.env.SHOTS + '/cyc10-systems-jit-hint-1280x720.jpg', type: 'jpeg', quality: 60 }).catch(() => null);
    await page.keyboard.press('Escape'); await page.waitForTimeout(250);
    const h2 = await hint(page);
    check(v.name + ': a real Esc closes the hint and does NOT open the Menu', !h2.shown && h2.st.why === 'esc' && !h2.panel, JSON.stringify(h2));
    const shownB = await waitHint(page, 70000);
    const h3 = await hint(page);
    check(v.name + ': the next hint comes only after another 20 s, with a different verb', shownB && h3.st.shown === 2 && h3.st.verb !== h1.st.verb && h3.st.t >= 20 && okPlace(h3), JSON.stringify(h3));
    await page.click('#rw-jhint .rw-jhint-x'); await page.waitForTimeout(250);
    const h4 = await hint(page);
    check(v.name + ': a real click on the close button closes it', !h4.shown && h4.st.why === 'close', JSON.stringify(h4.st));
    const shownC = await waitHint(page, 70000);
    const h5 = await hint(page);
    await page.keyboard.press('Escape'); await page.waitForTimeout(250);
    const t1 = await E(page, (a) => a.clock);
    await page.waitForFunction((t) => window.__mm.arena.clock - t >= 25 || window.__mm.world.jitHint.state().on, t1, { timeout: LS.budget(70000) }).catch(() => null);
    const h6 = await hint(page);
    check(v.name + ': a 3rd hint, then none: max 3 per visit (no 4th after 25 more seconds)', shownC && h5.st.shown === 3 && !h6.shown && h6.st.shown === 3, JSON.stringify({ third: h5.st, after: h6.st }));
    check(v.name + ': no page errors, no database traffic (literal 0)', s.errors.length === 0 && s.db.attempts() === 0, s.errors.join(' | ') + ' db=' + s.db.attempts());
    await s.ctx.close();
  }
  for (const v of [{ view: [390, 844], touch: true, name: '390x844' }, { view: [844, 390], touch: true, name: '844x390' }, { view: [195, 422], touch: true, name: '195x422' }]) {
    const s = await open(browser, v); const { page } = s;
    await page.waitForTimeout(600);
    const on = await E(page, (a, w) => w.jitHint.showNow());
    const h = await hint(page);
    check(v.name + ': the hint shows with the touch wording (Tap / Open the Menu / drops)', on && h.shown && /Tap ability 1|Open the Menu|drops/.test(h.text), JSON.stringify(h));
    check(v.name + ': inside the screen, not on the ability grid, zone strip, goal line or minimap, no sideways scroll', okPlace(h), JSON.stringify(h));
    check(v.name + ': 40 px or more above both sticks, >= 12 px text, >= 44 px close button', h.stickGap >= 40 && h.fs >= 12 && h.x && h.x.w >= 44 && h.x.h >= 44, JSON.stringify(h));
    if (process.env.SHOTS) await page.screenshot({ path: process.env.SHOTS + '/cyc10-systems-jit-hint-' + v.name + '.jpg', type: 'jpeg', quality: 60 }).catch(() => null);
    check(v.name + ': no page errors, no database traffic (literal 0)', s.errors.length === 0 && s.db.attempts() === 0, s.errors.join(' | ') + ' db=' + s.db.attempts());
    await s.ctx.close();
  }
  await browser.close();
  done();
})();
