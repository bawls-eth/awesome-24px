// NEXT-SLICES-2 slice X4 (gather + craft panel + saddles) on the Hearthvale Isles page (game/games/isles/), with MMIsleCraft.
// 1 walking over a pack resource node puts it in the archipelago save's `inv`, it grows back after its pack `respawn` seconds, and a
//   kill rolls the creature's DROP_TABLES into `inv`; the Craft panel (DOM, textContent only, targets >= 44 px, Esc closes, phone ok)
//   lists every recipe with have / need counts; 2 a mount whose ride.saddle is set needs that saddle in `inv`; the first load gives one
//   free saddle for the mount you already had (never twice), ?saddles=0 rides bareback, saddle:null mounts ride as before; 3 crafting a
//   raft adds `reef` to `unlock` and a rocket core adds `mars` (the sea chart shows them locked before, open after); inv + unlock survive
//   a reload; pixeltown-save-v1 is never written; 0 DB requests; b31b vinecoil / canopy_glider strips draw from PNG by id.
// Run: BASE=http://localhost:8871/game/index.html NODE_PATH=$(npm root -g) node game/tests/isles-craft.test.js
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');
const { check, done, blockDb } = require('./helpers');
const CREATURES = require('../shared/mm-creatures.js');
const CRAFT = require('../shared/mm-isle-craft.js');
const ORIGIN = (process.env.BASE || 'http://localhost:8440/game/index.html').replace(/\/game\/index\.html.*$/, '');
const PAGE = ORIGIN + '/game/games/isles/index.html';
const TOWN = '{"realm":{"level":3},"name":"Bo"}';
const ARCH = 'pixeltown-archipelago-v1';
const PHONE = { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 };
const DESK = { viewport: { width: 1000, height: 700 } };
const SHOTS = process.env.SHOTS || '';
const tusk = (sp) => JSON.stringify({ v: 1, n: 1, roster: [{ id: 't1', sp: sp || 'tusktop', nm: 'Tuskie', lv: 3, xp: 0, bond: 2, aff: 0, cos: '', isle: 'jungle', d: '2026-11-01' }], party: [], mount: 't1' });
const all = [];

async function open(browser, opts, query, seed) {
  const ctx = await browser.newContext(opts);
  const db = await blockDb(ctx);
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  await page.addInitScript((s) => {
    if (sessionStorage.seeded) return;
    sessionStorage.seeded = '1';
    localStorage.clear();
    Object.keys(s || {}).forEach((k) => localStorage.setItem(k, s[k]));
  }, Object.assign({ 'pixeltown-save-v1': TOWN }, seed || {}));
  await page.goto(PAGE + '?test=1' + (query || ''));
  await ready(page);
  const o = { ctx, page, errors, db }; all.push(o); return o;
}
const ev = (page, fn, arg) => page.evaluate(`(${fn.toString()})(window.__isles, ${JSON.stringify(arg === undefined ? null : arg)})`);
const frames = (page, n) => page.evaluate((k) => new Promise((res) => { let i = 0; const f = () => (++i >= k ? res() : requestAnimationFrame(f)); requestAnimationFrame(f); }), n);
const ready = (page) => page.waitForFunction(() => window.__isles && window.__isles.world, null, { timeout: 15000 });
const shot = async (page, name) => { if (SHOTS) await page.screenshot({ path: path.join(SHOTS, name + '.png') }); };
const panelInfo = (page) => page.evaluate(() => {
  const p = document.getElementById('panel'), r = p.getBoundingClientRect();
  return { open: !p.hidden, title: document.getElementById('panel-title').textContent, rect: { l: r.left, t: r.top, r: r.right, b: r.bottom },
    rows: [...document.querySelectorAll('#panel-body .recipe')].map((d) => ({ id: d.dataset.recipe, need: [...d.querySelectorAll('.rc-need li')].map((l) => ({ item: l.dataset.item, have: +l.dataset.have, need: +l.dataset.need, t: l.textContent })),
      btn: (() => { const b = d.querySelector('button.rc-btn'); const q = b.getBoundingClientRect(); return { w: q.width, h: q.height, dis: b.disabled }; })(), name: d.querySelector('.rc-name').textContent })),
    inv: [...document.querySelectorAll('#craft-inv li')].map((l) => l.textContent), close: document.getElementById('panel-close').getBoundingClientRect().height,
    hscroll: document.documentElement.scrollWidth > innerWidth, focus: document.activeElement && document.activeElement.id };
});

