// ID-13 (cycle 2 D): the first boss kill in a zone has a bag tier floor (MMZones.TABLES.FIRST_KILL_BAG_FLOOR = pink, pink, purple, cyan).
// Node only. Without info.firstKill nothing changes (byte-identical bags over 4 zones x 400 seeds); with it, no first-kill boss bag is under the floor,
// a roll already at or over the floor is unchanged (the floor never lowers), non-boss rolls ignore the flag, and the share lifted matches the weights.
// Run: node game/tests/cyc2-first-kill-floor.test.js
const { check, done } = require('./helpers');
const Z = require('../shared/mm-zones.js');
const T = Z.TABLES; const F = T.FIRST_KILL_BAG_FLOOR;
check('1. the floor table is [1,1,2,3] (pink, pink, purple, cyan), one entry per zone', JSON.stringify(F) === '[1,1,2,3]');
let same = true, lowAfter = 0, exact = true, nonBossSame = true; const lowBefore = [0, 0, 0, 0];
const N = 400;
for (let z = 0; z < 4; z++) for (let i = 0; i < N; i++) {
  const seed = 'cyc2:' + z + ':' + i;
  const a = Z.rollDrop({ zone: z, boss: true }, seed).bag, b = Z.rollDrop({ zone: z, boss: true, firstKill: false }, seed).bag, c = Z.rollDrop({ zone: z, boss: true, firstKill: true }, seed).bag;
  if (JSON.stringify(a) !== JSON.stringify(b)) same = false;
  if (a.tierIndex < F[z]) lowBefore[z]++;
  if (c.tierIndex < F[z]) lowAfter++;
  if (c.tierIndex !== Math.max(a.tierIndex, F[z])) exact = false;
  const n1 = Z.rollDrop({ zone: z, boss: false }, seed).bag, n2 = Z.rollDrop({ zone: z, boss: false, firstKill: true }, seed).bag;
  if (JSON.stringify(n1) !== JSON.stringify(n2)) nonBossSame = false;
}
check('2. without firstKill (or firstKill false) every boss bag is byte-identical to before (1600 rolls)', same);
check('3. with firstKill no boss bag is under the floor and the tier is exactly max(roll, floor)', lowAfter === 0 && exact, 'under floor ' + lowAfter);
check('4. non-boss rolls ignore the flag', nonBossSame);
const exp = [0.30, 0.10, 0.10, 0.10];
check('5. the share of boss rolls the floor lifts matches the weights (30/10/10/10 percent, +-6 points over ' + N + ' seeds)', lowBefore.every((n, z) => Math.abs(n / N - exp[z]) < 0.06), JSON.stringify(lowBefore));
done();
