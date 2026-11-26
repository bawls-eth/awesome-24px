// Accessibility + viewport sweep (bug bash lane "a11y"). Visits every page of the game at 9 viewports (195x422 added in cycle 7, 160x284 in cycle 11) and checks the list in
// game/design/bugbash/a11y-viewports.md. DB-safe: blockDb(ctx) on every context; the Town is entered ONLY through the offline stub
// ('Play offline' with the Firebase SDK answered empty). No chat, nothing written to Firebase.
//
// Offenders are compared against game/tests/fixtures/a11y-allow.json, keyed "page|check|key". The allow-list may only SHRINK:
//   - an offender that is NOT in the list fails the test (a regression);
//   - a list entry that no longer occurs also fails (somebody fixed it: delete the entry, or run with A11Y_PRUNE=1).
// A11Y_SEED=1 rewrites the list from the current offenders (first run only, reviewed in the diff). A11Y_REPORT=1 rewrites the
// OFFENDERS region of game/design/bugbash/a11y-viewports.md. Env: PAGES=hub,pop (filter), VPS=390x844 (filter).
// Run: python3 -m http.server 9438 &  BASE=http://localhost:9438/game/index.html NODE_PATH=$(npm root -g) node game/tests/a11y-viewport-sweep.test.js
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const { check, done, blockDb, offlineStub } = require('./helpers');
const BASE = process.env.BASE || 'http://localhost:9438/game/index.html';
const ORIGIN = new URL(BASE).origin;
const ALLOW_FILE = path.join(__dirname, 'fixtures', 'a11y-allow.json');
const REPORT_FILE = path.join(__dirname, '..', 'design', 'bugbash', 'a11y-viewports.md');

const VIEWPORTS = [
  { id: '320x568', w: 320, h: 568, touch: true }, { id: '360x640', w: 360, h: 640, touch: true }, { id: '390x844', w: 390, h: 844, touch: true },
  { id: '414x896', w: 414, h: 896, touch: true }, { id: '667x375', w: 667, h: 375, touch: true }, { id: '768x1024', w: 768, h: 1024, touch: true },
  { id: '1920x1080', w: 1920, h: 1080, touch: false },
  // cyc7-ui: the narrowest phone width we support (also 200% zoom on a 390 phone). Cycle 6 found 36 text-size offenders here.
  { id: '195x422', w: 195, h: 422, touch: true },
  // cyc11-lead: a 320 px phone at 200% zoom. Opt-in in cycle 10 (EXTRA_VPS) because it found 4 offenders outside the allow-list (Isles Map
  // button under the Menu, Festival Bugs 193 px sideways scroll, Angler title 0 px wide, Echo board 32x36); those are fixed in the pages'
  // CSS, so it is a default viewport now. Cost measured in cycle 11: see game/design/beta/cycle11-lead.md.
  { id: '160x284', w: 160, h: 284, touch: true }
];
// EXTRA_VPS=<id> adds an opt-in viewport from this list (none right now; park a new size here until its offenders are fixed).
const EXTRA_VIEWPORTS = [];
EXTRA_VIEWPORTS.filter((v) => new Set((process.env.EXTRA_VPS || '').split(',')).has(v.id)).forEach((v) => VIEWPORTS.push(v));
const PROFILE = { v: 1, heroes: [{ id: 'h1', name: 'Fern', cls: 'druid', level: 7, xp: 10, items: [] }], stash: [], fame: 0, mode: 'classic', hall: [] };
const SEED = {
  'pixeltown-mm-v1': JSON.stringify(PROFILE), 'pixeltown-mm-active-v1': JSON.stringify({ v: 1, heroId: 'h1' }),
  'pixeltown-nav-v1': JSON.stringify({ v: 1, last: null, prev: null })
};
const G = (p) => ORIGIN + '/game/games/' + p;
// lane = owning lane of the page file; primary = regex of the first action (keyboard-only completion)
const PAGES = [
  { id: 'hub-home', lane: 'hub', url: ORIGIN + '/game/hub/index.html', primary: /^(play|continue|▶)/i },
  { id: 'hub-map', lane: 'hub', url: ORIGIN + '/game/hub/index.html?map=1', primary: /play|enter|go|visit|open/i },
  { id: 'town', lane: 'town', url: ORIGIN + '/game/index.html', town: true },
  // cyc12-lead: the Town with the Museum dialog open (cycle 11 U: tabs 29 px, the compass on the card at 195x422; none of it was seen
  // because the sweep never opened a Town panel). Same offline entry as 'town', then the scene's own openMuseum().
  { id: 'town-museum', lane: 'town', url: ORIGIN + '/game/index.html', town: true, open: 'openMuseum', dialog: '#museum-overlay' },
  { id: 'realm-world', lane: 'realm', url: G('mad-maze/index.html?mode=world&test=1&seed=12345'), primary: /start|play|enter|begin|go|continue|ready/i },
  { id: 'realm-dungeon', lane: 'realm', url: G('mad-maze/index.html?mode=dungeon&test=1&seed=5'), primary: /start|play|enter|begin|go|continue|ready/i },
  { id: 'isles', lane: 'isles', url: G('isles/index.html?isle=reef'), primary: /start|play|set sail|sail|enter|begin|go|explore|launch|continue/i },
  { id: 'lantern', lane: 'lantern', url: G('mad-maze/lantern.html?test=1'), primary: /play|start|light|begin|enter|go|new|continue|descend/i },
  { id: 'festival-bugs', lane: 'bugs', url: G('festival/bugs.html'), primary: /play|start|begin|go|catch|safari|enter/i },
  { id: 'angler', lane: 'angler', url: G('angler/index.html'), primary: /cast|play|start|fish|begin|go|enter/i },
  { id: 'dash', lane: 'dash', url: G('dash/index.html'), primary: /play|start|go|run|begin|tap/i },
  { id: 'deepdelve', lane: 'deepdelve', url: G('deepdelve/index.html'), primary: /dive|play|start|begin|go|enter|delve/i },
  { id: 'echo', lane: 'echo', url: G('echo/index.html'), primary: /play|start|begin|go|listen|enter/i },
  { id: 'jam', lane: 'jam', url: G('jam/index.html'), primary: /play|start|jam|begin|go|song|enter|sing|practice|concert/i },
  { id: 'pop', lane: 'pop', url: G('pop/index.html'), primary: /play|start|go|begin|pop/i },
  { id: 'stack', lane: 'stack', url: G('stack/index.html'), primary: /play|start|go|begin|stack/i },
  { id: 'stalk', lane: 'stalk', url: G('stalk/index.html'), primary: /play|start|open|begin|go|buy|sell|enter/i }
];
const only = (v) => (v ? new Set(v.split(',')) : null);
const PAGE_F = only(process.env.PAGES), VP_F = only(process.env.VPS), PREF_F = only(process.env.PREFS); // cyc2: PREFS=text-200 runs only that preference pass

