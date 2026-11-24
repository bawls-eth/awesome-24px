// Round 4 (D1), b08-r2-04: a passive new player died on the Shore in about 35 s while reading the coach cards. While the first-run coach
// teaches: hits do 40% for the first minute (rising to full by 2 min), the hero cannot fall in the first minute, a quiet 3 s heals, and a
// one-time "Low HP" toast says how to heal / escape. Skipping the coach restores normal damage.
// Phone viewport, fresh storage, offline: blockDb + every WebSocket closed, town stubbed, no chat, no Firebase writes.
// Run: BASE=http://localhost:8440/game/index.html node game/tests/beta-r4-b08-shore-survival.test.js
const { chromium } = require('playwright');
const { check, done, blockDb } = require('./helpers');
const ORIGIN = (process.env.BASE || 'http://localhost:8440/game/index.html').replace(/\/game\/index\.html.*$/, '');
const WORLD = ORIGIN + '/game/games/mad-maze/index.html?mode=world&test=1&offline=1&tutorial=1&seed=12345';
const A = (page, fn, arg) => page.evaluate(`(${fn.toString()})(window.__mm.arena, window.__mm.world, ${JSON.stringify(arg === undefined ? null : arg)})`);

async function fresh(browser) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  await blockDb(ctx); await ctx.routeWebSocket(/.*/, (ws) => ws.close());
  await ctx.route('**/game/index.html*', (r) => r.fulfill({ contentType: 'text/html', body: '<!doctype html>town' }));
  const page = await ctx.newPage(); const errors = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  await page.goto(ORIGIN + '/game/games/mad-maze/lantern.css');
  await page.evaluate(() => { localStorage.clear(); });
  await page.goto(WORLD);
  await page.waitForFunction(() => window.__mm && window.__mm.world && window.__mm.arena.active && window.__mm.arena.state === 'play' && window.__mmTutorial, null, { timeout: 30000 });
  return { ctx, page, errors };
}

(async () => {
  const browser = await chromium.launch();
  try {
    // 1-4: a burst of enemy hits in the first minute (more than the tester's 94 -> 0) never fells a hero who is still being coached
    {
      const s = await fresh(browser);
      const r = await A(s.page, (a) => {
        const p = a.player; const mx = a.stats.maxHp; p.hp = mx; const h0 = p.hp;
        p.iframes = 0; a._hitPlayer(10); const one = h0 - p.hp;
        for (let i = 0; i < 40; i++) { p.iframes = 0; a._hitPlayer(12); }
        return { mx, one, hp: p.hp, state: a.state, toast: (document.getElementById('mm-coach-toast') || {}).textContent || '' };
      });
      check('1. in the first minute a 10-damage hit takes at most 4 HP while the coach teaches', r.one > 0 && r.one <= 4, JSON.stringify(r));
      check('2. 40 hits in the first minute leave the hero standing (HP >= 1, still playing)', r.hp >= 1 && r.state === 'play', JSON.stringify(r));
      await s.page.waitForTimeout(400);
      const toast = await s.page.evaluate(() => (document.getElementById('mm-coach-toast') || {}).textContent || '');
      check('3. under half HP a one-time toast says how to heal / escape', /Low HP/.test(toast) && /heal/i.test(toast) && /away/i.test(toast) && !/WASD|Space|arrow/i.test(toast), toast);
      // 4: 3 s+ with no hit -> HP climbs back
      const h1 = await A(s.page, (a) => a.player.hp);
      await s.page.waitForFunction((h) => window.__mm.arena.player.hp >= h + 3, h1, { timeout: 9000 }).catch(() => {});
      const h2 = await A(s.page, (a) => a.player.hp);
      check('4. after 3 quiet seconds the hero heals on their own (first-run coach on)', h2 >= h1 + 3, JSON.stringify({ h1, h2 }));
      // 5: past 2 minutes of play the guard ends: hits are normal again
      const late = await A(s.page, (a) => { const t = window.__mmTutorial; if (!t.guardAdvance) return { g: null, took: -1 }; t.guardAdvance(130); const g = t.guard(); const p = a.player; p.hp = a.stats.maxHp; p.iframes = 0; const h = p.hp; a._hitPlayer(10); return { g, took: h - p.hp }; });
      check('5. after 2 minutes of play hits are full again', !!late.g && !late.g.on && late.took >= 9, JSON.stringify(late));
      check('no pageerror (guard run)', s.errors.length === 0, s.errors.join(' | '));
      await s.ctx.close();
    }
    // 6: skipping the coach turns the guard off at once
    {
      const s = await fresh(browser);
      await s.page.click('#mm-coach-skip');
      const r = await A(s.page, (a) => { const p = a.player; p.hp = a.stats.maxHp; p.iframes = 0; const h = p.hp; a._hitPlayer(10); return { took: h - p.hp, g: window.__mmTutorial.guard ? window.__mmTutorial.guard() : null }; });
      check('6. after Skip, a 10-damage hit takes the full 10 (normal rules)', r.took >= 9 && !!r.g && !r.g.on, JSON.stringify(r));
      await s.ctx.close();
    }
    // 7: a real passive 40 s on the Shore at the spawn (no input at all) with the world's own enemies: the hero is still standing
    {
      const s = await fresh(browser);
      const t0 = Date.now();
      await s.page.waitForTimeout(40000);
      const r = await A(s.page, (a) => ({ state: a.state, hp: a.player.hp, deaths: a.save.deaths || 0, zone: a._zoneLabel ? a._zoneLabel() : '' }));
      check('7. a passive new player is still standing after 40 s on the Shore', r.state === 'play' && r.hp >= 1 && r.deaths === 0, JSON.stringify(Object.assign(r, { ms: Date.now() - t0 })));
      check('no pageerror (passive run)', s.errors.length === 0, s.errors.join(' | '));
      await s.ctx.close();
    }
  } finally { await browser.close(); }
  done();
})();
