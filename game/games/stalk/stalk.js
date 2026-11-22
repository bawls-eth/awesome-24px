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
  function curSlot() { return testSlot !== null ? testSlot : M.slotOf(new Date()); }

  var save = M.cleanSave(S.get(KEY, null));
  var wk = null, spoiledNote = 0, msgText = '';
  // Hub medal summary: its own additive key, read by the hub page only.
  function persist() { S.set(KEY, save); try { var m = ['bronze', 'silver', 'gold'].filter(function (k) { return save.medals && save.medals[k] === true; }); window.localStorage.setItem('pixeltown-medals-stalk-v1', JSON.stringify({ v: 1, m: m })); } catch (e) { /* storage blocked */ } try { window.MMHubProfile.sync(localStorage, 'stalk', [(save.invested > 0 || save.played >= 1) && 'trade'].concat(m)); } catch (e) { /* hub map progress is optional */ } }

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
    c.font = '12px monospace'; c.textBaseline = 'middle';
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
    // the newest point glides in from the previous one (prog 0..1); reduce-motion draws it final
    function PX(i) { return i === slot && slot > 0 ? X(slot - 1) + (X(slot) - X(slot - 1)) * prog : X(i); }
    function PY(i) { return i === slot && slot > 0 ? Y(known[slot - 1]) + (Y(known[slot]) - Y(known[slot - 1])) * prog : Y(known[i]); }
    known.forEach(function (v, i) { if (i === 0) c.moveTo(PX(i), PY(i)); else c.lineTo(PX(i), PY(i)); });
    c.stroke();
    known.forEach(function (v, i) {
      c.fillStyle = i === slot ? '#ffd166' : '#7fd18b';
      c.beginPath(); c.arc(PX(i), PY(i), i === slot ? 5 : 3, 0, Math.PI * 2); c.fill();
    });
    if (marks) { c.strokeStyle = '#f4a261'; c.lineWidth = 2; marks.forEach(function (i) { if (i <= slot) { c.beginPath(); c.arc(X(i), Y(known[i]), 8, 0, Math.PI * 2); c.stroke(); } }); }
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
      : 'Sell price now. You paid ' + (save.holdings ? 'up to ' : '') + 'about ' + wk.buyPrice + ' on Sunday.' + (save.holdings ? ' Sell all now: ' + signed(save.earned + save.holdings * price - save.invested) + ' bells for the week.' : '');
    $('buy1').disabled = !sunday || M.maxBuy(save, wk) < 1;
    $('buy10').disabled = !sunday || M.maxBuy(save, wk) < 10;
    $('sell1').disabled = sunday || save.holdings < 1;
    $('sellall').disabled = sunday || save.holdings < 1;
    $('market-reason').textContent = sunday
      ? 'Selling closed: the market only buys stalks Monday to Saturday. Buying is open today.'
      : 'Buying closed: stalks can only be bought on Sunday. Selling is open now.';
    $('buy1').textContent = 'Buy 1';
    $('go-practice').hidden = sunday || save.holdings > 0; // dead-end fix: a weekday with nothing to sell offers the quick practice week
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
  function doBuy(n) {
    sync();
    var r = M.buy(save, wk, curSlot(), n);
    if (!r.ok) { say(REASONS[r.reason] || 'Cannot do that.'); render(); return r; }
    save = M.latchGoals(r.save, wk); persist(); beep('pickup'); // buy cue
    say('Bought ' + r.qty + ' for ' + fmt(r.cost) + ' bells.'); render(); return r;
  }
  function doSell(n) {
    sync();
    var r = M.sell(save, wk, curSlot(), n);
    if (!r.ok) { say(REASONS[r.reason] || 'Cannot do that.'); render(); return r; }
    var before = M.goalsDone(save, wk);
    save = M.latchGoals(r.save, wk); persist(); beep('levelup'); // sell cue
    var vs = r.gain - r.qty * wk.buyPrice;
    say('Sold ' + r.qty + ' for ' + fmt(r.gain) + ' bells (' + signed(vs) + ' against the Sunday price).' + (save.goals !== before ? ' A weekly goal is done!' : '')); render(); pop($('st-profit')); return r;
  }
  function doSellNb(id, n) {
    sync();
    var qty = n === undefined ? save.holdings : n;
    var r = M.sellToNeighbour(save, id, curWeek(), curSlot(), qty);
    if (!r.ok) { say(r.reason === 'fee' ? 'That deal would not cover the fee.' : (REASONS[r.reason] || 'Cannot do that.')); render(); return r; }
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
  window.addEventListener('keydown', function (e) {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    var k = e.key.toLowerCase();
    if (k === 'b') { doBuy(e.shiftKey ? 10 : 1); e.preventDefault(); }
    else if (k === 's') { doSell(e.shiftKey ? save.holdings : 1); e.preventDefault(); }
  });


  // ---------- practice week (quick play) ----------
  // A seeded pretend week ('practice|N', N counts up per round: no Math.random). Own bells, own key
  // (pixeltown-stalk-practice-v1: {v, n, best, rounds}); never touches the real save, medals or hub profile.
  var PKEY = 'pixeltown-stalk-practice-v1', PSTART = 1000;
  function cleanPr(raw) {
    var o = raw && typeof raw === 'object' ? raw : {};
    function n(v, lo, hi) { v = Math.trunc(Number(v)); return isFinite(v) ? Math.max(lo, Math.min(hi, v)) : 0; }
    var best = Math.trunc(Number(o.best));
    return { v: 1, n: n(o.n, 0, 999999), best: isFinite(best) ? Math.max(-PSTART, Math.min(99999999, best)) : 0, rounds: n(o.rounds, 0, 999999), hasBest: o.hasBest === true };
  }
  var prSave = cleanPr(S.get(PKEY, null));
  var pr = null;
  function prPersist() { S.set(PKEY, prSave); }
  function prStart() {
    prSave.n += 1; prPersist();
    pr = { n: prSave.n, wk: M.generateWeek('practice|' + prSave.n), slot: 0, bells: PSTART, hold: 0, invested: 0, earned: 0, marks: [], done: false };
    $('pr-start').hidden = true; $('pr-end').hidden = true; $('pr-play').hidden = false; $('pr-actions').hidden = false; $('pr-odds').hidden = false;
    $('pr-msg').textContent = 'Sunday: buy stalks, then step through the week.';
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
    var hadBest = prSave.hasBest, isBest = !hadBest || profit > prSave.best;
    if (isBest) { prSave.best = profit; prSave.hasBest = true; }
    prSave.rounds += 1; prPersist();
    beep(profit > 0 ? 'claim' : 'ui_tap');
    $('pr-actions').hidden = true; $('pr-odds').hidden = true; $('pr-end').hidden = false;
    $('pr-when').textContent = 'Week over'; $('pr-pl').textContent = ''; $('pr-stat').textContent = 'Final practice bells ' + fmt(pr.bells) + '. Rings on the chart mark where you sold.';
    $('pr-end-title').textContent = (profit > 0 ? 'Profit ' : profit < 0 ? 'Loss ' : 'Even ') + signed(profit) + ' bells' + (isBest && hadBest ? ' - new practice best!' : '');
    var ul = $('pr-end-list'); ul.textContent = '';
    [
      'This was a "' + M.PATTERN_NAMES[pr.wk.pattern] + '" week. ' + M.PATTERN_HINTS[pr.wk.pattern],
      'Sunday price ' + pr.wk.buyPrice + '; the peak was ' + peak + ' on ' + M.slotLabel(peakSlot) + '.',
      pr.invested ? (pr.marks.length ? 'You sold on ' + pr.marks.map(function (i) { return M.slotLabel(i); }).join(', ') + '.' : 'You never sold.') : 'You did not buy any stalks this time.',
      spoiled ? spoiled + ' stalks spoiled at the end of the week.' : 'Nothing spoiled.',
      'Practice best: ' + signed(prSave.best) + ' bells over ' + prSave.rounds + ' practice week(s).'
    ].forEach(function (t) { var li = document.createElement('li'); li.textContent = t; ul.appendChild(li); });
    drawChartOn($('pr-chart'), pr.wk, M.SLOTS - 1, 1, pr.marks);
    prBestLine();
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
    var a = M.advise(M.knownPrices(pr.wk, pr.slot));
    $('pr-odds').textContent = a.ready ? 'Honest odds from the prices so far: ' + M.PATTERNS.map(function (p) { return M.PATTERN_NAMES[p] + ' ' + Math.round(a.probs[p] * 100) + '%'; }).join(', ') + '.' : 'Odds appear after Monday\'s two prices.';
    $('pr-buy').disabled = !sun || Math.floor(pr.bells / pr.wk.buyPrice) < 1 || pr.hold >= M.MAX_HOLD;
    $('pr-sell').disabled = sun || pr.hold < 1;
    $('pr-sell').textContent = pr.hold && !sun ? 'Sell all (' + pr.hold + ')' : 'Sell all';
    $('pr-next').textContent = pr.slot >= M.SLOTS - 1 ? 'End week' : 'Next half-day';
    drawChartOn($('pr-chart'), pr.wk, pr.slot, 1, pr.marks);
  }
  $('pr-start').addEventListener('click', prStart);
  $('go-practice').addEventListener('click', function () { if (!pr || pr.done) prStart(); try { $('practice').scrollIntoView({ behavior: reduced ? 'auto' : 'smooth', block: 'start' }); } catch (e) { /* ignore */ } });
  $('pr-again').addEventListener('click', prStart);
  $('pr-buy').addEventListener('click', prBuy);
  $('pr-sell').addEventListener('click', prSell);
  $('pr-next').addEventListener('click', prNext);
  prBestLine();

  // Real-time week/slot changes while the page stays open (no nagging, just keeps the numbers right).
  function tick() { var before = curSlot(); var rolled = sync(); if (rolled || before !== lastSlot) { lastSlot = before; animateChartSoon = true; if (rolled && spoiledNote) { say(spoiledNote + ' stalks spoiled over the weekend. A fresh week has started.'); spoiledNote = 0; } render(); if (animateChartSoon) { animateChartSoon = false; animateChart(); } } }
  var lastSlot = -1, animateChartSoon = false;
  sync();
  if (spoiledNote) { say(spoiledNote + ' stalks spoiled over the weekend. A fresh week has started.'); spoiledNote = 0; }
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
        if (spoiledNote) { say(spoiledNote + ' stalks spoiled over the weekend. A fresh week has started.'); spoiledNote = 0; }
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
      practice: { start: prStart, buy: prBuy, sell: prSell, next: prNext, get state() { return pr; }, get saved() { return prSave; } }
    };
  }
}());
