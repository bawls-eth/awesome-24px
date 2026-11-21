// Pure helper checks for MMHeroStats. Run: node game/tests/shared-mm-hero-stats.test.js
const H = require('../shared/mm-hero-stats.js');
const C = require('../shared/mm-classes.js');
const P = require('../shared/mm-profile.js');
let n = 0, bad = 0;
function check(name, ok, extra) { n++; if (!ok) { bad++; console.log('FAIL ' + name + (extra ? ' ' + extra : '')); } }

check('fmtTime seconds / minutes / hours', H.fmtTime(5) === '5s' && H.fmtTime(83) === '1m 23s' && H.fmtTime(3700) === '1h 01m');
check('fmtTime hostile input -> 0s', H.fmtTime(NaN) === '0s' && H.fmtTime('x') === '0s' && H.fmtTime(-9) === '0s' && H.fmtTime(null) === '0s');
check('fmtMult signed percent', H.fmtMult(1.3) === '+30%' && H.fmtMult(0.83) === '-17%' && H.fmtMult(1) === '0%' && H.fmtMult(undefined) === '0%');
check('rarityName maps and clamps', H.rarityName(0) === 'Common' && H.rarityName(3) === 'Epic' && H.rarityName(99) === 'Common' && H.rarityName('x') === 'Common');
check('zoneName known and unknown', H.zoneName(0) === 'Shore' && H.zoneName(3) === 'Godlands' && H.zoneName(-1) === 'None yet' && H.zoneName(null) === 'None yet');
check('fireText herald shows 2 bolts, fan, x0.75', /^2 bolts, fan 0\.12, pierce 0, x0\.75 dmg each/.test(H.fireText(C.arenaProfile('herald'))), H.fireText(C.arenaProfile('herald')));
check('fireText rogue shows crit', /crit 10%/.test(H.fireText(C.arenaProfile('rogue'))));
check('fireText survives junk', H.fireText(null) === '1 bolt, pierce 0, x1 dmg each' && typeof H.fireText('x') === 'string');
const ab = H.abilityRows(C, 'ranger');
check('abilityRows ranger: class ability + signature with cooldown', ab.length === 2 && /Yarn Snare - 40 focus/.test(ab[0].text) && /Thicket Volley - 12s cooldown/.test(ab[1].text), JSON.stringify(ab));
check('abilityRows unknown/hostile class -> empty', H.abilityRows(C, '__proto__').length === 0 && H.abilityRows(C, 'nope').length === 0 && H.abilityRows(null, 'ranger').length === 0);
check('lockHint starter / chain / any', H.lockHint(C, 'ranger') === 'Starter hero' && H.lockHint(C, 'punk') === 'Reach level 5 with a Thicket Ranger' && H.lockHint(C, 'trickster') === 'Reach level 10 with any hero' && H.lockHint(C, 'zzz') === 'Locked');
const prof = P.clean({ heroes: [{ id: 'a', name: 'Aya', cls: 'ranger', level: 5 }, { id: 'b', name: 'Bo', cls: 'herald', level: 1 }] });
const pl = H.pickerList(prof, C, 'b');
check('pickerList owned heroes with active flag', pl.owned.length === 2 && pl.owned[1].active && !pl.owned[0].active && pl.owned[0].clsName === 'Thicket Ranger');
check('pickerList locked: punk unlocked by ranger L5 so absent; rogue (L8) locked with hint', !pl.locked.some((l) => l.cls === 'punk') && pl.locked.some((l) => l.cls === 'rogue' && /Reach level 8/.test(l.hint) && l.locked && l.id === 'locked:rogue'));
check('pickerList hostile input does not throw', (() => { const r = H.pickerList({ heroes: [null, 5, { id: 3 }, { id: 'x', name: '<b>x</b>', cls: 7, level: 'q' }] }, C, null); return r.owned.length === 1 && r.owned[0].name === 'bx/b' && r.owned[0].level === 1; })());
check('pickerList missing everything', (() => { const r = H.pickerList(null, null, null); return r.owned.length === 0 && r.locked.length === 0; })());
const defs = { sparkwand: { name: 'Spark Wand', slot: 'weapon' } };
const ir = H.itemRows([{ n: 1, id: 'sparkwand', r: 2 }, { n: 2, id: '__proto__', r: 1 }], { weapon: 1, charm: 2 }, defs);
check('itemRows equipped with rarity, others empty', ir.length === 3 && ir[0].text === 'Spark Wand (Rare)' && ir[1].text === 'empty' && ir[2].text === 'empty', JSON.stringify(ir));
check('itemRows junk -> []', H.itemRows(null, null, null).length === 0 && H.itemRows('x', {}, {}).length === 0);
const rows = H.panelRows(C, { hero: { name: 'Aya', cls: 'paladin', level: 4, xp: 12 }, profile: C.arenaProfile('paladin'), stats: { maxHp: 125, dmg: 0.84, rate: 5.3, speed: 195 }, save: { shards: 77, items: [{ n: 1, id: 'sparkwand', r: 0 }], eq: { weapon: 1 } }, run: { kills: 9, deepest: 2, portals: 1, time: 125 }, defs });
const get = (l) => (rows.find((r) => r.label === l) || {}).value;
check('panelRows class numbers', get('HP') === '125 (+25%)' && get('Speed') === '195 (-17%)' && /shots\/s/.test(get('Attack rate')), JSON.stringify(rows.filter((r) => r.group === 'Class stats')));
check('panelRows run + gear', get('Kills') === '9' && get('Deepest zone') === 'Highlands' && get('Portals') === '1' && get('Time') === '2m 05s' && get('Shards') === '77' && get('Weapon') === 'Spark Wand (Common)');
check('panelRows has ability lines and signature', rows.some((r) => r.group === 'Abilities' && /Bulwark Oath/.test(r.value)));
check('panelRows hostile/empty never throws and values are strings', (() => { const r = H.panelRows(null, null); return r.length > 5 && r.every((x) => typeof x.value === 'string'); })());
check('panelRows prototype-ish class name is harmless', H.panelRows(C, { hero: { cls: '__proto__', name: '\u0000x' } }).some((r) => r.label === 'Class' && r.value === '__proto__'));
// ---- S6: Weapon / Passives / Status groups (added checks only)
const baseSnap = JSON.stringify(rows);
const rowsNew = H.panelRows(C, { hero: { name: 'Aya', cls: 'rogue', level: 4, xp: 12 }, profile: C.arenaProfile('rogue'), save: { shards: 1 },
  weapon: { style: 'Dagger Fan', family: 'dagger', pattern: '3 blades, fan 17 deg, range 466 px', rarity: 2, affixes: ['reach', 'keen'] },
  passives: { level: 9 }, status: [{ id: 'bleed', name: 'Bleed', sec: 2.46, stacks: 2 }, { id: 'slowed', sec: 1 }] });
