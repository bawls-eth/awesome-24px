// Pure-node tests for shared/mm-biome-packs.js and MMOverworld.generate(seed, { pack }). Run: node game/tests/shared-mm-biome-packs.test.js
// BIOME-ARCH-PLAN 1.2 / slice A1: packs verify over 50 seeds each, are deterministic, live in their own seed space, never move a Realm
// world (golden fixture), and hostile pack ids fall back to the Realm world.
const fs = require('fs');
const path = require('path');
const O = require('../shared/mm-overworld.js');
const BP = require('../shared/mm-biome-packs.js');
const LS = require('./lib/load-scale'); // load-scaled timing budgets
let failed = 0;
function check(name, cond, extra = '') { console.log((cond ? 'PASS ' : 'FAIL ') + name + (cond ? '' : ' ' + extra)); if (!cond) failed++; }

const PACKS = ['meadow', 'jungle', 'reef', 'tundra', 'mars'];
const HAZARD_KEYS = ['cold', 'oxygen', 'gravity']; // pack-wide hazards (not terrain names)

// ---- data ----
check('pack ids are exactly meadow, jungle, reef, tundra, mars', JSON.stringify(BP.IDS.slice().sort()) === JSON.stringify(PACKS.slice().sort()));
check('validate() finds no problem in any pack (terrain names checked against MMOverworld.TERRAIN_NAMES)', PACKS.every(function (p) { return BP.validate(BP.get(p), O.TERRAIN_NAMES).length === 0; }),
  PACKS.map(function (p) { return p + ': ' + BP.validate(BP.get(p), O.TERRAIN_NAMES).slice(0, 3).join(', '); }).join(' | '));
check('validate() rejects junk and a broken pack', BP.validate(null).length > 0 && BP.validate({ id: 'x' }).length > 3 &&
  BP.validate(Object.assign({}, BP.get('jungle'), { coast: ['deep_water', 'lava_lake', 'sand', 'sand'] }), O.TERRAIN_NAMES).some(function (s) { return /lava_lake/.test(s); }));
check('packs and their tables are frozen', PACKS.every(function (p) { const k = BP.get(p); return Object.isFrozen(k) && Object.isFrozen(k.bands) && Object.isFrozen(k.creatures) && Object.isFrozen(k.tiles.road); }));
check('sizes: default 128..192 and inside the declared range', PACKS.every(function (p) { const k = BP.get(p); return k.size >= 128 && k.size <= 192 && k.sizes[0] <= k.size && k.size <= k.sizes[1]; }));
check('bands: a shore ring then interior rings, contiguous from dw 0.97 to 0', PACKS.every(function (p) { const b = BP.get(p).bands; return b[0].dwMax === 0.97 && b[b.length - 1].dwMin === 0 && b[0].dwMin >= 0.5 && b.every(function (x, i) { return i === 0 || b[i - 1].dwMin === x.dwMax; }); }));
check('appended terrain: realm ids 0..17 unchanged, new ids from 18 in TERRAIN_NAMES order', O.TERRAIN_NAMES.slice(0, 18).join() === Object.keys(O.TERRAIN).join() &&
  Object.keys(O.TERRAIN_EXT).every(function (n) { return O.TERRAIN_EXT[n] >= 18 && O.TERRAIN_NAMES[O.TERRAIN_EXT[n]] === n && O.TERRAIN_ALL[n] === O.TERRAIN_EXT[n]; }) && O.TERRAIN_NAMES.length < 256 && O.TERRAIN_EXT.tilled_soil === 18);
