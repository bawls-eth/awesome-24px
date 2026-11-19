// Unit tests for shared/mm-angler.js. Run: node game/tests/shared-mm-angler.test.js
const A = require('../shared/mm-angler.js');
let failed = 0;
function check(name, cond, extra = '') { console.log((cond ? 'PASS ' : 'FAIL ') + name + (cond ? '' : ' ' + extra)); if (!cond) failed++; }
const done = () => { console.log(failed ? `${failed} FAILED` : 'ALL PASSED'); process.exitCode = failed ? 1 : 0; };
const near = (a, b, e = 1e-6) => Math.abs(a - b) < e;
const lcg = (seed) => () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };

check('48 species', A.FISH.length === 48, A.FISH.length);
check('unique ids', new Set(A.FISH.map((f) => f.id)).size === 48);
const old = ['minnow', 'shrimp', 'frog', 'koi', 'puffer', 'crab', 'turtle', 'squid', 'jelly', 'octopus', 'shark', 'goldfish'];
check('12 existing ids present', old.every((id) => A.BY_ID[id]));
check('rarity 1-5', A.FISH.every((f) => f.rarity >= 1 && f.rarity <= 5));
check('every spot has fish', A.SPOTS.every((s) => A.FISH.some((f) => f.spots.includes(s))));

const sum = { month: 7, hour: 12, weather: 'clear' };
check('pool filters by spot', A.pool('river', sum).length > 0 && A.pool('river', sum).every((f) => f.spots.includes('river')));
check('season filter (frog not in winter)', !A.pool('west', { month: 1, hour: 12 }).some((f) => f.id === 'frog') && A.pool('west', { month: 5, hour: 12 }).some((f) => f.id === 'frog'));
check('time filter (squid night only)', !A.pool('pier', { month: 7, hour: 12 }).some((f) => f.id === 'squid') && A.pool('pier', { month: 7, hour: 23 }).some((f) => f.id === 'squid'));
check('weather filter (tarpon only in rain)', !A.pool('mangrove', sum).some((f) => f.id === 'tarpon') && A.pool('mangrove', { month: 7, hour: 12, weather: 'rain' }).some((f) => f.id === 'tarpon'));
check('Ice Hole locked Mar-Nov', [3, 6, 11].every((m) => A.pool('ice', { month: m, hour: 12 }).length === 0 && A.rollFish(lcg(1), 'ice', { month: m, hour: 12 }) === null));
check('Ice Hole open Dec-Feb', [12, 1, 2].every((m) => A.pool('ice', { month: m, hour: 12 }).length > 0));
check('roll returns fish from pool', (() => { const r = lcg(5); for (let i = 0; i < 200; i++) { const f = A.rollFish(r, 'east', { month: 4, hour: 9 }); if (!f || !f.spots.includes('east') || f.boss) return false; } return true; })());
check('lure shifts weights', (() => {
  const c = { month: 7, hour: 23 };
  const n = (g) => { const r = lcg(9); let k = 0; for (let i = 0; i < 3000; i++) if (A.rollFish(r, 'pier', c, g).time === 'night') k++; return k; };
  return n({ lure: 'glow' }) > n({ lure: 'none' });
})());

