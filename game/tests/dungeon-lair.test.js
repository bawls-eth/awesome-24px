// BL2 boss lair: ?mode=dungeon&lair=1 builds a 2-room dungeon (antechamber + boss hall) behind a key door, the biome boss has 1.3x HP, the bag is a tier higher.
// Without lair nothing changes. Serve the repo root, then:  BASE=http://localhost:8664/game/index.html NODE_PATH=$(npm root -g) node game/tests/dungeon-lair.test.js
const { chromium } = require('playwright');
const { check, done } = require('./helpers');
const ORIGIN = (process.env.BASE || 'http://localhost:8440/game/index.html').replace(/\/game\/index\.html.*$/, '');
const URL = (q) => `${ORIGIN}/game/games/mad-maze/index.html?mode=dungeon&test=1&${q}`;

async function open(browser, q, ctxOpts) {
  const ctx = await browser.newContext(ctxOpts || { viewport: { width: 1100, height: 700 } });
  const page = await ctx.newPage(); page.errors = [];
  page.on('pageerror', (e) => page.errors.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error') page.errors.push('console: ' + m.text()); });
  await page.goto(URL(q));
  await page.waitForFunction(() => window.__mm && window.__mm.dungeon && window.__mm.dungeon.room !== null);
  await page.evaluate(() => { window.__mm.arena._hitPlayer = () => {}; });
  return { ctx, page };
}
const ev = (p, fn, arg) => p.evaluate(fn, arg);

(async () => {
  const browser = await chromium.launch();
  const errs = [];
  for (const biome of ['bramble', 'crypt']) {
    const r = await open(browser, `biome=${biome}&seed=7&lair=1&difficulty=off`); const p = r.page; errs.push(...r.page.errors);
    const g = await ev(p, () => { const d = window.__mm.dungeon; return { lair: d.lair, n: d.graph.rooms.length, types: d.graph.rooms.map((q) => q.type).join(), doors: d.graph.doors.map((x) => x.locked), hp: d.state.boss.maxHp, cur: d.room, mobs: d.mobs(), name: document.body.dataset.dungeonBiome }; });
    check(`${biome} lair: exactly 2 rooms (antechamber start + boss), one locked door, biome kept`, g.lair && g.n === 2 && g.types === 'start,boss' && g.doors.length === 1 && g.doors[0] === true && g.name === biome, JSON.stringify(g));
    check(`${biome} lair: boss HP is 1.3x the normal 260 (338); the antechamber has guards`, g.hp === Math.ceil(260 * 1.3) && g.mobs > 0, JSON.stringify(g));
    // the hall is locked until the key is taken from the antechamber
    // the key lies at the room centre; park the hero away from it so pickup is a deliberate step
    await ev(p, () => { const a = window.__mm.arena; a.player.x = 120; a.player.y = 120; });
    await ev(p, () => window.__mm.dungeon.clearRoom());
    const locked = await ev(p, () => { const d = window.__mm.dungeon; const r1 = d.enter(1); return { r1, status: d.doors()[0].status, k: !!d.keyPos(), keys: d.state.keys }; });
    check(`${biome} lair: cleared antechamber shows the key; without it the boss door stays locked (no entry)`, locked.r1.ok === false && locked.r1.reason === 'locked' && locked.status === 'locked' && locked.k && locked.keys === 0, JSON.stringify(locked));
    await ev(p, () => { const d = window.__mm.dungeon; const k = d.keyPos(); window.__mm.arena.player.x = k.x; window.__mm.arena.player.y = k.y; });
    await p.waitForFunction(() => window.__mm.dungeon.state.keys === 1, null, { timeout: 4000 }).catch(() => {});
    const enter = await ev(p, () => { const d = window.__mm.dungeon; const k = d.state.keys; const res = d.enter(1); return { k, ok: res.ok, room: d.room, boss: !!d.boss(), hp: d.boss() && d.boss().maxHp }; });
    check(`${biome} lair: with the key the door opens into the boss hall and the boss stands there with 338 HP`, enter.k === 1 && enter.ok && enter.room === 1 && enter.boss && enter.hp === 338, JSON.stringify(enter));
    await p.waitForTimeout(300);
    errs.push(...r.page.errors); await r.ctx.close();
  }
  { // key-door art on the locked door (b25 key_door), and the bag rarity on a kill
    const r = await open(browser, 'biome=meadow&seed=7&lair=1&difficulty=off'); const p = r.page;
    await p.waitForFunction(() => window.__mm.dungeon.tileArt() > 0, null, { timeout: 8000 }).catch(() => {});
    await ev(p, () => { const a = window.__mm.arena; a.player.x = 120; a.player.y = 120; window.__mm.dungeon.clearRoom(); });
    await p.waitForTimeout(500);
    const art = await ev(p, () => window.__mm.dungeon.doorArt());
    check('lair: the locked door is drawn with the b25 key_door art', art.length === 1 && art[0].status === 'locked' && art[0].art === 'key_door', JSON.stringify(art));
    await ev(p, () => { const d = window.__mm.dungeon; const a = window.__mm.arena; const k = d.keyPos(); a.player.x = k.x; a.player.y = k.y; });
    await p.waitForFunction(() => window.__mm.dungeon.state.keys === 1, null, { timeout: 4000 }).catch(() => {});
    const bags = await ev(p, () => { const d = window.__mm.dungeon; const a = window.__mm.arena; d.enter(1); a.bags.forEach((b) => { b.active = false; }); const e = d.boss(); a.player.hp = a.stats.maxHp; for (let i = 0; i < 60 && !d.state.boss.dead; i++) { d.state.boss.invulnerableUntil = -1; a.dungeon.hitBoss(e, 1e6); } return a.bags.filter((b) => b.active).map((b) => b.r).sort().join(); });
    check('lair: the boss bag is one tier higher (one bag at the top tier, the other at least uncommon)', bags.split(',').length === 2 && bags.split(',').includes('3') && bags.split(',').every((x) => +x >= 1), bags);
    errs.push(...r.page.errors); await r.ctx.close();
  }
  { // without lair nothing changes: full generated dungeon, boss HP unchanged
    const r = await open(browser, 'biome=bramble&seed=7&lv=2&difficulty=off'); const p = r.page;
    const g = await ev(p, () => { const d = window.__mm.dungeon; return { lair: d.lair, n: d.graph.rooms.length, hp: d.state.boss.maxHp }; });
    check('no ?lair: a normal multi-room dungeon and boss HP 260', !g.lair && g.n > 4 && g.hp === 260, JSON.stringify(g));
    errs.push(...r.page.errors); await r.ctx.close();
  }
  { // determinism: the lair is the same for the same seed (rooms, templates, guards)
    const sig = [];
    for (let i = 0; i < 2; i++) { const r = await open(browser, 'biome=crypt&seed=9&lair=1'); sig.push(await ev(r.page, () => { const d = window.__mm.dungeon; return JSON.stringify([d.layout(0), d.layout(1), d.state.boss.maxHp]); })); await r.ctx.close(); }
    check('lair is deterministic per seed (templates, guard count, boss HP)', sig[0] === sig[1], sig.join(' vs '));
  }
  { const r = await open(browser, 'biome=warren&seed=3&lair=1', { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
    const hs = await ev(r.page, () => document.documentElement.scrollWidth <= window.innerWidth + 1); errs.push(...r.page.errors);
    check('phone 390x844: no horizontal scroll in the lair', hs); await r.ctx.close(); }
  check('no console / page errors', errs.length === 0, errs.slice(0, 3).join(' | '));
  await browser.close();
  done();
})();
