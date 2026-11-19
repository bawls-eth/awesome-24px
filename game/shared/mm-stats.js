// MMStats: pure Mad Maze stat formulas (REALM-DESIGN.md section 3.2). No DOM, no globals.
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.MMStats = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  const STAT_CAP = 50;
  const TILE_PX = 24; // 4 tps = 96 px/s, 7 tps = 168 px/s
  const clampStat = (v) => { v = Number(v); return Number.isFinite(v) ? Math.max(0, Math.min(STAT_CAP, v)) : 0; };

  // SWF -> tiles per second: 4 + 3*SWF/50
  function tilesPerSec(swf) { return 4 + 3 * clampStat(swf) / STAT_CAP; }
  function pxPerSec(swf) { return tilesPerSec(swf) * TILE_PX; }
  // KNK -> shots per second: (2 + 6*KNK/50) * weapon rate multiplier
  function shotsPerSec(knk, rateMult) {
    const m = rateMult === undefined ? 1 : Number(rateMult);
    return (2 + 6 * clampStat(knk) / STAT_CAP) * (Number.isFinite(m) ? m : 1);
  }
  // POW -> damage multiplier: 0.5 + POW/40
  function dmgMult(pow) { return 0.5 + clampStat(pow) / 40; }
  function damage(base, pow) { return base * dmgMult(pow); }
  // GRD -> damage taken: max(ceil(raw*0.25), raw - GRD); piercing ignores guard.
  function damageTaken(raw, grd, piercing) {
    if (piercing) return raw;
    return Math.max(Math.ceil(raw * 0.25), raw - clampStat(grd));
  }

  // Map a legacy realm save (RM_ITEMS equipped via save.eq, scaled by rarity) to MM stats.
  // Legacy dmg -> POW (x4), rate -> KNK (x4), speed (px/s) -> SWF (1.44 px/s per SWF point).
  // hp, shards, xp and iframes have no stat equivalent and pass through as extras.
  const LEGACY_ITEMS = {
    sparkwand: { stat: 'dmg', amount: 0.5 }, quickwand: { stat: 'rate', amount: 1.5 },
    heartcharm: { stat: 'hp', amount: 12 }, swiftcharm: { stat: 'speed', amount: 18 },
    luckring: { stat: 'shards', amount: 0.12 }, scholarring: { stat: 'xp', amount: 0.12 },
    wardring: { stat: 'iframes', amount: 0.1 },
  };
  const LEGACY_RARITY = [1, 1.6, 2.4];
  function fromLegacy(save) {
    save = save && typeof save === 'object' ? save : {};
    const out = { level: Math.max(1, Math.min(20, Math.floor(Number(save.level)) || 1)),
      POW: 0, GRD: 0, SWF: 0, KNK: 0, hpBonus: 0, shardsBonus: 0, xpBonus: 0, iframes: 0 };
    const items = Array.isArray(save.items) ? save.items : [];
    const eq = save.eq && typeof save.eq === 'object' ? save.eq : {};
    ['weapon', 'charm', 'ring'].forEach((slot) => {
      const it = items.find((x) => x && x.n === eq[slot]);
      const def = it && Object.prototype.hasOwnProperty.call(LEGACY_ITEMS, it.id) ? LEGACY_ITEMS[it.id] : null;
      if (!def) return;
      const v = def.amount * (LEGACY_RARITY[it.r] || 1);
      if (def.stat === 'dmg') out.POW += v * 4;
      else if (def.stat === 'rate') out.KNK += v * 4;
      else if (def.stat === 'speed') out.SWF += v / 1.44;
      else if (def.stat === 'hp') out.hpBonus += v;
      else if (def.stat === 'shards') out.shardsBonus += v;
      else if (def.stat === 'xp') out.xpBonus += v;
      else if (def.stat === 'iframes') out.iframes += v;
    });
    ['POW', 'GRD', 'SWF', 'KNK'].forEach((k) => { out[k] = clampStat(out[k]); });
    return out;
  }

  return { STAT_CAP, TILE_PX, tilesPerSec, pxPerSec, shotsPerSec, dmgMult, damage, damageTaken, fromLegacy };
});
