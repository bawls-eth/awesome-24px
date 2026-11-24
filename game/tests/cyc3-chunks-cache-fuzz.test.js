// Node fuzz (cycle 3, L review of the cycle 2 last-chunk cache in MMChunks.getChunk): every read of a cached world is compared against
// an INDEPENDENT model that has no chunks at all (MMChunks.blockAt for the seed, the same optional filter band, and a plain Map of
// edits). Random mixes of reads (same chunk, across chunk borders, outside the world), edits, chunk unloads, getChunk / neighbours
// reads, and serialise -> load into the same world and into a fresh one. The kept chunk must never serve a stale block.
// Run: node game/tests/cyc3-chunks-cache-fuzz.test.js
const path = require('path');
const C = require(path.join(__dirname, '../shared/mm-chunks.js'));
let n = 0, failed = 0;
function check(name, ok, extra) { n++; console.log((ok ? 'PASS ' : 'FAIL ') + name + (ok ? '' : ' :: ' + (extra || ''))); if (!ok) failed++; }
const S = C.SIZE, WX = C.WORLD.cx * S, WY = C.WORLD.cy * S, WZ = C.WORLD.cz * S;

function fuzz(seed, opts, ops) {
  let s = (seed * 2654435761) >>> 0; const rnd = () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; };
  const ri = (a, b) => a + Math.floor(rnd() * (b - a + 1));
  let w = C.createWorld(seed, null, opts);
  const edits = new Map(); // 'x,y,z' -> id   (the model)
  const gen = (x, y, z) => { const b = C.blockAt(x, y, z, seed); return opts && y >= opts.yMin && y <= opts.yMax ? opts.filter(x, y, z, b) : b; };
  const inW = (x, y, z) => x >= 0 && y >= 0 && z >= 0 && x < WX && y < WY && z < WZ;
  const model = (x, y, z) => { if (!inW(x, y, z)) return C.B.AIR; const k = x + ',' + y + ',' + z; return edits.has(k) ? edits.get(k) : gen(x, y, z); };
  const stat = { reads: 0, sets: 0, unloads: 0, loads: 0, chunkReads: 0, bad: 0, first: '' };
  const bad = (what) => { stat.bad++; if (!stat.first) stat.first = what; };
  let px = ri(0, WX - 1), py = ri(0, WY - 1), pz = ri(0, WZ - 1); // a walker: most reads stay near it, so the kept chunk is hit a lot
  const pick = () => {
    const r = rnd();
    if (r < 0.70) return [px + ri(-3, 3), py + ri(-3, 3), pz + ri(-3, 3)];           // near the walker (same chunk or the one next door)
    if (r < 0.85) return [ri(0, 7) * S + (rnd() < 0.5 ? 0 : S - 1) + ri(-1, 1), ri(0, 3) * S + (rnd() < 0.5 ? 0 : S - 1) + ri(-1, 1), ri(0, 7) * S + ri(-1, 16)]; // chunk borders
    if (r < 0.95) return [ri(0, WX - 1), ri(0, WY - 1), ri(0, WZ - 1)];              // anywhere
    return [ri(-20, WX + 20), ri(-20, WY + 20), ri(-20, WZ + 20)];                     // maybe outside the world
  };
  for (let i = 0; i < ops; i++) {
    if (i % 97 === 0) { px = ri(0, WX - 1); py = ri(0, WY - 1); pz = ri(0, WZ - 1); }
    const r = rnd(); const q = pick(); const x = q[0], y = q[1], z = q[2];
    if (r < 0.72) {
      stat.reads++; const got = w.getBlock(x, y, z), want = model(x, y, z);
      if (got !== want) bad('read ' + q + ' got ' + got + ' want ' + want + ' at op ' + i);
    } else if (r < 0.90) {
      const id = ri(0, 12), before = model(x, y, z), dirty = w.setBlock(x, y, z, id);
      stat.sets++;
      if (!inW(x, y, z)) { if (dirty.length) bad('edit outside the world was accepted ' + q); continue; }
      if (before === id) { if (dirty.length) bad('unchanged edit returned dirty chunks ' + q); continue; }
      if (!dirty.length) { bad('edit refused ' + q); continue; }
      if (dirty[0] !== C.key(Math.floor(x / S), Math.floor(y / S), Math.floor(z / S))) bad('dirty[0] is not the edited chunk ' + q);
      const k = x + ',' + y + ',' + z; if (id === gen(x, y, z)) edits.delete(k); else edits.set(k, id);
      if (w.getBlock(x, y, z) !== id) bad('read after edit ' + q);
    } else if (r < 0.94) {
      const keys = w.loadedKeys(); if (!keys.length) continue;
      // unload the chunk under the walker half the time (the kept one, most likely), any loaded chunk otherwise
      const k = rnd() < 0.5 ? C.key(Math.floor(px / S), Math.floor(py / S), Math.floor(pz / S)) : keys[ri(0, keys.length - 1)];
      w.unloadChunk(k); stat.unloads++;
    } else if (r < 0.996) {
      const cx = Math.floor(x / S), cy = Math.floor(y / S), cz = Math.floor(z / S); if (!C.inWorld(cx, cy, cz)) continue;
      stat.chunkReads++;
      const c = rnd() < 0.5 ? w.getChunk(cx, cy, cz) : w.neighbours(cx - 1, cy, cz).px;
      if (!c || c.cx !== cx || c.cy !== cy || c.cz !== cz) { bad('getChunk / neighbours gave another chunk for ' + [cx, cy, cz]); continue; }
      for (let j = 0; j < 24; j++) { const lx = ri(0, 15), ly = ri(0, 15), lz = ri(0, 15); if (c.data[lx + lz * S + ly * 256] !== model(cx * S + lx, cy * S + ly, cz * S + lz)) { bad('chunk data ' + [cx, cy, cz, lx, ly, lz]); break; } }
      if (w.getChunk(cx, cy, cz) !== c) bad('a second getChunk gave a different object while loaded ' + [cx, cy, cz]);
    } else {
      const str = w.serialise(); stat.loads++;
      if (rnd() < 0.5) { if (!w.load(str)) bad('load refused its own serialise'); } else w = C.createWorld(seed, str, opts);
      if (w.diffCount() !== edits.size) bad('diffCount ' + w.diffCount() + ' vs model ' + edits.size + ' after load');
    }
  }
  // the whole model once more at the end, edit by edit
  edits.forEach((id, k) => { const a = k.split(',').map(Number); if (w.getBlock(a[0], a[1], a[2]) !== id) bad('final edit ' + k); });
  return { stat, diffs: w.diffCount(), edits: edits.size };
}

