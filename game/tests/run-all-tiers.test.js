// Node-only test for the run-all.js tiers/shards (game/tests/test-tiers.json). Never starts a browser or a server.
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const lib = require('./tiers-lib');

let failed = 0;
function check(name, cond, extra = '') {
  console.log((cond ? 'PASS ' : 'FAIL ') + name + (cond ? '' : ' ' + extra));
  if (!cond) failed++;
}
const list = (...args) => {
  const r = spawnSync('node', [path.join(__dirname, 'run-all.js'), '--list', ...args], { encoding: 'utf8' });
  return { status: r.status, files: r.stdout.split('\n').filter(Boolean) };
};

const all = lib.allTests(__dirname);
const table = JSON.parse(fs.readFileSync(path.join(__dirname, 'test-tiers.json'), 'utf8'));

// Classification table
const missing = all.filter((f) => !table[f]);
check('every *.test.js is classified in test-tiers.json (add new tests there)', missing.length === 0, missing.join(', '));
const stale = Object.keys(table).filter((f) => !all.includes(f));
check('test-tiers.json has no entries for files that do not exist', stale.length === 0, stale.join(', '));
check('every class is node|browser|live', Object.values(table).every((v) => lib.CLASSES.includes(v.class)));
check('every tier is smoke|full', Object.values(table).every((v) => lib.TIERS.includes(v.tier)));

