// MMPerf: low-end profile from frame-time samples. Pure; caller keeps the returned state and passes it back as `prev`.
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.MMPerf = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  const TIERS = ['low', 'mid', 'high'];
  const CAPS = {
    high: { dpr: 2, sparks: 64, deathGhosts: 24, terrainAnim: true },
    mid: { dpr: 1.5, sparks: 32, deathGhosts: 12, terrainAnim: true },
    low: { dpr: 1, sparks: 12, deathGhosts: 4, terrainAnim: false }
  };
  const HIGH_MS = 20, MID_MS = 33, STEP_UP_MS = 3000, MIN_SAMPLES = 5, MAX_FRAME_MS = 1000;
  function clean(samples) {
    const out = [];
    if (!Array.isArray(samples)) return out;
    for (let i = 0; i < samples.length && out.length < 600; i++) {
      const v = samples[i];
      if (typeof v === 'number' && isFinite(v) && v > 0) out.push(Math.min(MAX_FRAME_MS, v));
    }
    return out;
  }
  function median(a) { const s = a.slice().sort((x, y) => x - y), m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; }
  function tierFor(ms) { return ms <= HIGH_MS ? 'high' : ms <= MID_MS ? 'mid' : 'low'; }
  function result(tier, goodMs, forced) { return { tier, caps: Object.assign({}, CAPS[tier]), goodMs, forced }; }
  // samples: frame times in ms. prefs: {lowGfx}. prev: a previous result {tier, goodMs}.
  function profile(samples, prefs, prev) {
    if (prefs && typeof prefs === 'object' && prefs.lowGfx === true) return result('low', 0, true);
    const p = prev && typeof prev === 'object' && TIERS.indexOf(prev.tier) >= 0 ? prev : null;
    const cur = p ? p.tier : 'high';
    const good = p && typeof p.goodMs === 'number' && isFinite(p.goodMs) && p.goodMs > 0 ? p.goodMs : 0;
    const s = clean(samples);
    if (s.length < MIN_SAMPLES) return result(cur, good, false);
    const target = tierFor(median(s)), ci = TIERS.indexOf(cur), ti = TIERS.indexOf(target);
    if (ti < ci) return result(target, 0, false);           // step down at once
    if (ti === ci) return result(cur, 0, false);
    const total = good + s.reduce((a, b) => a + b, 0);       // better than current: must hold 3 s
    return total >= STEP_UP_MS ? result(TIERS[ci + 1], 0, false) : result(cur, total, false);
  }
  return { TIERS, CAPS, STEP_UP_MS, profile, tierFor };
});
