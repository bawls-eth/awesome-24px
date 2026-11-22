// NEXT-SLICES-2 X7 acceptance (BIOME-ARCH-PLAN B10) on the Hearthvale Isles page, at 1280x720 and 390x844:
// 1 a home -> jungle -> home -> jungle -> home trip through the dock, the sea chart and the Home dock button keeps HP, the party and
//   the jungle position and fog (pixeltown-archipelago-v1, additive `hp`); locked isles show their unlock cost on the sea chart;
// 2 home build: decor is made from the pack in the Home decor panel (MMHomeBuild), a fence and a pen survive a reload, undo works within
//   10 s and not after; no Town build code (net.placeBlock) anywhere on the page; 3 the tame pen shows resting tames by name;
// 4 the X5 environment meters are live on the tundra (warmth) and mars (air); 5 the first real tame writes `tame1` and the Hub card shows it;
// 6 blockDb sees 0 requests, nothing offsite, pixeltown-save-v1 never changes, the console stays clean.
// Screenshots (home island + sea chart, desktop + phone) go to $SHOTS when set. IF1: the trip runs with ?rest=0 (kept through every sail):
// docks became rest spots that heal to full, and this test is about HP riding along unchanged (tests/isles-ftue-fixes.test.js covers rest).
// Run: BASE=http://localhost:9031/game/index.html NODE_PATH=$(npm root -g) node game/tests/archipelago-home-travel.test.js
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');
const { check, done, blockDb } = require('./helpers');
const TAMES = require('../shared/mm-tames.js');
const ORIGIN = (process.env.BASE || 'http://localhost:8440/game/index.html').replace(/\/game\/index\.html.*$/, '');
const PAGE = ORIGIN + '/game/games/isles/index.html';
const HUB = ORIGIN + '/game/hub/index.html';
const SHOTS = process.env.SHOTS || '';
const TOWN = '{"realm":{"level":3},"name":"Bo"}';
const PHONE = { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true };
const DESK = { viewport: { width: 1280, height: 720 } };
const all = [];

async function open(browser, opts, query, seed, url) {
  const ctx = await browser.newContext(opts);
  const db = await blockDb(ctx);
  const page = await ctx.newPage();
  const errors = []; const offsite = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  page.on('request', (r) => { const u = r.url(); if (!u.startsWith(ORIGIN + '/') && !u.startsWith('data:')) offsite.push(u); });
  await page.addInitScript((s) => {
    if (sessionStorage.seeded) return;
    sessionStorage.seeded = '1';
    localStorage.clear();
    Object.keys(s || {}).forEach((k) => localStorage.setItem(k, s[k]));
  }, Object.assign({ 'pixeltown-save-v1': TOWN }, seed || {}));
  await page.goto(url || (PAGE + '?test=1' + (query || '')));
  if (!url) await ready(page);
  const o = { ctx, page, errors, offsite, db }; all.push(o); return o;
}
const ev = (page, fn, arg) => page.evaluate(`(${fn.toString()})(window.__isles, ${JSON.stringify(arg === undefined ? null : arg)})`);
const frames = (page, n) => page.evaluate((k) => new Promise((res) => { let i = 0; const f = () => (++i >= k ? res() : requestAnimationFrame(f)); requestAnimationFrame(f); }), n);
const ready = (page) => page.waitForFunction(() => window.__isles && window.__isles.world, null, { timeout: 15000 });
const shot = async (page, name) => { if (SHOTS) { fs.mkdirSync(SHOTS, { recursive: true }); await page.screenshot({ path: path.join(SHOTS, name + '.png') }); } };
// tap on the phone, click on the desktop
const press = (o, phone, sel) => (phone ? o.page.tap(sel) : o.page.click(sel));
async function sailVia(o, phone, sel) {
  await Promise.all([o.page.waitForNavigation(), press(o, phone, sel)]);
  await ready(o.page);
  await frames(o.page, 6);
}
// stand on the dock, let the HUD show Sail, open the sea chart with the button
async function toDock(o, phone) {
  await ev(o.page, (I) => { const d = I.dock(); I.teleport(d.x, d.y); });
  await frames(o.page, 12);
  await press(o, phone, '#btn-sail');
  await o.page.waitForFunction(() => !document.getElementById('panel').hidden && document.getElementById('panel-title').textContent === 'Sea chart');
}
const state = (o) => ev(o.page, (I) => ({ isle: I.isle, pack: I.world.pack, hp: I.hp(), party: I.party().map((p) => p.id).sort(), h: I.hero(), fog: I.stats().fog, near: I.nearDock(), url: location.search, seed: I.seed }));

