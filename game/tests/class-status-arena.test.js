// S9 status wiring: RealmArena.applyStatus(target, id, opts) runs MMStatus; _calcStats / _hitPlayer / the enemy update read its mods;
// weapon bolts apply their `st`; the HUD draws up to 6 cached MMFxDraw icons under the XP bar. The page may not load the modules yet,
// so this test injects any that are missing (like class-weapon-engine.test.js) and also checks the arena without them.
// Run: BASE=http://localhost:8440/game/index.html NODE_PATH=$(npm root -g) node game/tests/class-status-arena.test.js
const { chromium } = require('playwright');
const { check, done } = require('./helpers');
const ORIGIN = (process.env.BASE || 'http://localhost:8440/game/index.html').replace(/\/game\/index\.html.*$/, '');
const MAZE = ORIGIN + '/game/games/mad-maze/index.html?test=1&offline=1';
const MM = 'pixeltown-mm-v1', ACTIVE = 'pixeltown-mm-active-v1';
const hero = (id, cls) => ({ id, name: cls, cls, level: 3, xp: 0, fame: 0, bonus: 0, mode: 'classic', items: [] });
const prof = (heroes) => ({ v: 1, heroes, stash: new Array(16).fill(null), fame: 0, mode: 'classic', hall: [], migratedFrom: null });
const MODS = { 'mm-weapons.js': 'MMWeapons', 'mm-projectile.js': 'MMProjectile', 'mm-fx-draw.js': 'MMFxDraw', 'mm-status.js': 'MMStatus' };

async function open(browser, query, opts, inject) {
  const ctx = await browser.newContext(opts || { viewport: { width: 1000, height: 700 } });
  await ctx.routeWebSocket(/.*/, (ws) => ws.close()); // never reach the live DB
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  await page.goto(ORIGIN + '/game/games/mad-maze/lantern.css');
  await page.evaluate(([k1, p, k2, a]) => { localStorage.clear(); localStorage.setItem(k1, JSON.stringify(p)); localStorage.setItem(k2, a); localStorage.setItem('mm-aim-assist', '0'); },
    [MM, prof([hero('h-f', 'frostcaller')]), ACTIVE, JSON.stringify({ v: 1, heroId: 'h-f' })]);
  errors.length = 0;
  await page.goto(MAZE + (query || ''));
  await page.waitForFunction(() => window.__mm && window.__mm.arena && window.__mm.arena.active);
  if (inject !== false) for (const f of Object.keys(MODS)) if (!(await page.evaluate((g) => typeof window[g] !== 'undefined', MODS[f]))) await page.addScriptTag({ url: ORIGIN + '/game/shared/' + f });
  return { ctx, page, errors };
}
const frames = (page, n) => page.evaluate((k) => new Promise((res) => { let i = 0; const f = () => (++i >= k ? res() : requestAnimationFrame(f)); requestAnimationFrame(f); }), n);

