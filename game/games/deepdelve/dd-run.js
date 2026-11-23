// Deepdelve dive runs: one dive = from the surface down and back (or until you fall). Tracks depth, blocks, ores and the
// mining combo, scores the dive, and keeps personal bests in its own additive key 'pixeltown-deepdelve-runs-v1'.
// Pure logic (no DOM, no Math.random, no Date): the page passes the clock in seconds. UMD: window.MMDDRun or require().
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.MMDDRun = factory();
}(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  const KEY = 'pixeltown-deepdelve-runs-v1';
  const COMBO_GAP = 1.6; // seconds between breaks that keep a combo alive
  const SAFE_DEPTH = 6; // a dive counts once you are this many blocks below where it started
  const SAFE_BONUS = 1.5; // surfacing alive multiplies the dive score (falling forfeits it)
  const ORE = { coal: 1, iron_ore: 2, gold_ore: 3, crystal: 5, glowstone: 2 };
  // Seeded dive modifiers: every dive gets one, picked from the world seed and the dive number (no Math.random), so runs
  // differ but the same seed + dive number always gives the same twist.
  const MODS = [
    { id: 'plain', name: 'Plain dive', desc: 'No twist: just dig deep.' },
    { id: 'veins', name: 'Rich veins', desc: 'Ores score double.' },
    { id: 'rhythm', name: 'Rhythm', desc: 'Combo window 2.4 s.' },
    { id: 'plunge', name: 'Plunge', desc: 'Depth scores x1.5.' },
    { id: 'steady', name: 'Steady hands', desc: 'Combos score triple.' },
  ];
  function modFor(seed, n) {
    let h = (Math.floor(Math.abs(+seed || 0)) ^ 0x9e3779b9) >>> 0;
    h = Math.imul(h ^ (Math.floor(Math.abs(+n || 0)) + 0x632be5ab), 2654435761) >>> 0;
    h ^= h >>> 15; h = Math.imul(h, 2246822519) >>> 0; h ^= h >>> 13;
    return MODS[(h >>> 0) % MODS.length];
  }
  const modOf = (run) => (run && run.mod) || 'plain';
  const gapOf = (run) => (modOf(run) === 'rhythm' ? 2.4 : COMBO_GAP);
  const ci = (v, hi) => (typeof v === 'number' && isFinite(v) ? Math.max(0, Math.min(hi, Math.floor(v))) : 0);

  function clean(raw) {
    let o = raw;
    if (typeof raw === 'string') { try { o = JSON.parse(raw); } catch (e) { o = null; } }
    if (!o || typeof o !== 'object' || Array.isArray(o)) o = {};
    const b = o.best && typeof o.best === 'object' && !Array.isArray(o.best) ? o.best : {};
    return { v: 1, runs: ci(o.runs, 999999), safe: ci(o.safe, 999999), best: { score: ci(b.score, 9999999), depth: ci(b.depth, 999), ores: ci(b.ores, 99999), combo: ci(b.combo, 9999) } };
  }
  function load(storage) { try { return clean(storage.getItem(KEY)); } catch (e) { return clean(null); } }
  // Merge-on-write (bugbash/saves.md S2/S7): bests and counters only go up against what storage holds now, so a stale second tab
  // can never lower another tab's best or dive count; fields a newer build stored are kept. The caller re-reads before finish(),
  // so its counters already include every other tab's dives (max, not sum, never double-counts).
  function save(storage, rec) {
    try {
      let raw = null;
      try { const s = storage.getItem(KEY); raw = typeof s === 'string' && s.length < 50000 ? JSON.parse(s) : null; } catch (e) { raw = null; }
      if (!raw || typeof raw !== 'object' || Array.isArray(raw)) raw = null;
      const mine = clean(rec), cur = clean(raw), out = {};
      if (raw) Object.keys(raw).forEach((k) => { if (k !== '__proto__' && k !== 'constructor' && k !== 'prototype') out[k] = raw[k]; });
      Object.assign(out, mine, { runs: Math.max(mine.runs, cur.runs), safe: Math.max(mine.safe, cur.safe), best: {} });
      Object.keys(mine.best).forEach((k) => { out.best[k] = Math.max(mine.best[k], cur.best[k]); });
      storage.setItem(KEY, JSON.stringify(out));
      return true;
    } catch (e) { return false; }
  }

  function start(startDepth, mod) { return { mod: MODS.some((m) => m.id === mod) ? mod : 'plain', start: ci(startDepth, 999), depth: 0, blocks: 0, ores: 0, orePts: 0, combo: 0, bestCombo: 0, lastBreak: -99, armed: false }; }
  // Depth below where the dive started (blocks). Returns true when it became a new dive maximum.
  function depth(run, absDepth) {
    const d = Math.max(0, ci(absDepth, 999) - run.start);
    if (d >= SAFE_DEPTH) run.armed = true;
    if (d > run.depth) { run.depth = d; return true; }
    return false;
  }
  // A block broke at time `now` (seconds). Returns { combo, ore } for feedback.
  // G-10 (b11-02): opts.placed = the player placed this block this session: the item comes back, but no block / ore points and the combo
  // neither grows nor breaks (a place / mine loop scores nothing).
  function mined(run, item, now, opts) {
    if (opts && opts.placed) return { combo: run.combo, ore: 0, placed: true };
    run.blocks++;
    run.combo = now - run.lastBreak <= gapOf(run) ? run.combo + 1 : 1;
    run.lastBreak = now;
    if (run.combo > run.bestCombo) run.bestCombo = run.combo;
    const ore = ORE[item] | 0;
    if (ore) { run.ores++; run.orePts += ore; }
    return { combo: run.combo, ore };
  }
  // The combo has lapsed when no block broke for COMBO_GAP seconds.
  function comboLive(run, now) { return run.combo > 1 && now - run.lastBreak <= gapOf(run); }
  function score(run, safe) {
    const m = modOf(run), base = Math.floor(run.depth * (m === 'plunge' ? 15 : 10)) + run.blocks + run.orePts * (m === 'veins' ? 16 : 8) + run.bestCombo * (m === 'steady' ? 9 : 3);
    return Math.floor(safe ? base * SAFE_BONUS : base);
  }
  // Finish a dive: returns a summary with the personal-best flags; `rec` is updated in place (the caller saves it).
  function finish(rec, run, safe) {
    const s = score(run, safe), b = rec.best;
    const pb = { score: s > b.score && s > 0, depth: run.depth > b.depth, ores: run.ores > b.ores, combo: run.bestCombo > b.combo };
    const prev = { score: b.score, depth: b.depth, ores: b.ores, combo: b.combo };
    if (pb.score) b.score = s; if (pb.depth) b.depth = run.depth; if (pb.ores) b.ores = run.ores; if (pb.combo) b.combo = run.bestCombo;
    rec.runs = Math.min(999999, rec.runs + 1); if (safe) rec.safe = Math.min(999999, rec.safe + 1);
    // "so close" feedback: how far short of the old best this dive ended (only when it did not beat it)
    const short = !pb.depth && prev.depth > 0 ? prev.depth - run.depth : 0;
    return { score: s, safe: !!safe, mod: modOf(run), depth: run.depth, blocks: run.blocks, ores: run.ores, combo: run.bestCombo, pb, prev, short, any: pb.score || pb.depth || pb.ores || pb.combo };
  }
  return { KEY, MODS, modFor, COMBO_GAP, SAFE_DEPTH, SAFE_BONUS, ORE, clean, load, save, start, depth, mined, comboLive, score, finish };
}));
