// Run: node game/tests/shared-mm-gear.test.js
const fs = require('fs'), path = require('path');
const G = require('../shared/mm-gear.js');
const Q = require('../shared/mm-quests.js');
const MMItems = require('../shared/mm-items.js');
let n = 0, bad = 0;
function check(name, ok) { n++; if (!ok) { bad++; console.log('FAIL ' + name); } }
const near = (a, b, e) => Math.abs(a - b) <= (e || 1e-9);
const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const arcane = path.join(__dirname, '../assets/arcane');
const art = new Set();
fs.readdirSync(arcane).forEach((d) => {
  const f = path.join(arcane, d, 'manifest.json');
  if (fs.existsSync(f)) (JSON.parse(fs.readFileSync(f, 'utf8')).assets || []).forEach((a) => art.add(a.id));
});

// ---- tier table ----
const T = G.TIERS;
check('12 tiers, frozen', T.length === 12 && Object.isFrozen(T) && Object.isFrozen(T[0]) && T.every((r, i) => r.t === i + 1));
const mono = (k) => T.every((r, i) => i === 0 || r[k] >= T[i - 1][k]);
check('columns monotonic', ['gate', 'wd', 'hp', 'grd', 'res', 'bagIndex', 'affixes', 'sellAdd'].every(mono));
check('gate(12) === 20 and gate(1) === 1', G.gate(12) === 20 && G.gate(1) === 1 && G.gate(9) === 16);
check('plan table spot checks', T[0].wd === 0.70 && T[11].wd === 2.55 && T[11].hp === 80 && T[11].grd === 7 && T[11].res === 30 && T[6].affixes === 1 && T[8].affixes === 2 && T[11].signature === 1);
check('sell add = 2t', T.every((r) => r.sellAdd === 2 * r.t));
check('Q multipliers', eq(G.Q, [1, 1.12, 1.25, 1.4]) && Object.isFrozen(G.Q));
check('band = ceil(t/2); bad t -> 0', G.band(1) === 1 && G.band(2) === 1 && G.band(3) === 2 && G.band(12) === 6 && G.band(0) === 0 && G.band(13) === 0 && G.band('3') === 0);
check('soulbound only T11-12', [1, 5, 10].every((t) => !G.soulbound(t)) && G.soulbound(11) && G.soulbound(12) && !G.soulbound(0) && !G.soulbound(99));
check('bagFor index/art, T12 red + sparkle', G.bagFor(1).index === 0 && G.bagFor(9).art === 'bag_blue' && G.bagFor(11).art === 'bag_gold' && G.bagFor(12).art === 'bag_red' && G.bagFor(12).sparkle === 'bag_soulbound_sparkle' && G.bagFor(7).sparkle === null && G.bagFor(0) === null);
check('bag art ids exist', T.every((r) => art.has(r.bagArt)) && art.has('bag_soulbound_sparkle'));
check('tier colors', G.TIER_COLORS.length === 12 && G.TIER_COLORS[0] === '#c9d1d9' && G.TIER_COLORS[11] === '#ff6b6b' && G.TIER_COLORS[10] === '#ffd36b');

// ---- weapon ----
check('weaponBonus(0.5, 12, 3) = 3.57', near(G.weaponBonus(0.5, 12, 3), 3.57));
check('weaponBonus wpn_ amount 0.45 is 90%', near(G.weaponBonus(0.45, 7, 1), 0.9 * G.weaponBonus(0.5, 7, 1)));
check('weaponBonus T0 / hostile -> null', [0, 13, -1, 1.5, '3', null, NaN].every((t) => G.weaponBonus(0.5, t, 0) === null) && G.weaponBonus(0, 3, 0) === null && G.weaponBonus('x', 3, 0) === null);
check('weaponBonus r clamps', G.weaponBonus(0.5, 5, 99) === G.weaponBonus(0.5, 5, 3) && G.weaponBonus(0.5, 5, -2) === G.weaponBonus(0.5, 5, 0));
check('T12 epic spark wand beats today (2.8) by over 60%', (0.5 + G.weaponBonus(0.5, 12, 3)) / 2.8 > 1.4);