// ---------------- in-page audit (runs in every page; returns plain data) ----------------
const AUDIT = () => {
  const out = [];
  const add = (check, key, detail, extra) => out.push(Object.assign({ check, key, detail }, extra || {}));
  const sel = (e) => {
    if (!e || e === document.body) return 'body';
    if (e.id) return '#' + e.id;
    const parts = [];
    let n = e;
    for (let i = 0; n && n.nodeType === 1 && n !== document.body && i < 3; i++, n = n.parentElement) {
      let s = n.tagName.toLowerCase();
      if (n.id) { parts.unshift('#' + n.id); break; }
      const cl = (n.getAttribute('class') || '').trim().split(/\s+/).filter((c) => c && !/^(is-|on$|active|show|hidden)/.test(c)).slice(0, 2);
      if (cl.length) s += '.' + cl.join('.');
      parts.unshift(s);
    }
    return parts.join(' > ');
  };
  const vw = innerWidth, vh = innerHeight;
  const hidden = (e) => {
    for (let n = e; n && n.nodeType === 1; n = n.parentElement) {
      const cs = getComputedStyle(n);
      if (cs.display === 'none' || cs.visibility === 'hidden' || n.hidden || n.getAttribute('aria-hidden') === 'true' || n.hasAttribute('inert')) return true;
      if (parseFloat(cs.opacity) === 0) return true;
    }
    return false;
  };
  const shown = (e) => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0 && !hidden(e) && r.right > 0 && r.bottom > 0 && r.left < vw + 400 && r.top < 4000; };
  const FOCUSABLE = 'a[href],button,input:not([type=hidden]),select,textarea,summary,[role=button],[role=link],[role=tab],[role=checkbox],[role=switch],[tabindex]:not([tabindex="-1"])';
  const inter = [...document.querySelectorAll(FOCUSABLE)].filter((e) => !e.disabled && shown(e));
  const isInlineLink = (e) => e.tagName === 'A' && getComputedStyle(e).display === 'inline' && e.parentElement && /^(P|LI|SPAN|DIV|SMALL)$/.test(e.parentElement.tagName) && [...e.parentElement.childNodes].some((c) => c.nodeType === 3 && c.textContent.trim().length > 3);

  // 1. horizontal scroll
  const de = document.documentElement;
  const sw = Math.max(de.scrollWidth, document.body ? document.body.scrollWidth : 0);
  if (sw > vw + 1) {
    const wide = [...document.querySelectorAll('body *')].filter((e) => shown(e) && e.getBoundingClientRect().right > vw + 1 && getComputedStyle(e).position !== 'fixed').slice(0, 3).map(sel);
    add('hscroll', 'page', `scrollWidth ${sw} > viewport ${vw}; wide: ${wide.join(', ') || 'n/a'}`);
  }
  // 2. Menu button
  const nav = document.getElementById('mm-nav-btn') || document.getElementById('where-to-btn'); // the Town keeps one HUD: its Menu is "Where to?"
  if (!nav) add('menu', 'missing', 'no #mm-nav-btn (or Town #where-to-btn) on the page');
  else {
    const r = nav.getBoundingClientRect(), cs = getComputedStyle(nav);
    if (r.width === 0 || cs.display === 'none' || cs.visibility === 'hidden') {
      // cyc12-lead: a page may hide the Menu only while a modal dialog is open (the Museum on a phone: the compass lay on the card),
      // and then the dialog must offer its own way out: a close button that is on screen, at least 44 px, and on top at its centre.
      const dlg = [...document.querySelectorAll('[role=dialog][aria-modal="true"]')].find(shown);
      const x = dlg && [...dlg.querySelectorAll('button[aria-label="Close"],button[id$="close-btn"]')].find(shown);
      if (!x) add('menu', 'hidden', 'Menu button not visible' + (dlg ? ' and the open dialog ' + sel(dlg) + ' has no close button' : ''));
      else {
        const b = x.getBoundingClientRect(), t = document.elementFromPoint(b.left + b.width / 2, b.top + b.height / 2);
        if (b.left < 0 || b.top < 0 || b.right > vw || b.bottom > vh || b.width < 43.5 || b.height < 43.5 || !(t === x || x.contains(t))) add('menu', 'hidden-dialog-close', `Menu hidden under ${sel(dlg)} and its close button is ${Math.round(b.width)}x${Math.round(b.height)} at ${Math.round(b.left)},${Math.round(b.top)}${t === x || x.contains(t) ? '' : ', covered'}`);
      }
    }
    else {
      if (r.left < 0 || r.top < 0 || r.right > vw || r.bottom > vh) add('menu', 'offscreen', `rect ${Math.round(r.left)},${Math.round(r.top)} ${Math.round(r.width)}x${Math.round(r.height)} outside ${vw}x${vh}`);
      const top = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
      if (top && top !== nav && !nav.contains(top)) add('menu', 'covered', 'covered at its centre by ' + sel(top));
      inter.forEach((e) => {
        if (e === nav || nav.contains(e) || e.contains(nav) || e.closest('#mm-nav-root')) return;
        const b = e.getBoundingClientRect();
        // R4 D4: a focusable full-screen game view (canvas, role=application, >= half the viewport, the Menu wholly on top of it) is the
        // backdrop every HUD control sits on, not a competing tap target (Isles #view became a Tab stop for keyboard users, b15-10)
        if (e.tagName === 'CANVAS' && e.getAttribute('role') === 'application' && b.width * b.height >= 0.5 * vw * vh && b.left <= r.left && b.top <= r.top && b.right >= r.right && b.bottom >= r.bottom) return;
        const ox = Math.min(r.right, b.right) - Math.max(r.left, b.left), oy = Math.min(r.bottom, b.bottom) - Math.max(r.top, b.top);
        if (ox > 2 && oy > 2) add('menu', 'overlap:' + sel(e), `overlaps ${sel(e)} by ${Math.round(ox)}x${Math.round(oy)}`);
      });
    }
  }
  // 3. tap targets
  inter.forEach((e) => {
    if (isInlineLink(e) || (e.tagName === 'INPUT' && /checkbox|radio/.test(e.type) && e.closest('label'))) return;
    const r = e.getBoundingClientRect();
    if (r.width < 43.5 || r.height < 43.5) add('tap', sel(e), `${Math.round(r.width)}x${Math.round(r.height)} "${(e.getAttribute('aria-label') || e.textContent || '').trim().slice(0, 24)}"`);
  });
  // 4 + 5. text size + contrast over text nodes
  const lum = (c) => { const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }; return 0.2126 * f(c[0]) + 0.7152 * f(c[1]) + 0.0722 * f(c[2]); };
  const parse = (s) => { const m = /rgba?\(([^)]+)\)/.exec(s); if (!m) return null; const p = m[1].split(/[ ,\/]+/).filter(Boolean).map(parseFloat); return [p[0], p[1], p[2], p.length > 3 ? p[3] : 1]; };
  const over = (f, b) => [f[0] * f[3] + b[0] * (1 - f[3]), f[1] * f[3] + b[1] * (1 - f[3]), f[2] * f[3] + b[2] * (1 - f[3]), 1];
  const bgOf = (e) => {
    const chain = [];
    for (let n = e; n && n.nodeType === 1; n = n.parentElement) {
      const cs = getComputedStyle(n);
      if (cs.backgroundImage && cs.backgroundImage !== 'none') return null; // gradients / images: cannot compute
      const c = parse(cs.backgroundColor);
      if (c && c[3] > 0) { chain.push(c); if (c[3] >= 1) break; }
    }
    let base = [255, 255, 255, 1];
    for (let i = chain.length - 1; i >= 0; i--) base = over(chain[i], base);
    return base;
  };
  const seenText = new Set(), seenSize = new Set();
  let unknownBg = 0, measured = 0;
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  let tn, nodes = 0;
  while ((tn = walker.nextNode()) && nodes < 4000) {
    nodes++;
    const t = tn.textContent.trim();
    const pe = tn.parentElement;
    if (!t || !pe || /^(SCRIPT|STYLE|NOSCRIPT|OPTION)$/.test(pe.tagName) || !/[A-Za-z0-9]/.test(t)) continue;
    if (!shown(pe)) continue;
    const cs = getComputedStyle(pe), fs = parseFloat(cs.fontSize);
    const key = sel(pe);
    if (fs < 11.95 && !seenSize.has(key)) { seenSize.add(key); add('text-size', key, `${fs.toFixed(1)}px "${t.slice(0, 24)}"`); }
    if (seenText.has(key)) continue;
    seenText.add(key);
    const fg0 = parse(cs.color), bg = bgOf(pe);
    if (!fg0) continue;
    if (!bg) { unknownBg++; continue; }
    let op = 1; for (let n = pe; n && n.nodeType === 1; n = n.parentElement) op *= parseFloat(getComputedStyle(n).opacity);
    if (op > 0.01 && op < 0.99) continue; // mid-fade frame (transient): resting contrast is what counts
    const fg = over([fg0[0], fg0[1], fg0[2], fg0[3] * op], bg);
    const L1 = lum(fg), L2 = lum(bg), ratio = (Math.max(L1, L2) + 0.05) / (Math.min(L1, L2) + 0.05);
    measured++;
    const bold = parseInt(cs.fontWeight, 10) >= 700, large = fs >= 24 || (fs >= 18.66 && bold);
    const need = large ? 3 : 4.5;
    if (ratio < need) {
      const hx = (c) => '#' + [c[0], c[1], c[2]].map((v) => Math.round(v).toString(16).padStart(2, '0')).join('');
      add('contrast', key, `${ratio.toFixed(2)}:1 (need ${need}) ${hx(fg)} on ${hx(bg)} ${fs.toFixed(0)}px "${t.slice(0, 24)}"`);
    }
  }
  // 7. accessible names for controls
  const nameOf = (e) => {
    let n = (e.getAttribute('aria-label') || '').trim();
    if (n) return n;
    const lb = e.getAttribute('aria-labelledby');
    if (lb) n = lb.split(/\s+/).map((i) => (document.getElementById(i) || {}).textContent || '').join(' ').trim();
    if (n) return n;
    if (e.labels && e.labels.length) n = [...e.labels].map((l) => l.textContent).join(' ').trim();
    if (n) return n;
    const clone = e.cloneNode(true);
    clone.querySelectorAll('[aria-hidden="true"]').forEach((x) => x.remove());
    n = (clone.textContent || '').trim();
    if (!n) { const im = e.querySelector('img[alt]'); if (im) n = im.alt.trim(); }
    if (!n) n = (e.getAttribute('title') || e.getAttribute('value') || e.getAttribute('placeholder') || '').trim();
    return n;
  };
  inter.forEach((e) => {
    if (e.tagName === 'SELECT' || e.tagName === 'TEXTAREA' || (e.tagName === 'INPUT' && !/button|submit|reset|image/.test(e.type))) {
      if (!nameOf(e)) add('name', sel(e), 'form field without a label/aria-label');
      return;
    }
    const n = nameOf(e);
    if (!n) add('name', sel(e), 'no accessible name (icon-only, no aria-label)');
    else if (!/[A-Za-z0-9]/.test(n) && !e.getAttribute('aria-label')) add('name', sel(e), `symbol-only name "${n.slice(0, 8)}" with no aria-label`);
  });
  // 8. landmarks / headings
  if (!document.documentElement.lang) add('landmark', 'html-lang', '<html> has no lang');
  if (!(document.title || '').trim()) add('landmark', 'title', 'empty <title>');
  if (!document.querySelector('main,[role=main]')) add('landmark', 'no-main', 'no <main> landmark');
  const hs = [...document.querySelectorAll('h1,h2,h3,h4,h5,h6')].filter(shown);
  const h1 = hs.filter((h) => h.tagName === 'H1');
  if (h1.length === 0) add('landmark', 'no-h1', 'no visible <h1>');
  if (h1.length > 1) add('landmark', 'multi-h1', h1.length + ' visible <h1>');
  let prev = 0;
  hs.forEach((h) => { const l = +h.tagName[1]; if (prev && l > prev + 1) add('landmark', 'heading-skip:' + sel(h), `h${prev} -> h${l} "${h.textContent.trim().slice(0, 20)}"`); prev = l; });
  const ids = {}; document.querySelectorAll('[id]').forEach((e) => { ids[e.id] = (ids[e.id] || 0) + 1; });
  Object.keys(ids).filter((i) => ids[i] > 1).slice(0, 3).forEach((i) => add('landmark', 'dup-id:' + i, ids[i] + ' elements share id ' + i));
  const cv = [...document.querySelectorAll('canvas')].filter((c) => shown(c) && c.getBoundingClientRect().width > 100);
  cv.forEach((c) => { if (!c.getAttribute('aria-label') && !c.getAttribute('aria-hidden') && !c.getAttribute('role') && !c.closest('[aria-label],[role=application],[role=img]')) add('landmark', 'canvas-nolabel:' + sel(c), 'large canvas without aria-label/role'); });
  return { offenders: out, stats: { measured, unknownBg, interactive: inter.length, textNodes: nodes } };
};

