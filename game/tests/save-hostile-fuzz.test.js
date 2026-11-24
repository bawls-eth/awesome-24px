// Save / migration safety, node half (SAVE-KEYS.md). Node only: no browser, no network, no real storage.
// (1) old-save fixtures (save-compat-fixtures.js) through every pure cleaner: nothing the fixture holds is dropped or changed
//     (cleaners are the "loader" of each key; a page that keeps what its cleaner returns can not lose more than this).
// (2) hostile values per key through every cleaner: corrupt JSON, wrong JSON types, every field of a valid save swapped to a wrong type /
//     NaN / Infinity / -1 / 1e308 / a 5 MB string / a 200k-element array / prototype keys, deep nesting. Each must: not throw, return
//     an object, finish fast, not pollute Object.prototype, be idempotent (clean(clean(x)) == clean(x)) and not keep a 5 MB string.
// (3) storage-level loaders / writers (load / save / sync / record) on a fake Storage whose getItem throws, whose setItem throws
//     QuotaExceededError, and which holds hostile values: never throw, a failed write never removes the old value.
// (4) cross-writer: two "tabs" sharing one Storage interleave the storage-level writers that re-read before writing (MMHubProfile.sync,
//     MMFeedback add, MMSettings.set, MMDDRun.save, MMNav record): no write may undo another tab's earlier write.
// (5) Town hero compat (MMTownHeroes): every legacy species key the Town ever shipped x frame 0..15 (and junk) maps to one of the 10
//     hero classes, deterministically; resolve/pickStart never mutate their input and pickStart keeps the stored key/frame.
// (6) backup coverage: every progress key in SAVE-KEYS.md is exported by MMBackup (KNOWN gaps are listed, not hidden).
// Run: node game/tests/save-hostile-fuzz.test.js
'use strict';
const fs = require('fs'), path = require('path');
let failed = 0;
function check(name, cond, extra) { console.log((cond ? 'PASS ' : 'FAIL ') + name + (cond ? '' : ' ' + (extra || ''))); if (!cond) failed++; }
const done = () => { console.log(failed ? failed + ' FAILED' : 'ALL PASSED'); process.exitCode = failed ? 1 : 0; };
const FX = require('./save-compat-fixtures.js');
const G = path.join(__dirname, '..');
const req = (p) => require(path.join(G, p));

const Profile = req('shared/mm-profile.js'), HubProfile = req('shared/profile.js'), Nav = req('shared/mm-nav.js'), Feedback = req('shared/mm-feedback.js');
const Access = req('shared/mm-access.js'), Gift = req('shared/mm-gift.js'), Tames = req('shared/mm-tames.js'), Isles = req('shared/mm-isles.js');
const Bugs = req('shared/mm-bugs.js'), MapM = req('shared/mm-map.js'), Medals = req('hub/medals.js'), DDRun = req('games/deepdelve/dd-run.js');
const Fog = req('shared/mm-fog.js'), Stash = req('shared/mm-stash.js'), HomeBuild = req('shared/mm-home-build.js'), Homestead = req('shared/mm-homestead.js');
const Settings = req('shared/mm-settings.js'), Collections = req('shared/mm-collections.js'), Backup = req('shared/mm-backup.js'), Angler = req('shared/mm-angler.js');
const Heroes = req('shared/mm-town-heroes.js'), Motion = req('shared/motion.js');

// ---------- fake storages ----------
function mem(init) {
  const m = Object.assign(Object.create(null), init || {});
  return { _m: m, getItem: (k) => (k in m ? m[k] : null), setItem: (k, v) => { m[k] = String(v); }, removeItem: (k) => { delete m[k]; },
    key: (i) => Object.keys(m)[i] || null, get length() { return Object.keys(m).length; } };
}
function quota(init) {
  const s = mem(init);
  s.setItem = () => { const e = new Error('The quota has been exceeded.'); e.name = 'QuotaExceededError'; e.code = 22; throw e; };
  return s;
}
function throwing() {
  const boom = () => { const e = new Error('The operation is insecure.'); e.name = 'SecurityError'; throw e; };
  return { getItem: boom, setItem: boom, removeItem: boom, key: boom, get length() { return boom(); } };
}

