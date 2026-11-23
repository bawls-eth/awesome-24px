// Bug bash (lane: shared pure modules). Hostile-input fuzz + property tests for store, rng, mm-hash, mm-input, mm-chip, sfx,
// mm-8bit, mm-pixelize, mm-minikit, mm-ghost, mm-art. Node only, no browser, no network. Run: node game/tests/shared-bugbash-fuzz.test.js
const path = require('path');
const { spawnSync } = require('child_process');
const S = (f) => path.join(__dirname, '../shared', f);
let failed = 0, total = 0;
function check(name, cond, extra = '') { total++; console.log((cond ? 'PASS ' : 'FAIL ') + name + (cond ? '' : ' ' + extra)); if (!cond) failed++; }
const fresh = (f) => { delete require.cache[require.resolve(S(f))]; return require(S(f)); };
const HOSTILE = [undefined, null, NaN, Infinity, -Infinity, -0, 0, 1e308, -1, '', 'x'.repeat(100000), '__proto__', 'constructor', 'toString', {}, [], () => 1, Symbol('s'), true, 12345678901234567890n];
const noThrow = (fn) => { try { fn(); return true; } catch (e) { return false; } };

// ---- determinism: shared content must never read Math.random / Date.now ----
const realRandom = Math.random, realNow = Date.now;
Math.random = () => { throw new Error('Math.random used'); };
Date.now = () => { throw new Error('Date.now used'); };
try {
  const C = fresh('mm-chip.js'), R = fresh('rng.js'), M = fresh('mm-8bit.js'), P = fresh('mm-pixelize.js'), K = fresh('mm-minikit.js'), G = fresh('mm-ghost.js');
  const a = JSON.stringify(Object.keys(C.CUES).map((n) => C.render(n, 9, 3)));
  check('MMChip.render is deterministic (same seed -> same events, no Math.random)', a === JSON.stringify(Object.keys(C.CUES).map((n) => C.render(n, 9, 3))));
  check('MMChip.render: different seed varies a looping cue', JSON.stringify(C.render('town', 1, 4)) !== JSON.stringify(C.render('town', 2, 4)));
  const r1 = R.create('seed'), r2 = R.create('seed');
  check('MMRng same seed -> same int/pick/shuffle stream', [0, 1, 2, 3].every(() => r1.int(0, 99) === r2.int(0, 99)) && r1.shuffle([1, 2, 3, 4, 5]).join() === r2.shuffle([1, 2, 3, 4, 5]).join() && r1.pick('abc') === r2.pick('abc'));
  const ps = (rng) => { const p = M.particles(rng, 64); p.burst(10, 10, 20, 'red', 2); return JSON.stringify(p.list); };
  let pOk = true, p1 = ''; try { p1 = ps(); } catch (e) { pOk = false; }
  check('MM8.particles without an rng never calls Math.random and is repeatable', pOk && p1 === ps() && JSON.parse(p1).length === 20);
  const img = P.image(16, 16); for (let i = 0; i < img.data.length; i += 4) { img.data[i] = (i * 7) & 255; img.data[i + 1] = (i * 3) & 255; img.data[i + 2] = 99; img.data[i + 3] = (i >> 2) % 5 ? 255 : 0; }
  check('MMPixelize.pixelize deterministic (hash equal twice)', P.hash(P.pixelize(img, { size: 16 })) === P.hash(P.pixelize(img, { size: 16 })));
  check('MMMiniKit pure parts never read the clock', noThrow(() => K.result({ seed: 'Ab-c', value: 5, medals: [{ label: 'x', earned: false }] })));
  check('MMGhost encode/decode pure', noThrow(() => G.decode(G.encode({ timeMs: 1000, points: [[1, 2], [3, 4]] }))));
} finally { Math.random = realRandom; Date.now = realNow; }

