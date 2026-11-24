// Cycle 5 D, b03-r3 (P2): pins the Trial of Six numbers that the cycle 5 measurements rest on (see game/design/beta/cycle5-design.md). This is a
// PIN, not a fix: fight 1 measured in band (66-69 s, 0 damage for a dodging bot at 17-59 Hz; a non-dodging orbiter dies in 33 s after 7 hits of
// 32 HP), so no tuning was applied. If someone changes the ramp or the boss multipliers, this fails and the table in the report must be re-measured
// with game/design/beta/tools/trial-bot.js. Pure node, no page, no DB.
// Run: node game/tests/cyc5-d-trial-numbers.test.js
const E = require('../shared/mm-endgame.js');
let failed = 0;
function check(name, cond, extra = '') { console.log((cond ? 'PASS ' : 'FAIL ') + name + (cond ? '' : ' ' + extra)); if (!cond) failed++; }
const l = E.rushLadder('cyc5', 20);
check('opens at Lv 20 with six steps', l.ok && l.steps.length === 6 && E.RUSH.minLevel === 20);
check('ramp: hp 1.0 1.0 1.04 1.04 1.08 1.1, dmg 1.0 1.0 1.02 1.04 1.06 1.08 (never above +10% hp)', JSON.stringify(E.RUSH.ramp) === JSON.stringify({ hp: [1, 1, 1.04, 1.04, 1.08, 1.1], dmg: [1, 1, 1.02, 1.04, 1.06, 1.08] }) && E.RUSH.rampCap === 1.1);
const first = l.steps[0], last = l.steps[5];
check('fight 1 uses the unramped zone-3 boss multipliers (hp x99, dmg x4.004)', first.hpMul === 99 && first.dmgMul === 4.004, first.hpMul + ' / ' + first.dmgMul);
check('fight 6 is at most 10.0% hp and 8% dmg above fight 1', Math.abs(last.hpMul / first.hpMul - 1.1) < 1e-3 && last.dmgMul / first.dmgMul <= 1.081, last.hpMul + ' / ' + last.dmgMul);
check('the 0.6 s wind-up is not touched by any step', l.steps.every((s) => s.windup === 0.6));
console.log(failed ? failed + ' FAILED' : 'ALL PASSED');
process.exit(failed ? 1 : 0);
