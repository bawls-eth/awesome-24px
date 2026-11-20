#!/usr/bin/env python3
"""Raw magenta-background action sheet -> game-ready strips + manifest entries.

Steps (all deterministic, code only):
  1. chroma-key #FF00FF (distance threshold; leftover pink fringe is removed after the pixel snap)
  2. frame detection by CONNECTED COMPONENTS (downscaled mask, dilated so a detached weapon tip joins its body);
     small fragments join the nearest big component; no fixed grid offsets are used
  3. components -> rows (by centroid y) -> columns (by centroid x): rows = down, up, right; columns = frames
  4. ONE scale factor per sheet row (= per view): standing_h / median height of the spec's standing reference frames.
     Never per frame, so a raised weapon or a crouch changes the figure's height naturally.
  5. feet on baseline y=231, feet-centre on x=128, box-downscale to the 64x64 logical grid, alpha 0/255, quantise to the class
     palette (spec palette), dark outline on the silhouette edge, stray specks removed, upscale x4 nearest-neighbour
  6. 12 px margin check, strips, manifest entries with anchor and computed muzzle (attack/cast)

CLI:  process.py sheet --raw raw.png --spec rogue --action walk --out outdir [--label x]
"""
import argparse
import json
import math
import os
import sys

import numpy as np
from PIL import Image

import common
from spec_lib import DIRS, load_spec

OUTLINE_LUMA = 90


def hex2rgb(h):
    h = h.lstrip('#')
    return tuple(int(h[i:i + 2], 16) for i in (0, 2, 4))


# ----------------------------------------------------------------------------- keying
def background_mask(rgb, cfg):
    mg = np.array(hex2rgb(cfg['key']['magenta']), dtype=np.float32)
    d = np.sqrt(((rgb.astype(np.float32) - mg) ** 2).sum(axis=2))
    return d < cfg['key']['dist']


# ----------------------------------------------------------------------------- components
def _dilate(m, r):
    out = m.copy()
    h, w = m.shape
    p = np.pad(m, r)
    for dy in range(-r, r + 1):
        for dx in range(-r, r + 1):
            if dy * dy + dx * dx <= r * r + 1:
                out |= p[r + dy:r + dy + h, r + dx:r + dx + w]
    return out


def _label(m):
    """4-connected labelling (iterative flood fill). Returns (labels int32, count)."""
    h, w = m.shape
    lab = np.zeros((h, w), dtype=np.int32)
    flat = m.ravel()
    labf = lab.ravel()
    n = 0
    for start in np.flatnonzero(flat):
        if labf[start]:
            continue
        n += 1
        stack = [start]
        labf[start] = n
        while stack:
            p = stack.pop()
            y, x = divmod(p, w)
            for q, ok in ((p - w, y > 0), (p + w, y < h - 1), (p - 1, x > 0), (p + 1, x < w - 1)):
                if ok and flat[q] and not labf[q]:
                    labf[q] = n
                    stack.append(q)
    return lab, n


