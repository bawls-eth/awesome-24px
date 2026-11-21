// Pure-node tests for the X1 species canon in shared/mm-biome-packs.js (NEXT-SLICES-2 X1 acceptance 1, 2 and the pure half of 5).
// 1 tests/fixtures/pack-golden.json (recorded before the change) still matches MMOverworld.hash() for 12 seeds x 5 packs; 2 canon(id) maps
// every id creatureIds() returns for every pack to an MMCreatures def of that pack's biome, with the expected legacy mappings, and the isles
// page reads it (its own ALIAS is only a fallback export); 5 IsleCreatures.rareSpot is seeded, in the rare zone and one per island.
// Run: node game/tests/shared-mm-biome-packs-canon.test.js
const fs = require('fs');
const path = require('path');
const O = require('../shared/mm-overworld.js');
const BP = require('../shared/mm-biome-packs.js');
const CR = require('../shared/mm-creatures.js');
const IC = require('../games/isles/isle-creatures.js');
let failed = 0;
function check(name, cond, extra = '') { console.log((cond ? 'PASS ' : 'FAIL ') + name + (cond ? '' : ' ' + extra)); if (!cond) failed++; }

// ---- 1. golden pack hashes ----
const gold = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', 'pack-golden.json'), 'utf8'));
check('pack-golden fixture: 12 seeds x 5 packs', gold.seeds.length === 12 && gold.packs.length === 5 && gold.packs.every((p) => Object.keys(gold.hashes[p]).length === 12));
const diffs = [];
gold.packs.forEach((p) => gold.seeds.forEach((s) => { if (O.hash(O.generate(s, { pack: p })) !== gold.hashes[p][s]) diffs.push(p + '/' + s); }));
check('every pack world hash is identical to pack-golden.json (60/60)', diffs.length === 0, diffs.slice(0, 6).join(', '));
check('the golden hashes are distinct per seed (fixture is not degenerate)', gold.packs.every((p) => new Set(gold.seeds.map((s) => gold.hashes[p][s])).size === 12));

// ---- 2. canon ----
check('CANON is a frozen export and canon() a function', Object.isFrozen(BP.CANON) && typeof BP.canon === 'function');
const bad = [];
BP.IDS.forEach((p) => BP.creatureIds(p).forEach((id) => { const k = BP.canon(id), d = k && CR.get(k); if (!d || d.biome !== p) bad.push(p + '/' + id + '->' + k + (d ? '(' + d.biome + ')' : '')); }));
check('canon() maps every creatureIds() id of all 5 packs to an MMCreatures def of that pack biome', bad.length === 0, bad.join(', '));
const bossBad = [];
BP.IDS.forEach((p) => (BP.get(p).bosses || []).forEach((b) => { const d = CR.get(BP.canon(b.boss)); if (!d || d.biome !== p || d.tier !== 'boss') bossBad.push(p + '/' + b.boss); }));
check('every pack boss canon()s to a boss def of its biome', bossBad.length === 0, bossBad.join(', '));
check('expected mappings: shellback_glacier -> glacier_shellback, canopy_queen -> fernjaw_tyrant', BP.canon('shellback_glacier') === 'glacier_shellback' && BP.canon('canopy_queen') === 'fernjaw_tyrant');
check('the jungle ALIAS moved here (parrotlet, shellback, raptor_jr, raptor, boarhog)', BP.canon('parrotlet') === 'chompbill' && BP.canon('shellback') === 'canopy_glider' &&
  BP.canon('raptor_jr') === 'fernraptor' && BP.canon('raptor') === 'fernraptor' && BP.canon('boarhog') === 'tusktop');
check('every CANON target is a real def', Object.keys(BP.CANON).every((k) => !!CR.get(BP.CANON[k])));
check('real ids canon to themselves; junk -> null', BP.canon('shellcrab') === 'shellcrab' && BP.canon('oakback') === 'oakback' && BP.canon('__proto__') === null &&
  BP.canon('constructor') === 'constructor' && BP.canon(5) === null && BP.canon('Bad Id') === null && BP.canon('') === null && BP.canon('x'.repeat(40)) === null);
