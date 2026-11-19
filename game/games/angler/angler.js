// Lakeside Angler page. Canvas + DOM, no network. Logic lives in shared/mm-angler.js.
(function () {
  'use strict';
  const A = window.MMAngler, Store = window.MMStore, Rng = window.MMRng;
  const KEY = 'pixeltown-angler-v1';
  const W = 320, H = 480, WATER = 170;
  const params = new URLSearchParams(location.search);
  const TEST = params.get('test') === '1';
  const RARITY = ['', 'Common', 'Uncommon', 'Rare', 'Epic', 'Legendary'];
  const MANGROVE_NEEDS = 10; // species caught before the secret Mangrove opens

  const $ = (id) => document.getElementById(id);
  const cv = $('scene'), ctx = cv.getContext('2d');
  ctx.imageSmoothingEnabled = false;
  const mq = window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)') : null;
  const reduced = () => !!(mq && mq.matches);

  // ---- rng / clock / date (seeded and fake in test mode) ----
  let rng = Math.random;
  if (TEST) { const seed = /^[\w-]{1,32}$/.test(params.get('seed') || '') ? params.get('seed') : 'angler'; const r = Rng.create(seed); rng = r.next; }
  let ready = false;
  let dateOverride = null; // {month, hour}
  function setDate(str) {
    const m = /^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}))?$/.exec(String(str || ''));
    if (!m) { dateOverride = null; return false; }
    const month = +m[2];
    if (month < 1 || month > 12) return false;
    dateOverride = { month, hour: m[4] === undefined ? 12 : Math.min(23, +m[4]) };
    if (ready) renderSpots();
    return true;
  }
  if (TEST) setDate(params.get('date'));
  function nowCtx() {
    if (dateOverride) return { month: dateOverride.month, hour: dateOverride.hour, weather: 'clear' };
    const d = new Date();
    return { month: d.getMonth() + 1, hour: d.getHours(), weather: 'clear' };
  }

  // ---- journal ----
  let journal = A.journal.clean(Store.get(KEY, null));
  function saveJournal() { journal = A.journal.clean(journal); Store.set(KEY, journal); }

  // ---- state ----
  const g = {
    state: 'idle', spot: 'west', bite: null, reel: null, fish: null, size: 0, forced: null,
    result: null, t: 0, hooked: 0, calm: false, fx: [], bobY: 0,
  };
  const held = { ptr: false, key: false, pad: false, test: false };
  const anyHeld = () => held.ptr || held.key || held.pad || held.test;

  function spotLocked(id) {
    const c = nowCtx();
    if (id === 'ice') return !A.iceOpen(c.month);
    if (id === 'mangrove') return A.journal.speciesCount(journal) < MANGROVE_NEEDS;
    return false;
  }
  function lockReason(id) {
    if (id === 'ice') return 'Open Dec-Feb';
    if (id === 'mangrove') return 'Catch ' + MANGROVE_NEEDS + ' species';
    return '';
  }
  function setMsg(t) { $('msg').textContent = t; }

  function pickSpot(id) {
    if (A.SPOTS.indexOf(id) < 0 || spotLocked(id)) return false;
    if (g.state !== 'idle') return false;
    g.spot = id; renderSpots(); setMsg(idleMsg()); $('spot-title').textContent = A.SPOT_NAMES[id];
    return true;
  }
  const idleMsg = () => 'Press, click or tap to cast at ' + A.SPOT_NAMES[g.spot] + '.';

  // ---- flow ----
  function cast() {
    if (g.state !== 'idle') return;
    if (spotLocked(g.spot)) { setMsg('This spot is closed right now.'); return; }
    g.bite = A.bite(rng); g.state = 'waiting'; g.t = 0;
    setMsg('Waiting for a bite... (do not press yet)');
    renderSpots();
  }
  function finish(outcome, title, detail) {
    g.state = 'result'; g.result = { outcome, fish: g.fish && g.fish.id, size: g.size };
    $('res-title').textContent = title; $('res-detail').textContent = detail;
    $('res-ok').textContent = outcome === 'caught' ? 'Cast again' : 'Try again';
    $('result').hidden = false; g.resultAt = g.t;
    setMsg(title); renderSpots();
    if (!TEST) setTimeout(() => { try { $('res-ok').focus({ preventScroll: true }); } catch (e) { /* ignore */ } }, 0);
  }
  function dismiss() {
    if (g.state !== 'result') return;
    $('result').hidden = true; g.state = 'idle'; g.reel = null; g.bite = null; g.fish = null;
    setMsg(idleMsg()); renderSpots();
  }
  function onDown() {
    if (!$('journal').hidden) return;
    if (g.state === 'idle') cast();
    else if (g.state === 'waiting' || g.state === 'biting') {
      const r = g.bite.press();
      if (r === 'spooked') { finish('spooked', 'Spooked!', 'You pulled too early. The fish swam away.'); }
      else if (r === 'hooked') hook();
    }
  }
  function hook() {
    const c = nowCtx();
    const f = g.forced ? A.BY_ID[g.forced] : A.rollFish(rng, g.spot, c, {});
    g.forced = null;
    if (!f) { finish('none', 'Nothing here', 'This spot is closed.'); return; }
    g.fish = f; g.size = A.rollSize(rng, f);
    g.reel = A.reel.create(f, 'stick', { seed: Math.floor(rng() * 1e9), calm: g.calm });
    g.state = 'reeling'; g.t = 0;
    setMsg('Hooked! Hold to reel. Keep the zone on the fish.');
    renderSpots();
  }
  function land() {
    const f = g.fish, isNew = !journal.caught[f.id];
    journal = A.journal.record(journal, f.id, g.size);
    saveJournal(); renderJournalCount();
    finish('caught', (isNew ? 'New! ' : '') + f.name, RARITY[f.rarity] + ' (' + f.rarity + '/5) - ' + g.size + ' cm');
  }

  function step(dt) {
    g.t += dt;
    if (g.state === 'waiting' || g.state === 'biting') {
      const s = g.bite.tick(dt);
      if (s === 'biting' && g.state === 'waiting') { g.state = 'biting'; setMsg('A bite! Press now!'); }
      else if (s === 'missed') finish('missed', 'Too slow', 'The fish got away.');
    } else if (g.state === 'reeling') {
      const r = g.reel.tick(dt, anyHeld());
      if (r.status === 'snapped') finish('snapped', 'Line snapped!', 'Tension stayed at max too long. Release more often.');
      else if (r.status === 'caught') land();
    }
    if (g.state === 'biting' || g.state === 'hooked') g.bobY = 6;
    else g.bobY = reduced() || g.state !== 'waiting' ? 0 : Math.sin(g.t * 3) * 1.5;
  }

  // ---- input ----
  function setInput(src, v) {
    const before = anyHeld(); held[src] = v; const after = anyHeld();
    if (!before && after) onDown();
  }
  const ignoreEl = (t) => t && t.closest && t.closest('button, a, select, input, label, .overlay, #result');
  document.addEventListener('pointerdown', (e) => { if (ignoreEl(e.target)) return; setInput('ptr', true); });
  const up = () => setInput('ptr', false);
  document.addEventListener('pointerup', up); document.addEventListener('pointercancel', up);
  window.addEventListener('blur', () => { held.ptr = held.key = held.pad = false; });
  document.addEventListener('keydown', (e) => {
    if (e.code !== 'Space' || e.repeat) return;
    if (!$('journal').hidden) return;
    e.preventDefault();
    if (g.state === 'result') { if (g.t - g.resultAt > 0.25 || TEST) dismiss(); return; }
    setInput('key', true);
  });
  document.addEventListener('keyup', (e) => { if (e.code === 'Space') setInput('key', false); });
  function pollPad() {
    try {
      const pads = navigator.getGamepads ? navigator.getGamepads() : [];
      let a = false;
      for (const p of pads) if (p && p.buttons[0] && p.buttons[0].pressed) a = true;
      if (a && g.state === 'result' && g.t - g.resultAt > 0.4) { dismiss(); held.pad = true; return; }
      if (g.state !== 'result') setInput('pad', a); else held.pad = a;
    } catch (e) { /* ignore */ }
  }
  $('res-ok').addEventListener('click', dismiss);

  // ---- DOM: spots / journal ----
  function renderSpots() {
    const box = $('spots'); box.textContent = '';
    A.SPOTS.forEach((id) => {
      const b = document.createElement('button');
      b.type = 'button'; b.className = 'btn' + (id === g.spot ? ' sel' : '');
      b.dataset.spot = id;
      const locked = spotLocked(id);
      b.textContent = A.SPOT_NAMES[id] + (locked ? ' (' + lockReason(id) + ')' : '');
      if (locked) { b.classList.add('locked'); b.setAttribute('aria-disabled', 'true'); }
      if (g.state !== 'idle') b.disabled = true;
      b.addEventListener('click', () => { if (locked) setMsg(A.SPOT_NAMES[id] + ': ' + lockReason(id) + '.'); else pickSpot(id); });
      box.appendChild(b);
    });
  }
  function renderJournalCount() {
    const n = A.journal.speciesCount(journal);
    $('journal-count').textContent = n + '/' + A.FISH.length;
    $('jsum').textContent = n + ' of ' + A.FISH.length + ' species';
  }
  function initFilters() {
    const fs = $('f-spot'), fr = $('f-rarity');
    const opt = (sel, v, t) => { const o = document.createElement('option'); o.value = v; o.textContent = t; sel.appendChild(o); };
    opt(fs, 'all', 'All spots'); A.SPOTS.forEach((s) => opt(fs, s, A.SPOT_NAMES[s]));
    opt(fr, 'all', 'All rarities'); for (let i = 1; i <= 5; i++) opt(fr, String(i), RARITY[i]);
    fs.addEventListener('change', renderJournal); fr.addEventListener('change', renderJournal);
    $('calm').addEventListener('change', (e) => { g.calm = e.target.checked; });
  }
  function renderJournal() {
    const grid = $('jgrid'); grid.textContent = '';
    const sp = $('f-spot').value, ra = $('f-rarity').value;
    A.FISH.forEach((f) => {
      if (sp !== 'all' && f.spots.indexOf(sp) < 0) return;
      if (ra !== 'all' && String(f.rarity) !== ra) return;
      const e = journal.caught[f.id];
      const card = document.createElement('div'); card.className = 'card' + (e ? '' : ' unk'); card.dataset.id = f.id;
      const c = document.createElement('canvas'); c.width = 48; c.height = 28;
      const cx = c.getContext('2d'); cx.imageSmoothingEnabled = false;
      drawFish(cx, 24, 14, 16, f, !e);
      const nm = document.createElement('div'); nm.className = 'nm'; nm.textContent = e ? f.name : '???';
      const sub = document.createElement('div'); sub.className = 'sub';
      sub.textContent = e ? 'x' + e.n + ' best ' + e.best + ' cm - ' + RARITY[f.rarity] : RARITY[f.rarity];
      card.appendChild(c); card.appendChild(nm); card.appendChild(sub); grid.appendChild(card);
    });
  }
  function openJournal() { renderJournal(); $('journal').hidden = false; $('journal-close').focus(); }
  function closeJournal() { $('journal').hidden = true; $('journal-btn').focus(); }
  $('journal-btn').addEventListener('click', openJournal);
  $('journal-close').addEventListener('click', closeJournal);
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !$('journal').hidden) closeJournal(); });

  // ---- drawing ----
  function hashOf(s) { let h = 7; for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0; return h; }
  function drawFish(c, x, y, s, f, silhouette) {
    const h = hashOf(f.id), hue = h % 360, flat = f.behaviour === 'sinker', long = (h >> 3) % 3;
    const body = silhouette ? '#10202c' : 'hsl(' + hue + ',60%,' + (45 + f.rarity * 3) + '%)';
    const fin = silhouette ? '#10202c' : 'hsl(' + hue + ',65%,30%)';
    const bw = s * (1 + long * 0.18), bh = s * (flat ? 0.4 : 0.6);
    c.fillStyle = fin;
    c.beginPath(); c.moveTo(x - bw * 0.7, y); c.lineTo(x - bw * 1.2, y - bh * 0.7); c.lineTo(x - bw * 1.2, y + bh * 0.7); c.closePath(); c.fill();
    c.beginPath(); c.moveTo(x - bw * 0.1, y - bh * 0.4); c.lineTo(x + bw * 0.2, y - bh * 0.9); c.lineTo(x + bw * 0.4, y - bh * 0.4); c.closePath(); c.fill();
    c.fillStyle = body;
    c.beginPath(); c.ellipse(x, y, bw * 0.8, bh * 0.5, 0, 0, Math.PI * 2); c.fill();
    if (!silhouette) {
      c.fillStyle = 'rgba(255,255,255,.35)'; c.fillRect(x - bw * 0.4, y + bh * 0.1, bw * 0.7, Math.max(1, bh * 0.12));
      c.fillStyle = '#fff'; c.fillRect(x + bw * 0.4, y - bh * 0.2, Math.max(1.5, s * 0.1), Math.max(1.5, s * 0.1));
      c.fillStyle = '#111'; c.fillRect(x + bw * 0.5, y - bh * 0.12, Math.max(1, s * 0.05), Math.max(1, s * 0.05));
    }
  }
  const BX = 200, BY = 255;
  function draw() {
    const c = ctx, t = g.t;
    const night = nowCtx().hour >= 19 || nowCtx().hour < 6;
    c.fillStyle = night ? '#16213f' : '#7cc7ee'; c.fillRect(0, 0, W, WATER);
    c.fillStyle = night ? '#2a3a66' : '#a9dcf5'; c.fillRect(0, 100, W, 70);
    c.fillStyle = night ? '#1d2d4a' : '#5aa56a'; c.beginPath(); c.moveTo(0, WATER); c.lineTo(0, 130); c.lineTo(80, 100); c.lineTo(170, 135); c.lineTo(260, 95); c.lineTo(W, 125); c.lineTo(W, WATER); c.fill();
    if (night) { c.fillStyle = '#fff'; for (let i = 0; i < 14; i++) c.fillRect((i * 53) % W, (i * 29) % 80, 2, 2); }
    else { c.fillStyle = '#fff'; c.fillRect(40, 62, 40, 10); c.fillRect(50, 56, 24, 8); c.fillRect(150, 74, 44, 10); }
    // water
    const spotHue = { west: '#2f86c7', east: '#2a78a8', river: '#3a9bb5', pier: '#1f5f9e', ice: '#9fd6ea', mangrove: '#2c7f6a' }[g.spot];
    c.fillStyle = spotHue; c.fillRect(0, WATER, W, H - WATER);
    c.fillStyle = 'rgba(0,0,0,.12)';
    for (let y = WATER + 16; y < H; y += 24) c.fillRect(0, y, W, 8);
    if (!reduced()) {
      c.fillStyle = 'rgba(255,255,255,.22)';
      for (let i = 0; i < 18; i++) {
        const yy = WATER + 10 + ((i * 37) % (H - WATER - 20)), xx = ((i * 71 + t * 14 * (1 + (i % 3) * 0.3)) % (W + 30)) - 15;
        c.fillRect(xx, yy, 14, 2);
      }
    }
    if (g.spot === 'ice') { c.fillStyle = 'rgba(255,255,255,.4)'; c.fillRect(0, WATER, W, 6); }
    // dock + angler
    c.fillStyle = '#8a5a34'; c.fillRect(0, 150, 96, 14); c.fillStyle = '#6b4226'; c.fillRect(0, 164, 96, 4);
    c.fillStyle = '#d9534f'; c.fillRect(40, 118, 14, 18); c.fillStyle = '#f1c9a5'; c.fillRect(42, 106, 10, 10); c.fillStyle = '#e2b84a'; c.fillRect(40, 102, 14, 5);
    c.fillStyle = '#334'; c.fillRect(42, 136, 4, 14); c.fillRect(48, 136, 4, 14);
    const tipX = 88, tipY = g.state === 'reeling' ? 86 : 96;
    c.strokeStyle = '#5a3a1a'; c.lineWidth = 2; c.beginPath(); c.moveTo(52, 124); c.lineTo(tipX, tipY); c.stroke();
    const active = g.state === 'waiting' || g.state === 'biting' || g.state === 'reeling';
    const bx = g.state === 'reeling' ? BX - 20 : BX, by = (g.state === 'reeling' ? 215 : BY) + g.bobY;
    if (active) {
      c.strokeStyle = 'rgba(255,255,255,.85)'; c.lineWidth = 1; c.beginPath(); c.moveTo(tipX, tipY); c.quadraticCurveTo((tipX + bx) / 2, tipY - 10, bx, by - 3); c.stroke();
      c.fillStyle = '#fff'; c.fillRect(bx - 4, by - 3, 8, 6); c.fillStyle = '#e63946'; c.fillRect(bx - 4, by - 8, 8, 5);
      c.fillStyle = 'rgba(255,255,255,.5)'; c.fillRect(bx - 10, by + 4, 20, 2);
      if (g.state === 'biting') { c.fillStyle = '#ffd166'; c.font = 'bold 30px sans-serif'; c.textAlign = 'center'; c.fillText('!', bx, by - 20); }
    } else if (g.state === 'idle') {
      c.strokeStyle = 'rgba(255,255,255,.85)'; c.lineWidth = 1; c.beginPath(); c.moveTo(tipX, tipY); c.lineTo(tipX + 4, 150); c.stroke();
    }
    if (g.state === 'reeling' && g.reel) drawReel(c);
    if (g.state === 'result' && g.result && g.result.outcome === 'caught') drawFish(c, W / 2, 290, 46, g.fish, false);
    if (g.state === 'idle' || g.state === 'result') {
      c.fillStyle = 'rgba(0,0,0,.35)'; c.font = '12px sans-serif'; c.textAlign = 'left'; c.fillText(A.SPOT_NAMES[g.spot], 8, 18);
    }
  }
  function drawReel(c) {
    const r = g.reel, bx = 268, bw = 34, top = 60, bot = 440, hgt = bot - top;
    const yOf = (v) => bot - v * hgt;
    c.fillStyle = 'rgba(8,20,30,.78)'; c.fillRect(bx - 6, top - 8, bw + 12, hgt + 16);
    c.fillStyle = '#12384f'; c.fillRect(bx, top, bw, hgt);
    const zTop = yOf(Math.min(1, r.tension + r.zone / 2)), zBot = yOf(Math.max(0, r.tension - r.zone / 2));
    const ok = r.inZone();
    c.fillStyle = ok ? 'rgba(111,227,160,.65)' : 'rgba(255,209,102,.5)'; c.fillRect(bx, zTop, bw, zBot - zTop);
    c.strokeStyle = ok ? '#6fe3a0' : '#ffd166'; c.lineWidth = 2; c.strokeRect(bx, zTop, bw, zBot - zTop);
    // snap danger at top
    const danger = Math.min(1, r.atMax / r.snapLimit);
    c.fillStyle = 'rgba(255,60,60,' + (0.25 + 0.6 * danger) + ')'; c.fillRect(bx, top, bw, 10);
    if (danger > 0) { c.fillStyle = '#ff6b6b'; c.fillRect(bx - 4, top - 6, (bw + 8) * danger, 4); }
    drawFish(c, bx + bw / 2, yOf(r.pos), 12, g.fish, false);
    // catch meter, horizontal
    c.fillStyle = 'rgba(8,20,30,.78)'; c.fillRect(20, 14, 200, 18);
    c.fillStyle = '#12384f'; c.fillRect(24, 18, 192, 10);
    c.fillStyle = '#6fe3a0'; c.fillRect(24, 18, 192 * r.meter, 10);
    c.fillStyle = '#fff'; c.font = '10px sans-serif'; c.textAlign = 'left'; c.fillText('CATCH', 24, 44);
    if (r.side) c.fillRect(160 + r.side * 40, 46, 4, 4);
  }

  // ---- loop ----
  let last = 0;
  function frame(ts) {
    if (!last) last = ts;
    const dt = Math.min(0.05, (ts - last) / 1000); last = ts;
    pollPad(); step(dt); draw(); requestAnimationFrame(frame);
  }

  // ---- init ----
  ready = true; initFilters(); renderSpots(); renderJournalCount();
  $('spot-title').textContent = A.SPOT_NAMES[g.spot]; setMsg(idleMsg());
  draw();
  if (TEST) {
    window.__angler = {
      get state() { return g.state; }, get result() { return g.result; }, get reel() { return g.reel; },
      get bite() { return g.bite; }, get journal() { return journal; }, get spot() { return g.spot; },
      get reduced() { return reduced(); }, get bobY() { return g.bobY; },
      setHold(v) { setInput('test', !!v); },
      tap() { setInput('test', true); setInput('test', false); },
      advance(sec) { let n = Math.round(sec * 60); while (n-- > 0) step(1 / 60); draw(); },
      setDate, pickSpot, spotLocked, renderSpots, forceFish(id) { g.forced = id; },
      dismiss, redraw: draw, rng,
    };
  } else {
    requestAnimationFrame(frame);
  }
})();
