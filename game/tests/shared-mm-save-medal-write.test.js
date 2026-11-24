// cycle1 L-15: dash / echo / pop / stack each carried the same merge-on-write block. It is one function now,
// MMSaveMerge.writeMedalSave. This test keeps the OLD block (copied word for word from echo.js at 86eda4b) as the oracle and
// checks, over 3000 seeded cases and the four real save keys, that the new helper stores exactly the same bytes under both keys,
// leaves the tab's save / base exactly the same, and behaves the same when storage refuses the first or the second write.
// Node only, no storage, no network. Run: node game/tests/shared-mm-save-medal-write.test.js
'use strict';
const M = require('../shared/mm-save-merge.js');
let failed = 0;
function check(name, cond, extra) { console.log((cond ? 'PASS ' : 'FAIL ') + name + (cond ? '' : ' ' + (extra || ''))); if (!cond) failed++; }
const MKEY = 'pixeltown-arcade-medals-v1';
const OKM = ['bronze', 'silver', 'gold', 'star', 'combo'];
const int = (v, cap) => (typeof v === 'number' && Number.isFinite(v) && v > 0 ? Math.min(cap, Math.floor(v)) : 0);
// a cleaner in the games' style: known fields only, medals filtered to known ids
const cleaners = {
  'pixeltown-echo-v1': (o) => { o = o && typeof o === 'object' ? o : {}; return { v: 1, hint: o.hint === true, best: int(o.best, 1e7), bestScore: int(o.bestScore, 1e9), rounds: int(o.rounds, 1e9), medals: Array.isArray(o.medals) ? o.medals.filter((m, i, a) => OKM.indexOf(m) >= 0 && a.indexOf(m) === i) : [] }; },
  'pixeltown-pop-v1': (o) => { o = o && typeof o === 'object' ? o : {}; return { v: 1, hint: o.hint === true, best: int(o.best, 1e9), bestTile: int(o.bestTile, 1e6), bestChain: int(o.bestChain, 1e4), rounds: int(o.rounds, 1e9), medals: Array.isArray(o.medals) ? o.medals.filter((m, i, a) => OKM.indexOf(m) >= 0 && a.indexOf(m) === i) : [] }; },
  'pixeltown-stack-v1': (o) => { o = o && typeof o === 'object' ? o : {}; return { v: 1, hint: o.hint === true, best: int(o.best, 1e7), bestCombo: int(o.bestCombo, 1e4), rounds: int(o.rounds, 1e9), medals: Array.isArray(o.medals) ? o.medals.filter((m, i, a) => OKM.indexOf(m) >= 0 && a.indexOf(m) === i) : [] }; },
  'pixeltown-dash-v1': (o) => { o = o && typeof o === 'object' ? o : {}; return { v: 1, hint: o.hint === true, best: int(o.best, 1e7), bestScore: int(o.bestScore, 1e9), bestCombo: int(o.bestCombo, 1e4), runs: int(o.runs, 1e9), medals: Array.isArray(o.medals) ? o.medals.filter((m, i, a) => OKM.indexOf(m) >= 0 && a.indexOf(m) === i) : [], ghost: o.ghost && typeof o.ghost === 'object' && typeof o.ghost.seed === 'string' ? { seed: o.ghost.seed, dist: int(o.ghost.dist, 1e7) } : null }; },
};
// storage that can refuse the Nth setItem
function mem(init, failAt) { const m = Object.assign({}, init || {}); let n = 0; return { _m: m, getItem: (k) => (k in m ? m[k] : null), setItem: (k, v) => { n++; if (n === failAt) throw new Error('QuotaExceededError'); m[k] = String(v); } }; }