// Class sanity by source: node tests never launch a browser; only live tests use helpers.launch / join the town.
const src = (f) => fs.readFileSync(path.join(__dirname, f), 'utf8');
const JOIN_ACTION = /[^.\w]launch\(|[^.\w]joinOffline\(|\.(?:click|tap|dblclick|press)\(\s*(['"`])(?:(?!\1)[^\n])*?(?:#join-btn|Join Town)|join-btn['"`]\)\.click\(/;
// Named exemption (owner decision, Round 4): town-offline.test.js is the test OF the unreachable database. It needs the real Firebase
// SDK and a database that hangs, so the page must try to connect (the attempts are the point) and offlineStub would remove what it
// tests. It blocks every database host itself (ctx.route + ctx.routeWebSocket on the host pattern) and asserts that no socket attempt
// follows "Play offline". Nothing else may be added here without the same kind of reason; the check below pins the list and the block.
const JOIN_EXEMPT = ['town-offline.test.js'];
const bad = [];
for (const f of all.filter((x) => x !== path.basename(__filename))) {
  const c = table[f] && table[f].class, s = src(f);
  const usesBrowser = /chromium\.launch|[^.\w]launch\(/.test(s);
  // Round 4 (owner-approved): the rule looks for a join ACTION, not for the string '#join-btn'. A join action is helpers.launch(),
  // helpers.joinOffline(), or a click / tap / press on the Join button ('#join-btn' or "Join Town", also through getElementById).
  // A file with a join action is live-class unless it PROVES it is offline: it calls offlineStub(ctx) (database blocked and the
  // Firebase SDK answered empty, so the page cannot even try) and asserts db.attempts() === 0. Naming the button without acting on
  // it (reading its label or disabled state) is not a join.
  const joinsTown = JOIN_ACTION.test(s);
  const provenOffline = (/[^.\w]offlineStub\(/.test(s) && /\.attempts\(\)\s*===\s*0/.test(s)) || JOIN_EXEMPT.includes(f);
  if (c === 'node' && usesBrowser) bad.push(f + ' (node but launches a browser)');
  if (c !== 'live' && c !== undefined && joinsTown && !provenOffline) bad.push(f + ' (joins the town without offlineStub(ctx) + a db.attempts() === 0 assert: make it live-class or add both)');
}
// self-test of the join rule (so the rule itself cannot rot silently)
{
  const J = (t) => JOIN_ACTION.test(t);
  const yes = ["await launch();", "await joinOffline(page);", "await page.click('#join-btn');", "await page.tap('button:has-text(\"Join Town\")');", "document.getElementById('join-btn').click();"];
  const no = ["await chromium.launch();", "document.querySelector('#join-btn').disabled", "page.textContent('#join-btn')", "await page.click('#join-menu-btn');", "// never clicks Join Town"];
  check('join rule self-test: 5 join actions are seen, 5 look-alikes are not', yes.every(J) && !no.some(J), JSON.stringify([yes.filter((t) => !J(t)), no.filter(J)]));
}
check('the join-rule exemption list is exactly town-offline.test.js, and that file still blocks the database hosts for HTTP and WebSocket itself', JOIN_EXEMPT.length === 1 && JOIN_EXEMPT[0] === 'town-offline.test.js' && /ctx\.route\(DB_HOST/.test(src('town-offline.test.js')) && /ctx\.routeWebSocket\(DB_HOST/.test(src('town-offline.test.js')) && /firebaseio/.test(src('town-offline.test.js')));
check('classes agree with what each file does (node = no browser; a town join is live-class unless proven offline)', bad.length === 0, bad.join('; '));

// Smoke tier
const smoke = lib.select(all, table, { tier: 'smoke' });
check('smoke includes every node test', all.filter((f) => table[f].class === 'node').every((f) => smoke.includes(f)));
for (const f of ['mad-maze-shell', 'realm-core', 'art-integration', 'town-links']) check(`smoke includes ${f}`, smoke.includes(f + '.test.js'));
check('smoke is a strict subset that leaves out all but 3 live tests', smoke.length < all.length && all.filter((f) => table[f].class === 'live' && !smoke.includes(f)).length >= 25 && smoke.length >= 10, `${smoke.length}/${all.length}`);
const liveSmoke = smoke.filter((f) => table[f].class === 'live');
check('smoke has at most 3 live (town-joining) tests', liveSmoke.length >= 1 && liveSmoke.length <= 3, liveSmoke.join(','));

// CLI: default, tier, only
const full = list();
check('--list default = all test files, sorted, exit 0', full.status === 0 && JSON.stringify(full.files) === JSON.stringify(all));
check('--tier smoke --list matches the library selection', JSON.stringify(list('--tier', 'smoke').files) === JSON.stringify(smoke));
for (const c of lib.CLASSES) {
  check(`--only ${c} --list matches the table`, JSON.stringify(list('--only', c).files) === JSON.stringify(all.filter((f) => table[f].class === c)));
}
check('--tier smoke --only live --list intersects both', JSON.stringify(list('--tier', 'smoke', '--only', 'live').files) === JSON.stringify(liveSmoke));
check('bad --only value exits non-zero', spawnSync('node', [path.join(__dirname, 'run-all.js'), '--list', '--only', 'x']).status !== 0);
check('bad --shard value exits non-zero', spawnSync('node', [path.join(__dirname, 'run-all.js'), '--list', '--shard', '4/3']).status !== 0);

// Shards partition exactly, for several n and for filtered selections
for (const extra of [[], ['--tier', 'smoke'], ['--only', 'live']]) {
  const base = list(...extra).files;
  for (const n of [1, 2, 3, 5]) {
    const parts = Array.from({ length: n }, (_, k) => list(...extra, '--shard', `${k + 1}/${n}`));
    const joined = [].concat(...parts.map((p) => p.files));
    const label = `shards ${n} of [${extra.join(' ') || 'all'}]`;
    check(`${label}: no gap, no overlap`, joined.length === base.length && JSON.stringify(joined.slice().sort()) === JSON.stringify(base), `${joined.length} vs ${base.length}`);
    check(`${label}: every shard exits 0 and is non-empty`, parts.every((p) => p.status === 0 && p.files.length > 0));
  }
}
const sizes = [1, 2, 3].map((k) => list('--shard', `${k}/3`).files.length);
check('3 shards are roughly balanced by count of heavy tests', Math.max(...sizes) - Math.min(...sizes) <= 40, sizes.join('/'));
const cost = (files) => files.reduce((a, f) => a + lib.DEFAULT_COST[table[f].class], 0);
const costs = [1, 2, 3].map((k) => cost(list('--shard', `${k}/3`).files));
check('3 shards are balanced by estimated cost (within 15%)', Math.max(...costs) <= Math.min(...costs) * 1.15, costs.join('/'));
check('shard result is deterministic', JSON.stringify(list('--shard', '2/3').files) === JSON.stringify(list('--shard', '2/3').files));

console.log(failed ? `${failed} FAILED` : 'ALL PASSED');
process.exitCode = failed ? 1 : 0;
