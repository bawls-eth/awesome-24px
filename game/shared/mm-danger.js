// MMDanger (IDEAS ID-02, cycle 1 S): the zone-border danger meter. Pure, UMD (browser global MMDanger, or require()). No DOM, no clock.
// It turns the smooth MMOverworld.difficultyAt value (0 at the coast .. 1 at the island centre) into an "area level" and compares it with
// the hero's level: comfortable / tough / too hot. The area level is piecewise linear in difficulty with one knot on every zone border,
// so it equals the zone's recLv (MMZones.TABLES.ZONES: 1 / 5 / 10 / 15) exactly where that zone starts and climbs smoothly inside the band.
// The knots come from the same formula MMOverworld uses (difficulty = smooth(1 - dz / 0.9), zone k starts at dz < band[k-1].dwMin).
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.MMDanger = factory();
}(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  const REC_LV = [1, 5, 10, 15];     // MMZones.TABLES.ZONES[i].recLv
  const CENTRE_LV = 20;              // the island centre (difficulty 1): the level cap (realm.js RM_MAX_LEVEL)
  const COAST_DW = 0.97;             // the outer shore edge (both band tables)
  const BANDS = {                    // MMOverworld ZONE_BANDS_*: the dwMin of shore, midlands, highlands (godlands runs to the centre)
    classic: [0.68, 0.40, 0.20],
    wide: [0.62, 0.34, 0.17],
  };
  const TOUGH_GAP = 3;               // up to 3 levels under the area level = tough; more = too hot
  const SPAN = 6;                    // the bar: 0 at 3+ levels over the area, 1 at 3+ levels under the "too hot" line
  const LEVELS = Object.freeze({
    comfortable: Object.freeze({ id: 'comfortable', label: 'Comfortable', icon: '✓', rank: 0 }), // check mark
    tough: Object.freeze({ id: 'tough', label: 'Tough', icon: '!', rank: 1 }),
    hot: Object.freeze({ id: 'hot', label: 'Too hot', icon: '☠', rank: 2 }),                // skull
  });
  function smooth(t) { t = t < 0 ? 0 : t > 1 ? 1 : t; return t * t * (3 - 2 * t); }
  function num(v, d) { return typeof v === 'number' && isFinite(v) ? v : d; }
  const knotCache = {};
  // knots(bands) -> [[difficulty, level], ...] ascending in difficulty
  function knots(bands) {
    const b = bands === 'wide' ? 'wide' : 'classic';
    if (knotCache[b]) return knotCache[b];
    const k = [[smooth(1 - COAST_DW / 0.9), REC_LV[0]]];
    BANDS[b].forEach(function (dwMin, i) { k.push([smooth(1 - dwMin / 0.9), REC_LV[i + 1]]); });
    k.push([1, CENTRE_LV]);
    return (knotCache[b] = k);
  }
  // areaLevel(difficulty 0..1, bands 'classic'|'wide') -> a level 1..20 (one decimal). Bad input = the coast.
  function areaLevel(d, bands) {
    d = num(d, 0); d = d < 0 ? 0 : d > 1 ? 1 : d;
    const k = knots(bands);
    if (d <= k[0][0]) return k[0][1];
    for (let i = 1; i < k.length; i++) {
      if (d <= k[i][0]) { const t = (d - k[i - 1][0]) / Math.max(1e-9, k[i][0] - k[i - 1][0]); return Math.round((k[i - 1][1] + (k[i][1] - k[i - 1][1]) * t) * 10) / 10; }
    }
    return CENTRE_LV;
  }
  // rate(heroLv, difficulty, bands) -> { level: LEVELS.*, id, label, icon, area: int, hero: int, gap, fill 0..1, text, short }
  function rate(heroLv, d, bands) {
    const hero = Math.max(1, Math.floor(num(heroLv, 1)));
    const areaF = areaLevel(d, bands); const area = Math.max(1, Math.round(areaF));
    const gap = area - hero; // > 0: the area (as shown, whole levels) is above the hero
    const lvl = gap <= 0 ? LEVELS.comfortable : gap <= TOUGH_GAP ? LEVELS.tough : LEVELS.hot;
    const f = (gap + TOUGH_GAP) / SPAN; const fill = Math.round((f < 0 ? 0 : f > 1 ? 1 : f) * 100) / 100;
    return {
      level: lvl, id: lvl.id, label: lvl.label, icon: lvl.icon, area: area, hero: hero, gap: Math.round(gap * 10) / 10, fill: fill,
      short: lvl.label + ' · area Lv ' + area,
      text: 'Danger here: ' + lvl.label + ' (area Lv ' + area + ', you Lv ' + hero + ')',
    };
  }
  return { REC_LV: REC_LV, CENTRE_LV: CENTRE_LV, BANDS: BANDS, LEVELS: LEVELS, TOUGH_GAP: TOUGH_GAP, knots: knots, areaLevel: areaLevel, rate: rate };
}));
