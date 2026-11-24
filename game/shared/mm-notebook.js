// MMNotebook (ID-04 Hero notebook): knowledge meta-progression. A page fills in the FIRST time you do something (first kill of a
// creature in a zone, first world-boss kill, first dungeon clear per biome, first tame per species). Knowledge only: nothing here
// changes a stat, a drop or a price. Device-only save `pixeltown-notebook-v1` = { v: 1, e: { <id>: <first time, epoch ms> } }.
// Writers re-read the key before every write (two tabs, three pages: Realm, dungeon, Isles) and write only on a first meet.
// Pure + UMD: browser global MMNotebook, or require(). Nothing here throws.
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.MMNotebook = factory();
}(typeof self !== 'undefined' ? self : this, function () {
  const KEY = 'pixeltown-notebook-v1';
  const VERSION = 1;
  const MAX = 300; // pages; a full notebook keeps its earliest pages and records nothing new (never grows past this)
  const MAX_T = 8.64e15;
  // kill:<pattern>:<creature>@<zone> | boss:<boss>@<zone> | clear:<biome> | tame:<species>
  const ID_RE = /^(?:kill:(?:spiral|aimed|ring|boss):[a-z][a-z0-9_]{0,39}@[0-3]|boss:[a-z][a-z0-9_]{0,39}@[0-3]|clear:[a-z][a-z0-9_]{0,23}|tame:[a-z][a-z0-9_]{0,39})$/;
  const ZONES = ['Shore', 'Midlands', 'Highlands', 'Godlands'];
  const CATS = [
    { id: 'kill', title: 'Creatures' },
    { id: 'boss', title: 'World bosses' },
    { id: 'clear', title: 'Dungeons' },
    { id: 'tame', title: 'Tames' }
  ];
  const HINT = {
    spiral: 'Spins its shots in a spiral: circle the same way it turns and slip through the gaps.',
    aimed: 'Aims straight at you: keep strafing sideways, never stand still.',
    ring: 'Bursts in a ring: step between two shots as the ring opens.',
    boss: 'A big one: watch for the pause before each pattern and move then.'
  };
  const isObj = (v) => !!v && typeof v === 'object' && !Array.isArray(v);
  const pretty = (s) => String(s).split('_').filter(Boolean).map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');

  function defaults() { return { v: VERSION, e: {} }; }
  function validId(id) { return typeof id === 'string' && id.length <= 64 && ID_RE.test(id); }
  // Anything corrupt becomes defaults; bad ids / times are dropped; the earliest MAX pages are kept.
  function clean(raw) {
    const out = defaults();
    if (!isObj(raw) || !isObj(raw.e)) return out;
    const rows = [];
    const keys = Object.keys(raw.e);
    for (let i = 0; i < keys.length && i < 5000; i++) {
      const k = keys[i]; const t = raw.e[k];
      if (!validId(k) || typeof t !== 'number' || !isFinite(t) || t < 0 || t > MAX_T) continue;
      rows.push([k, Math.floor(t)]);
    }
    rows.sort((a, b) => a[1] - b[1] || (a[0] < b[0] ? -1 : 1));
    rows.slice(0, MAX).forEach((r) => { out.e[r[0]] = r[1]; });
    return out;
  }
  function count(save) { return isObj(save) && isObj(save.e) ? Object.keys(save.e).length : 0; }
  function has(save, id) { return isObj(save) && isObj(save.e) && Object.prototype.hasOwnProperty.call(save.e, id); }
  // In-memory add (first meet only). Returns true when the page is new.
  function add(save, id, at) {
    if (!isObj(save) || !isObj(save.e) || !validId(id) || has(save, id) || count(save) >= MAX) return false;
    const t = typeof at === 'number' && isFinite(at) && at >= 0 && at <= MAX_T ? Math.floor(at) : 0;
    save.e[id] = t; return true;
  }
  // Two copies (two tabs, a restore): the union, each page keeping its earliest time, capped like clean().
  function merge(a, b) {
    const A = clean(a); const B = clean(b); const e = Object.assign({}, A.e);
    Object.keys(B.e).forEach((k) => { if (!(k in e) || B.e[k] < e[k]) e[k] = B.e[k]; });
    return clean({ v: VERSION, e: e });
  }
  function load(storage) {
    try { const s = storage && storage.getItem(KEY); return s ? clean(JSON.parse(s)) : defaults(); } catch (e) { return defaults(); }
  }
  // Re-read, add, write. Returns true only when a NEW page was written (a known page writes nothing).
  function record(storage, id, at) {
    if (!validId(id)) return false;
    const cur = load(storage);
    if (!add(cur, id, at === undefined ? Date.now() : at)) return false;
    try { storage.setItem(KEY, JSON.stringify(cur)); return true; } catch (e) { return false; }
  }
  // Id builders used by the writers (null when the input cannot make a valid id)
  const ids = {
    kill(pattern, creature, zone) { const id = 'kill:' + pattern + ':' + creature + '@' + zone; return validId(id) ? id : null; },
    boss(boss, zone) { const id = 'boss:' + boss + '@' + zone; return validId(id) ? id : null; },
    clear(biome) { const id = 'clear:' + biome; return validId(id) ? id : null; },
    tame(sp) { const id = 'tame:' + sp; return validId(id) ? id : null; }
  };
  // One page for display: { id, cat, title, where, hint, at }
  function entry(id, at) {
    if (!validId(id)) return null;
    const cat = id.slice(0, id.indexOf(':'));
    const body = id.slice(cat.length + 1);
    const zi = body.lastIndexOf('@'); const zone = zi >= 0 ? Number(body.slice(zi + 1)) : -1; const core = zi >= 0 ? body.slice(0, zi) : body;
    const where = zone >= 0 ? ZONES[zone] : '';
    if (cat === 'kill') {
      const pat = core.slice(0, core.indexOf(':')); const cr = core.slice(pat.length + 1);
      return { id, cat, title: pretty(cr), where, hint: HINT[pat] || '', at: at || 0 };
    }
    if (cat === 'boss') return { id, cat, title: pretty(core), where, hint: 'World boss of the ' + where + '. Each one drops a boss key.', at: at || 0 };
    if (cat === 'clear') return { id, cat, title: pretty(core) + ' dungeon', where: '', hint: 'Boss beaten. Deeper floors of this dungeon are open to you now.', at: at || 0 };
    return { id, cat, title: pretty(core), where: 'Isles', hint: 'Tamed: it can follow you and help in fights.', at: at || 0 };
  }
  // Pages grouped by category, newest first inside each: [{ id, title, pages: [entry] }]
  function sections(save) {
    const s = clean(save); const by = {};
    CATS.forEach((c) => { by[c.id] = []; });
    Object.keys(s.e).forEach((k) => { const en = entry(k, s.e[k]); if (en && by[en.cat]) by[en.cat].push(en); });
    return CATS.map((c) => ({ id: c.id, title: c.title, pages: by[c.id].sort((a, b) => b.at - a.at || (a.id < b.id ? -1 : 1)) }));
  }
  return { KEY, VERSION, MAX, ZONES, CATS, HINT, defaults, validId, clean, count, has, add, merge, load, record, ids, entry, sections };
}));
