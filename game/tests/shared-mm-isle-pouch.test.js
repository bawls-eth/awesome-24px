// IF1 (NEXT-SLICES-4): unit tests for shared/mm-isle-pouch.js (MMIslePouch), IsleCreatures.foodFor(def, pouch, inv, reserve) and the
// food-source rule (every MMCreatures diet item has a source). Run: node game/tests/shared-mm-isle-pouch.test.js
const C = require('../shared/mm-creatures.js');
const P = require('../shared/mm-biome-packs.js');
const X = require('../shared/mm-isle-craft.js');
const O = require('../shared/mm-overworld.js');
const I = require('../shared/mm-isles.js');
const U = require('../shared/mm-isle-pouch.js');
const IC = require('../games/isles/isle-creatures.js');
let failed = 0;
function check(name, cond, extra = '') { console.log((cond ? 'PASS ' : 'FAIL ') + name + (cond ? '' : ' ' + extra)); if (!cond) failed++; }

// ---- 1. a pouch per island ----
const ISLES = ['home', 'jungle', 'reef', 'ice', 'mars'];
check('the base pouch is the classic jungle pouch (IsleCreatures.STARTER_POUCH)', JSON.stringify(U.BASE) === JSON.stringify(IC.STARTER_POUCH));
check('starter(isle) = the jungle pouch plus the island staple', ISLES.every((id) => { const s = U.starter(id); return Object.keys(U.BASE).every((k) => s[k] === U.BASE[k]) && Object.keys(U.ADD[id]).every((k) => s[k] === (U.BASE[k] || 0) + U.ADD[id][k]); }));
check('home adds clover + apple, reef kelp + fish, the tundra fish + frostberry, mars oxide dust + greenhouse potato', U.starter('home').clover > 0 && U.starter('home').apple > 0 && U.starter('reef').kelp > 0 && U.starter('reef').fish > 0 &&
  U.starter('ice').fish > 0 && U.starter('ice').frostberry > 0 && U.starter('mars').oxide_dust > 0 && U.starter('mars').greenhouse_potato > 0);
check('pack ids work too (meadow = home, tundra = ice)', JSON.stringify(U.starter('meadow')) === JSON.stringify(U.starter('home')) && JSON.stringify(U.starter('tundra')) === JSON.stringify(U.starter('ice')));
check('?pouch=classic: starter(isle, {classic}) is the old pouch everywhere', ISLES.every((id) => JSON.stringify(U.starter(id, { classic: true })) === JSON.stringify(U.BASE)));
check('starter() returns a fresh object each call (a visit never shares one)', U.starter('home') !== U.starter('home') && (() => { const a = U.starter('reef'); a.kelp = 0; return U.starter('reef').kelp > 0; })());
check('junk isle -> the jungle pouch', JSON.stringify(U.starter('nope')) === JSON.stringify(U.BASE) && JSON.stringify(U.starter(null)) === JSON.stringify(U.BASE));
// every island has a feed-or-calm tameable its own pouch can feed (the reachability rule of IF1); the classic pouch had none on 4 islands
ISLES.forEach((id) => check(`${id}: at least one feed / calm tameable eats from its starter pouch (${U.feedableOn(id).join(', ')})`, U.feedableOn(id).length > 0));
check('the tundra pouch feeds the pengling (fish), the tundra first tame', U.feedableOn('ice').indexOf('pengling') >= 0);
check('with the classic pouch home / reef / tundra / mars had nothing to feed (the bug)', ['home', 'reef', 'ice', 'mars'].every((id) => U.feedableOn(id, { classic: true }).length === 0));
check('one tame worth of staple: each island staple covers a level-10 single-food tame (need <= 8 feeds)', ['home', 'reef', 'ice', 'mars'].every((id) => U.starter(id)[U.staple(id)] >= 8));

