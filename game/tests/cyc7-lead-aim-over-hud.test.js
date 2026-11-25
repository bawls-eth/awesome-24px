// cycle 7 L (1): desktop mouse aim keeps updating while the cursor is over a HUD overlay. #realm-abilities lies over the bottom of the
// canvas and realm.js listened for pointermove on the canvas only, so the aim froze there (found by the cycle-6 dungeon bot).
// Real browser, real mouse (page.mouse), 1280x720, the world page and the dungeon page. Touch pointers still never move the mouse aim,
// and a destroyed arena no longer hears the window listener.
// Offline: blockDb + every WebSocket closed, town stubbed. Never chats, never writes to Firebase.
// Run: BASE=http://localhost:9701/game/index.html NODE_PATH=$(npm root -g) node game/tests/cyc7-lead-aim-over-hud.test.js
const { chromium } = require('playwright');
const { check, done, blockDb } = require('./helpers');
const ORIGIN = (process.env.BASE || 'http://localhost:8440/game/index.html').replace(/\/game\/index\.html.*$/, '');
const PAGES = [['world', ORIGIN + '/game/games/mad-maze/index.html?mode=world&test=1&seed=4242&qdate=2030-05-01'], ['dungeon', ORIGIN + '/game/games/mad-maze/index.html?mode=dungeon&seed=5&test=1&offline=1']];
const SHOT = process.env.SHOT_DIR || '';

(async () => {
  const browser = await chromium.launch();
  for (const [label, url] of PAGES) {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
    const db = await blockDb(ctx); await ctx.routeWebSocket(/.*/, (ws) => ws.close());
    await ctx.route('**/game/index.html*', (r) => r.fulfill({ contentType: 'text/html', body: '<!doctype html>town' }));
    const page = await ctx.newPage(); const errors = [];
    page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
    await page.goto(ORIGIN + '/game/games/mad-maze/lantern.css');
    await page.evaluate(() => { localStorage.clear(); localStorage.setItem('mm-aim-assist', '0'); });
    await page.goto(url);
    await page.waitForFunction(() => window.__mm && window.__mm.arena && window.__mm.arena.active && window.__mm.arena.state === 'play', null, { timeout: 30000 });
    await page.waitForTimeout(400);
    // a button of the ability bar that lies over the canvas, and what the arena should read there
    const geo = await page.evaluate((want) => {
      const a = window.__mm.arena; const c = a.canvas.getBoundingClientRect();
      // world: the bar lies over the bottom of the canvas. dungeon (desktop): it is a column left of the letterboxed canvas, where the
      // canvas-only listener lost the cursor the same way. Either way the point is NOT the canvas.
      const all = [...document.querySelectorAll('#realm-abilities .realm-ab')].map((b) => b.getBoundingClientRect()).filter((r) => r.width > 0);
      const mid = (r) => ({ mx: r.left + r.width / 2, my: r.top + r.height / 2 });
      const btn = all.find((r) => { const m = mid(r); return m.mx > c.left + 12 && m.mx < c.right - 12 && m.my > c.top + 12 && m.my < c.bottom - 12; }) || (want === 'dungeon' ? all[0] : null);
      if (!btn) return null;
      const x = Math.round(btn.left + btn.width / 2), y = Math.round(btn.top + btn.height / 2); const top = document.elementFromPoint(x, y);
      return { x, y, overHud: !!top && top !== a.canvas && !!top.closest('#realm-abilities'), c: { l: c.left, t: c.top, w: c.width, h: c.height }, vw: a._dv ? a._dv.vw : a.W, H: a.H, onCanvas: x > c.left && x < c.right && y > c.top && y < c.bottom };
    }, label);
    check(`${label} 1. an ability button ${label === 'world' ? 'lies over the canvas and' : ''} is the top element at its centre (not the canvas)`, !!geo && geo.overHud && (label !== 'world' || geo.onCanvas), JSON.stringify(geo));
    if (!geo) { await ctx.close(); continue; }
    const want = (x, y) => ({ x: ((x - geo.c.l) / geo.c.w) * geo.vw, y: ((y - geo.c.t) / geo.c.h) * geo.H });
    const read = () => page.evaluate(() => { const m = window.__mm.arena.mouse; return { x: m.x, y: m.y, seen: !!m.seen, down: !!m.down }; });
    const near = (m, w) => Math.abs(m.x - w.x) < 1.5 && Math.abs(m.y - w.y) < 1.5;
    // (a) on the open canvas: the baseline that always worked
    const cx = Math.round(geo.c.l + geo.c.w * 0.5), cy = Math.round(geo.c.t + geo.c.h * 0.3);
    await page.mouse.move(cx, cy); await page.waitForTimeout(60);
    const m0 = await read();
    check(`${label} 2. the mouse over the open canvas sets the arena mouse position`, m0.seen && near(m0, want(cx, cy)), JSON.stringify({ m0, want: want(cx, cy) }));
    // (b) onto the ability bar: the arena mouse must follow
    await page.mouse.move(geo.x, geo.y, { steps: 6 }); await page.waitForTimeout(60);
    const m1 = await read();
    check(`${label} 3. the mouse over the ability bar still moves the arena mouse position`, near(m1, want(geo.x, geo.y)) && (Math.abs(m1.x - m0.x) > 5 || Math.abs(m1.y - m0.y) > 5), JSON.stringify({ m0, m1, want: want(geo.x, geo.y) }));
    if (SHOT) await page.screenshot({ path: `${SHOT}/cyc7-lead-aim-${label}-1280.jpg`, type: 'jpeg', quality: 70 });
    // (c) along the bar: every step tracked
    await page.mouse.move(geo.x + 9, geo.y - 5); await page.waitForTimeout(60);
    const m2 = await read();
    check(`${label} 4. a further move on the bar is tracked too`, near(m2, want(geo.x + 9, geo.y - 5)), JSON.stringify({ m2, want: want(geo.x + 9, geo.y - 5) }));
    check(`${label} 5. hovering the bar never starts firing`, !m2.down, JSON.stringify(m2));
    // (d) a touch pointer never moves the mouse aim (the sticks own touch)
    await page.evaluate(() => window.dispatchEvent(new PointerEvent('pointermove', { pointerType: 'touch', clientX: 40, clientY: 40, bubbles: true })));
    const m3 = await read();
    check(`${label} 6. a touch pointermove leaves the mouse aim alone`, m3.x === m2.x && m3.y === m2.y, JSON.stringify({ m2, m3 }));
    // (e) a destroyed arena no longer listens on the window
    const dead = await page.evaluate(() => {
      const box = document.createElement('div'); document.body.appendChild(box);
      const second = new RealmArena({ container: box, save: {}, onSave: () => {}, onExit: () => {} });
      window.dispatchEvent(new PointerEvent('pointermove', { pointerType: 'mouse', clientX: 300, clientY: 300 }));
      const heard = !!second.mouse.seen; second.mouse.seen = false;
      second.destroy();
      window.dispatchEvent(new PointerEvent('pointermove', { pointerType: 'mouse', clientX: 320, clientY: 310 }));
      const after = !!second.mouse.seen; box.remove();
      return { heard, after };
    });
    check(`${label} 7. destroy() removes the window pointermove listener`, dead.heard && !dead.after, JSON.stringify(dead));
    check(`${label} no page errors`, errors.length === 0, errors.join(' | '));
    check(`${label} offline: no database traffic`, db.attempts() === 0, String(db.attempts()));
    await ctx.close();
  }
  await browser.close();
  done();
})().catch((e) => { console.error(e); process.exit(1); });
