// Run: node game/tests/shared-mm-gear-affix.test.js
const fs = require('fs'), path = require('path');
const A = require('../shared/mm-gear-affix.js');
const G = require('../shared/mm-gear.js');
let n = 0, bad = 0;
function check(name, ok) { n++; if (!ok) { bad++; console.log('FAIL ' + name); } }
const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const SEEDS = 5000;
const seedOf = (i) => 1 + ((i * 2654435761) >>> 0) % 4294967295;
const bandOf = (t) => (t >= 11 ? 2 : t >= 9 ? 1 : 0);

// ---- data ----
check('12 affixes: 7 weapon + 5 armor', A.IDS.length === 12 && A.SLOTS.weapon.length === 7 && A.SLOTS.armor.length === 5);
check('plan slots', eq(A.SLOTS.weapon.slice().sort(), ['blast', 'keen', 'leech', 'pierce', 'reach', 'swift', 'venom']) && eq(A.SLOTS.armor.slice().sort(), ['fleet', 'mend', 'resist', 'vital', 'ward']));
check('ranges spot checks from the plan', eq(A.AFFIXES.keen.ranges, [[0.03, 0.05], [0.04, 0.07], [0.06, 0.09]]) && eq(A.AFFIXES.blast.ranges[2], [8, 12]) && A.AFFIXES.leech.ranges[0] === null && A.AFFIXES.pierce.ranges[0] === null && eq(A.AFFIXES.ward.ranges, [[1, 1], [1, 1], [2, 2]]) && eq(A.AFFIXES.mend.ranges, [[0.5, 0.5], [0.8, 0.8], [1.2, 1.2]]));
check('ranges are ordered lo <= hi and rise with the band', A.IDS.every((id) => { const r = A.AFFIXES[id].ranges; return r.every((x) => !x || x[0] <= x[1]) && r.every((x, i) => i === 0 || !x || !r[i - 1] || (x[0] >= r[i - 1][0] && x[1] >= r[i - 1][1])); }));
check('data frozen', Object.isFrozen(A) && Object.isFrozen(A.AFFIXES) && Object.isFrozen(A.AFFIXES.keen) && Object.isFrozen(A.AFFIXES.keen.ranges[0]) && Object.isFrozen(A.IDS));
check('cap(t): 1 below T7, then 1.06 / 1.10 / 1.14', A.cap(1) === 1 && A.cap(6) === 1 && A.cap(7) === 1.06 && A.cap(8) === 1.06 && A.cap(9) === 1.10 && A.cap(10) === 1.10 && A.cap(11) === 1.14 && A.cap(12) === 1.14 && A.cap(13) === 1 && A.cap('9') === 1 && A.cap(NaN) === 1);
check('get is prototype safe', A.get('keen').slot === 'weapon' && ['__proto__', 'constructor', 'nope', null, 5].every((x) => A.get(x) === null));