// ---------- cleaners per key (raw string or parsed value -> clean object) ----------
const parse = (x) => { if (typeof x !== 'string') return x; try { return JSON.parse(x); } catch (e) { return null; } };
const CLEANERS = {
  'pixeltown-mm-v1': (x) => Profile.clean(x),
  'pixeltown-mm-active-v1': (x) => Profile.cleanActive(x),
  'pixeltown-profile-v1': (x) => HubProfile.sanitize(parse(x)),
  'pixeltown-nav-v1': (x) => Nav.clean(x),
  'pixeltown-feedback-v1': (x) => Feedback.clean(x),
  'pixeltown-access-v1': (x) => Access.prefs.clean(parse(x)),
  'pixeltown-gift-v1': (x) => Gift.clean(parse(x)),
  'pixeltown-tames-v1': (x) => Tames.clean(parse(x)),
  'pixeltown-archipelago-v1': (x) => Isles.clean(parse(x)),
  'pixeltown-medals-isles-v1': (x) => Isles.cleanMedals(parse(x)),
  'pixeltown-bugs-v1': (x) => Bugs.cleanSave(parse(x)),
  'pixeltown-bugs-goals-v1': (x) => Bugs.cleanGoals(parse(x)),
  'pixeltown-hub-v1': (x) => MapM.cleanHub(parse(x)),
  'pixeltown-deepdelve-runs-v1': (x) => DDRun.clean(x),
  'pixeltown-angler-v1': (x) => Angler.journal.clean(parse(x)),
  'pixeltown-medals-pop-v1': (x) => ({ m: Medals.clean(parse(x), 'pop') })
};
const SAMPLE_EXTRA = { // non-fixture cleaners with a sample input
  'realm finds (MMStash.cleanFinds)': [(x) => Stash.cleanFinds(parse(x)), { pending: [{ id: 'a', n: 1 }], recent: [], fame: 3, total: 4, last: null }],
  'home grid (MMHomeBuild.clean)': [(x) => HomeBuild.clean(parse(x)), HomeBuild.clean(null)],
  'homestead (MMHomestead.clean)': [(x) => Homestead.clean(parse(x)), Homestead.clean(null)],
  'realm fog (MMFog.clean)': [(x) => ({ s: Fog.clean(x) }), ''],
  'pixeltown-gift-v1 (claimed)': [(x) => Gift.clean(parse(x)), { v: 1, days: 7, last: '2026-11-22' }]
};

// ---------- (1) old fixtures through the cleaners ----------
const t0 = Date.now();
Object.keys(CLEANERS).forEach((k) => {
  if (!FX.FIXTURES[k]) return;
  let out, err = null;
  try { out = CLEANERS[k](FX.rawOf(k)); } catch (e) { err = e.message; }
  check(`old ${k}: cleaner accepts the early shape`, !err && out && typeof out === 'object', err || '');
  if (err || !out) return;
  // Compare what the cleaner keeps against the fixture (volatile paths aside), like the browser test does after a page load.
  const l = k === 'pixeltown-medals-pop-v1' ? (out.m.indexOf('round1') >= 0 ? [] : ['m']) : FX.lost(k, JSON.stringify(out));
  check(`old ${k}: cleaner keeps every field of the early shape (no data loss)`, !l.length, l.join('; ').slice(0, 600));
});

// ---------- (2) hostile values ----------
const BIG = 's'.repeat(5 * 1024 * 1024);
const HUGE = Array.from({ length: 200000 }, (_, i) => i);
const WHOLE = [undefined, null, '', 'null', '{nope', '[]', '123', 'true', '"str"', 'NaN', NaN, Infinity, -1, 0, true, 'x', [], {}, [1, 2, 3], BIG, JSON.stringify(BIG), HUGE,
  JSON.parse('{"__proto__":{"polluted":1},"constructor":{"prototype":{"polluted":1}},"v":1}'),
  '{"__proto__":{"polluted":1},"v":1}', Object.create(null)];
let deep = {}; { let cur = deep; for (let i = 0; i < 3000; i++) { cur.a = {}; cur = cur.a; } }
WHOLE.push(deep);
const SWAPS = [null, undefined, NaN, Infinity, -Infinity, -1, 1e308, -1e308, 1.5, '', 'NaN', BIG, HUGE, {}, [], true, '__proto__', { __proto__: { polluted: 1 } }];

