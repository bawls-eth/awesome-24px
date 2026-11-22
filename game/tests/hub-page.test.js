// Hub page (game/hub/). Serve the repo root first:  python3 -m http.server 8448 &
// Run: BASE=http://localhost:8448/game/index.html NODE_PATH=$(npm root -g) node game/tests/hub-page.test.js
// Set SHOTS=<dir> to also write desktop/phone screenshots. No Firebase, no external network.
const { chromium } = require('playwright');
const { check, done } = require('./helpers');
const ORIGIN = (process.env.BASE || 'http://localhost:8440/game/index.html').replace(/\/game\/index\.html.*$/, '');
const URL = ORIGIN + '/game/hub/index.html';
const TOWN = JSON.stringify({ name: 'Mossy', species: 'coolcats', frame: 2, coins: 77 });

async function open(browser, opts, seed) {
  const ctx = await browser.newContext(opts);
  const page = await ctx.newPage();
  const errors = []; const reqs = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  page.on('request', (r) => reqs.push(r.url()));
  await page.addInitScript((s) => {
    if (sessionStorage.seeded) return;
    sessionStorage.seeded = '1';
    Object.keys(s).forEach((k) => localStorage.setItem(k, s[k]));
  }, seed || { 'pixeltown-save-v1': TOWN });
  await page.goto(URL);
  await page.waitForFunction(() => window.__hub);
  await page.waitForTimeout(200);
  return { ctx, page, errors, reqs };
}
const idle = (page) => page.waitForFunction(() => !window.__hub.walking, null, { timeout: 8000 });
async function tap(page, id) {
  const p = await page.evaluate((i) => window.__hub.nodeClient(i), id);
  await page.mouse.click(p.x, p.y);
}

