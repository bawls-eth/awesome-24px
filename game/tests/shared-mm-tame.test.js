// Unit tests for shared/mm-tame.js. Run: node game/tests/shared-mm-tame.test.js
const fs = require('fs');
const path = require('path');
const C = require('../shared/mm-creatures.js');
const T = require('../shared/mm-tame.js');
let failed = 0;
function check(name, cond, extra = '') { console.log((cond ? 'PASS ' : 'FAIL ') + name + (cond ? '' : ' ' + extra)); if (!cond) failed++; }
const done = () => { console.log(failed ? `${failed} FAILED` : 'ALL PASSED'); process.exitCode = failed ? 1 : 0; };
const deepFreeze = (o) => { if (o && typeof o === 'object') { Object.freeze(o); Object.values(o).forEach(deepFreeze); } return o; };
const K = T.K;

const raptor = C.get('fernraptor');      // S knockout: torpor 80, need 5, feedEvery 6, sleep 60, diet raw_meat
const hopper = C.get('clover_hopper');   // S feed: need 5, feedEvery 6, diet clover/flower
const boar = C.get('thistle_boar');      // M calm, diet apple/clover
const tyrant = C.get('fernjaw_tyrant');  // boss knockout
const mk = (def, extra) => T.init(def, Object.assign({ seed: 's1', wildId: 'w1', level: 1 }, extra));
// run a list of [input, dt] pairs, collect events
function run(def, s, steps) { const ev = []; let st = s; steps.forEach(([i, dt]) => { const r = T.step(def, st, i, dt === undefined ? 0.1 : dt); st = r.state; ev.push(r.events.join('+')); }); return { s: st, ev }; }
// put a raptor to sleep
const sleeper = (extra) => T.step(raptor, mk(raptor, extra), { torporHit: 80 }, 0.1).state;

