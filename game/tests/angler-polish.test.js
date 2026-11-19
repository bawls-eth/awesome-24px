// Lakeside Angler polish: gear, boss fights, weather, bait. Serve the repo root first:
//   python3 -m http.server 8455 &
//   BASE=http://localhost:8455/game/index.html NODE_PATH=$(npm root -g) node game/tests/angler-polish.test.js
// SHOTS=<dir> writes screenshots. No Firebase, no external network.
const { chromium } = require('playwright');
const { check, done } = require('./helpers');
const ORIGIN = (process.env.BASE || 'http://localhost:8440/game/index.html').replace(/\/game\/index\.html.*$/, '');
const URL = (q) => ORIGIN + '/game/games/angler/index.html?test=1' + (q || '');
const KEY = 'pixeltown-angler-v1';
const SPECIES = ['minnow', 'shrimp', 'frog', 'koi', 'bluegill', 'sunfish', 'perch', 'carp', 'bullhead', 'puffer', 'turtle', 'squid', 'jelly', 'octopus', 'chub', 'crayfish'];
const seed = (ids, extra) => {
  const caught = {}; ids.forEach((id) => { caught[id] = { n: 2, best: 10 }; });
  return JSON.stringify(Object.assign({ caught }, extra || {}));
};

async function open(browser, q, opts, stored) {
  const ctx = await browser.newContext(opts || { viewport: { width: 1000, height: 700 } });
  const page = await ctx.newPage();
  const errors = [], reqs = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  page.on('request', (r) => reqs.push(r.url()));
  page.on('dialog', (d) => { errors.push('dialog: ' + d.message()); d.dismiss(); });
  if (stored !== undefined) await page.addInitScript(([k, v]) => { if (!sessionStorage.seeded) { sessionStorage.seeded = '1'; localStorage.setItem(k, v); } }, [KEY, stored]);
  await page.goto(URL(q));
  await page.waitForFunction(() => window.__angler);
  return { ctx, page, errors, reqs };
}
// hook a fish (optionally forced) and report the reel
const hookZone = (page, fish) => page.evaluate((f) => {
  const a = window.__angler; if (f) a.forceFish(f);
  a.tap(); a.advance(a.bite.wait + 0.2); a.tap();
  return { state: a.state, zone: a.reel && a.reel.zone, fish: a.fish, boss: a.boss };
}, fish);
const abort = (page) => page.evaluate(() => { const a = __angler; a.setHold(true); a.advance(5); a.setHold(false); a.dismiss(); });
const bot = (page) => page.evaluate(() => {
  const a = window.__angler, phases = new Set();
  for (let i = 0; i < 6000 && a.state === 'reeling'; i++) { a.setHold(a.reel.tension < a.reel.pos); a.advance(1 / 30); phases.add(a.phase); }
  a.setHold(false);
  return { out: a.state + ':' + (a.result && a.result.outcome), phases: Array.from(phases).sort() };
});