// ---- 2. foodFor(def, pouch, inv, reserve) ----
const boar = C.get('thistle_boar'); // diet apple, clover
check('foodFor: the pouch first, most liked first', JSON.stringify(IC.foodFor(boar, { apple: 1, clover: 3 }, { apple: 9 })) === JSON.stringify({ id: 'apple', have: true, from: 'pouch', kept: '' }));
check('foodFor: any pouch food before the bag (pouch clover beats bag apple)', IC.foodFor(boar, { clover: 1 }, { apple: 5 }).from === 'pouch' && IC.foodFor(boar, { clover: 1 }, { apple: 5 }).id === 'clover');
check('foodFor: the bag (inv) when the pouch has none: "wants apple, you have none" is fixed', JSON.stringify(IC.foodFor(boar, { jungle_berry: 4 }, { apple: 1 })) === JSON.stringify({ id: 'apple', have: true, from: 'inv', kept: '' }));
check('foodFor: nothing anywhere -> the favourite, have false', JSON.stringify(IC.foodFor(boar, {}, {})) === JSON.stringify({ id: 'apple', have: false, from: '', kept: '' }));
check('foodFor without inv is the old pouch-only pick', IC.foodFor(boar, {}, undefined).have === false && IC.foodFor(boar, { clover: 2 }).id === 'clover');
check('foodFor: a reserved bag food is kept back and named (kept), never offered', (() => { const r = IC.foodFor(C.get('rustbeetle'), {}, { iron: 4 }, { iron: 4 }); return r.have === false && r.kept === 'iron'; })());
check('foodFor: only the units above the reserve are offered', IC.foodFor(C.get('rustbeetle'), {}, { iron: 5 }, { iron: 4 }).from === 'inv');
check('foodFor: no diet -> null', IC.foodFor(C.get('icicle_bat'), {}, {}) === null && IC.foodFor(null, {}, {}) === null);
// reserveFor: what a locked travel recipe still needs
check('reserveFor: the largest count per input over the given recipes', (() => { const r = U.reserveFor(['o2_tank', 'o2_tank_kelp'], {}); return r.kelp === 3 && r.iron === 3 && r.shell === 2; })());
check('reserveFor: the raft reserves its vine rope and wood; the rocket core its iron', (() => { const r = U.reserveFor(['raft', 'rocket_core', 'rocket_core_drift'], {}); return r.vine_rope === 2 && r.wood === 4 && r.iron === 4 && r.amber === 2; })());
check('reserveFor: junk is empty', JSON.stringify(U.reserveFor(null)) === '{}' && JSON.stringify(U.reserveFor(['nope'])) === '{}');

// ---- 3. every creature diet item has a source (this FAILS when a diet item has none) ----
const diets = []; C.list().forEach((d) => (d.diet || []).forEach((f) => { if (diets.indexOf(f) < 0) diets.push(f); }));
const orphan = diets.filter((f) => X.sourcesOf(f).length === 0 && X.recipesFor(f).length === 0);
check(`every MMCreatures diet item (${diets.length}) has a source: a pack resource, forage find, food glint, drop table or recipe`, orphan.length === 0, 'no source: ' + orphan.join(', '));
check('MMIsleCraft.dietGaps() agrees (empty) and validate() is ok', X.dietGaps().length === 0 && X.validate().ok, JSON.stringify(X.dietGaps()) + ' ' + JSON.stringify(X.validate().errors));
check('the rule bites: with no recipes the feast (a boss diet made only by a recipe) has no source, and validate() says so', JSON.stringify(X.dietGaps({})) === '["feast"]' &&
  X.validate({ raft: X.RECIPES.raft, rocket_core: X.RECIPES.rocket_core }).errors.some((e) => /diet item feast has no source/.test(e)));
['fish', 'flower', 'sea_melon', 'greenhouse_potato', 'golden_apple', 'nectar', 'hay', 'bug'].forEach((f) => check(`the old orphan ${f} now has a source (${X.sourcesOf(f).join(', ')})`, X.sourcesOf(f).length > 0));
check('fish comes from the home, reef and tundra islands; golden apple and hay from home; sea melon from the reef; potatoes from mars', (() => {
  const at = (f) => X.islesOf(f); return ['home', 'reef', 'ice'].every((i) => at('fish').indexOf(i) >= 0) && at('golden_apple').indexOf('home') >= 0 && at('hay').indexOf('home') >= 0 && at('sea_melon').indexOf('reef') >= 0 && at('greenhouse_potato').indexOf('mars') >= 0;
})());
check('the food tables stay additive: the clover is still a single-source input (the XD1 validate fixture)', X.sourcesOf('clover').length === 1);
check('every food-glint row is well formed', Object.keys(X.FOOD_NODES).every((pk) => P.get(pk) && X.FOOD_NODES[pk].every((r) => /^[a-z_]+$/.test(r.id) && r.n >= 1 && r.n <= 20 && Array.isArray(r.terrain) && r.respawn > 0)));