(async () => {
  const browser = await chromium.launch();
  const src = fs.readFileSync(path.join(__dirname, '..', 'games', 'isles', 'isles.js'), 'utf8');
  check('0: the page builds its DOM with textContent only (no innerHTML / insertAdjacentHTML / outerHTML)', !/innerHTML|insertAdjacentHTML|outerHTML/.test(src));
  check('0: the page loads no network module and no firebase', !/firebase|net\.js/i.test(fs.readFileSync(path.join(__dirname, '..', 'games', 'isles', 'index.html'), 'utf8')) && !/firebase/i.test(src));

  // ---- 1a. walk-over gathering + respawn ----
  const G = await open(browser, DESK, '&isle=jungle&seed=7&today=2026-12-01');
  const gp = G.page;
  const walk = await ev(gp, (I) => {
    I.pause(true); I.god(true); I.clearCreatures();
    const ns = I.nodes(), at = {}; ns.forEach((n) => { at[n.x + ',' + n.y] = 1; });
    const spots = {}; I.spots().forEach((p) => { spots[p.x + ',' + p.y] = 1; });
    const n = ns.find((q) => [-3, -2, -1, 0, 1].every((d) => I.walkable(q.x + d, q.y) && !I.heroSolid(q.x + d, q.y) && !I.heroSolid(q.x + d, q.y - 1) && !I.heroSolid(q.x + d, q.y + 1)) && !at[(q.x - 3) + ',' + q.y] && !at[(q.x - 2) + ',' + q.y] && !at[(q.x - 1) + ',' + q.y] && !at[(q.x + 1) + ',' + q.y] && !spots[(q.x - 1) + ',' + q.y]);
    if (!n) return { n: null, count: ns.length };
    const before = I.inv()[n.kind] || 0;
    I.teleport(n.x - 3, n.y); I.step(0, 0, 0.02);
    let k = 0; while (I.hero().tx < n.x && k++ < 200) I.step(1, 0, 1 / 30);
    const a = I.inv()[n.kind] || 0, nodeA = I.nodes().find((q) => q.i === n.i);
    I.step(0, 0, 0.5); I.step(1, 0, 0.01); I.step(-1, 0, 0.01);
    const a2 = I.inv()[n.kind] || 0;
    // walk off, come back: still growing back
    I.teleport(n.x - 2, n.y); I.step(0, 0, 0.02); I.teleport(n.x, n.y); I.step(0, 0, 0.02);
    const b = I.inv()[n.kind] || 0;
    // the pack respawn time later it is back: walk off and over it again
    I.clock.set(Date.now() + (n.respawn + 1) * 1000);
    const nodeB = I.nodes().find((q) => q.i === n.i);
    I.teleport(n.x - 2, n.y); I.step(0, 0, 0.02); k = 0; while (I.hero().tx < n.x && k++ < 200) I.step(1, 0, 1 / 30);
    const c = I.inv()[n.kind] || 0;
    return { n, count: ns.length, before, a, a2, b, c, readyA: nodeA.ready, readyB: nodeB.ready, picked: I.picked(), kinds: [...new Set(ns.map((q) => q.kind))] };
  });
  check('1a: the jungle has walk-over nodes of the pack resource kinds (daily spots excluded) and the IF1 food glints', walk.count > 20 && walk.kinds.every((k) => ['wood', 'vine_rope', 'amber', 'cocoa', 'jungle_berry'].concat(CRAFT.foodNodes('jungle').map((r) => r.id)).indexOf(k) >= 0), JSON.stringify({ count: walk.count, kinds: walk.kinds }));
  check('1a: walking over a node adds 1 to inv and the node is gone', !!walk.n && walk.a === walk.before + 1 && walk.readyA === false && walk.a2 === walk.a, JSON.stringify(walk));
  check('1a: before its respawn time the node gives nothing; after `respawn` s it is back and gives 1 more', walk.b === walk.a && walk.readyB === true && walk.c === walk.a + 1 && walk.picked === 2, JSON.stringify(walk));
  const daily = await ev(gp, (I) => { const s = I.spots()[0]; const b = I.inv()[s.kind] || 0; I.teleport(s.x, s.y); const r = I.gather(); return { ok: r.ok, kind: s.kind, b, a: I.inv()[s.kind] || 0 }; });
  check('1a: a daily gather spot (G) also puts its find in inv', daily.ok && daily.a === daily.b + 1, JSON.stringify(daily));
  await frames(gp, 4);
  await shot(gp, 'x4-gather-desktop');

  // ---- 1b. creature drops roll DROP_TABLES into inv ----
  const D = await open(browser, DESK, '&isle=jungle&seed=7&tame=0');
  const dr = await ev(D.page, (I) => {
    I.pause(true); I.god(true); I.clearCreatures();
    const t = I.findTile('jungle_floor', 8); I.teleport(t.x, t.y);
    const inv0 = I.inv(); const res = [];
    for (let r = 0; r < 3; r++) {
      const u = I.spawn('vinecoil', t.x + 3, t.y);
      let k = 0; while (I.creatures().some((c) => c.uid === u) && k++ < 200) { I.fire(0, 0); I.step(0, 0, 0.26); }
      res.push(!I.creatures().some((c) => c.uid === u));
    }
    return { killed: res, drops: I.drops(), inv0, inv: I.inv(), stats: I.stats() };
  });
  const JL = CREATURES.dropTable('jungle_loot');
  const okRow = (d) => { const row = JL.find((r) => r[0] === d.item); return row && d.n >= row[1] && d.n <= row[2]; };
  const gained = dr.drops.reduce((m, d) => { m[d.item] = (m[d.item] || 0) + d.added; return m; }, {});
  check('1b: each kill rolls the creature\'s DROP_TABLES (vinecoil: jungle_loot rows, counts in [min, max])', dr.killed.every(Boolean) && dr.drops.length === 3 && dr.drops.every((d) => d.sp === 'vinecoil' && okRow(d)), JSON.stringify(dr.drops));
  check('1b: the drops are added to inv', Object.keys(gained).every((k) => (dr.inv[k] || 0) === (dr.inv0[k] || 0) + gained[k]) && Object.keys(gained).length > 0, JSON.stringify({ inv0: dr.inv0, inv: dr.inv, gained }));
  const dr2 = await (async () => { const D2 = await open(browser, DESK, '&isle=jungle&seed=7&tame=0'); return ev(D2.page, (I) => { I.pause(true); I.god(true); I.clearCreatures(); const t = I.findTile('jungle_floor', 8); I.teleport(t.x, t.y);
    for (let r = 0; r < 3; r++) { const u = I.spawn('vinecoil', t.x + 3, t.y); let k = 0; while (I.creatures().some((c) => c.uid === u) && k++ < 200) { I.fire(0, 0); I.step(0, 0, 0.26); } } return I.drops(); }); })();
  check('1b: drops are seeded (same seed, same kills, same drops)', JSON.stringify(dr2) === JSON.stringify(dr.drops), JSON.stringify(dr2));

  // ---- 1c. the craft panel (desktop) ----
  await ev(gp, (I) => { I.give('wood', 4); I.give('vine_rope', 1); });
  await gp.click('#btn-craft');
  const cp = await panelInfo(gp);
  const inv = await ev(gp, (I) => I.inv());
  const raft = cp.rows.find((r) => r.id === 'raft');
  // XW1: the panel lists every MMIsleCraft recipe (ALL_IDS: the 16 X2 recipes plus the XD1 alternatives, supplies and trophies)
  check('1c: Craft opens a panel titled Craft that lists all ' + CRAFT.ALL_IDS.length + ' recipes (MMIsleCraft.ALL_IDS)', cp.open && cp.title === 'Craft' && cp.rows.length === CRAFT.ALL_IDS.length &&
    CRAFT.ALL_IDS.every((id) => cp.rows.some((r) => r.id === id)), JSON.stringify(cp.rows.map((r) => r.id)));
  const groups = await gp.evaluate(() => { const o = {}; let cur = ''; [...document.querySelectorAll('#panel-body > h3, #panel-body > .recipe')].forEach((n) => { if (n.tagName === 'H3') { cur = n.textContent; o[cur] = []; } else if (o[cur]) o[cur].push(n.dataset.recipe); }); return o; });
  check('1c: XW1 groups: Travel holds both rocket core builds and the raft, Trophies holds the 4 trophies, Supplies the rest',
    JSON.stringify(groups.Travel) === JSON.stringify(['raft', 'rocket_core', 'rocket_core_drift']) && JSON.stringify(groups.Trophies) === JSON.stringify(['trophy_tyrant', 'trophy_hydra', 'trophy_dragon', 'trophy_titan']) &&
    groups.Supplies.indexOf('o2_tank_kelp') >= 0 && groups.Supplies.indexOf('heat_pack') >= 0 && groups.Saddles.length === 10, JSON.stringify(groups));
  const drift = cp.rows.find((r) => r.id === 'rocket_core_drift');
  check('1c: the drift build row names its build and its inputs (driftwood, frost crystal, amber, pearl)', drift && /^Rocket core \(drift build\)/.test(drift.name) && drift.need.map((n) => n.item).join() === 'driftwood,frost_crystal,amber,pearl', JSON.stringify(drift));
  check('1c: each recipe shows have / need per input from inv (raft: wood 4/4 ok, vine rope n/2 short)', cp.rows.every((r) => r.need.length >= 2 && r.need.every((n) => n.have === (inv[n.item] || 0) && new RegExp(n.have + '/' + n.need + '$').test(n.t))) &&
    raft && raft.need.find((n) => n.item === 'wood').t === 'wood ' + inv.wood + '/4' && raft.btn.dis === (inv.vine_rope < 2), JSON.stringify(raft));
  check('1c: every Craft button and Close are >= 44 px', cp.rows.every((r) => r.btn.w >= 44 && r.btn.h >= 44) && cp.close >= 44, JSON.stringify(cp.rows.map((r) => r.btn)));
  check('1c: the pack list shows inv', cp.inv.some((t) => /^wood x\d+$/.test(t)), JSON.stringify(cp.inv));
  await shot(gp, 'x4-craft-desktop');
  await gp.keyboard.press('Escape');
  check('1c: Esc closes the craft panel', await gp.evaluate(() => document.getElementById('panel').hidden));
  await gp.keyboard.press('KeyK');
  const kOpen = await gp.evaluate(() => !document.getElementById('panel').hidden && document.getElementById('panel-title').textContent === 'Craft');
  await gp.keyboard.press('Escape');
  check('1c: K opens it too', kOpen);
  check('1: no console errors and 0 DB requests while gathering, fighting and crafting', G.errors.length === 0 && D.errors.length === 0 && G.db.count() === 0 && D.db.count() === 0, G.errors.concat(D.errors).join(' | '));

  // ---- 1d. phone ----
  const P = await open(browser, PHONE, '&isle=jungle&seed=7');
  await ev(P.page, (I) => { I.pause(true); I.god(true); I.clearCreatures(); const ns = I.nodes(); const n = ns.find((q) => ns.filter((o) => Math.abs(o.x - q.x) < 6 && Math.abs(o.y - q.y) < 10).length >= 3) || ns[0]; I.teleport(n.x - 2, n.y + 1); I.render(); I.give('hide', 2); I.give('vine_rope', 2); I.give('amber', 1); });
  await frames(P.page, 6);
  await shot(P.page, 'x4-gather-phone');
  const craftBtn = await P.page.locator('#btn-craft').boundingBox();
  await P.page.tap('#btn-craft');
  const pp = await panelInfo(P.page);
  check('1d: phone 390x844: Craft button >= 44 px, panel inside the viewport, no horizontal scroll', craftBtn && craftBtn.height >= 44 && craftBtn.width >= 44 && pp.open && pp.rect.l >= 0 && pp.rect.r <= 390 && pp.rect.t >= 0 && pp.rect.b <= 844 && !pp.hscroll, JSON.stringify({ craftBtn, rect: pp.rect }));
  check('1d: phone: recipe buttons >= 44 px and the Tusktop saddle is craftable', pp.rows.every((r) => r.btn.w >= 44 && r.btn.h >= 44) && pp.rows.find((r) => r.id === 'saddle_tusktop').btn.dis === false, JSON.stringify(pp.rows.find((r) => r.id === 'saddle_tusktop')));
  await shot(P.page, 'x4-craft-phone');
  await P.page.tap('#panel-body button.rc-btn[data-recipe="saddle_tusktop"]');
  const pinv = await ev(P.page, (I) => I.inv());
  check('1d: phone: tapping Craft makes the saddle and spends its inputs', pinv.saddle_tusktop === 1 && !pinv.hide && !pinv.amber && !pinv.vine_rope, JSON.stringify(pinv));
  await P.page.tap('#panel-close');
  check('1d: phone: Close shuts the panel, 0 errors, 0 DB requests', await P.page.evaluate(() => document.getElementById('panel').hidden) && P.errors.length === 0 && P.db.count() === 0, P.errors.join(' | '));

  // ---- 2. saddles ----
  const S1 = await open(browser, DESK, '&isle=jungle&seed=7', { 'pixeltown-tames-v1': tusk() });
  const s1 = await ev(S1.page, (I) => { I.pause(true); I.god(true); I.clearCreatures(); const t = I.findTile(null, 6); I.teleport(t.x, t.y); return { sad: I.saddles(), inv: I.inv(), on: I.ride(), riding: !!I.riding(), m: I.meters().saddle }; });
  check('2a: grandfathering: an existing tames.mount (Tusktop) gets one free saddle_tusktop and rides', s1.sad.gift === 'saddle_tusktop' && s1.sad.sg && s1.inv.saddle_tusktop === 1 && s1.on === true && s1.riding && s1.m === 'fitted', JSON.stringify(s1));
  await S1.page.reload(); await ready(S1.page);
  const s1b = await ev(S1.page, (I) => ({ sad: I.saddles(), inv: I.inv(), save: JSON.parse(localStorage.getItem('pixeltown-archipelago-v1')) }));
  check('2a: the gift is given once (a reload gives no second saddle; sg:1 is saved)', s1b.sad.gift === null && s1b.inv.saddle_tusktop === 1 && s1b.save.sg === 1, JSON.stringify(s1b));
  const S2 = await open(browser, DESK, '&isle=jungle&seed=7', { 'pixeltown-tames-v1': tusk(), [ARCH]: JSON.stringify({ v: 1, sg: 1 }) });
  const s2 = await ev(S2.page, (I) => { I.pause(true); I.god(true); I.clearCreatures(); const t = I.findTile(null, 6); I.teleport(t.x, t.y);
    const off = I.ride(); const r0 = !!I.riding(); const toast = document.getElementById('toast').textContent; I.give('saddle_tusktop', 1); const on = I.ride(); return { off, r0, on, riding: !!I.riding(), inv: I.inv(), toast }; });
  check('2b: a Tusktop (ride.saddle set) without the saddle in inv does not mount, with a calm hint', s2.off === false && s2.r0 === false && /saddle/i.test(s2.toast), JSON.stringify(s2));
  check('2b: with saddle_tusktop in inv it mounts (the saddle is kept)', s2.on === true && s2.riding && s2.inv.saddle_tusktop === 1, JSON.stringify(s2));
  const S3 = await open(browser, DESK, '&isle=jungle&seed=7&saddles=0', { 'pixeltown-tames-v1': tusk(), [ARCH]: JSON.stringify({ v: 1, sg: 1 }) });
  const s3 = await ev(S3.page, (I) => { I.pause(true); I.god(true); I.clearCreatures(); const t = I.findTile(null, 6); I.teleport(t.x, t.y); return { on: I.ride(), flags: I.flags(), inv: I.inv(), m: I.meters().saddle }; });
  check('2c: ?saddles=0 restores free riding (no saddle needed)', s3.on === true && s3.flags.saddles === false && !s3.inv.saddle_tusktop, JSON.stringify(s3));
  const S4 = await open(browser, DESK, '&isle=jungle&seed=7&saddles=0', { 'pixeltown-tames-v1': tusk() });
  const s4 = await ev(S4.page, (I) => ({ sad: I.saddles(), inv: I.inv(), raw: JSON.parse(localStorage.getItem('pixeltown-archipelago-v1') || '{}') }));
  check('2c: ?saddles=0 does not use up the one-time gift', s4.sad.gift === null && !s4.sad.sg && !s4.inv.saddle_tusktop && s4.raw.sg !== 1, JSON.stringify(s4));
  const S5 = await open(browser, DESK, '&isle=jungle&seed=7', { 'pixeltown-tames-v1': tusk('meadow_strider'), [ARCH]: JSON.stringify({ v: 1, sg: 1 }) });
  const s5 = await ev(S5.page, (I) => { I.pause(true); I.god(true); I.clearCreatures(); const t = I.findTile(null, 6); I.teleport(t.x, t.y); return { on: I.ride(), m: I.meters().saddle, inv: I.inv() }; });
  check('2d: a saddle:null mount (Meadow Strider) rides as before', s5.on === true && s5.m === 'not needed' && Object.keys(s5.inv).length === 0, JSON.stringify(s5));
  check('2: no console errors and 0 DB requests in the saddle runs', [S1, S2, S3, S4, S5].every((o) => o.errors.length === 0 && o.db.count() === 0), [S1, S2, S3, S4, S5].map((o) => o.errors.join(' | ')).join(' / '));

  // ---- 3. raft -> reef, rocket core -> mars, persistence ----
  const U = await open(browser, DESK, '&isle=jungle&seed=123');
  const up = U.page;
  await ev(up, (I) => { I.pause(true); I.god(true); I.clearCreatures(); const d = I.dock(); I.teleport(d.x, d.y); });
  await up.click('#btn-sail');
  const chart0 = await up.evaluate(() => [...document.querySelectorAll('#panel-body button.dest')].map((b) => ({ isle: b.dataset.isle, dis: b.disabled, t: b.textContent, h: b.getBoundingClientRect().height })));
  const lock0 = await ev(up, (I) => ({ reef: I.isleOpen('reef'), mars: I.isleOpen('mars'), ice: I.isleOpen('ice'), home: I.isleOpen('home'), tr: I.travel('reef'), unlock: I.unlock() }));
  check('3a: a fresh sea chart: home and tundra open, reef and mars locked with their cost shown', chart0.length === 4 && chart0.find((c) => c.isle === 'reef').dis && /raft/.test(chart0.find((c) => c.isle === 'reef').t) &&
    chart0.find((c) => c.isle === 'mars').dis && /rocket core/.test(chart0.find((c) => c.isle === 'mars').t) && !chart0.find((c) => c.isle === 'ice').dis && !chart0.find((c) => c.isle === 'home').dis && chart0.every((c) => c.h >= 44) &&
    !lock0.reef && !lock0.mars && lock0.ice && lock0.home && lock0.tr === false && JSON.stringify(lock0.unlock) === '["jungle"]', JSON.stringify({ chart0, lock0 }));
  await shot(up, 'x4-chart-locked');
  await up.keyboard.press('Escape');
  await ev(up, (I) => { I.give('wood', 4); I.give('vine_rope', 2); });
  await up.click('#btn-craft');
  await up.click('#panel-body button.rc-btn[data-recipe="raft"]');
  const r1 = await ev(up, (I) => ({ unlock: I.unlock(), inv: I.inv(), open: I.isleOpen('reef') }));
  const raftRow = await panelInfo(up);
  check('3b: crafting a raft (panel button) adds reef to unlock and spends wood 4 + vine rope 2', r1.unlock.indexOf('reef') >= 0 && r1.open && r1.inv.raft === 1 && !r1.inv.wood && !r1.inv.vine_rope &&
    /have 1/.test(raftRow.rows.find((r) => r.id === 'raft').name), JSON.stringify({ r1, raft: raftRow.rows.find((r) => r.id === 'raft') }));
  const noMars = await ev(up, (I) => I.craft('rocket_core'));
  await ev(up, (I) => { I.give('iron', 4); I.give('frost_crystal', 2); I.give('amber', 2); });
  await frames(up, 15); // the open panel refreshes from the pack change (a few Hz, not per frame)
  const rcBtn = await up.evaluate(() => document.querySelector('#panel-body button.rc-btn[data-recipe="rocket_core"]').disabled);
  await up.click('#panel-body button.rc-btn[data-recipe="rocket_core"]');
  const r2 = await ev(up, (I) => ({ unlock: I.unlock(), inv: I.inv() }));
  check('3b: a rocket core needs its inputs (nothing changes without them)', noMars.ok === false && noMars.missing.length === 3, JSON.stringify(noMars));
  check('3b: crafting a rocket core adds mars to unlock', rcBtn === false && r2.unlock.indexOf('mars') >= 0 && r2.inv.rocket_core === 1 && !r2.inv.iron, JSON.stringify(r2));
  await up.keyboard.press('Escape');
  await up.reload(); await ready(up);
  await ev(up, (I) => { I.pause(true); I.god(true); I.clearCreatures(); const d = I.dock(); I.teleport(d.x, d.y); });
  const after = await ev(up, (I) => ({ unlock: I.unlock(), inv: I.inv(), save: JSON.parse(localStorage.getItem('pixeltown-archipelago-v1')) }));
  await frames(up, 4);
  await up.click('#btn-sail');
  const chart1 = await up.evaluate(() => [...document.querySelectorAll('#panel-body button.dest')].map((b) => ({ isle: b.dataset.isle, dis: b.disabled })));
  check('3c: inv and unlock survive a reload (raft, rocket core; reef + mars unlocked in the saved key)', after.inv.raft === 1 && after.inv.rocket_core === 1 && after.unlock.indexOf('reef') >= 0 && after.unlock.indexOf('mars') >= 0 &&
    after.save.inv.raft === 1 && after.save.unlock.indexOf('mars') >= 0, JSON.stringify(after.save.inv) + JSON.stringify(after.save.unlock));
  check('3c: after the reload the sea chart offers reef and mars', chart1.length === 4 && chart1.every((c) => !c.dis), JSON.stringify(chart1));
  await Promise.all([up.waitForNavigation(), up.click('#panel-body button[data-isle="reef"]')]);
  await ready(up);
  check('3c: sailing to the unlocked reef works', (await ev(up, (I) => I.isle)) === 'reef');
  const towns = await Promise.all(all.map((o) => o.page.evaluate(() => localStorage.getItem('pixeltown-save-v1')).catch(() => TOWN)));
  check('3d: pixeltown-save-v1 is never written by the isles page', towns.every((t) => t === TOWN), JSON.stringify(towns));
  check('3d: 0 DB requests and no console errors overall', all.every((o) => o.db.count() === 0 && o.errors.length === 0), all.map((o) => o.errors.join(' | ')).filter(Boolean).join(' / '));

  // ---- 5. XW1: alternative recipes unlock by their output item, the sea chart's Craft it, bonus finds ----
  const V = await open(browser, DESK, '&isle=jungle&seed=123');
  const vp = V.page;
  const alt = await ev(vp, (I) => {
    I.pause(true); I.god(true); I.clearCreatures();
    I.give('driftwood', 3); I.give('frost_crystal', 2); I.give('amber', 2); I.give('pearl', 1);
    const c = I.craft('rocket_core_drift');
    I.give('kelp', 3); I.give('shell', 2); I.give('ice', 2);
    const o = I.craft('o2_tank_kelp');
    return { c, o, inv: I.inv(), unlock: I.unlock(), mars: I.isleOpen('mars') };
  });
  check('5a: rocket_core_drift makes a rocket core (not a "rocket_core_drift" item) and opens mars', alt.c.ok && alt.c.item === 'rocket_core' && alt.c.unlocked === 'mars' && alt.inv.rocket_core === 1 && !alt.inv.rocket_core_drift && alt.mars && alt.unlock.indexOf('mars') >= 0, JSON.stringify(alt));
  check('5a: o2_tank_kelp makes an O2 tank and opens nothing', alt.o.ok && alt.o.item === 'o2_tank' && alt.o.unlocked === '' && alt.inv.o2_tank === 1, JSON.stringify(alt.o));
  const toastAlt = await vp.evaluate(() => document.getElementById('toast').textContent);
  check('5a: the toast names the item (O2 tank)', /o2 tank/i.test(toastAlt), toastAlt);
  const W2 = await open(browser, DESK, '&isle=reef&seed=123&at=dock');
  await ev(W2.page, (I) => { I.pause(true); I.god(true); I.clearCreatures(); const d = I.dock(); I.teleport(d.x, d.y); });
  await W2.page.click('#btn-sail');
  const ci = await W2.page.evaluate(() => { const b = document.querySelector('#panel-body button.craft-it[data-isle="mars"]'); const c = document.querySelector('#panel-body .dest-cost[data-isle="mars"]'); return b ? { need: b.dataset.need, recipe: b.dataset.recipe, cost: c && c.textContent } : null; });
  check('5b: the locked Mars row\'s Craft it targets the reachable drift build (not the iron build), its cost lists the drift inputs', ci && ci.need === 'rocket_core' && ci.recipe === 'rocket_core_drift' && /driftwood/.test(ci.cost) && !/iron/.test(ci.cost), JSON.stringify(ci));
  await W2.page.click('#panel-body button.craft-it[data-isle="mars"]');
  const want = await W2.page.evaluate(() => { const r = document.querySelector('#panel-body .recipe.want'); return r && r.dataset.recipe; });
  check('5b: tapping it opens the craft panel at rocket_core_drift', want === 'rocket_core_drift', String(want));
  // bonus finds: each daily spot rolls one seeded MMRng draw (island | day | spot) through MMIsleCraft.bonusFind
  const bf = async () => { const B = await open(browser, DESK, '&isle=home&seed=7&today=2026-12-03'); return ev(B.page, (I) => { I.pause(true); I.god(true); I.clearCreatures(); const out = [];
    I.spots().forEach((s) => { const inv0 = I.inv(); I.teleport(s.x, s.y); const r = I.gather(); const inv1 = I.inv(); out.push({ idx: s.idx, ok: r.ok, kind: r.kind, find: r.find || '', inv0, inv1 }); }); return out; }); };
  const b1 = await bf(), b2 = await bf();
  const FIND = ['feather', 'honey', 'wool', 'driftwood', 'salt'];
  check('5c: a daily gather sometimes brings a bonus find from the pack FINDS table, added to the pack', b1.length > 0 && b1.every((r) => r.ok) && b1.some((r) => r.find) &&
    b1.every((r) => !r.find || (FIND.indexOf(r.find) >= 0 && (r.inv1[r.find] || 0) === (r.inv0[r.find] || 0) + 1 + (r.find === r.kind ? 1 : 0))), JSON.stringify(b1.map((r) => [r.idx, r.kind, r.find])));
  check('5c: the bonus finds are seeded (same island, day and spots -> the same finds)', JSON.stringify(b1.map((r) => r.find)) === JSON.stringify(b2.map((r) => r.find)), JSON.stringify(b2.map((r) => r.find)));
  check('5: 0 DB requests and no console errors', [V, W2].every((o) => o.db.count() === 0 && o.errors.length === 0), [V, W2].map((o) => o.errors.join(' | ')).join(' / '));

  // ---- 4. b31b strips: vinecoil + canopy_glider by id, code fallback with ?art=0 ----
  const A = await open(browser, DESK, '&seed=7');
  const art = await ev(A.page, (I) => Promise.resolve(I.stripsReady()).then((r) => {
    I.pause(true); I.god(true); I.clearCreatures(); const t = I.findTile('jungle_floor', 10); I.teleport(t.x, t.y);
    const a = I.spawn('vinecoil', t.x + 3, t.y), b = I.spawn('canopy_glider', t.x - 3, t.y); I.step(0, 0, 0.05); I.render();
    const cs = I.creatures(); const va = cs.find((c) => c.uid === a), cg = cs.find((c) => c.uid === b);
    return { kinds: r.kinds, v: va && va.src, vd: va && va.drawn, g: cg && cg.src, gd: cg && cg.drawn };
  }));
  check('4: b31b vinecoil and canopy_glider load and draw from their PNG strips', art.kinds.indexOf('vinecoil') >= 0 && art.kinds.indexOf('canopy_glider') >= 0 && art.v === 'png' && /^vinecoil_(idle|move|attack)_/.test(art.vd) && art.g === 'png' && /^canopy_glider_/.test(art.gd), JSON.stringify(art));
  const Z = await open(browser, DESK, '&seed=7&art=0');
  const za = await ev(Z.page, (I) => { I.pause(true); I.clearCreatures(); const t = I.findTile('jungle_floor', 10); I.teleport(t.x, t.y); const a = I.spawn('vinecoil', t.x + 3, t.y); I.step(0, 0, 0.05); I.render(); return I.creatures().find((c) => c.uid === a).src; });
  check('4: ?art=0 draws the vinecoil from code, 0 errors', za === 'code' && A.errors.length === 0 && Z.errors.length === 0, za + A.errors.join(' | '));

  for (const o of all) await o.ctx.close().catch(() => {});
  await browser.close();
  done();
})().catch((e) => { console.error(e); process.exit(1); });
