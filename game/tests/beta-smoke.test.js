// Unit-level check of the beta gate helpers (geometry, tap targets, verdicts, report writer). No browser, well under 5 s.
//   node game/tests/beta-smoke.test.js
const fs = require('fs');
const os = require('os');
const path = require('path');
const lib = require('./beta/beta-lib');
let failed = 0;
function check(name, cond, extra = '') { console.log((cond ? 'PASS ' : 'FAIL ') + name + (cond ? '' : ' ' + extra)); if (!cond) failed++; }

// overlap
const A = { x: 0, y: 0, w: 100, h: 50 };
check('rectsOverlap: crossing rects overlap', lib.rectsOverlap(A, { x: 90, y: 40, w: 50, h: 50 }));
check('rectsOverlap: touching edges do not', !lib.rectsOverlap(A, { x: 100, y: 0, w: 50, h: 50 }));
check('rectsOverlap: 1px sliver is tolerated', !lib.rectsOverlap(A, { x: 99, y: 0, w: 50, h: 50 }));
check('rectsOverlap: contained rect overlaps', lib.rectsOverlap(A, { x: 10, y: 10, w: 5, h: 5 }));
const ov = lib.findOverlaps([{ sel: '#hud', x: 0, y: 0, w: 100, h: 40 }], [{ sel: '#stick', x: 50, y: 30, w: 80, h: 80 }, { sel: '#far', x: 300, y: 300, w: 10, h: 10 }, { sel: '#nested', x: 0, y: 0, w: 10, h: 10, nest: ['#hud'] }]);
check('findOverlaps: reports the hit, skips misses and nested pairs', ov.length === 1 && ov[0].ctrl === '#stick' && ov[0].w === 50 && ov[0].h === 10, JSON.stringify(ov));

// tap targets
const off = lib.tapOffenders([{ sel: 'button#a', w: 44, h: 44 }, { sel: 'a.b', w: 39, h: 60 }, { sel: 'input#c', w: 80, h: 30 }, { sel: 'zero', w: 0, h: 0 }]);
check('tapOffenders: flags <40 in either axis, ignores zero-size', off.length === 2 && off[0].sel === 'a.b' && off[1].sel === 'input#c', JSON.stringify(off));
check('scrollOk: allows 1px slack', lib.scrollOk({ sw: 391, cw: 390, bw: 390 }) && !lib.scrollOk({ sw: 420, cw: 390, bw: 390 }));

// verdicts
const good = { page: 'P', viewport: '390x844', phone: true, avgFps: 58, errors: [], failedReqs: [], scroll: { sw: 390, cw: 390, bw: 390 }, tapOffenders: [], overlaps: [], clipped: [] };
check('judge: clean result passes', lib.judge(good).pass);
check('judge: fps 35 warns but passes', lib.judge({ ...good, avgFps: 35 }).pass && lib.judge({ ...good, avgFps: 35 }).warns.length === 1);
check('judge: fps 25 fails', !lib.judge({ ...good, avgFps: 25 }).pass);
check('judge: one console error fails', !lib.judge({ ...good, errors: ['console: x'] }).pass);
check('judge: tap offenders fail on phone only', !lib.judge({ ...good, tapOffenders: [{ sel: 'a', w: 10, h: 10 }] }).pass && lib.judge({ ...good, phone: false, tapOffenders: [{ sel: 'a', w: 10, h: 10 }] }).pass);
check('judge: failed back link / save fail', !lib.judge({ ...good, back: { ok: false, why: 'x' } }).pass && !lib.judge({ ...good, save: { ok: false, why: 'x' } }).pass);

// report writer with fake data
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'beta-smoke-'));
const fake = [
  { ...good, page: 'Fake page', viewport: '1280x720', phone: false, avgFps: 60, worstFrameMs: 20, longFrames: 0, screens: { start: '../tests/beta/screens/x-start.jpg' } },
  { ...good, page: 'Fake page', viewport: '390x844', worstFrameMs: 33, longFrames: 1 },
  { ...good, page: 'Bad page', viewport: '360x640', avgFps: 20, errors: ['pageerror: boom'], tapOffenders: [{ sel: 'button#tiny', w: 20, h: 20 }] },
];
const j = lib.writeReport(fake, { commit: 'abc1234', now: new Date('2026-01-02T03:04:05Z'), whatLooksOff: 'Nothing, this is fake.' }, dir);
const md = fs.readFileSync(path.join(dir, 'BETA-REPORT.md'), 'utf8');
const js = JSON.parse(fs.readFileSync(path.join(dir, 'beta-status.json'), 'utf8'));
check('report: RED summary with a failing page', /\*\*Summary: RED\*\*/.test(md) && j.green === false && js.green === false);
check('report: has UTC and Pacific stamps and the commit', /2026-01-02T03:04:05\.000Z \(UTC\)/.test(md) && /Pacific/.test(md) && /`abc1234`/.test(md));
check('report: one table row per viewport and a section per page', /## Fake page - PASS/.test(md) && /## Bad page - FAIL/.test(md) && (md.match(/^\| (1280x720|390x844|360x640) \|/gm) || []).length === 3);
check('report: json shape', js.commit === 'abc1234' && js.generated_utc === '2026-01-02T03:04:05.000Z' && js.pages.length === 2 && js.pages[0].viewports.length === 2);
check('report: What looks off text is kept on regeneration', (lib.writeReport(fake, { commit: 'abc1234', now: new Date('2026-01-02T03:04:05Z') }, dir), /Nothing, this is fake\./.test(fs.readFileSync(path.join(dir, 'BETA-REPORT.md'), 'utf8'))));
const all = fake.filter((r) => r.page === 'Fake page');
check('report: all-pass data is GREEN', lib.writeReport(all, { commit: 'x' }, dir).green === true);
fs.rmSync(dir, { recursive: true, force: true });

console.log(failed ? `${failed} FAILED` : 'ALL PASSED');
process.exit(failed ? 1 : 0);
