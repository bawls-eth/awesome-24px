// Cycle 0 (D): the quest board names the recommended hero level. Measured: in a 365-day sweep 196 days (54%) hand out a kill quest
// in the Highlands or Godlands (rec Lv 10 / 15), and a Lv 10 bot hero in the Highlands lost 155 of 172 HP in 19 s, so a quest with
// no level hint sends a new hero somewhere it cannot survive (the goal line already hides out-of-reach quests, the board did not).
// Data only: quest ids, text, needs, rewards and seeds are unchanged; summary rows gain `rec` (additive) and MMQuests.levelHint(row).
// The board render is covered by a source check here and the live board by world-nexus.test.js.
// Run: node game/tests/cyc0-d-quest-level-hint.test.js
const fs = require('fs'), path = require('path');
const Q = require('../shared/mm-quests.js');
let n = 0, bad = 0;
const check = (name, ok, d) => { n++; if (!ok) { bad++; console.log('FAIL ' + name + (d ? ' :: ' + d : '')); } };
const REC = [1, 5, 10, 15];
let kill = true, boss = true, hint = true, shore = true, ex = '';
for (let d = 0; d < 365; d++) {
  const date = new Date(Date.UTC(2026, 0, 1 + d)).toISOString().slice(0, 10);
  const row = Q.summary(Q.fresh(date), date);
  if (row[0].rec !== REC[row[0].zone]) { kill = false; ex = JSON.stringify(row[0]); }
  if (row[1].rec !== 5) boss = false;
  const h = Q.levelHint(row[0]);
  if (row[0].zone >= 1 ? h !== 'Lv ' + REC[row[0].zone] + '+' : h !== '') hint = false;
  if (row[0].zone === 0 && Q.levelHint(row[0]) !== '') shore = false;
}
check('1. every kill quest row carries its zone recLv', kill, ex);
check('2. the boss quest row carries rec 5 (the Midlands, where altars wake)', boss);
check('3. levelHint is "Lv N+" above the Shore and empty on the Shore', hint && shore);
check('4. hostile input gives an empty hint', Q.levelHint(null) === '' && Q.levelHint({}) === '' && Q.levelHint({ rec: 'x' }) === '');
check('5. quest text unchanged (older tests and the goal line keep matching)', /^Defeat \d+ creatures in the (Shore|Midlands|Highlands|Godlands)$/.test(Q.quests('2026-11-24')[0].text) && Q.quests('2026-11-24')[1].text === 'Defeat a boss');
const src = fs.readFileSync(path.join(__dirname, '../games/mad-maze/realm-world.js'), 'utf8');
check('6. the Nexus board row appends the level hint', /MMQuests\.levelHint\(q\)/.test(src));
console.log(n - bad + '/' + n + ' passed'); process.exit(bad ? 1 : 0);
