// Unit tests for shared/mm-hash.js (no browser). Run: node game/tests/shared-mm-hash.test.js
const MMHash = require('../shared/mm-hash.js');
let failed = 0;
function check(name, cond, extra = '') { console.log((cond ? 'PASS ' : 'FAIL ') + name + (cond ? '' : ' ' + extra)); if (!cond) failed++; }
const done = () => { console.log(failed ? `${failed} FAILED` : 'ALL PASSED'); process.exitCode = failed ? 1 : 0; };
const rng = (seed) => () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
const hit = (a, b) => { const dx = a.x - b.x, dy = a.y - b.y, rr = a.r + b.r; return dx * dx + dy * dy <= rr * rr; };

{ // finds an enemy in the 3x3 neighbouring cells
  const g = MMHash.create(64); g.clear();
  g.insert('e1', 100, 100, 10);
  const found = []; g.query(70, 70, 5, (id) => found.push(id));
  const near = []; g.query(60, 60, 8, (id) => near.push(id));
  check('finds an enemy in the neighbouring cells', found.includes('e1') && near.includes('e1'), JSON.stringify([found, near]));
}
{ // misses one far away
  const g = MMHash.create(64); g.clear();
  g.insert('far', 1000, 1000, 10);
  const found = []; g.query(0, 0, 20, (id) => found.push(id));
  check('misses an enemy far away', found.length === 0, JSON.stringify(found));
}
{ // identical to brute force
  const rnd = rng(42); let bad = 0, hits = 0;
  const g = MMHash.create(48);
  for (let t = 0; t < 2000; t++) {
    g.clear();
    const es = []; for (let i = 0; i < 12; i++) es.push({ id: i, x: rnd() * 600, y: rnd() * 600, r: 6 + rnd() * 20 });
    es.forEach((e) => g.insert(e.id, e.x, e.y, e.r));
    const b = { x: rnd() * 600, y: rnd() * 600, r: 2 + rnd() * 6 };
    const fast = []; g.query(b.x, b.y, b.r, (id, x, y, r) => { if (hit(b, { x, y, r })) fast.push(id); });
    const brute = es.filter((e) => hit(b, e)).map((e) => e.id);
    fast.sort((p, q) => p - q);
    hits += brute.length;
    if (fast.join() !== brute.join()) bad++;
  }
  check('2000 seeded circle pairs match brute force (' + hits + ' hits)', bad === 0 && hits > 50, 'mismatches=' + bad);
}
{ // timing: 400 bullets x 24 enemies, 60 frames
  const rnd = rng(7); const g = MMHash.create(64);
  const bx = [], by = [], ex = [], ey = [];
  for (let i = 0; i < 400; i++) { bx.push(rnd() * 1200); by.push(rnd() * 800); }
  for (let i = 0; i < 24; i++) { ex.push(rnd() * 1200); ey.push(rnd() * 800); }
  let sink = 0; const cb = () => { sink++; };
  for (let w = 0; w < 5; w++) { g.clear(); for (let i = 0; i < 24; i++) g.insert(i, ex[i], ey[i], 20); for (let i = 0; i < 400; i++) g.query(bx[i], by[i], 4, cb); }
  const t0 = process.hrtime.bigint();
  for (let f = 0; f < 60; f++) {
    g.clear(); for (let i = 0; i < 24; i++) g.insert(i, ex[i] + f, ey[i], 20);
    for (let i = 0; i < 400; i++) g.query(bx[i] + f * 0.5, by[i], 4, cb);
  }
  const perFrame = Number(process.hrtime.bigint() - t0) / 1e6 / 60;
  console.log('avg ms/frame: ' + perFrame.toFixed(4) + ' (sink ' + sink + ')');
  check('400 bullets x 24 enemies averages well under 50 ms/frame', perFrame < 5, perFrame + ' ms');
}
done();
