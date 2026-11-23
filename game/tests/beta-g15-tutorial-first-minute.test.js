// G-15 (b08-04): the Realm tutorial's first minute. While the coach is teaching there is no Raid / Swarm countdown (events start once it
// is done or skipped); the 'bag' step guarantees a bag within 6 tiles and says where it is; the fall panel ("Try again") is never under
// the coach card. Offline: blockDb + every WebSocket closed, town stubbed, no chat, no Firebase writes.
// Run: BASE=http://localhost:8440/game/index.html node game/tests/beta-g15-tutorial-first-minute.test.js
const { chromium } = require('playwright');
const { check, done, blockDb } = require('./helpers');
const ORIGIN = (process.env.BASE || 'http://localhost:8440/game/index.html').replace(/\/game\/index\.html.*$/, '');
const WORLD = ORIGIN + '/game/games/mad-maze/index.html?mode=world&test=1&offline=1&tutorial=1&seed=12345';
const A = (page, fn, arg) => page.evaluate(`(${fn.toString()})(window.__mm.arena, window.__mm.world, ${JSON.stringify(arg === undefined ? null : arg)})`);
const frames = (page, n) => page.evaluate((k) => new Promise((res) => { let i = 0; const f = () => (++i >= k ? res() : requestAnimationFrame(f)); requestAnimationFrame(f); }), n);

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  await blockDb(ctx); await ctx.routeWebSocket(/.*/, (ws) => ws.close());
  await ctx.route('**/game/index.html*', (r) => r.fulfill({ contentType: 'text/html', body: '<!doctype html>town' }));
  const page = await ctx.newPage(); const errors = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  await page.goto(ORIGIN + '/game/games/mad-maze/lantern.css');
  await page.evaluate(() => { localStorage.clear(); localStorage.setItem('mm-aim-assist', '0'); });
  await page.goto(WORLD);
  await page.waitForFunction(() => window.__mm && window.__mm.world && window.__mm.arena.active && window.__mm.arena.state === 'play' && window.__mmTutorial, null, { timeout: 30000 });
  await A(page, (a) => { a.player.iframes = 1e9; return true; });

  // 1: an event about to start (45 s away) shows no countdown while the coach is on
  const ev = await A(page, (a, w) => { for (let s = 0; s < 600; s++) { const l = MMZones.eventsFor(w.world, s * MMZones.EVENT_PERIOD); if (l.length) return { startsAt: l[0].startsAt }; } return null; });
  await A(page, (a, w, t) => { w.setEventClock(t); for (let i = 0; i < 6; i++) w.eventTick(); return true; }, ev.startsAt - 45);
  await frames(page, 3);
  const h1 = await A(page, (a, w) => ({ cur: window.__mmTutorial.current(), hud: w.eventHud(), banner: (document.getElementById('realm-banner') || {}).textContent || '' }));
  check('1. while the coach teaches, no Raid / Swarm countdown shows (event HUD hidden, no event banner)', h1.cur !== 'done' && h1.hud.hidden && !/Raid|Swarm/.test(h1.banner), JSON.stringify(h1));

  // 2: at the 'bag' step a bag exists within 6 tiles and the coach says where
  const b = await A(page, (a, w) => {
    const t = window.__mmTutorial; let n = 0;
    while (t.current() !== 'bag' && n++ < 6) { const c = t.current(); t.event(c === 'move' ? 'moved' : c === 'shoot' ? 'shot' : c === 'bag' ? '' : c); }
    a.bags.forEach((x) => { x.active = false; }); t.poll(); for (let i = 0; i < 9; i++) t.poll();
    const p = a.player; const near = a.bags.filter((x) => x.active && Math.hypot(x.x - p.x, x.y - p.y) <= 6 * 32);
    return { cur: t.current(), near: near.length, text: document.querySelector('#mm-coach .mm-coach-text').textContent };
  });
  check('2. at step "bag" a bag entity exists within 6 tiles of the hero', b.cur === 'bag' && b.near >= 1, JSON.stringify(b));
  check('2b. the coach says where the bag is', /A bag is close by/.test(b.text), b.text);

  // 3: the hero falls during the coach: the coach card hides, the fall panel's Try again is visible and focused
  await A(page, (a) => { a.player.iframes = 0; a._hitPlayer = undefined; a.player.hp = 1; a.state = 'play'; try { a._die ? a._die() : a.player.hp = 0; } catch (e) { /* fallback below */ } return true; });
  await page.waitForFunction(() => window.__mm.arena.state === 'dead', null, { timeout: 5000 }).catch(() => {});
  await page.waitForFunction(() => { const d = document.querySelector('#realm-death:not(.hidden) button[data-d="again"], button[data-d="again"]'); return d && d.getClientRects().length > 0; }, null, { timeout: 6000 }).catch(() => {});
  await frames(page, 6); await page.waitForTimeout(300);
  const f = await page.evaluate(() => {
    const coach = document.getElementById('mm-coach'); const again = document.querySelector('button[data-d="again"]');
    const r = again ? again.getBoundingClientRect() : null; const top = r ? document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2) : null;
    return { state: window.__mm.arena.state, coachHidden: !coach || coach.classList.contains('hidden'), again: !!again && r.height > 0, onTop: !!top && !!again && (top === again || again.contains(top)), focused: document.activeElement === again, text: again ? again.textContent : '' };
  });
  check('3. a fall during the coach: the coach card hides, "Try again" is visible, on top and focused', f.state === 'dead' && f.coachHidden && f.again && f.onTop && f.focused, JSON.stringify(f));

  // 4: after the coach is skipped, events start again
  const sk = await A(page, (a, w, t) => { const s = document.getElementById('mm-coach-skip'); s && s.click(); a.state = 'play'; w.setEventClock(t); for (let i = 0; i < 6; i++) w.eventTick(); return { cur: window.__mmTutorial.current(), hud: w.eventHud() }; }, ev.startsAt - 45);
  check('4. after Skip the event countdown shows again', sk.cur === 'done' && !sk.hud.hidden && /Raid|Swarm/.test(sk.hud.text), JSON.stringify(sk));
  check('no page errors', errors.length === 0, errors.join(' | '));
  await ctx.close(); await browser.close();
  done();
})().catch((e) => { console.error(e); process.exit(1); });
