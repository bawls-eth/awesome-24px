// CZ1 Collections: a small Hub card with the total found across every game's collection, and a sheet with each set (found / total, the
// entries, and a link to the game where they are found). Data comes from MMCollections.read(localStorage): local keys only, read-only.
// This file writes nothing to storage, opens no network connection, and puts every string in the DOM with textContent / attributes.
// Free play: no timers, no streaks, nothing that runs out. Links go through MMNav.urlFor (the registry allow-list) and nothing else.
(function () {
  'use strict';
  const C = window.MMCollections;
  const $ = (id) => document.getElementById(id);
  const card = $('coll-card'), openBtn = $('coll-open'), sum = $('coll-sum'), steps = $('coll-steps');
  const sheet = $('coll-sheet'), closeBtn = $('coll-close'), note = $('coll-note'), list = $('coll-sets');
  if (!C || !card || !openBtn || !sheet || !list) { if (card) card.hidden = true; return; }

  function el(tag, cls, text) { const n = document.createElement(tag); if (cls) n.className = cls; if (text !== undefined) n.textContent = text; return n; }
  function hrefFor(place) {
    if (!window.MMNav || typeof MMNav.urlFor !== 'function') return null;
    try { return MMNav.urlFor(place, 'map'); } catch (e) { return null; }
  }
  function placeName(place) {
    try { const p = window.MMNav && MMNav.place ? MMNav.place(place) : null; return p && p.name ? p.name : place; } catch (e) { return place; }
  }
  function data() {
    try { return C.read(localStorage); } catch (e) { return C.read(null); }
  }
  function clear(n) { while (n.firstChild) n.removeChild(n.firstChild); }

  let book = data();
  function renderCard() {
    sum.textContent = C.line(book.found, book.total);
    openBtn.setAttribute('aria-label', 'Collections: ' + C.line(book.found, book.total) + '. Open the collections book');
    clear(steps);
    book.steps.forEach((s) => {
      const href = hrefFor(s.place);
      if (!href) return;
      const li = el('li', 'coll-step');
      const a = el('a', 'coll-step-go');
      a.setAttribute('href', href);
      a.dataset.place = s.place; a.dataset.set = s.set;
      a.setAttribute('aria-label', s.text + ' in ' + placeName(s.place));
      const ic = el('span', 'coll-step-ico', s.icon); ic.setAttribute('aria-hidden', 'true');
      a.appendChild(ic);
      a.appendChild(el('span', 'coll-step-txt', s.text));
      li.appendChild(a);
      steps.appendChild(li);
    });
    steps.hidden = steps.childNodes.length === 0;
  }
  function renderSheet() {
    note.textContent = C.NOTE;
    clear(list);
    book.sets.forEach((s) => {
      const li = el('li', 'coll-set');
      li.dataset.set = s.id;
      const head = el('div', 'coll-set-head');
      head.appendChild(el('h3', 'coll-set-title', s.title));
      head.appendChild(el('span', 'coll-set-n', C.line(s.found, s.total)));
      li.appendChild(head);
      li.appendChild(el('p', 'coll-set-hint', s.hint));
      const det = el('details', 'coll-det');
      const su = el('summary', 'coll-det-sum', 'Show the list');
      det.appendChild(su);
      const ul = el('ul', 'coll-entries');
      ul.setAttribute('aria-label', s.title);
      s.entries.forEach((e) => {
        const it = el('li', 'coll-entry' + (e.found ? ' on' : ''), (e.found ? '✓ ' : '') + e.name);
        it.dataset.id = e.id;
        it.setAttribute('aria-label', e.name + (e.found ? ', found' : ', not found yet'));
        ul.appendChild(it);
      });
      det.appendChild(ul);
      li.appendChild(det);
      const href = hrefFor(s.place);
      if (href) {
        const a = el('a', 'btn coll-go', 'Find them in ' + placeName(s.place));
        a.setAttribute('href', href);
        a.dataset.place = s.place;
        li.appendChild(a);
      }
      list.appendChild(li);
    });
  }
  function isOpen() { return !sheet.hidden; }
  function open() {
    book = data(); renderCard(); renderSheet();
    sheet.hidden = false;
    openBtn.setAttribute('aria-expanded', 'true');
    list.scrollTop = 0; sheet.scrollTop = 0;
    closeBtn.focus();
  }
  function close() {
    if (sheet.hidden) return;
    sheet.hidden = true;
    openBtn.setAttribute('aria-expanded', 'false');
    openBtn.focus();
  }
  openBtn.addEventListener('click', () => { if (isOpen()) close(); else open(); });
  closeBtn.addEventListener('click', close);
  // Keys typed inside the card or the sheet belong to them: the map's arrows / Enter handler (hub.js, on document) never sees them,
  // so Enter on a link or a list toggle works as usual. Esc closes the sheet.
  function own(e) {
    if (e.key === 'Escape' && isOpen()) { e.preventDefault(); close(); }
    e.stopPropagation();
  }
  sheet.addEventListener('keydown', own);
  card.addEventListener('keydown', (e) => { if (e.key !== 'Escape') e.stopPropagation(); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && isOpen()) { e.preventDefault(); close(); } });

  renderCard();
  try { window.dispatchEvent(new Event('resize')); } catch (e) { /* the map keeps its first size */ } // the card's height is known now
  window.__coll = { read: () => data(), open: open, close: close, isOpen: isOpen };
}());
