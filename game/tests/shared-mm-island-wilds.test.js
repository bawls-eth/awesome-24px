// Node require-based test (no browser): MMIsland + MMWilds.
const MMIsland = require('../shared/mm-island.js');
const MMWilds = require('../shared/mm-wilds.js');
let fails = 0, n = 0;
function check(name, ok, detail) { n++; if (!ok) fails++; console.log((ok ? 'PASS ' : 'FAIL ') + name + (ok ? '' : ' :: ' + (detail || ''))); }
function done() { console.log(n + ' checks, ' + fails + ' failed'); process.exit(fails ? 1 : 0); }

const a = MMIsland.generate(42), b = MMIsland.generate(42), c = MMIsland.generate(43);
check('island: size 192', a.size === 192 && a.biome.length === 192 * 192);
check('island: deterministic per seed', Buffer.compare(Buffer.from(a.biome), Buffer.from(b.biome)) === 0 && a.spawn.tx === b.spawn.tx && a.spawn.ty === b.spawn.ty);
check('island: different seed differs', a.spawn.tx !== c.spawn.tx || a.spawn.ty !== c.spawn.ty || Buffer.compare(Buffer.from(a.biome), Buffer.from(c.biome)) !== 0);
check('island: validate passes', MMIsland.validate(a).length === 0, MMIsland.validate(a).join());
let allShore = true;
for (let s = 1; s <= 30; s++) { const i = MMIsland.generate('s' + s); if (MMIsland.bandAtIsland(i, i.spawn.tx, i.spawn.ty) !== 0 || !MMIsland.isLand(i, i.spawn.tx, i.spawn.ty)) allShore = false; }
check('island: spawn on the shore band for 30 seeds', allShore);
let bandOk = true;
for (let k = 0; k < 2000; k++) { const x = (k * 37) % 192, y = (k * 91) % 192; const f = MMIsland.radialFrac(x, y); const e = f >= 1 ? -1 : f >= 0.85 ? 0 : f >= 0.65 ? 1 : f >= 0.45 ? 2 : f >= 0.25 ? 3 : 4; if (MMIsland.bandAtIsland(a, x, y) !== e) bandOk = false; }
check('island: band matches distance fraction', bandOk);
check('island: centre is the Maze Heart, spawn is shore', MMIsland.bandAtIsland(a, 96, 96) === 4 && MMIsland.bandAtIsland(a, a.spawn.tx, a.spawn.ty) === 0);
check('island: validate rejects a broken island', MMIsland.validate({ size: 10 }).length > 0 && MMIsland.validate(Object.assign({}, a, { spawn: { tx: 96, ty: 96 } })).length > 0);

// Wilds
const cam = { x: 80, y: 85, w: 32, h: 22 };
let minD = 99, maxD = 0, groups = 0, elites = 0, spawnOk = true;
for (let i = 0; i < 10000; i++) {
  const p = MMWilds.plan('p' + i, a, cam, []);
  if (!p.group) continue;
  groups++; if (p.group.elite) elites++;
  if (p.spawns.length < 3 || p.spawns.length > 6) spawnOk = false;
  for (const s of p.spawns) { const d = MMWilds.offCamera(cam, s.x, s.y); minD = Math.min(minD, d); maxD = Math.max(maxD, d); if (!MMIsland.isLand(a, s.x, s.y)) spawnOk = false; }
}
check('wilds: spawns 8-20 tiles off camera over 10k plans', minD >= 8 && maxD <= 20, minD + '..' + maxD);
check('wilds: nearly every plan yields a group', groups > 9000, groups);
check('wilds: groups are 3-6 on land', spawnOk);
const rate = elites / groups;
check('wilds: elite rate 8% +-3%', Math.abs(rate - 0.08) <= 0.03, rate);
const live = Array.from({ length: 58 }, () => ({ x: 0, y: 0 }));
const capped = MMWilds.plan('x', a, cam, live);
check('wilds: <=60 live enforced', live.length + capped.spawns.length <= 60 && MMWilds.plan('x', a, cam, new Array(60).fill({})).spawns.length === 0);
const p1 = MMWilds.plan('same', a, cam, []), p2 = MMWilds.plan('same', a, cam, []);
check('wilds: plan deterministic per seed', JSON.stringify(p1.spawns) === JSON.stringify(p2.spawns));
let bandKinds = true;
for (let i = 0; i < 500; i++) { const p = MMWilds.plan('k' + i, a, { x: 10, y: 80, w: 20, h: 20 }, []); for (const s of p.spawns) if (!MMWilds.SETS[s.band].includes(s.kind)) bandKinds = false; }
check('wilds: group composition follows the band set', bandKinds);

// quest arrow
const player = { x: 10, y: 10, zone: 'wilds' };
const e1 = { x: 20, y: 10, hp: 500, elite: true, tier: 1 }, e2 = { x: 10, y: 30, hp: 300, elite: true, tier: 1 };
let t = MMWilds.pickTarget([e2, e1], 1);
const ar = MMWilds.questArrow(player, t);
check('arrow: points at the target with distance', t === e1 && !ar.hidden && Math.abs(ar.angle) < 1e-9 && Math.abs(ar.dist - 10) < 1e-9);
e1.dead = true;
t = MMWilds.pickTarget([e2, e1], 1);
const ar2 = MMWilds.questArrow(player, t);
check('arrow: updates when the target dies', t === e2 && Math.abs(ar2.angle - Math.PI / 2) < 1e-9 && ar2.dist === 20);
check('arrow: hidden for a dead target', MMWilds.questArrow(player, e1).hidden === true);
check('arrow: hidden in the Lantern', MMWilds.questArrow({ x: 10, y: 10, zone: 'lantern' }, e2).hidden === true);
check('arrow: tier gate (level 1 skips tier 3 elite)', MMWilds.pickTarget([{ x: 1, y: 1, hp: 9, elite: true, tier: 3 }], 1) === null);
done();