// text-size probe: mean RENDERED font-size over text nodes (for the 150% / 200% prefs). cyc0-ui: the computed font-size times the
// element's effective CSS zoom (currentCSSZoom), because the Town / Realm HUDs grow with zoom: var(--hud-scale), which getComputedStyle
// alone reports unchanged. Text that is neither resized nor zoomed still counts at its plain size.
const PROBE = () => {
  let sum = 0, n = 0;
  const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  let t, i = 0;
  while ((t = w.nextNode()) && i < 2000) {
    i++;
    const p = t.parentElement;
    if (!p || !t.textContent.trim() || /^(SCRIPT|STYLE)$/.test(p.tagName)) continue;
    const r = p.getBoundingClientRect();
    if (r.width === 0) continue;
    sum += parseFloat(getComputedStyle(p).fontSize) * (p.currentCSSZoom || 1); n++;
  }
  return n ? sum / n : 0;
};
// clipped text: box with overflow hidden whose content is wider/taller than the box (text cut off)
const CLIP = () => {
  const out = [];
  const sel = (e) => (e.id ? '#' + e.id : e.tagName.toLowerCase() + '.' + (e.getAttribute('class') || '').split(/\s+/)[0]);
  document.querySelectorAll('button,a,label,.btn,[role=button],span,div,p,li').forEach((e) => {
    if (out.length > 6) return;
    const cs = getComputedStyle(e), r = e.getBoundingClientRect();
    if (r.width <= 1 || r.height <= 1 || e.clientWidth <= 2 || cs.display === 'none' || cs.visibility === 'hidden' || !(e.textContent || '').trim() || e.children.length > 3) return;
    if (/hidden|clip/.test(cs.overflowX) && e.scrollWidth > e.clientWidth + 2 && cs.textOverflow !== 'ellipsis' && cs.whiteSpace !== 'normal') out.push(sel(e) + ` text wider than box (${e.scrollWidth}>${e.clientWidth})`);
    else if (/hidden|clip/.test(cs.overflowY) && e.scrollHeight > e.clientHeight + 3 && e.clientHeight > 0 && cs.display !== 'inline') out.push(sel(e) + ` text taller than box (${e.scrollHeight}>${e.clientHeight})`);
  });
  return out;
};

