// Runs every game/tests/*.test.js against a throwaway static server.
//   NODE_PATH=$(npm root -g) node game/tests/run-all.js
// Default = every test, serially, sorted by name. Optional selection flags (see test-tiers.json):
//   --tier smoke|full      smoke = the small ~6 minute set, full (default) = everything
//   --only node|browser|live   class filter. node = pure require() tests; browser = standalone pages
//                          (never joins the town); live = joins the live town as an ADMIN* bot
//   --shard i/n            deterministic cost-balanced split of the selected files (i in 1..n)
//   --list                 print the selected files and exit 0 without running anything
//   --jobs N               run node-class tests N at a time (browser/live always serial)
//   --lock-live            wrap each live-class test in `flock /tmp/live.lock` (when flock exists)
//   --balance              shard by measured cost from game/tests/.timings.json instead of the static estimate
//   --port N               fixed server port (default: a free port; with PORT=N and --shard i/n the port is N+i-1 so shards never share a server)
//   --files a.test.js,b    run exactly these files (after the tier/only filters are ignored); used by tools/stamp.sh for solo reruns
//   --results FILE         write {passed, failed, secs, solo} JSON for tools/stamp.sh to merge
//   --rerun-failed         after the pass, rerun each failed file ALONE once (serially, nothing else running); a solo pass counts as
//                          a pass but is flagged "passed only on solo rerun" in the summary and in --results (never hidden)
//   --list-flaky           print flaky / slow tests from game/tests/.timings.json (history under the "__runs" key) and exit
//   (--lock-live: the lock file is $LIVE_LOCK or /tmp/live.lock)
// Per-file timings are written to game/tests/.timings.json (gitignored).
// Needs Playwright (require('playwright')) and network access to the live
// town (bots join as ADMIN* — presence only; they never chat or write anything
// else to Firebase).
const { spawn, spawnSync } = require('child_process');
const http = require('http');
const net = require('net');
const fs = require('fs');
const path = require('path');
const root = path.resolve(__dirname, '..', '..');

function freePort() {
  return new Promise((resolve, reject) => {
    const s = net.createServer();
    s.listen(0, () => { const { port } = s.address(); s.close(() => resolve(port)); });
    s.on('error', reject);
  });
}
function portFree(p) {
  return new Promise((resolve) => { const s = net.createServer(); s.once('error', () => resolve(false)); s.listen(p, () => s.close(() => resolve(true))); });
}
function waitUp(url, tries = 40) {
  return new Promise((resolve, reject) => {
    const attempt = (n) => http.get(url, (r) => { r.resume(); resolve(); }).on('error', () => (n <= 0 ? reject(new Error('server did not start')) : setTimeout(() => attempt(n - 1), 150)));
    attempt(tries);
  });
}

// Beta mode: `node game/tests/run-all.js --beta` (or BETA=1) runs ONLY the beta gate (beta/beta-run.js), exits non-zero when RED.
// The default run never touches it (it lives in beta/, outside the *.test.js glob below).
if (process.argv.includes('--beta') || process.env.BETA === '1') {
  const r = spawnSync('node', [path.join(__dirname, 'beta', 'beta-run.js')], { stdio: 'inherit', env: process.env });
  process.exit(r.status === null ? 1 : r.status);
}

const lib = require('./tiers-lib');
const argv = process.argv.slice(2);
const flagVal = (name) => { const k = argv.indexOf(name); return k >= 0 ? argv[k + 1] : null; };
const bail = (msg) => { console.error(msg); process.exit(2); };
const timingsPath = path.join(__dirname, '.timings.json');
const readTimings = () => { try { return JSON.parse(fs.readFileSync(timingsPath, 'utf8')); } catch (e) { return {}; } };
if (argv.includes('--list-flaky')) { process.exit(require('./lib/flaky-report').print(readTimings())); }
const tier = flagVal('--tier') || 'full';
const only = flagVal('--only');
const shardArg = flagVal('--shard');
const jobs = Math.max(1, parseInt(flagVal('--jobs') || '1', 10) || 1);
if (!lib.TIERS.includes(tier)) bail('--tier must be smoke or full');
if (only && !lib.CLASSES.includes(only)) bail('--only must be node, browser or live');
const shardSpec = shardArg ? lib.parseShard(shardArg) : null;
if (shardArg && !shardSpec) bail('--shard must look like i/n with 1 <= i <= n');

