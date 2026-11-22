// Unit tests for shared/mm-mount-ability.js (slice XD1, NEXT-SLICES-3). Run: node game/tests/shared-mm-mount-ability.test.js
// 1 def() covers all 12 MMCreatures ride.ability values with a readable name, a 3-12 s cooldown, a duration, cost 0 and no damage;
// 2 step() is deterministic and pure, never skips a cooldown, clamps dt and junk; 3 apply() effects are capped, never hit tames, party
// or bosses, never deal damage; per-kind numbers (charge windup 0.5, stomp/roar ring sizes, dive breath refill, leap over crater_rim,
// hover no burn, skim kelp/coral, burrow untargetable, sprint x1.4 for 3 s, float_dock platform, warm_aura 3 tiles); 4 KILL_FLAG.
const fs = require('fs');
const path = require('path');
const C = require('../shared/mm-creatures.js');
const A = require('../shared/mm-mount-ability.js');
let failed = 0;
function check(name, cond, extra = '') { console.log((cond ? 'PASS ' : 'FAIL ') + name + (cond ? '' : ' ' + extra)); if (!cond) failed++; }

const abil = [...new Set(C.list().map((d) => d.ride && d.ride.ability).filter(Boolean))].sort();
check('1: MMCreatures has 12 ride abilities', abil.length === 12, JSON.stringify(abil));
check('1: def() covers every one, and only those', abil.every((a) => A.def(a) && A.def(a).id === a) && JSON.stringify(A.IDS.slice().sort()) === JSON.stringify(abil));
check('1: each has a readable name, a kind and a description', A.IDS.every((a) => { const d = A.def(a); return /^[A-Z][a-z]+( [a-z]+)?$/.test(d.name) && typeof d.kind === 'string' && d.desc.length > 10; }));
check('1: cooldown 3-12 s, a duration > 0, cost 0, dmg 0', A.IDS.every((a) => { const d = A.def(a); return d.cd >= 3 && d.cd <= 12 && d.dur > 0 && d.dur <= 12 && d.cost === 0 && d.dmg === 0 && d.windup >= 0 && d.windup <= 1; }));
check('1: defs are frozen; junk ids -> null', Object.isFrozen(A.DEFS) && A.IDS.every((a) => Object.isFrozen(A.def(a))) && A.def('__proto__') === null && A.def('nope') === null && A.def(3) === null && A.init('x') === null);
check('1: spec numbers', A.def('sprint').speedMul === 1.4 && A.def('sprint').dur === 3 && A.def('charge').windup === 0.5 && A.def('warm_aura').warmR === 3 &&
  JSON.stringify(A.def('stomp').sizes) === '["S"]' && A.def('roar').sizes.indexOf('M') >= 0 && A.def('skim').noSlow.indexOf('kelp_bed') >= 0 && A.def('skim').noSlow.indexOf('coral_shallows') >= 0 &&
  A.def('hover').pass.indexOf('dust_shallows') >= 0 && A.def('hover').pass.indexOf('lava_vent') >= 0 && A.def('hover').noBurn === true && A.def('leap').over.indexOf('crater_rim') >= 0 && A.def('dive').pass.indexOf('deep_water') >= 0);

