// MMMap: hub map data (worlds W0..W7) + pure helpers: validate, bfs, unlock, medalGate, completion.
// Paths are undirected edges with an optional unlock: null (open) | {node, exit} | {medals: n} | {key: lockId}.
// State shape: { nodes, seenPaths, keys, keysUsed, comets } (a hub profile can be passed directly).
// UMD: browser global MMMap, or require().
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.MMMap = factory();
}(typeof self !== 'undefined' ? self : this, function () {
  const MEDALS = ['b', 's', 'g'];
  const isObj = (v) => !!v && typeof v === 'object' && !Array.isArray(v);

  // Node: {id, type, x, y, world, name, game?, medals (count 0|3), secret?, comet?, reward?}
  function N(id, type, x, y, name, extra) {
    const world = id.slice(0, 2);
    const hasMedals = type === 'level' || type === 'game' || type === 'castle';
    return Object.assign({ id, type, x, y, world, name, medals: hasMedals ? 3 : 0 }, extra || {});
  }
  const P = (from, to, unlock) => ({ id: from + '>' + to, from, to, unlock: unlock || null });
  const ex = (node, exit) => ({ node, exit: exit || 'normal' });

  const nodes = [
    // W0 Pixeltown Crossroads
    N('w0-square', 'start', 20, 11, 'Pixeltown Square'),
    N('w0-hearthvale', 'gate', 26, 11, 'Hearthvale Gate', { game: 'index.html?from=hub' }),
    N('w0-snack', 'snack', 20, 16, 'Snack Stand'),
    N('w0-first', 'level', 14, 11, 'First Steps'),
    N('w0-sparkle', 'level', 14, 6, 'Sparkle Dash'),
    N('w0-practice', 'level', 20, 5, 'Gate Practice'),
    // W1 Hearthvale Meadows
    N('w1-hearthvale', 'game', 33, 11, 'Hearthvale', { game: 'index.html?from=hub' }),
    N('w1-sparkle', 'level', 33, 6, 'Sparkle Dash'),
    N('w1-weed', 'level', 28, 4, 'Weed Sweep'),
    N('w1-turnip', 'level', 36, 4, 'Turnip Stall', { secret: true, reward: 'key' }),
    N('w1-museum', 'level', 37, 16, 'Museum Hall'),
    N('w1-bonus', 'level', 31, 18, 'Hidden Garden'),
    N('w1-castle', 'castle', 36, 20, "Mayor's Statue"),
    // W2 Mad Maze Wilds
    N('w2-lantern', 'game', 6, 18, 'The Lantern', { game: 'games/mad-maze/lantern.html?from=hub&node=w2-lantern' }),
    N('w2-burrow', 'level', 6, 13, 'Burrow Warren', { secret: true }),
    N('w2-sunken', 'level', 10, 20, 'Sunken Lantern', { secret: true }),
    N('w2-catacombs', 'level', 4, 8, 'Bonefire Catacombs'),
    N('w2-daily', 'level', 12, 16, 'Daily Maze'),
    N('w2-keep', 'castle', 4, 3, "Mazewright's Keep"),
    // W3 Deep Cave
    N('w3-deepdelve', 'game', 8, 4, 'Deepdelve', { game: 'games/deepdelve/?from=hub' }),
    N('w3-depth8', 'level', 14, 6, 'Depth -8 Checkpoint'),
    N('w3-iron', 'level', 20, 8, 'Iron Age'),
    N('w3-lava', 'level', 26, 6, 'Lava Lake', { secret: true }),
    N('w3-crystal', 'castle', 32, 10, 'Crystal Core'),
    // W4 Lakeside
    N('w4-angler', 'game', 6, 6, 'Lakeside Angler', { game: 'games/angler/index.html?from=hub' }),
    N('w4-west', 'level', 12, 10, 'West Pond'),
    N('w4-east', 'level', 18, 12, 'East Pond'),
    N('w4-river', 'level', 24, 8, 'River Run', { secret: true }),
    N('w4-pier', 'level', 30, 14, 'Sea Pier'),
    N('w4-whiskers', 'castle', 35, 18, 'Old Whiskers'),
    // W5 Festival Fields
    N('w5-safari', 'game', 6, 10, 'Bug Safari', { game: 'games/festival/bugs.html?from=hub', secret: true }),
    N('w5-jam', 'game', 14, 6, 'Campfire Jam', { game: 'games/jam/?from=hub' }),
    N('w5-stalk', 'game', 22, 10, 'Stalk Market', { game: 'games/stalk/?from=hub' }),
    N('w5-finale', 'castle', 30, 14, 'Festival Finale'),
    // Pocket arcade games beside the festival path (open paths: a bonus to walk to, never a gate)
    N('w5-pop', 'game', 18, 13, 'Pixel Pop', { game: 'games/pop/index.html?from=hub' }),
    N('w5-dash', 'game', 26, 6, 'Lantern Dash', { game: 'games/dash/index.html?from=hub' }),
    N('w5-stack', 'game', 10, 14, 'Stack Tower', { game: 'games/stack/index.html?from=hub' }),
    N('w5-echo', 'game', 33, 5, 'Echo Garden', { game: 'games/echo/index.html?from=hub' }),
    // W6 Comet Trail (secret): five challenge nodes, each worth a comet
    N('w6-night', 'level', 6, 16, 'Hearthvale Night', { comet: true }),
    N('w6-remix', 'level', 12, 12, 'Mazewright Remix', { comet: true }),
    N('w6-hardcore', 'level', 18, 8, 'Deepdelve Hardcore', { comet: true }),
    N('w6-trout', 'level', 24, 12, 'Legendary Fish', { comet: true }),
    N('w6-expert', 'level', 30, 6, 'Jam Expert', { comet: true }),
    // W7 Hearthvale Isles: the biome archipelago page (games/isles/), reached from the Hearthvale dock
    N('w7-isles', 'game', 8, 11, 'Hearthvale Isles', { game: 'games/isles/index.html?from=hub' }),
  ];

  const paths = [
    // W0
    P('w0-square', 'w0-hearthvale'), P('w0-square', 'w0-snack'), P('w0-square', 'w0-first'),
    P('w0-first', 'w0-sparkle', ex('w0-first')), P('w0-sparkle', 'w0-practice', ex('w0-sparkle')),
    P('w0-practice', 'w0-square', ex('w0-practice')),
    // W1
    P('w0-hearthvale', 'w1-hearthvale'),
    P('w1-hearthvale', 'w1-sparkle', ex('w1-hearthvale', 'visit')),
    P('w1-sparkle', 'w1-weed', ex('w1-sparkle')), P('w1-weed', 'w1-turnip', ex('w1-weed')),
    P('w1-hearthvale', 'w1-museum', ex('w1-hearthvale', 'visit')),
    P('w1-museum', 'w1-bonus', { key: 'lock-w1-a' }),
    P('w1-museum', 'w1-castle', ex('w1-museum')),
    P('w1-turnip', 'w1-castle', ex('w1-turnip', 'secret')),
    // W2
    P('w1-castle', 'w2-lantern', ex('w1-castle')),
    P('w2-lantern', 'w2-burrow'), P('w2-lantern', 'w2-daily'),
    P('w2-burrow', 'w2-catacombs', ex('w2-burrow')), P('w2-lantern', 'w2-sunken', ex('w2-daily')),
    P('w2-catacombs', 'w2-keep', ex('w2-catacombs')),
    // W3 (medal gate 8)
    P('w2-keep', 'w3-deepdelve', { medals: 8 }),
    P('w3-deepdelve', 'w3-depth8'), P('w3-depth8', 'w3-iron', ex('w3-depth8')),
    P('w3-iron', 'w3-lava', ex('w3-iron')), P('w3-iron', 'w3-crystal', ex('w3-iron')),
    // W4 (medal gate 12)
    P('w3-crystal', 'w4-angler', { medals: 12 }),
    P('w4-angler', 'w4-west'), P('w4-west', 'w4-east', ex('w4-west')), P('w4-east', 'w4-river', ex('w4-east')),
    P('w4-east', 'w4-pier', ex('w4-east')), P('w4-pier', 'w4-whiskers', ex('w4-pier')),
    // W5 (medal gate 16)
    P('w4-whiskers', 'w5-safari', { medals: 16 }),
    P('w5-safari', 'w5-jam'), P('w5-jam', 'w5-stalk'), P('w5-stalk', 'w5-finale', ex('w5-stalk')),
    P('w5-jam', 'w5-pop'), P('w5-stalk', 'w5-dash'),
    P('w5-jam', 'w5-stack'), P('w5-dash', 'w5-echo'),
    // W6: reached only through a secret exit (a comet), then one node after another
    P('w2-keep', 'w6-night', ex('w2-burrow', 'secret')),
    P('w6-night', 'w6-remix', ex('w6-night')), P('w6-remix', 'w6-hardcore', ex('w6-remix')),
    P('w6-hardcore', 'w6-trout', ex('w6-hardcore')), P('w6-trout', 'w6-expert', ex('w6-trout')),
    // W7: an open boat path from Hearthvale
    P('w1-hearthvale', 'w7-isles'),
  ];

  const MAP = {
    v: 1, start: 'w0-square',
    worlds: [
      { id: 'w0', name: 'Pixeltown Crossroads' }, { id: 'w1', name: 'Hearthvale Meadows' },
      { id: 'w2', name: 'Mad Maze Wilds' }, { id: 'w3', name: 'Deep Cave' }, { id: 'w4', name: 'Lakeside' },
      { id: 'w5', name: 'Festival Fields' }, { id: 'w6', name: 'Comet Trail' }, { id: 'w7', name: 'Hearthvale Isles' },
    ],
    nodes, paths,
  };

  // ---------- state ----------
  function strList(v, max) {
    return Array.isArray(v) ? v.filter((s) => typeof s === 'string' && s && s.length <= 80).slice(0, max) : [];
  }
  const uniq = (a) => a.filter((s, i) => a.indexOf(s) === i);
  function sanitizeState(raw) {
    const r = isObj(raw) ? raw : {};
    const nodesOut = Object.create(null);
    if (isObj(r.nodes)) {
      Object.keys(r.nodes).slice(0, 200).forEach((id) => {
        if (id === '__proto__' || id.length > 80) return;
        const n = isObj(r.nodes[id]) ? r.nodes[id] : {};
        const medals = {};
        MEDALS.forEach((m) => { medals[m] = !!(isObj(n.medals) && n.medals[m] === true); });
        nodesOut[id] = { exits: uniq(strList(n.exits, 8)), medals };
      });
    }
    const seen = Array.isArray(r.seenPaths) ? r.seenPaths : (isObj(r.map) ? r.map.seenPaths : []);
    const keys = Math.floor(Number(r.keys));
    return {
      nodes: nodesOut, seenPaths: uniq(strList(seen, 500)),
      keys: Number.isFinite(keys) ? Math.max(0, Math.min(999, keys)) : 0,
      keysUsed: uniq(strList(r.keysUsed, 100)), comets: uniq(strList(r.comets, 100)),
    };
  }
  function clone(s) { return JSON.parse(JSON.stringify(s)); }

  // Own-property node lookup: ids from saved/URL strings never reach Object.prototype.
  const NODE_BY_ID = Object.create(null);
  nodes.forEach((n) => { NODE_BY_ID[n.id] = n; });
  function hasNode(id) { return typeof id === 'string' && Object.prototype.hasOwnProperty.call(NODE_BY_ID, id); }

  // The shape the hub stores under `pixeltown-hub-v1`; an unknown `at` falls back to the start node.
  function cleanHub(raw) {
    if (typeof raw === 'string') { try { raw = JSON.parse(raw); } catch (e) { raw = null; } }
    const s = sanitizeState(raw);
    const at = isObj(raw) && hasNode(raw.at) ? raw.at : MAP.start;
    return { v: 1, at, nodes: JSON.parse(JSON.stringify(s.nodes)), seenPaths: s.seenPaths, keys: s.keys, keysUsed: s.keysUsed, comets: s.comets };
  }

  // ---------- queries ----------
  function medalCount(state) {
    const s = sanitizeState(state);
    let n = 0;
    Object.keys(s.nodes).forEach((id) => { MEDALS.forEach((m) => { if (s.nodes[id].medals[m]) n++; }); });
    return n;
  }
  function medalGate(state, n) { return medalCount(state) >= n; }

  function pathOpen(path, state) {
    const u = path.unlock;
    if (!u) return true;
    if (u.node) return !!(state.nodes[u.node] && state.nodes[u.node].exits.includes(u.exit || 'normal'));
    if (typeof u.medals === 'number') return medalCount(state) >= u.medals;
    if (u.key) return state.keysUsed.includes(u.key);
    return false;
  }
  function openPathIds(map, state) {
    const s = sanitizeState(state);
    return map.paths.filter((p) => pathOpen(p, s)).map((p) => p.id);
  }

  // Shortest route (node ids) over unlocked paths only; null when unreachable.
  // `unlocked`: array/Set of open path ids; omit to treat every path as open.
  function bfs(map, from, to, unlocked) {
    const ids = new Set(map.nodes.map((n) => n.id));
    if (!ids.has(from) || !ids.has(to)) return null;
    const open = unlocked == null ? null : new Set(unlocked);
    const adj = Object.create(null);
    map.paths.forEach((p) => {
      if (open && !open.has(p.id)) return;
      (adj[p.from] = adj[p.from] || []).push(p.to);
      (adj[p.to] = adj[p.to] || []).push(p.from);
    });
    const prev = Object.create(null);
    prev[from] = null;
    const q = [from];
    for (let i = 0; i < q.length; i++) {
      const cur = q[i];
      if (cur === to) break;
      (adj[cur] || []).forEach((nx) => { if (!(nx in prev)) { prev[nx] = cur; q.push(nx); } });
    }
    if (!(to in prev)) return null;
    const out = [];
    for (let c = to; c !== null; c = prev[c]) out.unshift(c);
    return out;
  }

  // Paths that are open, not always-visible, and not yet shown (the reveal queue).
  function pending(map, state) {
    const s = sanitizeState(state);
    return map.paths.filter((p) => p.unlock && pathOpen(p, s) && !s.seenPaths.includes(p.id)).map((p) => p.id);
  }

  // Apply a reported exit {node, exit, medals?}; returns {state, revealed}. Pure.
  // A normal exit opens normal paths only; a secret exit opens only paths that need the secret exit.
  // Revealed paths are remembered in seenPaths, so a reload never replays them.
  function unlock(map, state, exit) {
    const s = clone(sanitizeState(state));
    const e = isObj(exit) ? exit : {};
    const node = map.nodes.find((n) => n.id === e.node);
    if (node) {
      const kind = e.exit === 'secret' ? 'secret' : (e.exit === 'visit' ? 'visit' : 'normal');
      const entry = s.nodes[node.id] || (s.nodes[node.id] = { exits: [], medals: { b: false, s: false, g: false } });
      if (!entry.exits.includes(kind)) {
        entry.exits.push(kind);
        if (kind === 'secret' && node.reward === 'key') s.keys = Math.min(999, s.keys + 1);
        if (node.comet && !s.comets.includes(node.id)) s.comets.push(node.id);
      }
      (Array.isArray(e.medals) ? e.medals : []).forEach((m) => { if (MEDALS.includes(m)) entry.medals[m] = true; });
      if (node.comet && kind !== 'visit' && !s.comets.includes(node.id)) s.comets.push(node.id);
    }
    const revealed = pending(map, s);
    s.seenPaths = s.seenPaths.concat(revealed);
    return { state: s, revealed };
  }

  // Spend a Map Key on a lock id (permanent). Returns {state, ok}.
  function useKey(map, state, lockId) {
    const s = clone(sanitizeState(state));
    const lock = map.paths.some((p) => p.unlock && p.unlock.key === lockId);
    if (!lock || s.keysUsed.includes(lockId) || s.keys < 1) return { state: s, ok: false };
    s.keys--; s.keysUsed.push(lockId);
    return { state: s, ok: true };
  }

  // Percent of (medals + secret exits + comets) done, rounded to 1 decimal.
  function totals(map) {
    let medals = 0, secrets = 0, comets = 0;
    map.nodes.forEach((n) => { medals += n.medals; if (n.secret) secrets++; if (n.comet) comets++; });
    return { medals, secrets, comets, total: medals + secrets + comets };
  }
  function completion(state, map) {
    map = map || MAP;
    const s = sanitizeState(state);
    const t = totals(map);
    let done = 0;
    map.nodes.forEach((n) => {
      const st = s.nodes[n.id];
      if (st && n.medals) MEDALS.forEach((m) => { if (st.medals[m]) done++; });
      if (n.secret && st && st.exits.includes('secret')) done++;
      if (n.comet && s.comets.includes(n.id)) done++;
    });
    return t.total ? Math.round((done * 1000) / t.total) / 10 : 0;
  }

  // ---------- validation ----------
  function validate(map) {
    const errors = [];
    if (!isObj(map) || !Array.isArray(map.nodes) || !Array.isArray(map.paths)) return { ok: false, errors: ['map shape'] };
    const ids = new Set();
    map.nodes.forEach((n) => { if (!n || typeof n.id !== 'string') errors.push('bad node'); else if (ids.has(n.id)) errors.push('duplicate node id ' + n.id); else ids.add(n.id); });
    const pids = new Set();
    map.paths.forEach((p) => {
      if (!p || typeof p.id !== 'string') { errors.push('bad path'); return; }
      if (pids.has(p.id)) errors.push('duplicate path id ' + p.id);
      pids.add(p.id);
      if (!ids.has(p.from)) errors.push('path ' + p.id + ' missing endpoint ' + p.from);
      if (!ids.has(p.to)) errors.push('path ' + p.id + ' missing endpoint ' + p.to);
      if (p.unlock && p.unlock.node && !ids.has(p.unlock.node)) errors.push('path ' + p.id + ' unlock node missing ' + p.unlock.node);
    });
    if (!ids.has(map.start)) errors.push('start node missing');
    else {
      const all = map.paths.filter((p) => ids.has(p.from) && ids.has(p.to)).map((p) => p.id);
      map.nodes.forEach((n) => { if (n && ids.has(n.id) && !bfs(map, map.start, n.id, all)) errors.push('unreachable node ' + n.id); });
    }
    return { ok: errors.length === 0, errors };
  }

  return { MAP, MEDALS, validate, bfs, unlock, useKey, pending, openPathIds, medalCount, medalGate, completion, totals, sanitizeState, cleanHub, hasNode };
}));
