// Stalk Market weekly goals, medal case, all-time stats. Serve the repo root first:  python3 -m http.server 8516 &
// Run: BASE=http://localhost:8516/game/index.html node game/tests/stalk-goals.test.js
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
  const errors = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  if (init !== undefined) await page.addInitScript(([k, v]) => { if (!sessionStorage.seeded) { sessionStorage.seeded = '1'; localStorage.setItem(k, v); } }, [KEY, init]);
  await page.goto(PAGE + (query || '?test=1&week=100'));
  await page.waitForFunction(() => window.__stalk);
  return { ctx, page, errors };
}
const stored = (p) => p.evaluate((k) => JSON.parse(localStorage.getItem(k)), KEY);
const done = (p) => p.evaluate(() => [...document.querySelectorAll('#goals li.done')].map((l) => l.getAttribute('data-goal')).sort().join());

(async () => {
  // pure rules
  const wk = M.generateWeek(100);
  const peakSlot = wk.sell.indexOf(Math.max.apply(null, wk.sell)) + 1;
  let s = M.syncWeek(M.defaultSave(), 100).save;
  s = M.buy(s, wk, 0, 10).save;
  check('goals start open', M.goalStatus(s, wk).every((g) => !g.done));
  s = M.sell(s, wk, peakSlot, 10).save;
  check('selling at the week peak completes the peak goal when profitable', wk.sell[peakSlot - 1] >= wk.buyPrice ? M.goalStatus(s, wk).find((g) => g.id === 'peak').done : true);
  const roll = M.syncWeek(M.latchGoals(s, wk), 101).save;
  check('rollover records goals, played and total; resets week goals', roll.history[0].goals === M.goalsDone(s, wk) && roll.played === 1 && roll.total === M.weekProfit(s) && roll.goals === 0 && roll.wkBest === 0);
  check('old save without new keys derives total/played from history', (() => { const o = M.cleanSave({ week: 5, history: [{ week: 1, pattern: 'random', profit: 30 }, { week: 2, pattern: 'random', profit: -10 }] }); return o.total === 20 && o.played === 2; })());

  const browser = await chromium.launch();
  const d = await open(browser, { viewport: { width: 1000, height: 700 } });
  const p = d.page;
  check('three goal cards shown, all open at the start', (await p.$$('#goals li')).length === 3 && (await done(p)) === '');
  await p.evaluate(() => window.__stalk.buy(10));
  // find a slot where selling is profitable
  const bestSlot = await p.evaluate(() => { const w = window.__stalk.wk; return w.sell.indexOf(Math.max.apply(null, w.sell)) + 1; });
  await p.evaluate((sl) => window.__stalk.setTime(100, sl), bestSlot);
  await p.click('#sellall');
  const prof = await p.evaluate(() => window.__stalk.save.earned - window.__stalk.save.invested);
  const expected = [prof >= 500 ? 'profit' : null, prof >= 0 ? 'even' : null, wk.sell[bestSlot - 1] >= wk.buyPrice ? 'peak' : null].filter(Boolean).sort().join();
  check('cards flip to done from real trades (' + expected + ')', (await done(p)) === expected, await done(p));
  check('done goals say "Done" in text, not just colour', await p.evaluate(() => [...document.querySelectorAll('#goals li')].every((l) => /^(Done|Open)\./.test(l.querySelector('.tag').textContent))));
  // history for the medal case
  await p.evaluate(() => { window.__stalk.setTime(101, 0); });
  check('last week appears in the medal case with its medal', await p.evaluate(() => document.querySelectorAll('#medals li').length === 1 && /^Week 100/.test(document.querySelector('#medals li strong').textContent)));
  check('all-time stats show played weeks and total', await p.evaluate(() => document.getElementById('at-played').textContent === '1' && document.getElementById('at-total').textContent.replace(/[+,]/g, '').startsWith(String(window.__stalk.save.total))));
  const sv = await stored(p);
  check('goal/stat keys persist and are additive', sv.played === 1 && typeof sv.total === 'number' && sv.v === 1 && 'goals' in sv);
  await p.reload(); await p.waitForFunction(() => window.__stalk);
  check('reload keeps medal case and stats', await p.evaluate(() => window.__stalk.save.played === 1 && document.querySelectorAll('#medals li').length === 1));
  check('no console errors', d.errors.length === 0, d.errors.join('|'));
  await d.ctx.close();

  // gold medal week shown
  const g = await open(browser, { viewport: { width: 800, height: 600 } }, '?test=1&week=51', JSON.stringify({ week: 50, invested: 1000, earned: 12000, balance: 5000, history: [{ week: 49, pattern: 'largeSpike', profit: 600, goals: 1 }] }));
  check('gold and bronze medals listed, best week updated', await g.page.evaluate(() => { const m = [...document.querySelectorAll('#medals li')].map((l) => l.getAttribute('data-medal')); return m.join() === 'gold,bronze' && document.getElementById('at-best').textContent.startsWith('11,000'); }));
  await g.ctx.close();

  // corrupt / hostile saves
  const c1 = await open(browser, { viewport: { width: 800, height: 600 } }, undefined, '{oops');
  check('corrupt save: goals and stats recover to defaults', await c1.page.evaluate(() => document.getElementById('at-played').textContent === '0' && document.querySelectorAll('#medals li').length === 0) && c1.errors.length === 0);
  await c1.ctx.close();
  const c2 = await open(browser, { viewport: { width: 800, height: 600 } }, undefined, JSON.stringify({ week: 100, goals: 99, wkBest: 1e9, total: 'x', played: -5, history: [{ week: 1, pattern: 'random', profit: 5, goals: '<b>' }] }));
  check('hostile goal fields are clamped', await c2.page.evaluate(() => { const s = window.__stalk.save; return s.goals >= 0 && s.goals <= 7 && s.wkBest <= 700 && s.total === 0 && s.played === 0 && s.history[0].goals === 0; }) && c2.errors.length === 0);
  await c2.ctx.close();

  // phone
  const ph = await open(browser, { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true }, '?test=1&week=51', JSON.stringify({ week: 50, invested: 1000, earned: 12000, balance: 5000, history: [{ week: 49, pattern: 'random', profit: 600 }] }));
  check('phone: no horizontal scroll with goals, medals and stats', await ph.page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth));
  check('phone: goal cards >= 44 px tall', await ph.page.evaluate(() => [...document.querySelectorAll('#goals li')].every((l) => l.getBoundingClientRect().height >= 44)));
  check('no console errors (phone)', ph.errors.length === 0, ph.errors.join('|'));
  await ph.ctx.close();

  await browser.close();
  console.log(failed ? `${failed} FAILED` : 'ALL PASSED');
  process.exitCode = failed ? 1 : 0;
})();
