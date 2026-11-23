// Unit tests for shared/mm-input.js (no browser). Run: node game/tests/shared-mm-input.test.js
const I = require('../shared/mm-input.js');
let failed = 0;
function check(name, cond, extra = '') { console.log((cond ? 'PASS ' : 'FAIL ') + name + (cond ? '' : ' ' + extra)); if (!cond) failed++; }

// key -> action
check('WASD and arrows move', I.actionOf('w') === 'up' && I.actionOf('ArrowUp') === 'up' && I.actionOf('A') === 'left' && I.actionOf('arrowright') === 'right' && I.actionOf('s') === 'down');
check('Space and Enter are primary', I.actionOf(' ') === 'primary' && I.actionOf('Enter') === 'primary');
check('Shift and E are secondary', I.actionOf('Shift') === 'secondary' && I.actionOf('e') === 'secondary');
check('Esc and P are menu', I.actionOf('Escape') === 'menu' && I.actionOf('p') === 'menu');
check('R is restart', I.actionOf('r') === 'restart');
check('unmapped keys give null', I.actionOf('q') === null && I.actionOf('') === null && I.actionOf(undefined) === null);
check('event objects read key then code', I.actionOf({ key: 'Enter' }) === 'primary' && I.actionOf({ key: 'ц', code: 'KeyW' }) === 'up' && I.actionOf({ key: 'x', code: 'KeyX' }) === null);
check('keysFor lists every alias', ['enter', ' '].every((k) => I.keysFor('primary').includes(k)) && I.keysFor('menu').includes('escape'));
check('every mapped action is a known action', Object.values(I.KEYS).concat(Object.values(I.CODES)).every((a) => I.ACTIONS.includes(a)));
check('mapping is frozen (no rebinding)', Object.isFrozen(I.KEYS) && Object.isFrozen(I.CODES));
check('touch buttons are at least 56 px', I.TOUCH_MIN_PX >= 56);

// hint
const h = I.hint();
check('hint is one line naming every action', !/\n/.test(h) && /WASD/.test(h) && /Space/.test(h) && /Shift/.test(h) && /Esc/.test(h) && /R restart/.test(h), h);
const h2 = I.hint({ only: ['move', 'primary', 'menu'], names: { primary: 'fire' } });
check('hint honours only + names', h2 === 'WASD / arrows move · Space / Enter fire · Esc / P menu', h2);
check('touch hint names the stick and Menu', /stick/.test(I.hint({ touch: true })) && /Menu/.test(I.hint({ touch: true })));

// tracker
const t = I.create();
t.press('d'); t.press('s');
const mv = t.move();
check('diagonal move is normalised', Math.abs(Math.hypot(mv.x, mv.y) - 1) < 1e-9 && mv.x > 0 && mv.y > 0, JSON.stringify(mv));
t.press('arrowright'); t.release('d');
check('two keys for one action: release of one keeps it held', t.held('right'));
t.release('arrowright'); check('released after both up', !t.held('right'));
t.press('Enter');
check('pressed() is a one-shot edge', t.pressed('primary') === true && t.pressed('primary') === false && t.held('primary'));
t.press(' '); check('a second alias while held is no new edge', t.pressed('primary') === false);
t.clear(); check('clear drops everything', !t.held('primary') && !t.held('down') && t.move().x === 0 && t.move().y === 0);
check('press by action name works', t.press('menu') === 'menu' && t.held('menu'));

// pad
const btn = (on) => ({ pressed: !!on, value: on ? 1 : 0 });
const pad = (axes, on) => ({ axes, buttons: Array.from({ length: 17 }, (_, i) => btn(on.includes(i))) });
let p = I.readPad(pad([0.1, 0.1, 0, 0], [0]));
check('pad dead zone and A = primary', p.move.x === 0 && p.move.y === 0 && p.primary && !p.secondary);
p = I.readPad(pad([1, 0, 0, 0], [1, 9, 8]));
check('pad full stick, B secondary, Start menu, Back restart', Math.abs(p.move.x - 1) < 1e-9 && p.secondary && p.menu && p.restart);
p = I.readPad(pad([0, 0, 0, 0], [12, 14]));
check('d-pad moves', p.move.x < 0 && p.move.y < 0);
check('missing pad reads idle', (() => { const r = I.readPad(null); return !r.primary && r.move.x === 0; })());
const t2 = I.create();
const r = t2.read(pad([0, 1, 0, 0], [2]));
check('read() merges pad into the keyboard state', r.move.y > 0.99 && r.secondary && !r.primary);

// attach (fake target)
const L = {}; const target = { addEventListener: (n, f) => { L[n] = f; }, removeEventListener: (n) => { delete L[n]; } };
const seen = []; const at = I.attach(target, (a) => seen.push(a));
L.keydown({ key: 'Enter', target: {} }); L.keydown({ key: 'Enter', repeat: true, target: {} }); L.keydown({ key: 'p', target: { tagName: 'INPUT' } }); L.keydown({ key: 'q', target: {} });
check('attach fires once per press, ignores typing and unmapped keys', JSON.stringify(seen) === '["primary"]', JSON.stringify(seen));
L.keyup({ key: 'Enter' }); check('attach keyup releases', !at.held('primary'));
at.detach(); check('detach removes listeners', !L.keydown && !L.keyup);

console.log(failed ? `${failed} FAILED` : 'ALL PASSED');
process.exitCode = failed ? 1 : 0;
