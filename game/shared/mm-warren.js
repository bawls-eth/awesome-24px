// Mad Maze Warren generator (room graph). Pure, deterministic, no DOM/Math.random.
// UMD: browser global MMWarren, or require(). Uses MMRng for seeded randomness.
// Rooms sit on a 9x8 cell grid (x,y in cells; w,h = room size in tiles, 17x13).
// Path lengths (boss = farthest, key reachability) ignore the secret room and
// its cracked doors, so the secret never acts as a shortcut.
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./rng.js'));
  else root.MMWarren = factory(root.MMRng);
}(typeof self !== 'undefined' ? self : this, function (MMRng) {
  const GW = 9, GH = 8, RW = 17, RH = 13;
  const DIRS = [[0, -1, 'N'], [1, 0, 'E'], [0, 1, 'S'], [-1, 0, 'W']];

  function bfs(adj, start) {
    const dist = adj.map(() => -1); dist[start] = 0;
    const q = [start];
    for (let h = 0; h < q.length; h++) {
      const u = q[h];
      for (const v of adj[u]) {
        if (dist[v] >= 0) continue;
        dist[v] = dist[u] + 1; q.push(v);
      }
    }
    return dist;
  }

  function tryBuild(rng, n) {
    const filled = new Map(); // "x,y" -> room index
    const cells = [];
    const key = (x, y) => x + ',' + y;
    const inb = (x, y) => x >= 0 && y >= 0 && x < GW && y < GH;
    const fcount = (x, y) => { let c = 0; for (const d of DIRS) if (filled.has(key(x + d[0], y + d[1]))) c++; return c; };
    const add = (x, y) => { filled.set(key(x, y), cells.length); cells.push({ x, y }); };
    add(4, 4);
    let guard = 0;
    while (cells.length < n && guard++ < 400) {
      const from = cells[rng.int(0, cells.length - 1)];
      const d = rng.pick(DIRS);
      const nx = from.x + d[0], ny = from.y + d[1];
      if (!inb(nx, ny) || filled.has(key(nx, ny))) continue;
      if (fcount(nx, ny) > 1) continue;
      if (rng.next() < 0.3) continue;
      add(nx, ny);
    }
    if (cells.length < n) return null;
    const edges = [];
    for (let i = 0; i < cells.length; i++) for (let j = i + 1; j < cells.length; j++) {
      if (Math.abs(cells[i].x - cells[j].x) + Math.abs(cells[i].y - cells[j].y) === 1) edges.push([i, j]);
    }
    const adj = cells.map(() => []);
    edges.forEach(([a, b]) => { adj[a].push(b); adj[b].push(a); });
    const dist = bfs(adj, 0);
    const leaves = cells.map((_, i) => i).filter((i) => i !== 0 && adj[i].length === 1);
    if (leaves.length < 2) return null;
    let maxD = 0; cells.forEach((_, i) => { if (dist[i] > maxD) maxD = dist[i]; });
    const bossCands = leaves.filter((i) => dist[i] === maxD && dist[i] >= 2);
    if (!bossCands.length) return null;
    const boss = rng.pick(bossCands);
    const treasCands = leaves.filter((i) => i !== boss && dist[i] >= 3);
    if (!treasCands.length) return null;
    const treasure = rng.pick(treasCands);
    const keyCands = cells.map((_, i) => i).filter((i) => i !== 0 && i !== boss && i !== treasure && adj[i].length > 1);
    if (!keyCands.length) return null;
    const keyRoom = rng.pick(keyCands);
    // secret: empty cell with >=3 filled neighbours, not adjacent to boss/treasure
    const sec = [];
    for (let y = 0; y < GH; y++) for (let x = 0; x < GW; x++) {
      if (filled.has(key(x, y)) || fcount(x, y) < 3) continue;
      let bad = false;
      for (const d of DIRS) {
        const r = filled.get(key(x + d[0], y + d[1]));
        if (r === boss || r === treasure) bad = true;
      }
      if (!bad) sec.push([x, y]);
    }
    if (!sec.length) return null;
    return { cells, edges, boss, treasure, keyRoom, secret: rng.pick(sec), filled, key };
  }

  function dirOf(a, b) {
    for (const d of DIRS) if (a.x + d[0] === b.x && a.y + d[1] === b.y) return d[2];
    return '';
  }

  function generate(seed, opts) {
    const rng = MMRng.create('warren:' + seed);
    let res = null;
    for (let attempt = 0; attempt < 3000 && !res; attempt++) {
      res = tryBuild(rng, rng.int(6, 8)); // 6-8 regular rooms + secret = 7-9
    }
    if (!res) throw new Error('mm-warren: could not build a dungeon for seed ' + seed);
    const { cells, edges, boss, treasure, keyRoom, secret, filled, key } = res;
    const rooms = cells.map((c, i) => ({
      id: i, x: c.x, y: c.y, w: RW, h: RH,
      type: i === 0 ? 'start' : i === boss ? 'boss' : i === treasure ? 'treasure' : i === keyRoom ? 'key' : 'combat',
      doors: [], locked: i === treasure
    }));
    const sid = rooms.length;
    rooms.push({ id: sid, x: secret[0], y: secret[1], w: RW, h: RH, type: 'secret', doors: [], locked: false });
    const doors = [];
    const addDoor = (a, b, locked, cracked) => {
      const id = doors.length;
      doors.push({ id, a, b, dir: dirOf(rooms[a], rooms[b]), locked: !!locked, cracked: !!cracked });
      rooms[a].doors.push(id); rooms[b].doors.push(id);
    };
    edges.forEach(([a, b]) => addDoor(a, b, a === treasure || b === treasure, false));
    for (const d of DIRS) {
      const r = filled.get(key(secret[0] + d[0], secret[1] + d[1]));
      if (r !== undefined) addDoor(sid, r, false, true);
    }
    const layout = opts && opts.layout === 2 ? 2 : 1; // layout version: 1 = original room selection, 2 = tagged pool
    return { seed: String(seed), layout, w: GW, h: GH, rooms, doors, keyRoomId: keyRoom, bossRoomId: boss, secretRoomId: sid };
  }

  // Returns a list of violated invariants (empty = valid).
  function validate(d) {
    const errs = [];
    const rooms = d.rooms || [], doors = d.doors || [];
    if (rooms.length < 7 || rooms.length > 9) errs.push('room count ' + rooms.length + ' not in 7-9');
    const byId = {}, idx = {};
    rooms.forEach((r, i) => { byId[r.id] = r; idx[r.id] = i; });
    const count = (t) => rooms.filter((r) => r.type === t).length;
    if (count('start') !== 1) errs.push('need exactly one start');
    if (count('boss') !== 1) errs.push('need exactly one boss');
    if (count('treasure') !== 1) errs.push('need exactly one treasure');
    if (count('key') !== 1) errs.push('need exactly one key room');
    if (count('secret') > 1) errs.push('more than one secret room');
    const start = rooms.find((r) => r.type === 'start');
    if (!start) return errs;
    const secId = d.secretRoomId;
    const mk = (skip) => {
      const adj = rooms.map(() => []);
      doors.forEach((dr) => {
        if (skip(dr) || idx[dr.a] === undefined || idx[dr.b] === undefined) return;
        adj[idx[dr.a]].push(idx[dr.b]); adj[idx[dr.b]].push(idx[dr.a]);
      });
      return adj;
    };
    const all = bfs(mk(() => false), idx[start.id]);
    rooms.forEach((r, i) => { if (all[i] < 0) errs.push('room ' + r.id + ' unreachable from start'); });
    const noSec = (dr) => dr.cracked || dr.a === secId || dr.b === secId;
    const main = bfs(mk(noSec), idx[start.id]);
    const boss = byId[d.bossRoomId];
    if (!boss || boss.type !== 'boss') errs.push('bossRoomId does not name the boss room');
    else {
      let max = 0; rooms.forEach((r, i) => { if (r.id !== secId && main[i] > max) max = main[i]; });
      if (main[idx[boss.id]] !== max) errs.push('boss is not the farthest room');
      if (main[idx[boss.id]] < 2) errs.push('boss adjacent to start');
    }
    const free = bfs(mk((dr) => dr.locked || noSec(dr)), idx[start.id]);
    const keyR = byId[d.keyRoomId];
    if (!keyR || keyR.type !== 'key') errs.push('keyRoomId does not name the key room');
    else if (free[idx[keyR.id]] < 0) errs.push('key not reachable without the locked door');
    if (doors.filter((x) => x.locked).length !== 1) errs.push('expected exactly one locked door');
    const sr = byId[secId];
    if (sr) {
      if (sr.doors.length < 3) errs.push('secret room has fewer than 3 neighbours');
      if (!sr.doors.every((id) => doors[id] && doors[id].cracked)) errs.push('secret room entrance is not cracked');
    }
    if (rooms.length !== new Set(rooms.map((r) => r.x + ',' + r.y)).size) errs.push('two rooms share a cell');
    return errs;
  }

  return { generate, validate, GW, GH, ROOM_W: RW, ROOM_H: RH };
}));
