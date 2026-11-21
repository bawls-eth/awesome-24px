// All 14 hero classes survive MMProfile.clean, the Realm picker, arenaProfile and the art lookup (S5 class-id whitelist fix).
// Run: BASE=http://localhost:8535/game/index.html NODE_PATH=$(npm root -g) node game/tests/hero-all-classes.test.js
const { chromium } = require('playwright');
const { check, done } = require('./helpers');
const ORIGIN = (process.env.BASE || 'http://localhost:8440/game/index.html').replace(/\/game\/index\.html.*$/, '');
const WORLD = ORIGIN + '/game/games/mad-maze/index.html?mode=world&test=1&offline=1&heropick=1';
const MM = 'pixeltown-mm-v1', ACTIVE = 'pixeltown-mm-active-v1';
const hero = (id, name, cls, level) => ({ id, name, cls, level, xp: 0, fame: 0, bonus: 0, mode: 'classic', items: [] });
const prof = (heroes) => ({ v: 1, heroes, stash: new Array(16).fill(null), fame: 0, mode: 'classic', hall: [], migratedFrom: null });
const IDS = ['ranger', 'frostcaller', 'herald', 'punk', 'bruiser', 'graveTender', 'trickster', 'shadowPaw', 'rogue', 'warlock', 'paladin', 'berserker', 'druid', 'necromancer'];

function watch(page, errs) {
  page.on('pageerror', (e) => errs.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error') errs.push('console: ' + m.text()); });
}

(async () => {
  const browser = await chromium.launch();
  const errors = [];
  check('test lists 14 distinct classes', IDS.length === 14 && new Set(IDS).size === 14);

  // One page per class: that class's hero is active; a ranger sits beside it so the picker opens.
  for (const cls of IDS) {
    const ctx = await browser.newContext({ viewport: { width: 1000, height: 700 } });
    const page = await ctx.newPage();
    const errs = [];
    watch(page, errs);
    await page.goto(ORIGIN + '/game/games/mad-maze/lantern.css');
    const heroes = [hero('h-' + cls, 'Hero ' + cls, cls, 20), hero('h-filler', 'Filler', 'ranger', 2)];
    await page.evaluate(([k1, p, k2, a]) => { localStorage.setItem(k1, JSON.stringify(p)); localStorage.setItem(k2, a); }, [MM, prof(heroes), ACTIVE, JSON.stringify({ v: 1, heroId: 'h-' + cls })]);
    errs.length = 0;
    await page.goto(WORLD);
    await page.waitForFunction(() => window.__mm && window.__mm.arena && window.__mm.world);
    await page.waitForSelector('#realm-hero:not(.hidden) .hp-hero');

    const r = await page.evaluate(([k, c]) => {
      const p = MMProfile.clean(localStorage.getItem(k));
      const a = window.__mm.arena;
      const exp = MMClasses.arenaProfile(c);
      return { cls: p.heroes[0].cls, n: p.heroes.length, name: a.heroProfile && a.heroProfile.name, expName: exp.name, expHp: exp.hp, maxHp: a.stats.maxHp, art: MMArt.artClassFor(c) };
    }, [MM, cls]);
    check(cls + ': survives MMProfile.clean', r.cls === cls && r.n === 2, JSON.stringify(r));
    check(cls + ': arena profile matches the class', !!r.name && r.name === r.expName, r.name + ' vs ' + r.expName);
    check(cls + ': arena stats follow the class hp', r.maxHp === Math.round(100 * r.expHp), r.maxHp + ' vs ' + r.expHp);
    check(cls + ': art lookup is safe (mapped or sprite fallback)', r.art === null || typeof r.art === 'string');

    // Pick the filler ranger, then the class hero again through the picker.
    await page.click('#realm-hero .hp-hero[data-hero="h-filler"]');
    const toRanger = await page.evaluate((k) => JSON.parse(localStorage.getItem(k)).heroId, ACTIVE);
    await page.evaluate(() => window.__heroUi.open('pick'));
    await page.waitForSelector('#realm-hero:not(.hidden) .hp-hero[data-hero="h-' + cls + '"]');
    await page.click('#realm-hero .hp-hero[data-hero="h-' + cls + '"]');
    const back = await page.evaluate(([k, key]) => ({ active: JSON.parse(localStorage.getItem(k)).heroId, name: window.__mm.arena.heroProfile.name, cls: MMProfile.clean(localStorage.getItem(key)).heroes.map((h) => h.cls).join() }), [ACTIVE, MM]);
    check(cls + ': picker switches to and back from the class hero', toRanger === 'h-filler' && back.active === 'h-' + cls && back.name === r.expName && back.cls === cls + ',ranger', JSON.stringify(back));

    // The new-hero grid lists all 14 classes.
    await page.evaluate(() => window.__heroUi.open('pick'));
    await page.waitForSelector('#realm-hero:not(.hidden) button[data-newhero]');
    await page.click('#realm-hero button[data-newhero]');
    const grid = await page.$$eval('#realm-hero button[data-newcls]', (b) => b.map((x) => x.dataset.newcls));
    check(cls + ': new-hero picker lists all 14 classes', IDS.every((c) => grid.indexOf(c) >= 0) && grid.length === 14, grid.join());
    check(cls + ': no console errors', errs.length === 0, errs.join(' | '));
    errors.push(...errs);
    await ctx.close();
  }

  // Lantern: the new-class select offers all 14 and the three formerly coerced classes keep their identity.
  {
    const ctx = await browser.newContext({ viewport: { width: 1000, height: 800 } });
    const page = await ctx.newPage();
    const errs = [];
    watch(page, errs);
    await page.goto(ORIGIN + '/game/games/mad-maze/lantern.css');
    const heroes = ['trickster', 'shadowPaw', 'graveTender'].map((c) => hero('h-' + c, 'L ' + c, c, 20));
    await page.evaluate(([k1, p]) => localStorage.setItem(k1, JSON.stringify(p)), [MM, prof(heroes)]);
    await page.goto(ORIGIN + '/game/games/mad-maze/lantern.html?test=1');
    await page.waitForSelector('#new-class option', { state: 'attached' });
    const opts = await page.$$eval('#new-class option', (o) => o.map((x) => x.value));
    check('Lantern new-hero select lists all 14 classes', IDS.every((c) => opts.indexOf(c) >= 0) && opts.length === 14, opts.join());
    const saved = await page.evaluate((k) => MMProfile.clean(localStorage.getItem(k)).heroes.map((h) => h.cls).join(), MM);
    check('Lantern keeps trickster/shadowPaw/graveTender heroes', saved === 'trickster,shadowPaw,graveTender', saved);
    const body = await page.textContent('body');
    check('Lantern shows the real class names', /Saucer Trickster/.test(body) && /Shadow Paw/.test(body) && /Grave Tender/.test(body));
    check('Lantern: no console errors', errs.length === 0, errs.join(' | '));
    errors.push(...errs);
    await ctx.close();
  }

  check('no console errors overall', errors.length === 0, errors.join(' | '));
  await browser.close();
  done();
})();
