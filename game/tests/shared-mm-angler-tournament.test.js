// Unit tests for shared/mm-angler-depth.js (tournament, economy, aquarium) and the additive save keys.
// Run: node game/tests/shared-mm-angler-tournament.test.js
const A = require('../shared/mm-angler.js');
const D = require('../shared/mm-angler-depth.js');
let failed = 0;
function check(name, cond, extra = '') { console.log((cond ? 'PASS ' : 'FAIL ') + name + (cond ? '' : ' ' + extra)); if (!cond) failed++; }
const done = () => { console.log(failed ? `${failed} FAILED` : 'ALL PASSED'); process.exitCode = failed ? 1 : 0; };
const T = D.tournament, E = D.economy, Q = D.aquarium;

// ---- tournament ----
check('same day -> identical tournament', JSON.stringify(T.forDay(20000)) === JSON.stringify(T.forDay(20000)));
check('days vary (at least 3 distinct targets in 30 days)', new Set(Array.from({ length: 30 }, (_, i) => T.forDay(i).target)).size >= 3);
check('target is always in the spot pool for any day', Array.from({ length: 400 }, (_, i) => T.forDay(i)).every((t) => A.pool(t.spot, { month: 6, hour: 12, weather: 'clear' }).some((f) => f.id === t.target) && ['west', 'east', 'river', 'pier'].includes(t.spot)));
check('castFor deterministic and in-pool', Array.from({ length: 50 }, (_, d) => [0, 1, 2, 3, 4].every((n) => {
  const a = T.castFor(d, n), b = T.castFor(d, n), t = T.forDay(d);
  return JSON.stringify(a) === JSON.stringify(b) && A.BY_ID[a.fish].spots.includes(t.spot) && !A.BY_ID[a.fish].boss;
})).every(Boolean));
check('target appears more often than chance', (() => { let hit = 0; for (let d = 0; d < 300; d++) for (let n = 0; n < 5; n++) if (T.castFor(d, n).fish === T.forDay(d).target) hit++; return hit > 300 * 5 / 12; })());
check('dayNumber from a calendar date', D.dayNumber(1970, 1, 2) === 1 && D.dayNumber(2026, 11, 21) === Math.floor(Date.UTC(2026, 10, 21) / 864e5));
check('clampDay: integers only, clamped', D.clampDay('12.9', 5) === 12 && D.clampDay('-4', 5) === 0 && D.clampDay('1e9', 5) === D.DAY_MAX && D.clampDay('abc', 5) === 5 && D.clampDay(null, 5) === 0 || D.clampDay(null, 5) === 5);
check('score = size x rarity, target doubles', (() => { const t = T.forDay(7), f = A.BY_ID[t.target]; const other = A.FISH.find((x) => !x.boss && x.id !== t.target && x.rarity === 3); return T.scoreCatch(t.target, 10, 7) === 10 * f.rarity * 2 && T.scoreCatch(other.id, 10, 7) === 30; })());
check('rank thresholds', T.rankOf(0) === 'none' && T.rankOf(119) === 'none' && T.rankOf(120) === 'bronze' && T.rankOf(300) === 'silver' && T.rankOf(549) === 'silver' && T.rankOf(550) === 'gold');

function playDay(j, day, pts) {
  let r = T.start(j, day); j = r.journal;
  for (let i = 0; i < D.CASTS; i++) { const k = T.takeCast(j, day); j = T.addScore(k.journal, pts[i] || 0); }
  return T.finish(j, day);
}
{
  let r = playDay(A.journal.cleanFull(null), 100, [100, 100, 100, 100, 100]);
  check('5 casts end the run with rank and streak 1', r.result && r.result.score === 500 && r.result.rank === 'silver' && r.result.streak === 1 && r.journal.tour.run === null);
  check('rank earns a cosmetic badge', r.journal.badges.silver === true && r.result.badges.includes('silver'));
  check('cannot start the same day twice', T.start(r.journal, 100).ok === false);
  const r2 = playDay(r.journal, 101, [600, 0, 0, 0, 0]);
  check('next day continues the streak, gold badge', r2.result.streak === 2 && r2.result.rank === 'gold' && r2.journal.badges.gold === true && r2.journal.tour.best.score === 600);
  const r3 = playDay(r2.journal, 105, [0, 0, 0, 0, 0]);
  check('missing days resets streak to 1; no medal for 0 points', r3.result.streak === 1 && r3.result.rank === 'none' && r3.journal.tour.played === 3);
  check('liveStreak display drops after a gap', T.liveStreak(r2.journal, 101) === 2 && T.liveStreak(r2.journal, 102) === 2 && T.liveStreak(r2.journal, 103) === 0);
  let j = r2.journal, s = 0;
  for (let d = 102; d < 110; d++) { const x = playDay(j, d, [10]); j = x.journal; s = x.result.streak; }
  check('streak badges at 3 and 7', j.badges.streak3 === true && j.badges.streak7 === true && s === 10);
  check('takeCast refuses a 6th cast and a wrong day', (() => { let q = T.start(A.journal.cleanFull(null), 9).journal; for (let i = 0; i < 5; i++) q = T.takeCast(q, 9).journal; return T.takeCast(q, 9).n === -1 && T.takeCast(q, 8).n === -1; })());
  check('finish does nothing before 5 casts', T.finish(T.takeCast(T.start(A.journal.cleanFull(null), 4).journal, 4).journal, 4).result === null);
}

