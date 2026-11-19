#!/usr/bin/env python3
"""Validate an art ZIP from the owner's ChatGPT production run and file it into the repo.

usage:  venv/bin/python game/tools/ingest-art-zip.py <zip> <batch-id> <label> [--dry]
example: ingest-art-zip.py /path/arcane_b02.zip b02 rogue-warlock-paladin

What it does (no network, no Firebase):
  1. safe-extract the ZIP into a temp dir (refuses absolute or '..' paths)
  2. validate every manifest entry: file exists, strip size = frames*frame_w x frame_h, real alpha
     (0/255 only), 4x4 pixel grid (cells 256+), margins >= 12 px, palette, no empty frames,
     no identical adjacent idle/walk frames, standing height per class/view
  3. copy it to game/assets/arcane/<batch-id>-<label>/ (manifest, palette, readme, previews, PNGs)
     and write validation-report.json next to it
  4. update game/assets/arcane/INDEX.json (the list of batches the game loaders read)
Requires Pillow and numpy (use a venv: python3 -m venv venv && venv/bin/pip install pillow numpy).
Exit code 0 = filed (even with warnings); 2 = blocking problems (the batch is still filed
with status "needs-fix" so nothing is lost).
"""
import json, os, shutil, sys, tempfile, zipfile, datetime
import numpy as np
from PIL import Image

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
ARCANE = os.path.join(ROOT, 'game', 'assets', 'arcane')


def safe_extract(zpath, dest):
    z = zipfile.ZipFile(zpath)
    for n in z.namelist():
        if n.startswith('/') or '..' in n.split('/'):
            raise SystemExit('unsafe path in zip: ' + n)
    z.extractall(dest)


def load_palette(base):
    p = os.path.join(base, 'palette.json')
    if not os.path.exists(p):
        return None
    cols = json.load(open(p)).get('colors', [])
    return set(tuple(int(c[i:i + 2], 16) for i in (1, 3, 5)) for c in cols)


