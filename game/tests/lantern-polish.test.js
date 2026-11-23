// Lantern polish. Serve the repo root first:  python3 -m http.server 8454 &
// Run: BASE=http://localhost:8454/game/index.html NODE_PATH=$(npm root -g) node game/tests/lantern-polish.test.js
// Set SHOTS=<dir> to write desktop/phone screenshots. No Firebase, no external network.
const { chromium } = require('playwright');
const { check, done } = require('./helpers');
const ORIGIN = (process.env.BASE || 'http://localhost:8440/game/index.html').replace(/\/game\/index\.html.*$/, '');
const PAGE = ORIGIN + '/game/games/mad-maze/lantern.html';
const MM = 'pixeltown-mm-v1', ACTIVE = 'pixeltown-mm-active-v1';
const hero = (o) => Object.assign({ id: 'h1', name: 'Tester', cls: 'ranger', level: 1, xp: 0, fame: 0, bonus: 0, mode: 'classic', items: [] }, o);
const PROFILE = {
  v: 1,
  heroes: [hero({ id: 'h1', name: 'Mossy', level: 4, xp: 100, items: [{ id: 'heartcharm_t1', r: 1, n: 1 }, { id: 'slingbow_t3', r: 3, n: 2 }, { id: 'armor_heavy_t2', r: 2, n: 3 }] }),
    hero({ id: 'h2', name: 'Chilly', cls: 'frostcaller', level: 20, fame: 300 })],
  stash: [{ id: 'luckring', r: 2 }, { id: 'ability_punk_t1', r: 1 }],
  fame: 50
};

async function open(browser, { mm, active, query, viewport } = {}) {
  const ctx = await browser.newContext({ viewport: viewport || { width: 1000, height: 900 } });
  const page = await ctx.newPage();
  const errors = [], reqs = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  page.on('request', (r) => reqs.push(r.url()));
  await page.goto(ORIGIN + '/game/games/mad-maze/lantern.css');
  await page.evaluate(([m, a, K1, K2]) => { if (m !== null) localStorage.setItem(K1, m); if (a !== null) localStorage.setItem(K2, a); },
    [mm === undefined ? null : (typeof mm === 'string' ? mm : JSON.stringify(mm)), active === undefined ? null : active, MM, ACTIVE]);
  await page.goto(PAGE + (query || ''));
  await page.waitForSelector('#heroes li');
  return { ctx, page, errors, reqs };
}

