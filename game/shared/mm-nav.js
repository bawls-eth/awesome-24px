// MMNav: one shared "Menu" button + "Where to?" sheet for every page (design/NAV-AUDIT.md 4.1-4.3).
// UMD: browser global MMNav, or require() in node (no DOM is touched at load time).
//
// Safety: no network calls, no Firebase, no net.js. The only storage it reads or writes is the
// additive key `pixeltown-nav-v1` (never `pixeltown-save-v1`). DOM is built with textContent only.
//
// Page snippet (paths relative to the page; this one is for game/games/jam/index.html):
//   <link rel="stylesheet" href="../../shared/mm-nav.css">
//   <script src="../../shared/mm-nav.js" data-page="jam"></script>
// The script auto-mounts on DOMContentLoaded when data-page is set (use data-mount="manual" to skip
// that and call MMNav.mount(opts) yourself). It does nothing when embedded (window.parent !== window,
// e.g. the Realm inside the Town iframe) or when the URL has ?nav=0.
//
// mount(opts) options (all optional):
//   page       place id from PLACES (default: detected from location; unknown pages get null)
//   sub        sub-place label for Continue, e.g. 'Coral Reef' (see markPlace)
//   backHref   fallback Back target (relative to the page) used when the referrer is not a known place
//   backLabel  text for that fallback, shown as "Back to <backLabel>"
//   hideMenu   true = no corner button (the page opens the sheet itself with MMNav.open())
//   offset     {x, y} px added to the corner button position (sets --mm-nav-x / --mm-nav-y)
//   legacy     selector (alias backLegacy): old Hub/Town links that get class mm-nav-legacy
//   avoid      selector: elements that get class mm-nav-avoid (shifted right by --mm-nav-reserve)
//   record     false = do not record this page as the last place (default true)
// CSS variables (set on :root by a page to position it): --mm-nav-top, --mm-nav-left, --mm-nav-x,
// --mm-nav-y, --mm-nav-z (button, default 9000), --mm-nav-sheet-z (default 9100), --mm-nav-btn-w,
// --mm-nav-reserve (room to leave right of the corner: 56px under 480 px wide, 112px above).
// body.mm-nav-on is set while mounted; body.mm-nav-covered hides the button (see setCovered).
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.MMNav = factory();
}(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  const KEY = 'pixeltown-nav-v1';
  const MAX_RAW = 4096;     // stored JSON larger than this is treated as corrupt
  const MAX_SUB = 40;       // sub-place label
  const MAX_URL = 200;      // stored repo-relative URL
  const MAX_T = 1e13;       // timestamps (ms) beyond year 2286 are clamped
  const Q_KEYS = ['isle', 'seed', 'from', 'test', 'map'];  // map=1: the Hub's map view (else its Home screen)  // query keys carried over into a stored URL
  const Q_VAL = /^[A-Za-z0-9_-]{1,24}$/;

  // Page registry: path is relative to the repo root.
  const PLACES = Object.freeze([
    { id: 'town', icon: '🏡', name: 'Town', path: 'game/index.html', desc: 'Walk, chat, fish and build with friends' },
    { id: 'map', icon: '🧭', name: 'World map', path: 'game/hub/index.html', desc: 'Every world on one map; earn medals' },
    { id: 'realm', icon: '🌀', name: 'The Realm', path: 'game/games/mad-maze/index.html?mode=world', desc: 'Big adventure: heroes, loot, dungeons' },
    { id: 'lantern', icon: '🏮', name: 'Lantern Camp', path: 'game/games/mad-maze/lantern.html', desc: 'Your heroes, stash and fountain' },
    { id: 'isles', icon: '🏝️', name: 'Isles', path: 'game/games/isles/index.html', desc: 'Tame creatures, sail between islands' },
    { id: 'jam', icon: '🎸', name: 'Campfire Jam', path: 'game/games/jam/index.html', desc: 'Rhythm game: tap the four lanes' },
    { id: 'bugs', icon: '🦋', name: 'Bug Safari', path: 'game/games/festival/bugs.html', desc: 'Catch bugs in 90-second runs' },
    { id: 'angler', icon: '🎣', name: 'Angler', path: 'game/games/angler/index.html', desc: 'Calm fishing, ponds and a journal' },
    { id: 'deepdelve', icon: '⛏️', name: 'Deepdelve', path: 'game/games/deepdelve/index.html', desc: 'Dig, mine and build underground (3D)' },
    { id: 'stalk', icon: '🥬', name: 'Stalk Market', path: 'game/games/stalk/index.html', desc: 'Buy low, sell high, once a week' },
    { id: 'pop', icon: '🧩', name: 'Pixel Pop', path: 'game/games/pop/index.html', desc: 'Merge twin tiles, chain combos in 90 s' },
    { id: 'dash', icon: '🕯️', name: 'Lantern Dash', path: 'game/games/dash/index.html', desc: 'One-button night run: jump, chase your ghost' },
    { id: 'stack', icon: '🏯', name: 'Stack Tower', path: 'game/games/stack/index.html', desc: 'Drop swinging blocks, land Perfects, build high' },
    { id: 'echo', icon: '🌷', name: 'Echo Garden', path: 'game/games/echo/index.html', desc: 'Calm memory tunes: watch the flowers, sing them back' },
  ].map((p) => Object.freeze(p)));
  // HS1 groups for the "Where to?" sheet (the Hub home screen uses the same three). The World map closes Adventure.
  const GROUPS = Object.freeze([
    Object.freeze({ id: 'adventure', title: 'Adventure', places: Object.freeze(['town', 'realm', 'isles', 'lantern', 'map']) }),
    Object.freeze({ id: 'arcade', title: 'Arcade', places: Object.freeze(['pop', 'dash', 'stack', 'echo', 'jam']) }),
    Object.freeze({ id: 'quick', title: 'Quick games', places: Object.freeze(['angler', 'bugs', 'stalk', 'deepdelve']) }),
  ]);
  const BY_ID = Object.create(null);
  PLACES.forEach((p) => { BY_ID[p.id] = p; });
  const fileOf = (path) => path.split('?')[0];
  const has = (id) => typeof id === 'string' && Object.prototype.hasOwnProperty.call(BY_ID, id);
  const place = (id) => (has(id) ? BY_ID[id] : null);

  // ---------- pure helpers ----------
  const defaults = () => ({ v: 1, last: null, prev: null });

  // Stored URL allow-list: the base file must be a registry file; only Q_KEYS with safe values survive.
  // Returns a repo-relative URL ('game/games/isles/index.html?isle=reef') or null.
  function cleanUrl(url) {
    if (typeof url !== 'string' || !url || url.length > MAX_URL) return null;
    const qi = url.indexOf('?');
    const file = qi < 0 ? url : url.slice(0, qi);
    const p = PLACES.find((x) => fileOf(x.path) === file);
    if (!p) return null;
    const extra = [];
    if (qi >= 0) {
      const seen = Object.create(null);
      url.slice(qi + 1).split('&').forEach((kv) => {
        const eq = kv.indexOf('=');
        const k = eq < 0 ? kv : kv.slice(0, eq);
        const v = eq < 0 ? '' : kv.slice(eq + 1);
        if (Q_KEYS.indexOf(k) >= 0 && !seen[k] && Q_VAL.test(v)) { seen[k] = 1; extra.push(k + '=' + v); }
      });
    }
    if (!extra.length) return p.path;
    return p.path + (p.path.indexOf('?') >= 0 ? '&' : '?') + extra.join('&');
  }
  // Which place a (clean) repo-relative URL belongs to.
  function placeOfUrl(url) {
    const u = cleanUrl(url);
    if (!u) return null;
    const file = fileOf(u);
    return PLACES.find((x) => fileOf(x.path) === file) || null;
  }
  // The realm and the plain arena share one file; both count as the Realm.
  function cleanSub(s) {
    if (typeof s !== 'string') return '';
    // eslint-disable-next-line no-control-regex
    return s.replace(/[\u0000-\u001f\u007f<>]/g, '').trim().slice(0, MAX_SUB);
  }
  function cleanEntry(e) {
    if (!e || typeof e !== 'object' || Array.isArray(e)) return null;
    const id = e.id;
    if (!has(id)) return null;
    let url = cleanUrl(e.url);
    if (!url || placeOfUrl(url).id !== id) url = BY_ID[id].path;
    let t = Number(e.t);
    if (!Number.isFinite(t) || t < 0) t = 0;
    if (t > MAX_T) t = MAX_T;
    return { id, sub: cleanSub(e.sub), url, t: Math.floor(t) };
  }
  // Any input (corrupt, hostile, a JSON string) -> a fresh, valid state built from literal keys only.
  function clean(v) {
    if (typeof v === 'string') {
      if (v.length > MAX_RAW) return defaults();
      try { v = JSON.parse(v); } catch (e) { return defaults(); }
    }
    if (!v || typeof v !== 'object' || Array.isArray(v)) return defaults();
    const out = defaults();
    out.last = cleanEntry(v.last);
    out.prev = out.last ? cleanEntry(v.prev) : null;
    if (out.prev && out.prev.id === out.last.id) out.prev = null;
    return out;
  }
  // Pure: the state after visiting `entry` ({id, sub?, url?}). Same place again updates it in place.
  function record(state, entry, now) {
    const s = clean(state);
    const e = cleanEntry(Object.assign({}, entry, { t: now === undefined ? Date.now() : now }));
    if (!e) return s;
    if (s.last && s.last.id === e.id) {
      if (!e.sub && entry && entry.sub === undefined) e.sub = s.last.sub;
      s.last = e;
    } else {
      s.prev = s.last;
      s.last = e;
    }
    return s;
  }
  // Pure: the Continue entry for a page whose id is `currentId` (null when there is nothing to continue).
  function continueTarget(state, currentId) {
    const s = clean(state);
    if (!s.last || s.last.id === currentId) return null;
    const p = BY_ID[s.last.id];
    const name = p.id === 'map' && !/[?&]map=1(?:&|$)/.test(s.last.url) ? 'Home' : p.name; // the plain Hub URL is its Home screen
    return { id: p.id, icon: p.icon, name, sub: s.last.sub, url: s.last.url,
      label: 'Continue: ' + name + (s.last.sub ? ' - ' + s.last.sub : '') };
  }

  // Path of the current page relative to the repo root, from a location.pathname.
  // Registry files win (longest match); otherwise everything after the last '/game/'.
  function detect(pathname) {
    let path = typeof pathname === 'string' ? pathname.split('?')[0].split('#')[0] : '';
    try { path = decodeURIComponent(path); } catch (e) { /* keep raw */ }
    if (!path || path.slice(-1) === '/') path += 'index.html';
    const files = PLACES.map((p) => ({ p, f: fileOf(p.path) })).sort((a, b) => b.f.length - a.f.length);
    for (const x of files) {
      if (path === '/' + x.f || path.slice(-(x.f.length + 1)) === '/' + x.f) return { id: x.p.id, file: x.f };
    }
    const k = path.lastIndexOf('/game/');
    if (k >= 0) return { id: null, file: path.slice(k + 1) };
    return { id: null, file: path.replace(/^\/+/, '') };
  }
  // Relative href from repo-relative file `from` to repo-relative URL `to`.
  function relative(from, to) {
    const fd = String(from).split('?')[0].split('/'); fd.pop();
    const tq = String(to).indexOf('?');
    const tp = (tq < 0 ? to : to.slice(0, tq)).split('/');
    const q = tq < 0 ? '' : to.slice(tq);
    let i = 0;
    while (i < fd.length && i < tp.length - 1 && fd[i] === tp[i]) i++;
    let up = '';
    for (let k = i; k < fd.length; k++) up += '../';
    return up + tp.slice(i).join('/') + q;
  }
  // urlFor(target, from): target = place id or a stored URL; from = place id or a repo-relative file path.
  function urlFor(target, from) {
    const to = has(target) ? BY_ID[target].path : cleanUrl(target);
    if (!to) return null;
    const f = has(from) ? fileOf(BY_ID[from].path) : (typeof from === 'string' && from ? from : 'game/index.html');
    return relative(f, to);
  }
  // A page-supplied relative href: no scheme, no protocol-relative, no backslashes, plain characters only.
  function safeHref(h) {
    if (typeof h !== 'string' || !h || h.length > MAX_URL) return null;
    if (/^\/\//.test(h) || h.indexOf(':') >= 0 || h.indexOf('\\') >= 0) return null;
    return /^[A-Za-z0-9_.\/?=&%#-]+$/.test(h) ? h : null;
  }
  // Back target from a referrer (same origin + registry place), else the page fallback, else the Town.
  function backTarget(o) {
    o = o || {};
    const here = o.file || 'game/index.html';
    const ref = typeof o.referrer === 'string' ? o.referrer : '';
    if (ref && o.origin && ref.indexOf(o.origin + '/') === 0) {
      const rest = ref.slice(o.origin.length);
      const qi = rest.indexOf('?');
      const d = detect(qi < 0 ? rest : rest.slice(0, qi));
      if (d.id && d.id !== o.current) {
        const p = BY_ID[d.id];
        const url = cleanUrl(d.file + (qi < 0 ? '' : rest.slice(qi).split('#')[0])) || p.path;
        // The Hub opens on its Home screen; only ?map=1 is the World map view.
        const name = p.id === 'map' ? (/[?&]map=1(?:&|$)/.test(url) ? p.name : 'Home') : p.name;
        return { id: p.id, label: 'Back to ' + name, href: relative(here, url) };
      }
    }
    const h = safeHref(o.backHref);
    if (h) return { id: null, label: 'Back to ' + (cleanSub(o.backLabel) || 'the last page'), href: h };
    // No known previous page: every place goes back to the Home screen (the Hub); the Hub itself goes to the Town.
    if (o.current === 'map') return { id: 'town', label: 'Back to ' + BY_ID.town.name, href: relative(here, BY_ID.town.path) };
    return { id: 'map', label: 'Back to Home', href: relative(here, BY_ID.map.path) };
  }

  // ---------- storage (wrapped: storage may be blocked) ----------
  function store() { try { return typeof localStorage !== 'undefined' ? localStorage : null; } catch (e) { return null; } }
  function load() {
    const ls = store();
    if (!ls) return defaults();
    try { return clean(ls.getItem(KEY)); } catch (e) { return defaults(); }
  }
  function save(s) {
    const ls = store();
    if (!ls) return false;
    try { ls.setItem(KEY, JSON.stringify(clean(s))); return true; } catch (e) { return false; }
  }

  // ---------- DOM (browser only; nothing below runs at load time) ----------
  const script = typeof document !== 'undefined' ? document.currentScript : null;
  const hooks = { open: [], close: [], settings: null };
  let ui = null;      // { root, btn, sheet, ... } when mounted
  let cur = { id: null, file: 'game/index.html' };
  let opts = {};
  let lastFocus = null;

  function embedded() { try { return window.parent !== window; } catch (e) { return true; } }
  function navOff() { try { return /(?:^|[?&])nav=0(?:&|$)/.test(location.search.slice(1)); } catch (e) { return false; } }
  function el(tag, attrs, text) {
    const n = document.createElement(tag);
    if (attrs) Object.keys(attrs).forEach((k) => n.setAttribute(k, attrs[k]));
    if (text !== undefined) n.textContent = text;
    return n;
  }
  function ensureCss() {
    if (document.querySelector('link[href*="mm-nav.css"]') || !script || !script.src) return;
    const l = el('link', { rel: 'stylesheet', href: script.src.replace(/mm-nav\.js(\?.*)?$/, 'mm-nav.css') });
    document.head.appendChild(l);
  }
  function tag(sel, cls) {
    if (typeof sel !== 'string' || !sel) return;
    try { document.querySelectorAll(sel).forEach((n) => n.classList.add(cls)); } catch (e) { /* bad selector */ }
  }
  // The 1 px legacy links leave the tab order and the a11y tree while the Menu is mounted
  // (unmounted pages never call this, so the links keep working there).
  function hideLegacy() {
    document.querySelectorAll('.mm-nav-legacy:not([data-mm-nav-hid])').forEach((n) => {
      n.setAttribute('data-mm-nav-hid', n.hasAttribute('tabindex') ? n.getAttribute('tabindex') : '');
      n.setAttribute('tabindex', '-1');
      n.setAttribute('aria-hidden', 'true');
    });
  }
  function row(id, icon, label, href, cls) {
    const a = el('a', { id, class: 'mm-nav-row ' + (cls || ''), href });
    a.appendChild(el('span', { class: 'mm-nav-ico', 'aria-hidden': 'true' }, icon));
    a.appendChild(el('span', { class: 'mm-nav-row-label' }, label));
    return a;
  }

  // "World map" opens the Hub's map view (?map=1); the plain Hub URL is the Home screen.
  function mapHref() { return urlFor('map', cur.file) + '?map=1'; }
  function build() {
    const rootEl = el('div', { id: 'mm-nav-root' });
    let btn = null;
    if (!opts.hideMenu) {
      btn = el('button', { id: 'mm-nav-btn', type: 'button', 'aria-label': 'Menu: where to go', 'aria-haspopup': 'dialog', 'aria-expanded': 'false', 'aria-controls': 'mm-nav-sheet' });
      btn.appendChild(el('span', { class: 'mm-nav-ico', 'aria-hidden': 'true' }, '🧭'));
      btn.appendChild(el('span', { class: 'mm-nav-btn-label' }, 'Menu'));
      btn.addEventListener('click', () => (ui && ui.isOpen ? close() : open()));
      rootEl.appendChild(btn);
    }
    const backdrop = el('div', { id: 'mm-nav-backdrop', class: 'mm-nav-backdrop', hidden: '' });
    backdrop.addEventListener('click', () => close());
    const sheet = el('div', { id: 'mm-nav-sheet', class: 'mm-nav-sheet', role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'mm-nav-title', hidden: '' });
    const head = el('div', { class: 'mm-nav-head' });
    head.appendChild(el('h2', { id: 'mm-nav-title', class: 'mm-nav-title' }, 'Where to?'));
    const x = el('button', { id: 'mm-nav-close', type: 'button', class: 'mm-nav-close', 'aria-label': 'Close' }, '✕');
    x.addEventListener('click', () => close());
    head.appendChild(x);
    sheet.appendChild(head);

    const top = el('div', { class: 'mm-nav-top' });
    sheet.appendChild(top);
    // HS1: the places in the same three groups as the Hub home screen (Adventure / Arcade / Quick games), pixel cards.
    // Every registry place is still listed exactly once (a place missing from GROUPS lands in the last group).
    const listed = Object.create(null);
    GROUPS.forEach((g) => g.places.forEach((id) => { listed[id] = 1; }));
    const grids = GROUPS.map((g, gi) => {
      const sec = el('section', { class: 'mm-nav-group', 'data-group': g.id, 'aria-labelledby': 'mm-nav-g-' + g.id });
      sec.appendChild(el('h3', { id: 'mm-nav-g-' + g.id, class: 'mm-nav-group-title' }, g.title));
      const ul = el('ul', { class: 'mm-nav-grid', 'aria-label': g.title });
      sec.appendChild(ul);
      sheet.appendChild(sec);
      return { ids: gi === GROUPS.length - 1 ? g.places.concat(PLACES.map((p) => p.id).filter((id) => !listed[id])) : g.places, ul };
    });
    grids.forEach((gr) => gr.ids.forEach((id) => {
      const p = BY_ID[id];
      if (!p) return;
      const grid = gr.ul;
      const li = el('li');
      const a = el('a', { class: 'mm-nav-dest', href: p.id === 'map' ? mapHref() : urlFor(p.id, cur.file), 'data-place': p.id });
      if (p.id === cur.id) a.setAttribute('aria-current', 'page');
      a.appendChild(el('span', { class: 'mm-nav-ico', 'aria-hidden': 'true' }, p.icon));
      const t = el('span', { class: 'mm-nav-dest-text' });
      t.appendChild(el('span', { class: 'mm-nav-dest-name' }, p.name));
      t.appendChild(el('span', { class: 'mm-nav-dest-desc' }, p.desc));
      a.appendChild(t);
      li.appendChild(a);
      grid.appendChild(li);
    }));

    const foot = el('div', { class: 'mm-nav-foot' });
    const mapA = el('a', { id: 'mm-nav-map', class: 'mm-nav-foot-btn', href: mapHref() }, '🧭 World map');
    foot.appendChild(mapA);
    const set = el('button', { id: 'mm-nav-settings', type: 'button', class: 'mm-nav-foot-btn' }, '⚙ Settings');
    set.addEventListener('click', () => { close(); openSettings(); });
    foot.appendChild(set);
    const x2 = el('button', { id: 'mm-nav-close2', type: 'button', class: 'mm-nav-foot-btn' }, '✕ Close');
    x2.addEventListener('click', () => close());
    foot.appendChild(x2);
    sheet.appendChild(foot);

    rootEl.appendChild(backdrop);
    rootEl.appendChild(sheet);
    document.body.appendChild(rootEl);
    return { root: rootEl, btn, backdrop, sheet, top, set, isOpen: false };
  }

  function fillTop() {
    while (ui.top.firstChild) ui.top.removeChild(ui.top.firstChild);
    const back = backTarget({ referrer: document.referrer, origin: location.origin, file: cur.file, current: cur.id, backHref: opts.backHref, backLabel: opts.backLabel });
    const c = opts._continue;
    if (c) {
      const href = urlFor(c.url, cur.file);
      if (href && href !== back.href) ui.top.appendChild(row('mm-nav-continue', c.icon, c.label, href, 'mm-nav-continue'));
    }
    ui.top.appendChild(row('mm-nav-back', '←', back.label, back.href, 'mm-nav-back'));
  }

  function focusables() {
    return Array.prototype.filter.call(ui.sheet.querySelectorAll('a[href],button:not([disabled])'), (n) => !n.hidden && n.offsetParent !== null);
  }
  function onKey(e) {
    if (!ui || !ui.isOpen) return;
    if (e.key === 'Escape' || e.key === 'Esc') { e.preventDefault(); e.stopImmediatePropagation(); close(); return; }
    if (e.key === 'Tab') {
      const f = focusables();
      if (!f.length) { e.preventDefault(); return; }
      const i = f.indexOf(document.activeElement);
      if (e.shiftKey && (i <= 0)) { e.preventDefault(); f[f.length - 1].focus(); }
      else if (!e.shiftKey && (i < 0 || i === f.length - 1)) { e.preventDefault(); f[0].focus(); }
    }
    e.stopImmediatePropagation();  // the game behind the sheet does not see keys while it is open
  }
  // keyup is NOT swallowed (review N1): a key held when the sheet opened must still reach the page on release, or the game
  // behind keeps it "down" after the sheet closes (the Town player walked on by itself). Only keydown acts, so keyup is harmless.

  // Gamepad while the sheet is open (CONTROLS.md: d-pad / left stick move, A = confirm, B or Start = back). Polled only
  // while open, edge-triggered; the first pad state is taken as "already held" so the Start press that opened the sheet
  // does not close it again on the next frame.
  let padRaf = 0, padPrev = null;
  function readPad() {
    let gp = null;
    try { const l = navigator.getGamepads ? navigator.getGamepads() : []; for (let i = 0; l && i < l.length; i++) if (l[i]) { gp = l[i]; break; } } catch (e) { return null; }
    if (!gp) return null;
    const bt = (i) => !!(gp.buttons && gp.buttons[i] && (gp.buttons[i].pressed || gp.buttons[i].value > 0.5));
    const ax = (i) => (gp.axes && Number.isFinite(gp.axes[i]) ? gp.axes[i] : 0);
    return { up: bt(12) || ax(1) < -0.6, down: bt(13) || ax(1) > 0.6, left: bt(14) || ax(0) < -0.6, right: bt(15) || ax(0) > 0.6, a: bt(0), b: bt(1), start: bt(9) };
  }
  function padLoop() {
    padRaf = 0;
    if (!ui || !ui.isOpen) { padPrev = null; return; }
    const p = readPad();
    if (p && padPrev) {
      const hit = (k) => p[k] && !padPrev[k];
      if (hit('b') || hit('start')) { padPrev = null; close(); return; }
      const step = hit('down') || hit('right') ? 1 : hit('up') || hit('left') ? -1 : 0;
      if (step) {
        const f = focusables();
        if (f.length) { const i = f.indexOf(document.activeElement); f[(i < 0 ? 0 : (i + step + f.length) % f.length)].focus(); }
      }
      if (hit('a')) { const a = document.activeElement; if (a && ui.sheet.contains(a) && a.click) a.click(); }
    }
    padPrev = p || { up: false, down: false, left: false, right: false, a: false, b: false, start: false };
    if (ui && ui.isOpen && typeof requestAnimationFrame === 'function') padRaf = requestAnimationFrame(padLoop);
  }

  function open() {
    if (!ui) return false;
    if (ui.isOpen) return true;
    document.querySelectorAll('.mm-nav-sheet:not([hidden])').forEach((n) => { if (n !== ui.sheet) n.hidden = true; });
    fillTop();
    lastFocus = document.activeElement;
    ui.backdrop.hidden = false;
    ui.sheet.hidden = false;
    ui.isOpen = true;
    document.body.classList.add('mm-nav-open');
    if (ui.btn) ui.btn.setAttribute('aria-expanded', 'true');
    const first = ui.sheet.querySelector('#mm-nav-continue') || ui.sheet.querySelector('#mm-nav-back');
    if (first) first.focus();
    padPrev = readPad();
    if (!padRaf && typeof requestAnimationFrame === 'function') padRaf = requestAnimationFrame(padLoop);
    hooks.open.forEach((fn) => { try { fn(); } catch (e) { /* page hook */ } });
    return true;
  }
  function close() {
    if (!ui || !ui.isOpen) return false;
    ui.isOpen = false;
    ui.sheet.hidden = true;
    ui.backdrop.hidden = true;
    document.body.classList.remove('mm-nav-open');
    if (ui.btn) ui.btn.setAttribute('aria-expanded', 'false');
    const back = ui.btn || lastFocus;
    if (back && back.focus && document.contains(back)) back.focus();
    hooks.close.forEach((fn) => { try { fn(); } catch (e) { /* page hook */ } });
    return true;
  }

  // ---------- Settings (SETTINGS-WIRING.md) ----------
  // The Menu's Settings entry works on every page. Order: the shared panel when the page has mounted it itself
  // (MMSettings.mount -> #mmset), else the page's own hook (MMNav.onSettings: Town settings, Isles log, Realm access sheet),
  // else the shared panel, loaded on demand from next to mm-nav.js (mm-feedback.js for its Help box, then mm-settings.js).
  let setLoading = false;
  function sharedDir() {
    if (!script || !script.src) return null;
    const m = /^(.*\/)mm-nav\.js(?:\?.*)?$/.exec(script.src);
    return m ? m[1] : null;
  }
  function addScript(src, done) {
    const s = document.createElement('script');
    s.src = src;
    s.onload = () => done(true);
    s.onerror = () => done(false);
    document.head.appendChild(s);
  }
  function openShared() {
    const S = window.MMSettings;
    if (!S || typeof S.mount !== 'function') return false;
    try {
      const p = S.mount({ page: cur.id || 'page' });
      if (p && p.open) { p.open(); return true; }
    } catch (e) { /* a broken panel must not break the menu */ }
    return false;
  }
  // openSettings() -> 'shared' | 'page' | 'loading' | false
  function openSettings() {
    if (typeof document === 'undefined') return false;
    if (window.MMSettings && document.getElementById('mmset') && openShared()) return 'shared';
    if (hooks.settings) { try { hooks.settings(); } catch (e) { /* page hook */ } return 'page'; }
    if (window.MMSettings) return openShared() ? 'shared' : false;
    const dir = sharedDir();
    if (!dir || setLoading) return setLoading ? 'loading' : false;
    setLoading = true;
    const last = () => addScript(dir + 'mm-settings.js', () => { setLoading = false; openShared(); });
    if (window.MMFeedback) last(); else addScript(dir + 'mm-feedback.js', last);
    return 'loading';
  }

  // mount(opts) -> true when the nav is on the page, false when it stays off (embedded, ?nav=0, no DOM).
  function mount(o) {
    if (typeof document === 'undefined' || typeof window === 'undefined') return false;
    if (ui) return true;
    if (embedded() || navOff()) return false;
    if (!document.body) { document.addEventListener('DOMContentLoaded', () => mount(o), { once: true }); return 'pending'; }
    opts = Object.assign({}, o || {});
    const d = detect(location.pathname);
    cur = { id: has(opts.page) ? opts.page : d.id, file: d.file };
    const s = load();
    opts._continue = continueTarget(s, cur.id);
    if (cur.id && opts.record !== false) {
      const q = cleanUrl(fileOf(BY_ID[cur.id].path) + location.search);
      save(record(s, { id: cur.id, sub: opts.sub, url: q || BY_ID[cur.id].path }));
    }
    ensureCss();
    const off = opts.offset || {};
    const rs = document.documentElement.style;
    if (Number.isFinite(+off.x)) rs.setProperty('--mm-nav-x', (+off.x) + 'px');
    if (Number.isFinite(+off.y)) rs.setProperty('--mm-nav-y', (+off.y) + 'px');
    tag(opts.legacy || opts.backLegacy, 'mm-nav-legacy');
    tag(opts.avoid, 'mm-nav-avoid');
    ui = build();
    hideLegacy();
    if (typeof MutationObserver === 'function') {
      try { new MutationObserver(hideLegacy).observe(document.body, { childList: true, subtree: true }); } catch (e) { /* ignore */ }
    }
    document.body.classList.add('mm-nav-on');
    window.addEventListener('keydown', onKey, true);
    return true;
  }
  // Record a sub-place for the current page (e.g. the isle), additive storage only.
  function markPlace(id, sub, url) {
    if (!has(id)) return false;
    const entry = { id, sub: sub === undefined ? undefined : sub };
    entry.url = cleanUrl(url) || (cur.id === id && typeof location !== 'undefined' ? cleanUrl(fileOf(BY_ID[id].path) + location.search) : null) || BY_ID[id].path;
    return save(record(load(), entry));
  }
  function setCovered(on) { if (typeof document !== 'undefined' && document.body) document.body.classList.toggle('mm-nav-covered', !!on); }

  if (script && typeof document !== 'undefined') {
    const pg = script.getAttribute('data-page');
    if (pg && script.getAttribute('data-mount') !== 'manual') {
      const go = () => mount({ page: pg, sub: script.getAttribute('data-sub') || undefined, backHref: script.getAttribute('data-back-href') || undefined, backLabel: script.getAttribute('data-back-label') || undefined });
      if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', go, { once: true });
      else go();
    }
  }

  return {
    KEY, PLACES, GROUPS, mount, open, close, markPlace, setCovered, openSettings,
    isOpen: () => !!(ui && ui.isOpen),
    mounted: () => !!ui,
    current: () => Object.assign({}, cur),
    last: () => load().last,
    state: load,
    onOpen: (fn) => { if (typeof fn === 'function') hooks.open.push(fn); },
    onClose: (fn) => { if (typeof fn === 'function') hooks.close.push(fn); },
    onSettings: (fn) => { hooks.settings = typeof fn === 'function' ? fn : null; },
    // pure
    place, urlFor, relative, detect, cleanUrl, clean, record, continueTarget, backTarget, safeHref,
    LIMITS: Object.freeze({ MAX_RAW, MAX_SUB, MAX_URL, MAX_T }),
  };
}));