// cyc2 U-06: controls that cover each other (visible tap targets + drag areas such as the Town stick, role=application). Each rect
// is clipped by its overflow ancestors and the viewport first (scrolled-away chips do not count); a control nested in the other, and
// a focusable full-screen game canvas (the backdrop every HUD control sits on, as in the Menu check) are not overlaps.
const OVERLAP = () => {
  const vw = innerWidth, vh = innerHeight;
  const sel = (e) => (e.id ? '#' + e.id : e.tagName.toLowerCase() + ((e.getAttribute('class') || '').trim() ? '.' + e.getAttribute('class').trim().split(/\s+/)[0] : ''));
  const hidden = (e) => { for (let n = e; n && n.nodeType === 1; n = n.parentElement) { const cs = getComputedStyle(n); if (cs.display === 'none' || cs.visibility === 'hidden' || n.hidden || n.getAttribute('aria-hidden') === 'true' || n.hasAttribute('inert') || parseFloat(cs.opacity) === 0) return true; } return false; };
  const clipRect = (e) => {
    const r = e.getBoundingClientRect();
    let x = Math.max(0, r.left), y = Math.max(0, r.top), R = Math.min(vw, r.right), B = Math.min(vh, r.bottom);
    for (let n = e.parentElement; n && n !== document.body; n = n.parentElement) {
      const cs = getComputedStyle(n);
      if (/hidden|clip|auto|scroll/.test(cs.overflowX + cs.overflowY)) { const p = n.getBoundingClientRect(); x = Math.max(x, p.left); y = Math.max(y, p.top); R = Math.min(R, p.right); B = Math.min(B, p.bottom); }
      if (cs.position === 'fixed') break;
    }
    return R - x > 2 && B - y > 2 ? { x, y, R, B } : null;
  };
  const Q = 'a[href],button,input:not([type=hidden]),select,textarea,summary,[role=button],[role=link],[role=tab],[role=checkbox],[role=switch],[role=application],[tabindex]:not([tabindex="-1"])';
  // cyc12-lead: while a modal dialog is open, a control outside it whose centre is covered by that dialog (its scrim or its card) cannot
  // be tapped and is not a competing target; the controls inside the dialog are checked against each other and against anything the
  // dialog does not cover (the Museum view: the people chip and the "more" button lie under the scrim).
  const modal = [...document.querySelectorAll('[role=dialog][aria-modal="true"]')].find((d) => !hidden(d) && d.getBoundingClientRect().width > 0);
  const underModal = (e) => { if (!modal || modal.contains(e)) return false; const r = e.getBoundingClientRect(); const t = document.elementFromPoint(Math.min(vw - 1, Math.max(0, r.left + r.width / 2)), Math.min(vh - 1, Math.max(0, r.top + r.height / 2))); return !!t && modal.contains(t); };
  const els = [...document.querySelectorAll(Q)].filter((e) => !e.disabled && !hidden(e) && !underModal(e))
    .filter((e) => { if (e.tagName !== 'CANVAS' && e.getAttribute('role') !== 'application') return true; const r = e.getBoundingClientRect(); return r.width * r.height < 0.5 * vw * vh; })
    .map((e) => ({ e, r: clipRect(e) })).filter((o) => o.r);
  const out = [];
  for (let i = 0; i < els.length && out.length < 8; i++) {
    for (let j = i + 1; j < els.length && out.length < 8; j++) {
      const a = els[i], b = els[j];
      if (a.e.contains(b.e) || b.e.contains(a.e)) continue;
      const ox = Math.min(a.r.R, b.r.R) - Math.max(a.r.x, b.r.x), oy = Math.min(a.r.B, b.r.B) - Math.max(a.r.y, b.r.y);
      if (ox > 2 && oy > 2) { const k = [sel(a.e), sel(b.e)].sort(); out.push({ key: k.join('+'), detail: `${k[0]} and ${k[1]} cover each other by ${Math.round(ox)}x${Math.round(oy)} at ${vw}x${vh}` }); }
    }
  }
  return out;
};

