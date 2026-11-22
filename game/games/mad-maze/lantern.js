// The Lantern: Mad Maze hub page. Pure DOM + textContent (never innerHTML with user data).
// State lives only in localStorage `pixeltown-mm-v1`, always written through MMProfile.clean.
// `pixeltown-save-v1` is only READ (legacy import) or written by a confirmed Restore.
(function () {
  'use strict';
  var A = window.MMArt, P = window.MMProfile, B = window.MMBackup, C = window.MMClasses, I = window.MMItems, U = window.MMUnlocks, W = window.MMWeapons;
  var KEY = P.KEY, LEGACY = P.LEGACY_KEY;
  var CARRY_MAX = 24;
  var CLS_ORDER = C && C.CLASSES ? Object.keys(C.CLASSES) : ['ranger', 'frostcaller', 'herald', 'punk', 'bruiser', 'graveTender', 'trickster', 'shadowPaw', 'rogue', 'warlock', 'paladin', 'berserker', 'druid', 'necromancer'];
  var REASONS = {
    'level-20-required': 'Reach level 20 to retire',
    'picnic-no-fall': 'Picnic heroes never Fall',
    'hardcore-no-rekindle': 'Hardcore heroes cannot Rekindle',
    'roster-full': 'Your roster is full (12 heroes)',
    'no-hero': 'That hero is gone'
  };
  // Coming back to the Lantern settles the loot of the Realm World and its Warrens (MMStash): kept finds are copied into the stash
  // (then the active hero's pack); `pixeltown-save-v1` is only read for the realm backpack, never written.
  var S = window.MMStash, settled = null;
  if (S) { try { settled = S.settle(localStorage, { Profile: P, src: 'lantern' }); } catch (e) { settled = null; } }
  var profile = load();
  var selected = null;
  var offerHidden = false;
  var confirmRetire = null;
  var confirmFall = null;
  var TEST = /[?&]test=1\b/.test(location.search);
  var ACTIVE_KEY = P.ACTIVE_KEY;
  var ABILITY_TEXT = {
    yarnSnare: 'Throws yarn that roots enemies in place and makes them take extra damage.',
    shards: 'Fires a fan of ice shards that hurt and slow everything they hit.',
    heal: 'A warm aura that heals nearby friends and toughens their guard.',
    moshShield: 'Raises a shield in front of you that blocks shots and stuns close enemies.',
    groundPound: 'Slams the ground to hurt and push back enemies around you.',
    siphon: 'Drains life from enemies and heals you with it.',
    blink: 'Blinks a few steps away and leaves a decoy behind.',
    smoke: 'Vanishes for a moment, then your next volley hits harder.',
    shadowDash: 'Dashes a few steps, then your next strikes land critical hits.',
    drainOrb: 'Hurls a dark orb that hurts enemies and drains their life into you.',
    bulwark: 'Raises a wide shield, heals you and toughens nearby friends.',
    rageSlam: 'A furious slam that hurts and shoves enemies, and boosts your power.',
    thornBloom: 'Thorny vines root enemies, prick them back and heal you.',
    raiseBones: 'Raises bone minions that fight for you and siphon life.'
  };
  var SRC_NAME = { world: 'World', dungeon: 'Warren', event: 'Event', cache: "Survivor's Cache" };
  var STAT_NAMES = [['pow', 'POW'], ['grd', 'GRD'], ['swf', 'SWF'], ['knk', 'KNK'], ['vig', 'VIG'], ['wit', 'WIT']];

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
    hubReport();
  }
  // Hub map progress (MMHubProfile, its own key): milestones this save and the Realm finds already show.
  function hubReport() { try { var hs = profile.heroes.concat(profile.hall), top = hs.reduce(function (n, h) { return Math.max(n, h.level || 0); }, 0); window.MMHubProfile.sync(localStorage, 'lantern', [hs.length > 0 && 'hero1', !!(S && S.readFinds(localStorage).recent.some(function (f) { return f.src === 'dungeon'; })) && 'warren', top >= 5 && 'level5', top >= 10 && 'level10', profile.hall.some(function (h) { return h.how === 'retire'; }) && 'retire']); } catch (e) { /* hub map progress is optional */ } }
  function loadActive() {
    var raw = null;
    try { raw = localStorage.getItem(ACTIVE_KEY); } catch (e) { raw = null; }
    var a = P.cleanActive(raw);
    if (raw !== null && JSON.stringify(a) !== raw) { try { localStorage.setItem(ACTIVE_KEY, JSON.stringify(a)); } catch (e) { /* ignore */ } }
    return a;
  }
  function saveActive(heroId) {
    var a = P.cleanActive({ v: 1, heroId: heroId });
    try { localStorage.setItem(ACTIVE_KEY, JSON.stringify(a)); } catch (e) { say('Could not remember your hero (storage is blocked).', true); }
    return a;
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
  function itemInfo(it) {
    if (it.keepsake) return { name: 'Keepsake' + (it.from ? ' of ' + String(it.from).replace(/[\u0000-\u001f]/g, '') : ''), icon: I.KIND_ICONS.keepsake, tier: null, color: '#ffd36b' };
    var m = null;
    try { m = I.fromLegacy(it.id, it.r); } catch (e) { m = null; }
    var d = I.describe(it.id, m ? m.tier : it.r);
    return { name: d.name, icon: d.icon, tier: d.tier, color: d.color };
  }
  function itemLabel(it) {
    var d = itemInfo(it);
    return d.name + (d.tier === null ? '' : ' tier ' + d.tier);
  }
  // Icon + friendly name + coloured tier badge, built with textContent only.
  function fillItem(node, it) {
    var d = itemInfo(it);
    node.textContent = '';
    node.appendChild(el('span', 'ico', d.icon)).setAttribute('aria-hidden', 'true');
    node.appendChild(el('span', 'iname', d.name));
    if (d.tier !== null) {
      var b = el('span', 'tier t' + d.tier, 'T' + d.tier);
      b.style.background = d.color;
      node.appendChild(b);
    }
    node.setAttribute('aria-label', itemLabel(it));
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
    if (S && S.deposit) { var r = S.deposit(profile, heroId, idx); if (!r.ok) { say(r.msg, true); return false; } save(); say(r.msg); render(); return true; }
    if (S && S.soulbound && S.soulbound(h.items[idx])) { say('Soulbound gear stays with its hero, so it cannot go in the stash.', true); return false; }
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
    say('Fallen. ' + r.fame + ' fame banked' + (r.keepsake ? ', and a Keepsake waits in the stash.' : r.keepsakeLost ? '. The stash is full, so the Keepsake could not be stored. Free a slot before the next Fall.' : '.'));
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
    profile = P.importLegacy(real, profile);
    var sb = profile.skippedSoulbound || 0; // read before save(): clean() drops this non-saved count
    save();
    var h = heroById('legacy-ranger');
    var sbText = sb ? ' ' + sb + ' soulbound item' + (sb === 1 ? '' : 's') + ' (T11+) stayed in the Realm, because soulbound gear never leaves it.' : '';
    if (h) { selected = h.id; say('Your Legacy Ranger is here. The old save was left untouched.' + sbText); }
    else say('Your roster is full (12 heroes), so the Legacy Ranger was not added. Retire or free a slot and try again.', true);
    render();
  }
  // LB3: calm backup note. Own tiny key `pixeltown-backupnote-v1` = {v:1, at:'YYYY-MM-DD'} (UTC). Bad/oversized/future dates -> no note. Plain text only.
  var NOTE_KEY = 'pixeltown-backupnote-v1';
  function todayUtc() {
    var m = TEST ? /[?&]bdate=(\d{4}-\d{2}-\d{2})(&|$)/.exec(location.search) : null;
    if (m && cleanDay(m[1])) return m[1];
    return new Date().toISOString().slice(0, 10);
  }
  function cleanDay(s) {
    if (typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
    var d = new Date(s + 'T00:00:00Z');
    return isFinite(d.getTime()) && d.toISOString().slice(0, 10) === s ? s : null;
  }
  function loadNote() {
    try {
      var raw = localStorage.getItem(NOTE_KEY);
      if (typeof raw !== 'string' || raw.length > 200) return null;
      var o = JSON.parse(raw);
      var at = o && typeof o === 'object' && !Array.isArray(o) ? cleanDay(o.at) : null;
      return at && at <= todayUtc() ? at : null;
    } catch (e) { return null; }
  }
  function noteText() {
    var at = loadNote();
    if (!at) return 'Last backup: none yet';
    var n = Math.round((Date.parse(todayUtc() + 'T00:00:00Z') - Date.parse(at + 'T00:00:00Z')) / 86400000);
    return 'Last backup: ' + (n <= 0 ? 'today' : n === 1 ? '1 day ago' : n + ' days ago');
  }
  function renderNote() { var el = $('backup-last'); if (el) el.textContent = noteText(); }
  function downloadBackup() {
    // Raw stored values, read before anything is cleaned or saved, so a corrupt key is backed up as it was.
    var data = JSON.stringify(B.bundle(localStorage), null, 1);
    try {
      var url = URL.createObjectURL(new Blob([data], { type: 'application/json' }));
      var a = document.createElement('a');
      a.href = url; a.download = 'mad-maze-backup.json';
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(function () { URL.revokeObjectURL(url); }, 2000);
      try { localStorage.setItem(NOTE_KEY, JSON.stringify({ v: 1, at: todayUtc() })); } catch (e2) { /* blocked: the note just stays as it was */ }
      renderNote();
      downloaded = true; dropArmed = false; renderPregear();
      say('Backup file saved. Keep it somewhere safe.');
    } catch (e) { say('Could not make the backup file.', true); }
  }

  // Restore is two steps: validate the file and show what would change, then write only on Confirm.
  var pending = null, lastFocus = null;
  function hideConfirm() {
    var wasOpen = !$('restore-confirm').hidden;
    pending = null;
    var p = $('restore-confirm'); p.hidden = true;
    $('restore-list').textContent = '';
    $('restore-summary').textContent = ''; $('restore-summary').hidden = true;
    if (wasOpen && lastFocus && lastFocus.focus) { try { lastFocus.focus(); } catch (e) { /* ignore */ } }
  }
  // Keep Tab / focus inside the restore panel until it is closed; Escape cancels.
  document.addEventListener('keydown', function (e) {
    var p = $('restore-confirm'); if (p.hidden) return;
    if (e.key === 'Escape') { e.preventDefault(); hideConfirm(); say('Restore cancelled. Nothing was changed.'); return; }
    if (e.key !== 'Tab') return;
    var f = [$('restore-yes'), $('restore-no')], i = f.indexOf(document.activeElement);
    e.preventDefault();
    if (i < 0) f[0].focus();
    else f[(i + (e.shiftKey ? f.length - 1 : 1)) % f.length].focus();
  });
  document.addEventListener('focusin', function (e) {
    var p = $('restore-confirm');
    if (!p.hidden && !p.contains(e.target)) $('restore-no').focus();
  });
  function showConfirm(plan, summary, marks) {
    pending = plan;
    var list = $('restore-list'); list.textContent = '';
    plan.keys.forEach(function (k) {
      var li = el('li', '', B.labelOf(k));
      li.appendChild(el('span', 'muted', ' (' + k + ')' + (marks && marks[k] ? ': ' + marks[k] : '')));
      list.appendChild(li);
    });
    if (summary) { $('restore-summary').textContent = summary; $('restore-summary').hidden = false; }
    $('restore-confirm').hidden = false;
    say('Check the list below, then Confirm or Cancel. Nothing has changed yet.');
    lastFocus = document.activeElement && document.activeElement !== document.body ? document.activeElement : $('restore');
    $('restore-no').focus();
  }
  function confirmRestore() {
    var plan = pending;
    hideConfirm();
    if (!plan) return;
    var r;
    try { r = B.apply(localStorage, plan); } catch (e) { r = { ok: false, message: 'Restore failed, nothing was changed.' }; }
    renderPregear();
    if (r && r.ok) {
      profile = load(); selected = null; render();
      say('Restored ' + r.restored.length + ' saved item' + (r.restored.length === 1 ? '' : 's') + '.');
    } else {
      profile = load(); render();
      say((r && r.message) || 'Restore failed, nothing was changed.', true);
    }
  }
  function restoreFile(file) {
    hideConfirm();
    if (!file) return;
    if (file.size > 3000000) { say('That file is too big to be a backup.', true); return; }
    var fr = new FileReader();
    fr.onerror = function () { say('Could not read that file.', true); };
    fr.onload = function () {
      var plan;
      try { plan = B.plan(String(fr.result)); } catch (e) { plan = { ok: false }; }
      if (plan && plan.ok) showConfirm(plan);
      else say((plan && plan.message) || 'That file does not look like a Mad Maze backup.', true);
    };
    try { fr.readAsText(file); } catch (e) { say('Could not read that file.', true); }
  }

  // SV3: the one-time pre-gear snapshot (MMBackup.snapshotPregear). Offered here only when it exists, restored only after the same
  // plan + Confirm step as a file (never automatically), and deletable (tap twice) once a normal backup file has been downloaded.
  var downloaded = false, dropArmed = false;
  function pregearAt() {
    try { var o = JSON.parse(localStorage.getItem(B.PREGEAR_KEY)); var t = o && typeof o.at === 'number' ? new Date(o.at) : null; return t && isFinite(t.getTime()) ? t.toISOString().slice(0, 10) : null; } catch (e) { return null; }
  }
  function renderPregear() {
    var row = $('pregear-row'); if (!row) return;
    var has = !!(B.hasPregear && B.hasPregear(localStorage));
    row.hidden = !has;
    if (!has) { dropArmed = false; return; }
    var at = pregearAt(), note = loadNote();
    $('pregear-note').textContent = 'A safety copy of your saves was kept from just before gear arrived' + (at ? ' (' + at + ')' : '') + '. You can restore it, and nothing changes until you confirm.';
    var canDrop = downloaded || !!(note && at && note >= at);
    var d = $('pregear-drop');
    d.hidden = !canDrop;
    d.textContent = dropArmed ? 'Tap again to delete the snapshot' : 'Delete the old snapshot';
    d.setAttribute('aria-label', dropArmed ? 'Confirm: delete the old pre-gear snapshot' : 'Delete the old pre-gear snapshot');
    $('pregear-keep').hidden = !(canDrop && dropArmed);
  }
  function restorePregear() {
    hideConfirm(); dropArmed = false; renderPregear();
    var plan;
    try { plan = B.planRestorePregear(localStorage); } catch (e) { plan = { ok: false }; }
    if (!plan || !plan.ok) { say((plan && plan.message) || 'The pre-gear snapshot could not be read, so nothing was changed.', true); return; }
    var marks = {};
    plan.changed.forEach(function (k) { marks[k] = 'changes'; });
    plan.same.forEach(function (k) { marks[k] = 'already the same'; });
    plan.added.forEach(function (k) { marks[k] = 'not on this device now'; });
    var n = plan.items, pl = function (x, w) { return x + ' ' + w + (x === 1 ? '' : 's'); };
    var summary = 'Pre-gear snapshot' + (plan.at ? ' from ' + new Date(plan.at).toISOString().slice(0, 10) : '') + ': ' +
      pl(plan.changed.length, 'save') + ' would change, ' + plan.same.length + ' already the same, ' + plan.added.length + ' would be added. ' +
      'Realm pack: ' + pl(n.now, 'item') + ' now, ' + pl(n.then, 'item') + ' in the snapshot.' +
      (plan.kept.length ? ' ' + pl(plan.kept.length, 'other save') + ' not in the snapshot stay as they are.' : '');
    showConfirm(plan, summary, marks);
  }
  function dropPregear() {
    if (!dropArmed) { dropArmed = true; renderPregear(); say('Delete the pre-gear snapshot? Tap again to delete it, or Keep it. Your backup file is not touched.'); $('pregear-drop').focus(); return; }
    dropArmed = false;
    var ok = false;
    try { ok = B.dropPregear(localStorage); } catch (e) { ok = false; }
    renderPregear();
    if (ok) say('The old pre-gear snapshot was deleted.'); else say('Could not delete the snapshot.', true);
  }

  // ---------- read-only Abilities and unlocks panel ----------
  var abilFrom = null;
  function abilRow(cls, titleText, bodyText, state, stateText) {
    var li = el('li', 'anode ' + state);
    var t = el('div', 'atitle'); t.appendChild(el('strong', '', titleText)); t.appendChild(el('span', 'tag ' + state, stateText)); li.appendChild(t);
    if (bodyText) li.appendChild(el('div', 'abtext', bodyText));
    return li;
  }
  function openAbilities(heroId, from) {
    var h = heroById(heroId), box = $('abil-panel'); if (!h || !U || !box) return;
    abilFrom = from || null;
    var lv = Math.max(1, Math.min(P.MAX_LEVEL, Math.floor(Number(h.level)) || 1));
    var body = $('abil-body'); body.textContent = '';
    $('abil-title').textContent = h.name + ' - ' + clsName(h.cls) + ', level ' + lv;
    // slots
    body.appendChild(el('h3', '', 'Ability slots'));
    var sg = C && C.arenaSignature ? C.arenaSignature(h.cls) : null, sl = el('ul', 'alist'); sl.id = 'abil-slots';
    U.activeSlots(lv).forEach(function (s) {
      var cd = s.id === 'dash' ? U.dashCooldown(lv) + ' s' : s.id === 'nova' ? '8 s' : s.id === 'shield' ? '14 s' : sg ? sg.cooldown + ' s' : '';
      var name = s.id === 'sig' && sg ? sg.name : s.name + (s.tier === 2 ? ' II' : '');
      var li = abilRow('slot', s.key.toUpperCase() + ': ' + name, 'Unlocks at level ' + s.level + (cd ? ' - cooldown ' + cd : ''),
        s.unlocked ? 'reached' : 'locked', s.unlocked ? 'Ready' : 'Unlocks at level ' + s.level);
      li.setAttribute('data-slot', s.key); sl.appendChild(li);
    });
    body.appendChild(sl);
    // tree
    body.appendChild(el('h3', '', 'Unlock tree'));
    var nl = el('ul', 'alist'); nl.id = 'abil-nodes';
    U.nodes(h.cls).forEach(function (n) {
      var got = lv >= n.lv;
      var li = abilRow('node', n.name, n.text, got ? 'reached' : 'locked', got ? 'Reached' : 'Unlocks at level ' + n.lv);
      li.setAttribute('data-node', n.id); li.setAttribute('data-lv', String(n.lv)); li.setAttribute('data-state', got ? 'reached' : 'locked');
      nl.appendChild(li);
    });
    body.appendChild(nl);
    // progress to next node
    var nx = U.next(h.cls, lv), pw = el('div', 'xp'); pw.id = 'abil-next';
    if (nx) {
      var all = U.nodes(h.cls), prev = 1;
      all.forEach(function (n) { if (n.lv <= lv && n.lv > prev) prev = n.lv; });
      var pct = Math.max(0, Math.min(100, Math.floor((lv - prev) / (nx.lv - prev) * 100)));
      var bar = el('div', 'bar'); bar.setAttribute('role', 'progressbar'); bar.setAttribute('aria-label', 'Progress to ' + nx.name);
      bar.setAttribute('aria-valuemin', '0'); bar.setAttribute('aria-valuemax', '100'); bar.setAttribute('aria-valuenow', String(pct));
      var fill = el('div', 'fill'); fill.style.width = pct + '%'; bar.appendChild(fill); pw.appendChild(bar);
      pw.appendChild(el('span', 'xptext', 'Next: ' + nx.name + ' at level ' + nx.lv + ' (' + (nx.lv - lv) + ' more level' + (nx.lv - lv === 1 ? '' : 's') + ')'));
    } else pw.appendChild(el('span', 'xptext', 'Every unlock reached.'));
    body.appendChild(pw);
    // fire pattern
    if (W && W.resolve && W.describe) {
      var d = ''; try { d = W.describe(W.resolve(h.cls, 'base', 0)); } catch (e) { d = ''; }
      if (d) { body.appendChild(el('h3', '', 'Fire pattern')); var fp = el('p', 'abtext', d); fp.id = 'abil-fire'; body.appendChild(fp); }
    }
    box.hidden = false; $('abil-close').focus(); body.scrollTop = 0;
  }
  function closeAbilities() {
    var box = $('abil-panel'); if (!box || box.hidden) return;
    box.hidden = true; $('abil-body').textContent = '';
    var f = abilFrom; abilFrom = null;
    if (f && f.isConnected && f.focus) { try { f.focus(); } catch (e) { /* ignore */ } }
  }
  document.addEventListener('keydown', function (e) {
    var box = $('abil-panel'); if (!box || box.hidden) return;
    if (e.key === 'Escape') { e.preventDefault(); closeAbilities(); return; }
    if (e.key === 'Tab') { e.preventDefault(); $('abil-close').focus(); }
  });
  (function () {
    var box = $('abil-panel'); if (!box) return;
    $('abil-close').addEventListener('click', closeAbilities);
    box.addEventListener('click', function (e) { if (e.target === box) closeAbilities(); });
  })();

  // ---------- render ----------
  function focusKey() {
    var a = document.activeElement; if (!a || a === document.body) return null;
    var li = a.closest && a.closest('#heroes li[data-hero]');
    if (li) return { t: 'hero', id: li.getAttribute('data-hero'), c: (String(a.className).match(/\b(pick|abil|rekindle|retire|testfall|keep)\b/) || [])[1] || 'pick' };
    if (a.classList.contains('slot')) return { t: 'slot', i: a.getAttribute('data-slot') };
    if (a.classList.contains('item')) return { t: 'item', i: a.getAttribute('data-idx') };
    return null;
  }
  function restoreFocus(k) {
    if (!k) return;
    var q = k.t === 'hero' ? '#heroes li[data-hero="' + k.id + '"] .' + k.c : k.t === 'slot' ? '#stash .slot[data-slot="' + k.i + '"]' : '#carry .item[data-idx="' + k.i + '"]';
    var n = null; try { n = document.querySelector(q); } catch (e) { n = null; }
    if ((!n || n.disabled) && k.t === 'hero') n = document.querySelector('#heroes li[data-hero="' + k.id + '"] .pick');
    if (n && !n.disabled) n.focus();
  }
  function heroDetails(li, h) {
    var c = C.CLASSES[h.cls]; if (!c) return;
    var need = I.xpToNext(h.level), maxed = h.level >= P.MAX_LEVEL;
    var pct = maxed ? 100 : Math.max(0, Math.min(100, Math.floor(h.xp / need * 100)));
    var wrap = el('div', 'xp');
    var bar = el('div', 'bar'); bar.setAttribute('role', 'progressbar');
    bar.setAttribute('aria-label', h.name + ' level ' + h.level + ' experience');
    bar.setAttribute('aria-valuemin', '0'); bar.setAttribute('aria-valuemax', '100'); bar.setAttribute('aria-valuenow', String(pct));
    var fill = el('div', 'fill'); fill.style.width = pct + '%'; bar.appendChild(fill);
    wrap.appendChild(bar);
    wrap.appendChild(el('span', 'xptext', maxed ? 'Level ' + h.level + ' (max)' : 'Level ' + h.level + ': ' + h.xp + ' / ' + need + ' xp'));
    li.appendChild(wrap);
    var stats = el('ul', 'stats'); stats.setAttribute('aria-label', h.name + ' stats');
    var life = Math.min(c.cap.life, c.base.life + c.gain.life * (h.level - 1));
    var foc = C.maxFocus(h.cls, h.level, 0);
    [['LIFE', life], ['FOC', foc]].concat(STAT_NAMES.map(function (s) { return [s[1], c.base[s[0]]]; })).forEach(function (p) {
      var s = el('li', 'stat'); s.appendChild(el('span', 'k', p[0])); s.appendChild(el('span', 'v', p[1])); stats.appendChild(s);
    });
    li.appendChild(stats);
    var ab = el('ul', 'abilities'); ab.setAttribute('aria-label', h.name + ' abilities');
    var a = c.ability, x = el('li', 'ability');
    x.appendChild(el('strong', '', a.name));
    x.appendChild(el('span', 'tag', a.cost + ' FOC'));
    x.appendChild(el('span', 'abtext', ABILITY_TEXT[a.id] || 'A special class move.'));
    ab.appendChild(x);
    li.appendChild(ab);
  }
  function render() {
    var fk = focusKey();
    if (selected && !heroById(selected)) selected = null;
    if (!selected && profile.heroes.length) selected = profile.heroes[0].id;
    $('fame').textContent = 'Account fame: ' + profile.fame;
    $('import-offer').hidden = !(!profile.migratedFrom && legacyRealm() && !offerHidden);

    var ul = $('heroes'); ul.textContent = '';
    profile.heroes.forEach(function (h) {
      var li = el('li', h.id === selected ? 'sel' : ''); li.setAttribute('data-hero', h.id);
      var ac = A && A.artClassFor(h.cls);
      if (ac) { var cv = el('canvas', 'heroart'); cv.width = 96; cv.height = 96; cv.setAttribute('data-art', ac); cv.setAttribute('aria-hidden', 'true'); cv.hidden = true; li.appendChild(cv); }
      li.appendChild(el('div', 'hname', h.name));
      var meta = el('div', 'meta', clsName(h.cls) + ' - Level ' + h.level + ' - fame ' + h.fame);
      meta.appendChild(el('span', 'tag mode', h.mode === 'picnic' ? 'Picnic' : h.mode === 'hardcore' ? 'Hardcore' : 'Classic'));
      li.appendChild(meta);
      heroDetails(li, h);
      var row = el('div', 'row');
      var pick = el('button', 'btn pick', h.id === selected ? 'Selected' : 'Select'); pick.type = 'button';
      pick.addEventListener('click', function () { selected = h.id; confirmRetire = null; confirmFall = null; render(); });
      row.appendChild(pick);
      if (U) {
        var ab = el('button', 'btn abil', 'Abilities'); ab.type = 'button';
        ab.setAttribute('aria-label', 'Abilities and unlocks for ' + h.name); ab.setAttribute('aria-haspopup', 'dialog');
        ab.addEventListener('click', function () { openAbilities(h.id, ab); });
        row.appendChild(ab);
      }
      var rk = el('button', 'btn rekindle', 'Rekindle'); rk.type = 'button';
      var rkWhy = h.mode === 'hardcore' ? REASONS['hardcore-no-rekindle'] : profile.heroes.length >= 12 ? REASONS['roster-full'] : '';
      if (rkWhy) { rk.disabled = true; rk.title = rkWhy; }
      rk.addEventListener('click', function () { doRekindle(h.id); });
      pick.setAttribute('aria-label', (h.id === selected ? 'Selected hero ' : 'Select hero ') + h.name);
      rk.setAttribute('aria-label', 'Rekindle ' + h.name + ' at half level');
      var rt = el('button', 'btn retire', confirmRetire === h.id ? 'Tap again to retire' : 'Retire'); rt.type = 'button';
      var rtWhy = h.level < P.MAX_LEVEL ? 'Reach level 20 to retire (now ' + h.level + ')' : '';
      if (rtWhy) { rt.disabled = true; rt.title = rtWhy; }
      rt.addEventListener('click', function () {
        if (confirmRetire !== h.id) { confirmRetire = h.id; say('Retire ' + h.name + ' with honour? Tap Retire again to confirm.'); render(); return; }
        confirmRetire = null; doRetire(h.id);
      });
      rt.setAttribute('aria-label', (confirmRetire === h.id ? 'Confirm: retire ' : 'Retire ') + h.name + ' to the Hall');
      rt.textContent = confirmRetire === h.id ? 'Tap again to retire' : 'Retire to the Hall';
      row.appendChild(rk); row.appendChild(rt);
      if (confirmRetire === h.id) {
        var cn = el('button', 'btn keep', 'Keep playing'); cn.type = 'button'; cn.setAttribute('aria-label', 'Cancel retire for ' + h.name);
        cn.addEventListener('click', function () { confirmRetire = null; say('Retire cancelled. ' + h.name + ' is still here.'); render(); });
        row.appendChild(cn);
      }
      if (TEST) {
        var tf = el('button', 'btn testfall', confirmFall === h.id ? 'Tap again: Fall now' : 'Test a Fall'); tf.type = 'button';
        tf.setAttribute('aria-label', 'Test a Fall for ' + h.name + ' (testing only)');
        if (h.mode === 'picnic') { tf.disabled = true; tf.title = REASONS['picnic-no-fall']; }
        tf.addEventListener('click', function () {
          if (confirmFall !== h.id) { confirmFall = h.id; say('Test a Fall for ' + h.name + '? Tap again to confirm. This removes the hero.'); render(); return; }
          confirmFall = null; doFall(h.id);
        });
        row.appendChild(tf);
      }
      li.appendChild(row);
      if (rkWhy) li.appendChild(el('span', 'reason', rkWhy));
      if (rtWhy) li.appendChild(el('span', 'reason', rtWhy));
      ul.appendChild(li);
    });
    $('heroes-empty').hidden = profile.heroes.length > 0;
    var st = $('start'), sh = heroById(selected);
    if (sh) {
      st.setAttribute('href', './index.html?hero=' + encodeURIComponent(sh.id) + (new URLSearchParams(location.search).get('from') === 'hub' ? '&from=hub' : ''));
      st.removeAttribute('aria-disabled'); st.removeAttribute('tabindex'); st.style.pointerEvents = '';
    } else {
      st.removeAttribute('href'); st.setAttribute('aria-disabled', 'true'); st.setAttribute('tabindex', '-1'); st.style.pointerEvents = 'none';
      if (!$('status').textContent) { say('Create a hero first: Start run needs a hero to play.'); }
    }

    // new-hero class list
    var sel = $('new-class'), prev = sel.value, ok = unlockedClasses();
    sel.textContent = '';
    CLS_ORDER.forEach(function (id) {
      var o = el('option', '', ok[id] ? clsName(id) : clsName(id) + ' (locked)');
      o.value = id; o.disabled = !ok[id]; sel.appendChild(o);
    });
    sel.value = ok[prev] ? prev : 'ranger';
    updateClassNote();
    paintArt();

    // stash
    var cnt = profile.stash.filter(Boolean).length;
    $('stash-count').textContent = cnt + ' / 16';
    var carry = $('carry'); carry.textContent = '';
    $('carry-title').textContent = sh ? sh.name + ' carries ' + sh.items.length + ' / ' + CARRY_MAX : 'Select a hero to see what they carry';
    if (sh) sh.items.forEach(function (it, i) {
      var li = el('li'); var b = el('button', 'item'); fillItem(b, it); b.type = 'button'; b.setAttribute('data-idx', i);
      b.addEventListener('click', function () { toStash(sh.id, i); });
      li.appendChild(b); carry.appendChild(li);
    });
    var grid = $('stash'); grid.textContent = '';
    profile.stash.forEach(function (it, i) {
      var b = el('button', 'slot' + (it ? ' full' : '')); if (it) fillItem(b, it); b.type = 'button';
      b.setAttribute('role', 'listitem'); b.setAttribute('data-slot', i);
      b.setAttribute('aria-label', it ? 'Stash slot ' + (i + 1) + ': ' + itemLabel(it) + '. Give to selected hero' : 'Stash slot ' + (i + 1) + ' empty');
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

    // recent finds (pixeltown-realm-v1 `finds`, newest first)
    var fl = $('finds'), recent = [];
    if (fl) {
      try { recent = S ? S.readFinds(localStorage).recent : []; } catch (e) { recent = []; }
      fl.textContent = '';
      recent.forEach(function (it) {
        var li = el('li', 'find'); var b = el('span', 'item'); fillItem(b, it);
        li.appendChild(b); li.appendChild(el('span', 'tag src', SRC_NAME[it.src] || 'World'));
        fl.appendChild(li);
      });
      $('finds-empty').hidden = recent.length > 0;
    }
    restoreFocus(fk);
  }
  // ---------- hero art (real class animations; the canvas stays hidden when a class has none) ----------
  var artSet = null, artRaf = 0;
  var REDUCE = !!(window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches);
  function paintArt() {
    var cvs = document.querySelectorAll('canvas.heroart'), t = performance.now() / 1000, any = false;
    var pv = $('new-class-art'); if (pv) pv.setAttribute('data-art', (A && A.artClassFor($('new-class').value)) || '');
    for (var i = 0; i < cvs.length; i++) {
      var cv = cvs[i], cls = cv.getAttribute('data-art');
      var a = artSet && cls ? artSet.anim(cls, 'idle', 'down') : null;
      if (!a) { cv.hidden = true; continue; }
      cv.hidden = false; any = true;
      var g = cv.getContext('2d'); if (!g) continue;
      g.clearRect(0, 0, cv.width, cv.height);
      var f = artSet.draw(g, a, REDUCE ? 0 : t, cv.width / 2, Math.round(a.ay * 0.375) + 4, 0.375, false);
      cv.setAttribute('data-frame', String(f));
    }
    if (any && !REDUCE && !artRaf) artRaf = requestAnimationFrame(function tick() { artRaf = 0; paintArt(); });
  }
  function loadArt() {
    if (!A) return;
    A.loadAll('../../assets/arcane/', { actions: ['idle'], dirs: ['down'] }).then(function (s) { artSet = s; paintArt(); }, function () { /* keep the text cards */ });
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
  $('new-class').addEventListener('change', function () { updateClassNote(); paintArt(); });
  $('new-form').addEventListener('submit', function (e) {
    e.preventDefault();
    var mode = (document.querySelector('input[name=mode]:checked') || {}).value;
    if (createHero($('new-name').value, $('new-class').value, mode)) $('new-name').value = '';
  });
  $('rest').addEventListener('click', rest);
  $('backup').addEventListener('click', downloadBackup);
  $('restore-yes').addEventListener('click', confirmRestore);
  $('pregear-restore').addEventListener('click', restorePregear);
  $('pregear-drop').addEventListener('click', dropPregear);
  $('pregear-keep').addEventListener('click', function () { dropArmed = false; renderPregear(); say('Kept the pre-gear snapshot.'); $('pregear-restore').focus(); });
  $('restore-no').addEventListener('click', function () { hideConfirm(); say('Restore cancelled. Nothing was changed.'); });
  $('restore').addEventListener('change', function (e) { restoreFile(e.target.files && e.target.files[0]); e.target.value = ''; });
  $('start').addEventListener('click', function (e) {
    if ($('start').getAttribute('aria-disabled') === 'true') { e.preventDefault(); say('Make or pick a hero first.', true); return; }
    saveActive(selected);
  });

  if (TEST) {
    window.__lantern = { active: loadActive, fall: doFall, get: function () { return JSON.parse(JSON.stringify(profile)); }, settled: function () { return settled ? { items: settled.items, stash: settled.stash, hero: settled.hero, waiting: settled.waiting, fame: settled.fame } : null; }, reload: function () { profile = load(); render(); } };
  }
  // another tab (a Realm World or Warren run) paid finds into the stash: reload, so a later save here never writes an older copy
  window.addEventListener('storage', function (e) { if (e.key === KEY || e.key === null) { profile = load(); render(); } });
  selected = loadActive().heroId;
  hubReport();
  render();
  renderNote();
  renderPregear();
  if (settled && settled.ok && (settled.items || settled.fame)) say(S.text(settled).replace(/, \+\d+ shards/, '') + ' from your travels.');
  startScene();
  loadArt();
}());
