// Cycle 14 D: ID-64 (first-build choice at Lv 5) economy guard, pure node. game/tools/id64-build-sim.js reads the real constants out of
// realm.js / mm-unlocks.js (it throws when one drifts) and prints the numbers in design/beta/cycle14-design.md. Pins:
//  1 the sim runs and the Lv 5 trigger is where the note says (240 XP, about 45 kills, about 105 shards: one Uncommon of shop money);
//  2 the Dash options stay inside +-20 percent of the base Dash in both dodge currencies (safe seconds and distance per minute), at Lv 5-15 and at Lv 16+;
//  3 the quick option (B) never goes under the 2.4 s co-op guest floor, and the long option (A) is flagged as not matching the host (160 px reach);
//  4 payout delta is 0 (no option touches XP, shards or damage) and no sink is added.
// Run: node game/tests/cyc14-design-id64-economy.test.js
const { spawnSync } = require('child_process'); const path = require('path');
const { check, done } = require('./helpers');
const r = spawnSync(process.execPath, [path.join(__dirname, '..', 'tools', 'id64-build-sim.js')], { encoding: 'utf8' });
const out = r.stdout || '';
check('the ID-64 sim runs (exit 0, no drift errors)', r.status === 0 && out.length > 500, (r.stderr || '').split('\n')[0]);
check('Lv 5 needs 240 XP and about 45 kills', /XP to reach Lv 5: 240 .*about 45 kills/.test(out));
check('about 105 shards come in on the way to Lv 5', /about 105 shards/.test(out));
const rows = [...out.matchAll(/^\s+(A|B|Base) [^\n]*?cd ([\d.]+) s\s+invulnerable ([\d.]+) s\/min \(\s*(-?\d+)%[^\n]*distance (\d+) px\/min \(\s*(-?\d+)%\)/gm)];
check('both option rows are printed for both level bands (6 rows incl. base)', rows.length === 6, String(rows.length));
check('safe seconds and distance per minute stay within 20 percent of base for A and B', rows.filter((m) => m[1] !== 'Base').every((m) => Math.abs(+m[4]) <= 20 && Math.abs(+m[6]) <= 20), rows.map((m) => `${m[1]}:${m[4]}/${m[6]}`).join(' '));
const bLow = rows.filter((m) => m[1] === 'B')[0];
check('the quick option at Lv 5-15 keeps the cooldown at or above the 2.4 s co-op guest floor', bLow && +bLow[2] >= 2.4, bLow && bLow[2]);
check('the note keeps the co-op distance warning (host moves a guest 160 px)', /guest keeps 150/.test(out));
check('payout delta 0 and no sink', /payout delta 0/.test(out) && /no star\/shard sink is added/.test(out));
done();
