// Stalk Market page. Serve the repo root first:  python3 -m http.server 8462 &
// Run: BASE=http://localhost:8462/game/index.html node game/tests/stalk-page.test.js
// No network beyond the local server; nothing touches Firebase.
const { chromium } = require('playwright');
let failed = 0;
function check(name, cond, extra = '') { console.log((cond ? 'PASS ' : 'FAIL ') + name + (cond ? '' : ' ' + extra)); if (!cond) failed++; }
const ORIGIN = (process.env.BASE || 'http://localhost:8440/game/index.html').replace(/\/game\/index\.html.*$/, '');
const PAGE = ORIGIN + '/game/games/stalk/index.html';
const KEY = 'pixeltown-stalk-v1';

async function open(browser, opts, query, init) {
  const ctx = await browser.newContext(opts);
  const page = await ctx.newPage();
  const errors = [], reqs = [], bad = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  page.on('request', (r) => reqs.push(r.url()));
  page.on('response', (r) => { if (r.status() >= 400) bad.push(r.status() + ' ' + r.url()); });
  if (init !== undefined) await page.addInitScript(([k, v]) => { if (!sessionStorage.seeded) { sessionStorage.seeded = '1'; localStorage.setItem(k, v); } }, [KEY, init]);
  await page.goto(PAGE + (query || '?test=1&week=100'));
  await page.waitForFunction(() => window.__stalk);
  return { ctx, page, errors, reqs, bad };
}
const stored = (p) => p.evaluate((k) => JSON.parse(localStorage.getItem(k)), KEY);

