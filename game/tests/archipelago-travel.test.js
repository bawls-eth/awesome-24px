// BIOME-ARCH-PLAN slice B10 (travel, cozy, medals) on the Hearthvale Isles page (game/games/isles/).
// 1 every pack (meadow, jungle, reef, tundra, mars) loads via ?isle= with no console errors at 1000x700 and 390x844, world.pack matches
//   and MMOverworld.verify is ok; 2 the dock opens a calm sea chart (44 px targets) and sailing changes world.pack (verify ok) and lands
//   at the new dock; Home fast-travels back to the meadow dock; 3 daily-free gather spots: one pick per spot per day, a new ?today frees
//   it again, the collection log counts it; 4 medals (visit, boss seen, first tame per size class) unlock exactly once into
//   pixeltown-medals-isles-v1 and the Hub card for w7-isles shows the count; 5 blockDb sees 0 requests; pixeltown-save-v1 never changes.
// Run: BASE=http://localhost:8831/game/index.html NODE_PATH=$(npm root -g) node game/tests/archipelago-travel.test.js
const { chromium } = require('playwright');
const { check, done, blockDb } = require('./helpers');
const TAMES = require('../shared/mm-tames.js');
const ORIGIN = (process.env.BASE || 'http://localhost:8440/game/index.html').replace(/\/game\/index\.html.*$/, '');
const PAGE = ORIGIN + '/game/games/isles/index.html';
const HUB = ORIGIN + '/game/hub/index.html';
const TOWN = '{"realm":{"level":3},"name":"Bo"}';
const PHONE = { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true };
const DESK = { viewport: { width: 1000, height: 700 } };
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
  if (!url) await page.waitForFunction(() => window.__isles && window.__isles.world);
  const o = { ctx, page, errors, offsite, db }; all.push(o); return o;
}
const ev = (page, fn, arg) => page.evaluate(`(${fn.toString()})(window.__isles, ${JSON.stringify(arg === undefined ? null : arg)})`);
const frames = (page, n) => page.evaluate((k) => new Promise((res) => { let i = 0; const f = () => (++i >= k ? res() : requestAnimationFrame(f)); requestAnimationFrame(f); }), n);
const ready = (page) => page.waitForFunction(() => window.__isles && window.__isles.world, null, { timeout: 15000 });

