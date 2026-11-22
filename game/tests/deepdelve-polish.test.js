// Deepdelve polish: ore gating, furnace, crafting UI, lava, creative mode, goals, town-cave migration, Glow Slime.
// Serve the repo root: python3 -m http.server 8459 &
// Run: BASE=http://localhost:8459/game/index.html NODE_PATH=$(npm root -g) node game/tests/deepdelve-polish.test.js
// SHOTS=<dir> writes desktop/phone screenshots. THREE_JS=<file> serves three.js locally instead of the CDN.
const { chromium } = require('playwright');
const fs = require('fs');
const { check, done } = require('./helpers');
const ORIGIN = (process.env.BASE || 'http://localhost:8440/game/index.html').replace(/\/game\/index\.html.*$/, '');
const URL = (q) => ORIGIN + '/game/games/deepdelve/index.html?test=1' + (q || '');
const THREE_URL = 'https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.min.js';
const DESKTOP = { viewport: { width: 1000, height: 700 } };
const PHONE = { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true };
const META = 'pixeltown-deepdelve-v1', TOWN = 'pixeltown-save-v1';
const all = [];

async function open(browser, q, opts, init) {
  const ctx = await browser.newContext(opts || DESKTOP);
  const page = await ctx.newPage();
  const errors = [], reqs = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  page.on('request', (r) => reqs.push(r.url()));
  if (init) await page.addInitScript(init.fn, init.arg);
  if (process.env.THREE_JS) await page.route(THREE_URL, (route) => route.fulfill({ status: 200, contentType: 'application/javascript', body: fs.readFileSync(process.env.THREE_JS) }));
  await page.goto(URL(q));
  await page.waitForFunction(() => window.__dd && window.__dd.ready);
  const o = { ctx, page, errors, reqs };
  all.push(o);
  return o;
}
const reload = async (page) => { await page.reload(); await page.waitForFunction(() => window.__dd && window.__dd.ready); };

