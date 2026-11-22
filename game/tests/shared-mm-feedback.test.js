// Node: node game/tests/shared-mm-feedback.test.js   (feedback box: pure functions, pixeltown-feedback-v1, backup KNOWN, no network in source)
const fs = require('fs');
const path = require('path');
const F = require('../shared/mm-feedback.js');
const B = require('../shared/mm-backup.js');
let pass = 0, fail = 0;
function check(name, cond, extra) { if (cond) pass++; else { fail++; console.log('FAIL: ' + name + (extra ? ' ' + extra : '')); } }
function fake(init) {
  const m = Object.assign({}, init || {});
  return { getItem: (k) => (k in m ? m[k] : null), setItem: (k, v) => { m[k] = String(v); }, removeItem: (k) => { delete m[k]; }, _m: m };
}
const NOW = new Date('2026-11-22T10:15:42Z');

// clean: corrupt -> defaults
['', 'garbage{', 'null', '[1,2]', '{"entries":"x"}', 7, null, undefined, { entries: [null, 1, 'x', {}] }].forEach((bad, i) => {
  const c = F.clean(bad);
  check('corrupt #' + i + ' gives defaults', c.v === 1 && Array.isArray(c.entries) && c.entries.length === 0, JSON.stringify(c));
});

// add
let r = F.add(null, { k: 'bug', page: 'Realm!', text: '  The map  button overlaps chat  ', ua: 'phone' }, { now: NOW });
check('add ok', r.ok && r.state.entries.length === 1);
const e = r.entry;
check('entry has exactly the six fields', JSON.stringify(Object.keys(e).sort()) === JSON.stringify(['id', 'k', 'page', 't', 'text', 'ua']));
check('t is ISO minute', e.t === '2026-11-22T10:15Z', e.t);
check('kind kept, page sanitised, text trimmed, ua phone', e.k === 'bug' && e.page === 'realm' && e.text === 'The map  button overlaps chat' && e.ua === 'phone');
check('id is short lowercase alnum', /^[a-z0-9]{4,24}$/.test(e.id));
check('unknown kind -> other, unknown ua -> desktop', (() => { const x = F.add(null, { k: 'evil', text: 'x', ua: 'Mozilla/5.0 iPhone' }).entry; return x.k === 'other' && x.ua === 'desktop' && x.page === 'unknown'; })());
check('empty text refused', !F.add(null, { text: '   \n ' }).ok && F.add(null, { text: '' }).error === 'empty');
check('duplicate (same kind/page/text, case and spaces) refused', F.add(r.state, { k: 'bug', page: 'realm', text: 'the MAP button   overlaps chat' }).error === 'duplicate');
check('same text, other kind is allowed', F.add(r.state, { k: 'suggestion', page: 'realm', text: 'The map button overlaps chat' }).ok);
check('500 char cap', F.add(null, { text: 'a'.repeat(900) }).entry.text.length === 500);
check('control chars stripped, newlines kept', F.add(null, { text: 'a\u0000b‮c\nd' }).entry.text === 'abc\nd');
check('add does not mutate input state', (() => { const s0 = F.clean(null); F.add(s0, { text: 'hello' }); return s0.entries.length === 0; })());
check('extra input fields are not stored', !('name' in F.add(null, { text: 'x', name: 'Bob', email: 'a@b.c' }).entry));

// cap 20, newest kept
let st = F.clean(null);
for (let i = 0; i < 25; i++) st = F.add(st, { k: 'suggestion', page: 'hub', text: 'idea number ' + i }).state;
check('max 20 entries, oldest dropped', st.entries.length === 20 && st.entries[0].text === 'idea number 5' && st.entries[19].text === 'idea number 24');
check('ids unique', new Set(st.entries.map((x) => x.id)).size === 20);
const full = F.add(st, { text: 'one more' });
check('add at cap reports dropped', full.ok && full.dropped === 1 && full.state.entries.length === 20);

// remove
const victim = st.entries[3].id;
const st2 = F.remove(st, victim);
check('remove drops one by id', st2.entries.length === 19 && !st2.entries.some((x) => x.id === victim));
check('remove unknown id is a no-op', F.remove(st, 'nope1234').entries.length === 20);

// clean: dedupe by id and signature, field whitelist, bad ids
const dirty = { v: 1, entries: [
  { id: 'abcd1234', t: '2026-11-22T10:15Z', k: 'bug', page: 'town', text: 'one', ua: 'phone', extra: 'drop me' },
  { id: 'abcd1234', t: '2026-11-22T10:16Z', k: 'bug', page: 'town', text: 'dup id', ua: 'phone' },
  { id: 'efgh5678', t: 'yesterday', k: 'bug', page: 'town', text: 'ONE', ua: 'phone' },
  { id: '__proto__', k: 'bug', text: 'evil id' },
  { id: 'IJKL9999', text: 'uppercase id' },
  { id: 'mnop0000', t: '2026-11-22T10:15:00.000Z', text: 'good', page: '<script>' }
] };
const dc = F.clean(dirty);
check('clean dedupes by id and text signature, drops bad ids', dc.entries.length === 2 && dc.entries[0].id === 'abcd1234' && dc.entries[1].id === 'mnop0000', JSON.stringify(dc));
check('clean drops unknown fields', !('extra' in dc.entries[0]));
check('bad t -> epoch minute, page tags stripped', dc.entries[1].t === '1970-01-01T00:00Z' && dc.entries[1].page === 'script');
check('clean caps huge lists at 20', F.clean({ entries: Array.from({ length: 300 }, (_, i) => ({ id: 'id' + String(i).padStart(4, '0'), text: 't' + i })) }).entries.length === 20);

