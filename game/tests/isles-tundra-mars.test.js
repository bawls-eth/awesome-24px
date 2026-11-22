// TD1 (NEXT-SLICES-4) on the Hearthvale Isles page: tundra + mars depth.
// 1 rares from the page-side table: the aurora frostfox (tundra, zone 3, only on an aurora night) and the chrome rustbeetle (mars, zone 3):
//   a seeded spot (same every load), at most 1 alive, a code palette swap; a tame (never a kill) adds aurora_shard and a journal line;
// 2 thin ice: a crack telegraph after 1.0 s on one ice_thin tile, cracked at 1.5 s into slush for 20 s (x0.6, never damage, you walk off);
//   with reduced motion the telegraph is a static overlay;
// 3 hot spring soak: 2 s in a hot_spring gives "Warm and rested" (full warmth + full HP); spring salt still gathers there;
// 4 aurora night: the page clock passes dusk at 150 s (never the real time; ?aurora=1 forces it, ?aurora=0 never): the cached aurora band
//   draws, aurora crystals glint and give an aurora shard once a day; by day they do not;
// 5 oxygen polish: a shape icon on the air meter, the warning >= 15 s before empty (20 s), an arrow to the nearest dome while low, the
//   o2 tank craft row says "+30 s air";
// 6 rocket launch: craft 1 rocket core, sail to mars 3 times: a 2.5 s lift-off (a tap skips it, reduced motion skips it) that lands on
//   the landing pad, and the core is never used up;
// 7 the TD1 decor recipes (aurora_lamp, chrome_beacon) craft from the rare items; the archipelago key stays < 20 KB with all 5 isles
//   visited and fog revealed (size 192); phone 390x844 + desktop, 0 console errors, 0 DB requests everywhere.
// Run: python3 -m http.server 8440 (repo root), then BASE=http://localhost:8440/game/index.html NODE_PATH=$(npm root -g) node game/tests/isles-tundra-mars.test.js
const path = require('path');
const { chromium } = require('playwright');
const { check, done, blockDb } = require('./helpers');
const ORIGIN = (process.env.BASE || 'http://localhost:8440/game/index.html').replace(/\/game\/index\.html.*$/, '');
const PAGE = ORIGIN + '/game/games/isles/index.html';
const PHONE = { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 };
const DESK = { viewport: { width: 1000, height: 700 } };
const SHOTS = process.env.SHOTS || '';
const KEY = 'pixeltown-archipelago-v1';
const all = [];

async function open(browser, opts, query, seed, ctx0) {
  const ctx = ctx0 || await browser.newContext(opts);
  const db = ctx0 ? ctx0.__db : await blockDb(ctx);
  ctx.__db = db;
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  await page.addInitScript((s) => {
    if (sessionStorage.seeded) return;
    sessionStorage.seeded = '1';
    localStorage.clear();
    Object.keys(s || {}).forEach((k) => localStorage.setItem(k, s[k]));
  }, Object.assign({ [KEY]: JSON.stringify({ v: 1, sg: 1 }) }, seed || {}));
  await page.goto(PAGE + '?test=1' + (query || ''));
  await ready(page);
  const o = { ctx, page, errors, db }; all.push(o); return o;
}
const ready = (page) => page.waitForFunction(() => window.__isles && window.__isles.world, null, { timeout: 20000 });
const ev = (page, fn, arg) => page.evaluate(`window.__isles.wait = window.__isles.wait || ((s) => { let l = s; while (l > 1e-9) { const d = Math.min(0.5, l); window.__isles.step(0, 0, d); l -= d; } return window.__isles.hero(); }); (${fn.toString()})(window.__isles, ${JSON.stringify(arg === undefined ? null : arg)})`);
const shot = async (page, name) => { if (SHOTS) await page.screenshot({ path: path.join(SHOTS, name + '.png') }); };
const frames = (page, n) => page.evaluate((k) => new Promise((res) => { let i = 0; const f = () => (++i >= k ? res() : requestAnimationFrame(f)); requestAnimationFrame(f); }), n);
const clean = (o) => o.errors.length === 0 && o.db.count() === 0;
// the island's rare, spawned by walking near its seeded spot (9 tiles west of it)
const NEAR_RARE = (I) => { I.pause(true); I.god(true); I.clearCreatures(); const r = I.rare(); I.teleport(r.spot.x - 9, r.spot.y); I.spawnTick(); I.spawnTick(); I.step(0, 0, 0.05); I.render();
  const rc = I.creatures().filter((c) => c.rare); return { spot: r.spot, alive: I.rare().alive, rare: rc, td: I.td().rare }; };

