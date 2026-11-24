// ID-14 telegraph audit (cycle 3 S), node only. Every telegraphed pattern's FIRST volley must give a wind-up of at least 0.4 s:
// the wind-up (MMTelegraph.windupFor) is drawn over the last `windup` seconds of the existing cooldown, so a volley warns for
// min(windup, first cooldown). Audited from the source of realm.js (the values the game runs; a refactor that moves them fails loudly):
//   world mobs (tier 3+ aimed / ring): first shot cooldown 0.8 + rng*0.8 (>= 0.8);
//   world bosses: spawn cd 1.2 / cd2 2.4 (cooldowns do not tick while invulnerable), phase change cd 1.1 / cd2 2.0;
//   phase 1 fan = cd2, phase 2 ring = cd and aimed triple = cd2, phase 3 ring = cd2 (see realm.js _tgBoss).
// Raised in cycle 3: WINDUP_T3 0.35 -> 0.4 (tier 3+ mobs). Not telegraphed by design (continuous streams, listed, not changed): the boss
// spirals (phase 1 cd 0.14, phase 3 cd 0.1); their first volley follows the 1.2 s / 1.0 s shielded awakening.
const fs = require('fs');
const path = require('path');
const TG = require('../shared/mm-telegraph.js');
const { check, done } = require('./helpers');
const src = fs.readFileSync(path.join(__dirname, '..', 'realm.js'), 'utf8');
const MIN = 0.4;

check('MMTelegraph: tier 3+ mobs wind up >= 0.4 s, bosses >= 0.4 s, tiers 0..2 none', TG.windupFor(3, false) >= MIN && TG.windupFor(4, false) >= MIN && TG.windupFor(0, true) >= MIN && TG.windupFor(2, false) === 0, JSON.stringify([TG.windupFor(3, false), TG.windupFor(0, true)]));
const mob = /e\.cd = ([\d.]+) \+ this\.rng\(\) \* ([\d.]+); \/\/ first shot is never instant/.exec(src);
check('source: a mob\'s first shot cooldown is found and its minimum >= the tier-3 wind-up', !!mob && Number(mob[1]) >= TG.windupFor(3, false), mob ? mob[0] : 'not found');
const spawn = /e\.phase = 1; e\.invuln = ([\d.]+); e\.cd = ([\d.]+); e\.cd2 = ([\d.]+);/.exec(src);
const phase = /_bossPhase\(e, phase\) \{\s*e\.phase = phase; e\.invuln = ([\d.]+); e\.cd = ([\d.]+); e\.cd2 = ([\d.]+);/.exec(src);
const ticksInvuln = /if \(e\.invuln > 0\) return; \/\/ a phase change makes it pause, shielded\s*e\.cd -= dt; e\.cd2 -= dt;/.test(src);
check('source: boss spawn / phase cooldowns found, and cooldowns do not tick while invulnerable', !!spawn && !!phase && ticksInvuln, JSON.stringify({ spawn: spawn && spawn.slice(1), phase: phase && phase.slice(1), ticksInvuln }));
if (spawn && phase) {
  const W = TG.windupFor(0, true);
  const rows = [
    ['phase 1 aimed fan (cd2 at spawn)', Number(spawn[3])],
    ['phase 2 ring (cd at phase change)', Number(phase[2])],
    ['phase 2 aimed triple (cd2 at phase change)', Number(phase[3])],
    ['phase 3 ring (cd2 at phase change)', Number(phase[3])]
  ].map(([n, cd]) => ({ n, warn: Math.min(W, cd) }));
  check('every boss pattern\'s first telegraphed volley warns for >= 0.4 s', rows.every((r) => r.warn >= MIN), JSON.stringify(rows));
}
check('the boss telegraph picks the patterns audited above (fan / ring / aimed)', /let cd = e\.cd2; let pat = 'fan';/.test(src) && /pat = 'ring'; \} else pat = 'aimed';/.test(src));
done();
