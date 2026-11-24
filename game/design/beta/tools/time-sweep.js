// Time sweep: run a set of tests as if started at several UTC instants (and optionally time zones) and report every test whose
// RESULT CHANGES with the clock, or that fails at any instant. Finds tests (and product code) that only pass at some hours / dates.
//   node game/design/beta/tools/time-sweep.js --port 9741 [--files a.test.js,b.test.js | --grep REGEX] [--class browser|node|any]
//        [--times ISO,ISO,...] [--tz Zone,Zone] [--max-secs 40] [--jobs 2] [--wrap /tmp/bt.sh] [--json out.json] [--list]
// Needs a static server on --port serving the repo root (python3 -m http.server PORT). NEVER runs live-class tests (they join the
// real town); the selected tests keep their own database stubs. The clock is only shifted (time-sweep-preload.js), it still runs.
// Default --times: now, and eight instants chosen to cross the known windows: night, early morning, afternoon, the merchant /
// concert evening hours, a Saturday, 23:59:40 UTC (a test that crosses midnight), 31 December and 29 February.
// --max-secs drops tests whose measured time (game/tests/.timings.json, or --timings FILE) is above it (unmeasured tests stay).
// Exit code 0 = every selected test gave the same passing result at every instant; 1 = something changed or failed.
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const root = path.resolve(__dirname, '..', '..', '..', '..');
const tdir = path.join(root, 'game', 'tests');
const argv = process.argv.slice(2);
const val = (n, d) => { const k = argv.indexOf(n); return k >= 0 ? argv[k + 1] : d; };
const DEFAULT_GREP = 'getHours|getUTCHours|merchant|bugoff|bug-off|tourney|fish|streak|daily|dailies|weed|mailbox|new Date|Date\\.now|clock';
const DEFAULT_TIMES = ['now', '2026-11-25T03:20:00Z', '2026-11-25T06:10:00Z', '2026-11-25T13:30:00Z', '2026-11-25T19:40:00Z', '2026-11-28T10:05:00Z', '2026-11-26T23:59:40Z', '2026-12-31T22:15:00Z', '2028-02-29T09:00:00Z'];
const port = val('--port', process.env.PORT || '8440');
const cls = val('--class', 'browser');
const maxSecs = +val('--max-secs', 40);
const jobs = Math.max(1, +val('--jobs', 2));
const wrap = val('--wrap', '');
const times = val('--times', DEFAULT_TIMES.join(',')).split(',').filter(Boolean);
const zones = val('--tz', '').split(',');
const tiers = JSON.parse(fs.readFileSync(path.join(tdir, 'test-tiers.json'), 'utf8'));
let timings = {};
for (const p of [path.join(tdir, '.timings.json'), val('--timings', '')]) { try { if (p) timings = Object.assign(timings, JSON.parse(fs.readFileSync(p, 'utf8'))); } catch (e) { /* optional */ } }
let files;
if (val('--files')) files = val('--files').split(',').map((f) => (f.endsWith('.test.js') ? f : f + '.test.js'));
else {
  const re = new RegExp(val('--grep', DEFAULT_GREP), 'i');
  files = fs.readdirSync(tdir).filter((f) => f.endsWith('.test.js') && re.test(fs.readFileSync(path.join(tdir, f), 'utf8')));
  files = files.filter((f) => typeof timings[f] !== 'number' || timings[f] <= maxSecs);
}
const skipped = files.filter((f) => !tiers[f] || tiers[f].class === 'live' || (cls !== 'any' && tiers[f].class !== cls));
files = files.filter((f) => !skipped.includes(f)).sort();
if (argv.includes('--list')) {
  console.log(files.map((f) => `${f} ${typeof timings[f] === 'number' ? timings[f] : '?'}`).join('\n'));
  console.log(`${files.length} tests x ${times.length * zones.length} clocks (not swept: ${skipped.length}; live-class tests are never swept)`);
  process.exit(0);
}

function runOne(file, at, tz) {
  return new Promise((resolve) => {
    const env = Object.assign({}, process.env, { BASE: `http://localhost:${port}/game/index.html`, PORT: String(port) });
    if (at !== 'now') env.TIME_SWEEP_AT = at;
    if (tz) { env.TIME_SWEEP_TZ = tz; env.TZ = tz; }
    const args = ['--require', path.join(__dirname, 'time-sweep-preload.js'), path.join(tdir, file)];
    const t0 = Date.now(); let out = '';
    const child = spawn(wrap || 'node', wrap ? ['node', ...args] : args, { env, cwd: root });
    const limit = ((tiers[file] && tiers[file].timeoutSec) || 300) * 1000;
    const timer = setTimeout(() => { out += '\nFAIL time-sweep: timeout'; child.kill('SIGKILL'); }, limit);
    child.stdout.on('data', (d) => { out += d; }); child.stderr.on('data', (d) => { out += d; });
    child.on('close', (code) => {
      clearTimeout(timer);
      const fails = out.split('\n').filter((l) => /^\s*(FAIL|not ok|✗|❌)|Error:|TimeoutError/.test(l)).map((l) => l.trim().slice(0, 240));
      resolve({ file, at, tz, ok: code === 0, code, secs: Math.round((Date.now() - t0) / 100) / 10, fails: fails.slice(0, 8), tail: code === 0 ? '' : out.slice(-800) });
    });
  });
}

(async () => {
  const queue = []; for (const f of files) for (const at of times) for (const tz of zones) queue.push([f, at, tz]);
  const res = [];
  console.log(`time-sweep: ${files.length} tests x ${times.length * zones.length} clocks = ${queue.length} runs, ${jobs} at a time`);
  await Promise.all(Array.from({ length: jobs }, async () => {
    while (queue.length) {
      const [f, at, tz] = queue.shift(); const r = await runOne(f, at, tz); res.push(r);
      console.log(`${r.ok ? 'ok  ' : 'FAIL'} ${f} @ ${at}${tz ? ' ' + tz : ''} (${r.secs} s)${r.ok ? '' : ' :: ' + (r.fails[0] || 'exit ' + r.code)}`);
    }
  }));
  const by = {}; for (const r of res) (by[r.file] = by[r.file] || []).push(r);
  const changed = [], red = [];
  for (const f of Object.keys(by).sort()) { const n = by[f].filter((r) => r.ok).length; if (n === 0) red.push(f); else if (n < by[f].length) changed.push(f); }
  console.log(`\n== time-sweep report: ${files.length} tests, ${res.length} runs ==`);
  console.log(`same passing result at every clock: ${files.length - changed.length - red.length}`);
  console.log(`RESULT CHANGES WITH THE CLOCK: ${changed.length}`);
  for (const f of changed) { console.log('  ' + f); for (const r of by[f].filter((x) => !x.ok)) console.log(`    fails @ ${r.at}${r.tz ? ' ' + r.tz : ''}: ${r.fails.slice(0, 3).join(' | ') || 'exit ' + r.code}`); }
  console.log(`fails at every clock (not a clock problem, or broken by the shift itself): ${red.length}`);
  for (const f of red) console.log(`  ${f}: ${(by[f][0].fails[0] || 'exit ' + by[f][0].code)}`);
  if (val('--json')) fs.writeFileSync(val('--json'), JSON.stringify({ times, zones, files, changed, red, runs: res }, null, 1));
  process.exit(changed.length || red.length ? 1 : 0);
})();
