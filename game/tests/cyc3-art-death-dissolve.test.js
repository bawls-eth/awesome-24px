// Cycle 3 art (G): Realm enemy death dissolve. After the death strip's last frame the corpse breaks up in 2x2 ordered-dither blocks
// over 0.3 s (squashing toward its feet) instead of a whole-sprite alpha fade. ?dissolve=0 = the old fade. Own origin only, no Firebase.
// Run: BASE=http://localhost:8440/game/index.html NODE_PATH=$(npm root -g) node game/tests/cyc3-art-death-dissolve.test.js
const { chromium } = require('playwright');
const { check, done, blockDb } = require('./helpers');
const LS = require('./lib/load-scale');
const ORIGIN = (process.env.BASE || 'http://localhost:8440/game/index.html').replace(/\/game\/index\.html.*$/, '');
const MAZE = ORIGIN + '/game/games/mad-maze/index.html?test=1&offline=1';

async function sample(browser, q) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  await blockDb(ctx);
  const page = await ctx.newPage(); const errors = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  await page.goto(MAZE + (q || ''));
  await page.waitForFunction(() => window.__mm && window.__mm.arena && window.__mm.arena._enemyArt, null, { timeout: 20000 });
  const r = await page.evaluate(() => {
    const a = window.__mm.arena; a.setPaused && a.setPaused(true);
    a.player.iframes = 1e9; a.player.hp = 1e9; a.nextWaveIn = 1e9; a.enemies.forEach((e) => { e.active = false; });
    a._edGhosts.forEach((q) => { q.active = false; });
    const e = a.spawnEnemy('ring', 300, 200); e.cd = 99; e.t = 0.5;
    const tmp = document.createElement('canvas'); tmp.width = tmp.height = 400; a._drawEnemyArt(tmp.getContext('2d'), e, { r: 15 });
    e.hp = 1; a._hitEnemy(e, 999);
    const q = a._edGhosts.find((x) => x.active); if (!q) return { ghost: false };
    const an = a._enemyArt.anim(q.name, 'death', q.dir), len = an.frames / an.fps;
    const count = (dt) => {
      q.active = true; q.t0 = a.clock - dt;
      const c = document.createElement('canvas'); c.width = a.W; c.height = a.H; const g = c.getContext('2d');
      a._drawEnemyGhosts(g);
      const d = g.getImageData(q.x - 100, q.y - 160, 200, 200).data; let n = 0, partial = 0;
      for (let i = 3; i < d.length; i += 4) { if (d[i] === 255) n++; else if (d[i] > 0) partial++; }
      return { n, partial };
    };
    const full = count(len - 0.001), mid = count(len + 0.15), late = count(len + 0.285);
    const st0 = a.dissolveStats ? a.dissolveStats.draws : 0;
    // cost: 200 dissolve draws of one ghost (the per-frame cost of one dissolving corpse)
    const c = document.createElement('canvas'); c.width = a.W; c.height = a.H; const g = c.getContext('2d');
    const t0 = performance.now();
    for (let i = 0; i < 200; i++) { q.active = true; q.t0 = a.clock - (len + 0.001 + (i % 29) * 0.01); a._drawEnemyGhosts(g); }
    const per = (performance.now() - t0) / 200;
    q.active = true; q.t0 = a.clock - (len + 0.31); a._drawEnemyGhosts(g);
    return { ghost: true, len, full, mid, late, per, stats: a.dissolveStats ? Object.assign({}, a.dissolveStats) : null, st0, expired: !q.active };
  });
  await ctx.close();
  return Object.assign(r, { errors });
}

(async () => {
  const browser = await chromium.launch();
  const on = await sample(browser, '');
  check('a death ghost spawned with a death strip', on.ghost && on.len > 0, JSON.stringify(on).slice(0, 200));
  check('last frame (before the dissolve) draws a solid corpse (> 150 opaque px)', on.full.n > 150, JSON.stringify(on.full));
  check('dissolve is pixel-wise, not an alpha fade: mid-way 25-75 % of the pixels remain, all fully opaque', on.mid.n > on.full.n * 0.25 && on.mid.n < on.full.n * 0.75 && on.mid.partial < on.mid.n * 0.15, JSON.stringify([on.full, on.mid]));
  check('near the end < 15 % remain', on.late.n < on.full.n * 0.15, JSON.stringify([on.full, on.late]));
  check('dissolve path counted (stats on, draws > 0, level 1-16)', on.stats && on.stats.on && on.st0 >= 2 && on.stats.level >= 1 && on.stats.level <= 16, JSON.stringify(on.stats));
  check('per-frame cost of one dissolving corpse < ' + LS.budget(0.6).toFixed(2) + ' ms (measured ' + on.per.toFixed(3) + ' ms)', on.per < LS.budget(0.6), on.per.toFixed(3));
  check('the ghost still expires 0.3 s after its last frame', on.expired);
  const off = await sample(browser, '?dissolve=0');
  check('?dissolve=0: old whole-sprite fade (translucent pixels mid-way, no dissolve draws)', off.ghost && off.mid.partial > off.full.partial && off.stats && !off.stats.on && off.st0 === 0, JSON.stringify([off.mid, off.stats]));
  check('no page errors', on.errors.length === 0 && off.errors.length === 0, on.errors.concat(off.errors).join(' | '));
  console.log('INFO dissolve per-frame cost', on.per.toFixed(3), 'ms; pixels full/mid/late', on.full.n, on.mid.n, on.late.n);
  await browser.close();
  done();
})().catch((e) => { console.error(e); process.exit(1); });
