// B7 (BIOME-ARCH-PLAN 2.4): the optional arena hooks a world page may pass to arena.setWorld (enemyStep, onLethal, drawEnemy, drawMid,
// heroLift, dashMul), the per-enemy hit radius e.rad (_er), and the public helpers damageEnemy (clamped to 1e6) and tgFor (TG3 telegraphs).
// Every hook is null by default, so the Town, duels, co-op and the Realm are unchanged. Driven on the Mad Maze world page through
// window.__mm.arena with the real-time loop frozen (fixed-dt _update). Offline: blockDb, town page stubbed, no chat, no DB writes.
// Run: BASE=http://localhost:8440/game/index.html NODE_PATH=$(npm root -g) node game/tests/arena-world-hooks.test.js
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');
const { check, done, blockDb } = require('./helpers');
const ORIGIN = (process.env.BASE || 'http://localhost:8440/game/index.html').replace(/\/game\/index\.html.*$/, '');
const WORLD = ORIGIN + '/game/games/mad-maze/index.html?mode=world&test=1&offline=1&seed=12345';
const SAVE = { realm: { level: 4, xp: 0, shards: 50, bestWave: 2, items: [{ n: 1, id: 'sparkwand', r: 0 }], nextUid: 2, eq: { weapon: 1 } } };
const HOOKS = ['enemyStep', 'onLethal', 'drawEnemy', 'drawMid', 'heroLift', 'dashMul'];

