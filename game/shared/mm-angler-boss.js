// Lakeside Angler boss encounter (pure, no DOM, seeded only): lair gate, surge schedule, strain step, hall entry.
// Free play only, no pressure outside the fight. UMD: browser global MMAnglerBoss (needs MMAngler), or require().
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./mm-angler.js'));
  else root.MMAnglerBoss = factory(root.MMAngler);
}(typeof self !== 'undefined' ? self : this, function (A) {
  const CFG = { len: 60, minWindows: 4, maxWindows: 6, minDur: 1.3, maxDur: 2.1, firstAt: 3, minGap: 3, warn: 0.8, rise: 0.7, fall: 0.5, fillMult: 0.5, gateMin: 3, gateMax: 5, lairCap: 99 };
  const INTRO = {
    old_whiskers: 'Old Whiskers stirs the mud and the whole pond goes quiet. Ease off when the line shudders.',
    pier_kraken: 'Something huge coils under the pier. When it surges, let the line go slack.',
    ice_queen_pike: 'A crown of ice cracks around the hole. Hold steady, then ease off when she lunges.',
  };
  const hashStr = (s) => { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; };
  const isBoss = (id) => Object.prototype.hasOwnProperty.call(A.BOSSES, id);
  function clampInt(v, lo, hi) { v = Math.floor(Number(v)); return isFinite(v) ? Math.max(lo, Math.min(hi, v)) : lo; }

  // Normal catches needed at the boss's spot before it can show up (3..5, fixed per boss).
  function gateFor(bossId) {
    if (!isBoss(bossId)) return 0;
    const r = A.seedRng(hashStr('gate:' + bossId));
    return CFG.gateMin + Math.floor(r() * (CFG.gateMax - CFG.gateMin + 1));
  }
  function spotOf(bossId) { return Object.keys(A.BOSS_SPOTS).filter((sp) => A.BOSS_SPOTS[sp].boss === bossId)[0] || null; }
  function lairCount(journal, spot) { const j = A.journal.cleanFull(journal); return j.lair[spot] || 0; }
  function gateOpen(journal, bossId) { return isBoss(bossId) && lairCount(journal, spotOf(bossId)) >= gateFor(bossId); }
  // A normal (non-boss) catch at a lair spot counts toward its boss.
  function noteCatch(journal, fishId, spot) {
    const j = A.journal.cleanFull(journal), f = A.BY_ID[fishId];
    if (!f || f.boss || !Object.prototype.hasOwnProperty.call(A.BOSS_SPOTS, spot)) return j;
    j.lair[spot] = Math.min(CFG.lairCap, (j.lair[spot] || 0) + 1);
    return A.journal.cleanFull(j);
  }
  // The boss showed up (win or lose): the lair goes quiet again.
  function resetLair(journal, spot) {
    const j = A.journal.cleanFull(journal);
    delete j.lair[spot];
    return A.journal.cleanFull(j);
  }

  // Surge windows [{start,end}] sorted, non-overlapping, seeded per boss + fight seed. Repeats every CFG.len seconds.
  function schedule(bossId, seed) {
    const r = A.seedRng((hashStr('surge:' + bossId) ^ Math.imul(clampInt(seed, 0, 2147483647) + 1, 2654435761)) >>> 0);
    const n = CFG.minWindows + Math.floor(r() * (CFG.maxWindows - CFG.minWindows + 1));
    const out = []; let t = CFG.firstAt + r() * 2.5;
    for (let i = 0; i < n; i++) {
      const dur = CFG.minDur + r() * (CFG.maxDur - CFG.minDur);
      if (t + dur > CFG.len - 1) break;
      out.push({ start: +t.toFixed(3), end: +(t + dur).toFixed(3) });
      t += dur + CFG.minGap + r() * 4;
    }
    return out;
  }
  // 'surge' inside a window, 'warn' in the lead-up, else 'calm'.
  function phaseAt(sched, t) {
    t = Math.max(0, Number(t) || 0) % CFG.len;
    for (let i = 0; i < sched.length; i++) {
      const w = sched[i];
      if (t >= w.start && t < w.end) return 'surge';
      if (t >= w.start - CFG.warn && t < w.start) return 'warn';
    }
    return 'calm';
  }
  // Strain on the line: holding during a surge raises it fast, easing off lets it recover. >= 1 snaps.
  function tensionStep(strain, dt, holding, surging) {
    strain = Math.max(0, Math.min(1, Number(strain) || 0));
    if (!(dt > 0)) return { strain, snapped: strain >= 1 };
    strain += (surging && holding ? CFG.rise : -CFG.fall) * dt;
    strain = Math.max(0, Math.min(1, strain));
    return { strain, snapped: strain >= 1 };
  }

  // Hall of Records trophy: largest catch and its date (YYYY-MM-DD).
  function validDate(s) { return typeof s === 'string' && /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/.test(s); }
  function addHall(journal, bossId, size, date) {
    const j = A.journal.cleanFull(journal);
    if (!isBoss(bossId) || !validDate(date)) return j;
    const sz = clampInt(size, 0, 9999), old = j.hall[bossId];
    if (!old || sz >= old.size) j.hall[bossId] = { size: sz, date };
    return A.journal.cleanFull(j);
  }
  function hallEntry(journal, bossId) { const e = A.journal.cleanFull(journal).hall[bossId]; return e ? { size: e.size, date: e.date } : null; }
  function dateStr(d) { const p = (n) => (n < 10 ? '0' : '') + n; return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()); }

  return { CFG, INTRO, validDate, gateFor, spotOf, lairCount, gateOpen, noteCatch, resetLair, schedule, phaseAt, tensionStep, addHall, hallEntry, dateStr };
}));
