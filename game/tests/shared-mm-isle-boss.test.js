// Unit tests for shared/mm-isle-boss.js. Run: node game/tests/shared-mm-isle-boss.test.js
const fs = require('fs');
const path = require('path');
const B = require('../shared/mm-isle-boss.js');
const C = require('../shared/mm-creatures.js');
let failed = 0;
function check(name, cond, extra = '') { console.log((cond ? 'PASS ' : 'FAIL ') + name + (cond ? '' : ' ' + extra)); if (!cond) failed++; }
const deepFreeze = (o) => { if (o && typeof o === 'object') { Object.freeze(o); Object.values(o).forEach(deepFreeze); } return o; };
const IDS = ['fernjaw_tyrant', 'tide_hydra', 'frost_dragon', 'red_titan'];

check('ships the four boss scripts, each a real boss creature', JSON.stringify(B.ids()) === JSON.stringify(IDS) && IDS.every((i) => C.get(i) && C.get(i).tier === 'boss' && B.script(i).phases.length === 3));
check('script() and init() reject junk and __proto__', B.script('nope') === null && B.script('__proto__') === null && B.init('goblin') === null && B.init(null) === null && B.step(null, {}, 0.1).events[0].type === 'invalid');
check('scripts are frozen', Object.isFrozen(B.SCRIPTS) && Object.isFrozen(B.script('red_titan').phases[2].attacks[0]));
check('audit finds no rule breaks (windup, dmgMul, shape, safe area)', B.audit().length === 0, JSON.stringify(B.audit()));
check('every boss uses all four shapes across its phases', IDS.every((i) => { const sh = new Set(); B.script(i).phases.forEach((p) => p.attacks.forEach((a) => sh.add(a.shape))); return B.SHAPES.every((x) => sh.has(x)); }));
check('every windup >= 0.6 s and every ground slam (ring) >= 0.8 s', IDS.every((i) => B.script(i).phases.every((p) => p.attacks.every((a) => a.windup >= 0.6 && (a.shape !== 'ring' || a.windup >= 0.8)))));
check('phases 1-2 hold 1 live hazard, phase 3 at most 2', IDS.every((i) => { const p = B.script(i).phases; return p[0].maxLive === 1 && p[1].maxLive === 1 && p[2].maxLive === 2; }));
check('init is a fresh seeded copy', B.init('red_titan', { seed: 'a' }) !== B.init('red_titan', { seed: 'a' }) && B.init('red_titan', { seed: 'a' }).hp === C.get('red_titan').hp);

{ // geometry
  const z = { x: 0, y: 0, angle: 0 };
  check('ring: safe inside and beyond, hit in the band', !B.hitTest({ ...z, shape: 'ring', inner: 90, outer: 230 }, 40, 0) && B.hitTest({ ...z, shape: 'ring', inner: 90, outer: 230 }, 150, 0) && !B.hitTest({ ...z, shape: 'ring', inner: 90, outer: 230 }, 300, 0));
  check('line: hit along it, safe to the side and behind', B.hitTest({ ...z, shape: 'line', width: 70, len: 500 }, 200, 20) && !B.hitTest({ ...z, shape: 'line', width: 70, len: 500 }, 200, 60) && !B.hitTest({ ...z, shape: 'line', width: 70, len: 500 }, -50, 0));
  check('cone: hit in the wedge, safe behind', B.hitTest({ ...z, shape: 'cone', arc: 1.4, radius: 280 }, 100, 30) && !B.hitTest({ ...z, shape: 'cone', arc: 1.4, radius: 280 }, -100, 0));
  const sp = { ...z, shape: 'spiral', arms: 3, armHalf: 0.3, radius: 380, spin: 0.9 };
  check('spiral: arms rotate, gaps stay clear', B.hitTest(sp, 200, 0, 0) && !B.hitTest(sp, 200, 0, 1.5) && B.safeFraction([sp], 0) > 0.4);
}