const CHROME = /mm-nav|^menu|menu:|sound|mute|← town|back to|settings|close|^town/i; // shared chrome is never the page's primary action
const lanesShared = /mm-nav|mm-settings|mm-fb|mm-feedback|mm-mk|\.mk-|mm-min|mm-board|mm-gift/;
const all = new Map(); // "page|check|key" -> { page, lane, check, key, detail, vps:Set }
function record(page, check_, key, detail, vp) {
  const id = page.id + '|' + check_ + '|' + key;
  let o = all.get(id);
  if (!o) { o = { id, page: page.id, lane: page.lane, check: check_, key, detail, vps: new Set(), shared: lanesShared.test(key) }; all.set(id, o); }
  o.vps.add(vp);
  return o;
}

async function openPage(browser, page, vp, extraSeed, mediaOpts) {
  const ctxOpts = vp.touch ? { viewport: { width: vp.w, height: vp.h }, hasTouch: true, isMobile: true } : { viewport: { width: vp.w, height: vp.h } };
  if (mediaOpts) Object.assign(ctxOpts, mediaOpts);
  const ctx = await browser.newContext(ctxOpts);
  const db = page.town ? await offlineStub(ctx) : await blockDb(ctx); // Town: database blocked + Firebase SDK answered empty
  const seed = Object.assign({}, SEED, extraSeed || {});
  await ctx.addInitScript((s) => {
    if (!sessionStorage.a11ySeeded) { sessionStorage.a11ySeeded = '1'; Object.keys(s).forEach((k) => { try { localStorage.setItem(k, s[k]); } catch (e) { /* storage blocked */ } }); }
  }, seed);
  const p = await ctx.newPage();
  const errors = [];
  p.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  p.on('console', (m) => { if (m.type() === 'error' && !/favicon|Failed to load resource.*(firebase|gstatic)|net::ERR_FAILED/.test(m.text())) errors.push('console: ' + m.text()); });
  if (page.town) await p.route('**/main.js*', async (route) => { const resp = await route.fetch(); route.fulfill({ response: resp, body: (await resp.text()).replace('const game = new Phaser.Game(config);', 'const game = window.__g = new Phaser.Game(config);') }); });
  await p.goto(page.url, { waitUntil: 'load', timeout: 30000 });
  if (page.town) {
    await enterTown(p);
    if (page.open) { // cyc12-lead: a Town panel view
      await p.evaluate((fn) => window.__g.scene.getScene('Town')[fn](), page.open);
      await p.waitForSelector(page.dialog + ':not(.hidden)', { timeout: 5000 });
      await p.waitForTimeout(500);
    }
  }
  else await p.waitForTimeout(1500);
  return { ctx, p, db, errors };
}

