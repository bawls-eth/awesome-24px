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
const tier = flagVal('--tier') || 'full';
const only = flagVal('--only');
const shardArg = flagVal('--shard');
const jobs = Math.max(1, parseInt(flagVal('--jobs') || '1', 10) || 1);
if (!lib.TIERS.includes(tier)) bail('--tier must be smoke or full');
if (only && !lib.CLASSES.includes(only)) bail('--only must be node, browser or live');
const shardSpec = shardArg ? lib.parseShard(shardArg) : null;
if (shardArg && !shardSpec) bail('--shard must look like i/n with 1 <= i <= n');

const timingsPath = path.join(__dirname, '.timings.json');
const readTimings = () => { try { return JSON.parse(fs.readFileSync(timingsPath, 'utf8')); } catch (e) { return {}; } };
const table = lib.loadTable(__dirname);
let files = lib.select(lib.allTests(__dirname), table, { tier, only });
if (shardSpec) files = lib.shard(files, table, shardSpec.i, shardSpec.n, argv.includes('--balance') ? readTimings() : null);
if (argv.includes('--list')) { console.log(files.join('\n')); process.exit(0); }

const hasFlock = argv.includes('--lock-live') && spawnSync('flock', ['--version'], { stdio: 'ignore' }).status === 0;

(async () => {
  const port = String(process.env.PORT || await freePort());
  const server = spawn('python3', ['-m', 'http.server', port], { cwd: root, stdio: 'ignore' });
  const stop = () => { try { server.kill(); } catch (e) { /* already gone */ } };
  process.on('exit', stop);
  process.on('SIGINT', () => { stop(); process.exit(130); });
  const base = `http://localhost:${port}/game/index.html`;
  await waitUp(base);
  const env = { ...process.env, BASE: base };
  const t0 = Date.now();
  const timings = {};
  let failed = 0, passed = 0;

  const runOne = (f) => new Promise((resolve) => {
    const live = lib.info(table, f).class === 'live';
    const cmd = live && hasFlock ? 'flock' : 'node';
    const args = live && hasFlock ? ['/tmp/live.lock', 'node', path.join(__dirname, f)] : [path.join(__dirname, f)];
    const start = Date.now();
    const child = spawn(cmd, args, { env });
    let stdout = '', stderr = '', timedOut = false;
    child.stdout.on('data', (d) => { stdout += d; });
    child.stderr.on('data', (d) => { stderr += d; });
    const timer = setTimeout(() => { timedOut = true; child.kill('SIGKILL'); }, 170000 + (live && hasFlock ? 600000 : 0));
    child.on('close', (status) => { clearTimeout(timer); resolve({ f, status: timedOut ? null : status, stdout, stderr, secs: (Date.now() - start) / 1000 }); });
  });
  const report = (r) => {
    const ok = r.status === 0;
    const out = r.stdout.split('\n').filter((l) => /PASSED|FAILED/.test(l)).join(' | ');
    timings[r.f] = Math.round(r.secs * 10) / 10;
    console.log(`${ok ? 'ok  ' : 'FAIL'} ${r.f} ${out} [${r.secs.toFixed(1)}s]`);
    if (ok) passed++;
    else { failed++; console.log(r.stdout.split('\n').filter((l) => l.startsWith('FAIL')).join('\n') + r.stderr.slice(0, 400)); }
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
  stop();

  try { fs.writeFileSync(timingsPath, JSON.stringify({ ...readTimings(), ...timings }, null, 1) + '\n'); } catch (e) { /* read-only checkout: timings are optional */ }
  console.log(`summary: ${passed} passed, ${failed} failed, ${files.length} run in ${((Date.now() - t0) / 1000).toFixed(1)}s` + (tier !== 'full' || only || shardSpec ? ` (tier=${tier}${only ? ' only=' + only : ''}${shardSpec ? ' shard=' + shardArg : ''})` : ''));
  console.log(failed ? `${failed} suite(s) failed` : 'ALL SUITES PASSED');
  process.exit(failed ? 1 : 0);
})();
