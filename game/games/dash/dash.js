// Lantern Dash: a one-button night run. Tap (or Space) to jump, hold for a higher jump. Jump LATE, just before a rock,
// for a Perfect: perfects in a row build a combo that multiplies the bonus. Fireflies are worth 10.
// The course is seeded (MMRng) and the simulation is a fixed 60 Hz step, so a run replays exactly from its inputs:
// "Play again" runs the same course against the ghost of your best run on it; "New course" rolls a new seed.
// Own keys only: `pixeltown-dash-v1` (save, ghost) and `pixeltown-medals-dash-v1` (hub medal summary). No network.
(function () {
  'use strict';
  const KEY = 'pixeltown-dash-v1', MKEY = 'pixeltown-medals-dash-v1';
  const VW = 360, VH = 240, GROUND = 200, PX = 70, STEP = 1 / 60;
  const JUMP_V = 440, GRAV = 1500, GRAV_HOLD = 820, COYOTE = 5, BUFFER = 6, PERFECT_S = 0.2;
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
    return { seed: gh.seed, in: ins, dist: int(gh.dist, 1e7) };
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
  function persist() {
    try { localStorage.setItem(KEY, JSON.stringify(save)); localStorage.setItem(MKEY, JSON.stringify({ v: 1, m: save.medals.slice() })); } catch (e) { /* ignore */ }
  }
  function award(id) { if (save.medals.indexOf(id) >= 0) return false; save.medals.push(id); run.newMedals.push(id); persist(); play('claim'); return true; }

  // ---------- course (seeded) ----------
  const speedAt = (f) => Math.min(330, 140 + f * STEP * 3.2);
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
      if (o.t !== 'gap' && wx + 7 > o.x + 2 && wx - 7 < o.x + o.w - 2 && y > GROUND - o.h + 3) return true;
    }
    return false;
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
    if (b.y > GROUND + 40) b.dead = 'fell';
    if (hitRock(c, wx, b.y)) b.dead = 'rock';
    return ev;
  }
  function press(b) { b.held = true; b.buf = BUFFER; }
  function release(b) { b.held = false; }

  // ---------- run state ----------
  const canvas = $('view'), g = canvas.getContext('2d');
  canvas.width = VW; canvas.height = VH;
  const run = { state: 'ready', seed: '', f: 0, wx: 0, dist: 0, flies: 0, combo: 0, bestCombo: 0, perfects: 0, bonus: 0, score: 0, newMedals: [], ins: [], open: -1 };
  let C = null, P = body(), G = null, ghostIn = null, gi = 0, ghostC = null;
  let parts = [], floats = [], shake = 0, flash = 0, acc = 0;

  function newSeed() { return (Date.now().toString(36) + (save.runs % 1296).toString(36)).slice(-8); }
  function start(seed) {
    run.seed = (typeof seed === 'string' && SEED_RE.test(seed)) ? seed : newSeed();
    const built = course(run.seed);
    C = { obs: built.obs, flies: built.flies, lo: 0, next: 0 };
    Object.assign(run, { state: 'play', f: 0, wx: 0, dist: 0, flies: 0, combo: 0, bestCombo: 0, perfects: 0, bonus: 0, score: 0, newMedals: [], ins: [], open: -1 });
    P = body(); parts = []; floats = []; shake = 0; acc = 0;
    if (save.ghost && save.ghost.seed === run.seed) {
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
    if (ev === 'jump') { play('ui_tap'); burst(PX, GROUND, '#c9b48a', 6, true); }
    if (ev === 'land') burst(PX, GROUND, '#c9b48a', 4, true);
    // cleared obstacles: perfect = took off within PERFECT_S of the obstacle's front edge
    while (C.next < C.obs.length && C.obs[C.next].x + C.obs[C.next].w < run.wx - 8) {
      const o = C.obs[C.next]; C.next++;
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
    const newBest = run.dist > save.best;
    if (newBest) save.best = run.dist;
    if (run.score > save.bestScore) save.bestScore = run.score;
    if (run.bestCombo > save.bestCombo) save.bestCombo = run.bestCombo;
    if (!save.ghost || save.ghost.seed !== run.seed || run.dist > save.ghost.dist) save.ghost = { seed: run.seed, in: run.ins.slice(0, 4000), dist: run.dist };
    award('run1');
    persist();
    play('hurt');
    if (!reduced) shake = 8;
    burst(PX, P.y - 10, '#ffb347', 16, false);
    $('r-dist').textContent = String(run.dist);
    $('r-best').textContent = newBest ? 'New personal best!' : 'Best: ' + save.best + ' m';
    $('r-best').className = newBest ? 'new' : 'dim';
    $('r-line').textContent = 'Score ' + run.score + ' / ' + run.flies + ' fireflies / best combo x' + run.bestCombo + ' / course ' + run.seed;
    $('r-why').textContent = P.dead === 'fell' ? 'Into a gap: hold the button for a longer jump.' : 'Bumped a rock: jump a little earlier, but late is Perfect.';
    $('r-new').textContent = run.newMedals.length ? 'New medal: ' + run.newMedals.map((m) => MEDALS.find((x) => x[0] === m)[1]).join(', ') : '';
    medalList($('r-medals'));
    $('result').hidden = false;
    msg('');
    $('again').focus({ preventScroll: true });
    hud();
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
  (function bake() {
    const s = sky.getContext('2d'), gr = s.createLinearGradient(0, 0, 0, VH);
    gr.addColorStop(0, '#0b1024'); gr.addColorStop(1, '#25305a'); s.fillStyle = gr; s.fillRect(0, 0, VW, VH);
    const r = MMRng.create('dash-sky');
    for (let i = 0; i < 60; i++) { s.fillStyle = r.next() < 0.2 ? '#fff' : '#8fa0d8'; s.fillRect(r.int(0, VW), r.int(0, 150), 2, 2); }
    s.fillStyle = '#f4f1de'; s.beginPath(); s.arc(300, 40, 14, 0, 6.3); s.fill(); s.fillStyle = '#0b1024'; s.beginPath(); s.arc(294, 36, 12, 0, 6.3); s.fill();
  }());
  function hills(off, col, h, wave) {
    g.fillStyle = col; g.beginPath(); g.moveTo(0, VH);
    for (let x = 0; x <= VW; x += 8) g.lineTo(x, GROUND - h - Math.sin((x + off) / wave) * h * 0.5 - Math.sin((x + off) / (wave * 0.37)) * 6);
    g.lineTo(VW, VH); g.closePath(); g.fill();
  }
  function hero(x, y, f, ghost, airborne) {
    g.save(); g.globalAlpha = ghost ? 0.35 : 1;
    const leg = airborne ? 0 : (Math.floor(f / 6) % 2) * 3;
    g.fillStyle = ghost ? '#9fd8ff' : '#3a2a4a'; g.fillRect(x - 6, y - 22, 12, 14);  // cloak
    g.fillStyle = ghost ? '#cfeaff' : '#f2c9a0'; g.fillRect(x - 4, y - 28, 8, 7);    // face
    g.fillStyle = ghost ? '#9fd8ff' : '#7a3e2a'; g.fillRect(x - 5, y - 31, 10, 4);   // hood
    g.fillStyle = '#1b1b2a'; g.fillRect(x - 5, y - 8, 4, 8 - leg); g.fillRect(x + 1, y - 8, 4, 5 + leg);
    g.fillStyle = ghost ? '#cfeaff' : '#ffcf5a'; g.fillRect(x + 7, y - 18, 6, 7);   // lantern
    g.restore();
  }
  function draw() {
    g.setTransform(1, 0, 0, 1, 0, 0);
    if (shake > 0) g.translate((run.f % 2 ? 1 : -1) * shake * 0.5, 0);
    g.drawImage(sky, 0, 0);
    const wx = run.wx;
    hills(wx * 0.15, '#1a2346', 34, 60);
    hills(wx * 0.4 + 300, '#141b36', 20, 34);
    // ground with gaps
    g.fillStyle = '#2d2418'; g.fillRect(0, GROUND, VW, VH - GROUND);
    g.fillStyle = '#4b7a3a'; g.fillRect(0, GROUND, VW, 5);
    g.fillStyle = '#3a2e1f'; for (let x = -((wx | 0) % 24); x < VW; x += 24) g.fillRect(x, GROUND + 12, 10, 4);
    if (C) {
      for (let i = C.lo; i < C.obs.length; i++) {
        const o = C.obs[i], sx = o.x - wx + PX; if (sx > VW + 10) break; if (sx + o.w < -10) continue;
        if (o.t === 'gap') { g.fillStyle = '#05070f'; g.fillRect(sx, GROUND, o.w, VH - GROUND); }
        else {
          g.fillStyle = o.t === 'tall' ? '#5d6680' : '#7d7a8c'; g.fillRect(sx, GROUND - o.h, o.w, o.h);
          g.fillStyle = '#ffffff30'; g.fillRect(sx + 3, GROUND - o.h + 3, o.w * 0.4, 3);
          g.fillStyle = '#00000040'; g.fillRect(sx + o.w - 4, GROUND - o.h, 4, o.h);
        }
      }
      for (let i = 0; i < C.flies.length; i++) {
        const fl = C.flies[i], sx = fl.x - wx + PX; if (sx > VW + 10) break; if (fl.got || sx < -10) continue;
        const blink = reduced ? 1 : 0.6 + 0.4 * Math.sin((run.f + i * 13) / 6);
        g.fillStyle = 'rgba(255,242,122,' + blink.toFixed(2) + ')'; g.fillRect(sx - 3, fl.y - 3, 6, 6);
        if (!lowGfx) { g.fillStyle = 'rgba(255,242,122,0.18)'; g.fillRect(sx - 7, fl.y - 7, 14, 14); }
      }
    }
    // best-distance flag (any course) and the ghost (same course)
    const bx = save.best * 10 - wx + PX;
    if (save.best > 0 && bx > -10 && bx < VW + 10) { g.fillStyle = '#ffb347'; g.fillRect(bx, GROUND - 46, 2, 46); g.fillRect(bx + 2, GROUND - 46, 14, 9); g.fillStyle = '#fff'; g.font = '10px ui-monospace, monospace'; g.fillText('best', bx + 4, GROUND - 50); }
    if (G && !G.dead) hero(PX, G.y, run.f, true, !G.ground);
    if (!lowGfx) {
      const lg = g.createRadialGradient(PX + 10, P.y - 15, 4, PX + 10, P.y - 15, 70);
      lg.addColorStop(0, 'rgba(255,207,90,0.35)'); lg.addColorStop(1, 'rgba(255,207,90,0)'); g.fillStyle = lg; g.fillRect(PX - 70, P.y - 90, 160, 160);
    }
    if (!(P.dead && run.state === 'over' && P.y > GROUND + 30)) hero(PX, P.y, run.f, false, !P.ground);
    parts.forEach((p) => { g.globalAlpha = Math.min(1, p.t * 2); g.fillStyle = p.c; g.fillRect(p.x - 2, p.y - 2, 4, 4); });
    g.globalAlpha = 1;
    g.font = 'bold 14px ui-monospace, Menlo, monospace'; g.textAlign = 'center';
    floats.forEach((fl) => { g.globalAlpha = Math.min(1, fl.t * 2); g.fillStyle = '#000'; g.fillText(fl.text, fl.x + 1, fl.y + 1); g.fillStyle = fl.color; g.fillText(fl.text, fl.x, fl.y); });
    g.globalAlpha = 1; g.textAlign = 'left';
    if (flash > 0 && !reduced) { g.fillStyle = 'rgba(255,209,102,' + (flash * 1.2).toFixed(2) + ')'; g.fillRect(0, 0, VW, 3); g.fillRect(0, VH - 3, VW, 3); }
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
    if (!KEYS[ev.key] || run.state !== 'play') return;
    const ae = document.activeElement; if (ae && ae !== jb && /^(BUTTON|A|INPUT)$/.test(ae.tagName)) return;
    ev.preventDefault(); if (!ev.repeat) down();
  });
  document.addEventListener('keyup', (ev) => { if (KEYS[ev.key]) up(); });
  $('play').addEventListener('click', () => { save.hint = true; persist(); start(params.get('seed') || (save.ghost ? save.ghost.seed : undefined)); });
  $('again').addEventListener('click', () => start(run.seed));
  $('fresh').addEventListener('click', () => start());
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
    counts: () => ({ parts: parts.length, floats: floats.length, shake }),
  };
}());
