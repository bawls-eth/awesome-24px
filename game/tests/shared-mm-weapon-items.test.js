// Run: node game/tests/shared-mm-weapon-items.test.js
const fs = require('fs'), path = require('path');
const W = require('../shared/mm-weapon-items.js');
const MMWeapons = require('../shared/mm-weapons.js');
const MMRng = require('../shared/rng.js');
let n = 0, bad = 0;
function check(name, ok) { n++; if (!ok) { bad++; console.log('FAIL ' + name); } }
const b07 = new Set(JSON.parse(fs.readFileSync(path.join(__dirname, '../assets/arcane/b07-weapons-frontier-weapon-expansion/manifest.json'), 'utf8')).assets.map((a) => a.id));
const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);

check('30 items', W.ITEMS.length === 30);
check('ids match /^wpn_[a-z_]{3,24}$/', W.ITEMS.every((i) => /^wpn_[a-z_]{3,24}$/.test(i.id)));
check('ids unique', new Set(W.ITEMS.map((i) => i.id)).size === 30);
check('every item resolves in MMWeapons', W.ITEMS.every((i) => { const s = MMWeapons.get(i.style); return s && s.family === i.family && i.id === 'wpn_' + i.style && MMWeapons.resolve('ranger', i.style, 0); }));
check('first 26 items are the original styles in order', MMWeapons.altIds().slice(0, 26).every((sid, i) => W.ITEMS[i].style === sid));
check('covers all 30 alt styles, no class bases', eq(W.ITEMS.map((i) => i.style).sort(), MMWeapons.altIds().slice().sort()) && W.ITEMS.every((i) => !/^base_/.test(i.style)));
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
  return a.length === 4 && b.length === 8 && c.length === 12 && d.length === 12 && d.every((o) => W.get(o.id).family === 'bow' && o.r <= 2 && o.price === W.shopPrice(o.r));
})());
check('shop stock fixed (deterministic) and hostile safe', eq(W.shopStock('rogue', 5), W.shopStock('rogue', 5)) && W.shopStock('zzz', 5).length === 0 && W.shopStock('ranger', NaN).length === 4 && W.shopStock(null, 5).length === 0 && W.shopStock('ranger', -5).length === 4);
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
// G4 additions: the 4 splash items
const SPL = { wpn_bow_blast: 'wpn_icon_bow_blast', wpn_wand_burst: 'wpn_icon_wand_burst', wpn_staff_comet: 'wpn_icon_staff_comet', wpn_pistol_flak: 'wpn_icon_pistol_flak' };
check('G4 four splash items exist with the plan family/name/amount', Object.keys(SPL).every((id) => { const i = W.get(id); return i && i.slot === 'weapon' && i.amount === 0.45 && i.style === id.slice(4) && MMWeapons.get(i.style).splash.r > 0; }) && W.get('wpn_bow_blast').family === 'bow' && W.get('wpn_pistol_flak').family === 'pistol');
check('G4 splash items: art null (not delivered) with emoji fallback and the b29 art id recorded', Object.keys(SPL).every((id) => { const i = W.get(id); return i.art === null && i.artWanted === SPL[id] && !!i.icon; }) && W.ITEMS.filter((i) => i.artWanted === null).length === 26);
check('G4 splash item ids keep the id regex and equip by family', Object.keys(SPL).every((id) => W.ID_RE.test(id)) && W.canEquip('wpn_staff_comet', 'druid') && !W.canEquip('wpn_staff_comet', 'ranger') && /^Pistol: /.test(W.equipHint('wpn_pistol_flak')));
check('G4 clean keeps a splash item entry', eq(W.clean({ n: 2, id: 'wpn_bow_blast', r: 3 }), { n: 2, id: 'wpn_bow_blast', r: 3 }));
check('G4 drops can reach the new items', (() => { const seen = new Set(); const r = MMRng.create('g4-drop'); for (let i = 0; i < 6000; i++) seen.add(W.dropItem(r, 'ranger')); return Object.keys(SPL).every((id) => seen.has(id)); })());
console.log((bad ? 'FAILED ' + bad + ' of ' : 'ok ') + n + ' assertions'); process.exit(bad ? 1 : 0);
