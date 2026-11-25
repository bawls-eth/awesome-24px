// MMBackup: export/import the known `pixeltown-*` localStorage keys as one JSON bundle.
// Restore is two steps: plan() parses and validates EVERYTHING (each value is cleaned by its owner module)
// and apply() writes it atomically (snapshot first, roll every key back if any write throws).
// Nothing here throws. UMD: browser global MMBackup, or require().
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    const req = (p) => { try { return require(p); } catch (e) { return null; } };
    module.exports = factory(() => ({
      profile: req('./mm-profile.js'), map: req('./mm-map.js'), angler: req('./mm-angler.js'),
      bugs: req('./mm-bugs.js'), hubProfile: req('./profile.js'),
      access: req('./mm-access.js'), gift: req('./mm-gift.js'),
      tames: req('./mm-tames.js'), isles: req('./mm-isles.js'), feedback: req('./mm-feedback.js'), notebook: req('./mm-notebook.js')
    }));
  } else {
    root.MMBackup = factory(() => ({
      profile: root.MMProfile || null, map: root.MMMap || null, angler: root.MMAngler || null,
      bugs: root.MMBugs || null, hubProfile: root.MMHubProfile || null,
      access: root.MMAccess || null, gift: root.MMGift || null,
      tames: root.MMTames || null, isles: root.MMIsles || null, feedback: root.MMFeedback || null, notebook: root.MMNotebook || null
    }));
  }
}(typeof self !== 'undefined' ? self : this, function (getOwners) {
  const FORMAT = 'pixeltown-backup';
  const VERSION = 2; // bundle format (unchanged since keys became a map); R4 adds the build stamp in bundle()
  const BUILD = '2026-11-24-r4';
  const SAVE_KEY = 'pixeltown-save-v1';
  const MAX_VALUE = 2000000;
  const MAX_KEYS = 80; // R4 O-04: raised from 50 (settings + hints joined the bundle). A build before R4 refuses a file over 50 entries, named.
  const MAX_TOTAL = 6000000; // all values of one bundle together
  const MAX_DEPTH = 8;
  const MAX_NODES = 60000;
  const BAD_KEYS = ['__proto__', 'constructor', 'prototype'];

  // Generic cleaner for game saves that have no owner module here (realm, arms, stalk, jam): a plain JSON object,
  // bounded depth and node count, prototype-pollution keys dropped. Everything else is kept (the owner game cleans it on load).
  function cleanPlain(v) {
    let nodes = 0;
    function walk(x, d) {
      if (++nodes > MAX_NODES || d > MAX_DEPTH) throw new Error('too deep or big');
      if (Array.isArray(x)) return x.map((e) => walk(e, d + 1));
      if (x && typeof x === 'object') {
        const o = {};
        Object.keys(x).forEach((k) => { if (BAD_KEYS.indexOf(k) < 0) o[k] = walk(x[k], d + 1); });
        return o;
      }
      if (typeof x === 'number' && !isFinite(x)) return 0;
      return x;
    }
    if (!isObj(v)) return undefined;
    try { return walk(v, 0); } catch (e) { return undefined; }
  }

  const isObj = (v) => !!v && typeof v === 'object' && !Array.isArray(v);
  const has = (o, k) => Object.prototype.hasOwnProperty.call(o, k);

  // Top-level fields the town save (game/main.js) writes. An old single-save file must contain one of them.
  const TOWN_FIELDS = ['name', 'species', 'frame', 'realm', 'lifetimeStats', 'lifetime', 'lastLoginDate', 'loginStreak',
    'resources', 'crafted', 'fishlog', 'home', 'tank', 'mail', 'birthdays', 'dailies', 'bugoff', 'sfxMuted', 'musicEnabled',
    'reduceMotion', 'achievementsUnlocked', 'equippedTitle', 'lastSeenVersion', 'villagerAffinity', 'caveInv', 'cavePick',
    'caveSeed', 'bestieId', 'bestieName', 'ffDiscovered', 'weedsPulled', 'turnipBuys', 'sellStreak', 'lastSellDate', 'guests',
    'visitDays', 'lastVisitDate', 'sellDays', 'lastSellDay', 'bounty']; // ID-09 day counts, ID-18 bounties (cycle 8 S, additive)
  const looksLikeTown = (o) => isObj(o) && TOWN_FIELDS.some((f) => has(o, f));

  // key -> (owners, parsedValue) => cleaned value (or undefined when the owner module is missing / value unusable)
  const CLEANERS = {
    'pixeltown-save-v1': (o, v) => (isObj(v) ? v : undefined),
    'pixeltown-mm-v1': (o, v) => (o.profile ? o.profile.clean(v) : undefined),
    'pixeltown-hub-v1': (o, v) => (o.map && o.map.cleanHub ? o.map.cleanHub(v) : undefined),
    'pixeltown-angler-v1': (o, v) => (o.angler ? o.angler.journal.clean(v) : undefined),
    'pixeltown-bugs-v1': (o, v) => (o.bugs && o.bugs.cleanSave ? o.bugs.cleanSave(v) : undefined),
    'pixeltown-profile-v1': (o, v) => (o.hubProfile ? o.hubProfile.sanitize(v) : undefined),
    'pixeltown-realm-v1': (o, v) => cleanPlain(v),
    'pixeltown-arms-v1': (o, v) => cleanPlain(v),
    'pixeltown-stalk-v1': (o, v) => cleanPlain(v),
    'pixeltown-jam-v1': (o, v) => cleanPlain(v),
    'pixeltown-access-v1': (o, v) => (o.access && o.access.prefs ? o.access.prefs.clean(v) : cleanPlain(v)),
    'pixeltown-gift-v1': (o, v) => (o.gift ? o.gift.clean(v) : cleanPlain(v)),
    // Biome Archipelago: owner cleaners turn anything corrupt into defaults; a non-object value is still refused.
    'pixeltown-tames-v1': (o, v) => (isObj(v) ? (o.tames ? o.tames.clean(v) : cleanPlain(v)) : undefined),
    'pixeltown-archipelago-v1': (o, v) => (isObj(v) ? (o.isles ? o.isles.clean(v) : cleanPlain(v)) : undefined),
    'pixeltown-medals-isles-v1': (o, v) => (isObj(v) ? (o.isles ? o.isles.cleanMedals(v) : cleanPlain(v)) : undefined),
    // Feedback box notes (device-only, never sent anywhere): the owner cleaner keeps only the known entry fields.
    'pixeltown-feedback-v1': (o, v) => (isObj(v) ? (o.feedback ? o.feedback.clean(v) : cleanPlain(v)) : undefined),
    // Town Realm Gate pointer chip (UI only): keep just the two known booleans, the shape main.js loadGatePointer() reads.
    'pixeltown-gate-pointer-v1': (o, v) => (isObj(v) ? { v: 1, dismissed: v.dismissed === true, reached: v.reached === true } : undefined),
    // Bug bash S3 (additive, VERSION stays 2): progress keys the export used to leave out, so Backup -> Restore on a new device lost
    // them. Each owner game cleans its own save on load (like realm / jam above); here they only pass the plain-JSON bounds.
    'pixeltown-mm-active-v1': (o, v) => (o.profile && o.profile.cleanActive ? o.profile.cleanActive(v) : cleanPlain(v)),
    'pixeltown-bugs-goals-v1': (o, v) => (isObj(v) ? (o.bugs && o.bugs.cleanGoals ? o.bugs.cleanGoals(v) : cleanPlain(v)) : undefined)
  };
  // Beta (QA -> PS 4): G-26 Isles nodes / pouch and G-25 deepest dungeon floor per biome. Shapes from isles.js:617-620 and dungeon.js:109-113.
  CLEANERS['pixeltown-isle-nodes-v1'] = (o, v) => {
    if (!isObj(v) || !isObj(v.isles)) return undefined;
    const isles = {};
    Object.keys(v.isles).slice(0, 32).forEach((k) => {
      const r = v.isles[k];
      if (!/^[a-z][a-z0-9_-]{0,31}$/.test(k) || !isObj(r)) return;
      const e = {};
      if (Array.isArray(r.n)) e.n = r.n.filter((x) => Array.isArray(x) && x.length === 2 && Number.isInteger(x[0]) && x[0] >= 0 && x[0] < 100000 && typeof x[1] === 'number' && isFinite(x[1]) && x[1] >= 0 && x[1] < 8.64e15).slice(0, 200).map((x) => [x[0], x[1]]);
      if (isObj(r.p)) { const p = {}; Object.keys(r.p).slice(0, 64).forEach((f) => { const n = r.p[f]; if (/^[a-z][a-z0-9_]{0,31}$/.test(f) && typeof n === 'number' && isFinite(n)) p[f] = Math.max(0, Math.min(99, Math.floor(n))); }); e.p = p; }
      isles[k] = e;
    });
    return { v: 1, isles: isles };
  };
  CLEANERS['pixeltown-deep-v1'] = (o, v) => {
    if (!isObj(v) || !isObj(v.f)) return undefined;
    const f = {};
    Object.keys(v.f).slice(0, 32).forEach((k) => { const n = v.f[k]; if (/^[a-z]{2,12}$/.test(k) && Number.isInteger(n) && n >= 0 && n <= 3) f[k] = n; });
    return { v: 1, f: f };
  };
  ['pixeltown-jam-assist-v1', 'pixeltown-deepdelve-v1', 'pixeltown-deepdelve-runs-v1', 'pixeltown-deepdelve-creative-v1', 'pixeltown-angler-fun-v1',
    'pixeltown-stalk-practice-v1', 'pixeltown-bugs-pb-v1', 'pixeltown-dash-v1', 'pixeltown-pop-v1', 'pixeltown-stack-v1', 'pixeltown-echo-v1']
    .concat(['angler', 'bugs', 'dash', 'deepdelve', 'echo', 'pop', 'stack', 'stalk'].map((g) => 'pixeltown-medals-' + g + '-v1'))
    .forEach((k) => { CLEANERS[k] = (o, v) => cleanPlain(v); });
  // R4 O-04: ONE Backup = every game save key + all settings. Settings are raw '0' / '1' flags (mm-settings.js / sfx.js / motion.js /
  // realm.js read them as strings), so like the panel flag they are checked as raw text, never JSON-cleaned. UI hints that only say
  // "seen" are flags too. Left out on purpose (device-specific, see SAVE-KEYS.md): pixeltown-nav-v1 (this device's last page),
  // pixeltown-backupnote-v1 (when THIS device last backed up), pixeltown-save-v1-prev / -backup-pregear-v1 (safety copies),
  // probe keys, sessionStorage, the Deepdelve IndexedDB chunk cache, and the lowGfx field inside pixeltown-access-v1 (apply keeps the
  // device's own value: a phone's low-graphics choice must not follow a backup onto a desktop).
  const FLAG_KEYS = ['pixeltown-panel-collapsed', 'mm-sfx-muted', 'mm-music', 'mm-high-contrast', 'mm-reduce-motion', 'mm-aim-assist',
    'mm-aim-toggle', 'mm-bullet-shapes', 'mm-auto-fire', 'pixeltown-hub-hint-v1', 'pixeltown-bugs-hint-v1'];
  ['pixeltown-realm-audio-v1', 'pixeltown-realm-tutorial-v1', 'pixeltown-calm-v1', 'pixeltown-gearhint-v1', 'pixeltown-medals-jam-v1']
    .forEach((k) => { CLEANERS[k] = (o, v) => cleanPlain(v); });
  // cyc2-S ID-04 Hero notebook: the owner cleaner keeps only valid page ids and times (capped); without the module, a bounded inline copy
  // of the same rule (a page that loads MMBackup without MMNotebook must not export or restore junk).
  CLEANERS['pixeltown-notebook-v1'] = (o, v) => {
    if (!isObj(v)) return undefined;
    if (o.notebook && o.notebook.clean) return o.notebook.clean(v);
    const e = {}; let n = 0;
    if (isObj(v.e)) Object.keys(v.e).slice(0, 5000).forEach((k) => { const t = v.e[k]; if (n < 300 && /^(kill|boss|clear|tame):[a-z0-9_:@]{1,60}$/.test(k) && typeof t === 'number' && isFinite(t) && t >= 0 && t <= 8.64e15) { e[k] = Math.floor(t); n++; } });
    return { v: 1, e: e };
  };
  // cyc4-S ID-06: the assist pref 'mm-assist' ({dmg, aim}) is a player setting like mm-aim-assist (not hardware-bound like lowGfx), so it
  // joins the ONE Backup. It is JSON, not a '0'/'1' flag: cleaned inline with the same rule as MMAssist.clean (dmg 50..100 step 10, aim 0..3).
  CLEANERS['mm-assist'] = (o, v) => {
    if (!isObj(v)) return undefined;
    const n = (x) => (typeof x === 'number' && isFinite(x) ? x : NaN);
    const d = n(v.dmg), a = n(v.aim);
    return { dmg: isFinite(d) ? Math.max(50, Math.min(100, Math.round(d / 10) * 10)) : 100, aim: isFinite(a) ? Math.max(0, Math.min(3, Math.round(a))) : 0 };
  };
  const DEVICE_FIELDS = { 'pixeltown-access-v1': ['lowGfx'] };
  const KNOWN = Object.keys(CLEANERS).concat(FLAG_KEYS);
  const isSetting = (k) => /^mm-/.test(k) || k === 'pixeltown-access-v1' || k === 'pixeltown-realm-audio-v1' || k === 'pixeltown-panel-collapsed';
  const NAMES = {
    'pixeltown-save-v1': 'town save', 'pixeltown-mm-v1': 'Mad Maze heroes and stash', 'pixeltown-hub-v1': 'hub map',
    'pixeltown-angler-v1': 'Angler journal', 'pixeltown-bugs-v1': 'Bug Safari journal', 'pixeltown-profile-v1': 'player profile',
    'pixeltown-panel-collapsed': 'panel setting', 'pixeltown-realm-v1': 'Realm progress', 'pixeltown-arms-v1': 'weapon unlocks',
    'pixeltown-stalk-v1': 'Stalk Market save', 'pixeltown-jam-v1': 'Jam save',
    'pixeltown-access-v1': 'accessibility settings', 'pixeltown-gift-v1': 'daily gift',
    'pixeltown-tames-v1': 'tamed creatures', 'pixeltown-archipelago-v1': 'Archipelago progress', 'pixeltown-medals-isles-v1': 'Archipelago medals',
    'pixeltown-feedback-v1': 'feedback notes', 'pixeltown-gate-pointer-v1': 'Realm Gate pointer setting',
    'pixeltown-mm-active-v1': 'active Mad Maze hero', 'pixeltown-bugs-goals-v1': 'Bug Safari goals', 'pixeltown-bugs-pb-v1': 'Bug Safari bests',
    'pixeltown-jam-assist-v1': 'Jam assist setting', 'pixeltown-deepdelve-v1': 'Deepdelve progress', 'pixeltown-deepdelve-runs-v1': 'Deepdelve dives',
    'pixeltown-deepdelve-creative-v1': 'Deepdelve creative world', 'pixeltown-angler-fun-v1': 'Angler bests', 'pixeltown-stalk-practice-v1': 'Stalk Market practice',
    'pixeltown-dash-v1': 'Dash bests', 'pixeltown-pop-v1': 'Pop bests', 'pixeltown-stack-v1': 'Stack bests', 'pixeltown-isle-nodes-v1': 'Archipelago gathering spots and pouch', 'pixeltown-deep-v1': 'deepest dungeon floors', 'pixeltown-echo-v1': 'Echo Garden bests',
    'pixeltown-medals-angler-v1': 'Angler medals', 'pixeltown-medals-bugs-v1': 'Bug Safari medals', 'pixeltown-medals-dash-v1': 'Dash medals',
    'pixeltown-medals-deepdelve-v1': 'Deepdelve medals', 'pixeltown-medals-echo-v1': 'Echo Garden medals', 'pixeltown-medals-pop-v1': 'Pop medals',
    'pixeltown-medals-stack-v1': 'Stack medals', 'pixeltown-medals-stalk-v1': 'Stalk Market medals',
    'mm-sfx-muted': 'sound setting', 'mm-music': 'music setting', 'mm-high-contrast': 'high contrast setting', 'mm-reduce-motion': 'reduce motion setting',
    'mm-aim-assist': 'aim assist setting', 'mm-aim-toggle': 'aim toggle setting', 'mm-bullet-shapes': 'bullet shapes setting', 'mm-auto-fire': 'auto fire setting', 'mm-assist': 'assist setting',
    'pixeltown-hub-hint-v1': 'hub hint seen', 'pixeltown-bugs-hint-v1': 'Bug Safari hint seen', 'pixeltown-realm-audio-v1': 'Realm ambience setting',
    'pixeltown-realm-tutorial-v1': 'Realm tutorial progress', 'pixeltown-calm-v1': 'hidden hub ideas', 'pixeltown-gearhint-v1': 'gear hint seen',
    'pixeltown-medals-jam-v1': 'Jam medals', 'pixeltown-notebook-v1': 'hero notebook'
  };
  const label = (k) => NAMES[k] || k;

  function listKeys(storage) {
    const out = [];
    KNOWN.forEach((k) => { try { if (typeof storage.getItem(k) === 'string') out.push(k); } catch (e) { /* skip */ } });
    return out.sort();
  }

  // Raw stored strings of the known keys, exactly as they are (no cleaning). Beta S-03: a value its owner cleaner refuses (damaged on
  // this device) is left out and listed in `warnings` ([{key, label, why}], NOT enumerable, so it never lands in the file) so the
  // Backup button can say what was left out instead of "saved, keep it safe" for a file that cannot be restored.
  function bundle(storage) {
    const keys = {};
    const warnings = [];
    try {
      listKeys(storage).forEach((k) => {
        let v = null;
        try { v = storage.getItem(k); } catch (e) { v = null; }
        if (typeof v !== 'string') return;
        const why = checkValue(k, v);
        if (why) warnings.push({ key: k, label: label(k), why: why }); else keys[k] = v;
      });
    } catch (e) { /* ignore */ }
    // R4 O-04: additive stamp (an older build ignores it): which build made the file, when, and that it covers saves AND settings.
    const out = { format: FORMAT, v: VERSION, build: BUILD, made: new Date().toISOString(), scope: 'all', keys: keys };
    try { Object.defineProperty(out, 'warnings', { value: warnings, enumerable: false }); } catch (e) { /* frozen: no warnings */ }
    return out;
  }

  const fail = (error, message) => ({ ok: false, error: error, message: message, keys: [], entries: {} });

  // One stored / bundled value: {value} (the cleaned string to write) or {why} when it cannot be restored. Never throws.
  function cleanValue(k, rawStr, owners) {
    if (typeof rawStr !== 'string' || rawStr.length > MAX_VALUE) return { why: 'too big or unreadable' };
    if (FLAG_KEYS.indexOf(k) >= 0) {
      if (rawStr !== '0' && rawStr !== '1' && rawStr !== '"0"' && rawStr !== '"1"') return { why: 'not valid' };
      return { value: rawStr.replace(/"/g, '') };
    }
    let parsed;
    try { parsed = JSON.parse(rawStr); } catch (e) { return { why: 'not valid' }; }
    let cleaned;
    try { cleaned = CLEANERS[k](owners || getOwners(), parsed); } catch (e) { cleaned = undefined; }
    if (cleaned === undefined) return { why: 'not valid' };
    const s = JSON.stringify(cleaned);
    if (typeof s !== 'string' || s.length > MAX_VALUE) return { why: 'too big' };
    return { value: s };
  }
  // At export: '' when the value would restore, else why not. A key whose owner module is not on this page is only parse-checked
  // (its cleaner would refuse it here for the missing module, not for damage).
  const OWNER_OF = { 'pixeltown-mm-v1': 'profile', 'pixeltown-hub-v1': 'map', 'pixeltown-angler-v1': 'angler', 'pixeltown-bugs-v1': 'bugs', 'pixeltown-profile-v1': 'hubProfile' };
  function ownerPresent(k) { const o = OWNER_OF[k]; if (!o) return true; try { return !!getOwners()[o]; } catch (e) { return false; } }
  function checkValue(k, v) {
    try {
      const r = cleanValue(k, v);
      if (!r.why) return '';
      if (r.why === 'not valid' && !ownerPresent(k)) { try { JSON.parse(v); return ''; } catch (e) { return 'not valid'; } }
      return r.why;
    } catch (e) { return ''; }
  }

  // Validate and clean a restore file without touching storage.
  // Returns {ok, keys:[...], entries:{key: string}} or {ok:false, error, message}.
  function plan(input) {
    try {
      let obj = input;
      if (typeof obj === 'string') {
        try { obj = JSON.parse(obj); } catch (e) { return fail('not-json', 'That file is not valid JSON.'); }
      }
      if (!isObj(obj)) return fail('not-an-object', 'That file does not look like a Mad Maze backup.');
      const raw = {};
      let newer = false;
      const unknown = []; // beta b14 P3: entries this version does not know are skipped (never written), not fatal
      if (obj.format === FORMAT) {
        // Cycle 5 L (b14-r3-N01): say WHICH part of the bundle is at fault instead of a bare "damaged"
        if (!(Number(obj.v) >= 1)) return fail('bad-bundle', 'That backup file is damaged: its version number ("v") is missing or not a number.');
        if (!isObj(obj.keys)) return fail('bad-bundle', 'That backup file is damaged: its list of saves ("keys") is missing.');
        if (Number(obj.v) > VERSION) newer = true; // compat: a newer format still restores every key this build knows (the rest are named)
        const names = Object.keys(obj.keys);
        if (!names.length) return fail('empty', 'That backup file is empty.');
        if (names.length > MAX_KEYS) return fail('too-many-keys', 'That backup file has too many entries.');
        for (let i = 0; i < names.length; i++) {
          const k = names[i];
          if (KNOWN.indexOf(k) < 0) { if (unknown.length < MAX_KEYS) unknown.push(String(k).slice(0, 40)); continue; }
          const v = obj.keys[k];
          const s = typeof v === 'string' ? v : JSON.stringify(v);
          raw[k] = typeof s === 'string' ? s : ''; // a damaged value is skipped below, not fatal (beta S-03)
        }
      } else {
        // Old single-save format: a plain town save. Anything else (an old Angler export, say) is refused.
        if (!looksLikeTown(obj)) return fail('not-a-town-save', 'That file is not a town save or a full backup, so nothing was changed.');
        const s = JSON.stringify(obj);
        if (s.length > MAX_VALUE) return fail('too-big', 'That file is too big to be a save.');
        raw[SAVE_KEY] = s;
      }
      let total = 0;
      Object.keys(raw).forEach((k) => { total += raw[k].length; });
      if (total > MAX_TOTAL) return fail('too-big', 'That backup file is too big, so nothing was changed.');
      // Beta S-03 (b14-04): a damaged key is skipped (listed in `skipped`, the town save first), the rest still restores.
      // Only when NO key is restorable does the plan fail (as before: 'bad-value', nothing changed).
      const owners = getOwners();
      const entries = {};
      const skipped = [];
      const all = Object.keys(raw).sort();
      for (let i = 0; i < all.length; i++) {
        const k = all[i];
        const r = cleanValue(k, raw[k], owners);
        if (r.why) skipped.push({ key: k, label: label(k), why: r.why }); else entries[k] = r.value;
      }
      skipped.sort((a, b) => (a.key === SAVE_KEY ? -1 : b.key === SAVE_KEY ? 1 : a.key < b.key ? -1 : 1));
      unknown.forEach((k) => skipped.push({ key: k, label: k, why: 'not known by this version' }));
      const keys = Object.keys(entries).sort();
      if (!keys.length && unknown.length && skipped.length === unknown.length) {
        return fail('unknown-key', 'That backup contains only entries this game does not know (' + unknown[0] + '), so nothing was changed.');
      }
      if (!keys.length) {
        const first = skipped[0];
        return fail('bad-value', 'The ' + (first ? first.label : 'save') + ' in that backup is not valid, so nothing was changed.');
      }
      // R4 O-04 preview data: what kind of file, which build made it and when, and saves vs settings (for the confirm step).
      const out = { ok: true, keys: keys, entries: entries, labels: keys.map(label), skipped: skipped,
        kind: obj.format === FORMAT ? 'bundle' : 'town', newer: newer,
        build: typeof obj.build === 'string' && /^[\w.-]{1,32}$/.test(obj.build) ? obj.build : null,
        made: typeof obj.made === 'string' && obj.made.length <= 40 && isFinite(Date.parse(obj.made)) ? obj.made : null,
        settings: keys.filter(isSetting), saves: keys.filter((k) => !isSetting(k)) };
      const dmg = skipped.filter((x) => x.why !== 'not known by this version'), unk = skipped.filter((x) => x.why === 'not known by this version');
      if (skipped.length) {
        out.message = 'Will restore: ' + keys.map(label).join(', ') + '.' + (dmg.length ? ' Cannot restore (damaged in the file): ' + dmg.map((x) => x.label).join(', ') + '. Those stay as they are on this device.' : '')
          + (unk.length ? ' Skipped (not known by this version of the game): ' + unk.map((x) => x.label).join(', ') + '.' : '');
      }
      if (newer) out.message = (out.message ? out.message + ' ' : 'Will restore: ' + keys.map(label).join(', ') + '. ') + 'This file was made by a newer version of the game.';
      return out;
    } catch (e) {
      return fail('invalid', 'That file does not look like a Mad Maze backup.');
    }
  }

  // Write a plan atomically. Never throws.
  // Returns {ok, restored:[keys]} or {ok:false, restored:[], error, message, unrestored?:[keys]}.
  function apply(storage, p) {
    if (!p || !p.ok || !isObj(p.entries)) return { ok: false, restored: [], error: 'bad-plan', message: 'Nothing to restore.' };
    const keys = Object.keys(p.entries);
    const before = {};
    try {
      keys.forEach((k) => { before[k] = storage.getItem(k); });
    } catch (e) {
      return { ok: false, restored: [], error: 'read-failed', message: 'Could not read your current saves, so nothing was changed.' };
    }
    // R4 O-04: device-specific fields (lowGfx) keep THIS device's value; the rest of that setting comes from the file.
    const out = {};
    keys.forEach((k) => {
      out[k] = p.entries[k];
      const df = DEVICE_FIELDS[k];
      if (!df) return;
      try {
        const now = typeof before[k] === 'string' ? JSON.parse(before[k]) : null;
        const next = JSON.parse(p.entries[k]);
        if (isObj(next)) {
          df.forEach((f) => { if (isObj(now) && has(now, f)) next[f] = now[f]; else delete next[f]; });
          out[k] = JSON.stringify(next);
        }
      } catch (e) { /* keep the file's cleaned value */ }
    });
    const written = [];
    try {
      keys.forEach((k) => { storage.setItem(k, out[k]); written.push(k); });
      return { ok: true, restored: written.slice() };
    } catch (e) {
      // roll back every key we may have touched (including the one that threw)
      const stuck = [];
      keys.forEach((k) => {
        try {
          if (typeof before[k] === 'string') storage.setItem(k, before[k]); else storage.removeItem(k);
        } catch (e2) { if (written.indexOf(k) >= 0) stuck.push(k); }
      });
      const msg = stuck.length
        ? 'Restore failed part way and could not fully undo (' + stuck.map(label).join(', ') + ' may have changed). Please try again.'
        : 'Restore failed (storage is full or blocked), so everything was put back exactly as it was.';
      return { ok: false, restored: [], error: 'write-failed', message: msg, unrestored: stuck };
    }
  }

  // Convenience: plan + apply in one go (used by tests/tools; the Lantern page confirms in between).
  function restore(storage, input) {
    const p = plan(input);
    if (!p.ok) return { ok: false, restored: [], error: p.error, message: p.message };
    const r = apply(storage, p);
    if (r && r.ok && p.skipped && p.skipped.length) { r.skipped = p.skipped.slice(); r.message = p.message; } // beta S-03
    return r;
  }

  // Gear-on hardening (slice GH): ONE safety snapshot of every known key, taken just before the first tiered item is written to a town save that
  // has never seen gear (no realm.gv, no item with `t`). Written once to its own key, which is not in KNOWN, so it is never part of a bundle or a restore.
  // Quota-safe (SV3 / F14): a snapshot over PREGEAR_MAX (1 MB) is skipped ('too-big'), and so is one that would push everything this origin
  // stores past MAX_TOTAL ('over-total'), so it can never fill storage. A full or blocked storage just skips it.
  // Returns 'written' | 'exists' | 'has-gear' | 'too-big' | 'over-total' | 'skipped'.
  const PREGEAR_KEY = 'pixeltown-backup-pregear-v1';
  const PREGEAR_MAX = 1000000;
  // Characters stored under every key (key + value). Storage without length/key() (a plain fake) counts the known keys only.
  function usedChars(storage) {
    let n = 0;
    try {
      if (typeof storage.length === 'number' && typeof storage.key === 'function') {
        for (let i = 0; i < storage.length && i < 10000; i++) {
          const k = storage.key(i); if (typeof k !== 'string') continue;
          const v = storage.getItem(k); n += k.length + (typeof v === 'string' ? v.length : 0);
        }
        return n;
      }
      listKeys(storage).forEach((k) => { const v = storage.getItem(k); n += k.length + (typeof v === 'string' ? v.length : 0); });
    } catch (e) { /* unreadable: count what we have */ }
    return n;
  }
  function snapshotPregear(storage) {
    try {
      if (typeof storage.getItem(PREGEAR_KEY) === 'string') return 'exists';
      let realm = null;
      try { const t = JSON.parse(storage.getItem(SAVE_KEY)); realm = isObj(t) && isObj(t.realm) ? t.realm : null; } catch (e) { realm = null; }
      if (realm && (realm.gv === 1 || (Array.isArray(realm.items) && realm.items.some((x) => isObj(x) && x.t)))) return 'has-gear';
      const b = bundle(storage); b.at = Date.now(); b.why = 'pregear';
      const s = JSON.stringify(b);
      if (s.length > PREGEAR_MAX) return 'too-big';
      if (usedChars(storage) + PREGEAR_KEY.length + s.length > MAX_TOTAL) return 'over-total';
      storage.setItem(PREGEAR_KEY, s);
      return 'written';
    } catch (e) { return 'skipped'; }
  }

  // Read the pre-gear snapshot and plan its restore (never writes). Same checks as a restore file, plus a summary for the confirm step:
  // {ok, keys, entries, labels, at, changed:[keys whose value would change], same:[keys already equal], added:[keys not on the device now],
  //  kept:[known keys on the device now that the snapshot does not hold; they stay as they are], items:{now, then} (town Realm pack sizes)}.
  // Never applied automatically: the caller confirms, then calls apply(storage, plan).
  function planRestorePregear(storage) {
    let raw = null;
    try { raw = storage.getItem(PREGEAR_KEY); } catch (e) { raw = null; }
    if (typeof raw !== 'string') return fail('no-snapshot', 'There is no pre-gear snapshot on this device.');
    if (raw.length > MAX_TOTAL) return fail('too-big', 'The pre-gear snapshot is too big to restore.');
    let obj;
    try { obj = JSON.parse(raw); } catch (e) { return fail('bad-snapshot', 'The pre-gear snapshot is damaged, so nothing was changed.'); }
    if (!isObj(obj) || obj.format !== FORMAT) return fail('bad-snapshot', 'The pre-gear snapshot is damaged, so nothing was changed.');
    const p = plan({ format: FORMAT, v: obj.v, keys: obj.keys });
    if (!p.ok) return p;
    const at = typeof obj.at === 'number' && isFinite(obj.at) && obj.at > 0 && obj.at < 8.64e15 ? obj.at : null;
    const changed = [], same = [], added = [];
    p.keys.forEach((k) => {
      let now = null;
      try { now = storage.getItem(k); } catch (e) { now = null; }
      if (typeof now !== 'string') added.push(k); else if (now === p.entries[k]) same.push(k); else changed.push(k);
    });
    const kept = listKeys(storage).filter((k) => p.keys.indexOf(k) < 0);
    const count = (s) => {
      try { const t = JSON.parse(s); return isObj(t) && isObj(t.realm) && Array.isArray(t.realm.items) ? t.realm.items.length : 0; } catch (e) { return 0; }
    };
    let cur = null;
    try { cur = storage.getItem(SAVE_KEY); } catch (e) { cur = null; }
    const items = { now: count(cur), then: typeof p.entries[SAVE_KEY] === 'string' ? count(p.entries[SAVE_KEY]) : 0 };
    return { ok: true, keys: p.keys, entries: p.entries, labels: p.labels, at: at, changed: changed, same: same, added: added, kept: kept, items: items };
  }

  // Delete the pre-gear snapshot (the caller confirms first). Returns true when no snapshot is left.
  function dropPregear(storage) {
    try { storage.removeItem(PREGEAR_KEY); return typeof storage.getItem(PREGEAR_KEY) !== 'string'; } catch (e) { return false; }
  }
  function hasPregear(storage) {
    try { return typeof storage.getItem(PREGEAR_KEY) === 'string'; } catch (e) { return false; }
  }

  return { FORMAT: FORMAT, VERSION: VERSION, BUILD: BUILD, MAX_KEYS: MAX_KEYS, FLAG_KEYS: FLAG_KEYS.slice(), DEVICE_FIELDS: DEVICE_FIELDS, isSetting: isSetting, KNOWN: KNOWN.slice(), bundle: bundle, plan: plan, apply: apply, restore: restore, labelOf: label,
    PREGEAR_KEY: PREGEAR_KEY, PREGEAR_MAX: PREGEAR_MAX, MAX_TOTAL: MAX_TOTAL, snapshotPregear: snapshotPregear,
    planRestorePregear: planRestorePregear, dropPregear: dropPregear, hasPregear: hasPregear };
}));
