// Pure-node tests for shared/mm-overworld.js. Run: node game/tests/shared-mm-overworld.test.js
const fs = require('fs');
const path = require('path');
const O = require('../shared/mm-overworld.js');
let failed = 0;
function check(name, cond, extra = '') { console.log((cond ? 'PASS ' : 'FAIL ') + name + (cond ? '' : ' ' + extra)); if (!cond) failed++; }

const ART_IDS = ['puffcap', 'beetle', 'archer', 'moth', 'sprout', 'mothling', 'sprout_mini', 'goblin_scout', 'skeleton', 'cave_bat', 'forest_wolf', 'stone_golem', 'dark_spider', 'crystal_beetle', 'ember_imp', 'ice_wraith', 'goblin_shaman', 'skeleton_archer', 'bone_knight', 'shadow_cultist', 'slime_green', 'slime_red', 'slime_blue', 'swamp_leech', 'toxic_serpent', 'sand_scorpion'];
const BOSS_ART = ['bone_colossus', 'inferno_wyrm', 'void_oracle', 'crystal_titan', 'forest_warden', 'dread_knight', 'storm_harbinger', 'mire_queen',
  // b23 bosses-extra: the default boss pools now also draw these (honest update; generate(seed, { bosses: 'classic' }) still yields only the 8 above)
  'lich_king', 'hydra', 'treant_elder', 'sand_titan', 'frost_dragon', 'shadow_hydra', 'clockwork_golem', 'void_maw'];
const TYPES = ['spiral', 'aimed', 'ring'];

const t0 = Date.now();
const w = O.generate('town-1');
const genMs = Date.now() - t0;
check('size 256x256 with typed arrays', w.w === 256 && w.h === 256 && w.terrain instanceof Uint8Array && w.zone instanceof Uint8Array && w.terrain.length === 65536);
check('version exported', O.VERSION === w.version && typeof O.VERSION === 'number');
check('generation < 400 ms (took ' + genMs + ')', genMs < 400);
check('terrain table has the 18 art ids', Object.keys(O.TERRAIN).length === 18 && O.TERRAIN.lava_rock === 17 && O.TERRAIN.deep_water === 0);

// determinism
const a = O.generate('seed-x'), b = O.generate('seed-x'), c = O.generate('seed-y');
check('same seed => identical hash', O.hash(a) === O.hash(b));
check('same seed => identical spawn/groups', JSON.stringify([a.spawnPoint, a.spawnGroups]) === JSON.stringify([b.spawnPoint, b.spawnGroups]));
check('different seeds differ', O.hash(a) !== O.hash(c));

// 40 seeds verify
const bad = [];
const means = [[], [], [], []];
let worstMs = 0;
for (let s = 0; s < 40; s++) {
  const t = Date.now(); const world = O.generate('verify-' + s); worstMs = Math.max(worstMs, Date.now() - t);
  const v = O.verify(world);
  if (!v.ok) bad.push('verify-' + s + ': ' + v.problems.slice(0, 3).join('; '));
  const sum = [0, 0, 0, 0], cnt = [0, 0, 0, 0];
  for (let i = 0; i < world.zone.length; i++) { const z = world.zone[i]; if (z < 4) { sum[z] += world.difficulty[i] / 255; cnt[z]++; } }
  for (let z = 0; z < 4; z++) means[z].push(cnt[z] ? sum[z] / cnt[z] : 0);
  const sp = world.spawnPoint, si = sp.y * world.w + sp.x;
  if (world.zone[si] !== 0) bad.push('spawn zone seed ' + s);
  const dn = Math.hypot(sp.x - 127.5, sp.y - 127.5) / world.coastRadius;
  if (dn < 0.65 || dn > 0.95) bad.push('spawn not on shore ring seed ' + s + ' d=' + dn.toFixed(2));
  if (world.spawnGroups.length < 40) bad.push('groups ' + world.spawnGroups.length + ' seed ' + s);
  if (world.portalSites.length < 4) bad.push('portals seed ' + s);
  if (world.bossSites.length < 8) bad.push('bosses ' + world.bossSites.length + ' seed ' + s);
  if (world.structures.length < 20) bad.push('structures ' + world.structures.length + ' seed ' + s);
  if (O.BIOMES.some(function (bi) { return !world.portalSites.some(function (p) { return p.biome === bi; }); })) bad.push('missing biome seed ' + s);
}
check('40 seeds verify ok (spawn on shore, >=40 groups, 4 portals, 8 bosses, >=20 structures)', bad.length === 0, bad.slice(0, 5).join(' | '));
const mean = means.map(function (m) { return m.reduce(function (p, q) { return p + q; }, 0) / m.length; });
check('mean difficulty rises toward the centre ' + mean.map(function (m) { return m.toFixed(2); }).join('<'), mean[0] < mean[1] && mean[1] < mean[2] && mean[2] < mean[3]);
check('worst generation time < 400 ms (' + worstMs + ')', worstMs < 400);

