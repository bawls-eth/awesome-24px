// Stalk Market MG4: "market notes" next to the price chart (plain words about prices that already happened; display only),
// the "Week of <date>" label, no urgency or advice wording, and play money only. Phone 390x844, blockDb, console clean.
// Run: NODE_PATH=$(npm root -g) BASE=http://localhost:8440/game/index.html node game/tests/stalk-notes.test.js
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');
const { check, done, blockDb } = require('./helpers');
const M = require('../shared/mm-stalk-market.js');
const ORIGIN = (process.env.BASE || 'http://localhost:8440/game/index.html').replace(/\/game\/index\.html.*$/, '');
const PAGE = ORIGIN + '/game/games/stalk/index.html';
const KEY = 'pixeltown-stalk-v1';
const URGENT = /hurry|last chance|miss out|act fast|act now|limited time|don'?t wait|now or never|too late|running out|before it'?s gone|guarantee|promise|will (rise|fall|go up|go down|climb|drop)|sure thing|you should|sell now|buy now|quick/i;
const MONEY = /purchase|checkout|payment|credit card|\$\s?\d|\bUSD\b|€|£|in-app|real-money store/i;
const dbs = [];

async function open(browser, query, init) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  const db = await blockDb(ctx); dbs.push(db);
  const page = await ctx.newPage(); const errors = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  if (init !== undefined) await page.addInitScript(([k, v]) => { if (!sessionStorage.seeded) { sessionStorage.seeded = '1'; localStorage.setItem(k, v); } }, [KEY, init]);
  await page.goto(PAGE + query); await page.waitForFunction(() => window.__stalk);
  return { ctx, page, errors };
}
const notesText = (p) => p.evaluate(() => [...document.querySelectorAll('#notes-list li')].map((li) => li.textContent));

