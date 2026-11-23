// HS1 Hub home screen (game/hub/home.js): the simple 8-bit title screen that is now the default Hub view, the map behind the
// Map toggle / ?map=1, the Continue button (MMNav last-place memory) and the grouped "Where to?" sheet.
// Serve the repo root first:  python3 -m http.server 8440 &
// Run: BASE=http://localhost:8440/game/index.html NODE_PATH=$(npm root -g) node game/tests/hub-home.test.js
// No Firebase (blockDb), no external network, nothing written but the page's own local keys.
const { chromium } = require('playwright');
const { check, done, blockDb } = require('./helpers');
const ORIGIN = (process.env.BASE || 'http://localhost:8440/game/index.html').replace(/\/game\/index\.html.*$/, '');
const HUB = ORIGIN + '/game/hub/index.html';
const PHONE = { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 };
const DESK = { viewport: { width: 1280, height: 800 } };
const GROUPS = { adventure: ['town', 'realm', 'isles', 'lantern'], arcade: ['pop', 'dash', 'stack', 'echo', 'jam'], quick: ['angler', 'bugs', 'stalk', 'deepdelve'] };
const SHEET = 'town,realm,isles,lantern,map,pop,dash,stack,echo,jam,angler,bugs,stalk,deepdelve';

async function open(browser, opts, url, seed) {
  const ctx = await browser.newContext(opts);
  const db = await blockDb(ctx);
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  if (seed) {
    await page.addInitScript((s) => {
      if (sessionStorage.seeded) return;
      sessionStorage.seeded = '1';
      Object.keys(s).forEach((k) => localStorage.setItem(k, s[k]));
    }, seed);
  }
  await page.goto(url);
  await page.waitForFunction(() => window.__hub && window.__home);
  await page.waitForTimeout(250);
  return { ctx, page, errors, db };
}
const vis = (page, sel) => page.evaluate((s) => { const n = document.querySelector(s); if (!n) return null; const r = n.getBoundingClientRect(); const cs = getComputedStyle(n); return { vis: r.width > 0 && r.height > 0 && cs.display !== 'none' && cs.visibility !== 'hidden', l: r.left, t: r.top, w: r.width, h: r.height, b: r.bottom }; }, sel);

