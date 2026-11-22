// Run: node game/tests/shared-mm-endgame.test.js
const fs = require('fs'), path = require('path');
const E = require('../shared/mm-endgame.js');
const G = require('../shared/mm-gear.js');
const D = require('../shared/mm-gear-drops.js');
const Z = require('../shared/mm-zones.js');
const O = require('../shared/mm-overworld.js');
const Dif = require('../shared/mm-difficulty.js');
const Tg = require('../shared/mm-telegraph.js');
let n = 0, bad = 0;
function check(name, ok) { n++; if (!ok) { bad++; console.log('FAIL ' + name); } }
const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const URGENT = /hurry|last chance|limited|miss out|only \d|expires|countdown|don't lose|before it|running out|left!|remaining/i;
const HOSTILE = [null, undefined, NaN, Infinity, -1, 'x', '__proto__', [], {}, { __proto__: { b: 999 } }, JSON.parse('{"__proto__":{"b":60},"constructor":1}'), { b: 'NaN', d: {} }, () => 1];
const noThrow = (fn) => { try { fn(); return true; } catch (e) { console.log('  threw: ' + e.message); return false; } };
const allText = (o) => JSON.stringify(o);

// ---------- source hygiene ----------
const SRC = fs.readFileSync(path.join(__dirname, '../shared/mm-endgame.js'), 'utf8');
const code = SRC.split('\n').filter((l) => !/^\s*\/\//.test(l)).join('\n');
check('no Math.random in source', !/Math\.random/.test(code));
check('no Date in source', !/\bDate\b/.test(code) && !/performance\.now/.test(code));
check('no DOM in source', !/\b(document|window|localStorage|sessionStorage|fetch|XMLHttpRequest)\b/.test(code));
check('UMD: module export frozen', Object.isFrozen(E) && typeof E.chase === 'function');
check('UMD: browser global MMEndgame', /root\.MMEndgame\s*=/.test(SRC));
check('source wording has no urgency words', !/hurry|last chance|limited|miss out/i.test(code.replace(/MUT_|limit/g, '')));

// ---------- tables stay in step with owners ----------
check('6 bosses = MMOverworld.BOSS_POOLS[3]', eq(E.BOSS_IDS.slice(), O.BOSS_POOLS[3]));
check('relic ids = MMGear.SIG_BY_BOSS', E.BOSSES.every((b) => G.SIG_BY_BOSS[b[0]] === b[2]) && Object.keys(G.SIG_BY_BOSS).length === 6);
check('relic names = MMGear.ARMOR_NAMES', E.BOSSES.every((b) => G.ARMOR_NAMES[b[2]] === b[3]));
check('every rush boss is a z3 boss in MMGearDrops', E.BOSS_IDS.every((id) => D.BOSS_ZONE[id] === 3));
check('rush windup = MMTelegraph boss windup', E.RUSH.windup === Tg.windupFor(3, true));

// ---------- (1) chase ----------
const c0 = E.chaseView({ b: 0, d: 0 });
check('chaseView 0: 0 of 60', c0.text === '0 of 60 toward a sure T12' && c0.toward === 0 && c0.bonusPct === 0 && c0.t12Pct === 5 && c0.nextForced === false);
const c12 = E.chaseView({ b: 12, d: 3 });
check('chaseView 12: the exact spec line', c12.text === '12 of 60 toward a sure T12' && c12.pityB === 12 && c12.pityD === 3);
check('chaseView 12: boss luck matches MMGearDrops.pityView', c12.bonusPct === D.pityView({ b: 12 }).bonusPct && c12.luckText === 'Boss luck +6%' && c12.t12Pct === 11);
check('chaseView: bonus capped at +10%', E.chaseView({ b: 40 }).bonusPct === 10 && E.chaseView({ b: 59 }).bonusPct === 10);
const c60 = E.chaseView({ b: 60 }), cBig = E.chaseView({ b: 1e9 });
check('chaseView 60+: sure, capped toward, t12 100%', c60.sure && c60.nextForced && c60.toward === 60 && c60.t12Pct === 100 && cBig.toward === 60 && cBig.pityB <= 9999);
check('chaseView crypt line', E.chaseView({ d: 4 }).cryptText === '4 of 15 toward a sure crypt T10+' && E.chaseView({ d: 99 }).cryptText.indexOf('15 of 15') === 0);
check('chaseView: hostile input safe', HOSTILE.every((h) => noThrow(() => E.chaseView(h))) && E.chaseView({ b: NaN, d: 'x' }).toward === 0 && E.chaseView(JSON.parse('{"__proto__":{"b":60}}')).toward === 0);
check('chaseView: no urgency or countdown wording', [0, 1, 12, 59, 60, 61].every((b) => !URGENT.test(allText(E.chaseView({ b: b, d: b })))) && !/\bin \d+ kills?\b/.test(allText(E.chaseView({ b: 12 }))));
const save = { gp: { b: 7, d: 2 }, items: [{ id: 'arm_sig_lich', r: 2, t: 12 }, { id: 'wpn_x', t: 9 }], stash: ['arm_sig_dread'], finds: { pending: [{ id: 'arm_sig_maw' }] } };
const saveCopy = JSON.stringify(save);
const ch = E.chase(save);
check('chase: fields', ch.pityB === 7 && ch.pityD === 2 && ch.nextForced === false && Array.isArray(ch.relicsOwned) && ch.relicsOwned.length === 6);
check('chase: relicsOwned in boss order', eq(ch.relicsOwned, [true, false, false, true, false, true]) && ch.relicCount === 3 && ch.t12Owned === true && ch.bestTier === 12);
check('chase: read-only (input untouched) and frozen', JSON.stringify(save) === saveCopy && Object.isFrozen(ch) && Object.isFrozen(ch.relicsOwned));
check('chase: no T12 when none held', E.chase({ gp: { b: 1 }, items: [{ id: 'wpn_x', t: 10 }] }).t12Owned === false && E.chase({ items: [{ id: 'wpn_x', t: 10 }] }).bestTier === 10);
check('chase: hostile saves safe', HOSTILE.every((h) => noThrow(() => E.chase(h))) && noThrow(() => E.chase({ items: 'x', stash: { length: 1e9 }, heroes: [null, { items: [null, 5, { id: {} }] }], finds: null })));
check('chase: deterministic', eq(E.chase(save), E.chase(JSON.parse(saveCopy))));

// ---------- (2) relic book ----------
const rb0 = E.relicBook([]);
check('relicBook: 6 entries, none found', rb0.entries.length === 6 && rb0.total === 6 && rb0.found === 0 && rb0.entries.every((e) => !e.found && /^Not yet/.test(e.text)));
check('relicBook: entries carry the SIG_BY_BOSS ids and friendly names', eq(rb0.entries.map((e) => e.id), E.BOSS_IDS.map((b) => G.SIG_BY_BOSS[b])) && rb0.entries[0].name === 'Dread Plate' && rb0.entries[0].bossName === 'Dread Knight');
const rb = E.relicBook({ items: ['arm_sig_wyrm'], stash: [null, { id: 'arm_sig_oracle', t: 12 }], heroes: [{ items: [], keepsake: { id: 'arm_sig_hydra' } }], finds: { recent: [{ id: 'arm_sig_wyrm' }] } });
check('relicBook: reads items / stash / heroes / finds, no double count', rb.found === 3 && rb.text === '3 of 6 relics found' && eq(rb.entries.map((e) => e.found), [false, true, true, false, true, false]));
check('relicBook: an array input works and found text names the boss', E.relicBook([{ id: 'arm_sig_maw' }]).entries[5].text === 'Maw Shard (Void Maw)');
check('relicBook: hostile safe', HOSTILE.every((h) => noThrow(() => E.relicBook(h))) && E.relicBook(JSON.parse('{"__proto__":{"items":["arm_sig_maw"]}}')).found === 0 && E.relicBook(['__proto__', 'constructor']).found === 0);
check('relicBook: frozen, deterministic, calm wording', Object.isFrozen(rb) && Object.isFrozen(rb.entries[0]) && eq(rb0, E.relicBook(null)) && !URGENT.test(allText(rb) + allText(rb0)));
const huge = []; for (let i = 0; i < 5000; i++) huge.push({ id: 'wpn_x' }); huge.push({ id: 'arm_sig_dread' });
check('relicBook: list length capped (500 per list)', E.relicBook(huge).found === 0);

// ---------- (3) rush ladder ----------
const L = E.rushLadder('world-1', 20);
check('rush: ok at Lv 20, 6 steps, every z3 boss once', L.ok && L.steps.length === 6 && eq(L.steps.map((s) => s.boss).sort(), E.BOSS_IDS.slice().sort()));
check('rush: deterministic for a fixed seed', eq(L, E.rushLadder('world-1', 20)) && eq(L.steps, E.rushLadder('world-1', 35).steps));
const orders = new Set(); for (let i = 0; i < 40; i++) orders.add(E.rushLadder('s' + i, 20).steps.map((s) => s.boss).join(','));
check('rush: the order depends on the seed', orders.size > 20);
check('rush: level gate (Lv 19 / hostile = closed, no steps)', !E.rushLadder('a', 19).ok && E.rushLadder('a', 19).steps.length === 0 && [null, NaN, -5, '__proto__', {}].every((lv) => !E.rushLadder('a', lv).ok) && /level 20/.test(E.rushLadder('a', 1).text));
check('rush: every step has an off-ramp, keeps drops, normal pity and bag', L.steps.every((s, i) => s.step === i + 1 && s.offRamp === true && s.keepsDrops === true && s.pity === 'normal' && s.bag === 'boss' && s.extraLoot === false && s.leaveText === 'Leave with your loot' && /^.*Rest here$/.test(s.restText)));
check('rush: rules (no lives, no timer, no fee, no lockout, 1 pity per kill)', L.rules.lives === false && L.rules.timer === false && L.rules.entryFee === 0 && L.rules.lockout === false && L.rules.pityPerKill === 1 && L.rules.keepDrops === true && L.rules.extraLoot === false);
const base = Z.statMultipliers(3, 3, true);
check('rush: step 1 is the world boss exactly (MMZones z3 boss mults)', Math.abs(L.steps[0].hpMul - base.hpMul) < 1e-3 && Math.abs(L.steps[0].dmgMul - base.dmgMul) < 1e-3 && Math.abs(L.steps[0].speedMul - base.speedMul) < 1e-3);
check('rush: ramp capped at +10% and never falls', L.steps.every((s, i) => s.ramp.hp <= 1.1 && s.ramp.dmg <= 1.1 && s.hpMul <= base.hpMul * 1.1 + 1e-3 && (i === 0 || s.ramp.hp >= L.steps[i - 1].ramp.hp)));
check('rush: own telegraphs at the boss windup (>= 0.6 s)', L.steps.every((s) => s.telegraphs === 'own' && s.windup >= 0.6 && s.zone === 3 && s.tier === 3));
check('rush: 6 kills add exactly 6 to gp.b with normal pityStep (no T12)', (() => { let gp = { b: 3, d: 0 }; L.steps.forEach((s) => { gp = D.pityStep(gp, { src: 'boss', boss: s.boss }, [{ t: 10 }]); }); return gp.b === 9; })());
check('rush: hostile seeds safe and calm wording', HOSTILE.every((h) => noThrow(() => E.rushLadder(h, 20))) && E.rushLadder('x'.repeat(1e5), 20).steps.length === 6 && !URGENT.test(allText(L) + allText(E.rushLadder('a', 3))));
check('rush: frozen', Object.isFrozen(L) && Object.isFrozen(L.steps) && Object.isFrozen(L.steps[0]) && Object.isFrozen(L.rules));

// ---------- (4) mutators ----------
check('mutators: the set holds narrow, dim, swarm, mirror, brittle, swift; each named', ['narrow', 'dim', 'swarm', 'mirror', 'brittle', 'swift'].every((id) => E.MUTATORS[id] && E.MUTATORS[id].name && E.MUTATORS[id].text));
check('mutators: never on warren or z1 dungeons', E.mutatorsFor('warren', 2, 's').list.length === 0 && E.mutatorsFor('bramble', 1, 's').list.length === 0 && E.mutatorsFor('bramble', undefined, 's').list.length === 0 && E.mutatorsFor('crypt', 2, 's').list.length === 1);
const m1 = E.mutatorsFor('crypt', 2, 'dungeon-9');
check('mutators: deterministic for a fixed seed', eq(m1, E.mutatorsFor('crypt', 2, 'dungeon-9')) && eq(E.mutatorsFor('meadow', 3, 7, { count: 2 }), E.mutatorsFor('meadow', 3, 7, { count: 2 })));
const seen = new Set(); for (let i = 0; i < 60; i++) seen.add(E.mutatorsFor('meadow', 2, 'k' + i).ids[0]);
check('mutators: the seed picks among the whole set', seen.size === E.MUT_IDS.length);
check('mutators: default 1, never more than 2, never twice the same', m1.list.length === 1 && [5, 99, 1e9, Infinity].every((c) => E.mutatorsFor('crypt', 2, 'a', { count: c }).list.length <= 2) && Array.from({ length: 50 }, (_, i) => E.mutatorsFor('crypt', 2, 'd' + i, { count: 2 })).every((m) => m.ids.length === 2 && m.ids[0] !== m.ids[1]));
check('mutators: off switch (?mut=0) and count 0 give none', E.mutatorsFor('crypt', 2, 'a', { off: true }).list.length === 0 && E.mutatorsFor('crypt', 2, 'a', { count: 0 }).label === '');
check('mutators: always shown by name (label)', Array.from({ length: 30 }, (_, i) => E.mutatorsFor('crypt', 2, 'L' + i, { count: 2 })).every((m) => m.label.length > 0 && m.list.every((x) => m.label.indexOf(x.name) >= 0)));
const allPicks = []; for (let i = 0; i < 200; i++) allPicks.push(E.mutatorsFor(i % 2 ? 'crypt' : 'meadow', 2 + (i % 2), 'c' + i, { count: 1 + (i % 2) }));
check('mutators: fx within caps, no damage / fire / windup increase', allPicks.every((m) => Object.keys(E.MUT_CAP).every((k) => m.fx[k] >= E.MUT_CAP[k][0] && m.fx[k] <= E.MUT_CAP[k][1]) && m.fx.dmg === 1 && m.fx.fire === 1 && m.fx.windup === 1));
check('mutators: ttk within +-25% (hp x count)', allPicks.every((m) => Math.abs(m.fx.hp * m.fx.count - 1) <= 0.25 || m.fx.count === 1) && allPicks.every((m) => m.fx.hp * m.fx.count >= 0.75 * 0.8));
check('mutators: hostile input safe', HOSTILE.every((h) => noThrow(() => E.mutatorsFor(h, h, h, h))) && E.mutatorsFor('__proto__', 3, 'a').list.length === 0 && E.mutatorsFor('crypt', NaN, 'a').list.length === 1 && E.mutatorsFor('crypt', 2, 'a', JSON.parse('{"__proto__":{"count":2}}')).list.length === 1);
check('mutators: frozen, calm wording', Object.isFrozen(m1) && Object.isFrozen(m1.list) && Object.isFrozen(m1.fx) && !URGENT.test(allText(E.MUTATORS) + allText(allPicks)));
// applyMutators keeps every MMDifficulty band
const CL = Dif.TABLES.CLAMP;
let inBand = true;
['warren', 'bramble', 'meadow', 'crypt'].forEach((b) => { for (let r = 1; r <= 8; r++) [false, true].forEach((boss) => allPicks.forEach((m) => {
  const s = E.applyMutators(Dif.dungeonScale(b, r, 8, boss), m);
  Dif.KEYS.forEach((k) => { if (!(s[k] >= CL[k][0] && s[k] <= CL[k][1])) inBand = false; });
})); });
check('applyMutators: every result inside MMDifficulty CLAMP', inBand);
const sc = Dif.dungeonScale('crypt', 4, 8, false);
check('applyMutators: swarm = +50% count and -30% hp, dmg unchanged', (() => { const s = E.applyMutators(sc, { fx: E.MUTATORS.swarm.fx }); return Math.abs(s.count - Math.min(CL.count[1], sc.count * 1.5)) < 2e-3 && Math.abs(s.hp - sc.hp * 0.7) < 2e-3 && s.dmg === sc.dmg; })());
check('applyMutators: hostile fx capped (no 10x)', (() => { const s = E.applyMutators({ hp: 1, dmg: 1, spd: 1, count: 1, fire: 1 }, { fx: { hp: 10, dmg: 9, spd: 9, count: 9, fire: 9 } }); return s.hp === 1 && s.dmg === 1 && s.spd === 1.15 && s.count === 1.5 && s.fire === 1; })() && HOSTILE.every((h) => noThrow(() => E.applyMutators(h, h))) && eq(E.applyMutators(null, null), Dif.IDENTITY));

// ---------- deep runs ----------
const d1 = E.deepRun(1, 'meadow'), d2 = E.deepRun(2, 'meadow'), d3 = E.deepRun(3, 'crypt');
check('deepRun: floor 1 = today\'s window', eq(d1.tiers, D.TABLES.DUNGEON.meadow.map((e) => e.t)) && d1.tierShift === 0);
check('deepRun: +1 tier per floor', eq(d2.tiers, D.TABLES.DUNGEON.meadow.map((e) => e.t + 1)) && d2.tierShift === 1 && eq(E.deepRun(2, 'warren').bossTiers, [5]));
check('deepRun: tiers capped at T11, floor capped at 3', d3.tiers.every((t) => t <= 11) && d3.bossTiers.every((t) => t <= 11) && E.deepRun(99, 'crypt').floor === 3 && E.deepRun(1e9).tierShift === 2);
check('deepRun: off-ramp and kept loot on every floor, same boss pool', [1, 2, 3].every((f) => { const d = E.deepRun(f, 'crypt'); return d.offRamp && d.keepsLoot && d.bossPool === 'biome' && d.timer === false; }) && d3.nextStairs === false && d1.nextStairs === true);
check('deepRun: hostile safe and deterministic', HOSTILE.every((h) => noThrow(() => E.deepRun(h, h))) && E.deepRun(NaN, '__proto__').floor === 1 && E.deepRun(NaN, '__proto__').biome === 'warren' && eq(E.deepRun(2, 'crypt'), E.deepRun(2, 'crypt')));
check('deepRun: frozen, calm wording', Object.isFrozen(d2) && Object.isFrozen(d2.tiers) && !URGENT.test(allText([d1, d2, d3])));

console.log(bad ? bad + ' of ' + n + ' FAILED' : 'ALL PASSED (' + n + ' checks)');
process.exit(bad ? 1 : 0);
