// Node test for MMDDWyrm. Run: node game/tests/shared-mm-dd-wyrm.test.js
const path = require('path');
const fs = require('fs');
const W = require(path.join(__dirname, '../shared/mm-dd-wyrm.js'));
const Chunks = require(path.join(__dirname, '../shared/mm-chunks.js'));
let passed = 0, failed = 0;
function check(name, cond, extra) { if (cond) passed++; else { failed++; console.log('FAIL: ' + name + (extra ? ' ' + extra : '')); } }

const surf = (x, z) => 4;
const s5 = W.spawnSite(5, surf), s5b = W.spawnSite(5, surf);
check('spawn site is deterministic per seed and differs between seeds', JSON.stringify(s5) === JSON.stringify(s5b) && JSON.stringify(s5) !== JSON.stringify(W.spawnSite(6, surf)));
let ok = true, far = true, spread = new Set();
for (let seed = 0; seed < 200; seed++) {
  const st = W.spawnSite(seed, (x, z) => Chunks.surfaceY(x, z, seed));
  spread.add(st.wx + ',' + st.wz);
  if (st.wy - st.surface < W.MIN_DEPTH || st.wy + st.ry >= Chunks.WORLD.cy * 16 - 2 || st.wx - st.rx < 1 || st.wx + st.rx > 126 || st.wz - st.rx < 1 || st.wz + st.rx > 126) ok = false;
  if (Math.hypot(st.wx - 64, st.wz - 64) < 20) far = false;
}
check('cavern is at least 40 blocks below the surface, inside the world, above bedrock (200 seeds)', ok);
check('cavern stays away from the spawn column and varies across seeds', far && spread.size > 100);

const cells = W.arenaCells(s5);
check('arena is a hollow ellipsoid around the site centre', cells.length > 800 && cells.length < 2000 && cells.some((c) => c[0] === s5.wx && c[1] === s5.wy && c[2] === s5.wz) && cells.every((c) => Math.abs(c[1] - s5.wy) <= s5.ry));
check('phases follow HP thirds', W.phaseOf(30, 30) === 1 && W.phaseOf(21, 30) === 1 && W.phaseOf(20, 30) === 2 && W.phaseOf(11, 30) === 2 && W.phaseOf(10, 30) === 3 && W.phaseOf(1, 30) === 3);

// attack timer: phase 1 goes circle -> telegraph -> lunge -> recover -> circle, never burrows
function run(phase, seconds) {
  let st = W.newAttack(); const seq = [];
  for (let t = 0; t < seconds; t += 0.05) { const r = W.attackStep(st, 0.05, phase); st = r.st; r.events.forEach((e) => seq.push(e)); }
  return seq;
}
const p1 = run(1, 12), p2 = run(2, 12), p3 = run(3, 12);
check('phase 1 cycle is telegraph, lunge, recover, circle and never burrows', p1.slice(0, 4).join() === 'telegraph,lunge,recover,circle' && !p1.includes('burrow'), p1.join());
check('phase 2 burrows before every telegraph', p2.slice(0, 5).join() === 'burrow,telegraph,lunge,recover,circle' && p2.indexOf('burrow') < p2.indexOf('telegraph'), p2.join());
check('phase 3 chains two telegraphed lunges, every lunge preceded by a telegraph', p3.slice(0, 5).join() === 'burrow,telegraph,lunge,telegraph,lunge' && p3.every((e, i) => e !== 'lunge' || p3[i - 1] === 'telegraph'), p3.join());
const before = { s: 'circle', t: 0, n: 0 }, copy = JSON.stringify(before);
W.attackStep(before, 99, 1);
check('attackStep is pure and survives a huge dt without looping forever', JSON.stringify(before) === copy && W.attackStep(before, 99, 3).events.length <= 8);
check('later phases are faster (shorter cycle)', W.T.circle[2] < W.T.circle[0] && W.T.telegraph[2] < W.T.telegraph[0] && W.T.recover[2] < W.T.recover[0]);

const segs = Array.from({ length: W.SEGMENTS }, () => ({ x: 0, y: 0, z: 0 }));
segs[0].x = 10; W.followChain(segs);
check('segments trail the head at a fixed spacing', segs.every((s, i) => i === 0 || Math.abs(Math.hypot(s.x - segs[i - 1].x, s.y - segs[i - 1].y, s.z - segs[i - 1].z) - W.SPACING) < 1e-9));
const cl = W.clampToArena(s5, s5.c.x + 50, s5.c.y + 50, s5.c.z - 50);
check('clampToArena pulls points back inside the cavern', W.inArena(s5, cl.x, cl.y, cl.z));
check('wake needs depth, nearness and a living wyrm; freeze beyond 60 blocks', W.shouldWake(10, 40, false) && !W.shouldWake(10, 5, false) && !W.shouldWake(40, 40, false) && !W.shouldWake(10, 40, true) && W.shouldFreeze(61) && !W.shouldFreeze(50));
check('damage by pick tier and knockback reuse the mob rules', W.meleeDamage(0) === 1 && W.meleeDamage(3) === 3 && W.knockback(3, 4, 5).vx > 0 && W.contactDamage('lunge') === 2 && W.contactDamage('circle') === 1);
check('dust ring covers the target and not distant cells', W.inRing(0, 0, 0, 1, 0, 1) && !W.inRing(0, 0, 0, 5, 0, 0) && !W.inRing(0, 0, 0, 0, 5, 0));
check('no Math.random anywhere in the module', !/Math\.random/.test(fs.readFileSync(path.join(__dirname, '../shared/mm-dd-wyrm.js'), 'utf8')));
console.log(passed + ' passed, ' + failed + ' failed');
process.exit(failed ? 1 : 0);
