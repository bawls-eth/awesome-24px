// Run: node game/tests/shared-mm-splash.test.js  (pure: MMSplash falloff, pick targeting, caps, hostile input, allocation)
const S = require('../shared/mm-splash.js');
const W = require('../shared/mm-weapons.js');
let n = 0, bad = 0;
function check(name, ok) { n++; if (!ok) { bad++; console.log('FAIL ' + name); } }
const near = (a, b, e) => Math.abs(a - b) <= (e === undefined ? 1e-9 : e);
const sp = { r: 40, frac: 0.5, inner: 0.35, edge: 0.5, max: 4 };

// frac: full inside the inner core, `edge` at r, 0 beyond, monotonic
check('frac(0) = 1', S.frac(0, sp) === 1);
check('frac inside inner*r = 1', S.frac(14, sp) === 1);
check('frac(r) = edge', near(S.frac(40, sp), 0.5));
check('frac beyond r = 0', S.frac(40.01, sp) === 0 && S.frac(1e9, sp) === 0);
check('frac linear midway between inner and r', near(S.frac(27, sp), 1 - 0.5 * (27 - 14) / (40 - 14)));
check('frac is monotonic non-increasing', (() => { let p = 2; for (let d = 0; d <= 40; d += 0.5) { const f = S.frac(d, sp); if (f > p + 1e-12) return false; p = f; } return true; })());
check('frac negative distance acts as 0; defaults inner .35 edge .5', S.frac(-5, sp) === 1 && near(S.frac(40, { r: 40 }), 0.5) && S.frac(5, { r: 40 }) === 1);
check('frac with a custom edge', near(S.frac(80, { r: 80, edge: 0.6 }), 0.6));

// dmg
check('dmg = hit x frac x falloff', near(S.dmg(10, 0, sp), 5) && near(S.dmg(10, 40, sp), 2.5) && S.dmg(10, 41, sp) === 0);
check('dmg never exceeds frac cap and ignores junk hit', S.dmg(10, 0, { r: 40, frac: 5 }) <= 8 + 1e-9 && S.dmg(NaN, 0, sp) === 0 && S.dmg(-3, 0, sp) === 0);

// pick
const xs = [0, 10, 20, 30, 40, 50, 60, 70], ys = new Array(8).fill(0), rs = new Array(8).fill(0), out = new Int16Array(6);
check('pick returns nearest first, capped by max', (() => { const k = S.pick(xs, ys, rs, 8, 0, 0, { r: 80, max: 4 }, -1, out); return k === 4 && Array.from(out.subarray(0, 4)).join() === '0,1,2,3'; })());
check('pick skips the primary target', (() => { const k = S.pick(xs, ys, rs, 8, 0, 0, { r: 80, max: 4 }, 0, out); return k === 4 && Array.from(out.subarray(0, 4)).join() === '1,2,3,4'; })());
check('pick distances are ascending and exposed', (() => { S.pick(xs, ys, rs, 8, 0, 0, { r: 80, max: 4 }, 0, out); return S.dist[0] === 10 && S.dist[1] === 20 && S.dist[3] === 40; })());
check('pick respects the radius', S.pick(xs, ys, rs, 8, 0, 0, { r: 25, max: 6 }, -1, out) === 3);
check('pick subtracts the enemy radius', S.pick([30], [0], [10], 1, 0, 0, { r: 20, max: 3 }, -1, out) === 1 && near(S.dist[0], 20));
check('pick hard cap is 6 even if max is higher', S.pick(xs, ys, rs, 8, 0, 0, { r: 80, max: 99 }, -1, out) === 6 && S.pick(xs, ys, rs, 8, 0, 0, { r: 80, max: 99 }, -1, new Int16Array(3)) === 3);
check('pick max 0 / r 0 gives no targets', S.pick(xs, ys, rs, 8, 0, 0, { r: 80, max: 0 }, -1, out) === 0 && S.pick(xs, ys, rs, 8, 0, 0, { r: 0, max: 3 }, -1, out) === 0);
check('pick keeps the nearest when the list is unsorted', (() => { const k = S.pick([60, 5, 40, 15, 25], [0, 0, 0, 0, 0], null, 5, 0, 0, { r: 80, max: 2 }, -1, out); return k === 2 && out[0] === 1 && out[1] === 3; })());
check('no friendly fire: masked (non-hostile) entries are never picked', (() => { const ok = [1, 0, 1, 0, 1, 1, 1, 1]; const k = S.pick(xs, ys, rs, 8, 0, 0, { r: 80, max: 6 }, -1, out, ok); return k === 6 && Array.from(out.subarray(0, k)).every((i) => ok[i]); })());
check('pick works on typed arrays', S.pick(new Float32Array([5, 9]), new Float32Array([0, 0]), new Float32Array([0, 0]), 2, 0, 0, { r: 30, max: 2 }, -1, out) === 2);
check('one splash per bolt: claim is true once', (() => { const b = { x: 1 }; return S.claim(b) === true && b.sp === 1 && S.claim(b) === false && S.claim({ sp: 1 }) === false; })());
check('claim hostile input and frozen bolt', S.claim(null) === false && S.claim(5) === false && S.claim(Object.freeze({})) === false);

