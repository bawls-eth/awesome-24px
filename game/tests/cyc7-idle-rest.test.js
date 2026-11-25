// Cycle 7 S, ID-51 idle-hero rest (owner-approved, ROUND4.md STANDING OWNER DECISION): a solo world hero on a Shore tile with no play input
// for 8 game seconds rests: non-boss enemies do not pursue, fire or get provoked, the one-thumb auto-fire pauses. ANY play input (a key,
// a canvas tap, a stick, an ability) restores the normal rules on the same frame. Deeper zones and the Trial keep today's rules.
// The survival side (an idle hero lives 120 s) is cyc6-lead-passive-landscape.test.js; this test proves the other half:
//   A. an ACTIVE hero on the seed-12345 Shore spawn with two plain aimed shooters on screen (real key taps every second, no rest ever) is
//      still shot at and loses HP: not trivial;
//   B. an idle hero rests after 8 s: enemies within 420 px fire 0 bolts and do not move for 4 s; one real key press ends the rest at once
//      and the enemies fire again; a real touch tap on the phone (390x844) ends it too;
//   C. the same idle hero on a Midlands tile never rests.
// B and C give the hero endless i-frames (so it survives to be measured; aggro, not survival, is what they check). A uses none.
// OFFLINE: blockDb + every WebSocket closed + the town page stubbed; literal 0 database attempts.
// Run: BASE=http://localhost:8440/game/index.html node game/tests/cyc7-idle-rest.test.js
const { chromium } = require('playwright');
const { check, done, blockDb } = require('./helpers');
const LS = require('./lib/load-scale');
const ORIGIN = (process.env.BASE || 'http://localhost:8440/game/index.html').replace(/\/game\/index\.html.*$/, '');
const URL = ORIGIN + '/game/games/mad-maze/index.html?mode=world&from=hub&test=1&seed=12345&heropick=0&tutorial=0&qdate=2030-05-01';
const E = (page, fn, arg) => page.evaluate(`(${fn.toString()})(window.__mm.arena, window.__mm.world, ${JSON.stringify(arg === undefined ? null : arg)})`);

async function open(browser, view, touch) {
  const ctx = await browser.newContext({ viewport: { width: view[0], height: view[1] }, hasTouch: !!touch, isMobile: !!touch });
  const db = await blockDb(ctx); await ctx.routeWebSocket(/.*/, (ws) => ws.close());
  await ctx.route('**/game/index.html*', (r) => r.fulfill({ contentType: 'text/html', body: '<!doctype html>town' }));
  const page = await ctx.newPage(); const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(URL);
  await page.waitForFunction(() => window.__mm && window.__mm.world && window.__mm.arena.active && window.__mm.arena.state === 'play', null, { timeout: LS.budget(40000) });
  // read-only recorder: every enemy bolt fired (with the firing enemy's type when known) and every HP loss
  await E(page, (a) => {
    const R = window.__rest = { fired: 0, hpLost: 0, rested: false };
    const f = a.fireEnemyBullet.bind(a);
    a.fireEnemyBullet = function (x, y, ang, sp, kind) { const b = f(x, y, ang, sp, kind); if (b && !(a._curE && a._curE.type === 'boss')) R.fired++; return b; };
    const h = a._hitPlayer.bind(a);
    a._hitPlayer = function (d) { const hp0 = a.player.hp; const r = h(d); if (a.player.hp < hp0) R.hpLost += hp0 - a.player.hp; return r; };
    return true;
  });
  return { ctx, page, db, errors };
}
// two plain 'aimed' Shore shooters on screen, 220 px above and below the hero (the cycle-6 measurements name aimed shooters walking to a still
// hero as the cause of the idle falls; spawning them makes the check independent of where the seed's own groups stand at second 0)
const shooters = (page) => E(page, (a) => { const p = a.player; [[0, -220], [0, 220]].forEach(([dx, dy]) => { const e = a.spawnEnemy('aimed', p.x + dx, p.y + dy); e.tier = 0; e.zone = 0; }); a._camStep(-1); return true; });
const clockAt = (page, s) => page.waitForFunction((s) => window.__mm.arena.clock >= s || window.__mm.arena.state !== 'play', s, { timeout: LS.budget(Math.max(20000, s * 4000)) });
const now = (page) => E(page, (a) => ({ clock: a.clock, resting: a.resting, restN: a.restN, idleT: a._idleT, state: a.state, hp: a.player.hp, fired: window.__rest.fired, hpLost: window.__rest.hpLost, zone: (window.__mm.world.zone() || {}).zone }));
const nearSnap = (page) => E(page, (a) => a.enemies.filter((e) => e.active && e.type !== 'boss' && Math.hypot(e.x - a.player.x, e.y - a.player.y) < 420).map((e) => [e.x, e.y]));

