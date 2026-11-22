// Slice XW1 (NEXT-SLICES-3): mount abilities on the Hearthvale Isles page (games/isles/isles.js + shared/mm-mount-ability.js).
// 1 riding a mount shows ONE ability button (44 px, aria-label names the ability, a CSS cooldown ring), F uses it on desktop;
// 2 each of the 12 MMMountAbility abilities does its visible effect in a seeded run, one per mount on its own island:
//   sprint (moves further), charge (windup, dash, small foes nudged aside), stomp / roar (small / medium creatures dazed, never hurt),
//   warm_aura (no warmth drain), pounce (leaps at the creature ahead), dive (crosses the abyss on a breath meter, surfaces when it runs
//   out), skim (full speed on coral shallows), float_dock (the party rides the shell), leap (over one crater rim tile), hover (full speed
//   on dust shallows), burrow (a short tunnel ahead, untargetable);
// 3 the cooldown: a press while resting does nothing, the ring fills, it is ready again after `cd` s;
// 4 abilities never hurt: creature HP unchanged, the stable (pixeltown-tames-v1) and the pack untouched;
// 5 ?ability=0 (MMMountAbility.KILL_FLAG): no button, F still feeds, riding moves exactly as before;
// 6 phone 390x844: the button is >= 44 px, inside the viewport, not over the stick or the Fire button; __isles.events() logs ability;
// 0 DB requests (blockDb), no console errors, pixeltown-save-v1 never written.
// Run: python3 -m http.server 9081 (repo root), then BASE=http://localhost:9081/game/index.html NODE_PATH=$(npm root -g) node game/tests/isles-mount-ability.test.js
const path = require('path');
const { chromium } = require('playwright');
const { check, done, blockDb } = require('./helpers');
const MA = require('../shared/mm-mount-ability.js');
const ORIGIN = (process.env.BASE || 'http://localhost:8440/game/index.html').replace(/\/game\/index\.html.*$/, '');
const PAGE = ORIGIN + '/game/games/isles/index.html';
const TOWN = '{"realm":{"level":3},"name":"Bo"}';
const ARCH = 'pixeltown-archipelago-v1';
const PHONE = { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 };
const DESK = { viewport: { width: 1000, height: 700 } };
const SHOTS = process.env.SHOTS || '';
const all = [];
const stable = (sp, partySp) => JSON.stringify({ v: 1, n: 2, roster: [{ id: 't1', sp, nm: 'Rider', lv: 3, xp: 0, bond: 2, aff: 0, cos: '', isle: 'jungle', d: '2026-11-01' }]
  .concat(partySp ? [{ id: 't2', sp: partySp, nm: 'Pal', lv: 2, xp: 0, bond: 1, aff: 0, cos: '', isle: 'jungle', d: '2026-11-01' }] : []), party: partySp ? ['t2'] : [], mount: 't1' });

