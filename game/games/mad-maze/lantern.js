// The Lantern: Mad Maze hub page. Pure DOM + textContent (never innerHTML with user data).
// State lives only in localStorage `pixeltown-mm-v1`, always written through MMProfile.clean.
// `pixeltown-save-v1` is only READ (legacy import) or written by an explicit Restore.
(function () {
  'use strict';
  var P = window.MMProfile, B = window.MMBackup, C = window.MMClasses, I = window.MMItems;
  var KEY = P.KEY, LEGACY = P.LEGACY_KEY;
  var CARRY_MAX = 24;
  var CLS_ORDER = ['ranger', 'frostcaller', 'herald', 'punk', 'bruiser'];
  var REASONS = {
    'level-20-required': 'Reach level 20 to retire',
    'picnic-no-fall': 'Picnic heroes never Fall',
    'hardcore-no-rekindle': 'Hardcore heroes cannot Rekindle',
    'roster-full': 'Your roster is full (12 heroes)',
    'no-hero': 'That hero is gone'
  };
  var profile = load();
  var selected = null;
  var offerHidden = false;
  var confirmRetire = null;

  function $(id) { return document.getElementById(id); }
  function el(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text !== undefined) n.textContent = String(text);
    return n;
  }
  function isObj(v) { return !!v && typeof v === 'object' && !Array.isArray(v); }

  function load() {
    var raw = null;
    try { raw = localStorage.getItem(KEY); } catch (e) { raw = null; }
    return P.clean(raw);
  }
  function save() {
    profile = P.clean(profile);
    try { localStorage.setItem(KEY, JSON.stringify(profile)); } catch (e) { say('Could not save here (storage is blocked).', true); }
  }
  function say(msg, err) {
    var s = $('status');
    s.textContent = msg || '';
    s.className = err ? 'err' : '';
  }
  function cleanName(s) {
    // length-limited, control characters removed; rendered with textContent only
    return String(s || '').replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, 24);
  }
  function legacyRealm() {
    var raw = null;
    try { raw = localStorage.getItem(LEGACY); } catch (e) { return null; }
    if (typeof raw !== 'string') return null;
    var o; try { o = JSON.parse(raw); } catch (e) { return null; }
    return isObj(o) && isObj(o.realm) ? o.realm : null;
  }
  function clsName(id) { var c = C.CLASSES[id]; return c ? c.name : id; }
  function itemLabel(it) {
    if (it.keepsake) return 'Keepsake' + (it.from ? ' of ' + it.from : '');
    var m = null;
    try { m = I.fromLegacy(it.id, it.r); } catch (e) { m = null; }
    var name = m && (m.name || m.id) ? (m.name || m.id) : it.id;
    return name + ' T' + it.r;
  }
  function heroById(id) {
    for (var i = 0; i < profile.heroes.length; i++) if (profile.heroes[i].id === id) return profile.heroes[i];
    return null;
  }
  function unlockedClasses() {
    var ok = {};
    C.START.forEach(function (c) { ok[c] = true; });
    var seen = profile.heroes.concat(profile.hall);
    seen.forEach(function (h) { C.unlocks(h.cls, h.level).forEach(function (c) { ok[c] = true; }); });
    return ok;
  }
  function unlockText(id) {
    var u = C.CLASSES[id].unlock;
    return u.from ? 'reach level ' + u.level + ' with ' + (u.from === '*' ? 'any class' : clsName(u.from)) : '';
  }

  // ---------- actions ----------
  function createHero(name, cls, mode) {
    name = cleanName(name);
    if (!name) return say('Please give your hero a name.', true);
    if (profile.heroes.length >= 12) return say('Your roster is full (12 heroes).', true);
    if (!unlockedClasses()[cls]) return say('That class is not unlocked yet.', true);
    var n = 1, id;
    do { id = 'hero-' + cls + '-' + (n++); } while (heroById(id));
    profile.heroes.push({ id: id, name: name, cls: cls, level: 1, xp: 0, fame: 0, bonus: 0, mode: mode === 'picnic' ? 'picnic' : 'classic', items: [] });
    save();
    selected = id;
    say(name + ' is ready. ' + (mode === 'picnic' ? 'Picnic mode: no Fall.' : 'Classic mode.'));
    render();
    return id;
  }
  function rest() {
    drawBurst = 40;
    say(selected && heroById(selected) ? heroById(selected).name + ' is fully healed. Nice and rested.' : 'Everyone is fully healed. Nice and rested.');
  }
  function toStash(heroId, idx) {
    var h = heroById(heroId); if (!h || !h.items[idx]) return false;
    var slot = profile.stash.indexOf(null);
    if (slot < 0) { say('The stash is full (16 slots).', true); return false; }
    profile.stash[slot] = h.items.splice(idx, 1)[0];
    save(); say('Moved to the stash.'); render(); return true;
  }
  function toHero(heroId, slot) {
    var h = heroById(heroId);
    if (!h) { say('Pick a hero first.', true); return false; }
    if (!profile.stash[slot]) return false;
    if (h.items.length >= CARRY_MAX) { say(h.name + ' cannot carry more (24 items).', true); return false; }
    h.items.push(profile.stash[slot]); profile.stash[slot] = null;
    save(); say('Given to ' + h.name + '.'); render(); return true;
  }
  function doFall(heroId) {
    var r = P.fall(profile, heroId);
    if (!r.ok) { say(REASONS[r.reason] || 'That cannot happen.', true); return r; }
    profile = r.profile; save();
    if (selected === heroId) selected = null;
    say('Fallen. ' + r.fame + ' fame banked' + (r.keepsake ? ', and a Keepsake waits in the stash.' : '.'));
    render(); return r;
  }
  function doRekindle(heroId) {
    var r = P.rekindle(profile, heroId);
    if (!r.ok) { say(REASONS[r.reason] || 'Cannot rekindle.', true); return r; }
    profile = r.profile; save(); selected = r.hero.id;
    say('Rekindled at level ' + r.hero.level + '.'); render(); return r;
  }
  function doRetire(heroId) {
    var r = P.retire(profile, heroId);
    if (!r.ok) { say(REASONS[r.reason] || 'Cannot retire.', true); return r; }
    profile = r.profile; save(); if (selected === heroId) selected = null;
    say('Retired with honour. ' + r.fame + ' fame banked and a place in the Hall.'); render(); return r;
  }
  function doImport() {
    var real = legacyRealm();
    if (!real) { say('No old Realm hero was found.', true); return; }
    profile = P.importLegacy(real, profile); save();
    var h = heroById('legacy-ranger'); if (h) selected = h.id;
    say('Your Legacy Ranger is here. The old save was left untouched.'); render();
  }
  function downloadBackup() {
    save();
    var data = JSON.stringify(B.bundle(localStorage), null, 1);
    try {
      var url = URL.createObjectURL(new Blob([data], { type: 'application/json' }));
      var a = document.createElement('a');
      a.href = url; a.download = 'mad-maze-backup.json';
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(function () { URL.revokeObjectURL(url); }, 2000);
      say('Backup file saved. Keep it somewhere safe.');
    } catch (e) { say('Could not make the backup file.', true); }
  }
  function restoreFile(file) {
    if (!file) return;
    if (file.size > 3000000) { say('That file is too big to be a backup.', true); return; }
    var fr = new FileReader();
    fr.onerror = function () { say('Could not read that file.', true); };
    fr.onload = function () {
      var r;
      try { r = B.restore(localStorage, String(fr.result)); } catch (e) { r = { ok: false }; }
      if (r && r.ok) {
        profile = load(); selected = null; render();
        say('Restored ' + r.restored.length + ' saved item' + (r.restored.length === 1 ? '' : 's') + '.');
      } else say('That file does not look like a Mad Maze backup.', true);
    };
    try { fr.readAsText(file); } catch (e) { say('Could not read that file.', true); }
  }

  // ---------- render ----------
  function render() {
    if (selected && !heroById(selected)) selected = null;
    if (!selected && profile.heroes.length) selected = profile.heroes[0].id;
    $('fame').textContent = 'Account fame: ' + profile.fame;
    $('import-offer').hidden = !(!profile.migratedFrom && legacyRealm() && !offerHidden);

    var ul = $('heroes'); ul.textContent = '';
    profile.heroes.forEach(function (h) {
      var li = el('li', h.id === selected ? 'sel' : ''); li.setAttribute('data-hero', h.id);
      li.appendChild(el('div', 'hname', h.name));
      var meta = el('div', 'meta', clsName(h.cls) + ' - Level ' + h.level + ' - fame ' + h.fame);
      meta.appendChild(el('span', 'tag mode', h.mode === 'picnic' ? 'Picnic' : h.mode === 'hardcore' ? 'Hardcore' : 'Classic'));
      li.appendChild(meta);
      var row = el('div', 'row');
      var pick = el('button', 'btn pick', h.id === selected ? 'Selected' : 'Select'); pick.type = 'button';
      pick.addEventListener('click', function () { selected = h.id; confirmRetire = null; render(); });
      row.appendChild(pick);
      var rk = el('button', 'btn rekindle', 'Rekindle'); rk.type = 'button';
      var rkWhy = h.mode === 'hardcore' ? REASONS['hardcore-no-rekindle'] : profile.heroes.length >= 12 ? REASONS['roster-full'] : '';
      if (rkWhy) { rk.disabled = true; rk.title = rkWhy; }
      rk.addEventListener('click', function () { doRekindle(h.id); });
      var rt = el('button', 'btn retire', confirmRetire === h.id ? 'Tap again to retire' : 'Retire'); rt.type = 'button';
      var rtWhy = h.level < P.MAX_LEVEL ? 'Reach level 20 to retire (now ' + h.level + ')' : '';
      if (rtWhy) { rt.disabled = true; rt.title = rtWhy; }
      rt.addEventListener('click', function () {
        if (confirmRetire !== h.id) { confirmRetire = h.id; say('Retire ' + h.name + ' with honour? Tap Retire again to confirm.'); render(); return; }
        confirmRetire = null; doRetire(h.id);
      });
      row.appendChild(rk); row.appendChild(rt);
      li.appendChild(row);
      if (rkWhy) li.appendChild(el('span', 'reason', rkWhy));
      if (rtWhy) li.appendChild(el('span', 'reason', rtWhy));
      ul.appendChild(li);
    });
    $('heroes-empty').hidden = profile.heroes.length > 0;
    var st = $('start'), sh = heroById(selected);
    if (sh) { st.setAttribute('href', './index.html?hero=' + encodeURIComponent(sh.id)); st.removeAttribute('aria-disabled'); }
    else { st.setAttribute('href', './index.html'); st.setAttribute('aria-disabled', 'true'); }

    // new-hero class list
    var sel = $('new-class'), prev = sel.value, ok = unlockedClasses();
    sel.textContent = '';
    CLS_ORDER.forEach(function (id) {
      var o = el('option', '', ok[id] ? clsName(id) : clsName(id) + ' (locked)');
      o.value = id; o.disabled = !ok[id]; sel.appendChild(o);
    });
    sel.value = ok[prev] ? prev : 'ranger';
    updateClassNote();

    // stash
    var cnt = profile.stash.filter(Boolean).length;
    $('stash-count').textContent = cnt + ' / 16';
    var carry = $('carry'); carry.textContent = '';
    $('carry-title').textContent = sh ? sh.name + ' carries ' + sh.items.length + ' / ' + CARRY_MAX : 'Select a hero to see what they carry';
    if (sh) sh.items.forEach(function (it, i) {
      var li = el('li'); var b = el('button', 'item', itemLabel(it)); b.type = 'button';
      b.addEventListener('click', function () { toStash(sh.id, i); });
      li.appendChild(b); carry.appendChild(li);
    });
    var grid = $('stash'); grid.textContent = '';
    profile.stash.forEach(function (it, i) {
      var b = el('button', 'slot' + (it ? ' full' : ''), it ? itemLabel(it) : ''); b.type = 'button';
      b.setAttribute('role', 'listitem'); b.setAttribute('data-slot', i);
      b.setAttribute('aria-label', it ? 'Stash slot ' + (i + 1) + ': ' + itemLabel(it) : 'Stash slot ' + (i + 1) + ' empty');
      if (it) b.addEventListener('click', function () { toHero(selected, i); });
      grid.appendChild(b);
    });

    // hall
    var hall = $('hall'); hall.textContent = '';
    profile.hall.slice().reverse().forEach(function (e) {
      var li = el('li'); li.appendChild(el('div', 'hname', e.name));
      li.appendChild(el('div', 'meta', clsName(e.cls) + ' - Level ' + e.level + ' - ' + (e.how === 'fall' ? 'Fell' : 'Retired with honour') + ' - fame ' + e.fame));
      hall.appendChild(li);
    });
    $('hall-empty').hidden = profile.hall.length > 0;
  }
  function updateClassNote() {
    var id = $('new-class').value, c = C.CLASSES[id];
    var ok = unlockedClasses();
    var locked = CLS_ORDER.filter(function (x) { return !ok[x]; }).map(function (x) { return clsName(x) + ': ' + unlockText(x); });
    $('new-class-note').textContent = (c ? c.ability.name + ' is the signature move. ' : '') + (locked.length ? 'To unlock: ' + locked.join('; ') + '.' : '');
  }

  // ---------- scene (procedural, decorative) ----------
  var drawBurst = 0;
  function startScene() {
    var cv = $('scene'), g = cv.getContext && cv.getContext('2d'); if (!g) return;
    var reduce = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
    var t = 0, flies = [];
    for (var i = 0; i < 14; i++) flies.push({ x: (i * 53) % 360, y: 20 + (i * 31) % 80, p: i });
    function frame() {
      t += 1; g.clearRect(0, 0, 360, 120);
      g.fillStyle = '#0c0618'; g.fillRect(0, 0, 360, 120);
      g.fillStyle = '#1d1236'; g.fillRect(0, 96, 360, 24);
      var glow = g.createRadialGradient(180, 62, 4, 180, 62, 90);
      glow.addColorStop(0, 'rgba(255,211,107,.55)'); glow.addColorStop(1, 'rgba(255,211,107,0)');
      g.fillStyle = glow; g.fillRect(0, 0, 360, 120);
      g.fillStyle = '#5a4a7a'; g.fillRect(177, 36, 6, 60); // post
      g.fillStyle = '#ffd36b'; g.fillRect(168, 26, 24, 22); // lantern
      g.fillStyle = '#fff3c4'; g.fillRect(174, 32, 12, 10);
      g.fillStyle = '#3d2c63'; g.fillRect(120, 88, 120, 10); // fountain basin
      g.fillStyle = '#6ec6ff'; g.fillRect(126, 90, 108, 5);
      flies.forEach(function (f) {
        var a = reduce ? f.p : t / 30 + f.p;
        g.fillStyle = 'rgba(255,240,150,' + (0.4 + 0.4 * Math.sin(a * 2)) + ')';
        g.fillRect(Math.round(f.x + Math.sin(a) * 12), Math.round(f.y + Math.cos(a * 1.3) * 8), 3, 3);
      });
      if (drawBurst > 0) {
        g.fillStyle = 'rgba(160,220,255,.8)';
        for (var k = 0; k < 10; k++) g.fillRect(180 + (k - 5) * 8 + Math.sin(t + k) * 3, 86 - (40 - drawBurst) * 0.8 - (k % 3) * 6, 3, 3);
        drawBurst--;
      }
      if (!reduce || drawBurst > 0) requestAnimationFrame(frame);
    }
    frame();
    // restart the loop after a fountain rest when motion is reduced
    $('rest').addEventListener('click', function () { if (reduce) frame(); });
  }

  // ---------- wire up ----------
  $('import-yes').addEventListener('click', doImport);
  $('import-no').addEventListener('click', function () { offerHidden = true; render(); });
  $('new-class').addEventListener('change', updateClassNote);
  $('new-form').addEventListener('submit', function (e) {
    e.preventDefault();
    var mode = (document.querySelector('input[name=mode]:checked') || {}).value;
    if (createHero($('new-name').value, $('new-class').value, mode)) $('new-name').value = '';
  });
  $('rest').addEventListener('click', rest);
  $('backup').addEventListener('click', downloadBackup);
  $('restore').addEventListener('change', function (e) { restoreFile(e.target.files && e.target.files[0]); e.target.value = ''; });
  $('start').addEventListener('click', function (e) { if ($('start').getAttribute('aria-disabled') === 'true') { e.preventDefault(); say('Make or pick a hero first.', true); } });

  if (/[?&]test=1\b/.test(location.search)) {
    window.__lantern = { fall: doFall, get: function () { return JSON.parse(JSON.stringify(profile)); }, reload: function () { profile = load(); render(); } };
  }
  render();
  startScene();
}());
