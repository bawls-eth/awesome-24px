// BIOME-ARCH-PLAN slice B8: the Hearthvale Isles page (game/games/isles/) with the Jungle island. Checks the six B8 points:
// 1 no console errors at 1000x700 and 390x844 (phone: joystick + 44px buttons, no horizontal scroll), 2 world.pack === 'jungle' and verify ok,
// 3 step() walks 10 tiles and mud gives a 0.6 move scale, 4 every active creature id is a jungle pack id, 5 blockDb sees 0 requests and the
// page sources never mention firebase / net.js, 6 (the w7-isles hub card) lives in hub-page.test.js. Plus: the hero bolt damages a creature,
// the hero comes from MMProfile read only, the own key is written and a corrupt key loads defaults, and ?seed / ?art=0 / ?perf=low work.
// Run: BASE=http://localhost:8751/game/index.html NODE_PATH=$(npm root -g) node game/tests/archipelago-page.test.js
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');
const { check, done, blockDb } = require('./helpers');
const ORIGIN = (process.env.BASE || 'http://localhost:8440/game/index.html').replace(/\/game\/index\.html.*$/, '');
const PAGE = ORIGIN + '/game/games/isles/index.html';
const PROFILE = { v: 1, heroes: [{ id: 'h1', name: 'Fern', cls: 'druid', level: 7, xp: 10, items: [] }], stash: [], fame: 0, mode: 'classic', hall: [] };

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
  }, seed || {});
  await page.goto(PAGE + '?test=1&offline=1' + (query || ''));
  await page.waitForFunction(() => window.__isles && window.__isles.world);
  return { ctx, page, errors, offsite, db };
}
const ev = (page, fn, arg) => page.evaluate(`(${fn.toString()})(window.__isles, ${JSON.stringify(arg === undefined ? null : arg)})`);
const frames = (page, n) => page.evaluate((k) => new Promise((res) => { let i = 0; const f = () => (++i >= k ? res() : requestAnimationFrame(f)); requestAnimationFrame(f); }), n);

