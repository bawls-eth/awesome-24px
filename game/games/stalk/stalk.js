// Stalk Market page: DOM + canvas. All rules live in shared/mm-stalk-market.js. Play money only.
(function () {
  'use strict';
  var M = window.MMStalkMarket, S = window.MMStore;
  var KEY = 'pixeltown-stalk-v1';
  var qs = new URLSearchParams(location.search);
  var TEST = qs.get('test') === '1';
  var reduced = false;
  try { reduced = (window.MMMotion ? window.MMMotion.reduced(window, window.localStorage) : false) || !!(window.MMSideAccess && window.MMSideAccess.reduced()); } catch (e) { reduced = false; }

  // Back link: hub when launched from the hub, otherwise the town.
  if (qs.get('from') === 'hub') {
    var back = document.getElementById('back');
    back.setAttribute('href', '../../hub/index.html'); back.textContent = '← Hub';
  } else {
    var townLink = document.getElementById('town'); if (townLink) townLink.hidden = true; // the back link already goes to the town: don't show it twice
  }

  // Time: real calendar by default. Test mode (?test=1) may pin week and slot.
  var testWeek = null, testSlot = null;
  if (TEST) {
    testWeek = M.clampWeek(qs.get('week'));
    var qsl = qs.get('slot');
    testSlot = qsl === null ? 0 : M.clampSlot(qsl);
  }
  function curWeek() { return testWeek !== null ? testWeek : M.weekNumber(new Date()); }
  function realSlot() { return testSlot !== null ? testSlot : M.slotOf(new Date()); }
  // G-11 (b11-04 clock part): the furthest slot seen this week is kept (save.seen, additive). A device clock moved back inside the week
  // shows that furthest slot (no Sunday buy reopening, no future prices revealed) and pauses trading with a plain note.
  var slotBack = false;
  function curSlot() { var r = realSlot(); return slotBack && save.seen && save.seen.w === curWeek() && save.seen.s > r ? save.seen.s : r; }

  var save = M.cleanSave(S.get(KEY, null));
  var wk = null, spoiledNote = 0, msgText = '';
  // G-18 (b11-11): every week rollover replaces the last action message (it used to linger into the new week unless stalks spoiled)
  function weekNote() { return spoiledNote > 0 ? spoiledNote + ' stalks spoiled over the weekend. A fresh week has started.' : 'A fresh week has started. The stall buys on Sunday.'; }
  // Hub medal summary: its own additive key, read by the hub page only.
  function persist() { S.set(KEY, save); try { var m = ['bronze', 'silver', 'gold'].filter(function (k) { return save.medals && save.medals[k] === true; }); window.localStorage.setItem('pixeltown-medals-stalk-v1', JSON.stringify({ v: 1, m: m })); } catch (e) { /* storage blocked */ } try { window.MMHubProfile.sync(localStorage, 'stalk', [(save.invested > 0 || save.played >= 1) && 'trade'].concat(m)); } catch (e) { /* hub map progress is optional */ } }

  // Clock safety: if the device clock shows the week just BEFORE the saved one (a reset or a timezone hop), trading pauses
  // instead of treating it as a rollover (which would spoil real stalks). Far-off weeks roll over as usual.
  var clockBack = false, settings = null;
  function sync() {
    var w = curWeek(), rs = realSlot();
    slotBack = !!(save.seen && save.seen.w === w && save.seen.s > rs);
    clockBack = (save.week > w && save.week - w <= 1) || slotBack;
    if (!clockBack && (!save.seen || save.seen.w < w || (save.seen.w === w && save.seen.s < rs))) { save.seen = { w: w, s: rs }; persist(); }
    if (clockBack) { if (!wk || wk.seed !== String(w)) wk = M.generateWeek(w); return false; }
    var r = M.syncWeek(save, w);
    if (r.rolled) { save = r.save; spoiledNote = r.spoiled > 0 ? r.spoiled : -1; persist(); } // G-18 (b11-11): -1 = a quiet rollover, still announced
    if (!wk || wk.seed !== String(w)) wk = M.generateWeek(w);
    return r.rolled;
  }

  // ---------- sound ----------
  var sfx = null;
  function ensureSfx() {
    if (sfx || !window.MMSfx) return sfx;
    try { sfx = window.MMSfx.create({ storage: window.localStorage }); } catch (e) { sfx = null; }
    syncMute();
    return sfx;
  }
  var sounds = [];
  function beep(n) { sounds.push(n); if (sounds.length > 20) sounds.shift(); if (sfx) { try { sfx.play(n); } catch (e) { /* ignore */ } } }
  function mutedStored() { try { return localStorage.getItem('mm-sfx-muted') === '1'; } catch (e) { return false; } }
  function syncMute() {
    var b = document.getElementById('btn-mute'); if (!b) return;
    var m = sfx ? sfx.isMuted() : mutedStored();
    b.textContent = m ? 'Sound off' : 'Sound on'; b.setAttribute('aria-pressed', m ? 'true' : 'false');
  }
  ['pointerdown', 'keydown'].forEach(function (n) { window.addEventListener(n, function () { ensureSfx(); }, { passive: true }); });

  // ---------- DOM ----------
  function $(id) { return document.getElementById(id); }
  function fmt(n) { return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ','); }
  function pop(el) { if (reduced || !el) return; el.classList.remove('pop'); void el.offsetWidth; el.classList.add('pop'); }
  function signed(n) { return (n > 0 ? '+' : '') + fmt(n); }
  function say(t) { msgText = t; $('msg').textContent = t; }
  var CLOCK_MSG = 'Your clock shows an earlier week than your last visit, so trading is paused. Practice still works.';
  var SLOT_MSG = 'Your device clock moved back. The market keeps the latest time you saw, so trading is paused until then. Practice still works.'; // G-11
  function clockMsg() { return slotBack ? SLOT_MSG : CLOCK_MSG; }

  // 8-bit turnip: hand-placed 16x16 pixel sprite drawn at 3x (48 px canvas)
  var TURNIP = [
    '......g..g......',
    '...g..gg.g..g...',
    '...gg.GgGg.gg...',
    '....gGGgGGgg....',
    '......GgG.......',
    '.....kpppPk.....',
    '....kpppppPk....',
    '...kpPpppppPk...',
    '...kwwwppppwk...',
    '...kwWwwwwwwk...',
    '...kwWwwwwwsk...',
    '....kwwwwwsk....',
    '.....kwwssk.....',
    '......kssk......',
    '.......rr.......',
    '.......r........'];
  var TURNIP_MAP = { g: '#5fb35f', G: '#3d8a43', k: '#2a1f2e', p: '#b57edc', P: '#8a55b4', w: '#f4f1de', W: '#ffffff', s: '#cfc6a8', r: '#8a6a4a' };
  function drawIcon() {
    var c = $('icon').getContext('2d');
    c.imageSmoothingEnabled = false;
    c.clearRect(0, 0, 48, 48);
    TURNIP.forEach(function (row, y) { for (var x = 0; x < row.length; x++) { var col = TURNIP_MAP[row[x]]; if (col) { c.fillStyle = col; c.fillRect(x * 3, y * 3, 3, 3); } } });
  }
  function pxText(c, str, x, y, col, align) {
    if (window.MM8 && MM8.text) { MM8.text(c, str, Math.round(x), Math.round(y - 3), 1, col, { align: align || 'left', shadow: '#0d160f' }); return; }
    c.fillStyle = col; c.textAlign = align || 'left'; c.fillText(str, x, y);
  }

  function drawChart(prog) { drawChartOn($('chart'), wk, curSlot(), prog, null); }
  // Shared by the real week and the practice week. marks: slots where the player sold (drawn as rings).
  function drawChartOn(cv, wk, slot, prog, marks) {
    if (prog === undefined) prog = 1;
    var c = cv.getContext('2d'), W = cv.width, H = cv.height;
    var known = M.knownPrices(wk, slot);
    var L = 34, R = 10, T = 12, B = 26, pw = W - L - R, ph = H - T - B;
    c.clearRect(0, 0, W, H);
    var top = Math.max(wk.buyPrice * 1.5, Math.max.apply(null, known) * 1.1);
    top = Math.ceil(top / 50) * 50;
    function X(i) { return L + pw * i / (M.SLOTS - 1); }
    function Y(v) { return T + ph * (1 - v / top); }
    c.font = '12px monospace'; c.textBaseline = 'middle'; c.imageSmoothingEnabled = false;
    // 8-bit chart: dotted pixel grid, bitmap-font labels, stepped price columns and square markers (no anti-aliased lines)
    c.fillStyle = '#18241b'; c.fillRect(0, 0, W, H);
    for (var g = 0; g <= top; g += 50) {
      var gy = Math.round(Y(g));
      c.fillStyle = '#2f4a35'; for (var gx = L; gx < W - R; gx += 4) c.fillRect(gx, gy, 2, 1);
      pxText(c, String(g), L - 4, gy, '#9db3a0', 'right');
    }
    // buy price baseline (dashed, 2 px)
    var by = Math.round(Y(wk.buyPrice));
    c.fillStyle = '#ffd166'; for (var bx = L; bx < W - R; bx += 8) c.fillRect(bx, by - 1, 4, 2);
    // day labels
    var days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    for (var d = 0; d < 7; d++) pxText(c, days[d], d === 0 ? X(0) : X(2 * d - 0.5), H - 12, '#9db3a0', 'center');
    // future slots as faint ticks
    c.fillStyle = '#3a5a41';
    for (var f = slot + 1; f < M.SLOTS; f++) c.fillRect(Math.round(X(f)) - 1, H - B - 4, 2, 4);
    // the newest point glides in from the previous one (prog 0..1); reduce-motion draws it final
    function PX(i) { return i === slot && slot > 0 ? X(slot - 1) + (X(slot) - X(slot - 1)) * prog : X(i); }
    function PY(i) { return i === slot && slot > 0 ? Y(known[slot - 1]) + (Y(known[slot]) - Y(known[slot - 1])) * prog : Y(known[i]); }
    var base = H - B, cw = Math.max(4, Math.floor(pw / (M.SLOTS - 1) * 0.6 / 2) * 2);
    // price columns (stepped bars, 2 px quantised) under a stair-step line
    known.forEach(function (v, i) {
      var x0 = Math.round(PX(i) - cw / 2), y0 = Math.round(PY(i) / 2) * 2, up = v >= wk.buyPrice;
      c.fillStyle = up ? '#2f6b3c' : '#6b4a2f'; c.fillRect(x0, y0, cw, base - y0);
      c.fillStyle = up ? '#3f8a4e' : '#8a5f3a'; c.fillRect(x0, y0, 2, base - y0);
    });
    c.fillStyle = '#7fd18b';
    known.forEach(function (v, i) {
      if (!i) return;
      var xa = Math.round(PX(i - 1)), ya = Math.round(PY(i - 1) / 2) * 2, xb = Math.round(PX(i)), yb = Math.round(PY(i) / 2) * 2, xm = Math.round((xa + xb) / 2);
      c.fillRect(xa, ya - 1, xm - xa + 2, 2); c.fillRect(xm, Math.min(ya, yb) - 1, 2, Math.abs(yb - ya) + 2); c.fillRect(xm, yb - 1, xb - xm, 2);
    });
    known.forEach(function (v, i) {
      var r = i === slot ? 5 : 3, xx = Math.round(PX(i)), yy = Math.round(PY(i) / 2) * 2;
      c.fillStyle = '#0d160f'; c.fillRect(xx - r - 1, yy - r - 1, r * 2 + 2, r * 2 + 2);
      c.fillStyle = i === slot ? '#ffd166' : '#7fd18b'; c.fillRect(xx - r, yy - r, r * 2, r * 2);
      c.fillStyle = 'rgba(255,255,255,.5)'; c.fillRect(xx - r, yy - r, r, 2);
    });
    if (marks) { c.fillStyle = '#f4a261'; marks.forEach(function (i) { if (i <= slot) { var mx = Math.round(X(i)), my = Math.round(Y(known[i])); c.fillRect(mx - 8, my - 8, 16, 2); c.fillRect(mx - 8, my + 6, 16, 2); c.fillRect(mx - 8, my - 8, 2, 16); c.fillRect(mx + 6, my - 8, 2, 16); } }); }
    c.lineWidth = 1;
  }

  var anim = { running: false, count: 0 };
  function animateChart() {
    if (reduced || curSlot() === 0 || typeof requestAnimationFrame !== 'function') { drawChart(1); return; }
    anim.count++; anim.running = true;
    var t0 = null, id = anim.count;
    function frame(t) {
      if (id !== anim.count) return;
      if (t0 === null) t0 = t;
      var p = Math.min(1, (t - t0) / 450);
      drawChart(1 - Math.pow(1 - p, 3));
      if (p < 1) requestAnimationFrame(frame); else anim.running = false;
    }
    drawChart(0); requestAnimationFrame(frame);
  }
  function renderAdvisor() {
    var a = M.advise(M.knownPrices(wk, curSlot()));
    $('advisor-text').textContent = a.text;
    var ul = $('advisor-bars'); ul.textContent = '';
    if (a.ready) M.PATTERNS.forEach(function (p) {
      var li = document.createElement('li'); li.textContent = M.PATTERN_NAMES[p] + ': ' + Math.round(a.probs[p] * 100) + '%';
      var bar = document.createElement('span'); bar.className = 'bar'; bar.style.width = Math.round(a.probs[p] * 100) + '%'; li.appendChild(bar);
      ul.appendChild(li);
    });
    return a;
  }

  // Market notes (MG4): plain words about prices that already happened. Display only: reads the week, changes nothing.
  var notesKey = '';
  function renderNotes() {
    var slot = curSlot(), k = wk.seed + '|' + slot;
    if (k === notesKey) return;
    notesKey = k;
    var ul = $('notes-list'); ul.textContent = '';
    M.marketNotes(wk, slot).forEach(function (t) { var li = document.createElement('li'); li.textContent = t; ul.appendChild(li); });
    var lw = M.lastWeekNote(curWeek());
    $('notes-last').textContent = lw || 'This is the very first market week, so there is no last week to describe.';
  }
  function renderNeighbours() {
    var slot = curSlot(), ul = $('nb-list'); ul.textContent = '';
    $('nb-fee').textContent = String(M.NEIGHBOUR_FEE);
    M.neighbourOffers(curWeek(), slot).forEach(function (o) {
      var li = document.createElement('li'); li.setAttribute('data-nb', o.id); li.className = o.best ? 'best' : '';
      var t = document.createElement('strong'); t.textContent = o.name;
      var d = document.createElement('span'); d.className = 'tag';
      d.textContent = slot === 0 ? 'Not buying on Sunday' : o.price + ' bells each' + (o.best ? ' (best price today)' : '');
      var b = document.createElement('button'); b.type = 'button'; b.className = 'nb-sell';
      b.textContent = 'Sell all here';
      b.disabled = slot === 0 || save.holdings < 1 || save.holdings * o.price <= M.NEIGHBOUR_FEE;
      b.addEventListener('click', function () { doSellNb(o.id); });
      li.appendChild(t); li.appendChild(d); li.appendChild(b); ul.appendChild(li);
    });
  }
  var MEDAL_NAMES = { none: 'no medal', bronze: 'bronze', silver: 'silver', gold: 'gold' };
  function renderGoals() {
    var ul = $('goals'); ul.textContent = '';
    M.goalStatus(save, wk).forEach(function (g) {
      var li = document.createElement('li'); li.className = g.done ? 'done' : ''; li.setAttribute('data-goal', g.id);
      var t = document.createElement('strong'); t.textContent = g.title;
      var d = document.createElement('span'); d.className = 'tag'; d.textContent = (g.done ? 'Done. ' : 'Open. ') + g.desc;
      li.appendChild(t); li.appendChild(d); ul.appendChild(li);
    });
    var mu = $('medals'); mu.textContent = '';
    var hist = save.history.slice().reverse();
    hist.forEach(function (h) {
      var m = M.medalFor(h.profit);
      var li = document.createElement('li'); li.className = m === 'none' ? '' : 'done'; li.setAttribute('data-medal', m);
      var dot = document.createElement('span'); dot.className = 'medal ' + m; dot.setAttribute('aria-hidden', 'true');
      var t = document.createElement('strong'); t.textContent = 'Week ' + h.week;
      var d = document.createElement('span'); d.className = 'tag'; d.textContent = MEDAL_NAMES[m] + ', ' + (h.profit > 0 ? '+' : '') + fmt(h.profit) + ' bells';
      li.appendChild(dot); li.appendChild(t); li.appendChild(d); mu.appendChild(li);
    });
    $('medals-empty').hidden = hist.length > 0;
    var L = M.lifetime(save);
    $('at-best').textContent = fmt(L.best) + ' bells'; $('at-total').textContent = (L.total > 0 ? '+' : '') + fmt(L.total) + ' bells'; $('at-played').textContent = fmt(L.played);
  }

  function render() {
    var slot = curSlot(), price = M.priceAt(wk, slot), sunday = slot === 0;
    $('st-bells').textContent = fmt(save.balance);
    $('st-owned').textContent = fmt(save.holdings) + ' / ' + M.MAX_HOLD;
    var prof = M.weekProfit(save);
    $('st-profit').textContent = (prof > 0 ? '+' : '') + fmt(prof);
    $('when').textContent = M.slotLabel(slot) + ', ' + M.weekLabel(curWeek());
    $('price').textContent = fmt(price);
    $('price-note').textContent = sunday
      ? 'Buy price today. Stalks cannot be sold on Sunday.'
      : (save.invested > 0 // b11-r3-08: only claim a Sunday buy when stalks were really bought this week
        ? 'Sell price now. You paid ' + (save.holdings ? 'up to ' : '') + 'about ' + wk.buyPrice + ' on Sunday.' + (save.holdings ? ' Sell all now: ' + signed(save.earned + save.holdings * price - save.invested) + ' bells for the week.' : '')
        : 'Sell price now. You have no stalks this week (Sunday was the buy day).');
    $('buy1').disabled = clockBack || !sunday || M.maxBuy(save, wk) < 1;
    $('buy10').disabled = clockBack || !sunday || M.maxBuy(save, wk) < 10;
    $('sell1').disabled = clockBack || sunday || save.holdings < 1;
    $('sellall').disabled = clockBack || sunday || save.holdings < 1;
    $('market-reason').textContent = clockBack ? clockMsg() : sunday
      ? (M.maxBuy(save, wk) < 1 && save.holdings < M.MAX_HOLD ? 'Not enough bells for a stalk today. A practice week has its own bells, and a fresh week tops you up.' : 'Selling closed: the market only buys stalks Monday to Saturday. Buying is open today.')
      : 'Buying closed: stalks can only be bought on Sunday. Selling is open now.';
    $('buy1').textContent = 'Buy 1';
    $('go-practice').hidden = sunday || save.holdings > 0 || clockBack; // dead-end fix: a weekday with nothing to sell offers the quick practice week
    $('sellall').textContent = save.holdings > 0 && !sunday ? 'Sell all (' + save.holdings + ')' : 'Sell all';
    var known = M.knownPrices(wk, slot);
    $('chart-alt').textContent = 'Known prices: ' + known.join(', ') + '. Price history changes twice a day, Monday to Saturday.';
    if (!anim.running) drawChart();
    renderAdvisor(); renderNotes(); renderGoals(); renderNeighbours();
    // last week reveal
    $('last-card').hidden = !save.last;
    if (save.last) {
      $('last-line').textContent = 'Week ' + save.last.week + ' was a "' + M.PATTERN_NAMES[save.last.pattern] + '" week. Profit: ' + fmt(save.last.profit) + ' bells.';
      $('last-hint').textContent = M.PATTERN_HINTS[save.last.pattern];
    }
    $('rank-line').textContent = 'Rank: ' + M.rankFor(save.best) + ' (best week: ' + fmt(save.best) + ' bells)';
    var med = M.MEDALS.map(function (m) { return (save.medals[m[0]] ? '✓ ' : '• ') + m[0] + ' (' + fmt(m[1]) + ')'; }).join('   ');
    $('medal-line').textContent = 'Weekly profit medals: ' + med;
    var ul = $('history'); ul.textContent = '';
    save.history.slice(-5).reverse().forEach(function (h) {
      var li = document.createElement('li');
      li.textContent = 'Week ' + h.week + ': ' + M.PATTERN_NAMES[h.pattern] + ', ' + (h.profit > 0 ? '+' : '') + fmt(h.profit);
      ul.appendChild(li);
    });
    $('msg').textContent = msgText;
    $('hint').hidden = save.hint;
  }

  // ---------- actions ----------
  var REASONS = {
    'sunday-only': 'Stalks can only be bought on Sunday.', 'no-sunday-sales': 'Stalks cannot be sold on Sunday.',
    funds: 'Not enough bells for that.', limit: 'Your stall holds at most ' + M.MAX_HOLD + ' stalks.',
    holdings: 'You do not own that many.', quantity: 'Pick at least one.'
  };
  function paused() { if (!clockBack) return false; beep('error'); say(clockMsg()); render(); return true; }
  function doBuy(n) {
    sync();
    if (paused()) return { ok: false, reason: 'clock', save: save };
    var r = M.buy(save, wk, curSlot(), n);
    if (!r.ok) { beep('error'); say(REASONS[r.reason] || 'Cannot do that.'); render(); return r; }
    save = M.latchGoals(r.save, wk); persist(); beep('pickup'); // buy cue
    say('Bought ' + r.qty + ' for ' + fmt(r.cost) + ' bells.'); render(); return r;
  }
  function doSell(n) {
    sync();
    if (paused()) return { ok: false, reason: 'clock', save: save };
    var r = M.sell(save, wk, curSlot(), n);
    if (!r.ok) { beep('error'); say(save.holdings < 1 && curSlot() > 0 ? 'You have no stalks to sell.' : (REASONS[r.reason] || 'Cannot do that.')); render(); return r; }
    var before = M.goalsDone(save, wk);
    save = M.latchGoals(r.save, wk); persist(); beep('levelup'); // sell cue
    var vs = r.gain - r.qty * wk.buyPrice;
    say('Sold ' + r.qty + ' for ' + fmt(r.gain) + ' bells (' + signed(vs) + ' against the Sunday price).' + (save.goals !== before ? ' A weekly goal is done!' : '')); render(); pop($('st-profit')); return r;
  }
  function doSellNb(id, n) {
    sync();
    if (paused()) return { ok: false, reason: 'clock', save: save };
    var qty = n === undefined ? save.holdings : n;
    var r = M.sellToNeighbour(save, id, curWeek(), curSlot(), qty);
    if (!r.ok) { beep('error'); say(r.reason === 'fee' ? 'That deal would not cover the fee.' : (REASONS[r.reason] || 'Cannot do that.')); render(); return r; }
    var before = M.goalsDone(save, wk);
    save = M.latchGoals(r.save, wk); persist(); beep('levelup');
    say('Sold ' + r.qty + ' to a neighbour at ' + r.price + ' each, fee ' + r.fee + ': +' + fmt(r.gain) + ' bells.' + (save.goals !== before ? ' A weekly goal is done!' : '')); render(); return r;
  }
  $('buy1').addEventListener('click', function () { doBuy(1); });
  $('buy10').addEventListener('click', function () { doBuy(10); });
  $('sell1').addEventListener('click', function () { doSell(1); });
  $('sellall').addEventListener('click', function () { doSell(save.holdings); });
  $('hint-ok').addEventListener('click', function () { save.hint = true; persist(); render(); });
  $('btn-mute').addEventListener('click', function () { ensureSfx(); if (sfx) sfx.setMuted(!sfx.isMuted()); syncMute(); });
  if (!window.MMSfx) $('btn-mute').hidden = true;
  if (window.MMSettings && MMSettings.mount) {
    try {
      settings = MMSettings.mount({ page: 'stalk' });
      if (settings) { var sb = $('btn-settings'); sb.hidden = false; sb.addEventListener('click', function () { settings.open(); }); window.addEventListener('mm-settings-change', function () { syncMute(); try { reduced = (window.MMMotion ? window.MMMotion.reduced(window, window.localStorage) : false) || !!(window.MMSideAccess && window.MMSideAccess.reduced()); } catch (e) { /* keep */ } }); }
    } catch (e) { settings = null; }
  }
  function dialogOpen() { return !!(settings && settings.isOpen && settings.isOpen()) || !!document.querySelector('dialog[open], [role="dialog"]:not([hidden])'); }
  window.addEventListener('keydown', function (e) {
    if (e.ctrlKey || e.metaKey || e.altKey || !e.key) return;
    var tg = e.target, typing = window.MMInput ? MMInput.isTyping(tg) : !!(tg && /^(INPUT|TEXTAREA|SELECT)$/.test(tg.tagName));
    if (typing || dialogOpen()) return; // never steal keys from a text box or an open dialog
    var k = e.key.toLowerCase();
    if (k === 'b') { doBuy(e.shiftKey ? 10 : 1); e.preventDefault(); return; }
    if (k === 's') { doSell(e.shiftKey ? save.holdings : 1); e.preventDefault(); return; }
    // Universal controls (CONTROLS.md) drive the practice week: Space/Enter = primary (buy on Sunday, else next half-day), E = sell all, R = play again.
    var onBtn = tg && /^(BUTTON|A|SUMMARY)$/.test(tg.tagName);
    var a = window.MMInput ? MMInput.actionOf(e) : null;
    if (!pr || !a || e.repeat) return;
    if (a === 'primary' && !onBtn && !pr.done) { if (pr.slot === 0) { if (!prBuy()) prNext(); } else prNext(); e.preventDefault(); }
    else if (a === 'secondary' && k === 'e' && !pr.done) { prSell(); e.preventDefault(); }
    else if (a === 'restart' && pr.done && !onBtn) { prStart(); e.preventDefault(); }
  });


  // ---------- practice week (quick play) ----------
  // A seeded pretend week ('practice|N', N counts up per round: no Math.random). Own bells, own key
  // (pixeltown-stalk-practice-v1: {v, n, best, rounds}); never touches the real save, medals or hub profile.
  var PKEY = 'pixeltown-stalk-practice-v1', PSTART = 1000;
  // VAR1 market moods (practice week ONLY; the real week, save, medals and stats never see them). Each mood is a set of
  // honest pattern odds shown in full on screen. A mood is picked from the practice round number (seeded, equal 1 in 4 odds);
  // the week is then the first seeded week 'practice|N|k' whose pattern matches a seeded pick from those odds.
  // ?mods=0 turns moods off (plain practice weeks). Test pages (?test=1) keep them off unless ?mods=1.
  var MOODS = {
    usual: { name: 'Usual Week', line: 'Normal odds, same as the real market.', w: { decreasing: 0.25, random: 0.30, largeSpike: 0.25, smallSpike: 0.20 } },
    festival: { name: 'Festival Week', line: 'Visitors in town: spikes are more likely.', w: { decreasing: 0.10, random: 0.25, largeSpike: 0.40, smallSpike: 0.25 } },
    quiet: { name: 'Quiet Week', line: 'Few buyers: prices tend to drift down.', w: { decreasing: 0.45, random: 0.35, largeSpike: 0.10, smallSpike: 0.10 } },
    jumpy: { name: 'Jumpy Week', line: 'Rumours everywhere: prices bounce up and down more often.', w: { decreasing: 0.15, random: 0.55, largeSpike: 0.15, smallSpike: 0.15 } }
  };
  var MOOD_IDS = ['usual', 'festival', 'quiet', 'jumpy'];
  var MOODS_ON = qs.get('mods') !== '0' && (!TEST || qs.get('mods') === '1');
  function hash01(str) { var h = 2166136261 >>> 0; for (var i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; } h ^= h >>> 13; h = Math.imul(h, 0x5bd1e995) >>> 0; h ^= h >>> 15; return (h >>> 0) / 4294967296; }
  function moodFor(n) { return MOODS_ON ? MOOD_IDS[Math.floor(hash01('mood|' + n) * MOOD_IDS.length) % MOOD_IDS.length] : null; }
  function pickPattern(mood, n) {
    var r = hash01('moodpat|' + n), acc = 0, w = MOODS[mood].w;
    for (var i = 0; i < M.PATTERNS.length; i++) { acc += w[M.PATTERNS[i]]; if (r < acc) return M.PATTERNS[i]; }
    return M.PATTERNS[M.PATTERNS.length - 1];
  }
  function practiceWeek(n, mood) {
    if (!mood) return M.generateWeek('practice|' + n);
    var want = pickPattern(mood, n);
    for (var k = 0; k < 400; k++) { var w = M.generateWeek('practice|' + n + '|' + k); if (w.pattern === want) return w; }
    return M.generateWeek('practice|' + n);
  }
  function oddsLine(mood) { return M.PATTERNS.map(function (p) { return M.PATTERN_NAMES[p] + ' ' + Math.round(MOODS[mood].w[p] * 100) + '%'; }).join(', '); }
  // The advisor estimate uses the usual odds as its starting point; in a mood week, re-weight it by the mood odds (Bayes), honestly.
  function moodProbs(probs, mood) {
    if (!mood) return probs;
    var base = MOODS.usual.w, w = MOODS[mood].w, out = {}, tot = 0;
    M.PATTERNS.forEach(function (p) { out[p] = probs[p] * w[p] / base[p]; tot += out[p]; });
    M.PATTERNS.forEach(function (p) { out[p] = tot > 0 ? out[p] / tot : w[p]; });
    return out;
  }
  function cleanPr(raw) {
    var o = raw && typeof raw === 'object' ? raw : {};
    function n(v, lo, hi) { v = Math.trunc(Number(v)); return isFinite(v) ? Math.max(lo, Math.min(hi, v)) : 0; }
    var best = Math.trunc(Number(o.best));
    var out = { v: 1, n: n(o.n, 0, 999999), best: isFinite(best) ? Math.max(-PSTART, Math.min(99999999, best)) : 0, rounds: n(o.rounds, 0, 999999), hasBest: o.hasBest === true };
    // VAR1 (additive): best practice profit per market mood, {moodId: bells}. Only known moods survive.
    out.moodBest = {};
    if (o.moodBest && typeof o.moodBest === 'object' && !Array.isArray(o.moodBest)) MOOD_IDS.forEach(function (m) {
      if (!Object.prototype.hasOwnProperty.call(o.moodBest, m)) return; var v = Math.trunc(Number(o.moodBest[m])); if (isFinite(v)) out.moodBest[m] = Math.max(-PSTART, Math.min(99999999, v));
    });
    return out;
  }
  var prSave = cleanPr(S.get(PKEY, null));
  var pr = null;
  // Merge-on-write (bugbash/saves.md S2/S7): weeks / rounds = stored + this tab's own, bests never lowered by a stale second tab,
  // unknown fields kept. best can be negative and only counts with hasBest, so it keeps its own rule here.
  var prBase = JSON.parse(JSON.stringify(prSave));
  function prPersist() {
    var M = window.MMSaveMerge;
    if (!M) { S.set(PKEY, prSave); return; }
    var raw = S.get(PKEY, null), st = cleanPr(raw);
    var m = M.merge(raw, prBase, prSave, M.SPECS[PKEY]);
    m.hasBest = st.hasBest || prSave.hasBest;
    m.best = st.hasBest && prSave.hasBest ? Math.max(st.best, prSave.best) : st.hasBest ? st.best : prSave.best;
    var mb = {};
    MOOD_IDS.forEach(function (k) {
      var a = Object.prototype.hasOwnProperty.call(st.moodBest, k), b = Object.prototype.hasOwnProperty.call(prSave.moodBest, k);
      if (a || b) mb[k] = a && b ? Math.max(st.moodBest[k], prSave.moodBest[k]) : a ? st.moodBest[k] : prSave.moodBest[k];
    });
    var c = cleanPr(Object.assign({}, m, { moodBest: mb }));
    S.set(PKEY, Object.assign(m, c, { moodBest: Object.assign({}, m.moodBest && typeof m.moodBest === 'object' && !Array.isArray(m.moodBest) ? m.moodBest : {}, c.moodBest) }));
    prSave = c; prBase = JSON.parse(JSON.stringify(prSave));
  }
  function prStart() {
    prSave.n += 1; prPersist();
    var mood = moodFor(prSave.n);
    pr = { n: prSave.n, mood: mood, wk: practiceWeek(prSave.n, mood), slot: 0, bells: PSTART, hold: 0, invested: 0, earned: 0, marks: [], done: false };
    $('pr-start').hidden = true; $('pr-end').hidden = true; $('pr-play').hidden = false; $('pr-actions').hidden = false; $('pr-odds').hidden = false;
    $('pr-msg').textContent = 'Sunday: buy stalks, then step through the week.';
    var pm = $('pr-mood'); pm.hidden = !mood; pm.textContent = '';
    if (mood) {
      var t = document.createElement('strong'); t.textContent = 'Market mood: ' + MOODS[mood].name; pm.appendChild(t);
      pm.appendChild(document.createTextNode(' - ' + MOODS[mood].line + ' Pattern odds this week: ' + oddsLine(mood) + '. Practice only.'));
      pm.dataset.mood = mood;
    }
    prRender(); try { $('pr-buy').focus({ preventScroll: true }); } catch (e) { /* ignore */ }
  }
  function prPrice() { return M.priceAt(pr.wk, pr.slot); }
  function prNow() { return pr.earned + pr.hold * (pr.slot === 0 ? 0 : prPrice()) - pr.invested; }
  var prPop = pop;
  function prBuy() {
    if (!pr || pr.done || pr.slot !== 0) return false;
    var q = Math.max(0, Math.min(M.MAX_HOLD - pr.hold, Math.floor(pr.bells / pr.wk.buyPrice)));
    if (q < 1) { $('pr-msg').textContent = 'Not enough practice bells for another stalk.'; return false; }
    pr.hold += q; pr.bells -= q * pr.wk.buyPrice; pr.invested += q * pr.wk.buyPrice;
    beep('pickup'); $('pr-msg').textContent = 'Bought ' + q + ' at ' + pr.wk.buyPrice + ' each. Now step to Monday.'; prRender(); return true;
  }
  function prSell() {
    if (!pr || pr.done || pr.slot === 0 || pr.hold < 1) return false;
    var price = prPrice(), q = pr.hold, gain = q * price, diff = (price - pr.wk.buyPrice) * q;
    pr.bells += gain; pr.earned += gain; pr.hold = 0; pr.marks.push(pr.slot);
    beep(diff > 0 ? 'levelup' : 'ui_tap');
    $('pr-msg').textContent = 'Sold ' + q + ' at ' + price + ': ' + signed(diff) + ' bells against the Sunday price.';
    prPop($('pr-price')); prRender(); return true;
  }
  function prNext() {
    if (!pr || pr.done) return false;
    if (pr.slot >= M.SLOTS - 1) { prEnd(); return true; }
    var before = pr.slot === 0 ? pr.wk.buyPrice : prPrice();
    pr.slot += 1;
    var p = prPrice(), d = p - before;
    $('pr-msg').textContent = M.slotLabel(pr.slot) + ': ' + p + ' (' + (d >= 0 ? 'up ' : 'down ') + Math.abs(d) + ').' + (pr.slot === M.SLOTS - 1 && pr.hold ? ' Last chance to sell!' : '');
    if (d > 0 && pr.hold) prPop($('pr-price'));
    prRender(); return true;
  }
  function prEnd() {
    pr.done = true;
    var spoiled = pr.hold, profit = pr.earned - pr.invested;
    var sells = pr.wk.sell, peak = Math.max.apply(null, sells), peakSlot = sells.indexOf(peak) + 1;
    var hadBest = prSave.hasBest, isBest = hadBest ? profit > prSave.best : profit >= 0; // G-18 (b11-05): a first-week loss is never stored as the practice best
    if (isBest) { prSave.best = profit; prSave.hasBest = true; }
    var moodHad = pr.mood && Object.prototype.hasOwnProperty.call(prSave.moodBest, pr.mood), moodNew = pr.mood && (moodHad ? profit > prSave.moodBest[pr.mood] : profit >= 0); // G-18 (b11-05): like the practice best, a loss is never a mood best
    if (moodNew) prSave.moodBest[pr.mood] = profit;
    prSave.rounds += 1; prPersist();
    beep(profit > 0 ? 'claim' : 'ui_tap');
    $('pr-actions').hidden = true; $('pr-odds').hidden = true; $('pr-end').hidden = false;
    var title = (profit > 0 ? 'Profit ' : profit < 0 ? 'Loss ' : 'Even ') + signed(profit) + ' bells' + (isBest && hadBest ? ' - new practice best!' : '');
    $('pr-when').textContent = 'Week over'; $('pr-pl').textContent = ''; $('pr-stat').textContent = 'Final practice bells ' + fmt(pr.bells) + '. Rings on the chart mark where you sold.';
    var ul = $('pr-end-list'); ul.textContent = '';
    [
      'This was a "' + M.PATTERN_NAMES[pr.wk.pattern] + '" week. ' + M.PATTERN_HINTS[pr.wk.pattern],
      'Sunday price ' + pr.wk.buyPrice + '; the peak was ' + peak + ' on ' + M.slotLabel(peakSlot) + '.',
      pr.invested ? (pr.marks.length ? 'You sold on ' + pr.marks.map(function (i) { return M.slotLabel(i); }).join(', ') + '.' : 'You never sold.') : 'You did not buy any stalks this time.',
      spoiled ? spoiled + ' stalks spoiled at the end of the week.' : 'Nothing spoiled.',
      (prSave.hasBest ? 'Practice best: ' + signed(prSave.best) + ' bells' : 'No practice best yet (a loss never counts)') + ' over ' + prSave.rounds + ' practice week(s).'
    ].concat(pr.mood ? ['Market mood was ' + MOODS[pr.mood].name + ' (' + oddsLine(pr.mood) + '). ' + MOODS[pr.mood].name + ' best: ' + (Object.prototype.hasOwnProperty.call(prSave.moodBest, pr.mood) ? signed(prSave.moodBest[pr.mood]) + ' bells' + (moodNew && moodHad ? ' (new!)' : '') : 'none yet (a loss is not a best)') + '.'] : []).forEach(function (t) { var li = document.createElement('li'); li.textContent = t; ul.appendChild(li); });
    drawChartOn($('pr-chart'), pr.wk, M.SLOTS - 1, 1, pr.marks);
    prBestLine();
    // Shared result card (MMMiniKit): headline, stat rows, the lines above, and one Play again button.
    var vm = { title: 'Practice week', headline: [{ text: title, id: 'pr-end-title' }], ids: { again: 'pr-again', head: 'pr-end-head', goal: 'pr-end-goal' },
      stats: [{ label: 'Profit', value: signed(profit) }, { label: 'Final bells', value: fmt(pr.bells) }, { label: 'Practice best', value: prSave.hasBest ? signed(prSave.best) : '-', best: isBest && hadBest }],
      goalText: 'Practice weeks never touch your real stall, medals or stats.', replay: false };
    var card = null;
    if (window.MMMiniKit && MMMiniKit.panel) { try { card = MMMiniKit.panel($('pr-card'), MMMiniKit.result(vm), { again: prStart, extra: [ul] }); } catch (e) { card = null; } }
    if (!card) { // fallback without the kit: plain title + list + button
      var pc = $('pr-card'); pc.textContent = '';
      var h = document.createElement('h3'); h.id = 'pr-end-title'; h.textContent = title; pc.appendChild(h); pc.appendChild(ul);
      var ab = document.createElement('button'); ab.type = 'button'; ab.id = 'pr-again'; ab.className = 'big buy'; ab.textContent = 'Play again'; ab.addEventListener('click', prStart); pc.appendChild(ab);
    }
    try { $('pr-again').focus({ preventScroll: true }); } catch (e) { /* ignore */ }
  }
  function prBestLine() { $('pr-best').textContent = prSave.hasBest ? 'Practice best: ' + signed(prSave.best) + ' bells (' + prSave.rounds + ' played).' : 'No practice weeks played yet.'; }
  function prRender() {
    var sun = pr.slot === 0, price = sun ? pr.wk.buyPrice : prPrice();
    $('pr-when').textContent = M.slotLabel(pr.slot) + (sun ? ' buy price' : ' sell price');
    $('pr-price').textContent = String(price);
    var now = prNow();
    $('pr-pl').textContent = pr.hold && !sun ? 'Sell all now: ' + signed(now) : pr.invested ? 'Week so far: ' + signed(pr.earned - pr.invested) : '';
    $('pr-pl').className = now > 0 ? 'up' : now < 0 ? 'down' : '';
    $('pr-stat').textContent = 'Practice bells ' + fmt(pr.bells) + ' - stalks ' + pr.hold + ' - paid ' + pr.wk.buyPrice + ' each';
    var a = M.advise(M.knownPrices(pr.wk, pr.slot)), ap = moodProbs(a.probs, pr.mood);
    $('pr-odds').textContent = a.ready ? 'Honest odds from the prices so far' + (pr.mood ? ' and the ' + MOODS[pr.mood].name + ' mood' : '') + ': ' + M.PATTERNS.map(function (p) { return M.PATTERN_NAMES[p] + ' ' + Math.round(ap[p] * 100) + '%'; }).join(', ') + '.' : 'Odds appear after Monday\'s two prices.';
    $('pr-buy').disabled = !sun || Math.floor(pr.bells / pr.wk.buyPrice) < 1 || pr.hold >= M.MAX_HOLD;
    $('pr-sell').disabled = sun || pr.hold < 1;
    $('pr-sell').textContent = pr.hold && !sun ? 'Sell all (' + pr.hold + ')' : 'Sell all';
    $('pr-next').textContent = pr.slot >= M.SLOTS - 1 ? 'End week' : 'Next half-day';
    drawChartOn($('pr-chart'), pr.wk, pr.slot, 1, pr.marks);
  }
  $('pr-start').addEventListener('click', prStart);
  $('entry-practice').addEventListener('click', function () { if (!pr || pr.done) prStart(); try { $('practice').scrollIntoView({ behavior: reduced ? 'auto' : 'smooth', block: 'start' }); } catch (e) { /* ignore */ } });
  $('go-practice').addEventListener('click', function () { if (!pr || pr.done) prStart(); try { $('practice').scrollIntoView({ behavior: reduced ? 'auto' : 'smooth', block: 'start' }); } catch (e) { /* ignore */ } });
  $('pr-buy').addEventListener('click', prBuy);
  $('pr-sell').addEventListener('click', prSell);
  $('pr-next').addEventListener('click', prNext);
  prBestLine();

  // Real-time week/slot changes while the page stays open (no nagging, just keeps the numbers right).
  function tick() { var before = curSlot(); var rolled = sync(); if (rolled || before !== lastSlot) { lastSlot = before; animateChartSoon = true; if (rolled && spoiledNote) { say(weekNote()); spoiledNote = 0; } render(); if (animateChartSoon) { animateChartSoon = false; animateChart(); } } }
  var lastSlot = -1, animateChartSoon = false;
  sync();
  if (spoiledNote) { say(weekNote()); spoiledNote = 0; }
  persist();
  drawIcon(); syncMute(); lastSlot = curSlot(); render(); animateChart();
  if (testWeek === null && testSlot === null) setInterval(tick, 20000);
  document.addEventListener('visibilitychange', function () { if (!document.hidden && testSlot === null) tick(); });

  if (TEST) {
    // Test-only time control. Not available without ?test=1.
    window.__stalk = {
      get save() { return save; }, get wk() { return wk; }, get reduced() { return reduced; },
      get week() { return curWeek(); }, get slot() { return curSlot(); },
      setTime: function (week, slot) {
        if (week !== undefined && week !== null) testWeek = M.clampWeek(week);
        if (slot !== undefined && slot !== null) testSlot = M.clampSlot(slot);
        else if (testSlot === null) testSlot = 0;
        if (testWeek === null) testWeek = M.weekNumber(new Date());
        var before = save.week; sync();
        if (spoiledNote) { say(weekNote()); spoiledNote = 0; }
        void before; persist(); render(); animateChart();
      },
      step: function (n) {
        n = n === undefined ? 1 : Math.trunc(Number(n)) || 0;
        var w = curWeek(), s = curSlot() + n;
        while (s >= M.SLOTS) { s -= M.SLOTS; w += 1; }
        while (s < 0) { s += M.SLOTS; w = Math.max(0, w - 1); }
        this.setTime(w, s);
      },
      get notes() { return M.marketNotes(wk, curSlot()); },
      get anim() { return anim; }, get advice() { return M.advise(M.knownPrices(wk, curSlot())); },
      get sounds() { return sounds; },
      buy: function (n) { return doBuy(n); },
      sellNeighbour: function (id, n) { return doSellNb(id, n); },
      sell: function (n) { return doSell(n); },
      moods: { get on() { return MOODS_ON; }, list: MOOD_IDS, info: MOODS, moodFor: moodFor, practiceWeek: practiceWeek, probs: moodProbs },
      practice: { start: prStart, buy: prBuy, sell: prSell, next: prNext, get state() { return pr; }, get saved() { return prSave; } }
    };
  }
}());
