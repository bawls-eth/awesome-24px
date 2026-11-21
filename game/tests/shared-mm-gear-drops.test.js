// Run: node game/tests/shared-mm-gear-drops.test.js
const fs = require('fs'), path = require('path');
const D = require('../shared/mm-gear-drops.js');
const G = require('../shared/mm-gear.js');
const W = require('../shared/mm-weapon-items.js');
let n = 0, bad = 0;
function check(name, ok) { n++; if (!ok) { bad++; console.log('FAIL ' + name); } }
const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const T = D.TABLES;

// roll `count` items with one ctx, seeds 'p:<i>'; returns the results (nulls kept)
function many(ctx, count, tag) { const out = []; for (let i = 0; i < count; i++) out.push(D.rollGear(ctx, (tag || 'x') + ':' + i)); return out; }
function freq(results) { const f = {}; let tot = 0; results.forEach((r) => { if (r) { f[r.t] = (f[r.t] || 0) + 1; tot++; } }); Object.keys(f).forEach((k) => { f[k] /= tot; }); return f; }
function within(ctx, tol, N) {
  const f = freq(many(Object.assign({ always: true }, ctx), N || 20000, JSON.stringify(ctx))), exp = D.table(ctx);
  return exp.length > 0 && exp.every((e) => Math.abs((f[e.t] || 0) - e.p) <= tol) && Object.keys(f).every((k) => exp.some((e) => e.t === Number(k)));
}

// ---- tables ----
const allRows = [].concat(T.MOB, Object.values(T.BOSS), Object.values(T.ELITE), Object.values(T.DUNGEON), Object.values(T.DBOSS), [].concat(...T.EVENT));
check('every table row sums to 1', allRows.every((r) => Math.abs(r.reduce((s, e) => s + e.p, 0) - 1) < 1e-9 && r.every((e) => e.p > 0)));
check('row count: 4 mob + 3 boss + 1 elite + 4 dungeon + 4 dboss + 12 event', allRows.length === 4 + 3 + 1 + 4 + 4 + 12);
check('tables frozen', Object.isFrozen(T) && Object.isFrozen(T.MOB) && Object.isFrozen(T.MOB[0]) && Object.isFrozen(T.MOB[0][0]) && Object.isFrozen(D));
check('plan weights: z0 mob', eq(T.MOB[0].map((e) => [e.t, Math.round(e.p * 100)]), [[1, 60], [2, 30], [3, 10]]));
check('plan weights: z3 boss and elite', eq(T.BOSS[3].map((e) => [e.t, Math.round(e.p * 100)]), [[10, 60], [11, 35], [12, 5]]) && eq(T.ELITE.giant_spider_queen.map((e) => [e.t, Math.round(e.p * 100)]), [[9, 50], [10, 40], [11, 10]]));
check('mob tiers rise by zone and stay inside the plan windows', T.MOB.every((r, z) => r[0].t >= [1, 3, 5, 7][z] && r[r.length - 1].t <= [3, 6, 9, 10][z]));
check('boss zone lists cover all 16 bosses, 6 signature affixes', Object.keys(T.BOSS_ZONE).length === 16 && Object.keys(T.SIGNATURE).length === 6 && Object.keys(T.SIGNATURE).every((b) => T.BOSS_ZONE[b] === 3));
check('event windows shift +0/+1/+2 and cap at T11', T.EVENT.every((byTier, z) => byTier.every((r, s) => r.every((e) => e.t <= 12 && (e.t === 12 ? z === 3 && s === 2 : e.t <= 11)))) && T.EVENT[0][1][0].t === 2 && T.EVENT[2][2][0].t === 7);
check('only z3 hero event has T12 (5%)', T.EVENT.every((byTier, z) => byTier.every((r, s) => { const e12 = r.find((e) => e.t === 12); return z === 3 && s === 2 ? e12 && Math.abs(e12.p - 0.05) < 1e-9 : !e12; })));
check('dungeon windows', eq(T.DUNGEON.warren.map((e) => e.t), [2, 3]) && eq(T.DUNGEON.crypt.map((e) => e.t), [7, 8, 9]) && eq(T.DBOSS.warren.map((e) => e.t), [4]) && eq(T.DBOSS.meadow.map((e) => e.t), [8]));
check('GEAR_CHANCE by bag tier', eq(D.GEAR_CHANCE, [0.3, 0.4, 0.5, 0.6, 0.7, 0.8]));

