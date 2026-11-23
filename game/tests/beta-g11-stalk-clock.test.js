// G-11 (b11-04 clock part, owner O-07 "clock fix is safe to ship"): the Stalk market keeps the furthest slot seen this week (save.seen,
// additive). A device clock moved back inside the week cannot reopen the Sunday buy and does not reveal later prices; it shows "Your device
// clock moved back" and pauses trading. A normal week rollover is unchanged. Local page only (blockDb), no chat, no writes elsewhere.
// Run: BASE=http://localhost:8440/game/index.html node game/tests/beta-g11-stalk-clock.test.js
const { chromium } = require('playwright');
const { check, done, blockDb } = require('./helpers');
const M = require('../shared/mm-stalk-market.js');
const ORIGIN = (process.env.BASE || 'http://localhost:8440/game/index.html').replace(/\/game\/index\.html.*$/, '');
const PAGE = ORIGIN + '/game/games/stalk/index.html';

(async () => {
  // node: old saves stay byte-identical through cleanSave; seen is kept when present
  const old = M.cleanSave({ balance: 500, week: 10 });
  check('node: an old save (no seen) cleans without a seen key', !('seen' in old));
  check('node: seen { w, s } is kept and clamped', JSON.stringify(M.cleanSave({ week: 10, seen: { w: 10, s: 99 } }).seen) === JSON.stringify({ w: 10, s: M.SLOTS - 1 }));

  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 900, height: 800 } });
  await blockDb(ctx);
  const page = await ctx.newPage(); const errors = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  await page.goto(PAGE + '?test=1&week=100&slot=0');
  await page.waitForFunction(() => window.__stalk);
  // Sunday: buy some, then the week moves on to Wednesday AM (slot 5)
  const a = await page.evaluate(() => { const s = window.__stalk; s.buy(10); const h = s.save.holdings; s.setTime(100, 5); return { h, seen: s.save.seen, slot: s.slot }; });
  check('setup: bought on Sunday, the furthest slot seen is Wednesday AM (5)', a.h === 10 && a.seen && a.seen.w === 100 && a.seen.s === 5 && a.slot === 5, JSON.stringify(a));
  // clock moved back to Sunday of the same week
  const b = await page.evaluate(() => { const s = window.__stalk; s.setTime(100, 0); return { slot: s.slot, buyDis: document.getElementById('buy1').disabled, reason: document.getElementById('market-reason').textContent, bought: s.buy(10), hold: s.save.holdings, known: window.MMStalkMarket.knownPrices(s.wk, s.slot).length }; });
  check('1. a clock moved back to Sunday cannot reopen the buy (Buy disabled, a buy does nothing)', b.buyDis && b.hold === 10, JSON.stringify(b));
  check('1b. it says "Your device clock moved back" and keeps the furthest slot', /Your device clock moved back/.test(b.reason) && b.slot === 5, JSON.stringify(b));
  const fut = await page.evaluate(() => { const s = window.__stalk; s.setTime(100, 3); return { slot: s.slot, known: window.MMStalkMarket.knownPrices(s.wk, s.slot).length }; });
  check('2. future prices are not revealed (known prices end at the furthest slot seen, never later)', fut.slot === 5, JSON.stringify(fut));
  // forward again: trading resumes at slot 6; a normal rollover to the next week works
  const c = await page.evaluate(() => { const s = window.__stalk; s.setTime(100, 6); const sellOk = !document.getElementById('sell1').disabled; s.setTime(101, 0); return { sellOk, week: s.save.week, seen: s.save.seen, buyOk: !document.getElementById('buy1').disabled, reason: document.getElementById('market-reason').textContent }; });
  check('3. moving forward again resumes trading; a normal week rollover is unchanged (new week, Sunday buy open)', c.sellOk && c.week === 101 && c.seen.w === 101 && c.seen.s === 0 && c.buyOk && !/moved back/.test(c.reason), JSON.stringify(c));
  check('no page errors', errors.length === 0, errors.join(' | '));
  await ctx.close(); await browser.close();
  done();
})().catch((e) => { console.error(e); process.exit(1); });
