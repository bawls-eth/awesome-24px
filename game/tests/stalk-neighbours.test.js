// Stalk Market offline neighbours. Serve the repo root first:  python3 -m http.server 8516 &
// Run: BASE=http://localhost:8516/game/index.html node game/tests/stalk-neighbours.test.js
const { chromium } = require('playwright');
let failed = 0;
function check(name, cond, extra = '') { console.log((cond ? 'PASS ' : 'FAIL ') + name + (cond ? '' : ' ' + extra)); if (!cond) failed++; }
const ORIGIN = (process.env.BASE || 'http://localhost:8440/game/index.html').replace(/\/game\/index\.html.*$/, '');
const PAGE = ORIGIN + '/game/games/stalk/index.html';
const KEY = 'pixeltown-stalk-v1';
const M = require('../shared/mm-stalk-market.js');

async function open(browser, opts, query, init) {
  const ctx = await browser.newContext(opts);
  const page = await ctx.newPage();
  const errors = [], reqs = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  page.on('request', (r) => reqs.push(r.url()));
  if (init !== undefined) await page.addInitScript(([k, v]) => { if (!sessionStorage.seeded) { sessionStorage.seeded = '1'; localStorage.setItem(k, v); } }, [KEY, init]);
  await page.goto(PAGE + (query || '?test=1&week=100'));
  await page.waitForFunction(() => window.__stalk);
  return { ctx, page, errors, reqs };
}

(async () => {
  // pure rules
  check('three neighbours, deterministic prices', M.NEIGHBOURS.length === 3 && JSON.stringify(M.neighbourOffers(100, 5)) === JSON.stringify(M.neighbourOffers(100, 5)));
  check('different neighbours/weeks differ', M.neighbourWeek('pip', 100).sell.join() !== M.neighbourWeek('maple', 100).sell.join() && M.neighbourWeek('pip', 100).sell.join() !== M.neighbourWeek('pip', 101).sell.join());
  check('prices bounded 1..MAX_PRICE over 200 weeks', (() => { for (let w = 0; w < 200; w++) for (let s = 1; s < 13; s++) for (const n of M.NEIGHBOURS) { const p = M.neighbourPrice(n.id, w, s); if (!(p >= 1 && p <= M.MAX_PRICE)) return false; } return true; })());
  check('exactly one best offer Mon-Sat, none on Sunday', M.neighbourOffers(100, 4).filter((o) => o.best).length === 1 && M.neighbourOffers(100, 0).every((o) => !o.best && o.price === 0));
  check('best offer has the max price', (() => { const o = M.neighbourOffers(100, 6); return o.find((x) => x.best).price === Math.max.apply(null, o.map((x) => x.price)); })());
  const wk = M.generateWeek(100);
  const base = M.buy(M.syncWeek(M.defaultSave(), 100).save, wk, 0, 10).save;
  const r = M.sellToNeighbour(base, 'maple', 100, 3, 10);
  check('sale pays price*qty minus the fixed fee', r.ok && r.gain === 10 * M.neighbourPrice('maple', 100, 3) - M.NEIGHBOUR_FEE && r.save.holdings === 0 && r.save.balance === base.balance + r.gain);
  check('rejects unknown neighbour, Sunday, too many, zero', ['x', 'pip'].map((id, i) => M.sellToNeighbour(base, id, 100, i ? 0 : 3, 1).ok).every((v) => !v) && !M.sellToNeighbour(base, 'pip', 100, 3, 11).ok && !M.sellToNeighbour(base, 'pip', 100, 3, 0).ok);
  check('a deal that would not cover the fee is refused', M.sellToNeighbour(base, 'pip', 100, 3, 0).ok === false && (() => { const one = M.buy(M.syncWeek(M.defaultSave(), 100).save, wk, 0, 1).save; const id = M.NEIGHBOURS.find((n) => M.neighbourPrice(n.id, 100, 1) <= M.NEIGHBOUR_FEE); return id ? M.sellToNeighbour(one, id.id, 100, 1, 1).reason === 'fee' : true; })());

  const browser = await chromium.launch();
  const d = await open(browser, { viewport: { width: 1000, height: 700 } });
  const p = d.page;
  check('Sunday: three neighbours listed, selling disabled', (await p.$$('#nb-list li')).length === 3 && await p.evaluate(() => [...document.querySelectorAll('.nb-sell')].every((b) => b.disabled)));
  await p.evaluate(() => window.__stalk.buy(10));
  await p.evaluate(() => window.__stalk.setTime(100, 3));
  const offers = M.neighbourOffers(100, 3), best = offers.find((o) => o.best);
  check('the best neighbour is marked in text', (await p.textContent('#nb-list li.best')).includes(best.name) && (await p.textContent('#nb-list li.best')).includes('best price today'));
  check('prices shown match the model', await p.evaluate((o) => o.every((x) => document.querySelector('[data-nb=' + x.id + '] .tag').textContent.startsWith(x.price + ' bells')), offers));
  const before = await p.evaluate(() => window.__stalk.save.balance);
  await p.click('[data-nb=' + best.id + '] .nb-sell');
  check('selling to the best neighbour pays price minus fee', await p.evaluate(([b, price, fee]) => window.__stalk.save.balance === b + 10 * price - fee && window.__stalk.save.holdings === 0, [before, best.price, M.NEIGHBOUR_FEE]));
  check('earned counts toward the week profit', await p.evaluate(([price, fee]) => window.__stalk.save.earned === 10 * price - fee, [best.price, M.NEIGHBOUR_FEE]));
  check('message mentions the fee', (await p.textContent('#msg')).includes('fee'));
  check('sell cue played', await p.evaluate(() => window.__stalk.sounds.slice(-1)[0] === 'levelup'));
  await p.reload(); await p.waitForFunction(() => window.__stalk);
  check('persistence: balance and week survive reload', await p.evaluate(([b, price, fee]) => window.__stalk.save.balance === b + 10 * price - fee, [before, best.price, M.NEIGHBOUR_FEE]));
  check('no network except the local server, no console errors', d.errors.length === 0 && d.reqs.every((u) => u.startsWith(ORIGIN + '/') || u.startsWith('data:')), d.errors.join('|'));
  await d.ctx.close();

  // corrupt save
  const c = await open(browser, { viewport: { width: 800, height: 600 } }, undefined, '[1,2');
  check('corrupt save: neighbours still render', (await c.page.$$('#nb-list li')).length === 3 && c.errors.length === 0);
  await c.ctx.close();

  // phone
  const ph = await open(browser, { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true }, '?test=1&week=100');
  await ph.page.evaluate(() => { window.__stalk.buy(10); window.__stalk.setTime(100, 5); });
  check('phone: no horizontal scroll', await ph.page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth));
  check('phone: neighbour buttons >= 44 px and inside the screen', await ph.page.evaluate(() => [...document.querySelectorAll('.nb-sell')].every((b) => { const r = b.getBoundingClientRect(); return r.height >= 44 && r.width >= 44 && r.right <= window.innerWidth; })));
  const bp = M.neighbourOffers(100, 5).find((o) => o.best);
  await ph.page.tap('[data-nb=' + bp.id + '] .nb-sell');
  check('phone: tap sells to the neighbour', await ph.page.evaluate(() => window.__stalk.save.holdings === 0));
  check('no console errors (phone)', ph.errors.length === 0, ph.errors.join('|'));
  await ph.ctx.close();

  await browser.close();
  console.log(failed ? `${failed} FAILED` : 'ALL PASSED');
  process.exitCode = failed ? 1 : 0;
})();
