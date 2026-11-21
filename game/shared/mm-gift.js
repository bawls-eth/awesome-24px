// MMGift: the daily gift (NEXT-SLICES GF1). One claim per UTC day. The count is TOTAL DAYS CLAIMED: it never resets,
// there are no streaks, no timers, no countdown and nothing is ever bought. Rewards are free play-money (shards)
// or, on day 7 / 14 / 30, a cosmetic token. Pure: no DOM, no clock (callers pass today's UTC date), no Math.random.
// Save key `pixeltown-gift-v1` = { v:1, days:int, last:'YYYY-MM-DD'|null }. Anything invalid is cleaned to defaults.
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./rng.js'), require('./mm-daily.js'));
  else root.MMGift = factory(root.MMRng, root.MMDaily);
})(typeof self !== 'undefined' ? self : this, function (MMRng, MMDaily) {
  const KEY = 'pixeltown-gift-v1', MAX_RAW = 2000, MAX_DAYS = 99999;
  const MILESTONES = [7, 14, 30];
  const TOKEN = 'token_star'; // b22 item art id
  const SHARDS_MIN = 20, SHARDS_MAX = 40;
  const fresh = () => ({ v: 1, days: 0, last: null });

  // clean(raw, todayUtc?): bad shape -> fresh. days clamped to a whole 0..99999. A `last` date that is not real, or (when a valid today
  // is given) lies in the future, is ignored (null) so a wrong clock can never lock the gift. The count itself is never reduced.
  function clean(raw, todayUtc) {
    const o = fresh();
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return o;
    const d = Object.prototype.hasOwnProperty.call(raw, 'days') ? raw.days : 0;
    if (typeof d === 'number' && Number.isFinite(d)) o.days = Math.max(0, Math.min(MAX_DAYS, Math.floor(d)));
    const l = MMDaily.cleanDate(Object.prototype.hasOwnProperty.call(raw, 'last') ? raw.last : null);
    const t = MMDaily.cleanDate(todayUtc);
    if (l && !(t && l > t)) o.last = l;
    return o;
  }

  // canClaim(state, todayUtc): true when today is a valid date and was not claimed yet. Gaps never matter.
  function canClaim(state, todayUtc) {
    const t = MMDaily.cleanDate(todayUtc);
    if (!t) return false;
    return clean(state, t).last !== t;
  }

  // giftFor(n): the gift for total-day number n (1-based). Seeded by n only, so identical for everyone.
  function giftFor(n) {
    const day = Math.max(1, Math.min(MAX_DAYS, Math.floor(Number(n)) || 1));
    if (MILESTONES.indexOf(day) >= 0) return { day: day, kind: 'token', token: TOKEN, shards: 0, milestone: true };
    const r = MMRng.create('mm-gift:' + day);
    return { day: day, kind: 'shards', token: null, shards: r.int(SHARDS_MIN, SHARDS_MAX), milestone: false };
  }

  // claim(state, todayUtc) -> { state, gift }. gift is null when already claimed today or the date is invalid (state returned cleaned, unchanged).
  function claim(state, todayUtc) {
    const t = MMDaily.cleanDate(todayUtc), s = clean(state, t);
    if (!t || s.last === t || s.days >= MAX_DAYS) return { state: s, gift: null };
    const next = { v: 1, days: s.days + 1, last: t };
    return { state: next, gift: giftFor(next.days) };
  }

  // summary(state, todayUtc): for a UI card. Plain facts only: no countdown, no "missed" wording.
  function summary(state, todayUtc) {
    const t = MMDaily.cleanDate(todayUtc), s = clean(state, t);
    const nextMilestone = MILESTONES.find((m) => m > s.days) || null;
    return { total: s.days, claimedToday: !!t && s.last === t, canClaim: canClaim(s, t), preview: giftFor(s.days + 1), nextMilestone: nextMilestone };
  }

  // load / save: never throw. Corrupt, oversized or missing -> fresh.
  function load(storage, todayUtc) {
    try {
      const s = storage && storage.getItem(KEY);
      if (typeof s !== 'string' || s.length > MAX_RAW) return fresh();
      return clean(JSON.parse(s), todayUtc);
    } catch (e) { return fresh(); }
  }
  function save(storage, state) {
    const c = clean(state);
    try { storage.setItem(KEY, JSON.stringify(c)); return c; } catch (e) { return null; }
  }

  return { KEY, MILESTONES, TOKEN, SHARDS_MIN, SHARDS_MAX, MAX_DAYS, fresh, clean, canClaim, giftFor, claim, summary, load, save };
});