(async () => {
  const browser = await chromium.launch();

  // A: an ACTIVE hero (keyboard, 1280x720): taps a / d every second for 14 game seconds, never idle for 8 s
  {
    const { ctx, page, db, errors } = await open(browser, [1280, 720], false);
    await shooters(page);
    const s0 = await now(page); let maxIdle = 0; let rested = false; const end = s0.clock + 14; let k = 0;
    while (true) {
      const s = await now(page); maxIdle = Math.max(maxIdle, s.idleT); rested = rested || s.resting;
      if (s.state !== 'play' || s.clock >= end) break;
      await page.keyboard.down(k % 2 ? 'a' : 'd'); await page.waitForTimeout(120); await page.keyboard.up(k % 2 ? 'a' : 'd'); k++;
      await page.waitForTimeout(800);
    }
    const s = await now(page);
    check('A: an active hero (real key taps every second) never rests (restN 0, idle timer stays under 8 s)', !rested && s.restN === 0 && maxIdle < 8, JSON.stringify({ maxIdle, rested, restN: s.restN }));
    check('A: the active hero\'s Shore is not trivial: Shore enemies fire at it and it loses HP (or falls)', s.zone === 0 && s.fired > 0 && (s.hpLost > 0 || s.state === 'dead'), JSON.stringify(s));
    console.log('INFO A (active, seed 12345, 14 s):', JSON.stringify({ fired: s.fired, hpLost: Math.round(s.hpLost), state: s.state, taps: k }));
    check('A: no page errors, no database traffic (literal 0)', errors.length === 0 && db.attempts() === 0, errors.join(' | ') + ' db=' + db.attempts());
    await ctx.close();
  }

  // B: idle hero on the Shore (desktop keyboard, then phone touch)
  for (const v of [{ view: [1280, 720], touch: false, name: '1280x720' }, { view: [390, 844], touch: true, name: '390x844' }]) {
    const { ctx, page, db, errors } = await open(browser, v.view, v.touch);
    await E(page, (a) => { a.player.iframes = 1e9; return true; }); // survive to be measured (aggro is what B checks)
    await shooters(page);
    const c0 = (await now(page)).clock;
    await page.waitForTimeout(500);
    const early = await now(page);
    check(v.name + ' B: right after the start the hero is NOT resting yet (8 s rule)', !early.resting && early.clock - c0 < 8, JSON.stringify(early));
    await clockAt(page, c0 + 9);
    const r1 = await now(page);
    check(v.name + ' B: after 9 s with no input the hero on the Shore rests (restN 1)', r1.resting && r1.restN === 1 && r1.zone === 0, JSON.stringify(r1));
    const pos0 = await nearSnap(page); const f0 = r1.fired;
    await clockAt(page, r1.clock + 4);
    const r2 = await now(page); const pos1 = await nearSnap(page);
    if (process.env.SHOTS) await page.screenshot({ path: process.env.SHOTS + '/cyc7-systems-idle-rest-' + v.name + '.jpg', type: 'jpeg', quality: 60 }).catch(() => null); // optional: SHOTS=<dir>
    let moved = 0; for (let i = 0; i < Math.min(pos0.length, pos1.length); i++) moved = Math.max(moved, Math.hypot(pos1[i][0] - pos0[i][0], pos1[i][1] - pos0[i][1]));
    check(v.name + ' B: while resting, enemies within 420 px fire 0 bolts and do not pursue (moved < 1 px) for 4 s', r2.resting && r2.fired === f0 && pos0.length > 0 && pos0.length === pos1.length && moved < 1, JSON.stringify({ fired: r2.fired - f0, near: pos0.length, moved }));
    // one real input
    if (v.touch) await page.touchscreen.tap(Math.round(v.view[0] / 2), Math.round(v.view[1] * 0.35));
    else { await page.keyboard.down('d'); await page.waitForTimeout(60); await page.keyboard.up('d'); }
    const r3 = await now(page);
    check(v.name + ' B: one real ' + (v.touch ? 'touch tap' : 'key press') + ' ends the rest at once', !r3.resting && r3.idleT < 1, JSON.stringify(r3));
    await page.waitForFunction((f) => window.__rest.fired > f || window.__mm.arena.resting, r3.fired, { timeout: LS.budget(20000) }).catch(() => null);
    const r4 = await now(page);
    check(v.name + ' B: normal aggro returns after the input: the Shore enemies fire again before any new rest', r4.fired > r3.fired && r4.clock - r3.clock < 8, JSON.stringify({ firedAfter: r4.fired - r3.fired, s: +(r4.clock - r3.clock).toFixed(2), resting: r4.resting }));
    check(v.name + ' B: no page errors, no database traffic (literal 0)', errors.length === 0 && db.attempts() === 0, errors.join(' | ') + ' db=' + db.attempts());
    await ctx.close();
  }

  // C: idle hero on a Midlands tile never rests
  {
    const { ctx, page, db, errors } = await open(browser, [1280, 720], false);
    const spot = await E(page, (a, w) => {
      a.player.iframes = 1e9; const Z = window.MMZones; const T = 32; const px = Math.floor(a.player.x / T), py = Math.floor(a.player.y / T);
      for (let r = 4; r < 160; r++) for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue; const tx = px + dx, ty = py + dy;
        if (Z.zoneInfoAt(w.world, tx + 0.5, ty + 0.5).zone !== 1) continue;
        if (w.solidAt && w.solidAt((tx + 0.5) * T, (ty + 0.5) * T)) continue;
        a.player.x = (tx + 0.5) * T; a.player.y = (ty + 0.5) * T; a._camStep(-1); return { tx, ty };
      }
      return null;
    });
    const c0 = (await now(page)).clock;
    await clockAt(page, c0 + 10);
    const s = await now(page);
    check('C: an idle hero (10 s, no input) on a Midlands tile does not rest (deeper zones keep today\'s rules)', !!spot && !s.resting && s.restN === 0 && s.idleT >= 8 && s.state === 'play', JSON.stringify({ spot, s }));
    check('C: no page errors, no database traffic (literal 0)', errors.length === 0 && db.attempts() === 0, errors.join(' | ') + ' db=' + db.attempts());
    await ctx.close();
  }

  await browser.close();
  done();
})().catch((e) => { console.error(e); process.exit(1); });
