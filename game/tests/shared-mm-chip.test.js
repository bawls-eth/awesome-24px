// Unit tests for shared/mm-chip.js (MMChip) and its use inside shared/sfx.js (Node, no server, stubbed AudioContext).
//   NODE_PATH=$(npm root -g) node game/tests/shared-mm-chip.test.js
const fs = require('fs'), path = require('path');
const { check, done } = require('./helpers');
const MMChip = require('../shared/mm-chip.js');
const MMSfx = require('../shared/sfx.js');

function fakeCtx() {
  const c = { currentTime: 0, sampleRate: 8000, destination: {}, oscStarts: 0, srcStarts: 0, waves: 0, freqs: [], state: 'running' };
  const param = (log) => ({ value: 0, setValueAtTime(v) { if (log) c.freqs.push(v); }, linearRampToValueAtTime(v) { if (log) c.freqs.push(v); } });
  c.createGain = () => ({ gain: param(), connect() {} });
  c.createOscillator = () => ({ type: '', frequency: param(true), connect() {}, setPeriodicWave() { c.waves++; }, start() { c.oscStarts++; }, stop() {} });
  c.createPeriodicWave = (re, im) => ({ re, im });
  c.createBuffer = (ch, n) => { const d = new Float32Array(n); return { getChannelData: () => d }; };
  c.createBufferSource = () => ({ connect() {}, start() { c.srcStarts++; }, stop() {} });
  c.createBiquadFilter = () => ({ frequency: { value: 0 }, connect() {} });
  return c;
}
const memStore = (init) => { const m = Object.assign({}, init); return { getItem: (k) => (k in m ? m[k] : null), setItem: (k, v) => { m[k] = String(v); }, m }; };
const noComments = (s) => s.split('\n').filter((l) => !/^\s*\/\//.test(l)).map((l) => l.replace(/\s\/\/.*$/, '')).join('\n');
const fakeTimer = { set: () => 1, clear() {} };

// ---- source hygiene ----
const code = noComments(fs.readFileSync(path.join(__dirname, '../shared/mm-chip.js'), 'utf8'));
const sfxCode = noComments(fs.readFileSync(path.join(__dirname, '../shared/sfx.js'), 'utf8'));
check('mm-chip.js has no Math.random', !/Math\.random/.test(code));
check('mm-chip.js has no Date', !/\bDate\b/.test(code));
check('sfx.js has no Math.random / Date', !/Math\.random/.test(sfxCode) && !/\bDate\b/.test(sfxCode));
check('mm-chip.js references no audio files / urls', !/\.(mp3|ogg|wav|m4a)\b|https?:\/\//.test(code));

// ---- SFX library ----
const REQUIRED = ['blip', 'select', 'confirm', 'back', 'coin', 'pickup', 'combo1', 'combo2', 'combo3', 'combo4', 'combo5', 'combo6', 'combo7', 'combo8',
  'perfect', 'miss', 'hit', 'hurt', 'death', 'level_up', 'unlock', 'chest', 'jump', 'land', 'splash', 'catch', 'reel', 'bite', 'pop', 'merge',
  'stack_drop', 'bloom_c', 'bloom_d', 'bloom_e', 'bloom_g', 'ui_open', 'ui_close', 'error'];
check('library has every required named SFX (' + REQUIRED.length + ')', REQUIRED.every((n) => Array.isArray(MMChip.SFX[n]) && MMChip.SFX[n].length > 0), REQUIRED.filter((n) => !MMChip.SFX[n]).join(','));
check('library has 30+ sounds', Object.keys(MMChip.SFX).length >= 30);
const badVoice = [];
Object.keys(MMChip.SFX).forEach((k) => MMChip.SFX[k].forEach((v) => {
  const okCh = ['p1', 'p2', 'tri', 'noise'].includes(v.ch);
  const okN = v.ch === 'noise' || (Array.isArray(v.n) && v.n.every((m) => m === 0 || (m >= MMChip.MIDI_MIN && m <= MMChip.MIDI_MAX)) && (v.n[v.n.length - 1] + (v.slide || 0)) >= MMChip.MIDI_MIN);
  const okD = (v.ch !== 'p1' && v.ch !== 'p2') || MMChip.DUTIES.includes(v.duty);
  const okT = v.dur > 0 && v.dur <= 1 && v.vol > 0 && v.vol <= 0.15;
  if (!(okCh && okN && okD && okT)) badVoice.push(k);
}));
check('every SFX voice: valid channel, notes in range, duty 12.5/25/50%, short and quiet', badVoice.length === 0, badVoice.join(','));
const combos = [1, 2, 3, 4, 5, 6, 7, 8].map((i) => MMChip.SFX['combo' + i][0].n[0]);
check('combo ladder rises 1..8', combos.every((m, i) => i === 0 || m > combos[i - 1]));
check('bloom notes are C D E G', ['c', 'd', 'e', 'g'].map((x) => MMChip.SFX['bloom_' + x][0].n[0] % 12).join() === '0,2,4,7');

// ---- aliases: every old MMSfx recipe name + Town SFX names resolve ----
const OLD = Object.keys(MMSfx.LIMITS).concat(['shot', 'hit', 'kill', 'hurt', 'pickup', 'levelup', 'portal', 'bag_rare', 'boss_awaken', 'warn', 'claim', 'ui_tap']);
const TOWN = ['catch', 'coin', 'sell', 'achievement', 'deny', 'pop', 'shutter'];
check('every old MMSfx name has a chip alias', OLD.every((n) => MMChip.resolve(n)), OLD.filter((n) => !MMChip.resolve(n)).join(','));
check('every Town SFX name has a chip alias', TOWN.every((n) => MMChip.resolve(n)));
check('unknown name resolves to null', MMChip.resolve('nope') === null);
check('aliases only point at real sounds', Object.keys(MMChip.ALIASES).every((k) => MMChip.SFX[MMChip.ALIASES[k]]));

// ---- music cues ----
const CUE_NAMES = ['hub', 'town', 'realm', 'dungeon', 'minigame', 'results'];
check('six music cues exist', CUE_NAMES.every((n) => MMChip.CUES[n]) && Object.keys(MMChip.CUES).length === 6);
CUE_NAMES.forEach((n) => {
  const c = MMChip.CUES[n], steps = c.bars * 8;
  check(n + ': tempo / key / scale / bars sane', c.bpm >= 60 && c.bpm <= 200 && c.key >= 48 && c.key <= 84 && !!MMChip.SCALES[c.scale] && c.bars >= 2 && c.bars <= 16);
  check(n + ': every track is exactly bars*8 steps', MMChip.TRACKS.every((t) => MMChip.toks(c[t].notes).length === steps), MMChip.TRACKS.map((t) => MMChip.toks(c[t].notes).length).join('/'));
  check(n + ': every token parses', MMChip.TRACKS.every((t) => MMChip.toks(c[t].notes).every((k) => (t === 'drums' ? /^[ksh.]$/.test(k) : (k === '.' || k === '-' || MMChip.degree(k, c.scale, 60) !== null)))));
  const ev = MMChip.render(n, 1, 3);
  check(n + ': rendered notes in range', ev.length > 0 && ev.every((e) => e.ch === 'noise' || (e.midi >= MMChip.MIDI_MIN && e.midi <= MMChip.MIDI_MAX)));
  check(n + ': bass on the triangle, lead/harm on pulses', ev.filter((e) => e.ch === 'tri').every((e) => e.midi < 72) && ev.some((e) => e.ch === 'p1') && ev.some((e) => e.ch === 'p2'));
  check(n + ': deterministic for a seed', JSON.stringify(MMChip.render(n, 42, 3)) === JSON.stringify(MMChip.render(n, 42, 3)));
  check(n + ': loop length = bars * 8 eighths', Math.abs(MMChip.cueLength(n) - steps * 30 / c.bpm) < 1e-9 && ev.every((e) => e.step < steps * 3));
});
check('looping cues vary on later passes by seed', CUE_NAMES.filter((n) => MMChip.CUES[n].loop).some((n) => JSON.stringify(MMChip.render(n, 1, 4)) !== JSON.stringify(MMChip.render(n, 2, 4))));
check('first pass is the written melody (no variation)', JSON.stringify(MMChip.render('town', 1, 1)) === JSON.stringify(MMChip.render('town', 99, 1)));
check('results jingle is a one-shot', MMChip.CUES.results.loop === false && CUE_NAMES.filter((n) => n !== 'results').every((n) => MMChip.CUES[n].loop === true));
check('rng is deterministic', (() => { const a = MMChip.rng(5), b = MMChip.rng(5); return [a(), a(), a()].join() === [b(), b(), b()].join(); })());

// ---- synthesis with a stubbed context ----
let ctx = fakeCtx();
check('playSfx("confirm") uses a pulse PeriodicWave, one oscillator', MMChip.playSfx(ctx, ctx.destination, 'confirm', {}) === true && ctx.waves === 1 && ctx.oscStarts === 1);
check('arpeggio sets one frequency per step', ctx.freqs.length === 4);
ctx = fakeCtx(); MMChip.playSfx(ctx, ctx.destination, 'hit', {});
check('hit uses the noise channel', ctx.srcStarts === 1 && ctx.oscStarts === 0);
const cache1 = {}, cache2 = {};
MMChip.playSfx(fakeCtx(), {}, 'hit', cache1); MMChip.playSfx(fakeCtx(), {}, 'hit', cache2);
check('noise buffer is deterministic', Array.from(cache1.noise.getChannelData(0).slice(0, 16)).join() === Array.from(cache2.noise.getChannelData(0).slice(0, 16)).join());
const noPW = fakeCtx(); delete noPW.createPeriodicWave; MMChip.playSfx(noPW, {}, 'blip', {});
check('no PeriodicWave -> square fallback still plays', noPW.oscStarts === 1);
ctx = fakeCtx();
const sq = MMChip.sequencer({ ctx, dest: ctx.destination, seed: 3 });
sq.start('town'); ctx.currentTime = 0.2; sq.tick();
const early = sq.scheduled;
for (let t = 0.2; t < MMChip.cueLength('town') * 2.2; t += 0.05) { ctx.currentTime = t; sq.tick(); }
check('sequencer schedules notes ahead and keeps looping', early > 0 && sq.scheduled > early * 10 && sq.cue === 'town', early + '/' + sq.scheduled);
ctx = fakeCtx(); const sj = MMChip.sequencer({ ctx, dest: {}, seed: 0 }); sj.start('results');
for (let t = 0; t < 4; t += 0.05) { ctx.currentTime = t; sj.tick(); }
check('one-shot cue ends by itself', sj.cue === null && sj.scheduled > 0);

// ---- prefs read from the existing settings ----
check('prefs: nothing stored -> sound on, music off', JSON.stringify(MMChip.prefs(memStore())) === JSON.stringify({ muted: false, music: false, lowGfx: false }));
check('prefs: Town save sfxMuted / musicEnabled honoured', (() => { const p = MMChip.prefs(memStore({ 'pixeltown-save-v1': JSON.stringify({ sfxMuted: true, musicEnabled: true }) })); return p.muted && p.music; })());
check('prefs: shared mm-sfx-muted wins over the Town save', MMChip.prefs(memStore({ 'mm-sfx-muted': '0', 'pixeltown-save-v1': '{"sfxMuted":true}' })).muted === false);
check('prefs: low graphics read from pixeltown-access-v1', MMChip.prefs(memStore({ 'pixeltown-access-v1': '{"lowGfx":true}' })).lowGfx === true);
check('prefs: corrupt / throwing storage is safe', MMChip.prefs(memStore({ 'pixeltown-save-v1': '{bad' })).muted === false && MMChip.prefs({ getItem() { throw new Error('x'); } }).muted === false);

// ---- MMSfx uses the chip, honours mute / volume / music / low power ----
ctx = fakeCtx();
const st = memStore();
const s = MMSfx.create({ ctxFactory: () => ctx, storage: st, timer: fakeTimer });
check('MMSfx plays new chip names', ['coin', 'combo5', 'bloom_g', 'level_up', 'stack_drop'].every((n) => s.play(n) === true));
check('MMSfx old names still play through chip aliases', ['shot', 'kill', 'levelup', 'claim', 'ui_tap', 'bag_rare', 'portal', 'boss_awaken', 'warn'].every((n) => s.play(n) === true) && ctx.waves > 0);
check('MMSfx.names() lists old + new', ['shot', 'coin', 'combo8', 'level_up'].every((n) => s.names().includes(n)));
check('music off by default -> music() refuses', s.musicOn === false && s.music('town') === false && s.musicCue() === null);
s.setMusic(true);
check('music on -> music() starts the cue', s.music('town') === true && s.musicCue() === 'town');
ctx.currentTime = 1; const before = ctx.oscStarts + ctx.srcStarts; s.tick();
check('music tick schedules notes', ctx.oscStarts + ctx.srcStarts > before);
check('unknown cue refused', s.music('nope') === false);
s.setMuted(true);
check('mute stops music, blocks SFX, writes the existing key', s.musicCue() === null && s.play('coin') === false && st.m['mm-sfx-muted'] === '1');
s.setMuted(false); s.setMusic(false);
check('music toggle off stops it', s.musicCue() === null && s.music('hub') === false);
s.setVolume(0.25); check('volume honoured', s.getVolume() === 0.25);
check('no extra storage keys written', Object.keys(st.m).join() === 'mm-sfx-muted');
const town = memStore({ 'pixeltown-save-v1': JSON.stringify({ musicEnabled: true }), 'pixeltown-access-v1': '{"lowGfx":true}' });
const sl = MMSfx.create({ ctxFactory: fakeCtx, storage: town, timer: fakeTimer });
check('Town Music toggle on is read', sl.musicOn === true);
check('low-graphics mode -> no music', sl.music('town') === false);
const sm = MMSfx.create({ ctxFactory: fakeCtx, storage: memStore({ 'pixeltown-save-v1': '{"sfxMuted":true}' }) });
check('Town save mute is honoured when mm-sfx-muted was never written', sm.isMuted() === true && sm.play('coin') === false);
done();
