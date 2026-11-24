// Cycle 1 S (cycle0-systems note): Isles creatures pinned against cliffs. Movement is per axis, so a chaser aimed straight at a wall
// bumped it and re-aimed 0.1 s later, forever, with the hero just behind the wall. Wall-slide steering (isles.js steer) turns it along
// the wall and round the end. Two layouts on a patch of open land, built by setting world.solid tiles in the test (the page only):
//  A: a 9-tile wall straight between chaser and hero (hero dead behind it, dy = 0).
//  B: the same wall plus an arm on the chaser's side (a corner pocket), hero one tile up so the chaser first slides INTO the pocket.
// Each runs with steering (default) and with ?slide=0 (the old straight aim) as the before-baseline: the old aim must stay pinned,
// the new one must reach the hero within 12 s. OFFLINE: blockDb; the Isles page writes only localStorage.
// Run: BASE=http://localhost:8440/game/index.html node game/tests/cyc1-isles-wall-slide.test.js
const { chromium } = require('playwright');
const { check, done, blockDb } = require('./helpers');
const ORIGIN = (process.env.BASE || 'http://localhost:8440').replace(/\/game\/.*$/, '').replace(/\/$/, '');
const PAGE = ORIGIN + '/game/games/isles/index.html';
const ev = (page, fn, arg) => page.evaluate(`(${fn.toString()})(window.__isles, ${JSON.stringify(arg === undefined ? null : arg)})`);

async function run(browser, layout, slide, dbs, errors) {
  const ctx = await browser.newContext({ viewport: { width: 1000, height: 700 } });
  dbs.push(await blockDb(ctx));
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push(e.message));
  await page.addInitScript(() => { if (sessionStorage.seeded) return; sessionStorage.seeded = '1'; localStorage.clear(); });
  await page.goto(PAGE + '?test=1&seed=123' + (slide ? '' : '&slide=0'));
  await page.waitForFunction(() => window.__isles && window.__isles.world, null, { timeout: 60000 });
  const r = await ev(page, (I, layout) => {
    I.pause(true); I.god(true); I.clearCreatures();
    const W = 16, H = 13; let box = null;
    const run0 = I.findTile(null, 24);
    // an all-walkable W x H patch (scan near the long run of land first, then anywhere)
    const ok = (bx, by) => { for (let y = by; y < by + H; y++) for (let x = bx; x < bx + W; x++) if (!I.walkable(x, y)) return false; return true; };
    const w = I.world;
    for (let r = 0; r < 200 && !box; r += 2) for (let by = Math.max(2, (run0 ? run0.y : 100) - r); by <= Math.min(w.h - H - 2, (run0 ? run0.y : 100) + r) && !box; by += 2) for (let bx = 2; bx < w.w - W - 2; bx += 2) if (ok(bx, by)) { box = { bx, by }; break; }
    if (!box) return { err: 'no open patch' };
    const { bx, by } = box; const set = (x, y) => { w.solid[y * w.w + x] = 1; };
    for (let y = by + 2; y <= by + 10; y++) set(bx + 7, y); // the wall
    if (layout === 'B') for (let x = bx + 4; x <= bx + 7; x++) set(x, by + 2); // the arm: a pocket on the chaser's upper side
    const cx = bx + 2, cy = by + 6, hx = bx + 12, hy = layout === 'B' ? by + 5 : by + 6;
    I.teleport(hx, hy); I.step(0, 0, 0.05);
    let pick = null;
    for (const sp of I.packSpecies) {
      I.clearCreatures();
      const uid = I.spawn(sp, cx, cy); if (!uid) continue;
      const c = I.creatures().find((x) => x.uid === uid);
      if (c && c.mood === 'hostile') { pick = { sp, uid }; break; }
    }
    if (!pick) return { err: 'no hostile species' };
    const T = I.tile; const get = () => I.creatures().find((x) => x.uid === pick.uid);
    I.anger(pick.uid);
    let best = 1e9, t = 0, reachT = -1; const trail = [];
    for (let i = 0; i < 240; i++) { // 12 s
      I.anger(pick.uid); I.step(0, 0, 0.05); t += 0.05;
      const c = get(), h = I.hero(); if (!c) break;
      const d = Math.hypot(c.x - h.x, c.y - h.y) / T; if (d < best) best = d;
      if (reachT < 0 && d < 1.6) reachT = t;
      if (i % 20 === 0) trail.push([+(c.x / T - bx).toFixed(1), +(c.y / T - by).toFixed(1)]);
    }
    const c = get();
    return { sp: pick.sp, box, best: +best.toFixed(2), reachT: +reachT.toFixed(2), end: c ? [+(c.x / T - bx).toFixed(1), +(c.y / T - by).toFixed(1)] : null, trail, wallX: 7 };
  }, layout);
  await ctx.close();
  return r;
}

(async () => {
  const browser = await chromium.launch();
  const dbs = [], errors = [];
  for (const layout of ['A', 'B']) {
    const before = await run(browser, layout, false, dbs, errors);
    const after = await run(browser, layout, true, dbs, errors);
    console.log(`  ${layout} slide=0: ${JSON.stringify(before)}`);
    console.log(`  ${layout} slide=1: ${JSON.stringify(after)}`);
    check(`${layout}: setup (an open patch, a hostile chaser)`, !before.err && !after.err, before.err || after.err);
    check(`${layout}: baseline ?slide=0 (the old straight aim) stays pinned at the wall, never within 3 tiles of the hero`, before.best > 3 && before.end && before.end[0] < 7.5, JSON.stringify({ best: before.best, end: before.end }));
    check(`${layout}: with wall-slide steering the chaser rounds the ${layout === 'B' ? 'corner pocket' : 'wall'} and reaches the hero (< 1.6 tiles) within 12 s`, after.reachT > 0 && after.best < 1.6 && after.end && after.end[0] > 8, JSON.stringify({ reachT: after.reachT, best: after.best, end: after.end }));
  }
  check('no page errors', errors.length === 0, errors.slice(0, 3).join(' | '));
  check('no DB traffic', dbs.every((d) => d.attempts() === 0));
  await browser.close();
  done();
})().catch((e) => { console.error(e); process.exit(1); });
