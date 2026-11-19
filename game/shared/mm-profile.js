// MMProfile: pure sanitising / migration layer for localStorage key `pixeltown-mm-v1`.
// No I/O. Every function returns new objects and never mutates its inputs.
// UMD: browser global MMProfile, or require().
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.MMProfile = factory();
}(typeof self !== 'undefined' ? self : this, function () {
  const KEY = 'pixeltown-mm-v1';
  const LEGACY_KEY = 'pixeltown-save-v1';
  const STASH_SLOTS = 16;
  const MAX_HEROES = 12;
  const MAX_HALL = 200;
  const MAX_ITEMS = 24;
  const MAX_LEVEL = 20;
  const MAX_FAME = 99999999;
  const CLASSES = ['ranger', 'frostcaller', 'herald', 'punk', 'bruiser'];
  const MODES = ['classic', 'picnic'];
  const HERO_MODES = ['classic', 'picnic', 'hardcore'];

  const isObj = (v) => !!v && typeof v === 'object' && !Array.isArray(v);
  function int(v, lo, hi) {
    v = Math.floor(Number(v));
    if (!Number.isFinite(v)) v = lo;
    return Math.max(lo, Math.min(hi, v));
  }
  function str(v, max, def) {
    return typeof v === 'string' && v.length ? v.slice(0, max) : def;
  }
  function cleanItem(it) {
    if (!isObj(it)) return null;
    const id = str(it.id, 40, null);
    if (!id) return null;
    const o = { id: id, r: int(it.r, 0, 9) };
    if (it.n !== undefined) o.n = int(it.n, 0, 9999999);
    if (it.keepsake === true) o.keepsake = true;
    if (typeof it.from === 'string') o.from = it.from.slice(0, 40);
    if (typeof it.cls === 'string') o.cls = it.cls.slice(0, 20);
    if (it.level !== undefined) o.level = int(it.level, 1, MAX_LEVEL);
    return o;
  }
  function cleanHero(h, usedIds) {
    if (!isObj(h)) return null;
    const id = str(h.id, 40, null);
    if (!id || id === '__proto__' || usedIds[id]) return null;
    usedIds[id] = true;
    const out = {
      id: id,
      name: str(h.name, 24, 'Hero'),
      cls: CLASSES.indexOf(h.cls) >= 0 ? h.cls : 'ranger',
      level: int(h.level, 1, MAX_LEVEL),
      xp: int(h.xp, 0, 99999999),
      fame: int(h.fame, 0, MAX_FAME),
      bonus: int(h.bonus, 0, 200), // summed fame bonus percent
      mode: HERO_MODES.indexOf(h.mode) >= 0 ? h.mode : 'classic',
      items: []
    };
    (Array.isArray(h.items) ? h.items.slice(0, 200) : []).forEach((it) => {
      if (out.items.length >= MAX_ITEMS) return;
      const c = cleanItem(it);
      if (c) out.items.push(c);
    });
    const ks = cleanItem(h.keepsake);
    if (ks) out.keepsake = ks;
    return out;
  }
  function cleanHall(e) {
    if (!isObj(e)) return null;
    return {
      name: str(e.name, 24, 'Hero'),
      cls: CLASSES.indexOf(e.cls) >= 0 ? e.cls : 'ranger',
      level: int(e.level, 1, MAX_LEVEL),
      fame: int(e.fame, 0, MAX_FAME),
      how: e.how === 'fall' ? 'fall' : 'retire'
    };
  }

  function empty() {
    const stash = [];
    for (let i = 0; i < STASH_SLOTS; i++) stash.push(null);
    return { v: 1, heroes: [], stash: stash, fame: 0, mode: 'classic', hall: [], migratedFrom: null };
  }

  // Any input -> a valid profile. Unknown keys are dropped, arrays capped.
  function clean(raw) {
    if (typeof raw === 'string') { try { raw = JSON.parse(raw); } catch (e) { raw = null; } }
    const out = empty();
    if (!isObj(raw)) return out;
    const used = Object.create(null);
    (Array.isArray(raw.heroes) ? raw.heroes.slice(0, 100) : []).forEach((h) => {
      if (out.heroes.length >= MAX_HEROES) return;
      const c = cleanHero(h, used);
      if (c) out.heroes.push(c);
    });
    if (Array.isArray(raw.stash)) {
      for (let i = 0; i < STASH_SLOTS; i++) out.stash[i] = cleanItem(raw.stash[i]);
    }
    out.fame = int(raw.fame, 0, MAX_FAME);
    out.mode = MODES.indexOf(raw.mode) >= 0 ? raw.mode : 'classic';
    (Array.isArray(raw.hall) ? raw.hall.slice(0, 1000) : []).forEach((e) => {
      if (out.hall.length >= MAX_HALL) return;
      const c = cleanHall(e);
      if (c) out.hall.push(c);
    });
    out.migratedFrom = typeof raw.migratedFrom === 'string' && raw.migratedFrom ? raw.migratedFrom.slice(0, 60) : null;
    return out;
  }

  // Copy (never move) the old arena save into a 'Legacy Ranger' hero. Idempotent via migratedFrom.
  function importLegacy(realmSave, profile) {
    const p = clean(profile);
    if (p.migratedFrom || !isObj(realmSave)) return p;
    const items = [];
    (Array.isArray(realmSave.items) ? realmSave.items.slice(0, 200) : []).forEach((it) => {
      if (items.length >= MAX_ITEMS || !isObj(it)) return;
      const c = cleanItem({ id: it.id, r: it.r, n: it.n });
      if (c) items.push(c);
    });
    const hero = cleanHero({
      id: 'legacy-ranger', name: 'Legacy Ranger', cls: 'ranger',
      level: realmSave.level, xp: realmSave.xp, fame: 0, mode: 'classic', items: items
    }, Object.create(null));
    // Roster full: skip the hero and do NOT mark the import done, so it can be retried after a slot frees.
    if (p.heroes.length >= MAX_HEROES) return p;
    p.heroes.push(hero);
    p.migratedFrom = LEGACY_KEY;
    return p;
  }

  function findHero(p, heroId) {
    for (let i = 0; i < p.heroes.length; i++) if (p.heroes[i].id === heroId) return i;
    return -1;
  }
  function heroMode(p, h) { return p.mode === 'picnic' ? 'picnic' : h.mode; }
  function modeMult(mode) { return mode === 'picnic' ? 0.5 : mode === 'hardcore' ? 1.5 : 1; }
  function fail(p, reason) { return { ok: false, reason: reason, profile: p }; }

  // Mode is locked once the profile has any history; it can only be chosen on a blank profile.
  function setMode(profile, mode) {
    const p = clean(profile);
    if (MODES.indexOf(mode) < 0) return fail(p, 'bad-mode');
    if (p.heroes.length || p.hall.length || p.fame || p.migratedFrom) return fail(p, 'mode-locked');
    p.mode = mode;
    return { ok: true, profile: p };
  }

  // Soft permadeath: hero removed, fame banked (base * (1 + bonus%) * mode), Keepsake to stash.
  function fall(profile, heroId) {
    const p = clean(profile);
    const i = findHero(p, heroId);
    if (i < 0) return fail(p, 'no-hero');
    const h = p.heroes[i];
    const mode = heroMode(p, h);
    if (mode === 'picnic') return fail(p, 'picnic-no-fall');
    const fame = Math.floor(h.fame * (1 + h.bonus / 100) * modeMult(mode));
    p.heroes.splice(i, 1);
    p.fame = Math.min(MAX_FAME, p.fame + fame);
    p.hall.push({ name: h.name, cls: h.cls, level: h.level, fame: fame, how: 'fall' });
    if (p.hall.length > MAX_HALL) p.hall.shift();
    let keepsake = null, keepsakeLost = false;
    if (mode !== 'hardcore') {
      keepsake = Object.assign({}, h.keepsake || { id: 'keepsake', r: 0, from: h.name, cls: h.cls, level: h.level }, { keepsake: true });
      const slot = p.stash.indexOf(null);
      if (slot >= 0) p.stash[slot] = keepsake; else { keepsake = null; keepsakeLost = true; } // stash full: Keepsake could not be stored
    }
    return { ok: true, profile: p, fame: fame, keepsake: keepsake, keepsakeLost: keepsakeLost };
  }

  // New hero of the same class at level min(10, floor(L/2)); not allowed in hardcore.
  function rekindle(profile, heroId) {
    const p = clean(profile);
    const i = findHero(p, heroId);
    if (i < 0) return fail(p, 'no-hero');
    const h = p.heroes[i];
    if (heroMode(p, h) === 'hardcore') return fail(p, 'hardcore-no-rekindle');
    if (p.heroes.length >= MAX_HEROES) return fail(p, 'roster-full');
    const lvl = Math.max(1, Math.min(10, Math.floor(h.level / 2)));
    let n = 1, id;
    do { id = 'hero-' + h.cls + '-' + (n++); } while (findHero(p, id) >= 0);
    const nh = cleanHero({ id: id, name: h.name, cls: h.cls, level: lvl, xp: 0, fame: 0, mode: h.mode, items: [] }, Object.create(null));
    p.heroes.push(nh);
    return { ok: true, profile: p, hero: nh };
  }

  // Honourable retirement: level 20 required, fame x1.2 (Careful +20%) x mode, listed in the hall.
  function retire(profile, heroId) {
    const p = clean(profile);
    const i = findHero(p, heroId);
    if (i < 0) return fail(p, 'no-hero');
    const h = p.heroes[i];
    if (h.level < MAX_LEVEL) return fail(p, 'level-20-required');
    const fame = Math.floor(h.fame * 1.2 * modeMult(heroMode(p, h)));
    p.heroes.splice(i, 1);
    p.fame = Math.min(MAX_FAME, p.fame + fame);
    p.hall.push({ name: h.name, cls: h.cls, level: h.level, fame: fame, how: 'retire' });
    if (p.hall.length > MAX_HALL) p.hall.shift();
    return { ok: true, profile: p, fame: fame };
  }

  return {
    KEY: KEY, LEGACY_KEY: LEGACY_KEY, STASH_SLOTS: STASH_SLOTS, MAX_LEVEL: MAX_LEVEL,
    empty: empty, clean: clean, importLegacy: importLegacy, setMode: setMode,
    fall: fall, rekindle: rekindle, retire: retire
  };
}));
