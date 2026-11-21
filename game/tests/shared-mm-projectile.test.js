// Run: node game/tests/shared-mm-projectile.test.js
const P = require('../shared/mm-projectile.js');
let n = 0, bad = 0;
function check(name, ok) { n++; if (!ok) { bad++; console.log('FAIL ' + name); } }
const run = (b, spec, world, secs, dt, onStep) => {
  let state = 'alive';
  for (let t = 0; t < secs && state !== 'dead' && state !== 'returned'; t += dt) {
    const r = P.step(b, spec, dt, world); b = r.bolt; state = r.state; if (onStep) onStep(b, state);
  }
  return { b, state };
};

// Wave: peak offset equals amp +-0.5, zero drift of the centreline.
const wave = { spd: 1, life: 0.85, wave: { amp: 14, cycles: 2.75 } };
let b = P.make(100, 100, 0, wave, 0), peak = 0, drift = 0;
run(b, wave, {}, 0.85, 1 / 240, (nb) => { peak = Math.max(peak, Math.abs(nb.y - 100)); drift = Math.max(drift, Math.abs(nb.cy - 100)); });
check('wave peak = amp +-0.5', Math.abs(peak - 14) <= 0.5);
check('wave centreline zero drift', drift < 1e-9);
check('wave offset envelope ramps', Math.abs(P.waveOffset(wave, 0.01, 0)) < 3);
b = P.make(0, 0, Math.PI / 2, wave, 0);
let mx = 0; run(b, wave, {}, 0.85, 1 / 240, (nb) => { mx = Math.max(mx, Math.abs(nb.x)); });
check('wave perpendicular for vertical bolt', Math.abs(mx - 14) <= 0.5);
check('helix alt phase opposite', Math.abs(P.waveOffset(wave, 0.3, 0) + P.waveOffset(wave, 0.3, Math.PI)) < 1e-9);

// Boomerang returns within 16 px of the hero, even if the hero moves.
const bm = { spd: 1, life: 1.1, boomerang: true };
const hero = { x: 200, y: 200 };
b = P.make(200, 200, 0, bm, 0);
let res = run(b, bm, { hero }, 2, 1 / 60, () => { hero.x += 0.5; });
check('boomerang returned', res.state === 'returned');
check('boomerang ends within 16 px of hero', Math.hypot(res.b.x - hero.x, res.b.y - hero.y) <= 16);
b = P.make(200, 200, 0, bm, 0);
let far = 0; run(b, bm, { hero: { x: 200, y: 200 } }, 2, 1 / 60, (nb) => { far = Math.max(far, nb.x - 200); });
check('boomerang goes out first', far > 100);

// Bounce reflects off a wall stub, then dies past the limit.
const bo = { spd: 1, life: 2, bounce: 1 };
const world = { isWall: (x) => x >= 300 };
let bounced = false;
run(P.make(250, 50, 0, bo, 0), bo, world, 1, 1 / 60, (nb, s) => { if (s === 'bounced') bounced = true; });
check('bounce state reported', bounced);
let r1 = run(P.make(250, 50, 0, bo, 0), bo, world, 0.2, 1 / 60);
check('bounce stays out of wall and reverses', r1.b.x < 300 && r1.b.vx < 0 && r1.b.bounces === 1);
check('second wall hit kills', run(P.make(250, 50, 0, bo, 0), bo, world, 3, 1 / 60).state === 'dead');
check('no bounce spec: wall kills', run(P.make(250, 50, 0, { spd: 1 }, 0), { spd: 1 }, world, 1, 1 / 60).state === 'dead');
const hw = { isWall: (x, y) => y >= 100 };
r1 = run(P.make(50, 90, Math.PI / 4, bo, 0), bo, hw, 0.3, 1 / 60);
check('bounce on y axis flips vy only', r1.b.vy < 0 && r1.b.vx > 0);

