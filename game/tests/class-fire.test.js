// Class fire tags in the standalone Mad Maze arena: bolt count / spread / pierce per class; ?classstats=0 restores today's fire.
// Run: BASE=http://localhost:8522/game/index.html NODE_PATH=$(npm root -g) node game/tests/class-fire.test.js
const { chromium } = require('playwright');
const { check, done } = require('./helpers');
const ORIGIN = (process.env.BASE || 'http://localhost:8440/game/index.html').replace(/\/game\/index\.html.*$/, '');
const MAZE = ORIGIN + '/game/games/mad-maze/index.html?test=1&offline=1';
const MM = 'pixeltown-mm-v1', ACTIVE = 'pixeltown-mm-active-v1';
const hero = (id, cls) => ({ id, name: cls, cls, level: 3, xp: 0, fame: 0, bonus: 0, mode: 'classic', items: [] });
const prof = (heroes) => ({ v: 1, heroes, stash: new Array(16).fill(null), fame: 0, mode: 'classic', hall: [], migratedFrom: null });
const CLS = ['ranger', 'paladin', 'rogue', 'berserker', 'frostcaller'];

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

// Quiet arena: play state, no enemies/bolts, player centred facing right.
const prep = (page) => page.evaluate(() => {
  const a = window.__mm.arena;
  a.state = 'play'; a.run.wave = 0; a.paused = false; a.down = false;
  [a.enemies, a.eBullets, a.pBullets].forEach((pool) => pool.forEach((o) => { o.active = false; }));
  const p = a.player; p.x = 300; p.y = 350; p.aim = 0; p.hp = a.stats.maxHp; p.iframes = 0;
  return true;
}, null);
// One volley: returns the active bolts' angles and damages.
const volley = (page) => page.evaluate(() => {
  const a = window.__mm.arena; a.pBullets.forEach((b) => { b.active = false; });
  a._firePlayerVolley(a.player.aim);
  return a.pBullets.filter((b) => b.active).map((b) => ({ ang: Math.atan2(b.vy, b.vx), dmg: b.dmg, sp: Math.hypot(b.vx, b.vy), pr: b.pr }));
});
// Two quiet enemies in a row ahead of the player with 0.4 hp; fire one volley, step 40 frames; returns how many died.
const pierceRun = (page) => page.evaluate(() => {
  const a = window.__mm.arena, p = a.player;
  const mk = (dx) => { const e = a.spawnEnemy('ring', p.x + dx, p.y); e.cd = 999; e.spdMul = 0; e.hp = 0.4; e.maxHp = 0.4; return e; };
  const e1 = mk(110), e2 = mk(180);
  a._firePlayerVolley(0);
  for (let i = 0; i < 40; i++) a._update(1 / 60);
  return { dead1: !e1.active, dead2: !e2.active };
});

(async () => {
  const browser = await chromium.launch();
  const errs = [];
  const R = await open(browser, 'ranger'); errs.push(...R.errors);
  await prep(R.page);
  const rv = await volley(R.page);
  check('ranger volley = one plain bolt, straight, base damage', rv.length === 1 && Math.abs(rv[0].ang) < 1e-9 && rv[0].dmg === 1 && Math.abs(rv[0].sp - 580) < 1e-6 && rv[0].pr === 0, JSON.stringify(rv));
  await prep(R.page);
  const rp = await pierceRun(R.page);
  check('ranger bolt stops at the first enemy (second survives)', rp.dead1 && !rp.dead2, JSON.stringify(rp));
  await R.ctx.close();

  const B = await open(browser, 'berserker'); errs.push(...B.errors);
  await prep(B.page);
  const bv = await volley(B.page);
  const bp = await B.page.evaluate(() => MMClasses.arenaProfile('berserker'));
  check('berserker fires its short fan (3 bolts across the spread)', bv.length === 3 && Math.abs((Math.max(...bv.map((b) => b.ang)) - Math.min(...bv.map((b) => b.ang))) - bp.spread) < 1e-6 && bv.some((b) => Math.abs(b.ang) < 1e-9), JSON.stringify(bv));
  check('fan bolts carry the per-bolt damage share', bv.every((b) => Math.abs(b.dmg - bv[0].dmg) < 1e-9) && bv[0].dmg < 1 && bv[0].dmg > 0.3, JSON.stringify(bv));
  await B.ctx.close();

  const Ro = await open(browser, 'rogue'); errs.push(...Ro.errors);
  await prep(Ro.page);
  const rov = await volley(Ro.page);
  check('rogue fires twin daggers, faster than a plain bolt', rov.length === 2 && rov[0].sp > 580 && rov[1].sp > 580 && rov[0].ang < 0 !== rov[1].ang < 0, JSON.stringify(rov));
  await Ro.ctx.close();

  const F = await open(browser, 'frostcaller'); errs.push(...F.errors);
  await prep(F.page);
  const fv = await volley(F.page);
  check('frostcaller fires one slower piercing bolt (pierce 2)', fv.length === 1 && fv[0].sp < 580 && fv[0].pr === 2, JSON.stringify(fv));
  await prep(F.page);
  const fp = await pierceRun(F.page);
  check('piercing bolt kills 2 aligned enemies with one shot', fp.dead1 && fp.dead2, JSON.stringify(fp));
  await F.ctx.close();

  const P = await open(browser, 'paladin'); errs.push(...P.errors);
  await prep(P.page);
  const pp = await pierceRun(P.page);
  check('paladin pierce also kills 2 aligned enemies', pp.dead1 && pp.dead2, JSON.stringify(pp));
  await P.ctx.close();

  const Off = await open(browser, 'berserker', '&classstats=0'); errs.push(...Off.errors);
  await prep(Off.page);
  const ov = await volley(Off.page);
  check('?classstats=0 restores a single plain bolt for a berserker', ov.length === 1 && Math.abs(ov[0].ang) < 1e-9 && ov[0].dmg === 1 && ov[0].pr === 0, JSON.stringify(ov));
  await prep(Off.page);
  const op = await pierceRun(Off.page);
  check('?classstats=0: no piercing', op.dead1 && !op.dead2, JSON.stringify(op));
  await Off.ctx.close();

  const D = await open(browser, 'berserker'); errs.push(...D.errors);
  await prep(D.page);
  const dv = await D.page.evaluate(() => { const a = window.__mm.arena; const keep = a.team; a.team = { isPvp: true, ev() {} }; a.pBullets.forEach((b) => { b.active = false; }); a._firePlayerVolley(0); const n = a.pBullets.filter((b) => b.active).length; a.team = keep; return n; });
  check('duels ignore fire tags (single bolt)', dv === 1, String(dv));
  check('setHeroProfile clamps wild fire tags', await D.page.evaluate(() => { const a = window.__mm.arena; a.setHeroProfile({ shots: 99, spread: 9, pierce: 99, shotDmg: 0, critChance: 5, boltSpeed: 9 }); const h = a.heroProfile; return h.shots === 5 && h.spread === 1 && h.pierce === 3 && h.shotDmg === 1 && h.critChance === 0.5 && h.boltSpeed === 1.3; }));
  await D.ctx.close();

  const ph = await open(browser, 'berserker', '', { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true }); errs.push(...ph.errors);
  check('390x844 phone: no horizontal scroll', await ph.page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth));
  await ph.ctx.close();

  check('no console errors', errs.length === 0, errs.join(' | '));
  await browser.close();
  done();
})();
