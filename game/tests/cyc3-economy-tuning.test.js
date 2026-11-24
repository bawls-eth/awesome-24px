// Cycle 3 D: economy + danger tuning (data only), pure node. Fails on the cycle-2 numbers (reforge shards t - 6, TOUGH_GAP 3), passes on the new ones.
// Evidence: game/design/beta/cycle3-design.md and tools/economy-sim.js. Run: node game/tests/cyc3-economy-tuning.test.js
const path = require('path');
const { check, done } = require('./helpers');
const S = path.join(__dirname, '..', 'shared');
const Z = require(path.join(S, 'mm-zones.js')), GD = require(path.join(S, 'mm-gear-drops.js')), GF = require(path.join(S, 'mm-gear-forge.js')), D = require(path.join(S, 'mm-danger.js')), RNG = require(path.join(S, 'rng.js'));
const T = Z.TABLES;

// ---- reforge cost: 25 x (t - 6) shards, dust unchanged ----
const w = (t, r) => ({ n: 1, id: 'sparkwand', r: r, t: t, a: 12345 });
for (let t = 7; t <= 12; t++) {
  const o = GF.reforgeOptions(w(t, 0));
  check('reforge T' + t + ': shards = 25 x (t - 6) = ' + 25 * (t - 6) + ', dust = 20 x (t - 6)', !!o && o.length > 0 && o.every((e) => e.cost.shards === 25 * (t - 6) && e.cost.dust === 20 * (t - 6)), JSON.stringify(o && o[0] && o[0].cost));
}
check('reforge dust still adds 10 per rarity (rare T9 = 80 dust, 75 shards)', GF.reforgeOptions(w(9, 2)).every((e) => e.cost.dust === 80 && e.cost.shards === 75));

// ---- income per kill from the real tables (seeded, deterministic) ----
const N = 6000;
function income(zone, elite) {
  let shards = 0, dust = 0;
  for (let i = 0; i < N; i++) {
    const ti = [0, 0, 0, 0, 0, 0, 0, 1, 1, 2][i % 10];
    const info = { zone: zone, tier: ti, shardMul: T.ZONE_MUL.shard[zone] * T.TIER_MUL.shard[ti] * (elite ? T.ELITE.shard : 1) };
    if (!elite && RNG.create('dc:' + zone + ':' + i).next() >= Z.dropChance(info)) continue;
    const bag = Z.rollDrop(info, 'sim' + zone + elite + i).bag; shards += bag.shards;
    bag.items.forEach((it, k) => { const g = GD.rollGear({ src: elite ? 'elite' : 'mob', zone: zone, boss: elite ? 'giant_spider_queen' : '', r: it.r, bagTier: bag.tierIndex, k: k }, 'g' + zone + elite + i + ':' + k); if (g) { const s = GF.salvage({ n: 1, id: g.id, r: g.r, t: g.t, a: g.a }); if (s) dust += s.dust; } });
  }
  return { shards: shards / N, dust: dust / N };
}
const god = income(3, 0), hi = income(2, 0), elite = income(3, 1), shore = income(0, 0);
console.log('  income/kill: shore ' + JSON.stringify(shore) + ' highlands ' + JSON.stringify(hi) + ' godlands ' + JSON.stringify(god) + ' elite ' + JSON.stringify(elite));
const killsFor = (cost, per) => cost / per;
const c9 = GF.reforgeOptions(w(9, 0))[0].cost, c11 = GF.reforgeOptions(w(11, 0))[0].cost;
check('Godlands mob: a T9 reforge needs 5-15 kills of shards (was 1: shards were never a sink)', killsFor(c9.shards, god.shards) >= 5 && killsFor(c9.shards, god.shards) <= 15, String(killsFor(c9.shards, god.shards)));
check('Godlands mob: a T11 reforge needs 8-20 kills of shards', killsFor(c11.shards, god.shards) >= 8 && killsFor(c11.shards, god.shards) <= 20, String(killsFor(c11.shards, god.shards)));
check('shards stay the secondary gate: Godlands shard kills <= dust kills for a T9-T11 reforge (dust, the scarce part, still sets the pace)', killsFor(c9.shards, god.shards) <= killsFor(c9.dust, god.dust) && killsFor(c11.shards, god.shards) <= killsFor(c11.dust, god.dust));
check('the elite (T9-T11 row) pays a T9 reforge in dust in <= 8 kills and its shards in <= 3', killsFor(c9.dust, elite.dust) <= 8 && killsFor(c9.shards, elite.shards) <= 3);
check('Shore income is untouched: a Rare (120 shards) still takes 100-250 shore kills', killsFor(120, shore.shards) >= 100 && killsFor(120, shore.shards) <= 250, String(killsFor(120, shore.shards)));
check('no sink is cheaper than a Common (24 shards) for a Highlands T7: <= 8 kills of shards', killsFor(GF.reforgeOptions(w(7, 0))[0].cost.shards, hi.shards) <= 8);

// ---- danger meter: Tough = 1-2 levels under, Too hot = 3+ ----
check('TOUGH_GAP is 2', D.TOUGH_GAP === 2);
const lv = (hero, dist) => D.rate(hero, dist, 'classic').id;
// distance 0.5 is mid-Midlands in the classic bands: use area levels via the knots instead of distance: pick distances and read the area
const probe = (hero, areaLv) => { for (let d = 0; d <= 1.0001; d += 0.005) { const r = D.rate(hero, d, D.BANDS.classic); if (r.area === areaLv) return r; } return null; };
const a13 = probe(10, 13), a19 = probe(15, 19), a2 = probe(1, 2);
console.log('  probes: ' + JSON.stringify([a13 && [a13.hero, a13.area, a13.id], a19 && [a19.hero, a19.area, a19.id], a2 && [a2.hero, a2.area, a2.id]]));
check('Lv 10 at area 13 (gap 3, the cycle-0 spike) reads Too hot', !!a13 && a13.id === 'hot', JSON.stringify(a13 && a13.id));
check('Lv 15 at area 19 (gap 4) reads Too hot', !!a19 && a19.id === 'hot');
check('Lv 1 at area 2 (gap 1) still reads Tough, not Too hot', !!a2 && a2.id === 'tough');
check('gap 2 is Tough and gap 3 is Too hot on every area', [1, 5, 10, 15, 20].every((area) => { const p = probe(Math.max(1, area - 2), area), q = probe(Math.max(1, area - 3), area); return (!p || area - 2 < 1 || p.id === 'tough') && (!q || area - 3 < 1 || q.id === 'hot'); }));
check('fill stays within 0..1 and rises with the gap', [0, 1, 2, 3, 4, 5].every((g, i, a) => { const f = (hero) => D.rate(hero, 0.05, D.BANDS.classic).fill; return f(20 - g) >= 0 && f(20 - g) <= 1; }) && D.rate(1, 0.05, D.BANDS.classic).fill >= D.rate(20, 0.05, D.BANDS.classic).fill);
done();
