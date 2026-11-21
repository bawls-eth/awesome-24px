// Deepdelve cave creatures + health. Serve the repo root: python3 -m http.server 8513 &
// Run: BASE=http://localhost:8513/game/index.html NODE_PATH=$(npm root -g) node game/tests/deepdelve-mobs.test.js
// THREE_JS=<file> serves three.js locally instead of the CDN. No Firebase.
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const { check, done } = require('./helpers');
const ORIGIN = (process.env.BASE || 'http://localhost:8440/game/index.html').replace(/\/game\/index\.html.*$/, '');
const URL = (q) => ORIGIN + '/game/games/deepdelve/index.html?test=1' + (q || '');
const THREE_URL = 'https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.min.js';
const DESKTOP = { viewport: { width: 1000, height: 700 } };
const PHONE = { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true };
const all = [];
async function open(browser, q, opts) {
  const ctx = await browser.newContext(opts || DESKTOP);
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  if (process.env.THREE_JS) await page.route(THREE_URL, (route) => route.fulfill({ status: 200, contentType: 'application/javascript', body: fs.readFileSync(process.env.THREE_JS) }));
  await page.goto(URL(q));
  await page.waitForFunction(() => window.__dd && window.__dd.ready);
  const o = { ctx, page, errors }; all.push(o); return o;
}
// Carves a sealed dark chamber around the candidates near a deep player position, then scans for spawns.
const carve = () => {
  const d = window.__dd, s = d.surfaceY(64, 64), wy = s + 12;
  d.setPick(3); d.setPos(64.5, -(wy + 1), 64.5);
  d.mineAt(64, wy, 64); d.mineAt(64, wy - 1, 64);
  const pc = { cx: 4, cz: 4 }, cells = [];
  for (let cy = 0; cy < 4; cy++) for (let dz = -2; dz <= 2; dz++) for (let dx = -2; dx <= 2; dx++) d.creatureCands(pc.cx + dx, cy, pc.cz + dz).forEach((c) => {
    const dist = Math.hypot(c.wx - 64, c.wy - wy, c.wz - 64);
    if (dist < 9 || dist > 28 || c.wy < s + 3) return;
    d.mineAt(c.wx, c.wy, c.wz); d.mineAt(c.wx, c.wy - 1, c.wz);
    cells.push(c.id);
  });
  return { cells: cells.length, spawned: d.scanSpawns(), ids: d.creatures.map((m) => m.id) };
};

