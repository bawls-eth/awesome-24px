// Daily seed: ?daily=1 world/dungeon use the UTC-date seed; ?seed= wins; ?today= only with test=1; Daily button + badge; phone.
// Run: BASE=http://localhost:8523/game/index.html NODE_PATH=$(npm root -g) node game/tests/daily-seed.test.js
const { chromium } = require('playwright');
const { check, done } = require('./helpers');
const D = require('../shared/mm-daily.js');
const ORIGIN = (process.env.BASE || 'http://localhost:8440/game/index.html').replace(/\/game\/index\.html.*$/, '');
const PAGE = ORIGIN + '/game/games/mad-maze/index.html';

async function open(browser, url, opts) {
  const ctx = await browser.newContext(opts || { viewport: { width: 1000, height: 700 } });
  await ctx.route('**/game/index.html*', (r) => r.fulfill({ contentType: 'text/html', body: 'town' }));
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  await page.goto(ORIGIN + '/game/games/mad-maze/lantern.css');
  await page.evaluate(() => { localStorage.clear(); localStorage.setItem('mm-aim-assist', '0'); });
  errors.length = 0;
  await page.goto(url);
  await page.waitForFunction(() => document.getElementById('mm-daily-btn') && (window.__mm ? window.__mm.arena : true));
  return { ctx, page, errors };
}
const worldInfo = async (page) => {
  await page.waitForFunction(() => window.__mm.world && window.__mm.world.world);
  return page.evaluate(() => { const w = window.__mm.world; let h = 0; const z = w.world.zone; for (let i = 0; i < z.length; i += 7) h = (h * 31 + z[i] + i) | 0; return { seed: String(w.seed), fp: h, badge: (document.getElementById('mm-daily-btn') || {}).textContent }; });
};

(async () => {
  const browser = await chromium.launch();
  const allErrors = [];
  const d1 = '2026-03-04', d2 = '2026-03-05';
  const w = (d, extra) => PAGE + '?mode=world&daily=1&test=1&today=' + d + (extra || '');
  const run = async (url, fn, opts) => { const P = await open(browser, url, opts); const r = await fn(P); allErrors.push(...P.errors); await P.ctx.close(); return r; };

  const a = await run(w(d1), (P) => worldInfo(P.page));
  check('world daily uses dailySeed(world)', a.seed === String(D.dailySeed(d1, 'world')));
  check('badge textContent is Daily <date>', a.badge === 'Daily ' + d1);
  const b = await run(w(d2), (P) => worldInfo(P.page));
  check('different date gives different seed', a.seed !== b.seed && b.seed === String(D.dailySeed(d2, 'world')));
  const a2 = await run(w(d1), (P) => worldInfo(P.page));
  check('same date gives same world fingerprint', a2.fp === a.fp && a2.seed === a.seed);
  check('different dates give different world fingerprints', a.fp !== b.fp);

  const s = await run(w(d1, '&seed=777'), (P) => worldInfo(P.page));
  check('explicit ?seed= still wins', s.seed === '777');
  const bs = await run(w(d1, '&seed=bad!!seed'), (P) => worldInfo(P.page));
  check('invalid ?seed= ignored, daily used', bs.seed === a.seed);

  const nt = await run(PAGE + '?mode=world&daily=1&today=' + d1, async (P) => ({ badge: await P.page.evaluate(() => document.getElementById('mm-daily-btn').textContent) }));
  check('?today ignored without ?test=1', /^Daily \d{4}-\d{2}-\d{2}$/.test(nt.badge) && nt.badge !== 'Daily ' + d1);
  const bt = await run(w('2026-13-45'), (P) => worldInfo(P.page));
  check('malformed ?today ignored', bt.badge !== 'Daily 2026-13-45' && /^Daily \d{4}-\d{2}-\d{2}$/.test(bt.badge));

  const ds = await run(PAGE + '?mode=dungeon&daily=1&test=1&today=' + d1, async (P) => {
    await P.page.waitForFunction(() => window.__mm.dungeon);
    return P.page.evaluate(() => ({ seed: String(window.__mm.dungeon.seed), badge: (document.getElementById('mm-daily-btn') || {}).textContent }));
  });
  check('dungeon daily uses dailySeed(dungeon)', ds.seed === String(D.dailySeed(d1, 'dungeon')) && ds.badge === 'Daily ' + d1);

  await run(PAGE + '?test=1&offline=1', async (P) => {
    const btn = await P.page.evaluate(() => { const e = document.getElementById('mm-daily-btn'); const r = e.getBoundingClientRect(); return { t: e.textContent, href: e.getAttribute('href'), h: r.height, w: r.width, sx: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth }; });
    check('Daily button 44px target, routes to world daily', btn.t === 'Daily' && /^\?mode=world&daily=1/.test(btn.href) && btn.h >= 44 && btn.w >= 44);
    check('phone: no horizontal scroll', btn.sx <= btn.cw);
    await P.page.evaluate(() => document.getElementById('mm-daily-btn').click());
    await P.page.waitForFunction(() => window.__mm && window.__mm.world && window.__mm.world.world);
    const nav = await P.page.evaluate(() => ({ q: location.search, badge: document.getElementById('mm-daily-btn').textContent }));
    check('click lands on daily world with badge', /mode=world/.test(nav.q) && /daily=1/.test(nav.q) && /^Daily \d{4}-\d{2}-\d{2}$/.test(nav.badge));
  }, { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

  check('no console errors', allErrors.length === 0);
  if (allErrors.length) console.log(allErrors.join('\n'));
  await browser.close();
  done();
})();
