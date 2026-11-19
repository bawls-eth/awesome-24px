#!/usr/bin/env python3
"""Process raw magenta-background sprite sheets into game-ready transparent sheets.

Usage: python3 game/tools/art-process.py   (run from repo root)
Reads  game/assets/art/raw/<id>.png
Writes game/assets/art/sheets/<id>.png, game/assets/art/manifest.json,
       game/assets/art/preview-all.png
Generators return 16:9 images, so the raw grid (cols x rows) is divided equally,
each cell is keyed, cropped, scaled with ONE factor per sheet, centred and
anchored on the baseline row (y=BASE), then palette-reduced with a shared palette.
"""
import json, os, sys
import numpy as np
from PIL import Image, ImageDraw

ART = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'assets', 'art')
RAW, SHEETS = os.path.join(ART, 'raw'), os.path.join(ART, 'sheets')
BASE = 232

# id, category, name, cell size, cols, rows, rows spec [(action, frames, fps, loop)], anchor ('feet'|'center')
CHAR_WC = [('walk', 4, 8, True), ('cast', 4, 10, False)]
CHAR_WA = [('walk', 4, 8, True), ('attack', 4, 10, False)]
ASSETS = [
    dict(id='puffcap', category='enemy', name='puffcap', cell=256, cols=4, rows=2,
         spec=[('walk', 4, 8, True), ('attack', 3, 10, False), ('hurt', 1, 6, False)], anchor='feet'),
    dict(id='thorn_beetle', category='enemy', name='thorn_beetle', cell=256, cols=4, rows=2,
         spec=[('walk', 4, 8, True), ('attack', 3, 10, False), ('hurt', 1, 6, False)], anchor='feet'),
    dict(id='dusk_moth', category='enemy', name='dusk_moth', cell=256, cols=4, rows=2,
         spec=[('fly', 4, 8, True), ('attack', 3, 10, False), ('hurt', 1, 6, False)], anchor='center'),
    # ---- round 2 (OpenAI gpt-image-1.5, /v1/images/generations, loose magenta keying) ----
    dict(id='bramble_archer', category='enemy', name='bramble_archer', cell=256, cols=4, rows=2, loose=True,
         spec=[('walk', 4, 8, True), ('shoot', 3, 10, False), ('hurt', 1, 6, False)], anchor='feet'),
    # spec entries may carry a 5th item: the sprite name used for the manifest id / strip file
    dict(id='sprout', category='enemy', name='sprout', cell=256, cols=4, rows=2, loose=True,
         spec=[('walk', 4, 8, True, 'sprout'), ('walk', 4, 8, True, 'mini_sprout')], anchor='feet'),
    dict(id='queen_burrowmole', category='boss', name='queen_burrowmole', cell=256, cols=3, rows=2, loose=True,
         spec=[('calm_idle', 1, 4, True), ('shielded_idle', 1, 4, True), ('enraged_idle', 1, 4, True),
               ('calm_attack', 1, 6, False), ('shielded_attack', 1, 6, False), ('enraged_attack', 1, 6, False)], anchor='feet'),
    dict(id='ranger', category='class', name='ranger', cell=256, cols=4, rows=2, loose=True, spec=CHAR_WA, anchor='feet'),
    dict(id='frostcaller', category='class', name='frostcaller', cell=256, cols=4, rows=2, loose=True, spec=CHAR_WC, anchor='feet'),
    dict(id='herald', category='class', name='herald', cell=256, cols=4, rows=2, loose=True, spec=CHAR_WC, anchor='feet'),
    dict(id='grave_tender', category='class', name='grave_tender', cell=256, cols=4, rows=2, loose=True, spec=CHAR_WC, anchor='feet'),
    dict(id='trickster', category='class', name='trickster', cell=256, cols=4, rows=2, loose=True, spec=CHAR_WC, anchor='feet'),
    # icon sheets: each cell is fitted on its own (icon=True); <id>.png is the grid, <id>_icons.png a 1-row strip
    dict(id='items', category='item', name='items', cell=128, cols=4, rows=4, loose=True, icon=True,
         names=['spark_wand', 'quickfire_wand', 'hearty_charm', 'swift_charm', 'lucky_ring', 'scholar_ring', 'warding_ring', 'life_potion',
                'speed_potion', 'power_potion', 'wit_potion', 'guard_potion', 'key', 'chest_closed', 'chest_open', 'torch']),
    dict(id='loot_bags', category='item', name='loot_bags', cell=128, cols=4, rows=2, loose=True, icon=True, fit='bbox', count=7,
         names=['brown', 'pink', 'purple', 'blue', 'cyan', 'white', 'orange']),
    dict(id='lantern_props', category='prop', name='lantern_props', cell=192, cols=4, rows=2, loose=True, icon=True,
         names=['fountain', 'lantern_post', 'stash_chest', 'headstone', 'notice_board', 'signpost', 'portal_arch', 'campfire']),
    dict(id='fish_pond', category='fish', name='fish_pond', cell=128, cols=6, rows=4, loose=True, icon=True),
    dict(id='fish_sea', category='fish', name='fish_sea', cell=128, cols=6, rows=4, loose=True, icon=True),
    dict(id='bugs', category='bug', name='bugs', cell=128, cols=6, rows=5, loose=True, icon=True),
]


