// Run: node game/tests/shared-mm-companion.test.js  (pure module, no DOM)
const C = require('../shared/mm-companion.js');
let n = 0, bad = 0;
function check(name, ok) { n++; if (!ok) { bad++; console.log('FAIL ' + name); } }
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const DEF = { id: 'raptor', speed: 1, companion: { dps: 6, range: 40, role: 'melee' }, ride: { saddle: 's', speed: 1.45, dash: 'leap', swim: false, lift: 18 } };
const owner = { x: 0, y: 0 };

// follow
const f = C.create({ id: 'a', x: 400, y: 0 });
for (let i = 0; i < 120; i++) C.update(f, { owner, def: DEF }, 1 / 60);
check('follow settles within 96 px in 2 s', dist(f, owner) <= 96 && dist(f, owner) >= 40);
const f2 = C.create({ x: 0, y: 0 }); const before = { x: f2.x, y: f2.y };
for (let i = 0; i < 60; i++) C.update(f2, { owner: { x: 20, y: 0 }, def: DEF }, 1 / 60);
check('follow keeps 48-96 px orbit (moves out from on top of owner)', dist(f2, { x: 20, y: 0 }) >= 47 && (f2.x !== before.x || f2.y !== before.y));
const tel = C.create({ x: 5000, y: 5000 }); C.update(tel, { owner, def: DEF }, 1 / 60);
check('far-away companion snaps beside owner', dist(tel, owner) < 200);
const orb0 = C.create({ slot: 0 }), orb1 = C.create({ slot: 1 });
for (let i = 0; i < 120; i++) { C.update(orb0, { owner, def: DEF }, 1 / 60); C.update(orb1, { owner, def: DEF }, 1 / 60); }
check('two slots take different orbit points', dist(orb0, orb1) > 30);

// attack
const enemies = [{ x: 200, y: 0, hp: 5 }, { x: 900, y: 0, hp: 5 }, { x: 100, y: 0, hp: 5, awake: false }, { x: 50, y: 0, hp: 0 }, { x: 60, y: 0, hp: 5, hostile: false }];
const at = C.create({ x: 30, y: 0, mode: 'attack' });
let hits = [], maxFromOwner = 0;
for (let i = 0; i < 600; i++) {
  const r = C.update(at, { owner, enemies, def: DEF }, 1 / 60);
  if (r.hit >= 0) hits.push(r.hit);
  maxFromOwner = Math.max(maxFromOwner, dist(at, owner));
}
check('attack targets the nearest awake hostile only', hits.length > 0 && hits.every((h) => h === 0));
check('attack never targets past the seek radius or leash', C.LEASH >= C.SEEK_R && maxFromOwner <= C.LEASH && !hits.includes(1));
const far = C.create({ x: 0, y: 0, mode: 'attack' }); let farHit = false;
for (let i = 0; i < 300; i++) if (C.update(far, { owner, enemies: [{ x: 300, y: 0, hp: 5 }], def: DEF }, 1 / 60).hit >= 0) farHit = true;
check('enemy just past 260 px of the owner is ignored', !farHit && dist(far, owner) < 120);
check('hit respects the cooldown (about 1 per second)', (() => { const c = C.create({ x: 190, y: 0, mode: 'attack' }); let k = 0; for (let i = 0; i < 300; i++) if (C.update(c, { owner, enemies: [{ x: 200, y: 0, hp: 5 }], def: DEF }, 1 / 60).hit >= 0) k++; return k >= 4 && k <= 6; })());
check('attack with no target falls back to follow', (() => { const c = C.create({ x: 400, y: 0, mode: 'attack' }); for (let i = 0; i < 180; i++) C.update(c, { owner, enemies: [], def: DEF }, 1 / 60); return dist(c, owner) <= 96; })());

// stay
const st = C.create({ x: 120, y: 80, mode: 'stay' }); C.setMode(st, 'stay');
for (let i = 0; i < 300; i++) C.update(st, { owner: { x: i, y: 0 }, enemies, def: DEF }, 1 / 60);
check('stay drifts 0 px', st.x === 120 && st.y === 80);

// fetch
const pk = [{ x: 150, y: 0 }, { x: 800, y: 0 }];
const fe = C.create({ x: 50, y: 0, mode: 'fetch' }); let picked = -1, returned = false;
for (let i = 0; i < 900; i++) {
  const r = C.update(fe, { owner, pickups: pk, def: DEF }, 1 / 60);
  if (r.pick >= 0 && picked < 0) { picked = r.pick; pk[picked].taken = true; }
  if (picked >= 0 && fe.phase === 'out') returned = true;
}
check('fetch picks up the nearest pickup within 200 px', picked === 0);
check('fetch comes back to the owner afterwards', returned && dist(fe, owner) <= 100);
check('fetch ignores pickups beyond 200 px of the owner', (() => { const c = C.create({ x: 0, y: 0, mode: 'fetch' }); let p = false; for (let i = 0; i < 600; i++) if (C.update(c, { owner, pickups: [{ x: 700, y: 0 }], def: DEF }, 1 / 60).pick >= 0) p = true; return !p; })());

