// G-09 (owner default O-06): the Survivor's cache needs effort: 3+ kills or 60 s alive since the last cache. Three quick suicides pay no
// item; a real run (3 kills, or a minute alive) still pays one; shards are never lost either way. Offline: blockDb + WebSockets closed.
// Run: BASE=http://localhost:8440/game/index.html node game/tests/beta-g09-survivor-cache.test.js
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
  await page.goto(ORIGIN + '/game/games/mad-maze/index.html?test=1&offline=1');
  await page.waitForFunction(() => window.__mm && window.__mm.arena && window.__mm.arena.active, null, { timeout: 15000 });
  const r = await page.evaluate(() => {
    const a = window.__mm.arena; const sv = a.save; sv.items = []; sv.shards = 50;
    const out = { suicides: [] };
    for (let i = 0; i < 3; i++) { a.state = 'play'; a.run.wave = 4; const n0 = sv.items.length, s0 = sv.shards; a._die(); out.suicides.push({ added: sv.items.length - n0, ds: sv.shards - s0, banner: document.getElementById('realm-banner').textContent }); }
    // a real run: 3 kills since the last cache
    a.state = 'play'; a.run.wave = 4; sv.kills += 3; a.run.kills += 3; const n1 = sv.items.length, s1 = sv.shards; a._die(); out.kills = { added: sv.items.length - n1, ds: sv.shards - s1 };
    // straight after a cache: none again until the next effort
    a.state = 'play'; const n2 = sv.items.length; a._die(); out.again = { added: sv.items.length - n2 };
    // a minute alive (time accrues in _update while playing)
    a.state = 'play'; a.paused = false; a.enemies.forEach((e) => { e.active = false; }); a.eBullets.forEach((b) => { b.active = false; }); a.player.iframes = 1e9;
    const t0 = a._cacheAliveT || 0; a._update(0.25); out.accrues = (a._cacheAliveT || 0) - t0 > 0.2;
    a._cacheAliveT = 60; a.state = 'play'; const n3 = sv.items.length; a._die(); out.alive = { added: sv.items.length - n3 };
    return out;
  });
  check('1. three quick suicides pay no Survivor\'s cache item, and no shards are lost', r.suicides.every((x) => x.added === 0 && x.ds === 0 && /no cache this time/.test(x.banner)), JSON.stringify(r.suicides));
  check('2. a real run (3 kills since the last cache) still gets one', r.kills.added === 1 && r.kills.ds === 0, JSON.stringify(r.kills));
  check('2b. right after a cache, a quick fall pays none', r.again.added === 0, JSON.stringify(r.again));
  check('3. time alive accrues while playing, and a minute alive earns the next cache', r.accrues && r.alive.added === 1, JSON.stringify(r));
  check('no page errors', errors.length === 0, errors.join(' | '));
  await ctx.close(); await browser.close();
  done();
})().catch((e) => { console.error(e); process.exit(1); });
