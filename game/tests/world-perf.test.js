// F1: World phone perf probe. The Realm world at 390x844 with a 4x CPU throttle (CDP) under load: 60 enemies + 300 enemy bullets
// (the pools are grown by the test for the probe). Records the median frame time, the 95th percentile, the worst frame and the number
// of long frames (>100 ms), and fails only on CATASTROPHIC regressions (generous bounds, so a slow CI box does not flake):
//   no frame over 1500 ms, median under MEDIAN_LIMIT_MS, at most LONG_LIMIT_FRAC of frames long, 0 console errors, 0 DB traffic.
// Recorded on a headless software-rendering box, 4x throttle, 60 enemies + 300 bullets: see BASELINE_MEDIAN_MS below (print line
// "world-perf: ..." shows the numbers every run so the baseline can be revised from real data).
// P1 adds a second case below (gear + splash on: staff_comet into 30 enemies vs the same scene with ?gear=0; median <= 1.10x, text pool <= 28,
// the first offending phase update/draw is logged on a miss). The case above is unchanged.
// Run: BASE=http://localhost:8583/game/index.html NODE_PATH=$(npm root -g) node game/tests/world-perf.test.js
const { chromium } = require('playwright');
const { check, done, blockDb } = require('./helpers');
const ORIGIN = (process.env.BASE || 'http://localhost:8440/game/index.html').replace(/\/game\/index\.html.*$/, '');
const WORLD = ORIGIN + '/game/games/mad-maze/index.html?mode=world&test=1&seed=12345';
const SAVE = { realm: { level: 4, xp: 0, shards: 50, bestWave: 2, items: [{ n: 1, id: 'sparkwand', r: 0 }], nextUid: 2, eq: { weapon: 1 } } };
const BASELINE_MEDIAN_MS = 17; // recorded: median 16.7 ms, p95 167 ms, worst 267 ms, 14 long frames of 173
const MEDIAN_LIMIT_MS = 100; // ~6x the baseline: only a catastrophic regression trips it
const MAX_FRAME_MS = 1500;
const LONG_MS = 100;
const LONG_LIMIT_FRAC = 0.5;

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  const db = await blockDb(ctx);
  await ctx.route('**/game/index.html*', (r) => r.fulfill({ contentType: 'text/html', body: '<!doctype html><title>town</title>town' })); // the town exit: no network
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  await page.goto(ORIGIN + '/game/games/mad-maze/lantern.css');
  await page.evaluate((v) => { localStorage.clear(); localStorage.setItem('pixeltown-save-v1', v); localStorage.setItem('mm-aim-assist', '0'); }, JSON.stringify(SAVE));
  errors.length = 0;
  await page.goto(WORLD);
  await page.waitForFunction(() => window.__mm && window.__mm.world && window.__mm.arena.active && window.__mm.arena.state === 'play', null, { timeout: 20000 });

  const cdp = await ctx.newCDPSession(page);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });

  // load: grow the pools, then place 60 enemies and 300 slow long-lived bullets around the player; the player cannot die
  const load = await page.evaluate(() => {
    const a = window.__mm.arena;
    a.player.iframes = 1e9; a._hitPlayer = () => {};
    while (a.enemies.length < 60) a.enemies.push(Object.assign({}, a.enemies[0], { active: false }));
    while (a.eBullets.length < 420) a.eBullets.push(Object.assign({}, a.eBullets[0], { active: false }));
    a.enemies.forEach((e) => { e.active = false; });
    let en = 0;
    for (let i = 0; en < 60 && i < 400; i++) {
      const ang = (i * 2.399963) % (Math.PI * 2); const r = 90 + (i % 9) * 24;
      const e = a.spawnEnemy(['spiral', 'aimed', 'ring'][i % 3],a.player.x + Math.cos(ang) * r, a.player.y + Math.sin(ang) * r);
      if (e) { e.hp = e.maxHp = 1e9; en++; }
    }
    let bn = 0;
    for (let i = 0; i < 300; i++) {
      const b = a.eBullets.find((x) => !x.active); if (!b) break;
      const ang = i * 2.399963; const r = 60 + (i % 11) * 22;
      b.active = true; b.x = a.player.x + Math.cos(ang) * r; b.y = a.player.y + Math.sin(ang) * r; b.vx = Math.cos(ang + 1) * 14; b.vy = Math.sin(ang + 1) * 14; b.life = 600; b.kind = i % 4; b.dm = 1;
      bn++;
    }
    return { enemies: en, bullets: bn, active: a.enemies.filter((e) => e.active).length, activeBullets: a.eBullets.filter((b) => b.active).length };
  });
  check('probe load placed: 60 enemies and 300 bullets', load.enemies === 60 && load.bullets === 300, JSON.stringify(load));

  // sample requestAnimationFrame deltas for 6 s
  const stats = await page.evaluate(() => new Promise((res) => {
    const d = []; let last = performance.now(); const t0 = last;
    const f = (now) => { d.push(now - last); last = now; if (now - t0 < 6000) requestAnimationFrame(f); else res(d); };
    requestAnimationFrame(f);
  }));
  const frames = stats.slice(2); // drop warm-up
  const sorted = frames.slice().sort((x, y) => x - y);
  const median = sorted[Math.floor(sorted.length / 2)];
  const p95 = sorted[Math.floor(sorted.length * 0.95)];
  const worst = sorted[sorted.length - 1];
  const longs = frames.filter((x) => x > LONG_MS).length;
  console.log(`world-perf: frames=${frames.length} median=${median.toFixed(1)}ms p95=${p95.toFixed(1)}ms worst=${worst.toFixed(1)}ms long(>${LONG_MS}ms)=${longs} bullets=${load.activeBullets}`);

  const alive = await page.evaluate(() => { const a = window.__mm.arena; return { enemies: a.enemies.filter((e) => e.active).length, state: a.state }; });
  check('the world kept running under load (state play, enemies still alive)', alive.state === 'play' && alive.enemies >= 30, JSON.stringify(alive));
  check('enough frames were sampled', frames.length >= 8, String(frames.length));
  check(`no frame longer than ${MAX_FRAME_MS} ms`, worst <= MAX_FRAME_MS, worst.toFixed(0));
  check(`median frame under ${MEDIAN_LIMIT_MS} ms (generous bound; recorded baseline ${BASELINE_MEDIAN_MS} ms)`, median <= MEDIAN_LIMIT_MS, median.toFixed(1));
  check(`long frames are under ${LONG_LIMIT_FRAC * 100}% of all frames`, longs / frames.length <= LONG_LIMIT_FRAC, `${longs}/${frames.length}`);
  const noScroll = await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);
  check('no horizontal scroll at 390 px', noScroll);
  check('0 console errors', errors.length === 0, errors.join(' | '));
  check('0 database requests or sockets', db.count() === 0, JSON.stringify(db));
  await ctx.close();

  // ===== P1 (NEXT-SLICES-2 Wave 2): the gear + splash-on case. The same phone page and 4x throttle; a warlock hero fires a Comet Staff
  // (staff_comet: splash r 56, frac 0.6, max 6) without pause into 30 sturdy enemies packed around the aim line. Run once with gear on
  // (splash on, the default) and once with ?gear=0 (no splash), same scene, same seed. Gate: gear-on median frame <= 1.10x the gear-off
  // median, and the floating-text pool never grows past 28 (its RM_POOL size) nor has more than 28 live texts. Each frame's work is also
  // timed by phase (arena _update / _draw): a miss logs the first offending phase for P2. The case above is unchanged.
  const GEAR_RATIO = 1.10, TEXT_POOL = 28;
  const HERO = { 'pixeltown-mm-v1': JSON.stringify({ v: 1, heroes: [{ id: 'h1', name: 'Wren', cls: 'warlock', level: 10, xp: 0, fame: 0, bonus: 0, mode: 'classic', items: [] }], stash: new Array(16).fill(null), fame: 0, mode: 'classic', hall: [], migratedFrom: null }), 'pixeltown-mm-active-v1': JSON.stringify({ v: 1, heroId: 'h1' }) };
  async function splashRun(gearOff) {
    const c2 = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
    const db2 = await blockDb(c2);
    await c2.route('**/game/index.html*', (r) => r.fulfill({ contentType: 'text/html', body: '<!doctype html><title>town</title>town' }));
    const pg = await c2.newPage(); const errs = [];
    pg.on('pageerror', (e) => errs.push('pageerror: ' + e.message));
    pg.on('console', (m) => { if (m.type() === 'error') errs.push('console: ' + m.text()); });
    await pg.goto(ORIGIN + '/game/games/mad-maze/lantern.css');
    await pg.evaluate((a) => { localStorage.clear(); localStorage.setItem('pixeltown-save-v1', a.v); localStorage.setItem('mm-aim-assist', '0'); Object.keys(a.h).forEach((k) => localStorage.setItem(k, a.h[k])); }, { v: JSON.stringify(SAVE), h: HERO });
    errs.length = 0;
    await pg.goto(WORLD + (gearOff ? '&gear=0' : ''));
    await pg.waitForFunction(() => window.__mm && window.__mm.world && window.__mm.arena.active && window.__mm.arena.state === 'play', null, { timeout: 20000 });
    await pg.waitForLoadState('networkidle');
    const cdp2 = await c2.newCDPSession(pg);
    await cdp2.send('Emulation.setCPUThrottlingRate', { rate: 4 });
    const setup = await pg.evaluate(() => {
      const a = window.__mm.arena, p = a.player;
      a.player.iframes = 1e9; a._hitPlayer = () => {};
      const on = a.setHeroWeapon(MMWeapons.resolve('warlock', 'staff_comet', 0));
      a.eBullets.forEach((b) => { b.active = false; }); a.enemies.forEach((e) => { e.active = false; });
      while (a.enemies.length < 30) a.enemies.push(Object.assign({}, a.enemies[0], { active: false }));
      let n = 0; // 30 enemies in a fan 150-260 px to the right of the hero, close enough that every comet splashes several
      for (let i = 0; n < 30 && i < 200; i++) { const e = a.spawnEnemy(['spiral', 'aimed', 'ring'][i % 3], p.x + 150 + (i % 5) * 26, p.y - 70 + Math.floor(i / 5) * 26); if (e) { e.hp = e.maxHp = 1e9; e.spdMul = 0; e.cd = 1e9; e.cd2 = 1e9; n++; } }
      // per-frame phase timing (update / draw) and the text pool, recorded by wrapping the arena's own methods
      const T = window.__P1 = { up: [], dr: [], maxLive: 0, maxPool: a.texts.length, splash0: a.splashN || 0 };
      const u = a._update.bind(a), d = a._draw.bind(a);
      a._update = (dt) => { const t = performance.now(); u(dt); T.up.push(performance.now() - t); let l = 0; for (let i = 0; i < a.texts.length; i++) if (a.texts[i].active) l++; if (l > T.maxLive) T.maxLive = l; if (a.texts.length > T.maxPool) T.maxPool = a.texts.length; };
      a._draw = () => { const t = performance.now(); d(); T.dr.push(performance.now() - t); };
      a.setAimStick(1, 0, true); // fire without pause, straight into the pack
      return { on: !!on, enemies: n, splashR: a.weapon && a.weapon.splash ? a.weapon.splash.r : 0 };
    });
    const d = await pg.evaluate(() => new Promise((res) => { const o = []; let last = performance.now(); const t0 = last; const f = (now) => { o.push(now - last); last = now; if (now - t0 < 6000) requestAnimationFrame(f); else res(o); }; requestAnimationFrame(f); }));
    const P = await pg.evaluate(() => { const a = window.__mm.arena, T = window.__P1; return { up: T.up.slice(5), dr: T.dr.slice(5), maxLive: T.maxLive, maxPool: T.maxPool, splashes: (a.splashN || 0) - T.splash0, alive: a.enemies.filter((e) => e.active).length, shots: a.pBullets.filter((b) => b.active).length }; });
    await cdp2.send('Emulation.setCPUThrottlingRate', { rate: 1 });
    const fr = d.slice(2).sort((x, y) => x - y), su = P.up.slice().sort((x, y) => x - y), sd = P.dr.slice().sort((x, y) => x - y);
    const q = (s, k) => s[Math.min(s.length - 1, Math.floor(s.length * k))];
    const mean = (s) => s.reduce((x, y) => x + y, 0) / Math.max(1, s.length);
    const r = { gearOff, setup, frames: fr.length, median: q(fr, 0.5), p95: q(fr, 0.95), upMed: q(su, 0.5), upP95: q(su, 0.95), drMed: q(sd, 0.5), drP95: q(sd, 0.95), workMean: mean(P.up) + mean(P.dr), maxLive: P.maxLive, maxPool: P.maxPool, splashes: P.splashes, alive: P.alive, errs, db: db2.count() };
    await c2.close();
    return r;
  }
  const off = await splashRun(true);
  const gon = await splashRun(false);
  const fx = (v) => v.toFixed(1);
  for (const r of [off, gon]) console.log(`world-perf ${r.gearOff ? 'gear-off' : 'gear-on '}: frames=${r.frames} median=${fx(r.median)}ms p95=${fx(r.p95)}ms | update med ${fx(r.upMed)} p95 ${fx(r.upP95)} ms, draw med ${fx(r.drMed)} p95 ${fx(r.drP95)} ms | splashes=${r.splashes} texts live max=${r.maxLive} pool=${r.maxPool} | ${JSON.stringify(r.setup)}`);
  const ratio = gon.median / off.median, workRatio = (gon.upMed + gon.drMed) / Math.max(0.1, off.upMed + off.drMed);
  const first = gon.upMed > off.upMed * GEAR_RATIO ? 'update' : gon.drMed > off.drMed * GEAR_RATIO ? 'draw' : (gon.upMed - off.upMed >= gon.drMed - off.drMed ? 'update' : 'draw');
  console.log(`world-perf gear-on/gear-off: work mean (update+draw per frame) ${gon.workMean.toFixed(2)} vs ${off.workMean.toFixed(2)} ms, ratio ${(gon.workMean / Math.max(0.01, off.workMean)).toFixed(3)} (P2: the mean is not quantised to the 0.1 ms timer like the medians)`);
  console.log(`world-perf gear-on/gear-off: frame median ratio ${ratio.toFixed(3)} (gate <= ${GEAR_RATIO}), work (update+draw median) ratio ${workRatio.toFixed(3)}, ${ratio > GEAR_RATIO ? 'first offending phase' : 'largest phase delta'}: ${first}`);
  check('gear case: the warlock fires staff_comet (splash r 56) into 30 enemies, gear on', gon.setup.on && gon.setup.enemies === 30 && gon.setup.splashR === 56 && gon.alive >= 30, JSON.stringify(gon.setup));
  check('gear case: splash events really happen with gear on, none with ?gear=0', gon.splashes > 20 && off.splashes === 0, JSON.stringify({ on: gon.splashes, off: off.splashes }));
  check('gear case: enough frames sampled in both runs', gon.frames >= 8 && off.frames >= 8, JSON.stringify({ on: gon.frames, off: off.frames }));
  check(`gear case: gear-on median frame <= ${GEAR_RATIO}x the gear-off median`, ratio <= GEAR_RATIO, `${fx(gon.median)} vs ${fx(off.median)} ms; first offending phase: ${first}`);
  if (ratio > GEAR_RATIO) console.log(`P1 first offending phase (gear-on): ${first} (update ${fx(off.upMed)} -> ${fx(gon.upMed)} ms, draw ${fx(off.drMed)} -> ${fx(gon.drMed)} ms)`);
  check(`gear case: the floating-text pool stays <= ${TEXT_POOL} (pool size and live texts)`, gon.maxPool <= TEXT_POOL && gon.maxLive <= TEXT_POOL, JSON.stringify({ pool: gon.maxPool, live: gon.maxLive }));
  check('gear case: 0 console errors', off.errs.length + gon.errs.length === 0, off.errs.concat(gon.errs).slice(0, 3).join(' | '));
  check('gear case: 0 database requests or sockets', off.db + gon.db === 0, String(off.db + gon.db));
  await browser.close();
  done();
})();
