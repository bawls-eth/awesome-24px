// Run: node game/tests/shared-mm-class-fire.test.js  (pure: MMClasses.arenaProfile fire tags + dps balance sim)
const M = require('../shared/mm-classes.js');
let n = 0, bad = 0;
function check(name, ok) { n++; if (!ok) { bad++; console.log('FAIL ' + name); } }
const ids = Object.keys(M.CLASSES);
// Theoretical dps relative to the ranger: shots x shotDmg x dmg x rate x pierce-weight x crit-weight (a pierce counts 25% of a hit).
const dps = (p) => p.shots * p.shotDmg * p.dmg * p.rate * (1 + 0.25 * p.pierce) * (1 + p.critChance);
const vals = ids.map((i) => dps(M.arenaProfile(i))).sort((a, b) => a - b);
const median = vals.length % 2 ? vals[(vals.length - 1) / 2] : (vals[vals.length / 2 - 1] + vals[vals.length / 2]) / 2;
ids.forEach((id) => {
  const p = M.arenaProfile(id), d = dps(p);
  check(id + ' dps ' + d.toFixed(2) + ' within +-30% of median ' + median.toFixed(2), d >= median * 0.7 && d <= median * 1.3);
  check(id + ' tags valid', Number.isInteger(p.shots) && p.shots >= 1 && p.shots <= 5 && p.spread >= 0 && p.spread <= 1 && Number.isInteger(p.pierce) && p.pierce >= 0 && p.pierce <= 3 && p.shotDmg > 0 && p.critChance >= 0 && p.critChance <= 0.5 && p.boltSpeed >= 0.5 && p.boltSpeed <= 1.3);
  check(id + ' single-shot has no spread', p.shots > 1 || p.spread === 0);
});
const r = M.arenaProfile('ranger');
check('ranger fire is today\'s single plain bolt', r.shots === 1 && r.spread === 0 && r.pierce === 0 && r.shotDmg === 1 && r.critChance === 0 && r.boltSpeed === 1);
check('ranger dps is exactly 1', dps(r) === 1);
check('mage-like classes pierce', M.arenaProfile('frostcaller').pierce >= 1 && M.arenaProfile('frostcaller').boltSpeed < 1);
check('warriors fan out', M.arenaProfile('berserker').shots >= 3 && M.arenaProfile('berserker').spread > 0);
check('rogue fires twin fast daggers with crits', M.arenaProfile('rogue').shots === 2 && M.arenaProfile('rogue').boltSpeed > 1 && M.arenaProfile('rogue').critChance > 0);
check('classes are not all identical', new Set(ids.map((i) => JSON.stringify([M.arenaProfile(i).shots, M.arenaProfile(i).spread, M.arenaProfile(i).pierce]))).size >= 6);
['nope', null, undefined, '__proto__'].forEach((u) => { const p = M.arenaProfile(u); check('unknown ' + String(u) + ' fire = plain', p.shots === 1 && p.spread === 0 && p.pierce === 0 && p.shotDmg === 1 && p.critChance === 0 && p.boltSpeed === 1); });
console.log(n - bad + '/' + n + ' passed');
process.exit(bad ? 1 : 0);
