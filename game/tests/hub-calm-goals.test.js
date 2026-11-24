// RT1: "Things you could do" card on the Hub map. Serve the repo root:  python3 -m http.server 8440 &
// Run: BASE=http://localhost:8440/game/index.html NODE_PATH=$(npm root -g) node game/tests/hub-calm-goals.test.js
const { chromium } = require('playwright');
const { check, done } = require('./helpers');
const C = require('../shared/mm-calm-goals.js');
const ORIGIN = (process.env.BASE || 'http://localhost:8440/game/index.html').replace(/\/game\/index\.html.*$/, '');
const CK = 'pixeltown-calm-v1';
const GUILT = /streak|missed|expire|hurry|last chance|don'?t lose|countdown|timer/i;

async function open(browser, { seed, viewport, query, ctx: reuse } = {}) {
  const ctx = reuse || await browser.newContext({ viewport: viewport || { width: 1000, height: 760 } });
  const page = await ctx.newPage();
  const errors = [], sockets = [], remote = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  page.on('websocket', (w) => sockets.push(w.url()));
  page.on('request', (r) => { if (!r.url().startsWith(ORIGIN)) remote.push(r.url()); });
  if (seed) {
    await page.addInitScript((s) => {
      if (sessionStorage.seeded) return;
      sessionStorage.seeded = '1';
      Object.keys(s).forEach((k) => localStorage.setItem(k, typeof s[k] === 'string' ? s[k] : JSON.stringify(s[k])));
    }, seed);
  }
  await page.goto(ORIGIN + '/game/hub/index.html?test=1&map=1' + (query || ''));
  await page.waitForFunction(() => window.__hub);
  return { ctx, page, errors, sockets, remote };
}
const items = (page) => page.$$eval('#calm-list .calm-go', (as) => as.map((a) => ({ key: a.dataset.key, href: a.getAttribute('href'), text: a.textContent })));

