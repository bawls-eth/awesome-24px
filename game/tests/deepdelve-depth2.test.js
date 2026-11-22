// Deepdelve depth 2 (NEXT-SLICES-3 MG2): crystal grotto band, blueprints + build medals, the calm creative world, access prefs.
// Playwright, phone 390x844, DB blocked (0 attempts), console clean.
// Run: NODE_PATH=$(npm root -g) BASE=http://localhost:8440/game/index.html node game/tests/deepdelve-depth2.test.js
// THREE_JS=<file> serves three.js locally instead of the CDN. No Firebase.
const { chromium } = require('playwright');
const fs = require('fs');
const { check, done, blockDb } = require('./helpers');
const ORIGIN = (process.env.BASE || 'http://localhost:8440/game/index.html').replace(/\/game\/index\.html.*$/, '');
const URL = (q) => ORIGIN + '/game/games/deepdelve/index.html?test=1' + (q || '');
const THREE_URL = 'https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.min.js';
const PHONE = { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true };
const all = [];
async function ctxOpen(browser, init) {
  const ctx = await browser.newContext(PHONE);
  const db = await blockDb(ctx);
  if (init) await ctx.addInitScript(init.fn, init.arg);
  const o = { ctx, db, errors: [] }; all.push(o);
  return o;
}
async function page(o, q) {
  const p = await o.ctx.newPage();
  p.on('pageerror', (e) => o.errors.push('pageerror: ' + e.message));
  p.on('console', (m) => { if (m.type() === 'error') o.errors.push('console: ' + m.text()); });
  if (process.env.THREE_JS) await p.route(THREE_URL, (route) => route.fulfill({ status: 200, contentType: 'application/javascript', body: fs.readFileSync(process.env.THREE_JS) }));
  await p.goto(URL(q));
  await p.waitForFunction(() => window.__dd && window.__dd.ready);
  return p;
}
// every key/value in the survival IndexedDB, as one string (to prove the creative world never changes it)
const survDump = () => new Promise((res) => { const r = indexedDB.open('pixeltown-deepdelve-v1', 1); r.onsuccess = () => { const db = r.result; try { const st = db.transaction('kv', 'readonly').objectStore('kv'), out = {}, q = st.openCursor(); q.onsuccess = () => { const c = q.result; if (c) { out[c.key] = String(c.value); c.continue(); } else { db.close(); res(JSON.stringify(out)); } }; q.onerror = () => { db.close(); res('err'); }; } catch (e) { db.close(); res('none'); } }; r.onerror = () => res('err'); });
const ready = (p) => p.waitForFunction(() => window.__dd && window.__dd.ready);

