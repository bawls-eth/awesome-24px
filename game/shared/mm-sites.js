// MMSites: pure, deterministic world sites for the unified Realm overworld: shrines, camps (chest + patrol) and NPC sites.
// UMD: browser global MMSites, or require(). No DOM, no clock, no unseeded randomness: every roll is an MMRng stream seeded from
// (seed, tag). Coordinates are TILES (same as MMOverworld). Time args are plain millisecond numbers supplied by the caller.
// See game/design/REALM-UNIFIED-DESIGN.md (section "World sites").
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./rng.js'), require('./mm-overworld.js'));
  else root.MMSites = factory(root.MMRng, root.MMOverworld);
}(typeof self !== 'undefined' ? self : this, function (MMRng, MMOverworld) {
  'use strict';
  const VERSION = 1;
  const WATER = [0, 1]; // deep_water, shallow_water terrain ids
  const MIN_SPACING = 14;      // tiles between any two sites
  const MIN_FROM_SPECIAL = 10; // tiles from portal / boss sites
  const MIN_FROM_SPAWN = 20;   // tiles from the spawn point
  const MIN_FROM_STRUCT = 5;   // tiles from generator structures (camps/shrines/ruins stamped by MMOverworld)
  const COOLDOWN_MS = 3 * 60 * 1000;
  const SHRINE_KINDS = ['heal', 'rage', 'ward'];
  // the 7 delivered b21 NPC ids (game/assets/arcane/b21-npcs-and-vendors/manifest.json, field "enemy")
  const NPC_IDS = ['npc_nexus_guide', 'npc_vendor', 'npc_healer', 'npc_quest_giver', 'npc_blacksmith', 'npc_wanderer', 'npc_ghost_guide'];
  // per zone [shore, midlands, highlands, godlands], for a 256x256 world; scaled by area
  const PLAN = { shrine: [1, 3, 3, 2], camp: [1, 3, 3, 2], npc: [1, 2, 2, 1] };
  // buff table: base value, per-zone step, hard clamp. Pure data, clamped on every read.
  const BUFFS = {
    heal: { stat: 'heal', unit: 'hpFrac', base: 0.4, perZone: 0.1, min: 0.25, max: 0.9, durationMs: 0 },
    rage: { stat: 'damage', unit: 'mult', base: 1.2, perZone: 0.05, min: 1.0, max: 1.5, durationMs: 60000 },
    ward: { stat: 'damageTaken', unit: 'mult', base: 0.8, perZone: -0.05, min: 0.5, max: 1.0, durationMs: 60000 },
  };
  // creature types come from MMOverworld.CREATURE_TIERS (spiral/aimed/ring -> art ids by zone tier)
  const PATROL_TYPES = ['spiral', 'aimed', 'ring'];
  const PATROL_COUNT = [[1, 2], [2, 3], [2, 4], [3, 4]];

  function num(v, d) { return typeof v === 'number' && isFinite(v) ? v : d; }
  function clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }
  function dist(ax, ay, bx, by) { const a = ax - bx, b = ay - by; return Math.sqrt(a * a + b * b); }
  function has(o, k) { return Object.prototype.hasOwnProperty.call(o, k); }
  function walkable(world, x, y) {
    if (!world || !world.terrain || !world.solid) return false;
    if (typeof x !== 'number' || typeof y !== 'number' || !isFinite(x) || !isFinite(y)) return false;
    x = Math.floor(x); y = Math.floor(y);
    if (x < 0 || y < 0 || x >= world.w || y >= world.h) return false;
    const i = y * world.w + x;
    return world.solid[i] === 0 && WATER.indexOf(world.terrain[i]) < 0;
  }
  function openArea(world, x, y) { // site tile plus 4 neighbours walkable
    return walkable(world, x, y) && walkable(world, x + 1, y) && walkable(world, x - 1, y) && walkable(world, x, y + 1) && walkable(world, x, y - 1);
  }

  // ---- shrine buffs and cooldown (pure) ----
  function buffFor(kind, zone) {
    if (typeof kind !== 'string' || !has(BUFFS, kind)) return null;
    const b = BUFFS[kind];
    const z = clamp(Math.floor(num(zone, 0)), 0, 3);
    const value = clamp(b.base + b.perZone * z, b.min, b.max);
    return { kind: kind, stat: b.stat, unit: b.unit, value: Math.round(value * 1000) / 1000, durationMs: b.durationMs };
  }
  // clamp an arbitrary (possibly tampered) buff back into the table range; null when the kind is unknown
  function clampBuff(buff) {
    if (!buff || typeof buff !== 'object' || typeof buff.kind !== 'string' || !has(BUFFS, buff.kind)) return null;
    const b = BUFFS[buff.kind];
    return { kind: buff.kind, stat: b.stat, unit: b.unit, value: clamp(num(buff.value, b.base), b.min, b.max), durationMs: b.durationMs };
  }
  // ms left on a shrine cooldown. lastUsedMs null/invalid => 0 (ready). A clock that went backwards is capped at the full cooldown.
  function cooldownLeft(lastUsedMs, nowMs) {
    if (typeof lastUsedMs !== 'number' || !isFinite(lastUsedMs) || lastUsedMs <= 0) return 0;
    const now = num(nowMs, NaN);
    if (!isFinite(now)) return COOLDOWN_MS;
    return clamp(lastUsedMs + COOLDOWN_MS - now, 0, COOLDOWN_MS);
  }
  function shrineReady(lastUsedMs, nowMs) { return cooldownLeft(lastUsedMs, nowMs) === 0; }
  // state: plain object {shrineId: lastUsedMs}. Returns {ok, buff, left, state}; never mutates the input.
  function useShrine(state, shrine, nowMs) {
    const st = {};
    if (state && typeof state === 'object') Object.keys(state).forEach(function (k) { if (typeof state[k] === 'number' && isFinite(state[k])) st[k] = state[k]; });
    if (!shrine || typeof shrine.id !== 'string' || typeof shrine.kind !== 'string' || !has(BUFFS, shrine.kind) || typeof nowMs !== 'number' || !isFinite(nowMs)) return { ok: false, buff: null, left: 0, state: st };
    const left = cooldownLeft(st[shrine.id], nowMs);
    if (left > 0) return { ok: false, buff: null, left: left, state: st };
    st[shrine.id] = nowMs;
    return { ok: true, buff: buffFor(shrine.kind, shrine.zone), left: 0, state: st };
  }

  // ---- placement ----
  function generate(world, seed, opts) {
    const out = { version: VERSION, seed: String(seed === undefined ? '' : seed), shrines: [], camps: [], npcs: [] };
    if (!world || !world.terrain || !world.solid || !world.zone || !world.w || !world.h) return out;
    const seedStr = out.seed;
    const w = world.w, h = world.h, scale = Math.max(0.25, (w * h) / 65536);
    const avoid = [];
    (world.portalSites || []).forEach(function (p) { avoid.push([p.x, p.y, MIN_FROM_SPECIAL]); });
    (world.bossSites || []).forEach(function (p) { avoid.push([p.x, p.y, MIN_FROM_SPECIAL]); });
    (world.structures || []).forEach(function (p) { avoid.push([p.x, p.y, MIN_FROM_STRUCT]); });
    if (world.spawnPoint) avoid.push([world.spawnPoint.x, world.spawnPoint.y, MIN_FROM_SPAWN]);
    const placed = [];
    function place(z, rng) {
      for (let relax = 0; relax < 4; relax++) {
        const spacing = MIN_SPACING * (1 - relax * 0.15);
        for (let k = 0; k < 400; k++) {
          const x = rng.int(2, w - 3), y = rng.int(2, h - 3);
          if (world.zone[y * w + x] !== z || !openArea(world, x, y)) continue;
          let ok = true;
          for (let a = 0; a < avoid.length && ok; a++) if (dist(x, y, avoid[a][0], avoid[a][1]) < avoid[a][2]) ok = false;
          for (let s = 0; s < placed.length && ok; s++) if (dist(x, y, placed[s].x, placed[s].y) < spacing) ok = false;
          if (ok) { const p = { x: x, y: y }; placed.push(p); return p; }
        }
      }
      return null;
    }
    function countFor(kind, z) { const base = PLAN[kind][z] * scale; return base <= 0 ? 0 : Math.max(1, Math.round(base)); }
    const npcPool = MMRng.create(seedStr + ':sites:npcpool').shuffle(NPC_IDS);
    let npcN = 0;
    ['camp', 'shrine', 'npc'].forEach(function (kind) {
      for (let z = 0; z < 4; z++) {
        const rng = MMRng.create(seedStr + ':sites:' + kind + ':' + z);
        const n = countFor(kind, z);
        for (let k = 0; k < n; k++) {
          const p = place(z, rng);
          if (!p) continue;
          const id = kind + '_' + z + '_' + k;
          if (kind === 'shrine') {
            const sk = SHRINE_KINDS[rng.int(0, SHRINE_KINDS.length - 1)];
            out.shrines.push({ id: id, x: p.x, y: p.y, zone: z, kind: sk, buff: buffFor(sk, z), cooldownMs: COOLDOWN_MS });
          } else if (kind === 'camp') {
            out.camps.push(makeCamp(world, id, p, z, rng));
          } else {
            out.npcs.push({ id: id, x: p.x, y: p.y, zone: z, npc: npcPool[npcN++ % npcPool.length] });
          }
        }
      }
    });
    return out;
  }
  function makeCamp(world, id, p, z, rng) {
    const tiers = MMOverworld.CREATURE_TIERS;
    const n = rng.int(PATROL_COUNT[z][0], PATROL_COUNT[z][1]);
    const patrol = [];
    for (let i = 0; i < n; i++) {
      const type = rng.pick(PATROL_TYPES);
      const art = rng.pick(tiers[type][z]);
      let px = p.x, py = p.y;
      for (let t = 0; t < 12; t++) {
        const ang = rng.next() * Math.PI * 2, r = 2 + rng.next() * 2;
        const x = Math.round(p.x + Math.cos(ang) * r), y = Math.round(p.y + Math.sin(ang) * r);
        if (walkable(world, x, y)) { px = x; py = y; break; }
      }
      patrol.push({ type: type, art: art, x: px, y: py, leash: 6 });
    }
    // chest on a walkable tile next to the camp centre (centre is guaranteed walkable)
    let cxp = p.x, cyp = p.y;
    [[1, 0], [-1, 0], [0, 1], [0, -1]].some(function (d) { if (walkable(world, p.x + d[0], p.y + d[1])) { cxp = p.x + d[0]; cyp = p.y + d[1]; return true; } return false; });
    return { id: id, x: p.x, y: p.y, zone: z, chest: { x: cxp, y: cyp, tier: z }, patrol: patrol };
  }

  function all(sites) {
    sites = sites || {};
    return [].concat(sites.shrines || [], sites.camps || [], sites.npcs || []);
  }
  function hash(sites) { return MMRng.hash(JSON.stringify(sites || null)); }

  function verify(sites, world) {
    const problems = [];
    if (!sites || typeof sites !== 'object') return ['sites missing'];
    if (!world || !world.terrain) return ['world missing'];
    const list = all(sites), ids = {};
    const special = [].concat(world.portalSites || [], world.bossSites || []);
    list.forEach(function (s) {
      if (!s || typeof s.id !== 'string') { problems.push('site without id'); return; }
      if (ids[s.id]) problems.push('duplicate id ' + s.id);
      ids[s.id] = 1;
      if (!walkable(world, s.x, s.y)) problems.push(s.id + ' not on a walkable tile');
      special.forEach(function (p) { if (dist(s.x, s.y, p.x, p.y) < MIN_FROM_SPECIAL) problems.push(s.id + ' too close to portal/boss site'); });
      if (world.spawnPoint && dist(s.x, s.y, world.spawnPoint.x, world.spawnPoint.y) < MIN_FROM_SPAWN) problems.push(s.id + ' too close to spawn');
    });
    // spacing: the placer relaxes spacing by at most 45% before giving up
    const floor = MIN_SPACING * 0.55;
    for (let a = 0; a < list.length; a++) for (let b = a + 1; b < list.length; b++) {
      if (dist(list[a].x, list[a].y, list[b].x, list[b].y) < floor) problems.push(list[a].id + ' / ' + list[b].id + ' too close');
    }
    (sites.shrines || []).forEach(function (s) {
      if (SHRINE_KINDS.indexOf(s.kind) < 0) problems.push(s.id + ' bad shrine kind');
      else if (JSON.stringify(clampBuff(s.buff)) !== JSON.stringify(s.buff)) problems.push(s.id + ' buff out of range');
    });
    (sites.camps || []).forEach(function (c) {
      if (!c.chest || !walkable(world, c.chest.x, c.chest.y)) problems.push(c.id + ' chest not walkable');
      if (!Array.isArray(c.patrol) || !c.patrol.length) problems.push(c.id + ' no patrol');
      else c.patrol.forEach(function (m) { if (!walkable(world, m.x, m.y)) problems.push(c.id + ' patrol not walkable'); });
    });
    (sites.npcs || []).forEach(function (n) { if (NPC_IDS.indexOf(n.npc) < 0) problems.push(n.id + ' unknown npc ' + n.npc); });
    return problems;
  }

  return {
    VERSION: VERSION, MIN_SPACING: MIN_SPACING, COOLDOWN_MS: COOLDOWN_MS, SHRINE_KINDS: SHRINE_KINDS, NPC_IDS: NPC_IDS, BUFFS: BUFFS, PLAN: PLAN,
    generate: generate, verify: verify, all: all, hash: hash, walkable: walkable,
    buffFor: buffFor, clampBuff: clampBuff, cooldownLeft: cooldownLeft, shrineReady: shrineReady, useShrine: useShrine,
  };
}));
