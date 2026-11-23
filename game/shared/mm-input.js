// MMInput: the ONE control scheme every Pixeltown game uses (see game/design/CONTROLS.md).
// Pure key -> action mapping plus a small held/pressed tracker and a gamepad reader. No DOM access
// except the optional attach() helper. No rebinding: one fixed scheme, so every game reads the same.
//
// Actions: up, down, left, right (Move), primary, secondary, menu, restart.
//   Move      WASD / arrows / left stick / d-pad
//   Primary   Space / Enter / tap / big right button / pad A
//   Secondary Shift / E / second right button / pad B or X
//   Menu      Esc / P / top-left Menu button / pad Start
//   Restart   R / pad Back (Select)
// A game keeps its own extra keys (abilities, map toggles) and reads these as aliases.
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.MMInput = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  const ACTIONS = ['up', 'down', 'left', 'right', 'primary', 'secondary', 'menu', 'restart'];
  // Keys are KeyboardEvent.key lower-cased (' ' for Space). Codes (e.code) are a fallback for layouts.
  const KEYS = Object.freeze({
    w: 'up', arrowup: 'up', s: 'down', arrowdown: 'down', a: 'left', arrowleft: 'left', d: 'right', arrowright: 'right',
    ' ': 'primary', spacebar: 'primary', enter: 'primary',
    shift: 'secondary', e: 'secondary',
    escape: 'menu', esc: 'menu', p: 'menu',
    r: 'restart',
  });
  const CODES = Object.freeze({
    KeyW: 'up', KeyS: 'down', KeyA: 'left', KeyD: 'right', Space: 'primary', NumpadEnter: 'primary',
    ShiftLeft: 'secondary', ShiftRight: 'secondary', KeyE: 'secondary', KeyP: 'menu', KeyR: 'restart',
    // additive: the rest of the scheme by code, for keyboards / IMEs that report key 'Unidentified' or 'Process'
    ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right', Enter: 'primary', Escape: 'menu',
  });
  const LABELS = Object.freeze({ move: 'WASD / arrows', primary: 'Space / Enter', secondary: 'Shift / E', menu: 'Esc / P', restart: 'R' });
  const TOUCH = Object.freeze({ move: 'stick (bottom left)', primary: 'big button', secondary: 'small button', menu: 'Menu (top left)', restart: 'Menu > Restart' });
  const DEAD = 0.22;
  const TOUCH_MIN_PX = 56;

  function norm(k) { try { return String(k == null ? '' : k).toLowerCase(); } catch (e) { return ''; } }
  // own keys only: 'constructor' / '__proto__' / 'toString' used to read Object.prototype members and count as actions
  const own = Object.prototype.hasOwnProperty;
  const keyAct = (k) => (own.call(KEYS, k) ? KEYS[k] : null);
  const codeAct = (c) => (typeof c === 'string' && own.call(CODES, c) ? CODES[c] : null);

  // actionOf('Enter') -> 'primary'; actionOf(event) also works (reads .key, falls back to .code).
  function actionOf(k) {
    if (k && typeof k === 'object') { const a = keyAct(norm(k.key)); return a || codeAct(k.code) || null; }
    return keyAct(norm(k));
  }
  function keysFor(action) { return Object.keys(KEYS).filter((k) => KEYS[k] === action); }
  function isTyping(t) { // never steal keys from a text field
    if (!t || !t.tagName) return false;
    const n = String(t.tagName).toUpperCase();
    return n === 'INPUT' || n === 'TEXTAREA' || n === 'SELECT' || !!t.isContentEditable;
  }

  // The one-line hint. opts: { touch, only: ['move','primary',...], names: { primary: 'fire' } }.
  function hint(opts) {
    const o = opts || {}, L = o.touch ? TOUCH : LABELS;
    const names = Object.assign({ move: 'move', primary: 'act', secondary: 'alt', menu: 'menu', restart: 'restart' }, o.names || {});
    const list = o.only || ['move', 'primary', 'secondary', 'menu', 'restart'];
    return list.filter((a) => L[a] && names[a] !== false).map((a) => L[a] + ' ' + names[a]).join(' · ');
  }

  function down(b) { return !!b && (b.pressed === true || (+b.value || 0) > 0.5); }
  // Standard-mapping pad -> the same actions. A=primary, B/X=secondary, Start=menu, Back=restart.
  function readPad(pad, out) {
    const r = out && typeof out === 'object' ? out : { move: { x: 0, y: 0 }, primary: false, secondary: false, menu: false, restart: false };
    if (!r.move || typeof r.move !== 'object') r.move = { x: 0, y: 0 }; // a reused `out` without .move used to throw
    const a = (pad && pad.axes) || [], b = (pad && pad.buttons) || [];
    const ax = (v) => { v = +v; return isFinite(v) ? Math.max(-1, Math.min(1, v)) : 0; }; // a broken pad reporting Infinity used to give NaN moves
    let x = ax(a[0]), y = ax(a[1]);
    if (down(b[14])) x = -1; if (down(b[15])) x = 1; if (down(b[12])) y = -1; if (down(b[13])) y = 1;
    const m = Math.hypot(x, y);
    if (m <= DEAD) { r.move.x = 0; r.move.y = 0; } else { const s = Math.min(1, (m - DEAD) / (1 - DEAD)) / m; r.move.x = x * s; r.move.y = y * s; }
    r.primary = down(b[0]); r.secondary = down(b[1]) || down(b[2]); r.menu = down(b[9]); r.restart = down(b[8]);
    return r;
  }

  // A tracker: feed it key events (or call press/release), read held state and one-shot edges.
  function create() {
    const held = Object.create(null), edge = Object.create(null);
    const st = {
      press(k) { const a = typeof k === 'string' && ACTIONS.includes(k) && !keyAct(norm(k)) ? k : actionOf(k); if (!a) return null; if (!held[a]) edge[a] = true; held[a] = (held[a] || 0) + 1; return a; },
      release(k) { const a = typeof k === 'string' && ACTIONS.includes(k) && !keyAct(norm(k)) ? k : actionOf(k); if (!a) return null; held[a] = Math.max(0, (held[a] || 0) - 1); return a; },
      clear() { ACTIONS.forEach((a) => { held[a] = 0; edge[a] = false; }); },
      held(a) { return (held[a] || 0) > 0; },
      pressed(a) { const e = !!edge[a]; edge[a] = false; return e; }, // true once per press
      move() { let x = 0, y = 0; if (st.held('left')) x -= 1; if (st.held('right')) x += 1; if (st.held('up')) y -= 1; if (st.held('down')) y += 1; const m = Math.hypot(x, y) || 1; return { x: x / m, y: y / m }; },
      read(pad) { const p = pad ? readPad(pad) : null; const mv = st.move(); if (p && (p.move.x || p.move.y)) { mv.x = p.move.x; mv.y = p.move.y; } return { move: mv, primary: st.held('primary') || !!(p && p.primary), secondary: st.held('secondary') || !!(p && p.secondary), menu: st.held('menu') || !!(p && p.menu), restart: st.held('restart') || !!(p && p.restart) }; },
    };
    st.clear();
    return st;
  }

  // Browser helper: tracks window key events into a tracker; calls onAction(action, event) on each fresh press.
  function attach(target, onAction) {
    const t = create(), keyOf = (e) => (keyAct(norm(e.key)) ? norm(e.key) : e);
    // Ctrl / Cmd / Alt chords (Ctrl+R reload, Cmd+P print, Cmd+W) are the browser's, not the game's: on macOS the plain key's
    // keyup never arrives while Cmd is down, so reading them left the action stuck held.
    const kd = (e) => { if (isTyping(e.target) || e.ctrlKey || e.metaKey || e.altKey) return; const a = actionOf(e); if (!a) return; const wasHeld = t.held(a); if (!e.repeat) t.press(keyOf(e)); if (!wasHeld && !e.repeat && onAction) onAction(a, e); };
    const ku = (e) => { if (actionOf(e)) t.release(keyOf(e)); };
    const bl = () => t.clear();
    target.addEventListener('keydown', kd); target.addEventListener('keyup', ku); target.addEventListener('blur', bl);
    t.detach = () => { target.removeEventListener('keydown', kd); target.removeEventListener('keyup', ku); target.removeEventListener('blur', bl); };
    return t;
  }

  return { ACTIONS, KEYS, CODES, LABELS, TOUCH, TOUCH_MIN_PX, DEAD, actionOf, keysFor, hint, readPad, create, attach, isTyping };
});
