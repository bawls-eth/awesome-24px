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
ASSETS = [
    dict(id='puffcap', category='enemy', name='puffcap', cell=256, cols=4, rows=2,
         spec=[('walk', 4, 8, True), ('attack', 3, 10, False), ('hurt', 1, 6, False)], anchor='feet'),
    dict(id='thorn_beetle', category='enemy', name='thorn_beetle', cell=256, cols=4, rows=2,
         spec=[('walk', 4, 8, True), ('attack', 3, 10, False), ('hurt', 1, 6, False)], anchor='feet'),
    dict(id='dusk_moth', category='enemy', name='dusk_moth', cell=256, cols=4, rows=2,
         spec=[('fly', 4, 8, True), ('attack', 3, 10, False), ('hurt', 1, 6, False)], anchor='center'),
]


def key_magenta(im):
    a = np.asarray(im.convert('RGB')).astype(int)
    r, g, b = a[..., 0], a[..., 1], a[..., 2]
    mag = (r > 140) & (b > 140) & (g < 120) & (abs(r - b) < 70) & ((r - g) > 80) & ((b - g) > 80)
    opaque = ~mag
    # fringe cleanup: edge pixels with a magenta tint become transparent (two passes)
    for _ in range(2):
        pad = np.pad(opaque, 1, constant_values=False)
        nb = (~pad[:-2, 1:-1]) | (~pad[2:, 1:-1]) | (~pad[1:-1, :-2]) | (~pad[1:-1, 2:])
        tint = ((r - g) > 45) & ((b - g) > 45) & (r > 120) & (b > 120)
        opaque = opaque & ~(nb & tint)
    out = np.dstack([a.astype(np.uint8), (opaque * 255).astype(np.uint8)])
    return Image.fromarray(out, 'RGBA')


def process(asset):
    src = os.path.join(RAW, asset['id'] + '.png')
    if not os.path.exists(src):
        return None
    im = Image.open(src)
    W, H = im.size
    cw, ch = W / asset['cols'], H / asset['rows']
    cell = asset['cell']
    keyed = key_magenta(im)
    crops = []
    for ry in range(asset['rows']):
        for cx in range(asset['cols']):
            c = keyed.crop((round(cx * cw), round(ry * ch), round((cx + 1) * cw), round((ry + 1) * ch)))
            bb = c.getchannel('A').point(lambda v: 255 if v else 0).getbbox()
            crops.append((c.crop(bb), bb) if bb else (None, None))
    ws = [c.width for c, _ in crops if c]
    hs = [c.height for c, _ in crops if c]
    k = min(1.0, (cell - 40) / max(ws), (cell - 40) / max(hs))
    frames = []
    for c, _ in crops:
        f = Image.new('RGBA', (cell, cell), (0, 0, 0, 0))
        if c:
            nw, nh = max(1, round(c.width * k)), max(1, round(c.height * k))
            s = c.resize((nw, nh), Image.LANCZOS)
            al = np.asarray(s.getchannel('A')) >= 128
            s = Image.fromarray(np.dstack([np.asarray(s.convert('RGB')), (al * 255).astype(np.uint8)]), 'RGBA')
            x = (cell - nw) // 2
            y = BASE - nh if asset['anchor'] == 'feet' else (cell - nh) // 2
            y = max(2, min(y, cell - nh - 2)) if asset['anchor'] != 'feet' else max(2, y)
            f.alpha_composite(s, (x, y))
        frames.append(f)
    sheet = Image.new('RGBA', (cell * asset['cols'], cell * asset['rows']), (0, 0, 0, 0))
    for i, f in enumerate(frames):
        sheet.alpha_composite(f, ((i % asset['cols']) * cell, (i // asset['cols']) * cell))
    # shared 24-colour palette, no dithering, binary alpha
    arr = np.asarray(sheet)
    al = arr[..., 3] >= 128
    rgb = Image.fromarray(arr[..., :3].copy(), 'RGB')
    q = rgb.quantize(colors=24, method=Image.Quantize.MEDIANCUT, dither=Image.Dither.NONE).convert('RGB')
    qa = np.asarray(q)
    out = np.dstack([qa, (al * 255).astype(np.uint8)])
    out[~al] = 0
    final = Image.fromarray(out, 'RGBA')
    os.makedirs(SHEETS, exist_ok=True)
    final.save(os.path.join(SHEETS, asset['id'] + '.png'))
    # per-action strips (reference format: frames*cell by cell)
    idx = 0
    for action, n, fps, loop in asset['spec']:
        strip = Image.new('RGBA', (cell * n, cell), (0, 0, 0, 0))
        for j in range(n):
            i = idx + j
            strip.alpha_composite(final.crop(((i % asset['cols']) * cell, (i // asset['cols']) * cell,
                                              (i % asset['cols'] + 1) * cell, (i // asset['cols'] + 1) * cell)), (j * cell, 0))
        strip.save(os.path.join(SHEETS, '%s_%s.png' % (asset['id'], action)))
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
        # one manifest entry per action row-segment: frames are consecutive in reading order
        idx = 0
        for action, n, fps, loop in a['spec']:
            manifest['assets'].append(dict(
                id='%s_%s' % (a['id'], action), category=a['category'], name=a['name'], action=action,
                frame_w=cell, frame_h=cell, frames=n, fps=fps, loop=loop,
                path='sheets/%s_%s.png' % (a['id'], action)))
            idx += n
    with open(os.path.join(ART, 'manifest.json'), 'w') as fh:
        json.dump(manifest, fh, indent=2)
    # contact sheet
    pad, lab = 12, 18
    maxw = max(s.width for _, s in done) if done else 256
    toth = sum(s.height // 2 + lab + pad for _, s in done) + pad
    W = max(maxw // 2, 512) + pad * 2
    prev = Image.new('RGB', (W, max(toth, 64)), (28, 30, 40))
    d = ImageDraw.Draw(prev)
    y = pad
    for a, s in done:
        d.text((pad, y), a['id'], fill=(240, 230, 200))
        y += lab
        h = s.resize((s.width // 2, s.height // 2), Image.NEAREST)
        prev.paste(h, (pad, y), h)
        y += h.height + pad
    prev.save(os.path.join(ART, 'preview-all.png'))
    print('processed', [a['id'] for a, _ in done])


if __name__ == '__main__':
    sys.exit(main())
