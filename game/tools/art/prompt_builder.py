#!/usr/bin/env python3
"""Deterministic prompt builder.

prompt = LOCKED STYLE BLOCK + SPEC + LAYOUT + (PROVEN FIXES from PROMPT-NOTES.md) + [REQUIRED (retry only)] + NEGATIVE

ONE image = ONE action of ONE class: frames are columns, the three directions (down, up, right) are three rows.
Same inputs always give byte-identical prompts (no timestamps, no randomness).

CLI:  prompt_builder.py <spec-id> <action|master|single> [--retry "fix hint" ...] [--hash]
"""
import hashlib
import os
import re
import sys

from common import HERE
from spec_lib import ACTIONS, DIRS, load_spec

NOTES_PATH = os.path.join(HERE, 'PROMPT-NOTES.md')
MAGENTA = '#FF00FF'

LOCKED_STYLE = (
    'STYLE (locked, identical for every asset of this game): original 2D game sprite art in a clean pixel-art look drawn for a '
    '64x64 pixel grid per character, chunky square pixels, bold 1-pixel dark outline (near-black #080706) around every shape, '
    'flat colour areas with only 3 to 5 colours per material, one hard-edged highlight and one shade tone per material, '
    'no gradients, no dithering, no anti-aliasing, no glow halos, no soft shadows. Short wide chibi proportions: head about one '
    'third of the height, stocky body, short thick limbs, big hands and boots. Lighting comes from the upper left. '
    'The character is an original design; it must not resemble any existing game, film or comic character.'
)

NEGATIVE = (
    'NEGATIVE (never draw any of these): text, letters, numbers, labels, captions, watermarks, signatures, grid lines, '
    'frame borders, boxes around frames, gutters, drop shadows, cast shadows, ground, floor, ground line, platforms, '
    'background scenery, gradients in the background, glow, particles, sparks, magic circles, slash arcs, weapon trails, '
    'motion blur, speed lines, extra characters, partial or cropped characters, overlapping frames, '
    'frames that touch each other or the image edge, photographic or 3D rendering.'
)


# ----------------------------------------------------------------------------- notes
def read_notes(path=None):
    """Return {'all': [...], 'class:<id>': [...], 'action:<name>': [...]} from the bullets of PROMPT-NOTES.md."""
    path = path or NOTES_PATH
    out = {'all': []}
    if not os.path.exists(path):
        return out
    key = None
    with open(path) as f:
        for ln in f.read().split('\n'):
            h = re.match(r'^##\s+(.*)$', ln.strip())
            if h:
                t = h.group(1).strip().lower()
                if t.startswith('proven fixes'):
                    key = 'all'
                elif t.startswith('class:'):
                    key = 'class:' + t.split(':', 1)[1].strip()
                elif t.startswith('action:'):
                    key = 'action:' + t.split(':', 1)[1].strip()
                else:
                    key = None
                out.setdefault(key, []) if key else None
                continue
            b = re.match(r'^\s*-\s+(.*\S)\s*$', ln)
            if b and key:
                out[key].append(b.group(1))
    return out


def notes_for(cls, action, path=None):
    n = read_notes(path)
    return n.get('all', []) + n.get('class:' + str(cls), []) + n.get('action:' + str(action), [])


# ----------------------------------------------------------------------------- layout
def layout(frames, size='1536x1024'):
    w, h = [int(x) for x in size.split('x')]
    rows = len(DIRS)
    return dict(cols=frames, rows=rows, width=w, height=h, cell_w=w / float(frames), cell_h=h / float(rows))


def layout_text(frames, size='1536x1024'):
    L = layout(frames, size)
    cw = ('%d' % L['cell_w']) if L['cell_w'] == int(L['cell_w']) else ('%.1f' % L['cell_w'])
    return (
        'LAYOUT (strict): ONE image, %s pixels. A strict invisible grid of %d columns and %d rows of EQUAL cells (each cell about %s x %d pixels). '
        'Columns = animation frames 1 to %d from left to right. Row 1 = FRONT view (down), row 2 = BACK view (up), row 3 = RIGHT side view (right). '
        'Exactly one character in every cell, %d characters in total, no more, no fewer. '
        'No gutters, no labels, no borders, no text, no shadows, no ground, no effects. '
        'The background is ONE SOLID FLAT MAGENTA %s everywhere (every pixel not part of a character is exactly this colour). '
        'Every character is fully inside its own cell with clear empty space on all sides, never touching the cell edge or a neighbour. '
        'All characters are drawn at the SAME SCALE (the standing figure is the same height in every cell of the image), '
        'and the feet of all characters rest on ONE common horizontal row near the bottom of the cells (rows are equal height).'
        % (size, L['cols'], L['rows'], cw, int(L['cell_h']), frames, frames * L['rows'], MAGENTA))


# ----------------------------------------------------------------------------- spec text
def spec_text(spec):
    d = spec['design']
    lines = ['CHARACTER: %s. %s' % (spec['title'], d['summary']),
             'Silhouette: %s' % d['silhouette'],
             'Headgear (%s): %s' % (d['headgear']['shape'], d['headgear']['description']),
             'Armour: ' + ' '.join('%s - %s (%s).' % (a['part'], a['description'].rstrip('.'), a['color']) for a in d['armour']),
             'Cloth/cape: %s' % d['cloth'],
             'Weapon (%s): %s' % ({'both': 'one in each hand', 'right': 'right hand', 'left': 'left hand', 'none': 'none'}[spec['weapon']['hand']],
                                  spec['weapon']['description']),
             'Palette (use ONLY these hex colours, plus %s for the background): %s.'
             % (MAGENTA, ', '.join('%s %s' % (k, v) for k, v in sorted(spec['palette'].items()))),
             'Proportions: %s. The standing figure is %d px tall inside a %d px cell (about %d percent of the cell height), '
             'identical in all three views.' % (spec['proportions']['style'], spec['proportions']['standing_height_px'],
                                                spec['proportions']['cell_px'],
                                                round(100.0 * spec['proportions']['standing_height_px'] / spec['proportions']['cell_px']))]
    return '\n'.join(lines)


