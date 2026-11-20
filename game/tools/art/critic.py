#!/usr/bin/env python3
"""Critic hooks. The vision critic itself is a separate Sonnet subagent run by the orchestrator.

  critic.py prepare <batch> <class>      -> work/<batch>/<class>/contact-sheet.png + critic-request.json
  critic.py apply <verdict.json> [--batch b02 --class rogue]
                                         -> validates the verdict, stores qa-verdict.json, writes retry-plan.json

Verdict schema (strict):  {"verdict": "PASS"|"FAIL", "defects": [{"strip": "<strip id>", "frame": <1-based int>,
                           "defect": "<what is wrong>", "fix_hint": "<imperative prompt fix>"}]}
PASS needs an empty defects list; FAIL needs at least one defect. Retries are limited to the failing strips (their action
sheet is regenerated), at most retry.max_per_strip times each (config.json), then the strip goes to known_issues.
"""
import argparse
import hashlib
import json
import os
import sys

import common
from spec_lib import ACTIONS, DIRS, load_spec

RUBRIC_CHECKS = [
    'back view (up) shows NO face (no eyes, mouth, profile): back of head/headgear, cape/back plates only',
    'right view is a TRUE side profile (90 degrees), near arm and near leg in front of the torso',
    'front view faces the camera with face visible; same character design as the master (colours, headgear, armour, weapon)',
    'both legs and boots fully visible in every frame; feet on one baseline',
    'every frame in a strip is a genuinely different pose; walk shows alternating legs; roll really tumbles; death stumbles, falls and lies down',
    'weapon clearly visible in every attack/cast frame and held in the same hand as in idle; no weapon trail or slash arc baked in',
    'dark outline in every view, no light halo fringe, no floating fragments, no neighbour-sprite slivers, no magenta pixels',
    'same standing height in the three views (148 px) and the same scale across frames; nothing clipped by the cell',
    'style matches the approved reference (chunky 4x4 pixels, flat colours); original design, not a copy of an existing game',
]

VERDICT_SCHEMA = {
    'type': 'object', 'required': ['verdict', 'defects'],
    'properties': {
        'verdict': {'type': 'string', 'enum': ['PASS', 'FAIL']},
        'defects': {'type': 'array', 'items': {
            'type': 'object', 'required': ['strip', 'frame', 'defect', 'fix_hint'],
            'properties': {'strip': {'type': 'string'}, 'frame': {'type': 'integer', 'minimum': 1},
                           'defect': {'type': 'string', 'minLength': 3}, 'fix_hint': {'type': 'string', 'minLength': 3}}}}},
}


def class_dir(batch, cid, work=None):
    return os.path.join(work or common.WORK_DIR, batch, cid)


def out_dir(batch, work=None):
    return os.path.join(work or common.WORK_DIR, batch, 'out')


def strip_ids(cid):
    spec = load_spec(cid)
    return [('%s_%s_%s' % (cid, a, d), a, d, spec['actions'][a]['frames']) for a in ACTIONS for d in DIRS]


def _approved_refs(cfg):
    """Frame 0 of idle down/up/right of the approved warrior (b00) and the ranger (b01)."""
    refs = []
    for cid, folder in cfg.get('reference_batches', {}).items():
        for d in DIRS:
            p = os.path.join(common.REF_ARCANE, folder, 'characters', cid, '%s_idle_%s.png' % (cid, d))
            if os.path.exists(p):
                refs.append(('%s %s' % (cid, d), p))
    return refs


