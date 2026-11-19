// Node-only test for shared/mm-rooms.js and shared/mm-enemies.js. Run: node game/tests/shared-mm-rooms-enemies.test.js
const MMRooms = require('../shared/mm-rooms.js');
const MMEnemies = require('../shared/mm-enemies.js');

// Same check()/done() style as helpers.js (not imported: helpers pulls in playwright).
let failed = 0;
function check(name, cond, extra = '') {
  console.log((cond ? 'PASS ' : 'FAIL ') + name + (cond ? '' : ' ' + extra));
  if (!cond) failed++;
}
const done = () => { console.log(failed ? `${failed} FAILED` : 'ALL PASSED'); process.exitCode = failed ? 1 : 0; };

// Rooms
check('at least 12 templates', MMRooms.TEMPLATES.length >= 12, String(MMRooms.TEMPLATES.length));
let parsed = [], parseErr = '';
try { parsed = MMRooms.TEMPLATES.map((t) => MMRooms.parse(t)); } catch (e) { parseErr = e.message; }
check('all templates parse', parsed.length === MMRooms.TEMPLATES.length, parseErr);
check('templates are 17x13', parsed.every((p) => p.w === 17 && p.h === 13 && p.rows.length === 13 && p.rows.every((r) => r.length === 17)));
check('doors at edge midpoints', parsed.every((p) => p.doors.N.x === 8 && p.doors.N.y === 0 && p.doors.S.x === 8 && p.doors.S.y === 12 &&
  p.doors.W.x === 0 && p.doors.W.y === 6 && p.doors.E.x === 16 && p.doors.E.y === 6));
check('every template has spawn points', parsed.every((p) => p.spawns.length >= 3));
check('unique template ids', new Set(MMRooms.TEMPLATES.map((t) => t.id)).size === MMRooms.TEMPLATES.length);
const bad = MMRooms.TEMPLATES[0].rows.slice(); bad[0] = '#D' + bad[0].slice(2);
let threw = false; try { MMRooms.parse(bad); } catch (e) { threw = true; }
check('parse rejects door off midpoint', threw);
threw = false; try { MMRooms.parse(MMRooms.TEMPLATES[0].rows.slice(1)); } catch (e) { threw = true; }
check('parse rejects wrong size', threw);

// Autotile: 16 blocks, each a centre wall whose N/E/S/W neighbours are walls per the mask bits.
const GW = 4 * 8 + 1, GH = 4 * 2 + 1;
const grid = []; for (let y = 0; y < 12; y++) grid.push(new Array(4 * 16 + 1).fill('.'));
const centres = [];
for (let m = 0; m < 16; m++) {
  const cx = 2 + 4 * m, cy = 5 + 0;
  grid[cy][cx] = '#';
  if (m & 1) grid[cy - 1][cx] = '#';
  if (m & 2) grid[cy][cx + 1] = '#';
  if (m & 4) grid[cy + 1][cx] = '#';
  if (m & 8) grid[cy][cx - 1] = '#';
  centres.push([cx, cy]);
}
const masks = MMRooms.autotile(grid.map((r) => r.join('')));
check('autotile yields 16 distinct variants', new Set(centres.map(([x, y]) => masks[y][x])).size === 16);
check('autotile masks match bits and floor is null', centres.every(([x, y], m) => masks[y][x] === m) && masks[0][0] === null);
check('autotile on real template: masks in 0..15', parsed.every((p) => MMRooms.autotile(p.rows).every((r) => r.every((v) => v === null || (v >= 0 && v <= 15)))));

// Enemies
check('5 Bramble enemies', MMEnemies.IDS.length === 5 && ['puffcap', 'beetle', 'archer', 'moth', 'sprout'].every((id) => MMEnemies.ENEMIES[id]));
check('enemy data has hp/speed/pattern/cost', MMEnemies.IDS.every((id) => { const e = MMEnemies.ENEMIES[id]; return e.hp > 0 && e.speed >= 0 && e.pattern && e.cost > 0; }));
check('budget(tier) = 4 + 2*tier', [1, 2, 3, 4, 5].every((t) => MMEnemies.budget(t) === 4 + 2 * t));

const spawns = MMRooms.parse(MMRooms.get('open')).spawns;
const start = { x: 8, y: 6 };
let over = 0, near = 0, elites = 0, empty = 0;
for (let seed = 0; seed < 200; seed++) {
  for (let tier = 1; tier <= 5; tier++) {
    const p = MMEnemies.plan('s' + seed, tier, spawns, start);
    if (p.spent > MMEnemies.budget(tier) || p.enemies.reduce((a, e) => a + e.cost, 0) > MMEnemies.budget(tier)) over++;
    if (p.enemies.some((e) => Math.hypot(e.x - start.x, e.y - start.y) < 6)) near++;
    if (p.enemies.some((e) => e.elite)) elites++;
    if (!p.enemies.length) empty++;
  }
}
check('plan never exceeds budget over 200 seeds x 5 tiers', over === 0, String(over));
check('no enemy within 6 tiles of start', near === 0, String(near));
check('some elites appear', elites > 0, String(elites));
check('plans are not empty', empty === 0, String(empty));

let eliteOk = true, crownOk = true, found = false;
for (let seed = 0; seed < 400 && !found; seed++) {
  const p = MMEnemies.plan('e' + seed, 5, spawns, start);
  p.enemies.filter((e) => e.elite).forEach((e) => {
    found = true;
    if (e.hp !== MMEnemies.ENEMIES[e.id].hp * 4) eliteOk = false;
    if (!e.crown) crownOk = false;
  });
}
check('elite hp is x4', found && eliteOk);
check('elite has crown flag', found && crownOk);
check('non-elite has no crown', MMEnemies.plan('n1', 1, spawns, start).enemies.every((e) => e.elite || (!e.crown && e.hp === MMEnemies.ENEMIES[e.id].hp)));

const kids = MMEnemies.onDeath({ id: 'sprout', x: 5, y: 5 });
check('Sprout splits into 2 minis (25 hp)', kids.length === 2 && kids.every((k) => k.hp === 25));
check('other enemies do not split', MMEnemies.onDeath({ id: 'beetle', x: 1, y: 1 }).length === 0);
check('plan deterministic per seed', JSON.stringify(MMEnemies.plan('same', 3, spawns, start)) === JSON.stringify(MMEnemies.plan('same', 3, spawns, start)));
check('plan differs across seeds', new Set(Array.from({ length: 30 }, (_, i) => JSON.stringify(MMEnemies.plan('d' + i, 3, spawns, start)))).size > 1);
done();