(async () => {
  // ---- pure sweep: every week/slot reads plainly and never urges ----
  let bad = [], count = 0, dipRun = null;
  for (let w = 0; w <= 600; w++) {
    const wk = M.generateWeek(w);
    for (let s = 0; s < M.SLOTS; s++) {
      const n = M.marketNotes(wk, s); count += n.length;
      n.forEach((t) => { if (URGENT.test(t) || MONEY.test(t)) bad.push(w + '/' + s + ': ' + t); });
      if (!dipRun && n.some((t) => /dipped two half-days in a row/.test(t))) dipRun = { w, s };
    }
    const lw = M.lastWeekNote(w); if (lw && (URGENT.test(lw) || MONEY.test(lw))) bad.push(w + ': ' + lw);
  }
  check('sweep of 601 weeks x 13 slots: no urgency, advice or real-money words in any note', bad.length === 0 && count > 20000, bad.slice(0, 3).join(' || '));
  check('notes are display only: generating them leaves the week prices identical', JSON.stringify(M.generateWeek(2969)) === JSON.stringify((() => { const wk = M.generateWeek(2969); for (let s = 0; s < 13; s++) M.marketNotes(wk, s); M.lastWeekNote(2969); return wk; })()));
  check('a week with two dips in a row exists and says so', !!dipRun, 'none found');
  check('Week label: week 2969 is the week of 22 Nov 2026; weekStart inverts weekNumber', M.weekLabel(2969) === 'Week of 22 Nov 2026' && [0, 1, 100, 2969, 5000].every((w) => { const s = M.weekStart(w); return w === 0 || M.weekNumber(new Date(s.y, s.m, s.d, 12)) === w; }));

  const browser = await chromium.launch();
  let d = await open(browser, '?test=1&week=2969&slot=0'), p = d.page;
  check('the market notes panel sits right after the price chart', await p.evaluate(() => { const c = document.getElementById('chart-alt'); return c.nextElementSibling && c.nextElementSibling.id === 'market-notes' && document.querySelector('#market-notes h2').textContent === 'Market notes'; }));
  check('Sunday notes: the buy price only, in plain words', (await notesText(p)).join(' ').includes('the only price so far is the buy price of ' + M.generateWeek(2969).buyPrice + ' bells'));
  check('"Week of <date>" label replaces "week 2969"', await p.evaluate(() => { const t = document.getElementById('when').textContent; return t === 'Sunday, Week of 22 Nov 2026' && !/week 2969/i.test(t); }));
  check('last-week paragraph describes week of 15 Nov 2026 with its real low, high and close', await p.evaluate(() => document.getElementById('notes-last').textContent).then((t) => { const lw = M.generateWeek(2968); return t.startsWith('Week of 15 Nov 2026:') && t.includes('closed at ' + lw.sell[11]) && t.includes('highest was ' + Math.max.apply(null, lw.sell)) && t.includes('lowest sell price was ' + Math.min.apply(null, lw.sell)); }));
  const before = await p.evaluate(() => JSON.stringify(window.__stalk.wk));
  await p.evaluate(() => window.__stalk.setTime(2969, 5));
  const n5 = await notesText(p);
  check('weekday notes match the module and describe the latest move and the Sunday price', JSON.stringify(n5) === JSON.stringify(M.marketNotes(M.generateWeek(2969), 5)) && /^Prices (rose|dipped|held)/.test(n5[0]) && n5.some((t) => /Sunday price of \d+/.test(t)));
  check('every weekday note ends by saying the past cannot tell what comes next', /Nobody can tell what comes next/.test(n5[n5.length - 1]));
  check('the page reads the market without changing it (same week prices as the module)', before === await p.evaluate(() => JSON.stringify(window.__stalk.wk)) && before === JSON.stringify(M.generateWeek(2969)));
  await p.evaluate((w) => window.__stalk.setTime(w.w, w.s), dipRun);
  check('trend wording shows in the panel: "Prices dipped two half-days in a row."', (await notesText(p)).includes('Prices dipped two half-days in a row.'), JSON.stringify(dipRun));
  let pageBad = [];
  for (let s = 0; s < M.SLOTS; s++) { await p.evaluate((x) => window.__stalk.setTime(2969, x), s); const t = await p.evaluate(() => document.getElementById('market-notes').textContent); if (URGENT.test(t)) pageBad.push(s + ': ' + t); }
  check('the rendered panel never contains urgency words like "hurry", "last chance" or "miss out" (all 13 slots)', pageBad.length === 0, pageBad.join(' || '));
  check('phone 390: no horizontal scroll', await p.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1 && document.body.scrollWidth <= window.innerWidth + 1));
  check('phone 390: every visible button in the page is at least 44 px', await p.evaluate(() => [...document.querySelectorAll('#stage button')].filter((b) => b.offsetParent !== null).every((b) => { const r = b.getBoundingClientRect(); return r.height >= 44 && r.width >= 44; })));
  check('save keys unchanged (notes add nothing to the save)', await p.evaluate((k) => Object.keys(JSON.parse(localStorage.getItem(k))).sort().join(), KEY) === 'balance,best,earned,goals,hint,history,holdings,invested,last,medals,played,seen,total,v,week,wkBest');
  check('no console errors', d.errors.length === 0, d.errors.join('|'));
  await d.ctx.close();

  d = await open(browser, '?test=1&week=0&slot=0'); p = d.page;
  check('week 0 has a friendly "no last week" line', /very first market week/.test(await p.evaluate(() => document.getElementById('notes-last').textContent)) && d.errors.length === 0);
  await d.ctx.close();

  // ---- play money only: no purchase / real-money strings in the Stalk sources ----
  const src = ['games/stalk/stalk.js', 'games/stalk/index.html', 'shared/mm-stalk-market.js'].map((f) => fs.readFileSync(path.join(__dirname, '..', f), 'utf8')).join('\n');
  check('play money only: grep finds no purchase, payment or currency-sign strings', !MONEY.test(src), (src.match(MONEY) || [''])[0]);
  check('blockDb saw 0 database requests', dbs.every((x) => x.count() === 0), dbs.map((x) => x.count()).join(','));
  await browser.close();
  done();
})().catch((e) => { console.error(e); process.exitCode = 1; });