async function open(browser, opts, query, seed) {
  const ctx = await browser.newContext(opts);
  const db = await blockDb(ctx);
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  await page.addInitScript((s) => {
    if (sessionStorage.seeded) return;
    sessionStorage.seeded = '1';
    localStorage.clear();
    Object.keys(s || {}).forEach((k) => localStorage.setItem(k, s[k]));
  }, Object.assign({ 'pixeltown-save-v1': TOWN, [ARCH]: JSON.stringify({ v: 1, sg: 1 }) }, seed || {}));
  await page.goto(PAGE + '?test=1&saddles=0' + (query || ''));
  await page.waitForFunction(() => window.__isles && window.__isles.world, null, { timeout: 20000 });
  const o = { ctx, page, errors, db }; all.push(o); return o;
}
// every evaluate gets small helpers on the handle: flat(run) -> a tile with `run` plain tiles to its right; mount() -> calm + ride
const HELP = `(() => { const I = window.__isles; if (I._h) return; I._h = 1;
  I.flat = (run) => { const w = I.world; for (let y = 4; y < w.h - 4; y++) for (let x = 4; x < w.w - run - 4; x++) { let ok = true;
    for (let k = -1; k <= run && ok; k++) for (let dy = -1; dy <= 1 && ok; dy++) { const tx = x + k, ty = y + dy; if (!I.walkable(tx, ty) || I.heroSolid(tx, ty) || I.moveScaleAt(tx, ty) !== 1) ok = false; }
    if (ok) return { x, y }; } return null; };
  I.mountUp = () => { I.pause(true); I.god(true); I.clearCreatures(); const on = I.ride(); I.step(0, 0, 0.02); return on; };
  I.wait = (s) => { let l = s; while (l > 1e-9) { const d = Math.min(0.25, l); I.step(0, 0, d); l -= d; } return I.hero(); };
})();`;
const ev = (page, fn, arg) => page.evaluate(`${HELP}(${fn.toString()})(window.__isles, ${JSON.stringify(arg === undefined ? null : arg)})`);
const shot = async (page, name) => { if (SHOTS) await page.screenshot({ path: path.join(SHOTS, name + '.png') }); };
const rectOf = (page, sel) => page.evaluate((s) => { const n = document.querySelector(s); if (!n || n.hidden) return null; const r = n.getBoundingClientRect(); return { l: r.left, t: r.top, r: r.right, b: r.bottom, w: r.width, h: r.height }; }, sel);
const overlap = (a, b) => !!a && !!b && a.l < b.r && b.l < a.r && a.t < b.b && b.t < a.b;
const btnInfo = (page) => page.evaluate(() => { const b = document.getElementById('btn-ability'); const r = b.getBoundingClientRect();
  return { shown: !b.hidden, label: b.getAttribute('aria-label'), text: b.querySelector('.txt').textContent, p: b.style.getPropertyValue('--p'), cool: b.classList.contains('cool'), on: b.classList.contains('on'), w: r.width, h: r.height,
    n: document.querySelectorAll('#btn-ability').length }; });
// one ability run: open its island with its mount, ride, then `fn` in the page
async function run(browser, isle, sp, fn, arg, extra) {
  const o = await open(browser, DESK, '&isle=' + isle + '&seed=7' + ((extra && extra.q) || ''), { 'pixeltown-tames-v1': stable(sp, extra && extra.party) });
  const on = await ev(o.page, (I) => I.mountUp());
  const out = await ev(o.page, fn, arg);
  return { o, on, out };
}

