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
    { name: 'Red tulip', c: '#ff004d', d: '#7e2553', hz: 262, shape: 'tulip' },
    { name: 'Sun daisy', c: '#ffec27', d: '#ab5236', hz: 330, shape: 'daisy' },
    { name: 'Blue bell', c: '#29adff', d: '#1d2b53', hz: 392, shape: 'bell' },
    { name: 'Star lily', c: '#ff77a8', d: '#7e2553', hz: 523, shape: 'star' },
  ];
  const $ = (id) => document.getElementById(id);
  const params = new URLSearchParams(location.search);
  const TEST = params.get('test') === '1';
  let reduced = false, lowGfx = false;
  try { reduced = (window.MMMotion ? MMMotion.reduced(window, localStorage) : false) || !!(window.MMSideAccess && MMSideAccess.reduced()); } catch (e) { reduced = false; }
  try { lowGfx = !!(window.MMAccess && MMAccess.prefs.load(localStorage).lowGfx); } catch (e) { lowGfx = false; }
  let sfx = null;
  try { sfx = window.MMSfx ? MMSfx.create({ storage: localStorage }) : null; } catch (e) { sfx = null; }
  const cues = []; // test aid: the last cue names asked of MMSfx
  const play = (n) => { cues.push(n); if (cues.length > 40) cues.shift(); try { if (sfx) sfx.play(n); } catch (e) { /* ignore */ } };
  // Flowers sing through MMChip's bloom_c/d/e/g (C D E G) cues; the old soft sine stays only as the fallback without MMChip.
  const BLOOM = ['bloom_c', 'bloom_d', 'bloom_e', 'bloom_g'];
  const hasChip = () => !!(window.MMChip && MMChip.SFX && MMChip.SFX.bloom_c && sfx);
  // Flower notes: a soft sine through the same mute switch as MMSfx (no context until a tap).
  let actx = null;
  function tone(i, dur) {
    if (hasChip()) { play(BLOOM[i]); return; }
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
    play('error');
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
    // seeds are canonical lower-case A-Z0-9 so the share code (upper case, no - or _) always sings the very same tune
    run.seed = (typeof seed === 'string' && /^[A-Za-z0-9_-]{1,24}$/.test(seed) && /[A-Za-z0-9]/.test(seed)) ? seed.toLowerCase().replace(/[^a-z0-9]/g, '') : newSeed();
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
    if (run.why === 'time' && run.wilts === 0 && run.best >= START_LEN) play('perfect'); // a whole calm round with no wilted leaf
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
  function ptext(str, x, y, scale, color, align) {
    if (window.MM8) { MM8.text(g, str, x, y, scale, color, { align: align || 'left' }); return; }
    g.font = 'bold ' + (8 * scale) + 'px monospace'; g.textAlign = align || 'left'; g.textBaseline = 'top'; g.fillStyle = color; g.fillText(str, x, y);
  }
  // 8-bit flower sprites, 13x13 art pixels: o ink outline, p petal, h petal highlight, c centre, w white petal
  const SPR = {
    tulip: ['..o.......o..', '.oho.ooo.oho.', '.ohpoohpoppo.', '.ohppohppppo.', '.ohpppppppo..', '.oppppppppo..', '.oppppppppo..', '..opppppppo..', '..oppppppo...', '...oppppo....', '....oooo.....', '.............', '.............'],
    daisy: ['....owo......', '..owowowo....', '.owwowowwo...', 'owwwocccowwo.', 'owwocccccowo.', '.ooccchccoo..', 'owwocccccowo.', 'owwwocccowwo.', '.owwowowwo...', '..owowowo....', '....owo......', '.............', '.............'],
    bell: ['.....oo......', '....ohpo.....', '...ohpppo....', '...ohpppo....', '..ohppppo....', '..ohpppppo...', '.ohppppppo...', '.ohpppppppo..', 'ohppppppppo..', 'oppopppoppo..', '.oo.oco.oo...', '.....o.......', '.............'],
    star: ['......o......', '.....oho.....', '.....ohpo....', 'oooooohpooooo', 'ohhpppcppppo.', '.ohpppcpppo..', '..oppcccppo..', '..oppppppo...', '.ohppoopppo..', '.oppo..oppo..', '.oo......oo..', '.............', '.............'],
  };
  const STEM = ['......o......', '.....ogo.....', '.oo..ogo..oo.', 'oggo.ogo.oggo', '.oggoogooggo.', '..ooogggooo..', '.....ogo.....', '.....ogo.....'];
  function sprite(rows, x, y, u, map) { for (let r = 0; r < rows.length; r++) for (let k = 0; k < rows[r].length; k++) { const c = map[rows[r][k]]; if (!c) continue; g.fillStyle = c; g.fillRect(x + k * u, y + r * u, u, u); } }
  function drawFlower(i) {
    const f = FLOWERS[i], p = PAD[i], on = lit[i] > 0, hint = hintT[i] > 0;
    const cx = p.x + p.w / 2, cy = p.y + p.h / 2 - 8;
    // bed: checker soil tiles with an ink frame (lights up when sung)
    const x0 = p.x + 4, y0 = p.y + 4, w0 = p.w - 8, h0 = p.h - 8;
    g.fillStyle = '#0b0d1a'; g.fillRect(x0, y0, w0, h0);
    g.fillStyle = on ? '#008751' : '#12142a'; g.fillRect(x0 + 4, y0 + 4, w0 - 8, h0 - 8);
    g.fillStyle = on ? '#00e436' : '#0b0d1a'; for (let yy = y0 + 4; yy < y0 + h0 - 8; yy += 8) for (let xx = x0 + 4 + ((yy - y0) / 8 & 1) * 8; xx < x0 + w0 - 8; xx += 16) g.fillRect(xx, yy, 4, 4);
    g.fillStyle = on ? f.c : '#5f574f'; g.fillRect(x0 + 4, y0 + 4, w0 - 8, 2); g.fillRect(x0 + 4, y0 + 4, 2, h0 - 8);
    if (hint) { g.fillStyle = '#ffec27'; for (let k = 0; k < 4; k++) { const hx = k % 2 ? x0 + w0 - 20 : x0 + 8, hy = k < 2 ? y0 + 8 : y0 + h0 - 20; g.fillRect(hx, hy, 12, 4); g.fillRect(k % 2 ? hx + 8 : hx, k < 2 ? hy : hy - 8, 4, 12); } }
    if (showCur && cur === i && run.state === 'play') { g.fillStyle = '#fff1e8'; g.fillRect(x0 + 6, y0 + 6, w0 - 12, 3); g.fillRect(x0 + 6, y0 + h0 - 9, w0 - 12, 3); g.fillRect(x0 + 6, y0 + 6, 3, h0 - 12); g.fillRect(x0 + w0 - 9, y0 + 6, 3, h0 - 12); }
    const u = on && !reduced ? 7 : 6;
    const col = on ? f.c : f.d;
    const map = { o: '#0b0d1a', p: col, h: on ? '#fff1e8' : f.c, c: on ? '#ffa300' : '#ab5236', w: on ? '#fff1e8' : '#c2c3c7', g: on ? '#00e436' : '#008751' };
    sprite(STEM, Math.round(cx - 6.5 * 4), Math.round(cy + 27), 4, map);
    sprite(SPR[f.shape] || SPR.star, Math.round(cx - 6 * u), Math.round(cy + 31 - 11 * u), u, map);
    if (on && !lowGfx) { g.fillStyle = '#fff1e8'; [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(([sx, sy]) => { g.fillRect(Math.round(cx + sx * 52), Math.round(cy + sy * 40), 4, 4); g.fillRect(Math.round(cx + sx * 52) - 4, Math.round(cy + sy * 40), 12, 4); g.fillRect(Math.round(cx + sx * 52), Math.round(cy + sy * 40) - 4, 4, 12); }); }
    // number label + name (never colour alone)
    g.fillStyle = '#0b0d1a'; g.fillRect(p.x + 10, p.y + 10, 22, 26);
    ptext(String(i + 1), p.x + 14, p.y + 13, 3, on ? '#ffec27' : '#fff1e8');
    ptext(f.name.toUpperCase(), Math.round(cx), p.y + p.h - 26, 2, on ? '#fff1e8' : '#c2c3c7', 'center');
  }
  function draw() {
    g.setTransform(1, 0, 0, 1, 0, 0); g.imageSmoothingEnabled = false;
    g.fillStyle = '#0b0d1a'; g.fillRect(0, 0, CW, CH);
    for (let i = 0; i < 4; i++) drawFlower(i);
    // the tune so far: pixel notes (filled = echoed)
    if (run.state === 'play') {
      const n = run.len, w = Math.max(4, Math.floor(Math.min(14, (CW - 40) / n) / 2) * 2), x0 = Math.round(CW / 2 - (n * w) / 2);
      g.fillStyle = '#0b0d1a'; g.fillRect(x0 - 4, CH / 2 - 8, n * w + 8, 16);
      for (let k = 0; k < n; k++) { g.fillStyle = (run.phase === 'input' ? k < run.pos : k < run.showI) ? '#ffec27' : '#5f574f'; g.fillRect(x0 + k * w + 1, CH / 2 - 4, w - 2, 8); }
    }
    // leaves left (colour + shape + count: a full green leaf, a grey bare stalk once wilted)
    if (run.state === 'play') for (let k = 0; k < LEAVES; k++) { const lx = Math.round(CW / 2 - (LEAVES * 18) / 2) + k * 18, ly = CH / 2 - 26, ok = k < run.leaves; g.fillStyle = '#0b0d1a'; g.fillRect(lx, ly, 14, 10); g.fillStyle = ok ? '#00e436' : '#5f574f'; g.fillRect(lx + 2, ok ? ly + 2 : ly + 6, 10, ok ? 6 : 2); if (ok) { g.fillStyle = '#008751'; g.fillRect(lx + 6, ly + 2, 2, 6); } }
    parts.forEach((p) => { g.fillStyle = p.t < 0.15 ? '#5f574f' : p.c; g.fillRect(Math.round(p.x / 2) * 2 - 3, Math.round(p.y / 2) * 2 - 3, 6, 6); });
    g.globalAlpha = 1;
    floats.forEach((f) => { ptext(String(f.text).toUpperCase(), Math.round(f.x), Math.round(f.y) - 7, 2, f.t < 0.15 ? '#c2c3c7' : f.color, 'center'); });
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
  canvas.addEventListener('pointerdown', (ev) => { if (ev.button > 0) return; ev.preventDefault(); showCur = false; tap(padAt(ev)); });
  // Keys: 1-4 tap a flower; MMInput actions (arrows / WASD move the cursor, Enter / Space tap) are the universal aliases.
  const actionOf = (ev) => (window.MMInput ? MMInput.actionOf(ev) : ({ ArrowLeft: 'left', ArrowRight: 'right', ArrowUp: 'up', ArrowDown: 'down', Enter: 'primary', ' ': 'primary' }[ev.key] || null));
  document.addEventListener('keydown', (ev) => {
    if (run.state !== 'play' || ev.repeat || ev.ctrlKey || ev.metaKey || ev.altKey) return;
    if (window.MMInput && MMInput.isTyping(ev.target)) return;
    const ae = document.activeElement; if (ae && ae !== canvas && /^(BUTTON|A|INPUT|SELECT|TEXTAREA)$/.test(ae.tagName)) return;
    const k = ev.key;
    if (/^[1-4]$/.test(k)) { cur = Number(k) - 1; tap(cur); ev.preventDefault(); return; }
    const act = actionOf(ev);
    const mv = { left: [-1, 0], right: [1, 0], up: [0, -1], down: [0, 1] }[act];
    if (mv) { const c = Math.max(0, Math.min(1, (cur % 2) + mv[0])), r = Math.max(0, Math.min(1, Math.floor(cur / 2) + mv[1])); cur = r * 2 + c; showCur = true; ev.preventDefault(); }
    else if (act === 'primary') { showCur = true; tap(cur); ev.preventDefault(); }
  });
  // coming back to the tab: no catch-up jump (frame() already caps dt), and let go of any half-held state
  document.addEventListener('visibilitychange', () => { last = 0; });
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
  // Settings (shared panel): the Menu sheet's Settings entry opens it; live changes re-read sound / motion / low graphics
  let settings = null;
  try { if (window.MMSettings) settings = MMSettings.mount({ page: 'echo' }); } catch (e) { settings = null; }
  try { if (settings && window.MMNav && MMNav.onSettings) MMNav.onSettings(() => settings.open()); } catch (e) { /* optional */ }
  window.addEventListener('mm-settings-change', () => {
    try { if (window.MMMotion) reduced = MMMotion.reduced(window, localStorage) || !!(window.MMSideAccess && MMSideAccess.reduced()); } catch (e) { /* keep */ }
    try { if (window.MMAccess) lowGfx = !!MMAccess.prefs.load(localStorage).lowGfx; } catch (e) { /* keep */ }
    try { const m = localStorage.getItem('mm-sfx-muted'); if (sfx && m !== null) sfx.setMuted(m === '1'); } catch (e) { /* keep */ }
    syncMute();
  });

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
    cues: () => cues.slice(), settings: () => settings,
    counts: () => ({ parts: parts.length, floats: floats.length }),
  };
}());