// blocked / walls
const wall = C.create({ x: -50, y: 0 }); const blk = (x) => x > -10 && x < 10;
for (let i = 0; i < 120; i++) C.update(wall, { owner: { x: 100, y: 0 }, blocked: (x) => blk(x), def: DEF }, 1 / 60);
check('companion does not enter a blocked area', wall.x <= -10);
check('a throwing blocked() does not break update', (() => { const c = C.create({ x: 300, y: 0 }); C.update(c, { owner, blocked: () => { throw new Error('x'); }, def: DEF }, 1 / 60); return Number.isFinite(c.x); })());

// caps
const list = [];
const c1 = C.create({ id: 'a' }), c2 = C.create({ id: 'b' }), c3 = C.create({ id: 'c' });
check('two companions may be active', C.activate(list, c1) && C.activate(list, c2) && list.length === 2 && c2.slot === 1);
check('a third active companion is refused', C.activate(list, c3) === false && list.length === 2 && !C.canActivate(list));
check('re-activating an active one is fine', C.activate(list, c1) === true && list.length === 2);
check('low tier allows only 1', C.activate([], c1, true) === true && C.activate([c1], c2, true) === false && C.MAX_ACTIVE === 2 && C.THINK_HZ === 8 && C.MAX_TAMES === 60);

// down / no permadeath
const dn = C.create({ maxHp: 10, x: 400, y: 0 });
check('lethal damage downs the companion', C.damaged(dn, 99) === true && dn.down === C.DOWN_SEC && dn.hp === 0);
const px = dn.x; C.update(dn, { owner, def: DEF }, 0.1);
check('a downed companion does not move', dn.x === px);
for (let i = 0; i < 250; i++) C.update(dn, { owner, def: DEF }, 0.25);
check('it is ready again after 60 s with full HP (no permadeath)', dn.down === 0 && dn.hp === 10);

// damage
check('damage scales with bond and is capped at 35% of hero DPS', C.damage(DEF, 1, 100) === 6 && C.damage(DEF, 11, 100) === 12 && C.damage(DEF, 1, 10) === 3.5 && C.damage(null, 5, 10) === 0 && C.damage(DEF, 'x', 'y') === 0);

// determinism
function run() { const c = C.create({ x: 300, y: 40, mode: 'attack' }); const log = []; for (let i = 0; i < 400; i++) { const r = C.update(c, { owner: { x: i * 0.3, y: 0 }, enemies, pickups: pk, def: DEF }, 1 / 60); log.push(r.hit, c.x.toFixed(4), c.y.toFixed(4)); } return log.join(','); }
check('same inputs give identical output', run() === run());
check('no Math.random used', !/Math\.random/.test(require('fs').readFileSync(require.resolve('../shared/mm-companion.js'), 'utf8')));
check('frame rate does not change think cadence (30 vs 120 fps both find the target)', [30, 120].every((fps) => { const c = C.create({ x: 190, y: 0, mode: 'attack' }); let h = false; for (let i = 0; i < fps; i++) if (C.update(c, { owner, enemies: [{ x: 200, y: 0, hp: 5 }], def: DEF }, 1 / fps).hit >= 0) h = true; return h; }));

// hostile input
check('hostile ctx / companion do not throw', (() => {
  try {
    [null, undefined, 5, 'x', [], {}, { owner: 'q', enemies: 7, pickups: 'z', def: 5, blocked: 3 }].forEach((cx) => { C.update(C.create({ mode: 'attack' }), cx, 1 / 60); C.update(C.create({ mode: 'fetch' }), cx, 1 / 60); });
    [null, undefined, 3, 'x', []].forEach((c) => C.update(c, {}, 1 / 60));
    const c = C.create({ x: NaN, y: Infinity, id: { a: 1 }, mode: '__proto__', hp: 'x', maxHp: -5 });
    C.update(c, { owner: { x: NaN, y: NaN }, enemies: [null, 1, 'a', { x: NaN, y: 1, hp: 3 }, { x: 1, y: 1, hp: NaN }], pickups: [null, { x: 'q' }] }, NaN);
    C.update(c, {}, -5); C.update(c, {}, Infinity);
    return true;
  } catch (e) { return false; }
})());
check('NaN / junk never leaks into companion position', (() => { const c = C.create({ x: NaN, y: NaN, mode: 'attack' }); C.update(c, { owner: { x: NaN, y: 'a' }, enemies: [{ x: NaN, y: NaN }] }, 1 / 60); return Number.isFinite(c.x) && Number.isFinite(c.y) && c.mode === 'attack'; })());
check('create sanitises ids, mode and slot', (() => { const c = C.create({ id: '<script>', sp: 'x'.repeat(99), mode: 'evil', slot: 99 }); return c.id === '' && c.sp === '' && c.mode === 'follow' && c.slot === 1; })());
check('setMode rejects unknown modes', C.setMode(C.create({}), 'boom') === false && C.setMode(C.create({}), 'fetch') === true && C.setMode(null, 'stay') === false);
check('huge dt is clamped to a quarter second', (() => { const c = C.create({ x: 400, y: 0 }); C.update(c, { owner, def: DEF }, 1e9); return 400 - c.x <= 150 * 1.6 * 0.25 + 1e-6; })());

