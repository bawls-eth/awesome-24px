// MMEndgame (RE1): pure Realm endgame tables. UMD: browser global MMEndgame, or require().
//   chase(save)                    T12 chase view model from gear pity gp {b, d} (MMGearDrops) + the items a save holds. Calm progress text, never a countdown.
//   chaseView(gp)                  the same numbers and text from a bare pity state.
//   relicBook(src)                 the six godland (z3) boss relics (MMGear.SIG_BY_BOSS ids) found vs not yet, with friendly names.
//   rushLadder(seed, level)        the "Trial of Six" boss rush: a seeded order of the 6 z3 world bosses, each with its own telegraphs, an off-ramp after
//                                  every boss, normal pity and normal boss bags (no extra loot), no lives, no timer, no fee. Heroes Lv 20+ only.
//   mutatorsFor(biome, zone, seed, opts)  seeded dungeon mutators (z2+ dungeons only), always named, capped inside the MMDifficulty clamps.
//   applyMutators(scale, mut)      an MMDifficulty {hp,dmg,spd,count,fire} scale with a mutator pick applied, re-clamped.
//   deepRun(floor, biome)          deep-run floor rules: tier window +1 per floor (capped), off-ramp stairs on every floor, loot kept.
// Pure: no DOM, no clock, no Math.random (MMRng only). Hostile input (null, NaN, strings, __proto__, huge arrays) falls back to safe defaults.
// Every number is capped. Inputs are never mutated; every output is frozen. Opt-in challenge only: no timers, no lockouts, no paid randomness.
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(require('./rng.js'), require('./mm-gear.js'), require('./mm-gear-drops.js'), require('./mm-zones.js'), require('./mm-difficulty.js'));
  } else {
    root.MMEndgame = factory(root.MMRng, root.MMGear || null, root.MMGearDrops || null, root.MMZones || null, root.MMDifficulty || null);
  }
})(typeof self !== 'undefined' ? self : this, function (MMRng, MMGear, MMGearDrops, MMZones, MMDifficulty) {
  'use strict';
  const has = (o, k) => o !== null && typeof o === 'object' && Object.prototype.hasOwnProperty.call(o, k);
  const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
  const isNum = (v) => typeof v === 'number' && Number.isFinite(v);
  const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
  const toInt = (v, lo, hi, d) => (isNum(v) ? clamp(Math.floor(v), lo, hi) : d);
  const r3 = (v) => Math.round(v * 1000) / 1000;
  const MAX_ARR = 500;
  const SEED_MAX = 120;
  const seedStr = (s) => (typeof s === 'string' ? s.slice(0, SEED_MAX) : isNum(s) ? String(s) : '');

  // ---------- the six godland bosses (MMOverworld.BOSS_POOLS[3] order; tests check these stay in step) ----------
  // [boss id, boss name, relic id (MMGear SIG_LIST), relic name]
  const BOSSES = Object.freeze([
    Object.freeze(['dread_knight', 'Dread Knight', 'arm_sig_dread', 'Dread Plate']),
    Object.freeze(['inferno_wyrm', 'Inferno Wyrm', 'arm_sig_wyrm', 'Wyrm Core']),
    Object.freeze(['void_oracle', 'Void Oracle', 'arm_sig_oracle', 'Oracle Eye']),
    Object.freeze(['lich_king', 'Lich King', 'arm_sig_lich', 'Lich Phylactery']),
    Object.freeze(['shadow_hydra', 'Shadow Hydra', 'arm_sig_hydra', 'Hydra Fang']),
    Object.freeze(['void_maw', 'Void Maw', 'arm_sig_maw', 'Maw Shard']),
  ]);
  const BOSS_IDS = Object.freeze(BOSSES.map((b) => b[0]));
  const relicIdOf = (boss) => (MMGear && has(MMGear.SIG_BY_BOSS, boss) ? MMGear.SIG_BY_BOSS[boss] : (BOSSES.find((b) => b[0] === boss) || [])[2]);
  const relicNameOf = (b) => (MMGear && MMGear.ARMOR_NAMES && has(MMGear.ARMOR_NAMES, relicIdOf(b[0])) ? MMGear.ARMOR_NAMES[relicIdOf(b[0])] : b[3]);

  // ---------- pity numbers (mirrors MMGearDrops.PITY; used only when that module is absent) ----------
  const PITY = MMGearDrops && MMGearDrops.PITY ? MMGearDrops.PITY : Object.freeze({ bossStep: 0.005, bossCap: 0.10, bossHard: 60, cryptHard: 15, cryptMinT: 10, max: 9999 });
  const T12_BASE_PCT = 5; // MMGearDrops BOSS[3] T12 weight
  function cleanGp(gp) {
    if (MMGearDrops && typeof MMGearDrops.cleanGp === 'function') return MMGearDrops.cleanGp(gp);
    const g = isObj(gp) ? gp : {};
    return { b: toInt(g.b, 0, PITY.max, 0), d: toInt(g.d, 0, PITY.max, 0) };
  }

  // ---------- items: collect from any list a save may hold ----------
  // Accepts an array of items ({id, t} or a bare id string), or an object with items / stash / heroes[].items / heroes[].keepsake /
  // finds.pending / finds.recent / realm.items. Returns [{id, t}] (at most MAX_ARR per list).
  const ID_RE = /^[a-z][a-z0-9_]{1,40}$/;
  function pushItems(list, out) {
    if (!Array.isArray(list)) return;
    const n = Math.min(list.length, MAX_ARR);
    for (let i = 0; i < n; i++) {
      const it = list[i];
      if (typeof it === 'string') { if (ID_RE.test(it)) out.push({ id: it, t: 0 }); continue; }
      if (!isObj(it) || typeof it.id !== 'string' || !ID_RE.test(it.id)) continue;
      out.push({ id: it.id, t: toInt(it.t, 0, 12, 0) });
    }
  }
  function collectItems(src) {
    const out = [];
    if (Array.isArray(src)) { pushItems(src, out); return out; }
    if (!isObj(src)) return out;
    if (has(src, 'items')) pushItems(src.items, out);
    if (has(src, 'stash')) pushItems(src.stash, out);
    if (has(src, 'realm') && isObj(src.realm) && has(src.realm, 'items')) pushItems(src.realm.items, out);
    if (has(src, 'finds') && isObj(src.finds)) { pushItems(src.finds.pending, out); pushItems(src.finds.recent, out); }
    if (has(src, 'heroes') && Array.isArray(src.heroes)) {
      src.heroes.slice(0, 50).forEach((h) => { if (isObj(h)) { pushItems(h.items, out); pushItems([h.keepsake], out); } });
    }
    return out;
  }

  // ---------- (1) T12 chase ----------
  // chaseView(gp) -> { pityB, pityD, hard, toward, nextForced, bonusPct, t12Pct, sure, text, luckText, cryptText }
  //  toward = min(b, hard): progress toward a sure T12. nextForced: the next godland boss T12 is sure (b >= hard). Wording names progress only.
  function chaseView(gp) {
    const g = cleanGp(gp), hard = PITY.bossHard, cHard = PITY.cryptHard;
    const toward = Math.min(g.b, hard), dToward = Math.min(g.d, cHard);
    const bonusPct = Math.round(Math.min(PITY.bossCap, g.b * PITY.bossStep) * 1000) / 10;
    const sure = g.b >= hard;
    const t12Pct = sure ? 100 : Math.round((T12_BASE_PCT + bonusPct) * 10) / 10;
    return Object.freeze({
      pityB: g.b, pityD: g.d, hard: hard, toward: toward, nextForced: sure, bonusPct: bonusPct, t12Pct: t12Pct, sure: sure,
      text: sure ? 'A sure T12 is ready for your next godland boss' : toward + ' of ' + hard + ' toward a sure T12',
      luckText: 'Boss luck +' + bonusPct + '%',
      cryptText: dToward + ' of ' + cHard + ' toward a sure crypt T10+',
    });
  }
  // chase(save) -> chaseView(save.gp) plus relicsOwned[6] (BOSSES order), relicCount, t12Owned, bestTier. Read-only.
  function chase(save) {
    const s = isObj(save) ? save : {};
    const v = chaseView(has(s, 'gp') ? s.gp : null);
    const items = collectItems(s);
    let best = 0;
    items.forEach((it) => { if (it.t > best) best = it.t; });
    const relicsOwned = Object.freeze(BOSSES.map((b) => items.some((it) => it.id === relicIdOf(b[0]))));
    const t12Owned = best >= 12 || relicsOwned.some(Boolean);
    return Object.freeze(Object.assign({}, v, {
      relicsOwned: relicsOwned, relicCount: relicsOwned.filter(Boolean).length, t12Owned: t12Owned, bestTier: t12Owned ? Math.max(12, best) : best,
    }));
  }

  // ---------- (2) relic book ----------
  // relicBook(src) -> { entries: [{ id, boss, name, bossName, found, text }], found, total: 6, text }
  function relicBook(src) {
    const items = collectItems(src);
    const entries = BOSSES.map((b) => {
      const id = relicIdOf(b[0]), name = relicNameOf(b), found = items.some((it) => it.id === id);
      return Object.freeze({ id: id, boss: b[0], name: name, bossName: b[1], found: found, text: found ? name + ' (' + b[1] + ')' : 'Not yet: ' + b[1] + ' relic' });
    });
    const found = entries.filter((e) => e.found).length;
    return Object.freeze({
      entries: Object.freeze(entries), found: found, total: entries.length,
      text: found + ' of ' + entries.length + ' relics found', hint: 'The six godland bosses sometimes leave a relic behind. Nothing here runs out.',
    });
  }

  // ---------- (3) boss rush "Trial of Six" ----------
  const RUSH = Object.freeze({
    minLevel: 20, steps: 6, zone: 3, tier: 3,
    // a gentle per-step ramp (tuning constants for RE4), capped: a rush boss is never more than +10% over the same boss in the world
    ramp: Object.freeze({ hp: Object.freeze([1.0, 1.0, 1.04, 1.04, 1.08, 1.1]), dmg: Object.freeze([1.0, 1.0, 1.02, 1.04, 1.06, 1.08]) }),
    rampCap: 1.1,
    windup: 0.6,              // MMTelegraph WINDUP_BOSS: every rush boss keeps its own telegraphs at the normal boss wind-up
  });
  const BOSS_MUL_FALLBACK = Object.freeze({ hpMul: 5.5 * 1.5 * 12, speedMul: 1.25 * 1.06, dmgMul: 2.2 * 1.3 * 1.4, xpMul: 8 * 1.5 * 12, shardMul: 8 * 1.25 * 13 });
  const RULES = Object.freeze({
    entry: 'choice', timer: false, entryFee: 0, lockout: false, lives: false,
    pityPerKill: 1,            // each kill is one normal MMGearDrops.pityStep (6 kills add exactly 6 to gp.b unless a T12 resets it)
    extraLoot: false,          // each boss drops its normal boss bag (MMZones.rollBag boss), nothing more
    keepDrops: true,           // leaving or falling returns the hero to the Nexus with every drop already collected
    offRampEvery: 1,
  });
  // rushLadder(seed, level) -> { ok, minLevel, level, text, steps: [...6], rules }. Below Lv 20: ok false and no steps.
  function rushLadder(seed, level) {
    const lv = toInt(typeof level === 'string' ? Number(level) : level, 0, 999, 0);
    const ok = lv >= RUSH.minLevel;
    let steps = [];
    if (ok) {
      const rng = MMRng.create('rush:' + seedStr(seed));
      const order = rng.shuffle(BOSSES.slice());
      const base = MMZones && typeof MMZones.statMultipliers === 'function' ? MMZones.statMultipliers(RUSH.zone, RUSH.tier, true) : BOSS_MUL_FALLBACK;
      steps = order.map((b, i) => {
        const hpR = Math.min(RUSH.rampCap, RUSH.ramp.hp[i]), dmgR = Math.min(RUSH.rampCap, RUSH.ramp.dmg[i]);
        const last = i === order.length - 1;
        return Object.freeze({
          step: i + 1, boss: b[0], name: b[1], relic: relicIdOf(b[0]), zone: RUSH.zone, tier: RUSH.tier,
          hpMul: r3(base.hpMul * hpR), dmgMul: r3(base.dmgMul * dmgR), speedMul: r3(base.speedMul), xpMul: r3(base.xpMul), shardMul: r3(base.shardMul),
          ramp: Object.freeze({ hp: hpR, dmg: dmgR }), windup: RUSH.windup, telegraphs: 'own',
          bag: 'boss', extraLoot: false, pity: 'normal', offRamp: true, keepsDrops: true,
          restText: last ? 'The trial is done. Rest here' : 'Rest here', leaveText: 'Leave with your loot',
          text: 'Step ' + (i + 1) + ' of ' + order.length + ': ' + b[1],
        });
      });
    }
    return Object.freeze({
      ok: ok, minLevel: RUSH.minLevel, level: lv, steps: Object.freeze(steps), rules: RULES,
      text: ok ? 'Trial of Six: six godland bosses, one after another. You may leave with your loot after any fight.'
        : 'The Trial of Six opens for heroes at level ' + RUSH.minLevel + '.',
    });
  }

  // ---------- (4) dungeon mutators + deep runs ----------
  // effects are multipliers (1 = no change) on top of MMDifficulty.dungeonScale. None adds a timer, raises damage or shortens a wind-up.
  const MUTATORS = Object.freeze({
    brittle: Object.freeze({ id: 'brittle', name: 'Brittle', text: 'Foes have less health.', fx: Object.freeze({ hp: 0.85 }) }),
    swift: Object.freeze({ id: 'swift', name: 'Swift', text: 'Foes move a little faster.', fx: Object.freeze({ spd: 1.12 }) }),
    dim: Object.freeze({ id: 'dim', name: 'Dim', text: 'The light around you is smaller.', fx: Object.freeze({ view: 0.8 }) }),
    narrow: Object.freeze({ id: 'narrow', name: 'Narrow', text: 'Halls are narrower.', fx: Object.freeze({ width: 0.8 }) }),
    swarm: Object.freeze({ id: 'swarm', name: 'Swarm', text: 'More foes, each one weaker.', fx: Object.freeze({ count: 1.5, hp: 0.7 }) }),
    mirror: Object.freeze({ id: 'mirror', name: 'Mirror', text: 'The rooms come in reverse order.', fx: Object.freeze({ mirror: true }) }),
  });
  const MUT_IDS = Object.freeze(Object.keys(MUTATORS));
  // combined caps (also inside MMDifficulty.TABLES.CLAMP once applied)
  const MUT_CAP = Object.freeze({ hp: [0.6, 1], spd: [1, 1.15], count: [1, 1.5], view: [0.75, 1], width: [0.75, 1], dmg: [1, 1], fire: [1, 1], windup: [1, 1] });
  const MUT_MAX = 2;          // never more than 2 mutators at once (default pick is 1), and never the same one twice
  const MUT_MIN_ZONE = 2;     // z2+ dungeons only (warren / bramble z1 never get one)
  const BIOMES = Object.freeze(['warren', 'bramble', 'meadow', 'crypt']);
  const BIOME_ZONE = Object.freeze({ warren: 1, bramble: 1, meadow: 2, crypt: 2 }); // MMOverworld.PORTAL_ZONES
  const NONE_FX = Object.freeze({ hp: 1, spd: 1, count: 1, view: 1, width: 1, dmg: 1, fire: 1, windup: 1, mirror: false });

  function foldFx(list) {
    const fx = { hp: 1, spd: 1, count: 1, view: 1, width: 1, dmg: 1, fire: 1, windup: 1, mirror: false };
    list.forEach((m) => { Object.keys(m.fx).forEach((k) => { if (k === 'mirror') fx.mirror = true; else fx[k] *= m.fx[k]; }); });
    Object.keys(MUT_CAP).forEach((k) => { fx[k] = r3(clamp(fx[k], MUT_CAP[k][0], MUT_CAP[k][1])); });
    return Object.freeze(fx);
  }
  // mutatorsFor(biome, zone, seed, opts) -> { list: [{id, name, text, fx}], ids, fx, label, text }
  //  opts.count 0..2 (default 1); opts.off true (page ?mut=0) -> none. zone defaults to the biome's portal zone.
  function mutatorsFor(biome, zone, seed, opts) {
    const o = isObj(opts) ? opts : {};
    const b = typeof biome === 'string' && BIOMES.indexOf(biome) >= 0 ? biome : '';
    const z = isNum(zone) ? clamp(Math.floor(zone), 0, 3) : (b ? BIOME_ZONE[b] : 0);
    const want = o.off === true ? 0 : toInt(o.count, 0, MUT_MAX, 1);
    let list = [];
    if (b && b !== 'warren' && z >= MUT_MIN_ZONE && want > 0) {
      const rng = MMRng.create('mut:' + b + ':' + z + ':' + seedStr(seed));
      list = rng.shuffle(MUT_IDS.slice()).slice(0, want).sort((x, y) => MUT_IDS.indexOf(x) - MUT_IDS.indexOf(y)).map((id) => MUTATORS[id]);
    }
    const names = list.map((m) => m.name);
    return Object.freeze({
      list: Object.freeze(list), ids: Object.freeze(list.map((m) => m.id)), fx: list.length ? foldFx(list) : NONE_FX,
      label: names.join(' + '), text: list.length ? names.join(' + ') + ': ' + list.map((m) => m.text).join(' ') : '',
    });
  }
  // applyMutators(scale, mut) -> a new {hp,dmg,spd,count,fire} with the mutator fx applied, clamped to MMDifficulty.TABLES.CLAMP.
  function applyMutators(scale, mut) {
    const s = isObj(scale) ? scale : {}, fx = isObj(mut) && isObj(mut.fx) ? mut.fx : NONE_FX;
    const CL = MMDifficulty && MMDifficulty.TABLES ? MMDifficulty.TABLES.CLAMP : { hp: [0.4, 4], dmg: [0.5, 2], spd: [0.7, 1.4], count: [0.5, 1.6], fire: [0.7, 1.5] };
    const g = (k, d) => (has(s, k) && isNum(s[k]) ? s[k] : d);
    const f = (k) => (has(fx, k) && isNum(fx[k]) ? clamp(fx[k], MUT_CAP[k][0], MUT_CAP[k][1]) : 1);
    const out = { hp: g('hp', 1) * f('hp'), dmg: g('dmg', 1) * f('dmg'), spd: g('spd', 1) * f('spd'), count: g('count', 1) * f('count'), fire: g('fire', 1) * f('fire') };
    Object.keys(out).forEach((k) => { out[k] = r3(clamp(out[k], CL[k][0], CL[k][1])); });
    return Object.freeze(out);
  }

  const DEEP = Object.freeze({ maxFloor: 3, tierStep: 1, tierCap: 11 }); // T12 stays a godland-boss find; dungeon tiers stop at T11
  const DUNGEON_ROWS = MMGearDrops && MMGearDrops.TABLES ? MMGearDrops.TABLES : null;
  const tiersOf = (row, fallback) => (Array.isArray(row) && row.length ? row.map((e) => e.t) : fallback);
  // deepRun(floor, biome) -> { floor, maxFloor, tierShift, tiers, bossTiers, offRamp, keepsLoot, bossPool, nextStairs, text }
  function deepRun(floor, biome) {
    const f = toInt(typeof floor === 'string' ? Number(floor) : floor, 1, DEEP.maxFloor, 1);
    const b = typeof biome === 'string' && BIOMES.indexOf(biome) >= 0 ? biome : 'warren';
    const shift = (f - 1) * DEEP.tierStep;
    const base = tiersOf(DUNGEON_ROWS && has(DUNGEON_ROWS.DUNGEON, b) ? DUNGEON_ROWS.DUNGEON[b] : null, [2, 3]);
    const boss = tiersOf(DUNGEON_ROWS && has(DUNGEON_ROWS.DBOSS, b) ? DUNGEON_ROWS.DBOSS[b] : null, [4]);
    const lift = (arr) => Object.freeze(arr.map((t) => Math.min(DEEP.tierCap, t + shift)).filter((t, i, a) => a.indexOf(t) === i));
    return Object.freeze({
      floor: f, maxFloor: DEEP.maxFloor, biome: b, tierShift: shift, tiers: lift(base), bossTiers: lift(boss),
      offRamp: true, keepsLoot: true, bossPool: 'biome', nextStairs: f < DEEP.maxFloor, timer: false,
      text: 'Floor ' + f + ' of ' + DEEP.maxFloor + '. Stairs back to the Nexus are here, and you keep your loot.',
    });
  }

  return Object.freeze({
    VERSION: 1, BOSSES, BOSS_IDS, RUSH, RULES, MUTATORS, MUT_IDS, MUT_CAP, MUT_MAX, MUT_MIN_ZONE, DEEP,
    chase, chaseView, relicBook, rushLadder, mutatorsFor, applyMutators, deepRun, collectItems,
  });
});
