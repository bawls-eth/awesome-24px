// HS1 Home screen: the simple 8-bit title screen that is now the default Hub view (owner request "make everything simple").
// The world map (hub.js) is untouched and stays one tap away: the footer "Map" toggle or ?map=1. Nothing about the map's
// progress (`pixeltown-hub-v1`) changes here. This file writes NOTHING to storage and opens no network connection:
// it only reads MMNav's last-place memory (pixeltown-nav-v1), the per-game medal keys (MMHubMedals.read), the calm-goal
// dismissals (pixeltown-calm-v1) and the collections (MMCollections.read). Every string reaches the DOM through textContent.
// Art is procedural: a pixel logo from a tiny 5-row font and a stepped sky / stars / hills parallax, deterministic (hash, no
// Math.random). Reduced motion or low graphics draws one still frame.
(function () {
  'use strict';
  const $ = (id) => document.getElementById(id);
  const home = $('home');
  if (!home) return;
  const HERE = 'game/hub/index.html';
  const qs = location.search.slice(1);
  const mapParam = /(?:^|&)map=1(?:&|$)/.test(qs);

  function el(tag, cls, text) { const n = document.createElement(tag); if (cls) n.className = cls; if (text !== undefined) n.textContent = text; return n; }
  function readKey(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }

  // ---------- groups ----------
  // Same pages as the map's LINKS (relative to game/hub/); the rest go through MMNav.urlFor (the registry allow-list).
  const FIXED = { town: '../index.html?from=hub', realm: '../games/mad-maze/index.html?mode=world&from=hub', isles: '../games/isles/index.html?from=hub', lantern: '../games/mad-maze/lantern.html?from=hub' };
  const HINT = { town: 'Walk and fish', realm: 'Heroes and loot', isles: 'Tame and sail', lantern: 'Heroes and stash',
    pop: 'Merge twin tiles', dash: 'Jump the night', stack: 'Build it high', echo: 'Sing it back', jam: 'Rhythm lanes',
    angler: 'Calm fishing', bugs: 'Catch bugs', stalk: 'Trade turnips', deepdelve: 'Dig and mine' };
  const GROUPS = [
    { id: 'adventure', title: 'Adventure', places: ['town', 'realm', 'isles', 'lantern'] },
    { id: 'arcade', title: 'Arcade', places: ['pop', 'dash', 'stack', 'echo', 'jam'] },
    { id: 'quick', title: 'Quick games', places: ['angler', 'bugs', 'stalk', 'deepdelve'] },
  ];
  const nav = window.MMNav || null;
  function placeOf(id) { try { return nav && nav.place ? nav.place(id) : null; } catch (e) { return null; } }
  function hrefOf(id) {
    if (FIXED[id]) return FIXED[id];
    try { return nav ? nav.urlFor(id, HERE) : null; } catch (e) { return null; }
  }
  function medals() { try { return window.MMHubMedals ? MMHubMedals.read(localStorage, window.MMJamSongs) : {}; } catch (e) { return {}; } }
  // Up to 5 pips per game: lit share of the medals earned (at least one lit once any medal is earned).
  function pipsFor(id, got) {
    const G = window.MMHubMedals && MMHubMedals.GAMES[id];
    if (!G) return null;
    const total = G.medals.length, have = (got[id] || []).length;
    const n = Math.min(5, total);
    let lit = Math.round(have / total * n);
    if (have > 0 && lit === 0) lit = 1;
    return { n, lit, have, total };
  }

  const groupsEl = $('home-groups');
  const built = [];
  function buildGroups() {
    while (groupsEl.firstChild) groupsEl.removeChild(groupsEl.firstChild);
    built.length = 0;
    const got = medals();
    GROUPS.forEach((g) => {
      const sec = el('section', 'home-group');
      sec.dataset.group = g.id;
      const h = el('h2', 'home-group-title', g.title);
      h.id = 'home-g-' + g.id;
      sec.setAttribute('aria-labelledby', h.id);
      sec.appendChild(h);
      const ul = el('ul', 'home-cards');
      g.places.forEach((id) => {
        const p = placeOf(id), href = hrefOf(id);
        if (!p || !href) return;
        const li = el('li');
        const a = el('a', 'home-card');
        a.setAttribute('href', href);
        a.dataset.place = id;
        const ic = el('span', 'hc-ico', p.icon); ic.setAttribute('aria-hidden', 'true');
        a.appendChild(ic);
        const t = el('span', 'hc-txt');
        t.appendChild(el('span', 'hc-name', p.name));
        t.appendChild(el('span', 'hc-hint', HINT[id] || p.desc));
        a.appendChild(t);
        const pp = pipsFor(id, got);
        let label = p.name + ': ' + (HINT[id] || p.desc);
        if (pp) {
          const pips = el('span', 'hc-pips'); pips.setAttribute('aria-hidden', 'true');
          for (let i = 0; i < pp.n; i++) pips.appendChild(el('i', i < pp.lit ? 'on' : ''));
          a.appendChild(pips);
          a.dataset.medals = pp.have + '/' + pp.total;
          label += '. ' + pp.have + ' of ' + pp.total + ' medals';
        }
        a.setAttribute('aria-label', label);
        li.appendChild(a);
        ul.appendChild(li);
        built.push({ group: g.id, place: id, href, medals: pp ? pp.have + '/' + pp.total : null });
      });
      sec.appendChild(ul);
      groupsEl.appendChild(sec);
    });
  }

  // ---------- Continue / Play ----------
  // MMNav has already recorded this page (hub.js mounts first), so when the last place is the map the one before it is used.
  let cont = null;
  // G-14: fresh = no place remembered (checked by the caller) and not one medal anywhere
  function freshProfile() { try { const m = medals(); return Object.keys(m).every((k) => !(Array.isArray(m[k]) && m[k].length)); } catch (e) { return true; } }
  function buildPlay() {
    const a = $('home-play'), txt = $('home-play-txt');
    let t = null;
    if (nav && typeof nav.continueTarget === 'function') {
      try {
        const st = nav.state();
        t = nav.continueTarget(st, 'map') || (st.prev ? nav.continueTarget({ v: 1, last: st.prev }, 'map') : null);
      } catch (e) { t = null; }
    }
    let href = null;
    if (t) { href = t.id === 'town' ? FIXED.town : (function () { try { return nav.urlFor(t.url, HERE); } catch (e) { return null; } }()); }
    if (t && href) {
      cont = { id: t.id, href, label: t.label };
      a.setAttribute('href', href);
      a.dataset.place = t.id;
      txt.textContent = 'Continue';
      $('home-play-sub').textContent = t.name + (t.sub ? ' - ' + t.sub : '');
      a.setAttribute('aria-label', t.label);
    } else if (!freshProfile()) {
      cont = { id: 'town', href: FIXED.town, label: 'Play: start in the Town' }; // no memory but some progress (medals): as before
      a.setAttribute('href', FIXED.town);
      a.dataset.place = 'town';
      txt.textContent = 'Play';
      $('home-play-sub').textContent = 'Start in the Town';
      a.setAttribute('aria-label', cont.label);
    } else {
      // G-14 (b08-02, SIMPLIFY-PLAN / PLAYTEST-REVIEW-4): a fresh profile has ONE first move: the guided Realm adventure (its coach is the
      // only coached first session). PLAY, the Next line and the highlighted card all name it. A returning profile still resumes above.
      cont = { id: 'realm', href: FIXED.realm, label: 'Play: start the guided adventure in the Realm', fresh: true };
      a.setAttribute('href', FIXED.realm);
      a.dataset.place = 'realm';
      txt.textContent = 'Play';
      $('home-play-sub').textContent = 'Start the guided adventure';
      a.setAttribute('aria-label', cont.label);
    }
  }
  // G-14: the card of the first move is highlighted (class + aria-describedby the PLAY sub line); only on a fresh profile
  function markFirst() {
    const cards = groupsEl.querySelectorAll('a.home-card');
    for (let i = 0; i < cards.length; i++) { cards[i].classList.remove('home-card-first'); cards[i].removeAttribute('data-first'); }
    if (!cont || !cont.fresh) return;
    const c = groupsEl.querySelector('a.home-card[data-place="' + cont.id + '"]'); if (!c) return;
    c.classList.add('home-card-first'); c.dataset.first = '1';
    c.style.outline = '3px solid #ffec27'; c.style.outlineOffset = '2px'; // inline: the 8-bit stylesheet is another lane's file
  }

  // ---------- next step (one line from the calm goals) ----------
  let next = null;
  function buildNext() {
    const a = $('home-next');
    next = null;
    if (cont && cont.fresh && !/(?:^|&)calm=0(?:&|$)/.test(qs)) { // G-14: on a fresh profile the Next line names the same first move as PLAY (not a second, different one)
      next = { key: 'first-realm', place: 'realm' };
      a.setAttribute('href', FIXED.realm); a.dataset.key = 'first-realm'; a.dataset.place = 'realm';
      $('home-next-ico').textContent = '⚔️';
      $('home-next-txt').textContent = 'Next: the guided adventure (Realm)';
      a.setAttribute('aria-label', 'Next step: the guided adventure in the Realm. A coach shows you moving, shooting and loot.');
      a.hidden = false;
      return;
    }
    if (/(?:^|&)calm=0(?:&|$)/.test(qs) || !window.MMCalmGoals || !nav) { a.hidden = true; return; }
    let dismissed = [];
    try { const raw = readKey('pixeltown-calm-v1'); const o = raw && raw.length < 8192 ? JSON.parse(raw) : null; dismissed = MMCalmGoals.cleanDismissed(o && o.dismissed); } catch (e) { dismissed = []; }
    let s = null;
    try { s = MMCalmGoals.suggest(medals(), { dismissed }, 'hub-calm-v1').filter((x) => { try { return !!nav.urlFor(x.url, HERE); } catch (e) { return false; } })[0] || null; } catch (e) { s = null; }
    if (!s) { a.hidden = true; return; }
    next = { key: s.key, place: s.place };
    a.setAttribute('href', nav.urlFor(s.url, HERE));
    a.dataset.key = s.key; a.dataset.place = s.place;
    $('home-next-ico').textContent = s.icon;
    $('home-next-txt').textContent = 'Next: ' + s.title + ' (' + s.gameName + ')';
    a.setAttribute('aria-label', 'Next step: ' + s.title + ' in ' + s.gameName + '. ' + s.text);
    a.hidden = false;
  }

  // ---------- Collections (one card; opens the same book sheet as the map) ----------
  function buildColl() {
    const b = $('home-coll');
    const C = window.MMCollections;
    if (!C) { b.hidden = true; return; }
    let book = null;
    try { book = C.read(localStorage); } catch (e) { try { book = C.read(null); } catch (e2) { book = null; } }
    if (!book) { b.hidden = true; return; }
    $('home-coll-sum').textContent = C.line(book.found, book.total);
    b.setAttribute('aria-label', 'Collections: ' + C.line(book.found, book.total) + '. Open the collections book');
  }
  $('home-coll').addEventListener('click', () => {
    if (window.__coll && typeof __coll.open === 'function') __coll.open();
    else { const o = $('coll-open'); if (o) o.click(); }
  });

  // ---------- pixel logo ----------
  const FONT = {
    P: ['1110', '1001', '1110', '1000', '1000'], I: ['111', '010', '010', '010', '111'], X: ['10001', '01010', '00100', '01010', '10001'],
    E: ['1111', '1000', '1110', '1000', '1111'], L: ['1000', '1000', '1000', '1000', '1111'], T: ['11111', '00100', '00100', '00100', '00100'],
    O: ['0110', '1001', '1001', '1001', '0110'], W: ['10001', '10001', '10101', '10101', '01010'], N: ['1001', '1101', '1011', '1001', '1001'],
  };
  function drawLogo() {
    const cv = $('home-logo');
    const word = 'PIXELTOWN';
    let w = 2;
    for (const ch of word) w += FONT[ch][0].length + 1;
    cv.width = w + 1; cv.height = 8;
    const c = cv.getContext('2d');
    c.clearRect(0, 0, cv.width, cv.height);
    const paint = (dx, dy, fill, top) => {
      let x = 1 + dx;
      for (const ch of word) {
        const g = FONT[ch];
        for (let r = 0; r < 5; r++) for (let k = 0; k < g[r].length; k++) {
          if (g[r][k] !== '1') continue;
          c.fillStyle = r === 0 && top ? top : fill;
          c.fillRect(x + k, 1 + dy + r, 1, 1);
        }
        x += g[0].length + 1;
      }
    };
    paint(1, 1, '#0b0d1a');            // drop shadow
    paint(0, 0, '#ffa300', '#ffec27'); // gold letters, light top row
  }

  // ---------- stepped sky, stars and hills ----------
  function hash(x, y) { let h = (x * 374761393 + y * 668265263) | 0; h = (h ^ (h >>> 13)) * 1274126177 | 0; return (h ^ (h >>> 16)) >>> 0; }
  // Colours from the shared 16-colour 8-bit palette (shared/mm-8bit.css --px-*): ink, page bg, navy, plum, brown, pink bands.
  const SKY = ['#0b0d1a', '#12142a', '#1d2b53', '#7e2553', '#ab5236', '#ff77a8'];
  const HILLS = [
    { col: '#83769c', base: 0.62, amp: 10, f: 0.045, sp: 2 },
    { col: '#1d2b53', base: 0.74, amp: 8, f: 0.07, sp: 5 },
    { col: '#008751', base: 0.86, amp: 6, f: 0.11, sp: 10 },
  ];
  const sky = $('home-sky');
  const sc = sky.getContext('2d');
  const PX = 4;
  let skyT = 0, skyLast = 0, raf = 0;
  function still() {
    if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return true;
    if (window.MMSideAccess && MMSideAccess.reduced()) return true;
    try { if (window.MMAccess && MMAccess.prefs && MMAccess.prefs.load(localStorage).lowGfx) return true; } catch (e) { /* defaults */ }
    return false;
  }
  let moonY = 6;
  function sizeSky() {
    const w = Math.max(40, Math.ceil(home.clientWidth / PX)), h = Math.max(40, Math.ceil(home.clientHeight / PX));
    if (sky.width !== w || sky.height !== h) { sky.width = w; sky.height = h; }
    // R4 D4 (b15-r2-18): on narrow screens (200% zoom, ~195 px) the logo reaches the top-right corner and the moon sat on
    // "TOWN". There the moon drops just below the title row instead.
    moonY = 6;
    try {
      const t = $('home-title');
      if (t && home.clientWidth < 360) {
        const hr = home.getBoundingClientRect(), tr = t.getBoundingClientRect();
        if (tr.right > hr.left + (w - 16) * PX) moonY = Math.max(6, Math.ceil((tr.bottom - hr.top) / PX) + 2);
      }
    } catch (e) { moonY = 6; }
  }
  function drawSky() {
    const W = sky.width, H = sky.height;
    window.__homeMoon = { x: (W - 15) * PX, y: moonY * PX, w: 8 * PX, h: 6 * PX }; // test hook (css px inside #home)
    const band = Math.ceil(H * 0.7 / SKY.length);
    SKY.forEach((col, i) => { sc.fillStyle = col; sc.fillRect(0, i * band, W, band + 1); });
    sc.fillStyle = SKY[SKY.length - 1]; sc.fillRect(0, SKY.length * band, W, H);
    for (let i = 0; i < 70; i++) {
      const h = hash(i, 7), x = h % W, y = (h >>> 8) % Math.floor(H * 0.55);
      const tw = (hash(i, Math.floor(skyT * 2)) & 7) === 0;
      sc.fillStyle = tw ? '#5f574f' : ((h >>> 20) & 3) === 0 ? '#ffec27' : '#fff1e8';
      sc.fillRect(x, y, 1, 1);
    }
    // moon
    const my = moonY;
    sc.fillStyle = '#ffec27'; sc.fillRect(W - 14, my, 6, 6); sc.fillRect(W - 15, my + 1, 8, 4); sc.fillStyle = SKY[Math.min(SKY.length - 1, Math.floor(my / band))]; sc.fillRect(W - 12, my, 3, 3);
    HILLS.forEach((L, li) => {
      const off = skyT * L.sp;
      sc.fillStyle = L.col;
      for (let x = 0; x < W; x += 2) { // 2-px steps keep the 8-bit staircase look
        const wx = x + off;
        const y = Math.round(H * L.base - L.amp * (Math.sin(wx * L.f) * 0.6 + Math.sin(wx * L.f * 2.3 + li) * 0.4));
        sc.fillRect(x, y, 2, H - y);
      }
    });
  }
  function loop(now) {
    raf = 0;
    if (!isHome()) return;
    if (now - skyLast >= 100) { skyT += (skyLast ? Math.min(0.25, (now - skyLast) / 1000) : 0); skyLast = now; drawSky(); }
    raf = requestAnimationFrame(loop);
  }
  function startSky() {
    sizeSky(); drawSky();
    if (!still() && !raf) { skyLast = 0; raf = requestAnimationFrame(loop); }
  }

  // ---------- view toggle ----------
  const toggle = $('view-toggle');
  function isHome() { return document.body.classList.contains('home-on'); }
  function setUrl(map) {
    try {
      const p = new URLSearchParams(location.search);
      if (map) p.set('map', '1'); else p.delete('map');
      const s = p.toString();
      history.replaceState(null, '', location.pathname + (s ? '?' + s : '') + location.hash);
    } catch (e) { /* the view still changes */ }
  }
  function show(homeOn, focus) {
    document.body.classList.toggle('home-on', !!homeOn);
    home.hidden = !homeOn;
    toggle.textContent = homeOn ? 'Map' : 'Home';
    toggle.setAttribute('aria-label', homeOn ? 'Show the world map' : 'Back to the home screen');
    toggle.setAttribute('aria-pressed', homeOn ? 'false' : 'true');
    setUrl(!homeOn);
    try { window.dispatchEvent(new Event('resize')); } catch (e) { /* map keeps its size */ }
    if (homeOn) startSky();
    if (focus) { const f = homeOn ? $('home-play') : $('map'); if (f) try { f.focus(); } catch (e) { /* ignore */ } }
  }
  toggle.addEventListener('click', () => show(!isHome(), true));
  window.addEventListener('resize', () => { if (isHome()) { sizeSky(); drawSky(); } });

  drawLogo();
  buildPlay();
  buildNext();
  buildGroups();
  markFirst(); // G-14
  buildColl();
  show(!mapParam, false);

  window.__home = {
    isHome,
    show: (on) => show(on, false),
    groups: () => GROUPS.map((g) => ({ id: g.id, title: g.title, places: built.filter((b) => b.group === g.id).map((b) => b.place) })),
    cards: () => built.map((b) => Object.assign({}, b)),
    cont: () => (cont ? Object.assign({}, cont) : null),
    next: () => (next ? Object.assign({}, next) : null),
    animated: () => !!raf,
  };
}());
