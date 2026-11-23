#!/usr/bin/env python3
"""Intake contact sheet: frame 0 of each listed asset next to the b04 puffcap reference, at 3x nearest-neighbour, on dark #181820
and mid-grey #808080. Optional --before <git-rev> draws the same asset as it was at that revision in a second row (in-place remakes).
Usage: python3 game/tools/art-audit/contact.py OUT.png ASSET.png[:frame_w] ... [--before REV] [--zoom 3] [--native-div 1]
  --native-div 2  draws 2x-authored art at half size first (how a renderer that keeps the old footprint will show it).
Pillow only; reads the working tree (and `git show REV:path` for --before). Report tool, never a gate."""
import io, os, subprocess, sys
from PIL import Image, ImageDraw

GAME = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
REPO = os.path.dirname(GAME)
REF = os.path.join(GAME, 'assets/arcane/b04-mad-maze-enemies/enemies/puffcap/puffcap_idle_down.png')
BGS = [(0x18, 0x18, 0x20), (0x80, 0x80, 0x80)]


def frame0(img, fw):
    img = img.convert('RGBA')
    fw = fw or img.height
    return img.crop((0, 0, min(fw, img.width), img.height))


def trim(img):
    bb = img.getbbox()
    return img.crop(bb) if bb else img


def load(spec, rev=None):
    path, _, fw = spec.partition(':')
    fw = int(fw) if fw else 0
    if rev:
        rel = os.path.relpath(os.path.abspath(path), REPO)
        try:
            data = subprocess.check_output(['git', '-C', REPO, 'show', rev + ':' + rel], stderr=subprocess.DEVNULL)
        except subprocess.CalledProcessError:
            return None, os.path.basename(path)
        img = Image.open(io.BytesIO(data))
    else:
        img = Image.open(path)
    return frame0(img, fw), os.path.splitext(os.path.basename(path))[0]


def main(argv):
    out, specs, rev, zoom, div = None, [], None, 3, 1
    i = 0
    while i < len(argv):
        a = argv[i]
        if a == '--before': rev = argv[i + 1]; i += 2; continue
        if a == '--zoom': zoom = int(argv[i + 1]); i += 2; continue
        if a == '--native-div': div = int(argv[i + 1]); i += 2; continue
        if out is None: out = a
        else: specs.append(a)
        i += 1
    ref = trim(frame0(Image.open(REF), 256).resize((64, 64), Image.NEAREST))  # b04 cells are 4x native: show native 64
    rows = [[('b04 puffcap', ref)] + [(n, trim(im)) for im, n in (load(s) for s in specs)]]
    if rev:
        prev = [('before ' + rev[:7], ref)]
        for s in specs:
            im, n = load(s, rev)
            prev.append((n, trim(im) if im else Image.new('RGBA', (8, 8))))
        rows.append(prev)
    if div > 1:  # reference stays at native; every listed asset shrinks by div (4x-authored strips -> native, 2x props -> footprint)
        rows = [[r[0]] + [(n, im.resize((max(1, im.width // div), max(1, im.height // div)), Image.NEAREST)) for n, im in r[1:]] for r in rows]
    cw = max(im.width for r in rows for _, im in r) * zoom + 12
    ch = max(im.height for r in rows for _, im in r) * zoom + 22
    sheet = Image.new('RGB', (cw * len(rows[0]), ch * len(rows) * len(BGS)))
    d = ImageDraw.Draw(sheet)
    for bi, bg in enumerate(BGS):
        for ri, row in enumerate(rows):
            y0 = (bi * len(rows) + ri) * ch
            d.rectangle([0, y0, sheet.width, y0 + ch], fill=bg)
            for ci, (name, im) in enumerate(row):
                big = im.resize((im.width * zoom, im.height * zoom), Image.NEAREST)
                x = ci * cw + (cw - big.width) // 2
                sheet.paste(big, (x, y0 + ch - 16 - big.height), big)
                d.text((ci * cw + 3, y0 + ch - 13), name[:22], fill=(255, 255, 255) if bi == 0 else (0, 0, 0))
    sheet.save(out, optimize=True)
    print(out, sheet.size)


if __name__ == '__main__':
    main(sys.argv[1:])
