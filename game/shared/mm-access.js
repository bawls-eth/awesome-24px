// MMAccess: colour-blind palettes with contrast check, bullet outline, key remapping. Pure.
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.MMAccess = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  const BG = '#1b1f2a', MIN_CONTRAST = 3, OUTLINE_PX = 2;
  const PALETTES = {
    normal:       { bullet: '#ff5a5a', enemy: '#ffb347', ally: '#5ad1ff' },
    deuteranopia: { bullet: '#ffd92f', enemy: '#e69f00', ally: '#56b4e9' },
    protanopia:   { bullet: '#ffe45c', enemy: '#f0a030', ally: '#4aa8ff' },
    tritanopia:   { bullet: '#ff6b81', enemy: '#ffa07a', ally: '#5ee0b0' }
  };
  function lum(hex) {
    const n = parseInt(String(hex).replace('#', ''), 16);
    const c = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); });
    return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
  }
  function contrast(a, b) { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); }
  function palette(name) {
    const ok = Object.prototype.hasOwnProperty.call(PALETTES, name);
    return Object.assign({ name: ok ? name : 'normal', bulletOutline: true, outlinePx: OUTLINE_PX }, PALETTES[ok ? name : 'normal']);
  }
  function passesContrast(name, bg) {
    const p = Object.prototype.hasOwnProperty.call(PALETTES, name) ? PALETTES[name] : null;
    if (!p) return false;
    return ['bullet', 'enemy', 'ally'].every((k) => contrast(p[k], bg || BG) >= MIN_CONTRAST);
  }
  // keys: {action: key}. Returns {ok, keys} or {ok:false, conflict: otherAction}. Never mutates input.
  function remap(keys, action, key) {
    const cur = keys && typeof keys === 'object' ? keys : {};
    if (typeof action !== 'string' || !action || typeof key !== 'string' || !key) return { ok: false, keys: Object.assign({}, cur), reason: 'bad-input' };
    for (const a in cur) if (a !== action && cur[a] === key) return { ok: false, keys: Object.assign({}, cur), conflict: a };
    return { ok: true, keys: Object.assign({}, cur, { [action]: key }) };
  }
  // Prefs (NEXT-SLICES AC1): saved under the NEW additive key `pixeltown-access-v1`. Anything invalid falls back to the default of that field.
  const KEY = 'pixeltown-access-v1', HUD_SCALES = [1, 1.25, 1.5], MAX_RAW = 2000;
  const DEFAULTS = Object.freeze({ v: 1, palette: 'normal', hudScale: 1, flashes: true, bulletOutline: true, lowGfx: false });
  const prefs = {
    KEY, HUD_SCALES, DEFAULTS,
    defaults: () => Object.assign({}, DEFAULTS),
    // clean(raw): any value -> a complete, valid prefs object (new object, input never mutated, unknown keys dropped).
    clean(raw) {
      const o = Object.assign({}, DEFAULTS);
      if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return o;
      const own = (k) => (Object.prototype.hasOwnProperty.call(raw, k) ? raw[k] : undefined);
      const pal = own('palette');
      if (typeof pal === 'string' && Object.prototype.hasOwnProperty.call(PALETTES, pal)) o.palette = pal;
      const hs = own('hudScale');
      if (typeof hs === 'number' && HUD_SCALES.indexOf(hs) >= 0) o.hudScale = hs;
      ['flashes', 'bulletOutline', 'lowGfx'].forEach((k) => { if (typeof own(k) === 'boolean') o[k] = own(k); });
      return o;
    },
    // load(storage): corrupt / missing / oversized / throwing storage -> defaults. Never throws.
    load(storage) {
      try {
        const s = storage && storage.getItem(KEY);
        if (typeof s !== 'string' || s.length > MAX_RAW) return prefs.defaults();
        return prefs.clean(JSON.parse(s));
      } catch (e) { return prefs.defaults(); }
    },
    // save(storage, p): cleans p, writes it, returns the cleaned prefs (or null when storage refused). Never throws.
    save(storage, p) {
      const c = prefs.clean(p);
      try { storage.setItem(KEY, JSON.stringify(c)); return c; } catch (e) { return null; }
    }
  };
  // High contrast (Settings > See > High contrast, key mm-high-contrast = '1'). mm-access.js is on every page, so it applies the pref
  // site-wide on load: <html data-high-contrast="1"> plus one small stylesheet that lifts the shared 8-bit tokens (dim text -> paper,
  // panels -> black, a white outline on focus). Pages and shared widgets add their own [data-high-contrast] rules on top.
  const HC_KEY = 'mm-high-contrast';
  const HC_CSS = 'html[data-high-contrast="1"]{--px-dim:#fff1e8;--px-6:#fff1e8;--px-5:#c2c3c7;--px-bg:#000;--px-ink:#000;--px-panel:#000;--dim:#fff1e8;--h-dim:#fff1e8}'
    + 'html[data-high-contrast="1"] :focus-visible{outline:3px solid #ffec27 !important;outline-offset:2px}';
  function highContrast(storage) { try { return !!storage && storage.getItem(HC_KEY) === '1'; } catch (e) { return false; } }
  function applyContrast(doc, storage) {
    const on = highContrast(storage);
    const el = doc && doc.documentElement;
    if (!el) return on;
    if (on) el.setAttribute('data-high-contrast', '1'); else el.removeAttribute('data-high-contrast');
    if (on && !doc.getElementById('mm-hc-css') && doc.createElement) {
      const st = doc.createElement('style');
      st.id = 'mm-hc-css';
      st.textContent = HC_CSS;
      (doc.head || el).appendChild(st);
    }
    return on;
  }
  if (typeof document !== 'undefined' && typeof localStorage !== 'undefined') {
    let ls = null; try { ls = localStorage; } catch (e) { ls = null; }
    try { applyContrast(document, ls); } catch (e) { /* the page works without it */ }
  }
  return { prefs, PALETTES, BG, MIN_CONTRAST, OUTLINE_PX, contrast, palette, passesContrast, remap, names: () => Object.keys(PALETTES), HC_KEY, highContrast, applyContrast };
});
