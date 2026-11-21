// MMTames: the stable roster of tamed creatures (key `pixeltown-tames-v1`, BIOME-ARCH-PLAN 2.6). Pure data + validation, no DOM.
// A save is { v:1, n, roster:[{id,sp,nm,lv,xp,bond,aff,cos,isle,d}], party:[ids<=2], mount:id|null }.
// clean() always returns a valid save: anything corrupt becomes the empty stable. Names are plain text (show with textContent only).
// Unknown species are kept as inert entries and never deleted. This module never touches `pixeltown-save-v1`.
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.MMTames = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  const KEY = 'pixeltown-tames-v1';
  const MAX_TAMES = 60;
  const MAX_PARTY = 2;
  const MAX_LV = 30;
  const MAX_BOND = 10;
  const MAX_AFF = 999;
  const NAME_MAX = 16;
  const ID_RE = /^t[0-9a-z]{1,6}$/;
  const SPECIES_RE = /^[a-z][a-z0-9_]{0,23}$/;
  const ISLE_RE = /^[a-z][a-z0-9_]{0,15}$/;
  const COS_RE = /^[a-z0-9_]{1,20}$/;
  const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

  const isObj = (v) => !!v && typeof v === 'object' && !Array.isArray(v);
  const num = (v, d) => { v = typeof v === 'number' ? v : Number(v); return Number.isFinite(v) ? v : d; };
  const int = (v, lo, hi, d) => Math.max(lo, Math.min(hi, Math.floor(num(v, d))));
  const str = (v, re) => (typeof v === 'string' && re.test(v) ? v : '');

  function cleanName(v) {
    if (typeof v !== 'string') return '';
    // drop control characters and angle brackets / quotes (names are only ever shown with textContent, this is belt and braces)
    return v.replace(/[\u0000-\u001f\u007f-\u009f<>"`\\]/g, '').replace(/\s+/g, ' ').trim().slice(0, NAME_MAX);
  }
  const validDate = (v) => {
    if (typeof v !== 'string' || !DATE_RE.test(v)) return '';
    const t = Date.parse(v + 'T00:00:00Z');
    return Number.isFinite(t) && new Date(t).toISOString().slice(0, 10) === v ? v : '';
  };
  const xpNeed = (lv) => 30 + 20 * int(lv, 1, MAX_LV, 1);

  function cleanTame(e) {
    if (!isObj(e)) return null;
    const id = str(e.id, ID_RE), sp = str(e.sp, SPECIES_RE);
    if (!id || !sp) return null;
    const lv = int(e.lv, 1, MAX_LV, 1);
    return {
      id: id, sp: sp, nm: cleanName(e.nm), lv: lv, xp: lv >= MAX_LV ? 0 : int(e.xp, 0, xpNeed(lv) - 1, 0),
      bond: int(e.bond, 1, MAX_BOND, 1), aff: int(e.aff, 0, MAX_AFF, 0), cos: str(e.cos, COS_RE),
      sad: null, isle: str(e.isle, ISLE_RE), d: validDate(e.d)
    };
  }

  function defaults() { return { v: 1, n: 0, roster: [], party: [], mount: null }; }

  function clean(raw) {
    const out = defaults();
    try {
      if (!isObj(raw)) return out;
      const seen = Object.create(null);
      const arr = Array.isArray(raw.roster) ? raw.roster.slice(0, MAX_TAMES * 4) : [];
      for (let i = 0; i < arr.length && out.roster.length < MAX_TAMES; i++) {
        const t = cleanTame(arr[i]);
        if (t && !seen[t.id]) { seen[t.id] = 1; out.roster.push(t); }
      }
      const party = Array.isArray(raw.party) ? raw.party.slice(0, 16) : [];
      party.forEach((id) => { if (typeof id === 'string' && seen[id] === 1 && out.party.indexOf(id) < 0 && out.party.length < MAX_PARTY) out.party.push(id); });
      out.mount = typeof raw.mount === 'string' && seen[raw.mount] === 1 ? raw.mount : null;
      let maxN = 0;
      out.roster.forEach((t) => { maxN = Math.max(maxN, parseInt(t.id.slice(1), 36) || 0); });
      out.n = int(raw.n, maxN, 36 * 36 * 36 * 36 * 36, 0);
    } catch (e) { return defaults(); }
    return out;
  }

  const find = (s, id) => (s && Array.isArray(s.roster) ? s.roster.filter((t) => t.id === id)[0] || null : null);

  // add(save, {sp, nm, isle, d, bond}) -> the new entry, or null when the stable is full / species invalid. Mutates save.
  function add(save, spec) {
    if (!isObj(save) || !Array.isArray(save.roster) || save.roster.length >= MAX_TAMES || !isObj(spec)) return null;
    const sp = str(spec.sp, SPECIES_RE);
    if (!sp) return null;
    let n = int(save.n, 0, 36 * 36 * 36 * 36 * 36, 0), id;
    do { n++; id = 't' + n.toString(36); } while (find(save, id));
    if (id.length > 7) return null;
    const t = cleanTame({ id: id, sp: sp, nm: spec.nm, lv: 1, xp: 0, bond: spec.bond, aff: 0, cos: '', isle: spec.isle, d: spec.d });
    if (!t) return null;
    save.n = n; save.roster.push(t);
    return t;
  }

  function release(save, id) {
    if (!isObj(save) || !Array.isArray(save.roster)) return false;
    const i = save.roster.findIndex((t) => t.id === id);
    if (i < 0) return false;
    save.roster.splice(i, 1);
    save.party = (save.party || []).filter((p) => p !== id);
    if (save.mount === id) save.mount = null;
    return true;
  }

  // setParty(save, ids): keeps ids that exist, unique, at most MAX_PARTY. Returns the resulting party.
  function setParty(save, ids) {
    if (!isObj(save) || !Array.isArray(save.roster)) return [];
    const out = [];
    (Array.isArray(ids) ? ids.slice(0, 16) : []).forEach((id) => { if (typeof id === 'string' && find(save, id) && out.indexOf(id) < 0 && out.length < MAX_PARTY) out.push(id); });
    save.party = out;
    return out.slice();
  }
  function setMount(save, id) {
    if (!isObj(save)) return false;
    if (id === null) { save.mount = null; return true; }
    if (typeof id !== 'string' || !find(save, id)) return false;
    save.mount = id; return true;
  }
  function rename(save, id, name) { const t = find(save, id); if (!t) return false; t.nm = cleanName(name); return true; }
  function setCosmetic(save, id, cos) { const t = find(save, id); if (!t) return false; if (cos !== '' && !COS_RE.test(String(cos))) return false; t.cos = cos === '' ? '' : String(cos); return true; }
  function addAffinity(save, id, n) {
    const t = find(save, id); if (!t) return 0;
    t.aff = int(t.aff + num(n, 0), 0, MAX_AFF, 0);
    t.bond = Math.max(t.bond, Math.min(MAX_BOND, 1 + Math.floor(t.aff / 100)));
    return t.aff;
  }
  // gainXp: levels up while xp >= need; capped at MAX_LV (xp then stays 0). Returns levels gained.
  function gainXp(save, id, n) {
    const t = find(save, id); if (!t) return 0;
    const start = t.lv;
    if (t.lv >= MAX_LV) return 0;
    t.xp += int(n, 0, 1e6, 0);
    while (t.lv < MAX_LV && t.xp >= xpNeed(t.lv)) { t.xp -= xpNeed(t.lv); t.lv++; }
    if (t.lv >= MAX_LV) t.xp = 0;
    return t.lv - start;
  }

  // Storage helpers (never throw; only ever touch KEY).
  function load(storage) {
    try { const s = storage.getItem(KEY); return clean(typeof s === 'string' ? JSON.parse(s) : null); } catch (e) { return defaults(); }
  }
  function write(storage, save) {
    try { storage.setItem(KEY, JSON.stringify(clean(save))); return true; } catch (e) { return false; }
  }

  return {
    KEY: KEY, MAX_TAMES: MAX_TAMES, MAX_PARTY: MAX_PARTY, MAX_LV: MAX_LV, MAX_BOND: MAX_BOND, NAME_MAX: NAME_MAX,
    defaults: defaults, clean: clean, cleanName: cleanName, find: find, add: add, release: release, setParty: setParty, setMount: setMount,
    rename: rename, setCosmetic: setCosmetic, addAffinity: addAffinity, gainXp: gainXp, xpNeed: xpNeed, load: load, write: write
  };
});
