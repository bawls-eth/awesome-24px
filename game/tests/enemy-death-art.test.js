// Enemy death animations + dark_spider biome skin in the Mad Maze arena. Own origin only, no Firebase.
// Run: BASE=http://localhost:8457/game/index.html flock /tmp/live.lock node game/tests/enemy-death-art.test.js
const { chromium } = require('playwright');
const { check, done } = require('./helpers');
const ORIGIN = (process.env.BASE || 'http://localhost:8440/game/index.html').replace(/\/game\/index\.html.*$/, '');
const MAZE = ORIGIN + '/game/games/mad-maze/index.html?test=1&offline=1';

async function open(browser, opts, url) {
  const ctx = await browser.newContext(opts);
  const page = await ctx.newPage();
  const errors = [], bad = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  page.on('response', (r) => { if (r.status() >= 400) bad.push(r.status() + ' ' + r.url()); });
  await page.goto(url || MAZE);
  await page.waitForFunction(() => window.__mm && window.__mm.arena);
  return { ctx, page, errors, bad };
}
const park = (page) => page.evaluate(() => {
  const a = window.__mm.arena; a._enemyDbgOn = true; a.player.iframes = 1e9; a.player.hp = 1e9; a.nextWaveIn = 1e9;
  a.player.x = a.W / 2; a.player.y = a.H / 2; a.enemies.forEach((e) => { e.active = false; }); a.eBullets.forEach((b) => { b.active = false; });
});
const live = (page) => page.evaluate(() => window.__mm.arena._edGhosts.filter((q) => q.active).length);
// Spawn a type, draw it once (so it has art state), then kill it with one hit.
const killOne = (page, type, x, y) => page.evaluate(([t, x, y]) => {
  const a = window.__mm.arena; const e = a.spawnEnemy(t, x, y); e.cd = 99; e.t = 0.5;
  const c = document.createElement('canvas'); c.width = c.height = 400; a._drawEnemyArt(c.getContext('2d'), e, { r: 14 });
  e.hp = 1; a._hitEnemy(e, 999); return !e.active;
}, [type, x, y]);

