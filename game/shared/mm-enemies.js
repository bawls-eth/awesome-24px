// Bramble enemy data + threat-budget encounter planner. UMD: browser global MMEnemies, or require().
// Depends on MMRng (game/shared/rng.js).
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./rng.js'));
  else root.MMEnemies = factory(root.MMRng);
}(typeof self !== 'undefined' ? self : this, function (MMRng) {
  const ELITE_HP_MULT = 4;
  const ELITE_COST_MULT = 3;
  const MIN_START_DIST = 6; // tiles

  // hp base (tier 1), speed in tiles/s, cost = threat points.
  const ENEMIES = {
    puffcap: { id: 'puffcap', name: 'Puffcap', archetype: 'wanderer', hp: 50, speed: 1.5, dmg: 8, cost: 1,
      pattern: { type: 'ring', pellets: 6, speed: 4, every: 2.0 } },
    beetle: { id: 'beetle', name: 'Bramble Beetle', archetype: 'chaser', hp: 90, speed: 3.2, dmg: 12, cost: 2,
      pattern: { type: 'shotgun', shots: 3, spread: 30, speed: 6, range: 3 } },
    archer: { id: 'archer', name: 'Thistle Archer', archetype: 'orbiter', hp: 80, speed: 2.5, dmg: 10, cost: 2,
      pattern: { type: 'aimedBurst', shots: 3, spread: 18, bursts: 2, speed: 7 } },
    moth: { id: 'moth', name: 'Moth Swarm', archetype: 'spawner', hp: 160, speed: 0, dmg: 0, cost: 3,
      pattern: { type: 'spawn', minion: 'mothling', count: 2, every: 6, max: 6 } },
    sprout: { id: 'sprout', name: 'Sprout Slime', archetype: 'wanderer', hp: 70, speed: 1.5, dmg: 8, cost: 1,
      pattern: { type: 'aimedBurst', shots: 1, every: 1.6, speed: 5 },
      splitsInto: { id: 'sprout_mini', count: 2, hp: 25 } },
  };
  const MINIONS = {
    sprout_mini: { id: 'sprout_mini', name: 'Mini Sprout', archetype: 'wanderer', hp: 25, speed: 1.8, dmg: 8, cost: 0,
      pattern: { type: 'aimedBurst', shots: 1, every: 2.2, speed: 5 } },
    mothling: { id: 'mothling', name: 'Mothling', archetype: 'chaser', hp: 20, speed: 2.5, dmg: 8, cost: 0, pattern: null },
  };
  const IDS = Object.keys(ENEMIES);

  function budget(tier) { return 4 + 2 * tier; }
  function eliteChance(tier) { return Math.min(0.5, 0.05 + 0.03 * tier); }

  function dist(a, b) { return Math.hypot(a.x - b.x, a.y - b.y); }

  // Choose enemies for a room. Never exceeds budget(tier); nothing within 6 tiles of startPoint.
  // Returns { budget, spent, enemies: [{ id, x, y, hp, maxHp, cost, elite, crown, ... }] }.
  function plan(seed, tier, spawnPoints, startPoint, allowedIds) {
    const pool = Array.isArray(allowedIds) && allowedIds.length ? IDS.filter((id) => allowedIds.indexOf(id) >= 0) : IDS; // additive: a biome restricts the mix; omitted = all (old behaviour)
    const rng = MMRng.create('mm-enemies:' + seed + ':' + tier);
    const total = budget(tier);
    const start = startPoint || null;
    const points = rng.shuffle((spawnPoints || []).filter((p) => !start || dist(p, start) >= MIN_START_DIST));
    const out = [];
    let remaining = total;
    for (let i = 0; i < points.length; i++) {
      const affordable = pool.filter((id) => ENEMIES[id].cost <= remaining);
      if (!affordable.length) break;
      const def = ENEMIES[rng.pick(affordable)];
      let elite = false;
      if (def.cost * ELITE_COST_MULT <= remaining && rng.next() < eliteChance(tier)) elite = true;
      const cost = elite ? def.cost * ELITE_COST_MULT : def.cost;
      remaining -= cost;
      const hp = elite ? def.hp * ELITE_HP_MULT : def.hp;
      out.push({ id: def.id, x: points[i].x, y: points[i].y, hp, maxHp: hp, cost, elite, crown: elite });
    }
    return { budget: total, spent: total - remaining, enemies: out };
  }

  // Spawn specs produced when an enemy dies (Sprout splits into 2 minis at its position).
  function onDeath(enemy) {
    const def = ENEMIES[enemy.id];
    if (!def || !def.splitsInto) return [];
    const s = def.splitsInto, m = MINIONS[s.id], res = [];
    for (let i = 0; i < s.count; i++) {
      res.push({ id: m.id, x: enemy.x + (i ? 0.5 : -0.5), y: enemy.y, hp: s.hp, maxHp: s.hp, cost: 0, elite: false, crown: false });
    }
    return res;
  }

  return { ENEMIES, MINIONS, IDS, ELITE_HP_MULT, ELITE_COST_MULT, MIN_START_DIST, budget, eliteChance, plan, onDeath };
}));
