// Cycle 10 D (ID-51 zone <= 1 follow-up): does the 5 s idle rest make the Midlands too safe, or can "stand still to drop aggro" be exploited?
// Real browser, brand-new world hero (heropick=0, no coach), put on the free Midlands tile nearest the spawn, Lv 1, REAL HP (no i-frames).
// A siege of 6 enemies (3 aimed, 2 ring, 1 spiral; tier 0, zone 1) is spawned 150-230 px around the hero (rotated per trial), then ONE real key
// press and NO more input. Measured per trial (game seconds): HP lost before the rest starts (the 5 s window), HP lost while resting, bolts
// fired while resting, kills / shards earned while resting; then one real key press ends the rest and the window after it is measured too.
// ASSERTED (the design intent of ID-51): resting yields NO progress (kills, shards unchanged for 20 s), non-boss enemies fire 0 bolts while the hero
// rests, the rest cannot be re-entered faster than RM_IDLE_REST_S after a wake, and a woken hero is shot at again within a few seconds
// (no free window to walk away). Numbers are INFO lines; the verdict is in beta/cycle10-design.md.
// OFFLINE: blockDb + every WebSocket closed + the town page stubbed; literal 0 database attempts.
// Run: BASE=http://localhost:8440/game/index.html node game/tests/cyc10-design-midlands-rest.test.js   (TRIALS=4)
const { chromium } = require('playwright');
const { check, done, blockDb } = require('./helpers');
const LS = require('./lib/load-scale');
const ORIGIN = (process.env.BASE || 'http://localhost:8440/game/index.html').replace(/\/game\/index\.html.*$/, '');
const URL = ORIGIN + '/game/games/mad-maze/index.html?mode=world&from=hub&test=1&seed=12345&heropick=0&tutorial=0&qdate=2030-05-01';
const TRIALS = Number(process.env.TRIALS || 4);
const E = (page, fn, arg) => page.evaluate(`(${fn.toString()})(window.__mm.arena, window.__mm.world, ${JSON.stringify(arg === undefined ? null : arg)})`);
const clockAt = (page, s) => page.waitForFunction((s) => window.__mm.arena.clock >= s || window.__mm.arena.state !== 'play', s, { timeout: LS.budget(Math.max(30000, s * 4000)) });
const snap = (page) => E(page, (a) => ({ clock: a.clock, state: a.state, hp: a.player.hp, max: a.stats.maxHp, resting: a.resting, restN: a.restN, idleT: a._idleT, kills: a.run.kills, shards: a.run.shards, fired: window.__rest.fired, zone: window.MMZones.zoneInfoAt(window.__mm.world.world, a.player.x / 32, a.player.y / 32).zone }));

async function trial(browser, n) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  const db = await blockDb(ctx); await ctx.routeWebSocket(/.*/, (ws) => ws.close());
  await ctx.route('**/game/index.html*', (r) => r.fulfill({ contentType: 'text/html', body: '<!doctype html>town' }));
  const page = await ctx.newPage(); const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(URL);
  await page.waitForFunction(() => window.__mm && window.__mm.world && window.__mm.arena.active && window.__mm.arena.state === 'play', null, { timeout: LS.budget(40000) });
  await E(page, (a) => { // read-only recorder of non-boss enemy bolts
    const R = window.__rest = { fired: 0 }; const f = a.fireEnemyBullet.bind(a);
    a.fireEnemyBullet = function (x, y, ang, sp, kind) { const b = f(x, y, ang, sp, kind); if (b && !(a._curE && a._curE.type === 'boss')) R.fired++; return b; };
    return true;
  });
  const spot = await E(page, (a, w, k) => {
    const Z = window.MMZones; const T = 32; const sp = w.world.spawnPoint;
    for (let r = 3; r < 400; r++) for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
      if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue; const tx = sp.x + dx, ty = sp.y + dy;
      if (tx < 6 || ty < 6 || tx >= w.world.w - 6 || ty >= w.world.h - 6) continue;
      if (Z.zoneInfoAt(w.world, tx + 0.5, ty + 0.5).zone !== 1 || w.solidAt((tx + 0.5) * T, (ty + 0.5) * T)) continue;
      const p = a.player; p.x = (tx + 0.5) * T; p.y = (ty + 0.5) * T; p.vx = 0; p.vy = 0; p.iframes = 0; a._idleT = 0; a._camStep(-1);
      const types = ['aimed', 'aimed', 'aimed', 'ring', 'ring', 'spiral']; const rot = k * 0.9;
      types.forEach((t, i) => { const ang = rot + i * Math.PI * 2 / 6, d = 150 + (i % 3) * 40; const e = a.spawnEnemy(t, p.x + Math.cos(ang) * d, p.y + Math.sin(ang) * d); if (e) { e.tier = 0; e.zone = 1; } });
      return { tx, ty, hp: p.hp };
    }
    return null;
  }, n);
  await page.keyboard.down('d'); await page.waitForTimeout(60); await page.keyboard.up('d'); // the one real input; the 5 s count starts here
  const s0 = await snap(page); let sRest = null; const hpTrace = [];
  const tEnd = Date.now() + LS.budget(90000);
  while (Date.now() < tEnd) {
    const s = await snap(page); hpTrace.push([+(s.clock - s0.clock).toFixed(1), Math.round(s.hp)]);
    if (s.state !== 'play') break;
    if (s.resting) { sRest = s; break; }
    if (s.clock - s0.clock > 20) break;
    await page.waitForTimeout(100);
  }
  let r3 = null, r20 = null, fellBefore = !sRest; let afterWake = null, wakeFired = null;
  if (sRest) {
    await clockAt(page, sRest.clock + 3); r3 = await snap(page); // bolts already in flight when the rest began land inside this 3 s
    await clockAt(page, sRest.clock + 20); r20 = await snap(page);
    const before = r20; await page.keyboard.down('d'); await page.waitForTimeout(60); await page.keyboard.up('d');
    const w = await snap(page); wakeFired = { resting: w.resting, idleT: w.idleT };
    await clockAt(page, w.clock + 4.5); afterWake = await snap(page); afterWake.firedSince = afterWake.fired - before.fired; afterWake.hpLost = before.hp - afterWake.hp; afterWake.restNdelta = afterWake.restN - before.restN;
  }
  await ctx.close();
  return { n, spot, s0, sRest, r3, r20, afterWake, wakeFired, fellBefore, hpTrace, errors, db: db.attempts() };
}

