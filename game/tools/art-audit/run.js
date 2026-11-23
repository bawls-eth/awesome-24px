#!/usr/bin/env node
// Art health audit (art-audit-3). Node only, no network, no dependencies: a tiny PNG decoder on zlib.
// Walks game/assets/arcane/INDEX.json -> each batch manifest -> each asset and reports:
//   missing      the PNG is not on disk                                                    (blocker)
//   dims         PNG size does not fit frames x frame_w by frame_h                          (blocker)
//   bg           a sprite (not a tile / opaque batch) has opaque corner pixels               (needs-redo)
//   frames       fewer non-empty cells than the manifest frame count                        (needs-redo)
//   anchor       the art's lowest opaque row sits far off anchor.y (feet float / sink)      (needs-redo > cell/8, nit > cell/16)
//   drift        idle / move baseline jumps between frames (bobbing feet)                   (nit)
//   palette      too many colours for pixel art / many soft-alpha pixels (blurred upscale)  (nit / needs-redo)
//   outline      under half of the silhouette edge is a dark rim (no 8-bit outline)          (nit)
//   contrast     flat fill (p5-p95 luma < 0.22) or a mean luma that vanishes on #12142a + grey (nit)
//   face         down-view monster / wildlife with a smiley mascot face (2 eye dots + upturned mouth, or a wide grin)  (nit)
//   dup          byte-identical PNG registered under two ids                                (nit)
//   unref        neither the id nor its batch folder + creature name appear in game code    (nit: registered, never used)
// Usage: node game/tools/art-audit/run.js [--json out.json] [--md]   (exit code 0 always; it is a report, not a gate)
'use strict';
const fs = require('fs'), path = require('path'), zlib = require('zlib'), crypto = require('crypto');
const GAME = path.resolve(__dirname, '..', '..');
const INDEX = path.join(GAME, 'assets', 'arcane', 'INDEX.json');

// ---- minimal PNG decode (8-bit gray / RGB / palette / gray-alpha / RGBA, non-interlaced) ----
function decodePng(buf) {
  if (buf.readUInt32BE(0) !== 0x89504e47) throw new Error('not a png');
  let p = 8, w = 0, h = 0, depth = 0, ct = 0, inter = 0, plte = null, trns = null; const idat = [];
  while (p < buf.length) {
    const len = buf.readUInt32BE(p), type = buf.toString('ascii', p + 4, p + 8), d = buf.slice(p + 8, p + 8 + len);
    if (type === 'IHDR') { w = d.readUInt32BE(0); h = d.readUInt32BE(4); depth = d[8]; ct = d[9]; inter = d[12]; }
    else if (type === 'PLTE') plte = d; else if (type === 'tRNS') trns = d; else if (type === 'IDAT') idat.push(d); else if (type === 'IEND') break;
    p += 12 + len;
  }
  if (depth !== 8 || inter) return { w, h, rgba: null, why: 'depth ' + depth + (inter ? ' interlaced' : '') };
  const ch = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 }[ct], raw = zlib.inflateSync(Buffer.concat(idat)), stride = w * ch;
  const out = Buffer.alloc(w * h * 4), prev = Buffer.alloc(stride), cur = Buffer.alloc(stride);
  for (let y = 0, o = 0; y < h; y++) {
    const f = raw[o++]; raw.copy(cur, 0, o, o + stride); o += stride;
    for (let i = 0; i < stride; i++) {
      const a = i >= ch ? cur[i - ch] : 0, b = prev[i], c = i >= ch ? prev[i - ch] : 0;
      let v = cur[i];
      if (f === 1) v += a; else if (f === 2) v += b; else if (f === 3) v += (a + b) >> 1;
      else if (f === 4) { const pp = a + b - c, pa = Math.abs(pp - a), pb = Math.abs(pp - b), pc = Math.abs(pp - c); v += pa <= pb && pa <= pc ? a : pb <= pc ? b : c; }
      cur[i] = v & 255;
    }
    for (let x = 0; x < w; x++) {
      const q = (y * w + x) * 4, s = x * ch;
      if (ct === 6) { out[q] = cur[s]; out[q + 1] = cur[s + 1]; out[q + 2] = cur[s + 2]; out[q + 3] = cur[s + 3]; }
      else if (ct === 2) { out[q] = cur[s]; out[q + 1] = cur[s + 1]; out[q + 2] = cur[s + 2]; out[q + 3] = 255; }
      else if (ct === 0) { out[q] = out[q + 1] = out[q + 2] = cur[s]; out[q + 3] = 255; }
      else if (ct === 4) { out[q] = out[q + 1] = out[q + 2] = cur[s]; out[q + 3] = cur[s + 1]; }
      else if (ct === 3) { const k = cur[s]; out[q] = plte[k * 3]; out[q + 1] = plte[k * 3 + 1]; out[q + 2] = plte[k * 3 + 2]; out[q + 3] = trns && k < trns.length ? trns[k] : 255; }
    }
    cur.copy(prev);
  }
  return { w, h, rgba: out };
}

