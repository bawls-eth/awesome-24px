// VN (NEXT-SLICES-3 Wave 4): the Nexus vendor / forge stall. Talking to the Vendor (or the Blacksmith) in the Realm Nexus opens a stall with the fixed
// MMGearForge.vendorStock T1-T3 list at fixed dust prices, a buy-back for dust (MMGearForge.buyBack: T1-T3 only, soulbound / T4+ / classic refused,
// with a confirm step) and a button that opens the backpack Forge. Calm text (no timers, no rotation, no urgency), no randomness, no real money,
// ?forge=0 hides the stall, a save without dust loads and stays byte-identical, phone 390x844 has 44 px targets and no horizontal scroll.
// Offline: blockDb + every WebSocket closed, 0 DB traffic, 0 console errors.
// Run: BASE=http://localhost:8440/game/index.html NODE_PATH=$(npm root -g) node game/tests/nexus-vendor.test.js
const { chromium } = require('playwright');
const { check, done, blockDb } = require('./helpers');
const ORIGIN = (process.env.BASE || 'http://localhost:8440/game/index.html').replace(/\/game\/index\.html.*$/, '');
const WORLD = ORIGIN + '/game/games/mad-maze/index.html?mode=world&test=1&offline=1&seed=12345&qdate=2030-05-01';
const SAVE = 'pixeltown-save-v1';
const realm = (extra) => Object.assign({ level: 6, xp: 0, shards: 50, bestWave: 2,
  items: [{ n: 1, id: 'sparkwand', r: 0, t: 2 }, { n: 3, id: 'sparkwand', r: 1, t: 3 }, { n: 5, id: 'sparkwand', r: 0, t: 11, a: 9 }, { n: 7, id: 'sparkwand', r: 0, t: 5 }, { n: 9, id: 'heartcharm', r: 0 }],
  nextUid: 20, eq: { weapon: 1 } }, extra || {});

async function open(browser, query, rm, phone) {
  const ctx = await browser.newContext(phone ? { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true } : { viewport: { width: 1000, height: 700 } });
  const db = await blockDb(ctx);
  await ctx.route('**/game/index.html*', (r) => r.fulfill({ contentType: 'text/html', body: '<!doctype html><title>town</title>town' }));
  await ctx.route('**/hub/index.html*', (r) => r.fulfill({ contentType: 'text/html', body: '<!doctype html><title>hub</title>hub' }));
  await ctx.routeWebSocket(/.*/, (ws) => ws.close()); // never reach the live DB
  const page = await ctx.newPage(); const errors = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errors.push('console: ' + m.text()); });
  await page.goto(ORIGIN + '/game/games/mad-maze/lantern.css');
  await page.evaluate(([k, v]) => { localStorage.clear(); localStorage.setItem(k, v); localStorage.setItem('mm-aim-assist', '0'); }, [SAVE, JSON.stringify({ realm: rm })]);
  errors.length = 0;
  await page.goto(WORLD + (query || ''));
  await page.waitForFunction(() => window.__mm && window.__mm.world && window.__mm.arena.active && window.__mm.arena.state === 'play', null, { timeout: 30000 });
  await E(page, (a) => { a.player.iframes = 1e9; a._hitPlayer = () => {}; a.eBullets.forEach((b) => { b.active = false; }); a.enemies.forEach((e) => { e.active = false; }); });
  return { ctx, page, errors, db };
}
const E = (page, fn, arg) => page.evaluate(`(${fn.toString()})(window.__mm.arena, window.__mm.world, ${JSON.stringify(arg)})`);
const enter = (page) => E(page, (a, w) => { const s = w.nexus.site; a.player.x = s.x - 20; a.player.y = s.y; return w.nexus.open(); });
const stored = (page) => page.evaluate((k) => JSON.parse(localStorage.getItem(k)).realm, SAVE);
const stall = (page) => page.evaluate(() => {
  const el = document.getElementById('rw-nx-stall');
  const bt = (b) => { const r = b.getBoundingClientRect(); return { t: b.textContent, h: r.height, w: r.width, dis: b.disabled, d: Object.assign({}, b.dataset), id: b.id }; };
  if (!el) return null;
  const cs = getComputedStyle(el);
  return { shown: !el.classList.contains('hidden') && cs.display !== 'none', text: el.textContent, btns: Array.from(el.querySelectorAll('button')).map(bt) };
});

