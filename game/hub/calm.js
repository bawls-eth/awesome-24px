// RT1 "Things you could do": a calm card on the Hub map with three ideas from medals not earned yet (MMCalmGoals.suggest), plus a row in the
// shared Where-to sheet (MMNav.onOpen) that brings the card back. Free play: no timers, no streaks, nothing that runs out.
// Reads medals through MMHubMedals.read (each game's own medal key, read-only) and links through MMNav.urlFor (the registry URL allow-list).
// Own additive key `pixeltown-calm-v1` = { v: 1, dismissed: ['game:medal', ...], hidden: 0 | 1 }; nothing else is written. ?calm=0 hides it all.
// No network, no innerHTML: every string reaches the DOM through textContent / attributes.
(function () {
  'use strict';
  const KEY = 'pixeltown-calm-v1';
  const SEED = 'hub-calm-v1'; // no date in it: the ideas change only when a medal is earned or an idea is put away
  const HERE = 'game/hub/index.html';
  const card = document.getElementById('calm-card');
  const list = document.getElementById('calm-list');
  const close = document.getElementById('calm-close');
  const off = /(?:^|[?&])calm=0(?:&|$)/.test(location.search.slice(1));
  if (!card || !list || !close || !window.MMCalmGoals || !window.MMHubMedals) return;
  if (off) { card.hidden = true; return; }

  function load() {
    let o = null;
    try { const raw = localStorage.getItem(KEY); o = raw && raw.length < 8192 ? JSON.parse(raw) : null; } catch (e) { o = null; }
    if (!o || typeof o !== 'object' || Array.isArray(o)) o = {};
    return { v: 1, dismissed: MMCalmGoals.cleanDismissed(o.dismissed), hidden: o.hidden === 1 ? 1 : 0 };
  }
  function save(s) { try { localStorage.setItem(KEY, JSON.stringify({ v: 1, dismissed: MMCalmGoals.cleanDismissed(s.dismissed), hidden: s.hidden ? 1 : 0 })); } catch (e) { /* storage blocked: this visit only */ } }
  function medals() {
    try { return MMHubMedals.read(localStorage, window.MMJamSongs); } catch (e) { return {}; }
  }
  function hrefFor(s) {
    if (window.MMNav && typeof MMNav.urlFor === 'function') { try { return MMNav.urlFor(s.url, HERE); } catch (e) { return null; } }
    const m = /^game\/(games\/[a-z-]+\/[a-z-]+\.html)$/.exec(s.url); // no MMNav on the page: the same registry path, relative to game/hub/
    return m ? '../' + m[1] : null;
  }
  function el(tag, cls, text) { const n = document.createElement(tag); if (cls) n.className = cls; if (text !== undefined) n.textContent = text; return n; }

  // b08-r2 (round 4): on a fresh profile Home's one first move is the guided Realm adventure (hub/home.js G-14), so the map's first idea is
  // that too, not "Make a first friend (Isles)". Same rule as Home: no medals and no place to continue. Not stored, not dismissible.
  const REALM_FIRST = Object.freeze({ key: 'realm:first', game: 'realm', place: 'realm', url: 'game/games/mad-maze/index.html', href: '../games/mad-maze/index.html?mode=world&from=hub', icon: '⚔️', title: 'Start the guided adventure', gameName: 'Realm', text: 'A coach shows you moving, shooting and loot. Your first hero waits on the Shore.', fixed: true });
  function fresh() {
    try {
      const m = medals(); if (!Object.keys(m).every((k) => !(Array.isArray(m[k]) && m[k].length))) return false;
      if (window.MMNav && typeof MMNav.continueTarget === 'function' && typeof MMNav.state === 'function') {
        const st = MMNav.state(); if (MMNav.continueTarget(st, 'map') || (st.prev && MMNav.continueTarget({ v: 1, last: st.prev }, 'map'))) return false;
      }
      return true;
    } catch (e) { return false; }
  }
  let state = load();
  let shown = [];
  function render() {
    while (list.firstChild) list.removeChild(list.firstChild);
    shown = MMCalmGoals.suggest(medals(), { dismissed: state.dismissed }, SEED).filter((s) => hrefFor(s));
    if (fresh()) shown = [REALM_FIRST].concat(shown.filter((s) => s.key !== 'isles:tame1')).slice(0, 3);
    shown.forEach((s) => {
      const li = el('li', 'calm-item');
      const a = el('a', 'calm-go');
      a.setAttribute('href', s.fixed ? s.href : hrefFor(s));
      a.dataset.key = s.key; a.dataset.place = s.place;
      a.setAttribute('aria-label', s.title + ' in ' + s.gameName + ': ' + s.text);
      const ic = el('span', 'calm-ico', s.icon); ic.setAttribute('aria-hidden', 'true');
      a.appendChild(ic);
      const t = el('span', 'calm-txt');
      t.appendChild(el('span', 'calm-title', s.title + ' · ' + s.gameName));
      t.appendChild(el('span', 'calm-desc', s.text));
      a.appendChild(t);
      li.appendChild(a);
      if (!s.fixed) { const x = el('button', 'calm-x', '×');
      x.type = 'button'; x.dataset.key = s.key;
      x.setAttribute('aria-label', 'Put this idea away: ' + s.title);
      x.addEventListener('click', () => dismiss(s.key));
      li.appendChild(x); }
      list.appendChild(li);
    });
    card.hidden = state.hidden === 1 || shown.length === 0;
  }
  function dismiss(key) {
    if (state.dismissed.indexOf(key) < 0) state.dismissed.push(key);
    state.dismissed = MMCalmGoals.cleanDismissed(state.dismissed);
    save(state);
    render();
    const first = list.querySelector('.calm-go');
    if (first) first.focus(); else close.focus();
  }
  function hide() { state.hidden = 1; save(state); card.hidden = true; }
  function show() { state.hidden = 0; save(state); render(); const first = list.querySelector('.calm-go'); if (first) first.focus(); }
  close.addEventListener('click', hide);

  // Where-to sheet row: brings the card back (the sheet rebuilds its top rows on every open, so the row is added each time)
  if (window.MMNav && typeof MMNav.onOpen === 'function') {
    MMNav.onOpen(() => {
      const top = document.querySelector('#mm-nav-sheet .mm-nav-top');
      if (!top || document.getElementById('mm-nav-calm')) return;
      const b = el('button', 'mm-nav-row mm-nav-calm');
      b.type = 'button'; b.id = 'mm-nav-calm';
      const ic = el('span', 'mm-nav-ico', '\u{1F4A1}'); ic.setAttribute('aria-hidden', 'true');
      b.appendChild(ic);
      b.appendChild(el('span', 'mm-nav-row-label', 'Things you could do'));
      b.addEventListener('click', () => { try { MMNav.close(); } catch (e) { /* ignore */ } show(); });
      top.appendChild(b);
    });
  }
  render();
  window.__calm = { key: KEY, state: () => load(), shown: () => shown.map((s) => ({ key: s.key, url: s.url, place: s.place })), show };
}());
