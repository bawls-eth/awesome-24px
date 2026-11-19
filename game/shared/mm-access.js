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
  return { PALETTES, BG, MIN_CONTRAST, OUTLINE_PX, contrast, palette, passesContrast, remap, names: () => Object.keys(PALETTES) };
});
