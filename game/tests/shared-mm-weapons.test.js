// Run: node game/tests/shared-mm-weapons.test.js  (pure: MMWeapons styles, resolve normalisation, balance, bounds)
const W = require('../shared/mm-weapons.js');
const C = require('../shared/mm-classes.js');
let n = 0, bad = 0;
function check(name, ok) { n++; if (!ok) { bad++; console.log('FAIL ' + name); } }
const classes = Object.keys(C.CLASSES);
const near = (a, b, e) => Math.abs(a - b) <= (e === undefined ? 1e-9 : e);
const label = (h) => (typeof h === 'symbol' ? 'symbol' : typeof h === 'function' ? 'fn' : String(h));

// 40 styles, schema valid
const ids = W.styleIds();
check('40 styles', ids.length === 40);
check('26 alternates + 14 bases', W.altIds().length === 26 && ids.filter((i) => /^base_/.test(i)).length === 14);
ids.forEach((id) => { const p = W.validate(W.STYLES[id]); check(id + ' schema valid ' + p.join(','), p.length === 0); });
check('styles are frozen', Object.isFrozen(W.STYLES) && Object.isFrozen(W.STYLES.bow_triple) && Object.isFrozen(W.STYLES.bow_triple.wave));
check('validate rejects junk', W.validate(null).length > 0 && W.validate({}).length > 0 && W.validate(Object.assign({}, W.STYLES.bow_triple, { pierce: 9 })).length > 0);
check('every class has a family', classes.every((c) => W.familyOf(c)) && W.familyOf('nope') === null && W.familyOf('__proto__') === null);
check('every family has a class and 2+ alternate styles', W.FAMILIES.every((f) => classes.some((c) => W.familyOf(c) === f) && W.stylesForFamily(f).length >= 2));
check('11 families', W.FAMILIES.length === 11);

// plan data spot checks
const S = W.STYLES;
check('bow_triple 3 arrows fan .18', S.bow_triple.count === 3 && S.bow_triple.spread === 0.18 && S.bow_triple.life === 0.75 && S.bow_triple.tune === 1.06);
check('bow_triple shapeIdx 1.2', near(W.shapeIdx(S.bow_triple), 1.2, 1e-9));
check('bow_longshot 616 px', Math.round(S.bow_longshot.spd * 580 * S.bow_longshot.life) === 616);
check('blade_arc 157 px arc', Math.round(S.blade_arc.spd * 580 * S.blade_arc.life) === 157);
check('hammer_throw boomerang, wand_chain chain 2', S.hammer_throw.boomerang && S.wand_chain.chain.n === 2 && S.wand_chain.chain.falloff === 0.7);
check('tome_orbit orbit 2', S.tome_orbit.orbit.n === 2 && S.tome_orbit.orbit.dmg === 0.25);
check('lob radii', S.staff_bloom.lob.radius === 40 && S.hammer_smite.lob.radius === 48);

// base_<class> equals FIRE; ranger resolves to plain bolt
classes.forEach((c) => {
  const p = C.arenaProfile(c), b = S['base_' + c];
  check(c + ' base_ equals FIRE', b && b.count === p.shots && b.spread === p.spread && b.pierce === p.pierce && b.dmg === p.shotDmg && b.crit === p.critChance && b.spd === p.boltSpeed);
  check(c + ' base keeps range (life*spd = .85)', near(b.life * b.spd, 0.85, 1e-3));
  const r = W.resolve(c, 'base', 0);
  check(c + ' resolve base = FIRE', r.base === true && r.count === p.shots && r.dmg === p.shotDmg && r.pierce === p.pierce);
});
const rg = W.resolve('ranger', 'base', 0);
check('resolve(ranger, base, 0) is the plain bolt', rg.plain === true && rg.count === 1 && rg.spread === 0 && rg.spd === 1 && rg.life === 0.85 && rg.dmg === 1 && rg.pierce === 0 && rg.crit === 0 && rg.bounce === 0 && rg.homing === 0 && !rg.boomerang && rg.wave.amp === 0 && rg.chain.n === 0 && rg.orbit.n === 0 && rg.burst.n === 1 && rg.lob.radius === 0 && rg.onHit.status === null);
check('ranger base idx is exactly 1', rg.idx === 1);
check('non-ranger base is not plain', W.resolve('rogue', 'base', 0).plain === false);
check('plan example: ranger bow_triple dmg 0.353', near(W.resolve('ranger', 'bow_triple', 0).dmg, 0.353, 0.001));
check('resolved spec frozen', Object.isFrozen(rg) && Object.isFrozen(W.resolve('ranger', 'bow_triple', 3)) && Object.isFrozen(W.resolve('ranger', 'bow_triple', 3).affixes));

