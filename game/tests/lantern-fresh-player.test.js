// Lantern Camp for a brand-new player (review 3 #8): no "Welcome back / Legacy Ranger" offer unless an old arena save with progress
// exists, and the hero card shows the same level the Realm shows for that hero (read-only, `pixeltown-save-v1`.realm.level).
// Phone 390x844, DB blocked. Serve the repo root first:  python3 -m http.server 8440 &
// Run: NODE_PATH=$(npm root -g) BASE=http://localhost:8440/game/index.html node game/tests/lantern-fresh-player.test.js
const { chromium } = require('playwright');
const { blockDb } = require('./helpers');
let failed = 0;
function check(name, cond, extra = '') { console.log((cond ? 'PASS ' : 'FAIL ') + name + (cond ? '' : ' ' + extra)); if (!cond) failed++; }
const ORIGIN = (process.env.BASE || 'http://localhost:8440/game/index.html').replace(/\/game\/index\.html.*$/, '');
const URL_ = ORIGIN + '/game/games/mad-maze/lantern.html?test=1';
const MM = 'pixeltown-mm-v1', SAVE = 'pixeltown-save-v1', ACTIVE = 'pixeltown-mm-active-v1', WORLD = 'pixeltown-realm-v1';
const hero = (o) => Object.assign({ id: 'hero-ranger-1', name: 'Thicket Ranger', cls: 'ranger', level: 1, xp: 0, fame: 0, bonus: 0, mode: 'classic', items: [] }, o);
// what 10 minutes in today's Realm leaves behind: the shared realm block at Lv 4 plus the world Realm's own save
const FRESH_REALM = JSON.stringify({ name: 'Newbie', realm: { level: 4, xp: 30, kills: 41, shards: 36, items: [{ n: 1, id: 'luckyring', r: 0 }] } });
const WORLD_SAVE = JSON.stringify({ v: 1, stats: { portals: 1 } });

const all = { errors: [], reqs: [], db: [] };
async function open(browser, seed) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  const db = await blockDb(ctx); all.db.push(db);
  const page = await ctx.newPage();
  page.on('pageerror', (e) => all.errors.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error') all.errors.push('console: ' + m.text()); });
  page.on('request', (r) => all.reqs.push(r.url()));
  await page.goto(ORIGIN + '/game/games/mad-maze/lantern.css'); // same-origin blank page to seed storage
  await page.evaluate((s) => { localStorage.clear(); Object.keys(s).forEach((k) => localStorage.setItem(k, s[k])); }, seed || {});
  await page.goto(URL_);
  await page.waitForSelector('#heroes', { state: 'attached' });
  return { ctx, page };
}
const offer = (p) => p.isVisible('#import-offer');
const tags = (p) => p.evaluate(() => [...document.querySelectorAll('#heroes li[data-hero]')].map((li) => { const t = li.querySelector('.realm-lv'); return { id: li.dataset.hero, realm: t ? t.textContent : null, meta: li.querySelector('.meta').textContent }; }));

