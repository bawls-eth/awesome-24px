// Bolt art (b16 class bolts + hit sparks, b17 enemy bullets) in the standalone Mad Maze arena; ?boltart=0 keeps the code-drawn bolts.
// Run: BASE=http://localhost:8581/game/index.html NODE_PATH=$(npm root -g) node game/tests/bolt-art.test.js
const { chromium } = require('playwright');
const { check, done } = require('./helpers');
const ORIGIN = (process.env.BASE || 'http://localhost:8440/game/index.html').replace(/\/game\/index\.html.*$/, '');
const MAZE = ORIGIN + '/game/games/mad-maze/index.html?test=1&offline=1';
const MM = 'pixeltown-mm-v1', ACTIVE = 'pixeltown-mm-active-v1';
const hero = (id, cls) => ({ id, name: cls, cls, level: 3, xp: 0, fame: 0, bonus: 0, mode: 'classic', items: [] });
const prof = (heroes) => ({ v: 1, heroes, stash: new Array(16).fill(null), fame: 0, mode: 'classic', hall: [], migratedFrom: null });

async function open(browser, cls, query, opts) {
  const ctx = await browser.newContext(opts || { viewport: { width: 1000, height: 700 } });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  await page.goto(ORIGIN + '/game/games/mad-maze/lantern.css');
  await page.evaluate(([k1, p, k2, a]) => { localStorage.setItem(k1, JSON.stringify(p)); localStorage.setItem(k2, a); }, [MM, prof([hero('h-' + cls, cls)]), ACTIVE, JSON.stringify({ v: 1, heroId: 'h-' + cls })]);
  errors.length = 0;
  await page.goto(MAZE + (query || ''));
  await page.waitForFunction(() => window.__mm && window.__mm.arena);
  return { ctx, page, errors };
}
// Quiet arena in play state.
const prep = (page) => page.evaluate(() => {
  const a = window.__mm.arena;
  a.state = 'play'; a.run.wave = 0; a.paused = false; a.down = false;
  [a.enemies, a.eBullets, a.pBullets].forEach((pool) => pool.forEach((o) => { o.active = false; }));
  const p = a.player; p.x = 300; p.y = 350; p.aim = 0; p.hp = a.stats.maxHp; p.iframes = 0;
  return true;
});