(async () => {
  const browser = await chromium.launch();

  // ---- desktop 1000x700 ----
  const d = await open(browser, { viewport: { width: 1000, height: 700 } }, '&seed=123', {
    'pixeltown-mm-v1': JSON.stringify(PROFILE), 'pixeltown-mm-active-v1': JSON.stringify({ v: 1, heroId: 'h1' }), 'pixeltown-save-v1': '{"realm":{"level":3}}' });
  const pg = d.page;
  await frames(pg, 20);
  const w = await ev(pg, (I) => ({ pack: I.world.pack, seed: I.seed, isle: I.isle, v: I.verify(), w: I.world.w }));
  check('2: world.pack is jungle and MMOverworld.verify is ok', w.pack === 'jungle' && w.v.ok && w.isle === 'jungle', JSON.stringify(w.v.problems));
  check('?seed=123 is used', w.seed === '123' && w.w === 160, JSON.stringify(w));
  const blank = await pg.evaluate(() => {
    const c = document.getElementById('view'); const x = document.createElement('canvas'); x.width = 64; x.height = 64;
    const g = x.getContext('2d'); g.drawImage(c, 0, 0, 64, 64); const data = g.getImageData(0, 0, 64, 64).data; const s = new Set();
    for (let i = 0; i < data.length; i += 4) s.add(data[i] + ',' + data[i + 1] + ',' + data[i + 2]); return s.size;
  });
  check('island view renders (canvas has many colours)', blank > 8, 'colours=' + blank);
  const hero = await ev(pg, (I) => I.heroInfo());
  check('hero read from MMProfile (active hero name, class, level)', hero.name === 'Fern' && hero.cls === 'druid' && hero.level === 7 && hero.fromProfile, JSON.stringify(hero));
  check('HUD shows the profile hero', /Fern/.test(await pg.textContent('#hud-hero')));

  // 3: walking and mud
  await ev(pg, (I) => { I.pause(true); I.god(true); I.clearCreatures(); });
  const run = await ev(pg, (I) => I.findTile(null, 13));
  check('a 13-tile open run exists on the island', !!run, '');
  const walk = await ev(pg, (I, r) => { const a = I.teleport(r.x, r.y); const b = I.step(1, 0, 10 * 32 / 150 + 0.25); return { a, b }; }, run);
  check('3a: step() walks 10 tiles east', walk.b.tx - walk.a.tx >= 10 && walk.b.ty === walk.a.ty, JSON.stringify(walk));
  const mud = await ev(pg, (I) => I.findTile('mud', 2));
  const mm = await ev(pg, (I, m) => { const a = I.teleport(m.x, m.y); I.step(0, 0, 0.02); const b = I.step(1, 0, 0.1); return { scaleAt: I.moveScaleAt(m.x, m.y), scale: b.scale, dx: b.x - a.x, terrain: b.terrain }; }, mud);
  check('3b: mud gives a 0.6 move scale', !!mud && mm.scaleAt === 0.6 && mm.scale === 0.6 && Math.abs(mm.dx - 150 * 0.6 * 0.1) < 0.5 && mm.terrain === 'mud', JSON.stringify(mm));

  // 4: creatures near a spawn group are all jungle pack ids
  await ev(pg, (I) => { I.pause(false); });
  await pg.reload(); // fresh spawner state (the save keeps the position)
  await pg.waitForFunction(() => window.__isles && window.__isles.world);
  const g0 = await ev(pg, (I) => { const W = I.world; const g = W.spawnGroups[3]; for (const [dx, dy] of [[9, 0], [-9, 0], [0, 9], [0, -9], [8, 3], [-8, -3]]) { const x = g.x + dx, y = g.y + dy; if (x > 0 && y > 0 && x < W.w && y < W.h && !W.solid[y * W.w + x]) { I.teleport(x, y); break; } } I.god(true); return I.spawnTick(); });
  await frames(pg, 30);
  const act = await ev(pg, (I) => ({ list: I.creatures(), pack: I.packSpecies }));
  check('creatures spawn from the pack spawn groups', g0 > 0 && act.list.length > 0, 'n=' + act.list.length);
  check('4: every active creature id belongs to the jungle pack', act.list.every((c) => act.pack.indexOf(c.sp) >= 0) && act.pack.indexOf('parrotlet') >= 0, act.list.map((c) => c.sp).join(','));
  check('creatures keep a plain base type and use baked code art', act.list.every((c) => ['spiral', 'aimed', 'ring'].indexOf(c.base) >= 0 && c.art), JSON.stringify(act.list[0]));
  check('at most 24 active creatures and at most 4 L/XL', act.list.length <= 24 && act.list.filter((c) => c.size === 'L' || c.size === 'XL').length <= 4);

  // the hero bolt hits a creature
  const shot = await ev(pg, (I) => {
    I.pause(true); I.clearCreatures();
    const h = I.hero(); const uid = I.spawn('boarhog', h.tx + 3, h.ty);
    const before = I.creatures().find((c) => c.uid === uid).hp;
    I.fire(1, 0); I.step(0, 0, 0.4);
    const after = (I.creatures().find((c) => c.uid === uid) || { hp: 0 }).hp;
    let n = 0; while (I.creatures().some((c) => c.uid === uid) && n++ < 40) { I.fire(1, 0); I.step(0, 0, 0.3); }
    return { uid, before, after, gone: !I.creatures().some((c) => c.uid === uid), st: I.stats() };
  });
  check('hero bolt damages a creature', shot.uid && shot.after < shot.before, JSON.stringify(shot));
  check('defeating it gives XP and counts the kill', shot.gone && shot.st.xp > 0 && shot.st.kills === 1, JSON.stringify(shot.st));
  check('a non-pack species cannot be spawned', (await ev(pg, (I) => I.spawn('rex_alpha_x', 10, 10))) === null);

  // saves: own key only, MMProfile never written
  const saved = await ev(pg, (I) => I.save());
  const keys = await pg.evaluate(() => ({ mm: localStorage.getItem('pixeltown-mm-v1'), town: localStorage.getItem('pixeltown-save-v1'), all: Object.keys(localStorage) }));
  check('pixeltown-archipelago-v1 holds the jungle seed, position and fog', saved && saved.isles.jungle.seed === '123' && saved.isles.jungle.pos && saved.isles.jungle.fog.length > 0 && saved.log.seen && Object.keys(saved.log.seen).length > 0, JSON.stringify(saved && saved.isles));
  check('MMProfile key and town save are untouched (read only)', keys.mm === JSON.stringify(PROFILE) && keys.town === '{"realm":{"level":3}}');
  // B10: the page is also the single writer of its medal summary key (pixeltown-medals-isles-v1); still no tames write without a tame
  // NAV slice D: the shared Menu (mm-nav) records the last place under its own additive key pixeltown-nav-v1
  check('only own keys written (no tames write; the B10 medal summary and the mm-nav last place are the only additions)', keys.all.filter((k) => !['pixeltown-mm-v1', 'pixeltown-mm-active-v1', 'pixeltown-save-v1', 'pixeltown-archipelago-v1', 'pixeltown-medals-isles-v1', 'pixeltown-nav-v1'].includes(k)).length === 0, keys.all.join(','));
  const med = await pg.evaluate(() => JSON.parse(localStorage.getItem('pixeltown-medals-isles-v1')));
  check('B10 medal summary is {v:1, m:[visit_jungle]} after a first jungle visit', med && med.v === 1 && JSON.stringify(med.m) === JSON.stringify(['visit_jungle']), JSON.stringify(med));
  await pg.screenshot({ path: path.join(process.env.SHOTS || require('os').tmpdir(), 'isles-desktop.png') }).catch(() => {});
  check('1a: desktop 1000x700 has no console errors', d.errors.length === 0, d.errors.join(' | '));
  check('5a: blockDb saw 0 database requests (desktop), nothing off-origin', d.db.count() === 0 && d.offsite.length === 0, d.offsite.join(' '));
  await d.ctx.close();

  // ---- phone 390x844 ----
  const p = await open(browser, { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  await frames(p.page, 20);
  const m = await p.page.evaluate(() => {
    const r = (id) => { const b = document.getElementById(id).getBoundingClientRect(); return { w: b.width, h: b.height, x: b.left, r: b.right, vis: getComputedStyle(document.getElementById(id)).display !== 'none' }; };
    return { sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth, bw: document.body.scrollWidth, stick: r('stick'), fire: r('btn-fire'), map: r('btn-map'), back: r('back'), menu: r('mm-nav-btn'), backInDom: !!document.getElementById('back'), mini: r('mini-wrap') };
  });
  check('phone: no horizontal scroll', m.sw <= m.cw && m.bw <= m.cw, JSON.stringify(m));
  check('phone: touch joystick shown', m.stick.vis && m.stick.w >= 100, JSON.stringify(m.stick));
  // NAV slice D: the old top-left "<-" link is now mm-nav-legacy (hidden, still in the DOM); the shared Menu button replaces it
  check('phone: buttons are at least 44px (Menu replaces the old back link, which stays in the DOM)', [m.fire, m.map, m.menu].every((b) => b.vis && b.w >= 44 && b.h >= 44) && m.backInDom, JSON.stringify([m.fire, m.map, m.menu, m.back]));
  check('phone: everything fits inside the screen', [m.fire, m.map, m.mini, m.stick].every((b) => b.x >= 0 && b.r <= m.cw), JSON.stringify(m));
  const st = await p.page.locator('#stick').boundingBox();
  await ev(p.page, (I) => I.god(true));
  await p.page.touchscreen.tap(st.x + st.width / 2, st.y + st.height / 2); // a tap must not throw
  await p.page.tap('#btn-map');
  check('phone: Map button toggles the minimap', await p.page.evaluate(() => document.getElementById('mini-wrap').hidden), '');
  await p.page.tap('#btn-map');
  check('1b: phone 390x844 has no console errors', p.errors.length === 0, p.errors.join(' | '));
  check('5b: blockDb saw 0 database requests (phone)', p.db.count() === 0 && p.offsite.length === 0);
  await p.ctx.close();

  // ---- switches + corrupt saves ----
  const s = await open(browser, { viewport: { width: 800, height: 600 } }, '&art=0&perf=low&seed=77', { 'pixeltown-archipelago-v1': '{oops', 'pixeltown-tames-v1': '[[', 'pixeltown-mm-v1': 'nope' });
  await frames(s.page, 15);
  const sw = await ev(s.page, (I) => ({ art: I.art, low: I.low, seed: I.seed, st: I.stats(), hero: I.heroInfo(), v: I.verify().ok }));
  check('?art=0 and ?perf=low switch art off and the low tier on (cap 12, dpr 1)', sw.art === false && sw.low === true && sw.st.cap === 12 && sw.st.dpr === 1, JSON.stringify(sw));
  check('corrupt archipelago / tames / profile keys load defaults', sw.seed === '77' && sw.v && sw.hero.name === 'Wanderer' && !sw.hero.fromProfile && s.errors.length === 0, s.errors.join('|'));
  const fixed = await ev(s.page, (I) => I.save());
  check('a corrupt key is replaced by a clean save', fixed && fixed.v === 1 && fixed.isles.jungle.seed === '77');
  await s.ctx.close();
  const bad = await open(browser, { viewport: { width: 800, height: 600 } }, '&isle=__proto__&seed=abc');
  const bi = await ev(bad.page, (I) => ({ isle: I.isle, pack: I.pack, seed: I.seed }));
  check('hostile ?isle / ?seed fall back to the jungle and seed 1', bi.isle === 'jungle' && bi.pack === 'jungle' && bi.seed === '1' && bad.errors.length === 0, JSON.stringify(bi));
  await bad.ctx.close();

  // ---- 5: source grep ----
  const dir = path.join(__dirname, '..', 'games', 'isles');
  const src = fs.readdirSync(dir).map((f) => fs.readFileSync(path.join(dir, f), 'utf8')).join('\n');
  check('5c: the isles page never mentions firebase, net.js or Phaser', !/firebase/i.test(src) && !/net\.js/.test(src) && !/phaser/i.test(src) && !/\bfetch\(|WebSocket|XMLHttpRequest/.test(src));

  await browser.close();
  done();
})();
