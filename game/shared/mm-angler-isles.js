// Lakeside Angler MG3 depth (pure, no DOM, seeded only): bug bait from Bug Safari, the Isles cove, aquarium decor.
// Read-only towards other games: it only PARSES pixeltown-bugs-v1 and pixeltown-archipelago-v1 strings handed to it (the page reads
// them with localStorage.getItem and never writes those keys). Nothing is consumed from Bug Safari; no new currency anywhere.
// UMD: browser global MMAnglerIsles (needs MMAngler), or require().
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./mm-angler.js'));
  else root.MMAnglerIsles = factory(root.MMAngler);
}(typeof self !== 'undefined' ? self : this, function (A) {
  const BUGS_KEY = 'pixeltown-bugs-v1';
  const ISLES_KEY = 'pixeltown-archipelago-v1';
  const MAX_BIAS = 1.1; // a bug bait never lifts any fish's weight by more than +10%
  const isObj = (v) => !!v && typeof v === 'object' && !Array.isArray(v);
  const own = (o, k) => Object.prototype.hasOwnProperty.call(o, k);
  function parse(raw) { if (typeof raw !== 'string') return isObj(raw) ? raw : null; try { const o = JSON.parse(raw); return isObj(o) ? o : null; } catch (e) { return null; } }

  // ---------- bug bait ----------
  // Each Bug Safari species is one bait with its own small bite table: a multiplier in [1, 1.1] per fish trait.
  // rarity: {r: m}; behaviour: {b: m}; night: m (fish with time 'night'). The largest matching multiplier applies (never stacked).
  const BUG_BAITS = {
    ladybug: { name: 'Ladybug', hint: 'commons bite a touch more', rarity: { 1: 1.1 } },
    butterfly: { name: 'Butterfly', hint: 'calm fish bite a touch more', behaviour: { calm: 1.1 } },
    beetle: { name: 'Beetle', hint: 'uncommons bite a touch more', rarity: { 2: 1.1 } },
    cricket: { name: 'Cricket', hint: 'darting fish bite a touch more', behaviour: { darter: 1.1 } },
    antlion: { name: 'Antlion', hint: 'bottom feeders bite a touch more', behaviour: { sinker: 1.1 } },
    goldbeetle: { name: 'Gold Beetle', hint: 'epic fish bite a touch more', rarity: { 4: 1.1, 5: 1.1 } },
    moonwing: { name: 'Moonwing', hint: 'night fish bite a touch more', night: 1.1 },
    firefly: { name: 'Firefly', hint: 'rare fish bite a touch more', rarity: { 3: 1.1 } },
    glowmoth: { name: 'Glowmoth', hint: 'zigzag fish bite a touch more', behaviour: { zigzag: 1.08 } },
  };
  // Bug species with journal count >= 1 in Bug Safari's own save, in a fixed order. Any input -> a list (corrupt -> []).
  function unlockedBugBaits(bugsRaw) {
    const o = parse(bugsRaw), j = o && isObj(o.journal) ? o.journal : null;
    if (!j) return [];
    return A.BUG_BAIT_IDS.filter((id) => own(BUG_BAITS, id) && own(j, id) && Math.floor(Number(j[id])) >= 1);
  }
  function bugMult(bugId, f) {
    const b = own(BUG_BAITS, bugId) ? BUG_BAITS[bugId] : null;
    if (!b || !f) return 1;
    let m = 1;
    if (b.rarity && own(b.rarity, f.rarity)) m = Math.max(m, b.rarity[f.rarity]);
    if (b.behaviour && own(b.behaviour, f.behaviour)) m = Math.max(m, b.behaviour[f.behaviour]);
    if (b.night && f.time === 'night') m = Math.max(m, b.night);
    return Math.min(MAX_BIAS, Math.max(1, m));
  }
  // Same walk as A.rollFish (one rng() call), with the bug bait's table on top. No bug bait -> exactly A.rollFish.
  function rollFish(rng, spot, ctx, gear, bugId) {
    if (!bugId || !own(BUG_BAITS, bugId)) return A.rollFish(rng, spot, ctx, gear);
    const p = A.pool(spot, ctx);
    if (!p.length) return null;
    const ws = p.map((f) => A.weightOf(f, ctx, gear) * bugMult(bugId, f));
    let total = 0; ws.forEach((w) => { total += w; });
    let r = rng() * total;
    for (let i = 0; i < p.length; i++) { r -= ws[i]; if (r < 0) return p[i]; }
    return p[p.length - 1];
  }
  // Odds per rarity for a pool, with and without a bug bait (for tests and the gear hint).
  function rarityShares(spot, ctx, gear, bugId) {
    const p = A.pool(spot, ctx), out = {};
    let total = 0;
    p.forEach((f) => { const w = A.weightOf(f, ctx, gear) * (bugId ? bugMult(bugId, f) : 1); total += w; out[f.rarity] = (out[f.rarity] || 0) + w; });
    Object.keys(out).forEach((k) => { out[k] = total ? out[k] / total : 0; });
    return out;
  }
  function setBugBait(journal, bugId, bugsRaw) {
    const j = A.journal.cleanFull(journal);
    if (bugId === '' || bugId === null) j.bugBait = '';
    else if (unlockedBugBaits(bugsRaw).indexOf(bugId) >= 0) j.bugBait = bugId;
    else return { journal: j, ok: false };
    return { journal: A.journal.cleanFull(j), ok: true };
  }

  // ---------- Isles cove ----------
  // The cove opens once the archipelago save lists the reef as visited (read-only).
  function coveOpen(islesRaw) { const o = parse(islesRaw); return !!(o && Array.isArray(o.visited) && o.visited.indexOf('reef') >= 0); }
  const COVE_BAIT_NAMES = { kelp: 'Kelp', shell: 'Shell', pearl: 'Pearl' };
  const COVE_WEIGHT = { 1: 50, 2: 28, 3: 14, 4: 6, 5: 2 };
  // What bites with a cove bait: the open species always, plus the ones that want this bait. No bait -> open species only.
  function covePool(coveBait) { return A.COVE_FISH.filter((f) => !f.bait || f.bait === coveBait); }
  function rollCove(rng, coveBait) {
    const p = covePool(coveBait), ws = p.map((f) => COVE_WEIGHT[f.rarity] * (f.bait && f.bait === coveBait ? 2 : 1));
    let total = 0; ws.forEach((w) => { total += w; });
    let r = rng() * total;
    for (let i = 0; i < p.length; i++) { r -= ws[i]; if (r < 0) return p[i]; }
    return p[p.length - 1];
  }
  function setCoveBait(journal, bait) {
    const j = A.journal.cleanFull(journal);
    if (bait !== '' && A.COVE_BAITS.indexOf(bait) < 0) return { journal: j, ok: false };
    j.coveBait = bait;
    return { journal: A.journal.cleanFull(j), ok: true };
  }
  function recordCove(journal, fishId, size) {
    const j = A.journal.cleanFull(journal);
    if (!A.COVE_BY_ID[fishId]) return j;
    const e = j.cove[fishId] || { n: 0, best: 0 };
    e.n = Math.min(99999, e.n + 1);
    e.best = Math.max(e.best, Math.max(0, Math.min(9999, Math.floor(Number(size) || 0))));
    j.cove[fishId] = e;
    return A.journal.cleanFull(j);
  }
  const coveCount = (journal) => Object.keys(A.journal.cleanFull(journal).cove).length;

  // ---------- aquarium decor ----------
  // Calm display pieces: each one unlocks from journal progress (never bought, never lost, no timer). Showing one is a toggle.
  const DECOR = {
    lily_pad: { name: 'Lily pad', need: 'Catch 1 species', ok: (c) => c.species >= 1 },
    river_stones: { name: 'River stones', need: 'Catch 10 species', ok: (c) => c.species >= 10 },
    tiny_castle: { name: 'Tiny castle', need: 'Catch 25 species', ok: (c) => c.species >= 25 },
    sunken_chest: { name: 'Sunken chest', need: 'Win 1 boss trophy', ok: (c) => c.trophies >= 1 },
    bug_lantern: { name: 'Bug lantern', need: 'Have 1 bug bait from Bug Safari', ok: (c) => c.bugs >= 1 },
    coral_arch: { name: 'Coral arch', need: 'Catch 1 cove fish', ok: (c) => c.cove >= 1 },
    kelp_forest: { name: 'Kelp forest', need: 'Catch 3 cove fish', ok: (c) => c.cove >= 3 },
    pearl_clam: { name: 'Pearl clam', need: 'Catch all 6 cove fish', ok: (c) => c.cove >= A.COVE_FISH.length },
  };
  function progress(journal, bugsRaw) {
    const j = A.journal.cleanFull(journal);
    return { species: Object.keys(j.caught).length, trophies: Object.keys(j.trophies).length, bugs: unlockedBugBaits(bugsRaw).length, cove: Object.keys(j.cove).length };
  }
  function decorList(journal, bugsRaw) {
    const j = A.journal.cleanFull(journal), c = progress(j, bugsRaw);
    return A.DECOR_IDS.map((id) => ({ id, name: DECOR[id].name, need: DECOR[id].need, unlocked: DECOR[id].ok(c), shown: j.decor.indexOf(id) >= 0 }));
  }
  function toggleDecor(journal, id, bugsRaw) {
    const j = A.journal.cleanFull(journal), d = decorList(j, bugsRaw).find((x) => x.id === id);
    if (!d || !d.unlocked) return { journal: j, ok: false };
    if (d.shown) j.decor = j.decor.filter((x) => x !== id); else j.decor.push(id);
    return { journal: A.journal.cleanFull(j), ok: true, shown: !d.shown };
  }

  return {
    BUGS_KEY, ISLES_KEY, MAX_BIAS, BUG_BAITS, COVE_BAIT_NAMES, DECOR,
    bug: { unlocked: unlockedBugBaits, mult: bugMult, rollFish, rarityShares, set: setBugBait },
    cove: { open: coveOpen, pool: covePool, roll: rollCove, setBait: setCoveBait, record: recordCove, count: coveCount },
    decor: { list: decorList, toggle: toggleDecor, progress },
  };
}));
