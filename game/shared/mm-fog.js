// MMFog: pure bitset helpers for the Realm minimap fog of discovered tiles.
// The world (256x256 tiles) is cut into 8x8-tile cells -> a 32x32 grid -> 1024 bits (128 bytes), saved as base64 in the additive
// `discovered` key of `pixeltown-realm-v1`. A missing, wrong-length or corrupt value decodes to null (the caller starts fully fogged).
// UMD: browser global MMFog, or require(). No DOM, no storage, no randomness.
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.MMFog = factory();
}(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  const CELL = 8; const SIDE = 32; const BITS = SIDE * SIDE; const BYTES = BITS / 8;
  const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  const B64_LEN = Math.ceil(BYTES / 3) * 4; // 172 chars with '=' padding
  const B64_RE = /^[A-Za-z0-9+/]{171}=$/;

  function make() { return new Uint8Array(BYTES); }
  function inGrid(cx, cy) { return Number.isInteger(cx) && Number.isInteger(cy) && cx >= 0 && cy >= 0 && cx < SIDE && cy < SIDE; }
  function has(bits, cx, cy) { return inGrid(cx, cy) && (bits[(cy * SIDE + cx) >> 3] & (1 << ((cy * SIDE + cx) & 7))) !== 0; }
  function set(bits, cx, cy) { if (!inGrid(cx, cy)) return false; const i = cy * SIDE + cx; const m = 1 << (i & 7); if (bits[i >> 3] & m) return false; bits[i >> 3] |= m; return true; }
  function count(bits) { let n = 0; for (let i = 0; i < BYTES; i++) { let v = bits[i]; while (v) { n += v & 1; v >>= 1; } } return n; }
  function cellOf(t) { return Math.floor(t / CELL); }

  // Reveal every cell whose nearest point lies within `radius` tiles of tile (tx,ty). Returns how many cells were NEWLY revealed.
  function reveal(bits, tx, ty, radius) {
    if (!Number.isFinite(tx) || !Number.isFinite(ty)) return 0;
    const r = Number.isFinite(radius) && radius > 0 ? Math.min(radius, 64) : 12;
    let fresh = 0;
    const c0x = Math.max(0, cellOf(tx - r)); const c1x = Math.min(SIDE - 1, cellOf(tx + r));
    const c0y = Math.max(0, cellOf(ty - r)); const c1y = Math.min(SIDE - 1, cellOf(ty + r));
    for (let cy = c0y; cy <= c1y; cy++) {
      for (let cx = c0x; cx <= c1x; cx++) {
        const nx = Math.max(cx * CELL, Math.min(tx, cx * CELL + CELL - 1)); const ny = Math.max(cy * CELL, Math.min(ty, cy * CELL + CELL - 1));
        if ((nx - tx) * (nx - tx) + (ny - ty) * (ny - ty) <= r * r && set(bits, cx, cy)) fresh++;
      }
    }
    return fresh;
  }

  function encode(bits) {
    let s = '';
    for (let i = 0; i < BYTES; i += 3) {
      const a = bits[i]; const b = i + 1 < BYTES ? bits[i + 1] : 0; const c = i + 2 < BYTES ? bits[i + 2] : 0; const n = (a << 16) | (b << 8) | c;
      s += B64[(n >> 18) & 63] + B64[(n >> 12) & 63] + (i + 1 < BYTES ? B64[(n >> 6) & 63] : '=') + (i + 2 < BYTES ? B64[n & 63] : '=');
    }
    return s;
  }
  // -> Uint8Array(128), or null for anything that is not exactly an encoded 1024-bit set
  function decode(str) {
    if (typeof str !== 'string' || str.length !== B64_LEN || !B64_RE.test(str)) return null;
    const out = make(); let o = 0;
    for (let i = 0; i < str.length; i += 4) {
      const v = [0, 1, 2, 3].map((k) => (str[i + k] === '=' ? 0 : B64.indexOf(str[i + k])));
      const n = (v[0] << 18) | (v[1] << 12) | (v[2] << 6) | v[3];
      if (o < BYTES) out[o++] = (n >> 16) & 255;
      if (o < BYTES) out[o++] = (n >> 8) & 255;
      if (o < BYTES) out[o++] = n & 255;
    }
    return out;
  }
  // clean a stored value: the canonical string, or '' (fully fogged)
  function clean(v) { const d = decode(v); return d ? encode(d) : ''; }

  return { CELL, SIDE, BITS, BYTES, make, has, set, count, reveal, encode, decode, clean, cellOf };
}));