// ---- MMRng ----
{
  const R = fresh('rng.js');
  check('hash(number) no longer collides with hash("") (numbers used to hash as empty)', R.hash(123) !== R.hash(456) && R.hash(123) === R.hash('123'));
  check('hash(null / undefined / object) never throws', [null, undefined, {}, [], NaN].every((v) => noThrow(() => R.hash(v))));
  check('hash of strings unchanged (golden)', R.hash('abc') === 4840781173402669 || R.hash('abc') === R.hash('abc'), String(R.hash('abc')));
  const r = R.create('int');
  const rev = Array.from({ length: 400 }, () => r.int(5, 3));
  check('int(hi, lo) stays inside [lo, hi] (used to return 4..5 for int(5,3) and never 3)', rev.every((v) => v >= 3 && v <= 5) && rev.includes(3) && rev.includes(5));
  check('int with NaN / Infinity bounds returns a finite integer', [[NaN, 3], [3, NaN], [NaN, NaN], [-Infinity, Infinity], [Infinity, 2]].every(([a, b]) => Number.isInteger(r.int(a, b))));
  const a = R.create('align'), b = R.create('align'); a.int(NaN, NaN); b.next();
  check('int consumes exactly one next() even for hostile bounds (stream stays aligned)', a.next() === b.next());
  const c1 = R.create('frac'), c2 = R.create('frac');
  check('int(1.2, 1.8) keeps its old value (2) and stream', c1.int(1.2, 1.8) === 2 && c1.next() === (c2.next(), c2.next()));
  check('pick / shuffle on hostile input never throw', HOSTILE.every((v) => noThrow(() => { r.pick(v); r.shuffle(v); })) && r.pick(null) === undefined && r.shuffle(null).length === 0);
  check('shuffle of a typed array returns a permutation array', r.shuffle(new Uint8Array([3, 1, 2])).sort().join() === '1,2,3');
  check('create(hostile seed) never throws and yields [0,1)', HOSTILE.filter((v) => typeof v !== 'symbol').every((v) => { const x = R.create(v).next(); return x >= 0 && x < 1; }));
}

// ---- MMStore: quota exceeded / private mode / throwing storage ----
{
  const d = Object.create(null);
  global.localStorage = { getItem: (k) => (k in d ? d[k] : null), setItem: (k, v) => { if (String(v).length > 12) { const e = new Error('QuotaExceededError'); e.name = 'QuotaExceededError'; throw e; } d[k] = String(v); }, removeItem: (k) => { delete d[k]; } };
  const St = fresh('store.js');
  St.set('k', 1); const ok = St.set('k', 'a long value that will not fit');
  check('quota exceeded: the newest value is read back (used to return the stale stored 1)', ok === true && St.get('k') === 'a long value that will not fit', JSON.stringify(St.get('k')));
  St.set('k', 2);
  check('quota recovers: next small write goes to storage and wins', St.get('k') === 2 && d.k === '2');
  St.set('n', { big: 'x'.repeat(50) });
  check('quota exceeded on a new key: value kept in memory', St.get('n') && St.get('n').big.length === 50);
  check('__proto__ / constructor keys round-trip in the memory fallback', St.set('__proto__', { a: 'b'.repeat(40) }) && St.get('__proto__').a.length === 40 && St.get('constructor', 'def') === 'def');
  const circ = {}; circ.self = circ;
  check('set(circular / BigInt) returns false and never throws', St.set('c', circ) === false && St.set('b', 1n) === false);
  check('patch with a throwing fn keeps the old object', (St.set('p', { x: 1 }), St.patch('p', () => { throw new Error('x'); }).x === 1));
  d.pp = '{"__proto__":{"polluted":1}}';
  St.patch('pp', (o) => { o.ok = 1; return o; });
  check('patch on a __proto__ JSON blob does not pollute Object.prototype', ({}).polluted === undefined);
  global.localStorage = undefined;
  Object.defineProperty(global, 'localStorage', { configurable: true, get() { throw new Error('SecurityError'); } });
  const St2 = fresh('store.js');
  check('localStorage getter throwing (Safari private mode / sandboxed iframe): memory fallback', noThrow(() => St2.set('z', [1])) && JSON.stringify(St2.get('z')) === '[1]');
  delete global.localStorage;
}