// ---- 4. seeded placement on the real island worlds ----
const placed = {};
ISLES.forEach((isle) => {
  const pk = P.resolveId(I.ISLES[isle].pack), w = O.generate('123', { pack: pk, size: I.ISLES[isle].size });
  const walk = (x, y) => !O.isSolid(w, x, y);
  const a = U.place(w, pk, '123', walk, O.TERRAIN_NAMES), b = U.place(w, pk, '123', walk, O.TERRAIN_NAMES);
  placed[isle] = { w, a };
  const want = X.foodNodes(pk).reduce((s, r) => s + r.n, 0);
  check(`${isle}: place() is seed-stable and puts every food glint (${a.length}/${want}) on a distinct walkable tile`, JSON.stringify(a) === JSON.stringify(b) && a.length === want && new Set(a.map((g) => g.y * w.w + g.x)).size === a.length && a.every((g) => walk(g.x, g.y)));
  check(`${isle}: another seed moves the glints`, JSON.stringify(U.place(w, pk, '999', walk, O.TERRAIN_NAMES)) !== JSON.stringify(a));
});
{ const j = placed.jungle, d = j.w.dock, v = j.a.filter((g) => g.kind === 'vine_rope');
  check('jungle: 3 labelled vine rope glints within 15 tiles of the dock (the raft input)', v.length === 3 && v.every((g) => g.label === 'vine rope' && Math.hypot(g.x - d.x, g.y - d.y) <= 15 * Math.SQRT2), JSON.stringify(v)); }
{ const h = placed.home, d = h.w.dock, f = h.a.filter((g) => g.kind === 'fish');
  check('home: fish glints by the dock', f.length >= 1 && f.every((g) => Math.abs(g.x - d.x) <= 8 && Math.abs(g.y - d.y) <= 8)); }
check('place(): a taken tile is never used', (() => { const h = placed.home; const t = new Set(h.a.map((g) => g.y * h.w.w + g.x)); const pk = 'meadow'; const r = U.place(h.w, pk, '123', (x, y) => !O.isSolid(h.w, x, y), O.TERRAIN_NAMES, (i) => t.has(i)); return r.every((g) => !t.has(g.y * h.w.w + g.x)); })());
check('place(): junk in -> []', U.place(null, 'meadow', '1', () => true).length === 0 && U.place(placed.home.w, 'nope', '1', () => true).length === 0);
// sparkles
check('sparkle(isle, u): an island food in range, deterministic', ISLES.every((id) => { for (let i = 0; i < 20; i++) { const a = U.sparkle(id, i / 20); if (!a || a !== U.sparkle(id, i / 20) || X.sourcesOf(a).length === 0) return false; } return true; }) && U.sparkle('home', NaN) === U.sparkle('home', 0));
check('sparkles: 6 a day per island, after 40 s without a reward, within 10 tiles', U.SPARKLES_PER_DAY === 6 && U.SPARKLE_AFTER === 40 && U.SPARKLE_R === 10);
check('where(): plain words for the foods and the raft vine', U.where('clover').length > 10 && /dock/.test(U.where('vine_rope')) && U.where('nope') === '');
// save: the additive spark key is cleaned and stays tiny
check('MMIsles.clean keeps a valid spark key and drops junk', (() => { const a = I.clean({ spark: { day: '2026-11-22', n: { home: 3, reef: 9, bogus: 2, ice: -1 } } }).spark; const b = I.clean({ spark: { day: 'today', n: {} } }).spark;
  return a && a.day === '2026-11-22' && a.n.home === 3 && a.n.reef === 6 && !('bogus' in a.n) && !('ice' in a.n) && b === undefined; })());
check('the module source has no Math.random, Date, DOM, storage or network', (() => { const s = require('fs').readFileSync(require('path').join(__dirname, '..', 'shared', 'mm-isle-pouch.js'), 'utf8'); return !/Math\.random|Date\.|new Date|document\.|window\.|fetch\(|XMLHttpRequest|localStorage/.test(s); })());

console.log(failed ? `${failed} FAILED` : 'ALL PASSED'); process.exitCode = failed ? 1 : 0;
