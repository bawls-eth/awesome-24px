// Lakeside Angler aquarium (collection by spot, complete-set bonus, Hall of Records).
// Serve the repo root: python3 -m http.server 8514 &
// Run: BASE=http://localhost:8514/game/index.html NODE_PATH=$(npm root -g) node game/tests/angler-aquarium.test.js
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
const seedSave = (o) => `if(!sessionStorage.s){sessionStorage.s=1;localStorage.setItem(${JSON.stringify(KEY)}, ${JSON.stringify(JSON.stringify(o))});}`;
const WEST = ['minnow', 'shrimp', 'frog', 'koi', 'bluegill', 'sunfish', 'perch', 'carp', 'bullhead', 'goldfish'];
const caughtOf = (ids, best) => { const c = {}; ids.forEach((id) => { c[id] = { n: 2, best: best || 20 }; }); return c; };

(async () => {
  const browser = await chromium.launch();

  // partial collection
  let p = await open(browser, '&seed=a1', undefined, seedSave({ caught: caughtOf(['koi', 'minnow'], 55) }));
  await p.page.click('#aquarium-btn');
  check('aquarium lists every spot with progress', await p.page.$$eval('.aqspot[data-spot]', (s) => s.length === 6) && /West Pond 2\/\d+/.test(await p.page.textContent('.aqspot[data-spot=west] h3')));
  check('caught species show best size, unknown ones are hidden', await p.page.evaluate(() => {
    const koi = document.querySelector('.aqspot[data-spot=west] .chip[data-id=koi]'), carp = document.querySelector('.aqspot[data-spot=west] .chip[data-id=carp]');
    return /Koi 55 cm/.test(koi.textContent) && carp.textContent === '???';
  }));
  check('no claim button before the set is complete', (await p.page.$('[data-act=claim]')) === null);
  check('Hall of Records lists all three boss fish, none caught', await p.page.$$eval('#hall p[data-id]', (r) => r.length === 3 && r.every((x) => /not yet caught/.test(x.textContent))));
  check('claiming an incomplete set is refused', await p.page.evaluate(() => __angler.aquarium.claim('west') === false && __angler.market.bells === 0));
  check('no console errors / no external requests', p.errors.length === 0 && p.reqs.every((u) => u.startsWith(ORIGIN + '/') || u.startsWith('data:')), p.errors.concat(p.reqs).join(' | '));
  await p.ctx.close();

  // complete set (West Pond) and a boss record
  p = await open(browser, '&seed=a2', undefined, seedSave({ caught: Object.assign(caughtOf(WEST, 30), { old_whiskers: { n: 1, best: 140 } }), bosses: { old_whiskers: true }, trophies: { old_whiskers: true } }));
  const st = await p.page.evaluate(() => window.MMAnglerDepth.aquarium.spotSet(__angler.full, 'west'));
  check('West set counts the regular species only (no boss, no secret)', st.total === 10 && st.complete && !st.claimed, JSON.stringify(st));
  await p.page.click('#aquarium-btn');
  check('complete set shows a claim button', (await p.page.$('.aqspot[data-spot=west] [data-act=claim]')) !== null);
  await p.page.click('.aqspot[data-spot=west] [data-act=claim]');
  check('claim pays the set bonus once and marks the set', await p.page.evaluate(() => __angler.market.bells === 150 && __angler.full.sets.west === true && __angler.aquarium.claim('west') === false && __angler.market.bells === 150));
  check('claimed set shows in the heading and the claim button is gone', /complete set/.test(await p.page.textContent('.aqspot[data-spot=west] h3')) && (await p.page.$('[data-act=claim]')) === null);
  check('Hall of Records shows the boss record and trophy', /Old Whiskers.*caught x1, record 140 cm/.test(await p.page.textContent('#hall p[data-id=old_whiskers]')) && /🏆/.test(await p.page.textContent('#hall p[data-id=old_whiskers]')));
  check('Hall of Records is local only (no share or link controls)', await p.page.$$eval('#aquarium a, #aquarium input', (e) => e.length === 0));
  const saved = JSON.parse(await p.page.evaluate((k) => localStorage.getItem(k), KEY));
  check('claim persisted additively (sets, badges, bells)', saved.sets.west === true && saved.badges.set_west === true && saved.bells === 150 && saved.caught.koi.best === 30);
  await p.page.reload(); await p.page.waitForFunction(() => window.__angler);
  check('claim survives reload and cannot be repeated', await p.page.evaluate(() => __angler.market.bells === 150 && __angler.aquarium.claim('west') === false));
  check('no console errors (complete set)', p.errors.length === 0, p.errors.join(' | '));
  await p.ctx.close();

  // set earned through play: catching the last species makes the claim appear
  p = await open(browser, '&seed=a3&date=2026-07-15', undefined, seedSave({ caught: caughtOf(WEST.filter((x) => x !== 'bullhead'), 25) }));
  const out = await p.page.evaluate(() => {
    const a = __angler; a.forceFish('bullhead'); a.tap(); a.advance(a.bite.wait + 0.2); a.tap();
    for (let i = 0; i < 4000 && a.state === 'reeling'; i++) { a.setHold(a.reel.tension < a.reel.pos); a.advance(1 / 30); }
    a.setHold(false); const o = a.result.outcome; a.dismiss(); return o;
  });
  await p.page.click('#aquarium-btn');
  check('catching the last species completes the set', out === 'caught' && (await p.page.$('.aqspot[data-spot=west] [data-act=claim]')) !== null);
  await p.ctx.close();

  // corrupt data
  for (const bad of ['{"sets":{"west":"yes","moon":true},"badges":{"<img>":true,"gold":1}}', '{"sets":[1],"badges":"x","caught":{"koi":{"n":1,"best":"huge"}}}']) {
    const c = await open(browser, '', undefined, `localStorage.setItem(${JSON.stringify(KEY)}, ${JSON.stringify(bad)})`);
    await c.page.click('#aquarium-btn');
    const ok = await c.page.evaluate(() => { const f = __angler.full; return Object.keys(f.sets).length === 0 && Object.keys(f.badges).length === 0 && document.querySelectorAll('.aqspot').length === 7; });
    check('corrupt aquarium save recovers: ' + bad.slice(0, 18), ok && c.errors.length === 0, c.errors.join(' '));
    await c.ctx.close();
  }

  // phone
  const ph = await open(browser, '&seed=ph', { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 }, seedSave({ caught: Object.assign(caughtOf(WEST, 30), { koi: { n: 1, best: 70 } }) }));
  await ph.page.click('#aquarium-btn');
  check('phone: no horizontal scroll in the aquarium', await ph.page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth));
  check('phone: aquarium buttons are at least 44px', await ph.page.$$eval('#aquarium-btn, #aquarium-close, #aquarium [data-act=claim]', (b) => b.length === 3 && b.every((x) => x.getBoundingClientRect().height >= 44)));
  check('phone: no console errors', ph.errors.length === 0, ph.errors.join(' | '));
  await ph.ctx.close();

  await browser.close();
  done();
})();
