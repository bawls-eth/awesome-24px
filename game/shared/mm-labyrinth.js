// Mad Maze labyrinth generator + Hedge Tide. UMD: browser global MMLabyrinth, or require().
// 12x12 cells, 4 tiles per cell (3 floor + 1 wall) -> 49x49 tiles. Tile value 1 = wall, 0 = floor.
// Pure and deterministic per seed (uses MMRng). See design/REALM-DESIGN.md section 10.4.
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./rng.js'));
  else root.MMLabyrinth = factory(root.MMRng);
}(typeof self !== 'undefined' ? self : this, function (MMRng) {
  const DIRS = [[0, -1], [1, 0], [0, 1], [-1, 0]]; // N E S W
  const CELL = 4;

  // Braid fraction per design: 0.25 + 0.05 * tier.
  function braidFor(tier) { return 0.25 + 0.05 * tier; }

  function bfs(tiles, N, sx, sy) {
    const dist = new Int32Array(N * N).fill(-1);
    const q = new Int32Array(N * N);
    let h = 0, t = 0;
    dist[sy * N + sx] = 0; q[t++] = sy * N + sx;
    while (h < t) {
      const p = q[h++], x = p % N, y = (p / N) | 0;
      for (let d = 0; d < 4; d++) {
        const nx = x + DIRS[d][0], ny = y + DIRS[d][1];
        if (nx < 0 || ny < 0 || nx >= N || ny >= N) continue;
        const np = ny * N + nx;
        if (tiles[np] || dist[np] >= 0) continue;
        dist[np] = dist[p] + 1; q[t++] = np;
      }
    }
    return dist;
  }

  function chamberDistance(ch, dist, N) {
    let m = Infinity;
    for (let y = ch.y0; y <= ch.y1; y++) for (let x = ch.x0; x <= ch.x1; x++) {
      const d = dist[y * N + x];
      if (d >= 0 && d < m) m = d;
    }
    return m;
  }

  function build(seed, cells, tier, braid, nChambers) {
    const rng = MMRng.create('labyrinth:' + seed + ':' + cells + ':' + tier);
    const N = cells * CELL + 1;
    const tiles = new Uint8Array(N * N).fill(1);
    const open = new Uint8Array(cells * cells); // bit i = passage toward DIRS[i]
    const ci = (x, y) => y * cells + x;
    const inb = (x, y) => x >= 0 && y >= 0 && x < cells && y < cells;
    const degree = (c) => { let n = 0; for (let i = 0; i < 4; i++) if (open[c] >> i & 1) n++; return n; };
    const carveCell = (x, y) => {
      for (let j = 0; j < 3; j++) for (let i = 0; i < 3; i++) tiles[(y * CELL + 1 + j) * N + x * CELL + 1 + i] = 0;
    };
    const link = (x, y, d) => {
      const nx = x + DIRS[d][0], ny = y + DIRS[d][1];
      open[ci(x, y)] |= 1 << d; open[ci(nx, ny)] |= 1 << ((d + 2) % 4);
      const bx = d === 1 ? x * CELL + 4 : d === 3 ? x * CELL : x * CELL + 1;
      const by = d === 2 ? y * CELL + 4 : d === 0 ? y * CELL : y * CELL + 1;
      for (let k = 0; k < 3; k++) {
        if (d === 1 || d === 3) tiles[(by + k) * N + bx] = 0; else tiles[by * N + bx + k] = 0;
      }
    };

    for (let y = 0; y < cells; y++) for (let x = 0; x < cells; x++) carveCell(x, y);

    // Recursive backtracker (iterative stack, shuffled neighbour order).
    const seen = new Uint8Array(cells * cells);
    const stack = [[0, 0]]; seen[0] = 1;
    while (stack.length) {
      const [x, y] = stack[stack.length - 1];
      const opts = rng.shuffle([0, 1, 2, 3]).filter((d) => inb(x + DIRS[d][0], y + DIRS[d][1]) && !seen[ci(x + DIRS[d][0], y + DIRS[d][1])]);
      if (!opts.length) { stack.pop(); continue; }
      const d = opts[0];
      link(x, y, d);
      seen[ci(x + DIRS[d][0], y + DIRS[d][1])] = 1;
      stack.push([x + DIRS[d][0], y + DIRS[d][1]]);
    }

    // Braid: open a share of dead ends, knocking the wall toward the neighbour with the most walls.
    const dead = [];
    for (let y = 0; y < cells; y++) for (let x = 0; x < cells; x++) if (degree(ci(x, y)) === 1) dead.push([x, y]);
    const target = Math.round(braid * dead.length);
    let braided = 0;
    for (const [x, y] of rng.shuffle(dead)) {
      if (braided >= target) break;
      if (degree(ci(x, y)) !== 1) continue;
      let best = -1, bestDeg = 5;
      for (let d = 0; d < 4; d++) {
        const nx = x + DIRS[d][0], ny = y + DIRS[d][1];
        if (!inb(nx, ny) || (open[ci(x, y)] >> d & 1)) continue;
        const dg = degree(ci(nx, ny));
        if (dg < bestDeg) { bestDeg = dg; best = d; }
      }
      if (best < 0) continue;
      link(x, y, best); braided++;
    }

    // Chambers: cell rectangles, fully opened.
    const used = new Uint8Array(cells * cells);
    const chambers = [];
    const fits = (x, y, w, h) => {
      if (x < 0 || y < 0 || x + w > cells || y + h > cells) return false;
      for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) if (used[ci(x + i, y + j)]) return false;
      return true;
    };
    const punch = (kind, x, y, w, h) => {
      for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) used[ci(x + i, y + j)] = 1;
      for (let ty = y * CELL + 1; ty < (y + h) * CELL; ty++) for (let tx = x * CELL + 1; tx < (x + w) * CELL; tx++) tiles[ty * N + tx] = 0;
      const c = { kind, cx: x, cy: y, cw: w, ch: h, x0: x * CELL + 1, y0: y * CELL + 1, x1: (x + w) * CELL - 1, y1: (y + h) * CELL - 1 };
      c.center = { x: (c.x0 + c.x1) >> 1, y: (c.y0 + c.y1) >> 1 };
      chambers.push(c);
      return c;
    };
    const start = punch('start', 0, 0, 2, 2);
    for (let n = 0, tries = 0; n < nChambers && tries < 200; tries++) {
      const long = rng.int(2, 3);
      const [cw, chh] = rng.next() < 0.5 ? [long, 2] : [2, long];
      const x = rng.int(0, cells - cw), y = rng.int(0, cells - chh);
      if (fits(x, y, cw, chh)) { punch('room', x, y, cw, chh); n++; }
    }

    const startTile = { x: start.center.x, y: start.center.y };
    const dist = bfs(tiles, N, startTile.x, startTile.y);

    // Boss: 2x2 chamber around the farthest still-free cell.
    const order = [];
    for (let y = 0; y < cells; y++) for (let x = 0; x < cells; x++) {
      if (!used[ci(x, y)]) order.push({ x, y, d: dist[(y * CELL + 2) * N + x * CELL + 2] });
    }
    order.sort((a, b) => b.d - a.d || a.y - b.y || a.x - b.x);
    let boss = null;
    for (const c of order) {
      for (const [ox, oy] of [[0, 0], [-1, 0], [0, -1], [-1, -1]]) {
        if (fits(c.x + ox, c.y + oy, 2, 2)) { boss = punch('boss', c.x + ox, c.y + oy, 2, 2); break; }
      }
      if (boss) break;
    }

    const dist2 = bfs(tiles, N, startTile.x, startTile.y);
    for (const c of chambers) c.distance = chamberDistance(c, dist2, N);
    const maxD = Math.max.apply(null, chambers.map((c) => c.distance));
    return {
      seed, cells, tier, braid, N, tiles, chambers, start, boss, startTile, dist: dist2,
      deadEnds: dead.length, braided, braidShare: dead.length ? braided / dead.length : 0,
      maxChamberDistance: maxD, bossIsFarthest: !!boss && boss.distance >= maxD,
    };
  }

  // opts: { cells: 12, tier: 3, braid: fraction (default 0.25 + 0.05 * tier) }
  function generate(seed, opts) {
    opts = opts || {};
    const cells = opts.cells || 12, tier = opts.tier === undefined ? 3 : opts.tier;
    const braid = opts.braid === undefined ? braidFor(tier) : opts.braid;
    let m = null;
    // If a random chamber out-distances the boss chamber, retry with fewer chambers (still deterministic).
    for (let n = 2 + tier; n >= 0; n--) {
      m = build(seed, cells, tier, braid, n);
      if (m.bossIsFarthest) break;
    }
    m.rows = function () {
      const out = [];
      for (let y = 0; y < m.N; y++) {
        let s = '';
        for (let x = 0; x < m.N; x++) s += m.tiles[y * m.N + x] ? '#' : '.';
        out.push(s);
      }
      return out;
    };
    m.validate = function () { return validate(m); };
    return m;
  }

  function validate(m) {
    const errors = [];
    const N = m.N, tiles = m.tiles;
    if (N !== m.cells * CELL + 1 || tiles.length !== N * N) errors.push('bad size');
    for (let i = 0; i < N; i++) {
      if (!tiles[i] || !tiles[(N - 1) * N + i] || !tiles[i * N] || !tiles[i * N + N - 1]) { errors.push('border not wall'); break; }
    }
    const dist = bfs(tiles, N, m.startTile.x, m.startTile.y);
    let floor = 0, reach = 0;
    for (let i = 0; i < N * N; i++) if (!tiles[i]) { floor++; if (dist[i] >= 0) reach++; }
    if (floor !== reach) errors.push('unreachable floor tiles: ' + (floor - reach));
    if (!m.boss) errors.push('no boss chamber');
    else {
      const maxD = Math.max.apply(null, m.chambers.map((c) => chamberDistance(c, dist, N)));
      if (chamberDistance(m.boss, dist, N) < maxD) errors.push('boss is not the farthest chamber');
    }
    return { ok: errors.length === 0, errors, floor, reach };
  }

  // Hedge Tide: pure state machine. front() = tiles advanced; covers(d) = tide has reached path distance d.
  const tide = {
    create(o) {
      o = o || {};
      const startAt = o.startAt === undefined ? 90 : o.startAt;
      const speed = o.speed === undefined ? 0.6 : o.speed;
      const picnic = !!o.picnic;
      let elapsed = 0;
      return {
        picnic, startAt, speed,
        tick(dt) { if (!picnic && dt > 0) elapsed += dt; },
        elapsed() { return elapsed; },
        started() { return !picnic && elapsed >= startAt; },
        front() { return picnic ? 0 : Math.max(0, (elapsed - startAt) * speed); },
        covers(d) { const f = this.front(); return f > 0 && d >= 0 && d <= f; },
      };
    },
  };

  return { generate, validate, tide, braidFor, CELL };
}));