// run a boss and collect all events
function run(id, seed, secs, mk) {
  let s = B.init(id, { seed }); const ev = []; let maxLive = 0;
  for (let t = 0; t < secs; t += 0.1) { const r = B.step(s, mk ? mk(t, s) : { hero: { x: 200, y: 0 } }, 0.1); s = r.state; maxLive = Math.max(maxLive, s.hazards.length); r.events.forEach((e) => ev.push(Object.assign({ at: t }, e))); }
  return { s, ev, maxLive };
}
{ // determinism and purity
  const a = run('fernjaw_tyrant', 'x', 90, (t) => ({ hero: { x: 200, y: 0 }, dmg: 4 })), b = run('fernjaw_tyrant', 'x', 90, (t) => ({ hero: { x: 200, y: 0 }, dmg: 4 })), c = run('fernjaw_tyrant', 'y', 90, (t) => ({ hero: { x: 200, y: 0 }, dmg: 4 }));
  check('same seed + inputs give identical events; another seed differs', JSON.stringify(a.ev) === JSON.stringify(b.ev) && JSON.stringify(a.ev) !== JSON.stringify(c.ev));
  const s0 = deepFreeze(B.init('tide_hydra', { seed: 'p' })), inp = deepFreeze({ hero: { x: 100, y: 50 }, dmg: 10 });
  let ok = true; try { B.step(s0, inp, 0.2); B.step(s0, inp, 0.2); } catch (e) { ok = false; }
  check('step never mutates a frozen state or input', ok);
  check('step is a function of (state, input, dt): replaying one state twice matches', JSON.stringify(B.step(s0, inp, 3).events) === JSON.stringify(B.step(s0, inp, 3).events));
  const src = fs.readFileSync(path.join(__dirname, '../shared/mm-isle-boss.js'), 'utf8').replace(/\/\/.*$/gm, '');
  check('source has no Math.random, Date, timers, DOM or network', !/Math\.random|Date\.|new Date|setTimeout|setInterval|document\.|window\.|fetch\(|XMLHttpRequest|firebase/i.test(src));
}
{ // telegraph -> hit ordering and windups
  const r = run('red_titan', 'w1', 60);
  const tel = {}; let bad = 0, n = 0;
  r.ev.forEach((e) => { if (e.type === 'telegraph') { tel[e.id] = e; n++; } else if (e.type === 'hit') { const t0 = tel[e.id]; if (!t0 || e.at - t0.at < t0.windup - 0.11 || e.at - t0.at < 0.6 - 0.11) bad++; } });
  check('every hit follows its telegraph by at least the windup (' + n + ' attacks)', n >= 8 && bad === 0);
  const t1 = r.ev.find((e) => e.type === 'telegraph'), h1 = r.ev.find((e) => e.type === 'hit');
  check('telegraph event carries zone, windup and a safe-zone hint; hit carries zone, damage and once', t1 && t1.zone && t1.zone.shape && t1.windup >= 0.6 && typeof t1.safe === 'string' && h1 && h1.zone && h1.dmg > 0 && h1.once === true && h1.dmgMul <= 1.2);
  check('a hit never lands before 0.6 s of a fight', r.ev.filter((e) => e.type === 'hit').every((e) => e.at >= 0.6 + 2.4));
  check('hits do at most 1.2 x creature damage (no instant kill)', r.ev.filter((e) => e.type === 'hit').every((e) => e.dmg <= C.get('red_titan').dmg * 1.2 + 0.01));
}
{ // phases at 70% / 35%, weary at 10%
  IDS.forEach((id) => {
    const def = C.get(id); const seen = [];
    let s = B.init(id, { seed: 'ph' });
    const marks = [[0.71, 0], [0.69, 1], [0.36, 1], [0.34, 2]];
    marks.forEach(([frac, want]) => { const r = B.step(s, { dmg: Math.max(0, s.hp - def.hp * frac) }, 0.1); s = r.state; r.events.forEach((e) => e.type === 'phase' && seen.push(e.phase)); if (s.phase !== want) seen.push('bad@' + frac); });
    check(id + ': phase changes at 70% and 35% HP only', JSON.stringify(seen) === '[1,2]', JSON.stringify(seen));
    const r = B.step(s, { dmg: 1e9 }, 0.1);
    check(id + ': a huge hit stops at weary (never a one-shot kill)', r.state.st === 'weary' && r.state.hp > 0 && r.events.some((e) => e.type === 'weary') && r.state.hazards.length === 0 && !r.events.some((e) => e.type === 'dead'));
  });
  const a = B.step(B.init('red_titan', { seed: 'j' }), { dmg: 1e9 }, 0.1);
  check('one huge hit reports both phase changes then weary', a.events.map((e) => e.type).join() === 'phase,phase,weary');
}
{ // weary: no attacks, no timer, damage kills, feast tames only the tameable
  let s = B.step(B.init('fernjaw_tyrant', { seed: 'w' }), { dmg: 1e9 }, 0.1).state;
  let hits = 0, tel = 0;
  for (let i = 0; i < 6000; i++) { const r = B.step(s, { hero: { x: 100, y: 0 } }, 0.1); s = r.state; r.events.forEach((e) => { if (e.type === 'hit') hits++; if (e.type === 'telegraph') tel++; }); }
  check('a weary boss stays weary for 10 minutes: no attacks, no enrage, no timer', s.st === 'weary' && hits === 0 && tel === 0);
  const k = B.step(s, { dmg: 1e6 }, 0.1);
  check('without a feast, damage kills a weary boss normally', k.state.st === 'dead' && k.events.some((e) => e.type === 'dead'));
  IDS.forEach((id) => { const w = B.step(B.init(id, { seed: 'f' }), { dmg: 1e9 }, 0.1); const can = !!C.get(id).tame; check(id + ': weary event canTame=' + can, w.events.find((e) => e.type === 'weary').canTame === can); });
  const f = B.step(s, { feast: true }, 0.1);
  check('a feast at weary starts the MMTame knockout path', f.state.st === 'taming' && f.state.tame && f.state.tame.id === 'fernjaw_tyrant' && f.events.some((e) => e.type === 'tame_start'));
  const h = B.step(B.step(B.init('tide_hydra', { seed: 'h' }), { dmg: 1e9 }, 0.1).state, { feast: true }, 0.1);
  check('a boss with no tame (tide_hydra) ignores a feast and stays weary', h.state.st === 'weary' && h.events.some((e) => e.type === 'no_tame'));
  const early = B.step(B.init('fernjaw_tyrant', { seed: 'e' }), { feast: true, dmg: 10 }, 0.1);
  check('a feast before weary does nothing', early.state.st === 'fight' && !early.events.some((e) => e.type === 'tame_start'));
  // full tame: soothe, then feed
  let t = f.state, steps = 0;
  while (t.st === 'taming' && steps++ < 20000) { const asleep = t.tame.st !== 'wild'; t = B.step(t, asleep ? { offer: 'feast' } : { torporHit: 20 }, 0.1).state; }
  check('soothing then feeding a feast ends tamed', t.st === 'tamed' && t.tame.st === 'tamed', t.st + ' ' + t.tame.st);
  // waking up returns to weary with progress kept
  let w = f.state; for (let i = 0; i < 2000 && w.tame.st !== 'ko'; i++) w = B.step(w, { torporHit: 20 }, 0.1).state;
  for (let i = 0; i < 4000 && w.st === 'taming'; i++) w = B.step(w, {}, 0.1).state;
  check('a boss that wakes un-fed is weary again (and can be fed again)', w.st === 'weary' && B.step(w, { feast: true }, 0.1).state.st === 'taming');
}
{ // live hazards
  IDS.forEach((id) => { const r = run(id, 'lv', 400, (t, s) => ({ hero: { x: 200, y: 0 }, dmg: s.hp > s.hpMax * 0.12 ? 3 : 0 })); check(id + ': never more than 2 live hazards across a whole fight', r.maxLive <= 2 && r.maxLive >= 1, 'max ' + r.maxLive); });
  const r = run('frost_dragon', 'lv2', 400, (t, s) => ({ hero: { x: 200, y: 0 }, dmg: s.hp > s.hpMax * 0.12 ? 3 : 0 }));
  const live = {}; let two = 0, worst = 1;
  r.ev.forEach((e) => { if (e.type === 'telegraph') { live[e.id] = e.zone; if (Object.keys(live).length === 2) { two++; worst = Math.min(worst, B.safeFraction(Object.values(live), 0)); } } else if (e.type === 'end' || e.type === 'cancel') delete live[e.id]; });
  check('two overlapping hazards still leave > 15% of the arena safe', two > 0 && worst > 0.15, two + ' pairs, worst ' + worst);
}
{ // UMD
  const src = fs.readFileSync(path.join(__dirname, '../shared/mm-isle-boss.js'), 'utf8');
  check('UMD: exports MMIsleBoss on the global and via require', /root\.MMIsleBoss\s*=/.test(src) && /module\.exports\s*=\s*factory/.test(src));
  const vm = require('vm'); const ctx = { self: {} }; ctx.self = ctx; vm.createContext(ctx);
  ['rng.js', 'mm-creatures.js', 'mm-tame.js', 'mm-isle-boss.js'].forEach((f) => vm.runInContext(fs.readFileSync(path.join(__dirname, '../shared/' + f), 'utf8'), ctx));
  check('UMD: loads as a browser global with no module system', ctx.MMIsleBoss && typeof ctx.MMIsleBoss.step === 'function');
}
console.log(failed ? failed + ' FAILED' : 'ALL PASSED');
process.exitCode = failed ? 1 : 0;
