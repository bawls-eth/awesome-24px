// Unit tests for shared/mm-isle-craft.js + the MMIsles `inv` key. Run: node game/tests/shared-mm-isle-craft.test.js
const C = require('../shared/mm-creatures.js');
const X = require('../shared/mm-isle-craft.js');
const I = require('../shared/mm-isles.js');
let failed = 0;
function check(name, cond, extra = '') { console.log((cond ? 'PASS ' : 'FAIL ') + name + (cond ? '' : ' ' + extra)); if (!cond) failed++; }

const saddles = C.list().map((d) => d.ride && d.ride.saddle).filter(Boolean);
check('10 saddle ids from MMCreatures all have recipes', saddles.length === 10 && saddles.every((s) => X.RECIPES[s]));
['feast', 'sleepy_herb', 'raft', 'rocket_core', 'warm_cloak', 'o2_tank'].forEach((id) => check('recipe ' + id, !!X.RECIPES[id]));
// XD1: a recipe flagged trophy:true may use its boss's one unique drop (exactly one source by design); every other input still needs 2+
check('every input has 2+ sources (trophy boss drops excepted), 2-4 inputs per recipe', Object.keys(X.RECIPES).every((id) => { const k = Object.keys(X.RECIPES[id].in); return k.length >= 2 && k.length <= 4 && k.every((i) => X.sourcesOf(i).length >= (X.RECIPES[id].trophy === true ? 1 : 2)); }));
check('validate() ok', X.validate().ok, JSON.stringify(X.validate().errors));
check('RECIPES frozen', Object.isFrozen(X.RECIPES) && Object.isFrozen(X.RECIPES.feast.in));
check('validate() fails on an orphan input', (() => { const v = X.validate({ saddle_tusktop: { in: { hide: 2, unobtainium: 1 } } }); return !v.ok && v.errors.some((e) => /unobtainium.*no pack or drop table/.test(e)); })());
// (XD1 gave stone a second source, a jungle forage find, so the single-source example is now clover: meadow nodes only)
check('validate() fails on a single-source input', (() => { const v = X.validate({ feast: { in: { clover: 1, hide: 1 } } }); return !v.ok && v.errors.some((e) => /clover.*only 1 source/.test(e)); })());

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

// ---------------- XD1 (NEXT-SLICES-3): the mars fix, dead-end drops, reachability ----------------
const P = require('../shared/mm-biome-packs.js');
const OLD16 = ['saddle_tusktop', 'saddle_stegolith', 'saddle_tyrant', 'saddle_shagtusk', 'saddle_sabrefang', 'saddle_tidesteed', 'saddle_skimray', 'saddle_strider',
  'saddle_grazer', 'saddle_titan', 'feast', 'sleepy_herb', 'raft', 'rocket_core', 'warm_cloak', 'o2_tank'];
check('XD1: the 16 existing recipe ids are all kept, and still make themselves', OLD16.every((id) => X.get(id) && X.outputOf(id) === id));
check('XD1: IDS stays the 16-recipe panel list (the page lists IDS until XW1); ALL_IDS has every recipe', JSON.stringify(X.IDS) === JSON.stringify(OLD16) && Object.isFrozen(X.ALL_IDS) &&
  JSON.stringify(X.ALL_IDS) === JSON.stringify(Object.keys(X.RECIPES)) && X.ALL_IDS.length === 30);
check('XD1 1: rocket_core_drift makes a rocket_core from home/jungle/reef/tundra inputs only', (() => {
  const r = X.get('rocket_core_drift');
  return X.outputOf('rocket_core_drift') === 'rocket_core' && JSON.stringify(r.in) === JSON.stringify({ driftwood: 3, frost_crystal: 2, amber: 2, pearl: 1 }) &&
    Object.keys(r.in).every((k) => X.islesOf(k, { finds: false }).some((i) => ['home', 'jungle', 'reef', 'ice'].indexOf(i) >= 0));
})());
check('XD1 1: o2_tank_kelp (kelp 3, shell 2, ice 2) makes an o2_tank; both ids make it', JSON.stringify(X.get('o2_tank_kelp').in) === JSON.stringify({ kelp: 3, shell: 2, ice: 2 }) &&
  JSON.stringify(X.recipesFor('o2_tank')) === JSON.stringify(['o2_tank', 'o2_tank_kelp']) && JSON.stringify(X.recipesFor('rocket_core')) === JSON.stringify(['rocket_core', 'rocket_core_drift']));
const kit = { driftwood: 3, frost_crystal: 2, amber: 2, pearl: 1 }, kit0 = JSON.stringify(kit);
const kc = X.craft(kit, 'rocket_core_drift');
check('XD1 1: crafting rocket_core_drift adds 1 rocket_core (not a rocket_core_drift stack), spends the inputs, input untouched',
  kc.rocket_core === 1 && !('rocket_core_drift' in kc) && Object.keys(kc).length === 1 && JSON.stringify(kit) === kit0 && Object.isFrozen(kc));
