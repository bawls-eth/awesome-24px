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
check('itemRows equipped with rarity, others empty', ir.length === 4 && ir[0].text === 'Spark Wand (Rare)' && ir[1].slot === 'armor' && ir[1].text === 'empty' && ir[2].text === 'empty' && ir[3].text === 'empty', JSON.stringify(ir));
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
// ---- G5: stats table builders (added checks only)
const T = { maxHp: 130, dmg: 2.4, rate: 7.5, count: 2, crit: 0.1, guard: 3, speed: 240, splashR: 36, splashFrac: 0.5, resist: 0.1, regen: 0.8 };
const B = { maxHp: 100, dmg: 1.1, rate: 7.5, count: 2, crit: 0.05, guard: 0, speed: 235 };
const tab = H.statTable(T, B), row = (k) => tab.find((r) => r.key === k) || {};
check('G5 statTable has Total/Base/Gear per row', tab.length >= 9 && tab.every((r) => ['key', 'label', 'total', 'base', 'gear', 'totalText', 'baseText', 'gearText', 'aria'].every((f) => f in r)));
check('G5 gear = total - base', row('hp').gear === 30 && Math.abs(row('dmg').gear - 1.3) < 1e-9 && row('speed').gear === 5 && row('rate').gear === 0 && Math.abs(row('crit').gear - 0.05) < 1e-9);
check('G5 pct text and gear text', row('crit').totalText === '10%' && row('crit').baseText === '5%' && row('crit').gearText === '+5%' && row('resist').totalText === '10%');
check('G5 est DPS = dmg x rate x count x (1 + crit)', Math.abs(row('dps').total - 2.4 * 7.5 * 2 * 1.1) < 1e-3 && Math.abs(row('dps').base - 1.1 * 7.5 * 2 * 1.05) < 1e-3);
check('G5 splash row text "r 36 px, 50%", base none', row('splash').totalText === 'r 36 px, 50%' && row('splash').base === 0);
check('G5 optional rows hidden when zero, core rows shown', !tab.some((r) => ['status', 'leech', 'bonus'].indexOf(r.key) >= 0) && ['hp', 'dmg', 'rate', 'dps', 'speed', 'guard'].every((k) => row(k).key));
check('G5 every statTable row has aria text with total/base/gear', tab.every((r) => /^[A-Za-z ]+: total .+, base .+, gear .+/.test(r.aria)) && /gear plus 30/.test(row('hp').aria) && /gear none/.test(row('rate').aria));
const cr = H.compareRows(B, T), crow = (k) => cr.find((r) => r.key === k) || {};
check('G5 compareRows lists changed rows only', cr.length > 0 && !cr.some((r) => r.key === 'rate') && cr.every((r) => r.dir === 'up' || r.dir === 'down') && H.compareRows(B, B).length === 0);
check('G5 compare uses arrows and signs, not colour', crow('dmg').text === '▲ +1.3' && crow('crit').text === '▲ +5%' && /^▲ \+/.test(crow('hp').text) && H.compareRows(T, B).every((r) => /^▼ -/.test(r.text) && r.dir === 'down'));
check('G5 every compare row has aria text', cr.every((r) => typeof r.aria === 'string' && /^[A-Za-z ]+ (up|down) [0-9.]+/.test(r.aria)) && crow('dmg').aria === 'Damage up 1.3' && crow('crit').aria === 'Crit chance up 5 percent' && H.compareRows(T, B).find((r) => r.key === 'dmg').aria === 'Damage down 1.3');
check('G5 fmtDelta', H.fmtDelta(0.3, '') === '▲ +0.3' && H.fmtDelta(-2, ' px') === '▼ -2 px' && H.fmtDelta(0, '') === '= 0' && H.fmtDelta(0.04, 'pct') === '▲ +4%' && H.fmtDelta(0.0001, '') === '= 0');
const hostileIn = [undefined, null, 0, NaN, Infinity, 'x', '__proto__', [], {}, () => 1, Symbol('s'), { maxHp: 'a', dmg: NaN, rate: Infinity, crit: {}, splashR: -Infinity }, { __proto__: { maxHp: 5 } }, JSON.parse('{"__proto__":{"dmg":1},"maxHp":"<b>"}')];
check('G5 builders never throw on hostile input and return arrays', hostileIn.every((h) => { try { return Array.isArray(H.statTable(h, h)) && Array.isArray(H.compareRows(h, h)) && Array.isArray(H.statTable(T, h)) && Array.isArray(H.compareRows(h, T)) && typeof H.fmtDelta(h, h) === 'string' && typeof H.bossLuck(h) === 'string'; } catch (e) { return false; } }));
check('G5 hostile numbers give finite values only', hostileIn.every((h) => H.statTable(h, T).concat(H.compareRows(T, h)).every((r) => Object.keys(r).every((k) => typeof r[k] !== 'number' || Number.isFinite(r[k])))));
const allText = JSON.stringify([tab, cr, H.statTable('<b>', '<i>'), H.statTable({ maxHp: '<script>', unit: '<' }, { label: '<' }), H.compareRows({ label: '<b>' }, { label: '<i>', dmg: '<' }), H.fmtDelta('<', '<'), H.fmtDelta(5, '<img>'), H.bossLuck({ b: '<' })]);
check('G5 outputs never contain "<"', allText.indexOf('<') < 0);
check('G5 inputs are not mutated and builders are deterministic', (() => { const t0 = JSON.stringify([T, B]); const a = JSON.stringify(H.statTable(T, B)); const c = JSON.stringify(H.compareRows(B, T)); return JSON.stringify([T, B]) === t0 && a === JSON.stringify(H.statTable(T, B)) && c === JSON.stringify(H.compareRows(B, T)); })());
check('G5 frozen inputs are fine', H.statTable(Object.freeze(Object.assign({}, T)), Object.freeze(Object.assign({}, B))).length === tab.length);
check('G5 statTable with no base treats gear as 0', H.statTable(T, null).every((r) => r.gear === 0) && H.statTable(T, null).length > 0);
check('G5 itemRows has 4 slots incl. armor with tier label and soulbound', (() => {
  const defs2 = { arm_robe_moon: { name: 'Moon Robe' }, wpn_wand_seeker: { name: 'Seeker Wand' } };
  const r4 = H.itemRows([{ n: 1, id: 'wpn_wand_seeker', r: 2, t: 7 }, { n: 2, id: 'arm_robe_moon', r: 1, t: 12 }], { weapon: 1, armor: 2 }, defs2);
  return r4.length === 4 && r4.map((x) => x.slot).join() === 'weapon,armor,charm,ring' && r4[0].text === 'T7 Seeker Wand (Rare)' && r4[0].tier === 'T7' && !r4[0].soulbound && r4[1].text === 'T12 Moon Robe (Uncommon)' && r4[1].soulbound === true && r4[2].text === 'empty';
})());
check('G5 itemRows ignores bad tiers (T0 stays plain)', (() => { const r = H.itemRows([{ n: 1, id: 'sparkwand', r: 0, t: 13 }, { n: 2, id: 'sparkwand', r: 0, t: '7' }, { n: 3, id: 'sparkwand', r: 0, t: 2.5 }], { weapon: 1, charm: 2, ring: 3 }, defs); return r.every((x) => x.tier === '') && r[0].text === 'Spark Wand (Common)'; })());
const gsRows = H.panelRows(C, { hero: { cls: 'paladin' }, profile: C.arenaProfile('paladin'), stats: T, statsBase: B, gp: { b: 14, d: 3 }, save: {} });
const gs = (l) => (gsRows.find((r) => r.group === 'Gear stats' && r.label === l) || {}).value;
check('G5 panelRows gains Gear stats group only when statsBase is given', gs('HP') === '130 (base 100, gear +30)' && gs('Damage per bolt') === '2.4 (base 1.1, gear +1.3)' && !H.panelRows(C, { hero: { cls: 'paladin' }, stats: T }).some((r) => r.group === 'Gear stats'));
check('G5 Boss luck row from gp, shown without statsBase too', gs('Boss luck') === '+7% (T12 guaranteed in 46 kills)' && H.panelRows(C, { gp: { b: 60 } }).some((r) => r.label === 'Boss luck' && /guaranteed in 0 kills/.test(r.value)));
check('G5 boss luck caps at +10% and clamps hostile gp', H.bossLuck({ b: 999 }) === '+10% (T12 guaranteed in 0 kills)' && H.bossLuck({ b: -5 }) === '+0% (T12 guaranteed in 60 kills)' && H.bossLuck({ b: 59 }) === '+10% (T12 guaranteed in 1 kill)' && H.bossLuck(null) === '');
check('G5 panelRows with hostile gear data stays strings without "<"', (() => { const r = H.panelRows(C, { hero: { cls: 'paladin' }, stats: { maxHp: '<b>' }, statsBase: { maxHp: '<i>', dmg: {} }, gp: { b: '<' }, save: { items: [{ n: 1, id: 'sparkwand', r: 0, t: 7 }], eq: { weapon: 1, armor: 1 } }, defs: { sparkwand: { name: '<b>Spark</b>' } } }); return r.every((x) => typeof x.value === 'string' && x.value.indexOf('<') < 0 && x.label.indexOf('<') < 0); })());
console.log(bad ? bad + ' FAILED of ' + n : 'ALL PASSED (' + n + ')');
process.exitCode = bad ? 1 : 0;