def prepare(batch, cid, work=None):
    from PIL import Image, ImageDraw
    cfg = common.load_config()
    cdir = class_dir(batch, cid, work)
    os.makedirs(cdir, exist_ok=True)
    odir = out_dir(batch, work)
    cell = 256
    half = 128
    ids = strip_ids(cid)
    present = [(s, a, d, n) for (s, a, d, n) in ids if os.path.exists(os.path.join(odir, 'characters', cid, s + '.png'))]
    W = max(6 * half, 6 * 96) + 140 + 12
    top_items = []
    master = os.path.join(work or common.WORK_DIR, batch, 'raw', cid, '%s_%s_master.png' % (batch, cid))
    if os.path.exists(master):
        top_items.append(('MASTER (raw)', Image.open(master).convert('RGB')))
    for name, p in _approved_refs(cfg):
        im = Image.open(p).convert('RGBA').crop((0, 0, cell, cell))
        top_items.append(('APPROVED ' + name, im))
    th = 160
    H = 20 + th + 24 + len(present) * (half + 4) + 8
    sheet = Image.new('RGB', (W, H), (128, 128, 128))
    dr = ImageDraw.Draw(sheet)
    dr.text((4, 4), 'class %s batch %s - strips at 50 percent, frame numbers top-left, mid-grey background' % (cid, batch), fill=(0, 0, 0))
    x = 4
    for label, im in top_items:
        k = th / float(im.size[1])
        t = im.resize((max(1, int(im.size[0] * k)), th), Image.NEAREST)
        if x + t.size[0] > W:
            break
        if t.mode == 'RGBA':
            sheet.paste(t, (x, 20), t)
        else:
            sheet.paste(t, (x, 20))
        dr.text((x, 20 + th + 2), label, fill=(0, 0, 0))
        x += t.size[0] + 6
    y = 20 + th + 24
    for sid, a, d, n in present:
        im = Image.open(os.path.join(odir, 'characters', cid, sid + '.png')).convert('RGBA')
        t = im.resize((im.size[0] // 2, im.size[1] // 2), Image.NEAREST)
        sheet.paste(t, (140, y), t)
        dr.text((4, y + 4), sid, fill=(0, 0, 0))
        for f in range(n):
            dr.text((144 + f * half, y + 2), str(f + 1), fill=(255, 255, 0))
        y += half + 4
    cs = os.path.join(cdir, 'contact-sheet.png')
    sheet.save(cs)
    req = {
        'batch': batch, 'class': cid, 'contact_sheet': cs,
        'strips': [{'id': s, 'action': a, 'dir': d, 'frames': n, 'present': (s, a, d, n) in present} for (s, a, d, n) in ids],
        'prompt': ('You are the art critic for the Pixeltown game. Open the contact sheet image at the path in "contact_sheet". '
                   'Top row: the class master and the approved reference sprites (warrior b00, ranger b01). Below: every processed strip '
                   '(label at the left, frames numbered 1..N). Judge ONLY the strips against the rubric checks. Be strict but fair: report a defect '
                   'only if you can point at a strip and a frame. Reply with ONE JSON object and nothing else, exactly matching "verdict_schema": '
                   '{"verdict":"PASS"|"FAIL","defects":[{"strip":"<strip id>","frame":<1-based>,"defect":"...","fix_hint":"<short imperative '
                   'sentence that can be added to an image prompt>"}]}. PASS only when there are no defects.'),
        'rubric_checks': RUBRIC_CHECKS, 'verdict_schema': VERDICT_SCHEMA,
        'write_verdict_to': os.path.join(cdir, 'verdict.json'),
    }
    common.write_json(os.path.join(cdir, 'critic-request.json'), req)
    return cs, os.path.join(cdir, 'critic-request.json')


def validate_verdict(v, ids_frames):
    """Return list of problems (empty = valid). ids_frames: {strip id: frames}."""
    from spec_lib import validate
    errs = validate(v, VERDICT_SCHEMA)
    if errs:
        return errs
    if v['verdict'] == 'PASS' and v['defects']:
        errs.append('PASS verdict must have an empty defects list')
    if v['verdict'] == 'FAIL' and not v['defects']:
        errs.append('FAIL verdict needs at least one defect')
    for i, d in enumerate(v['defects']):
        if d['strip'] not in ids_frames:
            errs.append('defects[%d].strip %r is not a strip of this class' % (i, d['strip']))
        elif d['frame'] > ids_frames[d['strip']]:
            errs.append('defects[%d].frame %d > frames (%d) of %s' % (i, d['frame'], ids_frames[d['strip']], d['strip']))
    return errs


def apply_verdict(verdict_path, batch=None, cid=None, work=None):
    with open(verdict_path) as f:
        raw = f.read()
    v = json.loads(raw)
    batch = batch or v.get('batch') or os.path.basename(os.path.dirname(os.path.dirname(os.path.abspath(verdict_path))))
    cid = cid or v.get('class') or os.path.basename(os.path.dirname(os.path.abspath(verdict_path)))
    cfg = common.load_config()
    ids_frames = dict((s, n) for (s, a, d, n) in strip_ids(cid))
    core = {'verdict': v.get('verdict'), 'defects': v.get('defects')}
    errs = validate_verdict(core, ids_frames)
    if errs:
        raise ValueError('invalid verdict: ' + '; '.join(errs))
    cdir = class_dir(batch, cid, work)
    os.makedirs(cdir, exist_ok=True)
    common.write_json(os.path.join(cdir, 'qa-verdict.json'), core)
    rpath = os.path.join(cdir, 'retries.json')
    rs = common.read_json(rpath, {'count': {}, 'applied': []})
    digest = hashlib.sha256(raw.encode()).hexdigest()[:16]
    plan = common.read_json(os.path.join(cdir, 'retry-plan.json'))
    if digest in rs['applied'] and plan:
        return plan  # same verdict applied twice: do not double count
    rs['applied'].append(digest)
    maxr = cfg['retry']['max_per_strip']
    retries, known = {}, []
    if core['verdict'] == 'PASS':
        plan = {'batch': batch, 'class': cid, 'status': 'PASS', 'retries': [], 'known_issues': rs.get('known_issues', [])}
    else:
        failing = {}
        for d in core['defects']:
            failing.setdefault(d['strip'], []).append(d)
        for sid, ds in sorted(failing.items()):
            action = sid.split('_')[1]
            if rs['count'].get(sid, 0) < maxr:
                rs['count'][sid] = rs['count'].get(sid, 0) + 1
                r = retries.setdefault(action, dict(kind=action, strips=[], fix_hints=[], attempt=0))
                r['strips'].append(sid)
                r['attempt'] = max(r['attempt'], rs['count'][sid])
                for d in ds:
                    if d['fix_hint'] not in r['fix_hints']:
                        r['fix_hints'].append(d['fix_hint'])
            else:
                known.append({'id': sid, 'what_is_wrong': '; '.join('frame %d: %s' % (d['frame'], d['defect']) for d in ds)
                              + ' (still failing after %d retries)' % maxr})
        rs.setdefault('known_issues', [])
        for k in known:
            rs['known_issues'] = [x for x in rs['known_issues'] if x['id'] != k['id']] + [k]
        plan = {'batch': batch, 'class': cid, 'status': 'RETRY' if retries else 'DONE_WITH_KNOWN_ISSUES',
                'retries': list(retries.values()), 'known_issues': rs['known_issues'],
                'note': 'retry = regenerate the whole action sheet (one image holds the three views); counts are per strip'}
    common.write_json(rpath, rs)
    common.write_json(os.path.join(cdir, 'retry-plan.json'), plan)
    return plan


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = ap.add_subparsers(dest='cmd')
    p = sub.add_parser('prepare')
    p.add_argument('batch')
    p.add_argument('cls')
    p.add_argument('--work')
    q = sub.add_parser('apply')
    q.add_argument('verdict')
    q.add_argument('--batch')
    q.add_argument('--class', dest='cls')
    q.add_argument('--work')
    a = ap.parse_args(argv)
    if a.cmd == 'prepare':
        cs, req = prepare(a.batch, a.cls, a.work)
        print('contact sheet: %s\nrequest: %s' % (cs, req))
        return 0
    if a.cmd == 'apply':
        try:
            plan = apply_verdict(a.verdict, a.batch, a.cls, a.work)
        except (ValueError, KeyError) as e:
            print('ERROR: %s' % e)
            return 2
        print(json.dumps(plan, indent=2))
        return 0
    ap.print_help()
    return 1


if __name__ == '__main__':
    sys.exit(main())