const grp = (g) => rowsNew.filter((r) => r.group === g);
check('S6 new groups absent when no data is given', JSON.stringify(H.panelRows(C, { hero: { name: 'Aya', cls: 'paladin', level: 4, xp: 12 }, profile: C.arenaProfile('paladin'), stats: { maxHp: 125, dmg: 0.84, rate: 5.3, speed: 195 }, save: { shards: 77, items: [{ n: 1, id: 'sparkwand', r: 0 }], eq: { weapon: 1 } }, run: { kills: 9, deepest: 2, portals: 1, time: 125 }, defs })) === baseSnap && !rows.some((r) => ['Weapon', 'Passives', 'Status'].indexOf(r.group) >= 0));
check('S6 weapon group rows', grp('Weapon').map((r) => r.label).join() === 'Style,Fire pattern,Rarity,Affixes' && grp('Weapon')[0].value === 'Dagger Fan (dagger)' && grp('Weapon')[2].value === 'Rare' && grp('Weapon')[3].value === 'reach, keen');
check('S6 passives: ticked reached nodes, Lv N locked, Next row', grp('Passives').length === 5 && /^\[x\] /.test(grp('Passives')[0].value) && /^\[x\] /.test(grp('Passives')[1].value) && grp('Passives')[2].value === 'Lv 14' && grp('Passives')[3].value === 'Lv 19' && grp('Passives')[4].value === 'Lv 11 Nova II', JSON.stringify(grp('Passives')));
check('S6 status rows with stacks and seconds', grp('Status').length === 2 && grp('Status')[0].value === 'x2, 2.5s left' && grp('Status')[1].label === 'slowed' && grp('Status')[1].value === '1s left');
check('S6 groups sit before Gear and old groups keep their rows', rowsNew.findIndex((r) => r.group === 'Status') < rowsNew.findIndex((r) => r.group === 'Gear') && rowsNew.some((r) => r.group === 'Abilities'));
check('S6 hostile strings are cleaned and bounded', (() => { const r = H.panelRows(C, { hero: { cls: 'rogue' }, weapon: { style: '<b>x</b>\u0000' + 'y'.repeat(99), pattern: 7, rarity: 'z', affixes: ['<i>', 5, null, 'a', 'b', 'c'] }, passives: { level: 'NaN', unlocks: { forLevel() {}, nodes() { return [null, { id: 'x_4', lv: 4, name: '<script>', text: 5 }]; }, next() { return { lv: NaN, name: '<' }; } } }, status: [null, 3, { name: '\u0001<q>', sec: 'x', stacks: 1e9 }, { id: '__proto__', sec: -4 }] }); return r.every((x) => typeof x.value === 'string' && !/[<>\u0000-\u001f]/.test(x.value + x.label)) && r.filter((x) => x.group === 'Weapon').every((x) => x.value.length <= 125); })());
check('S6 junk weapon/passives/status give no rows and never throw', (() => { const r = H.panelRows(C, { hero: { cls: 'rogue' }, weapon: 'x', passives: 5, status: 'q' }); return !r.some((x) => ['Weapon', 'Passives', 'Status'].indexOf(x.group) >= 0) && H.passiveRows(C, '__proto__', { level: 5 }).length === 1 && H.statusRows([]).length === 0 && H.weaponRows(null).length === 0; })());
console.log(bad ? bad + ' FAILED of ' + n : 'ALL PASSED (' + n + ')');
process.exitCode = bad ? 1 : 0;
