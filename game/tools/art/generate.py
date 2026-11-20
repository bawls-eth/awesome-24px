#!/usr/bin/env python3
"""Image generation with a hard spend cap, a ledger row for EVERY call, backoff and resumable state.

  generate.py --batch b02 [--classes rogue,warlock] [--kinds master,idle,walk,...] --dry-run
  generate.py --batch b02 --live                    # real calls (the environment proxy injects the key)
  generate.py --jobs jobs.json --state s.json --dry-run
  generate.py --sync-header                         # mirror config.json cap fields into the ledger header text

Safety rules (see README.md):
  * Real network calls ONLY with --live. --dry-run never writes anything and never calls anything.
  * No auth header is ever set and no key is read: the environment proxy injects it.
  * Before every call: ledger total + estimate must stay <= stop_usd (config.json); otherwise the run PAUSES (exit 3).
  * Every attempt (success or failure) is appended to the ledger as a row; a request that returned success is never re-sent.
  * 429 / 5xx are retried with exponential backoff (Retry-After honoured); 4xx stops the job.
  * Tests use a mocked HTTP layer: env ART_HTTP_MOCK=<script.json>  (see MockTransport).  ART_NO_SLEEP=1 skips sleeping.
"""
import argparse
import base64
import hashlib
import json
import os
import ssl
import sys
import time
import urllib.error
import urllib.request

import common
import prompt_builder
from spec_lib import ACTIONS, load_spec

EXIT_OK, EXIT_FAILED, EXIT_PAUSED_CAP = 0, 1, 3


# ----------------------------------------------------------------------------- transports
class HttpTransport(object):
    """Real HTTPS POST. NO credentials are attached here: the sandbox proxy injects them."""

    def __init__(self, timeout):
        self.timeout = timeout
        cafile = os.environ.get('SSL_CERT_FILE') or os.environ.get('REQUESTS_CA_BUNDLE')
        if not cafile and os.path.exists('/root/.ccr/ca-bundle.crt'):
            cafile = '/root/.ccr/ca-bundle.crt'
        self.ctx = ssl.create_default_context(cafile=cafile) if cafile else ssl.create_default_context()

    def post(self, url, body):
        req = urllib.request.Request(url, data=json.dumps(body).encode('utf-8'), method='POST',
                                     headers={'Content-Type': 'application/json', 'Accept': 'application/json'})
        try:
            with urllib.request.urlopen(req, timeout=self.timeout, context=self.ctx) as r:
                return r.status, dict(r.headers), r.read().decode('utf-8', 'replace')
        except urllib.error.HTTPError as e:
            return e.code, dict(e.headers or {}), e.read().decode('utf-8', 'replace')


class MockTransport(object):
    """Scripted responses for tests. Script file: {"responses": [{"status":200,"body":{...},"headers":{}} | {"raise":"timeout"}],
    "log": "<path>"}; responses are consumed in order (the last one repeats). Every request is appended to the log file."""

    def __init__(self, path):
        with open(path) as f:
            self.script = json.load(f)
        self.i = 0
        self.log = self.script.get('log')

    def post(self, url, body):
        if self.log:
            with open(self.log, 'a') as f:
                f.write(json.dumps({'url': url, 'headers': {'Content-Type': 'application/json', 'Accept': 'application/json'}, 'body': body}) + '\n')
        r = self.script['responses'][min(self.i, len(self.script['responses']) - 1)]
        self.i += 1
        if r.get('raise'):
            raise urllib.error.URLError(r['raise'])
        body_txt = r['body'] if isinstance(r.get('body'), str) else json.dumps(r.get('body', {}))
        return r.get('status', 200), r.get('headers', {}), body_txt


def make_transport(cfg, live):
    mock = os.environ.get('ART_HTTP_MOCK')
    if mock:
        return MockTransport(mock)
    if not live:
        return None
    return HttpTransport(cfg['api']['timeout_s'])


# ----------------------------------------------------------------------------- jobs
def sheet_size(cfg, kind):
    return cfg['api']['size_single'] if kind in ('master', 'single') else cfg['api']['size_sheet']