// export / parse round trip
const ex = F.toExport(st);
check('export format', ex.v === 1 && ex.app === 'pixeltown' && ex.entries.length === 20 && JSON.stringify(Object.keys(ex)) === '["v","app","entries"]');
const back = F.parseExport(F.exportText(st));
check('parseExport round trip', back.ok && JSON.stringify(back.entries) === JSON.stringify(ex.entries));
check('parseExport accepts a bare array', F.parseExport(JSON.stringify(ex.entries)).ok);
check('parseExport accepts a saved state', F.parseExport(JSON.stringify(st)).ok);
check('parseExport rejects other apps', F.parseExport({ v: 1, app: 'other', entries: [] }).error === 'wrong-app');
check('parseExport rejects garbage', ['nope', '"str"', '42', '{"v":1}', 'null'].every((s) => !F.parseExport(s).ok));
check('parseExport rejects very large input', F.parseExport('{"entries":[' + '"x",'.repeat(80000) + '"x"]}').error === 'too-big');
check('parseExport rejects too many entries', F.parseExport({ entries: Array.from({ length: 401 }, () => ({})) }).error === 'too-many');
// hostile input: prototype pollution must not happen and must not throw
const hostile = '{"__proto__":{"polluted":1},"app":"pixeltown","entries":[{"__proto__":{"polluted":2},"id":"aaaa1111","text":"hi","constructor":{"prototype":{"polluted":3}}},' +
  '{"id":"bbbb2222","text":{"toString":"x"}},{"id":"cccc3333","text":"ok","k":{"__proto__":"bug"}}]}';
const h = F.parseExport(hostile);
check('hostile __proto__ input parses without pollution', h.ok && ({}).polluted === undefined && Object.prototype.polluted === undefined, JSON.stringify(h));
check('hostile entries reduced to clean fields', h.entries.length === 2 && h.entries.every((x) => Object.keys(x).length === 6 && typeof x.text === 'string') && h.entries[1].k === 'other');
const getterObj = { app: 'pixeltown', get entries() { throw new Error('boom'); } };
check('parseExport never throws on getters', F.parseExport(getterObj).ok === false);

// storage
const s = fake();
check('load on empty storage gives defaults', F.load(s).entries.length === 0);
check('save writes the new key only', F.save(s, st) && Object.keys(s._m).join() === 'pixeltown-feedback-v1' && F.KEY === 'pixeltown-feedback-v1');
check('load after save', F.load(s).entries.length === 20);
s._m['pixeltown-feedback-v1'] = '{broken';
check('corrupt stored value loads defaults', F.load(s).entries.length === 0);
check('throwing storage is tolerated', F.load({ getItem() { throw new Error('x'); } }).entries.length === 0 && F.save({ setItem() { throw new Error('q'); } }, st) === false);
check('mount without a DOM returns null', F.mount({}, { page: 'x' }) === null);

// backup includes the key and cleans through the owner
check('MMBackup.KNOWN includes pixeltown-feedback-v1 with a label', B.KNOWN.indexOf(F.KEY) >= 0 && B.labelOf(F.KEY) !== F.KEY);
const bs = fake({ 'pixeltown-feedback-v1': JSON.stringify(st) });
check('backup bundle includes feedback notes', typeof B.bundle(bs).keys[F.KEY] === 'string');
const dst = fake();
const rr = B.restore(dst, { format: 'pixeltown-backup', v: 2, keys: { [F.KEY]: JSON.stringify(dirty) } });
check('backup restore cleans feedback through MMFeedback.clean', rr.ok && JSON.parse(dst._m[F.KEY]).entries.length === 2);
check('backup refuses a non-object feedback value', !B.plan({ format: 'pixeltown-backup', v: 2, keys: { [F.KEY]: '[1]' } }).ok);

// source rules: no network, no innerHTML, no firebase
const src = fs.readFileSync(path.join(__dirname, '../shared/mm-feedback.js'), 'utf8').replace(/^\s*\/\/.*$/gm, '');
['fetch(', 'XMLHttpRequest', 'WebSocket', 'sendBeacon', 'innerHTML', 'outerHTML', 'insertAdjacentHTML', 'firebase', 'mailto:', '.submit(', 'document.write', 'eval(', 'new Function']
  .forEach((w) => check('source never uses ' + w, src.indexOf(w) < 0));

console.log(`shared-mm-feedback: ${pass} passed, ${fail} failed`);
console.log(fail ? `${fail} FAILED` : 'ALL PASSED');
process.exitCode = fail ? 1 : 0;