// ---- the code corpus (every .js / .html under game/ except assets, tests, tools) for the "never referenced" check ----
function corpus() {
  const parts = [];
  (function walk(d) {
    fs.readdirSync(d, { withFileTypes: true }).forEach((e) => {
      const f = path.join(d, e.name);
      if (e.isDirectory()) { if (!/^(assets|tests|tools|node_modules|design)$/.test(e.name)) walk(f); }
      else if (/\.(js|html|json)$/.test(e.name)) parts.push(fs.readFileSync(f, 'utf8'));
    });
  })(GAME);
  return parts.join('\n');
}

// ---- 8-bit look heuristics for one cell (pure; exported for tests) ----
const luma = (r, g, b) => (0.299 * r + 0.587 * g + 0.114 * b) / 255;
const BG_LUMA = luma(0x12, 0x14, 0x2a), GREY_LUMA = luma(0x80, 0x80, 0x80);
// lookCell(rgba, stride, x0, y0, w, h, step?) -> { opaque, rimDark (share of edge pixels that are darker than the body), range (p5..p95 luma),
//   vsBg / vsGrey (|mean luma - bg luma|), smiley (string or '') } or null for an empty cell
// step samples every step-th pixel (4 for the 4x-upscaled strips, so one sample per art pixel: same answer, 16x less work)
function lookCell(px, stride, x0, y0, w, h, step) {
  const k = step > 1 ? step : 1; w = Math.floor(w / k); h = Math.floor(h / k);
  const A = (x, y) => x >= 0 && y >= 0 && x < w && y < h && px[((y0 + y * k) * stride + x0 + x * k) * 4 + 3] > 0;
  const L = (x, y) => { const q = ((y0 + y * k) * stride + x0 + x * k) * 4; return luma(px[q], px[q + 1], px[q + 2]); };
  const lum = [], edge = [], inner = []; let minX = w, minY = h, maxX = -1, maxY = -1;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    if (!A(x, y)) continue; const l = L(x, y); lum.push(l);
    if (x < minX) minX = x; if (x > maxX) maxX = x; if (y < minY) minY = y; if (y > maxY) maxY = y;
    if (!A(x - 1, y) || !A(x + 1, y) || !A(x, y - 1) || !A(x, y + 1)) edge.push(l); else inner.push(l);
  }
  if (!lum.length) return null;
  const sorted = lum.slice().sort((p, q) => p - q), pick = (f) => sorted[Math.min(sorted.length - 1, Math.floor(f * sorted.length))];
  const innerMed = inner.length ? inner.slice().sort((p, q) => p - q)[inner.length >> 1] : pick(0.5);
  const rimDark = edge.length ? edge.filter((l) => l < innerMed - 0.08 || l < 0.16).length / edge.length : 0;
  const mean = lum.reduce((s, v) => s + v, 0) / lum.length;
  return { opaque: lum.length, rimDark, range: pick(0.95) - pick(0.05), vsBg: Math.abs(mean - BG_LUMA), vsGrey: Math.abs(mean - GREY_LUMA),
    smiley: smiley(A, L, innerMed, minX, minY, maxX, maxY) };
}
// two small dark interior blobs mirrored about the body's centre column, plus a wider dark blob under them whose ends sit higher than
// its middle (an upturned mouth); or, with no eye dots, one wide thin upturned dark grin centred in the top 60% of the body.
// Only interior pixels (all 4 neighbours opaque) count, so the outline never forms a "face".
// a mouth curve: its top row at both ends sits above its top row in the middle
function upturned(m) {
  const top = (x) => { let t = Infinity; m.pts.forEach((p) => { if (p[0] === x && p[1] < t) t = p[1]; }); return t; };
  const mid = top(Math.round((m.x0 + m.x1) / 2)), le = Math.min(top(m.x0), top(m.x0 + 1)), re = Math.min(top(m.x1), top(m.x1 - 1));
  return isFinite(mid) && le < mid && re < mid;
}
function smiley(A, L, med, minX, minY, maxX, maxY) {
  const bw = maxX - minX + 1, bh = maxY - minY + 1; if (bw < 10 || bh < 10) return '';
  const dark = (x, y) => A(x, y) && A(x - 1, y) && A(x + 1, y) && A(x, y - 1) && A(x, y + 1) && L(x, y) < Math.min(med * 0.6, med - 0.15);
  const seen = new Set(), comps = [];
  for (let y = minY; y <= maxY; y++) for (let x = minX; x <= maxX; x++) {
    const k = y * 4096 + x; if (seen.has(k) || !dark(x, y)) continue;
    const c = { n: 0, x0: x, x1: x, y0: y, y1: y, sx: 0, sy: 0, pts: [] }, st = [[x, y]]; seen.add(k);
    while (st.length) {
      const [u, v] = st.pop(); c.n++; c.sx += u; c.sy += v; c.pts.push([u, v]);
      if (u < c.x0) c.x0 = u; if (u > c.x1) c.x1 = u; if (v < c.y0) c.y0 = v; if (v > c.y1) c.y1 = v;
      [[u + 1, v], [u - 1, v], [u, v + 1], [u, v - 1]].forEach(([p, q]) => { const kk = q * 4096 + p; if (p >= minX && p <= maxX && q >= minY && q <= maxY && !seen.has(kk) && dark(p, q)) { seen.add(kk); st.push([p, q]); } });
    }
    if (c.n <= bw * bh * 0.06) comps.push(c);
  }
  const cx = (minX + maxX) / 2, eyeMax = bw * bh * 0.02;
  for (let i = 0; i < comps.length; i++) for (let j = i + 1; j < comps.length; j++) {
    const a = comps[i], b = comps[j]; if (a.n > eyeMax || b.n > eyeMax) continue;
    const ax = a.sx / a.n, ay = a.sy / a.n, bx = b.sx / b.n, by = b.sy / b.n, l = ax < bx ? [ax, ay] : [bx, by], r = ax < bx ? [bx, by] : [ax, ay];
    const gap = r[0] - l[0];
    if (gap < bw * 0.12 || Math.abs(ay - by) > bh * 0.06 || Math.abs((l[0] + r[0]) / 2 - cx) > bw * 0.1 || Math.max(a.n, b.n) > 3 * Math.min(a.n, b.n)) continue;
    const eyeY = (ay + by) / 2;
    const mouth = comps.find((m) => m !== a && m !== b && m.y0 > eyeY && m.y0 - eyeY < bh * 0.35 && m.x1 - m.x0 + 1 >= gap * 0.45 && m.x0 >= l[0] - gap * 0.4 && m.x1 <= r[0] + gap * 0.4
      && (m.y1 - m.y0 + 1) * 2 <= (m.x1 - m.x0 + 1) + 2);
    if (!mouth) continue;
    if (upturned(mouth)) return 'eyes at y ' + Math.round(eyeY) + ', mouth ' + (mouth.x1 - mouth.x0 + 1) + ' px wide';
  }
  const grin = comps.find((m) => { const mw = m.x1 - m.x0 + 1, mh = m.y1 - m.y0 + 1;
    return mw >= bw * 0.3 && mw <= bw * 0.8 && mh <= Math.max(2, bh * 0.08) && m.y1 < minY + bh * 0.6 && Math.abs((m.x0 + m.x1) / 2 - cx) <= bw * 0.08 && upturned(m); });
  return grin ? 'grin ' + (grin.x1 - grin.x0 + 1) + ' px wide at y ' + grin.y0 : '';
}