// ---- statistical frequencies (20000 seeded rolls) ----
check('freq mob z0', within({ src: 'mob', zone: 0 }, 0.02));
check('freq mob z1', within({ src: 'mob', zone: 1 }, 0.02));
check('freq mob z2', within({ src: 'mob', zone: 2 }, 0.02));
check('freq mob z3', within({ src: 'mob', zone: 3 }, 0.02));
check('freq boss z1', within({ src: 'boss', zone: 1 }, 0.02));
check('freq boss z2 by boss id', within({ src: 'boss', boss: 'hydra' }, 0.02));
check('freq boss z3 (T12 at 5%)', within({ src: 'boss', boss: 'void_maw' }, 0.02));
check('freq elite spider queen', within({ src: 'elite', boss: 'giant_spider_queen', zone: 3 }, 0.02));
check('freq event z2 contribute', within({ src: 'event', zone: 2, eventTier: 1 }, 0.02));
check('freq event z3 hero (with 5% T12)', within({ src: 'event', zone: 3, eventTier: 2 }, 0.02));
check('freq chest uses the zone mob window', within({ src: 'chest', zone: 2 }, 0.02));
check('freq dungeon crypt mob / warren mob', within({ src: 'dungeon', biome: 'crypt' }, 0.02) && within({ src: 'dungeon', biome: 'warren' }, 0.02));
check('freq dungeon boss crypt / meadow', within({ src: 'dboss', biome: 'crypt' }, 0.02) && within({ src: 'dboss', biome: 'meadow' }, 0.02));
check('gear chance follows the bag tier (without always)', [0, 2, 5].every((bt) => {
  const r = many({ src: 'mob', zone: 1, bagTier: bt }, 20000, 'chance' + bt);
  return Math.abs(r.filter(Boolean).length / 20000 - D.GEAR_CHANCE[bt]) < 0.02;
}));
check('z3 boss T12 is 5% +-0.3% at gp 0 over 100k rolls', (() => { const f = freq(many({ src: 'boss', boss: 'dread_knight', always: true, gp: { b: 0, d: 0 } }, 100000, 'p100k')); return Math.abs(f[12] - 0.05) <= 0.003; })());

// ---- T12 gating ----
check('T12 comes only from z3 bosses and the z3 hero event', (() => {
  const ctxs = [];
  ['mob', 'chest'].forEach((s) => [0, 1, 2, 3].forEach((z) => ctxs.push({ src: s, zone: z })));
  [1, 2, 3].forEach((z) => ctxs.push({ src: 'boss', zone: z }));
  ctxs.push({ src: 'elite', boss: 'giant_spider_queen' });
  [0, 1, 2, 3].forEach((z) => [0, 1, 2].forEach((s) => ctxs.push({ src: 'event', zone: z, eventTier: s })));
  D.TABLES.BIOMES.forEach((b) => { ctxs.push({ src: 'dungeon', biome: b }); ctxs.push({ src: 'dboss', biome: b }); });
  return ctxs.every((c) => {
    const has12 = many(Object.assign({ always: true }, c), 4000, JSON.stringify(c)).some((r) => r && r.t === 12);
    const allowed = (c.src === 'boss' && c.zone === 3) || (c.src === 'event' && c.zone === 3 && c.eventTier === 2);
    return allowed ? has12 : !has12;
  });
})());
check('crypt dungeon boss never rolls T12 even with huge pity counters', many({ src: 'dboss', biome: 'crypt', always: true, gp: { b: 9999, d: 9999 } }, 3000, 'crypt12').every((r) => r.t <= 11));
check('mob and chest rolls ignore the boss pity counter', many({ src: 'mob', zone: 3, always: true, gp: { b: 9999, d: 0 } }, 3000, 'mobpity').every((r) => r.t <= 10));