def jobs_for(cfg, batch, class_ids, kinds=None, hints=None, out_root=None, attempt=0):
    """Job list: master + one action sheet per class. id = <batch>_<class>_<kind>[_rN]."""
    hints = hints or {}
    out_root = out_root or os.path.join(common.WORK_DIR, batch, 'raw')
    jobs = []
    for cid in class_ids:
        spec = load_spec(cid)
        for kind in (kinds or (['master'] + ACTIONS)):
            h = hints.get('%s/%s' % (cid, kind))
            prompt = prompt_builder.build(spec, kind, h)
            suffix = '_r%d' % attempt if attempt else ''
            jid = '%s_%s_%s%s' % (batch, cid, kind, suffix)
            size = sheet_size(cfg, kind)
            jobs.append(dict(id=jid, prompt=prompt, size=size, note=('%s %s%s' % (cid, kind, ' retry %d' % attempt if attempt else '')),
                             out=os.path.join(out_root, cid, '%s.png' % jid), hash=prompt_builder.prompt_hash(prompt)))
    return jobs


def estimate_jobs(cfg, jobs):
    tot = 0.0
    for j in jobs:
        j['est'] = common.estimate_call(cfg, j['prompt'], j['size'])
        tot += j['est']['cost']
    return round(tot, 4)


# ----------------------------------------------------------------------------- state
def load_state(path):
    return common.read_json(path, {'jobs': {}, 'estimates': [], 'status': 'new'}) if path else {'jobs': {}, 'estimates': [], 'status': 'new'}


def save_state(path, st):
    if path:
        common.write_json(path, st)


def _sleep(sec, summary):
    summary['backoffs'].append(sec)
    if os.environ.get('ART_NO_SLEEP') != '1':
        time.sleep(sec)