// In-page helpers (strings, evaluated in the page): install hooks on the current world, one lone enemy, fixed-dt steps.
const LIB = `(() => {
  const a = window.__mm.arena;
  const T = window.__b7 = { a, calls: { step: 0, lethal: 0, mid: 0, drawE: 0 }, step: null, lethal: null, drawE: null, lift: 0, dash: 1, fired: 0, target: null };
  T.hook = () => { const w = a.world; a.setWorld(Object.assign({}, w, { solidAt: a._solidAt, shotSolidAt: a._shotSolidAt,
    enemyStep: (e, dt, p) => { T.calls.step++; return T.step ? T.step(e, dt, p) : false; },
    onLethal: (e, dmg) => { T.calls.lethal++; return T.lethal ? T.lethal(e, dmg) : false; },
    drawEnemy: (g, e) => { T.calls.drawE++; return T.drawE ? T.drawE(g, e) : false; },
    drawMid: () => { T.calls.mid++; }, heroLift: () => T.lift, dashMul: () => T.dash })); };
  T.unhook = () => { const w = a.world; const o = Object.assign({}, w, { solidAt: a._solidAt, shotSolidAt: a._shotSolidAt });
    ${JSON.stringify(HOOKS)}.forEach((k) => { delete o[k]; }); a.setWorld(o); };
  const fire0 = a.fireEnemyBullet.bind(a);
  a.fireEnemyBullet = function () { if (a._curE && a._curE === T.target) T.fired++; return fire0.apply(null, arguments); };
  T.clear = () => { a.enemies.forEach((q) => { q.active = false; }); a.eBullets.forEach((b) => { b.active = false; }); a.pBullets.forEach((b) => { b.active = false; }); };
  T.lone = (type, dx, dy) => { T.clear(); const p = a.player; const e = a.spawnEnemy(type, p.x + dx, p.y + dy); e.tier = 0; e.zone = 0; T.target = e; T.fired = 0; a._camStep(-1); return e; };
  T.run = (n) => { for (let i = 0; i < n; i++) { a.enemies.forEach((q) => { if (q !== T.target && q.active) q.active = false; }); a._update(1 / 60); } };
  T.bags = () => a.bags.filter((b) => b.active).length;
  return true;
})()`;

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1000, height: 700 } });
  const db = await blockDb(ctx);
  await ctx.route('**/game/index.html*', (r) => r.fulfill({ contentType: 'text/html', body: '<!doctype html><title>town</title>town' }));
  await ctx.route('**/hub/index.html*', (r) => r.fulfill({ contentType: 'text/html', body: '<!doctype html><title>hub</title>hub' }));
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  await page.goto(ORIGIN + '/game/games/mad-maze/lantern.css');
  await page.evaluate((v) => { localStorage.clear(); localStorage.setItem('pixeltown-save-v1', v); localStorage.setItem('mm-aim-assist', '0'); localStorage.setItem('mm-reduce-motion', '0'); }, JSON.stringify(SAVE));
  errors.length = 0;
  await page.goto(WORLD);
  await page.waitForFunction(() => window.__mm && window.__mm.world && window.__mm.arena && window.__mm.arena.active && window.__mm.arena.state === 'play', null, { timeout: 15000 });
  await page.evaluate(() => { const a = window.__mm.arena; a.active = false; cancelAnimationFrame(a._raf); a.paused = false; a.player.iframes = 1e9; a._hitPlayer = () => {}; });
  await page.evaluate(LIB);
  const E = (fn) => page.evaluate(`(${fn})(window.__b7, window.__b7.a)`);

  // 1. no hooks by default: every B7 hook is null on the page's own world; the default AI still runs (the other suites are run separately)
  const d = await E(`(T, a) => { const out = { hooks: ${JSON.stringify(HOOKS)}.map((k) => a.world[k]) };
    const e = T.lone('aimed', 160, 0); e.cd = 0; e.cre = {}; const x0 = e.x; T.run(60); out.moved = Math.hypot(e.x - x0, 0) + Math.abs(e.y - a.player.y); out.fired = T.fired;
    out.fresh = (() => { const f = a.spawnEnemy('ring', a.player.x, a.player.y + 200); const r = { rad: f.rad, cre: f.cre, tame: f.tame }; f.active = false; return r; })();
    out.er = [a._er({ type: 'aimed', rad: 0 }), a._er({ type: 'boss' }), a._er({ type: 'ring', rad: 30 })];
    return out; }`);
  check('no hooks by default: all six world hooks are null, a tagged creature still runs the built-in AI (moves, fires), spawnEnemy resets rad/cre/tame, _er falls back to the type radius',
    d.hooks.every((h) => h === null) && d.moved > 1 && d.fired > 0 && d.fresh.rad === 0 && d.fresh.cre === null && d.fresh.tame === null && d.er.join() === '13,34,30', JSON.stringify(d));

  // 2. enemyStep -> true: the creature holds still for 60 frames and fires 0 bolts; a plain (untagged) enemy is never handed to the hook
  const s = await E(`(T, a) => { T.hook(); T.step = () => true;
    const e = T.lone('aimed', 160, 0); e.cd = 0; e.cre = { sp: 'raptor' }; const x0 = e.x; const y0 = e.y; T.calls.step = 0;
    T.run(60); const held = { dx: e.x - x0, dy: e.y - y0, fired: T.fired, calls: T.calls.step, live: a.eBullets.filter((b) => b.active).length };
    const f = T.lone('aimed', 160, 0); f.cd = 0; T.calls.step = 0; const fx0 = f.x; T.run(60);
    const plain = { calls: T.calls.step, fired: T.fired, moved: Math.abs(f.x - fx0) + Math.abs(f.y - a.player.y) };
    T.step = null; return { held, plain }; }`);
  check('enemyStep returning true: a creature holds its position for 60 frames and fires 0 bolts (the hook ran every frame); an untagged enemy skips the hook and acts as before',
    s.held.dx === 0 && s.held.dy === 0 && s.held.fired === 0 && s.held.live === 0 && s.held.calls === 60 && s.plain.calls === 0 && s.plain.fired > 0 && s.plain.moved > 1, JSON.stringify(s));

  // 3. onLethal -> true: knocked out at 1 hp, save.kills / run.kills / kb / shards unchanged, no bag; bolt, DOT and _sigAoe paths
  const k = await E(`(T, a) => { T.hook(); const seen = []; T.lethal = (e, dmg) => { seen.push(Math.round(dmg * 10) / 10); return !!e.cre; }; T.step = () => true;
    const snap = () => JSON.stringify([a.save.kills, a.run.kills, a.save.shards, a.run.shards, a.save.kb, T.bags()]);
    const out = {}; const before = snap();
    let e = T.lone('aimed', 60, 0); e.cre = {}; e.hp = 1; a.player.aim = 0; a.firePlayerBullet(0); let n = 0; while (n < 60 && a.pBullets.some((b) => b.active)) { T.run(1); n++; }
    out.bolt = { active: e.active, hp: e.hp, frames: n };
    e = T.lone('ring', 200, 0); e.cre = {}; e.hp = 1; a.applyStatus(e, 'bleed', { stacks: 3, sec: 3 }); T.run(60);
    out.dot = { active: e.active, hp: e.hp, status: !!e.status };
    e = T.lone('spiral', 120, 40); e.cre = {}; e.hp = 1; a._sigAoe(e.x, e.y, 30, 999, 0, 1, 0);
    out.aoe = { active: e.active, hp: e.hp };
    out.same = snap() === before; out.seen = seen.length; out.snap = snap();
    e = T.lone('aimed', 200, 0); e.hp = 1; a._sigAoe(e.x, e.y, 30, 999, 0, 1, 0); out.plainDied = !e.active && a.save.kills === JSON.parse(before)[0] + 1;
    T.lethal = null; T.step = null; return out; }`);
  check('onLethal returning true: the creature keeps 1 HP and stays active on the bolt, DOT (bleed) and _sigAoe paths; save.kills, kb, shards unchanged and no bag drops',
    k.bolt.active && k.bolt.hp === 1 && k.dot.active && k.dot.hp === 1 && k.dot.status && k.aoe.active && k.aoe.hp === 1 && k.same && k.seen >= 3, JSON.stringify(k));
  check('onLethal returning false (an untagged enemy) kills as before (save.kills +1)', k.plainDied, JSON.stringify(k));

  // 4. per-creature hitbox: e.rad = 30 is hit at 28 px; a plain Sniper (13 + 5) is not; the telegraph ring and _sigAoe use it too
  const h = await E(`(T, a) => { const out = {};
    let e = T.lone('aimed', 200, 0); e.rad = 30; a._buildHash(); const ie = a.enemies.indexOf(e); out.big = a._boltHitIndex(e.x + 28, e.y) === ie; out.bigUp = a._boltHitIndex(e.x, e.y - 28) === ie;
    e.hp = e.maxHp = 1e6; const hp0 = e.hp; a._sigAoe(e.x + 50, e.y, 25, 5, 0, 1, 0); out.aoeBig = e.hp < hp0;
    e = T.lone('aimed', 200, 0); a._buildHash(); out.plain = a._boltHitIndex(e.x + 28, e.y); out.plainNear = a._boltHitIndex(e.x + 16, e.y) === a.enemies.indexOf(e);
    e.hp = e.maxHp = 1e6; a._sigAoe(e.x + 50, e.y, 25, 5, 0, 1, 0); out.aoePlain = e.hp === 1e6;
    e = T.lone('aimed', 200, 0); e.rad = 30; e.hp = e.maxHp = 1e6; e.cd = 9; a.firePlayerBulletFrom(e.x + 28, e.y + 60, -Math.PI / 2, 1, null); let n = 0; while (n < 30 && a.pBullets.some((b) => b.active)) { T.run(1); n++; } out.realBolt = e.hp < 1e6;
    return out; }`);
  check('e.rad = 30: a bolt 28 px from the centre hits it (hash, real bolt, _sigAoe); a plain Sniper is not hit at 28 px but is at 16 px',
    h.big && h.bigUp && h.aoeBig && h.realBolt && h.plain === -1 && h.plainNear && h.aoePlain, JSON.stringify(h));

  // 5. damageEnemy clamps to 1e6, refuses junk and inactive / foreign enemies
  const dm = await E(`(T, a) => { T.unhook(); const e = T.lone('ring', 200, 0); e.hp = e.maxHp = 1e9;
    const r1 = a.damageEnemy(e, 1e12, 'cmp'); const hp1 = e.hp; const src = a.lastDmgSrc;
    const junk = [a.damageEnemy(e, NaN), a.damageEnemy(e, -5), a.damageEnemy(e, 'x'), a.damageEnemy(null, 5), a.damageEnemy({ active: true, type: 'aimed', hp: 5 }, 5)]; const hp2 = e.hp;
    const r3 = a.damageEnemy(e, 7, 'cmp'); const hp3 = e.hp; e.active = false; const r4 = a.damageEnemy(e, 7);
    return { r1, hp1, src, junk, hp2, r3, hp3, r4 }; }`);
  check('damageEnemy clamps damage to 1e6 (1e12 -> 1e6), passes small hits through, and ignores NaN / <= 0 / non-pool / inactive enemies',
    dm.r1 === 1e6 && dm.hp1 === 1e9 - 1e6 && dm.src === 'cmp' && dm.junk.every((v) => v === 0) && dm.hp2 === dm.hp1 && dm.r3 === 7 && dm.hp3 === dm.hp1 - 7 && dm.r4 === 0, JSON.stringify(dm));

  // extra: the draw hooks, heroLift, dashMul and tgFor (null = unchanged is covered by check 1)
  const x = await E(`(T, a) => { T.hook(); const out = {};
    const e = T.lone('aimed', 160, 0); e.cre = {}; T.drawE = (g, q) => q === e; T.calls.mid = 0; T.calls.drawE = 0; a._draw(); out.mid = T.calls.mid; out.drawE = T.calls.drawE; T.drawE = null;
    T.lift = 20; a._draw(); T.lift = 0;
    const dash = (mul) => { T.dash = mul; const p = a.player; const x0 = p.x; const y0 = p.y; a.abilityCd[0] = 0; a._mx = 1; a._my = 0; a.active = true; a.focus = null; const ok = a.cast(0); a.active = false; const dd = Math.hypot(p.x - x0, p.y - y0); p.x = x0; p.y = y0; a._mx = 0; return ok ? dd : -1; };
    out.d1 = dash(1); out.d2 = dash(2); T.dash = 1;
    out.tg0 = a.telegraphOf(e); out.tgOn = a.tgFor(e, 'ring', 0.6); out.tg1 = a.telegraphOf(e); a.tgFor(e, 'ring', 0.3); out.tg2 = a.telegraphOf(e); a.tgFor(e, null, 0); out.tg3 = a.telegraphOf(e);
    T.unhook(); out.after = ${JSON.stringify(HOOKS)}.map((k) => a.world[k]); return out; }`);
  check('drawMid runs once per frame and drawEnemy can take over a creature; heroLift draws cleanly; dashMul 2 doubles the dash; tgFor shows / advances / clears a TG3 ring',
    x.mid === 1 && x.drawE >= 1 && x.d1 > 0 && x.d2 > x.d1 * 1.5 && x.tg0 === null && x.tgOn === true && x.tg1 && x.tg1.shape === 'ring' && x.tg1.windup === 0.6 && x.tg1.progress === 0 && x.tg2 && Math.abs(x.tg2.progress - 0.5) < 1e-9 && x.tg3 === null && x.after.every((v) => v === null), JSON.stringify(x));

  // 6. the Town never passes the hooks (main.js, and nothing outside realm.js / tests passes enemyStep)
  const root = path.join(__dirname, '..');
  const main = fs.readFileSync(path.join(root, 'main.js'), 'utf8');
  check('a grep confirms main.js never passes enemyStep (nor onLethal / drawEnemy / drawMid / heroLift / dashMul)', !/enemyStep/.test(main) && !/\b(onLethal|drawEnemy|drawMid|heroLift|dashMul)\b/.test(main));

  check('no console errors', errors.length === 0, errors.slice(0, 4).join(' | '));
  check('blockDb saw 0 DB requests', db.count() === 0, JSON.stringify({ http: db.http, ws: db.ws }));
  await browser.close();
  done();
})().catch((e) => { console.error(e); process.exitCode = 1; });
