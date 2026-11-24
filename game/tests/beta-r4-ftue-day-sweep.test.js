// Round 4 (D1): first-ten-minutes world-shore-f measured maxRewardGap 62.5 s (gate 45) on 2026-11-24 and 25 / 11 s a day or two
// earlier: the first ten minutes depended on the calendar day. This sweep runs the REAL first-ten-minutes bot for world-shore-f
// (and world-shore-a as a control) on 14 consecutive days (FT_DAY=-7..6: the page's Date.now and new Date() live that many days from
// today) and asserts every day keeps maxRewardGap <= 45 s with the gate itself unchanged. Offline: first-ten-minutes uses blockDb
// and stubs the town; nothing here touches the network.
// Run: BASE=http://localhost:8440/game/index.html NODE_PATH=$(npm root -g) node game/tests/beta-r4-ftue-day-sweep.test.js
const { spawnSync } = require('child_process');
const path = require('path');
const { check, done } = require('./helpers');
const FX = require('./fixtures/ftue-profiles.json');
const LIMIT = FX.targets.world.maxRewardGap;
const DAYS = []; for (let d = -7; d <= 6; d++) DAYS.push(d);
const PROFILES = (process.env.SWEEP_PROFILES || 'world-shore-f').split(',');

for (const prof of PROFILES) {
  const gaps = [];
  for (const day of DAYS) {
    const r = spawnSync(process.execPath, [path.join(__dirname, 'first-ten-minutes.test.js')], { env: Object.assign({}, process.env, { FT_ONLY: prof, FT_DAY: String(day) }), encoding: 'utf8', timeout: 600000 });
    const out = (r.stdout || '') + (r.stderr || '');
    const m = new RegExp('INFO ' + prof + ': \\{.*?"maxGap":([0-9.]+),"gapAt":([0-9.]+)').exec(out);
    const gap = m ? Math.round(Number(m[1]) * 10) / 10 : null;
    gaps.push([day, gap]);
    check(`${prof} day ${day >= 0 ? '+' : ''}${day}: the bot ran (a report was printed)`, gap !== null, out.slice(-400));
    check(`${prof} day ${day >= 0 ? '+' : ''}${day}: maxRewardGap <= ${LIMIT} s`, gap !== null && gap <= LIMIT, 'measured ' + gap + (m ? ' at ' + m[2] + ' s' : ''));
  }
  console.log('INFO ' + prof + ' maxRewardGap by day offset: ' + JSON.stringify(gaps));
}
done();