// ---- armor ids ----
const all = [].concat(G.ARMOR_IDS.light, G.ARMOR_IDS.robe, G.ARMOR_IDS.heavy);
check('18 unique armor ids matching GEAR_ID_RE', all.length === 18 && new Set(all).size === 18 && all.every((i) => G.GEAR_ID_RE.test(i)));
check('armor art ids exist in the arcane manifests', all.every((i) => G.ARMOR_ART[i] && art.has(G.ARMOR_ART[i])));
check('armor names present and unique', all.every((i) => typeof G.ARMOR_NAMES[i] === 'string' && G.ARMOR_NAMES[i]) && new Set(all.map((i) => G.ARMOR_NAMES[i])).size === 18);
check('armor ids round-trip through armorId', G.FAMILY_KEYS.every((f) => [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].every((t) => G.armorId(f, t) === G.ARMOR_IDS[f][Math.ceil(t / 2) - 1])));
check('armorId hostile', G.armorId('nope', 3) === null && G.armorId('__proto__', 3) === null && G.armorId('light', 0) === null && G.armorId('light', 13) === null && G.armorId(null, 1) === null);
check('CLASS_ARMOR covers all 14 classes from MMItems', Object.keys(G.CLASS_ARMOR).length === 14 && Object.keys(MMItems.CLASS_DEFS).every((k) => G.CLASS_ARMOR[k] === MMItems.CLASS_DEFS[k].armor));
check('armorFamilyOf casing and hostile', G.armorFamilyOf('Ranger') === 'light' && G.armorFamilyOf('GRAVETENDER') === 'robe' && G.armorFamilyOf('bruiser') === 'heavy' && G.armorFamilyOf('zzz') === null && G.armorFamilyOf('__proto__') === null && G.armorFamilyOf(5) === null);

// ---- alias ----
check('alias armor_heavy_t4 -> arm_heavy_warden t4', eq(G.alias('armor_heavy_t4'), { id: 'arm_heavy_warden', t: 4 }));
check('alias armor_robe_t0 -> arm_robe_linen t1', eq(G.alias('armor_robe_t0'), { id: 'arm_robe_linen', t: 1 }));
check('alias hostile', ['armor_heavy_t13', 'armor_x_t2', 'arm_heavy_iron', 'sparkwand', '__proto__', '', null, 5, {}, 'armor_heavy_t-1', 'armor_heavy_t004'].every((x) => G.alias(x) === null));
(function () {
  let ok = true, seen = 0;
  const ids = new Set();
  for (let i = 0; i < 1000; i++) {
    ['brown', 'pink', 'purple'].forEach((bag) => {
      Q.rewardBag({ bag: bag }, 'g1:' + i).items.forEach((it) => {
        if (!/^armor_/.test(it.id)) return;
        seen++;
        const a = G.alias(it.id);
        if (!a || !a.id || G.ARMOR_IDS[it.id.split('_')[1]].indexOf(a.id) < 0) ok = false; else ids.add(it.id);
      });
    });
  }
  check('alias covers every armor id rewardBag emits (1000 seeds x 3 bags)', ok && seen > 500 && ids.size >= 8);
  check('alias ids then clean to valid tiered items', (() => { let good = true; ids.forEach((id) => { const c = G.clean({ n: 5, id: id, r: 1 }); if (!c || !c.t || !G.ARMOR_NAMES[c.id]) good = false; }); return good; })());
})();

// ---- armor stats ----
check('armorStats heavy T10 Common: hp 60, guard 5', (() => { const s = G.armorStats('arm_heavy_paladin', 10, 0); return s.hp === 60 && s.guard === 5 && near(s.res, 0.2) && s.speed === -4; })());
check('armorStats light T10 Common guard 4 (5 x 0.75 rounded)', G.armorStats('arm_light_shade', 10, 0).guard === 4 && G.armorStats('arm_light_shade', 10, 0).speed === 10);
check('armorStats rare/epic add +1 GRD and Q hp', (() => { const a = G.armorStats('arm_heavy_iron', 1, 0), b = G.armorStats('arm_heavy_iron', 1, 2), c = G.armorStats('arm_heavy_iron', 1, 3); return a.guard === 1 && b.guard === 2 && c.guard === 2 && a.hp === 6 && b.hp === Math.round(6 * 1.25) && c.hp === Math.round(6 * 1.4); })());
check('armorStats robe has status chance, others 0', G.armorStats('arm_robe_twilight', 12, 0).statusChance === 0.06 && G.armorStats('arm_heavy_dread', 12, 0).statusChance === 0 && G.armorStats('arm_robe_linen', 1, 0).statusChance === 0.01);
check('armorStats min 1 and t clamps into band', G.armorStats('arm_robe_linen', 1, 0).guard >= 1 && G.armorStats('arm_robe_linen', 12, 0).t === 2);
check('armorStats hostile -> null', ['nope', '__proto__', null, 5].every((i) => G.armorStats(i, 3, 0) === null) && G.armorStats('arm_heavy_iron', 0, 0) === null && G.armorStats('arm_heavy_iron', 'x', 0) === null);
check('armorStats HP monotonic by band for every family', G.FAMILY_KEYS.every((f) => G.ARMOR_IDS[f].every((id, i) => i === 0 || G.armorStats(id, i * 2 + 1, 0).hp >= G.armorStats(G.ARMOR_IDS[f][i - 1], i * 2 - 1, 0).hp)));

