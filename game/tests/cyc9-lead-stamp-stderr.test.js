// cycle 9 L (2): a test that dies with an exception prints its reason on stderr only. tools/stamp.sh shows only shard-log lines that
// start with "summary" or "FAIL", so the stamp showed "FAIL <file>" and nothing else (cycle 8: a page.goto timeout took two stamps
// to diagnose). run-all.js now prints "FAIL-STDERR <file>: <first stderr line>" (and FAIL-TIMEOUT / FAIL-EXIT).
// Proven here with REAL crashing child processes and the REAL grep patterns read out of tools/stamp.sh. Node only, no browser.
// Run: node game/tests/cyc9-lead-stamp-stderr.test.js
const fs = require('fs'); const path = require('path');
const { spawnSync } = require('child_process');
const { check, done } = require('./helpers');
const { failDetail } = require('./lib/fail-lines');

const run = (code) => { const r = spawnSync('node', ['-e', code], { encoding: 'utf8' }); return { f: 'x.test.js', status: r.status, stdout: r.stdout, stderr: r.stderr }; };
const stamp = fs.readFileSync(path.join(__dirname, '..', '..', 'tools', 'stamp.sh'), 'utf8');
const greps = [...stamp.matchAll(/grep -E '(\^\([^']+\))'/g)].map((m) => new RegExp(m[1]));
check('tools/stamp.sh still filters the shard log and the rerun log with two "starts with" patterns', greps.length === 2 && greps.every((g) => g.test('FAIL x') && g.test('summary: 1')), greps.map(String).join(' '));
const shown = (text) => text.split('\n').filter((l) => greps.every((g) => g.test(l)));

// 1. an uncaught exception: the old output had no line the stamp would show
const crash = run("console.log('PASS one'); Promise.reject(new Error('page.goto: Timeout 30000ms exceeded')).catch((e) => { console.error(e); process.exit(1); });");
const old = crash.stdout.split('\n').filter((l) => l.startsWith('FAIL')).join('\n') + crash.stderr.slice(0, 400); // run-all.js before cycle 9, word for word
check('a crashing test really exits 1 with its reason on stderr only', crash.status === 1 && /Timeout 30000ms/.test(crash.stderr) && !/FAIL/.test(crash.stdout), JSON.stringify([crash.status, crash.stderr.slice(0, 60)]));
check('before: the stamp showed nothing for it (the old text has no line starting with FAIL)', shown(old).length === 0, JSON.stringify(shown(old)));
const now = shown(failDetail(crash));
check('now: the stamp shows one line with the file and the first stderr line', now.length === 1 && now[0].startsWith('FAIL-STDERR x.test.js: ') && /page\.goto: Timeout 30000ms exceeded/.test(now[0]), JSON.stringify(now));

// 2. a thrown error with a source frame first: the first NON-EMPTY line is used, capped at 300 characters
const thrown = run("throw new Error('" + 'y'.repeat(500) + "')");
const t = shown(failDetail(thrown));
check('a long first line is cut at 300 characters', t.length === 1 && t[0].length <= 'FAIL-STDERR x.test.js: '.length + 300 && t[0].length > 30, String(t[0] && t[0].length));

// 3. ordinary failed checks are unchanged, and a warning on stderr is added, not swapped in
const failed = run("console.log('PASS a'); console.log('FAIL b detail'); console.error('warn: slow'); process.exit(1);");
const f = shown(failDetail(failed));
check('FAIL <check> lines are still printed first, then the stderr line', f.length === 2 && f[0] === 'FAIL b detail' && f[1] === 'FAIL-STDERR x.test.js: warn: slow', JSON.stringify(f));
check('the first 400 characters of stderr still follow, as before', failDetail(failed).endsWith('warn: slow\n'), JSON.stringify(failDetail(failed)));

// 4. killed at the time budget (status null) and a silent exit
check('a test killed at its budget says so', shown(failDetail({ f: 'x.test.js', status: null, stdout: 'PASS a\n', stderr: '' })).join('|') === 'FAIL-TIMEOUT x.test.js: killed at its time budget');
const silent = run('process.exit(3)');
check('a silent non-zero exit names the exit code', shown(failDetail(silent)).join('|') === 'FAIL-EXIT x.test.js: exit code 3, no FAIL line and nothing on stderr', failDetail(silent));

// 5. run-all.js uses it in both places (first pass and solo rerun) and no longer builds the text itself
const ra = fs.readFileSync(path.join(__dirname, 'run-all.js'), 'utf8');
check('run-all.js prints failDetail(r) for the first pass and for the solo rerun', (ra.match(/failDetail\(r\)/g) || []).length === 2 && !/r\.stderr\.slice\(0, 400\)/.test(ra), String((ra.match(/failDetail\(r\)/g) || []).length));
done();
