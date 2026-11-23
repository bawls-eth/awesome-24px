// Stalk Market bug bash: practice-first entry, intro length, clock-back safety, key guards, result card, hostile saves, 150% text, landscape.
//   python3 -m http.server 9426 &   BASE=http://localhost:9426/game/index.html node game/tests/stalk-bugbash.test.js
const { chromium } = require('playwright');
const { check, done, blockDb } = require('./helpers');
const BASE = process.env.BASE || 'http://localhost:8440/game/index.html';
const ORIGIN = new URL(BASE).origin;
const PAGE = ORIGIN + '/game/games/stalk/index.html';
const KEY = 'pixeltown-stalk-v1';

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  const db = await blockDb(ctx);
  const p = await ctx.newPage();
  const errors = [];
  p.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  p.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });

  // ---- entry + intro ----
  await p.goto(PAGE + '?test=1&week=100&slot=5');
  await p.waitForFunction(() => window.__stalk);
  check('practice is the first thing on the page (button above the real stall, 48px+)', await p.evaluate(() => {
    const b = document.getElementById('entry-practice').getBoundingClientRect();
    return b.height >= 48 && b.top < document.getElementById('stats').getBoundingClientRect().top && b.bottom < window.innerHeight / 2;
  }));
  check('the calendar rule is explained in ONE short line, with no urging', await p.evaluate(() => {
    const t = document.getElementById('entry-line').textContent;
    return /calendar/i.test(t) && (t.match(/\./g) || []).length <= 2 && !/hurry|don't miss|come back|before it'?s too late|limited/i.test(t);
  }));
  check('intro text is 40 words or fewer', await p.evaluate(() => document.querySelector('#hint p').textContent.trim().split(/\s+/).length <= 40));
  await p.tap('#entry-practice');
  check('entry button starts a practice week at any real time (Thursday here)', await p.evaluate(() => !!window.__stalk.practice.state && !document.getElementById('pr-play').hidden));

  // ---- keyboard: universal controls in practice, never while typing ----
  await p.evaluate(() => document.activeElement && document.activeElement.blur());
  await p.keyboard.press('Space'); // Sunday: primary buys max
  check('Space buys the max in practice on Sunday', await p.evaluate(() => window.__stalk.practice.state.hold > 0));
  await p.keyboard.press('Enter');
  check('Enter steps to the next half-day', await p.evaluate(() => window.__stalk.practice.state.slot === 1));
  await p.keyboard.press('e');
  check('E sells all in practice', await p.evaluate(() => window.__stalk.practice.state.hold === 0));
  await p.keyboard.press('b'); // real market: Thursday, buying is closed (and must not throw)
  check('B on a weekday is refused politely', await p.evaluate(() => /only be bought on Sunday/i.test(document.getElementById('msg').textContent)));
  check('error cue played for the refused buy', await p.evaluate(() => window.__stalk.sounds.indexOf('error') >= 0));
  check('Settings opens', await (async () => { await p.tap('#btn-settings'); return p.evaluate(() => window.MMSettings.mount({ page: 'stalk' }).isOpen()); })());
  const holdBefore = await p.evaluate(() => JSON.stringify(window.__stalk.save));
  const ta = await p.$('#mmset textarea');
  if (ta) { await ta.focus(); await p.keyboard.type('bsBS'); }
  check('typing b/s into a settings text box never trades', await p.evaluate((b) => JSON.stringify(window.__stalk.save) === b, holdBefore));
  await p.evaluate(() => window.MMSettings.mount({ page: 'stalk' }).close());

  // ---- clock safety ---- (G-11: the page already saw week 100 slot 5, so going back to its Sunday is itself a clock-back; the trading
  // week starts at the next Sunday instead, and every later week is one higher)
  await p.evaluate(() => window.__stalk.setTime(101, 0));
  await p.evaluate(() => window.__stalk.buy(5));
  await p.evaluate(() => window.__stalk.setTime(101, 4));
  const owned = await p.evaluate(() => window.__stalk.save.holdings);
  check('bought 5 stalks on Sunday', owned === 5);
  await p.evaluate(() => window.__stalk.setTime(100, 6)); // clock set one week back
  check('clock one week back: stalks are NOT spoiled and no week is recorded', await p.evaluate(() => window.__stalk.save.holdings === 5 && window.__stalk.save.week === 101 && window.__stalk.save.history.length === 0));
  check('clock back: trading is paused with a plain explanation', await p.evaluate(() => document.getElementById('sellall').disabled && /earlier week/i.test(document.getElementById('market-reason').textContent)));
  check('clock back: selling is refused and nothing changes', await p.evaluate(() => { const r = window.__stalk.sell(5); return r.ok === false && window.__stalk.save.holdings === 5; }));
  await p.evaluate(() => window.__stalk.setTime(101, 6));
  check('clock restored: trading resumes', await p.evaluate(() => { const r = window.__stalk.sell(5); return r.ok === true && window.__stalk.save.holdings === 0; }));
  await p.evaluate(() => window.__stalk.setTime(102, 0));
  check('forward rollover still records the week', await p.evaluate(() => window.__stalk.save.week === 102 && window.__stalk.save.history.length === 1));
  await p.evaluate(() => window.__stalk.setTime(40, 3)); // far back (clock reset to long ago): normal rollover, never stuck
  check('far-off clock never sticks the market (normal rollover, no pause)', await p.evaluate(() => window.__stalk.save.week === 40 && !/earlier week/i.test(document.getElementById('market-reason').textContent)));

  // ---- zero bells / zero sells ----
  await p.evaluate((k) => { const s = JSON.parse(localStorage.getItem(k)); s.balance = 0; s.holdings = 0; s.week = 7; localStorage.setItem(k, JSON.stringify(s)); }, KEY);
  await p.goto(PAGE + '?test=1&week=7&slot=0');
  await p.waitForFunction(() => window.__stalk);
  check('zero bells on Sunday: buy buttons disabled with a friendly reason', await p.evaluate(() => document.getElementById('buy1').disabled && /Not enough bells/.test(document.getElementById('market-reason').textContent) && /practice/i.test(document.getElementById('market-reason').textContent)));
  await p.evaluate(() => window.__stalk.setTime(7, 3));
  check('selling zero says so plainly', await p.evaluate(() => { window.__stalk.sell(0); return /no stalks to sell/i.test(document.getElementById('msg').textContent); }));

  // ---- result card ----
  await p.evaluate(() => { window.__stalk.practice.start(); window.__stalk.practice.buy(); for (let i = 0; i < 13; i++) window.__stalk.practice.next(); });
  check('practice results use the shared card (stat rows + Play again 48px+)', await p.evaluate(() => {
    const c = document.getElementById('pr-card'); const a = document.getElementById('pr-again');
    return c.classList.contains('mk-card') && c.querySelectorAll('.mk-row').length >= 3 && a.getBoundingClientRect().height >= 44 && document.getElementById('pr-end-list').querySelectorAll('li').length >= 4;
  }));
  await p.keyboard.press('r');
  check('R plays another practice week from the result card', await p.evaluate(() => window.__stalk.practice.state.slot === 0 && !window.__stalk.practice.state.done));

  // ---- hostile saves ----
  const hostile = [
    'not json{{{', '[]', 'null', '"str"', JSON.stringify({ balance: 'NaN', holdings: -5, week: 1e9, history: 'x', medals: [], last: { pattern: '<img onerror=1>' } }),
    JSON.stringify({ balance: 1e30, holdings: 1e30, week: 100, invested: -1, earned: Infinity, history: [{ pattern: 'random', week: 'a', profit: {} }], goals: 99 }),
  ];
  for (const h of hostile) {
    const q = await ctx.newPage(); const qe = [];
    q.on('pageerror', (e) => qe.push(e.message));
    await q.addInitScript(([k, v]) => { try { localStorage.setItem(k, v); localStorage.setItem('pixeltown-stalk-practice-v1', v); } catch (e) { /* ignore */ } }, [KEY, h]);
    await q.goto(PAGE + '?test=1&week=100&slot=3');
    await q.waitForFunction(() => window.__stalk);
    const ok = await q.evaluate(() => { const s = window.__stalk.save; return Number.isFinite(s.balance) && s.balance >= 0 && s.holdings >= 0 && s.holdings <= 200 && document.getElementById('st-bells').textContent !== 'NaN' && !document.body.innerHTML.includes('<img onerror'); });
    check('hostile save survives: ' + h.slice(0, 26), ok && qe.length === 0, qe.join('|'));
    await q.close();
  }

  // ---- 150% text, reduced motion, low graphics, landscape ----
  const c2 = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, reducedMotion: 'reduce' });
  await blockDb(c2);
  await c2.addInitScript(() => { try { localStorage.setItem('pixeltown-access-v1', JSON.stringify({ hudScale: 1.5, lowGfx: true })); } catch (e) { /* ignore */ } });
  const r = await c2.newPage();
  await r.goto(PAGE + '?test=1&week=100&slot=0');
  await r.waitForFunction(() => window.__stalk);
  check('150% text + low gfx: no horizontal scroll, buttons still 44px+', await r.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth && ['entry-practice', 'buy1', 'sellall'].every((id) => document.getElementById(id).getBoundingClientRect().height >= 44)));
  check('reduced motion: chart is drawn final (no running animation)', await r.evaluate(() => window.__stalk.reduced === true && window.__stalk.anim.running === false));
  await r.setViewportSize({ width: 844, height: 390 });
  await r.waitForTimeout(150);
  check('landscape phone: no horizontal scroll, start button reachable', await r.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth && document.getElementById('entry-practice').getBoundingClientRect().width >= 44));
  await c2.close();

  check('no console errors', errors.length === 0, errors.join(' | '));
  check('zero Firebase/DB requests', db.attempts() === 0);
  await browser.close();
  done();
})();
