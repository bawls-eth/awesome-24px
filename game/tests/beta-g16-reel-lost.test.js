// G-16 (b10-04, owner default O-06): the Angler reel can end. An empty meter for 6 s with no input -> status 'lost' ("It swam off. No
// harm done."), no penalty (the streak is kept), back to idle on dismiss. Any input resets the 6 s; active play and the golden catch
// sequences are unchanged. Node part (pure MMAngler.reel) + the Angler page (local only, no database).
// Run: BASE=http://localhost:8440/game/index.html node game/tests/beta-g16-reel-lost.test.js
const { chromium } = require('playwright');
const { check, done, blockDb } = require('./helpers');
const A = require('../shared/mm-angler.js');
const ORIGIN = (process.env.BASE || 'http://localhost:8440/game/index.html').replace(/\/game\/index\.html.*$/, '');

const mk = () => A.reel.create(A.FISH[0], 'stick', { seed: 'g16' });
(async () => {
  // 1: no input from the start: the meter drains to 0, then 6 s later the fish is lost
  let r = mk(); let t = 0, firstZero = -1;
  for (let i = 0; i < 400 && r.status === 'reeling'; i++) { r.tick(1 / 30, false); t += 1 / 30; if (firstZero < 0 && r.meter === 0) firstZero = t; }
  check('1. no input while reeling: the meter empties and 6 s later the status is "lost"', r.status === 'lost' && firstZero > 0 && Math.abs((t - firstZero) - 6) < 0.1, JSON.stringify({ status: r.status, t, firstZero }));
  // 2: any input resets the 6 s
  r = mk(); for (let i = 0; i < 60; i++) r.tick(1 / 30, false); // drain to 0
  let ticks = 0; for (let i = 0; i < 150; i++) { r.tick(1 / 30, false); ticks++; } // 5 s at 0
  r.tick(1 / 30, true); // one input
  for (let i = 0; i < 150 && r.status === 'reeling'; i++) r.tick(1 / 30, false); // another 5 s
  check('2. an input resets the 6 s clock (5 s + input + 5 s is still reeling)', r.status === 'reeling', JSON.stringify({ status: r.status, idle: r.idle0, meter: r.meter }));
  // 3: active play still catches (a simple bot)
  r = mk(); for (let i = 0; i < 4000 && r.status === 'reeling'; i++) r.tick(1 / 30, r.tension < r.pos);
  check('3. active play still lands the fish', r.status === 'caught', r.status);

  // 4: the page shows the message and returns to idle
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1000, height: 700 } });
  await blockDb(ctx);
  const page = await ctx.newPage(); const errors = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  await page.goto(ORIGIN + '/game/games/angler/index.html?test=1&seed=a&date=2026-07-15');
  await page.waitForFunction(() => window.__angler);
  const o = await page.evaluate(() => {
    const a = window.__angler; const s0 = a.fun.state.streak;
    a.tap(); a.advance(a.bite.wait + 0.2); a.tap();
    const reeling = a.state === 'reeling';
    a.advance(12);
    const out = { reeling, state: a.state, outcome: a.result && a.result.outcome, title: document.getElementById('res-title') ? document.getElementById('res-title').textContent : '', text: document.getElementById('result') ? document.getElementById('result').textContent : '', streakKept: a.fun.state.streak === s0 };
    a.dismiss(); out.after = a.state;
    return out;
  });
  check('4. page: 12 s of no input after the hook ends in "lost" with "It swam off. No harm done."', o.reeling && o.state === 'result' && o.outcome === 'lost' && /It swam off/.test(o.title + o.text) && /No harm done/.test(o.text), JSON.stringify(o));
  check('4b. no penalty (the streak is kept) and dismiss returns to idle', o.streakKept && o.after === 'idle', JSON.stringify(o));
  check('no page errors', errors.length === 0, errors.join(' | '));
  await ctx.close(); await browser.close();
  done();
})().catch((e) => { console.error(e); process.exit(1); });
