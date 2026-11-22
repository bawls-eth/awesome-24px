// Stack Tower: a 90-second timing stacker. A block swings across the top of the tower; tap to drop it.
// The part that hangs over the edge is trimmed off and falls. Land within a few pixels for a PERFECT (snaps flush);
// three Perfects in a row widen the block again. Miss the tower completely and the round ends.
// The swing speeds up as you climb, and from floor 8 blocks swing in from either side.
// Own keys only: `pixeltown-stack-v1` (save) and `pixeltown-medals-stack-v1` (hub medal summary). No network, textContent only.
// Every round is seeded (MMRng): "Replay seed" swings the very same blocks (sides, speeds, colours) again.
(function () {
  'use strict';
  const KEY = 'pixeltown-stack-v1', MKEY = 'pixeltown-medals-stack-v1';
  const CW = 360, CH = 480, BH = 22, BASE = 180, PERF = 5, GROUND = 36, ROUND = 90, MAXW = 220;
  const MEDALS = [
    ['round1', 'First tower', 'Finish a round'],
    ['f15', '15 floors', 'Stack 15 floors in one round'],
    ['perfect5', '5x perfect', 'Land 5 Perfects in a row'],
    ['f40', '40 floors', 'Stack 40 floors in one round'],
  ];
  const HUES = ['#7fd18b', '#5cc8ff', '#c99bff', '#ff8fb1', '#ffb347', '#ffe066', '#66f0d0', '#f0a8ff'];
  const $ = (id) => document.getElementById(id);
  const params = new URLSearchParams(location.search);
  const TEST = params.get('test') === '1';
  let reduced = false, lowGfx = false;
  try { reduced = (window.MMMotion ? MMMotion.reduced(window, localStorage) : false) || !!(window.MMSideAccess && MMSideAccess.reduced()); } catch (e) { reduced = false; }
  try { lowGfx = !!(window.MMAccess && MMAccess.prefs.load(localStorage).lowGfx); } catch (e) { lowGfx = false; }
  let sfx = null;
  try { sfx = window.MMSfx ? MMSfx.create({ storage: localStorage }) : null; } catch (e) { sfx = null; }
  const play = (n) => { try { if (sfx) sfx.play(n); } catch (e) { /* ignore */ } };

  // ---------- save ----------
  const int = (x, hi) => (typeof x === 'number' && isFinite(x) && x >= 0 ? Math.min(hi, Math.floor(x)) : 0);
  function load() {
    let o = null;
    try { const s = localStorage.getItem(KEY); if (typeof s === 'string' && s.length < 4000) o = JSON.parse(s); } catch (e) { o = null; }
    if (!o || typeof o !== 'object' || Array.isArray(o)) o = {};
    const ok = MEDALS.map((m) => m[0]);
    return { v: 1, hint: o.hint === true, best: int(o.best, 9999), bestCombo: int(o.bestCombo, 9999), rounds: int(o.rounds, 1e9),
      medals: Array.isArray(o.medals) ? o.medals.filter((m, i, a) => ok.indexOf(m) >= 0 && a.indexOf(m) === i) : [] };
  }
  let save = load();
  function persist() {
    try { localStorage.setItem(KEY, JSON.stringify(save)); localStorage.setItem(MKEY, JSON.stringify({ v: 1, m: save.medals.slice() })); } catch (e) { /* storage refused: play on */ }
    try { if (window.MMHubProfile && MMHubProfile.sync) MMHubProfile.sync(localStorage, 'stack', save.medals.slice()); } catch (e) { /* hub map progress is optional */ }
  }
  function award(id) { if (save.medals.indexOf(id) >= 0) return false; save.medals.push(id); run.newMedals.push(id); persist(); return true; }

  // ---------- tower ----------
  const canvas = $('board'), g = canvas.getContext('2d');
  canvas.width = CW; canvas.height = CH;
  let rng = null;
  let tower = [], mover = null, falling = [], parts = [], floats = [], shake = 0, camY = 0, flash = 0;
  const run = { state: 'ready', seed: '', floors: 0, time: ROUND, combo: 0, bestCombo: 0, perfects: 0, newMedals: [], log: [], why: '', lastDx: 0 };

  function speedFor(floor) { return Math.min(340, 105 + floor * 6.5); }
  function spawn() {
    const floor = tower.length; // the floor this block becomes
    const top = tower[tower.length - 1];
    const side = floor >= 8 ? (rng.next() < 0.5 ? -1 : 1) : (floor % 2 ? -1 : 1);
    const jit = 0.92 + rng.next() * 0.16;
    const hue = HUES[Math.floor(rng.next() * HUES.length)];
    const sp = Math.round(speedFor(floor) * jit);
    const w = top.w;
    mover = { x: side < 0 ? 0 : CW - w, w, dir: side < 0 ? 1 : -1, speed: sp, c: hue, wob: 0 };
    run.log.push([side, sp, hue]);
  }
  function reset() {
    tower = [{ x: (CW - BASE) / 2, w: BASE, c: '#c9bdf5', s: 1 }];
    falling = []; parts = []; floats = []; shake = 0; camY = 0; flash = 0;
    spawn();
  }

  // ---------- feedback ----------
  function burst(x, y, color, n) {
    n = lowGfx ? Math.min(6, n, Math.max(0, 24 - parts.length)) : n;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + (i % 3) * 0.4, sp = 50 + (i * 37) % 120;
      parts.push({ x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 60, t: 0.45 + (i % 4) * 0.08, c: color });
    }
    if (parts.length > 160) parts.splice(0, parts.length - 160);
  }
  function floatText(x, y, text, color) { floats.push({ x, y, text, color: color || '#fff', t: 1 }); }
  function bump(n) { if (!reduced) shake = Math.max(shake, n); }
  const msg = (t) => { $('msg').textContent = t; };
  const floorY = (i) => CH - GROUND - (i + 1) * BH; // world y of floor i (0 = base)

  // ---------- drop ----------
  function drop() {
    if (run.state !== 'play' || !mover) return false;
    const top = tower[tower.length - 1], m = mover, i = tower.length;
    const dx = m.x - top.x;
    run.lastDx = dx;
    const y = floorY(i);
    let res;
    if (Math.abs(dx) <= PERF) {
      run.combo++; run.perfects++;
      let nx = top.x, nw = m.w;
      if (run.combo >= 3) { nw = Math.min(MAXW, m.w + 10); nx = Math.max(0, Math.min(CW - nw, top.x - (nw - m.w) / 2)); }
      tower.push({ x: nx, w: nw, c: m.c, s: 1.25 });
      burst(nx + nw / 2, y, '#fff', run.combo >= 3 ? 16 : 10);
      floatText(nx + nw / 2, y - 14, run.combo >= 3 ? 'Perfect x' + run.combo + '  wider!' : 'Perfect' + (run.combo > 1 ? ' x' + run.combo : '') + '!', '#ffd166');
      flash = reduced ? 0 : 0.25;
      play(run.combo >= 3 ? 'claim' : 'pickup');
      msg(run.combo >= 3 ? 'Perfect x' + run.combo + ': the block grows!' : 'Perfect!');
      res = { perfect: true, w: nw, cut: 0 };
    } else {
      const l = Math.max(m.x, top.x), r = Math.min(m.x + m.w, top.x + top.w), ov = r - l;
      if (ov <= 0) {
        falling.push({ x: m.x, y, w: m.w, c: m.c, vy: 0, rot: 0, dr: dx < 0 ? -2 : 2 });
        mover = null; run.combo = 0;
        bump(8); play('hurt');
        run.why = 'missed';
        end();
        return { miss: true };
      }
      const cutX = m.x < top.x ? m.x : r, cutW = m.w - ov;
      falling.push({ x: cutX, y, w: cutW, c: m.c, vy: 0, rot: 0, dr: m.x < top.x ? -2 : 2 });
      tower.push({ x: l, w: ov, c: m.c, s: 1.12 });
      run.combo = 0;
      const near = Math.round(Math.abs(dx));
      if (near <= 12) { floatText(l + ov / 2, y - 14, near + ' px from perfect', '#c9bdf5'); msg(near + ' px from a Perfect. So close!'); } else msg(ov < 30 ? 'Careful: a thin block now. Aim for Perfects to widen it.' : '');
      bump(2); play('ui_tap');
      res = { perfect: false, w: ov, cut: cutW };
    }
    if (run.combo > run.bestCombo) run.bestCombo = run.combo;
    run.floors = tower.length - 1;
    if (run.combo >= 5) award('perfect5');
    if (run.floors >= 15) award('f15');
    if (run.floors >= 40) award('f40');
    if (save.best > 0 && run.floors === save.best + 1) { floatText(CW / 2, floorY(i) - 34, 'New best floor!', '#7fd18b'); play('levelup'); }
    spawn();
    hud();
    return res;
  }

  // ---------- flow ----------
  function newSeed() { return (Date.now().toString(36) + (save.rounds % 1296).toString(36)).slice(-8); }
  function start(seed) {
    run.seed = (typeof seed === 'string' && /^[A-Za-z0-9_-]{1,24}$/.test(seed)) ? seed : newSeed();
    rng = MMRng.create('stack-tower:' + run.seed);
    Object.assign(run, { state: 'play', floors: 0, time: ROUND, combo: 0, bestCombo: 0, perfects: 0, newMedals: [], log: [], why: '', lastDx: 0 });
    reset();
    $('intro').hidden = true; $('result').hidden = true;
    msg(save.rounds === 0 ? 'Tap when the block is right above the tower.' : 'Seed ' + run.seed + '. Go!');
    hud();
  }
  function nearLine() {
    const f = run.floors;
    if (save.best > f && save.best - f <= 2) return (save.best - f === 1 ? 'Just 1 floor' : 'Just 2 floors') + ' short of your best. One more try?';
    if (run.why === 'missed' && Math.abs(run.lastDx) < run.lastW + 12) return 'Missed by ' + Math.max(1, Math.round(Math.abs(run.lastDx) - run.lastW)) + ' px. Tap a touch earlier when it is fast.';
    const m = MEDALS.find((x) => save.medals.indexOf(x[0]) < 0 && /^f\d+$/.test(x[0]));
    if (m) { const n = parseInt(m[0].slice(1), 10) - f; if (n > 0) return n + ' more floors for the ' + m[1] + ' medal.'; }
    return 'Perfects keep the block wide: aim for the middle.';
  }
  function end() {
    if (run.state !== 'play') return;
    run.lastW = tower.length ? tower[tower.length - 1].w : 0;
    run.state = 'over';
    save.rounds++;
    const newBest = run.floors > save.best;
    if (newBest) save.best = run.floors;
    if (run.bestCombo > save.bestCombo) save.bestCombo = run.bestCombo;
    award('round1');
    persist();
    play('levelup');
    $('r-title').firstChild.textContent = (run.why === 'missed' ? 'It fell! ' : 'Time! ') + '';
    $('r-score').textContent = run.floors + (run.floors === 1 ? ' floor' : ' floors');
    $('r-best').textContent = newBest ? 'New personal best!' : 'Best: ' + save.best + ' floors';
    $('r-best').className = newBest ? 'new' : 'dim';
    $('r-line').textContent = nearLine() + ' Best Perfect run x' + run.bestCombo + ' / seed ' + run.seed;
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
  function nextGoal() { const m = MEDALS.find((x) => save.medals.indexOf(x[0]) < 0); return m ? 'Goal: ' + m[2] : 'All medals won. Chase your best!'; }
  function hud() {
    $('h-score').textContent = String(run.floors);
    $('h-time').textContent = String(Math.max(0, Math.ceil(run.time)));
    $('h-best').textContent = String(Math.max(save.best, run.state === 'play' ? 0 : run.floors));
    $('h-combo').textContent = run.combo ? 'x' + run.combo : '0';
    $('timefill').style.transform = 'scaleX(' + Math.max(0, Math.min(1, run.time / ROUND)) + ')';
    $('goal').textContent = nextGoal();
  }

  // ---------- update / draw ----------
  function update(dt, manual) {
    const sim = !TEST || manual;
    if (sim && run.state === 'play') {
      run.time -= dt;
      if (run.time <= 0) { run.time = 0; run.why = 'time'; end(); }
      if (mover) {
        mover.x += mover.dir * mover.speed * dt;
        if (mover.x <= 0) { mover.x = 0; mover.dir = 1; }
        if (mover.x >= CW - mover.w) { mover.x = CW - mover.w; mover.dir = -1; }
      }
    }
    const want = Math.max(0, (tower.length + 1) * BH - (CH - GROUND - 170));
    camY = reduced ? want : camY + (want - camY) * Math.min(1, dt * 6);
    tower.forEach((b) => { b.s += (1 - b.s) * Math.min(1, dt * 14); if (reduced) b.s = 1; });
    falling.forEach((f) => { f.vy += 900 * dt; f.y += f.vy * dt; if (!reduced) f.rot += f.dr * dt; });
    falling = falling.filter((f) => f.y < CH + camY + 200);
    parts.forEach((p) => { p.x += p.vx * dt; p.y += p.vy * dt; p.vy += 300 * dt; p.t -= dt; });
    parts = parts.filter((p) => p.t > 0);
    floats.forEach((f) => { f.y -= 30 * dt; f.t -= dt * 0.8; });
    floats = floats.filter((f) => f.t > 0);
    shake = Math.max(0, shake - dt * 30);
    flash = Math.max(0, flash - dt);
  }
  function block(x, y, w, c, s) {
    const h = BH * (s || 1), yy = y + BH - h;
    g.fillStyle = '#0007'; g.fillRect(x + 2, yy + 3, w, h);
    g.fillStyle = c; g.fillRect(x, yy, w, h);
    g.fillStyle = '#ffffff44'; g.fillRect(x, yy, w, 3);
    g.fillStyle = '#00000033'; g.fillRect(x, yy + h - 4, w, 4);
    // lantern windows every 18 px (original pixel motif)
    g.fillStyle = '#1b1830';
    for (let wx = x + 7; wx + 6 <= x + w - 4; wx += 18) g.fillRect(wx, yy + 7, 6, 7);
  }
  function draw() {
    g.setTransform(1, 0, 0, 1, 0, 0);
    // night sky gets deeper as you climb
    const t = Math.min(1, camY / 900);
    g.fillStyle = t > 0.5 ? '#0c0a1c' : '#151230'; g.fillRect(0, 0, CW, CH);
    if (!lowGfx) { g.fillStyle = '#ffffff22'; for (let i = 0; i < 18; i++) { const sx = (i * 97) % CW, sy = ((i * 53) + camY * 0.2) % CH; g.fillRect(sx, sy, 2, 2); } }
    if (shake > 0) g.translate((shake * ((Math.floor(performance.now() / 16) % 2) ? 1 : -1)) * 0.6, 0);
    g.translate(0, camY);
    // ground
    g.fillStyle = '#2a2548'; g.fillRect(0, CH - GROUND, CW, GROUND + 400);
    g.fillStyle = '#3a8f4a'; g.fillRect(0, CH - GROUND, CW, 6);
    // best marker
    if (save.best > 0) {
      const by = floorY(save.best);
      g.fillStyle = '#ffd16699';
      for (let x = 0; x < CW; x += 14) g.fillRect(x, by, 8, 2);
      g.font = 'bold 12px ui-monospace, Menlo, monospace'; g.textAlign = 'left'; g.textBaseline = 'bottom';
      g.fillStyle = '#ffd166'; g.fillText('best ' + save.best, 4, by - 2);
    }
    tower.forEach((b, i) => block(b.x, floorY(i), b.w, b.c, b.s));
    if (mover && run.state === 'play') {
      const y = floorY(tower.length);
      // drop guide: the top block's edges, faint
      const top = tower[tower.length - 1];
      g.fillStyle = '#ffffff18'; g.fillRect(top.x, y, top.w, BH);
      block(mover.x, y, mover.w, mover.c, 1);
    }
    falling.forEach((f) => {
      g.save(); g.translate(f.x + f.w / 2, f.y + BH / 2); g.rotate(f.rot);
      g.globalAlpha = 0.85; block(-f.w / 2, -BH / 2, f.w, f.c, 1); g.restore(); g.globalAlpha = 1;
    });
    parts.forEach((p) => { g.globalAlpha = Math.min(1, p.t * 2); g.fillStyle = p.c; g.fillRect(p.x - 3, p.y - 3, 6, 6); });
    g.globalAlpha = 1;
    g.font = 'bold 16px ui-monospace, Menlo, monospace'; g.textAlign = 'center'; g.textBaseline = 'middle';
    floats.forEach((f) => { g.globalAlpha = Math.min(1, f.t * 2); g.fillStyle = '#000'; g.fillText(f.text, f.x + 1, f.y + 2); g.fillStyle = f.color; g.fillText(f.text, f.x, f.y); });
    g.globalAlpha = 1;
    if (flash > 0 && !lowGfx) { g.setTransform(1, 0, 0, 1, 0, 0); g.fillStyle = 'rgba(255,255,255,' + (flash * 0.4) + ')'; g.fillRect(0, 0, CW, CH); }
  }
  let last = 0, lastHud = -1;
  function frame(ts) {
    const dt = last ? Math.min(0.05, (ts - last) / 1000) : 0; last = ts;
    update(dt, false);
    draw();
    const s = Math.ceil(run.time); if (s !== lastHud) { lastHud = s; hud(); }
    requestAnimationFrame(frame);
  }

  // ---------- input ----------
  let lastPress = -1e9;
  const press = () => { lastPress = performance.now(); return drop(); };
  canvas.addEventListener('pointerdown', (ev) => { ev.preventDefault(); press(); });
  $('drop').addEventListener('pointerdown', (ev) => { ev.preventDefault(); press(); });
  $('drop').addEventListener('click', () => { if (performance.now() - lastPress > 350) press(); });
  document.addEventListener('keydown', (ev) => {
    if (run.state !== 'play' || ev.repeat) return;
    const ae = document.activeElement;
    const k = ev.key;
    if (k !== ' ' && k !== 'Enter' && k !== 'ArrowDown' && k !== 's') return;
    if (ae && ae !== canvas && ae.id !== 'drop' && /^(BUTTON|A|INPUT)$/.test(ae.tagName)) return;
    ev.preventDefault(); press();
  });
  $('play').addEventListener('click', () => { save.hint = true; persist(); start(params.get('seed') || undefined); });
  $('again').addEventListener('click', () => start());
  $('replay').addEventListener('click', () => start(run.seed));
  const mute = $('btn-mute');
  function syncMute() { const m = !!(sfx && sfx.isMuted()); mute.textContent = m ? 'Sound off' : 'Sound on'; mute.setAttribute('aria-pressed', m ? 'true' : 'false'); }
  mute.addEventListener('click', () => { if (sfx) sfx.setMuted(!sfx.isMuted()); syncMute(); });
  syncMute();

  // first visit: the how-to card; later visits: a one-tap Play card
  $('how').hidden = save.hint;
  $('play').textContent = save.hint ? 'Play' : 'Got it, play';
  rng = MMRng.create('stack-tower:preview'); reset();
  medalList($('i-medals'));
  try { $('play').focus({ preventScroll: true }); } catch (e) { /* ignore */ }
  try { if (save.medals.length && window.MMHubProfile) MMHubProfile.sync(localStorage, 'stack', save.medals.slice()); } catch (e) { /* optional */ }
  hud();
  requestAnimationFrame(frame);

  window.__stack = {
    get run() { return run; }, get save() { return save; }, get reduced() { return reduced; }, get lowGfx() { return lowGfx; },
    get mover() { return mover; }, get tower() { return tower.map((b) => ({ x: b.x, w: b.w })); },
    align(off) { const top = tower[tower.length - 1]; if (mover) mover.x = top.x + (off || 0); },
    drop, start, end, step(dt) { update(dt, true); },
    counts: () => ({ parts: parts.length, floats: floats.length, falling: falling.length, shake, flash }),
  };
}());