async function enterTown(p) {
  await p.fill('#name-input', 'ADMINa11y');
  await p.click('.species-tab');
  await p.click('.avatar-choice');
  await p.click('button:has-text("Join Town")');
  await p.waitForSelector('#join-offline-btn:not(.hidden)', { timeout: 12000 });
  await p.evaluate(() => document.getElementById('join-offline-btn').click());
  await p.waitForFunction(() => window.__g && window.__g.scene.getScene('Town') && window.__g.scene.getScene('Town').localBody, null, { timeout: 25000 });
  await p.waitForTimeout(1500);
}

// keyboard pass: Tab through up to 40 stops. Focus ring on every stop, primary action within 6 presses, Enter completes it.
async function keyboardPass(p, page, vpId) {
  const stops = [];
  const FOCUS = () => {
    const e = document.activeElement;
    if (!e || e === document.body || e === document.documentElement) return null;
    const sig = (x) => { const c = getComputedStyle(x); return [c.outlineStyle, c.outlineWidth, c.outlineColor, c.boxShadow, c.borderColor, c.backgroundColor, c.color, c.textDecorationLine, c.transform].join('|'); };
    const c = getComputedStyle(e);
    const outline = c.outlineStyle !== 'none' && parseFloat(c.outlineWidth) >= 1 && !/rgba\(\d+, \d+, \d+, 0\)/.test(c.outlineColor);
    const focused = sig(e);
    e.blur();
    const blurred = sig(e);
    e.focus({ focusVisible: true });
    const r = e.getBoundingClientRect();
    const name = (e.getAttribute('aria-label') || e.textContent || e.value || e.title || '').trim().replace(/\s+/g, ' ').slice(0, 40);
    const id = e.id ? '#' + e.id : e.tagName.toLowerCase() + (e.getAttribute('class') ? '.' + e.getAttribute('class').trim().split(/\s+/)[0] : '');
    const tr = e.closest('[role=dialog],[aria-modal]');
    return { id, name, ring: outline || focused !== blurred, vis: r.width > 0 && r.height > 0, inView: r.bottom > 0 && r.right > 0 && r.top < innerHeight && r.left < innerWidth, dlg: !!tr };
  };
  const before = () => document.body.innerText.length + '|' + location.href + '|' + document.documentElement.className + document.body.className + '|' + document.querySelectorAll('*').length;
  let primary = -1, seen = new Set(), pri = null;
  for (let i = 1; i <= 40; i++) {
    await p.keyboard.press('Tab');
    const f = await p.evaluate(FOCUS);
    if (!f) { if (i > 3) break; continue; }
    if (seen.has(f.id + f.name) && i > 6) break;
    seen.add(f.id + f.name);
    stops.push(f);
    if (!f.ring) record(page, 'focus-ring', f.id, `no visible focus indicator on "${f.name}"`, vpId);
    if (!f.inView) record(page, 'focus-offscreen', f.id, `focused control is off screen "${f.name}"`, vpId);
    if (primary < 0 && page.primary && !CHROME.test(f.id + ' ' + f.name) && f.name && page.primary.test(f.name)) { primary = i; pri = f; }
  }
  if (!page.town) {
    if (primary < 0) record(page, 'keyboard-primary', 'not-found', 'no Tab stop within 40 matches the primary action regex ' + page.primary + ' (stops: ' + stops.slice(0, 8).map((s) => s.name || s.id).join(' / ') + ')', vpId);
    else if (primary > 6) record(page, 'keyboard-primary', 'too-far', `primary action "${pri.name}" needs ${primary} Tab presses (limit 6)`, vpId);
    else {
      // focus the primary control (the sequential-focus start point survives a blur, so re-tabbing from the top is unreliable)
      const ok = await p.evaluate(({ src, fl, chSrc }) => {
        const re = new RegExp(src, fl), ch = new RegExp(chSrc, 'i');
        const c = [...document.querySelectorAll('a[href],button,input,select,textarea,summary,[role=button],[tabindex]:not([tabindex="-1"])')].find((e) => { const r = e.getBoundingClientRect(); const nm = (e.getAttribute('aria-label') || e.textContent || '').trim(); return r.width > 0 && nm && !ch.test(e.id + ' ' + nm) && re.test(nm); });
        if (c) c.focus({ focusVisible: true });
        return !!c;
      }, { src: page.primary.source, fl: page.primary.flags, chSrc: CHROME.source });
      if (!ok) record(page, 'keyboard-primary', 'not-found', 'primary control vanished before activation', vpId);
      const b0 = await p.evaluate(before);
      const url0 = p.url();
      await p.keyboard.press('Enter');
      let changed = false;
      for (let i = 0; i < 12 && !changed; i++) { await p.waitForTimeout(250); changed = p.url() !== url0 || (await p.evaluate(before).catch(() => 'nav')) !== b0; }
      if (!changed) { await p.keyboard.press('Space'); await p.waitForTimeout(600); changed = (await p.evaluate(before).catch(() => 'nav')) !== b0; }
      if (!changed) record(page, 'keyboard-primary', 'no-effect', 'Enter/Space on the focused primary action changed nothing', vpId);
    }
  } else if (stops.length < 3) record(page, 'keyboard-primary', 'town-few-stops', 'only ' + stops.length + ' Tab stops in the Town DOM overlay', vpId);
  return stops.length;
}