(async () => {
  const browser = await chromium.launch();
  const errs = [];
  const R = await open(browser, 'ranger'); errs.push(...R.errors);
  await R.page.waitForFunction(() => window.__mm.arena._boltArt, null, { timeout: 8000 }).catch(() => {});
  await prep(R.page);
  const st = await R.page.evaluate(() => { const a = window.__mm.arena; return { on: !!a._boltArt, cls: a._boltCls, id: a._boltPlayerId(), ids: a._boltArt ? a._boltArt.ids().length : 0 }; });
  check('bolt art loads: class bolt id for the active ranger, all b16/b17 strips present', st.on && st.cls === 'ranger' && st.id === 'bolt_ranger' && st.ids >= 29, JSON.stringify(st));

  const d0 = await R.page.evaluate(() => { const a = window.__mm.arena; a.pBullets.forEach((b) => { b.active = false; }); const d = a.boltArtDraws(); for (let i = 0; i < 4; i++) a.firePlayerBulletFrom(a.player.x, a.player.y, i * 0.5, 1, 0); a._draw(); return d; });
  const d1 = await R.page.evaluate(() => window.__mm.arena.boltArtDraws());
  check('player bolt frame is drawn from art (counter rises)', d1 - d0 >= 4, d0 + ' -> ' + d1);

  const sel = await R.page.evaluate(() => {
    const a = window.__mm.arena, out = {};
    a._curE = null; out.aimed = a._ebSelect(0); out.spiral = a._ebSelect(1); out.ring = a._ebSelect(2);
    a._curE = { type: 'boss' }; out.boss = a._ebSelect(0);
    a._curE = { type: 'aimed', art: 'ice_wraith' }; out.ice = a._ebSelect(0);
    a._curE = { type: 'aimed', art: 'fire_elemental' }; out.fire = a._ebSelect(0);
    a._curE = { type: 'aimed', art: 'dark_spider' }; out.spider = a._ebSelect(0);
    a._curE = { type: 'aimed', art: 'skeleton' }; out.skel = a._ebSelect(0);
    a._curE = { type: 'aimed', art: 'archer' }; out.archer = a._ebSelect(0);
    a._curE = null;
    return out;
  });
  check('enemy bullet art by pattern: aimed red, spiral purple, ring pulse, boss fan shard', sel.aimed === 'ebolt_orb_red' && sel.spiral === 'ebolt_orb_purple' && sel.ring === 'ebolt_ring_pulse' && sel.boss === 'ebolt_shard', JSON.stringify(sel));
  check('enemy bullet art by creature: ice, fire, spider (poison), skeleton, archer (arrow)', sel.ice === 'ebolt_frost' && sel.fire === 'ebolt_fire' && sel.spider === 'ebolt_poison' && sel.skel === 'ebolt_skull' && sel.archer === 'ebolt_arrow', JSON.stringify(sel));
  const eb = await R.page.evaluate(() => {
    const a = window.__mm.arena; a.fireEnemyBullet(100, 100, 0, 0, 1); a.fireEnemyBullet(120, 100, 0, 0, 2); a.fireEnemyBullet(140, 100, 0, 0, 0);
    const kinds = a.eBullets.filter((b) => b.active).map((b) => b.ea);
    const e0 = a.boltArtStats().enemy; a._draw(); const e1 = a.boltArtStats().enemy;
    return { kinds, drawn: e1 - e0, cap: a._ebDrawn <= 320 };
  });
  check('fired enemy bullets carry their art id and are drawn from art, within the 320 cap', eb.kinds.join() === 'ebolt_orb_purple,ebolt_ring_pulse,ebolt_orb_red' && eb.drawn >= 3 && eb.cap, JSON.stringify(eb));

  await prep(R.page);
  const hs = await R.page.evaluate(() => {
    const a = window.__mm.arena, p = a.player;
    const e = a.spawnEnemy('ring', p.x + 80, p.y); e.cd = 999; e.spdMul = 0; e.hp = 99; e.maxHp = 99;
    a.firePlayerBulletFrom(p.x, p.y, 0, 1, 0);
    for (let i = 0; i < 30; i++) { a._update(1 / 60); a._draw(); }
    const s1 = a.boltArtStats();
    for (let i = 0; i < 60; i++) { a._spawnSpark({ x: 100 + i, y: 100, ws: null }); }
    const live = a.boltArtStats().sparksLive;
    a._draw();
    return { s1, live, id: a._sparks.find((q) => q.active).id };
  });
  check('a hit spawns a pooled spark that was drawn from art', hs.s1.sparkSpawned >= 1 && hs.s1.sparkDraws >= 1, JSON.stringify(hs.s1));
  check('live sparks are capped at 24 (60 spawns)', hs.live === 24 && /^hit_spark_[abc]$/.test(hs.id), JSON.stringify(hs));
  const life = await R.page.evaluate(() => { const a = window.__mm.arena; for (let i = 0; i < 30; i++) a._update(1 / 60); return a.boltArtStats().sparksLive; });
  check('sparks expire after ~0.25 s', life === 0, String(life));

  const red = await R.page.evaluate(() => {
    const a = window.__mm.arena, keep = a._readReduced; a._readReduced = () => {}; a._reduced = true;
    a._spawnSpark({ x: 200, y: 200, ws: null }); a._sparks.forEach((q) => { if (q.active) q.t = 0.1; });
    const f0 = a._boltFrame(); const d0 = a.boltArtStats().sparkDraws; a._draw();
    const out = { f0, drew: a.boltArtStats().sparkDraws - d0, alpha: a.ctx ? a.ctx.globalAlpha : 1 };
    a._reduced = false; a._readReduced = keep; a._sparks.forEach((q) => { q.active = false; });
    return out;
  });
  check('reduce-motion: bolt frame fixed at 0 and the spark still draws (single-frame fade)', red.f0 === 0 && red.drew >= 1, JSON.stringify(red));

  await prep(R.page);
  const cv = await R.page.evaluate(() => {
    const a = window.__mm.arena; let n = 0; const orig = document.createElement.bind(document);
    const volley = () => { for (let k = 0; k < 16; k++) { a.firePlayerBulletFrom(a.player.x, a.player.y, k * Math.PI / 8, 1, 0); a.fireEnemyBullet(300, 120, k * Math.PI / 8, 0, k % 3); } };
    for (let i = 0; i < 90; i++) { if (i % 15 === 0) volley(); a._update(1 / 60); a._draw(); }
    document.createElement = (t, o) => { if (String(t).toLowerCase() === 'canvas') n++; return orig(t, o); };
    for (let i = 0; i < 120; i++) { if (i % 15 === 0) volley(); a._update(1 / 60); a._draw(); }
    document.createElement = orig;
    return n;
  });
  check('no canvas allocated across 120 frames of bolts (after warm-up)', cv === 0, String(cv));
  await R.ctx.close();

  const Off = await open(browser, 'ranger', '&boltart=0'); errs.push(...Off.errors);
  await Off.page.waitForTimeout(1500); await prep(Off.page);
  const off = await Off.page.evaluate(() => { const a = window.__mm.arena; for (let i = 0; i < 3; i++) a.firePlayerBulletFrom(a.player.x, a.player.y, i * 0.4, 1, 0); a.fireEnemyBullet(100, 100, 0, 0, 0); for (let i = 0; i < 20; i++) { a._update(1 / 60); a._draw(); } return { on: !!a._boltArt, st: a.boltArtStats(), ea: a.eBullets.some((b) => b.ea) }; });
  check('?boltart=0: no art draws, no art id on bullets, no sparks', !off.on && off.st.player === 0 && off.st.enemy === 0 && off.st.sparkSpawned === 0 && !off.ea, JSON.stringify(off));
  await Off.ctx.close();

  const Un = await open(browser, 'bruiser'); errs.push(...Un.errors);
  await Un.page.waitForFunction(() => window.__mm.arena._boltArt, null, { timeout: 8000 }).catch(() => {});
  const fb = await Un.page.evaluate(() => { const a = window.__mm.arena; a.state = 'play'; a.setBoltClass('mage_missing'); a.pBullets.forEach((b) => { b.active = false; }); a.firePlayerBulletFrom(a.player.x, a.player.y, 0, 1, 0); const d = a.boltArtDraws(); a._draw(); return a.boltArtDraws() - d; });
  check('missing class art falls back silently (0 art draws)', fb === 0);
  await Un.ctx.close();

  const ph = await open(browser, 'ranger', '', { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true }); errs.push(...ph.errors);
  check('390x844 phone: no horizontal scroll', await ph.page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth));
  await ph.ctx.close();

  check('no console errors', errs.length === 0, errs.join(' | '));
  await browser.close();
  done();
})();
