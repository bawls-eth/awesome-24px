// Lantern clarity pass (FUN1): the hero card names its level "Lantern Level" so it never reads as the Realm tag next to it,
// the Realm tag has a spoken label, and each hero card shows one goal to chase (next ability unlock, read-only MMUnlocks).
// Phone 390x844 + desktop, DB blocked, standalone. Serve the repo root first:  python3 -m http.server 9354 &
// Run: NODE_PATH=$(npm root -g) BASE=http://localhost:9354/game/index.html node game/tests/lantern-fun.test.js
const { chromium } = require('playwright');
const { blockDb } = require('./helpers');
let failed = 0;
function check(name, cond, extra = '') { console.log((cond ? 'PASS ' : 'FAIL ') + name + (cond ? '' : ' ' + extra)); if (!cond) failed++; }
const ORIGIN = (process.env.BASE || 'http://localhost:9354/game/index.html').replace(/\/game\/index\.html.*$/, '');
const URL_ = ORIGIN + '/game/games/mad-maze/lantern.html';
const hero = (o) => Object.assign({ id: 'hero-ranger-1', name: 'Thicket Ranger', cls: 'ranger', level: 2, xp: 0, fame: 5, bonus: 0, mode: 'classic', items: [] }, o);
const SEED = {
  'pixeltown-mm-v1': JSON.stringify({ v: 1, fame: 12, heroes: [hero(), hero({ id: 'hero-ranger-2', name: 'Old Hand', level: 20 })] }),
  'pixeltown-save-v1': JSON.stringify({ name: 'N', realm: { level: 4, xp: 30, kills: 41, shards: 36, items: [] } }),
  'pixeltown-realm-v1': JSON.stringify({ v: 1, stats: { portals: 1 } })
};
const errors = [], dbs = [];
async function open(browser, opts) {
  const ctx = await browser.newContext(opts);
  dbs.push(await blockDb(ctx));
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  await page.goto(ORIGIN + '/game/games/mad-maze/lantern.css');
  await page.evaluate((s) => { localStorage.clear(); Object.keys(s).forEach((k) => localStorage.setItem(k, s[k])); }, SEED);
  await page.goto(URL_);
  await page.waitForSelector('#heroes li[data-hero]');
  return { ctx, page };
}

(async () => {
  const browser = await chromium.launch();
  const ph = await open(browser, { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  const p = ph.page;
  const cards = await p.evaluate(() => [...document.querySelectorAll('#heroes li[data-hero]')].map((li) => {
    const t = li.querySelector('.realm-lv'), g = li.querySelector('.nextgoal');
    return { id: li.dataset.hero, meta: li.querySelector('.meta').textContent, tag: t ? t.textContent : null, aria: t ? t.getAttribute('aria-label') : null,
      goal: g ? g.textContent : null, goalLv: g ? g.dataset.nextLv : null, goalPx: g ? parseFloat(getComputedStyle(g).fontSize) : 0 };
  }));
  check('two hero cards', cards.length === 2, JSON.stringify(cards));
  check('card level says Lantern Level', /Lantern Level 2/.test(cards[0].meta) && /Lantern Level 20/.test(cards[1].meta), JSON.stringify(cards));
  check('Realm tag stays on the Realm hero with a spoken label', cards[0].tag === 'Realm Lv 4' && cards[0].aria === 'Realm level 4 (the level the Realm shows)' && cards[1].tag === null, JSON.stringify(cards));
  check('a low-level hero shows its next unlock to chase', /^Next unlock: .+ at Lantern Level \d+ \(\d+ to go\)$/.test(cards[0].goal || '') && Number(cards[0].goalLv) > 2, JSON.stringify(cards[0]));
  const toGo = Number((cards[0].goal || '').match(/\((\d+) to go\)/)[1]);
  check('the "to go" count matches the unlock level', toGo === Number(cards[0].goalLv) - 2, cards[0].goal);
  check('a max-level hero gets an honest done line', /^Every unlock reached\./.test(cards[1].goal || '') && cards[1].goalLv === '', JSON.stringify(cards[1]));
  check('goal text is readable (12 px+)', cards.every((c) => c.goalPx >= 12), JSON.stringify(cards.map((c) => c.goalPx)));
  const targets = await p.evaluate(() => [...document.querySelectorAll('#heroes button, #start')].filter((e) => { const r = e.getBoundingClientRect(); return r.width > 0 && (r.width < 44 || r.height < 44); }).map((e) => e.className));
  check('hero card buttons and Start run are 44 px+ on a phone', targets.length === 0, JSON.stringify(targets));
  const nav = await p.evaluate(() => { const m = document.querySelector('.mm-nav-btn, #mm-nav-btn, [data-mm-nav]'); const s = document.getElementById('start').getBoundingClientRect(); if (!m) return { ok: true, none: true }; const r = m.getBoundingClientRect(); return { ok: r.bottom <= s.top || r.top >= s.bottom || r.right <= s.left || r.left >= s.right }; });
  check('Menu button does not overlap Start run', nav.ok, JSON.stringify(nav));
  const wide = await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth);
  check('no horizontal scroll on a phone', wide);
  await ph.ctx.close();

  const dk = await open(browser, { viewport: { width: 1200, height: 800 } });
  const dmeta = await dk.page.evaluate(() => document.querySelector('#heroes li[data-hero] .meta').textContent);
  check('desktop card reads Lantern Level too', /Lantern Level 2/.test(dmeta), dmeta);
  await dk.ctx.close();

  check('console clean', errors.length === 0, JSON.stringify(errors));
  check('zero DB requests', dbs.every((x) => x.attempts() === 0), JSON.stringify(dbs.map((x) => x.attempts())));
  await browser.close();
  console.log(failed ? failed + ' FAILED' : 'ALL PASSED');
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
