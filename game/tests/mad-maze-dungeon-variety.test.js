// Layout-version-2 variety on the Mad Maze Warren page. No Firebase, no external network.
// Serve the repo root, then:  BASE=http://localhost:8456/game/index.html NODE_PATH=$(npm root -g) node game/tests/mad-maze-dungeon-variety.test.js
const { chromium } = require('playwright');
const { check, done } = require('./helpers');
const ORIGIN = (process.env.BASE || 'http://localhost:8440/game/index.html').replace(/\/game\/index\.html.*$/, '');
const PAGE = ORIGIN + '/game/games/mad-maze/index.html';
const URL = (seed, lv) => `${PAGE}?mode=dungeon&seed=${seed}${lv ? '&lv=' + lv : ''}&test=1`;

async function open(browser, seed, lv) {
  const ctx = await browser.newContext({ viewport: { width: 1100, height: 700 } });
  const page = await ctx.newPage();
  page.errors = [];
  page.on('pageerror', (e) => page.errors.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error') page.errors.push('console: ' + m.text()); });
  await page.goto(URL(seed, lv));
  await page.waitForFunction(() => window.__mm && window.__mm.dungeon && window.__mm.dungeon.room !== null);
  await page.waitForTimeout(250);
  await page.evaluate(() => { window.__mm.arena._hitPlayer = () => {}; });
  await page.evaluate(() => {
    window.__walk = (target, allowLocked) => {
      const d = window.__mm.dungeon; const gr = d.graph;
      const nbrs = (id) => gr.doors.filter((x) => (!x.cracked || d.state.secretOpen) && (x.a === id || x.b === id) && (allowLocked || !x.locked)).map((x) => (x.a === id ? x.b : x.a));
      const prev = { [d.room]: null }; const q = [d.room];
      while (q.length) { const u = q.shift(); if (u === target) break; nbrs(u).forEach((v) => { if (!(v in prev)) { prev[v] = u; q.push(v); } }); }
      const path = []; for (let u = target; u !== null && u !== undefined; u = prev[u]) path.unshift(u);
      for (let i = 1; i < path.length; i++) {
        if (d.state.room(d.room).enemiesAlive > 0 && gr.rooms[d.room].type !== 'boss') d.clearRoom();
        const r = d.enter(path[i]); if (!r.ok) return 'blocked at ' + path[i] + ': ' + r.reason;
      }
      if (d.state.room(d.room).enemiesAlive > 0 && gr.rooms[d.room].type !== 'boss') d.clearRoom();
      return d.room;
    };
  });
  return { ctx, page };
}
const ev = (page, fn, arg) => page.evaluate(fn, arg);
const floor = (page) => ev(page, () => { const d = window.__mm.dungeon; return { v: d.layoutVersion, gv: d.graph.layout, tpls: d.graph.rooms.map((r) => d.layout(r.id).tpl) }; });

(async () => {
  const browser = await chromium.launch();
  const seen = [];
  for (const seed of [11, 12, 13]) {
    const { ctx, page } = await open(browser, seed, 2);
    const f = await floor(page);
    check(`seed ${seed} lv=2: layout version 2 on the controller and the graph`, f.v === 2 && f.gv === 2, JSON.stringify(f));
    check(`seed ${seed}: the start room wall grid is 17x13 with the player on a floor tile`, await ev(page, () => { const ar = window.__mm.arena; const c = ar.walls.cells; const tx = Math.floor(ar.player.x / 40), ty = Math.floor(ar.player.y / 40); return ar.walls.rows === 13 && ar.walls.cols === 17 && !c[ty][tx]; }));
    seen.push(f.tpls.join(','));

    // traverse door to door over the generator's graph: key room (take the key), combat rooms, the locked vault, the boss
    const g = await ev(page, () => { const gr = window.__mm.dungeon.graph; return { key: gr.keyRoomId, boss: gr.bossRoomId, treasure: gr.rooms.find((r) => r.type === 'treasure').id, ids: gr.rooms.filter((r) => r.type === 'combat').map((r) => r.id) }; });
    const visited = [];
    const goto = async (id) => { const r = await ev(page, (a) => window.__walk(a), id); if (r === id) visited.push(id); return r; };
    let ok = (await goto(g.key)) === g.key;
    const kp = await ev(page, () => window.__mm.dungeon.keyPos());
    await ev(page, (k) => { const ar = window.__mm.arena; ar.player.x = k.x; ar.player.y = k.y; }, kp);
    await page.waitForTimeout(250);
    for (const id of g.ids) ok = ok && (await goto(id)) === id;
    const nb = await ev(page, (t) => { const gr = window.__mm.dungeon.graph; const dr = gr.doors.find((x) => x.locked); return dr.a === t ? dr.b : dr.a; }, g.treasure);
    ok = ok && (await goto(nb)) === nb;
    const ld = await ev(page, (t) => window.__mm.dungeon.doors().find((x) => x.other === t), g.treasure);
    await ev(page, (o) => { const ar = window.__mm.arena; ar.player.x = (o.tile.x + 0.5) * 40 + (o.dir === 'E' ? -30 : o.dir === 'W' ? 30 : 0); ar.player.y = (o.tile.y + 0.5) * 40 + (o.dir === 'S' ? -30 : o.dir === 'N' ? 30 : 0); }, ld);
    await page.waitForTimeout(400);
    const inVault = await ev(page, () => { const d = window.__mm.dungeon; return d.graph.rooms[d.room].type === 'treasure'; });
    check(`seed ${seed}: the key room, every combat room and the locked vault are reachable door to door`, ok && inVault, JSON.stringify({ ok, inVault, visited }));
    const bossWalk = await ev(page, (t) => window.__walk(t, true), g.boss);
    check(`seed ${seed}: the boss room is reachable`, bossWalk === g.boss, String(bossWalk));
    check(`seed ${seed}: every doorway of the boss room opens onto floor`, await ev(page, () => { const ar = window.__mm.arena; const d = window.__mm.dungeon; return d.doors().every((o) => { const x = o.tile.x + (o.dir === 'E' ? -1 : o.dir === 'W' ? 1 : 0), y = o.tile.y + (o.dir === 'S' ? -1 : o.dir === 'N' ? 1 : 0); return !ar.walls.cells[y][x]; }); }));
    check(`seed ${seed}: no console errors`, page.errors.length === 0, page.errors.join(' | '));
    await ctx.close();
  }
  check('three different seeds give three different first-floor layouts', new Set(seen).size === 3, seen.join(' || '));

  const a = await open(browser, 11, 2); const b = await open(browser, 11, 2);
  check('same seed + layout version gives the identical template list', JSON.stringify(await floor(a.page)) === JSON.stringify(await floor(b.page)));
  await a.ctx.close(); await b.ctx.close();
  const old = await open(browser, 40, undefined);
  const of = await floor(old.page);
  check('a link with a seed and no lv keeps layout 1 and the original golden templates', of.v === 1 && of.gv === 1 && of.tpls.join(',') === 'open,ring,hallway,center-block,cross-pillars,treasure,open,center-block,treasure', JSON.stringify(of));
  check('old-layout run has no console errors', old.page.errors.length === 0, old.page.errors.join(' | '));
  await old.ctx.close();
  await browser.close();
  done();
})();