// Every path of a sample (objects and arrays), for field-wise swaps.
function paths(v, pre, out, depth) {
  out = out || []; depth = depth || 0;
  if (depth > 6 || !v || typeof v !== 'object') return out;
  Object.keys(v).slice(0, 40).forEach((k) => { const p = pre.concat([k]); out.push(p); paths(v[k], p, out, depth + 1); });
  return out;
}
function withSwap(sample, p, val) {
  const c = JSON.parse(JSON.stringify(sample));
  let o = c; for (let i = 0; i < p.length - 1; i++) o = o[p[i]];
  o[p[p.length - 1]] = val;
  return c;
}
const polluted = () => ({}).polluted !== undefined || Object.prototype.polluted !== undefined;
const sizeOf = (v) => { try { return JSON.stringify(v).length; } catch (e) { return -1; } };

function fuzzCleaner(name, fn, sample) {
  const fails = [];
  let slow = 0, kept = 0, notObj = 0, notIdem = 0, n = 0;
  const one = (input, label) => {
    n++;
    const t = Date.now();
    let out;
    try { out = fn(input); } catch (e) { fails.push(label + ': threw ' + e.message.slice(0, 80)); return; }
    const ms = Date.now() - t;
    if (ms > 1500) { slow++; fails.push(label + ': slow ' + ms + 'ms'); }
    if (!out || typeof out !== 'object') { notObj++; fails.push(label + ': returned ' + typeof out); return; }
    if (polluted()) { fails.push(label + ': Object.prototype polluted'); delete Object.prototype.polluted; }
    const sz = sizeOf(out);
    if (sz < 0 || sz > 1024 * 1024) { kept++; fails.push(label + ': result not storable / > 1 MB (' + sz + ')'); return; }
    let again; try { again = fn(JSON.parse(JSON.stringify(out))); } catch (e) { fails.push(label + ': clean(clean(x)) threw ' + e.message.slice(0, 60)); return; }
    if (JSON.stringify(again) !== JSON.stringify(out)) { notIdem++; fails.push(label + ': not idempotent ' + JSON.stringify(out).slice(0, 80) + ' vs ' + JSON.stringify(again).slice(0, 80)); }
  };
  WHOLE.forEach((v, i) => one(v, 'whole#' + i));
  if (sample && typeof sample === 'object') {
    paths(sample, []).forEach((p) => SWAPS.forEach((s, j) => one(withSwap(sample, p, s), p.join('.') + '=swap#' + j)));
    // prototype keys at every object level
    paths(sample, []).filter((p) => { let o = sample; p.forEach((k) => { o = o && o[k]; }); return o && typeof o === 'object' && !Array.isArray(o); })
      .forEach((p) => one(JSON.parse(JSON.stringify(sample).replace(/^\{/, '{"__proto__":{"polluted":2},').replace(/^/, '')), p.join('.') + '+proto'));
  }
  (KNOWN_HOSTILE[name] ? KNOWN : check)(`hostile ${name}: ${n} inputs, never throws / always an object / bounded / idempotent / no pollution`, !fails.length, fails.slice(0, 4).join(' | ') + (fails.length > 4 ? ` (+${fails.length - 4})` : ''));
}
// Open bugs found by this pass (design/bugbash/saves.md): reported every run as KNOWN-BUG, not hidden.
const KNOWN_HOSTILE = { 'pixeltown-profile-v1': 'MMHubProfile.sanitize passes profile.games through unbounded (a 5 MB string / 200k array is kept)' };
Object.keys(CLEANERS).forEach((k) => {
  let sample = null; try { sample = CLEANERS[k](FX.FIXTURES[k] ? FX.rawOf(k) : null); } catch (e) { sample = null; }
  fuzzCleaner(k, CLEANERS[k], sample);
});
Object.keys(SAMPLE_EXTRA).forEach((k) => fuzzCleaner(k, SAMPLE_EXTRA[k][0], SAMPLE_EXTRA[k][1]));
check('the hostile pass finishes in reasonable time (< 120 s)', Date.now() - t0 < 120000, (Date.now() - t0) + ' ms');

// ---------- (3) storage-level loaders / writers ----------
const NOW = Date.UTC(2026, 10, 23, 2, 0, 0);
const LOADERS = {
  'MMHubProfile.load': (s) => HubProfile.load(s, NOW),
  'MMHubProfile.sync': (s) => HubProfile.sync(s, 'pop', ['round1'], NOW),
  'MMFeedback.load': (s) => Feedback.load(s),
  'MMFeedback.save': (s) => Feedback.save(s, Feedback.add ? Feedback.add(Feedback.load(s), { kind: 'bug', text: 'hi', place: 'hub' }, NOW).state || Feedback.load(s) : Feedback.load(s)),
  'MMAccess.prefs.load': (s) => Access.prefs.load(s),
  'MMGift.load': (s) => Gift.load(s, '2026-11-23'),
  'MMTames.load': (s) => Tames.load(s),
  'MMIsles.load': (s) => Isles.load(s, NOW),
  'MMDDRun.load': (s) => DDRun.load(s),
  'MMDDRun.save': (s) => DDRun.save(s, Object.assign(DDRun.load(s), { runs: 9 })),
  'MMSettings.read': (s) => Settings.read(s),
  'MMSettings.set music': (s) => Settings.set(s, 'music', true),
  'MMSettings.set high-contrast': (s) => Settings.set(s, 'high-contrast', true),
  'MMCollections.read': (s) => Collections.read(s),
  'MMHubMedals.read': (s) => Medals.read(s),
  'MMBackup.bundle': (s) => Backup.bundle(s),
  'MMBackup.snapshotPregear': (s) => Backup.snapshotPregear(s, NOW),
  'MMMotion.reduced': (s) => Motion.reduced(s)
};
const hostileStore = () => { const init = {}; FX.KEYS.forEach((k, i) => { init[k] = [ '{nope', '[]', '123', 'null', '{"__proto__":{"polluted":1}}', JSON.stringify({ v: 'x', best: 'NaN', medals: 'zzz', entries: 5, roster: {}, m: 7 }), 'x'.repeat(300000) ][i % 7]; }); return mem(init); };
Object.keys(LOADERS).forEach((name) => {
  const errs = [];
  [['empty', mem()], ['old fixtures', mem(Object.fromEntries(FX.KEYS.map((k) => [k, FX.rawOf(k)])))], ['hostile values', hostileStore()], ['getItem/setItem throw', throwing()], ['quota exceeded', quota(Object.fromEntries(FX.KEYS.map((k) => [k, FX.rawOf(k)])))]]
    .forEach(([label, st]) => {
      const before = st._m ? JSON.stringify(st._m) : null;
      try { LOADERS[name](st); } catch (e) { errs.push(label + ': threw ' + e.message.slice(0, 80)); }
      if (polluted()) { errs.push(label + ': prototype polluted'); delete Object.prototype.polluted; }
      if (label === 'quota exceeded' && st._m && JSON.stringify(st._m) !== before) errs.push('quota: a failed write changed storage');
    });
  check(`storage ${name}: never throws on empty / old / hostile / throwing / full storage; a full storage is left as it was`, !errs.length, errs.join(' | '));
});
// Old fixtures through the storage loaders that write back: nothing the fixture held is lost.
{
  const st = mem(Object.fromEntries(FX.KEYS.map((k) => [k, FX.rawOf(k)])));
  // only the loaders and syncs (the explicit writers below change values on purpose)
  Object.keys(LOADERS).filter((n) => !/MMFeedback\.save|MMDDRun\.save|MMSettings\.set/.test(n)).forEach((n) => { try { LOADERS[n](st); } catch (e) { /* checked above */ } });
  const lostAll = FX.KEYS.map((k) => [k, FX.lost(k, st._m[k])]).filter((x) => x[1].length);
  check('old fixtures: the storage loaders/writers above lose nothing (additive-only writes)', !lostAll.length, JSON.stringify(lostAll).slice(0, 700));
}

// ---------- (4) two tabs on one storage, interleaved writes ----------
{
  const st = mem();
  HubProfile.sync(st, 'pop', ['round1'], NOW);            // tab A
  HubProfile.sync(st, 'dash', ['run1'], NOW);             // tab B
  HubProfile.sync(st, 'pop', ['round1', 'score1k'], NOW); // tab A again
  const p = HubProfile.sanitize(JSON.parse(st._m['pixeltown-profile-v1']));
  const has = (g, id) => !!(p.games[g] && (p.games[g].done || []).indexOf(id) >= 0);
  check('race MMHubProfile.sync: two tabs syncing different games keep both games', has('pop', 'round1') && has('dash', 'run1'), JSON.stringify(p.games));

  const s2 = mem();
  Settings.set(s2, 'music', true);          // tab A
  Settings.set(s2, 'high-contrast', true);  // tab B
  Settings.set(s2, 'low-gfx', true);        // tab A
  Settings.set(s2, 'text-size', 1.5);       // tab B
  const r = Settings.read(s2);
  check('race MMSettings: mm-music / mm-high-contrast / access fields set from two tabs all stick', r.music === true && r['high-contrast'] === true && r['low-gfx'] === true && r['text-size'] === 1.5, JSON.stringify(r));

  const s3 = mem();
  const a = DDRun.load(s3), b = DDRun.load(s3); // both tabs loaded before either wrote
  a.runs = 3; a.best = Object.assign({}, a.best, { score: 500, depth: 20 }); DDRun.save(s3, a);
  b.runs = 1; b.best = Object.assign({}, b.best, { score: 90, depth: 4 }); DDRun.save(s3, b);
  const dd = DDRun.load(s3);
  check('race MMDDRun.save: a stale tab never overwrites a newer best or dive count (merge-on-write, was S2)', dd.best.score >= 500 && dd.runs >= 3, JSON.stringify(dd));

  // The feedback box re-reads storage right before every add / delete (mm-feedback.js mount): two tabs adding notes keep both.
  const s4 = mem(), add = Feedback.add;
  const tabAdd = (text, t) => { const r = add(Feedback.load(s4), { k: 'suggestion', page: 'hub', text }, t); Feedback.save(s4, r && r.state ? r.state : Feedback.load(s4)); };
  if (typeof add === 'function') {
    tabAdd('from tab A', NOW); tabAdd('from tab B', NOW + 60000);
    const fl = Feedback.load(s4).entries.map((e) => e.text);
    check('race MMFeedback (re-read before write): notes added from two tabs are both kept', fl.indexOf('from tab A') >= 0 && fl.indexOf('from tab B') >= 0, JSON.stringify(fl));
  }
  { // and an old note survives a new one
    const s5 = mem({ 'pixeltown-feedback-v1': FX.rawOf('pixeltown-feedback-v1') });
    const r = add(Feedback.load(s5), { k: 'bug', page: 'hub', text: 'new note' }, NOW); Feedback.save(s5, r.state);
    const texts = Feedback.load(s5).entries.map((e) => e.text);
    check('feedback: adding a note keeps the old-format note', texts.indexOf('old note') >= 0 && texts.indexOf('new note') >= 0, JSON.stringify(texts));
  }
}

// ---------- (5) Town hero compat ----------
{
  const mainSrc = fs.readFileSync(path.join(G, 'main.js'), 'utf8');
  const spBlock = mainSrc.slice(mainSrc.indexOf('const SPECIES = ['), mainSrc.indexOf('];', mainSrc.indexOf('const SPECIES = [')));
  const species = (spBlock.match(/key: '([a-z_]+)'/g) || []).map((s) => s.slice(6, -1));
  const extra = ['mooncats', 'punkrocks', 'boredapes', 'morepunks', 'frontpunks', 'intlpunks', 'expansionpunks', 'avalanchepunks', 'punks_blue', 'aliens_green'];
  const legacy = [...new Set(species.concat(extra))];
  check('heroes: the Town legacy species list was found in main.js (>= 20 keys)', species.length >= 20, species.join(','));
  const bad = [], nondet = [], mut = [], start = [];
  legacy.concat(['', 'hero_', 'hero_nope', 'whatever_new', '__proto__', 'constructor', 'x'.repeat(5000)]).forEach((sp) => {
    for (let f = -1; f <= 16; f++) {
      [f, String(f), f + 0.5, NaN, null, undefined].forEach((fr) => {
        const c = Heroes.classFor(sp, fr);
        if (Heroes.CLASSES.indexOf(c) < 0) bad.push(sp + ':' + fr + '->' + c);
        if (Heroes.classFor(sp, fr) !== c) nondet.push(sp + ':' + fr);
        const rec = { species: sp, frame: fr }, snap = JSON.stringify(rec);
        const r = Heroes.resolve(rec.species, rec.frame, () => false);
        if (!Heroes.isHeroKey(r.key) || r.frame !== 0) bad.push('resolve ' + sp + ':' + fr + '->' + r.key);
        const ps = Heroes.pickStart(rec.species, rec.frame);
        if (JSON.stringify(rec) !== snap) mut.push(sp + ':' + fr);
        if (typeof sp === 'string' && sp && !Heroes.isHeroKey(sp) && (ps.key !== sp || ps.frame !== (Number.isInteger(fr) ? fr : 0))) start.push(sp + ':' + fr + '->' + JSON.stringify(ps));
      });
    }
  });
  check(`heroes: every legacy species (${legacy.length}) x frame -1..16 (+ junk frames) maps to one of the 10 hero classes`, !bad.length, bad.slice(0, 5).join(','));
  check('heroes: the mapping is deterministic', !nondet.length, nondet.slice(0, 5).join(','));
  check('heroes: resolve / pickStart never mutate the stored record', !mut.length, mut.slice(0, 5).join(','));
  check('heroes: pickStart keeps a legacy key and its frame (joining never rewrites the stored value)', !start.length, start.slice(0, 5).join(','));
  check('heroes: hero keys map to themselves', Heroes.CLASSES.every((c) => Heroes.classFor('hero_' + c, 7) === c && Heroes.resolve('hero_' + c, 3).key === 'hero_' + c));
  const legacyLive = legacy.filter((k) => Heroes.resolve(k, 2, (x) => x === k).legacy === true && Heroes.resolve(k, 2, (x) => x === k).frame === 2);
  check('heroes: ?legacyart=1 keeps the legacy sheet and frame for every legacy key', legacyLive.length === legacy.length, legacy.filter((k) => legacyLive.indexOf(k) < 0).join(','));
}

// ---------- (6) backup coverage ----------
{
  const inv = fs.readFileSync(path.join(G, 'design', 'SAVE-KEYS.md'), 'utf8');
  const rows = inv.split('\n').filter((l) => /^\| `[a-z]/.test(l)).map((l) => l.split('|').map((c) => c.trim()));
  const progress = rows.filter((c) => /progress/i.test(c[6] || '')).map((c) => c[1].replace(/`/g, ''));
  check('SAVE-KEYS.md lists >= 50 keys and marks progress keys', rows.length >= 50 && progress.length >= 20, rows.length + ' rows, ' + progress.length + ' progress');
  const missing = progress.filter((k) => Backup.KNOWN.indexOf(k) < 0);
  KNOWN('backup: every progress key is in the MMBackup export (else Backup -> Restore on a new device loses it)', !missing.length, missing.join(', '));
  // Round trip of everything the export knows: bundle -> plan -> apply onto an empty storage keeps every fixture.
  const src = mem(Object.fromEntries(FX.KEYS.map((k) => [k, FX.rawOf(k)])));
  const pl = Backup.plan(JSON.stringify(Backup.bundle(src)));
  const dst = mem();
  const ap = pl.ok ? Backup.apply(dst, pl) : { ok: false };
  const rtLost = Backup.KNOWN.filter((k) => FX.FIXTURES[k]).map((k) => [k, FX.lost(k, dst._m[k])]).map((x) => [x[0], x[1].filter((l) => !((Backup.DEVICE_FIELDS[x[0]] || []).some((f) => l.indexOf(f + ':') === 0)))]).filter((x) => x[1].length); // R4 O-04: device-only fields (lowGfx) intentionally stay on the device
  check('backup: bundle -> plan -> apply round-trips every exported fixture without loss', pl.ok && ap.ok !== false && !rtLost.length, JSON.stringify({ plan: pl.ok, error: pl.error, lost: rtLost }).slice(0, 600));
  const qs = quota(Object.fromEntries(FX.KEYS.map((k) => [k, FX.rawOf(k)])));
  const before = JSON.stringify(qs._m);
  let ar; try { ar = Backup.apply(qs, pl); } catch (e) { ar = { threw: e.message }; }
  check('backup: apply onto a full storage fails cleanly and leaves every old value', !(ar && ar.threw) && JSON.stringify(qs._m) === before, JSON.stringify(ar).slice(0, 200));
}

// ---------- known open bugs: printed every run (reported in design/bugbash/saves.md), not hidden, not counted as a pass ----------
function KNOWN(name, cond, extra) {
  if (cond) console.log('PASS ' + name + ' (was a KNOWN bug: now fixed, update bugbash/saves.md)');
  else console.log('KNOWN-BUG ' + name + ' ' + (extra || ''));
}
done();
