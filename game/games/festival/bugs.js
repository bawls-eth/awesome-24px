// Bug Safari page: canvas rendering, input, arena select, journal, summary. Logic lives in shared/mm-bugs.js.
(function () {
  'use strict';
  var B = window.MMBugs, R = window.MMRng, S = window.MMStore;
  var KEY = 'pixeltown-bugs-v1';
  var TILE = 16, W = 20, H = 14;
  var WALK = 4, SNEAK_SPEED = 2;
  var qs = new URLSearchParams(location.search);
  var TEST = qs.get('test') === '1';
  var mq = window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)') : null;
  // Reduced motion: the OS setting, or the shared "screen flashes off" pref (MMSideAccess sets data-reduce-motion on <html>).
  var sideReduced = function () { try { return !!(window.MMSideAccess && window.MMSideAccess.reduced()); } catch (e) { return false; } };
  var reduced = !!(mq && mq.matches) || sideReduced();
  if (mq && mq.addEventListener) mq.addEventListener('change', function (e) { reduced = e.matches || sideReduced(); });

  var NAMES = { meadow: 'Meadow', orchard: 'Orchard', pond: 'Pond Edge', forest: 'Forest', dunes: 'Dunes', cliffs: 'Cliffs', marsh: 'Marsh', lantern: 'Lantern Glade', glade: 'Night Glade' };
  var THEME = {
    meadow: ['#5b9b3f', '#4f8d36', '#ffd166', 'flower'], orchard: ['#6aa84f', '#5a9a42', '#e63946', 'fruit'],
    pond: ['#5f9e5a', '#4f8f50', '#4aa3df', 'water'], forest: ['#3f7a3a', '#357032', '#2c5a2a', 'tree'],
    dunes: ['#e0c27a', '#d4b36a', '#b5883a', 'rock'], cliffs: ['#8a8f8a', '#7c817c', '#5d625d', 'rock'],
    marsh: ['#58805a', '#4b724e', '#79b8c9', 'water'], lantern: ['#2d4a4f', '#264043', '#ffd166', 'lantern'],
    glade: ['#1f3d3a', '#1a3533', '#9be564', 'glade']
  };
  var ALL = B.ALL_ARENAS; // 8 arenas, then the Night Glade variant (unlock order)
  var GOALS_KEY = 'pixeltown-bugs-goals-v1', MEDALS_KEY = 'pixeltown-medals-bugs-v1';
  var SPECIES = ['ladybug', 'butterfly', 'beetle', 'cricket', 'antlion', 'goldbeetle', 'moonwing'];
  var SP_NAME = { ladybug: 'Ladybug', butterfly: 'Butterfly', beetle: 'Beetle', cricket: 'Cricket', antlion: 'Antlion', goldbeetle: 'Gold Beetle', moonwing: 'Moonwing', firefly: 'Firefly', glowmoth: 'Glowmoth' };

  // ---------- save ----------
  function sanitize(raw) { return B.cleanSave(raw); }
  var save = sanitize(S.get(KEY, null));
  var goals = B.cleanGoals(S.get(GOALS_KEY, null));
  // Own additive keys only: the run save, the goals list, and the hub medal summary {v:1,m:[...]} (read by hub/medals.js).
  function persist() { S.set(KEY, { v: 1, stars: save.stars, best: save.best, journal: save.journal }); S.set(GOALS_KEY, goals); S.set(MEDALS_KEY, { v: 1, m: B.medalsFor(save, goals) }); try { var st = totalStars(), j = save.journal; window.MMHubProfile.sync(localStorage, 'bugs', [Object.keys(j).some(function (k) { return j[k] > 0; }) && 'catch1', st >= 6 && 'stars6', (j.goldbeetle > 0 || j.moonwing > 0) && 'rare', st >= 24 && 'stars24']); } catch (e) { /* hub map progress is optional */ } }
  persist();
  function arenaStars() { return ALL.reduce(function (n, a) { return n + save.stars[a.id]; }, 0); }
  function totalStars() { return arenaStars() + B.goalStars(goals); } // score stars + one per finished journal goal
  function needStars(i) { return i * 2; }
  function unlocked(i) { return totalStars() >= needStars(i); }

  // ---------- state ----------
  var cv = document.getElementById('game'), ctx = cv.getContext('2d');
  var overlay = document.getElementById('overlay');
  var mode = 'menu'; // menu | play | summary
  var game = null, arenaId = null, rng = null, meta = null, popups = [], particles = [], shake = 0, swingAnim = 0, face = { x: 1, y: 0 };
  var bgCache = {}, gmeta = {};
  var keys = {}, joy = { x: 0, y: 0 }, sneakBtn = false;
  var testClock = TEST;
  var lastSummary = null, testSneak = false;
  var HINT_KEY = 'pixeltown-bugs-hint-v1';
  var hintOpen = false;
  var sfx = null;
  function hintSeen() { try { return localStorage.getItem(HINT_KEY) === '1'; } catch (e) { return false; } }
  // Sound: MMSfx is created lazily on the first user gesture and respects the stored mute flag.
  function ensureSfx() {
    if (sfx || !window.MMSfx) return sfx;
    try { sfx = window.MMSfx.create({ storage: window.localStorage }); } catch (e) { sfx = null; }
    syncMute();
    return sfx;
  }
  function beep(name) { if (sfx) { try { sfx.play(name); } catch (e) { /* ignore */ } } }
  function syncMute() {
    var b = document.getElementById('btn-mute'); if (!b) return;
    var m = sfx ? sfx.isMuted() : mutedStored();
    b.textContent = m ? 'Sound off' : 'Sound on'; b.setAttribute('aria-pressed', m ? 'true' : 'false');
  }
  function mutedStored() { try { return localStorage.getItem('mm-sfx-muted') === '1'; } catch (e) { return false; } }
  function gesture() { if (!sfx) ensureSfx(); }
  ['pointerdown', 'keydown', 'touchstart'].forEach(function (n) { window.addEventListener(n, gesture, { once: false, passive: true }); });

  function $(id) { return document.getElementById(id); }
  function el(tag, text, cls) { var e = document.createElement(tag); if (text !== undefined) e.textContent = text; if (cls) e.className = cls; return e; }
  function clear(n) { while (n.firstChild) n.removeChild(n.firstChild); }
  function btn(text, fn, disabled) { var b = el('button', text); b.type = 'button'; if (disabled) b.disabled = true; else b.addEventListener('click', fn); return b; }
  function mult(c) { return Math.pow(B.COMBO_MULT, Math.max(0, Math.min(c, 6) - 1)); }

  // ---------- run control ----------
  function startArena(id, opts) {
    opts = opts || {};
    var a = B.arena(id); if (!a) return null;
    arenaId = id;
    var seed = opts.seed !== undefined ? opts.seed : (String(Date.now()) + Math.random());
    game = B.createRun({ seed: seed, arena: id, night: !!a.night, glade: !!a.glade, width: W, height: H, empty: !!opts.empty, count: opts.count });
    rng = R.create('page:' + seed);
    meta = {}; gmeta = {}; popups = []; particles = []; shake = 0; swingAnim = 0;
    mode = 'play'; overlay.hidden = true;
    $('hud-arena').textContent = NAMES[id];
    if (!hintSeen()) showHint(); else hideHint();
    return game;
  }
  function metaFor(b) {
    var m = meta[b.id];
    if (!m) m = meta[b.id] = { a: rng.next() * 6.28, t: rng.next() * 2, caughtAt: -1, ph: rng.next() * 6.28 };
    return m;
  }
  function doSwing() {
    if (mode !== 'play' || !game) return { swung: false, caught: [] };
    var before = game.state.score;
    var res = game.swing();
    if (res.swung) {
      swingAnim = 0.22; beep(res.caught.length ? 'pickup' : 'hit');
      if (res.caught.length) {
        var st = game.state;
        game.state.bugs.forEach(function (b) {
          if (res.caught.indexOf(b.id) < 0) return;
          metaFor(b).caughtAt = st.time;
          var pts = B.TYPES[b.type].points;
          popups.push({ x: b.x, y: b.y, t: 0, text: '+' + pts + (st.combo > 1 ? ' x' + mult(st.combo).toFixed(1) : '') });
          if (!reduced) for (var i = 0; i < 4; i++) particles.push({ x: b.x, y: b.y, vx: (rng.next() - .5) * 3, vy: (rng.next() - .5) * 3, t: 0 });
        });
        if (!reduced) shake = 0.12;
      }
    }
    void before;
    return res;
  }
  function endRun() {
    var st = game.state, score = Math.round(st.score), stars = B.starsFor(arenaId, score);
    var prevBest = save.best[arenaId], prevStars = save.stars[arenaId];
    var oldTotal = totalStars();
    if (stars > prevStars) save.stars[arenaId] = stars;
    if (score > prevBest) save.best[arenaId] = Math.min(99999, score);
    var counts = {};
    st.caughtTypes.forEach(function (t) { counts[t] = (counts[t] || 0) + 1; if (save.journal[t] !== undefined) save.journal[t] = Math.min(999999, save.journal[t] + 1); });
    var doneBefore = goals.done[arenaId] || [], newGoals = [];
    B.goalsMet(arenaId, st).forEach(function (gid) { if (doneBefore.indexOf(gid) < 0) newGoals.push(gid); });
    if (newGoals.length) goals = B.cleanGoals({ v: 1, done: Object.assign({}, goals.done, (function () { var o = {}; o[arenaId] = doneBefore.concat(newGoals); return o; })()) });
    persist();
    var newly = [];
    ALL.forEach(function (a, i) { if (!(oldTotal >= needStars(i)) && unlocked(i)) newly.push(NAMES[a.id]); });
    var gained = Math.max(0, stars - prevStars);
    var nextHint = '';
    for (var ni = 0; ni < ALL.length; ni++) {
      if (!unlocked(ni)) { nextHint = NAMES[ALL[ni].id] + ' unlocks at ' + needStars(ni) + ' stars (you have ' + totalStars() + ').'; break; }
    }
    if (!nextHint) nextHint = 'Every arena is unlocked. Go for 3 stars everywhere!';
    lastSummary = { arena: arenaId, score: score, stars: stars, gained: gained, bestCombo: st.bestCombo, hint: nextHint, caught: st.caught, counts: counts, best: save.best[arenaId], newlyUnlocked: newly, newBest: score > prevBest,
      goals: newGoals.map(function (gid) { return B.goalsFor(arenaId).filter(function (g) { return g.id === gid; })[0].text; }) };
    mode = 'summary';
    hideHint();
    if (gained > 0) beep('levelup');
    showSummary();
  }

  // advance game time; used by loop and test hook
  function step(dt) {
    if (mode !== 'play' || !game) return;
    var left = dt;
    while (left > 1e-9 && mode === 'play') {
      var d = Math.min(left, 0.05); left -= d;
      movePlayer(d);
      game.update(d);
      if (!game.state.done && B.RUN_SECONDS - game.state.time < 1e-6) game.update(1e-5); // float drift guard
      wander(d);
      fx(d);
      if (game.state.done) endRun();
    }
  }
  function movePlayer(dt) {
    var dx = joy.x, dy = joy.y;
    if (keys.ArrowLeft || keys.KeyA) dx -= 1;
    if (keys.ArrowRight || keys.KeyD) dx += 1;
    if (keys.ArrowUp || keys.KeyW) dy -= 1;
    if (keys.ArrowDown || keys.KeyS) dy += 1;
    var L = Math.hypot(dx, dy);
    var p = game.state.player;
    var sneaking = !!(keys.ShiftLeft || keys.ShiftRight || sneakBtn || testSneak);
    if (L > 0.01) {
      if (L > 1) { dx /= L; dy /= L; L = 1; }
      face = { x: dx / L, y: dy / L };
      var sp = (sneaking ? SNEAK_SPEED : WALK) * Math.min(1, L);
      p.x = Math.max(0.5, Math.min(W - 0.5, p.x + dx * sp * dt));
      p.y = Math.max(0.5, Math.min(H - 0.5, p.y + dy * sp * dt));
    }
    game.setPlayer(p.x, p.y, sneaking);
  }
  function wander(dt) {
    var st = game.state;
    st.bugs.forEach(function (b) {
      var m = b.group ? (gmeta[b.group] || (gmeta[b.group] = { a: rng.next() * 6.28, t: 1 })) : metaFor(b);
      if (b.state === 'idle') {
        if (!b.group || b.id === groupLead(b)) m.t -= dt; if (m.t <= 0) { m.a = rng.next() * 6.28; m.t = 0.8 + rng.next() * 1.6; }
        var sp = B.TYPES[b.type].speed * 0.45;
        b.x += Math.cos(m.a) * sp * dt; b.y += Math.sin(m.a) * sp * dt;
      }
      b.x = Math.max(0.3, Math.min(W - 0.3, b.x)); b.y = Math.max(0.3, Math.min(H - 0.3, b.y));
    });
  }
  function groupLead(b) { var id = b.id; game.state.bugs.forEach(function (o) { if (o.group === b.group && o.state !== 'caught' && o.id < id) id = o.id; }); return id; }
  function fx(dt) {
    swingAnim = Math.max(0, swingAnim - dt); shake = Math.max(0, shake - dt);
    popups.forEach(function (p) { p.t += dt; p.y -= dt * (reduced ? 0 : 1.2); });
    popups = popups.filter(function (p) { return p.t < 0.9; });
    particles.forEach(function (p) { p.t += dt; p.x += p.vx * dt; p.y += p.vy * dt; });
    particles = particles.filter(function (p) { return p.t < 0.4; });
    if (particles.length > 24) particles.length = 24;
  }

  // ---------- drawing ----------
  function hash(x, y) { var h = (x * 374761393 + y * 668265263) >>> 0; h = (h ^ (h >>> 13)) * 1274126177 >>> 0; return (h ^ (h >>> 16)) >>> 0; }
  function background(id) {
    if (bgCache[id]) return bgCache[id];
    var c = document.createElement('canvas'); c.width = W * TILE; c.height = H * TILE; var g = c.getContext('2d');
    var th = THEME[id];
    for (var y = 0; y < H; y++) for (var x = 0; x < W; x++) {
      g.fillStyle = (x + y) % 2 ? th[0] : th[1]; g.fillRect(x * TILE, y * TILE, TILE, TILE);
      var h = hash(x, y), px = x * TILE, py = y * TILE;
      if (h % 5 === 0) { g.fillStyle = 'rgba(255,255,255,.12)'; g.fillRect(px + (h >> 4) % 12, py + (h >> 8) % 12, 2, 3); }
      if (h % 11 === 0) {
        g.fillStyle = th[2]; var kind = th[3], ox = px + 4 + (h >> 5) % 8, oy = py + 4 + (h >> 9) % 8;
        if (kind === 'flower') { g.fillRect(ox, oy, 3, 3); g.fillStyle = '#fff'; g.fillRect(ox + 1, oy + 1, 1, 1); }
        else if (kind === 'fruit') { g.beginPath(); g.arc(ox, oy, 2.5, 0, 6.3); g.fill(); g.fillStyle = '#3a6b2a'; g.fillRect(ox, oy - 4, 1, 2); }
        else if (kind === 'water') { g.fillRect(ox - 3, oy, 8, 4); g.fillStyle = 'rgba(255,255,255,.3)'; g.fillRect(ox - 2, oy + 1, 3, 1); }
        else if (kind === 'tree') { g.fillRect(ox - 4, oy - 4, 9, 7); g.fillStyle = '#5a3b1e'; g.fillRect(ox, oy + 3, 2, 4); }
        else if (kind === 'glade') { g.fillStyle = '#d9c7a3'; g.fillRect(ox, oy, 1, 3); g.fillStyle = '#7bd389'; g.fillRect(ox - 2, oy - 2, 5, 2); g.fillStyle = 'rgba(155,229,100,.25)'; g.fillRect(ox - 3, oy - 3, 7, 5); }
        else if (kind === 'rock') { g.fillRect(ox - 3, oy - 1, 7, 4); g.fillStyle = 'rgba(0,0,0,.2)'; g.fillRect(ox - 3, oy + 2, 7, 1); }
        else { g.fillRect(ox, oy, 2, 2); g.fillStyle = 'rgba(255,209,102,.3)'; g.fillRect(ox - 2, oy - 2, 6, 6); }
      }
    }
    bgCache[id] = c; return c;
  }
  function circle(g, x, y, r, col) { g.fillStyle = col; g.beginPath(); g.arc(x, y, r, 0, 6.3); g.fill(); }
  function drawBug(g, b, time) {
    var m = metaFor(b), x = b.x * TILE, y = b.y * TILE, flap = Math.sin(time * 18 + m.ph);
    var alpha = 1;
    if (b.state === 'caught') { var k = time - m.caughtAt; if (m.caughtAt < 0 || k > 0.3) return; alpha = 1 - k / 0.3; }
    g.save(); g.globalAlpha = alpha;
    if (b.state === 'hidden') {
      if (b.hideKind === 'flower') { if (!reduced) { g.fillStyle = '#ffffff'; g.fillRect(x + Math.round(Math.sin(time * 9 + m.ph)), y - 3, 1, 1); } }
      else if (b.hideKind === 'dim') { g.fillStyle = 'rgba(200,255,150,.35)'; g.fillRect(x - 0.5, y - 0.5, 1, 1); }
      else if (!b.mound) { circle(g, x, y + 2, 3, '#a8895a'); g.fillStyle = '#6e5836'; g.fillRect(x - 3, y + 2, 6, 1); }
      g.restore(); return;
    }
    drawSpecies(g, b.type, x, y, flap, time);
    g.restore();
  }
  function drawSpecies(g, type, x, y, flap, time) {
    switch (type) {
      case 'ladybug': g.fillStyle = '#111'; g.fillRect(x - 4, y - 1, 1, 1); g.fillRect(x + 3, y - 1, 1, 1); g.fillRect(x - 4, y + 2, 1, 1); g.fillRect(x + 3, y + 2, 1, 1); circle(g, x, y, 3.5, '#d62828'); g.fillStyle = '#111'; g.fillRect(x - 0.5, y - 3.5, 1, 7); g.fillRect(x - 2, y - 1, 1, 1); g.fillRect(x + 1, y + 1, 1, 1); circle(g, x, y - 4, 1.5, '#111'); break;
      case 'butterfly': g.fillStyle = '#ff8fc7'; g.fillRect(x - 5, y - 3 - flap, 4, 5); g.fillRect(x + 1, y - 3 - flap, 4, 5); g.fillStyle = '#8e5bd1'; g.fillRect(x - 4, y + 1, 3, 2); g.fillRect(x + 1, y + 1, 3, 2); g.fillStyle = '#222'; g.fillRect(x - 0.5, y - 3, 1, 6); break;
      case 'beetle': g.fillStyle = '#1b4332'; g.fillRect(x - 4, y - 2, 1, 2); g.fillRect(x + 3, y - 2, 1, 2); g.fillRect(x - 4, y + 2, 1, 2); g.fillRect(x + 3, y + 2, 1, 2); g.fillStyle = '#2d6a4f'; g.fillRect(x - 3, y - 4, 6, 8); g.fillStyle = '#95d5b2'; g.fillRect(x - 3, y - 4, 2, 8); g.fillStyle = '#111'; g.fillRect(x - 2, y - 6, 1, 2); g.fillRect(x + 1, y - 6, 1, 2); break;
      case 'cricket': g.fillStyle = '#8b5a2b'; g.fillRect(x - 5, y - 1, 10, 3); g.fillStyle = '#c08a4a'; g.fillRect(x + 2, y - 3, 3, 3); g.fillStyle = '#5a3b1e'; g.fillRect(x - 6, y + 1, 3, 2); g.fillRect(x - 4, y + 2 + (flap > 0 ? 1 : 0), 1, 2); break;
      case 'antlion': g.fillStyle = '#c9a66b'; g.beginPath(); g.moveTo(x - 5, y + 3); g.lineTo(x, y - 4); g.lineTo(x + 5, y + 3); g.closePath(); g.fill(); g.fillStyle = '#5a3b1e'; g.fillRect(x - 1, y - 1, 2, 4); g.fillRect(x - 3, y - 3, 1, 3); g.fillRect(x + 2, y - 3, 1, 3); break;
      case 'goldbeetle': circle(g, x, y, 5 + (reduced ? 0 : Math.sin(time * 8) * 0.6), 'rgba(255,215,0,.35)'); circle(g, x, y, 3.5, '#ffc300'); g.fillStyle = '#fff3b0'; g.fillRect(x - 2, y - 2, 2, 2); g.fillStyle = '#7a5c00'; g.fillRect(x - 0.5, y - 3, 1, 6); break;
      case 'firefly': circle(g, x, y + 1, 5, 'rgba(190,255,120,' + glowAlpha(time, x).toFixed(2) + ')'); g.fillStyle = '#3a2f1e'; g.fillRect(x - 1, y - 3, 2, 3); g.fillStyle = '#d8f7a0'; g.fillRect(x - 1.5, y, 3, 2); g.fillStyle = 'rgba(255,255,255,.6)'; g.fillRect(x - 3, y - 3 - (flap > 0 ? 1 : 0), 2, 2); g.fillRect(x + 1, y - 3 - (flap > 0 ? 1 : 0), 2, 2); break;
      case 'glowmoth': circle(g, x, y, 6, 'rgba(120,200,255,' + (glowAlpha(time, y) * 0.7).toFixed(2) + ')'); g.fillStyle = '#c3b7ff'; g.fillRect(x - 5, y - 2 - flap, 4, 4); g.fillRect(x + 1, y - 2 - flap, 4, 4); g.fillStyle = '#7f6fd6'; g.fillRect(x - 4, y + 2, 3, 1); g.fillRect(x + 1, y + 2, 3, 1); g.fillStyle = '#efeaff'; g.fillRect(x - 0.5, y - 3, 1, 6); break;
      case 'moonwing': circle(g, x, y, 8, 'rgba(160,230,255,.25)'); g.fillStyle = '#b8f2ff'; g.fillRect(x - 6, y - 4 - flap, 5, 6); g.fillRect(x + 1, y - 4 - flap, 5, 6); g.fillStyle = '#e0aaff'; g.fillRect(x - 5, y + 1, 4, 3); g.fillRect(x + 1, y + 1, 4, 3); g.fillStyle = '#fff'; g.fillRect(x - 0.5, y - 3, 1, 7); break;
    }
  }
  // Glade glow: a soft pulse, or one steady value with reduced motion.
  function glowAlpha(time, ph) { return reduced ? 0.45 : 0.3 + 0.25 * (0.5 + 0.5 * Math.sin(time * 3 + (ph || 0) * 0.1)); }
  function drawPatch(g, f, time) {
    var x = f.x * TILE, y = f.y * TILE, cols = ['#ff8fc7', '#ffd166', '#fff', '#c77dff'];
    for (var i = 0; i < 5; i++) {
      var ox = Math.round(Math.cos(i * 1.26) * 5), oy = Math.round(Math.sin(i * 1.26) * 4), sw = reduced ? 0 : Math.sin(time * 3 + i) * 0.6;
      g.fillStyle = '#2f6b2a'; g.fillRect(x + ox, y + oy + 1, 1, 4);
      g.fillStyle = cols[i % 4]; g.fillRect(x + ox - 1 + sw, y + oy - 1, 3, 3);
      g.fillStyle = '#7a5c00'; g.fillRect(x + ox, y + oy, 1, 1);
    }
  }
  function drawMound(g, b) {
    var x = b.x * TILE, y = b.y * TILE;
    g.fillStyle = '#b08d57'; g.beginPath(); g.ellipse(x, y + 3, 6, 3, 0, 0, 6.3); g.fill();
    g.fillStyle = '#7a5f36'; g.beginPath(); g.ellipse(x, y + 3, 2.5, 1.2, 0, 0, 6.3); g.fill();
  }
  function drawPlayer(g, p, sneaking) {
    var x = p.x * TILE, y = p.y * TILE;
    g.fillStyle = 'rgba(0,0,0,.25)'; g.fillRect(x - 5, y + 6, 10, 3);
    g.fillStyle = sneaking ? '#3a86a8' : '#e76f51'; g.fillRect(x - 4, y - 1, 8, 8);
    circle(g, x, y - 4, 4, '#f1c27d'); g.fillStyle = '#6b3e1b'; g.fillRect(x - 4, y - 8, 8, 3);
    g.fillStyle = '#fff'; g.fillRect(x - 2 + Math.round(face.x), y - 5, 1, 1); g.fillRect(x + 1 + Math.round(face.x), y - 5, 1, 1);
    g.strokeStyle = '#5a3b1e'; g.lineWidth = 1; g.beginPath(); g.moveTo(x + face.x * 3, y + face.y * 3); g.lineTo(x + face.x * 11, y + face.y * 11); g.stroke();
    g.strokeStyle = '#eee'; g.beginPath(); g.arc(x + face.x * 12, y + face.y * 12, 3, 0, 6.3); g.stroke();
  }
  function render() {
    var g = ctx; g.setTransform(1, 0, 0, 1, 0, 0);
    var id = arenaId || 'meadow';
    var ox = 0, oy = 0;
    if (shake > 0 && !reduced) { ox = (Math.random() - .5) * 3; oy = (Math.random() - .5) * 3; }
    g.save(); g.translate(ox, oy);
    g.drawImage(background(id), 0, 0);
    if (game) {
      var st = game.state;
      var bugs = st.bugs.slice().sort(function (a, b) { return a.y - b.y; });
      st.flowers.forEach(function (f) { drawPatch(g, f, st.time); });
      st.bugs.forEach(function (b) { if (b.mound) drawMound(g, b); });
      bugs.forEach(function (b) { drawBug(g, b, st.time); });
      drawPlayer(g, st.player, st.player.sneaking);
      if (swingAnim > 0) {
        var r = 1.2 * TILE, a0 = Math.atan2(face.y, face.x), t = 1 - swingAnim / 0.22;
        g.strokeStyle = 'rgba(255,255,255,' + (0.9 - t * 0.6) + ')'; g.lineWidth = 3;
        var aEnd = a0 - 1.3 + 2.6 * (reduced ? 1 : t), px = st.player.x * TILE, py = st.player.y * TILE;
        g.beginPath(); g.arc(px, py, r, a0 - 1.3, aEnd); g.stroke();
        g.fillStyle = 'rgba(255,255,255,' + (0.85 - t * 0.5) + ')'; g.beginPath(); g.arc(px + Math.cos(aEnd) * r, py + Math.sin(aEnd) * r, 3.5, 0, 6.3); g.fill();
      }
      particles.forEach(function (p) { g.fillStyle = '#ffd166'; g.fillRect(p.x * TILE, p.y * TILE, 2, 2); });
      g.font = 'bold 9px monospace'; g.textAlign = 'center';
      popups.forEach(function (p) { g.fillStyle = 'rgba(0,0,0,.6)'; g.fillText(p.text, p.x * TILE + 1, p.y * TILE - 5); g.fillStyle = '#fff'; g.fillText(p.text, p.x * TILE, p.y * TILE - 6); });
    }
    g.restore();
    if (B.arena(id).night) { g.fillStyle = 'rgba(8,10,40,.4)'; g.fillRect(0, 0, cv.width, cv.height); }
    hud();
  }
  function hud() {
    if (!game) { $('hud-time').textContent = String(B.RUN_SECONDS); $('hud-score').textContent = '0'; $('combo-bar').style.width = '0'; $('combo-text').textContent = ''; return; }
    var st = game.state;
    $('hud-time').textContent = Math.max(0, Math.ceil(B.RUN_SECONDS - st.time)) + 's';
    $('hud-score').textContent = String(Math.round(st.score));
    var frac = st.combo > 0 ? Math.max(0, 1 - (st.time - st.lastCatchAt) / B.COMBO_WINDOW) : 0;
    $('combo-bar').style.width = (frac * 100).toFixed(0) + '%';
    $('combo-text').textContent = st.combo > 1 ? 'Combo x' + mult(st.combo).toFixed(2).replace(/0$/, '') : (st.combo === 1 ? 'Combo 1' : 'No combo');
  }

  // ---------- overlays ----------
  function stars(n) { return '★'.repeat(n) + '☆'.repeat(3 - n); }
  function showMenu() {
    mode = 'menu'; game = null; arenaId = null;
    clear(overlay); overlay.hidden = false;
    overlay.appendChild(el('h2', 'Bug Safari'));
    var tot = el('p', 'Pick an arena. 90 seconds, no rush between runs. Stars: ' + totalStars() + ' / ' + (ALL.length * 3 + B.GOAL_COUNT), 'dim'); tot.id = 'menu-stars'; overlay.appendChild(tot);
    var grid = el('div', undefined, 'grid');
    ALL.forEach(function (a, i) {
      var open = unlocked(i);
      var b = btn('', function () { startArena(a.id); }, !open);
      b.className = 'card'; b.dataset.arena = a.id;
      b.appendChild(el('strong', NAMES[a.id] + (a.glade ? ' (night variant)' : (a.night ? ' (night)' : ''))));
      b.appendChild(el('span', open ? stars(save.stars[a.id]) : 'Locked'));
      b.appendChild(el('small', open ? 'Best ' + save.best[a.id] + '  |  ' + a.stars.join('/') : 'Needs ' + needStars(i) + ' stars'));
      grid.appendChild(b);
    });
    overlay.appendChild(grid);
    var rule = el('p', 'Unlock rule: Meadow is always open. Every other arena opens when your total stars across all arenas reach 2 x (its number - 1): Orchard 2, Pond Edge 4, Forest 6, Dunes 8, Cliffs 10, Marsh 12, Lantern Glade 14, Night Glade 16. Earn 1 to 3 stars per arena by score, and 1 star for each journal goal you finish. Nothing is ever locked by time.', 'dim'); rule.id = 'unlock-rule'; overlay.appendChild(rule);
    var row = el('div', undefined, 'row');
    var j = btn('Bug journal', showJournal); j.id = 'open-journal'; row.appendChild(j);
    var back = document.createElement('a'); back.className = 'menu-back' + (document.body.classList.contains('mm-nav-on') ? ' mm-nav-legacy' : ''); back.id = 'menu-back'; back.href = '../../hub/index.html'; back.textContent = '\u2190 Back to the hub'; // beta gate: the full-screen phone sheet covers the header links (with mm-nav on, the shared Menu button replaces it; it stays in the DOM)
    row.appendChild(back);
    overlay.appendChild(row);
  }
  function showJournal() {
    clear(overlay); overlay.hidden = false;
    overlay.appendChild(el('h2', 'Bug journal'));
    var list = el('div'); list.id = 'journal-list';
    SPECIES.forEach(function (sp) {
      var d = el('div'); d.dataset.species = sp;
      var cv2 = document.createElement('canvas'); cv2.width = 32; cv2.height = 32; cv2.className = 'jicon'; cv2.setAttribute('aria-hidden', 'true');
      cv2.dataset.silhouette = save.journal[sp] > 0 ? '0' : '1';
      var g2 = cv2.getContext('2d'); g2.scale(2, 2); drawSpecies(g2, sp, 8, 8, 0, 0);
      if (save.journal[sp] <= 0) { g2.setTransform(1, 0, 0, 1, 0, 0); g2.globalCompositeOperation = 'source-in'; g2.fillStyle = '#000'; g2.fillRect(0, 0, 32, 32); }
      d.appendChild(cv2);
      d.appendChild(el('strong', save.journal[sp] > 0 ? SP_NAME[sp] : '???'));
      d.appendChild(el('div', 'Caught: ' + save.journal[sp], 'dim'));
      list.appendChild(d);
    });
    overlay.appendChild(list);
    // Night Glade bugs (their own list so the 7 base species above stay as they were)
    overlay.appendChild(el('h3', 'Night Glade bugs'));
    var gl = el('div'); gl.id = 'glade-list';
    B.GLADE_SPECIES.forEach(function (sp) {
      var n = save.journal[sp] || 0, d = el('div'); d.dataset.gladeSpecies = sp;
      var c3 = document.createElement('canvas'); c3.width = 32; c3.height = 32; c3.className = 'jicon'; c3.setAttribute('aria-hidden', 'true'); c3.dataset.silhouette = n > 0 ? '0' : '1';
      var g3 = c3.getContext('2d'); g3.scale(2, 2); drawSpecies(g3, sp, 8, 8, 0, 0);
      if (n <= 0) { g3.setTransform(1, 0, 0, 1, 0, 0); g3.globalCompositeOperation = 'source-in'; g3.fillStyle = '#000'; g3.fillRect(0, 0, 32, 32); }
      d.appendChild(c3); d.appendChild(el('strong', n > 0 ? SP_NAME[sp] : '???')); d.appendChild(el('div', 'Caught: ' + n, 'dim'));
      gl.appendChild(d);
    });
    overlay.appendChild(gl);
    // Things to find: calm journal goals. No timers, nothing expires; each one done is a star.
    overlay.appendChild(el('h3', 'Things to find'));
    overlay.appendChild(el('p', 'Finished goals stay finished. Each one adds a star. Done ' + B.goalStars(goals) + ' of ' + B.GOAL_COUNT + '.', 'dim'));
    var gw = el('div'); gw.id = 'goals-list';
    ALL.forEach(function (a) {
      var sec = el('div', undefined, 'goal-arena'); sec.dataset.arena = a.id;
      sec.appendChild(el('strong', NAMES[a.id]));
      var ul = el('ul');
      B.goalsFor(a.id).forEach(function (g) {
        var on = goals.done[a.id].indexOf(g.id) >= 0, li = el('li', (on ? '[x] ' : '[ ] ') + g.text, on ? 'on' : '');
        li.dataset.goal = g.id; li.dataset.done = on ? '1' : '0'; ul.appendChild(li);
      });
      sec.appendChild(ul); gw.appendChild(sec);
    });
    overlay.appendChild(gw);
    var row = el('div', undefined, 'row'); row.appendChild(btn('Back', showMenu)); overlay.appendChild(row);
  }
  function showSummary() {
    var s = lastSummary; clear(overlay); overlay.hidden = false;
    overlay.appendChild(el('h2', 'Time! ' + NAMES[s.arena]));
    var st = el('p', stars(s.stars), 'stars'); st.id = 'sum-stars'; overlay.appendChild(st);
    var sc = el('p', 'Score ' + s.score + (s.newBest ? '  (new best!)' : '  (best ' + s.best + ')')); sc.id = 'sum-score'; overlay.appendChild(sc);
    overlay.appendChild(el('p', 'Bugs caught: ' + s.caught));
    var gp = el('p', 'Stars gained: ' + s.gained); gp.id = 'sum-gained'; overlay.appendChild(gp);
    var cp = el('p', 'Best combo: ' + s.bestCombo + (s.bestCombo > 1 ? ' (x' + mult(s.bestCombo).toFixed(2).replace(/0$/, '') + ')' : '')); cp.id = 'sum-combo'; overlay.appendChild(cp);
    var cl = el('div'); cl.id = 'sum-counts';
    SPECIES.forEach(function (sp) { if (s.counts[sp]) { var li = el('div', SP_NAME[sp] + ' x' + s.counts[sp]); li.dataset.species = sp; cl.appendChild(li); } });
    if (!cl.firstChild) cl.appendChild(el('div', 'No bugs this time', 'dim'));
    overlay.appendChild(cl);
    if (s.goals && s.goals.length) { var sg = el('p', 'Journal goal done (+' + s.goals.length + ' star' + (s.goals.length > 1 ? 's' : '') + '): ' + s.goals.join(', ')); sg.id = 'sum-goals'; overlay.appendChild(sg); }
    if (s.newlyUnlocked.length) overlay.appendChild(el('p', 'Unlocked: ' + s.newlyUnlocked.join(', ')));
    var hp = el('p', 'Next: ' + s.hint, 'dim'); hp.id = 'sum-hint'; overlay.appendChild(hp);
    var row = el('div', undefined, 'row');
    var again = btn('Play again', function () { startArena(s.arena); }); again.id = 'again'; row.appendChild(again);
    var back = btn('Arenas', showMenu); back.id = 'to-menu'; row.appendChild(back);
    overlay.appendChild(row);
  }

  // ---------- tutorial hint (first run only, remembered) ----------
  function showHint() {
    var h = $('hint'); if (!h) return;
    hintOpen = true; h.hidden = false;
  }
  function hideHint() { var h = $('hint'); if (h) h.hidden = true; hintOpen = false; }
  function dismissHint() { try { localStorage.setItem(HINT_KEY, '1'); } catch (e) { /* ignore */ } hideHint(); }
  $('hint-ok').addEventListener('click', dismissHint);
  $('btn-mute').addEventListener('click', function () { ensureSfx(); if (sfx) { sfx.setMuted(!sfx.isMuted()); } syncMute(); });
  if (!window.MMSfx) $('btn-mute').hidden = true;
  syncMute();

  // ---------- input ----------
  window.addEventListener('keydown', function (e) {
    if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].indexOf(e.code) >= 0 && mode === 'play') e.preventDefault();
    keys[e.code] = true;
    if (e.code === 'Space' && mode === 'play') doSwing();
  });
  window.addEventListener('keyup', function (e) { keys[e.code] = false; });
  window.addEventListener('blur', function () { keys = {}; joy.x = joy.y = 0; sneakBtn = false; });
  cv.addEventListener('pointerdown', function (e) { e.preventDefault(); doSwing(); });
  var swingBtn = $('btn-swing');
  swingBtn.addEventListener('pointerdown', function (e) { e.preventDefault(); doSwing(); });
  var sneakEl = $('btn-sneak');
  function setSneak(v) { sneakBtn = v; sneakEl.classList.toggle('on', v); }
  sneakEl.addEventListener('pointerdown', function (e) { e.preventDefault(); setSneak(true); });
  ['pointerup', 'pointercancel', 'pointerleave'].forEach(function (n) { sneakEl.addEventListener(n, function () { setSneak(false); }); });
  var joyEl = $('joy'), knob = $('knob'), joyId = null;
  function joyMove(e) {
    var r = joyEl.getBoundingClientRect(), cx = r.left + r.width / 2, cy = r.top + r.height / 2, R0 = r.width / 2 - 10;
    var dx = e.clientX - cx, dy = e.clientY - cy, L = Math.hypot(dx, dy) || 1, k = Math.min(1, L / R0);
    joy.x = dx / L * k; joy.y = dy / L * k;
    knob.style.transform = 'translate(' + (joy.x * R0) + 'px,' + (joy.y * R0) + 'px)';
  }
  function joyEnd() { joyId = null; joy.x = joy.y = 0; knob.style.transform = ''; }
  joyEl.addEventListener('pointerdown', function (e) { e.preventDefault(); joyId = e.pointerId; try { joyEl.setPointerCapture(e.pointerId); } catch (x) { /* ignore */ } joyMove(e); });
  joyEl.addEventListener('pointermove', function (e) { if (e.pointerId === joyId) joyMove(e); });
  joyEl.addEventListener('pointerup', joyEnd); joyEl.addEventListener('pointercancel', joyEnd);

  // ---------- loop ----------
  var last = 0;
  function frame(t) {
    if (!testClock) {
      var dt = last ? Math.min(0.05, (t - last) / 1000) : 0; last = t; // capped: a hidden tab never advances time
      if (!hintOpen) step(dt);
    }
    render();
    requestAnimationFrame(frame);
  }

  showMenu();
  requestAnimationFrame(frame);

  if (TEST) {
    window.__bugs = {
      get mode() { return mode; },
      get run() { return game ? game.state : null; },
      get reduced() { return reduced; },
      get save() { return JSON.parse(JSON.stringify(save)); },
      get summary() { return lastSummary; },
      get shake() { return shake; },
      get particles() { return particles.length; },
      start: startArena,
      step: step,
      swing: doSwing,
      spawn: function (type, x, y, o) { return game ? game.spawn(type, x, y, o) : null; },
      setPlayer: function (x, y, sneaking) { testSneak = !!sneaking; if (game) game.setPlayer(x, y, sneaking); },
      menu: showMenu,
      get sfx() { return sfx; },
      get hintVisible() { return !$('hint').hidden; },
      spawnSwarm: function (type, x, y, n) { return game ? game.spawnSwarm(type, x, y, n) : null; },
      hideInFlower: function (type, x, y) { return game ? game.hideInFlower(type, x, y) : null; },
      showJournal: showJournal,
      get goals() { return JSON.parse(JSON.stringify(goals)); },
      get totalStars() { return totalStars(); },
      glowAlpha: function (t) { return glowAlpha(t, 0); },
      unlockedCount: function () { var n = 0; ALL.forEach(function (a, i) { if (unlocked(i)) n++; }); return n; }
    };
  }
})();