# ----------------------------------------------------------------------------- core
def run_jobs(jobs, cfg, ledger, state_path, transport, batch_label='batch'):
    """Run jobs sequentially. Returns summary dict (status ok|failed|paused_cap, done, failed, spent...)."""
    st = load_state(state_path)
    summary = dict(status='ok', done=[], skipped=[], failed=[], paused_at=None, backoffs=[], calls=0)
    pending = [j for j in jobs if not (st['jobs'].get(j['id'], {}).get('status') == 'done' and os.path.exists(j['out']))]
    summary['skipped'] = [j['id'] for j in jobs if j not in pending]
    est_total = estimate_jobs(cfg, pending)
    spent = common.parse_ledger(ledger)['total']
    stamp = time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime())
    line = '<!-- estimate %s: %d call(s), est %.4f USD, ledger %.4f before, stop %.2f, written %s -->' % (
        batch_label, len(pending), est_total, spent, cfg['stop_usd'], stamp)
    if pending:
        common.append_rows(ledger, [], [line])
        st['estimates'].append(dict(batch=batch_label, calls=len(pending), est_usd=est_total, ledger_before=spent, at=stamp))
        save_state(state_path, st)
        print(line)
    max_attempts = cfg['api']['max_attempts']
    for job in pending:
        spent = common.parse_ledger(ledger)['total']
        est = job['est']['cost']
        try:
            common.check_cap(cfg, spent, est, 'job %s' % job['id'])
        except common.CapError as e:
            summary['status'] = 'paused_cap'
            summary['paused_at'] = job['id']
            summary['message'] = str(e)
            st['status'] = 'paused_cap'
            save_state(state_path, st)
            print('PAUSED (cap): ' + str(e))
            return summary
        js = st['jobs'].setdefault(job['id'], dict(status='pending', attempts=0))
        body = {'model': cfg['api']['model'], 'prompt': job['prompt'], 'size': job['size'], 'quality': cfg['api']['quality'],
                'n': 1, 'output_format': cfg['api']['output_format']}
        ok = False
        for attempt in range(1, max_attempts + 1):
            spent = common.parse_ledger(ledger)['total']
            try:
                common.check_cap(cfg, spent, est, 'job %s attempt %d' % (job['id'], attempt))
            except common.CapError as e:
                summary['status'] = 'paused_cap'
                summary['paused_at'] = job['id']
                summary['message'] = str(e)
                st['status'] = 'paused_cap'
                save_state(state_path, st)
                print('PAUSED (cap): ' + str(e))
                return summary
            js['attempts'] += 1
            summary['calls'] += 1
            note_base = 'attempt %d, prompt %s, %s' % (attempt, job['hash'], job['note'])
            try:
                code, headers, text = transport.post(cfg['api']['url'], body)
            except Exception as e:  # network error / timeout: billing unknown -> count the full estimate
                row = common.make_row(job['id'], cfg['api']['model'], job['size'], cfg['api']['quality'], job['est']['out'],
                                      job['est']['in_text'], 0, est, 'FAILED network %s: %s; billing unknown, counted at estimate; %s'
                                      % (type(e).__name__, str(e)[:80], note_base))
                common.append_rows(ledger, [row])
                _sleep(min(cfg['api']['backoff_base_s'] * (2 ** (attempt - 1)), cfg['api']['backoff_max_s']), summary)
                continue
            data = None
            try:
                data = json.loads(text)
            except ValueError:
                pass
            if code == 200 and isinstance(data, dict) and data.get('data') and data['data'][0].get('b64_json'):
                usage = data.get('usage') or {}
                det = usage.get('input_tokens_details') or {}
                out_t = int(usage.get('output_tokens', job['est']['out']))
                in_img = int(det.get('image_tokens', 0))
                in_txt = int(det.get('text_tokens', usage.get('input_tokens', job['est']['in_text']) - in_img))
                cost = common.cost_of(cfg, out_t, in_txt, in_img)
                os.makedirs(os.path.dirname(job['out']), exist_ok=True)
                with open(job['out'], 'wb') as f:
                    f.write(base64.b64decode(data['data'][0]['b64_json']))
                row = common.make_row(job['id'], cfg['api']['model'], job['size'], cfg['api']['quality'], out_t, in_txt, in_img, cost,
                                      'ok; ' + note_base)
                common.append_rows(ledger, [row])
                js.update(status='done', out=job['out'], hash=job['hash'], cost=cost)
                save_state(state_path, st)
                summary['done'].append(job['id'])
                ok = True
                break  # success is never re-sent
            # failure
            msg = ''
            if isinstance(data, dict) and isinstance(data.get('error'), dict):
                msg = str(data['error'].get('message', ''))[:90]
            usage = (data or {}).get('usage') if isinstance(data, dict) else None
            cost = 0.0
            out_t = in_txt = 0
            if usage:  # a failed call that still reports usage was billed
                out_t = int(usage.get('output_tokens', 0))
                in_txt = int(usage.get('input_tokens', 0))
                cost = common.cost_of(cfg, out_t, in_txt, 0)
            row = common.make_row(job['id'], cfg['api']['model'], job['size'], cfg['api']['quality'], out_t, in_txt, 0, cost,
                                  'FAILED http %s %s; %s' % (code, msg, note_base))
            common.append_rows(ledger, [row])
            if code == 429 or code >= 500:
                ra = None
                for k, v in (headers or {}).items():
                    if k.lower() == 'retry-after':
                        try:
                            ra = float(v)
                        except ValueError:
                            ra = None
                wait = ra if ra is not None else cfg['api']['backoff_base_s'] * (2 ** (attempt - 1))
                _sleep(min(wait, cfg['api']['backoff_max_s']), summary)
                continue
            js['status'] = 'failed'
            js['error'] = 'http %s %s' % (code, msg)
            break
        if not ok:
            if js.get('status') != 'failed':
                js['status'] = 'failed'
                js['error'] = js.get('error') or 'gave up after %d attempts' % max_attempts
            save_state(state_path, st)
            summary['failed'].append(job['id'])
            summary['status'] = 'failed'
    st['status'] = summary['status']
    save_state(state_path, st)
    return summary


