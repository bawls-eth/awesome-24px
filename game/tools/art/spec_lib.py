#!/usr/bin/env python3
"""Spec loading + validation (mini JSON-schema validator, stdlib only) + semantic checks.

CLI:  python3 spec_lib.py validate [spec.json ...]     (default: every spec in specs/)
"""
import glob
import json
import os
import re
import sys

from common import REF_ARCANE as ARCANE, SPECS_DIR

ACTIONS = ['idle', 'walk', 'attack', 'cast', 'roll', 'hit', 'death']
DIRS = ['down', 'up', 'right']
HEX = re.compile(r'^#[0-9a-fA-F]{6}$')


# ----------------------------------------------------------------------------- mini JSON schema
def _type_ok(v, t):
    return {'object': isinstance(v, dict), 'array': isinstance(v, list), 'string': isinstance(v, str),
            'integer': isinstance(v, int) and not isinstance(v, bool),
            'number': isinstance(v, (int, float)) and not isinstance(v, bool),
            'boolean': isinstance(v, bool)}.get(t, True)


def validate(inst, schema, root=None, path='$'):
    """Return a list of error strings. Supports type, enum, const, required, properties, additionalProperties,
    items, minItems, maxItems, minimum, maximum, pattern, minLength, $ref (#/definitions/..)."""
    root = root or schema
    errs = []
    if '$ref' in schema:
        ref = schema['$ref']
        node = root
        for part in ref.lstrip('#/').split('/'):
            node = node[part]
        return validate(inst, node, root, path)
    t = schema.get('type')
    if t and not _type_ok(inst, t):
        return ['%s: expected %s' % (path, t)]
    if 'enum' in schema and inst not in schema['enum']:
        errs.append('%s: %r not in %s' % (path, inst, schema['enum']))
    if 'const' in schema and inst != schema['const']:
        errs.append('%s: must equal %r' % (path, schema['const']))
    if isinstance(inst, str):
        if 'pattern' in schema and not re.search(schema['pattern'], inst):
            errs.append('%s: %r does not match %s' % (path, inst, schema['pattern']))
        if len(inst) < schema.get('minLength', 0):
            errs.append('%s: too short' % path)
    if isinstance(inst, (int, float)) and not isinstance(inst, bool):
        if 'minimum' in schema and inst < schema['minimum']:
            errs.append('%s: < %s' % (path, schema['minimum']))
        if 'maximum' in schema and inst > schema['maximum']:
            errs.append('%s: > %s' % (path, schema['maximum']))
    if isinstance(inst, dict):
        for k in schema.get('required', []):
            if k not in inst:
                errs.append('%s: missing required "%s"' % (path, k))
        props = schema.get('properties', {})
        for k, v in inst.items():
            if k in props:
                errs += validate(v, props[k], root, path + '.' + k)
            elif schema.get('additionalProperties') is False:
                errs.append('%s: unexpected key "%s"' % (path, k))
            elif isinstance(schema.get('additionalProperties'), dict):
                errs += validate(v, schema['additionalProperties'], root, path + '.' + k)
    if isinstance(inst, list):
        if len(inst) < schema.get('minItems', 0):
            errs.append('%s: needs >= %d items' % (path, schema['minItems']))
        if 'maxItems' in schema and len(inst) > schema['maxItems']:
            errs.append('%s: needs <= %d items' % (path, schema['maxItems']))
        if 'items' in schema:
            for i, v in enumerate(inst):
                errs += validate(v, schema['items'], root, '%s[%d]' % (path, i))
    return errs


# ----------------------------------------------------------------------------- shared palette
def shared_palette():
    """Union of the approved batches' palettes (b00 + b01): the 'shared palette' class hex colours come from."""
    cols = set()
    for p in glob.glob(os.path.join(ARCANE, 'b0[01]-*', 'palette.json')):
        with open(p) as f:
            cols |= set(c.lower() for c in json.load(f).get('colors', []))
    return cols


def b00_frame_counts():
    p = os.path.join(ARCANE, 'b00-warrior', 'manifest.json')
    with open(p) as f:
        m = json.load(f)
    out = {}
    for a in m['assets']:
        out[a['action']] = dict(frames=a['frames'], fps=a['fps'], loop=a['loop'])
    return out


def load_schema():
    with open(os.path.join(SPECS_DIR, 'spec.schema.json')) as f:
        return json.load(f)


def load_spec(path_or_id):
    p = path_or_id if os.path.exists(path_or_id) else os.path.join(SPECS_DIR, path_or_id + '.json')
    with open(p) as f:
        return json.load(f)


def spec_paths():
    return sorted(p for p in glob.glob(os.path.join(SPECS_DIR, '*.json')) if not p.endswith('schema.json'))


def check_spec(spec, schema=None, pal=None, counts=None):
    """Schema + semantic problems for one spec (list of strings; empty = valid)."""
    errs = validate(spec, schema or load_schema())
    pal = pal if pal is not None else shared_palette()
    if spec.get('category') == 'hero':
        counts = counts or b00_frame_counts()
        for k in ('headgear', 'armour', 'cloth', 'weapon_summary'):
            if k not in spec.get('design', {}):
                errs.append('design.%s missing (required for heroes)' % k)
        if 'weapon' not in spec:
            errs.append('weapon missing (required for heroes)')
        for a in ACTIONS:
            act = (spec.get('actions') or {}).get(a)
            if not act:
                errs.append('actions.%s missing' % a)
                continue
            if a in counts and (act.get('frames') != counts[a]['frames'] or act.get('fps') != counts[a]['fps']
                                or act.get('loop') != counts[a]['loop']):
                errs.append('actions.%s frames/fps/loop differ from b00 manifest' % a)
            if len(act.get('poses', [])) != act.get('frames'):
                errs.append('actions.%s needs exactly %s pose lines' % (a, act.get('frames')))
        for d in DIRS:
            if d not in (spec.get('views') or {}):
                errs.append('views.%s missing' % d)
        up = (spec.get('views') or {}).get('up', {})
        if up and up.get('face_visible') is not False:
            errs.append('views.up.face_visible must be false (back view shows NO face)')
        if (spec.get('views') or {}).get('right', {}).get('true_profile') is not True:
            errs.append('views.right.true_profile must be true')
        pr = spec.get('proportions', {})
        if pr.get('standing_height_px') != 148 or pr.get('cell_px') != 256:
            errs.append('proportions must be 148 px standing in a 256 cell')
        for name, hx in spec.get('palette', {}).items():
            if hx.lower() not in pal:
                errs.append('palette.%s %s is not in the shared palette (b00+b01 palette.json)' % (name, hx))
        for hx in spec.get('weapon', {}).get('region_hexes', []):
            if hx.lower() not in pal:
                errs.append('weapon.region_hexes %s is not in the shared palette' % hx)
    return errs


def main(argv):
    if not argv or argv[0] != 'validate':
        print(__doc__)
        return 1
    paths = argv[1:] or spec_paths()
    schema, pal, counts = load_schema(), shared_palette(), b00_frame_counts()
    bad = 0
    for p in paths:
        errs = check_spec(load_spec(p), schema, pal, counts)
        print('%s %s' % ('OK  ' if not errs else 'FAIL', os.path.basename(p)))
        for e in errs:
            print('   ', e)
        bad += bool(errs)
    return 1 if bad else 0


if __name__ == '__main__':
    sys.exit(main(sys.argv[1:]))