// Homing turn <= homing * dt per step.
const ho = { spd: 1, life: 1, homing: 4 };
b = P.make(0, 0, 0, ho, 0);
const wH = { nearest: () => ({ x: 0, y: 500 }) };
let ok = true, prev = Math.atan2(b.vy, b.vx);
for (let i = 0; i < 30; i++) {
  const r = P.step(b, ho, 1 / 60, wH); b = r.bolt;
  const a = Math.atan2(b.vy, b.vx); if (Math.abs(a - prev) > 4 / 60 + 1e-9) ok = false; prev = a;
}
check('homing turn <= homing*dt', ok);
check('homing actually turns', prev > 0.5);
check('homing speed constant', Math.abs(Math.hypot(b.vx, b.vy) - 580) < 1e-6);
check('homing without target is straight', run(P.make(0, 0, 0, ho, 0), ho, { nearest: () => null }, 0.5, 1 / 60).b.y === 0);

// Determinism, purity, hostile input.
const a1 = run(P.make(5, 5, 1, wave, 0), wave, {}, 0.5, 1 / 60).b, a2 = run(P.make(5, 5, 1, wave, 0), wave, {}, 0.5, 1 / 60).b;
check('deterministic', JSON.stringify(a1) === JSON.stringify(a2));
const frozen = Object.freeze(P.make(1, 1, 0, wave, 0));
const before = JSON.stringify(frozen);
P.step(frozen, wave, 1 / 60, {});
check('input not mutated', JSON.stringify(frozen) === before);
let threw = false;
try {
  P.step(null, null, NaN, null);
  P.step('x', { wave: 5, homing: '9', boomerang: 'yes' }, 1e9, { isWall: 3, nearest: 4, hero: 'h' });
  P.step(JSON.parse('{"__proto__":{"x":1}}'), JSON.parse('{"__proto__":{"life":0}}'), 1, {});
} catch (e) { threw = true; }
check('hostile input safe', !threw);
const hs = P.step({ x: 'a', vx: Infinity, age: NaN }, { life: NaN }, 0.016, {}).bolt;
check('hostile output finite', [hs.x, hs.y, hs.vx, hs.vy, hs.age].every(Number.isFinite));
check('lifetime ends', run(P.make(0, 0, 0, { life: 0.5 }, 0), { life: 0.5 }, {}, 2, 1 / 60).state === 'dead');

// Chain, orbit, burst, lob helpers.
const en = [{ id: 1, x: 50, y: 0 }, { id: 2, x: 100, y: 0 }, { id: 3, x: 400, y: 0 }];
const ch = P.chainNext({ x: 0, y: 0 }, en, [1], { chain: { n: 2, range: 120, falloff: 0.7 } }, 10);
check('chain picks nearest un-hit', ch && ch.target.id === 2 && Math.abs(ch.dmg - 7) < 1e-9 && ch.chainLeft === 1);
check('chain respects range', P.chainNext({ x: 0, y: 0 }, en, [1, 2], { chain: { n: 2 } }, 10) === null);
check('chain n=0 none', P.chainNext({ x: 0, y: 0 }, en, [], { chain: { n: 0 } }, 10) === null);
const o = P.orbitPos(0, 2, 0, { orbit: { radius: 34, period: 0.9 } }, { x: 10, y: 10 });
check('orbit radius', Math.abs(Math.hypot(o.x - 10, o.y - 10) - 34) < 1e-9);
check('orbit period returns', Math.abs(P.orbitPos(0, 2, 0.9, { orbit: { period: 0.9 } }, { x: 0, y: 0 }).x - P.orbitPos(0, 2, 0, { orbit: { period: 0.9 } }, { x: 0, y: 0 }).x) < 1e-9);
const bt = P.burstTimes({ burst: { n: 3, gap: 0.05 } });
check('burst times', bt.length === 3 && Math.abs(bt[2] - 0.1) < 1e-9);
let lob = { sx: 0, sy: 0, ax: 1000, ay: 0, age: 0 };
const phases = new Set();
for (let i = 0; i < 80; i++) { lob = P.lobStep(lob, { lob: { radius: 40, maxRange: 260 } }, 1 / 60); phases.add(lob.phase); }
check('lob caps range, telegraphs then lands', lob.lx === 260 && phases.has('telegraph') && lob.phase === 'land');

console.log((bad ? 'FAILED ' + bad + ' of ' : 'ok ') + n + ' assertions');
process.exit(bad ? 1 : 0);