const table = lib.loadTable(__dirname);
let files = lib.select(lib.allTests(__dirname), table, { tier, only });
const filesArg = flagVal('--files');
if (filesArg) {
  const all = lib.allTests(__dirname); const want = filesArg.split(',').map((x) => x.trim()).filter(Boolean).map((x) => (x.endsWith('.test.js') ? x : x + '.test.js'));
  const unknown = want.filter((x) => !all.includes(x)); if (unknown.length) bail('--files: unknown test(s) ' + unknown.join(', '));
  files = want;
}
if (shardSpec) files = lib.shard(files, table, shardSpec.i, shardSpec.n, argv.includes('--balance') ? readTimings() : null);
if (argv.includes('--list')) { console.log(files.join('\n')); process.exit(0); }

const liveLock = process.env.LIVE_LOCK || '/tmp/live.lock';
const hasFlock = argv.includes('--lock-live') && spawnSync('flock', ['--version'], { stdio: 'ignore' }).status === 0;

(async () => {
  // One static server per run-all process, never shared: a shard that finds its wanted port taken (or loses the free-port race) takes another.
  let port = String(flagVal('--port') || (process.env.PORT ? (+process.env.PORT) + (shardSpec ? shardSpec.i - 1 : 0) : '') || await freePort());
  if (!await portFree(+port)) port = String(await freePort());
  const server = spawn('python3', ['-m', 'http.server', port], { cwd: root, stdio: 'ignore' });
  const stop = () => { try { server.kill(); } catch (e) { /* already gone */ } };
  process.on('exit', stop);
  process.on('SIGINT', () => { stop(); process.exit(130); });
  const base = `http://localhost:${port}/game/index.html`;
  await waitUp(base);
  console.log(`INFO static server on port ${port}${shardSpec ? ' (shard ' + shardArg + ')' : ''}`);
  const env = { ...process.env, BASE: base };
  const t0 = Date.now();
  const timings = {};
  let failed = 0, passed = 0;
  const outcome = {}; // f -> 'pass' | 'fail' | 'solo' (passed only on the solo rerun)

  const runOne = (f) => new Promise((resolve) => {
    const live = lib.info(table, f).class === 'live';
    const cmd = live && hasFlock ? 'flock' : 'node';
    const args = live && hasFlock ? [liveLock, 'node', path.join(__dirname, f)] : [path.join(__dirname, f)];
    const start = Date.now();
    const child = spawn(cmd, args, { env });
    let stdout = '', stderr = '', timedOut = false;
    child.stdout.on('data', (d) => { stdout += d; });
    child.stderr.on('data', (d) => { stderr += d; });
    // per-test budget: 170 s by default; a long test (e.g. the 16-page x 7-viewport a11y sweep) can declare "timeoutSec" (max 1200) in test-tiers.json
    const own = Number((table[f] || {}).timeoutSec); const budget = Number.isFinite(own) && own > 170 ? Math.min(own, 1200) * 1000 : 170000;
    const timer = setTimeout(() => { timedOut = true; child.kill('SIGKILL'); }, budget + (live && hasFlock ? 600000 : 0));
    child.on('close', (status) => { clearTimeout(timer); resolve({ f, status: timedOut ? null : status, stdout, stderr, secs: (Date.now() - start) / 1000 }); });
  });
  const report = (r) => {
    const ok = r.status === 0;
    const out = r.stdout.split('\n').filter((l) => /PASSED|FAILED/.test(l)).join(' | ');
    timings[r.f] = Math.round(r.secs * 10) / 10;
    console.log(`${ok ? 'ok  ' : 'FAIL'} ${r.f} ${out} [${r.secs.toFixed(1)}s]`);
    if (ok) { passed++; outcome[r.f] = 'pass'; }
    else { failed++; outcome[r.f] = 'fail'; console.log(r.stdout.split('\n').filter((l) => l.startsWith('FAIL')).join('\n') + r.stderr.slice(0, 400)); }
  };

  // Default (--jobs 1): strictly serial in sorted order, as before. With --jobs N only node-class files go in parallel, first.
  let serial = files;
  if (jobs > 1) {
    const nodeFiles = files.filter((f) => lib.info(table, f).class === 'node');
    serial = files.filter((f) => !nodeFiles.includes(f));
    const queue = nodeFiles.slice();
    const results = new Map();
    await Promise.all(Array.from({ length: Math.min(jobs, queue.length) }, async () => {
      while (queue.length) { const f = queue.shift(); results.set(f, await runOne(f)); }
    }));
    for (const f of nodeFiles) report(results.get(f));
  }
  for (const f of serial) report(await runOne(f));
  // --rerun-failed: each failure gets exactly one more run, alone. A pass there is reported as such (flagged, never silent).
  if (argv.includes('--rerun-failed') && failed) {
    const again = Object.keys(outcome).filter((f) => outcome[f] === 'fail');
    console.log(`rerunning ${again.length} failed suite(s) alone: ${again.join(' ')}`);
    for (const f of again) {
      const r = await runOne(f);
      if (r.status === 0) { failed--; passed++; outcome[f] = 'solo'; console.log(`ok* ${f} PASSED ONLY ON SOLO RERUN [${r.secs.toFixed(1)}s] (first run failed under load or flaked)`); }
      else console.log(`FAIL ${f} failed again alone (a real failure) [${r.secs.toFixed(1)}s]\n` + r.stdout.split('\n').filter((l) => l.startsWith('FAIL')).join('\n') + r.stderr.slice(0, 400));
    }
  }
  stop();

  // Timings + per-file run history. Several shards finish at once: re-read right before writing and rename a temp file into place.
  try {
    const cur = readTimings(); const runs = cur.__runs && typeof cur.__runs === 'object' ? cur.__runs : {};
    for (const f of Object.keys(timings)) {
      const h = runs[f] || { pass: 0, fail: 0, solo: 0, secs: [] };
      const o = outcome[f] || 'pass'; h[o === 'fail' ? 'fail' : o === 'solo' ? 'solo' : 'pass']++;
      h.secs = (h.secs || []).concat([timings[f]]).slice(-12); runs[f] = h;
    }
    const tmp = timingsPath + '.' + process.pid + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify({ ...cur, ...timings, __runs: runs }, null, 1) + '\n'); fs.renameSync(tmp, timingsPath);
  } catch (e) { /* read-only checkout: timings are optional */ }
  const soloList = Object.keys(outcome).filter((f) => outcome[f] === 'solo');
  const resultsPath = flagVal('--results');
  if (resultsPath) {
    try { fs.writeFileSync(resultsPath, JSON.stringify({ passed: Object.keys(outcome).filter((f) => outcome[f] !== 'fail'), failed: Object.keys(outcome).filter((f) => outcome[f] === 'fail'), solo: soloList, secs: timings, total: files.length }, null, 1) + '\n'); } catch (e) { console.error('could not write --results: ' + e.message); }
  }
  console.log(`summary: ${passed} passed, ${failed} failed, ${files.length} run in ${((Date.now() - t0) / 1000).toFixed(1)}s` + (tier !== 'full' || only || shardSpec ? ` (tier=${tier}${only ? ' only=' + only : ''}${shardSpec ? ' shard=' + shardArg : ''})` : ''));
  if (soloList.length) console.log(`passed only on solo rerun (${soloList.length}): ${soloList.join(' ')}`);
  console.log(failed ? `${failed} suite(s) failed` : 'ALL SUITES PASSED');
  process.exit(failed ? 1 : 0);
})();
