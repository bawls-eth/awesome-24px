// One-shot effect art (b18) in the standalone Mad Maze arena: pooled sprites, cap 16, ?fxart=0, reduce-motion, no canvas allocation.
// Run: BASE=http://localhost:8601/game/index.html NODE_PATH=$(npm root -g) node game/tests/fx-art.test.js
const { chromium } = require('playwright');
const { check, done } = require('./helpers');
const ORIGIN = (process.env.BASE || 'http://localhost:8440/game/index.html').replace(/\/game\/index\.html.*$/, '');
const MAZE = ORIGIN + '/game/games/mad-maze/index.html?test=1&offline=1';
const MM = 'pixeltown-mm-v1', ACTIVE = 'pixeltown-mm-active-v1';
const hero = (id, cls) => ({ id, name: cls, cls, level: 3, xp: 0, fame: 0, bonus: 0, mode: 'classic', items: [] });
const prof = (heroes) => ({ v: 1, heroes, stash: new Array(16).fill(null), fame: 0, mode: 'classic', hall: [], migratedFrom: null });

async function open(browser, cls, query) {
  const ctx = await browser.newContext({ viewport: { width: 1000, height: 700 } });
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
  await R.page.waitForFunction(() => window.__mm.arena._fx, null, { timeout: 8000 }).catch(() => {});
  await prep(R.page);
  const st = await R.page.evaluate(() => { const a = window.__mm.arena; return { on: !!a._fx, ids: a._fx ? a._fx.ids().length : 0, lv: a._fx && a._fx.has('fx_levelup') }; });
  check('fx art loads: all 21 b18 effects present', st.on && st.ids >= 21 && st.lv, JSON.stringify(st));

  const lv = await R.page.evaluate(() => {
    const a = window.__mm.arena, rec = [];
    const proto = CanvasRenderingContext2D.prototype, orig = proto.drawImage;
    proto.drawImage = function (img, ...r) { if (r.length === 8 && img && img.src && /fx_levelup/.test(img.src)) rec.push(r[0]); return orig.call(this, img, ...r); };
    const d0 = a.fxDraws(); a._levelUp();
    for (let i = 0; i < 40; i++) { a._update(1 / 60); a._draw(); }
    proto.drawImage = orig;
    return { drew: a.fxDraws() - d0, frames: Array.from(new Set(rec)).length, live: a.fxLive() };
  });
  check('level up plays fx_levelup frames (counter rises, several distinct frames, then ends)', lv.drew >= 4 && lv.frames >= 4 && lv.live === 0, JSON.stringify(lv));

  const ev = await R.page.evaluate(() => {
    const a = window.__mm.arena, p = a.player, seen = new Set();
    const keep = a.fxPlay.bind(a); a.fxPlay = (id, ...r) => { seen.add(id); return keep(id, ...r); };
    a.abilityCd = [0, 0, 0, 0]; a.save.level = Math.max(a.save.level, 10); a.cast(0); a.cast(1); a.cast(2);
    const e = a.spawnEnemy('aimed', p.x + 60, p.y); e.hp = 1; a._hitEnemy(e, 99);
    a.dropBag(p.x + 30, p.y, 0); p.hp = 1; a._sigHeal(5);
    a.fxPlay = keep;
    return Array.from(seen);
  });
  check('dash, nova, shield, enemy death, loot bag and heal each request their effect', ['fx_dash_trail', 'fx_slam_ring', 'fx_shield_up', 'fx_poof_death', 'fx_loot_spawn', 'fx_heal_pulse'].every((k) => ev.includes(k)), ev.join());

  const cap = await R.page.evaluate(() => { const a = window.__mm.arena; let max = 0; for (let i = 0; i < 60; i++) { a.fxPlay('fx_explosion_big', 100 + i * 4, 200); max = Math.max(max, a.fxLive()); } return max; });
  check('live effects are capped at 16 (60 plays)', cap === 16, String(cap));

  const red = await R.page.evaluate(() => {
    const a = window.__mm.arena, keep = a._readReduced, keepF = a._readReducedFrame; a._readReduced = () => {}; a._readReducedFrame = () => {}; a._reduced = true; // L-18: the per-frame read is _readReducedFrame now; freeze both
    a._fxPool.forEach((q) => { q.active = false; });
    const rec = [], proto = CanvasRenderingContext2D.prototype, orig = proto.drawImage;
    proto.drawImage = function (img, ...r) { if (r.length === 8 && img && img.src && /fx_levelup/.test(img.src)) rec.push(r[0]); return orig.call(this, img, ...r); };
    a.fxPlay('fx_levelup', a.player.x, a.player.y, { follow: true });
    for (let i = 0; i < 30; i++) { a._update(1 / 60); a._draw(); }
    proto.drawImage = orig; a._reduced = false; a._readReduced = keep; a._readReducedFrame = keepF;
    return { distinct: Array.from(new Set(rec)).length, n: rec.length };
  });
  check('reduce-motion: a single frame (fading), still drawn', red.distinct === 1 && red.n >= 3, JSON.stringify(red));

  await prep(R.page);
  const cv = await R.page.evaluate(() => {
    const a = window.__mm.arena; let n = 0; const orig = document.createElement.bind(document);
    document.createElement = (t, o) => { if (String(t).toLowerCase() === 'canvas') n++; return orig(t, o); };
    for (let i = 0; i < 120; i++) { if (i % 10 === 0) { a.fxPlay('fx_levelup', 300, 300, { follow: true }); a.fxPlay('fx_explosion_small', 200, 200); } a._update(1 / 60); a._draw(); }
    document.createElement = orig;
    return n;
  });
  check('no canvas allocated across 120 frames of effects', cv === 0, String(cv));
  await R.ctx.close();

  const Off = await open(browser, 'ranger', '&fxart=0'); errs.push(...Off.errors);
  await Off.page.waitForTimeout(1500); await prep(Off.page);
  const off = await Off.page.evaluate(() => { const a = window.__mm.arena; a._levelUp(); a.cast(0); for (let i = 0; i < 30; i++) { a._update(1 / 60); a._draw(); } return { on: !!a._fx, draws: a.fxDraws() }; });
  check('?fxart=0: zero effect draws', !off.on && off.draws === 0, JSON.stringify(off));
  await Off.ctx.close();

  check('no console errors', errs.length === 0, errs.join(' | '));
  await browser.close();
  done();
})();
