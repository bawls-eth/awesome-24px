// MMStalk: weekly turnip price simulation for Stalk Market. Pure; no wagering UI, no real money.
// A week is 14 half-day prices (Mon..Sun, AM/PM) derived from a seed; same seed = same week.
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.MMStalk = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  const PATTERNS = ['decreasing', 'random', 'smallSpike', 'largeSpike'];
  const ROT_DAYS = 7;
  const CELLAR_BONUS = 2;
  const QUICK_DAY_MS = 120000; // Quick mode: one game day = 2 real minutes

  function rng(seed) {
    let h = 2166136261 >>> 0;
    const str = String(seed);
    for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; }
    return function () {
      h = (h + 0x6D2B79F5) >>> 0;
      let t = h;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function week(seed) {
    const r = rng('stalk|' + seed);
    const pattern = PATTERNS[Math.floor(r() * 4)];
    const base = 90 + Math.floor(r() * 21); // buy price 90..110
    const p = [];
    const pct = (lo, hi) => lo + r() * (hi - lo);
    if (pattern === 'decreasing') {
      let rate = pct(0.85, 0.90);
      for (let i = 0; i < 14; i++) { p.push(rate); rate -= pct(0.03, 0.05); }
    } else if (pattern === 'random') {
      for (let i = 0; i < 14; i++) p.push(pct(0.6, 1.4));
    } else {
      const peak = Math.floor(r() * 5) + 2; // spike starts at half-day 2..6
      const large = pattern === 'largeSpike';
      for (let i = 0; i < 14; i++) {
        if (i < peak) p.push(pct(0.6, 0.9) - (i * 0.02));
        else if (i === peak) p.push(large ? pct(0.9, 1.4) : pct(0.9, 1.1));
        else if (i === peak + 1) p.push(large ? pct(1.4, 2.0) : pct(1.1, 1.4));
        else if (i === peak + 2) p.push(large ? pct(2.0, 6.0) : pct(1.4, 2.0));
        else if (i === peak + 3) p.push(large ? pct(1.4, 2.0) : pct(1.1, 1.4));
        else if (i === peak + 4) p.push(large ? pct(0.9, 1.4) : pct(0.9, 1.1));
        else p.push(pct(0.4, 0.9));
      }
    }
    const prices = p.map((x) => Math.max(1, Math.round(base * x)));
    return { seed: String(seed), pattern, buyPrice: base, prices };
  }

  // day 0..6 (Mon=0) and half (0 AM / 1 PM). Quick: from elapsed ms since week start. Slow: from a real Date.
  function clockState(mode, ctx) {
    if (mode === 'slow') {
      const d = ctx && ctx.date ? ctx.date : new Date();
      return { day: (d.getDay() + 6) % 7, half: d.getHours() >= 12 ? 1 : 0 };
    }
    const el = Math.max(0, (ctx && ctx.elapsedMs) || 0);
    return { day: Math.floor(el / QUICK_DAY_MS) % 7, half: (el % QUICK_DAY_MS) >= QUICK_DAY_MS / 2 ? 1 : 0 };
  }
  function priceNow(w, mode, ctx) { const c = clockState(mode, ctx); return w.prices[c.day * 2 + c.half]; }

  // inventory: batches {qty, boughtDay}; days are absolute counters. cellar upgrade adds 2 days.
  function rotDays(cellar) { return ROT_DAYS + (cellar ? CELLAR_BONUS : 0); }
  function isRotten(batch, today, cellar) { return today - batch.boughtDay >= rotDays(cellar); }
  function sellable(batches, today, cellar) {
    return batches.filter((b) => !isRotten(b, today, cellar)).reduce((a, b) => a + b.qty, 0);
  }
  function profitMultiple(buyPrice, sellPrice) { return buyPrice > 0 ? sellPrice / buyPrice : 0; }
  // secret exit goal: sell at >= 3x the buy price
  function isSecretSale(buyPrice, sellPrice) { return profitMultiple(buyPrice, sellPrice) >= 3; }

  // almanac: a pattern's entry is readable only after that pattern has been seen
  function createAlmanac(seen) {
    const set = new Set(seen || []);
    return {
      see(pattern) { if (PATTERNS.indexOf(pattern) >= 0) set.add(pattern); },
      isUnlocked(pattern) { return set.has(pattern); },
      list() { return PATTERNS.filter((x) => set.has(x)); },
      save() { return PATTERNS.filter((x) => set.has(x)); }
    };
  }

  return { PATTERNS, ROT_DAYS, CELLAR_BONUS, QUICK_DAY_MS, week, clockState, priceNow, rotDays, isRotten, sellable, profitMultiple, isSecretSale, createAlmanac };
});