// ---- determinism and per-player streams ----
check('same ctx + seed -> identical result', eq(D.rollGear({ src: 'boss', zone: 3, always: true, cls: 'ranger' }, 'seed:1'), D.rollGear({ src: 'boss', zone: 3, always: true, cls: 'ranger' }, 'seed:1')));
check('1000 seeded rolls reproduce exactly', eq(many({ src: 'mob', zone: 3, always: true, cls: 'rogue', r: 2 }, 1000, 'det'), many({ src: 'mob', zone: 3, always: true, cls: 'rogue', r: 2 }, 1000, 'det')));
check('two player ids give different streams', (() => {
  const a = [], b = [];
  for (let i = 0; i < 500; i++) {
    a.push(D.rollGear({ src: 'mob', zone: 3, always: true, cls: 'ranger' }, D.seedFor('w1', 'z3', i, 'alice')));
    b.push(D.rollGear({ src: 'mob', zone: 3, always: true, cls: 'ranger' }, D.seedFor('w1', 'z3', i, 'bob')));
  }
  return a.filter((x, i) => eq(x, b[i])).length < 100 && a.some((x, i) => !eq(x, b[i]));
})());
check('seedFor follows the rollDropForPlayers pattern', D.seedFor('W', 'tag', 7, 'p9') === 'drop:W:tag:7:p:p9');
check('item index k changes the stream, k >= 1 never uses pity', (() => {
  const a = D.rollGear({ src: 'boss', zone: 3, always: true, k: 0 }, 's'), b = D.rollGear({ src: 'boss', zone: 3, always: true, k: 1 }, 's');
  const forced = many({ src: 'boss', zone: 3, always: true, k: 1, gp: { b: 60, d: 0 } }, 2000, 'k1');
  return !eq(a, b) && forced.some((r) => r.t !== 12) && forced.every((r) => !r.pity);
})());
check('different seeds differ', new Set(many({ src: 'mob', zone: 3, always: true }, 200, 'diff').map((r) => JSON.stringify(r))).size > 50);

