// Reduce-motion accessibility helper. UMD: browser global MMMotion, or require().
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.MMMotion = factory();
}(typeof self !== 'undefined' ? self : this, function () {
  const KEY = 'mm-reduce-motion';
  // Explicit override stored as '1' (reduce) or '0' (do not reduce); otherwise follow the OS.
  function reduced(win, storage) {
    try {
      const v = storage && storage.getItem(KEY);
      if (v === '1') return true;
      if (v === '0') return false;
    } catch (e) { /* ignore */ }
    try {
      if (win && typeof win.matchMedia === 'function') {
        const m = win.matchMedia('(prefers-reduced-motion: reduce)');
        return !!(m && m.matches);
      }
    } catch (e) { /* ignore */ }
    return false;
  }
  function setOverride(storage, val) {
    try { if (storage) storage.setItem(KEY, val ? '1' : '0'); } catch (e) { /* ignore */ }
  }
  // Screen-shake amplitude in px.
  function shake(amount, isReduced) { return isReduced ? 0 : Math.max(0, +amount || 0); }
  // t in seconds. Reduced: steady tint, no blinking. Normal: 8 Hz blink.
  function flash(color, t, isReduced) {
    if (isReduced) return { color, alpha: 0.35, blink: false };
    const on = Math.floor((+t || 0) * 16) % 2 === 0;
    return { color, alpha: on ? 0.8 : 0.1, blink: true };
  }
  // Low-HP edge warning at <=25% HP. Reduced: static border, no pulse.
  function lowHpBorder(hp, max, isReduced, t) {
    if (!(max > 0) || hp / max > 0.25) return { visible: false, alpha: 0, pulse: false };
    if (isReduced) return { visible: true, alpha: 0.5, pulse: false };
    const a = 0.3 + 0.3 * (0.5 + 0.5 * Math.sin((+t || 0) * Math.PI * 2)); // 1 Hz
    return { visible: true, alpha: a, pulse: true };
  }
  return { KEY, reduced, setOverride, shake, flash, lowHpBorder };
}));
