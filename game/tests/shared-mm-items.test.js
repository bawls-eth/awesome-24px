// Node test for shared/mm-items.js (no playwright). Run: node game/tests/shared-mm-items.test.js
const path = require('path');
const I = require(path.join(__dirname, '..', 'shared', 'mm-items.js'));
const R = require(path.join(__dirname, '..', 'shared', 'rng.js'));
let n = 0, fails = 0;
function check(name, ok) { n++; if (!ok) { fails++; console.log('FAIL', name); } else console.log('ok  ', name); }
function done() { console.log(n - fails + '/' + n + ' passed'); process.exit(fails ? 1 : 0); }

const legacy = ['sparkwand', 'quickwand', 'heartcharm', 'swiftcharm', 'luckring', 'scholarring', 'wardring'];
check('7 legacy ids map', legacy.every((id) => { const it = I.fromLegacy(id, 1); return it && it.legacyId === id && it.tier === 1; }));
check('legacy rarity -> tier 0..2', [0, 1, 2].every((r) => I.fromLegacy('sparkwand', r).tier === r));
check('unknown legacy id null', I.fromLegacy('__proto__', 0) === null && I.fromLegacy('nope', 0) === null);
const sling = I.makeWeapon('ranger', 0), blade = I.makeWeapon('punk', 3);
check('own weapon equips', I.canEquip(sling, 'ranger') && I.canEquip(blade, 'punk'));
check('wrong class weapon refused', !I.canEquip(sling, 'punk') && !I.canEquip(blade, 'ranger'));
check('armor family check', I.canEquip(I.makeArmor('heavy', 2), 'bruiser') && !I.canEquip(I.makeArmor('heavy', 2), 'ranger'));
check('charm any class', I.KLASSES.every((k) => I.canEquip(I.makeCharm('c', 1, 'LIFE', 4), k)));
check('weapon dmg T0/T8 match design', I.damageRange('ranger', 0).join() === '12,20' && I.damageRange('ranger', 8).join() === '40,56');

const mk = (kind, tier) => ({ kind, tier });
check('bag colour of items', I.bagColor(mk('weapon', 2)) === 'brown' && I.bagColor(mk('weapon', 4)) === 'pink' &&
  I.bagColor(mk('armor', 6)) === 'purple' && I.bagColor(mk('weapon', 8)) === 'cyan' && I.bagColor(mk('charm', 0)) === 'pink');
check('bag colour = best item', I.bestBagColor([mk('weapon', 1), mk('weapon', 7), mk('weapon', 4)]) === 'cyan');
check('potion bag ranks above gear', I.bestBagColor([{ kind: 'potion' }, mk('weapon', 3)]) === 'blue');

const rng = R.create('items-drop');
let brown = 0; const N = 10000;
for (let i = 0; i < N; i++) if (I.dropBag(rng, 1).includes('brown')) brown++;
check('brown rate 0.10 +-0.01 (' + brown / N + ')', Math.abs(brown / N - 0.10) <= 0.01);
check('tier 1 never drops purple', (() => { const r = R.create('p'); for (let i = 0; i < 5000; i++) if (I.dropBag(r, 1).includes('purple')) return false; return true; })());
check('dropBag deterministic', JSON.stringify(Array.from({ length: 50 }, (_, i) => I.dropBag(R.create('s' + i), 3))) === JSON.stringify(Array.from({ length: 50 }, (_, i) => I.dropBag(R.create('s' + i), 3))));

check('xpToNext 1, 10, 19', I.xpToNext(1) === 50 && I.xpToNext(10) === 1400 && I.xpToNext(19) === 4370);
check('total xp to level 20 = 32300', I.totalXpToLevel(20) === 32300);

check('potion refused below 20', !I.canDrink(19, 'POW', 10, 50).ok);
check('potion +2 applied at 20', (() => { const r = I.canDrink(20, 'POW', 10, 50); return r.ok && r.gain === 2 && r.value === 12; })());
check('potion at cap refused, kept', (() => { const r = I.canDrink(20, 'POW', 45, I.capFor('ranger', 'POW')); return !r.ok && r.reason === 'already maxed' && r.value === 45; })());
check('Life potion +10, greater doubles', I.canDrink(20, 'LIFE', 100, 560).gain === 10 && I.canDrink(20, 'WIT', 1, 50, true).gain === 4);
check('potion clamps to cap', I.canDrink(20, 'WIT', 44, 45).value === 45);
done();
