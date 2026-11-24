// Node test (cycle 2, L hot path): MMChunks keeps the last chunk it was asked for, so a ray or the walk physics does not build a
// 'cx,cy,cz' string for every block it looks at. The kept chunk must never be stale: it is forgotten on unloadChunk and on load().
// Run: node game/tests/shared-mm-chunks-last-chunk.test.js
const path = require('path');
const C = require(path.join(__dirname, '../shared/mm-chunks.js'));
let n = 0, failed = 0;
function check(name, ok, extra) { n++; console.log((ok ? 'PASS ' : 'FAIL ') + name + (ok ? '' : ' :: ' + (extra || ''))); if (!ok) failed++; }
const B = C.B, S = C.SIZE;

// 1. no key string is built while the same chunk is read again and again (counted by wrapping Map.prototype.get: the key is only
//    built for the lookup, so lookups = keys)
{
  const w = C.createWorld(42);
  w.getBlock(40, 20, 20); w.getBlock(20, 20, 20); // both chunks exist; the second is the kept one
  const get = Map.prototype.get; let gets = 0;
  Map.prototype.get = function () { gets++; return get.apply(this, arguments); };
  let sum = 0;
  for (let i = 0; i < 1000; i++) sum += w.getBlock(16 + (i % 16), 16 + ((i >> 4) % 16), 16 + ((i >> 8) % 16));
  const same = gets;
  for (let i = 0; i < 1000; i++) sum += w.getBlock(i % 2 ? 20 : 40, 20, 20); // two chunks in turn: one lookup each time, as before
  Map.prototype.get = get;
  check('1000 reads inside one chunk make 0 map lookups (was 1000, each with a new key string): ' + same, same === 0 && sum >= 0, String(same));
  check('reads that change chunk every time still look the chunk up (1000)', gets - same === 1000, String(gets - same));
}

// 2. same answers as a world that never repeats a chunk (the kept chunk is skipped by alternating with a far chunk)
{
  const a = C.createWorld(7), b = C.createWorld(7);
  let s = 99, bad = 0; const rnd = () => { s = (Math.imul(s, 1103515245) + 12345) >>> 0; return s / 4294967296; };
  for (let i = 0; i < 20000; i++) {
    const x = Math.floor(rnd() * 40) + 30, y = Math.floor(rnd() * 70) - 3, z = Math.floor(rnd() * 40) + 30;
    b.getBlock(0, 0, 0); // b always leaves the chunk in between
    if (a.getBlock(x, y, z) !== b.getBlock(x, y, z)) bad++;
    if (i % 50 === 0) { const id = i % 100 ? B.STONE : B.AIR; const ka = a.setBlock(x, Math.max(0, y), z, id).join(), kb = (b.getBlock(0, 0, 0), b.setBlock(x, Math.max(0, y), z, id).join()); if (ka !== kb) bad++; }
  }
  check('20000 mixed reads and 400 edits: same blocks and same dirty lists with and without repeats', bad === 0, String(bad));
  check('and the same saved diffs', a.serialise() === b.serialise() && a.diffCount() === b.diffCount() && a.diffCount() > 0);
}

// 3. load() forgets the kept chunk
{
  const w = C.createWorld(11);
  const x = 20, y = 30, z = 20, gen = w.getBlock(x, y, z), other = gen === B.STONE ? B.AIR : B.STONE;
  w.setBlock(x, y, z, other);
  const saved = w.serialise();
  w.setBlock(x, y, z, gen);
  check('edit undone before the load', w.getBlock(x, y, z) === gen);
  check('load() accepted', w.load(saved) === true);
  check('after load() the block is the saved one, not the kept chunk\'s', w.getBlock(x, y, z) === other, w.getBlock(x, y, z) + ' vs ' + other);
}

// 4. unloadChunk() forgets it too (a fresh chunk object with the diffs laid over it)
{
  const w = C.createWorld(11);
  const x = 20, y = 30, z = 20, gen = w.getBlock(x, y, z), other = gen === B.STONE ? B.AIR : B.STONE;
  w.setBlock(x, y, z, other);
  const cx = Math.floor(x / S), cy = Math.floor(y / S), cz = Math.floor(z / S), before = w.getChunk(cx, cy, cz);
  before.data[0] = 250; // a mark only the old object has
  check('unloadChunk reports the chunk as removed', w.unloadChunk(C.key(cx, cy, cz)) === true && w.loadedKeys().indexOf(C.key(cx, cy, cz)) < 0);
  const after = w.getChunk(cx, cy, cz);
  check('the next read builds the chunk again (not the old object)', after !== before && after.data[0] !== 250);
  check('with the edit still in it', w.getBlock(x, y, z) === other);
  check('out-of-world reads are still air', w.getBlock(-1, 0, 0) === B.AIR && w.getBlock(0, 999, 0) === B.AIR);
}
console.log(n + ' checks, ' + failed + ' failed');
process.exit(failed ? 1 : 0);