(async () => {
  const browser = await chromium.launch();

  // 1. fresh save: 3 first steps, each link resolves (HTTP 200) to the right game page
  let s = await open(browser, {});
  check('card shows on a fresh save', await s.page.isVisible('#calm-card'));
  let it = await items(s.page);
  // round 4 b08-r2 (intentional change): a fresh profile's first idea is Home's one first move, the guided Realm adventure (not the Isles tame)
  check('3 ideas: the guided adventure (same as Home PLAY), first catch, first star', JSON.stringify(it.map((x) => x.key)) === JSON.stringify(['realm:first', 'angler:catch1', 'jam:star1']), JSON.stringify(it));
  check('the guided-adventure idea cannot be put away (it is the first move, not a medal)', (await s.page.$$('#calm-list .calm-x[data-key="realm:first"]')).length === 0);
  const want = { 'realm:first': '/game/games/mad-maze/index.html', 'angler:catch1': '/game/games/angler/index.html', 'jam:star1': '/game/games/jam/index.html' };
  for (const x of it) {
    const abs = await s.page.evaluate((h) => new URL(h, location.href).href, x.href);
    const r = await s.page.request.get(abs);
    check('link for ' + x.key + ' resolves to its game page (' + x.href + ')', r.status() === 200 && new URL(abs).pathname === want[x.key], abs + ' ' + r.status());
  }
  check('card text has no guilt / timer words', !GUILT.test(await s.page.textContent('#calm-card')));
  check('text is set with textContent (no markup in ideas)', await s.page.$$eval('#calm-list *', (ns) => ns.every((n) => ['LI', 'A', 'SPAN', 'BUTTON'].includes(n.tagName))));
  const fs = await s.page.$$eval('#calm-card .calm-title, #calm-card .calm-desc, #calm-title', (ns) => ns.map((n) => parseFloat(getComputedStyle(n).fontSize)));
  check('text is at least 12 px', fs.every((f) => f >= 12), JSON.stringify(fs));
  // tapping an idea opens that game
  await Promise.all([s.page.waitForURL(/games\/angler\/index\.html/), s.page.click('#calm-list .calm-go[data-key="angler:catch1"]')]);
  check('tapping "first catch" opens the Angler', /\/game\/games\/angler\/index\.html/.test(s.page.url()));
  await s.ctx.close();

  // 2. medals read through hub/medals.js: earned ones are never suggested; matches the pure module
  const med = { 'pixeltown-medals-angler-v1': { v: 1, m: ['catch1'] }, 'pixeltown-medals-isles-v1': { v: 1, m: ['tame1', 'log6'] } };
  s = await open(browser, { seed: med });
  it = await items(s.page);
  const expect = C.suggest({ angler: ['catch1'], isles: ['tame1', 'log6'], jam: [], stalk: [], deepdelve: [], bugs: [] }, { dismissed: [] }, 'hub-calm-v1').map((x) => x.key);
  check('ideas follow the saved medals (same as MMCalmGoals.suggest with the hub seed)', JSON.stringify(it.map((x) => x.key)) === JSON.stringify(expect) && it.length === 3, JSON.stringify([it.map((x) => x.key), expect]));
  check('an earned medal is never suggested', !it.some((x) => x.key === 'angler:catch1' || x.key === 'isles:tame1'));
  await s.page.reload(); await s.page.waitForFunction(() => window.__hub);
  check('stable across reloads (no date in the seed)', JSON.stringify((await items(s.page)).map((x) => x.key)) === JSON.stringify(expect));
  check('nothing is written for just looking', (await s.page.evaluate((k) => localStorage.getItem(k), CK)) === null);

  // 3. put one idea away: it is replaced, never comes back, and that persists
  const gone = it[0].key;
  await s.page.click('#calm-list .calm-x[data-key="' + gone + '"]');
  let it2 = await items(s.page);
  check('a put-away idea is replaced by another (still 3)', it2.length === 3 && !it2.some((x) => x.key === gone), JSON.stringify(it2.map((x) => x.key)));
  const st = JSON.parse(await s.page.evaluate((k) => localStorage.getItem(k), CK));
  check('stored in its own additive key', st.v === 1 && JSON.stringify(st.dismissed) === JSON.stringify([gone]) && st.hidden === 0, JSON.stringify(st));
  await s.page.reload(); await s.page.waitForFunction(() => window.__hub);
  check('after reload the put-away idea stays away', !(await items(s.page)).some((x) => x.key === gone));
  // hide the whole card; persists; the Menu sheet row brings it back
  await s.page.click('#calm-close');
  check('the card hides', await s.page.isHidden('#calm-card'));
  await s.page.reload(); await s.page.waitForFunction(() => window.__hub);
  check('hidden card stays hidden after reload', await s.page.isHidden('#calm-card'));
  await s.page.click('#mm-nav-btn');
  await s.page.waitForSelector('#mm-nav-calm');
  check('the Where-to sheet has a "Things you could do" row', (await s.page.textContent('#mm-nav-calm')).includes('Things you could do'));
  await s.page.click('#mm-nav-calm');
  check('the row closes the sheet and shows the card again', (await s.page.isVisible('#calm-card')) && !(await s.page.evaluate(() => MMNav.isOpen())));
  check('the put-away idea is still away', !(await items(s.page)).some((x) => x.key === gone));
  check('no console errors', s.errors.length === 0, s.errors.join('|'));
  check('DB 0: no websocket and no request off this origin', s.sockets.length === 0 && s.remote.length === 0, JSON.stringify([s.sockets, s.remote]));
  await s.ctx.close();

  // 4. ?calm=0 hides it; hostile stored key recovers
  s = await open(browser, { query: '&calm=0' });
  check('?calm=0 hides the card', await s.page.isHidden('#calm-card'));
  await s.page.click('#mm-nav-btn'); await s.page.waitForSelector('#mm-nav-sheet:not([hidden])');
  check('?calm=0: no sheet row either', (await s.page.$('#mm-nav-calm')) === null);
  await s.ctx.close();
  s = await open(browser, { seed: { [CK]: '{"v":1,"dismissed":["<img src=x onerror=alert(1)>","angler:catch1",5],"hidden":"yes","__proto__":{"x":1}}', 'pixeltown-medals-jam-v1': 'not json{' } });
  it = await items(s.page);
  check('hostile key: junk dropped, valid dismissal kept, card shown', (await s.page.isVisible('#calm-card')) && it.length === 3 && !it.some((x) => x.key === 'angler:catch1') && (await s.page.$$('#calm-list img')).length === 0, JSON.stringify(it.map((x) => x.key)));
  check('no console errors with hostile data', s.errors.length === 0, s.errors.join('|'));
  await s.ctx.close();

  // 5. phone 390x844: on screen, 44 px targets, no overlap with the map strip, Continue, Menu or the bottom bar
  s = await open(browser, { viewport: { width: 390, height: 844 }, seed: { 'pixeltown-nav-v1': { v: 1, last: { id: 'angler', sub: '', url: 'game/games/angler/index.html', t: 1 }, prev: null } } });
  const ph = await s.page.evaluate(() => {
    const r = (sel) => { const n = document.querySelector(sel); if (!n || n.hidden || !n.offsetParent) return null; const b = n.getBoundingClientRect(); return { l: b.left, t: b.top, r: b.right, b: b.bottom, w: b.width, h: b.height }; };
    const targets = Array.from(document.querySelectorAll('#calm-card a, #calm-card button')).filter((n) => n.offsetParent).map((n) => { const b = n.getBoundingClientRect(); return { w: b.width, h: b.height }; });
    return { sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth, card: r('#calm-card'), others: ['#hud', '#hub-games', '#hub-continue', '#bar', '#mm-nav-btn', '#hint-chip', '#stage'].map((s) => [s, r(s)]), targets };
  });
  const ov = (a, b) => a && b && a.l < b.r - 0.5 && b.l < a.r - 0.5 && a.t < b.b - 0.5 && b.t < a.b - 0.5;
  check('phone: card on screen, no horizontal scroll', ph.card && ph.card.l >= 0 && ph.card.r <= 390 && ph.card.t >= 0 && ph.card.b <= 844 && ph.sw <= ph.cw, JSON.stringify(ph.card));
  check('phone: every card target is at least 44 px', ph.targets.length === 3 && ph.targets.every((t) => t.w >= 44 && t.h >= 44), JSON.stringify(ph.targets));
  const hits = ph.others.filter(([, b]) => ov(ph.card, b)).map(([n]) => n);
  check('phone: card overlaps nothing (HUD, games strip, Continue, bar, Menu, hint chip, map stage)', hits.length === 0, hits.join(','));
  const mapBox = ph.others.find(([n]) => n === '#stage')[1];
  check('phone: the map still gets room', mapBox && mapBox.h >= 200, JSON.stringify(mapBox));
  check('phone: no console errors, DB 0', s.errors.length === 0 && s.sockets.length === 0 && s.remote.length === 0, s.errors.concat(s.sockets, s.remote).join('|'));
  await s.ctx.close();

  await browser.close();
  done();
})();
