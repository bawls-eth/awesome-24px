// Lakeside Angler depth (pure, no DOM, seeded only): daily tournament, bait economy, aquarium.
// Play-money only. UMD: browser global MMAnglerDepth (needs MMAngler), or require().
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./mm-angler.js'));
  else root.MMAnglerDepth = factory(root.MMAngler);
}(typeof self !== 'undefined' ? self : this, function (A) {
  const DAY_MAX = 99999;
  function clampInt(v, lo, hi) { v = Math.floor(Number(v)); return isFinite(v) ? Math.max(lo, Math.min(hi, v)) : lo; }
  // Calendar day number from a local y/m/d. Real-day input only; tests pass ?day=N.
  function dayNumber(y, m, d) { return clampInt(Math.floor(Date.UTC(y, m - 1, d) / 86400000), 0, DAY_MAX); }
  function clampDay(v, fallback) { const n = Number(v); return isFinite(n) ? clampInt(n, 0, DAY_MAX) : fallback; }

  // ---------- tournament ----------
  const CASTS = 5;
  const RANKS = { bronze: 120, silver: 300, gold: 550 };
  const TOUR_SPOTS = ['west', 'east', 'river', 'pier']; // always open, so the day is the same for everyone
  const NEUTRAL = { month: 6, hour: 12, weather: 'clear' };
  const hashDay = (day, salt) => (Math.imul(day + 1, 2654435761) ^ Math.imul(salt + 7, 40503)) >>> 0;
  function forDay(day) {
    day = clampInt(day, 0, DAY_MAX);
    const r = A.seedRng(hashDay(day, 1));
    const spot = TOUR_SPOTS[Math.floor(r() * TOUR_SPOTS.length)];
    const cand = A.pool(spot, NEUTRAL).filter((f) => !f.time && !f.seasons && !f.weather && !f.secret && f.rarity <= 3);
    const target = cand[Math.floor(r() * cand.length)];
    return { day, spot, target: target.id, casts: CASTS, ranks: RANKS };
  }
  // The n-th cast (0-based) of a day: same for every player. Target species is weighted up so it shows.
  function castFor(day, n) {
    const t = forDay(day), r = A.seedRng(hashDay(day, 100 + clampInt(n, 0, CASTS - 1)));
    const p = A.pool(t.spot, NEUTRAL);
    const ws = p.map((f) => A.weightOf(f, NEUTRAL, {}) * (f.id === t.target ? 4 : 1));
    let total = 0; ws.forEach((w) => { total += w; });
    let x = r() * total, fish = p[p.length - 1];
    for (let i = 0; i < p.length; i++) { x -= ws[i]; if (x < 0) { fish = p[i]; break; } }
    return { fish: fish.id, size: A.rollSize(r, fish), wait: A.BITE.minWait + r() * (A.BITE.maxWait - A.BITE.minWait), seed: Math.floor(r() * 1e9) };
  }
  function scoreCatch(fishId, size, day) {
    const f = A.BY_ID[fishId]; if (!f) return 0;
    const base = clampInt(size, 0, 9999) * f.rarity;
    return base * (forDay(day).target === fishId ? 2 : 1);
  }
  function rankOf(score) { return score >= RANKS.gold ? 'gold' : score >= RANKS.silver ? 'silver' : score >= RANKS.bronze ? 'bronze' : 'none'; }
  const BADGE_TITLES = { bronze: 'Bronze Hook', silver: 'Silver Hook', gold: 'Gold Hook', streak3: 'Three-Day Streak', streak7: 'Week Streak', streak30: 'Month Streak' };
  function start(journal, day) {
    const j = A.journal.cleanFull(journal);
    if (j.tour.last === day) return { journal: j, ok: false, reason: 'done' };
    if (j.tour.run && j.tour.run.day === day) return { journal: j, ok: true, resumed: true };
    j.tour.run = { day, used: 0, score: 0 };
    return { journal: A.journal.cleanFull(j), ok: true };
  }
  // Mark a cast as taken (before it resolves) -> the cast number to roll.
  function takeCast(journal, day) {
    const j = A.journal.cleanFull(journal), run = j.tour.run;
    if (!run || run.day !== day || run.used >= CASTS) return { journal: j, n: -1 };
    const n = run.used; run.used += 1;
    return { journal: A.journal.cleanFull(j), n };
  }
  function addScore(journal, pts) {
    const j = A.journal.cleanFull(journal);
    if (j.tour.run) j.tour.run.score = Math.min(99999, j.tour.run.score + clampInt(pts, 0, 9999));
    return A.journal.cleanFull(j);
  }
  // Finish when all casts are used. Returns {journal, result:{score, rank, streak, badges:[]}}.
  function finish(journal, day) {
    const j = A.journal.cleanFull(journal), run = j.tour.run;
    if (!run || run.day !== day || run.used < CASTS) return { journal: j, result: null };
    const t = j.tour, score = run.score, rank = rankOf(score), got = [];
    t.streak = t.last === day - 1 ? Math.min(9999, t.streak + 1) : 1;
    t.last = day; t.played = Math.min(99999, t.played + 1); t.run = null;
    if (score >= t.best.score) t.best = { day, score };
    if (rank !== 'none') {
      t.medals[rank] += 1;
      if (!j.badges[rank]) { j.badges[rank] = true; got.push(rank); }
    }
    [['streak3', 3], ['streak7', 7], ['streak30', 30]].forEach((s) => { if (t.streak >= s[1] && !j.badges[s[0]]) { j.badges[s[0]] = true; got.push(s[0]); } });
    return { journal: A.journal.cleanFull(j), result: { day, score, rank, streak: t.streak, badges: got } };
  }
  // The streak shown on screen: a missed day resets it (display only; no nag).
  function liveStreak(journal, day) { const t = A.journal.cleanFull(journal).tour; return t.last === day || t.last === day - 1 ? t.streak : 0; }

  // ---------- economy (play money, hard caps) ----------
  const CAPS = { bells: 99999, bait: 99, stock: 99 };
  const SELL = { 1: 6, 2: 15, 3: 40, 4: 110, 5: 400 };
  const BAIT_PRICE = { plain: 10, quick: 18, rare: 45, big: 30 };
  const DROP_CHANCE = { 1: 0.15, 2: 0.25, 3: 0.4, 4: 0.6, 5: 1 };
  const BAIT_INFO = {
    plain: 'Faster bite, slightly better fish',
    quick: 'Much faster bite',
    rare: 'Rare and epic fish bite far more',
    big: 'Fish come out bigger',
  };
  function baitCount(j, type) { return type === 'plain' ? j.bait : (j.baits[type] || 0); }
  function setBait(j, type, n) { if (type === 'plain') j.bait = clampInt(n, 0, CAPS.bait); else j.baits[type] = clampInt(n, 0, CAPS.bait); }
  // Seeded, deterministic bait drop on a catch: returns a bait id or null.
  function baitDrop(fishId, size, counter) {
    const f = A.BY_ID[fishId]; if (!f || f.boss) return null;
    const r = A.seedRng((Math.imul(clampInt(counter, 0, 1e9) + 3, 2246822519) ^ Math.imul(size + 11, 3266489909) ^ (f.id.length * 7919)) >>> 0);
    if (r() >= (DROP_CHANCE[f.rarity] || 0)) return null;
    const k = r();
    if (f.rarity <= 2) return 'plain';
    if (f.rarity === 3) return k < 0.5 ? 'quick' : 'plain';
    return k < 0.4 ? 'rare' : k < 0.75 ? 'big' : 'quick';
  }
  function addBait(journal, type) {
    const j = A.journal.cleanFull(journal);
    if (!A.BAITS[type]) return { journal: j, ok: false };
    const have = baitCount(j, type);
    if (have >= CAPS.bait) return { journal: j, ok: false, reason: 'cap' };
    setBait(j, type, have + 1);
    return { journal: A.journal.cleanFull(j), ok: true };
  }
  function addStock(journal, fishId) {
    const j = A.journal.cleanFull(journal), f = A.BY_ID[fishId];
    if (!f || f.boss) return j; // bosses are trophies, not for sale
    j.stock[fishId] = Math.min(CAPS.stock, (j.stock[fishId] || 0) + 1);
    return A.journal.cleanFull(j);
  }
  function sellPrice(fishId) { const f = A.BY_ID[fishId]; return f && !f.boss ? SELL[f.rarity] : 0; }
  function sell(journal, fishId, count) {
    const j = A.journal.cleanFull(journal), have = j.stock[fishId] || 0;
    const n = Math.min(have, clampInt(count, 0, CAPS.stock));
    if (n < 1) return { journal: j, ok: false, reason: 'none', gained: 0 };
    const room = Math.floor((CAPS.bells - j.bells) / sellPrice(fishId));
    const m = Math.min(n, room);
    if (m < 1) return { journal: j, ok: false, reason: 'cap', gained: 0 };
    j.stock[fishId] = have - m; if (j.stock[fishId] < 1) delete j.stock[fishId];
    j.bells += m * sellPrice(fishId);
    return { journal: A.journal.cleanFull(j), ok: true, gained: m * sellPrice(fishId), sold: m };
  }
  function buy(journal, type, count) {
    const j = A.journal.cleanFull(journal);
    if (!BAIT_PRICE[type]) return { journal: j, ok: false, reason: 'unknown' };
    const want = clampInt(count, 1, CAPS.bait), room = CAPS.bait - baitCount(j, type);
    const n = Math.min(want, room, Math.floor(j.bells / BAIT_PRICE[type]));
    if (n < 1) return { journal: j, ok: false, reason: room < 1 ? 'cap' : 'bells' };
    j.bells -= n * BAIT_PRICE[type]; setBait(j, type, baitCount(j, type) + n);
    return { journal: A.journal.cleanFull(j), ok: true, bought: n };
  }
  // Use one bait of the selected type for a cast. Returns type null when none is left.
  function useBait(journal) {
    const j = A.journal.cleanFull(journal), type = j.baitType;
    if (baitCount(j, type) < 1) return { journal: j, type: null };
    setBait(j, type, baitCount(j, type) - 1);
    return { journal: A.journal.cleanFull(j), type };
  }
  function setBaitType(journal, type) {
    const j = A.journal.cleanFull(journal);
    if (A.BAITS[type]) j.baitType = type;
    return A.journal.cleanFull(j);
  }

  // ---------- aquarium ----------
  const SET_BONUS = 150;
  function spotSet(journal, spot) {
    const j = A.journal.cleanFull(journal);
    const all = A.FISH.filter((f) => f.spots.indexOf(spot) >= 0 && !f.boss && !f.secret);
    const have = all.filter((f) => j.caught[f.id]).length;
    return { spot, total: all.length, have, complete: all.length > 0 && have === all.length, claimed: !!j.sets[spot], bonus: SET_BONUS };
  }
  function claimSet(journal, spot) {
    const j = A.journal.cleanFull(journal), s = spotSet(j, spot);
    if (A.SPOTS.indexOf(spot) < 0 || !s.complete || s.claimed) return { journal: j, ok: false };
    j.sets[spot] = true; j.badges['set_' + spot] = true;
    j.bells = Math.min(CAPS.bells, j.bells + SET_BONUS);
    return { journal: A.journal.cleanFull(j), ok: true, bonus: SET_BONUS };
  }
  function hallOfRecords(journal) {
    const j = A.journal.cleanFull(journal);
    return Object.keys(A.BOSSES).map((id) => ({
      id, name: A.BY_ID[id].name, spot: A.BY_ID[id].spots[0], caught: !!j.bosses[id],
      n: j.caught[id] ? j.caught[id].n : 0, best: j.caught[id] ? j.caught[id].best : 0, trophy: !!j.trophies[id],
    }));
  }
  function tankEntries(journal) {
    const j = A.journal.cleanFull(journal);
    return A.FISH.filter((f) => j.caught[f.id]).map((f) => ({ id: f.id, name: f.name, rarity: f.rarity, n: j.caught[f.id].n, best: j.caught[f.id].best }));
  }

  return {
    DAY_MAX, CASTS, RANKS, CAPS, SELL, BAIT_PRICE, BAIT_INFO, DROP_CHANCE, SET_BONUS, BADGE_TITLES,
    dayNumber, clampDay,
    tournament: { forDay, castFor, scoreCatch, rankOf, start, takeCast, addScore, finish, liveStreak },
    economy: { baitDrop, addBait, addStock, sellPrice, sell, buy, useBait, setBaitType, baitCount },
    aquarium: { spotSet, claimSet, hallOfRecords, tankEntries },
  };
}));