// ---- clean ----
check('clean old item stays T0 and identical', eq(G.clean({ n: 1, id: 'sparkwand', r: 2 }), { n: 1, id: 'sparkwand', r: 2 }));
check('clean keeps t and a at T7+', eq(G.clean({ n: 3, id: 'wpn_bow_triple', r: 1, t: 7, a: 12345 }), { n: 3, id: 'wpn_bow_triple', r: 1, t: 7, a: 12345 }));
check('clean drops a below T7', (() => { const c = G.clean({ n: 3, id: 'sparkwand', r: 1, t: 6, a: 12345 }); return c.t === 6 && !('a' in c); })());
check('clean drops a on T0', !('a' in G.clean({ n: 3, id: 'sparkwand', r: 1, a: 77 })));
check('clean rejects t 13 / string / float / negative', [13, '1e3', '7', 1.5, -1, 0, NaN, Infinity, null, [7], {}].every((t) => { const c = G.clean({ n: 1, id: 'sparkwand', r: 0, t: t, a: 9 }); return c && !('t' in c) && !('a' in c); }));
check('clean rejects bad a', [0, -5, 4294967296, 1.5, '12', NaN, null].every((a) => !('a' in G.clean({ n: 1, id: 'sparkwand', r: 0, t: 9, a: a }))) && G.clean({ n: 1, id: 'sparkwand', r: 0, t: 9, a: 4294967295 }).a === 4294967295);
check('clean never tiers quickwand or charms', !('t' in G.clean({ n: 1, id: 'quickwand', r: 0, t: 9 })) && !('t' in G.clean({ n: 1, id: 'heartcharm', r: 0, t: 9 })) && !('t' in G.clean({ n: 1, id: 'potion_life', r: 0, t: 9 })));
check('clean hostile shapes -> null', [null, undefined, 5, 'x', [], [1], {}, { n: 1 }, { id: 'sparkwand' }, { n: 0, id: 'sparkwand' }, { n: -1, id: 'sparkwand' }, { n: 1.5, id: 'sparkwand' }, { n: '1', id: 'sparkwand' }, { n: 1, id: 5 }, { n: 1, id: '__proto__' }, { n: 1, id: 'constructor' }, { n: 1, id: 'A b' }, { n: 1, id: '' }, { n: 1e12, id: 'sparkwand' }].every((x) => G.clean(x) === null));
check('clean __proto__ own key does not pollute', (() => { const o = JSON.parse('{"n":1,"id":"sparkwand","r":0,"__proto__":{"t":9},"t":3}'); const c = G.clean(o); return c.t === 3 && ({}).t === undefined && Object.keys(c).sort().join() === 'id,n,r,t'; })());
check('clean aliases legacy armor ids with t', eq(G.clean({ n: 2, id: 'armor_robe_t4', r: 1 }), { n: 2, id: 'arm_robe_mage', r: 1, t: 4 }));
check('clean armor: tier defaults to band low and clamps into the band', G.clean({ n: 2, id: 'arm_heavy_iron', r: 0 }).t === 1 && G.clean({ n: 2, id: 'arm_heavy_iron', r: 0, t: 9 }).t === 2 && G.clean({ n: 2, id: 'arm_heavy_dread', r: 0, t: 1 }).t === 11);
check('clean unknown arm_ id stays inert and keeps t', (() => { const c = G.clean({ n: 2, id: 'arm_light_newthing', r: 0, t: 5 }); return c && c.id === 'arm_light_newthing' && c.t === 5 && G.armorStats(c.id, 5, 0) === null; })());
check('clean clamps r and ignores non-number r', G.clean({ n: 1, id: 'sparkwand', r: 99 }).r === 3 && G.clean({ n: 1, id: 'sparkwand', r: -3 }).r === 0 && G.clean({ n: 1, id: 'sparkwand', r: 'x' }).r === 0 && G.clean({ n: 1, id: 'sparkwand', r: 2.9 }).r === 2);
check('clean drops unknown keys, output frozen, input never mutated', (() => { const o = { n: 1, id: 'wpn_bow_leaf', r: 1, t: 8, a: 5, evil: 1, sig: 'x' }; const s = JSON.stringify(o); const c = G.clean(o); return JSON.stringify(o) === s && Object.isFrozen(c) && Object.keys(c).sort().join() === 'a,id,n,r,t'; })());
check('clean idempotent', (() => { const c = G.clean({ n: 9, id: 'armor_heavy_t5', r: 2 }); return eq(G.clean(c), c); })());

