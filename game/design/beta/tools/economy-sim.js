// Cycle 3 D: economy simulation with the REAL shared modules (no browser, no network, no save). Per zone: kills -> bags -> shards, gear drops (MMGearDrops, mob + elite)
// -> dust if salvaged (MMGearForge.salvage), against the sinks: shop (shard price = sell value x 8) and reforge (costFor). Run: node game/design/beta/tools/economy-sim.js [killsPerRow]
// Shards come ONLY with a bag (bag chance by zone = DROP_CHANCE); an elite always drops (the spawner already rolled its rarity).
const path = require('path');
const S = path.join(__dirname, '..', '..', '..', 'shared');
const Z = require(path.join(S, 'mm-zones.js')), GD = require(path.join(S, 'mm-gear-drops.js')), GF = require(path.join(S, 'mm-gear-forge.js'));
const RNG = require(path.join(S, 'rng.js'));
const N = +process.argv[2] || 20000;
const T = Z.TABLES;
const costOf = (t, r, rule) => ({ dust: 20 * (t - 6) + 10 * r, shards: rule === 'new' ? 25 * (t - 6) : t - 6 });
function sim(zone, elite) {
  const out = { bags: 0, shards: 0, gear: 0, dust: 0, byT: {} };
  for (let i = 0; i < N; i++) {
    const tierIdx = [0, 0, 0, 0, 0, 0, 0, 1, 1, 2][i % 10]; // enemy tier mix assumed 70 / 20 / 10 percent (tier 0 / 1 / 2)
    const sm = T.ZONE_MUL.shard[zone] * T.TIER_MUL.shard[tierIdx] * (elite ? T.ELITE.shard : 1);
    const info = { zone: zone, tier: tierIdx, shardMul: sm };
    if (!elite && RNG.create('dc:' + zone + ':' + i).next() >= Z.dropChance(info)) continue;
    const bag = Z.rollDrop(info, 'sim' + zone + elite + i).bag;
    out.bags++; out.shards += bag.shards;
    bag.items.forEach((it, k) => {
      const g = GD.rollGear({ src: elite ? 'elite' : 'mob', zone: zone, boss: elite ? 'giant_spider_queen' : '', r: it.r, bagTier: bag.tierIndex, k: k, cls: '' }, 'g' + zone + elite + i + ':' + k);
      if (!g) return;
      out.gear++; out.byT[g.t] = (out.byT[g.t] || 0) + 1;
      const s = GF.salvage({ n: 1, id: g.id, r: g.r, t: g.t, a: g.a });
      if (s) out.dust += s.dust;
    });
  }
  return out;
}
const rows = [];
for (let z = 0; z <= 3; z++) rows.push(['zone ' + z + ' mob', sim(z, 0)]);
rows.push(['zone 3 elite', sim(3, 1)]);
const per = (v) => +(v / N).toFixed(3);
console.log('rows of', N, 'kills; bag chance by zone', JSON.stringify(T.DROP_CHANCE));
rows.forEach(([n, o]) => {
  const bt = Object.keys(o.byT).sort((a, b) => a - b).map((k) => 'T' + k + ':' + per(o.byT[k])).join(' ');
  console.log(n.padEnd(14), 'bags/kill', per(o.bags), 'shards/kill', per(o.shards), 'gear/kill', per(o.gear), 'dust/kill (all salvaged)', per(o.dust), '|', bt);
});
console.log('\nkills per reforge (mean income, every drop salvaged):');
['old', 'new'].forEach((rule) => {
  [['zone 2 mob', rows[2][1]], ['zone 3 mob', rows[3][1]], ['zone 3 elite', rows[4][1]]].forEach(([n, o]) => {
    [9, 10, 11].forEach((t) => {
      const c = costOf(t, 0, rule);
      console.log(rule.padEnd(4), n.padEnd(13), 'reforge T' + t, JSON.stringify(c), 'kills for the shards', Math.ceil(c.shards / (o.shards / N)), '| kills for the dust', Math.ceil(c.dust / (o.dust / N)));
    });
  });
});
console.log('shop Rare (120 shards): kills to afford it in zones 0..3:', rows.slice(0, 4).map(([n, o]) => Math.ceil(120 / (o.shards / N))).join(' / '));
