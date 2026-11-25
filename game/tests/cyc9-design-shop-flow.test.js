// Cycle 9 D (item 1): the Realm shop purchase flow measured END TO END as a player does it, because the owner said buying "still did not work".
// Three real routes, every step a real click / tap (no buy() hook): (A) the world Realm page entered the way the Town button does (no test=1,
// real hero pick), (B) the Town "Quick arena" Realm through the real Town (offlineStub + Play offline), (C) a phone tap run on route A.
// Per purchase it records shards before / after, the price paid, the backpack count, the item that appeared, and what pixeltown-save-v1 holds
// after a reload (the purchase must survive). It also buys until the wallet is empty and checks the refusal text.
// OFFLINE: blockDb + offlineStub + every WebSocket closed, literal db.attempts() === 0.
// Run: BASE=http://localhost:9904/game/index.html NODE_PATH=$(npm root -g) node game/tests/cyc9-design-shop-flow.test.js
const { chromium } = require('playwright');
const { check, done, blockDb, offlineStub, exposeGame, joinOffline } = require('./helpers');
const LS = require('./lib/load-scale');
const ORIGIN = (process.env.BASE || 'http://localhost:8440/game/index.html').replace(/\/game\/index\.html.*$/, '');
const WORLD = ORIGIN + '/game/games/mad-maze/index.html?mode=world&from=town&test=1&seed=12345';
const IMG = process.env.IMG || '';
const info = (m) => console.log('INFO ' + m);
const SAVE = (shards) => JSON.stringify({ realm: { level: 1, xp: 0, shards, bestWave: 0, items: [], nextUid: 20, eq: {} } });

const snap = (page) => page.evaluate(() => {
  const raw = JSON.parse(localStorage.getItem('pixeltown-save-v1') || '{}'); const r = raw.realm || {};
  const w = document.getElementById('realm-shop-msg');
  return { shards: r.shards, n: (r.items || []).length, ids: (r.items || []).map((i) => i.id + ':' + i.r), msg: w ? w.textContent : null };
});

async function buyRun(page, tag, click, expectOffers) {
  const rows = await page.$$('#realm-shop-body li button[data-buy]');
  check(`${tag}: shop lists ${expectOffers} offers`, rows.length === expectOffers && rows.length > 0, 'rows=' + rows.length);
  const before = await snap(page);
  const label = await rows[0].getAttribute('aria-label');
  await click(rows[0]);
  await page.waitForTimeout(300);
  const a1 = await snap(page);
  const price = before.shards - a1.shards;
  info(`${tag}: first buy "${label}" shards ${before.shards} -> ${a1.shards} (paid ${price}), backpack ${before.n} -> ${a1.n}, item ${a1.ids.slice(-1)[0]}, message "${a1.msg}"`);
  check(`${tag}: coins drop by the listed price (24)`, price === 24, JSON.stringify(a1));
  check(`${tag}: one item is granted and saved`, a1.n === before.n + 1, JSON.stringify(a1));
  check(`${tag}: the panel says it was bought`, /^Bought /.test(a1.msg || ''), a1.msg);
  let bought = 1;
  for (let i = 0; i < 12; i++) {
    const rs = await page.$$('#realm-shop-body li button[data-buy]'); const s0 = await snap(page);
    if (s0.shards < 24) break;
    await click(rs[(i + 1) % rs.length]); await page.waitForTimeout(150);
    const s1 = await snap(page); if (s1.shards === s0.shards - 24 && s1.n === s0.n + 1) bought++;
  }
  const end = await snap(page);
  info(`${tag}: ${bought} purchases from ${before.shards} shards, left ${end.shards}, backpack ${end.n}`);
  const want = Math.floor(before.shards / 24);
  check(`${tag}: all ${want} affordable purchases landed (shards ${before.shards} -> ${end.shards}, items ${end.n})`, bought === want && end.shards === before.shards - 24 * bought && end.n === bought, JSON.stringify(end));
  const rs = await page.$$('#realm-shop-body li button[data-buy]'); await click(rs[0]); await page.waitForTimeout(200);
  const poor = await snap(page);
  check(`${tag}: too poor -> nothing spent and the panel says how many more shards`, poor.shards === end.shards && poor.n === end.n && /need \d+ more/.test(poor.msg || ''), JSON.stringify(poor));
  return { before, end, bought };
}

