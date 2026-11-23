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
  // AC1 graphics tier: the shared "Low graphics" pref (pixeltown-access-v1 lowGfx, read with MMAccess) forces MMPerf's low tier:
  // fewer catch sparks (MMPerf low cap), no halo around gold beetles and moonwings, still flower patches, no popup shadow text.
  // Without the pref (or without MMPerf) the tier is 'high' and every frame draws exactly as before.
  var gfx = { tier: 'high', low: false, cap: 24, burst: 4 };
  function readGfx() { // also re-run when the Settings panel flips Low graphics
    var prefs = null, tier = 'high';
    try { prefs = window.MMAccess ? window.MMAccess.prefs.load(window.localStorage) : null; } catch (e) { prefs = null; }
    try { if (window.MMPerf) tier = window.MMPerf.profile([], prefs).tier; } catch (e) { tier = 'high'; }
    var low = tier === 'low';
    gfx.tier = tier; gfx.low = low; gfx.cap = low && window.MMPerf ? window.MMPerf.CAPS.low.sparks : 24; gfx.burst = low ? 2 : 4;
  }
  readGfx();

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
  // Merge-on-write (bugbash/saves.md S2/S7): a stale second tab never lowers stars / bests, never drops another tab's catches or
  // goals; goals / pb fields a newer build stored stay stored. Without MMSaveMerge (shared/mm-save-merge.js): the old plain write.
  var isO = function (v) { return !!v && typeof v === 'object' && !Array.isArray(v); };
  var saveBase = JSON.parse(JSON.stringify(save));
  function writeSaves() {
    var M = window.MMSaveMerge;
    if (!M) { S.set(KEY, { v: 1, stars: save.stars, best: save.best, journal: save.journal }); S.set(GOALS_KEY, goals); return; }
    var raw = S.get(KEY, null), st = sanitize(raw), j = {};
    var m = M.merge(raw, saveBase, { v: 1, stars: save.stars, best: save.best, journal: save.journal }, { maxMap: ['stars', 'best'] });
    // journal = catch counts: what storage holds + this tab's own new catches (never double-counted, never lowered)
    Object.keys(st.journal).forEach(function (t) { j[t] = Math.min(999999, st.journal[t] + Math.max(0, (save.journal[t] || 0) - (saveBase.journal[t] || 0))); });
    m.journal = j;
    // this key is stored exactly as cleaned (unknown / hostile fields dropped, guarded by bugs-page.test.js)
    var c = sanitize(m);
    S.set(KEY, { v: 1, stars: c.stars, best: c.best, journal: c.journal });
    save = c; saveBase = JSON.parse(JSON.stringify(save));
    // goals: done goals stay done in every tab (union per arena)
    var gr = S.get(GOALS_KEY, null), gs = B.cleanGoals(gr), done = {};
    Object.keys(goals.done).forEach(function (a) { done[a] = (gs.done[a] || []).concat(goals.done[a].filter(function (id) { return (gs.done[a] || []).indexOf(id) < 0; })); });
    goals = B.cleanGoals({ v: 1, done: done });
    S.set(GOALS_KEY, Object.assign({}, isO(gr) ? gr : {}, { v: 1, done: Object.assign({}, isO(gr) && isO(gr.done) ? gr.done : {}, goals.done) }));
  }
  function persist() { writeSaves(); S.set(MEDALS_KEY, { v: 1, m: B.medalsFor(save, goals) }); try { var st = totalStars(), j = save.journal; window.MMHubProfile.sync(localStorage, 'bugs', [Object.keys(j).some(function (k) { return j[k] > 0; }) && 'catch1', st >= 6 && 'stars6', (j.goldbeetle > 0 || j.moonwing > 0) && 'rare', st >= 24 && 'stars24']); } catch (e) { /* hub map progress is optional */ } }
  persist();
  // FUN1 personal bests (own additive key): best combo per arena, runs played, so the summary can show the chase.
  var PB_KEY = 'pixeltown-bugs-pb-v1';
  function cleanPb(raw) {
    var o = { v: 1, combo: {}, runs: 0, mod: {} };
    if (raw && typeof raw === 'object') {
      // VAR1 (additive): best score per arena per run modifier, {arena:{modId:score}}. Plain bests stay in pixeltown-bugs-v1.
      if (raw.mod && typeof raw.mod === 'object' && !Array.isArray(raw.mod)) ALL.forEach(function (a) {
        var src = Object.prototype.hasOwnProperty.call(raw.mod, a.id) ? raw.mod[a.id] : null; if (!src || typeof src !== 'object') return;
        B.MOD_IDS.forEach(function (m) { var n = Math.floor(Number(src[m])); if (isFinite(n) && n > 0) { o.mod[a.id] = o.mod[a.id] || {}; o.mod[a.id][m] = Math.min(99999, n); } });
      });
      var r = Math.floor(Number(raw.runs)); o.runs = isFinite(r) && r > 0 ? Math.min(999999, r) : 0;
      if (raw.combo && typeof raw.combo === 'object') ALL.forEach(function (a) { var n = Math.floor(Number(raw.combo[a.id])); if (isFinite(n) && n > 0) o.combo[a.id] = Math.min(999, n); });
    }
    return o;
  }
  var pb = cleanPb(S.get(PB_KEY, null)), pbBase = JSON.parse(JSON.stringify(pb));
  // merge-on-write: max combo / modifier bests, runs = stored + this tab's own runs; unknown fields kept (bugbash/saves.md S2)
  function persistPb() {
    var M = window.MMSaveMerge;
    if (!M) { S.set(PB_KEY, pb); return; }
    var m = M.merge(S.get(PB_KEY, null), pbBase, pb, M.SPECS[PB_KEY]), c = cleanPb(m);
    S.set(PB_KEY, Object.assign(m, { v: 1, runs: c.runs }));
    pb = c; pbBase = JSON.parse(JSON.stringify(pb));
  }
  // VAR1 run modifiers: on by default; ?mods=0 turns them off. Test pages (?test=1) keep them off unless ?mods=1, so older tests see plain runs.
  var MODS_ON = qs.get('mods') !== '0' && (!TEST || qs.get('mods') === '1');
  var nextRun = {}, rollN = 0, runSeed = null, runMod = null;
  function rollNext(id) {
    var seed = TEST ? 'var-' + id + '-' + (++rollN) : String(Date.now()) + Math.random();
    nextRun[id] = { seed: seed, mod: MODS_ON ? B.pickMod(seed) : null };
    return nextRun[id];
  }
  function peekNext(id) { return nextRun[id] || rollNext(id); }
  function modBest(id, m) { return m && pb.mod[id] && pb.mod[id][m] ? pb.mod[id][m] : 0; }
  function bestFor(id, m) { return m ? modBest(id, m) : save.best[id]; }
  var NEAR_RADIUS = 2.4, CATCH_R = 1.2; // a swing that misses a visible bug within this many tiles is a near miss
  var MILESTONES = [3, 5, 8];
  function arenaStars() { return ALL.reduce(function (n, a) { return n + save.stars[a.id]; }, 0); }
  function totalStars() { return arenaStars() + B.goalStars(goals); } // score stars + one per finished journal goal
  function needStars(i) { return i * 2; }
  function unlocked(i) { return totalStars() >= needStars(i); }

  // ---------- state ----------
  var cv = document.getElementById('game'), ctx = cv.getContext('2d');
  if (window.MMPerf && window.MMPerf.applyCanvas) { try { gfx.dpr = window.MMPerf.applyCanvas(cv, gfx.tier).dpr; } catch (e) { /* the canvas keeps its 1:1 backing */ } }
  var overlay = document.getElementById('overlay');
  var mode = 'menu'; // menu | play | summary
  var game = null, arenaId = null, rng = null, meta = null, popups = [], particles = [], shake = 0, swingAnim = 0, face = { x: 1, y: 0 };
  var bgCache = {}, gmeta = {};
  var keys = {}, joy = { x: 0, y: 0 }, sneakBtn = false;
  var testClock = TEST;
  var endAt = 0, GUARD_MS = TEST ? 0 : 450, paused = false, pauseWhy = '';
  var lastSummary = null, testSneak = false, nearMisses = 0, banner = null, scoreBump = 0, chainWas = 0, warned = false;
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
  // MMChip cues (CHIP-AUDIO.md): catch / miss / combo1..8 / level_up / warn / ui. Music is the shared Music toggle (off by default).
  function music(cue) { if (sfx) { try { if (cue) sfx.music(cue); else sfx.stopMusic(); } catch (e) { /* ignore */ } } }
  var played = []; // last cue names, for the test hook
  var _beep = beep; beep = function (name) { played.push(name); if (played.length > 40) played.shift(); _beep(name); };
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
    var seed, mod = null;
    if (opts.seed !== undefined) { seed = opts.seed; mod = MODS_ON && B.modFor(opts.mod) ? opts.mod : null; }
    else { var nx = peekNext(id); seed = nx.seed; mod = nx.mod; }
    rollNext(id); // the card already shows the next run's modifier
    runSeed = seed; runMod = mod;
    game = B.createRun({ seed: seed, arena: id, night: !!a.night, glade: !!a.glade, width: W, height: H, empty: !!opts.empty, count: opts.count, mod: mod });
    rng = R.create('page:' + seed);
    meta = {}; gmeta = {}; popups = []; particles = []; shake = 0; swingAnim = 0; nearMisses = 0; banner = null; scoreBump = 0; chainWas = 0; warned = false;
    $('hud-best').textContent = 'Best ' + bestFor(id, mod);
    var hm = $('hud-mod'); if (hm) { hm.hidden = !mod; hm.textContent = mod ? B.MODS[mod].name : ''; hm.title = mod ? B.MODS[mod].line : ''; }
    mode = 'play'; overlay.hidden = true; paused = false; pauseWhy = ''; music('minigame');
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
    if (mode !== 'play' || !game || paused) return { swung: false, caught: [] };
    var before = game.state.score;
    var res = game.swing();
    if (res.swung) {
      swingAnim = 0.22;
      if (res.caught.length) beep(game.state.combo >= 2 ? 'combo' + Math.min(8, game.state.combo) : 'catch'); else beep('miss');
      if (res.caught.length) {
        var st = game.state;
        game.state.bugs.forEach(function (b) {
          if (res.caught.indexOf(b.id) < 0) return;
          metaFor(b).caughtAt = st.time;
          var md = runMod ? B.MODS[runMod] : null, pts = Math.round(B.TYPES[b.type].points * (md && md.points ? md.points : 1) * (b.glow && md && md.glowMult ? md.glowMult : 1));
          popups.push({ x: b.x, y: b.y, t: 0, text: '+' + pts + (st.combo > 1 ? ' x' + mult(st.combo).toFixed(1) : '') });
          if (!reduced) for (var i = 0; i < gfx.burst; i++) particles.push({ x: b.x, y: b.y, vx: (rng.next() - .5) * 3, vy: (rng.next() - .5) * 3, t: 0 });
        });
        if (gfx.low && particles.length > gfx.cap) particles.length = gfx.cap; // low tier: never over MMPerf's cap, not even for one frame
        if (!reduced) shake = 0.12;
        scoreBump = 0.25;
        var c = game.state.combo;
        if (MILESTONES.indexOf(c) >= 0) { banner = { text: 'Combo x' + mult(c).toFixed(2).replace(/0$/, '') + '!', t: 0 }; beep('perfect'); if (!reduced) shake = 0.2; }
      } else {
        // near miss: an honest "So close!" only when a catchable bug was just out of net reach
        var p0 = game.state.player, near = null, nd = 1e9;
        game.state.bugs.forEach(function (b) {
          if (b.state === 'hidden' || b.state === 'caught') return;
          var d = Math.hypot(b.x - p0.x, b.y - p0.y);
          if (d > CATCH_R && d <= NEAR_RADIUS && d < nd) { nd = d; near = b; }
        });
        if (near) { nearMisses++; popups.push({ x: near.x, y: near.y, t: 0, text: 'So close!', miss: true }); }
      }
    }
    void before;
    return res;
  }
  function endRun() {
    var st = game.state, score = Math.round(st.score), stars = B.starsFor(arenaId, score);
    var prevBest = bestFor(arenaId, runMod), prevStars = save.stars[arenaId];
    var oldTotal = totalStars();
    if (stars > prevStars) save.stars[arenaId] = stars;
    // VAR1: a modifier run keeps its own best, so it never overwrites the plain best (stars keep the same score rule)
    if (runMod) { if (score > prevBest) { pb.mod[arenaId] = pb.mod[arenaId] || {}; pb.mod[arenaId][runMod] = Math.min(99999, score); } }
    else if (score > prevBest) save.best[arenaId] = Math.min(99999, score);
    var counts = {};
    st.caughtTypes.forEach(function (t) { counts[t] = (counts[t] || 0) + 1; if (save.journal[t] !== undefined) save.journal[t] = Math.min(999999, save.journal[t] + 1); });
    var doneBefore = goals.done[arenaId] || [], newGoals = [];
    B.goalsMet(arenaId, st).forEach(function (gid) { if (doneBefore.indexOf(gid) < 0) newGoals.push(gid); });
    if (newGoals.length) goals = B.cleanGoals({ v: 1, done: Object.assign({}, goals.done, (function () { var o = {}; o[arenaId] = doneBefore.concat(newGoals); return o; })()) });
    persist();
    var newly = [];
    ALL.forEach(function (a, i) { if (!(oldTotal >= needStars(i)) && unlocked(i)) newly.push(NAMES[a.id]); });
    var gained = Math.max(0, stars - prevStars);
    var prevCombo = pb.combo[arenaId] || 0;
    if (st.bestCombo > prevCombo) pb.combo[arenaId] = Math.min(999, st.bestCombo);
    pb.runs = Math.min(999999, pb.runs + 1);
    persistPb();
    var nextHint = '';
    for (var ni = 0; ni < ALL.length; ni++) {
      if (!unlocked(ni)) { nextHint = NAMES[ALL[ni].id] + ' unlocks at ' + needStars(ni) + ' stars (you have ' + totalStars() + ').'; break; }
    }
    if (!nextHint) nextHint = 'Every arena is unlocked. Go for 3 stars everywhere!';
    lastSummary = { arena: arenaId, score: score, stars: stars, gained: gained, bestCombo: st.bestCombo, hint: nextHint, caught: st.caught, counts: counts, best: bestFor(arenaId, runMod), mod: runMod, seed: runSeed, newlyUnlocked: newly, newBest: score > prevBest, prevBest: prevBest, nearMisses: nearMisses, comboBest: pb.combo[arenaId] || 0, newComboBest: st.bestCombo > prevCombo && prevCombo > 0,
      goals: newGoals.map(function (gid) { return B.goalsFor(arenaId).filter(function (g) { return g.id === gid; })[0].text; }) };
    mode = 'summary';
    hideHint();
    endAt = performance.now(); music(null);
    beep(gained > 0 ? 'level_up' : 'confirm');
    showSummary();
    var ag = $('again'); if (ag && ag.focus) { try { ag.focus({ preventScroll: true }); } catch (e) { ag.focus(); } }
  }

  // advance game time; used by loop and test hook
  function step(dt) {
    if (mode !== 'play' || !game || paused) return;
    var left = dt;
    while (left > 1e-9 && mode === 'play') {
      var d = Math.min(left, 0.05); left -= d;
      movePlayer(d);
      game.update(d);
      if (!game.state.done && B.RUN_SECONDS - game.state.time < 1e-6) game.update(1e-5); // float drift guard
      // FUN1: say plainly when a 3+ chain runs out, and one soft cue when 10 seconds are left
      if (game.state.combo > 0) chainWas = game.state.combo; else if (chainWas) { if (chainWas >= 3 && !game.state.done) banner = { text: 'Chain of ' + chainWas + ' ended', t: 0, soft: true }; chainWas = 0; }
      if (!warned && B.RUN_SECONDS - game.state.time <= 10 && !game.state.done) { warned = true; beep('warn'); }
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
    var sneaking = !!(keys.ShiftLeft || keys.ShiftRight || keys.KeyE || sneakBtn || testSneak);
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
    scoreBump = Math.max(0, scoreBump - dt);
    if (banner) { banner.t += dt; if (banner.t > 1.1) banner = null; }
    popups = popups.filter(function (p) { return p.t < 0.9; });
    particles.forEach(function (p) { p.t += dt; p.x += p.vx * dt; p.y += p.vy * dt; });
    particles = particles.filter(function (p) { return p.t < 0.4; });
    if (particles.length > gfx.cap) particles.length = gfx.cap;
  }

  // ---------- drawing ----------
  function hash(x, y) { var h = (x * 374761393 + y * 668265263) >>> 0; h = (h ^ (h >>> 13)) * 1274126177 >>> 0; return (h ^ (h >>> 16)) >>> 0; }
  function background(id) {
    if (bgCache[id]) return bgCache[id];
    var c = document.createElement('canvas'); c.width = W * TILE; c.height = H * TILE; var g = c.getContext('2d');
    var th = THEME[id];
    for (var y = 0; y < H; y++) for (var x = 0; x < W; x++) {
      g.fillStyle = th[0]; g.fillRect(x * TILE, y * TILE, TILE, TILE); if ((x + y) % 2 === 0) { g.globalAlpha = 0.5; g.fillStyle = th[1]; g.fillRect(x * TILE, y * TILE, TILE, TILE); g.globalAlpha = 1; } // W-11: calmer checker (half contrast)
      var h = hash(x, y), px = x * TILE, py = y * TILE;
      if (h % 3 === 0) { g.fillStyle = 'rgba(0,0,0,.10)'; g.fillRect(px + (h >> 6) % 13, py + (h >> 10) % 13, 3, 1); g.fillRect(px + (h >> 6) % 13 + 1, py + (h >> 10) % 13 - 1, 1, 1); }
      if (h % 5 === 0) { g.fillStyle = 'rgba(255,255,255,.12)'; g.fillRect(px + (h >> 4) % 12, py + (h >> 8) % 12, 2, 3); }
      if (h % 11 === 0) {
        g.fillStyle = th[2]; var kind = th[3], ox = px + 4 + (h >> 5) % 8, oy = py + 4 + (h >> 9) % 8;
        if (kind === 'flower') { g.fillRect(ox, oy, 3, 3); g.fillStyle = '#fff'; g.fillRect(ox + 1, oy + 1, 1, 1); }
        else if (kind === 'fruit') { g.fillRect(ox - 1, oy - 2, 3, 5); g.fillRect(ox - 2, oy - 1, 5, 3); g.fillStyle = 'rgba(255,255,255,.5)'; g.fillRect(ox - 1, oy - 1, 1, 1); g.fillStyle = '#3a6b2a'; g.fillRect(ox, oy - 4, 1, 2); }
        else if (kind === 'water') { g.fillRect(ox - 3, oy, 8, 4); g.fillStyle = 'rgba(255,255,255,.3)'; g.fillRect(ox - 2, oy + 1, 3, 1); }
        else if (kind === 'tree') { g.fillRect(ox - 4, oy - 4, 9, 7); g.fillStyle = '#5a3b1e'; g.fillRect(ox, oy + 3, 2, 4); }
        else if (kind === 'glade') { g.fillStyle = '#d9c7a3'; g.fillRect(ox, oy, 1, 3); g.fillStyle = '#7bd389'; g.fillRect(ox - 2, oy - 2, 5, 2); g.fillStyle = 'rgba(155,229,100,.25)'; g.fillRect(ox - 3, oy - 3, 7, 5); }
        else if (kind === 'rock') { g.fillRect(ox - 3, oy - 1, 7, 4); g.fillStyle = 'rgba(0,0,0,.2)'; g.fillRect(ox - 3, oy + 2, 7, 1); }
        else { g.fillRect(ox, oy, 2, 2); g.fillStyle = 'rgba(255,209,102,.3)'; g.fillRect(ox - 2, oy - 2, 6, 6); }
      }
    }
    bgCache[id] = c; return c;
  }
  // 8-bit pass: discs are rasterised per pixel row (no anti-aliased arcs)
  function circle(g, x, y, r, col) {
    g.fillStyle = col; x = Math.round(x); y = Math.round(y); var rr = Math.max(1, Math.round(r));
    for (var dy = -rr; dy < rr; dy++) { var w = Math.round(Math.sqrt(Math.max(0, r * r - (dy + 0.5) * (dy + 0.5)))); if (w > 0) g.fillRect(x - w, y + dy, w * 2, 1); }
  }
  function drawBug(g, b, time) {
    var m = metaFor(b), x = Math.round(b.x * TILE), y = Math.round(b.y * TILE), flap = reduced ? 0 : Math.sin(time * 18 + m.ph); // reduced motion: wings hold still
    var alpha = 1;
    if (b.state === 'caught') { var k = time - m.caughtAt; if (m.caughtAt < 0 || k > 0.3) return; alpha = 1 - k / 0.3; }
    g.save(); g.globalAlpha = alpha;
    if (b.state === 'hidden') {
      if (b.hideKind === 'flower') { if (!reduced && !gfx.low) { g.fillStyle = '#ffffff'; g.fillRect(x + Math.round(Math.sin(time * 9 + m.ph)), y - 3, 1, 1); } }
      else if (b.hideKind === 'dim') { g.fillStyle = 'rgba(200,255,150,.35)'; g.fillRect(x, y - 0.5, 1, 1); }
      else if (!b.mound) { circle(g, x, y + 2, 3, '#a8895a'); g.fillStyle = '#6e5836'; g.fillRect(x - 3, y + 2, 6, 1); }
      g.restore(); return;
    }
    if (b.glow) circle(g, x, y, 6, 'rgba(255,240,140,' + (reduced || gfx.low ? 0.4 : 0.3 + 0.2 * Math.sin(time * 4 + m.ph)).toFixed(2) + ')'); // VAR1 glow bug: steady with reduced motion / low gfx
    drawBugBig(g, b.type, x, y, flap, time);
    g.restore();
  }
  // W-11 (b10-11): on phones the field is shown near 1:1, so bugs were 8-10 screen px and blended into the grass. Each bug is drawn
  // through two small scratch canvases: its sprite plus a 1 px dark outline (silhouette composited at 4 offsets), at 2x when the field
  // is displayed under 1.8x (phones), 1x otherwise. Canvas 2D only, no getImageData; hit areas, timing and scores are untouched.
  var BUG_S = 28, bugA = document.createElement('canvas'), bugB = document.createElement('canvas'); bugA.width = bugA.height = bugB.width = bugB.height = BUG_S;
  var ga = bugA.getContext('2d'), gb = bugB.getContext('2d'), bugStat = { scale: 1, draws: 0 };
  function lum(hex) { var n = parseInt(hex.slice(1), 16), c = [n >> 16 & 255, n >> 8 & 255, n & 255].map(function (v) { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }); return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]; }
  var inkCache = {};
  function inkFor(id) { if (inkCache[id]) return inkCache[id]; var th = THEME[id] || THEME.meadow; var L = Math.max(lum(th[0]), lum(th[1])); return (inkCache[id] = L < 0.12 ? '#f2ead6' : '#14100c'); } // dark arenas (night glade, lantern) get a light rim
  function bugScale() { var r = cv.getBoundingClientRect(); var k = r.width > 0 ? r.width / cv.width : 2; return k < 1.8 ? 2 : 1; }
  function drawBugBig(g, type, x, y, flap, time) {
    var h = BUG_S / 2, k = bugStat.scale;
    ga.setTransform(1, 0, 0, 1, 0, 0); ga.clearRect(0, 0, BUG_S, BUG_S); drawSpecies(ga, type, h, h, flap, time);
    gb.globalCompositeOperation = 'source-over'; gb.clearRect(0, 0, BUG_S, BUG_S);
    gb.drawImage(bugA, -1, 0); gb.drawImage(bugA, 1, 0); gb.drawImage(bugA, 0, -1); gb.drawImage(bugA, 0, 1);
    gb.globalCompositeOperation = 'source-in'; gb.fillStyle = bugStat.ink || '#14100c'; gb.fillRect(0, 0, BUG_S, BUG_S); gb.globalCompositeOperation = 'source-over';
    var sm = g.imageSmoothingEnabled; g.imageSmoothingEnabled = false;
    g.drawImage(bugB, Math.round(x - h * k), Math.round(y - h * k), BUG_S * k, BUG_S * k);
    g.drawImage(bugA, Math.round(x - h * k), Math.round(y - h * k), BUG_S * k, BUG_S * k);
    g.imageSmoothingEnabled = sm; bugStat.draws++;
  }
  function drawSpecies(g, type, x, y, flap, time) {
    flap = Math.round(flap);
    switch (type) {
      case 'ladybug': g.fillStyle = '#111'; g.fillRect(x - 4, y - 1, 1, 1); g.fillRect(x + 3, y - 1, 1, 1); g.fillRect(x - 4, y + 2, 1, 1); g.fillRect(x + 3, y + 2, 1, 1); circle(g, x, y, 3.5, '#d62828'); g.fillStyle = '#111'; g.fillRect(x, y - 3.5, 1, 7); g.fillRect(x - 2, y - 1, 1, 1); g.fillRect(x + 1, y + 1, 1, 1); circle(g, x, y - 4, 1.5, '#111'); break;
      case 'butterfly': g.fillStyle = '#ff8fc7'; g.fillRect(x - 5, y - 3 - flap, 4, 5); g.fillRect(x + 1, y - 3 - flap, 4, 5); g.fillStyle = '#8e5bd1'; g.fillRect(x - 4, y + 1, 3, 2); g.fillRect(x + 1, y + 1, 3, 2); g.fillStyle = '#222'; g.fillRect(x, y - 3, 1, 6); break;
      case 'beetle': g.fillStyle = '#1b4332'; g.fillRect(x - 4, y - 2, 1, 2); g.fillRect(x + 3, y - 2, 1, 2); g.fillRect(x - 4, y + 2, 1, 2); g.fillRect(x + 3, y + 2, 1, 2); g.fillStyle = '#2d6a4f'; g.fillRect(x - 3, y - 4, 6, 8); g.fillStyle = '#95d5b2'; g.fillRect(x - 3, y - 4, 2, 8); g.fillStyle = '#111'; g.fillRect(x - 2, y - 6, 1, 2); g.fillRect(x + 1, y - 6, 1, 2); break;
      case 'cricket': g.fillStyle = '#8b5a2b'; g.fillRect(x - 5, y - 1, 10, 3); g.fillStyle = '#c08a4a'; g.fillRect(x + 2, y - 3, 3, 3); g.fillStyle = '#5a3b1e'; g.fillRect(x - 6, y + 1, 3, 2); g.fillRect(x - 4, y + 2 + (flap > 0 ? 1 : 0), 1, 2); break;
      case 'antlion': g.fillStyle = '#c9a66b'; g.beginPath(); g.moveTo(x - 5, y + 3); g.lineTo(x, y - 4); g.lineTo(x + 5, y + 3); g.closePath(); g.fill(); g.fillStyle = '#5a3b1e'; g.fillRect(x - 1, y - 1, 2, 4); g.fillRect(x - 3, y - 3, 1, 3); g.fillRect(x + 2, y - 3, 1, 3); break;
      case 'goldbeetle': if (!gfx.low) circle(g, x, y, 5 + (reduced ? 0 : Math.sin(time * 8) * 0.6), 'rgba(255,215,0,.35)'); circle(g, x, y, 3.5, '#ffc300'); g.fillStyle = '#fff3b0'; g.fillRect(x - 2, y - 2, 2, 2); g.fillStyle = '#7a5c00'; g.fillRect(x, y - 3, 1, 6); break;
      case 'firefly': circle(g, x, y + 1, 5, 'rgba(190,255,120,' + glowAlpha(time, x).toFixed(2) + ')'); g.fillStyle = '#3a2f1e'; g.fillRect(x - 1, y - 3, 2, 3); g.fillStyle = '#d8f7a0'; g.fillRect(x - 1, y, 3, 2); g.fillStyle = 'rgba(255,255,255,.6)'; g.fillRect(x - 3, y - 3 - (flap > 0 ? 1 : 0), 2, 2); g.fillRect(x + 1, y - 3 - (flap > 0 ? 1 : 0), 2, 2); break;
      case 'glowmoth': circle(g, x, y, 6, 'rgba(120,200,255,' + (glowAlpha(time, y) * 0.7).toFixed(2) + ')'); g.fillStyle = '#c3b7ff'; g.fillRect(x - 5, y - 2 - flap, 4, 4); g.fillRect(x + 1, y - 2 - flap, 4, 4); g.fillStyle = '#7f6fd6'; g.fillRect(x - 4, y + 2, 3, 1); g.fillRect(x + 1, y + 2, 3, 1); g.fillStyle = '#efeaff'; g.fillRect(x, y - 3, 1, 6); break;
      case 'moonwing': if (!gfx.low) circle(g, x, y, 8, 'rgba(160,230,255,.25)'); g.fillStyle = '#b8f2ff'; g.fillRect(x - 6, y - 4 - flap, 5, 6); g.fillRect(x + 1, y - 4 - flap, 5, 6); g.fillStyle = '#e0aaff'; g.fillRect(x - 5, y + 1, 4, 3); g.fillRect(x + 1, y + 1, 4, 3); g.fillStyle = '#fff'; g.fillRect(x, y - 3, 1, 7); break;
    }
  }
  // Glade glow: a soft pulse, or one steady value with reduced motion.
  function glowAlpha(time, ph) { return reduced ? 0.45 : 0.3 + 0.25 * (0.5 + 0.5 * Math.sin(time * 3 + (ph || 0) * 0.1)); }
  function drawPatch(g, f, time) {
    var x = Math.round(f.x * TILE), y = Math.round(f.y * TILE), cols = ['#ff8fc7', '#ffd166', '#fff', '#c77dff'];
    for (var i = 0; i < 5; i++) {
      var ox = Math.round(Math.cos(i * 1.26) * 5), oy = Math.round(Math.sin(i * 1.26) * 4), sw = reduced || gfx.low ? 0 : Math.round(Math.sin(time * 3 + i) * 0.6);
      g.fillStyle = '#2f6b2a'; g.fillRect(x + ox, y + oy + 1, 1, 4);
      g.fillStyle = cols[i % 4]; g.fillRect(x + ox - 1 + sw, y + oy - 1, 3, 3);
      if (!gfx.low) { g.fillStyle = '#7a5c00'; g.fillRect(x + ox, y + oy, 1, 1); }
    }
  }
  function drawMound(g, b) {
    var x = Math.round(b.x * TILE), y = Math.round(b.y * TILE);
    g.fillStyle = '#5e4a2c'; g.fillRect(x - 6, y + 2, 12, 3); g.fillRect(x - 4, y + 5, 8, 1);
    g.fillStyle = '#b08d57'; g.fillRect(x - 4, y, 8, 2); g.fillRect(x - 6, y + 2, 12, 2); g.fillStyle = '#d0ae74'; g.fillRect(x - 3, y, 4, 1);
    g.fillStyle = '#4a3a20'; g.fillRect(x - 2, y + 2, 4, 2);
  }
  // 8-bit catcher: 1-px-outlined sprite with a hat, shirt, legs and a pixel net on a pixel pole
  function drawPlayer(g, p, sneaking) {
    var x = Math.round(p.x * TILE), y = Math.round(p.y * TILE), fx = Math.round(face.x), k = '#1b1410';
    g.fillStyle = 'rgba(0,0,0,.25)'; g.fillRect(x - 5, y + 7, 10, 2);
    g.fillStyle = k; g.fillRect(x - 5, y - 2, 10, 8); g.fillRect(x - 4, y - 9, 8, 8); g.fillRect(x - 3, y + 6, 6, 2);
    g.fillStyle = sneaking ? '#3a86a8' : '#e76f51'; g.fillRect(x - 4, y - 1, 8, 6); g.fillStyle = 'rgba(255,255,255,.3)'; g.fillRect(x - 4, y - 1, 8, 1);
    g.fillStyle = '#3b3b58'; g.fillRect(x - 3, y + 5, 2, 2); g.fillRect(x + 1, y + 5, 2, 2);
    g.fillStyle = '#f1c27d'; g.fillRect(x - 3, y - 6, 6, 5);
    g.fillStyle = '#6b3e1b'; g.fillRect(x - 4, y - 8, 8, 3); g.fillStyle = '#ffd166'; g.fillRect(x - 4, y - 6, 8, 1);
    g.fillStyle = '#1b1410'; g.fillRect(x - 2 + fx, y - 4, 1, 1); g.fillRect(x + 1 + fx, y - 4, 1, 1);
    g.fillStyle = '#5a3b1e';
    for (var i = 3; i <= 10; i++) g.fillRect(Math.round(x + face.x * i), Math.round(y + face.y * i), 1, 1);
    var nx = Math.round(x + face.x * 12), ny = Math.round(y + face.y * 12);
    g.fillStyle = '#eee'; g.fillRect(nx - 2, ny - 3, 5, 1); g.fillRect(nx - 2, ny + 3, 5, 1); g.fillRect(nx - 3, ny - 2, 1, 5); g.fillRect(nx + 3, ny - 2, 1, 5);
    g.fillStyle = 'rgba(238,238,238,.35)'; g.fillRect(nx - 2, ny - 2, 5, 5);
  }
  function render() {
    var g = ctx; g.setTransform(1, 0, 0, 1, 0, 0); var nowMs = performance.now(); if (!bugStat.t || nowMs - bugStat.t > 1000) { bugStat.t = nowMs; bugStat.scale = bugScale(); } // layout read at most once a second
    var id = arenaId || 'meadow';
    bugStat.ink = inkFor(id);
    var ox = 0, oy = 0;
    if (shake > 0 && !reduced) { ox = Math.round((Math.random() - .5) * 3); oy = Math.round((Math.random() - .5) * 3); }
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
        g.fillStyle = g.strokeStyle; // pixel swoosh: 2 px dots along the arc
        for (var sa = a0 - 1.3; sa <= aEnd; sa += 0.12) g.fillRect(Math.round(px + Math.cos(sa) * r) - 1, Math.round(py + Math.sin(sa) * r) - 1, 2, 2);
        circle(g, px + Math.cos(aEnd) * r, py + Math.sin(aEnd) * r, 3.5, 'rgba(255,255,255,' + (0.85 - t * 0.5) + ')');
      }
      particles.forEach(function (p) { g.fillStyle = '#ffd166'; g.fillRect(Math.round(p.x * TILE), Math.round(p.y * TILE), 2, 2); });
      g.font = 'bold 10px monospace'; g.textAlign = 'center';
      if (window.MM8 && MM8.text) {
        popups.forEach(function (p) { MM8.text(g, p.text, Math.round(p.x * TILE), Math.round(p.y * TILE) - 13, 1, p.miss ? '#ffb3a7' : '#ffffff', { align: 'center', shadow: gfx.low ? false : '#0d160f' }); });
      } else popups.forEach(function (p) { if (!gfx.low) { g.fillStyle = 'rgba(0,0,0,.6)'; g.fillText(p.text, p.x * TILE + 1, p.y * TILE - 5); } g.fillStyle = p.miss ? '#ffb3a7' : '#fff'; g.fillText(p.text, p.x * TILE, p.y * TILE - 6); });
      if (banner) {
        var bs = reduced ? 1 : 1 + 0.35 * Math.max(0, 1 - banner.t / 0.18), ba = banner.t > 0.8 ? Math.max(0, 1 - (banner.t - 0.8) / 0.3) : 1;
        if (window.MM8 && MM8.text) {
          var bsc = banner.soft ? 1 : 2, btw = MM8.textWidth(banner.text, bsc);
          if (btw > cv.width - 8) bsc = 1;
          g.save(); g.globalAlpha = ba; MM8.text(g, banner.text, cv.width / 2, 30 - (bs > 1.1 ? 2 : 0), bsc, banner.soft ? '#cfe8d0' : '#ffd166', { align: 'center', shadow: gfx.low ? false : '#0d160f' }); g.restore();
        } else {
        g.save(); g.globalAlpha = ba; g.translate(cv.width / 2, 40); g.scale(bs, bs);
        g.font = banner.soft ? 'bold 13px monospace' : 'bold 18px monospace'; g.textAlign = 'center';
        if (!gfx.low) { g.fillStyle = 'rgba(0,0,0,.65)'; g.fillText(banner.text, 1, 1); }
        g.fillStyle = banner.soft ? '#cfe8d0' : '#ffd166'; g.fillText(banner.text, 0, 0); g.restore();
        }
      }
    }
    g.restore();
    if (paused && game && mode === 'play') {
      g.fillStyle = 'rgba(8,12,10,.62)'; g.fillRect(0, 0, cv.width, cv.height);
      if (window.MM8 && MM8.text) { MM8.text(g, 'PAUSED', cv.width / 2, 86, 3, '#ffd166', { align: 'center', shadow: '#0d160f' }); MM8.text(g, pauseWhy === 'key' ? 'Esc / P or tap to resume' : pauseWhy === 'hidden' ? 'Tap or press Esc to resume' : 'Resumes when you close the menu', cv.width / 2, 120, 1, '#ffffff', { align: 'center', shadow: '#0d160f' }); }
    }
    if (B.arena(id).night) { g.fillStyle = 'rgba(8,10,40,.4)'; g.fillRect(0, 0, cv.width, cv.height); }
    hud();
  }
  function hud() {
    if (!game) { $('hud-time').textContent = B.RUN_SECONDS + 's'; $('hud-time').classList.remove('hurry'); $('hud-score').textContent = '0'; $('combo-bar').style.width = '0'; $('combo-text').textContent = ''; return; }
    var st = game.state;
    var left = Math.max(0, Math.ceil(B.RUN_SECONDS - st.time));
    $('hud-time').textContent = left + 's';
    $('hud-time').classList.toggle('hurry', mode === 'play' && left <= 10);
    $('hud-score').textContent = String(Math.round(st.score));
    $('hud-score').classList.toggle('bump', scoreBump > 0 && !reduced);
    if (mode === 'play' && arenaId) { var pbv = bestFor(arenaId, runMod), ahead = pbv > 0 && Math.round(st.score) > pbv, hb = $('hud-best'); hb.textContent = ahead ? 'New best!' : 'Best ' + pbv; hb.classList.toggle('ahead', ahead); }
    var frac = st.combo > 0 ? Math.max(0, 1 - (st.time - st.lastCatchAt) / B.COMBO_WINDOW) : 0;
    $('combo-bar').style.width = (frac * 100).toFixed(0) + '%';
    $('combo-text').textContent = st.combo > 1 ? 'Combo x' + mult(st.combo).toFixed(2).replace(/0$/, '') : (st.combo === 1 ? 'Combo 1' : 'No combo');
  }

  // ---------- overlays ----------
  function stars(n) { return '★'.repeat(n) + '☆'.repeat(3 - n); }
  function showMenu() {
    mode = 'menu'; game = null; arenaId = null; paused = false; pauseWhy = ''; music(null);
    clear(overlay); overlay.hidden = false;
    overlay.appendChild(el('h2', 'Bug Safari'));
    var tot = el('p', 'Pick an arena. 90 seconds, no rush between runs. Stars: ' + totalStars() + ' / ' + (ALL.length * 3 + B.GOAL_COUNT), 'dim'); tot.id = 'menu-stars'; overlay.appendChild(tot);
    var grid = el('div', undefined, 'grid');
    ALL.forEach(function (a, i) {
      var open = unlocked(i);
      var b = btn('', function () { beep('select'); startArena(a.id); }, !open);
      b.className = 'card'; b.dataset.arena = a.id;
      b.appendChild(el('strong', NAMES[a.id] + (a.glade ? ' (night variant)' : (a.night ? ' (night)' : ''))));
      b.appendChild(el('span', open ? stars(save.stars[a.id]) : 'Locked'));
      if (open && MODS_ON) { var nm0 = peekNext(a.id).mod, mt = el('small', 'Next run: ' + B.MODS[nm0].name, 'cardmod'); mt.dataset.mod = nm0; mt.title = B.MODS[nm0].line; b.appendChild(mt); }
      var ns = save.stars[a.id]; var sm = el('small', open ? 'Best ' + save.best[a.id] + '  |  ' + (ns < 3 ? 'next star at ' + a.stars[ns] : 'all 3 stars') : 'Needs ' + needStars(i) + ' stars'); sm.className = 'cardnext'; b.appendChild(sm); // FUN1: the next target, not a bare 60/120/200
      grid.appendChild(b);
    });
    overlay.appendChild(grid);
    if (MODS_ON) {
      var ml = el('div', undefined, 'modlist'); ml.id = 'mod-list';
      ml.appendChild(el('p', 'Run modifiers: every run rolls one of these ' + B.MOD_IDS.length + ', each with a 1 in ' + B.MOD_IDS.length + ' chance. Modifier bests are kept apart from plain bests. Add ?mods=0 to the address to play plain runs.', 'dim'));
      var ul = el('ul'); B.MOD_IDS.forEach(function (m) { var li = el('li', B.MODS[m].name + ': ' + B.MODS[m].line); li.dataset.mod = m; ul.appendChild(li); }); ml.appendChild(ul);
      overlay.appendChild(ml);
    }
    var rule = el('p', 'Unlock rule: Meadow is always open. Every other arena opens when your total stars across all arenas reach 2 x (its number - 1): Orchard 2, Pond Edge 4, Forest 6, Dunes 8, Cliffs 10, Marsh 12, Lantern Glade 14, Night Glade 16. Earn 1 to 3 stars per arena by score, and 1 star for each journal goal you finish. Nothing is ever locked by time.', 'dim'); rule.id = 'unlock-rule'; overlay.appendChild(rule);
    var row = el('div', undefined, 'row');
    var j = btn('Bug journal', function () { beep('ui_open'); showJournal(); }); j.id = 'open-journal'; row.appendChild(j);
    if (settings) { var stb = btn('Settings', openSettings); stb.id = 'open-settings'; row.appendChild(stb); }
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
    var row = el('div', undefined, 'row'); row.appendChild(btn('Back', function () { beep('back'); showMenu(); })); overlay.appendChild(row);
  }
  var sumCard = null; // one persistent card element: MMMiniKit adds its R / Enter key handler once per element
  function showSummary() {
    var K = window.MMMiniKit;
    if (!K) return showSummaryPlain();
    var s = lastSummary; clear(overlay); overlay.hidden = false;
    if (!sumCard) { sumCard = document.createElement('section'); sumCard.id = 'sum-card'; }
    var lines = [];
    if (s.mod) lines.push({ id: 'sum-mod', text: B.MODS[s.mod].name + ': ' + B.MODS[s.mod].line, cls: 'modline' });
    lines.push({ id: 'sum-stars', text: stars(s.stars), cls: 'stars' });
    lines.push({ id: 'sum-score', text: 'Score ' + s.score + (s.newBest ? '  (new best!)' : '  (best ' + s.best + ')'), cls: '' });
    // the personal-best chase in one honest line
    lines.push({ id: 'sum-chase', text: s.score === 0 && s.best === 0 ? 'Walk up close, then swing the net.' : s.newBest ? (s.prevBest > 0 ? 'New best by ' + (s.score - s.prevBest) + ' points!' : 'First score on the board!') : (s.best - s.score === 0 ? 'Tied your best!' : (s.best - s.score) + ' points to beat your best.'), cls: s.newBest ? 'chase win' : 'chase' });
    var card = K.panel(sumCard, K.result({
      title: 'Time!', headline: ['Time! ' + NAMES[s.arena]], lines: lines, goalText: 'Next: ' + s.hint,
      more: [{ id: 'replay', label: 'Replay seed' }, { id: 'to-menu', label: 'Arenas' }],
      ids: { again: 'again', goal: 'sum-hint' }
    }), { again: function () { startArena(s.arena); }, more: [function () { startArena(s.arena, { seed: s.seed, mod: s.mod }); }, showMenu], holdMs: GUARD_MS, keyReady: function () { return mode === 'summary'; } });
    overlay.appendChild(sumCard);
    var acts = sumCard.querySelector('.mk-actions'); if (acts) acts.id = 'sum-actions';
    if (card.again) card.again.classList.add('again');
    if (card.more[0]) card.more[0].title = 'Same bugs, same start, same modifier';
    overlay.appendChild(el('p', 'Enter or R plays again.', 'dim keyhint'));
    overlay.appendChild(el('p', 'Bugs caught: ' + s.caught));
    var gp = el('p', 'Stars gained: ' + s.gained); gp.id = 'sum-gained'; overlay.appendChild(gp);
    var cp = el('p', 'Best combo: ' + s.bestCombo + (s.bestCombo > 1 ? ' (x' + mult(s.bestCombo).toFixed(2).replace(/0$/, '') + ')' : '')); cp.id = 'sum-combo'; overlay.appendChild(cp);
    var cl = el('div'); cl.id = 'sum-counts';
    SPECIES.concat(B.GLADE_SPECIES).forEach(function (sp) { if (s.counts[sp]) { var li = el('div', SP_NAME[sp] + ' x' + s.counts[sp]); li.dataset.species = sp; cl.appendChild(li); } });
    if (!cl.firstChild) cl.appendChild(el('div', 'No bugs this time', 'dim'));
    overlay.appendChild(cl);
    if (s.goals && s.goals.length) { var sg = el('p', 'Journal goal done (+' + s.goals.length + ' star' + (s.goals.length > 1 ? 's' : '') + '): ' + s.goals.join(', ')); sg.id = 'sum-goals'; overlay.appendChild(sg); }
    if (s.newlyUnlocked.length) overlay.appendChild(el('p', 'Unlocked: ' + s.newlyUnlocked.join(', ')));
    var nm = el('p', s.nearMisses ? 'Near misses: ' + s.nearMisses + ' (stand a little closer before you swing)' : 'Near misses: 0', 'dim'); nm.id = 'sum-near'; overlay.appendChild(nm);
    var cb = el('p', 'Arena best combo: ' + s.comboBest + (s.newComboBest ? ' (new!)' : ''), 'dim'); cb.id = 'sum-combo-best'; overlay.appendChild(cb);
  }
  function showSummaryPlain() {
    var s = lastSummary; clear(overlay); overlay.hidden = false;
    overlay.appendChild(el('h2', 'Time! ' + NAMES[s.arena]));
    if (s.mod) { var smd = el('p', s.mod ? B.MODS[s.mod].name + ': ' + B.MODS[s.mod].line : '', 'modline'); smd.id = 'sum-mod'; overlay.appendChild(smd); }
    var st = el('p', stars(s.stars), 'stars'); st.id = 'sum-stars'; overlay.appendChild(st);
    var sc = el('p', 'Score ' + s.score + (s.newBest ? '  (new best!)' : '  (best ' + s.best + ')')); sc.id = 'sum-score'; overlay.appendChild(sc);
    // FUN1: the personal-best chase in one honest line, and Play again right under the result (one tap, or Enter / R)
    var chase = s.score === 0 && s.best === 0 ? 'Walk up close, then swing the net.' : s.newBest ? (s.prevBest > 0 ? 'New best by ' + (s.score - s.prevBest) + ' points!' : 'First score on the board!') : (s.best - s.score === 0 ? 'Tied your best!' : (s.best - s.score) + ' points to beat your best.');
    var ch = el('p', chase, s.newBest ? 'chase win' : 'chase'); ch.id = 'sum-chase'; overlay.appendChild(ch);
    var top = el('div', undefined, 'row'); top.id = 'sum-actions';
    var again = btn('Play again', function () { startArena(s.arena); }, false); again.id = 'again'; again.className = 'again'; top.appendChild(again);
    var rp = btn('Replay seed', function () { startArena(s.arena, { seed: s.seed, mod: s.mod }); }, false); rp.id = 'replay'; rp.title = 'Same bugs, same start, same modifier'; top.appendChild(rp);
    var back = btn('Arenas', showMenu); back.id = 'to-menu'; top.appendChild(back);
    overlay.appendChild(top);
    overlay.appendChild(el('p', 'Enter or R plays again.', 'dim keyhint'));
    overlay.appendChild(el('p', 'Bugs caught: ' + s.caught));
    var gp = el('p', 'Stars gained: ' + s.gained); gp.id = 'sum-gained'; overlay.appendChild(gp);
    var cp = el('p', 'Best combo: ' + s.bestCombo + (s.bestCombo > 1 ? ' (x' + mult(s.bestCombo).toFixed(2).replace(/0$/, '') + ')' : '')); cp.id = 'sum-combo'; overlay.appendChild(cp);
    var cl = el('div'); cl.id = 'sum-counts';
    SPECIES.forEach(function (sp) { if (s.counts[sp]) { var li = el('div', SP_NAME[sp] + ' x' + s.counts[sp]); li.dataset.species = sp; cl.appendChild(li); } });
    if (!cl.firstChild) cl.appendChild(el('div', 'No bugs this time', 'dim'));
    overlay.appendChild(cl);
    if (s.goals && s.goals.length) { var sg = el('p', 'Journal goal done (+' + s.goals.length + ' star' + (s.goals.length > 1 ? 's' : '') + '): ' + s.goals.join(', ')); sg.id = 'sum-goals'; overlay.appendChild(sg); }
    if (s.newlyUnlocked.length) overlay.appendChild(el('p', 'Unlocked: ' + s.newlyUnlocked.join(', ')));
    var nm = el('p', s.nearMisses ? 'Near misses: ' + s.nearMisses + ' (stand a little closer before you swing)' : 'Near misses: 0', 'dim'); nm.id = 'sum-near'; overlay.appendChild(nm);
    var cb = el('p', 'Arena best combo: ' + s.comboBest + (s.newComboBest ? ' (new!)' : ''), 'dim'); cb.id = 'sum-combo-best'; overlay.appendChild(cb);
    var hp = el('p', 'Next: ' + s.hint, 'dim'); hp.id = 'sum-hint'; overlay.appendChild(hp);
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
  var MOVE_CODES = ['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'];
  function setPaused(v, why) { if (mode !== 'play' || !game) return; if (!v && !paused) return; paused = !!v; pauseWhy = v ? (why || 'key') : ''; if (v) { for (var k in keys) keys[k] = false; joy.x = joy.y = 0; sneakBtn = false; } }
  window.addEventListener('keydown', function (e) {
    if (window.MMInput && window.MMInput.isTyping(e.target)) return;
    var act = window.MMInput ? window.MMInput.actionOf(e) : null; // universal controls: Esc / P pause, Enter = Space, E = Shift
    if (mode === 'play' && (MOVE_CODES.indexOf(e.code) >= 0 || act === 'primary' || act === 'menu')) e.preventDefault();
    if (mode === 'play' && act === 'menu') { if (!e.repeat) { if (paused) setPaused(false); else setPaused(true, 'key'); } return; }
    if (mode === 'play' && paused && pauseWhy === 'key' && (act === 'primary' || act === 'up' || act === 'down' || act === 'left' || act === 'right')) { setPaused(false); return; }
    keys[e.code] = true;
    if (mode === 'play' && hintOpen && act && act !== 'restart') dismissHint(); // keyboard-only players never need the mouse for the how-to card
    if (mode === 'play' && act === 'primary') doSwing();
    // fallback only: with MMMiniKit the result card owns R / Enter
    if (!window.MMMiniKit && mode === 'summary' && lastSummary && (e.code === 'KeyR' || ((e.code === 'Enter' || e.code === 'NumpadEnter') && !(document.activeElement && document.activeElement.id === 'to-menu')))) {
      e.preventDefault(); startArena(lastSummary.arena);
    }
  });
  window.addEventListener('keyup', function (e) { keys[e.code] = false; });
  window.addEventListener('blur', function () { keys = {}; joy.x = joy.y = 0; sneakBtn = false; });
  document.addEventListener('visibilitychange', function () { if (document.hidden) setPaused(true, 'hidden'); }); // a backgrounded tab never costs a run
  // Keyboard clicks (detail 0) right after the timer ends are the tail of mashing Space: never let them skip the result card.
  overlay.addEventListener('click', function (e) { if (mode === 'summary' && e.detail === 0 && performance.now() - endAt < GUARD_MS && e.target.closest && e.target.closest('button')) { e.stopPropagation(); e.preventDefault(); } }, true);
  cv.addEventListener('pointerdown', function (e) { e.preventDefault(); if (paused) { setPaused(false); return; } if (hintOpen && mode === 'play') dismissHint(); doSwing(); });
  var swingBtn = $('btn-swing');
  swingBtn.addEventListener('pointerdown', function (e) { e.preventDefault(); if (paused) { setPaused(false); return; } if (hintOpen && mode === 'play') dismissHint(); doSwing(); });
  var sneakEl = $('btn-sneak');
  function setSneak(v) { sneakBtn = v; sneakEl.classList.toggle('on', v); }
  sneakEl.addEventListener('pointerdown', function (e) { e.preventDefault(); if (hintOpen && mode === 'play') dismissHint(); setSneak(true); });
  ['pointerup', 'pointercancel', 'pointerleave'].forEach(function (n) { sneakEl.addEventListener(n, function () { setSneak(false); }); });
  var joyEl = $('joy'), knob = $('knob'), joyId = null;
  function joyMove(e) {
    var r = joyEl.getBoundingClientRect(), cx = r.left + r.width / 2, cy = r.top + r.height / 2, R0 = r.width / 2 - 10;
    var dx = e.clientX - cx, dy = e.clientY - cy, L = Math.hypot(dx, dy) || 1, k = Math.min(1, L / R0);
    joy.x = dx / L * k; joy.y = dy / L * k;
    knob.style.transform = 'translate(' + (joy.x * R0) + 'px,' + (joy.y * R0) + 'px)';
  }
  function joyEnd() { joyId = null; joy.x = joy.y = 0; knob.style.transform = ''; }
  joyEl.addEventListener('pointerdown', function (e) { e.preventDefault(); if (paused) setPaused(false); if (hintOpen && mode === 'play') dismissHint(); joyId = e.pointerId; try { joyEl.setPointerCapture(e.pointerId); } catch (x) { /* ignore */ } joyMove(e); });
  joyEl.addEventListener('pointermove', function (e) { if (e.pointerId === joyId) joyMove(e); });
  joyEl.addEventListener('pointerup', joyEnd); joyEl.addEventListener('pointercancel', joyEnd);

  // ---------- shared Settings panel + Menu (pause while either is open) ----------
  var settings = null;
  try { if (window.MMSettings) settings = window.MMSettings.mount({ page: 'bugs' }); } catch (e) { settings = null; }
  function openSettings() { if (!settings) return; if (mode === 'play') setPaused(true, 'settings'); settings.open(); }
  if (window.MMNav) {
    try {
      if (window.MMNav.onOpen) window.MMNav.onOpen(function () { if (mode === 'play' && !paused) setPaused(true, 'nav'); });
      if (window.MMNav.onClose) window.MMNav.onClose(function () { if (pauseWhy === 'nav') setPaused(false); });
      if (settings && window.MMNav.onSettings) window.MMNav.onSettings(openSettings);
    } catch (e) { /* the shared menu is optional */ }
  }
  window.addEventListener('mm-settings-change', function (e) {
    var d = (e && e.detail) || {};
    if (d.id === 'sound') { ensureSfx(); if (sfx) sfx.setMuted(!d.value); syncMute(); }
    else if (d.id === 'music') { ensureSfx(); if (sfx) { sfx.setMusic(!!d.value); if (d.value && mode === 'play') music('minigame'); } }
    else if (d.id === 'reduce-motion' || d.id === 'flashes') reduced = !!(mq && mq.matches) || sideReduced();
    else if (d.id === 'low-gfx') readGfx();
  });

  // ---------- loop ----------
  var last = 0;
  function frame(t) {
    if (!testClock) {
      var dt = last ? Math.min(0.05, (t - last) / 1000) : 0; last = t; // capped: a hidden tab never advances time
      if (pauseWhy === 'settings' && settings && !settings.isOpen()) setPaused(false);
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
      get paused() { return paused; },
      get pauseWhy() { return pauseWhy; },
      get cues() { return played.slice(); },
      setPaused: setPaused,
      openSettings: openSettings,
      setGuard: function (ms) { GUARD_MS = ms; },
      get settings() { return settings; },
      get run() { return game ? game.state : null; },
      get reduced() { return reduced; },
      get save() { return JSON.parse(JSON.stringify(save)); },
      get summary() { return lastSummary; },
      get shake() { return shake; },
      get banner() { return banner ? banner.text : null; },
      get nearMisses() { return nearMisses; },
      get warned() { return warned; },
      get popups() { return popups.map(function (p) { return p.text; }); },
      get pb() { return JSON.parse(JSON.stringify(pb)); },
      get mod() { return runMod; },
      get seed() { return runSeed; },
      get modsOn() { return MODS_ON; },
      nextFor: function (id) { return JSON.parse(JSON.stringify(peekNext(id))); },
      get particles() { return particles.length; },
      bugArt: function () { return { scale: bugStat.scale, draws: bugStat.draws, ink: bugStat.ink, theme: THEME, inks: Object.keys(THEME).map(function (k) { return [k, inkFor(k)]; }) }; },
      get gfx() { return { tier: gfx.tier, low: gfx.low, cap: gfx.cap, burst: gfx.burst, dpr: gfx.dpr || 1 }; },
      render: render,
      renderAt: function (t) { if (game) game.state.time = t; render(); }, // draw one frame at run time t (no step: nothing wanders)
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