(async () => {
  const browser = await chromium.launch();
  const errs = []; let dbHits = 0;

  // ---------- desktop: stall present, buy, buy-back, refusals, the Forge ----------
  { const A = await open(browser, '', realm({ dust: 100 })); const page = A.page;
    check('the Nexus opens', await enter(page) === true);
    const st0 = await E(page, (a, w) => ({ on: w.nexus.stall.on(), npcs: window.MMNexus.stallNpcs().map((n) => n.id + ':' + n.stall), line: w.nexus.talk('vendor'), open: w.nexus.stall.isOpen() }));
    check('the Nexus plaza names its stall keepers (MMNexus.stallNpcs: vendor = shop, blacksmith = forge)', st0.npcs.join() === 'vendor:shop,blacksmith:forge', JSON.stringify(st0.npcs));
    check('talking to the Vendor opens the stall and says something calm', st0.on && st0.open && st0.line && st0.line.text.length > 10, JSON.stringify(st0));
    let s = await stall(page);
    const want = await page.evaluate(() => MMGearForge.vendorStock('2026-W47').map((o) => ({ k: o.id + ':' + o.t, price: o.price, t: o.t, r: o.r })));
    const buys = s.btns.filter((b) => b.d.vbuy);
    check('the stall is present in the Nexus and lists exactly the MMGearForge.vendorStock T1-T3 list at its fixed prices', s.shown && want.length === 12 && buys.length === want.length
      && buys.every((b, i) => b.d.vbuy === want[i].k && Number(b.d.price) === want[i].price && b.t.indexOf(want[i].price + ' dust') > 0) && want.every((o) => o.t >= 1 && o.t <= 3 && o.r === 0), JSON.stringify({ want, got: buys.map((b) => b.d) }).slice(0, 600));
    check('the stall reads calm: fixed prices, no timer, rotation, urgency or real money', /Fixed prices in dust/.test(s.text) && !/hurry|limited|only \d+ left|ends in|timer|today only|sale|\$|€|£|real money|pack/i.test(s.text), s.text.slice(0, 300));
    check('the stall shows the dust wallet', /You have 100 dust/.test(s.text), s.text.slice(0, 200));
    // buy a T2 Spark Wand: exact dust, a plain untiered-safe entry
    const p2 = want.find((o) => o.k === 'sparkwand:2').price;
    await page.evaluate(() => { window.__rnd = 0; const o = Math.random; Math.random = function () { window.__rnd++; return o.call(Math); }; });
    const pre = await E(page, (a) => ({ n: a.save.items.length, next: a.save.nextUid }));
    await page.click('#rw-nx-stall button[data-vbuy="sparkwand:2"]');
    let sv = await E(page, (a) => ({ dust: a.save.dust, items: a.save.items.map((x) => Object.assign({}, x)), rnd: window.__rnd }));
    let stv = await stored(page);
    const got = sv.items.find((x) => x.n === pre.next);
    check('buy deducts exactly the listed dust once (saved)', sv.dust === 100 - p2 && stv.dust === 100 - p2 && sv.items.length === pre.n + 1, JSON.stringify({ dust: sv.dust, st: stv.dust, p2 }));
    check('the bought item is a plain { n, id, r: 0, t } entry (no affix seed, untiered-safe; plus the UR identity tag u) and is saved', got && got.id === 'sparkwand' && got.r === 0 && got.t === 2 && Object.keys(got).filter((k) => k !== 'u').sort().join() === 'id,n,r,t' && Number.isInteger(got.u) && got.u > 0 && !('a' in got) && stv.items.some((x) => x.n === got.n && x.t === 2), JSON.stringify(got));
    check('no randomness is used by the vendor', sv.rnd === 0, String(sv.rnd));
    s = await stall(page);
    check('the stall re-renders with the new wallet', new RegExp('You have ' + (100 - p2) + ' dust').test(s.text), s.text.slice(0, 120));
    // buy-back: T3 r1 asks first, then pays floor(sellValue x ratio)
    const bb = await page.evaluate(() => Math.floor(MMGear.sellValue(1, 3) * MMGearForge.BUYBACK_RATIO));
    const sells = s.btns.filter((b) => b.d.vsell).map((b) => Number(b.d.vsell)).sort((x, y) => x - y);
    check('only T1-T3 items are offered for buy-back (not soulbound T11, T5 or the classic charm)', sells.join() === [1, 3, got.n].join(), JSON.stringify(sells));
    await page.click('#rw-nx-stall button[data-vsell="3"]');
    s = await stall(page);
    sv = await E(page, (a) => ({ dust: a.save.dust, has: a.save.items.some((x) => x.n === 3) }));
    check('buy-back asks first (nothing changed yet)', new RegExp('back for ' + bb + ' dust\\?').test(s.text) && s.btns.some((b) => b.d.vyes === '3') && sv.has && sv.dust === 100 - p2, JSON.stringify({ t: s.text.slice(0, 300), sv }));
    await page.click('#rw-nx-stall button[data-vyes="3"]');
    sv = await E(page, (a) => ({ dust: a.save.dust, has: a.save.items.some((x) => x.n === 3) }));
    stv = await stored(page);
    check('buy-back returns dust at the MMGearForge ratio (floor(sellValue x 0.5)) and removes the item (saved)', bb > 0 && sv.dust === 100 - p2 + bb && !sv.has && stv.dust === sv.dust && !stv.items.some((x) => x.n === 3), JSON.stringify({ sv, bb, st: stv.dust }));
    const ref = await E(page, (a) => { const d0 = a.save.dust; const r = [a.vendorBuyBackInfo(5), a.vendorBuyBackInfo(7), a.vendorBuyBackInfo(9), a.vendorSellBack(5), a.vendorSellBack(7), a.vendorSellBack(9)]; return { r, d: a.save.dust === d0, n: [5, 7, 9].every((u) => a.save.items.some((x) => x.n === u)) }; });
    check('soulbound (T11), T4+ (T5) and classic items are refused for buy-back and stay put', ref.r.slice(0, 3).every((x) => x === null) && ref.r.slice(3).every((x) => x === 0) && ref.d && ref.n, JSON.stringify(ref));
    const hostile = await E(page, (a) => { const d0 = a.save.dust; const n0 = a.save.items.length; const r = [a.vendorBuy('sparkwand', 4), a.vendorBuy('sparkwand', 12), a.vendorBuy('nope', 1), a.vendorBuy('__proto__', 1), a.vendorBuy('sparkwand', '1')]; return { r, same: a.save.dust === d0 && a.save.items.length === n0 }; });
    check('items not on the list (T4, T12, unknown ids, hostile input) cannot be bought', hostile.r.every((x) => x === 0) && hostile.same, JSON.stringify(hostile));
    const poor = await E(page, (a, w) => { a.save.dust = 3; w.nexus.stall.open(); const b = document.querySelector('#rw-nx-stall button[data-vbuy="sparkwand:1"]'); const r = a.vendorBuy('sparkwand', 1); return { dis: b.disabled, label: b.getAttribute('aria-label'), r, dust: a.save.dust }; });
    check('without enough dust the buy button is disabled (says why) and buying changes nothing', poor.dis && /not enough dust/.test(poor.label) && poor.r === 0 && poor.dust === 3, JSON.stringify(poor));
    await E(page, (a, w) => { a.save.dust = 100; a.onSave(a.save); w.nexus.stall.open(); });
    // the Forge from the stall
    await page.click('#rw-nx-forge');
    const fg = await E(page, (a, w) => ({ nx: w.nexus.isOpen(), panel: a.panel, bp: !document.getElementById('realm-backpack').classList.contains('hidden'), forge: !!document.getElementById('realm-bp-forge'), uid: a._forgeUid, eq: a.save.eq.weapon }));
    check('the stall button opens the backpack Forge (Nexus closed, the equipped weapon\'s Forge section open)', !fg.nx && fg.panel === 'bp' && fg.bp && fg.forge && fg.uid === fg.eq, JSON.stringify(fg));
    // the classic shard shop is one tap from the stall (players report: 'cannot buy from the shop in the Realm': dust starts at 0, so the dust stall alone sells nothing)
    const snapSave = await E(page, (a) => JSON.stringify(a.save));
    await E(page, (a, w) => { a.setPaused(false); a.save.shards = 5000; a.save.dust = 0; a.save.bestWave = 5; a.save.level = 20; a.save.items = []; a.onSave(a.save); w.nexus.open(); w.nexus.stall.open(); });
    check('the stall shows a Shop (shards) button and a calm no-dust note', await page.isVisible('#rw-nx-shop') && /No dust yet/.test(await page.textContent('#rw-nx-stall')));
    await page.click('#rw-nx-shop');
    const shp = await E(page, (a, w) => ({ nx: w.nexus.isOpen(), panel: a.panel, btn: document.querySelectorAll('#realm-shop-body button[data-buy]').length }));
    check('the Shop button closes the Nexus and opens the classic shop with buy buttons', !shp.nx && shp.panel === 'shop' && shp.btn > 0, JSON.stringify(shp));
    const bought = await E(page, (a) => { const b = document.querySelector('#realm-shop-body button[data-buy]'); const sh0 = a.save.shards, n0 = a.save.items.length; b.click(); return { dsh: sh0 - a.save.shards, dn: a.save.items.length - n0 }; });
    check('buying in the shop spends shards and adds the item', bought.dsh > 0 && bought.dn === 1, JSON.stringify(bought));
    await E(page, (a, w, snap) => { a.setShop(false); const o = JSON.parse(snap); Object.keys(a.save).forEach((k) => { delete a.save[k]; }); Object.assign(a.save, o); a.onSave(a.save); }, snapSave);
    // the Blacksmith keeps the same stall
    await E(page, (a) => a.setPaused(false));
    const bs = await E(page, (a, w) => { const s = w.nexus.site; a.player.x = s.x - 20; a.player.y = s.y; w.nexus.open(); const l = w.nexus.talk('blacksmith'); return { l, open: w.nexus.stall.isOpen() }; });
    check('the Blacksmith opens the same stall (Forge button included)', bs.open && /Forge/.test(bs.l.text) && await page.isVisible('#rw-nx-forge'), JSON.stringify(bs));
    // the quest board and the stall never show together
    const qb = await E(page, (a, w) => { w.nexus.talk('quest'); return { stall: w.nexus.stall.isOpen(), board: !document.getElementById('rw-nx-board').classList.contains('hidden') }; });
    check('opening the quest board hides the stall', !qb.stall && qb.board, JSON.stringify(qb));
    await page.reload();
    await page.waitForFunction(() => window.__mm && window.__mm.arena && window.__mm.arena.active, null, { timeout: 30000 });
    const rl = await E(page, (a, w, n) => ({ dust: a.save.dust, it: a.save.items.find((x) => x.n === n) }), got.n);
    check('a reload keeps the bought item tiered (t 2) and the dust', rl.it && rl.it.t === 2 && rl.it.r === 0 && rl.dust === 100, JSON.stringify(rl));
    errs.push(...A.errors); dbHits += A.db.attempts(); await A.ctx.close(); }

  // ---------- a save without dust (no vendor ever used) loads fine and stays byte-identical ----------
  { const old = realm(); const A = await open(browser, '', old); const page = A.page;
    await enter(page);
    const r = await E(page, (a, w) => { w.nexus.talk('vendor'); const bs = Array.from(document.querySelectorAll('#rw-nx-stall button[data-vbuy]')); return { open: w.nexus.stall.isOpen(), all: bs.length > 0 && bs.every((b) => b.disabled), dust: a.save.dust }; });
    const st = await stored(page);
    check('a save without the vendor (no dust key) loads: the stall shows 0 dust, every buy disabled', r.open && r.all && r.dust === undefined, JSON.stringify(r));
    check('looking at the stall writes nothing new (no dust key added to the save)', !Object.prototype.hasOwnProperty.call(st, 'dust'), JSON.stringify(Object.keys(st)));
    errs.push(...A.errors); dbHits += A.db.attempts(); await A.ctx.close(); }

  // ---------- ?forge=0 hides the stall ----------
  { const A = await open(browser, '&forge=0', realm({ dust: 100 })); const page = A.page;
    await enter(page);
    const r = await E(page, (a, w) => { const l = w.nexus.talk('vendor'); const l2 = w.nexus.talk('blacksmith'); return { on: w.nexus.stall.on(), open: w.nexus.stall.isOpen(), el: !!document.getElementById('rw-nx-stall'), stock: a.vendorStock(), buy: a.vendorBuy('sparkwand', 1), forge: a.openForge(), l: l && l.text, l2: l2 && l2.text, dust: a.save.dust }; });
    check('?forge=0 hides the stall: not in the DOM, the Vendor and Blacksmith just talk, the API refuses', !r.on && !r.open && !r.el && r.stock === null && r.buy === 0 && r.forge === false && r.l && r.l2 && r.dust === 100, JSON.stringify(r));
    errs.push(...A.errors); dbHits += A.db.attempts(); await A.ctx.close(); }

  // ---------- phone 390x844: 44 px targets, no horizontal scroll ----------
  { const A = await open(browser, '', realm({ dust: 100 }), true); const page = A.page;
    await enter(page);
    await E(page, (a, w) => { w.nexus.talk('vendor'); });
    await page.click('#rw-nx-stall button[data-vsell="1"]');
    const s = await stall(page);
    const geo = await page.evaluate(() => { const r = document.getElementById('rw-nexus'); return { sw: r.scrollWidth, cw: r.clientWidth, dw: document.documentElement.scrollWidth, vw: window.innerWidth }; });
    const small = s.btns.filter((b) => b.h < 44 || b.w < 44);
    check('phone 390x844: every stall button (buy, sell back, confirm, Forge, close) is at least 44 x 44 px', s.shown && s.btns.length >= 15 && small.length === 0 && s.btns.some((b) => b.d.vyes) && s.btns.some((b) => b.id === 'rw-nx-forge'), JSON.stringify(small.slice(0, 4)));
    check('phone 390x844: no horizontal scroll in the Nexus with the stall open', geo.sw <= geo.cw && geo.dw <= geo.vw, JSON.stringify(geo));
    errs.push(...A.errors); dbHits += A.db.attempts(); await A.ctx.close(); }

  check('0 console errors', errs.length === 0, errs.slice(0, 3).join(' | '));
  check('0 database requests or sockets', dbHits === 0, String(dbHits));
  await browser.close();
  done();
})().catch((e) => { console.error(e); process.exit(1); });
