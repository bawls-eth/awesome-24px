// G-14 (b08-02, b08-03, b08-05): one first move. On a fresh profile PLAY, the Next line and the highlighted card on Hub Home all name the
// same place (the guided Realm adventure); the map's default node (Pixeltown Square) opens a card with an enabled Play that navigates
// (never "Coming soon"); the Town join card's pill reads "Home" and goes Home; a returning profile still resumes its last place.
// Offline: blockDb, local pages only, no chat, no Firebase writes.
// Run: BASE=http://localhost:8440/game/index.html node game/tests/beta-g14-one-first-move.test.js
const { chromium } = require('playwright');
const { check, done, blockDb } = require('./helpers');
const BASE = process.env.BASE || 'http://localhost:8440/game/index.html';
const ORIGIN = BASE.replace(/\/game\/index\.html.*$/, '');
const HUB = ORIGIN + '/game/hub/index.html';

async function open(browser, url, seed) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  await blockDb(ctx);
  await ctx.route(/gstatic\.com\/firebasejs\//, (r) => r.fulfill({ status: 200, contentType: 'application/javascript', body: '/* firebase SDK blocked */' }));
  if (seed) await ctx.addInitScript((s) => { if (sessionStorage.seeded) return; sessionStorage.seeded = '1'; Object.keys(s).forEach((k) => localStorage.setItem(k, s[k])); }, seed);
  const page = await ctx.newPage(); const errors = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  await page.goto(url);
  return { ctx, page, errors };
}
const abs = (page, href) => page.evaluate((h) => new URL(h, location.href).href, href);

(async () => {
  const browser = await chromium.launch();
  // 1: fresh storage, Hub Home
  let o = await open(browser, HUB);
  await o.page.waitForFunction(() => window.__hub && window.__home);
  const h = await o.page.evaluate(() => {
    const play = document.getElementById('home-play'), next = document.getElementById('home-next'), first = document.querySelector('#home-groups a.home-card[data-first="1"]');
    return { play: play.getAttribute('href'), playPlace: play.dataset.place, sub: document.getElementById('home-play-sub').textContent, next: next.hidden ? null : next.getAttribute('href'), nextTxt: document.getElementById('home-next-txt').textContent, first: first ? first.getAttribute('href') : null, firstPlace: first ? first.dataset.place : null, firsts: document.querySelectorAll('#home-groups a.home-card[data-first="1"]').length };
  });
  const urls = await Promise.all([h.play, h.next, h.first].map((x) => (x ? abs(o.page, x) : null)));
  check('1. fresh profile: PLAY, the Next line and the highlighted card resolve to the same URL (the guided Realm adventure)', urls[0] && urls[0] === urls[1] && urls[1] === urls[2] && /mad-maze\/index\.html\?mode=world/.test(urls[0]) && h.playPlace === 'realm' && h.firstPlace === 'realm' && h.firsts === 1, JSON.stringify({ h, urls }));
  check('1b. the PLAY sub line and the Next line name the guided adventure', /guided adventure/.test(h.sub) && /guided adventure/.test(h.nextTxt), JSON.stringify(h));

  // 2: the map's default node opens a card with an enabled Play that navigates
  await o.page.evaluate(() => document.getElementById('view-toggle').click());
  await o.page.waitForTimeout(300);
  const at = await o.page.evaluate(() => window.__hub.at);
  const p = await o.page.evaluate((i) => window.__hub.nodeClient(i), at);
  await o.page.mouse.click(p.x, p.y);
  await o.page.waitForSelector('#card:not([hidden])', { timeout: 4000 }).catch(() => {});
  const card = await o.page.evaluate(() => ({ open: !document.getElementById('card').hidden, title: document.getElementById('card-title').textContent, play: !document.getElementById('card-play').hidden, href: document.getElementById('card-play').getAttribute('href'), soon: !document.getElementById('card-soon').hidden }));
  check('2. the map default node (' + at + ') opens a card with an enabled Play (not "Coming soon")', at === 'w0-square' && card.open && card.play && !card.soon && !!card.href, JSON.stringify(card));
  const r = card.href ? await o.page.request.get(await abs(o.page, card.href)) : null;
  check('2b. that Play link resolves (HTTP 200)', !!r && r.status() === 200, r ? String(r.status()) : 'none');
  await o.ctx.close();

  // 3: the Town join card pill reads "Home" and lands on the Hub Home
  o = await open(browser, BASE + '?from=hub');
  await o.page.waitForSelector('#name-input', { state: 'visible', timeout: 15000 });
  const pill = await o.page.evaluate(() => { const a = document.getElementById('back-to-map-pill'); return a ? { text: a.textContent.trim(), href: a.getAttribute('href'), vis: !a.classList.contains('hidden') } : null; });
  check('3. the join-card pill text names the place it lands on: "Home" -> the Hub Home', !!pill && /Home/.test(pill.text) && !/map/i.test(pill.text) && /hub\/index\.html$/.test(pill.href), JSON.stringify(pill));
  await o.ctx.close();

  // 4: a returning profile still resumes its last place
  o = await open(browser, HUB, { 'pixeltown-nav-v1': JSON.stringify({ v: 1, last: { id: 'isles', sub: 'Coral Reef', url: 'game/games/isles/index.html?isle=reef', t: 1 }, prev: null }) });
  await o.page.waitForFunction(() => window.__hub && window.__home);
  const c = await o.page.evaluate(() => ({ txt: document.getElementById('home-play-txt').textContent, href: document.getElementById('home-play').getAttribute('href'), first: document.querySelectorAll('#home-groups a.home-card[data-first="1"]').length }));
  check('4. a returning profile: PLAY reads Continue and resumes its last place (no first-move highlight)', c.txt === 'Continue' && /isles\/index\.html\?isle=reef/.test(c.href) && c.first === 0, JSON.stringify(c));
  check('no page errors', o.errors.length === 0, o.errors.join(' | '));
  await o.ctx.close();
  await browser.close();
  done();
})().catch((e) => { console.error(e); process.exit(1); });
