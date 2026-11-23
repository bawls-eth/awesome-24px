// MMChip: a tiny 8-bit chiptune layer, pure WebAudio synthesis (no audio files, no network).
// Channels: two pulse voices (12.5 / 25 / 50% duty through PeriodicWave, 'square' fallback), a triangle bass and a noise
// channel (seeded LCG buffer). Envelopes (attack/decay/sustain/release), arpeggios and pitch slides are data on each voice.
// UMD: browser global MMChip, or require().
//   MMChip.SFX[name]      -> array of voices        MMChip.ALIASES[oldName] -> SFX name (old MMSfx names keep working)
//   MMChip.CUES[name]     -> music cue (note data)  MMChip.render(cue, seed, loops) -> deterministic event list
//   MMChip.playSfx(ctx, dest, name, cache)         MMChip.sequencer({ctx, dest, seed}) -> {start(cue), stop(), tick(), cue}
//   MMChip.prefs(storage) -> {muted, music, lowGfx} read from the EXISTING settings (mm-sfx-muted, pixeltown-save-v1, pixeltown-access-v1)
// No Math.random / Date here: every bit of variation comes from a seeded counter.
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.MMChip = factory();
}(typeof self !== 'undefined' ? self : this, function () {
  const DUTIES = [0.125, 0.25, 0.5];
  const MIDI_MIN = 24, MIDI_MAX = 108;
  const hz = (m) => 440 * Math.pow(2, (m - 69) / 12);

  // Seeded LCG (Numerical Recipes constants) -> [0,1)
  function rng(seed) {
    let s = (seed >>> 0) || 1;
    return function () { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; };
  }

  // ---------------- SFX library ----------------
  // Voice: {ch:'p1'|'p2'|'tri'|'noise', duty, n:[midi..] (arpeggio steps), step:s per arp note, slide:semitones over dur,
  //         dur, vol, at:delay, a,d,s,r (envelope), hz:noise filter, hp:true = highpass noise}
  const P = (o) => Object.assign({ ch: 'p1', duty: 0.5, step: 0, slide: 0, at: 0, a: 0.002, d: 0.03, s: 0.7, r: 0.03 }, o);
  const T = (o) => Object.assign({ ch: 'tri', step: 0, slide: 0, at: 0, a: 0.002, d: 0.03, s: 0.8, r: 0.03 }, o);
  const N = (o) => Object.assign({ ch: 'noise', hz: 3000, at: 0, a: 0.001, d: 0.02, s: 0.4, r: 0.03 }, o);
  const ladder = (k) => [P({ duty: 0.25, n: [72 + k * 2, 79 + k * 2], step: 0.04, dur: 0.09, vol: 0.06 })];
  const SFX = {
    blip: [P({ duty: 0.25, n: [84], dur: 0.03, vol: 0.04 })],
    select: [P({ duty: 0.125, n: [76, 83], step: 0.035, dur: 0.07, vol: 0.05 })],
    confirm: [P({ duty: 0.25, n: [72, 76, 79, 84], step: 0.035, dur: 0.15, vol: 0.06 })],
    back: [P({ duty: 0.25, n: [79, 72], step: 0.04, dur: 0.08, vol: 0.05 })],
    coin: [P({ duty: 0.5, n: [83, 88], step: 0.05, dur: 0.2, vol: 0.05, s: 0.5, r: 0.08 })],
    pickup: [P({ duty: 0.25, n: [76, 81, 88], step: 0.03, dur: 0.1, vol: 0.055 })],
    combo1: ladder(0), combo2: ladder(1), combo3: ladder(2), combo4: ladder(3),
    combo5: ladder(4), combo6: ladder(5), combo7: ladder(6), combo8: ladder(7),
    perfect: [P({ duty: 0.125, n: [84, 88, 91, 96], step: 0.035, dur: 0.22, vol: 0.055 }), P({ ch: 'p2', duty: 0.5, n: [72, 76, 79, 84], step: 0.035, dur: 0.22, vol: 0.03, at: 0.01 })],
    miss: [P({ duty: 0.5, n: [55], slide: -5, dur: 0.14, vol: 0.05 })],
    hit: [N({ hz: 2200, dur: 0.04, vol: 0.06 })],
    hurt: [P({ duty: 0.125, n: [62], slide: -12, dur: 0.12, vol: 0.06 }), N({ hz: 900, dur: 0.08, vol: 0.05 })],
    death: [P({ duty: 0.5, n: [67, 66, 65, 64, 63, 62, 61, 60], step: 0.06, slide: -12, dur: 0.6, vol: 0.06, r: 0.1 }), N({ hz: 500, dur: 0.4, vol: 0.04, at: 0.1 })],
    level_up: [P({ duty: 0.25, n: [72, 76, 79, 84, 88, 91, 96], step: 0.05, dur: 0.4, vol: 0.06, r: 0.1 }), T({ n: [48, 55, 60], step: 0.12, dur: 0.36, vol: 0.08 })],
    unlock: [P({ duty: 0.125, n: [79, 83, 86, 91], step: 0.06, dur: 0.3, vol: 0.05 }), P({ ch: 'p2', duty: 0.25, n: [91], dur: 0.15, vol: 0.03, at: 0.24 })],
    chest: [P({ duty: 0.5, n: [72, 75, 79, 84, 87, 91], step: 0.045, dur: 0.3, vol: 0.05 }), T({ n: [48], slide: 12, dur: 0.25, vol: 0.08 })],
    jump: [P({ duty: 0.25, n: [67], slide: 12, dur: 0.1, vol: 0.05 })],
    land: [N({ hz: 400, dur: 0.05, vol: 0.06 }), T({ n: [43], slide: -5, dur: 0.05, vol: 0.07 })],
    splash: [N({ hz: 1800, dur: 0.22, vol: 0.05, s: 0.6, r: 0.12 }), P({ duty: 0.125, n: [79], slide: -12, dur: 0.12, vol: 0.03 })],
    catch: [P({ duty: 0.25, n: [78, 83, 90], step: 0.05, dur: 0.18, vol: 0.06 })],
    reel: [P({ duty: 0.125, n: [70, 72], step: 0.02, dur: 0.04, vol: 0.03 })],
    bite: [P({ duty: 0.5, n: [86, 86], step: 0.05, dur: 0.1, vol: 0.05, s: 0.3 })],
    pop: [P({ duty: 0.5, n: [67], slide: -7, dur: 0.06, vol: 0.05 })],
    merge: [P({ duty: 0.25, n: [72, 79], slide: 5, step: 0.05, dur: 0.12, vol: 0.05 }), N({ hz: 5000, dur: 0.03, vol: 0.02, hp: true })],
    stack_drop: [T({ n: [45], slide: -7, dur: 0.08, vol: 0.09 }), N({ hz: 700, dur: 0.04, vol: 0.04 })],
    bloom_c: [P({ duty: 0.25, n: [72], dur: 0.25, vol: 0.05, s: 0.5, r: 0.15 })],
    bloom_d: [P({ duty: 0.25, n: [74], dur: 0.25, vol: 0.05, s: 0.5, r: 0.15 })],
    bloom_e: [P({ duty: 0.25, n: [76], dur: 0.25, vol: 0.05, s: 0.5, r: 0.15 })],
    bloom_g: [P({ duty: 0.25, n: [79], dur: 0.25, vol: 0.05, s: 0.5, r: 0.15 })],
    ui_open: [P({ duty: 0.125, n: [72, 79], slide: 2, step: 0.03, dur: 0.07, vol: 0.04 })],
    ui_close: [P({ duty: 0.125, n: [79, 72], slide: -2, step: 0.03, dur: 0.07, vol: 0.04 })],
    error: [P({ duty: 0.5, n: [50, 49], step: 0.08, dur: 0.18, vol: 0.05, s: 0.9 })],
    // Realm extras (old recipe names map here)
    shoot: [P({ duty: 0.125, n: [81], slide: -9, dur: 0.035, vol: 0.035 })],
    kill: [T({ n: [69], slide: -24, dur: 0.12, vol: 0.08 })],
    boss: [P({ duty: 0.5, n: [34], slide: -7, dur: 0.5, vol: 0.06, s: 0.9 }), T({ n: [33, 28], step: 0.2, dur: 0.45, vol: 0.09, at: 0.1 })],
    warn: [P({ duty: 0.5, n: [76, 0, 72], step: 0.06, dur: 0.17, vol: 0.04 })],
    portal: [P({ duty: 0.125, n: [57], slide: 24, dur: 0.35, vol: 0.04 }), T({ n: [64], slide: 24, dur: 0.3, vol: 0.05, at: 0.05 })],
    shutter: [N({ hz: 6000, dur: 0.03, vol: 0.04, hp: true }), P({ duty: 0.5, n: [57], dur: 0.04, vol: 0.03, at: 0.03 })],
  };
  // Old MMSfx / Town names -> chip names. Names already in SFX (hit, hurt, pickup, kill, warn, portal, catch, coin, pop, shutter) map to themselves.
  const ALIASES = {
    shot: 'shoot', levelup: 'level_up', bag_rare: 'chest', boss_awaken: 'boss', claim: 'confirm', ui_tap: 'blip',
    sell: 'confirm', achievement: 'unlock', deny: 'error', stack: 'stack_drop', drop: 'stack_drop', open: 'ui_open', close: 'ui_close',
  };
  const resolve = (name) => (SFX[name] ? name : (ALIASES[name] && SFX[ALIASES[name]] ? ALIASES[name] : null));

  // ---------------- music cues ----------------
  // Track strings: one token per eighth note. Degrees 1-7 of the cue's scale, ' = octave up, , = octave down, # / b = sharp / flat,
  // '.' = rest, '-' = hold the previous note. Drums: k kick, s snare, h hat, '.' rest. '|' is a bar line (ignored).
  const SCALES = { major: [0, 2, 4, 5, 7, 9, 11], minor: [0, 2, 3, 5, 7, 8, 10], harm: [0, 2, 3, 5, 7, 8, 11] };
  const CUES = {
    hub: { bpm: 84, key: 60, scale: 'major', bars: 4, loop: true, vary: 0.08,
      lead: { ch: 'p1', duty: 0.25, vol: 0.035, oct: 0, notes: '5 . 3 . 4 5 6 - | 5 . 3 . 2 - - . | 4 . 2 . 3 4 5 - | 3 . 2 . 1 - - .' },
      harm: { ch: 'p2', duty: 0.125, vol: 0.02, oct: 0, notes: '3 . . . 3 . . . | 2 . . . 7, . . . | 2 . . . 1 . . . | 7, . . . 1 . . .' },
      bass: { ch: 'tri', vol: 0.06, oct: -2, notes: '1 . 5 . 1 . 5 . | 5, . 2 . 5, . 2 . | 4, . 1 . 4, . 1 . | 5, . 2 . 1 - . .' },
      drums: { vol: 0.012, notes: 'k . . . h . . . | k . . . h . . . | k . . . h . . . | k . . . h . h .' } },
    town: { bpm: 112, key: 65, scale: 'major', bars: 8, loop: true, vary: 0.1,
      lead: { ch: 'p1', duty: 0.5, vol: 0.03, oct: 0, notes: '1 . 3 5 6 5 3 . | 4 . 6 1\' 6 - 5 . | 3 . 5 1\' 7 5 4 . | 2 - 3 4 5 - - . | 1 . 3 5 6 5 3 . | 4 . 6 1\' 2\' 1\' 6 . | 5 . 3 4 2 . 7, . | 1 - - . . . . .' },
      harm: { ch: 'p2', duty: 0.25, vol: 0.018, oct: -1, notes: '3 . 3 . 3 . 3 . | 4 . 4 . 4 . 4 . | 5 . 5 . 5 . 5 . | 5 . 5 . 7 . 7 . | 3 . 3 . 3 . 3 . | 4 . 4 . 4 . 4 . | 2 . 2 . 4 . 4 . | 3 - - . . . . .' },
      bass: { ch: 'tri', vol: 0.06, oct: -2, notes: '1 . 5 . 1 . 5 . | 4 . 1\' . 4 . 1\' . | 6, . 3 . 6, . 3 . | 5, . 2 . 5, . 7, . | 1 . 5 . 1 . 5 . | 4 . 1\' . 4 . 1\' . | 5, . 5, . 5, . 7, . | 1 . 5, . 1 . . .' },
      drums: { vol: 0.014, notes: 'k . h . s . h . | k . h . s . h h | k . h . s . h . | k . h . s . s h | k . h . s . h . | k . h . s . h h | k . h . s . h . | k . s . k . . .' } },
    realm: { bpm: 132, key: 62, scale: 'minor', bars: 8, loop: true, vary: 0.1,
      lead: { ch: 'p1', duty: 0.25, vol: 0.03, oct: 0, notes: '1 . 5 . 4 3 4 5 | 6 - 5 - 4 - 3 - | 1 . 5 . 4 3 4 5 | 7 - 6 - 5 - - . | 3 . 4 5 6 . 5 . | 4 . 3 4 5 . 1\' . | 7 6 5 4 3 4 5 6 | 5 - - - 5, - . .' },
      harm: { ch: 'p2', duty: 0.125, vol: 0.016, oct: 0, notes: '1\' 5 1\' 5 1\' 5 1\' 5 | 4 1 4 1 4 1 4 1 | 1\' 5 1\' 5 1\' 5 1\' 5 | 7 5 7 5 7 5 7 5 | 6 3 6 3 6 3 6 3 | 4 1 4 1 4 1 4 1 | 3 7, 3 7, 3 7, 3 7, | 5 2 5 2 5 2 . .' },
      bass: { ch: 'tri', vol: 0.065, oct: -2, notes: '1 1 1\' 1 1 1 1\' 1 | 6, 6, 6 6, 6, 6, 6 6, | 1 1 1\' 1 1 1 1\' 1 | 7, 7, 7 7, 7, 7, 7 7, | 6, 6, 6 6, 6, 6, 6 6, | 4, 4, 4 4, 4, 4, 4 4, | 3, 3, 3 3, 3, 3, 3 3, | 5, 5, 5 5, 5, . . .' },
      drums: { vol: 0.016, notes: 'k . h k s . h . | k . h k s . h h | k . h k s . h . | k . h k s . s s | k . h k s . h . | k . h k s . h h | k . h k s . h . | k k s . s s s s' } },
    dungeon: { bpm: 96, key: 57, scale: 'harm', bars: 4, loop: true, vary: 0.12,
      lead: { ch: 'p1', duty: 0.125, vol: 0.028, oct: 0, notes: '1 . . 2 3 . . 2 | 1 . 7, . 6, - - . | 1 . . 2 3 . 5 . | 4 - 3 - 7, - - .' },
      harm: { ch: 'p2', duty: 0.5, vol: 0.012, oct: -1, notes: '5 . 5 . 5 . 5 . | 6 . 6 . 6 . 6 . | 5 . 5 . 5 . 5 . | 7 . 7 . 7 . 7 .' },
      bass: { ch: 'tri', vol: 0.07, oct: -2, notes: '1 . 1 . 1 . 1 . | 6, . 6, . 6, . 6, . | 4, . 4, . 4, . 4, . | 5, . 5, . 5, 5, 5, 5,' },
      drums: { vol: 0.012, notes: 'k . . . . . h . | k . . . s . . . | k . . . . . h . | k . . k s . h h' } },
    minigame: { bpm: 144, key: 67, scale: 'major', bars: 4, loop: true, vary: 0.1,
      lead: { ch: 'p1', duty: 0.5, vol: 0.03, oct: 0, notes: '1 3 5 3 6 5 3 1 | 2 4 6 4 5 - 3 . | 1 3 5 1\' 7 5 6 7 | 1\' - 5 - 1\' . . .' },
      harm: { ch: 'p2', duty: 0.25, vol: 0.016, oct: 0, notes: '. 1 . 1 . 1 . 1 | . 2 . 2 . 7, . 7, | . 1 . 3 . 2 . 4 | . 3 . 2 . . . .' },
      bass: { ch: 'tri', vol: 0.065, oct: -2, notes: '1 . 1\' . 1 . 1\' . | 2 . 2\' . 5, . 5 . | 6, . 6 . 4, . 4 . | 5, . 5 . 1 . . .' },
      drums: { vol: 0.016, notes: 'k h s h k h s h | k h s h k h s h | k h s h k h s h | k k s h s s s .' } },
    results: { bpm: 150, key: 72, scale: 'major', bars: 2, loop: false, vary: 0,
      lead: { ch: 'p1', duty: 0.25, vol: 0.04, oct: 0, notes: '1 3 5 1\' . 5 1\' - | 2\' - 3\' - - - . .' },
      harm: { ch: 'p2', duty: 0.125, vol: 0.022, oct: 0, notes: '5, 1 3 5 . 3 5 - | 7 - 1\' - - - . .' },
      bass: { ch: 'tri', vol: 0.07, oct: -2, notes: '1 . 5 . 1\' . 5 . | 5 - 1 - - - . .' },
      drums: { vol: 0.016, notes: 'k . s . k . s . | k . k . s . . .' } },
  };
  const TRACKS = ['lead', 'harm', 'bass', 'drums'];
  const toks = (s) => String(s).split(/\s+/).filter((t) => t && t !== '|');

  // degree token -> midi (relative to base) or null for rest/hold
  function degree(tok, scale, base) {
    const m = /^([1-7])([#b]?)(['\,]*)$/.exec(tok);
    if (!m) return null;
    let v = base + SCALES[scale][+m[1] - 1] + (m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0);
    for (const c of m[3]) v += c === "'" ? 12 : -12;
    return v;
  }

  // Deterministic event list: [{step, t, ch, duty, midi, len, vol, drum}] for `loops` passes of the cue.
  // Seeded variation: on passes after the first, some lead notes step to a neighbouring scale tone and some hats drop out.
  function render(name, seed, loops) {
    const cue = typeof name === 'string' ? CUES[name] : name;
    if (!cue) return [];
    loops = Math.max(1, loops | 0 || 1);
    const R = rng((seed | 0) + 7919);
    const steps = cue.bars * 8, sp = 60 / cue.bpm / 2, out = [];
    for (let pass = 0; pass < loops; pass++) {
      TRACKS.forEach((tk) => {
        const tr = cue[tk];
        if (!tr) return;
        const tt = toks(tr.notes);
        for (let i = 0; i < steps; i++) {
          const tok = tt[i % tt.length];
          const step = pass * steps + i;
          if (tk === 'drums') {
            if (tok === '.' || !/^[ksh]$/.test(tok)) continue;
            if (pass > 0 && tok === 'h' && R() < cue.vary) continue;
            out.push({ step, t: step * sp, ch: 'noise', drum: tok, len: tok === 's' ? sp * 0.6 : sp * 0.25, vol: tr.vol * (tok === 'k' ? 1.4 : 1) });
            continue;
          }
          const base = cue.key + 12 * (tr.oct || 0);
          let midi = degree(tok, cue.scale, base);
          if (midi === null) continue;
          let len = 1;
          while (i + len < steps && tt[(i + len) % tt.length] === '-') len++;
          if (pass > 0 && tk === 'lead' && R() < cue.vary) {
            const sc = SCALES[cue.scale], rel = ((midi - cue.key) % 12 + 12) % 12, idx = sc.indexOf(rel);
            if (idx >= 0) { const dir = R() < 0.5 ? 1 : -1, j = (idx + dir + 7) % 7; midi = midi - rel + sc[j] + (idx + dir > 6 ? 12 : idx + dir < 0 ? -12 : 0); }
          }
          out.push({ step, t: step * sp, ch: tr.ch, duty: tr.duty, midi, len: len * sp * 0.92, vol: tr.vol });
        }
      });
    }
    out.sort((a, b) => a.t - b.t || (a.ch < b.ch ? -1 : a.ch > b.ch ? 1 : 0));
    return out;
  }
  const cueLength = (name) => { const c = CUES[name]; return c ? c.bars * 8 * (60 / c.bpm / 2) : 0; };

  // ---------------- WebAudio plumbing ----------------
  function pulseWave(ctx, duty, cache) {
    if (!ctx.createPeriodicWave) return null;
    cache.waves = cache.waves || {};
    if (cache.waves[duty]) return cache.waves[duty];
    const H = 32, re = new Float32Array(H), im = new Float32Array(H);
    for (let n = 1; n < H; n++) re[n] = (2 / (n * Math.PI)) * Math.sin(n * Math.PI * duty);
    try { cache.waves[duty] = ctx.createPeriodicWave(re, im); } catch (e) { cache.waves[duty] = null; }
    return cache.waves[duty];
  }
  function noiseBuffer(ctx, cache) {
    if (cache.noise) return cache.noise;
    const rate = ctx.sampleRate || 44100, n = Math.floor(rate * 0.5), R = rng(0x8b17);
    const b = ctx.createBuffer(1, n, rate), d = b.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = R() * 2 - 1;
    cache.noise = b;
    return b;
  }
  function envelope(g, t0, v) {
    const peak = v.vol, a = v.a || 0.002, d = v.d || 0.02, sus = peak * (v.s === undefined ? 0.7 : v.s), end = t0 + Math.max(v.dur, a + d), r = v.r || 0.02;
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.linearRampToValueAtTime(peak, t0 + a);
    g.gain.linearRampToValueAtTime(sus, t0 + a + d);
    g.gain.setValueAtTime(sus, end);
    g.gain.linearRampToValueAtTime(0.0001, end + r);
    return end + r;
  }
  // One voice = one oscillator (arpeggio = stepped frequency, slide = ramp), or one noise source.
  function voice(ctx, dest, v, t0, cache) {
    const g = ctx.createGain(), stopAt = envelope(g, t0, v);
    g.connect(dest);
    if (v.ch === 'noise') {
      const s = ctx.createBufferSource();
      s.buffer = noiseBuffer(ctx, cache);
      let tail = s;
      if (ctx.createBiquadFilter) { const f = ctx.createBiquadFilter(); f.type = v.hp ? 'highpass' : 'bandpass'; f.frequency.value = v.hz || 3000; s.connect(f); tail = f; }
      tail.connect(g); s.start(t0); s.stop(stopAt + 0.01);
      return;
    }
    const o = ctx.createOscillator();
    if (v.ch === 'tri') o.type = 'triangle';
    else { const w = pulseWave(ctx, v.duty || 0.5, cache); if (w && o.setPeriodicWave) o.setPeriodicWave(w); else o.type = 'square'; }
    const notes = v.n || [60];
    let last = notes[0];
    notes.forEach((m, i) => { if (m > 0) { o.frequency.setValueAtTime(hz(m), t0 + i * (v.step || 0)); last = m; } });
    if (v.slide) o.frequency.linearRampToValueAtTime(hz(last + v.slide), t0 + v.dur);
    o.connect(g); o.start(t0); o.stop(stopAt + 0.01);
  }
  function playSfx(ctx, dest, name, cache) {
    const key = resolve(name);
    if (!key) return false;
    const t = ctx.currentTime;
    SFX[key].forEach((v) => voice(ctx, dest, v, t + (v.at || 0), cache || {}));
    return true;
  }
  function drumVoice(e) {
    if (e.drum === 'k') return { ch: 'tri', n: [40], slide: -12, dur: 0.07, vol: e.vol * 4, a: 0.001, d: 0.02, s: 0.6, r: 0.02 };
    if (e.drum === 's') return { ch: 'noise', hz: 1800, dur: e.len, vol: e.vol, a: 0.001, d: 0.03, s: 0.3, r: 0.03 };
    return { ch: 'noise', hz: 7000, hp: true, dur: 0.02, vol: e.vol * 0.6, a: 0.001, d: 0.01, s: 0.3, r: 0.01 };
  }

  // Look-ahead sequencer. tick() schedules notes up to `ahead` seconds past ctx.currentTime; the caller drives it with a timer
  // (or tests call it directly). Each loop pass re-renders with the next seed from a counter, so the variation is deterministic.
  function sequencer(o) {
    const ctx = o.ctx, dest = o.dest, cache = o.cache || {}, ahead = o.ahead || 0.25;
    let seed = o.seed | 0, cur = null, events = [], idx = 0, t0 = 0, pass = 0, count = 0;
    function load() { events = render(cur, seed + pass, 1); idx = 0; }
    function tick() {
      if (!cur) return 0;
      const now = ctx.currentTime, cue = CUES[cur], len = cueLength(cur);
      let n = 0;
      while (cur) {
        if (idx >= events.length) {
          if (!cue.loop) { cur = null; break; }
          pass++; t0 += len; load();
          continue;
        }
        const e = events[idx], at = t0 + e.t;
        if (at > now + ahead) break;
        idx++;
        if (at < now - 0.05) continue; // fell behind (tab hidden): skip instead of bursting
        const v = e.ch === 'noise' || e.drum ? drumVoice(e) : { ch: e.ch, duty: e.duty, n: [e.midi], dur: e.len, vol: e.vol, a: 0.004, d: 0.05, s: 0.75, r: 0.03 };
        voice(ctx, dest, v, at, cache); n++; count++;
      }
      return n;
    }
    return {
      start(name) { if (!CUES[name]) return false; if (cur === name) return true; cur = name; pass = 0; t0 = ctx.currentTime + 0.05; load(); tick(); return true; },
      stop() { cur = null; events = []; },
      tick,
      get cue() { return cur; },
      get scheduled() { return count; },
    };
  }

  // Existing settings only: the shared mute key (mm-sfx-muted, written by every page's mute button) wins when present,
  // else the Town save's sfxMuted; music follows the Town save's musicEnabled (default OFF); low graphics = no music.
  function prefs(storage) {
    const out = { muted: false, music: false, lowGfx: false };
    if (!storage) return out;
    const get = (k) => { try { return storage.getItem(k); } catch (e) { return null; } };
    const json = (k) => { try { const v = get(k); return v ? JSON.parse(v) : null; } catch (e) { return null; } };
    const m = get('mm-sfx-muted'), save = json('pixeltown-save-v1'), acc = json('pixeltown-access-v1');
    if (m === '1' || m === '0') out.muted = m === '1';
    else out.muted = !!(save && save.sfxMuted === true);
    out.music = !!(save && save.musicEnabled === true);
    out.lowGfx = !!(acc && acc.lowGfx === true);
    return out;
  }

  return { SFX, ALIASES, CUES, SCALES, DUTIES, MIDI_MIN, MIDI_MAX, TRACKS, hz, rng, resolve, render, cueLength, degree, toks, playSfx, voice, sequencer, prefs, pulseWave };
}));
