// Cycle 7 S, ID-09 forgiving Town day count (spec: IDEAS.md "ID-09 / ID-18 implementation specs (D, cycle 7)"), part 1: the pure rule
// MMGameDay.visitStep(lastKey, days, todayKey) on UTC 'YYYY-MM-DD' keys. Days visited only ever go up; a gap of any length is +1, never a reset.
// The Town wiring (badge "Days in town N", toast, sell days, save keys, Backup) is NOT built yet; its browser checks join this file when it is.
// Node only (no page, no network). Run: node game/tests/cyc7-s-visit-days.test.js
const path = require('path');
let fails = 0;
const check = (name, ok, info) => { console.log((ok ? 'PASS ' : 'FAIL ') + name + (ok || info === undefined ? '' : ' ' + info)); if (!ok) fails++; };
const G = require(path.join(__dirname, '..', 'shared', 'mm-gameday.js'));
const V = G.visitStep;
check('visitStep is exported next to streakStep (which is still there)', typeof V === 'function' && typeof G.streakStep === 'function');
const T = '2026-11-25';
const row = (r) => [r.days, r.date, r.counted, r.write];
const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const table = [
  ['yesterday: +1', ['2026-11-24', 4, T], [5, T, true, true]],
  ['a 3-day gap: still +1, no reset', ['2026-11-22', 4, T], [5, T, true, true]],
  ['a 40-day gap: still +1, no reset', ['2026-10-16', 9, T], [10, T, true, true]],
  ['same day: nothing changes, nothing paid', [T, 4, T], [4, T, false, false]],
  ['clock was 1 day ahead: waits (nothing counted or written)', ['2026-11-26', 4, T], [4, '2026-11-26', false, false]],
  ['clock was 2 days ahead: waits', ['2026-11-27', 4, T], [4, '2026-11-27', false, false]],
  ['clock was 5 days ahead: date reset to today, not counted, count kept', ['2026-11-30', 4, T], [4, T, false, true]],
  ['a 1970 clock: untouched', [T, 7, '1970-01-01'], [7, T, false, false]],
  ['today not a real date: untouched', [T, 7, '2026-02-30'], [7, T, false, false]],
  ['garbage stored date: count + 1', ['yesterday', 6, T], [7, T, true, true]],
  ['garbage stored count: 0 + 1', ['2026-11-24', 'lots', T], [1, T, true, true]],
  ['a first visit (nothing stored): Day 1', [undefined, undefined, T], [1, T, true, true]],
  ['negative count: treated as unreadable (0 + 1)', ['2026-11-24', -3, T], [1, T, true, true]],
];
const bad = table.filter(([, a, want]) => !eq(row(V(a[0], a[1], a[2])), want)).map(([n, a, want]) => n + ' got ' + JSON.stringify(row(V(a[0], a[1], a[2]))) + ' want ' + JSON.stringify(want));
check('visitStep table (' + table.length + ' rows: gaps 1 / 3 / 40, same day, clock 1 / 2 / 5 days ahead, 1970, garbage)', bad.length === 0, bad.join(' | '));
// a run of daily visits with gaps: pays once per visited day, never resets
let d = 0, last; const pay = [];
['2026-11-20', '2026-11-20', '2026-11-21', '2026-11-25', '2026-12-30', '2026-12-30', '2027-01-01'].forEach((k) => { const r = V(last, d, k); if (r.write) { d = r.days; last = r.date; } pay.push(r.counted ? r.days : 0); });
check('a visit run with gaps (same day twice pays once): 1, 0, 2, 3, 4, 0, 5', eq(pay, [1, 0, 2, 3, 4, 0, 5]), JSON.stringify(pay));
// old save migration seed (the Town wiring will seed visitDays = max(loginStreak, 1) with lastVisitDate = lastLoginDate before stepping)
check('an old save with loginStreak 9 last seen yesterday seeds 9 and counts today as 10', V('2026-11-24', Math.max(9, 1), T).days === 10);
// never decreases over random sequences (seeded LCG: no Math.random)
let seed = 12345; const rnd = () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; };
const keyOf = (n) => new Date(n * 86400000).toISOString().slice(0, 10);
const base = G.keyNumber(T); let down = 0, steps = 0;
for (let s = 0; s < 5000; s++) {
  let days = Math.floor(rnd() * 50), lastK = keyOf(base - Math.floor(rnd() * 10));
  for (let i = 0; i < 6; i++) {
    const r = rnd(); const today = r < 0.1 ? 'junk' : r < 0.15 ? '1970-01-01' : keyOf(base + Math.floor(rnd() * 20) - 8);
    const o = V(lastK, days, today); steps++;
    if (o.days < days) down++;
    if (o.write) { days = o.days; lastK = o.date; }
  }
}
check('days never decreases over 5000 random sequences (30000 steps)', down === 0 && steps === 30000, 'down=' + down);
check('streakStep is untouched by ID-09 (yesterday +1, 3-day gap still resets the old streak to 1)', G.streakStep(G.keyNumber('2026-11-24'), 4, base).streak === 5 && G.streakStep(G.keyNumber('2026-11-22'), 4, base).streak === 1);
console.log(fails ? fails + ' FAILED' : 'ALL PASSED');
process.exit(fails ? 1 : 0);
