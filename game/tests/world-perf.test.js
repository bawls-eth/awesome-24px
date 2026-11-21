// F1: World phone perf probe. The Realm world at 390x844 with a 4x CPU throttle (CDP) under load: 60 enemies + 300 enemy bullets
// (the pools are grown by the test for the probe). Records the median frame time, the 95th percentile, the worst frame and the number
// of long frames (>100 ms), and fails only on CATASTROPHIC regressions (generous bounds, so a slow CI box does not flake):
//   no frame over 1500 ms, median under MEDIAN_LIMIT_MS, at most LONG_LIMIT_FRAC of frames long, 0 console errors, 0 DB traffic.
// Recorded on a headless software-rendering box, 4x throttle, 60 enemies + 300 bullets: see BASELINE_MEDIAN_MS below (print line
// "world-perf: ..." shows the numbers every run so the baseline can be revised from real data).
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
  await browser.close();
  done();
})();
