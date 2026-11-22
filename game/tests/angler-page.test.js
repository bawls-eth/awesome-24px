// Lakeside Angler page. Serve the repo root: python3 -m http.server 8450 &
// Run: BASE=http://localhost:8450/game/index.html NODE_PATH=$(npm root -g) node game/tests/angler-page.test.js
// Set SHOTS=<dir> for desktop/phone screenshots. No Firebase, no external network.
const { chromium } = require('playwright');
const { check, done } = require('./helpers');
const ORIGIN = (process.env.BASE || 'http://localhost:8440/game/index.html').replace(/\/game\/index\.html.*$/, '');
const URL = (q) => ORIGIN + '/game/games/angler/index.html?test=1' + (q || '');
const KEY = 'pixeltown-angler-v1';

async function open(browser, q, opts, init) {
  const ctx = await browser.newContext(opts || { viewport: { width: 1000, height: 700 } });
  const page = await ctx.newPage();
  const errors = [], reqs = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  page.on('request', (r) => reqs.push(r.url()));
  if (init) await page.addInitScript(init);
  await page.goto(URL(q));
  await page.waitForFunction(() => window.__angler);
  return { ctx, page, errors, reqs };
}
// bot: hold when the zone is below the fish, until the fight ends
const play = (page) => page.evaluate(() => {
  const a = window.__angler;
  for (let i = 0; i < 4000 && a.state === 'reeling'; i++) { a.setHold(a.reel.tension < a.reel.pos); a.advance(1 / 30); }
  a.setHold(false);
  return a.state + ':' + (a.result && a.result.outcome);
});
const toReel = (page, fish) => page.evaluate((f) => {
  const a = window.__angler;
  if (f) a.forceFish(f);
  a.tap(); a.advance(a.bite.wait + 0.2); a.tap();
  return a.state;
}, fish);

