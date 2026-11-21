// PLAYTEST-REVIEW-2 #1: zone gradient and soft borders. Wide zone bands (the first midlands tile is >= 40 tiles from the spawn), a border
// toast in the banner ("Midlands: Dangerous, recommended Lv 5") on every walked crossing, and a 1 s slow on the FIRST crossing into a zone
// above the hero's level. ?zonegrad=0 restores today's world (classic bands, no toast, no slow); ?bands=classic only the old generation.
// Deterministic (fixed seed, the player is placed tile by tile), phone 390x844, no console errors.
// Run: BASE=http://localhost:8440/game/index.html NODE_PATH=$(npm root -g) node game/tests/world-gradient.test.js
const { chromium } = require('playwright');
const { check, done } = require('./helpers');
const O = require('../shared/mm-overworld.js');
const ORIGIN = (process.env.BASE || 'http://localhost:8440/game/index.html').replace(/\/game\/index\.html.*$/, '');
const PAGE = ORIGIN + '/game/games/mad-maze/index.html';
const SEED = '4242';
const SAVE = { realm: { level: 1, xp: 0, shards: 0, bestWave: 0, items: [], nextUid: 1, eq: {} } };

// ---- node: the generator ----
const minMid = (w) => { const sp = w.spawnPoint; let m = Infinity; for (let i = 0; i < w.zone.length; i++) { const z = w.zone[i]; if (z >= 1 && z <= 3) { const d = Math.hypot((i % w.w) - sp.x, ((i / w.w) | 0) - sp.y); if (d < m) m = d; } } return m; };
const seeds = Array.from({ length: 12 }, (_, i) => 'grad-' + i);
const wide = seeds.map((s) => minMid(O.generate(s)));
const classic = seeds.map((s) => minMid(O.generate(s, { bands: 'classic' })));
check('wide bands (default): the first midlands tile is >= 40 tiles from the spawn on 12 seeds', wide.every((d) => d >= 40), wide.map((d) => d.toFixed(0)).join(','));
check('?bands=classic generation keeps the old, close midlands (every seed < 40 tiles)', classic.every((d) => d < 40), classic.map((d) => d.toFixed(0)).join(','));

async function open(browser, q) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  await ctx.routeWebSocket(/.*/, (ws) => ws.close());
  await ctx.route('**/game/index.html*', (r) => r.fulfill({ contentType: 'text/html', body: '<!doctype html><title>town</title>town' }));
  const page = await ctx.newPage();
  page.errors = [];
  page.on('pageerror', (e) => page.errors.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error') page.errors.push('console: ' + m.text()); });
  await page.goto(ORIGIN + '/game/games/mad-maze/lantern.css');
  await page.evaluate((v) => { localStorage.clear(); localStorage.setItem('pixeltown-save-v1', v); localStorage.setItem('mm-aim-assist', '0'); }, JSON.stringify(SAVE));
  page.errors.length = 0;
  await page.goto(PAGE + '?mode=world&test=1&seed=' + SEED + q);
  await page.waitForFunction(() => window.__mm && window.__mm.world && window.__mm.arena.active && window.__mm.arena.state === 'play', null, { timeout: 15000 });
  await page.evaluate(() => { const a = window.__mm.arena; a.player.iframes = 1e9; a._hitPlayer = () => {}; });
  return { ctx, page };
}
// a walkable border pair: tile A in zone `from`, its 4-neighbour B in zone `to` (both free, not water), nearest the spawn
const border = (page, from, to) => page.evaluate(([f, t]) => {
  const W = window.__mm.world.world; const N = W.w; const sp = W.spawnPoint; let best = null; let bd = Infinity;
  const ok = (i) => !W.solid[i] && W.terrain[i] !== 1 && W.terrain[i] !== 0;
  for (let i = 0; i < N * W.h; i++) {
    if (W.zone[i] !== f || !ok(i)) continue; const x = i % N; const y = (i / N) | 0;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const j = (y + dy) * N + x + dx; if (x + dx < 0 || y + dy < 0 || x + dx >= N || y + dy >= W.h || W.zone[j] !== t || !ok(j)) continue;
      const d = Math.hypot(x - sp.x, y - sp.y); if (d < bd) { bd = d; best = { a: [x, y], b: [x + dx, y + dy] }; }
    }
  }
  return best;
}, [from, to]);
// put the hero on a tile and run the HUD sync (what the 4 Hz tick does)
const stand = (page, t) => page.evaluate((q) => { const a = window.__mm.arena, w = window.__mm.world; a.player.x = (q[0] + 0.5) * 32; a.player.y = (q[1] + 0.5) * 32; w.syncHud(false); return { last: w.zoneGrad.last(), n: w.zoneGrad.crossings(), banner: document.getElementById('realm-banner').textContent, slow: w.zoneGrad.slowLeft(), scale: w.zoneGrad.moveScale() }; }, t);
const wait = (page, s) => page.evaluate((sec) => new Promise((res) => { const a = window.__mm.arena; const t0 = a.clock; const f = () => (a.clock - t0 >= sec ? res() : requestAnimationFrame(f)); requestAnimationFrame(f); }), s);

