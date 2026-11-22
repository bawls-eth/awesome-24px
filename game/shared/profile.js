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

  // ---------- game milestones (hub map progress) ----------
  // Each game passes the milestone ids its OWN save already shows (one line, on load and after each save); sync()
  // reports every id once (remembered in profile.games[game].done), so a reload never adds Tokens twice. Only the
  // profile key is written, and only when something new was reached. hit = [node, exit, medal|null].
  const TOKENS = 10;
  const COMETS = ['w6-night', 'w6-remix', 'w6-hardcore', 'w6-trout', 'w6-expert'];
  const ms = (id, label, ...hits) => ({ id, label, hits: hits.map((h) => ({ node: h[0], exit: h[1] || 'normal', medal: h[2] || null })) });
  const MILESTONES = {
    jam: [ms('play', 'Finish a song', ['w5-jam']), ms('star1', 'Earn a first star', ['w5-jam', 'normal', 'b']),
      ms('stars12', 'Earn 12 stars', ['w5-jam', 'normal', 's']), ms('fullcombo', 'Full combo a song', ['w5-jam', 'normal', 'g']),
      ms('hard3', '3 stars on a Hard song', ['w6-expert', 'normal', 'b'])],
    bugs: [ms('catch1', 'Catch a first bug', ['w5-safari', 'normal', 'b']), ms('stars6', 'Earn 6 stars', ['w5-safari', 'normal', 's']),
      ms('rare', 'Catch a Gold Beetle or a Moonwing', ['w5-safari', 'secret']), ms('stars24', 'Earn 24 stars', ['w5-safari', 'normal', 'g'])],
    stalk: [ms('trade', 'Buy your first stalks', ['w5-stalk']), ms('bronze', 'Bronze week (500 profit)', ['w5-stalk', 'normal', 'b']),
      ms('silver', 'Silver week (2000 profit)', ['w5-stalk', 'normal', 's']), ms('gold', 'Gold week (10000 profit)', ['w5-stalk', 'normal', 'g'])],
    angler: [ms('catch1', 'Catch a first fish', ['w4-angler', 'normal', 'b']), ms('species10', 'Log 10 species', ['w4-angler', 'normal', 's']),
      ms('west', 'Log a West Pond fish', ['w4-west', 'normal', 'b']), ms('east', 'Log an East Pond fish', ['w4-east', 'normal', 'b']),
      ms('river', 'Log a River fish', ['w4-river', 'secret', 'b']), ms('pier', 'Log a Sea Pier fish', ['w4-pier', 'normal', 'b']),
      ms('whiskers', 'Land Old Whiskers', ['w4-whiskers', 'normal', 'b']), ms('trout', 'Catch the Golden River Trout', ['w6-trout', 'normal', 'b'])],
    deepdelve: [ms('dig', 'Dig below the surface', ['w3-deepdelve', 'normal', 'b']), ms('bronze', 'Reach depth 8', ['w3-depth8', 'normal', 'b']),
      ms('silver', 'Craft an iron pick', ['w3-iron', 'normal', 'b']), ms('secret', 'Find the Lava Lake', ['w3-lava', 'secret', 'b']),
      ms('depth20', 'Reach depth 20', ['w3-deepdelve', 'normal', 's']), ms('depth40', 'Reach depth 40', ['w3-deepdelve', 'normal', 'g']),
      ms('wyrm', 'Beat the Rock Wyrm', ['w3-crystal', 'normal', 'b'])],
    lantern: [ms('hero1', 'Make a first hero', ['w2-lantern', 'normal', 'b']), ms('warren', 'Bring a Warren find home', ['w2-burrow', 'normal', 'b']),
      ms('level5', 'A hero reaches level 5', ['w2-catacombs', 'normal', 'b']), ms('level10', 'A hero reaches level 10', ['w2-keep', 'normal', 'b'], ['w2-lantern', 'normal', 's']),
      ms('retire', 'Retire a hero at level 20', ['w2-lantern', 'normal', 'g'])],
  };
  const GAMES = Object.keys(MILESTONES);
  // Cross-game goals, derived from the games' done lists (never from anything else).
  const FESTIVAL = [['bugs', 'catch1'], ['jam', 'star1'], ['stalk', 'bronze']];
  const DERIVED = [
    { node: 'w0-first', label: 'Reach a first milestone in any game', test: (n) => n >= 1 },
    { node: 'w0-sparkle', label: 'Reach a milestone in 3 different games', test: (n) => n >= 3 },
    { node: 'w0-practice', label: 'Reach a milestone in all 6 games', test: (n) => n >= GAMES.length },
    { node: 'w5-finale', label: 'Bug Safari first bug, Jam first star and a Stalk bronze week', test: (n, done) => FESTIVAL.every((f) => done(f[0]).includes(f[1])) },
  ];
  const own = (o, k) => Object.prototype.hasOwnProperty.call(o, k);
  function doneOf(p, game) {
    const g = isObj(p.games) && own(p.games, game) && isObj(p.games[game]) ? p.games[game] : {};
    const ok = MILESTONES[game].map((m) => m.id);
    return uniq(strList(g.done, 64).filter((id) => ok.includes(id)));
  }
  function applyHit(p, h, tokens) {
    p = reportResult(p, { node: h.node, exit: h.exit, medals: h.medal ? [h.medal] : [], tokens });
    if (COMETS.includes(h.node) && !p.comets.includes(h.node)) p.comets = p.comets.concat([h.node]);
    return p;
  }
  // Pure: {profile, added: [milestone ids]}.
  function syncGame(profile, game, ids) {
    let p = sanitize(profile);
    if (!own(MILESTONES, game)) return { profile: p, added: [] };
    const want = uniq((Array.isArray(ids) ? ids : []).filter((s) => typeof s === 'string'));
    const done = doneOf(p, game);
    const added = [];
    MILESTONES[game].forEach((m) => {
      if (!want.includes(m.id) || done.includes(m.id)) return;
      m.hits.forEach((h, i) => { p = applyHit(p, h, i === 0 ? TOKENS : 0); });
      done.push(m.id); added.push(m.id);
    });
    if (!added.length) return { profile: p, added };
    p.games = Object.assign({}, p.games, { [game]: Object.assign({}, isObj(p.games[game]) ? p.games[game] : {}, { done }) });
    const doneFor = (g) => doneOf(p, g);
    const played = GAMES.filter((g) => doneFor(g).length > 0).length;
    DERIVED.forEach((d) => {
      const st = p.nodes[d.node];
      if (d.test(played, doneFor) && !(st && st.exits.includes('normal'))) p = applyHit(p, { node: d.node, exit: 'normal', medal: 'b' }, TOKENS);
    });
    return { profile: p, added };
  }
  // Storage: report what is new for `game`; writes only the profile key, and only when something was added.
  function sync(storage, game, ids, now) {
    const raw = parse(read(storage, KEY));
    const base = isObj(raw) ? sanitize(raw) : seedFromTown(read(storage, TOWN_KEY), now === undefined ? Date.now() : now);
    const r = syncGame(base, game, ids);
    if (r.added.length) save(storage, r.profile);
    return r;
  }
  // Read-only: the goals that clear a map node ({game|null, id|null, label, done}).
  function goalsFor(profile, nodeId) {
    const p = sanitize(profile), out = [];
    GAMES.forEach((g) => {
      const done = doneOf(p, g);
      MILESTONES[g].forEach((m) => { if (m.hits.some((h) => h.node === nodeId)) out.push({ game: g, id: m.id, label: m.label, done: done.includes(m.id) }); });
    });
    DERIVED.forEach((d) => { if (d.node === nodeId) out.push({ game: null, id: null, label: d.label, done: !!(p.nodes[nodeId] && p.nodes[nodeId].exits.includes('normal')) }); });
    return out;
  }

  return { KEY, TOWN_KEY, MAX_RESULTS, MILESTONES, DERIVED, defaults, sanitize, seedFromTown, load, save, reportResult, report, syncGame, sync, goalsFor };
}));