(async () => {
  const browser = await chromium.launch();
  const shot = process.env.SHOTS;

  // 1-3: cast, timed press, spook
  let p = await open(browser, '&seed=a&date=2026-07-15');
  check('loads in idle state on West Pond', await p.page.evaluate(() => __angler.state === 'idle' && __angler.spot === 'west'));
  await p.page.evaluate(() => __angler.tap());
  check('cast starts the wait', await p.page.evaluate(() => __angler.state === 'waiting' && __angler.bite.wait >= 1.5));
  check('timed press during the bite window hooks a fish and starts the reel', await p.page.evaluate(() => {
    const a = __angler; a.advance(a.bite.wait + 0.2);
    const biting = a.state === 'biting'; a.tap();
    return biting && a.state === 'reeling' && !!a.reel;
  }));
  // 4-5: tension rates
  check('holding raises tension at 120%/s', await p.page.evaluate(() => {
    const a = __angler, t0 = a.reel.tension; a.setHold(true); a.advance(0.1); a.setHold(false);
    return Math.abs(a.reel.tension - t0 - 0.12) < 0.01;
  }));
  check('releasing lowers tension at 160%/s', await p.page.evaluate(() => {
    const a = __angler, t0 = a.reel.tension; a.advance(0.1);
    return Math.abs(t0 - a.reel.tension - 0.16) < 0.01;
  }));
  // 6: snap
  check('tension held at max snaps the line, no catch', await p.page.evaluate(() => {
    const a = __angler; a.setHold(true); a.advance(3.5); a.setHold(false);
    return a.state === 'result' && a.result.outcome === 'snapped' && Object.keys(a.journal.caught).length === 0;
  }));
  check('snap shows a result panel', await p.page.isVisible('#result') && /snapped/i.test(await p.page.textContent('#res-title')));
  await p.page.evaluate(() => __angler.dismiss());
  // 7: early press
  check('early press spooks the fish', await p.page.evaluate(() => {
    const a = __angler; a.tap(); a.advance(0.3); a.tap();
    return a.state === 'result' && a.result.outcome === 'spooked';
  }));
  await p.page.evaluate(() => __angler.dismiss());
  // missed window
  check('ignoring the bite lets it go (no penalty beyond the miss)', await p.page.evaluate(() => {
    const a = __angler; a.tap(); a.advance(a.bite.wait + 1.3);
    return a.state === 'result' && a.result.outcome === 'missed';
  }));
  await p.page.evaluate(() => __angler.dismiss());
  // 8: win, journal, persistence
  await toReel(p.page, 'bluegill');
  const res = await play(p.page);
  check('a tracked reel is won and the fish is recorded', res === 'result:caught' && await p.page.evaluate(() => __angler.journal.caught.bluegill.n === 1), res);
  check('catch panel shows name and rarity', /Bluegill/.test(await p.page.textContent('#res-title')) && /Common/.test(await p.page.textContent('#res-detail')));
  if (shot) await p.page.screenshot({ path: shot + '/angler-desktop-catch.png' });
  const stored = await p.page.evaluate((k) => localStorage.getItem(k), KEY);
  check('journal saved under pixeltown-angler-v1', !!stored && JSON.parse(stored).caught.bluegill.n === 1);
  await p.page.reload(); await p.page.waitForFunction(() => window.__angler);
  check('journal persists across reload', await p.page.evaluate(() => __angler.journal.caught.bluegill && __angler.journal.caught.bluegill.n === 1));
  // journal UI + filters + silhouettes
  await p.page.click('#journal-btn');
  check('journal shows silhouettes for uncaught fish and a count', (await p.page.$$eval('.card.unk .nm', (n) => n.every((x) => x.textContent === '???') && n.length === 47)) && /1\/48/.test(await p.page.textContent('#journal-count')));
  await p.page.selectOption('#f-spot', 'ice'); await p.page.selectOption('#f-rarity', '5');
  check('journal filters by spot and rarity', await p.page.$$eval('.card', (c) => c.length === 1 && c[0].dataset.id === 'ice_queen_pike'));
  await p.page.selectOption('#f-spot', 'all'); await p.page.selectOption('#f-rarity', 'all');
  if (shot) await p.page.screenshot({ path: shot + '/angler-desktop-journal.png' });
  check('no console errors (desktop)', p.errors.length === 0, p.errors.join(' | '));
  check('zero off-origin requests', p.reqs.every((u) => u.startsWith(ORIGIN + '/') || u.startsWith('data:')) && !p.reqs.some((u) => /firebase|gstatic/.test(u)), p.reqs.join(' '));
  await p.ctx.close();

  // 9: ice hole season lock (injected date)
  let s = await open(browser, '&date=2026-07-15');
  check('Ice Hole locked in July', await s.page.evaluate(() => __angler.spotLocked('ice') && !__angler.pickSpot('ice') && __angler.spot === 'west'));
  check('locked spot button is marked and labelled', await s.page.$eval('[data-spot=ice]', (b) => b.classList.contains('locked') && /Dec-Feb/.test(b.textContent)));
  await s.page.evaluate(() => __angler.setDate('2026-01-10'));
  check('Ice Hole opens in January', await s.page.evaluate(() => !__angler.spotLocked('ice') && __angler.pickSpot('ice') && __angler.spot === 'ice'));
  await s.page.evaluate(() => __angler.setDate('2026-11-30'));
  check('Ice Hole still locked in November', await s.page.evaluate(() => __angler.spotLocked('ice')));
  await s.ctx.close();

  // 10: corrupt storage
  for (const bad of ['not json{', '{"caught":{"minnow":{"n":"x"},"nope":{"n":3},"koi":{"n":2,"best":40}},"bosses":{"koi":true}}', '[1,2]']) {
    const c = await open(browser, '', undefined, `localStorage.setItem(${JSON.stringify(KEY)}, ${JSON.stringify(bad)})`);
    const ok = await c.page.evaluate(() => {
      const j = __angler.journal; const ks = Object.keys(j.caught);
      return ks.every((k) => k === 'koi') && Object.keys(j.bosses).length === 0 && !!document.getElementById('scene');
    });
    check('corrupt journal loads clean: ' + bad.slice(0, 12), ok && c.errors.length === 0, c.errors.join(' '));
    await c.ctx.close();
  }

  // 11: reduced motion
  const rm = await browser.newContext({ viewport: { width: 1000, height: 700 }, reducedMotion: 'reduce' });
  const rp = await rm.newPage(); await rp.goto(URL('&seed=r'));
  await rp.waitForFunction(() => window.__angler);
  check('reduced motion: steady bobber and no shimmer', await rp.evaluate(() => {
    const a = __angler; a.tap(); const ys = [];
    for (let i = 0; i < 20; i++) { a.advance(0.07); ys.push(a.bobY); }
    return a.reduced && a.state !== 'result' && ys.every((y) => y === 0);
  }));
  const rmFrames = await rp.evaluate(() => { const c = document.getElementById('scene'); __angler.redraw(); const a = c.toDataURL(); __angler.advance(0.5); __angler.redraw(); return a === c.toDataURL(); });
  check('reduced motion: water frame does not animate', rmFrames);
  await rm.close();
  const nm = await open(browser, '&seed=r', { viewport: { width: 1000, height: 700 }, reducedMotion: 'no-preference' });
  check('normal motion: bobber bobs while waiting', await nm.page.evaluate(() => {
    const a = __angler; a.tap(); const ys = new Set();
    for (let i = 0; i < 12; i++) { a.advance(0.1); if (a.state === 'waiting') ys.add(a.bobY); }
    return ys.size > 2;
  }));
  await nm.ctx.close();

  // 12: phone
  const ph = await open(browser, '&seed=p&date=2026-07-15', { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 });
  check('phone: no horizontal scroll', await ph.page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth));
  check('phone: buttons at least 48px tall', await ph.page.$$eval('#spots .btn, #journal-btn, .back:not(.mm-nav-legacy)', (b) => b.every((x) => x.getBoundingClientRect().height >= 47.5)));
  check('phone: hold anywhere reels (touch on canvas)', await (async () => {
    await ph.page.evaluate(() => __angler.tap());
    await ph.page.evaluate(() => { const a = __angler; a.advance(a.bite.wait + 0.2); });
    await ph.page.touchscreen.tap(195, 300);
    const st = await ph.page.evaluate(() => __angler.state);
    return st === 'reeling';
  })());
  if (shot) { await ph.page.evaluate(() => { __angler.advance(1); }); await ph.page.screenshot({ path: shot + '/angler-phone-reel.png' }); }
  await ph.page.evaluate(() => { __angler.setHold(true); __angler.advance(3); __angler.setHold(false); __angler.dismiss(); });
  check('phone: still no horizontal scroll with result open', await ph.page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth));
  check('no console errors (phone)', ph.errors.length === 0, ph.errors.join(' | '));
  await ph.ctx.close();

  // keyboard Space works
  const kb = await open(browser, '&seed=k');
  await kb.page.keyboard.down('Space'); await kb.page.keyboard.up('Space');
  check('Space casts', await kb.page.evaluate(() => __angler.state === 'waiting'));
  await kb.ctx.close();

  await browser.close();
  done();
})();
