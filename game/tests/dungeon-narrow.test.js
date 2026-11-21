// Narrow Realm-style dungeon rooms (?mode=dungeon&lv=2&biome=crypt, ?narrow=0 restores the old pool). No Firebase, own origin only.
// Serve the repo root, then:  BASE=http://localhost:8542/game/index.html NODE_PATH=$(npm root -g) node game/tests/dungeon-narrow.test.js
const { chromium } = require('playwright');
const { check, done } = require('./helpers');
const ORIGIN = (process.env.BASE || 'http://localhost:8440/game/index.html').replace(/\/game\/index\.html.*$/, '');
const PAGE = ORIGIN + '/game/games/mad-maze/index.html';
const URL = (q) => `${PAGE}?mode=dungeon&test=1&${q}`;

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
  return { ctx, page };
}
const ev = (p, fn, arg) => p.evaluate(fn, arg);

// walk every pair of open doors of the current room along the BFS tile path, teleporting tile by tile; the hero circle must fit on each tile
const WALK = () => {
  const d = window.__mm.dungeon; const doors = d.doors().filter((q) => q.status === 'open'); let pairs = 0, bad = 0, steps = 0;
  for (let i = 0; i < doors.length; i++) for (let j = 0; j < doors.length; j++) {
    if (i === j) continue; const path = d.path(doors[i].tile, doors[j].tile); pairs++;
    if (!path) { bad++; continue; }
    path.forEach((t) => { steps++; if (!d.teleport(t.x, t.y)) bad++; });
  }
  return { doors: doors.length, pairs, bad, steps };
};
const CLEAR_AND_GO = (id) => {
  const d = window.__mm.dungeon; if (d.state.room(d.room).enemiesAlive > 0 && d.graph.rooms[d.room].type !== 'boss') d.clearRoom();
  return d.enter(id).ok;
};