(async () => {
  const browser = await chromium.launch();

  // 1. The review's player: hero made in the Realm picker, 10 minutes of play (Realm Lv 4), then opens the Lantern
  let s = await open(browser, { [SAVE]: FRESH_REALM, [WORLD]: WORLD_SAVE, [MM]: JSON.stringify({ v: 1, heroes: [hero()] }), [ACTIVE]: JSON.stringify({ v: 1, heroId: 'hero-ranger-1' }) });
  const before = await s.page.evaluate((K) => K.map((k) => localStorage.getItem(k)), [SAVE, WORLD, MM, ACTIVE]);
  check('new player with a Realm hero: no "Welcome back" Legacy Ranger offer', !(await offer(s.page)) && !/Welcome back|Legacy Ranger/.test(await s.page.evaluate(() => document.body.innerText)));
  let t = await tags(s.page);
  check('the hero card shows the Realm level the Realm HUD shows (Realm Lv 4)', t.length === 1 && t[0].realm === 'Realm Lv 4', JSON.stringify(t));
  check('the card level text stays the Lantern level (Level 1) next to the Realm tag', /Level 1/.test(t[0].meta) && /Realm Lv 4/.test(t[0].meta), t[0].meta);
  check('reading the Realm level is read-only (all four keys byte-identical)', JSON.stringify(before) === JSON.stringify(await s.page.evaluate((K) => K.map((k) => localStorage.getItem(k)), [SAVE, WORLD, MM, ACTIVE])));
  check('no horizontal scroll at 390', await s.page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth));
  await s.ctx.close();

  // 2. Two heroes: the Realm plays as the active one, so only that card carries the Realm tag; a stale active id falls back to the first hero
  s = await open(browser, { [SAVE]: FRESH_REALM, [WORLD]: WORLD_SAVE, [MM]: JSON.stringify({ v: 1, heroes: [hero(), hero({ id: 'hero-herald-1', name: 'Bright Herald', cls: 'herald', level: 2 })] }), [ACTIVE]: JSON.stringify({ v: 1, heroId: 'hero-herald-1' }) });
  t = await tags(s.page);
  check('the Realm tag sits on the Realm\'s active hero only (same hero id)', t.length === 2 && t[0].realm === null && t[1].realm === 'Realm Lv 4', JSON.stringify(t));
  await s.page.evaluate((K) => { localStorage.setItem(K, JSON.stringify({ v: 1, heroId: 'gone' })); window.__lantern.reload(); }, ACTIVE);
  t = await tags(s.page);
  check('a stale active id falls back to the first hero, as the Realm picker does', t[0].realm === 'Realm Lv 4' && t[1].realm === null, JSON.stringify(t));
  await s.ctx.close();

  // 3. Brand new: nothing but a Daily-gift shard payout in the realm block -> no offer, no hero, no tag
  s = await open(browser, { [SAVE]: JSON.stringify({ name: 'Gifted', realm: { shards: 36 } }) });
  check('a gift-only realm block (no progress) shows no legacy offer', !(await offer(s.page)));
  await s.ctx.close();
  s = await open(browser, {});
  check('an empty browser shows no legacy offer and no hero cards', !(await offer(s.page)) && (await tags(s.page)).length === 0);
  await s.ctx.close();

  // 4. A real old arena save (progress, no world Realm, no heroes) still gets the offer
  s = await open(browser, { [SAVE]: JSON.stringify({ name: 'Bob', realm: { level: 7, xp: 120, items: [{ n: 1, id: 'heartcharm', r: 1 }] } }) });
  check('an old arena save with progress still shows the Welcome back offer', await offer(s.page));
  await s.page.click('#import-yes');
  check('importing it still makes the Legacy Ranger at level 7', await s.page.evaluate((K) => { const p = JSON.parse(localStorage.getItem(K)); return p.heroes.length === 1 && p.heroes[0].id === 'legacy-ranger' && p.heroes[0].level === 7; }, MM));
  await s.ctx.close();

  // 5. Pure helpers (MMProfile, legacy import display)
  s = await open(browser, {});
  const pure = await s.page.evaluate(() => {
    const P = window.MMProfile;
    return [P.legacyOffer({ level: 4 }, { heroes: [{ id: 'a', cls: 'ranger', level: 1 }] }, true) === false,
      P.legacyOffer({ level: 4 }, null, true) === true, P.legacyOffer({ shards: 9 }, null, false) === false, P.legacyOffer(null, null, false) === false,
      P.legacyOffer({ level: 3 }, { heroes: [], migratedFrom: 'pixeltown-save-v1' }, false) === false,
      P.realmLevel({ level: 99 }) === 20, P.realmLevel({}) === 1, P.realmLevel(null) === null, P.realmHeroId({ heroes: [] }, null) === null];
  });
  check('MMProfile.legacyOffer / realmLevel / realmHeroId edge cases', pure.every(Boolean), JSON.stringify(pure));
  await s.ctx.close();

  check('no Firebase / net.js requests (DB 0)', all.db.every((d) => d.attempts() === 0) && !all.reqs.some((u) => /firebase|\/net\.js/i.test(u)), JSON.stringify(all.reqs.filter((u) => /firebase|net\.js/i.test(u))));
  check('no console errors', all.errors.length === 0, all.errors.join(' | '));
  await browser.close();
  console.log(failed ? failed + ' FAILED' : 'ALL PASSED');
  process.exit(failed ? 1 : 0);
})();