// ---- economy ----
check('baitDrop is deterministic and never for bosses', E.baitDrop('koi', 40, 5) === E.baitDrop('koi', 40, 5) && E.baitDrop('old_whiskers', 130, 1) === null);
check('drop rate grows with rarity', (() => { const n = (id) => { let k = 0; for (let i = 0; i < 2000; i++) if (E.baitDrop(id, 5 + (i % 30), i)) k++; return k; }; return n('minnow') < n('koi') && n('koi') < n('octopus') && n('octopus') < n('shark'); })());
check('drops by tier: commons give plain, shark can give rare/big', (() => { const seen = new Set(); for (let i = 0; i < 400; i++) seen.add(E.baitDrop('shark', 60 + i % 70, i)); const c = new Set(); for (let i = 0; i < 400; i++) c.add(E.baitDrop('minnow', 4 + i % 5, i)); return seen.has('rare') && seen.has('big') && [...c].every((v) => v === null || v === 'plain'); })());
{
  let j = A.journal.cleanFull(null);
  for (let i = 0; i < 3; i++) j = E.addStock(j, 'koi');
  j = E.addStock(j, 'old_whiskers');
  check('stock tracks fish but not bosses', j.stock.koi === 3 && !j.stock.old_whiskers);
  const s = E.sell(j, 'koi', 2);
  check('sell uses fixed rarity price', s.ok && s.gained === 2 * D.SELL[2] && s.journal.bells === 30 && s.journal.stock.koi === 1);
  const s2 = E.sell(s.journal, 'koi', 99);
  check('sell all empties the stock entry', s2.journal.stock.koi === undefined && s2.journal.bells === 45);
  check('cannot sell what you do not have', E.sell(s2.journal, 'koi', 1).ok === false && E.sell(s2.journal, 'old_whiskers', 1).ok === false);
  const b = E.buy(s2.journal, 'quick', 5);
  check('buy limited by bells', b.ok && b.bought === 2 && b.journal.bells === 45 - 36 && b.journal.baits.quick === 2);
  check('cannot buy without bells', E.buy(b.journal, 'big', 1).ok === false && E.buy(b.journal, 'nope', 1).ok === false);
  let h = A.journal.cleanFull({ bells: 99999, bait: 99, baits: { rare: 99 } });
  check('hard caps: bait 99, bells 99999', E.buy(h, 'rare', 1).reason === 'cap' && E.buy(h, 'plain', 1).ok === false && E.addBait(h, 'plain').ok === false && A.clean({ bells: 1e12, bait: 500, baits: { big: 1e9 }, stock: { koi: 1e6 } }).bells === 99999);
  h = A.journal.cleanFull({ bells: 99990, stock: { koi: 5 } });
  check('selling stops at the bell cap without losing fish', (() => { const r = E.sell(h, 'koi', 5); return r.ok === false && r.journal.bells === 99990 && r.journal.stock.koi === 5; })());
  h = A.journal.cleanFull({ bells: 99960, stock: { koi: 5 } });
  check('partial sale up to the cap', (() => { const r = E.sell(h, 'koi', 5); return r.ok && r.sold === 2 && r.journal.bells === 99990 && r.journal.stock.koi === 3; })());
  let u = A.journal.cleanFull({ baits: { quick: 1 }, baitType: 'quick', bait: 2 });
  const u1 = E.useBait(u), u2 = E.useBait(u1.journal);
  check('useBait spends the equipped type then runs dry', u1.type === 'quick' && u1.journal.baits.quick === 0 && u2.type === null && u1.journal.bait === 2);
  check('setBaitType validates', E.setBaitType(u, 'big').baitType === 'big' && E.setBaitType(u, '<x>').baitType === 'quick');
}
// bait effects
{
  const ctx = { month: 7, hour: 12, weather: 'clear' };
  const sum = (g) => A.pool('pier', ctx).filter((f) => f.rarity >= 3).reduce((a, f) => a + A.weightOf(f, ctx, g), 0);
  check('rare bait raises rare+ weights', sum({ baitType: 'rare' }) > sum({}) * 2);
  check('quick bait waits less than plain', A.BAITS.quick.waitMult < A.BAITS.plain.waitMult && A.BAITS.plain.waitMult < 1);
  const koi = A.BY_ID.koi;
  check('big bait skews size upward', A.rollSize(() => 0.5, koi, { big: true }) > A.rollSize(() => 0.5, koi) && A.rollSize(() => 0, koi, { big: true }) === koi.size[0] && A.rollSize(() => 0.9999, koi, { big: true }) <= koi.size[1]);
}

