// Lantern Dash page (game/games/dash): one-button runner, perfect-timing combo, seeded course, ghost of the best run,
// medals, phone targets, keyboard, nav, reduced motion / low graphics.
//   python3 -m http.server 9355 &   BASE=http://localhost:9355/game/index.html NODE_PATH=$(npm root -g) node game/tests/dash-page.test.js
// Standalone page only: never joins the town. Firebase hosts are blocked (blockDb) and must see 0 attempts.
const { chromium } = require('playwright');
const { check, done, blockDb } = require('./helpers');
const BASE = process.env.BASE || 'http://localhost:9355/game/index.html';
const PAGE = BASE.replace(/index\.html.*$/, '') + 'games/dash/index.html';
const KEY = 'pixeltown-dash-v1', MKEY = 'pixeltown-medals-dash-v1';

async function open(browser, ctxOpts, query, init) {
  const ctx = await browser.newContext(ctxOpts);
  const db = await blockDb(ctx);
  if (init) await ctx.addInitScript((kv) => { if (!sessionStorage.seeded) { sessionStorage.seeded = '1'; Object.keys(kv).forEach((k) => localStorage.setItem(k, kv[k])); } }, init);
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  await page.goto(PAGE + (query || '?test=1'));
  await page.waitForFunction(() => window.__dash);
  return { ctx, page, errors, db };
}
const lj = (p, k) => p.evaluate((key) => JSON.parse(localStorage.getItem(key)), k);

