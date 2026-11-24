// Mad Maze Warren dungeon run (Day 2). A controller that plugs into RealmArena through its additive hooks
// (arena.dungeon / arena.fixedWorld): MMWarren builds the room graph, MMRooms the rooms, MMEnemies plans the
// encounters, MMDungeonState owns doors / keys / chests / secret / boss. Procedural art only, no network.
// Needs: MMRng, MMWarren, MMRooms, MMEnemies, MMDungeonState, MMPatterns2 and realm.js (RM_* globals).
(function () {
  'use strict';
  // Tiered gear drops (GEAR-DROPS-BUILD-PLAN slice G10). ON by default since the save-tolerance slice (G7) shipped (PR #32).
  // ?gear=1 forces it on, ?gear=0 is the kill switch and always wins.
  const GEAR_DEFAULT_ON = true;
  const gearWanted = () => { let v = null; try { v = typeof rmFlag === 'function' ? rmFlag('gear') : new URLSearchParams(window.location.search).get('gear'); } catch (e) { /* no location */ } return v === '1' ? true : v === '0' ? false : GEAR_DEFAULT_ON; }; // rmFlag (realm.js): the one ?gear= parser, review F15
  // The gear modules are not in the page's script list yet (the index.html tags belong to the save-tolerance slice): load them here, in order, only when gear is on.
  // mm-backup.js rides along for the one-time pre-gear snapshot (MMBackup.snapshotPregear) before the first tiered item reaches a gear-less save.
  try {
    const cs = document.currentScript;
    if (cs && cs.src && gearWanted() && document.readyState === 'loading') {
      const base = cs.src.replace(/games\/mad-maze\/dungeon\.js.*$/, 'shared/');
      ['mm-gear.js', 'mm-gear-drops.js', 'mm-backup.js'].forEach((f) => { if (!document.querySelector('script[src$="shared/' + f + '"]')) document.write('<script src="' + base + f + '"><\/script>'); });
    }
  } catch (e) { /* gear stays off */ }
  const T = 40; // RM_TILE
  const OPP = { N: 'S', S: 'N', E: 'W', W: 'E' };
  const DV = { N: [0, -1], E: [1, 0], S: [0, 1], W: [-1, 0] };
  // Bramble enemies reuse the arena's three attack patterns (spiral / aimed / ring).
  const ENEMY_MAP = { puffcap: 'ring', beetle: 'aimed', archer: 'aimed', moth: 'spiral', sprout: 'ring' };
  const TIGHT_MAX_SHOOTERS = 3; // narrow `tight` rooms: simultaneous shooters cap (bullets must stay dodgeable)
  const HP_DIV = 8; // MMEnemies hp is for a 1 dmg/hit-per-10 game; the arena's bolts are 1 dmg
  const SLOT_ITEMS = { weapon: ['sparkwand', 'quickwand'], armor: ['heartcharm', 'swiftcharm'], trinket: ['heartcharm', 'swiftcharm'], ring: ['luckring', 'scholarring', 'wardring'] };
  const PAL = {
    start: { f: ['#2a1f4d', '#30245a'], w: '#3a2c66', hi: '#a98bff', name: 'Warren Gate' },
    combat: { f: ['#261a46', '#2c2052'], w: '#35275c', hi: '#a98bff', name: 'Bramble Hall' },
    key: { f: ['#1d3a3a', '#224444'], w: '#1f4448', hi: '#4fd1b5', name: 'Keeper\'s Nook' },
    treasure: { f: ['#4a3a1a', '#54421e'], w: '#4d3b1c', hi: '#ffd45a', name: 'Treasure Vault' },
    secret: { f: ['#1a3350', '#1f3b5c'], w: '#1d3a5c', hi: '#7fd0ff', name: 'Secret Burrow' },
    boss: { f: ['#4a1a1a', '#541f1f'], w: '#4f1e1e', hi: '#ff6a4a', name: 'Queen\'s Den' },
  };
  const MAP_COL = { start: '#8a63e0', combat: '#6b5aa8', key: '#4fd1b5', treasure: '#ffd45a', secret: '#7fd0ff', boss: '#ff6a4a' };

  const mk = (w, h, fn) => { const c = document.createElement('canvas'); c.width = w; c.height = h; const g = c.getContext('2d'); g.imageSmoothingEnabled = false; fn(g, w, h); return c; };
  const rect = (g, col, x, y, w, h) => { g.fillStyle = col; g.fillRect(x, y, w, h); };
  const hexA = (hex, a) => { const n = parseInt(String(hex).slice(1), 16); return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`; };

  function bakeShared() {
    const wallBase = (g) => { rect(g, '#2a1d44', 0, 0, T, T); rect(g, '#3a2a5e', 0, 0, T, 3); for (let y = 8; y < T; y += 8) rect(g, '#1b1430', 0, y, T, 1); };
    const doorSealed = mk(T, T, (g) => {
      wallBase(g); rect(g, '#120a22', 4, 4, 32, 32);
      for (let i = 0; i < 3; i++) { rect(g, '#7a1d2e', 8 + i * 10, 4, 4, 32); rect(g, '#d94b63', 8 + i * 10, 4, 1, 32); }
      rect(g, '#7a1d2e', 4, 18, 32, 4); rect(g, '#ff7a90', 4, 18, 32, 1);
      for (let i = 0; i < 3; i++) { rect(g, '#ff7a90', 6 + i * 10, 2, 2, 3); rect(g, '#ff7a90', 10 + i * 10, 35, 2, 3); } // thorn tips
    });
    const doorLocked = mk(T, T, (g) => {
      wallBase(g); rect(g, '#5a3a1c', 4, 4, 32, 32); rect(g, '#7a5128', 6, 6, 28, 28); rect(g, '#3c2410', 19, 6, 2, 28);
      rect(g, '#3c2410', 4, 12, 32, 2); rect(g, '#3c2410', 4, 26, 32, 2);
      rect(g, '#c99a1a', 14, 17, 12, 10); rect(g, '#ffd45a', 14, 17, 12, 2); rect(g, '#1b1430', 19, 20, 2, 4);
      rect(g, '#c99a1a', 16, 11, 2, 7); rect(g, '#c99a1a', 22, 11, 2, 7); rect(g, '#c99a1a', 16, 10, 8, 2);
    });
    const crack = (n) => mk(T, T, (g) => {
      wallBase(g); rect(g, '#4a3770', 2, 2, 36, 36);
      const lines = [[20, 6, 18, 14], [18, 14, 22, 20], [22, 20, 17, 28], [17, 28, 20, 35], [22, 20, 30, 24], [30, 24, 33, 31], [18, 14, 10, 17], [10, 17, 6, 24]];
      lines.slice(0, 3 + n * 2).forEach(([x1, y1, x2, y2]) => { g.strokeStyle = n >= 2 ? '#e8d8ff' : '#120a22'; g.lineWidth = 2; g.beginPath(); g.moveTo(x1, y1); g.lineTo(x2, y2); g.stroke(); });
      if (n >= 1) for (let i = 0; i < n * 3; i++) rect(g, '#120a22', 6 + ((i * 11) % 28), 8 + ((i * 7) % 24), 3, 3);
    });
    const chest = (open) => mk(32, 28, (g) => {
      rect(g, '#000', 4, 24, 24, 3); // shadow
      rect(g, '#6b4220', 3, 12, 26, 12); rect(g, '#8a5a2c', 3, 12, 26, 3); rect(g, '#c99a1a', 3, 17, 26, 3); rect(g, '#ffd45a', 14, 15, 4, 7);
      if (open) { rect(g, '#6b4220', 3, 3, 26, 8); rect(g, '#3c2410', 5, 5, 22, 5); rect(g, '#ffe27a', 8, 11, 16, 2); rect(g, 'rgba(255,226,122,0.5)', 6, 6, 20, 5); } else { rect(g, '#8a5a2c', 3, 4, 26, 9); rect(g, '#a8733a', 3, 4, 26, 2); rect(g, '#c99a1a', 3, 8, 26, 2); rect(g, '#ffd45a', 14, 11, 4, 4); }
    });
    const key = mk(22, 22, (g) => { rect(g, '#c99a1a', 3, 3, 9, 9); rect(g, '#1b1430', 6, 6, 3, 3); rect(g, '#ffd45a', 3, 3, 9, 2); rect(g, '#c99a1a', 10, 10, 3, 9); rect(g, '#c99a1a', 13, 14, 4, 2); rect(g, '#c99a1a', 13, 17, 3, 2); rect(g, '#ffd45a', 10, 10, 1, 9); });
    const portal = mk(72, 72, (g) => {
      const gr = g.createRadialGradient(36, 36, 4, 36, 36, 34);
      gr.addColorStop(0, 'rgba(255,255,255,0.95)'); gr.addColorStop(0.35, 'rgba(143,233,255,0.8)'); gr.addColorStop(0.7, 'rgba(138,99,224,0.55)'); gr.addColorStop(1, 'rgba(138,99,224,0)');
      g.fillStyle = gr; g.beginPath(); g.arc(36, 36, 34, 0, Math.PI * 2); g.fill();
      g.strokeStyle = 'rgba(255,255,255,0.7)'; g.lineWidth = 2;
      for (let i = 0; i < 3; i++) { g.beginPath(); g.arc(36, 36, 12 + i * 8, i, i + 3.2); g.stroke(); }
    });
    return { doorSealed, doorLocked, crack: [crack(0), crack(1), crack(2)], chest: [chest(false), chest(true)], key, portal };
  }

  function bakeRoom(rid, tpl, pal, seed) {
    const grid = tpl.rows.map((r) => r.replace(/D/g, '#').replace(/S/g, '.'));
    const masks = MMRooms.autotile(grid);
    const rng = MMRng.create('bake:' + seed + ':' + rid);
    return mk(T * tpl.w, T * tpl.h, (g) => {
      for (let y = 0; y < tpl.h; y++) for (let x = 0; x < tpl.w; x++) {
        const px = x * T; const py = y * T;
        if (grid[y][x] !== '#') {
          rect(g, pal.f[(x + y) & 1], px, py, T, T);
          rect(g, 'rgba(255,255,255,0.04)', px, py, T, 1); rect(g, 'rgba(0,0,0,0.12)', px, py + T - 1, T, 1);
          const n = rng.int(0, 3);
          for (let i = 0; i < n; i++) rect(g, rng.next() < 0.5 ? 'rgba(255,255,255,0.07)' : 'rgba(0,0,0,0.16)', px + rng.int(2, 34), py + rng.int(2, 34), rng.int(2, 4), 2);
          continue;
        }
        const m = masks[y][x];
        rect(g, pal.w, px, py, T, T);
        if (!(m & 4)) { // wall face visible below: lit brick band
          rect(g, 'rgba(255,255,255,0.10)', px, py + 20, T, 20);
          for (let by = 24; by < T; by += 8) rect(g, 'rgba(0,0,0,0.35)', px, py + by, T, 1);
          for (let by = 20, r = 0; by < T; by += 8, r++) for (let bx = (r & 1) * 10; bx < T; bx += 20) rect(g, 'rgba(0,0,0,0.3)', px + bx, py + by, 1, 8);
          rect(g, 'rgba(0,0,0,0.4)', px, py + T - 3, T, 3);
        }
        if (!(m & 1)) rect(g, pal.hi, px, py, T, 2);
        if (!(m & 8)) rect(g, pal.hi, px, py, 2, T);
        if (!(m & 2)) rect(g, 'rgba(0,0,0,0.5)', px + T - 2, py, 2, T);
      }
    });
  }

  // ---- b25 dungeon tile art: floors / walls baked into the same cached room canvas (visual only, collision untouched) ----
  const DOOR_TILES = [[8, 0], [16, 6], [8, 12], [0, 6]]; // N E S W door tiles (MMRooms.DOORS), kept local so excl never depends on a door existing
  // G-25: deepest dungeon floor cleared per biome on this device ({ v:1, f:{ <biome>: 0..3 } }); hostile / missing storage = 0
  const DEEP_KEY = 'pixeltown-deep-v1';
  function deepRead() { try { const o = JSON.parse(localStorage.getItem(DEEP_KEY) || 'null'); return o && typeof o === 'object' && !Array.isArray(o) && o.f && typeof o.f === 'object' && !Array.isArray(o.f) ? o : { v: 1, f: {} }; } catch (e) { return { v: 1, f: {} }; } }
  function deepCleared(biome) { const v = deepRead().f[biome]; return typeof v === 'number' && Number.isInteger(v) && v >= 0 && v <= 3 ? v : 0; }
  function deepMark(biome, n) { if (!(n >= 1 && n <= 3) || deepCleared(biome) >= n) return; const o = deepRead(); const f = {}; Object.keys(o.f).forEach((k) => { if (/^[a-z]{2,12}$/.test(k)) f[k] = o.f[k]; }); f[biome] = n; try { localStorage.setItem(DEEP_KEY, JSON.stringify({ v: 1, f })); } catch (e) { /* storage blocked: the gate stays where it was */ } }
  function tileSetReady(ts, biome) { return !!ts && ts.variants(biome + '_floor').length > 0 && ts.variants(biome + '_wall').length > 0; }
  // Returns { canvas, n (art tiles drawn), torches: [{x,y}] }. rng streams are separate from the code-drawn bake ('dtile:' prefix) so old looks never shift.
  function bakeRoomTiles(ts, biome, rid, tpl, pal, seed, isBoss, tint, excl) {
    const grid = tpl.rows.map((r) => r.replace(/D/g, '#').replace(/S/g, '.'));
    const masks = MMRooms.autotile(grid);
    const rng = MMRng.create('dtile:' + seed + ':' + rid);
    const floors = isBoss && ts.variants('boss_floor').length ? ts.variants('boss_floor') : ts.variants(biome + '_floor');
    const walls = ts.variants(biome + '_wall');
    const wallAt = (x, y) => y < 0 || x < 0 || y >= tpl.h || x >= tpl.w || grid[y][x] === '#';
    const isDoor = (x, y) => tpl.rows[y][x] === 'D';
    let n = 0; const torches = []; const cand = [];
    const canvas = mk(T * tpl.w, T * tpl.h, (g) => {
      g.imageSmoothingEnabled = false;
      const put = (im, x, y) => { g.drawImage(im, 0, 0, 32, 32, x * T, y * T, T, T); n++; };
      for (let y = 0; y < tpl.h; y++) for (let x = 0; x < tpl.w; x++) {
        if (grid[y][x] !== '#') {
          put(floors[rng.int(0, floors.length - 1)], x, y);
          if (tint) rect(g, tint, x * T, y * T, T, T);
          if (wallAt(x, y - 1)) rect(g, 'rgba(0,0,0,0.28)', x * T, y * T, T, 7); // soft shadow under a wall
          continue;
        }
        put(walls[rng.int(0, walls.length - 1)], x, y);
        const m = masks[y][x];
        if (m & 4) rect(g, 'rgba(0,0,0,0.32)', x * T, y * T, T, T); // wall top (no face): a little darker so faces read as the near side
        else if (!isDoor(x, y)) cand.push({ x, y });
        if (!(m & 1)) rect(g, pal.hi, x * T, y * T, T, 1);
      }
      const near = (a, b) => Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
      const shuffled = (a) => a.map((c) => ({ c, k: rng.next() })).sort((p, q) => p.k - q.k).map((q) => q.c);
      // torches: wall faces near doors or corners, spaced apart, seeded
      const doorsT = DOOR_TILES.map((d) => ({ x: d[0], y: d[1] }));
      const tc = cand.filter((c) => doorsT.some((d) => near(c, d) <= 3) || (wallAt(c.x - 1, c.y) && !wallAt(c.x - 1, c.y + 1)) || (wallAt(c.x + 1, c.y) && !wallAt(c.x + 1, c.y + 1)));
      shuffled(tc).forEach((c) => { if (torches.length < 4 && torches.every((t) => near(t, c) >= 4)) torches.push(c); });
      // pillars: only on wall faces (already solid), never under a torch
      const pil = ts.variants(biome + '_pillar')[0];
      if (pil) {
        const po = shuffled(cand.filter((c) => !torches.some((t) => t.x === c.x && t.y === c.y) && !doorsT.some((d) => near(c, d) <= 1)));
        const picked = []; const cap = isBoss ? 4 : 3;
        po.forEach((c) => { if (picked.length < cap && picked.every((t) => near(t, c) >= 3)) { picked.push(c); put(pil, c.x, c.y); } });
      }
      // rubble: flat debris on free floor tiles that touch a wall, never on spawn / door / key / chest / portal tiles
      const rub = ts.variants(biome + '_rubble')[0];
      if (rub) {
        const ro = []; for (let y = 1; y < tpl.h - 1; y++) for (let x = 1; x < tpl.w - 1; x++) {
          if (grid[y][x] === '#' || excl.has(x + ',' + y)) continue;
          if (wallAt(x - 1, y) || wallAt(x + 1, y) || wallAt(x, y - 1) || wallAt(x, y + 1)) ro.push({ x, y });
        }
        const picked = [];
        shuffled(ro).forEach((c) => { if (picked.length < 3 && picked.every((t) => near(t, c) >= 4)) { picked.push(c); put(rub, c.x, c.y); } });
      }
      torches.forEach((t) => { // static warm glow on the floor below each torch (the flame itself is drawn per frame from a strip)
        const gr = g.createRadialGradient((t.x + 0.5) * T, (t.y + 1.3) * T, 2, (t.x + 0.5) * T, (t.y + 1.3) * T, T * 2);
        gr.addColorStop(0, 'rgba(255,170,70,0.18)'); gr.addColorStop(1, 'rgba(255,170,70,0)');
        g.fillStyle = gr; g.fillRect((t.x - 2) * T, t.y * T, T * 5, T * 4);
      });
    });
    return { canvas, n, torches };
  }

  function create(arena, opts) {
    opts = opts || {};
    const hubExit = opts.fromHub === undefined ? opts.home === '../../hub/index.html' : opts.fromHub === true; // set only by mad-maze.js from an exact ?from=hub
    // The summary's Back link (NAV-AUDIT #8/#12): mad-maze.js passes the page's exit (the previous place, else the World map) and its
    // "Back to <place>" label. Only a plain relative href is accepted (no scheme, no //); anything else keeps the old town / map link.
    const homeOk = typeof opts.home === 'string' && opts.home.length <= 200 && !/^\/\//.test(opts.home) && /^[A-Za-z0-9_.\/?=&%#-]+$/.test(opts.home);
    const homeHref = homeOk ? opts.home : (hubExit ? '../../hub/index.html' : '../../index.html');
    const homeText = typeof opts.homeLabel === 'string' && /^Back to [A-Za-z ]{1,30}$/.test(opts.homeLabel) ? opts.homeLabel : (hubExit ? 'Back to the map' : 'Back to town');
    // set only by mad-maze.js from a regex-checked ?return= (a Realm World portal): the exit goes back to that portal tile
    const backWorld = typeof opts.returnTo === 'string' && /^index\.html\?mode=world&seed=[A-Za-z0-9_-]{1,24}&at=\d{1,4},\d{1,4}(&test=1)?$/.test(opts.returnTo) ? opts.returnTo : null;
    const baseSeed = String(opts.seed === undefined ? '1' : opts.seed);
    // DV1 deep run: floor 2..3 of the same biome (opts.floor from ?floor=, set only by the stairs). Each floor below the first has its own derived seed.
    const EG = typeof window !== 'undefined' && window.MMEndgame ? window.MMEndgame : null;
    const qsHas = (re) => { try { return re.test(location.search); } catch (e) { return false; } };
    const floorQ = Math.floor(Number(opts.floor)); const floorWant = floorQ >= 2 && floorQ <= 3 ? floorQ : 1;
    // G-25 (b03-07): ?floor= is clamped to the deepest floor this device has cleared in that biome + 1 (additive key pixeltown-deep-v1,
    // written when a floor's boss falls). A ?test=1 page may bypass it (the deep-run tests), unless it asks for the gate with ?floorgate=1.
    const gateOn = !(opts.test && !qsHas(/[?&]floorgate=1(&|$)/));
    const floor0 = gateOn ? Math.min(floorWant, deepCleared(MMBiomes.clean(opts.biome)) + 1) : floorWant;
    const floorClamped = floor0 < floorWant;
    const seed = floor0 > 1 ? baseSeed + 'f' + floor0 : baseSeed;
    // BL2: ?lair=1 (read here; the BK2 boss-key portal passes it) = a 2-room dungeon: an antechamber guarding the key + the biome boss hall behind a key door
    let lair = opts.lair === true || opts.lair === '1'; try { if (new URLSearchParams(location.search).get('lair') === '1') lair = true; } catch (e) { /* node / no location */ }
    const biome = MMBiomes.clean(opts.biome); const B = Object.assign({}, MMBiomes.get(biome)); // unknown / missing biome -> warren
    // BI1: each biome boss fires its own b17 ebolt_ art and has one signature attack (MMBiomes bossBolt / sig); ?bosses=classic keeps the plain boss
    let bossBolt = null; let bossSig = null;
    { const bf = MMBiomes.bossFor(biome, seed, opts.bosses === 'classic'); B.boss_art = bf.boss_art; B.boss_name = bf.boss_name; if (opts.bosses !== 'classic') { bossBolt = bf.bossBolt || null; bossSig = bf.sig || null; } } // b23: odd crypt seeds face the Lich King (?bosses=classic keeps the original)
    // DV1 dungeon mutators (MMEndgame.mutatorsFor): z2+ biomes only (meadow, crypt; warren / bramble z1 never), seeded per dungeon seed, one by default.
    // ?mut=0 turns them off (the run is then exactly today's), ?mut=2 asks for two. The lair (BK2) keeps its fixed fight. Applied on the MMDifficulty
    // scale through MMEndgame.applyMutators (re-clamped), so no mutator raises damage, adds a timer or shortens a wind-up.
    let mutOff = opts.mut === 0 || opts.mut === '0'; let mutN = opts.mut === 2 || opts.mut === '2' ? 2 : 1;
    try { const mv = new URLSearchParams(location.search).getAll('mut'); if (mv.indexOf('0') >= 0) mutOff = true; else if (mv.indexOf('2') >= 0) mutN = 2; } catch (e) { /* node / no location */ }
    const mutRes = EG && !lair ? EG.mutatorsFor(biome, undefined, seed, { off: mutOff, count: mutN }) : null;
    const MUT = mutRes && mutRes.list.length ? mutRes : null;
    const DEEP_ON = !!EG && !lair && opts.deep !== false && !qsHas(/[?&]deep=0(&|$)/);
    const floor = DEEP_ON ? floor0 : 1;
    const deepInfo = DEEP_ON ? EG.deepRun(floor, biome) : null;
    let rosterClassic = opts.roster === 'classic'; try { if (/[?&]roster=classic(&|$)/.test(location.search)) rosterClassic = true; } catch (e) { /* node / no location */ } // b24: ?roster=classic = no wave-2 skins
    const layoutV = opts.layout === 2 || biome !== 'warren' || lair ? 2 : 1; // a biome run is new content: it always uses the layout-2 pool
    const palCache = {};
    function palOf(type) { // warren: the original palette untouched; other biomes recolour start / normal / boss rooms, the coded rooms (key, treasure, secret) keep theirs
      if (palCache[type]) return palCache[type];
      const base = PAL[type] || PAL.combat; const o = biome === 'warren' ? null : type === 'start' ? B.start : type === 'combat' ? B.normal : type === 'boss' ? B.boss : null;
      const nm = lair && type === 'start' ? 'Antechamber' : biome === 'warren' ? base.name : type === 'start' ? B.name + ' Gate' : type === 'combat' ? B.room : type === 'boss' ? B.boss_room : base.name;
      palCache[type] = o ? { f: o.f, w: o.w, hi: o.hi, name: nm } : base; return palCache[type];
    } // 1 = original room selection (old seeds/links), 2 = variety pool (new runs only)
    // The lair graph is hand-built (no generator stream consumed): room 0 = antechamber (type 'start', holds the key), room 1 = boss hall north of it behind a locked door.
    const dungeon = lair
      ? { seed, layout: 2, w: 1, h: 2, rooms: [{ id: 0, x: 0, y: 1, w: 17, h: 13, type: 'start', doors: [0], locked: false }, { id: 1, x: 0, y: 0, w: 17, h: 13, type: 'boss', doors: [0], locked: false }], doors: [{ id: 0, a: 0, b: 1, dir: 'N', locked: true, cracked: false }], bossRoomId: 1, lair: true }
      : MMWarren.generate(seed, { layout: layoutV });
    // Narrow profile (Realm-style tight dungeons): layout-2 runs only; ?narrow=0 (or opts.narrow === false) restores the old room pool.
    let narrowQ = true; try { narrowQ = new URLSearchParams(window.location.search).get('narrow') !== '0'; } catch (e) { /* no location */ }
    const narrowOn = layoutV === 2 && opts.narrow !== false && narrowQ;
    let picks = lair ? (() => { // pick the antechamber as a normal fighting room and the hall as a boss room, through a 3-room stand-in graph (same selector, same biome bias)
      const fake = { rooms: [{ id: 0, type: 'start', doors: [0] }, { id: 1, type: 'combat', doors: [0, 1] }, { id: 2, type: 'boss', doors: [1] }], doors: [{ id: 0, a: 0, b: 1, dir: 'N' }, { id: 1, a: 1, b: 2, dir: 'N' }] };
      const sel = MMRooms.select(fake, 'lair:' + seed, 2, biome, narrowOn ? { narrow: true } : undefined);
      return { defs: { 0: sel.defs[1], 1: sel.defs[2] } };
    })() : MMRooms.select(dungeon, seed, layoutV, biome, narrowOn ? { narrow: true } : undefined);
    if (MUT && !lair) { // Narrow: every fighting room comes from the narrow pool (no wide hall); Mirror: the fighting rooms' layouts come in reverse order
      const fight = dungeon.rooms.filter((r) => r.type === 'combat').map((r) => r.id);
      const defs = Object.assign({}, picks.defs);
      if (MUT.fx.width < 1 && layoutV === 2) {
        const nar = narrowOn ? picks : MMRooms.select(dungeon, seed, layoutV, biome, { narrow: true });
        fight.forEach((id) => {
          let d = nar.defs[id];
          for (let k = 1; k <= 8 && d && !MMRooms.isNarrow(d.id); k++) d = MMRooms.select(dungeon, seed + ':narrow' + k, layoutV, biome, { narrow: true }).defs[id];
          if (d && MMRooms.isNarrow(d.id)) defs[id] = d;
        });
      }
      if (MUT.fx.mirror) { const ds = fight.map((id) => defs[id]).reverse(); fight.forEach((id, i) => { defs[id] = ds[i]; }); }
      picks = { defs };
    }
    const rngRun = MMRng.create('run:' + seed);
    const lootRng = MMRng.create('loot:' + seed);
    const bossRng = MMRng.create('boss:' + seed);
    const S = bakeShared();
    let tiles = null; // MMArt DTileSet (b25) once loaded; null = the code-drawn rooms
    let lastDoorArt = [];
    const ambient = []; if (B.particles) { const ar = MMRng.create('amb:' + biome + ':' + seed); for (let i = 0; i < B.particles.n; i++) ambient.push({ x: ar.int(0, MMRooms.W * T), y: ar.int(0, MMRooms.H * T), v: 0.6 + ar.next(), ph: ar.next() * 6.28, sz: ar.int(2, 4) }); }
    document.body.dataset.dungeonBiome = biome;
    const byId = {}; dungeon.rooms.forEach((r) => { byId[r.id] = r; });
    // One count for the HUD and the summary: the regular rooms (start .. boss, boss included); the hidden secret room is reported on its own row.
    const MAIN_ROOMS = dungeon.rooms.filter((r) => r.type !== 'secret').length;
    const visitedMain = () => dungeon.rooms.filter((r) => r.type !== 'secret' && state.room(r.id).visited).length;

    // depth from the start over the regular doors, for the encounter tier
    const depth = {}; depth[dungeon.rooms.find((r) => r.type === 'start').id] = 0;
    for (let guard = 0; guard < 20; guard++) dungeon.doors.forEach((d) => {
      if (d.cracked) return;
      if (depth[d.a] !== undefined && depth[d.b] === undefined) depth[d.b] = depth[d.a] + 1;
      if (depth[d.b] !== undefined && depth[d.a] === undefined) depth[d.a] = depth[d.b] + 1;
    });

    // difficulty curve (MMDifficulty): room 1 = first room after the gate, last = the deepest room; applied at spawn time only (?difficulty=off = 1x)
    const DIFF = window.MMDifficulty && !MMDifficulty.isOff(typeof location !== 'undefined' ? location.search : '') ? MMDifficulty : null;
    let dMode = 'classic'; try { if (window.MMProfile) dMode = MMProfile.clean(localStorage.getItem(MMProfile.KEY)).mode; } catch (e) { dMode = 'classic'; }
    const maxDepth = Math.max(1, ...Object.keys(depth).map((k) => depth[k]));
    const scaleOf0 = (id, boss) => (DIFF ? DIFF.dungeonScale(biome, Math.max(1, depth[id] || 1), maxDepth, !!boss, { mode: dMode }) : { hp: 1, dmg: 1, spd: 1, count: 1, fire: 1 });
    const scaleOf = (id, boss) => (MUT && DIFF ? EG.applyMutators(scaleOf0(id, boss), MUT) : scaleOf0(id, boss));
    const SC = !!(DIFF || MUT); // a scale is applied at spawn time

    // ---- per-room layout: template, plan, counts ----
    const L = {}; const counts = {};
    dungeon.rooms.forEach((r) => {
      const tplDef = picks.defs[r.id];
      const tpl = MMRooms.parse(tplDef);
      let plan = [];
      if (r.type === 'combat' || r.type === 'key' || (lair && r.type === 'start')) {
        let allowed = biome === 'warren' ? undefined : B.ids;
        if (tpl.tight) { // cramped room: no ring-bullet puffcaps / splitting sprouts (they add 3+ shooters) and at most 3 enemies at once
          const calm = (allowed || MMEnemies.IDS).filter((q) => q !== 'puffcap' && q !== 'sprout'); if (calm.length) allowed = calm;
        }
        plan = MMEnemies.plan(seed + ':' + r.id, lair ? 2 : Math.max(1, depth[r.id] || 1), tpl.spawns.map((s) => ({ x: s.x, y: s.y })), null, allowed).enemies;
        if (tpl.tight && plan.length > TIGHT_MAX_SHOOTERS) plan = plan.slice(0, TIGHT_MAX_SHOOTERS);
        if (SC && plan.length) {
          const want = Math.round(plan.length * scaleOf(r.id).count);
          if (MUT && want > plan.length) { // Swarm: more (weaker) foes on the room's free spawn tiles, copies of the seeded plan, never past the tight-room cap
            const used = new Set(plan.map((e) => e.x + ',' + e.y)); const free = tpl.spawns.filter((q) => !used.has(q.x + ',' + q.y)); const add = [];
            for (let i = 0; plan.length + add.length < want && i < free.length; i++) add.push(Object.assign({}, plan[i % plan.length], { x: free[i].x, y: free[i].y, elite: false }));
            plan = plan.concat(add); if (tpl.tight && plan.length > TIGHT_MAX_SHOOTERS) plan = plan.slice(0, TIGHT_MAX_SHOOTERS);
          } else plan = plan.slice(0, Math.max(1, Math.min(plan.length, want))); // early rooms hold fewer enemies (the plan order is seeded)
        }
      }
      const extra = plan.reduce((n, e) => n + (e.id === 'sprout' ? 2 : 0), 0); // each Sprout leaves two minis behind
      counts[r.id] = r.type === 'boss' ? 1 : plan.length + extra;
      L[r.id] = { tpl, plan, baked: null, spawned: false, keyTaken: false, sc: scaleOf(r.id, r.type === 'boss') };
    });
    const state = MMDungeonState.create(dungeon, rngRun, { enemies: counts, bossHp: Math.max(1, Math.ceil((opts.bossHp || 260) * (SC ? scaleOf(dungeon.rooms.find((q) => q.type === 'boss').id, true).hp : 1) * (lair ? 1.3 : 1))) }); // lair boss: 1.3x HP

    const freeSpot = (tpl, tx, ty) => {
      let best = null; let bd = 1e9;
      for (let y = 1; y < tpl.h - 1; y++) for (let x = 1; x < tpl.w - 1; x++) {
        if (tpl.rows[y][x] === '#') continue;
        const d = Math.hypot(x - tx, y - ty); if (d < bd) { bd = d; best = { x, y }; }
      }
      return best;
    };

    const unlocked = {}; const granted = [];
    let keyFound = 0; let current = null; let finished = false; let sig = ''; let mapSig = '';
    let lockMsgAt = -9; let hudText = ''; let queue = []; let nextSweep = 0; let nextWall = 0; let sweepN = 0; let sigNext = 0; let sigWind = null; let sigN = 0;
    // G12 boss ground-slam: from phase 2 the boss winds up a ring zone for MMSplash.SLAM.WIND (0.9 s, drawn in drawOver), then hits whoever is still inside.
    // ?bosses=classic, ?telegraph=0 (no warning, so no slam) and ?bossslam=0 turn it off. Damage: MMSplash.slamDmg of the boss dmgMul (MMDifficulty), capped.
    const SLAM_ON = typeof MMSplash !== 'undefined' && !!MMSplash.slamStep && opts.bosses !== 'classic' && !(() => { try { return /[?&](telegraph|bossslam)=0(&|$)/.test(location.search); } catch (er) { return false; } })();
    let slam = null; let slamHits = 0; let slamWinds = 0;
    const slamEvery = (e) => (e.phase >= 3 ? 5.5 : 7.5);
    function slamTick(e, dt) {
      if (!SLAM_ON || !(e.phase >= 2)) { slam = null; return; }
      if (!slam) slam = MMSplash.slamNew(slamEvery(e));
      const r = MMSplash.slamStep(slam, dt, true, slamEvery(e));
      if (r === 1) { slamWinds++; arena._snd('warn'); }
      if (r !== 3) return;
      const p = arena.player; const d = Math.hypot(p.x - e.x, p.y - e.y) - 12;
      arena._burst(e.x, e.y, '#ff4a4a', 14, 170); arena._snd('hit');
      const dmg = MMSplash.slamDmg(e.dmgMul || 1, Math.max(0, d), MMSplash.slamR(2));
      if (dmg > 0) { slamHits++; arena._hitPlayer(arena._guarded(dmg)); }
    }
    const api = { fellText: B.fell, floorWant, floorClamped, mut: MUT ? { ids: MUT.ids.slice(), label: MUT.label, text: MUT.text, fx: Object.assign({}, MUT.fx) } : null, floor, baseSeed, deep: deepInfo, pickups: () => drops.map((q) => ({ type: q.type, x: q.x, y: q.y, value: q.value, tier: q.tier })), pickStats: () => ({ live: drops.length, total: pickTotal, got: Object.assign({}, pickGot), magnet: MAGNET_R, on: pickOn }), lair, seed, biome, bossBolt, bossSig, sigCount: () => sigN, layoutVersion: layoutV, narrow: narrowOn, graph: dungeon, state, arena, granted, grantItem, get gearOn() { return gearOn; }, get gear() { return gearGot; }, gp: () => gpNow() };
    // Lantern stash payout (MMStash): every kept find of this run is paid into the stash when the summary shows (win or fall)
    const ST = window.MMStash && window.MMProfile ? window.MMStash : null; const shards0 = arena.save.shards;
    if (ST) {
      arena.onItem = (it) => { try { ST.recordTo(localStorage, it, 'dungeon'); } catch (e) { /* storage blocked */ } };
      arena.onDeathCache = (c) => { try { if (c && c.n) ST.recordTo(localStorage, { n: c.n, id: c.id, r: c.rarity }, 'cache'); } catch (e) { /* storage blocked */ } };
    }

    // ---------- doors ----------
    function doorsOf(id) {
      return byId[id].doors.map((did) => {
        const d = dungeon.doors[did]; const dir = d.a === id ? d.dir : OPP[d.dir]; const other = d.a === id ? d.b : d.a;
        let status = 'open';
        if (d.cracked && !state.secretOpen) status = 'cracked';
        else if (id === current && state.doorsClosed()) status = 'sealed';
        else if (d.locked && !unlocked[d.id]) status = 'locked';
        return { id: did, d, dir, other, tile: MMRooms.DOORS[dir], status };
      });
    }
    const curDoors = () => (current === null ? [] : doorsOf(current));
    function wallRows() {
      const tpl = L[current].tpl; const open = {};
      curDoors().forEach((o) => { if (o.status === 'open') open[o.dir] = true; });
      return tpl.rows.map((row, y) => Array.from(row, (c, x) => {
        if (c === 'D') { const dir = Object.keys(MMRooms.DOORS).find((k) => MMRooms.DOORS[k].x === x && MMRooms.DOORS[k].y === y); return open[dir] ? '.' : '#'; }
        return c === '#' ? '#' : '.';
      }).join(''));
    }
    function doorSig() { return current + ':' + curDoors().map((o) => o.dir + o.status).join(',') + ':' + state.secretHits; }
    function refreshWalls() { if (current === null) return; arena.setWalls(wallRows()); sig = doorSig(); }

    // ---------- room bake (tile art when loaded, else the code-drawn room) ----------
    function exclTiles(tpl) { // tiles that must stay free of decoration: spawns, doors (+ inner neighbour), key / chest / portal spots, the entry points
      const ex = new Set(); const add = (x, y, r) => { for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) ex.add((x + dx) + ',' + (y + dy)); };
      tpl.spawns.forEach((q) => add(q.x, q.y, 0));
      DOOR_TILES.forEach((d) => add(d[0], d[1], 1));
      [[8, 6], [8, 8]].forEach((q) => { const f = freeSpot(tpl, q[0], q[1]); if (f) add(f.x, f.y, 1); });
      add(8, 6, 1); add(8, 5, 1);
      return ex;
    }
    function bakeIfNeeded(id) {
      const lay = L[id]; if (lay.baked) return; const r = byId[id]; const pal = palOf(r.type);
      if (tileSetReady(tiles, biome)) {
        const tint = r.type === 'key' || r.type === 'treasure' || r.type === 'secret' ? hexA(pal.hi, 0.12) : null;
        const res = bakeRoomTiles(tiles, biome, id, lay.tpl, pal, seed, r.type === 'boss', tint, exclTiles(lay.tpl));
        lay.baked = res.canvas; lay.tileN = res.n; lay.torches = res.torches;
      } else { lay.baked = bakeRoom(id, lay.tpl, pal, seed); lay.tileN = 0; lay.torches = []; }
    }
    function setTileArt(set) { tiles = set && set.variants ? set : null; dungeon.rooms.forEach((r) => { L[r.id].baked = null; L[r.id].tileN = 0; L[r.id].torches = []; }); if (current !== null) bakeIfNeeded(current); }

    // ---------- rooms ----------
    const spotPx = (s) => ({ x: (s.x + 0.5) * T, y: (s.y + 0.5) * T });
    function keySpot() { return spotPx(freeSpot(L[current].tpl, 8, 6)); }
    function chestSpot() { return spotPx(freeSpot(L[current].tpl, 8, 6)); }
    function portalSpot() { return spotPx(freeSpot(L[current].tpl, 8, 8)); }
    const hasChest = () => current !== null && (byId[current].type === 'treasure' || byId[current].type === 'secret');
    const hasKey = () => current !== null && (byId[current].type === 'key' || (lair && byId[current].type === 'start')) && !L[current].keyTaken;
    const hasPortal = () => current !== null && byId[current].type === 'boss' && state.boss.dead;

    function spawnMob(type, id, x, y, hp, elite, sc) {
      const e = arena.spawnEnemy(type, x, y); if (!e) return null;
      if (sc) { hp = Math.max(1, Math.ceil(hp * sc.hp)); e.dmgMul = sc.dmg; e.spdMul = sc.spd; e.diff = sc; }
      e.dg = 'mob'; e.did = id; e.art = MMBiomes.skinFor(biome, id, !!elite, seed, Math.round(x) + ',' + Math.round(y), rosterClassic) || B.skin[id] || (id === 'sprout_mini' ? B.skin.sprout : null) || null; e.elite = !!elite; e.maxHp = hp; e.hp = hp; e.lx = x; e.ly = y;
      return e;
    }
    function spawnRoom(id, entry) {
      const lay = L[id]; lay.spawned = true;
      const tiles = lay.tpl.spawns; const used = new Set();
      lay.plan.forEach((p) => {
        let pos = { x: p.x, y: p.y };
        if (entry && Math.hypot(pos.x - entry.x, pos.y - entry.y) < MMEnemies.MIN_START_DIST) { // keep the entry clear
          let best = null; let bd = -1;
          tiles.forEach((s) => { const k = s.x + ',' + s.y; if (used.has(k)) return; const d = Math.hypot(s.x - entry.x, s.y - entry.y); if (d > bd) { bd = d; best = s; } });
          if (best) pos = best;
        }
        used.add(pos.x + ',' + pos.y);
        const px = spotPx(pos);
        spawnMob(ENEMY_MAP[p.id], p.id, px.x, px.y, Math.max(3, Math.ceil(p.hp / HP_DIV)), p.elite, SC ? lay.sc : null);
      });
    }
    function spawnBoss() {
      const e = arena.spawnEnemy('boss', arena.W / 2, 132); if (!e) return;
      if (SC && current !== null) { e.dmgMul = L[current].sc.dmg; e.diff = L[current].sc; }
      e.dg = 'boss'; e.maxHp = state.boss.maxHp; e.hp = state.boss.hp; e.phase = state.boss.phase; e.invuln = 1.2; e.cd = 1.2; e.cd2 = 2.4; e.angle = 0;
      arena.bossT0 = arena.clock; e.bossArt = B.boss_art; arena._syncBoss(); nextSweep = arena.clock + 4; nextWall = arena.clock + 6; sigNext = arena.clock + 4.5; sigWind = null; slam = null;
    }

    function clearTransient() {
      drops.length = 0; // loose pickups do not follow you through a door
      [arena.pBullets, arena.eBullets, arena.bags, arena.drifters].forEach((pool) => pool.forEach((o) => { o.active = false; }));
      queue = [];
    }
    function loadRoom(id, travel) {
      current = id;
      const lay = L[id]; const r = byId[id];
      bakeIfNeeded(id);
      clearTransient();
      arena.biome = r.type === 'boss' ? 1 : r.type === 'treasure' ? 2 : 0;
      const p = arena.player; let entry = { x: 8, y: 6 };
      if (travel) { const dt = MMRooms.DOORS[OPP[travel]]; entry = { x: dt.x + DV[travel][0], y: dt.y + DV[travel][1] }; p.x = (entry.x + 0.5) * T; p.y = (entry.y + 0.5) * T; p.iframes = Math.max(p.iframes, 1); }
      else { p.x = arena.W / 2; p.y = arena.H / 2; }
      if (arena._dv && typeof arena._camStep === 'function') arena._camStep(-1); // phone dungeon view: a new room opens on the hero (no sweep across it)
      refreshWalls();
      const rs = state.room(id);
      if (!lay.spawned && rs.enemiesAlive > 0) {
        if (r.type === 'boss') { spawnBoss(); lay.spawned = true; } else spawnRoom(id, entry);
        arena._showBanner(r.type === 'boss' ? B.boss_name + '!' : 'The doors seal!', 1.6);
      } else if (r.type === 'treasure' || r.type === 'secret' || r.type === 'key') arena._showBanner(palOf(r.type).name, 1.6);
      arena._syncBoss(); mapSig = '';
    }
    function tryEnter(id) {
      if (finished || current === null) return { ok: false, reason: 'done' };
      const dd = curDoors().find((o) => o.other === id);
      const keysBefore = state.keys;
      const res = state.enter(id);
      if (!res.ok) return res;
      if (dd && dd.d.locked && state.keys < keysBefore) { unlocked[dd.d.id] = true; arena._floatText(arena.player.x, arena.player.y - 30, '🗝 unlocked', '#ffd45a'); }
      loadRoom(id, dd ? dd.dir : null);
      return res;
    }

    // ---------- pickups (DP3, MMPickups): room clears and chests drop coins / XP orbs / hearts / life potions with the world's rules ----------
    // Rolls are seeded per (seed, room, source) by MMPickups itself, positions by their own MMRng stream: no run / loot / boss stream is touched, so every old seed keeps its
    // layout and enemy plans. Magnet radius = the world's 120 px (MMPickups.MAGNET_RADIUS_WORLD), cap 60, lifetime per tier. Focus orbs need arena.restoreFocus (not in the arena
    // yet): they are only spawned when it exists. ?pickups=0 turns it all off. Sprites are cached 24 px canvases blitted by drawUnder (no per-frame Graphics).
    const PK = window.MMPickups || null;
    let pickOn = !!PK; try { if (/[?&]pickups=0(&|$)/.test(location.search)) pickOn = false; } catch (e) { /* no location */ }
    const PICK_CAP = 60; const MAGNET_R = PK && PK.MAGNET_RADIUS_WORLD > 0 ? PK.MAGNET_RADIUS_WORLD : 64;
    const drops = []; let pickSave = false; const pickGot = { coin: 0, xp: 0, heart: 0, potion: 0, focus: 0 }; let pickTotal = 0; const pickSpr = {};
    function pickSprite(type) {
      if (pickSpr[type]) return pickSpr[type];
      const c = document.createElement('canvas'); c.width = c.height = 24; const g = c.getContext('2d');
      if (type === 'coin') { g.fillStyle = '#7a5a12'; g.beginPath(); g.arc(12, 12, 8, 0, 7); g.fill(); g.fillStyle = '#ffd45a'; g.beginPath(); g.arc(12, 12, 6.5, 0, 7); g.fill(); g.fillStyle = '#fff0a8'; g.fillRect(9, 8, 2, 6); }
      else if (type === 'xp') { g.fillStyle = '#4a2a8a'; g.beginPath(); g.arc(12, 12, 8, 0, 7); g.fill(); g.fillStyle = '#b48cff'; g.beginPath(); g.arc(12, 12, 6, 0, 7); g.fill(); g.fillStyle = '#efe0ff'; g.fillRect(9, 8, 3, 3); }
      else if (type === 'heart') { g.fillStyle = '#7a1022'; g.beginPath(); g.arc(8, 9, 5.5, 0, 7); g.arc(16, 9, 5.5, 0, 7); g.fill(); g.beginPath(); g.moveTo(3, 11); g.lineTo(21, 11); g.lineTo(12, 21); g.fill(); g.fillStyle = '#ff5f6b'; g.beginPath(); g.arc(8, 9, 4, 0, 7); g.arc(16, 9, 4, 0, 7); g.fill(); g.beginPath(); g.moveTo(5, 11); g.lineTo(19, 11); g.lineTo(12, 19); g.fill(); }
      else if (type === 'focus') { g.fillStyle = '#12335a'; g.beginPath(); g.arc(12, 12, 8, 0, 7); g.fill(); g.fillStyle = '#5bb8ff'; g.beginPath(); g.arc(12, 12, 6, 0, 7); g.fill(); g.fillStyle = '#e0f4ff'; g.fillRect(10, 7, 3, 3); }
      else { g.fillStyle = '#143a24'; g.fillRect(9, 4, 6, 5); g.fillRect(6, 9, 12, 12); g.fillStyle = '#5be38a'; g.fillRect(8, 11, 8, 8); g.fillStyle = '#d8ffe6'; g.fillRect(9, 12, 2, 4); }
      pickSpr[type] = c; return c;
    }
    const pickOk = (d) => d.type === 'coin' || (d.type === 'xp' && typeof arena._gainXp === 'function') || d.type === 'heart' || (d.type === 'potion' && d.art === 'potion_life') || (d.type === 'focus' && typeof arena.restoreFocus === 'function');
    function spawnPickups(x, y, group, killIdx, tier) { // returns how many pickups were placed
      if (!pickOn) return 0;
      const list = PK.roll(seed, group, killIdx, tier).filter(pickOk);
      const r = MMRng.create('pickpos:' + seed + ':' + group + ':' + killIdx); let n = 0;
      for (let i = 0; i < list.length; i++) {
        const d = list[i]; const a = r.next() * Math.PI * 2; const rad = 12 + r.next() * 26;
        let px = x + Math.cos(a) * rad; let py = y + Math.sin(a) * rad;
        if (arena._blocked(px, py, 6)) { px = x; py = y; }
        if (drops.length >= PICK_CAP) drops.shift();
        drops.push({ type: d.type, art: d.art, value: d.value, tier: d.tier, x: px, y: py, bornMs: arena.clock * 1000, lifeMs: d.lifeMs, ph: r.next() * 6.28 });
        n++; pickTotal++;
      }
      return n;
    }
    function pickTier(id) { return Math.max(1, Math.min(5, (depth[id] || 1) + (lair ? 1 : 0))); }
    function dropClearPickups(id, x, y) { let n = 0; for (let k = 0; k < 3; k++) n += spawnPickups(x, y, 'clear:' + id, k, pickTier(id)); return n; } // a cleared room pays three kills' worth
    function collectPick(q) {
      const p = arena.player; pickGot[q.type] = (pickGot[q.type] || 0) + 1;
      if (q.type === 'coin') { arena.save.shards += q.value; arena.run.shards += q.value; arena._floatText(p.x, p.y - 26, `+${q.value} 💎`, '#8fe9ff'); pickSave = true; }
      else if (q.type === 'xp') { arena._gainXp(Math.max(1, Math.round(q.value * (arena.stats ? arena.stats.xp : 1)))); pickSave = true; }
      else if (q.type === 'focus') { if (typeof arena.restoreFocus === 'function') arena.restoreFocus(q.value); }
      else {
        const o = PK.use(q, { hp: p.hp, maxHp: arena.stats.maxHp, focus: 0, maxFocus: 0 });
        if (o.hp > p.hp) { arena._floatText(p.x, p.y - 26, `+${Math.round(o.hp - p.hp)}`, '#5be38a'); p.hp = o.hp; arena._syncHud(); }
      }
    }
    function pickTick(dt) {
      if (!drops.length) return;
      const p = arena.player; const now = arena.clock * 1000; const d = Math.min(dt, 0.1);
      for (let i = drops.length - 1; i >= 0; i--) {
        const q = drops[i];
        if (PK.expired(q, now)) { drops.splice(i, 1); continue; }
        if (arena.state !== 'play') continue;
        const m = PK.magnetStep(q, p, d, MAGNET_R); q.x = m.x; q.y = m.y;
        if (m.collected) { drops.splice(i, 1); collectPick(q); }
      }
      if (pickSave) { pickSave = false; arena.onSave(arena.save); arena._syncHud(); }
    }
    function drawPicks(g) {
      if (!drops.length) return;
      const tt = arena.clock; const reduced = arena._reduced; const now = tt * 1000;
      for (let i = 0; i < drops.length; i++) {
        const q = drops[i]; const left = q.lifeMs - (now - q.bornMs);
        if (left < 4000 && !reduced && Math.floor(tt * 8) % 2) continue; // blinks out in the last 4 s
        const bob = reduced ? 0 : Math.round(Math.sin(tt * 4 + q.ph) * 2);
        g.drawImage(pickSprite(q.type), Math.round(q.x - 12), Math.round(q.y - 12 + bob));
      }
    }

    // ---------- loot ----------
    function grantItem(slot, tier) {
      const ids = SLOT_ITEMS[slot] || SLOT_ITEMS.trinket; let id = lootRng.pick(ids); const rar = Math.max(0, Math.min(2, tier - 1));
      // A weapon chest can hold a styled wpn_ weapon (same rules as world drops: hero family 70%, none in classic or without a hero). Its own seeded stream
      // per chest keeps lootRng, and so every old seed's other contents, unchanged.
      if (slot === 'weapon' && arena._wpnDrop && typeof MMRng !== 'undefined') { const wr = MMRng.create('chestwpn:' + seed + ':' + granted.length); id = arena._wpnDrop(id, null, () => wr.next()); }
      const full = arena.save.items.length >= RM_BACKPACK;
      arena.collectItem(id, rar);
      const def = RM_ITEM_BY_ID[id];
      granted.push({ id, rarity: rar, name: def.name, icon: def.icon, rarName: RM_RARITIES[rar].name, color: RM_RARITIES[rar].color, sold: full });
      return granted[granted.length - 1];
    }
    // ---------- tiered gear (G10) ----------
    // Room clears, chests and the boss roll MMGearDrops.rollGear. Every roll has its OWN seeded stream ('dgear...' / 'dgearq...'): lootRng, bossRng, runRng and the
    // arena rng are never touched, so an old seed's non-gear loot is identical with gear off. Gear is granted straight into the pack (no extra bag, no arena.rng draw).
    const gearOn = gearWanted() && typeof MMGearDrops !== 'undefined' && typeof MMGear !== 'undefined' && !(arena.team && arena.team.isPvp);
    const gearGot = []; let gearChestN = 0;
    // Pity state: arena.save.gp is the source of truth once the realm save keeps it; a local mirror covers a realm that still strips unknown keys (it is re-read whenever the save has one).
    let gpMirror = gearOn ? MMGearDrops.cleanGp(arena.save.gp) : { b: 0, d: 0 };
    const gpNow = () => { if (gearOn && arena.save.gp !== undefined) gpMirror = MMGearDrops.cleanGp(arena.save.gp); return gpMirror; };
    function gearRoll(tag, o) { // -> a rollGear result whose id the arena knows, or null
      if (!gearOn) return null;
      const cls = (arena.heroClass && arena.heroClass()) || '';
      const u = MMRng.create('dgearq:' + seed + ':' + tag).next();
      const r = typeof o.r === 'number' ? o.r : (u < 0.04 ? 2 : u < 0.22 ? 1 : 0);
      const ctx = { src: o.src, biome, cls, r, bagTier: o.bagTier || 0, k: o.k || 0, always: !!o.always, gp: gpNow() };
      for (let i = 0; i < (o.always ? 8 : 1); i++) { // an always-drop retries (new stream) when the pick is an id this build cannot hold yet; pity still applies (k stays 0)
        const g = MMGearDrops.rollGear(ctx, MMGearDrops.seedFor(seed, i ? tag + ':try' + i : tag, ctx.k, 'solo'));
        if (!g) { if (!o.always) return null; continue; }
        if (RM_ITEM_BY_ID[g.id] && !RM_ITEM_BY_ID[g.id].inert) return deepLift(g, tag); // an inert def is a saved id this build cannot use: retry
      }
      return null;
    }
    // DV1 deep run: floor N lifts a dungeon roll N-1 tiers (MMEndgame.deepRun, capped at T11: T12 stays a godland-boss find). An armor piece becomes its
    // family's piece for the new tier; an item reaching T7 gets a seeded affix seed. Floor 1 returns the roll unchanged.
    function deepLift(g, tag) {
      const sh = deepInfo ? deepInfo.tierShift : 0; if (!sh || !g) return g;
      const t = Math.min(EG.DEEP.tierCap, g.t + sh); if (t <= g.t) return g;
      let id = g.id;
      if (g.slot === 'armor') { const fam = MMGear.FAMILY_KEYS.find((f) => (MMGear.ARMOR_IDS[f] || []).indexOf(g.id) >= 0); const nid = fam ? MMGear.armorId(fam, t) : null; if (!nid) return g; id = nid; }
      if (!RM_ITEM_BY_ID[id] || RM_ITEM_BY_ID[id].inert) return g;
      const o = Object.assign({}, g, { id, t, deep: sh });
      if (t >= MMGear.AFFIX_MIN_T && !o.a) o.a = 1 + Math.floor(MMRng.create('dgeardeep:' + seed + ':' + tag).next() * 4294967294);
      return o;
    }
    function gearGrant(g, x, y) {
      const sv = arena.save; const n0 = sv.items.length; const full = n0 >= RM_BACKPACK; let took = true;
      // collectItem's burst and text draw the arena rng: swap in a throwaway seeded stream so no later arena draw (bags, enemy AI) shifts when gear drops
      const keep = arena.rng; const fx = MMRng.create('dgearfx:' + seed + ':' + gearGot.length); arena.rng = () => fx.next();
      try {
        if (!full && !sv.gv && window.MMBackup && MMBackup.snapshotPregear) MMBackup.snapshotPregear(localStorage); // GH: once, before the first tiered item is written
        // review F2: the tier, affix seed and (with the GW gate open) the T12 boss signature go INTO collectItem, so the entry the stash records (onItem)
        // and the one written to storage already carry them: no T0 copy, and a soulbound T11+ is never paid to the Lantern stash.
        const gear = { t: g.t }; if (g.a) gear.a = g.a; if (g.sig && typeof RM_FORGE_ON !== 'undefined' && RM_FORGE_ON === true) gear.sig = g.sig;
        took = arena.collectItem(g.id, g.r, gear); // G-04: false = a full pack left this upgrade on the ground as a bag (not sold)
      } finally { arena.rng = keep; }
      const d = MMGear.describe({ id: g.id, r: g.r, t: g.t, a: g.a }); const rar = RM_RARITIES[g.r] || RM_RARITIES[0];
      const rec = { id: g.id, r: g.r, t: g.t, a: g.a || 0, slot: g.slot, name: d ? d.name : g.id, color: d ? d.tierColor : rar.color, rarName: rar.name, sold: full && took !== false };
      if (took === false) rec.waiting = true;
      gearGot.push(rec);
      if (typeof x === 'number') { arena.rng = () => fx.next(); try { arena._floatText(x, y, rec.name, rec.color); } finally { arena.rng = keep; } }
      return rec;
    }
    function dropClearGear(id, x, y) { const g = gearRoll('clear:' + id, { src: 'dungeon', bagTier: 0 }); if (g) gearGrant(g, x, y - 34); return g; }
    function dropChestGear(l) { if (l.slot !== 'weapon' && l.slot !== 'armor') return null; const g = gearRoll('chest:' + (gearChestN++), { src: 'dungeon', bagTier: Math.max(0, Math.min(2, (l.tier || 1) - 1)) }); if (g) gearGrant(g, arena.player.x, arena.player.y - 60); return g; }
    function dropBossGear(e, r1) { // the boss always yields one tiered item (the first bag's fixed quality); a second item rolls the usual chance with its own seeded quality (the bag's rollRarity uses the arena rng, which is not seed-stable)
      const a = gearRoll('boss:0', { src: 'dboss', k: 0, always: true, r: r1, bagTier: Math.min(5, r1 + 2) });
      const b = gearRoll('boss:1', { src: 'dboss', k: 1, bagTier: 2 });
      if (a) gearGrant(a, e.x - 20, e.y - 56);
      if (b) gearGrant(b, e.x + 20, e.y - 56);
      const gp = MMGearDrops.pityStep(gpNow(), { src: 'dboss', biome }, [a]); // only the k 0 roll counts toward the crypt counter
      gpMirror = { b: gp.b, d: gp.d }; arena.save.gp = { b: gp.b, d: gp.d }; arena.onSave(arena.save);
    }
    function openChest() {
      const l = state.openChest(); if (!l) return null;
      arena._snd('levelup');
      if (l.kind === 'gold') { arena.save.shards += l.amount; arena._floatText(arena.player.x, arena.player.y - 44, `+${l.amount} 💎`, '#8fe9ff'); arena.onSave(arena.save); grantItem('trinket', 1); }
      else { grantItem(l.slot, l.tier); if (gearOn) dropChestGear(l); }
      arena._burst(arena.player.x, arena.player.y, '#ffd45a', 22, 240);
      { const c = chestSpot(); for (let k = 0; k < 2; k++) spawnPickups(c.x, c.y + 18, 'chest:' + current, k, pickTier(current) + 1); } // a chest pays two kills' worth, a tier up
      mapSig = '';
      return l;
    }

    // ---------- boss ----------
    function bossEntity() { for (let i = 0; i < arena.enemies.length; i++) if (arena.enemies[i].active && arena.enemies[i].dg === 'boss') return arena.enemies[i]; return null; }
    function hitBoss(e, dmg) {
      const r = state.boss.hit(dmg, arena.clock);
      if (!r.accepted) { if (r.reason === 'invulnerable') arena._floatText(e.x, e.y - 40, 'shielded', '#c9d1d9'); return; }
      e.hp = state.boss.hp; e.flash = 1; arena._snd(r.dead ? 'kill' : 'hit');
      arena._burst(e.x, e.y, '#ff6a4a', 3, 110);
      if (r.phaseChanged) {
        e.phase = r.phase; e.invuln = 1.5; e.cd = 1.1; e.cd2 = 2.0; queue = [];
        arena.eBullets.forEach((b) => { if (b.active) { b.active = false; arena._burst(b.x, b.y, '#ff6a4a', 1, 60); } });
        arena.shake = 12; arena._burst(e.x, e.y, '#ff6a4a', 30, 280);
        arena._showBanner(r.phase === 2 ? B.boss_name.replace(/^The /, '').split(' ').pop() + ' — the floor shakes!' : B.boss_name.replace(/^The /, '').split(' ').pop() + ' — ENRAGED!', 1.6);
        nextSweep = arena.clock + 2.5; nextWall = arena.clock + 5; sigWind = null; sigNext = arena.clock + 3;
      }
      if (r.dead) {
        e.active = false; state.killEnemy();
        arena.eBullets.forEach((b) => { if (b.active) { b.active = false; arena._burst(b.x, b.y, '#ffe27a', 1, 60); } });
        arena._burst(e.x, e.y, '#ff6a4a', 40, 340); arena._burst(e.x, e.y, '#ffe27a', 30, 260); arena.shake = 14;
        arena.save.shards += 60; arena.save.kills += 1; arena.save.kb.boss += 1; arena._floatText(e.x, e.y - 30, '+60 💎', '#8fe9ff');
        arena._gainXp(Math.round(RM_XP.boss * arena.stats.xp));
        const bagR1 = lair ? 3 : 2; const bagR2 = lair ? Math.min(3, arena.rollRarity() + 1) : arena.rollRarity(); // a lair bag is one tier higher
        arena.dropBag(e.x - 20, e.y + 20, bagR1); arena.dropBag(e.x + 20, e.y + 20, bagR2);
        if (gearOn) dropBossGear(e, bagR1);
        arena._showBanner(B.boss_name + ' defeated! The portal opens.', 2.6);
        arena.onSave(arena.save); mapSig = ''; deepMark(biome, floor); deepShow(); // G-25: this floor counts as cleared on this device
      }
      arena._syncBoss();
    }
    const SIG_WIND = 0.6;
    const TAU2 = Math.PI * 2;
    // The signature patterns: no RNG (they aim at the player), built from the existing bullet kinds (0 aimed, 1 spiral / drop, 2 ring).
    function fireSig(e, t) {
      const pl = arena.player; const aim = Math.atan2(pl.y - e.y, pl.x - e.x); const ph = e.phase; const q = (d, x, y, a, sp, k) => queue.push({ at: t + d, x, y, a, s: sp, k });
      if (bossSig === 'burrow') { // Queen Burrowmole: three aimed fans, each a little wider
        for (let w = 0; w < 3; w++) for (let i = 0; i < 5; i++) q(w * 0.18, e.x, e.y, aim + (i - 2) * (0.2 + 0.06 * w), 215, 0);
      } else if (bossSig === 'thorns') { // Forest Warden: a wide thorn fan, then the gaps are filled by a second fan half a step over
        const n = 7 + (ph >= 3 ? 2 : 0); for (let w = 0; w < 2; w++) for (let i = 0; i < n; i++) q(w * 0.35, e.x, e.y, aim + ((i + w * 0.5) / (n - 1) - 0.5) * 1.7, 190, 0);
      } else if (bossSig === 'bloom') { // Mire Queen: a slow blooming flower of poison, then a second one turned half a petal
        for (let w = 0; w < 2; w++) for (let i = 0; i < 16; i++) q(w * 0.5, e.x, e.y, (i / 16) * TAU2 + w * (Math.PI / 16), 95 + 45 * (1 + Math.sin(i * 4 * TAU2 / 16)) / 2, 2);
      } else if (bossSig === 'bonerain') { // Bone Colossus: bones fall from the top edge in columns around the player, then the columns in between
        for (let w = 0; w < 2; w++) for (let i = -3; i <= 3; i++) q(w * 0.5, Math.max(T * 1.5, Math.min(arena.W - T * 1.5, pl.x + i * 52 + w * 26)), T * 1.4, Math.PI / 2, 150, 1);
      } else if (bossSig === 'souls') { // Lich King: a sweeping fan of souls across the player, then a ring
        MMPatterns2.sweep({ x: e.x, y: e.y }, aim, { count: 7, arc: 1.2, speed: 200, every: 0.08, call: sigN }).forEach((b) => q(b.delay, b.x, b.y, Math.atan2(b.vy, b.vx), Math.hypot(b.vx, b.vy), 0));
        for (let i = 0; i < 10; i++) q(0.9, e.x, e.y, (i / 10) * TAU2, 120, 2);
      }
    }
    function bossExtras(dt) {
      const e = bossEntity(); if (!e || arena.state !== 'play') return;
      if (e.invuln > 0) { slam = null; return; }
      const t = arena.clock;
      slamTick(e, dt);
      if (bossSig) { // BI1: one signature attack per biome boss, announced by a 0.6 s wind-up (MMPatterns2.telegraph) before the shots leave
        if (!sigWind && t >= sigNext) {
          sigWind = Object.assign(MMPatterns2.telegraph(bossSig, { x: e.x, y: e.y }), { duration: SIG_WIND, life: SIG_WIND, at: t + SIG_WIND });
          arena._floatText(e.x, e.y - 44, '!', '#ff4a4a'); arena._burst(e.x, e.y, '#ff4a4a', 10, 150); arena._snd('hit'); api.sigWind = sigWind;
        }
        if (sigWind && t >= sigWind.at) { fireSig(e, t); sigWind = null; sigN++; sigNext = t + (e.phase >= 3 ? 4.2 : 5.2); }
      }
      if (e.phase >= 2 && t >= nextSweep) {
        nextSweep = t + (e.phase === 2 ? 3.4 : 4.2);
        const c = Math.atan2(arena.player.y - e.y, arena.player.x - e.x);
        MMPatterns2.sweep({ x: e.x, y: e.y }, c, { count: 9, arc: 1.5, speed: 210, every: 0.07, call: sweepN++ }).forEach((b) => queue.push({ at: t + b.delay, x: b.x, y: b.y, a: Math.atan2(b.vy, b.vx), s: Math.hypot(b.vx, b.vy), k: 1 }));
      }
      if (e.phase >= 3 && t >= nextWall) {
        nextWall = t + 5.5;
        const edge = ['top', 'left', 'right'][bossRng.int(0, 2)];
        MMPatterns2.wallGap({ x: T, y: T, w: 15 * T, h: 11 * T }, edge, () => bossRng.next(), { speed: 120, spacingTiles: 0.75 }).forEach((b) => queue.push({ at: t, x: b.x, y: b.y, a: Math.atan2(b.vy, b.vx), s: Math.hypot(b.vx, b.vy), k: 2 }));
      }
    }

    // ---------- start-room direction cue ----------
    // In the start room a pulsing arrow marks the door on the shortest regular route to the boss; while the boss route needs a key the
    // player has not found, it points at the route to the Keeper's Nook instead, with 'Find the key'. Code-drawn on the overlay layer.
    const startId = dungeon.rooms.find((r) => r.type === 'start').id;
    function routeDoors(from, to) { // doors of the shortest route over regular (non-cracked) doors, or null
      const prev = { [from]: null }; const q = [from];
      for (let i = 0; i < q.length; i++) {
        const u = q[i]; if (u === to) break;
        dungeon.doors.forEach((d) => { if (d.cracked || (d.a !== u && d.b !== u)) return; const v = d.a === u ? d.b : d.a; if (!(v in prev)) { prev[v] = { u, d }; q.push(v); } });
      }
      if (!(to in prev)) return null;
      const out = []; for (let v = to; prev[v]; v = prev[v].u) out.unshift(prev[v].d);
      return out;
    }
    function cue() {
      if (current !== startId || finished) return null;
      let route = routeDoors(startId, dungeon.bossRoomId); if (!route || !route.length) return null;
      let hint = ''; let target = 'boss';
      const gated = route.some((d) => d.locked && !unlocked[d.id]);
      if (lair && gated && state.keys === 0 && !L[startId].keyTaken) hint = 'Take the key';
      if (gated && state.keys === 0 && dungeon.keyRoomId !== undefined && !L[dungeon.keyRoomId].keyTaken) {
        const kr = routeDoors(startId, dungeon.keyRoomId); if (kr && kr.length) { route = kr; hint = 'Find the key'; target = 'key'; }
      }
      const o = curDoors().find((q) => q.d === route[0]); if (!o) return null;
      return { dir: o.dir, status: o.status, tile: o.tile, hint, target };
    }

    // ---------- mini-map ----------
    const mapEl = document.createElement('canvas'); mapEl.id = 'mm-map'; mapEl.width = 9 * 16 + 8; mapEl.height = 8 * 16 + 8; mapEl.setAttribute('aria-label', 'Dungeon map');
    const mapBtn = document.createElement('button'); mapBtn.id = 'mm-map-btn'; mapBtn.type = 'button'; mapBtn.textContent = '🗺'; mapBtn.setAttribute('aria-label', 'Toggle map (Tab)');
    document.body.appendChild(mapEl); document.body.appendChild(mapBtn);
    api.mapDrawn = [];
    function toggleMap(force) { const hide = force === undefined ? !mapEl.classList.contains('hidden') : !force; mapEl.classList.toggle('hidden', hide); }
    mapBtn.addEventListener('click', () => toggleMap());
    // Tab = map (as before) from the page, the Play stop or the play field; Shift+Tab always moves focus. From the page itself the Tab also
    // reaches the Play stop (a11y sweep: the dungeon had zero tab stops). M toggles the map anywhere (not while typing).
    window.addEventListener('keydown', (e) => {
      if (finished) return;
      const tgt = e.target; const typing = !!(tgt && (tgt.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(tgt.tagName || '')));
      const field = !tgt || tgt === document.body || tgt === document.documentElement; // nothing focused yet
      if (e.key === 'Tab' && !e.shiftKey && (field || (tgt && (tgt.id === 'realm-canvas-wrap' || tgt.id === 'realm-play-focus')))) {
        if (!e.repeat) toggleMap();
        if (!field) e.preventDefault(); // from the page itself the Tab also moves on to the Play stop, so keyboard players are never stuck
      }
      else if ((e.key === 'm' || e.key === 'M') && !typing && !e.ctrlKey && !e.metaKey && !e.altKey) { if (!e.repeat) toggleMap(); }
    }); // once the summary is up Tab goes back to normal focus movement
    function drawMap() {
      const vis = state.visibleRooms(); const g = mapEl.getContext('2d'); const C = 16;
      g.clearRect(0, 0, mapEl.width, mapEl.height); rect(g, 'rgba(8,4,20,0.78)', 0, 0, mapEl.width, mapEl.height);
      const pos = (r) => ({ x: 4 + r.x * C, y: 4 + r.y * C });
      dungeon.doors.forEach((d) => {
        if (vis.indexOf(d.a) < 0 || vis.indexOf(d.b) < 0) return;
        const a = pos(byId[d.a]); const b = pos(byId[d.b]);
        g.strokeStyle = d.cracked ? '#7fd0ff' : '#b9a6f0'; g.lineWidth = 3; g.beginPath(); g.moveTo(a.x + 6, a.y + 6); g.lineTo(b.x + 6, b.y + 6); g.stroke();
        if (d.locked && !unlocked[d.id]) rect(g, '#ffd45a', (a.x + b.x) / 2 + 3, (a.y + b.y) / 2 + 3, 6, 6);
      });
      vis.forEach((id) => {
        const r = byId[id]; const p = pos(r); const seen = state.room(id).visited;
        rect(g, seen ? (r.type === 'combat' ? B.mapCol : MAP_COL[r.type]) : '#3a3358', p.x, p.y, 12, 12);
        if (!seen) { g.fillStyle = '#c9c2e8'; g.font = 'bold 10px system-ui'; g.textAlign = 'center'; g.fillText('?', p.x + 6, p.y + 10); }
        else if (r.type === 'boss') rect(g, '#2a0f0f', p.x + 4, p.y + 4, 4, 4);
        else if (r.type === 'key' && !L[id].keyTaken) rect(g, '#fff', p.x + 5, p.y + 5, 3, 3);
        else if (state.room(id).cleared && r.type === 'combat') rect(g, 'rgba(255,255,255,0.35)', p.x + 4, p.y + 4, 4, 4);
        if (id === current) { g.strokeStyle = '#fff'; g.lineWidth = 2; g.strokeRect(p.x - 1, p.y - 1, 14, 14); }
      });
      api.mapDrawn = vis.slice();
    }

    // ---------- summary overlay ----------
    const sumEl = document.createElement('div'); sumEl.id = 'mm-summary'; sumEl.className = 'hidden'; sumEl.setAttribute('role', 'dialog');
    document.body.appendChild(sumEl);
    function showSummary(died) {
      if (finished) return; finished = true;
      const s = state.exit(); arena.onSave(arena.save);
      let paid = null; if (ST) { try { paid = ST.settle(localStorage, { Profile: MMProfile, realmItems: arena.save.items, shards: Math.max(0, arena.save.shards - shards0), src: 'dungeon', force: true }); } catch (e) { paid = null; } }
      api.stash = paid ? { items: paid.items, stash: paid.stash, hero: paid.hero, waiting: paid.waiting, shards: paid.shards, fame: paid.fame } : null;
      const secs = Math.round(arena.clock); const mm = Math.floor(secs / 60); const ss = String(secs % 60).padStart(2, '0');
      const items = granted.length ? granted.map((it) => `<li style="color:${it.color}">${it.icon} ${it.name} <small>${it.rarName}${it.sold ? ' (sold, pack full)' : ''}</small></li>`).join('') : '<li class="none">no items</li>';
      sumEl.innerHTML = `<div class="mm-sum-card"><h2>${died ? '💀 ' + B.fell : s.bossDefeated ? '🌀 ' + B.clear : '🚪 Left the ' + B.name}</h2>
        <p class="mm-sum-sub">Seed ${String(seed).replace(/[^A-Za-z0-9_-]/g, '').slice(0, 24)} · ${mm}:${ss}</p>
        <ul class="mm-sum-stats"><li>Rooms visited <b>${visitedMain()}/${MAIN_ROOMS}</b></li><li>Rooms cleared <b>${s.roomsCleared}</b></li><li>Chests opened <b>${s.chestsOpened}</b></li><li>Keys found <b>${s.keysFound}</b></li><li>Secret room <b>${s.secretFound ? 'found' : 'hidden'}</b></li><li>${B.boss_name} <b>${s.bossDefeated ? 'defeated' : 'alive'}</b></li><li>Chest gold <b>${s.gold} 💎</b></li></ul>
        <h3>Loot</h3><ul class="mm-sum-loot" id="mm-sum-loot">${items}</ul>${died && arena._lastCache ? `<p class="mm-sum-cache" id="mm-sum-cache">💀 ${String(arena._lastCache).replace(/[<>&"]/g, '').replace(/^cache: /, 'Fall cache: ')}</p>` : ''}${paid && paid.ok ? `<p class="mm-sum-stash" id="mm-sum-stash">🏮 ${ST.text(paid)} (Lantern)</p>` : ''}
        <div class="mm-sum-btns">${backWorld ? '' : `<a class="mm-btn" id="mm-sum-again" href="?mode=dungeon&seed=${Number(baseSeed) + 1 || ''}${layoutV === 2 ? '&lv=2' : ''}${biome !== 'warren' ? '&biome=' + biome : ''}${opts.test ? '&test=1' : ''}${hubExit ? '&from=hub' : ''}">New dungeon</a>`}<a class="mm-btn${backWorld ? '' : ' alt'}" id="mm-sum-home" href="${backWorld || homeHref}">${backWorld ? 'Back to the world' : homeText}</a></div></div>`;
      if (gearGot.length) { // tiered finds: "T7 Name" via textContent
        const ul = sumEl.querySelector('#mm-sum-loot'); const none = ul.querySelector('.none'); if (none) none.remove();
        gearGot.forEach((g) => { const li = document.createElement('li'); li.className = 'mm-sum-gear'; li.style.color = g.color; li.textContent = g.name + ' '; const sm = document.createElement('small'); sm.textContent = g.rarName + (g.sold ? ' (sold, pack full)' : g.waiting ? ' (left on the ground, pack full)' : ''); li.appendChild(sm); ul.appendChild(li); });
      }
      if (MUT || floor > 1) { // DV1: the mutator and the floor on their own rows (textContent)
        const st = sumEl.querySelector('.mm-sum-stats');
        const add = (cls, k, v) => { const li = document.createElement('li'); li.className = cls; li.append(document.createTextNode(k + ' ')); const b = document.createElement('b'); b.textContent = v; li.appendChild(b); st.appendChild(li); };
        if (st && MUT) add('mm-sum-mut', 'Mutator', MUT.label);
        if (st && floor > 1) add('mm-sum-floor', 'Floor', floor + ' of ' + (deepInfo ? deepInfo.maxFloor : 3));
      }
      deepHide();
      sumEl.classList.remove('hidden');
      api.summary = s; api.summaryTitle = sumEl.querySelector('h2').textContent;
      if (died && !backWorld) { // G-24 (b03-13): "Try again (same seed)" on the fall summary; R / pad Back press it
        const row = sumEl.querySelector('.mm-sum-btns');
        if (row && !sumEl.querySelector('#mm-sum-retry')) {
          const a = document.createElement('a'); a.className = 'mm-btn'; a.id = 'mm-sum-retry'; a.textContent = 'Try again (same seed)';
          let q = null; try { q = new URLSearchParams(location.search); } catch (e) { q = null; }
          if (q) { q.set('mode', 'dungeon'); q.set('seed', String(baseSeed)); q.delete('floor'); a.href = 'index.html?' + q.toString(); }
          row.insertBefore(a, row.firstChild); api.retryUrl = a.getAttribute('href');
          try { a.focus({ preventScroll: true }); } catch (e) { /* focus is cosmetic */ }
        }
      }
    }
    function finish() { if (finished) return; deepHide(); arena.stop(); showSummary(false); }
    window.addEventListener('keydown', (e) => { // G-24: R (universal Restart) / Backspace (pad Back) on the fall summary = Try again (same seed)
      if (sumEl.classList.contains('hidden') || e.repeat) return;
      const k = String(e.key || '').toLowerCase(); if (k !== 'r' && k !== 'backspace') return;
      const a = sumEl.querySelector('#mm-sum-retry'); if (!a) return;
      e.preventDefault(); e.stopImmediatePropagation(); api.retryPressed = (api.retryPressed || 0) + 1; if (opts.navigate !== false) a.click();
    }, true);

    // ---------- DV1: mutator chip + deep-run stairs / off-ramp ----------
    // The chip names the run's mutator(s) under the map button (textContent only). After the boss, a calm choice: the stairs down to the next floor
    // of the same biome (gear one tier up, at most floor 3 and T11) or "Leave with your loot" (the summary, as the portal does). No timer, nothing lost:
    // every find is already in the pack, and the Lantern stash is settled before the stairs load the next floor.
    let mutEl = null; let deepEl = null; let stairsArmed = false;
    function mutChip() {
      if (!MUT || mutEl) return;
      mutEl = document.createElement('div'); mutEl.id = 'mm-mut'; mutEl.setAttribute('role', 'note'); mutEl.dataset.mut = MUT.ids.join(',');
      mutEl.textContent = '✦ ' + MUT.label + (floor > 1 ? ' · Floor ' + floor : ''); mutEl.title = MUT.text; mutEl.setAttribute('aria-label', 'Dungeon mutator: ' + MUT.text);
      document.body.appendChild(mutEl);
    }
    const canStairs = () => !!deepInfo && deepInfo.nextStairs && state.boss.dead && !finished;
    function stairsSpot() { const pq = portalSpot(); const s1 = spotPx(freeSpot(L[current].tpl, 4, 8)); return Math.hypot(s1.x - pq.x, s1.y - pq.y) >= 80 ? s1 : spotPx(freeSpot(L[current].tpl, 12, 8)); }
    function deepShow() {
      if (!deepInfo || finished || deepEl) return;
      deepEl = document.createElement('div'); deepEl.id = 'mm-deep'; deepEl.setAttribute('role', 'group'); deepEl.setAttribute('aria-label', 'Deep run');
      const p = document.createElement('p'); p.className = 'mm-deep-txt';
      p.textContent = deepInfo.nextStairs ? 'Floor ' + floor + ' of ' + deepInfo.maxFloor + ' cleared. Stairs lead down to floor ' + (floor + 1) + ', where gear is one tier higher (up to T11). Or leave with your loot.'
        : 'Floor ' + floor + ' of ' + deepInfo.maxFloor + ' cleared. This is the deepest floor. Leave with your loot.';
      const row = document.createElement('div'); row.className = 'mm-deep-btns';
      if (deepInfo.nextStairs) { const d = document.createElement('button'); d.type = 'button'; d.id = 'mm-deep-down'; d.textContent = '⬇ Stairs to floor ' + (floor + 1); d.addEventListener('click', () => takeStairs()); row.appendChild(d); }
      const l = document.createElement('button'); l.type = 'button'; l.id = 'mm-deep-leave'; l.textContent = 'Leave with your loot'; l.addEventListener('click', () => finish()); row.appendChild(l);
      deepEl.append(p, row); document.body.appendChild(deepEl);
    }
    function deepHide() { if (deepEl) { deepEl.remove(); deepEl = null; } }
    function takeStairs() {
      if (!canStairs()) return null;
      finished = true; deepHide(); arena.onSave(arena.save);
      if (ST) { try { ST.settle(localStorage, { Profile: MMProfile, realmItems: arena.save.items, shards: Math.max(0, arena.save.shards - shards0), src: 'dungeon', force: true }); } catch (e) { /* storage blocked */ } }
      let q = null; try { q = new URLSearchParams(location.search); } catch (e) { q = null; }
      if (!q) return null;
      q.set('mode', 'dungeon'); q.set('seed', baseSeed); q.set('biome', biome); q.set('lv', '2'); q.set('floor', String(floor + 1));
      const url = 'index.html?' + q.toString(); api.lastStairsUrl = url;
      arena.stop(); if (opts.navigate !== false) location.href = url;
      return url;
    }
    // Dim: one cached vignette canvas (drawn once), blitted around the hero each frame
    let dimCv = null;
    function dimDraw(g) {
      if (!MUT || !(MUT.fx.view < 1)) return;
      const W = arena.W, H = arena.H;
      if (!dimCv) dimCv = mk(W * 2, H * 2, (c) => { const r0 = 300 * MUT.fx.view; const gr = c.createRadialGradient(W, H, r0 * 0.55, W, H, r0 + 90); gr.addColorStop(0, 'rgba(4,2,12,0)'); gr.addColorStop(1, 'rgba(4,2,12,0.62)'); c.fillStyle = gr; c.fillRect(0, 0, W * 2, H * 2); });
      g.drawImage(dimCv, Math.round(arena.player.x - W), Math.round(arena.player.y - H)); api.dimDraws = (api.dimDraws || 0) + 1;
    }
    let stairsCv = null;
    function stairsImg() {
      if (stairsCv) return stairsCv;
      stairsCv = mk(40, 40, (g) => { rect(g, '#120a22', 2, 2, 36, 36); for (let i = 0; i < 5; i++) { rect(g, '#6b5aa8', 4 + i * 3, 6 + i * 6, 32 - i * 6, 4); rect(g, '#a98bff', 4 + i * 3, 6 + i * 6, 32 - i * 6, 1); } rect(g, '#ffd45a', 2, 2, 36, 2); });
      return stairsCv;
    }

    // ---------- the controller the arena calls ----------
    const ctrl = {
      onStart() {
        arena._hideBanner(); clearTimeout(arena._bannerTimer);
        arena.state = 'play'; arena.run.wave = 0; arena.biome = 0;
        const res = state.enter(dungeon.rooms.find((r) => r.type === 'start').id);
        loadRoom(res.ok ? state.current : 0, null);
        arena._showBanner(floorClamped ? `Floor ${floorWant} opens after you clear floor ${floor0}: starting on floor ${floor0}` : floor > 1 ? `${B.name} #${baseSeed} · Floor ${floor}` : MUT ? `${B.name} #${seed} · ${MUT.label}` : `${B.name} #${seed}`, floorClamped ? 3 : 1.8); // G-25
        mutChip();
        drawMap();
      },
      onBoltWall(x, y) {
        if (current === null) return;
        const tx = Math.floor(x / T); const ty = Math.floor(y / T);
        const o = curDoors().find((q) => q.status === 'cracked' && q.tile.x === tx && q.tile.y === ty); if (!o) return;
        const res = state.hitCrackedWall();
        arena._burst((tx + 0.5) * T, (ty + 0.5) * T, '#c9b6ff', 6, 140); arena.shake = Math.max(arena.shake, 3);
        arena._floatText((tx + 0.5) * T, ty * T, res.open ? 'The wall crumbles!' : `crack ${res.hits}/${MMDungeonState.SECRET_HITS}`, '#e8d8ff');
        mapSig = '';
      },
      hitBoss,
      onKill(e) {
        if (e.dg !== 'mob' || current === null) return;
        const before = state.room(current).enemiesAlive; if (before <= 0) return;
        const left = state.killEnemy();
        if (e.did === 'sprout') MMEnemies.onDeath({ id: 'sprout', x: 0, y: 0 }).forEach((m, i) => spawnMob('aimed', m.id, e.x + (i ? 16 : -16), e.y, Math.max(2, Math.ceil(m.hp / HP_DIV)), false, SC && current !== null ? L[current].sc : null));
        if (left === 0) ctrl.cleared(e.x, e.y);
      },
      cleared(kx, ky) {
        arena.player.hp = Math.min(arena.stats.maxHp, arena.player.hp + Math.round(arena.stats.maxHp * 0.15)); if (arena.fxHeal) arena.fxHeal();
        arena._showBanner('Room cleared!', 1.4); arena.eBullets.forEach((b) => { if (b.active) { b.active = false; arena._burst(b.x, b.y, '#8fe9ff', 1, 40); } });
        if (current !== null && byId[current].type !== 'boss') { const q = typeof kx === 'number' ? { x: kx, y: ky } : { x: arena.player.x, y: arena.player.y }; dropClearPickups(current, q.x, q.y); if (gearOn) dropClearGear(current, q.x, q.y); }
        arena._syncHud(); mapSig = '';
      },
      tick(dt) {
        if (finished || current === null) return;
        const p = arena.player; const rs = state.room(current);
        if (doorSig() !== sig) refreshWalls();
        // keep mobs out of walls (they would be unhittable inside them)
        for (let i = 0; i < arena.enemies.length; i++) {
          const e = arena.enemies[i]; if (!e.active || e.dg !== 'mob') continue;
          if (arena._blocked(e.x, e.y, 6)) { if (e.lx !== undefined) { e.x = e.lx; e.y = e.ly; } } else { e.lx = e.x; e.ly = e.y; }
        }
        // scheduled boss bullets
        if (queue.length) { const now = arena.clock; queue = queue.filter((q) => { if (q.at > now) return true; arena.fireEnemyBullet(q.x, q.y, q.a, q.s, q.k); return false; }); }
        bossExtras(dt);
        // G-24 (b03-02) corner-slip: pushing toward an open door up to 14 px off its centre line slides the hero onto the line (no wiggling)
        if (!state.doorsClosed()) {
          const k = arena.keys || {}; const mv = arena.moveVec || { x: 0, y: 0 };
          const ix = (k.d || k.arrowright ? 1 : 0) - (k.a || k.arrowleft ? 1 : 0) + (mv.x || 0), iy = (k.s || k.arrowdown ? 1 : 0) - (k.w || k.arrowup ? 1 : 0) + (mv.y || 0);
          for (const o of curDoors()) {
            if (o.status !== 'open') continue;
            const cx = (o.tile.x + 0.5) * T; const cy = (o.tile.y + 0.5) * T; const ax = cx - p.x, ay = cy - p.y;
            const horiz = Math.abs(ax) >= Math.abs(ay); const along = horiz ? ax : ay, off = horiz ? ay : ax, push = horiz ? ix : iy;
            if (Math.abs(along) > T * 1.4 || Math.abs(off) < 0.5 || Math.abs(off) > 14 || !(push * along > 0.2)) continue;
            const st = Math.sign(off) * Math.min(Math.abs(off), 120 * dt); const nx = horiz ? p.x : p.x + st, ny = horiz ? p.y + st : p.y;
            if (!arena._blocked(nx, ny, RM_PLAYER.r)) { p.x = nx; p.y = ny; }
            break;
          }
        }
        // doors: walking into an open door, or bumping a locked one
        const sealed = state.doorsClosed();
        if (!sealed) for (const o of curDoors()) {
          const cx = (o.tile.x + 0.5) * T; const cy = (o.tile.y + 0.5) * T; const d = Math.hypot(p.x - cx, p.y - cy);
          if (o.status === 'open' && d < 22) { tryEnter(o.other); break; }
          if (o.status === 'locked' && d < 36) {
            if (state.keys > 0) { tryEnter(o.other); break; }
            if (arena.clock - lockMsgAt > 1.5) { lockMsgAt = arena.clock; arena._floatText(cx, cy - 26, 'Locked — find the key', '#ffd45a'); }
          }
        }
        if (current === null || finished) return;
        pickTick(dt);
        // pick-ups
        const near = (s, r) => Math.hypot(p.x - s.x, p.y - s.y) < r;
        if (hasKey() && !state.doorsClosed() && near(keySpot(), 26)) { L[current].keyTaken = true; keyFound = state.pickKey(); arena._snd('pickup'); arena._floatText(p.x, p.y - 30, '🗝 Key!', '#ffd45a'); mapSig = ''; }
        if (hasChest() && !rs.chestOpen && !state.doorsClosed() && near(chestSpot(), 30)) openChest();
        if (hasPortal() && near(portalSpot(), 30)) { finish(); return; }
        if (hasPortal() && canStairs()) { const sq = stairsSpot(); if (!near(sq, 70)) stairsArmed = true; else if (stairsArmed && near(sq, 26)) { takeStairs(); return; } }
        // HUD text (the arena rewrites it from time to time)
        const txt = `${B.name} · Room ${visitedMain()}/${MAIN_ROOMS} · 🗝 ${state.keys}${state.room(current).enemiesAlive > 0 && byId[current].type !== 'boss' ? ` · ${state.room(current).enemiesAlive} left` : ''}`;
        if (txt !== hudText) { hudText = txt; }
        const w = document.getElementById('realm-wave'); if (w && w.textContent !== hudText) w.textContent = hudText;
        const b = document.getElementById('realm-biome'); const bn = window.innerWidth < 600 ? '' : palOf(byId[current].type).name; if (b && b.textContent !== bn) b.textContent = bn;
        const be = bossEntity(); if (be) { const n = document.getElementById('realm-boss-name'); const nt = `${B.boss_name} · phase ${be.phase}`; if (n && n.textContent !== nt) n.textContent = nt; }
        const ms = current + '|' + state.visibleRooms().join(',') + '|' + state.keys + '|' + state.secretOpen + '|' + rs.cleared;
        if (ms !== mapSig) { mapSig = ms; drawMap(); }
      },
      // ---- drawing ----
      drawUnder(g) {
        if (current === null) return;
        bakeIfNeeded(current);
        const useT = L[current].tileN > 0 && !!tiles;
        const sm = g.imageSmoothingEnabled; if (useT) g.imageSmoothingEnabled = false;
        g.drawImage(L[current].baked, 0, 0);
        const pal = palOf(byId[current].type); const tt = performance.now() / 1000;
        const dimg = (name) => (useT ? tiles.img(name) : null);
        const first = (name) => (useT ? tiles.variants(name)[0] || null : null);
        const art = [];
        curDoors().forEach((o) => {
          const x = o.tile.x * T; const y = o.tile.y * T; let used = null;
          if (o.status === 'open') {
            const fl = first(biome + '_floor'); const op = dimg(biome + '_door_open');
            if (fl && op) { g.drawImage(fl, 0, 0, 32, 32, x, y, T, T); g.drawImage(op, 0, 0, 32, 32, x, y, T, T); used = 'door_open'; }
            else { rect(g, pal.f[0], x, y, T, T); rect(g, 'rgba(255,255,255,0.12)', x, y, T, T); }
          } else if (o.status === 'sealed') {
            const cl = dimg(biome + '_door_closed');
            if (cl) { g.drawImage(cl, 0, 0, 32, 32, x, y, T, T); used = 'door_closed'; } else g.drawImage(S.doorSealed, x, y);
            g.globalAlpha = 0.25 + 0.15 * Math.sin(tt * 5); rect(g, '#ff2244', x, y, T, T); g.globalAlpha = 1;
          } else if (o.status === 'locked') {
            const kd = dimg('key_door');
            if (kd) { g.drawImage(kd, 0, 0, 32, 32, x, y, T, T); used = 'key_door'; } else g.drawImage(S.doorLocked, x, y);
          } else g.drawImage(S.crack[Math.min(2, state.secretHits)], x, y);
          art.push({ dir: o.dir, status: o.status, art: used });
        });
        lastDoorArt = art;
        if (useT && L[current].torches.length) { // torch flames: one drawImage each from the cached 4-frame strip, ~4 fps (frame 0 under reduced motion)
          const ts = dimg(biome + '_torch'); const fr = arena._reduced ? 0 : Math.floor(tt * 4) & 3;
          if (ts) L[current].torches.forEach((q) => g.drawImage(ts, fr * 32, 0, 32, 32, q.x * T, q.y * T, T, T));
        }
        drawPicks(g);
        if (hasKey()) { const k = keySpot(); g.drawImage(S.key, k.x - 11, k.y - 11 + Math.sin(tt * 3) * 3); }
        if (hasChest()) { const c = chestSpot(); const open = state.room(current).chestOpen; const ci = dimg(open ? 'chest_open' : 'chest_closed'); if (ci) g.drawImage(ci, 0, 0, 32, 32, c.x - 18, c.y - 20, 36, 36); else g.drawImage(S.chest[open ? 1 : 0], c.x - 16, c.y - 14); }
        if (hasPortal() && canStairs()) { const sq = stairsSpot(); g.drawImage(stairsImg(), sq.x - 20, sq.y - 20); }
        if (hasPortal()) { const q = portalSpot(); g.save(); g.translate(q.x, q.y); g.rotate(tt * 1.2); g.drawImage(S.portal, -36, -36); g.rotate(-tt * 2.4); g.globalAlpha = 0.6; g.drawImage(S.portal, -26, -26, 52, 52); g.restore(); g.globalAlpha = 1; }
        if (useT) g.imageSmoothingEnabled = sm;
      },
      drawOver(g) {
        if (slam && slam.w > 0) { const be = bossEntity(); if (be) { const look = typeof MMTelegraph !== 'undefined' ? MMTelegraph.forVolley('ring', 3, true, { reduced: !!arena._reduced, palette: arena.acc ? arena.acc.palette : 'normal' }) : null; MMSplash.drawSlam(g, be.x, be.y, MMSplash.slamR(2), 1 - slam.w / MMSplash.SLAM.WIND, !!arena._reduced, look ? look.color : null); } }
        if (B.tint) { g.fillStyle = B.tint; g.fillRect(0, 0, arena.W, arena.H); }
        if (MUT) dimDraw(g);
        if (B.particles && current !== null) { // seeded drift: positions come from a table made with MMRng, only the clock moves them
          const P = B.particles; const tt = arena._reduced ? 0 : performance.now() / 1000; g.fillStyle = P.color; const ga = g.globalAlpha; g.globalAlpha = 0.5;
          for (let i = 0; i < ambient.length; i++) {
            const q = ambient[i]; const x = ((q.x + tt * q.v * 14 * P.dir) % arena.W + arena.W) % arena.W; const y = ((q.y + tt * q.v * 9 + Math.sin(tt * q.v + q.ph) * 14) % arena.H + arena.H) % arena.H;
            g.fillRect(Math.round(x), Math.round(y), q.sz, q.sz);
          }
          g.globalAlpha = ga;
        }
        const cu = cue();
        if (cu) { // pulsing arrow just inside the door (static with reduced motion), pointing at it
          const still = !!arena._reduced; const tt = still ? 0 : performance.now() / 1000; const v = DV[cu.dir]; const pulse = still ? 0 : Math.sin(tt * 4);
          const cx = (cu.tile.x + 0.5) * T; const cy = (cu.tile.y + 0.5) * T; const d = T * 1.05 - pulse * 5; const ax = cx - v[0] * d; const ay = cy - v[1] * d;
          g.save(); g.globalAlpha = still ? 1 : 0.9 + 0.1 * pulse;
          g.fillStyle = 'rgba(255,212,90,0.28)'; g.fillRect(cu.tile.x * T, cu.tile.y * T, T, T); // door glow
          g.translate(ax, ay); g.rotate(Math.atan2(v[1], v[0]));
          g.fillStyle = '#ffd45a'; g.strokeStyle = '#2a1d44'; g.lineWidth = 3; g.beginPath(); g.moveTo(17, 0); g.lineTo(-9, -15); g.lineTo(-9, 15); g.closePath(); g.stroke(); g.fill();
          g.restore();
          // phone dungeon view (realm.js arena._dv): the room pans sideways, so a door outside the slice gets a gold arrow on the slice edge
          const dvw = arena._dv ? arena._dv.vw : 0; const cx0 = arena.camera ? arena.camera.x : 0;
          if (dvw && (cx < cx0 || cx > cx0 + dvw)) {
            const right = cx > cx0 + dvw; const ex = right ? cx0 + dvw - 22 : cx0 + 22; const ey = Math.max(30, Math.min(arena.H - 30, cy));
            g.save(); g.translate(ex, ey); if (!right) g.scale(-1, 1);
            g.fillStyle = '#ffd45a'; g.strokeStyle = '#2a1d44'; g.lineWidth = 3; g.beginPath(); g.moveTo(14, 0); g.lineTo(-8, -13); g.lineTo(-8, 13); g.closePath(); g.stroke(); g.fill();
            g.restore();
          }
          if (cu.hint) {
            g.save(); g.font = 'bold 15px system-ui, sans-serif'; g.textAlign = 'center'; g.lineWidth = 4; g.strokeStyle = '#120a22'; g.fillStyle = '#ffd45a';
            const tx = dvw ? Math.max(cx0 + 70, Math.min(cx0 + dvw - 70, ax)) : Math.max(70, Math.min(arena.W - 70, ax)); const ty = Math.max(24, Math.min(arena.H - 16, ay + (cu.dir === 'N' ? 34 : cu.dir === 'S' ? -26 : 4)));
            g.strokeText(cu.hint, tx, ty); g.fillText(cu.hint, tx, ty); g.restore();
          }
        }
        for (let i = 0; i < arena.enemies.length; i++) {
          const e = arena.enemies[i]; if (!e.active || !e.elite) continue;
          g.fillStyle = '#ffd45a'; const y = e.y - 26; g.beginPath(); g.moveTo(e.x - 8, y + 8); g.lineTo(e.x - 8, y); g.lineTo(e.x - 4, y + 4); g.lineTo(e.x, y - 2); g.lineTo(e.x + 4, y + 4); g.lineTo(e.x + 8, y); g.lineTo(e.x + 8, y + 8); g.closePath(); g.fill();
        }
      },
      onDeath() { showSummary(true); },
    };

    // ---------- test hook helpers ----------
    Object.assign(api, {
      setTileArt,
      tileArt: () => dungeon.rooms.reduce((n, r) => n + (L[r.id].baked ? L[r.id].tileN || 0 : 0), 0), // art tiles baked into the cached rooms so far (0 = code-drawn)
      doorArt: () => lastDoorArt.slice(),
      torchCount: () => (current !== null && L[current].torches ? L[current].torches.length : 0),
      roomHash: (id) => { bakeIfNeeded(id); const c = L[id].baked; const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data; let h = 2166136261; for (let i = 0; i < d.length; i += 4) { h = Math.imul(h ^ d[i] ^ (d[i + 1] << 8) ^ (d[i + 2] << 16), 16777619); } return h >>> 0; },
      doors: () => curDoors().map((o) => ({ dir: o.dir, other: o.other, status: o.status, tile: o.tile })),
      enter: (id) => tryEnter(id),
      mobs: () => arena.enemies.filter((e) => e.active && e.dg === 'mob').length,
      clearRoom() { // kill every mob in the room as if the player had
        arena.enemies.forEach((e) => { if (e.active && e.dg === 'mob') e.active = false; });
        while (current !== null && state.room(current).enemiesAlive > 0 && byId[current].type !== 'boss') { if (state.killEnemy() === 0) { ctrl.cleared(); break; } }
      },
      keyPos: () => (hasKey() ? keySpot() : null),
      chestPos: () => (hasChest() ? chestSpot() : null),
      portalPos: () => (hasPortal() ? portalSpot() : null),
      crackTile: () => { const o = curDoors().find((q) => q.status === 'cracked'); return o ? o.tile : null; },
      boltWall: (x, y) => ctrl.onBoltWall(x, y),
      boss: () => bossEntity(),
      slam: { on: SLAM_ON, wind: () => (slam && slam.w > 0 ? { left: slam.w, total: MMSplash.SLAM.WIND } : null), hits: () => slamHits, winds: () => slamWinds, r: () => MMSplash.slamR(2) },
      finish, takeStairs, canStairs, stairsPos: () => (hasPortal() && canStairs() ? stairsSpot() : null),
      scaleFor: (id) => L[id].sc, depthOf: (id) => depth[id], maxDepth, diffOn: !!DIFF, mobsInfo: () => arena.enemies.filter((e) => e.active && e.dg).map((e) => ({ dg: e.dg, hp: e.maxHp, dmg: e.dmgMul, spd: e.spdMul })),
      layout: (id) => ({ tpl: L[id].tpl.id, plan: L[id].plan.length, count: counts[id], tight: !!L[id].tpl.tight }),
      // narrow-profile stats: per room (long side of the largest empty rectangle, mean corridor width) + the floor averages
      narrowStats: () => {
        const rows = dungeon.rooms.map((r) => { const st = MMRooms.templateStats(L[r.id].tpl); return { id: r.id, type: r.type, tpl: L[r.id].tpl.id, long: st.long, short: st.short, width: st.width, tight: !!L[r.id].tpl.tight, narrow: MMRooms.isNarrow(L[r.id].tpl.id), shooters: L[r.id].plan.length }; });
        const body = rows.filter((q) => q.type !== 'boss');
        const avg = (a, k) => (a.length ? a.reduce((n, q) => n + q[k], 0) / a.length : 0);
        return { on: narrowOn, rooms: rows, avgLong: avg(body, 'long'), avgWidth: avg(body, 'width'), narrowCount: rows.filter((q) => q.narrow).length, big: rows.filter((q) => !q.narrow && q.type !== 'boss').length };
      },
      // BFS over the CURRENT room's wall grid between two tiles (door tiles are open only when the door is); null = no route
      path: (a, b) => {
        if (current === null) return null; const g = wallRows(); const key = (x, y) => x + ',' + y; const prev = { [key(a.x, a.y)]: null }; const q = [a];
        for (let i = 0; i < q.length; i++) {
          const c = q[i]; if (c.x === b.x && c.y === b.y) { const out = []; for (let k = key(c.x, c.y); k; ) { const [x, y] = k.split(',').map(Number); out.unshift({ x, y }); k = prev[k]; } return out; }
          [[1, 0], [-1, 0], [0, 1], [0, -1]].forEach(([dx, dy]) => { const x = c.x + dx, y = c.y + dy; if (y < 0 || x < 0 || y >= g.length || x >= g[0].length || g[y][x] === '#' || (key(x, y) in prev)) return; prev[key(x, y)] = key(c.x, c.y); q.push({ x, y }); });
        }
        return null;
      },
      // test hook: put the player on a tile centre; true when the hero circle fits there (not inside a wall)
      teleport: (tx, ty) => { if (current !== null && sig !== doorSig()) refreshWalls(); const p = arena.player; p.x = (tx + 0.5) * T; p.y = (ty + 0.5) * T; return !arena._blocked(p.x, p.y, RM_PLAYER.r); },
      cue,
      roomCount: () => ({ visited: visitedMain(), total: MAIN_ROOMS }),
      toggleMap,
      mapVisible: () => !mapEl.classList.contains('hidden'),
    });
    Object.defineProperties(api, { room: { get: () => current }, finished: { get: () => finished } });
    ctrl.api = api;
    arena.dungeon = ctrl;
    // The arena picks an enemy bullet's art in _ebSelect (realm.js has no per-boss override): this instance-level wrapper answers for the dungeon boss's own
    // bolts (and the bullets this controller queues, fired with no enemy set) and leaves every mob's bullet art to the arena.
    if (bossBolt && typeof arena._ebSelect === 'function' && !arena._dgEbWrapped) {
      const baseSel = arena._ebSelect.bind(arena); arena._dgEbWrapped = true;
      arena._ebSelect = function (kind) { const e = this._curE; if ((!e || e.dg === 'boss') && this._boltArt && this._boltArt.has(bossBolt)) return bossBolt; return baseSel(kind); };
    }
    arena.fixedWorld = { w: MMRooms.W * T, h: MMRooms.H * T };
    return ctrl;
  }

  window.MMDungeonRun = { create };
})();
