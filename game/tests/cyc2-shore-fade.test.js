// ID-01 Shore XP fade (spec cycle2-specs.md, built cycle 3 S). Node: MMZones.TABLES.SHORE_XP_FADE = [1, 1, 1, 1, 0.85, 0.70, 0.60] by
// min(level, 7) - 1, shoreFade(level, zone) = 1 for zone > 0 / bad input, and a faded kill never gives under 1 XP. Browser (Realm world,
// blockDb, db.attempts() === 0): a Shore kill at Lv 4 gives the full XP, at Lv 6 exactly max(1, round(raw * 0.70)); the toast
// "The Midlands has better prey" shows once per session (no number); ?shorefade=0 gives the full XP at Lv 6.
const Z = require('../shared/mm-zones.js');
const { check, done, blockDb } = require('./helpers');
const F = Z.TABLES.SHORE_XP_FADE;
check('table: [1,1,1,1,0.85,0.70,0.60]', JSON.stringify(F) === '[1,1,1,1,0.85,0.7,0.6]');
check('shoreFade on the Shore: Lv 1-4 = 1, Lv 5 = 0.85, Lv 6 = 0.70, Lv 7 / 20 / 99 = 0.60', [1, 2, 3, 4].every((l) => Z.shoreFade(l, 0) === 1) && Z.shoreFade(5, 0) === 0.85 && Z.shoreFade(6, 0) === 0.7 && Z.shoreFade(7, 0) === 0.6 && Z.shoreFade(20, 0) === 0.6 && Z.shoreFade(99, 0) === 0.6);
check('zone > 0 (Midlands and up) is always 1', [1, 2, 3].every((z) => [1, 5, 6, 7, 20].every((l) => Z.shoreFade(l, z) === 1)));
check('bad input is 1 (no zone, string zone, NaN / 0 / negative level)', Z.shoreFade(6) === 1 && Z.shoreFade(6, '0') === 1 && Z.shoreFade(NaN, 0) === 1 && Z.shoreFade(0, 0) === 1 && Z.shoreFade(-3, 0) === 1 && Z.shoreFade(Infinity, 0) === 1);
check('a faded kill never gives under 1 XP (raw 1 at Lv 7: max(1, round(0.6)) = 1)', Math.max(1, Math.round(1 * Z.shoreFade(7, 0))) === 1 && Math.max(1, Math.round(0.4 * Z.shoreFade(7, 0))) === 1);
if (process.env.NODE_ONLY) { done(); return; }

const { chromium } = require('playwright');
const ORIGIN = (process.env.BASE || 'http://localhost:8440/game/index.html').replace(/\/game\/index\.html.*$/, '');
const WORLD = ORIGIN + '/game/games/mad-maze/index.html?mode=world&test=1&offline=1&heropick=0&tutorial=0&seed=12345&qdate=2030-05-01';
const SAVE = { realm: { level: 4, xp: 0, shards: 50, bestWave: 2, items: [{ n: 1, id: 'sparkwand', r: 0 }], nextUid: 2, eq: { weapon: 1 } } };
const frames = (page, n) => page.evaluate((k) => new Promise((res) => { let i = 0; const f = () => (++i >= k ? res() : requestAnimationFrame(f)); requestAnimationFrame(f); }), n);

async function open(browser, query) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  const db = await blockDb(ctx);
  await ctx.route('**/game/index.html*', (rt) => rt.fulfill({ contentType: 'text/html', body: '<!doctype html>town' }));
  const page = await ctx.newPage(); const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(ORIGIN + '/game/games/mad-maze/lantern.css');
  await page.evaluate((a) => { localStorage.clear(); localStorage.setItem('pixeltown-save-v1', a); }, JSON.stringify(SAVE));
  await page.goto(WORLD + (query || ''));
  await page.waitForFunction(() => window.__mm && window.__mm.world && window.__mm.arena.active && window.__mm.arena.state === 'play', null, { timeout: 30000 });
  await page.evaluate(() => { const a = window.__mm.arena; a.player.iframes = 1e9; a._hitPlayer = () => {}; window.__ft = []; const f0 = a._floatText; a._floatText = function (x, y, t, c) { window.__ft.push(String(t)); return f0.apply(this, arguments); }; });
  return { ctx, page, errors, db };
}
// kill one live Shore (zone 0) enemy at hero level `lv`; returns the XP gained and what the raw (unfaded) XP was
async function shoreKill(page, lv) {
  for (let i = 0; i < 60; i++) {
    const r = await page.evaluate((L) => {
      const a = window.__mm.arena, w = window.__mm.world;
      const q = w.liveEnemies().find((x) => x.zone === 0); if (!q) return null;
      const e = w.enemyById(q.id); if (!e) return null;
      a.save.level = L; a.save.xp = 0;
      const raw = RM_XP[e.type] * (1 + 0.1 * Math.max(0, a.run.wave - 1)) * (e.xpMul || 1) * a.stats.xp;
      a._hitEnemy(e, 1e9);
      return { got: a.save.level === L ? a.save.xp : -1, raw, type: e.type };
    }, lv);
    if (r) { await frames(page, 2); return r; }
    await frames(page, 10);
  }
  return null;
}

(async () => {
  const browser = await chromium.launch();
  const s = await open(browser);
  const k4 = await shoreKill(s.page, 4);
  check('Lv 4 Shore kill: full XP (round(raw)), no toast', !!k4 && k4.got === Math.round(k4.raw) && !(await s.page.evaluate(() => window.__ft.some((t) => /better prey/.test(t)))), JSON.stringify(k4));
  const k6 = await shoreKill(s.page, 6);
  check('Lv 6 Shore kill: max(1, round(raw * 0.70)) XP', !!k6 && k6.got === Math.max(1, Math.round(k6.raw * 0.7)) && k6.got < Math.round(k6.raw), JSON.stringify(k6));
  const k7 = await shoreKill(s.page, 7);
  const toasts = await s.page.evaluate(() => window.__ft.filter((t) => /better prey/.test(t)));
  check('Lv 7 Shore kill: x0.60; the toast showed exactly once in the session and has no number or penalty word', !!k7 && k7.got === Math.max(1, Math.round(k7.raw * 0.6)) && toasts.length === 1 && toasts[0] === 'The Midlands has better prey', JSON.stringify({ k7, toasts }));
  check('no page errors', s.errors.length === 0, s.errors.join(' | '));
  check('0 DB requests', s.db.attempts() === 0);
  await s.ctx.close();
  const o = await open(browser, '&shorefade=0');
  const ko = await shoreKill(o.page, 6);
  check('?shorefade=0: a Lv 6 Shore kill gives the full XP', !!ko && ko.got === Math.round(ko.raw), JSON.stringify(ko));
  check('0 DB requests (shorefade=0)', o.db.attempts() === 0);
  await o.ctx.close();
  await browser.close();
  done();
})().catch((e) => { console.error(e); process.exit(1); });
