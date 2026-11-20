// Room templates (17x13 ASCII) + parser + 4-bit autotiler. UMD: browser global MMRooms, or require().
// Legend: '#' wall, '.' floor, 'D' door slot (edge midpoints only), 'S' enemy spawn point.
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./rng.js'));
  else root.MMRooms = factory(root.MMRng);
}(typeof self !== 'undefined' ? self : this, function (MMRng) {
  const W = 17, H = 13;
  // Door slot centres on each edge midpoint.
  const DOORS = { N: { x: 8, y: 0 }, E: { x: 16, y: 6 }, S: { x: 8, y: 12 }, W: { x: 0, y: 6 } };
  const TEMPLATES = [
    { id: 'open', kind: 'normal', rows: [
      '########D########',
      '#...............#',
      '#..S.........S..#',
      '#...............#',
      '#.S...........S.#',
      '#...............#',
      'D...............D',
      '#...............#',
      '#...............#',
      '#...............#',
      '#..S.........S..#',
      '#...............#',
      '########D########'
    ] },
    { id: 'pillars4', kind: 'normal', rows: [
      '########D########',
      '#...............#',
      '#..S.........S..#',
      '#..##.......##..#',
      '#.S.#.......#.S.#',
      '#...............#',
      'D...............D',
      '#...............#',
      '#...#.......#...#',
      '#..##.......##..#',
      '#..S.........S..#',
      '#...............#',
      '########D########'
    ] },
    { id: 'center-block', kind: 'normal', rows: [
      '########D########',
      '#...............#',
      '#..S.........S..#',
      '#...............#',
      '#.S...........S.#',
      '#......###......#',
      'D......###......D',
      '#......###......#',
      '#...............#',
      '#...............#',
      '#..S.........S..#',
      '#...............#',
      '########D########'
    ] },
    { id: 'corner-nooks', kind: 'normal', rows: [
      '########D########',
      '####.........####',
      '####.........####',
      '#...............#',
      '#.S.....S.....S.#',
      '#...............#',
      'D...............D',
      '#...............#',
      '#.S.....S.....S.#',
      '#...............#',
      '####.........####',
      '####.........####',
      '########D########'
    ] },
    { id: 'cross-pillars', kind: 'normal', rows: [
      '########D########',
      '#...............#',
      '#..S.........S..#',
      '#...............#',
      '#.S..#.....#..S.#',
      '#...............#',
      'D.......#.......D',
      '#...............#',
      '#....#.....#....#',
      '#...............#',
      '#..S.........S..#',
      '#...............#',
      '########D########'
    ] },
    { id: 'hbars', kind: 'normal', rows: [
      '########D########',
      '#...............#',
      '#..S.........S..#',
      '#..####...####..#',
      '#.S...........S.#',
      '#...............#',
      'D...............D',
      '#...............#',
      '#...............#',
      '#..####...####..#',
      '#..S.........S..#',
      '#...............#',
      '########D########'
    ] },
    { id: 'vbars', kind: 'normal', rows: [
      '########D########',
      '#...............#',
      '#..S#.......#S..#',
      '#...#.......#...#',
      '#.S.#.......#.S.#',
      '#...............#',
      'D...............D',
      '#...............#',
      '#...#.......#...#',
      '#...#.......#...#',
      '#..S#.......#S..#',
      '#...............#',
      '########D########'
    ] },
    { id: 'ring', kind: 'normal', rows: [
      '########D########',
      '#...............#',
      '#..S.........S..#',
      '#....###.###....#',
      '#.S..#.....#..S.#',
      '#....#.....#....#',
      'D...............D',
      '#....#.....#....#',
      '#....#.....#....#',
      '#....###.###....#',
      '#..S.........S..#',
      '#...............#',
      '########D########'
    ] },
    { id: 'diagonal', kind: 'normal', rows: [
      '########D########',
      '#...............#',
      '#..#.........S..#',
      '#...#...........#',
      '#.S..#........S.#',
      '#.....#.........#',
      'D...............D',
      '#.....#.........#',
      '#.S..#........S.#',
      '#...#...........#',
      '#..#.........S..#',
      '#...............#',
      '########D########'
    ] },
    { id: 'twin-walls', kind: 'normal', rows: [
      '########D########',
      '#...............#',
      '#..S.#.......S..#',
      '#....#..........#',
      '#.S..#........S.#',
      '#....#..........#',
      'D...............D',
      '#..........#....#',
      '#..........#....#',
      '#..........#....#',
      '#..S.......#.S..#',
      '#...............#',
      '########D########'
    ] },
    { id: 'scatter', kind: 'normal', rows: [
      '########D########',
      '#...............#',
      '#..S..#......S..#',
      '#..#.........#..#',
      '#.S...........S.#',
      '#.......#.......#',
      'D...............D',
      '#...............#',
      '#.......#....#..#',
      '#...#...........#',
      '#..S......#..S..#',
      '#...............#',
      '########D########'
    ] },
    { id: 'hallway', kind: 'normal', rows: [
      '########D########',
      '#...............#',
      '#..#####.#####..#',
      '#..###########..#',
      '#.S.....S.....S.#',
      '#...............#',
      'D...............D',
      '#...............#',
      '#.S.....S.....S.#',
      '#..###########..#',
      '#..#####.#####..#',
      '#...............#',
      '########D########'
    ] },
    { id: 'plus-room', kind: 'normal', rows: [
      '########D########',
      '######.....######',
      '######.....######',
      '######.....######',
      '#.S.....S.....S.#',
      '#...............#',
      'D...............D',
      '#...............#',
      '#.S.....S.....S.#',
      '######.....######',
      '######.....######',
      '######.....######',
      '########D########'
    ] },
    { id: 'dead-end', kind: 'deadEnd', rows: [
      '########D########',
      '########.########',
      '########.########',
      '#################',
      '#.S...#####...S.#',
      '#...............#',
      'D.....S.........D',
      '#...............#',
      '#.S.....S.....S.#',
      '#################',
      '########.########',
      '########.########',
      '########D########'
    ] },
    { id: 'treasure', kind: 'treasure', rows: [
      '########D########',
      '#...............#',
      '#..S.........S..#',
      '#...............#',
      '#.S...#####...S.#',
      '#.....#...#.....#',
      'D.........#.....D',
      '#.....#...#.....#',
      '#.....#####.....#',
      '#...............#',
      '#..S.........S..#',
      '#...............#',
      '########D########'
    ] }

  ];

  // Validate and parse a template ({id, kind, rows}) or a raw string/array of rows.
  // Returns { id, kind, w, h, rows, doors:{N,E,S,W}, spawns:[{x,y}] }. Throws on invalid input.
  function parse(template) {
    const t = (typeof template === 'string' || Array.isArray(template)) ? { id: '?', kind: 'normal', rows: template } : template;
    const rows = typeof t.rows === 'string' ? t.rows.split('\n') : t.rows;
    if (!Array.isArray(rows) || rows.length !== H) throw new Error('template must have ' + H + ' rows');
    const doors = {}, spawns = [];
    const doorAt = {};
    Object.keys(DOORS).forEach((k) => { doorAt[DOORS[k].x + ',' + DOORS[k].y] = k; });
    for (let y = 0; y < H; y++) {
      if (typeof rows[y] !== 'string' || rows[y].length !== W) throw new Error('row ' + y + ' must be ' + W + ' wide');
      for (let x = 0; x < W; x++) {
        const c = rows[y][x];
        if ('#.DS'.indexOf(c) < 0) throw new Error('bad char "' + c + '" at ' + x + ',' + y);
        const edge = x === 0 || y === 0 || x === W - 1 || y === H - 1;
        if (c === 'D') {
          const k = doorAt[x + ',' + y];
          if (!k) throw new Error('door not at an edge midpoint: ' + x + ',' + y);
          doors[k] = { x, y };
        } else if (edge && c !== '#') throw new Error('edge tile must be wall or door at ' + x + ',' + y);
        if (c === 'S') spawns.push({ x, y });
      }
    }
    return { id: t.id, kind: t.kind || 'normal', w: W, h: H, rows: rows.slice(), doors, spawns };
  }

  // 4-bit neighbour mask per wall tile: N=1, E=2, S=4, W=8 (set when that neighbour is a wall;
  // out-of-bounds counts as wall). Non-wall tiles are null. grid: array of strings or arrays.
  function autotile(grid) {
    const h = grid.length, w = h ? grid[0].length : 0;
    const isWall = (x, y) => (x < 0 || y < 0 || x >= w || y >= h) ? true : grid[y][x] === '#';
    const out = [];
    for (let y = 0; y < h; y++) {
      const row = [];
      for (let x = 0; x < w; x++) {
        row.push(grid[y][x] !== '#' ? null :
          (isWall(x, y - 1) ? 1 : 0) | (isWall(x + 1, y) ? 2 : 0) | (isWall(x, y + 1) ? 4 : 0) | (isWall(x - 1, y) ? 8 : 0));
      }
      out.push(row);
    }
    return out;
  }


  // ------------------------------------------------------------------------------------------------
  // Layout version 2 (additive): a bigger hand-authored pool + tagged, ramped, seeded selection.
  // TEMPLATES above is frozen (layout version 1 selection reads only it). New runs carry layout = 2.
  // `kind` here is the room role it serves: normal (combat), key, treasure (also secret), boss, start.
  // `tags` drive the selection: open / arena / ring / split / tight / maze / elite; DIFF maps a tag to 1..5.
  // ------------------------------------------------------------------------------------------------
  const LAYOUT_LATEST = 2;
  const DIFF = { open: 1, arena: 2, ring: 3, split: 3, tight: 4, maze: 5, elite: 5 };
  const NEW_TEMPLATES = [
    { id: 'moat-ring', kind: 'normal', tags: ['ring', 'tight'], rows: [
      '########D########',
      '#S.............S#',
      '#.###.......###.#',
      '#.#...........#.#',
      '#.#.....S.....#.#',
      '#.#...........#.#',
      'D...............D',
      '#.#...........#.#',
      '#.#.....S.....#.#',
      '#.#...........#.#',
      '#.###.......###.#',
      '#S.............S#',
      '########D########'
    ] },
    { id: 'slash', kind: 'normal', tags: ['arena', 'ring'], rows: [
      '########D########',
      '#...............#',
      '#S.#............#',
      '#...#.........S.#',
      '#....#..........#',
      '#.....#.........#',
      'D......#........D',
      '#.......#.......#',
      '#........#......#',
      '#.S.......#.....#',
      '#..........#.S..#',
      '#...............#',
      '########D########'
    ] },
    { id: 'split-pass', kind: 'normal', tags: ['split', 'arena'], rows: [
      '########D########',
      '#S.............S#',
      '#...............#',
      '#..S....#....S..#',
      '#.......#.......#',
      '#.......#.......#',
      'D...............D',
      '#.......#.......#',
      '#.......#.......#',
      '#..S....#....S..#',
      '#...............#',
      '#S.............S#',
      '########D########'
    ] },
    { id: 'rift', kind: 'normal', tags: ['split', 'tight'], rows: [
      '########D########',
      '#...............#',
      '#.S...........S.#',
      '#...............#',
      '#...S.......S...#',
      '#...............#',
      'D..####...####..D',
      '#...............#',
      '#...S.......S...#',
      '#...............#',
      '#.S...........S.#',
      '#...............#',
      '########D########'
    ] },
    { id: 'orchard', kind: 'normal', tags: ['open', 'arena'], rows: [
      '########D########',
      '#...............#',
      '#..S.........S..#',
      '#...............#',
      '#.S.#...#...#.S.#',
      '#...............#',
      'D...............D',
      '#...............#',
      '#.S.#...#...#.S.#',
      '#...............#',
      '#..S.........S..#',
      '#...............#',
      '########D########'
    ] },
    { id: 'clusters', kind: 'normal', tags: ['arena'], rows: [
      '########D########',
      '#...............#',
      '#.S...........S.#',
      '#...##.....##...#',
      '#...##.....##...#',
      '#.......S.......#',
      'D...............D',
      '#.......S.......#',
      '#...##.....##...#',
      '#...##.....##...#',
      '#.S...........S.#',
      '#...............#',
      '########D########'
    ] },
    { id: 'x-mark', kind: 'normal', tags: ['ring', 'arena'], rows: [
      '########D########',
      '#...............#',
      '#S.#.........#.S#',
      '#...#.......#...#',
      '#....#.....#....#',
      '#...............#',
      'D......S.S......D',
      '#...............#',
      '#....#.....#....#',
      '#...#.......#...#',
      '#S.#.........#.S#',
      '#...............#',
      '########D########'
    ] },
    { id: 'chasm-bridge', kind: 'normal', tags: ['split', 'tight'], rows: [
      '########D########',
      '#...............#',
      '#S...##...##...S#',
      '#....##.S.##....#',
      '#....##...##....#',
      '#....##...##....#',
      'D...............D',
      '#....##...##....#',
      '#....##...##....#',
      '#....##.S.##....#',
      '#S...##...##...S#',
      '#...............#',
      '########D########'
    ] },
    { id: 'switchback', kind: 'normal', tags: ['maze', 'tight'], rows: [
      '########D########',
      '#S.............S#',
      '#.######.....S..#',
      '#...............#',
      '#.S...#########.#',
      '#...............#',
      'D...............D',
      '#...............#',
      '#.#########...S.#',
      '#...............#',
      '#.S......######.#',
      '#S.............S#',
      '########D########'
    ] },
    { id: 'keep', kind: 'normal', tags: ['ring', 'tight'], rows: [
      '########D########',
      '#...............#',
      '#.S...........S.#',
      '#....#######....#',
      '#....#.....#....#',
      '#....#..S..#....#',
      'D...............D',
      '#....#..S..#....#',
      '#....#.....#....#',
      '#....#######....#',
      '#.S...........S.#',
      '#...............#',
      '########D########'
    ] },
    { id: 'diamond', kind: 'normal', tags: ['ring', 'arena'], rows: [
      '########D########',
      '#S.............S#',
      '#.S.....S.....S.#',
      '#......#.#......#',
      '#.....#...#.....#',
      '#....#..S..#....#',
      'D...#.......#...D',
      '#....#..S..#....#',
      '#.....#...#.....#',
      '#......#.#......#',
      '#.S.....S.....S.#',
      '#S.............S#',
      '########D########'
    ] },
    { id: 'colonnade', kind: 'normal', tags: ['open', 'arena'], rows: [
      '########D########',
      '#...............#',
      '#.S.....S.....S.#',
      '#...#.#...#.#...#',
      '#...............#',
      '#...#.......#...#',
      'D...............D',
      '#...#.......#...#',
      '#...............#',
      '#...#.#...#.#...#',
      '#.S.....S.....S.#',
      '#...............#',
      '########D########'
    ] },
    { id: 'rotunda', kind: 'normal', tags: ['open'], rows: [
      '########D########',
      '###...........###',
      '##.S.........S.##',
      '#...............#',
      '#.S...........S.#',
      '#...............#',
      'D...............D',
      '#...............#',
      '#.S...........S.#',
      '#...............#',
      '##.S.........S.##',
      '###...........###',
      '########D########'
    ] },
    { id: 'trident', kind: 'normal', tags: ['elite', 'tight'], rows: [
      '########D########',
      '#...............#',
      '#.S...#.S.#...S.#',
      '#.....#...#.....#',
      '#.....#...#.....#',
      '#...............#',
      'D...............D',
      '#...............#',
      '#.....#...#.....#',
      '#.....#...#.....#',
      '#.S...#.S.#...S.#',
      '#...............#',
      '########D########'
    ] },
    { id: 'thicket', kind: 'normal', tags: ['elite', 'maze'], rows: [
      '########D########',
      '#...............#',
      '#.S.#.#...#.#.S.#',
      '#...S.......S...#',
      '#.#.#.#.#.#.#.#.#',
      '#...............#',
      'D...............D',
      '#...............#',
      '#.#.#.#.#.#.#.#.#',
      '#...S.......S...#',
      '#.S.#.#...#.#.S.#',
      '#...............#',
      '########D########'
    ] },
    { id: 'keepers-alcove', kind: 'key', tags: ['arena'], rows: [
      '########D########',
      '#...............#',
      '#.S...........S.#',
      '#...#########...#',
      '#...#.......#...#',
      '#...#.......#...#',
      'D...............D',
      '#...............#',
      '#.S...........S.#',
      '#..S.........S..#',
      '#...............#',
      '#...............#',
      '########D########'
    ] },
    { id: 'hedge-key', kind: 'key', tags: ['arena', 'ring'], rows: [
      '########D########',
      '#...............#',
      '#.S...........S.#',
      '#...###...###...#',
      '#...............#',
      '#...#.......#...#',
      'D...............D',
      '#...#.......#...#',
      '#...............#',
      '#...###...###...#',
      '#.S...........S.#',
      '#...............#',
      '########D########'
    ] },
    { id: 'vault-gate', kind: 'treasure', tags: ['arena'], rows: [
      '########D########',
      '#...............#',
      '#..S.........S..#',
      '#...............#',
      '#.S...#...#...S.#',
      '#.....#...#.....#',
      'D.....#...#.....D',
      '#...............#',
      '#.S...........S.#',
      '#...............#',
      '#..S.........S..#',
      '#...............#',
      '########D########'
    ] },
    { id: 'vault-columns', kind: 'treasure', tags: ['open'], rows: [
      '########D########',
      '#...............#',
      '#..S.........S..#',
      '#...............#',
      '#..#.#.....#.#..#',
      '#...............#',
      'D...............D',
      '#...............#',
      '#..#.#.....#.#..#',
      '#...............#',
      '#..S.........S..#',
      '#...............#',
      '########D########'
    ] },
    { id: 'vault-nook', kind: 'treasure', tags: ['tight'], rows: [
      '########D########',
      '#...............#',
      '#..S.........S..#',
      '#...............#',
      '#.S...##.##.S...#',
      '#.....#...#.....#',
      'D.....#...#.....D',
      '#.....#...#.....#',
      '#.....#####.....#',
      '#...............#',
      '#..S.........S..#',
      '#...............#',
      '########D########'
    ] },
    { id: 'den-pillars', kind: 'boss', tags: ['arena'], rows: [
      '########D########',
      '#...............#',
      '#..S.........S..#',
      '#...............#',
      '#..##.......##..#',
      '#...............#',
      'D...............D',
      '#...............#',
      '#..##.......##..#',
      '#...............#',
      '#..S.........S..#',
      '#...............#',
      '########D########'
    ] },
    { id: 'den-ring', kind: 'boss', tags: ['ring'], rows: [
      '########D########',
      '#...............#',
      '#..S.........S..#',
      '#...............#',
      '#....#.....#....#',
      '#...............#',
      'D..#.........#..D',
      '#...............#',
      '#....#.....#....#',
      '#...............#',
      '#..S.........S..#',
      '#...............#',
      '########D########'
    ] },
    { id: 'den-braziers', kind: 'boss', tags: ['open'], rows: [
      '########D########',
      '#...............#',
      '#.##.........##.#',
      '#.##.........##.#',
      '#.S...........S.#',
      '#...............#',
      'D...............D',
      '#...............#',
      '#.S...........S.#',
      '#.##.........##.#',
      '#.##.........##.#',
      '#...............#',
      '########D########'
    ] },
    { id: 'hearth', kind: 'start', tags: ['open'], rows: [
      '########D########',
      '#...............#',
      '#.S.#.......#.S.#',
      '#...............#',
      '#...............#',
      '#.......S.......#',
      'D...............D',
      '#...............#',
      '#...............#',
      '#...............#',
      '#.S.#.......#.S.#',
      '#...............#',
      '########D########'
    ] },
    { id: 'garden-start', kind: 'start', tags: ['arena'], rows: [
      '########D########',
      '#...............#',
      '#..S.........S..#',
      '#..##.......##..#',
      '#..#.........#..#',
      '#...............#',
      'D...............D',
      '#...............#',
      '#..#.........#..#',
      '#..##.......##..#',
      '#..S.........S..#',
      '#...............#',
      '########D########'
    ] }
  ];

  // Tags for the frozen layout-1 normals when they are re-used by the layout-2 pool.
  const OLD_TAGS = {
    open: ['open'], pillars4: ['arena'], 'center-block': ['open', 'arena'], 'corner-nooks': ['arena'],
    'cross-pillars': ['open'], hbars: ['split', 'tight'], vbars: ['split', 'tight'], ring: ['ring', 'tight'],
    diagonal: ['arena', 'ring'], 'twin-walls': ['arena'], scatter: ['open', 'arena'], hallway: ['tight', 'maze'],
    'plus-room': ['tight', 'maze']
  };

  const flipH = (rows) => rows.map((r) => r.split('').reverse().join(''));
  const flipV = (rows) => rows.slice().reverse();
  // Door cells sit on edge midpoints, so mirroring keeps every door where the validator wants it.
  function mirrors(t, allowV) {
    const out = [];
    const seen = new Set([t.rows.join('|')]);
    const add = (suffix, rows) => { const k = rows.join('|'); if (seen.has(k)) return; seen.add(k); out.push({ id: t.id + '~' + suffix, kind: t.kind, tags: t.tags, rows, base: t.id }); };
    add('h', flipH(t.rows));
    if (allowV) { add('v', flipV(t.rows)); add('hv', flipV(flipH(t.rows))); }
    return out;
  }

  // Structural check beyond parse(): returns a list of problems (empty = valid).
  function validateTemplate(t) {
    const errs = [];
    let p;
    try { p = parse(t); } catch (e) { return [e.message]; }
    ['N', 'E', 'S', 'W'].forEach((k) => { if (!p.doors[k]) errs.push('missing door ' + k); });
    if (errs.length) return errs;
    const open = (x, y) => x >= 0 && y >= 0 && x < W && y < H && p.rows[y][x] !== '#';
    const seen = new Set(); const q = [];
    const push = (x, y) => { const k = x + ',' + y; if (!open(x, y) || seen.has(k)) return; seen.add(k); q.push([x, y]); };
    push(DOORS.N.x, DOORS.N.y);
    for (let i = 0; i < q.length; i++) { const [x, y] = q[i]; push(x + 1, y); push(x - 1, y); push(x, y + 1); push(x, y - 1); }
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (open(x, y) && !seen.has(x + ',' + y)) errs.push('unreachable open tile ' + x + ',' + y);
    Object.keys(DOORS).forEach((k) => {
      const d = DOORS[k]; const dx = d.x === 0 ? 1 : d.x === W - 1 ? -1 : 0; const dy = d.y === 0 ? 1 : d.y === H - 1 ? -1 : 0;
      if (!open(d.x + dx, d.y + dy) || !open(d.x + 2 * dx, d.y + 2 * dy)) errs.push('door ' + k + ' entry blocked');
    });
    if (p.kind !== 'normal' && !open(8, 6)) errs.push('centre tile blocked');
    if (p.spawns.length < 3) errs.push('fewer than 3 spawns');
    if (p.kind === 'boss' && !(open(8, 3) && open(8, 4) && open(7, 3) && open(9, 3))) errs.push('boss spawn area blocked');
    return errs;
  }

  // Full v2 pool: new templates + (for normals/treasure) the frozen ones, each with mirrored variants.
  const V2 = [];
  (function buildPool() {
    const base = [];
    TEMPLATES.filter((t) => t.kind === 'normal').forEach((t) => base.push({ id: t.id, kind: 'normal', tags: OLD_TAGS[t.id] || ['arena'], rows: t.rows, base: t.id }));
    TEMPLATES.filter((t) => t.kind === 'treasure').forEach((t) => base.push({ id: t.id, kind: 'treasure', tags: ['arena'], rows: t.rows, base: t.id }));
    NEW_TEMPLATES.forEach((t) => base.push({ id: t.id, kind: t.kind, tags: t.tags, rows: t.rows, base: t.id }));
    base.forEach((t) => {
      V2.push(t);
      mirrors(t, t.kind !== 'boss').forEach((m) => V2.push(m));
    });
  }());
  const diffOf = (t) => Math.max.apply(null, t.tags.map((g) => DIFF[g] || 2));
  const pool = (kind) => V2.filter((t) => t.kind === kind);
  function getAny(id) { return get(id) || V2.find((t) => t.id === id) || null; }
  const BIOME_BIAS = { warren: {}, bramble: { tight: 1.3, maze: 1.2 }, meadow: { open: 1.4, arena: 1.2 }, crypt: { ring: 1.3, split: 1.2 } };

  // Layout-2 selection. graph = MMWarren output. Returns { layout, ids:{roomId:tplId}, defs:{roomId:def} }.
  // Rules: seeded (MMRng only); a room never shares a base template with a neighbour or with the room processed
  // just before it; at most 2 rooms per base template and 1 per exact variant per floor; templates drift from
  // open (diff 1) toward tight/maze/elite as depth from the start grows; biome nudges tag weights.
  function selectRooms(graph, seed, layout, biome) {
    seed = String(seed); biome = BIOME_BIAS[biome] ? biome : 'warren';
    const rooms = graph.rooms;
    const nbr = {}; rooms.forEach((r) => { nbr[r.id] = []; });
    graph.doors.forEach((d) => { nbr[d.a].push(d.b); nbr[d.b].push(d.a); });
    const start = rooms.find((r) => r.type === 'start');
    const depth = {}; depth[start.id] = 0; const bq = [start.id];
    for (let i = 0; i < bq.length; i++) graph.doors.forEach((d) => {
      if (d.cracked) return;
      const u = bq[i];
      const v = d.a === u ? d.b : d.b === u ? d.a : null;
      if (v !== null && depth[v] === undefined) { depth[v] = depth[u] + 1; bq.push(v); }
    });
    let maxD = 1; rooms.forEach((r) => { if (depth[r.id] > maxD) maxD = depth[r.id]; });
    const dOf = (r) => (depth[r.id] === undefined ? maxD : depth[r.id]);
    const order = rooms.slice().sort((a, b) => (dOf(a) - dOf(b)) || (a.id - b.id));
    const chosen = {}; const baseUse = {}; const variantUse = {}; let prevBase = null;
    const bias = BIOME_BIAS[biome];
    order.forEach((r) => {
      const kinds = r.type === 'treasure' || r.type === 'secret' ? ['treasure'] : r.type === 'boss' ? ['boss'] : r.type === 'start' ? ['start'] : r.type === 'key' ? ['key', 'normal'] : ['normal'];
      const all = [].concat.apply([], kinds.map(pool));
      const nb = new Set(nbr[r.id].map((n) => chosen[n] && chosen[n].base).filter(Boolean));
      const frac = Math.min(1, dOf(r) / maxD);
      const target = 1 + 3.4 * frac;
      const strict = all.filter((t) => !nb.has(t.base) && t.base !== prevBase && (baseUse[t.base] || 0) < 2 && !variantUse[t.id]);
      const loose = all.filter((t) => !nb.has(t.base) && !variantUse[t.id]);
      const list = strict.length ? strict : loose.length ? loose : all;
      const ws = list.map((t) => {
        let w = Math.exp(-Math.pow(diffOf(t) - target, 2) / (2 * 1.1 * 1.1));
        if (t.tags.indexOf('elite') >= 0) w *= frac < 0.5 ? 0.05 : 2.2;
        if (t.kind === 'key') w *= 2;
        t.tags.forEach((g) => { if (bias[g]) w *= bias[g]; });
        return w;
      });
      const total = ws.reduce((a, b) => a + b, 0);
      let x = MMRng.create('tpl2:' + seed + ':' + biome + ':' + r.id).next() * total; let pick = list[list.length - 1];
      for (let i = 0; i < list.length; i++) { x -= ws[i]; if (x < 0) { pick = list[i]; break; } }
      chosen[r.id] = pick; baseUse[pick.base] = (baseUse[pick.base] || 0) + 1; variantUse[pick.id] = 1; prevBase = pick.base;
    });
    const ids = {}; const defs = {};
    rooms.forEach((r) => { const c = chosen[r.id]; ids[r.id] = c.id; defs[r.id] = { id: c.id, kind: c.kind, rows: c.rows }; });
    return { layout: layout || LAYOUT_LATEST, ids, defs };
  }

  // Layout 1 = the original selection, byte-for-byte (kept so old seeds replay identically).
  function selectRoomsV1(graph, seed) {
    seed = String(seed); const ids = {}; const defs = {};
    graph.rooms.forEach((r) => {
      let def;
      if (r.type === 'treasure' || r.type === 'secret') def = get('treasure');
      else if (r.type === 'boss' || r.type === 'start') def = get('open');
      else { const list = byKind('normal'); def = list[MMRng.create('tpl:' + seed + ':' + r.id).int(0, list.length - 1)]; }
      ids[r.id] = def.id; defs[r.id] = def;
    });
    return { layout: 1, ids, defs };
  }
  function select(graph, seed, layout, biome) { return layout === 2 ? selectRooms(graph, seed, 2, biome) : selectRoomsV1(graph, seed); }


  function byKind(kind) { return TEMPLATES.filter((t) => t.kind === kind); }
  function get(id) { return TEMPLATES.find((t) => t.id === id) || null; }

  return { W, H, DOORS, TEMPLATES, NEW_TEMPLATES, POOL_V2: V2, LAYOUT_LATEST, DIFF, parse, autotile, byKind, get, getAny, validateTemplate, mirrors, select, selectRooms, selectRoomsV1 };
}));
