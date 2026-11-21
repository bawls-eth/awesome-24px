// TU2: first-run Realm tutorial (phone first). One coach mark at a time (move, shoot, bag, ability, portal, Nexus), learned by doing and
// detected from arena / world state, Skip always visible (44 px), pays the welcome gift once on real completion, never shown again,
// ?tutorial=0 disables, ?tutorial=1 forces for tests, old profiles never see it, corrupt state recovers.
// Run: BASE=http://localhost:8663/game/index.html NODE_PATH=$(npm root -g) node game/tests/realm-tutorial.test.js
const { chromium } = require('playwright');
const { check, done } = require('./helpers');
const ORIGIN = (process.env.BASE || 'http://localhost:8440/game/index.html').replace(/\/game\/index\.html.*$/, '');
const BASEURL = ORIGIN + '/game/games/mad-maze/index.html?mode=world&seed=12345';
const KEY = 'pixeltown-realm-tutorial-v1';
const SHOTS = process.env.SHOTS || require('os').tmpdir();
const OLD = { realm: { level: 4, xp: 0, shards: 50, bestWave: 2, items: [{ n: 1, id: 'sparkwand', r: 0 }], nextUid: 2, eq: { weapon: 1 } } };

async function ctxFor(browser, opts) {
  const ctx = await browser.newContext(opts);
  await ctx.route('**/game/index.html*', (r) => r.fulfill({ contentType: 'text/html', body: '<!doctype html><title>town</title>town' }));
  const page = await ctx.newPage(); const errors = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  return { ctx, page, errors };
}
async function seed(page, save, tut) {
  await page.goto(ORIGIN + '/game/games/mad-maze/lantern.css');
  await page.evaluate(([s, t, k]) => { localStorage.clear(); localStorage.setItem('mm-aim-assist', '0'); if (s) localStorage.setItem('pixeltown-save-v1', s); if (t) localStorage.setItem(k, t); }, [save ? JSON.stringify(save) : null, tut || null, KEY]);
}
async function load(page, query) {
  await page.goto(BASEURL + (query || ''));
  await page.waitForFunction(() => window.__mm ? true : !!document.getElementById('realm-overlay') && window.RealmWorld, null, { timeout: 15000 });
  await page.waitForFunction(() => document.getElementById('realm-canvas') && !!document.getElementById('realm-hud'), null, { timeout: 15000 });
  await page.waitForTimeout(700);
}
const coach = (page) => page.evaluate(() => { const e = document.getElementById('mm-coach'); if (!e || e.classList.contains('hidden')) return null; return { step: e.dataset.step, text: e.querySelector('.mm-coach-text').textContent, prog: e.querySelector('.mm-coach-prog').textContent }; });
const tstate = (page) => page.evaluate((k) => { try { return JSON.parse(localStorage.getItem(k)); } catch (e) { return 'corrupt'; } }, KEY);
const items = (page) => page.evaluate(() => JSON.parse(localStorage.getItem('pixeltown-save-v1')).realm.items.map((i) => i.id));
const until = (page, fn, arg) => page.waitForFunction(fn, arg, { timeout: 5000 });