// hostile input never throws and yields nothing
const hostile = [undefined, null, 0, NaN, Infinity, -Infinity, '', 'x', '__proto__', {}, [], () => 1, Symbol.iterator, { r: NaN, max: 3 }, { r: Infinity, max: Infinity }, { r: '40', max: '3' }];
check('hostile specs/args never throw', hostile.every((h) => { try { S.frac(h, h); S.frac(5, h); S.dmg(h, h, h); S.pick(h, h, h, h, h, h, h, h, h, h); S.pick(xs, ys, rs, h, 0, 0, h, h, out, h); S.pick(xs, ys, rs, 8, h, h, sp, 0, h); S.clean(h); S.claim(h); return true; } catch (e) { return false; } }));
check('hostile specs pick nothing', hostile.every((h) => S.pick(xs, ys, rs, 8, 0, 0, h, -1, out) === 0) && S.pick(xs, ys, rs, 8, NaN, 0, sp, -1, out) === 0 && S.pick(xs, ys, rs, 8, 0, 0, sp, -1, null) === 0 && S.pick(null, ys, rs, 8, 0, 0, sp, -1, out) === 0);
check('NaN/garbage enemy coordinates are skipped', S.pick([NaN, 5, 'a', Infinity, 8], [0, 0, 0, 0, 0], null, 5, 0, 0, { r: 30, max: 6 }, -1, out) === 2 && S.pick([1, 2], [1, 2], null, 99, 0, 0, { r: 30, max: 6 }, -1, out) === 2);
check('clean clamps radius/frac/max and zeroes max with no radius', (() => { const c = S.clean({ r: 500, frac: 9, max: 99, inner: -4, edge: 7 }); const z = S.clean({ r: 0, max: 5 }); return c.r === 80 && c.frac === 0.8 && c.max === 6 && c.inner === 0 && c.edge === 1 && z.max === 0 && S.clean(null).r === 0; })());
check('inputs are never mutated', (() => { const a = JSON.stringify([xs, ys, rs, sp]); S.pick(xs, ys, rs, 8, 0, 0, sp, 0, out); S.frac(3, sp); S.dmg(4, 3, sp); S.clean(sp); return JSON.stringify([xs, ys, rs, sp]) === a; })());

// the weapon splash data is within the kernel limits and consumable by it
check('every splash style spec is accepted unchanged by clean()', ['bow_blast', 'wand_burst', 'staff_comet', 'pistol_flak'].every((id) => { const s = W.STYLES[id].splash, c = S.clean(s); return c.r === s.r && c.frac === s.frac && c.max === s.max && c.r <= S.MAX_R && c.max <= S.MAX_TARGETS; }));
check('staff_comet cluster: 6 targets max, falloff lower further out', (() => { const s = W.STYLES.staff_comet.splash, cx = [0, 20, 30, 40, 50, 52, 54], cy = new Array(7).fill(0); const k = S.pick(cx, cy, null, 7, 0, 0, s, 0, out); return k === 6 && S.frac(S.dist[0], s) > S.frac(S.dist[5], s); })());

// allocation-free: heap delta over 1e5 calls stays well under 64 KB
check('pick allocates nothing (heap delta < 64 KB over 1e5 calls)', (() => {
  const ex = new Float32Array(32), ey = new Float32Array(32), er = new Float32Array(32), o = new Int16Array(6), s = { r: 56, frac: 0.6, inner: 0.35, edge: 0.5, max: 6 };
  for (let i = 0; i < 32; i++) { ex[i] = i * 3; ey[i] = (i % 5) * 4; er[i] = 6; }
  for (let i = 0; i < 2000; i++) S.pick(ex, ey, er, 32, 20, 5, s, 3, o);
  if (typeof global.gc === 'function') global.gc();
  const before = process.memoryUsage().heapUsed;
  let t = 0;
  for (let i = 0; i < 1e5; i++) t += S.pick(ex, ey, er, 32, 20, 5, s, 3, o);
  const delta = process.memoryUsage().heapUsed - before;
  return t > 0 && delta < 64 * 1024;
})());
console.log(n - bad + '/' + n + ' passed');
process.exit(bad ? 1 : 0);
