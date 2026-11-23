// G-05 (b11-01, owner default O-05) on the Lantern page: no Rekindle button on any living hero card; Rekindle sits on each Keepsake in the
// stash; a fresh Keepsake rekindles once (level min(10, L/2)) and then reads "Rekindled"; used / hardcore / roster-full Keepsakes are
// disabled with a reason. Local only: the Lantern page makes no database request. No chat, no Firebase writes.
// Run: BASE=http://localhost:8440/game/index.html node game/tests/beta-g05-rekindle.test.js
const { chromium } = require('playwright');
const { check, done, blockDb } = require('./helpers');
const ORIGIN = (process.env.BASE || 'http://localhost:8440/game/index.html').replace(/\/game\/index\.html.*$/, '');
const URL_ = ORIGIN + '/game/games/mad-maze/lantern.html';
const MM = 'pixeltown-mm-v1';
const hero = (o) => Object.assign({ id: 'h1', name: 'Tester', cls: 'ranger', level: 1, xp: 0, fame: 0, bonus: 0, mode: 'classic', items: [] }, o);
const KS = (o) => Object.assign({ id: 'keepsake', r: 0, keepsake: true, from: 'Wren', cls: 'herald', level: 18 }, o);

async function open(browser, mm, viewport) {
  const ctx = await browser.newContext({ viewport: viewport || { width: 1000, height: 800 } });
  await blockDb(ctx);
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  await page.goto(ORIGIN + '/game/games/mad-maze/lantern.css');
  await page.evaluate(([K, v]) => localStorage.setItem(K, v), [MM, JSON.stringify(mm)]);
  await page.goto(URL_);
  await page.waitForSelector('#heroes', { state: 'attached' });
  return { ctx, page, errors };
}
const prof = (page) => page.evaluate((K) => JSON.parse(localStorage.getItem(K) || 'null'), MM);
const rows = (page) => page.evaluate(() => [...document.querySelectorAll('#rekindle-list .rekindle-ks')].map((b) => { const r = b.getBoundingClientRect(); return { slot: Number(b.dataset.slot), t: b.textContent, dis: b.disabled, why: b.title, h: r.height, row: b.closest('li').textContent }; }));

(async () => {
  const browser = await chromium.launch();
  const stash = [KS(), KS({ from: 'Old', level: 8, rk: true }), KS({ from: 'Grim', md: 'hardcore', level: 14 }), { id: 'luckring', r: 2 }].concat(new Array(12).fill(null));
  let s = await open(browser, { v: 1, heroes: [hero({ id: 'h1', name: 'Mossy', level: 20 }), hero({ id: 'h2', name: 'Chilly', cls: 'frostcaller', level: 9 })], stash, fame: 0, mode: 'classic', hall: [], migratedFrom: null });
  const p = s.page;
  check('3. no Rekindle button on any living hero card', (await p.locator('#heroes .rekindle').count()) === 0 && (await p.locator('#heroes li[data-hero]').count()) === 2);
  let r = await rows(p);
  check('3b. one Rekindle row per Keepsake (3), none for a plain item', r.length === 3 && r.map((x) => x.slot).join() === '0,1,2', JSON.stringify(r));
  check('3c. the fresh Keepsake button is enabled, names the hero and the new level, and is >= 44 px', !r[0].dis && /Rekindle Wren \(Lv 9\)/.test(r[0].t) && r[0].h >= 44, JSON.stringify(r[0]));
  check('3d. a used Keepsake is disabled with a reason ("already rekindled")', r[1].dis && /already rekindled/.test(r[1].why) && /already rekindled/.test(r[1].row), JSON.stringify(r[1]));
  check('3e. a hardcore Keepsake is disabled with a reason', r[2].dis && /Hardcore/.test(r[2].why), JSON.stringify(r[2]));
  await p.locator('#rekindle-list .rekindle-ks[data-slot="0"]').click();
  const pf = await prof(p);
  const wren = pf.heroes.filter((h) => h.name === 'Wren');
  check('2. a click rekindles one level-9 herald and marks the Keepsake rk (kept in the stash)', wren.length === 1 && wren[0].level === 9 && wren[0].cls === 'herald' && pf.stash[0].keepsake === true && pf.stash[0].rk === true && pf.heroes.length === 3, JSON.stringify(pf.heroes));
  r = await rows(p);
  check('2b. the same Keepsake now reads "Rekindled" and is disabled', r[0].dis && /Rekindled/.test(r[0].t), JSON.stringify(r[0]));
  check('2c. the status line says the hero was rekindled', /Wren is rekindled at level 9/.test(await p.textContent('#status')));
  check('no page errors', s.errors.length === 0, s.errors.join(' | '));
  await s.ctx.close();

  // roster full: the Keepsake is disabled with the roster reason
  const hs = []; for (let i = 0; i < 12; i++) hs.push(hero({ id: 'h' + i, name: 'N' + i }));
  s = await open(browser, { v: 1, heroes: hs, stash: [KS()].concat(new Array(15).fill(null)), fame: 0, mode: 'classic', hall: [], migratedFrom: null }, { width: 390, height: 844 });
  r = await rows(s.page);
  check('3f. roster full: the Keepsake Rekindle is disabled with "roster is full"', r.length === 1 && r[0].dis && /roster is full/.test(r[0].why), JSON.stringify(r));
  check('3g. phone 390: no horizontal scroll', await s.page.evaluate(() => document.documentElement.scrollWidth <= 391));
  await s.ctx.close();

  await browser.close();
  done();
})().catch((e) => { console.error(e); process.exit(1); });
