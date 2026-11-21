// Realm hero picker + stats panel.
// Run: BASE=http://localhost:8528/game/index.html NODE_PATH=$(npm root -g) node game/tests/hero-pick.test.js
const { chromium } = require('playwright');
const { check, done } = require('./helpers');
const ORIGIN = (process.env.BASE || 'http://localhost:8440/game/index.html').replace(/\/game\/index\.html.*$/, '');
const WORLD = ORIGIN + '/game/games/mad-maze/index.html?mode=world&test=1&offline=1&heropick=1';
const MM = 'pixeltown-mm-v1', ACTIVE = 'pixeltown-mm-active-v1';
const hero = (id, name, cls, level) => ({ id, name, cls, level, xp: 0, fame: 0, bonus: 0, mode: 'classic', items: [] });
const prof = (heroes) => ({ v: 1, heroes, stash: new Array(16).fill(null), fame: 0, mode: 'classic', hall: [], migratedFrom: null });
const HEROES = [hero('h-ranger', 'Aya', 'ranger', 3), hero('h-paladin', 'Bram', 'paladin', 4), hero('h-rogue', 'Cass', 'rogue', 2)];

async function open(browser, heroes, opts, query) {
  const ctx = await browser.newContext(opts || { viewport: { width: 1000, height: 700 } });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  await page.goto(ORIGIN + '/game/games/mad-maze/lantern.css');
  await page.evaluate(([k1, p, k2, a]) => { localStorage.setItem(k1, JSON.stringify(p)); localStorage.setItem(k2, a); }, [MM, prof(heroes), ACTIVE, JSON.stringify({ v: 1, heroId: heroes[0] ? heroes[0].id : null })]);
  errors.length = 0;
  await page.goto(WORLD + (query || ''));
  await page.waitForFunction(() => window.__mm && window.__mm.arena && window.__mm.world);
  return { ctx, page, errors };
}

