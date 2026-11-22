// Run: node game/tests/shared-mm-gear-sets.test.js
// GB acceptance 1: MMGearSets.active(eqItems) with "Banded" and "Dread pair", at most 2 active, every bonus inside the weapon affix power cap.
const fs = require('fs'), path = require('path');
const S = require('../shared/mm-gear-sets.js');
const G = require('../shared/mm-gear.js');
const A = require('../shared/mm-gear-affix.js');
let n = 0, bad = 0;
function check(name, ok, extra) { n++; if (!ok) { bad++; console.log('FAIL ' + name + (extra !== undefined ? ' ' + extra : '')); } }
const ids = (l) => l.map((s) => s.id).join(',');
const W = (t, extra) => Object.assign({ n: 1, id: 'sparkwand', r: 0, t: t }, t >= 7 ? { a: 77 } : {}, extra || {});
const AR = (id, t, extra) => Object.assign({ n: 2, id: id, r: 0, t: t }, extra || {});

// ---- shape ----
check('module and set table frozen, max 2 active', Object.isFrozen(S) && Object.isFrozen(S.SETS) && Object.isFrozen(S.SETS.banded) && S.MAX_ACTIVE === 2 && S.ORDER.join() === 'banded,dread');
check('module has no clock, timers or Math.random', (() => { const src = fs.readFileSync(path.join(__dirname, '../shared/mm-gear-sets.js'), 'utf8').replace(/\/\/.*$/gm, ''); return !/Math\.random|Date\.now|new Date|setTimeout|setInterval|document|window\./.test(src); })());

// ---- Banded ----
check('Banded: armor band equals weapon band (T3 weapon + T4 armor = band 2): +4% HP, no GRD below band 4', (() => { const l = S.active({ weapon: W(3), armor: AR('arm_light_ranger', 4) }); return ids(l) === 'banded' && l[0].bonus.vital === 0.04 && !('ward' in l[0].bonus) && l[0].text === 'Banded set: +4% HP'; })());
check('Banded: +1 GRD at band >= 4 (T7 weapon + T8 armor)', (() => { const l = S.active({ weapon: W(7), armor: AR('arm_heavy_frost', 8) }); return ids(l) === 'banded' && l[0].bonus.vital === 0.04 && l[0].bonus.ward === 1 && l[0].text === 'Banded set: +4% HP, +1 GRD'; })());
check('Banded: band 3 has no GRD, band 4 has', !('ward' in S.active({ weapon: W(6), armor: AR('arm_robe_moon', 5) })[0].bonus) && S.active({ weapon: W(8), armor: AR('arm_robe_druid', 7) })[0].bonus.ward === 1);
check('Banded: different bands -> no set', S.active({ weapon: W(5), armor: AR('arm_light_ranger', 4) }).length === 0 && S.active({ weapon: W(9), armor: AR('arm_heavy_frost', 8) }).length === 0);
check('Banded: every equal band 1-6 and every family is banded', [1, 2, 3, 4, 5, 6].every((b) => G.FAMILY_KEYS.every((f) => ids(S.active({ weapon: W(b * 2), armor: AR(G.armorId(f, b * 2 - 1), b * 2 - 1) })).indexOf('banded') === 0)));
check('Banded: a wpn_ style weapon counts like the Spark Wand', ids(S.active({ weapon: W(4, { id: 'wpn_bow_triple' }), armor: AR('arm_light_ranger', 3) })) === 'banded');
check('Banded: a signature relic is band 6 (pairs with a T11-12 weapon)', ids(S.active({ weapon: W(11), armor: AR('arm_sig_hydra', 12) })) === 'banded' && S.active({ weapon: W(9), armor: AR('arm_sig_hydra', 12) }).length === 0);
check('Banded needs both pieces tiered: T0 weapon, quickwand, missing armor -> none', S.active({ weapon: { n: 1, id: 'sparkwand', r: 3 }, armor: AR('arm_light_scout', 1) }).length === 0 && S.active({ weapon: { n: 1, id: 'quickwand', r: 0, t: 1 }, armor: AR('arm_light_scout', 1) }).length === 0 && S.active({ weapon: W(1) }).length === 0 && S.active({ armor: AR('arm_light_scout', 1) }).length === 0);
check('Banded: armor tier clamps into its band like MMGear.clean (arm_light_scout t 9 is band 1)', ids(S.active({ weapon: W(2), armor: AR('arm_light_scout', 9) })) === 'banded');

