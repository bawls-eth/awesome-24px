// Cycle 2 D: Trial of Six bot. Fires through the REAL input path (page.mouse.move for aim, keyboard Space held to fire, keyboard WASD to move),
// dodges enemy bolts by short-horizon lookahead (9 move options, 0.45 s), orbits the boss at ~240 px. Offline (blockDb-style abort + WebSocket close), 0 DB requests.
// Run: BASE_ORIGIN=http://localhost:9734 NODE_PATH=$(npm root -g) node trial-bot.js <level> <rarity> <trials>
const { chromium } = require('playwright');
const ORIGIN = process.env.BASE_ORIGIN || 'http://localhost:9734';
const WORLD = ORIGIN + '/game/games/mad-maze/index.html?mode=world&test=1&seed=12345&qdate=2030-05-01';
// cyc5 D: optional human-skill knobs (all default to the old bot): SLOW_MS extra wait per loop (a human is ~30 Hz), MARGIN dodge radius px (34),
// ORBIT preferred boss distance px (240), STEPS fights to play (6), HUMAN_MS reaction delay is SLOW_MS; none of them touches the game.
const SLOW_MS = +process.env.SLOW_MS || 0, MARGIN = +process.env.MARGIN || 34, ORBIT = +process.env.ORBIT || 240, STEPS = +process.env.STEPS || 6;
const LEVEL = +process.argv[2] || 20, RAR = +process.argv[3] || 0, TRIALS = +process.argv[4] || 2;
const sv = { realm: { level: LEVEL, xp: 0, shards: 50, bestWave: 2, items: [{ n: 1, id: 'sparkwand', r: RAR }], nextUid: 2, eq: { weapon: 1 }, gv: 1, gp: { b: 0, d: 0 } } };
const E = (page, fn, arg) => page.evaluate(`(${fn.toString()})(window.__mm.arena, window.__mm.world, ${JSON.stringify(arg)})`);
(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1000, height: 700 } });
  let db = 0;
  await ctx.route(/firebase|googleapis|gstatic\.com\/firebasejs/, (r) => { db++; r.abort(); });
  await ctx.routeWebSocket(/.*/, (ws) => ws.close());
  await ctx.route('**/game/index.html*', (r) => r.fulfill({ contentType: 'text/html', body: '<!doctype html>town' }));
  const page = await ctx.newPage(); const errs = [];
  page.on('pageerror', (e) => errs.push(e.message));
  await page.goto(ORIGIN + '/game/games/mad-maze/lantern.css');
  await page.evaluate(([v, w]) => { localStorage.clear(); localStorage.setItem('pixeltown-save-v1', v); localStorage.setItem('pixeltown-realm-v1', w); localStorage.setItem('mm-aim-assist', '0'); }, [JSON.stringify(sv), JSON.stringify({ gp: sv.realm.gp })]);
  await page.goto(WORLD);
  await page.waitForFunction(() => window.__mm && window.__mm.world && window.__mm.arena.active && window.__mm.arena.state === 'play', null, { timeout: 30000 });
  // Cycle 3 instrumentation: count REAL _hitPlayer calls (hits that the hp delta could miss: shield soaks, hurtGuard floor) and every bolt-to-hero distance.
  await page.evaluate(() => { const a = window.__mm.arena; window.__hp = { calls: 0, shield: 0, dmgs: [] }; const o = a._hitPlayer.bind(a); a._hitPlayer = function (d) { window.__hp.calls++; if (a.shield && a.shield.hits > 0) window.__hp.shield++; window.__hp.dmgs.push(d); return o(d); }; });
  await page.mouse.move(500, 300);
  const out = [];
  const held = new Set();
  async function key(k, on) { if (on && !held.has(k)) { held.add(k); await page.keyboard.down(k); } else if (!on && held.has(k)) { held.delete(k); await page.keyboard.up(k); } }
  for (let t = 0; t < TRIALS; t++) {
    await E(page, (a, w) => { a.player.hp = a.stats.maxHp; a.player.iframes = 0; });
    const started = await E(page, (a, w) => w.rush.start());
    if (!started) { out.push({ error: 'start refused' }); break; }
    const trial = { t, fights: [] };
    for (let step = 0; step < STEPS; step++) {
      await E(page, (a, w) => { const s = w.rush.state(); if (s.phase === 'rest') w.rush.next(); });
      await page.waitForTimeout(200);
      const info = await E(page, (a, w) => { const e = w.rush.entity(); return e ? { boss: e.art, hp: e.maxHp, hp0: a.player.hp, maxHp: a.stats.maxHp, dmgMul: e.dmgMul } : null; });
      if (!info) { trial.fights.push({ step, error: 'no boss' }); break; }
      const t0 = Date.now(); let dmg = 0, last = info.hp0, hits = 0, outcome = 'timeout', n = 0; const sec = {}; let minD = 1e9, nearMiss = 0, prR = 0, seenIds = new Set(); await page.evaluate(() => { window.__hp.calls = 0; window.__hp.shield = 0; window.__hp.dmgs = []; });
      while (Date.now() - t0 < 100000) {
        const s = await E(page, (a, w) => {
          const e = w.rush.entity(); const st = w.rush.state(); const p = a.player;
          const cr = a.canvas.getBoundingClientRect();
          const bl = []; let live = 0, md = 1e9; for (const b of a.eBullets) if (b.active) { live++; const d = Math.hypot(b.x - p.x, b.y - p.y); if (d < md) md = d; if (d < 260) bl.push([b.x, b.y, b.vx, b.vy]); }
          return { live, md, pr: 14 + 4, alive: !!e && e.active, hp: p.hp, st, ex: e ? e.x : 0, ey: e ? e.y : 0, px: p.x, py: p.y, cx: a.camera.x, cy: a.camera.y, cw: cr.width, ch: cr.height, cl: cr.left, ct: cr.top, W: a._dv ? a._dv.vw : a.W, H: a.H, bl, dead: a.state === 'dead' || !st.on };
        });
        if (s.dead) { outcome = 'died'; break; }
        if (s.st.phase !== 'fight' || !s.alive) { outcome = 'won'; break; }
        { const k = Math.floor((Date.now() - t0) / 1000); const r = sec[k] || (sec[k] = { n: 0, liveSum: 0, liveMax: 0, md: 1e9 }); r.n++; r.liveSum += s.live; r.liveMax = Math.max(r.liveMax, s.live); r.md = Math.min(r.md, s.md); minD = Math.min(minD, s.md); if (s.md < 40) nearMiss++; }
        if (s.hp < last) { dmg += last - s.hp; hits++; } last = s.hp;
        const sx = (s.ex - s.cx) / s.W * s.cw + s.cl, sy = (s.ey - s.cy) / s.H * s.ch + s.ct;
        await page.mouse.move(Math.max(0, Math.min(999, sx)), Math.max(0, Math.min(699, sy)));
        await key(' ', true);
        const dirs = [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1], [.7, .7], [.7, -.7], [-.7, .7], [-.7, -.7]];
        const SP = 235; let best = null;
        const bd = Math.hypot(s.ex - s.px, s.ey - s.py) || 1;
        for (const [dx, dy] of dirs) {
          let cost = 0;
          for (let tt = 0.05; tt <= 0.45; tt += 0.05) {
            const qx = s.px + dx * SP * tt, qy = s.py + dy * SP * tt;
            for (const b of s.bl) { const d = Math.hypot(b[0] + b[2] * tt - qx, b[1] + b[3] * tt - qy); if (d < MARGIN) cost += (MARGIN - d) * (1.2 - tt); }
          }
          const nd = Math.hypot(s.ex - (s.px + dx * SP * 0.3), s.ey - (s.py + dy * SP * 0.3));
          cost += Math.abs(nd - ORBIT) * 0.04 + (dx || dy ? 0.3 : 0);
          const tx = -(s.ey - s.py) / bd, ty = (s.ex - s.px) / bd; cost -= (dx * tx + dy * ty) * 0.8;
          if (!best || cost < best.c) best = { c: cost, dx, dy };
        }
        await key('d', best.dx > 0.3); await key('a', best.dx < -0.3); await key('s', best.dy > 0.3); await key('w', best.dy < -0.3);
        n++;
        if (SLOW_MS) await page.waitForTimeout(SLOW_MS);
      }
      const secs = +((Date.now() - t0) / 1000).toFixed(1);
      const hpc = await page.evaluate(() => window.__hp); const secs2 = Object.keys(sec).length; const liveAvg = +(Object.values(sec).reduce((x, r) => x + r.liveSum / r.n, 0) / secs2).toFixed(1); const liveMaxAll = Math.max(...Object.values(sec).map((r) => r.liveMax)); const loopHz = +(n / secs).toFixed(1);
      const left = await E(page, (a, w) => { const e = w.rush.entity(); return e ? e.hp : 0; });
      trial.fights.push({ step, boss: info.boss, bossHp: info.hp, maxHp: info.maxHp, dmgMul: info.dmgMul, secs, dmgTaken: dmg, hits, outcome, bossHpLeft: left, loops: n, loopHz, boltsAliveAvg: liveAvg, boltsAliveMax: liveMaxAll, closestPx: +minD.toFixed(1), samplesWithin40px: nearMiss, hitPlayerCalls: hpc.calls, shieldSoaks: hpc.shield, hitDmgs: hpc.dmgs, perSec: Object.keys(sec).filter((k) => k % 10 === 0).map((k) => [+k, +(sec[k].liveSum / sec[k].n).toFixed(1), sec[k].liveMax, +sec[k].md.toFixed(0)]) });
      console.log(JSON.stringify(trial.fights[trial.fights.length - 1]));
      if (outcome !== 'won') break;
    }
    for (const k of Array.from(held)) await key(k, false);
    await E(page, (a, w) => { const s = w.rush.state(); if (s.on) w.rush.leave(); });
    await page.waitForTimeout(500);
    out.push(trial);
    await page.waitForFunction(() => window.__mm.arena.state === 'play', null, { timeout: 20000 }).catch(() => {});
  }
  console.log('RESULT', JSON.stringify({ level: LEVEL, rarity: RAR, db, errs, out }));
  await browser.close();
})();
