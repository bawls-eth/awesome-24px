// CZ1: the Hub "Collections" card + sheet (hub/collections.js over shared/mm-collections.js). Offline: blockDb on every context.
// Serve the repo root:  python3 -m http.server 8440 &
// Run: BASE=http://localhost:8440/game/index.html NODE_PATH=$(npm root -g) node game/tests/hub-collections.test.js
const { chromium } = require('playwright');
const { check, done, blockDb } = require('./helpers');
const K = require('../shared/mm-collections.js');
const ORIGIN = (process.env.BASE || 'http://localhost:8440/game/index.html').replace(/\/game\/index\.html.*$/, '');
const GUILT = /streak|missed|expire|hurry|last chance|don'?t lose|come back|countdown|timer/i;
const PHONE = { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true };

// seeds once per context, then spies on every Storage write
function initScript(seed) {
  return `(() => {
    if (!sessionStorage.s) { sessionStorage.s = 1; const s = ${JSON.stringify(seed || {})}; Object.keys(s).forEach((k) => localStorage.setItem(k, typeof s[k] === 'string' ? s[k] : JSON.stringify(s[k]))); }
    window.__writes = [];
    const set = Storage.prototype.setItem, rm = Storage.prototype.removeItem, clr = Storage.prototype.clear;
    Storage.prototype.setItem = function (k, v) { window.__writes.push(String(k)); return set.call(this, k, v); };
    Storage.prototype.removeItem = function (k) { window.__writes.push('rm:' + k); return rm.call(this, k); };
    Storage.prototype.clear = function () { window.__writes.push('clear'); return clr.call(this); };
  })();`;
}
async function open(browser, { seed, ctxOpts, query } = {}) {
  const ctx = await browser.newContext(ctxOpts || { viewport: { width: 1000, height: 760 } });
  const db = await blockDb(ctx);
  const page = await ctx.newPage();
  const errors = [], sockets = [], remote = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  page.on('websocket', (w) => sockets.push(w.url()));
  page.on('request', (r) => { if (!r.url().startsWith(ORIGIN)) remote.push(r.url()); });
  await page.addInitScript(initScript(seed));
  await page.goto(ORIGIN + '/game/hub/index.html?test=1&map=1' + (query || ''));
  await page.waitForFunction(() => window.__hub && window.__coll);
  return { ctx, page, errors, sockets, remote, db };
}
const clean = (s) => s.errors.length === 0 && s.sockets.length === 0 && s.remote.length === 0 && s.db.count() === 0;
const cleanWhy = (s) => JSON.stringify({ e: s.errors, ws: s.sockets, remote: s.remote, db: s.db.count() });
// writes by the Collections code: any write to a key other games own (the hub's own map/nav keys are written by hub.js / mm-nav as before)
const OTHER = ['pixeltown-archipelago-v1', 'pixeltown-tames-v1', 'pixeltown-bugs-v1', 'pixeltown-angler-v1', 'pixeltown-save-v1', 'pixeltown-mm-v1', 'pixeltown-realm-v1', 'pixeltown-deepdelve-v1'];
const foreign = (page) => page.evaluate((ks) => window.__writes.filter((k) => k === 'clear' || ks.some((x) => k === x || k === 'rm:' + x)), OTHER);

const SEED = {
  'pixeltown-archipelago-v1': { v: 1, log: { seen: { clover_hopper: 3, puffwool: 1, pengling: 2 }, tamed: { puffwool: 1 }, ko: {}, bugs: {}, fish: {} }, trophies: { trophy_tyrant: 1 } },
  'pixeltown-tames-v1': { v: 1, n: 1, roster: [{ id: 't1', sp: 'puffwool', nm: '<img src=x onerror=alert(1)>' }], party: [], mount: null },
  'pixeltown-bugs-v1': { v: 1, stars: {}, best: {}, journal: { ladybug: 4, butterfly: 2, moonwing: 1 } },
  'pixeltown-angler-v1': { caught: { minnow: { n: 2, best: 5 }, koi: { n: 1, best: 30 } }, cove: { pearl_ray: { n: 1, best: 9 } } },
  'pixeltown-save-v1': { realm: { items: [{ n: 1, id: 'arm_sig_dread', r: 0, t: 12 }] } },
  'pixeltown-deepdelve-v1': { v: 1, goals: { buildHut: true } },
};

