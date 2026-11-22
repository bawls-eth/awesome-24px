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
  // ---- second pass: gentler start, coyote + buffer, forgiving landings, near misses, ghost clarity ----
  const sp = await p.evaluate(() => [0, 600, 1200, 1800, 1e6].map((f) => __dash.speedAt(f)));
  check('gentle start: 140 px/s at the start, only 160 after 10 s (was 172), 180 at 20 s', sp[0] === 140 && sp[1] === 160 && sp[2] === 180, JSON.stringify(sp));
  check('after the warm-up the old ramp resumes (+3.2/s) and still tops out at 330', Math.abs(sp[3] - 212) < 1e-9 && sp[4] === 330, JSON.stringify(sp));
  const cb = await p.evaluate(() => {
    const T = __dash.tuning;
    // buffer: a press a few frames before touching down still jumps on landing
    __dash.start('flat'); __dash.down(); let land = 0; __dash.step(3); __dash.up();
    while (!__dash.player.ground && land < 200) { __dash.step(1); land++; }
    __dash.start('flat'); __dash.down(); __dash.step(3); __dash.up(); __dash.step(land - 6); __dash.down(); __dash.step(T.BUFFER); __dash.up();
    const buffered = __dash.player.jumps;
    // coyote: just walked off an edge (airborne, falling for COYOTE frames) and a press still jumps
    __dash.start('flat'); const P = __dash.player; P.ground = false; P.air = T.COYOTE; P.y = 200; P.vy = 0; __dash.down(); __dash.step(1); __dash.up();
    const coyote = { jumps: P.jumps, vy: P.vy };
    return { T, land, buffered, coyote };
  });
  check('fairness tuning: coyote 6 frames, input buffer 8 frames (was 5 / 6)', cb.T.COYOTE === 6 && cb.T.BUFFER === 8 && cb.T.PV === 2, JSON.stringify(cb.T));
  check('input buffer: a press 6 frames before touching down still jumps on landing (the old 6-frame buffer dropped it)', cb.buffered === 2, JSON.stringify(cb));
  check('coyote time: a press just after running off an edge still jumps', cb.coyote.jumps === 1 && cb.coyote.vy < 0, JSON.stringify(cb));
  const early = await p.evaluate(() => { const out = {}; for (const s of ['a', 'd', 'e']) { __dash.start(s); __dash.step(600, { lead: 60 }); out[s] = { st: __dash.run.state, dist: __dash.run.dist, perch: __dash.player.perch || 0 }; } __dash.start('a'); __dash.step(2000); out.idle = { st: __dash.run.state, dead: __dash.player.dead, why: __dash.run.why }; return out; });
  check('forgiving landing: a too-early jump that comes down on a rock top lands on it (was a crash at 54 m)', ['a', 'd', 'e'].every((s) => early[s].perch >= 1 && early[s].dist > 100), JSON.stringify(early));
  check('forgiving landing: early jumpers now get past the first 10 s', ['a', 'd', 'e'].every((s) => early[s].st === 'play'), JSON.stringify(early));
  check('rocks still end a run when you never jump (and the reason says so)', early.idle.st === 'over' && early.idle.dead === 'rock' && early.idle.why === 'nojump' && /tap to jump/i.test(await p.textContent('#r-why')), JSON.stringify(early.idle));
  check('quick restart is spelled out on the result card (R or Run again)', /press r/i.test(await p.textContent('#r-why')));
  const nm = await p.evaluate(() => {
    for (const lead of [18, 20, 22, 24, 26, 28, 30, 32, 34, 36]) {
      __dash.start('night1'); let seen = false;
      for (let i = 0; i < 1500 && __dash.run.state === 'play'; i++) { __dash.step(1, { lead }); if (__dash.counts().floatTexts.includes('close!')) seen = true; }
      if (__dash.run.near > 0) return { lead, near: __dash.run.near, seen, dist: __dash.run.dist, tun: __dash.tuning.NEAR };
    }
    return null;
  });
  check('near miss: clearing a rock by under 8 px counts a near miss', nm && nm.near >= 1 && nm.tun === 8, JSON.stringify(nm));
  check('near miss: a "close!" sparkle pops over the hero', nm && nm.seen, JSON.stringify(nm));
  // ghost: saved with the physics version; the race shows a tag and the ghost's finish flag
  await p.evaluate(() => { __dash.start('night1'); __dash.step(20000, { lead: 26 }); });
  const gv = await p.evaluate(() => { const gs = __dash.save.ghost; __dash.start('night1'); __dash.step(30, { lead: 26 }); __dash.draw(); return { pv: gs.pv, racing: !!__dash.ghost, tag: __dash.counts().ghostTag }; });
  check('ghost clarity: ghosts are saved with physics version 2 and raced on Play again', gv.pv === 2 && gv.racing, JSON.stringify(gv));
  check('ghost clarity: the ghost wears a "ghost" tag at the start of the race', gv.tag === true, JSON.stringify(gv));
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
  await q.evaluate(() => document.activeElement.blur());
  await q.keyboard.press('r');
  check('quick restart: R right at the crash is ignored (no skipped result card)', await q.evaluate(() => __dash.run.state === 'over'));
  await q.waitForTimeout(750);
  const f0 = await q.evaluate(() => __dash.run.seed);
  await q.keyboard.press('r');
  check('quick restart: R after a crash runs the same course again from 0 m', await q.evaluate((sd) => __dash.run.state === 'play' && __dash.run.seed === sd && __dash.run.f === 0 && document.getElementById('result').hidden, f0));
  await q.keyboard.press('r');
  check('quick restart: R during a run does nothing', await q.evaluate((sd) => __dash.run.state === 'play' && __dash.run.seed === sd && __dash.player.jumps === 0, f0));
  check('desktop: no console errors, 0 DB requests', d.errors.length === 0 && d.db.count() === 0, JSON.stringify(d.errors));
  await d.ctx.close();
  // an old (pre-second-pass) ghost has no pv: it is not raced (its inputs were for the old physics), but the save loads clean
  const o = await open(browser, { viewport: { width: 1280, height: 800 } }, '?test=1&seed=oldg',
    { [KEY]: JSON.stringify({ v: 1, hint: true, best: 77, runs: 2, ghost: { seed: 'oldg', in: [[10, 14]], dist: 60 } }) });
  await o.page.click('#play');
  const og = await o.page.evaluate(() => ({ racing: !!__dash.ghost, kept: __dash.save.ghost && __dash.save.ghost.dist, best: __dash.save.best }));
  check('old ghost without pv loads (kept in the save) but is not raced out of sync', !og.racing && og.kept === 60 && og.best === 77, JSON.stringify(og));
  await o.page.evaluate(() => __dash.step(3000));
  check('the next run on that course replaces the old ghost with a pv 2 ghost', await o.page.evaluate(() => __dash.run.state === 'over' && __dash.save.ghost.pv === 2 && __dash.save.ghost.seed === 'oldg'));
  check('old-ghost page: no console errors, 0 DB requests', o.errors.length === 0 && o.db.count() === 0, JSON.stringify(o.errors));
  await o.ctx.close();
  await browser.close();
  done();
})().catch((e) => { console.error(e); process.exit(1); });