check('XD1 1: o2_tank_kelp adds to an existing o2_tank stack', X.craft({ kelp: 3, shell: 2, ice: 2, o2_tank: 4 }, 'o2_tank_kelp').o2_tank === 5);
check('XD1 1: an alternative recipe is blocked when its output stack is full', X.canCraft({ kelp: 3, shell: 2, ice: 2, o2_tank: 999 }, 'o2_tank_kelp').reason === 'full');
check('XD1 1: the old iron rocket core needs iron, which is found only on mars (the bug this slice fixes)', JSON.stringify(X.islesOf('iron')) === '["mars"]' && X.get('rocket_core').in.iron === 4);
check('XD1 1: validate() fails when the unlock item for mars needs an input found only on mars', (() => {
  const t = Object.assign({}, X.RECIPES); delete t.rocket_core_drift;
  const v = X.validate(t);
  return !v.ok && v.errors.some((e) => /unlock item rocket_core for mars \(rocket_core\) needs iron, found only on mars/.test(e)) && v.errors.some((e) => /island mars never opens/.test(e));
})());
check('XD1 1: validate() also catches a raft that needs a reef-only input', (() => {
  const t = Object.assign({}, X.RECIPES, { raft: { in: { wood: 4, pearl: 1 }, out: 1 } });
  return X.validate(t).errors.some((e) => /unlock item raft for reef \(raft\) needs pearl, found only on reef/.test(e));
})());
check('XD1 1: validate() rejects an `item` that names no plain recipe', X.validate(Object.assign({}, X.RECIPES, { bad_alt: { in: { wood: 2, fiber: 2 }, out: 1, item: 'nope' } })).errors.some((e) => /bad_alt: item must name/.test(e)));
const reach = X.reachability();
check('XD1 1: reachability(): every island opens from a fresh save', reach.ok && reach.locked.length === 0, JSON.stringify(reach.locked));
check('XD1 1: order home, jungle, tundra (open), then reef (raft), then mars (rocket core)', JSON.stringify(reach.order) === '["home","jungle","ice","reef","mars"]' &&
  reach.wave.home === 0 && reach.wave.jungle === 0 && reach.wave.ice === 0 && reach.wave.reef === 1 && reach.wave.mars === 2, JSON.stringify(reach.wave));
check('XD1 1: the raft is craftable in wave 0 (open-island inputs only), the drift rocket core in wave 1 (before mars)', reach.recipes.raft === 0 && reach.recipes.rocket_core_drift === 1 && reach.recipes.rocket_core === 2);
check('XD1 1: every recipe is craftable at some wave', X.ALL_IDS.every((id) => reach.recipes[id] !== null), JSON.stringify(X.ALL_IDS.filter((id) => reach.recipes[id] === null)));
check('XD1 1: every recipe input has a source on an island open at or before the wave the recipe becomes craftable', X.ALL_IDS.every((id) =>
  Object.keys(X.RECIPES[id].in).every((k) => X.islesOf(k).some((i) => reach.wave[i] <= reach.recipes[id]))));
check('XD1 1: each unlock item is craftable before its island opens', Object.keys(X.GATES.items).every((isle) => reach.items[X.GATES.items[isle]] < reach.wave[isle]));
const reachNF = X.reachability(null, null, { finds: false });
check('XD1 1: the mars path needs no forage find (gathered nodes + drops alone open every island, same waves)', reachNF.ok && JSON.stringify(reachNF.wave) === JSON.stringify(reach.wave), JSON.stringify(reachNF.wave));
check('XD1 1: the walk with no unlock recipe leaves the reef and mars locked', (() => { const t = Object.assign({}, X.RECIPES); delete t.raft; const r = X.reachability(t); return !r.ok && r.locked.indexOf('reef') >= 0 && r.locked.indexOf('mars') >= 0; })());
check('XD1 1: reachability is deterministic and pure', JSON.stringify(X.reachability()) === JSON.stringify(reach) && Object.isFrozen(X.RECIPES));
check('XD1 1: islesOfSource maps packs, finds and drop tables to isles', JSON.stringify(X.islesOfSource('pack:tundra')) === '["ice"]' && JSON.stringify(X.islesOfSource('find:meadow')) === '["home"]' &&
  JSON.stringify(X.islesOfSource('drop:reef_boss')) === '["reef"]' && X.islesOfSource('nope').length === 0 && X.islesOfSource(5).length === 0 && X.islesOfSource('pack:__proto__').length === 0);