(async () => {
  const browser = await chromium.launch();
  const shot = process.env.SHOTS;

  const d = await open(browser, { viewport: { width: 1100, height: 760 } });
  const pg = d.page;
  const blank = await pg.evaluate(() => {
    const c = document.getElementById('map'); const data = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
    const seen = new Set(); for (let i = 0; i < data.length; i += 4 * 7) seen.add(data[i] + ',' + data[i + 1] + ',' + data[i + 2]);
    return seen.size;
  });
  check('map renders: canvas is non-blank (many colours)', blank > 8, 'colours=' + blank);
  check('starts at Pixeltown Square, name seeded from town save', (await pg.evaluate(() => window.__hub.at)) === 'w0-square' && (await pg.textContent('#hud-name')) === 'Mossy');

  await tap(pg, 'w0-first');
  await idle(pg);
  check('tapping a reachable node walks the villager there', (await pg.evaluate(() => window.__hub.at)) === 'w0-first');
  check('arrival opens the node card with the title', !(await pg.locator('#card').isHidden()) && (await pg.textContent('#card-title')) === 'First Steps');
  check('no real page for First Steps: shows Coming soon, no Play link', (await pg.locator('#card-soon').isVisible()) && (await pg.locator('#card-play').isHidden()));
  await pg.keyboard.press('Escape');
  check('Escape closes the card', await pg.locator('#card').isHidden());

  await tap(pg, 'w0-sparkle');
  await pg.waitForTimeout(250);
  check('a locked node is ignored (villager stays, no card)', (await pg.evaluate(() => window.__hub.at)) === 'w0-first' && (await pg.locator('#card').isHidden()) && !(await pg.evaluate(() => window.__hub.walking)));

  await tap(pg, 'w0-square'); await idle(pg); await pg.keyboard.press('Escape');
  await pg.keyboard.press('ArrowRight');
  await idle(pg);
  check('keyboard ArrowRight steps to the neighbouring Hearthvale Gate', (await pg.evaluate(() => window.__hub.at)) === 'w0-hearthvale');
  await pg.keyboard.press('Enter');
  const href = await pg.getAttribute('#card-play', 'href');
  check('Enter opens the card; Hearthvale Play link includes ?from=hub', (await pg.textContent('#card-title')) === 'Hearthvale Gate' && /\?from=hub$/.test(href) && href.startsWith('../index.html'), href);
  if (shot) await pg.screenshot({ path: shot + '/hub-desktop.png' });
  await pg.keyboard.press('Escape');

  const before = await pg.evaluate(() => localStorage.getItem('pixeltown-save-v1'));
  check('hub state saved under pixeltown-hub-v1', await pg.evaluate(() => JSON.parse(localStorage.getItem('pixeltown-hub-v1')).at) === 'w0-hearthvale');
  await pg.reload(); await pg.waitForFunction(() => window.__hub); await pg.waitForTimeout(150);
  check('state persists across reload (villager still at the gate)', (await pg.evaluate(() => window.__hub.at)) === 'w0-hearthvale');
  check('town save is byte-identical (read only)', (await pg.evaluate(() => localStorage.getItem('pixeltown-save-v1'))) === before && before === TOWN);
  check('profile key not written by the hub', (await pg.evaluate(() => localStorage.getItem('pixeltown-profile-v1'))) === null);
  check('no network requests off-origin', d.reqs.every((u) => u.startsWith(ORIGIN + '/') || u.startsWith('data:')), d.reqs.filter((u) => !u.startsWith(ORIGIN + '/')).join(' '));
  check('desktop: no console errors', d.errors.length === 0, d.errors.join(' | '));
  await d.ctx.close();

  // Seeded state: Mad Maze Lantern link, and an XSS-shaped stored string stays inert.
  const s = await open(browser, { viewport: { width: 1100, height: 760 } }, {
    'pixeltown-save-v1': TOWN,
    'pixeltown-hub-v1': JSON.stringify({ v: 1, at: 'w2-lantern', evil: '<img src=x onerror=alert(1)>', nodes: { 'w2-lantern': { exits: ['normal'], medals: { b: true } } } }),
  });
  await s.page.keyboard.press('Enter');
  check('Mad Maze Lantern Play link points at the real page', (await s.page.getAttribute('#card-play', 'href')) === '../games/mad-maze/lantern.html?from=hub' && (await s.page.textContent('#card-title')) === 'The Lantern');
  check('card shows medal state (1 of 3)', (await s.page.textContent('#card-status')) === '1 of 3 medals');
  const kept = await s.page.evaluate(() => { window.__hub.at; return Object.keys(JSON.parse(localStorage.getItem('pixeltown-hub-v1'))); });
  check('unknown keys are dropped when the state is sanitised and saved', !kept.includes('evil'), kept.join(','));
  await s.ctx.close();

  // Angler and Bug Safari nodes link to their real pages.
  // NAV slice D: Campfire Jam and Stalk Market are in LINKS too (they used to say "Coming soon").
  for (const [at, want] of [['w4-angler', '../games/angler/index.html'], ['w5-safari', '../games/festival/bugs.html'], ['w5-jam', '../games/jam/index.html'], ['w5-stalk', '../games/stalk/index.html']]) {
    const l = await open(browser, { viewport: { width: 1100, height: 760 } }, { 'pixeltown-save-v1': TOWN, 'pixeltown-hub-v1': JSON.stringify({ v: 1, at }) });
    await l.page.keyboard.press('Enter');
    check('hub ' + at + ' Play link is ' + want, (await l.page.getAttribute('#card-play', 'href')) === want);
    await l.ctx.close();
  }
  // B8: the w7-isles card links to the Hearthvale Isles page, and its open boat path from Hearthvale is shown.
  {
    const l = await open(browser, { viewport: { width: 1100, height: 760 } }, { 'pixeltown-save-v1': TOWN, 'pixeltown-hub-v1': JSON.stringify({ v: 1, at: 'w7-isles' }) });
    await l.page.keyboard.press('Enter');
    const href = await l.page.getAttribute('#card-play', 'href');
    check('hub w7-isles card links to the isles page', href === '../games/isles/index.html?from=hub' && (await l.page.textContent('#card-title')) === 'Hearthvale Isles' && (await l.page.locator('#card-play').isVisible()), String(href));
    const reach = await l.page.evaluate(() => MMMap.openPathIds(MMMap.MAP, MMMap.sanitizeState(null)).includes('w1-hearthvale>w7-isles') && MMMap.validate(MMMap.MAP).ok);
    check('w7-isles is reachable on an open path from Hearthvale (map validates)', reach);
    check('w7-isles view: no console errors', l.errors.length === 0, l.errors.join(' | '));
    await l.ctx.close();
  }
  // NAV slice D: on a fresh save the map PATH to Deepdelve is still locked (the medal game is unchanged: 8 medals),
  // but the game itself is open: tapping it in the games strip opens its card with a Play link and does not move
  // the villager or record a visit (medal / unlock progress is untouched). Before slice D this was a dead end.
  {
    const f = await open(browser, { viewport: { width: 1100, height: 760 }, reducedMotion: 'reduce' }); // reduced: Play is a plain link (no iris), so the test can cancel it
    const st = await f.page.evaluate(() => ({ walk: window.__hub.isReachable('w3-deepdelve'), play: window.__hub.isPlayable('w3-deepdelve') }));
    check('fresh save: Deepdelve path is a locked bonus, the game is playable', st.walk === false && st.play === true, JSON.stringify(st));
    const hubBefore = await f.page.evaluate(() => localStorage.getItem('pixeltown-hub-v1'));
    await f.page.click('#hub-games button[data-node="w3-deepdelve"]');
    const c = await f.page.evaluate(() => ({ title: document.getElementById('card-title').textContent, href: document.getElementById('card-play').getAttribute('href'), play: !document.getElementById('card-play').hidden, bonus: document.getElementById('card-bonus').textContent, at: window.__hub.at }));
    check('fresh save: Deepdelve card has Play and says the map path is a bonus', c.title === 'Deepdelve' && c.href === '../games/deepdelve/index.html' && c.play && /bonus/.test(c.bonus) && c.at === 'w0-square', JSON.stringify(c));
    await f.page.evaluate(() => document.getElementById('card-play').addEventListener('click', (e) => e.preventDefault()));
    await f.page.click('#card-play');
    check('Play on an unwalked game records no visit exit (unlock progress unchanged)', (await f.page.evaluate(() => localStorage.getItem('pixeltown-hub-v1'))) === hubBefore);
    check('fresh-save strip: no console errors', f.errors.length === 0, f.errors.join(' | '));
    await f.ctx.close();
  }

  // Hostile saved positions fall back to the start node (never Object.prototype members).
  for (const bad of ['constructor', 'toString', '__proto__']) {
    const h = await open(browser, { viewport: { width: 1100, height: 760 } }, { 'pixeltown-save-v1': TOWN, 'pixeltown-hub-v1': '{"v":1,"at":"' + bad + '"}' });
    check('hostile position ' + bad + ' falls back to the start node', (await h.page.evaluate(() => window.__hub.at)) === 'w0-square' && h.errors.length === 0, h.errors.join('|'));
    await h.ctx.close();
  }

  // Corrupt key loads clean.
  const c = await open(browser, { viewport: { width: 1100, height: 760 } }, { 'pixeltown-save-v1': TOWN, 'pixeltown-hub-v1': '{not json<<' });
  check('corrupt pixeltown-hub-v1 loads clean at the start node', (await c.page.evaluate(() => window.__hub.at)) === 'w0-square' && c.errors.length === 0, c.errors.join('|'));
  await c.ctx.close();

  // Reduced motion: no tween, no iris.
  const r = await open(browser, { viewport: { width: 1100, height: 760 }, reducedMotion: 'reduce' });
  await tap(r.page, 'w0-first');
  const immediate = await r.page.evaluate(() => ({ at: window.__hub.at, walking: window.__hub.walking }));
  check('reduced motion: villager arrives instantly (no walking tween)', immediate.at === 'w0-first' && immediate.walking === false, JSON.stringify(immediate));
  await r.ctx.close();

  // Phone.
  const p = await open(browser, { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  const m = await p.page.evaluate(() => ({ sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth, h: document.getElementById('open-btn').getBoundingClientRect().height }));
  check('phone 390x844: no horizontal scroll, 48px touch target', m.sw <= m.cw && m.h >= 48, JSON.stringify(m));
  await p.page.tap('#open-btn');
  const pm = await p.page.evaluate(() => { const r = document.getElementById('card').getBoundingClientRect(); const b = document.getElementById('card-close').getBoundingClientRect(); return { w: r.width, cw: document.documentElement.clientWidth, b: Math.min(b.width, b.height) }; });
  check('phone: node card fits the screen with 48px close target', pm.w <= pm.cw && pm.b >= 48, JSON.stringify(pm));
  if (shot) await p.page.screenshot({ path: shot + '/hub-phone.png' });
  check('phone: no console errors', p.errors.length === 0, p.errors.join(' | '));
  await p.ctx.close();

  await browser.close();
  done();
})();
