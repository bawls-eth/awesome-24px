// Unit tests for shared/mm-pad.js + shared/mm-aim.js (Node only).
//   NODE_PATH=$(npm root -g) node game/tests/shared-mm-pad-aim.test.js
const { check, done } = require('./helpers');
const MMPad = require('../shared/mm-pad.js');
const MMAim = require('../shared/mm-aim.js');

const btns = (on = []) => Array.from({ length: 17 }, (_, i) => ({ pressed: on.includes(i), value: on.includes(i) ? 1 : 0 }));
const pad = (axes, on) => ({ axes, buttons: btns(on) });

let r = MMPad.read(pad([1, 0, 0, 0]));
check('full right moves x=1', Math.abs(r.move.x - 1) < 1e-9 && r.move.y === 0);
r = MMPad.read(pad([0, -1, 0, 0]));
check('full up moves y=-1', r.move.x === 0 && Math.abs(r.move.y + 1) < 1e-9);
r = MMPad.read(pad([0.15, 0.1, 0.1, -0.15]));
check('inside dead zone move is exactly 0', r.move.x === 0 && r.move.y === 0);
check('inside dead zone aim is off and 0', !r.aim.on && r.aim.x === 0 && r.aim.y === 0);
r = MMPad.read(pad([0.3, 0, 0, 0]));
check('just past dead zone ramps from 0', r.move.x > 0 && r.move.x < 0.15);
r = MMPad.read(pad([0, 0, 0.6, 0]));
check('right stick 0.6 fires and aims', r.fire && r.aim.on && r.aim.x > 0);
r = MMPad.read(pad([0, 0, 0.4, 0]));
check('right stick 0.4 aims but does not fire', !r.fire && r.aim.on);
check('no input: nothing fires', !MMPad.read(pad([0, 0, 0, 0])).fire);
r = MMPad.read(pad([0, 0, 0, 0], [0, 3, 9]));
check('A, Y and Start map', r.ability[0] && r.ability[3] && !r.ability[1] && !r.ability[2] && r.pause);
check('shoulders map to abilities', MMPad.read(pad([0, 0, 0, 0], [5])).ability[0] && MMPad.read(pad([0, 0, 0, 0], [4])).ability[1]);
check('null pad is safe', MMPad.read(null).move.x === 0);

const deg = (d) => (d * Math.PI) / 180;
const P = { x: 0, y: 0 };
const at = (angDeg, tiles) => ({ x: Math.cos(deg(angDeg)) * tiles * 40, y: Math.sin(deg(angDeg)) * tiles * 40 });
let a = MMAim.assist(deg(10), P, [at(0, 5)]);
check('snaps within 14 deg', Math.abs(a) < 1e-9);
a = MMAim.assist(deg(20), P, [at(0, 5)]);
check('no snap outside 14 deg', Math.abs(a - deg(20)) < 1e-12);
a = MMAim.assist(deg(5), P, [at(0, 9.5)]);
check('ignored beyond 9 tiles', Math.abs(a - deg(5)) < 1e-12);
a = MMAim.assist(deg(5), P, [at(0, 5)], { enabled: false });
check('disabled returns input', a === deg(5));
a = MMAim.assist(deg(5), P, [at(8, 7), at(-3, 3), at(2, 6)]);
check('picks nearest of several', Math.abs(a - deg(-3)) < 1e-9);
a = MMAim.assist(deg(5), P, []);
check('no targets returns input', a === deg(5));
a = MMAim.assist(deg(5), P, [at(0, 8)], { tile: 24 });
check('custom tile 24px: 320px target is beyond 9 tiles, ignored', a === deg(5));
a = MMAim.assist(deg(5), P, [at(0, 8)], { tile: 60 });
check('custom tile 60px: 320px target is in range, snaps', Math.abs(a) < 1e-9);
a = MMAim.assist(deg(179), P, [at(-178, 4)]);
check('wraps around +-180', Math.abs(a - deg(-178)) < 1e-9);
done();
