// World status (slice S11): shrines apply healing / damaging / armored through arena.applyStatus (60 s, icon shown, hp / buffDmg / buffTaken stay equivalent),
// world creatures apply debuffs from their bolts by creature id (ice_wraith slows), the Shore is safe, one bolt status per 0.5 s, ?status=0 turns the debuffs off.
// Run: BASE=http://localhost:8582/game/index.html NODE_PATH=$(npm root -g) node game/tests/world-status.test.js
const { chromium } = require('playwright');
const { check, done } = require('./helpers');
const ORIGIN = (process.env.BASE || 'http://localhost:8440/game/index.html').replace(/\/game\/index\.html.*$/, '');
const PAGE = ORIGIN + '/game/games/mad-maze/index.html';
const WORLD = PAGE + '?mode=world&test=1&seed=12345';
const waitPlay = (page) => page.waitForFunction(() => window.__mm && window.__mm.arena.active && window.__mm.arena.state === 'play', null, { timeout: 15000 });
const W = (page, fn, arg) => page.evaluate(`(${fn.toString()})(window.__mm.arena, window.__mm.world, ${JSON.stringify(arg)})`);

async function open(browser, url, vp) {
  const ctx = await browser.newContext(vp || { viewport: { width: 1000, height: 700 } });
  await ctx.route('**/game/index.html*', (r) => r.fulfill({ contentType: 'text/html', body: '<!doctype html><title>town</title>town' }));
  await ctx.route('**/hub/index.html*', (r) => r.fulfill({ contentType: 'text/html', body: '<!doctype html><title>hub</title>hub' }));
  await ctx.routeWebSocket(/.*/, (ws) => ws.close()); // never reach the live DB
  const page = await ctx.newPage(); const errors = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  await page.goto(url); await waitPlay(page);
  return { ctx, page, errors };
}
const tpTo = (page, x, y) => W(page, (a, w, t) => { a.player.x = (t.x + 0.5) * 32; a.player.y = (t.y + 0.5) * 32; }, { x, y });
// Put the player at a shrine tile in `want` zone (or the spawn pad for 0), add a creature next to the player. Returns the zone under the player.
const setup = (page, zoneWanted) => W(page, (a, w, z) => {
  a.paused = false;
  if (z === 0) { a.player.x = (w.world.spawnPoint.x + 0.5) * 32; a.player.y = (w.world.spawnPoint.y + 0.5) * 32; }
  if (z > 0) { const s = w.sites().shrines.find((q) => q.zone >= z) || w.sites().shrines[0]; a.player.x = (s.x + 0.5) * 32; a.player.y = (s.y + 0.5) * 32; }
  a.enemies.forEach((e) => { e.active = false; });
  const e = a.spawnEnemy('aimed', a.player.x + 120, a.player.y); e.art = 'ice_wraith'; e.zone = z; e.hp = e.maxHp = 1e6; e.cd = 1e9;
  return w.world.zone[Math.floor(a.player.y / 32) * w.world.w + Math.floor(a.player.x / 32)];
}, zoneWanted);
// One enemy bolt landing on the player: fresh status state, an active bolt on top of the player, one arena step. Returns the status ids afterwards.
const HIT = `(a) => {
  a.enemies.forEach((e) => { if (e.art !== 'ice_wraith') e.active = false; }); // the world may have woken neighbours: the test's creature is the only shooter
  a.player.status = null; a.player._stm = null; a.player._stNext = Infinity; a.player.hp = a.stats.maxHp; a.player.iframes = 0; a.shield.hits = 0;
  const b = a.eBullets.find((q) => !q.active); b.active = true; b.x = a.player.x; b.y = a.player.y; b.vx = 0; b.vy = 0; b.life = 2; b.kind = 0; b.dm = 1;
  a._update(0.016); return a.statusOf('player').map((s) => s.id);
}`;
const hits = (page, n) => page.evaluate(`(() => { const a = window.__mm.arena; const f = ${HIT}; const seen = {}; for (let i = 0; i < ${n}; i++) f(a).forEach((id) => { seen[id] = (seen[id] || 0) + 1; }); return seen; })()`);

