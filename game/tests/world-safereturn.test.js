// PLAYTEST-REVIEW-2 #4: safe return from a dungeon portal. Arriving through ?at= (the "Back to the world" link) gives a 3 s spawn shield on
// the portal tile; only when a live event's site is inside the view does the hero hop to the nearest quiet tile within 6 tiles (outside the
// event's spawn radius), so the raid does not spawn on top of the arrival. ?safereturn=0 restores today's 2 s and no hop.
// Deterministic (fixed seed, a saved event clock), phone 390x844, no console errors.
// Run: BASE=http://localhost:8440/game/index.html NODE_PATH=$(npm root -g) node game/tests/world-safereturn.test.js
const { chromium } = require('playwright');
const { check, done } = require('./helpers');
const O = require('../shared/mm-overworld.js');
const Z = require('../shared/mm-zones.js');
const ORIGIN = (process.env.BASE || 'http://localhost:8440/game/index.html').replace(/\/game\/index\.html.*$/, '');
const PAGE = ORIGIN + '/game/games/mad-maze/index.html';
const SEED = '12345';
const SAVE = { realm: { level: 3, xp: 0, shards: 0, bestWave: 0, items: [], nextUid: 1, eq: {} } };

async function open(browser, q, realmSave) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  await ctx.routeWebSocket(/.*/, (ws) => ws.close());
  await ctx.route('**/game/index.html*', (r) => r.fulfill({ contentType: 'text/html', body: '<!doctype html><title>town</title>town' }));
  const page = await ctx.newPage();
  page.errors = [];
  page.on('pageerror', (e) => page.errors.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error') page.errors.push('console: ' + m.text()); });
  await page.goto(ORIGIN + '/game/games/mad-maze/lantern.css');
  await page.evaluate(([v, r]) => { localStorage.clear(); localStorage.setItem('pixeltown-save-v1', v); localStorage.setItem('mm-aim-assist', '0'); if (r) localStorage.setItem('pixeltown-realm-v1', r); }, [JSON.stringify(SAVE), realmSave ? JSON.stringify(realmSave) : null]);
  page.errors.length = 0;
  await page.goto(PAGE + '?mode=world&test=1&seed=' + SEED + q);
  await page.waitForFunction(() => window.__mm && window.__mm.world && window.__mm.arena.active && window.__mm.arena.state === 'play', null, { timeout: 30000 });
  return { ctx, page };
}
const arrival = (page) => page.evaluate(() => { const a = window.__mm.arena, w = window.__mm.world; return { tile: [Math.floor(a.player.x / 32), Math.floor(a.player.y / 32)], iframes: a.player.iframes, last: w.safeReturn.last(), on: w.safeReturn.on, events: w.events().map((e) => ({ id: e.id, phase: e.phase, spawned: e.spawned })) }; });

// ---- find (in node, deterministic) an event whose site has a free tile 9 tiles east, and a quiet tile within 6 of that ----
const world = O.generate(SEED);
const free = (x, y) => x >= 0 && y >= 0 && x < world.w && y < world.h && !world.solid[y * world.w + x];
let pick = null;
for (let slot = 1; slot < 200 && !pick; slot++) {
  for (const ev of Z.eventsFor(world, slot * Z.EVENT_PERIOD + 150)) {
    if (!ev.active) continue;
    const plan = Z.eventPlan(world, ev); const s = plan.site; const at = [s.x + 9, s.y];
    if (!free(at[0], at[1])) continue;
    let quiet = false; for (let oy = -6; oy <= 6 && !quiet; oy++) for (let ox = -6; ox <= 6; ox++) if (free(at[0] + ox, at[1] + oy) && Math.hypot(at[0] + ox - s.x, at[1] + oy - s.y) >= Z.TABLES.EVENT_SPAWN_RADIUS + 0.5) { quiet = true; break; }
    if (!quiet) continue;
    // nothing else may be within the view of the arrival: no boss altar near (a site boss would muddy the raid check)
    if (world.bossSites.some((b) => Math.hypot(b.x - at[0], b.y - at[1]) < 20)) continue;
    pick = { ev, site: s, at, clock: Math.max(ev.startsAt + 5, slot * Z.EVENT_PERIOD + 1) };
    break;
  }
}

