// MMJamSongs: Campfire Jam song data, seeded chart generation, backing-track events, stars, unlocks and save validation.
// Pure (no DOM, no audio, seeded RNG only). Builds on shared/mm-jam.js (judge/createRun/lint) and shared/rng.js (MMRng).
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./mm-jam.js'), require('./rng.js'));
  else root.MMJamSongs = factory(root.MMJam, root.MMRng);
})(typeof self !== 'undefined' ? self : this, function (Jam, Rng) {
  const LANES = Jam.LANES;
  const TIERS = ['easy', 'normal', 'hard'];
  const RANK_LIST = ['S', 'A', 'B', 'C', 'D'];
  const STAR_AT = [0.5, 0.75, 0.9]; // accuracy needed for 1 / 2 / 3 stars
  const FC_MIN_COMBO = 20, OFFSET_MAX = Jam.OFFSET_MAX || 200;
  const MAX_SCORE = 999999, MAX_COMBO = 9999, MAX_PLAYS = 999999;
  const LEAD_BEATS = 4;
  // Tier shape: which eighth-note slots of a bar may hold a note, how dense, hold chance, notes-per-second cap.
  const TIER = {
    easy: { slots: [0, 2, 4, 6], dens: 0.7, hold: 0.08, cap: 2 },
    normal: { slots: [0, 1, 2, 3, 4, 5, 6, 7], dens: 0.5, hold: 0.12, cap: 3.5 },
    hard: { slots: [0, 1, 2, 3, 4, 5, 6, 7], dens: 0.75, hold: 0.14, cap: 5.5 }
  };
  // Original songs, defined as data. scale = semitone steps over rootHz; prog = bass root offsets per bar (loops).
  const SONGS = [
    { id: 'warm-embers', name: 'Warm Embers', bpm: 92, bars: 24, rootHz: 220, scale: [0, 3, 5, 7, 10], prog: [0, 0, -4, -2],
      patterns: ['stairs', 'trill', 'stairs', 'rand'], needStars: 0, blurb: 'Slow and glowy. Start here.' },
    { id: 'lantern-shuffle', name: 'Lantern Shuffle', bpm: 112, bars: 28, rootHz: 146.83, scale: [0, 2, 4, 7, 9], prog: [0, 5, 7, 5],
      patterns: ['mirror', 'stairs', 'trill', 'rand'], needStars: 2, blurb: 'A bouncy walk between the tents.' },
    { id: 'moth-parade', name: 'Moth Parade', bpm: 128, bars: 32, rootHz: 164.81, scale: [0, 2, 3, 7, 9], prog: [0, 3, 5, 3],
      patterns: ['trill', 'mirror', 'jacks', 'rand'], needStars: 5, blurb: 'Fluttery runs and quick pairs.' },
    { id: 'starlit-stomp', name: 'Starlit Stomp', bpm: 144, bars: 36, rootHz: 196, scale: [0, 3, 5, 7, 10], prog: [0, 3, 7, 5],
      patterns: ['jacks', 'mirror', 'stairs', 'rand', 'trill'], needStars: 8, blurb: 'The big finale under the stars.' },
    // second ladder: each step is reachable (a song gives at most 3 stars) and keeps asking for more
    { id: 'kettle-song', name: 'Kettle Song', bpm: 104, bars: 30, rootHz: 174.61, scale: [0, 2, 3, 5, 7, 9, 10], prog: [0, -2, 3, 5],
      patterns: ['cross', 'pulse', 'stairs', 'rand'], needStars: 10, blurb: 'A rolling boil of crossing lanes.' },
    { id: 'owl-hour', name: 'Owl Hour', bpm: 118, bars: 32, rootHz: 130.81, scale: [0, 2, 4, 5, 7, 9, 10], prog: [0, 7, 5, -2],
      patterns: ['wave', 'jacks', 'mirror', 'cross'], needStars: 13, blurb: 'Low hoots and swooping runs.' },
    { id: 'comet-tail', name: 'Comet Tail', bpm: 136, bars: 36, rootHz: 185, scale: [0, 2, 4, 6, 7, 9, 11], prog: [0, 4, 2, 7],
      patterns: ['pulse', 'wave', 'trill', 'jacks', 'rand'], needStars: 16, blurb: 'Bright sparks trailing across the sky.' },
    // secret: opens only after a full combo on any Hard chart (no stars needed)
    { id: 'midnight-campfire', name: 'Midnight Campfire', bpm: 126, bars: 44, rootHz: 123.47, scale: [0, 1, 3, 5, 7, 8, 10], prog: [0, -5, -2, -7],
      patterns: ['cross', 'wave', 'jacks', 'pulse', 'stairs'], needStars: 0, secret: true, blurb: 'Only the embers know this one.' }
  ];
  const TIER_NAMES = { easy: 'Easy', normal: 'Normal', hard: 'Hard' };

  function song(id) { return SONGS.find((s) => s.id === id) || null; }
  function songIds() { return SONGS.map((s) => s.id); }
  function beatMs(s) { return 60000 / s.bpm; }

  // Lane choice per pattern kind. k = index of the note inside its bar, last = previous lane index (or -1).
  function pickLane(kind, k, last, r, state) {
    switch (kind) {
      case 'stairs':
        state.walk = (state.walk + state.dir + 4) % 4;
        if (state.walk === 3) state.dir = -1;
        if (state.walk === 0) state.dir = 1;
        return state.walk;
      case 'trill': return k % 2 ? state.b : state.a;
      case 'mirror': return [0, 3, 1, 2][k % 4];
      case 'cross': return [0, 2, 1, 3][k % 4];
      case 'pulse': return k % 2 ? [1, 2][Math.floor(k / 2) % 2] : [0, 3][Math.floor(k / 2) % 2];
      case 'wave': { const w = [0, 1, 2, 3, 2, 1][k % 6]; return w; }
      case 'jacks': return last < 0 ? 1 : (r() < 0.4 ? last : (last + 1 + Math.floor(r() * 3)) % 4);
      default: { let li = Math.floor(r() * 4); if (li === last) li = (li + 1) % 4; return li; }
    }
  }

  // Build a chart for (songId, tier, seed). Same inputs always give the same chart.
  function chartFor(songId, tier, seed) {
    const s = song(songId) || SONGS[0];
    const tn = TIERS.indexOf(tier) >= 0 ? tier : 'normal';
    const T = TIER[tn];
    const r = Rng.create('jam|' + s.id + '|' + tn + '|' + (seed === undefined ? 'base' : seed)).next;
    const bm = beatMs(s), slotMs = bm / 2, minGap = 1000 / T.cap;
    const notes = [];
    const busy = { D: -1, F: -1, J: -1, K: -1 }; // lane busy-until (hold tails)
    const state = { walk: -1, dir: 1, a: 0, b: 2 };
    let last = -1e9, lastLane = -1;
    const playBars = s.bars - 2; // the last 2 bars are an outro with no notes
    for (let bar = 0; bar < playBars; bar++) {
      const kind = s.patterns[Math.floor(r() * s.patterns.length)];
      state.a = Math.floor(r() * 4); state.b = (state.a + 1 + Math.floor(r() * 3)) % 4; state.walk = -1; state.dir = 1;
      let k = 0;
      for (const slot of T.slots) {
        const t = Math.round((LEAD_BEATS + bar * 4) * bm + slot * slotMs);
        const strong = slot % 2 === 0;
        const must = bar % 2 === 0 && slot === 0; // keeps the groove readable
        if (!must && r() > (strong ? Math.min(1, T.dens + 0.2) : T.dens)) continue;
        if (t - last < minGap) continue;
        let li = pickLane(kind, k, lastLane, r, state); k++;
        for (let tries = 0; tries < 4 && busy[LANES[li]] > t - 1; tries++) li = (li + 1) % 4;
        if (busy[LANES[li]] > t - 1) continue;
        const n = { t, lane: LANES[li] };
        if (strong && r() < T.hold) { n.hold = Math.round(bm * (tn === 'easy' ? 1 : 2)); busy[n.lane] = t + n.hold + 150; }
        notes.push(n); last = t; lastLane = li;
      }
    }
    const lastN = notes[notes.length - 1];
    const end = lastN ? lastN.t + (lastN.hold || 0) : 0;
    const total = Math.round(s.bars * 4 * bm);
    return { version: 1, song: s.id, seed: String(seed === undefined ? 'base' : seed), difficulty: tn, bpm: s.bpm, cap: T.cap,
      count: notes.length, lengthMs: Math.round(Math.max(total, end + 1500)), notes };
  }

  // semitone math over the song scale
  function noteHz(s, rootOffset, octaveSemis, degree) {
    const n = s.scale.length;
    const semis = (rootOffset || 0) + (octaveSemis || 0) + s.scale[((degree % n) + n) % n];
    return Math.round(s.rootHz * Math.pow(2, semis / 12) * 100) / 100;
  }
  // Backing track events (ms from song time 0): kick, snare, hat, bass. Easy has no off-beat hats.
  function backing(songId, tier) {
    const s = song(songId) || SONGS[0];
    const bm = beatMs(s), ev = [];
    const total = (s.bars + 1) * 4;
    for (let b = 0; b < total; b++) {
      const t = Math.round(b * bm), bar = Math.floor(b / 4), pos = b % 4;
      if (pos === 0 || pos === 2) ev.push({ t, kind: 'kick' });
      if (pos === 1 || pos === 3) ev.push({ t, kind: 'snare' });
      ev.push({ t, kind: 'hat' });
      if (tier !== 'easy') ev.push({ t: Math.round(t + bm / 2), kind: 'hat' });
      if (pos === 0 || pos === 2) ev.push({ t, kind: 'bass', hz: noteHz(s, s.prog[bar % s.prog.length], -12, 0) });
    }
    return ev;
  }
  // frequency for a lane's tone at time t (harmony follows the chord progression)
  function toneHz(songId, laneIndex, tMs) {
    const s = song(songId) || SONGS[0];
    const bar = Math.max(0, Math.floor(tMs / (beatMs(s) * 4)));
    return noteHz(s, s.prog[bar % s.prog.length], 12, laneIndex + 1);
  }

  function starsFor(accuracy) {
    let n = 0;
    for (let i = 0; i < STAR_AT.length; i++) if (accuracy >= STAR_AT[i]) n = i + 1;
    return n;
  }

  // ---- save ----
  const clampInt = (v, lo, hi) => { v = Math.floor(Number(v)); return Number.isFinite(v) ? Math.max(lo, Math.min(hi, v)) : lo; };
  function cleanEntry(e) {
    if (!e || typeof e !== 'object') return null;
    const score = clampInt(e.score, 0, MAX_SCORE), stars = clampInt(e.stars, 0, 3), combo = clampInt(e.combo, 0, MAX_COMBO);
    const rank = RANK_LIST.indexOf(e.rank) >= 0 ? e.rank : 'D';
    if (!score && !stars && !combo) return null;
    return { score, stars, rank, combo };
  }
  function emptySave() { return { v: 1, best: {}, unlocked: [SONGS[0].id], plays: 0, hint: false }; }
  function songStars(save, id) {
    const b = save && save.best && save.best[id]; let m = 0;
    if (b) for (const t of TIERS) if (b[t] && b[t].stars > m) m = b[t].stars;
    return m;
  }
  function totalStars(save) { let n = 0; for (const s of SONGS) n += songStars(save, s.id); return n; }
  function songUnlocked(save, id) {
    const s = song(id); if (!s) return false;
    if (s.secret) return !!(save && save.fullCombo === true);
    return s.needStars <= totalStars(save);
  }
  // Hard needs 2 stars on Normal of the same song.
  function tierUnlocked(save, id, tier) {
    if (!songUnlocked(save, id) || TIERS.indexOf(tier) < 0) return false;
    if (tier !== 'hard') return true;
    const n = save.best[id] && save.best[id].normal;
    return !!(n && n.stars >= 2);
  }
  // Validates and clamps every field; unknown keys and unknown songs are dropped. Never throws.
  function cleanSave(raw) {
    const out = emptySave();
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return out;
    const best = raw.best && typeof raw.best === 'object' && !Array.isArray(raw.best) ? raw.best : {};
    for (const s of SONGS) {
      const b = Object.prototype.hasOwnProperty.call(best, s.id) ? best[s.id] : null;
      if (!b || typeof b !== 'object') continue;
      const o = {};
      for (const t of TIERS) { const e = Object.prototype.hasOwnProperty.call(b, t) ? cleanEntry(b[t]) : null; if (e) o[t] = e; }
      if (Object.keys(o).length) out.best[s.id] = o;
    }
    out.plays = clampInt(raw.plays, 0, MAX_PLAYS);
    out.hint = raw.hint === true;
    // optional additive fields: a bad offsetMs is dropped (reads as 0), a number is clamped to +-200
    if (typeof raw.offsetMs === 'number' && Number.isFinite(raw.offsetMs)) out.offsetMs = Jam.clampOffset(raw.offsetMs);
    // fullCombo only counts when a Hard entry with a long combo backs it up, so a bare flag cannot open the secret
    if (raw.fullCombo === true && SONGS.some((s) => out.best[s.id] && out.best[s.id].hard && out.best[s.id].hard.combo >= FC_MIN_COMBO)) out.fullCombo = true;
    out.unlocked = SONGS.filter((s) => songUnlocked(out, s.id)).map((s) => s.id); // always derived from earned stars, never trusted from disk
    return out;
  }
  function offsetOf(save) { return save && typeof save.offsetMs === 'number' && Number.isFinite(save.offsetMs) ? Jam.clampOffset(save.offsetMs) : 0; }
  function setOffset(save, ms) { save.offsetMs = Jam.clampOffset(ms); return save.offsetMs; }
  // Applies a finished run (MMJam run result()) to a save; mutates it and returns a report.
  function record(save, songId, tier, res) {
    const rep = { stars: starsFor(res.accuracy), newBest: false, starsGained: 0, newlyUnlocked: [], rank: res.rank };
    if (!song(songId) || TIERS.indexOf(tier) < 0) return rep;
    const before = songStars(save, songId), beforeTotal = totalStars(save);
    const cur = (save.best[songId] = save.best[songId] || {})[tier];
    const score = clampInt(res.score, 0, MAX_SCORE);
    rep.newBest = !cur || score > cur.score;
    const entry = {
      score: cur ? Math.max(cur.score, score) : score, stars: Math.max(cur ? cur.stars : 0, rep.stars),
      rank: rep.newBest ? res.rank : cur.rank, combo: Math.max(cur ? cur.combo : 0, clampInt(res.maxCombo, 0, MAX_COMBO))
    };
    save.best[songId][tier] = cleanEntry(entry) || { score: 0, stars: 0, rank: 'D', combo: 0 };
    save.plays = Math.min(MAX_PLAYS, save.plays + 1);
    rep.starsGained = Math.max(0, songStars(save, songId) - before);
    const total = totalStars(save);
    const hadSecret = save.fullCombo === true;
    if (tier === 'hard' && res.fullCombo === true && clampInt(res.maxCombo, 0, MAX_COMBO) >= FC_MIN_COMBO && save.best[songId].hard.combo >= FC_MIN_COMBO) save.fullCombo = true;
    rep.fullCombo = save.fullCombo === true;
    for (const s of SONGS) {
      if (s.secret) { if (!hadSecret && save.fullCombo === true) rep.newlyUnlocked.push(s.id); }
      else if (s.needStars > beforeTotal && s.needStars <= total) rep.newlyUnlocked.push(s.id);
    }
    save.unlocked = SONGS.map((s) => s.id).filter((id) => songUnlocked(save, id));
    return rep;
  }

  return { LANES, TIERS, TIER_NAMES, TIER, SONGS, STAR_AT, LEAD_BEATS, song, songIds, beatMs, chartFor, backing, toneHz, noteHz,
    starsFor, emptySave, cleanSave, record, offsetOf, setOffset, FC_MIN_COMBO, totalStars, songStars, songUnlocked, tierUnlocked };
});
