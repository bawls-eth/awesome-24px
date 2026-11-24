// Cycle 2 S: wandering Isles creatures bounced off walls (the per-axis step flips vx / vy on a blocked tile, so a walker that picked a
// heading into a cliff bumped it every few frames). isles.js wanderTurn turns a wanderer's heading 45/90/135 degrees along the wall
// (sticky side, no extra random numbers). Layout: a walled 7x7 pen on open land (world.solid set in the test, this page only), one
// passive (non-hostile) creature in the middle, the hero 30+ tiles away so nothing chases, flees or gets curious. 40 s of sim at 20 Hz.
// Baseline ?wslide=0 (the old bounce) vs default: wall bumps must drop to at most a third, the walker must keep moving (path length),
// stay inside the pen and never sit inside a wall. wanderTurn draws no random numbers. OFFLINE: blockDb; 0 DB requests.
// Run: BASE=http://localhost:8440/game/index.html node game/tests/cyc2-isles-wander-slide.test.js
const { chromium } = require('playwright');
const { check, done, blockDb } = require('./helpers');
const ORIGIN = (process.env.BASE || 'http://localhost:8440').replace(/\/game\/.*$/, '').replace(/\/$/, '');
const PAGE = ORIGIN + '/game/games/isles/index.html';
const ev = (page, fn, arg) => page.evaluate(`(${fn.toString()})(window.__isles, ${JSON.stringify(arg === undefined ? null : arg)})`);

async function run(browser, wslide, dbs, errors) {
  const ctx = await browser.newContext({ viewport: { width: 1000, height: 700 } });
  dbs.push(await blockDb(ctx));
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push(e.message));
  await page.addInitScript(() => { if (sessionStorage.seeded) return; sessionStorage.seeded = '1'; localStorage.clear(); });
  await page.goto(PAGE + '?test=1&seed=123' + (wslide ? '' : '&wslide=0'));
  await page.waitForFunction(() => window.__isles && window.__isles.world, null, { timeout: 60000 });
  const r = await ev(page, (I) => {
    I.pause(true); I.god(true); I.clearCreatures();
    const W = 9, H = 9, w = I.world; let box = null;
    const run0 = I.findTile(null, 24);
    const ok = (bx, by) => { for (let y = by; y < by + H; y++) for (let x = bx; x < bx + W; x++) if (!I.walkable(x, y)) return false; return true; };
    for (let r = 0; r < 200 && !box; r += 2) for (let by = Math.max(2, (run0 ? run0.y : 100) - r); by <= Math.min(w.h - H - 2, (run0 ? run0.y : 100) + r) && !box; by += 2) for (let bx = 2; bx < w.w - W - 2; bx += 2) if (ok(bx, by)) { box = { bx, by }; break; }
    if (!box) return { err: 'no open patch' };
    const { bx, by } = box;
    for (let x = bx; x < bx + W; x++) { w.solid[by * w.w + x] = 1; w.solid[(by + H - 1) * w.w + x] = 1; }
    for (let y = by; y < by + H; y++) { w.solid[y * w.w + bx] = 1; w.solid[y * w.w + bx + W - 1] = 1; }
    // hero far away on walkable land (30+ tiles), so the walker only wanders
    let far = null;
    for (let d = 30; d < 120 && !far; d += 3) for (const [ox, oy] of [[d, 0], [-d, 0], [0, d], [0, -d]]) { const x = bx + 4 + ox, y = by + 4 + oy; if (x > 1 && y > 1 && x < w.w - 2 && y < w.h - 2 && I.walkable(x, y)) { far = { x, y }; break; } }
    if (!far) return { err: 'no far tile' };
    I.teleport(far.x, far.y); I.step(0, 0, 0.05);
    let pick = null;
    for (const sp of I.packSpecies) {
      I.clearCreatures();
      const uid = I.spawn(sp, bx + 4, by + 4); if (!uid) continue;
      const c = I.creatures().find((x) => x.uid === uid);
      if (c && c.mood !== 'hostile' && c.mood !== 'shy') { pick = { sp, uid, mood: c.mood }; break; }
    }
    if (!pick) return { err: 'no wandering species' };
    const T = I.tile; const get = () => I.creatures().find((x) => x.uid === pick.uid);
    const b0 = I.wallBumps(); let path = 0, out = 0, inWall = 0; let last = get(); let lx = last.x, ly = last.y;
    for (let i = 0; i < 800; i++) { // 40 s
      I.step(0, 0, 0.05);
      const c = get(); if (!c) break;
      path += Math.hypot(c.x - lx, c.y - ly); lx = c.x; ly = c.y;
      const tx = Math.floor(c.x / T), ty = Math.floor(c.y / T);
      if (tx <= bx || tx >= bx + W - 1 || ty <= by || ty >= by + H - 1) out++;
      if (w.solid[ty * w.w + tx]) inWall++;
    }
    return { sp: pick.sp, mood: pick.mood, bumps: I.wallBumps() - b0, path: +(path / T).toFixed(1), out, inWall, on: I.wslide };
  });
  await ctx.close();
  return r;
}

(async () => {
  const browser = await chromium.launch();
  const dbs = [], errors = [];
  const before = await run(browser, false, dbs, errors);
  const after = await run(browser, true, dbs, errors);
  console.log('  wslide=0: ' + JSON.stringify(before));
  console.log('  wslide=1: ' + JSON.stringify(after));
  check('setup: an open patch, a wandering (not hostile, not shy) creature in a walled pen', !before.err && !after.err && before.sp === after.sp, before.err || after.err);
  check('flag: ?wslide=0 turns the turn off, the default has it on', before.on === false && after.on === true);
  check('baseline: the old bounce hits the pen walls (>= 6 bumps in 40 s)', before.bumps >= 6, JSON.stringify(before));
  check('wall-turn: wall bumps drop to at most a third of the baseline', after.bumps * 3 <= before.bumps, JSON.stringify({ before: before.bumps, after: after.bumps }));
  check('wall-turn: the walker still wanders (path >= 70% of the baseline path and >= 5 tiles)', after.path >= 5 && after.path >= 0.7 * before.path, JSON.stringify({ before: before.path, after: after.path }));
  check('wall-turn: it never leaves the pen and never stands in a wall tile', after.out === 0 && after.inWall === 0, JSON.stringify(after));
  check('no page errors', errors.length === 0, errors.slice(0, 3).join(' | '));
  check('no DB traffic', dbs.every((d) => d.attempts() === 0));
  await browser.close();
  done();
})().catch((e) => { console.error(e); process.exit(1); });