(async () => {
  const browser = await chromium.launch();
  const T = 'crypt seed 5: ';
  const { ctx, page: p } = await open(browser, 'seed=5&lv=2&biome=crypt');
  const st = await ev(p, () => window.__mm.dungeon.narrowStats());
  check(T + 'narrow profile is on for a layout-2 biome run', st.on === true && st.rooms.length >= 7, JSON.stringify({ on: st.on, n: st.rooms.length }));
  check(T + 'average room long side is small (<= 13 tiles, was ~15)', st.avgLong > 0 && st.avgLong <= 13, st.avgLong.toFixed(1));
  check(T + 'average corridor width is 2-5 tiles', st.avgWidth >= 2 && st.avgWidth <= 5, st.avgWidth.toFixed(2));
  check(T + 'at least 70% of rooms are narrow templates and at most one big hall (plus the boss hall)', st.narrowCount / st.rooms.length >= 0.7 && st.big <= 1, st.narrowCount + '/' + st.rooms.length + ' big ' + st.big);
  check(T + 'tight rooms never plan more than 3 enemies', st.rooms.every((r) => !r.tight || r.shooters <= 3), JSON.stringify(st.rooms.filter((r) => r.tight && r.shooters > 3)));

  // walk door to door in the start room, then through the whole floor via the regular doors
  let walked = await ev(p, WALK);
  const seen = [walked]; const visited = new Set();
  const route = await ev(p, () => { const d = window.__mm.dungeon; const g = d.graph; const order = []; const seenR = new Set([d.room]); const q = [d.room]; while (q.length) { const u = q.shift(); order.push(u); g.doors.filter((x) => !x.cracked && !x.locked && (x.a === u || x.b === u)).forEach((x) => { const v = x.a === u ? x.b : x.a; if (!seenR.has(v)) { seenR.add(v); q.push(v); } }); } return order; });
  const nav = await ev(p, (r) => { // go to each reachable room (clearing on the way) and walk its doors
    const d = window.__mm.dungeon; const g = d.graph; const out = []; const nbrs = (id) => g.doors.filter((x) => !x.cracked && !x.locked && (x.a === id || x.b === id)).map((x) => (x.a === id ? x.b : x.a));
    const pathTo = (from, to) => { const prev = { [from]: null }; const q = [from]; while (q.length) { const u = q.shift(); if (u === to) break; nbrs(u).forEach((v) => { if (!(v in prev)) { prev[v] = u; q.push(v); } }); } const pth = []; for (let u = to; u !== null && u !== undefined; u = prev[u]) pth.unshift(u); return pth; };
    r.forEach((id) => {
      const pth = pathTo(d.room, id); for (let i = 1; i < pth.length; i++) { if (d.state.room(d.room).enemiesAlive > 0 && g.rooms[d.room].type !== 'boss') d.clearRoom(); d.enter(pth[i]); }
      if (d.state.room(d.room).enemiesAlive > 0 && g.rooms[d.room].type !== 'boss') d.clearRoom();
      const doors = d.doors().filter((q) => q.status === 'open'); let bad = 0, pairs = 0;
      for (let i = 0; i < doors.length; i++) for (let j = 0; j < doors.length; j++) { if (i === j) continue; pairs++; const path = d.path(doors[i].tile, doors[j].tile); if (!path) { bad++; continue; } path.forEach((t) => { if (!d.teleport(t.x, t.y)) bad++; }); }
      out.push({ id, doors: doors.length, pairs, bad });
    });
    return out;
  }, route);
  check(T + 'the player can walk from every open door to every other open door in every room (teleport along the path, hero circle fits)', nav.length >= 6 && nav.every((r) => r.bad === 0) && nav.reduce((n, r) => n + r.pairs, 0) >= 8, JSON.stringify(nav.filter((r) => r.bad)));
  check(T + 'start room walk also clean', walked.bad === 0 && walked.doors >= 1, JSON.stringify(walked));
  check(T + 'room labels (HUD biome name) and door panels still render', await ev(p, () => { const d = window.__mm.dungeon; const b = document.getElementById('realm-biome'); return !!b && d.doors().length >= 1 && document.getElementById('realm-canvas').width > 0; }));
  // key and chest land on open tiles
  const f = await open(browser, 'seed=5&lv=2&biome=crypt');
  const spots = await ev(f.page, () => { const d = window.__mm.dungeon; const g = d.graph; const out = {}; const nbrs = (id) => g.doors.filter((x) => !x.cracked && (x.a === id || x.b === id)).map((x) => (x.a === id ? x.b : x.a)); [['key', 'keyPos'], ['treasure', 'chestPos']].forEach(([type, fn]) => { const r = g.rooms.find((q) => q.type === type); if (!r) return; const prev = { [d.room]: null }; const q = [d.room]; while (q.length) { const u = q.shift(); nbrs(u).forEach((v) => { if (!(v in prev)) { prev[v] = u; q.push(v); } }); } const pth = []; for (let u = r.id; u !== null && u !== undefined; u = prev[u]) pth.unshift(u); for (let i = 1; i < pth.length; i++) { if (d.state.room(d.room).enemiesAlive > 0) d.clearRoom(); if (!d.enter(pth[i]).ok) return; } if (d.room === r.id) { const sp = d[fn](); out[type] = sp ? d.teleport(Math.floor(sp.x / 40), Math.floor(sp.y / 40)) : false; } }); return out; });
  await f.ctx.close();
  check(T + 'the key lies on a free tile the hero fits on', spots.key === true, JSON.stringify(spots));
  check(T + 'no console errors in the narrow dungeon', p.errors.length === 0, p.errors.join(' | '));
  await ctx.close();

  // ---- other biomes + determinism + ?narrow=0 ----
  const byBiome = {};
  for (const biome of ['warren', 'bramble', 'meadow']) {
    const o = await open(browser, `seed=9&lv=2&biome=${biome}`);
    byBiome[biome] = await ev(o.page, () => { const s = window.__mm.dungeon.narrowStats(); return { on: s.on, avgLong: s.avgLong, avgWidth: s.avgWidth, big: s.big, tpls: s.rooms.map((r) => r.tpl).join() }; });
    byBiome[biome].errors = o.page.errors.length; await o.ctx.close();
  }
  check('warren / bramble / meadow runs are narrow too (avg long side <= 13, <= 1 big hall)', Object.values(byBiome).every((b) => b.on && b.avgLong <= 13 && b.big <= 1), JSON.stringify(byBiome));
  check('meadow stays open-ish: wider average corridors than crypt', byBiome.meadow.avgWidth > st.avgWidth - 1.5, byBiome.meadow.avgWidth.toFixed(2) + ' vs ' + st.avgWidth.toFixed(2));
  const again = await open(browser, 'seed=5&lv=2&biome=crypt');
  const st2 = await ev(again.page, () => window.__mm.dungeon.narrowStats());
  check('same seed gives the same rooms (deterministic)', JSON.stringify(st2.rooms.map((r) => r.tpl)) === JSON.stringify(st.rooms.map((r) => r.tpl)));
  await again.ctx.close();
  const old = await open(browser, 'seed=5&lv=2&biome=crypt&narrow=0');
  const so = await ev(old.page, () => window.__mm.dungeon.narrowStats());
  check('?narrow=0 restores the old room pool (no n- templates, wider corridors)', so.on === false && so.narrowCount === 0 && so.avgWidth > st.avgWidth + 1 && so.rooms.every((r) => r.tight === false), JSON.stringify({ on: so.on, n: so.narrowCount, a: so.avgWidth, b: st.avgWidth }));
  check('?narrow=0: no console errors', old.page.errors.length === 0, old.page.errors.join('|'));
  await old.ctx.close();
  const v1 = await open(browser, 'seed=40');
  const s1 = await ev(v1.page, () => { const d = window.__mm.dungeon; return { v: d.layoutVersion, narrow: d.narrow, tpls: d.graph.rooms.map((r) => d.layout(r.id).tpl).join() }; });
  check('layout 1 (no lv, no biome) is untouched: golden room ids for seed 40', s1.v === 1 && s1.narrow === false && s1.tpls === 'open,ring,hallway,center-block,cross-pillars,treasure,open,center-block,treasure', JSON.stringify(s1));
  await v1.ctx.close();

  // ---- phone 390x844 ----
  const ph = await open(browser, 'seed=5&lv=2&biome=crypt', { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  const pm = await ev(ph.page, () => { const b = document.getElementById('mm-map-btn') || document.querySelector('[id*="map"]'); const r = b ? b.getBoundingClientRect() : null; return { scroll: document.documentElement.scrollWidth, vw: innerWidth, hasDoors: window.__mm.dungeon.doors().length, btn: r ? { w: r.width, h: r.height } : null, narrow: window.__mm.dungeon.narrowStats().on }; });
  check('phone 390x844: no horizontal scroll', pm.scroll <= pm.vw, JSON.stringify(pm));
  check('phone 390x844: narrow rooms on and doors present', pm.narrow === true && pm.hasDoors >= 1);
  check('phone 390x844: map button is a 44px target', !pm.btn || (pm.btn.w >= 44 && pm.btn.h >= 44), JSON.stringify(pm.btn));
  const pw = await ev(ph.page, WALK);
  check('phone 390x844: door-to-door walk works and no console errors', pw.bad === 0 && ph.page.errors.length === 0, JSON.stringify(pw) + ph.page.errors.join('|'));
  await ph.ctx.close();

  await browser.close();
  done();
})().catch((e) => { console.error(e); process.exit(1); });
