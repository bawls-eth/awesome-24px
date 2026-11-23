// Merges the --results files of N parallel run-all shards (+ the optional solo rerun) into game/design/ci-status.json.
//   node game/tests/lib/stamp-merge.js --sha <sha> --out game/design/ci-status.json --tier full --shards 4 --first shard-1.json,... [--rerun rerun.json]
// Format (unchanged, read by the merge manager): { sha, generated_utc, full_suite_green, beta_green, suites_passed, suites_total, notes }.
//   sha = the TESTED commit (the stamp commit itself only touches game/design/ci-status.json, so it is docs-only);
//   notes always name every test that passed ONLY on the solo rerun, and every test that is still red.
const fs = require('fs');
const argv = process.argv.slice(2);
const val = (k, d = null) => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : d; };
const read = (p) => JSON.parse(fs.readFileSync(p, 'utf8'));
const first = (val('--first') || '').split(',').filter(Boolean).map(read);
const rerunPath = val('--rerun');
const rerun = rerunPath && fs.existsSync(rerunPath) ? read(rerunPath) : null;
const out = val('--out'), sha = val('--sha'), tier = val('--tier', 'full'), shards = val('--shards', String(first.length));
if (!out || !sha || !first.length) { console.error('usage: stamp-merge.js --sha S --out FILE --first a.json,b.json [--rerun r.json] [--tier full|smoke] [--shards N]'); process.exit(2); }

const total = first.reduce((n, r) => n + (r.total || 0), 0);
const firstFailed = [].concat(...first.map((r) => r.failed || []));
const shardSolo = [].concat(...first.map((r) => r.solo || [])); // shards run without --rerun-failed, so normally empty
const firstPassCount = total - firstFailed.length - shardSolo.length;
const soloPassed = shardSolo.slice(), stillRed = [];
for (const f of firstFailed) {
  if (rerun && (rerun.passed || []).includes(f)) soloPassed.push(f); else stillRed.push(f);
}
const passed = total - stillRed.length;
let prev = {}; try { prev = read(out); } catch (e) { /* first stamp */ }
const green = stillRed.length === 0;
const sorted = (a) => a.slice().sort().join(', ');
let notes = `${tier === 'full' ? 'Full' : 'Smoke-tier'} run on this exact sha, run as ${shards} parallel shards (--shard i/${shards} --lock-live): ${firstPassCount}/${total} on the first pass.`;
if (soloPassed.length) notes += ` PASSED ONLY ON SOLO RERUN (failed in the parallel pass, passed alone on the same sha; load flakes unless they recur): ${sorted(soloPassed)}.`;
if (stillRed.length) notes += ` STILL RED after a solo rerun (real failures): ${sorted(stillRed)}.`;
if (!soloPassed.length && !stillRed.length) notes += ' Every suite passed on the first pass, no reruns.';
notes += ' Stamped by tools/stamp.sh; the stamp commit changes only game/design/ci-status.json. Beta runs only on owner request.';
const doc = {
  sha, generated_utc: new Date().toISOString().replace(/\.\d+Z$/, 'Z'),
  full_suite_green: tier === 'full' ? green : false, // a smoke-tier stamp must never claim the full suite
  beta_green: prev.beta_green === undefined ? null : prev.beta_green,
  suites_passed: passed, suites_total: total, notes,
};
fs.writeFileSync(out, JSON.stringify(doc, null, 2) + '\n');
console.log(JSON.stringify(doc, null, 2));
process.exit(green ? 0 : 1);
