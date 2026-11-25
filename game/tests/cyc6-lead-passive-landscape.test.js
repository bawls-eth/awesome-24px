// Cycle 6 L (b15-r3-02, cycle 5 Open): "an idle hero falls on a landscape phone". Seeded repro of the cycle-5 run: phone in
// landscape (844x390, touch), a brand-new profile enters the Realm, the first hero offered is tapped, the first-run coach is
// skipped with its own Skip button (so its idle shield is off: normal rules), then NO input for 120 game seconds.
// Several seeds. The run itself is untouched; two pass-through wrappers (page side, test=1) only RECORD who fired the
// bolt that hit: fireEnemyBullet tags the bolt with the nearest live enemy at its muzzle, _hitPlayer logs the HP lost.
// Expected: the hero is alive after 120 s on every seed. The INFO lines carry the numbers for D (who tunes spawns).
// OFFLINE: blockDb + every WebSocket closed + the town page stubbed; literal 0 database attempts.
// Run: BASE=http://localhost:8440/game/index.html node game/tests/cyc6-lead-passive-landscape.test.js   (SEEDS=1,2,3 / VIEW=390x844 to override)
const { chromium } = require('playwright');
const { check, done, blockDb } = require('./helpers');
const LS = require('./lib/load-scale');
const ORIGIN = (process.env.BASE || 'http://localhost:8440/game/index.html').replace(/\/game\/index\.html.*$/, '');
const SEEDS = (process.env.SEEDS || '12345,777,4242,9001,31337,2026').split(',').map((s) => s.trim()).filter(Boolean);
const VIEW = (process.env.VIEW || '844x390').split('x').map(Number);
const WATCH = 120; // game seconds
const SHOTS = process.env.SHOTS || null;