(async () => {
  const browser = await chromium.launch();
  const shot = process.env.SHOTS;
  const all = [];

  // gear: rods + lures (16 species unlock everything but the golden rod)
  let p = await open(browser, '&seed=g&date=2026-07-15', undefined, seed(SPECIES));
  all.push(p);
  check('rod stick zone is 0.28', (await hookZone(p.page)).zone === 0.28);
  await abort(p.page);
  check('bamboo rod widens the zone to 0.33', await p.page.evaluate(() => __angler.setGear('rod', 'bamboo')) && (await hookZone(p.page)).zone === 0.33);
  await abort(p.page);
  await p.page.evaluate(() => __angler.setGear('rod', 'steel'));
  const zs = (await hookZone(p.page)).zone; await abort(p.page);
  check('steel rod is wider again (0.39)', zs === 0.39, String(zs));
  check('golden rod stays locked without a boss trophy', await p.page.evaluate(() => __angler.setGear('rod', 'golden') === false && __angler.gear.rod === 'steel'));
  const w0 = await p.page.evaluate(() => { __angler.setGear('lure', 'none'); return __angler.poolInfo(); });
  const w1 = await p.page.evaluate(() => { __angler.setGear('lure', 'spinner'); return __angler.poolInfo(); });
  const ratio = (id) => w1.weights[w1.ids.indexOf(id)] / w0.weights[w0.ids.indexOf(id)];
  check('spinner lure doubles darter weights only', w0.ids.length === w1.ids.length && ratio('minnow') === 2 && ratio('koi') === 1, JSON.stringify([ratio('minnow'), ratio('koi')]));
  await p.page.click('#gear-btn');
  check('gear panel documents unlock rules on screen', /species/.test(await p.page.textContent('#gear-rule')) && (await p.page.$$eval('#rods .btn', (b) => b.length)) === 4 && (await p.page.$$eval('#lures .btn', (b) => b.length)) === 7 && /boss trophy/.test(await p.page.textContent('#rods [data-rod=golden]')));
  if (shot) await p.page.screenshot({ path: shot + '/angler-polish-gear-desktop.png' });
  await p.page.click('#lures [data-lure=glow]'); await p.page.click('#gear-close');
  await p.page.reload(); await p.page.waitForFunction(() => window.__angler);
  const stored = JSON.parse(await p.page.evaluate((k) => localStorage.getItem(k), KEY));
  check('gear persists across reload', await p.page.evaluate(() => __angler.gear.rod === 'steel' && __angler.gear.lure === 'glow') && stored.gear.lure === 'glow');
  await p.ctx.close();

  // corrupt / hostile storage loads clean
  const bad = [
    '{{nope',
    JSON.stringify({ gear: { rod: 'laser', lure: '<img>' }, trophies: { evil: true, old_whiskers: 'yes' }, bait: '<b>', extra: 1 }),
    JSON.stringify({ gear: { rod: 'golden', lure: 'rainbow' }, bait: 9999 }),
  ];
  let okAll = true;
  for (const b of bad) {
    const c = await open(browser, '', undefined, b); all.push(c);
    const r = await c.page.evaluate(() => ({ g: __angler.gear, bait: __angler.bait, j: Object.keys(__angler.journal).sort().join() }));
    okAll = okAll && r.g.rod === 'stick' && r.g.lure === 'none' && r.bait <= 99 && r.j === 'bait,bosses,caught,gear,trophies' && c.errors.length === 0;
    await c.ctx.close();
  }
  check('corrupt storage loads clean (unknown keys dropped, locked gear reset, bait clamped)', okAll);

  // boss: threshold
  const west4 = ['minnow', 'koi', 'bluegill', 'carp'];
  p = await open(browser, '&seed=b&date=2026-07-15', undefined, seed(west4.slice(0, 3))); all.push(p);
  check('boss is not ready below the threshold (3/4 West Pond species)', await p.page.evaluate(() => { const b = __angler.bossFor('west'); return b.need === 4 && b.have === 3 && !b.ready; }));
  await p.page.evaluate(() => __angler.setBossChance(1));
  check('no boss appears below the threshold', !(await hookZone(p.page)).boss);
  await abort(p.page); await p.ctx.close();

  p = await open(browser, '&seed=b&date=2026-07-15', undefined, seed(west4)); all.push(p);
  await p.page.evaluate(() => __angler.setBossChance(1));
  const bz = await hookZone(p.page);
  check('Old Whiskers fight starts once 4 West Pond species are caught', bz.state === 'reeling' && bz.boss && bz.fish === 'old_whiskers');
  // snap rule: 1.5 s at max tension
  const snap = await p.page.evaluate(() => {
    const a = __angler; a.setHold(true);
    while (a.reel.tension < 1) a.advance(1 / 60);
    a.advance(1.4); const alive = a.state === 'reeling';
    a.advance(0.2); a.setHold(false);
    return { alive, limit: a.reel.snapLimit, end: a.state + ':' + a.result.outcome };
  });
  check('boss line holds 1.4 s at max tension and snaps after 1.5 s', snap.alive && snap.limit === 1.5 && snap.end === 'result:snapped', JSON.stringify(snap));
  await p.page.evaluate(() => __angler.dismiss());
  check('a snapped boss fight awards no trophy', await p.page.evaluate(() => Object.keys(__angler.journal.trophies).length === 0));
  await p.ctx.close();

  // boss: phases + win + trophy persists (steel rod, 13 species)
  const many = SPECIES.slice(0, 13);
  p = await open(browser, '&seed=w&date=2026-07-15', undefined, seed(many, { gear: { rod: 'steel', lure: 'none' } })); all.push(p);
  await p.page.evaluate(() => __angler.setBossChance(1));
  await hookZone(p.page);
  if (shot) {
    await p.page.evaluate(() => { const a = __angler; a.setHold(true); a.advance(0.3); a.setHold(false); });
    await p.page.screenshot({ path: shot + '/angler-polish-boss-desktop.png' });
  }
  const res = await bot(p.page);
  check('boss phases advance 0 -> 1 -> 2 as the boss tires', res.phases.join() === '0,1,2', res.phases.join());
  check('winning the boss fight records a trophy', res.out === 'result:caught' && await p.page.evaluate(() => __angler.journal.trophies.old_whiskers === true && __angler.journal.bosses.old_whiskers === true), res.out);
  check('result title says TROPHY and fanfare is active', /TROPHY/.test(await p.page.textContent('#res-title')) && await p.page.evaluate(() => __angler.fanfare.active));
  await p.page.reload(); await p.page.waitForFunction(() => window.__angler);
  await p.page.click('#journal-btn');
  check('trophy persists across reload and shows in the journal', await p.page.evaluate(() => __angler.journal.trophies.old_whiskers === true) && /TROPHY/.test(await p.page.textContent('#bossinfo')));
  if (shot) await p.page.screenshot({ path: shot + '/angler-polish-journal-desktop.png' });
  await p.ctx.close();

  // pier boss: sideways pull
  p = await open(browser, '&seed=k&date=2026-07-15T22', undefined, seed(['sardine', 'mackerel', 'sea_bass', 'flounder', 'seahorse'])); all.push(p);
  await p.page.evaluate(() => { __angler.pickSpot('pier'); __angler.setBossChance(1); });
  const kz = await hookZone(p.page);
  const side = await p.page.evaluate(() => { const a = __angler; let m = 0; for (let i = 0; i < 300; i++) { a.advance(1 / 30); m = Math.max(m, Math.abs(a.reel.side)); } return m; });
  check('Pier Kraken fight pulls sideways', kz.fish === 'pier_kraken' && side > 0.5, kz.fish + ' ' + side);
  await p.ctx.close();

  // weather
  p = await open(browser, '&seed=r&date=2026-07-15&weather=rain', undefined, seed(SPECIES)); all.push(p);
  await p.page.evaluate(() => __angler.pickSpot('mangrove'));
  const rain = await p.page.evaluate(() => __angler.poolInfo().ids.indexOf('tarpon') >= 0);
  const icon = await p.page.textContent('#weather-icon');
  await p.page.evaluate(() => __angler.setWeather('clear'));
  const clear = await p.page.evaluate(() => __angler.poolInfo().ids.indexOf('tarpon') >= 0);
  check('rain adds the rain-only Tarpon to the Mangrove pool; clear does not', rain && !clear);
  check('weather icon follows the weather', icon.length > 0 && icon !== (await p.page.textContent('#weather-icon')) && /clear/.test(await p.page.textContent('#weather-name')));
  await p.ctx.close();

  // bait
  p = await open(browser, '&seed=a&date=2026-07-15&bait=150'); all.push(p);
  check('?bait=150 clamps to 99', await p.page.evaluate(() => __angler.bait === 99) && (await p.page.textContent('#bait-val')) === '99');
  await p.page.evaluate(() => __angler.tap());
  check('a cast consumes one bait', await p.page.evaluate(() => __angler.bait === 98 && __angler.state === 'waiting') && (await p.page.textContent('#bait-val')) === '98');
  check('bait shortens the bite wait (max 3 s * 0.7 + 1.5 s * 0.7)', await p.page.evaluate(() => __angler.bite.wait <= 4.5 * 0.7 + 1e-9));
  await p.ctx.close();
  for (const q of ['&bait=-5', '&bait=abc', '&bait=3.7', '&bait=%3Cimg%20src%3Dx%20onerror%3Dalert(1)%3E']) {
    const c = await open(browser, '&seed=a' + q); all.push(c);
    const r = await c.page.evaluate(() => ({ bait: __angler.bait, imgs: document.querySelectorAll('img').length }));
    check('invalid or hostile ' + decodeURIComponent(q.slice(1)).slice(0, 24) + ' is ignored', r.bait === 0 && r.imgs === 0 && c.errors.length === 0, JSON.stringify(r));
    await c.ctx.close();
  }
  p = await open(browser, '&seed=a&bait=0'); all.push(p);
  await p.page.evaluate(() => __angler.tap());
  check('with 0 bait casts still work and stay at 0', await p.page.evaluate(() => __angler.bait === 0 && __angler.state === 'waiting'));
  await p.ctx.close();

  // reduced motion fanfare
  p = await open(browser, '&seed=m&date=2026-07-15', { viewport: { width: 1000, height: 700 }, reducedMotion: 'reduce' }, seed(many, { gear: { rod: 'steel', lure: 'none' } })); all.push(p);
  await hookZone(p.page, 'bluegill'); await bot(p.page);
  check('reduced-motion: fanfare is a static banner', await p.page.evaluate(() => __angler.reduced && __angler.fanfare.reduced && __angler.state === 'result'));
  await p.ctx.close();

  // phone
  const ph = await open(browser, '&seed=p&date=2026-07-15&weather=rain&bait=5', { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 }, seed(west4)); all.push(ph);
  check('phone 390x844: no horizontal scroll', await ph.page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth));
  check('phone: buttons at least 48px tall', await ph.page.$$eval('#spots .btn, #journal-btn, #gear-btn, .back', (b) => b.every((x) => x.getBoundingClientRect().height >= 47.5)));
  if (shot) await ph.page.screenshot({ path: shot + '/angler-polish-phone-idle.png' });
  await ph.page.click('#gear-btn');
  check('phone: gear panel has no horizontal scroll', await ph.page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth));
  if (shot) await ph.page.screenshot({ path: shot + '/angler-polish-phone-gear.png' });
  await ph.page.click('#gear-close');
  await ph.page.evaluate(() => { __angler.setBossChance(1); });
  await hookZone(ph.page);
  await ph.page.evaluate(() => { const a = __angler; a.setHold(true); a.advance(0.4); a.setHold(false); });
  if (shot) await ph.page.screenshot({ path: shot + '/angler-polish-phone-boss.png' });
  await abort(ph.page);

  check('no console errors', all.every((x) => x.errors.length === 0), all.map((x) => x.errors.join('|')).join(' '));
  const off = [].concat(...all.map((x) => x.reqs)).filter((u) => u.indexOf(ORIGIN) !== 0 && u.indexOf('data:') !== 0);
  check('zero off-origin requests', off.length === 0, off.join(' '));
  await browser.close();
  done();
})();
