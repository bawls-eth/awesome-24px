// Lakeside Angler boss encounter: lair gate, surge fight, splash cue, Hall of Records trophy, corrupt-save recovery, phone targets.
// Serve the repo root: python3 -m http.server 8525 &
// Run: BASE=http://localhost:8525/game/index.html NODE_PATH=$(npm root -g) node game/tests/angler-boss.test.js
const { chromium } = require('playwright');
const { check, done } = require('./helpers');
const ORIGIN = (process.env.BASE || 'http://localhost:8440/game/index.html').replace(/\/game\/index\.html.*$/, '');
const URL = (q) => ORIGIN + '/game/games/angler/index.html?test=1' + (q || '');
const KEY = 'pixeltown-angler-v1';
const WEST4 = ['minnow', 'koi', 'bluegill', 'carp'];
const save = (extra) => { const caught = {}; WEST4.forEach((id) => { caught[id] = { n: 2, best: 10 }; }); return JSON.stringify(Object.assign({ caught }, extra || {})); };

async function open(browser, q, opts, stored) {
  const ctx = await browser.newContext(opts || { viewport: { width: 1000, height: 700 } });
  const page = await ctx.newPage();
  const errors = [], reqs = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  page.on('request', (r) => reqs.push(r.url()));
  if (stored !== undefined) await page.addInitScript(([k, v]) => { if (!sessionStorage.seeded) { sessionStorage.seeded = '1'; localStorage.setItem(k, v); } }, [KEY, stored]);
  await page.goto(URL(q));
  await page.waitForFunction(() => window.__angler);
  return { ctx, page, errors, reqs };
}
// cast + hook whatever bites (gate stays ON: setBossChance(1) turns it off, so turn it back on)
const hook = (page) => page.evaluate(() => {
  const a = window.__angler; a.setBossGate(true);
  a.tap(); a.advance(a.bite.wait + 0.2); a.tap();
  return { state: a.state, boss: a.boss, fish: a.fish };
});
const prep = (page) => page.evaluate(() => { __angler.setBossChance(1); __angler.setBossGate(true); });
// reel with the bot; easeOff = release during surges
const bot = (page, easeOff) => page.evaluate((ease) => {
  const a = window.__angler; let sawSurge = false;
  for (let i = 0; i < 9000 && a.state === 'reeling'; i++) {
    const ph = a.boss2.phase(); if (ph === 'surge') sawSurge = true;
    a.setHold(a.reel.tension < a.reel.pos && !(ease && ph === 'surge')); a.advance(1 / 30);
  }
  a.setHold(false);
  return { out: a.state + ':' + (a.result && a.result.outcome), sawSurge };
}, easeOff);

