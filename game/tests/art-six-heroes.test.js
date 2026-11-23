// Six new heroes (rogue, warlock, paladin, berserker, druid, necromancer): Lantern cards + arena art, desktop and phone.
// Serve the repo root first:  python3 -m http.server 8440 &
// Run: flock /tmp/live.lock node game/tests/art-six-heroes.test.js   (own origin only, no Firebase)
const { chromium } = require('playwright');
const { check, done } = require('./helpers');
const ORIGIN = (process.env.BASE || 'http://localhost:8440/game/index.html').replace(/\/game\/index\.html.*$/, '');
const MAZE = ORIGIN + '/game/games/mad-maze/index.html?test=1&offline=1';
const LANTERN = ORIGIN + '/game/games/mad-maze/lantern.html?test=1';
const MM = 'pixeltown-mm-v1', ACTIVE = 'pixeltown-mm-active-v1';
const NEW = ['rogue', 'warlock', 'paladin', 'berserker', 'druid', 'necromancer'];

const hero = (id, cls, name, level) => ({ id, name, cls, level: level || 3, xp: 0, fame: 0, bonus: 0, mode: 'classic', items: [] });
const profile = (heroes) => ({ v: 1, heroes, stash: new Array(16).fill(null), fame: 0, mode: 'classic', hall: [], migratedFrom: null });

async function open(browser, url, { heroes, active, opts } = {}) {
  const ctx = await browser.newContext(opts || { viewport: { width: 1000, height: 700 } });
  const page = await ctx.newPage();
  const errors = [], bad = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  page.on('response', (r) => { if (r.status() >= 400) bad.push(r.status() + ' ' + r.url()); });
  await page.goto(ORIGIN + '/game/games/mad-maze/lantern.css');
  await page.evaluate(([k1, p, k2, a]) => { if (p) localStorage.setItem(k1, JSON.stringify(p)); if (a) localStorage.setItem(k2, a); }, [MM, heroes ? profile(heroes) : null, ACTIVE, active || null]);
  bad.length = 0; errors.length = 0;
  await page.goto(url);
  return { ctx, page, errors, bad };
}
const PHONE = { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true };