(async () => {
  const browser = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const A = await open(browser, '&seed=5');
  const p = A.page;

  // 1. ore gating: iron needs a stone pick, gold an iron pick
  const og = await p.evaluate(() => {
    const d = window.__dd, w = d.world, found = {};
    for (let y = 8; y < 47 && !(found.iron && found.gold); y++) for (let x = 10; x < 70; x++) for (let z = 10; z < 70; z++) {
      const b = w.getBlock(x, y, z);
      if (b === 5 && !found.iron) found.iron = [x, y, z];
      if (b === 6 && !found.gold) found.gold = [x, y, z];
    }
    const r = { found };
    d.setPos(found.iron[0] + 0.5, -2, found.iron[2] + 0.5);
    r.woodIron = d.mineAt(...found.iron); r.ironAfterWood = d.getBlock(...found.iron);
    d.setPick(1); r.stoneIron = d.mineAt(...found.iron); r.ironOre = d.inv.iron_ore | 0;
    r.stoneGold = d.mineAt(...found.gold); r.goldStill = d.getBlock(...found.gold);
    d.setPick(2); r.ironGold = d.mineAt(...found.gold); r.goldOre = d.inv.gold_ore | 0;
    return r;
  });
  check('iron ore cannot be mined with a wood pick', og.woodIron === false && og.ironAfterWood === 5, JSON.stringify(og));
  check('iron ore can be mined with a stone pick', og.stoneIron === true && og.ironOre === 1);
  check('gold needs an iron pick (stone pick refused, iron pick works)', og.stoneGold === false && og.goldStill === 6 && og.ironGold === true && og.goldOre === 1);

  // 2. durability decreases and the page shows the pick tier
  const du = await p.evaluate(() => {
    const d = window.__dd, s = d.surfaceY(40, 40);
    d.setPick(1);
    const before = d.pick.dur; d.mineAt(40, s + 5, 40);
    return { before, after: d.pick.dur, hud: document.getElementById('hud-pick').textContent };
  });
  check('pick durability decreases when mining and the HUD shows the tier', du.after < du.before && /Stone/.test(du.hud) && du.hud.indexOf(du.after + '/60') >= 0, JSON.stringify(du));

  // 3. furnace smelting consumes exact inputs
  const sm = await p.evaluate(() => {
    const d = window.__dd, s = d.surfaceY(30, 30);
    d.setPos(30.5, -s, 30.5); d.step(1 / 60, 5);
    d.inv.iron_ore = 3; d.inv.coal = 2; d.inv.iron = 0; d.inv.stone = 20; d.inv.furnace = 0;
    const noFurnace = d.smeltOre('iron_ore');
    const crafted = d.craftRecipe('furnace');
    const stoneLeft = d.inv.stone, furnaces = d.inv.furnace;
    const placed = d.placeAt(32, s - 1, 30, 'furnace');
    const near = d.furnaceNear();
    const ok = d.smeltOre('iron_ore');
    return { noFurnace, crafted, stoneLeft, furnaces, placed, near, ok, iron_ore: d.inv.iron_ore, coal: d.inv.coal, iron: d.inv.iron, block: d.getBlock(32, s - 1, 30) };
  });
  check('furnace recipe consumes exactly 8 stone', sm.crafted && sm.stoneLeft === 12 && sm.furnaces === 1, JSON.stringify(sm));
  check('smelting needs a placed furnace', sm.noFurnace === false && sm.placed && sm.near && sm.block === 12);
  check('smelting consumes exactly 1 ore + 1 coal and yields 1 ingot', sm.ok && sm.iron_ore === 2 && sm.coal === 1 && sm.iron === 1, JSON.stringify(sm));

  // 4. crafting UI lists the 24 recipes, with canCraft state
  const ui = await p.evaluate(() => {
    const d = window.__dd;
    d.inv.wood = 4; d.inv.stone = 0;
    d.panel('craft', true);
    const rows = document.querySelectorAll('#recipes li').length;
    const table = document.querySelector('button[data-recipe="table"]'), brick = document.querySelector('button[data-recipe="brick"]');
    return { rows, panel: !document.getElementById('craft-panel').hidden, tableOn: !table.disabled, brickOn: !brick.disabled };
  });
  check('crafting UI lists all 24 recipes', ui.rows === 24 && ui.panel, JSON.stringify(ui));
  check('canCraft enables only affordable recipes', ui.tableOn === true && ui.brickOn === false);
  const cr = await p.evaluate(() => {
    const d = window.__dd;
    d.inv.wood = 5; d.inv.table = 0;
    const ok = d.craftRecipe('table');
    const r = { ok, wood: d.inv.wood, table: d.inv.table };
    d.inv.iron = 4; d.inv.wood = 2;
    r.pick = d.craftRecipe('iron_pick'); r.tier = d.pick.tier; r.dur = d.pick.dur; r.silver = d.meta().goals.silver; r.iron = d.inv.iron; r.wood2 = d.inv.wood; r.leak = d.inv.pick2 | 0;
    d.panel('craft', false);
    return r;
  });
  check('crafting consumes exactly the recipe inputs', cr.ok && cr.wood === 1 && cr.table === 1, JSON.stringify(cr));
  check('crafting an iron pick equips it (tier 2, full durability) and earns silver', cr.pick && cr.tier === 2 && cr.dur === 120 && cr.silver === true && cr.iron === 0 && cr.wood2 === 0 && cr.leak === 0, JSON.stringify(cr));
  const stored = await p.evaluate((k) => JSON.parse(localStorage.getItem(k)), META);
  check('medals are saved under the new pixeltown-deepdelve-v1 key', stored && stored.goals && stored.goals.silver === true, JSON.stringify(stored));

  // 5. keyboard: C opens crafting, G goals, Escape closes
  await p.keyboard.press('c');
  const k1 = await p.evaluate(() => !document.getElementById('craft-panel').hidden);
  await p.keyboard.press('Escape');
  const k2 = await p.evaluate(() => document.getElementById('craft-panel').hidden);
  await p.keyboard.press('g');
  const k3 = await p.evaluate(() => ({ open: !document.getElementById('goals-panel').hidden, items: document.querySelectorAll('#goal-list li').length }));
  await p.click('#close-goals');
  check('C opens crafting, Escape closes it, G opens the goals panel (3 medals)', k1 && k2 && k3.open && k3.items === 3, JSON.stringify([k1, k2, k3]));

  // 6. depth goal triggers bronze
  const dg = await p.evaluate(() => {
    const d = window.__dd, s = d.surfaceY(64, 64);
    d.setPos(64.5, -(s + 2), 64.5); d.checkGoals(); const before = d.meta().goals.bronze;
    d.setPos(64.5, -9.2, 64.5); d.checkGoals();
    return { before, after: d.meta().goals.bronze, depth: document.getElementById('hud-depth').textContent };
  });
  check('reaching depth 8 awards the bronze medal', dg.before === false && dg.after === true, JSON.stringify(dg));

  // 7. lava damages and respawns at the surface
  const lv = await p.evaluate(() => {
    const d = window.__dd, hp0 = d.player.hp;
    d.setPos(80.5, -42.9, 64.5);
    const lavaBlock = d.getBlock(80, 42, 64);
    d.step(1 / 60, 30);
    const hurtHp = d.player.hp;
    d.step(1 / 60, 200);
    return { lavaBlock, hp0, hurtHp, hpAfter: d.player.hp, y: d.player.y, spawnY: d.spawn.y, msg: document.getElementById('msg').textContent, deaths: d.meta().goals.deaths, void: d.meta().goals.secretVoid, bar: document.getElementById('hpfill').style.width };
  });
  check('lava tiles damage the player (health drops)', lv.lavaBlock === 8 && lv.hurtHp < lv.hp0, JSON.stringify(lv));
  check('dying in lava respawns at the surface with a message and full health', lv.hpAfter === 10 && Math.abs(lv.y - lv.spawnY) < 0.6 && /surface/i.test(lv.msg) && lv.deaths === 1 && lv.bar === '100%', JSON.stringify(lv));

  // 8. survival fall damage vs creative flight, and the toggle persists
  const sv = await p.evaluate(() => {
    const d = window.__dd, s = d.surfaceY(20, 20);
    d.setPos(20.5, -s - 14, 20.5); d.step(1 / 60, 5);
    d.setPos(20.5, -s + 8, 20.5); d.step(1 / 60, 150);
    return { hp: d.player.hp };
  });
  check('survival mode: a long fall costs health', sv.hp < 10, JSON.stringify(sv));
  await p.click('#mode-btn');
  const cm = await p.evaluate(() => {
    const d = window.__dd, s = d.surfaceY(20, 20);
    d.player.hp = 10; d.setPos(20.5, -s + 14, 20.5); d.step(1 / 60, 90);
    const hover = d.player.y;
    d.input.jump = true; d.step(1 / 60, 30); d.input.jump = false;
    return { mode: d.meta().mode, hover, up: d.player.y, hp: d.player.hp, start: -s + 14, label: document.getElementById('mode-btn').textContent, down: !document.getElementById('t-down').hidden };
  });
  check('creative mode: flight (hovers, rises on jump) and no fall damage', cm.mode === 'creative' && Math.abs(cm.hover - cm.start) < 0.01 && cm.up > cm.hover + 2 && cm.hp === 10 && /Creative/.test(cm.label) && cm.down, JSON.stringify(cm));
  await reload(p);
  const cp = await p.evaluate(() => ({ mode: window.__dd.meta().mode, label: document.getElementById('mode-btn').textContent }));
  check('creative mode toggle persists across reload', cp.mode === 'creative' && /Creative/.test(cp.label), JSON.stringify(cp));
  const kb = await p.evaluate(() => (window.__dd.setMode('survival'), window.__dd.meta().mode));
  check('toggle back to survival works', kb === 'survival');

  // 9. secret: stone-only lava-lake bridge, voided by any death
  const bridge = async (o, die) => o.page.evaluate((die) => {
    const d = window.__dd, L = d.MMChunks.LAKE;
    d.setPick(1, 60); d.inv.stone = 40;
    d.setPos(60.5, -3, 64.5);
    if (die) d.die('test death');
    for (let x = L.x0; x <= L.x1; x++) d.placeAt(x, L.lavaY - 1, 64, 'stone');
    return { secret: d.meta().goals.secret, void: d.meta().goals.secretVoid, deaths: d.meta().goals.deaths };
  }, !!die);
  const B1 = await open(browser, '&seed=5');
  const b1 = await bridge(B1, false);
  const B2 = await open(browser, '&seed=5');
  const b2 = await bridge(B2, true);
  check('a stone-only bridge across the lava lake earns the secret medal', b1.secret === true && b1.deaths === 0, JSON.stringify(b1));
  check('any death voids the lava lake secret', b2.secret === false && b2.void === true && b2.deaths === 1, JSON.stringify(b2));
  const B3 = await open(browser, '&seed=5');
  const b3 = await B3.page.evaluate(() => {
    const d = window.__dd, L = d.MMChunks.LAKE;
    d.setPos(60.5, -3, 64.5); d.inv.stone = 40; d.inv.dirt = 3; d.setPick(1, 60);
    d.placeAt(L.x0, L.lavaY - 1, 64, 'dirt');
    for (let x = L.x0 + 1; x <= L.x1; x++) d.placeAt(x, L.lavaY - 1, 64, 'stone');
    return { secret: d.meta().goals.secret, void: d.meta().goals.secretVoid };
  });
  check('a non-stone block in the lake voids the cobble-only bridge', b3.secret === false && b3.void === true, JSON.stringify(b3));

  // 10. one-time safe copy of the old in-town cave keys
  const town = JSON.stringify({ name: 'Pip', coins: 12, caveSeed: 4242, caveInv: { dirt: 5, coal: 3, iron: 2, gold: 1 }, cavePick: { tier: 1, dur: 33 } });
  const M = await open(browser, '&seed=9', DESKTOP, { fn: (t) => { if (!sessionStorage.getItem('seeded')) { sessionStorage.setItem('seeded', '1'); localStorage.setItem('pixeltown-save-v1', t); } }, arg: town });
  const m1 = await M.page.evaluate(() => { const d = window.__dd; return { inv: Object.assign({}, d.inv), pick: Object.assign({}, d.pick), meta: d.meta(), town: localStorage.getItem('pixeltown-save-v1') }; });
  check('old caveSeed/caveInv/cavePick are copied into the new key', m1.meta.cave && m1.meta.cave.seed === 4242 && m1.meta.cave.inv.coal === 3 && m1.meta.cave.pick.tier === 1 && m1.inv.iron_ore === 2 && m1.inv.gold_ore === 1 && m1.inv.dirt === 5 && m1.pick.tier === 1 && m1.pick.dur === 33, JSON.stringify(m1));
  check('migration stamps migratedFrom and leaves pixeltown-save-v1 byte-identical', m1.meta.migratedFrom === TOWN && m1.town === town);
  await M.page.evaluate(() => window.__dd.flush());
  await reload(M.page); await reload(M.page);
  const m2 = await M.page.evaluate(() => { const d = window.__dd; return { coal: d.inv.coal, dirt: d.inv.dirt, iron_ore: d.inv.iron_ore, town: localStorage.getItem('pixeltown-save-v1') }; });
  check('migration is idempotent (copied once, not on every visit) and the town save is untouched', m2.coal === m1.inv.coal && m2.dirt === 5 && m2.iron_ore === 2 && m2.town === town, JSON.stringify(m2));

  // 11. Glow Slime
  const S = await open(browser, '&seed=5');
  const sl = await S.page.evaluate(() => {
    const d = window.__dd, r = {};
    d.setPick(3, 200);
    for (let wy = 45; wy <= 46; wy++) for (let x = 58; x <= 68; x++) for (let z = 60; z <= 65; z++) d.mineAt(x, wy, z);
    d.inv.stone = 30;
    for (let x = 58; x <= 68; x++) for (let z = 60; z <= 65; z++) if (d.getBlock(x, 47, z) === 0) d.placeAt(x, 47, z, 'stone');
    d.setPos(66.5, -47, 62.5); d.step(1 / 60, 3);
    d.settle();
    r.darkLight = d.cellLight(60.5, -47 + 0.01, 62.5);
    const m = d.spawnSlime(60.5, -47 + 0.01, 62.5);
    r.spawned = !!m;
    const d0 = Math.hypot(d.player.x - m.x, d.player.z - m.z);
    for (let i = 0; i < 150; i++) d.tickMobs(1 / 60);
    r.moved = d0 - Math.hypot(d.player.x - m.x, d.player.z - m.z);
    r.hp = d.player.hp;
    let guard = 0; while (d.player.hp === 10 && guard++ < 2000) d.tickMobs(1 / 60);
    r.hpAfterHit = d.player.hp;
    r.hit1 = d.attackSlime(false); r.hpSlime = m.hp;
    r.hit2 = d.attackSlime(false);
    d.tickMobs(1 / 60);
    r.dead = m.dead; r.left = d.slimes.length; r.drop = d.inv.slime | 0;
    // lit areas: a torch beside the spot, and the sunny surface
    d.inv.torch = 2; d.placeAt(61, 46, 62, 'torch'); d.settle();
    r.litLight = d.cellLight(60.5, -47 + 0.01, 62.5);
    r.litSpawn = d.spawnSlime(60.5, -47 + 0.01, 62.5);
    const s = d.surfaceY(66, 66);
    r.surfaceSpawn = d.spawnSlime(66.5, -s + 0.01, 66.5);
    return r;
  });
  check('Glow Slime spawns in the dark and hops toward the player within 8 blocks', sl.spawned && sl.darkLight < 8 && sl.moved > 1, JSON.stringify(sl));
  check('Glow Slime hits for exactly 1 heart', sl.hp === 10 && sl.hpAfterHit === 9, JSON.stringify(sl));
  check('Glow Slime dies in 2 hits and drops a slime item', sl.hit1 && sl.hpSlime === 1 && sl.hit2 && sl.dead && sl.left === 0 && sl.drop === 1, JSON.stringify(sl));
  check('Glow Slime never spawns at light level 8+ (torchlight or sunlit surface)', sl.litLight >= 8 && sl.litSpawn === null && sl.surfaceSpawn === null, JSON.stringify(sl));

  // 12. corrupt storage loads clean
  const C = await open(browser, '&seed=5', DESKTOP, { fn: () => { try { localStorage.setItem('pixeltown-deepdelve-v1', '{"goals":{"deaths":"x","bronze":5,"maxDepth":1e9,"secret":"yes"},"mode":"fly","cave":{"seed":"zz","inv":7}}'); localStorage.setItem('pixeltown-save-v1', '{nope'); } catch (e) { /* ignore */ } } });
  const cs = await C.page.evaluate(() => { const d = window.__dd; return { meta: d.meta(), s1: JSON.stringify(d.sanitiseMeta('garbage{')), s2: JSON.stringify(d.sanitiseMeta([1, 2])), hud: document.getElementById('hud-hp').textContent }; });
  check('corrupt keys load clean (defaults, no crash)', cs.meta.mode === 'survival' && cs.meta.goals.deaths === 0 && cs.meta.goals.bronze === false && cs.meta.goals.secret === false && cs.meta.goals.maxDepth <= 99 && cs.meta.migratedFrom === '' && cs.s1 === cs.s2 && cs.s1.indexOf('"maxDepth":0') > 0 && cs.hud === 'HP 10/10', JSON.stringify(cs));

  // 13. reduced motion: no camera bob
  const R = await open(browser, '&seed=5', Object.assign({ reducedMotion: 'reduce' }, DESKTOP));
  const rm = await R.page.evaluate(async () => {
    const d = window.__dd; d.step(1 / 60, 120); d.input.fwd = 1;
    const samples = [];
    for (let i = 0; i < 8; i++) { await new Promise((r) => setTimeout(r, 40)); samples.push(Math.abs(d.bob())); }
    d.input.fwd = 0;
    return { reduced: d.reduced, max: Math.max.apply(null, samples) };
  });
  const nb = await p.evaluate(async () => {
    const d = window.__dd; d.setMode('survival'); const s = d.surfaceY(20, 20); d.setPos(20.5, -s, 20.5); d.step(1 / 60, 60); d.input.fwd = 1;
    const samples = [];
    for (let i = 0; i < 12; i++) { await new Promise((r) => setTimeout(r, 40)); samples.push(Math.abs(d.bob())); }
    d.input.fwd = 0;
    return { reduced: d.reduced, max: Math.max.apply(null, samples) };
  });
  check('prefers-reduced-motion removes the camera bob (normal motion bobs)', rm.reduced === true && rm.max === 0 && nb.reduced === false && nb.max > 0, JSON.stringify({ rm, nb }));

  // 14. phone: no horizontal scroll, all controls reachable, panels fit
  const PH = await open(browser, '&seed=5', PHONE);
  await PH.page.evaluate(() => { window.__dd.panel('craft', true); });
  const ph = await PH.page.evaluate(() => {
    const vw = window.innerWidth, out = [];
    ['open-craft', 'open-goals', 'mode-btn', 'craft-btn', 'back-hub', 'back-town', 't-jump', 't-mine', 't-place'].forEach((id) => { if (document.getElementById(id).classList.contains('mm-nav-legacy')) return; const r = document.getElementById(id).getBoundingClientRect(); if (r.right > vw + 1 || r.left < -1 || r.width < 40 || r.height < 40) out.push(id + ':' + Math.round(r.left) + '-' + Math.round(r.right) + 'x' + Math.round(r.height)); });
    const pr = document.getElementById('craft-panel').getBoundingClientRect();
    return { sw: document.documentElement.scrollWidth, iw: vw, bad: out, panelOk: pr.left >= 0 && pr.right <= vw };
  });
  check('390x844: no horizontal scroll and every control fits on screen (>=40px targets)', ph.sw <= ph.iw && ph.bad.length === 0 && ph.panelOk, JSON.stringify(ph));
  await PH.page.click('#close-craft');
  await PH.page.click('#open-goals');
  const gp = await PH.page.evaluate(() => ({ open: !document.getElementById('goals-panel').hidden, secret: document.querySelector('#goal-list li:nth-child(3) strong').textContent }));
  check('goals panel opens by tap and hides the secret as ???', gp.open && /\?\?\?/.test(gp.secret), JSON.stringify(gp));
  await PH.page.click('#close-goals');

  // 15. injected text stays text
  const X = await open(browser, '&seed=' + encodeURIComponent('<img src=x onerror=alert(1)>'));
  const xi = await X.page.evaluate(() => { window.__dd.panel('craft', true); return document.querySelectorAll('img').length; });
  check('no injected markup anywhere (textContent only)', xi === 0);

  // screenshots
  if (process.env.SHOTS) {
    fs.mkdirSync(process.env.SHOTS, { recursive: true });
    const dress = (pg, panel) => pg.evaluate((panel) => {
      const d = window.__dd, L = d.MMChunks.LAKE;
      d.setMode('survival'); d.setPick(1, 44);
      d.inv.stone = 30; d.inv.coal = 5; d.inv.iron_ore = 3; d.inv.wood = 6; d.inv.furnace = 1; d.inv.torch = 6; d.select('stone');
      d.setPos(L.x0 - 3.5, -(L.airY1 + 1), 64.5); d.step(1 / 60, 40);
      d.player.yaw = -Math.PI / 2; d.player.pitch = -0.35;
      d.settle(); d.settle();
      if (panel) d.panel(panel, true);
    }, panel);
    await dress(p, null); await dress(PH.page, 'craft');
    await p.waitForTimeout(500); await PH.page.waitForTimeout(500);
    await p.screenshot({ path: process.env.SHOTS + '/polish-desktop.png' });
    await PH.page.screenshot({ path: process.env.SHOTS + '/polish-phone.png' });
  }

  // no console errors, no off-origin requests except three.js
  const offs = [];
  all.forEach((o) => o.reqs.forEach((u) => { if (!u.startsWith(ORIGIN) && !u.startsWith('data:') && !u.startsWith('blob:') && u !== THREE_URL) offs.push(u); }));
  const errs = [].concat(...all.map((o) => o.errors));
  check('no console errors', errs.length === 0, JSON.stringify(errs));
  check('no off-origin requests except the three.js script', offs.length === 0, JSON.stringify(offs));

  await browser.close();
  done();
})().catch((e) => { console.error(e); process.exitCode = 1; });
