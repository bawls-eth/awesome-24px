// Hearthvale Isles page (BIOME-ARCH-PLAN slice B8): one biome island (the Verdant Jungle by default) on a light 2D canvas loop.
// Terrain comes from MMOverworld.generate(seed, {pack}); chunks are baked ONCE by MMChunkBake into a small LRU and blitted; creatures are
// the pack's spawn-group ids drawn from MMCreatureDraw's cached frames and behave as plain base-type enemies (wander / flee / aggro);
// the hero is read from MMProfile (pixeltown-mm-v1, read only) and shoots a bolt. Minimap + fog (MMFog) are redrawn at a few Hz only.
// Local only: no database, no network module, no game engine, no requests. Own key pixeltown-archipelago-v1 (via MMIsles.clean/write); pixeltown-tames-v1
// is only read. Switches: ?seed=<digits> ?isle=<jungle|home|reef|ice|mars> ?art=0 ?perf=low ?test=1 (window.__isles) ?touch=1.
(function () {
  'use strict';
  const O = window.MMOverworld, BP = window.MMBiomePacks, CB = window.MMChunkBake, CR = window.MMCreatures, CD = window.MMCreatureDraw;
  const FOG = window.MMFog, PROF = window.MMProfile, ISL = window.MMIsles, TAMES = window.MMTames, RNG = window.MMRng;
  const $ = (id) => document.getElementById(id);
  const has = (o, k) => !!o && Object.prototype.hasOwnProperty.call(o, k);
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

  // ---------- switches ----------
  const Q = new URLSearchParams(location.search);
  const TEST = Q.get('test') === '1';
  const ART = Q.get('art') !== '0';
  const LOW = Q.get('perf') === 'low';
  const TILE = CB.TILE, CPX = CB.CPX, CH = CB.CH;
  const rawIsle = Q.get('isle');
  const ISLE = rawIsle && has(ISL.ISLES, rawIsle) && ISL.ISLES[rawIsle].pack && BP.resolveId(ISL.ISLES[rawIsle].pack) ? rawIsle : 'jungle';
  const PACK_ID = BP.resolveId(ISL.ISLES[ISLE].pack);
  const PACK = BP.get(PACK_ID);
  const DRAW_BIOME = { meadow: 'home', tundra: 'ice' }[PACK_ID] || PACK_ID;

  // ---------- storage (own keys only; every access guarded) ----------
  const store = (() => { try { return window.localStorage; } catch (e) { return null; } })();
  const memStore = { getItem: () => null, setItem: () => {} };
  const S = store || memStore;
  const readJson = (k) => { try { const s = S.getItem(k); return typeof s === 'string' ? JSON.parse(s) : null; } catch (e) { return null; } };
  let save = ISL.load(S, Date.now());
  const tames = TAMES.load(S); // read only in this slice (B9 writes it)

  const seedQ = Q.get('seed');
  const savedIsle = save.isles[ISLE] || null;
  const SEED = seedQ && /^\d{1,12}$/.test(seedQ) ? seedQ : (savedIsle && savedIsle.seed ? savedIsle.seed : '1');

  // ---------- hero from MMProfile (read only) ----------
  const CLASS_COL = { ranger: '#4f9a45', frostcaller: '#7fc6e8', herald: '#f2d55c', punk: '#e05aa0', bruiser: '#c0673f', rogue: '#6a6a8a', warlock: '#8a4ac0',
    paladin: '#e8e0c0', berserker: '#c03a3a', druid: '#5aa05a', necromancer: '#4a5a4a', graveTender: '#8a8a6a', trickster: '#e0a040', shadowPaw: '#3a3a5a' };
  function readHero() {
    const prof = PROF.clean(readJson(PROF.KEY));
    const act = PROF.cleanActive(readJson(PROF.ACTIVE_KEY));
    const h = prof.heroes.find((x) => x.id === act.heroId) || prof.heroes[0] || null;
    return h ? { name: h.name, cls: h.cls, level: h.level, fromProfile: true } : { name: 'Wanderer', cls: 'ranger', level: 1, fromProfile: false };
  }
  const HERO = readHero();

  // ---------- world ----------
  const world = O.generate(SEED, { pack: PACK_ID });
  const NAMES = O.TERRAIN_NAMES;
  const W = world.w, H = world.h;
  const SLOW = new Array(NAMES.length).fill(1); // plain numbers: mud is exactly 0.6
  Object.keys(PACK.hazards || {}).forEach((n) => { const id = O.TERRAIN_ALL[n]; const s = PACK.hazards[n].slow; if (id !== undefined && s > 0 && s <= 1) SLOW[id] = s; });
  const PAL = Object.assign({}, CB.paletteFor(DRAW_BIOME), PACK.palette || {});
  const solidAt = (tx, ty) => O.isSolid(world, tx, ty);
  const tileOf = (px) => Math.floor(px / TILE);
  function moveScaleAt(tx, ty) { return SLOW[O.tileAt(world, tx, ty)] || 1; }
  const bandName = (z) => (PACK.bands[z] ? PACK.bands[z].name.replace(/_/g, ' ') : 'open sea');

  // props / sites per chunk, baked into the chunk canvas (never drawn per frame)
  const chunkProps = new Map();
  const pushProp = (p, kind) => { const k = Math.floor(p.x / CH) + ',' + Math.floor(p.y / CH); if (!chunkProps.has(k)) chunkProps.set(k, []); chunkProps.get(k).push({ x: p.x, y: p.y, kind: kind || p.kind }); };
  world.props.forEach((p) => pushProp(p));
  if (world.dock) pushProp(world.dock, 'dock');

  // ---------- canvas ----------
  const view = $('view'), g = view.getContext('2d');
  let DPR = LOW ? 1 : Math.min(2, window.devicePixelRatio || 1);
  let VW = 0, VH = 0;
  function resize() {
    VW = Math.max(1, window.innerWidth); VH = Math.max(1, window.innerHeight);
    view.width = Math.round(VW * DPR); view.height = Math.round(VH * DPR);
    g.imageSmoothingEnabled = false;
  }
  resize();
  window.addEventListener('resize', resize);

  // ---------- chunk art ----------
  const chunkCache = CB.makeCache(LOW ? 12 : 24);
  let bakesLeft = 0;
  const mk = (w, h) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; };
  const PROP_ART = {
    jungle_tree: ['#1d4a2a', '#2f6b3a', 13], tree_palm: ['#3a7a3a', '#8a6a3a', 11], giant_fern: ['#2f8a4a', '#1f5a32', 9], hanging_vine: ['#2a6a3a', '#1a4a2a', 7],
    reeds: ['#6a8a4a', '#4a6a2a', 6], banana_plant: ['#5aa04a', '#e8d05a', 9], log: ['#6a4a2a', '#4a321a', 8], shell: ['#f2e2c8', '#c8a888', 4],
    temple_pillar: ['#8a9a88', '#5a6a58', 8], ruin_pillar: ['#8a9a88', '#5a6a58', 8], shrine: ['#c8b88a', '#7a6a4a', 9], tower: ['#7a7a8a', '#4a4a5a', 10],
    campfire: ['#e07a3a', '#5a3a2a', 6], tent: ['#c86a4a', '#7a3a2a', 9], boss_altar: ['#7a3a5a', '#d05a8a', 12], portal_rift: ['#8a5ae0', '#e0d0ff', 11], dock: ['#8a5a3b', '#5a3a22', 10]
  };
  function drawProp(c, kind, px, py) {
    const a = PROP_ART[kind] || ['#3a5a3a', '#2a3a2a', 6], r = a[2], cx = px + TILE / 2, cy = py + TILE / 2;
    c.fillStyle = 'rgba(0,0,0,0.22)'; c.beginPath(); c.ellipse(cx, cy + r * 0.7, r, r * 0.35, 0, 0, Math.PI * 2); c.fill();
    c.fillStyle = a[1]; c.fillRect(cx - 2, cy - 2, 4, r);
    c.fillStyle = a[0]; c.beginPath(); c.arc(cx, cy - r * 0.4, r, 0, Math.PI * 2); c.fill();
    c.fillStyle = a[1]; c.fillRect(cx - r * 0.4, cy - r * 0.6, Math.max(2, r * 0.3), Math.max(2, r * 0.3));
  }
  function bakeFlat(cx, cy) { // ?art=0: one flat base colour per tile, no speckles or props
    const cv = mk(CPX, CPX), c = cv.getContext('2d');
    for (let ty = 0; ty < CH; ty++) for (let tx = 0; tx < CH; tx++) {
      const t = O.tileAt(world, cx * CH + tx, cy * CH + ty), e = PAL[NAMES[t]] || PAL.deep_water;
      c.fillStyle = e[0]; c.fillRect(tx * TILE, ty * TILE, TILE, TILE);
    }
    return cv;
  }
  function bakeArt(cx, cy) {
    const cv = CB.bakeChunkCanvas(mk, world.terrain, W, cx, cy, PAL, null, { names: NAMES, h: H });
    if (!cv) return bakeFlat(cx, cy);
    const c = cv.getContext('2d');
    (chunkProps.get(cx + ',' + cy) || []).forEach((p) => drawProp(c, p.kind, (p.x - cx * CH) * TILE, (p.y - cy * CH) * TILE));
    return cv;
  }
  function chunkCanvas(cx, cy) {
    return chunkCache.get(cx + ',' + cy, () => { if (bakesLeft <= 0) return null; bakesLeft--; return ART ? bakeArt(cx, cy) : bakeFlat(cx, cy); });
  }

  // ---------- creatures ----------
  const MOOD_BY_TIER = { passive: 'shy', neutral: 'neutral', hostile: 'hostile', boss: 'hostile' };
  const BASE_FALLBACK = { spiral: { arch: 'winged', size: 'S', hp: 30, speed: 80, mood: 'shy', dmg: 0 },
    aimed: { arch: 'biped', size: 'S', hp: 60, speed: 95, mood: 'hostile', dmg: 1 }, ring: { arch: 'blob', size: 'M', hp: 90, speed: 45, mood: 'neutral', dmg: 1 } };
  // pack placeholder ids (mm-biome-packs) that MMCreatures does not define yet: plain base-type stats
  const LOCAL = {
    parrotlet: { arch: 'winged', size: 'S', hp: 30, speed: 85, mood: 'shy', dmg: 0 },
    shellback: { arch: 'blob', size: 'M', hp: 90, speed: 40, mood: 'neutral', dmg: 1 },
    raptor_jr: { arch: 'biped', size: 'S', hp: 60, speed: 95, mood: 'hostile', dmg: 1 },
    boarhog: { arch: 'quadruped', size: 'M', hp: 120, speed: 70, mood: 'neutral', dmg: 1 },
    raptor: { arch: 'biped', size: 'M', hp: 150, speed: 105, mood: 'hostile', dmg: 2 },
  };
  const ARCH_BY_SIZE = { S: 'blob', M: 'quadruped', L: 'quadruped', XL: 'giant' };
  const XP_BY_SIZE = { S: 4, M: 8, L: 16, XL: 30 };
  const specCache = {};
  function specOf(sp) {
    if (specCache[sp]) return specCache[sp];
    const base = (PACK.base && PACK.base[sp]) || 'ring';
    let s;
    if (has(LOCAL, sp)) s = Object.assign({}, LOCAL[sp]);
    else {
      const d = CR.get(sp);
      if (d) s = { arch: d.size === 'XL' ? 'giant' : (ARCH_BY_SIZE[d.size] || 'blob'), size: d.size, hp: Math.min(400, d.hp), speed: clamp(d.speed * 0.5, 30, 110), mood: MOOD_BY_TIER[d.tier] || 'neutral', dmg: d.dmg > 0 ? Math.max(1, Math.round(d.dmg)) : 0, drops: d.drops };
      else s = Object.assign({}, BASE_FALLBACK[base] || BASE_FALLBACK.ring);
    }
    s.base = base;
    s.rad = (CD.HIT_RADIUS[s.size] || 12);
    s.name = sp.replace(/_/g, ' ');
    specCache[sp] = s;
    return s;
  }
  const baker = CD.makeBaker(mk, 64);
  const PACK_SPECIES = BP.creatureIds(PACK_ID);
  const groupIdx = new Map();
  world.spawnGroups.forEach((gr, i) => groupIdx.set(gr, i));
  const groupState = world.spawnGroups.map(() => ({ alive: 0, until: 0 }));
  const CAP = LOW ? 12 : 24, BIG_CAP = 4;
  const SPAWN_R = 22, DESPAWN_R = 34, LEASH = 14 * TILE;
  let creatures = [];
  let uid = 0;
  const rng = RNG.create('isles|' + PACK_ID + '|' + SEED + '|ai');

  function addCreature(sp, x, y, gi) {
    const s = specOf(sp);
    const c = { uid: ++uid, sp: sp, base: s.base, x: x, y: y, hx: x, hy: y, vx: 0, vy: 0, hp: s.hp, maxHp: s.hp, rad: s.rad, size: s.size, mood: s.mood,
      angry: 0, think: rng.next() * 0.1, cd: 0, flash: 0, moving: false, t: rng.next() * 4, gi: gi, seen: false, art: null };
    if (ART) c.art = baker.bake({ id: sp, archetype: s.arch, size: s.size, biome: DRAW_BIOME }, { dpr: DPR });
    creatures.push(c);
    return c;
  }
  function spawnTick() {
    const htx = tileOf(hero.x), hty = tileOf(hero.y), now = clock.now();
    const near = O.nearestSpawnGroups(world, htx, hty, SPAWN_R);
    for (let k = 0; k < near.length && creatures.length < CAP; k++) {
      const gr = near[k], gi = groupIdx.get(gr), st = groupState[gi];
      if (st.alive > 0 || st.until > now) continue;
      const dd = Math.hypot(gr.x - htx, gr.y - hty);
      if (dd < 7) continue; // never pop in on top of the hero
      const s = specOf(gr.creature);
      if ((s.size === 'L' || s.size === 'XL') && creatures.filter((c) => c.size === 'L' || c.size === 'XL').length >= BIG_CAP) continue;
      const gr2 = RNG.create('isles|' + SEED + '|g' + gi + '|' + Math.floor(now / 1000));
      const n = Math.min(gr.count, CAP - creatures.length);
      for (let j = 0; j < n; j++) {
        let tx = gr.x, ty = gr.y;
        for (let tries = 0; tries < 6; tries++) { const ax = gr.x + gr2.int(-2, 2), ay = gr.y + gr2.int(-2, 2); if (!solidAt(ax, ay)) { tx = ax; ty = ay; break; } }
        addCreature(gr.creature, (tx + 0.5) * TILE, (ty + 0.5) * TILE, gi);
        st.alive++;
      }
    }
    // despawn far creatures (their group can come back later, nothing is lost)
    creatures = creatures.filter((c) => {
      if (Math.hypot(c.x - hero.x, c.y - hero.y) <= DESPAWN_R * TILE) return true;
      if (c.gi >= 0) groupState[c.gi].alive = Math.max(0, groupState[c.gi].alive - 1);
      return false;
    });
  }
  function think(c) {
    const dx = hero.x - c.x, dy = hero.y - c.y, d = Math.hypot(dx, dy) || 1;
    const s = specOf(c.sp);
    const home = Math.hypot(c.x - c.hx, c.y - c.hy);
    if (home > LEASH) { c.angry = 0; const hd = home || 1; c.vx = (c.hx - c.x) / hd * s.speed; c.vy = (c.hy - c.y) / hd * s.speed; return; }
    const chase = !hero.dead && (c.angry > 0 || (c.mood === 'hostile' && d < 6 * TILE));
    if (chase) { c.vx = dx / d * s.speed * 1.15; c.vy = dy / d * s.speed * 1.15; return; }
    if (c.mood === 'shy' && d < 4 * TILE) { c.vx = -dx / d * s.speed * 1.2; c.vy = -dy / d * s.speed * 1.2; return; }
    if (rng.next() < 0.12) {
      if (rng.next() < 0.45) { c.vx = 0; c.vy = 0; }
      else { const a = rng.next() * Math.PI * 2; c.vx = Math.cos(a) * s.speed * 0.5; c.vy = Math.sin(a) * s.speed * 0.5; }
    }
  }
  function stepCreatures(dt) {
    for (let i = 0; i < creatures.length; i++) {
      const c = creatures[i];
      c.t += dt; c.cd -= dt; c.flash -= dt; c.angry -= dt;
      c.think -= dt;
      if (c.think <= 0) { c.think += 0.1; think(c); } // 10 Hz, staggered by the random start phase
      const nx = c.x + c.vx * dt, ny = c.y + c.vy * dt;
      if (!solidAt(tileOf(nx), tileOf(c.y))) c.x = nx; else { c.vx = -c.vx; }
      if (!solidAt(tileOf(c.x), tileOf(ny))) c.y = ny; else { c.vy = -c.vy; }
      c.moving = Math.abs(c.vx) + Math.abs(c.vy) > 4;
      const s = specOf(c.sp);
      const d = Math.hypot(hero.x - c.x, hero.y - c.y);
      if (!c.seen && d < 8 * TILE) { c.seen = true; ISL.noteLog(save, 'seen', c.sp, 1); dirty = true; }
      if (!hero.dead && s.dmg > 0 && (c.mood === 'hostile' || c.angry > 0) && d < c.rad + HERO_R && c.cd <= 0) { c.cd = 0.9; hurtHero(s.dmg * 2); }
    }
  }

  // ---------- hero ----------
  const HERO_R = 10, SPEED = 150;
  const maxHp = 20 + HERO.level * 2;
  const hero = { x: (world.spawnPoint.x + 0.5) * TILE, y: (world.spawnPoint.y + 0.5) * TILE, hp: maxHp, maxHp: maxHp, iframes: 0, face: { x: 1, y: 0 }, scale: 1, dead: false, cd: 0, t: 0 };
  if (savedIsle && savedIsle.pos && savedIsle.seed === SEED) {
    const tx = Math.floor(savedIsle.pos.x), ty = Math.floor(savedIsle.pos.y);
    if (tx >= 0 && ty >= 0 && tx < W && ty < H && !solidAt(tx, ty)) { hero.x = (savedIsle.pos.x) * TILE; hero.y = (savedIsle.pos.y) * TILE; }
  }
  let god = false, xp = 0, kills = 0;
  const loot = {};
  function blocked(x, y) {
    const r = HERO_R - 1;
    return solidAt(tileOf(x - r), tileOf(y - r)) || solidAt(tileOf(x + r), tileOf(y - r)) || solidAt(tileOf(x - r), tileOf(y + r)) || solidAt(tileOf(x + r), tileOf(y + r));
  }
  function moveHero(mx, my, dt) {
    let len = Math.hypot(mx, my);
    if (len > 1) { mx /= len; my /= len; len = 1; }
    hero.scale = moveScaleAt(tileOf(hero.x), tileOf(hero.y));
    if (len < 0.05) return;
    hero.face = { x: mx / len, y: my / len };
    const v = SPEED * hero.scale * dt;
    const nx = hero.x + mx * v, ny = hero.y + my * v;
    if (!blocked(nx, hero.y)) hero.x = nx;
    if (!blocked(hero.x, ny)) hero.y = ny;
  }
  function hurtHero(n) {
    if (god || hero.dead || hero.iframes > 0) return;
    hero.hp = Math.max(0, hero.hp - n); hero.iframes = 0.6;
    if (hero.hp <= 0) {
      hero.dead = true;
      toast('You wash up on the beach.');
      setTimeout(() => respawn(), TEST ? 0 : 900);
    }
  }
  function respawn() {
    hero.x = (world.spawnPoint.x + 0.5) * TILE; hero.y = (world.spawnPoint.y + 0.5) * TILE;
    hero.hp = hero.maxHp; hero.dead = false; hero.iframes = 1.5;
    creatures.forEach((c) => { c.angry = 0; });
  }

  // ---------- bolts ----------
  const BOLT_SPEED = 420, BOLT_LIFE = 0.75, BOLT_DMG = 12 + HERO.level * 2;
  let bolts = [];
  function nearestTarget(range) {
    let best = null, bd = range;
    creatures.forEach((c) => { const d = Math.hypot(c.x - hero.x, c.y - hero.y); if (d < bd) { bd = d; best = c; } });
    return best;
  }
  function fire(dx, dy) {
    if (hero.dead || hero.cd > 0) return false;
    let l = Math.hypot(dx, dy);
    if (!(l > 0)) { const t = nearestTarget(9 * TILE); if (t) { dx = t.x - hero.x; dy = t.y - hero.y; } else { dx = hero.face.x; dy = hero.face.y; } l = Math.hypot(dx, dy) || 1; }
    hero.cd = 0.25;
    if (bolts.length < 60) bolts.push({ x: hero.x, y: hero.y - 6, vx: dx / l * BOLT_SPEED, vy: dy / l * BOLT_SPEED, life: BOLT_LIFE });
    return true;
  }
  function rollLoot(c) {
    const s = specOf(c.sp);
    const tables = s.drops && s.drops.length ? s.drops : ['jungle_loot'];
    const tab = CR.dropTable ? CR.dropTable(tables[0]) : null;
    if (!Array.isArray(tab) || !tab.length) return;
    if (rng.next() > 0.5) return; // minimal loot: half the kills drop one item
    let tw = 0; tab.forEach((r) => { tw += r[3] || 1; });
    let pick = rng.next() * tw, row = tab[0];
    for (let i = 0; i < tab.length; i++) { pick -= tab[i][3] || 1; if (pick <= 0) { row = tab[i]; break; } }
    loot[row[0]] = (loot[row[0]] || 0) + 1;
  }
  function hitCreature(c, dmg) {
    c.hp -= dmg; c.flash = 0.12; c.angry = 6;
    if (c.hp > 0) return;
    const s = specOf(c.sp);
    xp += XP_BY_SIZE[s.size] || 4; kills++;
    rollLoot(c);
    if (c.gi >= 0) { const st = groupState[c.gi]; st.alive = Math.max(0, st.alive - 1); if (st.alive === 0) st.until = clock.now() + 90000; }
    creatures = creatures.filter((x) => x !== c);
  }
  function stepBolts(dt) {
    for (let i = bolts.length - 1; i >= 0; i--) {
      const b = bolts[i];
      b.x += b.vx * dt; b.y += b.vy * dt; b.life -= dt;
      let gone = b.life <= 0 || solidAt(tileOf(b.x), tileOf(b.y)) && O.tileAt(world, tileOf(b.x), tileOf(b.y)) !== 0;
      if (!gone) for (let k = 0; k < creatures.length; k++) {
        const c = creatures[k];
        if (Math.hypot(c.x - b.x, c.y - 8 - b.y) < c.rad + 5) { hitCreature(c, BOLT_DMG); gone = true; break; }
      }
      if (gone) bolts.splice(i, 1);
    }
  }

  // ---------- fog + minimap ----------
  let fog = (savedIsle && savedIsle.seed === SEED && FOG.decode(savedIsle.fog)) || FOG.make();
  let fogDirty = true, lastFogTile = '';
  function revealFog() {
    const tx = tileOf(hero.x), ty = tileOf(hero.y), k = tx + ',' + ty;
    if (k === lastFogTile) return;
    lastFogTile = k;
    if (FOG.reveal(fog, tx, ty, 10) > 0) { fogDirty = true; dirty = true; }
  }
  const mini = $('mini'), mg = mini.getContext('2d');
  const miniBase = mk(W, H);
  (function bakeMini() {
    const c = miniBase.getContext('2d'), img = c.createImageData(W, H), rgb = {};
    const hex = (h) => { if (rgb[h]) return rgb[h]; const v = parseInt(h.slice(1), 16); return (rgb[h] = [(v >> 16) & 255, (v >> 8) & 255, v & 255]); };
    for (let i = 0; i < W * H; i++) { const e = PAL[NAMES[world.terrain[i]]] || PAL.deep_water, p = hex(e[0]); img.data[i * 4] = p[0]; img.data[i * 4 + 1] = p[1]; img.data[i * 4 + 2] = p[2]; img.data[i * 4 + 3] = 255; }
    c.putImageData(img, 0, 0);
  }());
  const miniFog = mk(W, H);
  function drawMini() {
    if (mini.hidden) return;
    if (fogDirty) {
      const f = miniFog.getContext('2d');
      f.clearRect(0, 0, W, H); f.fillStyle = '#0b1620';
      const cells = Math.ceil(W / FOG.CELL);
      for (let cy = 0; cy < cells; cy++) for (let cx = 0; cx < cells; cx++) if (!FOG.has(fog, cx, cy)) f.fillRect(cx * FOG.CELL, cy * FOG.CELL, FOG.CELL, FOG.CELL);
      fogDirty = false;
    }
    mg.imageSmoothingEnabled = false;
    mg.clearRect(0, 0, mini.width, mini.height);
    mg.drawImage(miniBase, 0, 0, mini.width, mini.height);
    mg.drawImage(miniFog, 0, 0, mini.width, mini.height);
    const k = mini.width / W;
    mg.fillStyle = '#ff5a4a';
    creatures.forEach((c) => { const tx = tileOf(c.x), ty = tileOf(c.y); if (FOG.has(fog, FOG.cellOf(tx), FOG.cellOf(ty)) && c.mood === 'hostile') mg.fillRect(tx * k - 1, ty * k - 1, 2, 2); });
    if (world.dock) { mg.fillStyle = '#f2b84b'; mg.fillRect(world.dock.x * k - 2, world.dock.y * k - 2, 4, 4); }
    mg.fillStyle = '#ffffff'; mg.fillRect(hero.x / TILE * k - 2, hero.y / TILE * k - 2, 5, 5);
  }

  // ---------- hero sprite (code art, baked once) ----------
  const heroArt = (() => {
    const s = Math.round(32 * DPR), frames = [];
    const col = CLASS_COL[HERO.cls] || '#4f9a45';
    for (let f = 0; f < 2; f++) {
      const cv = mk(s, s), c = cv.getContext('2d');
      c.scale(DPR, DPR);
      const bob = f ? 1 : 0;
      c.fillStyle = '#2a1c14'; c.fillRect(11, 26 - bob, 4, 5); c.fillRect(17, 26 + bob - 1, 4, 5);
      c.fillStyle = col; c.fillRect(9, 14 + bob, 14, 13);
      c.fillStyle = '#f0c8a0'; c.fillRect(10, 4 + bob, 12, 11);
      c.fillStyle = '#1e1a22'; c.fillRect(13, 8 + bob, 2, 3); c.fillRect(18, 8 + bob, 2, 3);
      c.fillStyle = col; c.fillRect(9, 2 + bob, 14, 4);
      c.fillStyle = '#0c140f'; c.fillRect(9, 26 + bob, 14, 1);
      frames.push(cv);
    }
    const sh = mk(Math.round(24 * DPR), Math.round(8 * DPR)), sc = sh.getContext('2d');
    sc.fillStyle = 'rgba(0,0,0,0.28)'; sc.beginPath(); sc.ellipse(sh.width / 2, sh.height / 2, sh.width / 2, sh.height / 2, 0, 0, Math.PI * 2); sc.fill();
    return { frames: frames, shadow: sh };
  })();

  // ---------- render ----------
  const MOOD_COL = { shy: '#9ad07a', neutral: '#e0c060', hostile: '#e0604a' };
  let camX = 0, camY = 0;
  function render() {
    g.setTransform(DPR, 0, 0, DPR, 0, 0);
    camX = Math.round(hero.x - VW / 2); camY = Math.round(hero.y - VH / 2);
    const deep = PAL.deep_water ? PAL.deep_water[0] : '#1d3f7a';
    g.fillStyle = deep; g.fillRect(0, 0, VW, VH);
    bakesLeft = 2;
    const c0 = Math.floor(camX / CPX), c1 = Math.floor((camX + VW) / CPX), r0 = Math.floor(camY / CPX), r1 = Math.floor((camY + VH) / CPX);
    for (let cy = r0; cy <= r1; cy++) for (let cx = c0; cx <= c1; cx++) {
      if (cx < 0 || cy < 0 || cx * CH >= W || cy * CH >= H) continue;
      const cv = chunkCanvas(cx, cy);
      if (cv) g.drawImage(cv, cx * CPX - camX, cy * CPX - camY, CPX, CPX);
    }
    // creatures, y-sorted (at most 24)
    const list = creatures.slice().sort((a, b) => a.y - b.y);
    for (let i = 0; i < list.length; i++) {
      const c = list[i], sx = c.x - camX, sy = c.y - camY;
      if (sx < -140 || sy < -140 || sx > VW + 140 || sy > VH + 140) continue;
      if (c.art) {
        const a = c.art, act = c.moving ? 'move' : 'idle', fr = a.frames[act][CD.frameAt(act, c.t)];
        const w = a.w / a.dpr, h = a.h / a.dpr;
        if (a.shadow && !LOW) g.drawImage(a.shadow, sx - w / 2, sy - (a.shadow.height / a.dpr) / 2, w, a.shadow.height / a.dpr);
        if (c.vx < -4) { g.save(); g.translate(sx, 0); g.scale(-1, 1); g.drawImage(fr, -w / 2, sy - a.ay / a.dpr, w, h); g.restore(); }
        else g.drawImage(fr, sx - w / 2, sy - a.ay / a.dpr, w, h);
      } else {
        g.fillStyle = MOOD_COL[c.mood] || '#ccc'; g.beginPath(); g.arc(sx, sy - c.rad * 0.6, c.rad, 0, Math.PI * 2); g.fill();
      }
      if (c.flash > 0) { g.fillStyle = 'rgba(255,255,255,0.55)'; g.beginPath(); g.arc(sx, sy - c.rad, c.rad, 0, Math.PI * 2); g.fill(); }
      if (c.hp < c.maxHp) { const bw = Math.max(20, c.rad * 1.6); g.fillStyle = '#2a1b1b'; g.fillRect(sx - bw / 2, sy - c.rad * 2.4 - 6, bw, 4); g.fillStyle = MOOD_COL[c.mood] || '#e0604a'; g.fillRect(sx - bw / 2, sy - c.rad * 2.4 - 6, bw * Math.max(0, c.hp / c.maxHp), 4); }
    }
    // bolts
    g.fillStyle = '#fff4a8';
    for (let i = 0; i < bolts.length; i++) { const b = bolts[i]; g.fillRect(b.x - camX - 3, b.y - camY - 3, 6, 6); }
    // hero
    const hx = hero.x - camX, hy = hero.y - camY;
    if (!hero.dead && !(hero.iframes > 0 && Math.floor(hero.iframes * 12) % 2)) {
      if (ART) {
        if (!LOW) g.drawImage(heroArt.shadow, hx - 12, hy - 2, 24, 8);
        g.drawImage(heroArt.frames[Math.floor(hero.t * 6) % 2], hx - 16, hy - 28, 32, 32);
      } else { g.fillStyle = CLASS_COL[HERO.cls] || '#4f9a45'; g.beginPath(); g.arc(hx, hy - 8, HERO_R, 0, Math.PI * 2); g.fill(); }
    }
  }

  // ---------- HUD ----------
  const hud = { hero: $('hud-hero'), isle: $('hud-isle'), info: $('hud-info'), ground: $('hud-ground'), fill: $('hp-fill'), hp: $('hp-text') };
  hud.hero.textContent = HERO.name + ' - ' + HERO.cls + ' Lv ' + HERO.level;
  const lastHud = {};
  const setText = (k, v) => { if (lastHud[k] !== v) { lastHud[k] = v; hud[k].textContent = v; } };
  function drawHud() {
    const tx = tileOf(hero.x), ty = tileOf(hero.y);
    setText('isle', PACK.name + ' - ' + bandName(O.zoneAt(world, tx, ty)));
    setText('hp', Math.ceil(hero.hp) + ' / ' + hero.maxHp);
    hud.fill.style.width = Math.round(100 * hero.hp / hero.maxHp) + '%';
    const lootN = Object.keys(loot).reduce((n, k) => n + loot[k], 0);
    setText('info', 'XP ' + xp + '  Kills ' + kills + '  Loot ' + lootN + (tames.roster.length ? '  Tames ' + tames.roster.length : ''));
    const tn = NAMES[O.tileAt(world, tx, ty)] || '';
    setText('ground', tn.replace(/_/g, ' ') + (hero.scale < 1 ? ' (slow x' + hero.scale + ')' : ''));
  }
  let toastT = 0;
  function toast(msg) { const el = $('toast'); el.textContent = msg; el.classList.add('on'); clearTimeout(toastT); toastT = setTimeout(() => el.classList.remove('on'), 2200); }

  // ---------- save (own key, throttled) ----------
  let dirty = true, saveT = 0;
  function persist() {
    try {
      if (!has(save.isles, ISLE)) save.isles[ISLE] = { seed: SEED, pos: null, fog: '', chests: [] };
      const rec = save.isles[ISLE];
      if (rec.seed !== SEED) { rec.chests = []; }
      rec.seed = SEED;
      rec.fog = FOG.encode(fog);
      ISL.setPos(save, ISLE, hero.x / TILE, hero.y / TILE);
      save.at = ISLE;
      ISL.write(S, save);
      dirty = false;
    } catch (e) { /* storage full or blocked: play on */ }
  }
  window.addEventListener('pagehide', persist);
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') persist(); });

  // ---------- input ----------
  const keys = {};
  const KEYMAP = { ArrowUp: 'u', KeyW: 'u', ArrowDown: 'd', KeyS: 'd', ArrowLeft: 'l', KeyA: 'l', ArrowRight: 'r', KeyD: 'r' };
  let firing = false, aim = null;
  document.addEventListener('keydown', (e) => {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    if (KEYMAP[e.code]) { keys[KEYMAP[e.code]] = true; e.preventDefault(); }
    if (e.code === 'Space') { firing = true; aim = null; e.preventDefault(); }
    if (e.code === 'KeyM') toggleMap();
  });
  document.addEventListener('keyup', (e) => { if (KEYMAP[e.code]) keys[KEYMAP[e.code]] = false; if (e.code === 'Space') firing = false; });
  window.addEventListener('blur', () => { Object.keys(keys).forEach((k) => { keys[k] = false; }); firing = false; stick.x = stick.y = 0; });
  view.addEventListener('pointerdown', (e) => { if (e.pointerType === 'touch') return; firing = true; aim = { x: e.clientX, y: e.clientY }; });
  view.addEventListener('pointermove', (e) => { if (aim) aim = { x: e.clientX, y: e.clientY }; });
  window.addEventListener('pointerup', (e) => { if (e.pointerType !== 'touch') { firing = false; aim = null; } });
  const stick = { x: 0, y: 0, id: null };
  const stickEl = $('stick'), knob = $('knob');
  function stickMove(e) {
    const r = stickEl.getBoundingClientRect(), R = r.width / 2;
    let dx = e.clientX - (r.left + R), dy = e.clientY - (r.top + R);
    const l = Math.hypot(dx, dy), m = R * 0.7;
    if (l > m) { dx = dx / l * m; dy = dy / l * m; }
    stick.x = dx / m; stick.y = dy / m;
    knob.style.transform = 'translate(' + Math.round(dx) + 'px,' + Math.round(dy) + 'px)';
  }
  stickEl.addEventListener('pointerdown', (e) => { stick.id = e.pointerId; try { stickEl.setPointerCapture(e.pointerId); } catch (er) { /* ignore */ } stickMove(e); e.preventDefault(); });
  stickEl.addEventListener('pointermove', (e) => { if (e.pointerId === stick.id) stickMove(e); });
  const stickEnd = (e) => { if (e.pointerId !== stick.id) return; stick.id = null; stick.x = stick.y = 0; knob.style.transform = ''; };
  stickEl.addEventListener('pointerup', stickEnd); stickEl.addEventListener('pointercancel', stickEnd);
  const fireBtn = $('btn-fire');
  fireBtn.addEventListener('pointerdown', (e) => { firing = true; aim = null; e.preventDefault(); });
  ['pointerup', 'pointercancel', 'pointerleave'].forEach((t) => fireBtn.addEventListener(t, () => { firing = false; }));
  function toggleMap() { mini.hidden = !mini.hidden; $('mini-wrap').hidden = mini.hidden; $('btn-map').setAttribute('aria-pressed', String(!mini.hidden)); }
  $('btn-map').addEventListener('click', toggleMap);
  const coarse = (() => { try { return window.matchMedia('(pointer: coarse)').matches; } catch (e) { return false; } })();
  if (coarse || Q.get('touch') === '1' || ('ontouchstart' in window && window.innerWidth <= 700)) document.body.classList.add('touch');

  function inputVec() {
    let mx = (keys.r ? 1 : 0) - (keys.l ? 1 : 0), my = (keys.d ? 1 : 0) - (keys.u ? 1 : 0);
    if (stick.x || stick.y) { mx = stick.x; my = stick.y; }
    return { mx: mx, my: my };
  }

  // ---------- simulation ----------
  const clock = (() => { let off = 0; return { now: () => Date.now() + off, set: (t) => { off = Number(t) - Date.now(); return clock.now(); } }; })();
  let spawnT = 0, miniT = 0, hudT = 0;
  function update(dt, mx, my) {
    hero.t += dt; hero.iframes -= dt; hero.cd -= dt;
    if (!hero.dead) moveHero(mx, my, dt);
    revealFog();
    spawnT -= dt;
    if (spawnT <= 0) { spawnT = 0.5; spawnTick(); }
    stepCreatures(dt);
    stepBolts(dt);
    saveT -= dt;
    if (saveT <= 0) { saveT = 4; if (dirty) persist(); }
  }
  let paused = false, last = performance.now();
  function frame(now) {
    const dt = Math.min(0.05, Math.max(0, (now - last) / 1000));
    last = now;
    if (!paused) {
      const v = inputVec();
      if (firing) { if (aim) fire(aim.x - (hero.x - camX), aim.y - (hero.y - camY)); else fire(0, 0); }
      update(dt, v.mx, v.my);
      if (Math.hypot(v.mx, v.my) > 0.05) dirty = true;
    }
    render();
    miniT -= dt; hudT -= dt;
    if (miniT <= 0) { miniT = LOW ? 0.5 : 0.25; drawMini(); }
    if (hudT <= 0) { hudT = 0.2; drawHud(); }
    requestAnimationFrame(frame);
  }
  revealFog();
  drawMini(); drawHud();
  requestAnimationFrame(frame);
  if (!savedIsle) toast('Welcome to the ' + PACK.name + '!');

  // ---------- test handle ----------
  if (TEST) {
    const snap = () => ({ x: hero.x, y: hero.y, tx: tileOf(hero.x), ty: tileOf(hero.y), hp: hero.hp, maxHp: hero.maxHp, scale: hero.scale, dead: hero.dead,
      terrain: NAMES[O.tileAt(world, tileOf(hero.x), tileOf(hero.y))] });
    window.__isles = {
      world: world, pack: PACK_ID, isle: ISLE, seed: SEED, art: ART, low: LOW, hero: snap, heroInfo: () => Object.assign({}, HERO), packSpecies: PACK_SPECIES.slice(),
      clock: clock,
      verify: () => O.verify(world),
      pause: (p) => { paused = p !== false; return paused; },
      god: (on) => { god = on !== false; return god; },
      moveScaleAt: moveScaleAt,
      step: (mx, my, dt) => { let left = Math.max(0, Math.min(30, Number(dt) || 0)); while (left > 1e-9) { const s = Math.min(1 / 60, left); update(s, Number(mx) || 0, Number(my) || 0); left -= s; } return snap(); },
      teleport: (tx, ty) => { hero.x = (tx + 0.5) * TILE; hero.y = (ty + 0.5) * TILE; revealFog(); return snap(); },
      // first tile of terrain `name` (any land when null) with `run` walkable tiles of the same move scale to its right
      findTile: (name, run) => {
        const want = name ? O.TERRAIN_ALL[name] : -1, n = Math.max(1, run | 0);
        for (let y = 2; y < H - 2; y++) for (let x = 2; x < W - n - 2; x++) {
          const t = world.terrain[y * W + x];
          if (want >= 0 ? t !== want : (SLOW[t] !== 1 || t <= 1)) continue;
          let ok = true;
          for (let k = 0; k <= n && ok; k++) for (let dy = -1; dy <= 1 && ok; dy++) { const tt = O.tileAt(world, x + k, y + dy); if (solidAt(x + k, y + dy) || SLOW[tt] !== SLOW[t] || (want < 0 && tt <= 1)) ok = false; }
          if (ok) return { x: x, y: y };
        }
        return null;
      },
      creatures: () => creatures.map((c) => ({ uid: c.uid, sp: c.sp, base: c.base, x: c.x, y: c.y, hp: c.hp, maxHp: c.maxHp, mood: c.mood, size: c.size, art: !!c.art })),
      spawn: (sp, tx, ty) => (PACK_SPECIES.indexOf(sp) >= 0 && creatures.length < CAP ? addCreature(sp, (tx + 0.5) * TILE, (ty + 0.5) * TILE, -1).uid : null),
      clearCreatures: () => { creatures = []; groupState.forEach((s) => { s.alive = 0; s.until = clock.now() + 1e9; }); },
      spawnTick: () => { spawnTick(); return creatures.length; },
      fire: (dx, dy) => { hero.cd = 0; return fire(dx, dy); },
      stats: () => ({ xp: xp, kills: kills, loot: Object.assign({}, loot), bolts: bolts.length, chunks: chunkCache.size(), fog: FOG.count(fog), cap: CAP, dpr: DPR }),
      save: () => { persist(); return JSON.parse(S.getItem(ISL.KEY) || 'null'); },
    };
  }
}());
