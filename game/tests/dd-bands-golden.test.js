// Golden guard for the Deepdelve depth bands (NEXT-SLICES-3 MG2). Run: node game/tests/dd-bands-golden.test.js
// tests/fixtures/dd-bands-golden.json was captured from the UNMODIFIED generator, before the crystal grotto band was added:
//   base:  FNV hash of every chunk of MMChunks.generate (full depth) per seed: the base generator never changes.
//   above: FNV hash of world rows y 0..24 (everything above the grotto band) per seed and chunk column, read through the
//          world the game actually builds (createWorld + the grotto options when shared/mm-dd-grotto.js exists).
// Any change to terrain above the band fails this test. `--write` exists only to record the fixture on an untouched generator.
const fs = require('fs');
const path = require('path');
const C = require('../shared/mm-chunks.js');
let G = null;
try { G = require('../shared/mm-dd-grotto.js'); } catch (e) { G = null; }
let failed = 0;
function check(name, cond, extra = '') { console.log((cond ? 'PASS ' : 'FAIL ') + name + (cond ? '' : ' ' + extra)); if (!cond) failed++; }

const FIXTURE = path.join(__dirname, 'fixtures', 'dd-bands-golden.json');
const SEEDS = [0, 1, 5, 7, 42, 4242, 123456, 999999999];
const ABOVE = 25; // rows 0..24 sit above the grotto band (25..40)
const fnv = () => ({ h: 2166136261 >>> 0, mix(v) { this.h ^= v; this.h = Math.imul(this.h, 16777619) >>> 0; } });

function base(seed) {
  const f = fnv();
  for (let cy = 0; cy < C.WORLD.cy; cy++) for (let cz = 0; cz < C.WORLD.cz; cz++) for (let cx = 0; cx < C.WORLD.cx; cx++) {
    const d = C.generate(seed, cx, cy, cz).data;
    for (let i = 0; i < d.length; i++) f.mix(d[i]);
  }
  return f.h >>> 0;
}
function above(seed) {
  const w = G ? C.createWorld(seed, undefined, G.worldOpts(seed)) : C.createWorld(seed);
  const out = [];
  for (let cz = 0; cz < C.WORLD.cz; cz++) for (let cx = 0; cx < C.WORLD.cx; cx++) {
    const f = fnv();
    for (let wy = 0; wy < ABOVE; wy++) for (let z = 0; z < C.SIZE; z++) for (let x = 0; x < C.SIZE; x++) f.mix(w.getBlock(cx * C.SIZE + x, wy, cz * C.SIZE + z));
    out.push(f.h >>> 0);
  }
  return out;
}
const now = {};
SEEDS.forEach((s) => { now[s] = { base: base(s), above: above(s) }; });

if (process.argv.includes('--write')) {
  fs.mkdirSync(path.dirname(FIXTURE), { recursive: true });
  fs.writeFileSync(FIXTURE, JSON.stringify({ v: 1, above: ABOVE, seeds: now }, null, 1) + '\n');
  console.log('wrote ' + FIXTURE);
  process.exit(0);
}
const gold = JSON.parse(fs.readFileSync(FIXTURE, 'utf8'));
check('fixture covers every seed and the same band edge', gold.above === ABOVE && SEEDS.every((s) => gold.seeds[s]), JSON.stringify(Object.keys(gold.seeds)));
const baseBad = SEEDS.filter((s) => gold.seeds[s].base !== now[s].base);
check('the base generator (MMChunks.generate, full depth) is byte-identical for ' + SEEDS.length + ' seeds', baseBad.length === 0, baseBad.join(','));
const aboveBad = SEEDS.filter((s) => JSON.stringify(gold.seeds[s].above) !== JSON.stringify(now[s].above));
check('terrain above the grotto band (rows 0..24, all 64 columns) is byte-identical for ' + SEEDS.length + ' seeds', aboveBad.length === 0, aboveBad.join(','));
check('the hashes differ between seeds (the fixture is not trivial)', new Set(SEEDS.map((s) => now[s].base)).size === SEEDS.length);
if (failed) { console.log(failed + ' FAILED'); process.exit(1); }
console.log('ALL PASS');
