// MMMiniKit (MK1): one consistent, accessible result card for the arcade mini-games.
// Pure parts (node-testable): fmt, fmtTime, pbDelta, nearMiss, goalLine, nextGoal, seedCode, parseSeedCode, result.
// DOM part: panel(el, vm, on) builds the card with textContent only. Play again is the first focusable element and
// gets focus; Enter / R play again, Escape closes nothing. No storage writes, no network (Copy uses the clipboard only).
(function (root) {
  'use strict';
  var NEAR = 0.03; // "So close!" only within 3% of a goal
  var CODE_RE = /^(?:\.?[A-Za-z]|[0-9_-])+$/; // share code alphabet: A-Z 0-9 _ - and '.' before a letter that was upper case

  function num(v) { v = Number(v); return isFinite(v) ? v : 0; }
  function fmt(n) {
    n = Math.round(num(n));
    var s = String(Math.abs(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    return (n < 0 ? '-' : '') + s;
  }
  function fmtTime(ms) {
    ms = Math.max(0, Math.round(num(ms)));
    var s = Math.floor(ms / 1000), m = Math.floor(s / 60), t = Math.floor((ms % 1000) / 100);
    return (m ? m + ':' + String(s % 60).padStart(2, '0') : String(s)) + '.' + t + 's';
  }
  // compare a run with the previous best. lower = true when smaller is better (times).
  function pbDelta(value, prevBest, lower) {
    value = num(value);
    var had = prevBest !== null && prevBest !== undefined && isFinite(Number(prevBest)) && !(lower && Number(prevBest) <= 0);
    var best = had ? Number(prevBest) : null;
    if (!had) return { kind: 'new', delta: value, text: 'New best!' };
    var d = lower ? best - value : value - best;
    if (d > 0) return { kind: 'new', delta: d, text: 'New best! +' + fmt(d) };
    if (d === 0) return { kind: 'equal', delta: 0, text: 'Equal to your best' };
    return { kind: 'below', delta: d, text: 'Best: ' + fmt(best) };
  }
  // true only when the goal was missed and the run is within 3% of it
  function nearMiss(value, goal, lower) {
    value = num(value); goal = num(goal);
    if (goal <= 0) return false;
    if (lower ? value <= goal : value >= goal) return false;
    return Math.abs(goal - value) / goal <= NEAR;
  }
  // first medal not yet earned: medals = [{ id, label, goal?, earned }]
  function nextGoal(medals) {
    if (!Array.isArray(medals)) return null;
    for (var i = 0; i < medals.length; i++) if (medals[i] && !medals[i].earned) return medals[i];
    return null;
  }
  // one calm next-goal line. goal = { label, target?, lower? } or null (all done)
  function goalLine(value, goal) {
    if (!goal) return 'All medals won. Chase your best!';
    var label = String(goal.label || '');
    if (goal.target !== undefined && nearMiss(value, goal.target, goal.lower)) return 'So close! Next goal: ' + label;
    return 'Next goal: ' + label;
  }
  // seed -> share code; '' when nothing usable is left. Seed chars outside A-Z a-z 0-9 _ - are dropped and the seed is cut to
  // 24 chars (the games' own seed rule). Lower-case letters and digits read as before (abc123 -> ABC123), so old codes still
  // work; '-' and '_' are kept, and an upper-case letter is written as '.' + letter, so every game seed round-trips exactly.
  function seedCode(seed) {
    var s = String(seed === undefined || seed === null ? '' : seed).replace(/[^A-Za-z0-9_-]/g, '').slice(0, 24);
    return s.replace(/[A-Z]/g, '.$&').toUpperCase();
  }
  // share code -> seed or null. Case-insensitive; trims; rejects anything that does not decode to 1-24 seed chars.
  function parseSeedCode(code) {
    if (typeof code !== 'string') return null;
    var c = code.trim();
    if (c.length > 48 || !CODE_RE.test(c)) return null;
    var out = c.replace(/\.([A-Za-z])|([A-Za-z])/g, function (m, up, lo) { return up ? up.toUpperCase() : lo.toLowerCase(); });
    return out.length >= 1 && out.length <= 24 ? out : null;
  }
  // build the view model the panel draws (pure; never mutates input)
  function result(o) {
    o = o || {};
    var obj = function (v) { return v && typeof v === 'object' ? v : {}; }; // a null / number entry used to throw (s.label of null)
    var stats = (Array.isArray(o.stats) ? o.stats : []).slice(0, 4).map(obj).map(function (s) {
      return { label: String(s.label || ''), value: String(s.value === undefined ? '' : s.value), best: !!s.best, id: s.id ? String(s.id) : '' };
    });
    var seed = o.seed !== undefined && o.seed !== null && o.seed !== '' ? String(o.seed) : '';
    var code = seed ? seedCode(seed) : '';
    var goal = o.goal === undefined ? nextGoal(o.medals) : o.goal;
    return {
      title: String(o.title || 'Round over'),
      headline: Array.isArray(o.headline) ? o.headline.map(function (p) { return typeof p === 'string' ? { text: p } : { text: String(obj(p).text === undefined ? '' : obj(p).text), id: obj(p).id ? String(obj(p).id) : '' }; }) : [{ text: String(o.headline || '') }],
      stats: stats,
      lines: (Array.isArray(o.lines) ? o.lines : []).map(obj).map(function (l) { return { id: l.id ? String(l.id) : '', text: String(l.text || ''), cls: l.cls ? String(l.cls) : '' }; }),
      goal: o.goalText !== undefined ? String(o.goalText) : goalLine(o.value, goal),
      seed: seed,
      code: code,
      replay: !!seed && o.replay !== false,
      more: (Array.isArray(o.more) ? o.more : []).slice(0, 2).map(obj).map(function (m) { return { id: m.id ? String(m.id) : '', label: String(m.label || '') }; }),
      menuHref: o.menuHref ? String(o.menuHref) : '',
      menuLabel: String(o.menuLabel || 'Menu'),
      ids: Object.assign({ again: 'mk-again', replay: 'mk-replay', copy: 'mk-copy', code: 'mk-code', goal: 'mk-goal', menu: 'mk-menu' }, o.ids || {}),
    };
  }

  // ---------- DOM ----------
  function mk(doc, tag, cls, text, id) {
    var e = doc.createElement(tag);
    if (cls) e.className = cls;
    if (text !== undefined && text !== null) e.textContent = String(text);
    if (id) e.id = id;
    return e;
  }
  function reducedMotion(win) {
    try { return !!(win && win.matchMedia && win.matchMedia('(prefers-reduced-motion: reduce)').matches); } catch (e) { return false; }
  }
  // cycle 6 U (b09-r3-05): on a narrow phone (195 px) the result headline sat under the fixed Menu (compass) button (Dash, Pop) and
  // Stack's fixed card started over the header and its Sound button. keepClear(el), run when a card shows:
  //   - a fixed card (Stack) moves down below the page header (#top) and its 8-bit ring, and shrinks to fit (it scrolls inside);
  //   - a card in the page flow scrolls the page so the card (ring included) starts below the Menu button (or, when the card is not
  //     in the button's column, below the top edge: a page scrolled down to the board left the headline above the screen).
  // Returns the px moved (0 = already clear).
  var RING = 14; // the 8-bit arcade card ring is drawn 12 px outside the box
  function keepClear(el) {
    if (!el || el.hidden || !el.getClientRects || !el.getClientRects().length) return 0;
    var doc = el.ownerDocument || root.document, win = doc.defaultView || root, r = el.getBoundingClientRect();
    if (win.getComputedStyle(el).position === 'fixed') {
      var top = doc.getElementById('top'); if (!top || !top.getClientRects().length) return 0;
      var hb = Math.round(top.getBoundingClientRect().bottom + 4 + RING); // header border-bottom shadow + the card ring
      if (r.top >= hb || hb <= RING + 4) return 0;
      el.style.top = hb + 'px'; el.style.maxHeight = Math.max(120, win.innerHeight - hb - 8) + 'px';
      return Math.round(hb - r.top);
    }
    var b = doc.getElementById('mm-nav-btn'), br = b && b.getClientRects().length && win.getComputedStyle(b).position === 'fixed' ? b.getBoundingClientRect() : null;
    var under = !!br && r.left < br.right + RING && r.right > br.left - RING; // the card is in the button's column
    var want = under ? br.bottom + 8 + RING : RING + 4; // else: just not above the top edge (a page scrolled down to the board)
    if (r.top >= want) return 0;
    var y0 = win.scrollY, y = Math.max(0, Math.round(y0 + r.top - want));
    try { win.scrollTo({ top: y, behavior: 'instant' }); } catch (e) { win.scrollTo(0, y); }
    return Math.round(y0 - win.scrollY);
  }
  // el: the card container (section). vm: result() output (or raw input).
  // on: { again, replay(seed), more: [fn per vm.more button], extra: [nodes kept in the card], keyReady() -> false holds R / Enter, holdMs }
  function panel(el, vm, on) {
    if (!el) return null;
    if (!vm || !vm.ids) vm = result(vm);
    on = on || {};
    var doc = el.ownerDocument || root.document, win = doc.defaultView || root;
    var keep = (on.extra || []).filter(Boolean);
    while (el.firstChild) el.removeChild(el.firstChild);
    el.classList.add('mk-card');
    if (reducedMotion(win)) el.classList.add('mk-still'); else el.classList.remove('mk-still');
    var acts = mk(doc, 'div', 'mk-actions');
    var again = mk(doc, 'button', 'mk-btn mk-primary', 'Play again', vm.ids.again);
    again.type = 'button';
    acts.appendChild(again);
    var replay = null;
    if (vm.replay) { replay = mk(doc, 'button', 'mk-btn', 'Replay seed', vm.ids.replay); replay.type = 'button'; acts.appendChild(replay); }
    var more = vm.more.map(function (m, i) {
      var b = mk(doc, 'button', 'mk-btn', m.label, m.id); b.type = 'button';
      b.addEventListener('click', function () { if (on.more && on.more[i]) on.more[i](); });
      acts.appendChild(b); return b;
    });
    var menu = null;
    if (vm.menuHref) { menu = mk(doc, 'a', 'mk-btn mk-link', vm.menuLabel, vm.ids.menu); menu.href = vm.menuHref; acts.appendChild(menu); }
    var h = mk(doc, 'h2', 'mk-head', null, vm.ids.head || '');
    vm.headline.forEach(function (p) { h.appendChild(p.id ? mk(doc, 'span', '', p.text, p.id) : doc.createTextNode(p.text)); });
    el.appendChild(h);
    if (vm.stats.length) {
      var dl = mk(doc, 'dl', 'mk-stats');
      vm.stats.forEach(function (s) {
        var row = mk(doc, 'div', 'mk-row' + (s.best ? ' mk-best' : ''));
        row.appendChild(mk(doc, 'dt', '', s.label));
        var dd = mk(doc, 'dd', '', s.value, s.id);
        row.appendChild(dd);
        if (s.best) row.appendChild(mk(doc, 'span', 'mk-new', 'New best!'));
        dl.appendChild(row);
      });
      el.appendChild(dl);
    }
    vm.lines.forEach(function (l) { el.appendChild(mk(doc, 'p', 'mk-line ' + (l.cls || 'dim'), l.text, l.id)); });
    keep.forEach(function (n) { el.appendChild(n); });
    el.appendChild(mk(doc, 'p', 'mk-goal', vm.goal, vm.ids.goal));
    el.appendChild(acts); // nothing above is focusable, so Play again is the first focusable element
    var copy = null;
    if (vm.code) {
      var sh = mk(doc, 'p', 'mk-share');
      sh.appendChild(doc.createTextNode('Share code: '));
      sh.appendChild(mk(doc, 'strong', 'mk-code', vm.code, vm.ids.code));
      copy = mk(doc, 'button', 'mk-btn mk-copy', 'Copy', vm.ids.copy); copy.type = 'button';
      copy.setAttribute('aria-label', 'Copy share code ' + vm.code);
      sh.appendChild(copy);
      el.appendChild(sh);
    }
    again.addEventListener('click', function () { if (on.again) on.again(); });
    if (replay) replay.addEventListener('click', function () { if (on.replay) on.replay(vm.seed); });
    if (copy) copy.addEventListener('click', function () {
      var done = function (ok) { copy.textContent = ok ? 'Copied' : 'Copy failed'; };
      try {
        var cb = win.navigator && win.navigator.clipboard;
        if (cb && cb.writeText) cb.writeText(vm.code).then(function () { done(true); }, function () { done(false); });
        else done(false);
      } catch (e) { done(false); }
    });
    if (!el.__mkKeys) {
      el.__mkKeys = true;
      doc.addEventListener('keydown', function (ev) {
        if (el.hidden || !el.__mkOn || !el.__mkOn.ready()) return;
        var k = ev.key, ae = doc.activeElement;
        if (k === 'Escape') { ev.preventDefault(); return; } // nothing destructive closes the card
        if (k === 'r' || k === 'R') { if (ae && /^(INPUT|TEXTAREA)$/.test(ae.tagName)) return; ev.preventDefault(); el.__mkOn.again(); }
        else if (k === 'Enter') { if (ae && el.contains(ae) && /^(BUTTON|A)$/.test(ae.tagName)) return; ev.preventDefault(); el.__mkOn.again(); }
      });
    }
    var shownAt = Date.now(), hold = Math.max(0, Number(on.holdMs) || 0); // holdMs: a short pause so a key held at the end does not skip the card
    el.__mkOn = { again: function () { if (!el.hidden) again.click(); }, ready: function () { return Date.now() - shownAt >= hold && (!on.keyReady || !!on.keyReady()); }, clickReady: function () { return Date.now() - shownAt >= hold; } };
    // G-17 (b09-02): the click guard is the kit default: every button / link in the card is inert for holdMs after it opens (taps still
    // landing from the round, or a mashing finger, never hit Play again / Replay / Copy / Menu). Same hold as R / Enter; reduced motion
    // does not change it. A page keeps its own extra guard if it has one. Only trusted (user) clicks are held: scripted clicks are the page's own.
    if (!el.__mkClick) {
      el.__mkClick = true;
      el.addEventListener('click', function (ev) {
        if (!ev.isTrusted || !el.__mkOn || el.__mkOn.clickReady()) return; // a real tap / click / Enter-on-button only: a page's own scripted .click() stays its call
        var t = ev.target && ev.target.closest ? ev.target.closest('button, a') : null; if (!t || !el.contains(t)) return;
        ev.preventDefault(); ev.stopImmediatePropagation();
      }, true);
    }
    return { again: again, replay: replay, more: more, copy: copy, menu: menu, vm: vm, focus: function () { try { again.focus({ preventScroll: true }); } catch (e) { again.focus(); } keepClear(el); }, keepClear: function () { return keepClear(el); } };
  }

  var api = { NEAR: NEAR, fmt: fmt, fmtTime: fmtTime, pbDelta: pbDelta, nearMiss: nearMiss, nextGoal: nextGoal, goalLine: goalLine, seedCode: seedCode, parseSeedCode: parseSeedCode, result: result, panel: panel, keepClear: keepClear };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (root) root.MMMiniKit = api;
}(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this)));
