// DV1: dungeon mutators + deep runs on the standalone Mad Maze page (?mode=dungeon). MMEndgame.mutatorsFor picks one seeded mutator for a z2+
// dungeon (meadow / crypt; warren and bramble never), named on the HUD chip, applied on the MMDifficulty scale through MMEndgame.applyMutators.
// ?mut=0 = today's dungeon exactly. After a boss, an optional stairs down to floor 2 / 3 of the same biome (gear +1 tier per floor, capped T11) and a
// "Leave with your loot" off-ramp on every floor; each boss kill steps pity once. Offline: blockDb, 0 DB requests.
// Run: BASE=http://localhost:8440/game/index.html NODE_PATH=$(npm root -g) node game/tests/dungeon-mutators.test.js
const { chromium } = require('playwright');
const { check, done, blockDb } = require('./helpers');
const EG = require('../shared/mm-endgame.js');
const ORIGIN = (process.env.BASE || 'http://localhost:8440/game/index.html').replace(/\/game\/index\.html.*$/, '');
const PAGE = ORIGIN + '/game/games/mad-maze/index.html';
const URL = (q) => `${PAGE}?mode=dungeon&test=1&lv=2&${q}`;
const seedFor = (biome, id) => { for (let s = 1; s < 500; s++) if (EG.mutatorsFor(biome, undefined, String(s)).ids[0] === id) return s; return 0; };

async function open(browser, q, viewport) {
  const vp = viewport || { width: 1100, height: 700 }; const phone = vp.width < 500;
  const ctx = await browser.newContext({ viewport: vp, hasTouch: phone, isMobile: phone });
  const db = await blockDb(ctx);
  await ctx.routeWebSocket(/.*/, (ws) => ws.close());
  const page = await ctx.newPage();
  page.errors = [];
  page.on('pageerror', (e) => page.errors.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) page.errors.push('console: ' + m.text()); });
  await page.goto(URL(q));
  await ready(page);
  return { ctx, page, db };
}
async function ready(page) {
  await page.waitForFunction(() => window.__mm && window.__mm.dungeon && window.__mm.dungeon.room !== null, null, { timeout: 15000 });
  await page.waitForTimeout(250);
  await page.evaluate(() => {
    window.__mm.arena._hitPlayer = () => {};
    window.__walk = (target) => {
      const d = window.__mm.dungeon; const g = d.graph;
      const nbrs = (id) => g.doors.filter((x) => !x.cracked && (x.a === id || x.b === id)).map((x) => (x.a === id ? x.b : x.a));
      const prev = { [d.room]: null }; const q = [d.room];
      while (q.length) { const u = q.shift(); if (u === target) break; nbrs(u).forEach((v) => { if (!(v in prev)) { prev[v] = u; q.push(v); } }); }
      const path = []; for (let u = target; u !== null && u !== undefined; u = prev[u]) path.unshift(u);
      for (let i = 1; i < path.length; i++) {
        if (d.state.room(d.room).enemiesAlive > 0 && g.rooms[d.room].type !== 'boss') d.clearRoom();
        const r = d.enter(path[i]); if (!r.ok) return 'blocked at ' + path[i] + ': ' + r.reason;
      }
      return d.room;
    };
  });
}
const ev = (p, fn, arg) => p.evaluate(fn, arg);
async function killBoss(p) {
  await ev(p, () => window.__walk(window.__mm.dungeon.graph.bossRoomId));
  await p.waitForTimeout(200);
  for (let i = 0; i < 40; i++) {
    const dead = await ev(p, () => { const d = window.__mm.dungeon; if (d.state.boss.dead) return true; const e = d.boss(); if (e) window.__mm.arena._hitEnemy(e, 200); return false; });
    if (dead) break; await p.waitForTimeout(350);
  }
  await p.waitForTimeout(300);
}
// the room info the golden list compares: per room the template id, plan size and scale
const rooms = (p) => ev(p, () => { const d = window.__mm.dungeon; return d.graph.rooms.map((r) => ({ id: r.id, type: r.type, tpl: d.layout(r.id).tpl, plan: d.layout(r.id).plan, sc: d.scaleFor(r.id) })); });

