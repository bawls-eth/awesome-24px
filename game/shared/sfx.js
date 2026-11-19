// WebAudio synth sound effects. UMD: browser global MMSfx, or require().
// create({ctxFactory, storage}) -> {play, setMuted, isMuted, setMusic, musicOn, setVolume, getVolume}
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.MMSfx = factory();
}(typeof self !== 'undefined' ? self : this, function () {
  const KEY = 'mm-sfx-muted';
  const LIMITS = { shot: 12, hit: 16 }; // max per second
  // Recipes: [type, f0, f1, seconds, volume, delay]; noise: ['noise', bandHz, 0, seconds, volume]
  const RECIPES = {
    shot: [['square', 880, 520, 0.035, 0.05]],
    hit: [['noise', 2000, 0, 0.02, 0.05]],
    kill: [['triangle', 440, 110, 0.12, 0.08]],
    hurt: [['sawtooth', 220, 110, 0.09, 0.08], ['sine', 60, 40, 0.12, 0.1]],
    pickup: [['sine', 880, 1320, 0.08, 0.06]],
    levelup: [262, 330, 392, 523].map((f, i) => ['triangle', f, f, 0.07, 0.07, i * 0.07]),
  };

  function create(opts) {
    opts = opts || {};
    const storage = opts.storage;
    const ctxFactory = opts.ctxFactory || function () {
      const C = typeof AudioContext !== 'undefined' ? AudioContext : (typeof webkitAudioContext !== 'undefined' ? webkitAudioContext : null);
      return C ? new C() : null;
    };
    let ctx = null, master = null, noiseBuf = null;
    let muted = false, music = false, volume = 0.8;
    const recent = {}; // name -> array of ctx times

    try { if (storage && storage.getItem(KEY) === '1') muted = true; } catch (e) { /* ignore */ }

    function ensure() {
      if (ctx) return ctx;
      try { ctx = ctxFactory(); } catch (e) { ctx = null; }
      if (ctx) {
        try { master = ctx.createGain(); master.gain.value = volume; master.connect(ctx.destination); } catch (e) { master = null; }
      }
      return ctx;
    }
    function allowed(name, now) {
      const lim = LIMITS[name];
      if (!lim) return true;
      const arr = recent[name] || (recent[name] = []);
      while (arr.length && now - arr[0] >= 1) arr.shift();
      if (arr.length >= lim) return false;
      arr.push(now);
      return true;
    }
    function voice(c, r) {
      const t0 = c.currentTime + (r[5] || 0), dur = r[3], g = c.createGain();
      g.gain.setValueAtTime(r[4], t0);
      g.gain.linearRampToValueAtTime(0.0001, t0 + dur);
      g.connect(master || c.destination);
      if (r[0] === 'noise') {
        if (!noiseBuf) {
          const rate = c.sampleRate || 44100, n = Math.floor(rate * 0.05);
          noiseBuf = c.createBuffer(1, n, rate);
          const d = noiseBuf.getChannelData(0);
          for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
        }
        const s = c.createBufferSource(), f = c.createBiquadFilter();
        s.buffer = noiseBuf; f.type = 'bandpass'; f.frequency.value = r[1];
        s.connect(f); f.connect(g); s.start(t0); s.stop(t0 + dur);
      } else {
        const o = c.createOscillator();
        o.type = r[0];
        o.frequency.setValueAtTime(r[1], t0);
        if (r[2] !== r[1]) o.frequency.linearRampToValueAtTime(r[2], t0 + dur);
        o.connect(g); o.start(t0); o.stop(t0 + dur);
      }
    }
    function play(name) {
      if (muted) return false;
      const rec = RECIPES[name];
      if (!rec) return false;
      const c = ensure();
      if (!c) return false;
      try {
        if (!allowed(name, c.currentTime)) return false;
        if (c.state === 'suspended' && c.resume) c.resume();
        rec.forEach((r) => voice(c, r));
        return true;
      } catch (e) { return false; }
    }
    function setMuted(m) {
      muted = !!m;
      try { if (storage) storage.setItem(KEY, muted ? '1' : '0'); } catch (e) { /* ignore */ }
    }
    function setVolume(v) {
      volume = Math.max(0, Math.min(1, +v || 0));
      if (master) { try { master.gain.value = volume; } catch (e) { /* ignore */ } }
    }
    return {
      play, setMuted, setVolume,
      isMuted: () => muted,
      getVolume: () => volume,
      setMusic: (on) => { music = !!on; },
      get musicOn() { return music; },
    };
  }
  return { create, KEY, LIMITS };
}));
