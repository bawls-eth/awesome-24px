// Pure-node cross-check: every creature and boss id a biome pack places resolves to a real MMCreatures definition
// (directly, or through the pack's own `species` table), and the isles page alias table agrees with that table.
// Run: node game/tests/shared-mm-pack-creatures.test.js
const BP = require('../shared/mm-biome-packs.js');
const CR = require('../shared/mm-creatures.js');
const IC = require('../games/isles/isle-creatures.js');
let failed = 0;
function check(name, cond, extra = '') { console.log((cond ? 'PASS ' : 'FAIL ') + name + (cond ? '' : ' ' + extra)); if (!cond) failed++; }

const missing = [];
BP.IDS.forEach((p) => BP.allIds(p).forEach((id) => { const sp = BP.speciesOf(p, id); if (!sp || !CR.get(sp)) missing.push(p + '/' + id + '->' + sp); }));
check('every pack spawn, rare and boss id resolves to an MMCreatures def', missing.length === 0, missing.join(', '));
check('allIds covers spawn tables, rares and bosses', BP.allIds('reef').indexOf('isleback_turtle') >= 0 && BP.allIds('reef').indexOf('tide_hydra') >= 0 && BP.allIds('meadow').indexOf('oakback') >= 0);
check('pack bosses are boss-tier defs', BP.IDS.every((p) => BP.get(p).bosses.every((b) => { const d = CR.get(BP.speciesOf(p, b.boss)); return d && d.tier === 'boss'; })));
check('tundra spawns the real glacier_shellback id (no placeholder)', BP.creatureIds('tundra').indexOf('glacier_shellback') >= 0 && BP.creatureIds('tundra').indexOf('shellback_glacier') < 0);
check('jungle boss is a defined boss (fernjaw_tyrant), no undefined canopy_queen', BP.get('jungle').bosses[0].boss === 'fernjaw_tyrant' && BP.allIds('jungle').indexOf('canopy_queen') < 0);
const disagree = Object.keys(IC.ALIAS).filter((k) => BP.speciesOf('jungle', k) !== IC.ALIAS[k]);
check('isle-creatures ALIAS matches the jungle species table', disagree.length === 0, disagree.join(','));
check('ids without a species entry resolve to themselves; junk resolves to null', BP.speciesOf('reef', 'shellcrab') === 'shellcrab' && BP.speciesOf('nope', 'x') === null && BP.speciesOf('jungle', 5) === null);
check('the base type of every pack id is a realm enemy type', BP.IDS.every((p) => BP.allIds(p).every((id) => ['spiral', 'aimed', 'ring'].indexOf(BP.get(p).base[id]) >= 0)));

console.log(failed ? failed + ' FAILED' : 'ALL PASSED');
process.exitCode = failed ? 1 : 0;
