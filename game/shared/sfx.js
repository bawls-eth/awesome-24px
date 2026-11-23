// WebAudio synth sound effects. UMD: browser global MMSfx, or require().
// create({ctxFactory, storage, lowGfx, timer}) -> {play, setMuted, isMuted, setMusic, musicOn, setVolume, getVolume, ambience,
//   stopAmbience, ambienceOn, music, stopMusic, musicCue, names}
// 8-bit layer: when shared/mm-chip.js (MMChip) is present every name (old and new, see MMChip.ALIASES) plays its chiptune voice;
// without it the original RECIPES below still play, so no page ever goes silent. In a browser this file loads mm-chip.js next to
// itself when a page did not include it. No Math.random / Date: noise comes from a seeded counter.
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./mm-chip.js'));
  else {
    root.MMSfx = factory(null);
    try {
      // once per page: sfx.js loaded twice (two bundles on one page) used to inject a second mm-chip.js
      if (!root.MMChip && !root.__mmChipLoading && typeof document !== 'undefined' && document.currentScript && document.currentScript.src) {
        root.__mmChipLoading = true;
        const el = document.createElement('script');
        el.src = document.currentScript.src.replace(/sfx\.js(\?.*)?$/, 'mm-chip.js$1');
        el.async = true;
        (document.head || document.documentElement).appendChild(el);
      }
    } catch (e) { /* the RECIPES fallback still plays */ }
  }
}(typeof self !== 'undefined' ? self : this, function (CHIP) {
  const own = (o, k) => typeof k === 'string' && Object.prototype.hasOwnProperty.call(o, k);
  // resume() is a Promise in every modern browser and rejects under some autoplay policies (Safari): never leave it unhandled
  const wake = (c) => { if (c.state === 'suspended' && c.resume) { try { const p = c.resume(); if (p && p.catch) p.catch(() => {}); } catch (e) { /* ignore */ } } };
  const chip = () => CHIP || (typeof self !== 'undefined' && self.MMChip) || null;
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
    const recent = Object.create(null); // name -> array of ctx times
    const cache = {}; // MMChip periodic waves + noise buffer for this context
    let musicBus = null, sfxBus = null, seq = null, seqTimer = null, wantCue = null;
    const timer = opts.timer || (typeof setInterval === 'function' ? { set: (f, ms) => setInterval(f, ms), clear: (h) => clearInterval(h) } : null);

    try { if (storage && storage.getItem(KEY) === '1') muted = true; } catch (e) { /* ignore */ }
    // Existing settings only (no new key): the Town save's sfxMuted when mm-sfx-muted was never written, the Town Music toggle.
    { const C = chip(); if (C && C.prefs) { const pr = C.prefs(storage); muted = pr.muted; music = pr.music; } }
    function lowPower() {
      if (opts.lowGfx === true) return true;
      try { if (typeof window !== 'undefined' && window.__mmPerf && window.__mmPerf.lowGfx === true) return true; } catch (e) { /* ignore */ }
      const C = chip();
      return !!(C && C.prefs && C.prefs(storage).lowGfx);
    }

    function ensure() {
      if (ctx) return ctx;
      try { ctx = ctxFactory(); } catch (e) { ctx = null; }
      if (ctx) {
        try { master = ctx.createGain(); master.gain.value = volume; master.connect(ctx.destination); } catch (e) { master = null; }
        try { sfxBus = ctx.createGain(); sfxBus.gain.value = 1; sfxBus.connect(master || ctx.destination); } catch (e) { sfxBus = null; }
        try { musicBus = ctx.createGain(); musicBus.gain.value = 1; musicBus.connect(master || ctx.destination); } catch (e) { musicBus = null; }
      }
      return ctx;
    }
    function allowed(name, now) {
      const lim = own(LIMITS, name) ? LIMITS[name] : 0;
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
          let q = 0x2545f491; // seeded LCG, no Math.random
          for (let i = 0; i < n; i++) { q = (Math.imul(q, 1664525) + 1013904223) >>> 0; d[i] = q / 2147483648 - 1; }
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
    // Duck the music under a sound effect: dip to 45% and come back over a quarter second.
    function duck(c) {
      if (!musicBus || !seq || !seq.cue) return;
      try { const t = c.currentTime; musicBus.gain.setValueAtTime(0.45, t); musicBus.gain.linearRampToValueAtTime(1, t + 0.25); } catch (e) { /* ignore */ }
    }
    function play(name) {
      if (muted) return false;
      const C = chip(), chipName = C && C.resolve ? C.resolve(name) : null;
      const rec = own(RECIPES, name) ? RECIPES[name] : null;
      if (!rec && !chipName) return false;
      const c = ensure();
      if (!c) return false;
      try {
        if (!allowed(name, c.currentTime)) return false;
        wake(c);
        if (chipName) { duck(c); C.playSfx(c, sfxBus || master || c.destination, chipName, cache); } else rec.forEach((r) => voice(c, r));
        if (wantCue && !(seq && seq.cue)) playMusic(wantCue); // a gesture-driven sound is the earliest safe moment to start music
        return true;
      } catch (e) { return false; }
    }
    // Looping chiptune music (MMChip.CUES): only with Music on, not muted, not in low-graphics mode, and only once a context exists
    // (callers invoke play/music from a user gesture). Unknown cue or no MMChip -> false.
    function playMusic(cue) {
      const C = chip();
      if (!C || !C.CUES || !own(C.CUES, cue)) return false;
      wantCue = cue;
      if (muted || !music || lowPower()) { stopMusic(true); return false; }
      const c = ensure();
      if (!c) return false;
      try {
        wake(c);
        if (!seq) seq = C.sequencer({ ctx: c, dest: musicBus || master || c.destination, cache, seed: opts.seed | 0 });
        seq.start(cue);
        if (!seqTimer && timer) seqTimer = timer.set(() => { try { if (seq) seq.tick(); } catch (e) { /* ignore */ } }, 50);
        return true;
      } catch (e) { return false; }
    }
    function stopMusic(keepWish) {
      if (!keepWish) wantCue = null;
      const was = !!(seq && seq.cue);
      if (seq) seq.stop();
      if (seqTimer && timer) { try { timer.clear(seqTimer); } catch (e) { /* ignore */ } }
      seqTimer = null;
      return was;
    }
    function setMuted(m) {
      muted = !!m;
      if (muted) { stopAmbience(); stopMusic(true); }
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
        wake(c);
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
      play, setMuted, setVolume, ambience, stopAmbience, music: playMusic, stopMusic,
      ambienceOn: () => !!amb,
      isMuted: () => muted,
      getVolume: () => volume,
      setMusic: (on) => { music = !!on; if (!music) { stopAmbience(); stopMusic(true); } else if (wantCue) playMusic(wantCue); },
      get musicOn() { return music; },
      musicCue: () => (seq && seq.cue) || null,
      tick: () => (seq ? seq.tick() : 0),
      names: () => { const C = chip(); return Object.keys(RECIPES).concat(C ? Object.keys(C.SFX).concat(Object.keys(C.ALIASES)) : []).filter((n, i, a) => a.indexOf(n) === i); },
    };
  }
  return { create, KEY, LIMITS };
}));
