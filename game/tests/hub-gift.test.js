// GF2: daily gift card on the hub. Serve the repo root:  python3 -m http.server 8666 &
// Run: BASE=http://localhost:8666/game/index.html NODE_PATH=$(npm root -g) node game/tests/hub-gift.test.js
const { chromium } = require('playwright');
const { check, done } = require('./helpers');
const ORIGIN = (process.env.BASE || 'http://localhost:8440/game/index.html').replace(/\/game\/index\.html.*$/, '');
const TOWN = { name: 'Mossy', species: 'coolcats', frame: 2, coins: 77, realm: { shards: 100, level: 3 } };
const GK = 'pixeltown-gift-v1', SK = 'pixeltown-save-v1', MK = 'pixeltown-mm-v1';
const G = require('../shared/mm-gift.js');

async function open(browser, { seed, date, viewport, ctx: reuse } = {}) {
  const ctx = reuse || await browser.newContext({ viewport: viewport || { width: 1000, height: 760 } });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  if (seed) {
    await page.addInitScript((s) => {
      if (sessionStorage.seeded) return;
      sessionStorage.seeded = '1';
      Object.keys(s).forEach((k) => localStorage.setItem(k, typeof s[k] === 'string' ? s[k] : JSON.stringify(s[k])));
    }, seed);
  }
  await page.goto(ORIGIN + '/game/hub/index.html?test=1&gdate=' + (date || '2026-11-21'));
  await page.waitForFunction(() => window.__hub);
  return { ctx, page, errors };
}
const ls = (page, k) => page.evaluate((x) => localStorage.getItem(x), k);
const lj = async (page, k) => JSON.parse(await ls(page, k));
async function openCard(page) { await page.click('#gift-btn'); await page.waitForSelector('#gift-card:not([hidden])'); }

(async () => {
  const browser = await chromium.launch();
  let s = await open(browser, { seed: { [SK]: TOWN } });
  const pg = s.page;
  check('card starts closed; opens from the Daily gift button', await pg.locator('#gift-card').isHidden());
  await openCard(pg);
  const gift1 = G.giftFor(1);
  check('shows today\'s gift and total days claimed 0', (await pg.textContent('#gift-today')) === 'Today\'s gift: ' + gift1.shards + ' shards' && (await pg.textContent('#gift-total')) === 'Days claimed: 0');
  const box = await pg.locator('#gift-claim').boundingBox();
  check('claim button is at least 44 px high and wide', box.height >= 44 && box.width >= 44, JSON.stringify(box));
  await pg.click('#gift-claim');
  let save = await lj(pg, SK), gs = await lj(pg, GK);
  check('claim pays the shards into realm.shards and counts day 1', save.realm.shards === 100 + gift1.shards && gs.days === 1 && gs.last === '2026-11-21', JSON.stringify([save.realm, gs]));
  check('other town save fields untouched', save.name === 'Mossy' && save.coins === 77 && save.realm.level === 3);
  check('card now says claimed and the button is disabled', (await pg.textContent('#gift-total')) === 'Days claimed: 1' && (await pg.locator('#gift-claim').isDisabled()));
  await pg.reload(); await pg.waitForFunction(() => window.__hub); await openCard(pg);
  check('after reload the same UTC day cannot be claimed twice', (await pg.locator('#gift-claim').isDisabled()) && (await lj(pg, SK)).realm.shards === 100 + gift1.shards);
  check('no console errors', s.errors.length === 0, s.errors.join('|'));
  const ctx1 = s.ctx;

  // next day, then a long gap: total just keeps counting, nothing resets
  let n = await open(browser, { ctx: ctx1, date: '2026-11-22' });
  await openCard(n.page); await n.page.click('#gift-claim');
  check('next UTC day claims day 2', (await lj(n.page, GK)).days === 2);
  await n.page.close();
  n = await open(browser, { ctx: ctx1, date: '2027-02-01' });
  await openCard(n.page);
  check('after a long gap the total is still 2 and a claim is open (no reset, no streak text)', (await n.page.textContent('#gift-total')) === 'Days claimed: 2' && !/streak|miss|expire|left/i.test(await n.page.textContent('#gift-card')));
  await n.page.click('#gift-claim');
  check('gap claim gives day 3', (await lj(n.page, GK)).days === 3);
  await s.ctx.close();

  // corrupt gift save recovers
  s = await open(browser, { seed: { [SK]: TOWN, [GK]: 'not json{' } });
  await openCard(s.page);
  check('corrupt gift key recovers to 0 days and can claim', (await s.page.textContent('#gift-total')) === 'Days claimed: 0' && !(await s.page.locator('#gift-claim').isDisabled()) && s.errors.length === 0, s.errors.join('|'));
  await s.ctx.close();

  // milestone token goes to the stash through MMProfile.clean
  s = await open(browser, { seed: { [SK]: TOWN, [GK]: { v: 1, days: 6, last: '2026-11-20' } } });
  await openCard(s.page);
  check('day 7 previews the keepsake token', /keepsake token/.test(await s.page.textContent('#gift-today')));
  await s.page.click('#gift-claim');
  const mm = await lj(s.page, MK);
  check('token lands in the first free stash slot, 16 slots kept', mm.stash.length === 16 && mm.stash[0] && mm.stash[0].id === 'token_star' && (await lj(s.page, SK)).realm.shards === 100, JSON.stringify(mm.stash.slice(0, 2)));
  await s.ctx.close();
  const full = []; for (let i = 0; i < 16; i++) full.push({ id: 'heartcharm', r: 1 });
  s = await open(browser, { seed: { [SK]: TOWN, [GK]: { v: 1, days: 6, last: '2026-11-20' }, [MK]: { v: 1, heroes: [], stash: full, fame: 0, mode: 'classic', hall: [], migratedFrom: null } } });
  await openCard(s.page); await s.page.click('#gift-claim');
  check('full stash: shards are paid instead, token not lost or dropped', (await lj(s.page, SK)).realm.shards === 100 + G.SHARDS_MAX && (await lj(s.page, MK)).stash.every((x) => x && x.id === 'heartcharm'));
  await s.ctx.close();

  // no town save: nothing claimed
  s = await open(browser, {});
  await openCard(s.page); await s.page.click('#gift-claim');
  check('without a usable town save nothing is claimed or written', (await ls(s.page, GK)) === null && (await ls(s.page, SK)) === null && /wait/.test(await s.page.textContent('#gift-note')));
  await s.ctx.close();

  // phone
  s = await open(browser, { seed: { [SK]: TOWN }, viewport: { width: 390, height: 844 } });
  await openCard(s.page);
  const ph = await s.page.evaluate(() => { const r = document.getElementById('gift-card').getBoundingClientRect(); return { sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth, right: r.right, left: r.left, top: r.top, bh: document.getElementById('gift-btn').getBoundingClientRect().height, ch: document.getElementById('gift-claim').getBoundingClientRect().height }; });
  check('phone 390x844: no horizontal scroll, card on screen, buttons >= 44 px', ph.sw <= ph.cw && ph.left >= 0 && ph.right <= 390 && ph.top >= 0 && ph.bh >= 44 && ph.ch >= 44, JSON.stringify(ph));
  check('no console errors on phone', s.errors.length === 0, s.errors.join('|'));
  await s.ctx.close();
  await browser.close();
  done();
})();
