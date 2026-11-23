// S11 QA fixes: Mad Maze hub exit, hub phone layout, Bug Safari phone picker, Lantern disabled Start.
// Serve the repo root first:  python3 -m http.server 8460 &
// Run: BASE=http://localhost:8460/game/index.html NODE_PATH=$(npm root -g) node game/tests/qa-fixes.test.js
// No Firebase, no external network (the town page is stubbed out).
const { chromium } = require('playwright');
const { check, done } = require('./helpers');
const ORIGIN = (process.env.BASE || 'http://localhost:8460/game/index.html').replace(/\/game\/index\.html.*$/, '');
const G = (p) => ORIGIN + '/game/' + p;
const PHONE = { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true };

async function open(browser, url, opts) {
  const ctx = await browser.newContext(opts || { viewport: { width: 1000, height: 700 } });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  // the town page is never really loaded (it pulls Firebase); stub it so redirects are observable
  await page.route('**/game/index.html*', (r) => r.fulfill({ contentType: 'text/html', body: '<title>town stub</title>' }));
  await page.goto(url);
  return { ctx, page, errors };
}
const pathOf = (u) => new URL(u).pathname + new URL(u).search;

async function leaveTarget(browser, qs) {
  const s = await open(browser, G('games/mad-maze/index.html?test=1' + qs));
  await s.page.waitForFunction(() => window.__mm);
  await s.page.click('#realm-leave-btn');
  await s.page.waitForURL(/\/game\/(hub\/)?index\.html/, { timeout: 5000 });
  const p = new URL(s.page.url()).pathname;
  const label = await s.page.evaluate(() => null);
  await s.ctx.close();
  return p;
}
async function summaryLinks(browser, qs) {
  const s = await open(browser, G('games/mad-maze/index.html?mode=dungeon&seed=1&test=1' + qs));
  await s.page.waitForFunction(() => window.__mm && window.__mm.dungeon && window.__mm.dungeon.room !== null);
  await s.page.evaluate(() => window.__mm.dungeon.finish());
  await s.page.waitForSelector('#mm-sum-home', { state: 'attached' });
  const r = await s.page.evaluate(() => ({ home: document.getElementById('mm-sum-home').getAttribute('href'), homeText: document.getElementById('mm-sum-home').textContent, again: document.getElementById('mm-sum-again').getAttribute('href'), againText: document.getElementById('mm-sum-again').textContent }));
  await s.ctx.close();
  return r;
}

