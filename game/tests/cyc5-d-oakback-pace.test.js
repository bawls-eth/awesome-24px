// Cycle 5 D, b05-r3 (P2 balance): Oakback (Hearth Isle XL rare, feed tame) needs 14 golden apples at its level, but the home isle had 4
// golden-apple glints with a 300 s respawn: about 15 minutes of waiting. This simulates a competent player with the REAL data (MMIsleCraft
// glints, MMCreatures defs, MMTame state machine incl. its feed spacing and seeded jitter): walk to each ready glint (WALK s per pick),
// feed whenever the pace allows. Pure node, no page, no DB.
// Run: node game/tests/cyc5-d-oakback-pace.test.js
const C = require('../shared/mm-creatures.js');
const X = require('../shared/mm-isle-craft.js');
const T = require('../shared/mm-tame.js');
let failed = 0;
function check(name, cond, extra = '') { console.log((cond ? 'PASS ' : 'FAIL ') + name + (cond ? '' : ' ' + extra)); if (!cond) failed++; }

const WALK = 12; // s a player needs per glint (orchard walking), generous for a first visit
const rows = X.foodNodes('meadow').filter((r) => r.id === 'golden_apple');
// glint k of a row is ready at t=0, and again every `respawn` s after being picked; the player picks the earliest-ready glint next
function glints() { const g = []; rows.forEach((r) => { for (let i = 0; i < r.n; i++) g.push({ ready: 0, respawn: r.respawn }); }); return g; }
// seconds until the player has tamed every species in `list` (fed in order) using only golden apples; the pack holds what is picked
function simulate(list, level, seedTag) {
  const g = glints(); let t = 0, pack = 0, tamedAt = []; let lastFed = -999;
  for (const id of list) {
    const def = C.get(id); let s = T.init(def, { level, seed: 'cyc5|' + seedTag, wildId: id });
    // the creature is calm and the player stands next to it (the taming engine's befriend rules: calm range, no hits)
    let guard = 0;
    while (s.st !== 'tamed' && guard++ < 4000) {
      if (s.st === 'wild') { const r = T.step(def, s, { playerDist: 1 }, 0.1); s = r.state; }
      if (pack === 0) { // fetch the next glint that is ready soonest
        g.sort((a, b) => a.ready - b.ready); const k = g[0]; t = Math.max(t, k.ready) + WALK; k.ready = t + k.respawn; pack++;
        continue;
      }
      const wait = Math.max(0, lastFed + def.tame.feedEvery - t); t += wait;
      const r = T.step(def, s, { offer: 'golden_apple', playerDist: 1 }, wait + 0.1); s = r.state;
      if (r.events.indexOf('fed') >= 0) { pack--; lastFed = t; }
      t += 0.1;
    }
    tamedAt.push(Math.round(t));
  }
  return tamedAt;
}

const oak = C.get('oakback'), strider = C.get('meadow_strider');
const need = T.init(oak, { level: 5 }).need;
const supply0 = rows.reduce((s, r) => s + r.n, 0);
check('setup: Oakback is a golden-apple feed tame and the isle has golden-apple glints', !!oak && oak.tame.method === 'feed' && oak.diet[0] === 'golden_apple' && supply0 > 0, JSON.stringify(rows));
const alone = simulate(['oakback'], 5, 'a')[0];
console.log(`   Oakback needs ${need} apples (lv 5); ${supply0} glints, respawn ${rows.map((r) => r.respawn).join('/')} s -> tamed after ${alone} s (${(alone / 60).toFixed(1)} min)`);
check('Oakback alone is tamed within 6 minutes of play (was about 15)', alone <= 6 * 60, alone + ' s');
check('Oakback is still a real goal, not instant: at least 3 minutes (14 feeds at its pace cannot be hurried)', alone >= 3 * 60, alone + ' s');
const both = simulate(['meadow_strider', 'oakback'], 5, 'b');
console.log(`   Strider first then Oakback (both on golden apples): ${both.join(' s, ')} s`);
check('the Meadow Strider (shares the golden apples) is still tamed within 5 minutes', both[0] <= 5 * 60, both[0] + ' s');
check('Strider then Oakback, both on golden apples, within 12 minutes', both[1] <= 12 * 60, both[1] + ' s');
check('the apples stay the far-orchard reward (zones 2-3 only)', rows.every((r) => Array.isArray(r.zone) && r.zone.every((z) => z >= 2)));
check('the Strider also lists golden apples first, so both tames really share this supply (the simulation above counts both)', strider.diet[0] === 'golden_apple');
console.log(failed ? failed + ' FAILED' : 'ALL PASSED');
process.exit(failed ? 1 : 0);
