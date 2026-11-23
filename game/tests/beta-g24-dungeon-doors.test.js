// G-24 (b03-02, b03-13, b03-14): dungeon doors corner-slip (an open door 10 px off-centre is entered within 0.5 s; closed doors still
// block), the fall banner names the dungeon biome (no "Realm", no "wave"), and the fall summary has "Try again (same seed)" that R
// presses (same seed, floor 1). Offline: blockDb + every WebSocket closed, town / hub stubbed, no chat, no Firebase writes.
// Run: BASE=http://localhost:8440/game/index.html node game/tests/beta-g24-dungeon-doors.test.js
const { chromium } = require('playwright');
const { check, done, blockDb } = require('./helpers');
const ORIGIN = (process.env.BASE || 'http://localhost:8440/game/index.html').replace(/\/game\/index\.html.*$/, '');
const PAGE = ORIGIN + '/game/games/mad-maze/index.html';
const ev = (page, fn, arg) => page.evaluate(`(${fn.toString()})(${JSON.stringify(arg === undefined ? null : arg)})`);
const KEY = { N: 'ArrowUp', S: 'ArrowDown', W: 'ArrowLeft', E: 'ArrowRight' };

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1000, height: 700 } });
  await blockDb(ctx); await ctx.routeWebSocket(/.*/, (ws) => ws.close());
  await ctx.route('**/game/index.html*', (r) => r.fulfill({ contentType: 'text/html', body: '<!doctype html>town' }));
  await ctx.route('**/hub/index.html*', (r) => r.fulfill({ contentType: 'text/html', body: '<!doctype html>hub' }));
  const page = await ctx.newPage(); const errors = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  await page.goto(PAGE + '?mode=dungeon&seed=7&test=1&biome=crypt');
  await page.waitForFunction(() => window.__mm && window.__mm.dungeon && window.__mm.arena.active && window.__mm.arena.state === 'play', null, { timeout: 20000 });
  await ev(page, () => { const a = window.__mm.arena; a.player.iframes = 1e9; a._hitPlayer = () => {}; return true; });

  // 1: an open door, approached 10 px off its centre line
  const set = await ev(page, () => {
    const d = window.__mm.dungeon, a = window.__mm.arena, T = 40;
    const o = d.doors().find((x) => x.status === 'open'); if (!o) return null;
    const cx = (o.tile.x + 0.5) * T, cy = (o.tile.y + 0.5) * T; const off = 10;
    const pos = o.dir === 'W' ? { x: cx + 1.3 * T, y: cy + off } : o.dir === 'E' ? { x: cx - 1.3 * T, y: cy + off } : o.dir === 'N' ? { x: cx + off, y: cy + 1.3 * T } : { x: cx + off, y: cy - 1.3 * T };
    a.player.x = pos.x; a.player.y = pos.y;
    return { dir: o.dir, other: o.other, room: d.room, blocked: a._blocked(pos.x, pos.y, 14) };
  });
  check('setup: an open door in the start room and a free spot 10 px off its centre line', !!set && !set.blocked, JSON.stringify(set));
  await page.keyboard.down(KEY[set.dir]);
  await page.waitForFunction((r0) => window.__mm.dungeon.room !== r0, set.room, { timeout: 500 }).catch(() => {});
  await page.keyboard.up(KEY[set.dir]);
  const r1 = await ev(page, () => window.__mm.dungeon.room);
  check('1. walking into an open door 10 px off-centre: the hero passes within 0.5 s', r1 === set.other, JSON.stringify({ r1, set }));

  // 2: closed (sealed) doors still block
  const sealed = await ev(page, () => {
    const d = window.__mm.dungeon, a = window.__mm.arena, T = 40;
    const o = d.doors().find((x) => x.status !== 'open'); if (!o) return { none: true, st: d.doors().map((x) => x.status) };
    const cx = (o.tile.x + 0.5) * T, cy = (o.tile.y + 0.5) * T;
    const pos = o.dir === 'W' ? { x: cx + 1.3 * T, y: cy + 8 } : o.dir === 'E' ? { x: cx - 1.3 * T, y: cy + 8 } : o.dir === 'N' ? { x: cx + 8, y: cy + 1.3 * T } : { x: cx + 8, y: cy - 1.3 * T };
    a.player.x = pos.x; a.player.y = pos.y;
    return { dir: o.dir, status: o.status, room: d.room };
  });
  if (!sealed.none) { await page.keyboard.down(KEY[sealed.dir]); await page.waitForTimeout(700); await page.keyboard.up(KEY[sealed.dir]); }
  const r2 = await ev(page, () => window.__mm.dungeon.room);
  check('2. a closed door still blocks (no slide, no entry)', !sealed.none && r2 === sealed.room, JSON.stringify({ sealed, r2 }));

  // 3 + 4: fall: biome banner, then the summary with Try again (same seed); R presses it
  await ev(page, () => { const a = window.__mm.arena; a.player.iframes = 0; a._die(); return true; });
  await page.waitForTimeout(150);
  const banner = await page.evaluate(() => (document.getElementById('realm-banner') || {}).textContent || '');
  check('4. the fall banner names the dungeon biome ("You fell in the Crypt"), no "Realm" / "wave"', /You fell in the Crypt/.test(banner) && !/Realm|wave/.test(banner), banner);
  await page.waitForFunction(() => { const s = document.getElementById('mm-summary'); return s && !s.classList.contains('hidden') && document.getElementById('mm-sum-retry'); }, null, { timeout: 8000 }).catch(() => {});
  const sum = await page.evaluate(() => { const a = document.getElementById('mm-sum-retry'); return { has: !!a, text: a ? a.textContent : '', href: a ? a.getAttribute('href') : '', focused: document.activeElement === a, title: (document.querySelector('#mm-summary h2') || {}).textContent || '' }; });
  check('3. the fall summary offers "Try again (same seed)" (focused) pointing at the same seed, no floor', sum.has && /Try again \(same seed\)/.test(sum.text) && /seed=7(&|$)/.test(sum.href) && !/floor=/.test(sum.href) && sum.focused, JSON.stringify(sum));
  await Promise.all([page.waitForNavigation({ timeout: 10000 }).catch(() => null), page.keyboard.press('r')]);
  await page.waitForFunction(() => window.__mm && window.__mm.dungeon && window.__mm.arena.active, null, { timeout: 20000 });
  const again = await page.evaluate(() => ({ seed: String(window.__mm.dungeon.baseSeed), floor: window.__mm.dungeon.floor, url: location.search }));
  check('3b. R on the summary restarts the same seed on floor 1', again.seed === '7' && again.floor === 1, JSON.stringify(again));
  check('no page errors', errors.length === 0, errors.join(' | '));
  await ctx.close(); await browser.close();
  done();
})().catch((e) => { console.error(e); process.exit(1); });
