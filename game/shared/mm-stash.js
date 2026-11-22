// MMStash: loot from the Realm World and the Warren dungeons pays into the Lantern stash ("bags paying the stash").
// Finds are recorded as they are picked up (the item lands in the realm backpack as before) and settled at the end of a leg:
// leaving the world, entering a portal, the dungeon summary, the death screen, the world menu, and opening the Lantern.
// A settled find is COPIED into the Lantern (`pixeltown-mm-v1`): the first free stash slot (16), else the active hero's pack
// (24), else it stays pending for the next settle. Nothing is ever deleted from the realm backpack, so no item can be lost;
// a find the player threw away (no longer in the backpack) is not paid. Survivor's Cache: dying keeps every shard and the cache
// item is a find like any other. Event fame is held as pending fame and paid to the active hero (else the account).
// Storage: only the additive `finds` key of `pixeltown-realm-v1` (every other key left as it is) and the `stash`, hero `items`/`fame`
// and `fame` fields of `pixeltown-mm-v1` (always written through MMProfile.clean). `pixeltown-save-v1` is never written here.
// UMD: browser global MMStash, or require(). Pure functions + settle/record helpers that take a Storage-like object.
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.MMStash = factory();
}(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  const REALM_KEY = 'pixeltown-realm-v1';
  const MM_KEY = 'pixeltown-mm-v1';
  const SAVE_KEY = 'pixeltown-save-v1';
  const ACTIVE_KEY = 'pixeltown-mm-active-v1';
  const STASH_SLOTS = 16;
  const CARRY_MAX = 24;
  const MAX_PENDING = 64;
  const MAX_RECENT = 12;
  const MAX_FAME = 99999999;
  const SRC = ['world', 'dungeon', 'event', 'cache'];
  const ID_RE = /^[a-z][a-z0-9_]{0,39}$/;

  const isObj = (v) => !!v && typeof v === 'object' && !Array.isArray(v);
  const int = (v, lo, hi) => { v = Math.floor(Number(v)); if (!Number.isFinite(v)) v = lo; return Math.max(lo, Math.min(hi, v)); };
  // Tier gear: `t` (integer 1-12) and `a` (uint32 affix seed, only when t >= 7) are additive; anything else is dropped.
  const SOULBOUND_T = 11;
  const strictInt = (v, lo, hi) => typeof v === 'number' && Number.isInteger(v) && v >= lo && v <= hi;
  function gearFields(f, o) {
    if (strictInt(f.t, 1, 12)) { o.t = f.t; if (f.t >= 7 && strictInt(f.a, 1, 4294967295)) o.a = f.a; }
    return o;
  }
  const soulbound = (it) => isObj(it) && strictInt(it.t, SOULBOUND_T, 12);
  function cleanFind(f, withN) {
    if (!isObj(f) || typeof f.id !== 'string' || !ID_RE.test(f.id)) return null;
    const o = { id: f.id, r: int(f.r, 0, 9), src: SRC.indexOf(f.src) >= 0 ? f.src : 'world' };
    gearFields(f, o);
    if (withN) { const n = int(f.n, 0, 9999999); if (!n) return null; o.n = n; }
    return o;
  }
  // Any input -> {pending:[{n,id,r,src}], recent:[{id,r,src}], fame, total, last:{items,stash,hero,waiting,shards,fame,src}|null}
  function cleanFinds(raw) {
    const o = isObj(raw) ? raw : {};
    const out = { pending: [], recent: [], fame: int(o.fame, 0, MAX_FAME), total: int(o.total, 0, 9999999), last: null };
    const seen = Object.create(null);
    (Array.isArray(o.pending) ? o.pending.slice(-MAX_PENDING * 2) : []).forEach((f) => { const c = cleanFind(f, true); if (c && !seen[c.n]) { seen[c.n] = 1; out.pending.push(c); } });
    if (out.pending.length > MAX_PENDING) out.pending = out.pending.slice(-MAX_PENDING);
    (Array.isArray(o.recent) ? o.recent.slice(0, MAX_RECENT) : []).forEach((f) => { const c = cleanFind(f, false); if (c) out.recent.push(c); });
    if (isObj(o.last)) {
      const l = o.last;
      out.last = { items: int(l.items, 0, 999), stash: int(l.stash, 0, 999), hero: int(l.hero, 0, 999), waiting: int(l.waiting, 0, 999), shards: int(l.shards, 0, 9999999), fame: int(l.fame, 0, MAX_FAME), src: typeof l.src === 'string' && /^[a-z]{1,12}$/.test(l.src) ? l.src : 'world' };
    }
    return out;
  }
  // A find was picked up: item {n, id, r} (n = its realm backpack uid). Returns new finds.
  function record(finds, item, src) {
    const f = cleanFinds(finds);
    const c = cleanFind({ n: item && item.n, id: item && item.id, r: item && item.r, t: item && item.t, a: item && item.a, src: src }, true);
    if (!c) return f;
    if (!f.pending.some((p) => p.n === c.n)) { f.pending.push(c); if (f.pending.length > MAX_PENDING) f.pending.shift(); }
    const rc = { id: c.id, r: c.r, src: c.src }; if (c.t) rc.t = c.t;
    f.recent.unshift(rc); if (f.recent.length > MAX_RECENT) f.recent.length = MAX_RECENT;
    return f;
  }
  // renumberFind(finds, oldN, newN, item?) -> new finds. A realm item that was replaced under a fresh uid (a reforge) keeps its pending find: the find of
  // oldN moves to newN, and its id / r / t / a are taken from `item` (the replacement entry) when given, so the stash copy matches the item it pays for
  // (review F13). The stash format holds {id, r, t, a} only: a forged `f` / `sig` stays on the realm item, as for every find. No pending find of oldN, a
  // bad uid, or newN already pending: unchanged.
  function renumberFind(finds, oldN, newN, item) {
    const f = cleanFinds(finds);
    const o = int(oldN, 0, 9999999), n = int(newN, 0, 9999999);
    if (!o || !n || o === n || f.pending.some((p) => p.n === n)) return f;
    const i = f.pending.findIndex((p) => p.n === o);
    if (i < 0) return f;
    const p = f.pending[i];
    const src = isObj(item) ? { n: n, id: item.id, r: item.r, t: item.t, a: item.a, src: p.src } : { n: n, id: p.id, r: p.r, t: p.t, a: p.a, src: p.src };
    const c = cleanFind(src, true);
    if (c) f.pending[i] = c; else f.pending[i] = Object.assign({}, p, { n: n });
    return f;
  }
  function addFame(finds, n) { const f = cleanFinds(finds); f.fame = Math.min(MAX_FAME, f.fame + int(n, 0, MAX_FAME)); return f; }

  // Pure payout. profile: an MMProfile-shaped object (cleaned by the caller); realmItems: the realm backpack (array of {n}) or null
  // when unknown (then every pending find counts as kept); opts {heroId, shards, src}. Never mutates its inputs.
  function payout(profile, realmItems, finds, opts) {
    opts = opts || {};
    const p = JSON.parse(JSON.stringify(profile));
    if (!Array.isArray(p.stash)) p.stash = [];
    while (p.stash.length < STASH_SLOTS) p.stash.push(null);
    const f = cleanFinds(finds);
    const kept = Array.isArray(realmItems) ? new Set(realmItems.filter(isObj).map((it) => int(it.n, 0, 9999999))) : null;
    const hero = typeof opts.heroId === 'string' && Array.isArray(p.heroes) ? p.heroes.find((h) => h && h.id === opts.heroId) || null : null;
    if (hero && !Array.isArray(hero.items)) hero.items = [];
    const res = { stash: 0, hero: 0, waiting: 0, dropped: 0, soulbound: 0, fame: 0, paid: [] };
    const waiting = [];
    f.pending.forEach((it) => {
      if (kept && !kept.has(it.n)) { res.dropped++; return; } // thrown away or sold before the settle: nothing to pay
      if (soulbound(it)) { res.soulbound++; return; } // soulbound (T11+): stays on the hero's realm backpack, never copied to the stash or pack
      const item = { id: it.id, r: it.r };
      if (it.t) { item.t = it.t; if (it.a) item.a = it.a; }
      const slot = p.stash.indexOf(null);
      if (slot >= 0) { p.stash[slot] = item; res.stash++; res.paid.push(it); return; }
      if (hero && hero.items.length < CARRY_MAX) { hero.items.push(item); res.hero++; res.paid.push(it); return; }
      waiting.push(it); res.waiting++; // stash and pack full: it waits (and stays in the realm backpack)
    });
    if (f.fame > 0) {
      if (hero) hero.fame = Math.min(MAX_FAME, int(hero.fame, 0, MAX_FAME) + f.fame); else p.fame = Math.min(MAX_FAME, int(p.fame, 0, MAX_FAME) + f.fame);
      res.fame = f.fame; f.fame = 0;
    }
    f.pending = waiting;
    const items = res.stash + res.hero;
    f.total = Math.min(9999999, f.total + items);
    f.last = { items: items, stash: res.stash, hero: res.hero, waiting: res.waiting, shards: int(opts.shards, 0, 9999999), fame: res.fame, src: typeof opts.src === 'string' && /^[a-z]{1,12}$/.test(opts.src) ? opts.src : 'world' };
    res.items = items; res.shards = f.last.shards; res.profile = p; res.finds = f;
    return res;
  }
  // Hand deposit (hero pack -> stash). Mutates `profile`; returns { ok, msg, slot }. Soulbound (t >= 11) is refused with a friendly message; t / a ride along untouched.
  const SOULBOUND_MSG = 'Soulbound gear stays with its hero, so it cannot go in the stash.';
  function deposit(profile, heroId, idx) {
    const h = isObj(profile) && Array.isArray(profile.heroes) ? profile.heroes.find((x) => x && x.id === heroId) : null;
    if (!h || !Array.isArray(h.items) || !isObj(h.items[idx])) return { ok: false, msg: 'Nothing to move.', slot: -1 };
    if (soulbound(h.items[idx])) return { ok: false, msg: SOULBOUND_MSG, slot: -1 };
    if (!Array.isArray(profile.stash)) profile.stash = [];
    while (profile.stash.length < STASH_SLOTS) profile.stash.push(null);
    const slot = profile.stash.indexOf(null);
    if (slot < 0) return { ok: false, msg: 'The stash is full (' + STASH_SLOTS + ' slots).', slot: -1 };
    profile.stash[slot] = h.items.splice(idx, 1)[0];
    return { ok: true, msg: 'Moved to the stash.', slot: slot };
  }
  function text(r) { // "Stashed N items, +M shards" (+ fame / waiting notes)
    if (!r) return '';
    const n = r.items || 0;
    let t = `Stashed ${n} item${n === 1 ? '' : 's'}, +${r.shards || 0} shards`;
    if (r.fame) t += `, +${r.fame} fame`;
    if (r.soulbound) t += ` (${r.soulbound} soulbound item${r.soulbound === 1 ? '' : 's'} stay with your hero)`;
    if (r.waiting) t += ` (${r.waiting} waiting: the stash and pack are full)`;
    return t;
  }

  // ---------- storage helpers (never throw; storage = the page localStorage or a test double) ----------
  function readJson(storage, key) { try { const v = JSON.parse(storage.getItem(key)); return isObj(v) ? v : null; } catch (e) { return null; } }
  function readFinds(storage) { const r = readJson(storage, REALM_KEY); return cleanFinds(r && r.finds); }
  function writeFinds(storage, finds) {
    try { const r = readJson(storage, REALM_KEY) || {}; r.finds = cleanFinds(finds); storage.setItem(REALM_KEY, JSON.stringify(r)); return true; } catch (e) { return false; }
  }
  function recordTo(storage, item, src) { const f = record(readFinds(storage), item, src); writeFinds(storage, f); return f; }
  // Storage form of renumberFind: writes only when a pending find moved. Returns true when it did.
  function renumberFindIn(storage, oldN, newN, item) {
    const f0 = readFinds(storage); const f = renumberFind(f0, oldN, newN, item);
    if (JSON.stringify(f) === JSON.stringify(f0)) return false;
    return writeFinds(storage, f);
  }
  function addFameTo(storage, n) { const f = addFame(readFinds(storage), n); writeFinds(storage, f); return f; }
  // Settle now. opts: {Profile (MMProfile), realmItems (array, or undefined = read pixeltown-save-v1), shards, src}.
  // The Lantern save is written first; the pending list is cleared only after that write worked (a failed write pays nothing).
  function settle(storage, opts) {
    opts = opts || {};
    const P = opts.Profile; if (!P || typeof P.clean !== 'function') return null;
    let items = opts.realmItems;
    if (items === undefined) { const s = readJson(storage, SAVE_KEY); items = s && isObj(s.realm) && Array.isArray(s.realm.items) ? s.realm.items : []; }
    const finds = readFinds(storage);
    let raw = null; try { raw = storage.getItem(MM_KEY); } catch (e) { raw = null; }
    const prof = P.clean(raw);
    let heroId = null; try { heroId = P.cleanActive(storage.getItem(ACTIVE_KEY)).heroId; } catch (e) { heroId = null; }
    const r = payout(prof, items, finds, { heroId: heroId, shards: opts.shards, src: opts.src });
    const touched = r.items > 0 || r.fame > 0;
    if (touched) { try { storage.setItem(MM_KEY, JSON.stringify(P.clean(r.profile))); } catch (e) { return Object.assign(r, { ok: false, items: 0 }); } }
    if (!touched && !finds.pending.length && !opts.shards && !opts.force) { r.ok = true; return r; } // nothing to say: leave the save alone
    writeFinds(storage, r.finds);
    r.ok = true;
    return r;
  }

  return {
    REALM_KEY: REALM_KEY, MM_KEY: MM_KEY, STASH_SLOTS: STASH_SLOTS, CARRY_MAX: CARRY_MAX, MAX_PENDING: MAX_PENDING, MAX_RECENT: MAX_RECENT, SOURCES: SRC,
    soulbound: soulbound, deposit: deposit, SOULBOUND_MSG: SOULBOUND_MSG, SOULBOUND_T: SOULBOUND_T, cleanFinds: cleanFinds, record: record, addFame: addFame, payout: payout, text: text,
    readFinds: readFinds, writeFinds: writeFinds, recordTo: recordTo, renumberFind: renumberFind, renumberFindIn: renumberFindIn, addFameTo: addFameTo, settle: settle,
  };
}));