// ---- sell / equip / describe ----
check('sellValue = rarity sell + 2t', G.sellValue(0, 0) === 3 && G.sellValue(3, 12) === 54 && G.sellValue(1, 5) === 17 && G.sellValue(99, 99) === 30 && G.sellValue('x', 'y') === 3);
check('canEquip refuses heavy armor on a ranger', G.canEquip('arm_heavy_iron', 1, 'ranger', 20).ok === false && G.canEquip('arm_heavy_iron', 1, 'ranger', 20).reason === 'class' && G.canEquip('arm_heavy_iron', 1, 'bruiser', 1).ok);
check('canEquip refuses T9 at level 15, allows at 16', G.canEquip('arm_heavy_paladin', 9, 'punk', 15).reason === 'level' && G.canEquip('arm_heavy_paladin', 9, 'punk', 16).ok);
check('canEquip level gate for weapons', G.canEquip('sparkwand', 9, 'ranger', 15).reason === 'level' && G.canEquip('sparkwand', 9, 'ranger', 16).ok && G.canEquip('sparkwand', 0, 'ranger', 1).ok);
check('canEquip wpn_ family check', G.canEquip('wpn_bow_triple', 7, 'ranger', 12).ok && G.canEquip('wpn_bow_triple', 7, 'frostcaller', 12).reason === 'class');
check('canEquip hostile', [null, 5, {}, '__proto__'].every((i) => G.canEquip(i, 1, 'ranger', 20).ok === false) && G.canEquip('arm_heavy_iron', 1, 'zzz', 20).ok === false && G.canEquip('arm_heavy_iron', 1, null, 20).ok === false && G.canEquip('sparkwand', 3, 'ranger', NaN).ok === false);
check('describe weapon name and colors', (() => { const d = G.describe({ id: 'wpn_bow_triple', r: 2, t: 7 }); return d.name === 'T7 Triple Shot' && d.tierLabel === 'T7' && d.tierColor === '#d2a8ff' && !d.soulbound && d.gate === 12; })());
check('describe armor / soulbound / T0', (() => { const a = G.describe({ id: 'arm_robe_moon', r: 0, t: 5 }), b = G.describe({ id: 'arm_heavy_dread', r: 3, t: 12 }), c = G.describe({ id: 'sparkwand', r: 0 }); return a.name === 'T5 Moon Robe' && b.soulbound && b.gate === 20 && b.tierColor === '#ff6b6b' && c.name === 'Spark Wand' && c.tierLabel === '' && c.gate === 0; })());
check('describe hostile -> null; armor names have no angle brackets or underscores', [null, 5, [], {}, { id: 5 }, { id: '__proto__' }].every((x) => G.describe(x) === null) && all.every((i) => { const d = G.describe({ id: i, t: 3 }); return d && !/[<>_]/.test(d.name); }));

// ---- gearStats ----
check('gearStats totals', (() => {
  const items = [{ n: 1, id: 'sparkwand', r: 3, t: 12 }, { n: 2, id: 'arm_heavy_iron', r: 0, t: 1 }];
  const s = G.gearStats(items, { weapon: 1, armor: 2 }, { sparkwand: { amount: 0.5 } }, 'bruiser');
  return near(s.weaponDmg, 3.57) && s.weaponT === 12 && s.hp === 6 && s.guard === 1 && s.armorId === 'arm_heavy_iron';
})());
check('gearStats ignores off-family armor and hostile input', (() => {
  const items = [{ n: 2, id: 'arm_heavy_iron', r: 0, t: 1 }];
  const s = G.gearStats(items, { armor: 2 }, {}, 'ranger');
  return s.hp === 0 && s.armorId === null && G.gearStats(null, null, null, null).hp === 0 && G.gearStats([null, 5], { weapon: 1, armor: 'x' }, 5, 'x').weaponDmg === 0 && G.gearStats(items, { weapon: 2 }, {}, 'ranger').weaponDmg === 0;
})());
check('module object and results frozen', Object.isFrozen(G) && Object.isFrozen(G.ARMOR_IDS) && Object.isFrozen(G.ARMOR_ART) && Object.isFrozen(G.FAMILIES.light) && Object.isFrozen(G.armorStats('arm_heavy_iron', 1, 0)));
console.log((bad ? 'FAILED ' + bad + ' of ' : 'ok ') + n + ' assertions'); process.exit(bad ? 1 : 0);
