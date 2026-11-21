// Difficulty curve in the real pages: world creatures per zone, dungeon room scaling, ?difficulty=off, picnic, no console errors.
// Run: BASE=http://localhost:8541/game/index.html NODE_PATH=$(npm root -g) node game/tests/difficulty-curve.test.js
const { chromium } = require('playwright');
const { check, done } = require('./helpers');
const ORIGIN = (process.env.BASE || 'http://localhost:8440/game/index.html').replace(/\/game\/index\.html.*$/, '');
const PAGE = ORIGIN + '/game/games/mad-maze/index.html';
const SAVE = { realm: { level: 4, xp: 0, shards: 50, bestWave: 2, items: [], nextUid: 1, eq: {} } };

async function open(browser, q, waitFor, opts, mode) {
  const ctx = await browser.newContext(opts || { viewport: { width: 1000, height: 700 } });
  await ctx.route('**/game/index.html*', (r) => r.fulfill({ contentType: 'text/html', body: '<!doctype html><title>town</title>town' }));
  const page = await ctx.newPage();
  page.errors = [];
  page.on('pageerror', (e) => page.errors.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error') page.errors.push('console: ' + m.text()); });
  await page.goto(ORIGIN + '/game/games/mad-maze/lantern.css');
  await page.evaluate(([v, m]) => { localStorage.clear(); localStorage.setItem('pixeltown-save-v1', v); localStorage.setItem('mm-aim-assist', '0'); if (m) localStorage.setItem('pixeltown-mm-v1', JSON.stringify({ v: 1, heroes: [], stash: [], fame: 0, mode: m, hall: [], migratedFrom: null })); }, [JSON.stringify(SAVE), mode || null]);
  page.errors.length = 0;
  await page.goto(PAGE + '?' + q);
  await page.waitForFunction(waitFor, null, { timeout: 15000 });
  return { ctx, page };
}
const WORLD_READY = () => window.__mm && window.__mm.world && window.__mm.arena.active && window.__mm.arena.state === 'play';
const DUNGEON_READY = () => window.__mm && window.__mm.dungeon && window.__mm.dungeon.room !== null;
const frames = (page, n) => page.evaluate((k) => new Promise((res) => { let i = 0; const f = () => (++i >= k ? res() : requestAnimationFrame(f)); requestAnimationFrame(f); }), n);

// teleport next to a spawn group of each zone, let the spawner fill in, read the live creatures of that zone (hp relative to the creature's base hp)
async function zoneStats(page) {
  return page.evaluate(async () => {
    const a = window.__mm.arena, w = window.__mm.world; a.player.iframes = 1e9; a._hitPlayer = () => {};
    const out = {};
    for (const z of [0, 1, 2, 3]) {
      const gs = w.world.spawnGroups.filter((g) => g.zone === z); const g = gs[Math.floor(gs.length / 2)];
      a.player.x = (g.x + 0.5) * 32; a.player.y = (g.y + 0.5) * 32;
      for (let i = 0; i < 8; i++) await new Promise((r) => requestAnimationFrame(r));
      const es = w.liveEnemies().filter((e) => e.zone === z && Math.hypot(e.x - a.player.x, e.y - a.player.y) < 400);
      const mean = (f) => es.reduce((s, e) => s + f(e), 0) / Math.max(1, es.length);
      out[z] = { n: es.length, hp: mean((e) => e.hp / RM_ENEMIES[e.type].hp), dmg: mean((e) => e.dmg), spd: mean((e) => e.spd), diff: es.length ? es[0].diff : null, bolt: Math.round(8 * mean((e) => e.dmg)) };
    }
    return out;
  });
}

(async () => {
  const browser = await chromium.launch();
  const errs = [];

  // ===== world, difficulty on =====
  const W = await open(browser, 'mode=world&test=1&seed=12345', WORLD_READY);
  const on = await W.page.evaluate(() => ({ lib: typeof MMDifficulty, on: window.__mm.world.diffOn, mode: window.__mm.world.diffMode }));
  check('MMDifficulty is loaded and the world uses it (classic mode by default)', on.lib === 'object' && on.on === true && on.mode === 'classic', JSON.stringify(on));
  const zs = await zoneStats(W.page);
  console.log('INFO zones:', JSON.stringify(Object.fromEntries(Object.entries(zs).map(([z, v]) => [z, { n: v.n, hp: +v.hp.toFixed(2), dmg: +v.dmg.toFixed(2), spd: +v.spd.toFixed(2) }]))));
  check('every zone had live creatures to measure', [0, 1, 2, 3].every((z) => zs[z].n > 0), JSON.stringify(zs));
  check('creature hp (relative to base) is ordered shore < midlands < highlands < godlands', zs[0].hp < zs[1].hp && zs[1].hp < zs[2].hp && zs[2].hp < zs[3].hp);
  check('creature damage multiplier is ordered shore < midlands < highlands < godlands', zs[0].dmg < zs[1].dmg && zs[1].dmg < zs[2].dmg && zs[2].dmg < zs[3].dmg);
  check('creature speed multiplier never decreases going inward', zs[0].spd <= zs[1].spd && zs[1].spd <= zs[2].spd && zs[2].spd <= zs[3].spd);
  check('easy start: shore creatures have <= 75% hp (60% at the coast, plus the seeded +-5% jitter) and their bolts deal <= 6% of a level-1 hero (6 of 100)', zs[0].hp <= 0.75 && zs[0].bolt <= 6, JSON.stringify(zs[0]));
  check('godlands never unfair: a bolt is <= 35% of a level-20 hero (88 of 252)', zs[3].bolt <= 88 && zs[3].bolt > zs[0].bolt, String(zs[3].bolt));
  check('each live enemy records its scale (diff) for debugging', zs[0].diff && zs[0].diff.hp > 0 && zs[3].diff.hp > zs[0].diff.hp);
  errs.push(...W.page.errors); await W.ctx.close();

  // ===== world, ?difficulty=off: today's numbers =====
  const O = await open(browser, 'mode=world&test=1&seed=12345&difficulty=off', WORLD_READY);
  const offs = await zoneStats(O.page);
  const flag = await O.page.evaluate(() => window.__mm.world.diffOn);
  const T = await O.page.evaluate(() => MMZones.TABLES);
  check('?difficulty=off turns the curve off in the world', flag === false);
  const base = (z) => T.ZONE_MUL.dmg[z]; // shore dmg == the untouched zone x tier table, no scale applied
  check('?difficulty=off: shore creatures hit with exactly the old numbers (dmg 1.0, no scale record)', Math.abs(offs[0].dmg - 1) < 0.01 && offs[0].diff === null && offs[0].bolt === 8, JSON.stringify(offs[0]));
  check('?difficulty=off: godlands keep the old zone x tier multipliers', offs[3].dmg > base(3) && offs[3].dmg < base(3) * 1.31 + 0.01 && offs[3].diff === null, JSON.stringify(offs[3]));
  check('?difficulty=off is still ordered by zone (the old table) and has a shore creature at full hp', offs[0].hp >= 0.99 && offs[0].hp < offs[1].hp && offs[1].hp < offs[2].hp);
  errs.push(...O.page.errors); await O.ctx.close();

  // ===== picnic (Careful) mode =====
  const PN = await open(browser, 'mode=world&test=1&seed=12345', WORLD_READY, null, 'picnic');
  const pz = await zoneStats(PN.page);
  check('picnic mode: the world reads it and creatures hit about 0.8x as hard as in classic', (await PN.page.evaluate(() => window.__mm.world.diffMode)) === 'picnic' && pz[2].dmg < zs[2].dmg * 0.85 && pz[2].dmg > zs[2].dmg * 0.75 && Math.abs(pz[2].hp - zs[2].hp) < 0.01, JSON.stringify([pz[2], zs[2]]));
  errs.push(...PN.page.errors); await PN.ctx.close();

  // ===== dungeon: early rooms weak, deep rooms hard =====
  const D = await open(browser, 'mode=dungeon&test=1&seed=11&lv=2&biome=crypt', DUNGEON_READY);
  const info = await D.page.evaluate(() => {
    const d = window.__mm.dungeon; const ids = d.graph.rooms.map((r, i) => i);
    const rooms = ids.map((id) => ({ id, type: d.graph.rooms[id].type, depth: d.depthOf(id), sc: d.scaleFor(id) }));
    return { on: d.diffOn, max: d.maxDepth, rooms };
  });
  const fight = info.rooms.filter((r) => r.type === 'combat' || r.type === 'key');
  const shallow = fight.filter((r) => r.depth === 1)[0], deep = fight.slice().sort((a, b) => b.depth - a.depth)[0];
  const boss = info.rooms.find((r) => r.type === 'boss');
  console.log('INFO dungeon depths:', info.rooms.map((r) => r.type[0] + r.depth).join(' '), 'max', info.max);
  check('dungeon scaling is on and every room carries a scale', info.on === true && info.rooms.every((r) => r.sc && r.sc.hp > 0));
  check('the first room (depth 1) is weaker than the deepest fight room (hp and dmg)', shallow && deep && deep.depth > shallow.depth && shallow.sc.hp < deep.sc.hp && shallow.sc.dmg < deep.sc.dmg, JSON.stringify([shallow, deep]));
  check('the boss room is the hardest (hp >= every other room)', info.rooms.every((r) => r.sc.hp <= boss.sc.hp + 1e-9) && boss.sc.dmg >= deep.sc.dmg);
  // enter a real depth-1 room and check the live enemies actually carry it
  const live = await D.page.evaluate((target) => {
    const d = window.__mm.dungeon; d.state.enemiesAlive; window.__mm.arena._hitPlayer = () => {};
    const r = d.enter(target); if (!r.ok) return { err: r.reason };
    return { mobs: d.mobsInfo(), sc: d.scaleFor(target) };
  }, shallow.id);
  check('enemies spawned in a depth-1 room use that room\'s scale (dmgMul and speedMul match)', !live.err && live.mobs.length > 0 && live.mobs.every((m) => Math.abs(m.dmg - live.sc.dmg) < 1e-9 && Math.abs(m.spd - live.sc.spd) < 1e-9), JSON.stringify(live));
  check('the depth-1 room has weak enemies: dmgMul below 1', live.mobs && live.mobs.every((m) => m.dmg < 1));
  errs.push(...D.page.errors); await D.ctx.close();

  const D0 = await open(browser, 'mode=dungeon&test=1&seed=11&lv=2&biome=crypt&difficulty=off', DUNGEON_READY);
  const off = await D0.page.evaluate(() => { const d = window.__mm.dungeon; return { on: d.diffOn, sc: d.graph.rooms.map((r, i) => d.scaleFor(i)) }; });
  check('?difficulty=off in a dungeon: every room scale is exactly 1x', off.on === false && off.sc.every((s) => s.hp === 1 && s.dmg === 1 && s.spd === 1 && s.count === 1));
  errs.push(...D0.page.errors); await D0.ctx.close();

  // ===== phone: still no horizontal scroll =====
  const PH = await open(browser, 'mode=world&test=1&seed=12345', WORLD_READY, { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  check('390x844 phone: no horizontal scroll with the curve on', await PH.page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1));
  errs.push(...PH.page.errors); await PH.ctx.close();

  check('no console or page errors', errs.length === 0, errs.slice(0, 3).join(' | '));
  await browser.close();
  done();
})();
