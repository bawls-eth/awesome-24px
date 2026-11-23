// Lantern Dash: a one-button night run. Tap (or Space) to jump, hold for a higher jump. Jump LATE, just before a rock,
// for a Perfect: perfects in a row build a combo that multiplies the bonus. Fireflies are worth 10.
// The course is seeded (MMRng) and the simulation is a fixed 60 Hz step, so a run replays exactly from its inputs:
// "Play again" runs the same course against the ghost of your best run on it; "New course" rolls a new seed.
// Own keys only: `pixeltown-dash-v1` (save, ghost) and `pixeltown-medals-dash-v1` (hub medal summary). No network.
(function () {
  'use strict';
  const KEY = 'pixeltown-dash-v1', MKEY = 'pixeltown-medals-dash-v1';
  const VW = 360, VH = 240, GROUND = 200, PX = 70, STEP = 1 / 60;
  // PV 2 (second pass): gentler first 20 s, a little more coyote time and a longer input buffer. Ghosts recorded with the
  // old physics (no pv) no longer replay in sync, so they are not raced; they are replaced by the next run on that course.
  const JUMP_V = 440, GRAV = 1500, GRAV_HOLD = 820, COYOTE = 6, BUFFER = 8, PERFECT_S = 0.2, PV = 2, NEAR = 8;
  const MEDALS = [
    ['run1', 'First run', 'Finish a run'],
    ['m500', '500 m', 'Run 500 m'],
    ['perfect10', '10x perfect', 'Chain 10 perfect jumps'],
    ['m1500', '1,500 m', 'Run 1,500 m'],
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
  const SEED_RE = /^[A-Za-z0-9_-]{1,24}$/;

  // ---------- save ----------
  const int = (x, hi) => (typeof x === 'number' && isFinite(x) && x >= 0 ? Math.min(hi, Math.floor(x)) : 0);
  function cleanGhost(gh) {
    if (!gh || typeof gh !== 'object' || typeof gh.seed !== 'string' || !SEED_RE.test(gh.seed) || !Array.isArray(gh.in)) return null;
    const ins = gh.in.slice(0, 4000).filter((p) => Array.isArray(p) && p.length === 2 && p.every((n) => typeof n === 'number' && isFinite(n) && n >= 0 && n < 1e6)).map((p) => [Math.floor(p[0]), Math.floor(p[1])]);
    return { seed: gh.seed, in: ins, dist: int(gh.dist, 1e7), pv: int(gh.pv, 99) };
  }
  function load() {
    let o = null;
    try { const s = localStorage.getItem(KEY); if (typeof s === 'string' && s.length < 120000) o = JSON.parse(s); } catch (e) { o = null; }
    if (!o || typeof o !== 'object' || Array.isArray(o)) o = {};
    const ok = MEDALS.map((m) => m[0]);
    return { v: 1, hint: o.hint === true, best: int(o.best, 1e7), bestScore: int(o.bestScore, 1e9), bestCombo: int(o.bestCombo, 1e4), runs: int(o.runs, 1e9),
      medals: Array.isArray(o.medals) ? o.medals.filter((m, i, a) => ok.indexOf(m) >= 0 && a.indexOf(m) === i) : [], ghost: cleanGhost(o.ghost) };
  }
  let save = load();
  const hubSync = () => { try { if (window.MMHubProfile && MMHubProfile.sync) MMHubProfile.sync(localStorage, 'dash', save.medals.slice()); } catch (e) { /* hub map progress is optional */ } };
  if (save.medals.length) hubSync(); // medals won before the arcade map group existed reach the Hub map too
  function persist() {
    try { localStorage.setItem(KEY, JSON.stringify(save)); localStorage.setItem(MKEY, JSON.stringify({ v: 1, m: save.medals.slice() })); } catch (e) { /* ignore */ }
    hubSync();
  }
  function award(id) { if (save.medals.indexOf(id) >= 0) return false; save.medals.push(id); run.newMedals.push(id); persist(); play('claim'); return true; }

  // ---------- course (seeded) ----------
  // gentle warm-up: +2 px/s per second for the first 20 s (140 -> 180), then the old +3.2 ramp up to the 330 cap
  const speedAt = (f) => { const t = f * STEP; return Math.min(330, t < 20 ? 140 + t * 2 : 180 + (t - 20) * 3.2); };
  function course(seed) {
    const rng = MMRng.create('lantern-dash:' + seed), obs = [], flies = [];
    let x = 520, n = 0;
    while (x < 400000) {
      const sp = Math.min(330, 140 + (x / 200) * 1.2);
      const k = n < 3 ? 0 : rng.next();
      let ob;
      if (n < 3 || k < 0.45) ob = { t: 'rock', x, w: 18 + rng.int(0, 6), h: 18 + rng.int(0, 6) };
      else if (k < 0.72) ob = { t: 'tall', x, w: 22, h: 40 + rng.int(0, 8) };
      else ob = { t: 'gap', x, w: 42 + rng.int(0, Math.min(40, Math.floor(sp / 7))), h: 0 };
      obs.push(ob);
      if (rng.next() < 0.55) flies.push({ x: ob.x + ob.w / 2, y: GROUND - 70 - rng.int(0, 20), got: false });
      // later on: twin rocks (one long held jump clears both) and tighter spacing
      if (n > 20 && ob.t === 'rock' && rng.next() < Math.min(0.35, n / 300)) { const o2 = { t: 'rock', x: ob.x + ob.w + 26 + rng.int(0, 10), w: 18, h: 20 }; obs.push(o2); ob = o2; }
      const gapS = (n < 3 ? 1.6 : Math.max(0.5, 0.8 - n * 0.002)) + rng.next() * Math.max(0.45, 0.9 - n * 0.003);
      x = ob.x + ob.w + sp * gapS;
      n++;
    }
    return { obs, flies };
  }

  // ---------- simulation (shared by the player and the ghost) ----------
  function body() { return { y: GROUND, vy: 0, ground: true, air: 0, buf: 0, held: false, dead: false, toX: -1e9, jumps: 0 }; }
  function overGap(c, wx) {
    for (let i = c.lo; i < c.obs.length; i++) { const o = c.obs[i]; if (o.x > wx + 8) break; if (o.t === 'gap' && wx - 5 > o.x && wx + 5 < o.x + o.w) return true; }
    return false;
  }
  function hitRock(c, wx, y) {
    for (let i = c.lo; i < c.obs.length; i++) {
      const o = c.obs[i]; if (o.x > wx + 10) break;
      if (o.t !== 'gap' && wx + 7 > o.x + 2 && wx - 7 < o.x + o.w - 2 && y > GROUND - o.h + 3) return o;
    }
    return null;
  }
  // standing on a rock top (after a forgiving landing): the rock under the feet, if any
  function rockUnder(c, wx, y) {
    for (let i = c.lo; i < c.obs.length; i++) {
      const o = c.obs[i]; if (o.x > wx + 10) break;
      if (o.t !== 'gap' && wx + 7 > o.x + 2 && wx - 7 < o.x + o.w - 2 && Math.abs(y - (GROUND - o.h)) < 0.5) return o;
    }
    return null;
  }
  // one fixed step; returns 'jump' | 'land' | null
  function stepBody(b, c, wx, sp) {
    if (b.dead) return null;
    let ev = null;
    if (b.buf > 0) b.buf--;
    const canJump = b.ground || b.air <= COYOTE;
    if (b.buf > 0 && canJump && b.vy >= 0) { b.vy = -JUMP_V; b.ground = false; b.air = COYOTE + 1; b.buf = 0; b.toX = wx; b.jumps++; ev = 'jump'; }
    const gap = overGap(c, wx);
    if (!b.ground || gap) {
      b.vy += (b.held && b.vy < 0 ? GRAV_HOLD : GRAV) * STEP;
      b.y += b.vy * STEP;
      b.air++;
      if (!gap && b.y >= GROUND && b.vy > 0) { b.y = GROUND; b.vy = 0; b.ground = true; b.air = 0; ev = 'land'; }
      else if (gap && b.y >= GROUND) b.ground = false;
    }
    if (b.ground && gap) { b.ground = false; }
    // ran off the end of a rock top: fall back down (coyote time still applies)
    if (b.ground && b.y < GROUND - 0.5 && !rockUnder(c, wx, b.y)) { b.ground = false; b.air = 1; }
    if (b.y > GROUND + 40) b.dead = 'fell';
    const o = hitRock(c, wx, b.y);
    // forgiving landing: coming down (or stepping) with the feet in the top 12 px of a rock (one fast frame of fall) lands on it instead of a crash
    if (o && b.vy >= 0 && b.y - (GROUND - o.h) <= 12) { b.y = GROUND - o.h; b.vy = 0; if (!b.ground) ev = 'land'; b.ground = true; b.air = 0; b.perch = (b.perch || 0) + 1; }
    else if (o) b.dead = 'rock';
    return ev;
  }
  function press(b) { b.held = true; b.buf = BUFFER; }
  function release(b) { b.held = false; }

  // ---------- run state ----------
  const canvas = $('view'), g = canvas.getContext('2d');
  canvas.width = VW; canvas.height = VH; g.imageSmoothingEnabled = false;
  const run = { state: 'ready', seed: '', f: 0, wx: 0, dist: 0, flies: 0, combo: 0, bestCombo: 0, perfects: 0, bonus: 0, score: 0, newMedals: [], ins: [], open: -1, near: 0 };
  let C = null, P = body(), G = null, ghostIn = null, gi = 0, ghostC = null;
  let parts = [], floats = [], shake = 0, flash = 0, acc = 0, ghostTag = false;

  function newSeed() { return (Date.now().toString(36) + (save.runs % 1296).toString(36)).slice(-8); }
  function start(seed) {
    run.seed = (typeof seed === 'string' && SEED_RE.test(seed)) ? seed : newSeed();
    const built = course(run.seed);
    C = { obs: built.obs, flies: built.flies, lo: 0, next: 0 };
    Object.assign(run, { state: 'play', f: 0, wx: 0, dist: 0, flies: 0, combo: 0, bestCombo: 0, perfects: 0, bonus: 0, score: 0, newMedals: [], ins: [], open: -1, near: 0 });
    built.obs.forEach((o) => { o.clr = 1e9; });
    P = body(); parts = []; floats = []; shake = 0; acc = 0;
    if (save.ghost && save.ghost.seed === run.seed && save.ghost.pv === PV) {
      G = body(); ghostIn = save.ghost.in; gi = 0;
      ghostC = { obs: built.obs, lo: 0 };
    } else { G = null; ghostIn = null; ghostC = null; }
    $('intro').hidden = true; $('result').hidden = true;
    $('jump').textContent = 'Jump (hold = higher)';
    msg(G ? 'Race your ghost: best ' + save.ghost.dist + ' m on this course.' : 'Tap to jump. Jump late for a Perfect!');
    hud();
  }
  const msg = (t) => { $('msg').textContent = t; };
  let endAt = 0, rearm = false;
  function down() {
    // after a crash the same button runs the course again (a short pause stops a mashed jump from skipping the result)
    physDown = true;
    if (run.state === 'over' && rearm && performance.now() - endAt > 700) { start(run.seed); return; }
    if (run.state !== 'play') return;
    if (run.open < 0) { run.open = run.f; press(P); }
  }
  let physDown = false;
  function closeInput() {
    if (run.open >= 0) { run.ins.push([run.open, Math.max(run.f, run.open + 1)]); run.open = -1; }
    release(P);
  }
  function up() {
    physDown = false;
    closeInput();
    if (run.state === 'over') rearm = true;
  }
  function burst(x, y, color, n, up) {
    n = lowGfx ? Math.min(4, n) : n;
    for (let i = 0; i < n; i++) {
      const a = (up ? -Math.PI / 2 : 0) + (i / n - 0.5) * (up ? 2 : 6.28), sp = 40 + (i * 53) % 110;
      parts.push({ x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, t: 0.45 + (i % 3) * 0.1, c: color });
    }
    if (parts.length > 160) parts.splice(0, parts.length - 160);
  }
  function tick() {
    const f = run.f, sp = speedAt(f);
    // ghost inputs replay on the same frame numbers
    if (G && !G.dead) {
      while (gi < ghostIn.length && ghostIn[gi][0] === f) { press(G); gi++; }
      for (let i = Math.max(0, gi - 2); i < gi; i++) if (ghostIn[i][1] === f) release(G);
      stepBody(G, ghostC, run.wx, sp);
    }
    const ev = stepBody(P, C, run.wx, sp);
    // near miss: the closest the hero's feet came to the top of the rock being passed
    for (let i = C.next; i < C.obs.length; i++) {
      const o = C.obs[i]; if (o.x > run.wx + 8) break;
      if (o.t !== 'gap' && run.wx + 7 > o.x && run.wx - 7 < o.x + o.w) o.clr = Math.min(o.clr, (GROUND - o.h) - P.y);
    }
    if (ev === 'jump') { play('ui_tap'); burst(PX, GROUND, '#c9b48a', 6, true); }
    if (ev === 'land') burst(PX, GROUND, '#c9b48a', 4, true);
    // cleared obstacles: perfect = took off within PERFECT_S of the obstacle's front edge
    while (C.next < C.obs.length && C.obs[C.next].x + C.obs[C.next].w < run.wx - 8) {
      const o = C.obs[C.next]; C.next++;
      if (o.t !== 'gap' && o.clr > 0 && o.clr < NEAR && !P.dead) {
        run.near++;
        if (!lowGfx && !reduced) burst(PX, P.y - 4, '#bff4ff', 6, true); else burst(PX, P.y - 4, '#bff4ff', 2, true);
        floats.push({ x: PX + 4, y: P.y - 44, text: 'close!', color: '#bff4ff', t: 0.6 });
      }
      const lead = (o.x - (P.toX + 8)) / sp;
      if (P.toX > -1e8 && lead >= -0.02 && lead <= PERFECT_S) {
        run.combo++; run.perfects++; run.bonus += 5 * run.combo;
        if (run.combo > run.bestCombo) run.bestCombo = run.combo;
        floats.push({ x: PX, y: P.y - 30, text: 'Perfect' + (run.combo > 1 ? ' x' + run.combo : ''), color: '#ffd166', t: 0.8 });
        play('pickup'); flash = 0.12;
        if (run.combo >= 10) award('perfect10');
      } else {
        if (run.combo >= 3) floats.push({ x: PX, y: P.y - 30, text: 'combo ended', color: '#a7b4d4', t: 0.7 });
        run.combo = 0;
      }
    }
    while (C.lo < C.obs.length && C.obs[C.lo].x + C.obs[C.lo].w < run.wx - 200) C.lo++;
    if (ghostC) ghostC.lo = C.lo;
    // fireflies
    for (let i = 0; i < C.flies.length; i++) {
      const fl = C.flies[i]; if (fl.x > run.wx + 20) break; if (fl.got || fl.x < run.wx - 20) continue;
      if (Math.abs(fl.x - run.wx) < 16 && Math.abs(fl.y - (P.y - 14)) < 22) { fl.got = true; run.flies++; burst(PX, fl.y, '#fff27a', 8, false); floats.push({ x: PX + 10, y: fl.y - 10, text: '+10', color: '#fff27a', t: 0.6 }); play('pickup'); }
    }
    run.wx += sp * STEP; run.f++;
    run.dist = Math.floor(run.wx / 10);
    run.score = run.dist + run.flies * 10 + run.bonus;
    if (run.dist >= 500) award('m500');
    if (run.dist >= 1500) award('m1500');
    if (P.dead) end();
  }
  function end() {
    if (run.state !== 'play') return;
    closeInput();
    run.state = 'over';
    endAt = performance.now(); rearm = !physDown;
    $('jump').textContent = 'Run again';
    save.runs++;
    const prevBest = save.best, prevScore = save.bestScore, prevCombo = save.bestCombo;
    const newBest = run.dist > save.best;
    if (newBest) save.best = run.dist;
    if (run.score > save.bestScore) save.bestScore = run.score;
    if (run.bestCombo > save.bestCombo) save.bestCombo = run.bestCombo;
    if (!save.ghost || save.ghost.seed !== run.seed || save.ghost.pv !== PV || run.dist > save.ghost.dist) save.ghost = { seed: run.seed, in: run.ins.slice(0, 4000), dist: run.dist, pv: PV };
    award('run1');
    persist();
    play('hurt');
    if (!reduced) shake = 8;
    burst(PX, P.y - 10, '#ffb347', 16, false);
    run.why = P.dead === 'fell' ? 'gap' : P.ground ? 'nojump' : P.vy > 0 ? 'early' : 'late';
    const whyText = {
      gap: 'Into a gap: hold the button for a longer jump.',
      nojump: 'Bumped a rock: tap to jump just before it (late is Perfect).',
      early: 'Came down on the rock: that jump was a touch early. Wait until it is close.',
      late: 'Clipped the rock on the way up: jump a little earlier, but late is Perfect.',
    }[run.why] + ' Press R or tap Run again to retry this course.';
    showResult(newBest, prevBest, prevScore, prevCombo, whyText);
    $('result').hidden = false;
    msg('');
    if (resCard) resCard.focus(); else $('again').focus({ preventScroll: true });
    hud();
  }
  // MK1: the shared result card (MMMiniKit); ids r-dist / r-best / r-why / r-line / r-new / r-medals / again / fresh kept.
  // Play again already runs the same course (with the ghost), so there is no separate Replay seed button here.
  const rMedals = $('r-medals');
  let resCard = null;
  function showResult(newBest, prevBest, prevScore, prevCombo, whyText) {
    medalList(rMedals);
    const lines = [
      { id: 'r-best', text: newBest ? 'New personal best!' : 'Best: ' + save.best + ' m', cls: newBest ? 'new' : 'dim' },
      { id: 'r-why', text: whyText, cls: '' },
      { id: 'r-line', text: 'Score ' + run.score + ' / ' + run.flies + ' fireflies / best combo x' + run.bestCombo + ' / course ' + run.seed, cls: 'dim' },
      { id: 'r-new', text: run.newMedals.length ? 'New medal: ' + run.newMedals.map((m) => MEDALS.find((x) => x[0] === m)[1]).join(', ') : '', cls: 'new' },
    ];
    if (!window.MMMiniKit) {
      $('r-dist').textContent = String(run.dist); lines.forEach((l) => { $(l.id).textContent = l.text; $(l.id).className = l.cls; });
      return;
    }
    const K = window.MMMiniKit;
    const m = MEDALS.find((x) => save.medals.indexOf(x[0]) < 0);
    resCard = K.panel($('result'), K.result({
      headline: [{ text: String(run.dist), id: 'r-dist' }, ' m'],
      stats: [
        { label: 'Distance', value: run.dist + ' m', best: newBest && prevBest > 0 },
        { label: 'Score', value: K.fmt(run.score), best: run.score > prevScore && prevScore > 0 },
        { label: 'Best combo', value: 'x' + run.bestCombo, best: run.bestCombo > prevCombo && prevCombo > 0 },
      ],
      lines,
      goalText: m ? 'Goal: ' + m[2] : 'All medals won. Beat your ghost!',
      seed: run.seed, replay: false,
      more: [{ id: 'fresh', label: 'New course' }],
      menuHref: '../../index.html',
      ids: { again: 'again', code: 'r-code', copy: 'r-copy', goal: 'r-goal' },
    }), { again: () => start(run.seed), more: [() => start()], extra: [rMedals], keyReady: () => performance.now() - endAt > 700 });
  }
  function medalList(ul) {
    while (ul.firstChild) ul.removeChild(ul.firstChild);
    MEDALS.forEach((m) => { const li = document.createElement('li'); const on = save.medals.indexOf(m[0]) >= 0; li.className = on ? 'on' : ''; li.textContent = (on ? '★ ' : '☆ ') + m[1]; li.title = m[2]; ul.appendChild(li); });
  }
  function hud() {
    $('h-dist').textContent = run.dist + ' m';
    $('h-combo').textContent = 'x' + run.combo;
    $('h-best').textContent = save.best + ' m';
    const m = MEDALS.find((x) => save.medals.indexOf(x[0]) < 0);
    $('goal').textContent = m ? 'Goal: ' + m[2] : 'All medals won. Beat your ghost!';
  }

  // ---------- draw (static layers baked once) ----------
  const sky = document.createElement('canvas'); sky.width = VW; sky.height = VH;
  // 8-bit text: MM8 5x7 bitmap font when loaded, monospace fallback otherwise
  function ptext(str, x, y, scale, color, align) {
    if (window.MM8) { MM8.text(g, str, x, y, scale, color, { align: align || 'left' }); return; }
    g.font = (8 * scale) + 'px monospace'; g.textAlign = align || 'left'; g.textBaseline = 'top'; g.fillStyle = color; g.fillText(str, x, y); g.textAlign = 'left';
  }
  // 8-bit night sky (MM8 palette): stepped colour bands with dithered seams, 2 px stars, a pixel moon; baked once
  (function bake() {
    const s = sky.getContext('2d');
    const bands = ['#0b0d1a', '#0b0d1a', '#12142a', '#12142a', '#1d2b53', '#1d2b53', '#7e2553'];
    const bh = 22; bands.forEach((c, i) => { s.fillStyle = c; s.fillRect(0, i * bh, VW, i === bands.length - 1 ? VH : bh); });
    for (let i = 1; i < bands.length; i++) { s.fillStyle = bands[i]; for (let x = (i % 2) * 2; x < VW; x += 4) s.fillRect(x, i * bh - 2, 2, 2); }
    const r = MMRng.create('dash-sky');
    for (let i = 0; i < 60; i++) { const big = r.next() < 0.2, x = r.int(0, VW) & ~1, y = r.int(0, 130) & ~1;
      s.fillStyle = big ? '#fff1e8' : '#83769c'; s.fillRect(x, y, 2, 2);
      if (big && i % 3 === 0) { s.fillStyle = '#c2c3c7'; s.fillRect(x - 2, y, 2, 2); s.fillRect(x + 2, y, 2, 2); s.fillRect(x, y - 2, 2, 2); s.fillRect(x, y + 2, 2, 2); } }
    const moon = ['..####..', '.###....', '###.....', '###.....', '###.....', '###.....', '.###....', '..####..'];
    moon.forEach((row, y) => { for (let x = 0; x < row.length; x++) if (row[x] === '#') { s.fillStyle = x < 2 ? '#fff1e8' : '#ffccaa'; s.fillRect(290 + x * 3, 28 + y * 3, 3, 3); } });
  }());
  // stepped parallax hills: 8 px columns with blocky heights (no smooth curves)
  function hills(off, col, h, wave, cap) {
    const step = 8, o = Math.floor(off), shift = ((o % step) + step) % step;
    for (let x = -shift; x <= VW; x += step) {
      const wxp = x + o;
      const top = Math.round((GROUND - h - Math.sin(wxp / wave) * h * 0.5 - Math.sin(wxp / (wave * 0.37)) * 6) / 4) * 4;
      g.fillStyle = col; g.fillRect(x, top, step, GROUND - top);
      if (cap) { g.fillStyle = cap; g.fillRect(x, top, step, 2); }
    }
  }
  // runner sprite (12x15 art pixels at 2 px, 2 frames): hooded lantern-bearer, ink outline
  const RUN = [
    ['....hhhh....', '...hhhhhh...', '..ohffffho..', '..offeffeo..', '..offfffffo.', '...occcco...', '..occcccco.L', '.occcccccoLY', '.occcccccoLY', '..occcccco.L', '...oo..oo...', '...ll..ll...', '...ll...ll..', '..ll....ll..', '..oo....oo..'],
    ['....hhhh....', '...hhhhhh...', '..ohffffho..', '..offeffeo..', '..offfffffo.', '...occcco...', '..occcccco.L', '.occcccccoLY', '.occcccccoLY', '..occcccco.L', '....oooo....', '....llll....', '.....ll.....', '....ll.l....', '....oo.oo...'],
  ];
  const HERO_COL = { h: '#ab5236', f: '#ffccaa', e: '#0b0d1a', o: '#0b0d1a', c: '#7e2553', l: '#1d2b53', L: '#ffa300', Y: '#ffec27' };
  const GHOST_COL = { h: '#29adff', f: '#c2c3c7', e: '#1d2b53', o: '#1d2b53', c: '#29adff', l: '#1d2b53', L: '#c2c3c7', Y: '#fff1e8' };
  function hero(x, y, f, ghost, airborne) {
    g.save(); g.globalAlpha = ghost ? 0.45 : 1;
    const fr = airborne ? RUN[1] : RUN[(Math.floor(f / 6) % 2)], map = ghost ? GHOST_COL : HERO_COL;
    const ox = Math.round(x) - 12, oy = Math.round(y) - 30;
    for (let r = 0; r < fr.length; r++) for (let i = 0; i < fr[r].length; i++) { const c = map[fr[r][i]]; if (!c) continue; g.fillStyle = c; g.fillRect(ox + i * 2, oy + r * 2, 2, 2); }
    g.restore();
  }
  function draw() {
    g.setTransform(1, 0, 0, 1, 0, 0);
    if (shake > 0) g.translate((run.f % 2 ? 1 : -1) * shake * 0.5, 0);
    g.drawImage(sky, 0, 0);
    const wx = run.wx;
    hills(wx * 0.15, '#2a2f63', 34, 60, '#83769c');
    hills(wx * 0.4 + 300, '#1d2b53', 20, 34, '#2a2f63');
    // ground: grass lip + brick-like dirt that scrolls with the world
    g.fillStyle = '#ab5236'; g.fillRect(0, GROUND, VW, VH - GROUND);
    const gs = -((wx | 0) % 16);
    g.fillStyle = '#7e2553'; for (let x = gs; x < VW; x += 16) { g.fillRect(x, GROUND + 8, 2, 8); g.fillRect(x + 8, GROUND + 18, 2, 10); g.fillRect(x + 4, GROUND + 30, 2, 10); }
    g.fillRect(0, GROUND + 16, VW, 2); g.fillRect(0, GROUND + 28, VW, 2);
    g.fillStyle = '#00e436'; g.fillRect(0, GROUND, VW, 4);
    g.fillStyle = '#008751'; g.fillRect(0, GROUND + 4, VW, 2); for (let x = gs; x < VW; x += 8) g.fillRect(x, GROUND + 6, 2, 2);
    g.fillStyle = '#00e436'; for (let x = gs + 4; x < VW; x += 16) g.fillRect(x, GROUND - 2, 2, 2);
    if (C) {
      for (let i = C.lo; i < C.obs.length; i++) {
        const o = C.obs[i], sx = o.x - wx + PX; if (sx > VW + 10) break; if (sx + o.w < -10) continue;
        if (o.t === 'gap') { const gx0 = Math.round(sx); g.fillStyle = '#0b0d1a'; g.fillRect(gx0, GROUND, o.w, VH - GROUND);
          g.fillStyle = '#1d2b53'; for (let y = GROUND + 6; y < VH; y += 8) g.fillRect(gx0 + 2, y, 2, 2); }
        else {
          // pixel rock: ink outline, stepped top corners, light/dark bevel, crack pixels
          const rx = Math.round(sx), ry = GROUND - o.h, base = o.t === 'tall' ? '#5f574f' : '#83769c', lit = o.t === 'tall' ? '#83769c' : '#c2c3c7';
          g.fillStyle = '#0b0d1a'; g.fillRect(rx - 2, ry + 2, o.w + 4, o.h - 2); g.fillRect(rx, ry, o.w, 2);
          g.fillStyle = base; g.fillRect(rx + 2, ry + 2, o.w - 4, o.h - 2); g.fillRect(rx, ry + 4, o.w, o.h - 4);
          g.fillStyle = lit; g.fillRect(rx + 2, ry + 4, Math.max(2, Math.floor(o.w * 0.2) * 2), 2); g.fillRect(rx + 2, ry + 4, 2, Math.max(2, o.h - 8));
          g.fillStyle = '#1d2b53'; g.fillRect(rx + o.w - 4, ry + 4, 2, o.h - 4); g.fillRect(rx + Math.floor(o.w / 2), ry + 8, 2, 4); g.fillRect(rx + Math.floor(o.w / 2) + 2, ry + 12, 2, 2);
        }
      }
      for (let i = 0; i < C.flies.length; i++) {
        const fl = C.flies[i], sx = fl.x - wx + PX; if (sx > VW + 10) break; if (fl.got || sx < -10) continue;
        // firefly: plus-shaped pixel sprite; blink is a 2-step palette swap (steady under reduced motion)
        const on = reduced || ((run.f + i * 13) >> 3) % 3 !== 0, fx0 = Math.round(sx), fy0 = Math.round(fl.y);
        if (!lowGfx) { g.fillStyle = on ? '#ffa300' : '#ab5236'; g.fillRect(fx0 - 5, fy0 - 1, 10, 2); g.fillRect(fx0 - 1, fy0 - 5, 2, 10); }
        g.fillStyle = on ? '#ffec27' : '#ffa300'; g.fillRect(fx0 - 3, fy0 - 3, 6, 6);
        g.fillStyle = '#fff1e8'; g.fillRect(fx0 - 1, fy0 - 1, 2, 2);
      }
    }
    // best-distance flag (any course) and the ghost (same course)
    const bx = save.best * 10 - wx + PX;
    if (save.best > 0 && bx > -10 && bx < VW + 10) { const b0 = Math.round(bx); g.fillStyle = '#ffa300'; g.fillRect(b0, GROUND - 46, 2, 46); g.fillRect(b0 + 2, GROUND - 46, 14, 10); g.fillStyle = '#ffec27'; g.fillRect(b0 + 2, GROUND - 46, 14, 2); ptext('BEST', b0 + 2, GROUND - 56, 1, '#fff1e8'); }
    // the ghost's finish line on this course (cyan) and a small tag over the ghost once it moves apart from you
    if (G && save.ghost) {
      const gx = save.ghost.dist * 10 - wx + PX;
      if (gx > -10 && gx < VW + 10) { const g0 = Math.round(gx); g.fillStyle = '#29adff'; g.fillRect(g0, GROUND - 46, 2, 46); g.fillRect(g0 + 2, GROUND - 46, 14, 10); g.fillStyle = '#fff1e8'; g.fillRect(g0 + 2, GROUND - 46, 14, 2); ptext('GHOST', g0 + 2, GROUND - 56, 1, '#fff1e8'); }
    }
    ghostTag = false;
    if (G && !G.dead) {
      hero(PX, G.y, run.f, true, !G.ground);
      { const gy = Math.round(G.y); g.save(); g.globalAlpha = 0.8; g.fillStyle = '#29adff'; [[-14, -34], [10, -34], [-14, 0], [10, 0]].forEach(([dx, dy]) => g.fillRect(PX + dx, gy + dy, 4, 2)); g.restore(); }
      if (Math.abs(G.y - P.y) > 6 || run.f < 120) { ghostTag = true; ptext('GHOST', PX, Math.round(G.y) - 44, 1, '#29adff', 'center'); }
    }
    if (!lowGfx) {
      // lantern glow: a dithered pixel disc plus a stepped core (no smooth gradient)
      const lx = PX + 10, ly = Math.round(P.y) - 15;
      g.fillStyle = 'rgba(255,163,0,0.10)';
      for (let dy = -28; dy <= 28; dy += 4) { const w = Math.round(Math.sqrt(784 - dy * dy) / 4) * 4; for (let dx = -w + ((dy / 4) & 1) * 4; dx < w; dx += 8) g.fillRect(lx + dx, ly + dy, 4, 4); }
      g.fillStyle = 'rgba(255,236,39,0.14)'; g.fillRect(lx - 16, ly - 12, 32, 24); g.fillRect(lx - 12, ly - 16, 24, 32);
    }
    if (!(P.dead && run.state === 'over' && P.y > GROUND + 30)) hero(PX, P.y, run.f, false, !P.ground);
    parts.forEach((p) => { g.fillStyle = p.t < 0.12 ? '#5f574f' : p.c; g.fillRect(Math.round(p.x / 2) * 2 - 2, Math.round(p.y / 2) * 2 - 2, 4, 4); });
    g.globalAlpha = 1;
    floats.forEach((fl) => { ptext(fl.text, Math.round(fl.x), Math.round(fl.y) - 10, 2, fl.t < 0.15 ? '#c2c3c7' : fl.color, 'center'); });
    g.textAlign = 'left';
    if (flash > 0 && !reduced) { g.fillStyle = flash > 0.2 ? '#ffec27' : '#ffa300'; g.fillRect(0, 0, VW, 4); g.fillRect(0, VH - 4, VW, 4); }
  }
  function fx(dt) {
    parts.forEach((p) => { p.x += p.vx * dt; p.y += p.vy * dt; p.vy += 260 * dt; p.t -= dt; });
    parts = parts.filter((p) => p.t > 0);
    floats.forEach((fl) => { fl.y -= 30 * dt; fl.t -= dt; });
    floats = floats.filter((fl) => fl.t > 0);
    shake = Math.max(0, shake - dt * 20); flash = Math.max(0, flash - dt);
  }
  let last = 0, lastHud = '';
  function frame(ts) {
    const dt = last ? Math.min(0.1, (ts - last) / 1000) : 0; last = ts;
    if (!TEST && run.state === 'play') { acc += dt; while (acc >= STEP && run.state === 'play') { tick(); acc -= STEP; } }
    fx(dt);
    draw();
    const h = run.dist + '|' + run.combo; if (h !== lastHud) { lastHud = h; hud(); }
    requestAnimationFrame(frame);
  }

  // ---------- input ----------
  const KEYS = { ' ': 1, ArrowUp: 1, w: 1, W: 1 };
  canvas.addEventListener('pointerdown', (ev) => { ev.preventDefault(); down(); });
  const jb = $('jump');
  jb.addEventListener('pointerdown', (ev) => { ev.preventDefault(); down(); });
  ['pointerup', 'pointercancel', 'pointerleave'].forEach((t) => { canvas.addEventListener(t, up); jb.addEventListener(t, up); });
  jb.addEventListener('click', (ev) => { if (ev.detail === 0) { down(); setTimeout(up, 120); } }); // keyboard activation of the button
  document.addEventListener('keydown', (ev) => {
    // quick restart: R after a crash runs the same course again (same short pause as the big button)
    if ((ev.key === 'r' || ev.key === 'R') && run.state === 'over' && !ev.repeat && performance.now() - endAt > 700) { ev.preventDefault(); start(run.seed); return; }
    if (!KEYS[ev.key] || run.state !== 'play') return;
    const ae = document.activeElement; if (ae && ae !== jb && /^(BUTTON|A|INPUT)$/.test(ae.tagName)) return;
    ev.preventDefault(); if (!ev.repeat) down();
  });
  document.addEventListener('keyup', (ev) => { if (KEYS[ev.key]) up(); });
  // ?seed= takes a share code (A-Z0-9, any case) or the old seed form; anything invalid is ignored (a fresh seed)
  function urlSeed() {
    const raw = params.get('seed');
    const code = window.MMMiniKit ? window.MMMiniKit.parseSeedCode(raw || '') : null;
    return code || raw;
  }
  $('play').addEventListener('click', () => { save.hint = true; persist(); start(urlSeed() || (save.ghost ? save.ghost.seed : undefined)); });
  if (!window.MMMiniKit) { $('again').addEventListener('click', () => start(run.seed)); $('fresh').addEventListener('click', () => start()); }
  const mute = $('btn-mute');
  function syncMute() { const m = !!(sfx && sfx.isMuted()); mute.textContent = m ? 'Sound off' : 'Sound on'; mute.setAttribute('aria-pressed', m ? 'true' : 'false'); }
  mute.addEventListener('click', () => { if (sfx) sfx.setMuted(!sfx.isMuted()); syncMute(); });
  syncMute();
  $('how').hidden = save.hint;
  $('play').textContent = save.hint ? 'Run' : 'Got it, run';
  medalList($('i-medals'));
  try { $('play').focus({ preventScroll: true }); } catch (e) { /* ignore */ }
  C = { obs: course('preview').obs, flies: [], lo: 0, next: 0 };
  hud();
  requestAnimationFrame(frame);

  window.__dash = {
    get run() { return run; }, get save() { return save; }, get player() { return P; }, get ghost() { return G; }, get course() { return C; },
    get reduced() { return reduced; }, get lowGfx() { return lowGfx; },
    start, down, up, course,
    // advance n fixed steps; auto: jump when the next obstacle front is `lead` px ahead (a simple bot for tests)
    step(n, auto) {
      for (let i = 0; i < n && run.state === 'play'; i++) {
        if (auto) {
          const o = C.obs[C.next], d = o ? o.x - (run.wx + 8) : 1e9;
          if (P.ground && run.open < 0 && d > 0 && d < auto.lead) down();
          if (run.open >= 0 && run.f - run.open >= (o && o.t === 'gap' ? 14 : 4)) up();
        }
        tick();
      }
      return run.state;
    },
    counts: () => ({ parts: parts.length, floats: floats.length, shake, ghostTag, floatTexts: floats.map((x) => x.text) }),
    tuning: { COYOTE, BUFFER, PV, NEAR }, speedAt, draw() { draw(); },
  };
}());