// reachability, independent of verify()
{
  const world = O.generate('reach-1'), W = world.w;
  const seen = new Uint8Array(W * world.h), q = [world.spawnPoint.y * W + world.spawnPoint.x];
  seen[q[0]] = 1;
  for (let h = 0; h < q.length; h++) {
    const cc = q[h], x = cc % W, y = (cc / W) | 0;
    [[1, 0], [-1, 0], [0, 1], [0, -1]].forEach(function (d) {
      const nx = x + d[0], ny = y + d[1];
      if (nx < 0 || ny < 0 || nx >= W || ny >= world.h) return;
      const n = ny * W + nx;
      if (!seen[n] && !O.isSolid(world, nx, ny)) { seen[n] = 1; q.push(n); }
    });
  }
  const reachable = function (p) { return seen[p.y * W + p.x] === 1; };
  check('all portal sites reachable', world.portalSites.every(reachable));
  check('all boss sites reachable', world.bossSites.every(reachable));
  check('all structures reachable', world.structures.every(reachable));
  check('portal sites are also structures', world.portalSites.every(function (p) { return world.structures.some(function (s) { return s.kind === 'portal_site' && s.x === p.x && s.y === p.y; }); }));
  check('deep water is solid and void zone', (function () { for (let i = 0; i < world.terrain.length; i++) if (world.terrain[i] === O.TERRAIN.deep_water && (!world.solid[i] || world.zone[i] !== 255)) return false; return true; })());
  check('map edge is deep water', O.tileAt(world, 0, 0) === O.TERRAIN.deep_water && O.tileAt(world, 255, 128) === O.TERRAIN.deep_water && O.isSolid(world, -5, 3));
  check('boss zones follow the plan', world.bossSites.every(function (b) { return O.zoneAt(world, b.x, b.y) === b.zone; }));
  check('godlands hold the last three bosses', world.bossSites.filter(function (b) { return b.zone === 3; }).length === 3);
  check('difficultyAt is in 0..1 and smooth', (function () { let prev = null; for (let x = 10; x < 120; x += 0.25) { const d = O.difficultyAt(world, x, 128.3); if (d < 0 || d > 1) return false; if (prev !== null && Math.abs(d - prev) > 0.05) return false; prev = d; } return true; })());
  check('difficulty higher near the centre than at spawn', O.difficultyAt(world, 128, 128) > O.difficultyAt(world, world.spawnPoint.x, world.spawnPoint.y));
  const g = world.spawnGroups[5], near = O.nearestSpawnGroups(world, g.x, g.y, 20);
  check('nearestSpawnGroups finds the group at distance 0, sorted', near[0] === g && near.every(function (s, i) { return i === 0 || Math.hypot(s.x - g.x, s.y - g.y) >= Math.hypot(near[i - 1].x - g.x, near[i - 1].y - g.y); }));
  const brute = world.spawnGroups.filter(function (s) { return Math.hypot(s.x - g.x, s.y - g.y) <= 20; }).length;
  check('nearestSpawnGroups matches brute force', near.length === brute);
  let ok = true;
  [[0, 0], [3, 4], [7, 7], [-1, 2], [8, 8]].forEach(function (cc) {
    const ch = O.chunk(world, cc[0], cc[1], 32);
    for (let y = 0; y < 32 && ok; y++) for (let x = 0; x < 32; x++) {
      const wx = cc[0] * 32 + x, wy = cc[1] * 32 + y;
      if (ch.terrain[y * 32 + x] !== O.tileAt(world, wx, wy) || ch.solid[y * 32 + x] !== (O.isSolid(world, wx, wy) ? 1 : 0) || ch.zone[y * 32 + x] !== O.zoneAt(world, wx, wy)) { ok = false; break; }
    }
  });
  check('chunk() agrees with tileAt/isSolid/zoneAt (incl. out of bounds)', ok);
  check('props are in bounds with a kind', world.props.length > 200 && world.props.every(function (p) { return p.x >= 0 && p.y >= 0 && p.x < 256 && p.y < 256 && typeof p.kind === 'string'; }));
}

// creature ids
{
  const world = O.generate('ids-1');
  const used = new Set(world.spawnGroups.map(function (g) { return g.creature; }));
  check('spawn groups use only delivered enemy art ids', [...used].every(function (id) { return ART_IDS.indexOf(id) >= 0; }), [...used].join());
  check('spawn groups use existing enemy types', world.spawnGroups.every(function (g) { return TYPES.indexOf(g.type) >= 0 && g.count >= 1 && g.tier === g.zone; }));
  check('CREATURE_TIERS only lists delivered ids, 4 tiers per type', TYPES.every(function (t) { return O.CREATURE_TIERS[t].length === 4 && O.CREATURE_TIERS[t].every(function (l) { return l.every(function (id) { return ART_IDS.indexOf(id) >= 0; }); }); }));
  check('boss sites use delivered boss ids, all 8 distinct', world.bossSites.every(function (b) { return BOSS_ART.indexOf(b.boss) >= 0; }) && new Set(world.bossSites.map(function (b) { return b.boss; })).size === 8);
}
check('128x128 world verifies', O.verify(O.generate('small', { size: 128 })).ok);

// source hygiene
const src = fs.readFileSync(path.join(__dirname, '..', 'shared', 'mm-overworld.js'), 'utf8');
check('no Math.random in source', src.indexOf('Math.random') < 0);
check('no Date/DOM use in source', !/\bDate\b|document\.|window\./.test(src));

console.log(failed ? failed + ' FAILED' : 'ALL PASSED');
process.exitCode = failed ? 1 : 0;
