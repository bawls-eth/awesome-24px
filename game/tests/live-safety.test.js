// Live-DB safety (static, node, no browser): the Firebase database is LIVE with real players (AGENTS.md). This scans every
// game/tests/*.test.js source and fails when a test could write to it, chat, join it under a non-ADMIN name, or reach
// it without the blockDb pattern (context.route + context.routeWebSocket: route() alone does NOT stop the SDK socket).
// Rules:
//  1. every *.test.js is classified in test-tiers.json (unclassified files are run as live)
//  2. a non-live test never calls helpers.launch() (that joins the live town)
//  3. a non-live Playwright test that loads the Town page (the only page with the Firebase SDK) or opens a WebSocket
//     blocks the database: blockDb(ctx), or both a DB-host route() and routeWebSocket()
//  4. no test requires net.js / firebase-config.js, constructs TownNet, or sends PUT/POST/PATCH/DELETE to a DB host
//  5. a live test never chats or writes shared content (chat, guestbook, blocks, walkie, scavenger, tournament): only a
//     stub ASSIGNMENT (s.net.submitTournamentCatch = ...) is allowed
//  6. every name a live test types into the join form is an ADMIN* literal (or a const holding one)
//  7. run-all.js keeps the flock wrapper for live-class tests
const fs = require('fs');
const path = require('path');
const { check, done } = require('./helpers');

