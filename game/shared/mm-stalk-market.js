// MMStalkMarket: pure rules for the standalone Stalk Market page. UMD (browser global or require()).
// PLAY MONEY ONLY: "bells" are a free in-game points currency. Nothing here can be bought with real
// money, there is no random reward, and the only time pressure is the natural Sunday spoilage rule.
// (The older game/shared/mm-stalk.js stays for the town; this module is the page's own model.)
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.MMStalkMarket = factory();
}(typeof self !== 'undefined' ? self : this, function () {
  const CURRENCY = Object.freeze({ name: 'bells', realMoney: false, purchasable: false, randomRewards: false });
  const PATTERNS = ['decreasing', 'random', 'largeSpike', 'smallSpike'];
  const PATTERN_NAMES = { decreasing: 'Steady decline', random: 'Wandering prices', largeSpike: 'Big spike', smallSpike: 'Small spike' };
  const PATTERN_HINTS = {
    decreasing: 'Prices only slid down all week. The best move was to sell early and take what you could.',
    random: 'Prices wandered up and down in waves, with no big payoff. Selling on a high wave was the trick.',
    largeSpike: 'Prices dipped, then shot up to several times the buy price for a couple of half-days.',
    smallSpike: 'Prices dipped, then rose to about double the buy price before falling again.',
  };
  const SLOTS = 13;            // 0 = Sunday (buy day), 1..12 = Mon AM .. Sat PM
  const SELL_SLOTS = 12;
  const MAX_HOLD = 200;
  const START_BALANCE = 2000;
  const ALLOWANCE_FLOOR = 1000; // a free fresh start if you are nearly broke at a new week; no strings
  const MAX_BALANCE = 99999999;
  const MAX_WEEK = 1000000;
  const MAX_HISTORY = 12;
  const MEDALS = [['bronze', 500], ['silver', 2000], ['gold', 10000]];
  const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

  function rngFor(seed) {
    let h = 2166136261 >>> 0;
    const s = 'stalk-market|' + String(seed);
    for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; }
    return function () {
      h = (h + 0x6D2B79F5) >>> 0;
      let t = h;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  // ---- calendar ----
  function clampWeek(n) {
    if (n === null || n === undefined || (typeof n === 'string' && n.trim() === '')) return null;
    const v = Number(n);
    if (!isFinite(v)) return null;
    return Math.max(0, Math.min(MAX_WEEK, Math.trunc(v)));
  }
  // Sunday-anchored week number from the LOCAL calendar date (same for everyone on the same date).
  function weekNumber(date) {
    const d = date || new Date();
    const days = Math.floor(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / 86400000);
    return Math.floor((days + 4) / 7); // 1970-01-01 was a Thursday
  }
  // 0 = Sunday buy slot; Mon..Sat -> 1 + 2*(day-1) + (pm ? 1 : 0)
  function slotOf(date) {
    const d = date || new Date();
    const dow = d.getDay();
    if (dow === 0) return 0;
    return 1 + (dow - 1) * 2 + (d.getHours() >= 12 ? 1 : 0);
  }
  function clampSlot(n) { n = Math.trunc(Number(n)); return isFinite(n) ? Math.max(0, Math.min(SLOTS - 1, n)) : 0; }
  function slotLabel(slot) {
    slot = clampSlot(slot);
    if (slot === 0) return 'Sunday';
    return DAY_NAMES[Math.floor((slot - 1) / 2) + 1] + ((slot - 1) % 2 ? ' PM' : ' AM');
  }

  // ---- price pattern ----
  function generateWeek(seed) {
    const r = rngFor(seed);
    const buyPrice = 90 + Math.floor(r() * 21); // 90..110
    const roll = r();
    const pattern = roll < 0.25 ? 'decreasing' : roll < 0.55 ? 'random' : roll < 0.8 ? 'largeSpike' : 'smallSpike';
    const pct = (lo, hi) => lo + r() * (hi - lo);
    const rates = [];
    function dec(n, floor) { // falling run from ~0.9 down by 3-5% a half-day
      let rate = pct(0.85, 0.9);
      for (let i = 0; i < n; i++) { rates.push(Math.max(floor, rate)); rate -= pct(0.03, 0.05); }
    }
    if (pattern === 'decreasing') {
      dec(SELL_SLOTS, 0.3);
    } else if (pattern === 'random') {
      let hi = true;
      while (rates.length < SELL_SLOTS) {
        const n = 2 + Math.floor(r() * 3);
        if (hi) { for (let i = 0; i < n; i++) rates.push(pct(0.9, 1.4)); }
        else { let rate = pct(0.6, 0.8); for (let i = 0; i < n; i++) { rates.push(Math.max(0.4, rate)); rate -= pct(0.04, 0.1); } }
        hi = !hi;
      }
      rates.length = SELL_SLOTS;
    } else {
      const large = pattern === 'largeSpike';
      const p = large ? 2 + Math.floor(r() * 6) : Math.floor(r() * 8); // spike start (half-day index)
      if (p > 0) dec(p, 0.4);
      if (large) rates.push(pct(0.9, 1.4), pct(1.4, 2.0), pct(2.0, 6.0), pct(1.4, 2.0), pct(0.9, 1.4));
      else rates.push(pct(0.9, 1.4), pct(0.9, 1.4), pct(1.4, 2.0), pct(1.4, 2.0), pct(1.4, 2.0));
      while (rates.length < SELL_SLOTS) rates.push(pct(0.4, 0.9));
      rates.length = SELL_SLOTS;
    }
    const sell = rates.map((x) => Math.max(1, Math.round(buyPrice * x)));
    return { seed: String(seed), pattern, buyPrice, sell };
  }
  function priceAt(wk, slot) {
    slot = clampSlot(slot);
    return slot === 0 ? wk.buyPrice : wk.sell[slot - 1];
  }
  // Prices you may know at `slot`: Sunday buy price plus every sell price up to now.
  function knownPrices(wk, slot) {
    slot = clampSlot(slot);
    const out = [];
    for (let i = 0; i <= slot; i++) out.push(priceAt(wk, i));
    return out;
  }

  // ---- save ----
  function int(v, lo, hi, def) { v = Math.trunc(Number(v)); return isFinite(v) ? Math.max(lo, Math.min(hi, v)) : def; }
  function defaultSave() {
    return { v: 1, balance: START_BALANCE, holdings: 0, week: -1, invested: 0, earned: 0, history: [], last: null, best: 0, medals: { bronze: false, silver: false, gold: false }, hint: false };
  }
  function cleanEntry(e) {
    if (!e || typeof e !== 'object' || PATTERNS.indexOf(e.pattern) < 0) return null;
    return { week: int(e.week, 0, MAX_WEEK, 0), pattern: e.pattern, profit: int(e.profit, -MAX_BALANCE, MAX_BALANCE, 0) };
  }
  function cleanSave(raw) {
    const s = defaultSave();
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return s;
    s.balance = int(raw.balance, 0, MAX_BALANCE, START_BALANCE);
    s.holdings = int(raw.holdings, 0, MAX_HOLD, 0);
    s.week = int(raw.week, -1, MAX_WEEK, -1);
    s.invested = int(raw.invested, 0, MAX_BALANCE, 0);
    s.earned = int(raw.earned, 0, MAX_BALANCE, 0);
    if (s.week < 0) { s.holdings = 0; s.invested = 0; s.earned = 0; }
    if (Array.isArray(raw.history)) s.history = raw.history.map(cleanEntry).filter(Boolean).slice(-MAX_HISTORY);
    s.last = cleanEntry(raw.last);
    s.best = int(raw.best, 0, MAX_BALANCE, 0);
    const m = raw.medals && typeof raw.medals === 'object' ? raw.medals : {};
    MEDALS.forEach((x) => { s.medals[x[0]] = m[x[0]] === true; });
    s.hint = raw.hint === true;
    return s;
  }
  function clone(s) { return JSON.parse(JSON.stringify(s)); }

  // ---- medals / rank ----
  function medalFor(profit) {
    let out = 'none';
    MEDALS.forEach((m) => { if (profit >= m[1]) out = m[0]; });
    return out;
  }
  function rankFor(best) {
    return best >= 10000 ? 'Stalk Sage' : best >= 2000 ? 'Sharp Trader' : best >= 500 ? 'Market Regular' : 'Sprout Seller';
  }
  function weekProfit(s) { return s.earned - s.invested; }

  // ---- rollover: leftover stalks spoil on the next Sunday (a new real week) ----
  function syncWeek(save, week) {
    const s = clone(cleanSave(save));
    week = int(week, 0, MAX_WEEK, 0);
    if (s.week === week) return { save: s, spoiled: 0, rolled: false };
    let spoiled = 0;
    if (s.week >= 0) {
      spoiled = s.holdings;
      const profit = weekProfit(s);
      const entry = { week: s.week, pattern: generateWeek(s.week).pattern, profit };
      s.last = entry;
      if (s.invested > 0 || s.earned > 0) s.history = s.history.concat([entry]).slice(-MAX_HISTORY);
      if (profit > s.best) s.best = profit;
      MEDALS.forEach((m) => { if (profit >= m[1]) s.medals[m[0]] = true; });
    }
    s.week = week; s.holdings = 0; s.invested = 0; s.earned = 0;
    if (s.balance < ALLOWANCE_FLOOR) s.balance = ALLOWANCE_FLOOR;
    return { save: s, spoiled, rolled: true };
  }

  // ---- trading ----
  function buy(save, wk, slot, qty) {
    const s = clone(cleanSave(save));
    qty = int(qty, 0, MAX_HOLD, 0);
    if (qty < 1) return { ok: false, reason: 'quantity', save: s };
    if (clampSlot(slot) !== 0) return { ok: false, reason: 'sunday-only', save: s };
    if (s.holdings + qty > MAX_HOLD) return { ok: false, reason: 'limit', save: s };
    const cost = qty * wk.buyPrice;
    if (cost > s.balance) return { ok: false, reason: 'funds', save: s };
    s.balance -= cost; s.holdings += qty; s.invested += cost;
    return { ok: true, qty, cost, save: s };
  }
  function sell(save, wk, slot, qty) {
    const s = clone(cleanSave(save));
    qty = int(qty, 0, MAX_HOLD, 0);
    if (qty < 1) return { ok: false, reason: 'quantity', save: s };
    if (clampSlot(slot) === 0) return { ok: false, reason: 'no-sunday-sales', save: s };
    if (qty > s.holdings) return { ok: false, reason: 'holdings', save: s };
    const gain = qty * priceAt(wk, slot);
    s.balance = Math.min(MAX_BALANCE, s.balance + gain); s.holdings -= qty; s.earned += gain;
    return { ok: true, qty, gain, save: s };
  }
  function maxBuy(save, wk) {
    return Math.max(0, Math.min(MAX_HOLD - save.holdings, Math.floor(save.balance / wk.buyPrice)));
  }

  return {
    CURRENCY, PATTERNS, PATTERN_NAMES, PATTERN_HINTS, SLOTS, SELL_SLOTS, MAX_HOLD, START_BALANCE, ALLOWANCE_FLOOR, MEDALS,
    clampWeek, weekNumber, slotOf, clampSlot, slotLabel, generateWeek, priceAt, knownPrices,
    defaultSave, cleanSave, syncWeek, buy, sell, maxBuy, weekProfit, medalFor, rankFor,
  };
}));
