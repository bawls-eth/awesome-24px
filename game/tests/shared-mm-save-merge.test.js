// MMSaveMerge (shared/mm-save-merge.js): merge-on-write so a stale second tab never undoes another tab's save. Node only, no storage, no network.
// Replays the races save-race-tabs.test.js found (pop / stack / echo / dash bests and rounds, jam assist, deepdelve runs, angler fun, bugs pb,
// medals) through write(), plus hostile inputs, a full storage (left untouched) and additive-only behaviour (a storage-only field is kept).
// Run: node game/tests/shared-mm-save-merge.test.js
'use strict';
const M = require('../shared/mm-save-merge.js');
const FX = require('./save-compat-fixtures.js');
let failed = 0;
function check(name, cond, extra) { console.log((cond ? 'PASS ' : 'FAIL ') + name + (cond ? '' : ' ' + (extra || ''))); if (!cond) failed++; }
function mem(init) { const m = Object.assign({}, init || {}); return { _m: m, getItem: (k) => (k in m ? m[k] : null), setItem: (k, v) => { m[k] = String(v); } }; }
const J = (o) => JSON.stringify(o);
const P = (s) => JSON.parse(s);

// Two tabs: both load the same save, A finishes a great round, then stale B finishes a poor one.
function race(key, start, aRound, bRound) {
  const st = mem({ [key]: J(start) });
  const baseA = P(st._m[key]), baseB = P(st._m[key]);
  const a = aRound(JSON.parse(J(baseA))), b = bRound(JSON.parse(J(baseB)));
  M.write(st, key, baseA, a, M.SPECS[key]);
  M.write(st, key, baseB, b, M.SPECS[key]);
  return P(st._m[key]);
}
for (const [key, bestF, cnt] of [['pixeltown-pop-v1', 'best', 'rounds'], ['pixeltown-stack-v1', 'best', 'rounds'], ['pixeltown-echo-v1', 'best', 'rounds'], ['pixeltown-dash-v1', 'best', 'runs']]) {
  const start = FX.FIXTURES[key].value;
  const r = race(key, start,
    (s) => Object.assign(s, { [bestF]: start[bestF] + 500, [cnt]: s[cnt] + 1, medals: s.medals.concat(['bigA']) }),
    (s) => Object.assign(s, { [bestF]: start[bestF], [cnt]: s[cnt] + 1, medals: s.medals.concat(['smallB']), hint: true }));
  check(`${key}: tab A's best survives a stale tab B write`, r[bestF] === start[bestF] + 500, J(r));
  check(`${key}: both tabs' rounds are counted once each`, r[cnt] === start[cnt] + 2, J(r));
  check(`${key}: medals from both tabs are kept, old ones first`, J(r.medals) === J(start.medals.concat(['bigA', 'smallB'])), J(r.medals));
}
{
  const key = 'pixeltown-jam-assist-v1';
  const st = mem({ [key]: J({ on: false, best: {}, section: {} }) });
  const baseB = P(st._m[key]);
  M.write(st, key, P(st._m[key]), { on: false, best: { 'warm-embers': { easy: { score: 4321, rank: 'A' } } }, section: { 'warm-embers:easy:100:1-8': 9 } }, M.SPECS[key]); // tab A
  M.write(st, key, baseB, { on: true, best: { 'warm-embers': { easy: { score: 100, rank: 'D' } } }, section: { 'warm-embers:easy:100:1-8': 3 } }, M.SPECS[key]); // stale B toggles Assist
  const r = P(st._m[key]);
  check('jam assist: stale tab toggling Assist keeps A\'s best entry (score with its rank) and section', r.on === true && r.best['warm-embers'].easy.score === 4321 && r.best['warm-embers'].easy.rank === 'A' && r.section['warm-embers:easy:100:1-8'] === 9, J(r));
}
{
  const key = 'pixeltown-deepdelve-runs-v1';
  const r = race(key, FX.FIXTURES[key].value,
    (s) => { s.runs++; s.best.score = 900; s.best.depth = 30; return s; },
    (s) => { s.runs++; s.safe++; s.best.ores = 50; return s; });
  check('deepdelve runs: best score/depth from A and ores from B, both runs counted', r.best.score === 900 && r.best.depth === 30 && r.best.ores === 50 && r.runs === 6 && r.safe === 3, J(r));
}
{
  const key = 'pixeltown-angler-fun-v1';
  const r = race(key, { v: 1, bestStreak: 3, bestReact: 200, streak: 0, cond: { windy: { size: 10, react: 300, n: 1 } } },
    (s) => Object.assign(s, { bestStreak: 9, bestReact: 150, streak: 9 }),
    (s) => Object.assign(s, { bestReact: 0, streak: 0, cond: { windy: { size: 40, react: 300, n: 2 } } }));
  check('angler fun: best streak / fastest reaction / per-condition bests all kept', r.bestStreak === 9 && r.bestReact === 150 && r.cond.windy.size === 40 && r.cond.windy.n === 2, J(r));
}
{
  const key = 'pixeltown-bugs-pb-v1';
  const r = race(key, { v: 1, combo: { meadow: 5 }, runs: 2, mod: {} },
    (s) => { s.combo.meadow = 12; s.runs++; return s; },
    (s) => { s.combo.orchard = 4; s.mod = { meadow: { calm: 300 } }; s.runs++; return s; });
  check('bugs pb: per-arena combos and modifier bests from both tabs, runs 2 + 2', r.combo.meadow === 12 && r.combo.orchard === 4 && r.mod.meadow.calm === 300 && r.runs === 4, J(r));
}
{
  const st = mem({ k: J({ v: 1, m: ['a', 'b'] }) });
  M.write(st, 'k', { v: 1, m: ['a'] }, { v: 1, m: ['a', 'c'] }, M.SPECS.medals);
  check('medals {v, m}: union keeps stored ids and adds new ones', J(P(st._m.k).m) === J(['a', 'b', 'c']), st._m.k);
}
// additive: a field only storage has (written by a newer build) is kept; a setting mine changed wins
{
  const st = mem({ k: J({ v: 1, best: 5, future: { x: 1 }, hint: false }) });
  M.write(st, 'k', { v: 1, best: 5, hint: false }, { v: 1, best: 5, hint: true, rounds: 1 }, M.SPECS['pixeltown-pop-v1']);
  const r = P(st._m.k);
  check('additive: a storage-only field survives the write, mine adds its fields', r.future && r.future.x === 1 && r.hint === true && r.rounds === 1, J(r));
}
// same tab writing twice with base = its last write never double counts
{
  const key = 'pixeltown-pop-v1', st = mem({ [key]: J({ v: 1, best: 0, rounds: 0, medals: [] }) });
  let base = P(st._m[key]), mine = Object.assign({}, base, { rounds: 1 });
  base = M.write(st, key, base, mine, M.SPECS[key]).value;
  mine = Object.assign({}, base, { rounds: 2 });
  M.write(st, key, base, mine, M.SPECS[key]);
  check('one tab: two writes with base = last written value count 2 rounds, not 3', P(st._m[key]).rounds === 2, st._m[key]);
}
// a full storage is left untouched
{
  const st = mem({ k: J({ v: 1, best: 7 }) });
  st.setItem = () => { const e = new Error('quota'); e.name = 'QuotaExceededError'; throw e; };
  const r = M.write(st, 'k', {}, { v: 1, best: 9 }, M.SPECS['pixeltown-pop-v1']);
  check('quota: write reports ok:false and storage keeps the old value', r.ok === false && st._m.k === J({ v: 1, best: 7 }), J(r));
}
// hostile stored / base / mine / spec values never throw, never pollute
{
  const bad = [null, undefined, 1, 'x', [], NaN, { __proto__: { polluted: 1 } }, JSON.parse('{"__proto__":{"polluted":1},"best":"9","medals":"x","rounds":-5}'), { best: Infinity, medals: [{}, null, 'a', 'a'] }];
  let threw = 0, polluted = 0, notObj = 0;
  bad.forEach((s) => bad.forEach((b) => bad.forEach((m) => [M.SPECS['pixeltown-pop-v1'], M.SPECS['pixeltown-jam-assist-v1'], null, { max: ['__proto__.x'], union: ['constructor'] }].forEach((sp) => {
    try { const o = M.merge(s, b, m, sp); if (!o || typeof o !== 'object') notObj++; JSON.stringify(o); } catch (e) { threw++; }
    if (({}).polluted !== undefined) { polluted++; delete Object.prototype.polluted; }
  }))));
  check(`hostile: ${bad.length ** 3 * 4} merges never throw, always return an object, never pollute Object.prototype`, !threw && !polluted && !notObj, J({ threw, polluted, notObj }));
  const st = mem({ k: 'x'.repeat(3000000) });
  check('hostile: an oversized stored string is treated as empty (no hang)', M.write(st, 'k', {}, { v: 1, best: 1 }, M.SPECS['pixeltown-pop-v1']).value.best === 1);
}
// idempotent on every old fixture: merge(x, x, x) === x (a tab that changed nothing writes back exactly what is stored)
{
  const bad = [];
  Object.keys(M.SPECS).forEach((k) => { const f = FX.FIXTURES[k]; if (!f || !f.value) return; const v = f.value; const r = M.merge(v, v, v, M.SPECS[k]); if (J(r) !== J(v)) bad.push(k + ' ' + J(r)); });
  check('idempotent: merge(x, x, x) returns x for every fixture with a spec', !bad.length, bad.join(' | '));
}
console.log(failed ? failed + ' FAILED' : 'ALL PASSED');
process.exitCode = failed ? 1 : 0;
