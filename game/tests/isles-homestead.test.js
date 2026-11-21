// BIOME-ARCH-PLAN slice B10: the local-only homestead on Hearth Isle (?isle=meadow) of the Hearthvale Isles page.
// 1 meadow loads (no console errors at 1000x700 and 390x844), is safe (no creature deals damage) and gets a seeded starter layout with a
// tame pen; 2 decor placed with the Decor bar round-trips through pixeltown-archipelago-v1 across a reload, pick-up and undo work;
// 3 a corrupt archipelago key gives defaults (the same seeded starter layout again); 4 a benched tame rests in the pen;
// 5 blockDb sees 0 requests, no offsite requests, no Firebase / net.js / Town 'blocks' in the page sources, pixeltown-save-v1 unchanged.
// Run: BASE=http://localhost:8831/game/index.html NODE_PATH=$(npm root -g) node game/tests/isles-homestead.test.js
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');
const { check, done, blockDb } = require('./helpers');
const ORIGIN = (process.env.BASE || 'http://localhost:8440/game/index.html').replace(/\/game\/index\.html.*$/, '');
const PAGE = ORIGIN + '/game/games/isles/index.html';
const TOWN = '{"realm":{"level":3},"name":"Bo"}';
const all = [];

async function open(browser, opts, query, seed) {
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
  await page.goto(PAGE + '?test=1&isle=meadow' + (query || ''));
  await page.waitForFunction(() => window.__isles && window.__isles.world);
  const o = { ctx, page, errors, offsite, db }; all.push(o); return o;
}
const ev = (page, fn, arg) => page.evaluate(`(${fn.toString()})(window.__isles, ${JSON.stringify(arg === undefined ? null : arg)})`);
const frames = (page, n) => page.evaluate((k) => new Promise((res) => { let i = 0; const f = () => (++i >= k ? res() : requestAnimationFrame(f)); requestAnimationFrame(f); }), n);
const ready = (page) => page.waitForFunction(() => window.__isles && window.__isles.world);