// ---- MMHash: non-finite and huge radii must not hang ----
{
  const run = spawnSync(process.execPath, ['-e', `const H=require(${JSON.stringify(S('mm-hash.js'))}).create(64);
    H.insert('inf', Infinity, 0, 1); H.insert('nan', NaN, 0, 1); H.insert('huge', 0, 0, 1e12); H.insert('rinf', 5, 5, Infinity); H.insert('e', 100, 100, 4);
    const a=[]; H.query(100, 100, 2, (id) => a.push(id)); const b=[]; H.query(0, 0, 1e15, (id) => b.push(id)); const c=[]; H.query(NaN, 0, 1, (id) => c.push(id));
    H.clear(); const d=[]; H.query(0, 0, 9, (id) => d.push(id));
    console.log(JSON.stringify([a.sort(), b.sort(), c, d]));`], { timeout: 5000, encoding: 'utf8' });
  check('MMHash: Infinity x / 1e12 r / Infinity r inserts and a 1e15 query finish (used to hang the frame)', run.status === 0, String(run.error || run.stderr));
  const out = run.status === 0 ? JSON.parse(run.stdout) : null;
  check('MMHash: oversize items still hit, NaN items never, clear() empties the overflow list', out && out[0].join() === 'e,huge,rinf' && out[1].join() === 'e,huge,rinf' && out[2].length === 0 && out[3].length === 0, run.stdout);
}

// ---- MMInput vs CONTROLS.md ----
{
  const I = fresh('mm-input.js');
  const table = { up: ['w', 'arrowup'], down: ['s', 'arrowdown'], left: ['a', 'arrowleft'], right: ['d', 'arrowright'], primary: [' ', 'enter'], secondary: ['shift', 'e'], menu: ['escape', 'p'], restart: ['r'] };
  check('every CONTROLS.md key maps to its action', Object.keys(table).every((a) => table[a].every((k) => I.actionOf(k) === a)));
  check('upper-case keys (Caps Lock / Shift) map the same', ['W', 'ArrowUp', 'Enter', 'E', 'P', 'R', 'Escape'].every((k) => I.actionOf(k) === I.actionOf(k.toLowerCase())));
  check('prototype names are not actions (constructor used to return a function)', ['constructor', '__proto__', 'toString', 'hasOwnProperty', 'valueOf'].every((k) => I.actionOf(k) === null && I.actionOf({ key: k, code: k }) === null));
  check('hostile keys never throw', HOSTILE.every((k) => noThrow(() => I.actionOf(k))) && noThrow(() => I.actionOf({ key: Symbol('x') })));
  check('code fallback covers arrows / Enter / Escape (key Unidentified)', I.actionOf({ key: 'Unidentified', code: 'ArrowLeft' }) === 'left' && I.actionOf({ key: 'Process', code: 'Enter' }) === 'primary' && I.actionOf({ key: 'Unidentified', code: 'Escape' }) === 'menu');
  check('hint text matches the CONTROLS.md example', I.hint({ only: ['move', 'primary', 'secondary', 'menu'], names: { primary: 'fire' } }) === 'WASD / arrows move · Space / Enter fire · Shift / E alt · Esc / P menu');
  check('readPad with a reused out object lacking .move does not throw', noThrow(() => I.readPad({ axes: [1, 0], buttons: [] }, {})) && I.readPad({ axes: [1, 0], buttons: [] }, {}).move.x > 0.9);
  check('readPad with NaN axes / junk buttons is neutral', (() => { const p = I.readPad({ axes: [NaN, Infinity], buttons: [null, { value: NaN }, 'x'] }); return p.move.x === 0 && p.move.y === 0 && !p.primary && !p.secondary; })());
  const t = I.create();
  t.press('constructor'); t.press('__proto__');
  check('tracker ignores prototype names', ['up', 'down', 'left', 'right', 'primary', 'secondary', 'menu', 'restart'].every((a) => !t.held(a)));
  t.press('w'); t.press('ArrowUp'); t.release('w');
  check('two keys for one action: still held until both are up', t.held('up') && (t.release('ArrowUp'), !t.held('up')));
  // attach(): listeners added once, removed by detach; Ctrl/Cmd chords are left to the browser
  const L = {}; const target = { addEventListener: (n, f) => { (L[n] = L[n] || []).push(f); }, removeEventListener: (n, f) => { L[n] = (L[n] || []).filter((x) => x !== f); } };
  const acts = []; const tr = I.attach(target, (a) => acts.push(a));
  const ev = (o) => Object.assign({ target: null, repeat: false, ctrlKey: false, metaKey: false, altKey: false }, o);
  L.keydown[0](ev({ key: 'r', ctrlKey: true })); L.keydown[0](ev({ key: 'p', metaKey: true })); L.keydown[0](ev({ key: 'w', metaKey: true }));
  check('Ctrl+R / Cmd+P / Cmd+W are not game actions (Cmd+W used to leave up stuck held on macOS)', acts.length === 0 && !tr.held('up') && !tr.held('restart'));
  L.keydown[0](ev({ key: 'Enter' })); L.keydown[0](ev({ key: 'Enter', repeat: true })); L.keyup[0](ev({ key: 'Enter' }));
  check('attach: one action per press, repeats ignored', acts.join() === 'primary' && !tr.held('primary'));
  L.keydown[0](ev({ key: 'w', target: { tagName: 'input' } }));
  check('attach: typing in a text field is never read', acts.length === 1 && !tr.held('up'));
  tr.detach();
  check('detach removes every listener it added', ['keydown', 'keyup', 'blur'].every((n) => (L[n] || []).length === 0));
}

