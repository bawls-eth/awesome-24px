// Golden guard for shared/mm-overworld.js (BIOME-ARCH-PLAN 1.2 rule 6). Run: node game/tests/shared-mm-overworld-golden.test.js
// tests/fixtures/overworld-golden.json holds MMOverworld.hash() for 24 seeds x 5 option sets, captured from the UNMODIFIED generator
// (before the biome-pack refactor). Every Realm world must stay byte-identical, so any hash change fails this test.
// Re-capturing is never part of a normal change: `--write` exists only to record the fixture on an untouched generator.
const fs = require('fs');
const path = require('path');
const O = require('../shared/mm-overworld.js');
let failed = 0;
function check(name, cond, extra = '') { console.log((cond ? 'PASS ' : 'FAIL ') + name + (cond ? '' : ' ' + extra)); if (!cond) failed++; }

const FIXTURE = path.join(__dirname, 'fixtures', 'overworld-golden.json');
const SEEDS = ['123', 'town-1', 'seed-x', 'seed-y', 'reach-1', 'ids-1', 'small', '0', '1', '42', '777777', 'abc', 'golden-a', 'golden-b',
  'verify-0', 'verify-17', 'bands-7', 'Hearthvale', 'mad maze', '999999', '100000', 'x', 'realm-seed-long-string-0123456789', '-5'];
const VARIANTS = { default: undefined, bandsClassic: { bands: 'classic' }, rosterClassic: { roster: 'classic' }, bossesClassic: { bosses: 'classic' }, size128: { size: 128 } };

// deep fingerprint: the arrays and fields O.hash() does not cover (height, difficulty, centre, coast radius, bands label, version)
function deep(w) {
  let h = 2166136261 >>> 0;
  const mix = function (arr) { for (let i = 0; i < arr.length; i++) { h ^= arr[i]; h = Math.imul(h, 16777619) >>> 0; } };
  mix(w.height); mix(w.difficulty);
  const s = JSON.stringify([w.w, w.h, w.seed, w.version, w.center, w.coastRadius, w.bands]);
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; }
  return h >>> 0;
}
let DEEP = {};
function capture() {
  const out = {};
  DEEP = {};
  Object.keys(VARIANTS).forEach(function (v) {
    out[v] = {}; DEEP[v] = {};
    SEEDS.forEach(function (s) { const w = O.generate(s, VARIANTS[v]); out[v][s] = O.hash(w); DEEP[v][s] = deep(w); });
  });
  return out;
}

if (process.argv.indexOf('--write') >= 0) {
  fs.mkdirSync(path.dirname(FIXTURE), { recursive: true });
  fs.writeFileSync(FIXTURE, JSON.stringify({ note: 'MMOverworld.hash() captured from the unmodified generator; must never change', seeds: SEEDS, hashes: capture(), deep: DEEP }, null, 1) + '\n');
  console.log('wrote ' + FIXTURE);
} else {
  const gold = JSON.parse(fs.readFileSync(FIXTURE, 'utf8'));
  check('fixture lists the 24 seeds', Array.isArray(gold.seeds) && gold.seeds.length === 24 && JSON.stringify(gold.seeds) === JSON.stringify(SEEDS));
  check('fixture holds 5 option sets', Object.keys(gold.hashes).length === 5 && Object.keys(VARIANTS).every(function (v) { return gold.hashes[v] && Object.keys(gold.hashes[v]).length === 24; }));
  const now = capture();
  let total = 0, same = 0;
  const diffs = [];
  Object.keys(VARIANTS).forEach(function (v) {
    let ok = 0;
    SEEDS.forEach(function (s) { total++; if (now[v][s] === gold.hashes[v][s]) { same++; ok++; } else diffs.push(v + '/' + s); });
    check(v + ': all 24 hashes identical to the golden fixture', ok === 24, diffs.slice(0, 4).join(', '));
  });
  check('all 120 golden hashes identical (' + same + '/' + total + ')', same === 120 && total === 120, diffs.slice(0, 6).join(', '));
  let dsame = 0;
  Object.keys(VARIANTS).forEach(function (v) { SEEDS.forEach(function (s) { if (DEEP[v][s] === gold.deep[v][s]) dsame++; }); });
  check('all 120 deep fingerprints (height, difficulty, centre, radius, bands) identical (' + dsame + '/120)', dsame === 120);
  check('hashes are distinct across seeds (fixture is not degenerate)', new Set(SEEDS.map(function (s) { return gold.hashes.default[s]; })).size === 24);
  check('option sets really change the world (bands/size differ from default)', SEEDS.every(function (s) { return gold.hashes.bandsClassic[s] !== gold.hashes.default[s] && gold.hashes.size128[s] !== gold.hashes.default[s]; }));
  check('a realm world carries no pack key', O.generate('123').pack === undefined);
}

console.log(failed ? failed + ' FAILED' : 'ALL PASSED');
process.exitCode = failed ? 1 : 0;
