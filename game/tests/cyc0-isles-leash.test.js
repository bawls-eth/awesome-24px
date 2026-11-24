// cyc0-S (enemy AI edge case, b01-r2-05 family: aggro / leash): an angry hostile Isles creature that chases the hero past its
// 14-tile leash must walk back home, not hover on the leash ring. Before the fix it turned round one think (0.1 s) after
// crossing the ring, re-aggroed on the hero standing just outside, and so sat on the ring forever (82 in/out flips in 15 s,
// 3 tiles from the hero: free shots, never reaching). After: it walks back to within 4 tiles of home, then (hero far away)
// stays calm; walking up to it again still starts a chase (no zero-aggro creature).
// OFFLINE: blockDb; the Isles page writes only localStorage. Run: BASE=http://localhost:8440/game/index.html node game/tests/cyc0-isles-leash.test.js
const { chromium } = require('playwright');
const { check, done, blockDb } = require('./helpers');
const ORIGIN = (process.env.BASE || 'http://localhost:8440').replace(/\/game\/.*$/, '').replace(/\/$/, '');
const PAGE = ORIGIN + '/game/games/isles/index.html';
const ev = (page, fn, arg) => page.evaluate(`(${fn.toString()})(window.__isles, ${JSON.stringify(arg === undefined ? null : arg)})`);
(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1000, height: 700 } });
  const db = await blockDb(ctx);
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.addInitScript(() => { if (sessionStorage.seeded) return; sessionStorage.seeded = '1'; localStorage.clear(); });
  await page.goto(PAGE + '?test=1&seed=123');
  await page.waitForFunction(() => window.__isles && window.__isles.world, null, { timeout: 60000 });
  const r = await ev(page, (I) => {
    I.pause(true); I.god(true); I.clearCreatures();
    const run = I.findTile(null, 24); if (!run) return { err: 'no 24-tile run of land' };
    I.teleport(run.x, run.y); I.step(0, 0, 0.05);
    let pick = null;
    for (const sp of I.packSpecies) {
      I.clearCreatures();
      const uid = I.spawn(sp, run.x, run.y); if (!uid) continue;
      if (I.creatures().find((c) => c.uid === uid).mood === 'hostile') { pick = { sp, uid }; break; }
    }
    if (!pick) return { err: 'no hostile species in the pack' };
    const T = I.tile, get = () => I.creatures().find((x) => x.uid === pick.uid);
    const c0 = get(), hx = c0.x, hy = c0.y;
    I.teleport(run.x + 17, run.y); // the hero stands 3 tiles past the 14-tile leash
    I.anger(pick.uid);
    let flips = 0, prev = null, maxHome = 0, sawRet = false; const trace = [];
    for (let i = 0; i < 300; i++) { // 15 s
      I.step(0, 0, 0.05);
      const c = get(); if (!c) break;
      const home = Math.hypot(c.x - hx, c.y - hy) / T; maxHome = Math.max(maxHome, home);
      if (c.ret) sawRet = true;
      const out = home > 14; if (prev !== null && out !== prev) flips++; prev = out;
      if (i % 20 === 0) trace.push(+home.toFixed(1));
    }
    const c = get(), h = I.hero();
    const end = { home: Math.hypot(c.x - hx, c.y - hy) / T, toHero: Math.hypot(c.x - h.x, c.y - h.y) / T, hostile: c.hostile };
    // walk up to it again: it must still chase (leash return is not a permanent zero-aggro state)
    I.teleport(Math.round(c.x / T - 0.5) + 3, Math.round(c.y / T - 0.5));
    const before = Math.hypot(get().x - I.hero().x, get().y - I.hero().y);
    I.step(0, 0, 1.0);
    const after = Math.hypot(get().x - I.hero().x, get().y - I.hero().y);
    return { sp: pick.sp, flips, maxHome, sawRet, trace, end, before: before / T, after: after / T };
  });
  console.log('  ' + JSON.stringify(r));
  check('setup: a hostile species on a long run of land', !r.err, r.err);
  check('the chase reaches the leash ring (14 tiles)', r.maxHome > 13.5, String(r.maxHome));
  check('it does not hover on the leash ring (<= 3 crossings in 15 s, was 82)', r.flips <= 3, String(r.flips));
  check('it walks back to within 5 tiles of home', r.end && r.end.home <= 5, JSON.stringify(r.end));
  check('the return is visible in the test snapshot (ret flag) and ends', r.sawRet && r.end && r.end.toHero > 10, JSON.stringify(r.end));
  check('walking up to it again still starts a chase (no zero-aggro creature)', r.after < r.before - 0.5, r.before + ' -> ' + r.after);
  check('no page errors', errors.length === 0, errors.join(' | '));
  check('no DB traffic', db.attempts() === 0, String(db.attempts()));
  await browser.close();
  done();
})().catch((e) => { console.error(e); process.exit(1); });
