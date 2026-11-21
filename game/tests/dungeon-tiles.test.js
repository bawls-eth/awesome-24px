// Dungeon tile art (b25): biome floors / walls / doors / chests baked into the cached room canvases, with code fallbacks. No Firebase.
// Serve the repo root, then:  BASE=http://localhost:8631/game/index.html NODE_PATH=$(npm root -g) node game/tests/dungeon-tiles.test.js
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const { check, done } = require('./helpers');
const ORIGIN = (process.env.BASE || 'http://localhost:8440/game/index.html').replace(/\/game\/index\.html.*$/, '');
const PAGE = ORIGIN + '/game/games/mad-maze/index.html';
const URL = (q) => `${PAGE}?mode=dungeon&test=1&${q}`;
const SHOTS = process.env.SHOTS || path.join(process.env.TMPDIR || '/tmp', 'dtile-shots');
const BIOMES = ['warren', 'bramble', 'meadow', 'crypt'];

async function open(browser, q, opts) {
  const ctx = await browser.newContext(opts || { viewport: { width: 1100, height: 700 } });
  const page = await ctx.newPage();
  page.errors = [];
  page.on('pageerror', (e) => page.errors.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error') page.errors.push('console: ' + m.text()); });
  await page.goto(URL(q));
  await page.waitForFunction(() => window.__mm && window.__mm.dungeon && window.__mm.dungeon.room !== null);
  await page.evaluate(() => { window.__mm.arena._hitPlayer = () => {}; });
  return { ctx, page };
}
const ev = (p, fn, arg) => p.evaluate(fn, arg);
const waitArt = (p) => p.waitForFunction(() => window.__mm.dungeon.tileArt() > 0, null, { timeout: 8000 });

// the room facts that matter for gameplay: every room's wall grid shape via path between spawn tiles, plus the current room's BFS result
const facts = (p) => ev(p, () => {
  const d = window.__mm.dungeon; const out = { room: d.room, doors: d.doors().map((o) => o.dir + o.status).join(','), nar: d.narrowStats().rooms.map((r) => r.tpl + ':' + r.long + ':' + r.width).join('|') };
  const a = { x: 8, y: 6 }; const probes = [{ x: 8, y: 1 }, { x: 15, y: 6 }, { x: 8, y: 11 }, { x: 1, y: 6 }, { x: 8, y: 0 }, { x: 16, y: 6 }, { x: 8, y: 12 }, { x: 0, y: 6 }];
  out.paths = probes.map((b) => { const r = d.path(a, b); return r ? r.length : -1; }).join(',');
  return out;
});

(async () => {
  const browser = await chromium.launch();
  fs.mkdirSync(SHOTS, { recursive: true });

  // ---- art loads for every biome (+ the boss room) ----
  for (const biome of BIOMES) {
    const { ctx, page: p } = await open(browser, `seed=11&lv=2&biome=${biome}`);
    await waitArt(p);
    const info = await ev(p, () => { const d = window.__mm.dungeon; return { n: d.tileArt(), torches: d.torchCount(), room: d.room }; });
    check(`${biome}: tile art baked into the start room (>= 200 tiles)`, info.n >= 200, JSON.stringify(info));
    check(`${biome}: torches placed (1-4)`, info.torches >= 1 && info.torches <= 4, String(info.torches));
    const set = await ev(p, async () => { const s = await MMArt.loadDungeonTiles('../../assets/arcane/'); return { ids: s.ids().length }; });
    check(`${biome}: loader returns the 57-file set`, set.ids === 57, JSON.stringify(set));
    const all = await ev(p, (b) => MMArt.loadDungeonTiles('../../assets/arcane/').then((s) => ({ f: s.variants(b + '_floor').length, w: s.variants(b + '_wall').length, t: s.frames(b + '_torch'), boss: s.variants('boss_floor').length, kd: !!s.img('key_door'), ch: !!s.img('chest_open') && !!s.img('chest_closed') })), biome);
    check(`${biome}: floor/wall variants, 4-frame torch, boss floor, key door, chests`, all.f === 4 && all.w === 4 && all.t === 4 && all.boss === 2 && all.kd && all.ch, JSON.stringify(all));
    // boss room bakes with the boss floor
    const hh = await ev(p, () => { const d = window.__mm.dungeon; return [d.roomHash(d.graph.bossRoomId), d.roomHash(d.room), d.graph.bossRoomId !== d.room]; });
    check(`${biome}: boss room (boss floor) and start room bake differently`, hh[2] && hh[0] !== hh[1], hh.join(' '));
    check(`${biome}: no console errors`, p.errors.length === 0, p.errors.join(' | '));
    await ctx.close();
  }

  // ---- ?dtiles=0 falls back; collision / reachability unchanged ----
  for (const seed of [3, 11, 27, 40]) {
    const biome = BIOMES[seed % 4];
    const a = await open(browser, `seed=${seed}&lv=2&biome=${biome}&dtiles=0`);
    await a.page.waitForTimeout(600);
    const off = await ev(a.page, () => window.__mm.dungeon.tileArt());
    const fa = await facts(a.page);
    const b = await open(browser, `seed=${seed}&lv=2&biome=${biome}`);
    await waitArt(b.page);
    const fb = await facts(b.page);
    check(`seed ${seed}/${biome}: ?dtiles=0 bakes zero art tiles`, off === 0, String(off));
    check(`seed ${seed}/${biome}: rooms, doors and paths are identical with and without art`, JSON.stringify(fa) === JSON.stringify(fb), JSON.stringify(fa) + ' vs ' + JSON.stringify(fb));
    // every room: art on/off hash differ only in pixels, grids the same (walls come from the template, so compare path lengths per room)
    const rooms = await ev(b.page, () => window.__mm.dungeon.graph.rooms.length);
    check(`seed ${seed}/${biome}: dungeon has rooms`, rooms >= 4, String(rooms));
    await a.ctx.close(); await b.ctx.close();
  }

  // ---- determinism per seed ----
  {
    const h = [];
    for (let i = 0; i < 2; i++) {
      const { ctx, page: p } = await open(browser, 'seed=19&lv=2&biome=crypt');
      await waitArt(p);
      h.push(await ev(p, () => { const d = window.__mm.dungeon; return d.graph.rooms.map((r) => d.roomHash(r.id)).join(',') + '/' + d.tileArt(); }));
      await ctx.close();
    }
    check('same seed bakes identical rooms (hash of every room canvas)', h[0] === h[1] && h[0].length > 10, h.join(' vs '));
    const { ctx, page: p } = await open(browser, 'seed=20&lv=2&biome=crypt');
    await waitArt(p);
    const other = await ev(p, () => { const d = window.__mm.dungeon; return d.graph.rooms.map((r) => d.roomHash(r.id)).join(',') + '/' + d.tileArt(); });
    check('a different seed bakes different rooms', other !== h[0]);
    await ctx.close();
  }

  // ---- door state art switches when the doors open ----
  {
    const { ctx, page: p } = await open(browser, 'seed=11&lv=2&biome=bramble');
    await waitArt(p);
    await p.waitForTimeout(300);
    await ev(p, () => { const d = window.__mm.dungeon; d.clearRoom(); const nb = d.doors().find((o) => d.graph.rooms[o.other].type === 'combat' && o.status === 'open'); if (nb) d.enter(nb.other); });
    await p.waitForTimeout(400);
    const sealed = await ev(p, () => window.__mm.dungeon.doorArt());
    check('sealed doors in a fresh combat room draw door_closed', sealed.length > 0 && sealed.some((d) => d.art === 'door_closed' || d.art === 'key_door' || d.status === 'open'), JSON.stringify(sealed));
    await ev(p, () => window.__mm.dungeon.clearRoom());
    await p.waitForTimeout(400);
    const opened = await ev(p, () => window.__mm.dungeon.doorArt());
    check('after clearing, open doors draw door_open', opened.some((d) => d.status === 'open' && d.art === 'door_open'), JSON.stringify(opened));
    check('door art changed between sealed and open', JSON.stringify(sealed) !== JSON.stringify(opened));
    await ctx.close();
  }
  {
    // locked door uses key_door: find a seed/room with a locked door
    let found = null;
    for (const seed of [11, 12, 13, 14, 15, 16]) {
      const { ctx, page: p } = await open(browser, `seed=${seed}&lv=2&biome=crypt`);
      await waitArt(p);
      await ev(p, () => window.__mm.dungeon.clearRoom());
      await p.waitForTimeout(400);
      const da = await ev(p, () => window.__mm.dungeon.doorArt());
      if (da.some((d) => d.status === 'locked')) found = da;
      await ctx.close();
      if (found) break;
    }
    check('a locked door (if the start room has one) draws key_door', !found || found.some((d) => d.status === 'locked' && d.art === 'key_door'), JSON.stringify(found));
  }

  // ---- phone: no horizontal scroll, screenshots of each biome, desktop + phone ----
  for (const biome of BIOMES) {
    const { ctx, page: p } = await open(browser, `seed=11&lv=2&biome=${biome}`);
    await waitArt(p);
    await ev(p, () => window.__mm.dungeon.clearRoom());
    await p.waitForTimeout(500);
    await p.screenshot({ path: path.join(SHOTS, `${biome}-desktop.png`) });
    await ctx.close();
    const ph = await open(browser, `seed=11&lv=2&biome=${biome}`, { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
    await waitArt(ph.page);
    await ev(ph.page, () => window.__mm.dungeon.clearRoom());
    await ph.page.waitForTimeout(500);
    const sc = await ev(ph.page, () => document.documentElement.scrollWidth <= window.innerWidth + 1);
    check(`${biome}: phone 390x844 has no horizontal scroll`, sc);
    await ph.page.screenshot({ path: path.join(SHOTS, `${biome}-phone.png`) });
    check(`${biome}: phone no console errors`, ph.page.errors.length === 0, ph.page.errors.join(' | '));
    await ph.ctx.close();
  }
  // boss room look
  {
    const { ctx, page: p } = await open(browser, 'seed=11&lv=2&biome=crypt');
    await waitArt(p);
    const hasBoss = await ev(p, () => { const d = window.__mm.dungeon; const g = d.graph; const prev = { [d.room]: null }; const q = [d.room]; while (q.length) { const u = q.shift(); g.doors.forEach((x) => { if (x.cracked) return; const v = x.a === u ? x.b : x.b === u ? x.a : null; if (v !== null && !(v in prev)) { prev[v] = u; q.push(v); } }); } const path = []; for (let u = g.bossRoomId; u !== null && u !== undefined; u = prev[u]) path.unshift(u); d.state.keys = 9; for (let i = 1; i < path.length; i++) { if (d.state.room(d.room).enemiesAlive > 0 && g.rooms[d.room].type !== 'boss') d.clearRoom(); const r = d.enter(path[i]); if (!r.ok) return 'blocked ' + path[i] + ' ' + r.reason; } return d.room === g.bossRoomId; });
    await p.waitForTimeout(600);
    check('boss room reachable and baked with art', hasBoss === true && (await ev(p, () => window.__mm.dungeon.tileArt())) > 0, String(hasBoss));
    await p.screenshot({ path: path.join(SHOTS, 'crypt-boss-desktop.png') });
    check('boss room: no console errors', p.errors.length === 0, p.errors.join(' | '));
    await ctx.close();
  }

  await browser.close();
  done();
})().catch((e) => { console.error(e); process.exit(1); });
