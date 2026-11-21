// Lakeside Angler bait economy (fish market, bait types, caps). Serve the repo root: python3 -m http.server 8514 &
// Run: BASE=http://localhost:8514/game/index.html NODE_PATH=$(npm root -g) node game/tests/angler-economy.test.js
const { chromium } = require('playwright');
const { check, done } = require('./helpers');
const ORIGIN = (process.env.BASE || 'http://localhost:8440/game/index.html').replace(/\/game\/index\.html.*$/, '');
const URL = (q) => ORIGIN + '/game/games/angler/index.html?test=1' + (q || '');
const KEY = 'pixeltown-angler-v1';

async function open(browser, q, opts, init) {
  const ctx = await browser.newContext(opts || { viewport: { width: 1000, height: 700 } });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  if (init) await page.addInitScript(init);
  await page.goto(URL(q));
  await page.waitForFunction(() => window.__angler);
  return { ctx, page, errors };
}
const seedSave = (o) => `if(!sessionStorage.s){sessionStorage.s=1;localStorage.setItem(${JSON.stringify(KEY)}, ${JSON.stringify(JSON.stringify(o))});}`;
// cast at the current spot with a forced fish and win the reel; returns outcome
const catchFish = (page, id) => page.evaluate((f) => {
  const a = window.__angler;
  a.forceFish(f); a.tap(); a.advance(a.bite.wait + 0.2); a.tap();
  for (let i = 0; i < 4000 && a.state === 'reeling'; i++) { a.setHold(a.reel.tension < a.reel.pos); a.advance(1 / 30); }
  a.setHold(false);
  const o = a.result && a.result.outcome; a.dismiss(); return o;
}, id);