(async () => {
  const browser = await chromium.launch();

  // 1. Mad Maze exit
  check('Leave with ?from=hub goes to the hub', (await leaveTarget(browser, '&from=hub')) === '/game/hub/index.html');
  // NAV-AUDIT #12: with no previous place, Leave goes to the World map, never the Town join form with an empty name
  check('Leave without from (no previous place) goes to the World map', (await leaveTarget(browser, '')) === '/game/hub/index.html');
  check('Leave with from=hubX also falls back to the World map', (await leaveTarget(browser, '&from=hubX')) === '/game/hub/index.html');
  check('Leave with hostile from=<img> falls back to the World map', (await leaveTarget(browser, '&from=' + encodeURIComponent('<img src=x onerror=alert(1)>'))) === '/game/hub/index.html');
  // NAV-AUDIT #8: one label scheme; the button always says Leave, its aria-label / title name the destination
  let s = await open(browser, G('games/mad-maze/index.html?test=1&from=hub'));
  const lbHub = await s.page.evaluate(() => { const b = document.getElementById('realm-leave-btn'); return { t: b.textContent, a: b.getAttribute('aria-label'), ti: b.title }; });
  check('Leave button reads Leave and is labelled for the map when from=hub', /Leave/.test(lbHub.t) && /back to the map/.test(lbHub.a) && lbHub.ti === 'Back to the map', JSON.stringify(lbHub));
  await s.ctx.close();
  s = await open(browser, G('games/mad-maze/index.html?test=1'));
  check('Leave button label unchanged without from', /Leave/.test(await s.page.textContent('#realm-leave-btn')));
  await s.ctx.close();

  let r = await summaryLinks(browser, '&from=hub');
  check('summary Back link targets the hub (from=hub)', r.home === '../../hub/index.html' && r.homeText === 'Back to the map', JSON.stringify(r));
  check('summary New dungeon link still works and keeps from=hub', /^\?mode=dungeon&seed=2/.test(r.again) && /from=hub/.test(r.again) && r.againText === 'New dungeon', r.again);
  r = await summaryLinks(browser, '');
  check('summary Back link is the World map without from (no previous place), New dungeon adds no from=', r.home === '../../hub/index.html' && r.homeText === 'Back to the map' && !/from=/.test(r.again), JSON.stringify(r));
  r = await summaryLinks(browser, '&from=hubX');
  check('summary ignores from=hubX (World map fallback, no from= kept)', r.home === '../../hub/index.html' && r.homeText === 'Back to the map' && !/from=/.test(r.again), JSON.stringify(r));
  r = await summaryLinks(browser, '&from=' + encodeURIComponent('<img src=x>'));
  check('summary ignores hostile from=<img>', r.home === '../../hub/index.html' && !/img/.test(r.again) && !/img/.test(r.homeText), JSON.stringify(r));

  // 2. Hub: node links carry ?from=hub, phone header and map
  s = await open(browser, G('hub/index.html?map=1'), PHONE /* HS1: the map view */);
  await s.page.waitForFunction(() => window.__hub);
  const src = await s.page.evaluate(() => fetch('hub.js').then((r) => r.text()));
  const links = {};
  ['w2-lantern', 'w2-catacombs', 'w5-safari'].forEach((id) => { const m = src.match(new RegExp("'" + id + "': '([^']*)'")); links[id] = m ? m[1] : null; });
  check('hub Lantern node link carries ?from=hub', links['w2-lantern'] === '../games/mad-maze/lantern.html?from=hub', JSON.stringify(links));
  check('hub Catacombs node link carries ?from=hub', /mad-maze\/index\.html\?mode=dungeon&seed=1&from=hub$/.test(links['w2-catacombs'] || ''), JSON.stringify(links));
  const hdr = await s.page.evaluate(() => ['hud', 'hud-name', 'hud-world'].map((id) => { const e = document.getElementById(id); return [id, e.scrollWidth, e.clientWidth]; }));
  check('hub header text is not truncated at 390 (scrollWidth <= clientWidth)', hdr.every((h) => h[1] <= h[2]), JSON.stringify(hdr));
  const noEllipsis = await s.page.evaluate(() => ['hud-name', 'hud-world'].every((id) => getComputedStyle(document.getElementById(id)).textOverflow !== 'ellipsis'));
  check('hub header does not use ellipsis', noEllipsis);
  const m = await s.page.evaluate(() => { const r = document.getElementById('map').getBoundingClientRect(); return { h: r.height, w: r.width, vh: innerHeight, vw: innerWidth, sw: document.documentElement.scrollWidth }; });
  check('hub map canvas fills >= 55% of the viewport height at 390x844', m.h / m.vh >= 0.55, JSON.stringify(m));
  check('hub map is as wide as the viewport allows (fit to width)', m.w >= m.vw * 0.9 && m.sw <= m.vw, JSON.stringify(m));
  const open2 = await s.page.evaluate(() => { const b = document.getElementById('open-btn').getBoundingClientRect(); return [b.width, b.height]; });
  check('hub Open button is a >= 44 px target', open2[0] >= 44 && open2[1] >= 44, JSON.stringify(open2));
  // tapping a node on the padded map still works
  const pt = await s.page.evaluate(() => window.__hub.nodeClient('w0-hearthvale') || window.__hub.nodeClient('w1-hearthvale'));
  check('hub nodeClient lands inside the canvas after padding', !!pt && pt.x > 0 && pt.y > 0 && pt.y < 844, JSON.stringify(pt));
  check('hub has no page errors on the phone', s.errors.length === 0, s.errors.join('|'));
  await s.ctx.close();

  // 3. Bug Safari arena picker at 390x844
  s = await open(browser, G('games/festival/bugs.html'), PHONE);
  await s.page.waitForSelector('#overlay button[data-arena]', { state: 'visible' });
  const arenas = await s.page.evaluate(() => {
    const ov = document.getElementById('overlay');
    return [...ov.querySelectorAll('button[data-arena]')].map((b) => {
      const r = b.getBoundingClientRect();
      return { id: b.dataset.arena, w: r.width, h: r.height, top: r.top, bottom: r.bottom, left: r.left, right: r.right };
    });
  });
  check('all 9 arena buttons exist (the 8 arenas + the Night Glade added by Bug Safari depth)', arenas.length === 9, String(arenas.length));
  check('every arena button is >= 44 px tall and wide', arenas.every((a) => a.h >= 44 && a.w >= 44), JSON.stringify(arenas.map((a) => [a.w, a.h])));
  check('every arena button is inside the viewport (reachable without clipping)', arenas.every((a) => a.top >= 0 && a.bottom <= 844 && a.left >= 0 && a.right <= 390), JSON.stringify(arenas.map((a) => [a.top, a.bottom])));
  const ovSc = await s.page.evaluate(() => { const o = document.getElementById('overlay'); const cs = getComputedStyle(o); return { oy: cs.overflowY, pos: cs.position, sh: o.scrollHeight, ch: o.clientHeight, doc: document.documentElement.scrollWidth }; });
  check('picker overlay scrolls if needed and covers the viewport', ovSc.pos === 'fixed' && (ovSc.oy === 'auto' || ovSc.oy === 'scroll'), JSON.stringify(ovSc));
  check('bugs page has no horizontal scroll at 390', ovSc.doc <= 390, JSON.stringify(ovSc));
  const jb = await s.page.evaluate(() => { const b = [...document.querySelectorAll('#overlay button')].find((x) => /journal/i.test(x.textContent)); if (!b) return null; b.scrollIntoView(); const r = b.getBoundingClientRect(); return [r.height, r.bottom]; });
  check('the Bug journal button is reachable (>= 44 px, within viewport after scrolling)', !!jb && jb[0] >= 44 && jb[1] <= 844, JSON.stringify(jb));
  await s.ctx.close();

  // 4. Lantern Start run
  s = await open(browser, G('games/mad-maze/lantern.html'), { viewport: { width: 1000, height: 700 } });
  await s.page.waitForSelector('#start', { state: 'attached' });
  let st = await s.page.evaluate(() => { const a = document.getElementById('start'); return { href: a.getAttribute('href'), aria: a.getAttribute('aria-disabled'), tab: a.getAttribute('tabindex'), pe: getComputedStyle(a).pointerEvents, status: document.getElementById('status').textContent }; });
  check('Lantern Start run without a hero has no href, aria-disabled, tabindex -1 and pointer-events none', st.href === null && st.aria === 'true' && st.tab === '-1' && st.pe === 'none', JSON.stringify(st));
  check('Lantern explains why Start run is disabled in the status line', /hero/i.test(st.status), st.status);
  await s.page.fill('#new-name', 'Mossy');
  await s.page.click('#new-create');
  st = await s.page.evaluate(() => { const a = document.getElementById('start'); return { href: a.getAttribute('href'), aria: a.getAttribute('aria-disabled'), tab: a.getAttribute('tabindex'), pe: getComputedStyle(a).pointerEvents }; });
  check('Lantern Start run is enabled with a hero', /^\.\/index\.html\?hero=/.test(st.href || '') && st.aria === null && st.tab === null && st.pe !== 'none', JSON.stringify(st));
  check('Lantern page has no errors', s.errors.length === 0, s.errors.join('|'));
  await s.ctx.close();

  await browser.close();
  done();
})().catch((e) => { console.error(e); process.exit(1); });
