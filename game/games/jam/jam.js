// Campfire Jam page: canvas lanes, input, WebAudio synth, menu/results. Rules live in shared/mm-jam.js + mm-jam-songs.js.
(function () {
  'use strict';
  var Jam = window.MMJam, SG = window.MMJamSongs, R = window.MMRng, S = window.MMStore;
  var KEY = 'pixeltown-jam-v1';
  var qs = new URLSearchParams(location.search);
  var TEST = qs.get('test') === '1';
  var FROM_HUB = qs.get('from') === 'hub'; // exact match only
  // cyc2 U: touch players get touch wording (no "Keys D F J K"), like Angler and the Realm; keyboard players keep the keys
  var COARSE = (function () { try { return window.matchMedia('(pointer: coarse)').matches; } catch (e) { return false; } })();
  var TOUCH_HELP = 'Tap the four pads below as each note reaches the bright line. Hold long notes. The Menu button pauses the song.';
  (function () { var hp = document.getElementById('help'); if (COARSE && hp) hp.textContent = TOUCH_HELP; })();
  var LANES = Jam.LANES;
  var CW = 320, CH = 420, LANE_W = CW / 4, HIT_Y = 340, APPROACH_MS = 1400;
  var BASE_COL = ['#ef476f', '#ffd166', '#06d6a0', '#4cc9f0'];
  var CB_COL = ['#0072b2', '#e69f00', '#f0e442', '#cc79a7']; // colour-blind safe set (Okabe-Ito based)
  var LANE_COL = BASE_COL.slice();
  var GLYPH = ['\u25CF', '\u25C6', '\u25A0', '\u25B2']; // circle, diamond, square, triangle: same silhouettes as the notes
  var GLYPH_NAME = ['circle', 'diamond', 'square', 'triangle'];
  var prefShapes = false, prefLefty = false, prefLaneShapes = false, prefTapHolds = false, prefRelax = false;
  // shared access prefs (pixeltown-access-v1): a colour-blind palette there turns lane shapes on unless the player turned them off here
  function accessPalette() { try { return window.MMAccess && window.MMAccess.prefs ? window.MMAccess.prefs.load(window.localStorage).palette : 'normal'; } catch (e) { return 'normal'; } }
  function laneShapesOn() { return SG.prefOf(save, 'laneShapes') || (accessPalette() !== 'normal' && !SG.prefOf(save, 'laneShapesOff')); }
  function setLaneShapes(on) { SG.setPref(save, 'laneShapes', on && accessPalette() === 'normal'); SG.setPref(save, 'laneShapesOff', !on && accessPalette() !== 'normal'); return laneShapesOn(); }
  // lane <-> screen column. Left-handed order mirrors the lanes; the key under each column keeps its position. Involution.
  function laneAt(c) { return prefLefty ? 3 - c : c; }
  function colOf(idx) { return prefLefty ? 3 - idx : idx; }
  function L(lane) { var i = LANES.indexOf(lane); return i < 0 ? lane : LANES[laneAt(i)]; }
  var JUDGE_LABEL = { perfect: 'Perfect', great: 'Great', good: 'Good', miss: 'Miss' };
  var JUDGE_COL = { perfect: '#fff3b0', great: '#9bf6ff', good: '#caffbf', miss: '#ff6b6b' };
  var KEYMAP = { KeyD: 'D', KeyF: 'F', KeyJ: 'J', KeyK: 'K', ArrowLeft: 'D', ArrowDown: 'F', ArrowUp: 'J', ArrowRight: 'K' };

  // ---------- reduced motion ----------
  var reduced = false;
  function syncReduced() { try { reduced = (window.MMMotion ? window.MMMotion.reduced(window, window.localStorage) : false) || !!(window.MMSideAccess && window.MMSideAccess.reduced()); } catch (e) { reduced = false; } }
  syncReduced();
  var mq = window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)') : null;
  if (mq && mq.addEventListener) mq.addEventListener('change', syncReduced);

  // ---------- save (only pixeltown-jam-v1) ----------
  var save = SG.cleanSave(S.get(KEY, null));
  // ---------- JM5 Assist (one thumb) + section-practice bests: own key, never touches pixeltown-jam-v1 bests/stars ----------
  var AKEY = 'pixeltown-jam-assist-v1', ASSIST_GAP = 180, AMAX = 10000000;
  var RANKS_OK = ['S', 'A', 'B', 'C', 'D'];
  function cleanAssist(raw) {
    var o = { on: false, best: {}, section: {} };
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return o;
    o.on = raw.on === true;
    var b = raw.best && typeof raw.best === 'object' && !Array.isArray(raw.best) ? raw.best : {};
    SG.SONGS.forEach(function (sg) {
      var e = Object.prototype.hasOwnProperty.call(b, sg.id) && b[sg.id] && typeof b[sg.id] === 'object' ? b[sg.id] : null; if (!e) return;
      SG.TIERS.forEach(function (t) {
        var x = Object.prototype.hasOwnProperty.call(e, t) ? e[t] : null;
        if (x && typeof x === 'object' && Number.isFinite(x.score) && x.score > 0) { (o.best[sg.id] = o.best[sg.id] || {})[t] = { score: Math.min(AMAX, Math.floor(x.score)), rank: RANKS_OK.indexOf(x.rank) >= 0 ? x.rank : 'D' }; }
      });
    });
    var sc = raw.section && typeof raw.section === 'object' && !Array.isArray(raw.section) ? raw.section : {};
    Object.keys(sc).slice(0, 200).forEach(function (k) { if (/^[a-z0-9-]{1,40}:(easy|normal|hard):(50|75|100):\d{1,3}-\d{1,3}$/.test(k) && Number.isFinite(sc[k]) && sc[k] > 0) o.section[k] = Math.min(5000, Math.floor(sc[k])); });
    return o;
  }
  var assist = cleanAssist(S.get(AKEY, null)), assistRun = false, assistLast = null;
  // Merge-on-write (bugbash/saves.md S2): a stale second tab keeps every assist / section best another tab saved, and only writes
  // the On/Off toggle when this tab changed it. Fields a newer build stored stay stored. Without MMSaveMerge: the old plain write.
  var assistBase = JSON.parse(JSON.stringify(assist));
  function persistAssist() {
    var M = window.MMSaveMerge;
    if (!M) { S.set(AKEY, { on: assist.on, best: assist.best, section: assist.section }); return; }
    var mine = { best: assist.best, section: assist.section };
    if (assist.on !== assistBase.on) mine.on = assist.on;
    var m = M.merge(S.get(AKEY, null), assistBase, mine, M.SPECS[AKEY]);
    if (typeof m.on !== 'boolean') m.on = assist.on;
    S.set(AKEY, m);
    assist = cleanAssist(m); assistBase = JSON.parse(JSON.stringify(assist));
  }
  // Outer lanes fold onto the nearest inner lane (D->F, K->J); notes then thinned to >= 180 ms apart per lane.
  function assistChart(c) {
    var map = { D: 'F', F: 'F', J: 'J', K: 'J' }, last = {};
    var notes = c.notes.map(function (n) { return Object.assign({}, n, { lane: map[n.lane] || n.lane }); }).sort(function (a, b) { return a.t - b.t; })
      .filter(function (n) { var end = last[n.lane]; if (end !== undefined && n.t < end + ASSIST_GAP) return false; last[n.lane] = n.t + (n.hold || 0); return true; });
    return Object.assign({}, c, { notes: notes, assist: true });
  }
  function persist() { S.set(KEY, save); try { var st = SG.totalStars(save); window.MMHubProfile.sync(localStorage, 'jam', [save.plays >= 1 && 'play', st >= 1 && 'star1', st >= 12 && 'stars12', save.fullCombo === true && 'fullcombo', SG.SONGS.some(function (s) { var b = save.best[s.id]; return !!(b && b.hard && b.hard.stars >= 3); }) && 'hard3']); } catch (e) { /* hub map progress is optional */ } }
  persist();
  function applyPrefs() {
    prefShapes = SG.prefOf(save, 'shapes'); prefLefty = SG.prefOf(save, 'lefty');
    prefLaneShapes = laneShapesOn(); prefTapHolds = SG.prefOf(save, 'tapHolds'); prefRelax = SG.prefOf(save, 'relax');
    document.body.dataset.laneShapes = prefLaneShapes ? '1' : '0';
    LANE_COL = (prefShapes ? CB_COL : BASE_COL).slice();
    document.body.dataset.shapes = prefShapes ? '1' : '0'; document.body.dataset.lefty = prefLefty ? '1' : '0';
    LANES.forEach(function (key, c) {
      var b = document.getElementById('pad-' + key); if (!b) return;
      var li = laneAt(c);
      b.style.background = LANE_COL[li]; b.style.color = prefShapes ? '#0b0814' : '';
      b.textContent = prefShapes || prefLaneShapes ? GLYPH[li] + ' ' + key : key;
      b.setAttribute('aria-label', 'Lane ' + key + (prefShapes || prefLaneShapes ? ' (' + GLYPH_NAME[li] + ')' : ''));
    });
  }

  // ---------- state ----------
  var cv = document.getElementById('game'), ctx = cv.getContext('2d');
  var overlay = document.getElementById('overlay');
  var mode = 'menu'; // menu | play | pause | results | interlude | calib
  var relax = false; // the current run is a Relax run: no fail, no score, nothing counts toward stars
  var relaxLast = null;
  var practice = null; // { speed, loop:{a,b}|null, loopBars, loops } while practising (no scoring, nothing saved)
  var practiceCfg = { tier: 'normal', speed: 1, loop: false, a: 1, b: 4 }, practiceLast = null;
  var ghost = null; // best-run press offsets (ms per note, chart order) drawn as faint markers while playing
  var concert = null; // { ids, tier, idx, parts[] } while a concert is running
  var songId = null, tier = null, chart = null, run = null, lastReport = null, lastResult = null;
  var paused = false, popups = [], flashes = [0, 0, 0, 0], rings = [], glows = [], shake = 0, lastJudge = null, lastTiming = null;
  var held = {}, laneKeys = {}, ptrLane = {};
  var testNow = 0, concertLast = null, resultsData = null;
  // ---------- juice: combo milestones, combo-break notice, hit sparks (fewer/none with reduced motion or low graphics) ----------
  var MILESTONES = [10, 25, 50, 75, 100];
  var sparks = [], banner = null, comboPop = 0, milestonesHit = [], fxRng = R.create('jam-fx'), lastPrevBest = null;
  function lowGfx() { try { return !!(window.MMAccess && window.MMAccess.prefs.load(window.localStorage).lowGfx); } catch (e) { return false; } }
  function isMilestone(c) { return MILESTONES.indexOf(c) >= 0 || (c > 100 && c % 50 === 0); }
  var sfxLog = [];
  function sfxPlay(name) { sfxLog.push(name); if (sfxLog.length > 40) sfxLog.shift(); if (TEST || !sfx) return; try { sfx.play(name); } catch (e) { /* ignore */ } }
  function showBanner(text, col) { banner = { text: text, col: col, t: 0 }; }
  function afterHit(j, idx, prevCombo) {
    if (relax || !run) return;
    var c = run.state.combo;
    if (j && j !== 'miss') {
      comboPop = 1;
      if (isMilestone(c)) { milestonesHit.push(c); showBanner(c + ' combo!', '#ffd166'); sfxPlay('combo' + Math.max(1, Math.min(8, Math.ceil(c / 15)))); }
      if (!reduced && !lowGfx() && (j === 'perfect' || j === 'great')) {
        var n = j === 'perfect' ? 6 : 3, x = colOf(idx) * LANE_W + LANE_W / 2;
        for (var i = 0; i < n; i++) sparks.push({ x: x + fxRng.int(-12, 12), y: HIT_Y, vx: (fxRng.next() - 0.5) * 120, vy: -60 - fxRng.next() * 140, t: 0, col: j === 'perfect' ? '#fff3b0' : LANE_COL[idx] });
        if (sparks.length > 48) sparks.splice(0, sparks.length - 48);
      }
    }
    if (prevCombo >= 10 && c === 0) showBanner('Combo ended at ' + prevCombo, '#ffadad');
  }
  var stars = [];
  (function () { var g = R.create('jam-stars'); for (var i = 0; i < 30; i++) stars.push({ x: g.int(0, CW), y: g.int(0, HIT_Y - 40), p: g.next() * 6.28 }); })();

  // ---------- clock: AudioContext time when running, else performance.now; test mode uses a manual clock ----------
  var actx = null, master = null, audioMode = false, t0 = 0, pauseSrc = 0, pausedTotal = 0, evIdx = 0, events = null, noiseBuf = null;
  function src() { return audioMode ? actx.currentTime * 1000 : performance.now(); }
  var frozenAt = 0;
  function songNow() {
    if (TEST) return testNow;
    if (paused || mode !== 'play') return frozenAt;
    return (src() - t0 - pausedTotal) * (practice ? practice.speed : 1);
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
    var sp = practice ? practice.speed : 1, horizon = songNow() + 1500 * sp;
    if (practice && practice.loop) horizon = Math.min(horizon, practice.loop.b);
    while (evIdx < events.length && events[evIdx].t <= horizon) {
      var e = events[evIdx++];
      voice(e.kind, (t0 + pausedTotal) / 1000 + e.t / (1000 * sp), e.hz);
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
    // G-18 (b10-09): the tier lock is enforced here, not only by the disabled button (any entry point: Quick play, Concert, a query, a test
    // hook). A locked Hard falls back to nothing: no run starts. Concert and practice pick their own (already unlocked) tiers.
    // Round 3 (b09/b10): a locked SONG is refused too (Lantern Shuffle Hard on a fresh save used to slip through because the old check only
    // looked at the tier of an already open song). Warm Embers is always open, so a fresh player can still start it.
    if (SG.songUnlocked && !SG.songUnlocked(save, id)) return null;
    if (SG.TIERS.indexOf(tr) >= 0 && SG.tierUnlocked && !SG.tierUnlocked(save, id, tr)) return null;
    ensureAudio(); hudShown(true);
    songId = id; tier = SG.TIERS.indexOf(tr) >= 0 ? tr : 'normal';
    chart = opts.chart || SG.chartFor(id, tier, opts.seed !== undefined ? opts.seed : qs.get('seed') || undefined);
    practice = opts.practice ? makePractice(id, opts.practice) : null;
    relax = !practice && opts.relax === true;
    assistRun = !relax && !concert && (opts.assist !== undefined ? opts.assist === true : assist.on);
    if (assistRun) chart = assistChart(chart);
    document.body.dataset.assist = assistRun ? '1' : '0';
    if (relax) concert = null;
    document.body.dataset.relax = relax ? '1' : '0';
    ghost = null;
    if (!practice && !relax && !assistRun && (opts.ghost === true || (opts.ghost !== false && SG.prefOf(save, 'ghost')))) {
      var gd = SG.ghostOf(save, id, tier);
      if (gd && chart.song === id && chart.seed === 'base' && gd.length === chart.notes.length) ghost = gd; // only for the exact same base chart
    }
    if (practice) concert = null;
    document.body.dataset.practice = practice ? '1' : '0';
    run = makeRun();
    popups = []; rings = []; glows = []; lastTiming = null; flashes = [0, 0, 0, 0]; shake = 0; held = {}; laneKeys = {}; ptrLane = {};
    lastJudge = null; sparks = []; banner = null; comboPop = 0; milestonesHit = [];
    $('hud-timing').textContent = '';
    paused = false; pausedTotal = 0; testNow = 0; frozenAt = 0; evIdx = 0;
    events = SG.backing(id, tier);
    audioMode = !!(actx && !TEST && actx.state === 'running');
    t0 = src() + (audioMode ? 150 : 0);
    var startAt = practice && practice.loop ? loopStart() : 0;
    if (startAt) { pausedTotal = -startAt / practice.speed; testNow = startAt; frozenAt = startAt; }
    evIdx = firstEvent(startAt);
    mode = 'play'; overlay.hidden = true; sfxPlay('select');
    $('hud-speed').textContent = practice ? 'Speed ' + Math.round(practice.speed * 100) + '%' : '';
    $('hud-song').textContent = (practice ? 'Practice: ' : '') + (assistRun ? 'Assist: ' : '') + (relax ? 'Relax: ' : '') + (concert ? 'Concert ' + (concert.idx + 1) + '/' + concert.ids.length + ': ' : '') + SG.song(id).name + ' / ' + SG.TIER_NAMES[tier];
    updateHud();
    return run;
  }
  function finish() {
    if (mode !== 'play') return;
    if (practice) { finishPractice(); return; }
    if (relax) { finishRelax(); return; }
    if (assistRun && !practice) { finishAssist(); return; }
    releaseAll();
    run.update();
    var res = run.result();
    res.deltas = chart.song === songId && chart.seed === 'base' ? run.deltas() : null;
    var pb = save.best[songId] && save.best[songId][tier];
    lastPrevBest = pb ? pb.score : null;
    lastResult = res;
    lastReport = SG.record(save, songId, tier, res);
    persist();
    sfxPlay(res.fullCombo ? 'perfect' : (res.rank === 'S' || res.rank === 'A') ? 'level_up' : 'confirm');
    frozenAt = songNow(); mode = 'results';
    if (concert) { concertAfterSong(res); return; }
    showResults();
  }
  // ---------- practice: slower song, A-B bar loop, no scoring ----------
  var PRACTICE_SPEEDS = [0.5, 0.75, 1];
  function maxBar(id) { return Math.max(1, SG.song(id).bars - 2); }
  function makePractice(id, o) {
    var sp = PRACTICE_SPEEDS.indexOf(Number(o.speed)) >= 0 ? Number(o.speed) : 1;
    var pr = { speed: sp, loop: null, loopBars: null, loops: 0 };
    if (Array.isArray(o.loop) && o.loop.length === 2) {
      var mb = maxBar(id), bm = SG.beatMs(SG.song(id));
      var a = Math.max(1, Math.min(mb, Math.floor(Number(o.loop[0])) || 1)), b = Math.max(1, Math.min(mb, Math.floor(Number(o.loop[1])) || a));
      if (b < a) b = a;
      pr.loopBars = [a, b];
      pr.loop = { a: Math.round((SG.LEAD_BEATS + (a - 1) * 4) * bm), b: Math.round((SG.LEAD_BEATS + b * 4) * bm) };
    }
    return pr;
  }
  function loopStart() { return Math.max(0, practice.loop.a - Math.round(2 * SG.beatMs(SG.song(songId)))); }
  function makeRun() {
    var c = chart, sp = practice ? practice.speed : 1;
    if (practice && practice.loop) {
      var lp = practice.loop;
      c = Object.assign({}, chart, { notes: chart.notes.filter(function (n) { return n.t >= lp.a - 1 && n.t < lp.b; }) });
      c.count = c.notes.length;
    }
    return Jam.createRun(c, { clock: songNow, offset: SG.offsetOf(save) * sp }); // offset shifts judging only, never the clock
  }
  function firstEvent(t) { if (!events) return 0; var i = 0; while (i < events.length && events[i].t < t) i++; return i; }
  // Section practice best (hits in one pass of the A-B loop), kept in the Assist key: never a song best.
  function sectionKey() { return practice && practice.loopBars && !assistRun ? songId + ':' + tier + ':' + Math.round(practice.speed * 100) + ':' + practice.loopBars[0] + '-' + practice.loopBars[1] : null; }
  function recordSection(hits) {
    var k = sectionKey(); if (!k) return { key: null, best: null, isNew: false };
    var prev = assist.section[k] || 0;
    if (hits > prev) { assist.section[k] = hits; persistAssist(); }
    return { key: k, best: Math.max(prev, hits), isNew: hits > prev };
  }
  function loopBack() {
    releaseAll();
    try { run.update(); recordSection(run.result().hits); } catch (e) { /* ignore */ }
    var at = loopStart();
    run = makeRun(); practice.loops++;
    popups = []; rings = []; glows = []; held = {}; laneKeys = {}; ptrLane = {}; lastJudge = null;
    testNow = at; frozenAt = at; pausedTotal = (src() - t0) - at / practice.speed;
    evIdx = firstEvent(at);
    updateHud();
  }
  function finishAssist() {
    releaseAll(); run.update();
    var res = run.result();
    var prev = assist.best[songId] && assist.best[songId][tier], nb = res.score > 0 && (!prev || res.score > prev.score);
    if (nb) { (assist.best[songId] = assist.best[songId] || {})[tier] = { score: res.score, rank: res.rank }; persistAssist(); }
    assistLast = { score: res.score, rank: res.rank, hits: res.hits, notes: chart.notes.length, newBest: nb, best: assist.best[songId] && assist.best[songId][tier] ? assist.best[songId][tier].score : 0 };
    frozenAt = songNow(); mode = 'results';
    var sid = songId, tr = tier;
    clear(overlay); overlay.hidden = false;
    overlay.appendChild(el('h2', 'Assist: ' + SG.song(sid).name + ' / ' + SG.TIER_NAMES[tr]));
    var n = el('p', 'Assist (one thumb, 2 lanes). Assist runs never count toward stars, S-rank or unlocks; their bests are kept apart.'); n.id = 'assist-note'; overlay.appendChild(n);
    var sc = el('p', 'Score ' + res.score + '  Rank ' + res.rank + '  (' + res.hits + ' / ' + chart.notes.length + ' notes)'); sc.id = 'assist-score'; overlay.appendChild(sc);
    var bb = el('p', 'Assist best ' + assistLast.best + (assistLast.newBest ? ' (new)' : ''), 'dim'); bb.id = 'assist-best'; overlay.appendChild(bb);
    var row = el('div', undefined, 'row');
    var again = btn('Play again (Assist)', function () { startSong(sid, tr, { assist: true }); }); again.id = 'again'; row.appendChild(again);
    var back = btn('Songs', showMenu); back.id = 'to-menu'; row.appendChild(back);
    row.appendChild(homeLink('menu-back'));
    overlay.appendChild(row);
    try { again.focus(); } catch (e) { /* ignore */ }
  }
  function finishPractice() {
    releaseAll(); run.update();
    var res = run.result();
    var sr = recordSection(res.hits);
    practiceLast = { hits: res.hits, counts: res.counts, speed: practice.speed, loops: practice.loops, saved: false, sectionKey: sr.key, sectionBest: sr.best, sectionNew: sr.isNew };
    frozenAt = songNow(); mode = 'results';
    showPracticeDone(res);
  }
  // ---------- relax: same chart, no fail, no score; only its own medal-free tracking is saved ----------
  function finishRelax() {
    releaseAll(); run.update();
    var res = run.result(), rep = SG.recordRelax(save, songId, res);
    persist();
    relaxLast = { hits: res.hits, notes: chart.notes.length, practiceStars: rep.practiceStars, plays: rep.plays };
    frozenAt = songNow(); mode = 'results';
    showRelaxDone();
  }
  function showRelaxDone() {
    var s = SG.song(songId), sid = songId, tr = tier;
    clear(overlay); overlay.hidden = false;
    overlay.appendChild(el('h2', 'Relax: ' + s.name));
    var n = el('p', 'Relax mode: no score and no fail. Practice stars are just for you and do not count toward stars or unlocks.'); n.id = 'relax-note'; overlay.appendChild(n);
    var ps = el('p', 'Practice stars ' + starText(relaxLast.practiceStars), 'stars practice'); ps.id = 'relax-stars'; overlay.appendChild(ps);
    var pl = el('p', 'You played along with ' + relaxLast.hits + ' of ' + relaxLast.notes + ' notes.', 'dim'); pl.id = 'relax-played'; overlay.appendChild(pl);
    var tm = el('p', 'Relax plays of this song: ' + relaxLast.plays + '.', 'dim'); tm.id = 'relax-count'; overlay.appendChild(tm);
    var row = el('div', undefined, 'row');
    var again = btn('Play again (Relax)', function () { startSong(sid, tr, { relax: true }); }); again.id = 'again'; row.appendChild(again);
    var back = btn('Songs', showMenu); back.id = 'to-menu'; row.appendChild(back);
    row.appendChild(homeLink('menu-back'));
    overlay.appendChild(row);
  }
  function releaseAll() { Object.keys(held).forEach(function (l) { if (held[l]) { run.release(l); held[l] = false; } }); }
  function quit() { if (run) { releaseAll(); } concert = null; practice = null; relax = false; document.body.dataset.relax = '0'; paused = false; stopAudioForMenu(); showMenu(); }
  // drop the context so already-scheduled backing notes cannot ring on after quitting
  function stopAudioForMenu() { audioMode = false; events = null; if (actx) { try { actx.close(); } catch (e) { /* ignore */ } actx = null; master = null; noiseBuf = null; } }

  // quiet = paused by the Menu sheet (review 3 #6): the Paused card waits until the sheet closes, because the page closes the sheet
  // whenever #overlay shows, which used to eat the first Menu tap. On close the song stays paused with a clear Resume.
  var navPaused = false;
  function pause(quiet) {
    if (mode !== 'play' || paused) return;
    frozenAt = songNow(); paused = true; mode = 'pause';
    if (!TEST) { if (audioMode) { try { actx.suspend(); } catch (e) { /* ignore */ } } else pauseSrc = performance.now(); }
    sfxPlay('ui_open');
    if (quiet === true) { navPaused = true; return; }
    showPause();
  }
  function resume() {
    navPaused = false;
    if (mode !== 'pause') return;
    if (!TEST) { if (audioMode) { try { actx.resume(); } catch (e) { /* ignore */ } } else pausedTotal += performance.now() - pauseSrc; }
    paused = false; mode = 'play'; overlay.hidden = true; sfxPlay('ui_close');
  }

  // ---------- input ----------
  function press(lane) {
    if (mode !== 'play' || !run) return null;
    if (assistRun) lane = lane === 'D' ? 'F' : lane === 'K' ? 'J' : lane; // either half of the board hits its inner lane
    var idx = LANES.indexOf(lane); if (idx < 0) return null;
    flashes[idx] = 1;
    var prevCombo = run.state.combo;
    var j = run.press(lane);
    afterHit(j, idx, prevCombo);
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
    if (assistRun) lane = lane === 'D' ? 'F' : lane === 'K' ? 'J' : lane;
    if (prefTapHolds && run.state.holds[lane]) { held[lane] = false; return 'tap-hold'; } // tap only: the long note finishes by itself
    var prevCombo = run.state.combo;
    var r = run.release(lane); held[lane] = false;
    if (r === 'broken') afterHit(null, LANES.indexOf(lane), prevCombo);
    if (r === 'broken' && !relax) popup('miss', LANES.indexOf(lane));
    updateHud();
    return r;
  }
  // early/late tag: negative delta = early. Within 8 ms counts as on time (no tag).
  function timingTag(d) { if (typeof d !== 'number' || Math.abs(d) < 8) return ''; return d < 0 ? 'early' : 'late'; }
  function popup(j, idx, delta) {
    var tag = j === 'miss' ? '' : timingTag(delta);
    popups.push({ text: JUDGE_LABEL[j], tag: tag, col: JUDGE_COL[j], x: colOf(idx) * LANE_W + LANE_W / 2, t: 0 }); if (popups.length > 8) popups.shift();
    lastTiming = tag ? tag + ' ' + Math.abs(delta) + ' ms' : (j === 'miss' ? null : 'on time');
    var h = $('hud-timing'); if (h) h.textContent = lastTiming ? JUDGE_LABEL[j] + ' ' + lastTiming : JUDGE_LABEL[j];
  }
  function pressSource(key, lane) { if (!laneKeys[key]) { laneKeys[key] = lane; press(lane); pad(lane, true); } }
  function releaseSource(key) { var l = laneKeys[key]; if (l) { delete laneKeys[key]; var still = Object.keys(laneKeys).some(function (k) { return laneKeys[k] === l; }); if (!still) release(l); pad(l, still); } }
  function pad(lane, on) { var b = $('pad-' + L(lane)); if (b) b.classList.toggle('on', !!on); }

  window.addEventListener('keydown', function (e) {
    if (mode !== 'play') ensureAudio();
    if (mode === 'calib') {
      if (e.code === 'Escape') { calCancel(); return; }
      if (cal && cal.state === 'run' && (e.code === 'Space' || KEYMAP[e.code])) { e.preventDefault(); if (!e.repeat) calTap(); }
      return;
    }
    if (e.code === 'Escape' || e.code === 'KeyP') { if (mode === 'play') pause(); else if (mode === 'pause') resume(); return; }
    if (e.code === 'KeyR' && mode === 'results' && !e.repeat) { var ag = $('again'); if (ag && !overlay.hidden) { e.preventDefault(); ag.click(); } return; }
    // universal controls (MMInput): R restarts from Paused, Space/Enter is Primary when no button has focus
    var act = window.MMInput ? window.MMInput.actionOf(e) : null;
    if (act === 'restart' && mode === 'pause' && !e.repeat) { var rsb = $('restart'); if (rsb) { e.preventDefault(); rsb.click(); } return; }
    if (act === 'primary' && !e.repeat && (!document.activeElement || document.activeElement === document.body) && !overlay.hidden) {
      var pb = mode === 'menu' ? $('quick-play') : mode === 'pause' ? $('resume') : mode === 'results' ? $('again') : null;
      if (pb) { e.preventDefault(); pb.click(); return; }
    }
    var lane = KEYMAP[e.code];
    if (!lane) return;
    lane = L(lane);
    if (mode === 'play') e.preventDefault();
    if (e.repeat) return;
    pressSource('k:' + e.code, lane);
  });
  window.addEventListener('keyup', function (e) { if (KEYMAP[e.code]) releaseSource('k:' + e.code); });
  window.addEventListener('blur', function () { Object.keys(laneKeys).forEach(releaseSource); if (mode === 'play' && !TEST) pause(); });
  document.addEventListener('visibilitychange', function () { if (document.hidden && mode === 'play') pause(); });
  if (window.MMNav && MMNav.onOpen) MMNav.onOpen(function () { if (mode === 'play' && !TEST) pause(true); }); // the Menu sheet pauses the song (sheet stays open)
  if (window.MMNav && MMNav.onClose) MMNav.onClose(function () { // closing the sheet (Esc, backdrop, Menu) leaves the song paused with Resume focused
    if (!navPaused) return; navPaused = false;
    if (mode === 'pause') { showPause(); var r = $('resume'); if (r) r.focus(); }
  });
  window.addEventListener('pointerdown', ensureAudio, { passive: true });

  function bindPointer(node, laneOf) {
    node.addEventListener('pointerdown', function (e) {
      e.preventDefault();
      var lane = laneOf(e); if (!lane) return;
      try { node.setPointerCapture(e.pointerId); } catch (x) { /* ignore */ }
      ptrLane[e.pointerId] = lane; pressSource('p:' + e.pointerId, lane);
    });
    function up(e) { if (ptrLane[e.pointerId]) { var l = ptrLane[e.pointerId]; delete ptrLane[e.pointerId]; releaseSource('p:' + e.pointerId); pad(l, false); } }
    node.addEventListener('pointerup', up); node.addEventListener('pointercancel', up);
  }
  bindPointer(cv, function (e) { var r = cv.getBoundingClientRect(); return LANES[laneAt(Math.max(0, Math.min(3, Math.floor((e.clientX - r.left) / r.width * 4))))]; });
  LANES.forEach(function (l) { bindPointer($('pad-' + l), function () { return L(l); }); });
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
        if (on && !padPrev[k]) pressSource(k, LANES[laneAt(li)]);
        if (!on && padPrev[k]) releaseSource(k);
        padPrev[k] = on;
      }
    }
  }

  // ---------- step / update ----------
  function tick() {
    if (mode !== 'play' || !run) return;
    var prevCombo = run.state.combo;
    run.update();
    if (prevCombo && !run.state.combo) afterHit(null, 0, prevCombo);
    var fresh = false;
    for (var ni = 0; ni < run.notes.length; ni++) { var n = run.notes[ni]; if (n.judge === 'miss' && !n.shown) { n.shown = true; fresh = true; if (!relax) popup('miss', LANES.indexOf(n.lane)); } }
    if (fresh && !relax) { if (!reduced) shake = 0.08; lastJudge = 'miss'; }
    pumpBacking();
    if (practice && practice.loop && songNow() >= practice.loop.b) { loopBack(); return; }
    if (songNow() >= chart.lengthMs) finish();
    updateHud();
  }
  // test hook: advance the manual clock in small slices so update() sees every miss
  function step(ms) {
    if (!TEST || mode !== 'play') return;
    var left = ms;
    var sp = practice ? practice.speed : 1;
    while (left > 0 && mode === 'play') { var d = Math.min(left, 16); testNow += d * sp; left -= d; tick(); animate(d / 1000); }
  }
  function animate(dt) {
    for (var i = 0; i < 4; i++) flashes[i] = Math.max(0, flashes[i] - dt * 5);
    popups.forEach(function (p) { p.t += dt; }); popups = popups.filter(function (p) { return p.t < 0.6; });
    rings.forEach(function (r) { r.t += dt; }); rings = rings.filter(function (r) { return r.t < 0.3; });
    var gl = reduced ? 0.2 : 0.35; glows.forEach(function (q) { q.t += dt; }); glows = glows.filter(function (q) { return q.t < gl; });
    shake = Math.max(0, shake - dt);
    sparks.forEach(function (p) { p.t += dt; p.x += p.vx * dt; p.y += p.vy * dt; p.vy += 260 * dt; }); sparks = sparks.filter(function (p) { return p.t < 0.5; });
    if (banner) { banner.t += dt; if (banner.t > 1.1) banner = null; }
    comboPop = Math.max(0, comboPop - dt * 6);
  }
  function updateHud() {
    if (practice && run) { $('hud-score').textContent = ''; $('hud-acc').textContent = ''; $('hud-combo').textContent = 'Combo ' + run.state.combo; $('progress-bar').style.width = Math.max(0, Math.min(100, songNow() / chart.lengthMs * 100)).toFixed(1) + '%'; return; }
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
  // 8-bit pass: every note is a chunky pixel sprite (3 px cells), with a dark 1-cell outline and a light top-left bevel
  var PXC = 3;
  function inShape(idx, dx, dy, r) {
    if (idx === 0) return dx * dx + dy * dy <= r * r;
    if (idx === 1) return Math.abs(dx) + Math.abs(dy) <= r;
    if (idx === 2) return Math.abs(dx) <= r * 0.85 && Math.abs(dy) <= r * 0.85;
    return dy <= r * 0.8 && dy >= -r && Math.abs(dx) <= (dy + r) / 1.8 * 1.0 + 0.5;
  }
  function pxBlit(g, idx, x, y, r, col, outline) {
    var c = PXC, n = Math.ceil((r + c) / c), x0 = Math.round(x), y0 = Math.round(y), keep = g.fillStyle;
    for (var j = -n; j <= n; j++) for (var i = -n; i <= n; i++) {
      var dx = i * c + c / 2 - c / 2, dy = j * c;
      if (!inShape(idx, dx, dy, r)) {
        if (outline && inShape(idx, dx, dy, r + c)) { g.fillStyle = outline; g.fillRect(x0 + i * c - 1, y0 + j * c - 1, c, c); }
        continue;
      }
      g.fillStyle = col; g.fillRect(x0 + i * c - 1, y0 + j * c - 1, c, c);
    }
    g.fillStyle = keep;
  }
  function shape(g, idx, x, y, r) {
    var col = g.fillStyle, a = g.globalAlpha;
    pxBlit(g, idx, x, y, r, col, r >= 8 ? '#0b0814' : null);
    if (r >= 8) { g.globalAlpha = a * 0.35; pxBlit(g, idx, x, y, r, '#ffffff', null); g.globalAlpha = a; pxBlit(g, idx, x, y + PXC, r - PXC, col, null); }
    g.fillStyle = col;
  }
  // stepped colour bands instead of smooth gradients (no banding blur, reads as 8-bit)
  function bands(g, x, y, w, h, cols) {
    var bh = Math.ceil(h / cols.length);
    for (var i = 0; i < cols.length; i++) { g.fillStyle = cols[i]; g.fillRect(x, y + i * bh, w, bh); }
  }
  function render(time) {
    var g = ctx; g.setTransform(1, 0, 0, 1, 0, 0);
    var now = songNow(), combo = run ? run.state.combo : 0;
    var ox = 0;
    if (shake > 0 && !reduced && !relax) ox = Math.round(Math.sin(time * 90) * 2);
    g.save(); g.translate(ox, 0);
    g.imageSmoothingEnabled = false;
    bands(g, 0, 0, CW, CH, relax ? ['#0e1626', '#101a2a', '#13202f', '#172534', '#1a2838', '#1d2a3a'] : ['#100c1a', '#140f20', '#191326', '#1e152a', '#24182d', '#2a1a2e']);
    stars.forEach(function (s) { var tw = reduced ? 1 : Math.sin(time * 2 + s.p); g.fillStyle = tw > 0.3 ? '#ffffff' : '#7a6f99'; g.fillRect(Math.round(s.x / 2) * 2, Math.round(s.y / 2) * 2, 2, 2); if (tw > 0.85) { g.fillRect(Math.round(s.x / 2) * 2 - 2, Math.round(s.y / 2) * 2, 6, 2); g.fillRect(Math.round(s.x / 2) * 2, Math.round(s.y / 2) * 2 - 2, 2, 6); } });
    // pixel tree line + crowd silhouettes at the bottom (stepped parallax)
    g.fillStyle = relax ? '#0b1420' : '#0d0a16';
    for (var tx = 0; tx < CW; tx += 8) { var th = 8 + ((tx * 37) % 5) * 4; g.fillRect(tx, CH - th - 12, 8, th + 12); }
    // campfire glow, grows with combo; steady when reduced
    var flick = reduced || relax ? 0 : Math.sin(time * 9) * 0.04 + Math.sin(time * 5.3) * 0.03;
    var glow = relax ? 0.5 : Math.min(1, 0.3 + combo / 40) + flick;
    // campfire glow: four stepped pixel rings instead of a soft radial blur
    for (var gs = 4; gs >= 1; gs--) { g.fillStyle = 'rgba(255,150,50,' + (0.14 * glow).toFixed(3) + ')'; var gw = gs * 40, gh = gs * 24; g.fillRect(CW / 2 - gw, CH - gh, gw * 2, gh); }
    // the campfire itself: pixel logs and a flickering flame
    var fx = CW / 2, fy = CH - 6, fk = reduced ? 0 : Math.floor(time * 8) % 3;
    g.fillStyle = '#5a3a22'; g.fillRect(fx - 18, fy - 4, 36, 4); g.fillStyle = '#7a4e2c'; g.fillRect(fx - 14, fy - 7, 28, 3);
    g.fillStyle = '#ff6b3d'; g.fillRect(fx - 9, fy - 16 - fk * 2, 18, 10 + fk * 2); g.fillStyle = '#ffb347'; g.fillRect(fx - 6, fy - 20 - fk * 2, 12, 12); g.fillStyle = '#fff3b0'; g.fillRect(fx - 3, fy - 14 - fk, 6, 6);
    // lanes
    for (var i = 0; i < 4; i++) {
      g.fillStyle = i % 2 ? 'rgba(255,255,255,0.05)' : 'rgba(255,255,255,0.09)'; g.fillRect(i * LANE_W, 0, LANE_W, CH);
      var fl = laneAt(i);
      if (flashes[fl] > 0) { g.fillStyle = LANE_COL[fl]; g.globalAlpha = reduced ? 0.25 : flashes[fl] * 0.35; g.fillRect(i * LANE_W, 0, LANE_W, HIT_Y + 20); g.globalAlpha = 1; }
      g.fillStyle = 'rgba(0,0,0,0.45)'; g.fillRect(i * LANE_W, 0, 2, CH);
      for (var dy2 = 0; dy2 < HIT_Y; dy2 += 12) { g.fillStyle = 'rgba(255,255,255,0.10)'; g.fillRect(i * LANE_W + 2, dy2, 2, 6); }
    }
    // hit-flash lane glow: a colour-coded column rising from the hit line; steady and short when reduced
    glows.forEach(function (q) {
      var a = reduced ? 0.4 : 0.55 * (1 - q.t / 0.35);
      g.fillStyle = q.col;
      for (var st = 0; st < 5; st++) { g.globalAlpha = Math.max(0, a * (1 - st / 5)); g.fillRect(colOf(q.lane) * LANE_W + 2, HIT_Y + 5 - (st + 1) * 35, LANE_W - 2, 35); }
      g.globalAlpha = 1;
    });
    g.fillStyle = '#0b0814'; g.fillRect(0, HIT_Y - 3, CW, 7); g.fillStyle = '#fff3b0'; for (var hx = 0; hx < CW; hx += 8) g.fillRect(hx, HIT_Y - 1, 6, 3);
    g.font = 'bold 16px monospace'; g.textAlign = 'center';
    for (i = 0; i < 4; i++) {
      g.fillStyle = LANE_COL[laneAt(i)]; g.globalAlpha = 0.9; shape(g, laneAt(i), i * LANE_W + LANE_W / 2, HIT_Y + 30, 14); g.globalAlpha = 1;
      g.fillStyle = '#1a1626'; g.fillText(LANES[i], i * LANE_W + LANE_W / 2, HIT_Y + 36);
      if (prefLaneShapes) { g.fillStyle = LANE_COL[laneAt(i)]; g.globalAlpha = 0.85; shape(g, laneAt(i), i * LANE_W + LANE_W / 2, 16, 9); g.globalAlpha = 1; } // lane-shape header
    }
    if (run) {
      run.notes.forEach(function (n) {
        if (n.state === 'done' && n.judge === 'miss') { /* fall away dimmed */ }
        var idx = LANES.indexOf(n.lane), x = colOf(idx) * LANE_W + LANE_W / 2, y = noteY(n.t, now);
        var yTail = n.hold ? noteY(n.t + n.hold, now) : y;
        if (yTail > CH + 20 || y < -20 && yTail < -20) return;
        if (n.state === 'done' && n.judge !== 'miss') return;
        var dim = n.state === 'done';
        g.globalAlpha = dim ? 0.3 : 1;
        if (n.hold) { var hy0 = Math.round(Math.min(yTail, y)), hh = Math.round(Math.abs(y - yTail)); g.globalAlpha = (dim ? 0.15 : 0.6); g.fillStyle = '#0b0814'; g.fillRect(Math.round(x) - 12, hy0, 24, hh); g.fillStyle = LANE_COL[idx]; g.fillRect(Math.round(x) - 9, hy0, 18, hh); g.fillStyle = 'rgba(255,255,255,0.35)'; for (var hs = hy0; hs < hy0 + hh; hs += 9) g.fillRect(Math.round(x) - 9, hs, 18, 3); g.globalAlpha = dim ? 0.3 : 1; }
        var yy = n.state === 'holding' ? HIT_Y : y;
        g.fillStyle = LANE_COL[idx]; shape(g, idx, x, yy, prefShapes || prefLaneShapes ? 17 : 15);
        if (prefLaneShapes) { g.fillStyle = '#0b0814'; shape(g, idx, x, yy, 6); } // the lane's own shape inside the note, so lanes never rely on colour
        else { g.fillStyle = '#0b0814'; g.fillRect(Math.round(x) - 3, Math.round(yy) - 3, 6, 6); g.fillStyle = '#ffffff'; g.fillRect(Math.round(x) - 3, Math.round(yy) - 3, 3, 3); }
        g.globalAlpha = 1;
      });
      if (ghost) {
        g.lineWidth = 2; g.strokeStyle = '#ffffff';
        ghost.forEach(function (d, i) {
          if (d === SG.GHOST_MISS) return;
          var gn = chart.notes[i]; if (!gn) return;
          var gy = noteY(gn.t + d, now); if (gy < -12 || gy > CH + 12) return;
          var gx = colOf(LANES.indexOf(gn.lane)) * LANE_W + LANE_W / 2;
          g.globalAlpha = 0.38; g.beginPath(); g.arc(gx, gy, 9, 0, 6.283); g.moveTo(gx - 16, gy); g.lineTo(gx + 16, gy); g.stroke();
        });
        g.globalAlpha = 1; g.lineWidth = 1;
      }
      rings.forEach(function (r) { var rr = Math.round((14 + r.t * 90) / 3) * 3, rx = colOf(r.lane) * LANE_W + LANE_W / 2; g.fillStyle = LANE_COL[r.lane]; g.globalAlpha = Math.max(0, 1 - r.t / 0.3);
        g.fillRect(rx - rr, HIT_Y - rr, rr * 2, 3); g.fillRect(rx - rr, HIT_Y + rr - 3, rr * 2, 3); g.fillRect(rx - rr, HIT_Y - rr, 3, rr * 2); g.fillRect(rx + rr - 3, HIT_Y - rr, 3, rr * 2); g.globalAlpha = 1; });
      g.font = 'bold 14px monospace';
      popups.forEach(function (p) { var y = HIT_Y - 40 - (reduced ? 0 : Math.round(p.t * 40 / 3) * 3); g.globalAlpha = reduced ? 1 : (p.t < 0.4 ? 1 : 0.5);
        if (window.MM8 && MM8.text) MM8.text(g, String(p.text).toUpperCase(), p.x, y - 12, 2, p.col, { align: 'center', shadow: '#0b0814' });
        else { g.fillStyle = '#000'; g.fillText(p.text, p.x + 1, y + 1); g.fillStyle = p.col; g.fillText(p.text, p.x, y); }
        if (p.tag) { g.font = 'bold 10px monospace'; g.fillStyle = p.tag === 'early' ? '#9bf6ff' : '#ffadad'; g.fillText(p.tag, p.x, y + 12); g.font = 'bold 14px monospace'; }
        g.globalAlpha = 1; });
      sparks.forEach(function (p) { g.globalAlpha = p.t < 0.3 ? 1 : 0.5; g.fillStyle = p.col; g.fillRect(Math.round(p.x / 3) * 3 - 2, Math.round(p.y / 3) * 3 - 2, 4, 4); });
      g.globalAlpha = 1;
      // big centred combo: the number players actually watch; pops a little on each hit (steady when reduced)
      if (!relax && !practice && combo >= 5) {
        var cs = 34 + (reduced ? 0 : Math.round(comboPop * 8));
        g.font = 'bold ' + cs + 'px monospace'; g.globalAlpha = 0.32 + Math.min(0.4, combo / 100);
        if (window.MM8 && MM8.text) { MM8.text(g, String(combo), CW / 2, 92 - (cs > 36 ? 3 : 0), cs > 36 ? 5 : 4, combo >= 50 ? '#ffd166' : '#ffffff', { align: 'center', shadow: '#0b0814' }); MM8.text(g, 'COMBO', CW / 2, 128, 2, combo >= 50 ? '#ffd166' : '#ffffff', { align: 'center', shadow: '#0b0814' }); }
        else { g.fillStyle = combo >= 50 ? '#ffd166' : '#ffffff'; g.fillText(String(combo), CW / 2, 120); g.font = 'bold 12px monospace'; g.fillText('COMBO', CW / 2, 138); }
        g.globalAlpha = 1;
      }
      if (banner) {
        var ba = banner.t < 0.8 ? 1 : Math.max(0, 1 - (banner.t - 0.8) / 0.3), bs = reduced ? 22 : 22 + Math.round(Math.max(0, 0.15 - banner.t) * 60);
        g.globalAlpha = ba; g.fillStyle = 'rgba(13,10,22,0.75)'; g.fillRect(20, 170, CW - 40, 40);
        g.font = 'bold ' + bs + 'px monospace'; g.fillStyle = banner.col; g.fillText(banner.text, CW / 2, 198); g.globalAlpha = 1;
      }
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
  // G-18 (b10-05): the play HUD (score, combo, accuracy, judgement, song, progress) only shows during a song, never stale over the menu / results
  // R4 D4 (b10-r2-07 nit): the song progress bar is part of that HUD too: hidden (and emptied) on the menu and the results card
  function hudShown(on) {
    var h = document.getElementById('hud'); if (h) h.style.visibility = on ? '' : 'hidden';
    var pg = document.getElementById('progress'); if (pg) pg.style.visibility = on ? '' : 'hidden';
    if (!on) { var pb = document.getElementById('progress-bar'); if (pb) pb.style.width = '0%'; }
  }
  function showMenu() {
    hudShown(false);
    mode = 'menu'; run = null; chart = null; paused = false; concert = null; practice = null; relax = false; assistRun = false; document.body.dataset.assist = '0'; document.body.dataset.practice = '0'; document.body.dataset.relax = '0';
    clear(overlay); overlay.hidden = false;
    overlay.appendChild(el('h2', 'Campfire Jam'));
    if (!save.hint) {
      var h = el('div'); h.id = 'hint'; h.setAttribute('role', 'note');
      h.appendChild(el('strong', 'How to play'));
      h.appendChild(el('p', COARSE ? 'Tap the pad under each lane as its note reaches the bright line. Hold long notes.' : 'Tap each note as it reaches the bright line. Keys D F J K, arrows, or touch. Hold long notes.'));
      var ok = btn('Got it', function () { save.hint = true; persist(); showMenu(); }); ok.id = 'hint-ok'; h.appendChild(ok);
      overlay.appendChild(h);
    }
    var rec = recommended(), qp = btn('Play: ' + SG.song(rec.id).name + ' (' + (prefRelax ? 'Relax ' : '') + SG.TIER_NAMES[rec.tier] + ')', function () { startSong(rec.id, rec.tier, prefRelax ? { relax: true } : undefined); });
    qp.id = 'quick-play'; qp.className = 'big'; qp.dataset.song = rec.id; qp.dataset.tier = rec.tier; overlay.appendChild(qp);
    overlay.appendChild(el('p', 'Stars: ' + SG.totalStars(save) + ' / ' + (SG.SONGS.length * 3), 'dim'));
    var rrow = el('div', undefined, 'row'); rrow.id = 'relax-row';
    var rb = el('button'); rb.type = 'button'; rb.className = 'pick'; rb.id = 'pref-relax';
    rb.textContent = 'Relax mode: ' + (prefRelax ? 'On' : 'Off'); rb.setAttribute('aria-pressed', prefRelax ? 'true' : 'false'); rb.classList.toggle('sel', prefRelax);
    rb.addEventListener('click', function () { SG.setPref(save, 'relax', !prefRelax); persist(); applyPrefs(); showMenu(); });
    rrow.appendChild(rb);
    var arow = el('div', undefined, 'row'); arow.id = 'assist-row';
    var ab = el('button'); ab.type = 'button'; ab.className = 'pick'; ab.id = 'pref-assist';
    ab.textContent = 'Assist (one thumb): ' + (assist.on ? 'On' : 'Off'); ab.setAttribute('aria-pressed', assist.on ? 'true' : 'false'); ab.classList.toggle('sel', assist.on);
    ab.addEventListener('click', function () { assist.on = !assist.on; persistAssist(); showMenu(); var f = $('pref-assist'); if (f) f.focus(); });
    arow.appendChild(ab);
    var ainfo = el('span', assist.on ? 'Assist is on: 2 lanes, any pad on a side hits it. Scores go to separate Assist bests, never stars or S-rank.' : 'Assist: fold the 4 lanes into 2 for one-thumb play (separate bests).', 'dim'); ainfo.id = 'assist-info'; arow.appendChild(ainfo);
    var rinfo = el('span', prefRelax ? 'Relax on: nothing can fail, no score. Stars only come from normal play.' : 'Play any song with no fail and no score.', 'dim'); rinfo.id = 'relax-info'; rrow.appendChild(rinfo);
    overlay.appendChild(rrow);
    overlay.appendChild(arow);
    var openN = SG.SONGS.filter(function (x) { return SG.songUnlocked(save, x.id); }).length;
    var crow = el('div', undefined, 'row'); crow.id = 'concert-row';
    var cbn = btn('Concert (3 songs)', showConcertSetup, openN < SG.CONCERT_SIZE); cbn.id = 'btn-concert'; crow.appendChild(cbn);
    var cinfo = save.concert && (save.concert.easy || save.concert.normal || save.concert.hard)
      ? SG.TIERS.filter(function (t) { return save.concert[t]; }).map(function (t) { return SG.TIER_NAMES[t] + ' ' + save.concert[t].score + ' ' + save.concert[t].rank; }).join('  |  ')
      : (openN < SG.CONCERT_SIZE ? 'Open 3 songs to play a concert.' : 'Play 3 songs back to back for a combined score.');
    var cdim = el('span', cinfo, 'dim'); cdim.id = 'concert-info'; crow.appendChild(cdim);
    overlay.appendChild(crow);
    var list = el('div', undefined, 'songs');
    SG.SONGS.forEach(function (s) {
      var open = SG.songUnlocked(save, s.id);
      var card = el('div', undefined, 'card' + (open ? '' : ' locked')); card.dataset.song = s.id;
      card.appendChild(el('strong', open || !s.secret ? s.name + '  (' + s.bpm + ' BPM)' : '???  (secret song)'));
      card.appendChild(el('span', open ? starText(SG.songStars(save, s.id)) : 'Locked', 'cardstars'));
      var b = save.best[s.id];
      var best = open ? (b ? SG.TIERS.filter(function (t) { return b[t]; }).map(function (t) { return SG.TIER_NAMES[t] + ' ' + b[t].score + ' ' + b[t].rank; }).join('  |  ') : s.blurb) : (s.secret ? 'Full-combo any Hard chart to find it' : 'Needs ' + s.needStars + ' stars (you have ' + SG.totalStars(save) + ')');
      card.appendChild(el('small', best));
      var rx = SG.relaxOf(save, s.id);
      if (open && rx.plays) { var rs = el('small', 'Relax plays ' + rx.plays + ', practice stars ' + starText(rx.pstars) + ' (do not count)'); rs.className = 'relax-line'; card.appendChild(rs); }
      var row = el('div', undefined, 'tiers');
      SG.TIERS.forEach(function (t) {
        var ok2 = SG.tierUnlocked(save, s.id, t);
        var tb = btn((prefRelax ? 'Relax ' : '') + SG.TIER_NAMES[t], function () { startSong(s.id, t, prefRelax ? { relax: true } : undefined); }, !ok2);
        tb.dataset.song = s.id; tb.dataset.tier = t;
        row.appendChild(tb);
      });
      var pb = btn('Practice', function () { showPracticeSetup(s.id); }, !open); pb.dataset.practice = s.id; pb.className = 'practice-btn';
      row.appendChild(pb);
      card.appendChild(row);
      list.appendChild(card);
    });
    overlay.appendChild(list);
    if (!('offsetMs' in save)) {
      var cc = el('div', undefined, 'note'); cc.id = 'cal-card'; cc.setAttribute('role', 'note');
      cc.appendChild(el('strong', 'Check timing (recommended, optional)'));
      cc.appendChild(el('p', 'Screens and speakers run a little late. You can play right away. A 10 second tap test lines the notes up with your ears.'));
      var cb = btn('Check timing', showCalibration); cb.id = 'cal-first'; cc.appendChild(cb);
      var sk = btn('Skip for now', function () { SG.setOffset(save, 0); persist(); showMenu(); }); sk.id = 'cal-skip'; sk.style.marginLeft = '8px'; cc.appendChild(sk);
      overlay.appendChild(cc);
    }
    var off = el('div', undefined, 'row'); off.id = 'offset-row';
    var ov = el('span', undefined, 'dim'); ov.id = 'offset-val'; off.appendChild(ov);
    function showOff() { ov.textContent = 'Timing offset: ' + fmtOff(SG.offsetOf(save)); }
    function nudge(d) { SG.setOffset(save, SG.offsetOf(save) + d); persist(); showOff(); }
    var om = btn('-5 ms', function () { nudge(-5); }); om.id = 'off-minus'; off.appendChild(om);
    var op = btn('+5 ms', function () { nudge(5); }); op.id = 'off-plus'; off.appendChild(op);
    var oc = btn('Calibrate', showCalibration); oc.id = 'btn-calibrate'; off.appendChild(oc);
    showOff(); overlay.appendChild(off);
    var prow = el('div', undefined, 'row'); prow.id = 'pref-row';
    [['shapes', 'Colour-blind lanes', 'Safe colours, thick outlines and a shape on each touch pad.'], ['lefty', 'Left-handed order', 'Mirrors the lane order. The key under each column stays the same.'], ['ghost', 'Best-run ghost', 'Faint markers show where your best run pressed each note.']].forEach(function (d) {
      var b = el('button'); b.type = 'button'; b.className = 'pick'; b.id = 'pref-' + d[0]; b.title = d[2];
      function lab() { var on = SG.prefOf(save, d[0]); b.textContent = d[1] + ': ' + (on ? 'On' : 'Off'); b.setAttribute('aria-pressed', on ? 'true' : 'false'); b.classList.toggle('sel', on); }
      b.addEventListener('click', function () { SG.setPref(save, d[0], !SG.prefOf(save, d[0])); persist(); applyPrefs(); lab(); });
      lab(); prow.appendChild(b);
    });
    // lane-shape assist (MG4): its own toggle; on by default when the shared access palette is colour-blind
    var ls = el('button'); ls.type = 'button'; ls.className = 'pick'; ls.id = 'pref-laneShapes'; ls.title = 'Each lane gets its own shape (circle, diamond, square, triangle) on the notes, the lane tops and the pads, as well as its colour.';
    function lsLab() { var on = laneShapesOn(); ls.textContent = 'Lane shapes: ' + (on ? 'On' : 'Off') + (accessPalette() !== 'normal' ? ' (access palette)' : ''); ls.setAttribute('aria-pressed', on ? 'true' : 'false'); ls.classList.toggle('sel', on); }
    ls.addEventListener('click', function () { setLaneShapes(!laneShapesOn()); persist(); applyPrefs(); lsLab(); });
    lsLab(); prow.appendChild(ls);
    var th = el('button'); th.type = 'button'; th.className = 'pick'; th.id = 'pref-tapHolds'; th.title = 'Long notes finish by themselves after one tap: no need to keep holding.';
    function thLab() { var on = SG.prefOf(save, 'tapHolds'); th.textContent = 'Long notes: ' + (on ? 'Tap only' : 'Hold'); th.setAttribute('aria-pressed', on ? 'true' : 'false'); th.classList.toggle('sel', on); }
    th.addEventListener('click', function () { SG.setPref(save, 'tapHolds', !SG.prefOf(save, 'tapHolds')); persist(); applyPrefs(); thLab(); });
    thLab(); prow.appendChild(th);
    overlay.appendChild(prow);
    var rule = el('p', 'Unlock rule: Warm Embers is always open. Lantern Shuffle opens at 2 total stars, Moth Parade at 5, Starlit Stomp at 8, then Kettle Song at 10, Owl Hour at 13, Comet Tail at 16, Fern Lullaby at 19, Spark Reel at 22, Dewdrop Drift at 25 and Harvest Moonrise at 28. A secret song waits for a full combo on any Hard chart. Hard needs 2 stars on that song’s Normal. Stars come from accuracy: 50%, 75%, 90%.', 'dim'); rule.id = 'unlock-rule';
    var rd = document.createElement('details'); rd.id = 'unlock-details'; rd.appendChild(el('summary', 'How songs unlock')); rd.appendChild(rule); overlay.appendChild(rd);
    var row2 = el('div', undefined, 'row'); row2.appendChild(homeLink('menu-back')); overlay.appendChild(row2);
  }
  function showPracticeSetup(id) {
    var sg = SG.song(id); if (!sg || !SG.songUnlocked(save, id)) return;
    mode = 'menu'; practiceCfg.b = Math.min(practiceCfg.b, maxBar(id)); practiceCfg.a = Math.min(practiceCfg.a, practiceCfg.b);
    if (!SG.tierUnlocked(save, id, practiceCfg.tier)) practiceCfg.tier = 'normal';
    clear(overlay); overlay.hidden = false;
    overlay.appendChild(el('h2', 'Practice: ' + sg.name));
    overlay.appendChild(el('p', 'Slow the song down and loop a part. Nothing is scored or saved.', 'dim'));
    var tr = el('div', undefined, 'row'); tr.id = 'practice-tiers';
    SG.TIERS.forEach(function (t) { var b = btn(SG.TIER_NAMES[t], function () { practiceCfg.tier = t; refresh(); }, !SG.tierUnlocked(save, id, t)); b.dataset.tier = t; b.className = 'pick'; tr.appendChild(b); });
    overlay.appendChild(tr);
    var sr = el('div', undefined, 'row'); sr.id = 'practice-speeds';
    PRACTICE_SPEEDS.forEach(function (v) { var b = btn(Math.round(v * 100) + '%', function () { practiceCfg.speed = v; refresh(); }); b.dataset.speed = String(v); b.className = 'pick'; sr.appendChild(b); });
    overlay.appendChild(sr);
    var lr = el('div', undefined, 'row'); lr.id = 'practice-loop-row';
    var lt = btn('Loop', function () { practiceCfg.loop = !practiceCfg.loop; refresh(); }); lt.id = 'practice-loop'; lt.className = 'pick'; lr.appendChild(lt);
    function stepper(key, label) {
      var wrap = el('span', undefined, 'stepper');
      var m = btn('-', function () { practiceCfg[key] = Math.max(1, practiceCfg[key] - 1); fix(key); refresh(); }); m.id = 'loop-' + key + '-minus'; m.setAttribute('aria-label', label + ' bar minus');
      var v = el('span', undefined, 'dim'); v.id = 'loop-' + key + '-val';
      var pl = btn('+', function () { practiceCfg[key] = Math.min(maxBar(id), practiceCfg[key] + 1); fix(key); refresh(); }); pl.id = 'loop-' + key + '-plus'; pl.setAttribute('aria-label', label + ' bar plus');
      wrap.appendChild(m); wrap.appendChild(v); wrap.appendChild(pl); lr.appendChild(wrap);
    }
    function fix(key) { if (practiceCfg.b < practiceCfg.a) { if (key === 'a') practiceCfg.b = practiceCfg.a; else practiceCfg.a = practiceCfg.b; } }
    stepper('a', 'Start'); stepper('b', 'End');
    overlay.appendChild(lr);
    var sum = el('p', undefined, 'dim'); sum.id = 'practice-summary'; overlay.appendChild(sum);
    var row = el('div', undefined, 'row');
    var go = btn('Start practice', function () { startSong(id, practiceCfg.tier, { practice: { speed: practiceCfg.speed, loop: practiceCfg.loop ? [practiceCfg.a, practiceCfg.b] : null } }); }); go.id = 'practice-start'; row.appendChild(go);
    var bk = btn('Songs', showMenu); bk.id = 'to-menu'; row.appendChild(bk);
    overlay.appendChild(row);
    function refresh() {
      Array.prototype.forEach.call(tr.children, function (b) { var on = b.dataset.tier === practiceCfg.tier; b.setAttribute('aria-pressed', on ? 'true' : 'false'); b.classList.toggle('sel', on); });
      Array.prototype.forEach.call(sr.children, function (b) { var on = Number(b.dataset.speed) === practiceCfg.speed; b.setAttribute('aria-pressed', on ? 'true' : 'false'); b.classList.toggle('sel', on); });
      lt.setAttribute('aria-pressed', practiceCfg.loop ? 'true' : 'false'); lt.classList.toggle('sel', practiceCfg.loop); lt.textContent = 'Loop: ' + (practiceCfg.loop ? 'On' : 'Off');
      $('loop-a-val').textContent = 'A bar ' + practiceCfg.a; $('loop-b-val').textContent = 'B bar ' + practiceCfg.b;
      sum.textContent = 'Speed ' + Math.round(practiceCfg.speed * 100) + '%, ' + SG.TIER_NAMES[practiceCfg.tier] + (practiceCfg.loop ? ', looping bars ' + practiceCfg.a + ' to ' + practiceCfg.b + ' of ' + maxBar(id) : ', whole song (' + maxBar(id) + ' bars)');
    }
    refresh();
  }
  function showPracticeDone(res) {
    clear(overlay); overlay.hidden = false;
    overlay.appendChild(el('h2', 'Practice done: ' + SG.song(songId).name));
    var n = el('p', 'Speed ' + Math.round(practice.speed * 100) + '%. No score, no stars, nothing saved to song bests.'); n.id = 'practice-note'; overlay.appendChild(n);
    if (practiceLast && practiceLast.sectionKey) { var sb = el('p', 'Section best (Practice, bars ' + practice.loopBars[0] + '-' + practice.loopBars[1] + ' at ' + Math.round(practice.speed * 100) + '%): ' + practiceLast.sectionBest + ' hits' + (practiceLast.sectionNew ? ' (new)' : '') + '. Kept apart from song bests.', 'dim'); sb.id = 'practice-section-best'; overlay.appendChild(sb); }
    var c = el('p', 'You hit ' + res.hits + ' notes: ' + res.counts.perfect + ' perfect, ' + res.counts.great + ' great, ' + res.counts.good + ' good, ' + res.counts.miss + ' missed.', 'dim'); c.id = 'practice-counts'; overlay.appendChild(c);
    var cfg = { speed: practice.speed, loop: practice.loopBars }, sid = songId, tr = tier;
    var row = el('div', undefined, 'row');
    var again = btn('Practice again', function () { startSong(sid, tr, { practice: cfg }); }); again.id = 'again'; row.appendChild(again);
    var back = btn('Songs', showMenu); back.id = 'to-menu'; row.appendChild(back);
    row.appendChild(homeLink('menu-back'));
    overlay.appendChild(row);
  }

  // ---------- concert: 3 songs back to back ----------
  var concertPick = [], concertTier = 'normal';
  function showConcertSetup() {
    mode = 'menu'; concert = null;
    clear(overlay); overlay.hidden = false;
    overlay.appendChild(el('h2', 'Concert'));
    overlay.appendChild(el('p', 'Pick 3 open songs and one difficulty. You play them back to back; scores add up to a concert rank.', 'dim'));
    var info = el('p', undefined, 'dim'); info.id = 'concert-pick-info'; overlay.appendChild(info);
    var list = el('div', undefined, 'songs'); list.id = 'concert-songs';
    var go;
    function refresh() {
      var chk = SG.concertCheck(save, concertPick, concertTier);
      info.textContent = 'Setlist (' + concertPick.length + '/' + SG.CONCERT_SIZE + '): ' + (concertPick.map(function (id) { return SG.song(id).name; }).join(' > ') || 'none yet') + (concertPick.length === SG.CONCERT_SIZE && !chk.ok ? '  (' + chk.error + ')' : '');
      go.disabled = !chk.ok;
      Array.prototype.forEach.call(list.children, function (b) { var i = concertPick.indexOf(b.dataset.song); b.setAttribute('aria-pressed', i >= 0 ? 'true' : 'false'); b.classList.toggle('sel', i >= 0); b.firstChild.textContent = (i >= 0 ? (i + 1) + '. ' : '') + SG.song(b.dataset.song).name; });
      Array.prototype.forEach.call(trow.children, function (b) { b.setAttribute('aria-pressed', b.dataset.tier === concertTier ? 'true' : 'false'); b.classList.toggle('sel', b.dataset.tier === concertTier); });
    }
    SG.SONGS.forEach(function (sg) {
      if (!SG.songUnlocked(save, sg.id)) return;
      var b = el('button'); b.type = 'button'; b.className = 'pick'; b.dataset.song = sg.id; b.appendChild(document.createTextNode(sg.name));
      b.addEventListener('click', function () { var i = concertPick.indexOf(sg.id); if (i >= 0) concertPick.splice(i, 1); else if (concertPick.length < SG.CONCERT_SIZE) concertPick.push(sg.id); refresh(); });
      list.appendChild(b);
    });
    overlay.appendChild(list);
    var trow = el('div', undefined, 'row'); trow.id = 'concert-tiers';
    SG.TIERS.forEach(function (t) { var b = btn(SG.TIER_NAMES[t], function () { concertTier = t; refresh(); }); b.dataset.tier = t; b.className = 'pick'; trow.appendChild(b); });
    overlay.appendChild(trow);
    var row = el('div', undefined, 'row');
    go = btn('Start concert', function () { startConcert(concertPick.slice(), concertTier); }); go.id = 'concert-start'; row.appendChild(go);
    var back = btn('Songs', showMenu); back.id = 'to-menu'; row.appendChild(back);
    overlay.appendChild(row);
    concertPick = concertPick.filter(function (id) { return SG.songUnlocked(save, id); });
    refresh();
  }
  function startConcert(ids, tr) {
    var chk = SG.concertCheck(save, ids, tr);
    if (!chk.ok) return false;
    concert = { ids: ids.slice(), tier: tr, idx: 0, parts: [] };
    return !!startSong(ids[0], tr);
  }
  function concertAfterSong(res) {
    concert.parts.push({ id: songId, score: res.score, max: chart.notes.length * Jam.POINTS.perfect, maxCombo: res.maxCombo, rank: res.rank, stars: lastReport.stars });
    concert.idx++;
    if (concert.idx < concert.ids.length) showInterlude(); else finishConcert();
  }
  function showInterlude() {
    mode = 'interlude';
    var last = concert.parts[concert.parts.length - 1], next = SG.song(concert.ids[concert.idx]);
    clear(overlay); overlay.hidden = false;
    overlay.appendChild(el('h2', 'Song ' + concert.idx + ' of ' + concert.ids.length + ' done'));
    var lp = el('p', SG.song(last.id).name + ': ' + last.score + ' points, rank ' + last.rank); lp.id = 'inter-last'; overlay.appendChild(lp);
    var run0 = SG.concertResult(concert.parts);
    var tp = el('p', 'Concert so far: ' + run0.score + ' points (' + Math.round(run0.accuracy * 100) + '%)'); tp.id = 'inter-total'; overlay.appendChild(tp);
    var np = el('p', 'Next up: ' + next.name + ' (' + next.bpm + ' BPM)'); np.id = 'inter-next'; overlay.appendChild(np);
    var row = el('div', undefined, 'row');
    var go = btn('Next song', function () { startSong(concert.ids[concert.idx], concert.tier); }); go.id = 'inter-next-btn'; row.appendChild(go);
    var q = btn('Quit concert', function () { concert = null; showMenu(); }); q.id = 'inter-quit'; row.appendChild(q);
    overlay.appendChild(row);
  }
  function finishConcert() {
    var res = SG.concertResult(concert.parts), tr = concert.tier;
    var rep = SG.recordConcert(save, tr, res); persist();
    concertLast = { score: res.score, max: res.max, accuracy: res.accuracy, rank: res.rank, maxCombo: res.maxCombo, tier: tr, newBest: rep.newBest, songs: concert.parts.map(function (p) { return { id: p.id, score: p.score, rank: p.rank }; }) };
    mode = 'results';
    clear(overlay); overlay.hidden = false;
    overlay.appendChild(el('h2', 'Concert / ' + SG.TIER_NAMES[tr]));
    var rk = el('p', res.rank); rk.id = 'con-rank'; overlay.appendChild(rk);
    rk.className = 'bigrank';
    var sc = el('p', 'Combined score ' + res.score + (rep.newBest ? '  (new concert best!)' : '  (best ' + save.concert[tr].score + ')')); sc.id = 'con-score'; overlay.appendChild(sc);
    var ac = el('p', 'Accuracy ' + Math.round(res.accuracy * 100) + '%   Best combo ' + res.maxCombo); ac.id = 'con-acc'; overlay.appendChild(ac);
    var ul = el('div'); ul.id = 'con-songs';
    concert.parts.forEach(function (p, i) { var d = el('div', (i + 1) + '. ' + SG.song(p.id).name + ': ' + p.score + '  ' + p.rank + '  ' + starText(p.stars), 'cline'); d.dataset.song = p.id; ul.appendChild(d); });
    overlay.appendChild(ul);
    var row = el('div', undefined, 'row');
    var again = btn('Another concert', function () { concert = null; showConcertSetup(); }); again.id = 'con-again'; row.appendChild(again);
    var back = btn('Songs', showMenu); back.id = 'to-menu'; row.appendChild(back);
    row.appendChild(homeLink('menu-back'));
    overlay.appendChild(row);
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
    overlay.appendChild(el('p', practice ? 'Practice at ' + Math.round(practice.speed * 100) + '% speed. Nothing is scored.' : relax ? 'Relax mode. Nothing is scored; the song waits for you.' : 'The song waits for you.', 'dim'));
    var row = el('div', undefined, 'row');
    var r = btn('Resume', resume); r.id = 'resume'; row.appendChild(r);
    // restart from the top without a trip through the menu (same chart, same mode; a concert restarts its current song)
    var sid = songId, tr = tier, o = practice ? { practice: { speed: practice.speed, loop: practice.loopBars } } : relax ? { relax: true } : undefined;
    var rs = btn('Restart', function () { releaseAll(); paused = false; navPaused = false; mode = 'menu'; stopAudioForMenu(); startSong(sid, tr, o); }); rs.id = 'restart'; row.appendChild(rs);
    var q = btn('Quit to songs', quit); q.id = 'quit'; row.appendChild(q);
    overlay.appendChild(row);
  }
  function showResults() {
    hudShown(false);
    var res = lastResult, rep = lastReport, s = SG.song(songId);
    clear(overlay); overlay.hidden = false;
    overlay.appendChild(el('h2', s.name + ' / ' + SG.TIER_NAMES[tier]));
    var rk = el('p', res.rank); rk.id = 'res-rank'; overlay.appendChild(rk);
    var st = el('p', starText(rep.stars), 'stars'); st.id = 'res-stars'; overlay.appendChild(st);
    var best = save.best[songId][tier];
    var sc = el('p', 'Score ' + res.score + (rep.newBest ? '  (new best!)' : '  (best ' + best.score + ')')); sc.id = 'res-score'; overlay.appendChild(sc);
    var acc = el('p', 'Accuracy ' + Math.round(res.accuracy * 100) + '%   Max combo ' + res.maxCombo + (res.counts.miss === 0 ? '   Full combo!' : '')); acc.id = 'res-acc'; overlay.appendChild(acc);
    if (rep.newBest && lastPrevBest !== null) { var pbl = el('p', 'New personal best: +' + (res.score - lastPrevBest) + ' over ' + lastPrevBest, 'pb'); pbl.id = 'res-pb'; overlay.appendChild(pbl); }
    if (rep.newBest) sfxPlay('claim');
    var gl = el('p', nextGoal(res, rep), 'goal'); gl.id = 'res-goal'; overlay.appendChild(gl);
    // one-tap Play again right under the headline numbers (R also restarts); the details follow below
    var row = el('div', undefined, 'row'); row.id = 'res-actions';
    var again = btn('Play again', function () { startSong(songId, tier); }); again.id = 'again'; again.className = 'big'; row.appendChild(again);
    var rb = btn('Replay best', function () { startSong(songId, tier, { ghost: true }); }, !SG.ghostOf(save, songId, tier)); rb.id = 'replay-best'; row.appendChild(rb);
    var back = btn('Songs', showMenu); back.id = 'to-menu'; row.appendChild(back);
    overlay.appendChild(row);
    var cl = el('div'); cl.id = 'res-counts';
    ['perfect', 'great', 'good', 'miss'].forEach(function (j) { var d = el('div', JUDGE_LABEL[j] + ' ' + res.counts[j]); d.dataset.judge = j; cl.appendChild(d); });
    overlay.appendChild(cl);
    var total = res.counts.perfect + res.counts.great + res.counts.good + res.counts.miss;
    var bd = el('div'); bd.id = 'res-breakdown';
    ['perfect', 'great', 'good', 'miss'].forEach(function (j) {
      var pc = total ? Math.round(res.counts[j] / total * 100) : 0;
      var r = el('div', undefined, 'brow'); r.dataset.judge = j; r.dataset.pct = String(pc);
      r.appendChild(el('span', JUDGE_LABEL[j], 'bl'));
      var bar = el('span', undefined, 'bar'), fill = el('i'); fill.style.width = pc + '%'; fill.className = 'f-' + j; bar.appendChild(fill); r.appendChild(bar);
      r.appendChild(el('span', res.counts[j] + ' (' + pc + '%)', 'bn'));
      bd.appendChild(r);
    });
    overlay.appendChild(bd);
    var dl = run ? run.deltas() : [], hg = Jam.histogram(dl);
    resultsData = { histogram: hg, history: SG.histOf(save, songId, tier), ghost: !!SG.ghostOf(save, songId, tier) };
    var hc = document.createElement('canvas'); hc.id = 'res-histo'; hc.width = 300; hc.height = 90; hc.setAttribute('role', 'img');
    hc.setAttribute('aria-label', 'Timing histogram: ' + hg.early + ' early, ' + hg.onTime + ' on time, ' + hg.late + ' late');
    overlay.appendChild(hc); drawHistogram(hc, hg);
    var ht = el('p', 'Early ' + hg.early + '  |  On time ' + hg.onTime + '  |  Late ' + hg.late, 'dim'); ht.id = 'res-histo-text'; overlay.appendChild(ht);
    var hist = resultsData.history;
    var sc2 = document.createElement('canvas'); sc2.id = 'res-spark'; sc2.width = 300; sc2.height = 70; sc2.setAttribute('role', 'img');
    sc2.setAttribute('aria-label', 'Accuracy of your last ' + hist.length + ' runs on this chart');
    sc2.dataset.points = hist.map(function (h) { return h.acc; }).join(',');
    overlay.appendChild(sc2); drawSparkline(sc2, hist);
    var st2 = el('p', 'Last ' + hist.length + ' run' + (hist.length === 1 ? '' : 's') + ' (accuracy): ' + hist.map(function (h) { return h.acc + '%'; }).join(', '), 'dim'); st2.id = 'res-spark-text'; overlay.appendChild(st2);
    var tm = el('p', timingText(res)); tm.id = 'res-timing'; overlay.appendChild(tm);
    var sug = SG.offsetOf(save) + (res.avgDelta || 0);
    if (res.hits >= 8 && Math.abs(res.avgDelta) >= 5 && Math.abs(sug) <= Jam.OFFSET_MAX) {
      var ab = btn('Set offset to ' + fmtOff(sug), function () { SG.setOffset(save, sug); persist(); ab.disabled = true; ab.textContent = 'Offset is ' + fmtOff(SG.offsetOf(save)); }); ab.id = 'apply-suggest'; overlay.appendChild(ab);
    }
    var un = rep.newlyUnlocked.map(function (id) { return SG.song(id).name; });
    if (un.length) { var u = el('p', 'Unlocked: ' + un.join(', ')); u.id = 'res-unlocked'; overlay.insertBefore(u, gl.nextSibling); }
    var row2 = el('div', undefined, 'row'); row2.appendChild(homeLink('menu-back')); overlay.appendChild(row2);
    try { again.focus({ preventScroll: true }); } catch (e) { /* ignore */ }
  }
  // the one concrete thing to aim for next; "So close" when it is within 3 points of accuracy (near-miss feedback)
  function nextGoal(res, rep) {
    var a = res.accuracy, pct = function (x) { return Math.max(1, Math.ceil((x - a) * 100)); };
    var g;
    if (rep.stars < 3) { var need = SG.STAR_AT[rep.stars]; g = { gap: need - a, text: 'Next star at ' + Math.round(need * 100) + '% accuracy: ' + pct(need) + '% to go.' }; }
    else if (res.rank !== 'S') g = { gap: 0.95 - a, text: 'Rank S at 95% accuracy: ' + pct(0.95) + '% to go.' };
    else if (!res.fullCombo) g = { gap: 0, text: 'Next goal: a full combo (' + res.counts.miss + ' missed this time).' };
    else {
      var nt = SG.TIERS[SG.TIERS.indexOf(tier) + 1];
      g = { gap: 1, text: nt && SG.tierUnlocked(save, songId, nt) ? 'Mastered! Try ' + SG.TIER_NAMES[nt] + ' next.' : 'Mastered! Chase a higher score or another song.' };
    }
    return (g.gap > 0 && g.gap <= 0.03 ? 'So close! ' : '') + g.text;
  }
  // quick play: the first open chart (song order, easiest tier first) without 3 stars yet; a brand-new player gets Warm Embers Easy
  function recommended() {
    for (var i = 0; i < SG.SONGS.length; i++) {
      var s = SG.SONGS[i]; if (!SG.songUnlocked(save, s.id)) continue;
      for (var k = 0; k < SG.TIERS.length; k++) {
        var t = SG.TIERS[k], b = save.best[s.id] && save.best[s.id][t];
        if (SG.tierUnlocked(save, s.id, t) && !(b && b.stars >= 3)) return { id: s.id, tier: t };
      }
    }
    return { id: SG.SONGS[0].id, tier: 'hard' };
  }
  // 13 bars from 130 ms early to 130 ms late; the centre bar is on time. Static, so reduced motion needs no change.
  function drawHistogram(cv2, hg) {
    var g = cv2.getContext('2d'), W = cv2.width, H = cv2.height, n = hg.bins.length, mx = Math.max(1, Math.max.apply(null, hg.bins)), bw = (W - 20) / n;
    g.fillStyle = '#1a1626'; g.fillRect(0, 0, W, H);
    for (var i = 0; i < n; i++) {
      var h = Math.round(hg.bins[i] / mx * (H - 34)), c = i < (n - 1) / 2 ? '#9bf6ff' : i > (n - 1) / 2 ? '#ffadad' : '#fff3b0';
      g.fillStyle = c; g.fillRect(Math.round(10 + i * bw + 1), H - 18 - h, Math.floor(bw - 2), h); g.fillStyle = 'rgba(0,0,0,0.3)'; g.fillRect(Math.round(10 + i * bw + bw - 5), H - 18 - h, 3, h);
    }
    g.fillStyle = '#a79bc0'; g.font = '11px monospace'; g.textAlign = 'left'; g.fillText('early', 10, H - 4); g.textAlign = 'center'; g.fillText('on time', W / 2, H - 4); g.textAlign = 'right'; g.fillText('late', W - 10, H - 4);
    g.strokeStyle = '#a79bc0'; g.beginPath(); g.moveTo(W / 2, 4); g.lineTo(W / 2, H - 18); g.stroke();
  }
  // accuracy (0..100) of the last runs on this chart; the newest run is the white dot
  function drawSparkline(cv2, hist) {
    var g = cv2.getContext('2d'), W = cv2.width, H = cv2.height, n = hist.length;
    g.fillStyle = '#1a1626'; g.fillRect(0, 0, W, H);
    g.strokeStyle = 'rgba(255,255,255,0.15)'; g.beginPath(); g.moveTo(10, 10); g.lineTo(W - 10, 10); g.moveTo(10, H - 10); g.lineTo(W - 10, H - 10); g.stroke();
    if (!n) return;
    var px = function (i) { return n === 1 ? W / 2 : 20 + i * (W - 40) / (n - 1); }, py = function (a) { return H - 10 - a / 100 * (H - 20); };
    g.strokeStyle = '#ffb347'; g.lineWidth = 2; g.beginPath();
    hist.forEach(function (h, i) { if (i) g.lineTo(px(i), py(h.acc)); else g.moveTo(px(i), py(h.acc)); });
    g.stroke(); g.lineWidth = 1;
    hist.forEach(function (h, i) { var d = i === n - 1 ? 5 : 3; g.fillStyle = '#0b0814'; g.fillRect(Math.round(px(i)) - d - 1, Math.round(py(h.acc)) - d - 1, d * 2 + 2, d * 2 + 2); g.fillStyle = i === n - 1 ? '#ffffff' : '#ffb347'; g.fillRect(Math.round(px(i)) - d, Math.round(py(h.acc)) - d, d * 2, d * 2); });
  }

  // ---------- loop ----------
  function frame(ts) {
    pollGamepad();
    if (!TEST) { tick(); calTick(); animate(1 / 60); }
    render(ts / 1000);
    requestAnimationFrame(frame);
  }
  applyPrefs();
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
      get sparks() { return sparks.length; },
      get banner() { return banner ? banner.text : null; },
      get milestones() { return milestonesHit.slice(); },
      get recommended() { return recommended(); },
      get paused() { return paused; },
      get ghost() { return ghost ? { active: true, count: ghost.filter(function (d) { return d !== SG.GHOST_MISS; }).length, markers: ghost.map(function (d, i) { return d === SG.GHOST_MISS || !chart.notes[i] ? null : { lane: chart.notes[i].lane, t: chart.notes[i].t + d }; }).filter(Boolean) } : { active: false, count: 0, markers: [] }; },
      get results() { return resultsData ? JSON.parse(JSON.stringify(resultsData)) : null; },
      get practice() { return practice ? { speed: practice.speed, loop: practice.loop ? { a: practice.loop.a, b: practice.loop.b, aBar: practice.loopBars[0], bBar: practice.loopBars[1] } : null, loops: practice.loops } : null; },
      get relax() { return relax; },
      sectionBest: function () { return sectionKey() ? assist.section[sectionKey()] || 0 : null; },
      get assist() { return { on: assist.on, active: assistRun, best: JSON.parse(JSON.stringify(assist.best)), section: Object.assign({}, assist.section), last: assistLast ? Object.assign({}, assistLast) : null }; },
      get relaxResult() { return relaxLast ? JSON.parse(JSON.stringify(relaxLast)) : null; },
      get popups() { return popups.map(function (q) { return q.text; }); },
      get laneShapes() { return prefLaneShapes; },
      get tapHolds() { return prefTapHolds; },
      get padText() { return LANES.map(function (l) { return $('pad-' + l).textContent; }); },
      get practiceResult() { return practiceLast ? JSON.parse(JSON.stringify(practiceLast)) : null; },
      get prefs() { return { shapes: prefShapes, lefty: prefLefty, laneShapes: prefLaneShapes, tapHolds: prefTapHolds, relax: prefRelax }; },
      get laneColors() { return LANE_COL.slice(); },
      get columns() { return LANES.map(function (l) { return colOf(LANES.indexOf(l)); }); },
      setPref: function (k, v) { var r = SG.setPref(save, k, !!v); persist(); applyPrefs(); return r; },
      get concert() { return concert ? { ids: concert.ids.slice(), tier: concert.tier, idx: concert.idx, parts: concert.parts.map(function (p) { return Object.assign({}, p); }) } : null; },
      get concertResult() { return concertLast ? JSON.parse(JSON.stringify(concertLast)) : null; },
      startConcert: startConcert,
      get lastJudge() { return lastJudge; },
      get offset() { return SG.offsetOf(save); },
      get glows() { return glows.length; },
      get timing() { return lastTiming; },
      get cal() { return cal ? { state: cal.state, taps: cal.taps.length, now: calNow, beats: cal.state === 'run' || cal.state === 'done' ? calMeasured() : [], result: cal.result } : null; },
      calStep: calStep, calTap: calTap,
      get sfx() { return sfx; },
      get sfxLog() { return sfxLog.slice(); },
      get audio() { return !!actx; },
      start: startSong, step: step, press: press, release: release, pause: pause, resume: resume, menu: showMenu,
      at: function (ms) { if (ms > testNow) step((ms - testNow) / (practice ? practice.speed : 1)); }
    };
  }
})();
