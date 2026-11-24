// MMAssist (ID-06): device pref `mm-assist` = JSON {dmg, aim}. dmg = damage taken percent (100/90/80/70/60/50, never 0),
// aim = aim help 0..3 (Off/Light/Medium/Strong: widens the touch aim-assist cone). No game-speed setting on purpose.
// A run with dmg < 100 is "Assisted": bests and medals are still recorded, shown with the tag. Never throws. UMD.
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.MMAssist = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  const KEY = 'mm-assist';
  const DMG_STEPS = [100, 90, 80, 70, 60, 50];
  const AIM_STEPS = [0, 1, 2, 3];
  const AIM_WORDS = ['Off', 'Light', 'Medium', 'Strong'];
  const AIM_CONES = [14, 20, 26, 32]; // degrees; level 0 = the old MMAim default
  const DEFAULT = Object.freeze({ dmg: 100, aim: 0 });
  const num = (x) => (typeof x === 'number' ? x : typeof x === 'string' && x.trim() !== '' ? Number(x) : NaN);

  function clean(v) {
    const o = v && typeof v === 'object' && !Array.isArray(v) ? v : {};
    let d = num(o.dmg); d = Number.isFinite(d) ? Math.round(d / 10) * 10 : 100; d = Math.max(50, Math.min(100, d));
    let a = num(o.aim); a = Number.isFinite(a) ? Math.round(a) : 0; a = Math.max(0, Math.min(3, a));
    return { dmg: d, aim: a };
  }
  function read(storage) {
    let raw = null;
    try { raw = storage ? storage.getItem(KEY) : null; } catch (e) { raw = null; }
    if (typeof raw !== 'string') return clean(null);
    try { return clean(JSON.parse(raw)); } catch (e) { return clean(null); }
  }
  function write(storage, v) {
    const c = clean(v);
    try { if (storage) storage.setItem(KEY, JSON.stringify(c)); } catch (e) { /* this visit only */ }
    return c;
  }
  function reset(storage) { try { if (storage) storage.removeItem(KEY); } catch (e) { /* ignore */ } return clean(null); }
  const isDefault = (v) => { const c = clean(v); return c.dmg === 100 && c.aim === 0; };
  const isAssisted = (v) => clean(v).dmg < 100;
  function scaleDamage(dmg, v) {
    const c = clean(v);
    if (c.dmg >= 100 || !(dmg > 0)) return dmg;
    return Math.max(1, Math.round(dmg * c.dmg / 100));
  }
  const aimCone = (v) => AIM_CONES[clean(v).aim];
  return { KEY, DMG_STEPS, AIM_STEPS, AIM_WORDS, AIM_CONES, DEFAULT, clean, read, write, reset, isDefault, isAssisted, scaleDamage, aimCone };
});
