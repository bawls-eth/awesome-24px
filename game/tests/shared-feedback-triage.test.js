// Node: node game/tests/shared-feedback-triage.test.js   (feedback triage: risk rubric scorer, inbox merge/dedupe, pasted text, report)
// Uses a temp folder only: never touches game/design/FEEDBACK-INBOX.md, the network or Firebase.
const fs = require('fs');
const os = require('os');
const path = require('path');
const T = require('../tools/feedback-triage/triage.js');
const F = require('../shared/mm-feedback.js');
let pass = 0, fail = 0;
function check(name, cond, extra) { if (cond) pass++; else { fail++; console.log('FAIL: ' + name + (extra ? ' ' + extra : '')); } }

// ---- rubric ----
const sc = (flags, extra) => T.scoreRisk(Object.assign({ flags: flags }, extra || {}));
check('base score is 10', sc({}).score === 10 && sc({}).decision === 'implement');
const copy = sc({ pureCopy: true, hasTest: true });
check('copy change with a test = low (0) and implement', copy.score === 0 && copy.decision === 'implement', JSON.stringify(copy));
check('copy change alone = 0', sc({ pureCopy: true }).score === 0);
const net = sc({ netOrDb: true, townMultiplayer: true, saveMigration: true });
check('net.js + town + save migration = 80 = reject (threshold is inclusive)', net.score === 80 && net.decision === 'reject', JSON.stringify(net));
check('net.js change alone is high but under 80', sc({ netOrDb: true }).score === 40);
const worst = sc({ netOrDb: true, saveMigration: true, townMultiplayer: true, balance: true, manyFiles: true, newArt: true, unclear: true, conflictsRule: true });
check('everything = clamped to 100, reject', worst.score === 100 && worst.decision === 'reject');
check('79 is implement', sc({ netOrDb: true, saveMigration: true, balance: true }).score === 80 &&
  sc({ netOrDb: true, townMultiplayer: true, balance: true, newArt: true }).score === 80 &&
  sc({ netOrDb: true, saveMigration: true, newArt: true }).score === 75 && sc({ netOrDb: true, saveMigration: true, newArt: true }).decision === 'implement');
check('filesTouched > 3 adds 10', sc({}, { filesTouched: 4 }).score === 20 && sc({}, { filesTouched: 3 }).score === 10);
check('gear balance + art = 35', sc({ balance: true, newArt: true }).score === 35);
check('reasons list each rule', net.reasons.length === 4 && net.reasons[0] === 'start 10');
// auto-rejects override a low score
['realMoney', 'lootBox', 'fakeUrgency', 'personalData', 'removesFeature', 'dbWrites'].forEach((f) => {
  const r = sc({ [f]: true, pureCopy: true });
  check('auto-reject ' + f + ' even at low score', r.decision === 'reject' && r.autoReject.length === 1 && r.score <= 10, JSON.stringify(r));
});
check('DB writes with the owner\'s explicit OK is scored, not auto-rejected', (() => { const r = sc({ dbWrites: true, ownerOkDb: true, netOrDb: true }); return r.autoReject.length === 0 && r.score === 40 && r.decision === 'implement'; })());
check('garbage input does not throw', T.scoreRisk(null).score === 10 && T.scoreRisk({ flags: 'x' }).score === 10);
check('only boolean true counts', sc({ netOrDb: 'yes', balance: 1 }).score === 10);

// ---- keyword hints (a starting guess only) ----
const hint = (t) => T.scoreRisk({ flags: T.suggestFlags(t) });
check('hint: typo fix is low', hint('There is a typo in the settings label, it says Musik instead of Music').score <= 10);
check('hint: firebase sync is high and auto-rejected as DB write', (() => { const r = hint('Please sync my save to the firebase database so I can play on two phones'); return r.score >= 40 && r.autoReject.length > 0; })());
check('hint: real money auto-reject', hint('Let us buy gems with real money for faster drops').decision === 'reject');
check('hint: loot box auto-reject', hint('add a gacha loot box you can pay for').decision === 'reject');
check('hint: personal data auto-reject', hint('ask players for their email address when they start').decision === 'reject');
check('hint: fake urgency auto-reject', hint('show a limited time offer countdown in the shop').decision === 'reject');
check('hint: removes feature auto-reject', hint('please remove the fishing minigame').decision === 'reject');
check('hint: very short text is unclear', T.suggestFlags('fix it').unclear === true);

