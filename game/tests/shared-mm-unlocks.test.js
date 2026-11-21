// Run: node game/tests/shared-mm-unlocks.test.js
const U = require('../shared/mm-unlocks.js');
const C = require('../shared/mm-classes.js');
let n = 0, bad = 0;
function check(name, ok) { n++; if (!ok) { bad++; console.log('FAIL ' + name); } }

const ids = Object.keys(C.CLASSES);
check('14 classes covered, same ids as MMClasses', U.classes().length === 14 && ids.every((k) => U.classes().indexOf(k) >= 0));

ids.forEach((k) => {
  const all = U.nodes(k), own = all.filter((x) => x.id.indexOf(k + '_') === 0);
  check(k + ' has 4 own nodes at 4/9/14/19', own.length === 4 && own.map((x) => x.lv).join() === '4,9,14,19');
  check(k + ' kinds passive,passive,sig,mastery', own.map((x) => x.kind).join() === 'passive,passive,sig,mastery');
  check(k + ' plus Nova II at 11 and Dash II at 16', all.length === 6 && all.some((x) => x.id === 'nova2_11' && x.lv === 11) && all.some((x) => x.id === 'dash2_16' && x.lv === 16));
  check(k + ' ids unique and match the arms id regex', new Set(all.map((x) => x.id)).size === 6 && all.every((x) => U.ID_RE.test(x.id)));
  check(k + ' short <= 9 chars, text and name non-empty', all.every((x) => x.short.length > 0 && x.short.length <= 9 && x.text.length > 5 && x.name.length > 2));
  const sg = C.arenaSignature(k);
  check(k + ' every sig field exists in arenaSignature', U.sigFields(k).length >= 1 && U.sigFields(k).every((f) => Object.prototype.hasOwnProperty.call(sg, f)));
  const idx = U.index(k, 19);
  check(k + ' L19 index in [1.08, 1.16] (got ' + idx.toFixed(3) + ')', idx >= 1.08 && idx <= 1.16);
  check(k + ' defensive caps hold (hp <= +8%, iframes <= +10%)', U.capsOk(k, 19));
  check(k + ' no nodes below L4 except none', U.forLevel(k, 3).length === 0 && U.forLevel(k, 4).length === 1);
  check(k + ' sigFor applies the L14 mods to a copy', (() => {
    const d = C.arenaSignature(k), before = JSON.stringify(d), o = U.sigFor(k, 14, d), f = U.sigFields(k)[0];
    return JSON.stringify(d) === before && o !== d && o[f] === U.aggregate(k, 14).sig[f] && JSON.stringify(U.sigFor(k, 13, d)) === before;
  })());
});

check('forLevel gates by level', U.forLevel('rogue', 9).map((x) => x.id).join() === 'rogue_4,rogue_9' && U.forLevel('rogue', 11).length === 3 && U.forLevel('rogue', 20).length === 6);
check('next() gives the following node', U.next('ranger', 9).id === 'nova2_11' && U.next('ranger', 14).id === 'dash2_16' && U.next('ranger', 19) === null);
check('crossed() lists nodes passed in a level jump', U.crossed('rogue', 3, 9).map((x) => x.id).join() === 'rogue_4,rogue_9' && U.crossed('rogue', 9, 9).length === 0);
check('isUnlocked', U.isUnlocked('rogue', 'rogue_4', 4) && !U.isUnlocked('rogue', 'rogue_4', 3) && !U.isUnlocked('rogue', 'ranger_4', 20));
check('rogue_4 is rate x1.04, ranger Keen Eye life x1.15', U.aggregate('rogue', 4).mul.rate === 1.04 && U.aggregate('ranger', 4).mul.life === 1.15);
check('Nova II is 20 bolts from L11, Dash II 2.5 s from L16', U.novaBolts(10) === 16 && U.novaBolts(11) === 20 && U.dashCooldown(15) === 3 && U.dashCooldown(16) === 2.5);
check('activeSlots unlock at 1/3/5/7', U.activeSlots(4).map((s) => s.unlocked).join() === 'true,true,false,false' && U.activeSlots(7).every((s) => s.unlocked) && U.activeSlots(16).map((s) => s.tier).join() === '2,2,1,1');
check('hostile class and level are safe', U.nodes('__proto__').length === 2 && U.nodes(null).length === 2 && U.forLevel('constructor', 20).length === 2 && U.forLevel('rogue', NaN).length === 0 && U.forLevel('rogue', 'x').length === 0 && U.forLevel('rogue', 1e9).length === 6);
check('returned nodes are copies', (() => { const a = U.nodes('rogue'); a[0].name = 'x'; a[0].mods.length = 0; return U.nodes('rogue')[0].name !== 'x' && U.nodes('rogue')[0].mods.length > 0; })());
check('sigFor on junk gives null', U.sigFor('rogue', 14, null) === null && U.sigFor('rogue', 14, 5) === null);

// cleanArms
check('cleanArms blank on junk', [null, undefined, 5, 'x', [], [1]].every((v) => JSON.stringify(U.cleanArms(v)) === '{"v":1,"seen":[],"hud":{"icons":true}}'));
const good = U.cleanArms({ v: 9, seen: ['rogue_4', 'rogue_4', 'ranger_19', 'nova2_11', 'dash2_16'], hud: { icons: false } });
check('cleanArms keeps valid ids, dedupes, keeps hud flag', good.v === 1 && good.seen.join() === 'rogue_4,ranger_19,nova2_11,dash2_16' && good.hud.icons === false);
check('cleanArms rejects bad ids', U.cleanArms({ seen: ['Rogue_4', 'rogue_5', 'rogue_4x', '_4', 'a_4', 'rogue_04', 7, null, {}, '__proto__', 'rogue_4\n', 'x'.repeat(40) + '_4'] }).seen.length === 0);
const many = []; for (let i = 0; i < 200; i++) many.push('abc' + i + '_4');
check('cleanArms caps at 64 ids', U.cleanArms({ seen: many }).seen.length === 64);
check('cleanArms does not mutate its input', (() => { const inp = { seen: ['rogue_4', 'rogue_4'], hud: { icons: false } }, s = JSON.stringify(inp); U.cleanArms(inp); return JSON.stringify(inp) === s; })());
check('cleanArms hud ignores non-false values', U.cleanArms({ hud: { icons: 'no' } }).hud.icons === true && U.cleanArms({ hud: [] }).hud.icons === true);
check('cleanArms is idempotent', JSON.stringify(U.cleanArms(good)) === JSON.stringify(good));
check('markSeen marks nodes at or below level, no toast flood', (() => { const a = U.markSeen(null, 'rogue', 11); return a.seen.join() === 'rogue_4,rogue_9,nova2_11' && U.unseen(a, 'rogue', 11).length === 0 && U.unseen(a, 'rogue', 14).map((x) => x.id).join() === 'rogue_14'; })());
check('unseen on blank arms lists all unlocked', U.unseen(null, 'rogue', 4).map((x) => x.id).join() === 'rogue_4');

console.log((bad ? 'FAILED ' + bad : 'ok') + ' (' + n + ' checks)');
process.exit(bad ? 1 : 0);