// ---- Dread pair ----
const T12 = (sig, a, r) => ({ n: 1, id: 'sparkwand', r: r || 0, t: 12, a: a, sig: sig });
const sigOf = (l) => l[l.length - 1];
check('Dread pair: arm_heavy_dread + T12 venom-signature weapon: signature +25% (capped)', (() => {
  let ok = 0, tried = 0;
  for (let a = 1; a <= 300; a++) {
    const eq = { weapon: T12('venom', a), armor: AR('arm_heavy_dread', 12) }, l = S.active(eq), d = l.find((s) => s.id === 'dread');
    const base = sigOf(A.roll('sparkwand', 'weapon', 12, 0, a, 'venom'));
    if (!d) continue; tried++;
    const v = d.bonus.venom;
    if (base.id === 'venom' && v > 0 && v <= Math.floor(base.v * 0.25 * 1000) / 1000 + 1e-12 && d.text === 'Dread pair: signature venom +25%') ok++;
  }
  return tried > 250 && ok === tried;
})());
check('Dread pair: the full +25% when the cap leaves room (leech carries no DPS weight)', (() => { const a = 5, base = sigOf(A.roll('sparkwand', 'weapon', 12, 0, a, 'leech')), d = S.active({ weapon: T12('leech', a), armor: AR('arm_light_dread', 11) }).find((s) => s.id === 'dread'); return base.id === 'leech' && d && Math.abs(d.bonus.leech - Math.floor(base.v * 0.25 * 1000) / 1000) < 1e-12; })());
check('Dread pair: also with the arm_sig_dread relic (any class) and with arm_light_dread', ids(S.active({ weapon: T12('blast', 9), armor: AR('arm_sig_dread', 12) })) === 'banded,dread' && S.active({ weapon: T12('venom', 9), armor: AR('arm_light_dread', 12) }).some((s) => s.id === 'dread'));
check('Dread pair needs dread armor: arm_robe_twilight / arm_heavy_paladin -> no dread', !S.active({ weapon: T12('venom', 9), armor: AR('arm_robe_twilight', 12) }).some((s) => s.id === 'dread') && !S.active({ weapon: T12('venom', 9), armor: AR('arm_heavy_paladin', 10) }).some((s) => s.id === 'dread'));
check('Dread pair needs a signature: no sig, an armor-slot sig (ward) or a junk sig -> no dread', [undefined, 'ward', 'keen', 'x', 5].every((sig) => !S.active({ weapon: T12(sig, 9), armor: AR('arm_heavy_dread', 12) }).some((s) => s.id === 'dread')));
check('Dread pair needs T11-12: a T10 weapon with a sig is never a pair', !S.active({ weapon: { n: 1, id: 'sparkwand', r: 0, t: 10, a: 9, sig: 'venom' }, armor: AR('arm_heavy_dread', 12) }).some((s) => s.id === 'dread'));
check('Dread pair needs the affix seed `a` (no roll, no signature)', !S.active({ weapon: { n: 1, id: 'sparkwand', r: 0, t: 12, sig: 'venom' }, armor: AR('arm_heavy_dread', 12) }).some((s) => s.id === 'dread'));
check('Dread pair: pierce (int 1) rounds +25% to 0, so a pierce signature never shows an empty set', [1, 2, 3, 40].every((a) => !S.active({ weapon: T12('pierce', a), armor: AR('arm_heavy_dread', 12) }).some((s) => s.id === 'dread')));

