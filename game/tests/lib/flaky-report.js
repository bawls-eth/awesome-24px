// `run-all.js --list-flaky`: reads game/tests/.timings.json (per-file seconds from the last run, plus the "__runs" history run-all.js
// appends: pass / fail / solo counts and the last 12 durations per file) and prints three lists:
//   FLAKY  files that both passed and failed over the history, or passed only on a solo rerun (solo > 0)
//   SPREAD files whose slowest recent run took >= 2.5x the fastest (load-sensitive timing; candidates for load-scaled budgets)
//   SLOW   files whose last run took > 60 s
// Exit code is always 0: it is a report, not a gate.
const SLOW_S = 60, SPREAD = 2.5;
function print(timings, out = console.log) {
  const runs = (timings && timings.__runs) || {};
  const files = Object.keys(runs);
  const flaky = files.filter((f) => runs[f].fail > 0 && runs[f].pass + runs[f].solo > 0 || runs[f].solo > 0)
    .sort((a, b) => (runs[b].fail + runs[b].solo) - (runs[a].fail + runs[a].solo));
  out(`FLAKY (${flaky.length}): failed in some runs and passed in others, or passed only on solo rerun`);
  for (const f of flaky) out(`  ${f}  pass ${runs[f].pass}  fail ${runs[f].fail}  solo-pass ${runs[f].solo}`);
  const spread = files.filter((f) => (runs[f].secs || []).length >= 3 && Math.max(...runs[f].secs) >= SPREAD * Math.max(0.5, Math.min(...runs[f].secs)))
    .sort((a, b) => Math.max(...runs[b].secs) - Math.max(...runs[a].secs));
  out(`SPREAD (${spread.length}): slowest run >= ${SPREAD}x the fastest (load-sensitive)`);
  for (const f of spread) out(`  ${f}  min ${Math.min(...runs[f].secs)} s  max ${Math.max(...runs[f].secs)} s`);
  const slow = Object.keys(timings || {}).filter((f) => f !== '__runs' && timings[f] > SLOW_S).sort((a, b) => timings[b] - timings[a]);
  out(`SLOW (${slow.length}): last run > ${SLOW_S} s`);
  for (const f of slow) out(`  ${f}  ${timings[f]} s`);
  if (!files.length) out('(no run history yet: it builds up as run-all.js runs; --rerun-failed and the stamp helper feed the solo counts)');
  return 0;
}
module.exports = { print, SLOW_S, SPREAD };