(async () => {
  const browser = await chromium.launch(); const runs = [];
  for (let i = 0; i < TRIALS; i++) runs.push(await trial(browser, i));
  const sum = { fell: 0, rested: 0 };
  for (const r of runs) {
    const tag = 'trial ' + r.n + ': ';
    check(tag + 'the hero was really on a Midlands tile (zone 1) with 6 enemies around it', !!r.spot && r.s0.zone === 1, JSON.stringify({ spot: r.spot, zone: r.s0.zone }));
    if (!r.sRest) { sum.fell++; console.log('INFO ' + tag + 'FELL or never rested before the rest: trace ' + JSON.stringify(r.hpTrace.filter((_, i) => i % 5 === 0))); }
    else {
      sum.rested++;
      const winLoss = r.s0.hp - r.sRest.hp, restLoss = r.sRest.hp - r.r20.hp;
      console.log('INFO ' + tag + `rest began after ${(r.sRest.clock - r.s0.clock).toFixed(1)} s with ${Math.round(r.sRest.hp)}/${r.sRest.max} HP (${Math.round(winLoss)} HP lost in the window); first 3 s resting (shots already in flight): ${Math.round(r.sRest.hp - r.r3.hp)} HP lost, then ${Math.round(r.r3.hp - r.r20.hp)} HP lost in the next 17 s, ${r.r20.fired - r.sRest.fired} bolts, kills +${r.r20.kills - r.sRest.kills}, shards +${r.r20.shards - r.sRest.shards}; after one key press (4.5 s): ${Math.round(r.afterWake.hpLost)} HP lost, ${r.afterWake.firedSince} bolts, new rests ${r.afterWake.restNdelta}`);
      check(tag + 'resting earns nothing: 0 kills and 0 shards in 20 s (no idle farming)', r.r20.kills === r.sRest.kills && r.r20.shards === r.sRest.shards, JSON.stringify({ k: [r.sRest.kills, r.r20.kills], s: [r.sRest.shards, r.r20.shards] }));
      check(tag + 'resting heroes are not shot at: 0 new bolts in 20 s, and no HP lost from 3 s after the rest began to 20 s (bolts already in flight land in the first 3 s)', r.r20.fired - r.sRest.fired === 0 && r.r20.hp >= r.r3.hp, JSON.stringify({ bolts: r.r20.fired - r.sRest.fired, hp: [r.sRest.hp, r.r3.hp, r.r20.hp] }));
      check(tag + 'one real key press ends the rest at once, and 4.5 s later the siege fires again (no free window)', r.wakeFired.resting === false && r.wakeFired.idleT < 1 && r.afterWake.firedSince > 0, JSON.stringify({ wake: r.wakeFired, after: r.afterWake }));
      check(tag + 'the rest cannot be re-entered within RM_IDLE_REST_S (5 s) of a wake', r.afterWake.restNdelta === 0, JSON.stringify(r.afterWake));
    }
    check(tag + 'no page errors, no database traffic (literal 0)', r.errors.length === 0 && r.db === 0, r.errors.join(' | ') + ' db=' + r.db);
  }
  console.log(`INFO summary: ${sum.rested}/${runs.length} sieged idle Lv 1 heroes reached the rest, ${sum.fell}/${runs.length} fell inside the 5 s window`);
  await browser.close();
  done();
})().catch((e) => { console.error(e); process.exit(1); });
