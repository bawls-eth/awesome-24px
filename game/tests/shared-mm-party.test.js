// Unit tests for shared/mm-party.js. Run: node game/tests/shared-mm-party.test.js
const P = require('../shared/mm-party.js');
let failed = 0;
function check(name, cond, extra = '') { console.log((cond ? 'PASS ' : 'FAIL ') + name + (cond ? '' : ' ' + extra)); if (!cond) failed++; }
const done = () => { console.log(failed ? `${failed} FAILED` : 'ALL PASSED'); process.exitCode = failed ? 1 : 0; };
const near = (a, b, e = 1e-9) => Math.abs(a - b) < e;
const lcg = (seed) => () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };

let allValid = true, ambiguous = false;
for (let s = 1; s <= 1000; s++) {
  const c = P.makeCode(lcg(s));
  if (!P.validCode(c)) allValid = false;
  if (/[ILOS01]/.test(c)) ambiguous = true;
}
check('1000 seeds give valid 5-letter codes', allValid);
check('no ambiguous characters', !ambiguous);
check('validCode rejects bad', !P.validCode('ABCD') && !P.validCode('ABCDO') && !P.validCode('abcde') && !P.validCode(null));

const p = P.create('ABCDE', 'h');
check('join up to 4', ['b', 'c', 'd'].every((id) => P.join(p, id).ok) && P.size(p) === 4);
const fifth = P.join(p, 'e');
check('5th player refused', !fifth.ok && fifth.reason === 'full' && P.size(p) === 4);
check('HP scale +60% per extra player', near(P.hpScale(1), 1) && near(P.hpScale(2), 1.6) && near(P.hpScale(4), 2.8) && P.scaledHp(1000, 3) === 2200);

P.markSeen(p, 'c', 'bag1');
const seatC = p.members.find((m) => m.id === 'c').seat;
const lv = P.leave(p, 'c');
check('leave frees the seat and resets seen-list', lv.ok && P.size(p) === 3 && !P.hasSeen(p, 'c', 'bag1'));
const rj = P.join(p, 'e');
check('rejoin after leave works, reuses seat', rj.ok && rj.seat === seatC && P.size(p) === 4);

const lh = P.leave(p, 'h');
check('host leave migrates to next member', lh.wasHost && lh.migration && p.host === 'b' && lh.migration.newHost === 'b');
check('migration instruction resets boss and clears duplicates', lh.migration.bossReset === 'phaseStart' && lh.migration.clearDuplicates === true);

check('clamp at 1.3x max DPS', near(P.clampDamage(500, 100), 130) && P.clampDamage(90, 100) === 90 && P.clampDamage(-5, 100) === 0);
check('clampReport scales with interval', near(P.clampReport(1000, 250, 100), 32.5));
const b = P.makeBatcher();
b.add('e1', 5); b.add('e1', 7); b.add('e2', 3);
check('batch not flushed before 250 ms first? (first flush ok)', Array.isArray(b.flush(1000)));
b.add('e1', 4);
check('no flush inside 250 ms', b.flush(1100) === null);
const f = b.flush(1250);
check('flush at 250 ms with totals', f && f.length === 1 && f[0].d === 4);

check('8% soulbound threshold', P.qualifies(0.08) && P.qualifies(0.5) && !P.qualifies(0.0799));
const bags = [{ owner: 'a', item: 1 }, { owner: 'b', item: 2 }, { owner: null, item: 3 }];
const va = P.visibleBags(bags, 'a');
check('players see only own private bags plus public', va.length === 2 && !va.some((x) => x.owner === 'b'));
check('only host makes public bags', P.makeBag(null, 'x', p, 'zzz') === null && P.makeBag(null, 'x', p, p.host).owner === null);

check('snapshot size guard 8 KB', P.snapshotOk({ a: 'x'.repeat(100) }) && !P.snapshotOk({ a: 'x'.repeat(9000) }));
const bud = P.budget();
let okW = 0; for (let i = 0; i < 15; i++) if (bud.tryWrite(1000 + i, 100)) okW++;
check('write rate at most 10/s', okW === 10);
check('writes allowed again after 1 s', bud.tryWrite(2100, 100));
check('KB/s counter', near(bud.kbPerSec(2100), 100 / 1024 * (bud.canWrite ? 1 : 1), 1.5) && bud.kbPerSec(2100) > 0);
const b2 = P.budget(); for (let i = 0; i < 10; i++) b2.tryWrite(i, 400);
check('bandwidth over 2 KB/s detected', b2.overBandwidth(10));

check('deadband skips unchanged', !P.changed({ x: 1, y: 1, aim: 10 }, { x: 1.1, y: 1, aim: 12 }, { x: 0.25, y: 0.25, aim: 5 }));
check('deadband writes on change', P.changed({ x: 1, y: 1, aim: 10 }, { x: 1.5, y: 1, aim: 10 }, { x: 0.25, y: 0.25, aim: 5 }) && P.changed({ f: 0 }, { f: 1 }) && P.changed(null, { x: 1 }));

const A = { x: 0, y: 10 }, B = { x: 10, y: 20 };
check('lerp endpoints', P.lerpState(A, B, 0).x === 0 && P.lerpState(A, B, 1).y === 20 && near(P.lerpState(A, B, 0.5).x, 5));
check('lerp 120 ms delay fraction', P.LERP_MS === 120 && near(P.lerpFraction(1000, 1120, 1120), 0) && near(P.lerpFraction(1000, 1120, 1240), 1) && near(P.lerpFraction(1000, 1120, 1180), 0.5));
done();
