// MMIsles: the island graph and the archipelago save (key `pixeltown-archipelago-v1`, BIOME-ARCH-PLAN 1.3 and 2.6) plus the
// medals summary (`pixeltown-medals-isles-v1` = {"v":1,"m":[ids]}, the page is its single writer). Pure data + validation, no DOM.
// A save is { v, at, returnTo, unlock[], isles{id:{seed,pos,fog,chests}}, home{grid[<=400],stable{slots}}, log{seen,ko,tamed,bugs,fish},
// rides, wild{<=4} }. B10 adds (all additive): home.inv{kind:n} + home.seeded (MMHomestead decor), visited[isle], bosses[id],
// gather{day, got{isle:[idx]}, log{res:n}} (daily-free gather spots). X2 adds inv{item:n} (crafting stacks, <=64 x 999). clean() always returns a valid save (corrupt -> defaults) and keeps the whole key under 20 KB.
// This module never touches `pixeltown-save-v1`.
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.MMIsles = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  const KEY = 'pixeltown-archipelago-v1';
  const MEDALS_KEY = 'pixeltown-medals-isles-v1';
  const MAX_BYTES = 20000;
  const MAX_GRID = 400, GRID_W = 20;
  const MAX_WILD = 4, WILD_KEEP_MS = 10 * 60 * 1000;
  const MAX_LOG = 60, MAX_CHESTS = 64, MAX_FOG = 512;
  const LOG_KINDS = ['seen', 'ko', 'tamed', 'bugs', 'fish'];
  // medal ids are append-only. B10: first tame of each size class, each island visited, each island boss seen (no streaks, no timers).
  const MEDAL_IDS = ['tame1', 'log6', 'ride1', 'stable5', 'tame_s', 'tame_m', 'tame_l', 'tame_xl',
    'visit_home', 'visit_jungle', 'visit_reef', 'visit_ice', 'visit_mars', 'boss_fernjaw_tyrant', 'boss_tide_hydra', 'boss_frost_dragon', 'boss_red_titan'];
  const MEDAL_NAMES = { tame1: 'First tame', log6: '6 creatures seen', ride1: 'First ride', stable5: '5 tames', tame_s: 'Small friend', tame_m: 'Medium friend',
    tame_l: 'Large friend', tame_xl: 'Giant friend', visit_home: 'Hearth Isle', visit_jungle: 'Verdant Jungle', visit_reef: 'Coral Reef', visit_ice: 'Frostfang Tundra',
    visit_mars: 'Red Waste', boss_fernjaw_tyrant: 'Fernjaw Tyrant seen', boss_tide_hydra: 'Tide Hydra seen', boss_frost_dragon: 'Frost Dragon seen', boss_red_titan: 'Red Titan seen' };
  const SIZE_MEDAL = { S: 'tame_s', M: 'tame_m', L: 'tame_l', XL: 'tame_xl' };
  const MAX_BOSSES = 16, MAX_GOT = 16;
  const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;
  const BAD = ['__proto__', 'constructor', 'prototype'];

  const ISLES = {
    home: { id: 'home', pack: 'home', size: 96, fixedSeed: true },
    jungle: { id: 'jungle', pack: 'jungle' },
    ice: { id: 'ice', pack: 'ice', unlock: { tamed: 3 } },
    reef: { id: 'reef', pack: 'reef', unlock: { mount: 'swim' } },
    mars: { id: 'mars', pack: 'mars', unlock: { item: 'rocket_core' } },
    realm: { id: 'realm', external: '../mad-maze/index.html?mode=world' }
  };
  const ROUTES = [['home', 'jungle', 'boat'], ['home', 'ice', 'boat'], ['home', 'reef', 'boat'], ['home', 'mars', 'rocket'], ['home', 'realm', 'portal']];
  const ALWAYS_OPEN = ['home', 'jungle', 'realm'];
  const SAVED_ISLES = ['home', 'jungle', 'ice', 'reef', 'mars'];     // islands that keep a position/fog/chests record

  const has = (o, k) => Object.prototype.hasOwnProperty.call(o, k);
  const isObj = (v) => !!v && typeof v === 'object' && !Array.isArray(v);
  const num = (v, d) => { v = typeof v === 'number' ? v : Number(v); return Number.isFinite(v) ? v : d; };
  const int = (v, lo, hi, d) => Math.max(lo, Math.min(hi, Math.floor(num(v, d))));
  const isleId = (v) => (typeof v === 'string' && has(ISLES, v) ? v : '');
  const KEY_RE = /^[a-z][a-z0-9_]{0,23}$/;
  const WILD_RE = /^[a-z0-9_]{1,12}:[a-z0-9_]{1,12}:\d{1,4}$/;

  function defaults() {
    return { v: 1, at: 'home', returnTo: null, unlock: ['jungle'], isles: {}, home: { grid: [], stable: { slots: 12 } },
      log: { seen: {}, ko: {}, tamed: {}, bugs: {}, fish: {} }, rides: 0, wild: {}, visited: [], bosses: [], gather: { day: '', got: {}, log: {} }, inv: {} };
  }

  function cleanPos(p) {
    if (!isObj(p)) return null;
    const x = num(p.x, NaN), y = num(p.y, NaN);
    if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
    return { x: Math.max(0, Math.min(1e5, Math.round(x * 10) / 10)), y: Math.max(0, Math.min(1e5, Math.round(y * 10) / 10)) };
  }
  function cleanIsle(r) {
    const o = isObj(r) ? r : {};
    return {
      seed: typeof o.seed === 'string' && /^\d{1,12}$/.test(o.seed) ? o.seed : (Number.isInteger(o.seed) && o.seed >= 0 && o.seed < 1e12 ? String(o.seed) : ''),
      pos: cleanPos(o.pos),
      fog: typeof o.fog === 'string' && o.fog.length <= MAX_FOG && /^[A-Za-z0-9+/=_-]*$/.test(o.fog) ? o.fog : '',
      chests: (Array.isArray(o.chests) ? o.chests.slice(0, MAX_CHESTS) : []).filter((c) => typeof c === 'string' && /^[a-z0-9_:-]{1,16}$/.test(c))
    };
  }
  function cleanGrid(g) {
    const out = [], seen = Object.create(null);
    (Array.isArray(g) ? g.slice(0, MAX_GRID * 2) : []).forEach((c) => {
      if (out.length >= MAX_GRID || !Array.isArray(c) || c.length < 3) return;
      const x = num(c[0], NaN), y = num(c[1], NaN);
      if (!Number.isInteger(x) || !Number.isInteger(y) || x < 0 || y < 0 || x >= GRID_W || y >= GRID_W) return;
      if (typeof c[2] !== 'string' || !/^[a-z_]{1,16}$/.test(c[2]) || BAD.indexOf(c[2]) >= 0) return;
      const k = x + ',' + y;
      if (seen[k]) return;
      seen[k] = 1; out.push([x, y, c[2]]);
    });
    return out;
  }
  function cleanCounts(m) {
    const out = {};
    if (!isObj(m)) return out;
    Object.keys(m).slice(0, MAX_LOG * 3).forEach((k) => {
      if (Object.keys(out).length >= MAX_LOG || !KEY_RE.test(k) || BAD.indexOf(k) >= 0) return;
      const n = int(m[k], 0, 99999, 0);
      if (n > 0) out[k] = n;
    });
    return out;
  }
  // wild: in-progress tames kept for 10 minutes. nowMs optional: with it, expired entries are dropped and `until` is capped at now+10 min.
  function cleanWild(w, nowMs) {
    const rows = [];
    if (isObj(w)) {
      Object.keys(w).slice(0, 32).forEach((k) => {
        const e = w[k];
        if (!WILD_RE.test(k) || !isObj(e)) return;
        let until = int(e.until, 0, 1e15, 0);
        if (Number.isFinite(nowMs)) { if (until < nowMs) return; until = Math.min(until, nowMs + WILD_KEEP_MS); }
        rows.push([k, { torpor: Math.round(Math.max(0, Math.min(1000, num(e.torpor, 0))) * 100) / 100, prog: int(e.prog, 0, 50, 0),
          eff: Math.round(Math.max(0, Math.min(1, num(e.eff, 0))) * 1000) / 1000, until: until }]);
      });
    }
    rows.sort((a, b) => b[1].until - a[1].until || (a[0] < b[0] ? -1 : 1));
    const out = {};
    rows.slice(0, MAX_WILD).forEach((r) => { out[r[0]] = r[1]; });
    return out;
  }

  function cleanGather(g) {
    const out = { day: '', got: {}, log: {} };
    if (!isObj(g)) return out;
    out.day = typeof g.day === 'string' && DAY_RE.test(g.day) ? g.day : '';
    if (isObj(g.got)) SAVED_ISLES.forEach((id) => {
      if (!has(g.got, id) || !Array.isArray(g.got[id])) return;
      const a = [];
      g.got[id].slice(0, MAX_GOT * 2).forEach((i) => { if (a.length < MAX_GOT && Number.isInteger(i) && i >= 0 && i <= 99999 && a.indexOf(i) < 0) a.push(i); });
      out.got[id] = a;
    });
    out.log = cleanCounts(g.log);
    return out;
  }

  // X2: crafting inventory { item: 1..999 }, <=64 stacks. Uses MMIsleCraft.cleanInv when loaded (drops ids no pack or drop table produces);
  // otherwise a shape-only fallback (valid key, integer 1..999).
  function cleanInvX(inv) {
    let CR = null;
    try { CR = typeof module === 'object' && module.exports ? require('./mm-isle-craft.js') : (typeof self !== 'undefined' ? self.MMIsleCraft : null); } catch (e) { CR = null; }
    if (CR && CR.cleanInv) return CR.cleanInv(inv);
    const out = {};
    if (!isObj(inv)) return out;
    Object.keys(inv).slice(0, 512).forEach((k) => { if (Object.keys(out).length < 64 && KEY_RE.test(k) && BAD.indexOf(k) < 0 && Number.isInteger(inv[k]) && inv[k] >= 1) out[k] = Math.min(999, inv[k]); });
    return out;
  }
  function clean(raw, nowMs) {
    const out = defaults();
    try {
      if (!isObj(raw)) return out;
      out.at = isleId(raw.at) && raw.at !== 'realm' ? raw.at : 'home';
      const rt = raw.returnTo;
      if (isObj(rt) && isleId(rt.isle) && cleanPos(rt)) { const p = cleanPos(rt); out.returnTo = { isle: rt.isle, x: p.x, y: p.y }; }
      const un = [];
      (Array.isArray(raw.unlock) ? raw.unlock.slice(0, 16) : []).forEach((id) => { if (isleId(id) && id !== 'home' && id !== 'realm' && un.indexOf(id) < 0) un.push(id); });
      if (un.indexOf('jungle') < 0) un.unshift('jungle');
      out.unlock = un;
      if (isObj(raw.isles)) SAVED_ISLES.forEach((id) => { if (has(raw.isles, id) && isObj(raw.isles[id])) out.isles[id] = cleanIsle(raw.isles[id]); });
      if (isObj(raw.home)) {
        out.home.grid = cleanGrid(raw.home.grid);
        out.home.stable.slots = int(isObj(raw.home.stable) ? raw.home.stable.slots : 12, 12, 24, 12);
        if (isObj(raw.home.inv)) { const inv = cleanCounts(raw.home.inv); Object.keys(raw.home.inv).forEach((k) => { if (KEY_RE.test(k) && BAD.indexOf(k) < 0 && raw.home.inv[k] === 0 && Object.keys(inv).length < MAX_LOG) inv[k] = 0; }); out.home.inv = inv; }
        if (raw.home.seeded === 1 || raw.home.seeded === true) out.home.seeded = 1;
      }
      if (isObj(raw.log)) LOG_KINDS.forEach((k) => { out.log[k] = cleanCounts(raw.log[k]); });
      out.rides = int(raw.rides, 0, 99999, 0);
      out.wild = cleanWild(raw.wild, nowMs);
      (Array.isArray(raw.visited) ? raw.visited.slice(0, 16) : []).forEach((id) => { if (SAVED_ISLES.indexOf(id) >= 0 && out.visited.indexOf(id) < 0) out.visited.push(id); });
      (Array.isArray(raw.bosses) ? raw.bosses.slice(0, 64) : []).forEach((id) => { if (out.bosses.length < MAX_BOSSES && typeof id === 'string' && KEY_RE.test(id) && BAD.indexOf(id) < 0 && out.bosses.indexOf(id) < 0) out.bosses.push(id); });
      out.gather = cleanGather(raw.gather);
      out.inv = cleanInvX(raw.inv);
      // size guard: shed the least valuable data first until the key fits
      const size = () => JSON.stringify(out).length;
      if (size() > MAX_BYTES) out.inv = {};
      if (size() > MAX_BYTES) out.wild = {};
      if (size() > MAX_BYTES) { out.log.bugs = {}; out.log.fish = {}; }
      if (size() > MAX_BYTES) Object.keys(out.isles).forEach((id) => { out.isles[id].chests = []; });
      if (size() > MAX_BYTES) out.home.grid = out.home.grid.slice(0, 200);
      if (size() > MAX_BYTES) return defaults();
    } catch (e) { return defaults(); }
    return out;
  }

  // ---- graph ----
  const isUnlocked = (save, id) => isleId(id) !== '' && (ALWAYS_OPEN.indexOf(id) >= 0 || (isObj(save) && Array.isArray(save.unlock) && save.unlock.indexOf(id) >= 0));
  // ctx = { tamed:number, mounts:['swim'...] | {swim:true}, items:['rocket_core'...] | {rocket_core:true} }
  function meetsUnlock(id, ctx) {
    const isle = has(ISLES, id) ? ISLES[id] : null;
    if (!isle) return false;
    if (!isle.unlock) return true;
    const c = isObj(ctx) ? ctx : {};
    const hasIn = (coll, k) => (Array.isArray(coll) ? coll.indexOf(k) >= 0 : isObj(coll) && has(coll, k) && !!coll[k]);
    const u = isle.unlock;
    if (has(u, 'tamed')) return num(c.tamed, 0) >= u.tamed;
    if (has(u, 'mount')) return hasIn(c.mounts, u.mount);
    if (has(u, 'item')) return hasIn(c.items, u.item);
    return false;
  }
  function unlockIsle(save, id, ctx) {
    if (!isObj(save) || !isleId(id) || id === 'home' || id === 'realm') return false;
    if (!Array.isArray(save.unlock)) save.unlock = ['jungle'];
    if (save.unlock.indexOf(id) >= 0) return true;
    if (!meetsUnlock(id, ctx)) return false;
    save.unlock.push(id);
    return true;
  }
  function routeBetween(a, b) {
    for (let i = 0; i < ROUTES.length; i++) {
      const r = ROUTES[i];
      if ((r[0] === a && r[1] === b) || (r[0] === b && r[1] === a)) return r[2];
    }
    // jungle <-> reef style trips go through home: not a direct route
    return null;
  }
  // Destinations the sea chart may offer from `from`: unlocked islands with a direct route.
  function destinations(save, from) {
    return ROUTES.filter((r) => r[0] === from || r[1] === from).map((r) => ({ id: r[0] === from ? r[1] : r[0], mode: r[2] })).filter((d) => isUnlocked(save, d.id));
  }

  // ---- progress helpers (mutate the cleaned save) ----
  function noteLog(save, kind, sp, n) {
    if (!isObj(save) || LOG_KINDS.indexOf(kind) < 0 || typeof sp !== 'string' || !KEY_RE.test(sp) || BAD.indexOf(sp) >= 0) return 0;
    if (!isObj(save.log)) save.log = defaults().log;
    if (!isObj(save.log[kind])) save.log[kind] = {};
    const m = save.log[kind];
    if (!has(m, sp) && Object.keys(m).length >= MAX_LOG) return 0;
    m[sp] = int((has(m, sp) ? m[sp] : 0) + int(n === undefined ? 1 : n, 0, 99999, 1), 0, 99999, 0);
    return m[sp];
  }
  const logCount = (save, kind) => (isObj(save) && isObj(save.log) && isObj(save.log[kind]) ? Object.keys(save.log[kind]).filter((k) => save.log[kind][k] > 0).length : 0);
  function setPos(save, id, x, y) {
    if (!isObj(save) || SAVED_ISLES.indexOf(id) < 0) return false;
    const p = cleanPos({ x: x, y: y });
    if (!p) return false;
    if (!isObj(save.isles)) save.isles = {};
    if (!isObj(save.isles[id])) save.isles[id] = cleanIsle({});
    save.isles[id].pos = p;
    return true;
  }
  const lastPos = (save, id) => (isObj(save) && isObj(save.isles) && isObj(save.isles[id]) && save.isles[id].pos ? { x: save.isles[id].pos.x, y: save.isles[id].pos.y } : null);

  // ---- medals ----
  function cleanMedals(raw) {
    let o = raw;
    if (typeof raw === 'string') { try { o = JSON.parse(raw); } catch (e) { return { v: 1, m: [] }; } }
    const m = [];
    if (isObj(o) && Array.isArray(o.m)) o.m.slice(0, 64).forEach((id) => { if (typeof id === 'string' && MEDAL_IDS.indexOf(id) >= 0 && m.indexOf(id) < 0) m.push(id); });
    return { v: 1, m: MEDAL_IDS.filter((id) => m.indexOf(id) >= 0) };
  }
  // earned medal ids from the archipelago save and the tames save ({roster:[...]}); sizeOf(sp) -> 'S'|'M'|'L'|'XL' (optional, MMCreatures).
  function medalsFor(save, tames, sizeOf) {
    const s = isObj(save) ? save : defaults();
    const roster = isObj(tames) && Array.isArray(tames.roster) ? tames.roster.length : 0;
    const tamedSpecies = logCount(s, 'tamed');
    const m = [];
    if (roster >= 1 || tamedSpecies >= 1) m.push('tame1');
    if (logCount(s, 'seen') >= 6) m.push('log6');
    if (num(s.rides, 0) >= 1 || (isObj(tames) && typeof tames.mount === 'string')) m.push('ride1');
    if (roster >= 5) m.push('stable5');
    if (typeof sizeOf === 'function') {
      const sps = [];
      if (isObj(tames) && Array.isArray(tames.roster)) tames.roster.forEach((t) => { if (isObj(t) && typeof t.sp === 'string') sps.push(t.sp); });
      if (isObj(s.log) && isObj(s.log.tamed)) Object.keys(s.log.tamed).forEach((k) => sps.push(k));
      const got = {};
      sps.forEach((sp) => { let z = null; try { z = sizeOf(sp); } catch (e) { z = null; } if (typeof z === 'string' && has(SIZE_MEDAL, z)) got[SIZE_MEDAL[z]] = 1; });
      ['tame_s', 'tame_m', 'tame_l', 'tame_xl'].forEach((id) => { if (got[id]) m.push(id); });
    }
    (Array.isArray(s.visited) ? s.visited : []).forEach((id) => { const k = 'visit_' + id; if (MEDAL_IDS.indexOf(k) >= 0 && m.indexOf(k) < 0) m.push(k); });
    (Array.isArray(s.bosses) ? s.bosses : []).forEach((id) => { const k = 'boss_' + id; if (MEDAL_IDS.indexOf(k) >= 0 && m.indexOf(k) < 0) m.push(k); });
    return m;
  }
  // Additive write of the summary key: existing medals are kept, new ones added. Never throws.
  function writeMedals(storage, ids) {
    try {
      let cur = { v: 1, m: [] };
      try { cur = cleanMedals(storage.getItem(MEDALS_KEY)); } catch (e) { /* none */ }
      const merged = cleanMedals({ m: cur.m.concat(Array.isArray(ids) ? ids : []) });
      storage.setItem(MEDALS_KEY, JSON.stringify(merged));
      return merged.m.slice();
    } catch (e) { return null; }
  }

  // B10 progress helpers: true only the first time (so a medal can be announced exactly once)
  function noteVisit(save, id) {
    if (!isObj(save) || SAVED_ISLES.indexOf(id) < 0) return false;
    if (!Array.isArray(save.visited)) save.visited = [];
    if (save.visited.indexOf(id) >= 0) return false;
    save.visited.push(id); return true;
  }
  function noteBoss(save, id) {
    if (!isObj(save) || typeof id !== 'string' || !KEY_RE.test(id) || BAD.indexOf(id) >= 0) return false;
    if (!Array.isArray(save.bosses)) save.bosses = [];
    if (save.bosses.indexOf(id) >= 0 || save.bosses.length >= MAX_BOSSES) return false;
    save.bosses.push(id); return true;
  }
  // map a page ?isle= value (isle id or pack id / alias) to the isle id: meadow -> home, tundra -> ice
  const PACK_TO_ISLE = { meadow: 'home', home: 'home', tundra: 'ice', ice: 'ice', jungle: 'jungle', reef: 'reef', mars: 'mars' };
  const isleFor = (v) => (typeof v === 'string' && has(PACK_TO_ISLE, v) ? PACK_TO_ISLE[v] : '');

  function load(storage, nowMs) {
    try { const s = storage.getItem(KEY); return clean(typeof s === 'string' ? JSON.parse(s) : null, nowMs); } catch (e) { return defaults(); }
  }
  function write(storage, save) {
    try { storage.setItem(KEY, JSON.stringify(clean(save))); return true; } catch (e) { return false; }
  }

  return {
    KEY: KEY, MEDALS_KEY: MEDALS_KEY, ISLES: ISLES, ROUTES: ROUTES, MAX_GRID: MAX_GRID, MAX_WILD: MAX_WILD, MAX_BYTES: MAX_BYTES,
    LOG_KINDS: LOG_KINDS, MEDAL_IDS: MEDAL_IDS, MEDAL_NAMES: MEDAL_NAMES, WILD_KEEP_MS: WILD_KEEP_MS, SAVED_ISLES: SAVED_ISLES,
    noteVisit: noteVisit, noteBoss: noteBoss, isleFor: isleFor, cleanGather: cleanGather,
    defaults: defaults, clean: clean, isUnlocked: isUnlocked, meetsUnlock: meetsUnlock, unlockIsle: unlockIsle, routeBetween: routeBetween,
    destinations: destinations, noteLog: noteLog, logCount: logCount, setPos: setPos, lastPos: lastPos, cleanMedals: cleanMedals,
    medalsFor: medalsFor, writeMedals: writeMedals, load: load, write: write
  };
});
