// Unit tests for shared/mm-isle-craft.js + the MMIsles `inv` key. Run: node game/tests/shared-mm-isle-craft.test.js
const C = require('../shared/mm-creatures.js');
const X = require('../shared/mm-isle-craft.js');
const I = require('../shared/mm-isles.js');
let failed = 0;
function check(name, cond, extra = '') { console.log((cond ? 'PASS ' : 'FAIL ') + name + (cond ? '' : ' ' + extra)); if (!cond) failed++; }

const saddles = C.list().map((d) => d.ride && d.ride.saddle).filter(Boolean);
check('10 saddle ids from MMCreatures all have recipes', saddles.length === 10 && saddles.every((s) => X.RECIPES[s]));
['feast', 'sleepy_herb', 'raft', 'rocket_core', 'warm_cloak', 'o2_tank'].forEach((id) => check('recipe ' + id, !!X.RECIPES[id]));
check('every input has 2+ sources, 2-4 inputs per recipe', Object.keys(X.RECIPES).every((id) => { const k = Object.keys(X.RECIPES[id].in); return k.length >= 2 && k.length <= 4 && k.every((i) => X.sourcesOf(i).length >= 2); }));
check('validate() ok', X.validate().ok, JSON.stringify(X.validate().errors));
check('RECIPES frozen', Object.isFrozen(X.RECIPES) && Object.isFrozen(X.RECIPES.feast.in));
check('validate() fails on an orphan input', (() => { const v = X.validate({ saddle_tusktop: { in: { hide: 2, unobtainium: 1 } } }); return !v.ok && v.errors.some((e) => /unobtainium.*no pack or drop table/.test(e)); })());
check('validate() fails on a single-source input', (() => { const v = X.validate({ feast: { in: { stone: 1, hide: 1 } } }); return !v.ok && v.errors.some((e) => /stone.*only 1 source/.test(e)); })());

const inv = { hide: 3, vine_rope: 2, wood: 2 };
const snap = JSON.stringify(inv);
const c1 = X.canCraft(inv, 'saddle_stegolith');
check('canCraft ok', c1.ok && c1.missing.length === 0);
const c2 = X.canCraft({ hide: 1 }, 'saddle_stegolith');
check('canCraft lists missing', !c2.ok && c2.missing.length === 3 && c2.missing[0].id === 'hide' && c2.missing[0].have === 1);
check('canCraft unknown id', !X.canCraft(inv, '__proto__').ok && !X.canCraft(inv, 'nope').ok);
const out = X.craft(inv, 'saddle_stegolith');
check('craft returns new frozen inv, input untouched', Object.isFrozen(out) && out !== inv && JSON.stringify(inv) === snap && out.saddle_stegolith === 1 && !('hide' in out) && !('wood' in out));
check('impossible craft changes nothing', JSON.stringify(X.craft({ hide: 1 }, 'saddle_stegolith')) === JSON.stringify({ hide: 1 }));
check('deterministic', JSON.stringify(X.craft(inv, 'saddle_stegolith')) === JSON.stringify(out));
check('output stack at 999 blocks craft', X.canCraft({ fiber: 2, jungle_berry: 2, sleepy_herb: 999 }, 'sleepy_herb').reason === 'full');

check('cleanInv drops junk', (() => {
  const raw = JSON.parse('{"__proto__":5,"hide":3.5,"wood":"4","iron":-1,"bogus":9,"amber":5000,"shell":2,"Bad":1,"kelp":1}');
  const c = X.cleanInv(raw);
  return JSON.stringify(c) === JSON.stringify({ amber: 999, shell: 2, kelp: 1 }) && Object.getPrototypeOf(c) === Object.prototype;
})());
const full = {}; Object.keys(C.DROP_TABLES).forEach((k) => C.DROP_TABLES[k].forEach((r) => { full[r[0]] = 5; }));
X.IDS.forEach((k) => { full[k] = 5; });
check('cleanInv caps stacks at 64', Object.keys(full).length > 30 && Object.keys(X.cleanInv(full)).length <= 64);
check('cleanInv junk input', JSON.stringify(X.cleanInv(null)) === '{}' && JSON.stringify(X.cleanInv([1])) === '{}' && JSON.stringify(X.cleanInv('x')) === '{}');

check('defaults has inv:{}', JSON.stringify(I.defaults().inv) === '{}');
const old = I.defaults(); delete old.inv;
check('old save without inv loads with inv:{}', JSON.stringify(I.clean(old).inv) === '{}');
check('non-object save loads with inv:{}', JSON.stringify(I.clean(null).inv) === '{}');
const sv = I.clean({ v: 1, inv: { hide: 4, bogus: 3, wood: 1000, __proto__x: 1 } });
check('clean keeps valid inv, drops unknown', JSON.stringify(sv.inv) === JSON.stringify({ hide: 4, wood: 999 }));
check('clean keeps whole key within 20 KB', JSON.stringify(I.clean({ v: 1, inv: full })).length <= 20000);
check('clean is idempotent', JSON.stringify(I.clean(sv)) === JSON.stringify(sv));

console.log(failed ? `${failed} FAILED` : 'ALL PASSED'); process.exitCode = failed ? 1 : 0;