(async () => {
  const browser = await chromium.launch();

  // ---- 1. every pack loads at both sizes ----
  const PACKS = { meadow: 'home', jungle: 'jungle', reef: 'reef', tundra: 'ice', mars: 'mars' };
  for (const pk of Object.keys(PACKS)) {
    for (const [label, opts] of [['1000x700', DESK], ['390x844', PHONE]]) {
      const o = await open(browser, opts, '&isle=' + pk);
      await frames(o.page, 20);
      const w = await ev(o.page, (I) => ({ pack: I.world.pack, isle: I.isle, ok: I.verify().ok, w: I.world.w, sp: I.packSpecies, list: I.creatures().map((c) => c.sp) }));
      const sw = await o.page.evaluate(() => document.documentElement.scrollWidth <= innerWidth);
      check('1: ?isle=' + pk + ' at ' + label + ' loads ' + pk + ' (verify ok, no console errors, no h-scroll)', w.pack === pk && w.isle === PACKS[pk] && w.ok && sw && o.errors.length === 0, JSON.stringify(w) + o.errors.join(' | '));
      if (pk === 'meadow' && label === '1000x700') check('1: the meadow home island is 96 tiles (96-128)', w.w >= 96 && w.w <= 128, 'w=' + w.w);
      await o.ctx.close();
    }
  }

  // ---- 2. dock -> sea chart -> sail -> home ----
  const T = await open(browser, DESK, '&isle=jungle&seed=123');
  const pg = T.page;
  await ev(pg, (I) => { I.god(true); I.clearCreatures(); });
  const dock = await ev(pg, (I) => { const d = I.dock(); I.teleport(d.x, d.y); return { d, near: I.nearDock() }; });
  await frames(pg, 15);
  check('2a: the jungle has a dock on the beach band and standing on it shows Sail', !!dock.d && dock.near && await pg.locator('#btn-sail').isVisible(), JSON.stringify(dock));
  await pg.click('#btn-sail');
  const chart = await pg.evaluate(() => ({ open: !document.getElementById('panel').hidden, title: document.getElementById('panel-title').textContent,
    dests: [...document.querySelectorAll('#panel-body button.dest')].map((b) => ({ isle: b.dataset.isle, t: b.textContent, h: b.getBoundingClientRect().height, w: b.getBoundingClientRect().width })),
    text: document.getElementById('panel-body').textContent }));
  check('2b: sea chart lists the other 4 islands with 44 px targets', chart.open && chart.dests.length === 4 && chart.dests.every((d) => d.h >= 44 && d.w >= 44) &&
    JSON.stringify(chart.dests.map((d) => d.isle).sort()) === JSON.stringify(['home', 'ice', 'mars', 'reef']), JSON.stringify(chart));
  check('2c: calm text, no urgency words', !/hurry|now!|limited|expires|last chance|streak|!/i.test(chart.text), chart.text);
  await Promise.all([pg.waitForNavigation(), pg.click('#panel-body button[data-isle="reef"]')]);
  await ready(pg);
  await frames(pg, 10);
  const reef = await ev(pg, (I) => ({ pack: I.world.pack, ok: I.verify().ok, isle: I.isle, near: I.nearDock(), url: location.search }));
  check('2d: sailing changes world.pack to reef, verify ok, and you land at the reef dock', reef.pack === 'reef' && reef.ok && reef.isle === 'reef' && reef.near && /at=dock/.test(reef.url), JSON.stringify(reef));
  check('2e: Home button is shown away from home (44 px)', await pg.locator('#btn-home').isVisible() && (await pg.locator('#btn-home').boundingBox()).height >= 44);
  await Promise.all([pg.waitForNavigation(), pg.click('#btn-home')]);
  await ready(pg);
  await frames(pg, 10);
  const home = await ev(pg, (I) => ({ pack: I.world.pack, ok: I.verify().ok, near: I.nearDock(), home: !!I.home() }));
  check('2f: Home fast-travels to the meadow home dock', home.pack === 'meadow' && home.ok && home.near && home.home, JSON.stringify(home));
  const sv = await ev(pg, (I) => I.save());
  check('2g: the archipelago save remembers the jungle seed and the islands visited', sv.isles.jungle && sv.isles.jungle.seed === '123' && JSON.stringify(sv.visited) === JSON.stringify(['jungle', 'reef', 'home']) && sv.at === 'home', JSON.stringify(sv.visited));
  const mAfterTrip = await ev(pg, (I) => I.medals());
  check('4a: visit medals for jungle, reef and home', ['visit_jungle', 'visit_reef', 'visit_home'].every((m) => mAfterTrip.indexOf(m) >= 0), mAfterTrip.join(','));
  // back to the jungle via the chart from home: the jungle position (dock) and seed come back
  await Promise.all([pg.waitForNavigation(), ev(pg, (I) => I.travel('jungle'))]);
  await ready(pg);
  const back = await ev(pg, (I) => ({ pack: I.world.pack, seed: I.seed, medals: I.medals(), log: I.medalLog() }));
  check('2h: travel back to the jungle keeps its seed 123', back.pack === 'jungle' && back.seed === '123', JSON.stringify(back));
  check('4b: a revisit unlocks nothing again (exactly once)', back.log.length === 0 && back.medals.filter((m) => m === 'visit_jungle').length === 1, JSON.stringify(back));
  check('5: no DB or offsite requests during travel', T.db.count() === 0 && T.offsite.length === 0, T.offsite.join(','));

  // ---- 3. gather spots ----
  const G = await open(browser, DESK, '&isle=jungle&seed=7&today=2026-12-01');
  const gp = G.page;
  await ev(gp, (I) => { I.god(true); I.clearCreatures(); I.pause(true); });
  const sp = await ev(gp, (I) => I.spots());
  const kinds = [...new Set(sp.map((s) => s.kind))];
  check('3a: daily gather spots come from the jungle resources table (up to 8, several kinds)', sp.length > 0 && sp.length <= 8 && kinds.length >= 3 && sp.every((s) => ['wood', 'vine_rope', 'amber', 'cocoa', 'jungle_berry'].indexOf(s.kind) >= 0), JSON.stringify(kinds));
  const g1 = await ev(gp, (I, s) => { I.teleport(s.x, s.y); const a = I.gather(); const b = I.gather(); return { a, b, log: I.gatherLog(), spots: I.spots() }; }, sp[0]);
  check('3b: a spot gives one item, then is done for the day', g1.a.ok && g1.a.kind === sp[0].kind && !g1.b.ok && g1.log[sp[0].kind] === 1 && g1.spots.find((s) => s.idx === sp[0].idx).taken, JSON.stringify(g1));
  await ev(gp, (I) => I.openPanel('log'));
  const logTxt = await gp.textContent('#log-collection');
  check('3c: the collection log lists the find', logTxt.indexOf(sp[0].kind.replace(/_/g, ' ') + ' x1') >= 0, logTxt);
  await gp.reload(); await ready(gp);
  const g2 = await ev(gp, (I, s) => { I.pause(true); I.teleport(s.x, s.y); return { r: I.gather(), spots: I.spots() }; }, sp[0]);
  check('3d: still taken after a reload on the same day', !g2.r.ok && g2.spots.find((s) => s.idx === sp[0].idx).taken, JSON.stringify(g2.r));
  await gp.goto(PAGE + '?test=1&isle=jungle&seed=7&today=2026-12-02'); await ready(gp);
  const g3 = await ev(gp, (I) => { I.pause(true); const s = I.spots(); I.teleport(s[0].x, s[0].y); const r = I.gather(); return { r, n: s.length, untaken: s.filter((x) => !x.taken).length, log: I.gatherLog() }; });
  check('3e: a new day frees every spot again and the log keeps counting', g3.r.ok && g3.untaken === g3.n && Object.values(g3.log).reduce((a, b) => a + b, 0) === 2, JSON.stringify(g3));

  // ---- 4. medals: boss seen + size-class tames, exactly once ----
  let tm = TAMES.defaults();
  TAMES.add(tm, { sp: 'chompbill', nm: 'Chomp', isle: 'jungle', d: '2026-11-01' });
  TAMES.add(tm, { sp: 'tusktop', nm: 'Tusk', isle: 'jungle', d: '2026-11-01' });
  const M = await open(browser, DESK, '&isle=jungle&seed=123', { 'pixeltown-tames-v1': JSON.stringify(tm) });
  const mp = M.page;
  const m1 = await ev(mp, (I) => ({ medals: I.medals(), log: I.medalLog() }));
  check('4c: first tame of each owned size class (S chompbill, L tusktop) unlocks tame_s and tame_l only', m1.medals.indexOf('tame_s') >= 0 && m1.medals.indexOf('tame_l') >= 0 && m1.medals.indexOf('tame_m') < 0 && m1.medals.indexOf('tame_xl') < 0, JSON.stringify(m1));
  const boss = await ev(mp, (I) => { I.god(true); I.clearCreatures(); const b = I.world.bossSites[0]; I.teleport(b.x + 3, b.y); const a = I.bossCheck(); const n1 = I.medalLog().length; I.bossCheck(); I.checkMedals(); return { a, b: b.boss, n1, n2: I.medalLog().length, m: I.medals() }; });
  check('4d: seeing the jungle boss lair unlocks its medal exactly once', boss.a.indexOf(boss.b) >= 0 && boss.m.indexOf('boss_' + boss.b) >= 0 && boss.n1 === boss.n2 && boss.m.filter((x) => x === 'boss_' + boss.b).length === 1, JSON.stringify(boss));
  await mp.reload(); await ready(mp);
  const m2 = await ev(mp, (I) => ({ log: I.medalLog(), raw: localStorage.getItem('pixeltown-medals-isles-v1') }));
  const parsed = JSON.parse(m2.raw);
  check('4e: after a reload nothing unlocks again and the summary key has no duplicates', m2.log.length === 0 && parsed.v === 1 && new Set(parsed.m).size === parsed.m.length && parsed.m.indexOf('boss_' + boss.b) >= 0, m2.raw);
  const town = await mp.evaluate(() => localStorage.getItem('pixeltown-save-v1'));
  check('5: pixeltown-save-v1 is untouched by the isles page', town === TOWN, town);

  // hub card shows the isles medal count
  const hubSeed = { 'pixeltown-medals-isles-v1': m2.raw, 'pixeltown-hub-v1': JSON.stringify({ v: 1, at: 'w7-isles' }) };
  const Hb = await open(browser, { viewport: { width: 1100, height: 760 } }, '', hubSeed, HUB);
  await Hb.page.waitForFunction(() => window.__hub);
  const p = await Hb.page.evaluate(() => window.__hub.nodeClient('w7-isles'));
  await Hb.page.mouse.click(p.x, p.y);
  await Hb.page.waitForFunction(() => !document.getElementById('card').hidden, null, { timeout: 8000 });
  const card = await Hb.page.evaluate(() => ({ n: document.getElementById('card-ach-n').textContent, on: [...document.querySelectorAll('#card-ach li.on')].map((l) => l.dataset.medal) }));
  check('4f: the Hub w7-isles card shows the isles medal count', card.n === parsed.m.length + ' of 17 medals' && card.on.length === parsed.m.length, JSON.stringify(card));

  check('5: blockDb saw 0 requests on every page', all.every((o) => o.db.count() === 0), all.map((o) => o.db.count()).join(','));
  check('no console errors anywhere', all.every((o) => o.errors.length === 0), all.map((o) => o.errors.join(' | ')).filter(Boolean).join(' || '));
  await browser.close();
  done();
})();
