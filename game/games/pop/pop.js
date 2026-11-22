// Pixel Pop: a 90-second merge puzzle. Tap 2+ touching twins: they pop into one tile a level higher on the tile you tapped.
// If the new tile lands next to its own twin it pops again on its own: a CHAIN (x2, x3 ... score multiplier).
// Pop 5+ at once for a Big pop (+2 levels). A new best tile of level 5+ adds 5 seconds.
// Own keys only: `pixeltown-pop-v1` (save) and `pixeltown-medals-pop-v1` (hub medal summary). No network, textContent only.
// Every board is seeded (MMRng): the seed is shown at the end and "Replay seed" plays the very same tiles again.
(function () {
  'use strict';
  const KEY = 'pixeltown-pop-v1', MKEY = 'pixeltown-medals-pop-v1';
  const W = 5, H = 6, CELL = 72, CW = W * CELL, CH = H * CELL, ROUND = 90;
  const MEDALS = [
    ['round1', 'First round', 'Finish a round'],
    ['chain5', '5x chain', 'Set up a 5x chain'],
    ['tile9', 'Make a 9', 'Merge up to a level 9 tile'],
    ['score25k', '25,000 points', 'Score 25,000 in one round'],
  ];
  const COLORS = ['#000', '#7fd18b', '#5cc8ff', '#c99bff', '#ff8fb1', '#ffb347', '#ffe066', '#ff6b6b', '#66f0d0', '#ffffff', '#f0a8ff', '#a8ffb0'];
  const $ = (id) => document.getElementById(id);
  const params = new URLSearchParams(location.search);
  const TEST = params.get('test') === '1';
  // idle hint: after 6 s without a pop the best move glows (static outline with reduced motion); ?hints=0 turns it off
  const HINTS = params.get('hints') !== '0', HINT_AFTER = 6;
  // combo audio ladder: each chain step plays a brighter sound (chain 1, 2, 3, 4+)
  const LADDER = ['pickup', 'claim', 'bag_rare', 'levelup'];
  let reduced = false, lowGfx = false;
  try { reduced = (window.MMMotion ? MMMotion.reduced(window, localStorage) : false) || !!(window.MMSideAccess && MMSideAccess.reduced()); } catch (e) { reduced = false; }
  try { lowGfx = !!(window.MMAccess && MMAccess.prefs.load(localStorage).lowGfx); } catch (e) { lowGfx = false; }
  let sfx = null;
  try { sfx = window.MMSfx ? MMSfx.create({ storage: localStorage }) : null; } catch (e) { sfx = null; }
  let lastSound = '';
  const play = (n) => { lastSound = n; try { if (sfx) sfx.play(n); } catch (e) { /* ignore */ } };

  // ---------- save ----------
  const int = (x, hi) => (typeof x === 'number' && isFinite(x) && x >= 0 ? Math.min(hi, Math.floor(x)) : 0);
  function load() {
    let o = null;
    try { const s = localStorage.getItem(KEY); if (typeof s === 'string' && s.length < 4000) o = JSON.parse(s); } catch (e) { o = null; }
    if (!o || typeof o !== 'object' || Array.isArray(o)) o = {};
    const ok = MEDALS.map((m) => m[0]);
    return { v: 1, hint: o.hint === true, best: int(o.best, 1e9), bestTile: int(o.bestTile, 99), bestChain: int(o.bestChain, 99), rounds: int(o.rounds, 1e9),
      medals: Array.isArray(o.medals) ? o.medals.filter((m, i, a) => ok.indexOf(m) >= 0 && a.indexOf(m) === i) : [] };
  }
  let save = load();
  const hubSync = () => { try { if (window.MMHubProfile && MMHubProfile.sync) MMHubProfile.sync(localStorage, 'pop', save.medals.slice()); } catch (e) { /* hub map progress is optional */ } };
  if (save.medals.length) hubSync(); // medals won before the arcade map group existed reach the Hub map too
  function persist() {
    try { localStorage.setItem(KEY, JSON.stringify(save)); localStorage.setItem(MKEY, JSON.stringify({ v: 1, m: save.medals.slice() })); } catch (e) { /* storage refused: play on */ }
    hubSync();
  }
  function award(id) { if (save.medals.indexOf(id) >= 0) return false; save.medals.push(id); run.newMedals.push(id); persist(); return true; }

  // ---------- board ----------
  const canvas = $('board'), g = canvas.getContext('2d');
  canvas.width = CW; canvas.height = CH;
  let rng = null, nextId = 1;
  let grid = []; // grid[c][r] = {v, id, y, s, wob}
  const run = { state: 'ready', seed: '', score: 0, time: ROUND, maxTile: 0, bestChain: 0, pops: 0, newMedals: [] };
  let cur = { c: 2, r: 3 }, showCur = false;
  let parts = [], floats = [], shake = 0;
  let idle = 0, hint = null, preview = null, pulse = 0;

  function spawnV() {
    const pool = [1, 1, 2, 2, 3, 4];
    if (run.maxTile >= 7) pool.push(5);
    return pool[Math.floor(rng.next() * pool.length)];
  }
  const tile = (v, y) => ({ v, id: nextId++, y, s: 1, wob: 0 });
  function fill() {
    grid = [];
    for (let c = 0; c < W; c++) { grid.push([]); for (let r = 0; r < H; r++) grid[c].push(tile(spawnV(), r - H - 1)); }
    if (!hasMove()) grid[0][H - 1].v = grid[1][H - 1].v;
  }
  function flood(c, r) {
    const v = grid[c][r].v, seen = {}, out = [], st = [[c, r]];
    while (st.length) {
      const [x, y] = st.pop(), k = x + ',' + y;
      if (seen[k] || x < 0 || y < 0 || x >= W || y >= H || grid[x][y].v !== v) continue;
      seen[k] = 1; out.push([x, y]);
      st.push([x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]);
    }
    return out;
  }
  function hasMove() {
    for (let c = 0; c < W; c++) for (let r = 0; r < H; r++) {
      const v = grid[c][r].v;
      if ((c + 1 < W && grid[c + 1][r].v === v) || (r + 1 < H && grid[c][r + 1].v === v)) return true;
    }
    return false;
  }
  function gravity() {
    for (let c = 0; c < W; c++) {
      const col = grid[c].filter(Boolean);
      const miss = H - col.length;
      const add = [];
      for (let i = 0; i < miss; i++) add.push(tile(spawnV(), -1 - (miss - 1 - i) - 0.3));
      grid[c] = add.concat(col);
    }
  }
  // what popping (c, r) would do, without touching the board or the RNG: group size, the new tile and the chain it
  // sets off (refilled tiles are unknown, so they count as blanks: the real chain can only be longer)
  function predict(c, r) {
    if (!grid[c] || !grid[c][r]) return null;
    const sim = grid.map((col) => col.map((t) => t.v));
    const fl = (x0, y0) => {
      const v = sim[x0][y0], seen = {}, out = [], st = [[x0, y0]];
      if (!v) return out;
      while (st.length) { const [x, y] = st.pop(), k = x + ',' + y; if (seen[k] || x < 0 || y < 0 || x >= W || y >= H || sim[x][y] !== v) continue; seen[k] = 1; out.push([x, y]); st.push([x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]); }
      return out;
    };
    const first = fl(c, r);
    if (first.length < 2) return null;
    let g2 = first, at = [c, r], chain = 0, v = sim[c][r];
    while (g2.length >= 2 && chain < 12) {
      chain++;
      v = sim[at[0]][at[1]] + (g2.length >= 5 ? 2 : 1);
      g2.forEach(([x, y]) => { sim[x][y] = null; });
      sim[at[0]][at[1]] = -1;
      for (let x = 0; x < W; x++) { const col = sim[x].filter((q) => q !== null); while (col.length < H) col.unshift(0); sim[x] = col; }
      for (let x = 0; x < W; x++) for (let y = 0; y < H; y++) if (sim[x][y] === -1) { at = [x, y]; sim[x][y] = v; }
      g2 = fl(at[0], at[1]);
    }
    return { cells: first, size: first.length, chain, tile: v };
  }
  function bestMove() {
    let best = null;
    for (let c = 0; c < W; c++) for (let r = 0; r < H; r++) {
      const p = predict(c, r); if (!p) continue;
      const sc = p.chain * 100 + p.size * 10 + p.tile;
      if (!best || sc > best.sc) best = Object.assign({ c, r, sc }, p);
    }
    return best;
  }
  function find(id) { for (let c = 0; c < W; c++) for (let r = 0; r < H; r++) if (grid[c][r].id === id) return [c, r]; return null; }

  // ---------- feedback ----------
  function burst(c, r, color, n) {
    n = lowGfx ? Math.min(6, n, Math.max(0, 24 - parts.length)) : n;
    const cx = c * CELL + CELL / 2, cy = r * CELL + CELL / 2;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + (i % 3) * 0.4, sp = 60 + (i * 37) % 140;
      parts.push({ x: cx, y: cy, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 40, t: 0.5 + (i % 4) * 0.08, c: color });
    }
    if (parts.length > 200) parts.splice(0, parts.length - 200);
  }
  function floatText(c, r, text, color) { floats.push({ x: c * CELL + CELL / 2, y: r * CELL + CELL / 2, text, color: color || '#fff', t: 0.9 }); }
  function bump(n) { if (!reduced) shake = Math.max(shake, n); }
  const msg = (t) => { $('msg').textContent = t; };

  // ---------- turn ----------
  function tap(c, r) {
    if (run.state !== 'play') return false;
    if (c < 0 || r < 0 || c >= W || r >= H) return false;
    const grp = flood(c, r);
    idle = 0; hint = null;
    if (grp.length < 2) { grid[c][r].wob = 0.35; msg('Needs a touching twin: 2 or more of the same tile.'); play('ui_tap'); return false; }
    let id = grid[c][r].id, chain = 0, gained = 0, g2 = grp, at = [c, r];
    while (g2.length >= 2) {
      chain++;
      const t = grid[at[0]][at[1]], v = t.v, big = g2.length >= 5;
      const pts = 10 * v * g2.length * chain;
      gained += pts;
      g2.forEach(([x, y]) => { if (x !== at[0] || y !== at[1]) { burst(x, y, COLORS[v], 8); grid[x][y] = null; } });
      t.v = v + (big ? 2 : 1); t.s = 1.45; id = t.id;
      burst(at[0], at[1], COLORS[Math.min(t.v, COLORS.length - 1)], big ? 22 : 12);
      floatText(at[0], at[1], '+' + pts + (chain > 1 ? '  x' + chain : ''), chain > 1 ? '#ffd166' : '#fff');
      if (big) floatText(at[0], Math.max(0, at[1] - 1), 'Big pop!', '#66f0d0');
      if (t.v > run.maxTile) {
        if (t.v >= 5 && run.maxTile >= 4) { run.time = Math.min(ROUND, run.time + 5); floatText(at[0], Math.min(H - 1, at[1] + 1), '+5s', '#7fd18b'); msg('New best tile: level ' + t.v + '. Plus 5 seconds!'); }
        run.maxTile = t.v;
      }
      gravity();
      at = find(id);
      g2 = flood(at[0], at[1]);
    }
    run.score += gained; run.pops++;
    if (chain > run.bestChain) run.bestChain = chain;
    if (chain >= 2) { msg('Chain x' + chain + '!'); bump(3 + chain * 2); }
    play(LADDER[Math.min(chain, LADDER.length) - 1]);
    if (chain >= 5) award('chain5');
    if (run.maxTile >= 9) award('tile9');
    if (run.score >= 25000) award('score25k');
    if (!hasMove()) {
      let tries = 0;
      do {
        const all = []; grid.forEach((col) => col.forEach((t) => all.push(t.v)));
        const sh = rng.shuffle(all);
        for (let x = 0; x < W; x++) for (let y = 0; y < H; y++) grid[x][y].v = sh[x * H + y];
      } while (!hasMove() && ++tries < 20);
      if (!hasMove()) grid[0][H - 1].v = grid[1][H - 1].v;
      msg('No twins left: shuffled!');
    }
    preview = null;
    hud();
    return { chain, gained };
  }

  // ---------- flow ----------
  function newSeed() { return (Date.now().toString(36) + (save.rounds % 1296).toString(36)).slice(-8); }
  function start(seed) {
    run.seed = (typeof seed === 'string' && /^[A-Za-z0-9_-]{1,24}$/.test(seed)) ? seed : newSeed();
    rng = MMRng.create('pixel-pop:' + run.seed);
    Object.assign(run, { state: 'play', score: 0, time: ROUND, maxTile: 3, bestChain: 0, pops: 0, newMedals: [] });
    parts = []; floats = []; idle = 0; hint = null; preview = null; fill();
    $('intro').hidden = true; $('result').hidden = true;
    msg(save.rounds === 0 ? 'Tap two touching twins to pop them.' : 'Seed ' + run.seed + '. Go!');
    hud();
  }
  function end() {
    if (run.state !== 'play') return;
    run.state = 'over';
    save.rounds++;
    const prevBest = save.best, prevTile = save.bestTile, prevChain = save.bestChain;
    const newBest = run.score > save.best;
    if (newBest) save.best = run.score;
    if (run.maxTile > save.bestTile) save.bestTile = run.maxTile;
    if (run.bestChain > save.bestChain) save.bestChain = run.bestChain;
    award('round1');
    persist();
    play('levelup');
    showResult(newBest, prevBest, prevTile, prevChain);
    $('result').hidden = false;
    msg('');
    if (resCard) resCard.focus(); else $('again').focus({ preventScroll: true });
    hud();
  }
  // MK1: the shared result card (MMMiniKit); ids r-score / r-best / r-line / r-new / r-medals / again / replay kept
  const rMedals = $('r-medals');
  let resCard = null;
  function showResult(newBest, prevBest, prevTile, prevChain) {
    medalList(rMedals);
    const lines = [
      { id: 'r-best', text: newBest ? 'New personal best!' : 'Best: ' + save.best, cls: newBest ? 'new' : 'dim' },
      { id: 'r-line', text: 'Best tile ' + run.maxTile + ' / best chain x' + run.bestChain + ' / seed ' + run.seed, cls: 'dim' },
      { id: 'r-new', text: run.newMedals.length ? 'New medal: ' + run.newMedals.map((m) => MEDALS.find((x) => x[0] === m)[1]).join(', ') : '', cls: 'new' },
    ];
    if (!window.MMMiniKit) {
      // fallback without the kit: the old static card
      $('r-score').textContent = String(run.score); lines.forEach((l) => { $(l.id).textContent = l.text; $(l.id).className = l.cls; });
      return;
    }
    const K = window.MMMiniKit;
    const vm = K.result({
      headline: ['Time! ', { text: String(run.score), id: 'r-score' }, ' points'],
      stats: [
        { label: 'Score', value: K.fmt(run.score), best: newBest && prevBest > 0 },
        { label: 'Best tile', value: String(run.maxTile), best: run.maxTile > prevTile && prevTile > 0 },
        { label: 'Best chain', value: 'x' + run.bestChain, best: run.bestChain > prevChain && prevChain > 0 },
      ],
      lines,
      goalText: nextGoal(),
      seed: run.seed,
      menuHref: '../../index.html',
      ids: { again: 'again', replay: 'replay', code: 'r-code', copy: 'r-copy', goal: 'r-goal' },
    });
    resCard = K.panel($('result'), vm, { again: () => start(), replay: (sd) => start(sd), extra: [rMedals], holdMs: 400 });
  }
  function medalList(ul) {
    while (ul.firstChild) ul.removeChild(ul.firstChild);
    MEDALS.forEach((m) => { const li = document.createElement('li'); const on = save.medals.indexOf(m[0]) >= 0; li.className = on ? 'on' : ''; li.textContent = (on ? '★ ' : '☆ ') + m[1]; li.title = m[2]; ul.appendChild(li); });
  }
  function nextGoal() { const m = MEDALS.find((x) => save.medals.indexOf(x[0]) < 0); return m ? 'Goal: ' + m[2] : 'All medals won. Chase your best!'; }
  function hud() {
    $('h-score').textContent = String(run.score);
    $('h-time').textContent = String(Math.max(0, Math.ceil(run.time)));
    $('h-best').textContent = String(Math.max(save.best, run.state === 'play' ? 0 : run.score));
    $('h-tile').textContent = String(run.maxTile || '-');
    $('timefill').style.transform = 'scaleX(' + Math.max(0, Math.min(1, run.time / ROUND)) + ')';
    $('goal').textContent = nextGoal();
  }

  // ---------- draw ----------
  function rr(x, y, w, h, r) { g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath(); }
  function drawTile(t, c) {
    const col = COLORS[Math.min(t.v, COLORS.length - 1)];
    const wob = t.wob > 0 ? Math.sin(t.wob * 40) * 4 : 0;
    const cx = c * CELL + CELL / 2 + wob, cy = t.y * CELL + CELL / 2, sz = (CELL - 8) * t.s;
    g.save(); g.translate(cx, cy);
    g.fillStyle = '#0006'; rr(-sz / 2 + 2, -sz / 2 + 4, sz, sz, 12); g.fill();
    g.fillStyle = col; rr(-sz / 2, -sz / 2, sz, sz, 12); g.fill();
    g.fillStyle = '#ffffff55'; g.fillRect(-sz / 2 + 8, -sz / 2 + 6, sz * 0.35, 6); g.fillRect(-sz / 2 + 8, -sz / 2 + 12, 6, 6);
    g.fillStyle = '#00000022'; g.fillRect(-sz / 2 + 6, sz / 2 - 10, sz - 12, 5);
    // pixel face: two eyes, mouth grows with level
    g.fillStyle = '#1b1830';
    g.fillRect(-12, -6, 6, 8); g.fillRect(6, -6, 6, 8);
    g.fillRect(-6, 8, 12, t.v >= 4 ? 5 : 3);
    g.font = 'bold 16px ui-monospace, Menlo, monospace'; g.textAlign = 'right'; g.textBaseline = 'top';
    g.fillText(String(t.v), sz / 2 - 6, -sz / 2 + 5);
    if (t.v >= 6) { g.fillStyle = '#fff'; g.fillRect(-4, -sz / 2 - 3, 8, 6); }
    g.restore();
  }
  // outline every tile of a group and badge the tapped one with the chain it sets off
  function outline(p, col, a) {
    g.save(); g.globalAlpha = a; g.strokeStyle = col; g.lineWidth = 4;
    p.cells.forEach(([x, y]) => { rr(x * CELL + 3, y * CELL + 3, CELL - 6, CELL - 6, 12); g.stroke(); });
    if (p.chain > 1) {
      const bx = p.c * CELL + CELL / 2, by = (p.r + 1) * CELL - 13; // bottom of the tile: keeps its level number readable
      g.globalAlpha = 1; g.fillStyle = '#1b1830'; rr(bx - 20, by - 10, 40, 20, 8); g.fill();
      g.fillStyle = col; g.font = 'bold 14px ui-monospace, Menlo, monospace'; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillText('x' + p.chain, bx, by + 1);
    }
    g.restore();
  }
  function setPreview(c, r) {
    const p = (c >= 0 && r >= 0 && c < W && r < H && run.state === 'play') ? predict(c, r) : null;
    preview = p ? Object.assign({ c, r }, p) : null;
  }
  let last = 0;
  function update(dt, manual) {
    if (run.state === 'play' && (!TEST || manual)) {
      run.time -= dt; if (run.time <= 0) { run.time = 0; end(); }
      idle += dt;
      if (HINTS && !hint && idle >= HINT_AFTER && run.state === 'play') { hint = bestMove(); if (hint) msg(hint.chain > 1 ? 'Psst: this group sets off a x' + hint.chain + ' chain.' : 'Psst: try the glowing group.'); }
    }
    pulse += dt;
    for (let c = 0; c < W; c++) for (let r = 0; r < H; r++) {
      const t = grid[c] && grid[c][r]; if (!t) continue;
      if (reduced) { t.y = r; t.s = 1; t.wob = 0; continue; }
      t.y = t.y < r ? Math.min(r, t.y + dt * (6 + (r - t.y) * 10)) : r;
      t.s += (1 - t.s) * Math.min(1, dt * 12);
      t.wob = Math.max(0, t.wob - dt);
    }
    parts.forEach((p) => { p.x += p.vx * dt; p.y += p.vy * dt; p.vy += 300 * dt; p.t -= dt; });
    parts = parts.filter((p) => p.t > 0);
    floats.forEach((f) => { f.y -= 40 * dt; f.t -= dt; });
    floats = floats.filter((f) => f.t > 0);
    shake = Math.max(0, shake - dt * 30);
  }
  function draw() {
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.fillStyle = '#120f22'; g.fillRect(0, 0, CW, CH);
    if (shake > 0) g.translate((shake * ((Math.floor(performance.now() / 16) % 2) ? 1 : -1)) * 0.6, 0);
    g.fillStyle = '#1b1733';
    for (let c = 0; c < W; c++) for (let r = 0; r < H; r++) if ((c + r) % 2) g.fillRect(c * CELL, r * CELL, CELL, CELL);
    for (let c = 0; c < W; c++) for (let r = 0; r < H; r++) { const t = grid[c] && grid[c][r]; if (t) drawTile(t, c); }
    if (run.state === 'play') {
      if (hint) outline(hint, '#ffd166', reduced ? 1 : 0.55 + 0.45 * Math.abs(Math.sin(pulse * 3)));
      if (preview && (!hint || preview.c !== hint.c || preview.r !== hint.r)) outline(preview, '#ffffff', 0.9);
    }
    if (showCur && run.state === 'play') { g.strokeStyle = '#fff'; g.lineWidth = 3; rr(cur.c * CELL + 2, cur.r * CELL + 2, CELL - 4, CELL - 4, 12); g.stroke(); }
    parts.forEach((p) => { g.globalAlpha = Math.min(1, p.t * 2); g.fillStyle = p.c; g.fillRect(p.x - 3, p.y - 3, 6, 6); });
    g.globalAlpha = 1;
    g.font = 'bold 18px ui-monospace, Menlo, monospace'; g.textAlign = 'center'; g.textBaseline = 'middle';
    floats.forEach((f) => { g.globalAlpha = Math.min(1, f.t * 2); g.fillStyle = '#000'; g.fillText(f.text, f.x + 1, f.y + 2); g.fillStyle = f.color; g.fillText(f.text, f.x, f.y); });
    g.globalAlpha = 1;
  }
  let lastHud = -1;
  function frame(ts) {
    const dt = last ? Math.min(0.05, (ts - last) / 1000) : 0; last = ts;
    update(dt, false);
    draw();
    const s = Math.ceil(run.time); if (s !== lastHud) { lastHud = s; hud(); }
    requestAnimationFrame(frame);
  }

  // ---------- input ----------
  function cellAt(ev) {
    const b = canvas.getBoundingClientRect();
    return { c: Math.floor(((ev.clientX - b.left) / b.width) * W), r: Math.floor(((ev.clientY - b.top) / b.height) * H) };
  }
  canvas.addEventListener('pointerdown', (ev) => { ev.preventDefault(); showCur = false; const p = cellAt(ev); tap(p.c, p.r); });
  // chain preview: a mouse hovering a group outlines it and shows the chain it would set off (touch taps pop at once)
  canvas.addEventListener('pointermove', (ev) => { if (ev.pointerType !== 'mouse') return; const p = cellAt(ev); setPreview(p.c, p.r); });
  canvas.addEventListener('pointerleave', () => { preview = null; });
  document.addEventListener('keydown', (ev) => {
    if (run.state !== 'play') return;
    const ae = document.activeElement; if (ae && ae !== canvas && /^(BUTTON|A|INPUT)$/.test(ae.tagName)) return;
    const k = ev.key, mv = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1], a: [-1, 0], d: [1, 0], w: [0, -1], s: [0, 1] }[k];
    if (mv) { cur.c = Math.max(0, Math.min(W - 1, cur.c + mv[0])); cur.r = Math.max(0, Math.min(H - 1, cur.r + mv[1])); showCur = true; setPreview(cur.c, cur.r); ev.preventDefault(); }
    else if (k === 'Enter' || k === ' ') { showCur = true; tap(cur.c, cur.r); ev.preventDefault(); }
  });
  // ?seed= takes a share code (A-Z0-9, any case) or the old seed form; anything else is ignored (a fresh seed)
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
  rng = MMRng.create('pixel-pop:preview'); fill(); run.maxTile = 0;
  medalList($('i-medals'));
  try { $('play').focus({ preventScroll: true }); } catch (e) { /* ignore */ }
  hud();
  requestAnimationFrame(frame);

  window.__pop = {
    get run() { return run; }, get save() { return save; }, get reduced() { return reduced; }, get lowGfx() { return lowGfx; },
    values: () => grid.map((col) => col.map((t) => t.v)),
    set(vals) { for (let c = 0; c < W; c++) for (let r = 0; r < H; r++) grid[c][r].v = vals[c][r]; },
    tap, start, end, step(dt) { update(dt, true); }, flood: (c, r) => flood(c, r).length, hasMove,
    counts: () => ({ parts: parts.length, floats: floats.length, shake }),
    get hint() { return hint; }, get preview() { return preview; }, get lastSound() { return lastSound; }, get hintsOn() { return HINTS; },
    predict, bestMove, setPreview,
  };
}());