function auditAsset(b, man, a, file, CODE, seen) {
  const probs = []; const add = (sev, kind, msg) => probs.push({ sev, kind, msg });
  if (!fs.existsSync(file)) { add('blocker', 'missing', 'file not found: ' + path.relative(GAME, file)); return probs; }
  const bytes = fs.readFileSync(file);
  const sha = crypto.createHash('sha1').update(bytes).digest('hex');
  if (seen[sha] && seen[sha] !== a.id) add('nit', 'dup', 'byte-identical to ' + seen[sha]); else seen[sha] = a.id;
  let img; try { img = decodePng(bytes); } catch (e) { add('blocker', 'missing', 'unreadable png: ' + e.message); return probs; }
  const fw = a.frame_w || man.frame_size || man.tile_size || img.h, fh = a.frame_h || man.frame_size || man.tile_size || img.h, n = a.frames || 1;
  const cols = Math.floor(img.w / fw), rows = Math.floor(img.h / fh);
  if (img.w % fw || img.h % fh || cols * rows < n) add('blocker', 'dims', img.w + 'x' + img.h + ' does not hold ' + n + ' x ' + fw + 'x' + fh);
  if (!img.rgba) { add('nit', 'palette', 'not 8-bit RGBA (' + img.why + '), pixels not checked'); return probs; }
  const px = img.rgba, A = (x, y) => px[(y * img.w + x) * 4 + 3];
  const tile = man.opaque || /tile|terrain|backdrop|bg|banner|portrait|logo/i.test((a.category || '') + ' ' + a.id + ' ' + (a.kind || ''));
  if (!tile) {
    const corners = [[0, 0], [img.w - 1, 0], [0, img.h - 1], [img.w - 1, img.h - 1]].filter(([x, y]) => A(x, y) > 0).length;
    if (corners >= 3) add('needs-redo', 'bg', corners + '/4 corners opaque: background not transparent');
    else if (corners) add('nit', 'bg', corners + '/4 corners opaque: the art touches the cell edge (no 1 px padding)');
  }
  // per-cell: empty?, lowest opaque row
  const bottoms = []; let empty = 0;
  for (let i = 0; i < Math.min(n, cols * rows); i++) {
    const cx = (i % cols) * fw, cy = Math.floor(i / cols) * fh; let low = -1;
    for (let y = fh - 1; y >= 0 && low < 0; y--) for (let x = 0; x < fw; x++) if (A(cx + x, cy + y) > 0) { low = y; break; }
    if (low < 0) empty++; else bottoms.push(low);
  }
  if (empty && !/death|fade|blink|despawn/.test(a.action || a.id)) add('needs-redo', 'frames', empty + ' of ' + n + ' frames are empty');
  if (a.anchor && bottoms.length && !tile && !/fly|float|hover|bat|glider|jelly|moth|projectile|bolt|fx|effect|icon|saddle|\bui\b|overlay/i.test((a.category || '') + ' ' + a.id)) {
    const base = bottoms[0], off = base - a.anchor.y;
    if (Math.abs(off) > fh / 8) add('needs-redo', 'anchor', 'lowest opaque row ' + base + ' vs anchor.y ' + a.anchor.y + ' (' + (off > 0 ? 'below' : 'above') + ' by ' + Math.abs(off) + ' px)');
    else if (Math.abs(off) > fh / 16) add('nit', 'anchor', 'lowest opaque row ' + base + ' vs anchor.y ' + a.anchor.y);
    if (/idle|move|walk|run/.test(a.action || '')) {
      const spread = Math.max.apply(null, bottoms) - Math.min.apply(null, bottoms);
      if (spread > fh / 16) add('nit', 'drift', 'baseline moves ' + spread + ' px across frames');
    }
  }
  // palette: distinct opaque colours and soft-alpha share
  const cols2 = new Set(); let soft = 0, opaque = 0;
  for (let q = 0; q < px.length; q += 4) {
    const al = px[q + 3]; if (!al) continue; opaque++;
    if (al < 250) soft++; if (cols2.size < 4096) cols2.add((px[q] << 16) | (px[q + 1] << 8) | px[q + 2]);
  }
  const softPct = opaque ? soft / opaque : 0;
  if (!tile && softPct > 0.08) add('needs-redo', 'palette', Math.round(softPct * 100) + '% soft-alpha pixels (blurred / anti-aliased edges)');
  else if (!tile && softPct > 0.02) add('nit', 'palette', Math.round(softPct * 100) + '% soft-alpha pixels');
  if (cols2.size > 96) add('nit', 'palette', cols2.size + ' distinct colours (pixel-art budget is ~32-48)');
  // 8-bit look heuristics on frame 0 of sprites (art-audit-4): dark rim, value contrast, smiley mascot face
  if (!tile && bottoms.length) {
    const look = lookCell(px, img.w, 0, 0, Math.min(fw, img.w), Math.min(fh, img.h), fw >= 128 && fw % 4 === 0 && fh % 4 === 0 ? 4 : 1);
    // monsters and wildlife only (ART rules: no smiley / mascot faces on monsters or wildlife); heroes and NPCs may smile
    const creature = !!(a.creature || a.enemy || a.boss) || /creature|enemy|boss|mob/i.test(a.category || '');
    if (look && look.opaque >= 24) {
      if (look.rimDark < 0.5 && !/fx|effect|projectile|bolt|spark|glow|ui_|icon|saddle|overlay|shadow/i.test((a.category || '') + ' ' + a.id))
        add('nit', 'outline', Math.round(look.rimDark * 100) + '% of the silhouette edge is a dark rim (want a 1 px colour-matched dark outline)');
      const fxui = /fx|effect|projectile|bolt|spark|glow|ui_|icon|overlay|shadow/i.test((a.category || '') + ' ' + a.id);
      if (fxui) { /* effects and UI glyphs are flat on purpose */ } else if (look.range < 0.22) add('nit', 'contrast', 'value range ' + look.range.toFixed(2) + ' (p5-p95 luma): flat fill, want a 3-4 tone ramp');
      else if (look.vsBg < 0.05 && look.vsGrey < 0.12) add('nit', 'contrast', 'mean luma sits on both the 8-bit page bg #12142a and mid grey: silhouette vanishes');
      if (creature && (a.dir === 'down' || /_down$/.test(a.id)) && look.smiley) add('nit', 'face', 'smiley mascot face (2 symmetric eye dots + upturned mouth): ' + look.smiley);
    }
  }
  // never referenced: id literal, or (batch folder + creature / enemy / class / kind) in code
  const dir = path.basename(b.path), who = a.creature || a.enemy || a.class || a.terrain || a.kind || a.item || '';
  // mm-art loads every INDEX.json batch at runtime and looks strips up by name, so a batch folder need not appear in code: an asset
  // counts as used when its id, its creature / enemy / class name, or an id prefix (the id minus 1-2 trailing _parts) is in the code
  const segs = a.id.split('_'), pre = [segs.slice(0, -1).join('_'), segs.slice(0, -2).join('_')].filter((x) => x.length >= 6);
  const ref = CODE.indexOf(a.id) >= 0 || CODE.indexOf(path.basename(a.path || '', '.png')) >= 0 || (who && who.length >= 3 && CODE.indexOf(who) >= 0)
    || pre.some((x) => CODE.indexOf(x) >= 0) || CODE.indexOf("'" + segs[0] + "_'") >= 0 || (CODE.indexOf(dir) >= 0 && !who);
  if (!ref) add('nit', 'unref', 'registered but not referenced by game code');
  return probs;
}