async function suite(label, opts) {
  const browser = await chromium.launch();
  const T = (s) => `${label}: ${s}`;
  const P = await open(browser, opts);
  await P.page.waitForFunction(() => window.__mm.arena._enemyArt, null, { timeout: 8000 });
  await park(P.page);
  const pg = P.page;
  check(T('death strips loaded for mapped creatures, down/right only'), await pg.evaluate(() => { const r = window.__mm.arena._enemyArt.registry; return ['moth', 'archer', 'puffcap', 'dark_spider'].every((n) => r[n] && r[n].death_down && r[n].death_right && !r[n].death_up && r[n].death_down.ready); }));
  check(T('death ghost pool is preallocated (24)'), await pg.evaluate(() => window.__mm.arena._edGhosts.length === 24));

  // kill spawns a ghost that plays frames then expires
  check(T('kill returns enemy dead'), await killOne(pg, 'ring', 200, 150));
  check(T('death ghost spawned'), (await live(pg)) === 1);
  const info = await pg.evaluate(() => { const q = window.__mm.arena._edGhosts.find((x) => x.active); return { name: q.name, y: q.y, x: q.x }; });
  check(T('ghost uses the creature (puffcap) at the spot'), info.name === 'puffcap' && Math.abs(info.x - 200) < 1, JSON.stringify(info));
  const frames = new Set();
  const drawF = () => pg.evaluate(() => { const a = window.__mm.arena; const q = a._edGhosts.find((x) => x.active); if (!q) return -1; const an = a._enemyArt.anim(q.name, 'death', q.dir); return Math.min(an.frames - 1, Math.floor((a.clock - q.t0) * an.fps)); });
  for (let i = 0; i < 30; i++) { const f = await drawF(); if (f >= 0) frames.add(f); await pg.waitForTimeout(60); }
  check(T('ghost plays several frames'), frames.size >= 3, [...frames].join(','));
  check(T('ghost expired afterwards'), (await live(pg)) === 0);
  // ghost draws real pixels
  const px = await pg.evaluate(() => {
    const a = window.__mm.arena; const e = a.spawnEnemy('ring', 300, 200); e.cd = 99; e.t = 0.5;
    const c = document.createElement('canvas'); c.width = c.height = 400; a._drawEnemyArt(c.getContext('2d'), e, { r: 15 });
    e.hp = 1; a._hitEnemy(e, 999);
    const g = document.createElement('canvas'); g.width = a.W; g.height = a.H; const cx = g.getContext('2d');
    a._drawEnemyGhosts(cx); const d = cx.getImageData(240, 120, 120, 120).data; let n = 0; for (let i = 3; i < d.length; i += 4) if (d[i]) n++;
    return n;
  });
  check(T('ghost draws real pixels'), px > 200, String(px));
  await pg.evaluate(() => window.__mm.arena._edGhosts.forEach((q) => { q.active = false; }));

  // pause freezes
  await killOne(pg, 'aimed', 150, 150);
  await pg.evaluate(() => window.__mm.arena.setPaused(true)); await pg.waitForTimeout(100);
  const c1 = await pg.evaluate(() => window.__mm.arena.clock); await pg.waitForTimeout(700);
  const c2 = await pg.evaluate(() => window.__mm.arena.clock);
  check(T('pause freezes the ghost (clock, still alive)'), c1 === c2 && (await live(pg)) === 1, c1 + ' ' + c2);
  await pg.evaluate(() => window.__mm.arena.setPaused(false)); await pg.waitForTimeout(1500);
  check(T('resumes and expires'), (await live(pg)) === 0);

  // burst of 60 kills: pooled
  const burst = await pg.evaluate(() => {
    const a = window.__mm.arena; let max = 0, n = 0; const c = document.createElement('canvas'); c.width = c.height = 400; const g = c.getContext('2d');
    for (let i = 0; i < 60; i++) {
      const e = a.spawnEnemy(['ring', 'aimed', 'spiral'][i % 3], 100 + i * 5, 100); if (!e) continue;
      n++; e.cd = 99; e.t = 0.5; a._drawEnemyArt(g, e, { r: 14 }); e.hp = 1; a._hitEnemy(e, 999);
      max = Math.max(max, a._edGhosts.filter((q) => q.active).length);
    }
    return { max, len: a._edGhosts.length, n };
  });
  check(T('60-kill burst never exceeds pool capacity'), burst.max <= 24 && burst.max > 0 && burst.len === 24, JSON.stringify(burst));
  await pg.evaluate(() => window.__mm.arena._edGhosts.forEach((q) => { q.active = false; }));

  // reduce-motion shortens it
  await pg.evaluate(() => { localStorage.setItem('mm-reduce-motion', '1'); }); await pg.waitForTimeout(100);
  await killOne(pg, 'spiral', 150, 150);
  await pg.waitForTimeout(600);
  check(T('reduce-motion: ghost gone after a short fade (<0.6s)'), (await live(pg)) === 0);
  await pg.evaluate(() => { localStorage.setItem('mm-reduce-motion', '0'); window.__mm.arena._edGhosts.forEach((q) => { q.active = false; }); });

  // dark_spider: frost biome aimed only
  const sp = await pg.evaluate(() => {
    const a = window.__mm.arena; const out = {};
    [0, 1, 2].forEach((b) => { a.biome = b; out[b] = ['aimed', 'ring', 'spiral', 'boss'].map((t) => a._enemyNameFor(t)).join(','); });
    a.biome = 0; return out;
  });
  check(T('dark_spider only for aimed in Frost Mire; others fall back to ENEMY_MAP'), sp[0] === 'archer,puffcap,moth,' && sp[1] === 'archer,puffcap,moth,' && sp[2] === 'dark_spider,puffcap,moth,', JSON.stringify(sp));
  check(T('MMArt.enemyArtFor biome-aware with fallback'), await pg.evaluate(() => MMArt.enemyArtFor('aimed', 'frost') === 'dark_spider' && MMArt.enemyArtFor('aimed', 'hollow') === 'archer' && MMArt.enemyArtFor('aimed') === 'archer' && MMArt.enemyArtFor('aimed', '__proto__') === 'archer' && MMArt.enemyArtFor('boss', 'frost') === null));
  const dr = await pg.evaluate(() => {
    const a = window.__mm.arena; const c = document.createElement('canvas'); c.width = c.height = 300; const g = c.getContext('2d');
    const res = {};
    [0, 2].forEach((b) => { a.biome = b; const e = a.spawnEnemy('aimed', 100, 100); e.cd = 99; e.t = 0.5; res[b] = a._drawEnemyArt(g, e, { r: 13 }) && (a._enemyDbg || {}).name; e.active = false; });
    a.biome = 0; return res;
  });
  check(T('aimed draws dark_spider in biome 2, archer in biome 0'), dr[2] === 'dark_spider' && dr[0] === 'archer', JSON.stringify(dr));
  const statsAt = (b) => pg.evaluate((b) => { const a = window.__mm.arena; a.biome = b; const e = a.spawnEnemy('aimed', 50, 50); const s = e.maxHp + ':' + e.r + ':' + (e.spd || e.speed); e.active = false; a.biome = 0; return s; }, b);
  const s2 = await statsAt(2), s0 = await statsAt(0);
  check(T('stats/hitbox unchanged between biomes (art only)'), s2 === s0, s2 + ' vs ' + s0);
  // dark_spider death ghost
  await pg.evaluate(() => { window.__mm.arena.biome = 2; });
  await killOne(pg, 'aimed', 250, 250);
  check(T('dark_spider death ghost'), await pg.evaluate(() => { const q = window.__mm.arena._edGhosts.find((x) => x.active); return !!q && q.name === 'dark_spider'; }));
  await pg.evaluate(() => { window.__mm.arena.biome = 0; window.__mm.arena._edGhosts.forEach((q) => { q.active = false; }); });

  // missing death strip: fallback, no ghost, no throw
  const fb = await pg.evaluate(() => {
    const a = window.__mm.arena; const real = a._enemyArt; a._edGhosts.forEach((q) => { q.active = false; });
    a._enemyArt = { anim: (n, ac, d) => (ac === 'death' ? null : real.anim(n, ac, d)), draw: real.draw.bind(real) };
    const c = document.createElement('canvas'); c.width = c.height = 300; const e = a.spawnEnemy('ring', 100, 100); e.cd = 99; e.t = 0.5; a._drawEnemyArt(c.getContext('2d'), e, { r: 15 });
    e.hp = 1; let threw = false; try { a._hitEnemy(e, 999); a._drawEnemyGhosts(c.getContext('2d')); } catch (x) { threw = true; }
    a._enemyArt = real; return { threw, n: a._edGhosts.filter((q) => q.active).length, dead: !e.active };
  });
  check(T('missing death strip: no ghost, enemy still dies, no throw'), !fb.threw && fb.n === 0 && fb.dead, JSON.stringify(fb));
  // never drawn with art: no ghost
  const na = await pg.evaluate(() => { const a = window.__mm.arena; const e = a.spawnEnemy('ring', 100, 100); e.hp = 1; a._hitEnemy(e, 999); return a._edGhosts.filter((q) => q.active).length; });
  check(T('enemy that was never drawn with art spawns no ghost'), na === 0);
  const noart = await pg.evaluate(() => { const a = window.__mm.arena; const real = a._enemyArt; a.setEnemyArt(null); const e = a.spawnEnemy('ring', 100, 100); e.hp = 1; a._hitEnemy(e, 999); const ok = !e.active && a._edGhosts === null; a.setEnemyArt(real); return ok; });
  check(T('art detached: kill works, no ghosts'), noart);
  await pg.waitForTimeout(300);
  check(T('no console errors'), P.errors.length === 0, P.errors.join(' | '));
  check(T('no 404s'), P.bad.length === 0, P.bad.join(' | '));
  await P.ctx.close();

  const Z = await open(browser, opts, MAZE + '&enemyart=0'); await Z.page.waitForTimeout(800);
  check(T('?enemyart=0: no art, no ghost pool, clean'), await Z.page.evaluate(() => window.__mm.arena._enemyArt === null && !window.__mm.arena._edGhosts) && Z.errors.length === 0);
  await Z.ctx.close();
  await browser.close();
}

(async () => {
  await suite('desktop', { viewport: { width: 1000, height: 700 } });
  await suite('phone 390x844', { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  const browser = await chromium.launch();
  const text = async (u) => { const c = await browser.newContext(); const p = await c.newPage(); const r = await p.goto(ORIGIN + u); const t = await r.text(); await c.close(); return t; };
  const [main, index] = [await text('/game/main.js'), await text('/game/index.html')];
  check('town never references enemy art / death ghosts', !/setEnemyArt|loadEnemies|_edGhosts|dark_spider/.test(main) && !/mm-art/.test(index));
  await browser.close();
  done();
})().catch((e) => { console.error(e); process.exit(1); });
