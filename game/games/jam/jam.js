// Campfire Jam page: canvas lanes, input, WebAudio synth, menu/results. Rules live in shared/mm-jam.js + mm-jam-songs.js.
(function () {
  'use strict';
  var Jam = window.MMJam, SG = window.MMJamSongs, R = window.MMRng, S = window.MMStore;
  var KEY = 'pixeltown-jam-v1';
  var qs = new URLSearchParams(location.search);
  var TEST = qs.get('test') === '1';
  var FROM_HUB = qs.get('from') === 'hub'; // exact match only
  var LANES = Jam.LANES;
  var CW = 320, CH = 420, LANE_W = CW / 4, HIT_Y = 340, APPROACH_MS = 1400;
  var LANE_COL = ['#ef476f', '#ffd166', '#06d6a0', '#4cc9f0'];
  var JUDGE_LABEL = { perfect: 'Perfect', great: 'Great', good: 'Good', miss: 'Miss' };
  var JUDGE_COL = { perfect: '#fff3b0', great: '#9bf6ff', good: '#caffbf', miss: '#ff6b6b' };
  var KEYMAP = { KeyD: 'D', KeyF: 'F', KeyJ: 'J', KeyK: 'K', ArrowLeft: 'D', ArrowDown: 'F', ArrowUp: 'J', ArrowRight: 'K' };

  // ---------- reduced motion ----------
  var reduced = false;
  function syncReduced() { try { reduced = window.MMMotion ? window.MMMotion.reduced(window, window.localStorage) : false; } catch (e) { reduced = false; } }
  syncReduced();
  var mq = window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)') : null;
  if (mq && mq.addEventListener) mq.addEventListener('change', syncReduced);

  // ---------- save (only pixeltown-jam-v1) ----------
  var save = SG.cleanSave(S.get(KEY, null));
  function persist() { S.set(KEY, save); }
  persist();

  // ---------- state ----------
  var cv = document.getElementById('game'), ctx = cv.getContext('2d');
  var overlay = document.getElementById('overlay');
  var mode = 'menu'; // menu | play | pause | results
  var songId = null, tier = null, chart = null, run = null, lastReport = null, lastResult = null;
  var paused = false, popups = [], flashes = [0, 0, 0, 0], rings = [], glows = [], shake = 0, lastJudge = null, lastTiming = null;
  var held = {}, laneKeys = {}, ptrLane = {};
  var testNow = 0;
  var stars = [];
  (function () { var g = R.create('jam-stars'); for (var i = 0; i < 30; i++) stars.push({ x: g.int(0, CW), y: g.int(0, HIT_Y - 40), p: g.next() * 6.28 }); })();

  // ---------- clock: AudioContext time when running, else performance.now; test mode uses a manual clock ----------
  var actx = null, master = null, audioMode = false, t0 = 0, pauseSrc = 0, pausedTotal = 0, evIdx = 0, events = null, noiseBuf = null;
  function src() { return audioMode ? actx.currentTime * 1000 : performance.now(); }
  var frozenAt = 0;
  function songNow() {
    if (TEST) return testNow;
    if (paused || mode !== 'play') return frozenAt;
    return src() - t0 - pausedTotal;
  }

  // ---------- sound ----------
  var sfx = null;
  function ensureSfx() {
    if (sfx || !window.MMSfx) return sfx;
    try { sfx = window.MMSfx.create({ storage: window.localStorage }); } catch (e) { sfx = null; }
    syncMute();
    return sfx;
  }
  function muted() { if (sfx) return sfx.isMuted(); try { return window.localStorage.getItem('mm-sfx-muted') === '1'; } catch (e) { return false; } }
  function syncMute() {
    var b = document.getElementById('btn-mute'); if (!b) return;
    var m = muted();
    b.textContent = m ? 'Sound off' : 'Sound on'; b.setAttribute('aria-pressed', m ? 'true' : 'false');
    if (master) { try { master.gain.value = m ? 0 : 0.8; } catch (e) { /* ignore */ } }
  }
  function ensureAudio() {
    ensureSfx();
    if (TEST) return null;
    if (actx) { if (actx.state === 'suspended' && mode !== 'pause') { try { actx.resume(); } catch (e) { /* ignore */ } } return actx; }
    var C = window.AudioContext || window.webkitAudioContext;
    if (!C) return null;
    try { actx = new C(); master = actx.createGain(); master.connect(actx.destination); syncMute(); if (actx.state === 'suspended') actx.resume(); } catch (e) { actx = null; master = null; }
    return actx;
  }
  function noise() {
    if (noiseBuf) return noiseBuf;
    var rate = actx.sampleRate || 44100, n = Math.floor(rate * 0.2), g = R.create('jam-noise');
    noiseBuf = actx.createBuffer(1, n, rate);
    var d = noiseBuf.getChannelData(0);
    for (var i = 0; i < n; i++) d[i] = g.next() * 2 - 1;
    return noiseBuf;
  }
  function osc(type, f0, f1, at, dur, vol) {
    var o = actx.createOscillator(), g = actx.createGain();
    o.type = type; o.frequency.setValueAtTime(f0, at);
    if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(Math.max(1, f1), at + dur);
    g.gain.setValueAtTime(vol, at); g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
    o.connect(g); g.connect(master); o.start(at); o.stop(at + dur + 0.02);
  }
  function hiss(hz, type, at, dur, vol) {
    var s = actx.createBufferSource(), f = actx.createBiquadFilter(), g = actx.createGain();
    s.buffer = noise(); f.type = type; f.frequency.value = hz;
    g.gain.setValueAtTime(vol, at); g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
    s.connect(f); f.connect(g); g.connect(master); s.start(at); s.stop(at + dur + 0.02);
  }
  function voice(kind, at, hz) {
    if (!actx || !master) return;
    try {
      if (kind === 'kick') osc('sine', 150, 45, at, 0.14, 0.55);
      else if (kind === 'snare') { hiss(1800, 'bandpass', at, 0.1, 0.22); osc('triangle', 200, 120, at, 0.08, 0.15); }
      else if (kind === 'hat') hiss(7000, 'highpass', at, 0.04, 0.07);
      else if (kind === 'bass') osc('triangle', hz, hz, at, 0.3, 0.28);
    } catch (e) { /* ignore */ }
  }
  function hitTone(laneIdx, j) {
    if (!actx || TEST || muted() || !run) return;
    try {
      var at = actx.currentTime + 0.001;
      if (j === 'miss') osc('sawtooth', 110, 70, at, 0.12, 0.12);
      else osc('square', SG.toneHz(songId, laneIdx, songNow()), SG.toneHz(songId, laneIdx, songNow()), at, 0.2, j === 'perfect' ? 0.16 : 0.11);
    } catch (e) { /* ignore */ }
  }
  // schedule backing events up to 1.5 s ahead of the song clock
  function pumpBacking() {
    if (!audioMode || !events || paused) return;
    var horizon = songNow() + 1500;
    while (evIdx < events.length && events[evIdx].t <= horizon) {
      var e = events[evIdx++];
      voice(e.kind, t0 / 1000 + e.t / 1000, e.hz);
    }
  }

  // ---------- DOM helpers ----------
  function $(id) { return document.getElementById(id); }
  function el(tag, text, cls) { var e = document.createElement(tag); if (text !== undefined) e.textContent = text; if (cls) e.className = cls; return e; }
  function clear(n) { while (n.firstChild) n.removeChild(n.firstChild); }
  function btn(text, fn, disabled) { var b = el('button', text); b.type = 'button'; if (disabled) b.disabled = true; else b.addEventListener('click', fn); return b; }
  function starText(n) { return '★'.repeat(n) + '☆'.repeat(3 - n); }
  function homeLink(cls) {
    var a = document.createElement('a'); a.className = cls; a.id = 'menu-back';
    a.href = FROM_HUB ? '../../hub/index.html' : '../../index.html';
    a.textContent = FROM_HUB ? '← Back to the map' : '← Back to town';
    return a;
  }
  if (FROM_HUB) { $('back-hub').classList.add('primary'); document.body.dataset.from = 'hub'; }

  // ---------- run control ----------
  function startSong(id, tr, opts) {
    opts = opts || {};
    if (!SG.song(id)) return null;
    ensureAudio();
    songId = id; tier = SG.TIERS.indexOf(tr) >= 0 ? tr : 'normal';
    chart = opts.chart || SG.chartFor(id, tier, opts.seed !== undefined ? opts.seed : qs.get('seed') || undefined);
    run = Jam.createRun(chart, { clock: songNow, offset: SG.offsetOf(save) }); // offset shifts judging only, never the clock
    popups = []; rings = []; glows = []; lastTiming = null; flashes = [0, 0, 0, 0]; shake = 0; held = {}; laneKeys = {}; ptrLane = {};
    lastJudge = null;
    $('hud-timing').textContent = '';
    paused = false; pausedTotal = 0; testNow = 0; frozenAt = 0; evIdx = 0;
    events = SG.backing(id, tier);
    audioMode = !!(actx && !TEST && actx.state === 'running');
    t0 = src() + (audioMode ? 150 : 0);
    mode = 'play'; overlay.hidden = true;
    $('hud-song').textContent = SG.song(id).name + ' / ' + SG.TIER_NAMES[tier];
    updateHud();
    return run;
  }
  function finish() {
    if (mode !== 'play') return;
    releaseAll();
    run.update();
    var res = run.result();
    lastResult = res;
    lastReport = SG.record(save, songId, tier, res);
    persist();
    frozenAt = songNow(); mode = 'results';
    showResults();
  }
  function releaseAll() { Object.keys(held).forEach(function (l) { if (held[l]) { run.release(l); held[l] = false; } }); }
  function quit() { if (run) { releaseAll(); } paused = false; stopAudioForMenu(); showMenu(); }
  // drop the context so already-scheduled backing notes cannot ring on after quitting
  function stopAudioForMenu() { audioMode = false; events = null; if (actx) { try { actx.close(); } catch (e) { /* ignore */ } actx = null; master = null; noiseBuf = null; } }

  function pause() {
    if (mode !== 'play' || paused) return;
    frozenAt = songNow(); paused = true; mode = 'pause';
    if (!TEST) { if (audioMode) { try { actx.suspend(); } catch (e) { /* ignore */ } } else pauseSrc = performance.now(); }
    showPause();
  }
  function resume() {
    if (mode !== 'pause') return;
    if (!TEST) { if (audioMode) { try { actx.resume(); } catch (e) { /* ignore */ } } else pausedTotal += performance.now() - pauseSrc; }
    paused = false; mode = 'play'; overlay.hidden = true;
  }

  // ---------- input ----------
  function press(lane) {
    if (mode !== 'play' || !run) return null;
    var idx = LANES.indexOf(lane); if (idx < 0) return null;
    flashes[idx] = 1;
    var j = run.press(lane);
    if (j) {
      held[lane] = run.state.holds[lane] ? true : false;
      var dl = run.state.lastDelta;
      popup(j, idx, dl);
      glows.push({ lane: idx, t: 0, col: JUDGE_COL[j] }); if (glows.length > 8) glows.shift();
      if (!reduced) rings.push({ lane: idx, t: 0 });
      if (j !== 'miss') hitTone(idx, j);
    } else hitTone(idx, 'tap');
    lastJudge = j; updateHud();
    return j;
  }
  function release(lane) {
    if (mode !== 'play' || !run) return null;
    var r = run.release(lane); held[lane] = false;
    if (r === 'broken') popup('miss', LANES.indexOf(lane));
    updateHud();
    return r;
  }
  // early/late tag: negative delta = early. Within 8 ms counts as on time (no tag).
  function timingTag(d) { if (typeof d !== 'number' || Math.abs(d) < 8) return ''; return d < 0 ? 'early' : 'late'; }
  function popup(j, idx, delta) {
    var tag = j === 'miss' ? '' : timingTag(delta);
    popups.push({ text: JUDGE_LABEL[j], tag: tag, col: JUDGE_COL[j], x: idx * LANE_W + LANE_W / 2, t: 0 }); if (popups.length > 8) popups.shift();
    lastTiming = tag ? tag + ' ' + Math.abs(delta) + ' ms' : (j === 'miss' ? null : 'on time');
    var h = $('hud-timing'); if (h) h.textContent = lastTiming ? JUDGE_LABEL[j] + ' ' + lastTiming : JUDGE_LABEL[j];
  }
  function pressSource(key, lane) { if (!laneKeys[key]) { laneKeys[key] = lane; press(lane); } }
  function releaseSource(key) { var l = laneKeys[key]; if (l) { delete laneKeys[key]; var still = Object.keys(laneKeys).some(function (k) { return laneKeys[k] === l; }); if (!still) release(l); pad(l, still); } }
  function pad(lane, on) { var b = $('pad-' + lane); if (b) b.classList.toggle('on', !!on); }

  window.addEventListener('keydown', function (e) {
    if (mode !== 'play') ensureAudio();
    if (mode === 'calib') {
      if (e.code === 'Escape') { calCancel(); return; }
      if (cal && cal.state === 'run' && (e.code === 'Space' || KEYMAP[e.code])) { e.preventDefault(); if (!e.repeat) calTap(); }
      return;
    }
    if (e.code === 'Escape' || e.code === 'KeyP') { if (mode === 'play') pause(); else if (mode === 'pause') resume(); return; }
    var lane = KEYMAP[e.code];
    if (!lane) return;
    if (mode === 'play') e.preventDefault();
    if (e.repeat) return;
    pressSource('k:' + e.code, lane); pad(lane, true);
  });
  window.addEventListener('keyup', function (e) { if (KEYMAP[e.code]) releaseSource('k:' + e.code); });
  window.addEventListener('blur', function () { Object.keys(laneKeys).forEach(releaseSource); if (mode === 'play' && !TEST) pause(); });
  document.addEventListener('visibilitychange', function () { if (document.hidden && mode === 'play') pause(); });
  window.addEventListener('pointerdown', ensureAudio, { passive: true });

  function bindPointer(node, laneOf) {
    node.addEventListener('pointerdown', function (e) {
      e.preventDefault();
      var lane = laneOf(e); if (!lane) return;
      try { node.setPointerCapture(e.pointerId); } catch (x) { /* ignore */ }
      ptrLane[e.pointerId] = lane; pressSource('p:' + e.pointerId, lane); pad(lane, true);
    });
    function up(e) { if (ptrLane[e.pointerId]) { var l = ptrLane[e.pointerId]; delete ptrLane[e.pointerId]; releaseSource('p:' + e.pointerId); pad(l, false); } }
    node.addEventListener('pointerup', up); node.addEventListener('pointercancel', up);
  }
  bindPointer(cv, function (e) { var r = cv.getBoundingClientRect(); return LANES[Math.max(0, Math.min(3, Math.floor((e.clientX - r.left) / r.width * 4)))]; });
  LANES.forEach(function (l) { bindPointer($('pad-' + l), function () { return l; }); });
  $('btn-mute').addEventListener('click', function () { ensureAudio(); if (sfx) sfx.setMuted(!sfx.isMuted()); syncMute(); });
  if (!window.MMSfx) $('btn-mute').hidden = true;
  syncMute();

  // optional gamepad: face buttons 0-3 (or d-pad) hit D F J K
  var padPrev = {};
  function pollGamepad() {
    var gps; try { gps = navigator.getGamepads ? navigator.getGamepads() : null; } catch (e) { gps = null; }
    if (!gps) return;
    var maps = [[2, 14], [0, 12], [1, 13], [3, 15]];
    for (var gi = 0; gi < gps.length; gi++) {
      var gp = gps[gi]; if (!gp) continue;
      if (gp.buttons[9] && gp.buttons[9].pressed && !padPrev['start' + gi]) { if (mode === 'play') pause(); else if (mode === 'pause') resume(); }
      padPrev['start' + gi] = gp.buttons[9] && gp.buttons[9].pressed;
      for (var li = 0; li < 4; li++) {
        var on = maps[li].some(function (b) { return gp.buttons[b] && gp.buttons[b].pressed; }), k = 'g:' + gi + ':' + li;
        if (on && !padPrev[k]) pressSource(k, LANES[li]);
        if (!on && padPrev[k]) releaseSource(k);
        padPrev[k] = on;
      }
    }
  }

  // ---------- step / update ----------
  function tick() {
    if (mode !== 'play' || !run) return;
    run.update();
    var fresh = false;
    run.notes.forEach(function (n) { if (n.judge === 'miss' && !n.shown) { n.shown = true; fresh = true; popup('miss', LANES.indexOf(n.lane)); } });
    if (fresh) { if (!reduced) shake = 0.08; lastJudge = 'miss'; }
    pumpBacking();
    if (songNow() >= chart.lengthMs) finish();
    updateHud();
  }
  // test hook: advance the manual clock in small slices so update() sees every miss
  function step(ms) {
    if (!TEST || mode !== 'play') return;
    var left = ms;
    while (left > 0 && mode === 'play') { var d = Math.min(left, 16); testNow += d; left -= d; tick(); animate(d / 1000); }
  }
  function animate(dt) {
    for (var i = 0; i < 4; i++) flashes[i] = Math.max(0, flashes[i] - dt * 5);
    popups.forEach(function (p) { p.t += dt; }); popups = popups.filter(function (p) { return p.t < 0.6; });
    rings.forEach(function (r) { r.t += dt; }); rings = rings.filter(function (r) { return r.t < 0.3; });
    var gl = reduced ? 0.2 : 0.35; glows.forEach(function (q) { q.t += dt; }); glows = glows.filter(function (q) { return q.t < gl; });
    shake = Math.max(0, shake - dt);
  }
  function updateHud() {
    if (!run) { $('hud-score').textContent = '0'; $('hud-combo').textContent = 'Combo 0'; $('hud-acc').textContent = '100%'; return; }
    var s = run.state, judged = s.counts.perfect + s.counts.great + s.counts.good + s.counts.miss;
    var accNow = judged ? Math.round(s.score / (judged * Jam.POINTS.perfect) * 100) : 100;
    $('hud-score').textContent = String(s.score);
    $('hud-combo').textContent = 'Combo ' + s.combo;
    $('hud-acc').textContent = accNow + '%';
    $('progress-bar').style.width = Math.max(0, Math.min(100, songNow() / chart.lengthMs * 100)).toFixed(1) + '%';
  }

  // ---------- render ----------
  var speed = (HIT_Y - 10) / APPROACH_MS;
  function noteY(t, now) { return HIT_Y - (t - now) * speed; }
  function shape(g, idx, x, y, r) {
    g.beginPath();
    if (idx === 0) g.arc(x, y, r, 0, 6.283);
    else if (idx === 1) { g.moveTo(x, y - r); g.lineTo(x + r, y); g.lineTo(x, y + r); g.lineTo(x - r, y); g.closePath(); }
    else if (idx === 2) g.rect(x - r * 0.85, y - r * 0.85, r * 1.7, r * 1.7);
    else { g.moveTo(x, y - r); g.lineTo(x + r, y + r * 0.8); g.lineTo(x - r, y + r * 0.8); g.closePath(); }
    g.fill();
  }
  function render(time) {
    var g = ctx; g.setTransform(1, 0, 0, 1, 0, 0);
    var now = songNow(), combo = run ? run.state.combo : 0;
    var ox = 0;
    if (shake > 0 && !reduced) ox = Math.round(Math.sin(time * 90) * 2);
    g.save(); g.translate(ox, 0);
    var bg = g.createLinearGradient(0, 0, 0, CH); bg.addColorStop(0, '#120e1e'); bg.addColorStop(1, '#2a1a2e');
    g.fillStyle = bg; g.fillRect(0, 0, CW, CH);
    stars.forEach(function (s) { g.fillStyle = 'rgba(255,255,255,' + (reduced ? 0.6 : 0.4 + 0.3 * Math.sin(time * 2 + s.p)) + ')'; g.fillRect(s.x, s.y, 2, 2); });
    // campfire glow, grows with combo; steady when reduced
    var flick = reduced ? 0 : Math.sin(time * 9) * 0.04 + Math.sin(time * 5.3) * 0.03;
    var glow = Math.min(1, 0.3 + combo / 40) + flick;
    var rg = g.createRadialGradient(CW / 2, CH - 20, 5, CW / 2, CH - 20, 150);
    rg.addColorStop(0, 'rgba(255,170,60,' + (0.55 * glow).toFixed(3) + ')'); rg.addColorStop(1, 'rgba(255,120,40,0)');
    g.fillStyle = rg; g.fillRect(0, CH - 190, CW, 190);
    // lanes
    for (var i = 0; i < 4; i++) {
      g.fillStyle = i % 2 ? 'rgba(255,255,255,0.05)' : 'rgba(255,255,255,0.09)'; g.fillRect(i * LANE_W, 0, LANE_W, CH);
      if (flashes[i] > 0) { g.fillStyle = LANE_COL[i]; g.globalAlpha = reduced ? 0.25 : flashes[i] * 0.35; g.fillRect(i * LANE_W, 0, LANE_W, HIT_Y + 20); g.globalAlpha = 1; }
      g.strokeStyle = 'rgba(255,255,255,0.12)'; g.beginPath(); g.moveTo(i * LANE_W + 0.5, 0); g.lineTo(i * LANE_W + 0.5, CH); g.stroke();
    }
    // hit-flash lane glow: a colour-coded column rising from the hit line; steady and short when reduced
    glows.forEach(function (q) {
      var a = reduced ? 0.4 : 0.55 * (1 - q.t / 0.35), gg = g.createLinearGradient(0, HIT_Y, 0, HIT_Y - 170);
      gg.addColorStop(0, q.col); gg.addColorStop(1, 'rgba(255,255,255,0)');
      g.globalAlpha = Math.max(0, a); g.fillStyle = gg; g.fillRect(q.lane * LANE_W, HIT_Y - 170, LANE_W, 175); g.globalAlpha = 1;
    });
    g.fillStyle = 'rgba(255,255,255,0.7)'; g.fillRect(0, HIT_Y - 1, CW, 3);
    g.font = 'bold 16px monospace'; g.textAlign = 'center';
    for (i = 0; i < 4; i++) {
      g.fillStyle = LANE_COL[i]; g.globalAlpha = 0.9; shape(g, i, i * LANE_W + LANE_W / 2, HIT_Y + 30, 14); g.globalAlpha = 1;
      g.fillStyle = '#1a1626'; g.fillText(LANES[i], i * LANE_W + LANE_W / 2, HIT_Y + 36);
    }
    if (run) {
      run.notes.forEach(function (n) {
        if (n.state === 'done' && n.judge === 'miss') { /* fall away dimmed */ }
        var idx = LANES.indexOf(n.lane), x = idx * LANE_W + LANE_W / 2, y = noteY(n.t, now);
        var yTail = n.hold ? noteY(n.t + n.hold, now) : y;
        if (yTail > CH + 20 || y < -20 && yTail < -20) return;
        if (n.state === 'done' && n.judge !== 'miss') return;
        var dim = n.state === 'done';
        g.globalAlpha = dim ? 0.3 : 1;
        if (n.hold) { g.fillStyle = LANE_COL[idx]; g.globalAlpha = (dim ? 0.15 : 0.45); g.fillRect(x - 12, Math.min(yTail, y), 24, Math.abs(y - yTail)); g.globalAlpha = dim ? 0.3 : 1; }
        var yy = n.state === 'holding' ? HIT_Y : y;
        g.fillStyle = LANE_COL[idx]; shape(g, idx, x, yy, 15);
        g.strokeStyle = '#fff'; g.lineWidth = 2; g.beginPath(); g.arc(x, yy, 3, 0, 6.283); g.stroke(); g.lineWidth = 1;
        g.globalAlpha = 1;
      });
      rings.forEach(function (r) { g.strokeStyle = LANE_COL[r.lane]; g.globalAlpha = 1 - r.t / 0.3; g.beginPath(); g.arc(r.lane * LANE_W + LANE_W / 2, HIT_Y, 14 + r.t * 90, 0, 6.283); g.stroke(); g.globalAlpha = 1; });
      g.font = 'bold 14px monospace';
      popups.forEach(function (p) { var y = HIT_Y - 40 - (reduced ? 0 : p.t * 40); g.globalAlpha = reduced ? 1 : 1 - p.t / 0.6; g.fillStyle = '#000'; g.fillText(p.text, p.x + 1, y + 1); g.fillStyle = p.col; g.fillText(p.text, p.x, y);
        if (p.tag) { g.font = 'bold 10px monospace'; g.fillStyle = p.tag === 'early' ? '#9bf6ff' : '#ffadad'; g.fillText(p.tag, p.x, y + 12); g.font = 'bold 14px monospace'; }
        g.globalAlpha = 1; });
    }
    g.restore();
  }

  // ---------- overlays ----------
  function fmtOff(v) { return (v > 0 ? '+' : '') + v + ' ms'; }
  // average of (press - note) over all hits after the current offset: negative = early, positive = late
  function timingText(res) {
    if (!res.hits) return 'Timing: no hits to measure.';
    var a = res.avgDelta;
    var how = Math.abs(a) < 5 ? 'right on time' : Math.abs(a) + ' ms ' + (a < 0 ? 'early' : 'late');
    return 'Timing: you averaged ' + how + ' over ' + res.hits + ' hits (offset ' + fmtOff(SG.offsetOf(save)) + ').';
  }
  function showMenu() {
    mode = 'menu'; run = null; chart = null; paused = false;
    clear(overlay); overlay.hidden = false;
    overlay.appendChild(el('h2', 'Campfire Jam'));
    if (!save.hint) {
      var h = el('div'); h.id = 'hint'; h.setAttribute('role', 'note');
      h.appendChild(el('strong', 'How to play'));
      h.appendChild(el('p', 'Notes fall down four lanes. Press D F J K (or the arrow keys, or tap the lanes) as a note reaches the bright line. Hold the long notes until they end. Perfect, Great and Good score; a miss breaks your combo.'));
      var ok = btn('Got it', function () { save.hint = true; persist(); showMenu(); }); ok.id = 'hint-ok'; h.appendChild(ok);
      overlay.appendChild(h);
    }
    if (!('offsetMs' in save)) {
      var cc = el('div', undefined, 'note'); cc.id = 'cal-card'; cc.setAttribute('role', 'note');
      cc.appendChild(el('strong', 'Check your timing'));
      cc.appendChild(el('p', 'Screens and speakers run a little late. A 10 second tap test lines the notes up with your ears.'));
      var cb = btn('Calibrate now', showCalibration); cb.id = 'cal-first'; cc.appendChild(cb);
      var sk = btn('Skip for now', function () { SG.setOffset(save, 0); persist(); showMenu(); }); sk.id = 'cal-skip'; sk.style.marginLeft = '8px'; cc.appendChild(sk);
      overlay.appendChild(cc);
    }
    overlay.appendChild(el('p', 'Stars: ' + SG.totalStars(save) + ' / ' + (SG.SONGS.length * 3), 'dim'));
    var list = el('div', undefined, 'songs');
    SG.SONGS.forEach(function (s) {
      var open = SG.songUnlocked(save, s.id);
      var card = el('div', undefined, 'card' + (open ? '' : ' locked')); card.dataset.song = s.id;
      card.appendChild(el('strong', open || !s.secret ? s.name + '  (' + s.bpm + ' BPM)' : '???  (secret song)'));
      card.appendChild(el('span', open ? starText(SG.songStars(save, s.id)) : 'Locked', 'cardstars'));
      var b = save.best[s.id];
      var best = open ? (b ? SG.TIERS.filter(function (t) { return b[t]; }).map(function (t) { return SG.TIER_NAMES[t] + ' ' + b[t].score + ' ' + b[t].rank; }).join('  |  ') : s.blurb) : (s.secret ? 'Full-combo any Hard chart to find it' : 'Needs ' + s.needStars + ' stars (you have ' + SG.totalStars(save) + ')');
      card.appendChild(el('small', best));
      var row = el('div', undefined, 'tiers');
      SG.TIERS.forEach(function (t) {
        var ok2 = SG.tierUnlocked(save, s.id, t);
        var tb = btn(SG.TIER_NAMES[t], function () { startSong(s.id, t); }, !ok2);
        tb.dataset.song = s.id; tb.dataset.tier = t;
        row.appendChild(tb);
      });
      card.appendChild(row);
      list.appendChild(card);
    });
    overlay.appendChild(list);
    var off = el('div', undefined, 'row'); off.id = 'offset-row';
    var ov = el('span', undefined, 'dim'); ov.id = 'offset-val'; off.appendChild(ov);
    function showOff() { ov.textContent = 'Timing offset: ' + fmtOff(SG.offsetOf(save)); }
    function nudge(d) { SG.setOffset(save, SG.offsetOf(save) + d); persist(); showOff(); }
    var om = btn('-5 ms', function () { nudge(-5); }); om.id = 'off-minus'; off.appendChild(om);
    var op = btn('+5 ms', function () { nudge(5); }); op.id = 'off-plus'; off.appendChild(op);
    var oc = btn('Calibrate', showCalibration); oc.id = 'btn-calibrate'; off.appendChild(oc);
    showOff(); overlay.appendChild(off);
    var rule = el('p', 'Unlock rule: Warm Embers is always open. Lantern Shuffle opens at 2 total stars, Moth Parade at 5, Starlit Stomp at 8, then Kettle Song at 10, Owl Hour at 13 and Comet Tail at 16. A secret song waits for a full combo on any Hard chart. Hard needs 2 stars on that song’s Normal. Stars come from accuracy: 50%, 75%, 90%.', 'dim'); rule.id = 'unlock-rule';
    overlay.appendChild(rule);
    var row2 = el('div', undefined, 'row'); row2.appendChild(homeLink('menu-back')); overlay.appendChild(row2);
  }
  // ---------- calibration (tap test) ----------
  // 2 count-in clicks + 8 measured clicks. Positive result = you tap late; judging subtracts it.
  var CAL_INT = 700, CAL_LEAD = 1000, CAL_IN = 2, CAL_N = 8;
  var cal = null, calNow = 0;
  function calClock() { return TEST ? calNow : src(); }
  function calBeat(i) { return cal.t0 + CAL_LEAD + i * CAL_INT; }
  function calMeasured() { var b = []; for (var i = CAL_IN; i < CAL_IN + CAL_N; i++) b.push(calBeat(i)); return b; }
  function calPassed() { var n = 0, now = calClock(); for (var i = CAL_IN; i < CAL_IN + CAL_N; i++) if (now >= calBeat(i)) n++; return n; }
  function showCalibration() {
    mode = 'calib'; cal = { state: 'intro', t0: 0, taps: [], result: null, shown: -1 };
    clear(overlay); overlay.hidden = false;
    overlay.appendChild(el('h2', 'Timing check'));
    overlay.appendChild(el('p', 'You will hear (and see) ' + (CAL_IN + CAL_N) + ' clicks. Tap on each click after the first ' + CAL_IN + ': press the big button, or D F J K / Space.'));
    overlay.appendChild(el('p', 'Play it the way you play the game, with the same speakers or headphones.', 'dim'));
    var row = el('div', undefined, 'row');
    var go = btn('Start', calStart); go.id = 'cal-start'; row.appendChild(go);
    var no = btn('Cancel', calCancel); no.id = 'cal-cancel'; row.appendChild(no);
    overlay.appendChild(row);
  }
  function calStart() {
    ensureAudio();
    audioMode = !!(actx && !TEST && actx.state === 'running');
    cal = { state: 'run', t0: TEST ? 0 : src() + (audioMode ? 150 : 0), taps: [], result: null, shown: -1 };
    calNow = 0;
    if (audioMode) { for (var i = 0; i < CAL_IN + CAL_N; i++) { try { osc('square', i < CAL_IN ? 700 : 1100, i < CAL_IN ? 700 : 1100, calBeat(i) / 1000, 0.06, 0.2); } catch (e) { /* ignore */ } } }
    clear(overlay);
    overlay.appendChild(el('h2', 'Tap on each click'));
    var pu = el('p', 'Get ready', 'calpulse'); pu.id = 'cal-pulse'; overlay.appendChild(pu);
    var bt = el('p', 'Beat 0 / ' + CAL_N, 'dim'); bt.id = 'cal-count'; overlay.appendChild(bt);
    var tb = btn('TAP', function () { /* taps come from pointerdown so they are not delayed by click */ }); tb.id = 'cal-tap'; tb.className = 'caltap';
    tb.addEventListener('pointerdown', function (e) { e.preventDefault(); calTap(); });
    overlay.appendChild(tb);
    var row = el('div', undefined, 'row'); var no = btn('Cancel', calCancel); no.id = 'cal-cancel'; row.appendChild(no); overlay.appendChild(row);
  }
  function calTap() {
    if (!cal || cal.state !== 'run') return false;
    cal.taps.push(calClock());
    return true;
  }
  function calTick() {
    if (mode !== 'calib' || !cal || cal.state !== 'run') return;
    var now = calClock(), passed = calPassed();
    var c = $('cal-count'), pu = $('cal-pulse');
    if (passed !== cal.shown && c) { cal.shown = passed; c.textContent = 'Beat ' + passed + ' / ' + CAL_N; }
    if (pu) {
      var near = false; for (var i = 0; i < CAL_IN + CAL_N; i++) { var d = now - calBeat(i); if (d >= 0 && d < 140) near = true; }
      pu.textContent = near ? 'CLICK' : (now < calBeat(0) ? 'Get ready' : '...');
      pu.classList.toggle('on', near && !reduced);
    }
    if (now > calBeat(CAL_IN + CAL_N - 1) + 450) calFinish();
  }
  function calFinish() {
    cal.state = 'done';
    var r = Jam.calibrationFromTaps(cal.taps, calMeasured(), CAL_INT / 2);
    cal.result = r;
    clear(overlay);
    overlay.appendChild(el('h2', 'Timing result'));
    var msg;
    if (!r.ok) msg = 'Only ' + r.used + ' good taps out of ' + CAL_N + '. Try again and tap on every click.';
    else msg = 'Your offset: ' + fmtOff(r.offset) + (Math.abs(r.offset) < 5 ? ' (right on time)' : r.offset > 0 ? ' (you tap late)' : ' (you tap early)') + '. From ' + r.used + ' taps.';
    var rs = el('p', msg); rs.id = 'cal-result'; overlay.appendChild(rs);
    var row = el('div', undefined, 'row');
    if (r.ok) { var ac = btn('Accept', calAccept); ac.id = 'cal-accept'; row.appendChild(ac); }
    var re = btn('Retry', showCalibration); re.id = 'cal-retry'; row.appendChild(re);
    var no = btn('Cancel', calCancel); no.id = 'cal-cancel'; row.appendChild(no);
    overlay.appendChild(row);
  }
  function calAccept() { if (!cal || !cal.result || !cal.result.ok) return; SG.setOffset(save, cal.result.offset); persist(); cal = null; stopAudioForMenu(); showMenu(); }
  function calCancel() { cal = null; stopAudioForMenu(); showMenu(); }
  function calStep(ms) {
    if (!TEST || mode !== 'calib' || !cal || cal.state !== 'run') return;
    var left = ms; while (left > 0 && cal && cal.state === 'run') { var d = Math.min(left, 16); calNow += d; left -= d; calTick(); }
  }

  function showPause() {
    clear(overlay); overlay.hidden = false;
    overlay.appendChild(el('h2', 'Paused'));
    overlay.appendChild(el('p', 'The song waits for you.', 'dim'));
    var row = el('div', undefined, 'row');
    var r = btn('Resume', resume); r.id = 'resume'; row.appendChild(r);
    var q = btn('Quit to songs', quit); q.id = 'quit'; row.appendChild(q);
    overlay.appendChild(row);
  }
  function showResults() {
    var res = lastResult, rep = lastReport, s = SG.song(songId);
    clear(overlay); overlay.hidden = false;
    overlay.appendChild(el('h2', s.name + ' / ' + SG.TIER_NAMES[tier]));
    var rk = el('p', res.rank); rk.id = 'res-rank'; overlay.appendChild(rk);
    var st = el('p', starText(rep.stars), 'stars'); st.id = 'res-stars'; overlay.appendChild(st);
    var best = save.best[songId][tier];
    var sc = el('p', 'Score ' + res.score + (rep.newBest ? '  (new best!)' : '  (best ' + best.score + ')')); sc.id = 'res-score'; overlay.appendChild(sc);
    var acc = el('p', 'Accuracy ' + Math.round(res.accuracy * 100) + '%   Max combo ' + res.maxCombo + (res.counts.miss === 0 ? '   Full combo!' : '')); acc.id = 'res-acc'; overlay.appendChild(acc);
    var cl = el('div'); cl.id = 'res-counts';
    ['perfect', 'great', 'good', 'miss'].forEach(function (j) { var d = el('div', JUDGE_LABEL[j] + ' ' + res.counts[j]); d.dataset.judge = j; cl.appendChild(d); });
    overlay.appendChild(cl);
    var tm = el('p', timingText(res)); tm.id = 'res-timing'; overlay.appendChild(tm);
    var sug = SG.offsetOf(save) + (res.avgDelta || 0);
    if (res.hits >= 8 && Math.abs(res.avgDelta) >= 5 && Math.abs(sug) <= Jam.OFFSET_MAX) {
      var ab = btn('Set offset to ' + fmtOff(sug), function () { SG.setOffset(save, sug); persist(); ab.disabled = true; ab.textContent = 'Offset is ' + fmtOff(SG.offsetOf(save)); }); ab.id = 'apply-suggest'; overlay.appendChild(ab);
    }
    var un = rep.newlyUnlocked.map(function (id) { return SG.song(id).name; });
    if (un.length) { var u = el('p', 'Unlocked: ' + un.join(', ')); u.id = 'res-unlocked'; overlay.appendChild(u); }
    var row = el('div', undefined, 'row');
    var again = btn('Play again', function () { startSong(songId, tier); }); again.id = 'again'; row.appendChild(again);
    var back = btn('Songs', showMenu); back.id = 'to-menu'; row.appendChild(back);
    row.appendChild(homeLink('menu-back'));
    overlay.appendChild(row);
  }

  // ---------- loop ----------
  function frame(ts) {
    pollGamepad();
    if (!TEST) { tick(); calTick(); animate(1 / 60); }
    render(ts / 1000);
    requestAnimationFrame(frame);
  }
  showMenu();
  requestAnimationFrame(frame);

  if (TEST) {
    window.__jam = {
      get mode() { return mode; },
      get now() { return testNow; },
      get run() { return run ? { score: run.state.score, combo: run.state.combo, maxCombo: run.state.maxCombo, counts: Object.assign({}, run.state.counts), holds: Object.keys(run.state.holds) } : null; },
      get chart() { return chart; },
      get save() { return JSON.parse(JSON.stringify(save)); },
      get summary() { return lastResult ? Object.assign({}, lastResult, { stars: lastReport.stars, newBest: lastReport.newBest, newlyUnlocked: lastReport.newlyUnlocked }) : null; },
      get reduced() { return reduced; },
      get shake() { return shake; },
      get rings() { return rings.length; },
      get paused() { return paused; },
      get lastJudge() { return lastJudge; },
      get offset() { return SG.offsetOf(save); },
      get glows() { return glows.length; },
      get timing() { return lastTiming; },
      get cal() { return cal ? { state: cal.state, taps: cal.taps.length, now: calNow, beats: cal.state === 'run' || cal.state === 'done' ? calMeasured() : [], result: cal.result } : null; },
      calStep: calStep, calTap: calTap,
      get sfx() { return sfx; },
      get audio() { return !!actx; },
      start: startSong, step: step, press: press, release: release, pause: pause, resume: resume, menu: showMenu,
      at: function (ms) { if (ms > testNow) step(ms - testNow); }
    };
  }
})();