function run() {
  const idx = JSON.parse(fs.readFileSync(INDEX, 'utf8')), CODE = corpus(), seen = {}, rows = [], batches = [];
  idx.batches.forEach((b) => {
    const mp = path.join(GAME, b.manifest); let man;
    if (!fs.existsSync(mp)) { rows.push({ batch: b.id, id: '(manifest)', sev: 'blocker', kind: 'missing', msg: 'manifest not found' }); return; }
    try { man = JSON.parse(fs.readFileSync(mp, 'utf8')); } catch (e) { rows.push({ batch: b.id, id: '(manifest)', sev: 'blocker', kind: 'missing', msg: 'manifest bad json' }); return; }
    const assets = man.assets || [];
    const dirRef = CODE.indexOf(path.basename(b.path)) >= 0;
    batches.push({ id: b.id, label: b.label, status: b.status, assets: assets.length, referenced: dirRef });
    if (b.files && Math.abs(b.files - assets.length) > 0 && b.files < assets.length) rows.push({ batch: b.id, id: '(index)', sev: 'nit', kind: 'count', msg: 'INDEX files ' + b.files + ' < manifest assets ' + assets.length });
    assets.forEach((a) => {
      const file = path.join(GAME, b.path, a.path || (a.id + '.png'));
      auditAsset(b, man, a, file, CODE, seen).forEach((p) => rows.push(Object.assign({ batch: b.id, id: a.id }, p)));
    });
  });
  return { rows, batches };
}

if (require.main === module) {
  const { rows, batches } = run();
  const by = (s) => rows.filter((r) => r.sev === s);
  const kinds = {}; rows.forEach((r) => { const k = r.sev + ':' + r.kind; kinds[k] = (kinds[k] || 0) + 1; });
  console.log('art-audit: ' + batches.length + ' batches, ' + batches.reduce((s, b) => s + b.assets, 0) + ' assets; blocker ' + by('blocker').length + ', needs-redo ' + by('needs-redo').length + ', nit ' + by('nit').length);
  console.log(JSON.stringify(kinds));
  console.log('batches loaded only through INDEX.json (MMArt.loadAll; no folder literal in code, informational): ' + batches.filter((b) => !b.referenced).map((b) => b.id + ' ' + b.label).join(', '));
  ['blocker', 'needs-redo'].forEach((s) => by(s).forEach((r) => console.log(s.padEnd(10) + ' ' + r.batch.padEnd(6) + ' ' + r.id + ' [' + r.kind + '] ' + r.msg)));
  const j = process.argv.indexOf('--json'); if (j > 0) fs.writeFileSync(process.argv[j + 1], JSON.stringify({ rows, batches }, null, 1));
}
module.exports = { decodePng, run, lookCell };
