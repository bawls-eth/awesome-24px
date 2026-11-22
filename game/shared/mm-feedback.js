// MMFeedback: a "Suggest or report a bug" box for settings panels. Stores notes on THIS DEVICE ONLY in
// localStorage key pixeltown-feedback-v1 and lets the player Copy or Download them as one JSON export
// ({v:1, app:'pixeltown', entries:[...]}) to send to the game owner by hand. It never touches the network
// (no fetch, XHR, WebSocket, beacon, form post) and never writes to Firebase. User text is untrusted: the UI
// only ever sets textContent / value, never innerHTML.
// Owner/agent workflow: game/tools/feedback-triage/README.md.
// UMD: browser global MMFeedback, or require() in node (pure functions only there).
//
// Page usage:
//   <link rel="stylesheet" href="../shared/mm-feedback.css">   (optional: mount() adds it if missing)
//   <script src="../shared/mm-feedback.js"></script>
//   MMFeedback.mount(document.getElementById('settings-body'), { page: 'realm' });
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(null);
  else root.MMFeedback = factory(root);
}(typeof self !== 'undefined' ? self : this, function (win) {
  const KEY = 'pixeltown-feedback-v1';
  const APP = 'pixeltown';
  const MAX_ENTRIES = 20;
  const MAX_TEXT = 500;
  const MAX_PAGE = 32;
  const MAX_PARSE_ENTRIES = 200; // a pasted or merged export may hold several devices' worth
  const MAX_INPUT = 300000; // characters of raw export text we are willing to parse
  const KINDS = ['suggestion', 'bug', 'other'];
  const KIND_LABEL = { suggestion: 'Suggestion', bug: 'Bug', other: 'Other' };
  const ID_RE = /^[a-z0-9]{4,24}$/;
  const T_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}Z$/;
  const NOTE = 'Saved on this device only. Use Copy or Download and send it to the game owner; no personal info please.';

  const isObj = (v) => !!v && typeof v === 'object' && !Array.isArray(v);
  const own = (o, k) => Object.prototype.hasOwnProperty.call(o, k);
  const get = (o, k) => (isObj(o) && own(o, k) ? o[k] : undefined);

  function isoMinute(d) {
    const x = d instanceof Date ? d : new Date();
    const s = isNaN(x.getTime()) ? new Date().toISOString() : x.toISOString();
    return s.slice(0, 16) + 'Z';
  }
  function cleanText(s) {
    if (typeof s !== 'string') return '';
    // drop control characters except newline and tab, normalise line ends, collapse runs of blank lines
    const t = s.replace(/\r\n?/g, '\n').replace(/[\u0000-\u0008\u000b-\u001f\u007f​-‏‪-‮⁦-⁩]/g, '')
      .replace(/\n{3,}/g, '\n\n').trim();
    return t.slice(0, MAX_TEXT).trim();
  }
  function cleanPage(s) {
    if (typeof s !== 'string') return 'unknown';
    const p = s.toLowerCase().replace(/[^a-z0-9_\-/.]/g, '').slice(0, MAX_PAGE);
    return p || 'unknown';
  }
  const cleanKind = (k) => (KINDS.indexOf(k) >= 0 ? k : 'other');
  const cleanUa = (u) => (u === 'phone' ? 'phone' : 'desktop');
  function newId(rand) {
    const r = typeof rand === 'function' ? rand : Math.random;
    let s = Date.now().toString(36);
    while (s.length < 14) s += Math.floor(r() * 36).toString(36);
    return s.slice(0, 16);
  }
  const sig = (e) => e.k + '|' + e.page + '|' + e.text.toLowerCase().replace(/\s+/g, ' ');

  // One entry, or null when unusable. Only the six known fields survive.
  function cleanEntry(e) {
    if (!isObj(e)) return null;
    const id = get(e, 'id');
    const text = cleanText(get(e, 'text'));
    if (typeof id !== 'string' || !ID_RE.test(id) || !text) return null;
    const t = get(e, 't');
    return {
      id: id,
      t: typeof t === 'string' && T_RE.test(t) ? t : '1970-01-01T00:00Z',
      k: cleanKind(get(e, 'k')),
      page: cleanPage(get(e, 'page')),
      text: text,
      ua: cleanUa(get(e, 'ua'))
    };
  }
  // List of entries: cleaned, deduped by id and by (kind, page, text), capped (newest kept).
  function cleanList(list, cap) {
    const out = [];
    const ids = {};
    const sigs = {};
    if (!Array.isArray(list)) return out;
    const n = Math.min(list.length, MAX_PARSE_ENTRIES * 2);
    for (let i = 0; i < n; i++) {
      const e = cleanEntry(list[i]);
      if (!e || own(ids, e.id) || own(sigs, sig(e))) continue;
      ids[e.id] = 1; sigs[sig(e)] = 1;
      out.push(e);
    }
    return out.length > cap ? out.slice(out.length - cap) : out;
  }

  // Saved state {v:1, entries:[...]}. Anything corrupt gives the defaults.
  function clean(v) {
    let o = v;
    if (typeof o === 'string') { try { o = JSON.parse(o); } catch (e) { o = null; } }
    return { v: 1, entries: cleanList(get(o, 'entries'), MAX_ENTRIES) };
  }

  // Pure add. input: {k, page, text, ua?, t?, id?}. Returns {ok, state, entry} or {ok:false, state, error, message}.
  function add(state, input, opts) {
    const s = clean(state);
    const o = isObj(input) ? input : {};
    const text = cleanText(o.text);
    if (!text) return { ok: false, state: s, error: 'empty', message: 'Write a few words first.' };
    const entry = {
      id: typeof o.id === 'string' && ID_RE.test(o.id) ? o.id : newId(opts && opts.rand),
      t: typeof o.t === 'string' && T_RE.test(o.t) ? o.t : isoMinute(opts && opts.now),
      k: cleanKind(o.k),
      page: cleanPage(o.page),
      text: text,
      ua: cleanUa(o.ua)
    };
    if (s.entries.some((e) => sig(e) === sig(entry))) return { ok: false, state: s, error: 'duplicate', message: 'That note is already saved.' };
    while (s.entries.some((e) => e.id === entry.id)) entry.id = newId(opts && opts.rand);
    const full = s.entries.length >= MAX_ENTRIES;
    const entries = s.entries.concat([entry]);
    const next = { v: 1, entries: entries.slice(Math.max(0, entries.length - MAX_ENTRIES)) };
    return { ok: true, state: next, entry: entry, dropped: full ? 1 : 0 };
  }
  function remove(state, id) {
    const s = clean(state);
    return { v: 1, entries: s.entries.filter((e) => e.id !== id) };
  }
  function toExport(state) {
    return { v: 1, app: APP, entries: clean(state).entries };
  }
  const exportText = (state) => JSON.stringify(toExport(state), null, 2);

  // Validate an export (string or object). Accepts {v, app:'pixeltown', entries}, a saved state {v, entries},
  // or a bare array of entries. Returns {ok, entries} or {ok:false, error, message, entries:[]}. Never throws.
  function parseExport(input) {
    const fail = (error, message) => ({ ok: false, error: error, message: message, entries: [] });
    try {
      let o = input;
      if (typeof o === 'string') {
        if (o.length > MAX_INPUT) return fail('too-big', 'That export is too big.');
        try { o = JSON.parse(o); } catch (e) { return fail('not-json', 'That is not a feedback export (not JSON).'); }
      }
      let list;
      if (Array.isArray(o)) list = o;
      else if (isObj(o)) {
        const app = get(o, 'app');
        if (app !== undefined && app !== APP) return fail('wrong-app', 'That export is not from Pixeltown.');
        list = get(o, 'entries');
        if (!Array.isArray(list)) return fail('no-entries', 'That export has no entries list.');
      } else return fail('not-an-object', 'That is not a feedback export.');
      if (list.length > MAX_PARSE_ENTRIES * 2) return fail('too-many', 'That export has too many entries.');
      return { ok: true, entries: cleanList(list, MAX_PARSE_ENTRIES) };
    } catch (e) {
      return fail('invalid', 'That is not a feedback export.');
    }
  }

  function load(storage) {
    try { return clean(storage.getItem(KEY)); } catch (e) { return clean(null); }
  }
  function save(storage, state) {
    try { storage.setItem(KEY, JSON.stringify(clean(state))); return true; } catch (e) { return false; }
  }
  function deviceKind(w) {
    try {
      if (w.matchMedia && w.matchMedia('(pointer: coarse)').matches) return 'phone';
      if (w.innerWidth && w.innerWidth < 700) return 'phone';
    } catch (e) { /* ignore */ }
    return 'desktop';
  }

  // ---------- browser UI ----------
  let cssHref = null;
  try {
    const cs = win && win.document && win.document.currentScript;
    if (cs && cs.src) cssHref = cs.src.replace(/mm-feedback\.js(\?.*)?$/, 'mm-feedback.css');
  } catch (e) { cssHref = null; }
  function ensureCss(doc) {
    if (!cssHref || doc.querySelector('link[href$="mm-feedback.css"]') || doc.getElementById('mmfb-css')) return;
    const l = doc.createElement('link');
    l.id = 'mmfb-css'; l.rel = 'stylesheet'; l.href = cssHref;
    (doc.head || doc.documentElement).appendChild(l);
  }
  let uid = 0;

  function mount(container, opts) {
    if (!win || !win.document || !container || typeof container.appendChild !== 'function') return null;
    const doc = win.document;
    const o = opts || {};
    const page = cleanPage(o.page);
    const storage = (() => { try { return o.storage || win.localStorage; } catch (e) { return null; } })();
    const n = ++uid;
    ensureCss(doc);
    const el = (tag, cls, text) => {
      const x = doc.createElement(tag);
      if (cls) x.className = cls;
      if (text !== undefined) x.textContent = text;
      return x;
    };
    let state = storage ? load(storage) : clean(null);
    let kind = 'suggestion';

    const root = el('section', 'mmfb');
    root.setAttribute('data-mmfb', page);
    // The host pages (Town, Realm, Isles) bind game hotkeys on window/document (emotes, walkie, chat focus, WASD): while the player types a note
    // those keys must stay inside the box. Stopping the events at the root keeps every bubbling page handler from seeing them.
    ['keydown', 'keyup', 'keypress'].forEach((t) => root.addEventListener(t, (e) => { e.stopPropagation(); }));
    const head = el('button', 'mmfb-head');
    head.type = 'button';
    head.id = 'mmfb-head-' + n;
    head.setAttribute('aria-expanded', o.open ? 'true' : 'false');
    head.setAttribute('aria-controls', 'mmfb-body-' + n);
    head.appendChild(el('span', 'mmfb-title', 'Suggest or report a bug'));
    const chev = el('span', 'mmfb-chev', o.open ? '▴' : '▾');
    chev.setAttribute('aria-hidden', 'true');
    head.appendChild(chev);
    root.appendChild(head);

    const body = el('div', 'mmfb-body');
    body.id = 'mmfb-body-' + n;
    body.setAttribute('role', 'region');
    body.setAttribute('aria-labelledby', head.id);
    body.hidden = !o.open;
    root.appendChild(body);

    const chips = el('div', 'mmfb-chips');
    chips.setAttribute('role', 'group');
    chips.setAttribute('aria-label', 'Kind of note');
    const chipEls = {};
    KINDS.forEach((k) => {
      const c = el('button', 'mmfb-chip', KIND_LABEL[k]);
      c.type = 'button';
      c.setAttribute('data-kind', k);
      c.setAttribute('aria-pressed', k === kind ? 'true' : 'false');
      c.addEventListener('click', () => { kind = k; KINDS.forEach((j) => chipEls[j].setAttribute('aria-pressed', j === k ? 'true' : 'false')); });
      chipEls[k] = c;
      chips.appendChild(c);
    });
    body.appendChild(chips);

    const label = el('label', 'mmfb-label', 'What should change, or what went wrong?');
    label.htmlFor = 'mmfb-text-' + n;
    body.appendChild(label);
    const ta = el('textarea', 'mmfb-text');
    ta.id = 'mmfb-text-' + n;
    ta.maxLength = MAX_TEXT;
    ta.rows = 4;
    ta.placeholder = 'For example: the Save button is hard to tap on my phone.';
    ta.setAttribute('autocomplete', 'off');
    body.appendChild(ta);
    const row = el('div', 'mmfb-row');
    const counter = el('span', 'mmfb-count', '0 / ' + MAX_TEXT);
    counter.setAttribute('aria-live', 'polite');
    const saveBtn = el('button', 'mmfb-btn mmfb-save', 'Save');
    saveBtn.type = 'button';
    row.appendChild(counter);
    row.appendChild(saveBtn);
    body.appendChild(row);
    const status = el('p', 'mmfb-status');
    status.setAttribute('role', 'status');
    status.setAttribute('aria-live', 'polite');
    body.appendChild(status);

    const listHead = el('p', 'mmfb-sub');
    body.appendChild(listHead);
    const list = el('ul', 'mmfb-list');
    body.appendChild(list);

    const exp = el('div', 'mmfb-row mmfb-export');
    const copyBtn = el('button', 'mmfb-btn mmfb-copy', 'Copy all');
    copyBtn.type = 'button';
    const dlBtn = el('button', 'mmfb-btn mmfb-download', 'Download .json');
    dlBtn.type = 'button';
    exp.appendChild(copyBtn);
    exp.appendChild(dlBtn);
    body.appendChild(exp);
    const fallback = el('textarea', 'mmfb-fallback');
    fallback.readOnly = true;
    fallback.rows = 6;
    fallback.hidden = true;
    fallback.setAttribute('aria-label', 'Feedback export text: select all and copy');
    body.appendChild(fallback);
    body.appendChild(el('p', 'mmfb-note', NOTE));

    const say = (msg) => { status.textContent = msg; };
    const count = () => { counter.textContent = Math.min(ta.value.length, MAX_TEXT) + ' / ' + MAX_TEXT; };
    function render() {
      while (list.firstChild) list.removeChild(list.firstChild);
      listHead.textContent = state.entries.length
        ? 'Saved notes (' + state.entries.length + ' of ' + MAX_ENTRIES + ')'
        : 'No saved notes yet.';
      state.entries.slice().reverse().forEach((e) => {
        const li = el('li', 'mmfb-item');
        li.setAttribute('data-id', e.id);
        const meta = el('span', 'mmfb-meta', KIND_LABEL[e.k] + ' · ' + e.page + ' · ' + e.t.replace('T', ' ').replace('Z', ' UTC'));
        const txt = el('span', 'mmfb-itext', e.text);
        const del = el('button', 'mmfb-btn mmfb-del', 'Delete');
        del.type = 'button';
        del.setAttribute('aria-label', 'Delete note: ' + e.text.slice(0, 40));
        del.addEventListener('click', () => {
          const next = remove(storage ? load(storage) : state, e.id); // review F1: re-read first, so a note another tab saved meanwhile is kept
          if (storage && !save(storage, next)) { say('Could not delete on this device (storage is full or blocked).'); return; }
          state = next;
          render();
          say('Note deleted.');
        });
        li.appendChild(meta);
        li.appendChild(txt);
        li.appendChild(del);
        list.appendChild(li);
      });
      copyBtn.disabled = dlBtn.disabled = !state.entries.length;
    }

    head.addEventListener('click', () => {
      const open = head.getAttribute('aria-expanded') !== 'true';
      head.setAttribute('aria-expanded', open ? 'true' : 'false');
      chev.textContent = open ? '▴' : '▾';
      body.hidden = !open;
    });
    ta.addEventListener('input', count);
    saveBtn.addEventListener('click', () => {
      if (storage) state = load(storage); // another tab may have changed it
      const r = add(state, { k: kind, page: page, text: ta.value, ua: deviceKind(win) });
      if (!r.ok) { say(r.message); return; }
      if (storage && !save(storage, r.state)) { say('Could not save on this device (storage is full or blocked).'); return; }
      state = r.state;
      ta.value = '';
      count();
      render();
      say(r.dropped ? 'Saved. The oldest note was removed to make room (20 max).' : 'Saved on this device.');
    });
    function showFallback(text) {
      fallback.value = text;
      fallback.hidden = false;
      try { fallback.focus(); fallback.select(); } catch (e) { /* ignore */ }
    }
    // review F1: Copy / Download export what storage holds now (another tab may have added or deleted a note).
    const fresh = () => { if (storage) { state = load(storage); render(); } return state; };
    copyBtn.addEventListener('click', () => {
      const text = exportText(fresh());
      const legacy = () => {
        showFallback(text);
        let ok = false;
        try { ok = doc.execCommand && doc.execCommand('copy'); } catch (e) { ok = false; }
        say(ok ? 'Copied. Paste it in a message to the game owner.' : 'Select all the text below and copy it.');
      };
      try {
        const cb = win.navigator && win.navigator.clipboard;
        if (cb && typeof cb.writeText === 'function') {
          cb.writeText(text).then(() => { fallback.hidden = true; say('Copied. Paste it in a message to the game owner.'); }, legacy);
          return;
        }
      } catch (e) { /* fall through */ }
      legacy();
    });
    dlBtn.addEventListener('click', () => {
      const text = exportText(fresh());
      try {
        const blob = new win.Blob([text], { type: 'application/json' });
        const url = win.URL.createObjectURL(blob);
        const a = doc.createElement('a');
        a.href = url;
        a.download = 'pixeltown-feedback-' + isoMinute().slice(0, 10) + '.json';
        a.style.display = 'none';
        doc.body.appendChild(a);
        a.click();
        doc.body.removeChild(a);
        win.setTimeout(() => { try { win.URL.revokeObjectURL(url); } catch (e) { /* ignore */ } }, 4000);
        say('Downloaded. Send the file to the game owner.');
      } catch (e) {
        showFallback(text);
        say('Download is blocked here. Select all the text below and copy it.');
      }
    });
    count();
    render();
    container.appendChild(root);
    return {
      el: root,
      open: () => { if (head.getAttribute('aria-expanded') !== 'true') head.click(); },
      refresh: () => { if (storage) state = load(storage); render(); },
      destroy: () => { if (root.parentNode) root.parentNode.removeChild(root); }
    };
  }

  return {
    KEY: KEY, APP: APP, MAX_ENTRIES: MAX_ENTRIES, MAX_TEXT: MAX_TEXT, KINDS: KINDS.slice(), NOTE: NOTE,
    clean: clean, cleanEntry: cleanEntry, add: add, remove: remove, toExport: toExport, exportText: exportText,
    parseExport: parseExport, load: load, save: save, isoMinute: isoMinute, mount: mount
  };
}));
