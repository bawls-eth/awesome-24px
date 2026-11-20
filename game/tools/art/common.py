"""Shared helpers for the art pipeline: paths, config, ledger (parse / append / cap), cost estimate.

No network code lives here.  Python 3 stdlib only (process.py / critic.py add pillow + numpy).
"""
import json
import math
import os
import re

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, '..', '..', '..'))
CONFIG_PATH = os.path.join(HERE, 'config.json')
SPECS_DIR = os.path.join(HERE, 'specs')
WORK_DIR = os.environ.get('ART_WORK_DIR') or os.path.join(HERE, 'work')
REF_ARCANE = os.path.join(ROOT, 'game', 'assets', 'arcane')  # approved batches (read-only references)
ARCANE = os.environ.get('ART_ARCANE_DIR') or os.path.join(ROOT, 'game', 'assets', 'arcane')


class CapError(Exception):
    """Raised when a call or batch would exceed the spend cap."""


def load_config(path=None):
    with open(path or os.environ.get('ART_CONFIG') or CONFIG_PATH) as f:
        return json.load(f)


def ledger_path(cfg, override=None):
    p = override or os.environ.get('ART_LEDGER') or cfg['ledger']
    return p if os.path.isabs(p) else os.path.join(ROOT, p)


# ----------------------------------------------------------------------------- cost
def estimate_call(cfg, prompt, size, n_images_in=0):
    """Conservative cost estimate (USD) for one generation at the HIGH prices in the ledger.

    Returns dict(out, in_text, in_image, cost)."""
    est = cfg['estimate']
    out = est['out_tokens_1024x1024'] if size == '1024x1024' else est['out_tokens_1536x1024']
    in_text = int(math.ceil(len(prompt) / float(est['chars_per_text_token'])))
    in_image = 0
    return dict(out=out, in_text=in_text, in_image=in_image, cost=cost_of(cfg, out, in_text, in_image))


def cost_of(cfg, out, in_text, in_image):
    p = cfg['prices_per_million']
    return round((out * p['out'] + in_text * p['in_text'] + in_image * p['in_image']) / 1e6, 4)


# ----------------------------------------------------------------------------- ledger
ROW_RE = re.compile(r'^\|')


def _cells(line):
    parts = [c.strip() for c in line.strip().strip('|').split('|')]
    return parts


def parse_ledger(path):
    """Return dict(rows=[...], total=float, header_cap, header_stop, lines=[...]). Sums the table rows only."""
    with open(path) as f:
        lines = f.read().split('\n')
    rows, total = [], 0.0
    for ln in lines:
        if not ROW_RE.match(ln):
            continue
        c = _cells(ln)
        if len(c) < 7 or c[0].lower() == 'id' or set(c[0]) <= set('-: '):
            continue
        try:
            cost = float(c[5])
        except ValueError:
            continue
        rows.append(dict(id=c[0], model=c[1], size=c[2], quality=c[3], usage=c[4], cost=cost, note='|'.join(c[6:])))
        total += cost
    head = lines[0] if lines else ''
    m_cap = re.search(r'cap\s+([0-9]+(?:\.[0-9]+)?)', head)
    m_stop = re.search(r'stop(?:\s+at)?\s+([0-9]+(?:\.[0-9]+)?)', head)
    return dict(rows=rows, total=round(total, 4), header_cap=float(m_cap.group(1)) if m_cap else None,
                header_stop=float(m_stop.group(1)) if m_stop else None, lines=lines)


def clean_cell(s):
    return str(s).replace('|', '/').replace('\n', ' ').strip()


def make_row(row_id, model, size, quality, out, in_text, in_image, cost, note=''):
    usage = 'out %d, in text %d, in image %d' % (out, in_text, in_image)
    return '| %s | %s | %s | %s | %s | %.4f | %s |' % tuple(
        [clean_cell(x) for x in (row_id, model, size, quality, usage)] + [cost, clean_cell(note)])


def append_rows(path, row_lines, comment_lines=()):
    """Append ledger rows after the last table row and refresh the TOTAL line. Existing rows are never edited."""
    with open(path) as f:
        lines = f.read().split('\n')
    last = max([i for i, ln in enumerate(lines) if ROW_RE.match(ln)] or [len(lines) - 1])
    new = list(comment_lines) + list(row_lines)
    lines[last + 1:last + 1] = new
    with open(path, 'w') as f:
        f.write('\n'.join(lines))
    total = parse_ledger(path)['total']
    with open(path) as f:
        lines = f.read().split('\n')
    for i, ln in enumerate(lines):
        if ln.startswith('TOTAL:'):
            lines[i] = 'TOTAL: %.4f' % total
            break
    else:
        lines.append('TOTAL: %.4f' % total)
    with open(path, 'w') as f:
        f.write('\n'.join(lines))
    return total


def header_text(cfg):
    return ('# OpenAI art ledger (TOTAL cap %.2f USD, stop at %.2f, report at %.2f)'
            % (cfg['cap_total_usd'], cfg['stop_usd'], cfg['report_usd']))


CAP_NOTE_PREFIX = 'Cap fields:'


def sync_header(path, cfg):
    """Rewrite ONLY the header text (line 1 + the 'Cap fields:' line). Table rows are untouched."""
    with open(path) as f:
        lines = f.read().split('\n')
    lines[0] = header_text(cfg)
    capline = ('%s TOTAL cap = %.2f USD for ALL rows below (not per day); work STOPS at %.2f; a report is due at %.2f. '
               'Estimated at the high prices below. Single source: game/tools/art/config.json (cap_total_usd, stop_usd, report_usd).'
               % (CAP_NOTE_PREFIX, cfg['cap_total_usd'], cfg['stop_usd'], cfg['report_usd']))
    idx = [i for i, ln in enumerate(lines) if ln.startswith(CAP_NOTE_PREFIX)]
    if idx:
        lines[idx[0]] = capline
    else:
        lines.insert(1, capline)
    with open(path, 'w') as f:
        f.write('\n'.join(lines))


def check_cap(cfg, spent, add, label='call'):
    """Raise CapError if spent+add would pass the stop level (or the hard cap)."""
    stop = min(cfg['stop_usd'], cfg['cap_total_usd'])
    if spent + add > stop + 1e-9:
        raise CapError('%s refused: ledger total %.4f + estimate %.4f = %.4f exceeds stop level %.2f (cap %.2f). '
                       'Raise cap_total_usd/stop_usd in game/tools/art/config.json only with the owner\'s OK.'
                       % (label, spent, add, spent + add, stop, cfg['cap_total_usd']))


def read_json(path, default=None):
    if not os.path.exists(path):
        return default
    with open(path) as f:
        return json.load(f)


def write_json(path, data):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    tmp = path + '.tmp'
    with open(tmp, 'w') as f:
        json.dump(data, f, indent=2, sort_keys=False)
        f.write('\n')
    os.replace(tmp, path)