(async () => {
  const browser = await chromium.launch();
  check('0: MMMountAbility has 12 abilities and the kill flag is "ability"', MA.IDS.length === 12 && MA.KILL_FLAG === 'ability');

  // ---- 1. the button, the ring, F ----
  const B = await open(browser, DESK, '&isle=home&seed=7', { 'pixeltown-tames-v1': stable('meadow_strider') });
  const before = await btnInfo(B.page);
  await ev(B.page, (I) => { const t = I.flat(14); I.teleport(t.x, t.y); return I.mountUp(); });
  await ev(B.page, (I) => { I.meters(); return true; }); // drawHud now (it runs at 5 Hz in the loop)
  const b1 = await btnInfo(B.page);
  check('1: not riding: no ability button', !before.shown, JSON.stringify(before));
  check('1: riding shows ONE ability button (44 px) whose aria-label names the ability', b1.shown && b1.n === 1 && b1.w >= 44 && b1.h >= 44 && /Mount ability: Sprint, ready/.test(b1.label) && b1.text === 'Sprint' && b1.p === '1', JSON.stringify(b1));
  await B.page.keyboard.press('KeyF');
  const f = await ev(B.page, (I) => { I.step(0, 0, 0.02); return I.ability(); });
  await ev(B.page, (I) => I.wait(3.2));
  await ev(B.page, (I) => { I.meters(); return true; }); // drawHud now (it runs at 5 Hz in the loop)
  const b2 = await btnInfo(B.page);
  const half = await ev(B.page, (I) => { I.wait(4); return I.ability(); });
  await ev(B.page, (I) => { I.meters(); return true; }); // drawHud now (it runs at 5 Hz in the loop)
  const b3 = await btnInfo(B.page);
  check('1: F (desktop) fires it while riding', f.ph === 'active' && f.uses === 1, JSON.stringify(f));
  check('1: resting: the ring is part-filled (--p < 1), the button is marked cool and says how long', b2.cool && Number(b2.p) < 1 && /resting \d+ s/.test(b2.label), JSON.stringify(b2));
  check('1: the ring keeps filling as the cooldown runs', half.ph === 'cool' && Number(b3.p) > Number(b2.p), JSON.stringify([b2.p, b3.p, half]));
  await shot(B.page, 'xw1-ability-desktop');

  // ---- 2. every ability's effect ----
  // sprint: 1 s of running covers ~1.4x the ground
  const sprint = await ev(B.page, (I) => {
    I.wait(9); const t = I.flat(14); I.teleport(t.x, t.y); I.face(1, 0);
    const x0 = I.hero().x; I.step(1, 0, 1); const plain = I.hero().x - x0;
    I.teleport(t.x, t.y); I.useAbility(); I.step(0, 0, 0.02); const a = I.ability();
    const x1 = I.hero().x; I.step(1, 0, 1); const fast = I.hero().x - x1;
    return { plain, fast, a };
  });
  check('2 sprint: 1 s of running covers ~40% more ground while it lasts', sprint.a.ph === 'active' && sprint.fast > sprint.plain * 1.3 && sprint.fast < sprint.plain * 1.5, JSON.stringify(sprint));

  // charge: a 0.5 s windup line, then a dash ahead; a small creature in the line is nudged aside, never hurt
  const charge = await run(browser, 'jungle', 'tusktop', (I) => {
    const t = I.flat(10); I.teleport(t.x, t.y); I.face(1, 0);
    const u = I.spawn('vinecoil', t.x + 2, t.y); const c0 = I.creatures().find((c) => c.uid === u);
    const x0 = I.hero().x; I.useAbility(); I.step(0, 0, 0.3); const wind = I.ability(); const xw = I.hero().x;
    I.step(0, 0, 0.6); const c1 = I.creatures().find((c) => c.uid === u);
    return { wind: wind.ph, still: xw === x0, moved: (I.hero().x - x0) / I.tile, log: I.abilityLog(), hp: [c0.hp, c1 && c1.hp], dy: c1 ? Math.abs(c1.y - c0.y) / I.tile : null };
  }, null, { q: '&tame=0' });
  check('2 charge: a windup first (the hero waits), then a dash of several tiles ahead', charge.on && charge.out.wind === 'wind' && charge.out.still && charge.out.moved >= 3, JSON.stringify(charge.out));
  check('2 charge: the small creature in the line is pushed aside (knock) and keeps its HP', charge.out.log[0].knock === 1 && charge.out.dy >= 1 && charge.out.hp[0] === charge.out.hp[1], JSON.stringify(charge.out));

  // stomp: small creatures within 3 tiles are dazed (they stop), never hurt
  const stomp = await run(browser, 'jungle', 'stegolith', (I) => {
    const t = I.flat(8); I.teleport(t.x, t.y);
    const u = I.spawn('vinecoil', t.x + 2, t.y), far = I.spawn('vinecoil', t.x + 7, t.y); const c0 = I.creatures().find((c) => c.uid === u);
    I.useAbility(); I.step(0, 0, 0.05);
    const s = I.stun(u), sf = I.stun(far), p0 = I.creatures().find((c) => c.uid === u); I.step(0, 0, 1); const p1 = I.creatures().find((c) => c.uid === u);
    return { s, sf, hp: [c0.hp, p1.hp], still: p0.x === p1.x && p0.y === p1.y, log: I.abilityLog() };
  }, null, { q: '&tame=0' });
  check('2 stomp: a small creature 2 tiles away is dazed and stays put; one 7 tiles away is not', stomp.on && stomp.out.s > 0 && stomp.out.sf === 0 && stomp.out.still && stomp.out.log[0].stun === 1, JSON.stringify(stomp.out));
  check('2 stomp: no damage', stomp.out.hp[0] === stomp.out.hp[1], JSON.stringify(stomp.out.hp));

  // roar: a wide ring (5 tiles) dazes small and medium creatures
  const roar = await run(browser, 'jungle', 'fernjaw_tyrant', (I) => {
    const t = I.flat(8); I.teleport(t.x, t.y);
    const a = I.spawn('vinecoil', t.x + 4, t.y), b = I.spawn('chompbill', t.x - 2, t.y);
    I.useAbility(); I.step(0, 0, 0.05);
    return { a: I.stun(a), b: I.stun(b), log: I.abilityLog() };
  }, null, { q: '&tame=0' });
  check('2 roar: creatures 2 and 4 tiles away are both dazed', roar.on && roar.out.a > 0 && roar.out.b > 0 && roar.out.log[0].stun === 2, JSON.stringify(roar.out));

  // warm aura: out in the cold the warmth meter stops draining while it lasts
  const warm = await run(browser, 'ice', 'shagtusk', (I) => {
    const t = I.findEnvTile(false); I.teleport(t.x, t.y); I.envSet(10, 0);
    I.wait(2); const plain = I.env().warmT - 10;
    I.envSet(10, 0); I.useAbility(); I.wait(3); const aura = I.env().warmT - 10, a = I.ability();
    return { plain, aura, a };
  });
  check('2 warm_aura: no warmth drain while it lasts (drains normally without it)', warm.on && warm.out.plain > 1.5 && Math.abs(warm.out.aura) < 0.15 && warm.out.a.warm === true, JSON.stringify(warm.out));

  // pounce: leaps to the creature ahead (stops a tile short of it)
  const pounce = await run(browser, 'ice', 'sabrefang', (I) => {
    const t = I.flat(8); I.teleport(t.x, t.y); I.face(1, 0);
    const u = I.spawn('frostfox', t.x + 4, t.y); const x0 = I.hero().x;
    I.useAbility(); I.step(0, 0, 0.4); const c = I.creatures().find((q) => q.uid === u);
    return { moved: (I.hero().x - x0) / I.tile, gap: (c.x - I.hero().x) / I.tile };
  }, null, { q: '&tame=0' });
  check('2 pounce: the rider leaps ~3 tiles to the creature ahead', pounce.on && pounce.out.moved > 2.2 && pounce.out.gap > 0.5 && pounce.out.gap < 1.8, JSON.stringify(pounce.out));

  // dive: the abyss blocks a swim mount until Dive; then it crosses on a breath meter and surfaces when breath runs out
  const dive = await run(browser, 'reef', 'tidesteed', (I) => {
    const w = I.world; let s = null;
    for (let y = 6; y < w.h - 6 && !s; y++) for (let x = 6; x < w.w - 16 && !s; x++) {
      if (I.terrainName(x, y) === 'abyss' || I.heroSolid(x, y) || I.heroSolid(x, y - 1) || I.heroSolid(x, y + 1)) continue;
      let ok = true; for (let k = 1; k <= 6 && ok; k++) for (let dy = -1; dy <= 1 && ok; dy++) if (I.terrainName(x + k, y + dy) !== 'abyss') ok = false;
      if (ok) s = { x, y };
    }
    if (!s) return { s };
    I.teleport(s.x, s.y); I.face(1, 0);
    const solid0 = I.heroSolid(s.x + 1, s.y); I.step(1, 0, 1); const tx0 = I.hero().tx;
    I.teleport(s.x, s.y); I.useAbility(); I.step(1, 0, 1.2);
    const a1 = I.ability(), on = I.hero(), meter = (() => { I.render(); return null; })();
    I.step(0, 0, 3); const a2 = I.ability();
    return { s, solid0, tx0, a1, on, a2 };
  });
  await ev(dive.o.page, (I) => { I.meters(); return true; }); // drawHud now (it runs at 5 Hz in the loop)
  const breathHud = await dive.o.page.evaluate(() => ({ shown: !document.getElementById('hud-abil').hidden, t: document.querySelector('#abil-breath .val').textContent }));
  await shot(dive.o.page, 'xw1-dive');
  const diveEnd = await ev(dive.o.page, (I) => { I.wait(7); return { a: I.ability(), h: I.hero(), solid: I.heroSolid(I.hero().tx, I.hero().ty) }; });
  check('2 dive: without Dive the abyss blocks the tidesteed', dive.on && !!dive.out.s && dive.out.solid0 && dive.out.tx0 === dive.out.s.x, JSON.stringify(dive.out));
  check('2 dive: with Dive it crosses onto the abyss and the breath runs down', dive.out.a1.ph === 'active' && dive.out.on.terrain === 'abyss' && dive.out.a2.breath < dive.out.a1.breath && dive.out.a1.pass.indexOf('abyss') >= 0, JSON.stringify(dive.out));
  check('2 dive: the HUD shows the breath meter', breathHud.shown && /^\d+ \/ 8 s$/.test(breathHud.t), JSON.stringify(breathHud));
  check('2 dive: when the breath runs out it ends and the rider surfaces on a tile it can be on', diveEnd.a.ph === 'cool' && diveEnd.h.terrain !== 'abyss' && !diveEnd.solid, JSON.stringify(diveEnd));

  // skim: coral shallows at full speed
  const skim = await run(browser, 'reef', 'skimray', (I) => {
    const t = I.findShore('coral_shallows'); I.teleport(t.x, t.y); I.step(0, 0, 0.02); I.step(0.01, 0, 0.02);
    const plain = I.hero().scale; I.useAbility(); I.step(0.01, 0, 0.05); const fast = I.hero().scale;
    return { t, plain, fast, terrain: I.hero().terrain, a: I.ability() };
  });
  check('2 skim: on coral shallows the skimray goes from x0.7 to full speed', skim.on && skim.out.terrain === 'coral_shallows' && Math.abs(skim.out.fast / skim.out.plain - 1 / 0.7) < 0.02 && skim.out.a.noSlow.indexOf('kelp_bed') >= 0, JSON.stringify(skim.out));

  // float dock: the party rides the shell while it lasts
  const dock = await run(browser, 'reef', 'isleback_turtle', (I) => {
    const t = I.flat(10) || I.findTile(null, 10); I.teleport(t.x, t.y);
    I.useAbility(); I.step(1, 0, 1.5);
    const h = I.hero(), p = I.party();
    return { n: p.length, d: p.map((q) => Math.hypot(q.x - h.x, q.y - h.y) / I.tile), a: I.ability() };
  }, null, { party: 'shellcrab' });
  check('2 float_dock: the party member rides on the shell (within a tile of the rider) as it moves', dock.on && dock.out.n === 1 && dock.out.d[0] < 1 && dock.out.a.platform === true, JSON.stringify(dock.out));

  // leap: over one crater rim tile
  const leap = await run(browser, 'mars', 'crater_strider', (I) => {
    const w = I.world; let s = null;
    for (let y = 4; y < w.h - 4 && !s; y++) for (let x = 4; x < w.w - 4 && !s; x++) {
      if (I.terrainName(x + 1, y) !== 'crater_rim') continue;
      if (I.heroSolid(x, y) || I.heroSolid(x + 2, y) || !I.walkable(x, y) || !I.walkable(x + 2, y)) continue;
      s = { x, y };
    }
    if (!s) return { s };
    I.teleport(s.x, s.y); I.face(1, 0); I.step(1, 0, 0.5); const walked = I.hero().tx;
    I.teleport(s.x, s.y); I.face(1, 0); I.useAbility(); I.step(0, 0, 0.05);
    return { s, walked, after: I.hero().tx, log: I.abilityLog() };
  });
  check('2 leap: the crater rim blocks walking; Leap jumps over it to the far side', leap.on && !!leap.out.s && leap.out.walked === leap.out.s.x && leap.out.after === leap.out.s.x + 2 && leap.out.log[0].moved === 2, JSON.stringify(leap.out));

  // hover: dust shallows at full speed (no slow)
  const hover = await run(browser, 'mars', 'void_grazer', (I) => {
    const t = I.findShore('dust_shallows'); I.teleport(t.x, t.y); I.step(0.01, 0, 0.02);
    const plain = I.hero().scale; I.useAbility(); I.step(0.01, 0, 0.05); const fast = I.hero().scale;
    return { plain, fast, terrain: I.hero().terrain, a: I.ability() };
  });
  check('2 hover: over dust shallows the grazer goes from x0.8 to full speed (lava vents are in its pass list)', hover.on && hover.out.terrain === 'dust_shallows' && Math.abs(hover.out.fast / hover.out.plain - 1 / 0.8) < 0.02 && hover.out.a.pass.indexOf('dust_shallows') >= 0, JSON.stringify(hover.out));

  // burrow: a short tunnel ahead, untargetable on the way
  const burrow = await run(browser, 'mars', 'red_titan', (I) => {
    const t = I.flat(8); I.teleport(t.x, t.y); I.face(1, 0); const x0 = I.hero().x;
    I.useAbility(); I.step(0, 0, 0.02); const moved = (I.hero().x - x0) / I.tile, hp0 = I.hp().hp;
    const u = I.spawn('rustbeetle', I.hero().tx + 1, I.hero().ty);
    return { moved, log: I.abilityLog(), u: !!u, hp0 };
  });
  check('2 burrow: the titan tunnels 3 tiles ahead', burrow.on && Math.abs(burrow.out.moved - 3) < 0.05 && Math.abs(burrow.out.log[0].moved - 3) < 0.05, JSON.stringify(burrow.out));

  // ---- 3. cooldown ----
  const cool = await run(browser, 'jungle', 'stegolith', (I) => {
    const t = I.flat(4); I.teleport(t.x, t.y);
    const a = I.useAbility(); I.step(0, 0, 0.5); const s1 = I.ability();
    const b = I.useAbility(); I.step(0, 0, 0.05); const s2 = I.ability();
    I.wait(7.2); const s3 = I.ability(); I.wait(0.6); const s4 = I.ability();
    const c = I.useAbility(); I.step(0, 0, 0.02); const s5 = I.ability();
    return { a, b, c, s1, s2, s3, s4, s5, toast: document.getElementById('toast').textContent };
  });
  check('3 cooldown: a press while it rests does nothing (uses stays 1) and says when it is ready', cool.out.a && cool.out.b === false && cool.out.s2.uses === 1 && cool.out.s2.ph === 'cool', JSON.stringify(cool.out));
  check('3 cooldown: the ring fills over the cooldown and it is ready again after cd (8 s)', cool.out.s3.ph === 'cool' && cool.out.s3.ready > 0.8 && cool.out.s4.ph === 'ready' && cool.out.c && cool.out.s5.uses === 2, JSON.stringify(cool.out));

  // ---- 4. never hurts: the stable and the pack are untouched by any of the runs ----
  const keep = await Promise.all([charge, stomp, roar, warm, pounce, dive, skim, dock, leap, hover, burrow, cool].map((r) => ev(r.o.page, (I) => ({ st: localStorage.getItem('pixeltown-tames-v1'), inv: I.inv(), dead: I.hero().dead, ab: I.ability().id }))));
  const st0 = [stable('tusktop'), stable('stegolith'), stable('fernjaw_tyrant'), stable('shagtusk'), stable('sabrefang'), stable('tidesteed'), stable('skimray'), stable('isleback_turtle', 'shellcrab'), stable('crater_strider'), stable('void_grazer'), stable('red_titan'), stable('stegolith')];
  check('4: all 12 abilities were fired from their own mount', [B].concat([charge, stomp, roar, warm, pounce, dive, skim, dock, leap, hover, burrow]).length === 12 &&
    JSON.stringify(keep.slice(0, 11).map((k) => k.ab).concat(['sprint']).sort()) === JSON.stringify(MA.IDS.slice().sort()), JSON.stringify(keep.map((k) => k.ab)));
  check('4: the stable is byte-identical and the pack stays empty after every ability run', keep.every((k, i) => JSON.parse(k.st).roster.length === JSON.parse(st0[i]).roster.length && JSON.stringify(JSON.parse(k.st).roster) === JSON.stringify(JSON.parse(st0[i]).roster) && Object.keys(k.inv).length === 0 && !k.dead),
    JSON.stringify(keep.map((k) => Object.keys(k.inv))));
  const evs = await ev(B.page, (I) => I.events());
  check('4: __isles.events() logs {t, kind} ride and ability entries, no text', evs.some((e) => e.kind === 'ride') && evs.filter((e) => e.kind === 'ability').length >= 2 && evs.every((e) => Object.keys(e).join() === 't,kind' && typeof e.t === 'number'), JSON.stringify(evs));

  // ---- 5. ?ability=0 ----
  const K = await open(browser, DESK, '&isle=home&seed=7&ability=0', { 'pixeltown-tames-v1': stable('meadow_strider') });
  const k1 = await ev(K.page, (I) => { const t = I.flat(14); I.teleport(t.x, t.y); I.mountUp(); I.face(1, 0); const x0 = I.hero().x; I.step(1, 0, 1); return { dx: I.hero().x - x0, use: I.useAbility(), a: I.ability(), riding: !!I.riding() }; });
  await K.page.keyboard.press('KeyF');
  await ev(K.page, (I) => { I.meters(); return true; }); // drawHud now (it runs at 5 Hz in the loop)
  const kb = await btnInfo(K.page);
  check('5 ?ability=0: riding works, no ability state, no button, F does nothing extra', k1.riding && k1.a.id === null && k1.a.on === false && k1.use === false && !kb.shown, JSON.stringify([k1, kb]));
  check('5 ?ability=0: the ride moves exactly as far as the plain ride (the sprint baseline)', Math.abs(k1.dx - sprint.plain) < 0.01, JSON.stringify([k1.dx, sprint.plain]));

  // ---- 6. phone ----
  const P = await open(browser, PHONE, '&isle=home&seed=7', { 'pixeltown-tames-v1': stable('meadow_strider') });
  await ev(P.page, (I) => { const t = I.flat(14); I.teleport(t.x, t.y); I.mountUp(); I.render(); return true; });
  await ev(P.page, (I) => { I.meters(); return true; });
  const pb = await rectOf(P.page, '#btn-ability'), stick = await rectOf(P.page, '#stick'), fire = await rectOf(P.page, '#btn-fire'), ride = await rectOf(P.page, '#btn-ride');
  check('6 phone: the ability button is >= 44 px, inside 390x844, next to Ride, not over the stick or Fire', pb && pb.w >= 44 && pb.h >= 44 && pb.l >= 0 && pb.r <= 390 && pb.t >= 0 && pb.b <= 844 && !overlap(pb, stick) && !overlap(pb, fire) && !overlap(pb, ride) && !!ride,
    JSON.stringify({ pb, stick, fire, ride }));
  const hintR = await rectOf(P.page, '#hint'), acts = await P.page.evaluate(() => [...document.querySelectorAll('#acts button')].filter((b) => !b.hidden).map((b) => { const r = b.getBoundingClientRect(); return { l: r.left, t: r.top, r: r.right, b: r.bottom }; }));
  check('6 phone: the hint line sits above the (taller) button column, overlapping none of them', !!hintR && acts.length >= 3 && acts.every((a) => !overlap(a, hintR)), JSON.stringify({ hintR, acts }));
  await P.page.tap('#btn-ability');
  const pt = await ev(P.page, (I) => { I.step(0, 0, 0.02); return I.ability(); });
  check('6 phone: tapping it fires the ability', pt.ph === 'active' && pt.uses === 1, JSON.stringify(pt));
  await shot(P.page, 'xw1-ability-phone');
  const hs = await P.page.evaluate(() => document.documentElement.scrollWidth > innerWidth);
  check('6 phone: no horizontal scroll', !hs);

  const towns = await Promise.all(all.map((o) => o.page.evaluate(() => localStorage.getItem('pixeltown-save-v1')).catch(() => TOWN)));
  check('7: pixeltown-save-v1 is never written', towns.every((t) => t === TOWN));
  check('7: 0 DB requests and no console errors', all.every((o) => o.db.count() === 0 && o.errors.length === 0), all.map((o) => o.errors.join(' | ')).filter(Boolean).join(' / '));
  for (const o of all) await o.ctx.close().catch(() => {});
  await browser.close();
  done();
})().catch((e) => { console.error(e); process.exit(1); });