(async () => {
  const browser = await chromium.launch();

  // catches fill the market stock; selling pays fixed prices
  let p = await open(browser, '&seed=e1&date=2026-07-15');
  check('fresh save: no bells, plain bait selected', await p.page.evaluate(() => __angler.market.bells === 0 && __angler.market.baitType === 'plain'));
  const o1 = await catchFish(p.page, 'bluegill'); const o2 = await catchFish(p.page, 'bluegill');
  const stock = await p.page.evaluate(() => __angler.market.stock.bluegill || 0);
  check('caught fish go into the market stock', o1 === 'caught' && o2 === 'caught' && stock === 2, o1 + o2 + stock);
  await p.page.click('#market-btn');
  check('market lists the fish with the fixed price', /Bluegill x2 \(6 bells each\)/.test(await p.page.textContent('#market-sell')));
  await p.page.click('#market-sell [data-act=sell1]');
  check('sell 1 pays 6 bells and updates the status bar', await p.page.evaluate(() => __angler.market.bells === 6 && document.getElementById('bells-val').textContent === '6'));
  await p.page.click('#market-sell [data-act=sellall]');
  check('sell all empties the stock', await p.page.evaluate(() => __angler.market.bells === 12 && !__angler.market.stock.bluegill));
  check('market buy of an unaffordable bait does nothing', await p.page.evaluate(() => __angler.market.buy('rare', 1) === false && __angler.market.bells === 12));
  await p.page.evaluate(() => __angler.market.buy('plain', 1));
  check('buying plain bait spends 10 bells', await p.page.evaluate(() => __angler.market.bells === 2 && __angler.bait >= 1));
  const saved = JSON.parse(await p.page.evaluate((k) => localStorage.getItem(k), KEY));
  check('economy saved additively under pixeltown-angler-v1', saved.bells === 2 && saved.caught.bluegill.n === 2);
  await p.page.reload(); await p.page.waitForFunction(() => window.__angler);
  check('bells persist across reload', await p.page.evaluate(() => __angler.market.bells === 2));
  check('no console errors', p.errors.length === 0, p.errors.join(' | '));
  await p.ctx.close();

  // bait types have distinct effects
  p = await open(browser, '&seed=e2&date=2026-07-15', undefined, seedSave({ bells: 500, baits: { quick: 5, rare: 5, big: 5 }, baitType: 'quick', bait: 5 }));
  const wait = (type) => p.page.evaluate((t) => {
    const a = __angler; a.market.equip(t); a.tap();
    const w = a.bite.wait; const baseWait = null;
    a.advance(w + 0.2); a.tap(); a.setHold(true); a.advance(0.01); a.setHold(false);
    for (let i = 0; i < 4000 && a.state === 'reeling'; i++) { a.setHold(a.reel.tension < a.reel.pos); a.advance(1 / 30); }
    a.setHold(false); a.dismiss(); return w;
  }, type);
  // same seed per cast is not reproducible across types, so compare multipliers through the model
  check('quick bait waits less than plain bait (model)', await p.page.evaluate(() => MMAngler.BAITS.quick.waitMult < MMAngler.BAITS.plain.waitMult));
  const before = await p.page.evaluate(() => __angler.market.baits.quick);
  await p.page.evaluate(() => { __angler.tap(); });
  check('a cast with quick equipped spends one quick bait', await p.page.evaluate((b) => __angler.market.baits.quick === b - 1 && __angler.state === 'waiting', before));
  await p.page.evaluate(() => { const a = __angler; a.advance(a.bite.wait + 0.3); a.dismiss(); });
  const w1 = await wait('plain'), w2 = await wait('quick');
  check('both baits were consumed and casts resolved', await p.page.evaluate(() => __angler.market.baits.quick <= 4 && __angler.market.baits.quick >= 3 && __angler.bait >= 4), w1 + ' ' + w2);
  // rare lure: raises rare weights; big: bigger fish
  check('rare-lure bait lifts rare fish odds', await p.page.evaluate(() => {
    const c = { month: 7, hour: 12, weather: 'clear' }, pool = MMAngler.pool('pier', c).filter((f) => f.rarity >= 3);
    const s = (g) => pool.reduce((x, f) => x + MMAngler.weightOf(f, c, g), 0);
    return s({ baitType: 'rare' }) > 2 * s({});
  }));
  const sizes = await p.page.evaluate(() => {
    const out = {}; ['plain', 'big'].forEach((t) => { let tot = 0, n = 0; for (let i = 0; i < 100; i++) { tot += MMAngler.rollSize(MMRng.create('s' + i).next, MMAngler.BY_ID.carp, { big: t === 'big' }); n++; } out[t] = tot / n; });
    return out;
  });
  check('big-fish bait gives larger fish on average', sizes.big > sizes.plain + 5, JSON.stringify(sizes));
  await p.page.evaluate(() => __angler.market.equip('big')); await p.page.reload(); await p.page.waitForFunction(() => window.__angler);
  check('equipped bait type persists', await p.page.evaluate(() => __angler.market.baitType === 'big'));
  check('no console errors (bait)', p.errors.length === 0, p.errors.join(' | '));
  await p.ctx.close();

  // hard caps
  p = await open(browser, '&seed=e3', undefined, seedSave({ bells: 99999, bait: 99, baits: { quick: 99 }, stock: { koi: 99 } }));
  check('caps hold at load: 99 bait, 99999 bells', await p.page.evaluate(() => __angler.market.bells === 99999 && __angler.bait === 99));
  check('cannot buy past the bait cap', await p.page.evaluate(() => __angler.market.buy('quick', 1) === false && __angler.market.baits.quick === 99 && __angler.market.bells === 99999));
  check('cannot sell past the bell cap (stock kept)', await p.page.evaluate(() => __angler.market.sell('koi', 1) === false && __angler.market.stock.koi === 99));
  check('?bait=500 is still clamped to 99', await (async () => { const c = await open(browser, '&bait=500'); const v = await c.page.evaluate(() => __angler.bait); await c.ctx.close(); return v === 99; })());
  await p.ctx.close();

  // corrupt economy data
  for (const bad of ['{"bells":"lots","stock":7,"baits":{"quick":-4,"evil":9},"baitType":"<x>"}', '{"bells":1e99,"stock":{"koi":1e9,"nope":3,"old_whiskers":2},"baits":[1],"baitType":5}', '[[1]]']) {
    const c = await open(browser, '', undefined, `localStorage.setItem(${JSON.stringify(KEY)}, ${JSON.stringify(bad)})`);
    const ok = await c.page.evaluate(() => { const m = __angler.market; return m.bells >= 0 && m.bells <= 99999 && ['plain', 'quick', 'rare', 'big'].includes(m.baitType) && Object.keys(m.stock).every((k) => m.stock[k] >= 1 && m.stock[k] <= 99 && k !== 'old_whiskers' && k !== 'nope') && m.baits.quick >= 0; });
    await c.page.click('#market-btn');
    check('corrupt economy save recovers: ' + bad.slice(0, 18), ok && c.errors.length === 0, c.errors.join(' '));
    await c.ctx.close();
  }

  // phone
  const ph = await open(browser, '&seed=ph', { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 }, seedSave({ bells: 80, stock: { koi: 2, minnow: 3 } }));
  await ph.page.click('#market-btn');
  check('phone: no horizontal scroll in the market', await ph.page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth));
  check('phone: market buttons are at least 44px', await ph.page.$$eval('#market .btn', (b) => b.length >= 8 && b.every((x) => x.getBoundingClientRect().height >= 44 && x.getBoundingClientRect().width >= 44)));
  check('phone: no console errors', ph.errors.length === 0, ph.errors.join(' | '));
  await ph.ctx.close();

  await browser.close();
  done();
})();
