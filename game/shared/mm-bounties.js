// MMBounties: 3 deterministic daily bounties per date string (UTC "YYYY-MM-DD"), same for everyone.
// Design rule: no streaks, no urgency, no penalties. Pure helpers only.
//   forDate(dateString, seedSalt) -> [{ id, text, goal, event, reward: { fame, petTreat } } x3]
//   progress(bounty, state, event) -> new state { count, done, claimed }; claim(bounty, state) -> { state, reward } or null
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.MMBounties = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  const POOL = [
    { id: 'pop-puffcaps', text: 'Pop 30 Puffcaps', goal: 30, event: 'kill:puffcap' },
    { id: 'lantern-no-snack', text: 'Clear the Sunken Lantern without using a Snack', goal: 1, event: 'clear:sunkenLantern:noSnack' },
    { id: 'secret-room', text: 'Find a secret room', goal: 1, event: 'secretRoom' },
    { id: 'slay-beetles', text: 'Defeat 20 Bramble Beetles', goal: 20, event: 'kill:beetle' },
    { id: 'event-boss', text: 'Help defeat a Wild Event boss', goal: 1, event: 'eventBoss' },
    { id: 'open-chests', text: 'Open 5 treasure chests', goal: 5, event: 'chest' },
    { id: 'burrowmole', text: 'Beat Queen Burrowmole', goal: 1, event: 'clear:burrowWarren' },
    { id: 'bag-brown', text: 'Pick up 3 Brown bags', goal: 3, event: 'bag:brown' }
  ];
  function hash(str) {
    let h = 2166136261;
    for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
    h ^= h >>> 15; h = Math.imul(h, 0x85EBCA6B); h ^= h >>> 13;
    return h >>> 0;
  }
  function rng(seed) {
    let a = seed | 0;
    return function () {
      a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function forDate(dateString, seedSalt) {
    const r = rng(hash(String(dateString) + '|' + String(seedSalt == null ? '' : seedSalt)));
    const idx = POOL.map(function (_, i) { return i; });
    for (let i = idx.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); const t = idx[i]; idx[i] = idx[j]; idx[j] = t; }
    return idx.slice(0, 3).map(function (i) {
      const p = POOL[i];
      return { id: p.id, text: p.text, goal: p.goal, event: p.event,
        reward: { fame: 10 + Math.floor(r() * 7) * 5, petTreat: 1 } };   // fame 10-40
    });
  }
  function progress(bounty, state, event) {
    const s = state || { count: 0, done: false, claimed: false };
    if (s.done || !event || event.type !== bounty.event) return s;
    const count = Math.min(bounty.goal, s.count + (event.n > 0 ? event.n : 1));
    return { count: count, done: count >= bounty.goal, claimed: !!s.claimed };
  }
  function claim(bounty, state) {
    if (!state || !state.done || state.claimed) return null;
    return { state: { count: state.count, done: true, claimed: true }, reward: { fame: bounty.reward.fame, petTreat: bounty.reward.petTreat } };
  }
  return { forDate: forDate, progress: progress, claim: claim, POOL: POOL };
});