(async () => {
  const browser = await chromium.launch();
  const t0 = Date.now();
  const pages = PAGES.filter((pg) => !PAGE_F || PAGE_F.has(pg.id));
  const vps = VIEWPORTS.filter((v) => !VP_F || VP_F.has(v.id));
  const summary = [];
  for (const pg of pages) {
    for (const vp of vps) {
      const L = `[${pg.id} ${vp.id}]`;
      let run;
      try { run = await openPage(browser, pg, vp); } catch (e) { check(L + ' page opens', false, String(e.message).slice(0, 160)); continue; }
      try {
        const res = await run.p.evaluate(AUDIT);
        res.offenders.forEach((o) => record(pg, o.check, o.key, o.detail, vp.id));
        // cyc12-ui: at 160x284 (a 320 px phone at 200% zoom) also controls covering each other, as the text-200 pass does at 195 px.
        // The Menu check alone let the Isles action column sit on the HUD / Pack and the stick sit under Attack (cycle 11 L note).
        // cyc13-lead: Realm World is part of this check too (cycle 12 parked it behind OVERLAP160_ALL=1 for 8 HUD overlaps; the HUD folds
        // its secondary controls into the More tray at <= 190 px now, see cyc13-lead-realm-160.test.js). No page is exempt.
        if (vp.id === '160x284') (await run.p.evaluate(OVERLAP)).forEach((o) => record(pg, 'overlap', o.key, o.detail, vp.id));
        run.errors.forEach((er) => record(pg, 'console-error', er.replace(/\s+/g, ' ').slice(0, 90), er.slice(0, 200), vp.id));
        check(L + ' no database request attempted', run.db.attempts() === 0, String(run.db.attempts()));
        if (vp.id === '1920x1080' || vp.id === '390x844') await keyboardPass(run.p, pg, vp.id);
        summary.push(`${pg.id} ${vp.id}: ${res.offenders.length} offenders, ${res.stats.measured} contrast samples (${res.stats.unknownBg} gradient/image bg skipped)`);
      } catch (e) { check(L + ' audit runs', false, String(e.message).slice(0, 200)); }
      await run.ctx.close();
    }
    // preference passes at 390x844: reduced motion (OS), 150%, 200%, high-contrast
    const vp = VIEWPORTS[2];
    if (VP_F && !VP_F.has(vp.id)) continue;
    const PREFS = [
      { id: 'reduced-motion', media: { reducedMotion: 'reduce' }, seed: {} },
      { id: 'pref-reduce-motion', media: {}, seed: { 'mm-reduce-motion': '1', 'pixeltown-access-v1': JSON.stringify({ v: 1, flashes: false }) } },
      { id: 'text-150', media: {}, seed: { 'pixeltown-access-v1': JSON.stringify({ v: 1, hudScale: 1.5 }) } },
      // cyc0-ui: 200% browser zoom the way a browser does it (half the CSS viewport at device scale 2, so media queries see
      // 195 px), not html{zoom:2}, which kept the 390 px media queries and missed the real 200% Town (bag bar over the Menu).
      { id: 'text-200', media: { deviceScaleFactor: 2 }, seed: { 'pixeltown-access-v1': JSON.stringify({ v: 1, hudScale: 1.5 }) }, vp: { id: '195x422', w: 195, h: 422, touch: true } },
      { id: 'high-contrast', media: {}, seed: { 'mm-high-contrast': '1' } }
    ];
    let baseSize = 0;
    try { const r0 = await openPage(browser, pg, vp); baseSize = await r0.p.evaluate(PROBE); await r0.ctx.close(); } catch (e) { /* baseline missing */ }
    for (const pf of PREFS.filter((x) => !PREF_F || PREF_F.has(x.id))) {
      const L = `[${pg.id} ${pf.id}]`;
      let run;
      try { run = await openPage(browser, pg, pf.vp || vp, pf.seed, pf.media); } catch (e) { check(L + ' page opens', false, String(e.message).slice(0, 160)); continue; }
      try {
        if (pf.css) { await run.p.addStyleTag({ content: pf.css }); await run.p.waitForTimeout(400); }
        const key = 'pref:' + pf.id;
        if (pf.id === 'reduced-motion' || pf.id === 'pref-reduce-motion') {
          await run.p.waitForTimeout(700);
          const anim = await run.p.evaluate(() => {
            const o = [];
            document.getAnimations().forEach((a) => {
              const t = a.effect && a.effect.getComputedTiming ? a.effect.getComputedTiming() : null;
              const tg = a.effect && a.effect.target;
              if (!tg || a.playState !== 'running' || !t) return;
              if (t.iterations === Infinity && t.duration > 0) o.push((tg.id ? '#' + tg.id : tg.tagName.toLowerCase() + '.' + (tg.getAttribute('class') || '').split(/\s+/)[0]) + ' ' + (a.animationName || a.transitionProperty || 'anim'));
            });
            const de = document.documentElement;
            return { loop: [...new Set(o)].slice(0, 5), attr: de.hasAttribute('data-reduce-motion') || de.classList.contains('reduce-motion') };
          });
          if (anim.loop.length) record(pg, 'reduced-motion', anim.loop[0].split(' ')[0] + ' ' + (anim.loop[0].split(' ')[1] || ''), `${pf.id}: infinite animation still running: ${anim.loop.join('; ')}`, pf.id);
          if (pf.id === 'pref-reduce-motion' && !anim.attr) record(pg, 'reduced-motion', 'pref-not-applied', 'mm-reduce-motion / flashes:false pref did not set data-reduce-motion or html.reduce-motion (page ignores the pref)', pf.id);
        }
        if (pf.id === 'text-150' || pf.id === 'text-200') {
          const sz = await run.p.evaluate(PROBE);
          const need = 1.2;
          if (pf.id === 'text-150' && baseSize && sz / baseSize < need) record(pg, key, 'text-not-scaled', `mean text ${baseSize.toFixed(1)}px -> ${sz.toFixed(1)}px (x${(sz / baseSize).toFixed(2)}), expected >= x${need}${pf.id === 'text-150' ? ' (hudScale 1.5 pref ignored)' : ''}`, pf.id);
          const au = await run.p.evaluate(AUDIT);
          au.offenders.filter((o) => o.check === 'hscroll' || (o.check === 'menu' && !/missing/.test(o.key))).forEach((o) => record(pg, key, o.check + ':' + o.key, o.detail, pf.id));
          (await run.p.evaluate(CLIP)).forEach((c) => record(pg, key, 'clipped:' + c.split(' ')[0], c, pf.id));
          // cyc2 U-06: at 200% (195 css px, touch) also the tap-target size and controls covering each other (the HUD overlap that
          // U-03 / U-09 found by hand in the Town: stick under the action strip, bag bar over Where to?)
          if (pf.id === 'text-200') {
            au.offenders.filter((o) => o.check === 'tap').forEach((o) => record(pg, key, 'tap:' + o.key, o.detail, pf.id));
            // cyc3 U: always on (the 4 cycle-2 offenders, Realm leave/minimap + ability/aim and Isles pack/soothe/fire at 195x422, are
            // fixed in realm-ui.css / isles.css); never allow-listed
            (await run.p.evaluate(OVERLAP)).forEach((o) => record(pg, key, 'overlap:' + o.key, o.detail, pf.id));
          }
        }
        if (pf.id === 'high-contrast') {
          const hc = await run.p.evaluate(() => ({ attr: document.documentElement.hasAttribute('data-high-contrast') || document.documentElement.classList.contains('high-contrast') || document.body.classList.contains('high-contrast') }));
          if (!hc.attr) record(pg, 'high-contrast', 'pref-not-applied', 'mm-high-contrast=1 did not set data-high-contrast on <html> (page ignores the pref)', pf.id);
          const au = await run.p.evaluate(AUDIT);
          au.offenders.filter((o) => o.check === 'contrast').forEach((o) => record(pg, 'high-contrast', 'contrast:' + o.key, o.detail, pf.id));
        }
        run.errors.forEach((er) => record(pg, 'console-error', er.replace(/\s+/g, ' ').slice(0, 90), er.slice(0, 200), pf.id));
      } catch (e) { check(L + ' audit runs', false, String(e.message).slice(0, 200)); }
      await run.ctx.close();
    }
  }
  await browser.close();
  console.log('sweep finished in ' + Math.round((Date.now() - t0) / 1000) + 's, ' + all.size + ' distinct offenders');
  summary.slice(0, 200).forEach((s) => console.log('  ' + s));

  // ---------------- allow-list ratchet ----------------
  let allow = {};
  try { allow = JSON.parse(fs.readFileSync(ALLOW_FILE, 'utf8')); } catch (e) { allow = {}; }
  const full = !PAGE_F && !VP_F && !PREF_F;
  if (process.env.A11Y_SEED === '1' && full) {
    allow = {};
    [...all.values()].sort((a, b) => a.id.localeCompare(b.id)).forEach((o) => { allow[o.id] = o.detail.slice(0, 100); });
    fs.writeFileSync(ALLOW_FILE, JSON.stringify(allow, null, 1) + '\n');
    console.log('seeded allow-list with ' + Object.keys(allow).length + ' entries');
  }
  if (process.env.A11Y_PRUNE === '1' && full) {
    Object.keys(allow).forEach((k) => { if (!all.has(k)) delete allow[k]; });
    fs.writeFileSync(ALLOW_FILE, JSON.stringify(allow, null, 1) + '\n');
  }
  const ranPages = new Set(pages.map((p) => p.id));
  const fresh = [...all.values()].filter((o) => !(o.id in allow));
  const stale = Object.keys(allow).filter((k) => ranPages.has(k.split('|')[0]) && !all.has(k) && !VP_F && !PREF_F); // cyc0-ui: a PAGES-only run covers every check of those pages
  fresh.forEach((o) => check(`new a11y offender [${o.lane}] ${o.id}`, false, `${o.detail} @ ${[...o.vps].join(',')}`));
  stale.forEach((k) => check(`allow-list entry no longer occurs (delete it: the allow-list only shrinks) ${k}`, false, ''));
  check(`no new accessibility offenders beyond the allow-list (${Object.keys(allow).length} allowed, ${all.size} seen)`, fresh.length === 0);
  check('allow-list has no stale entries', stale.length === 0);
  check('every one of the 17 page views produced an audit', !full || summary.length >= PAGES.length * VIEWPORTS.length * 0.9, summary.length + ' audits');

  if (process.env.A11Y_REPORT === '1' && full) writeReport();
  done();
})();

