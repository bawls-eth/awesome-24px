// Node test for MMDDSpawn. Run: node game/tests/shared-mm-dd-spawn.test.js
const path = require('path');
const S = require(path.join(__dirname, '../shared/mm-dd-spawn.js'));
const Chunks = require(path.join(__dirname, '../shared/mm-chunks.js'));
let passed = 0, failed = 0;
function check(name, cond, extra) { if (cond) passed++; else { failed++; console.log('FAIL: ' + name + (extra ? ' ' + extra : '')); } }

let near = true, bounds = true, seeds = new Set(), det = true, clear = true;
for (let seed = 1; seed <= 60; seed++) {
  const surf = (x, z) => Chunks.surfaceY(x, z, seed);
  const a = S.site(seed, surf), b = S.site(seed, surf);
  det = det && JSON.stringify(a) === JSON.stringify(b) && JSON.stringify(S.cells(a)) === JSON.stringify(S.cells(b));
  const d = Math.hypot(a.x - S.CENTRE, a.z - S.CENTRE);
  near = near && d >= 10 - 1e-9 && d <= 18 + 1e-9 && Math.hypot(a.spawn.x - a.x, a.spawn.z - a.z) <= 24;
  S.cells(a).forEach((c) => { if (c[0] < 0 || c[0] > 127 || c[2] < 0 || c[2] > 127 || c[1] < 0) bounds = false; });
  // spawn column itself is never carved
  if (S.cells(a).some((c) => c[0] === a.spawn.x && c[2] === a.spawn.z)) clear = false;
  seeds.add(a.x + ',' + a.z + ',' + a.dx + ',' + a.dz);
}
check('deterministic per seed (site and cells)', det);
check('mouth 10..18 from centre, spawn within 24 of the mouth', near);
check('carve stays inside the world', bounds);
check('spawn column is not carved', clear);
check('different seeds give varied mouths', seeds.size >= 20, String(seeds.size));
const st = S.site(1, () => 4), cells = S.cells(st);
check('ramp has air cells and dirt floor patches', cells.some((c) => c[3] === 0) && cells.some((c) => c[3] === 2));

console.log(failed ? failed + ' FAILED' : 'ALL PASSED (' + passed + ')');
process.exitCode = failed ? 1 : 0;
