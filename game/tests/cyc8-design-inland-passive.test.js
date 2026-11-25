// Cycle 8 D (ID-51 follow-up): does an idle hero survive on the FIRST INLAND zone (Midlands, zone 1)? ID-51's idle rest only covers the
// Shore (realm-world.js restOk: zone === 0). Same set-up as cyc6-lead-passive-landscape (phone landscape, brand-new profile, first hero,
// coach skipped with its own button, no input for 120 game seconds, several seeds), but the hero is first put on the free Midlands tile
// nearest to the spawn point (the border a player crosses first). It then records WHEN the idle hero falls.
// Cycle 9 S: for ZONE 0..1 it now ALSO asserts every idle hero rests and survives the watch (ID-51 extended to zone <= 1).
// It was a MEASUREMENT test: it asserts the set-up was real (hero really in zone 1, no page errors, literal 0 db attempts) and prints
// the per-seed numbers (INFO lines). The decision lives in game/design/beta/cycle8-design.md.
// OFFLINE: blockDb + every WebSocket closed + the town page stubbed; literal 0 database attempts.
// Run: BASE=http://localhost:8440/game/index.html node game/tests/cyc8-design-inland-passive.test.js   (SEEDS=1,2,3 / ZONE=1 / WATCH=120)
const { chromium } = require('playwright');
const { check, done, blockDb } = require('./helpers');
const LS = require('./lib/load-scale');
const ORIGIN = (process.env.BASE || 'http://localhost:8440/game/index.html').replace(/\/game\/index\.html.*$/, '');
const SEEDS = (process.env.SEEDS || '12345,777,4242,9001,31337,2026').split(',').map((s) => s.trim()).filter(Boolean);
const ZONE = Number(process.env.ZONE || 1);
const SIM_REST = Number(process.env.REST_ZONES || 0); // 0 = the game as it is; 1 = simulate restOk for zones 0..1 (the spec for S)
const WATCH = Number(process.env.WATCH || 120); // game seconds

async function watch(browser, seed) {
  const ctx = await browser.newContext({ viewport: { width: 844, height: 390 }, hasTouch: true, isMobile: true });
  const db = await blockDb(ctx); await ctx.routeWebSocket(/.*/, (ws) => ws.close());
  await ctx.route('**/game/index.html*', (r) => r.fulfill({ contentType: 'text/html', body: '<!doctype html>town' }));
  const page = await ctx.newPage(); const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(ORIGIN + '/game/games/mad-maze/index.html?mode=world&from=hub&test=1&tutorial=1&seed=' + seed, { timeout: LS.budget(30000) });
  const t0 = Date.now(); let picked = false;
  while (Date.now() - t0 < LS.budget(30000)) {
    const st = await page.evaluate(() => (window.__mm && window.__mm.arena && window.__mm.arena.active && window.__mm.arena.state === 'play' ? 'play' : ''));
    if (st === 'play') break;
    const h = await page.$('.hp-hero');
    if (h && !picked) { await h.tap().catch(() => null); picked = true; }
    await page.waitForTimeout(300);
  }
  let skipped = false;
  const sk = await page.$('#mm-coach-skip');
  if (sk && await sk.isVisible().catch(() => false)) { await sk.tap().catch(() => null); skipped = true; }
  // put the hero on the free tile of the target zone nearest to the spawn point (spiral search over the real world arrays)
  const placed = await page.evaluate(([zone, simRest]) => {
    const w = window.__mm.world; const a = window.__mm.arena; if (!a || a.state !== 'play') return null;
    const W = w.world, sp = W.spawnPoint; let best = null, bd = 1e9;
    for (let r = 1; r < 200 && !best; r++) {
      for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
        const x = sp.x + dx, y = sp.y + dy; if (x < 2 || y < 2 || x >= W.w - 2 || y >= W.h - 2) continue;
        if (W.zone[y * W.w + x] !== zone || w.solidAt((x + 0.5) * w.TILE, (y + 0.5) * w.TILE)) continue;
        const d = dx * dx + dy * dy; if (d < bd) { bd = d; best = { x, y }; }
      }
    }
    if (!best) return { ok: false };
    if (simRest) { const tz = (x, y) => W.zone[Math.floor(y / w.TILE) * W.w + Math.floor(x / w.TILE)]; a.world = Object.freeze(Object.assign({}, a.world, { restOk: (p) => tz(p.x, p.y) <= simRest })); } // REST_ZONES=1: what the one-line spec would do (rest in zones 0..1); no game code changes
    const f = w.nearestFree(best.x, best.y, 3) || best; const p = a.player; p.x = (f.x + 0.5) * w.TILE; p.y = (f.y + 0.5) * w.TILE; p.iframes = 0; a._idleT = 0;
    a.player.vx = 0; a.player.vy = 0;
    return { ok: true, tile: f, dist: Math.round(Math.sqrt(bd)), zone: W.zone[f.y * W.w + f.x] };
  }, [ZONE, SIM_REST]);
  const log = []; let fell = null; let c0 = null; let minHp = Infinity; let maxNear = 0; let hpMax = 0; let firstHit = null;
  const tEnd = Date.now() + LS.budget(230000);
  while (placed && placed.ok && Date.now() < tEnd) {
    const s = await page.evaluate(() => { const a = window.__mm.arena; const p = a.player; let near = 0; for (const e of a.enemies) if (e.active && Math.hypot(e.x - p.x, e.y - p.y) < 420) near++; return { clock: a.clock, state: a.state, hp: Math.round(p.hp), max: a.stats.maxHp, near, resting: !!a.resting, zone: (window.__mm.world.zone() || {}).zone }; });
    if (c0 === null) c0 = s.clock;
    const t = s.clock - c0; minHp = Math.min(minHp, s.hp); maxNear = Math.max(maxNear, s.near); hpMax = s.max;
    if (firstHit === null && s.hp < s.max) firstHit = Math.round(t * 10) / 10;
    if (!log.length || t - log[log.length - 1][0] >= 10) log.push([Math.round(t), s.hp, s.near, s.resting ? 'R' : '-', s.zone]);
    if (s.state === 'dead') { fell = Math.round(t * 10) / 10; break; }
    if (t >= WATCH) break;
    await page.waitForTimeout(250);
  }
  await ctx.close();
  return { seed, picked, skipped, placed, fell, firstHit, minHp, hpMax, maxNear, log, errors, db: db.attempts() };
}

