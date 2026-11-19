// Art manifest test: node game/tests/art-manifest.test.js
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const ART = path.join(__dirname, '..', 'assets', 'art');
let failed = 0, passed = 0;
function check(name, cond) {
  if (cond) { passed++; console.log('ok   - ' + name); }
  else { failed++; console.log('FAIL - ' + name); }
}
function done() {
  console.log(passed + ' passed, ' + failed + ' failed');
  process.exit(failed ? 1 : 0);
}

function readPng(file) {
  const b = fs.readFileSync(file);
  if (b.slice(0, 8).toString('hex') !== '89504e470d0a1a0a') return null;
  const w = b.readUInt32BE(16), h = b.readUInt32BE(20), depth = b[24], ctype = b[25], interlace = b[28];
  let transparent = null;
  if (ctype === 6 && depth === 8 && interlace === 0) {
    // decode IDAT to count fully transparent pixels
    const chunks = [];
    let o = 8;
    while (o < b.length) {
      const len = b.readUInt32BE(o), type = b.toString('ascii', o + 4, o + 8);
      if (type === 'IDAT') chunks.push(b.slice(o + 8, o + 8 + len));
      o += 12 + len;
    }
    const raw = zlib.inflateSync(Buffer.concat(chunks));
    const stride = w * 4;
    let prev = Buffer.alloc(stride), cur, p = 0, t = 0;
    for (let y = 0; y < h; y++) {
      const ft = raw[p++];
      cur = Buffer.from(raw.slice(p, p + stride)); p += stride;
      for (let i = 0; i < stride; i++) {
        const a = i >= 4 ? cur[i - 4] : 0, up = prev[i], c = i >= 4 ? prev[i - 4] : 0;
        let v = cur[i];
        if (ft === 1) v += a;
        else if (ft === 2) v += up;
        else if (ft === 3) v += (a + up) >> 1;
        else if (ft === 4) {
          const pp = a + up - c, pa = Math.abs(pp - a), pb = Math.abs(pp - up), pc = Math.abs(pp - c);
          v += (pa <= pb && pa <= pc) ? a : (pb <= pc ? up : c);
        }
        cur[i] = v & 255;
      }
      for (let x = 0; x < w; x++) if (cur[x * 4 + 3] === 0) t++;
      prev = cur;
    }
    transparent = t;
  }
  return { w, h, ctype, transparent };
}

const manifest = JSON.parse(fs.readFileSync(path.join(ART, 'manifest.json'), 'utf8'));
check('manifest has assets', Array.isArray(manifest.assets) && manifest.assets.length > 0);
const ids = new Set();
for (const a of manifest.assets) {
  check('unique id ' + a.id, !ids.has(a.id)); ids.add(a.id);
  const f = path.join(ART, a.path);
  const exists = fs.existsSync(f);
  check('exists ' + a.path, exists);
  if (!exists) continue;
  const p = readPng(f);
  check('valid png ' + a.path, !!p);
  if (!p) continue;
  check('size ' + a.path + ' = ' + (a.frames * a.frame_w) + 'x' + a.frame_h, p.w === a.frames * a.frame_w && p.h === a.frame_h);
  check('has alpha channel ' + a.path, p.ctype === 6);
  if (p.transparent !== null) check('has transparent pixels ' + a.path, p.transparent > 0);
}

const ledger = fs.readFileSync(path.join(ART, 'LEDGER.md'), 'utf8');
const m = ledger.match(/TOTAL:\s*(\d+)/);
check('ledger total present', !!m);
check('ledger total <= 35000', m && Number(m[1]) <= 35000);
const l2 = fs.readFileSync(path.join(ART, 'LEDGER-OPENAI.md'), 'utf8');
const m2 = l2.match(/TOTAL:\s*([0-9.]+)/);
check('openai ledger total present', !!m2);
check('openai ledger total <= 3.50', m2 && Number(m2[1]) <= 3.5);
done();