(async () => {
  const browser = await chromium.launch();
  const errs = [];
  check('a deterministic live event with a free arrival tile 9 tiles from its site exists', !!pick, JSON.stringify(pick));

  // ===== a quiet portal return: same tile, 3 s shield =====
  const portal = world.portalSites[0];
  const Q = await open(browser, '&at=' + portal.x + ',' + portal.y);
  const q1 = await arrival(Q.page);
  check('quiet return: the hero is on the returnTo (portal) tile with the 3 s spawn shield', q1.on === true && q1.tile[0] === portal.x && q1.tile[1] === portal.y && q1.last && q1.last.iframes >= 3 && q1.iframes > 0 && q1.iframes <= 3 && q1.last.moved === false && q1.last.events.length === 0, JSON.stringify(q1));
  const sw = await Q.page.evaluate(() => document.documentElement.scrollWidth <= innerWidth);
  check('390x844: no horizontal scroll', sw);
  errs.push(...Q.page.errors); await Q.ctx.close();
  // a plain visit (no ?at=) is not a return: no shield beyond today's 2 s placement, no record
  const P = await open(browser, '');
  const p1 = await arrival(P.page);
  check('a plain visit (no ?at=) is not a return: no 3 s shield, nothing recorded', p1.iframes <= 2 && p1.last === null, JSON.stringify(p1));
  errs.push(...P.page.errors); await P.ctx.close();

  // ===== a return next to a live event: hop to the nearest quiet tile within 6, the raid does not spawn on arrival =====
  const rs = { v: 1, seed: SEED, version: 1, pos: { x: pick.at[0], y: pick.at[1] }, stats: {}, evT: pick.clock, evDone: [], returnTo: { x: pick.at[0], y: pick.at[1], seed: SEED } };
  const E = await open(browser, '&at=' + pick.at.join(','), rs);
  const e1 = await arrival(E.page);
  const dSite = Math.hypot(e1.tile[0] - pick.site.x, e1.tile[1] - pick.site.y);
  const hop = Math.max(Math.abs(e1.tile[0] - pick.at[0]), Math.abs(e1.tile[1] - pick.at[1]));
  check('event in view: the arrival records the live event and hops', e1.last && e1.last.moved === true && e1.last.events.indexOf(pick.ev.id) >= 0 && e1.last.from.x === pick.at[0] && e1.last.from.y === pick.at[1], JSON.stringify(e1.last));
  check('... to a quiet tile within 6 tiles, outside the event spawn radius (14 tiles), still shielded', hop >= 1 && hop <= 6 && dSite >= Z.TABLES.EVENT_SPAWN_RADIUS && e1.last.iframes >= 3 && e1.iframes > 0, JSON.stringify({ tile: e1.tile, hop, dSite, iframes: e1.iframes }));
  const ev1 = e1.events.find((x) => x.id === pick.ev.id);
  check('... and the event has not spawned on top of the hero', ev1 && ev1.phase === 'active' && ev1.spawned === 0, JSON.stringify(e1.events));
  errs.push(...E.page.errors); await E.ctx.close();

  // ===== ?safereturn=0: today's behaviour (portal tile, 2 s, the raid spawns 9 tiles away) =====
  const F = await open(browser, '&at=' + pick.at.join(',') + '&safereturn=0', rs);
  const f1 = await arrival(F.page);
  const evf = f1.events.find((x) => x.id === pick.ev.id);
  check('?safereturn=0: stays on the arrival tile with the old 2 s, nothing recorded, and the event spawns right there', f1.on === false && f1.tile[0] === pick.at[0] && f1.tile[1] === pick.at[1] && f1.iframes <= 2 && f1.last === null && evf && evf.spawned > 0, JSON.stringify(f1));
  errs.push(...F.page.errors); await F.ctx.close();

  check('no console or page errors', errs.length === 0, errs.slice(0, 3).join(' | '));
  await browser.close();
  done();
})();