(async () => {
  const browser = await chromium.launch();
  const errs = []; let dbHits = 0;
  const S = { brittle: seedFor('meadow', 'brittle'), swarm: seedFor('meadow', 'swarm'), mirror: seedFor('meadow', 'mirror'), narrow: seedFor('meadow', 'narrow'), dim: seedFor('meadow', 'dim'), swift: seedFor('crypt', 'swift') };
  const close = async (o) => { errs.push(...o.page.errors); dbHits += o.db.attempts(); await o.ctx.close(); };

  // ---- golden: ?mut=0 is today's dungeon (templates from MMRooms.select, scale = MMDifficulty.dungeonScale) ----
  const off = await open(browser, `seed=${S.brittle}&biome=meadow&mut=0`);
  const offRooms = await rooms(off.page);
  const gold = await ev(off.page, () => { const d = window.__mm.dungeon; const sel = MMRooms.select(d.graph, d.seed, 2, d.biome, d.narrow ? { narrow: true } : undefined); return { ids: d.graph.rooms.map((r) => sel.ids[r.id]), mut: d.mut, chip: !!document.getElementById('mm-mut'), sc: d.graph.rooms.map((r) => MMDifficulty.dungeonScale(d.biome, Math.max(1, d.depthOf(r.id) || 1), d.maxDepth, r.type === 'boss', { mode: 'classic' })) }; });
  check('?mut=0: no mutator, no chip, every room template is the MMRooms.select golden pick and every scale is the plain MMDifficulty one', gold.mut === null && !gold.chip && offRooms.every((r, i) => r.tpl === gold.ids[i]) && offRooms.every((r, i) => JSON.stringify(r.sc) === JSON.stringify(gold.sc[i])), JSON.stringify({ offRooms, gold }));
  await close(off);

  // ---- Brittle (meadow): seeded, named, applied within the clamps; rooms unchanged ----
  { const o = await open(browser, `seed=${S.brittle}&biome=meadow`); const p = o.page;
    const m = await ev(p, () => { const d = window.__mm.dungeon; const el = document.getElementById('mm-mut'); return { mut: d.mut, chip: el ? el.textContent : '', role: el && el.getAttribute('role'), banner: (document.getElementById('realm-banner') || {}).textContent || '' }; });
    const want = EG.mutatorsFor('meadow', undefined, String(S.brittle));
    check('meadow: the mutator is the seeded MMEndgame.mutatorsFor pick (one by default) and the HUD chip names it', m.mut && m.mut.ids.join() === want.ids.join() && want.ids.join() === 'brittle' && m.chip.indexOf('Brittle') >= 0 && m.role === 'note', JSON.stringify(m));
    const on = await rooms(p);
    check('Brittle: same rooms as ?mut=0, and every scale is MMEndgame.applyMutators of the plain scale (hp x0.85, damage never raised)', on.every((r, i) => r.tpl === offRooms[i].tpl) && on.every((r, i) => JSON.stringify(r.sc) === JSON.stringify(EG.applyMutators(offRooms[i].sc, want))) && on.every((r, i) => r.sc.hp < offRooms[i].sc.hp && r.sc.dmg <= offRooms[i].sc.dmg), JSON.stringify(on.map((r) => r.sc)));
    const again = await open(browser, `seed=${S.brittle}&biome=meadow`); const m2 = await ev(again.page, () => window.__mm.dungeon.mut.ids.join());
    check('the pick is stable for the same seed (reload)', m2 === 'brittle', m2); await close(again);
    await close(o); }

  // ---- warren / bramble (z1) never ----
  for (const b of ['warren', 'bramble']) {
    const o = await open(browser, `seed=${S.brittle}&biome=${b}`);
    const m = await ev(o.page, () => ({ mut: window.__mm.dungeon.mut, chip: !!document.getElementById('mm-mut') }));
    check(b + ' (z1): never a mutator', m.mut === null && !m.chip, JSON.stringify(m));
    await close(o);
  }

  // ---- Swarm / Mirror / Narrow / Dim / Swift ----
  { const a = await open(browser, `seed=${S.swarm}&biome=meadow&mut=0`); const base = await rooms(a.page); await close(a);
    const o = await open(browser, `seed=${S.swarm}&biome=meadow`); const on = await rooms(o.page);
    const more = on.filter((r, i) => r.type === 'combat' && r.plan > base[i].plan).length;
    check('Swarm: more foes in some rooms (never above the plan of free spawn tiles), each weaker (hp scale <= 0.7x)', more >= 1 && on.every((r, i) => r.sc.hp <= base[i].sc.hp * 0.7 + 1e-9 || r.sc.hp === 0.4), JSON.stringify({ base: base.map((r) => r.plan), on: on.map((r) => r.plan) }));
    await close(o); }
  { const a = await open(browser, `seed=${S.mirror}&biome=meadow&mut=0`); const base = await rooms(a.page); await close(a);
    const o = await open(browser, `seed=${S.mirror}&biome=meadow`); const on = await rooms(o.page);
    const fb = base.filter((r) => r.type === 'combat').map((r) => r.tpl), fo = on.filter((r) => r.type === 'combat').map((r) => r.tpl);
    check('Mirror: the fighting rooms\' layouts come in reverse order (the other rooms stay)', fb.length >= 2 && fo.join() === fb.slice().reverse().join() && on.filter((r) => r.type !== 'combat').every((r) => r.tpl === base.find((x) => x.id === r.id).tpl), JSON.stringify({ fb, fo }));
    await close(o); }
  { const o = await open(browser, `seed=${S.narrow}&biome=meadow`); const on = await rooms(o.page);
    check('Narrow: every fighting room comes from the narrow pool', on.filter((r) => r.type === 'combat').every((r) => /^n-/.test(r.tpl)), JSON.stringify(on.map((r) => r.tpl)));
    await close(o); }
  { const o = await open(browser, `seed=${S.dim}&biome=meadow`); await o.page.waitForTimeout(400);
    const n = await ev(o.page, () => window.__mm.dungeon.dimDraws || 0);
    check('Dim: a cached vignette is drawn around the hero', n > 3, String(n)); await close(o); }
  { const o = await open(browser, `seed=${S.swift}&biome=crypt`); const on = await rooms(o.page); const mm = await ev(o.page, () => window.__mm.dungeon.mut);
    check('Swift (crypt): speed up at most 15%, damage, fire and wind-ups untouched by every mutator', mm.ids[0] === 'swift' && on.every((r) => r.sc.spd <= 1.4) && Object.keys(EG.MUTATORS).every((k) => { const fx = EG.MUTATORS[k].fx; return !(fx.dmg > 1) && !(fx.fire > 1) && !(fx.windup < 1); }) && EG.mutatorsFor('crypt', undefined, '1', { count: 2 }).fx.windup === 1, JSON.stringify({ mm, sc: on.map((r) => r.sc.spd) }));
    await close(o); }

  // ---- deep run: crypt floor 1 -> stairs -> floor 2 (+1 tier, same biome pool) -> leave with loot ----
  { const o = await open(browser, `seed=${S.swift}&biome=crypt`); const p = o.page;
    const pre = await ev(p, () => { const a = window.__mm.arena; a.save.gp = { b: 3, d: 4 }; window.__mm.dungeon.gp(); return { floor: window.__mm.dungeon.floor, deep: window.__mm.dungeon.deep }; });
    check('floor 1: deep-run rules from MMEndgame.deepRun (stairs onward, off-ramp, no timer)', pre.floor === 1 && pre.deep && pre.deep.nextStairs === true && pre.deep.offRamp === true && pre.deep.timer === false, JSON.stringify(pre));
    const noPanel = await ev(p, () => !document.getElementById('mm-deep'));
    await killBoss(p);
    const after = await ev(p, () => { const d = window.__mm.dungeon; const el = document.getElementById('mm-deep'); const dn = document.getElementById('mm-deep-down'), lv = document.getElementById('mm-deep-leave');
      const r = (b) => (b ? b.getBoundingClientRect() : { width: 0, height: 0 });
      return { dead: d.state.boss.dead, panel: !!el, txt: el ? el.textContent : '', down: dn ? dn.textContent : '', leave: lv ? lv.textContent : '', dw: r(dn).width, dh: r(dn).height, lh: r(lv).height, stairs: d.stairsPos(), portal: d.portalPos(), gp: d.gp(), gear: d.gear.map((g) => g.t), items: window.__mm.arena.save.items.length }; });
    check('after the boss: a calm choice "Stairs to floor 2" / "Leave with your loot" (44 px), no timer words; stairs and portal both on the floor', noPanel && after.dead && after.panel && /Stairs to floor 2/.test(after.down) && after.leave === 'Leave with your loot' && after.dh >= 44 && after.lh >= 44 && after.dw >= 44 && !!after.stairs && !!after.portal && !/\d+\s*s\b|hurry|timer|left/i.test(after.txt), JSON.stringify(after));
    const exGp = await ev(p, (g) => MMGearDrops.pityStep({ b: 3, d: 4 }, { src: 'dboss', biome: 'crypt' }, [{ t: g[0] }]), after.gear);
    check('the floor-1 boss steps the crypt pity once (MMGearDrops.pityStep), boss pity b untouched', after.gp.b === 3 && after.gp.d === exGp.d, JSON.stringify({ gp: after.gp, exGp, gear: after.gear }));
    const nav = p.waitForNavigation({ timeout: 15000 });
    await p.click('#mm-deep-down'); await nav; await ready(p);
    const f2 = await ev(p, () => { const d = window.__mm.dungeon; return { floor: d.floor, biome: d.biome, seed: d.seed, base: d.baseSeed, deep: d.deep, q: location.search, items: window.__mm.arena.save.items.length, chip: (document.getElementById('mm-mut') || {}).textContent || '' }; });
    check('the stairs load floor 2 of the same biome (own derived seed, +1 tier window, loot kept in the pack)', f2.floor === 2 && f2.biome === 'crypt' && f2.base === String(S.swift) && f2.seed !== f2.base && f2.deep.tierShift === 1 && /floor=2/.test(f2.q) && f2.items === after.items, JSON.stringify(f2));
    await killBoss(p);
    const g2 = await ev(p, () => ({ gear: window.__mm.dungeon.gear.map((g) => g.t), gp: window.__mm.dungeon.gp(), boss: window.__mm.dungeon.state.boss.dead }));
    const dr = EG.deepRun(2, 'crypt'); const allowed = dr.tiers.concat(dr.bossTiers);
    check('floor 2: every gear find is in the +1 tier window (capped at T11), and the boss kill steps pity once more', g2.boss && g2.gear.length >= 1 && g2.gear.every((t) => allowed.indexOf(t) >= 0 && t <= 11) && (g2.gp.d === 0 || g2.gp.d === exGp.d + 1), JSON.stringify({ g2, allowed }));
    await p.click('#mm-deep-leave');
    const sum = await ev(p, () => { const s = document.getElementById('mm-summary'); return { shown: s && !s.classList.contains('hidden'), floorRow: (s.querySelector('.mm-sum-floor') || {}).textContent || '', panel: !!document.getElementById('mm-deep'), items: window.__mm.arena.save.items.length }; });
    check('"Leave with your loot" on floor 2 opens the summary (Floor 2 of 3) and keeps every find', sum.shown && /Floor 2 of 3/.test(sum.floorRow) && !sum.panel && sum.items >= f2.items, JSON.stringify(sum));
    await close(o); }

  // ---- floor 3: the deepest floor offers only the off-ramp; ?deep=0 offers nothing ----
  { const o = await open(browser, `seed=${S.brittle}&biome=meadow&floor=3`); const p = o.page; await killBoss(p);
    const f3 = await ev(p, () => ({ floor: window.__mm.dungeon.floor, down: !!document.getElementById('mm-deep-down'), leave: !!document.getElementById('mm-deep-leave'), stairs: window.__mm.dungeon.stairsPos() }));
    check('floor 3 (max): no stairs further down, the "Leave with your loot" off-ramp is there', f3.floor === 3 && !f3.down && f3.leave && f3.stairs === null, JSON.stringify(f3)); await close(o); }
  { const o = await open(browser, `seed=${S.brittle}&biome=meadow&deep=0`); const p = o.page; await killBoss(p);
    const d0 = await ev(p, () => ({ panel: !!document.getElementById('mm-deep'), portal: !!window.__mm.dungeon.portalPos() }));
    check('?deep=0: no deep-run choice, the portal works as before', !d0.panel && d0.portal, JSON.stringify(d0)); await close(o); }

  // ---- the world portal names its dungeon's mutator (same seed the portal URL carries); ?mut=0 hides it ----
  for (const q of ['', '&mut=0']) {
    const ctx = await browser.newContext({ viewport: { width: 1000, height: 700 } }); const db = await blockDb(ctx); await ctx.routeWebSocket(/.*/, (ws) => ws.close());
    await ctx.route('**/game/index.html*', (r) => r.fulfill({ contentType: 'text/html', body: '<!doctype html><title>town</title>town' }));
    const p = await ctx.newPage(); const pe = []; p.on('pageerror', (e) => pe.push('pageerror: ' + e.message)); p.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) pe.push('console: ' + m.text()); });
    await p.goto(ORIGIN + '/game/games/mad-maze/lantern.css');
    await p.evaluate(() => { localStorage.clear(); localStorage.setItem('pixeltown-save-v1', JSON.stringify({ realm: { level: 4, xp: 0, shards: 0, bestWave: 0, items: [{ n: 1, id: 'sparkwand', r: 0 }], nextUid: 2, eq: { weapon: 1 } } })); });
    await p.goto(PAGE + '?mode=world&test=1&seed=12345' + q);
    await p.waitForFunction(() => window.__mm && window.__mm.world && window.__mm.arena.active && window.__mm.arena.state === 'play', null, { timeout: 15000 });
    const r = await p.evaluate(async () => {
      const w = window.__mm.world, a = window.__mm.arena; const ps = w.portals(); const out = [];
      for (const pt of ps.filter((x) => x.biome === 'meadow' || x.biome === 'crypt' || x.biome === 'warren').slice(0, 4)) {
        a.player.x = pt.x + 10; a.player.y = pt.y; await new Promise((res) => requestAnimationFrame(() => requestAnimationFrame(() => requestAnimationFrame(res))));
        const el = document.getElementById('rw-portal-mut'); const m = MMEndgame.mutatorsFor(pt.biome, undefined, w.portalSeed(pt.i));
        out.push({ biome: pt.biome, shown: !!el && !el.classList.contains('hidden'), text: el ? el.textContent : '', want: m.label, btn: document.getElementById('rw-portal').textContent });
      }
      return out;
    });
    const z2 = r.filter((x) => x.biome !== 'warren');
    if (!q) check('world: standing on a z2 portal shows "Mutator: <name>" (its dungeon seed), the prompt text is unchanged; a warren portal shows none', z2.length >= 1 && z2.every((x) => x.shown && x.text === '✦ Mutator: ' + x.want && /^Enter \w+ dungeon$/.test(x.btn)) && r.filter((x) => x.biome === 'warren').every((x) => !x.shown), JSON.stringify(r));
    else check('world ?mut=0: no mutator label on any portal', r.length >= 1 && r.every((x) => !x.shown), JSON.stringify(r));
    errs.push(...pe); dbHits += db.attempts(); await ctx.close();
  }

  // ---- phone 390x844 ----
  { const o = await open(browser, `seed=${S.brittle}&biome=meadow`, { width: 390, height: 844 }); const p = o.page; await killBoss(p);
    const m = await ev(p, () => { const r = (id) => document.getElementById(id).getBoundingClientRect(); const c = r('mm-mut'), dp = r('mm-deep'), dn = r('mm-deep-down'), lv = r('mm-deep-leave'); const map = document.getElementById('mm-map').getBoundingClientRect();
      return { docW: document.documentElement.scrollWidth, vw: innerWidth, dpL: dp.left, dpR: dp.right, dnH: dn.height, lvH: lv.height, chipR: c.right, chipB: c.bottom, mapL: map.left, mapHidden: document.getElementById('mm-map').classList.contains('hidden'), fs: parseFloat(getComputedStyle(document.getElementById('mm-mut')).fontSize) }; });
    check('phone: deep-run buttons >= 44 px, the panel and chip fit the screen (no horizontal scroll), chip clear of the map, text >= 12 px', m.docW <= m.vw && m.dpL >= 0 && m.dpR <= m.vw && m.dnH >= 44 && m.lvH >= 44 && m.chipR <= m.vw && (m.mapHidden || m.chipR <= m.mapL + 0.5) && m.fs >= 12, JSON.stringify(m));
    await close(o); }

  check('no DB requests (blockDb)', dbHits === 0, String(dbHits));
  check('no page or console errors', errs.length === 0, errs.join(' | '));
  await browser.close();
  done();
})();
