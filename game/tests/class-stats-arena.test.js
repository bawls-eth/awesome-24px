// Class stats in the standalone Mad Maze arena (arenaProfile + setHeroProfile).
// Run: BASE=http://localhost:8453/game/index.html NODE_PATH=$(npm root -g) node game/tests/class-stats-arena.test.js
const { chromium } = require('playwright');
const { check, done } = require('./helpers');
const ORIGIN = (process.env.BASE || 'http://localhost:8440/game/index.html').replace(/\/game\/index\.html.*$/, '');
const MAZE = ORIGIN + '/game/games/mad-maze/index.html?test=1&offline=1';
const MM = 'pixeltown-mm-v1', ACTIVE = 'pixeltown-mm-active-v1';
const hero = (id, cls) => ({ id, name: cls, cls, level: 3, xp: 0, fame: 0, bonus: 0, mode: 'classic', items: [] });
const prof = (heroes) => ({ v: 1, heroes, stash: new Array(16).fill(null), fame: 0, mode: 'classic', hall: [], migratedFrom: null });
const CLS = ['ranger', 'paladin', 'rogue'];

async function open(browser, cls, query, opts) {
  const ctx = await browser.newContext(opts || { viewport: { width: 1000, height: 700 } });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  await page.goto(ORIGIN + '/game/games/mad-maze/lantern.css');
  await page.evaluate(([k1, p, k2, a]) => { localStorage.setItem(k1, JSON.stringify(p)); localStorage.setItem(k2, a); }, [MM, prof(CLS.map((c) => hero('h-' + c, c))), ACTIVE, JSON.stringify({ v: 1, heroId: 'h-' + cls })]);
  errors.length = 0;
  await page.goto(MAZE + (query || ''));
  await page.waitForFunction(() => window.__mm && window.__mm.arena);
  return { ctx, page, errors };
}
const stats = (page) => page.evaluate(() => { const a = window.__mm.arena; const s = a.stats; return { maxHp: s.maxHp, speed: s.speed, rate: s.rate, dmg: s.dmg, iframes: s.iframes, hp: a.player.hp, line: a._statLine() }; });

(async () => {
  const browser = await chromium.launch();
  const S = {}, errs = [];
  for (const c of CLS) { const P = await open(browser, c); S[c] = await stats(P.page); S[c].exp = await P.page.evaluate((id) => MMClasses.arenaProfile(id), c); errs.push(...P.errors); await P.ctx.close(); }
  const r = S.ranger, pa = S.paladin, ro = S.rogue;
  check('ranger stats are the baseline (100 HP, 7.5 rate, 235 speed)', r.maxHp === 100 && r.rate === 7.5 && r.speed === 235 && r.dmg === 1, JSON.stringify(r));
  check('paladin maxHp follows the profile and exceeds rogue/ranger', pa.maxHp === Math.round(100 * pa.exp.hp) && pa.maxHp > ro.maxHp && pa.maxHp > r.maxHp, JSON.stringify(pa));
  check('rogue fire rate follows the profile and exceeds ranger/paladin', Math.abs(ro.rate - 7.5 * ro.exp.rate) < 1e-6 && ro.rate > r.rate && ro.rate > pa.rate);
  check('speed: rogue > ranger > paladin as the profile says', Math.abs(pa.speed - 235 * pa.exp.speed) < 1e-6 && ro.speed > r.speed && r.speed > pa.speed);
  check('dmg and iframes follow the profile', Math.abs(pa.dmg - pa.exp.dmg) < 1e-6 && Math.abs(ro.iframes - 0.5 * ro.exp.iframes) < 1e-6);
  check('arena starts at full class HP', pa.hp === pa.maxHp, JSON.stringify(pa));
  check('stat line shows the class name', pa.line.indexOf('Oathward Paladin') === 0 && r.line.indexOf('Thicket Ranger') === 0, pa.line);

  const off = await open(browser, 'paladin', '&classstats=0');
  const so = await stats(off.page);
  check('?classstats=0 restores baseline for a paladin', so.maxHp === 100 && so.rate === 7.5 && so.speed === 235 && so.dmg === 1 && so.line.indexOf('Paladin') < 0, JSON.stringify(so));
  check('?classstats=0: arena has no profile', await off.page.evaluate(() => window.__mm.arena.heroProfile === null));
  errs.push(...off.errors); await off.ctx.close();

  // Duels ignore the profile: with isPvp the stats are the fixed duel stats.
  const D = await open(browser, 'paladin');
  const duelStats = () => D.page.evaluate(() => { const a = window.__mm.arena; window.RT_DUEL_HP = 5; window.RT_DUEL_RATE = 4; const keep = a.team; a.team = { isPvp: true }; const s = a._calcStats(); const o = { maxHp: s.maxHp, rate: s.rate, speed: s.speed, dmg: s.dmg, iframes: s.iframes }; a.team = keep; a._calcStats(); return o; });
  const withP = await duelStats();
  await D.page.evaluate(() => window.__mm.arena.setHeroProfile(null));
  const without = await duelStats();
  check('duel stats are identical with and without a profile', JSON.stringify(withP) === JSON.stringify(without), JSON.stringify([withP, without]));
  check('setHeroProfile clamps wild input', await D.page.evaluate(() => { const a = window.__mm.arena; a.setHeroProfile({ hp: 99, dmg: 0, rate: NaN, speed: 1, iframes: 1 }); const h = a.heroProfile; return h.hp === 1.4 && h.dmg === 0.7 && h.rate === 1; }));
  errs.push(...D.errors); await D.ctx.close();

  // Town Realm Gate arena never gets a profile: main.js does not call the hook.
  const ctx = await browser.newContext(); const pg = await ctx.newPage();
  const res = await pg.request.get(ORIGIN + '/game/main.js'); const src = await res.text();
  check('town (main.js) never calls setHeroProfile', res.ok() && src.indexOf('setHeroProfile') < 0);
  await ctx.close();

  const ph = await open(browser, 'rogue', '', { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  check('390x844 phone: loads with profile, no horizontal scroll', (await stats(ph.page)).rate > 7.5 && await ph.page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth));
  errs.push(...ph.errors); await ph.ctx.close();

  check('no console errors', errs.length === 0, errs.join(' | '));
  await browser.close();
  done();
})();