// a real first tame (soothe shots -> KO -> feed), as in isles-taming.test.js
const KO_AND_TAME = (I, a) => {
  const h = I.hero();
  const uid = I.spawn(a.sp, h.tx + 3, h.ty);
  const get = () => I.creatures().find((c) => c.uid === uid) || null;
  I.soothe(true);
  for (let i = 0; i < 80 && get() && !get().ko; i++) { const c = get(), hh = I.hero(); I.fire(c.x - hh.x, c.y - 8 - hh.y); I.step(0, 0, 0.3); }
  if (!get() || !get().ko) return { tamed: false };
  I.soothe(false); I.nextTo(uid, -30);
  for (let i = 0; i < 20; i++) { const r = I.feed(); if (r.tamed) return { tamed: true }; I.step(0, 0, 6.2); I.nextTo(uid, -30); }
  return { tamed: false };
};

(async () => {
  const browser = await chromium.launch();
  const read = (f) => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
  const pageSrc = ['games/isles/isles.js', 'games/isles/index.html', 'shared/mm-home-build.js', 'shared/mm-homestead.js', 'shared/mm-isles.js'].map(read).join('\n');
  check('2: no Town build code on the isles page (no net.placeBlock, no blocks ref, no firebase / net.js)', !/placeBlock|ref\(\s*['"]blocks|firebase|net\.js/i.test(pageSrc.replace(/\/\/.*$/gm, '').replace(/<!--[\s\S]*?-->/g, '')));
  check('2: the page loads mm-home-build.js', /shared\/mm-home-build\.js/.test(read('games/isles/index.html')));

  // stable: Chomp travels in the party, Fern rests at home
  const tm = TAMES.defaults();
  const chomp = TAMES.add(tm, { sp: 'chompbill', nm: 'Chomp', isle: 'jungle', d: '2026-11-01' });
  const fern = TAMES.add(tm, { sp: 'fernraptor', nm: 'Fern', isle: 'jungle', d: '2026-11-02' });
  tm.party = [chomp.id];
  const SEED = { 'pixeltown-tames-v1': JSON.stringify(tm), 'pixeltown-archipelago-v1': JSON.stringify({ v: 1, isles: { jungle: { seed: '123' } } }) };

  for (const [label, opts, phone] of [['1280x720', DESK, false], ['390x844', PHONE, true]]) {
    const L = (s) => s + ' (' + label + ')';
    const o = await open(browser, opts, '&isle=meadow&today=2026-12-01&rest=0', SEED); // IF1: ?rest=0 (docks are rest spots that heal; this trip checks the HP carry)
    const pg = o.page;
    await frames(pg, 10);
    // ---- 1. home -> jungle (dock + sea chart) ----
    const hurt = await ev(pg, (I) => { I.clearCreatures(); I.god(false); const hp = I.hurt(5); I.god(true); return { hp, max: I.hp().maxHp, party: I.party().map((p) => p.id) }; });
    check(L('1: the hero starts the trip hurt (HP below max) with Chomp in the party'), hurt.hp === hurt.max - 5 && JSON.stringify(hurt.party) === JSON.stringify([chomp.id]), JSON.stringify(hurt));
    await toDock(o, phone);
    const chart = await pg.evaluate(() => ({
      open: [...document.querySelectorAll('#panel-body button.dest:not(.locked)')].map((b) => b.dataset.isle).sort(),
      locked: [...document.querySelectorAll('#panel-body button.dest.locked')].map((b) => ({ isle: b.dataset.isle, t: b.textContent, aria: b.getAttribute('aria-label'), dis: b.disabled })),
      cost: [...document.querySelectorAll('#panel-body .dest-cost')].map((p) => ({ isle: p.dataset.isle, need: p.dataset.need, t: p.textContent, vis: p.getBoundingClientRect().height > 0 })),
      hscroll: document.documentElement.scrollWidth > innerWidth, panelRight: document.getElementById('panel').getBoundingClientRect().right }));
    check(L('1: the sea chart from home opens the jungle and the tundra'), JSON.stringify(chart.open) === JSON.stringify(['ice', 'jungle']), JSON.stringify(chart.open));
    const reefC = chart.cost.find((c) => c.isle === 'reef'), marsC = chart.cost.find((c) => c.isle === 'mars');
    // XW1: the mars cost is the build a fresh save can reach (rocket_core_drift), not the iron build that needs mars iron
    check(L('1: locked isles show their unlock cost (reef: 1 raft = wood 0/4, vine rope 0/2; mars: 1 rocket core = driftwood 0/3, frost crystal 0/2, amber 0/2, pearl 0/1)'),
      chart.locked.length === 2 && chart.locked.every((b) => b.dis && /Unlock cost/.test(b.aria)) && reefC && reefC.vis && reefC.need === 'raft' && reefC.t === 'Unlock cost: 1 raft = wood 0/4, vine rope 0/2' &&
      marsC && marsC.vis && marsC.t === 'Unlock cost: 1 rocket core = driftwood 0/3, frost crystal 0/2, amber 0/2, pearl 0/1', JSON.stringify(chart));
    check(L('1: the sea chart fits the screen (no sideways scroll)'), !chart.hscroll && chart.panelRight <= opts.viewport.width, JSON.stringify(chart));
    await shot(pg, 'x7-sea-chart-' + label);
    await sailVia(o, phone, '#panel-body button.dest[data-isle="jungle"]');
    const j1 = await state(o);
    check(L('1: sailing lands on the jungle dock (seed 123) with the same HP and party'), j1.pack === 'jungle' && j1.seed === '123' && j1.near && j1.hp.hp === hurt.hp && JSON.stringify(j1.party) === JSON.stringify([chomp.id]), JSON.stringify(j1));
    // walk off inland, reveal some fog, then fast-travel home from there
    const inland = await ev(pg, (I) => { I.god(true); I.clearCreatures(); const s = I.world.spawnPoint, d = I.dock(); I.teleport(s.x, s.y); return { s, d, dist: Math.hypot(s.x - d.x, s.y - d.y) }; });
    await frames(pg, 10);
    const j1b = await state(o);
    check(L('1: the inland spot is well away from the dock and reveals more fog'), inland.dist > 6 && j1b.fog > j1.fog, JSON.stringify({ inland, f0: j1.fog, f1: j1b.fog }));
    await sailVia(o, phone, '#btn-home');
    const h1 = await state(o);
    const sv1 = await ev(pg, (I) => I.save());
    check(L('1: the Home dock button lands at the home dock with the same HP and party'), h1.isle === 'home' && h1.near && h1.hp.hp === hurt.hp && JSON.stringify(h1.party) === JSON.stringify([chomp.id]), JSON.stringify(h1));
    check(L('1: the save keeps the jungle position (inland tile), its fog and the HP (additive hp key)'), sv1.isles.jungle.seed === '123' && Math.floor(sv1.isles.jungle.pos.x) === inland.s.x && Math.floor(sv1.isles.jungle.pos.y) === inland.s.y &&
      sv1.isles.jungle.fog.length > 0 && sv1.hp === hurt.hp, JSON.stringify({ j: sv1.isles.jungle.pos, hp: sv1.hp }));
    // home -> jungle again: picks up at the inland spot with the same fog
    await toDock(o, phone);
    await sailVia(o, phone, '#panel-body button.dest[data-isle="jungle"]');
    const j2 = await state(o);
    check(L('1: back on the jungle you resume at the inland spot (not the dock) with the fog you revealed'), j2.pack === 'jungle' && j2.h.tx === inland.s.x && j2.h.ty === inland.s.y && !/at=dock/.test(j2.url) && j2.fog >= j1b.fog && j2.seed === '123', JSON.stringify({ j2, inland, f: j1b.fog }));
    check(L('1: ... and still the same HP and party'), j2.hp.hp === hurt.hp && JSON.stringify(j2.party) === JSON.stringify([chomp.id]), JSON.stringify(j2));
    // jungle -> home through the jungle dock and the sea chart's Home dock row
    await ev(pg, (I) => { I.god(true); I.clearCreatures(); });
    await toDock(o, phone);
    await sailVia(o, phone, '#panel-body button.dest[data-isle="home"]');
    const h2 = await state(o);
    const sv2 = await ev(pg, (I) => I.save());
    check(L('1: the sea chart Home dock row brings you home, HP and party unchanged'), h2.isle === 'home' && h2.near && h2.hp.hp === hurt.hp && JSON.stringify(h2.party) === JSON.stringify([chomp.id]), JSON.stringify(h2));
    check(L('1: the jungle fog in the save never shrank over the trip'), sv2.isles.jungle.fog.length >= sv1.isles.jungle.fog.length && sv2.isles.jungle.seed === '123', JSON.stringify({ a: sv1.isles.jungle.fog.length, b: sv2.isles.jungle.fog.length }));

    // ---- 3. the tame pen shows the resting tame by name ----
    const pen = await ev(pg, (I) => ({ names: I.penNames(), home: I.home() }));
    check(L('3: Fern (benched) rests in the pen by name; Chomp (party) does not'), pen.home.pens >= 1 && pen.names.length === 1 && pen.names[0].nm === 'Fern' && pen.names[0].id === fern.id, JSON.stringify(pen.names));

    // ---- 2. home build: make decor, place a fence and a pen, undo, reload ----
    await ev(pg, (I) => { I.give('wood', 12); I.give('fiber', 6); I.give('stone', 3); });
    await press(o, phone, '#btn-build');
    await frames(pg, 2);
    await press(o, phone, '#decor-make');
    const dp = await pg.evaluate(() => ({ open: !document.getElementById('panel').hidden, title: document.getElementById('panel-title').textContent,
      rows: [...document.querySelectorAll('#panel-body .decor-recipe')].map((d) => { const b = d.querySelector('button.dc-btn').getBoundingClientRect(); return { k: d.dataset.kind, dis: d.querySelector('button.dc-btn').disabled, h: b.height, w: b.width, need: [...d.querySelectorAll('.rc-need li')].map((l) => l.textContent) }; }),
      pen: [...document.querySelectorAll('#pen-list li')].map((l) => l.textContent), hscroll: document.documentElement.scrollWidth > innerWidth }));
    check(L('2: Decor > Make opens the Home decor panel with the 6 decor recipes (have / need, 44 px buttons)'), dp.open && dp.title === 'Home decor' && dp.rows.length === 6 && dp.rows.every((r) => r.h >= 44 && r.w >= 44 && r.need.length >= 2) && !dp.hscroll, JSON.stringify(dp));
    check(L('3: the Home decor panel lists the pen roster by name'), dp.pen.length === 1 && /^Fern \(Fern Raptor\)$/.test(dp.pen[0]), JSON.stringify(dp.pen));
    const before = await ev(pg, (I) => ({ inv: I.inv(), home: I.home().inv }));
    await press(o, phone, '#panel-body button.dc-btn[data-kind="fence"]');
    await press(o, phone, '#panel-body button.dc-btn[data-kind="pen"]');
    const after = await ev(pg, (I) => ({ inv: I.inv(), home: I.home().inv, made: I.save().home.made }));
    check(L('2: making a fence and a pen uses the pack (wood 12 -> 6, fiber 6 -> 3, stone 3 -> 2) and adds them to the decor stock'),
      after.inv.wood === before.inv.wood - 6 && after.inv.fiber === before.inv.fiber - 3 && after.inv.stone === before.inv.stone - 1 && after.home.fence === before.home.fence + 1 && after.home.pen === before.home.pen + 1 &&
      after.made.fence === 1 && after.made.pen === 1, JSON.stringify({ before, after }));
    await press(o, phone, '#panel-close');
    const placed = await ev(pg, (I) => {
      const cells = []; const g = I.home().grid;
      for (let y = 2; y < 18 && cells.length < 4; y++) for (let x = 2; x < 18 && cells.length < 4; x++) if (I.cellFree(x, y) && !g.some((c) => c[0] === x && c[1] === y)) cells.push({ x, y });
      I.buildKind('fence'); const f = I.buildAt(cells[0].x, cells[0].y);
      I.buildKind('pen'); const p = I.buildAt(cells[1].x, cells[1].y);
      I.buildKind('flowerbed'); const b = I.buildAt(cells[2].x, cells[2].y);
      const u = I.undo();
      const g2 = I.home().grid;
      I.buildKind('birdbath'); const l = I.buildAt(cells[3].x, cells[3].y);
      I.clock.set(Date.now() + 11000);
      const late = I.undo();
      I.clock.set(Date.now());
      return { cells, f, p, b, u, benchGone: !g2.some((c) => c[0] === cells[2].x && c[1] === cells[2].y), l, late, lanternStays: I.home().grid.some((c) => c[0] === cells[3].x && c[1] === cells[3].y) };
    });
    check(L('2: a fence and a pen are placed on the homestead grid'), placed.f.ok && placed.p.ok, JSON.stringify(placed));
    check(L('2: undo within 10 s takes the flower bed back; after 10 s undo is refused and the bird bath stays'), placed.b.ok && placed.u === true && placed.benchGone && placed.l.ok && placed.late === false && placed.lanternStays, JSON.stringify(placed));
    await ev(pg, () => window.__isles.buildMode(false));
    await pg.reload(); await ready(pg); await frames(pg, 6);
    // the screenshot: stand just south of the first pen (where Fern rests) among the decor
    await ev(pg, (I) => { I.god(true); I.clearCreatures(); const h = I.home(), p = h.grid.find((c) => c[2] === 'pen'); I.teleport(h.origin.x + p[0], h.origin.y + p[1] + 3); });
    await frames(pg, 20);
    await shot(pg, 'x7-home-' + label);
    const re = await ev(pg, (I) => ({ grid: I.home().grid, names: I.penNames(), pens: I.home().pens, made: I.save().home.made }));
    const at = (c, k) => re.grid.some((g) => g[0] === c.x && g[1] === c.y && g[2] === k);
    check(L('2: the fence and the pen survive a reload (and so does the made count)'), at(placed.cells[0], 'fence') && at(placed.cells[1], 'pen') && re.made.fence === 1 && re.made.pen === 1, JSON.stringify(re));
    check(L('3: after the reload Fern still rests in a pen by name'), re.pens >= 2 && re.names.some((n) => n.nm === 'Fern'), JSON.stringify(re.names));
    const town = await pg.evaluate(() => localStorage.getItem('pixeltown-save-v1'));
    check(L('6: pixeltown-save-v1 is untouched'), town === TOWN, town);
    check(L('6: 0 DB requests, nothing offsite, console clean'), o.db.count() === 0 && o.offsite.length === 0 && o.errors.length === 0, o.offsite.concat(o.errors).join(' | '));
    await o.ctx.close();
  }

  // ---- 4. environment meters are live on the tundra and mars ----
  for (const [pk, key] of [['tundra', 'warm'], ['mars', 'o2']]) {
    const o = await open(browser, DESK, '&isle=' + pk);
    await ev(o.page, (I) => { I.god(true); I.clearCreatures(); const t = I.findEnvTile(false); if (t) I.teleport(t.x, t.y); });
    await frames(o.page, 40);
    const a = await ev(o.page, (I) => I.env());
    await frames(o.page, 40);
    const b = await ev(o.page, (I) => I.env());
    const t0 = key === 'warm' ? a.warmT : a.o2T, t1 = key === 'warm' ? b.warmT : b.o2T;
    check('4: ' + pk + ': the ' + (key === 'warm' ? 'Warmth' : 'Air') + ' meter is shown and drains while you are out in the open', a.on && b.hud.box && b.hud[key] !== null && t1 > t0, JSON.stringify({ a: a.hud, t0, t1 }));
    check('4: ' + pk + ': 0 DB requests, console clean', o.db.count() === 0 && o.errors.length === 0, o.errors.join(' | '));
    await o.ctx.close();
  }

  // ---- 5. the first real tame writes tame1, the Hub shows it ----
  const T = await open(browser, DESK, '&isle=jungle&seed=123');
  await frames(T.page, 10);
  const m0 = await ev(T.page, (I) => I.medals());
  await ev(T.page, (I) => { I.pause(true); I.god(true); I.clearCreatures(); const r = I.findTile(null, 13); I.teleport(r.x, r.y); I.step(0, 0, 0.05); });
  const tr = await ev(T.page, KO_AND_TAME, { sp: 'fernraptor' });
  const m1 = await ev(T.page, (I) => ({ medals: I.medals(), log: I.medalLog(), raw: localStorage.getItem('pixeltown-medals-isles-v1') }));
  const parsed = JSON.parse(m1.raw || '{"m":[]}');
  check('5: before any tame there is no tame1; the first real tame (Fern Raptor) writes tame1 into pixeltown-medals-isles-v1 once', m0.indexOf('tame1') < 0 && tr.tamed && m1.log.filter((x) => x === 'tame1').length === 1 && parsed.m.indexOf('tame1') >= 0, JSON.stringify({ m0, tr, m1 }));
  const Hb = await open(browser, { viewport: { width: 1280, height: 720 } }, '', { 'pixeltown-medals-isles-v1': m1.raw, 'pixeltown-hub-v1': JSON.stringify({ v: 1, at: 'w7-isles' }) }, HUB);
  await Hb.page.waitForFunction(() => window.__hub);
  const p = await Hb.page.evaluate(() => window.__hub.nodeClient('w7-isles'));
  await Hb.page.mouse.click(p.x, p.y);
  await Hb.page.waitForFunction(() => !document.getElementById('card').hidden, null, { timeout: 8000 });
  const card = await Hb.page.evaluate(() => ({ n: document.getElementById('card-ach-n').textContent, on: [...document.querySelectorAll('#card-ach li.on')].map((l) => ({ m: l.dataset.medal, t: l.textContent })) }));
  check('5: the Hub w7-isles card shows the isles medal count and First tame', card.n === parsed.m.length + ' of 17 medals' && card.on.some((x) => x.m === 'tame1' && /First tame/.test(x.t)), JSON.stringify(card));

  check('6: blockDb saw 0 requests on every page', all.every((o) => o.db.count() === 0), all.map((o) => o.db.count()).join(','));
  check('6: nothing offsite and no console errors anywhere', all.every((o) => o.errors.length === 0 && o.offsite.length === 0), all.map((o) => o.errors.concat(o.offsite).join(' | ')).filter(Boolean).join(' || '));
  await browser.close();
  done();
})();
