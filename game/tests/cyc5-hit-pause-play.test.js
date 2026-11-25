// cyc5 S (b01-r3: "ID-14 hit pause NOT VERIFIED", no big hit could be provoked by playing). Gameplay-level proof that the hit pause fires:
// the real rAF loop runs untouched, a Lv 1 hero stands still 160 px south of a Godlands (zone 3) altar boss and is hit by the
// boss's REAL bolts (no _hitPlayer calls, no HP edits, no synthetic frames). Checks: a hit of at least 12 percent of max HP lands; the
// hit pause counter goes up for that hit; no _draw call happens in the 50 ms after it while the page's own rAF keeps ticking; the sim
// clock keeps running through it. With reduce motion on, the same real big hit pauses nothing. An extra info line prints the biggest
// hit share a level-matched hero (Lv 16 in zone 3) takes in 8 s, which explains why b01 never saw it fire (not a check: tuning is D's).
// Offline: blockDb + every WebSocket closed, town stubbed; db.attempts() === 0. No chat, no writes.
// Run: BASE=http://localhost:8440/game/index.html node game/tests/cyc5-hit-pause-play.test.js
const { chromium } = require('playwright');
const { check, done, blockDb } = require('./helpers');
const ORIGIN = (process.env.BASE || 'http://localhost:8440/game/index.html').replace(/\/game\/index\.html.*$/, '');
const WORLD = ORIGIN + '/game/games/mad-maze/index.html?mode=world&test=1&offline=1&heropick=0&tutorial=0&seed=12345&qdate=2030-05-01';
const save = (lv) => JSON.stringify({ realm: { level: lv, xp: 0, shards: 50, bestWave: 2, items: [{ n: 1, id: 'sparkwand', r: 0 }], nextUid: 2, eq: { weapon: 1 } } });

async function play(browser, lv, reduce, ms) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  const db = await blockDb(ctx); await ctx.routeWebSocket(/.*/, (ws) => ws.close());
  await ctx.route('**/game/index.html*', (rt) => rt.fulfill({ contentType: 'text/html', body: '<!doctype html>town' }));
  const page = await ctx.newPage(); const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(ORIGIN + '/game/games/mad-maze/lantern.css');
  await page.evaluate((a) => { localStorage.clear(); localStorage.setItem('pixeltown-save-v1', a[0]); localStorage.setItem('mm-reduce-motion', a[1] ? '1' : '0'); localStorage.setItem('mm-aim-assist', '0'); }, [save(lv), reduce]);
  await page.goto(WORLD);
  await page.waitForFunction(() => window.__mm && window.__mm.world && window.__mm.arena.active && window.__mm.arena.state === 'play', null, { timeout: 30000 });
  // read-only probes: every draw time, every rAF tick of the page, and each HP drop (seen per frame from outside the game)
  const out = await page.evaluate((ms) => new Promise((res) => {
    const a = window.__mm.arena, w = window.__mm.world;
    const site = w.bossSites().find((s) => s.zone === 3); const T = a.world.tile;
    a.player.x = site.x * T + T / 2; a.player.y = site.y * T + T / 2 + 160; a.player.iframes = 0;
    const draws = []; const d0 = a._draw; a._draw = function () { draws.push(performance.now()); return d0.apply(this, arguments); };
    const ticks = []; const hits = []; let hp = a.player.hp; let pf = a.hitPausedFrames; // ticks: [rAF time, draws so far, pause frames so far]
    const t0 = performance.now();
    const f = (now) => {
      ticks.push([now, draws.length, a.hitPausedFrames]);
      const h = a.player.hp;
      if (h < hp) hits.push({ t: now, i: ticks.length - 1, dmg: Math.round(hp - h), frac: (hp - h) / a.stats.maxHp, pf0: pf, clock: a.clock });
      hp = h; pf = a.hitPausedFrames;
      if (now - t0 < ms && a.state === 'play' && !hits.some((x) => x.frac >= 0.12 && now - x.t > 300)) { requestAnimationFrame(f); return; }
      a._draw = d0;
      const big = hits.find((x) => x.frac >= 0.12) || null;
      let win = null;
      if (big) { // the game's rAF callback runs before this one each frame: the hit frame was drawn; then each paused frame adds a pause and no draw
        let j = big.i + 1, paused = 0, drawnWhilePaused = 0;
        while (j < ticks.length && ticks[j][2] > ticks[j - 1][2]) { paused++; drawnWhilePaused += ticks[j][1] - ticks[j - 1][1]; j++; }
        win = { pausedTicks: paused, drawnWhilePaused, pauseMs: paused && j - 1 > big.i ? Math.round(ticks[j - 1][0] - ticks[big.i][0]) : 0, pfAfter: a.hitPausedFrames, pfBefore: big.pf0, clockNow: a.clock, clockAtHit: big.clock, drawsAfter: ticks[ticks.length - 1][1] - (ticks[j - 1] ? ticks[j - 1][1] : 0) };
      }
      res({ maxHp: a.stats.maxHp, reduced: a._reduced, on: a._hitPauseOn, hits: hits.map((x) => [x.dmg, +x.frac.toFixed(3)]), big: big ? [big.dmg, +big.frac.toFixed(3)] : null, win, maxFrac: hits.reduce((m, x) => Math.max(m, x.frac), 0) });
    };
    requestAnimationFrame(f);
  }), ms);
  const n = db.attempts();
  await ctx.close();
  return { out, errors, db: n };
}

(async () => {
  const browser = await chromium.launch();
  const A = await play(browser, 1, false, 20000);
  const o = A.out; const w = o.win || {};
  check('a real boss bolt lands a hit of at least 12 percent of max HP on a still Lv 1 hero in the Godlands', !!o.big, JSON.stringify({ maxHp: o.maxHp, hits: o.hits }));
  check('the hit pause fires for that hit (hitPausedFrames goes up)', !!o.big && w.pfAfter > w.pfBefore, JSON.stringify(w));
  check('right after the big hit 1-4 real frames tick with no draw (the canvas holds the frame for about 50 ms)', !!o.big && w.pausedTicks >= 1 && w.pausedTicks <= 4 && w.drawnWhilePaused === 0 && w.pauseMs <= 70, JSON.stringify(w));
  check('drawing resumes after the pause and the sim clock kept running through it', !!o.big && w.drawsAfter > 0 && w.clockNow > w.clockAtHit, JSON.stringify(w));
  check('no page errors (pause on)', A.errors.length === 0, A.errors.join(' | '));
  check('0 DB requests (pause on)', A.db === 0);

  const R = await play(browser, 1, true, 20000);
  const r = R.out; const rw = r.win || {};
  check('reduce motion on: the same kind of real big hit lands and pauses nothing (every frame drawn)', r.reduced === true && !!r.big && rw.pfAfter === 0 && rw.pausedTicks === 0, JSON.stringify({ big: r.big, w: rw }));
  check('0 DB requests (reduce motion)', R.db === 0);

  const M = await play(browser, 16, false, 8000);
  console.log('INFO level-matched Lv 16 hero in zone 3: max HP ' + M.out.maxHp + ', hits ' + JSON.stringify(M.out.hits.slice(0, 12)) + ', biggest share ' + (M.out.maxFrac * 100).toFixed(1) + ' percent (threshold 12)');
  check('0 DB requests (info run)', M.db === 0);
  await browser.close();
  done();
})().catch((e) => { console.error(e); process.exit(1); });