// ---- aquarium ----
{
  const west = A.FISH.filter((f) => f.spots.includes('west') && !f.boss && !f.secret);
  let j = A.journal.cleanFull(null);
  west.slice(0, -1).forEach((f) => { j = A.journal.cleanFull(A.journal.record(j, f.id, 20)); });
  check('set incomplete is not claimable', Q.spotSet(j, 'west').complete === false && Q.claimSet(j, 'west').ok === false);
  j = A.journal.cleanFull(A.journal.record(j, west[west.length - 1].id, 20));
  const c = Q.claimSet(j, 'west');
  check('complete set pays once', Q.spotSet(j, 'west').complete && c.ok && c.journal.bells === D.SET_BONUS && c.journal.badges.set_west === true && Q.claimSet(c.journal, 'west').ok === false);
  check('set status survives clean', A.journal.cleanFull(A.serialize(c.journal)).sets.west === true);
  check('claim rejects unknown spot', Q.claimSet(j, 'moon').ok === false);
  let h = A.journal.cleanFull(null); h = A.journal.cleanFull(A.journal.record(h, 'pier_kraken', 250)); h = A.journal.cleanFull(A.journal.addTrophy(h, 'pier_kraken'));
  const hall = Q.hallOfRecords(h);
  check('hall lists the 3 bosses with records', hall.length === 3 && hall.find((b) => b.id === 'pier_kraken').best === 250 && hall.find((b) => b.id === 'pier_kraken').trophy && !hall.find((b) => b.id === 'old_whiskers').caught);
  check('tank entries only list caught species', Q.tankEntries(h).length === 1);
}

// ---- save format ----
check('plain save stays in the old key set (additive keys only when used)', Object.keys(A.clean(null)).sort().join() === 'bait,bosses,caught,gear,trophies');
check('cleanFull always has every key', ['bells', 'stock', 'baits', 'baitType', 'sets', 'badges', 'tour'].every((k) => k in A.journal.cleanFull(null)));
check('old v1 save loads unchanged', (() => { const old = { caught: { koi: { n: 2, best: 40 } }, bosses: {}, trophies: {}, gear: { rod: 'stick', lure: 'none' }, bait: 3 }; const c = A.journal.cleanFull(old); return c.caught.koi.best === 40 && c.bait === 3 && c.bells === 0 && c.tour.streak === 0; })());
check('depth keys round-trip', (() => { const j = A.journal.cleanFull({ bells: 50, stock: { koi: 2 }, baits: { big: 3 }, baitType: 'big', badges: { gold: true }, tour: { last: 5, streak: 2, played: 3 } }); const b = A.journal.cleanFull(A.serialize(j)); return JSON.stringify(b) === JSON.stringify(j) && b.tour.streak === 2 && A.clean(j).bells === 50; })());
check('corrupt depth keys fall to defaults', [
  { bells: 'x', stock: 5, baits: [1], baitType: 'evil', sets: 'a', badges: { '<b>': true, ok: 1 }, tour: 'z' },
  { bells: -5, stock: { nope: 3, bluegill: -1, old_whiskers: 4 }, baits: { quick: -3, hack: 9 }, tour: { last: 'a', streak: -4, run: { day: 'q' }, best: 7, medals: 3 } },
  null, 'not json{',
].every((raw) => { const c = A.journal.cleanFull(raw); return c.bells === 0 && Object.keys(c.stock).length === 0 && c.baits.quick === 0 && c.baitType === 'plain' && Object.keys(c.sets).length === 0 && Object.keys(c.badges).length === 0 && c.tour.streak === 0 && c.tour.run === null && c.tour.last === -1; }));
check('tour run values are clamped', (() => { const c = A.journal.cleanFull({ tour: { run: { day: 5, used: 99, score: 1e9 } } }); return c.tour.run.used === 5 && c.tour.run.score === 99999; })());
check('no Math.random in the depth module', !/Math\.random/.test(require('fs').readFileSync(require('path').join(__dirname, '../shared/mm-angler-depth.js'), 'utf8')));
done();
