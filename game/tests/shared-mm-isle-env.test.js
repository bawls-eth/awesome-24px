// Unit tests for shared/mm-isle-env.js (NEXT-SLICES-2 X5). Run: node game/tests/shared-mm-isle-env.test.js
// 1 swimAt: deep water needs a swim mount; warmth on the tundra drains in 90 s, at 0 slows to x0.8 and deals no damage.
// 2 oxygen on mars lasts 120 s with an o2_tank; at 0 it costs 1 HP / 3 s with a 10 s warning; gravity gives move x1.15, dash +40%.
// 3 every meter is pure and deterministic in t, nothing takes or returns items or tames, and each rule has an exported kill-switch flag.
const fs = require('fs');
const path = require('path');
const E = require('../shared/mm-isle-env.js');
const C = require('../shared/mm-creatures.js');
const BP = require('../shared/mm-biome-packs.js');
let failed = 0;
function check(name, cond, extra = '') { console.log((cond ? 'PASS ' : 'FAIL ') + name + (cond ? '' : ' ' + extra)); if (!cond) failed++; }

// ---- 1. swim ----
const tide = C.get('tidesteed'), tusk = C.get('tusktop');
check('1: deep water (lagoon, coral, kelp, deep_water) needs swim on foot', ['lagoon', 'coral_shallows', 'kelp_bed', 'deep_water'].every((n) => { const r = E.swimAt(n, null); return r.deep && r.needSwim && !r.ok; }));
check('1: a swim mount crosses it (def, ride block, ride state)', E.swimAt('lagoon', tide).ok && E.swimAt('lagoon', { swim: true }).ok && E.swimAt('lagoon', { m: { swim: true } }).ok && !E.swimAt('lagoon', { m: { swim: true }, down: true }).ok);
check('1: a land mount does not; dry land is fine on foot', !E.swimAt('lagoon', tusk).ok && E.swimAt('jungle_floor', null).ok && !E.swimAt('jungle_floor', null).deep && E.swimAt('tide_pool', null).ok);
check('1: a pack hazard with swim / breath counts as deep', ['lagoon', 'coral_shallows', 'kelp_bed'].every((n) => E.swimAt('x_' + n, null, BP.get('reef').hazards[n]).needSwim));

const w0 = E.warmth(0, false, false), w45 = E.warmth(45, false, false), w89 = E.warmth(89.9, false, false), w90 = E.warmth(90, false, false), w300 = E.warmth(300, false, false);
check('1: warmth drains in 90 s (full at 0, half at 45, empty at 90)', w0.val === 1 && w0.pct === 100 && Math.abs(w45.val - 0.5) < 1e-9 && !w89.empty && w90.empty && w90.left === 0, JSON.stringify([w45, w90]));
check('1: at 0 warmth the hero is slowed to x0.8 and takes no damage', w90.slow === 0.8 && w0.slow === 1 && w89.slow === 1 && w90.dmg === 0 && w300.dmg === 0 && w300.slow === 0.8 && !('hurt' in w300));
check('1: a fire refills, a cloak doubles the time, 10 s warning', E.warmth(30, true, false).rate < 0 && E.warmth(30, false, false).rate === 1 && E.warmth(90, false, true).val === 0.5 && E.warmth(179, false, true).warn && !E.warmth(179, false, true).empty && E.warmth(81, false, false).warn && !E.warmth(70, false, false).warn);
{ // simulate: 90 s out, then 20 s by a fire
  let t = 0; for (let i = 0; i < 900; i++) t = E.advance(t, E.warmth(t, false, false).rate, 0.1, 90);
  const cold = E.warmth(t, false, false);
  for (let i = 0; i < 200; i++) t = E.advance(t, E.warmth(t, true, false).rate, 0.1, 90);
  check('1: advance() runs the meter down in 90 s and a fire fills it again', cold.empty && Math.abs(cold.t - 90) < 0.01 && E.warmth(t, true, false).val === 1, JSON.stringify([cold.t, t]));
}

