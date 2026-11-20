#!/usr/bin/env python3
"""Draws a SYNTHETIC action sheet (coloured blobs on magenta) for tests and demos. Not game art.

  synth_sheet.py <spec-id> <action> <out.png> [--stretch]       (1536x1024, frames x 3 rows)

Each figure is a head, body, two legs and a weapon bar in the spec's weapon colour that reaches further in later frames,
so the muzzle must move. Drawn at 2x and box-downsampled so edges blend with the magenta (like a real generator output).
Row heights differ a little (different raw scales per view) to prove scaling is measured per row from the data.
"""
import sys

from PIL import Image, ImageDraw

from spec_lib import load_spec


def hx(h):
    h = h.lstrip('#')
    return tuple(int(h[i:i + 2], 16) for i in (0, 2, 4))


def draw_sheet(spec, action, out_path, size=(1536, 1024), detached_weapon_tip=False):
    n = spec['actions'][action]['frames']
    W, H = size
    S = 2
    im = Image.new('RGB', (W * S, H * S), (255, 0, 255))
    d = ImageDraw.Draw(im)
    pal = spec['palette']
    body = hx(pal.get('cloth_dark', pal.get('robe_black', pal.get('brown', pal.get('moss', pal.get('teal_dark', pal.get('blue', '#463d3d')))))))
    head = hx(pal.get('skin', '#ecc6a1'))
    out = hx(pal['outline'])
    wcol = hx(spec['weapon']['region_hexes'][0])
    cw, ch = W / float(n), H / 3.0
    for r in range(3):
        raw_h = [200, 190, 205][r]  # per-row raw scale differs on purpose
        for i in range(n):
            cx = (i + 0.5) * cw
            foot = (r + 1) * ch - 30
            sway = (i % 2) * 6
            top = foot - raw_h
            # legs
            for lx in (-18, 8):
                d.rectangle([(cx + lx + sway * (1 if lx < 0 else -1)) * S, (foot - 55) * S, (cx + lx + 14 + sway * (1 if lx < 0 else -1)) * S, foot * S], fill=out)
                d.rectangle([(cx + lx + 2 + sway * (1 if lx < 0 else -1)) * S, (foot - 53) * S, (cx + lx + 12 + sway * (1 if lx < 0 else -1)) * S, (foot - 2) * S], fill=body)
            # torso
            d.rectangle([(cx - 34) * S, (top + 70) * S, (cx + 34) * S, (foot - 50) * S], fill=out)
            d.rectangle([(cx - 31) * S, (top + 73) * S, (cx + 31) * S, (foot - 53) * S], fill=body)
            # head
            d.ellipse([(cx - 30) * S, top * S, (cx + 30) * S, (top + 66) * S], fill=out)
            d.ellipse([(cx - 27) * S, (top + 3) * S, (cx + 27) * S, (top + 63) * S], fill=head)
            # weapon bar toward the right/front, longer in later frames
            reach = 25 + i * 12
            wx0, wy = cx + 30, top + 100
            d.rectangle([wx0 * S, (wy - 6) * S, (wx0 + reach) * S, (wy + 6) * S], fill=wcol)
            if detached_weapon_tip and i == 1:
                d.rectangle([(wx0 + reach + 8) * S, (wy - 4) * S, (wx0 + reach + 18) * S, (wy + 4) * S], fill=wcol)
    im = im.resize((W, H), Image.BOX)
    im.save(out_path)
    return out_path


if __name__ == '__main__':
    a = sys.argv[1:]
    if len(a) < 3:
        print(__doc__)
        sys.exit(1)
    draw_sheet(load_spec(a[0]), a[1], a[2], detached_weapon_tip='--tip' in a)
