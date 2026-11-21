// Node test for MMDDTime. Run: node game/tests/shared-mm-dd-time.test.js
const path = require('path');
const T = require(path.join(__dirname, '../shared/mm-dd-time.js'));
let passed = 0, failed = 0;
function check(name, cond) { if (cond) passed++; else { failed++; console.log('FAIL: ' + name); } }

check('period is 6 minutes', T.PERIOD === 360);
check('noon is full sun, scale 1, day stage', T.sun(T.NOON) === 1 && T.skyScale(T.NOON) === 1 && T.stage(T.NOON) === 'day');
check('midnight is dark: sun 0, min scale, night stage', T.sun(270) === 0 && T.skyScale(270) === T.MIN_SCALE && T.stage(270) === 'night');
check('stages go day, dusk, night, dawn through a cycle', T.stage(120) === 'day' && T.stage(180) === 'dusk' && T.stage(270) === 'night' && T.stage(360) === 'dawn');
check('the clock wraps and handles bad input', T.norm(365) === 5 && T.norm(-10) === 350 && T.norm(NaN) === T.NOON && T.sun(360 * 7 + 90) === T.sun(90));
let mono = true, steps = new Set();
for (let t = 0; t <= 180; t += 1) { if (T.sun(t + 1) > T.sun(t) + 1e-9 && t > 90) mono = false; steps.add(T.skyStep(t)); }
check('sun only falls between noon and midnight', mono);
check('sky scale is quantised (few rebuild steps per day)', (() => { const s = new Set(); for (let t = 0; t < 360; t++) s.add(T.skyScale(t)); return s.size <= T.STEPS + 1; })());
const day = T.skyColor(T.NOON), night = T.skyColor(270);
check('day sky is the bright blue 0x8fd0ff, night sky is near black', Math.abs(day[0] - 0x8f / 255) < 1e-9 && Math.abs(day[2] - 1) < 1e-9 && night[0] < 0.05 && night[2] < 0.12);
check('all sky channels stay within 0..1', (() => { for (let t = 0; t < 360; t += 5) for (const v of T.skyColor(t)) if (!(v >= 0 && v <= 1)) return false; return true; })());
check('clock text is HH:MM, noon phase reads 12:00', T.clockText(T.NOON) === '12:00' && /^\d\d:\d\d$/.test(T.clockText(123.4)));
check('deterministic: same input, same output', JSON.stringify(T.skyColor(77.7)) === JSON.stringify(T.skyColor(77.7)));
console.log(passed + ' passed, ' + failed + ' failed');
process.exit(failed ? 1 : 0);
