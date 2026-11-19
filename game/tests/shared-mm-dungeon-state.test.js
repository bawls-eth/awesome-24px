// Unit tests for shared/mm-dungeon-state.js. Run: node game/tests/shared-mm-dungeon-state.test.js
const MMWarren = require('../shared/mm-warren.js');
const MMRng = require('../shared/rng.js');
const S = require('../shared/mm-dungeon-state.js');
let failed = 0;
function check(name, cond, extra = '') { console.log((cond ? 'PASS ' : 'FAIL ') + name + (cond ? '' : ' ' + extra)); if (!cond) failed++; }
const done = () => { console.log(failed ? `${failed} FAILED` : 'ALL PASSED'); process.exitCode = failed ? 1 : 0; };

function mk(seed, opts) {
  const d = MMWarren.generate(seed);
  if (opts && opts.enemies) d.rooms.forEach((r) => { opts.enemies[r.id] = 0; }); // empty dungeon
  return { d, s: S.create(d, MMRng.create('st:' + seed), opts) };
}
const nbrs = (d, id) => d.doors.filter((x) => !x.cracked && (x.a === id || x.b === id)).map((x) => (x.a === id ? x.b : x.a));

let combatSeen = 0;
for (const seed of ['alpha', 'beta', 'gamma', 'delta', 'eps', 'zeta']) {
  const { d, s } = mk(seed);
  const start = d.rooms.find((r) => r.type === 'start').id;
  s.enter(start);
  const combat = nbrs(d, start).map((i) => d.rooms[i]).find((r) => r.type === 'combat');
  if (!combat) continue;
  combatSeen++;
  const a = s.enter(combat.id);
  check(seed + ' entering occupied room closes doors', a.ok && s.doorsClosed() && s.room(combat.id).enemiesAlive > 0);
  check(seed + ' cannot leave while enemies live', s.enter(start).reason === 'sealed');
  while (s.room(combat.id).enemiesAlive > 0) s.killEnemy();
  check(seed + ' clearing opens doors', !s.doorsClosed());
  s.enter(start); s.enter(combat.id);
  check(seed + ' doors stay open after leaving and re-entering', !s.doorsClosed() && s.room(combat.id).cleared);
}
check('at least one combat room tested', combatSeen > 0);

{ // locked door + keys
  const { d, s } = mk('locks', { enemies: {} });
  const t = d.rooms.find((r) => r.type === 'treasure');
  const ld = d.doors.find((x) => x.locked);
  const other = ld.a === t.id ? ld.b : ld.a;
  s.enter(other);
  check('locked door refuses without key', s.enter(t.id).reason === 'locked' && s.current === other);
  s.pickKey(); s.pickKey();
  check('key count increments', s.keys === 2);
  const r = s.enter(t.id);
  check('locked door opens with a key', r.ok && s.current === t.id);
  check('opening consumes exactly one key', s.keys === 1);
  s.enter(other); s.enter(t.id);
  check('unlocked door does not consume again', s.keys === 1);
  const l1 = s.openChest(), l2 = s.openChest();
  check('chest pays a loot descriptor once', l1 && l1.kind && l2 === null);
}

{ // secret room
  const { d, s } = mk('secret', { enemies: {} });
  check('at most one secret room', d.rooms.filter((r) => r.type === 'secret').length <= 1);
  const sid = d.secretRoomId;
  const nb = d.doors.find((x) => x.cracked && (x.a === sid || x.b === sid));
  s.enter(nb.a === sid ? nb.b : nb.a);
  check('secret room refuses while cracked', s.enter(sid).reason === 'cracked');
  s.hitCrackedWall(); const h2 = s.hitCrackedWall();
  check('secret stays closed after 2 hits', !h2.open && !s.secretOpen);
  const h3 = s.hitCrackedWall();
  check('secret room opens after exactly 3 hits', h3.open && s.secretOpen);
  check('can enter opened secret room', s.enter(sid).ok);
}

{ // minimap
  const { d, s } = mk('map', { enemies: {} });
  const start = d.rooms.find((r) => r.type === 'start').id;
  check('nothing visible before entering', s.visibleRooms().length === 0);
  s.enter(start);
  const vis = s.visibleRooms();
  const expect = [start].concat(nbrs(d, start)).sort((a, b) => a - b);
  check('visited plus direct neighbours visible', JSON.stringify(vis) === JSON.stringify(expect), JSON.stringify(vis));
  check('unvisited non-neighbours and secret hidden', vis.length < d.rooms.length && !vis.includes(d.secretRoomId));
}

{ // boss
  const b = S.boss.create(1000);
  check('boss starts in phase 1', b.phase === 1);
  const r = b.hit(350, 0);
  check('boss enters phase 2 at 66% HP', r.accepted && b.phase === 2 && r.phaseChanged);
  check('boss rejects damage while invulnerable', !b.hit(100, 1.0).accepted && b.hp === 650);
  check('boss vulnerable after 1.5 s', b.hit(10, 1.5).accepted);
  b.hit(320, 2);
  check('boss enters phase 3 at 33% HP', b.phase === 3);
  check('phase 3 invulnerable window rejects then ends', !b.hit(50, 3.4).accepted && b.hit(50, 3.5).accepted);
}

{ // exit summary
  const { d, s } = mk('exit', { enemies: {} });
  const t = d.rooms.find((r) => r.type === 'treasure');
  const ld = d.doors.find((x) => x.locked);
  s.enter(ld.a === t.id ? ld.b : ld.a); s.pickKey(); s.enter(t.id);
  const l = s.openChest();
  const sum = s.exit();
  check('exit summary lists collected loot', sum.loot.length === 1 && sum.loot[0] === l && sum.chestsOpened === 1);
  check('exit summary counts keys and rooms', sum.keysFound === 1 && sum.keysUnused === 0 && sum.roomsVisited === 2);
  check('exit summary totals gold or items', l.kind === 'gold' ? sum.gold === l.amount : sum.items[0] === l);
}
done();
