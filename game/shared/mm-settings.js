// MMSettings: ONE simple Settings panel for every page (8-bit look, see mm-settings.css and game/design/SETTINGS-WIRING.md).
// Groups: Play (one-thumb, auto-fire, aim assist, bullet shapes), See (text size, reduced motion, screen flashes, low graphics,
// high contrast), Hear (sound, music), Help (controls cheat-sheet + the Feedback box).
// Every setting reads and writes the device keys the games ALREADY use, so nothing is lost or renamed:
//   mm-auto-fire, mm-aim-toggle, mm-aim-assist (default on), mm-bullet-shapes, mm-reduce-motion (MMMotion), mm-sfx-muted (sfx.js),
//   pixeltown-access-v1 {hudScale, flashes, lowGfx} (MMAccess.prefs; other fields such as palette are kept untouched).
// New additive keys: mm-music ('1'/'0'), mm-high-contrast ('1'/'0'), mm-assist (JSON {dmg, aim}, ID-06, cycle 4: S applies it in
// the Realm, U owns these controls). Assist = 'Damage taken' 100..50 % in 6 steps + 'Aim help' Off / Light / Medium / Strong. Never touches the save (pixeltown-save-v1), never the network or Firebase.
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
  // ID-06 assist (device pref, never the save). Absent / hostile values = defaults (100 % damage taken, aim help off).
  const ASSIST_KEY = 'mm-assist';
  const ASSIST_DMG = [100, 90, 80, 70, 60, 50];
  const ASSIST_AIM = [0, 1, 2, 3];
  const AIM_LABEL = ['Off', 'Light', 'Medium', 'Strong'];
  function cleanAssist(o) {
    const x = o && typeof o === 'object' && !Array.isArray(o) ? o : {};
    return { dmg: ASSIST_DMG.indexOf(x.dmg) >= 0 ? x.dmg : 100, aim: ASSIST_AIM.indexOf(x.aim) >= 0 ? x.aim : 0 };
  }
  function readAssist(s) {
    let raw = null;
    try { raw = JSON.parse(s.getItem(ASSIST_KEY)); } catch (e) { raw = null; }
    return cleanAssist(raw);
  }
  function writeAssist(s, field, val) {
    try { const next = Object.assign(readAssist(s), { [field]: val }); s.setItem(ASSIST_KEY, JSON.stringify(cleanAssist(next))); return true; } catch (e) { return false; }
  }
  const assisted = (s) => { const a = readAssist(s); return a.dmg !== 100 || a.aim !== 0; };
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
    // ID-06 (cycle 4): 'steps' = a labelled radio group of 44 px steps with the value in the visible label text.
    { id: 'assist-dmg', group: 'play', label: 'Damage taken', hint: 'Lower = enemies hurt less. Realm and dungeons only.', type: 'steps',
      steps: ASSIST_DMG, stepLabel: (v) => v + '%', valueText: (v) => v + ' percent',
      get: (s) => readAssist(s).dmg, set: (s, v) => ASSIST_DMG.indexOf(v) >= 0 && writeAssist(s, 'dmg', v) },
    { id: 'assist-aim', group: 'play', label: 'Aim help', hint: 'Nudges shots toward the nearest enemy.', type: 'steps',
      steps: ASSIST_AIM, stepLabel: (v) => AIM_LABEL[v], valueText: (v) => AIM_LABEL[v],
      get: (s) => readAssist(s).aim, set: (s, v) => ASSIST_AIM.indexOf(v) >= 0 && writeAssist(s, 'aim', v) },
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
    const v = it.type === 'toggle' ? !!value : it.type === 'steps' ? Number(value) : value;
    return !!it.set(storage, v);
  }
  // apply(doc, storage): mirror the prefs on <html> (CSS hooks). Returns what it applied.
  function apply(doc, storage) {
    const v = read(storage);
    const el = doc && doc.documentElement;
    if (el) {
      el.style.setProperty('--ui-scale', String(v['text-size']));
      if (v['text-size'] >= 1.25) el.setAttribute('data-ui-big', '1'); else el.removeAttribute('data-ui-big'); // layout hook (mm-side-access.js)
      const at = (n, on) => { if (on) el.setAttribute(n, '1'); else el.removeAttribute(n); };
      at('data-reduce-motion', v['reduce-motion'] || !v.flashes);
      if (el.classList) el.classList.toggle('reduce-motion', !!(v['reduce-motion'] || !v.flashes)); // MM8.reducedMotion() reads this class
      at('data-low-gfx', v['low-gfx']);
      at('data-high-contrast', v['high-contrast']);
      try { if (win && win.MMAccess && win.MMAccess.applyContrast) win.MMAccess.applyContrast(doc, storage); } catch (e) { /* attribute above is enough */ }
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

  // mount(opts) -> api. opts: {page, storage, feedback (default true), play (default true: false hides the shooter-only Play group
  // on pages without aiming, e.g. the Hub or the arcade games), onChange(id, value)}. Creates the hidden dialog once per page.
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
    let assistReset = null, assistLive = null;
    function sync() {
      const v = read(storage);
      ITEMS.forEach((it) => {
        const c = ctrls[it.id];
        if (!c) return;
        if (it.type === 'toggle') {
          c.setAttribute('aria-checked', v[it.id] ? 'true' : 'false');
          c.querySelector('.mmset-state').textContent = v[it.id] ? 'ON' : 'OFF';
        } else if (it.type === 'steps') {
          c.querySelectorAll('[role=radio]').forEach((b) => {
            const on = Number(b.getAttribute('data-value')) === v[it.id];
            b.setAttribute('aria-checked', on ? 'true' : 'false');
            b.tabIndex = on ? 0 : -1; // roving tabindex: one Tab stop per group, arrows move inside it
          });
          const val = c.querySelector('.mmset-val');
          if (val) val.textContent = it.stepLabel(v[it.id]);
        } else {
          c.querySelectorAll('button').forEach((b) => b.setAttribute('aria-pressed', Number(b.getAttribute('data-value')) === v[it.id] ? 'true' : 'false'));
        }
      });
      if (assistReset) assistReset.hidden = !(v['assist-dmg'] !== 100 || v['assist-aim'] !== 0);
      apply(doc, storage);
    }
    function change(id, value) {
      set(storage, id, value);
      sync();
      const now = read(storage)[id];
      try { win.dispatchEvent(new win.CustomEvent('mm-settings-change', { detail: { id: id, value: now } })); } catch (e) { /* ignore */ }
      if (typeof o.onChange === 'function') { try { o.onChange(id, now); } catch (e) { /* page bug must not break settings */ } }
    }
    // R4 D4 (b07-r2-09): in the peaceful Town the combat toggles only matter in the Realm arena behind the Realm Gate, so
    // there the group is titled "Realm combat", says where it applies, and sits after See / Hear instead of first.
    const town = o.page === 'town';
    const groups = town ? GROUPS.filter((g) => g.id !== 'play' && g.id !== 'help').concat(GROUPS.filter((g) => g.id === 'play'), GROUPS.filter((g) => g.id === 'help')) : GROUPS;
    groups.forEach((g) => {
      if (g.id === 'play' && o.play === false) return;
      const sec = el('section', 'mmset-group');
      sec.setAttribute('data-group', g.id);
      const h = el('h3', 'mmset-gh', town && g.id === 'play' ? 'Realm combat' : g.title);
      h.id = 'mmset-g-' + g.id;
      sec.setAttribute('aria-labelledby', h.id);
      sec.appendChild(h);
      if (town && g.id === 'play') sec.appendChild(el('p', 'mmset-hint mmset-gnote', 'Only used in the Realm arena (Realm Gate). Nothing here changes the Town.'));
      ITEMS.filter((it) => it.group === g.id).forEach((it) => {
        if (it.type === 'steps') {
          if (it.id === 'assist-dmg') {
            const sh = el('h4', 'mmset-sub', 'Assist');
            sh.id = 'mmset-assist-h';
            sec.appendChild(sh);
            sec.appendChild(el('p', 'mmset-hint mmset-gnote', 'Optional help. Runs with assist get an "Assisted" tag; nothing is hidden or locked.'));
          }
          const wrap = el('div', 'mmset-row mmset-steps');
          wrap.id = 'mmset-' + it.id;
          wrap.setAttribute('data-setting', it.id);
          const lab = el('span', 'mmset-label');
          lab.id = 'mmset-' + it.id + '-label';
          lab.appendChild(doc.createTextNode(it.label + ': '));
          lab.appendChild(el('span', 'mmset-val', ''));
          wrap.appendChild(lab);
          const hint = el('span', 'mmset-hint', it.hint);
          hint.id = 'mmset-' + it.id + '-hint';
          wrap.appendChild(hint);
          const rg = el('div', 'mmset-opts mmset-radios');
          rg.setAttribute('role', 'radiogroup');
          rg.setAttribute('aria-labelledby', lab.id);
          rg.setAttribute('aria-describedby', hint.id);
          const pick = (v, focus) => {
            change(it.id, v);
            const b = rg.querySelector('[data-value="' + v + '"]');
            if (focus && b) b.focus();
            if (assistLive) assistLive.textContent = it.label + ' ' + it.valueText(v);
          };
          it.steps.forEach((v, i) => {
            const b = el('button', 'mmset-opt mmset-step mm8-btn', it.stepLabel(v));
            b.type = 'button';
            b.setAttribute('role', 'radio');
            b.setAttribute('data-value', String(v));
            b.setAttribute('aria-label', it.valueText(v));
            b.addEventListener('click', () => pick(v, false));
            b.addEventListener('keydown', (e) => {
              const n = it.steps.length;
              const to = { ArrowRight: i + 1, ArrowDown: i + 1, ArrowLeft: i - 1, ArrowUp: i - 1, Home: 0, End: n - 1 }[e.key];
              if (to === undefined) return;
              e.preventDefault();
              pick(it.steps[Math.max(0, Math.min(n - 1, to))], true);
            });
            rg.appendChild(b);
          });
          wrap.appendChild(rg);
          ctrls[it.id] = wrap;
          sec.appendChild(wrap);
          if (it.id === 'assist-aim') {
            assistReset = el('button', 'mmset-opt mmset-assist-reset mm8-btn', 'Reset assist');
            assistReset.type = 'button';
            assistReset.id = 'mmset-assist-reset';
            assistReset.addEventListener('click', () => {
              change('assist-dmg', 100); change('assist-aim', 0);
              if (assistLive) assistLive.textContent = 'Assist reset: damage taken 100 percent, aim help off';
              try { ctrls['assist-dmg'].querySelector('[aria-checked="true"]').focus(); } catch (e) { /* ignore */ }
            });
            sec.appendChild(assistReset);
            assistLive = el('span', 'mmset-sr');
            assistLive.id = 'mmset-assist-live';
            assistLive.setAttribute('role', 'status');
            assistLive.setAttribute('aria-live', 'polite');
            sec.appendChild(assistLive);
          }
          return;
        }
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

  // ID-06 'Assisted' tag for run summaries / death cards (S places it; text, never colour alone). Returns the span or null.
  function assistTag(doc, storage) {
    const d = doc || (win && win.document);
    if (!d) return null;
    ensureCss(d);
    const t = d.createElement('span');
    t.className = 'mm-assisted-tag';
    t.textContent = 'Assisted';
    let a = { dmg: 100, aim: 0 };
    try { a = readAssist(storage || win.localStorage); } catch (e) { /* defaults */ }
    const bits = [];
    if (a.dmg !== 100) bits.push('damage taken ' + a.dmg + ' percent');
    if (a.aim) bits.push('aim help ' + AIM_LABEL[a.aim]);
    t.setAttribute('title', 'Played with assist' + (bits.length ? ': ' + bits.join(', ') : ''));
    return t;
  }

  // beta S-05/S-10: reading win.localStorage throws (SecurityError) when site data is blocked: probe it inside the try
  if (win && win.document) {
    try { if (typeof win.localStorage !== 'undefined') apply(win.document, win.localStorage); } catch (e) { /* ignore */ }
  }
  return {
    ACCESS_KEY: ACCESS_KEY, SCALES: SCALES.slice(), GROUPS: GROUPS, CONTROLS: CONTROLS,
    ITEMS: ITEMS.map((it) => ({ id: it.id, group: it.group, label: it.label, type: it.type })),
    read: read, set: set, apply: apply, mount: mount, toast: toast,
    ASSIST_KEY: ASSIST_KEY, ASSIST_DMG: ASSIST_DMG.slice(), ASSIST_AIM: ASSIST_AIM.slice(), AIM_LABEL: AIM_LABEL.slice(),
    readAssist: readAssist, cleanAssist: cleanAssist, assisted: assisted, assistTag: assistTag
  };
}));