async function watch(browser, seed) {
  const ctx = await browser.newContext({ viewport: { width: VIEW[0], height: VIEW[1] }, hasTouch: true, isMobile: true });
  const db = await blockDb(ctx); await ctx.routeWebSocket(/.*/, (ws) => ws.close());
  await ctx.route('**/game/index.html*', (r) => r.fulfill({ contentType: 'text/html', body: '<!doctype html>town' }));
  const page = await ctx.newPage(); const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  // cycle 8 L (flaky under load, 2 stamps): this goto waited for the window "load" event (every script, sheet and image of three Realm
  // pages opened at once) under Playwright's fixed 30 s default. On a busy 4-core box that event came later than 30 s, goto threw and
  // the whole test exited 1 with no FAIL line (reproduced: 3 copies in parallel, all 3 died here). Nothing below needs "load": the
  // loop waits for the real condition (the arena is in play). So: stop at DOM ready, and both budgets follow the load measured NOW
  // (the cached factor is from process start; the second batch of pages starts minutes later).
  const F = Math.max(LS.factor(), LS.fresh());
  await page.goto(ORIGIN + '/game/games/mad-maze/index.html?mode=world&from=hub&test=1&tutorial=1&seed=' + seed, { waitUntil: 'domcontentloaded', timeout: Math.round(30000 * F) });
  const t0 = Date.now(); let picked = '';
  while (Date.now() - t0 < Math.round(30000 * F)) {
    const st = await page.evaluate(() => (window.__mm && window.__mm.arena && window.__mm.arena.active && window.__mm.arena.state === 'play' ? 'play' : ''));
    if (st === 'play') break;
    const h = await page.$('.hp-hero');
    if (h && !picked) { await h.tap().catch(() => null); picked = 'first hero'; }
    await page.waitForTimeout(300);
  }
  let skipped = false;
  const sk = await page.$('#mm-coach-skip');
  if (sk && await sk.isVisible().catch(() => false)) { await sk.tap().catch(() => null); skipped = true; }
  const started = await page.evaluate(() => {
    const a = window.__mm && window.__mm.arena; if (!a || a.state !== 'play') return false;
    const L = window.__passive = { hits: [], by: {}, fired: {} };
    const nearest = (x, y) => { let best = null, bd = 90 * 90; for (const e of a.enemies) { if (!e.active) continue; const d = (e.x - x) * (e.x - x) + (e.y - y) * (e.y - y); if (d < bd) { bd = d; best = e; } } return best ? String(best.art || best.type || '?') : 'unknown'; };
    const fire = a.fireEnemyBullet.bind(a);
    a.fireEnemyBullet = function (x, y, ang, sp, kind) { const b = fire(x, y, ang, sp, kind); if (b) { b._src = nearest(x, y); b._seen = false; L.fired[b._src] = (L.fired[b._src] || 0) + 1; } return b; };
    const hit = a._hitPlayer.bind(a);
    a._hitPlayer = function (dmg) {
      const p = a.player, hp0 = p.hp; let src = 'other', bd = 60 * 60, bb = null;
      for (const b of a.eBullets) { if (b.active || b._seen !== false) continue; const d = (b.x - p.x) * (b.x - p.x) + (b.y - p.y) * (b.y - p.y); if (d < bd) { bd = d; src = b._src; bb = b; } }
      if (bb) bb._seen = true;
      const r = hit(dmg); const lost = Math.round((hp0 - p.hp) * 10) / 10;
      if (lost > 0) { L.hits.push([Math.round(a.clock), src, lost]); L.by[src] = (L.by[src] || 0) + lost; }
      return r;
    };
    return true;
  });
  const log = []; let fell = null; let c0 = null; let minHp = Infinity; let maxNear = 0; let zone = ''; let hpMax = 0;
  const tEnd = Date.now() + Math.round(230000 * F);
  while (started && Date.now() < tEnd) {
    const s = await page.evaluate(() => { const a = window.__mm.arena; const p = a.player; let near = 0; for (const e of a.enemies) if (e.active && Math.hypot(e.x - p.x, e.y - p.y) < 420) near++; return { clock: a.clock, state: a.state, hp: Math.round(p.hp), max: a.stats.maxHp, near, zone: (document.getElementById('rw-zone') || {}).textContent || '' }; });
    if (c0 === null) c0 = s.clock;
    const t = s.clock - c0; minHp = Math.min(minHp, s.hp); maxNear = Math.max(maxNear, s.near); zone = s.zone || zone; hpMax = s.max;
    if (!log.length || t - log[log.length - 1][0] >= 10) log.push([Math.round(t), s.hp, s.near]);
    if (s.state === 'dead') { fell = Math.round(t); break; }
    if (t >= WATCH) break;
    await page.waitForTimeout(500);
  }
  const src = started ? await page.evaluate(() => window.__passive) : { hits: [], by: {}, fired: {} };
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/cyc6-lead-passive-${VIEW[0]}x${VIEW[1]}-seed${seed}.jpg`, type: 'jpeg', quality: 60 }).catch(() => null);
  const watched = log.length ? log[log.length - 1][0] : 0;
  await ctx.close();
  return { seed, started, picked, skipped, fell, minHp, hpMax, maxNear, zone, watched, log, src, errors, db: db.attempts() };
}

(async () => {
  const browser = await chromium.launch();
  const runs = [];
  for (let i = 0; i < SEEDS.length; i += 3) runs.push(...await Promise.all(SEEDS.slice(i, i + 3).map((s) => watch(browser, s)))); // 3 pages at a time (4-core box)
  const total = {};
  for (const r of runs) {
    const tag = `${VIEW[0]}x${VIEW[1]} seed ${r.seed}: `;
    check(tag + 'a brand-new profile reaches the Shore and skips the coach with its own button', r.started && r.skipped, JSON.stringify({ started: r.started, skipped: r.skipped, picked: r.picked, errors: r.errors }));
    check(tag + 'b15-r3-02: an idle hero (no input, coach skipped) is alive after ' + WATCH + ' game seconds', r.started && r.fell === null && r.watched >= WATCH - 11, 'fell at ' + r.fell + ' s; [t, HP, enemies within 420 px] ' + JSON.stringify(r.log));
    Object.keys(r.src.by).forEach((k) => { total[k] = (total[k] || 0) + r.src.by[k]; });
    console.log('INFO ' + tag + (r.fell === null ? 'alive' : 'FELL at ' + r.fell + ' s') + ', lowest HP ' + r.minHp + '/' + r.hpMax + ', most enemies within 420 px ' + r.maxNear + ', zone "' + r.zone + '"; HP lost by source ' + JSON.stringify(r.src.by) + '; bolts fired by source ' + JSON.stringify(r.src.fired) + '; [t, HP, near] ' + JSON.stringify(r.log));
    check(tag + 'no page errors, no database traffic (literal 0)', r.errors.length === 0 && r.db === 0, r.errors.join(' | ') + ' db=' + r.db);
  }
  console.log('INFO all seeds, HP lost by source: ' + JSON.stringify(total));
  await browser.close();
  done();
})().catch((e) => { console.error(e); process.exit(1); });