// ---- pity ----
check('pity guarantee: gp.b = 60 gives T12 every time (even without always)', many({ src: 'boss', zone: 3, gp: { b: 60, d: 0 } }, 3000, 'pity60').every((r) => r && r.t === 12 && r.pity === true));
check('b = 59 is not forced', many({ src: 'boss', zone: 3, always: true, gp: { b: 59, d: 0 } }, 3000, 'pity59').some((r) => r.t !== 12));
check('soft pity: +0.5% per kill, cap +10%', (() => {
  const f20 = freq(many({ src: 'boss', zone: 3, always: true, gp: { b: 20, d: 0 } }, 60000, 'soft20'));
  const f50 = freq(many({ src: 'boss', zone: 3, always: true, gp: { b: 50, d: 0 } }, 60000, 'soft50'));
  return Math.abs(f20[12] - 0.15) <= 0.006 && Math.abs(f50[12] - 0.15) <= 0.006; // 0.05 + min(.10, .005 b)
})());
check('soft pity keeps the other rows proportional', (() => { const f = freq(many({ src: 'boss', zone: 3, always: true, gp: { b: 10, d: 0 } }, 60000, 'prop')); return Math.abs(f[10] - 0.6 * (0.9 / 0.95)) <= 0.01 && Math.abs(f[11] - 0.35 * (0.9 / 0.95)) <= 0.01; })());
check('pityStep: +1 on a miss, reset on T12, only for z3 bosses', (() => {
  let gp = { b: 0, d: 0 };
  gp = D.pityStep(gp, { src: 'boss', zone: 3 }, [{ t: 11 }, null]);
  const a = gp.b;
  gp = D.pityStep(gp, { src: 'boss', zone: 3 }, []);
  const b = gp.b;
  const c = D.pityStep(gp, { src: 'boss', zone: 3 }, [{ t: 12 }]);
  const mob = D.pityStep(gp, { src: 'mob', zone: 3 }, [{ t: 12 }]), z2 = D.pityStep(gp, { src: 'boss', zone: 2 }, []);
  return a === 1 && b === 2 && c.b === 0 && mob.b === 2 && z2.b === 2;
})());
check('simulated careers: T12 guaranteed within 60 godlands boss kills, every career', (() => {
  let worst = 0, sum = 0;
  for (let c = 0; c < 2000; c++) {
    let gp = { b: 0, d: 0 }, kills = 0;
    for (;;) {
      kills++;
      const res = [0, 1, 2].map((k) => D.rollGear({ src: 'boss', zone: 3, boss: 'lich_king', k: k, bagTier: 5, gp: gp }, D.seedFor('sim' + c, 'lich', kills, 'me')));
      gp = D.pityStep(gp, { src: 'boss', zone: 3 }, res);
      if (res.some((r) => r && r.t === 12) || kills > 200) break;
    }
    worst = Math.max(worst, kills); sum += kills;
  }
  return worst <= 61 && sum / 2000 < 20 && sum / 2000 > 5;
})());
check('crypt pity: d = 15 gives T10+ and reset on success, d = 14 not forced', (() => {
  const f = many({ src: 'dboss', biome: 'crypt', gp: { b: 0, d: 15 } }, 3000, 'crypt15');
  const g = many({ src: 'dboss', biome: 'crypt', always: true, gp: { b: 0, d: 14 } }, 3000, 'crypt14');
  const hit = D.pityStep({ b: 3, d: 14 }, { src: 'dboss', biome: 'crypt' }, [{ t: 9 }]), win = D.pityStep({ b: 3, d: 14 }, { src: 'dboss', biome: 'crypt' }, [{ t: 10 }]);
  return f.every((r) => r && r.t >= 10) && g.some((r) => r.t === 9) && hit.d === 15 && win.d === 0 && win.b === 3 && D.pityStep({ b: 1, d: 5 }, { src: 'dboss', biome: 'meadow' }, []).d === 5;
})());
check('pityView matches the plan example and counts down', (() => { const v = D.pityView({ b: 14, d: 0 }); return v.text === 'Boss luck: +7% (T12 guaranteed in 46 kills)' && v.bossKillsLeft === 46 && v.bonusPct === 7 && D.pityView({ b: 60 }).bossKillsLeft === 0 && D.pityView({ b: 59 }).text.indexOf('1 kill)') > 0 && D.pityView({ b: 500 }).bonusPct === 10; })());
check('pityView text has no dark-pattern wording', (() => { const v = D.pityView({ b: 30, d: 7 }); return !/(buy|purchase|hurry|limited|expire|last chance|so close|almost|streak|lose|don't miss|now!)/i.test(v.text + ' ' + v.cryptText); })());
check('module has no timers, clock or Math.random', (() => { const src = fs.readFileSync(path.join(__dirname, '../shared/mm-gear-drops.js'), 'utf8').replace(/\/\/.*$/gm, ''); return !/Math\.random|Date\.now|setTimeout|setInterval|new Date/.test(src); })());
check('cleanGp survives hostile input', [null, 5, 'x', [], { b: -4, d: 'x' }, { b: 1e99, d: NaN }, { b: 3.9, d: 2 }].every((x) => { const g = D.cleanGp(x); return Number.isInteger(g.b) && Number.isInteger(g.d) && g.b >= 0 && g.d >= 0 && g.b <= 9999 && g.d <= 9999; }) && D.cleanGp({ b: 3.9, d: 2 }).b === 3);
check('pityStep never mutates and ignores hostile results', (() => { const gp = { b: 4, d: 1 }, s = JSON.stringify(gp); const r = D.pityStep(gp, { src: 'boss', zone: 3 }, [null, 5, 'x', { t: 'y' }, { t: NaN }]); return JSON.stringify(gp) === s && r.b === 5; })());

// ---- family shares, bounds, validity ----
check('weapon family share is 70% +-2% (class bolt or family wpn_)', (() => {
  const own = new Set(['sparkwand'].concat(W.familyItems('bow').map((i) => i.id)));
  const w = many({ src: 'mob', zone: 1, always: true, cls: 'ranger' }, 40000, 'wf').filter((r) => r.slot === 'weapon');
  return w.length > 15000 && Math.abs(w.filter((r) => own.has(r.id)).length / w.length - 0.7) <= 0.02;
})());
check('armor family share is 75% +-2% for every armor family', ['ranger', 'frostcaller', 'bruiser'].every((cls) => {
  const fam = G.armorFamilyOf(cls);
  const a = many({ src: 'mob', zone: 1, always: true, cls: cls }, 40000, 'af' + cls).filter((r) => r.slot === 'armor');
  return a.length > 15000 && Math.abs(a.filter((r) => G.ARMOR_IDS[fam].indexOf(r.id) >= 0).length / a.length - 0.75) <= 0.02;
}));
check('slot split is 50/50 +-2%', (() => { const r = many({ src: 'mob', zone: 2, always: true, cls: 'punk' }, 30000, 'slot'); return Math.abs(r.filter((x) => x.slot === 'armor').length / 30000 - 0.5) <= 0.02; })());
check('off-family weapons never come from the class family; unknown class draws from everything', (() => {
  const own = new Set(W.familyItems('bow').map((i) => i.id));
  const other = many({ src: 'mob', zone: 1, always: true, cls: 'ranger' }, 4000, 'off').filter((r) => r.slot === 'weapon' && r.id !== 'sparkwand' && !own.has(r.id));
  const anyCls = many({ src: 'mob', zone: 1, always: true, cls: 'nope' }, 4000, 'any').filter((r) => r.slot === 'weapon');
  return other.length > 100 && other.every((r) => /^wpn_/.test(r.id)) && new Set(anyCls.map((r) => r.id)).size > 15;
})());
check('every roll is a valid backpack entry (clean keeps id, t, r, a)', many({ src: 'boss', zone: 3, always: true, cls: 'warlock', r: 3 }, 3000, 'valid').every((r, i) => {
  const c = G.clean({ n: i + 1, id: r.id, r: r.r, t: r.t, a: r.a });
  return c && c.id === r.id && c.t === r.t && c.r === 3 && c.a === r.a && r.id !== 'quickwand';
}));
check('armor ids sit in the band of their tier; quickwand never drops', many({ src: 'mob', zone: 3, always: true, cls: 'paladin' }, 5000, 'band').every((r) => r.id !== 'quickwand' && (r.slot === 'weapon' || (G.armorId(r.id.split('_')[1], r.t) === r.id))));
check('affix seed: uint32, present only at T7+', many({ src: 'boss', zone: 3, always: true }, 3000, 'aff').every((r) => (r.t >= 7 ? Number.isInteger(r.a) && r.a >= 1 && r.a <= 4294967295 : !('a' in r))) && many({ src: 'mob', zone: 0, always: true }, 2000, 'aff0').every((r) => !('a' in r)));
check('affix seeds are well spread', (() => { const s = new Set(many({ src: 'mob', zone: 3, always: true }, 2000, 'spread').map((r) => r.a)); return s.size > 1990; })());
check('signature only on T12 z3 boss rolls and only for the listed bosses', (() => {
  const dk = many({ src: 'boss', boss: 'dread_knight', always: true, gp: { b: 60 } }, 500, 'sig');
  const maw = many({ src: 'boss', boss: 'void_maw', always: true, gp: { b: 60 } }, 100, 'sig2');
  const hero = many({ src: 'event', zone: 3, eventTier: 2, always: true }, 6000, 'sig3');
  const z2 = many({ src: 'boss', boss: 'hydra', always: true }, 2000, 'sig4');
  const nonT12 = many({ src: 'boss', boss: 'lich_king', always: true }, 3000, 'sig5').filter((r) => r.t !== 12);
  return dk.every((r) => r.sig === 'ward') && maw.every((r) => r.sig === 'blast') && hero.every((r) => !('sig' in r)) && z2.every((r) => !('sig' in r)) && nonT12.every((r) => !('sig' in r));
})());
check('quality r follows ctx and clamps', many({ src: 'mob', zone: 0, always: true, r: 2 }, 100, 'r2').every((r) => r.r === 2) && D.rollGear({ src: 'mob', always: true, r: 99 }, 's').r === 3 && D.rollGear({ src: 'mob', always: true, r: -4 }, 's').r === 0 && D.rollGear({ src: 'mob', always: true, r: 'x' }, 's').r === 0);
check('kill switch ctx.gear = false returns null', many({ src: 'boss', zone: 3, always: true, gear: false }, 50, 'ks').every((r) => r === null));
check('results are frozen', Object.isFrozen(D.rollGear({ src: 'mob', always: true }, 'f')));

// ---- hostile input ----
check('hostile ctx never throws and still yields valid output or null', [null, undefined, 5, 'x', [], {}, { src: 5, zone: 'x' }, { src: '__proto__', zone: NaN }, { zone: 99, r: NaN, bagTier: -4, k: 1e9 }, { src: 'boss', boss: '__proto__', zone: 3, gp: 'x' }, { src: 'event', zone: -1, eventTier: 99 }, { src: 'dungeon', biome: 'constructor' }, { src: 'dboss', biome: '__proto__' }].every((c) => {
  const r = (() => { try { return D.rollGear(Object.assign({}, c && typeof c === 'object' ? c : {}, { always: true }), 'h'); } catch (e) { return 'THROW'; } })();
  const r2 = (() => { try { return D.rollGear(c, 'h'); } catch (e) { return 'THROW'; } })();
  return r !== 'THROW' && r2 !== 'THROW' && (r === null || (G.clean({ n: 1, id: r.id, r: r.r, t: r.t, a: r.a }) !== null && r.t >= 1 && r.t <= 12));
}));
check('dungeon src without a valid biome never drops', D.rollGear({ src: 'dungeon', always: true }, 's') === null && D.rollGear({ src: 'dboss', biome: 'nope', always: true }, 's') === null && D.table({ src: 'dungeon' }).length === 0);
check('hostile seeds are tolerated', [undefined, null, 5, {}, [], 'x'.repeat(5000), NaN].every((s) => { const r = D.rollGear({ src: 'mob', zone: 2, always: true }, s); return r && r.t >= 5 && r.t <= 9; }));
check('rollGear never mutates ctx', (() => { const c = { src: 'boss', zone: 3, gp: { b: 5, d: 1 }, cls: 'ranger' }, s = JSON.stringify(c); D.rollGear(c, 'm'); return JSON.stringify(c) === s; })());
console.log((bad ? 'FAILED ' + bad + ' of ' : 'ok ') + n + ' assertions'); process.exit(bad ? 1 : 0);
