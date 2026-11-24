// ID-14 hit pause (cycle 3 S): draw-only, 50 ms, only for hits >= 15 percent of max HP; the renderer keeps the last drawn frame while the
// sim (clock, bullets, timers) keeps running. Off under reduce motion and with ?hitpause=0.
// Method (Realm world page, blockDb, db.attempts() === 0): the rAF loop is stopped and _loop is driven by hand with the same synthetic
// timestamps twice, pause on and pause off, a big hit landing in the same frame. Checks: the dt sequence fed to _update, the sim clock
// (_stT), the hero HP and the enemy-bolt positions are IDENTICAL with pause on and off; with it on, exactly the frames within 50 ms after
// the hit skip _draw (2 at 60 fps); a small hit (< 15 percent) pauses nothing; reduce motion (mm-reduce-motion = '1') pauses nothing.
const { chromium } = require('playwright');
const { check, done, blockDb } = require('./helpers');
const ORIGIN = (process.env.BASE || 'http://localhost:8440/game/index.html').replace(/\/game\/index\.html.*$/, '');
const WORLD = ORIGIN + '/game/games/mad-maze/index.html?mode=world&test=1&offline=1&heropick=0&tutorial=0&seed=12345&qdate=2030-05-01';
const SAVE = { realm: { level: 4, xp: 0, shards: 50, bestWave: 2, items: [{ n: 1, id: 'sparkwand', r: 0 }], nextUid: 2, eq: { weapon: 1 } } };

async function open(browser, reduce, query) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  const db = await blockDb(ctx);
  await ctx.route('**/game/index.html*', (rt) => rt.fulfill({ contentType: 'text/html', body: '<!doctype html>town' }));
  const page = await ctx.newPage(); const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(ORIGIN + '/game/games/mad-maze/lantern.css');
  await page.evaluate((a) => { localStorage.clear(); localStorage.setItem('pixeltown-save-v1', a[0]); if (a[1]) localStorage.setItem('mm-reduce-motion', '1'); else localStorage.setItem('mm-reduce-motion', '0'); }, [JSON.stringify(SAVE), reduce]);
  await page.goto(WORLD + (query || ''));
  await page.waitForFunction(() => window.__mm && window.__mm.world && window.__mm.arena.active && window.__mm.arena.state === 'play', null, { timeout: 30000 });
  // stop the real frame loop: from here _loop runs only when the test calls it
  await page.evaluate(() => { const r = window.__mm.arena; window.requestAnimationFrame = () => 0; cancelAnimationFrame(r._raf); r._raf = 0; });
  return { ctx, page, errors, db };
}
// run N frames from a fixed start (same timestamps every run); `hitFrac` of max HP lands right after _update of frame `at`
function run(page, on, hitFrac) {
  return page.evaluate((a) => {
    const [on, hitFrac] = a; const r = window.__mm.arena;
    r._hitPauseOn = on; r._hitPauseAt = -1; r.hitPausedFrames = 0;
    const p = r.player; p.hp = r.stats.maxHp; p.iframes = 1e9; r.shield.hits = 0; // only the scripted hit lands
    r.eBullets.forEach((b) => { b.active = false; });
    for (let i = 0; i < 24; i++) { const b = r.eBullets[i]; b.active = true; b.x = p.x + 300 + i * 9; b.y = p.y - 200 + i * 7; b.vx = -40; b.vy = 25; b.life = 9; b.dm = 0; }
    const u0 = r._update, d0 = r._draw; const dts = []; let draws = 0; let frame = 0; const stT0 = r._stT;
    r._update = function (dt) { dts.push(Math.round(dt * 1e6)); u0.call(this, dt); if (frame === 6) { p.iframes = 0; this._hitPlayer(Math.max(1, Math.round(this.stats.maxHp * hitFrac))); p.iframes = 1e9; } };
    r._draw = function () { draws++; return d0.call(this); };
    r._lastT = 100000; const t0 = 100000;
    for (frame = 0; frame < 20; frame++) r._loop(t0 + (frame + 1) * (1000 / 60));
    r._update = u0; r._draw = d0;
    const bolts = r.eBullets.slice(0, 24).map((b) => [Math.round(b.x * 100), Math.round(b.y * 100), b.active ? 1 : 0]);
    return { dts: dts.join(','), stT: Math.round((r._stT - stT0) * 1e6), hp: p.hp, bolts: JSON.stringify(bolts), draws, paused: r.hitPausedFrames };
  }, [on, hitFrac]);
}

(async () => {
  const browser = await chromium.launch();
  const s = await open(browser, false);
  const off = await run(s.page, false, 0.3);
  const on = await run(s.page, true, 0.3);
  check('big hit (30 percent of max HP), pause OFF: every frame is drawn (20 of 20)', off.draws === 20 && off.paused === 0, JSON.stringify({ d: off.draws, p: off.paused }));
  check('big hit, pause ON: exactly the 2 frames within 50 ms after the hit skip the draw (18 of 20 drawn)', on.paused === 2 && on.draws === 18, JSON.stringify({ d: on.draws, p: on.paused }));
  check('the sim is identical with pause on and off: same dt sequence, sim clock, hero HP and all 24 enemy-bolt positions', on.dts === off.dts && on.stT === off.stT && on.hp === off.hp && on.bolts === off.bolts && on.hp < (await s.page.evaluate(() => window.__mm.arena.stats.maxHp)), JSON.stringify({ stOn: on.stT, stOff: off.stT, hpOn: on.hp, hpOff: off.hp, same: on.bolts === off.bolts }));
  const small = await run(s.page, true, 0.1);
  check('a small hit (10 percent < 15) pauses nothing', small.paused === 0 && small.draws === 20, JSON.stringify({ d: small.draws, p: small.paused }));
  check('no page errors', s.errors.length === 0, s.errors.join(' | '));
  check('0 DB requests', s.db.attempts() === 0);
  await s.ctx.close();
  const rm = await open(browser, true);
  const rmOn = await run(rm.page, true, 0.3);
  check('reduce motion on: a big hit pauses nothing (all 20 frames drawn)', rmOn.paused === 0 && rmOn.draws === 20 && (await rm.page.evaluate(() => window.__mm.arena._reduced)) === true, JSON.stringify({ d: rmOn.draws, p: rmOn.paused }));
  check('0 DB requests (reduce motion)', rm.db.attempts() === 0);
  await rm.ctx.close();
  const q = await open(browser, false, '&hitpause=0');
  check('?hitpause=0 turns it off', (await q.page.evaluate(() => window.__mm.arena._hitPauseOn)) === false);
  await q.ctx.close();
  await browser.close();
  done();
})().catch((e) => { console.error(e); process.exit(1); });