def flood_from_border(loose):
    """pixels of `loose` connected (4-neighbourhood) to the image border."""
    m = np.zeros_like(loose)
    m[0, :], m[-1, :], m[:, 0], m[:, -1] = loose[0, :], loose[-1, :], loose[:, 0], loose[:, -1]
    while True:
        p = np.pad(m, 1)
        grown = loose & (m | p[:-2, 1:-1] | p[2:, 1:-1] | p[1:-1, :-2] | p[1:-1, 2:])
        if grown.sum() == m.sum():
            return m
        m = grown


def key_magenta(im, loose=False):
    a = np.asarray(im.convert('RGB')).astype(int)
    r, g, b = a[..., 0], a[..., 1], a[..., 2]
    mag = (r > 140) & (b > 140) & (g < 120) & (abs(r - b) < 70) & ((r - g) > 80) & ((b - g) > 80)
    if loose:
        # generators drift to hot pink / dark magenta with soft vignettes: accept any strongly pink-magenta
        # pixel, but only where it is connected to the border so interior pinks (e.g. a pink bag) survive
        lm = (r > 90) & (g < 0.42 * r) & (b > 0.45 * r) & (b < 1.2 * r)
        mag = mag | flood_from_border(lm)
    opaque = ~mag
    # fringe cleanup: edge pixels with a magenta tint become transparent (two passes)
    for _ in range(2):
        pad = np.pad(opaque, 1, constant_values=False)
        nb = (~pad[:-2, 1:-1]) | (~pad[2:, 1:-1]) | (~pad[1:-1, :-2]) | (~pad[1:-1, 2:])
        tint = ((r - g) > 45) & ((b - g) > 45) & (r > 120) & (b > 120)
        opaque = opaque & ~(nb & tint)
    out = np.dstack([a.astype(np.uint8), (opaque * 255).astype(np.uint8)])
    return Image.fromarray(out, 'RGBA')


def runs(proj, minlen=6, thr=2):
    on = proj >= thr
    out, start = [], None
    for i, v in enumerate(list(on) + [False]):
        if v and start is None:
            start = i
        elif not v and start is not None:
            out.append([start, i])
            start = None
    return [r for r in out if r[1] - r[0] >= minlen]


def merge_to(rs, n):
    """merge the closest neighbouring runs until exactly n remain (None if fewer than n)."""
    rs = [list(r) for r in rs]
    if len(rs) < n:
        return None
    while len(rs) > n:
        i = min(range(len(rs) - 1), key=lambda j: rs[j + 1][0] - rs[j][1])
        rs[i][1] = rs[i + 1][1]
        del rs[i + 1]
    return rs