// balance: every class x {base + family styles} x 4 rarities
const mult = W.RARITY_MULT;
for (let r = 0; r < 4; r++) {
  const eff = (cid, sid) => { const s = W.resolve(cid, sid, r), p = C.arenaProfile(cid); return p.dmg * p.rate * (1 + 0.45 * mult[r]) * W.shapeIdx(s); };
  const bases = classes.map((c) => eff(c, 'base')).sort((a, b) => a - b);
  const med = classes.length % 2 ? bases[(classes.length - 1) / 2] : (bases[classes.length / 2 - 1] + bases[classes.length / 2]) / 2;
  classes.forEach((c) => {
    const baseIdx = W.shapeIdx(W.resolve(c, 'base', r));
    W.stylesFor(c).forEach((sid) => {
      const e = eff(c, sid), s = W.resolve(c, sid, r), ratio = W.shapeIdx(s) / baseIdx, tag = c + '/' + sid + '/r' + r;
      check(tag + ' within +-30% of median (' + (e / med).toFixed(3) + ')', e >= med * 0.7 && e <= med * 1.3);
      check(tag + ' within [.95,1.10] of base (' + ratio.toFixed(3) + ')', ratio >= 0.95 - 1e-9 && ratio <= 1.10 + 1e-9);
      check(tag + ' 40-bolt bound ' + W.boltBound(s), W.boltBound(s) <= W.BOLT_BUDGET && W.boltBound(s) >= 1);
      check(tag + ' pierce/bounce/count in range', s.pierce <= 3 && s.bounce <= 3 && s.count >= 1 && s.count <= 5 && s.dmg > 0);
    });
  });
}

// affixes: fixed per style, none on common, cumulative by rarity, index gain capped
check('common has no affixes', W.resolve('ranger', 'bow_triple', 0).affixes.length === 0);
check('uncommon/rare/epic affix counts 1/2/3', [1, 2, 3].every((r) => W.resolve('ranger', 'bow_triple', r).affixes.length === r));
check('epic bow_triple = reach, keen, extra', W.resolve('ranger', 'bow_triple', 3).affixes.join() === 'reach,keen,extra');
const e3 = W.resolve('ranger', 'bow_triple', 3), c0 = W.resolve('ranger', 'bow_triple', 0);
check('reach +10% life, keen +.05 crit, extra +1 count', near(e3.life, 0.75 * 1.1, 1e-3) && near(e3.crit, 0.05, 1e-9) && e3.count === 4);
check('extra is renormalised (gain stays within cap)', e3.idx / e3.baseIdx <= 1.10 + 1e-9 && e3.idx >= c0.idx - 1e-9);
check('affix index gain caps by rarity', [1, 2, 3].every((r) => W.resolve('ranger', 'bow_triple', r).affixIdx <= W.AFFIX_CAP[r] + 1e-9));
check('venom on a plain style adds a bleed chance', W.resolve('rogue', 'dagger_fan', 0).onHit.status === null && W.resolve('rogue', 'dagger_fan', 3).affixes.length === 3);
check('venom raises an existing chance by .10', near(W.resolve('rogue', 'dagger_venom', 1).onHit.chance, 0.35, 1e-9));
check('rarity clamps / junk rarity -> common', W.resolve('ranger', 'bow_triple', 99).rarity === 3 && W.resolve('ranger', 'bow_triple', -4).rarity === 0 && W.resolve('ranger', 'bow_triple', 'x').rarity === 0 && W.resolve('ranger', 'bow_triple', NaN).rarity === 0);

