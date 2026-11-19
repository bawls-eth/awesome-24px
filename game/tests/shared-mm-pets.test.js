// Unit tests for shared/mm-pets.js. Run: node game/tests/shared-mm-pets.test.js
const P = require('../shared/mm-pets.js');
let failed = 0;
function check(name, cond, extra = '') { console.log((cond ? 'PASS ' : 'FAIL ') + name + (cond ? '' : ' ' + extra)); if (!cond) failed++; }
const done = () => { console.log(failed ? `${failed} FAILED` : 'ALL PASSED'); process.exitCode = failed ? 1 : 0; };
const lcg = (s) => () => { s = (s + 0x6D2B79F5) >>> 0; let t = Math.imul(s ^ (s >>> 15), 1 | s); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
const pool = new Set(P.POOLS.fogfen.map((p) => p[0]));

{ // hatch
  let ok = true, det = true; const seen = new Set();
  for (let s = 1; s <= 1000; s++) {
    const a = P.hatch({ biome: 'fogfen' }, lcg(s)), b = P.hatch({ biome: 'fogfen' }, lcg(s));
    if (!pool.has(a.species)) ok = false;
    if (JSON.stringify(a) !== JSON.stringify(b)) det = false;
    seen.add(a.species);
  }
  check('hatch species within pool over 1000 seeds', ok);
  check('hatch deterministic per seed', det);
  check('hatch yields variety', seen.size >= 5, [...seen].join());
  check('hatch survives garbage egg/rng', pool.has(P.hatch(null, null).species) && pool.has(P.hatch({ biome: 5 }, () => NaN).species));
}
{ // follow
  const owner = { x: 10, y: 4 }, pet = { x: -20, y: 30 };
  let bad = false, prev = Infinity;
  for (let i = 0; i < 600; i++) {
    P.follow(pet, owner, 1 / 60);
    const d = Math.hypot(pet.x - owner.x, pet.y - owner.y);
    if (d < 1.5 - 1e-9 || d > prev + 1e-9) bad = true;
    prev = d;
  }
  const d = Math.hypot(pet.x - owner.x, pet.y - owner.y);
  check('follow converges to ~1.5 tiles', Math.abs(d - 1.5) < 0.05, d);
  check('follow never overshoots / monotone', !bad);
  const p2 = { x: 3, y: 0 }; P.follow(p2, { x: 0, y: 0 }, 5);
  check('huge dt does not overshoot', Math.hypot(p2.x, p2.y) >= 1.5 - 1e-9);
  const p3 = { x: 0.5, y: 0 }; P.follow(p3, { x: 0, y: 0 }, 0.1);
  check('inside radius stays put', p3.x === 0.5);
}
{ // mend + feed
  const pet = P.create('frog', 'common'), owner = { hp: 10, maxHp: 500 };
  check('mend heals 5+level (L1)', P.mend(pet, owner) === 6 && owner.hp === 16);
  P.feed(pet, { kind: 'potion' });
  const L = P.levelOf(pet), h = owner.hp; P.mend(pet, owner);
  check('mend heals 5+level (leveled)', L > 1 && owner.hp === h + 5 + L, L);
  const q = P.create('frog', 'common');
  check('T0 item adds 5', P.feed(q, { tier: 0 }).added === 5 && q.power === 5);
  check('potion adds 60', P.feed(q, { kind: 'potion' }).added === 60 && q.power === 65);
  check('junk item rejected', P.feed(q, { kind: 'junk' }).ok === false && q.power === 65);
  for (let i = 0; i < 100; i++) P.feed(q, { kind: 'potion' });
  check('common level capped at 30', P.levelOf(q) === 30 && q.level === 30);
  const m = P.create('x', 'mythic'); for (let i = 0; i < 100; i++) P.feed(m, { kind: 'relic' });
  check('mythic capped at 100', P.levelOf(m) === 100);
}
{ // serialize / clean
  const pet = P.create('otter', 'uncommon'); pet.x = 3.25; pet.y = -1; P.feed(pet, { kind: 'potion' });
  const s = P.serialize(pet);
  check('serialize deterministic roundtrip', P.serialize(P.deserialize(s)) === s && P.deserialize(s).species === 'otter');
  const junk = [null, undefined, 5, 'x', [], { power: 'NaN', rarity: 'god', species: '<b>', x: Infinity }, { power: 1e12, rarity: 'common' }];
  const ok = junk.every((j) => { const c = P.clean(j); return c.level >= 1 && c.level <= 30 && isFinite(c.x) && isFinite(c.power) && /^[a-z0-9_]+$/.test(c.species); });
  check('clean handles garbage', ok);
  check('deserialize garbage safe', P.deserialize('{{{').rarity === 'common' && P.deserialize(undefined).level === 1);
  check('power clamped to rarity cap', P.clean({ power: 1e12, rarity: 'common' }).level === 30);
  const bad = /hp|health|hunger|mood|sad|died|dead|decay|timer|lastFed|lastSeen/i;
  check('pets have no decay fields', Object.keys(P.hatch({}, lcg(1))).every((k) => !bad.test(k)));
}
done();
