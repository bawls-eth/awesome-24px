// Cycle 4 (L hot path): MMTames.perks is asked three times per companion per frame by the Isles draw (idle sway, glow, ribbon).
// It built a new { sway, ribbon, glow } object on every call. Now there is one frozen object per bond level, built once.
// Node only. Same answers as the cycle 3 rule (sway from 4, ribbon from 6, glow at 10) for every bond and for hostile input.
const T = require('../shared/mm-tames.js');
const { check, done } = require('./helpers');
const old = (bond) => { let v = typeof bond === 'number' ? bond : Number(bond); v = Number.isFinite(v) ? v : 1; const b = Math.max(1, Math.min(10, Math.floor(v))); return { sway: b >= 4, ribbon: b >= 6, glow: b >= 10 }; }; // cycle 3, word for word
const inputs = []; for (let b = -3; b <= 14; b++) inputs.push(b); inputs.push(NaN, null, undefined, '7', '7x', 3.9, 9.99, Infinity, -Infinity, {}, [], true);
const same = inputs.every((v) => { const a = T.perks(v), o = old(v); return a.sway === o.sway && a.ribbon === o.ribbon && a.glow === o.glow && Object.keys(a).sort().join() === 'glow,ribbon,sway'; });
check('perks: same flags as the cycle 3 rule for bond -3..14 and hostile input (' + inputs.length + ' inputs)', same);
check('perks: the same object comes back for the same bond (no object per call)', [1, 4, 6, 10].every((b) => T.perks(b) === T.perks(b)) && T.perks(99) === T.perks(10) && T.perks(NaN) === T.perks(1));
check('perks: the shared objects are frozen (a caller cannot change what the next caller reads)', [1, 2, 3, 4, 5, 6, 7, 8, 9, 10].every((b) => Object.isFrozen(T.perks(b))));
const before = JSON.stringify(T.perks(10)); try { T.perks(10).glow = false; T.perks(10).x = 1; } catch (e) { /* strict mode throws: fine */ }
check('perks: a write attempt changes nothing', JSON.stringify(T.perks(10)) === before && T.perks(10).glow === true);
// no allocation: 200000 calls must not grow the heap by an object each (a fresh 3-field object is at least 24 bytes: 4.8 MB)
if (global.gc) global.gc();
const h0 = process.memoryUsage().heapUsed; let acc = 0;
for (let i = 0; i < 200000; i++) acc += T.perks(i % 12).sway ? 1 : 0;
const grew = process.memoryUsage().heapUsed - h0;
check('perks: 200000 calls allocate under 1 MB in all (' + grew + ' B; a fresh object per call is 4.8 MB or more)', acc > 0 && grew < 1e6, String(grew));
done();