// ---- roll: determinism, counts, ranges ----
const r1 = A.roll('wpn_bow_triple', 'weapon', 9, 2, 123456);
check('roll is deterministic', eq(r1, A.roll('wpn_bow_triple', 'weapon', 9, 2, 123456)) && eq(r1, A.roll('wpn_bow_triple', 'weapon', 9, 2, 123456)));
check('roll depends on the seed, id and tier', (() => { const s = new Set(); for (let i = 1; i <= 200; i++) s.add(JSON.stringify(A.roll('sparkwand', 'weapon', 9, 0, i))); return s.size > 100 && !eq(A.roll('sparkwand', 'weapon', 9, 0, 5), A.roll('wpn_bow_leaf', 'weapon', 9, 0, 5)) && !eq(A.roll('sparkwand', 'weapon', 9, 0, 5), A.roll('sparkwand', 'weapon', 10, 0, 5)); })());
check('roll output frozen and shaped { id, v }', Object.isFrozen(r1) && r1.every((e) => Object.isFrozen(e) && typeof e.id === 'string' && typeof e.v === 'number' && Object.keys(e).sort().join() === 'id,v'));
check('none below T7 (all slots, all r)', [1, 2, 3, 4, 5, 6].every((t) => ['weapon', 'armor'].every((s) => [0, 1, 2, 3].every((r) => A.roll('sparkwand', s, t, r, 42).length === 0))));
check('affix counts: T7-8 one, T9-11 two, T12 two', [7, 8].every((t) => A.roll('sparkwand', 'weapon', t, 0, 77).length === 1) && [9, 10, 11, 12].every((t) => ['weapon', 'armor'].every((s) => A.roll('sparkwand', s, t, 0, 77).length === 2)));
check('counts hold across all seeds, slots and rarities', [7, 8, 9, 10, 11, 12].every((t) => ['weapon', 'armor'].every((s) => { for (let i = 0; i < 300; i++) { const l = A.roll('x_' + s, s, t, i % 4, seedOf(i)); if (l.length !== (t >= 9 ? 2 : 1)) return false; } return true; })));
check('T12 with a matching signature adds a third entry, first slot-matching sig is kept once', (() => {
  const w = A.roll('sparkwand', 'weapon', 12, 1, 99, 'blast'), a = A.roll('arm_heavy_dread', 'armor', 12, 1, 99, 'ward');
  return w.length === 3 && w[2].id === 'blast' && a.length === 3 && a[2].id === 'ward' && new Set(w.map((e) => e.id)).size === 3 && new Set(a.map((e) => e.id)).size === 3;
})());
check('signature is ignored for the wrong slot, below T12 and for junk', A.roll('sparkwand', 'weapon', 12, 0, 9, 'ward').length === 2 && A.roll('sparkwand', 'weapon', 11, 0, 9, 'blast').length === 2 && A.roll('sparkwand', 'weapon', 12, 0, 9, '__proto__').length === 2 && A.roll('sparkwand', 'weapon', 12, 0, 9, 5).length === 2 && A.roll('sparkwand', 'weapon', 12, 0, 9, 'pierce').length === 3);
check('signature does not change the unsigned part of the roll order beyond excluding itself', (() => { const a = A.roll('sparkwand', 'weapon', 12, 0, 9), b = A.roll('sparkwand', 'weapon', 12, 0, 9, 'leech'); return a.length === 2 && b.length === 3 && b[2].id === 'leech' && !b.slice(0, 2).some((e) => e.id === 'leech'); })());
check('affixes match the item slot', ['weapon', 'armor'].every((s) => { for (let i = 0; i < 500; i++) if (!A.roll('x', s, 9 + (i % 4), i % 4, seedOf(i)).every((e) => A.get(e.id).slot === s)) return false; return true; }));
check('weapon leech and pierce never appear at T7-8; armor pool is valid there', (() => { for (let i = 0; i < 1500; i++) { const l = A.roll('x', 'weapon', 7 + (i % 2), 0, seedOf(i)); if (l.some((e) => e.id === 'leech' || e.id === 'pierce')) return false; } return true; })());
check('values in range for every tier, slot and rarity (5000 seeds each)', [7, 8, 9, 10, 11, 12].every((t) => ['weapon', 'armor'].every((s) => [0, 3].every((r) => {
  for (let i = 0; i < SEEDS; i++) {
    const l = A.roll('item_' + s, s, t, r, seedOf(i));
    for (let j = 0; j < l.length; j++) { const rg = A.rangeOf(l[j].id, t); if (!rg || l[j].v > rg[1] + 1e-9 || !(l[j].v >= 0)) return false; if (s === 'armor' && l[j].v < rg[0] - 1e-9) return false; }
  }
  return true;
}))));
check('weapon values are in range unless the power cap scaled them down', [7, 9, 11].every((t) => { for (let i = 0; i < 2000; i++) { const l = A.roll('w', 'weapon', t, 3, seedOf(i)); for (const e of l) { const rg = A.rangeOf(e.id, t); if (e.v < rg[0] - 1e-9 && !['keen', 'swift', 'venom', 'blast'].includes(e.id)) return false; } } return true; }));
check('uncapped weapon rolls stay at or above the range floor', (() => { for (let i = 0; i < 3000; i++) { const l = A.roll('w', 'weapon', 7, 3, seedOf(i)); const rg = A.rangeOf(l[0].id, 7); if (l[0].v < rg[0] - 1e-9) return false; } return true; })());
check('no duplicate affix ids in any roll', [7, 9, 12].every((t) => ['weapon', 'armor'].every((s) => { for (let i = 0; i < 2000; i++) { const l = A.roll('d', s, t, i % 4, seedOf(i), t === 12 ? (s === 'weapon' ? 'keen' : 'vital') : undefined); if (new Set(l.map((e) => e.id)).size !== l.length) return false; } return true; })));
check('values land on the quantisation grid (ints are whole, pct 3 dp)', (() => { for (let i = 0; i < 3000; i++) for (const s of ['weapon', 'armor']) for (const e of A.roll('g', s, 9 + (i % 4), i % 4, seedOf(i))) { const u = A.get(e.id).unit; if (u === 'int' && !Number.isInteger(e.v)) return false; if (u === 'pct' && Math.abs(Math.round(e.v * 1000) - e.v * 1000) > 1e-6) return false; } return true; })());

