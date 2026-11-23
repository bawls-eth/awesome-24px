// G-07 (b01-02, b04-13): a boss altar wakes only for a hero standing in its zone (or deeper, or right on the altar). A hero on a lower-zone
// tile near the border never wakes it; stepping onto the altar's zone within 9 tiles does; the 40-tile rest rule is unchanged; a hero
// below the recommended level gets a one-time "above your level" note. Offline: blockDb + every WebSocket closed, no chat, no writes.
// Run: BASE=http://localhost:8440/game/index.html node game/tests/beta-g07-altar-zone.test.js
const { chromium } = require('playwright');
const { check, done, blockDb } = require('./helpers');
const ORIGIN = (process.env.BASE || 'http://localhost:8440/game/index.html').replace(/\/game\/index\.html.*$/, '');

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1000, height: 700 } });
  await blockDb(ctx); await ctx.routeWebSocket(/.*/, (ws) => ws.close());
  await ctx.route('**/game/index.html*', (r) => r.fulfill({ contentType: 'text/html', body: '<!doctype html>town' }));
  const page = await ctx.newPage(); const errors = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  await page.goto(ORIGIN + '/game/games/mad-maze/lantern.css');
  await page.evaluate((v) => { localStorage.clear(); localStorage.setItem('pixeltown-save-v1', v); localStorage.setItem('mm-aim-assist', '0'); }, JSON.stringify({ realm: { level: 1, xp: 0, shards: 5, bestWave: 1, items: [], nextUid: 1, eq: {} } }));
  await page.goto(ORIGIN + '/game/games/mad-maze/index.html?mode=world&test=1&offline=1&seed=12345&qdate=2030-05-01');
  await page.waitForFunction(() => window.__mm && window.__mm.world && window.__mm.arena.active && window.__mm.arena.state === 'play', null, { timeout: 30000 });

  const r = await page.evaluate(() => {
    const a = window.__mm.arena, w = window.__mm.world, W = w.world, T = 32;
    a.player.iframes = 1e9; a._hitPlayer = () => {};
    const tile = (x, y) => W.zone[y * W.w + x];
    const free = (x, y) => x >= 0 && y >= 0 && x < W.w && y < W.h && !W.solid[y * W.w + x];
    const sites = w.bossSites();
    // a site (zone z >= 1) with a lower-zone free tile 4-8 tiles away and a same-zone free tile 3-8 tiles away
    let pick = null;
    for (const s of sites) {
      if (!(s.zone >= 1) || !s.ready) continue;
      let lo = null, hi = null;
      for (let dy = -8; dy <= 8; dy++) for (let dx = -8; dx <= 8; dx++) {
        const d = Math.hypot(dx, dy); const x = s.x + dx, y = s.y + dy; if (!free(x, y)) continue;
        if (!lo && d >= 4 && d <= 8 && tile(x, y) < s.zone) lo = { x, y, d };
        if (!hi && d >= 3.5 && d <= 8 && tile(x, y) === s.zone) hi = { x, y, d };
      }
      if (lo && hi) { pick = { s, lo, hi }; break; }
    }
    if (!pick) return { none: true };
    const live = () => w.bossSites()[pick.s.i].live;
    const put = (q) => { a.player.x = (q.x + 0.5) * T; a.player.y = (q.y + 0.5) * T; };
    put(pick.lo);
    let woke = false; for (let k = 0; k < 20; k++) { w.bossTick(); if (live()) woke = true; } // 10 s of 2 Hz ticks
    const out = { site: { i: pick.s.i, zone: pick.s.zone, name: pick.s.name }, lo: pick.lo, hi: pick.hi, loZone: tile(pick.lo.x, pick.lo.y), wokeLow: woke };
    put(pick.hi); w.bossTick(); out.wokeHigh = live();
    const note = document.querySelector('#rw-site-note') || [...document.querySelectorAll('div')].find((d) => /above your level/.test(d.textContent || ''));
    out.note = note ? note.textContent : '';
    // 40-tile rest rule unchanged
    a.player.x = (pick.s.x + 0.5) * T + 41 * T; a.player.y = (pick.s.y + 0.5) * T; w.bossTick(); out.rested = !live();
    return out;
  });
  check('setup: found a zone >= 1 altar with a lower-zone tile and a same-zone tile nearby', !r.none, JSON.stringify(r));
  check('1. a hero on a lower-zone tile 4-8 tiles from the altar for 10 s: no boss wakes', !r.none && r.loZone < r.site.zone && r.wokeLow === false, JSON.stringify(r));
  check('2. stepping onto the altar\'s zone within 9 tiles wakes the boss', r.wokeHigh === true, JSON.stringify(r));
  check('2b. a Lv 1 hero gets the one-time "above your level (rec. Lv N)" note', /is above your level \(rec\. Lv \d+\)/.test(r.note), r.note);
  check('3. the 40-tile rest rule is unchanged', r.rested === true, JSON.stringify(r));
  check('no page errors', errors.length === 0, errors.join(' | '));
  await ctx.close(); await browser.close();
  done();
})().catch((e) => { console.error(e); process.exit(1); });
