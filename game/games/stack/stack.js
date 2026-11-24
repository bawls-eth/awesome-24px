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
  // 8-bit palette (MM8): block fill -> its shade and its light edge
  const HUES = ['#00e436', '#29adff', '#ff77a8', '#ffa300', '#ffec27', '#83769c', '#ff004d', '#ffccaa'];
  const SHADE = { '#00e436': '#008751', '#29adff': '#1d2b53', '#ff77a8': '#7e2553', '#ffa300': '#ab5236', '#ffec27': '#ffa300', '#83769c': '#5f574f', '#ff004d': '#7e2553', '#ffccaa': '#ab5236', '#c2c3c7': '#5f574f' };
  const INK = '#0b0d1a';
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
  function readRaw() {
    let o = null;
    try { const s = localStorage.getItem(KEY); if (typeof s === 'string' && s.length < 120000) o = JSON.parse(s); } catch (e) { o = null; }
    return o && typeof o === 'object' && !Array.isArray(o) ? o : null;
  }
  function clean(o) {
    if (!o || typeof o !== 'object' || Array.isArray(o)) o = {};
    const ok = MEDALS.map((m) => m[0]);
    return { v: 1, hint: o.hint === true, best: int(o.best, 9999), bestCombo: int(o.bestCombo, 9999), rounds: int(o.rounds, 1e9),
      medals: Array.isArray(o.medals) ? o.medals.filter((m, i, a) => ok.indexOf(m) >= 0 && a.indexOf(m) === i) : [] };
  }
  const load = () => clean(readRaw());
  let save = load();
  // Merge-on-write (bugbash/saves.md S1/S7): a second tab holding an older save can never lower a best, drop rounds / medals, or
  // erase a field a newer build wrote. MMSaveMerge (shared/mm-save-merge.js) is optional: without it the old plain write is used.
  let base = JSON.parse(JSON.stringify(save));
  function writeSave() {
    const M = window.MMSaveMerge;
    if (!M || !M.writeMedalSave) { localStorage.setItem(KEY, JSON.stringify(save)); localStorage.setItem(MKEY, JSON.stringify({ v: 1, m: save.medals.slice() })); return; } // no module (or a cached older one): plain write
    const raw = readRaw(), mine = Object.assign({}, save);
    // one shared block for dash / echo / pop / stack (cycle1 L-15). It throws on a full storage: save / base stay as they were, the next write retries
    M.writeMedalSave(localStorage, KEY, MKEY, raw, base, mine, clean, (c) => { Object.assign(save, c); base = JSON.parse(JSON.stringify(save)); });
  }
  function persist() {
    try { writeSave(); } catch (e) { /* storage refused: play on */ }
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
    tower = [{ x: (CW - BASE) / 2, w: BASE, c: '#c2c3c7', s: 1 }];
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
  // R4 D4 (b09-05): back-to-back near-miss floats ('13 px from perfect' then '11 px ...') rose into each other. A new float
  // retires older floats it would overlap; floats added for the same drop (t still 1) are spaced on purpose and kept.
  function floatText(x, y, text, color) {
    floats = floats.filter((f) => f.t >= 1 || Math.abs(f.y - y) >= 20);
    floats.push({ x, y, text, color: color || '#fff', t: 1 });
  }
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
      burst(nx + nw / 2, y, '#fff1e8', run.combo >= 3 ? 16 : 10);
      floatText(nx + nw / 2, y - 14, run.combo >= 3 ? 'Perfect x' + run.combo + '  wider!' : 'Perfect' + (run.combo > 1 ? ' x' + run.combo : '') + '!', '#ffec27');
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
      if (near <= 12) { floatText(l + ov / 2, y - 14, near + ' px from perfect', '#ff77a8'); msg(near + ' px from a Perfect. So close!'); } else msg(ov < 30 ? 'Careful: a thin block now. Aim for Perfects to widen it.' : '');
      bump(2); play('ui_tap');
      res = { perfect: false, w: ov, cut: cutW };
    }
    if (run.combo > run.bestCombo) run.bestCombo = run.combo;
    run.floors = tower.length - 1;
    if (run.combo >= 5) award('perfect5');
    if (run.floors >= 15) award('f15');
    if (run.floors >= 40) award('f40');
    if (save.best > 0 && run.floors === save.best + 1) { floatText(CW / 2, floorY(i) - 34, 'New best floor!', '#00e436'); play('levelup'); }
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
    const prevBest = save.best, prevCombo = save.bestCombo;
    const newBest = run.floors > save.best;
    if (newBest) save.best = run.floors;
    if (run.bestCombo > save.bestCombo) save.bestCombo = run.bestCombo;
    award('round1');
    persist();
    play('levelup');
    showResult(newBest, prevBest, prevCombo);
    $('result').hidden = false;
    resShownAt = performance.now();
    msg('');
    if (resCard) resCard.focus(); else $('again').focus({ preventScroll: true });
    hud();
  }
  // MK1: the shared result card (MMMiniKit); ids r-title / r-score / r-best / r-line / r-new / r-medals / again / replay kept
  const rMedals = $('r-medals');
  let resCard = null, resShownAt = -1e9;
  // taps still landing from the round (or a mashing finger) must not hit Play again / Replay / Copy the instant the card appears
  // G-17: the MMMiniKit card now guards real taps itself; this page guard stays as well (it also holds scripted / keyboard-style clicks)
  $('result').addEventListener('click', (ev) => { if (performance.now() - resShownAt < 450) { ev.stopPropagation(); ev.preventDefault(); } }, true);
  // the result card never navigates: any link inside it is neutralised (belt and braces)
  $('result').addEventListener('click', (ev) => { const a = ev.target && ev.target.closest && ev.target.closest('a'); if (a) ev.preventDefault(); }, true);
  function showResult(newBest, prevBest, prevCombo) {
    medalList(rMedals);
    const title = run.why === 'missed' ? 'It fell! ' : 'Time! ';
    const floors = run.floors + (run.floors === 1 ? ' floor' : ' floors');
    const lines = [
      { id: 'r-best', text: newBest ? 'New personal best!' : 'Best: ' + save.best + ' floors', cls: newBest ? 'new' : 'dim' },
      { id: 'r-line', text: nearLine() + ' Best Perfect run x' + run.bestCombo + ' / seed ' + run.seed, cls: 'dim' },
      { id: 'r-new', text: run.newMedals.length ? 'New medal: ' + run.newMedals.map((m) => MEDALS.find((x) => x[0] === m)[1]).join(', ') : '', cls: 'new' },
    ];
    if (!window.MMMiniKit) {
      $('r-title').firstChild.textContent = title; $('r-score').textContent = floors;
      lines.forEach((l) => { $(l.id).textContent = l.text; $(l.id).className = l.cls; });
      return;
    }
    const K = window.MMMiniKit;
    resCard = K.panel($('result'), K.result({
      headline: [title, { text: floors, id: 'r-score' }],
      stats: [
        { label: 'Floors', value: String(run.floors), best: newBest && prevBest > 0 },
        { label: 'Perfects', value: String(run.perfects) },
        { label: 'Best Perfect run', value: 'x' + run.bestCombo, best: run.bestCombo > prevCombo && prevCombo > 0 },
      ],
      lines,
      goalText: nextGoal(),
      seed: run.seed,
      // no Town link on the card: a mashing finger landing on it left the game (bug bash). G-17 (b08-07): a kit "Menu" button opens the shared
      // nav sheet (MMNav) instead, and the kit's click guard keeps it inert for the first 400 ms.
      more: window.MMNav && typeof window.MMNav.open === 'function' ? [{ id: 'r-menu', label: 'Menu' }] : [],
      ids: { head: 'r-title', again: 'again', replay: 'replay', code: 'r-code', copy: 'r-copy', goal: 'r-goal' },
    }), { again: () => start(), replay: (sd) => start(sd), more: [() => { try { window.MMNav.open(); } catch (e) { /* no nav sheet */ } }], extra: [rMedals], holdMs: 400 });
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
  function ptext(str, x, y, scale, color, align) {
    if (window.MM8) { MM8.text(g, str, x, y - Math.floor(7 * scale / 2), scale, color, { align: align || 'center' }); return; }
    g.font = 'bold ' + (8 * scale) + 'px monospace'; g.textAlign = align || 'center'; g.textBaseline = 'middle'; g.fillStyle = color; g.fillText(str, x, y);
  }
  // 8-bit brick block: ink outline, light top edge, shade bottom, brick seams, lit lantern windows
  function block(x, y, w, c, s) {
    const h = Math.max(2, Math.round(BH * (s || 1) / 2) * 2), yy = Math.round(y + BH - h); x = Math.round(x); w = Math.round(w);
    const dark = SHADE[c] || '#5f574f';
    g.fillStyle = INK; g.fillRect(x + 2, yy + 2, w, h);                     // hard shadow
    g.fillStyle = INK; g.fillRect(x - 2, yy, w + 4, h); g.fillRect(x, yy - 2, w, h + 2);
    g.fillStyle = c; g.fillRect(x, yy, w, h);
    g.fillStyle = '#fff1e8'; g.fillRect(x + 2, yy, Math.max(0, w - 4), 2);
    g.fillStyle = dark; g.fillRect(x, yy + h - 4, w, 4); g.fillRect(x + w - 2, yy, 2, h);
    if (h >= BH - 2) {
      g.fillStyle = dark; for (let bx = x + 12; bx < x + w - 4; bx += 24) g.fillRect(bx, yy + 2, 2, h - 6);
      g.fillStyle = INK; for (let wx = x + 5; wx + 6 <= x + w - 5; wx += 24) { g.fillRect(wx, yy + 6, 6, 8); }
      g.fillStyle = '#ffec27'; for (let wx = x + 5; wx + 6 <= x + w - 5; wx += 24) { g.fillRect(wx + 2, yy + 8, 2, 4); }
    }
  }
  function draw() {
    g.setTransform(1, 0, 0, 1, 0, 0); g.imageSmoothingEnabled = false;
    // night sky: stepped bands that darken as you climb (palette only, no gradient)
    const t = Math.min(1, camY / 900), bands = t > 0.5 ? ['#0b0d1a', '#0b0d1a', '#0b0d1a', '#12142a', '#12142a', '#1d2b53'] : ['#12142a', '#12142a', '#1d2b53', '#1d2b53', '#1d2b53', '#7e2553'];
    const bh = CH / bands.length; bands.forEach((c, i) => { g.fillStyle = c; g.fillRect(0, Math.round(i * bh), CW, Math.ceil(bh)); });
    for (let i = 1; i < bands.length; i++) { g.fillStyle = bands[i]; for (let x = (i % 2) * 4; x < CW; x += 8) g.fillRect(x, Math.round(i * bh) - 4, 4, 4); }
    if (!lowGfx) { for (let i = 0; i < 18; i++) { const sx = ((i * 97) % CW) & ~1, sy = Math.round(((i * 53) + camY * 0.2) % CH) & ~1; g.fillStyle = i % 4 ? '#83769c' : '#fff1e8'; g.fillRect(sx, sy, 2, 2); if (i % 6 === 0) { g.fillRect(sx - 2, sy, 6, 2); g.fillRect(sx, sy - 2, 2, 6); } } }
    if (shake > 0) g.translate(Math.round((shake * ((Math.floor(performance.now() / 16) % 2) ? 1 : -1)) * 0.6), 0);
    g.translate(0, Math.round(camY));
    // distant town skyline: stepped rooftops with a few lit windows (world space, so it sinks as you climb)
    const SKY = [28, 44, 44, 20, 60, 60, 36, 24, 52, 52, 52, 30, 40, 18, 46, 46, 26, 34];
    for (let i = 0; i < SKY.length; i++) { const bx = i * 20, h = SKY[i], by = CH - GROUND - h;
      g.fillStyle = '#12142a'; g.fillRect(bx, by, 20, h); g.fillStyle = '#1d2b53'; g.fillRect(bx, by, 20, 2);
      if (!lowGfx) { g.fillStyle = '#ffa300'; for (let wy = by + 8; wy < CH - GROUND - 6; wy += 12) if ((i * 7 + wy) % 3 === 0) g.fillRect(bx + 6, wy, 4, 4); } }
    // ground: grass lip over stepped dirt
    g.fillStyle = '#ab5236'; g.fillRect(0, CH - GROUND, CW, GROUND + 400);
    g.fillStyle = '#7e2553'; for (let x = 0; x < CW; x += 16) { g.fillRect(x, CH - GROUND + 12, 2, 8); g.fillRect(x + 8, CH - GROUND + 24, 2, 8); } g.fillRect(0, CH - GROUND + 20, CW, 2);
    g.fillStyle = '#00e436'; g.fillRect(0, CH - GROUND, CW, 4); g.fillStyle = '#008751'; g.fillRect(0, CH - GROUND + 4, CW, 2);
    for (let x = 4; x < CW; x += 12) { g.fillStyle = '#00e436'; g.fillRect(x, CH - GROUND - 2, 2, 2); }
    // best marker
    if (save.best > 0) {
      const by = Math.round(floorY(save.best));
      g.fillStyle = '#ffa300';
      for (let x = 0; x < CW; x += 12) g.fillRect(x, by, 6, 2);
      ptext('BEST ' + save.best, 4, by - 8, 1, '#ffec27', 'left');
    }
    tower.forEach((b, i) => block(b.x, floorY(i), b.w, b.c, b.s));
    if (mover && run.state === 'play') {
      const y = Math.round(floorY(tower.length));
      // drop guide: the top block's edges as dashed pixel lines
      const top = tower[tower.length - 1];
      g.fillStyle = '#c2c3c7'; for (let yy = y; yy < y + BH; yy += 6) { g.fillRect(Math.round(top.x), yy, 2, 3); g.fillRect(Math.round(top.x + top.w) - 2, yy, 2, 3); }
      block(mover.x, y, mover.w, mover.c, 1);
    }
    falling.forEach((f) => {
      // tumble in 90-degree-ish steps (8-bit) instead of smooth rotation
      const rot = Math.round(f.rot / (Math.PI / 8)) * (Math.PI / 8);
      g.save(); g.translate(Math.round(f.x + f.w / 2), Math.round(f.y + BH / 2)); g.rotate(rot);
      block(-f.w / 2, -BH / 2, f.w, f.c, 1); g.restore();
    });
    parts.forEach((p) => { g.fillStyle = p.t < 0.15 ? '#5f574f' : p.c; g.fillRect(Math.round(p.x / 2) * 2 - 3, Math.round(p.y / 2) * 2 - 3, 6, 6); });
    g.globalAlpha = 1;
    floats.forEach((f) => { ptext(f.text, Math.round(f.x), Math.round(f.y), 2, f.t < 0.2 ? '#c2c3c7' : f.color); });
    g.globalAlpha = 1;
    if (flash > 0 && !lowGfx) { g.setTransform(1, 0, 0, 1, 0, 0); g.fillStyle = flash > 0.15 ? 'rgba(255,241,232,0.3)' : 'rgba(255,241,232,0.12)'; g.fillRect(0, 0, CW, CH); }
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

  // first visit: the how-to card; later visits: a one-tap Play card
  $('how').hidden = save.hint;
  $('play').textContent = save.hint ? 'Play' : 'Got it, play';
  rng = MMRng.create('stack-tower:preview'); reset();
  medalList($('i-medals'));
  // R4 D4 (b15-r2-17): Play is no longer auto-focused (that made Tab go Play -> Menu -> off the page before Sound). Focus
  // starts at the top, so Tab runs Menu, Sound, board, Play in screen order; Enter / Space with nothing focused still
  // presses Play while the start card is up, so keyboard players start as fast as before.
  document.addEventListener('keydown', (ev) => {
    if (ev.key !== 'Enter' && ev.key !== ' ') return;
    const ae = document.activeElement;
    if (ae && ae !== document.body && ae !== document.documentElement && ae.id !== 'board') return; // the focused board starts the round too
    const pb = $('play');
    if (!pb || pb.offsetParent === null || pb.disabled || (window.MMNav && MMNav.isOpen && MMNav.isOpen())) return;
    ev.preventDefault(); pb.click();
  });
  try { if (save.medals.length && window.MMHubProfile) MMHubProfile.sync(localStorage, 'stack', save.medals.slice()); } catch (e) { /* optional */ }
  hud();
  requestAnimationFrame(frame);

  window.__stack = {
    get run() { return run; }, get save() { return save; }, get reduced() { return reduced; }, get lowGfx() { return lowGfx; },
    get mover() { return mover; }, get tower() { return tower.map((b) => ({ x: b.x, w: b.w })); },
    align(off) { const top = tower[tower.length - 1]; if (mover) mover.x = top.x + (off || 0); },
    drop, start, end, step(dt) { update(dt, true); },
    counts: () => ({ parts: parts.length, floats: floats.length, falling: falling.length, shake, flash, floatBoxes: floats.map((f) => ({ x: f.x, y: f.y, text: f.text })) }),
  };
}());