// ---- inbox escaping round trip ----
const nasty = 'a | b <script>alert(1)</script> `x` \\ &amp;\nline2 <br> &#124;';
check('esc/unesc round trip', T.unesc(T.esc(nasty)) === nasty);
check('escaped cell has no raw pipe, tag or newline', !/[|<>\n`]/.test(T.esc(nasty).replace(/<br>/g, '')));

// ---- merge pipeline in a temp folder ----
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'fb-triage-'));
const dir = path.join(tmp, 'feedback');
fs.mkdirSync(dir);
const inbox = path.join(tmp, 'INBOX.md');
let s1 = F.clean(null);
s1 = F.add(s1, { id: 'aaaa0001', t: '2026-11-22T09:00Z', k: 'bug', page: 'realm', text: 'Map button | overlaps <b>chat</b>', ua: 'phone' }).state;
s1 = F.add(s1, { id: 'aaaa0002', t: '2026-11-22T09:05Z', k: 'suggestion', page: 'hub', text: 'Bigger font in settings', ua: 'desktop' }).state;
fs.writeFileSync(path.join(dir, 'one.json'), F.exportText(s1));
// a second device export with one duplicate id and one duplicate text
const s2 = { v: 1, app: 'pixeltown', entries: [
  { id: 'aaaa0001', t: '2026-11-22T09:00Z', k: 'bug', page: 'realm', text: 'different text same id', ua: 'phone' },
  { id: 'bbbb0001', t: '2026-11-22T10:00Z', k: 'suggestion', page: 'hub', text: 'bigger  FONT in settings', ua: 'phone' },
  { id: 'bbbb0002', t: '2026-11-21T08:00Z', k: 'other', page: 'town', text: 'Love the fishing', ua: 'phone' }
] };
fs.writeFileSync(path.join(dir, 'two.json'), JSON.stringify(s2));
fs.writeFileSync(path.join(dir, 'broken.json'), '{not json');
fs.writeFileSync(path.join(dir, 'proto.json'), '{"__proto__":{"polluted":1},"app":"pixeltown","entries":[]}');
const pasted = path.join(tmp, 'pasted.txt');
fs.writeFileSync(pasted, 'Hi! here is my feedback:\n```\n' + JSON.stringify({ v: 1, app: 'pixeltown', entries: [{ id: 'cccc0001', t: '2026-11-22T11:00Z', k: 'bug', page: 'isles', text: 'Crash when taming {a} "quoted"', ua: 'desktop' }] }) + '\n```\nthanks');
const logs = [];
T.run(['--dir', dir, '--inbox', inbox, pasted], { log: (m) => logs.push(m) });
const md = fs.readFileSync(inbox, 'utf8');
let rows = T.parseInbox(md);
check('merged 4 unique entries (dupe id + dupe text dropped)', rows.length === 4, JSON.stringify(rows.map((r) => r.id)));
check('sorted by date', rows.map((r) => r.id).join() === 'bbbb0002,aaaa0001,aaaa0002,cccc0001');
check('all new', rows.every((r) => r.status === 'new'));
check('text with pipe and markup survives the table', rows[1].text === 'Map button | overlaps <b>chat</b>' && md.indexOf('<b>') < 0);
check('pasted chat text with an embedded export is read', rows[3].page === 'isles' && rows[3].text === 'Crash when taming {a} "quoted"');
check('broken export warned', logs.some((l) => /broken\.json is not a valid/.test(l)));
check('prints NEW lines', logs.filter((l) => l.startsWith('NEW ')).length === 4, logs.join('\n'));
check('no prototype pollution', ({}).polluted === undefined);
// agent edits statuses; rerun keeps them and adds only new ids
const edited = md.replace(/\| new \|\n/, '| rejected (risk 85): needs DB writes |\n')
  .replace(/(\| aaaa0002 .*)\| new \|/, '$1| implemented (risk 0, abc1234) |');
fs.writeFileSync(inbox, edited);
const stamp1 = /Last merged: (\S+)/.exec(edited)[1];
T.run(['--dir', dir, '--inbox', inbox], { log: () => {} });
const md2 = fs.readFileSync(inbox, 'utf8');
rows = T.parseInbox(md2);
check('rerun keeps agent statuses', rows[0].status === 'rejected (risk 85): needs DB writes' && rows[2].status === 'implemented (risk 0, abc1234)', JSON.stringify(rows));
check('rerun keeps entries whose pasted source is gone', rows.length === 4);
check('rerun with nothing new keeps the timestamp (no churn)', /Last merged: (\S+)/.exec(md2)[1] === stamp1 && md2 === edited);
fs.writeFileSync(path.join(dir, 'three.json'), JSON.stringify({ v: 1, app: 'pixeltown', entries: [{ id: 'dddd0001', t: '2026-11-22T12:00Z', k: 'bug', page: 'town', text: 'New thing', ua: 'phone' }] }));
T.run(['--dir', dir, '--inbox', inbox, '--dry'], { log: () => {} });
check('--dry does not write', fs.readFileSync(inbox, 'utf8') === md2);
T.run(['--dir', dir, '--inbox', inbox], { log: () => {} });
check('a new export adds one row with status new', T.parseInbox(fs.readFileSync(inbox, 'utf8')).filter((r) => r.status === 'new').length === 3);

// ---- report ----
const rep = T.report(T.parseInbox(fs.readFileSync(inbox, 'utf8')), '2026-11-22');
check('report has counts', /Received: 4 today \(inbox total 5\)/.test(rep) && /Implemented: 1/.test(rep) && /Rejected: 1/.test(rep) && /Still open: 3/.test(rep), rep);
check('report lists rejects with reason', /#### Rejected feedback\n- bbbb0002 \(other, town\): "Love the fishing" - \(risk 85\): needs DB writes/.test(rep), rep);
const repLog = [];
T.run(['--inbox', inbox, '--report', '2026-11-22'], { log: (m) => repLog.push(m) });
check('--report prints the section and writes nothing', repLog[0] === rep);

// the real inbox file in the repo parses
const real = path.join(__dirname, '../design/FEEDBACK-INBOX.md');
check('repo FEEDBACK-INBOX.md exists and parses', fs.existsSync(real) && Array.isArray(T.parseInbox(fs.readFileSync(real, 'utf8'))));
check('repo feedback folder exists', fs.existsSync(path.join(__dirname, '../design/feedback/.gitkeep')));
const tsrc = fs.readFileSync(path.join(__dirname, '../tools/feedback-triage/triage.js'), 'utf8');
check('triage source has no network or firebase use', !/require\(['"](https?|net|tls|dgram|child_process)['"]\)|fetch\(|firebase\.|XMLHttpRequest/.test(tsrc));
fs.rmSync(tmp, { recursive: true, force: true });

console.log(`shared-feedback-triage: ${pass} passed, ${fail} failed`);
console.log(fail ? `${fail} FAILED` : 'ALL PASSED');
process.exitCode = fail ? 1 : 0;
