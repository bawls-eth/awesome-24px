// Mad Maze Warren dungeon run (Day 2). A controller that plugs into RealmArena through its additive hooks
// (arena.dungeon / arena.fixedWorld): MMWarren builds the room graph, MMRooms the rooms, MMEnemies plans the
// encounters, MMDungeonState owns doors / keys / chests / secret / boss. Procedural art only, no network.
// Needs: MMRng, MMWarren, MMRooms, MMEnemies, MMDungeonState, MMPatterns2 and realm.js (RM_* globals).
(function () {
  'use strict';
  const T = 40; // RM_TILE
  const OPP = { N: 'S', S: 'N', E: 'W', W: 'E' };
  const DV = { N: [0, -1], E: [1, 0], S: [0, 1], W: [-1, 0] };
  // Bramble enemies reuse the arena's three attack patterns (spiral / aimed / ring).
  const ENEMY_MAP = { puffcap: 'ring', beetle: 'aimed', archer: 'aimed', moth: 'spiral', sprout: 'ring' };
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

  function create(arena, opts) {
    opts = opts || {};
    const hubExit = opts.home === '../../hub/index.html'; // set only by mad-maze.js from an exact ?from=hub
    // set only by mad-maze.js from a regex-checked ?return= (a Realm World portal): the exit goes back to that portal tile
    const backWorld = typeof opts.returnTo === 'string' && /^index\.html\?mode=world&seed=[A-Za-z0-9_-]{1,24}&at=\d{1,4},\d{1,4}(&test=1)?$/.test(opts.returnTo) ? opts.returnTo : null;
    const seed = String(opts.seed === undefined ? '1' : opts.seed);
    const biome = MMBiomes.clean(opts.biome); const B = MMBiomes.get(biome); // unknown / missing biome -> warren
    const layoutV = opts.layout === 2 || biome !== 'warren' ? 2 : 1; // a biome run is new content: it always uses the layout-2 pool
    const palCache = {};
    function palOf(type) { // warren: the original palette untouched; other biomes recolour start / normal / boss rooms, the coded rooms (key, treasure, secret) keep theirs
      if (palCache[type]) return palCache[type];
      const base = PAL[type] || PAL.combat; const o = biome === 'warren' ? null : type === 'start' ? B.start : type === 'combat' ? B.normal : type === 'boss' ? B.boss : null;
      const nm = biome === 'warren' ? base.name : type === 'start' ? B.name + ' Gate' : type === 'combat' ? B.room : type === 'boss' ? B.boss_room : base.name;
      palCache[type] = o ? { f: o.f, w: o.w, hi: o.hi, name: nm } : base; return palCache[type];
    } // 1 = original room selection (old seeds/links), 2 = variety pool (new runs only)
    const dungeon = MMWarren.generate(seed, { layout: layoutV });
    const picks = MMRooms.select(dungeon, seed, layoutV, biome);
    const rngRun = MMRng.create('run:' + seed);
    const lootRng = MMRng.create('loot:' + seed);
    const bossRng = MMRng.create('boss:' + seed);
    const S = bakeShared();
    const ambient = []; if (B.particles) { const ar = MMRng.create('amb:' + biome + ':' + seed); for (let i = 0; i < B.particles.n; i++) ambient.push({ x: ar.int(0, MMRooms.W * T), y: ar.int(0, MMRooms.H * T), v: 0.6 + ar.next(), ph: ar.next() * 6.28, sz: ar.int(2, 4) }); }
    document.body.dataset.dungeonBiome = biome;
    const byId = {}; dungeon.rooms.forEach((r) => { byId[r.id] = r; });
    const ROOMS = dungeon.rooms.length;

    // depth from the start over the regular doors, for the encounter tier
    const depth = {}; depth[dungeon.rooms.find((r) => r.type === 'start').id] = 0;
    for (let guard = 0; guard < 20; guard++) dungeon.doors.forEach((d) => {
      if (d.cracked) return;
      if (depth[d.a] !== undefined && depth[d.b] === undefined) depth[d.b] = depth[d.a] + 1;
      if (depth[d.b] !== undefined && depth[d.a] === undefined) depth[d.a] = depth[d.b] + 1;
    });

    // ---- per-room layout: template, plan, counts ----
    const L = {}; const counts = {};
    dungeon.rooms.forEach((r) => {
      const tplDef = picks.defs[r.id];
      const tpl = MMRooms.parse(tplDef);
      let plan = [];
      if (r.type === 'combat' || r.type === 'key') plan = MMEnemies.plan(seed + ':' + r.id, Math.max(1, depth[r.id] || 1), tpl.spawns.map((s) => ({ x: s.x, y: s.y })), null, biome === 'warren' ? undefined : B.ids).enemies;
      const extra = plan.reduce((n, e) => n + (e.id === 'sprout' ? 2 : 0), 0); // each Sprout leaves two minis behind
      counts[r.id] = r.type === 'boss' ? 1 : plan.length + extra;
      L[r.id] = { tpl, plan, baked: null, spawned: false, keyTaken: false };
    });
    const state = MMDungeonState.create(dungeon, rngRun, { enemies: counts, bossHp: opts.bossHp || 260 });

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
    let lockMsgAt = -9; let hudText = ''; let queue = []; let nextSweep = 0; let nextWall = 0; let sweepN = 0;
    const api = { seed, biome, layoutVersion: layoutV, graph: dungeon, state, arena, granted };

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

    // ---------- rooms ----------
    const spotPx = (s) => ({ x: (s.x + 0.5) * T, y: (s.y + 0.5) * T });
    function keySpot() { return spotPx(freeSpot(L[current].tpl, 8, 6)); }
    function chestSpot() { return spotPx(freeSpot(L[current].tpl, 8, 6)); }
    function portalSpot() { return spotPx(freeSpot(L[current].tpl, 8, 8)); }
    const hasChest = () => current !== null && (byId[current].type === 'treasure' || byId[current].type === 'secret');
    const hasKey = () => current !== null && byId[current].type === 'key' && !L[current].keyTaken;
    const hasPortal = () => current !== null && byId[current].type === 'boss' && state.boss.dead;

    function spawnMob(type, id, x, y, hp, elite) {
      const e = arena.spawnEnemy(type, x, y); if (!e) return null;
      e.dg = 'mob'; e.did = id; e.art = B.skin[id] || (id === 'sprout_mini' ? B.skin.sprout : null) || null; e.elite = !!elite; e.maxHp = hp; e.hp = hp; e.lx = x; e.ly = y;
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
        spawnMob(ENEMY_MAP[p.id], p.id, px.x, px.y, Math.max(3, Math.ceil(p.hp / HP_DIV)), p.elite);
      });
    }
    function spawnBoss() {
      const e = arena.spawnEnemy('boss', arena.W / 2, 132); if (!e) return;
      e.dg = 'boss'; e.maxHp = state.boss.maxHp; e.hp = state.boss.hp; e.phase = state.boss.phase; e.invuln = 1.2; e.cd = 1.2; e.cd2 = 2.4; e.angle = 0;
      arena.bossT0 = arena.clock; e.bossArt = B.boss_art; arena._syncBoss(); nextSweep = arena.clock + 4; nextWall = arena.clock + 6;
    }

    function clearTransient() {
      [arena.pBullets, arena.eBullets, arena.bags, arena.drifters].forEach((pool) => pool.forEach((o) => { o.active = false; }));
      queue = [];
    }
    function loadRoom(id, travel) {
      current = id;
      const lay = L[id]; const r = byId[id];
      if (!lay.baked) lay.baked = bakeRoom(id, lay.tpl, palOf(r.type), seed);
      clearTransient();
      arena.biome = r.type === 'boss' ? 1 : r.type === 'treasure' ? 2 : 0;
      const p = arena.player; let entry = { x: 8, y: 6 };
      if (travel) { const dt = MMRooms.DOORS[OPP[travel]]; entry = { x: dt.x + DV[travel][0], y: dt.y + DV[travel][1] }; p.x = (entry.x + 0.5) * T; p.y = (entry.y + 0.5) * T; p.iframes = Math.max(p.iframes, 1); }
      else { p.x = arena.W / 2; p.y = arena.H / 2; }
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

    // ---------- loot ----------
    function grantItem(slot, tier) {
      const ids = SLOT_ITEMS[slot] || SLOT_ITEMS.trinket; const id = lootRng.pick(ids); const rar = Math.max(0, Math.min(2, tier - 1));
      const full = arena.save.items.length >= RM_BACKPACK;
      arena.collectItem(id, rar);
      const def = RM_ITEM_BY_ID[id];
      granted.push({ id, rarity: rar, name: def.name, icon: def.icon, rarName: RM_RARITIES[rar].name, color: RM_RARITIES[rar].color, sold: full });
      return granted[granted.length - 1];
    }
    function openChest() {
      const l = state.openChest(); if (!l) return null;
      arena._snd('levelup');
      if (l.kind === 'gold') { arena.save.shards += l.amount; arena._floatText(arena.player.x, arena.player.y - 44, `+${l.amount} 💎`, '#8fe9ff'); arena.onSave(arena.save); grantItem('trinket', 1); }
      else grantItem(l.slot, l.tier);
      arena._burst(arena.player.x, arena.player.y, '#ffd45a', 22, 240);
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
        nextSweep = arena.clock + 2.5; nextWall = arena.clock + 5;
      }
      if (r.dead) {
        e.active = false; state.killEnemy();
        arena.eBullets.forEach((b) => { if (b.active) { b.active = false; arena._burst(b.x, b.y, '#ffe27a', 1, 60); } });
        arena._burst(e.x, e.y, '#ff6a4a', 40, 340); arena._burst(e.x, e.y, '#ffe27a', 30, 260); arena.shake = 14;
        arena.save.shards += 60; arena.save.kills += 1; arena.save.kb.boss += 1; arena._floatText(e.x, e.y - 30, '+60 💎', '#8fe9ff');
        arena._gainXp(Math.round(RM_XP.boss * arena.stats.xp));
        arena.dropBag(e.x - 20, e.y + 20, 2); arena.dropBag(e.x + 20, e.y + 20, arena.rollRarity());
        arena._showBanner(B.boss_name + ' defeated! The portal opens.', 2.6);
        arena.onSave(arena.save); mapSig = '';
      }
      arena._syncBoss();
    }
    function bossExtras() {
      const e = bossEntity(); if (!e || e.invuln > 0 || arena.state !== 'play') return;
      const t = arena.clock;
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

    // ---------- mini-map ----------
    const mapEl = document.createElement('canvas'); mapEl.id = 'mm-map'; mapEl.width = 9 * 16 + 8; mapEl.height = 8 * 16 + 8; mapEl.setAttribute('aria-label', 'Dungeon map');
    const mapBtn = document.createElement('button'); mapBtn.id = 'mm-map-btn'; mapBtn.type = 'button'; mapBtn.textContent = '🗺'; mapBtn.setAttribute('aria-label', 'Toggle map (Tab)');
    document.body.appendChild(mapEl); document.body.appendChild(mapBtn);
    api.mapDrawn = [];
    function toggleMap(force) { const hide = force === undefined ? !mapEl.classList.contains('hidden') : !force; mapEl.classList.toggle('hidden', hide); }
    mapBtn.addEventListener('click', () => toggleMap());
    window.addEventListener('keydown', (e) => { if (e.key === 'Tab' && !finished) { e.preventDefault(); if (!e.repeat) toggleMap(); } }); // once the summary is up Tab goes back to normal focus movement
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
      const secs = Math.round(arena.clock); const mm = Math.floor(secs / 60); const ss = String(secs % 60).padStart(2, '0');
      const items = granted.length ? granted.map((it) => `<li style="color:${it.color}">${it.icon} ${it.name} <small>${it.rarName}${it.sold ? ' (sold, pack full)' : ''}</small></li>`).join('') : '<li class="none">no items</li>';
      sumEl.innerHTML = `<div class="mm-sum-card"><h2>${died ? '💀 ' + B.fell : '🌀 ' + B.clear}</h2>
        <p class="mm-sum-sub">Seed ${String(seed).replace(/[^A-Za-z0-9_-]/g, '').slice(0, 24)} · ${mm}:${ss}</p>
        <ul class="mm-sum-stats"><li>Rooms visited <b>${s.roomsVisited}/${ROOMS}</b></li><li>Rooms cleared <b>${s.roomsCleared}</b></li><li>Chests opened <b>${s.chestsOpened}</b></li><li>Keys found <b>${s.keysFound}</b></li><li>Secret room <b>${s.secretFound ? 'found' : 'hidden'}</b></li><li>${B.boss_name} <b>${s.bossDefeated ? 'defeated' : 'alive'}</b></li><li>Chest gold <b>${s.gold} 💎</b></li></ul>
        <h3>Loot</h3><ul class="mm-sum-loot" id="mm-sum-loot">${items}</ul>
        <div class="mm-sum-btns">${backWorld ? '' : `<a class="mm-btn" id="mm-sum-again" href="?mode=dungeon&seed=${Number(seed) + 1 || ''}${layoutV === 2 ? '&lv=2' : ''}${biome !== 'warren' ? '&biome=' + biome : ''}${opts.test ? '&test=1' : ''}${hubExit ? '&from=hub' : ''}">New dungeon</a>`}<a class="mm-btn${backWorld ? '' : ' alt'}" id="mm-sum-home" href="${backWorld || (hubExit ? '../../hub/index.html' : '../../index.html')}">${backWorld ? 'Back to the world' : hubExit ? 'Back to the map' : 'Back to town'}</a></div></div>`;
      sumEl.classList.remove('hidden');
      api.summary = s;
    }
    function finish() { if (finished) return; arena.stop(); showSummary(false); }

    // ---------- the controller the arena calls ----------
    const ctrl = {
      onStart() {
        arena._hideBanner(); clearTimeout(arena._bannerTimer);
        arena.state = 'play'; arena.run.wave = 0; arena.biome = 0;
        const res = state.enter(dungeon.rooms.find((r) => r.type === 'start').id);
        loadRoom(res.ok ? state.current : 0, null);
        arena._showBanner(`${B.name} #${seed}`, 1.8);
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
        if (e.did === 'sprout') MMEnemies.onDeath({ id: 'sprout', x: 0, y: 0 }).forEach((m, i) => spawnMob('aimed', m.id, e.x + (i ? 16 : -16), e.y, Math.max(2, Math.ceil(m.hp / HP_DIV)), false));
        if (left === 0) ctrl.cleared();
      },
      cleared() {
        arena.player.hp = Math.min(arena.stats.maxHp, arena.player.hp + Math.round(arena.stats.maxHp * 0.15));
        arena._showBanner('Room cleared!', 1.4); arena.eBullets.forEach((b) => { if (b.active) { b.active = false; arena._burst(b.x, b.y, '#8fe9ff', 1, 40); } });
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
        bossExtras();
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
        // pick-ups
        const near = (s, r) => Math.hypot(p.x - s.x, p.y - s.y) < r;
        if (hasKey() && !state.doorsClosed() && near(keySpot(), 26)) { L[current].keyTaken = true; keyFound = state.pickKey(); arena._snd('pickup'); arena._floatText(p.x, p.y - 30, '🗝 Key!', '#ffd45a'); mapSig = ''; }
        if (hasChest() && !rs.chestOpen && !state.doorsClosed() && near(chestSpot(), 30)) openChest();
        if (hasPortal() && near(portalSpot(), 30)) { finish(); return; }
        // HUD text (the arena rewrites it from time to time)
        const txt = `${B.name} · Room ${dungeon.rooms.filter((r) => state.room(r.id).visited).length}/${ROOMS - 1} · 🗝 ${state.keys}${state.room(current).enemiesAlive > 0 && byId[current].type !== 'boss' ? ` · ${state.room(current).enemiesAlive} left` : ''}`;
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
        g.drawImage(L[current].baked, 0, 0);
        const pal = palOf(byId[current].type); const tt = performance.now() / 1000;
        curDoors().forEach((o) => {
          const x = o.tile.x * T; const y = o.tile.y * T;
          if (o.status === 'open') { rect(g, pal.f[0], x, y, T, T); rect(g, 'rgba(255,255,255,0.12)', x, y, T, T); }
          else if (o.status === 'sealed') { g.drawImage(S.doorSealed, x, y); g.globalAlpha = 0.25 + 0.15 * Math.sin(tt * 5); rect(g, '#ff2244', x, y, T, T); g.globalAlpha = 1; }
          else if (o.status === 'locked') g.drawImage(S.doorLocked, x, y);
          else g.drawImage(S.crack[Math.min(2, state.secretHits)], x, y);
        });
        if (hasKey()) { const k = keySpot(); g.drawImage(S.key, k.x - 11, k.y - 11 + Math.sin(tt * 3) * 3); }
        if (hasChest()) { const c = chestSpot(); g.drawImage(S.chest[state.room(current).chestOpen ? 1 : 0], c.x - 16, c.y - 14); }
        if (hasPortal()) { const q = portalSpot(); g.save(); g.translate(q.x, q.y); g.rotate(tt * 1.2); g.drawImage(S.portal, -36, -36); g.rotate(-tt * 2.4); g.globalAlpha = 0.6; g.drawImage(S.portal, -26, -26, 52, 52); g.restore(); g.globalAlpha = 1; }
      },
      drawOver(g) {
        if (B.tint) { g.fillStyle = B.tint; g.fillRect(0, 0, arena.W, arena.H); }
        if (B.particles && current !== null) { // seeded drift: positions come from a table made with MMRng, only the clock moves them
          const P = B.particles; const tt = arena._reduced ? 0 : performance.now() / 1000; g.fillStyle = P.color; const ga = g.globalAlpha; g.globalAlpha = 0.5;
          for (let i = 0; i < ambient.length; i++) {
            const q = ambient[i]; const x = ((q.x + tt * q.v * 14 * P.dir) % arena.W + arena.W) % arena.W; const y = ((q.y + tt * q.v * 9 + Math.sin(tt * q.v + q.ph) * 14) % arena.H + arena.H) % arena.H;
            g.fillRect(Math.round(x), Math.round(y), q.sz, q.sz);
          }
          g.globalAlpha = ga;
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
      doors: () => curDoors().map((o) => ({ dir: o.dir, other: o.other, status: o.status, tile: o.tile })),
      enter: (id) => tryEnter(id),
      mobs: () => arena.enemies.filter((e) => e.active && e.dg === 'mob').length,
      clearRoom() { // kill every mob in the room as if the player had
        arena.enemies.forEach((e) => { if (e.active && e.dg === 'mob') e.active = false; });
        while (current !== null && state.room(current).enemiesAlive > 0 && byId[current].type !== 'boss') { if (state.killEnemy() === 0) { ctrl.cleared(); break; } }
      },
      keyPos: () => (current !== null && byId[current].type === 'key' ? keySpot() : null),
      chestPos: () => (hasChest() ? chestSpot() : null),
      portalPos: () => (hasPortal() ? portalSpot() : null),
      crackTile: () => { const o = curDoors().find((q) => q.status === 'cracked'); return o ? o.tile : null; },
      boltWall: (x, y) => ctrl.onBoltWall(x, y),
      boss: () => bossEntity(),
      finish,
      layout: (id) => ({ tpl: L[id].tpl.id, plan: L[id].plan.length, count: counts[id] }),
      toggleMap,
      mapVisible: () => !mapEl.classList.contains('hidden'),
    });
    Object.defineProperties(api, { room: { get: () => current }, finished: { get: () => finished } });
    ctrl.api = api;
    arena.dungeon = ctrl;
    arena.fixedWorld = { w: MMRooms.W * T, h: MMRooms.H * T };
    return ctrl;
  }

  window.MMDungeonRun = { create };
})();
