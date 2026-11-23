// MMSideAccess (AX2-side): applies the saved `pixeltown-access-v1` prefs (MMAccess.prefs) to the side-game pages (hub, Angler, Jam, Stalk, Deep Delve).
//  - HUD / text size: prefs.hudScale (1, 1.25, 1.5) -> CSS variable `--ui-scale` on <html> (page CSS multiplies its font sizes by it).
//  - Reduce motion: prefs.flashes === false (the "screen flashes off" setting) -> attribute data-reduce-motion="1" on <html>. Pages that already
//    follow the OS setting also honour it (see MMSideAccess.reduced()); the CSS rule in each page stops animations and transitions.
// Read-only: it never writes the prefs. Corrupt or missing prefs -> defaults (scale 1, motion as the OS says). UMD: browser global, or require().
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./mm-access.js'));
  else root.MMSideAccess = factory(root.MMAccess);
})(typeof self !== 'undefined' ? self : this, function (MMAccess) {
  // compute(rawPrefs) -> { scale, reduceMotion }. rawPrefs: any value (cleaned by MMAccess.prefs.clean).
  function compute(raw) {
    const p = MMAccess && MMAccess.prefs ? MMAccess.prefs.clean(raw) : { hudScale: 1, flashes: true };
    return { scale: p.hudScale, reduceMotion: p.flashes === false };
  }
  function apply(doc, storage) {
    let raw = null;
    try { raw = storage ? JSON.parse(storage.getItem('pixeltown-access-v1')) : null; } catch (e) { raw = null; }
    const c = compute(raw);
    const el = doc && doc.documentElement;
    if (el) {
      el.style.setProperty('--ui-scale', String(c.scale));
      // data-ui-big: CSS cannot compare a custom property, so big text (>= 1.25) also gets an attribute for layout rules.
      if (c.scale >= 1.25) el.setAttribute('data-ui-big', '1'); else el.removeAttribute('data-ui-big');
      if (c.reduceMotion) el.setAttribute('data-reduce-motion', '1'); else el.removeAttribute('data-reduce-motion');
    }
    return c;
  }
  const api = { compute, apply, reduced: () => false };
  if (typeof document !== 'undefined' && typeof localStorage !== 'undefined') {
    let ls = null; try { ls = localStorage; } catch (e) { ls = null; }
    const c = apply(document, ls);
    api.scale = c.scale;
    api.reduced = () => !!(typeof document !== 'undefined' && document.documentElement.getAttribute('data-reduce-motion') === '1');
  }
  return api;
});