// ---- cap + max 2 ----
check('at most 2 sets active and always in ORDER', (() => { for (let a = 1; a <= 200; a++) { const l = S.active({ weapon: T12(['venom', 'blast', 'leech'][a % 3], a, a % 4), armor: AR('arm_heavy_dread', 12) }); if (l.length > 2 || (l.length === 2 && ids(l) !== 'banded,dread')) return false; } return true; })());
check('the weapon affix power cap still holds with the Dread pair (2000 seeds, r0-r3, blast/venom/leech)', (() => {
  for (let a = 1; a <= 2000; a++) for (const sig of ['venom', 'blast', 'leech']) {
    const r = a % 4, eq = { weapon: T12(sig, a, r), armor: AR('arm_sig_dread', 12) }, l = S.weaponAffixes(eq);
    if (A.value(l) > A.cap(12) + 1e-9) return false;
    if (A.value(l) + 1e-12 < A.value(A.roll('sparkwand', 'weapon', 12, r, a, sig))) return false; // a set never lowers the roll
  }
  return true;
})());
check('weaponAffixes: without the pair it is exactly the MMGearAffix roll; below T7 it is []', JSON.stringify(S.weaponAffixes({ weapon: T12('venom', 9), armor: AR('arm_heavy_paladin', 10) })) === JSON.stringify(A.roll('sparkwand', 'weapon', 12, 0, 9, 'venom')) && S.weaponAffixes({ weapon: W(6), armor: AR('arm_light_storm', 6) }).length === 0);
check('weaponAffixes: with the pair only the signature entry grows, by exactly the set bonus', (() => { const eq = { weapon: T12('leech', 5), armor: AR('arm_heavy_dread', 12) }, a = A.roll('sparkwand', 'weapon', 12, 0, 5, 'leech'), b = S.weaponAffixes(eq), d = S.active(eq).find((s) => s.id === 'dread'); return a.length === b.length && a.slice(0, -1).every((e, i) => e.v === b[i].v) && Math.abs(sigOf(b).v - sigOf(a).v - d.bonus.leech) < 1e-9; })());

// ---- extras (the realm _calcStats hook) ----
check('extras: every key, zeros without sets', (() => { const x = S.extras({}); return S.EXTRA_KEYS.every((k) => x[k] === 0) && Object.isFrozen(x); })());
check('extras: Banded band 6 + Dread pair sum into affix units', (() => { const eq = { weapon: T12('leech', 5), armor: AR('arm_heavy_dread', 12) }, x = S.extras(eq), d = S.active(eq).find((s) => s.id === 'dread'); return x.vital === 0.04 && x.ward === 1 && x.leech === d.bonus.leech && x.keen === 0; })());
check('extras accepts the active() list too', (() => { const eq = { weapon: W(7), armor: AR('arm_heavy_frost', 8) }; return JSON.stringify(S.extras(S.active(eq))) === JSON.stringify(S.extras(eq)); })());
check('eqItems may be an array of the equipped entries', ids(S.active([AR('arm_heavy_frost', 8), W(7)])) === 'banded');

// ---- determinism + hostile input ----
check('deterministic: same input, same output', JSON.stringify(S.active({ weapon: T12('venom', 123, 2), armor: AR('arm_heavy_dread', 12) })) === JSON.stringify(S.active({ weapon: T12('venom', 123, 2), armor: AR('arm_heavy_dread', 12) })));
check('inputs are never mutated; output frozen', (() => { const eq = { weapon: T12('venom', 9), armor: AR('arm_heavy_dread', 12) }, s = JSON.stringify(eq); const l = S.active(eq); S.extras(eq); S.weaponAffixes(eq); return JSON.stringify(eq) === s && Object.isFrozen(l) && l.every((x) => Object.isFrozen(x) && Object.isFrozen(x.bonus)); })());
check('hostile input -> [] / zeros, never throws', [null, undefined, 5, 'x', [], [null, 5, 'x'], {}, { weapon: 5, armor: 'x' }, { weapon: { id: '__proto__', t: 12 }, armor: { id: 'constructor', t: 12 } }, { weapon: { id: 'sparkwand', t: 1e9, a: -1 }, armor: { id: 'arm_heavy_dread', t: NaN } }, JSON.parse('{"__proto__":{"weapon":{"id":"sparkwand","t":3}},"armor":{"id":"arm_light_ranger","t":3}}')].every((x) => { try { return S.active(x).length === 0 && S.extras(x).vital === 0 && S.weaponAffixes(x).length === 0; } catch (e) { return false; } }));
check('a sig is kept by MMGear.clean only on a T12 weapon with an affix seed (additive save key)', G.clean({ n: 1, id: 'sparkwand', r: 0, t: 12, a: 5, sig: 'venom' }).sig === 'venom' && !('sig' in G.clean({ n: 1, id: 'sparkwand', r: 0, t: 11, a: 5, sig: 'venom' })) && !('sig' in G.clean({ n: 1, id: 'sparkwand', r: 0, t: 12, sig: 'venom' })) && !('sig' in G.clean({ n: 1, id: 'sparkwand', r: 0, t: 12, a: 5, sig: 'keen' })) && !('sig' in G.clean({ n: 1, id: 'arm_heavy_dread', r: 0, t: 12, a: 5, sig: 'ward' })));

console.log(bad ? 'FAILED ' + bad + ' of ' + n + ' assertions' : 'ok ' + n + ' assertions');
process.exitCode = bad ? 1 : 0;
