// G-04 (b02-04, b02-05; owner default O-06): a full backpack never auto-sells an upgrade. A T12 bag (best owned T3) stays on the ground with a
// "Backpack full" HUD toast, nothing paid, nothing saved / recorded; after making room the same bag gives the T12 with its tier and affix seed.
// Low-value drops keep the auto-sell (rmSellValue, lastFullSale) and the toast names what was sold. Direct grants (chest / rush) of an upgrade
// are dropped as a waiting bag instead of being sold. Offline: blockDb + every WebSocket closed, no chat, no Firebase writes.
// Run: BASE=http://localhost:8440/game/index.html node game/tests/beta-g04-full-pack.test.js
const { chromium } = require('playwright');
const { check, done, blockDb } = require('./helpers');
const ORIGIN = (process.env.BASE || 'http://localhost:8440/game/index.html').replace(/\/game\/index\.html.*$/, '');
const MAZE = ORIGIN + '/game/games/mad-maze/index.html?test=1&offline=1';
const MM = 'pixeltown-mm-v1', ACTIVE = 'pixeltown-mm-active-v1';
const hero = (id, cls, level) => ({ id, name: cls, cls, level, xp: 0, fame: 0, bonus: 0, mode: 'classic', items: [] });
const prof = (heroes) => ({ v: 1, heroes, stash: new Array(16).fill(null), fame: 0, mode: 'classic', hall: [], migratedFrom: null });

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1000, height: 700 } });
  await blockDb(ctx);
  await ctx.route('**/game/index.html*', (r) => r.fulfill({ contentType: 'text/html', body: '<!doctype html><title>town</title>town' }));
  await ctx.route('**/hub/index.html*', (r) => r.fulfill({ contentType: 'text/html', body: '<!doctype html><title>hub</title>hub' }));
  await ctx.routeWebSocket(/.*/, (ws) => ws.close());
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  await page.goto(ORIGIN + '/game/games/mad-maze/lantern.css');
  await page.evaluate(([k1, p, k2, a]) => { localStorage.setItem(k1, JSON.stringify(p)); localStorage.setItem(k2, a); }, [MM, prof([hero('h-1', 'bruiser', 20)]), ACTIVE, JSON.stringify({ v: 1, heroId: 'h-1' })]);
  await page.goto(MAZE);
  await page.waitForFunction(() => window.__mm && window.__mm.arena && window.__mm.arena.active, null, { timeout: 15000 });

  const r1 = await page.evaluate(() => {
    const a = window.__mm.arena; const sv = a.save; a.state = 'play'; a.paused = true; // the page loop stands still: the test steps _updateBags itself
    a.enemies.forEach((e) => { e.active = false; }); a.eBullets.forEach((b) => { b.active = false; }); a.bags.forEach((b) => { b.active = false; });
    sv.items = [{ n: 1, id: 'sparkwand', r: 0, t: 3 }]; sv.nextUid = 50; sv.eq = {};
    while (sv.items.length < RM_BACKPACK) sv.items.push({ n: sv.nextUid++, id: 'heartcharm', r: 0 });
    window.__saves = 0; window.__finds = 0; const os = a.onSave; a.onSave = function (x) { window.__saves++; return os.call(this, x); };
    const oi = a.onItem; a.onItem = function (x) { window.__finds++; return oi ? oi.call(this, x) : undefined; };
    a._fullToastAt = 0;
    const p = a.player; const b = a.dropBag(p.x, p.y, 2, 'sparkwand', null, { t: 12, a: 7 }); b.id = 'sparkwand'; b.vx = 0; b.vy = 0; b.t = 0.3; b.x = p.x; b.y = p.y;
    const n0 = sv.items.length, s0 = sv.shards;
    for (let i = 0; i < 30; i++) a._updateBags(0.016);
    const banner = (document.getElementById('realm-banner') || {}).textContent || '';
    return { n0, n: sv.items.length, ds: sv.shards - s0, active: b.active, gear: b.gear, toast: a.lastFullToast, banner, saves: window.__saves, finds: window.__finds, sale: a.lastFullSale || null };
  });
  check('1. full pack + T12 bag (best owned T3): items and shards unchanged, the bag is still in the world with its tier', r1.n === r1.n0 && r1.ds === 0 && r1.active && r1.gear && r1.gear.t === 12, JSON.stringify(r1));
  check('1b. a HUD toast says "Backpack full: make room for ..."', /Backpack full: make room for Spark Wand/.test(r1.toast) && /Backpack full/.test(r1.banner), JSON.stringify(r1));
  check('4. no save write and no stash record of the kept-on-ground item before the pickup', r1.saves === 0 && r1.finds === 0, JSON.stringify(r1));

  const life = await page.evaluate(() => { const a = window.__mm.arena; const b = a.bags.find((x) => x.active && x.gear && x.gear.t === 12); b.lifetime = 5; b.t = 4.99; for (let i = 0; i < 60; i++) a._updateBags(0.016); return { active: b.active, t: b.t }; });
  check('1c. a waiting upgrade bag does not expire while the hero stands next to it', life.active && life.t < 5, JSON.stringify(life));

  const r2 = await page.evaluate(() => {
    const a = window.__mm.arena; const sv = a.save; a.discard(sv.items[sv.items.length - 1].n);
    for (let i = 0; i < 30; i++) a._updateBags(0.016);
    const got = sv.items.find((x) => x.id === 'sparkwand' && x.t === 12);
    return { got: got || null, n: sv.items.length, finds: window.__finds, bagsWaiting: a.bags.filter((x) => x.active && x.gear && x.gear.t === 12).length };
  });
  check('2. after selling one item, walking over the bag puts the T12 in the pack with its tier and affix seed', r2.got && r2.got.t === 12 && r2.got.a === 7 && r2.n === 24 && r2.bagsWaiting === 0 && r2.finds === 1, JSON.stringify(r2));

  const r3 = await page.evaluate(() => {
    const a = window.__mm.arena; const sv = a.save; a._fullToastAt = 0; a.lastFullSale = null;
    const p = a.player; const b = a.dropBag(p.x, p.y, 0, 'heartcharm', null, null); b.id = 'heartcharm'; b.vx = 0; b.vy = 0; b.t = 0.3; b.x = p.x; b.y = p.y;
    const s0 = sv.shards, n0 = sv.items.length;
    for (let i = 0; i < 10; i++) a._updateBags(0.016);
    const ft = a.texts.find((t) => t.active && /^sold Hearty Charm/.test(t.text));
    return { ds: sv.shards - s0, want: rmSellValue({ r: 0 }), n: sv.items.length, n0, sale: a.lastFullSale, toast: a.lastFullToast, active: b.active, outline: ft ? ft.outline : null };
  });
  check('3. full pack + a T0 common: sold at rmSellValue, lastFullSale set, the bag is gone', r3.ds === r3.want && r3.n === r3.n0 && r3.sale && r3.sale.id === 'heartcharm' && !r3.active, JSON.stringify(r3));
  check('3b. the toast names what was sold and the float text has a dark outline', /Backpack full: sold Hearty Charm \+\d+/.test(r3.toast) && r3.outline === '#0b0d1a', JSON.stringify(r3));

  const r4 = await page.evaluate(() => {
    const a = window.__mm.arena; const sv = a.save; const s0 = sv.shards, n0 = sv.items.length;
    const ok = a.collectItem('arm_heavy_frost', 1, { t: 9, a: 3 });
    const b = a.bags.find((x) => x.active && x.waitRoom && x.gear && x.gear.t === 9);
    return { ok, ds: sv.shards - s0, dn: sv.items.length - n0, bag: !!b, id: b && b.id };
  });
  check('5. a direct grant of an upgrade with a full pack (chest / rush) is not sold: it waits as a bag at the hero', r4.ok === false && r4.ds === 0 && r4.dn === 0 && r4.bag, JSON.stringify(r4));
  check('no page errors', errors.length === 0, errors.join(' | '));
  await ctx.close(); await browser.close();
  done();
})().catch((e) => { console.error(e); process.exit(1); });