(async () => {
  const browser = await chromium.launch();

  // ---------- 1. crystal grotto band ----------
  const A = await ctxOpen(browser);
  const a = await page(A, '&seed=11');
  const band = await a.evaluate(() => {
    const d = window.__dd, out = { glow: 0, above: 0, below: 0, other: 0, rows: {} };
    for (let cz = 3; cz <= 4; cz++) for (let cx = 3; cx <= 4; cx++) for (let wy = 0; wy < 63; wy++) for (let z = 0; z < 16; z++) for (let x = 0; x < 16; x++) {
      const id = d.getBlock(cx * 16 + x, wy, cz * 16 + z);
      if (id !== 13) continue;
      out.glow++; out.rows[wy] = 1;
      if (wy < 25) out.above++; else if (wy > 40) out.below++;
    }
    out.rows = Object.keys(out.rows).length;
    return out;
  });
  check('grotto: glowstone fills the depth 25-40 band (hundreds of blocks, many rows) and never appears outside it', band.glow > 200 && band.rows >= 12 && band.above === 0 && band.below === 0, JSON.stringify(band));
  const sig = (p) => p.evaluate(() => { const d = window.__dd; let h = 2166136261 >>> 0; for (let wy = 25; wy <= 40; wy++) for (let z = 48; z < 80; z++) for (let x = 48; x < 80; x++) { h ^= d.getBlock(x, wy, z); h = Math.imul(h, 16777619) >>> 0; } return h >>> 0; });
  const B1 = await ctxOpen(browser), b1 = await page(B1, '&seed=11'), C1 = await ctxOpen(browser), c1 = await page(C1, '&seed=12');
  const [sa, sb, sc] = [await sig(a), await sig(b1), await sig(c1)];
  check('grotto: seeded - the same seed gives the same band in a fresh browser, another seed differs', sa === sb && sa !== sc, [sa, sb, sc].join(','));
  await b1.close(); await c1.close();
  const mine = await a.evaluate(() => {
    const d = window.__dd; let g = null;
    for (let wy = 26; wy <= 40 && !g; wy++) for (let z = 50; z < 78 && !g; z++) for (let x = 50; x < 78 && !g; x++) if (d.getBlock(x, wy, z) === 13) g = [x, wy, z];
    d.setPick(0); const woodOk = d.mineAt(g[0], g[1], g[2]);
    d.setPick(1); const stoneOk = d.mineAt(g[0], g[1], g[2]);
    return { g, woodOk, stoneOk, glow: d.inv.glowstone | 0, bp: d.inv.bp_lighthouse | 0, after: d.getBlock(g[0], g[1], g[2]) };
  });
  check('grotto: glowstone needs a stone pick, mines into a glowstone item and turns up the lighthouse blueprint', !!mine.g && mine.woodOk === false && mine.stoneOk === true && mine.glow === 1 && mine.bp === 1 && mine.after === 0, JSON.stringify(mine));
  const craft = await a.evaluate(() => {
    const d = window.__dd; d.panel('craft', true);
    const rows = document.querySelectorAll('#recipes li').length, xs = [...document.querySelectorAll('#recipes-x button')].map((b) => b.dataset.recipe);
    d.inv.glowstone = 2; d.inv.stone = 1; const lampN = d.inv.glow_lamp | 0;
    const ok = d.craftRecipe('glow_lamp');
    return { rows, xs, ok, lamp: (d.inv.glow_lamp | 0) - lampN, glow: d.inv.glowstone, stone: d.inv.stone };
  });
  check('grotto: 4 new grotto recipes are listed apart from the unchanged 24, and glow lamp uses exact inputs', craft.rows === 24 && ['glow_lamp', 'glow_torch', 'glow_furnace', 'glow_pick'].every((r) => craft.xs.indexOf(r) >= 0) && craft.ok && craft.lamp === 1 && craft.glow === 0 && craft.stone === 0, JSON.stringify(craft));
  const lamp = await a.evaluate(() => {
    const d = window.__dd, x = Math.floor(d.spawn.x) + 2, z = Math.floor(d.spawn.z) + 2, y = 33;
    d.panel('craft', false);
    for (let dy = -1; dy <= 1; dy++) for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 2; dx++) d.world.setBlock(x + dx, y + dy, z + dz, 0);
    const dark = d.lightAt(x, y, z);
    d.inv.glow_lamp = 1; const placed = d.placeAt(x + 2, y, z, 'glow_lamp');
    const lit = d.lightAt(x, y, z);
    d.setTime(d.MMDDTime.PERIOD * 0.75); const night = d.lightAt(x, y, z);
    return { dark, placed, lit, night, id: d.getBlock(x + 2, y, z), chunks: d.lampChunks.size };
  });
  check('grotto: a placed glow lamp is a calm light source - it lights a dark pocket and stays steady at night', lamp.placed && lamp.id === 14 && lamp.dark < 8 && lamp.lit >= 12 && lamp.night === lamp.lit && lamp.chunks >= 1, JSON.stringify(lamp));
  // old worlds keep their saved chunk diffs: an old-format save (plain MMChunks, no grotto) round-trips through IndexedDB
  const old = await a.evaluate(async () => {
    const d = window.__dd, w = d.MMChunks.createWorld(11);
    let g = null;
    for (let wy = 26; wy <= 40 && !g; wy++) for (let z = 20; z < 40 && !g; z++) for (let x = 20; x < 40 && !g; x++) if (d.getBlock(x, wy, z) === 13) g = [x, wy, z];
    w.setBlock(10, 10, 10, 0); w.setBlock(12, 30, 12, 0); w.setBlock(g[0], g[1], g[2], 2);
    await d.kv.set('world:11', w.serialise());
    return { g };
  });
  await a.reload(); await ready(a);
  const old2 = await a.evaluate((g) => { const d = window.__dd; return { a: d.getBlock(10, 10, 10), b: d.getBlock(12, 30, 12), c: d.getBlock(g[0], g[1], g[2]), glow: (function () { let n = 0; for (let x = 48; x < 64; x++) for (let z = 48; z < 64; z++) if (d.getBlock(x, 30, z) === 13) n++; return n; }()) }; }, old.g);
  check('grotto: an old world save keeps its chunk diffs (IndexedDB round trip) and gains the band around them', old2.a === 0 && old2.b === 0 && old2.c === 2 && old2.glow > 0, JSON.stringify(old2));
  const rt = await a.evaluate(async () => {
    const d = window.__dd; d.inv.glow_lamp = 1; d.inv.stone_brick = 1;
    const x = Math.floor(d.spawn.x) + 3, z = Math.floor(d.spawn.z) + 3;
    d.world.setBlock(x, 1, z, 0); d.world.setBlock(x, 1, z + 1, 0);
    const p1 = d.placeAt(x, 1, z, 'glow_lamp'), p2 = d.placeAt(x, 1, z + 1, 'stone_brick');
    await d.flush();
    return { x, z, p1, p2 };
  });
  await a.reload(); await ready(a);
  const rt2 = await a.evaluate((r) => { const d = window.__dd; return { lamp: d.getBlock(r.x, 1, r.z), brick: d.getBlock(r.x, 1, r.z + 1), chunks: d.lampChunks.size }; }, rt);
  check('grotto: placed glow lamps and stone bricks (new ids) survive a reload', rt.p1 && rt.p2 && rt2.lamp === 14 && rt2.brick === 15 && rt2.chunks >= 1, JSON.stringify([rt, rt2]));

  // ---------- 2. blueprints ----------
  const P = await ctxOpen(browser);
  const p = await page(P, '&seed=5');
  const find = await p.evaluate(() => {
    const d = window.__dd, out = {};
    out.lockedBefore = d.craftRecipe('stone_brick') === false && (d.inv.stone_brick | 0) === 0;
    d.setPick(1);
    const stoneAt = (wy) => { for (let z = 40; z < 90; z++) for (let x = 40; x < 90; x++) if (d.getBlock(x, wy, z) === 3) return [x, wy, z]; return null; };
    const s8 = stoneAt(8), s16 = stoneAt(16);
    out.m8 = d.mineAt(s8[0], s8[1], s8[2]); out.hut = d.inv.bp_hut | 0; out.bridge0 = d.inv.bp_bridge | 0;
    out.m16 = d.mineAt(s16[0], s16[1], s16[2]); out.bridge = d.inv.bp_bridge | 0;
    d.inv.stone = 2; out.crafted = d.craftRecipe('stone_brick') === true && d.inv.stone_brick === 2;
    return out;
  });
  check('blueprints: digging finds the hut (depth 6+) then the bridge (15+) blueprint, which unlock their crafts', find.lockedBefore && find.hut === 1 && find.bridge0 === 0 && find.bridge === 1 && find.crafted, JSON.stringify(find));
  const hut = await p.evaluate(() => {
    const d = window.__dd, cx = 21, cz = 21; d.inv.stone_brick = 60; d.inv.glow_lamp = 3;
    const had = d.inv.bp_hut; d.inv.bp_hut = 0;
    const ring = [[-1, -1], [0, -1], [1, -1], [-1, 0], [1, 0], [-1, 1], [0, 1], [1, 1]];
    for (const r of ring) { d.placeAt(cx + r[0], 2, cz + r[1], 'stone_brick'); d.placeAt(cx + r[0], 1, cz + r[1], 'stone_brick'); }
    d.placeAt(cx, 0, cz, 'stone_brick');
    const without = d.meta().goals.buildHut;
    d.inv.bp_hut = had; d.mineAt(cx, 0, cz); d.placeAt(cx, 0, cz, 'stone_brick');
    const g = d.meta().goals;
    return { without, hut: g.buildHut, b1: g.build1, b3: g.build3, medals: JSON.parse(localStorage.getItem('pixeltown-medals-deepdelve-v1') || '{}').m || [] };
  });
  check('blueprints: a hut of stone brick only counts once its blueprint is held, then earns build1', hut.without === false && hut.hut === true && hut.b1 === true && hut.b3 === false && hut.medals.indexOf('build1') >= 0 && hut.medals.indexOf('build3') < 0, JSON.stringify(hut));
  const rest = await p.evaluate(() => {
    const d = window.__dd, out = {};
    for (let i = 0; i < 4; i++) d.placeAt(30 + i, 1, 30, 'stone_brick');
    out.short = d.meta().goals.buildBridge; d.placeAt(34, 1, 30, 'stone_brick'); out.bridge = d.meta().goals.buildBridge;
    d.inv.bp_lighthouse = 0;
    for (let wy = 0; wy <= 6; wy++) d.world.setBlock(40, wy, 26, 0);
    for (let wy = 5; wy >= 2; wy--) d.placeAt(40, wy, 26, 'stone_brick');
    d.placeAt(40, 1, 26, 'glow_lamp'); out.lhWithout = d.meta().goals.buildLighthouse;
    d.inv.bp_lighthouse = 1; d.mineAt(40, 1, 26); d.inv.glow_lamp = 1; d.placeAt(40, 1, 26, 'glow_lamp');
    const g = d.meta().goals; out.lh = g.buildLighthouse; out.b3 = g.build3;
    out.medals = JSON.parse(localStorage.getItem('pixeltown-medals-deepdelve-v1') || '{}').m || [];
    d.panel('goals', true);
    out.build = document.querySelectorAll('#goal-build li').length; out.buildDone = document.querySelectorAll('#goal-build li.done').length;
    out.eight = document.querySelectorAll('#goal-list li, #goal-more li').length; out.stats = document.getElementById('goal-stats').textContent;
    out.bstats = document.getElementById('build-stats').textContent;
    return out;
  });
  check('blueprints: the bridge needs 5 bricks over a gap and the lighthouse a lamp on 4 bricks; all three earn build3', rest.short === false && rest.bridge === true && rest.lhWithout === false && rest.lh === true && rest.b3 === true && rest.medals.indexOf('build3') >= 0, JSON.stringify(rest));
  check('blueprints: the goals panel lists the 3 builds done in their own list; the 8 old goals stay as they were', rest.build === 3 && rest.buildDone === 3 && rest.eight === 8 && /Goals: \d\/8/.test(rest.stats) && /Builds: 3\/3/.test(rest.bstats), JSON.stringify(rest));
  await p.reload(); await ready(p);
  const keep = await p.evaluate(() => { const g = window.__dd.meta().goals; return [g.buildHut, g.buildBridge, g.buildLighthouse, g.build1, g.build3, g.bronze === false || g.bronze === true]; });
  check('blueprints: build goals are additive keys in pixeltown-deepdelve-v1 and survive a reload', keep.every((v) => v === true), JSON.stringify(keep));

  // ---------- 3. calm creative world ----------
  const K = await ctxOpen(browser);
  const sv = await page(K, '&seed=3');
  const sLabel = await sv.evaluate(() => ({ t: document.getElementById('world-btn').textContent, note: document.getElementById('creative-note').hidden, meta: localStorage.getItem('pixeltown-deepdelve-v1'), medals: localStorage.getItem('pixeltown-medals-deepdelve-v1') }));
  await sv.click('#world-btn');
  await sv.waitForURL(/mode=creative/); await ready(sv);
  const survBefore = await sv.evaluate(survDump);
  const k = await sv.evaluate(() => {
    const d = window.__dd, r = (e) => e.getBoundingClientRect();
    const wb = document.getElementById('world-btn'), note = document.getElementById('creative-note');
    return { creative: d.creative, url: location.search, h1: document.querySelector('.bar h1').textContent, note: note.hidden ? '' : note.textContent, wb: wb.textContent, wbh: r(wb).height, wbOk: r(wb).right <= window.innerWidth + 1 && r(wb).left >= -1, sw: document.documentElement.scrollWidth, vw: window.innerWidth };
  });
  check('creative: the survival page offers a "Creative world" toggle that opens ?mode=creative (seed kept)', sLabel.t === 'Creative world' && sLabel.note === true && k.creative === true && /seed=3/.test(k.url), JSON.stringify([sLabel, k]));
  check('creative: clearly labelled (title, banner, Survival world button), fits 390 px with no horizontal scroll', /Creative/.test(k.h1) && /no mobs, no hazards, unlimited blocks/.test(k.note) && /Separate save/.test(k.note) && k.wb === 'Survival world' && k.wbh >= 44 && k.wbOk && k.sw <= k.vw, JSON.stringify(k));
  const calm = await sv.evaluate(() => {
    const d = window.__dd, out = {};
    out.slime = d.spawnSlime(d.player.x + 3, d.player.y, d.player.z) === null;
    out.scan = d.scanSpawns(); out.creatures = d.creatures.length; out.wyrm = d.wyrm.on;
    d.hurt(5, 'x'); out.hp1 = d.player.hp;
    d.setMode('survival'); d.setPos(d.player.x, d.player.y + 20, d.player.z); d.step(1 / 60, 240); out.hp2 = d.player.hp;
    d.die('test'); out.deaths = d.meta().goals.deaths;
    return out;
  });
  check('creative: no mobs (no slime, crawler, bat or wyrm), no hurt, no fall damage, deaths are not counted', calm.slime && calm.scan === 0 && calm.creatures === 0 && calm.wyrm === false && calm.hp1 === 10 && calm.hp2 === 10 && calm.deaths === 0, JSON.stringify(calm));
  const unl = await sv.evaluate(async () => {
    const d = window.__dd, x = Math.floor(d.spawn.x) + 5, z = Math.floor(d.spawn.z) + 5, before = d.inv.stone;
    let ok = 0; for (let i = 0; i < 5; i++) if (d.placeAt(x + i, 1, z, 'stone')) ok++;
    const glow = d.placeAt(x, 1, z + 1, 'glowstone');
    let cr = null; for (let wy = 48; wy < 62 && !cr; wy++) for (let zz = 40; zz < 90 && !cr; zz++) for (let xx = 40; xx < 90 && !cr; xx++) if (d.getBlock(xx, wy, zz) === 7) cr = [xx, wy, zz];
    const deep = d.pick.tier === 0 && d.mineAt(cr[0], cr[1], cr[2]); // crystal needs an iron pick in survival; not here
    const items = d.hotbar().map((i) => i.item), label = document.querySelector('#hotbar .slot span:last-child').textContent;
    await d.flush();
    return { ok, glow, deep, before, after: d.inv.stone, items, label, x, z };
  });
  check('creative: unlimited blocks - placing never spends, every block incl. grotto ones is on the hotbar as unlimited', unl.ok === 5 && unl.glow && unl.after === unl.before && unl.before >= 999 && unl.deep && ['glowstone', 'glow_lamp', 'stone_brick', 'crystal'].every((i) => unl.items.indexOf(i) >= 0) && /∞/.test(unl.label), JSON.stringify(unl));
  await sv.evaluate('window.__survDump = ' + survDump.toString());
  const store = await sv.evaluate(async () => {
    const c = JSON.parse(localStorage.getItem('pixeltown-deepdelve-creative-v1') || 'null');
    const surv = await window.__survDump();
    return { surv, hasCreative: !!(c && c.v === 1 && typeof c.kv['world:3'] === 'string' && typeof c.kv['player:3'] === 'string'), meta: localStorage.getItem('pixeltown-deepdelve-v1'), medals: localStorage.getItem('pixeltown-medals-deepdelve-v1') };
  });
  check('creative: saves only under pixeltown-deepdelve-creative-v1; the survival IndexedDB, meta and medal keys are left exactly as they were', store.hasCreative && store.surv === survBefore && store.surv !== 'err' && store.meta === sLabel.meta && store.medals === sLabel.medals, JSON.stringify([store, sLabel.meta]));
  await sv.reload(); await ready(sv);
  const back = await sv.evaluate((u) => { const d = window.__dd; return { creative: d.creative, a: d.getBlock(u.x, 1, u.z), g: d.getBlock(u.x, 1, u.z + 1), stone: d.inv.stone }; }, unl);
  const sv2 = await page(K, '&seed=3');
  const surv = await sv2.evaluate((u) => { const d = window.__dd; return { creative: d.creative, a: d.getBlock(u.x, 1, u.z) }; }, unl);
  check('creative: its world reloads from its own slot, while the survival world of the same seed never sees those blocks', back.creative && back.a === 3 && back.g === 13 && back.stone >= 999 && surv.creative === false && surv.a === 0, JSON.stringify([back, surv]));
  await sv2.close();

  // ---------- 4. accessibility (shared pixeltown-access-v1 prefs) ----------
  const prefs = { v: 1, palette: 'deuteranopia', hudScale: 1.5, flashes: false, bulletOutline: true, lowGfx: true };
  const X = await ctxOpen(browser, { fn: (v) => { localStorage.setItem('pixeltown-access-v1', v); }, arg: JSON.stringify(prefs) });
  const x = await page(X, '&seed=5&mode=creative');
  const ax = await x.evaluate(() => {
    const d = window.__dd, st = d.perf.state();
    for (let i = 0; i < 80; i++) d.perf.frame(8, 100000 + i * 200); // very fast frames: the governor would restore quality
    const st2 = d.perf.state();
    return { place: d.placeAt(Math.floor(d.spawn.x) + 2, 1, Math.floor(d.spawn.z) + 2, 'stone'), scale: getComputedStyle(document.documentElement).getPropertyValue('--ui-scale').trim(), hudFont: parseFloat(getComputedStyle(document.getElementById('hud')).fontSize), rm: document.documentElement.getAttribute('data-reduce-motion'), reduced: d.reduced, bob: d.bob(), acc: d.access, floor: d.govFloor(), lvl: st.level, view: st.view, rs: st.scale, lvl2: st2.level, outline: d.outlineHex() };
  });
  const pure = await x.evaluate(async () => { await window.__dd.flush(); const dbs = indexedDB.databases ? (await indexedDB.databases()).map((v) => v.name) : ['n/a']; return { dbs, keys: Object.keys(localStorage).filter((k) => /deepdelve|hub/.test(k)) }; });
  check('creative: a creative-only browser never opens the survival IndexedDB and writes no survival or hub keys', ax.place === true && pure.dbs.indexOf('pixeltown-deepdelve-v1') < 0 && pure.keys.length === 1 && pure.keys[0] === 'pixeltown-deepdelve-creative-v1', JSON.stringify(pure));
  check('access: HUD text follows hudScale 1.5 and reduce motion (screen flashes off) stops the view bob', ax.scale === '1.5' && ax.hudFont >= 19 && ax.rm === '1' && ax.reduced === true && ax.bob === 0, JSON.stringify(ax));
  check('access: lowGfx starts at the low quality level (view 3, render scale <= 0.75) and fast frames never lift it above that', ax.acc.lowGfx === true && ax.floor > 0 && ax.lvl >= ax.floor && ax.view === 3 && ax.rs <= 0.75 && ax.lvl2 >= ax.floor, JSON.stringify(ax));
  check('access: a colour-blind palette recolours the block outline (deuteranopia ally colour)', ax.acc.palette === 'deuteranopia' && ax.outline === 0x56b4e9, JSON.stringify(ax));
  const plain = await a.evaluate(() => { const d = window.__dd; return { acc: d.access, floor: d.govFloor(), outline: d.outlineHex() }; });
  check('access: without saved prefs everything stays as before (normal palette, white outline, no quality floor)', plain.acc.palette === 'normal' && plain.acc.lowGfx === false && plain.floor === 0 && plain.outline === 0xffffff, JSON.stringify(plain));

  for (const o of all) {
    check('no Firebase/DB traffic from this context (0 attempts)', o.db.attempts() === 0, JSON.stringify([o.db.http, o.db.ws]));
    check('console clean', o.errors.length === 0, o.errors.join(' | '));
  }
  await browser.close();
  done();
})();
