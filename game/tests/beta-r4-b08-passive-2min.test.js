// Round 4 (D1), b08-r2-04 (P2): "a passive new player still dies on the Shore". Based on D5's replay (r4-open/beta-r4-replay-newplayer):
// a brand-new profile (empty storage, phone 390x844) enters the Realm the way Home sends a first-time player (?mode=world&from=hub),
// picks the first hero if asked, then does NOTHING for 2+ game minutes. Four seeds side by side. Nothing is called on the game: the test
// only reads the clock, the state and the HP. test=1 only exposes read-only state; tutorial=1 puts back the first-run coach a real
// first-time player gets (a test page hides it otherwise). Offline: blockDb + every WebSocket closed + town page stubbed.
// Run: BASE=http://localhost:8440/game/index.html node game/tests/beta-r4-b08-passive-2min.test.js
const HERE = require('fs').existsSync(require('path').join(__dirname, 'helpers.js')) ? '.' : '..';
const { chromium } = require('playwright');
const { check, done, blockDb } = require(HERE + '/helpers');
const LS = require(HERE + '/lib/load-scale');
const ORIGIN = (process.env.BASE || 'http://localhost:8440/game/index.html').replace(/\/game\/index\.html.*$/, '');
const SEEDS = [12345, 777, 4242, 9001];
const WATCH = 125; // game seconds: 2 minutes and a bit

async function watch(browser, seed) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  const db = await blockDb(ctx); await ctx.routeWebSocket(/.*/, (ws) => ws.close());
  await ctx.route('**/game/index.html*', (r) => r.fulfill({ contentType: 'text/html', body: '<!doctype html>town' }));
  const page = await ctx.newPage(); const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(ORIGIN + '/game/games/mad-maze/index.html?mode=world&from=hub&test=1&tutorial=1&seed=' + seed);
  // The URL is Home's Realm link (?mode=world&from=hub). test=1 only exposes the read-only state; a test page hides the first-run coach
  // unless tutorial=1 asks for it, so tutorial=1 puts back what a real first-time player gets.
  // a first-time player may be asked to pick a hero: tap the first choice offered
  const t0 = Date.now(); let picked = '';
  while (Date.now() - t0 < LS.budget(30000)) {
    const st = await page.evaluate(() => (window.__mm && window.__mm.arena && window.__mm.arena.active && window.__mm.arena.state === 'play' ? 'play' : ''));
    if (st === 'play') break;
    const b = await page.evaluate(() => { const c = Array.from(document.querySelectorAll('button, [role=button]')).filter((e) => e.getClientRects().length && getComputedStyle(e).visibility !== 'hidden' && /hero|pick|class/i.test((e.id || '') + ' ' + (e.className || '') + ' ' + (e.closest('[id]') || {}).id)); if (!c.length) return null; const r = c[0].getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2, t: c[0].textContent.trim().slice(0, 30) }; });
    if (b && !picked) { await page.touchscreen.tap(b.x, b.y); picked = b.t; }
    await page.waitForTimeout(300);
  }
  const started = await page.evaluate(() => !!(window.__mm && window.__mm.arena && window.__mm.arena.state === 'play'));
  const log = []; let fell = null; let coach = false; let minHp = Infinity; let c0 = null;
  const tEnd = Date.now() + LS.budget(220000);
  while (started && Date.now() < tEnd) {
    const s = await page.evaluate(() => { const a = window.__mm.arena; const vis = (e) => !!e && e.getClientRects().length > 0 && getComputedStyle(e).visibility !== 'hidden'; return { clock: a.clock, state: a.state, hp: Math.round(a.player.hp), max: a.stats && a.stats.maxHp, coach: Array.from(document.querySelectorAll('[id*=coach], [class*=coach], [id*=tutorial]')).some(vis), zone: (document.getElementById('rw-zone') || {}).textContent || '' }; });
    if (c0 === null) c0 = s.clock;
    const t = s.clock - c0;
    coach = coach || s.coach; minHp = Math.min(minHp, s.hp);
    if (!log.length || t - log[log.length - 1][0] >= 10) log.push([Math.round(t), s.hp]);
    if (s.state === 'dead') { fell = Math.round(t); break; }
    if (t >= WATCH) break;
    await page.waitForTimeout(500);
  }
  const last = log.length ? log[log.length - 1][0] : 0;
  await ctx.close();
  return { seed, started, picked, fell, coach, minHp, watched: last, log, errors, db: db.attempts(), c0: c0 === null ? null : Math.round(c0 * 10) / 10 };
}

(async () => {
  const browser = await chromium.launch();
  const runs = await Promise.all(SEEDS.map((s) => watch(browser, s)));
  for (const r of runs) {
    const tag = 'seed ' + r.seed + ': ';
    check(tag + 'a brand-new profile reaches the Shore' + (r.picked ? ' (picked "' + r.picked + '")' : ''), r.started, JSON.stringify(r.errors));
    check(tag + 'the first-run coach is on screen while the player waits', r.coach);
    check(tag + 'b08-r2-04: a player who does nothing does not fall in the first ' + WATCH + ' game seconds (it was about 35 s)', r.started && r.fell === null && r.watched >= WATCH - 11, 'fell at ' + r.fell + ' s; HP by 10 s: ' + JSON.stringify(r.log));
    console.log('INFO ' + tag + 'lowest HP ' + r.minHp + ', HP every 10 s ' + JSON.stringify(r.log) + ' (game clock at the first sample: ' + r.c0 + ' s)');
    check(tag + 'no page errors, no database traffic', r.errors.length === 0 && r.db === 0, r.errors.join(' | '));
  }
  await browser.close();
  done();
})().catch((e) => { console.error(e); process.exit(1); });
