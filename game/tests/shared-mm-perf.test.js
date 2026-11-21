// Unit tests for shared/mm-perf.js (MMPerf). Run: node game/tests/shared-mm-perf.test.js
const P = require('../shared/mm-perf.js');
let failed = 0;
function check(name, cond, extra = '') { console.log((cond ? 'PASS ' : 'FAIL ') + name + (cond ? '' : ' ' + extra)); if (!cond) failed++; }
const fill = (ms, n) => Array.from({ length: n }, () => ms);

const hi = P.profile(fill(16, 60), {});
check('smooth frames give high tier', hi.tier === 'high');
check('high caps: dpr 2, sparks 64, ghosts 24, terrain on', hi.caps.dpr === 2 && hi.caps.sparks === 64 && hi.caps.deathGhosts === 24 && hi.caps.terrainAnim === true);
const mid = P.profile(fill(28, 60), {});
check('mid caps: dpr 1.5, sparks 32, ghosts 12, terrain on', mid.tier === 'mid' && mid.caps.dpr === 1.5 && mid.caps.sparks === 32 && mid.caps.deathGhosts === 12 && mid.caps.terrainAnim === true);
const low = P.profile(fill(50, 60), {});
check('low caps: dpr 1, sparks 12, ghosts 4, terrain off', low.tier === 'low' && low.caps.dpr === 1 && low.caps.sparks === 12 && low.caps.deathGhosts === 4 && low.caps.terrainAnim === false);
check('lowGfx forces low even on fast frames', P.profile(fill(8, 60), { lowGfx: true }).tier === 'low' && P.profile(fill(8, 60), { lowGfx: true }).forced === true);
check('lowGfx overrides previous high state', P.profile(fill(8, 60), { lowGfx: true }, hi).tier === 'low');
check('lowGfx must be exactly true', P.profile(fill(8, 60), { lowGfx: 'yes' }).tier === 'high');

check('steps down immediately', P.profile(fill(50, 10), {}, hi).tier === 'low');
const stay = P.profile(fill(16, 60), {}, low);   // 60 x 16ms = 0.96 s
check('does not step up before 3 s of good frames', stay.tier === 'low' && stay.goodMs > 900 && stay.goodMs < 1000);
const s2 = P.profile(fill(16, 60), {}, stay);    // 1.92 s
check('good time accumulates across calls', s2.tier === 'low' && s2.goodMs > 1900);
const s3 = P.profile(fill(16, 60), {}, s2);      // 2.88 s
check('still low just under 3 s', s3.tier === 'low');
const s4 = P.profile(fill(16, 60), {}, s3);      // 3.84 s
check('steps up one tier after 3 s', s4.tier === 'mid' && s4.goodMs === 0);
check('steps up one tier at a time', P.profile(fill(16, 300), {}, low).tier === 'mid');
const reset = P.profile(fill(16, 60), {}, { tier: 'low', goodMs: 2900 });
check('3 s boundary reached steps up', reset.tier === 'mid');
check('a bad window resets progress', P.profile(fill(50, 10), {}, { tier: 'mid', goodMs: 2900 }).goodMs === 0);
check('matching window resets progress', P.profile(fill(28, 30), {}, { tier: 'mid', goodMs: 2900 }).goodMs === 0);

check('too few samples keep previous tier', P.profile([5, 5], {}, low).tier === 'low' && P.profile([], {}, mid).tier === 'mid');
check('no samples and no prev defaults to high', P.profile([], {}).tier === 'high' && P.profile(undefined, undefined).tier === 'high');
const samples = fill(50, 10), prev = { tier: 'high', goodMs: 12 };
const ss = JSON.stringify(samples), ps = JSON.stringify(prev);
P.profile(samples, { lowGfx: false }, prev);
check('inputs never mutated', JSON.stringify(samples) === ss && JSON.stringify(prev) === ps);
const c1 = P.profile(fill(16, 60), {});
c1.caps.sparks = 0;
check('returned caps are a copy of the table', P.CAPS.high.sparks === 64 && P.profile(fill(16, 60), {}).caps.sparks === 64);
check('deterministic', JSON.stringify(P.profile(fill(30, 40), {}, mid)) === JSON.stringify(P.profile(fill(30, 40), {}, mid)));
let safe = true;
for (const h of [null, undefined, NaN, 'x', {}, [NaN, 'a', null, -5, Infinity, 0], [1e12, 1e12, 1e12, 1e12, 1e12], fill(-1, 20)]) {
  try {
    for (const prevH of [undefined, null, 'x', { tier: 'zzz', goodMs: NaN }, { tier: 'mid', goodMs: Infinity }, { tier: 'low', goodMs: -9 }]) {
      const r = P.profile(h, h, prevH);
      if (!P.TIERS.includes(r.tier) || !isFinite(r.goodMs) || r.goodMs < 0 || !r.caps) safe = false;
    }
  } catch (e) { safe = false; }
}
check('hostile input never throws and stays valid', safe);
check('huge spike frames are clamped (no overflow into goodMs)', P.profile(fill(1e9, 5), {}, { tier: 'low', goodMs: 0 }).tier === 'low');

console.log(failed ? `${failed} FAILED` : 'ALL PASSED');
process.exitCode = failed ? 1 : 0;
