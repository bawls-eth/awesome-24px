// Cycle 4 (L hot path): MMTownHeroes.frameName is called for every hero sprite on every Town frame (the animator). It concatenated
// 'walk' + '_' + dir + '_' + i each time: 1348 B per frame in the Town heap profile (about 20 hero sprites). Now the names come from
// a table filled on first use. Node only: same names as the old expression for every input, and no string per call.
const H = require('../shared/mm-town-heroes.js');
const { check, done } = require('./helpers');
const FPS = { idle: 6, walk: 10 }, FRAMES = { idle: 4, walk: 6 };
const A = H.ACTIONS || null;
const old = (dir, moving, tMs, phase) => { // cycle 3, word for word (ACTIONS read from the module when it exports them)
  const a = moving ? 'walk' : 'idle'; const spec = A ? A[a] : { fps: FPS[a], frames: FRAMES[a] };
  const d = ['down', 'up', 'right'].indexOf(dir) >= 0 ? dir : 'down';
  const t = Math.max(0, Number(tMs) || 0) + (Number(phase) || 0);
  return a + '_' + d + '_' + (Math.floor(t * spec.fps / 1000) % spec.frames);
};
let s = 99; const rnd = () => { s = (Math.imul(s, 1103515245) + 12345) >>> 0; return s / 4294967296; };
const dirs = ['down', 'up', 'right', 'left', '', undefined, null, 7];
let bad = 0, n = 0, first = '';
if (old('down', false, 0) !== 'idle_down_0' || old('right', true, 501) !== 'walk_right_5') bad = -1; // the oracle itself matches the pinned names (shared-mm-town-heroes)
for (let k = 0; k < 40000 && bad >= 0; k++) {
  const dir = dirs[Math.floor(rnd() * dirs.length)], moving = rnd() < 0.5, t = rnd() < 0.05 ? [NaN, -5, '120', null, 1e12][Math.floor(rnd() * 5)] : rnd() * 1e7, ph = rnd() < 0.1 ? undefined : Math.floor(rnd() * 1000);
  const a = H.frameName(dir, moving, t, ph), b = old(dir, moving, t, ph); n++;
  if (a !== b) { bad++; if (!first) first = JSON.stringify([dir, moving, t, ph, a, b]); }
}
check('frameName: same name as the cycle 3 expression for ' + n + ' random inputs (bad directions, bad times, missing phase)', bad === 0 && n === 40000, first || String(bad));
const names = new Set(); for (let t = 0; t < 5000; t += 7) ['down', 'up', 'right'].forEach((d) => { names.add(H.frameName(d, true, t, 0)); names.add(H.frameName(d, false, t, 0)); });
check('frameName: exactly 30 names exist (3 directions x (4 idle + 6 walk))', names.size === 30, String(names.size));
// no string per call: 300000 calls. The old concatenation made at least two short-lived strings a call (measured: several MB).
if (global.gc) global.gc();
let acc = 0; for (let i = 0; i < 20000; i++) acc += H.frameName('up', i % 2 === 0, i * 16, 3).length; // warm
const h0 = process.memoryUsage().heapUsed;
for (let i = 0; i < 300000; i++) acc += H.frameName(i % 3 === 0 ? 'up' : 'right', i % 2 === 0, i * 16, 3).length;
const grew = process.memoryUsage().heapUsed - h0;
check('frameName: 300000 calls allocate under 1 MB in all (' + grew + ' B)', acc > 0 && grew < 1e6, String(grew));
done();