// ---- 2. oxygen + gravity ----
const o = (t, d, k) => E.oxygen(t, d, k);
check('2: oxygen lasts 120 s with an o2_tank (90 s without)', !o(119.9, false, true).empty && o(120, false, true).empty && o(90, false, false).empty && !o(89, false, false).empty && o(60, false, true).val === 0.5);
check('2: a 10 s warning before 0', o(111, false, true).warn && !o(109, false, true).warn && !o(120, false, true).warn && o(81, false, false).warn);
check('2: at 0 it costs 1 HP every 3 s (hurt counts the HP since empty)', o(120, false, true).hurt === 0 && o(122.9, false, true).hurt === 0 && o(123, false, true).hurt === 1 && o(129, false, true).hurt === 3 && o(150, false, true).hurt === 10 && o(120, false, true).dmg === 1 && o(100, false, true).dmg === 0 && o(100, false, true).hurt === 0);
check('2: shelter refills at once even long past empty', E.advance(500, -8, 1, 120) === 112 && E.advance(500, 1, 1, 120) === 501 && E.advance(5, -8, 1, 120) === 0);
check('2: a dome refills and oxygen never slows', o(60, true, true).rate < 0 && o(60, false, true).rate === 1 && o(500, false, true).slow === 1);
{ // 60 s of sim past empty: 20 HP exactly
  let t = 0, lost = 0, prev = 0; for (let i = 0; i < 1800; i++) { t = E.advance(t, o(t, false, true).rate, 0.1, 120); const m = o(t, false, true); if (m.hurt > prev) lost += m.hurt - prev; prev = m.hurt; }
  check('2: 180 s outside with a tank -> 120 s of air, then 20 HP over 60 s', lost === 20, String(lost));
}
const gm = E.gravity('mars'), gj = E.gravity('jungle');
check('2: mars gravity gives move x1.15 and dash +40%; elsewhere x1', gm.move === 1.15 && gm.dash === 1.4 && gj.move === 1 && gj.dash === 1 && E.gravity(undefined).move === 1);
check('2: the mars pack agrees (hazards.gravity)', BP.get('mars').hazards.gravity.move === gm.move && BP.get('mars').hazards.gravity.dash === gm.dash);

// ---- 3. pure, seeded on t, no items / tames, kill switches ----
const args = [[0, false, false], [12.5, true, true], [77.7, false, true], [400, true, false]];
check('3: every meter is deterministic in t', args.every((a) => JSON.stringify(E.warmth(...a)) === JSON.stringify(E.warmth(...a)) && JSON.stringify(E.oxygen(...a)) === JSON.stringify(E.oxygen(...a))) && JSON.stringify(E.swimAt('lagoon', tide)) === JSON.stringify(E.swimAt('lagoon', tide)));
check('3: junk input is safe (NaN, strings, negative, huge)', [NaN, 'x', -5, 1e12, null, undefined].every((t) => { const a = E.warmth(t), b = E.oxygen(t); return isFinite(a.val) && isFinite(b.val) && a.val >= 0 && a.val <= 1 && b.hurt >= 0 && b.hurt <= 200; }));
const inv = Object.freeze({ feast: 2, o2_tank: 1 }), stable = Object.freeze({ roster: Object.freeze([Object.freeze({ id: 't1', sp: 'tusktop' })]) });
const outs = [E.warmth(500, false, inv), E.oxygen(500, false, inv), E.swimAt('lagoon', stable), E.gravity('mars')];
const KEYS = ['t', 'max', 'left', 'val', 'pct', 'empty', 'warn', 'rate', 'slow', 'dmg', 'hurt', 'nextHurt', 'deep', 'needSwim', 'ok', 'move', 'dash'];
check('3: no meter returns anything but numbers / flags (nothing that could remove items or tames)', outs.every((r) => Object.keys(r).every((k) => KEYS.indexOf(k) >= 0 && (typeof r[k] === 'number' || typeof r[k] === 'boolean'))), JSON.stringify(outs));
const src = fs.readFileSync(path.join(__dirname, '..', 'shared', 'mm-isle-env.js'), 'utf8').replace(/\/\/.*$/gm, '');
check('3: the source never reads storage, the clock, randomness, the DOM or the network, and never names inv / roster', !/localStorage|Date|Math\.random|document|window\.|fetch|XMLHttpRequest|firebase|\binv\b|roster|tames/.test(src));
check('3: every rule has an exported kill-switch flag name', E.FLAGS.all === 'env' && ['swim', 'warmth', 'oxygen', 'gravity'].every((k) => typeof E.FLAGS[k] === 'string' && E.FLAGS[k].length > 0) && Object.isFrozen(E.FLAGS) && Object.isFrozen(E.K));
const q = (s) => { const u = new URLSearchParams(s); return u.get.bind(u); };
check('3: rules(): tundra = warmth, mars = oxygen + gravity, reef = swim', E.rules('tundra', q('')).warmth && !E.rules('tundra', q('')).oxygen && E.rules('mars', q('')).oxygen && E.rules('mars', q('')).gravity && E.rules('reef', q('')).swim && !E.rules('meadow', q('')).warmth);
check('3: ?env=0 turns every rule off; one flag turns one off', Object.values(E.rules('mars', q('env=0'))).every((v) => v === false) && Object.values(E.rules('tundra', { env: 0 })).every((v) => v === false) &&
  !E.rules('mars', q('oxygen=0')).oxygen && E.rules('mars', q('oxygen=0')).gravity && !E.rules('tundra', q('warmth=0')).warmth && E.rules('tundra', null).warmth);

console.log(failed ? failed + ' FAILED' : 'ALL PASS');
process.exit(failed ? 1 : 0);
