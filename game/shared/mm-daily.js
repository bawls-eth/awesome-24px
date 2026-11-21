// MMDaily: Daily Maze seed, best-time record helper, Stroll mode. Pure, no network.
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.MMDaily = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  // FNV-1a over the string -> unsigned 32-bit seed. Same date -> same seed.
  function seedFor(dateString) {
    const s = 'mm-daily:' + String(dateString == null ? '' : dateString).trim();
    let h = 0x811c9dc5;
    for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
    return h >>> 0;
  }
  function dateKey(d) {
    d = d instanceof Date ? d : new Date();
    return d.getUTCFullYear() + '-' + String(d.getUTCMonth() + 1).padStart(2, '0') + '-' + String(d.getUTCDate()).padStart(2, '0');
  }
  // recordBest(records, dateString, timeMs) -> {records (new object), improved, best}
  function recordBest(records, dateString, timeMs) {
    const out = Object.assign({}, records && typeof records === 'object' ? records : {});
    const prev = out[dateString];
    const valid = typeof timeMs === 'number' && isFinite(timeMs) && timeMs > 0;
    if (!valid) return { records: out, improved: false, best: typeof prev === 'number' ? prev : null };
    if (typeof prev === 'number' && prev <= timeMs) return { records: out, improved: false, best: prev };
    out[dateString] = timeMs;
    return { records: out, improved: true, best: timeMs };
  }
  // Stroll: relaxed run, the Hedge Tide never advances.
  function modeOptions(mode) {
    return mode === 'stroll' ? { mode: 'stroll', hedgeTide: false } : { mode: 'daily', hedgeTide: true };
  }
  // dailySeed(dateUtc 'YYYY-MM-DD', kind 'world'|'dungeon') -> small int 1..99999, same for everyone on that UTC date. Pure.
  function dailySeed(dateUtc, kind) {
    const R = typeof MMRng !== 'undefined' ? MMRng : (typeof require === 'function' ? require('./rng.js') : null);
    const k = kind === 'dungeon' ? 'dungeon' : 'world';
    return (R.hash('mm-daily-seed:' + String(dateUtc == null ? '' : dateUtc).trim() + ':' + k) % 99999) + 1;
  }
  // strict YYYY-MM-DD that is a real calendar date, else null
  function cleanDate(s) {
    if (typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
    const d = new Date(s + 'T00:00:00Z');
    return isFinite(d.getTime()) && d.toISOString().slice(0, 10) === s ? s : null;
  }
  return { seedFor, dateKey, recordBest, modeOptions, dailySeed, cleanDate };
});
