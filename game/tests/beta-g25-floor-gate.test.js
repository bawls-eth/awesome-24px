// G-25 (b03-07): ?floor= is clamped to the deepest floor this device has cleared in that biome + 1 (pixeltown-deep-v1, written when a floor's
// boss falls). A fresh save asking for floor 3 starts on floor 1 with a toast; a save with floor 2 cleared may start floor 3; the clamped run
// rolls floor-1 loot; ?test=1 keeps bypassing it (deep-run tests) unless ?floorgate=1. Offline: blockDb + every WebSocket closed, no chat.
// Run: BASE=http://localhost:8440/game/index.html node game/tests/beta-g25-floor-gate.test.js
const { chromium } = require('playwright');
const { check, done, blockDb } = require('./helpers');
const ORIGIN = (process.env.BASE || 'http://localhost:8440/game/index.html').replace(/\/game\/index\.html.*$/, '');
const PAGE = ORIGIN + '/game/games/mad-maze/index.html';

(async () => {
  const browser = await chromium.launch();
  const run = async (query, deep, plain) => {
    const ctx = await browser.newContext({ viewport: { width: 1000, height: 700 } });
    await blockDb(ctx); await ctx.routeWebSocket(/.*/, (ws) => ws.close());
    await ctx.route('**/game/index.html*', (r) => r.fulfill({ contentType: 'text/html', body: '<!doctype html>town' }));
    await ctx.route('**/hub/index.html*', (r) => r.fulfill({ contentType: 'text/html', body: '<!doctype html>hub' }));
    const page = await ctx.newPage(); const errors = [];
    page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
    await page.goto(ORIGIN + '/game/games/mad-maze/lantern.css');
    await page.evaluate((d) => { localStorage.clear(); if (d) localStorage.setItem('pixeltown-deep-v1', d); }, deep ? (typeof deep === 'string' ? deep : JSON.stringify(deep)) : null);
    await page.goto(PAGE + '?mode=dungeon&lv=2&biome=crypt&seed=5&' + query);
    if (plain) await page.waitForFunction(() => { const b = document.getElementById('realm-banner'); return b && /Crypt|Floor/.test(b.textContent); }, null, { timeout: 20000 }).catch(() => {});
    else await page.waitForFunction(() => window.__mm && window.__mm.dungeon && window.__mm.arena.active, null, { timeout: 20000 });
    const o = await page.evaluate(() => ({ banner: (document.getElementById('realm-banner') || {}).textContent || '', chip: (document.getElementById('mm-mut') || {}).textContent || '', api: window.__mm && window.__mm.dungeon ? { floor: window.__mm.dungeon.floor, want: window.__mm.dungeon.floorWant, clamped: window.__mm.dungeon.floorClamped, shift: window.__mm.dungeon.deep ? window.__mm.dungeon.deep.tierShift : null } : null }));
    await ctx.close();
    return Object.assign(o, { errors });
  };
  const fresh = await run('floor=3', null, true);
  check('1. a fresh save + ?floor=3 (a real player page) starts floor 1 with a toast saying so', /Floor 3 opens after you clear floor 1: starting on floor 1/.test(fresh.banner) && !/Floor 3/.test(fresh.chip), JSON.stringify(fresh));
  const gated = await run('floor=3&test=1&floorgate=1');
  check('1b. with the gate on: floor 1, floorClamped, the floor-1 loot window (no tier shift)', gated.api && gated.api.floor === 1 && gated.api.want === 3 && gated.api.clamped === true && !(gated.api.shift > 0), JSON.stringify(gated));
  const two = await run('floor=3&test=1&floorgate=1', { v: 1, f: { crypt: 2 } });
  check('2. a save with crypt floor 2 cleared may start floor 3', two.api && two.api.floor === 3 && two.api.clamped === false && /Floor 3/.test(two.banner), JSON.stringify(two));
  const other = await run('floor=2&test=1&floorgate=1', { v: 1, f: { warren: 3 } });
  check('2b. clearing another biome does not open crypt floor 2', other.api && other.api.floor === 1 && other.api.clamped, JSON.stringify(other));
  const bypass = await run('floor=3&test=1');
  check('4. ?test=1 alone still bypasses the gate (deep-run tests keep their seeded floors)', bypass.api && bypass.api.floor === 3 && !bypass.api.clamped, JSON.stringify(bypass));
  const bad = await run('floor=2&test=1&floorgate=1', 'not json');
  check('5. a corrupt pixeltown-deep-v1 counts as nothing cleared (floor 1), no errors', bad.api && bad.api.floor === 1 && bad.errors.length === 0, JSON.stringify(bad));
  check('no page errors', [fresh, gated, two, other, bypass].every((x) => x.errors.length === 0), [fresh, gated, two, other, bypass].map((x) => x.errors.join('|')).join(' / '));
  await browser.close();
  done();
})().catch((e) => { console.error(e); process.exit(1); });