{ // init
  const s = mk(raptor);
  check('init gives a wild state scaled for level 1', s.st === 'wild' && s.torporMax === 80 && s.need === 5 && s.prog === 0 && s.eff === 1 && !s.locked);
  check('init is a fresh copy each call', mk(raptor) !== mk(raptor) && JSON.stringify(mk(raptor)) === JSON.stringify(mk(raptor)));
  check('init rejects junk and accepts a def id', T.init(null) === null && T.init({}) === null && T.init('nope') === null && T.init('__proto__') === null && T.init('fernraptor', {}).id === 'fernraptor');
  check('level scales need, torpor and sleep by 3% per level (cap 50)', (() => { const a = mk(raptor, { level: 21 }), b = mk(raptor, { level: 999 }); return a.torporMax === 128 && a.need === 8 && b.level === 50 && T.levelMul(50) > 2.4 && T.levelMul(-5) === 1; })());
  check('non-tameable creature starts locked', T.init(C.get('vinecoil'), { seed: 1 }).locked === true);
  check('affinity raises starting eff by up to 20%', mk(hopper, { affinity: 1 }).eff === 1.2 && mk(hopper, { affinity: 99 }).eff === 1.2 && mk(hopper, { affinity: -1 }).eff === 1);
}
{ // knockout
  const s0 = mk(raptor);
  const a = T.step(raptor, s0, { torporHit: 79.9 }, 0.1);
  const b = T.step(raptor, a.state, { torporHit: 0.1 }, 0.1);
  check('soothe-only fight KOs at exactly the threshold', a.state.st === 'wild' && b.state.st === 'ko' && b.events.includes('ko') && b.state.torpor === 80);
  const c = T.step(raptor, mk(raptor), { dmg: 100 }, 0.1);
  check('normal damage builds torpor at x0.3', Math.abs(c.state.torpor - 30) < 1e-9 && c.state.st === 'wild');
  const w40 = Object.assign(mk(raptor), { torpor: 32 }), w39 = Object.assign(mk(raptor), { torpor: 31.9 });
  const k1 = T.step(raptor, w40, { lethal: true, dmg: 999 }, 0.1), k2 = T.step(raptor, w39, { lethal: true, dmg: 999 }, 0.1);
  check('a lethal hit at 40% torpor KOs and keeps it alive', k1.state.st === 'ko' && k1.events.includes('saved') && k1.state.torpor === 80);
  check('a lethal hit at 39% torpor kills', k2.state.st === 'dead' && k2.events.includes('killed'));
  check('a lethal hit on a sleeper kills it', T.step(raptor, sleeper(), { lethal: true }, 0.1).state.st === 'dead');
  const idle = run(raptor, Object.assign(mk(raptor), { torpor: 40, lastHit: 0 }), Array.from({ length: 150 }, () => [{}, 0.1])).s;
  check('torpor drains when the creature is left alone', idle.torpor < 40 && idle.torpor >= 0 && idle.st === 'wild');
  const cont = run(raptor, mk(raptor), Array.from({ length: 50 }, () => [{ torporHit: 1 }, 0.1])).s;
  check('torpor does not drain while it is being hit', cont.torpor >= 49.9);
  check('a knockout creature cannot be fed while awake', T.step(raptor, mk(raptor), { offer: 'raw_meat', playerDist: 10 }, 0.1).events.join() === 'cannot_feed');
}
{ // feeding
  const s = sleeper();
  const r1 = T.step(raptor, s, { offer: 'raw_meat' }, 0.1);
  check('feeding a sleeper starts taming and adds progress', r1.state.st === 'taming' && r1.state.how === 'ko' && r1.state.prog > 0.85 && r1.state.prog < 1.15 && r1.events.includes('fed'));
  const r2 = T.step(raptor, r1.state, { offer: 'raw_meat' }, 1);
  check('feeding faster than feedEvery gives no progress', r2.state.prog === r1.state.prog && r2.events.includes('toofast'));
  const r3 = T.step(raptor, r2.state, { offer: 'raw_meat' }, 5.2);
  check('feeding after feedEvery gives progress again', r3.state.prog > r1.state.prog && r3.events.includes('fed'));
  const wrong = T.step(raptor, s, { offer: 'apple' }, 0.1);
  check('wrong food is refused: no progress, counted', wrong.state.prog === 0 && wrong.state.wrong === 1 && wrong.events.includes('refused') && wrong.state.st === 'ko');
  const hit = T.step(raptor, r1.state, { dmg: 5 }, 0.1);
  check('a hit while KO\'d costs 0.1 eff', Math.abs(hit.state.eff - 0.9) < 1e-9 && hit.events.includes('hit') && hit.state.st === 'taming');
  const many = run(raptor, s, Array.from({ length: 30 }, () => [{ dmg: 1 }, 0.01])).s;
  check('eff never falls below the floor', many.eff === K.EFF_MIN);
  const liked = T.step(boar, T.step(boar, mk(boar), { playerDist: 10 }, 0.1).state, { offer: 'clover', playerDist: 10 }, 0.1).state;
  const fav = T.step(boar, T.step(boar, mk(boar), { playerDist: 10 }, 0.1).state, { offer: 'apple', playerDist: 10 }, 0.1).state;
  check('liked food gives half the progress of the favourite', liked.prog > 0.4 && liked.prog < 0.6 && fav.prog > 0.85 && fav.prog < 1.15);
  const feast = T.step(tyrant, Object.assign(mk(tyrant), { st: 'ko', how: 'ko', wakeAt: 99 }), { offer: 'feast' }, 0.1).state;
  check('better food quality (feast x1.5) gives more progress', feast.prog > 1.3 && feast.prog < 1.7);
  const aff = T.step(hopper, T.step(hopper, mk(hopper, { affinity: 1 }), { playerDist: 5 }, 0.1).state, { offer: 'clover', playerDist: 5 }, 0.1).state;
  check('affinity raises taming effectiveness', aff.prog > 1.05 && aff.eff === 1.2);
}
{ // finishing, wake, escape
  let s = sleeper(), t = 0, last = null;
  for (let i = 0; i < 8 && s.st !== 'tamed'; i++) { const r = T.step(raptor, s, { offer: 'raw_meat' }, 6.1); s = r.state; last = r.events; }
  check('enough feeds tame it with a bond of 1 + floor(eff*4)', s.st === 'tamed' && last.includes('tamed') && s.bond === 5 && s.bondPct === 100, JSON.stringify([s.st, s.bond, s.bondPct]));
  check('a tamed creature ignores everything', (() => { const r = T.step(raptor, s, { lethal: true, dmg: 99, offer: 'raw_meat' }, 5); return r.state.st === 'tamed' && r.events.length === 0 && r.state.prog === s.prog; })());
  check('wrong food and hits lower the bond percentage', (() => {
    let x = Object.assign(sleeper(), {}); x = T.step(raptor, x, { dmg: 1 }, 0.1).state; x = T.step(raptor, x, { offer: 'apple' }, 0.1).state;
    for (let i = 0; i < 9 && x.st !== 'tamed'; i++) x = T.step(raptor, x, { offer: 'raw_meat' }, 6.1).state;
    return x.st === 'tamed' && x.bond < 5 && x.bondPct < 100 && x.bondPct >= 60;
  })());
  const half = T.step(raptor, sleeper(), { offer: 'raw_meat' }, 0.1).state;
  const woke = T.step(raptor, half, {}, 61);
  check('a sleeper wakes after its sleep, keeping 50% progress, and the attempt counts', woke.state.st === 'wild' && woke.events.includes('wake') && Math.abs(woke.state.prog - half.prog * 0.5) < 0.01 && woke.state.attempts === 1 && woke.state.torpor === 0);
  const sl = sleeper();
  check('sleepy herb extends sleep but never past 2x', (() => {
    const e1 = T.step(raptor, sl, { extend: 10 }, 0.1).state; const e2 = T.step(raptor, sl, { extend: 500 }, 0.1).state;
    return e1.wakeAt > sl.wakeAt + 9.9 && e2.wakeAt <= e2.t + 120 + 1e-9 && T.sleepLeft(sl) > 59 && T.sleepLeft(mk(raptor)) === 0;
  })());
  const esc = (() => { let x = sleeper(); const evs = []; for (let i = 0; i < 5 && x.st !== 'escaped'; i++) { x = T.step(raptor, x, {}, 61).state; if (x.st === 'wild') x = T.step(raptor, x, { torporHit: 80 }, 0.1).state; evs.push(x.st); } return { x, evs }; })();
  check('after the max number of wild attempts the creature escapes for good', K.MAX_ATTEMPTS === 3 && esc.x.st === 'escaped' && esc.x.attempts === 3 && T.step(raptor, esc.x, { torporHit: 999, offer: 'raw_meat' }, 1).events.length === 0, esc.evs.join());
}
{ // befriend
  const s0 = mk(hopper);
  const far = T.step(hopper, s0, { offer: 'clover', playerDist: 200 }, 0.1);
  check('a far-away player cannot feed a wild creature', far.events.join() === 'cannot_feed' && far.state.prog === 0 && far.state.st === 'wild');
  const near = T.step(hopper, s0, { playerDist: 50 }, 0.1);
  check('staying close and peaceful calms a feed creature', near.state.st === 'calm' && near.events.includes('calm'));
  const sc = run(hopper, near.state, [[{ dmg: 1 }], [{ scare: 1 }], [{ dmg: 1 }]]);
  check('three scares fail a befriend, reset progress and start a cooldown', sc.s.st === 'wild' && sc.ev[2].includes('fail') && sc.s.attempts === 1 && sc.s.failUntil > sc.s.t && sc.s.prog === 0, sc.ev.join('|'));
  const again = T.step(hopper, sc.s, { playerDist: 10 }, 0.1);
  check('a scared creature will not calm during the cooldown', again.state.st === 'wild' && !again.events.includes('calm'));
  const half = T.step(hopper, T.step(hopper, s0, { playerDist: 10 }, 0.1).state, { playerDist: 10, offer: 'clover' }, 0.1).state;
  const left = run(hopper, half, Array.from({ length: 60 }, () => [{ playerDist: 500 }, 0.1]));
  check('walking away loses interest and half the progress, without costing an attempt', left.s.st === 'wild' && left.ev.includes('lost') && Math.abs(left.s.prog - half.prog * 0.5) < 0.01 && left.s.attempts === 0);
  const decayed = T.step(hopper, Object.assign(T.step(hopper, s0, { playerDist: 10 }, 0.1).state, { scare: 2, lastScare: 0 }), { playerDist: 10 }, 20).state;
  check('scares are forgotten over time', decayed.scare === 1 && decayed.st === 'calm');
  const done5 = (() => { let x = T.step(hopper, s0, { playerDist: 10 }, 0.1).state; for (let i = 0; i < 9 && x.st !== 'tamed'; i++) x = T.step(hopper, x, { playerDist: 10, offer: 'clover' }, 6.1).state; return x; })();
  check('a feed creature is tamed by feeding alone, no knockout', done5.st === 'tamed' && done5.how === 'calm' && done5.torpor === 0);
}
{ // boss
  const weary = (hp) => T.step(tyrant, mk(tyrant), { torporHit: 5000, hpFrac: hp }, 0.1);
  check('a boss ignores torpor until it is weary (<= 25% HP)', weary(0.6).state.st === 'wild' && weary(0.6).events.includes('not_weary') && weary(0.25).state.st === 'ko');
  check('a lethal blow on a healthy boss kills it, a weary boss is saved', T.step(tyrant, Object.assign(mk(tyrant), { torpor: 500 }), { lethal: true, hpFrac: 0.9 }, 0.1).state.st === 'dead' && T.step(tyrant, Object.assign(mk(tyrant), { torpor: 500 }), { lethal: true, hpFrac: 0.2 }, 0.1).state.st === 'ko');
  const dragon = C.get('frost_dragon');
  const d1 = T.step(dragon, T.init(dragon, { seed: 1 }), { offer: 'fish', torporHit: 9999 }, 0.1);
  check('an untameable creature refuses food and torpor; a lethal blow still kills', d1.events.includes('untameable') && d1.state.st === 'wild' && d1.state.torpor === 0 && T.step(dragon, T.init(dragon, { seed: 1 }), { lethal: true }, 0.1).state.st === 'dead');
}
{ // determinism and purity
  const script = [[{ torporHit: 50 }], [{ torporHit: 40 }], [{ offer: 'raw_meat' }, 6.1], [{ offer: 'raw_meat' }, 6.1], [{ dmg: 1 }], [{ offer: 'raw_meat' }, 6.1], [{ offer: 'raw_meat' }, 6.1], [{ offer: 'raw_meat' }, 6.1]];
  const a = run(raptor, mk(raptor), script), b = run(raptor, mk(raptor), script), c = run(raptor, mk(raptor, { seed: 'other' }), script);
  check('the same seed gives the same events and state', JSON.stringify(a) === JSON.stringify(b) && a.ev.some((e) => e.includes('fed')));
  check('a different seed changes the feed rolls (not the events)', a.s.prog !== c.s.prog && Math.abs(a.s.prog - c.s.prog) < 1);
  const s = deepFreeze(mk(raptor)), inp = deepFreeze({ torporHit: 100, offer: 'raw_meat' });
  let threw = false, r; try { r = T.step(raptor, s, inp, 0.1); } catch (e) { threw = true; }
  check('step never mutates its inputs (deep-frozen state and input work)', !threw && r.state !== s && s.torpor === 0 && s.st === 'wild' && r.state.st !== 'wild' && r.events.includes('ko'));
  check('step returns fresh state copies each call', T.step(raptor, s, {}, 0.1).state !== T.step(raptor, s, {}, 0.1).state && Object.isFrozen(T.step(raptor, s, {}, 0.1).state) === false);
  const src = fs.readFileSync(path.join(__dirname, '../shared/mm-tame.js'), 'utf8');
  check('no Math.random / Date / fetch in the module (randomness only via MMRng)', !/Math\.random|Date\.now|new Date|fetch\(|localStorage/.test(src));
}
{ // hostile input
  const s = mk(raptor);
  const evil = [null, undefined, NaN, 'x', [], {}, { torporHit: 'abc', dmg: {}, offer: 5 }, { torporHit: -50, dmg: -1, hits: -3 }, { torporHit: Infinity, dmg: NaN, playerDist: -Infinity }, JSON.parse('{"__proto__":{"torporHit":9999},"offer":"__proto__"}'), { offer: 'x'.repeat(1e5) }, { lethal: 'yes', hpFrac: 'low' }];
  let ok = true; const outs = [];
  evil.forEach((i) => { [0.1, NaN, -5, Infinity, 'x', null].forEach((dt) => { try { const r = T.step(raptor, s, i, dt); outs.push(r.state); if (!r.state || r.state.torpor > r.state.torporMax * 1.25 + 1e-6 || !isFinite(r.state.t)) ok = false; } catch (e) { ok = false; console.log(e.message); } }); });
  check('hostile step input never throws or breaks the state', ok && outs.every((o) => o.eff >= K.EFF_MIN && o.eff <= K.EFF_MAX && o.prog >= 0));
  check('a sleeper-only dt of NaN/negative does not advance the clock', T.step(raptor, s, {}, -5).state.t === 0 && T.step(raptor, s, {}, NaN).state.t === 0 && T.step(raptor, s, {}, 1e9).state.t === 120);
  const bad = [null, 5, 'x', [], {}, { id: 'nope', st: 'wild' }, { id: 'fernraptor', st: 'flying' }, { id: 'fernraptor', st: 'wild', eff: 'lots', torpor: Infinity }, JSON.parse('{"__proto__":{"st":"tamed"},"id":"fernraptor","st":"zzz"}'), { id: 'vinecoil', st: 'ko' }];
  check('clean() rejects corrupt saved states', bad.filter((b) => T.clean(b) === null).length === bad.length - 1 && T.clean(bad[7]) !== null);
  const rep = T.clean({ id: 'fernraptor', st: 'wild', eff: 'lots', torpor: Infinity, prog: -4, attempts: 99 });
  check('clean() fixes junk numbers to safe values', rep && rep.eff === 1 && rep.torpor === 0 && rep.prog === 0 && rep.attempts === K.MAX_ATTEMPTS);
  check('step on a corrupt state returns invalid and a null state', JSON.stringify(T.step(raptor, { id: 'x' }, {}, 0.1)) === '{"state":null,"events":["invalid"]}' && T.step(null, s, {}, 0.1).events[0] === 'invalid' && T.step('nope', s, {}, 0.1).state !== undefined);
  check('a state for another creature is rejected', T.step(hopper, s, {}, 0.1).events.join() === 'invalid');
  check('helpers survive junk', T.describe(null) === null && T.progressFrac('x') === 0 && T.torporFrac(undefined) === 0 && T.sleepLeft({}) === 0 && T.tameTime('nope') === null && T.simulate(null) === null && T.simulate('vinecoil') === null && T.prefMul(null, 'x') === 0);
  check('describe summarises a state', (() => { const d = T.describe(sleeper()); return d.asleep && !d.done && d.attemptsLeft === 3 && d.torpor === 1 && d.progress === 0; })());
}
{ // targets
  check('tameTime() returns the level-1 target and scales with level', T.tameTime(raptor) === raptor.tame.time && T.tameTime('fernraptor', 21) === Math.round(raptor.tame.time * 1.6 * 10) / 10 && T.tameTime(raptor, 9999) === Math.round(raptor.tame.time * T.levelMul(50) * 10) / 10);
  check('tameTime() is null for untameable creatures', C.list().filter((d) => !d.tame).every((d) => T.tameTime(d) === null));
  check('tameTime() grows with size: S < M < L < XL (feed/knockout means)', (() => {
    const mean = (sz) => { const a = C.list().filter((d) => d.tame && d.size === sz && d.tier !== 'boss'); return a.reduce((n, d) => n + d.tame.time, 0) / a.length; };
    return mean('S') < mean('M') && mean('M') < mean('L') && mean('L') < mean('XL');
  })());
  const bands = { S: [20, 45], M: [40, 90], L: [70, 150], XL: [110, 220] };
  const sims = C.list().filter((d) => d.tame).map((d) => T.simulate(d, { runs: 60, seed: 'tier-test' }));
  check('seeded sim: every tameable creature gets tamed in every run (rate 1, no deaths/escapes/timeouts)', sims.every((r) => r.rate === 1 && r.fails.dead + r.fails.escaped + r.fails.timeout === 0), JSON.stringify(sims.filter((r) => r.rate < 1)));
  check('seeded sim: median time to tame is inside the size band (S 20-45, M 40-90, L 70-150, XL 110-220)', sims.every((r) => { const d = C.get(r.id); if (d.tier === 'boss') return true; const [lo, hi] = bands[d.size]; return r.median >= lo && r.median <= hi; }), sims.filter((r) => { const d = C.get(r.id); if (d.tier === 'boss') return false; const [lo, hi] = bands[d.size]; return r.median < lo || r.median > hi; }).map((r) => r.id + ':' + r.median).join());
  check('seeded sim: boss tames take 100-260 s (about 2-4 minutes)', sims.filter((r) => C.get(r.id).tier === 'boss').every((r) => r.median >= 100 && r.median <= 260));
  check('seeded sim median is within 12% of each creature\'s tame.time target', sims.every((r) => Math.abs(r.median - C.get(r.id).tame.time) / C.get(r.id).tame.time <= 0.12), sims.filter((r) => Math.abs(r.median - C.get(r.id).tame.time) / C.get(r.id).tame.time > 0.12).map((r) => r.id + ':' + r.median + '/' + C.get(r.id).tame.time).join());
  check('per tier medians rise: passive/neutral S < M < L < XL', ['S', 'M', 'L', 'XL'].map((sz) => { const a = sims.filter((r) => C.get(r.id).size === sz && C.get(r.id).tier !== 'boss').map((r) => r.median); return a.reduce((x, y) => x + y, 0) / a.length; }).every((v, i, arr) => i === 0 || v > arr[i - 1]));
  const s1 = T.simulate('tusktop', { runs: 80, seed: 'det' }), s2 = T.simulate('tusktop', { runs: 80, seed: 'det' }), s3 = T.simulate('tusktop', { runs: 80, seed: 'other' });
  check('the sim is deterministic per seed and differs across seeds', JSON.stringify(s1) === JSON.stringify(s2) && (s1.median !== s3.median || s1.p90 !== s3.p90));
  const lv20 = T.simulate('tusktop', { runs: 60, seed: 'lv', level: 20 }), lv1 = T.simulate('tusktop', { runs: 60, seed: 'lv', level: 1 });
  check('higher wild level takes longer, close to the tameTime() target', lv20.median > lv1.median * 1.3 && Math.abs(lv20.median - T.tameTime('tusktop', 20)) / T.tameTime('tusktop', 20) < 0.25, lv20.median + ' vs ' + T.tameTime('tusktop', 20));
  check('a stronger hero tames knockout creatures faster', T.simulate('tusktop', { runs: 60, seed: 'd', dpsMin: 40, dpsMax: 60 }).median < T.simulate('tusktop', { runs: 60, seed: 'd', dpsMin: 8, dpsMax: 12 }).median);
  check('sim options are clamped and junk opts do not throw', (() => { const r = T.simulate('puffwool', { runs: 1e9, dt: -1, level: 'x', seed: {} }); return r.runs === 5000 && r.level === 1 && r.rate === 1; })());
}
{ // anti-grind
  check('daily reward falls off for repeat tames of one species (full, half, none)', T.rewardFactor(0) === 1 && T.rewardFactor(2) === 1 && T.rewardFactor(3) === 0.5 && T.rewardFactor(5) === 0.5 && T.rewardFactor(6) === 0 && T.rewardFactor(NaN) === 1 && T.rewardFactor(-4) === 1);
  check('a third duplicate of a species is refused and pays seeds', T.duplicateRule(0).allow && T.duplicateRule(1).allow && !T.duplicateRule(2).allow && T.duplicateRule(2).seeds === 3 && T.duplicateRule('x').allow);
  check('bonus levels = floor(level * bondPct / 200), junk-safe', T.bonusLevels(10, 100) === 5 && T.bonusLevels(10, 60) === 3 && T.bonusLevels(1, 100) === 0 && T.bonusLevels(NaN, NaN) === 0 && T.bonusLevels(1e9, 100) === 25);
  check('the API and constants are frozen', Object.isFrozen(T) && Object.isFrozen(T.K) && (() => { try { T.K.MAX_ATTEMPTS = 99; } catch (e) { /* ok */ } return T.K.MAX_ATTEMPTS === 3; })());
}
done();
