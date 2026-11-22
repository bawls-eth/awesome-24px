// Stalk Market practice week (quick play) + trade layout. Standalone: serve the repo root first,
//   python3 -m http.server 9352 &   then   BASE=http://localhost:9352/game/index.html node game/tests/stalk-practice.test.js
// Firebase hosts are blocked (blockDb) and must see 0 attempts; the page is offline-only.
const { chromium } = require('playwright');
const { check, done, blockDb } = require('./helpers');
const BASE = process.env.BASE || 'http://localhost:8440/game/index.html';
const ORIGIN = new URL(BASE).origin;
const PAGE = ORIGIN + '/game/games/stalk/index.html';

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  const db = await blockDb(ctx);
  const p = await ctx.newPage();
  const errors = [];
  p.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  p.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  await p.goto(PAGE + '?test=1&week=100&slot=0');
  await p.waitForFunction(() => window.__stalk);
  const realBefore = await p.evaluate(() => localStorage.getItem('pixeltown-stalk-v1'));

  // layout: trade buttons come right after the chart, before notes/advisor
  check('trade buttons sit right under the price card, inside the first phone screen', await p.evaluate(() => {
    const y = (id) => document.getElementById(id).getBoundingClientRect().top;
    const r = document.getElementById('sellall').getBoundingClientRect();
    return y('actions') > y('price-card') && y('actions') < y('chart') && y('actions') < y('market-notes') && r.bottom <= window.innerHeight;
  }));
  check('practice card starts with a single Start button (44px+)', await p.evaluate(() => {
    const b = document.getElementById('pr-start').getBoundingClientRect();
    return b.height >= 44 && b.width >= 44 && document.getElementById('pr-play').hidden && document.getElementById('pr-end').hidden;
  }));

  await p.tap('#pr-start');
  const st = await p.evaluate(() => { const s = window.__stalk.practice.state; return { slot: s.slot, bells: s.bells, n: s.n, buy: s.wk.buyPrice }; });
  check('start: Sunday, 1,000 practice bells, round 1', st.slot === 0 && st.bells === 1000 && st.n === 1);
  check('Sunday: buy enabled, sell disabled', await p.evaluate(() => !document.getElementById('pr-buy').disabled && document.getElementById('pr-sell').disabled));
  check('practice buttons are >= 44 px on phone', await p.evaluate(() => ['pr-buy', 'pr-sell', 'pr-next'].every((id) => { const r = document.getElementById(id).getBoundingClientRect(); return r.height >= 44 && r.width >= 44 && r.right <= window.innerWidth; })));
  await p.tap('#pr-buy');
  const q = Math.floor(1000 / st.buy);
  check('buy max spends practice bells only', await p.evaluate((q) => { const s = window.__stalk.practice.state; return s.hold === q && s.invested === q * s.wk.buyPrice && s.bells === 1000 - q * s.wk.buyPrice; }, q));
  check('buy plays a sound cue', await p.evaluate(() => window.__stalk.sounds.slice(-1)[0] === 'pickup'));
  await p.tap('#pr-next'); await p.tap('#pr-next');
  check('after Monday: honest odds shown and sell enabled', await p.evaluate(() => /Honest odds/.test(document.getElementById('pr-odds').textContent) && !document.getElementById('pr-sell').disabled && document.getElementById('pr-buy').disabled));
  check('live "Sell all now" profit matches the math', await p.evaluate(() => { const s = window.__stalk.practice.state; const v = s.hold * s.wk.sell[s.slot - 1] - s.invested; return document.getElementById('pr-pl').textContent.replace(/[+,]/g, '') === 'Sell all now: ' + v; }));
  check('practice chart drawn', await p.evaluate(() => { const c = document.getElementById('pr-chart'); const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data; for (let i = 3; i < d.length; i += 4) if (d[i]) return true; return false; }));
  await p.tap('#pr-sell');
  check('sell all: holdings 0, sale marked on chart', await p.evaluate(() => { const s = window.__stalk.practice.state; return s.hold === 0 && s.marks.join() === '2' && s.earned === (s.invested / s.wk.buyPrice) * s.wk.sell[1]; }));
  for (let i = 0; i < 10; i++) await p.tap('#pr-next');
  check('Sat PM: button reads End week', (await p.textContent('#pr-next')) === 'End week');
  await p.tap('#pr-next');
  const end = await p.evaluate(() => ({ done: window.__stalk.practice.state.done, title: document.getElementById('pr-end-title').textContent, items: document.querySelectorAll('#pr-end-list li').length, again: !document.getElementById('pr-end').hidden, actionsHidden: document.getElementById('pr-actions').hidden, saved: JSON.parse(localStorage.getItem('pixeltown-stalk-practice-v1')) }));
  check('end-of-week summary with pattern reveal, peak and Play again', end.done && end.again && end.items === 5 && end.actionsHidden && /bells/.test(end.title));
  check('practice best saved under its own key', end.saved && end.saved.v === 1 && end.saved.rounds === 1 && end.saved.hasBest === true && end.saved.n === 1);
  check('real stall save untouched by practice', (await p.evaluate(() => localStorage.getItem('pixeltown-stalk-v1'))) === realBefore);
  const rb = await p.evaluate(() => document.getElementById('pr-again').getBoundingClientRect().height);
  check('Play again is one big tap target', rb >= 44);
  await p.tap('#pr-again');
  check('Play again starts a new seeded week (round 2) at Sunday', await p.evaluate(() => { const s = window.__stalk.practice.state; return s.n === 2 && s.slot === 0 && s.bells === 1000 && !s.done && document.getElementById('pr-end').hidden; }));
  const w1 = await p.evaluate(() => window.__stalk.practice.state.wk.sell.join());
  await p.reload(); await p.waitForFunction(() => window.__stalk);
  await p.evaluate(() => { localStorage.setItem('pixeltown-stalk-practice-v1', JSON.stringify({ v: 1, n: 1, best: 0, rounds: 0 })); });
  await p.reload(); await p.waitForFunction(() => window.__stalk);
  await p.tap('#pr-start');
  check('practice weeks are deterministic per round number (seeded)', (await p.evaluate(() => window.__stalk.practice.state.wk.sell.join())) === w1);
  await p.evaluate(() => localStorage.setItem('pixeltown-stalk-practice-v1', '{"n":-5,"best":"<b>","rounds":1e99}'));
  await p.reload(); await p.waitForFunction(() => window.__stalk);
  check('hostile practice save is sanitised', await p.evaluate(() => { const s = window.__stalk.practice.saved; return s.n === 0 && s.best === 0 && s.rounds === 999999; }));
  check('phone: no horizontal scroll', await p.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth));
  check('no console errors', errors.length === 0, errors.join('|'));
  check('zero Firebase/DB requests', db.attempts() === 0);
  await browser.close();
  done();
})();
