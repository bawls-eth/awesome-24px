// MMDDTime: Deepdelve day/night clock. Pure, deterministic, no DOM, no randomness.
// t is seconds on the world clock; one full day is PERIOD seconds (default 6 minutes). Phase 0.25 = noon, 0.75 = midnight.
//   sun(t)        0..1 daylight (long bright plateau, short dusk/dawn)
//   skyScale(t)   0.25..1 factor for SKY light only (block light from torches is never scaled), in STEPS discrete steps
//   skyColor(t)   [r,g,b] 0..1 for sky + fog on the surface
//   stage(t)      'day' | 'dusk' | 'night' | 'dawn'
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.MMDDTime = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  const PERIOD = 360, NOON = PERIOD * 0.25, STEPS = 6, MIN_SCALE = 0.25;
  const DAY = [0x8f / 255, 0xd0 / 255, 1], NIGHT = [0.02, 0.03, 0.09], DUSK = [0.95, 0.55, 0.35];
  const clamp01 = (v) => Math.max(0, Math.min(1, v));
  const norm = (t) => { t = Number(t); if (!isFinite(t)) t = NOON; return ((t % PERIOD) + PERIOD) % PERIOD; };
  const phase = (t) => norm(t) / PERIOD;
  const rising = (t) => { const p = phase(t); return p < 0.25 || p >= 0.75; }; // sun climbing toward noon (or night heading to dawn)
  const sun = (t) => clamp01(0.5 + 0.9 * Math.sin(2 * Math.PI * phase(t)));
  const skyScale = (t) => {
    const k = Math.round(sun(t) * STEPS) / STEPS; // quantised so chunk meshes are only rebuilt STEPS times a day
    return MIN_SCALE + (1 - MIN_SCALE) * k;
  };
  const skyStep = (t) => Math.round(sun(t) * STEPS);
  function skyColor(t) {
    const s = sun(t), dusk = Math.max(0, 1 - Math.abs(s - 0.5) * 3) * 0.55; // strongest halfway between night and day
    const out = [0, 0, 0];
    for (let i = 0; i < 3; i++) out[i] = clamp01((NIGHT[i] + (DAY[i] - NIGHT[i]) * s) * (1 - dusk) + DUSK[i] * dusk * (0.3 + 0.7 * s));
    return out;
  }
  function stage(t) {
    const s = sun(t);
    if (s >= 0.9) return 'day';
    if (s <= 0.1) return 'night';
    return rising(t) ? 'dawn' : 'dusk';
  }
  const clockText = (t) => { const m = Math.floor(phase(t) * 1440 + 360) % 1440; return String(Math.floor(m / 60)).padStart(2, '0') + ':' + String(m % 60).padStart(2, '0'); };
  return { PERIOD, NOON, STEPS, MIN_SCALE, norm, phase, sun, skyScale, skyStep, skyColor, stage, clockText };
});
