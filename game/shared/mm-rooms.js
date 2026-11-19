// Room templates (17x13 ASCII) + parser + 4-bit autotiler. UMD: browser global MMRooms, or require().
// Legend: '#' wall, '.' floor, 'D' door slot (edge midpoints only), 'S' enemy spawn point.
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.MMRooms = factory();
}(typeof self !== 'undefined' ? self : this, function () {
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

  function byKind(kind) { return TEMPLATES.filter((t) => t.kind === kind); }
  function get(id) { return TEMPLATES.find((t) => t.id === id) || null; }

  return { W, H, DOORS, TEMPLATES, parse, autotile, byKind, get };
}));