const dir = __dirname;
const table = JSON.parse(fs.readFileSync(path.join(dir, 'test-tiers.json'), 'utf8'));
const files = fs.readdirSync(dir).filter((f) => f.endsWith('.test.js')).sort();
const SELF = path.basename(__filename);
const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`\\])\/\/[^\n]*/g, '$1'); // comments out (URLs inside strings keep their //)
// Does this (comment-stripped) source navigate to the Town page? Town URL holders are consts whose initialiser names
// game/index.html without rewriting it (BASE, TOWN, ORIGIN + '/game/index.html'); BASE.replace(...) pages are other pages.
const TOWN_LIT = /['"`][^'"`]*\/game\/index\.html(\?[^'"`]*)?['"`]/;
function loadsTown(s) {
  const townVars = [];
  (s.match(/const\s+[A-Za-z_$][\w$]*\s*=[^\n;]*/g) || []).forEach((d) => {
    const m = /const\s+([A-Za-z_$][\w$]*)\s*=(.*)/.exec(d);
    if (m && TOWN_LIT.test(m[2]) && !/replace\(|games\/|hub\//.test(m[2])) townVars.push(m[1]);
  });
  return (s.match(/goto\(([^;\n]*)/g) || []).some((g) => {
    const arg = g.slice(5);
    if (/replace\(/.test(arg)) return false;
    if (TOWN_LIT.test(arg)) return true;
    return townVars.some((v) => new RegExp('^\\s*' + v.replace(/\$/g, '\\$') + '\\s*(\\+\\s*[\'"`]\\?[^\'"`]*[\'"`]\\s*)?[,)]').test(arg));
  });
}
// helpers.offlineStub(ctx) and helpers.twoTabs(ctx) count as blocking ONLY while their bodies call blockDb / offlineStub (asserted below).
const isBlocked = (s) => /\bblockDb\s*\(/.test(s) || /\b(offlineStub|twoTabs)\s*\(\s*ctx/.test(s) || (/routeWebSocket\s*\(/.test(s) && /\.route\(\s*(DB_HOSTS?|DB_HOST|BLOCK|\/[^/\n]*firebaseio)/.test(s));

const bad = { unclassified: [], launch: [], unblocked: [], netjs: [], chat: [], names: [] };
for (const f of files) {
  if (f === SELF) continue;
  const raw = fs.readFileSync(path.join(dir, f), 'utf8');
  const s = strip(raw);
  const info = table[f];
  if (!info) bad.unclassified.push(f);
  const live = !info || info.class === 'live';
  const helpersImport = (s.match(/const\s*\{[^}]*\}\s*=\s*require\(\s*['"]\.\/helpers(\.js)?['"]\s*\)/) || [''])[0];
  const usesLaunch = /\blaunch\b/.test(helpersImport) && /\blaunch\s*\(/.test(s);
  if (!live && usesLaunch) bad.launch.push(f);

  // 3. Town page or a raw WebSocket in a non-live browser test
  if (!live && /require\(\s*['"]playwright['"]\s*\)/.test(s)) {
    const town = loadsTown(s);
    const socket = /new\s+WebSocket\s*\(/.test(s);
    if ((town || socket) && !isBlocked(s)) bad.unblocked.push(f + (town ? ' (loads the Town page)' : ' (opens a WebSocket)'));
  }

  // 4. direct database access from a test
  if (/require\([^)]*(net\.js|firebase-config)/.test(s) || /new\s+TownNet\s*\(/.test(s)) bad.netjs.push(f + ' (net.js / TownNet / firebase-config)');
  if (/firebaseio|firebasedatabase/.test(s) && /method\s*:\s*['"`](PUT|POST|PATCH|DELETE)/i.test(s)) bad.netjs.push(f + ' (REST write to a DB host)');

  // 5. chat / shared writes from a live test
  if (live) {
    const WRITE = /\b(sendChat|sendChatMessage|leaveGuestbookNote|submitGuestbookNote|sendWalkie|claimScavengerSpot|placeBlock|submitTournamentCatch)\b(?!\s*=[^=])|(fill|type|press)\(\s*['"`]#(chat|guestbook)-input|getElementById\(\s*['"`](chat|guestbook)-input['"`]\s*\)\.value\s*=[^=]/g;
    const hits = (s.match(WRITE) || []).filter((h) => !/=$/.test(h));
    if (hits.length) bad.chat.push(f + ': ' + Array.from(new Set(hits)).join(', '));
    // 6. ADMIN* names only
    const consts = {};
    s.replace(/const\s+([A-Za-z_$][\w$]*)\s*=\s*(['"`])([^'"`]*)\2/g, (m, k, q, v) => { consts[k] = v; return m; });
    const fills = s.match(/fill\(\s*['"`]#(name-input|new-name)['"`]\s*,\s*([^)]+)\)/g) || [];
    fills.forEach((m) => {
      const arg = m.replace(/^fill\(\s*['"`]#(name-input|new-name)['"`]\s*,\s*/, '').replace(/\)$/, '').trim();
      const lit = /^(['"`])([^'"`]*)\1$/.exec(arg);
      const val = lit ? lit[2] : consts[arg];
      if (m.includes('#new-name')) return; // Lantern hero names are local-only (never sent to the database)
      if (typeof val !== 'string' || !/^ADMIN/.test(val)) bad.names.push(f + ': ' + arg);
    });
  }
}

check('1. every test is classified in test-tiers.json', bad.unclassified.length === 0, bad.unclassified.join(', '));
check('2. no non-live test joins the live town through helpers.launch()', bad.launch.length === 0, bad.launch.join(', '));
check('3. every non-live test that loads the Town page or opens a socket blocks the DB (blockDb, or route + routeWebSocket)', bad.unblocked.length === 0, bad.unblocked.join(', '));
check('4. no test talks to the database directly (net.js, TownNet, firebase-config, REST writes)', bad.netjs.length === 0, bad.netjs.join(', '));
check('5. no live test chats or writes shared content (chat, guestbook, blocks, walkie, scavenger, tournament)', bad.chat.length === 0, bad.chat.join(' | '));
check('6. live tests join only as ADMIN* bots', bad.names.length === 0, bad.names.join(' | '));

// helpers.blockDb itself must keep both halves
const helpers = fs.readFileSync(path.join(dir, 'helpers.js'), 'utf8');
const bd = (helpers.match(/async function blockDb[\s\S]*?\n\}/) || [''])[0];
check('blockDb blocks HTTP (route) AND sockets (routeWebSocket) for the DB hosts', /ctx\.route\(\s*DB_HOSTS/.test(bd) && /ctx\.routeWebSocket\(\s*DB_HOSTS/.test(bd) && /firebaseio/.test(helpers));
const os = (helpers.match(/async function offlineStub[\s\S]*?\n\}/) || [''])[0];
const tt = (helpers.match(/async function twoTabs[\s\S]*?\n\}/) || [''])[0];
check('helpers.offlineStub calls blockDb(ctx) first and twoTabs calls offlineStub(ctx) before opening pages', /^[^]*?await blockDb\(ctx\)[^]*?ctx\.route\(/.test(os) && /await offlineStub\(ctx\)[^]*?ctx\.newPage\(/.test(tt));
const runAll = fs.readFileSync(path.join(dir, 'run-all.js'), 'utf8');
check('7. run-all.js wraps live-class tests in flock /tmp/live.lock (--lock-live)', /flock/.test(runAll) && /\/tmp\/live\.lock/.test(runAll) && /class === 'live'/.test(runAll));

// Self-test: the scanner catches the patterns it is meant to catch.
const probe = (src) => isBlocked(strip(src));
check('self-test: route() alone is not counted as blocked', !probe("const BLOCK=/firebaseio/; await ctx.route(BLOCK, r => r.abort());"));
check('self-test: a commented-out blockDb is not counted', !probe('// await blockDb(ctx)\nawait page.goto(BASE);'));
check('self-test: blockDb(ctx) counts', probe('const db = await blockDb(ctx);'));
const TB = "const BASE = process.env.BASE || 'http://localhost:8440/game/index.html';\n";
check('self-test: goto(BASE) / goto(BASE + "?x=1") / an explicit town URL count as loading the Town',
  loadsTown(strip(TB + 'await page.goto(BASE);')) && loadsTown(strip(TB + "await page.goto(BASE + '?from=hub', { waitUntil: 'load' });")) && loadsTown("await p.goto(ORIGIN + '/game/index.html?test=1');"));
check('self-test: BASE.replace(...) pages and game sub-pages do not count as the Town',
  !loadsTown(strip(TB + "const URL = BASE.replace('/game/index.html', '/game/games/pop/index.html');\nawait page.goto(URL);")) && !loadsTown("await page.goto(ORIGIN + '/game/games/jam/index.html');"));
done();
