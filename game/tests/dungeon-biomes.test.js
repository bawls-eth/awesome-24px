// Dungeon biomes (?mode=dungeon&biome=warren|bramble|meadow|crypt) on the standalone Mad Maze page. No Firebase, own origin only.
// Serve the repo root, then:  BASE=http://localhost:8511/game/index.html NODE_PATH=$(npm root -g) node game/tests/dungeon-biomes.test.js
const { chromium } = require('playwright');
const { check, done } = require('./helpers');
const ORIGIN = (process.env.BASE || 'http://localhost:8440/game/index.html').replace(/\/game\/index\.html.*$/, '');
const PAGE = ORIGIN + '/game/games/mad-maze/index.html';
const URL = (q) => `${PAGE}?mode=dungeon&test=1&${q}`;
const BIOMES = require('../shared/mm-biomes.js');
const NAME = { warren: 'Warren', bramble: 'Bramble', meadow: 'Meadow', crypt: 'Crypt' };
const BOSS = { warren: null, bramble: 'forest_warden', meadow: 'mire_queen', crypt: 'bone_colossus' };
const SEED = 11;

async function open(browser, q, opts) {
  const ctx = await browser.newContext(opts || { viewport: { width: 1100, height: 700 } });
  const page = await ctx.newPage();
  page.errors = [];
  page.on('pageerror', (e) => page.errors.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error') page.errors.push('console: ' + m.text()); });
  await page.goto(URL(q));
  await page.waitForFunction(() => window.__mm && window.__mm.dungeon && window.__mm.dungeon.room !== null);
  await page.waitForTimeout(300);
  await page.evaluate(() => { window.__mm.arena._hitPlayer = () => {}; });
  await page.evaluate(() => { // walk to a room through doors (clearing rooms on the way); allowLocked once the key is held
    window.__walk = (target, allowLocked, keep) => {
      const d = window.__mm.dungeon; const g = d.graph;
      const nbrs = (id) => g.doors.filter((x) => (!x.cracked || d.state.secretOpen) && (x.a === id || x.b === id) && (allowLocked || !x.locked)).map((x) => (x.a === id ? x.b : x.a));
      const prev = { [d.room]: null }; const q = [d.room];
      while (q.length) { const u = q.shift(); if (u === target) break; nbrs(u).forEach((v) => { if (!(v in prev)) { prev[v] = u; q.push(v); } }); }
      const path = []; for (let u = target; u !== null && u !== undefined; u = prev[u]) path.unshift(u);
      for (let i = 1; i < path.length; i++) {
        if (d.state.room(d.room).enemiesAlive > 0 && g.rooms[d.room].type !== 'boss') d.clearRoom();
        const r = d.enter(path[i]); if (!r.ok) return 'blocked at ' + path[i] + ': ' + r.reason;
      }
      if (!keep && d.state.room(d.room).enemiesAlive > 0 && g.rooms[d.room].type !== 'boss') d.clearRoom();
      return d.room;
    };
  });
  return { ctx, page };
}
const ev = (p, fn, arg) => p.evaluate(fn, arg);
// mean RGB of the whole arena canvas (room + tint + particles; the hero and HUD-free canvas are the same in every biome)
const avgColor = (p) => ev(p, () => { const c = document.getElementById('realm-canvas'); const g = c.getContext('2d'); const d = g.getImageData(0, 0, c.width, c.height).data; let r = 0, gg = 0, b = 0, n = 0; for (let i = 0; i < d.length; i += 4 * 7) { r += d[i]; gg += d[i + 1]; b += d[i + 2]; n++; } return [r / n, gg / n, b / n]; });
const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);

