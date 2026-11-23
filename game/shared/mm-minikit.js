// MMMiniKit (MK1): one consistent, accessible result card for the arcade mini-games.
// Pure parts (node-testable): fmt, fmtTime, pbDelta, nearMiss, goalLine, nextGoal, seedCode, parseSeedCode, result.
// DOM part: panel(el, vm, on) builds the card with textContent only. Play again is the first focusable element and
// gets focus; Enter / R play again, Escape closes nothing. No storage writes, no network (Copy uses the clipboard only).
(function (root) {
  'use strict';
  var NEAR = 0.03; // "So close!" only within 3% of a goal
  var CODE_RE = /^[A-Z0-9]{1,24}$/;

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
  // seed -> share code (A-Z0-9, 24 chars or fewer); '' when nothing usable is left
  function seedCode(seed) {
    var s = String(seed === undefined || seed === null ? '' : seed).toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 24);
    return s;
  }
  // share code -> seed (lower case) or null. Case-insensitive; rejects anything over 24 chars or outside A-Z0-9.
  function parseSeedCode(code) {
    if (typeof code !== 'string') return null;
    var c = code.trim().toUpperCase();
    if (!CODE_RE.test(c)) return null;
    return c.toLowerCase();
  }
  // build the view model the panel draws (pure; never mutates input)
  function result(o) {
    o = o || {};
    var stats = (Array.isArray(o.stats) ? o.stats : []).slice(0, 4).map(function (s) {
      return { label: String(s.label || ''), value: String(s.value === undefined ? '' : s.value), best: !!s.best, id: s.id ? String(s.id) : '' };
    });
    var seed = o.seed !== undefined && o.seed !== null && o.seed !== '' ? String(o.seed) : '';
    var code = seed ? seedCode(seed) : '';
    var goal = o.goal === undefined ? nextGoal(o.medals) : o.goal;
    return {
      title: String(o.title || 'Round over'),
      headline: Array.isArray(o.headline) ? o.headline.map(function (p) { return typeof p === 'string' ? { text: p } : { text: String(p.text), id: p.id ? String(p.id) : '' }; }) : [{ text: String(o.headline || '') }],
      stats: stats,
      lines: (Array.isArray(o.lines) ? o.lines : []).map(function (l) { return { id: l.id ? String(l.id) : '', text: String(l.text || ''), cls: l.cls ? String(l.cls) : '' }; }),
      goal: o.goalText !== undefined ? String(o.goalText) : goalLine(o.value, goal),
      seed: seed,
      code: code,
      replay: !!seed && o.replay !== false,
      more: (Array.isArray(o.more) ? o.more : []).slice(0, 2).map(function (m) { return { id: m.id ? String(m.id) : '', label: String(m.label || '') }; }),
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
    el.__mkOn = { again: function () { if (!el.hidden) again.click(); }, ready: function () { return Date.now() - shownAt >= hold && (!on.keyReady || !!on.keyReady()); } };
    return { again: again, replay: replay, more: more, copy: copy, menu: menu, vm: vm, focus: function () { try { again.focus({ preventScroll: true }); } catch (e) { again.focus(); } } };
  }

  var api = { NEAR: NEAR, fmt: fmt, fmtTime: fmtTime, pbDelta: pbDelta, nearMiss: nearMiss, nextGoal: nextGoal, goalLine: goalLine, seedCode: seedCode, parseSeedCode: parseSeedCode, result: result, panel: panel };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (root) root.MMMiniKit = api;
}(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this)));