def layout(keyed, cols, rows):
    """Content-based grid: generators do not fill the canvas evenly, so find the row bands and, inside each
    band, the column runs from the alpha projections. Falls back to an equal grid over the content bbox."""
    A = np.asarray(keyed.getchannel('A')) > 0
    bands = merge_to(runs(A.sum(1)), rows)
    boxes = []
    if bands:
        for y0, y1 in bands:
            cs = merge_to(runs(A[y0:y1].sum(0)), cols)
            if cs is None:
                boxes = None
                break
            boxes += [(c0, y0, c1, y1) for c0, c1 in cs]
        if boxes is not None:
            return boxes, True
    bb = keyed.getchannel('A').point(lambda v: 255 if v > 0 else 0).getbbox()
    cw, ch = (bb[2] - bb[0]) / cols, (bb[3] - bb[1]) / rows
    return [(round(bb[0] + c * cw), round(bb[1] + r * ch), round(bb[0] + (c + 1) * cw), round(bb[1] + (r + 1) * ch))
            for r in range(rows) for c in range(cols)], False


def process(asset):
    src = os.path.join(RAW, asset['id'] + '.png')
    if not os.path.exists(src):
        return None
    im = Image.open(src)
    W, H = im.size
    cell = asset['cell']
    keyed = key_magenta(im, asset.get('loose', False))
    if asset.get('loose'):
        boxes, ok = layout(keyed, asset['cols'], asset['rows'])
    else:  # round 1: equal cells over the full 1280x720 image
        cw, ch = W / asset['cols'], H / asset['rows']
        boxes = [(round(c * cw), round(r * ch), round((c + 1) * cw), round((r + 1) * ch))
                 for r in range(asset['rows']) for c in range(asset['cols'])]
        ok = True
    if not ok:
        print('  layout fallback (equal grid over content) for', asset['id'])
    crops = []
    for bx in boxes:
        c = keyed.crop(bx)
        bb = c.getchannel('A').point(lambda v: 255 if v else 0).getbbox()
        crops.append((c.crop(bb), bb) if bb else (None, None))
    ws = [c.width for c, _ in crops if c]
    hs = [c.height for c, _ in crops if c]
    margin = 12 if asset.get('icon') else 40
    k = min(1.0, (cell - margin) / max(ws), (cell - margin) / max(hs))
    frames = []
    for c, _ in crops:
        if c and asset.get('icon'):  # icons: fit every cell on its own, centred (upscale small ones too)
            k = min((cell - margin) / c.width, (cell - margin) / c.height)
        f = Image.new('RGBA', (cell, cell), (0, 0, 0, 0))
        if c:
            nw, nh = max(1, round(c.width * k)), max(1, round(c.height * k))
            s = c.resize((nw, nh), Image.LANCZOS if k < 1 else Image.NEAREST)
            al = np.asarray(s.getchannel('A')) >= 128
            s = Image.fromarray(np.dstack([np.asarray(s.convert('RGB')), (al * 255).astype(np.uint8)]), 'RGBA')
            x = (cell - nw) // 2
            anch = 'center' if asset.get('icon') else asset['anchor']
            y = BASE - nh if anch == 'feet' else (cell - nh) // 2
            y = max(2, min(y, cell - nh - 2)) if anch != 'feet' else max(2, y)
            f.alpha_composite(s, (x, y))
        frames.append(f)
    sheet = Image.new('RGBA', (cell * asset['cols'], cell * asset['rows']), (0, 0, 0, 0))
    for i, f in enumerate(frames):
        sheet.alpha_composite(f, ((i % asset['cols']) * cell, (i // asset['cols']) * cell))
    # shared 24-colour palette, no dithering, binary alpha
    arr = np.asarray(sheet)
    al = arr[..., 3] >= 128
    rgb = Image.fromarray(arr[..., :3].copy(), 'RGB')
    q = rgb.quantize(colors=asset.get('colors', 64 if asset.get('icon') else 24), method=Image.Quantize.MEDIANCUT, dither=Image.Dither.NONE).convert('RGB')
    qa = np.asarray(q)
    out = np.dstack([qa, (al * 255).astype(np.uint8)])
    out[~al] = 0
    final = Image.fromarray(out, 'RGBA')
    os.makedirs(SHEETS, exist_ok=True)
    final.save(os.path.join(SHEETS, asset['id'] + '.png'))
    def cellimg(i):
        return final.crop(((i % asset['cols']) * cell, (i // asset['cols']) * cell,
                           (i % asset['cols'] + 1) * cell, (i // asset['cols'] + 1) * cell))
    if asset.get('icon'):
        # non-empty cells in reading order -> one-row strip <id>_icons.png
        keep = [i for i in range(asset['cols'] * asset['rows']) if cellimg(i).getchannel('A').getbbox()]
        keep = keep[:asset.get('count', len(keep))]
        asset['n_icons'] = len(keep)
        strip = Image.new('RGBA', (cell * len(keep), cell), (0, 0, 0, 0))
        for j, i in enumerate(keep):
            strip.alpha_composite(cellimg(i), (j * cell, 0))
        strip.save(os.path.join(SHEETS, asset['id'] + '_icons.png'))
        return final
    # per-action strips (reference format: frames*cell by cell)
    idx = 0
    for entry in asset['spec']:
        action, n = entry[0], entry[1]
        nm = entry[4] if len(entry) > 4 else asset['id']
        strip = Image.new('RGBA', (cell * n, cell), (0, 0, 0, 0))
        for j in range(n):
            strip.alpha_composite(cellimg(idx + j), (j * cell, 0))
        strip.save(os.path.join(SHEETS, '%s_%s.png' % (nm, action)))
        idx += n
    return final


def main():
    manifest = {'name': 'Awesome 24px game art (generated)', 'license': 'generated, owned by project',
                'frame_size': 256, 'assets': []}
    done = []
    for a in ASSETS:
        sh = process(a)
        if sh is None:
            continue
        done.append((a, sh))
        cell = a['cell']
        if a.get('icon'):
            e = dict(id=a['id'] + '_icons', category=a['category'], name=a['name'], action='icons',
                     frame_w=cell, frame_h=cell, frames=a['n_icons'], fps=0, loop=False,
                     path='sheets/%s_icons.png' % a['id'])
            if a.get('names'):
                e['icons'] = a['names'][:a['n_icons']]
            manifest['assets'].append(e)
            continue
        # one manifest entry per action row-segment: frames are consecutive in reading order
        for entry in a['spec']:
            action, n, fps, loop = entry[:4]
            nm = entry[4] if len(entry) > 4 else a['name']
            manifest['assets'].append(dict(
                id='%s_%s' % (nm, action), category=a['category'], name=nm, action=action,
                frame_w=cell, frame_h=cell, frames=n, fps=fps, loop=loop,
                path='sheets/%s_%s.png' % (nm if len(entry) > 4 else a['id'], action)))
    with open(os.path.join(ART, 'manifest.json'), 'w') as fh:
        json.dump(manifest, fh, indent=2)
    # contact sheet
    pad, lab = 12, 18
    maxw = max(s.width * (2 if a.get('icon') else 1) for a, s in done) if done else 256
    toth = sum((s.height if a.get('icon') else s.height // 2) + lab + pad for a, s in done) + pad
    W = max(maxw // 2, 512) + pad * 2
    prev = Image.new('RGB', (W, max(toth, 64)), (28, 30, 40))
    d = ImageDraw.Draw(prev)
    y = pad
    for a, s in done:
        d.text((pad, y), a['id'], fill=(240, 230, 200))
        y += lab
        h = s if a.get('icon') else s.resize((s.width // 2, s.height // 2), Image.NEAREST)
        prev.paste(h, (pad, y), h)
        y += h.height + pad
    prev.save(os.path.join(ART, 'preview-all.png'))
    print('processed', [a['id'] for a, _ in done])


if __name__ == '__main__':
    sys.exit(main())