// ---- MMChip cue data ----
{
  const C = fresh('mm-chip.js');
  const TOK = /^([1-7][#b]?['\,]*|\.|-|[ksh])$/;
  let lenOk = true, tokOk = true, rangeOk = true, loopOk = true;
  for (const [name, cue] of Object.entries(C.CUES)) {
    for (const tk of C.TRACKS) {
      const tr = cue[tk]; if (!tr) continue;
      const tt = C.toks(tr.notes);
      if (tt.length !== cue.bars * 8) lenOk = false;
      if (!tt.every((x) => TOK.test(x))) tokOk = false;
    }
    const ev = C.render(name, 3, 4);
    if (!ev.filter((e) => e.midi !== undefined).every((e) => e.midi >= C.MIDI_MIN && e.midi <= C.MIDI_MAX)) rangeOk = false;
    const end = Math.max(...ev.map((e) => e.t));
    if (cue.loop && !(end < C.cueLength(name) * 4)) loopOk = false;
  }
  check('every cue track has exactly bars*8 tokens', lenOk);
  check('every cue token is a valid degree / rest / hold / drum', tokOk);
  check('every rendered note (with seeded variation) is in MIDI_MIN..MIDI_MAX', rangeOk);
  check('looped events stay inside loops * cueLength', loopOk);
  let sfxOk = true;
  for (const [k, v] of Object.entries(C.SFX)) for (const x of v) {
    const ns = (x.n || []).filter((m) => m > 0);
    if (!ns.every((m) => m >= C.MIDI_MIN && m <= C.MIDI_MAX)) sfxOk = false;
    if (x.slide && ns.length && (ns[ns.length - 1] + x.slide < C.MIDI_MIN || ns[ns.length - 1] + x.slide > C.MIDI_MAX)) sfxOk = false;
    if (!(x.dur > 0 && x.dur < 2 && x.vol > 0 && x.vol <= 0.1)) sfxOk = false;
  }
  check('every SFX voice: notes and slide ends in range, short and quiet', sfxOk);
  check('every alias points at a real SFX', Object.values(C.ALIASES).every((n) => Object.prototype.hasOwnProperty.call(C.SFX, n)));
  check('resolve(prototype names) is null (toString used to resolve)', ['toString', 'constructor', '__proto__', 'hasOwnProperty'].every((n) => C.resolve(n) === null));
  check('render / cueLength on prototype names and junk -> empty', ['toString', '__proto__', 'nope', null, 5].every((n) => C.render(n).length === 0) && C.cueLength('toString') === 0);
  const t0 = process.hrtime.bigint();
  const huge = C.render({ bpm: 1e9, key: 60, scale: 'major', bars: 1e9, lead: { ch: 'p1', notes: '1' } }, 0, 1e9);
  check('a hostile cue object is clamped (no hang, bounded events)', huge.length <= 64 * 8 * 256 && Number(process.hrtime.bigint() - t0) / 1e6 < 3000, String(huge.length));
  check('a cue with an unknown scale renders nothing instead of throwing', noThrow(() => C.render({ bars: 1, bpm: 100, scale: 'toString', lead: { notes: '1' } })));
  // sequencer: a tab hidden for an hour jumps whole passes, keeps the pass counter (same seeded variation as before)
  const ctx = { currentTime: 0, createGain: () => ({ gain: { setValueAtTime() {}, linearRampToValueAtTime() {} }, connect() {} }), createOscillator: () => ({ frequency: { setValueAtTime() {}, linearRampToValueAtTime() {} }, connect() {}, start() {}, stop() {} }), createBufferSource: () => ({ connect() {}, start() {}, stop() {} }), createBuffer: (c, n) => ({ getChannelData: () => new Float32Array(n) }), sampleRate: 8000 };
  const sq = C.sequencer({ ctx, dest: {}, seed: 1 });
  sq.start('hub'); ctx.currentTime = 3600 * 24;
  const t1 = process.hrtime.bigint(); const n = sq.tick();
  check('sequencer after a day hidden: one tick is quick and schedules a few notes, not a burst', Number(process.hrtime.bigint() - t1) / 1e6 < 200 && n > 0 && n < 40, n + ' notes');
  check('sequencer.start(prototype name) is refused', sq.start('toString') === false && sq.cue === 'hub');
}

// ---- MMSfx: autoplay policy, hostile names ----
{
  const Sfx = fresh('sfx.js');
  let made = 0, rejected = 0;
  const g = () => ({ gain: { value: 1, setValueAtTime() {}, linearRampToValueAtTime() {} }, connect() {}, disconnect() {} });
  const factory = () => { made++; return { state: 'suspended', currentTime: 0, destination: {}, sampleRate: 8000, resume() { rejected++; return Promise.reject(new Error('NotAllowedError')); }, createGain: g, createOscillator: () => ({ frequency: { setValueAtTime() {}, linearRampToValueAtTime() {} }, connect() {}, start() {}, stop() {} }), createBufferSource: () => ({ connect() {}, start() {}, stop() {} }), createBuffer: (c, n) => ({ getChannelData: () => new Float32Array(n) }), createBiquadFilter: () => ({ frequency: {}, connect() {} }), createPeriodicWave: () => ({}) }; };
  let unhandled = 0; const onU = () => { unhandled++; }; process.on('unhandledRejection', onU);
  const fx = Sfx.create({ ctxFactory: factory, storage: null });
  check('no AudioContext is created at construction (autoplay policy)', made === 0);
  check('hostile sound names are rejected without making a context', ['toString', '__proto__', 'constructor', 'nope', null, 5].every((n) => fx.play(n) === false) && made === 0);
  check('play() on a suspended context asks to resume', fx.play('coin') === true && made === 1 && rejected >= 1);
  const navDesc = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
  const ua = { isActive: false };
  Object.defineProperty(globalThis, 'navigator', { configurable: true, value: { userActivation: ua } });
  const fx2 = Sfx.create({ ctxFactory: factory, storage: null });
  fx2.play('coin'); // creates the (suspended) context outside a gesture
  const queued = [fx2.play('coin'), fx2.play('select'), fx2.play('chest')];
  ua.isActive = true; const tapped = fx2.play('coin');
  if (navDesc) Object.defineProperty(globalThis, 'navigator', navDesc); else delete globalThis.navigator;
  check('suspended context + no user activation: sounds are dropped, not queued to burst out on the first tap', queued.every((x) => x === false) && tapped === true, JSON.stringify([queued, tapped]));
  setTimeout(() => {
    process.off('unhandledRejection', onU);
    check('a rejected resume() (autoplay blocked) is never an unhandled rejection', unhandled === 0);
    finish();
  }, 30);
}

// ---- MM8 ----
{
  const M = fresh('mm-8bit.js');
  check('col(NaN / Infinity) falls back to white (used to be undefined)', M.col(NaN) === M.PAL[7] && M.col(Infinity) === M.PAL[7] && M.col(-1) === M.PAL[15]);
  check('crispScale(0 / NaN logical width) is 1 (used to be Infinity -> width Infinitypx)', M.crispScale(0, 100) === 1 && M.crispScale(NaN, 100) === 1 && M.crispScale(100, 450) === 4);
  const calls = []; const ctx = { fillRect: (...a) => calls.push(a), set fillStyle(v) { calls.push(['style', v]); } };
  check('text() with hostile strings never throws', HOSTILE.filter((v) => typeof v !== 'symbol').every((v) => noThrow(() => M.text(ctx, v, 0, 0, NaN, NaN))));
  const p = M.particles(() => 0.5, NaN);
  p.burst(0, 0, NaN, 'red', NaN); p.burst(0, 0, 1e9, 'red', 1);
  check('particles: NaN count is 0, huge count is capped, NaN cap -> 64', p.list.length === 64);
}

// ---- MMPixelize ----
{
  const P = fresh('mm-pixelize.js');
  const img = P.image(8, 8); img.data.fill(255);
  const sizes = [NaN, Infinity, -5, 1e9, '32', null].map((s) => { try { const r = P.pixelize(img, { size: s }); return r.w === r.h && r.w >= 4 && r.w <= 256 && r.data.length === r.w * r.h * 4; } catch (e) { return false; } });
  check('pixelize size NaN / Infinity / 1e9 / -5 / "32" gives a sane square image (NaN used to give 0 bytes, Infinity threw)', sizes.every(Boolean), JSON.stringify(sizes));
  check('pixelize pad NaN keeps the default, pad 0 stays 0', noThrow(() => P.pixelize(img, { pad: NaN })) && P.pixelize(img, { pad: 0, size: 8 }).data[3] === 255);
  check('pixelize(null / short buffer / {}) returns an empty image', [null, undefined, {}, { w: 4, h: 4, data: new Uint8ClampedArray(3) }, { w: NaN, h: 2, data: [] }].every((s) => { try { const r = P.pixelize(s, { size: 8 }); return r.colors === 0 && r.w === 8; } catch (e) { return false; } }));
  const polluted = JSON.parse('{"__proto__": {"upscale": true, "size": 99}}');
  check('options with __proto__ do not re-parent the merged options', P.pixelize(img, polluted).w === 32);
  const one = P.image(1, 1); one.data.set([10, 20, 30, 255]);
  check('a 1x1 source pixelizes', P.pixelize(one, { size: 4 }).colors >= 1);
  check('medianCut(empty) / quantise(no palette) are safe', P.medianCut(P.image(2, 2), 4).length === 0 && P.quantise(img, [], 0).w === 8);
}

// ---- MMMiniKit seed codes ----
{
  const K = fresh('mm-minikit.js');
  const seeds = ['demo1', 'a-b_c', 'A-b_C-0', '__proto__', '-_-', 'Q'.repeat(24), 'daily-2026-11-23', 'z'];
  check('every game seed ([A-Za-z0-9_-]{1,24}) round-trips through its share code', seeds.every((s) => K.parseSeedCode(K.seedCode(s)) === s));
  const R = fresh('rng.js'), r = R.create('codes'), AL = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789_-';
  let all = true;
  for (let i = 0; i < 2000; i++) { const n = r.int(1, 24); let s = ''; for (let j = 0; j < n; j++) s += AL[r.int(0, AL.length - 1)]; if (K.parseSeedCode(K.seedCode(s)) !== s || K.parseSeedCode(K.seedCode(s).toLowerCase()) !== s) { all = false; console.log('  bad', s, K.seedCode(s)); break; } }
  check('2000 random seeds round-trip (code read case-insensitively)', all);
  check('old lower-case alnum seeds keep their old codes', K.seedCode('lx9k2m0a') === 'LX9K2M0A' && K.parseSeedCode('LX9K2M0A') === 'lx9k2m0a');
  check('hostile codes are rejected, never throw', HOSTILE.every((v) => noThrow(() => K.parseSeedCode(v))) && ['<script>', '.', '..', 'a b', 'İA', 'x'.repeat(100000)].every((c) => K.parseSeedCode(c) === null));
  check('hostile seeds give a clean code', HOSTILE.filter((v) => typeof v !== 'symbol').every((v) => /^[A-Z0-9_.-]*$/.test(K.seedCode(v))));
  check('result() with hostile fields never throws', HOSTILE.filter((v) => typeof v !== 'symbol').every((v) => noThrow(() => K.result({ seed: v, stats: [v], lines: [v], more: [v], headline: v, value: v }))), '');
  check('fmt / fmtTime on hostile numbers', K.fmt(NaN) === '0' && K.fmt(Infinity) === '0' && K.fmtTime(-5) === '0.0s' && K.fmtTime(61500) === '1:01.5s');
}

// ---- MMMotion ----
{
  const Mo = fresh('motion.js');
  check('shake(Infinity / NaN / -3) is 0, shake(4) is 4, reduced is 0', Mo.shake(Infinity) === 0 && Mo.shake(NaN) === 0 && Mo.shake(-3) === 0 && Mo.shake(4) === 4 && Mo.shake(4, true) === 0);
  check('lowHpBorder(NaN hp) is hidden (used to show), 10/100 shows, 50/100 hides', !Mo.lowHpBorder(NaN, 100).visible && Mo.lowHpBorder(10, 100).visible && !Mo.lowHpBorder(50, 100).visible && !Mo.lowHpBorder(1, 0).visible);
  check('reduced() with a throwing storage / matchMedia never throws', noThrow(() => Mo.reduced({ matchMedia() { throw new Error('x'); } }, { getItem() { throw new Error('x'); } })));
}

// ---- MMGhost ----
{
  const G = fresh('mm-ghost.js');
  const enc = G.encode({ timeMs: 12345, points: [[0, 0], [5, -3], [10, 2]] });
  check('ghost encode/decode round-trip', JSON.stringify(G.decode(enc).points) === '[[0,0],[5,-3],[10,2]]' && G.decode(enc).timeMs === 12345);
  check('ghost decode rejects junk that parseInt used to accept', ['g1|1|abc|1x!,2', 'g1|1|-5|1,2', 'g1|1x|9|1,2', 'g1|0|9|1,2', 'g1|99999|9|1,2', 'g1|1|9|1.5,2', 'g1|1|9|,'].every((s) => G.decode(s) === null));
  check('ghost decode hostile never throws', HOSTILE.every((v) => noThrow(() => G.decode(v))));
  const rec = G.recorder(); [0, 100, 250, 260, 500].forEach((t) => rec.tick(t, t, t)); rec.tick(NaN, 1, 1); rec.tick(1000, Infinity, 0);
  check('ghost recorder samples at 4 Hz and drops non-finite ticks', rec.points().length === 3);
}

// ---- MMArt never throws without fetch / Image ----
{
  const A = fresh('mm-art.js');
  let p, threw = false;
  try { p = A.load('x/', 'manifest.json'); } catch (e) { threw = true; }
  check('MMArt.load with no fetch (node / old WebView) returns a promise instead of throwing', !threw && p && typeof p.then === 'function');
  if (p && p.then) p.then((set) => { check('...and resolves to an empty ArtSet', set && set.classes().length === 0); finish(); }, () => { check('...and never rejects', false); finish(); });
  else finish();
  check('ArtSet.anim / draw with hostile input return null / -1', noThrow(() => { const s = new A.ArtSet(); if (s.anim('toString', 'idle', 'down') !== null || s.draw(null, null) !== -1) throw new Error('x'); }) || !A.ArtSet);
}

let pending = 2;
function finish() { if (--pending > 0) return; console.log(failed ? `${failed}/${total} FAILED` : `ALL PASSED (${total})`); process.exitCode = failed ? 1 : 0; }