let total = { reads: 0, sets: 0, unloads: 0, loads: 0, chunkReads: 0 };
[11, 4242, 987654].forEach((seed) => {
  const r = fuzz(seed, null, 12000);
  Object.keys(total).forEach((k) => { total[k] += r.stat[k]; });
  check('seed ' + seed + ': ' + r.stat.reads + ' reads, ' + r.stat.sets + ' edits, ' + r.stat.unloads + ' unloads, ' + r.stat.loads + ' save/loads, ' + r.stat.chunkReads + ' chunk reads: 0 differences from the chunk-free model', r.stat.bad === 0, r.stat.bad + ' bad; first: ' + r.stat.first);
  check('seed ' + seed + ': diff count equals the model (' + r.edits + ')', r.diffs === r.edits && r.edits > 100, r.diffs + ' vs ' + r.edits);
});
{ // with a filter band (Deepdelve's grotto option): the cache sits behind genChunk too
  const opts = { yMin: 20, yMax: 40, maxId: 20, filter: (x, y, z, b) => (b === C.B.STONE && ((x * 7 + y * 13 + z * 3) % 5 === 0) ? 13 : b) };
  const r = fuzz(555, opts, 12000);
  Object.keys(total).forEach((k) => { total[k] += r.stat[k]; });
  check('filter band world: ' + r.stat.reads + ' reads, ' + r.stat.sets + ' edits, ' + r.stat.unloads + ' unloads: 0 differences', r.stat.bad === 0, r.stat.bad + ' bad; first: ' + r.stat.first);
}
check('the fuzz did real work (reads > 30000, edits > 8000, unloads > 1500, save/loads > 100)', total.reads > 30000 && total.sets > 8000 && total.unloads > 1500 && total.loads > 100, JSON.stringify(total));
{ // two worlds side by side never share a kept chunk
  const a = C.createWorld(1), b = C.createWorld(2); let bad = 0;
  for (let i = 0; i < 4000; i++) { const x = 30 + (i % 9), y = 10 + (i % 23), z = 50 + (i % 7); if (a.getBlock(x, y, z) !== C.blockAt(x, y, z, 1) || b.getBlock(x, y, z) !== C.blockAt(x, y, z, 2)) bad++; }
  check('two worlds read in turn keep their own chunk (4000 reads each)', bad === 0, String(bad));
}
console.log(failed ? `\n${failed} of ${n} FAILED` : `\nALL PASSED (${n} checks)`);
process.exit(failed ? 1 : 0);
