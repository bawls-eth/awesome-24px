// G-01 (b08-01): the Hub daily gift is claimable on a fresh device (no `pixeltown-save-v1` yet). It writes only { realm: { shards } }
// (additive, no invented name), the Town still shows its join card, and joining offline keeps the shards. A CORRUPT town save is never
// overwritten (nothing paid, nothing claimed, player-words note). Two fast clicks pay once.
// OFFLINE ONLY: blockDb (route + routeWebSocket) and the Firebase SDK answered with an empty stub; joins via "Play offline". No chat, no writes.
// Run: BASE=http://localhost:8440/game/index.html node game/tests/beta-g01-gift.test.js
const { chromium } = require('playwright');
const { check, done, blockDb } = require('./helpers');
const BASE = process.env.BASE || 'http://localhost:8440/game/index.html';
const ORIGIN = BASE.replace(/\/game\/index\.html.*$/, '');
const GK = 'pixeltown-gift-v1', SK = 'pixeltown-save-v1';
const HUB = ORIGIN + '/game/hub/index.html?test=1&gdate=2026-11-21';

async function open(browser, seed, viewport) {
  const ctx = await browser.newContext({ viewport: viewport || { width: 1000, height: 760 } });
  await blockDb(ctx);
  await ctx.route(/gstatic\.com\/firebasejs\//, (r) => r.fulfill({ status: 200, contentType: 'application/javascript', body: '/* firebase SDK blocked by beta-g01-gift.test.js */' }));
  if (seed) await ctx.addInitScript((s) => { if (sessionStorage.seeded) return; sessionStorage.seeded = '1'; Object.keys(s).forEach((k) => localStorage.setItem(k, s[k])); }, seed);
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  await page.goto(HUB);
  await page.waitForFunction(() => window.__hub);
  return { ctx, page, errors };
}
const ls = (page, k) => page.evaluate((x) => localStorage.getItem(x), k);
async function openCard(page) { await page.click('#gift-btn'); await page.waitForSelector('#gift-card:not([hidden])'); }

(async () => {
  const browser = await chromium.launch();

  // 1-3: fresh storage
  let s = await open(browser);
  await openCard(s.page);
  const preview = await s.page.textContent('#gift-today');
  const amount = Number((/(\d+) shards/.exec(preview) || [])[1]);
  check('fresh storage: the card previews a shard gift', amount > 0, preview);
  await s.page.click('#gift-claim');
  const note = await s.page.textContent('#gift-note');
  check('fresh storage: Claim says "Gift claimed", button reads "Claimed today" and is disabled, "Days claimed: 1"',
    /^Gift claimed/.test(note) && (await s.page.textContent('#gift-claim')) === 'Claimed today' && (await s.page.locator('#gift-claim').isDisabled()) && (await s.page.textContent('#gift-total')) === 'Days claimed: 1', note);
  const sv = JSON.parse(await ls(s.page, SK));
  check('fresh storage: the town save holds realm.shards = the previewed amount and nothing else (no invented name)', sv.realm.shards === amount && Object.keys(sv).join() === 'realm' && Object.keys(sv.realm).join() === 'shards', JSON.stringify(sv));
  // 3: the Town still shows its join card; after joining offline the shards are kept
  await s.page.route('**/main.js*', async (route) => { const resp = await route.fetch(); const body = (await resp.text()).replace('const game = new Phaser.Game(config);', 'const game = window.__g = new Phaser.Game(config);'); route.fulfill({ response: resp, body }); });
  await s.page.goto(BASE);
  await s.page.waitForSelector('#name-input', { state: 'visible', timeout: 15000 });
  check('Town after a gift-only save: the join card is shown (no half-joined state)', await s.page.locator('#name-input').isVisible() && await s.page.locator('button:has-text("Join Town")').isVisible());
  await s.page.fill('#name-input', 'ADMINgift');
  await s.page.click('.species-tab');
  await s.page.click('.avatar-choice');
  await s.page.click('button:has-text("Join Town")');
  await s.page.waitForSelector('#join-offline-btn:not(.hidden)', { timeout: 9000 });
  await s.page.click('#join-offline-btn');
  await s.page.waitForFunction(() => window.__g && window.__g.scene.getScene('Town') && window.__g.scene.getScene('Town').localBody, null, { timeout: 20000 });
  await s.page.waitForFunction(() => { try { return JSON.parse(localStorage.getItem('pixeltown-save-v1')).name === 'ADMINgift'; } catch (e) { return false; } }, null, { timeout: 5000 }).catch(() => {});
  const sv2 = JSON.parse(await ls(s.page, SK));
  check('after joining the Town offline the gift shards are still in realm.shards', sv2.name === 'ADMINgift' && sv2.realm && sv2.realm.shards === amount, JSON.stringify({ name: sv2.name, realm: sv2.realm }));
  check('no page errors (fresh flow)', s.errors.length === 0, s.errors.join(' | '));
  await s.ctx.close();

  // 4: corrupt town save: byte-identical, gift key not written, button still enabled
  s = await open(browser, { [SK]: 'not json' });
  await openCard(s.page); await s.page.click('#gift-claim');
  check('corrupt town save: the raw string is byte-identical, the gift key is not written, Claim still enabled',
    (await ls(s.page, SK)) === 'not json' && (await ls(s.page, GK)) === null && !(await s.page.locator('#gift-claim').isDisabled()));
  check('corrupt town save: the note says "Could not save the gift. Nothing was claimed."', (await s.page.textContent('#gift-note')) === 'Could not save the gift. Nothing was claimed.');
  await s.ctx.close();

  // 5: two fast clicks pay once
  s = await open(browser, { [SK]: JSON.stringify({ name: 'Mossy', species: 'coolcats', frame: 2, realm: { shards: 100 } }) });
  await openCard(s.page);
  const amt = Number((/(\d+) shards/.exec(await s.page.textContent('#gift-today')) || [])[1]);
  await s.page.evaluate(() => { const b = document.getElementById('gift-claim'); b.click(); b.click(); });
  await s.page.locator('#gift-claim').dblclick({ force: true }).catch(() => {});
  const sv3 = JSON.parse(await ls(s.page, SK)); const gs = JSON.parse(await ls(s.page, GK));
  check('two fast clicks (and a dblclick) pay once: shards + one gift, days = 1', sv3.realm.shards === 100 + amt && gs.days === 1, JSON.stringify([sv3.realm, gs]));
  await s.ctx.close();

  await browser.close();
  done();
})().catch((e) => { console.error(e); process.exit(1); });