// ---- the old block, word for word (localStorage -> storage, readRaw() -> the parsed stored value) ----
function oldWrite(storage, KEY, clean, st) {
  const readRaw = () => { try { const s = storage.getItem(KEY); return typeof s === 'string' ? JSON.parse(s) : null; } catch (e) { return null; } };
  let save = st.save; let base = st.base;
  const raw = readRaw(), mine = Object.assign({}, save);
  const v = M.merge(raw, base, mine, M.SPECS[KEY]);
  Object.assign(v, clean(v), { medals: Array.isArray(v.medals) ? v.medals.slice(0, 200) : [] }); // ids a newer build added stay stored
  storage.setItem(KEY, JSON.stringify(v)); // throws on a full storage: save / base stay as they were, the next write retries
  Object.assign(save, clean(v)); base = JSON.parse(JSON.stringify(save)); st.base = base;
  let mk = null;
  try { const s = storage.getItem(MKEY); mk = typeof s === 'string' && s.length < 20000 ? JSON.parse(s) : null; } catch (e) { mk = null; }
  storage.setItem(MKEY, JSON.stringify(Object.assign(M.merge(mk, null, { v: 1, m: save.medals.slice() }, M.SPECS.medals), { v: 1 })));
}
// ---- the new call, as the four games make it ----
function newWrite(storage, KEY, clean, st) {
  const readRaw = () => { try { const s = storage.getItem(KEY); return typeof s === 'string' ? JSON.parse(s) : null; } catch (e) { return null; } };
  M.writeMedalSave(storage, KEY, MKEY, readRaw(), st.base, Object.assign({}, st.save), clean, (c) => { Object.assign(st.save, c); st.base = JSON.parse(JSON.stringify(st.save)); });
}

