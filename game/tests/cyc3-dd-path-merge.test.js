// Node test (cycle 3, L review of the cycle 2 Deepdelve path replay): the stored path must be the path OF the deepest dive on that seed.
// finish() drops the old path when a new deepest dive has none (played with ?ghost=0, or under two samples), but save() merged with the
// record on disk and took "mine or the disk's": the old, shallower dive's path came straight back and the next dive drew a trail that
// stops above the depth ghost. Same for a stale tab holding only a shallower path. Also: equal depths, storage that throws, hostile disk.
// Run: node game/tests/cyc3-dd-path-merge.test.js
const R = require('../games/deepdelve/dd-run.js');
const KEY = R.KEY;
let n = 0, failed = 0;
function check(name, ok, extra) { n++; console.log((ok ? 'PASS ' : 'FAIL ') + name + (ok ? '' : ' :: ' + (extra || ''))); if (!ok) failed++; }
class Mem { constructor(o) { this.m = Object.assign({}, o); } getItem(k) { return k in this.m ? this.m[k] : null; } setItem(k, v) { this.m[k] = String(v); } }
const dive = (seed, depth, x, withPath) => { const r = R.start(0, 'plain', seed); R.depth(r, depth); if (withPath) { R.sample(r, x, 0, x, 0); R.sample(r, x, -depth, x, 1); } return r; };
// one whole dive the way deepdelve.js does it: re-read, finish, save
const play = (st, run) => { const rec = R.load(st); const sum = R.finish(rec, run, false); const ok = R.save(st, rec); return { rec, sum, ok }; };

{ // 1. a deeper dive WITHOUT a path replaces the old path with nothing
  const st = new Mem();
  play(st, dive(7, 10, 3, true));
  check('first dive (depth 10) stores its path', R.load(st).seedBest['7'] === 10 && R.load(st).seedPath['7'][1][1] === -10);
  const out = play(st, dive(7, 25, 9, false));
  const disk = R.load(st);
  check('a deeper dive (25) with no path: the best is 25 and the depth-10 path is gone from memory', out.rec.seedBest['7'] === 25 && !out.rec.seedPath['7']);
  check('...and from disk (it used to come back through the save merge)', disk.seedBest['7'] === 25 && !disk.seedPath['7'], JSON.stringify(disk.seedPath));
  play(st, dive(7, 30, 4, true));
  check('the next deeper dive with a path stores its own', R.load(st).seedPath['7'][1][1] === -30 && R.load(st).seedPath['7'][0][0] === 4);
}
{ // 2. stale tab: it holds a shallower best and its path; the disk holds a deeper dive with no path
  const st = new Mem();
  play(st, dive(7, 10, 3, true));
  const stale = R.load(st); // tab A's copy
  play(st, dive(7, 25, 9, false)); // tab B, deeper, no path
  R.save(st, stale); // tab A writes its old record
  const disk = R.load(st);
  check('stale tab write: best stays 25 and the shallower path does not come back', disk.seedBest['7'] === 25 && !disk.seedPath['7'], JSON.stringify(disk.seedPath));
}
{ // 3. the other way round: the disk holds the deeper dive with a path, the stale tab a shallower one without
  const st = new Mem();
  play(st, dive(7, 10, 3, false));
  const stale = R.load(st);
  play(st, dive(7, 25, 9, true));
  R.save(st, stale);
  const disk = R.load(st);
  check('stale tab write: the deeper tab\'s path survives', disk.seedBest['7'] === 25 && !!disk.seedPath['7'] && disk.seedPath['7'][0][0] === 9 && disk.seedPath['7'][1][1] === -25, JSON.stringify(disk.seedPath));
}
{ // 4. equal depths: either copy's path is that depth's path; mine first, the disk's when mine has none
  const st = new Mem();
  play(st, dive(7, 10, 3, true));
  const a = R.load(st); a.seedPath = {}; R.save(st, a);
  check('equal depth, mine has no path: the disk path is kept', R.load(st).seedPath['7'][0][0] === 3);
  const b = R.load(st); b.seedPath = { 7: [[8, 0, 8], [8, -10, 8]] }; R.save(st, b);
  check('equal depth, both have one: mine is written', R.load(st).seedPath['7'][0][0] === 8);
}
{ // 5. other seeds are untouched by one seed's merge; counters still only go up
  const st = new Mem();
  play(st, dive(7, 10, 3, true)); play(st, dive(8, 12, 5, true));
  const stale = R.load(st);
  play(st, dive(7, 25, 9, false));
  R.save(st, stale);
  const disk = R.load(st);
  check('two seeds: seed 8 keeps its path, seed 7 (deeper, no path) has none, runs = 3', disk.seedPath['8'][0][0] === 5 && !disk.seedPath['7'] && disk.runs === 3 && disk.best.depth === 25, JSON.stringify(disk));
}
{ // 6. storage that throws / hostile disk never throws and never invents a path
  const bad = { getItem() { throw new Error('blocked'); }, setItem() { throw new Error('blocked'); } };
  let threw = false, out = null; try { out = play(bad, dive(7, 10, 3, true)); } catch (e) { threw = true; }
  check('blocked storage: load, finish and save do not throw; save reports false; the dive still has its path in memory', !threw && out.ok === false && out.rec.seedPath['7'].length === 2 && !!out.sum && out.rec.runs === 1);
  const quota = new Mem(); quota.setItem = () => { throw new Error('quota'); };
  let t2 = false, o2 = null; try { o2 = play(quota, dive(7, 10, 3, true)); } catch (e) { t2 = true; }
  check('refused write: no throw, save false, nothing on disk', !t2 && o2.ok === false && quota.getItem(KEY) === null);
  const st = new Mem({ [KEY]: JSON.stringify({ v: 1, seedBest: { 7: 50 }, seedPath: { 7: 'x', 9: [[1, 1, 1], [2, 2, 2]] } }) });
  play(st, dive(7, 10, 3, true));
  const disk = R.load(st);
  check('hostile disk path + a shallower dive: best 50 kept, no path for it (the shallow dive\'s path is not passed off as the deepest)', disk.seedBest['7'] === 50 && !disk.seedPath['7'] && !disk.seedPath['9'], JSON.stringify(disk.seedPath));
  check('a junk string on disk is replaced by a clean record', (() => { const s = new Mem({ [KEY]: '{{{' }); const o = play(s, dive(7, 10, 3, true)); return o.ok && R.load(s).seedPath['7'].length === 2; })());
}
console.log(failed ? `\n${failed} of ${n} FAILED` : `\nALL PASSED (${n} checks)`);
process.exit(failed ? 1 : 0);
