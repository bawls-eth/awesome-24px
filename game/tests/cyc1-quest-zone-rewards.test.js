// ID-03 (cycle 1 S): the daily kill quest pays shards by its zone's recommended level (MMQuests.killShards: 30 + need + 8 x recLv).
// Node only. The curve is monotonic in zone (every zone pays more than the whole zone before it), stays under the 1000 cap, and the
// daily rolls are untouched: ids, kinds, zones, needs, biomes, texts, bags and the other two quests' shards hash to the cycle-0 value.
// Run: node game/tests/cyc1-quest-zone-rewards.test.js
const { check, done } = require('./helpers');
const Q = require('../shared/mm-quests.js');
const R = require('../shared/rng.js');
const day = (i) => new Date(Date.UTC(2026, 0, 1) + i * 864e5).toISOString().slice(0, 10);

// 1: the seeds and ids are unchanged (fingerprint computed on 86eda4b, before ID-03, over 120 dates; the kill quest's shards left out)
let s = '';
for (let i = 0; i < 120; i++) { const d = day(i); Q.quests(d).forEach((q) => { s += [d, q.id, q.kind, q.zone, q.need, q.biome, q.rec, q.text, q.reward.bag, q.id === 'kill_zone' ? '' : q.reward.shards].join('|') + ';'; }); }
check('1. 120 daily boards: ids, zones, needs, biomes, texts, bags and the boss/portal shards are byte-identical to before (seed fingerprint)', R.hash(s) === 5837541340305763 && s.length === 23623, R.hash(s) + ' ' + s.length);

// 2: the curve
const by = [[], [], [], []];
for (let i = 0; i < 365; i++) { const q = Q.quests(day(i))[0]; by[q.zone].push(q.reward.shards); if (q.reward.shards !== Q.killShards(q.zone, q.need)) by[q.zone].push(-1); }
const lo = by.map((a) => Math.min(...a)), hi = by.map((a) => Math.max(...a));
check('2. a year of boards: each zone has kill quests and every reward is killShards(zone, need)', by.every((a) => a.length > 20 && a.every((v) => v > 0)), JSON.stringify(by.map((a) => a.length)));
check('2b. monotonic in zone: the cheapest quest of a zone pays more than the dearest of the zone before (Shore < Midlands < Highlands < Godlands)', lo[1] > hi[0] && lo[2] > hi[1] && lo[3] > hi[2], JSON.stringify({ lo, hi }));
check('2c. exact bands: Shore 46-58, Midlands 82-94, Highlands 126-138, Godlands 170-182', JSON.stringify(lo) === '[46,82,126,170]' && JSON.stringify(hi) === '[58,94,138,182]', JSON.stringify({ lo, hi }));
check('2d. the step follows recLv (1/5/10/15 x 8) for the same need, and Shore stays close to the old 38-50 (no early inflation)', Q.killShards(1, 20) - Q.killShards(0, 20) === 32 && Q.killShards(3, 20) - Q.killShards(2, 20) === 40 && lo[0] - 38 === 8);
let cap = true; for (let z = -2; z < 6; z++) for (let n = 0; n <= 2000; n += 50) { const v = Q.killShards(z, n); if (!(v > 0 && v <= 1000)) cap = false; }
check('2e. never above the 1000 cap, never NaN, bad zones read as the Shore', cap && Q.killShards(NaN, 10) === Q.killShards(0, 10) && Q.killShards('x', 10) === Q.killShards(0, 10));
// 3: bag tiers and claim shape unchanged
const qs = Q.quests('2026-03-03');
check('3. bag tiers unchanged (kill brown, boss purple, portal pink) and the board summary shows the new number', qs[0].reward.bag === 'brown' && qs[1].reward.bag === 'purple' && qs[2].reward.bag === 'pink' && Q.summary(null, '2026-03-03')[0].reward.shards === Q.killShards(qs[0].zone, qs[0].need));
const st = Q.progress(Q.fresh('2026-03-03'), { type: 'kill', zone: qs[0].zone, n: 99 }, '2026-03-03');
const c = Q.claim(st, 'kill_zone', '2026-03-03');
check('3b. claiming the kill quest pays exactly the scaled shards once', c.reward && c.reward.shards === Q.killShards(qs[0].zone, qs[0].need) && Q.claim(c.state, 'kill_zone', '2026-03-03').reward === null);
done();
