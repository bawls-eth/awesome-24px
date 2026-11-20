#!/usr/bin/env python3
"""Deterministic, idempotent cleanup + reports for ARCANE hero strips (no network, no Firebase).

usage:
  art-cleanup.py clean   <batch-dir> [--dry]      remove slivers/specks/holes in place, write cleanup-log.json
  art-cleanup.py halo    <batch-dir>...           measure light-edge halo on up/right vs down strips (read only)
  art-cleanup.py weapon  <batch-dir> [--known-issues]   write weapon-visibility.json (read only on art)
  art-cleanup.py scales  <batch-dir>...           write game/assets/arcane/scales.json from validation-report.json

Work is done on the 4x4 "logical pixel" grid the art uses (cell 256, grid verified uniform), so every edit
keeps alpha at 0/255 and the grid clean. Components are 8-connected.

Sliver rule: in a frame, any component other than the largest that is at most SLIVER_MAX_W native px wide
and taller than SLIVER_MIN_H is removed. NOTE: the task said "narrower than ~6 px"; the b02 slivers are
4 or 8 px wide (1-2 logical pixels), so the limit is 8 (<= two logical pixels, i.e. < 9).
Speck rule: a non-largest component under 12 native px, or a single isolated logical pixel (16 px), is removed.
Hole rule: a transparent logical pixel whose four N/S/E/W neighbours are all opaque is filled with the most
common neighbour colour (darkest on ties, so the outline is never lightened). Repeated until stable.

Halo: edge cells = opaque logical pixels with a transparent 4-neighbour. halo_fraction = share of edge
cells with luma > 140. A halo is "measurable" only if up/right exceed the same class's down strips by
more than HALO_MARGIN (0.03) - otherwise the brightness is the art style, not a directional halo.

Weapon visibility (attack/cast frames): body = union of the class/dir idle frames dilated by 1 logical pixel.
outside = opaque cells of the frame not in body. accent = outside cells that are bright (luma>110) or
saturated (max-min channel > 80). A weapon is "visible" when outside >= 10 cells and accent >= 5 cells.
"""
import json, os, sys, glob
import numpy as np
from PIL import Image

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
ARCANE = os.path.join(ROOT, 'game', 'assets', 'arcane')
CELL = 256
G = 4
SLIVER_MAX_W = 8
SLIVER_MIN_H = 80
SPECK_AREA = 12
HALO_MARGIN = 0.03


def components(mask):
    """8-connected labelling of a 2D bool array -> list of (cells list)."""
    h, w = mask.shape
    seen = np.zeros_like(mask, bool)
    out = []
    for y in range(h):
        for x in range(w):
            if mask[y, x] and not seen[y, x]:
                st = [(y, x)]; seen[y, x] = True; cells = []
                while st:
                    cy, cx = st.pop(); cells.append((cy, cx))
                    for dy in (-1, 0, 1):
                        for dx in (-1, 0, 1):
                            ny, nx = cy + dy, cx + dx
                            if 0 <= ny < h and 0 <= nx < w and mask[ny, nx] and not seen[ny, nx]:
                                seen[ny, nx] = True; st.append((ny, nx))
                out.append(cells)
    return out


def bbox(cells):
    ys = [c[0] for c in cells]; xs = [c[1] for c in cells]
    return min(xs), min(ys), max(xs) - min(xs) + 1, max(ys) - min(ys) + 1  # x,y,w,h in logical px


def find_slivers(mask):
    """-> (list of (kind, cells)) to delete for one logical-grid frame mask."""
    comps = components(mask)
    if len(comps) < 2:
        return []
    comps.sort(key=len, reverse=True)
    dele = []
    for cells in comps[1:]:
        _, _, w, h = bbox(cells)
        if w * G <= SLIVER_MAX_W and h * G > SLIVER_MIN_H:
            dele.append(('sliver', cells))
        elif len(cells) * G * G < SPECK_AREA or len(cells) == 1:
            dele.append(('speck', cells))
    return dele


def logical(arr):
    return arr[::G, ::G]