(async () => {
  const browser = await chromium.launch();
  const errs = [];

  // ===== default: wide bands, toast + first-crossing slow =====
  const D = await open(browser, '');
  const info = await D.page.evaluate(() => { const w = window.__mm.world; return { on: w.zoneGrad.on, bands: w.zoneGrad.bands, rec: [0, 1, 2, 3].map(w.zoneGrad.recLv), hash: window.MMOverworld.hash(w.world) }; });
  check('page: zone gradient on, wide bands, recommended levels 1/5/10/15', info.on === true && info.bands === 'wide' && info.rec.join() === '1,5,10,15', JSON.stringify(info));
  check('page world = the generator default for the seed (deterministic)', info.hash === O.hash(O.generate(SEED)));
  const sm = await border(D.page, 0, 1);
  check('a walkable shore -> midlands border exists', !!sm, JSON.stringify(sm));
  await stand(D.page, sm.a); await wait(D.page, 0.3);
  const c1 = await stand(D.page, sm.b);
  check('walking into the Midlands shows the toast "Midlands: Dangerous, recommended Lv 5" in the banner', c1.banner === 'Midlands: Dangerous, recommended Lv 5' && c1.last && c1.last.zone === 1, JSON.stringify(c1));
  check('... the first crossing below the recommended level slows the hero for 1 s (move x0.5)', c1.last.first === true && c1.last.slowed === true && c1.slow > 0.9 && c1.slow <= 1 && Math.abs(c1.scale - 0.5) < 1e-9, JSON.stringify(c1));
  await wait(D.page, 1.1);
  const after = await D.page.evaluate(() => ({ slow: window.__mm.world.zoneGrad.slowLeft(), scale: window.__mm.world.zoneGrad.moveScale() }));
  check('... and the slow ends after 1 s', after.slow === 0 && after.scale === 1, JSON.stringify(after));
  await stand(D.page, sm.a); await wait(D.page, 0.3);
  const back = await stand(D.page, sm.a);
  const c2 = await stand(D.page, sm.b);
  check('walking back to the shore toasts it too, and a second Midlands crossing does not slow again', back.last.zone === 0 && /^Shore: Safe-ish, recommended Lv 1$/.test(back.last.text) && c2.last.zone === 1 && c2.last.first === false && c2.last.slowed === false && c2.scale === 1, JSON.stringify([back.last, c2]));
  const mh = await border(D.page, 1, 2);
  await D.page.evaluate(() => { window.__mm.arena.save.level = 12; });
  await stand(D.page, mh.a); await wait(D.page, 0.3); await stand(D.page, mh.a);
  const c3 = await stand(D.page, mh.b);
  check('a Lv 12 hero entering the Highlands (Lv 10) gets the toast but no slow', c3.banner === 'Highlands: Deadly, recommended Lv 10' && c3.last.first === true && c3.last.slowed === false && c3.scale === 1, JSON.stringify(c3));
  const n0 = c3.n;
  const tp = await stand(D.page, sm.a); // a jump of many tiles (a placement or a test hook) is not a walk: no toast
  check('a teleport across zones is not a crossing (no toast)', tp.n === n0, JSON.stringify(tp));
  const sw = await D.page.evaluate(() => document.documentElement.scrollWidth <= innerWidth);
  check('390x844: no horizontal scroll', sw);
  errs.push(...D.page.errors); await D.ctx.close();

  // ===== ?zonegrad=0: today's world (classic bands), no toast, no slow =====
  const Z = await open(browser, '&zonegrad=0');
  const zi = await Z.page.evaluate(() => { const w = window.__mm.world; return { on: w.zoneGrad.on, bands: w.zoneGrad.bands, classic: w.bandsClassic, hash: window.MMOverworld.hash(w.world) }; });
  check('?zonegrad=0: off, classic bands, the world is byte-identical to generate(seed, {bands: classic})', zi.on === false && zi.bands === 'classic' && zi.classic === true && zi.hash === O.hash(O.generate(SEED, { bands: 'classic' })), JSON.stringify(zi));
  const zb = await border(Z.page, 0, 1);
  const bn0 = await Z.page.evaluate(() => document.getElementById('realm-banner').textContent);
  await stand(Z.page, zb.a); await wait(Z.page, 0.3); await stand(Z.page, zb.a);
  const z1 = await stand(Z.page, zb.b);
  check('?zonegrad=0: crossing into the Midlands shows no toast and does not slow', z1.last === null && z1.n === 0 && z1.scale === 1 && z1.banner === bn0, JSON.stringify(z1));
  errs.push(...Z.page.errors); await Z.ctx.close();

  // ===== ?bands=classic: the old generation, toasts kept =====
  const C = await open(browser, '&bands=classic');
  const ci = await C.page.evaluate(() => { const w = window.__mm.world; return { on: w.zoneGrad.on, bands: w.zoneGrad.bands, hash: window.MMOverworld.hash(w.world) }; });
  check('?bands=classic: classic generation (same hash as ?zonegrad=0) with the toasts still on', ci.on === true && ci.bands === 'classic' && ci.hash === zi.hash, JSON.stringify(ci));
  errs.push(...C.page.errors); await C.ctx.close();

  check('no console or page errors', errs.length === 0, errs.slice(0, 3).join(' | '));
  await browser.close();
  done();
})();
