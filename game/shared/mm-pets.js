// MMPets: pet eggs, hatching, following, Mend, feeding, save-safe serialisation.
// Design rules (REALM-DESIGN s12): pets never die, get hurt or sad; no decay, hunger or absence timers.
// Positions are in tiles. All functions are pure/deterministic given the rng passed in.
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.MMPets = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  const FOLLOW_DIST = 1.5;
  const FOLLOW_RATE = 6;                 // smoothing, 1/s
  const RARITIES = ['common', 'uncommon', 'rare', 'legendary', 'mythic'];
  const LEVEL_CAP = { common: 30, uncommon: 50, rare: 70, legendary: 90, mythic: 100 };
  const POWER_PER_LEVEL = 20;
  const FEED = { potion: 60, relic: 200, t0: 5, perTier: 5 };
  // Animal species from game/species-registry.json (biome wetland/freshwater) with registry rarity.
  const POOLS = {
    fogfen: [['trout', 'common'], ['crab', 'common'], ['frog', 'common'], ['heron', 'common'],
             ['dragonfly', 'common'], ['otter', 'uncommon'], ['beaver', 'common'], ['catfish', 'common']],
  };
  POOLS.wetland = POOLS.fogfen; POOLS.freshwater = POOLS.fogfen;

  const num = (v, d, lo, hi) => { v = Number(v); if (!isFinite(v)) return d; return Math.min(hi, Math.max(lo, v)); };
  const rand = (rng) => { const r = typeof rng === 'function' ? Number(rng()) : Math.random(); return isFinite(r) ? Math.min(0.999999, Math.max(0, r)) : 0; };
  const maxPower = (rarity) => (LEVEL_CAP[rarity] - 1) * POWER_PER_LEVEL;
  const levelOf = (pet) => Math.min(LEVEL_CAP[pet.rarity] || 30, 1 + Math.floor(pet.power / POWER_PER_LEVEL));

  function hatch(egg, rng) {
    const b = egg && typeof egg.biome === 'string' ? egg.biome.toLowerCase() : 'fogfen';
    const pool = POOLS[b] || POOLS.fogfen;
    // registry rarity biases the roll: common entries weigh 3, uncommon 1
    const w = pool.map((p) => (p[1] === 'common' ? 3 : 1));
    let t = rand(rng) * w.reduce((a, c) => a + c, 0), i = 0;
    while (i < pool.length - 1 && t >= w[i]) { t -= w[i]; i++; }
    return create(pool[i][0], pool[i][1]);
  }

  function create(species, rarity) {
    return clean({ species: species, rarity: rarity, power: 0, x: 0, y: 0 });
  }

  function clean(p) {
    p = p && typeof p === 'object' ? p : {};
    const rarity = RARITIES.indexOf(p.rarity) >= 0 ? p.rarity : 'common';
    const species = typeof p.species === 'string' && /^[a-z0-9_]{1,40}$/.test(p.species) ? p.species : 'frog';
    const out = {
      species: species, rarity: rarity,
      power: Math.floor(num(p.power, 0, 0, maxPower(rarity))),
      x: num(p.x, 0, -1e6, 1e6), y: num(p.y, 0, -1e6, 1e6),
      level: 1,
    };
    out.level = levelOf(out);
    return out;
  }

  function follow(pet, owner, dt) {
    if (!pet || !owner) return pet;
    dt = num(dt, 0, 0, 1e6);
    const dx = pet.x - owner.x, dy = pet.y - owner.y;
    const d = Math.sqrt(dx * dx + dy * dy);
    if (d === 0) { pet.x = owner.x - FOLLOW_DIST; return pet; }   // stacked: step aside
    if (d <= FOLLOW_DIST) return pet;                              // close enough: stay put
    const step = (d - FOLLOW_DIST) * Math.min(1, FOLLOW_RATE * dt); // fraction <= 1 of the gap: no overshoot
    pet.x -= (dx / d) * step; pet.y -= (dy / d) * step;
    return pet;
  }

  function mend(pet, owner) {
    if (!pet || !owner) return 0;
    const maxHp = isFinite(owner.maxHp) ? owner.maxHp : Infinity;
    const before = num(owner.hp, 0, 0, 1e9);
    owner.hp = Math.min(maxHp, before + 5 + levelOf(pet));
    return owner.hp - before;
  }

  function feed(pet, item) {
    if (!pet || !item || typeof item !== 'object') return { ok: false, added: 0 };
    let amt = 0;
    const tier = Number(item.tier);
    if (item.kind === 'potion') amt = FEED.potion;
    else if (item.kind === 'relic') amt = FEED.relic;
    else if (isFinite(tier) && tier >= 0) amt = FEED.t0 + FEED.perTier * Math.floor(tier);
    if (amt <= 0) return { ok: false, added: 0 };
    const added = Math.max(0, Math.min(amt, maxPower(pet.rarity) - pet.power));
    pet.power += added; pet.level = levelOf(pet);
    return { ok: true, added: added, capped: added < amt, level: pet.level };
  }

  function serialize(pet) {
    const c = clean(pet);
    return JSON.stringify([c.species, c.rarity, c.power, Math.round(c.x * 1000) / 1000, Math.round(c.y * 1000) / 1000]);
  }
  function deserialize(str) {
    let a; try { a = JSON.parse(str); } catch (e) { a = null; }
    if (!Array.isArray(a)) return clean(null);
    return clean({ species: a[0], rarity: a[1], power: a[2], x: a[3], y: a[4] });
  }

  return { FOLLOW_DIST, LEVEL_CAP, POOLS, hatch, create, follow, mend, feed, levelOf, clean, serialize, deserialize };
});
