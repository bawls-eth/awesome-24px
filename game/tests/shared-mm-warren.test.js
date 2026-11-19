// Unit tests for shared/mm-warren.js (no browser). Run: node game/tests/shared-mm-warren.test.js
const MMWarren = require('../shared/mm-warren.js');
let failed = 0;
function check(name, cond, extra = '') { console.log((cond ? 'PASS ' : 'FAIL ') + name + (cond ? '' : ' ' + extra)); if (!cond) failed++; }
const done = () => { console.log(failed ? `${failed} FAILED` : 'ALL PASSED'); process.exitCode = failed ? 1 : 0; };

function dists(d, skip) {
  const dist = {}; d.rooms.forEach((r) => { dist[r.id] = -1; });
  const start = d.rooms.find((r) => r.type === 'start'); dist[start.id] = 0;
  const q = [start.id];
  for (let h = 0; h < q.length; h++) {
    const u = q[h];
    d.doors.forEach((dr) => {
      if (skip(dr)) return;
      const v = dr.a === u ? dr.b : dr.b === u ? dr.a : -1;
      if (v >= 0 && dist[v] < 0) { dist[v] = dist[u] + 1; q.push(v); }
    });
  }
  return dist;
}
const noSecret = (d) => (dr) => dr.cracked || dr.a === d.secretRoomId || dr.b === d.secretRoomId;

const a = MMWarren.generate('alpha'), a2 = MMWarren.generate('alpha'), b = MMWarren.generate('beta');
check('same seed gives byte-identical JSON', JSON.stringify(a) === JSON.stringify(a2));
check('different seeds differ', JSON.stringify(a) !== JSON.stringify(b));
check('numeric seed works and validates', MMWarren.validate(MMWarren.generate(42)).length === 0);

let badValidate = 0, badCount = 0, badBoss = 0, badKey = 0, badSecret = 0, badReach = 0, badNeigh = 0;
const distinct = new Set();
const t0 = Date.now();
const ds = [];
for (let s = 0; s < 1000; s++) ds.push(MMWarren.generate('seed' + s));
const ms = Date.now() - t0;
ds.forEach((d) => {
  if (MMWarren.validate(d).length) badValidate++;
  if (d.rooms.length < 7 || d.rooms.length > 9) badCount++;
  const main = dists(d, noSecret(d));
  const boss = d.rooms.find((r) => r.id === d.bossRoomId);
  const max = Math.max(...d.rooms.filter((r) => r.id !== d.secretRoomId).map((r) => main[r.id]));
  if (main[boss.id] !== max) badBoss++;
  const free = dists(d, (dr) => dr.locked || noSecret(d)(dr));
  if (free[d.keyRoomId] < 0) badKey++;
  if (d.rooms.filter((r) => r.type === 'secret').length > 1) badSecret++;
  if (Object.values(dists(d, () => false)).some((x) => x < 0)) badReach++;
  const sec = d.rooms.find((r) => r.id === d.secretRoomId);
  if (sec && sec.doors.length < 3) badNeigh++;
  distinct.add(JSON.stringify(d));
});
check('1000 seeds all pass validate()', badValidate === 0, 'bad=' + badValidate);
check('1000 seeds generate in under 2 s total', ms < 2000, ms + 'ms');
check('room count always 7-9', badCount === 0, 'bad=' + badCount);
check('boss is always the farthest room', badBoss === 0, 'bad=' + badBoss);
check('key reachable without the locked door', badKey === 0, 'bad=' + badKey);
check('at most one secret room', badSecret === 0, 'bad=' + badSecret);
check('every room reachable from start', badReach === 0, 'bad=' + badReach);
check('secret room has 3+ neighbours', badNeigh === 0, 'bad=' + badNeigh);
check('seeds give varied dungeons', distinct.size > 900, 'distinct=' + distinct.size);
check('exactly one locked door, on the treasure room', ds.every((d) => d.doors.filter((x) => x.locked).length === 1 && d.rooms.find((r) => r.type === 'treasure').locked));

const broken = JSON.parse(JSON.stringify(a)); broken.rooms.splice(0, 3);
check('validate flags a broken dungeon', MMWarren.validate(broken).length > 0);
const wrongBoss = JSON.parse(JSON.stringify(a)); wrongBoss.bossRoomId = wrongBoss.rooms.find((r) => r.type === 'start').id;
check('validate flags a wrong boss id', MMWarren.validate(wrongBoss).length > 0);
console.log('1000 seeds in ' + ms + 'ms');
done();
