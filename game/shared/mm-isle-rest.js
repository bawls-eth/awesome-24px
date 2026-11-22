// MMIsleRest (NEXT-SLICES-4 IF1): calm HP recovery on the isles. Pure, no RNG, no clock, no DOM: the page calls step() at a few Hz with
// the time since the last hit and where the hero stands, and adds the returned whole HP.
// - Rest spots (home, any dock, a campfire, a hot spring, a dome or the landing pad) heal to full in <= 3 s; "Rested. Full health."
//   shows once per visit to a spot (only when it actually healed you).
// - Out of danger (no hit for 5 s, no hostile within 6 tiles, no meter at empty) the hero heals 1 HP every 1.5 s anywhere.
// - Never while a boss fight is engaged, inside a telegraph, or while knocked out: boss balance is unchanged.
// UMD: browser global MMIsleRest, or require().
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.MMIsleRest = factory();
}(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  const K = Object.freeze({ CALM_AFTER: 5, REGEN_EVERY: 1.5, REST_FULL: 2.5, REST_AFTER_HIT: 1, HOSTILE_TILES: 6, AIR_EMPTY_DMG: 0.5 });
  const TOAST = 'Rested. Full health.';
  const init = () => ({ acc: 0, onSpot: false, told: false, healed: false });
  const num = (v, d) => (typeof v === 'number' && Number.isFinite(v) ? v : d);

  // step(state, inp) -> { state, heal, mode: 'rest' | 'regen' | '', toast }. inp: { dt, hp, maxHp, hurtAgo, hostileNear, inShelter,
  // atHome, atDock, envEmpty, bossEngaged, telegraph, dead }. The state is copied, never mutated.
  function step(state, inp) {
    const s = Object.assign(init(), state || {});
    const i = inp || {};
    const dt = Math.max(0, Math.min(1, num(i.dt, 0)));
    const hp = num(i.hp, 0), maxHp = Math.max(1, num(i.maxHp, 1)), ago = num(i.hurtAgo, 1e9);
    const spot = !!(i.atHome || i.atDock || i.inShelter);
    if (spot !== s.onSpot) { s.onSpot = spot; s.told = false; s.healed = false; s.acc = 0; }
    const out = { state: s, heal: 0, mode: '', toast: '' };
    if (i.dead || i.bossEngaged || i.telegraph || hp <= 0) { s.acc = 0; return out; }
    if (hp >= maxHp) { s.acc = 0; return out; }
    let rate = 0;
    if (spot && ago >= K.REST_AFTER_HIT) { rate = maxHp / K.REST_FULL; out.mode = 'rest'; }
    else if (!spot && ago >= K.CALM_AFTER && !i.hostileNear && !i.envEmpty) { rate = 1 / K.REGEN_EVERY; out.mode = 'regen'; }
    if (!rate) { s.acc = 0; return out; }
    s.acc += rate * dt;
    const n = Math.min(Math.floor(s.acc + 1e-9), Math.ceil(maxHp - hp));
    if (n > 0) { s.acc -= n; out.heal = n; if (out.mode === 'rest') s.healed = true; }
    if (out.mode === 'rest' && s.healed && !s.told && hp + n >= maxHp) { s.told = true; out.toast = TOAST; }
    return out;
  }
  // creature damage while the air meter is empty is halved, so air plus one hit never ends a run from 1 HP
  const hitScale = (airEmpty) => (airEmpty ? K.AIR_EMPTY_DMG : 1);

  return Object.freeze({ K, TOAST, init, step, hitScale });
}));
