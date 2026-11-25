// What run-all.js prints under a failed test's "FAIL <file>" line. tools/stamp.sh shows only the lines of a shard log that START
// with "summary" or "FAIL", so a test that died with an exception (no "FAIL <check>" line on stdout, the reason only on stderr) or
// was killed at its time budget used to show nothing at all in the stamp output (cycle 8: cyc6-lead-passive-landscape, "exit 1
// with no FAIL line"). Now the first line of stderr and a timeout each get their own line with a FAIL- prefix, which the same grep
// prints. r = { f, status (null = killed at the budget), stdout, stderr }.
const firstLine = (s) => { const l = String(s || '').split('\n').map((x) => x.trim()).find((x) => x.length > 0); return l ? l.slice(0, 300) : ''; };
function failDetail(r) {
  const out = String(r.stdout || '').split('\n').filter((l) => l.startsWith('FAIL'));
  if (r.status === null) out.push(`FAIL-TIMEOUT ${r.f}: killed at its time budget`);
  const first = firstLine(r.stderr);
  if (first) out.push(`FAIL-STDERR ${r.f}: ${first}`);
  else if (r.status !== null && !out.length) out.push(`FAIL-EXIT ${r.f}: exit code ${r.status}, no FAIL line and nothing on stderr`);
  return out.join('\n') + (first ? '\n' + String(r.stderr).slice(0, 400) : '');
}
module.exports = { failDetail, firstLine };