async function homeChecks(browser, label, opts) {
  const L = (s) => '[' + label + '] ' + s;
  const o = await open(browser, opts, HUB);
  const pg = o.page;
  const st = await pg.evaluate(() => ({
    home: window.__home.isHome(), homeVis: !document.getElementById('home').hidden,
    stage: getComputedStyle(document.getElementById('stage')).display, hud: getComputedStyle(document.getElementById('hud')).display,
    url: location.search, toggle: document.getElementById('view-toggle').textContent,
    title: document.getElementById('home-title').textContent,
    logo: (() => { const c = document.getElementById('home-logo'); const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data; let n = 0; for (let i = 3; i < d.length; i += 4) if (d[i]) n++; return { w: c.width, h: c.height, lit: n }; })(),
    sky: (() => { const c = document.getElementById('home-sky'); const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data; const set = new Set(); for (let i = 0; i < d.length; i += 4 * 7) set.add(d[i] + ',' + d[i + 1] + ',' + d[i + 2]); return set.size; })(),
    imgs: document.querySelectorAll('#home img').length,
  }));
  check(L('home screen is the default view (no ?map=1): map stage and map HUD hidden, toggle says Map'), st.home && st.homeVis && st.stage === 'none' && st.hud === 'none' && st.toggle === 'Map' && !/map=1/.test(st.url), JSON.stringify(st));
  check(L('pixel logo is drawn in code (canvas, lit pixels) and the title reads Pixeltown'), st.logo.lit > 80 && st.logo.h <= 16 && st.title === 'Pixeltown' && st.imgs === 0, JSON.stringify(st.logo));
  check(L('stepped sky / stars / hills are drawn (many colours on the sky canvas)'), st.sky >= 6, String(st.sky));

  // groups
  const g = await pg.evaluate(() => window.__home.groups());
  const want = Object.keys(GROUPS).map((k) => k + ':' + GROUPS[k].join(',')).join('|');
  check(L('three groups: Adventure / Arcade / Quick games with the right games in order'), g.map((x) => x.id + ':' + x.places.join(',')).join('|') === want && g.map((x) => x.title).join() === 'Adventure,Arcade,Quick games', JSON.stringify(g));
  const cards = await pg.evaluate(() => [...document.querySelectorAll('#home .home-card')].map((a) => { const r = a.getBoundingClientRect(); return { id: a.dataset.place, href: a.getAttribute('href'), w: r.width, h: r.height, b: r.bottom, name: a.querySelector('.hc-name').textContent, hint: a.querySelector('.hc-hint').textContent, ico: a.querySelector('.hc-ico').textContent, pips: a.querySelectorAll('.hc-pips i').length, label: a.getAttribute('aria-label') }; }));
  check(L('13 big pixel cards, each >= 56 px tall and >= 44 px wide, with icon + name + one-line hint'), cards.length === 13 && cards.every((c) => c.h >= 56 && c.w >= 44 && c.ico && c.name && c.hint), JSON.stringify(cards.filter((c) => c.h < 56 || c.w < 44)));
  check(L('games with medals show medal pips (none for Town / Realm / Lantern)'), cards.filter((c) => c.pips > 0).map((c) => c.id).sort().join() === 'angler,bugs,dash,deepdelve,echo,isles,jam,pop,stack,stalk' && /medals/.test(cards.find((c) => c.id === 'angler').label), JSON.stringify(cards.map((c) => c.id + c.pips)));
  const bad = [];
  for (const c of cards) { const u = new URL(c.href, pg.url()).toString().split('?')[0]; const r = await o.ctx.request.get(u); if (r.status() !== 200) bad.push(c.id + ' ' + r.status()); }
  check(L('every card links to a page that answers HTTP 200'), bad.length === 0, bad.join());

  // primary path fits, targets, scroll
  const lay = await pg.evaluate(() => {
    const vh = innerHeight, inn = document.querySelector('.home-in');
    const small = [...document.querySelectorAll('#home a, #home button, #bar a, #bar button')].filter((n) => !n.hidden && n.offsetParent).map((n) => { const r = n.getBoundingClientRect(); return { id: n.id || n.className, w: r.width, h: r.height }; }).filter((r) => r.w < 44 || r.h < 44);
    const fs = [...document.querySelectorAll('#home .hc-name, #home .hc-hint, #home .home-group-title, #home .hn-txt, #home .hp-sub')].map((n) => parseFloat(getComputedStyle(n).fontSize));
    const last = [...document.querySelectorAll('#home .home-card')].pop().getBoundingClientRect().bottom;
    const bar = document.getElementById('bar').getBoundingClientRect().top;
    return { vh, sw: document.documentElement.scrollWidth, iw: innerWidth, scroll: inn.scrollHeight - inn.clientHeight, small, minFont: Math.min(...fs), last, bar };
  });
  check(L('primary path (Play + every card + Collections) fits with no scrolling, no horizontal scroll'), lay.scroll <= 1 && lay.sw <= lay.iw && lay.last <= lay.bar, JSON.stringify(lay));
  check(L('every home + footer control is >= 44 px; text >= 12 px'), lay.small.length === 0 && lay.minFont >= 12, JSON.stringify(lay.small) + ' ' + lay.minFont);
  const play = await vis(pg, '#home-play');
  // G-14 (b08-02): a fresh profile's one first move is the guided Realm adventure (it was the Town)
  check(L('one big Play button (>= 56 px tall) near the top; fresh profile = Play, the guided Realm adventure'), play.vis && play.h >= 56 && play.t < 140 && (await pg.textContent('#home-play-txt')) === 'Play' && (await pg.getAttribute('#home-play', 'href')) === '../games/mad-maze/index.html?mode=world&from=hub', JSON.stringify(play));
  const nx = await pg.evaluate(() => ({ n: window.__home.next(), vis: !document.getElementById('home-next').hidden, t: document.getElementById('home-next-txt').textContent, href: document.getElementById('home-next').getAttribute('href'), items: document.querySelectorAll('#home .home-next').length }));
  // G-14: on a fresh profile the one next-step line names the same first move as Play (calm goals take over once there is progress)
  check(L('ONE next-step line, a real link, naming the same first move as Play on a fresh profile'), nx.vis && nx.items === 1 && nx.n && nx.n.key === 'first-realm' && /^Next: /.test(nx.t) && nx.href === '../games/mad-maze/index.html?mode=world&from=hub', JSON.stringify(nx));
  const foot = await pg.evaluate(() => [...document.querySelectorAll('#bar a, #bar button')].filter((n) => n.offsetParent).map((n) => n.id));
  check(L('footer keeps Town / Daily gift / Open (+ the Map toggle)'), ['hub-town', 'gift-btn', 'open-btn', 'view-toggle'].every((id) => foot.includes(id)), foot.join());

  // Collections single card opens the book
  await pg.click('#home-coll');
  await pg.waitForTimeout(150);
  const coll = await pg.evaluate(() => ({ open: !document.getElementById('coll-sheet').hidden, sum: document.getElementById('home-coll-sum').textContent, n: document.querySelectorAll('#home .home-coll').length }));
  check(L('Collections is a single card that opens the collections book'), coll.open && coll.n === 1 && /found/.test(coll.sum), JSON.stringify(coll));
  await pg.click('#coll-close');

  // Enter / arrows on the home screen never open the map card
  await pg.focus('#home-play');
  await pg.keyboard.press('ArrowRight');
  await pg.waitForTimeout(100);
  check(L('arrow keys on the home screen do not walk the hidden map'), !(await pg.evaluate(() => window.__hub.walking)) && (await pg.evaluate(() => document.getElementById('card').hidden)));

  // Map toggle
  await pg.click('#view-toggle');
  await pg.waitForTimeout(300);
  const m = await pg.evaluate(() => { const s = document.getElementById('stage').getBoundingClientRect(); const c = document.getElementById('map').getBoundingClientRect(); return { home: window.__home.isHome(), url: location.search, toggle: document.getElementById('view-toggle').textContent, pressed: document.getElementById('view-toggle').getAttribute('aria-pressed'), stageH: s.height, mapH: c.height, mapW: c.width, hud: getComputedStyle(document.getElementById('hud')).display }; });
  check(L('Map toggle shows the world map (canvas sized, HUD back), adds ?map=1, toggle now says Home'), !m.home && /map=1/.test(m.url) && m.toggle === 'Home' && m.pressed === 'true' && m.mapH > 100 && m.mapW > 100 && m.hud !== 'none', JSON.stringify(m));
  await pg.click('#view-toggle');
  await pg.waitForTimeout(200);
  check(L('Home toggle brings the home screen back and drops ?map=1'), await pg.evaluate(() => window.__home.isHome() && !/map=1/.test(location.search)));

  // Menu sheet: three groups, pixel cards, every place once
  await pg.click('#mm-nav-btn');
  await pg.waitForTimeout(250);
  const sh = await pg.evaluate(() => {
    const s = document.getElementById('mm-nav-sheet');
    return { open: !s.hidden, groups: [...s.querySelectorAll('.mm-nav-group')].map((g) => g.dataset.group + ':' + g.querySelector('.mm-nav-group-title').textContent),
      ids: [...s.querySelectorAll('.mm-nav-dest')].map((a) => a.dataset.place).join(','),
      minH: Math.min(...[...s.querySelectorAll('.mm-nav-dest')].map((a) => a.getBoundingClientRect().height)),
      radius: getComputedStyle(s.querySelector('.mm-nav-dest')).borderTopLeftRadius, back: !!document.getElementById('mm-nav-back'),
      ssw: s.scrollWidth, scw: s.clientWidth };
  });
  check(L('Menu sheet: the same three groups (Adventure / Arcade / Quick games), every place once, Back row kept'), sh.open && sh.groups.join('|') === 'adventure:Adventure|arcade:Arcade|quick:Quick games' && sh.ids === SHEET && sh.back, JSON.stringify(sh));
  check(L('Menu sheet cards are square pixel cards >= 56 px tall, no horizontal scroll'), sh.minH >= 56 && sh.radius === '0px' && sh.ssw <= sh.scw, JSON.stringify(sh));
  await pg.keyboard.press('Escape');

  check(L('0 DB requests'), o.db.count() === 0, String(o.db.count()));
  check(L('console clean'), o.errors.length === 0, o.errors.join(' | '));
  await o.ctx.close();
}