(async () => {
  const browser = await chromium.launch();
  const colors = {};

  for (const biome of Object.keys(NAME)) {
    const T = (s) => `${biome}: ${s}`;
    const { ctx, page: p } = await open(browser, `seed=${SEED}&lv=2&biome=${biome}`);
    const info = await ev(p, () => { const d = window.__mm.dungeon; return { biome: d.biome, layout: d.layoutVersion, ds: document.body.dataset.dungeonBiome, wave: document.getElementById('realm-wave').textContent, banner: document.getElementById('realm-banner').textContent }; });
    check(T('?biome= is accepted'), info.biome === biome && info.ds === biome && info.layout === 2, JSON.stringify(info));
    check(T('the biome name is in the HUD'), info.wave.indexOf(NAME[biome]) === 0, info.wave);
    colors[biome] = await avgColor(p);

    // ---- enemies wear the biome's creatures; the art for them is loaded ----
    const B = BIOMES.get(biome);
    const want = Object.keys(B.skin).map((k) => B.skin[k]);
    const arts = new Set(); let mobs = 0;
    const combat = await ev(p, () => window.__mm.dungeon.graph.rooms.filter((r) => r.type === 'combat').map((r) => r.id));
    for (const id of combat.slice(0, 4)) {
      await ev(p, (t) => window.__walk(t, true, true), id); await p.waitForTimeout(150);
      const got = await ev(p, () => window.__mm.arena.enemies.filter((e) => e.active && e.dg === 'mob').map((e) => [e.did, e.art]));
      got.forEach(([did, art]) => { mobs++; arts.add(art === null ? '(none)' : art); if (B.ids.indexOf(did) < 0 && did !== 'sprout_mini') arts.add('BAD:' + did); });
    }
    const arr = [...arts];
    check(T('enemies come from the biome mix'), mobs > 0 && (biome === 'warren' ? arr.join() === '(none)' : arr.every((a) => want.indexOf(a) >= 0)), JSON.stringify([mobs, arr]));
    if (biome !== 'warren') {
      await p.waitForFunction((c) => { const s = window.__mm.arena._enemyArt; return !!s && c.every((x) => s.has(x)); }, BIOMES.creatures(biome), { timeout: 15000 }).catch(() => {});
      check(T('the creature art for the biome is loaded'), await ev(p, (c) => { const s = window.__mm.arena._enemyArt; return !!s && c.every((x) => s.has(x)); }, BIOMES.creatures(biome)));
    }

    // ---- traverse the floor door to door (take the key, then every non-secret room) ----
    const keyRoom = await ev(p, () => window.__mm.dungeon.graph.keyRoomId);
    await ev(p, (id) => window.__walk(id, true), keyRoom);
    await ev(p, () => window.__mm.dungeon.clearRoom());
    const kp = await ev(p, () => window.__mm.dungeon.keyPos());
    if (kp) { await ev(p, (k) => { const ar = window.__mm.arena; ar.player.x = k.x; ar.player.y = k.y; }, kp); await p.waitForTimeout(300); }
    const ids = await ev(p, () => window.__mm.dungeon.graph.rooms.filter((r) => r.type !== 'secret' && r.type !== 'boss').map((r) => r.id));
    const res = [];
    for (const id of ids) res.push(await ev(p, (t) => window.__walk(t, true), id));
    check(T('every room is reachable door to door'), res.every((r, i) => r === ids[i]), JSON.stringify(res));

    // ---- the boss ----
    const bossRoom = await ev(p, () => window.__mm.dungeon.graph.bossRoomId);
    await ev(p, (id) => window.__walk(id, true), bossRoom);
    await p.waitForTimeout(500);
    const bs = await ev(p, () => { const a = window.__mm.arena; const e = window.__mm.dungeon.boss(); return e ? { art: e.bossArt, name: a._bossName(e), banner: document.getElementById('realm-boss-name').textContent } : null; });
    // b23: the Crypt has an alternate boss (the Lich King) on odd seeds: the expected boss is whatever the biome's own rule gives for THIS seed, and it must be the primary or that alternate and nothing else
    const wantBoss = await ev(p, (b) => { const w = MMBiomes.bossFor(b, window.__mm.dungeon.seed); return { art: w.boss_art, name: w.boss_name, alt: w.alt }; }, biome);
    const okIds = [BOSS[biome], biome === 'crypt' ? 'lich_king' : null].filter((x) => x);
    check(T('the boss is the biome boss'), !!bs && (biome === 'warren' ? bs.art === null || bs.art === undefined || bs.art === BOSS.warren : (bs.art === wantBoss.art && okIds.indexOf(bs.art) >= 0)) && bs.name === (bs.art || 'void_oracle') && bs.banner.indexOf(wantBoss.name) === 0, JSON.stringify([bs, wantBoss]));
    check(T('no console errors'), p.errors.length === 0, p.errors.join(' | '));
    await ctx.close();
  }

  // ---- palettes differ between biomes (canvas pixels) ----
  const names = Object.keys(colors); let minD = 1e9;
  for (let i = 0; i < names.length; i++) for (let j = i + 1; j < names.length; j++) minD = Math.min(minD, dist(colors[names[i]], colors[names[j]]));
  check('canvas palettes differ between every pair of biomes', minD > 10, JSON.stringify([minD, colors]));

  // ---- invalid / missing biome falls back to warren ----
  for (const q of ['biome=lava', 'biome=CRYPT', 'biome=constructor', 'biome=__proto__', 'biome=' + encodeURIComponent('<img src=x onerror=alert(1)>'), 'biome=']) {
    const { ctx, page: p } = await open(browser, `seed=${SEED}&lv=2&${q}`);
    const r = await ev(p, () => ({ b: window.__mm.dungeon.biome, ds: document.body.dataset.dungeonBiome, wave: document.getElementById('realm-wave').textContent, imgs: document.querySelectorAll('img:not(.mm-ico)').length })); // .mm-ico = HUD icons added by our own code (S13); any other <img> would be an injection
    check(`invalid ${q.slice(0, 22)} falls back to the warren`, r.b === 'warren' && r.ds === 'warren' && r.wave.indexOf('Warren') === 0 && r.imgs === 0 && p.errors.length === 0, JSON.stringify([r, p.errors]));
    await ctx.close();
  }
  { // an old link (no biome, no lv) is the unchanged warren on layout 1
    const { ctx, page: p } = await open(browser, `seed=${SEED}`);
    const r = await ev(p, () => { const d = window.__mm.dungeon; return { b: d.biome, lv: d.layoutVersion }; });
    check('an old link without biome is the warren on layout 1', r.b === 'warren' && r.lv === 1, JSON.stringify(r));
    await ctx.close();
  }
  { // a biome run is deterministic: same seed + biome, same graph and same templates; another biome picks other rooms
    const sig = async (q) => { const { ctx, page: p } = await open(browser, q); const s = await ev(p, () => { const d = window.__mm.dungeon; return JSON.stringify([d.graph, d.graph.rooms.map((r) => d.layout(r.id))]); }); await ctx.close(); return s; };
    const a = await sig(`seed=${SEED}&lv=2&biome=crypt`); const b = await sig(`seed=${SEED}&lv=2&biome=crypt`); const c = await sig(`seed=${SEED}&lv=2&biome=meadow`);
    check('same seed and biome give the same floor; another biome differs', a === b && a !== c);
  }

  // ---- phone ----
  for (const biome of Object.keys(NAME)) {
    const { ctx, page: p } = await open(browser, `seed=${SEED}&lv=2&biome=${biome}`, { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
    await ev(p, () => window.__walk(window.__mm.dungeon.graph.rooms.find((r) => r.type === 'combat').id));
    await p.waitForTimeout(500);
    const m = await ev(p, () => { const cv = document.getElementById('realm-canvas').getBoundingClientRect(); const w = document.getElementById('realm-wave').getBoundingClientRect(); return { sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth, cvw: cv.width, ww: w.right, text: document.getElementById('realm-wave').textContent }; });
    check(`phone 390x844 ${biome}: no horizontal scroll, HUD label on screen, no errors`, m.sw <= m.cw && m.cvw <= 390 && m.ww <= 390 && m.text.indexOf(NAME[biome]) === 0 && p.errors.length === 0, JSON.stringify([m, p.errors]));
    await ctx.close();
  }

  await browser.close();
  done();
})();
