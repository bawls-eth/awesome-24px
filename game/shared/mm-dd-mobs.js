// MMDDMobs: Deepdelve cave creatures. Pure, deterministic (seeded MMRng only, no ambient randomness), no DOM.
//   chunkSpawns(seed, cx, cy, cz)  -> candidate list for one chunk (0..2 entries), stable for the same seed + chunk
//   select(cands, ctx)             -> which candidates to bring to life now (distance band, not slain, not active, cap)
//   knockback / meleeDamage / batMove / deathKeep / shouldCull  small rule helpers
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./rng.js'));
  else root.MMDDMobs = factory(root.MMRng);
})(typeof self !== 'undefined' ? self : this, function (Rng) {
  const MAX_ACTIVE = 8, CULL_DIST = 40, SPAWN_MIN = 9, SPAWN_MAX = 28, SIZE = 16;
  const KINDS = {
    crawler: { id: 'crawler', hp: 3, speed: 1.3, dmg: 1, half: 0.35, h: 0.5, flies: false, aggro: 12 },
    bat: { id: 'bat', hp: 1, speed: 3.2, dmg: 1, half: 0.25, h: 0.35, flies: true, aggro: 14 },
  };
  const MELEE = [1, 1, 2, 3]; // damage by pick tier (wood, stone, iron, gold)
  const meleeDamage = (tier) => MELEE[Math.max(0, Math.min(3, tier | 0))];
  // Up to two candidates per chunk, ~half of all chunks have none. local coords 1..14 keep them off chunk seams.
  function chunkSpawns(seed, cx, cy, cz) {
    const rng = Rng.create('dd-mob:' + seed + ':' + cx + ',' + cy + ',' + cz);
    const n = rng.next() < 0.5 ? 0 : (rng.next() < 0.3 ? 2 : 1);
    const out = [];
    for (let i = 0; i < n; i++) {
      const kind = rng.next() < 0.6 ? 'crawler' : 'bat';
      out.push({ id: cx + ',' + cy + ',' + cz + '#' + i, kind, wx: cx * SIZE + rng.int(1, 14), wy: cy * SIZE + rng.int(1, 14), wz: cz * SIZE + rng.int(1, 14), phase: rng.next() * Math.PI * 2 });
    }
    return out;
  }
  // cands carry world cell coords; ctx = { px, py, pz (player cell), active: count, activeIds: Set|[], slain: Set|[], cap }
  function select(cands, ctx) {
    const act = new Set(ctx.activeIds || []), slain = new Set(ctx.slain || []);
    const room = Math.max(0, (ctx.cap || MAX_ACTIVE) - (ctx.active | 0));
    if (!room) return [];
    const scored = [];
    for (const c of cands) {
      if (act.has(c.id) || slain.has(c.id)) continue;
      const d = Math.hypot(c.wx - ctx.px, c.wy - ctx.py, c.wz - ctx.pz);
      if (d < SPAWN_MIN || d > SPAWN_MAX) continue;
      scored.push({ c, d });
    }
    scored.sort((a, b) => a.d - b.d || (a.c.id < b.c.id ? -1 : 1));
    return scored.slice(0, room).map((s) => s.c);
  }
  const shouldCull = (dist) => dist > CULL_DIST;
  // Horizontal push away from the player plus a small hop. (dx, dz) = mob minus player.
  function knockback(dx, dz, strength) {
    const h = Math.hypot(dx, dz) || 1;
    return { vx: dx / h * strength, vz: dz / h * strength, vy: 3.5 };
  }
  // Seeded flutter: velocity toward the player (dx,dy,dz = player minus bat) with a sideways wobble from phase and age.
  function batMove(phase, age, dx, dy, dz, speed) {
    const d = Math.hypot(dx, dy, dz) || 1;
    const w = Math.sin(age * 5 + phase) * 0.9, w2 = Math.cos(age * 3.3 + phase * 2) * 0.5;
    return { vx: dx / d * speed - dz / d * w * speed * 0.5, vy: dy / d * speed * 0.7 + w2, vz: dz / d * speed + dx / d * w * speed * 0.5 };
  }
  // Inventory-keep rule on a creature death: keep everything (picks, ores, ingots, torches, tools); lose half of the
  // cheap loose blocks (dirt, stone), rounded down. Returns { inv: newInv, lost: { item: n } }; never mutates the input.
  const LOSE_HALF = ['dirt', 'stone'];
  function deathKeep(inv) {
    const out = Object.assign({}, inv), lost = {};
    for (const k of LOSE_HALF) {
      const n = (inv[k] | 0), l = Math.floor(n / 2);
      if (l > 0) { out[k] = n - l; lost[k] = l; }
    }
    return { inv: out, lost };
  }
  return { MAX_ACTIVE, CULL_DIST, SPAWN_MIN, SPAWN_MAX, KINDS, MELEE, meleeDamage, chunkSpawns, select, shouldCull, knockback, batMove, deathKeep };
});