// family mismatch and hostile input give the base
const hostile = [undefined, null, 0, 1, {}, [], 'nope', '', '__proto__', 'constructor', 'toString', 'hasOwnProperty', 'base_rogue', 'base', NaN, Infinity, () => 1, Symbol.iterator];
hostile.forEach((h) => {
  let s = null, s2 = null, s3 = null, sf = null, sl = null;
  try { s = W.resolve('ranger', h, 1); s2 = W.resolve(h, 'bow_triple', 1); s3 = W.resolve(h, h, h); sf = W.styleFor(h, h); sl = W.stylesFor(h); } catch (e) { /* stays null */ }
  check('hostile ' + label(h) + ' resolve safe -> base', !!s && s.base === true && s.count === 1 && s.dmg === 1 && !!s2 && !!s3 && s3.base === true && s3.classId === 'ranger');
  check('hostile ' + label(h) + ' styleFor/stylesFor safe', sf === 'base' && Array.isArray(sl) && sl[0] === 'base');
});
check('hostile style item', W.styleFor('ranger', { style: '__proto__' }) === 'base' && W.styleFor('ranger', { style: { toString: 1 } }) === 'base' && W.styleFor('ranger', null) === 'base');
check('wrong-family style -> base', W.resolve('ranger', 'hammer_throw', 3).base === true && W.resolve('rogue', 'bow_triple', 0).base === true);
check('unknown class -> ranger base', W.resolve('__proto__', '__proto__', 0).classId === 'ranger' && W.get('__proto__') === null && W.get('constructor') === null);
check('describe handles junk', W.describe(null) === '' && W.describe('x') === '' && typeof W.describe({}) === 'string');

// styleFor
check('styleFor legacy sparkwand (no style) = base', W.styleFor('ranger', { id: 'sparkwand', slot: 'weapon' }) === 'base');
check('styleFor matching family', W.styleFor('ranger', { style: 'bow_triple' }) === 'bow_triple' && W.styleFor('rogue', { style: 'dagger_fan' }) === 'dagger_fan');
check('styleFor family mismatch = base', W.styleFor('ranger', { style: 'dagger_fan' }) === 'base' && W.styleFor('ranger', { style: 'base_ranger' }) === 'base');
check('stylesFor ranger lists base + 3 bow styles', W.stylesFor('ranger').join() === 'base,bow_triple,bow_longshot,bow_leaf');

// inputs never mutated
const frozenIn = Object.freeze({ style: 'bow_triple', extra: Object.freeze({ a: 1 }) });
check('styleFor on frozen input does not throw', W.styleFor('ranger', frozenIn) === 'bow_triple');
const before = JSON.stringify(W.STYLES);
classes.forEach((c) => W.stylesFor(c).forEach((s) => { for (let r = 0; r < 4; r++) W.resolve(c, s, r); }));
check('resolve never mutates STYLES', JSON.stringify(W.STYLES) === before);
check('resolve is deterministic', JSON.stringify(W.resolve('rogue', 'dagger_venom', 2)) === JSON.stringify(W.resolve('rogue', 'dagger_venom', 2)));
check('resolve returns a fresh spec (not the table entry)', W.resolve('ranger', 'bow_triple', 0) !== S.bow_triple);

// describe
check('describe bow_triple', W.describe(W.resolve('ranger', 'bow_triple', 0)) === '3 arrows, fan 10 deg, range 435 px');
check('describe mentions wave / bleed / boomerang', /wave/.test(W.describe(S.bow_leaf)) && /bleed 25%/.test(W.describe(S.dagger_venom)) && /boomerang/.test(W.describe(S.hammer_throw)));
check('describe lob shows radius', /lobbed, radius 48 px/.test(W.describe(S.hammer_smite)));

// index weights
check('orbit adds to the index', W.shapeIdx(S.tome_orbit) > S.tome_orbit.dmg);
check('shapeIdx junk is 0', W.shapeIdx(null) === 0 && W.shapeIdx(5) === 0);
check('pierce weight 0.25', near(W.shapeIdx({ dmg: 1, pierce: 2 }), 1.5));
check('crit weight', near(W.shapeIdx({ dmg: 1, crit: 0.1 }), 1.1));
check('status weight', near(W.shapeIdx({ dmg: 1, onHit: { status: 'bleed', chance: 0.5 } }), 1.15));

console.log(n - bad + '/' + n + ' passed');
process.exit(bad ? 1 : 0);