check('speciesOf agrees with canon for every pack id', BP.IDS.every((p) => BP.allIds(p).every((id) => BP.speciesOf(p, id) === BP.canon(id))));
check('the pack spawn tables are untouched (jungle keeps its first-playable ids, tundra the real glacier_shellback)', BP.creatureIds('jungle').indexOf('parrotlet') >= 0 && BP.creatureIds('jungle').indexOf('boarhog') >= 0 && BP.creatureIds('tundra').indexOf('glacier_shellback') >= 0);

// isle-creatures reads canon(); its ALIAS stays as an exported fallback
check('IsleCreatures.kindOf follows canon() for every pack id', BP.IDS.every((p) => BP.creatureIds(p).every((id) => IC.kindOf(id, 1) === BP.canon(id) && IC.kindOf(id, -1) === BP.canon(id))));
check('IsleCreatures.ALIAS is still exported and agrees with the canon', IC.ALIAS && Object.keys(IC.ALIAS).every((k) => BP.canon(k) === IC.ALIAS[k]));
check('IsleCreatures.canonOf is wired to MMBiomePacks', IC.canonOf('shellback_glacier') === 'glacier_shellback');
check('glacier_shellback is tameable (it has a tame rule)', !!(CR.get('glacier_shellback') && CR.get('glacier_shellback').tame));
check('kindOf junk -> null', IC.kindOf(null) === null && IC.kindOf('nope_x') === null);
// the ALIAS fallback still works without MMBiomePacks (an old cached page)
delete require.cache[require.resolve('../games/isles/isle-creatures.js')];
const ICfac = (() => { const m = { exports: {} }; const src = fs.readFileSync(path.join(__dirname, '../games/isles/isle-creatures.js'), 'utf8'); const root = { MMRng: require('../shared/rng.js'), MMCreatures: CR };
  new Function('module', 'self', src.replace("typeof module === 'object' && module.exports", 'false'))(undefined, root); return root.IsleCreatures; })();
check('without MMBiomePacks, kindOf falls back to the local ALIAS', ICfac && ICfac.kindOf('parrotlet', 1) === 'chompbill' && ICfac.kindOf('boarhog', 3) === 'tusktop' && ICfac.kindOf('shellcrab') === 'shellcrab');

// ---- 5. rare spots (pure half; the page test checks the spawner) ----
function rareFor(packId, seed) {
  const w = O.generate(seed, { pack: packId }), P = BP.get(packId);
  const sw = new Set(Object.keys(P.hazards).filter((n) => P.hazards[n].swim || P.hazards[n].breath > 0).map((n) => O.TERRAIN_ALL[n]));
  const walk = (x, y) => !O.isSolid(w, x, y) && !sw.has(O.tileAt(w, x, y));
  return { w, r: IC.rareSpot(w, P, seed, walk), walk };
}
['1', '42', 'isle-a'].forEach((seed) => {
  const a = rareFor('reef', seed), b = rareFor('reef', seed);
  check('reef seed ' + seed + ': isleback_turtle spot in zone 2, walkable, seed-stable', a.r && a.r.creature === 'isleback_turtle' && a.r.zone === 2 && O.zoneAt(a.w, a.r.x, a.r.y) === 2 && a.walk(a.r.x, a.r.y) &&
    JSON.stringify(a.r) === JSON.stringify(b.r), JSON.stringify(a.r));
  const h = rareFor('meadow', seed);
  check('home seed ' + seed + ': oakback spot in zone 3', h.r && h.r.creature === 'oakback' && h.r.zone === 3 && O.zoneAt(h.w, h.r.x, h.r.y) === 3 && h.walk(h.r.x, h.r.y), JSON.stringify(h.r));
});
check('a pack with no rare entry has no rare spot', rareFor('jungle', '1').r === null && rareFor('mars', '1').r === null && IC.rareSpot(null, null, '1', () => true) === null);
check('different seeds move the rare spot', JSON.stringify(rareFor('reef', '1').r) !== JSON.stringify(rareFor('reef', '2').r));

console.log(failed ? failed + ' FAILED' : 'ALL PASSED');
process.exitCode = failed ? 1 : 0;
