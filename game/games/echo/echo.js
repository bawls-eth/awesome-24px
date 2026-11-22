// Echo Garden: a calm memory-tune game, up to 2 minutes a round. Four flowers, each with its own colour, shape, number
// and note. The garden sings a tune; tap it back in the same order and the tune grows one note longer.
// Forgiving: a wrong flower wilts one of three leaves, shows the right flower and plays the tune again, slower.
// Own keys only: `pixeltown-echo-v1` (save) and `pixeltown-medals-echo-v1` (hub medal summary). No network, textContent only.
// Every tune is seeded (MMRng): "Replay seed" sings the very same melody again so it can be practised.
(function () {
  'use strict';
  const KEY = 'pixeltown-echo-v1', MKEY = 'pixeltown-medals-echo-v1';
  const CW = 360, CH = 400, ROUND = 120, LEAVES = 3, START_LEN = 3, MAXSEQ = 64;
  const MEDALS = [
    ['round1', 'First bloom', 'Finish a round'],
    ['t6', '6-note tune', 'Echo a 6-note tune'],
    ['clean8', 'No-wilt 8', 'Echo an 8-note tune with no wilted leaf'],
    ['t10', '10-note tune', 'Echo a 10-note tune'],
  ];
  const FLOWERS = [
    { name: 'Red tulip', c: '#ff6b6b', d: '#a8323a', hz: 262, shape: 'tulip' },
    { name: 'Sun daisy', c: '#ffe066', d: '#b08a1a', hz: 330, shape: 'daisy' },
    { name: 'Blue bell', c: '#5cc8ff', d: '#1f6f9e', hz: 392, shape: 'bell' },
    { name: 'Star lily', c: '#c99bff', d: '#6a45a8', hz: 523, shape: 'star' },
  ];
  const $ = (id) => document.getElementById(id);
  const params = new URLSearchParams(location.search);
  const TEST = params.get('test') === '1';
  let reduced = false, lowGfx = false;
  try { reduced = (window.MMMotion ? MMMotion.reduced(window, localStorage) : false) || !!(window.MMSideAccess && MMSideAccess.reduced()); } catch (e) { reduced = false; }
  try { lowGfx = !!(window.MMAccess && MMAccess.prefs.load(localStorage).lowGfx); } catch (e) { lowGfx = false; }
  let sfx = null;
  try { sfx = window.MMSfx ? MMSfx.create({ storage: localStorage }) : null; } catch (e) { sfx = null; }
  const play = (n) => { try { if (sfx) sfx.play(n); } catch (e) { /* ignore */ } };
  // Flower notes: a soft sine through the same mute switch as MMSfx (no context until a tap).
  let actx = null;
  function tone(i, dur) {
    if (!sfx || sfx.isMuted()) return;
    try {
      if (!actx) { const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return; actx = new AC(); }
      if (actx.state === 'suspended' && actx.resume) actx.resume();
      const t0 = actx.currentTime, o = actx.createOscillator(), gn = actx.createGain();
      o.type = 'sine'; o.frequency.setValueAtTime(FLOWERS[i].hz, t0);
      gn.gain.setValueAtTime(0.0001, t0); gn.gain.linearRampToValueAtTime(0.09 * (sfx.getVolume ? sfx.getVolume() : 1), t0 + 0.02);
      gn.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
      o.connect(gn); gn.connect(actx.destination); o.start(t0); o.stop(t0 + dur + 0.05);
    } catch (e) { /* audio is optional */ }
  }

  // ---------- save ----------
  const int = (x, hi) => (typeof x === 'number' && isFinite(x) && x >= 0 ? Math.min(hi, Math.floor(x)) : 0);
  function load() {
    let o = null;
    try { const s = localStorage.getItem(KEY); if (typeof s === 'string' && s.length < 4000) o = JSON.parse(s); } catch (e) { o = null; }
    if (!o || typeof o !== 'object' || Array.isArray(o)) o = {};
    const ok = MEDALS.map((m) => m[0]);
    return { v: 1, hint: o.hint === true, best: int(o.best, MAXSEQ), bestScore: int(o.bestScore, 1e9), rounds: int(o.rounds, 1e9),
      medals: Array.isArray(o.medals) ? o.medals.filter((m, i, a) => ok.indexOf(m) >= 0 && a.indexOf(m) === i) : [] };
  }
  let save = load();
  function persist() {
    try { localStorage.setItem(KEY, JSON.stringify(save)); localStorage.setItem(MKEY, JSON.stringify({ v: 1, m: save.medals.slice() })); } catch (e) { /* storage refused: play on */ }
    try { if (window.MMHubProfile && MMHubProfile.sync) MMHubProfile.sync(localStorage, 'echo', save.medals.slice()); } catch (e) { /* hub map progress is optional */ }
  }
  function award(id) { if (save.medals.indexOf(id) >= 0) return false; save.medals.push(id); run.newMedals.push(id); persist(); play('claim'); return true; }

  // ---------- garden ----------
  const canvas = $('board'), g = canvas.getContext('2d');
  canvas.width = CW; canvas.height = CH;
  const PAD = [[0, 0], [1, 0], [0, 1], [1, 1]].map((q) => ({ x: q[0] * (CW / 2), y: q[1] * (CH / 2), w: CW / 2, h: CH / 2 }));
  let rng = null, seq = [];
  const lit = [0, 0, 0, 0], hintT = [0, 0, 0, 0];
  let parts = [], floats = [], cur = 0, showCur = false;
  const run = { state: 'ready', seed: '', score: 0, time: ROUND, len: START_LEN, pos: 0, leaves: LEAVES, wilts: 0, best: 0, newMedals: [], why: '',
    phase: 'idle', showI: 0, showT: 0, tempo: 0.6, wait: 0 };

  function makeSeq() {
    seq = [];
    for (let i = 0; i < MAXSEQ; i++) {
      let n = Math.floor(rng.next() * 4);
      if (i >= 2 && seq[i - 1] === n && seq[i - 2] === n) n = (n + 1 + Math.floor(rng.next() * 3)) % 4;
      seq.push(n);
    }
  }
  const tempoFor = (len) => Math.max(0.34, 0.66 - (len - START_LEN) * 0.03);
  function beginShow(slow) {
    run.phase = 'show'; run.showI = 0; run.showT = -0.5; run.pos = 0;
    run.tempo = tempoFor(run.len) * (slow ? 1.35 : 1);
    msg(slow ? 'Listen again, a little slower.' : 'Listen: a ' + run.len + '-note tune.');
  }

  // ---------- feedback ----------
  function burst(i, color, n) {
    n = lowGfx ? Math.min(6, n, Math.max(0, 24 - parts.length)) : n;
    const p = PAD[i], cx = p.x + p.w / 2, cy = p.y + p.h / 2 - 10;
    for (let k = 0; k < n; k++) {
      const a = (k / n) * Math.PI * 2, sp = 40 + (k * 29) % 90;
      parts.push({ x: cx, y: cy, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 30, t: 0.7 + (k % 3) * 0.1, c: color });
    }
    if (parts.length > 160) parts.splice(0, parts.length - 160);
  }
  function floatText(x, y, text, color) { floats.push({ x, y, text, color: color || '#fff', t: 1.1 }); }
  const msg = (t) => { $('msg').textContent = t; };
  function light(i, dur) { lit[i] = dur; tone(i, Math.min(0.6, dur + 0.15)); }

  // ---------- input ----------
  function tap(i) {
    if (run.state !== 'play') return false;
    if (!(i >= 0 && i < 4)) return false;
    if (run.phase !== 'input') { if (run.phase === 'show') msg('Listen first: your turn comes after the tune.'); return false; }
    const want = seq[run.pos];
    if (i === want) {
      light(i, 0.28);
      burst(i, FLOWERS[i].c, 6);
      run.pos++;
      let done = false;
      if (run.pos >= run.len) {
        done = true;
        const pts = run.len * 10 + (run.wiltsThis ? 0 : run.len * 5);
        run.score += pts;
        if (run.len > run.best) run.best = run.len;
        floatText(CW / 2, CH / 2, '+' + pts + (run.wiltsThis ? '' : '  in bloom!'), '#ffd166');
        burst(i, '#fff', 14);
        play(run.len >= 6 ? 'levelup' : 'pickup');
        if (run.len >= 6) award('t6');
        if (run.len >= 10) award('t10');
        if (run.len >= 8 && run.wilts === 0) award('clean8');
        const next = run.len + 1;
        msg(save.best && next > save.best ? 'Lovely! Next: ' + next + ' notes, a new best if you echo it.' : 'Lovely! The tune grows to ' + next + ' notes.');
        run.len = Math.min(MAXSEQ, next); run.wiltsThis = 0; run.pos = 0;
        run.phase = 'wait'; run.wait = 0.8; run.after = 'show';
      }
      hud();
      return { ok: true, done };
    }
    // a miss: wilt a leaf, show the right flower, replay slower (or end gently on the last leaf)
    run.leaves--; run.wilts++; run.wiltsThis = (run.wiltsThis || 0) + 1;
    hintT[want] = 1.1;
    play('ui_tap');
    floatText(PAD[i].x + PAD[i].w / 2, PAD[i].y + 24, 'wilt', '#b3a9d6');
    run.nearPos = run.pos;
    if (run.leaves <= 0) { run.why = 'wilted'; hud(); end(); return { ok: false, over: true }; }
    msg('That was the ' + FLOWERS[want].name + ' (' + (want + 1) + '). ' + run.leaves + (run.leaves === 1 ? ' leaf' : ' leaves') + ' left.');
    run.phase = 'wait'; run.wait = 1.1; run.after = 'replay';
    hud();
    return { ok: false, want };
  }

  // ---------- flow ----------
  function newSeed() { return (Date.now().toString(36) + (save.rounds % 1296).toString(36)).slice(-8); }
  function start(seed) {
    run.seed = (typeof seed === 'string' && /^[A-Za-z0-9_-]{1,24}$/.test(seed)) ? seed : newSeed();
    rng = MMRng.create('echo-garden:' + run.seed);
    makeSeq();
    Object.assign(run, { state: 'play', score: 0, time: ROUND, len: START_LEN, pos: 0, leaves: LEAVES, wilts: 0, wiltsThis: 0, best: 0, newMedals: [], why: '', nearPos: 0 });
    parts = []; floats = []; lit.fill(0); hintT.fill(0);
    $('intro').hidden = true; $('result').hidden = true;
    beginShow(false);
    hud();
  }
  function nearLine() {
    if (run.why === 'wilted' && run.len - run.nearPos <= 2) return 'You were ' + (run.len - run.nearPos) + (run.len - run.nearPos === 1 ? ' note' : ' notes') + ' from finishing a ' + run.len + '-note tune.';
    if (save.best > run.best && save.best - run.best <= 2) return 'Just ' + (save.best - run.best) + ' short of your best tune. Replay seed sings the same melody.';
    const m = MEDALS.find((x) => save.medals.indexOf(x[0]) < 0 && /^t\d+$/.test(x[0]));
    if (m) { const n = parseInt(m[0].slice(1), 10) - run.best; if (n > 0) return n + ' more notes for the ' + m[1] + ' medal.'; }
    return 'Tip: say the numbers softly as the flowers sing.';
  }
  function end() {
    if (run.state !== 'play') return;
    run.state = 'over'; run.phase = 'idle';
    save.rounds++;
    const prevBest = save.best, prevScore = save.bestScore;
    const newBest = run.best > save.best;
    if (newBest) save.best = run.best;
    if (run.score > save.bestScore) save.bestScore = run.score;
    award('round1');
    persist();
    showResult(newBest, prevBest, prevScore);
    $('result').hidden = false;
    msg('');
    if (resCard) resCard.focus(); else $('again').focus({ preventScroll: true });
    hud();
  }
  // MK1: the shared result card (MMMiniKit); ids r-title / r-score / r-best / r-line / r-new / r-medals / again / replay kept
  const rMedals = $('r-medals');
  let resCard = null;
  function showResult(newBest, prevBest, prevScore) {
    medalList(rMedals);
    const title = run.why === 'wilted' ? 'The garden rests: ' : 'Time! ';
    const pts = run.score + ' points';
    const lines = [
      { id: 'r-best', text: newBest ? 'New best tune: ' + run.best + ' notes!' : 'Longest tune: ' + run.best + ' / best ' + save.best, cls: newBest ? 'new' : 'dim' },
      { id: 'r-line', text: nearLine() + ' Seed ' + run.seed, cls: 'dim' },
      { id: 'r-new', text: run.newMedals.length ? 'New medal: ' + run.newMedals.map((m) => MEDALS.find((x) => x[0] === m)[1]).join(', ') : '', cls: 'new' },
    ];
    if (!window.MMMiniKit) {
      $('r-title').firstChild.textContent = title; $('r-score').textContent = pts;
      lines.forEach((l) => { $(l.id).textContent = l.text; $(l.id).className = l.cls; });
      return;
    }
    const K = window.MMMiniKit;
    resCard = K.panel($('result'), K.result({
      headline: [title, { text: pts, id: 'r-score' }],
      stats: [
        { label: 'Longest tune', value: run.best + ' notes', best: newBest && prevBest > 0 },
        { label: 'Score', value: K.fmt(run.score), best: run.score > prevScore && prevScore > 0 },
      ],
      lines,
      goalText: nextGoal(),
      seed: run.seed,
      menuHref: '../../index.html',
      ids: { head: 'r-title', again: 'again', replay: 'replay', code: 'r-code', copy: 'r-copy', goal: 'r-goal' },
    }), { again: () => start(), replay: (sd) => start(sd), extra: [rMedals], holdMs: 400 });
  }
  function medalList(ul) {
    while (ul.firstChild) ul.removeChild(ul.firstChild);
    MEDALS.forEach((m) => { const li = document.createElement('li'); const on = save.medals.indexOf(m[0]) >= 0; li.className = on ? 'on' : ''; li.textContent = (on ? '★ ' : '☆ ') + m[1]; li.title = m[2]; ul.appendChild(li); });
  }
  function nextGoal() { const m = MEDALS.find((x) => save.medals.indexOf(x[0]) < 0); return m ? 'Goal: ' + m[2] : 'All medals won. Grow your longest tune!'; }
  function hud() {
    $('h-score').textContent = String(run.score);
    $('h-time').textContent = String(Math.max(0, Math.ceil(run.time)));
    $('h-best').textContent = String(Math.max(save.best, run.best));
    $('h-len').textContent = run.state === 'play' ? run.pos + '/' + run.len : '-';
    $('wilts').textContent = run.state === 'play' ? 'Leaves left: ' + run.leaves + ' of ' + LEAVES + (run.phase === 'input' ? '. Your turn.' : '') : '';
    $('timefill').style.transform = 'scaleX(' + Math.max(0, Math.min(1, run.time / ROUND)) + ')';
    $('goal').textContent = nextGoal();
  }

  // ---------- update / draw ----------
  function update(dt, manual) {
    const sim = !TEST || manual;
    if (sim && run.state === 'play') {
      run.time -= dt;
      if (run.time <= 0) { run.time = 0; run.why = 'time'; end(); }
      else if (run.phase === 'show') {
        run.showT += dt;
        if (run.showT >= 0 && run.showI < run.len && Math.floor(run.showT / run.tempo) >= run.showI) { light(seq[run.showI], run.tempo * 0.7); run.showI++; }
        if (run.showI >= run.len && run.showT >= run.len * run.tempo) { run.phase = 'input'; run.pos = 0; msg('Your turn: tap the ' + run.len + ' flowers back.'); hud(); }
      } else if (run.phase === 'wait') {
        run.wait -= dt;
        if (run.wait <= 0) beginShow(run.after === 'replay');
      }
    }
    for (let i = 0; i < 4; i++) { lit[i] = Math.max(0, lit[i] - dt); hintT[i] = Math.max(0, hintT[i] - dt); }
    parts.forEach((p) => { p.x += p.vx * dt; p.y += p.vy * dt; p.vy += 120 * dt; p.t -= dt; });
    parts = parts.filter((p) => p.t > 0);
    floats.forEach((f) => { f.y -= 24 * dt; f.t -= dt; });
    floats = floats.filter((f) => f.t > 0);
  }
  function petal(x, y, s, c) { g.fillStyle = c; g.fillRect(Math.round(x - s / 2), Math.round(y - s / 2), s, s); }
  function drawFlower(i) {
    const f = FLOWERS[i], p = PAD[i], on = lit[i] > 0, hint = hintT[i] > 0;
    const cx = p.x + p.w / 2, cy = p.y + p.h / 2 - 8;
    // bed
    g.fillStyle = on ? '#2f4a33' : '#1d2c22'; g.fillRect(p.x + 4, p.y + 4, p.w - 8, p.h - 8);
    if (hint) { g.strokeStyle = '#ffd166'; g.lineWidth = 4; g.strokeRect(p.x + 8, p.y + 8, p.w - 16, p.h - 16); }
    if (showCur && cur === i && run.state === 'play') { g.strokeStyle = '#fff'; g.lineWidth = 3; g.strokeRect(p.x + 6, p.y + 6, p.w - 12, p.h - 12); }
    const sc = on && !reduced ? 1.18 : 1;
    const col = on ? f.c : f.d;
    // stem and leaves
    g.fillStyle = '#3a8f4a'; g.fillRect(cx - 3, cy + 22, 6, 50);
    g.fillRect(cx - 18, cy + 40, 15, 8); g.fillRect(cx + 3, cy + 30, 15, 8);
    const u = 14 * sc;
    if (f.shape === 'tulip') {
      for (let k = -1; k <= 1; k++) petal(cx + k * u, cy, u + 2, col);
      petal(cx - u, cy - u, u, col); petal(cx + u, cy - u, u, col); petal(cx, cy + u * 0.8, u * 2, col);
    } else if (f.shape === 'daisy') {
      for (let k = 0; k < 8; k++) { const a = k * Math.PI / 4; petal(cx + Math.cos(a) * u * 1.6, cy + Math.sin(a) * u * 1.6, u, on ? '#ffffff' : '#9c9cb0'); }
      petal(cx, cy, u * 1.6, col);
    } else if (f.shape === 'bell') {
      petal(cx, cy - u, u * 1.4, col); petal(cx, cy + 2, u * 2.4, col); petal(cx - u * 1.2, cy + u * 1.2, u, col); petal(cx + u * 1.2, cy + u * 1.2, u, col);
    } else {
      for (let k = 0; k < 5; k++) { const a = -Math.PI / 2 + k * Math.PI * 2 / 5; petal(cx + Math.cos(a) * u * 1.7, cy + Math.sin(a) * u * 1.7, u * 1.1, col); }
      petal(cx, cy, u * 1.4, on ? '#fff3b0' : '#8a7a40');
    }
    if (on && !lowGfx) { g.fillStyle = f.c + '33'; g.fillRect(p.x + 4, p.y + 4, p.w - 8, p.h - 8); }
    // number label (never colour alone)
    g.fillStyle = on ? '#fff' : '#b3a9d6'; g.font = 'bold 18px ui-monospace, Menlo, monospace'; g.textAlign = 'left'; g.textBaseline = 'top';
    g.fillText(String(i + 1), p.x + 14, p.y + 12);
    g.font = '12px ui-monospace, Menlo, monospace'; g.textAlign = 'center'; g.textBaseline = 'bottom';
    g.fillText(f.name, cx, p.y + p.h - 10);
  }
  function draw() {
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.fillStyle = '#10180f'; g.fillRect(0, 0, CW, CH);
    for (let i = 0; i < 4; i++) drawFlower(i);
    // the tune so far: little dots (filled = echoed)
    if (run.state === 'play') {
      const n = run.len, w = Math.min(14, (CW - 40) / n), x0 = CW / 2 - (n * w) / 2;
      for (let k = 0; k < n; k++) { g.fillStyle = (run.phase === 'input' ? k < run.pos : k < run.showI) ? '#ffd166' : '#ffffff33'; g.fillRect(x0 + k * w + 2, CH / 2 - 4, w - 4, 8); }
    }
    parts.forEach((p) => { g.globalAlpha = Math.min(1, p.t * 2); g.fillStyle = p.c; g.fillRect(p.x - 3, p.y - 3, 5, 5); });
    g.globalAlpha = 1;
    g.font = 'bold 18px ui-monospace, Menlo, monospace'; g.textAlign = 'center'; g.textBaseline = 'middle';
    floats.forEach((f) => { g.globalAlpha = Math.min(1, f.t * 2); g.fillStyle = '#000'; g.fillText(f.text, f.x + 1, f.y + 2); g.fillStyle = f.color; g.fillText(f.text, f.x, f.y); });
    g.globalAlpha = 1;
  }
  let last = 0, lastHud = -1;
  function frame(ts) {
    const dt = last ? Math.min(0.05, (ts - last) / 1000) : 0; last = ts;
    update(dt, false);
    draw();
    const s = Math.ceil(run.time); if (s !== lastHud) { lastHud = s; hud(); }
    requestAnimationFrame(frame);
  }

  function padAt(ev) {
    const b = canvas.getBoundingClientRect();
    const c = Math.floor(((ev.clientX - b.left) / b.width) * 2), r = Math.floor(((ev.clientY - b.top) / b.height) * 2);
    return Math.max(0, Math.min(1, r)) * 2 + Math.max(0, Math.min(1, c));
  }
  canvas.addEventListener('pointerdown', (ev) => { ev.preventDefault(); showCur = false; tap(padAt(ev)); });
  document.addEventListener('keydown', (ev) => {
    if (run.state !== 'play' || ev.repeat) return;
    const ae = document.activeElement; if (ae && ae !== canvas && /^(BUTTON|A|INPUT)$/.test(ae.tagName)) return;
    const k = ev.key;
    if (/^[1-4]$/.test(k)) { cur = Number(k) - 1; tap(cur); ev.preventDefault(); return; }
    const mv = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[k];
    if (mv) { const c = Math.max(0, Math.min(1, (cur % 2) + mv[0])), r = Math.max(0, Math.min(1, Math.floor(cur / 2) + mv[1])); cur = r * 2 + c; showCur = true; ev.preventDefault(); }
    else if (k === 'Enter' || k === ' ') { showCur = true; tap(cur); ev.preventDefault(); }
  });
  // ?seed= takes a share code (A-Z0-9, any case) or the old seed form; anything invalid is ignored (a fresh seed)
  function urlSeed() {
    const raw = params.get('seed');
    const code = window.MMMiniKit ? window.MMMiniKit.parseSeedCode(raw || '') : null;
    return code || raw || undefined;
  }
  $('play').addEventListener('click', () => { save.hint = true; persist(); start(urlSeed()); });
  if (!window.MMMiniKit) { $('again').addEventListener('click', () => start()); $('replay').addEventListener('click', () => start(run.seed)); }
  const mute = $('btn-mute');
  function syncMute() { const m = !!(sfx && sfx.isMuted()); mute.textContent = m ? 'Sound off' : 'Sound on'; mute.setAttribute('aria-pressed', m ? 'true' : 'false'); }
  mute.addEventListener('click', () => { if (sfx) sfx.setMuted(!sfx.isMuted()); syncMute(); });
  syncMute();

  $('how').hidden = save.hint;
  $('play').textContent = save.hint ? 'Play' : 'Got it, play';
  rng = MMRng.create('echo-garden:preview'); makeSeq();
  medalList($('i-medals'));
  try { $('play').focus({ preventScroll: true }); } catch (e) { /* ignore */ }
  try { if (save.medals.length && window.MMHubProfile) MMHubProfile.sync(localStorage, 'echo', save.medals.slice()); } catch (e) { /* optional */ }
  hud();
  requestAnimationFrame(frame);

  window.__echo = {
    get run() { return run; }, get save() { return save; }, get reduced() { return reduced; }, get lowGfx() { return lowGfx; },
    seq: (n) => seq.slice(0, n || run.len), lit: () => lit.slice(),
    // test helper: sing the tune through to the input phase
    listen() { let n = 0; while (run.state === 'play' && run.phase !== 'input' && n++ < 2000) update(0.05, true); return run.phase; },
    tap, start, end, step(dt) { update(dt, true); },
    counts: () => ({ parts: parts.length, floats: floats.length }),
  };
}());
