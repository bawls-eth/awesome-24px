// MMZones: pure, deterministic zone engine for the unified Realm: spawn/despawn with interest culling, enemy stat scaling,
// drop tables, zone info for the minimap/HUD, and scheduled world events. See game/design/REALM-UNIFIED-DESIGN.md.
// UMD: browser global MMZones, or require(). No DOM, no clock, no unseeded randomness: every roll comes from MMRng (shared/rng.js)
// streams seeded from strings, so same seed + same inputs (+ same visit order for the spawner) => identical output.
// Units: world positions handed to the spawner are PIXELS (tile = TABLES.TILE = 32 px). Generator coordinates (spawnGroups, bossSites,
// zoneInfoAt) are TILES. Output enemy x/y are pixels.
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./rng.js'));
  else root.MMZones = factory(root.MMRng);
}(typeof self !== 'undefined' ? self : this, function (MMRng) {
  'use strict';
  const VERSION = 1;

  // ================= TABLES: every tunable number lives here =================
  // Indexed by zone 0..3 = shore, midlands, highlands, godlands (MMOverworld.ZONES).
  const TABLES = {
    TILE: 32,                 // px per world tile
    ACTIVATE_RADIUS: 1500,    // px: a group activates when its centre is within this of the player (~1.5 screens)
    DEACTIVATE_MUL: 2.5,      // a group despawns beyond ACTIVATE_RADIUS * this (hysteresis band between 1x and 2.5x)
    MAX_ACTIVE: 60,           // hard cap on simultaneously active enemies
    COMBAT_GRACE: 10,         // s: markCombat(id) keeps that enemy's group alive (no distance despawn) this long
    SPREAD_PX: 48,            // enemies of a group scatter within this radius of the group centre
    MAX_GROUP: 8,             // enemy ids encode the in-group slot in 3 bits
    ZONES: [
      // recLv: the recommended hero level the border toast names (realm-world.js zone gradient, PLAYTEST-REVIEW-2 #1)
      { id: 0, name: 'Shore', color: '#e8d7a1', danger: 'Safe-ish', respawn: 60, recLv: 1 },
      { id: 1, name: 'Midlands', color: '#6fbf5a', danger: 'Dangerous', respawn: 90, recLv: 5 },
      { id: 2, name: 'Highlands', color: '#8d7ab8', danger: 'Deadly', respawn: 120, recLv: 10 },
      { id: 3, name: 'Godlands', color: '#c0392b', danger: 'Lethal', respawn: 180, recLv: 15 },
    ],
    VOID: { id: 255, name: 'The Deep', color: '#0b1a33', danger: 'None' },
    // ---- world fire budget (PLAYTEST-REVIEW-2 #2, realm-world.js -> realm.js fireBudget; ?firebudget=0 = off) ----
    EB_CAP: [40, 80, 140, 200],  // live enemy bullets allowed while the player stands in zone 0..3 (a full cap holds new bolts back)
    EB_TRAVEL: 0.6,           // an enemy bolt flies at most this x the view's long side (its lifetime is cut to match)
    // enemy stat multipliers = ZONE_MUL[zone] * TIER_MUL[tier]; hp/speed/dmg scale like realm.js waves (wave 1 -> ~15)
    ZONE_MUL: {
      hp:    [1.0, 1.8, 3.2, 5.5],
      speed: [1.0, 1.08, 1.16, 1.25],
      dmg:   [1.0, 1.3, 1.7, 2.2],
      xp:    [1.0, 2.0, 4.0, 8.0],
      shard: [1.0, 2.0, 4.0, 8.0],
    },
    TIER_MUL: { hp: [1.0, 1.1, 1.25, 1.5], speed: [1.0, 1.0, 1.03, 1.06], dmg: [1.0, 1.05, 1.15, 1.3], xp: [1, 1.1, 1.25, 1.5], shard: [1, 1, 1.1, 1.25] },
    HP_JITTER: 0.1,           // +-5% per-enemy hp variation (seeded)
    ELITE: { hp: 3, xp: 3, shard: 2 }, // rare elite group (g.elite, e.g. giant_spider_queen): one creature, hp/xp/shard on top of the zone mults
    BOSS: { hp: 12, dmg: 1.4, xp: 12, shard: 13, cooldown: [0, 600, 900, 1200] }, // extra mults on top of zone mults; respawn s by zone
    // ---- drops ----
    BAG_TIERS: ['brown', 'pink', 'purple', 'cyan', 'white', 'gold'],
    BAG_LIFETIME: [60, 60, 90, 90, 120, 180],       // s before the bag despawns, by bag tier
    BAG_ITEMS: [[0, 1], [1, 1], [1, 2], [1, 2], [2, 3], [2, 3]],   // [min,max] items per bag tier
    BAG_POTIONS: [[0, 2], [0, 2], [0, 1], [0, 1], [0, 1], [0, 1]], // [min,max] potions per bag tier
    DROP_CHANCE: [0.22, 0.28, 0.34, 0.40],          // per enemy kill, by zone (caller rolls; bosses always drop: see dropChance)
    // bag tier weights [brown,pink,purple,cyan,white,gold] by zone; normal enemies / bosses
    BAG_WEIGHTS: [[0.90, 0.09, 0.01, 0, 0, 0], [0.70, 0.22, 0.07, 0.01, 0, 0], [0.50, 0.28, 0.15, 0.06, 0.01, 0], [0.30, 0.28, 0.24, 0.12, 0.05, 0.01]],
    BOSS_BAG_WEIGHTS: [[0.30, 0.40, 0.20, 0.10, 0, 0], [0.10, 0.30, 0.35, 0.20, 0.05, 0], [0, 0.10, 0.30, 0.35, 0.20, 0.05], [0, 0, 0.10, 0.30, 0.40, 0.20]],
    // ID-13 (cycle 2 D): the bag tier floor for the FIRST boss kill in each zone (pink, pink, purple, cyan). Applied only when rollDrop gets info.firstKill === true
    // (nothing passes it yet: S wires it with a per-zone first-kill flag in the Realm save). It raises a low roll, never lowers one: it lifts 30% / 10% / 10% / 10% of first boss bags.
    FIRST_KILL_BAG_FLOOR: [1, 1, 2, 3],
    // rarity weights [common,uncommon,rare,epic] by zone. Epic only appears in BOSS_RARITY_WEIGHTS[3] (godlands bosses).
    RARITY_WEIGHTS: [[0.85, 0.14, 0.01, 0], [0.60, 0.32, 0.08, 0], [0.35, 0.40, 0.25, 0], [0.15, 0.35, 0.50, 0]],
    BOSS_RARITY_WEIGHTS: [[0.60, 0.33, 0.07, 0], [0.35, 0.45, 0.20, 0], [0.15, 0.40, 0.45, 0], [0.05, 0.25, 0.58, 0.12]],
    RARITY_BIAS_PER_BAG_TIER: 0.06,                  // higher bag tiers push the rarity roll upward (rarityBias = tier * this)
    RARITIES: ['common', 'uncommon', 'rare', 'epic'], // realm.js RM_RARITIES ids; index = save rarity index
    ITEM_IDS: ['sparkwand', 'quickwand', 'heartcharm', 'swiftcharm', 'luckring', 'scholarring', 'wardring'], // realm.js RM_ITEMS
    SHARD_BASE: 3, SHARD_JITTER: 0.5,                // shards = round(base * zone shard mul * (1 +- jitter/2) [* boss mul])
    // ---- events ----
    EVENT_PERIOD: 300,        // s: one scheduling slot; one event per region (zones 1..3) per slot at most
    EVENT_DURATION: 120,      // s an event stays active
    EVENT_CHANCE: [0, 0.6, 0.5, 0.4], // chance per region per slot
    EVENT_REGIONS: [1, 2, 3],
    // ---- live events (eventPlan / eventTier / eventReward) ----
    EVENT_KINDS: ['boss', 'swarm'],  // a raid boss from the region's boss list, or a swarm wave of the region's creatures
    EVENT_SWARM_CHANCE: 0.5,  // chance an event is a swarm (else a boss raid), seeded per event id
    EVENT_SWARM_COUNT: [0, 6, 8, 10], // swarm size by region
    EVENT_SWARM_HP: 1.4,      // swarm creatures are sturdier than the wild ones
    EVENT_SWARM_SPREAD: 120,  // px: the swarm appears within this radius of the site centre
    EVENT_SPAWN_RADIUS: 14,   // tiles: an active event spawns once the player is this close to its site
    EVENT_LEASH: 40,          // tiles: walking further away makes the event's creatures rest (they come back when you return)
    EVENT_ANNOUNCE: 20,       // s before the start: banner + HUD ping
    EVENT_TIERS: ['none', 'participate', 'contribute', 'hero'],
    EVENT_THRESH: [0.01, 0.25, 0.6], // share of the event's total hp dealt by the player for participate / contribute / hero
    EVENT_MIN_BAG: [1, 2, 3],        // guaranteed bag tier index floor (pink / purple / cyan) per reward tier, +1 per region above 1 (max gold)
    EVENT_FAME: [10, 25, 50],        // x region
    EVENT_SHARDS: [10, 25, 50],      // x region
  };
  const T = TABLES;
  const EVENT_PERIOD = T.EVENT_PERIOD;

  function clampZone(z) { return z === 0 || z === 1 || z === 2 || z === 3 ? z : (z > 3 && z < 255 ? 3 : 0); }
  function clampTier(t) { t = t | 0; return t < 0 ? 0 : t > 3 ? 3 : t; }

  // multipliers for an enemy of zone z and tier t (tier normally equals zone for generated groups)
  function statMultipliers(zone, tier, boss) {
    const z = clampZone(zone), t = clampTier(tier === undefined ? z : tier);
    const m = {
      hpMul: T.ZONE_MUL.hp[z] * T.TIER_MUL.hp[t], speedMul: T.ZONE_MUL.speed[z] * T.TIER_MUL.speed[t], dmgMul: T.ZONE_MUL.dmg[z] * T.TIER_MUL.dmg[t],
      xpMul: T.ZONE_MUL.xp[z] * T.TIER_MUL.xp[t], shardMul: T.ZONE_MUL.shard[z] * T.TIER_MUL.shard[t],
    };
    if (boss) { m.hpMul *= T.BOSS.hp; m.dmgMul *= T.BOSS.dmg; m.xpMul *= T.BOSS.xp; m.shardMul *= T.BOSS.shard; }
    return m;
  }

  // ================= (1) spawner with interest culling =================
  // Enemy id layout (integers, unique per life): id = ((respawnCount * G + groupIndex) << 3) | slot, G = number of groups.
  // Allocation notes: update() reuses one result object and two arrays (valid until the next update call, copy if you keep them),
  // scratch typed arrays are allocated once in createSpawner. Only enemy spawn records (+ one RNG stream per activated group) allocate.
  function createSpawner(world, opts) {
    opts = opts || {};
    const tile = opts.tile || T.TILE;
    const R = opts.radius || T.ACTIVATE_RADIUS;
    const R2 = R * R, DR = R * (opts.deactivateMul || T.DEACTIVATE_MUL), DR2 = DR * DR;
    const cap = opts.cap === undefined ? T.MAX_ACTIVE : opts.cap;
    const grace = opts.combatGrace === undefined ? T.COMBAT_GRACE : opts.combatGrace;
    const seed = String(world.seed === undefined ? '' : world.seed);
    const groups = world.spawnGroups || [];
    const G = groups.length;

    const gx = new Float64Array(G), gy = new Float64Array(G);
    const state = new Uint8Array(G);              // 0 ready, 1 active, 2 cooling (dead, waiting for respawnAt)
    const alive = new Uint8Array(G);              // bitmask of living slots
    const respawnAt = new Float64Array(G);
    const combatUntil = new Float64Array(G);
    const rc = new Uint32Array(G);                // respawn count: bumps when a group is wiped out
    const activeList = new Int32Array(G); let activeN = 0;
    const cand = new Int32Array(G), candD = new Float64Array(G);
    let activeEnemies = 0, now = 0;

    // coarse grid (CSR) of group indices so a scan only touches cells near the player
    const CELL = 512;
    const cols = Math.max(1, Math.ceil((world.w || 256) * tile / CELL) + 1), rows = Math.max(1, Math.ceil((world.h || 256) * tile / CELL) + 1);
    const cellStart = new Int32Array(cols * rows + 1), cellItems = new Int32Array(G);
    const cellOf = function (px, py) { return Math.min(rows - 1, Math.max(0, Math.floor(py / CELL))) * cols + Math.min(cols - 1, Math.max(0, Math.floor(px / CELL))); };
    for (let i = 0; i < G; i++) { gx[i] = (groups[i].x + 0.5) * tile; gy[i] = (groups[i].y + 0.5) * tile; cellStart[cellOf(gx[i], gy[i]) + 1]++; }
    for (let c = 0; c < cols * rows; c++) cellStart[c + 1] += cellStart[c];
    const fill = new Int32Array(cols * rows);
    for (let i = 0; i < G; i++) { const c = cellOf(gx[i], gy[i]); cellItems[cellStart[c] + fill[c]++] = i; }

    const out = { spawn: [], despawn: [] };
    const bosses = Object.create(null);           // "x,y" -> tNow when the boss may be fought again

    function decode(id) {
      if (!(id >= 0) || id !== Math.floor(id) || G === 0) return null;
      const slot = id & 7, rest = (id - slot) / 8, gi = rest % G;
      return { gi: gi, slot: slot, rc: Math.floor(rest / G) };
    }
    function popcount(m) { let n = 0; while (m) { n += m & 1; m >>= 1; } return n; }
    function removeActive(gi) {
      for (let k = 0; k < activeN; k++) if (activeList[k] === gi) { activeList[k] = activeList[--activeN]; return; }
    }

    function activate(gi) {
      const g = groups[gi], r = rc[gi], rng = MMRng.create(seed + ':grp:' + gi + ':' + r);
      const n = Math.min(T.MAX_GROUP, Math.max(1, g.count | 0));
      const mul = statMultipliers(g.zone, g.tier, false);
      if (g.elite) { mul.hpMul *= T.ELITE.hp; mul.xpMul *= T.ELITE.xp; mul.shardMul *= T.ELITE.shard; }
      for (let k = 0; k < n; k++) {
        const a = rng.next() * Math.PI * 2, rad = Math.sqrt(rng.next()) * T.SPREAD_PX, j = 1 + (rng.next() - 0.5) * T.HP_JITTER;
        out.spawn.push({
          id: ((r * G + gi) << 3) | k, x: gx[gi] + Math.cos(a) * rad, y: gy[gi] + Math.sin(a) * rad, type: g.type, creature: g.creature, tier: g.tier, zone: g.zone, group: gi,
          hpMul: mul.hpMul * j, speedMul: mul.speedMul, dmgMul: mul.dmgMul, xpMul: mul.xpMul, shardMul: mul.shardMul,
        });
      }
      state[gi] = 1; alive[gi] = (1 << n) - 1; activeEnemies += n; activeList[activeN++] = gi;
    }

    const api = {
      groupCount: G,
      // Call every frame. Returns the shared {spawn:[...], despawn:[ids]} (arrays are reused: read them before the next update).
      update: function (playerX, playerY, dt, tNow) {
        now = tNow; out.spawn.length = 0; out.despawn.length = 0;
        if (!(playerX === playerX) || !(playerY === playerY)) return out;
        // 1. despawn far, non-combat groups
        for (let k = activeN - 1; k >= 0; k--) {
          const gi = activeList[k], dx = gx[gi] - playerX, dy = gy[gi] - playerY;
          if (dx * dx + dy * dy > DR2 && now >= combatUntil[gi]) {
            const m = alive[gi];
            for (let s = 0; s < 8; s++) if (m & (1 << s)) out.despawn.push(((rc[gi] * G + gi) << 3) | s);
            activeEnemies -= popcount(m); alive[gi] = 0; state[gi] = 0;
            activeList[k] = activeList[--activeN];
          }
        }
        // 2. gather ready groups inside the activation radius via the grid, nearest first
        let nc = 0;
        const c0 = Math.max(0, Math.floor((playerX - R) / CELL)), c1 = Math.min(cols - 1, Math.floor((playerX + R) / CELL));
        const r0 = Math.max(0, Math.floor((playerY - R) / CELL)), r1 = Math.min(rows - 1, Math.floor((playerY + R) / CELL));
        for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) {
          const cell = r * cols + c;
          for (let q = cellStart[cell]; q < cellStart[cell + 1]; q++) {
            const gi = cellItems[q], st = state[gi];
            if (st === 1 || (st === 2 && now < respawnAt[gi])) continue;
            const dx = gx[gi] - playerX, dy = gy[gi] - playerY, d2 = dx * dx + dy * dy;
            if (d2 > R2) continue;
            let p = nc++;                                    // insertion sort by (distance, index)
            while (p > 0 && (candD[p - 1] > d2 || (candD[p - 1] === d2 && cand[p - 1] > gi))) { cand[p] = cand[p - 1]; candD[p] = candD[p - 1]; p--; }
            cand[p] = gi; candD[p] = d2;
          }
        }
        // 3. activate nearest first; stop at the first group that would break the cap (strictly nearest-preferred)
        for (let k = 0; k < nc; k++) {
          const gi = cand[k];
          if (activeEnemies + Math.min(T.MAX_GROUP, Math.max(1, groups[gi].count | 0)) > cap) break;
          activate(gi);
        }
        return out;
      },
      // An enemy died. Returns {group, zone, tier, type, creature, cleared} (cleared = whole group dead, respawn timer started) or null.
      markDead: function (id, tNow) {
        const d = decode(id);
        if (!d || d.rc !== rc[d.gi] || state[d.gi] !== 1 || !(alive[d.gi] & (1 << d.slot))) return null;
        const gi = d.gi, g = groups[gi];
        alive[gi] &= ~(1 << d.slot); activeEnemies--;
        let cleared = false;
        if (alive[gi] === 0) {
          cleared = true; state[gi] = 2; rc[gi]++; removeActive(gi);
          respawnAt[gi] = (tNow === undefined ? now : tNow) + T.ZONES[clampZone(g.zone)].respawn;
        }
        return { group: gi, zone: g.zone, tier: g.tier, type: g.type, creature: g.creature, cleared: cleared };
      },
      // Flag an enemy as in combat: its group will not distance-despawn for COMBAT_GRACE seconds (of the last update's clock).
      markCombat: function (id) {
        const d = decode(id);
        if (d && d.rc === rc[d.gi] && state[d.gi] === 1) combatUntil[d.gi] = now + grace;
      },
      activeEnemyCount: function () { return activeEnemies; },
      activeGroupCount: function () { return activeN; },
      isGroupActive: function (gi) { return state[gi] === 1; },
      respawnCount: function (gi) { return rc[gi]; },
      respawnAtOf: function (gi) { return state[gi] === 2 ? respawnAt[gi] : 0; },
      // R4 D1 (quiet-stretch pity): the cooling group nearest to (px, py) inside the activation radius respawns at the next update.
      // Returns its index, or -1 when none is cooling there. Pure: only the group's respawn time changes.
      hurry: function (px, py) {
        let best = -1, bd = R2;
        for (let gi = 0; gi < G; gi++) { if (state[gi] !== 2) continue; const dx = gx[gi] - px, dy = gy[gi] - py, d2 = dx * dx + dy * dy; if (d2 <= bd) { bd = d2; best = gi; } }
        if (best >= 0) respawnAt[best] = Math.min(respawnAt[best], now);
        return best;
      },
      // ---- boss sites as events: ready when never killed or the zone cooldown elapsed ----
      bossReady: function (site, tNow) { const t = bosses[site.x + ',' + site.y]; return t === undefined || tNow >= t; },
      bossDefeated: function (site, tNow) { bosses[site.x + ',' + site.y] = tNow + T.BOSS.cooldown[clampZone(site.zone)]; },
      bossEnemy: function (site) { return bossEnemy(site, tile); },
    };
    return api;
  }

  // enemy record for a boss site (zone-scaled, with BOSS extra multipliers)
  function bossEnemy(site, tile) {
    const tl = tile || T.TILE, m = statMultipliers(site.zone, site.zone, true);
    return { id: -1, x: (site.x + 0.5) * tl, y: (site.y + 0.5) * tl, type: 'boss', creature: site.boss, tier: site.zone, zone: site.zone, boss: true,
      hpMul: m.hpMul, speedMul: m.speedMul, dmgMul: m.dmgMul, xpMul: m.xpMul, shardMul: m.shardMul };
  }

  // ================= (2) drop tables =================
  function weighted(rng, w) {
    let tot = 0; for (let i = 0; i < w.length; i++) tot += w[i];
    let r = rng.next() * tot;
    for (let i = 0; i < w.length; i++) { r -= w[i]; if (r < 0 && w[i] > 0) return i; }
    for (let i = w.length - 1; i >= 0; i--) if (w[i] > 0) return i;
    return 0;
  }
  function dropChance(info) { return info && info.boss ? 1 : T.DROP_CHANCE[clampZone(info && info.zone)]; }

  // One bag roll. info: {zone, tier?, boss?, shardMul?}. rngSeed: any string/number. ctx (optional): {luck: 0..1 extra rarity bias}.
  function rollDrop(info, rngSeed, ctx) {
    info = info || {}; ctx = ctx || {};
    const z = clampZone(info.zone), boss = !!info.boss;
    const rng = MMRng.create('drop:' + rngSeed);
    let tierIdx = weighted(rng, boss ? T.BOSS_BAG_WEIGHTS[z] : T.BAG_WEIGHTS[z]); // one rng draw, as ever: the floor below never changes the stream
    if (boss && info.firstKill === true) tierIdx = Math.max(tierIdx, T.FIRST_KILL_BAG_FLOOR[z]); // ID-13: a first boss kill in a zone is never under the floor
    const rarityBias = Math.min(0.6, tierIdx * T.RARITY_BIAS_PER_BAG_TIER + Math.max(0, Math.min(0.3, +ctx.luck || 0)));
    const rw = boss ? T.BOSS_RARITY_WEIGHTS[z] : T.RARITY_WEIGHTS[z];
    const epicOk = boss && z === 3;
    const items = [];
    const ic = T.BAG_ITEMS[tierIdx], nItems = rng.int(ic[0], ic[1]);
    for (let k = 0; k < nItems; k++) {
      const id = T.ITEM_IDS[rng.int(0, T.ITEM_IDS.length - 1)];
      const u = 1 - (1 - rng.next()) * (1 - rarityBias);   // bias pushes the roll toward the rare end
      let tot = 0; for (let i = 0; i < 4; i++) tot += rw[i];
      let acc = 0, r = 0;
      for (let i = 0; i < 4; i++) { acc += rw[i] / tot; if (u < acc) { r = i; break; } r = i; }
      if (r === 3 && !epicOk) r = 2;
      items.push({ id: id, rarity: T.RARITIES[r], r: r });
    }
    const pc = T.BAG_POTIONS[tierIdx], potions = rng.int(pc[0], pc[1]);
    const sm = info.shardMul > 0 ? info.shardMul : T.ZONE_MUL.shard[z] * (boss ? T.BOSS.shard : 1);
    const shards = Math.max(0, Math.round(T.SHARD_BASE * sm * (1 + (rng.next() - 0.5) * T.SHARD_JITTER)));
    return { bag: { tier: T.BAG_TIERS[tierIdx], tierIndex: tierIdx, rarityBias: rarityBias, items: items, shards: shards, potions: potions, lifetime: T.BAG_LIFETIME[tierIdx] } };
  }
  // 'Soulbound' co-op drops: one independent, deterministic roll per player; only that player may pick the bag up.
  function rollDropForPlayers(info, rngSeed, playerIds) {
    const out = [];
    for (let i = 0; i < playerIds.length; i++) {
      const d = rollDrop(info, rngSeed + ':p:' + playerIds[i]);
      d.bag.soulbound = true; d.bag.owner = playerIds[i];
      out.push({ playerId: playerIds[i], bag: d.bag });
    }
    return out;
  }

  // ================= (3) zone info + events =================
  // x,y in TILES (same as MMOverworld.zoneAt). Out of bounds reads as the void.
  function zoneInfoAt(world, x, y) {
    x = Math.floor(x); y = Math.floor(y);
    if (!(x >= 0 && y >= 0 && x < world.w && y < world.h)) return { zone: 255, name: T.VOID.name, difficulty: 0, color: T.VOID.color, danger: T.VOID.danger };
    const i = y * world.w + x, zid = clampZone(world.zone[i]), Z = T.ZONES[zid];
    return { zone: zid, name: Z.name, difficulty: world.difficulty[i] / 255, color: Z.color, danger: Z.danger };
  }
  // Scheduled events for the slot containing tNow (stub: boss-at-site events only). Per region (zones 1..3) at most one event per
  // slot, and start+duration never crosses the slot end, so two events never overlap in a region. Returns events that are 'upcoming'
  // (countdown = seconds to start) or 'active' (countdown = seconds left); past events are omitted. Allocates a new array: call at low rate.
  function eventsFor(world, tNow) {
    const slot = Math.floor(tNow / EVENT_PERIOD), slotStart = slot * EVENT_PERIOD, out = [];
    const sites = world.bossSites || [];
    for (let ri = 0; ri < T.EVENT_REGIONS.length; ri++) {
      const region = T.EVENT_REGIONS[ri];
      const list = [];
      for (let s = 0; s < sites.length; s++) if (sites[s].zone === region) list.push(s);
      if (!list.length) continue;
      const rng = MMRng.create(world.seed + ':event:' + slot + ':' + region);
      if (rng.next() >= T.EVENT_CHANCE[region]) continue;
      const site = sites[list[rng.int(0, list.length - 1)]];
      const startsAt = slotStart + rng.int(0, EVENT_PERIOD - T.EVENT_DURATION), endsAt = startsAt + T.EVENT_DURATION;
      if (tNow >= endsAt) continue;
      const active = tNow >= startsAt;
      out.push({ id: 'ev:' + slot + ':' + region, kind: 'boss', region: region, slot: slot, boss: site.boss, x: site.x, y: site.y,
        startsAt: startsAt, endsAt: endsAt, active: active, countdown: active ? endsAt - tNow : startsAt - tNow });
    }
    return out;
  }

  // What an event (from eventsFor) runs: its kind, the site it happens at (the region's event_site structure nearest the event's boss
  // site; the boss site itself when the region has none), and for a swarm the seeded creature list (pixel positions around the site).
  function eventPlan(world, ev) {
    const region = clampZone(ev.region), rng = MMRng.create(world.seed + ':evplan:' + ev.id);
    const kind = rng.next() < T.EVENT_SWARM_CHANCE ? 'swarm' : 'boss';
    let site = { x: ev.x, y: ev.y }, best = Infinity;
    const st = world.structures || [];
    for (let i = 0; i < st.length; i++) {
      const s = st[i]; if (s.kind !== 'event_site' || s.zone !== region) continue;
      const d = (s.x - ev.x) * (s.x - ev.x) + (s.y - ev.y) * (s.y - ev.y);
      if (d < best) { best = d; site = { x: s.x, y: s.y }; }
    }
    const plan = { id: ev.id, kind: kind, region: region, boss: ev.boss, site: site, swarm: [] };
    if (kind === 'swarm') {
      const groups = []; const sg = world.spawnGroups || [];
      for (let i = 0; i < sg.length; i++) if (sg[i].zone === region) groups.push(sg[i]);
      const mul = statMultipliers(region, region, false), tile = T.TILE;
      const cx = (site.x + 0.5) * tile, cy = (site.y + 0.5) * tile, n = T.EVENT_SWARM_COUNT[region];
      for (let k = 0; k < n && groups.length; k++) {
        const g = groups[rng.int(0, groups.length - 1)], a = (k / n) * Math.PI * 2 + rng.next() * 0.5, rad = T.EVENT_SWARM_SPREAD * (0.45 + 0.55 * rng.next());
        plan.swarm.push({ type: g.type, creature: g.creature, tier: region, zone: region, x: cx + Math.cos(a) * rad, y: cy + Math.sin(a) * rad,
          hpMul: mul.hpMul * T.EVENT_SWARM_HP, speedMul: mul.speedMul, dmgMul: mul.dmgMul, xpMul: mul.xpMul, shardMul: mul.shardMul });
      }
      if (!plan.swarm.length) plan.kind = 'boss'; // a region with no creatures at all falls back to a raid
    }
    return plan;
  }
  // Reward tier from the player's damage share: 0 none, 1 participate, 2 contribute, 3 hero (TABLES.EVENT_THRESH).
  function eventTier(dealt, total) {
    const f = total > 0 && dealt > 0 ? Math.min(1, dealt / total) : 0;
    let t = 0; for (let i = 0; i < T.EVENT_THRESH.length; i++) if (f >= T.EVENT_THRESH[i]) t = i + 1;
    return t;
  }
  // The success reward for reward tier 1..3 (null for 0): a guaranteed bag (>= 1 item, tier floored by EVENT_MIN_BAG), bonus shards
  // and fame. Seeded: same (event, tier, seed) => same reward.
  function eventReward(ev, tier, rngSeed) {
    tier = tier | 0; if (tier < 1 || tier > 3) return null;
    const z = clampZone(ev.region), rng = MMRng.create('evreward:' + rngSeed + ':' + tier);
    const floor = Math.min(T.BAG_TIERS.length - 1, T.EVENT_MIN_BAG[tier - 1] + Math.max(0, z - 1));
    const tierIdx = Math.min(T.BAG_TIERS.length - 1, floor + (rng.next() < 0.2 ? 1 : 0));
    const rw = T.BOSS_RARITY_WEIGHTS[z], bias = Math.min(0.6, tierIdx * T.RARITY_BIAS_PER_BAG_TIER), epicOk = z === 3;
    const ic = T.BAG_ITEMS[tierIdx], nItems = Math.max(1, rng.int(ic[0], ic[1])), items = [];
    let tot = 0; for (let i = 0; i < 4; i++) tot += rw[i];
    for (let k = 0; k < nItems; k++) {
      const id = T.ITEM_IDS[rng.int(0, T.ITEM_IDS.length - 1)], u = 1 - (1 - rng.next()) * (1 - bias);
      let acc = 0, r = 0;
      for (let i = 0; i < 4; i++) { acc += rw[i] / tot; if (u < acc) { r = i; break; } r = i; }
      if (r === 3 && !epicOk) r = 2;
      items.push({ id: id, rarity: T.RARITIES[r], r: r });
    }
    const pc = T.BAG_POTIONS[tierIdx];
    const bag = { tier: T.BAG_TIERS[tierIdx], tierIndex: tierIdx, rarityBias: bias, items: items, shards: 0, potions: rng.int(pc[0], pc[1]), lifetime: T.BAG_LIFETIME[tierIdx] };
    return { tier: tier, tierName: T.EVENT_TIERS[tier], bag: bag, shards: T.EVENT_SHARDS[tier - 1] * Math.max(1, z), fame: T.EVENT_FAME[tier - 1] * Math.max(1, z) };
  }

  return {
    VERSION: VERSION, TABLES: TABLES, EVENT_PERIOD: EVENT_PERIOD,
    createSpawner: createSpawner, statMultipliers: statMultipliers, bossEnemy: bossEnemy,
    rollDrop: rollDrop, rollDropForPlayers: rollDropForPlayers, dropChance: dropChance,
    zoneInfoAt: zoneInfoAt, eventsFor: eventsFor, eventPlan: eventPlan, eventTier: eventTier, eventReward: eventReward,
  };
}));
