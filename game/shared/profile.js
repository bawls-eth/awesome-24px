// MMHubProfile: the hub's shared profile (localStorage key `pixeltown-profile-v1`).
// Seeds name/species/frame from the town save `pixeltown-save-v1` READ-ONLY (never writes it).
// Pure sanitising + small storage helpers. UMD: browser global MMHubProfile, or require().
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.MMHubProfile = factory();
}(typeof self !== 'undefined' ? self : this, function () {
  const KEY = 'pixeltown-profile-v1';
  const TOWN_KEY = 'pixeltown-save-v1';
  const MAX_RESULTS = 20;
  const MAX_TOKENS = 99999999;
  const MEDALS = ['b', 's', 'g'];
  const EXITS = ['normal', 'secret', 'visit'];

  const isObj = (v) => !!v && typeof v === 'object' && !Array.isArray(v);
  function int(v, lo, hi, def) {
    v = Math.floor(Number(v));
    if (!Number.isFinite(v)) v = def === undefined ? lo : def;
    return Math.max(lo, Math.min(hi, v));
  }
  function str(v, max, def) { return typeof v === 'string' && v.length ? v.slice(0, max) : def; }
  function strList(v, max) {
    return Array.isArray(v) ? v.filter((s) => typeof s === 'string' && s.length && s.length <= 80).slice(0, max) : [];
  }
  function uniq(a) { return a.filter((s, i) => a.indexOf(s) === i); }

  function cleanNode(n) {
    n = isObj(n) ? n : {};
    const medals = {};
    MEDALS.forEach((m) => { medals[m] = !!(isObj(n.medals) && n.medals[m] === true); });
    const out = { exits: uniq(strList(n.exits, 8).filter((e) => EXITS.includes(e))), medals };
    if (isObj(n.best) && Number.isFinite(Number(n.best.timeMs)) && Number(n.best.timeMs) > 0) {
      out.best = { timeMs: int(n.best.timeMs, 1, 1e9) };
    }
    return out;
  }
  function cleanNodes(v) {
    const out = Object.create(null);
    if (isObj(v)) Object.keys(v).slice(0, 200).forEach((id) => { if (id.length <= 80 && id !== '__proto__') out[id] = cleanNode(v[id]); });
    return out;
  }
  function cleanResult(r) {
    if (!isObj(r) || typeof r.node !== 'string' || !r.node) return null;
    const out = {
      node: r.node.slice(0, 80),
      exit: EXITS.includes(r.exit) ? r.exit : 'normal',
      medals: uniq(Array.isArray(r.medals) ? r.medals.filter((m) => MEDALS.includes(m)) : []),
      tokens: int(r.tokens, 0, 100000, 0),
    };
    if (isObj(r.best) && Number(r.best.timeMs) > 0) out.best = { timeMs: int(r.best.timeMs, 1, 1e9) };
    return out;
  }

  function defaults() {
    return {
      v: 1, id: 'p_local', created: 0, name: 'Villager', species: 'coolcats', frame: 0,
      settings: {}, map: { at: 'w0-square', world: 'w0', seenPaths: [] },
      nodes: {}, keys: 0, keysUsed: [], comets: [], tokens: 0, unlocks: [], games: {}, results: [],
    };
  }

  // Per-field fallback; unknown top-level keys are kept (forward compatibility).
  function sanitize(raw) {
    const d = defaults();
    if (!isObj(raw)) return d;
    const out = Object.assign({}, raw);
    out.v = 1;
    out.id = str(raw.id, 40, d.id);
    out.created = int(raw.created, 0, 1e15, 0);
    out.name = str(raw.name, 24, d.name);
    out.species = str(raw.species, 40, d.species);
    out.frame = int(raw.frame, 0, 99, 0);
    out.settings = isObj(raw.settings) ? raw.settings : {};
    const m = isObj(raw.map) ? raw.map : {};
    out.map = Object.assign({}, m, {
      at: str(m.at, 80, d.map.at), world: str(m.world, 8, d.map.world), seenPaths: uniq(strList(m.seenPaths, 500)),
    });
    out.nodes = cleanNodes(raw.nodes);
    out.keys = int(raw.keys, 0, 999, 0);
    out.keysUsed = uniq(strList(raw.keysUsed, 100));
    out.comets = uniq(strList(raw.comets, 100));
    out.tokens = int(raw.tokens, 0, MAX_TOKENS, 0);
    out.unlocks = uniq(strList(raw.unlocks, 200));
    out.games = isObj(raw.games) ? raw.games : {};
    out.results = (Array.isArray(raw.results) ? raw.results : []).map(cleanResult).filter(Boolean).slice(-MAX_RESULTS);
    return out;
  }

  function parse(s) { try { return JSON.parse(s); } catch (e) { return null; } }
  function read(storage, key) { try { return storage.getItem(key); } catch (e) { return null; } }

  // Build a profile from the town save. Reads only; corrupt fields fall back one by one.
  function seedFromTown(townRaw, now) {
    const town = parse(typeof townRaw === 'string' ? townRaw : null);
    const p = sanitize(isObj(town) ? { name: town.name, species: town.species, frame: town.frame } : null);
    p.created = int(now, 0, 1e15, 0);
    if (isObj(town)) {
      const s = {};
      if (typeof town.sfxMuted === 'boolean') s.sfxMuted = town.sfxMuted;
      if (typeof town.reduceMotion === 'boolean') s.reduceMotion = town.reduceMotion;
      if (typeof town.musicEnabled === 'boolean') s.music = town.musicEnabled;
      p.settings = s;
    }
    return p;
  }

  // Load the profile; if none stored (or unparsable), seed from the town save and write ONLY the profile key.
  function load(storage, now) {
    const raw = parse(read(storage, KEY));
    if (isObj(raw)) return sanitize(raw);
    const p = seedFromTown(read(storage, TOWN_KEY), now);
    save(storage, p);
    return p;
  }
  function save(storage, profile) {
    try { storage.setItem(KEY, JSON.stringify(sanitize(profile))); return true; } catch (e) { return false; }
  }

  // Pure: returns a new profile with the result merged, Tokens added and the results list capped at 20.
  function reportResult(profile, result) {
    const p = sanitize(profile);
    const r = cleanResult(result);
    if (!r) return p;
    const n = cleanNode(p.nodes[r.node]);
    r.medals.forEach((m) => { n.medals[m] = true; });
    if (!n.exits.includes(r.exit)) n.exits.push(r.exit);
    if (r.best && (!n.best || r.best.timeMs < n.best.timeMs)) n.best = { timeMs: r.best.timeMs };
    p.nodes[r.node] = n;
    p.tokens = Math.min(MAX_TOKENS, p.tokens + r.tokens);
    p.results = p.results.concat([r]).slice(-MAX_RESULTS);
    return p;
  }
  // Storage convenience for games: load, report, save.
  function report(storage, result, now) { const p = reportResult(load(storage, now), result); save(storage, p); return p; }

  return { KEY, TOWN_KEY, MAX_RESULTS, defaults, sanitize, seedFromTown, load, save, reportResult, report };
}));