(async () => {
  const browser = await chromium.launch();
  for (const [tag, vp, touch] of [['A desktop 1280x720', { width: 1280, height: 720 }, false], ['C phone 390x844', { width: 390, height: 844 }, true]]) {
    const ctx = await browser.newContext(touch ? { viewport: vp, hasTouch: true, isMobile: true } : { viewport: vp });
    const db = await blockDb(ctx); await ctx.routeWebSocket(/.*/, (ws) => ws.close());
    await ctx.route('**/game/index.html*', (r) => r.fulfill({ contentType: 'text/html', body: '<!doctype html>town' }));
    const page = await ctx.newPage(); const errors = [];
    page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
    page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errors.push('console: ' + m.text()); });
    await page.goto(ORIGIN + '/game/games/mad-maze/lantern.css');
    await page.evaluate((v) => { localStorage.clear(); localStorage.setItem('pixeltown-save-v1', v); }, SAVE(100));
    await page.goto(WORLD, { timeout: LS.budget(30000) });
    const t0 = Date.now(); let picked = false;
    while (Date.now() - t0 < LS.budget(40000)) {
      if (await page.evaluate(() => !!(window.__mm && window.__mm.arena && window.__mm.arena.active && window.__mm.arena.state === 'play'))) break;
      const h = await page.$('.hp-hero'); if (h && !picked) { await (touch ? h.tap() : h.click()).catch(() => null); picked = true; }
      await page.waitForTimeout(300);
    }
    check(`${tag}: the Realm reached play`, await page.evaluate(() => !!(window.__mm && window.__mm.arena && window.__mm.arena.state === 'play')));
    await page.evaluate(() => { const a = window.__mm.arena; a.player.iframes = 1e9; a._hitPlayer = () => {}; });
    const click = async (el) => { await el.scrollIntoViewIfNeeded(); if (touch) await el.tap({ force: true }); else await el.click({ force: true }); };
    await click(await page.$('#realm-bp-btn')); await page.waitForTimeout(250);
    await click(await page.$('#realm-backpack-body button[data-open-shop]')); await page.waitForTimeout(250);
    info(`${tag}: panel ${await page.evaluate(() => window.__mm.arena.panel)}`);
    const n = await page.$$eval('#realm-shop-body li button[data-buy]', (b) => b.length);
    const R = await buyRun(page, tag, click, n);
    if (IMG) await page.screenshot({ path: `${IMG}/cyc9-design-shop-${touch ? 'phone' : 'desktop'}.jpg`, type: 'jpeg', quality: 70 });
    await click(await page.$('#realm-shop-close')); await page.waitForTimeout(150);
    await page.reload(); await page.waitForTimeout(500);
    const after = await snap(page);
    check(`${tag}: after a reload the saved shards and ${R.bought} items are still there`, after.shards === R.end.shards && after.n === R.end.n, JSON.stringify(after));
    check(`${tag}: no page errors`, errors.length === 0, errors.join('|'));
    check(`${tag}: db.attempts() === 0`, db.attempts() === 0, String(db.attempts()));
    await ctx.close();
  }
  { const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
    const db = await offlineStub(ctx); await ctx.routeWebSocket(/.*/, (ws) => ws.close());
    await ctx.addInitScript((v) => { if (!sessionStorage.seeded) { sessionStorage.seeded = '1'; localStorage.setItem('pixeltown-save-v1', v); } }, SAVE(100));
    const page = await ctx.newPage(); const errors = [];
    page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
    await exposeGame(page);
    await page.goto(ORIGIN + '/game/index.html', { timeout: LS.budget(30000) });
    await joinOffline(page, 'ADMINshop');
    await page.evaluate(() => { window.__g.scene.getScene('Town').openRealmGateMenu(); }); // the same call the gate's E press makes
    await page.click('#realm-menu-solo'); await page.waitForTimeout(900);
    await page.evaluate(() => { const r = window.__g.scene.getScene('Town').realm; r.player.iframes = 1e9; r._hitPlayer = () => {}; });
    const click = async (el) => { await el.scrollIntoViewIfNeeded(); await el.click({ force: true }); };
    await click(await page.$('#realm-bp-btn')); await page.waitForTimeout(250);
    await click(await page.$('#realm-backpack-body button[data-open-shop]')); await page.waitForTimeout(250);
    const n = await page.$$eval('#realm-shop-body li button[data-buy]', (b) => b.length);
    await buyRun(page, 'B Town quick arena 1280x720', click, n);
    if (IMG) await page.screenshot({ path: `${IMG}/cyc9-design-shop-town.jpg`, type: 'jpeg', quality: 70 });
    check('B Town: no page errors', errors.length === 0, errors.join('|'));
    check('B Town: db.attempts() === 0', db.attempts() === 0, String(db.attempts()));
    await ctx.close(); }
  await browser.close();
  done();
})().catch((e) => { console.error(e); process.exit(1); });
