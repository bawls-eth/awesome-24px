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
  return { seedFor, dateKey, recordBest, modeOptions };
});
