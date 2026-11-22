// IF1 (NEXT-SLICES-4): unit tests for shared/mm-isle-rest.js (MMIsleRest). Run: node game/tests/shared-mm-isle-rest.test.js
const R = require('../shared/mm-isle-rest.js');
let failed = 0;
function check(name, cond, extra = '') { console.log((cond ? 'PASS ' : 'FAIL ') + name + (cond ? '' : ' ' + extra)); if (!cond) failed++; }

// run the rule for `secs` at 5 Hz (the page's rate); inp(t, hp) gives the inputs; returns { hp, t: seconds to full or null, toasts }
function run(hp0, maxHp, secs, inp) {
  let s = R.init(), hp = hp0, full = null; const toasts = [];
  for (let k = 1; k * 0.2 <= secs + 1e-9; k++) {
    const t = k * 0.2;
    const r = R.step(s, Object.assign({ dt: 0.2, hp: hp, maxHp: maxHp }, inp(t, hp)));
    s = r.state; hp = Math.min(maxHp, hp + r.heal);
    if (r.toast) toasts.push(r.toast);
    if (full === null && hp >= maxHp) full = t;
  }
  return { hp, full, toasts };
}
const MAX = 22;
// rest spots
['atDock', 'atHome', 'inShelter'].forEach((k) => {
  const r = run(3, MAX, 6, () => ({ hurtAgo: 10, [k]: true }));
  check(`rest (${k}): full health within 3 s`, r.full !== null && r.full <= 3, JSON.stringify(r));
  check(`rest (${k}): "Rested. Full health." once per visit`, r.toasts.length === 1 && r.toasts[0] === R.TOAST, JSON.stringify(r.toasts));
});
check('rest: the toast shows again only after leaving the spot and healing there again', (() => {
  let s = R.init(), n = 0;
  const go = (hp0, spot) => { let hp = hp0; for (let k = 0; k < 15; k++) { const r = R.step(s, { dt: 0.2, hp: hp, maxHp: MAX, hurtAgo: 10, atDock: spot }); s = r.state; hp = Math.min(MAX, hp + r.heal); if (r.toast) n++; } return hp; };
  go(5, true); go(MAX, true); // healed + told once, then standing there full: no repeat
  const a = n; go(MAX, false); go(10, true); // left, came back hurt
  return a === 1 && n === 2;
})());
check('rest: arriving at full health shows no toast', run(MAX, MAX, 4, () => ({ hurtAgo: 10, atDock: true })).toasts.length === 0);
check('rest: not in the second after a hit', R.step(R.init(), { dt: 0.2, hp: 5, maxHp: MAX, hurtAgo: 0.4, atDock: true }).heal === 0);
// out-of-danger regen: 1 HP / 1.5 s after 5 s with no hit and no hostile near
check('regen: none before 5 s without a hit', run(5, MAX, 4, (t) => ({ hurtAgo: t })).hp === 5);
check('regen: 1 HP per 1.5 s once calm (15 s calm -> +10)', (() => { const r = run(5, MAX, 15, () => ({ hurtAgo: 99 })); return r.hp === 15; })(), String(run(5, MAX, 15, () => ({ hurtAgo: 99 })).hp));
check('regen: never with a hostile within 6 tiles', run(5, MAX, 20, () => ({ hurtAgo: 99, hostileNear: true })).hp === 5);
check('regen: never while a meter is empty (mars air)', run(5, MAX, 20, () => ({ hurtAgo: 99, envEmpty: true })).hp === 5);
check('regen: shows no toast', run(5, MAX, 30, () => ({ hurtAgo: 99 })).toasts.length === 0);
// boss fights: nothing heals while a boss is engaged or a telegraph is up, not even on a rest spot
check('boss engaged: no rest and no regen', run(5, MAX, 20, () => ({ hurtAgo: 99, atDock: true, bossEngaged: true })).hp === 5 && run(5, MAX, 20, () => ({ hurtAgo: 99, bossEngaged: true })).hp === 5);
check('inside a telegraph: no heal', run(5, MAX, 20, () => ({ hurtAgo: 99, inShelter: true, telegraph: true })).hp === 5);
check('a knocked-out (dead) hero is not healed here (respawn does that)', R.step(R.init(), { dt: 1, hp: 0, maxHp: MAX, hurtAgo: 99, atDock: true, dead: true }).heal === 0);
check('never heals past max HP', run(MAX - 1, MAX, 10, () => ({ hurtAgo: 99, atDock: true })).hp === MAX && R.step(R.init(), { dt: 1, hp: MAX, maxHp: MAX, hurtAgo: 99, atDock: true }).heal === 0);
check('step() never mutates the state it is given', (() => { const s = R.init(); const c = JSON.stringify(s); R.step(s, { dt: 1, hp: 3, maxHp: MAX, hurtAgo: 99, atDock: true }); return JSON.stringify(s) === c; })());
check('junk input heals nothing and throws nothing', (() => { try { return R.step(null, null).heal === 0 && R.step(undefined, { dt: 'x', hp: NaN }).heal === 0; } catch (e) { return false; } })());
check('out of air: creature hits are halved (hitScale)', R.hitScale(true) === 0.5 && R.hitScale(false) === 1);
check('the module source has no Math.random, Date, DOM, storage or network', (() => { const s = require('fs').readFileSync(require('path').join(__dirname, '..', 'shared', 'mm-isle-rest.js'), 'utf8'); return !/Math\.random|Date\.|new Date|document\.|window\.|fetch\(|XMLHttpRequest|localStorage/.test(s); })());

console.log(failed ? `${failed} FAILED` : 'ALL PASSED'); process.exitCode = failed ? 1 : 0;
