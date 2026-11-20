// Stalk Market page: DOM + canvas. All rules live in shared/mm-stalk-market.js. Play money only.
(function () {
  'use strict';
  var M = window.MMStalkMarket, S = window.MMStore;
  var KEY = 'pixeltown-stalk-v1';
  var qs = new URLSearchParams(location.search);
  var TEST = qs.get('test') === '1';
  var reduced = false;
  try { reduced = window.MMMotion ? window.MMMotion.reduced(window, window.localStorage) : false; } catch (e) { reduced = false; }

  // Back link: hub when launched from the hub, otherwise the town.
  if (qs.get('from') === 'hub') {
    var back = document.getElementById('back');
    back.setAttribute('href', '../../hub/index.html'); back.textContent = '← Hub';
  }

  // Time: real calendar by default. Test mode (?test=1) may pin week and slot.
  var testWeek = null, testSlot = null;
  if (TEST) {
    testWeek = M.clampWeek(qs.get('week'));
    var qsl = qs.get('slot');
    testSlot = qsl === null ? 0 : M.clampSlot(qsl);
  }
  function curWeek() { return testWeek !== null ? testWeek : M.weekNumber(new Date()); }
  function curSlot() { return testSlot !== null ? testSlot : M.slotOf(new Date()); }

  var save = M.cleanSave(S.get(KEY, null));
  var wk = null, spoiledNote = 0, msgText = '';
  function persist() { S.set(KEY, save); }

  function sync() {
    var w = curWeek();
    var r = M.syncWeek(save, w);
    if (r.rolled) { save = r.save; if (r.spoiled > 0) spoiledNote = r.spoiled; persist(); }
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
  function beep(n) { if (sfx) { try { sfx.play(n); } catch (e) { /* ignore */ } } }
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
  function say(t) { msgText = t; $('msg').textContent = t; }

  function drawIcon() {
    var c = $('icon').getContext('2d');
    c.clearRect(0, 0, 48, 48);
    c.fillStyle = '#5fb35f'; // leaves
    c.fillRect(20, 4, 4, 12); c.fillRect(13, 8, 4, 10); c.fillRect(27, 8, 4, 10);
    c.fillStyle = '#f4f1de'; // bulb
    c.beginPath(); c.arc(24, 28, 15, 0, Math.PI * 2); c.fill();
    c.fillStyle = '#b57edc'; // purple top
    c.beginPath(); c.arc(24, 28, 15, Math.PI * 1.1, Math.PI * 1.9); c.lineTo(24, 28); c.fill();
    c.fillStyle = '#8a6a4a'; c.fillRect(23, 42, 2, 5); // root
  }

  function drawChart() {
    var cv = $('chart'), c = cv.getContext('2d'), W = cv.width, H = cv.height;
    var slot = curSlot(), known = M.knownPrices(wk, slot);
    var L = 34, R = 10, T = 12, B = 26, pw = W - L - R, ph = H - T - B;
    c.clearRect(0, 0, W, H);
    var top = Math.max(wk.buyPrice * 1.5, Math.max.apply(null, known) * 1.1);
    top = Math.ceil(top / 50) * 50;
    function X(i) { return L + pw * i / (M.SLOTS - 1); }
    function Y(v) { return T + ph * (1 - v / top); }
    c.font = '11px monospace'; c.textBaseline = 'middle';
    c.strokeStyle = '#2f4a35'; c.fillStyle = '#9db3a0'; c.lineWidth = 1;
    for (var g = 0; g <= top; g += 50) {
      c.beginPath(); c.moveTo(L, Y(g) + 0.5); c.lineTo(W - R, Y(g) + 0.5); c.stroke();
      c.textAlign = 'right'; c.fillText(String(g), L - 4, Y(g));
    }
    // buy price baseline
    c.strokeStyle = '#ffd166'; c.setLineDash([4, 4]);
    c.beginPath(); c.moveTo(L, Y(wk.buyPrice)); c.lineTo(W - R, Y(wk.buyPrice)); c.stroke(); c.setLineDash([]);
    // day labels
    c.textAlign = 'center'; c.fillStyle = '#9db3a0';
    var days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    for (var d = 0; d < 7; d++) c.fillText(days[d], d === 0 ? X(0) : X(2 * d - 0.5), H - 12);
    // future slots as faint ticks
    c.fillStyle = '#3a5a41';
    for (var f = slot + 1; f < M.SLOTS; f++) c.fillRect(X(f) - 1, H - B - 4, 2, 4);
    // known prices
    c.strokeStyle = '#7fd18b'; c.lineWidth = 2;
    c.beginPath();
    known.forEach(function (v, i) { if (i === 0) c.moveTo(X(i), Y(v)); else c.lineTo(X(i), Y(v)); });
    c.stroke();
    known.forEach(function (v, i) {
      c.fillStyle = i === slot ? '#ffd166' : '#7fd18b';
      c.beginPath(); c.arc(X(i), Y(v), i === slot ? 5 : 3, 0, Math.PI * 2); c.fill();
    });
    c.lineWidth = 1;
  }

  function render() {
    var slot = curSlot(), price = M.priceAt(wk, slot), sunday = slot === 0;
    $('st-bells').textContent = fmt(save.balance);
    $('st-owned').textContent = fmt(save.holdings) + ' / ' + M.MAX_HOLD;
    var prof = M.weekProfit(save);
    $('st-profit').textContent = (prof > 0 ? '+' : '') + fmt(prof);
    $('when').textContent = M.slotLabel(slot) + ' (week ' + curWeek() + ')';
    $('price').textContent = fmt(price);
    $('price-note').textContent = sunday
      ? 'Buy price today. Stalks cannot be sold on Sunday.'
      : 'Sell price now. You paid ' + (save.holdings ? 'up to ' : '') + 'about ' + wk.buyPrice + ' on Sunday.';
    $('buy1').disabled = !sunday || M.maxBuy(save, wk) < 1;
    $('buy10').disabled = !sunday || M.maxBuy(save, wk) < 10;
    $('sell1').disabled = sunday || save.holdings < 1;
    $('sellall').disabled = sunday || save.holdings < 1;
    $('buy1').textContent = 'Buy 1';
    $('sellall').textContent = save.holdings > 0 && !sunday ? 'Sell all (' + save.holdings + ')' : 'Sell all';
    var known = M.knownPrices(wk, slot);
    $('chart-alt').textContent = 'Known prices: ' + known.join(', ') + '. Price history changes twice a day, Monday to Saturday.';
    drawChart();
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
  function doBuy(n) {
    sync();
    var r = M.buy(save, wk, curSlot(), n);
    if (!r.ok) { say(REASONS[r.reason] || 'Cannot do that.'); render(); return r; }
    save = r.save; persist(); beep('pickup');
    say('Bought ' + r.qty + ' for ' + fmt(r.cost) + ' bells.'); render(); return r;
  }
  function doSell(n) {
    sync();
    var r = M.sell(save, wk, curSlot(), n);
    if (!r.ok) { say(REASONS[r.reason] || 'Cannot do that.'); render(); return r; }
    save = r.save; persist(); beep('pickup');
    say('Sold ' + r.qty + ' for ' + fmt(r.gain) + ' bells.'); render(); return r;
  }
  $('buy1').addEventListener('click', function () { doBuy(1); });
  $('buy10').addEventListener('click', function () { doBuy(10); });
  $('sell1').addEventListener('click', function () { doSell(1); });
  $('sellall').addEventListener('click', function () { doSell(save.holdings); });
  $('hint-ok').addEventListener('click', function () { save.hint = true; persist(); render(); });
  $('btn-mute').addEventListener('click', function () { ensureSfx(); if (sfx) sfx.setMuted(!sfx.isMuted()); syncMute(); });
  if (!window.MMSfx) $('btn-mute').hidden = true;
  window.addEventListener('keydown', function (e) {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    var k = e.key.toLowerCase();
    if (k === 'b') { doBuy(e.shiftKey ? 10 : 1); e.preventDefault(); }
    else if (k === 's') { doSell(e.shiftKey ? save.holdings : 1); e.preventDefault(); }
  });

  // Real-time week/slot changes while the page stays open (no nagging, just keeps the numbers right).
  function tick() { var before = curSlot(); var rolled = sync(); if (rolled || before !== lastSlot) { lastSlot = before; if (rolled && spoiledNote) { say(spoiledNote + ' stalks spoiled over the weekend. A fresh week has started.'); spoiledNote = 0; } render(); } }
  var lastSlot = -1;
  sync();
  if (spoiledNote) { say(spoiledNote + ' stalks spoiled over the weekend. A fresh week has started.'); spoiledNote = 0; }
  persist();
  drawIcon(); syncMute(); lastSlot = curSlot(); render();
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
        if (spoiledNote) { say(spoiledNote + ' stalks spoiled over the weekend. A fresh week has started.'); spoiledNote = 0; }
        void before; persist(); render();
      },
      step: function (n) {
        n = n === undefined ? 1 : Math.trunc(Number(n)) || 0;
        var w = curWeek(), s = curSlot() + n;
        while (s >= M.SLOTS) { s -= M.SLOTS; w += 1; }
        while (s < 0) { s += M.SLOTS; w = Math.max(0, w - 1); }
        this.setTime(w, s);
      },
      buy: function (n) { return doBuy(n); },
      sell: function (n) { return doSell(n); }
    };
  }
}());