(async () => {
  const browser = await chromium.launch();

  // 1. seeded save: the card total matches MMCollections.read over the same keys; the sheet lists every set with its count
  let s = await open(browser, { seed: SEED });
  const want = K.read({ getItem: (k) => (SEED[k] ? JSON.stringify(SEED[k]) : null) });
  check('seeded: card shows the book total (' + K.line(want.found, want.total) + ')', (await s.page.textContent('#coll-sum')) === K.line(want.found, want.total) && want.found === 3 + 1 + 3 + 2 + 1 + 1 + 1 + 1, await s.page.textContent('#coll-sum'));
  check('seeded: no first steps once something is found', await s.page.isHidden('#coll-steps'));
  check('card is visible on the map page', await s.page.isVisible('#coll-card'));
  check('sheet starts closed', await s.page.isHidden('#coll-sheet'));
  await s.page.click('#coll-open');
  check('tap opens the sheet; aria-expanded true; focus on Close', (await s.page.isVisible('#coll-sheet')) && (await s.page.getAttribute('#coll-open', 'aria-expanded')) === 'true' && (await s.page.evaluate(() => document.activeElement.id)) === 'coll-close');
  const rows = await s.page.$$eval('#coll-sets .coll-set', (ls) => ls.map((l) => ({ id: l.dataset.set, n: l.querySelector('.coll-set-n').textContent, title: l.querySelector('.coll-set-title').textContent, href: (l.querySelector('a.coll-go') || {}).getAttribute ? l.querySelector('a.coll-go').getAttribute('href') : null, place: l.querySelector('a.coll-go') && l.querySelector('a.coll-go').dataset.place, entries: l.querySelectorAll('.coll-entry').length, on: Array.from(l.querySelectorAll('.coll-entry.on')).map((e) => e.dataset.id) })));
  check('sheet lists the 8 sets in order with "N of M found"', rows.length === 8 && rows.every((r, i) => r.id === want.sets[i].id && r.n === K.line(want.sets[i].found, want.sets[i].total) && r.title === want.sets[i].title), JSON.stringify(rows.map((r) => r.id + ' ' + r.n)));
  check('each set lists all its entries; the found ones are marked', rows.every((r, i) => r.entries === want.sets[i].total && JSON.stringify(r.on) === JSON.stringify(want.sets[i].entries.filter((e) => e.found).map((e) => e.id))), JSON.stringify(rows.map((r) => r.on)));
  check('the calm note says finding things is optional', /optional/i.test(await s.page.textContent('#coll-note')));
  const sheetText = (await s.page.textContent('#coll-sheet')) + (await s.page.textContent('#coll-card'));
  check('card + sheet text has no urgency words', !GUILT.test(sheetText));
  check('text set with textContent (no markup from saves, no img)', (await s.page.$$('#coll-sheet img, #coll-card img')).length === 0 && !(await s.page.content()).includes('onerror=alert'));
  // links: each one is the MMNav registry path, resolves 200
  const navWant = await s.page.evaluate(() => MMNav.PLACES.reduce((o, p) => { o[p.id] = MMNav.urlFor(p.id, 'map'); return o; }, {}));
  let linksOk = true; const bad = [];
  for (const r of rows) {
    const abs = await s.page.evaluate((h) => new URL(h, location.href).href, r.href);
    const res = await s.page.request.get(abs);
    if (r.href !== navWant[r.place] || res.status() !== 200) { linksOk = false; bad.push(r.id + ' ' + r.href + ' ' + res.status()); }
  }
  check('each set links to its game via MMNav.urlFor and the link resolves 200', linksOk && rows.map((r) => r.place).join() === 'isles,isles,bugs,angler,angler,realm,deepdelve,isles', bad.join('|') || rows.map((r) => r.place).join());
  // a list toggle works with the keyboard, the map does not move on keys typed inside the sheet
  const at0 = await s.page.evaluate(() => window.__hub.at);
  await s.page.focus('#coll-sets .coll-set[data-set="bugs"] summary');
  await s.page.keyboard.press('Enter');
  check('Enter on a set opens its list (keyboard)', await s.page.evaluate(() => document.querySelector('#coll-sets .coll-set[data-set="bugs"] details').open));
  await s.page.keyboard.press('ArrowRight'); await s.page.keyboard.press('ArrowDown');
  await s.page.waitForTimeout(150);
  check('keys inside the sheet do not walk the map', (await s.page.evaluate(() => window.__hub.at)) === at0 && (await s.page.isHidden('#card')));
  await s.page.keyboard.press('Escape');
  check('Esc closes the sheet and returns focus to the card button', (await s.page.isHidden('#coll-sheet')) && (await s.page.evaluate(() => document.activeElement.id)) === 'coll-open' && (await s.page.getAttribute('#coll-open', 'aria-expanded')) === 'false');
  await s.page.keyboard.press('Enter');
  check('Enter on the card button opens the sheet again (keyboard)', await s.page.isVisible('#coll-sheet'));
  await s.page.click('#coll-close');
  check('Close button closes it', await s.page.isHidden('#coll-sheet'));
  check('nothing written to another game\'s key', (await foreign(s.page)).length === 0, JSON.stringify(await foreign(s.page)));
  check('DB 0, no sockets, nothing off this origin, console clean', clean(s), cleanWhy(s));
  // a link in the sheet opens the game
  await s.page.click('#coll-open');
  await Promise.all([s.page.waitForURL(/games\/festival\/bugs\.html/), s.page.click('#coll-sets .coll-set[data-set="bugs"] a.coll-go')]);
  check('tapping "Find them in Bug Safari" opens Bug Safari', /\/game\/games\/festival\/bugs\.html/.test(s.page.url()));
  await s.ctx.close();

  // 2. fresh save: 0 found, 3 first steps that resolve; hostile values show nothing and do not break the page
  s = await open(browser, {});
  const fresh = K.read({ getItem: () => null });
  check('fresh: card says 0 of ' + fresh.total + ' found', (await s.page.textContent('#coll-sum')) === K.line(0, fresh.total));
  const st = await s.page.$$eval('#coll-steps .coll-step-go', (as) => as.map((a) => ({ place: a.dataset.place, href: a.getAttribute('href'), text: a.textContent })));
  check('fresh: 3 first-step suggestions (isles, bugs, angler)', st.length === 3 && st.map((x) => x.place).join() === 'isles,bugs,angler', JSON.stringify(st));
  let stOk = true;
  for (const x of st) { const r = await s.page.request.get(await s.page.evaluate((h) => new URL(h, location.href).href, x.href)); if (r.status() !== 200) stOk = false; }
  check('fresh: every first step resolves 200', stOk);
  check('fresh: DB 0, console clean', clean(s), cleanWhy(s));
  await s.ctx.close();
  s = await open(browser, { seed: { 'pixeltown-archipelago-v1': '{"log":{"seen":{"__proto__":{"puffwool":1}}},"trophies":"x"}', 'pixeltown-bugs-v1': 'not json{', 'pixeltown-angler-v1': '{"caught":[1,2]}', 'pixeltown-mm-v1': '{"stash":"<b>x</b>"}', 'pixeltown-tames-v1': '{"roster":[{"sp":"<script>"}]}' } });
  check('hostile saves: card shows 0 found and the 3 first steps', (await s.page.textContent('#coll-sum')) === K.line(0, fresh.total) && (await s.page.$$('#coll-steps .coll-step-go')).length === 3);
  await s.page.click('#coll-open');
  check('hostile saves: sheet opens, nothing marked found, no injected markup', (await s.page.$$('#coll-sets .coll-entry.on')).length === 0 && (await s.page.$$('#coll-sheet b, #coll-sheet script')).length === 0);
  check('hostile saves: nothing written to other games, console clean, DB 0', (await foreign(s.page)).length === 0 && clean(s), cleanWhy(s));
  await s.ctx.close();

  // 3. phone 390x844: the card fits with no overlap, 44 px targets, text >= 12 px; the sheet fits and scrolls inside itself
  s = await open(browser, { ctxOpts: PHONE, seed: { 'pixeltown-nav-v1': { v: 1, last: { id: 'angler', sub: '', url: 'game/games/angler/index.html', t: 1 }, prev: null } } });
  const lay = await s.page.evaluate(() => {
    const r = (sel) => { const n = document.querySelector(sel); if (!n || n.hidden || !n.offsetParent) return null; const b = n.getBoundingClientRect(); return { l: b.left, t: b.top, r: b.right, b: b.bottom, w: b.width, h: b.height }; };
    const targets = Array.from(document.querySelectorAll('#coll-card a, #coll-card button')).filter((n) => n.offsetParent).map((n) => { const b = n.getBoundingClientRect(); return { w: b.width, h: b.height }; });
    const fonts = Array.from(document.querySelectorAll('#coll-card *')).filter((n) => n.childNodes.length && Array.from(n.childNodes).some((c) => c.nodeType === 3 && c.textContent.trim())).map((n) => parseFloat(getComputedStyle(n).fontSize));
    return { sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth, card: r('#coll-card'), others: ['#hud', '#hub-games', '#hub-continue', '#calm-card', '#bar', '#mm-nav-btn', '#hint-chip', '#stage'].map((s) => [s, r(s)]), targets, fonts };
  });
  const ov = (a, b) => a && b && a.l < b.r - 0.5 && b.l < a.r - 0.5 && a.t < b.b - 0.5 && b.t < a.b - 0.5;
  check('phone: card on screen, no horizontal scroll', lay.card && lay.card.l >= 0 && lay.card.r <= 390 && lay.card.t >= 0 && lay.card.b <= 844 && lay.sw <= lay.cw, JSON.stringify(lay.card));
  check('phone: the book is the one card target (the step chips fold away so the map keeps 55% of the screen), >= 44 px', lay.targets.length === 1 && lay.targets.every((t) => t.w >= 44 && t.h >= 44), JSON.stringify(lay.targets));
  check('phone: card text >= 12 px', lay.fonts.length > 0 && lay.fonts.every((f) => f >= 12), JSON.stringify(lay.fonts));
  const hits = lay.others.filter(([, b]) => ov(lay.card, b)).map(([n]) => n);
  check('phone: card overlaps nothing (HUD, games strip, Continue, ideas card, bar, Menu, hint chip, map)', hits.length === 0, hits.join(','));
  const stage = lay.others.find(([n]) => n === '#stage')[1];
  check('phone: the map still gets room', stage && stage.h >= 200, JSON.stringify(stage));
  await s.page.tap('#coll-open');
  const sh = await s.page.evaluate(() => {
    const b = document.getElementById('coll-sheet').getBoundingClientRect();
    const targets = Array.from(document.querySelectorAll('#coll-sheet a, #coll-sheet button, #coll-sheet summary')).map((n) => { const r = n.getBoundingClientRect(); return { id: n.id || n.className, w: r.width, h: r.height }; });
    const fonts = Array.from(document.querySelectorAll('#coll-sheet *')).filter((n) => Array.from(n.childNodes).some((c) => c.nodeType === 3 && c.textContent.trim())).map((n) => parseFloat(getComputedStyle(n).fontSize));
    const sc = document.getElementById('coll-sheet');
    return { l: b.left, r: b.right, t: b.top, b: b.bottom, sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth, targets, minFont: Math.min.apply(null, fonts), scrolls: sc.scrollHeight > sc.clientHeight };
  });
  check('phone: sheet fits the screen, no horizontal scroll', sh.l >= 0 && sh.r <= 390 && sh.t >= 0 && sh.b <= 844 + 1 && sh.sw <= sh.cw, JSON.stringify(sh));
  check('phone: every sheet target is >= 44 px (close, 8 list toggles, 8 links)', sh.targets.length === 17 && sh.targets.every((t) => t.w >= 44 && t.h >= 44), JSON.stringify(sh.targets.filter((t) => t.w < 44 || t.h < 44)));
  check('phone: sheet text >= 12 px', sh.minFont >= 12, String(sh.minFont));
  check('phone: the long sheet scrolls inside itself', sh.scrolls);
  await s.page.tap('#coll-close');
  check('phone: Close hides the sheet', await s.page.isHidden('#coll-sheet'));
  check('phone: DB 0, console clean', clean(s), cleanWhy(s));
  await s.ctx.close();

  await browser.close();
  done();
})();