// ---- power cap ----
check('power cap holds over 5000 seeds per tier (r0..r3, with and without signature)', [7, 8, 9, 10, 11, 12].every((t) => {
  const c = A.cap(t);
  for (let i = 0; i < SEEDS; i++) {
    const sig = t === 12 ? ['keen', 'blast', 'venom', 'swift'][i % 4] : undefined;
    if (A.value(A.roll('cap', 'weapon', t, i % 4, seedOf(i), sig)) > c + 1e-9) return false;
  }
  return true;
}));
check('the cap actually binds (some T11-12 rolls are scaled down) but scaled values stay positive', (() => {
  let scaled = 0;
  for (let i = 0; i < 4000; i++) {
    const l = A.roll('cap2', 'weapon', 12, 3, seedOf(i), 'keen');
    if (l.some((e) => e.id === 'keen' && e.v < 0.06 - 1e-9)) scaled++;
    if (l.some((e) => e.v < 0)) return false;
  }
  return scaled > 100;
})());
check('value() is the DPS product and ignores non-DPS affixes', Math.abs(A.value([{ id: 'keen', v: 0.05 }, { id: 'swift', v: 0.04 }]) - 1.05 * 1.04) < 1e-12 && A.value([{ id: 'reach', v: 0.1 }, { id: 'leech', v: 0.03 }, { id: 'pierce', v: 1 }]) === 1 && A.value([{ id: 'vital', v: 0.1 }]) === 1 && A.value([]) === 1);
check('value() survives hostile lists', [null, undefined, 5, 'x', {}, [null], [5], [{}], [{ id: 5, v: 1 }], [{ id: 'keen', v: 'x' }], [{ id: 'keen', v: NaN }], [{ id: 'keen', v: -5 }], [{ id: '__proto__', v: 1 }]].every((x) => A.value(x) === 1));

// ---- rarity improves values, not count ----
check('r3 mean value >= r0 mean value (keen T9)', (() => {
  const mean = (r) => { let s = 0, k = 0; for (let i = 0; i < SEEDS; i++) for (const e of A.roll('mean', 'armor', 9, r, seedOf(i))) { s += (e.v - A.rangeOf(e.id, 9)[0]) / Math.max(1e-9, A.rangeOf(e.id, 9)[1] - A.rangeOf(e.id, 9)[0]) * (A.rangeOf(e.id, 9)[1] > A.rangeOf(e.id, 9)[0] ? 1 : 0); k += A.rangeOf(e.id, 9)[1] > A.rangeOf(e.id, 9)[0] ? 1 : 0; } return s / k; };
  const m0 = mean(0), m1 = mean(1), m2 = mean(2), m3 = mean(3);
  return m3 >= m0 && m2 >= m1 - 0.02 && m3 > m2 && m2 > m1 && Math.abs(m0 - m1) < 0.03 && m3 - m0 > 0.15;
})());
check('r3 mean >= r0 mean for weapon affixes too (single affix T7, uncapped)', (() => { const mean = (r) => { let s = 0; for (let i = 0; i < SEEDS; i++) { const e = A.roll('wm', 'weapon', 7, r, seedOf(i))[0], rg = A.rangeOf(e.id, 7); s += (e.v - rg[0]) / (rg[1] - rg[0]); } return s / SEEDS; }; return mean(3) > mean(0) + 0.1; })());
check('rarity never changes which affixes are rolled or how many', (() => { for (let i = 0; i < 500; i++) { const a = A.roll('same', 'weapon', 10, 0, seedOf(i)).map((e) => e.id).join(), b = A.roll('same', 'weapon', 10, 3, seedOf(i)).map((e) => e.id).join(); if (a !== b) return false; } return true; })());
check('r clamps (negative, huge, junk behave as r0 / r3)', eq(A.roll('c', 'armor', 9, -5, 321), A.roll('c', 'armor', 9, 0, 321)) && eq(A.roll('c', 'armor', 9, 99, 321), A.roll('c', 'armor', 9, 3, 321)) && eq(A.roll('c', 'armor', 9, 'x', 321), A.roll('c', 'armor', 9, 0, 321)) && eq(A.roll('c', 'armor', 9, NaN, 321), A.roll('c', 'armor', 9, 0, 321)));