(async () => {
  const browser = await chromium.launch();
  await homeChecks(browser, '390x844', PHONE);
  await homeChecks(browser, 'desktop 1280x800', DESK);

  // ?map=1 opens straight on the map
  {
    const o = await open(browser, PHONE, HUB + '?map=1');
    const r = await o.page.evaluate(() => ({ home: window.__home.isHome(), homeHidden: document.getElementById('home').hidden, toggle: document.getElementById('view-toggle').textContent, map: document.getElementById('map').getBoundingClientRect().height }));
    check('?map=1 opens the map view directly (home hidden, toggle says Home)', !r.home && r.homeHidden && r.toggle === 'Home' && r.map > 200, JSON.stringify(r));
    await o.ctx.close();
  }
  // Continue: last place memory (MMNav pixeltown-nav-v1) -> Continue to that place, the map itself never counts
  {
    const nav = JSON.stringify({ v: 1, last: { id: 'isles', sub: 'Coral Reef', url: 'game/games/isles/index.html?isle=reef', t: 5 }, prev: null });
    const o = await open(browser, PHONE, HUB, { 'pixeltown-nav-v1': nav });
    const c = await o.page.evaluate(() => ({ c: window.__home.cont(), txt: document.getElementById('home-play-txt').textContent, sub: document.getElementById('home-play-sub').textContent, href: document.getElementById('home-play').getAttribute('href') }));
    check('Continue resumes the last place (Isles - Coral Reef, with its isle)', c.txt === 'Continue' && c.c.id === 'isles' && c.href === '../games/isles/index.html?isle=reef' && /Coral Reef/.test(c.sub), JSON.stringify(c));
    await o.page.reload();
    await o.page.waitForFunction(() => window.__home);
    const c2 = await o.page.evaluate(() => ({ c: window.__home.cont(), href: document.getElementById('home-play').getAttribute('href') }));
    check('after a Hub reload Continue still points at the place before the map', c2.c && c2.c.id === 'isles' && c2.href === '../games/isles/index.html?isle=reef', JSON.stringify(c2));
    await Promise.all([o.page.waitForURL(/games\/isles\/index\.html/), o.page.click('#home-play')]);
    check('tapping Continue opens that place (the Isles page then picks a sailable isle itself)', /games\/isles\/index\.html/.test(o.page.url()), o.page.url());
    check('Continue: 0 DB requests', o.db.count() === 0);
    await o.ctx.close();
  }
  {
    const nav = JSON.stringify({ v: 1, last: { id: 'town', sub: '', url: 'game/index.html', t: 5 }, prev: null });
    const o = await open(browser, DESK, HUB, { 'pixeltown-nav-v1': nav });
    const c = await o.page.evaluate(() => ({ c: window.__home.cont(), txt: document.getElementById('home-play-txt').textContent, href: document.getElementById('home-play').getAttribute('href') }));
    check('Continue to the Town uses the Town link (from=hub)', c.txt === 'Continue' && c.c.id === 'town' && c.href === '../index.html?from=hub', JSON.stringify(c));
    const hostile = JSON.stringify({ v: 1, last: { id: 'jam', url: 'javascript:alert(1)', sub: '<img src=x onerror=alert(1)>', t: 1 } });
    await o.page.evaluate((h) => localStorage.setItem('pixeltown-nav-v1', h), hostile);
    await o.page.reload();
    await o.page.waitForFunction(() => window.__home);
    const h = await o.page.evaluate(() => ({ href: document.getElementById('home-play').getAttribute('href'), sub: document.getElementById('home-play-sub').textContent, imgs: document.querySelectorAll('#home img').length }));
    check('hostile memory is cleaned (registry URL, no markup)', h.href === '../games/jam/index.html' && h.imgs === 0 && !/javascript/.test(h.href), JSON.stringify(h));
    await o.ctx.close();
  }
  // medals light pips; ?calm=0 hides the next-step line
  {
    const o = await open(browser, PHONE, HUB + '?calm=0', { 'pixeltown-medals-angler-v1': JSON.stringify({ v: 1, m: ['catch1', 'species10', 'boss1'] }), 'pixeltown-medals-pop-v1': JSON.stringify({ v: 1, m: ['round1'] }) });
    const r = await o.page.evaluate(() => ({ angler: document.querySelectorAll('.home-card[data-place="angler"] .hc-pips i.on').length, pop: document.querySelectorAll('.home-card[data-place="pop"] .hc-pips i.on').length, popM: document.querySelector('.home-card[data-place="pop"]').dataset.medals, next: document.getElementById('home-next').hidden }));
    check('medal pips read the shared medal keys (Angler 3/3 lit, Pixel Pop 1 lit of 4)', r.angler === 3 && r.pop === 1 && r.popM === '1/4', JSON.stringify(r));
    check('?calm=0 hides the next-step line', r.next === true);
    await o.ctx.close();
  }
  // reduced motion: one still frame, no animation loop
  {
    const o = await open(browser, Object.assign({ reducedMotion: 'reduce' }, PHONE), HUB);
    check('reduced motion: the sky is a still frame (no animation loop)', (await o.page.evaluate(() => window.__home.animated())) === false);
    await o.ctx.close();
    const o2 = await open(browser, DESK, HUB);
    check('full motion: the sky parallax animates', (await o2.page.evaluate(() => window.__home.animated())) === true);
    await o2.ctx.close();
    const o3 = await open(browser, DESK, HUB, { 'pixeltown-access-v1': JSON.stringify({ v: 1, lowGfx: true }) });
    check('low graphics: the sky is a still frame', (await o3.page.evaluate(() => window.__home.animated())) === false);
    await o3.ctx.close();
  }
  // ui-scale 1.5 still has no horizontal scroll
  {
    const o = await open(browser, PHONE, HUB, { 'pixeltown-access-v1': JSON.stringify({ v: 1, hudScale: 1.5 }) });
    const r = await o.page.evaluate(() => ({ scale: getComputedStyle(document.documentElement).getPropertyValue('--ui-scale').trim(), sw: document.documentElement.scrollWidth, iw: innerWidth, f: parseFloat(getComputedStyle(document.querySelector('.hc-name')).fontSize) }));
    check('ui-scale 1.5: bigger text, no horizontal scroll', r.scale === '1.5' && r.f >= 19 && r.sw <= r.iw, JSON.stringify(r));
    // bug bash: at 150 % no game name or hint is cut ("Lantern C..."), cards go one per row on phones, the footer stays on screen
    const big = await o.page.evaluate(() => {
      const cut = [...document.querySelectorAll('#home .hc-name, #home .hc-hint, #home-play-sub, #home-next .hn-txt')].filter((n) => n.scrollWidth > n.clientWidth + 1).map((n) => n.textContent);
      const cols = new Set([...document.querySelectorAll('#home .home-card')].map((a) => Math.round(a.getBoundingClientRect().left))).size;
      const foot = [...document.querySelectorAll('#bar a, #bar button')].filter((n) => n.offsetParent).map((n) => n.getBoundingClientRect()).every((r) => r.bottom <= innerHeight + 0.5 && r.right <= innerWidth + 0.5 && r.left >= 0);
      return { attr: document.documentElement.getAttribute('data-ui-big'), cut, cols, foot };
    });
    check('ui-scale 1.5: no cut-off game names or hints, one card per row, every footer button fully on screen', big.attr === '1' && big.cut.length === 0 && big.cols === 1 && big.foot, JSON.stringify(big));
    await o.ctx.close();
  }
  for (const vp of [{ width: 320, height: 568 }, { width: 844, height: 390 }]) {
    const o = await open(browser, { viewport: vp, isMobile: true, hasTouch: true }, HUB, { 'pixeltown-access-v1': JSON.stringify({ v: 1, hudScale: 1.5 }) });
    const r = await o.page.evaluate(() => ({ sw: document.documentElement.scrollWidth, iw: innerWidth, cut: [...document.querySelectorAll('#home .hc-name, #home .hc-hint')].filter((n) => n.scrollWidth > n.clientWidth + 1).length,
      foot: [...document.querySelectorAll('#bar a, #bar button')].filter((n) => n.offsetParent).every((n) => { const b = n.getBoundingClientRect(); return b.bottom <= innerHeight + 0.5 && b.right <= innerWidth + 0.5; }) }));
    check('ui-scale 1.5 at ' + vp.width + 'x' + vp.height + ': no horizontal scroll, no cut names, footer on screen', r.sw <= r.iw && r.cut === 0 && r.foot, JSON.stringify(r));
    await o.ctx.close();
  }
  await browser.close();
  done();
})().catch((e) => { console.error(e); process.exitCode = 1; });
