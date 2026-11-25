// MMGameDay (cycle 3, L): ONE place for "which day is it" and "what does a day do to a streak". Pure, no DOM, no storage. UMD: browser
// global MMGameDay, or require(). Nothing here throws.
//
// It does NOT decide the game-day rule (L-08 is the owner's decision: local date or UTC, midnight or 04:00). Today the modes use two rules
// and each caller keeps its own: `utcKey` is the UTC calendar date (Isles; the same value as Date#toISOString().slice(0, 10)), `localNumber`
// is the device's local calendar date as a day number (Angler; the same value as MMAnglerDepth.dayNumber(y, m, d)). When the owner picks
// a rule, `key` and `number` below are the only two functions to change, and the callers that use them follow.
//
// `streakStep` is the cycle 1 L-07 clock rule (Town login / sell streak in main.js) on day numbers, so every streak can share it:
//   same day: nothing. Yesterday: +1. Older or never: a new streak of 1.
//   a stored day in the FUTURE (the device clock was ahead when it was written and is right again):
//     1 or 2 days ahead: that day is already counted: wait for it (streak kept, stored day kept);
//     more than 2 days ahead: the stored day is ignored, the count restarts from today WITHOUT a +1 (streak kept, stored day = today);
//   a device day before FLOOR (a dead clock battery: 1970, 2000): a wrong clock for certain, the streak is left exactly as it is.
//   opts.floor moves or turns off (0) that floor: the Angler applies it only when the stored day is itself on or after FLOOR, because
//   its tests and practice links use small day numbers (?day=100).
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.MMGameDay = factory();
}(typeof self !== 'undefined' ? self : this, function () {
  const MS = 86400000;
  const FUTURE_DAYS = 2;
  const FLOOR = Math.floor(Date.UTC(2026, 10, 1) / MS); // 2026-11-01, the same floor as the Town rule (STREAK_CLOCK_FLOOR)
  const pad = (n) => (n < 10 ? '0' : '') + n;
  const ms = (now) => (now instanceof Date ? now.getTime() : typeof now === 'number' ? now : Date.now());
  const ok = (t) => typeof t === 'number' && isFinite(t) && Math.abs(t) <= 8.64e15;
  // UTC calendar date 'YYYY-MM-DD' ('' for an unusable time)
  function utcKey(now) { const t = ms(now); if (!ok(t)) return ''; try { return new Date(t).toISOString().slice(0, 10); } catch (e) { return ''; } }
  // UTC day number (days since 1970-01-01 UTC)
  function utcNumber(now) { const t = ms(now); return ok(t) ? Math.floor(t / MS) : NaN; }
  // The device's LOCAL calendar date 'YYYY-MM-DD', from calendar fields (never hour arithmetic, so a 23 or 25 hour day is still one date)
  function localKey(now) { const t = ms(now); if (!ok(t)) return ''; const d = new Date(t); return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
  // The local calendar date as a day number: the UTC-midnight day number of that date, so two dates differ by the days between them
  function localNumber(now) { const t = ms(now); if (!ok(t)) return NaN; const d = new Date(t); return Math.floor(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / MS); }
  // 'YYYY-MM-DD' -> day number (NaN for anything that is not a real date)
  function keyNumber(key) {
    if (typeof key !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(key)) return NaN;
    const t = Date.parse(key + 'T00:00:00Z');
    return isFinite(t) && new Date(t).toISOString().slice(0, 10) === key ? Math.round(t / MS) : NaN;
  }
  // The ONE game-day rule, for callers that have no rule of their own yet. Today: the UTC date (what most modes use). L-08 changes it here.
  const key = utcKey;
  const number = utcNumber;
  // last: the stored day number (anything that is not a whole number >= 0 = never), streak: the stored count, today: today's day number.
  // -> { streak, last, counted, wait, clock }  counted: today was added (or started) now; wait: stored day is 1-2 days ahead;
  //    clock: the device clock is certainly wrong (before FLOOR). Only write `streak` / `last` back; the flags are for the screen.
  function streakStep(last, streak, today, opts) {
    const floor = opts && typeof opts.floor === 'number' ? opts.floor : FLOOR;
    const future = opts && typeof opts.future === 'number' ? opts.future : FUTURE_DAYS;
    const s = Number.isInteger(streak) && streak > 0 ? streak : 0;
    const has = Number.isInteger(last) && last >= 0;
    if (!Number.isInteger(today)) return { streak: s, last: has ? last : -1, counted: false, wait: false, clock: true };
    if (has && last === today) return { streak: s, last: last, counted: false, wait: false, clock: false };
    if (s > 0 && has && today < floor) return { streak: s, last: last, counted: false, wait: false, clock: true };
    if (s > 0 && has && last > today) {
      if (last - today <= future) return { streak: s, last: last, counted: false, wait: true, clock: false };
      return { streak: s, last: today, counted: false, wait: false, clock: false };
    }
    return { streak: has && last === today - 1 ? s + 1 : 1, last: today, counted: true, wait: false, clock: false };
  }
  // Would a streak holder have to wait today (stored day 1-2 days ahead, or a certainly wrong clock)? Same rule, no change.
  function blocked(last, streak, today, opts) { const r = streakStep(last, streak, today, opts); return r.wait ? 'ahead' : r.clock ? 'clock' : ''; }
  // ID-09 (cycle 7, spec IDEAS.md "ID-09 / ID-18 implementation specs"): the forgiving day COUNT. Days visited, never reset, never lowered.
  // lastKey / todayKey: 'YYYY-MM-DD' UTC keys (L-08), days: the stored count. -> { days, date, counted, write }
  //   same day: no change; today after the stored day (any gap: 1, 3 or 40 days): days + 1, counted;
  //   stored day 1-2 days ahead of today (the clock was ahead): nothing counted, nothing written (waits); more than 2 ahead: date reset to today, not counted;
  //   today before FLOOR (a dead clock) or not a real date: untouched; unreadable stored date or count: max(days, 0) + 1, counted.
  // The returned days is never smaller than a valid days given (capped at 1e6). streakStep above is untouched.
  function visitStep(lastKey, days, todayKey) {
    const CAP = 1e6; const okDays = Number.isInteger(days) && days >= 0; const d = okDays ? Math.min(days, CAP) : 0;
    const last = keyNumber(lastKey); const today = keyNumber(todayKey);
    if (!Number.isInteger(today) || today < FLOOR) return { days: d, date: Number.isInteger(last) ? lastKey : '', counted: false, write: false };
    if (!okDays || !Number.isInteger(last)) return { days: Math.min(CAP, d + 1), date: todayKey, counted: true, write: true };
    if (last === today) return { days: d, date: lastKey, counted: false, write: false };
    if (last > today) {
      if (last - today <= FUTURE_DAYS) return { days: d, date: lastKey, counted: false, write: false };
      return { days: d, date: todayKey, counted: false, write: true };
    }
    return { days: Math.min(CAP, d + 1), date: todayKey, counted: true, write: true };
  }
  return { MS, FLOOR, FUTURE_DAYS, utcKey, utcNumber, localKey, localNumber, keyNumber, key, number, streakStep, blocked, visitStep };
}));
