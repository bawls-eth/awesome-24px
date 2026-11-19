// MMBackup: export/import every `pixeltown-*` localStorage key as one JSON bundle.
// Accepts the new bundle and the old single-save format (a plain pixeltown-save-v1 object).
// bundle()/restore() never throw. UMD: browser global MMBackup, or require().
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(function () { try { return require('./mm-profile.js'); } catch (e) { return null; } });
  } else root.MMBackup = factory(function () { return root.MMProfile || null; });
}(typeof self !== 'undefined' ? self : this, function (getProfile) {
  const FORMAT = 'pixeltown-backup';
  const VERSION = 2;
  const PREFIX = 'pixeltown-';
  const SAVE_KEY = 'pixeltown-save-v1';
  const MM_KEY = 'pixeltown-mm-v1';
  const MAX_VALUE = 2000000;
  const MAX_KEYS = 200;

  const isObj = (v) => !!v && typeof v === 'object' && !Array.isArray(v);
  const okKey = (k) => typeof k === 'string' && k.indexOf(PREFIX) === 0 && k.length <= 80;

  function listKeys(storage) {
    const out = [];
    try {
      if (typeof storage.length === 'number' && typeof storage.key === 'function') {
        for (let i = 0; i < storage.length; i++) { const k = storage.key(i); if (okKey(k)) out.push(k); }
      } else { Object.keys(storage).forEach((k) => { if (okKey(k)) out.push(k); }); }
    } catch (e) { /* ignore */ }
    return out.sort();
  }

  function bundle(storage) {
    const keys = {};
    try {
      listKeys(storage).slice(0, MAX_KEYS).forEach((k) => {
        let v = null;
        try { v = storage.getItem(k); } catch (e) { v = null; }
        if (typeof v === 'string') keys[k] = v;
      });
    } catch (e) { /* ignore */ }
    return { format: FORMAT, v: VERSION, keys: keys };
  }

  // Returns {ok, restored:[keys], error?}. Never throws.
  function restore(storage, obj) {
    try {
      if (typeof obj === 'string') obj = JSON.parse(obj);
      if (!isObj(obj)) return { ok: false, restored: [], error: 'not-an-object' };
      const entries = {};
      if (obj.format === FORMAT) {
        if (!(Number(obj.v) >= 1) || !isObj(obj.keys)) return { ok: false, restored: [], error: 'bad-bundle' };
        Object.keys(obj.keys).slice(0, MAX_KEYS).forEach((k) => {
          if (!okKey(k)) return;
          const v = obj.keys[k];
          const s = typeof v === 'string' ? v : JSON.stringify(v);
          if (typeof s === 'string' && s.length <= MAX_VALUE) entries[k] = s;
        });
      } else {
        // old format: the plain pixeltown-save-v1 object itself
        if (!Object.keys(obj).length) return { ok: false, restored: [], error: 'empty' };
        const s = JSON.stringify(obj);
        if (s.length > MAX_VALUE) return { ok: false, restored: [], error: 'too-big' };
        entries[SAVE_KEY] = s;
      }
      const P = getProfile();
      const restored = [];
      Object.keys(entries).forEach((k) => {
        let s = entries[k];
        let parsed;
        try { parsed = JSON.parse(s); } catch (e) { return; } // skip values that are not JSON
        if (k === SAVE_KEY && !isObj(parsed)) return;
        if (k === MM_KEY) { if (!P) return; s = JSON.stringify(P.clean(parsed)); }
        try { storage.setItem(k, s); restored.push(k); } catch (e) { /* skip */ }
      });
      if (!restored.length) return { ok: false, restored: [], error: 'nothing-valid' };
      return { ok: true, restored: restored };
    } catch (e) {
      return { ok: false, restored: [], error: 'invalid' };
    }
  }

  return { FORMAT: FORMAT, VERSION: VERSION, bundle: bundle, restore: restore };
}));
