// Node test for MMDDCraft. Run: node game/tests/shared-mm-dd-craft.test.js
const path = require('path');
const C = require(path.join(__dirname, '../shared/mm-dd-craft.js'));
const R = require(path.join(__dirname, '../shared/mm-recipes.js'));
let passed = 0, failed = 0;
function check(name, cond) { if (cond) passed++; else { failed++; console.log('FAIL: ' + name); } }

const rows = C.annotate({ wood: 4, coal: 1 }, {});
check('one row per recipe (24)', rows.length === 24 && rows.length === R.RECIPES.length);
const by = (id) => rows.filter((r) => r.id === id)[0];
check('torch is ready with 1 wood + 1 coal', by('torch').ready && by('torch').reason === '');
check('table is ready with 4 wood', by('table').ready);
check('brick is not craftable and says what is missing', !by('brick').can && /stone/.test(by('brick').reason));
check('held flags recipes sharing an input you hold', by('plank').held === true && by('brick').held === false);
check('bench-only recipe is gated without a bench', C.annotate({ wood: 20 }, {}).filter((r) => r.id === 'chest')[0].reason === 'Stand near a workbench');
check('bench-only recipe is ready with a bench', C.annotate({ wood: 20 }, { bench: true }).filter((r) => r.id === 'chest')[0].ready);
check('furnace recipe is gated without a furnace', /furnace/.test(C.annotate({ stone: 9, coal: 2 }, {}).filter((r) => r.id === 'glass')[0].reason));
check('outText formats counts', C.outText(R.get('torch')) === 'torch x4' && C.outText(R.get('table')) === 'table');
check('benchNear: within reach', C.benchNear([[10, 5, 10]], 12, 6, 8, 4) === true);
check('benchNear: too far in xz or y', !C.benchNear([[10, 5, 10]], 20, 5, 10, 4) && !C.benchNear([[10, 5, 10]], 10, 12, 10, 4));
check('cleanBenches drops junk, dupes and over-cap', C.cleanBenches([[1, 2, 3], [1, 2, 3], [-1, 0, 0], 'x', [1.5, 0, 0], [4, 5, 6]]).length === 2 && C.cleanBenches(null).length === 0 && C.cleanBenches(Array.from({ length: 50 }, (_, i) => [i, 0, 0])).length === 32);
const inv = { wood: 4 }; const before = JSON.stringify(inv);
C.annotate(inv, {});
check('annotate does not mutate the inventory', JSON.stringify(inv) === before);
console.log(passed + ' passed, ' + failed + ' failed');
process.exit(failed ? 1 : 0);