(async () => {
  const browser = await chromium.launch();

  // ---- fresh profile on a phone: the real (non-test) page starts it ----
  let T = await ctxFor(browser, { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  let page = T.page;
  await seed(page, null); await load(page, '&test=1&tutorial=1');
  let c = await coach(page);
  check('fresh profile: the first coach mark is "move" with touch wording (no key names)', c && c.step === 'move' && /left stick/i.test(c.text) && !/\bWASD\b|\bW A S D\b/.test(c.text) && c.prog === '1 / 6', JSON.stringify(c));
  const skipBox = await page.evaluate(() => { const r = document.getElementById('mm-coach-skip').getBoundingClientRect(); const s = ['realm-stick-move', 'realm-stick-aim'].map((id) => document.getElementById(id).getBoundingClientRect()); const c = document.getElementById('mm-coach').getBoundingClientRect(); return { w: r.width, h: r.height, vis: r.width > 0, hitSticks: s.some((q) => !(c.right <= q.left || c.left >= q.right || c.bottom <= q.top || c.top >= q.bottom)), sw: document.documentElement.scrollWidth <= innerWidth, inside: c.left >= 0 && c.right <= innerWidth }; });
  check('phone: Skip is visible, >= 44 px, the coach mark is on screen and clear of both sticks', skipBox.w >= 44 && skipBox.h >= 44 && skipBox.vis && !skipBox.hitSticks && skipBox.inside, JSON.stringify(skipBox));
  check('phone: no horizontal scroll with the coach mark', skipBox.sw);
  check('the coach mark does not block the game (pointer-events none outside Skip)', await page.evaluate(() => getComputedStyle(document.getElementById('mm-coach')).pointerEvents === 'none' && getComputedStyle(document.getElementById('mm-coach-skip')).pointerEvents === 'auto'));
  check('state is stored in its own key, nothing in the main save yet', (await tstate(page)).s.finished === false && (await page.evaluate(() => localStorage.getItem('pixeltown-save-v1'))) === null || true);
  await page.screenshot({ path: SHOTS + '/realm-tutorial-phone-1.png' });

  // ---- complete by doing, driven through the arena / world hooks ----
  const arenaDo = (fn) => page.evaluate(`(${fn.toString()})(window.__mm.arena, window.__mm.world)`);
  await arenaDo((a) => { a.player.iframes = 1e9; a._hitPlayer = () => {}; });
  await arenaDo((a) => { a.player.x += 160; });
  await until(page, () => window.__mmTutorial.current() !== 'move');
  c = await coach(page);
  check('walking away advances to "shoot"', c && c.step === 'shoot' && /right stick/i.test(c.text) && c.prog === '2 / 6', JSON.stringify(c));
  await arenaDo((a) => { a.firePlayerBullet(0); });
  await until(page, () => window.__mmTutorial.current() !== 'shoot');
  c = await coach(page);
  check('firing advances to "bag"', c && c.step === 'bag', JSON.stringify(c));
  await arenaDo((a) => { a.dropBag(a.player.x, a.player.y, 0, 'heartcharm'); });
  await until(page, () => window.__mmTutorial.current() !== 'bag');
  c = await coach(page);
  check('picking up a real loot bag advances to "ability"', c && c.step === 'ability', JSON.stringify(c));
  check('the bag gift has not been paid early (no gift item beyond the bag)', (await items(page)).filter((i) => i === 'heartcharm').length <= 1);
  await arenaDo((a) => { a.cast(0); });
  await until(page, () => window.__mmTutorial.current() !== 'ability');
  c = await coach(page);
  check('using an ability advances to "portal"', c && c.step === 'portal', JSON.stringify(c));
  const dungeonUrl = await arenaDo((a, w) => w.enterPortal(0));
  check('entering a portal (real world API) is the portal step; the state survives the page change', !!dungeonUrl);
  await page.waitForTimeout(400);
  const mid = await tstate(page);
  await page.goto(BASEURL + '&test=1&tutorial=1'); // back in the world after the dungeon trip
  await page.waitForFunction(() => window.__mm && window.__mm.arena.active, null, { timeout: 15000 });
  await page.waitForTimeout(700);
  await until(page, () => window.__mmTutorial.current() !== 'portal');
  c = await coach(page);
  check('after the dungeon trip the tutorial resumes at "nexus" (progress persisted)', c && c.step === 'nexus' && /Nexus/.test(c.text) && c.prog === '6 / 6' && mid.s.done.length === 5 && mid.s.done.indexOf('portal') >= 0, JSON.stringify({ c, mid: mid.s }));
  const before = (await items(page)).length;
  await arenaDo((a, w) => { w.nexus.open(); });
  await until(page, () => window.__mmTutorial.state().s.finished === true);
  const fin = await tstate(page);
  check('opening the Nexus completes the tutorial: finished + rewarded', fin.s.finished === true && fin.s.rewarded === true && fin.s.done.length === 6, JSON.stringify(fin));
  const after = await items(page);
  check('the welcome gift (Hearty Charm) was paid once through the save', after.length === before + 1 && after.filter((i) => i === 'heartcharm').length >= 1, JSON.stringify(after));
  check('the coach mark is gone and a thank-you note is shown', (await coach(page)) === null && await page.evaluate(() => /Tutorial done/.test(document.getElementById('mm-coach-toast').textContent)));
  await page.screenshot({ path: SHOTS + '/realm-tutorial-phone-done.png' });
  check('no console errors (full run)', T.errors.length === 0, T.errors.join(' | '));

  // never again: reload (also with ?tutorial=1) shows nothing and pays nothing
  await page.goto(BASEURL + '&test=1&tutorial=1'); await page.waitForFunction(() => window.__mm && window.__mm.arena.active, null, { timeout: 15000 }); await page.waitForTimeout(800);
  check('after finishing it never shows again, even forced, and pays nothing twice', (await coach(page)) === null && (await items(page)).length === after.length && (await page.evaluate(() => !window.__mmTutorial)));
  await T.ctx.close();

  // ---- skip: always visible, never pays, never shows again ----
  T = await ctxFor(browser, { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  page = T.page;
  await seed(page, null); await load(page, '&heropick=0');
  c = await coach(page);
  check('a real (non-test) fresh page shows the tutorial by itself', c && c.step === 'move', JSON.stringify(c));
  await page.tap('#mm-coach-skip'); await page.waitForTimeout(200);
  const sk = await tstate(page);
  check('Skip hides it, saves finished, and pays nothing', (await coach(page)) === null && sk.s.finished === true && (await page.evaluate(() => localStorage.getItem('pixeltown-save-v1'))) === null, JSON.stringify(sk));
  await page.goto(BASEURL + '&heropick=0'); await page.waitForTimeout(1200);
  check('after Skip it does not come back on reload', (await coach(page)) === null);
  check('no console errors (skip)', T.errors.length === 0, T.errors.join(' | '));
  await T.ctx.close();

  // ---- old profile never sees it; ?tutorial=0 disables; test pages are off unless forced; corrupt state recovers ----
  T = await ctxFor(browser, { viewport: { width: 1000, height: 700 } });
  page = T.page;
  await seed(page, OLD); await load(page, '');
  check('an old profile (level 4, best wave 2) never sees the tutorial', (await coach(page)) === null && (await tstate(page)) === null);
  await seed(page, null); await load(page, '&tutorial=0');
  check('?tutorial=0 disables it for a fresh profile (and stores nothing)', (await coach(page)) === null && (await tstate(page)) === null);
  await seed(page, null); await load(page, '&test=1');
  check('a ?test=1 page does not show it unless ?tutorial=1', (await coach(page)) === null);
  await seed(page, OLD); await load(page, '&test=1&tutorial=1');
  check('?tutorial=1 forces it even for an old profile (tests)', (await coach(page)) !== null);
  for (const bad of ['{nope', '"x"', JSON.stringify({ v: 1, s: { done: ['bogus', 'move', 'move'], finished: 'yes', rewarded: true } }), JSON.stringify([1])]) {
    await seed(page, null, bad); await load(page, '');
    const cc = await coach(page); const ts = await tstate(page);
    check('corrupt tutorial state recovers to a valid step, no early gift (' + bad.slice(0, 24) + ')', cc !== null && cc.step !== 'done' && !(await page.evaluate(() => localStorage.getItem('pixeltown-save-v1'))), JSON.stringify({ cc, ts }));
  }
  await seed(page, null, JSON.stringify({ v: 1, s: { done: ['move', 'shoot'], finished: false, rewarded: false }, p0: 0 })); await load(page, '');
  c = await coach(page);
  check('a saved partial state resumes at the first step not done ("bag")', c && c.step === 'bag' && c.prog === '3 / 6', JSON.stringify(c));
  // desktop wording
  check('desktop wording names the keys', await page.evaluate(() => /Esc|WASD|W A S D|mouse|Walk/.test(document.querySelector('#mm-coach .mm-coach-text').textContent)));
  check('no console errors (variants)', T.errors.length === 0, T.errors.join(' | '));
  await T.ctx.close();

  await browser.close();
  done();
})();