(async () => {
  const browser = await chromium.launch();
  const errs = [];

  // ---- (1) an ice_wraith bolt can slow; the table matches the plan ----
  const A = await open(browser, WORLD); errs.push(...A.errors); const page = A.page;
  const t = await W(page, (a, w) => ({ on: w.worldStatus.on, ice: w.worldStatus.forCreature('ice_wraith', 2), shore: w.worldStatus.forCreature('ice_wraith', 0), sp: w.worldStatus.forCreature('skeleton_archer', 2), im: w.worldStatus.forCreature('ember_imp', 3), sl: w.worldStatus.forCreature('swamp_leech', 2), gs: w.worldStatus.forCreature('goblin_shaman', 2), none: w.worldStatus.forCreature('slime_green', 2) }));
  check('creature table: ice_wraith slows (30%, 1.5 s), archers weaken, imp bleeds, leech sickens, shaman curses, plain creatures apply nothing', t.on && t.ice && t.ice.id === 'slowed' && t.ice.ch === 0.3 && t.ice.sec === 1.5 && t.sp.id === 'weak' && t.im.id === 'bleed' && t.sl.id === 'sick' && t.gs.id === 'curse' && t.none === null, JSON.stringify(t));
  const z2 = await setup(page, 2);
  check('the test spot is inland (zone above the Shore)', z2 > 0, String(z2));
  const seen = await hits(page, 300);
  check('an ice_wraith bolt can slow the player (a real bolt hit, ~30% of hits)', seen.slowed >= 30 && seen.slowed <= 160 && Object.keys(seen).every((k) => k === 'slowed'), JSON.stringify(seen));

  // ---- the 0.5 s limiter: one bolt-applied status per 0.5 s ----
  const lim = await W(page, (a, w) => {
    a.player.status = null; a.player._stm = null; a.player._stNext = Infinity;
    const r1 = w.worldStatus.roll('ice_wraith', 2, true); const r2 = w.worldStatus.roll('skeleton_archer', 2, true);
    a._stT += 0.6; const r3 = w.worldStatus.roll('skeleton_archer', 2, true);
    return { r1, r2, r3, ids: a.statusOf('player').map((s) => s.id) };
  });
  check('at most one bolt status per 0.5 s: the second is refused, then it applies after 0.6 s', lim.r1 === 'slowed' && lim.r2 === '' && lim.r3 === 'weak', JSON.stringify(lim));

  // ---- (2) the Shore is safe ----
  const z0 = await setup(page, 0);
  const shoreSeen = await hits(page, 300);
  const shoreRoll = await W(page, (a, w) => w.worldStatus.roll('ice_wraith', 1, true));
  check('on the Shore (zone 0) 300 ice_wraith bolt hits never apply a status, even forced', z0 === 0 && Object.keys(shoreSeen).length === 0 && shoreRoll === '', JSON.stringify([z0, shoreSeen, shoreRoll]));
  await setup(page, 2); await W(page, (a) => { a.enemies.forEach((e) => { if (e.active) e.zone = 0; }); });
  const shoreCreature = await hits(page, 300);
  check('a Shore-zone creature (zone 0) never applies a status even when the bolt lands inland', Object.keys(shoreCreature).length === 0, JSON.stringify(shoreCreature));

  // ---- (3) shrines show their status for ~60 s and keep the old numbers ----
  await W(page, (a) => { a.enemies.forEach((e) => { e.active = false; }); a.player.status = null; a.player._stm = null; a.player._stNext = Infinity; a.buffDmg = 1; a.buffTaken = 1; a._calcStats(); a.paused = false; });
  const sites = await W(page, (a, w) => w.sites());
  const kinds = {}; sites.shrines.forEach((s) => { kinds[s.kind] = kinds[s.kind] || s; });
  check('the seed has a heal, a rage and a ward shrine', !!(kinds.heal && kinds.rage && kinds.ward), JSON.stringify(Object.keys(kinds)));
  await tpTo(page, kinds.rage.x, kinds.rage.y);
  const base = await W(page, (a) => a.stats.dmg);
  const u = await W(page, (a, w, i) => { const r = w.useShrine(i); return { ok: r.ok, value: r.buff.value, st: a.statusOf('player'), bd: a.buffDmg, dmg: a.stats.dmg }; }, kinds.rage.i);
  const dm = u.st.find((s) => s.id === 'damaging');
  check('rage shrine: the damaging status for ~60 s and the damage total equals the shrine value', u.ok && dm && dm.left > 58 && dm.left <= 60 && Math.abs(u.dmg / base - Math.max(u.value, 1.25)) < 0.02, JSON.stringify([u, base]));
  await page.waitForTimeout(500);
  const icons = await W(page, (a) => a.statusIcons());
  check('the damaging icon is drawn on the HUD (18+ px, inside the page)', icons.some((i) => i.id === 'damaging' && i.size >= 18 && i.x >= 0 && i.y >= 0), JSON.stringify(icons));
  const ex = await W(page, (a) => { a._stT += 61; a._update(0.016); return { st: a.statusOf('player').map((s) => s.id), clock: a.clock }; });
  check('after 60 s the damaging status ends', !ex.st.includes('damaging'), JSON.stringify(ex));
  const wd = kinds.ward; await tpTo(page, wd.x, wd.y);
  const wu = await W(page, (a, w, i) => { const r = w.useShrine(i); return { ok: r.ok, st: a.statusOf('player').map((s) => s.id), bt: a.buffTaken }; }, wd.i);
  check('ward shrine: armored status shown and buffTaken stays below 1', wu.ok && wu.st.includes('armored') && wu.bt > 0 && wu.bt < 1, JSON.stringify(wu));
  const hl = kinds.heal; await tpTo(page, hl.x, hl.y);
  const hu = await W(page, (a, w, i) => { a.player.hp = 1; const r = w.useShrine(i); return { ok: r.ok, st: a.statusOf('player').map((s) => s.id), hp: a.player.hp }; }, hl.i);
  check('heal shrine: restores hp and shows the healing status', hu.ok && hu.st.includes('healing') && hu.hp > 10, JSON.stringify(hu));
  const cd = await W(page, (a, w, i) => w.useShrine(i), hl.i);
  check('the shrine keeps its 3 minute cooldown', cd.ok === false && cd.left > 170000 && cd.left <= 180000, JSON.stringify(cd));
  await A.ctx.close();

  // ---- (4) ?status=0 ----
  const B = await open(browser, WORLD + '&status=0'); errs.push(...B.errors);
  await setup(B.page, 2);
  const off = await W(B.page, (a, w) => ({ on: w.worldStatus.on, f: w.worldStatus.forCreature('ice_wraith', 2), r: w.worldStatus.roll('ice_wraith', 2, true) }));
  const offSeen = await hits(B.page, 300);
  check('?status=0: world debuffs are off (no bolt applies a status in 300 hits)', !off.on && off.f === null && off.r === '' && Object.keys(offSeen).length === 0, JSON.stringify([off, offSeen]));
  const offShrine = await W(B.page, (a, w) => { a.paused = false; const s = w.sites().shrines.find((q) => q.kind === 'rage'); a.player.x = (s.x + 0.5) * 32; a.player.y = (s.y + 0.5) * 32; const r = w.useShrine(s.i); return { ok: r.ok, st: a.statusOf('player').map((q) => q.id) }; });
  check('?status=0 still lets shrines work', offShrine.ok && offShrine.st.includes('damaging'), JSON.stringify(offShrine));
  await B.ctx.close();

  // ---- phone 390x844 ----
  const P = await open(browser, WORLD, { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true }); errs.push(...P.errors);
  const rg = await W(P.page, (a, w) => w.sites().shrines.find((s) => s.kind === 'rage'));
  await tpTo(P.page, rg.x, rg.y);
  await W(P.page, (a, w, i) => { w.useShrine(i); }, rg.i);
  await P.page.waitForTimeout(600);
  const ph = await W(P.page, (a) => ({ icons: a.statusIcons(), sw: document.documentElement.scrollWidth, vw: window.innerWidth }));
  check('phone 390x844: no horizontal scroll and the shrine icon is on screen', ph.sw <= ph.vw && ph.icons.some((i) => i.id === 'damaging' && i.x >= 0 && i.x + i.size <= ph.vw && i.y >= 0), JSON.stringify(ph));
  await P.ctx.close();

  check('no console errors', errs.length === 0, errs.slice(0, 4).join(' | '));
  await browser.close();
  done();
})().catch((e) => { console.error(e); process.exit(1); });
