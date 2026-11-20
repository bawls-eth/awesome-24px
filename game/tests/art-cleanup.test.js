// Art cleanup test: node game/tests/art-cleanup.test.js
// No browser, no network, no Firebase. Uses python3 (pillow + numpy) on local files only.
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..', '..');
const TOOLS = path.join(ROOT, 'game', 'tools');
const ARCANE = path.join(ROOT, 'game', 'assets', 'arcane');
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'art-cleanup-'));
let failed = 0;
function check(name, cond, extra) {
  if (cond) console.log('ok   - ' + name);
  else { failed++; console.log('FAIL - ' + name + (extra ? '\n       ' + String(extra).slice(0, 800) : '')); }
}
const readJson = (p) => JSON.parse(fs.readFileSync(p, 'utf8'));
function py(code, args) {
  const r = spawnSync('python3', ['-W', 'ignore', '-c', code].concat(args || []), { encoding: 'utf8', timeout: 180000 });
  return { code: r.status, out: r.stdout || '', err: r.stderr || '' };
}
const LOAD = "import importlib.util,sys,json,numpy as np\nfrom PIL import Image\n" +
  "sp=importlib.util.spec_from_file_location('ing',sys.argv[1]);m=importlib.util.module_from_spec(sp);sp.loader.exec_module(m)\n";

// (a) synthetic strip with a sliver is flagged BLOCKING by the validator
(function synthetic() {
  const dir = path.join(TMP, 'synth');
  fs.mkdirSync(path.join(dir, 'characters', 'x'), { recursive: true });
  const code = LOAD + `
import os
d=sys.argv[2]
def strip(sliver):
    a=np.zeros((256,512,4),np.uint8)
    for f in range(2):
        a[80:200,f*256+100:f*256+156]=(90,60,40,255)       # body
    if sliver: a[20:230,256+200:256+208]=(40,40,40,255)    # 8x210 bar in frame 1
    return a
Image.fromarray(strip(True)).save(os.path.join(d,'characters','x','x_idle_down.png'))
Image.fromarray(strip(False)).save(os.path.join(d,'characters','x','y_idle_down.png'))
base={'category':'character','class':'x','action':'idle','dir':'down','frames':2,'frame_w':256,'frame_h':256}
b1,_,_=m.check_asset(d,dict(base,id='x_idle_down',path='characters/x/x_idle_down.png'),None)
b2,_,_=m.check_asset(d,dict(base,id='y_idle_down',path='characters/x/y_idle_down.png'),None)
print(json.dumps([b1,b2]))`;
  const r = py(code, [path.join(TOOLS, 'ingest-art-zip.py'), dir]);
  let res = [[], []];
  try { res = JSON.parse(r.out.trim().split('\n').pop()); } catch (e) { /* reported below */ }
  check('validator flags a thin vertical sliver as blocking', res[0].some((s) => /sliver/.test(s)), r.out + r.err);
  check('validator does not flag the same strip without the sliver', !res[1].some((s) => /sliver/.test(s)), r.out + r.err);
})();

// (b) cleaned b02 has zero slivers in every frame, alpha still 0/255, cleanup idempotent
(function b02() {
  const base = path.join(ARCANE, 'b02-rogue-warlock-paladin');
  const code = LOAD + `
import glob,os
bad=[];alpha=0;n=0
for f in glob.glob(os.path.join(sys.argv[2],'characters','*','*.png')):
    a=np.array(Image.open(f).convert('RGBA'));n+=1
    if set(np.unique(a[...,3]).tolist())-{0,255}: alpha+=1
    s=m.sliver_frames(a,256)
    if s: bad.append([os.path.basename(f),s])
print(json.dumps({'strips':n,'bad':bad,'alpha':alpha}))`;
  const r = py(code, [path.join(TOOLS, 'ingest-art-zip.py'), base]);
  let res = { strips: 0, bad: [{}], alpha: 1 };
  try { res = JSON.parse(r.out.trim().split('\n').pop()); } catch (e) { /* reported below */ }
  check('b02: 63 strips scanned', res.strips === 63, r.out + r.err);
  check('b02: zero slivers in every frame', res.bad.length === 0, JSON.stringify(res.bad));
  check('b02: alpha is 0/255 only', res.alpha === 0);
  const idem = spawnSync('python3', [path.join(TOOLS, 'art-cleanup.py'), 'clean', base, '--dry'], { encoding: 'utf8' });
  check('b02: cleanup is idempotent (dry run removes nothing)', /strips changed: 0/.test(idem.stdout), idem.stdout + idem.stderr);
  check('b02: cleanup-log.json present', fs.existsSync(path.join(base, 'cleanup-log.json')));
})();

// (c) scales.json equalises standing height to 148 +/- 1 for every class/view
(function scales() {
  const sc = readJson(path.join(ARCANE, 'scales.json')).scales;
  let n = 0; const bad = [];
  ['b01-ranger-mage-cleric', 'b02-rogue-warlock-paladin'].forEach((b) => {
    const dir = path.join(ARCANE, b);
    const rep = readJson(path.join(dir, 'validation-report.json'));
    const man = readJson(path.join(dir, 'manifest.json'));
    Object.keys(rep.standing_heights).forEach((k) => {
      const [cls, view] = k.split('/');
      man.assets.filter((a) => a.class === cls && a.dir === view).forEach((a) => {
        const s = sc[a.id] && sc[a.id].display_scale;
        const eff = rep.standing_heights[k] * s;
        n++;
        if (!(Math.abs(eff - 148) <= 1)) bad.push(a.id + ' ' + eff);
      });
    });
  });
  check('scales.json: 148 +/- 1 effective standing height for every class/view asset (' + n + ')', n === 126 && bad.length === 0, bad.join(', '));
  const mm = require(path.join(ROOT, 'game', 'shared', 'mm-art.js'));
  check('mm-art scaleFor: default 1, reads display_scale, ignores junk', mm.scaleFor({}, 'a') === 1 && mm.scaleFor({ a: { display_scale: 1.5 } }, 'a') === 1.5 && mm.scaleFor({ a: { display_scale: 'x' } }, 'a') === 1 && mm.scaleFor(null, 'a') === 1);
})();

fs.rmSync(TMP, { recursive: true, force: true });
console.log(failed ? failed + ' FAILED' : 'art-cleanup: all passed');
process.exit(failed ? 1 : 0);
