// Seeded PRNG (cyrb53 hash -> mulberry32). UMD: browser global MMRng, or require().
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.MMRng = factory();
}(typeof self !== 'undefined' ? self : this, function () {
  function cyrb53(str, seed) {
    let h1 = 0xdeadbeef ^ (seed || 0), h2 = 0x41c6ce57 ^ (seed || 0);
    for (let i = 0; i < str.length; i++) {
      const ch = str.charCodeAt(i);
      h1 = Math.imul(h1 ^ ch, 2654435761);
      h2 = Math.imul(h2 ^ ch, 1597334677);
    }
    h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
    h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
    return 4294967296 * (2097151 & h2) + (h1 >>> 0);
  }
  function create(seed) {
    let a = cyrb53(String(seed === undefined ? '' : seed)) >>> 0;
    function next() {
      a = (a + 0x6D2B79F5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    }
    // inclusive integer in [lo, hi]
    function int(lo, hi) {
      lo = Math.ceil(lo); hi = Math.floor(hi);
      return lo + Math.floor(next() * (hi - lo + 1));
    }
    function pick(arr) { return arr.length ? arr[Math.floor(next() * arr.length)] : undefined; }
    // Fisher-Yates; returns a new array
    function shuffle(arr) {
      const out = arr.slice();
      for (let i = out.length - 1; i > 0; i--) {
        const j = Math.floor(next() * (i + 1));
        const t = out[i]; out[i] = out[j]; out[j] = t;
      }
      return out;
    }
    return { next, int, pick, shuffle };
  }
  return { create, hash: cyrb53 };
}));