(async () => {
  const browser = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const A = await open(browser, '&seed=5');
  const p = A.page;

  // 1. spawns are seeded: the same seed gives the same creatures in the same cells, another seed does not
  const r1 = await p.evaluate(carve);
  const B = await open(browser, '&seed=5');
  const r2 = await B.page.evaluate(carve);
  const C = await open(browser, '&seed=6');
  const r3 = await C.page.evaluate(carve);
  check('creature spawns are deterministic per seed (same ids on a fresh page, different for another seed)', r1.ids.length > 0 && JSON.stringify(r1.ids) === JSON.stringify(r2.ids) && JSON.stringify(r1.ids) !== JSON.stringify(r3.ids), JSON.stringify([r1, r2.ids, r3.ids]));
  check('at most 8 creatures are active at once, even with more candidate cells open', r1.cells > 8 && r1.ids.length <= 8 && r1.ids.length === r1.spawned, JSON.stringify(r1));

  // 2. they only live in dark underground air
  const dk = await p.evaluate(() => {
    const d = window.__dd, s = d.surfaceY(64, 64);
    return d.creatures.map((m) => ({ kind: m.kind, air: d.getBlock(Math.floor(m.x), Math.floor(-(m.y + 0.2)), Math.floor(m.z)), dark: d.caveDark(Math.floor(m.x), Math.floor(-(m.y + 0.2)), Math.floor(m.z)), deep: Math.floor(-(m.y + 0.2)) >= s + 2 }));
  });
  check('every creature stands in an air cell that is dark and underground', dk.length > 0 && dk.every((c) => c.air === 0 && c.dark && c.deep), JSON.stringify(dk));
  const near = await p.evaluate(() => { const d = window.__dd; d.setPos(64.5, 2, 64.5); const n = d.creatures.length; const sp = d.scanSpawns(); return { n, sp }; });
  check('nothing spawns while the player is on the surface', near.sp === 0, JSON.stringify(near));

  // 3. distance culling
  const cull = await p.evaluate(() => {
    const d = window.__dd, before = d.creatures.length;
    d.setPos(2.5, -(d.surfaceY(2, 2)), 2.5); d.tickCreatures(0.016);
    return { before, after: d.creatures.length };
  });
  check('creatures more than 40 blocks away are culled', cull.before > 0 && cull.after === 0, JSON.stringify(cull));

  // 4. melee with knockback, damage by pick tier, kill + drop (open surface spot, deterministic placement)
  const me = await p.evaluate(() => {
    const d = window.__dd, s = d.surfaceY(30, 30), r = {};
    d.setPos(30.5, -s, 30.5); d.step(1 / 60, 20); d.setPick(0); d.player.yaw = 0; d.player.pitch = 0; d.player.iframes = 0;
    const c = d.spawnCreature('crawler', 30.5, d.player.y, 28.9, 'tst1', 0);
    r.hp0 = c.hp; r.z0 = c.z;
    r.hit = d.attackCreature(false); r.hp1 = c.hp;
    d.tickCreatures(0.05); d.tickCreatures(0.05); d.tickCreatures(0.05);
    r.pushed = r.z0 - c.z; // moved away (toward -z) from the player
    d.setPick(2); c.hurtCd = 5; const coal0 = d.inv.coal | 0;
    d.attackCreature(false); r.hp2 = c.hp; r.dead = c.dead;
    d.tickCreatures(0.016);
    r.gone = d.creatures.indexOf(c) < 0; r.slain = d.slain.has('tst1');
    const bat = d.spawnCreature('bat', 30.5, d.player.y + 1, 29.4, 'tst2', 1);
    d.attackCreature(false); r.batDead = bat.dead; d.tickCreatures(0.016);
    r.coalGain = (d.inv.coal | 0) - coal0;
    return r;
  });
  check('a melee hit does damage and knocks the crawler back from the player', me.hit && me.hp1 === me.hp0 - 1 && me.pushed > 0.3, JSON.stringify(me));
  check('an iron pick hits harder (2), the crawler dies, is removed, remembered as slain, and drops coal', me.hp2 <= 0 && me.dead && me.gone && me.slain && me.coalGain === 1, JSON.stringify(me));
  check('a bat dies to one hit', me.batDead === true, JSON.stringify(me));

  // 5. contact damage, health bar, and the death rule (keep tools/ores/torches, lose half of loose stone and dirt)
  const hp = await p.evaluate(() => {
    const d = window.__dd, s = d.surfaceY(30, 30), r = {};
    d.setPos(30.5, -s, 30.5); d.step(1 / 60, 20); d.player.hp = 10; d.player.iframes = 0;
    d.spawnCreature('crawler', d.player.x, d.player.y, d.player.z, 'tst3', 0);
    d.tickCreatures(0.016);
    r.hp = d.player.hp; r.bar = document.getElementById('hpfill').style.width; r.txt = document.getElementById('hud-hp').textContent;
    d.clearCreatures();
    d.inv.stone = 11; d.inv.dirt = 5; d.inv.torch = 3; d.inv.iron = 2; d.setPick(2, 100);
    d.player.hp = 1; d.player.iframes = 0;
    d.spawnCreature('crawler', d.player.x, d.player.y, d.player.z, 'tst4', 0);
    d.tickCreatures(0.016);
    r.after = { hp: d.player.hp, stone: d.inv.stone, dirt: d.inv.dirt, torch: d.inv.torch, iron: d.inv.iron, tier: d.pick.tier, atStart: Math.abs(d.player.x - d.spawn.x) < 0.01 && Math.abs(d.player.z - d.spawn.z) < 0.01, mobs: d.creatures.length, deaths: d.meta().goals.deaths };
    return r;
  });
  check('contact costs 1 HP and the health bar and HUD text follow', hp.hp === 9 && hp.bar === '90%' && /9\/10/.test(hp.txt), JSON.stringify(hp));
  check('creature death respawns at the start with full HP, keeps tools/ores/torches, loses half the stone and dirt', hp.after.hp === 10 && hp.after.stone === 6 && hp.after.dirt === 3 && hp.after.torch === 3 && hp.after.iron === 2 && hp.after.tier === 2 && hp.after.atStart && hp.after.mobs === 0 && hp.after.deaths >= 1, JSON.stringify(hp.after));
  const other = await p.evaluate(() => { const d = window.__dd; d.inv.stone = 10; d.die('test death'); return d.inv.stone; });
  check('other deaths (fall, lava, test) keep the whole inventory as before', other === 10, String(other));

  // 6. mining and placing are unaffected, and the creature code uses no Math.random
  const mp = await p.evaluate(() => {
    const d = window.__dd, s = d.surfaceY(40, 40);
    const m = d.mineAt(40, s + 5, 40); d.setPos(45.5, -s, 45.5);
    return { m, placed: d.placeAt(40, s + 5, 40, 'stone') };
  });
  const src = fs.readFileSync(path.join(__dirname, '../games/deepdelve/deepdelve.js'), 'utf8');
  const sec = src.slice(src.indexOf('// ---------- Cave creatures (seeded)'), src.indexOf('// ---------- test hooks'));
  check('mining and placing still work after all this; the creature section has no Math.random', mp.m && mp.placed && sec.length > 2000 && !/Math\.random/.test(sec), JSON.stringify(mp));

  // 7. phone: creatures render, the health bar is visible, nothing overflows
  const P = await open(browser, '&seed=5', PHONE);
  const ph = await P.page.evaluate(carve);
  await P.page.waitForTimeout(400);
  const pv = await P.page.evaluate(() => {
    const b = document.getElementById('hpbar').getBoundingClientRect();
    return { sw: document.documentElement.scrollWidth, vw: window.innerWidth, bar: b.width > 40 && b.height > 4 && b.right <= window.innerWidth, meshes: window.__dd.creatures.filter((m) => m.mesh).length, n: window.__dd.creatures.length, view: window.__dd.view };
  });
  check('390x844: creatures get meshes, the health bar is visible and nothing scrolls sideways', ph.spawned > 0 && pv.meshes === pv.n && pv.n > 0 && pv.bar && pv.sw <= pv.vw, JSON.stringify([ph.spawned, pv]));

  const errs = [].concat(...all.map((o) => o.errors));
  check('no console errors', errs.length === 0, JSON.stringify(errs));
  await browser.close();
  done();
})().catch((e) => { console.error(e); process.exitCode = 1; });
