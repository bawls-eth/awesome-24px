// MMEvents: seeded Wild Event scheduler, event descriptors, and the Wilds closing machine. Pure, no I/O.
// Usage: const s = MMEvents.create(seed); const ev = s.next(tSeconds); // first event at or after t
//   ev = { index, at, kind, banner, mazewright, descriptor }
// Closing: let c = MMEvents.closingCreate(seed); c = MMEvents.closingEventCleared(c, t);
//   after 6 clears a 60 s countdown starts; MMEvents.closingTick(c, t, heroes) -> { state, pulled }.
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.MMEvents = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  const MIN_GAP = 180, MAX_GAP = 300;      // 3-5 minutes, in seconds
  const EVENTS_TO_CLOSE = 6, COUNTDOWN_SEC = 60;

  function mulberry32(a) {
    return function () {
      a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function mix(seed, i) {
    let h = (Number(seed) | 0) ^ Math.imul(i + 1, 0x9E3779B1);
    h = Math.imul(h ^ (h >>> 16), 0x85EBCA6B);
    h = Math.imul(h ^ (h >>> 13), 0xC2B2AE35);
    return (h ^ (h >>> 16)) >>> 0;
  }

  const HOLLOWSTUMP = {
    id: 'hollowstump', name: 'Old Hollowstump', hp: 4000, dmg: 12, size: 48,
    phases: [
      { n: 1, patterns: [{ type: 'ring', count: 16, speed: 4, rotate: 11 }, { type: 'aimedBurst', shots: 3 }] },
      { n: 2, patterns: [{ type: 'ring', count: 16, speed: 4, rotate: 11 }, { type: 'aimedBurst', shots: 3 }, { type: 'spiral', arms: 2, step: 13 }] },
      { n: 3, patterns: [{ type: 'flower', petals: 20, speed: 5 }], spawns: { enemy: 'beetle', count: 2, everySec: 10 } }
    ],
    portalSec: 45,
    drops: { guaranteed: [{ bag: 'brown' }] }
  };
  const DROWNED_BELL = {
    id: 'drownedBell', name: 'The Drowned Bell', hp: 9000, dmg: 26, size: 48,
    phases: [
      { n: 1, patterns: [{ type: 'ring', count: 24, speed: 3, delaySec: 0 }, { type: 'ring', count: 24, speed: 5, delaySec: 0.3 }] },
      { n: 2, patterns: [{ type: 'wallGap', sides: 2, alternate: true, gapTiles: 3 }] },
      { n: 3, patterns: [{ type: 'orbitThenRelease', count: 10 }, { type: 'homing', count: 4 }] }
    ],
    portalSec: 45,
    drops: { guaranteed: [{ bag: 'brown' }] }
  };
  const KINDS = [
    { kind: 'hollowstump', banner: 'Old Hollowstump has sprouted in the Wilds!', line: 'The Mazewright: I grew a Hollowstump just for you!', descriptor: HOLLOWSTUMP },
    { kind: 'drownedBell', banner: 'The Drowned Bell tolls over the Fogfen!', line: 'The Mazewright: Do you hear it? That bell is ringing for you.', descriptor: DROWNED_BELL }
  ];

  function hollowstump() { return JSON.parse(JSON.stringify(HOLLOWSTUMP)); }
  function drownedBell() { return JSON.parse(JSON.stringify(DROWNED_BELL)); }

  function gap(seed, i) { return MIN_GAP + mulberry32(mix(seed, i))() * (MAX_GAP - MIN_GAP); }
  function makeEvent(seed, i, at) {
    const k = KINDS[Math.floor(mulberry32(mix(seed, i + 100003))() * KINDS.length)];
    return { index: i, at: at, kind: k.kind, banner: k.banner, mazewright: k.line,
      descriptor: JSON.parse(JSON.stringify(k.descriptor)) };
  }

  function create(seed) {
    const cache = [];
    function get(i) {
      while (cache.length <= i) {
        const j = cache.length;
        cache.push(makeEvent(seed, j, (j ? cache[j - 1].at : 0) + gap(seed, j)));
      }
      return cache[i];
    }
    return {
      seed: seed,
      event: get,
      next: function (t) { let i = 0; while (get(i).at < t) i++; return get(i); }
    };
  }

  // ---- Wilds closing machine (immutable states) ----
  function closingCreate(seed) {
    return { phase: 'open', seed: seed, cleared: 0, countdownStart: null, countdownSec: COUNTDOWN_SEC,
      shout: null, generation: 0 };
  }
  function closingEventCleared(c, t) {
    if (c.phase !== 'open') return c;
    const cleared = c.cleared + 1;
    if (cleared >= EVENTS_TO_CLOSE)
      return Object.assign({}, c, { cleared: cleared, phase: 'countdown', countdownStart: t, shout: 'The Mazewright: Enough!' });
    return Object.assign({}, c, { cleared: cleared });
  }
  function closingRemaining(c, t) {
    return c.phase === 'countdown' ? Math.max(0, c.countdownStart + c.countdownSec - t) : null;
  }
  // heroes: [{ id, inDungeon }]. At countdown end, heroes not in a dungeon are pulled to the Keep;
  // dungeon heroes are left alone. The shard then resets with a NEW seed.
  function closingTick(c, t, heroes) {
    if (c.phase !== 'countdown' || t < c.countdownStart + c.countdownSec) return { state: c, pulled: [] };
    const pulled = (heroes || []).filter(function (h) { return !h.inDungeon; }).map(function (h) { return h.id; });
    let newSeed = mix(c.seed, 7777 + c.generation) || 1;
    if (newSeed === c.seed) newSeed = (newSeed + 1) >>> 0;
    const state = { phase: 'open', seed: newSeed, cleared: 0, countdownStart: null, countdownSec: COUNTDOWN_SEC,
      shout: null, generation: c.generation + 1 };
    return { state: state, pulled: pulled, destination: 'mazewrightsKeep' };
  }

  return { create: create, hollowstump: hollowstump, drownedBell: drownedBell, closingCreate: closingCreate,
    closingEventCleared: closingEventCleared, closingRemaining: closingRemaining, closingTick: closingTick,
    MIN_GAP: MIN_GAP, MAX_GAP: MAX_GAP, EVENTS_TO_CLOSE: EVENTS_TO_CLOSE, COUNTDOWN_SEC: COUNTDOWN_SEC };
});