function writeReport() {
  const byLane = {};
  [...all.values()].forEach((o) => { (byLane[o.lane] = byLane[o.lane] || []).push(o); });
  const esc = (s) => String(s).replace(/\|/g, '\\|').replace(/\n/g, ' ');
  const checks = {};
  all.forEach((o) => { checks[o.check] = (checks[o.check] || 0) + 1; });
  let md = '<!-- OFFENDERS:START (generated by A11Y_REPORT=1 node game/tests/a11y-viewport-sweep.test.js) -->\n\n';
  md += '### Counts by check\n\n| check | distinct offenders |\n|---|---|\n' + Object.keys(checks).sort().map((c) => `| ${c} | ${checks[c]} |`).join('\n') + '\n\n';
  Object.keys(byLane).sort().forEach((lane) => {
    const rows = byLane[lane].sort((a, b) => a.check.localeCompare(b.check) || a.id.localeCompare(b.id));
    md += `### Lane: ${lane} (${rows.length})\n\n| page | check | selector / key | detail | seen at |\n|---|---|---|---|---|\n`;
    md += rows.map((o) => `| ${o.page} | ${o.check}${o.shared ? ' (shared)' : ''} | \`${esc(o.key)}\` | ${esc(o.detail).slice(0, 150)} | ${[...o.vps].map((v) => v.replace('1920x1080', '1920').replace('pref-reduce-motion', 'prefRM')).join(' ')} |`).join('\n') + '\n\n';
  });
  md += '<!-- OFFENDERS:END -->';
  let cur = '';
  try { cur = fs.readFileSync(REPORT_FILE, 'utf8'); } catch (e) { cur = '# Accessibility and viewport sweep\n\n'; }
  const re = /<!-- OFFENDERS:START[\s\S]*<!-- OFFENDERS:END -->/;
  fs.writeFileSync(REPORT_FILE, re.test(cur) ? cur.replace(re, () => md) : cur + '\n' + md + '\n');
}