// tension rates
{
  const r = A.reel.create('minnow', 'stick', { seed: 1 });
  r.tick(0.1, true); check('tension rises 120%/s', near(r.tension, 0.5 + 0.12));
  const r2 = A.reel.create('minnow', 'stick', { seed: 1 });
  for (let i = 0; i < 10; i++) r2.tick(0.01, false);
  check('tension falls 160%/s', near(r2.tension, 0.5 - 0.16));
}
// meter rates: a calm fish in a wide zone at tension 0.5 (zone covers it), then far away
{
  const r = A.reel.create('koi', 'golden', { seed: 1 });
  r.tension = 0.5; r.pos = 0.5; r._target = 0.5;
  // koi at pos .5 stays near; hold/release alternate to keep tension ~0.5
  r.tick(0.01, true); r.tick(0.0075, false);
  check('meter fills 25%/s in zone', near(r.meter, 0.25 + 0.25 * 0.0175, 1e-6), r.meter);
  const r3 = A.reel.create('minnow', 'stick', { seed: 1 });
  r3.tension = 0; r3.pos = 1; r3._hold = 99; r3._target = 1;
  r3.tick(0.01, false);
  check('meter drains 15%/s off target', near(r3.meter, 0.25 - 0.0015, 1e-9), r3.meter);
}
check('rod widens zone', A.reel.create('koi', 'golden').zone > A.reel.create('koi', 'stick').zone);
check('Calm reel +30% zone', near(A.reel.create('koi', 'stick', { calm: true }).zone, 0.28 * 1.3));
// snap timing
{
  const run = (id) => {
    const r = A.reel.create(id, 'stick', { seed: 3 }); let t = 0, tMax = null;
    while (r.status === 'reeling' && t < 20) { r.tick(0.01, true); t += 0.01; if (tMax === null && r.tension >= 1) tMax = t; r.meter = 0.3; }
    return { snapAfterMax: t - tMax, r };
  };
  const b = run('old_whiskers'), n = run('minnow');
  check('boss line snaps after 1.5 s at max', b.r.status === 'snapped' && Math.abs(b.snapAfterMax - 1.5) < 0.03, b.snapAfterMax);
  check('normal fish snap limit is shorter', n.r.status === 'snapped' && n.snapAfterMax < b.snapAfterMax);
  const r = A.reel.create('old_whiskers', 'stick', { seed: 3 });
  for (let i = 0; i < 100; i++) r.tick(0.01, true);
  for (let i = 0; i < 20; i++) r.tick(0.01, false);
  check('releasing resets the snap timer', r.atMax === 0 && r.status === 'reeling');
}
// deterministic paths
{
  const path = (id, seed) => { const r = A.reel.create(id, 'bamboo', { seed }); const p = []; for (let i = 0; i < 300; i++) { r.tick(0.02, i % 7 < 3); p.push(r.pos.toFixed(5)); } return p.join(); };
  check('same seed same path (all behaviours)', ['koi', 'minnow', 'crab', 'perch', 'old_whiskers'].every((id) => path(id, 42) === path(id, 42)));
  check('different seed different path', path('minnow', 1) !== path('minnow', 2));
}
// bosses
check('boss descriptors', A.BOSSES.old_whiskers.phases.length === 3 && !!A.BOSSES.pier_kraken.sidePull && !!A.BOSSES.ice_queen_pike);
{
  const r = A.reel.create('pier_kraken', 'steel', { seed: 2 }); let max = 0;
  for (let i = 0; i < 400; i++) { r.tick(0.01, false); max = Math.max(max, Math.abs(r.side)); }
  check('kraken pulls sideways', max > 0.5);
}
// bite timing
{
  const b = A.bite(() => 0.5);
  check('early press spooks', b.press() === 'spooked' && b.state === 'spooked');
  const b2 = A.bite(() => 0); b2.tick(b2.wait + 0.1);
  check('press in ~1 s window hooks', b2.state === 'biting' && b2.press() === 'hooked');
  const b3 = A.bite(() => 0); b3.tick(b3.wait + 1.01);
  check('late press misses', b3.state === 'missed' && b3.press() === 'missed');
}
// journal
check('journal clean on garbage', [null, 5, 'x{', '[1]', { caught: 7 }, { caught: { nope: { n: 3 }, koi: 'z', carp: { n: -4 } } }].every((g) => { const c = A.clean(g); return c && Object.keys(c.caught).length === 0; }));
{
  let j = A.journal.record(null, 'koi', 55); j = A.journal.record(j, 'koi', 40); j = A.journal.record(j, 'old_whiskers', 130);
  const back = A.clean(A.serialize(j));
  check('journal round trip', back.caught.koi.n === 2 && back.caught.koi.best === 55 && back.bosses.old_whiskers === true && A.journal.speciesCount(back) === 2);
}
done();