(async () => {
  const browser = await chromium.launch();

  // ---- 1. rares ----
  const T = await open(browser, DESK, '&isle=tundra&seed=7&aurora=1');
  const r1 = await ev(T.page, NEAR_RARE);
  const T2 = await open(browser, DESK, '&isle=tundra&seed=7&aurora=1');
  const r1b = await ev(T2.page, (I) => I.rare().spot);
  check('1a tundra rare: the aurora frostfox at a seeded zone-3 spot (the same on every load), from the page table (not the pack)', r1.spot && r1.spot.creature === 'frostfox' && r1.spot.zone === 3
    && JSON.stringify(r1b) === JSON.stringify(r1.spot) && r1.td && r1.td.v === 'aurora' && r1.td.item === 'aurora_shard', JSON.stringify([r1.spot, r1b, r1.td]));
  check('1b at most one alive, drawn as a code palette swap (frostfox_aurora), never on top of the hero', r1.alive === 1 && r1.rare.length === 1 && r1.rare[0].variant === 'aurora'
    && r1.rare[0].drawn === 'frostfox_aurora' && r1.rare[0].src === 'code', JSON.stringify(r1));
  const tame = await ev(T.page, (I) => {
    const c0 = I.creatures().find((c) => c.rare); const uid = c0.uid, inv0 = I.inv().aurora_shard || 0, ev0 = I.events().length;
    I.nextTo(uid, 30);
    for (let k = 0; k < 40; k++) { I.step(0, 0, 0.25); const c = I.creatures().find((q) => q.uid === uid); if (c && c.calm) break; I.nextTo(uid, 30); }
    let tamed = false;
    for (let k = 0; k < 20 && !tamed; k++) { const r = I.feed(); if (r.tamed) tamed = true; else { I.wait(6.2); if (I.creatures().some((q) => q.uid === uid)) I.nextTo(uid, 30); } }
    const tm = I.tamesLive().roster.find((t) => t.sp === 'frostfox'), s = I.save();
    return { tamed, shard: [inv0, I.inv().aurora_shard || 0], cos: tm ? tm.cos : null, nm: tm ? tm.nm : null, seen: s.log.seen.frostfox_aurora || 0, ev: I.events().slice(ev0).map((e) => e.kind),
      alive: I.rare().alive, spawnAgain: (I.spawnTick(), I.rare().alive) };
  });
  check('1c taming the aurora frostfox (fed from the tundra pouch) adds 1 aurora shard; the tame keeps the look (cos aurora, "Aurora Frostfox")', tame.tamed && tame.shard[1] === tame.shard[0] + 1
    && tame.cos === 'aurora' && tame.nm === 'Aurora Frostfox' && tame.ev.indexOf('rare_tame') >= 0, JSON.stringify(tame));
  check('1d the rare is a journal line (seen frostfox_aurora) and, once tamed, does not come back this visit (never more than one)', tame.seen >= 1 && tame.alive === 0 && tame.spawnAgain === 0, JSON.stringify(tame));
  const kill = await ev(T2.page, (I, NR) => {
    const r = (0, eval)(NR)(I); const uid = r.rare[0].uid, inv0 = I.inv().aurora_shard || 0;
    for (let k = 0; k < 400 && I.creatures().some((c) => c.uid === uid); k++) { const c = I.creatures().find((q) => q.uid === uid); const h = I.hero(); I.nextTo(uid, 60); I.fire(c.x - h.x, c.y - 8 - h.y); I.step(0, 0, 0.1); }
    return { gone: !I.creatures().some((c) => c.uid === uid), shard: [inv0, I.inv().aurora_shard || 0] };
  }, NEAR_RARE.toString());
  check('1e a killed rare drops no aurora shard (only a tame gives it)', kill.gone && kill.shard[1] === kill.shard[0], JSON.stringify(kill));
  const D = await open(browser, DESK, '&isle=tundra&seed=7');
  const day = await ev(D.page, NEAR_RARE);
  check('1f by day (the page clock before dusk) the aurora frostfox stays away: no rare, nothing blocked', day.alive === 0 && day.rare.length === 0 && day.spot && day.spot.zone === 3, JSON.stringify(day));
  const M = await open(browser, DESK, '&isle=mars&seed=7');
  const mr = await ev(M.page, NEAR_RARE);
  check('1g mars rare: the chrome rustbeetle (zone 3, any time), one alive, drawn rustbeetle_chrome', mr.spot && mr.spot.creature === 'rustbeetle' && mr.spot.zone === 3 && mr.alive === 1
    && mr.rare.length === 1 && mr.rare[0].drawn === 'rustbeetle_chrome' && mr.td.item === 'chrome_flake', JSON.stringify(mr));
  await shot(M.page, 'td1-mars-rare-desk');

  // ---- 2. thin ice ----
  const ICE = (I) => {
    I.pause(true); I.god(true); I.clearCreatures();
    const t = I.findTile('ice_thin', 2); I.teleport(t.x, t.y); const hp0 = I.hp().hp;
    const out = { t };
    I.step(0, 0, 0.9); out.a = I.td().ice; I.render(); out.drawnA = I.td().ice.drawn;
    I.step(0, 0, 0.2); out.b = I.td().ice; I.render(); out.drawnB = I.td().ice.drawn;
    I.step(0, 0, 0.45); out.c = I.td().ice; out.cracked = I.cracked(t.x, t.y); out.scale = I.moveScale(t.x, t.y); out.hp = [hp0, I.hp().hp]; out.dead = I.hero().dead;
    I.meters(); out.ground = document.getElementById('hud-ground').textContent;
    const x0 = I.hero().x; I.step(1, 0, 0.6); out.moved = I.hero().x - x0;
    I.wait(20.5); out.thawed = !I.cracked(t.x, t.y); out.scaleAfter = I.moveScale(t.x, t.y); out.ev = I.events().map((e) => e.kind);
    return out;
  };
  const ic = await ev(D.page, ICE);
  check('2a thin ice: no telegraph before 1.0 s on one tile, the crack telegraph (drawn) after it, cracked at 1.5 s', ic.a.warnN === 0 && ic.a.made === 0 && ic.b.warnN === 1 && ic.drawnB > ic.drawnA
    && ic.b.made === 0 && ic.c.made === 1 && ic.cracked && ic.ev.indexOf('ice_warn') >= 0 && ic.ev.indexOf('ice_crack') >= 0, JSON.stringify(ic));
  check('2b a cracked tile is slush for 20 s: x0.6 footing only, no damage, no water, you walk straight off it', ic.scale === 0.6 && ic.hp[0] === ic.hp[1] && !ic.dead && /slush/.test(ic.ground)
    && ic.moved > 40, JSON.stringify(ic));
  check('2c after 20 s the slush is thin ice again (x0.85, the pack hazard)', ic.thawed && ic.scaleAfter === 0.85, JSON.stringify(ic));
  // the telegraph's pixels below the hero's feet: they grow with time normally, and are a static overlay with reduced motion
  const TELE = (I) => {
    I.pause(true); I.god(true); I.clearCreatures(); const t = I.findTile('ice_thin', 2); I.teleport(t.x, t.y);
    const cv = document.getElementById('view'), g = cv.getContext('2d'), dpr = cv.width / innerWidth, hx = innerWidth / 2, hy = innerHeight / 2;
    const grab = () => { I.render(); return Array.from(g.getImageData(Math.round((hx - 16) * dpr), Math.round((hy + 7) * dpr), Math.round(32 * dpr), Math.round(9 * dpr)).data).join(','); };
    for (let i = 0; i < 10; i++) I.render(); // every chunk on screen baked first
    I.step(0, 0, 1.1); const a = grab(); I.step(0, 0, 0.3); const b = grab();
    return { same: a === b, reduced: I.td().reduced, warn: I.td().ice.warnN };
  };
  const tMove = await ev(D.page, TELE);
  const RM = await open(browser, Object.assign({ reducedMotion: 'reduce' }, DESK), '&isle=tundra&seed=7');
  const tStill = await ev(RM.page, TELE);
  check('2d the telegraph spreads over the tile as the crack nears; with reduced motion it is one static overlay', !tMove.same && !tMove.reduced && tStill.same && tStill.reduced
    && tMove.warn >= 1 && tStill.warn >= 1, JSON.stringify([tMove, tStill]));

  // ---- 3. hot spring soak ----
  const sk = await ev(D.page, (I) => {
    I.pause(true); I.clearCreatures(); I.god(false); I.hurt(6); I.god(true);
    const t = I.findTerrain('hot_spring', true); const hp0 = I.hp().hp;
    const away = I.findEnvTile(false); I.teleport(away.x, away.y); I.envSet(80, 0); I.step(0, 0, 0.2); const cold = I.env().warm.pct;
    I.teleport(t.x, t.y); const ev0 = I.events().length;
    I.step(0, 0, 1.8); const mid = { soak: I.td().soak, hp: I.hp().hp };
    I.step(0, 0, 0.4); const after = { soak: I.td().soak, hp: I.hp(), warm: I.env().warm.pct, toast: document.getElementById('toast').textContent };
    I.step(0, 0, 3); const again = I.td().soak.n;
    return { t, hp0, cold, mid, after, again, ev: I.events().slice(ev0).map((e) => e.kind), name: I.terrainName(t.x, t.y) };
  });
  check('3a soaking 2 s in a hot spring: "Warm and rested" (event soak), not before', sk.name === 'hot_spring' && sk.mid.soak.n === 0 && sk.after.soak.n === 1 && /Warm and rested/.test(sk.after.toast)
    && sk.ev.indexOf('soak') >= 0, JSON.stringify(sk));
  check('3b the soak gives full warmth and full HP (a calm heal, once per soak)', sk.cold < 20 && sk.after.warm === 100 && sk.hp0 < sk.after.hp.maxHp && sk.after.hp.hp === sk.after.hp.maxHp && sk.again === 1, JSON.stringify(sk));
  const S1 = await open(browser, DESK, '&isle=tundra&seed=1');
  const salt = await ev(S1.page, (I) => { I.pause(true); I.god(true); I.clearCreatures(); const ns = I.nodes().concat(I.spots()).filter((n) => n.kind === 'spring_salt');
    const n = I.nodes().find((q) => q.kind === 'spring_salt'); let got = null; if (n) { const a = I.inv().spring_salt || 0; I.teleport(n.x, n.y); I.step(0, 0, 0.3); got = [a, I.inv().spring_salt || 0, I.td().soak]; }
    return { n: ns.length, on: ns.map((q) => I.terrainName(q.x, q.y)), got }; });
  check('3c spring salt still gathers at the hot springs (a walk-over glint on a hot_spring tile)', salt.n > 0 && salt.on.every((t) => t === 'hot_spring') && (!salt.got || salt.got[1] === salt.got[0] + 1), JSON.stringify(salt));

  // ---- 4. aurora night ----
  const night = await ev(D.page, (I) => {
    I.pause(true); I.god(true); I.clearCreatures(); const s = I.world.spawnPoint; I.teleport(s.x, s.y);
    const d0 = I.td(); I.render(); const drawn0 = I.td().auroraDrawn;
    const g = I.td().glints.find((q) => [[0, 1], [1, 0], [0, -1], [-1, 0], [0, 0]].some((d) => I.walkable(q.x + d[0], q.y + d[1]) && !I.heroSolid(q.x + d[0], q.y + d[1])));
    I.wait(149 - I.simT()); I.clearCreatures(); const at149 = I.td().night;
    I.wait(2); I.clearCreatures(); I.render(); const at151 = I.td();
    return { d0: d0.night, drawn0, at149, at151: { night: at151.night, drawn: at151.auroraDrawn, live: at151.glints.filter((q) => q.live).length }, dayLive: d0.glints.filter((q) => q.live).length, g };
  });
  check('4a the page clock passes dusk at 150 s (not the real time of day): day before, aurora night after', night.d0 === false && night.at149 === false && night.at151.night === true, JSON.stringify(night));
  check('4b the aurora band draws only at night (one cached canvas)', night.drawn0 === 0 && night.at151.drawn > 0, JSON.stringify(night));
  check('4c aurora crystals glint at night only', night.dayLive === 0 && night.at151.live > 0 && !!night.g, JSON.stringify(night));
  const gl = await ev(T.page, (I) => {
    I.pause(true); I.god(true); I.clearCreatures();
    const qs = I.td().glints, q = qs.find((g) => [[0, 1], [1, 0], [0, -1], [-1, 0], [0, 0]].some((d) => I.walkable(g.x + d[0], g.y + d[1]) && !I.heroSolid(g.x + d[0], g.y + d[1])));
    const d = [[0, 0], [0, 1], [1, 0], [0, -1], [-1, 0]].find((e) => I.walkable(q.x + e[0], q.y + e[1]) && !I.heroSolid(q.x + e[0], q.y + e[1]));
    const n0 = I.inv().aurora_shard || 0; I.teleport(q.x + d[0], q.y + d[1]); I.step(0, 0, 0.3);
    const n1 = I.inv().aurora_shard || 0; I.step(0, 0, 0.5); const n2 = I.inv().aurora_shard || 0;
    const s = I.save(); return { q, n: [n0, n1, n2], taken: I.td().glints.find((g) => g.i === q.i).taken, saved: s.glint };
  });
  check('4d an aurora glint gives 1 aurora shard once a day (save.glint, isles key only)', gl.n[1] === gl.n[0] + 1 && gl.n[2] === gl.n[1] && gl.taken && gl.saved && Array.isArray(gl.saved.n.ice)
    && gl.saved.n.ice.indexOf(gl.q.i) >= 0, JSON.stringify(gl));
  const N0 = await open(browser, DESK, '&isle=tundra&seed=7&aurora=0');
  const n0 = await ev(N0.page, (I) => { I.pause(true); I.god(true); I.clearCreatures(); I.wait(160); I.clearCreatures(); I.render(); return I.td(); });
  check('4e ?aurora=0 keeps the tundra in daylight (no band, no night)', !n0.night && n0.auroraDrawn === 0 && !n0.aurora, JSON.stringify({ night: n0.night, drawn: n0.auroraDrawn }));
  await ev(T.page, (I) => { I.pause(true); I.clearCreatures(); const s = I.world.spawnPoint; I.teleport(s.x, s.y); I.render(); return true; });
  await shot(T.page, 'td1-tundra-aurora-desk');

  // ---- 5. oxygen polish (mars) ----
  const ox = await ev(M.page, (I) => {
    I.pause(true); I.god(true); I.clearCreatures(); const ex = I.findEnvTile(false); I.teleport(ex.x, ex.y);
    I.envSet(0, 69.5); I.step(0, 0, 0.2); const a = { air: I.td().air, left: I.env().o2.left, cls: document.getElementById('env-o2').className };
    I.step(0, 0, 0.6); const b = { air: I.td().air, left: I.env().o2.left, cls: document.getElementById('env-o2').className, toast: document.getElementById('toast').textContent, hint: I.hint() };
    const shp = document.querySelector('#env-o2 .shp-o2'), r = shp.getBoundingClientRect();
    const sh = I.findEnvTile(true); I.teleport(sh.x, sh.y); I.step(0, 0, 0.3); const c = I.td().air;
    I.teleport(ex.x, ex.y); I.envSet(0, 72); I.step(0, 0, 0.3); I.render();
    return { a, b, c, shp: { w: r.width, h: r.height, hidden: shp.getAttribute('aria-hidden') }, arrow: I.td().air };
  });
  check('5a the air meter has a shape icon (a bubble, not colour alone; aria-hidden next to the "Air" label)', ox.shp.w >= 8 && ox.shp.h >= 8 && ox.shp.hidden === 'true', JSON.stringify(ox.shp));
  check('5b the air warning comes at 20 s left (>= 15 s before empty): the toast, the warn colour and the hint', !ox.a.air.low && ox.a.left > 20 && ox.b.air.low && ox.b.left >= 15 && /warn/.test(ox.b.cls) && !/warn/.test(ox.a.cls)
    && /Air is running low/.test(ox.b.toast) && /nearest dome/.test(ox.b.hint), JSON.stringify(ox));
  check('5c while low outside, an arrow points to the nearest dome; inside a dome it goes away', ox.b.air.arrow && ox.b.air.tiles > 0 && !ox.a.air.arrow && !ox.c.arrow && ox.arrow.arrow, JSON.stringify(ox));
  const row = await ev(M.page, (I) => { I.openPanel('craft'); const q = (id) => { const r = document.querySelector('.recipe[data-recipe="' + id + '"] .rc-note'); return r ? r.textContent : ''; }; const o = { tank: q('o2_tank'), kelp: q('o2_tank_kelp'), lamp: !!document.querySelector('.recipe[data-recipe="aurora_lamp"]'), beacon: !!document.querySelector('.recipe[data-recipe="chrome_beacon"]') }; I.closePanel(); return o; });
  check('5d the craft panel: the o2 tank rows say "+30 s air"; the TD1 decor rows are listed', /\+30 s air/.test(row.tank) && /\+30 s air/.test(row.kelp) && row.lamp && row.beacon, JSON.stringify(row));
  await shot(M.page, 'td1-mars-air-desk');
  const sal = await ev(M.page, (I) => {
    I.pause(true); I.god(true); I.clearCreatures(); I.envSet(0, 0);
    const q = I.td().glints[0]; const d = [[0, 0], [0, 1], [1, 0], [0, -1], [-1, 0], [1, 1], [-1, -1]].find((e) => I.walkable(q.x + e[0], q.y + e[1]) && !I.heroSolid(q.x + e[0], q.y + e[1]));
    const n0 = I.inv().chrome_flake || 0; I.teleport(q.x + d[0], q.y + d[1]); I.step(0, 0, 0.3); const n1 = I.inv().chrome_flake || 0;
    I.give('chrome_flake', 3); I.give('iron', 2); const cr = I.craft('chrome_beacon'); I.give('aurora_shard', 2); I.give('frost_crystal', 1); const cl = I.craft('aurora_lamp');
    return { n: [n0, n1], q, cr, cl, inv: I.inv() };
  });
  check('7a a wreck glint on mars gives a chrome flake (salvage, by day); chrome_beacon and aurora_lamp craft from the rare items', sal.n[1] === sal.n[0] + 1 && sal.cr.ok && sal.cl.ok
    && sal.inv.chrome_beacon === 1 && sal.inv.aurora_lamp === 1, JSON.stringify(sal));

  // ---- 6. rocket launch: craft 1 core, sail to mars 3 times ----
  const L = await open(browser, DESK, '&isle=jungle&seed=7');
  const lc = await ev(L.page, (I) => { I.pause(true); I.god(true); I.give('driftwood', 3); I.give('frost_crystal', 2); I.give('amber', 2); I.give('pearl', 1); const r = I.craft('rocket_core_drift'); return { r, core: I.inv().rocket_core }; });
  const sail = async (page, to) => { const t0 = Date.now(); const l = await ev(page, (I, d) => { I.travel(d); return I.td().launch; }, to); return { t0, l }; };
  let s1 = await sail(L.page, 'mars'), t0 = s1.t0;
  const mid = s1.l;
  await L.page.waitForTimeout(900);
  const mid2 = await L.page.evaluate(() => ({ url: location.search, l: window.__isles.td().launch }));
  await L.page.waitForURL(/isle=mars/, { timeout: 8000 });
  const dt1 = Date.now() - t0;
  await ready(L.page);
  const land1 = await ev(L.page, (I) => { const h = I.hero(); return { isle: I.isle || '', ground: I.terrainName(h.tx, h.ty), core: I.inv().rocket_core, open: I.isleOpen('mars'), q: location.search }; });
  check('6a sailing to mars plays the lift-off over the island (2.5 s), then lands on the mars landing pad', lc.r.ok && lc.core === 1 && mid.on && mid.n === 1 && /isle=jungle/.test(mid2.url) && mid2.l.on
    && mid2.l.t > 0.5 && dt1 >= 2200 && land1.ground === 'landing_pad' && /at=dock/.test(land1.q), JSON.stringify([lc, mid, mid2, dt1, land1]));
  await sail(L.page, 'jungle');
  await L.page.waitForURL(/isle=jungle/, { timeout: 8000 }); await ready(L.page);
  t0 = (await sail(L.page, 'mars')).t0;
  await L.page.waitForTimeout(150);
  await L.page.mouse.click(500, 350);
  await L.page.waitForURL(/isle=mars/, { timeout: 8000 });
  const dt2 = Date.now() - t0;
  await ready(L.page);
  const land2 = await ev(L.page, (I) => { const h = I.hero(); return { ground: I.terrainName(h.tx, h.ty), core: I.inv().rocket_core }; });
  check('6b a tap skips the lift-off (well under 2.5 s) and still lands on the pad; the core is still 1', dt2 < 2000 && land2.ground === 'landing_pad' && land2.core === 1 && land1.core === 1, JSON.stringify([dt2, land1, land2]));
  const saved = await L.page.evaluate((k) => localStorage.getItem(k), KEY);
  const R = await open(browser, Object.assign({ reducedMotion: 'reduce' }, DESK), '&isle=jungle&seed=7', { [KEY]: saved });
  const l3 = (await sail(R.page, 'mars')).l;
  await R.page.waitForURL(/isle=mars/, { timeout: 8000 }); await ready(R.page);
  const land3 = await ev(R.page, (I) => { const h = I.hero(); return { ground: I.terrainName(h.tx, h.ty), core: I.inv().rocket_core, n: I.td().launch.n }; });
  check('6c reduced motion skips the scene (no launch at all); after 3 trips the one crafted rocket core is still there (never used up)', l3.n === 0 && !l3.on && land3.ground === 'landing_pad'
    && land3.core === 1, JSON.stringify([l3, land3]));
  check('6d the launches: no console errors, 0 DB requests', clean(L) && clean(R), L.errors.concat(R.errors).join(' | '));

  // ---- 7. the archipelago key with all 5 isles visited (size 192), fog revealed: < 20 KB ----
  const V = await open(browser, DESK, '&isle=meadow', { [KEY]: saved });
  let big = null;
  for (const isle of ['meadow', 'jungle', 'tundra', 'reef', 'mars']) {
    await V.page.goto(PAGE + '?test=1&isle=' + isle); await ready(V.page);
    big = await ev(V.page, (I) => { I.pause(true); I.god(true); const W = I.world.w, H = I.world.h; for (let y = 4; y < H; y += 9) for (let x = 4; x < W; x += 9) I.place(x * 32, y * 32); I.give('aurora_shard', 1); const s = I.save(); return { visited: s.visited, bytes: (localStorage.getItem('pixeltown-archipelago-v1') || '').length, w: W }; });
  }
  check('7b all 5 isles visited with their fog revealed: the archipelago key stays < 20 KB (the TD1 keys are additive)', big.visited.length === 5 && big.bytes < 20000 && big.w >= 96, JSON.stringify(big));

  // ---- phone 390x844 ----
  const PT = await open(browser, PHONE, '&isle=tundra&seed=7&aurora=1');
  const pt = await ev(PT.page, (I) => { I.pause(true); I.god(true); I.clearCreatures(); const s = I.world.spawnPoint; I.teleport(s.x, s.y); I.step(0, 0, 0.2); I.render(); I.meters();
    const m = document.getElementById('env-warm'), r = m.getBoundingClientRect(), sh = m.querySelector('.shp').getBoundingClientRect();
    return { drawn: I.td().auroraDrawn, night: I.td().night, r: r.right, vis: !m.hidden && r.width > 0, shp: sh.width, hs: document.documentElement.scrollWidth > innerWidth }; });
  check('8a phone tundra: the aurora night draws, the warmth meter (with its shape icon) fits the HUD, no horizontal scroll', pt.night && pt.drawn > 0 && pt.vis && pt.r <= 390 && pt.shp >= 8 && !pt.hs, JSON.stringify(pt));
  const pi = await ev(PT.page, (I) => { I.clearCreatures(); const t = I.findTile('ice_thin', 2); I.teleport(t.x, t.y); I.step(0, 0, 1.2); I.render(); return I.td().ice; });
  check('8b phone tundra: the thin-ice telegraph draws', pi.warnN >= 1 && pi.drawn >= 1, JSON.stringify(pi));
  await PT.page.evaluate(() => { const t = document.getElementById('toast'); if (t) t.classList.remove('on'); });
  await shot(PT.page, 'td1-tundra-ice-phone');
  const PM = await open(browser, PHONE, '&isle=mars&seed=7');
  const pm = await ev(PM.page, (I) => { I.pause(true); I.god(true); I.clearCreatures(); const ex = I.findEnvTile(false); I.teleport(ex.x, ex.y); I.envSet(0, 72); I.step(0, 0, 0.3); I.render(); I.meters();
    const m = document.getElementById('env-o2'), r = m.getBoundingClientRect();
    return { arrow: I.td().air.arrow, warn: m.classList.contains('warn'), r: r.right, txt: m.textContent.trim(), hs: document.documentElement.scrollWidth > innerWidth }; });
  check('8c phone mars: the air arrow shows, the Air meter (bubble icon, warn colour) fits at 390 px, no horizontal scroll', pm.arrow && pm.warn && pm.r <= 390 && /^Air \d+ s$/.test(pm.txt) && !pm.hs, JSON.stringify(pm));
  await shot(PM.page, 'td1-mars-air-phone');

  check('9 no console errors and 0 DB requests on every page', all.every(clean), all.map((o) => o.errors.join(' | ')).filter(Boolean).join(' / ') + ' db ' + all.map((o) => o.db.count()).join(','));
  await browser.close();
  done();
})().catch((e) => { console.error(e); process.exit(1); });