(async () => {
  const browser = await chromium.launch();
  const all = [];

  // ---- gate: boss only after N normal catches at its spot ----
  let p = await open(browser, '&seed=g1&date=2026-07-15', undefined, save()); all.push(p);
  await prep(p.page);
  const h0 = await hook(p.page);
  check('boss does not show before N normal catches at its spot', h0.state === 'reeling' && !h0.boss && h0.fish !== 'old_whiskers', JSON.stringify(h0));
  await p.page.evaluate(() => { const a = __angler; a.setHold(true); a.advance(6); a.setHold(false); a.dismiss(); });
  check('boss UI stays hidden for a normal fish', await p.page.$eval('#boss-ui', (e) => e.hidden));
  await p.ctx.close();

  p = await open(browser, '&seed=g2&date=2026-07-15', undefined, save({ lair: { west: 5 } })); all.push(p);
  check('lair count loads from the save and gate is 3..5', await p.page.evaluate(() => __angler.boss2.lair.west === 5 && __angler.boss2.gate === true));
  await prep(p.page);
  const h1 = await hook(p.page);
  check('Old Whiskers appears once the seeded gate is met', h1.boss && h1.fish === 'old_whiskers', JSON.stringify(h1));
  check('lair goes quiet after the boss shows', await p.page.evaluate(() => !__angler.boss2.lair.west));
  const intro = await p.page.textContent('#msg');
  check('short intro line is shown', /Old Whiskers/.test(intro) && /Ease off/.test(intro), intro);
  check('splash cue starts with the fight', await p.page.evaluate(() => !!__angler.boss2.splash));
  const ui = await p.page.evaluate(() => ({ hidden: document.getElementById('boss-ui').hidden, sched: __angler.boss2.surge.length }));
  check('boss reel bar visible with a seeded surge schedule', !ui.hidden && ui.sched >= 3, JSON.stringify(ui));
  // jump to the first surge: label tells you to ease off, holding snaps the line
  const surge = await p.page.evaluate(() => {
    const a = __angler, w = a.boss2.surge[0];
    a.setHold(false);
    while (a.boss2.time < w.start - 0.3 && a.state === 'reeling') a.advance(1 / 60);
    const warn = document.getElementById('boss-label').textContent;
    while (a.boss2.phase() !== 'surge' && a.state === 'reeling') a.advance(1 / 60);
    const label = document.getElementById('boss-label').textContent, ph = document.getElementById('boss-bar').dataset.phase;
    return { warn, label, ph, state: a.state };
  });
  check('warning then EASE OFF label during a surge', /get ready/.test(surge.warn) && /EASE OFF/.test(surge.label) && surge.ph === 'surge' && surge.state === 'reeling', JSON.stringify(surge));
  const snap = await p.page.evaluate(() => { const a = __angler; a.setHold(true); for (let i = 0; i < 180 && a.state === 'reeling'; i++) a.advance(1 / 60); a.setHold(false); return { s: a.state, o: a.result && a.result.outcome, tro: Object.keys(a.journal.trophies).length }; });
  check('holding through a surge snaps the line, no trophy', snap.s === 'result' && snap.o === 'snapped' && snap.tro === 0, JSON.stringify(snap));
  await p.page.evaluate(() => __angler.dismiss());
  check('boss UI hides after the fight', await p.page.$eval('#boss-ui', (e) => e.hidden));
  await p.ctx.close();

  // ---- win by easing off: trophy + hall entry + journal ----
  p = await open(browser, '&seed=g3&date=2026-07-15', undefined, save({ lair: { west: 5 }, gear: { rod: 'stick', lure: 'none' } })); all.push(p);
  await p.page.evaluate(() => __angler.setGear('rod', 'bamboo'));
  await prep(p.page); await hook(p.page);
  const res = await bot(p.page, true);
  check('easing off during surges wins the fight', res.out === 'result:caught' && res.sawSurge, JSON.stringify(res));
  check('result says TROPHY', /TROPHY/.test(await p.page.textContent('#res-title')) && /Hall of Records/.test(await p.page.textContent('#res-detail')));
  const hall = await p.page.evaluate(() => __angler.journal.hall.old_whiskers);
  check('hall entry has size and ISO date', hall && hall.size > 0 && hall.date === '2026-07-15', JSON.stringify(hall));
  await p.page.reload(); await p.page.waitForFunction(() => window.__angler);
  check('hall entry persisted across reload', await p.page.evaluate(() => __angler.journal.hall.old_whiskers.date === '2026-07-15' && __angler.journal.trophies.old_whiskers === true));
  await p.page.click('#aquarium-btn');
  const hallTxt = await p.page.textContent('#hall p[data-id=old_whiskers]');
  check('Hall of Records shows trophy size and date', /trophy: \d+ cm on 2026-07-15/.test(hallTxt), hallTxt);
  await p.page.click('#aquarium-close');
  await p.page.click('#journal-btn');
  check('journal marks the boss CAUGHT', /CAUGHT/.test(await p.page.textContent('#bossinfo')) && await p.page.$eval('#jgrid .card[data-id=old_whiskers] .nm', (e) => /CAUGHT/.test(e.textContent)));
  await p.ctx.close();

  // ---- hall text is textContent only: a hostile name/date never becomes markup ----
  p = await open(browser, '&seed=g4', undefined, save({ trophies: { old_whiskers: true }, bosses: { old_whiskers: true }, caught: { old_whiskers: { n: 1, best: 100 } }, hall: { old_whiskers: { size: 100, date: '<img src=x onerror=alert(1)>' } } })); all.push(p);
  await p.page.click('#aquarium-btn');
  check('hostile hall date is dropped, no injected nodes', await p.page.evaluate(() => !document.querySelector('#hall img') && !/<img/.test(document.getElementById('hall').textContent) && !__angler.journal.hall));
  await p.ctx.close();

  // ---- corrupt saves recover ----
  let okAll = true;
  for (const bad of ['{not json', '[1,2]', '"x"', JSON.stringify({ lair: 'x', hall: [] }), JSON.stringify({ lair: { west: 'zz', ice: -4 }, hall: { old_whiskers: { size: 'a' }, pier_kraken: 5 } }), JSON.stringify({ hall: null, lair: null })]) {
    const c = await open(browser, '&seed=c', undefined, bad); all.push(c);
    const r = await c.page.evaluate(() => ({ lair: Object.keys(__angler.full.lair).length, hall: Object.keys(__angler.full.hall).length, keys: Object.keys(__angler.journal).sort().join() }));
    okAll = okAll && r.lair === 0 && r.hall === 0 && r.keys === 'bait,bosses,caught,gear,trophies' && c.errors.length === 0;
    await c.ctx.close();
  }
  check('corrupt lair/hall saves load as defaults without errors', okAll);

  // ---- reduce motion: static splash, no crash ----
  p = await open(browser, '&seed=g5&date=2026-07-15', { viewport: { width: 1000, height: 700 }, reducedMotion: 'reduce' }, save({ lair: { west: 5 } })); all.push(p);
  await prep(p.page); await hook(p.page);
  const rm = await p.page.evaluate(() => { const a = __angler; a.advance(3); return { reduced: a.reduced, splash: !!a.boss2.splash, state: a.state }; });
  check('reduce motion: splash cue still drawn (static) during the fight', rm.reduced && rm.splash && rm.state === 'reeling', JSON.stringify(rm));
  await p.ctx.close();

  // ---- phone ----
  const ph = await open(browser, '&seed=g6&date=2026-07-15', { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 }, save({ lair: { west: 5 } })); all.push(ph);
  await prep(ph.page); await hook(ph.page);
  check('phone 390x844: no horizontal scroll in the boss fight', await ph.page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth));
  const sz = await ph.page.evaluate(() => { const r = (id) => document.getElementById(id).getBoundingClientRect(); const b = r('boss-bar'), t = r('reel-btn'); return { barH: b.height, barW: b.width, btnW: t.width, btnH: t.height, inView: t.right <= window.innerWidth && b.left >= 0 }; });
  check('phone: reel bar and button are >= 44 px', sz.barH >= 44 && sz.btnH >= 44 && sz.btnW >= 44 && sz.barW >= 44 && sz.inView, JSON.stringify(sz));
  const btnHold = await ph.page.evaluate(() => {
    const b = document.getElementById('reel-btn'), a = __angler, t0 = a.reel.tension;
    b.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, pointerId: 1 })); a.advance(0.2);
    const up = a.reel.tension; b.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, pointerId: 1 })); a.advance(0.2);
    return up > t0 && a.reel.tension < up;
  });
  check('on-screen reel button holds and releases the reel', btnHold);
  await ph.page.evaluate(() => { __angler.setHold(true); __angler.advance(8); __angler.setHold(false); __angler.dismiss(); });
  check('phone: other buttons stay >= 44 px', await ph.page.$$eval('#spots .btn, #journal-btn, #aquarium-btn', (b) => b.every((x) => x.getBoundingClientRect().height >= 44)));

  check('no console errors', all.every((x) => x.errors.length === 0), all.map((x) => x.errors.join('|')).join(' '));
  const off = [].concat(...all.map((x) => x.reqs)).filter((u) => u.indexOf(ORIGIN) !== 0 && u.indexOf('data:') !== 0);
  check('zero off-origin requests', off.length === 0, off.join(' '));
  await browser.close();
  done();
})();