const DEAD = ['feather', 'wool', 'honey', 'bone', 'tyrant_scale', 'frost_heart', 'rift_stone', 'glow_gel', 'data_chip', 'cocoa', 'salt', 'spring_salt', 'ice_core', 'driftwood', 'stone', 'apple'];
const usedBy = (it) => X.ALL_IDS.filter((id) => own(X.RECIPES[id].in, it));
function own(o, k) { return Object.prototype.hasOwnProperty.call(o, k); }
check('XD1 2: each of the 16 dead-end drops is used by at least one recipe', DEAD.every((it) => usedBy(it).length >= 1), JSON.stringify(DEAD.filter((it) => !usedBy(it).length)));
check('XD1 2: every drop-table item is now used by some recipe', Object.keys(C.DROP_TABLES).every((k) => C.DROP_TABLES[k].every((r) => usedBy(r[0]).length >= 1)));
check('XD1 2: proposals present (heat_pack, glow_lamp, bone_charm, honey_cake, 4 trophies, signal_beacon, sea_salt_snack)',
  ['heat_pack', 'glow_lamp', 'bone_charm', 'honey_cake', 'trophy_tyrant', 'trophy_hydra', 'trophy_dragon', 'trophy_titan', 'signal_beacon', 'sea_salt_snack'].every((id) => X.get(id) && typeof X.get(id).use === 'string'));
check('XD1 2: exactly the 4 boss trophies are trophy:true, and only they use a 1-source input', (() => {
  const tro = X.ALL_IDS.filter((id) => X.RECIPES[id].trophy === true).sort();
  const single = X.ALL_IDS.filter((id) => Object.keys(X.RECIPES[id].in).some((k) => X.sourcesOf(k).length < 2));
  return JSON.stringify(tro) === '["trophy_dragon","trophy_hydra","trophy_titan","trophy_tyrant"]' && single.every((id) => tro.indexOf(id) >= 0);
})());
check('XD1 2: boss trophies use the boss unique drop (tyrant_scale, rift_stone, frost_heart; the titan has none)', X.get('trophy_tyrant').in.tyrant_scale === 1 && X.get('trophy_hydra').in.rift_stone === 1 &&
  X.get('trophy_dragon').in.frost_heart === 1 && X.sourcesOf('tyrant_scale').length === 1 && X.sourcesOf('frost_heart').length === 1 && X.sourcesOf('rift_stone').length === 1);
check('XD1 2: validate() still rejects a 1-source input on a recipe that is not a trophy', X.validate({ heat_pack: { in: { tyrant_scale: 1, fiber: 2 }, out: 1 } }).errors.some((e) => /heat_pack: input tyrant_scale has only 1 source/.test(e)));
check('XD1 2: new outputs are known items for cleanInv (saves keep them)', JSON.stringify(X.cleanInv({ glow_lamp: 1, trophy_titan: 1, honey_cake: 3 })) === JSON.stringify({ glow_lamp: 1, trophy_titan: 1, honey_cake: 3 }));

// forage finds (MMBiomePacks.FINDS) and bonusFind: pure, caller-supplied u, never a world change
check('XD1 finds: every pack has a valid finds table and the packs still validate', P.IDS.every((id) => P.finds(id) && P.validate(P.get(id)).length === 0) && P.finds('home') === P.finds('meadow') && P.finds('nope') === null);
check('XD1 finds: bonusFind is deterministic, in-table, and empty above the chance or on junk', (() => {
  const f = P.finds('meadow'), ids = f.items.map((r) => r[0]);
  let ok = true;
  for (let i = 0; i < 200; i++) { const u = i / 200, a = X.bonusFind('meadow', u); if (a !== X.bonusFind('meadow', u)) ok = false; if (u < f.chance ? ids.indexOf(a) < 0 : a !== '') ok = false; }
  return ok && X.bonusFind('meadow', -0.1) === '' && X.bonusFind('meadow', 1) === '' && X.bonusFind('meadow', NaN) === '' && X.bonusFind('meadow', '0.1') === '' && X.bonusFind('nope', 0.01) === '';
})());
check('XD1 finds: every find item is a known item and each weight is reachable', P.IDS.every((id) => {
  const f = P.finds(id), seen = {};
  for (let i = 0; i < 1000; i++) { const it = X.bonusFind(id, (i / 1000) * f.chance); seen[it] = 1; }
  return f.items.every((r) => seen[r[0]] && X.sourcesOf(r[0]).indexOf('find:' + id) >= 0);
}));
check('XD1: the module source has no Math.random, Date, DOM or network', (() => { const s = require('fs').readFileSync(require('path').join(__dirname, '..', 'shared', 'mm-isle-craft.js'), 'utf8'); return !/Math\.random|Date\.|new Date|document\.|window\.|fetch\(|XMLHttpRequest|localStorage/.test(s); })());

console.log(failed ? `${failed} FAILED` : 'ALL PASSED'); process.exitCode = failed ? 1 : 0;
