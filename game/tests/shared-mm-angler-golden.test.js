// Golden guard for the Angler bite tables (MG3). Run: node game/tests/shared-mm-angler-golden.test.js
// tests/fixtures/angler-bite-golden.json was captured from the UNMODIFIED shared/mm-angler*.js (before MG3 bug bait / Isles cove /
// decor). Every existing seeded roll must stay byte-identical: rollFish over every spot x month x hour x weather x lure x bait,
// rollSize, bite waits, reel traces, bait drops, tournament casts and the save bytes of sample journals.
// Re-capturing is never part of a normal change: `--write` exists only to record the fixture on an untouched module.
const fs = require('fs');
const path = require('path');
const A = require('../shared/mm-angler.js');
const D = require('../shared/mm-angler-depth.js');
let failed = 0;
function check(name, cond, extra = '') { console.log((cond ? 'PASS ' : 'FAIL ') + name + (cond ? '' : ' ' + extra)); if (!cond) failed++; }
const FIXTURE = path.join(__dirname, 'fixtures', 'angler-bite-golden.json');

function fnv() {
  let h = 2166136261 >>> 0;
  return {
    add(s) { s = String(s); for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; } h ^= 124; h = Math.imul(h, 16777619) >>> 0; },
    get v() { return h >>> 0; },
  };
}
function capture() {
  const out = { rollFish: {}, pools: {}, sample: {}, rollSize: 0, bite: 0, reel: 0, baitDrop: 0, tour: 0, save: '' };
  const lures = [undefined].concat(Object.keys(A.LURES)), baits = [undefined, 'plain', 'quick', 'rare', 'big'];
  A.SPOTS.forEach((spot) => {
    const h = fnv(), hp = fnv();
    [1, 4, 7, 10, 12].forEach((month) => [3, 12, 20].forEach((hour) => ['clear', 'rain', 'snow'].forEach((weather) => [false, true].forEach((secret) => {
      const ctx = { month, hour, weather, secret };
      A.pool(spot, ctx).forEach((f) => hp.add(f.id));
      A.pool(spot, ctx, { bosses: true }).forEach((f) => hp.add('b' + f.id));
      lures.forEach((lure) => baits.forEach((baitType) => {
        const gear = { lure, bait: baitType === 'plain', baitType };
        const r = A.seedRng(month * 1000 + hour * 10 + (secret ? 7 : 0) + weather.length);
        for (let i = 0; i < 12; i++) { const f = A.rollFish(r, spot, ctx, gear); h.add(f ? f.id : '-'); }
        A.pool(spot, ctx).forEach((f) => h.add(A.weightOf(f, ctx, gear).toFixed(6)));
      }));
    }))));
    out.rollFish[spot] = h.v; out.pools[spot] = hp.v;
    const r = A.seedRng(99), s = [];
    for (let i = 0; i < 20; i++) { const f = A.rollFish(r, spot, { month: 1, hour: 12, weather: 'clear' }, {}); s.push(f ? f.id : '-'); }
    out.sample[spot] = s.join(',');
  });
  let h = fnv(); const r = A.seedRng(5);
  A.FISH.forEach((f) => { for (let i = 0; i < 5; i++) { h.add(A.rollSize(r, f)); h.add(A.rollSize(r, f, { big: true })); } });
  out.rollSize = h.v;
  h = fnv(); const rb = A.seedRng(11);
  for (let i = 0; i < 200; i++) h.add(A.bite(rb).wait.toFixed(9));
  out.bite = h.v;
  h = fnv();
  ['minnow', 'koi', 'pike', 'crab', 'tuna', 'old_whiskers', 'pier_kraken', 'ice_queen_pike'].forEach((id) => Object.keys(A.RODS).forEach((rod) => {
    const s = A.reel.create(id, rod, { seed: 4242, calm: rod === 'bamboo' });
    for (let i = 0; i < 600 && s.status === 'reeling'; i++) { s.tick(1 / 60, (i % 50) < 22); if (i % 10 === 0) h.add(s.pos.toFixed(6) + s.meter.toFixed(6) + s.tension.toFixed(6)); }
    h.add(s.status);
  }));
  out.reel = h.v;
  h = fnv();
  A.FISH.forEach((f) => { for (let c = 0; c < 30; c++) h.add(D.economy.baitDrop(f.id, 20 + c, c) || '-'); });
  out.baitDrop = h.v;
  h = fnv();
  for (let day = 0; day < 400; day += 3) {
    const t = D.tournament.forDay(day); h.add(t.spot + t.target);
    for (let n = 0; n < D.CASTS; n++) { const c = D.tournament.castFor(day, n); h.add(c.fish + c.size + c.wait.toFixed(9) + c.seed); }
  }
  out.tour = h.v;
  out.save = A.serialize({ caught: { koi: { n: 3, best: 50 }, minnow: { n: 1, best: 6 } }, bait: 4, bells: 120, gear: { rod: 'stick', lure: 'worm' }, baits: { quick: 2, rare: 0, big: 1 }, baitType: 'quick', junk: 1 })
    + '|' + A.serialize({ caught: { koi: { n: 1, best: 40 } } }) + '|' + A.serialize(null);
  return out;
}
const got = capture();
if (process.argv.indexOf('--write') >= 0) {
  fs.mkdirSync(path.dirname(FIXTURE), { recursive: true });
  fs.writeFileSync(FIXTURE, JSON.stringify(got, null, 1) + '\n');
  console.log('wrote ' + FIXTURE);
  process.exit(0);
}
const want = JSON.parse(fs.readFileSync(FIXTURE, 'utf8'));
A.SPOTS.forEach((sp) => {
  check('rollFish + weights byte-identical at ' + sp, got.rollFish[sp] === want.rollFish[sp], got.rollFish[sp] + ' vs ' + want.rollFish[sp]);
  check('pools identical at ' + sp, got.pools[sp] === want.pools[sp]);
  check('sample rolls identical at ' + sp, got.sample[sp] === want.sample[sp], got.sample[sp]);
});
['rollSize', 'bite', 'reel', 'baitDrop', 'tour'].forEach((k) => check(k + ' byte-identical', got[k] === want[k], got[k] + ' vs ' + want[k]));
check('save bytes of existing journals unchanged', got.save === want.save, got.save);
check('still 48 species and 6 spots', A.FISH.length === 48 && A.SPOTS.length === 6);
console.log(failed ? failed + ' FAILED' : 'ALL PASS');
process.exit(failed ? 1 : 0);
