// TG3: enemy telegraphs + colour-blind bullets in the world arena. Tier 3+ world enemies (Highlands / Godlands) and world bosses show a
// ring / line / cone wind-up (MMTelegraph.forVolley: 0.35 s, bosses 0.6 s) over the last part of their existing volley cooldown, so the
// bullet budget and timing are unchanged; tier 1-2 never telegraph; reduce motion makes them static; ?telegraph=0 turns them off.
// A colour-blind MMAccess palette (`pixeltown-access-v1`) recolours enemy bullets with a 2 px outline (bulletOutline); flashes off drops
// the red hit vignette. Offline: WebSockets closed, town/hub pages stubbed, no chat, no DB writes.
// Run: BASE=http://localhost:8661/game/index.html NODE_PATH=$(npm root -g) node game/tests/telegraph-arena.test.js   (SHOTS=<dir> saves a phone screenshot)
const { chromium } = require('playwright');
const { check, done } = require('./helpers');
const ORIGIN = (process.env.BASE || 'http://localhost:8440/game/index.html').replace(/\/game\/index\.html.*$/, '');
const WORLD = ORIGIN + '/game/games/mad-maze/index.html?mode=world&test=1&seed=12345';
const MM = 'pixeltown-mm-v1', ACTIVE = 'pixeltown-mm-active-v1', ACC = 'pixeltown-access-v1';
const hero = (id, cls, level) => ({ id, name: cls, cls, level, xp: 0, fame: 0, bonus: 0, mode: 'classic', items: [] });
const prof = (heroes) => ({ v: 1, heroes, stash: new Array(16).fill(null), fame: 0, mode: 'classic', hall: [], migratedFrom: null });

async function open(browser, query, opts, acc) {
  const ctx = await browser.newContext(opts || { viewport: { width: 1000, height: 700 } });
  await ctx.route('**/game/index.html*', (r) => r.fulfill({ contentType: 'text/html', body: '<!doctype html><title>town</title>town' }));
  await ctx.route('**/hub/index.html*', (r) => r.fulfill({ contentType: 'text/html', body: '<!doctype html><title>hub</title>hub' }));
  await ctx.routeWebSocket(/.*/, (ws) => ws.close()); // never reach the live DB
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  await page.goto(ORIGIN + '/game/games/mad-maze/lantern.css');
  await page.evaluate(([k1, p, k2, a, k3, ac]) => { localStorage.setItem(k1, JSON.stringify(p)); localStorage.setItem(k2, a); if (ac) localStorage.setItem(k3, ac); else localStorage.removeItem(k3); localStorage.setItem('mm-reduce-motion', '0'); },
    [MM, prof([hero('h-r', 'ranger', 6)]), ACTIVE, JSON.stringify({ v: 1, heroId: 'h-r' }), ACC, acc ? JSON.stringify(acc) : null]);
  errors.length = 0;
  await page.goto(WORLD + (query || ''));
  await page.waitForFunction(() => window.__mm && window.__mm.arena && window.__mm.arena.active && window.__mm.arena.state === 'play' && typeof MMTelegraph !== 'undefined' && typeof MMAccess !== 'undefined', null, { timeout: 15000 });
  // Freeze the real-time loop: every step below is a fixed-dt _update, so results never depend on the headless frame rate.
  await page.evaluate(() => { const a = window.__mm.arena; a.active = false; cancelAnimationFrame(a._raf); a.paused = false; a.player.iframes = 1e9; a.refreshAccess(); a._readReduced(); });
  return { ctx, page, errors };
}

// One quiet enemy of `type` / zone tier `tier` 160 px right of the hero, its volley `cd` seconds away; nothing else alive.
const SETUP = `(a, type, tier, cd, boss) => {
  a.enemies.forEach((q) => { q.active = false; }); a.eBullets.forEach((b) => { b.active = false; });
  const p = a.player; const e = a.spawnEnemy(type, p.x + 160, p.y);
  e.hp = e.maxHp = 1e6; e.tier = tier; e.zone = tier; e.cd = cd; e.spdMul = 0;
  if (boss) { e.bossTier = 3; e.phase = 1; e.invuln = 0; e.cd = 99; e.cd2 = cd; e.ax = e.x; e.ay = e.y; }
  a._camStep(-1); return e;
}`;
const step = `(a, n) => { for (let i = 0; i < n; i++) { a._update(1 / 60); a.enemies.forEach((q) => { if (q !== window.__e && q.active) q.active = false; }); } }`;