// ---- 2: step ----
const run = (id, script) => { let s = A.init(id); const log = []; script.forEach(([press, dt, under]) => { s = A.step(s, { press: press, under: under }, dt); log.push(s); }); return log; };
const script = []; for (let i = 0; i < 400; i++) script.push([i % 37 === 0, 1 / 30, i % 50 < 30]);
check('2: deterministic: the same script gives identical states for every ability', A.IDS.every((a) => JSON.stringify(run(a, script)) === JSON.stringify(run(a, script))));
check('2: states are frozen and the input state is never changed', (() => { const s0 = A.init('sprint'); const j = JSON.stringify(s0); const s1 = A.step(s0, { press: true }, 0.1); return Object.isFrozen(s1) && Object.isFrozen(s1.ev) && JSON.stringify(s0) === j && s1 !== s0; })());
check('2: sprint: press -> active 3 s with x1.4 speed, then a full cooldown, then ready', (() => {
  let s = A.step(A.init('sprint'), { press: true }, 0.1); const a = s.ph === 'active' && s.ev.indexOf('start') >= 0 && A.mods(s).speedMul === 1.4;
  for (let i = 0; i < 29; i++) s = A.step(s, {}, 0.1);
  const stillOn = s.ph === 'active'; s = A.step(s, {}, 0.11); const cool = s.ph === 'cool' && s.cd === 8 && A.mods(s).speedMul === 1 && s.ev.indexOf('end') >= 0;
  for (let i = 0; i < 79; i++) s = A.step(s, { press: true }, 0.1);
  const notYet = s.ph === 'cool' && s.uses === 1; s = A.step(s, {}, 0.11);
  return a && stillOn && cool && notYet && s.ph === 'ready' && s.ev.indexOf('ready') >= 0;
})());
check('2: a press never skips or shortens a cooldown, and costs nothing', A.IDS.every((a) => { const L = run(a, Array.from({ length: 600 }, () => [true, 0.05])); const starts = L.filter((s) => s.ev.indexOf('start') >= 0).length; const d = A.def(a); return starts <= Math.ceil(30 / (d.cd + d.dur + d.windup)) + 1 && starts >= 1; }));
check('2: charge winds up 0.5 s before it fires', (() => { let s = A.step(A.init('charge'), { press: true }, 0.1); const w = s.ph === 'wind' && s.ev.length === 0; for (let i = 0; i < 4; i++) s = A.step(s, {}, 0.1); const w2 = s.ph === 'wind'; s = A.step(s, {}, 0.11); return w && w2 && s.ph === 'active' && s.ev.indexOf('start') >= 0; })());
check('2: dt is clamped to 0.25 s; NaN / negative / junk dt is 0', (() => { const s = A.step(A.step(A.init('sprint'), { press: true }, 0), {}, 100); const n = A.step(A.step(A.init('sprint'), { press: true }, 0), {}, NaN); const m = A.step(A.step(A.init('sprint'), { press: true }, 0), {}, -5); return s.t === 2.75 && n.t === 3 && m.t === 3; })());
check('2: junk input and junk state are safe', A.step(null, {}, 0.1) === null && A.step({ a: 'nope' }, {}, 0.1) === null && A.step(A.init('stomp'), null, 0.1).ph === 'ready' && A.step(A.init('stomp'), 'x', 0.1).ph === 'ready');
check('2: clean() caps a tampered state (cooldown, uses, breath)', (() => { const s = A.clean({ a: 'roar', ph: 'cool', cd: 1e9, uses: 1e12, breath: 50 }); const b = A.clean({ a: 'dive', ph: 'zzz', breath: 1e9 }); return s.cd === 10 && s.uses === 99999 && s.breath === 0 && b.ph === 'ready' && b.breath === 8; })());
check('2: dive: breath drains only under water, the dive ends at 0 breath (never any damage), and refills at the surface', (() => {
  let s = A.step(A.init('dive'), { press: true, under: true }, 0);
  let n = 0; while (s.ph === 'active' && n < 100) { s = A.step(s, { under: true }, 0.25); n++; } // breath 8 runs out before the 10 s dive
  const out = n === 32 && s.ph === 'cool' && s.ev.indexOf('end') >= 0 && s.breath === 0 && A.mods(s).breath.left === 0;
  for (let i = 0; i < 8; i++) s = A.step(s, { under: false }, 0.25); // 2 s at 2/s -> 4
  const half = s.breath === 4;
  for (let i = 0; i < 40; i++) s = A.step(s, {}, 0.25);
  return out && half && s.breath === 8 && A.mods(s).breath.max === 8;
})());
check('2: ready() is 1 when ready, 0 while active, rising through the cooldown', (() => { let s = A.init('leap'); const r0 = A.ready(s); s = A.step(s, { press: true }, 0); const r1 = A.ready(s); s = A.step(s, {}, 0.25); s = A.step(s, {}, 0.25); s = A.step(s, {}, 0.25); return r0 === 1 && r1 === 0 && s.ph === 'cool' && A.ready(s) > 0 && A.ready(s) < 1; })());

