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
  const MAX_PRICE = 700;        // no price anywhere (town or neighbour) can exceed this
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


  // ---- advisor (slice 1): an ESTIMATE of which pattern family this week is, from prices seen so far ----
  const PRIOR = { decreasing: 0.25, random: 0.30, largeSpike: 0.25, smallSpike: 0.20 };
  const ADV_SIMS = 3000, ADV_USE = 6, ADV_SIGMA = 0.06;
  let advBank = null;
  function advisorBank() {
    if (advBank) return advBank;
    advBank = [];
    for (let i = 0; i < ADV_SIMS; i++) {
      const w = generateWeek('advisor|' + i);
      advBank.push({ pattern: w.pattern, ratios: w.sell.slice(0, ADV_USE).map((v) => v / w.buyPrice) });
    }
    return advBank;
  }
  // known = prices seen so far, index 0 = Sunday buy price. Pure and deterministic (no Math.random).
  function advise(known) {
    const prices = Array.isArray(known) ? known.map(Number).filter((v) => isFinite(v) && v > 0) : [];
    const sells = Math.max(0, prices.length - 1);
    const probs = {}; PATTERNS.forEach((p) => { probs[p] = PRIOR[p]; });
    if (sells < 2 || prices[0] <= 0) {
      return { ready: false, sells, probs, top: null, topProb: 0, text: 'Sprout\'s tip: need two sell prices (Mon AM and PM) before I can estimate the pattern.' };
    }
    const obs = prices.slice(1, 1 + ADV_USE).map((v) => v / prices[0]);
    const bank = advisorBank();
    const logw = bank.map((b) => { let d = 0; for (let i = 0; i < obs.length; i++) { const e = (b.ratios[i] - obs[i]) / ADV_SIGMA; d += e * e; } return -d / 2; });
    const mx = Math.max.apply(null, logw);
    const acc = { decreasing: 0, random: 0, largeSpike: 0, smallSpike: 0 }; let tot = 0;
    bank.forEach((b, i) => { const w = Math.exp(logw[i] - mx); acc[b.pattern] += w; tot += w; });
    let top = null;
    PATTERNS.forEach((p) => { probs[p] = Math.round((0.97 * (acc[p] / tot) + 0.03 * PRIOR[p]) * 1000) / 1000; if (!top || probs[p] > probs[top]) top = p; });
    const pct = (p) => Math.round(probs[p] * 100) + '%';
    const text = 'Sprout\'s tip (an estimate, not a promise): about ' + pct(top) + ' ' + PATTERN_NAMES[top] + '. ' +
      PATTERNS.filter((p) => p !== top).sort((a, b) => probs[b] - probs[a]).map((p) => pct(p) + ' ' + PATTERN_NAMES[p]).join(', ') + '.';
    return { ready: true, sells, probs, top, topProb: probs[top], text };
  }

  // ---- save ----
  function int(v, lo, hi, def) { v = Math.trunc(Number(v)); return isFinite(v) ? Math.max(lo, Math.min(hi, v)) : def; }
  function defaultSave() {
    return { v: 1, balance: START_BALANCE, holdings: 0, week: -1, invested: 0, earned: 0, history: [], last: null, best: 0, medals: { bronze: false, silver: false, gold: false }, hint: false, total: 0, played: 0, wkBest: 0, goals: 0 };
  }
  function cleanEntry(e) {
    if (!e || typeof e !== 'object' || PATTERNS.indexOf(e.pattern) < 0) return null;
    return { week: int(e.week, 0, MAX_WEEK, 0), pattern: e.pattern, profit: int(e.profit, -MAX_BALANCE, MAX_BALANCE, 0), goals: int(e.goals, 0, 7, 0) };
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
    // additive (slice 2): lifetime stats; older saves derive them from the kept history
    s.total = raw.total === undefined ? int(s.history.reduce((a, h) => a + h.profit, 0), -MAX_BALANCE, MAX_BALANCE, 0) : int(raw.total, -MAX_BALANCE, MAX_BALANCE, 0);
    s.played = raw.played === undefined ? s.history.length : int(raw.played, 0, MAX_WEEK, 0);
    s.wkBest = s.week < 0 ? 0 : int(raw.wkBest, 0, MAX_PRICE, 0);
    s.goals = s.week < 0 ? 0 : int(raw.goals, 0, 7, 0);
    // G-11 (additive): the furthest week / slot this save has seen ({ w, s }); only kept when present, so an old save stays byte-identical
    if (raw.seen && typeof raw.seen === 'object' && !Array.isArray(raw.seen)) s.seen = { w: int(raw.seen.w, 0, MAX_WEEK, 0), s: int(raw.seen.s, 0, SLOTS - 1, 0) };
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
      const entry = { week: s.week, pattern: generateWeek(s.week).pattern, profit, goals: goalsDone(s, generateWeek(s.week)) };
      s.last = entry;
      if (s.invested > 0 || s.earned > 0) {
        s.history = s.history.concat([entry]).slice(-MAX_HISTORY);
        s.played = Math.min(MAX_WEEK, s.played + 1);
        s.total = Math.max(-MAX_BALANCE, Math.min(MAX_BALANCE, s.total + profit));
      }
      if (profit > s.best) s.best = profit;
      MEDALS.forEach((m) => { if (profit >= m[1]) s.medals[m[0]] = true; });
    }
    s.week = week; s.holdings = 0; s.invested = 0; s.earned = 0; s.wkBest = 0; s.goals = 0;
    if (s.balance < ALLOWANCE_FLOOR) s.balance = ALLOWANCE_FLOOR;
    return { save: s, spoiled, rolled: true };
  }


  // ---- weekly goals (slice 2): plain targets, no timers, no penalties for missing them ----
  const GOALS = [
    { id: 'profit', bit: 1, title: 'Profit 500', desc: 'Finish the week 500 bells ahead.' },
    { id: 'peak', bit: 2, title: 'Sell at the peak', desc: 'Sell at (nearly) the highest price of the week, at least what you paid.' },
    { id: 'even', bit: 4, title: 'Break even', desc: 'Sell every stalk and end the week with no loss.' },
  ];
  function goalsDone(save, wk) {
    const s = cleanSave(save), peak = Math.max.apply(null, wk.sell);
    let bits = s.goals;
    if (weekProfit(s) >= 500) bits |= 1;
    if (s.wkBest > 0 && s.wkBest >= wk.buyPrice && s.wkBest >= Math.floor(peak * 0.95)) bits |= 2;
    if (s.earned > 0 && s.holdings === 0 && weekProfit(s) >= 0) bits |= 4;
    return bits;
  }
  function latchGoals(save, wk) { const s = clone(cleanSave(save)); s.goals = goalsDone(s, wk); return s; }
  function goalStatus(save, wk) {
    const bits = goalsDone(save, wk);
    return GOALS.map((g) => ({ id: g.id, title: g.title, desc: g.desc, done: (bits & g.bit) !== 0 }));
  }
  function lifetime(save) {
    const s = cleanSave(save);
    return { best: s.best, total: s.total, played: s.played, rank: rankFor(s.best) };
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
    const price = priceAt(wk, slot), gain = qty * price;
    s.balance = Math.min(MAX_BALANCE, s.balance + gain); s.holdings -= qty; s.earned += gain;
    s.wkBest = Math.max(s.wkBest, Math.min(MAX_PRICE, price));
    return { ok: true, qty, gain, save: s };
  }
  // ---- neighbours (slice 3): offline NPC villagers with their own seeded prices; no network, no real players ----
  const NEIGHBOURS = [
    { id: 'pip', name: 'Pip the Mole' },
    { id: 'maple', name: 'Maple' },
    { id: 'bramble', name: 'Bramble' },
  ];
  const NEIGHBOUR_FEE = 15; // bells, fixed per deal
  function neighbourWeek(id, week) { return generateWeek('neighbour|' + String(id) + '|' + int(week, 0, MAX_WEEK, 0)); }
  function neighbourPrice(id, week, slot) {
    slot = clampSlot(slot);
    if (slot === 0) return 0; // neighbours only buy Monday to Saturday
    return Math.min(MAX_PRICE, neighbourWeek(id, week).sell[slot - 1]);
  }
  // Offers at `slot`, plus which neighbour pays the most (ties go to the first listed).
  function neighbourOffers(week, slot) {
    const offers = NEIGHBOURS.map((n) => ({ id: n.id, name: n.name, price: neighbourPrice(n.id, week, slot), best: false }));
    if (clampSlot(slot) > 0) { let b = offers[0]; offers.forEach((o) => { if (o.price > b.price) b = o; }); b.best = true; }
    return offers;
  }
  function sellToNeighbour(save, id, week, slot, qty) {
    const s = clone(cleanSave(save));
    qty = int(qty, 0, MAX_HOLD, 0);
    if (!NEIGHBOURS.some((n) => n.id === id)) return { ok: false, reason: 'neighbour', save: s };
    if (qty < 1) return { ok: false, reason: 'quantity', save: s };
    if (clampSlot(slot) === 0) return { ok: false, reason: 'no-sunday-sales', save: s };
    if (qty > s.holdings) return { ok: false, reason: 'holdings', save: s };
    const price = neighbourPrice(id, week, slot), gross = qty * price;
    if (gross <= NEIGHBOUR_FEE) return { ok: false, reason: 'fee', save: s };
    const gain = gross - NEIGHBOUR_FEE;
    s.balance = Math.min(MAX_BALANCE, s.balance + gain); s.holdings -= qty; s.earned += gain;
    s.wkBest = Math.max(s.wkBest, price);
    return { ok: true, qty, price, gross, fee: NEIGHBOUR_FEE, gain, save: s };
  }

  // ---- display only (MG4): plain-language "market notes" and the "Week of <date>" label ----
  // These READ prices from generateWeek/knownPrices and never change prices, seeds or saves. They describe the past only:
  // no advice, no promises and no urgency words.
  const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  // The Sunday that starts `week` (inverse of weekNumber), as a calendar date.
  function weekStart(week) {
    const w = clampWeek(week) || 0;
    const d = new Date(Math.max(0, w * 7 - 4) * 86400000);
    return { y: d.getUTCFullYear(), m: d.getUTCMonth(), d: d.getUTCDate() };
  }
  function weekLabel(week) { const s = weekStart(week); return 'Week of ' + s.d + ' ' + MONTHS[s.m] + ' ' + s.y; }
  const SHAPE_WORDS = {
    decreasing: 'Prices slid a little lower almost every half-day.',
    random: 'Prices wandered up and down in waves.',
    largeSpike: 'Prices dipped for a while, jumped far above the Sunday price for a short time, then fell back.',
    smallSpike: 'Prices dipped, climbed to about double the Sunday price for a short time, then fell back.',
  };
  const STEP = 0.02; // moves under 2% read as "held steady"
  function moveOf(a, b) { return b > a * (1 + STEP) ? 1 : b < a * (1 - STEP) ? -1 : 0; }
  function countWord(n) { return ['no', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve'][n] || String(n); }
  // Notes on this week so far: prices known at `slot`. Returns plain sentences.
  function marketNotes(wk, slot) {
    slot = clampSlot(slot);
    const known = knownPrices(wk, slot), buy = wk.buyPrice, out = [];
    if (slot === 0) {
      out.push('Today is Sunday: the only price so far is the buy price of ' + buy + ' bells.');
      out.push('Sell prices show up on Monday morning and change twice a day.');
      return out;
    }
    const sells = known.slice(1), last = sells[sells.length - 1];
    if (sells.length === 1) out.push('The first sell price this week is ' + last + ' bells, ' + vsBuy(last, buy) + '.');
    else {
      const prev = sells[sells.length - 2], mv = moveOf(prev, last);
      out.push(mv > 0 ? 'Prices rose from ' + prev + ' to ' + last + ' bells since the half-day before.' : mv < 0 ? 'Prices dipped from ' + prev + ' to ' + last + ' bells since the half-day before.' : 'Prices held about steady at ' + last + ' bells since the half-day before.');
      let run = 0, dir = 0;
      for (let i = sells.length - 1; i > 0; i--) { const m = moveOf(sells[i - 1], sells[i]); if (!m || (dir && m !== dir)) break; dir = m; run++; }
      if (run >= 2) out.push('Prices ' + (dir < 0 ? 'dipped' : 'rose') + ' ' + countWord(run) + ' half-days in a row' + (run >= 4 && run % 2 === 0 ? ' (' + countWord(run / 2) + ' days)' : '') + '.');
      out.push('The latest price is ' + vsBuy(last, buy) + '.');
      let hi = 1; for (let i = 2; i <= slot; i++) if (known[i] > known[hi]) hi = i;
      if (hi !== slot) out.push('The highest sell price so far was ' + known[hi] + ' bells on ' + slotLabel(hi) + '.');
      else out.push('This is the highest sell price so far this week.');
    }
    out.push('These notes only describe prices that already happened. Nobody can tell what comes next.');
    return out;
  }
  function vsBuy(v, buy) {
    const pct = Math.round(Math.abs(v - buy) / buy * 100);
    return pct < 2 ? 'about the same as the Sunday price of ' + buy : v > buy ? pct + '% above the Sunday price of ' + buy : pct + '% below the Sunday price of ' + buy;
  }
  // One plain paragraph about the whole of last week (the week before `week`), or null in week 0.
  function lastWeekNote(week) {
    const w = clampWeek(week);
    if (!w) return null;
    const lw = generateWeek(w - 1), sells = lw.sell;
    let lo = 0, hi = 0; for (let i = 1; i < sells.length; i++) { if (sells[i] < sells[lo]) lo = i; if (sells[i] > sells[hi]) hi = i; }
    return weekLabel(w - 1) + ': ' + SHAPE_WORDS[lw.pattern] + ' It opened at ' + lw.buyPrice + ' bells on Sunday. The lowest sell price was ' + sells[lo] + ' on ' + slotLabel(lo + 1) +
      ', the highest was ' + sells[hi] + ' on ' + slotLabel(hi + 1) + ', and it closed at ' + sells[sells.length - 1] + ' on Saturday PM.';
  }

  function maxBuy(save, wk) {
    return Math.max(0, Math.min(MAX_HOLD - save.holdings, Math.floor(save.balance / wk.buyPrice)));
  }

  return {
    CURRENCY, PATTERNS, PATTERN_NAMES, PATTERN_HINTS, SLOTS, SELL_SLOTS, MAX_HOLD, START_BALANCE, ALLOWANCE_FLOOR, MEDALS,
    clampWeek, weekNumber, slotOf, clampSlot, slotLabel, generateWeek, priceAt, knownPrices,
    defaultSave, cleanSave, syncWeek, buy, sell, maxBuy, weekProfit, medalFor, rankFor, advise, GOALS, MAX_PRICE, goalsDone, latchGoals, goalStatus, lifetime, NEIGHBOURS, NEIGHBOUR_FEE, neighbourWeek, neighbourPrice, neighbourOffers, sellToNeighbour,
    weekStart, weekLabel, marketNotes, lastWeekNote,
  };
}));
