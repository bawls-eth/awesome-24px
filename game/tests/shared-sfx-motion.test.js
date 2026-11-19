// Unit tests for shared/sfx.js + shared/motion.js (Node, no server needed).
//   NODE_PATH=$(npm root -g) node game/tests/shared-sfx-motion.test.js
const { check, done } = require('./helpers');
const MMSfx = require('../shared/sfx.js');
const MMMotion = require('../shared/motion.js');

function fakeCtx() {
  const c = { currentTime: 0, sampleRate: 8000, destination: {}, oscStarts: 0, srcStarts: 0, state: 'running' };
  const param = () => ({ value: 0, setValueAtTime() {}, linearRampToValueAtTime() {} });
  c.createGain = () => ({ gain: param(), connect() {} });
  c.createOscillator = () => ({ type: '', frequency: param(), connect() {}, start() { c.oscStarts++; }, stop() {} });
  c.createBuffer = (ch, n) => ({ getChannelData: () => new Float32Array(n) });
  c.createBufferSource = () => ({ connect() {}, start() { c.srcStarts++; }, stop() {} });
  c.createBiquadFilter = () => ({ frequency: { value: 0 }, connect() {} });
  return c;
}
const memStore = () => { const m = {}; return { getItem: (k) => (k in m ? m[k] : null), setItem: (k, v) => { m[k] = String(v); }, m }; };
const badStore = { getItem() { throw new Error('no'); }, setItem() { throw new Error('no'); } };

// throttle
let ctx = fakeCtx();
let s = MMSfx.create({ ctxFactory: () => ctx, storage: memStore() });
for (let i = 0; i < 20; i++) { ctx.currentTime = i * 0.04; s.play('shot'); } // 20 in 0.8s
check('13+ shots in 1s -> at most 12 oscillator starts', ctx.oscStarts <= 12 && ctx.oscStarts > 0, 'got ' + ctx.oscStarts);
ctx.currentTime = 2; const before = ctx.oscStarts; s.play('shot');
check('shot allowed again after the window passes', ctx.oscStarts === before + 1);

// all names play
ctx = fakeCtx(); s = MMSfx.create({ ctxFactory: () => ctx, storage: memStore() });
['shot', 'hit', 'kill', 'hurt', 'pickup', 'levelup'].forEach((n) => check('play(' + n + ') returns true', s.play(n) === true));
check('unknown sound returns false', s.play('nope') === false);
check('noise blip uses a buffer source', ctx.srcStarts >= 1);

// mute persistence
const st = memStore();
ctx = fakeCtx(); s = MMSfx.create({ ctxFactory: () => ctx, storage: st });
s.setMuted(true);
check('mute persisted under mm-sfx-muted', st.m['mm-sfx-muted'] === '1');
const n0 = ctx.oscStarts + ctx.srcStarts;
['shot', 'hit', 'kill', 'hurt', 'pickup', 'levelup'].forEach((n) => s.play(n));
check('muted blocks all sounds', ctx.oscStarts + ctx.srcStarts === n0);
const ctx2 = fakeCtx();
const s2 = MMSfx.create({ ctxFactory: () => ctx2, storage: st });
check('mute restored from storage on new instance', s2.isMuted() === true);
s2.setMuted(false);
check('unmute persisted', st.m['mm-sfx-muted'] === '0' && s2.play('kill') === true);

// music + volume
check('music off by default', s2.musicOn === false);
s2.setMusic(true); check('music can be turned on', s2.musicOn === true);
s2.setVolume(0.3); check('master volume set', s2.getVolume() === 0.3);
s2.setVolume(5); check('master volume clamped', s2.getVolume() === 1);

// throwing storage
let ok = true;
try { const b = MMSfx.create({ ctxFactory: fakeCtx, storage: badStore }); b.setMuted(true); b.play('shot'); } catch (e) { ok = false; }
check('throwing storage does not crash sfx', ok);
ok = true;
try { MMMotion.reduced({ matchMedia: () => ({ matches: false }) }, badStore); } catch (e) { ok = false; }
check('throwing storage does not crash motion', ok);

// motion
const win = (m) => ({ matchMedia: (q) => ({ matches: m && q === '(prefers-reduced-motion: reduce)' }) });
check('reduced() follows OS media query', MMMotion.reduced(win(true), memStore()) === true && MMMotion.reduced(win(false), memStore()) === false);
const ms = memStore(); MMMotion.setOverride(ms, true);
check('stored override forces reduced', MMMotion.reduced(win(false), ms) === true && ms.m['mm-reduce-motion'] === '1');
MMMotion.setOverride(ms, false);
check('stored override 0 beats OS', MMMotion.reduced(win(true), ms) === false);
check('reduced() safe without window', MMMotion.reduced(null, null) === false);
check('shake 0 when reduced', MMMotion.shake(6, true) === 0);
check('shake non-zero when not reduced', MMMotion.shake(6, false) === 6);
const fr = MMMotion.flash('#f00', 0.01, true), fr2 = MMMotion.flash('#f00', 0.07, true);
check('reduced flash is a steady tint', fr.blink === false && fr.alpha === fr2.alpha && fr.alpha > 0);
const fn1 = MMMotion.flash('#f00', 0.01, false), fn2 = MMMotion.flash('#f00', 0.07, false);
check('normal flash blinks', fn1.blink && fn1.alpha !== fn2.alpha);
const b1 = MMMotion.lowHpBorder(20, 100, true, 0), b2 = MMMotion.lowHpBorder(20, 100, true, 0.25);
check('reduced low-HP border is static', b1.visible && !b1.pulse && b1.alpha === b2.alpha);
const p1 = MMMotion.lowHpBorder(20, 100, false, 0), p2 = MMMotion.lowHpBorder(20, 100, false, 0.25);
check('normal low-HP border pulses', p1.pulse && p1.alpha !== p2.alpha);
check('no border above 25% HP', MMMotion.lowHpBorder(50, 100, false, 0).visible === false);
done();
