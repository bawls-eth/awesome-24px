// Classic-arena difficulty: MMDifficulty.waveScale(wave) is applied to each wave's spawns at spawn time (hp, dmg, spd, count, fire);
// ?difficulty=off restores exactly the old numbers. Same style as difficulty-curve.test.js.
// Run: BASE=http://localhost:8440/game/index.html NODE_PATH=$(npm root -g) node game/tests/difficulty-waves.test.js
const { chromium } = require('playwright');
const { check, done } = require('./helpers');
const ORIGIN = (process.env.BASE || 'http://localhost:8440/game/index.html').replace(/\/game\/index\.html.*$/, '');
const PAGE = ORIGIN + '/game/games/mad-maze/index.html';
const SAVE = { realm: { level: 4, xp: 0, shards: 50, bestWave: 2, items: [], nextUid: 1, eq: {} } };

async function open(browser, q, opts, mode) {
  const ctx = await browser.newContext(opts || { viewport: { width: 1000, height: 700 } });
  await ctx.routeWebSocket(/.*/, (ws) => ws.close());
  await ctx.route('**/game/index.html*', (r) => r.fulfill({ contentType: 'text/html', body: '<!doctype html><title>town</title>town' }));
  const page = await ctx.newPage();
  page.errors = [];
  page.on('pageerror', (e) => page.errors.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error') page.errors.push('console: ' + m.text()); });
  await page.goto(ORIGIN + '/game/games/mad-maze/lantern.css');
  await page.evaluate(([v, m]) => { localStorage.clear(); localStorage.setItem('pixeltown-save-v1', v); localStorage.setItem('mm-aim-assist', '0'); if (m) localStorage.setItem('pixeltown-mm-v1', JSON.stringify({ v: 1, heroes: [], stash: [], fame: 0, mode: m, hall: [], migratedFrom: null })); }, [JSON.stringify(SAVE), mode || null]);
  page.errors.length = 0;
  await page.goto(PAGE + '?' + q);
  await page.waitForFunction(() => window.__mm && window.__mm.arena && window.__mm.arena.active, null, { timeout: 15000 });
  return { ctx, page };
}

// Start waves directly and read what spawned (the loop is paused so nothing moves between the calls).
const waves = (page, list) => page.evaluate((ws) => {
  const a = window.__mm.arena; a.paused = true; a.player.iframes = 1e9;
  const out = {};
  for (const w of ws) {
    a.enemies.forEach((e) => { e.active = false; }); a.eBullets.forEach((b) => { b.active = false; });
    a.run.wave = w - 1; a._startWave();
    const es = a.enemies.filter((e) => e.active);
    const old = 1 + 0.15 * Math.max(0, w - 1);
    out[w] = { n: es.length, boss: es.some((e) => e.type === 'boss'),
      hpRatio: es.filter((e) => e.type !== 'boss').map((e) => e.maxHp / Math.ceil(RM_ENEMIES[e.type].hp * old)),
      exactOld: es.filter((e) => e.type !== 'boss').every((e) => e.maxHp === Math.ceil(RM_ENEMIES[e.type].hp * old)),
      dmg: es.map((e) => e.dmgMul), spd: es.map((e) => e.spdMul), fire: es.map((e) => e.fireMul), diff: es.length ? es[0].diff : null,
      bossHp: es.filter((e) => e.type === 'boss').map((e) => e.maxHp) };
  }
  a.enemies.forEach((e) => { e.active = false; });
  return out;
}, list);

(async () => {
  const browser = await chromium.launch();
  const errs = [];

  // ===== difficulty on =====
  const A = await open(browser, 'test=1&seed=7');
  const info = await A.page.evaluate(() => ({ lib: typeof MMDifficulty, mode: window.__mm.arena.mode, world: !!window.__mm.arena.world }));
  check('classic arena with MMDifficulty loaded', info.lib === 'object' && info.mode === 'waves' && !info.world, JSON.stringify(info));
  const on = await waves(A.page, [1, 2, 4, 5, 9, 14, 29]);
  const exp = await A.page.evaluate(() => [1, 2, 4, 9, 14, 29].map((w) => ({ w, sc: MMDifficulty.waveScale(w), n: Math.max(1, Math.min(14, Math.round(Math.min(2 + w, 10) * MMDifficulty.waveScale(w).count))) })));
  console.log('INFO waves:', JSON.stringify(Object.fromEntries(Object.entries(on).map(([w, v]) => [w, { n: v.n, hp: v.hpRatio[0], dmg: v.dmg[0], spd: v.spd[0], fire: v.fire[0] }]))));
  check('each wave spawns waveScale.count x the old count (wave 1: 2 instead of 3, wave 29: 14 instead of 10)', exp.every((x) => on[x.w].n === x.n) && on[1].n === 2 && on[29].n === 14, JSON.stringify(exp.map((x) => [x.w, x.n, on[x.w].n])));
  check('enemy hp = old wave hp x waveScale.hp (wave 1 weaker, wave 29 tougher)', exp.every((x) => on[x.w].hpRatio.every((r) => Math.abs(r - x.sc.hp) < 0.12)) && on[1].hpRatio[0] < 0.8 && on[29].hpRatio[0] > 1.5, JSON.stringify(on[1].hpRatio.concat(on[29].hpRatio)));
  check('dmg, spd and fire multipliers come from waveScale and grow with the wave', exp.every((x) => on[x.w].dmg.every((d) => d === x.sc.dmg) && on[x.w].spd.every((d) => d === x.sc.spd) && on[x.w].fire.every((d) => d === x.sc.fire)) && on[1].dmg[0] < on[9].dmg[0] && on[9].dmg[0] < on[29].dmg[0] && on[1].fire[0] < on[29].fire[0]);
  check('the boss wave scales the boss too (hp x waveScale.hp, records diff)', on[5].boss && on[5].bossHp[0] === Math.ceil(120 * (on[5].diff ? on[5].diff.hp : 0)) && on[5].diff.dmg === on[5].dmg[0], JSON.stringify(on[5]));
  const live = await A.page.evaluate(() => {
    const a = window.__mm.arena; a.paused = true;
    a.enemies.forEach((e) => { e.active = false; }); a.eBullets.forEach((b) => { b.active = false; });
    const sc1 = MMDifficulty.waveScale(1), sc30 = MMDifficulty.waveScale(30);
    // two Whirlers (steady spiral: one bolt per 0.09 s of cooldown): one with wave-1 fire, one with wave-30 fire
    const e1 = a._scaleWaveEnemy(a.spawnEnemy('spiral', 200, 200), sc1); const e2 = a._scaleWaveEnemy(a.spawnEnemy('spiral', 700, 400), sc30);
    e1.cd = 0; e2.cd = 0; a.player.x = 450; a.player.y = 300;
    for (let i = 0; i < 180; i++) a._updateEnemies(1 / 60);
    const near = (e) => a.eBullets.filter((b) => b.active && Math.hypot(b.x - e.x, b.y - e.y) < 900 && (b.x < 450) === (e.x < 450));
    const b1 = near(e1), b2 = near(e2);
    const dm = [b1[0] && b1[0].dm, b2[0] && b2[0].dm];
    a.enemies.forEach((e) => { e.active = false; }); a.eBullets.forEach((b) => { b.active = false; });
    return { n1: b1.length, n2: b2.length, dm, sc1, sc30, bolt1: Math.round(8 * dm[0]), bolt30: Math.round(8 * dm[1]) };
  });
  check('wave-30 Whirler fires about fire30/fire1 x as many bolts as a wave-1 one', live.n2 / live.n1 > (live.sc30.fire / live.sc1.fire) * 0.85 && live.n2 / live.n1 < (live.sc30.fire / live.sc1.fire) * 1.15, JSON.stringify(live));
  check('their bolts carry the wave dmg multiplier (wave 1 bolt 6, wave 30 bolt 11)', live.dm[0] === live.sc1.dmg && live.dm[1] === live.sc30.dmg && live.bolt1 === 6 && live.bolt30 === 11, JSON.stringify(live));
  errs.push(...A.page.errors); await A.ctx.close();

  // ===== ?difficulty=off: exactly the old numbers =====
  const O = await open(browser, 'test=1&seed=7&difficulty=off');
  const off = await waves(O.page, [1, 2, 5, 9, 29]);
  check('?difficulty=off: the old counts (min(2 + wave, 10))', off[1].n === 3 && off[2].n === 4 && off[9].n === 10 && off[29].n === 10, JSON.stringify([off[1].n, off[2].n, off[9].n, off[29].n]));
  check('?difficulty=off: the old hp (ceil(base x (1 + 0.15 (wave - 1)))) and 1x dmg / spd / fire, no diff record', [1, 2, 9, 29].every((w) => off[w].exactOld && off[w].dmg.every((d) => d === 1) && off[w].spd.every((d) => d === 1) && off[w].fire.every((d) => d === 1) && off[w].diff === null));
  check('?difficulty=off: the boss keeps its old hp (120)', off[5].boss && off[5].bossHp[0] === 120 && off[5].diff === null, JSON.stringify(off[5]));
  errs.push(...O.page.errors); await O.ctx.close();

  // ===== picnic (Careful) mode: 0.8x damage, same hp =====
  const PN = await open(browser, 'test=1&seed=7', null, 'picnic');
  const pn = await waves(PN.page, [9]);
  const cl = await PN.page.evaluate(() => MMDifficulty.waveScale(9));
  check('picnic mode: wave damage is 0.8x classic, hp unchanged', Math.abs(pn[9].dmg[0] - Math.round(cl.dmg * 0.8 * 1000) / 1000) < 0.002 && Math.abs(pn[9].diff.hp - cl.hp) < 1e-9, JSON.stringify([pn[9].diff, cl]));
  errs.push(...PN.page.errors); await PN.ctx.close();

  // ===== the world is not touched by the wave curve =====
  const W = await open(browser, 'mode=world&test=1&seed=12345');
  const wsc = await W.page.evaluate(() => { const a = window.__mm.arena; return { sc: a._waveScaleFor(3), mode: a.mode }; });
  check('world mode never uses the wave curve', wsc.sc === null && wsc.mode === 'world', JSON.stringify(wsc));
  errs.push(...W.page.errors); await W.ctx.close();

  check('no console or page errors', errs.length === 0, errs.slice(0, 3).join(' | '));
  await browser.close();
  done();
})();