// cost bounds
check('scan is bounded to MAX_SCAN even with 100k hostile enemies', (() => {
  const many = []; for (let i = 0; i < 100000; i++) many.push({ x: i % 200, y: 3, hp: 1 });
  const c = C.create({ mode: 'attack' }); let maxScan = 0;
  for (let i = 0; i < 20; i++) { C.update(c, { owner, enemies: many, def: DEF }, 1 / 8); maxScan = Math.max(maxScan, c.scanned); }
  return maxScan === C.MAX_SCAN;
})());
check('2 companions x 72 enemies x 600 steps under 90 ms (hot)', (() => {
  const es = []; for (let i = 0; i < 72; i++) es.push({ x: (i * 37) % 400 - 200, y: (i * 53) % 400 - 200, hp: 5 });
  const cs = [C.create({ mode: 'attack', slot: 0, x: 60 }), C.create({ mode: 'attack', slot: 1, x: -60 })];
  for (let i = 0; i < 100; i++) cs.forEach((c) => C.update(c, { owner, enemies: es, def: DEF }, 1 / 60));
  let best = 1e9;
  for (let rep = 0; rep < 5; rep++) {
    const t = process.hrtime.bigint();
    for (let i = 0; i < 600; i++) cs.forEach((c) => C.update(c, { owner: { x: Math.sin(i / 50) * 40, y: 0 }, enemies: es, def: DEF }, 1 / 60));
    best = Math.min(best, Number(process.hrtime.bigint() - t) / 1e6);
  }
  return best < 90;
})());
check('think runs at ~8 Hz: 60 frames scan about 8 times, not 60', (() => { const es = [{ x: 100, y: 0, hp: 5 }]; const c = C.create({ mode: 'attack' }); let scans = 0; for (let i = 0; i < 60; i++) { C.update(c, { owner, enemies: es, def: DEF }, 1 / 60); if (c.scanned > 0) scans++; } return scans >= 7 && scans <= 9; })());

// mounts
const m = C.mount(DEF);
check('mount() returns the def values', m && m.speed === 1.45 && m.dash === 'leap' && m.swim === false && m.lift === 18 && m.dashMul > 1);
check('mount() is null for non-rideables and junk', [null, undefined, {}, { ride: null }, { ride: [] }, 5, 'x'].every((d) => C.mount(d) === null));
check('mount values are clamped', (() => { const x = C.mount({ ride: { speed: 99, lift: -9, dash: '../x', swim: 'yes' } }); return x.speed === 3 && x.lift === 0 && x.dash === 'dash' && x.swim === false; })());
const ms = C.ride(DEF, 't1a');
check('riding: move scale x1.45, dash multiplier, no swim', C.moveScale(ms, 1) === 1.45 && C.moveScale(ms, 0.5) === 0.725 && C.dashScale(ms) === 1.4 && !C.canSwim(ms));
check('riding: no fire for 0.2 s after mounting', !C.canFire(ms) && (C.rideStep(ms, 0.1), !C.canFire(ms)) && (C.rideStep(ms, 0.11), C.canFire(ms)));
check('riding: rider takes x0.8 damage', Math.abs(C.riderDamage(ms, 10) - 8) < 1e-9 && C.riderDamage(null, 10) === 10);
check('rider overlay is lifted by the mount lift', C.overlay(ms, false).dy === -18 && Math.abs(C.overlay(ms, true).dy + 18) <= 2 && C.overlay(null).dy === 0);
check('swim mount can swim', C.canSwim(C.ride({ ride: { speed: 1.2, swim: true, lift: 4 } })));
check('same key toggles mount and dismount', C.toggle(null, DEF, 'x') !== null && C.toggle(ms) === null && C.toggle(null, { ride: null }) === null);
const thr = C.throwRider(ms);
check('downed mount throws the rider: 0.5 s iframes, x1 scale, no damage during iframes', thr.iframes === 0.5 && C.moveScale(ms, 1) === 1 && C.riderDamage(ms, 10) === 0 && C.canFire(ms));
C.rideStep(ms, 0.25); C.rideStep(ms, 0.25); C.rideStep(ms, 0.25);
check('iframes expire and revive restores the mount', C.riderDamage(ms, 10) === 10 && C.riding(C.revive(ms)) && !C.canFire(ms));
check('dismounted (null) state means no change', C.moveScale(null, 1) === 1 && C.dashScale(null) === 1 && C.canFire(null) && C.moveScale(ms, NaN) === 1.45 && C.riderDamage(ms, NaN) === 0);

console.log((bad ? 'FAILED ' + bad : 'ok') + ' (' + n + ' checks)');
process.exit(bad ? 1 : 0);
