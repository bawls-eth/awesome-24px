// Run: node game/tests/shared-mm-arena-signature.test.js
const M = require('../shared/mm-classes.js');
let n = 0, bad = 0;
function check(name, ok) { n++; if (!ok) { bad++; console.log('FAIL ' + name); } }
const ids = Object.keys(M.CLASSES);
check('every class id is covered (>= 11)', ids.length >= 11);
ids.forEach((id) => {
  const s = M.arenaSignature(id);
  check(id + ' has a descriptor', !!s && typeof s === 'object');
  if (!s) return;
  check(id + ' kind is in the fixed list', M.SIG_KINDS.indexOf(s.kind) >= 0);
  check(id + ' slot F level 7', s.slot === 'F' && s.level === 7);
  check(id + ' cooldown bounded 5..30', Number.isFinite(s.cooldown) && s.cooldown >= 5 && s.cooldown <= 30);
  check(id + ' name/short/icon/id', s.name.length > 2 && s.short.length > 0 && s.short.length <= 9 && s.icon.length > 0 && s.id.length > 0);
  ['dmg', 'radius', 'dur', 'count', 'heal', 'shield', 'knock', 'range', 'dist', 'slow', 'healFrac'].forEach((k) => { if (k in s) check(id + '.' + k + ' finite non-negative', Number.isFinite(s[k]) && s[k] >= 0); });
  check(id + ' returns a fresh copy', M.arenaSignature(id) !== s);
});
const K = (id) => M.arenaSignature(id).kind, V = (id) => M.arenaSignature(id).variant;
check('rogue dash-volley', K('rogue') === 'dash-volley');
check('warlock drain-orb', K('warlock') === 'drain-orb');
check('frostcaller blizzard variant', K('frostcaller') === 'drain-orb' && V('frostcaller') === 'blizzard' && M.arenaSignature('frostcaller').slow > 0);
check('paladin oath-shield', K('paladin') === 'oath-shield');
check('herald aura-heal variant', K('herald') === 'oath-shield' && V('herald') === 'aura-heal');
check('berserker rage-slam', K('berserker') === 'rage-slam');
check('bruiser ground-pound variant', K('bruiser') === 'rage-slam' && V('bruiser') === 'ground-pound');
check('druid thorn-bloom', K('druid') === 'thorn-bloom');
check('necromancer bone-guard with 3 shards', K('necromancer') === 'bone-guard' && M.arenaSignature('necromancer').count === 3);
check('ranger volley', K('ranger') === 'volley');
['', 'nope', null, undefined, 5, {}, '__proto__', 'constructor', 'toString'].forEach((b) => check('unknown ' + String(b) + ' -> null', M.arenaSignature(b) === null));
console.log((bad ? 'FAILED ' + bad + ' of ' : 'ok ') + n + ' assertions');
process.exit(bad ? 1 : 0);
