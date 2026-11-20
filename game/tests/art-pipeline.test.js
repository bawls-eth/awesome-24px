// Art pipeline test: node game/tests/art-pipeline.test.js
// No browser, no network, no Firebase. Calls the python tools in game/tools/art via child_process in
// --dry-run mode or with the mocked HTTP layer (env ART_HTTP_MOCK). Needs python3 with pillow + numpy.
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..', '..');
const ART = path.join(ROOT, 'game', 'tools', 'art');
const SPECS = path.join(ART, 'specs');
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'art-pipeline-'));
let failed = 0, passed = 0;
function check(name, cond, extra) {
  if (cond) { passed++; console.log('ok   - ' + name); }
  else { failed++; console.log('FAIL - ' + name + (extra ? '\n       ' + String(extra).slice(0, 600) : '')); }
}
function py(script, args, env) {
  const r = spawnSync('python3', [path.join(ART, script)].concat(args || []), {
    cwd: ART, encoding: 'utf8', env: Object.assign({}, process.env, { ART_NO_SLEEP: '1', ART_WORK_DIR: path.join(TMP, 'work') }, env || {}), timeout: 120000,
  });
  return { code: r.status, out: r.stdout || '', err: r.stderr || '' };
}
const readJson = (p) => JSON.parse(fs.readFileSync(p, 'utf8'));
const CLASSES = ['rogue', 'warlock', 'paladin', 'berserker', 'druid', 'necromancer'];
const ACTIONS = ['idle', 'walk', 'attack', 'cast', 'roll', 'hit', 'death'];
const REAL_LEDGER = path.join(ROOT, 'game', 'assets', 'art', 'LEDGER-OPENAI.md');
const cfg = readJson(path.join(ART, 'config.json'));

function ledgerRows(file) {
  return fs.readFileSync(file, 'utf8').split('\n').filter((l) => /^\|/.test(l)).map((l) => l.split('|').map((c) => c.trim()))
    .filter((c) => c.length >= 9 && c[1] !== 'id' && !/^[-: ]+$/.test(c[1]));
}
const sumRows = (file) => ledgerRows(file).reduce((s, c) => s + parseFloat(c[6]), 0);

// ---------------------------------------------------------------- 1. specs
(function specs() {
  const r = py('spec_lib.py', ['validate']);
  check('spec_lib validate passes for every spec file', r.code === 0, r.out + r.err);
  const schema = readJson(path.join(SPECS, 'spec.schema.json'));
  check('JSON schema file present with required keys', Array.isArray(schema.required) && schema.required.includes('design'));
  const b00 = readJson(path.join(ROOT, 'game', 'assets', 'arcane', 'b00-warrior', 'manifest.json')).assets;
  const frames = {};
  b00.forEach((a) => { frames[a.action] = a.frames; });
  const pal = new Set();
  ['b00-warrior', 'b01-ranger-mage-cleric'].forEach((b) => readJson(path.join(ROOT, 'game', 'assets', 'arcane', b, 'palette.json')).colors.forEach((c) => pal.add(c.toLowerCase())));
  const batches = { rogue: 'b02', warlock: 'b02', paladin: 'b02', berserker: 'b03', druid: 'b03', necromancer: 'b03' };
  CLASSES.forEach((c) => {
    const s = readJson(path.join(SPECS, c + '.json'));
    check(c + ': category hero, batch ' + batches[c], s.category === 'hero' && s.batch === batches[c]);
    check(c + ': frame counts equal b00 for all 7 actions and one pose line per frame',
      ACTIONS.every((a) => s.actions[a] && s.actions[a].frames === frames[a] && s.actions[a].poses.length === frames[a]));
    check(c + ': palette hexes all come from the shared palette', Object.values(s.palette).every((h) => pal.has(h.toLowerCase())));
    check(c + ': 148 px standing in a 256 cell', s.proportions.standing_height_px === 148 && s.proportions.cell_px === 256);
    check(c + ': up view has no face, right view is a true profile', s.views.up.face_visible === false && s.views.right.true_profile === true
      && /NO face/.test(s.views.up.descriptor));
    check(c + ': weapon has hand + region hexes', ['right', 'left', 'both'].includes(s.weapon.hand) && s.weapon.region_hexes.length > 0);
  });
  check('example enemy and item specs exist and validate', fs.existsSync(path.join(SPECS, 'example-enemy.json')) && fs.existsSync(path.join(SPECS, 'example-item.json')));
  // a broken spec must be rejected
  const bad = readJson(path.join(SPECS, 'rogue.json'));
  bad.actions.walk.poses.pop();
  bad.palette.outline = '#123456';
  fs.writeFileSync(path.join(TMP, 'bad.json'), JSON.stringify(bad));
  const rb = py('spec_lib.py', ['validate', path.join(TMP, 'bad.json')]);
  check('broken spec (missing pose, off-palette hex) is rejected', rb.code !== 0 && /pose lines/.test(rb.out) && /shared palette/.test(rb.out), rb.out);
})();