def grid_clean(arr):
    h, w = arr.shape[:2]
    b = arr.reshape(h // G, G, w // G, G, 4)
    return bool((b == b[:, :1, :, :1, :]).all())


def clean_frame(fr):
    """fr: (256,256,4) uint8 -> (new fr, removed list). Fixpoint of sliver/speck removal + hole filling."""
    lg = logical(fr).copy()
    removed = []
    for _ in range(6):
        changed = False
        mask = lg[..., 3] > 0
        for kind, cells in find_slivers(mask):
            x, y, w, h = bbox(cells)
            removed.append({'kind': kind, 'x': x * G, 'y': y * G, 'w': w * G, 'h': h * G, 'area': len(cells) * G * G})
            for cy, cx in cells:
                lg[cy, cx] = 0
            changed = True
        mask = lg[..., 3] > 0
        p = np.pad(mask, 1)
        holes = ~mask & p[:-2, 1:-1] & p[2:, 1:-1] & p[1:-1, :-2] & p[1:-1, 2:]
        ys, xs = np.where(holes)
        for y, x in zip(ys, xs):
            nb = [lg[y - 1, x], lg[y + 1, x], lg[y, x - 1], lg[y, x + 1]] if 0 < y < lg.shape[0] - 1 and 0 < x < lg.shape[1] - 1 else []
            if len(nb) < 4:
                continue
            keys = [tuple(int(v) for v in c) for c in nb]
            best = max(set(keys), key=lambda k: (keys.count(k), -sum(k[:3])))
            lg[y, x] = best
            removed.append({'kind': 'hole', 'x': int(x) * G, 'y': int(y) * G, 'w': G, 'h': G, 'area': G * G})
            changed = True
        if not changed:
            break
    out = np.repeat(np.repeat(lg, G, 0), G, 1)
    return out, removed


def strips(base):
    return sorted(glob.glob(os.path.join(base, 'characters', '*', '*.png')))


def cmd_clean(base, dry):
    log = {}
    for f in strips(base):
        im = np.array(Image.open(f).convert('RGBA'))
        n = im.shape[1] // CELL
        new = im.copy(); rem = []
        if not grid_clean(im):
            print('skip (grid not clean):', f); continue
        for i in range(n):
            fr = im[:, i * CELL:(i + 1) * CELL]
            out, r = clean_frame(fr)
            if r:
                new[:, i * CELL:(i + 1) * CELL] = out
                rem += [dict(frame=i, **x) for x in r]
        if rem:
            log[os.path.splitext(os.path.basename(f))[0]] = rem
            if not dry:
                Image.fromarray(new).save(f, optimize=True)
    lp = os.path.join(base, 'cleanup-log.json')
    tot = {}
    for v in log.values():
        for x in v:
            tot[x['kind']] = tot.get(x['kind'], 0) + 1
    print('removed:', tot, '| strips changed:', len(log))
    if log and not dry:  # idempotent: a clean re-run keeps the original log
        json.dump({'tool': 'game/tools/art-cleanup.py', 'summary': tot, 'strips_changed': sorted(log),
                   'removed': log}, open(lp, 'w'), separators=(',', ':'))
        open(lp, 'a').write('\n')
    return tot, log


def edge_luma(lg):
    op = lg[..., 3] > 0
    p = np.pad(op, 1)
    nb = p[:-2, 1:-1] & p[2:, 1:-1] & p[1:-1, :-2] & p[1:-1, 2:]
    e = op & ~nb
    luma = 0.299 * lg[..., 0] + 0.587 * lg[..., 1] + 0.114 * lg[..., 2]
    return luma[e]


def cmd_halo(bases):
    res = {}
    for base in bases:
        acc = {}
        for f in strips(base):
            name = os.path.basename(f)[:-4]
            cls, d = name.split('_')[0], name.split('_')[-1]
            v = edge_luma(logical(np.array(Image.open(f).convert('RGBA'))))
            acc.setdefault((cls, d), []).append(v)
        out = {}
        for cls in sorted({k[0] for k in acc}):
            fr = {d: float((np.concatenate(acc[(cls, d)]) > 140).mean()) for d in ('down', 'up', 'right') if (cls, d) in acc}
            ex = max(fr.get('up', 0), fr.get('right', 0)) - fr.get('down', 0)
            out[cls] = {'halo_fraction': {k: round(v, 3) for k, v in fr.items()}, 'excess_vs_down': round(ex, 3), 'measurable': ex > HALO_MARGIN}
        res[os.path.basename(base)] = out
        print(os.path.basename(base), json.dumps(out))
    return res


def weapon_report(base):
    per = {}
    byk = {}
    for f in strips(base):
        name = os.path.basename(f)[:-4]
        byk[name] = np.array(Image.open(f).convert('RGBA'))
    for name, im in sorted(byk.items()):
        cls, act, d = name.split('_')
        if act not in ('attack', 'cast'):
            continue
        idle = byk.get('%s_idle_%s' % (cls, d))
        body = np.zeros((CELL // G, CELL // G), bool)
        if idle is not None:
            for i in range(idle.shape[1] // CELL):
                body |= logical(idle[:, i * CELL:(i + 1) * CELL])[..., 3] > 0
        p = np.pad(body, 1)
        body = body | p[:-2, 1:-1] | p[2:, 1:-1] | p[1:-1, :-2] | p[1:-1, 2:] | p[:-2, :-2] | p[2:, 2:] | p[:-2, 2:] | p[2:, :-2]
        frames = []
        for i in range(im.shape[1] // CELL):
            lg = logical(im[:, i * CELL:(i + 1) * CELL]).astype(int)
            out = (lg[..., 3] > 0) & ~body
            luma = 0.299 * lg[..., 0] + 0.587 * lg[..., 1] + 0.114 * lg[..., 2]
            sat = lg[..., :3].max(-1) - lg[..., :3].min(-1)
            acc = out & ((luma > 110) | (sat > 80))
            frames.append({'frame': i, 'outside_cells': int(out.sum()), 'accent_cells': int(acc.sum()),
                           'weapon_visible': bool(out.sum() >= 10 and acc.sum() >= 5)})
        per[name] = frames
    return per


def cmd_weapon(base, known):
    per = weapon_report(base)
    bn = os.path.basename(base)
    miss = {k: [f['frame'] for f in v if not f['weapon_visible']] for k, v in per.items()}
    miss = {k: v for k, v in miss.items() if v}
    rep = {'batch': bn, 'heuristic': 'see art-cleanup.py docstring: outside idle silhouette (dilated 1 logical px) '
           'and accent coloured (luma>110 or saturation>80); visible if outside>=10 and accent>=5 cells',
           'frames_total': sum(len(v) for v in per.values()),
           'frames_without_visible_weapon': sum(len(v) for v in miss.values()),
           'missing': miss, 'strips': per}
    json.dump(rep, open(os.path.join(base, 'weapon-visibility.json'), 'w'), indent=1)
    print(bn, 'attack/cast frames:', rep['frames_total'], 'no visible weapon:', rep['frames_without_visible_weapon'])
    if known:
        kp = os.path.join(base, 'known_issues.json')
        ki = json.load(open(kp))
        have = {k['id'] for k in ki}
        for name, frs in sorted(miss.items()):
            kid = '%s_%s_weapon_not_visible' % (bn.split('-')[0], name)
            if kid not in have:
                ki.append({'id': kid, 'what_is_wrong': 'Frames %s of %s show no weapon/accent region beyond the idle body silhouette '
                           '(heuristic in game/tools/art-cleanup.py, see weapon-visibility.json); the weapon may be unreadable there.' % (frs, name)})
        json.dump(ki, open(kp, 'w'), indent=2)
    return rep


def cmd_scales(bases):
    sp = os.path.join(ARCANE, 'scales.json')
    out = {'target_standing_height': 148, 'note': 'display_scale = 148 / standing_heights[class/view] from each validation-report.json',
           'scales': {}}
    for base in bases:
        rep = json.load(open(os.path.join(base, 'validation-report.json')))
        man = json.load(open(os.path.join(base, 'manifest.json')))
        for a in man['assets']:
            k = '%s/%s' % (a.get('class'), a.get('dir'))
            h = rep.get('standing_heights', {}).get(k)
            if h:
                out['scales'][a['id']] = {'display_scale': round(148.0 / h, 4)}
    json.dump(out, open(sp, 'w'), indent=1)
    print('scales.json entries:', len(out['scales']))


def main():
    a = [x for x in sys.argv[1:] if not x.startswith('--')]
    if len(a) < 2:
        print(__doc__); sys.exit(1)
    cmd, bases = a[0], [os.path.abspath(b) for b in a[1:]]
    if cmd == 'clean': cmd_clean(bases[0], '--dry' in sys.argv)
    elif cmd == 'halo': cmd_halo(bases)
    elif cmd == 'weapon': cmd_weapon(bases[0], '--known-issues' in sys.argv)
    elif cmd == 'scales': cmd_scales(bases)
    else: print(__doc__); sys.exit(1)


if __name__ == '__main__':
    main()
