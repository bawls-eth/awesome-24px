// MMSaveMerge: merge-on-write for small game saves, so a second tab that still holds an old save in memory can never undo what
// another tab saved meanwhile (bugbash/saves.md S1..S4: pop / stack / echo / dash bests, jam assist, stalk practice, angler fun,
// bugs pb, deepdelve runs). Pure, no DOM, no clock, no randomness. Never throws. UMD: browser global MMSaveMerge, or require().
//
//   merge(stored, base, mine, spec) -> the value to write
//     stored: what storage holds NOW (parsed; anything not a plain object counts as {})
//     base:   what this tab loaded (or last wrote); counters add only this tab's own increase (mine - base), never double-count
//     mine:   this tab's current save
//     spec:   { max: [paths], min: [paths], count: [paths], union: [paths], any: [paths], maxMap: [paths] }  (dot paths)
//       max    a number that only goes up (best score): max(stored, mine)
//       min    a number where lower is better and 0 means "none" (best reaction ms): the smaller positive one
//       count  a counter (rounds, runs): stored + max(0, mine - base)
//       union  an array of ids (medals): stored order first, then mine's new ids, no duplicates
//       any    a boolean flag that only turns on (hint seen): stored || mine
//       maxMap an object of numbers, or of objects of numbers (per-song / per-arena bests): max per leaf
//     Every other field: mine wins (a setting this tab just changed), and a field only storage has is KEPT (additive).
//   write(storage, key, base, mine, spec) -> { ok, value }: reads `key`, merges, writes. On a failed write storage is untouched.
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.MMSaveMerge = factory();
}(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  var BAD = { __proto__: 1, constructor: 1, prototype: 1 };
  function isObj(v) { return !!v && typeof v === 'object' && !Array.isArray(v); }
  function num(v) { return typeof v === 'number' && isFinite(v) ? v : null; }
  function copy(v, d) {
    if ((d || 0) > 12) return null;
    if (Array.isArray(v)) return v.slice(0, 5000).map(function (x) { return copy(x, (d || 0) + 1); });
    if (isObj(v)) { var o = {}; Object.keys(v).forEach(function (k) { if (!BAD[k]) o[k] = copy(v[k], (d || 0) + 1); }); return o; }
    return typeof v === 'number' && !isFinite(v) ? 0 : v;
  }
  function get(o, p) { var parts = p.split('.'); for (var i = 0; i < parts.length; i++) { if (!isObj(o) || BAD[parts[i]] || !Object.prototype.hasOwnProperty.call(o, parts[i])) return undefined; o = o[parts[i]]; } return o; }
  function put(o, p, v) {
    var parts = p.split('.');
    for (var i = 0; i < parts.length - 1; i++) { if (BAD[parts[i]]) return; if (!isObj(o[parts[i]])) o[parts[i]] = {}; o = o[parts[i]]; }
    if (!BAD[parts[parts.length - 1]]) o[parts[parts.length - 1]] = v;
  }
  function maxMap(a, b, d) {
    if (!isObj(a)) return isObj(b) ? copy(b) : b;
    if (!isObj(b)) return copy(a);
    var out = copy(a);
    Object.keys(b).forEach(function (k) {
      if (BAD[k]) return;
      var x = out[k], y = b[k];
      if (num(x) !== null && num(y) !== null) out[k] = Math.max(x, y);
      else if (isObj(x) && isObj(y) && (d || 0) < 4) out[k] = maxMap(x, y, (d || 0) + 1);
      else if (x === undefined) out[k] = copy(y);
      else if (isObj(y) && !isObj(x)) out[k] = copy(y);
    });
    return out;
  }
  // A per-entry object like { score, rank, combo }: keep the whole entry with the higher score (so score and rank stay together).
  function merge(stored, base, mine, spec) {
    try {
      var s = isObj(stored) ? stored : {}, m = isObj(mine) ? mine : {}, b = isObj(base) ? base : {};
      spec = isObj(spec) ? spec : {};
      var out = copy(s);
      Object.keys(m).forEach(function (k) { if (!BAD[k]) out[k] = copy(m[k]); }); // mine wins by default, storage-only keys kept
      (spec.max || []).forEach(function (p) { var x = num(get(s, p)), y = num(get(m, p)); if (x !== null || y !== null) put(out, p, Math.max(x === null ? -Infinity : x, y === null ? -Infinity : y)); });
      (spec.min || []).forEach(function (p) {
        var x = num(get(s, p)), y = num(get(m, p));
        var c = [x, y].filter(function (v) { return v !== null && v > 0; });
        if (c.length) put(out, p, Math.min.apply(null, c)); else if (x !== null || y !== null) put(out, p, 0);
      });
      (spec.count || []).forEach(function (p) {
        var x = num(get(s, p)) || 0, y = num(get(m, p)) || 0, z = num(get(b, p)) || 0;
        put(out, p, x + Math.max(0, y - z));
      });
      (spec.union || []).forEach(function (p) {
        var x = get(s, p), y = get(m, p), seen = {}, arr = [];
        [x, y].forEach(function (a) { (Array.isArray(a) ? a : []).forEach(function (id) { var key = typeof id + ':' + String(id); if ((typeof id === 'string' || typeof id === 'number') && !seen[key]) { seen[key] = 1; arr.push(id); } }); });
        if (Array.isArray(x) || Array.isArray(y)) put(out, p, arr);
      });
      (spec.any || []).forEach(function (p) { var x = get(s, p), y = get(m, p); if (x === true || y === true) put(out, p, true); });
      (spec.maxMap || []).forEach(function (p) { var x = get(s, p), y = get(m, p); if (isObj(x) || isObj(y)) put(out, p, maxMap(x, y)); });
      (spec.bestEntry || []).forEach(function (p) {
        // { id: { tier: { score, ... } } }: per id/tier keep the entry with the higher score
        var x = get(s, p), y = get(m, p);
        if (!isObj(x) && !isObj(y)) return;
        var o = copy(isObj(x) ? x : {});
        if (isObj(y)) Object.keys(y).forEach(function (id) {
          if (BAD[id] || !isObj(y[id])) return;
          if (!isObj(o[id])) o[id] = {};
          Object.keys(y[id]).forEach(function (t) {
            if (BAD[t]) return;
            var e = y[id][t], c = o[id][t];
            if (isObj(e) && (!isObj(c) || (num(e.score) || 0) > (num(c.score) || 0))) o[id][t] = copy(e);
          });
        });
        put(out, p, o);
      });
      return out;
    } catch (e) { return isObj(mine) ? copy(mine) : {}; }
  }
  function write(storage, key, base, mine, spec) {
    var stored = null;
    try { var raw = storage.getItem(key); stored = typeof raw === 'string' && raw.length < 2000000 ? JSON.parse(raw) : null; } catch (e) { stored = null; }
    var value = merge(stored, base, mine, spec);
    try { storage.setItem(key, JSON.stringify(value)); return { ok: true, value: value }; } catch (e) { return { ok: false, value: value }; }
  }
  // Ready-made specs for the saves in SAVE-KEYS.md (owners pass these to write()).
  var SPECS = {
    'pixeltown-pop-v1': { max: ['best', 'bestTile', 'bestChain'], count: ['rounds'], union: ['medals'], any: ['hint'] },
    'pixeltown-stack-v1': { max: ['best', 'bestCombo'], count: ['rounds'], union: ['medals'], any: ['hint'] },
    'pixeltown-echo-v1': { max: ['best', 'bestScore'], count: ['rounds'], union: ['medals'], any: ['hint'] },
    'pixeltown-dash-v1': { max: ['best', 'bestScore', 'bestCombo'], count: ['runs'], union: ['medals'], any: ['hint'] },
    'pixeltown-jam-assist-v1': { bestEntry: ['best'], maxMap: ['section'] },
    // best can be negative (a loss) and only counts with hasBest: owners keep their own best rule; counters still merge.
    'pixeltown-stalk-practice-v1': { count: ['n', 'rounds'], any: ['hasBest'], maxMap: ['moodBest'] },
    'pixeltown-angler-fun-v1': { max: ['bestStreak'], min: ['bestReact'], maxMap: ['cond'] },
    'pixeltown-bugs-pb-v1': { maxMap: ['combo', 'mod'], count: ['runs'] },
    'pixeltown-deepdelve-runs-v1': { max: ['best.score', 'best.depth', 'best.ores', 'best.combo'], count: ['runs', 'safe'] },
    medals: { union: ['m'] }
  };
  return { merge: merge, write: write, SPECS: SPECS };
}));
