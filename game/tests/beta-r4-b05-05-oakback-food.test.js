// Round 4 (D1), b05-05: Oakback (the Hearth Isle XL rare) eats only golden apples and needs 12, but the home isle had ONE golden-apple glint
// that respawned every 900 s (about 3 hours of respawns for one tame). The glints now give enough for a tame inside 15 minutes.
// Run: node game/tests/beta-r4-b05-05-oakback-food.test.js
const C = require('../shared/mm-creatures.js');
const X = require('../shared/mm-isle-craft.js');
let failed = 0;
function check(name, cond, extra = '') { console.log((cond ? 'PASS ' : 'FAIL ') + name + (cond ? '' : ' ' + extra)); if (!cond) failed++; }
const oak = C.get ? C.get('oakback') : null;
check('Oakback exists and is a feed tame that eats golden apples', !!oak && oak.tame && oak.tame.method === 'feed' && oak.diet.indexOf('golden_apple') >= 0, JSON.stringify(oak && oak.tame));
const supply = (pack, food, secs) => X.foodNodes(pack).filter((r) => r.id === food).reduce((s, r) => s + r.n + r.n * Math.floor(secs / r.respawn), 0);
const need = oak ? oak.tame.need : 99;
const in15 = supply('meadow', 'golden_apple', 900);
check(`home isle golden-apple glints supply Oakback's ${need} apples within 15 minutes`, in15 >= need, 'supply ' + in15);
check('more than one golden-apple glint at a time on the home isle', supply('meadow', 'golden_apple', 0) >= 3, 'n ' + supply('meadow', 'golden_apple', 0));
check('golden apples still live in the far orchard (zones 2-3 only), not at the dock', X.foodNodes('meadow').filter((r) => r.id === 'golden_apple').every((r) => Array.isArray(r.zone) && r.zone.every((z) => z >= 2)));
console.log(failed ? failed + ' FAILED' : 'ALL PASSED');
process.exit(failed ? 1 : 0);