// ---------------------------------------------------------------- 2. prompts
(function prompts() {
  const a = py('prompt_builder.py', ['rogue', 'attack']).out;
  const b = py('prompt_builder.py', ['rogue', 'attack']).out;
  check('prompt is deterministic (two runs identical)', a.length > 3000 && a === b);
  check('prompt has style, layout, proven fixes and negative blocks',
    /STYLE \(locked/.test(a) && /LAYOUT \(strict\)/.test(a) && /PROVEN FIXES/.test(a) && /NEGATIVE/.test(a) && /#FF00FF/.test(a));
  check('PROMPT-NOTES fixes are auto-included',
    /Both legs and both boots are fully visible/.test(a) && /No weapon trail/.test(a) && /No motion blur/.test(a)
    && /back view shows no face/i.test(a) && /true profile/i.test(a));
  check('layout: 5 frame columns x 3 direction rows', /5 columns and 3 rows/.test(a) && /15 characters in total/.test(a));
  const c = py('prompt_builder.py', ['rogue', 'attack', '--retry', 'Make the left dagger visible in frame 3', 'Show both boots']).out;
  check('retry mode appends a REQUIRED block with the critic fix hints', /REQUIRED/.test(c) && /left dagger visible in frame 3/.test(c) && /Show both boots/.test(c)
    && c.indexOf('REQUIRED') < c.indexOf('NEGATIVE') && !/REQUIRED/.test(a));
  const h1 = py('prompt_builder.py', ['rogue', 'walk', '--hash']).out.trim();
  const h2 = py('prompt_builder.py', ['warlock', 'walk', '--hash']).out.trim();
  check('different class gives a different prompt hash', h1.length === 16 && h1 !== h2);
  const m = py('prompt_builder.py', ['paladin', 'master']).out;
  check('master prompt is a 1024x1024 three-view turnaround', /1024x1024/.test(m) && /BACK view/.test(m));
  const e = py('prompt_builder.py', ['example-enemy', 'single']).out;
  check('single prompt works for the example enemy', /ONE subject/.test(e) && /ember mite/.test(e));
})();

// ---------------------------------------------------------------- 3. cost estimate + cap
(function cost() {
  const r = py('generate.py', ['--batch', 'b02', '--dry-run']);
  check('generate --dry-run exits 0 and says nothing is written', r.code === 0 && /DRY RUN: no network, nothing written/.test(r.out), r.out + r.err);
  const lines = r.out.split('\n').filter((l) => /^- b02_/.test(l));
  check('dry run lists master + 7 actions for 3 classes (24 calls)', lines.length === 24);
  const ok = lines.every((l) => {
    const m = l.match(/est out (\d+) \+ in_text (\d+) tokens = ([0-9.]+) USD/);
    if (!m) return false;
    const exp = Math.round((m[1] * 40 + m[2] * 5) / 1e6 * 1e4) / 1e4;
    return Math.abs(exp - parseFloat(m[3])) < 1e-9;
  });
  check('cost per call = out*$40/M + in_text*$5/M (high prices)', ok);
  const total = lines.reduce((s, l) => s + parseFloat(l.match(/= ([0-9.]+) USD/)[1]), 0);
  const tm = r.out.match(/estimated total: ([0-9.]+) USD/);
  check('estimated total equals the sum of the calls', tm && Math.abs(parseFloat(tm[1]) - total) < 0.001);
  check('config: TOTAL cap 6.00, stop 5.60, single source in config.json (owner raised the cap by $2 in chat 2026-11-20)', cfg.cap_total_usd === 6 && cfg.stop_usd === 5.6);
  const head = fs.readFileSync(REAL_LEDGER, 'utf8').split('\n')[0];
  check('ledger header describes the TOTAL cap 6.00 / stop 5.60', /TOTAL cap 6\.00/.test(head) && /stop at 5\.60/.test(head), head);
  const spent = sumRows(REAL_LEDGER);
  const sm = r.out.match(/ledger so far: ([0-9.]+)/);
  check('ledger parser sums the table rows', sm && Math.abs(parseFloat(sm[1]) - spent) < 1e-3, sm && sm[0]);
  check('b02 batch estimate is compared with the remaining budget', /remaining to stop/.test(r.out) && /FITS: (yes|NO)/.test(r.out));
  const src = fs.readFileSync(path.join(ART, 'generate.py'), 'utf8');
  check('generate.py never sets an auth header', !/authorization/i.test(src.replace(/NO auth header|no auth header/g, '')) && !/api[_-]?key/i.test(src));
  // run_batch dry run
  const rb = py('run_batch.py', ['b02', '--dry-run']);
  check('run_batch b02 --dry-run exits 0 and writes no work dir', rb.code === 0 && /PIPELINE \(dry run\)/.test(rb.out) && !fs.existsSync(path.join(TMP, 'work')), rb.out + rb.err);
})();

// ---------------------------------------------------------------- mock helpers
const PNG1 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
function okBody(out, inT) { return { data: [{ b64_json: PNG1 }], usage: { input_tokens: inT, output_tokens: out, input_tokens_details: { text_tokens: inT, image_tokens: 0 } } }; }
function writeJobs(file, id, outPng) {
  fs.writeFileSync(file, JSON.stringify([{ id, prompt: 'a small test prompt for the mocked layer', size: '1536x1024', note: 'unit test', out: outPng }]));
}
function cfgFile(name, over) {
  const c = Object.assign({}, cfg, over);
  const f = path.join(TMP, name);
  fs.writeFileSync(f, JSON.stringify(c));
  return f;
}

// ---------------------------------------------------------------- 4. cap enforcement (fake ledger over the cap)
(function capEnforcement() {
  const ledger = path.join(TMP, 'over.md');
  fs.writeFileSync(ledger, '# OpenAI art ledger (TOTAL cap 1.00 USD, stop at 0.90, report at 0.80)\n\n| id | model | size | quality | usage tokens | est. cost USD | note |\n|---|---|---|---|---|---|---|\n'
    + '| a | gpt-image-1.5 | 1536x1024 | medium | out 1, in text 1, in image 0 | 0.9000 | x |\n| b | gpt-image-1.5 | 1536x1024 | medium | out 1, in text 1, in image 0 | 0.6000 | y |\n\nTOTAL: 1.5000\n');
  const before = fs.readFileSync(ledger, 'utf8');
  const log = path.join(TMP, 'over.log');
  const mock = path.join(TMP, 'over-mock.json');
  fs.writeFileSync(mock, JSON.stringify({ responses: [{ status: 200, body: okBody(2000, 300) }], log }));
  const jobs = path.join(TMP, 'over-jobs.json');
  writeJobs(jobs, 'capjob', path.join(TMP, 'cap.png'));
  const small = cfgFile('over-config.json', { cap_total_usd: 1.0, stop_usd: 0.9 });
  const r = py('generate.py', ['--jobs', jobs, '--ledger', ledger, '--config', small, '--state', path.join(TMP, 'over-state.json')], { ART_HTTP_MOCK: mock });
  check('fake ledger over the cap: generate refuses (exit 3, PAUSED)', r.code === 3 && /PAUSED \(cap\)/.test(r.out), r.out + r.err);
  check('refusal sent no request and wrote no image', !fs.existsSync(log) && !fs.existsSync(path.join(TMP, 'cap.png')));
  check('refusal added no ledger rows', ledgerRows(ledger).length === 2 && ledgerRows(ledger).length === ledgerRows(ledger).filter((c) => c[1] === 'a' || c[1] === 'b').length);
  void before;
  // a single call that would cross the stop level is also refused
  const near = path.join(TMP, 'near.md');
  fs.writeFileSync(near, '# OpenAI art ledger (TOTAL cap 6.00 USD, stop at 5.60, report at 5.20)\n\n| id | model | size | quality | usage tokens | est. cost USD | note |\n|---|---|---|---|---|---|---|\n'
    + '| a | gpt-image-1.5 | 1536x1024 | medium | out 1, in text 1, in image 0 | 5.5500 | x |\n\nTOTAL: 5.5500\n');
  const r2 = py('generate.py', ['--jobs', jobs, '--ledger', near, '--state', path.join(TMP, 'near-state.json')], { ART_HTTP_MOCK: mock });
  check('5.55 spent + ~0.09 estimate would pass the 5.60 stop level: refused', r2.code === 3 && !fs.existsSync(log), r2.out);
  const r3 = py('generate.py', ['--batch', 'b02', '--dry-run', '--ledger', ledger, '--config', small]);
  check('dry run on an over-cap ledger reports FITS: NO', /FITS: NO/.test(r3.out));
})();

// ---------------------------------------------------------------- 5. ledger logging with mocked HTTP
(function ledgerLogging() {
  const ledger = path.join(TMP, 'run.md');
  fs.copyFileSync(REAL_LEDGER, ledger);
  const rowsBefore = ledgerRows(ledger).length;
  const totalBefore = sumRows(ledger);
  const log = path.join(TMP, 'run.log');
  const mock = path.join(TMP, 'run-mock.json');
  fs.writeFileSync(mock, JSON.stringify({
    responses: [
      { status: 429, headers: { 'Retry-After': '1' }, body: { error: { message: 'rate limited' } } },
      { status: 503, body: { error: { message: 'overloaded' } } },
      { status: 200, body: okBody(2000, 400) },
    ], log,
  }));
  const out = path.join(TMP, 'img', 'ok.png');
  const jobs = path.join(TMP, 'run-jobs.json');
  writeJobs(jobs, 'mockjob', out);
  const state = path.join(TMP, 'run-state.json');
  const r = py('generate.py', ['--jobs', jobs, '--ledger', ledger, '--state', state], { ART_HTTP_MOCK: mock });
  check('mocked run: 429 and 503 are retried, third call succeeds (exit 0)', r.code === 0 && fs.existsSync(out), r.out + r.err);
  const rows = ledgerRows(ledger);
  const added = rows.slice(rowsBefore);
  check('every call is a ledger row: 2 failures + 1 success', added.length === 3 && added.filter((c) => /FAILED http 429/.test(c[7])).length === 1
    && added.filter((c) => /FAILED http 503/.test(c[7])).length === 1 && added.filter((c) => /^ok;/.test(c[7])).length === 1, JSON.stringify(added));
  check('success row has usage tokens and the high-price cost', /out 2000, in text 400, in image 0/.test(added[2][5]) && Math.abs(parseFloat(added[2][6]) - (2000 * 40 + 400 * 5) / 1e6) < 1e-9, added[2] && added[2].join('|'));
  check('failure rows cost 0 and carry model, size, quality', added[0][2] === 'gpt-image-1.5' && added[0][3] === '1536x1024' && added[0][4] === 'medium' && parseFloat(added[0][6]) === 0);
  check('existing ledger rows untouched, total grew by the success cost', Math.abs(sumRows(ledger) - totalBefore - 0.082) < 1e-6
    && rows.slice(0, rowsBefore).every((c, i) => c.join('|') === ledgerRows(REAL_LEDGER)[i].join('|')));
  check('estimate is written to the ledger before the batch', /<!-- estimate jobs\.json: 1 call\(s\)/.test(fs.readFileSync(ledger, 'utf8').replace('run-jobs.json', 'jobs.json')) || /<!-- estimate run-jobs\.json: 1 call/.test(fs.readFileSync(ledger, 'utf8')));
  const reqs = fs.readFileSync(log, 'utf8').trim().split('\n').map((l) => JSON.parse(l));
  check('3 requests sent, to /v1/images/generations, no Authorization header, model/quality/size correct',
    reqs.length === 3 && reqs.every((q) => /\/v1\/images\/generations$/.test(q.url) && !Object.keys(q.headers).some((h) => /authorization|api-key/i.test(h))
      && q.body.model === 'gpt-image-1.5' && q.body.quality === 'medium' && q.body.size === '1536x1024'));
  check('TOTAL line refreshed to the row sum', new RegExp('TOTAL: ' + sumRows(ledger).toFixed(4)).test(fs.readFileSync(ledger, 'utf8')));
  // resume: a done job is never sent again
  const r2 = py('generate.py', ['--jobs', jobs, '--ledger', ledger, '--state', state], { ART_HTTP_MOCK: mock });
  const reqs2 = fs.readFileSync(log, 'utf8').trim().split('\n');
  check('resume: a job that succeeded is not re-sent and adds no rows', r2.code === 0 && reqs2.length === 3 && ledgerRows(ledger).length === rowsBefore + 3, r2.out);
  check('state file records the job as done', readJson(state).jobs.mockjob.status === 'done');
  // hard failure (400) is logged and not retried
  const mock400 = path.join(TMP, 'mock400.json');
  const log400 = path.join(TMP, 'log400.log');
  fs.writeFileSync(mock400, JSON.stringify({ responses: [{ status: 400, body: { error: { message: 'moderation_blocked' } } }], log: log400 }));
  const jobs2 = path.join(TMP, 'jobs400.json');
  writeJobs(jobs2, 'badjob', path.join(TMP, 'img', 'bad.png'));
  const n0 = ledgerRows(ledger).length;
  const r4 = py('generate.py', ['--jobs', jobs2, '--ledger', ledger, '--state', path.join(TMP, 'state400.json')], { ART_HTTP_MOCK: mock400 });
  check('HTTP 400: one request, logged as FAILED, exit 1, no retry', r4.code === 1 && fs.readFileSync(log400, 'utf8').trim().split('\n').length === 1
    && ledgerRows(ledger).length === n0 + 1 && /FAILED http 400 moderation_blocked/.test(ledgerRows(ledger)[n0][7]), r4.out);
  // network error: billing unknown -> counted at the full estimate
  const mockNet = path.join(TMP, 'mocknet.json');
  fs.writeFileSync(mockNet, JSON.stringify({ responses: [{ raise: 'timed out' }, { status: 200, body: okBody(1900, 380) }], log: path.join(TMP, 'net.log') }));
  const jobs3 = path.join(TMP, 'jobsnet.json');
  writeJobs(jobs3, 'netjob', path.join(TMP, 'img', 'net.png'));
  const n1 = ledgerRows(ledger).length;
  py('generate.py', ['--jobs', jobs3, '--ledger', ledger, '--state', path.join(TMP, 'statenet.json')], { ART_HTTP_MOCK: mockNet });
  const nr = ledgerRows(ledger).slice(n1);
  check('timeout is logged at the full estimate (billing unknown), retry succeeds', nr.length === 2 && /FAILED network/.test(nr[0][7]) && parseFloat(nr[0][6]) > 0.08 && /^ok;/.test(nr[1][7]), JSON.stringify(nr));
  // header sync only touches header text
  const l2 = path.join(TMP, 'sync.md');
  fs.copyFileSync(REAL_LEDGER, l2);
  const rs = py('generate.py', ['--sync-header', '--ledger', l2]);
  check('--sync-header keeps all rows', rs.code === 0 && ledgerRows(l2).length === ledgerRows(REAL_LEDGER).length && sumRows(l2) === sumRows(REAL_LEDGER));
})();

// ---------------------------------------------------------------- 6. processing a synthetic sheet
(function processing() {
  const raw = path.join(TMP, 'syn-attack.png');
  const s = py('synth_sheet.py', ['rogue', 'attack', raw, '--tip']);
  check('synthetic sheet drawn (blobs on magenta)', s.code === 0 && fs.existsSync(raw), s.err);
  const out = path.join(TMP, 'proc');
  const entries = path.join(TMP, 'entries.json');
  const r = py('process.py', ['sheet', '--raw', raw, '--spec', 'rogue', '--action', 'attack', '--out', out, '--entries-json', entries]);
  check('process sheet exits 0 and builds 3 strips (down, up, right)', r.code === 0 && JSON.parse(r.out).entries.length === 3, r.out + r.err);
  const ents = readJson(entries);
  check('manifest entries: ids, 5 frames, 256 cells, anchor 128/231, fps 12, loop false',
    ents.map((e) => e.id).join() === 'rogue_attack_down,rogue_attack_up,rogue_attack_right'
    && ents.every((e) => e.frames === 5 && e.frame_w === 256 && e.frame_h === 256 && e.anchor.x === 128 && e.anchor.y === 231 && e.fps === 12 && e.loop === false));
  check('every attack entry has a computed muzzle per frame', ents.every((e) => e.muzzle.length === 5 && e.muzzle.every((m) => Number.isInteger(m.x) && Number.isInteger(m.y))));
  check('muzzle follows the weapon: reaches further right in later frames (down row)', ents[0].muzzle[4].x > ents[0].muzzle[0].x + 20, JSON.stringify(ents[0].muzzle));
  const v = py('process.py', ['verify', '--base', out, '--entries', entries, '--spec', 'rogue']);
  const rep = JSON.parse(v.out);
  check('strips pass the intake checks (alpha 0/255, 4x4 grid, margins, no empty frames, palette)', v.code === 0 && Object.keys(rep.blocking).length === 0 && Object.keys(rep.warnings).length === 0, v.out);
  check('feet on baseline y=231 in every frame, strips 1280x256', Object.values(rep.strips).every((s2) => s2.bottoms.every((b) => b === 231) && s2.size[0] === 1280 && s2.size[1] === 256));
  const rj = JSON.parse(r.out);
  check('one scale per view row is recorded and equalises standing height (different raw row sizes)', ['down', 'up', 'right'].every((d) => rj.scales[d] > 0.5 && rj.scales[d] < 1.2)
    && rj.scales.down !== rj.scales.up);
  // a sheet with the wrong number of figures is reported, not guessed
  const raw2 = path.join(TMP, 'syn-wrong.png');
  py('synth_sheet.py', ['rogue', 'idle', raw2]);
  const rw = py('process.py', ['sheet', '--raw', raw2, '--spec', 'rogue', '--action', 'walk', '--out', path.join(TMP, 'proc2')]);
  check('frame-count mismatch is a clear error (idle sheet processed as walk)', rw.code !== 0 && /found \d+ figures, expected 18/.test(rw.out + rw.err), rw.out + rw.err);
})();

// ---------------------------------------------------------------- 7. critic
(function critic() {
  const env = { ART_WORK_DIR: path.join(TMP, 'cwork') };
  const dir = path.join(TMP, 'cwork', 'b02', 'rogue');
  fs.mkdirSync(dir, { recursive: true });
  const bad = path.join(dir, 'verdict.json');
  fs.writeFileSync(bad, JSON.stringify({ verdict: 'MAYBE', defects: [] }));
  const r0 = py('critic.py', ['apply', bad, '--batch', 'b02', '--class', 'rogue'], env);
  check('critic apply rejects a verdict that is not PASS|FAIL', r0.code === 2 && /invalid verdict/.test(r0.out), r0.out);
  fs.writeFileSync(bad, JSON.stringify({ verdict: 'FAIL', defects: [{ strip: 'rogue_walk_up', frame: 9, defect: 'beyond strip', fix_hint: 'none needed' }] }));
  const r1 = py('critic.py', ['apply', bad, '--batch', 'b02', '--class', 'rogue'], env);
  check('critic apply rejects a frame number beyond the strip', r1.code === 2 && /frame 9 > frames/.test(r1.out), r1.out);
  fs.writeFileSync(bad, JSON.stringify({ verdict: 'FAIL', defects: [] }));
  check('FAIL without defects is rejected', py('critic.py', ['apply', bad, '--batch', 'b02', '--class', 'rogue'], env).code === 2);
  const verdict = (hint) => ({ verdict: 'FAIL', defects: [{ strip: 'rogue_walk_up', frame: 3, defect: 'face visible in back view', fix_hint: hint }, { strip: 'rogue_attack_right', frame: 2, defect: 'dagger missing', fix_hint: 'Show both daggers' }] });
  const apply = (hint) => { fs.writeFileSync(bad, JSON.stringify(verdict(hint))); return py('critic.py', ['apply', bad, '--batch', 'b02', '--class', 'rogue'], env); };
  const a1 = apply('Back view shows no face (round 1)');
  const p1 = JSON.parse(a1.out);
  check('FAIL verdict: retry plan limited to the failing strips (walk + attack, not idle)', a1.code === 0 && p1.status === 'RETRY' && p1.retries.map((x) => x.kind).sort().join() === 'attack,walk'
    && p1.retries.every((x) => x.attempt === 1), a1.out);
  check('retry plan carries the fix hints', p1.retries.find((x) => x.kind === 'walk').fix_hints[0] === 'Back view shows no face (round 1)');
  check('qa-verdict.json stored', fs.existsSync(path.join(dir, 'qa-verdict.json')) && readJson(path.join(dir, 'qa-verdict.json')).verdict === 'FAIL');
  const again = apply('Back view shows no face (round 1)');
  check('applying the same verdict twice does not consume a retry', JSON.parse(again.out).retries.every((x) => x.attempt === 1));
  const p2 = JSON.parse(apply('Back view shows no face (round 2)').out);
  check('second failure: attempt 2 planned', p2.status === 'RETRY' && p2.retries.every((x) => x.attempt === 2));
  const p3 = JSON.parse(apply('Back view shows no face (round 3)').out);
  check('third failure: max 2 retries reached, strips go to known_issues', p3.status === 'DONE_WITH_KNOWN_ISSUES' && p3.retries.length === 0
    && p3.known_issues.map((k) => k.id).sort().join() === 'rogue_attack_right,rogue_walk_up', JSON.stringify(p3));
  fs.writeFileSync(bad, JSON.stringify({ verdict: 'PASS', defects: [] }));
  const pp = JSON.parse(py('critic.py', ['apply', bad, '--batch', 'b02', '--class', 'rogue'], env).out);
  check('PASS verdict gives status PASS and no retries', pp.status === 'PASS' && pp.retries.length === 0);
  // prepare: contact sheet + request from the synthetic strips
  const work = path.join(TMP, 'cwork', 'b02', 'out');
  fs.cpSync(path.join(TMP, 'proc', 'characters'), path.join(work, 'characters'), { recursive: true });
  const pr = py('critic.py', ['prepare', 'b02', 'rogue'], env);
  const req = path.join(dir, 'critic-request.json');
  check('critic prepare writes contact-sheet.png and critic-request.json', pr.code === 0 && fs.existsSync(path.join(dir, 'contact-sheet.png')) && fs.existsSync(req), pr.out + pr.err);
  const rq = readJson(req);
  check('request holds the prompt, rubric checks, strict verdict schema and 21 strip ids', rq.strips.length === 21 && rq.rubric_checks.length >= 6
    && rq.verdict_schema.properties.verdict.enum.join() === 'PASS,FAIL' && /ONE JSON object/.test(rq.prompt));
  const png = fs.readFileSync(path.join(dir, 'contact-sheet.png'));
  check('contact sheet is a PNG', png.slice(1, 4).toString() === 'PNG');
})();

// ---------------------------------------------------------------- cleanup
try { fs.rmSync(TMP, { recursive: true, force: true }); } catch (e) { /* ignore */ }
console.log(passed + ' passed, ' + failed + ' failed');
console.log(failed ? 'FAILED' : 'PASSED');
process.exit(failed ? 1 : 0);