def find_components(fg, cfg, expected):
    """Return list of boolean full-res masks (one per frame, unordered) or raise ValueError with a clear message."""
    D = 4
    H, W = fg.shape
    H4, W4 = H - H % D, W - W % D
    f = fg[:H4, :W4]
    low = f.reshape(H4 // D, D, W4 // D, D).any(axis=(1, 3))
    r = max(1, int(math.ceil(cfg['key']['merge_radius_px'] / float(D))))
    lab, n = _label(_dilate(low, r))
    up = np.repeat(np.repeat(lab, D, axis=0), D, axis=1)
    areas = np.bincount(up[f], minlength=n + 1)
    areas[0] = 0
    if n == 0 or areas.max() == 0:
        raise ValueError('no figures found (sheet is empty or all background)')
    big_thr = cfg['key']['min_component_frac'] * areas.max()
    big = [k for k in range(1, n + 1) if areas[k] >= big_thr]
    info = {}
    for k in range(1, n + 1):
        ys, xs = np.where((up == k) & f)
        if len(ys):
            info[k] = (xs.min(), ys.min(), xs.max(), ys.max())

    def gap(a, b):
        ax0, ay0, ax1, ay1 = info[a]
        bx0, by0, bx1, by1 = info[b]
        dx = max(0, max(ax0, bx0) - min(ax1, bx1))
        dy = max(0, max(ay0, by0) - min(ay1, by1))
        return math.hypot(dx, dy)

    groups = {k: [k] for k in big}
    dropped = 0
    for k in info:
        if k in groups:
            continue
        near = min(big, key=lambda b: gap(k, b))
        if gap(k, near) <= 40:
            groups[near].append(k)
        else:
            dropped += 1  # isolated speck far from every figure: noise
    # too many pieces: merge the closest pair while the gap is small
    while len(groups) > expected:
        keys = list(groups)
        best = None
        for i in range(len(keys)):
            for j in range(i + 1, len(keys)):
                g = min(gap(a, b) for a in groups[keys[i]] for b in groups[keys[j]])
                if best is None or g < best[0]:
                    best = (g, keys[i], keys[j])
        if best[0] > 60:
            raise ValueError('found %d figures, expected %d (extra pieces are far apart: stray art or a duplicated figure)' % (len(groups), expected))
        groups[best[1]] += groups.pop(best[2])
    if len(groups) < expected:
        raise ValueError('found %d figures, expected %d (figures touching, or a frame is missing)' % (len(groups), expected))
    masks = []
    for ks in groups.values():
        masks.append(np.isin(up, ks) & f)
    return masks


def order_frames(masks, rows, cols):
    """masks -> {row: [mask, ...]} sorted left to right; rows ordered top to bottom."""
    stats = []
    for m in masks:
        ys, xs = np.where(m)
        stats.append((ys.mean(), xs.mean(), m))
    stats.sort(key=lambda s: s[0])
    out = []
    for r in range(rows):
        chunk = sorted(stats[r * cols:(r + 1) * cols], key=lambda s: s[1])
        out.append([c[2] for c in chunk])
    return out


# ----------------------------------------------------------------------------- frame rendering
def resize_premult(arr, new_w, new_h):
    """arr: float32 HxWx4 (rgb 0-255, a 0-1) -> premultiplied BOX resize."""
    pm = arr.copy()
    pm[..., :3] *= pm[..., 3:4]
    chans = []
    for c in range(4):
        im = Image.fromarray(pm[..., c].astype(np.float32), 'F')
        chans.append(np.asarray(im.resize((new_w, new_h), Image.BOX), dtype=np.float32))
    out = np.stack(chans, axis=2)
    a = out[..., 3:4]
    with np.errstate(invalid='ignore', divide='ignore'):
        out[..., :3] = np.where(a > 1e-6, out[..., :3] / np.maximum(a, 1e-6), 0)
    return out


def crop_frame(rgb, mask):
    ys, xs = np.where(mask)
    y0, y1, x0, x1 = ys.min(), ys.max() + 1, xs.min(), xs.max() + 1
    arr = np.zeros((y1 - y0, x1 - x0, 4), dtype=np.float32)
    arr[..., :3] = rgb[y0:y1, x0:x1]
    arr[..., 3] = mask[y0:y1, x0:x1]
    return arr


def feet_centre_x(arr):
    a = arr[..., 3] > 0.5
    ys = np.where(a.any(axis=1))[0]
    top, bot = ys.min(), ys.max()
    band = max(2, int((bot - top + 1) * 0.12))
    xs = np.where(a[bot - band + 1:bot + 1].any(axis=0))[0]
    return float((xs.min() + xs.max()) / 2.0)


def quantise(rgb, pal):
    """nearest palette colour (weighted RGB). rgb HxWx3, pal Nx3 -> index HxW."""
    w = np.array([2.0, 4.0, 3.0], dtype=np.float32)
    d = (((rgb[:, :, None, :].astype(np.float32) - pal[None, None, :, :]) ** 2) * w).sum(axis=3)
    return d.argmin(axis=2)


def snap_frame(arr_scaled, feet_x, pal, cfg, outline_rgb, keep_rgbs=()):
    """Place a scaled frame on a 256 cell (feet on baseline, feet centre on anchor x), snap to the logical grid.
    Returns (cell RGBA uint8 256x256, flags list)."""
    fr = cfg['frame']
    cell, blk, logical = fr['cell'], fr['block'], fr['logical']
    h, w = arr_scaled.shape[:2]
    canvas = np.zeros((cell, cell, 4), dtype=np.float32)
    x0 = int(round(fr['anchor_x'] - feet_x))
    y0 = (fr['baseline_y'] + 1) - h
    flags = []
    sx0, sy0 = max(0, -x0), max(0, -y0)
    dx0, dy0 = max(0, x0), max(0, y0)
    cw, ch = min(w - sx0, cell - dx0), min(h - sy0, cell - dy0)
    if cw <= 0 or ch <= 0:
        return np.zeros((cell, cell, 4), np.uint8), ['frame fell outside the cell']
    if sx0 or sy0 or cw < w - sx0 or ch < h - sy0:
        flags.append('clipped by the cell')
    pm = arr_scaled[sy0:sy0 + ch, sx0:sx0 + cw].copy()
    pm[..., :3] *= pm[..., 3:4]
    canvas[dy0:dy0 + ch, dx0:dx0 + cw] = pm
    # block average (premultiplied) -> logical grid
    low = canvas.reshape(logical, blk, logical, blk, 4).mean(axis=(1, 3))
    a = low[..., 3]
    opaque = a >= 0.5
    col = np.where(a[..., None] > 1e-6, low[..., :3] / np.maximum(a[..., None], 1e-6), 0)
    # pink fringe: opaque pixels that are close to magenta and far from every palette colour
    mg = np.array(hex2rgb(cfg['key']['magenta']), dtype=np.float32)
    dmg = np.sqrt(((col - mg) ** 2).sum(axis=2))
    dpal = np.sqrt(((col[:, :, None, :] - pal[None, None, :, :]) ** 2).sum(axis=3)).min(axis=2)
    opaque &= ~((dmg < cfg['key']['fringe_dist']) & (dpal > 45))
    idx = quantise(col, pal)
    q = pal[idx].astype(np.uint8)
    # drop specks of <=3 logical pixels that are not part of the main body (8-neighbour components)
    lab, n = _label8(opaque)
    if n > 1:
        sizes = np.bincount(lab.ravel())[1:]
        keep = np.zeros(n + 1, bool)
        for k in range(1, n + 1):
            keep[k] = sizes[k - 1] > 3 or sizes[k - 1] == sizes.max()
        opaque &= keep[lab]
    # dark outline on the silhouette edge
    p = np.pad(opaque, 1)
    edge = opaque & ~(p[:-2, 1:-1] & p[2:, 1:-1] & p[1:-1, :-2] & p[1:-1, 2:])
    luma = 0.3 * q[..., 0] + 0.59 * q[..., 1] + 0.11 * q[..., 2]
    fix = edge & (luma > OUTLINE_LUMA)
    for kc in keep_rgbs:  # weapon colours are never recoloured (the muzzle is read from them)
        fix &= ~((q[..., 0] == kc[0]) & (q[..., 1] == kc[1]) & (q[..., 2] == kc[2]))
    q[fix] = np.array(outline_rgb, np.uint8)
    out = np.zeros((logical, logical, 4), np.uint8)
    out[..., :3] = q
    out[..., 3] = np.where(opaque, 255, 0)
    out[~opaque, :3] = 0
    big = np.repeat(np.repeat(out, blk, axis=0), blk, axis=1)
    return big, flags


def _label8(m):
    h, w = m.shape
    lab = np.zeros((h, w), np.int32)
    n = 0
    for sy, sx in zip(*np.nonzero(m)):
        if lab[sy, sx]:
            continue
        n += 1
        st = [(sy, sx)]
        lab[sy, sx] = n
        while st:
            y, x = st.pop()
            for dy in (-1, 0, 1):
                for dx in (-1, 0, 1):
                    yy, xx = y + dy, x + dx
                    if 0 <= yy < h and 0 <= xx < w and m[yy, xx] and not lab[yy, xx]:
                        lab[yy, xx] = n
                        st.append((yy, xx))
    return lab, n


def margin_shift(cell, cfg):
    """Shift horizontally by whole logical pixels so the figure respects the margin if possible. Returns (cell, issues)."""
    m, blk, W = cfg['frame']['margin'], cfg['frame']['block'], cfg['frame']['cell']
    ys, xs = np.where(cell[..., 3] > 0)
    issues = []
    if len(xs) == 0:
        return cell, ['empty frame']
    sh = 0
    if xs.min() < m:
        sh = int(math.ceil((m - xs.min()) / float(blk))) * blk
    elif xs.max() > W - 1 - m:
        sh = -int(math.ceil((xs.max() - (W - 1 - m)) / float(blk))) * blk
    if sh:
        cell = np.roll(cell, sh, axis=1)
        ys, xs = np.where(cell[..., 3] > 0)
        issues.append('shifted %d px sideways for the margin' % sh)
    if xs.min() < m or xs.max() > W - 1 - m or ys.min() < m:
        issues.append('MARGIN: figure within %d px of the cell edge (needs a redraw or smaller scale)' % m)
    return cell, issues


# ----------------------------------------------------------------------------- muzzle
def compute_muzzle(cell, region_rgbs, cfg):
    """Extreme pixel of the weapon region: the weapon-coloured pixel farthest from the torso point. Falls back to the
    silhouette pixel farthest from the torso point when no weapon-coloured pixel exists. Returns ({x,y}, used_fallback)."""
    fr = cfg['frame']
    alpha = cell[..., 3] > 0
    reg = np.zeros(alpha.shape, bool)
    for c in region_rgbs:
        reg |= (cell[..., 0] == c[0]) & (cell[..., 1] == c[1]) & (cell[..., 2] == c[2])
    reg &= alpha
    fallback = False
    if not reg.any():
        reg, fallback = alpha, True
    ys, xs = np.where(reg)
    tx, ty = fr['anchor_x'], fr['baseline_y'] - int(0.45 * fr['standing_h'])
    d = (xs - tx) ** 2 + (ys - ty) ** 2
    i = int(np.argmax(d))
    blk = fr['block']
    return {'x': int(xs[i] // blk * blk + blk // 2), 'y': int(ys[i] // blk * blk + blk // 2)}, fallback


# ----------------------------------------------------------------------------- sheet
def class_palette(spec):
    cols = sorted(set(v.lower() for v in spec['palette'].values()))
    return np.array([hex2rgb(c) for c in cols], dtype=np.float32), cols


def process_sheet(raw_path, spec, action, cfg, out_dir, source='gpt-image-1.5'):
    """Process one raw action sheet. Writes strips under out_dir/characters/<class>/. Returns dict with entries + issues."""
    act = spec['actions'][action]
    n = act['frames']
    img = Image.open(raw_path).convert('RGB')
    rgb = np.asarray(img)
    fg = ~background_mask(rgb, cfg)
    masks = find_components(fg, cfg, n * len(DIRS))
    grid = order_frames(masks, len(DIRS), n)
    pal, pal_hex = class_palette(spec)
    outline = hex2rgb(spec['palette'].get('outline', '#080706'))
    fr = cfg['frame']
    region = [hex2rgb(h) for h in spec['weapon']['region_hexes']]
    cid = spec['id']
    cdir = os.path.join(out_dir, 'characters', cid)
    os.makedirs(cdir, exist_ok=True)
    result = dict(entries=[], issues={}, scales={})
    for d, row in zip(DIRS, grid):
        crops = [crop_frame(rgb, m) for m in row]
        refs = [crops[i].shape[0] for i in act['ref_frames']]
        scale = fr['standing_h'] / float(np.median(refs))
        result['scales'][d] = round(scale, 5)
        cells, issues, muzzle = [], [], []
        for i, c in enumerate(crops):
            nw, nh = max(1, int(round(c.shape[1] * scale))), max(1, int(round(c.shape[0] * scale)))
            sc = resize_premult(c, nw, nh)
            cell, flags = snap_frame(sc, feet_centre_x(sc), pal, cfg, outline, region)
            cell, iss = margin_shift(cell, cfg)
            for t in flags + iss:
                issues.append('frame %d: %s' % (i + 1, t))
            cells.append(cell)
            if action in ('attack', 'cast') and i in act.get('weapon_frames', range(n)):
                mz, fb = compute_muzzle(cell, region, cfg)
                muzzle.append(mz)
                if fb:
                    issues.append('frame %d: no weapon-coloured pixels, muzzle is the silhouette extreme' % (i + 1))
        strip = np.concatenate(cells, axis=1)
        sid = '%s_%s_%s' % (cid, action, d)
        rel = 'characters/%s/%s.png' % (cid, sid)
        Image.fromarray(strip, 'RGBA').save(os.path.join(out_dir, rel))
        entry = {'id': sid, 'category': 'character', 'class': cid, 'action': action, 'dir': d, 'path': rel, 'frames': n,
                 'frame_w': fr['cell'], 'frame_h': fr['cell'], 'fps': act['fps'], 'loop': act['loop'],
                 'anchor': {'x': fr['anchor_x'], 'y': fr['baseline_y']}}
        if muzzle:
            entry['muzzle'] = muzzle
        entry['source'] = 'image_generated_%s' % source
        entry['scale_policy'] = 'fixed_per_row_standing_reference'
        result['entries'].append(entry)
        if issues:
            result['issues'][sid] = issues
    return result


# ----------------------------------------------------------------------------- validation (reuses ingest-art-zip.py)
def _load_ingest():
    import importlib.util
    p = os.path.join(common.ROOT, 'game', 'tools', 'ingest-art-zip.py')
    if not os.path.exists(p):
        return None
    spec = importlib.util.spec_from_file_location('ingest_art_zip', p)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


def validate_entries(base, entries, palette_hex):
    """Run the intake checks on each entry. Uses ingest-art-zip.check_asset when that file exists in the checkout,
    otherwise a local equivalent. Returns {blocking:{id:[..]}, warnings:{id:[..]}, standing:{..}, used:'ingest'|'local'}."""
    mod = _load_ingest()
    pal = set(hex2rgb(h) for h in palette_hex)
    rep = dict(blocking={}, warnings={}, standing={}, used='ingest' if mod else 'local')
    for a in entries:
        if mod:
            bl, wr, info = mod.check_asset(base, a, pal)
        else:
            bl, wr, info = _local_check(base, a, pal)
        if bl:
            rep['blocking'][a['id']] = bl
        if wr:
            rep['warnings'][a['id']] = wr
        if 'standing_h' in info:
            rep['standing'][a['class'] + '/' + a['dir']] = info['standing_h']
    return rep


def _local_check(base, a, palette):
    block, warn, info = [], [], {}
    path = os.path.join(base, a['path'])
    if not os.path.exists(path):
        return ['missing file ' + a['path']], warn, info
    arr = np.array(Image.open(path).convert('RGBA'))
    fw, fh, n = a['frame_w'], a['frame_h'], a['frames']
    if arr.shape[1] != n * fw or arr.shape[0] != fh:
        return ['size %s != %s' % (arr.shape[:2], (fh, n * fw))], warn, info
    if not set(np.unique(arr[..., 3]).tolist()) <= {0, 255}:
        block.append('semi-transparent pixels (alpha not 0/255)')
    h, w = arr.shape[:2]
    b = arr.reshape(h // 4, 4, w // 4, 4, 4).transpose(0, 2, 1, 3, 4).reshape(-1, 16, 4)
    op = (b[:, :, 3] > 0).any(axis=1)
    if op.any() and float((b == b[:, :1, :]).all(axis=(1, 2))[op].mean()) < 1.0:
        block.append('pixel grid not clean')
    px = arr[arr[..., 3] > 0][:, :3]
    if palette and len(px) and len(set(map(tuple, np.unique(px, axis=0))) - palette):
        warn.append('colors outside palette')
    heights = []
    for f in range(n):
        fr = arr[:, f * fw:(f + 1) * fw]
        ys, xs = np.where(fr[..., 3] > 0)
        if not len(ys):
            block.append('empty frame %d' % (f + 1))
            continue
        heights.append(int(ys.max() - ys.min() + 1))
        if xs.min() < 12 or ys.min() < 12 or xs.max() > fw - 13 or ys.max() > fh - 13:
            block.append('frame %d within 12 px of the cell edge' % (f + 1))
    if heights and a.get('action') == 'idle':
        info['standing_h'] = heights[0]
    return block, warn, info


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = ap.add_subparsers(dest='cmd')
    s = sub.add_parser('sheet')
    s.add_argument('--raw', required=True)
    s.add_argument('--spec', required=True)
    s.add_argument('--action', required=True)
    s.add_argument('--out', required=True)
    s.add_argument('--config')
    s.add_argument('--entries-json', help='also write the manifest entries here')
    v = sub.add_parser('verify', help='check processed strips: alpha 0/255, 4x4 grid, feet on y=231, margins, palette')
    v.add_argument('--base', required=True)
    v.add_argument('--entries', required=True)
    v.add_argument('--spec', required=True)
    a = ap.parse_args(argv)
    if a.cmd == 'verify':
        spec = load_spec(a.spec)
        entries = json.load(open(a.entries))
        rep = validate_entries(a.base, entries, set(h.lower() for h in spec['palette'].values()))
        extra = {}
        for e in entries:
            arr = np.array(Image.open(os.path.join(a.base, e['path'])).convert('RGBA'))
            bottoms = []
            for f in range(e['frames']):
                fr = arr[:, f * 256:(f + 1) * 256, 3] > 0
                bottoms.append(int(np.where(fr.any(axis=1))[0].max()))
            extra[e['id']] = {'bottoms': bottoms, 'size': [arr.shape[1], arr.shape[0]]}
        rep['strips'] = extra
        print(json.dumps(rep))
        return 0 if not rep['blocking'] else 2
    if a.cmd != 'sheet':
        ap.print_help()
        return 1
    cfg = common.load_config(a.config)
    r = process_sheet(a.raw, load_spec(a.spec), a.action, cfg, a.out)
    if a.entries_json:
        common.write_json(a.entries_json, r['entries'])
    print(json.dumps({'entries': [e['id'] for e in r['entries']], 'scales': r['scales'], 'issues': r['issues']}, indent=2))
    return 0


if __name__ == '__main__':
    sys.exit(main())
