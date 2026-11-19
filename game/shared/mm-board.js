// MMBoard: pure validation for the best-effort "for fun" leaderboard. No network unless injected+online.
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.MMBoard = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  const MIN_TIME_MS = 60000, MAX_TIME_MS = 86400000, MAX_NAME = 14, MAX_ENTRIES = 50;
  const BAD = ['fuck', 'shit', 'bitch', 'cunt', 'dick', 'nazi', 'rape', 'slut'];
  function cleanName(name) {
    if (typeof name !== 'string') return '';
    let s = name.replace(/<[^>]*>/g, ' ').replace(/[<>&"'`\\]/g, '').replace(/[\u0000-\u001f\u007f]/g, '')
      .replace(/\s+/g, ' ').trim();
    const flat = s.toLowerCase().replace(/[^a-z]/g, '');
    if (BAD.some((w) => flat.indexOf(w) >= 0)) s = 'Mazer';
    return s.slice(0, MAX_NAME).trim();
  }
  function validateEntry(e) {
    if (!e || typeof e !== 'object') return { ok: false, reason: 'bad-entry' };
    const t = e.timeMs;
    if (typeof t !== 'number' || !isFinite(t)) return { ok: false, reason: 'bad-time' };
    if (t < MIN_TIME_MS) return { ok: false, reason: 'too-fast' };
    if (t > MAX_TIME_MS) return { ok: false, reason: 'too-slow' };
    const name = cleanName(e.name);
    if (!name) return { ok: false, reason: 'bad-name' };
    return { ok: true, entry: { name, timeMs: Math.round(t), date: typeof e.date === 'string' ? e.date.slice(0, 10) : '' } };
  }
  // Insert keeping best time per name, sorted ascending, capped at MAX_ENTRIES.
  function addEntry(board, e) {
    const v = validateEntry(e); const list = Array.isArray(board) ? board.slice() : [];
    if (!v.ok) return { ok: false, reason: v.reason, board: list };
    const i = list.findIndex((x) => x && x.name === v.entry.name);
    if (i >= 0) { if (list[i].timeMs <= v.entry.timeMs) return { ok: true, board: list, kept: true }; list.splice(i, 1); }
    list.push(v.entry); list.sort((a, b) => a.timeMs - b.timeMs);
    return { ok: true, board: list.slice(0, MAX_ENTRIES) };
  }
  // Client: offline (default) never touches the injected fetch.
  function createClient(opts) {
    opts = opts || {};
    return {
      async submit(entry) {
        const v = validateEntry(entry);
        if (!v.ok) return { ok: false, reason: v.reason };
        if (!opts.online || typeof opts.fetch !== 'function' || !opts.url) return { ok: false, offline: true, entry: v.entry };
        try { await opts.fetch(opts.url, { method: 'POST', body: JSON.stringify(v.entry) }); return { ok: true, entry: v.entry }; }
        catch (err) { return { ok: false, offline: true, entry: v.entry }; }
      }
    };
  }
  return { MIN_TIME_MS, MAX_NAME, MAX_ENTRIES, cleanName, validateEntry, addEntry, createClient };
});