// ---- hostile input ----
check('roll hostile id / slot / t / a returns frozen []', [
  [5, 'weapon', 9, 0, 1], [null, 'weapon', 9, 0, 1], ['x', 'charm', 9, 0, 1], ['x', '__proto__', 9, 0, 1], ['x', null, 9, 0, 1], ['x', 'weapon', 13, 0, 1], ['x', 'weapon', 0, 0, 1], ['x', 'weapon', 9.5, 0, 1], ['x', 'weapon', '9', 0, 1], ['x', 'weapon', NaN, 0, 1],
  ['x', 'weapon', 9, 0, 0], ['x', 'weapon', 9, 0, -3], ['x', 'weapon', 9, 0, 4294967296], ['x', 'weapon', 9, 0, 1.5], ['x', 'weapon', 9, 0, '5'], ['x', 'weapon', 9, 0, null], ['x'.repeat(65), 'weapon', 9, 0, 1], [],
].every((args) => { const l = A.roll.apply(null, args); return Array.isArray(l) && l.length === 0 && Object.isFrozen(l); }));
check('roll accepts the uint32 bounds', A.roll('x', 'weapon', 9, 0, 1).length === 2 && A.roll('x', 'weapon', 9, 0, 4294967295).length === 2);
check('describe gives plain text lines and skips junk', (() => {
  const d = A.describe([{ id: 'keen', v: 0.045 }, { id: 'blast', v: 9 }, { id: 'mend', v: 0.8 }, { id: 'pierce', v: 1 }, { id: 'ward', v: 2 }, null, 5, { id: 'nope', v: 1 }, { id: 'keen', v: 'x' }, { id: '__proto__', v: 1 }]);
  return eq(d, ['Keen +4.5% crit', 'Blast +9 px splash', 'Mend 0.8 HP/s after 3 s', 'Pierce +1', 'Ward +2 guard']) && Object.isFrozen(d);
})());
check('describe of every rolled affix has text, no markup, no NaN', (() => { for (let i = 0; i < 800; i++) for (const s of ['weapon', 'armor']) for (const line of A.describe(A.roll('t', s, 7 + (i % 6), i % 4, seedOf(i), 'leech'))) if (/[<>]|NaN|undefined|\[object/.test(line)) return false; return true; })());
check('describe hostile lists -> []', [null, undefined, 5, 'x', {}, [null], [{}]].every((x) => { const d = A.describe(x); return Array.isArray(d) && d.length === 0; }));
check('describe shows the capped values (matches roll output exactly)', (() => { const l = A.roll('desc', 'weapon', 12, 3, 4242, 'keen'); const d = A.describe(l); return d.length === l.length && d[l.findIndex((e) => e.id === 'keen')].indexOf(String(Math.round(l.find((e) => e.id === 'keen').v * 1000) / 10)) > 0; })());
check('sum() totals by id and survives junk', (() => { const s = A.sum([{ id: 'ward', v: 1 }, { id: 'ward', v: 1 }, { id: 'vital', v: 0.1 }, null, { id: 'nope', v: 3 }, { id: 'keen', v: NaN }]); return s.ward === 2 && s.vital === 0.1 && !('nope' in s) && !('keen' in s) && eq(A.sum('x'), {}); })());
check('roll never mutates AFFIXES / inputs and the module stays frozen', (() => { const s = JSON.stringify(A.AFFIXES); A.roll('m', 'weapon', 12, 3, 5, 'keen'); return JSON.stringify(A.AFFIXES) === s; })());
check('no Math.random, clock or timers in the module', (() => { const src = fs.readFileSync(path.join(__dirname, '../shared/mm-gear-affix.js'), 'utf8').replace(/\/\/.*$/gm, ''); return !/Math\.random|Date\.now|setTimeout|setInterval|new Date/.test(src); })());
check('drops module seeds feed straight into roll (T7+ rolls get 1-2+ affixes)', (() => { const D = require('../shared/mm-gear-drops.js'); let ok = 0; for (let i = 0; i < 400; i++) { const it = D.rollGear({ src: 'boss', zone: 3, always: true, cls: 'ranger', r: i % 4 }, 'aff' + i); const l = A.roll(it.id, it.slot, it.t, it.r, it.a, it.sig); if (l.length >= (it.t >= 9 ? 2 : 1)) ok++; } return ok === 400; })());
check('tier rows in MMGear agree on the affix counts', G.TIERS.every((r) => (r.t < 7 ? 0 : r.t < 9 ? 1 : 2) === r.affixes) && A.MIN_T === G.AFFIX_MIN_T);
check('band helper agrees across tiers', [7, 8, 9, 10, 11, 12].every((t) => A.cap(t) === A.CAPS[bandOf(t)]));
console.log((bad ? 'FAILED ' + bad + ' of ' : 'ok ') + n + ' assertions'); process.exit(bad ? 1 : 0);
