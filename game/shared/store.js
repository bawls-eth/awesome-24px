// Safe localStorage wrapper. Never throws; falls back to in-memory if storage is blocked.
// UMD: browser global MMStore, or require().
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(root);
  else root.MMStore = factory(root);
}(typeof self !== 'undefined' ? self : this, function (root) {
  const mem = Object.create(null); // key -> JSON string; only holds keys whose last storage write failed (blocked / quota)
  function ls() {
    try { return (typeof localStorage !== 'undefined' && localStorage) || root.localStorage || null; } catch (e) { return null; }
  }
  function readRaw(key) {
    // A key whose last write failed (quota exceeded, private mode) lives in memory and is newer than whatever storage holds.
    if (Object.prototype.hasOwnProperty.call(mem, key)) return mem[key];
    const s = ls();
    if (s) { try { return s.getItem(key); } catch (e) { /* fall through */ } }
    return null;
  }
  function writeRaw(key, str) {
    const s = ls();
    if (s) { try { s.setItem(key, str); delete mem[key]; return; } catch (e) { /* fall through */ } }
    mem[key] = str;
  }
  function get(key, def) {
    const raw = readRaw(key);
    if (raw === null || raw === undefined) return def;
    try { return JSON.parse(raw); } catch (e) { return def; }
  }
  function set(key, value) {
    try { writeRaw(key, JSON.stringify(value)); return true; } catch (e) { return false; }
  }
  // fn gets a plain object (existing value, or {} if missing/corrupt/non-object) and
  // returns the new object, or mutates in place. Unknown keys are preserved.
  function patch(key, fn) {
    let cur = get(key, null);
    if (!cur || typeof cur !== 'object' || Array.isArray(cur)) cur = {};
    let out;
    try { out = fn(cur); } catch (e) { out = undefined; }
    if (out === undefined) out = cur;
    set(key, out);
    return out;
  }
  return { get, set, patch };
}));
