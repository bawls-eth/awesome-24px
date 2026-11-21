// Run: node game/tests/shared-mm-weapon-items.test.js
const fs = require('fs'), path = require('path');
const W = require('../shared/mm-weapon-items.js');
const MMWeapons = require('../shared/mm-weapons.js');
const MMRng = require('../shared/rng.js');
let n = 0, bad = 0;
function check(name, ok) { n++; if (!ok) { bad++; console.log('FAIL ' + name); } }
const b07 = new Set(JSON.parse(fs.readFileSync(path.join(__dirname, '../assets/arcane/b07-weapons-frontier-weapon-expansion/manifest.json'), 'utf8')).assets.map((a) => a.id));
const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);

check('26 items', W.ITEMS.length === 26);
check('ids match /^wpn_[a-z_]{3,24}$/', W.ITEMS.every((i) => /^wpn_[a-z_]{3,24}$/.test(i.id)));
check('ids unique', new Set(W.ITEMS.map((i) => i.id)).size === 26);
check('every item resolves in MMWeapons', W.ITEMS.every((i) => { const s = MMWeapons.get(i.style); return s && s.family === i.family && i.id === 'wpn_' + i.style && MMWeapons.resolve('ranger', i.style, 0); }));
check('covers all 26 alt styles, no class bases', eq(W.ITEMS.map((i) => i.style).sort(), MMWeapons.altIds().slice().sort()) && W.ITEMS.every((i) => !/^base_/.test(i.style)));
check('RM_ITEMS shape: weapon slot, dmg 0.45', W.ITEMS.every((i) => i.slot === 'weapon' && i.stat === 'dmg' && i.amount === 0.45 && typeof i.name === 'string' && i.name && i.icon));
check('items frozen', Object.isFrozen(W.ITEMS) && Object.isFrozen(W.ITEMS[0]));
check('art ids (when set) exist in b07', W.ITEMS.every((i) => i.art === null || b07.has(i.art)));
check('get by id and hostile ids', W.get('wpn_bow_triple').family === 'bow' && ['nope', '__proto__', 'constructor', null, 5, {}, 'wpn_zzz'].every((x) => W.get(x) === null));
check('canEquip needs family match', W.canEquip('wpn_bow_triple', 'ranger') && !W.canEquip('wpn_bow_triple', 'frostcaller') && W.canEquip('wpn_wand_chain', 'graveTender') && W.canEquip('wpn_wand_chain', 'frostcaller'));
check('canEquip hostile input false', !W.canEquip('x', 'ranger') && !W.canEquip('wpn_bow_leaf', 'zzz') && !W.canEquip(null, null) && !W.canEquip('wpn_bow_leaf', '__proto__'));
check('equipHint "Bow: Ranger"', W.equipHint('wpn_bow_leaf') === 'Bow: Ranger' && W.equipHint('zzz') === '' && /^Staff: /.test(W.equipHint('wpn_staff_orb')));
check('sell x 8 pricing', W.shopPrice(0) === 24 && W.shopPrice(1) === 56 && W.shopPrice(2) === 120 && W.shopPrice(3) === 240 && W.SHOP_MULT === 8 && [0, 1, 2, 3].every((r) => W.shopPrice(r) === W.sellValue(r) * 8));
check('rarity hostile clamps', W.sellValue(-4) === 3 && W.sellValue(99) === 30 && W.sellValue('x') === 3 && W.sellValue(NaN) === 3);
check('shop stock gated by best wave, family only, never epic', (() => {
  const a = W.shopStock('ranger', 0), b = W.shopStock('ranger', 2), c = W.shopStock('ranger', 5), d = W.shopStock('ranger', 99);
  return a.length === 3 && b.length === 6 && c.length === 9 && d.length === 9 && d.every((o) => W.get(o.id).family === 'bow' && o.r <= 2 && o.price === W.shopPrice(o.r));
})());
check('shop stock fixed (deterministic) and hostile safe', eq(W.shopStock('rogue', 5), W.shopStock('rogue', 5)) && W.shopStock('zzz', 5).length === 0 && W.shopStock('ranger', NaN).length === 3 && W.shopStock(null, 5).length === 0 && W.shopStock('ranger', -5).length === 3);
const split = (cls, N) => { let fam = 0; const r = MMRng.create('w1-split:' + cls); for (let i = 0; i < N; i++) if (W.get(W.dropItem(r, cls)).family === W.familyFor(cls)) fam++; return fam / N; };
check('drop split ~70% family + 30% any (family share 0.70..0.80)', (() => { const s = split('ranger', 20000); return s > 0.70 && s < 0.80; })());
check('any-family drops can reach every family', (() => { const seen = new Set(); const r = MMRng.create('w1-any'); for (let i = 0; i < 4000; i++) seen.add(W.get(W.dropItem(r, 'ranger')).family); return seen.size === 11; })());
check('drop deterministic for equal rng seeds', (() => { const a = MMRng.create('x'), b = MMRng.create('x'); for (let i = 0; i < 50; i++) if (W.dropItem(a, 'paladin') !== W.dropItem(b, 'paladin')) return false; return true; })());
check('drop with fixed rng values', W.dropItem(() => 0, 'ranger') === 'wpn_bow_triple' && W.get(W.dropItem(() => 0.99, 'ranger')) !== null && W.dropItem(() => 0.5, 'nope') !== undefined);
check('drop with hostile rng/class safe', ['wpn_bow_triple'].every((x) => W.dropItem(null, 'ranger') === x) && W.get(W.dropItem(() => NaN, 5)) !== null && W.get(W.dropItem(() => 7, undefined)) !== null && W.get(W.dropItem(() => -3, 'ranger')) !== null);
check('drop never returns epic data / unknown ids', (() => { const r = MMRng.create('z'); for (let i = 0; i < 500; i++) if (!W.get(W.dropItem(r, 'trickster'))) return false; return true; })());
check('clean keeps valid and unknown-but-valid ids (inert)', eq(W.clean({ n: 4, id: 'wpn_bow_leaf', r: 2 }), { n: 4, id: 'wpn_bow_leaf', r: 2 }) && W.clean({ n: 1, id: 'wpn_future_style', r: 1 }).id === 'wpn_future_style');
check('clean rejects bad ids/shapes', [null, 5, 'x', {}, { id: 'wpn_a' }, { id: 'sword' }, { id: 'wpn_UPPER' }, { id: 'wpn_' + 'a'.repeat(25) }, { id: 5 }, { id: 'wpn_bow\nx' }, []].every((x) => W.clean(x) === null));
check('clean clamps r and n, drops unknown keys', (() => { const c = W.clean({ n: -3.7, id: 'wpn_bow_leaf', r: 99, evil: 1 }); return c.r === 3 && c.n === 0 && Object.keys(c).sort().join() === 'id,n,r'; })());
check('clean does not mutate input', (() => { const o = { n: 1, id: 'wpn_bow_leaf', r: 1 }; const s = JSON.stringify(o); W.clean(o); return JSON.stringify(o) === s; })());
check('each family has at least 2 items', MMWeapons.FAMILIES.every((f) => W.familyItems(f).length >= 2));
console.log((bad ? 'FAILED ' + bad + ' of ' : 'ok ') + n + ' assertions'); process.exit(bad ? 1 : 0);
