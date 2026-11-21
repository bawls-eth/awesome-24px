// Ability bar icons (b20) and hero picker portraits: image present, emoji + key letter stay, fallback when the image fails, ?uiicons=0, phone layout.
// Run: BASE=http://localhost:8601/game/index.html NODE_PATH=$(npm root -g) node game/tests/ability-icons.test.js
const { chromium } = require('playwright');
const { check, done } = require('./helpers');
const ORIGIN = (process.env.BASE || 'http://localhost:8440/game/index.html').replace(/\/game\/index\.html.*$/, '');
const WORLD = ORIGIN + '/game/games/mad-maze/index.html?mode=world&test=1&offline=1&heropick=1';
const MM = 'pixeltown-mm-v1', ACTIVE = 'pixeltown-mm-active-v1';
const hero = (id, name, cls, level) => ({ id, name, cls, level, xp: 0, fame: 0, bonus: 0, mode: 'classic', items: [] });
const prof = (heroes) => ({ v: 1, heroes, stash: new Array(16).fill(null), fame: 0, mode: 'classic', hall: [], migratedFrom: null });
const HEROES = [hero('h-paladin', 'Bram', 'paladin', 9), hero('h-ranger', 'Aya', 'ranger', 3)];

async function open(browser, query, opts, abort) {
  const ctx = await browser.newContext(opts || { viewport: { width: 1000, height: 700 } });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errors.push('console: ' + m.text()); });
  if (abort) await page.route(abort, (r) => r.abort());
  await page.goto(ORIGIN + '/game/games/mad-maze/lantern.css');
  await page.evaluate(([k1, p, k2, a]) => { localStorage.setItem(k1, JSON.stringify(p)); localStorage.setItem(k2, a); }, [MM, prof(HEROES), ACTIVE, JSON.stringify({ v: 1, heroId: 'h-paladin' })]);
  errors.length = 0;
  await page.goto(WORLD + (query || ''));
  await page.waitForFunction(() => window.__mm && window.__mm.arena && window.__mm.world);
  return { ctx, page, errors };
}
const abState = (page) => page.evaluate(() => [0, 1, 2, 3].map((i) => {
  const b = document.getElementById('realm-ab-' + i), im = b.querySelector('img.realm-ab-img'), ico = b.querySelector('.ico');
  return { img: im ? im.getAttribute('src').replace(/^.*\//, '') : null, loaded: !!(im && im.complete && im.naturalWidth > 0), key: b.querySelector('.key').textContent, emoji: ico.textContent, icoOpacity: ico.style.opacity, w: b.getBoundingClientRect().width };
}));

(async () => {
  const browser = await chromium.launch();
  const errs = [];
  const P = await open(browser); errs.push(...P.errors);
  await P.page.waitForSelector('#realm-ab-0 img.realm-ab-img');
  await P.page.waitForTimeout(500);
  const st = await abState(P.page);
  check('ability buttons contain the icon image (dash, nova, shield) and it loaded', st[0].img === 'ability_dash.png' && st[1].img === 'ability_nova.png' && st[2].img === 'ability_shield.png' && st.slice(0, 3).every((s) => s.loaded), JSON.stringify(st));
  check('the F slot shows the class signature icon (paladin) and the Q/E/R/F letters stay', st[3].img === 'ability_paladin_sig.png' && st.map((s) => s.key).join('') === 'QERF', JSON.stringify(st[3]));
  check('the emoji stays in the DOM (hidden while the image shows)', st.every((s) => s.emoji.length > 0) && st[0].icoOpacity === '0');
  const bl = await P.page.evaluate(() => document.querySelectorAll('#realm-abilities img.realm-ab-img').length);
  await P.page.evaluate(() => { for (let i = 0; i < 6; i++) window.__mm.arena._syncAbilities(); });
  check('repeated syncs do not duplicate the images', await P.page.evaluate(() => document.querySelectorAll('#realm-abilities img.realm-ab-img').length) === bl && bl === 4, String(bl));

  const cards = await P.page.evaluate(() => Array.from(document.querySelectorAll('#realm-hero .hp-hero:not(.locked)')).map((c) => { const im = c.querySelector('img.hp-portrait'), sw = c.querySelector('.hp-swatch'); return { cls: im ? im.dataset.cls : null, ok: !!(im && im.complete && im.naturalWidth > 0 && !im.hidden), swHidden: !!(sw && sw.hidden) }; }));
  check('hero picker shows the class portrait in place of the swatch', cards.length >= 2 && cards.every((c) => c.ok && c.swHidden) && cards.some((c) => c.cls === 'paladin'), JSON.stringify(cards));
  await P.ctx.close();

  const Ab = await open(browser, '', undefined, /b20-class-portraits-and-ability-icons\//); errs.push(...Ab.errors);
  await Ab.page.waitForTimeout(1200);
  const fb = await abState(Ab.page);
  check('image aborted: no img left, emoji visible, letters intact', fb.every((s) => s.img === null && s.icoOpacity === '' && s.emoji.length > 0) && fb.map((s) => s.key).join('') === 'QERF', JSON.stringify(fb));
  const fc = await Ab.page.evaluate(() => Array.from(document.querySelectorAll('#realm-hero .hp-hero:not(.locked)')).map((c) => { const sw = c.querySelector('.hp-swatch'); return { img: !!c.querySelector('img.hp-portrait'), sw: !!sw && !sw.hidden }; }));
  check('portrait aborted: the colour swatch stays', fc.length >= 2 && fc.every((c) => !c.img && c.sw), JSON.stringify(fc));
  await Ab.ctx.close();

  const Off = await open(browser, '&uiicons=0'); errs.push(...Off.errors);
  await Off.page.waitForTimeout(800);
  check('?uiicons=0: no ability or portrait images', await Off.page.evaluate(() => document.querySelectorAll('img.realm-ab-img, img.hp-portrait').length === 0));
  await Off.ctx.close();

  const ph = await open(browser, '', { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true }); errs.push(...ph.errors);
  await ph.page.waitForSelector('#realm-ab-0 img.realm-ab-img'); await ph.page.waitForTimeout(400);
  const pm = await ph.page.evaluate(() => ({ sw: document.documentElement.scrollWidth <= window.innerWidth, ws: [0, 1, 2, 3].map((i) => Math.round(document.getElementById('realm-ab-' + i).getBoundingClientRect().width)), hs: [0, 1, 2, 3].map((i) => Math.round(document.getElementById('realm-ab-' + i).getBoundingClientRect().height)) }));
  check('390x844 phone: no horizontal scroll, ability buttons >= 44 px', pm.sw && pm.ws.every((w) => w >= 44) && pm.hs.every((h) => h >= 44), JSON.stringify(pm));
  await ph.ctx.close();

  check('no console errors', errs.length === 0, errs.join(' | '));
  await browser.close();
  done();
})();
