// Pure Node test: node game/tests/shared-mm-patterns2.test.js
const { check, done } = require('./helpers.js');
const P = require('../shared/mm-patterns2.js');
function mulberry(a) { return () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const arena = { x: 0, y: 0, w: 720, h: 480 };
const O = { x: 100, y: 100 };

let minGap = Infinity, allInside = true;
for (let s = 1; s <= 100; s++) {
  for (const edge of ['top', 'left']) {
    const w = P.wallGap(arena, edge, mulberry(s));
    const key = edge === 'top' ? 'x' : 'y', len = edge === 'top' ? arena.w : arena.h;
    const ps = [0, ...w.map((b) => b[key]), len].sort((a, b) => a - b);
    let g = 0; for (let i = 1; i < ps.length; i++) g = Math.max(g, ps[i] - ps[i - 1]);
    minGap = Math.min(minGap, g);
    if (w.length < 10) allInside = false;
  }
}
check('wallGap gap >= 2.5 tiles over 100 seeds', minGap >= 2.5 * P.TILE, 'min ' + minGap);
check('wallGap still has a wall of bullets', allInside);

const s0 = P.sweep(O, 0, { call: 0 }), s1 = P.sweep(O, 0, { call: 1 });
const ang = (b) => Math.atan2(b.vy, b.vx);
check('sweep direction differs between calls', s0[0].dir === 1 && s1[0].dir === -1);
check('sweep reverses angular order', ang(s0[0]) < ang(s0[7]) && ang(s1[0]) > ang(s1[7]));
check('sweep call 2 matches call 0', P.sweep(O, 0, { call: 2 })[0].dir === 1);

const h = P.homing(O, { x: 300, y: 100 }, { count: 4, homeTime: 1.2 });
check('homing makes 4 bullets flagged homing', h.length === 4 && h.every((b) => b.homing));
check('homing active before homeTime', P.isHoming(h[0], 1.0));
check('homing stops at homeTime', !P.isHoming(h[0], 1.2) && !P.isHoming(h[0], 2));

const f = P.flower(O);
check('flower has 16 bullets', f.length === 16);
const angs = f.map(ang);
let even = true; for (let i = 1; i < 16; i++) { let d = angs[i] - angs[i - 1]; if (d < 0) d += 2 * Math.PI; if (Math.abs(d - Math.PI / 8) > 1e-9) even = false; }
check('flower evenly spaced', even);

const sg = P.shotgun(O, { x: 300, y: 100 }, mulberry(7));
check('shotgun has 5 shots', sg.length === 5);
check('shotgun within cone', sg.every((b) => Math.abs(ang(b)) <= (25 * Math.PI) / 180 + 1e-9));
check('shotgun speeds 6-8', sg.every((b) => { const v = Math.hypot(b.vx, b.vy); return v >= 6 - 1e-9 && v <= 8 + 1e-9; }));

const t = P.telegraph('sweep');
check('telegraph lasts 0.8 s', t.duration === 0.8 && t.life === 0.8);
check('telegraph is red and flagged', t.telegraph === true && /^#ff/i.test(t.color));

check('deterministic wallGap same seed', JSON.stringify(P.wallGap(arena, 'top', mulberry(42))) === JSON.stringify(P.wallGap(arena, 'top', mulberry(42))));
check('deterministic shotgun same seed', JSON.stringify(P.shotgun(O, { x: 5, y: 9 }, mulberry(3))) === JSON.stringify(P.shotgun(O, { x: 5, y: 9 }, mulberry(3))));
done();