(async () => {
  const browser = await chromium.launch();
  let s = await open(browser, { mm: PROFILE });
  const p = s.page;

  // 1. friendly item names + tier badges
  const items = await p.evaluate(() => [...document.querySelectorAll('#carry .item, #stash .slot.full')].map((n) => n.textContent));
  const all = items.join(' | ');
  check('item names are friendly (no underscore ids, no raw id strings)', items.length === 5 && !/_/.test(all) && /Heart Charm/.test(all) && /Slingbow/.test(all) && /Heavy Armor/.test(all) && /Luck Ring/.test(all), all);
  const badges = await p.evaluate(() => [...document.querySelectorAll('.item .tier, .slot .tier')].map((n) => [n.textContent, n.style.background]));
  check('every item shows a tier badge with its own colour', badges.length === 5 && badges.every((b) => /^T\d$/.test(b[0]) && b[1]) && new Set(badges.map((b) => b[1])).size >= 3, JSON.stringify(badges));
  check('items have icons and descriptive aria-labels', await p.evaluate(() => [...document.querySelectorAll('#carry .item')].every((n) => n.querySelector('.ico') && /tier \d/.test(n.getAttribute('aria-label')))));

  // 2. Fall: hidden without ?test=1, present with it; explainer always there
  check('no Test a Fall button without ?test=1', (await p.locator('.testfall').count()) === 0 && !(await p.evaluate(() => !!window.__lantern)));
  const explain = await p.textContent('#how-card');
  check('"What is a Fall?" explainer covers hero lost, fame banked, Keepsake, Picnic', /What is a Fall\?/.test(explain) && /hero is lost/i.test(explain) && /fame is banked/i.test(explain) && /Keepsake/.test(explain) && /Picnic mode never falls/i.test(explain));
  const t = await open(browser, { mm: PROFILE, query: '?test=1' });
  check('Test a Fall button appears with ?test=1 (one per hero)', (await t.page.locator('.testfall').count()) === 2 && (await t.page.locator('.testfall').first().textContent()) === 'Test a Fall');
  await t.page.locator('#heroes li[data-hero="h1"] .testfall').click();
  check('Test a Fall needs a second tap (hero still there)', (await t.page.evaluate((K) => JSON.parse(localStorage.getItem(K) || 'null'), MM)) === null || (await t.page.locator('#heroes li[data-hero="h1"]').count()) === 1);
  await t.ctx.close();

  // 3. hero cards: abilities, stats, level/xp bar, Retire label
  const card = await p.evaluate(() => { const li = document.querySelector('#heroes li[data-hero="h1"]'); return { ab: li.querySelector('.ability strong').textContent, txt: li.querySelector('.abtext').textContent, stats: [...li.querySelectorAll('.stat')].map((n) => n.textContent), now: li.querySelector('[role=progressbar]').getAttribute('aria-valuenow'), xp: li.querySelector('.xptext').textContent, retire: li.querySelector('.retire').textContent }; });
  check('hero card lists the class ability name and a one-line description', card.ab === 'Yarn Snare' && card.txt.length > 15 && !/_/.test(card.txt), JSON.stringify(card));
  check('hero card shows stats (LIFE, FOC, POW...)', card.stats.length === 8 && /LIFE/.test(card.stats[0]) && /POW/.test(card.stats.join()), card.stats.join());
  check('hero card shows level/xp text and a progress bar', /Level 4: 100 \/ 320 xp/.test(card.xp) && card.now === "31", JSON.stringify(card));
  check('Retire button reads "Retire to the Hall"', card.retire === 'Retire to the Hall');

  // 4. Start run stores the active hero id
  await p.locator('#heroes li[data-hero="h2"] .pick').click();
  await p.evaluate(() => document.getElementById('start').addEventListener('click', (e) => e.preventDefault()));
  await p.click('#start');
  check('Start run stores {v:1, heroId} under pixeltown-mm-active-v1', (await p.evaluate((K) => localStorage.getItem(K), ACTIVE)) === '{"v":1,"heroId":"h2"}');
  check('Start run links to ./index.html', /^\.\/index\.html/.test(await p.getAttribute('#start', 'href')));
  const c = await open(browser, { mm: PROFILE, active: '{{garbage', query: '?test=1' });
  const cl = await c.page.evaluate(([K]) => ({ stored: localStorage.getItem(K), sel: document.querySelector('#heroes li.sel').getAttribute('data-hero'), act: window.__lantern.active() }), [ACTIVE]);
  check('corrupt pixeltown-mm-active-v1 loads clean (first hero selected, key repaired)', cl.sel === 'h1' && cl.act.heroId === null && cl.stored === '{"v":1,"heroId":null}' && c.errors.length === 0, JSON.stringify(cl));
  await c.ctx.close();
  const c2 = await open(browser, { mm: PROFILE, active: JSON.stringify({ v: 1, heroId: 'h2', evil: '<x>' }) });
  check('a valid active hero is preselected', (await c2.page.locator('#heroes li.sel').getAttribute('data-hero')) === 'h2');
  await c2.ctx.close();

  // 5. keyboard (G-05: Rekindle lives on a fallen hero's Keepsake, so a Keepsake is put in the stash and its row is a Tab stop)
  await p.evaluate((K) => { const o = JSON.parse(localStorage.getItem(K)); const i = o.stash.indexOf(null); o.stash[i >= 0 ? i : 0] = { id: 'keepsake', r: 0, keepsake: true, from: 'Old Moss', cls: 'ranger', level: 8 }; localStorage.setItem(K, JSON.stringify(o)); }, MM);
  await p.reload(); await p.waitForSelector('#rekindle-list .rekindle-ks');
  await p.evaluate(() => document.activeElement && document.activeElement.blur());
  const seen = new Set();
  for (let i = 0; i < 80; i++) {
    await p.keyboard.press('Tab');
    seen.add(await p.evaluate(() => { const a = document.activeElement; return a ? (a.id || (["pick","rekindle","retire"].find((c) => a.classList.contains(c))) || a.tagName) : ''; }));
  }
  const need = ['pick', 'rekindle', 'retire', 'start', 'new-class', 'new-name', 'new-create', 'rest', 'backup', 'restore'];
  check('Tab reaches every main control', need.every((n) => seen.has(n)), [...seen].join());
  const ring = await p.evaluate(() => { document.getElementById('rest').focus(); return getComputedStyle(document.getElementById('rest')).outlineStyle + ' ' + getComputedStyle(document.getElementById('rest')).outlineWidth; });
  const rs = await p.evaluate(() => { document.getElementById('rest').focus(); return document.getElementById('rest').matches(':focus-visible'); });
  check('focus ring is visible on controls', /solid 3px/.test(ring) || rs, ring);
  check('status is an aria-live region', (await p.getAttribute('#status', 'aria-live')) === 'polite' && (await p.getAttribute('#status', 'role')) === 'status');
  await p.setInputFiles('#restore', { name: 'b.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify({ format: 'pixeltown-backup', v: 2, keys: { [MM]: '{"v":1}' } })) });
  await p.waitForSelector('#restore-confirm:not([hidden])');
  const trail = [];
  for (let i = 0; i < 5; i++) { await p.keyboard.press('Tab'); trail.push(await p.evaluate(() => document.activeElement.id)); }
  check('focus stays inside the confirm panel while open', trail.every((x) => x === 'restore-yes' || x === 'restore-no') && trail.includes('restore-yes') && trail.includes('restore-no'), trail.join());
  await p.keyboard.press('Shift+Tab'); await p.keyboard.press('Shift+Tab');
  check('Shift+Tab also stays inside', await p.evaluate(() => document.getElementById('restore-confirm').contains(document.activeElement)));
  await p.keyboard.press('Escape');
  check('Escape closes the panel and returns focus outside it', (await p.isHidden('#restore-confirm')) && (await p.evaluate(() => !document.getElementById('restore-confirm').contains(document.activeElement))));

  // 6. phone, console, network, XSS
  const ph = await open(browser, { mm: PROFILE, query: '?test=1', viewport: { width: 390, height: 844 } });
  await ph.page.waitForTimeout(250);
  const lay = await ph.page.evaluate(() => ({ sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth }));
  check('390x844: no horizontal scroll', lay.sw <= lay.cw, JSON.stringify(lay));
  const xss = await open(browser, { mm: { v: 1, heroes: [hero({ name: '<img src=x onerror=alert(1)>', items: [{ id: '<b>x</b>_t1', r: 1 }] })] } });
  check('hostile names and item ids render as text only', (await xss.page.locator('img').count()) === 0 && (await xss.page.locator('#carry b').count()) === 0);
  await xss.ctx.close();
  check('no console errors', [s, ph].every((x) => x.errors.length === 0), [...s.errors, ...ph.errors].join());
  check('zero off-origin requests', [s, ph].every((x) => x.reqs.every((u) => u.startsWith(ORIGIN + '/') || u.startsWith('data:') || u.startsWith('blob:'))), [...s.reqs, ...ph.reqs].join(' '));
  if (process.env.SHOTS) {
    await ph.page.screenshot({ path: process.env.SHOTS + '/lantern-polish-phone.png', fullPage: true });
    await p.screenshot({ path: process.env.SHOTS + '/lantern-polish-desktop.png', fullPage: true });
  }
  await ph.ctx.close(); await s.ctx.close();
  await browser.close();
  done();
})();
