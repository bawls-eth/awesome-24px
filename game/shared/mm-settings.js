// MMSettings: ONE simple Settings panel for every page (8-bit look, see mm-settings.css and game/design/SETTINGS-WIRING.md).
// Groups: Play (one-thumb, auto-fire, aim assist, bullet shapes), See (text size, reduced motion, screen flashes, low graphics,
// high contrast), Hear (sound, music), Help (controls cheat-sheet + the Feedback box).
// Every setting reads and writes the device keys the games ALREADY use, so nothing is lost or renamed:
//   mm-auto-fire, mm-aim-toggle, mm-aim-assist (default on), mm-bullet-shapes, mm-reduce-motion (MMMotion), mm-sfx-muted (sfx.js),
//   pixeltown-access-v1 {hudScale, flashes, lowGfx} (MMAccess.prefs; other fields such as palette are kept untouched).
// New additive keys: mm-music ('1'/'0'), mm-high-contrast ('1'/'0'). Never touches the save (pixeltown-save-v1), never the network or Firebase.
// After each change: <html> gets --ui-scale, data-reduce-motion, data-low-gfx, data-high-contrast, and window gets a
// 'mm-settings-change' CustomEvent {detail:{id, value}} so a page can call its own setter (e.g. realm.setAutoFire).
// Text is only ever set with textContent. UMD: browser global MMSettings, or require() in node (model functions only).
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(null);
  else root.MMSettings = factory(root);
}(typeof self !== 'undefined' ? self : this, function (win) {
  const ACCESS_KEY = 'pixeltown-access-v1';
  const SCALES = [1, 1.25, 1.5];
  const SCALE_LABEL = { 1: 'Normal', 1.25: 'Big', 1.5: 'Huge' };
  const flag = (s, k, dflt) => { try { const v = s && s.getItem(k); return v === '1' ? true : v === '0' ? false : dflt; } catch (e) { return dflt; } };
  const setFlag = (s, k, on) => { try { if (s) s.setItem(k, on ? '1' : '0'); return true; } catch (e) { return false; } };
  function readAccess(s) {
    let raw = null;
    try { raw = JSON.parse(s.getItem(ACCESS_KEY)); } catch (e) { raw = null; }
    const o = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
    const hs = SCALES.indexOf(o.hudScale) >= 0 ? o.hudScale : 1;
    return { raw: o, hudScale: hs, flashes: o.flashes !== false, lowGfx: o.lowGfx === true };
  }
  // Merge one field into pixeltown-access-v1, keeping every other field (palette, bulletOutline, ...). Cleaned by MMAccess when loaded.
  function writeAccess(s, field, val) {
    try {
      const cur = readAccess(s).raw;
      const next = Object.assign({ v: 1 }, cur, { [field]: val });
      const A = (win && win.MMAccess) || (typeof require === 'function' && !win ? (() => { try { return require('./mm-access.js'); } catch (e) { return null; } })() : null);
      s.setItem(ACCESS_KEY, JSON.stringify(A && A.prefs ? A.prefs.clean(next) : next));
      return true;
    } catch (e) { return false; }
  }
  function osReduced() {
    try { return !!(win && win.matchMedia && win.matchMedia('(prefers-reduced-motion: reduce)').matches); } catch (e) { return false; }
  }
  // Each item: id, group, label, hint, type ('toggle' | 'choice'), get(storage) -> value, set(storage, value) -> bool.
  const ITEMS = [
    { id: 'one-thumb', group: 'play', label: 'One-thumb mode', hint: 'Move stick only: aims and fires for you.', type: 'toggle',
      get: (s) => flag(s, 'mm-auto-fire', false) && flag(s, 'mm-aim-toggle', false),
      set: (s, on) => setFlag(s, 'mm-auto-fire', on) && setFlag(s, 'mm-aim-toggle', on) },
    { id: 'auto-fire', group: 'play', label: 'Auto-fire', hint: 'Shoots the nearest enemy.', type: 'toggle',
      get: (s) => flag(s, 'mm-auto-fire', false), set: (s, on) => setFlag(s, 'mm-auto-fire', on) },
    { id: 'aim-toggle', group: 'play', label: 'Tap to hold aim', hint: 'One tap keeps aiming on.', type: 'toggle',
      get: (s) => flag(s, 'mm-aim-toggle', false), set: (s, on) => setFlag(s, 'mm-aim-toggle', on) },
    { id: 'aim-assist', group: 'play', label: 'Aim assist', hint: 'Touch shots lean to targets.', type: 'toggle',
      get: (s) => flag(s, 'mm-aim-assist', true), set: (s, on) => setFlag(s, 'mm-aim-assist', on) },
    { id: 'bullet-shapes', group: 'play', label: 'Bullet shapes', hint: 'Shapes as well as colours.', type: 'toggle',
      get: (s) => flag(s, 'mm-bullet-shapes', false), set: (s, on) => setFlag(s, 'mm-bullet-shapes', on) },
    { id: 'text-size', group: 'see', label: 'Text size', hint: '', type: 'choice', choices: SCALES,
      get: (s) => readAccess(s).hudScale, set: (s, v) => SCALES.indexOf(v) >= 0 && writeAccess(s, 'hudScale', v) },
    { id: 'reduce-motion', group: 'see', label: 'Reduce motion', hint: 'No shake or blinking.', type: 'toggle',
      get: (s) => flag(s, 'mm-reduce-motion', osReduced()), set: (s, on) => setFlag(s, 'mm-reduce-motion', on) },
    { id: 'flashes', group: 'see', label: 'Screen flashes', hint: 'Off calms hits and bursts.', type: 'toggle',
      get: (s) => readAccess(s).flashes, set: (s, on) => writeAccess(s, 'flashes', !!on) },
    { id: 'low-gfx', group: 'see', label: 'Low graphics', hint: 'Fewer effects, smoother play.', type: 'toggle',
      get: (s) => readAccess(s).lowGfx, set: (s, on) => writeAccess(s, 'lowGfx', !!on) },
    { id: 'high-contrast', group: 'see', label: 'High contrast', hint: 'Stronger edges and text.', type: 'toggle',
      get: (s) => flag(s, 'mm-high-contrast', false), set: (s, on) => setFlag(s, 'mm-high-contrast', on) },
    { id: 'sound', group: 'hear', label: 'Sound', hint: '', type: 'toggle',
      get: (s) => !flag(s, 'mm-sfx-muted', false), set: (s, on) => setFlag(s, 'mm-sfx-muted', !on) },
    { id: 'music', group: 'hear', label: 'Music', hint: '', type: 'toggle',
      get: (s) => flag(s, 'mm-music', false), set: (s, on) => setFlag(s, 'mm-music', on) }
  ];
  const GROUPS = [
    { id: 'play', title: 'Play' }, { id: 'see', title: 'See' }, { id: 'hear', title: 'Hear' }, { id: 'help', title: 'Help' }
  ];
  // The universal control scheme (one line each).
  const CONTROLS = [
    ['Move', 'WASD / arrows / stick'],
    ['Primary', 'Space / Enter / tap'],
    ['Secondary', 'Shift / E'],
    ['Menu', 'Esc / P'],
    ['Restart', 'R']
  ];
  const item = (id) => ITEMS.find((x) => x.id === id) || null;
  function read(storage) {
    const o = {};
    ITEMS.forEach((it) => { o[it.id] = it.get(storage); });
    return o;
  }
  function set(storage, id, value) {
    const it = item(id);
    if (!it) return false;
    const v = it.type === 'toggle' ? !!value : value;
    return !!it.set(storage, v);
  }
  // apply(doc, storage): mirror the prefs on <html> (CSS hooks). Returns what it applied.
  function apply(doc, storage) {
    const v = read(storage);
    const el = doc && doc.documentElement;
    if (el) {
      el.style.setProperty('--ui-scale', String(v['text-size']));
      const at = (n, on) => { if (on) el.setAttribute(n, '1'); else el.removeAttribute(n); };
      at('data-reduce-motion', v['reduce-motion'] || !v.flashes);
      if (el.classList) el.classList.toggle('reduce-motion', !!(v['reduce-motion'] || !v.flashes)); // MM8.reducedMotion() reads this class
      at('data-low-gfx', v['low-gfx']);
      at('data-high-contrast', v['high-contrast']);
    }
    return v;
  }

  // ---------- browser UI ----------
  let cssHref = null;
  try {
    const cs = win && win.document && win.document.currentScript;
    if (cs && cs.src) cssHref = cs.src.replace(/mm-settings\.js(\?.*)?$/, 'mm-settings.css');
  } catch (e) { cssHref = null; }
  function ensureCss(doc) {
    if (!cssHref || doc.querySelector('link[href$="mm-settings.css"]') || doc.getElementById('mmset-css')) return;
    const l = doc.createElement('link');
    l.id = 'mmset-css'; l.rel = 'stylesheet'; l.href = cssHref;
    (doc.head || doc.documentElement).appendChild(l);
  }
  let panel = null;

  // mount(opts) -> api. opts: {page, storage, feedback (default true), onChange(id, value)}. Creates the hidden dialog once per page.
  function mount(opts) {
    if (!win || !win.document) return null;
    if (panel) return panel;
    const doc = win.document;
    const o = opts || {};
    const storage = (() => { try { return o.storage || win.localStorage; } catch (e) { return null; } })();
    ensureCss(doc);
    const el = (tag, cls, text) => {
      const x = doc.createElement(tag);
      if (cls) x.className = cls;
      if (text !== undefined) x.textContent = text;
      return x;
    };
    let lastFocus = null;
    const back = el('div', 'mmset-back');
    back.id = 'mmset-back';
    back.hidden = true;
    const dlg = el('div', 'mmset mm8-panel');
    dlg.id = 'mmset';
    dlg.setAttribute('role', 'dialog');
    dlg.setAttribute('aria-modal', 'true');
    dlg.setAttribute('aria-labelledby', 'mmset-title');
    dlg.setAttribute('data-page', String(o.page || 'unknown').slice(0, 32));
    dlg.hidden = true;
    const head = el('div', 'mmset-head');
    const title = el('h2', 'mmset-title', 'Settings');
    title.id = 'mmset-title';
    const closeBtn = el('button', 'mmset-close mm8-btn', 'Close');
    closeBtn.type = 'button';
    closeBtn.id = 'mmset-close';
    closeBtn.setAttribute('aria-label', 'Close settings');
    head.appendChild(title); head.appendChild(closeBtn);
    dlg.appendChild(head);
    const scroll = el('div', 'mmset-scroll');
    dlg.appendChild(scroll);
    const ctrls = {};
    function sync() {
      const v = read(storage);
      ITEMS.forEach((it) => {
        const c = ctrls[it.id];
        if (!c) return;
        if (it.type === 'toggle') {
          c.setAttribute('aria-checked', v[it.id] ? 'true' : 'false');
          c.querySelector('.mmset-state').textContent = v[it.id] ? 'ON' : 'OFF';
        } else {
          c.querySelectorAll('button').forEach((b) => b.setAttribute('aria-pressed', Number(b.getAttribute('data-value')) === v[it.id] ? 'true' : 'false'));
        }
      });
      apply(doc, storage);
    }
    function change(id, value) {
      set(storage, id, value);
      sync();
      const now = read(storage)[id];
      try { win.dispatchEvent(new win.CustomEvent('mm-settings-change', { detail: { id: id, value: now } })); } catch (e) { /* ignore */ }
      if (typeof o.onChange === 'function') { try { o.onChange(id, now); } catch (e) { /* page bug must not break settings */ } }
    }
    GROUPS.forEach((g) => {
      const sec = el('section', 'mmset-group');
      sec.setAttribute('data-group', g.id);
      const h = el('h3', 'mmset-gh', g.title);
      h.id = 'mmset-g-' + g.id;
      sec.setAttribute('aria-labelledby', h.id);
      sec.appendChild(h);
      ITEMS.filter((it) => it.group === g.id).forEach((it) => {
        if (it.type === 'toggle') {
          const b = el('button', 'mmset-row mmset-toggle');
          b.type = 'button';
          b.id = 'mmset-' + it.id;
          b.setAttribute('role', 'switch');
          b.setAttribute('data-setting', it.id);
          const txt = el('span', 'mmset-txt');
          txt.appendChild(el('span', 'mmset-label', it.label));
          if (it.hint) txt.appendChild(el('span', 'mmset-hint', it.hint));
          b.appendChild(txt);
          const st = el('span', 'mmset-state', 'OFF');
          st.setAttribute('aria-hidden', 'true');
          b.appendChild(st);
          b.addEventListener('click', () => change(it.id, b.getAttribute('aria-checked') !== 'true'));
          ctrls[it.id] = b;
          sec.appendChild(b);
        } else {
          const wrap = el('div', 'mmset-row mmset-choice');
          wrap.id = 'mmset-' + it.id;
          wrap.setAttribute('role', 'group');
          wrap.setAttribute('aria-label', it.label);
          wrap.setAttribute('data-setting', it.id);
          wrap.appendChild(el('span', 'mmset-label', it.label));
          const opts2 = el('span', 'mmset-opts');
          it.choices.forEach((c) => {
            const b = el('button', 'mmset-opt mm8-btn', SCALE_LABEL[c] || String(c));
            b.type = 'button';
            b.setAttribute('data-value', String(c));
            b.addEventListener('click', () => change(it.id, c));
            opts2.appendChild(b);
          });
          wrap.appendChild(opts2);
          ctrls[it.id] = wrap;
          sec.appendChild(wrap);
        }
      });
      if (g.id === 'help') {
        const dl = el('dl', 'mmset-keys');
        dl.id = 'mmset-keys';
        CONTROLS.forEach((c) => {
          const row = el('div', 'mmset-key');
          row.appendChild(el('dt', '', c[0]));
          row.appendChild(el('dd', '', c[1]));
          dl.appendChild(row);
        });
        sec.appendChild(dl);
        const fbHost = el('div', 'mmset-fb');
        fbHost.id = 'mmset-fb';
        sec.appendChild(fbHost);
        if (o.feedback !== false && win.MMFeedback && typeof win.MMFeedback.mount === 'function') {
          win.MMFeedback.mount(fbHost, { page: o.page || 'settings', storage: o.storage });
        }
      }
      scroll.appendChild(sec);
    });
    // Keys typed in the panel never reach page hotkeys (same P0 rule as the feedback box). Esc closes; Tab stays inside (focus trap).
    // Esc / Tab are read in the capture phase so they also work from inside the feedback box (which stops its own key events).
    ['keydown', 'keyup', 'keypress'].forEach((t) => dlg.addEventListener(t, (e) => e.stopPropagation()));
    dlg.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') { e.preventDefault(); close(); return; }
      if (e.key !== 'Tab') return;
      const f = Array.from(dlg.querySelectorAll('button, textarea, [href], input, select, [tabindex]:not([tabindex="-1"])'))
        .filter((x) => !x.disabled && x.offsetParent !== null);
      if (!f.length) return;
      const first = f[0], last = f[f.length - 1];
      if (e.shiftKey && doc.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && doc.activeElement === last) { e.preventDefault(); first.focus(); }
    }, true);
    closeBtn.addEventListener('click', () => close());
    back.addEventListener('click', () => close());
    function open() {
      sync();
      lastFocus = doc.activeElement;
      back.hidden = false; dlg.hidden = false;
      try { closeBtn.focus(); } catch (e) { /* ignore */ }
    }
    function close() {
      if (dlg.hidden) return;
      back.hidden = true; dlg.hidden = true;
      try { if (lastFocus && lastFocus.focus) lastFocus.focus(); } catch (e) { /* ignore */ }
    }
    doc.body.appendChild(back);
    doc.body.appendChild(dlg);
    sync();
    panel = { el: dlg, open: open, close: close, isOpen: () => !dlg.hidden, refresh: sync, read: () => read(storage) };
    return panel;
  }

  // toast(msg, ms): a small 8-bit banner at the bottom centre, above game controls' safe area; polite live region.
  function toast(msg, ms) {
    if (!win || !win.document) return null;
    const doc = win.document;
    ensureCss(doc);
    let host = doc.getElementById('mm8-toasts');
    if (!host) {
      host = doc.createElement('div');
      host.id = 'mm8-toasts';
      host.className = 'mm8-toasts';
      host.setAttribute('role', 'status');
      host.setAttribute('aria-live', 'polite');
      doc.body.appendChild(host);
    }
    const t = doc.createElement('div');
    t.className = 'mm8-toast';
    t.textContent = String(msg == null ? '' : msg).slice(0, 140);
    host.appendChild(t);
    while (host.children.length > 3) host.removeChild(host.firstChild);
    win.setTimeout(() => { if (t.parentNode) t.parentNode.removeChild(t); }, Math.max(800, +ms || 2600));
    return t;
  }

  if (win && win.document && typeof win.localStorage !== 'undefined') {
    try { apply(win.document, win.localStorage); } catch (e) { /* ignore */ }
  }
  return {
    ACCESS_KEY: ACCESS_KEY, SCALES: SCALES.slice(), GROUPS: GROUPS, CONTROLS: CONTROLS,
    ITEMS: ITEMS.map((it) => ({ id: it.id, group: it.group, label: it.label, type: it.type })),
    read: read, set: set, apply: apply, mount: mount, toast: toast
  };
}));
