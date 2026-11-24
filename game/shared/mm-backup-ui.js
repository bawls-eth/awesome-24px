// MMBackupUI (R4 O-04): the ONE Backup / Restore block for pages that do not carry the backup tool up front (the Hub).
// load(base) lazy-loads MMBackup and the same owner cleaners as the Lantern page (so a restore here cleans every key exactly as there).
// mount(el, opts) draws: "Back up everything" (MMBackup.bundle -> file), "Restore from a file" (MMBackup.plan -> preview -> Confirm ->
// MMBackup.apply). Nothing is written before Confirm; a refused file or Cancel writes nothing. Text only through textContent.
(function (root) {
  'use strict';
  var MODS = [['MMRng', 'rng'], ['MMClasses', 'mm-classes'], ['MMWeapons', 'mm-weapons'], ['MMUnlocks', 'mm-unlocks'], ['MMItems', 'mm-items'],
    ['MMProfile', 'mm-profile'], ['MMStash', 'mm-stash'], ['MMMap', 'mm-map'], ['MMAngler', 'mm-angler'], ['MMBugs', 'mm-bugs'],
    ['MMHubProfile', 'profile'], ['MMDaily', 'mm-daily'], ['MMAccess', 'mm-access'], ['MMGift', 'mm-gift'], ['MMBackup', 'mm-backup']];
  var loading = null;
  function load(base) {
    if (root.MMBackup && root.MMAngler && root.MMBugs) return Promise.resolve(root.MMBackup);
    if (loading) return loading;
    var one = function (name, file) {
      return new Promise(function (resolve) {
        if (root[name]) { resolve(); return; }
        var s = document.createElement('script');
        s.src = (base || '') + file + '.js';
        s.onload = function () { resolve(); };
        s.onerror = function () { resolve(); };
        document.head.appendChild(s);
      });
    };
    loading = MODS.reduce(function (p, m) { return p.then(function () { return one(m[0], m[1]); }); }, Promise.resolve())
      .then(function () { var B = root.MMBackup || null; if (!B) loading = null; return B; });
    return loading;
  }
  function el(tag, cls, text) { var e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }
  function storageOf(opts) { try { return (opts && opts.storage) || root.localStorage; } catch (e) { return null; } }

  function mount(host, opts) {
    opts = opts || {};
    if (!host || host.__mmBackup) return null;
    host.__mmBackup = true;
    var row = el('div', 'mmb-row');
    var bk = el('button', 'mmb-btn', 'Back up everything'); bk.type = 'button'; bk.id = 'mmb-backup';
    bk.setAttribute('aria-label', 'Back up every save and setting to one file');
    var lab = el('label', 'mmb-btn mmb-file', 'Restore from a file');
    var inp = document.createElement('input'); inp.type = 'file'; inp.accept = '.json,application/json'; inp.id = 'mmb-restore';
    inp.setAttribute('aria-label', 'Restore from a backup file');
    lab.appendChild(inp);
    row.appendChild(bk); row.appendChild(lab);
    var note = el('p', 'mmb-note', 'One file holds the town, the Realm, every game and your settings. Restore accepts old town files and Lantern backups too.');
    var status = el('p', 'mmb-status'); status.id = 'mmb-status'; status.setAttribute('role', 'status'); status.setAttribute('aria-live', 'polite');
    var conf = el('div', 'mmb-confirm'); conf.id = 'mmb-confirm'; conf.hidden = true; conf.setAttribute('role', 'alertdialog'); conf.setAttribute('aria-label', 'Replace these saves?');
    var ch = el('h3', 'mmb-h', 'Replace these saves?');
    var meta = el('p', 'mmb-meta'); meta.id = 'mmb-meta';
    var list = el('ul', 'mmb-list'); list.id = 'mmb-list';
    var skip = el('p', 'mmb-skip'); skip.id = 'mmb-skip'; skip.hidden = true;
    var yes = el('button', 'mmb-btn mmb-yes', 'Confirm restore'); yes.type = 'button'; yes.id = 'mmb-yes';
    var no = el('button', 'mmb-btn', 'Cancel'); no.type = 'button'; no.id = 'mmb-no';
    var cr = el('div', 'mmb-row'); cr.appendChild(yes); cr.appendChild(no);
    [ch, meta, list, skip, cr].forEach(function (x) { conf.appendChild(x); });
    [row, note, status, conf].forEach(function (x) { host.appendChild(x); });
    var pending = null, B = null;
    var say = function (t, bad) { status.textContent = t; status.className = 'mmb-status' + (bad ? ' mmb-bad' : ''); };
    var hide = function () { pending = null; conf.hidden = true; list.textContent = ''; skip.textContent = ''; skip.hidden = true; meta.textContent = ''; };

    bk.addEventListener('click', function () {
      say('Making your backup…');
      load(opts.base).then(function (MB) {
        if (!MB) { say('Could not load the backup tool. Check your connection and try again.', true); return; }
        var st = storageOf(opts), bun;
        try { if (!st) throw new Error('blocked'); bun = MB.bundle(st); } catch (e) { say('Could not read your saves here (site data is blocked), so there is nothing to back up.', true); return; }
        var n = Object.keys(bun.keys).length;
        try {
          var url = URL.createObjectURL(new Blob([JSON.stringify(bun, null, 1)], { type: 'application/json' }));
          var a = document.createElement('a'); a.href = url; a.download = 'pixeltown-backup.json';
          document.body.appendChild(a); a.click(); a.remove();
          setTimeout(function () { URL.revokeObjectURL(url); }, 2000);
        } catch (e) { say('Could not make the backup file.', true); return; }
        var warn = bun.warnings && bun.warnings.length ? bun.warnings.map(function (w) { return w.label; }).join(', ') : '';
        say(warn ? 'Backup saved (' + n + ' items), but this was damaged on this device and was left out: ' + warn + '.' : 'Backup saved: ' + n + ' saves and settings in one file. Keep it somewhere safe.', !!warn);
      });
    });

    inp.addEventListener('change', function () {
      var f = inp.files && inp.files[0]; inp.value = '';
      hide();
      if (!f) return;
      if (f.size > 3000000) { say('That file is too big to be a backup. Nothing was changed.', true); return; }
      say('Reading the backup…');
      var fr = new FileReader();
      fr.onerror = function () { say('Could not read that file. Nothing was changed.', true); };
      fr.onload = function () {
        var text = String(fr.result || '');
        load(opts.base).then(function (MB) {
          B = MB;
          if (!MB) { say('Could not load the restore tool. Check your connection and try again. Nothing was changed.', true); return; }
          var p; try { p = MB.plan(text); } catch (e) { p = { ok: false }; }
          if (!p || !p.ok) { say(((p && p.message) || 'That file does not look like a backup.') + (/nothing was changed/i.test((p && p.message) || '') ? '' : ' Nothing was changed.'), true); return; }
          pending = p;
          meta.textContent = (p.kind === 'town' ? 'An old town-only file.' : 'A full backup' + (p.made ? ' made ' + String(p.made).slice(0, 10) : '') + (p.build ? ' (build ' + p.build + ')' : '') + '.')
            + (p.newer ? ' It was made by a newer version of the game.' : '') + ' ' + (p.saves || p.keys).length + ' saves, ' + (p.settings || []).length + ' settings.';
          p.keys.forEach(function (k) { list.appendChild(el('li', '', MB.labelOf(k) + ((p.settings || []).indexOf(k) >= 0 ? ' (setting)' : ''))); });
          if (p.skipped && p.skipped.length) {
            skip.textContent = 'Skipped, kept as they are on this device: ' + p.skipped.map(function (x) { return x.label + ' (' + x.why + ')'; }).join(', ') + '.';
            skip.hidden = false;
          }
          conf.hidden = false;
          say('Check the list, then Confirm or Cancel. Nothing has changed yet.');
          try { no.focus(); } catch (e) { /* ignore */ }
        });
      };
      try { fr.readAsText(f); } catch (e) { say('Could not read that file. Nothing was changed.', true); }
    });
    no.addEventListener('click', function () { hide(); say('Restore cancelled. Nothing was changed.'); });
    conf.addEventListener('keydown', function (e) { if (e.key === 'Escape') { e.preventDefault(); hide(); say('Restore cancelled. Nothing was changed.'); } });
    yes.addEventListener('click', function () {
      var p = pending; hide();
      if (!p || !B) return;
      var st = storageOf(opts), r;
      try { r = st ? B.apply(st, p) : { ok: false }; } catch (e) { r = { ok: false }; }
      if (r && r.ok) {
        say('Restored ' + r.restored.length + ' item' + (r.restored.length === 1 ? '' : 's') + '. Reloading…');
        if (opts.reload !== false) setTimeout(function () { try { root.location.reload(); } catch (e) { /* ignore */ } }, 800);
      } else say((r && r.message) || 'Restore failed, nothing was changed.', true);
    });
    return { host: host, load: load };
  }
  root.MMBackupUI = { load: load, mount: mount };
  // auto-mount: <div data-mm-backup data-base="../shared/"></div>
  function auto() {
    try {
      var hs = document.querySelectorAll('[data-mm-backup]');
      for (var i = 0; i < hs.length; i++) mount(hs[i], { base: hs[i].getAttribute('data-base') || '' });
    } catch (e) { /* ignore */ }
  }
  if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', auto); else auto();
  }
}(typeof self !== 'undefined' ? self : this));