def check_asset(base, a, palette):
    """returns (blocking list, warning list, info dict)"""
    block, warn, info = [], [], {}
    path = os.path.join(base, a['path'])
    if not os.path.exists(path):
        return ['missing file ' + a['path']], warn, info
    im = Image.open(path).convert('RGBA')
    fw, fh, n = a['frame_w'], a['frame_h'], a['frames']
    if im.size != (n * fw, fh):
        block.append('size %s != %s' % (im.size, (n * fw, fh)))
        return block, warn, info
    arr = np.array(im)
    if not set(np.unique(arr[..., 3]).tolist()) <= {0, 255}:
        block.append('semi-transparent pixels (alpha not 0/255)')
    cat = a.get('category', '')
    big = fw >= 128
    if big:
        h, w = arr.shape[:2]
        b = arr.reshape(h // 4, 4, w // 4, 4, 4).transpose(0, 2, 1, 3, 4).reshape(-1, 16, 4)
        op = (b[:, :, 3] > 0).any(axis=1)
        uni = float((b == b[:, :1, :]).all(axis=(1, 2))[op].mean()) if op.any() else 1.0
        info['grid_uniform'] = round(uni, 4)
        if uni < 1.0:
            block.append('pixel grid not clean (%.3f of 4x4 blocks uniform)' % uni)
    if palette:
        px = arr[arr[..., 3] > 0][:, :3]
        off = len(set(map(tuple, np.unique(px, axis=0))) - palette) if len(px) else 0
        info['off_palette'] = off
        if off:
            warn.append('%d colors outside palette.json' % off)
    heights, edge, empty, diffs = [], 0, 0, []
    prev = None
    for f in range(n):
        fr = arr[:, f * fw:(f + 1) * fw]
        ys, xs = np.where(fr[..., 3] > 0)
        if len(ys) == 0:
            empty += 1
            prev = fr
            continue
        heights.append(int(ys.max() - ys.min() + 1))
        if big and (xs.min() < 12 or ys.min() < 12 or xs.max() > fw - 13 or ys.max() > fh - 13):
            edge += 1
        if prev is not None:
            diffs.append(int((np.abs(fr.astype(int) - prev.astype(int)).sum(axis=2) > 60).sum()))
        prev = fr
    if empty:
        block.append('%d empty frame(s)' % empty)
    if edge:
        block.append('%d frame(s) within 12 px of the cell edge' % edge)
    if a.get('action') in ('idle', 'walk', 'move') and diffs and min(diffs) == 0:
        warn.append('identical adjacent frames')
    if heights:
        info['h_min'], info['h_max'] = min(heights), max(heights)
        if a.get('action') == 'idle':
            info['standing_h'] = heights[0]
    return block, warn, info


def main():
    args = [x for x in sys.argv[1:] if not x.startswith('--')]
    dry = '--dry' in sys.argv
    if len(args) < 3:
        print(__doc__)
        sys.exit(1)
    zpath, batch, label = args[:3]
    tmp = tempfile.mkdtemp(prefix='ingest-')
    safe_extract(zpath, tmp)
    mpath = os.path.join(tmp, 'manifest.json')
    if not os.path.exists(mpath):
        raise SystemExit('manifest.json not at the ZIP root')
    m = json.load(open(mpath))
    palette = load_palette(tmp)
    assets = m['assets']
    ids = [a['id'] for a in assets]
    report = {'batch': batch, 'label': label, 'generated_utc': datetime.datetime.utcnow().isoformat() + 'Z',
              'files': len(assets), 'duplicate_ids': len(ids) - len(set(ids)), 'blocking': {}, 'warnings': {}, 'standing_heights': {}}
    for a in assets:
        if a['id'] != os.path.splitext(os.path.basename(a['path']))[0]:
            report['blocking'].setdefault(a['id'], []).append('id does not match filename')
        bl, wr, info = check_asset(tmp, a, palette)
        if bl:
            report['blocking'].setdefault(a['id'], []).extend(bl)
        if wr:
            report['warnings'].setdefault(a['id'], []).extend(wr)
        if 'standing_h' in info:
            report['standing_heights']['%s/%s' % (a.get('class') or a.get('enemy') or a.get('boss'), a.get('dir'))] = info['standing_h']
    if report['duplicate_ids']:
        report['blocking']['_manifest'] = ['duplicate ids']
    status = 'needs-fix' if report['blocking'] else 'provisional'
    report['status'] = status
    dest = os.path.join(ARCANE, '%s-%s' % (batch, label))
    print('files:', len(assets), '| blocking:', len(report['blocking']), '| warnings:', len(report['warnings']), '| status:', status)
    for k, v in list(report['blocking'].items())[:12]:
        print('  BLOCK', k, v)
    if dry:
        print('dry run: nothing written')
        shutil.rmtree(tmp)
        return
    if os.path.exists(dest):
        shutil.rmtree(dest)
    shutil.copytree(tmp, dest)
    json.dump(report, open(os.path.join(dest, 'validation-report.json'), 'w'), indent=2)
    ipath = os.path.join(ARCANE, 'INDEX.json')
    idx = json.load(open(ipath)) if os.path.exists(ipath) else {'batches': []}
    idx['batches'] = [b for b in idx['batches'] if b['id'] != batch]
    idx['batches'].append({'id': batch, 'label': label, 'path': 'assets/arcane/%s-%s' % (batch, label),
                           'manifest': 'assets/arcane/%s-%s/manifest.json' % (batch, label),
                           'files': len(assets), 'status': status, 'ingested_utc': report['generated_utc']})
    idx['batches'].sort(key=lambda b: b['id'])
    json.dump(idx, open(ipath, 'w'), indent=2)
    shutil.rmtree(tmp)
    print('filed to', dest)
    sys.exit(2 if report['blocking'] else 0)


if __name__ == '__main__':
    main()
