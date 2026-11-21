// S10 Mad Maze wiring: the page loads the weapon modules and passes MMWeapons.resolve(...) to arena.setHeroWeapon on load / equip / hero switch.
// Run: BASE=http://localhost:8563/game/index.html NODE_PATH=$(npm root -g) node game/tests/class-weapon-wire.test.js
const { chromium } = require('playwright');
const { check, done } = require('./helpers');
const ORIGIN = (process.env.BASE || 'http://localhost:8440/game/index.html').replace(/\/game\/index\.html.*$/, '');
const MAZE = ORIGIN + '/game/games/mad-maze/index.html?test=1&offline=1';
const MM = 'pixeltown-mm-v1', ACTIVE = 'pixeltown-mm-active-v1', SAVE = 'pixeltown-save-v1';
const hero = (id, cls) => ({ id, name: cls, cls, level: 3, xp: 0, fame: 0, bonus: 0, mode: 'classic', items: [] });
const prof = (heroes) => ({ v: 1, heroes, stash: new Array(16).fill(null), fame: 0, mode: 'classic', hall: [], migratedFrom: null });

async function open(browser, cls, query, realm) {
  const ctx = await browser.newContext({ viewport: { width: 1000, height: 700 } });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  await page.goto(ORIGIN + '/game/games/mad-maze/lantern.css');
  await page.evaluate(([k1, p, k2, a, k3, s]) => { localStorage.setItem(k1, JSON.stringify(p)); localStorage.setItem(k2, a); localStorage.setItem(k3, JSON.stringify(s)); },
    [MM, prof([hero('h-rogue', 'rogue'), hero('h-ranger', 'ranger')]), ACTIVE, JSON.stringify({ v: 1, heroId: 'h-' + cls }), SAVE, { realm }]);
  errors.length = 0;
  await page.goto(MAZE + (query || ''));
  await page.waitForFunction(() => window.__mm && window.__mm.arena);
  return { ctx, page, errors };
}
const volley = (page) => page.evaluate(() => {
  const a = window.__mm.arena;
  a.state = 'play'; a.run.wave = 0; a.paused = false; a.down = false; a.player.aim = 0;
  a.pBullets.forEach((b) => { b.active = false; });
  a._firePlayerVolley(0);
  return a.pBullets.filter((b) => b.active).length;
});
const REALM = { v: 1, level: 3, items: [], nextUid: 2, eq: {} };
// A styled weapon item in the weapon slot (S12 will make wpn_ items equippable; until then the inert def is promoted to the weapon slot here), then the page re-resolves.
const giveItem = (page) => page.evaluate(() => { const a = window.__mm.arena; rmInertDef('wpn_dagger_fan').slot = 'weapon'; a.save.items = [{ n: 1, id: 'wpn_dagger_fan', r: 0 }]; a.save.eq = { weapon: 1 }; a._afterGearChange(); return !!a.weapon; });

(async () => {
  const browser = await chromium.launch();
  const errs = [];
  const A = await open(browser, 'rogue', '', REALM);
  check('page loads the five weapon modules', await A.page.evaluate(() => ['MMWeapons', 'MMProjectile', 'MMFxDraw', 'MMStatus', 'MMUnlocks'].every((g) => typeof window[g] === 'object')));
  const plain = await volley(A.page);
  check('a rogue with no styled weapon fires today\'s plain volley (2)', plain === 2, String(plain));
  const gi = await giveItem(A.page); check('equipping wpn_dagger_fan sets the styled weapon', gi === true);
  const fan = await volley(A.page);
  check('a rogue with wpn_dagger_fan fires the 3-blade fan', fan === 3, String(fan));
  await A.page.evaluate(() => { const a = window.__mm.arena; a.save.eq = {}; a._afterGearChange(); });
  check('unequipping goes back to the plain volley', await volley(A.page) === 2);
  errs.push(...A.errors);
  await A.ctx.close();

  const B = await open(browser, 'rogue', '&weapons=0', REALM);
  await giveItem(B.page);
  const off = await volley(B.page);
  check('?weapons=0 keeps the plain volley with the item equipped (2)', off === 2, String(off));
  errs.push(...B.errors);
  await B.ctx.close();

  // A ranger holding the rogue's dagger-family item stays on its base fire (family mismatch = base).
  const C = await open(browser, 'ranger', '', REALM);
  const set = await giveItem(C.page);
  check('a ranger holding a dagger item keeps the base fire', set === false && await C.page.evaluate(() => window.__mm.arena.weapon === null));
  errs.push(...C.errors);
  await C.ctx.close();

  check('no console errors', errs.length === 0, errs.join(' | '));
  await browser.close();
  done();
})();