(async () => {
  const browser = await chromium.launch();
  const runs = [];
  for (let i = 0; i < SEEDS.length; i += 2) runs.push(...await Promise.all(SEEDS.slice(i, i + 2).map((s) => watch(browser, s))));
  let fellEarly = 0, fellAny = 0;
  // Cycle 9 S (ID-51 inland follow-up shipped: realm-world.js restOk zone <= 1, RM_IDLE_REST_S 8 -> 5): with the game as it is (no
  // REST_ZONES simulation) an idle hero on the first inland tile now rests and lives the whole watch. Asserted for zone 0..1 only;
  // ZONE=2 stays a measurement (Highlands keeps today's rules on purpose).
  const ASSERT_LIVE = !SIM_REST && ZONE <= 1;
  for (const r of runs) {
    const tag = `zone ${ZONE} seed ${r.seed}: `;
    check(tag + 'the idle hero was really put on a free tile of the zone, coach skipped with its own button', !!(r.placed && r.placed.ok && r.placed.zone === ZONE) && r.skipped, JSON.stringify({ placed: r.placed, skipped: r.skipped }));
    if (r.fell !== null) { fellAny++; if (r.fell <= 30) fellEarly++; }
    console.log('INFO ' + tag + (r.fell === null ? 'alive' : 'FELL at ' + r.fell + ' s') + ', first damage at ' + r.firstHit + ' s, lowest HP ' + r.minHp + '/' + r.hpMax + ', most enemies within 420 px ' + r.maxNear + '; [t, HP, near, rest, zone] ' + JSON.stringify(r.log));
    if (ASSERT_LIVE) {
      check(tag + 'the idle hero rested (R seen in the log) and is still alive after ' + WATCH + ' game s (ID-51 zone <= 1)', r.fell === null && r.log.some((l) => l[3] === 'R' && l[4] === ZONE) && r.log.length && r.log[r.log.length - 1][0] >= WATCH - 10, JSON.stringify({ fell: r.fell, minHp: r.minHp, log: r.log }));
    }
    check(tag + 'no page errors, no database traffic (literal 0)', r.errors.length === 0 && r.db === 0, r.errors.join(' | ') + ' db=' + r.db);
  }
  console.log(`INFO zone ${ZONE}: ${fellAny}/${runs.length} idle heroes fell within ${WATCH} s, ${fellEarly}/${runs.length} within 30 s`);
  await browser.close();
  done();
})().catch((e) => { console.error(e); process.exit(1); });
