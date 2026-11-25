// ID-36 (cycle 5 S) Trial of Six ramp: the pure layer builders in MMEndgame (spec: game/design/beta/cycle4-design.md, item 2).
// Fights 1-3 unchanged, fight 4 = A (lead shot), 5 = A + B (slow arm), 6 = A + B + C (edge sweep); the Trial bolt cap 40 -> 42 / 51 / 60
// (cycle 6 tuning against trial-bot-nexus.js: lead shot every 1.2 s aimed 0.5 s ahead, slow arm every 0.7 s at 95 px/s; numbers in beta/cycle6-systems.md);
// HP / damage ramps, the boss wind-up and every boss's own pattern untouched; every layer waits at least the 0.6 s wind-up.
// Run: node game/tests/cyc5-trial-layers.test.js
const { check, done } = require('./helpers');
const fs = require('fs');
const path = require('path');
const E = require('../shared/mm-endgame.js');
const L = E.LAYERS;

check('fights 1-3 add no layer', [1, 2, 3].every((s) => E.rushLayers(s).length === 0));
check('fight 4 = lead, 5 = lead + arm, 6 = lead + arm + sweep (cumulative)', E.rushLayers(4).join() === 'lead' && E.rushLayers(5).join() === 'lead,arm' && E.rushLayers(6).join() === 'lead,arm,sweep');
check('cap: 40 for fights 1-3 (unchanged), 42 at fight 4 (two lead shots alive), 51 at fight 5, 60 at fight 6 (51 + a 9-bolt sweep)', [1, 2, 3, 4, 5, 6].map((s) => E.rushCap(s)).join() === '40,40,40,42,51,60', [1, 2, 3, 4, 5, 6].map((s) => E.rushCap(s)).join());
check('cap extra = the sum of the active layers\' own budgets', [1, 2, 3, 4, 5, 6].every((s) => E.rushCapExtra(s) === E.rushLayers(s).reduce((n, id) => n + L[id].budget, 0)));
check('each layer budget covers its live bolts: arm 2 per 0.7 s x 2.4 s life (7 + 1 frame of slack) <= 9, lead 2 (life 1.45 s > its 1.2 s period: two alive), sweep 9 (one line alive: every 7 s)', L.arm.budget >= Math.ceil(L.arm.bolts / L.arm.every * L.arm.life) + 1 && L.lead.budget === Math.ceil(L.lead.life / L.lead.every) && L.lead.budget === 2 && L.sweep.budget === L.sweep.bolts);
check('hostile step input: no layers, base cap', E.rushLayers(null).length === 0 && E.rushLayers('x').length === 0 && E.rushLayers(-3).length === 0 && E.rushCap(NaN) === 40 && E.rushLayers(99).length === 3);
check('every layer waits at least the 0.6 s boss wind-up (none shortens it), the sweep is telegraphed 0.8 s', [L.lead, L.arm, L.sweep].every((x) => x.windup >= E.RUSH.windup) && L.sweep.warn === 0.8);
check('the ladder itself is unchanged by the ramp: HP / damage ramps and wind-up', JSON.stringify(E.RUSH.ramp) === JSON.stringify({ hp: [1.0, 1.0, 1.04, 1.04, 1.08, 1.1], dmg: [1.0, 1.0, 1.02, 1.04, 1.06, 1.08] }) && E.RUSH.windup === 0.6);
const lad = E.rushLadder(12345, 20);
check('ladder steps carry their layers and cap extra', lad.steps.map((s) => s.layers.join('+') + ':' + s.capExtra).join() === ':0,:0,:0,lead:2,lead+arm:11,lead+arm+sweep:20', lad.steps.map((s) => s.layers.join('+') + ':' + s.capExtra).join());

// A: lead shot aims at p + v * 0.5 (cycle 6: was 0.35)
const a0 = E.leadAim(0, 0, 100, 0, 0, 0), a1 = E.leadAim(0, 0, 100, 0, 0, 200);
check('lead shot: a still hero is aimed straight at, a moving one 0.5 s ahead (100, 100)', Math.abs(a0) < 1e-9 && Math.abs(a1 - Math.atan2(100, 100)) < 1e-9, [a0, a1].join());
check('lead shot: speed 0.9 x the 230 aimed bolt, every 1.2 s (cycle 6: was 1.6), one bolt per shot, at most 2 alive', L.lead.speed === 207 && L.lead.every === 1.2 && L.lead.ahead === 0.5 && L.lead.budget === 2);
check('lead shot: hostile input never NaN', Number.isFinite(E.leadAim(NaN, null, 'x', {}, Infinity, -Infinity)));

// B: slow arm turns 40 deg/s, two opposite arms
const b0 = E.armAngles(0), b1 = E.armAngles(1);
check('slow arm: two opposite arms, turning 40 degrees per second, 95 px/s (cycle 6: was 110), every 0.7 s (was 0.5)', Math.abs(b0[1] - b0[0] - Math.PI) < 1e-9 && Math.abs((b1[0] - b0[0]) * 180 / Math.PI - 40) < 1e-9 && L.arm.speed === 95 && L.arm.every === 0.7);

// C: edge sweep: 9 bolts, one 3-wide gap a hero fits through, spacing that blocks everywhere else, alternating sides and directions
const PR = 11 + 4; // RM_PLAYER.r + 4 = 15: the hit distance used by the arena for enemy bolts
const lines = [0, 1, 2, 3].map((k) => E.sweepLine(k, 500, 400));
check('sweep: 9 bolts per line, every 7 s, 140 px/s', lines.every((l) => l.pts.length === 9) && L.sweep.every === 7 && L.sweep.speed === 140);
check('sweep: the gap side alternates (slots 2-4, then 7-9)', lines[0].gapFrom === 2 && lines[1].gapFrom === 7 && lines[2].gapFrom === 2);
check('sweep: the direction turns a quarter each time (from the west, north, east, south)', lines.map((l) => Math.round(l.dir * 180 / Math.PI)).join() === '0,90,180,270');
check('sweep: neighbouring bolts are closer than two hit radii (no slip-through) and the gap leaves a corridor wider than the hero', L.sweep.spacing < 2 * PR && (L.sweep.gap + 1) * L.sweep.spacing - 2 * PR > 2 * 11);
check('sweep: the line spawns 300 px from the hero on the far side of its travel', Math.abs(lines[0].pts[0].x - 200) < 1e-6 && Math.abs(lines[1].pts[0].y - 100) < 1e-6);
const ph = E.sweepLine(0, 500, 400, 195);
check('sweep: a narrow view (phone, half width 195) spawns the line inside it (171 px), never under 140 px; no view = 300 px', Math.abs(ph.pts[0].x - (500 - 171)) < 1e-6 && E.sweepLine(0, 0, 0, 50).dist === 140 && E.sweepLine(0, 0, 0).dist === 300 && E.sweepLine(0, 0, 0, 1000).dist === 300);
check('sweep: hostile input gives a finite line', E.sweepLine('x', NaN, null).pts.every((q) => Number.isFinite(q.x) && Number.isFinite(q.y)));
check('outputs are frozen', Object.isFrozen(lines[0]) && Object.isFrozen(lines[0].pts) && Object.isFrozen(E.rushLayers(6)) && Object.isFrozen(L.sweep));
check('no Math.random in mm-endgame.js code (comments stripped)', !/Math\.random/.test(fs.readFileSync(path.join(__dirname, '../shared/mm-endgame.js'), 'utf8').replace(/\/\/.*$/gm, '')));
done();