// ---- 3: apply ----
const herd = [
  { id: 's1', x: 1, y: 0, size: 'S' }, { id: 'm1', x: 0, y: 2, size: 'M' }, { id: 'l1', x: 2, y: 2, size: 'L' }, { id: 'tame', x: 1, y: 1, size: 'S', tame: true },
  { id: 'pal', x: -1, y: 0, size: 'S', party: true }, { id: 'boss', x: 0, y: 1, size: 'S', boss: true }, { id: 'far', x: 9, y: 9, size: 'S' },
];
const ctx = { x: 0, y: 0, face: { x: 1, y: 0 }, creatures: herd };
const allFx = A.IDS.map((a) => A.apply(a, ctx));
check('3: no ability ever deals damage', allFx.every((f) => f.dmg === 0));
check('3: no ability ever touches a tame, a party member or a boss', allFx.every((f) => f.stun.concat(f.knock).every((t) => ['tame', 'pal', 'boss'].indexOf(t.id) < 0)));
check('3: stomp stuns small creatures in 3 tiles only', JSON.stringify(A.apply('stomp', ctx).stun) === JSON.stringify([{ id: 's1', s: 1.5 }]));
check('3: roar stuns small and medium creatures in 5 tiles', JSON.stringify(A.apply('roar', ctx).stun.map((t) => t.id)) === '["s1","m1"]' && A.apply('roar', ctx).stun.every((t) => t.s === 2));
check('3: ring targets are capped at MAX_TARGETS, nearest first', (() => { const many = Array.from({ length: 40 }, (_, i) => ({ id: 'c' + i, x: (i % 5) * 0.5, y: Math.floor(i / 5) * 0.5, size: 'S' })); const st = A.apply('roar', { x: 0, y: 0, creatures: many }).stun; return st.length === A.MAX_TARGETS && st[0].id === 'c0'; })());
check('3: charge dashes 5 tiles ahead and knocks foes in its line sideways (<= MAX_KNOCK)', (() => { const f = A.apply('charge', ctx); return f.move.dx === 5 && f.move.dy === 0 && f.knock.length === 1 && f.knock[0].id === 's1' && Math.hypot(f.knock[0].dx, f.knock[0].dy) <= A.MAX_KNOCK && f.knock[0].dx === 0; })());
check('3: pounce leaps to the nearest creature ahead (stopping a tile short); none ahead -> no move', (() => { const f = A.apply('pounce', { x: 0, y: 0, face: { x: 1, y: 0 }, creatures: [{ id: 'a', x: 3, y: 0, size: 'L' }, { id: 'b', x: -2, y: 0, size: 'S' }] }); const g = A.apply('pounce', { x: 0, y: 0, face: { x: 1, y: 0 }, creatures: [{ id: 'b', x: -2, y: 0, size: 'S' }] }); return f.move && f.move.dx === 2 && f.move.dy === 0 && g.move === null; })());
check('3: leap hops exactly one solid crater_rim tile onto free ground, and nothing else', (() => {
  const rim = (tx) => tx === 1, ter = (tx) => (tx === 1 ? 'crater_rim' : 'regolith');
  const ok = A.apply('leap', { x: 0, y: 0, face: { x: 1, y: 0 }, solidAt: rim, terrainAt: ter });
  const wall = A.apply('leap', { x: 0, y: 0, face: { x: 1, y: 0 }, solidAt: (tx) => tx >= 1, terrainAt: ter });
  const cliff = A.apply('leap', { x: 0, y: 0, face: { x: 1, y: 0 }, solidAt: rim, terrainAt: () => 'canyon_wall' });
  return ok.move && ok.move.dx === 2 && wall.move === null && cliff.move === null;
})());
check('3: burrow moves 3 tiles and is untargetable for 0.8 s; every move is capped at MAX_MOVE', (() => { const f = A.apply('burrow', ctx); return f.move.dx === 3 && f.untargetable === 0.8 && allFx.every((x) => !x.move || Math.hypot(x.move.dx, x.move.dy) <= A.MAX_MOVE); })());
check('3: timed abilities only change mods while active', (() => {
  const on = (a) => A.step(A.init(a), { press: true }, 0);
  const hv = A.mods(on('hover')), sk = A.mods(on('skim')), wa = A.mods(on('warm_aura')), fd = A.mods(on('float_dock')), bu = A.mods(on('burrow'));
  return hv.noBurn && hv.pass.indexOf('lava_vent') >= 0 && sk.noSlow.indexOf('kelp_bed') >= 0 && wa.warmR === 3 && fd.platform && bu.untargetable &&
    A.IDS.every((a) => { const m = A.mods(A.init(a)); return m.speedMul === 1 && !m.noBurn && !m.platform && !m.untargetable && m.warmR === 0 && m.pass.length === 0; });
})());
check('3: apply is pure and junk-safe', JSON.stringify(A.apply('charge', ctx)) === JSON.stringify(A.apply('charge', ctx)) && JSON.stringify(herd[0]) === '{"id":"s1","x":1,"y":0,"size":"S"}' &&
  A.apply('nope', ctx).move === null && A.apply('roar', null).stun.length === 0 && A.apply('charge', { face: { x: NaN } }).move.dy === 5 && Object.isFrozen(A.apply('roar', ctx)));
check('3: apply accepts a state too', JSON.stringify(A.apply(A.init('stomp'), ctx)) === JSON.stringify(A.apply('stomp', ctx)));

// ---- 4: kill switch + purity ----
check('4: KILL_FLAG is "ability"; ?ability=0 turns it off, anything else leaves it on', A.KILL_FLAG === 'ability' && A.enabled('?ability=0') === false && A.enabled('a=1&ability=0') === false &&
  A.enabled(new URLSearchParams('ability=0')) === false && A.enabled('?ability=1') === true && A.enabled('') === true && A.enabled(null) === true && A.enabled('?xability=0') === true);
check('4: module has no Math.random, Date, DOM, timers or network', (() => { const s = fs.readFileSync(path.join(__dirname, '..', 'shared', 'mm-mount-ability.js'), 'utf8'); return !/Math\.random|Date\.|new Date|document\.|window\.|setTimeout|setInterval|fetch\(|XMLHttpRequest|localStorage|firebase/.test(s); })());

console.log(failed ? `${failed} FAILED` : 'ALL PASSED'); process.exitCode = failed ? 1 : 0;