check('every pack-only terrain has a 4-colour palette hint', PACKS.every(function (p) { const k = BP.get(p); return k.terrain.every(function (n) { return O.TERRAIN_ALL[n] < 18 || (k.palette[n] && k.palette[n].length === 4 && k.palette[n].every(function (c) { return /^#[0-9a-f]{6}$/.test(c); })); }); }));
check('hazards name pack terrain (or a pack-wide hazard)', PACKS.every(function (p) { const k = BP.get(p); return Object.keys(k.hazards).every(function (n) { return k.terrain.indexOf(n) >= 0 || HAZARD_KEYS.indexOf(n) >= 0; }); }));
check('jungle mud has the 0.6 move scale the page test expects', BP.get('jungle').hazards.mud.slow === 0.6);
check('creature skeleton: every listed id has a base type; meadow has no boss; others have one', PACKS.every(function (p) { const k = BP.get(p); return BP.creatureIds(p).every(function (id) { return ['spiral', 'aimed', 'ring'].indexOf(k.base[id]) >= 0; }); }) &&
  BP.get('meadow').bosses.length === 0 && ['jungle', 'reef', 'tundra', 'mars'].every(function (p) { return BP.get(p).bosses.length === 1; }) && BP.creatureIds('jungle').indexOf('raptor') >= 0 && BP.creatureIds('reef').indexOf('isleback_turtle') >= 0);
check('resource tables name pack terrain', PACKS.every(function (p) { const k = BP.get(p); return k.resources.length >= 4 && k.resources.every(function (r) { return r.terrain.every(function (n) { return k.terrain.indexOf(n) >= 0; }); }); }));

// ---- hostile ids ----
const HOSTILE = ['__proto__', 'constructor', 'toString', 'hasOwnProperty', 'JUNGLE', ' jungle', 'jungle ', 'jungle|1', 'realm', 'x'.repeat(200), '', 7, null, true, {}, ['jungle'], { id: 'jungle' }, function () { return 'jungle'; }];
check('resolveId/get: hostile ids resolve to null', HOSTILE.every(function (id) { return BP.resolveId(id) === null && BP.get(id) === null; }));
check('aliases home -> meadow and ice -> tundra', BP.resolveId('home') === 'meadow' && BP.resolveId('ice') === 'tundra' && BP.get('home') === BP.get('meadow'));
const realm123 = O.hash(O.generate('123'));
check('hostile opts.pack values are ignored: the Realm world, byte-identical, with no pack key', HOSTILE.every(function (id) { const w = O.generate('123', { pack: id }); return w.pack === undefined && w.bands === 'wide' && O.hash(w) === realm123; }));
check('opts.pack undefined is the Realm world too; packOf() reports null for it', O.hash(O.generate('123', { pack: undefined })) === realm123 && O.packOf({}) === null && O.packOf({ pack: '__proto__' }) === null && O.packOf({ pack: 'home' }) === 'meadow');

// ---- old seeds identical (the golden fixture) ----
{
  const gold = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', 'overworld-golden.json'), 'utf8'));
  const sample = gold.seeds.slice(0, 6);
  check('golden fixture: 6 Realm seeds x default/size128 still hash identically (full set: shared-mm-overworld-golden.test.js)', sample.every(function (s) { return O.hash(O.generate(s)) === gold.hashes.default[s] && O.hash(O.generate(s, { size: 128 })) === gold.hashes.size128[s]; }));
  check('golden fixture: a hostile pack id on a classic-bands world keeps its golden hash', sample.every(function (s) { return O.hash(O.generate(s, { bands: 'classic', pack: 'constructor' })) === gold.hashes.bandsClassic[s]; }));
}

// ---- seed space and determinism ----
{
  const j1 = O.generate('123', { pack: 'jungle' }), j2 = O.generate('123', { pack: 'jungle' });
  check('jungle world records its pack, dock and resources; size 160 by default', j1.pack === 'jungle' && j1.w === 160 && j1.dock && Array.isArray(j1.resources) && j1.bands === 'pack');
  check('determinism: same seed + pack => identical hash, arrays, dock and resources', O.hash(j1) === O.hash(j2) && Buffer.compare(Buffer.from(j1.height), Buffer.from(j2.height)) === 0 &&
    JSON.stringify([j1.dock, j1.resources]) === JSON.stringify([j2.dock, j2.resources]));
  check('own seed space: jungle 123 differs from Realm 123 (also at the same size) and from jungle 124', O.hash(j1) !== realm123 && O.hash(j1) !== O.hash(O.generate('123', { size: 160 })) && O.hash(j1) !== O.hash(O.generate('124', { pack: 'jungle' })));
  const hs = PACKS.map(function (p) { return O.hash(O.generate('123', { pack: p, size: 160 })); });
  check('own seed space: the five packs give five different worlds for one seed', new Set(hs).size === 5);
  const jt = Object.assign({}, j1, { resources: j1.resources.slice(1) }), jd = Object.assign({}, j1, { dock: { x: j1.dock.x + 1, y: j1.dock.y } });
  check('O.hash() of a pack world also covers its dock and resource nodes', O.hash(jt) !== O.hash(j1) && O.hash(jd) !== O.hash(j1));
  check('alias home generates the meadow world', O.hash(O.generate('9', { pack: 'home' })) === O.hash(O.generate('9', { pack: 'meadow' })));
  check('generate() === generateWith(seed, opts, paramsFor(opts)) for a pack and for the Realm', O.hash(O.generateWith('5', { pack: 'reef' }, O.paramsFor({ pack: 'reef' }))) === O.hash(O.generate('5', { pack: 'reef' })) &&
    O.hash(O.generateWith('5', {}, O.paramsFor({}))) === O.hash(O.generate('5')));
  check('size clamps into the pack range', O.generate('1', { pack: 'mars', size: 1e6 }).w === 192 && O.generate('1', { pack: 'mars', size: 16 }).w === 128 && O.generate('1', { pack: 'mars', size: 'junk' }).w === 192 && O.generate('1', { pack: 'meadow', size: 96 }).w === 96);
  // best of 3 (generation is deterministic, so the minimum is the CPU cost without scheduler noise), budget scaled by machine load
  let ms = Infinity; for (let k = 0; k < 3; k++) { const t = Date.now(); O.generate('perf-1', { pack: 'jungle', size: 160 }); ms = Math.min(ms, Date.now() - t); }
  const LIM = LS.budget(120);
  check('a 160x160 jungle generates in under ' + LIM + ' ms (120 ms idle; best of 3: ' + ms + ' ms)', ms < LIM);
}

// ---- 50 seeds x 5 packs ----
{
  const bad = [], low = [], creat = [], dockBad = [], spawnBad = [], ids = [], foreign = [], res = [];
  let worst = 0, worstKey = null;
  PACKS.forEach(function (p) {
    const k = BP.get(p), allowed = {};
    k.terrain.forEach(function (n) { allowed[O.TERRAIN_ALL[n]] = 1; });
    for (let s = 0; s < 50; s++) {
      const t0 = Date.now(); const w = O.generate('pk-' + s, { pack: p }); const dt = Date.now() - t0; if (dt > worst) { worst = dt; worstKey = [p, 'pk-' + s]; }
      const v = O.verify(w);
      if (!v.ok) bad.push(p + '/' + s + ': ' + v.problems.slice(0, 2).join('; '));
      const W = w.w, si = w.spawnPoint.y * W + w.spawnPoint.x;
      if (w.solid[si] || w.zone[si] !== 0) spawnBad.push(p + '/' + s);
      if (w.spawnGroups.length < Math.ceil(k.verify.groupsPer64k * W * W / 65536)) creat.push(p + '/' + s + ' ' + w.spawnGroups.length);
      w.spawnGroups.forEach(function (g) { if (k.creatures[g.tier].indexOf(g.creature) < 0 || g.type !== k.base[g.creature] || g.zone !== g.tier) creat.push(p + '/' + s + ' ' + g.creature); });
      const d = w.dock, di = d.y * W + d.x;
      let sea = false;
      for (let oy = -3; oy <= 3; oy++) for (let ox = -3; ox <= 3; ox++) { const j = (d.y + oy) * W + d.x + ox; if (w.zone[j] === O.ZONES.VOID) sea = true; }
      if (w.solid[di] || w.zone[di] !== 0 || !sea || !w.structures.some(function (x) { return x.kind === 'dock' && x.x === d.x && x.y === d.y; })) dockBad.push(p + '/' + s);
      for (let i = 0; i < w.terrain.length; i++) {
        const tt = w.terrain[i];
        if (tt >= O.TERRAIN_NAMES.length) { ids.push(p + '/' + s); break; }
        if (!allowed[tt]) { foreign.push(p + '/' + s + ' ' + O.TERRAIN_NAMES[tt]); break; }
        if (p === 'jungle' && tt < 18 && ['deep_water', 'shallow_water', 'sand', 'wet_sand'].indexOf(O.TERRAIN_NAMES[tt]) < 0) { low.push(s + ' ' + O.TERRAIN_NAMES[tt]); break; }
      }
      const kinds = k.resources.map(function (r) { return r.id; });
      if (!w.resources.length || w.resources.some(function (r) { return kinds.indexOf(r.kind) < 0 || w.solid[r.y * W + r.x]; })) res.push(p + '/' + s);
    }
  });
  check('verify() ok for 50 seeds x 5 packs (reachable dock + structures + boss, creature floor, pack tables, determinism)', bad.length === 0, bad.slice(0, 4).join(' | '));
  check('no spawn is solid or off the shore band (250 worlds)', spawnBad.length === 0, spawnBad.slice(0, 4).join());
  check('creature groups >= the pack floor and every group creature is in its band table with its base type', creat.length === 0, creat.slice(0, 4).join());
  check('the dock is open shore ground next to the sea and listed as a structure', dockBad.length === 0, dockBad.slice(0, 4).join());
  check('pack worlds use only ids inside TERRAIN_NAMES and inside their own terrain list', ids.length === 0 && foreign.length === 0, ids.concat(foreign).slice(0, 4).join());
  check('jungle: only water and sand appear among ids below 18 (50 seeds)', low.length === 0, low.slice(0, 4).join());
  check('resource nodes: present, from the pack table, never on solid ground', res.length === 0, res.slice(0, 4).join());
  // the slowest single run of 250 is where a scheduler pause shows up: re-time exactly that world 3 times and keep the minimum
  if (worstKey && worst >= 100) for (let k = 0; k < 3; k++) { const t0 = Date.now(); O.generate(worstKey[1], { pack: worstKey[0] }); worst = Math.min(worst, Date.now() - t0); }
  check('worst pack generation time < ' + LS.budget(400) + ' ms (400 ms idle, load-scaled; ' + worst + ')', worst < LS.budget(400));
}

// ---- verify catches broken pack worlds ----
{
  const w = O.generate('tamper', { pack: 'tundra' });
  const w2 = Object.assign({}, w, { dock: { x: 0, y: 0 } });
  check('verify: a dock in the sea fails', !O.verify(w2, { determinism: false }).ok);
  const w3 = Object.assign({}, w, { pack: 'nope' });
  check('verify: an unknown pack key fails', !O.verify(w3).ok && O.verify(w3).problems.some(function (s) { return /unknown pack/.test(s); }));
  const w4 = Object.assign({}, w, { spawnGroups: w.spawnGroups.map(function (g, i) { return i ? g : Object.assign({}, g, { creature: 'raptor' }); }) });
  check('verify: a creature from another pack fails', O.verify(w4, { determinism: false }).problems.some(function (s) { return /bad creature raptor/.test(s); }));
  const w5 = Object.assign({}, w, { spawnGroups: w.spawnGroups.slice(0, 5) });
  check('verify: too few creature groups fails', O.verify(w5, { determinism: false }).problems.some(function (s) { return /spawn groups/.test(s); }));
}

// ---- source hygiene ----
const src = fs.readFileSync(path.join(__dirname, '..', 'shared', 'mm-biome-packs.js'), 'utf8');
check('mm-biome-packs.js: no Math.random, Date, DOM or network', src.indexOf('Math.random') < 0 && !/\bDate\b|document\.|window\.|fetch\(|XMLHttpRequest|firebase/i.test(src));

console.log(failed ? failed + ' FAILED' : 'ALL PASSED');
process.exitCode = failed ? 1 : 0;
