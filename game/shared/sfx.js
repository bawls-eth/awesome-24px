// WebAudio synth sound effects. UMD: browser global MMSfx, or require().
// create({ctxFactory, storage}) -> {play, setMuted, isMuted, setMusic, musicOn, setVolume, getVolume, ambience, stopAmbience, ambienceOn}
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.MMSfx = factory();
}(typeof self !== 'undefined' ? self : this, function () {
  const KEY = 'mm-sfx-muted';
  const LIMITS = { shot: 12, hit: 16, portal: 4, bag_rare: 4, boss_awaken: 2, warn: 4, claim: 4, ui_tap: 10 }; // max per second
  // Recipes: [type, f0, f1, seconds, volume, delay]; noise: ['noise', bandHz, 0, seconds, volume]
  const RECIPES = {
    shot: [['square', 880, 520, 0.035, 0.05]],
    hit: [['noise', 2000, 0, 0.02, 0.05]],
    kill: [['triangle', 440, 110, 0.12, 0.08]],
    hurt: [['sawtooth', 220, 110, 0.09, 0.08], ['sine', 60, 40, 0.12, 0.1]],
    pickup: [['sine', 880, 1320, 0.08, 0.06]],
    levelup: [262, 330, 392, 523].map((f, i) => ['triangle', f, f, 0.07, 0.07, i * 0.07]),
    // SF1 cues (synth only, short, quiet)
    portal: [['sine', 220, 880, 0.35, 0.06], ['triangle', 330, 1320, 0.3, 0.04, 0.05]],
    bag_rare: [523, 659, 784, 1047].map((f, i) => ['sine', f, f, 0.09, 0.06, i * 0.06]),
    boss_awaken: [['sawtooth', 70, 45, 0.5, 0.08], ['square', 110, 55, 0.4, 0.04, 0.1]],
    warn: [['square', 660, 660, 0.07, 0.04], ['square', 520, 520, 0.07, 0.04, 0.1]],
    claim: [392, 523, 659].map((f, i) => ['triangle', f, f, 0.08, 0.06, i * 0.08]),
    ui_tap: [['sine', 700, 600, 0.03, 0.04]],
  };
  // Ambience drone base frequency per zone index (0 = calm centre .. 4 = deepest); anything else uses zone 0.
  const AMB_HZ = [110, 98, 87, 82, 73];

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
      if (muted) stopAmbience();
      try { if (storage) storage.setItem(KEY, muted ? '1' : '0'); } catch (e) { /* ignore */ }
    }
    function setVolume(v) {
      volume = Math.max(0, Math.min(1, +v || 0));
      if (master) { try { master.gain.value = volume; } catch (e) { /* ignore */ } }
    }
    // Quiet looping ambience: two detuned oscillators through a low-pass. Only with music on and not muted; the context is only
    // created here (callers invoke this after a user gesture), never at construction.
    let amb = null, ambZone = -1;
    function stopAmbience() {
      const a = amb; amb = null; ambZone = -1;
      if (!a) return false;
      try { a.gain.gain.setValueAtTime(0.0001, a.ctx.currentTime); a.oscs.forEach((o) => { try { o.stop(); } catch (e) { /* already stopped */ } }); } catch (e) { /* ignore */ }
      try { a.gain.disconnect(); } catch (e) { /* ignore */ }
      return true;
    }
    function ambience(zoneIdx) {
      if (muted || !music) { stopAmbience(); return false; }
      const z = Math.max(0, Math.min(AMB_HZ.length - 1, Math.floor(Number(zoneIdx)) || 0));
      if (amb) {
        if (z !== ambZone) {
          ambZone = z;
          try { amb.oscs[0].frequency.setValueAtTime(AMB_HZ[z], amb.ctx.currentTime); amb.oscs[1].frequency.setValueAtTime(AMB_HZ[z] * 1.5, amb.ctx.currentTime); } catch (e) { /* ignore */ }
        }
        return true;
      }
      const c = ensure();
      if (!c) return false;
      try {
        if (c.state === 'suspended' && c.resume) c.resume();
        const g = c.createGain(); g.gain.setValueAtTime(0.018, c.currentTime);
        let tail = g;
        if (c.createBiquadFilter) { const f = c.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 420; f.connect(g); tail = f; }
        g.connect(master || c.destination);
        const oscs = [['sine', AMB_HZ[z]], ['triangle', AMB_HZ[z] * 1.5]].map((d) => { const o = c.createOscillator(); o.type = d[0]; o.frequency.setValueAtTime(d[1], c.currentTime); o.connect(tail); o.start(c.currentTime); return o; });
        amb = { ctx: c, gain: g, oscs }; ambZone = z;
        return true;
      } catch (e) { amb = null; return false; }
    }
    return {
      play, setMuted, setVolume, ambience, stopAmbience,
      ambienceOn: () => !!amb,
      isMuted: () => muted,
      getVolume: () => volume,
      setMusic: (on) => { music = !!on; if (!music) stopAmbience(); },
      get musicOn() { return music; },
    };
  }
  return { create, KEY, LIMITS };
}));
