// Run: node game/tests/shared-mm-status.test.js
const S = require('../shared/mm-status.js');
let n = 0, bad = 0;
function check(name, ok) { n++; if (!ok) { bad++; console.log('FAIL ' + name); } }
const near = (a, b) => Math.abs(a - b) < 1e-9;

check('17 statuses', S.IDS.length === 17);
check('every status has glyph+color', S.IDS.every((i) => S.DEFS[i].glyph && /^#[0-9a-f]{6}$/.test(S.DEFS[i].color)));

let s = S.apply(null, 'damaging', {}, 0);
check('damaging x1.25', near(S.mods(s, 100).dmg, 1.25));
check('expires after 4 s', near(S.mods(s, 4000).dmg, 1) && S.tick(s, 4000).fx.damaging === undefined);
s = S.apply(S.apply(null, 'damaging', {}, 0), 'weak', {}, 0);
check('weak beats damaging (x0.75)', near(S.mods(s, 10).dmg, 0.75));
s = S.apply(S.apply(null, 'weak', {}, 0), 'damaging', {}, 0);
check('weak beats damaging, either order', near(S.mods(s, 10).dmg, 0.75));
check('slowed beats swift', near(S.mods(S.apply(S.apply(null, 'swift', {}, 0), 'slowed', {}, 0), 10).speed, 0.65));
check('dazed beats berserk', near(S.mods(S.apply(S.apply(null, 'berserk', {}, 0), 'dazed', {}, 0), 10).rate, 0.6));
check('armorBroken beats armored', near(S.mods(S.apply(S.apply(null, 'armored', {}, 0), 'armorBroken', {}, 0), 10).taken, 1.25));
s = S.mods(S.apply(S.apply(null, 'healing', {}, 0), 'sick', {}, 0), 10);
check('sick beats healing', s.regen === 0 && s.noHeal === true);

s = null;
for (let i = 0; i < 6; i++) s = S.apply(s, 'curse', {}, i * 100);
check('curse caps at 3 stacks x1.30', s.fx.curse.stacks === 3 && near(S.mods(s, 700).taken, 1.3));
s = null; for (let i = 0; i < 5; i++) s = S.apply(s, 'bleed', { kind: 'enemy' }, 0);
check('bleed 3 stacks: enemy 1.5', S.mods(s, 1, 'enemy').dot === 1.5);
s = null; for (let i = 0; i < 5; i++) s = S.apply(s, 'bleed', {}, 0);
check('bleed 3 stacks: player 6 hp/s', S.mods(s, 1).dot === 6);

s = S.apply(S.apply(null, 'slowed', { pot: 0.5, kind: 'enemy' }, 0), 'slowed', { pot: 0.7, sec: 5, kind: 'enemy' }, 1000);
check('slowed keeps stronger slow, refreshes duration', near(S.mods(s, 1100, 'enemy').speed, 0.5) && s.fx.slowed.until === 6000);

check('boss immune dazed/rooted/stunned', ['dazed', 'rooted', 'stunned'].every((i) => S.immune(i, 'boss')));
check('boss slowed x0.85', near(S.mods(S.apply(null, 'slowed', { kind: 'boss' }, 0), 10, 'boss').speed, 0.85));
check('player immune to rooted', S.apply(null, 'rooted', { kind: 'player' }, 0).fx.rooted === undefined);
check('enemy immune to healing', S.apply(null, 'healing', { kind: 'enemy' }, 0).fx.healing === undefined);

let b = S.apply(null, 'weak', { kind: 'boss', sec: 4 }, 0);
check('first boss apply full 4 s', b.fx.weak.until === 4000);
b = S.apply(S.tick(b, 4000), 'weak', { kind: 'boss', sec: 4 }, 5000);
check('tenacity halves re-apply within 6 s', b.fx.weak.until - 5000 === 2000);
b = S.apply(S.tick(b, 7000), 'weak', { kind: 'boss', sec: 4 }, 8000);
check('tenacity halves again (25% floor)', b.fx.weak.until - 8000 === 1000);
b = S.apply(S.tick(b, 9000), 'weak', { kind: 'boss', sec: 4 }, 9500);
check('tenacity never below 25%', b.fx.weak.until - 9500 === 1000);
b = S.apply(S.tick(b, 10500), 'weak', { kind: 'boss', sec: 4 }, 20000);
check('after the 6 s window duration is full again', b.fx.weak.until - 20000 === 4000);
check('non-boss has no tenacity', S.apply(S.apply(null, 'weak', { kind: 'enemy', sec: 4 }, 0), 'weak', { kind: 'enemy', sec: 4 }, 5000).fx.weak.until === 9000);

const st = S.apply(null, 'stunned', { kind: 'enemy' }, 0);
check('stunned: no move or fire', S.mods(st, 100, 'enemy').stun && S.mods(st, 100, 'enemy').speed === 0);
check('stun then 6 s immune', S.apply(S.tick(st, 900), 'stunned', { kind: 'enemy' }, 900).fx.stunned === undefined
  && S.apply(S.tick(st, 7000), 'stunned', { kind: 'enemy' }, 7000).fx.stunned !== undefined);

s = null; s = S.apply(s, 'curse', { kind: 'enemy', stacks: 3 }, 0); s = S.apply(s, 'armorBroken', { kind: 'enemy' }, 0); s = S.apply(s, 'marked', { kind: 'enemy' }, 0);
check('enemy taken capped 1.5', near(S.mods(s, 1, 'enemy').taken, 1.5));
s = S.apply(S.apply(null, 'slowed', { pot: 0.01 }, 0), 'rooted', { kind: 'enemy' }, 0);
check('player speed floor 0.4', S.mods(S.apply(null, 'slowed', { pot: 0.01 }, 0), 1).speed === 0.4);
check('player speed cap 1.3', S.mods(S.apply(null, 'swift', {}, 0), 1).speed <= 1.3);
check('dmg within 0.5-1.6', (() => { const m = S.mods(S.apply(null, 'damaging', {}, 0), 1); return m.dmg >= 0.5 && m.dmg <= 1.6; })());
check('dazed player rate x0.6, enemy fire x1.5', near(S.mods(S.apply(null, 'dazed', {}, 0), 1).rate, 0.6) && near(S.mods(S.apply(null, 'dazed', { kind: 'enemy' }, 0), 1, 'enemy').enemyFire, 1.5));
check('weak enemy bolt dmg x0.75', near(S.mods(S.apply(null, 'weak', { kind: 'enemy' }, 0), 1, 'enemy').enemyDmg, 0.75));
check('inspired x1.4, armored x0.75, healing +4', (() => { const x = S.apply(S.apply(S.apply(null, 'inspired', {}, 0), 'armored', {}, 0), 'healing', {}, 0), m = S.mods(x, 1); return near(m.cdRate, 1.4) && near(m.taken, 0.75) && m.regen === 4; })());

check('safe zone: no hostile status', S.apply(null, 'weak', { safe: true }, 0).fx.weak === undefined);
check('picnic halves duration', S.apply(null, 'weak', { picnic: true }, 0).fx.weak.until === 1500);
s = S.apply(null, 'weak', { fromBolt: true }, 0);
check('1 bolt status per 0.5 s', S.apply(s, 'sick', { fromBolt: true }, 300).fx.sick === undefined && S.apply(s, 'sick', { fromBolt: true }, 600).fx.sick !== undefined);

const frozen = JSON.stringify(s);
S.apply(s, 'curse', {}, 5); S.tick(s, 99999); S.mods(s, 5); S.iconList(s, 5);
check('input not mutated', JSON.stringify(s) === frozen);
check('unknown id no-op', JSON.stringify(S.apply(s, 'nope', {}, 0)) === frozen && JSON.stringify(S.apply(s, '__proto__', {}, 0)) === frozen);
check('hostile state/opts safe', (() => {
  try {
    S.apply('x', 'weak', { sec: NaN, stacks: 'a' }, 'z'); S.mods({ fx: { weak: { until: 'x' } } });
    S.tick(JSON.parse('{"__proto__":{"a":1},"fx":7}'), 1); S.iconList(42, 1);
    return ({}).a === undefined;
  } catch (e) { return false; }
})());
check('applyStatus returns new target', (() => { const t = { kind: 'boss', status: null }; const r = S.applyStatus(t, 'weak', { now: 0 }); return t.status === null && !!r.status.fx.weak && r.kind === 'boss'; })());
check('applyStatus boss immune to dazed', S.applyStatus({ kind: 'boss' }, 'dazed', { now: 0 }).status.fx.dazed === undefined);

s = null; for (const id of ['damaging', 'berserk', 'swift', 'armored', 'weak', 'curse', 'bleed']) s = S.apply(s, id, {}, 0);
const ic = S.iconList(s, 500);
check('icons max 6, negatives first', ic.length === 6 && ic[0].neg && ic[1].neg && ic[2].neg);
check('icon frac and blink', S.iconList(S.apply(null, 'weak', {}, 0), 2500)[0].blink === true && S.iconList(S.apply(null, 'weak', {}, 0), 1500)[0].frac === 0.5);

console.log((bad ? 'FAILED ' + bad + ' of ' : 'ok ') + n + ' assertions');
process.exit(bad ? 1 : 0);