check('MMSaveMerge.writeMedalSave exists', typeof M.writeMedalSave === 'function');
// seeded generator (mulberry32)
function rng(a) { return () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const R = rng(20261124);
const pick = (a) => a[Math.floor(R() * a.length)];
const medalList = () => { const n = Math.floor(R() * 5); const out = []; for (let i = 0; i < n; i++) out.push(pick(OKM.concat(['future_medal', 'x' + Math.floor(R() * 4), 7, null]))); return out; };
const numv = () => pick([0, 1, 5, 40, 999, Math.floor(R() * 5000), -3, 1.5, NaN, '12', null, undefined]);
function genSave(KEY, wild) {
  const o = { v: 1, hint: pick([true, false]), best: numv(), bestScore: numv(), bestCombo: numv(), bestTile: numv(), bestChain: numv(), medals: medalList() };
  o[KEY === 'pixeltown-dash-v1' ? 'runs' : 'rounds'] = numv();
  if (KEY === 'pixeltown-dash-v1' && R() < 0.5) o.ghost = { seed: 's' + Math.floor(R() * 3), dist: Math.floor(R() * 900) };
  if (wild) { if (R() < 0.3) o.newerField = { a: 1, list: [1, 2] }; if (R() < 0.1) o.medals = pick(['bad', null, { 0: 'gold' }]); if (R() < 0.1) delete o.v; }
  return o;
}
const KEYS = Object.keys(cleaners);
let cases = 0; let diff = 0; let firstDiff = ''; let threwMain = 0; let threwMedal = 0; let withStored = 0;
for (let i = 0; i < 3000 && typeof M.writeMedalSave === 'function'; i++) {
  const KEY = KEYS[i % KEYS.length]; const clean = cleaners[KEY];
  const init = {};
  const r = R();
  if (r < 0.75) { init[KEY] = JSON.stringify(genSave(KEY, true)); withStored++; } else if (r < 0.82) init[KEY] = pick(['{bad json', '[]', 'null', '"x"', '12']);
  if (R() < 0.6) init[MKEY] = pick([JSON.stringify({ v: 1, m: medalList() }), JSON.stringify({ v: 1, m: ['gold', 'other_game_medal'] }), '{oops', JSON.stringify({ m: 'no' })]);
  const failAt = pick([0, 0, 0, 0, 1, 2]);
  const base0 = clean(genSave(KEY, false)); const save0 = clean(Object.assign({}, base0, genSave(KEY, false)));
  const run = (fn) => {
    const storage = mem(init, failAt); const st = { save: JSON.parse(JSON.stringify(save0)), base: JSON.parse(JSON.stringify(base0)) }; let threw = '';
    try { fn(storage, KEY, clean, st); } catch (e) { threw = e.message; }
    // a second write with nothing new must not move anything either (counts never added twice), when storage works again
    const again = mem(storage._m, 0); let threw2 = '';
    try { fn(again, KEY, clean, st); } catch (e) { threw2 = e.message; }
    return JSON.stringify({ a: storage._m, b: again._m, save: st.save, base: st.base, threw, threw2 });
  };
  const a = run(oldWrite); const b = run(newWrite);
  cases++; if (failAt === 1) threwMain++; if (failAt === 2) threwMedal++;
  if (a !== b) { diff++; if (!firstDiff) firstDiff = 'case ' + i + ' ' + KEY + ' failAt ' + failAt + '\n old ' + a + '\n new ' + b; }
}
check('3000 seeded cases ran over the four save keys (' + withStored + ' with a stored save, ' + threwMain + ' with the first write refused, ' + threwMedal + ' with the second)', cases === 3000 && withStored > 1500 && threwMain > 300 && threwMedal > 300, String(cases));
check('stored bytes (both keys), the tab save, its base and the thrown error are identical to the old block in every case', diff === 0, diff + ' differ; ' + firstDiff);

// plain cases, readable
if (typeof M.writeMedalSave === 'function') {
  const KEY = 'pixeltown-echo-v1'; const clean = cleaners[KEY];
  const s = mem({ [KEY]: JSON.stringify({ v: 1, best: 50, bestScore: 900, rounds: 10, medals: ['gold', 'future_medal'], newerField: 3 }) });
  const st = { base: clean({ best: 20, rounds: 4, medals: ['bronze'] }), save: clean({ best: 30, rounds: 6, medals: ['bronze', 'silver'] }) };
  newWrite(s, KEY, clean, st);
  const stored = JSON.parse(s._m[KEY]);
  check('a stale tab cannot lower the best, rounds add only its own 2, medals unite, a newer field and a newer medal id stay', stored.best === 50 && stored.bestScore === 900 && stored.rounds === 12 && JSON.stringify(stored.medals) === JSON.stringify(['gold', 'future_medal', 'bronze', 'silver']) && stored.newerField === 3, JSON.stringify(stored));
  check('the tab now holds the cleaned merged save and base equals it', st.save.best === 50 && st.save.rounds === 12 && JSON.stringify(st.save.medals) === JSON.stringify(['gold', 'bronze', 'silver']) && JSON.stringify(st.base) === JSON.stringify(st.save), JSON.stringify(st));
  check('the shared medals key holds the cleaned medals', JSON.stringify(JSON.parse(s._m[MKEY])) === JSON.stringify({ v: 1, m: ['gold', 'bronze', 'silver'] }), s._m[MKEY]);
  const before = JSON.stringify(s._m); newWrite(s, KEY, clean, st);
  check('writing again with nothing new changes nothing (no double count)', JSON.stringify(s._m) === before, JSON.stringify(s._m));
  const full = mem({ [KEY]: JSON.stringify({ v: 1, best: 5, rounds: 1, medals: [] }) }, 1); const st2 = { base: clean({ rounds: 1 }), save: clean({ rounds: 2, best: 9 }) }; let threw = false;
  try { newWrite(full, KEY, clean, st2); } catch (e) { threw = true; }
  check('a full storage: it throws like before, storage and the tab state are untouched', threw && JSON.parse(full._m[KEY]).rounds === 1 && st2.save.rounds === 2 && st2.base.rounds === 1 && !(MKEY in full._m), JSON.stringify([full._m, st2]));
}

// the four games use the helper and no longer carry the block
const fs = require('fs'); const path = require('path');
['dash/dash.js', 'echo/echo.js', 'pop/pop.js', 'stack/stack.js'].forEach((f) => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'games', f), 'utf8');
  check(f + ' calls MMSaveMerge.writeMedalSave and has no copy of the merge block', /\.writeMedalSave\(/.test(src) && !/M\.merge\(mk, null/.test(src) && !/M\.merge\(raw, base, mine/.test(src));
  const html = fs.readFileSync(path.join(__dirname, '..', 'games', f.split('/')[0], 'index.html'), 'utf8');
  check(f.split('/')[0] + '/index.html loads shared/mm-save-merge.js before the game script', html.indexOf('mm-save-merge.js') > 0 && html.indexOf('mm-save-merge.js') < html.lastIndexOf(f.split('/')[1]));
});

console.log(failed ? failed + ' FAILED' : 'ALL PASSED');
process.exit(failed ? 1 : 0);