def views_text(spec):
    v = spec['views']
    return 'VIEWS: ' + ' '.join('%s: %s' % (k.upper(), v[k]['descriptor']) for k in DIRS)


def poses_text(spec, action):
    a = spec['actions'][action]
    lines = ['ACTION: %s (%d frames, %s). Each column is a DIFFERENT pose, in this order, identical timing in all three rows:'
             % (action, a['frames'], 'loops seamlessly' if a['loop'] else 'plays once')]
    for i, p in enumerate(a['poses']):
        lines.append('Frame %d: %s' % (i + 1, p))
    if action in ('attack', 'cast'):
        lines.append('The weapon is clearly visible and held in the same hand as in idle in EVERY frame.')
    return '\n'.join(lines)


# ----------------------------------------------------------------------------- builders
def _join(*blocks):
    return '\n\n'.join(b for b in blocks if b)


def required_block(hints):
    if not hints:
        return ''
    uniq, seen = [], set()
    for h in hints:
        h = str(h).strip()
        if h and h not in seen:
            seen.add(h)
            uniq.append(h)
    return 'REQUIRED (a previous attempt failed review; every item below MUST be fixed in this image):\n' + '\n'.join(
        '- %s' % h for h in uniq)


def build_action_prompt(spec, action, retry_hints=None, notes_path=None):
    if action not in ACTIONS:
        raise ValueError('unknown action %r' % action)
    fixes = notes_for(spec['id'], action, notes_path)
    proven = ('PROVEN FIXES (always obey):\n' + '\n'.join('- %s' % x for x in fixes)) if fixes else ''
    return _join(LOCKED_STYLE, spec_text(spec), views_text(spec), poses_text(spec, action),
                 layout_text(spec['actions'][action]['frames']), proven, required_block(retry_hints), NEGATIVE)


def build_master_prompt(spec, retry_hints=None, notes_path=None):
    """1024x1024 class master: the three standing views side by side (front, back, right profile)."""
    fixes = notes_for(spec['id'], 'master', notes_path)
    proven = ('PROVEN FIXES (always obey):\n' + '\n'.join('- %s' % x for x in fixes)) if fixes else ''
    layout = ('LAYOUT (strict): ONE image, 1024x1024 pixels, a turnaround sheet: exactly THREE characters in one row of three equal cells, '
              'left to right: FRONT view (down), BACK view (up), RIGHT side view (right). All three stand idle, same scale, same height, '
              'feet on one common row. No gutters, no labels, no borders, no text, no shadows, no ground, no effects. '
              'The background is ONE SOLID FLAT MAGENTA %s everywhere. Each character is fully inside its cell and never touches an edge.' % MAGENTA)
    stand = 'POSE: ' + spec['actions']['idle']['poses'][0]
    return _join(LOCKED_STYLE, spec_text(spec), views_text(spec), stand, layout, proven, required_block(retry_hints), NEGATIVE)


def build_single_prompt(spec, retry_hints=None, notes_path=None):
    """1024x1024 single enemy / item."""
    s = spec['single']
    fixes = notes_for(spec['id'], 'single', notes_path)
    proven = ('PROVEN FIXES (always obey):\n' + '\n'.join('- %s' % x for x in fixes)) if fixes else ''
    d = spec['design']
    body = '\n'.join(['SUBJECT: %s. %s' % (s['subject'], d['summary']), 'Silhouette: %s' % d['silhouette'], 'Pose: %s' % s['pose'],
                      'Palette (use ONLY these hex colours, plus %s for the background): %s.'
                      % (MAGENTA, ', '.join('%s %s' % (k, v) for k, v in sorted(spec['palette'].items())))])
    layout = ('LAYOUT (strict): ONE image, 1024x1024 pixels, exactly ONE subject centred, filling about %d percent of the image. '
              'No labels, no borders, no text, no shadows, no ground, no effects. The background is ONE SOLID FLAT MAGENTA %s everywhere.'
              % (s.get('fill_percent', 80), MAGENTA))
    return _join(LOCKED_STYLE, body, layout, proven, required_block(retry_hints), NEGATIVE)


def build(spec, kind, retry_hints=None, notes_path=None):
    if kind == 'master':
        return build_master_prompt(spec, retry_hints, notes_path)
    if kind == 'single':
        return build_single_prompt(spec, retry_hints, notes_path)
    return build_action_prompt(spec, kind, retry_hints, notes_path)


def prompt_hash(prompt):
    return hashlib.sha256(prompt.encode('utf-8')).hexdigest()[:16]


def main(argv):
    if len(argv) < 2:
        print(__doc__)
        return 1
    hints, show_hash = [], False
    args = list(argv)
    if '--hash' in args:
        args.remove('--hash')
        show_hash = True
    if '--retry' in args:
        i = args.index('--retry')
        hints = args[i + 1:]
        args = args[:i]
    p = build(load_spec(args[0]), args[1], hints)
    print(prompt_hash(p) if show_hash else p)
    return 0


if __name__ == '__main__':
    sys.exit(main(sys.argv[1:]))
