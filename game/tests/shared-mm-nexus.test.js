// Run: node game/tests/shared-mm-nexus.test.js
const fs = require('fs'), path = require('path');
const N = require('../shared/mm-nexus.js');
let n = 0, bad = 0;
function check(name, ok) { n++; if (!ok) { bad++; console.log('FAIL ' + name); } }
const man = (b) => JSON.parse(fs.readFileSync(path.join(__dirname, '../assets/arcane', b, 'manifest.json'), 'utf8')).assets;
const ids = new Set([].concat(man('b13-overworld-props-structures'), man('b14-portals-and-world-objects')).map((a) => a.id));
const npcs = new Set(man('b21-npcs-and-vendors').map((a) => a.enemy));

const L = N.layout();
check('40x30 tiles', L.w === 40 && L.h === 30 && N.W === 40 && N.H === 30);
check('layout identical across calls', N.layout() === L && JSON.stringify(N.layout()) === JSON.stringify(L));
check('no enemies', L.noEnemies === true && L.enemies.length === 0);
check('frozen (cannot be mutated)', Object.isFrozen(L) && Object.isFrozen(L.portals[0]));
check('fountain present with 4 frames', L.fountain.frames.length === 4 && L.fountain.tx === 20 && L.fountain.ty === 15);
check('4 vendor slots', L.vendorSlots.length === 4);
check('portal ring has 6: realm, vault, 4 biomes', L.portals.length === 6 && ['realm', 'vault', 'warren', 'bramble', 'meadow', 'crypt'].every((id) => N.portalById(id)));
check('portal dests', N.portalById('vault').dest === 'vault' && N.portalById('crypt').dest === 'biome:crypt' && N.portalById('realm').dest === 'realm');
check('portals in bounds and distinct', new Set(L.portals.map((p) => p.tx + ',' + p.ty)).size === 6 && L.portals.every((p) => p.tx >= 2 && p.tx <= 37 && p.ty >= 2 && p.ty <= 27));
check('portals and npcs on walkable tiles', L.portals.every((p) => N.walkable(p.tx, p.ty)) && L.npcs.every((p) => N.walkable(p.tx, p.ty)));
check('spawn walkable', N.walkable(L.spawn.tx, L.spawn.ty));
check('7 NPCs, all in b21', L.npcs.length === 7 && L.npcs.every((x) => npcs.has(x.npc)));
check('quest giver and oracle(ghost guide) present', L.npcs.some((x) => x.npc === 'npc_quest_giver') && L.npcs.some((x) => x.role === 'oracle' && x.npc === 'npc_ghost_guide'));
check('every art id exists in b13/b14/b21', N.artIds().every((a) => ids.has(a) || npcs.has(a)));
check('fountain is solid', !N.walkable(20, 15));
check('walls and outside are not walkable', !N.walkable(0, 5) && !N.walkable(39, 5) && !N.walkable(5, 29) && !N.walkable(-3, 4) && !N.walkable(100, 100));
check('hostile walkable input false', !N.walkable(NaN, 3) && !N.walkable(undefined, null) && !N.walkable('a', {}) && !N.walkable(Infinity, 2));
const c = N.clampPoint(-500, 99999);
check('clampPoint bounds', c.x === 32 && c.y === 29 * 32);
const h = N.clampPoint(NaN, 'x');
check('clampPoint hostile -> spawn', h.x === L.spawn.x && h.y === L.spawn.y);
const p = N.portalById('vault');
check('portalAt finds portal', N.portalAt(p.x + 5, p.y - 5) === p && N.portalAt(0, 0) === null);
check('portalAt/npcAt hostile -> null', N.portalAt(NaN, 1) === null && N.npcAt(undefined, undefined) === null && N.portalById('__proto__') === null && N.portalById(5) === null);
check('npcAt finds vendor', N.npcAt(L.vendorSlots[0].x, L.vendorSlots[0].y).id === 'vendor');
check('portal ring clear of fountain', L.portals.every((q) => Math.hypot(q.tx - 20, q.ty - 15) > 5));
check('input never mutated by calls', (() => { const a = { x: 1, y: 2 }; const s = JSON.stringify(a); N.clampPoint(a.x, a.y); return JSON.stringify(a) === s; })());
console.log((bad ? 'FAILED ' + bad + ' of ' : 'ok ') + n + ' assertions'); process.exit(bad ? 1 : 0);