(async () => {
  const browser = await chromium.launch();
  const errs = [];
  const P = await open(browser, HEROES);
  const pg = P.page;

  // Several heroes: the picker opens first and pauses the run.
  await pg.waitForSelector('#realm-hero:not(.hidden) .hp-hero');
  const cards = await pg.$$eval('#realm-hero .hp-hero:not(.locked)', (els) => els.map((e) => ({ id: e.dataset.hero, text: e.textContent })));
  check('picker opens on a fresh world run and lists the owned heroes', cards.length === 3 && ['h-ranger', 'h-paladin', 'h-rogue'].every((id) => cards.some((c) => c.id === id)) && /Oathward Paladin/.test(cards.map((c) => c.text).join('|')), JSON.stringify(cards));
  check('run is paused while the picker is open', await pg.evaluate(() => window.__mm.arena.paused === true));
  check('the active hero is marked', await pg.$eval('#realm-hero .hp-hero.on', (e) => e.dataset.hero === 'h-ranger' && /Active/.test(e.textContent)));

  // Locked hero: dimmed, shows an unlock hint, cannot be selected.
  const lock = await pg.$eval('#realm-hero .hp-hero.locked', (e) => ({ disabled: e.disabled, text: e.textContent, id: e.dataset.hero }));
  check('locked heroes are dimmed with an unlock hint and disabled', lock.disabled && /Reach level|Starter/.test(lock.text) && lock.id.indexOf('locked:') === 0, JSON.stringify(lock));
  await pg.evaluate(() => { const b = document.querySelector('#realm-hero .hp-hero.locked'); b.disabled = false; b.click(); });
  check('a locked hero cannot become active even if clicked', await pg.evaluate((k) => JSON.parse(localStorage.getItem(k)).heroId === 'h-ranger', ACTIVE));
  check('selectHero rejects unknown ids', await pg.evaluate(() => window.__heroUi.select('locked:necromancer') === false && window.__heroUi.select('__proto__') === false));

  // Select the paladin: saved pointer + arena stats follow.
  const before = await pg.evaluate(() => ({ maxHp: window.__mm.arena.stats.maxHp, sig: window.__mm.arena.sig && window.__mm.arena.sig.id }));
  await pg.click('#realm-hero .hp-hero[data-hero="h-paladin"]');
  const after = await pg.evaluate((k) => { const a = window.__mm.arena; return { active: JSON.parse(localStorage.getItem(k)).heroId, maxHp: a.stats.maxHp, name: a.heroProfile && a.heroProfile.name, sig: a.sig && a.sig.id, exp: MMClasses.arenaProfile('paladin') }; }, ACTIVE);
  check('selecting writes the active hero to the saved profile', after.active === 'h-paladin');
  check('arena class stats and signature switch live', after.name === 'Oathward Paladin' && after.maxHp === Math.round(100 * after.exp.hp) && after.maxHp > before.maxHp && after.sig === 'bulwarkOath' && before.sig === 'thicketVolley', JSON.stringify([before, after]));
  check('confirm line is shown in-page', /Bram/.test(await pg.textContent('#realm-hero-status')));
  check('profile blob is untouched and still valid', await pg.evaluate((k) => { const p = MMProfile.clean(localStorage.getItem(k)); return p.heroes.length === 3 && JSON.stringify(p.heroes.map((h) => h.id)) === '["h-ranger","h-paladin","h-rogue"]'; }, MM));

  // Stats tab shows the class numbers.
  await pg.click('#realm-hero .hp-tab[data-tab="stats"]');
  const txt = await pg.textContent('#realm-hero-body');
  const exp = after.exp;
  check('stats panel shows the class numbers', txt.indexOf(String(after.maxHp)) >= 0 && /Oathward Paladin/.test(txt) && /Bulwark Oath/.test(txt) && /1 bolt, pierce 2/.test(txt) && /Kills/.test(txt) && /Deepest zone/.test(txt) && /Portals/.test(txt), txt.slice(0, 400));
  check('stats panel shows level, shards and gear slots', /Level4/.test(txt.replace(/\s/g, '')) && /Shards/.test(txt) && /Weapon/.test(txt) && /Ring/.test(txt));

  // Esc closes; menu buttons reopen both tabs.
  await pg.keyboard.press('Escape');
  check('Esc closes the hero panel and resumes', await pg.evaluate(() => document.getElementById('realm-hero').classList.contains('hidden') && !window.__mm.arena.paused));
  await pg.keyboard.press('Escape');
  await pg.click('#realm-pause button[data-m="herostats"]');
  check('Esc menu opens the stats tab', await pg.evaluate(() => !document.getElementById('realm-hero').classList.contains('hidden') && document.querySelector('#realm-hero .hp-tab.on').dataset.tab === 'stats'));
  await pg.click('#realm-hero-close');
  await pg.keyboard.press('Escape');
  await pg.click('#realm-pause button[data-m="heroes"]');
  check('Esc menu opens the picker tab', await pg.evaluate(() => document.querySelector('#realm-hero .hp-tab.on').dataset.tab === 'pick'));
  await pg.click('#realm-hero-close');
  errs.push(...P.errors); await P.ctx.close();

  // A single hero: no forced picker.
  const S = await open(browser, [HEROES[0]]);
  check('one hero: picker does not open by itself', await S.page.evaluate(() => document.getElementById('realm-hero').classList.contains('hidden') && !window.__mm.arena.paused));
  errs.push(...S.errors); await S.ctx.close();

  // Phone 390x844.
  const M = await open(browser, HEROES, { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  await M.page.waitForSelector('#realm-hero:not(.hidden) .hp-hero');
  const ph = await M.page.evaluate(() => {
    const small = [...document.querySelectorAll('#realm-hero button:not(:disabled)')].filter((b) => { const r = b.getBoundingClientRect(); return r.height < 43.5 || r.width < 43.5; }).length;
    const body = document.getElementById('realm-hero-body');
    return { noHScroll: document.documentElement.scrollWidth <= window.innerWidth, small, bodyFits: body.scrollWidth <= body.clientWidth + 1, panelFits: document.getElementById('realm-hero').getBoundingClientRect().width <= window.innerWidth };
  });
  check('390x844: no horizontal scroll, 44px targets, panel fits', ph.noHScroll && ph.small === 0 && ph.bodyFits && ph.panelFits, JSON.stringify(ph));
  await M.page.click('#realm-hero .hp-hero[data-hero="h-rogue"]');
  check('phone tap selects a hero', await M.page.evaluate((k) => JSON.parse(localStorage.getItem(k)).heroId === 'h-rogue', ACTIVE));
  errs.push(...M.errors); await M.ctx.close();

  // Zero heroes: create mode, create a Frostcaller, run starts with it.
  const Z = await open(browser, []);
  await Z.page.waitForSelector('#realm-hero:not(.hidden) .hp-new');
  const zc = await Z.page.$$eval('#realm-hero .hp-new', (els) => els.map((e) => ({ c: e.dataset.newcls, d: e.disabled })));
  check('zero heroes: picker opens in create mode, starters open, others locked', ['ranger', 'frostcaller', 'herald'].every((c) => zc.some((x) => x.c === c && !x.d)) && zc.some((x) => x.c === 'rogue' && x.d), JSON.stringify(zc));
  await Z.page.click('#realm-hero .hp-new[data-newcls="frostcaller"]');
  const zr = await Z.page.evaluate(([k, ka]) => { const a = window.__mm.arena; const p = MMProfile.clean(localStorage.getItem(k)); return { n: p.heroes.length, cls: p.heroes[0] && p.heroes[0].cls, lvl: p.heroes[0] && p.heroes[0].level, active: JSON.parse(localStorage.getItem(ka)).heroId, id: p.heroes[0] && p.heroes[0].id, hp: a.heroProfile && a.heroProfile.hp, exp: MMClasses.arenaProfile('frostcaller').hp, paused: a.paused, hidden: document.getElementById('realm-hero').classList.contains('hidden') }; }, [MM, ACTIVE]);
  check('creating Frostcaller saves the hero, makes it active, applies its arenaProfile and starts the run', zr.n === 1 && zr.cls === 'frostcaller' && zr.lvl === 1 && zr.active === zr.id && zr.hp === zr.exp && !zr.paused && zr.hidden, JSON.stringify(zr));
  // New hero button + cap.
  await Z.page.keyboard.press('Escape'); await Z.page.click('#realm-pause button[data-m="heroes"]');
  const nbh = await Z.page.$eval('#realm-hero .hp-newbtn', (e) => e.getBoundingClientRect().height);
  check('New hero button is 44px+', nbh >= 44, String(nbh));
  await Z.page.click('#realm-hero .hp-newbtn'); await Z.page.click('#realm-hero .hp-new[data-newcls="herald"]');
  check('New hero adds a second hero and selects it', await Z.page.evaluate(([k, ka]) => { const p = MMProfile.clean(localStorage.getItem(k)); return p.heroes.length === 2 && JSON.parse(localStorage.getItem(ka)).heroId === 'hero-herald-1'; }, [MM, ACTIVE]));
  errs.push(...Z.errors); await Z.ctx.close();

  // Cap respected.
  const many = []; for (let i = 0; i < 12; i++) many.push(hero('h' + i, 'H' + i, 'ranger', 1));
  const K = await open(browser, many);
  await K.page.waitForSelector('#realm-hero:not(.hidden) .hp-hero');
  check('roster cap: New hero disabled and createHero refuses at 12', await K.page.$eval('#realm-hero .hp-newbtn', (e) => e.disabled) && await K.page.evaluate(([k]) => window.__heroUi.create('frostcaller') === null && MMProfile.clean(localStorage.getItem(k)).heroes.length === 12, [MM]));
  errs.push(...K.errors); await K.ctx.close();

  // Stale active id falls back to the first hero (single hero: no picker).
  const T = await open(browser, [hero('h-paladin', 'Bram', 'paladin', 4)]);
  await T.page.evaluate((ka) => localStorage.setItem(ka, JSON.stringify({ v: 1, heroId: 'gone' })), ACTIVE);
  await T.page.reload(); await T.page.waitForFunction(() => window.__mm && window.__mm.arena);
  check('stale active id falls back to the first hero on load', await T.page.evaluate(() => window.__mm.arena.heroProfile && window.__mm.arena.heroProfile.name === 'Oathward Paladin'));
  errs.push(...T.errors); await T.ctx.close();

  // Phone, zero heroes.
  const Q = await open(browser, [], { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  await Q.page.waitForSelector('#realm-hero:not(.hidden) .hp-new');
  const qp = await Q.page.evaluate(() => ({ h: document.documentElement.scrollWidth <= window.innerWidth, small: [...document.querySelectorAll('#realm-hero button:not(:disabled)')].filter((b) => b.getBoundingClientRect().height < 43.5).length }));
  check('390x844 create mode: no horizontal scroll, 44px targets', qp.h && qp.small === 0, JSON.stringify(qp));
  errs.push(...Q.errors); await Q.ctx.close();

  check('no console errors', errs.length === 0, errs.join(' | '));
  await browser.close();
  done();
})();