(async () => {
  const browser = await chromium.launch();

  // ---- 1. home loads, is safe, gets a seeded starter layout ----
  const A = await open(browser, { viewport: { width: 1000, height: 700 } });
  const pg = A.page;
  await frames(pg, 20);
  const h0 = await ev(pg, (I) => ({ pack: I.world.pack, ok: I.verify().ok, home: I.home() }));
  check('1a: ?isle=meadow is Hearth Isle with a homestead (verify ok)', h0.pack === 'meadow' && h0.ok && !!h0.home && h0.home.seeded === 1, JSON.stringify(h0).slice(0, 300));
  check('1b: the seeded starter layout sets out 5 items including a tame pen, on free cells', h0.home.grid.length === 5 && h0.home.pens === 1 &&
    (await ev(pg, (I) => I.home().grid.every((c) => I.cellFree(c[0], c[1])))), JSON.stringify(h0.home.grid));
  const safe = await ev(pg, (I) => {
    const W = I.world; const g = W.spawnGroups[0]; I.teleport(g.x + 4, g.y); I.spawnTick();
    const list = I.creatures(); list.forEach((c) => I.anger(c.uid));
    const hp = I.hero().hp; I.step(0, 0, 3); return { n: list.length, hp0: hp, hp1: I.hero().hp };
  });
  check('1c: home is safe: angered creatures never hurt you', safe.n > 0 && safe.hp1 === safe.hp0, JSON.stringify(safe));
  check('1d: the Decor button is shown at home and is a 44 px target', await pg.locator('#btn-build').isVisible() && (await pg.locator('#btn-build').boundingBox()).height >= 44);

  // ---- 2. place via the Decor bar + a canvas click, reload, pick up, undo ----
  await ev(pg, (I) => { I.pause(true); I.god(true); I.clearCreatures(); });
  const free = await ev(pg, (I) => { const h = I.home(); for (let y = 2; y < 18; y++) for (let x = 2; x < 18; x++) if (I.cellFree(x, y) && !h.grid.some((c) => c[0] === x && c[1] === y)) return { x, y, o: h.origin }; return null; });
  await ev(pg, (I, f) => I.teleport(f.o.x + f.x, f.o.y + f.y), free);
  await pg.click('#btn-build');
  await pg.click('#decor button[data-kind="birdbath"]');
  const barOk = await pg.evaluate(() => [...document.querySelectorAll('#decor button')].every((b) => b.getBoundingClientRect().height >= 44));
  const vp = pg.viewportSize();
  // the hero stands on the free cell, so the cell is at the screen centre (the camera follows the hero)
  await pg.mouse.click(Math.round(vp.width / 2), Math.round(vp.height / 2) - 4);
  const placed = await ev(pg, (I, f) => I.home().grid.some((c) => c[0] === f.x && c[1] === f.y && c[2] === 'birdbath'), free);
  check('2a: tapping open ground in decor mode places the selected item (bar targets >= 44 px)', placed && barOk, JSON.stringify(free));
  const stored = await pg.evaluate(() => JSON.parse(localStorage.getItem('pixeltown-archipelago-v1')).home);
  check('2b: the decor is saved in pixeltown-archipelago-v1 (local only)', stored.grid.some((c) => c[2] === 'birdbath') && stored.inv.birdbath === 0 && stored.seeded === 1, JSON.stringify(stored));
  await pg.reload(); await ready(pg);
  const h1 = await ev(pg, (I) => I.home());
  check('2c: the decor survives a reload (round trip)', h1.grid.length === 6 && h1.grid.some((c) => c[0] === free.x && c[1] === free.y && c[2] === 'birdbath') && h1.inv.birdbath === 0, JSON.stringify(h1.grid));
  const pu = await ev(pg, (I, f) => { I.buildMode(true); const a = I.buildAt(f.x, f.y); const b = I.home(); const u = I.undo(); const c = I.home(); return { a, picked: !b.grid.some((x) => x[0] === f.x && x[1] === f.y), inv: b.inv.birdbath, u, back: c.grid.some((x) => x[0] === f.x && x[1] === f.y && x[2] === 'birdbath') }; }, free);
  check('2d: tapping an item picks it up; undo puts it back', pu.a.ok && pu.picked && pu.inv === 1 && pu.u && pu.back, JSON.stringify(pu));
  const refuse = await ev(pg, (I) => { I.buildKind('lantern'); let blocked = null; for (let y = 0; y < 20 && !blocked; y++) for (let x = 0; x < 20; x++) if (!I.cellFree(x, y)) { blocked = I.buildAt(x, y); break; } return { out: I.buildAt(-3, 4), far: I.buildAt(24, 2), blocked }; });
  check('2e: cells outside the garden square (and water / blocked ground, when present) are refused', !refuse.out.ok && refuse.out.why === 'outside' && !refuse.far.ok && (!refuse.blocked || refuse.blocked.why === 'ground'), JSON.stringify(refuse));

  // ---- 3. corrupt key -> defaults (the same seeded starter layout) ----
  const C = await open(browser, { viewport: { width: 1000, height: 700 } }, '', { 'pixeltown-archipelago-v1': '{"v":1,"home":{"grid":"oops' });
  const hc = await ev(C.page, (I) => I.home());
  check('3: a corrupt archipelago key loads defaults with the same seeded starter layout', JSON.stringify(hc.grid) === JSON.stringify(h0.home.grid) && hc.seeded === 1 && C.errors.length === 0, JSON.stringify(hc.grid));

  // ---- 4. a benched tame rests in the pen (phone size) ----
  const TM = JSON.stringify({ v: 1, n: 2, roster: [{ id: 't1', sp: 'chompbill', nm: 'Chomp', lv: 2, xp: 0, bond: 1, aff: 0, cos: '', isle: 'jungle', d: '2026-11-01' },
    { id: 't2', sp: 'fernraptor', nm: 'Fern', lv: 3, xp: 0, bond: 1, aff: 0, cos: '', isle: 'jungle', d: '2026-11-01' }], party: ['t1'], mount: null });
  const P = await open(browser, { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true }, '', { 'pixeltown-tames-v1': TM });
  await frames(P.page, 20);
  const hp = await ev(P.page, (I) => ({ home: I.home(), party: I.party().map((p) => p.id) }));
  const sw = await P.page.evaluate(() => document.documentElement.scrollWidth <= innerWidth);
  check('4: the benched fernraptor rests in the pen, the party tame follows you (390x844, no h-scroll)', JSON.stringify(hp.home.guests) === JSON.stringify(['fernraptor']) && hp.party.indexOf('t1') >= 0 && sw, JSON.stringify(hp));

  // ---- 5. local only ----
  const srcs = ['games/isles/isles.js', 'games/isles/index.html', 'shared/mm-homestead.js'].map((f) => fs.readFileSync(path.join(__dirname, '..', f), 'utf8').split('\n').map((l) => l.replace(/\/\/.*$/, '')).join('\n'));
  check('5a: no Firebase SDK, net.js or Town blocks ref in the page sources', srcs.every((s) => !/firebase|net\.js|['"]blocks['"]|BLOCK_TYPES/i.test(s)));
  check('5b: blockDb saw 0 requests and nothing went offsite', all.every((o) => o.db.count() === 0 && o.offsite.length === 0), all.map((o) => o.db.count() + ':' + o.offsite.join(',')).join(' '));
  const town = await pg.evaluate(() => localStorage.getItem('pixeltown-save-v1'));
  check('5c: pixeltown-save-v1 is untouched', town === TOWN, town);
  check('no console errors', all.every((o) => o.errors.length === 0), all.map((o) => o.errors.join(' | ')).filter(Boolean).join(' || '));
  await browser.close();
  done();
})();