(async () => {
  const browser = await chromium.launch();
  const errs = [];

  // Without the modules: applyStatus is a safe no-op.
  const N = await open(browser, '', null, false); errs.push(...N.errors);
  const none = await N.page.evaluate(() => {
    const a = window.__mm.arena; const d0 = a.stats.dmg;
    const r = typeof MMStatus === 'undefined' ? a.applyStatus('player', 'weak') : 'loaded';
    a._draw();
    return { r, same: a.stats.dmg === d0, icons: a.statusIcons().length };
  });
  check('without mm-status.js applyStatus is a no-op (or the page already loads it)', none.r === false || none.r === 'loaded', JSON.stringify(none));
  check('without mm-status.js the stats and HUD are untouched', none.same && none.icons === 0, JSON.stringify(none));
  await N.ctx.close();

  const A = await open(browser, ''); errs.push(...A.errors);
  const s = await A.page.evaluate(() => {
    const a = window.__mm.arena; a.paused = true; // freeze the loop: the test steps the arena itself
    a.buffDmg = 1; a._calcStats(); const base = a.stats.dmg; const rate0 = a.stats.rate;
    a.buffDmg = 1.3; a._calcStats(); const buff = a.stats.dmg / base;
    a.buffDmg = 1; a._calcStats();
    const w1 = a.applyStatus('player', 'damaging'); const dmgUp = a.stats.dmg / base;
    const w2 = a.applyStatus('player', 'weak'); const both = a.stats.dmg / base;
    a.buffDmg = 1.3; a._calcStats(); const capped = a.stats.dmg / base; a.buffDmg = 1;
    a.player.status = null; a.player._stm = null; a.player._stNext = Infinity; a._calcStats();
    a.applyStatus('player', 'damaging'); a.buffDmg = 1.5; a._calcStats(); const cap16 = a.stats.dmg / base; a.buffDmg = 1;
    a.player.status = null; a.player._stm = null; a.player._stNext = Infinity; a._calcStats();
    a.applyStatus('player', 'dazed'); const rate = a.stats.rate / rate0;
    a.player.status = null; a.player._stm = null; a.player._stNext = Infinity; a._calcStats();
    const restored = a.stats.dmg === base && a.stats.rate === rate0;
    return { buff, w1, w2, dmgUp, both, capped, cap16, rate, restored, unknown: a.applyStatus('player', '__proto__'), bad: a.applyStatus({ hp: 3 }, 'weak') };
  });
  check('(1) buffDmg = 1.3 still gives x1.3', Math.abs(s.buff - 1.3) < 1e-9, JSON.stringify(s));
  check('damaging alone gives x1.25', s.w1 === true && Math.abs(s.dmgUp - 1.25) < 1e-9, JSON.stringify(s));
  check('(2) weak plus damaging gives x0.75 (the negative wins)', s.w2 === true && Math.abs(s.both - 0.75) < 1e-9, JSON.stringify(s));
  check('weak with a 1.3 shrine buff stacks (0.975) and damaging + 1.5 buff is capped at x1.6', Math.abs(s.capped - 0.975) < 1e-9 && Math.abs(s.cap16 - 1.6) < 1e-9, JSON.stringify(s));
  check('dazed slows the fire rate to x0.6, clearing it restores the stats', Math.abs(s.rate - 0.6) < 1e-9 && s.restored, JSON.stringify(s));
  check('unknown ids and foreign targets are rejected', s.unknown === false && s.bad === false);

  // Damage taken through _hitPlayer: armored x0.75, curse x1.1 per stack, ward buff still works alone.
  const tk = await A.page.evaluate(() => {
    const a = window.__mm.arena, p = a.player; const out = {};
    const hit = (d) => { p.hp = 100; p.iframes = 0; a.shield.hits = 0; a._hitPlayer(d); return 100 - p.hp; };
    p.status = null; p._stm = null; out.plain = hit(20);
    a.buffTaken = 0.7; out.ward = hit(20); a.buffTaken = 1;
    a.applyStatus('player', 'armored'); out.armored = hit(20);
    p.status = null; p._stm = null; a.applyStatus('player', 'curse'); a.applyStatus('player', 'curse'); out.curse2 = hit(20);
    a.applyStatus('player', 'armorBroken'); a.extraGuard = 5; a._calcStats(); out.guard0 = a._guarded(20); a.extraGuard = 0; a._calcStats();
    p.status = null; p._stm = null; p._stNext = Infinity; a._calcStats();
    a.extraGuard = 5; a._calcStats(); out.guarded = a._guarded(20); a.extraGuard = 0; a._calcStats();
    return out;
  });
  check('_hitPlayer reads the taken mods: armored 15 of 20, 2 curse stacks 24 of 20, a ward buff alone 14 of 20', tk.plain === 20 && tk.armored === 15 && tk.curse2 === 24 && tk.ward === 14, JSON.stringify(tk));
  check('armorBroken sets guard to 0 (guard 5 normally takes 5 off)', tk.guard0 === 20 && tk.guarded === 15, JSON.stringify(tk));

  // (3) A slowed enemy moves at 0.65 speed over 30 frames; stunned does not move or fire.
  const sl = await A.page.evaluate(() => {
    const a = window.__mm.arena, p = a.player;
    [a.enemies, a.eBullets, a.pBullets].forEach((pool) => pool.forEach((o) => { o.active = false; }));
    p.x = 480; p.y = 300; a.state = 'play'; a.run.wave = 0;
    const e1 = a.spawnEnemy('ring', 100, 100), e2 = a.spawnEnemy('ring', 100, 500), e3 = a.spawnEnemy('ring', 860, 300);
    [e1, e2, e3].forEach((e) => { e.cd = 999; });
    const ok = a.applyStatus(e2, 'slowed'); a.applyStatus(e3, 'stunned');
    const s1 = { x: e1.x, y: e1.y }, s2 = { x: e2.x, y: e2.y }, s3 = { x: e3.x, y: e3.y };
    e3.cd = 0.01;
    for (let i = 0; i < 30; i++) a._updateEnemies(1 / 60);
    const d1 = Math.hypot(e1.x - s1.x, e1.y - s1.y), d2 = Math.hypot(e2.x - s2.x, e2.y - s2.y), d3 = Math.hypot(e3.x - s3.x, e3.y - s3.y);
    const fired = a.eBullets.filter((b) => b.active).length;
    const boss = a.spawnEnemy('boss', 480, 132); const bossStun = a.applyStatus(boss, 'stunned'); const bossSlow = a.applyStatus(boss, 'slowed');
    const bossMods = boss._stm ? boss._stm.speed : null;
    [a.enemies, a.eBullets].forEach((pool) => pool.forEach((o) => { o.active = false; }));
    return { ok, ratio: d2 / d1, d1, d3, fired, list: a.statusOf(e2), bossStun, bossSlow, bossMods };
  });
  check('(3) a slowed enemy moves at 0.65 speed over 30 frames', sl.ok && Math.abs(sl.ratio - 0.65) < 0.01 && sl.d1 > 10, JSON.stringify(sl));
  check('a stunned enemy neither moves nor fires', sl.d3 === 0 && sl.fired === 0, JSON.stringify(sl));
  check('bosses are immune to stun and slowed to x0.85', sl.bossStun === false && sl.bossSlow === true && Math.abs(sl.bossMods - 0.85) < 1e-9, JSON.stringify(sl));
  check('statusOf lists the effect with its time left', sl.list.length === 1 && sl.list[0].id === 'slowed' && sl.list[0].left > 1.9, JSON.stringify(sl.list));

  // Weapon bolt `st`: a Frost Shard bolt (chance forced to 1) slows what it hits.
  const st = await A.page.evaluate(() => {
    const a = window.__mm.arena, p = a.player;
    [a.enemies, a.eBullets, a.pBullets].forEach((pool) => pool.forEach((o) => { o.active = false; }));
    p.x = 200; p.y = 300; p.aim = 0;
    const spec = Object.assign({}, MMWeapons.resolve('frostcaller', 'wand_frostshard', 0), { onHit: { status: 'slowed', chance: 1, sec: 1.5 } });
    const on = a.setHeroWeapon(spec);
    const e = a.spawnEnemy('ring', 300, 300); e.cd = 999; e.spdMul = 0; e.hp = e.maxHp = 500;
    a._firePlayerVolley(0); const stIdx = (a.pBullets.find((b) => b.active) || {}).st;
    for (let i = 0; i < 30; i++) a._updateBullets(1 / 60);
    const got = a.statusOf(e);
    a.setHeroWeapon(null); [a.enemies, a.pBullets].forEach((pool) => pool.forEach((o) => { o.active = false; }));
    return { on, stIdx, got, hit: e.hp < 500 };
  });
  check('a wand_frostshard bolt carries st = slowed (index 1) and applies it on hit', st.on && st.stIdx === 1 && st.hit && st.got.length === 1 && st.got[0].id === 'slowed' && Math.abs(st.got[0].left - 1.5) < 0.05, JSON.stringify(st));

  // Duels stay plain.
  const pvp = await A.page.evaluate(() => { const a = window.__mm.arena; const keep = a.team; a.team = { isPvp: true, ev() {} }; const r = a.applyStatus('player', 'weak'); a.team = keep; return r; });
  check('a duel ignores statuses', pvp === false);

  // (4) HUD icons: drawn at 22-26 px (24 px since PLAYTEST-REVIEW-2 #11 / FO2), at most 6, under the XP bar; expiry clears them and restores the stats.
  const hud = await A.page.evaluate(async () => {
    const a = window.__mm.arena, p = a.player;
    p.status = null; p._stm = null; p._stNext = Infinity; a._calcStats(); const base = a.stats.dmg;
    p.iframes = 1e9; a._hitPlayer = () => {}; a.paused = false;
    ['weak', 'slowed', 'curse', 'swift', 'armored', 'inspired', 'healing', 'berserk'].forEach((id) => a.applyStatus('player', id, { sec: id === 'weak' ? 0.4 : 30 }));
    for (let i = 0; i < 3; i++) await new Promise((r) => requestAnimationFrame(r));
    const icons = a.statusIcons();
    const cv = a.canvas; const g = cv.getContext('2d'); const cr = cv.getBoundingClientRect(); const sc = cv.width / cr.width;
    const ic = icons[0]; const px = ic ? g.getImageData(Math.floor((ic.x - cr.left + ic.size / 2) * sc), Math.floor((ic.y - cr.top + ic.size / 2) * sc), 1, 1).data : [0, 0, 0, 0];
    const rect = (id) => { const el = document.getElementById(id); if (!el || el.classList.contains('hidden') || !el.getClientRects().length) return null; const r = el.getBoundingClientRect(); return { l: r.left, t: r.top, r: r.right, b: r.bottom }; };
    const hpR = rect('realm-hp'), xpR = rect('realm-xp');
    const cache0 = a._stCache ? a._stCache.size() : 0;
    for (let i = 0; i < 5; i++) await new Promise((r) => requestAnimationFrame(r));
    const firstNeg = icons.length ? icons[0].neg : null;
    await new Promise((r) => setTimeout(r, 700));
    const after = a.statusOf('player').map((x) => x.id); const dmgAfter = a.stats.dmg / base;
    a.paused = true;
    return { icons, px: Array.from(px), hpR, xpR, cache0, firstNeg, after, dmgAfter };
  });
  const over = (ic, r) => r && ic.x < r.r && ic.x + ic.size > r.l && ic.y < r.b && ic.y + ic.size > r.t;
  check('(4) icons are drawn at 22-26 px (PT2 #11: 24 px), at most 6, negatives first', hud.icons.length === 6 && hud.icons.every((i) => i.size >= 22 && i.size <= 26) && hud.firstNeg === true, JSON.stringify(hud.icons));
  check('the icon is really on the canvas (opaque pixel at its centre)', hud.px[3] > 200, JSON.stringify(hud.px));
  check('icons sit under the XP bar and overlap neither the HP nor the XP bar', hud.icons.every((i) => !over(i, hud.hpR) && !over(i, hud.xpR)) && (!hud.xpR || hud.icons[0].y >= hud.xpR.b), JSON.stringify({ i: hud.icons[0], hp: hud.hpR, xp: hud.xpR }));
  check('a 0.4 s weak expires on its own and the damage multiplier comes back', hud.after.indexOf('weak') < 0 && hud.after.length === 6 && Math.abs(hud.dmgAfter - 1) < 1e-9, JSON.stringify(hud));
  await A.ctx.close();

  // Phone 390x844, world mode: the icon row avoids the HP bar, the XP bar and the minimap; no horizontal scroll.
  const PH = await open(browser, '&mode=world&seed=12345', { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true }); errs.push(...PH.errors);
  await PH.page.waitForFunction(() => window.__mm.arena.state === 'play');
  const ph = await PH.page.evaluate(async () => {
    const a = window.__mm.arena; a.player.iframes = 1e9; a._hitPlayer = () => {};
    ['weak', 'slowed', 'curse', 'swift', 'armored', 'inspired'].forEach((id) => a.applyStatus('player', id, { sec: 30 }));
    for (let i = 0; i < 4; i++) await new Promise((r) => requestAnimationFrame(r));
    const rect = (id) => { const el = document.getElementById(id); if (!el || el.classList.contains('hidden') || !el.getClientRects().length) return null; const r = el.getBoundingClientRect(); return { l: r.left, t: r.top, r: r.right, b: r.bottom }; };
    return { icons: a.statusIcons(), hp: rect('realm-hp'), xp: rect('realm-xp'), mini: rect('rw-minimap'), zone: rect('rw-zone'), scroll: document.documentElement.scrollWidth <= window.innerWidth + 1, vw: window.innerWidth };
  });
  check('phone: 6 icons drawn inside the screen', ph.icons.length === 6 && ph.icons.every((i) => i.x >= 0 && i.x + i.size <= ph.vw), JSON.stringify(ph.icons));
  check('phone: icons overlap neither the HP bar, the XP bar nor the minimap', ph.icons.every((i) => !over(i, ph.hp) && !over(i, ph.xp) && !over(i, ph.mini) && !over(i, ph.zone)), JSON.stringify(ph));
  check('phone: no horizontal scroll', ph.scroll);
  await PH.ctx.close();

  check('no console or page errors', errs.length === 0, errs.slice(0, 3).join(' | '));
  await browser.close();
  done();
})();