(async () => {
  const browser = await chromium.launch();
  const errs = [];

  // ---- desktop, telegraphs on ----
  { const A = await open(browser); const page = A.page;
    const t = await page.evaluate(`(() => { const a = window.__mm.arena; const setup = ${SETUP}; const st = ${step};
      const out = {};
      window.__e = setup(a, 'aimed', 2, 0.5); st(a, 6); out.early = a.telegraphOf(window.__e);
      st(a, 9); out.line = a.telegraphOf(window.__e); out.started = a.tgStarted; a._draw(); out.drawn = a.tgDrawn;
      window.__e = setup(a, 'aimed', 0, 0.5); st(a, 15); out.shore = a.telegraphOf(window.__e);
      window.__e = setup(a, 'ring', 3, 0.3); st(a, 2); out.ring = a.telegraphOf(window.__e);
      window.__e = setup(a, 'boss', 3, 0.5, true); st(a, 2); out.boss = a.telegraphOf(window.__e);
      return out; })()`);
    check('a tier-3 Sniper shows a line wind-up only inside the last 0.35 s of its cooldown (none at 0.4 s left)', t.early === null && t.line && t.line.shape === 'line' && t.line.windup === 0.35 && t.line.progress > 0 && t.line.progress < 1 && t.started >= 1 && t.drawn === 1, JSON.stringify(t));
    check('a Shore (tier 1) Sniper never telegraphs; a Godlands Burster shows a ring; a world boss shows a 0.6 s cone before its fan', t.shore === null && t.ring && t.ring.shape === 'ring' && t.boss && t.boss.shape === 'cone' && t.boss.windup === 0.6, JSON.stringify(t));
    check('telegraphs pulse with motion on (the ring tightens as the wind-up ends)', t.line.pulse === true && t.line.scale > 1 && t.boss.pulse === true, JSON.stringify(t.line));

    // bullet budget: the same Sniper fires the same bolts at the same frames with and without telegraphs
    const budget = await page.evaluate(`(() => { const a = window.__mm.arena; const setup = ${SETUP}; const st = ${step};
      const run = (off) => { a._tgOff = off; window.__e = setup(a, 'aimed', 3, 0.6); const shots = []; const f0 = a.fireEnemyBullet; let fr = 0;
        a.fireEnemyBullet = function (x, y, ang, sp, k) { if (a._curE === window.__e) shots.push(fr + ':' + Math.round(ang * 100)); return f0.call(this, x, y, ang, sp, k); };
        for (fr = 0; fr < 240; fr++) st(a, 1); a.fireEnemyBullet = f0; return { shots, started: a.tgStarted }; };
      const s0 = a.tgStarted; const on = run(false); const n1 = a.tgStarted - s0; const off = run(true); const n2 = a.tgStarted - s0 - n1; a._tgOff = false;
      return { on: on.shots, off: off.shots, n1, n2 }; })()`);
    check('bullet budget unchanged: identical shots (count, frame, angle) with telegraphs on and off; wind-ups counted only when on', budget.on.length >= 6 && budget.on.join() === budget.off.join() && budget.n1 >= 2 && budget.n2 === 0, JSON.stringify(budget));

    // reduce motion: static (no pulse, fixed size and alpha through the whole wind-up)
    const rm = await page.evaluate(`(() => { const a = window.__mm.arena; const setup = ${SETUP}; const st = ${step};
      localStorage.setItem('mm-reduce-motion', '1'); a._readReduced();
      window.__e = setup(a, 'ring', 3, 0.34); st(a, 2); const t1 = a.telegraphOf(window.__e); st(a, 12); const t2 = a.telegraphOf(window.__e);
      localStorage.setItem('mm-reduce-motion', '0'); a._readReduced(); return { t1, t2 }; })()`);
    check('reduce motion: the telegraph is static (no pulse; same size and alpha early and late in the wind-up)', rm.t1 && rm.t2 && rm.t1.pulse === false && rm.t1.scale === 1 && rm.t2.scale === 1 && rm.t1.alpha === rm.t2.alpha && rm.t2.progress > rm.t1.progress, JSON.stringify(rm));

    // flashes on (default): a hit paints the red vignette; flashes off (pref) paints nothing
    const fl = await page.evaluate((k) => {
      const a = window.__mm.arena; a.enemies.forEach((q) => { q.active = false; }); a.shake = 0;
      const px = () => { const g = a.canvas.getContext('2d'); return Array.from(g.getImageData(2, Math.floor(a.canvas.height / 2), 1, 1).data); };
      a.flash = 0; a._draw(); const p0 = px();
      a.flash = 1; a._draw(); const p1 = px();
      localStorage.setItem(k, JSON.stringify({ v: 1, palette: 'normal', hudScale: 1, flashes: false, bulletOutline: true, lowGfx: false })); a.refreshAccess();
      a.flash = 1; a._draw(); const p2 = px(); a.flash = 0;
      localStorage.removeItem(k); a.refreshAccess();
      return { p0, p1, p2, on: a._flashesOn() };
    }, ACC);
    const diff = (x, y) => Math.max(...x.slice(0, 3).map((v, i) => Math.abs(v - y[i])));
    check('flashes: the hit vignette tints the screen edge; with flashes off the same hit leaves it untouched', diff(fl.p1, fl.p0) > 15 && diff(fl.p2, fl.p0) <= 4 && fl.on === true, JSON.stringify(fl));
    errs.push(...A.errors); await A.ctx.close(); }

  // ---- colour-blind palette: bullets take its colours plus a 2 px dark outline; telegraphs take its enemy colour ----
  { const C = await open(browser, '', null, { v: 1, palette: 'deuteranopia', hudScale: 1, flashes: true, bulletOutline: true, lowGfx: false }); const page = C.page;
    const cb = await page.evaluate(`(() => { const a = window.__mm.arena; const setup = ${SETUP}; const st = ${step};
      a.enemies.forEach((q) => { q.active = false; }); a.eBullets.forEach((b) => { b.active = false; }); a.shake = 0;
      const c = a.camera; const b = a.eBullets[0]; b.active = true; b.kind = 0; b.x = Math.round(c.x + a.W / 2 + 150); b.y = Math.round(c.y + a.H / 2 - 120); b.vx = 0; b.vy = 0; b.life = 9;
      a._draw(); const g = a.canvas.getContext('2d'); const s = a.scale; const sx = (b.x - c.x) * s, sy = (b.y - c.y) * s;
      const at = (dx) => Array.from(g.getImageData(Math.round(sx + dx * s), Math.round(sy), 1, 1).data);
      const out = { mid: at(0), rim: at(6.9), pal: MMAccess.palette('deuteranopia') };
      window.__e = setup(a, 'aimed', 3, 0.3); st(a, 2); out.tg = a.telegraphOf(window.__e);
      return out; })()`);
    const hex = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
    const near = (px, h, tol) => hex(h).every((v, i) => Math.abs(v - px[i]) <= tol);
    check('colour-blind palette: an aimed enemy bullet is drawn in the palette colour (#ffd92f) ...', near(cb.mid, cb.pal.bullet, 12), JSON.stringify(cb));
    check('... with a dark 2 px outline at its rim', cb.rim[0] + cb.rim[1] + cb.rim[2] < 120, JSON.stringify(cb.rim));
    check('telegraphs use the palette enemy colour', cb.tg && cb.tg.color === cb.pal.enemy, JSON.stringify(cb.tg));
    const no = await page.evaluate((k) => { const a = window.__mm.arena; localStorage.setItem(k, JSON.stringify({ v: 1, palette: 'deuteranopia', hudScale: 1, flashes: true, bulletOutline: false, lowGfx: false })); a.refreshAccess(); const c1 = a._ebCB[0]; const px = Array.from(c1.getContext('2d').getImageData(15, 8, 1, 1).data); localStorage.setItem(k, '{"palette":"normal"}'); a.refreshAccess(); return { px, cleared: a._ebCB === null }; }, ACC);
    check('bulletOutline off: no outline ring; the normal palette restores the usual bullets', no.px[3] === 0 && no.cleared === true, JSON.stringify(no));
    errs.push(...C.errors); await C.ctx.close(); }

  // ---- ?telegraph=0: no wind-ups at all ----
  { const O = await open(browser, '&telegraph=0'); const page = O.page;
    const o = await page.evaluate(`(() => { const a = window.__mm.arena; const setup = ${SETUP}; const st = ${step};
      window.__e = setup(a, 'aimed', 3, 0.3); st(a, 10); const t1 = a.telegraphOf(window.__e);
      window.__e = setup(a, 'boss', 3, 0.5, true); st(a, 10); const t2 = a.telegraphOf(window.__e); a._draw();
      return { t1, t2, started: a.tgStarted, drawn: a.tgDrawn }; })()`);
    check('?telegraph=0: no telegraph for a Godlands Sniper or a world boss, nothing counted or drawn', o.t1 === null && o.t2 === null && o.started === 0 && o.drawn === 0, JSON.stringify(o));
    errs.push(...O.errors); await O.ctx.close(); }

  // ---- phone 390x844: a ring telegraph on screen, no horizontal scroll ----
  { const P = await open(browser, '', { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true }); const page = P.page;
    const ph = await page.evaluate(`(() => { const a = window.__mm.arena; const setup = ${SETUP}; const st = ${step};
      window.__e = setup(a, 'ring', 3, 0.3); window.__e.y -= 140; window.__e.x -= 160; st(a, 8); a._draw();
      return { t: a.telegraphOf(window.__e), drawn: a.tgDrawn, sw: document.documentElement.scrollWidth, iw: window.innerWidth }; })()`);
    check('phone: the ring telegraph is drawn and the page has no horizontal scroll', ph.t && ph.t.shape === 'ring' && ph.drawn === 1 && ph.sw <= ph.iw, JSON.stringify(ph));
    if (process.env.SHOTS) await page.screenshot({ path: require('path').join(process.env.SHOTS, 'telegraph-phone-390x844.png') });
    errs.push(...P.errors); await P.ctx.close(); }

  check('no console errors', errs.length === 0, errs.join(' | '));
  await browser.close();
  done();
})();