(async () => {
  const browser = await chromium.launch();
  const d = await open(browser, { viewport: { width: 1000, height: 700 } });
  const p = d.page;
  check('page loads with title', (await p.title()) === 'Stalk Market - Pixeltown');
  check('Sunday: buy enabled, sell disabled', await p.evaluate(() => !document.getElementById('buy1').disabled && document.getElementById('sell1').disabled && document.getElementById('sellall').disabled));
  const bp = await p.evaluate(() => window.__stalk.wk.buyPrice);
  check('price card shows the Sunday buy price', (await p.textContent('#price')) === String(bp));
  check('first-run hint card shows, then dismisses and persists', await p.isVisible('#hint') && (await p.click('#hint-ok'), !(await p.isVisible('#hint'))) && (await stored(p)).hint === true);

  await p.click('#buy10');
  check('buy 10 deducts bells and adds stalks', await p.evaluate((b) => window.__stalk.save.holdings === 10 && window.__stalk.save.balance === 2000 - 10 * b, bp));
  check('owned and bells DOM updated via textContent', (await p.textContent('#st-owned')).startsWith('10 /'));
  await p.keyboard.press('b');
  check('keyboard B buys 1', await p.evaluate(() => window.__stalk.save.holdings === 11));
  await p.keyboard.press('s');
  check('keyboard S cannot sell on Sunday (message, no change)', await p.evaluate(() => window.__stalk.save.holdings === 11) && (await p.textContent('#msg')).includes('Sunday'));

  await p.evaluate(() => window.__stalk.setTime(100, 3));
  const price3 = await p.evaluate(() => window.__stalk.wk.sell[2]);
  check('price shows slot 3 sell price, buying locked', (await p.textContent('#price')) === String(price3) && await p.evaluate(() => document.getElementById('buy1').disabled));
  const before = await p.evaluate(() => window.__stalk.save.balance);
  await p.click('#sell1');
  check('sell 1 pays the slot price', await p.evaluate(([b, pr]) => window.__stalk.save.balance === b + pr && window.__stalk.save.holdings === 10, [before, price3]));
  await p.click('#sellall');
  check('sell all empties the stall; profit shown', await p.evaluate(() => window.__stalk.save.holdings === 0 && window.__stalk.save.earned === 11 * window.__stalk.wk.sell[2]));
  check('profit text matches math', await p.evaluate(() => { const s = window.__stalk.save; const v = s.earned - s.invested; return document.getElementById('st-profit').textContent.replace(/[+,]/g, '') === String(v); }));
  check('chart canvas drawn (non-empty)', await p.evaluate(() => { const c = document.getElementById('chart'); const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data; for (let i = 3; i < d.length; i += 4) if (d[i]) return true; return false; }));
  await p.evaluate(() => window.__stalk.step(1));
  check('step advances one slot', await p.evaluate(() => window.__stalk.slot === 4));
  await p.evaluate(() => window.__stalk.setTime(100, 12)); await p.evaluate(() => window.__stalk.step(1));
  check('stepping past Sat PM starts the next week at Sunday', await p.evaluate(() => window.__stalk.week === 101 && window.__stalk.slot === 0));

  // spoilage on rollover
  await p.evaluate(() => { window.__stalk.setTime(200, 0); window.__stalk.buy(5); window.__stalk.setTime(200, 6); });
  check('holdings survive within a week', await p.evaluate(() => window.__stalk.save.holdings === 5));
  await p.evaluate(() => window.__stalk.setTime(201, 0));
  check('holdings spoil in the next week, loss recorded, pattern revealed', await p.evaluate(() => {
    const s = window.__stalk.save; return s.holdings === 0 && s.week === 201 && s.last && s.last.week === 200 && s.last.profit < 0 && !document.getElementById('last-card').hidden && document.getElementById('last-line').textContent.includes('Week 200');
  }));
  check('spoilage message shown', (await p.textContent('#msg')).includes('spoiled'));
  const sv = await stored(p);
  check('persisted only under pixeltown-stalk-v1 with known keys', Object.keys(sv).sort().join() === 'balance,best,earned,goals,hint,history,holdings,invested,last,medals,played,total,v,week,wkBest', Object.keys(sv).join());
  await p.reload(); await p.waitForFunction(() => window.__stalk);
  check('reload keeps history from storage (URL week 100 differs, so it rolls over)', await p.evaluate(() => window.__stalk.save.week === 100 && window.__stalk.save.history.some((h) => h.week === 200)));
  check('no console errors / no 404s / zero off-origin', d.errors.length === 0 && d.bad.length === 0 && d.reqs.every((u) => u.startsWith(ORIGIN + '/') || u.startsWith('data:')), d.errors.concat(d.bad).join('|'));
  check('no test hook without ?test=1', await (async () => { const n = await open(browser, { viewport: { width: 800, height: 600 } }, '?test=1'); await n.page.goto(PAGE); await n.page.waitForSelector('#price'); const r = await n.page.evaluate(() => typeof window.__stalk === 'undefined'); await n.ctx.close(); return r; })());
  await d.ctx.close();

  // week override clamps; real calendar by default
  const w1 = await open(browser, { viewport: { width: 800, height: 600 } }, '?test=1&week=12.9');
  check('?week=12.9 clamps to integer 12', await w1.page.evaluate(() => window.__stalk.week === 12));
  await w1.ctx.close();
  const w2 = await open(browser, { viewport: { width: 800, height: 600 } }, '?test=1&week=-4');
  check('?week=-4 clamps to 0', await w2.page.evaluate(() => window.__stalk.week === 0));
  await w2.ctx.close();

  // corrupt / hostile saves
  const c1 = await open(browser, { viewport: { width: 800, height: 600 } }, undefined, '{not json');
  check('corrupt save loads clean', await c1.page.evaluate(() => window.__stalk.save.balance === 2000 && window.__stalk.save.holdings === 0) && c1.errors.length === 0);
  await c1.ctx.close();
  const c2 = await open(browser, { viewport: { width: 800, height: 600 } }, undefined, JSON.stringify({ balance: 1e99, holdings: 99999, week: 100, history: [{ week: 1, pattern: '<img src=x onerror=alert(1)>', profit: 1 }], last: { week: 3, pattern: '<b>x</b>', profit: 2 }, evil: 1 }));
  check('hostile save sanitised and rewritten', await c2.page.evaluate((k) => { const s = window.__stalk.save, raw = JSON.parse(localStorage.getItem(k)); return s.balance === 99999999 && s.holdings === 200 && s.history.length === 0 && s.last === null && !('evil' in raw); }, KEY) && c2.errors.length === 0);
  check('holdings kept when the saved week equals the current week', await c2.page.evaluate(() => window.__stalk.save.holdings === 200));
  await c2.ctx.close();

  // real-week change resets holdings
  const c3 = await open(browser, { viewport: { width: 800, height: 600 } }, '?test=1&week=300', JSON.stringify({ week: 299, holdings: 20, invested: 2000, balance: 100 }));
  check('saved holdings from an older week spoil on load', await c3.page.evaluate(() => window.__stalk.save.holdings === 0 && window.__stalk.save.week === 300 && window.__stalk.save.balance === 1000));
  await c3.ctx.close();

  // reduced motion
  const rm = await open(browser, { viewport: { width: 800, height: 600 }, reducedMotion: 'reduce' });
  check('reduced motion flag respected', await rm.page.evaluate(() => window.__stalk.reduced === true));
  await rm.ctx.close();

  // phone, hub link
  const ph = await open(browser, { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true }, '?test=1&week=100&from=hub');
  await ph.page.evaluate(() => { window.__stalk.buy(10); window.__stalk.setTime(100, 12); });
  check('phone: no horizontal scroll', await ph.page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth));
  check('phone: trade buttons are big (>=48 px) and visible', await ph.page.evaluate(() => ['buy1', 'buy10', 'sell1', 'sellall'].every((id) => { const r = document.getElementById(id).getBoundingClientRect(); return r.width >= 48 && r.height >= 48 && r.right <= window.innerWidth; })));
  check('header shows the Town link once (no duplicate) when not launched from the hub', await (await open(browser, { viewport: { width: 800, height: 600 } })).page.evaluate(() => [...document.querySelectorAll('#top a')].filter((a) => a.offsetParent !== null && /Town/.test(a.textContent)).length === 1));
  check('?from=hub back link goes to the hub', (await ph.page.getAttribute('#back', 'href')) === '../../hub/index.html' && (await ph.page.getAttribute('#town', 'href')) === '../../index.html');
  await ph.page.tap('#sellall');
  check('phone: tap sells', await ph.page.evaluate(() => window.__stalk.save.holdings === 0));
  check('no console errors (phone)', ph.errors.length === 0, ph.errors.join('|'));
  await ph.ctx.close();
  const nh = await open(browser, { viewport: { width: 800, height: 600 } }, '?test=1');
  check('without ?from the back link goes to the town', (await nh.page.getAttribute('#back', 'href')) === '../../index.html');
  await nh.ctx.close();

  // slice 1: advisor, animated chart, sound cues
  const a1 = await open(browser, { viewport: { width: 800, height: 600 } }, '?test=1&week=100');
  check('advisor says "need two prices" on Sunday', (await a1.page.textContent('#advisor-text')).includes('need two'));
  await a1.page.evaluate(() => window.__stalk.setTime(100, 2));
  check('advisor gives an estimate after two prices', /estimate/.test(await a1.page.textContent('#advisor-text')) && (await a1.page.$$('#advisor-bars li')).length === 4);
  await a1.page.evaluate(() => window.__stalk.setTime(100, 0)); await a1.page.click('#buy1');
  await a1.page.evaluate(() => window.__stalk.setTime(100, 3)); await a1.page.click('#sell1');
  check('buy and sell play sound cues through MMSfx names', await a1.page.evaluate(() => window.__stalk.sounds.join() === 'pickup,levelup'));
  await a1.page.evaluate(() => window.__stalk.step(1));
  check('chart animates a price change (not reduced)', await a1.page.evaluate(() => window.__stalk.anim.count > 0));
  await a1.ctx.close();
  const a2 = await open(browser, { viewport: { width: 800, height: 600 }, reducedMotion: 'reduce' }, '?test=1&week=100');
  await a2.page.evaluate(() => { window.__stalk.setTime(100, 4); window.__stalk.step(1); });
  check('reduced motion: chart is static, no animation frames', await a2.page.evaluate(() => window.__stalk.anim.count === 0 && !window.__stalk.anim.running));
  await a2.ctx.close();

  // slice 3: neighbours panel, goals, medal case present
  const n1 = await open(browser, { viewport: { width: 800, height: 600 } }, '?test=1&week=100');
  check('page lists neighbours, goal cards, medal case and all-time stats', await n1.page.evaluate(() => document.querySelectorAll('#nb-list li').length === 3 && document.querySelectorAll('#goals li').length === 3 && !!document.getElementById('medal-case') && !!document.getElementById('alltime')));
  await n1.ctx.close();

  await browser.close();
  console.log(failed ? `${failed} FAILED` : 'ALL PASSED');
  process.exitCode = failed ? 1 : 0;
})();