(async () => {
  const browser = await chromium.launch();
  const heroes = NEW.map((c) => hero('hero-' + c + '-1', c, 'T' + c));

  for (const [label, opts] of [['desktop', undefined], ['phone 390x844', PHONE]]) {
    const L = await open(browser, LANTERN, { heroes, opts });
    await L.page.waitForSelector('#heroes li canvas.heroart:not([hidden])', { timeout: 8000 });
    await L.page.waitForTimeout(400);
    const r = await L.page.evaluate((cls) => {
      const nz = (c) => { const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data; let n = 0; for (let i = 3; i < d.length; i += 4) if (d[i]) n++; return n; };
      return cls.map((k) => { const c = document.querySelector('#heroes li[data-hero="hero-' + k + '-1"] canvas.heroart'); const li = document.querySelector('#heroes li[data-hero="hero-' + k + '-1"]'); return { k, art: !!c && !c.hidden && c.getAttribute('data-art') === k && nz(c) > 300, name: !!li && /Level 3/.test(li.textContent), ab: !!li && li.textContent.length > 30 }; });
    }, NEW);
    check('Lantern ' + label + ': every new class shows a hero card with real idle art', r.every((x) => x.art && x.name && x.ab), JSON.stringify(r));
    check('Lantern ' + label + ': no horizontal scroll', await L.page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth));
    check('Lantern ' + label + ': no 404s, no console errors', L.bad.length === 0 && L.errors.length === 0, L.bad.concat(L.errors).join(' | '));
    await L.ctx.close();
  }

  // Class picker: locked until the unlock level, art preview once picked.
  const U = await open(browser, LANTERN, { heroes: [hero('h-r', 'ranger', 'Rya', 8), hero('h-p', 'punk', 'Pk', 10), hero('h-f', 'frostcaller', 'Fro', 12)] });
  await U.page.waitForSelector('#new-class option', { state: 'attached' });
  const dis = await U.page.evaluate(() => Object.fromEntries([...document.querySelectorAll('#new-class option')].map((o) => [o.value, o.disabled])));
  check('picker lists all six; ranger L8 unlocks rogue, frostcaller L8/12 unlocks warlock+necromancer, punk L10 berserker; paladin/druid (herald) stay locked',
    NEW.every((k) => k in dis) && dis.rogue === false && dis.warlock === false && dis.necromancer === false && dis.berserker === false && dis.paladin === true && dis.druid === true, JSON.stringify(dis));
  for (const k of ['rogue', 'warlock', 'berserker', 'necromancer']) {
    await U.page.selectOption('#new-class', k);
    await U.page.waitForFunction(() => { const c = document.getElementById('new-class-art'); if (!c || c.hidden) return false; const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data; let n = 0; for (let i = 3; i < d.length; i += 4) if (d[i]) n++; return n > 300; }, null, { timeout: 8000 }).catch(() => {}); // the art set loads async: wait for it instead of a fixed 200 ms
    check('class select shows the ' + k + ' art preview', await U.page.evaluate(() => { const c = document.getElementById('new-class-art'); if (c.hidden) return false; const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data; let n = 0; for (let i = 3; i < d.length; i += 4) if (d[i]) n++; return n > 300; }));
  }
  check('picker: no console errors', U.errors.length === 0, U.errors.join(' | '));
  await U.ctx.close();
  const U0 = await open(browser, LANTERN, { heroes: [hero('h-r', 'ranger', 'Rya', 1)] });
  await U0.page.waitForSelector('#new-class option', { state: 'attached' });
  check('fresh account: the three starters stay open, the six new classes are locked', await U0.page.evaluate((cls) => ['ranger', 'frostcaller', 'herald'].every((k) => !document.querySelector('#new-class option[value=' + k + ']').disabled) && cls.every((k) => document.querySelector('#new-class option[value=' + k + ']').disabled), NEW));
  await U0.ctx.close();

  // Arena: each class draws idle art, attacks with its attack strip, no errors.
  for (const [label, opts] of [['desktop', undefined], ['phone', PHONE]]) {
    for (const k of NEW) {
      if (label === 'phone' && k !== 'rogue' && k !== 'necromancer') continue; // phone: a melee-ish and a caster sample
      const A = await open(browser, MAZE, { heroes, active: JSON.stringify({ v: 1, heroId: 'hero-' + k + '-1' }), opts });
      await A.page.waitForFunction(() => window.__mm && window.__mm.arena && window.__mm.arena._heroArt, null, { timeout: 8000 });
      await A.page.waitForTimeout(400);
      const dbg = () => A.page.evaluate(() => window.__mm.arena._heroDbg);
      const d0 = await dbg();
      check('arena ' + label + ' ' + k + ': idle art drawn (' + k + '_idle_down)', d0 && d0.action === 'idle' && d0.id === k + '_idle_down', JSON.stringify(d0));
      await A.page.evaluate(() => { const a = window.__mm.arena; a.mouse.seen = true; a.mouse.x = a.player.x + 200; a.mouse.y = a.player.y; a.mouse.down = true; });
      const seen = new Set();
      for (let i = 0; i < 14; i++) { const x = await dbg(); if (x) seen.add(x.action + ':' + x.dir); await A.page.waitForTimeout(40); }
      check('arena ' + label + ' ' + k + ': plays the attack animation', [...seen].some((s) => s === 'attack:right'), [...seen].join());
      await A.page.evaluate(() => { window.__mm.arena.mouse.down = false; });
      await A.page.evaluate(() => window.__mm.arena.setMoveStick(1, 0)); await A.page.waitForTimeout(900);
      const w = await dbg();
      check('arena ' + label + ' ' + k + ': walks with its own strip', w && w.action === 'walk' && w.id.indexOf(k + '_walk_') === 0, JSON.stringify(w));
      if (label === 'phone') check('arena phone ' + k + ': no horizontal scroll', await A.page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth));
      check('arena ' + label + ' ' + k + ': no 404s, no console errors', A.bad.length === 0 && A.errors.length === 0, A.bad.concat(A.errors).join(' | '));
      await A.ctx.close();
    }
  }
  await browser.close();
  done();
})();