(async () => {
  const browser = await chromium.launch();
  const s = await open(browser, { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true }, '?test=1&seed=night1');
  const p = s.page;
  check('title and how-to card on a fresh save', (await p.title()) === 'Lantern Dash - Pixeltown' && await p.isVisible('#intro') && await p.isVisible('#how') && (await p.textContent('#play')) === 'Got it, run');
  check('MMNav mounted and the old links removed from view', await p.evaluate(() => !!document.getElementById('mm-nav-btn') && document.body.classList.contains('mm-nav-on') && document.getElementById('back').hidden && document.getElementById('town').getBoundingClientRect().width === 0));
  // seeded course: same seed -> same obstacles, other seed -> different
  const cs = await p.evaluate(() => { const a = __dash.course('night1').obs.slice(0, 30), b = __dash.course('night1').obs.slice(0, 30), c = __dash.course('other').obs.slice(0, 30); return { same: JSON.stringify(a) === JSON.stringify(b), diff: JSON.stringify(a) !== JSON.stringify(c), easy: a.slice(0, 3).every((o) => o.t === 'rock'), kinds: [...new Set(a.map((o) => o.t))].sort().join(',') }; });
  check('course is seeded: same seed same course, new seed new course', cs.same && cs.diff, JSON.stringify(cs));
  check('gentle start: first three obstacles are small rocks; later rocks, tall stones and gaps', cs.easy && cs.kinds === 'gap,rock,tall', JSON.stringify(cs));
  await p.tap('#play');
  check('Run starts on the URL seed and remembers the hint', await p.evaluate(() => __dash.run.state === 'play' && __dash.run.seed === 'night1') && (await lj(p, KEY)).hint === true);
  // no input -> the first rock ends the run
  const idle = await p.evaluate(() => { __dash.step(2000); return { st: __dash.run.state, dead: __dash.player.dead, dist: __dash.run.dist }; });
  check('without jumping you bump the first rock (run over, reason shown)', idle.st === 'over' && idle.dead === 'rock' && /rock/i.test(await p.textContent('#r-why')), JSON.stringify(idle));
  check('result card: distance, Play again focused, medal run1 saved for the hub', await p.isVisible('#result') && (await p.textContent('#r-dist')) === String(idle.dist) && await p.evaluate(() => document.activeElement.id === 'again') && (await lj(p, MKEY)).m.includes('run1'));
  check('after a crash the big button reads Run again and the result sits below the scene', (await p.textContent('#jump')) === 'Run again' && await p.evaluate(() => document.getElementById('result').getBoundingClientRect().top >= document.getElementById('view').getBoundingClientRect().bottom));
  await p.waitForTimeout(750);
  const jb0 = await p.locator('#jump').boundingBox();
  await p.touchscreen.tap(jb0.x + jb0.width / 2, jb0.y + jb0.height / 2);
  check('one tap on Run again restarts the same course', await p.evaluate(() => __dash.run.state === 'play' && __dash.run.seed === 'night1' && __dash.run.f === 0 && document.getElementById('result').hidden));
  // jump physics: a press makes the hero leave the ground; holding goes higher than a tap
  const jh = await p.evaluate(() => {
    const peak = (hold) => { __dash.start('flat'); __dash.down(); let top = 999; for (let i = 0; i < 50; i++) { if (i === hold) __dash.up(); __dash.step(1); top = Math.min(top, __dash.player.y); } __dash.up(); return 200 - top; };
    return { tap: peak(2), hold: peak(30) };
  });
  check('tap jumps, hold jumps higher (variable jump)', jh.tap > 40 && jh.hold > jh.tap + 15, JSON.stringify(jh));
  // a late jump just before a rock is a Perfect and builds the combo; an early one does not
  const perf = await p.evaluate(() => {
    const go = (lead) => { __dash.start('night1'); __dash.step(1400, { lead }); return { combo: __dash.run.bestCombo, perfects: __dash.run.perfects, dist: __dash.run.dist, bonus: __dash.run.bonus }; };
    return { late: go(24), early: go(70) };
  });
  check('late jumps score Perfects: combo grows and adds bonus points', perf.late.combo >= 3 && perf.late.bonus > 0, JSON.stringify(perf));
  check('early jumps earn no Perfect combo', perf.early.combo === 0 && perf.early.perfects === 0, JSON.stringify(perf));
  check('a skilled run outlasts the idle run (skill curve)', perf.late.dist > idle.dist * 3, JSON.stringify([perf.late, idle]));
  // finish a run on night1 so a ghost exists, then Play again races it
  await p.evaluate(() => { __dash.start('night1'); __dash.step(20000, { lead: 26 }); });
  const g1 = await p.evaluate(() => ({ st: __dash.run.state, dist: __dash.run.dist, ghost: __dash.save.ghost }));
  check('best run on a course is saved as a ghost (inputs + distance)', g1.st === 'over' && g1.ghost && g1.ghost.seed === 'night1' && g1.ghost.in.length > 5 && g1.ghost.dist === g1.dist, JSON.stringify({ st: g1.st, d: g1.dist, n: g1.ghost && g1.ghost.in.length }));
  await p.tap('#again');
  const gh = await p.evaluate(() => {
    const out = { seed: __dash.run.seed, ghost: !!__dash.ghost, msg: document.getElementById('msg').textContent, ys: [] };
    for (let i = 0; i < 600; i++) { __dash.step(1); if (i % 30 === 0) out.ys.push(Math.round(__dash.ghost.y)); }
    out.ghostAlive = !__dash.ghost.dead; out.left = __dash.ghost.y < 200 || out.ys.some((y) => y < 200);
    return out;
  });
  check('Play again replays the same course with your ghost, which jumps on its own', gh.seed === 'night1' && gh.ghost && /ghost/i.test(gh.msg) && gh.ghostAlive && gh.left, JSON.stringify(gh));
  const replay = await p.evaluate((want) => { __dash.start('night1'); const ins = __dash.save.ghost.in; let k = 0; for (let f = 0; f < 40000 && __dash.run.state === 'play'; f++) { if (k < ins.length && ins[k][0] === f) __dash.down(); if (k < ins.length && ins[k][1] === f) { __dash.up(); k++; } __dash.step(1); } return __dash.run.dist === want; }, g1.dist);
  check('the simulation is deterministic: replaying the ghost inputs reaches the same distance', replay);
  await p.evaluate(() => __dash.step(40000));
  // targets
  const t = await p.evaluate(() => ['jump', 'again', 'fresh', 'btn-mute'].map((id) => { const r = document.getElementById(id).getBoundingClientRect(); return [id, Math.round(r.width), Math.round(r.height)]; }).concat([['scroll', document.documentElement.scrollWidth <= innerWidth ? 99 : 0, 99]]));
  check('phone: Jump, Play again, New course, Sound are >= 44 px; no horizontal scroll', t.every((x) => x[1] >= 44 && x[2] >= 44), JSON.stringify(t));
  await p.tap('#fresh');
  check('New course rolls a new seed', await p.evaluate(() => __dash.run.state === 'play' && __dash.run.seed !== 'night1' && !__dash.ghost));
  // the big Jump button (touch) makes the hero jump
  const jb = await p.locator('#jump').boundingBox();
  await p.touchscreen.tap(jb.x + jb.width / 2, jb.y + jb.height / 2);
  await p.evaluate(() => __dash.step(3));
  check('a touch on the Jump button jumps', await p.evaluate(() => __dash.player.jumps === 1 && __dash.player.y < 200));
  check('phone: no console errors, 0 DB requests', s.errors.length === 0 && s.db.count() === 0, JSON.stringify(s.errors));
  await s.ctx.close();

  // ---- desktop keyboard, reduced motion + low graphics, hostile save ----
  const d = await open(browser, { viewport: { width: 1280, height: 800 }, reducedMotion: 'reduce' }, '?test=1&seed=keys',
    { [KEY]: JSON.stringify({ v: 1, hint: true, best: 321, medals: ['run1', 'bogus'], ghost: { seed: 'bad seed!', in: [[1, 2]], dist: 5 } }), 'pixeltown-access-v1': JSON.stringify({ v: 1, lowGfx: true }) });
  const q = d.page;
  check('hostile save cleaned: bad ghost seed dropped, unknown medal dropped, best kept', await q.evaluate(() => __dash.save.ghost === null && JSON.stringify(__dash.save.medals) === '["run1"]' && __dash.save.best === 321));
  check('returning player: one-tap Run card', !(await q.isVisible('#how')) && (await q.textContent('#play')) === 'Run');
  await q.click('#play');
  await q.evaluate(() => document.activeElement.blur());
  await q.keyboard.down('Space');
  await q.evaluate(() => __dash.step(3));
  check('keyboard: Space jumps', await q.evaluate(() => __dash.player.jumps === 1 && __dash.player.y < 200));
  await q.keyboard.up('Space');
  await q.evaluate(() => __dash.step(3000));
  const rm = await q.evaluate(() => Object.assign(__dash.counts(), { reduced: __dash.reduced, low: __dash.lowGfx, st: __dash.run.state }));
  check('reduced motion: no shake on a crash; low graphics: few particles', rm.st === 'over' && rm.reduced && rm.low && rm.shake === 0 && rm.parts <= 12, JSON.stringify(rm));
  check('desktop: no console errors, 0 DB requests', d.errors.length === 0 && d.db.count() === 0, JSON.stringify(d.errors));
  await d.ctx.close();
  await browser.close();
  done();
})().catch((e) => { console.error(e); process.exit(1); });
