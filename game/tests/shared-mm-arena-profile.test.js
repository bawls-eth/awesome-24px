// Run: node game/tests/shared-mm-arena-profile.test.js  (pure MMClasses.arenaProfile)
const M = require('../shared/mm-classes.js');
let n = 0, bad = 0;
function check(name, ok) { n++; if (!ok) { bad++; console.log('FAIL ' + name); } }
const KEYS = ['hp', 'speed', 'dmg', 'rate', 'iframes'];
const ids = Object.keys(M.CLASSES);
ids.forEach((id) => {
  const p = M.arenaProfile(id);
  check(id + ' bounded [0.7,1.4]', KEYS.every((k) => p[k] >= 0.7 && p[k] <= 1.4 && Number.isFinite(p[k])));
  check(id + ' name', p.name === M.CLASSES[id].name);
  check(id + ' deterministic', JSON.stringify(p) === JSON.stringify(M.arenaProfile(id)));
});
check('ranger is baseline', KEYS.every((k) => M.arenaProfile('ranger')[k] === 1));
['nope', '', null, undefined, 42, '__proto__', 'constructor', 'toString'].forEach((u) => {
  const p = M.arenaProfile(u);
  check('unknown ' + String(u) + ' -> all 1', KEYS.every((k) => p[k] === 1) && p.name === '' && p.id === null);
});
const P = (i) => M.arenaProfile(i);
check('paladin hp > rogue hp', P('paladin').hp > P('rogue').hp);
check('rogue rate > paladin rate', P('rogue').rate > P('paladin').rate);
check('rogue speed > paladin speed', P('rogue').speed > P('paladin').speed);
check('berserker dmg > rogue dmg', P('berserker').dmg > P('rogue').dmg);
check('paladin iframes >= 1', P('paladin').iframes >= 1);
check('six new classes are distinguishable', new Set(['rogue', 'warlock', 'paladin', 'berserker', 'druid', 'necromancer'].map((i) => KEYS.map((k) => P(i)[k]).join())).size === 6);
console.log(n - bad + '/' + n + ' passed');
process.exit(bad ? 1 : 0);
