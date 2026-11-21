// MMGearDrops: tiered gear drop tables, per-player seeded rolls and visible pity (GEAR-DROPS-BUILD-PLAN section (a) "Drop mapping" and "Pity", slice G2).
// rollGear(ctx, seed) turns ONE item of an existing MMZones bag into tiered gear (or returns null = stays a classic item).
// Pure: no DOM, no clock, no Math.random (MMRng only). Every roll is a function of (ctx, seed): the caller builds a per-player seed
// with seedFor(worldSeed, tag, kills, playerId), so co-op shares nothing and every device agrees. Hostile ctx falls back to safe defaults.
// Pity is a free, visible counter (gp = { b, d }); it is never bought, timed or hidden, and there is no "so close" messaging.
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./rng.js'), require('./mm-gear.js'), require('./mm-weapon-items.js'));
  else root.MMGearDrops = factory(root.MMRng, root.MMGear, root.MMWeaponItems);
})(typeof self !== 'undefined' ? self : this, function (MMRng, MMGear, MMWeaponItems) {
  const has = (o, k) => Object.prototype.hasOwnProperty.call(o, k);
  const isNum = (v) => typeof v === 'number' && Number.isFinite(v);
  const clampInt = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
  const toInt = (v, lo, hi, dflt) => (isNum(v) ? clampInt(Math.floor(v), lo, hi) : dflt);

  const GEAR_CHANCE = Object.freeze([0.30, 0.40, 0.50, 0.60, 0.70, 0.80]); // by MMZones bag tier index (brown..gold)
  const ARMOR_SHARE = 0.5;     // slot: weapon 50% / armor 50%
  const WEAPON_FAMILY_SHARE = 0.7;
  const ARMOR_FAMILY_SHARE = 0.75;
  const T12_BASE = 0.05;       // z3 boss base T12 weight
  const PITY = Object.freeze({ bossStep: 0.005, bossCap: 0.10, bossHard: 60, cryptHard: 15, cryptMinT: 10, max: 9999 });
  const HERO_T12 = 0.05;       // zone 3 event, hero contribution
  const EVENT_CAP = 11;

  const BOSS_ZONE = Object.freeze({
    forest_warden: 1, mire_queen: 1, treant_elder: 1, sand_titan: 1,
    bone_colossus: 2, storm_harbinger: 2, crystal_titan: 2, hydra: 2, frost_dragon: 2, clockwork_golem: 2,
    dread_knight: 3, inferno_wyrm: 3, void_oracle: 3, lich_king: 3, shadow_hydra: 3, void_maw: 3,
  });
  // A T12 from a z3 boss carries one fixed signature affix.
  const SIGNATURE = Object.freeze({ dread_knight: 'ward', inferno_wyrm: 'blast', void_oracle: 'venom', lich_king: 'leech', shadow_hydra: 'pierce', void_maw: 'blast' });
  const BIOMES = Object.freeze(['warren', 'bramble', 'meadow', 'crypt']);

  // Rows are [[t, weight], ...]; normalised so every row sums to exactly 1 (within float error).
  function row(pairs) {
    let s = 0; pairs.forEach((p) => { s += p[1]; });
    return Object.freeze(pairs.map((p) => Object.freeze({ t: p[0], p: p[1] / s })));
  }
  const MOB = Object.freeze([
    row([[1, 0.60], [2, 0.30], [3, 0.10]]),
    row([[3, 0.35], [4, 0.35], [5, 0.20], [6, 0.10]]),
    row([[5, 0.30], [6, 0.30], [7, 0.20], [8, 0.15], [9, 0.05]]),
    row([[7, 0.35], [8, 0.35], [9, 0.20], [10, 0.10]]),
  ]);
  const BOSS = Object.freeze({
    1: row([[5, 0.40], [6, 0.40], [7, 0.20]]),
    2: row([[8, 0.40], [9, 0.35], [10, 0.25]]),
    3: row([[10, 0.60], [11, 0.35], [12, 0.05]]),
  });
  // G15 pacing: a z3 boss bag holds at most ONE T12 chance. The first item (k = 0, the one pity works on) uses BOSS[3]; the extra items of the bag
  // (k >= 1) use this row (T12's weight moved to T11), so a gold bag's 2-3 items cannot triple the T12 odds and the first T12 lands in the
  // plan's 1.5-4 h window instead of under an hour (see the drop-pacing sim in shared-mm-gear-drops.test.js).
  const BOSS_EXTRA = Object.freeze({ 3: row([[10, 0.60], [11, 0.40]]) });
  // Boss signature relics: a z3 boss T12 on the first item becomes that boss's relic (MMGear.SIG_BY_BOSS) with this share, from an extra seeded draw.
  // Never guaranteed: a pity-forced T12 takes the same share. ~0.9% of z3 boss kills at gp 0.
  const SIG_ITEM_SHARE = 0.25;
  const ELITE = Object.freeze({ giant_spider_queen: row([[9, 0.50], [10, 0.40], [11, 0.10]]) });
  const DUNGEON = Object.freeze({
    warren: row([[2, 1], [3, 1]]), bramble: row([[3, 1], [4, 1], [5, 1]]), meadow: row([[5, 1], [6, 1], [7, 1]]), crypt: row([[7, 1], [8, 1], [9, 1]]),
  });
  const DBOSS = Object.freeze({ warren: row([[4, 1]]), bramble: row([[6, 1]]), meadow: row([[8, 1]]), crypt: row([[9, 0.5], [10, 0.4], [11, 0.1]]) });

  // Event window = the zone's mob window shifted +0/+1/+2 (participate/contribute/hero), capped at T11; zone 3 hero also has 5% T12.
  function eventRow(zone, shift) {
    const acc = {};
    MOB[zone].forEach((e) => { const t = Math.min(EVENT_CAP, e.t + shift); acc[t] = (acc[t] || 0) + e.p; });
    const pairs = Object.keys(acc).map((k) => [Number(k), acc[k]]).sort((a, b) => a[0] - b[0]);
    if (zone === 3 && shift === 2) { pairs.forEach((p) => { p[1] *= 1 - HERO_T12; }); pairs.push([12, HERO_T12]); }
    return row(pairs);
  }
  const EVENT = Object.freeze([0, 1, 2, 3].map((z) => Object.freeze([0, 1, 2].map((s) => eventRow(z, s)))));
  const TABLES = Object.freeze({ MOB, BOSS, BOSS_EXTRA, ELITE, DUNGEON, DBOSS, EVENT, CHEST: MOB, GEAR_CHANCE, BOSS_ZONE, SIGNATURE, BIOMES, SIG_ITEM_SHARE });

  // ---------- context ----------
  const SRCS = ['mob', 'boss', 'elite', 'event', 'chest', 'dungeon', 'dboss'];
  function cleanCtx(ctx) {
    ctx = ctx && typeof ctx === 'object' && !Array.isArray(ctx) ? ctx : {};
    const src = typeof ctx.src === 'string' && SRCS.indexOf(ctx.src) >= 0 ? ctx.src : 'mob';
    const boss = typeof ctx.boss === 'string' && has(BOSS_ZONE, ctx.boss) ? ctx.boss : (typeof ctx.boss === 'string' && has(ELITE, ctx.boss) ? ctx.boss : '');
    let zone = toInt(ctx.zone, 0, 3, 0);
    if (src === 'boss' && boss && has(BOSS_ZONE, boss)) zone = BOSS_ZONE[boss];
    return {
      src: src, zone: zone, boss: boss, biome: typeof ctx.biome === 'string' && has(DUNGEON, ctx.biome) ? ctx.biome : '',
      eventTier: toInt(ctx.eventTier, 0, 2, 0), cls: typeof ctx.cls === 'string' ? ctx.cls.slice(0, 24) : '',
      r: toInt(ctx.r, 0, 3, 0), bagTier: toInt(ctx.bagTier, 0, GEAR_CHANCE.length - 1, 0), k: toInt(ctx.k, 0, 99, 0),
      always: ctx.always === true, gp: cleanGp(ctx.gp), gear: ctx.gear !== false,
    };
  }
  // The weight row for a cleaned ctx, or null when the source cannot drop tiered gear.
  function rowFor(c) {
    switch (c.src) {
      case 'mob': case 'chest': return MOB[c.zone];
      case 'boss': return c.k >= 1 && has(BOSS_EXTRA, c.zone) ? BOSS_EXTRA[c.zone] : BOSS[Math.max(1, c.zone)];
      case 'elite': return ELITE[c.boss && has(ELITE, c.boss) ? c.boss : 'giant_spider_queen'];
      case 'event': return EVENT[c.zone][c.eventTier];
      case 'dungeon': return c.biome ? DUNGEON[c.biome] : null;
      case 'dboss': return c.biome ? DBOSS[c.biome] : null;
      default: return null;
    }
  }
  // table(ctx) -> frozen [{ t, p }] with the base probabilities (no pity), or [] for a source that never drops gear.
  function table(ctx) { const r = rowFor(cleanCtx(ctx)); return r || Object.freeze([]); }

  // ---------- pity ----------
  function cleanGp(raw) {
    raw = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
    return Object.freeze({ b: toInt(raw.b, 0, PITY.max, 0), d: toInt(raw.d, 0, PITY.max, 0) });
  }
  const isZ3Boss = (c) => c.src === 'boss' && c.zone === 3;
  const isCryptBoss = (c) => c.src === 'dboss' && c.biome === 'crypt';
  // pityStep(gp, ctx, results): call ONCE per kill with the kill's rollGear results (nulls allowed). Returns a new gp.
  //  b counts godlands boss kills since the last T12; d counts crypt boss kills since the last T10+. Reset only on success.
  function pityStep(gp, ctx, results) {
    const g = cleanGp(gp), c = cleanCtx(ctx), list = Array.isArray(results) ? results : [];
    const best = list.reduce((m, r) => (r && isNum(r.t) ? Math.max(m, r.t) : m), 0);
    let b = g.b, d = g.d;
    if (isZ3Boss(c)) b = best >= 12 ? 0 : Math.min(PITY.max, b + 1);
    else if (isCryptBoss(c)) d = best >= PITY.cryptMinT ? 0 : Math.min(PITY.max, d + 1);
    return Object.freeze({ b: b, d: d });
  }
  // pityView(gp) -> plain numbers and strings for the hero panel. Informational only.
  function pityView(gp) {
    const g = cleanGp(gp);
    const bonus = Math.min(PITY.bossCap, g.b * PITY.bossStep) * 100;
    const left = Math.max(0, PITY.bossHard - g.b), dLeft = Math.max(0, PITY.cryptHard - g.d);
    const pct = Math.round(bonus * 10) / 10;
    return Object.freeze({
      bonusPct: pct, bossKillsLeft: left, cryptKillsLeft: dLeft,
      text: 'Boss luck: +' + pct + '% (T12 guaranteed in ' + left + ' ' + (left === 1 ? 'kill' : 'kills') + ')',
      cryptText: 'Crypt luck: T10+ guaranteed in ' + dLeft + ' ' + (dLeft === 1 ? 'kill' : 'kills'),
    });
  }

  // ---------- rolls ----------
  const seedFor = (worldSeed, tag, kills, playerId) => 'drop:' + String(worldSeed).slice(0, 60) + ':' + String(tag).slice(0, 60) + ':' + String(kills).slice(0, 12) + ':p:' + String(playerId).slice(0, 60);
  function pickWeighted(entries, u) {
    let acc = 0;
    for (let i = 0; i < entries.length; i++) { acc += entries[i].p; if (u < acc) return entries[i].t; }
    return entries[entries.length - 1].t;
  }
  // z3 boss row with the soft pity bonus: T12 gets +0.5% per kill (cap +10%), the rest scale down pro rata.
  function withBossBonus(r, b) {
    const w12 = Math.min(1, T12_BASE + Math.min(PITY.bossCap, b * PITY.bossStep)), rest = 1 - T12_BASE;
    return r.map((e) => ({ t: e.t, p: e.t === 12 ? w12 : e.p * (1 - w12) / rest }));
  }
  function weaponPool(cls) {
    const fam = MMWeaponItems ? (MMWeaponItems.familyFor(cls) || MMWeaponItems.familyFor(String(cls).toLowerCase())) : null;
    const all = MMWeaponItems ? MMWeaponItems.ITEMS.map((i) => i.id) : [];
    if (!fam) return { own: ['sparkwand'].concat(all), other: [], fam: null };
    const own = ['sparkwand'].concat(MMWeaponItems.familyItems(fam).map((i) => i.id));
    return { own: own, other: MMWeaponItems.ITEMS.filter((i) => i.family !== fam).map((i) => i.id), fam: fam };
  }
  const pickFrom = (arr, u) => arr[Math.min(arr.length - 1, Math.floor(u * arr.length))];

  // rollGear(ctx, seed) -> frozen { id, r, t, a?, sig?, relic?, slot, pity } or null (the item stays classic). relic: the id is a boss signature relic.
  //  ctx: { src: mob|boss|elite|event|chest|dungeon|dboss, zone 0-3, boss (id), biome, eventTier 0-2, cls, r (quality 0-3, the MMZones rarity roll),
  //         bagTier 0-5 (MMZones tier index of the bag), k (item index within the kill), gp {b,d}, always (skip the gear chance), gear (false = kill switch) }
  //  Pity applies to the FIRST item of a kill (k = 0) so a bag cannot hold several guaranteed drops.
  function rollGear(ctx, seed) {
    const c = cleanCtx(ctx);
    if (!c.gear) return null;
    const base = rowFor(c);
    if (!base) return null;
    const rng = MMRng.create('gear:' + String(seed === undefined ? '' : seed).slice(0, 160) + ':' + c.k);
    const uChance = rng.next(), uTier = rng.next(), uSlot = rng.next(), uBranch = rng.next(), uPick = rng.next(), uAff = rng.next();
    let entries = base, forced = false;
    if (c.k === 0 && isZ3Boss(c)) {
      if (c.gp.b >= PITY.bossHard) { entries = [{ t: 12, p: 1 }]; forced = true; }
      else if (c.gp.b > 0) entries = withBossBonus(base, c.gp.b);
    } else if (c.k === 0 && isCryptBoss(c) && c.gp.d >= PITY.cryptHard) {
      const hi = base.filter((e) => e.t >= PITY.cryptMinT), s = hi.reduce((a, e) => a + e.p, 0);
      entries = hi.map((e) => ({ t: e.t, p: e.p / s })); forced = true;
    }
    if (!forced && !c.always && !(uChance < GEAR_CHANCE[c.bagTier])) return null;
    const t = pickWeighted(entries, uTier);
    let id, slot;
    if (uSlot < ARMOR_SHARE) {
      slot = 'armor';
      const own = MMGear.armorFamilyOf(c.cls), fams = MMGear.FAMILY_KEYS;
      const fam = own ? (uBranch < ARMOR_FAMILY_SHARE ? own : pickFrom(fams.filter((f) => f !== own), uPick)) : pickFrom(fams, uPick);
      id = MMGear.armorId(fam, t);
    } else {
      slot = 'weapon';
      const wp = weaponPool(c.cls);
      id = wp.fam && uBranch >= WEAPON_FAMILY_SHARE && wp.other.length ? pickFrom(wp.other, uPick) : pickFrom(wp.own, uPick);
    }
    const out = { id: id, r: c.r, t: t, slot: slot, pity: forced };
    if (t >= MMGear.AFFIX_MIN_T) out.a = 1 + Math.floor(uAff * 4294967295); // uint32 in 1..2^32-1 (uAff < 1)
    if (t === 12 && c.src === 'boss' && c.boss && has(SIGNATURE, c.boss)) {
      out.sig = SIGNATURE[c.boss];
      const relic = MMGear.SIG_BY_BOSS && has(MMGear.SIG_BY_BOSS, c.boss) ? MMGear.SIG_BY_BOSS[c.boss] : null;
      if (relic && c.k === 0 && rng.next() < SIG_ITEM_SHARE) { out.id = relic; out.slot = 'armor'; out.relic = true; } // drawn last: every other roll is unchanged
    }
    return Object.freeze(out);
  }

  return Object.freeze({
    TABLES, GEAR_CHANCE, PITY, ARMOR_SHARE, WEAPON_FAMILY_SHARE, ARMOR_FAMILY_SHARE, BOSS_ZONE, SIGNATURE, SIG_ITEM_SHARE,
    table, rollGear, pityStep, pityView, cleanGp, seedFor,
  });
});
