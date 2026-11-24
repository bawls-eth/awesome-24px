// Unit tests for shared/mm-telegraph.js (MMTelegraph). Run: node game/tests/shared-mm-telegraph.test.js
const T = require('../shared/mm-telegraph.js');
const A = require('../shared/mm-access.js');
let failed = 0;
function check(name, cond, extra = '') { console.log((cond ? 'PASS ' : 'FAIL ') + name + (cond ? '' : ' ' + extra)); if (!cond) failed++; }

check('tier 1 and 2 have no windup', T.forVolley('ring', 1, false).windup === 0 && T.forVolley('ring', 2, false).windup === 0);
check('tier 3+ windup is 0.4s (ID-14 audit: raised from 0.35)', T.forVolley('ring', 3, false).windup === 0.4 && T.forVolley('aimed', 5, false).windup === 0.4);
check('bosses windup is 0.6s at any tier', T.forVolley('ring', 1, true).windup === 0.6 && T.forVolley('ring', 4, true).windup === 0.6);
check('shapes: ring / line / cone', T.forVolley('ring', 3, false).shape === 'ring' && T.forVolley('aimed', 3, false).shape === 'line' && T.forVolley('fan', 3, false).shape === 'cone');
check('pattern object accepted', T.forVolley({ kind: 'spread' }, 3, false).shape === 'cone' && T.forVolley({ type: 'line' }, 3, false).shape === 'line');
check('unknown pattern defaults to ring', T.forVolley('weird', 3, false).shape === 'ring' && T.forVolley('__proto__', 3, false).shape === 'ring');
check('colour comes from MMAccess palette enemy', T.forVolley('ring', 3, false).color === A.palette('normal').enemy);
check('colour follows colour-blind palette', T.forVolley('ring', 3, false, { palette: 'deuteranopia' }).color === A.palette('deuteranopia').enemy && T.forVolley('ring', 3, false, { palette: 'protanopia' }).color === A.PALETTES.protanopia.enemy);
check('unknown palette falls back to normal', T.forVolley('ring', 3, false, { palette: 'nope' }).color === A.PALETTES.normal.enemy);
const rm = T.forVolley('ring', 3, false, { reduced: true });
const nm = T.forVolley('ring', 3, false);
check('reduced is a static, non-pulsing style', rm.pulse === false && rm.style === 'static' && rm.reduced === true && nm.pulse === true && nm.style === 'pulse');
check('reduced keeps windup and shape', rm.windup === nm.windup && rm.shape === nm.shape);
check('no windup means no pulse and inactive', T.forVolley('ring', 1, false).pulse === false && T.forVolley('ring', 1, false).active === false && nm.active === true);
check('identical output per input', JSON.stringify(T.forVolley('fan', 4, true, { palette: 'tritanopia' })) === JSON.stringify(T.forVolley('fan', 4, true, { palette: 'tritanopia' })));
const pat = { kind: 'fan' }, opts = { reduced: true, palette: 'protanopia' };
const ps = JSON.stringify(pat), os = JSON.stringify(opts);
T.forVolley(pat, 3, false, opts);
check('inputs never mutated', JSON.stringify(pat) === ps && JSON.stringify(opts) === os);
check('returns a fresh object each call', T.forVolley('ring', 3, false) !== T.forVolley('ring', 3, false));
let safe = true;
for (const h of [null, undefined, NaN, 'x', {}, [], 1e9, -1, Infinity, '3']) {
  try {
    const d = T.forVolley(h, h, h, h);
    if (!['ring', 'line', 'cone'].includes(d.shape) || ![0, 0.4, 0.6].includes(d.windup) || typeof d.color !== 'string') safe = false;
  } catch (e) { safe = false; }
}
check('hostile input never throws and yields a valid descriptor', safe);
check('non-boolean isBoss does not make a boss', T.forVolley('ring', 1, 'yes').windup === 0 && T.forVolley('ring', '5', false).windup === 0);

console.log(failed ? `${failed} FAILED` : 'ALL PASSED');
process.exitCode = failed ? 1 : 0;