def print_dry_run(cfg, jobs, ledger, show_prompts):
    total = estimate_jobs(cfg, jobs)
    spent = common.parse_ledger(ledger)['total'] if os.path.exists(ledger) else 0.0
    stop = min(cfg['stop_usd'], cfg['cap_total_usd'])
    print('DRY RUN: no network, nothing written. model %s, quality %s' % (cfg['api']['model'], cfg['api']['quality']))
    for j in jobs:
        e = j['est']
        print('- %s  size %s  est out %d + in_text %d tokens = %.4f USD  prompt %s (%d chars)'
              % (j['id'], j['size'], e['out'], e['in_text'], e['cost'], j['hash'], len(j['prompt'])))
        if show_prompts:
            print('  ---- PROMPT ----')
            print('\n'.join('  ' + ln for ln in j['prompt'].split('\n')))
            print('  ---- END ----')
    print('calls: %d | estimated total: %.4f USD (high prices out $%s/M, in-text $%s/M, in-image $%s/M)'
          % (len(jobs), total, cfg['prices_per_million']['out'], cfg['prices_per_million']['in_text'], cfg['prices_per_million']['in_image']))
    print('ledger so far: %.4f | cap (TOTAL) %.2f | stop %.2f | remaining to stop: %.4f'
          % (spent, cfg['cap_total_usd'], stop, stop - spent))
    fits = spent + total <= stop + 1e-9
    print('FITS: %s%s' % ('yes' if fits else 'NO', '' if fits else ' (run would pause at the cap; get the owner\'s OK to raise config.json)'))
    return fits, total


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('--batch')
    ap.add_argument('--classes')
    ap.add_argument('--kinds', help='comma list of master,idle,walk,attack,cast,roll,hit,death')
    ap.add_argument('--jobs', help='JSON file with a list of {id,prompt,size,note,out}')
    ap.add_argument('--dry-run', action='store_true')
    ap.add_argument('--live', action='store_true', help='allow real network calls')
    ap.add_argument('--show-prompts', action='store_true')
    ap.add_argument('--state')
    ap.add_argument('--ledger')
    ap.add_argument('--config')
    ap.add_argument('--out-dir')
    ap.add_argument('--sync-header', action='store_true')
    a = ap.parse_args(argv)
    cfg = common.load_config(a.config)
    ledger = common.ledger_path(cfg, a.ledger)
    if a.sync_header:
        common.sync_header(ledger, cfg)
        print('ledger header synced from config: ' + common.header_text(cfg))
        return EXIT_OK
    if a.jobs:
        jobs = common.read_json(a.jobs)
        for j in jobs:
            j.setdefault('note', '')
            j.setdefault('hash', prompt_builder.prompt_hash(j['prompt']))
            j.setdefault('out', os.path.join(common.WORK_DIR, 'adhoc', j['id'] + '.png'))
        label = os.path.basename(a.jobs)
    else:
        if not a.batch:
            ap.error('--batch or --jobs required')
        classes = a.classes.split(',') if a.classes else cfg['batches'][a.batch]['classes']
        kinds = a.kinds.split(',') if a.kinds else None
        jobs = jobs_for(cfg, a.batch, classes, kinds, out_root=a.out_dir)
        label = a.batch
    state_path = a.state or os.path.join(common.WORK_DIR, label if not a.jobs else 'adhoc', 'generate-state.json')
    if a.dry_run or not (a.live or os.environ.get('ART_HTTP_MOCK')):
        if not a.dry_run:
            print('(no --live flag: behaving as --dry-run)')
        print_dry_run(cfg, jobs, ledger, a.show_prompts)
        return EXIT_OK
    transport = make_transport(cfg, a.live)
    fits, total = print_dry_run(cfg, jobs, ledger, False)
    s = run_jobs(jobs, cfg, ledger, state_path, transport, label)
    print(json.dumps({k: s[k] for k in ('status', 'done', 'failed', 'paused_at', 'calls')}))
    return {'ok': EXIT_OK, 'failed': EXIT_FAILED, 'paused_cap': EXIT_PAUSED_CAP}[s['status']]


if __name__ == '__main__':
    sys.exit(main())
