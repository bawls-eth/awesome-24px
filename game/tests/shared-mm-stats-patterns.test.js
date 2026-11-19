// Pure Node tests (no browser): node game/tests/shared-mm-stats-patterns.test.js
const S = require('../shared/mm-stats.js');
const P = require('../shared/mm-patterns.js');
let failed = 0;
function check(name, cond, extra = '') { console.log((cond ? 'PASS ' : 'FAIL ') + name + (cond ? '' : ' ' + extra)); if (!cond) failed++; }
const done = () => { console.log(failed ? `${failed} FAILED` : 'ALL PASSED'); process.exitCode = failed ? 1 : 0; };
const near = (a, b, e = 1e-9) => Math.abs(a - b) < e;
const ang = (b) => Math.atan2(b.vy, b.vx);
const norm = (a) => { while (a > Math.PI) a -= 2 * Math.PI; while (a < -Math.PI) a += 2 * Math.PI; return a; };
const deg = (r) => r * 180 / Math.PI;

check('SWF 0 = 4.0 tps', near(S.tilesPerSec(0), 4));
check('SWF 10 = 4.6 tps', near(S.tilesPerSec(10), 4.6));
check('SWF 50 = 7.0 tps = 168 px/s', near(S.tilesPerSec(50), 7) && near(S.pxPerSec(50), 168));
check('SWF over cap is clamped', near(S.tilesPerSec(999), 7));
check('KNK 10 = 3.2 shots/s', near(S.shotsPerSec(10), 3.2));
check('KNK 50 = 8 shots/s, rateMult scales', near(S.shotsPerSec(50), 8) && near(S.shotsPerSec(0, 1.5), 3));
check('POW 10 = 0.75x, POW 50 = 1.75x', near(S.dmgMult(10), 0.75) && near(S.dmgMult(50), 1.75));
check('Slingbow sanity: 16 dmg POW 10 KNK 10 = 38.4 DPS', near(S.damage(16, 10) * S.shotsPerSec(10), 38.4));
check('10 dmg vs GRD 4 = 6', S.damageTaken(10, 4) === 6);
check('25% floor: 10 dmg vs GRD 50 = 3', S.damageTaken(10, 50) === 3);
check('piercing ignores guard', S.damageTaken(10, 50, true) === 10);
const leg = S.fromLegacy({ level: 3, items: [{ n: 1, id: 'sparkwand', r: 2 }, { n: 2, id: 'heartcharm', r: 0 }, { n: 3, id: 'wardring', r: 1 }], eq: { weapon: 1, charm: 2, ring: 3 } });
check('fromLegacy maps weapon to POW (0.5*2.4*4=4.8)', near(leg.POW, 4.8) && leg.level === 3);
check('fromLegacy passes hp and iframes through', leg.hpBonus === 12 && near(leg.iframes, 0.16));
check('fromLegacy tolerates junk', S.fromLegacy(null).level === 1 && S.fromLegacy({ items: 5, eq: 7 }).POW === 0);

const r = P.ring(12, { x: 5, y: 6 }, 5, 0);
check('ring of 12 bullets', r.length === 12);
check('ring spaced 30 degrees', near(deg(norm(ang(r[1]) - ang(r[0]))), 30, 1e-6) && near(deg(norm(ang(r[7]) - ang(r[6]))), 30, 1e-6));
check('ring speed and origin', near(Math.hypot(r[3].vx, r[3].vy), 5) && r[3].x === 5 && r[3].y === 6 && r[3].life > 0);
check('ring offset rotates', near(ang(P.ring(12, { x: 0, y: 0 }, 1, 0.5)[0]), 0.5));
const target = { x: 10, y: 7 }, o = { x: 2, y: 1 };
const want = Math.atan2(6, 8);
const one = P.aimed(o, target, 0.3, 1);
check('aimed single within 0.5 deg of target', Math.abs(deg(norm(ang(one[0]) - want))) < 0.5);
const fan = P.aimed(o, target, 18 * Math.PI / 180, 3);
check('aimed fan centred on target, edges 18 deg apart', fan.length === 3 && Math.abs(deg(norm(ang(fan[1]) - want))) < 0.5 && near(Math.abs(deg(norm(ang(fan[2]) - ang(fan[0])))), 18, 1e-6));
let t = 7; const rng = () => { t = (t * 16807) % 2147483647; return t / 2147483647; };
const jit = P.aimed(o, target, 0, 20, { jitter: 0.004 }, rng);
check('aimed with seeded jitter stays within 0.5 deg', jit.every((b) => Math.abs(deg(norm(ang(b) - want))) < 0.5));
const step = 11 * Math.PI / 180;
const v0 = P.spiral(step, 3), v1 = P.spiral(step, 3, { volley: 1 }), v2 = P.spiral(step, 3, { volley: 2 });
check('spiral has 3 arms 120 deg apart', v0.length === 3 && near(deg(norm(ang(v0[1]) - ang(v0[0]))), 120, 1e-6));
check('spiral advances by its step each volley', near(norm(ang(v1[0]) - ang(v0[0])), step) && near(norm(ang(v2[0]) - ang(v1[0])), step));
done();
