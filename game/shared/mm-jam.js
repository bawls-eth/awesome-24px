// MMJam: pure rhythm judge for Campfire Jam. No DOM, no audio: the caller injects an audio clock (ms).
// Lanes D F J K, tap + hold notes, judging windows, score/combo/rank, calibration, chart generator + lint.
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.MMJam = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  const LANES = ['D', 'F', 'J', 'K'];
  const WINDOWS = { perfect: 40, great: 80, good: 130, missLate: 140 };
  const POINTS = { perfect: 100, great: 70, good: 40, miss: 0 };
  const RANKS = [['S', 0.95], ['A', 0.85], ['B', 0.70], ['C', 0.50], ['D', 0]];
  // per-difficulty: bpm, notes-per-second cap, hold chance, beat step
  const DIFFS = {
    easy: { bpm: 100, cap: 2, hold: 0.10, step: 2 },
    normal: { bpm: 120, cap: 3.5, hold: 0.15, step: 1 },
    hard: { bpm: 140, cap: 5.5, hold: 0.20, step: 0.5 }
  };

  // delta = pressTime - noteTime (ms, positive = late). Returns judgement name.
  function judge(delta) {
    const a = Math.abs(delta);
    if (a <= WINDOWS.perfect) return 'perfect';
    if (a <= WINDOWS.great) return 'great';
    if (a <= WINDOWS.good) return 'good';
    return 'miss';
  }
  // a note nobody can hit any more (late beyond the miss window)
  function expired(noteTime, now) { return now - noteTime > WINDOWS.missLate; }

  function rankFor(acc) {
    for (const [r, min] of RANKS) if (acc >= min) return r;
    return 'D';
  }

  // calibration: median of (tapTime - expectedTime) samples, clamped to +-200 ms
  function calibrationOffset(deltas) {
    const v = (deltas || []).filter(Number.isFinite).slice().sort((a, b) => a - b);
    if (!v.length) return 0;
    const m = v.length >> 1;
    const med = v.length % 2 ? v[m] : (v[m - 1] + v[m]) / 2;
    return Math.max(-200, Math.min(200, Math.round(med)));
  }
  const OFFSET_MAX = 200;
  const clampOffset = (v) => { v = Math.round(Number(v)); return Number.isFinite(v) ? Math.max(-OFFSET_MAX, Math.min(OFFSET_MAX, v)) : 0; };
  const median = (a) => { const v = a.slice().sort((x, y) => x - y), m = v.length >> 1; return v.length % 2 ? v[m] : (v[m - 1] + v[m]) / 2; };

  // Metronome tap test: pair each tap with the nearest unused beat inside windowMs, drop wild outliers
  // (>3 scaled MAD, at least 40 ms, only with 5+ samples), then take the clamped median. Positive = player taps late.
  function calibrationFromTaps(taps, beats, windowMs) {
    const tp = (taps || []).filter(Number.isFinite).slice().sort((a, b) => a - b);
    const bt = (beats || []).filter(Number.isFinite).slice().sort((a, b) => a - b);
    const win = windowMs > 0 ? windowMs : 350;
    const used = new Set(), deltas = [];
    for (const t of tp) {
      let bi = -1, bd = Infinity;
      for (let i = 0; i < bt.length; i++) { const d = Math.abs(t - bt[i]); if (d < bd) { bd = d; bi = i; } }
      if (bi < 0 || bd > win || used.has(bi)) continue;
      used.add(bi); deltas.push(t - bt[bi]);
    }
    let kept = deltas;
    if (deltas.length >= 5) {
      const med = median(deltas), mad = median(deltas.map((d) => Math.abs(d - med))) * 1.4826;
      const lim = Math.max(40, 3 * mad);
      kept = deltas.filter((d) => Math.abs(d - med) <= lim);
    }
    return { offset: calibrationOffset(kept), deltas, kept, used: kept.length, ok: kept.length >= 4 };
  }

  // run: clock() returns audio-clock ms; offset (ms) is subtracted from the clock (positive = player runs late)
  function createRun(chart, opts) {
    opts = opts || {};
    const clock = opts.clock || (() => 0);
    const offset = opts.offset || 0;
    const notes = chart.notes.map((n, i) => ({ i, t: n.t, lane: n.lane, hold: n.hold || 0, state: 'pending', judge: null }));
    const s = { score: 0, combo: 0, maxCombo: 0, counts: { perfect: 0, great: 0, good: 0, miss: 0 }, holds: {}, broken: 0, hits: 0, deltaSum: 0, lastDelta: null };
    const now = () => clock() - offset;
    function record(n, j) {
      n.judge = j; s.counts[j]++; s.score += POINTS[j];
      if (j === 'miss') s.combo = 0; else { s.combo++; if (s.combo > s.maxCombo) s.maxCombo = s.combo; }
    }
    function press(lane) {
      const t = now();
      let best = null;
      for (const n of notes) {
        if (n.lane !== lane || n.state !== 'pending') continue;
        const d = Math.abs(t - n.t);
        if (d <= WINDOWS.good && (!best || d < Math.abs(t - best.t))) best = n;
      }
      if (!best) return null;
      const j = judge(t - best.t);
      record(best, j);
      s.lastDelta = Math.round(t - best.t); s.hits++; s.deltaSum += t - best.t;
      if (best.hold > 0) { best.state = 'holding'; s.holds[lane] = best; } else best.state = 'done';
      return j;
    }
    function release(lane) {
      const n = s.holds[lane]; if (!n) return null;
      delete s.holds[lane];
      const ok = now() >= n.t + n.hold - WINDOWS.good;
      n.state = 'done';
      if (!ok) { s.combo = 0; s.broken++; return 'broken'; }
      return 'held';
    }
    // call each frame: misses notes that passed the late window
    function update() {
      const t = now();
      for (const n of notes) {
        if (n.state === 'pending' && expired(n.t, t)) { n.state = 'done'; record(n, 'miss'); }
        else if (n.state === 'holding' && t > n.t + n.hold + WINDOWS.good) { n.state = 'done'; delete s.holds[n.lane]; }
      }
    }
    function result() {
      const max = notes.length * POINTS.perfect;
      const acc = max ? s.score / max : 0;
      const judged = s.counts.perfect + s.counts.great + s.counts.good + s.counts.miss;
      const full = notes.length > 0 && s.counts.miss === 0 && s.broken === 0 && judged === notes.length;
      return { score: s.score, maxCombo: s.maxCombo, counts: Object.assign({}, s.counts), accuracy: acc, rank: rankFor(acc),
        fullCombo: full, hits: s.hits, avgDelta: s.hits ? Math.round(s.deltaSum / s.hits) : null };
    }
    return { press, release, update, result, state: s, notes };
  }

  // small seeded PRNG (mulberry32 over a string hash), local so the file stands alone
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

  // density 0..1 scales how many beats get a note; the per-difficulty cap (notes/sec) always holds.
  function generateChart(seed, difficulty, density, bars) {
    const d = DIFFS[difficulty] || DIFFS.normal;
    const dens = Math.max(0, Math.min(1, density === undefined ? 0.6 : density));
    const r = rng(seed + '|' + difficulty);
    const beatMs = 60000 / d.bpm;
    const stepMs = beatMs * d.step;
    const minGap = 1000 / d.cap;
    const total = (bars || 16) * 4 * beatMs;
    const notes = [];
    let last = -1e9, lastLane = -1;
    for (let t = beatMs * 4; t < total; t += stepMs) {
      if (r() > dens) continue;
      if (t - last < minGap + 1) continue;
      let li = Math.floor(r() * 4);
      if (li === lastLane) li = (li + 1) % 4;
      const hold = r() < d.hold ? Math.round(beatMs * 2) : 0;
      const n = { t: Math.round(t), lane: LANES[li] };
      if (hold) n.hold = hold;
      notes.push(n);
      last = t; lastLane = li;
    }
    notes.sort((a, b) => a.t - b.t);
    const lastN = notes[notes.length - 1];
    const end = lastN ? lastN.t + (lastN.hold || 0) : 0;
    return { version: 1, seed: String(seed), difficulty: DIFFS[difficulty] ? difficulty : 'normal', bpm: d.bpm, cap: d.cap,
      count: notes.length, lengthMs: Math.round(Math.max(total, end + 1000)), notes };
  }

  // returns {ok, errors[]}: sorted beats, valid lanes, length matches, density cap respected
  function lint(chart) {
    const errors = [];
    if (!chart || !Array.isArray(chart.notes)) return { ok: false, errors: ['no notes'] };
    const ns = chart.notes;
    let end = 0;
    for (let i = 0; i < ns.length; i++) {
      const n = ns[i];
      if (LANES.indexOf(n.lane) < 0) errors.push('bad lane at ' + i);
      if (!(n.t >= 0)) errors.push('bad time at ' + i);
      if (i && n.t < ns[i - 1].t) errors.push('unsorted at ' + i);
      end = Math.max(end, n.t + (n.hold || 0));
    }
    if (chart.count !== undefined && chart.count !== ns.length) errors.push('count mismatch');
    if (chart.lengthMs !== undefined && chart.lengthMs < end) errors.push('length shorter than last note');
    if (chart.cap) {
      const minGap = 1000 / chart.cap;
      for (let i = 1; i < ns.length; i++) if (ns[i].t - ns[i - 1].t < minGap - 1) { errors.push('density over cap at ' + i); break; }
    }
    return { ok: errors.length === 0, errors };
  }

  return { LANES, WINDOWS, POINTS, DIFFS, judge, expired, rankFor, calibrationOffset, calibrationFromTaps, clampOffset, OFFSET_MAX, createRun, generateChart, lint };
});
