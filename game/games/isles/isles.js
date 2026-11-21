// Hearthvale Isles page (BIOME-ARCH-PLAN slice B8): one biome island (the Verdant Jungle by default) on a light 2D canvas loop.
// Terrain comes from MMOverworld.generate(seed, {pack}); chunks are baked ONCE by MMChunkBake into a small LRU and blitted; creatures are
// the pack's spawn-group ids drawn from MMCreatureDraw's cached frames and behave as plain base-type enemies (wander / flee / aggro);
// the hero is read from MMProfile (pixeltown-mm-v1, read only) and shoots a bolt. Minimap + fog (MMFog) are redrawn at a few Hz only.
// Local only: no database, no network module, no game engine, no requests. Own key pixeltown-archipelago-v1 (via MMIsles.clean/write); pixeltown-tames-v1
// is written only when a creature is tamed or the mount / party changes (B9). Switches: ?seed=<digits> ?isle=<jungle|home|reef|ice|mars> ?art=0
// ?perf=low ?test=1 (window.__isles) ?touch=1, and from B9 ?tame=0 (creatures just die) ?companions=0 ?mounts=0.
// B9 (taming in play): passive creatures wander and flee when startled, neutral ones retaliate, hostile ones aggro; every attack winds up
// with a code-drawn telegraph (line / ring / cone, bigger for L/XL) before it lands. Torpor and KO, befriending and feeding follow
// MMTame step for step; a finished tame is added through MMTames, joins the party (MMCompanion follow / attack) and a rideable tame
// (the Tusktop) can be mounted with R / the Ride button (MMCompanion.ride: speed and lift) and dismounted the same way.
// B10 (home, travel, cozy, medals): ?isle= also takes pack ids (meadow|jungle|reef|tundra|mars); Hearth Isle (meadow, 96 tiles) is the
// hub with a LOCAL-ONLY homestead (MMHomestead: decor + a tame pen on a seeded starter layout, saved inside pixeltown-archipelago-v1);
// every island has a dock on its beach band with a calm sea chart to the other islands, plus a Home button (fast travel to the
// home dock, ?at=dock). Daily-free gather spots come from each pack's resources table (?today=YYYY-MM-DD) with a collection log,
// and medals (first tame per size class, each island visited, each boss lair seen) go to pixeltown-medals-isles-v1 for the Hub card.
(function () {
  'use strict';
  const O = window.MMOverworld, BP = window.MMBiomePacks, CB = window.MMChunkBake, CR = window.MMCreatures, CD = window.MMCreatureDraw;
  const FOG = window.MMFog, PROF = window.MMProfile, ISL = window.MMIsles, TAMES = window.MMTames, RNG = window.MMRng;
  const TM = window.MMTame, CMP = window.MMCompanion, IC = window.IsleCreatures, HS = window.MMHomestead;
  const $ = (id) => document.getElementById(id);
  const has = (o, k) => !!o && Object.prototype.hasOwnProperty.call(o, k);
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

  // ---------- switches ----------
  const Q = new URLSearchParams(location.search);
  const TEST = Q.get('test') === '1';
  const ART = Q.get('art') !== '0';
  const LOW = Q.get('perf') === 'low';
  const TAME = Q.get('tame') !== '0', COMPANIONS = Q.get('companions') !== '0', MOUNTS = Q.get('mounts') !== '0';
  const TILE = CB.TILE, CPX = CB.CPX, CH = CB.CH;

  // ---------- storage (own keys only; every access guarded) ----------
  const store = (() => { try { return window.localStorage; } catch (e) { return null; } })();
  const memStore = { getItem: () => null, setItem: () => {} };
  const S = store || memStore;
  const readJson = (k) => { try { const s = S.getItem(k); return typeof s === 'string' ? JSON.parse(s) : null; } catch (e) { return null; } };
  let save = ISL.load(S, Date.now());
  const tames = TAMES.load(S); // corrupt -> the empty stable; written only on a tame / party / mount change

  // the island: ?isle= (isle id or pack id), else from the Hub the island you were last on (Hearth Isle for a new save), else the jungle (B8)
  const rawIsle = Q.get('isle');
  const wantIsle = rawIsle ? ISL.isleFor(rawIsle) : (Q.get('from') === 'hub' ? save.at : '');
  const ISLE = wantIsle && has(ISL.ISLES, wantIsle) && ISL.ISLES[wantIsle].pack && BP.resolveId(ISL.ISLES[wantIsle].pack) ? wantIsle : 'jungle';
  const PACK_ID = BP.resolveId(ISL.ISLES[ISLE].pack);
  const PACK = BP.get(PACK_ID);
  const DRAW_BIOME = { meadow: 'home', tundra: 'ice' }[PACK_ID] || PACK_ID;
  const HOME = ISLE === 'home';
  const ISLE_PARAM = { home: 'meadow', ice: 'tundra' };
  const isleName = (id) => { const isle = ISL.ISLES[id]; const pk = isle && BP.get(isle.pack); return pk ? pk.name : id; };
  const todayQ = Q.get('today');

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
  const world = O.generate(SEED, { pack: PACK_ID, size: ISL.ISLES[ISLE].size });
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
  let chunkCache = CB.makeCache(LOW ? 12 : 24);
  const IA = (ART && window.MMIsleArt) ? window.MMIsleArt.create({ art: true }) : null; // b30 jungle tile art (falls back to the code palette per tile)
  if (IA) IA.ready.then(() => { if (IA.active()) chunkCache = CB.makeCache(LOW ? 12 : 24); });
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
    let cv = null;
    if (IA && IA.active()) { const src = IA.chunk(world.terrain, W, cx, cy); if (src) { cv = mk(CPX, CPX); cv.getContext('2d').drawImage(src, 0, 0, CPX, CPX); } }
    if (!cv) cv = CB.bakeChunkCanvas(mk, world.terrain, W, cx, cy, PAL, null, { names: NAMES, h: H });
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
  // specOf(sp, kind): sp is the spawn id (kept on the creature), kind the MMCreatures species it plays as (IsleCreatures.kindOf) or null
  function specOf(sp, kind) {
    const key = sp + '|' + (kind || '');
    if (specCache[key]) return specCache[key];
    const base = (PACK.base && PACK.base[sp]) || 'ring';
    const d = kind ? CR.get(kind) : null;
    let s;
    if (d) {
      s = { arch: IC.ARCH[d.id] || (has(LOCAL, sp) ? LOCAL[sp].arch : null) || (d.size === 'XL' ? 'giant' : (ARCH_BY_SIZE[d.size] || 'blob')), size: d.size,
        hp: Math.min(400, d.hp), speed: clamp(d.speed * 0.5, 30, 110), mood: MOOD_BY_TIER[d.tier] || 'neutral', dmg: d.dmg > 0 ? Math.max(1, Math.round(d.dmg)) : 0, drops: d.drops };
    } else if (has(LOCAL, sp)) s = Object.assign({}, LOCAL[sp]);
    else s = Object.assign({}, BASE_FALLBACK[base] || BASE_FALLBACK.ring);
    s.base = base;
    if (HOME) { s.dmg = 0; if (s.mood === 'hostile') s.mood = 'neutral'; } // Hearth Isle is safe: nothing there attacks
    s.def = d;
    s.rad = (CD.HIT_RADIUS[s.size] || 12);
    s.name = d ? d.name : sp.replace(/_/g, ' ');
    s.atk = IC.attackOf(d, s.size);
    s.aggroR = d && d.aggroR > 0 ? d.aggroR : 6 * TILE;
    specCache[key] = s;
    return s;
  }
  const baker = CD.makeBaker(mk, 64);
  const PACK_SPECIES = BP.creatureIds(PACK_ID);
  // species the test handle may place: the pack ids plus the MMCreatures species of this island's biome
  const SPAWNABLE = PACK_SPECIES.concat(CR.byBiome(PACK_ID).map((d) => d.id));
  const groupIdx = new Map();
  world.spawnGroups.forEach((gr, i) => groupIdx.set(gr, i));
  const groupState = world.spawnGroups.map(() => ({ alive: 0, until: 0 }));
  const CAP = LOW ? 12 : 24, BIG_CAP = 4;
  const SPAWN_R = 22, DESPAWN_R = 34, LEASH = 14 * TILE;
  let creatures = [];
  let uid = 0, simT = 0;
  const rng = RNG.create('isles|' + PACK_ID + '|' + SEED + '|ai');
  const isBig = (c) => c.size === 'L' || c.size === 'XL';

  function addCreature(sp, x, y, gi, j) {
    const kind = IC.kindOf(sp, gi);
    const s = specOf(sp, kind);
    const c = { uid: ++uid, sp: sp, kind: kind, base: s.base, x: x, y: y, hx: x, hy: y, vx: 0, vy: 0, hp: s.hp, maxHp: s.hp, rad: s.rad, size: s.size, mood: s.mood,
      angry: 0, think: rng.next() * 0.1, cd: 0, flash: 0, moving: false, t: rng.next() * 4, gi: gi, seen: false, art: null,
      ph: '', pt: 0, ang: 0, ox: x, oy: y, hitDone: false, tgAt: -1, ko: false, calm: false, hostile: s.mood === 'hostile', awake: true,
      tm: null, tmAcc: 0, leaving: 0, wid: gi >= 0 ? 'g' + gi + '_' + (j | 0) : 'u' + uid, lv: 1 };
    c.def = s.def;
    if (s.def) c.lv = IC.levelFor(s.def, SEED, c.wid);
    if (TAME && s.def && s.def.tame) c.tm = TM.init(s.def, { seed: 'isles|' + SEED, wildId: c.wid, level: c.lv });
    if (ART) c.art = baker.bake({ id: kind || sp, archetype: s.arch, size: s.size, biome: DRAW_BIOME }, { dpr: DPR });
    creatures.push(c);
    return c;
  }
  let bigN = 0;
  function spawnTick() {
    const htx = tileOf(hero.x), hty = tileOf(hero.y), now = clock.now();
    const near = O.nearestSpawnGroups(world, htx, hty, SPAWN_R);
    bigN = 0;
    for (let i = 0; i < creatures.length; i++) if (isBig(creatures[i])) bigN++;
    for (let k = 0; k < near.length && creatures.length < CAP; k++) {
      const gr = near[k], gi = groupIdx.get(gr), st = groupState[gi];
      if (st.alive > 0 || st.until > now) continue;
      const dd = Math.hypot(gr.x - htx, gr.y - hty);
      if (dd < 7) continue; // never pop in on top of the hero
      const s = specOf(gr.creature, IC.kindOf(gr.creature, gi));
      const bigG = s.size === 'L' || s.size === 'XL';
      if (bigG && bigN >= BIG_CAP) continue;
      const gr2 = RNG.create('isles|' + SEED + '|g' + gi + '|' + Math.floor(now / 1000));
      const n = Math.min(bigG ? Math.min(gr.count, BIG_CAP - bigN) : gr.count, CAP - creatures.length);
      for (let j = 0; j < n; j++) {
        let tx = gr.x, ty = gr.y;
        for (let tries = 0; tries < 6; tries++) { const ax = gr.x + gr2.int(-2, 2), ay = gr.y + gr2.int(-2, 2); if (!solidAt(ax, ay)) { tx = ax; ty = ay; break; } }
        addCreature(gr.creature, (tx + 0.5) * TILE, (ty + 0.5) * TILE, gi, j);
        st.alive++;
        if (bigG) bigN++;
      }
    }
    // despawn far creatures (their group can come back later, nothing is lost)
    creatures = creatures.filter((c) => {
      if (Math.hypot(c.x - hero.x, c.y - hero.y) <= DESPAWN_R * TILE && !(c.leaving > 0 && c.leaving < 0.05)) return true;
      if (c.gi >= 0) groupState[c.gi].alive = Math.max(0, groupState[c.gi].alive - 1);
      return false;
    });
  }
  function startAttack(c, s, dx, dy) {
    c.ph = 'wind'; c.pt = s.atk.windup; c.ang = Math.atan2(dy, dx); c.ox = c.x; c.oy = c.y; c.vx = 0; c.vy = 0; c.hitDone = false; c.tgAt = simT;
  }
  function think(c) {
    const s = specOf(c.sp, c.kind);
    // taming clock (10 Hz with the accumulated time)
    if (c.tm) tameTick(c);
    if (c.ko || c.ph) { if (c.ko) { c.vx = 0; c.vy = 0; } return; }
    const dx = hero.x - c.x, dy = hero.y - c.y, d = Math.hypot(dx, dy) || 1;
    if (c.leaving > 0) { c.vx = -dx / d * s.speed * 1.4; c.vy = -dy / d * s.speed * 1.4; return; }
    if (c.calm) { c.vx = 0; c.vy = 0; return; } // befriending: it stays and watches you
    const home = Math.hypot(c.x - c.hx, c.y - c.hy);
    if (home > LEASH) { c.angry = 0; const hd = home || 1; c.vx = (c.hx - c.x) / hd * s.speed; c.vy = (c.hy - c.y) / hd * s.speed; return; }
    const chase = !hero.dead && s.dmg > 0 && c.mood !== 'shy' && (c.angry > 0 || (c.mood === 'hostile' && d < s.aggroR));
    if (chase) {
      if (c.cd <= 0 && d < c.rad + HERO_R + s.atk.reach * 0.8) { startAttack(c, s, dx, dy); return; }
      c.vx = dx / d * s.speed * 1.15; c.vy = dy / d * s.speed * 1.15; return;
    }
    // shy creatures flee when startled (hit, or the hero shooting nearby); with ?tame=0 they flee whenever the hero is close (B8)
    if (c.mood === 'shy' && d < 4 * TILE && (!TAME || !c.tm || c.angry > 0 || hero.shotT > 0)) { c.vx = -dx / d * s.speed * 1.2; c.vy = -dy / d * s.speed * 1.2; return; }
    if (c.mood === 'shy' && c.angry > 0 && d < 8 * TILE) { c.vx = -dx / d * s.speed * 1.2; c.vy = -dy / d * s.speed * 1.2; return; }
    if (rng.next() < 0.12) {
      if (rng.next() < 0.45) { c.vx = 0; c.vy = 0; }
      else { const a = rng.next() * Math.PI * 2; c.vx = Math.cos(a) * s.speed * 0.5; c.vy = Math.sin(a) * s.speed * 0.5; }
    }
  }
  const HURT_LOG = []; // last few hero hits {t, uid} (test handle; fixed size)
  function dealHero(c, s) {
    const before = hero.hp;
    hurtHero(s.dmg * 2);
    if (hero.hp < before) { if (HURT_LOG.length >= 8) HURT_LOG.shift(); HURT_LOG.push({ t: simT, uid: c.uid, tg: c.tgAt }); }
  }
  function attackStep(c, s, dt) {
    c.pt -= dt;
    if (c.ph === 'wind') {
      if (c.pt > 0) return;
      if (s.atk.shape === 'line') { c.ph = 'strike'; c.pt = 0.22; const v = (s.atk.reach + c.rad) / 0.22; c.vx = Math.cos(c.ang) * v; c.vy = Math.sin(c.ang) * v; }
      else {
        if (!hero.dead && IC.inShape(s.atk.shape, c.x, c.y, c.ang, c.rad, s.atk.reach, hero.x, hero.y, HERO_R)) dealHero(c, s);
        c.ph = 'rest'; c.pt = 0.35;
      }
    } else if (c.ph === 'strike') {
      if (!c.hitDone && !hero.dead && Math.hypot(hero.x - c.x, hero.y - c.y) < c.rad + HERO_R + 4) { c.hitDone = true; dealHero(c, s); }
      if (c.pt <= 0) { c.ph = 'rest'; c.pt = 0.35; c.vx = 0; c.vy = 0; }
    } else if (c.pt <= 0) { c.ph = ''; c.cd = s.atk.cd; }
  }
  function stepCreatures(dt) {
    for (let i = 0; i < creatures.length; i++) {
      const c = creatures[i];
      const s = specOf(c.sp, c.kind);
      c.t += dt; c.cd -= dt; c.flash -= dt; c.angry -= dt; c.tmAcc += dt;
      if (c.leaving > 0) c.leaving = Math.max(0.01, c.leaving - dt);
      c.think -= dt;
      if (c.think <= 0) { c.think += 0.1; think(c); } // 10 Hz, staggered by the random start phase
      if (c.ph) attackStep(c, s, dt);
      if (c.ko) { c.vx = 0; c.vy = 0; }
      const nx = c.x + c.vx * dt, ny = c.y + c.vy * dt;
      if (!solidAt(tileOf(nx), tileOf(c.y))) c.x = nx; else { c.vx = -c.vx; }
      if (!solidAt(tileOf(c.x), tileOf(ny))) c.y = ny; else { c.vy = -c.vy; }
      c.moving = Math.abs(c.vx) + Math.abs(c.vy) > 4;
      c.awake = !c.ko;
      c.hostile = !c.ko && !c.calm && s.dmg > 0 && (c.mood === 'hostile' || c.angry > 0);
      if (!c.seen && Math.abs(hero.x - c.x) < 8 * TILE && Math.hypot(hero.x - c.x, hero.y - c.y) < 8 * TILE) { c.seen = true; ISL.noteLog(save, 'seen', c.kind || c.sp, 1); dirty = true; }
    }
    if (creatures.length && creatures.some((c) => c.leaving > 0 && c.leaving <= 0.01)) removeWhere((c) => c.leaving > 0 && c.leaving <= 0.01, 0);
  }
  function removeWhere(fn, cool) {
    creatures = creatures.filter((c) => {
      if (!fn(c)) return true;
      if (c.gi >= 0) { const st = groupState[c.gi]; st.alive = Math.max(0, st.alive - 1); if (st.alive === 0) st.until = clock.now() + cool; }
      return false;
    });
  }

  // ---------- hero ----------
  const HERO_R = 10, SPEED = 150;
  const maxHp = 20 + HERO.level * 2;
  const hero = { x: (world.spawnPoint.x + 0.5) * TILE, y: (world.spawnPoint.y + 0.5) * TILE, hp: maxHp, maxHp: maxHp, iframes: 0, face: { x: 1, y: 0 }, scale: 1, dead: false, cd: 0, t: 0, shotT: 0 };
  if (savedIsle && savedIsle.pos && savedIsle.seed === SEED) {
    const tx = Math.floor(savedIsle.pos.x), ty = Math.floor(savedIsle.pos.y);
    if (tx >= 0 && ty >= 0 && tx < W && ty < H && !solidAt(tx, ty)) { hero.x = (savedIsle.pos.x) * TILE; hero.y = (savedIsle.pos.y) * TILE; }
  }
  if (Q.get('at') === 'dock' && world.dock) { hero.x = (world.dock.x + 0.5) * TILE; hero.y = (world.dock.y + 0.5) * TILE; }
  let god = false, xp = 0, kills = 0, tamedN = 0;
  const loot = {};
  const pouch = Object.assign({}, IC.STARTER_POUCH);
  function blocked(x, y) {
    const r = HERO_R - 1;
    return solidAt(tileOf(x - r), tileOf(y - r)) || solidAt(tileOf(x + r), tileOf(y - r)) || solidAt(tileOf(x - r), tileOf(y + r)) || solidAt(tileOf(x + r), tileOf(y + r));
  }
  function moveHero(mx, my, dt) {
    let len = Math.hypot(mx, my);
    if (len > 1) { mx /= len; my /= len; len = 1; }
    hero.scale = CMP.moveScale(ride, moveScaleAt(tileOf(hero.x), tileOf(hero.y)));
    if (len < 0.05) return;
    hero.face.x = mx / len; hero.face.y = my / len;
    const v = SPEED * hero.scale * dt;
    const nx = hero.x + mx * v, ny = hero.y + my * v;
    if (!blocked(nx, hero.y)) hero.x = nx;
    if (!blocked(hero.x, ny)) hero.y = ny;
  }
  function hurtHero(n) {
    if (god || hero.dead || hero.iframes > 0) return;
    if (ride) n = CMP.riderDamage(ride, n);
    if (!(n > 0)) return;
    hero.hp = Math.max(0, hero.hp - n); hero.iframes = 0.6;
    if (hero.hp <= 0) {
      hero.dead = true;
      if (ride) dismount();
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
  const BOLT_SPEED = 420, BOLT_LIFE = 0.75, BOLT_DMG = 12 + HERO.level * 2, FIRE_CD = 0.25;
  const HERO_DPS = BOLT_DMG / FIRE_CD;
  const SOOTHE_DMG = 0.25; // a soothe shot does a quarter of the damage and its full value as torpor
  let soothe = false;
  let bolts = [];
  function nearestTarget(range) {
    let best = null, bd = range;
    creatures.forEach((c) => { const d = Math.hypot(c.x - hero.x, c.y - hero.y); if (d < bd && !c.calm) { bd = d; best = c; } });
    return best;
  }
  function fire(dx, dy) {
    if (hero.dead || hero.cd > 0) return false;
    if (ride && !CMP.canFire(ride)) return false;
    let l = Math.hypot(dx, dy);
    if (!(l > 0)) { const t = nearestTarget(9 * TILE); if (t) { dx = t.x - hero.x; dy = t.y - hero.y; } else { dx = hero.face.x; dy = hero.face.y; } l = Math.hypot(dx, dy) || 1; }
    hero.cd = FIRE_CD; hero.shotT = 2;
    if (bolts.length < 60) bolts.push({ x: hero.x, y: hero.y - 6, vx: dx / l * BOLT_SPEED, vy: dy / l * BOLT_SPEED, life: BOLT_LIFE, soothe: soothe && TAME });
    return true;
  }
  function rollLoot(c) {
    const s = specOf(c.sp, c.kind);
    const tables = s.drops && s.drops.length ? s.drops : ['jungle_loot'];
    const tab = CR.dropTable ? CR.dropTable(tables[0]) : null;
    if (!Array.isArray(tab) || !tab.length) return;
    if (rng.next() > 0.5) return; // minimal loot: half the kills drop one item
    let tw = 0; tab.forEach((r) => { tw += r[3] || 1; });
    let pick = rng.next() * tw, row = tab[0];
    for (let i = 0; i < tab.length; i++) { pick -= tab[i][3] || 1; if (pick <= 0) { row = tab[i]; break; } }
    loot[row[0]] = (loot[row[0]] || 0) + 1;
    if (has(pouch, row[0])) pouch[row[0]] = Math.min(99, pouch[row[0]] + 1); // food drops refill the pouch
  }
  function killCreature(c) {
    const s = specOf(c.sp, c.kind);
    xp += XP_BY_SIZE[s.size] || 4; kills++;
    rollLoot(c);
    removeWhere((x) => x === c, 90000);
  }
  // hitCreature(c, dmg, how): how = 'soothe' (bolt in soothe mode) | 'comp' (a companion) | undefined (plain bolt)
  function hitCreature(c, dmg, how) {
    const sooth = how === 'soothe';
    const real = sooth ? dmg * SOOTHE_DMG : dmg;
    c.flash = 0.12;
    if (TAME && c.tm) {
      const left = c.hp - real;
      const r = TM.step(c.kind, c.tm, { dmg: real, torporHit: sooth ? dmg : 0, hits: 1, lethal: left <= 0, hpFrac: clamp(left / c.maxHp, 0, 1),
        playerDist: Math.hypot(hero.x - c.x, hero.y - c.y) }, c.tmAcc);
      c.tmAcc = 0;
      c.tm = r.state;
      if (r.events.indexOf('killed') >= 0 || c.tm.st === 'dead') { c.hp = 0; killCreature(c); return; }
      c.hp = Math.max(1, left);
      syncTame(c, r.events);
      if (!c.ko) c.angry = 6; // a sleeper does not wake up angry; a shy one flees, the rest fight back
      return;
    }
    c.hp -= real; c.angry = 6;
    if (c.hp > 0) return;
    killCreature(c);
  }
  function stepBolts(dt) {
    for (let i = bolts.length - 1; i >= 0; i--) {
      const b = bolts[i];
      b.x += b.vx * dt; b.y += b.vy * dt; b.life -= dt;
      let gone = b.life <= 0 || solidAt(tileOf(b.x), tileOf(b.y)) && O.tileAt(world, tileOf(b.x), tileOf(b.y)) !== 0;
      if (!gone) for (let k = 0; k < creatures.length; k++) {
        const c = creatures[k];
        if (Math.hypot(c.x - b.x, c.y - 8 - b.y) < c.rad + 5) { hitCreature(c, BOLT_DMG, b.soothe ? 'soothe' : undefined); gone = true; break; }
      }
      if (gone) bolts.splice(i, 1);
    }
  }

  // ---------- taming (MMTame), party (MMCompanion), mount ----------
  const today = () => { try { return new Date(clock.now()).toISOString().slice(0, 10); } catch (e) { return ''; } };
  const FEED_R = 3 * TILE;
  function syncTame(c, events) {
    const st = c.tm.st, how = c.tm.how;
    const wasKo = c.ko;
    c.ko = st === 'ko' || (st === 'taming' && how === 'ko');
    c.calm = st === 'calm' || (st === 'taming' && how === 'calm');
    if (c.ko) { c.ph = ''; c.vx = 0; c.vy = 0; c.angry = 0; }
    if (!events) return;
    const nm = specOf(c.sp, c.kind).name;
    if (c.ko && !wasKo) { ISL.noteLog(save, 'ko', c.kind, 1); dirty = true; toast(nm + ' is knocked out. Feed it!'); }
    if (events.indexOf('calm') >= 0) toast(nm + ' is curious about you.');
    if (events.indexOf('wake') >= 0) { toast(nm + ' woke up!'); if (c.mood !== 'shy') c.angry = 6; }
    if (events.indexOf('fail') >= 0 || events.indexOf('lost') >= 0) { c.angry = c.mood === 'shy' ? 4 : c.angry; }
    if (events.indexOf('escape') >= 0) { c.leaving = 3; c.tm = null; c.ko = false; c.calm = false; toast(nm + ' ran off for good.'); }
  }
  function tameTick(c) {
    const tm = c.tm;
    const d = Math.hypot(hero.x - c.x, hero.y - c.y);
    const befriend = c.def && c.def.tame && c.def.tame.method !== 'knockout';
    if (tm.st === 'wild' && tm.torpor <= 0 && !(befriend && d < 6 * TILE)) { c.tmAcc = 0; return; }
    const r = TM.step(c.kind, tm, { playerDist: hero.dead ? 1e5 : d }, c.tmAcc);
    c.tmAcc = 0;
    c.tm = r.state;
    if (r.events.length) syncTame(c, r.events); else syncTame(c, null);
  }
  function feedTarget() {
    let best = null, bd = 1e9;
    for (let i = 0; i < creatures.length; i++) {
      const c = creatures[i];
      if (!c.tm || !(c.ko || c.calm)) continue;
      const d = Math.hypot(hero.x - c.x, hero.y - c.y);
      if (d > (c.ko ? FEED_R : TM.K.CALM_RANGE)) continue;
      if (d < bd) { bd = d; best = c; }
    }
    return best;
  }
  function feed() {
    if (!TAME || hero.dead) return { ok: false, why: 'off' };
    const c = feedTarget();
    if (!c) return { ok: false, why: 'none' };
    const def = CR.get(c.kind), nm = def.name;
    const f = IC.foodFor(def, pouch);
    if (!f || !f.have) { toast(nm + ' wants ' + IC.foodName(f && f.id) + '. You have none.'); return { ok: false, why: 'nofood' }; }
    const r = TM.step(c.kind, c.tm, { offer: f.id, playerDist: Math.hypot(hero.x - c.x, hero.y - c.y) }, c.tmAcc);
    c.tmAcc = 0;
    c.tm = r.state;
    const ev = r.events;
    if (ev.indexOf('fed') >= 0) pouch[f.id] = Math.max(0, pouch[f.id] - 1);
    if (ev.indexOf('toofast') >= 0) toast(nm + ' is still chewing.');
    if (ev.indexOf('refused') >= 0) toast(nm + ' turns its nose up.');
    if (c.tm.st === 'tamed') { finishTame(c); return { ok: true, tamed: true, events: ev }; }
    syncTame(c, ev);
    return { ok: ev.indexOf('fed') >= 0, events: ev, prog: c.tm.prog, need: c.tm.need };
  }

  // the party: MMCompanion states for up to MAX_ACTIVE (1 on the low tier) tames from tames.party
  const party = [];   // {cs, ent, def, ctxDef, art, dmg}
  const partyStates = [];
  const compCtx = { owner: hero, enemies: creatures, pickups: [], blocked: (x, y) => solidAt(tileOf(x), tileOf(y)), def: null, speed: SPEED };
  function spawnCompanion(ent, x, y) {
    if (!COMPANIONS || !ent) return null;
    const def = CR.get(ent.sp);
    if (!def || !def.companion) return null; // unknown species stay inert in the roster
    if (party.some((p) => p.ent.id === ent.id)) return null;
    if (ride && ent.id === ride.id) return null; // it is under you
    const cs = CMP.create({ id: ent.id, sp: ent.sp, x: x, y: y, maxHp: 30 + 10 * ent.lv, slot: party.length, mode: def.companion.dps > 0 ? 'attack' : 'follow' });
    if (!CMP.activate(partyStates, cs, LOW)) return null;
    const p = { cs: cs, ent: ent, def: def, ctxDef: { companion: def.companion, speed: 1.15 }, dmg: CMP.damage(def, ent.bond, HERO_DPS), art: null };
    const sz = def.size, arch = IC.ARCH[def.id] || ARCH_BY_SIZE[sz] || 'blob';
    if (ART) p.art = baker.bake({ id: def.id, archetype: arch, size: sz, biome: DRAW_BIOME }, { dpr: DPR });
    party.push(p);
    return p;
  }
  function dropCompanion(id) {
    const i = party.findIndex((p) => p.ent.id === id);
    if (i < 0) return;
    party.splice(i, 1);
    partyStates.length = 0;
    party.forEach((p, k) => { p.cs.slot = k; partyStates.push(p.cs); });
  }
  function loadParty() {
    tames.party.forEach((id, k) => { const ent = TAMES.find(tames, id); if (ent) spawnCompanion(ent, hero.x + (k ? 40 : -40), hero.y + 30); });
  }
  function stepParty(dt) {
    compCtx.enemies = creatures;
    for (let i = 0; i < party.length; i++) {
      const p = party[i];
      compCtx.def = p.ctxDef;
      const out = CMP.update(p.cs, compCtx, dt);
      if (out.hit >= 0 && p.dmg > 0) { const e = creatures[out.hit]; if (e && e.hostile) { p.cs.hits = (p.cs.hits || 0) + 1; hitCreature(e, p.dmg, 'comp'); } }
    }
  }
  function finishTame(c) {
    const def = CR.get(c.kind);
    const owned = tames.roster.filter((t) => t.sp === def.id);
    const rule = TM.duplicateRule(owned.length);
    let ent = null;
    if (rule.allow) ent = TAMES.add(tames, { sp: def.id, nm: def.name, isle: ISLE, d: today(), bond: c.tm.bond });
    else if (owned[0]) TAMES.addAffinity(tames, owned[0].id, 30);
    if (ent) {
      if (tames.party.length < Math.min(TAMES.MAX_PARTY, LOW ? 1 : CMP.MAX_ACTIVE)) {
        TAMES.setParty(tames, tames.party.concat([ent.id]));
        spawnCompanion(ent, c.x, c.y);
      }
      if (def.rideable && !tames.mount) TAMES.setMount(tames, ent.id);
    }
    TAMES.write(S, tames);
    ISL.noteLog(save, 'tamed', def.id, 1); dirty = true;
    tamedN++;
    removeWhere((x) => x === c, 90000);
    toast(ent ? def.name + ' joined you!' : def.name + ' is happy. Your bond grows.');
    refreshMount();
    checkMedals();
  }

  // mount: the tames.mount entry (else the first rideable tame) through MMCompanion.ride
  let ride = null, rideArt = null, mountEnt = null;
  function refreshMount() {
    mountEnt = null;
    if (!MOUNTS) return;
    const pick = (t) => { const d = t && CR.get(t.sp); return d && d.rideable ? t : null; };
    mountEnt = pick(tames.mount ? TAMES.find(tames, tames.mount) : null) || tames.roster.map(pick).filter(Boolean)[0] || null;
  }
  function mountUp() {
    if (!MOUNTS || ride || hero.dead) return false;
    if (!mountEnt) { toast('Tame a Tusktop to ride it.'); return false; }
    const def = CR.get(mountEnt.sp);
    ride = CMP.ride(def, mountEnt.id);
    if (!ride) return false;
    dropCompanion(mountEnt.id);
    if (ART) rideArt = baker.bake({ id: def.id, archetype: IC.ARCH[def.id] || 'quadruped', size: def.size, biome: DRAW_BIOME }, { dpr: DPR });
    if (tames.mount !== mountEnt.id) { TAMES.setMount(tames, mountEnt.id); TAMES.write(S, tames); }
    hero.scale = CMP.moveScale(ride, moveScaleAt(tileOf(hero.x), tileOf(hero.y)));
    toast('Riding ' + (mountEnt.nm || def.name) + '. R to get off.');
    return true;
  }
  function dismount() {
    if (!ride) return false;
    const id = ride.id;
    ride = null; rideArt = null;
    hero.scale = moveScaleAt(tileOf(hero.x), tileOf(hero.y));
    if (tames.party.indexOf(id) >= 0) spawnCompanion(TAMES.find(tames, id), hero.x + 36, hero.y + 12);
    return true;
  }
  const toggleRide = () => (ride ? (dismount(), false) : mountUp());
  refreshMount();

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
    mg.fillStyle = '#fff4a8';
    spots.forEach((p) => { if (!HS.taken(save.gather, ISLE, p.idx) && FOG.has(fog, FOG.cellOf(p.x), FOG.cellOf(p.y))) mg.fillRect(p.x * k - 1, p.y * k - 1, 3, 3); });
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
    drawGround();
    // telegraphs first (on the ground, under every body)
    for (let i = 0; i < creatures.length; i++) { const c = creatures[i]; if (c.ph === 'wind') drawTelegraph(c, c.x - camX, c.y - camY); }
    // creatures, y-sorted into a reused buffer (insertion sort: at most 24, nearly sorted frame to frame, no per-frame arrays)
    const list = drawBuf;
    list.length = creatures.length;
    for (let i = 0; i < creatures.length; i++) {
      const c = creatures[i]; let j = i - 1;
      while (j >= 0 && list[j].y > c.y) { list[j + 1] = list[j]; j--; }
      list[j + 1] = c;
    }
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
      if (c.tm) drawTameState(c, sx, sy);
    }
    // companions
    for (let i = 0; i < party.length; i++) {
      const p = party[i], cs = p.cs, sx = cs.x - camX, sy = cs.y - camY;
      if (sx < -140 || sy < -140 || sx > VW + 140 || sy > VH + 140) continue;
      g.strokeStyle = cs.down > 0 ? '#8a8a8a' : '#9ae07a'; g.lineWidth = 2; g.beginPath(); g.ellipse(sx, sy, 14, 5, 0, 0, Math.PI * 2); g.stroke();
      if (p.art) {
        const a = p.art, fr = a.frames.move[CD.frameAt('move', hero.t)], w = a.w / a.dpr, h = a.h / a.dpr;
        if (cs.face < 0) { g.save(); g.translate(sx, 0); g.scale(-1, 1); g.drawImage(fr, -w / 2, sy - a.ay / a.dpr, w, h); g.restore(); }
        else g.drawImage(fr, sx - w / 2, sy - a.ay / a.dpr, w, h);
      } else { g.fillStyle = '#9ae07a'; g.beginPath(); g.arc(sx, sy - 10, 10, 0, Math.PI * 2); g.fill(); }
      drawHeart(sx, sy - (p.art ? p.art.ay / p.art.dpr : 24) - 6, '#ff7aa8');
    }
    // bolts
    g.fillStyle = '#fff4a8';
    for (let i = 0; i < bolts.length; i++) { const b = bolts[i]; g.fillRect(b.x - camX - 3, b.y - camY - 3, 6, 6); }
    // hero (on the mount when riding: the mount at the feet, the hero lifted by MMCompanion.overlay)
    const hx = hero.x - camX, hy = hero.y - camY;
    let lift = 0;
    if (ride && !hero.dead) {
      lift = CMP.overlay(ride, heroMoving).dy;
      if (rideArt) {
        const a = rideArt, act = heroMoving ? 'move' : 'idle', fr = a.frames[act][CD.frameAt(act, hero.t)], w = a.w / a.dpr, h = a.h / a.dpr;
        if (a.shadow && !LOW) g.drawImage(a.shadow, hx - w / 2, hy - (a.shadow.height / a.dpr) / 2, w, a.shadow.height / a.dpr);
        if (hero.face.x < 0) { g.save(); g.translate(hx, 0); g.scale(-1, 1); g.drawImage(fr, -w / 2, hy - a.ay / a.dpr, w, h); g.restore(); }
        else g.drawImage(fr, hx - w / 2, hy - a.ay / a.dpr, w, h);
      } else { g.fillStyle = '#8a6a4a'; g.beginPath(); g.ellipse(hx, hy - 8, 26, 14, 0, 0, Math.PI * 2); g.fill(); }
    }
    if (!hero.dead && !(hero.iframes > 0 && Math.floor(hero.iframes * 12) % 2)) {
      if (ART) {
        if (!LOW && !ride) g.drawImage(heroArt.shadow, hx - 12, hy - 2, 24, 8);
        g.drawImage(heroArt.frames[Math.floor(hero.t * 6) % 2], hx - 16, hy - 28 + lift, 32, 32);
      } else { g.fillStyle = CLASS_COL[HERO.cls] || '#4f9a45'; g.beginPath(); g.arc(hx, hy - 8 + lift, HERO_R, 0, Math.PI * 2); g.fill(); }
    }
  }
  const drawBuf = [];
  const TG_COL = '#ffb347', TG_BIG = '#ff6a3a';
  const REDUCED = (() => { try { return window.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (e) { return false; } })();
  // the wind-up telegraph: the full shape outlined, filled as the wind-up runs out (big creatures: thicker, hotter colour)
  function drawTelegraph(c, sx, sy) {
    const s = specOf(c.sp, c.kind), a = s.atk;
    const p = clamp(1 - c.pt / a.windup, 0, 1);
    const col = a.big ? TG_BIG : TG_COL;
    const far = c.rad + a.reach;
    const pulse = REDUCED ? 0.5 : 0.35 + 0.25 * Math.sin(simT * 18);
    g.save();
    g.translate(sx, sy);
    g.strokeStyle = col; g.lineWidth = a.big ? 3 : 2; g.fillStyle = col;
    if (a.shape === 'ring') {
      g.globalAlpha = 0.9; g.beginPath(); g.arc(0, 0, far, 0, Math.PI * 2); g.stroke();
      g.globalAlpha = pulse; g.beginPath(); g.arc(0, 0, far * p, 0, Math.PI * 2); g.fill();
    } else if (a.shape === 'line') {
      g.rotate(c.ang);
      const hw = IC.LINE_HALF;
      g.globalAlpha = 0.9; g.strokeRect(0, -hw, far, hw * 2);
      g.globalAlpha = pulse; g.fillRect(0, -hw, far * p, hw * 2);
    } else {
      g.rotate(c.ang);
      g.globalAlpha = 0.9; g.beginPath(); g.moveTo(0, 0); g.arc(0, 0, far, -IC.CONE_HALF, IC.CONE_HALF); g.closePath(); g.stroke();
      g.globalAlpha = pulse; g.beginPath(); g.moveTo(0, 0); g.arc(0, 0, far * p, -IC.CONE_HALF, IC.CONE_HALF); g.closePath(); g.fill();
    }
    g.restore();
    if (a.big) { g.fillStyle = col; g.fillRect(sx - 2, sy - c.rad * 2.6 - 18, 4, 9); g.fillRect(sx - 2, sy - c.rad * 2.6 - 7, 4, 3); } // "!"
  }
  function drawHeart(x, y, col) {
    g.fillStyle = col; g.fillRect(x - 5, y - 3, 4, 4); g.fillRect(x + 1, y - 3, 4, 4); g.fillRect(x - 4, y, 8, 3); g.fillRect(x - 2, y + 3, 4, 2);
  }
  // sleeping Zs, a heart while befriending, a purple torpor bar and a green taming bar
  function drawTameState(c, sx, sy) {
    const tm = c.tm, bw = Math.max(20, c.rad * 1.6), top = sy - c.rad * 2.4;
    if (c.ko) {
      g.fillStyle = '#e8e0ff'; g.font = 'bold 12px monospace';
      const k = Math.floor(simT * 2) % 3;
      g.fillText('z', sx + c.rad * 0.6, top - 2 - k * 3); g.fillText('Z', sx + c.rad * 0.6 + 6, top - 10 - k * 3);
    } else if (c.calm) drawHeart(sx, top - 12, '#ff7aa8');
    if (tm.torpor > 0 && !c.ko && tm.torporMax > 0) { g.fillStyle = '#2a1b2a'; g.fillRect(sx - bw / 2, top + 0, bw, 3); g.fillStyle = '#a77ae0'; g.fillRect(sx - bw / 2, top, bw * clamp(tm.torpor / tm.torporMax, 0, 1), 3); }
    if (tm.need > 0 && (c.ko || c.calm)) { g.fillStyle = '#1b2a1b'; g.fillRect(sx - bw / 2, top + 4, bw, 4); g.fillStyle = '#7ae07a'; g.fillRect(sx - bw / 2, top + 4, bw * clamp(tm.prog / tm.need, 0, 1), 4); }
  }

  // ---------- B10: homestead (Hearth Isle only, local save), gather spots, travel, medals ----------
  const DAY = todayQ && /^\d{4}-\d{2}-\d{2}$/.test(todayQ) ? todayQ : (() => { try { return new Date().toISOString().slice(0, 10); } catch (e) { return ''; } })();
  const tileName = (tx, ty) => NAMES[O.tileAt(world, tx, ty)] || '';
  const WET = { deep_water: 1, shallow_water: 1, abyss: 1, lagoon: 1, dust_sea: 1 };
  const homeO = HOME ? HS.origin(world.spawnPoint, world.center, W, H) : null;
  // a grid cell is free ground when it is open, dry land that is not the dock or the spawn pad
  function cellFree(x, y) {
    if (!homeO) return false;
    const tx = homeO.x + x, ty = homeO.y + y;
    if (tx < 1 || ty < 1 || tx >= W - 1 || ty >= H - 1 || solidAt(tx, ty) || WET[tileName(tx, ty)]) return false;
    if (world.dock && Math.abs(tx - world.dock.x) <= 1 && Math.abs(ty - world.dock.y) <= 1) return false;
    return !(tx === world.spawnPoint.x && ty === world.spawnPoint.y);
  }
  if (!save.home || typeof save.home !== 'object') save.home = ISL.defaults().home;
  HS.ensure(save.home);
  if (HOME) HS.seedLayout(save.home, SEED, cellFree); // the first save tick (dirty starts true) writes it
  let lastAct = null;
  let build = false, buildKind = 'flowerbed';
  const toGrid = (tx, ty) => (homeO ? { x: tx - homeO.x, y: ty - homeO.y } : null);
  // tap / E in build mode: an item on the cell is picked up, an empty cell gets the selected item
  function buildAt(tx, ty) {
    if (!HOME) return { ok: false, why: 'away' };
    const c = toGrid(tx, ty);
    const now = clock.now();
    let r;
    if (HS.itemAt(save.home, c.x, c.y)) { r = HS.pickUp(save.home, c.x, c.y, now); if (r.ok) toast(HS.KINDS[r.kind].name + ' picked up.'); }
    else {
      r = HS.place(save.home, c.x, c.y, buildKind, cellFree, now);
      if (r.ok) toast(HS.KINDS[buildKind].name + ' placed.');
      else toast({ none: 'No ' + HS.KINDS[buildKind].name.toLowerCase() + ' left. Pick one up to move it.', ground: 'That spot is not open ground.', outside: 'Decorate inside the garden square.', taken: 'Something is already there.', full: 'The garden is full.' }[r.why] || 'Not here.');
    }
    if (r.ok) { lastAct = r.act; dirty = true; persist(); refreshDecor(); refreshGuests(); }
    return r;
  }
  function undoBuild() {
    if (!lastAct || !HS.undo(save.home, lastAct, clock.now())) { toast('Nothing to undo.'); return false; }
    lastAct = null; dirty = true; persist(); refreshDecor(); refreshGuests(); toast('Undone.');
    return true;
  }
  // decor art: one small canvas per kind, baked once
  const decorArt = {};
  function bakeDecor(kind) {
    if (decorArt[kind]) return decorArt[kind];
    const k = HS.KINDS[kind], s = Math.round(TILE * DPR), cv = mk(s, s), c = cv.getContext('2d');
    c.scale(DPR, DPR);
    c.fillStyle = 'rgba(0,0,0,0.2)'; c.fillRect(5, 25, 22, 4);
    if (kind === 'flowerbed') { c.fillStyle = k.alt; c.fillRect(4, 18, 24, 8); c.fillStyle = k.col; [[8, 15], [15, 12], [22, 15], [12, 19], [19, 19]].forEach((p) => c.fillRect(p[0] - 2, p[1] - 2, 5, 5)); c.fillStyle = '#fff4a8'; c.fillRect(14, 11, 2, 2); }
    else if (kind === 'lantern') { c.fillStyle = k.alt; c.fillRect(15, 10, 3, 17); c.fillStyle = k.col; c.fillRect(11, 4, 11, 9); c.fillStyle = '#fffbe0'; c.fillRect(14, 6, 5, 5); }
    else if (kind === 'bench') { c.fillStyle = k.col; c.fillRect(4, 14, 24, 5); c.fillRect(4, 8, 24, 3); c.fillStyle = k.alt; c.fillRect(6, 19, 3, 7); c.fillRect(23, 19, 3, 7); }
    else if (kind === 'fence') { c.fillStyle = k.col; c.fillRect(2, 12, 28, 3); c.fillRect(2, 19, 28, 3); c.fillStyle = k.alt; c.fillRect(5, 8, 4, 18); c.fillRect(23, 8, 4, 18); }
    else if (kind === 'birdbath') { c.fillStyle = k.alt; c.fillRect(13, 14, 6, 12); c.fillRect(7, 8, 18, 6); c.fillStyle = k.col; c.fillRect(9, 9, 14, 3); }
    else { c.fillStyle = k.col; c.fillRect(1, 1, 30, 3); c.fillRect(1, 27, 30, 3); c.fillRect(1, 1, 3, 29); c.fillRect(28, 1, 3, 29); c.fillStyle = k.alt; c.fillRect(6, 6, 20, 20); }
    decorArt[kind] = cv;
    return cv;
  }
  // pen guests: benched tames (not in the party, not the mount) rest in the pens, drawn from cached art
  let guests = [];
  function refreshGuests() {
    guests = [];
    if (!HOME) return;
    const list = HS.penGuests(save.home, tames), pp = HS.pens(save.home);
    list.forEach((t, i) => {
      const def = CR.get(t.sp), pen = pp[Math.floor(i / HS.PEN_GUESTS)];
      if (!pen) return;
      const art = ART && def ? baker.bake({ id: def.id, archetype: IC.ARCH[def.id] || ARCH_BY_SIZE[def.size] || 'blob', size: def.size, biome: DRAW_BIOME }, { dpr: DPR }) : null;
      guests.push({ id: t.id, sp: t.sp, art: art, x: (homeO.x + pen.x + 0.5) * TILE + ((i % 3) - 1) * 10, y: (homeO.y + pen.y + 0.5) * TILE + 6, t: i });
    });
  }
  // gather spots: daily-free, seeded by island + seed + day
  HS.rollDay(save.gather, DAY);
  const spots = HS.dailySpots(world.resources, ISLE + '|' + SEED, DAY, HS.MAX_SPOTS);
  const GATHER_R = 1.6 * TILE;
  function spotNear() {
    let best = null, bd = GATHER_R;
    spots.forEach((p) => { if (HS.taken(save.gather, ISLE, p.idx)) return; const d = Math.hypot((p.x + 0.5) * TILE - hero.x, (p.y + 0.5) * TILE - hero.y); if (d < bd) { bd = d; best = p; } });
    return best;
  }
  function gatherNear() {
    const p = spotNear();
    if (!p || hero.dead) return { ok: false, why: 'none' };
    const r = HS.gather(save.gather, ISLE, p, DAY);
    if (r.ok) { toast('You found ' + HS.resName(r.kind) + '. (' + r.total + ' in your log)'); dirty = true; persist(); }
    else if (r.why === 'today') toast('Already gathered here today. It grows back tomorrow.');
    return r;
  }
  // dock + sea chart
  const DOCK_R = 2.5 * TILE;
  const nearDock = () => !!world.dock && !hero.dead && Math.hypot((world.dock.x + 0.5) * TILE - hero.x, (world.dock.y + 0.5) * TILE - hero.y) <= DOCK_R;
  const DESTS = ISL.SAVED_ISLES.filter((id) => ISL.ISLES[id] && BP.resolveId(ISL.ISLES[id].pack));
  let travelling = '';
  function travelTo(id) {
    if (DESTS.indexOf(id) < 0 || id === ISLE || travelling) return false;
    const q = new URLSearchParams(location.search);
    q.set('isle', ISLE_PARAM[id] || id); q.set('at', 'dock'); q.delete('seed'); q.delete('from');
    travelling = id;
    if (ride) dismount();
    persist();
    toast('Sailing to ' + isleName(id) + '...');
    location.href = location.pathname + '?' + q.toString();
    return true;
  }
  // medals: computed from the saves, the summary key is additive and each new medal is announced once
  const sizeOf = (sp) => { const d = CR.get(sp); return d ? d.size : null; };
  let medals = ISL.cleanMedals(readJson(ISL.MEDALS_KEY)).m;
  const medalLog = [];
  function checkMedals() {
    const fresh = ISL.medalsFor(save, tames, sizeOf).filter((id) => medals.indexOf(id) < 0);
    if (!fresh.length) return [];
    const m = ISL.writeMedals(S, fresh);
    if (m) medals = m; else medals = medals.concat(fresh);
    fresh.forEach((id) => medalLog.push(id));
    toast('Medal: ' + fresh.map((id) => ISL.MEDAL_NAMES[id] || id).join(', '));
    return fresh;
  }
  const BOSS_SEE_R = 10 * TILE;
  function bossCheck() {
    (world.bossSites || []).forEach((b) => {
      if (Math.hypot((b.x + 0.5) * TILE - hero.x, (b.y + 0.5) * TILE - hero.y) > BOSS_SEE_R) return;
      if (ISL.noteBoss(save, b.boss)) { dirty = true; toast('You spotted the lair of the ' + b.boss.replace(/_/g, ' ') + '.'); checkMedals(); }
    });
  }
  const firstVisit = ISL.noteVisit(save, ISLE); // saved by the first save tick
  // ground layer drawn each frame from cached canvases: decor, pen guests, gather sparkles
  function drawGround() {
    if (HOME) {
      const g0 = save.home.grid;
      for (let i = 0; i < g0.length; i++) {
        const sx = (homeO.x + g0[i][0]) * TILE - camX, sy = (homeO.y + g0[i][1]) * TILE - camY;
        if (sx < -TILE || sy < -TILE || sx > VW || sy > VH) continue;
        g.drawImage(bakeDecor(g0[i][2]), sx, sy, TILE, TILE);
      }
      if (build) { g.strokeStyle = 'rgba(255,244,214,0.55)'; g.lineWidth = 2; g.strokeRect(homeO.x * TILE - camX, homeO.y * TILE - camY, HS.GRID_W * TILE, HS.GRID_W * TILE); }
      for (let i = 0; i < guests.length; i++) {
        const q = guests[i], sx = q.x - camX, sy = q.y - camY + Math.sin(simT * 2 + q.t) * 1.5;
        if (sx < -80 || sy < -80 || sx > VW + 80 || sy > VH + 80) continue;
        if (q.art) { const a = q.art, fr = a.frames.idle[CD.frameAt('idle', simT + q.t)], w = a.w / a.dpr * 0.45, h = a.h / a.dpr * 0.45; g.drawImage(fr, sx - w / 2, sy - a.ay / a.dpr * 0.45, w, h); }
        else { g.fillStyle = '#9ae07a'; g.beginPath(); g.arc(sx, sy - 6, 6, 0, Math.PI * 2); g.fill(); }
      }
    }
    const tw = REDUCED ? 0 : Math.sin(simT * 4) * 2;
    for (let i = 0; i < spots.length; i++) {
      const p = spots[i];
      if (HS.taken(save.gather, ISLE, p.idx)) continue;
      const sx = (p.x + 0.5) * TILE - camX, sy = (p.y + 0.5) * TILE - camY;
      if (sx < -TILE || sy < -TILE || sx > VW + TILE || sy > VH + TILE) continue;
      g.fillStyle = 'rgba(0,0,0,0.25)'; g.fillRect(sx - 7, sy + 5, 14, 3);
      g.fillStyle = '#fff4a8'; g.fillRect(sx - 1, sy - 8 - tw, 3, 11); g.fillRect(sx - 6, sy - 4 - tw, 13, 3);
      g.fillStyle = '#f2b84b'; g.fillRect(sx - 2, sy - 5 - tw, 5, 5);
    }
  }
  // ---- panels: sea chart, collection log, decor bar (44 px targets, plain text) ----
  const panel = $('panel'), panelBody = $('panel-body'), panelTitle = $('panel-title');
  let panelKind = '';
  const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text !== undefined) e.textContent = text; return e; };
  function closePanel() { panel.hidden = true; panelKind = ''; paused = false; }
  function openPanel(kind) {
    while (panelBody.firstChild) panelBody.removeChild(panelBody.firstChild);
    panelKind = kind;
    if (kind === 'sail') {
      panelTitle.textContent = 'Sea chart';
      panelBody.appendChild(el('p', 'calm', 'The boat is ready whenever you are. Where to?'));
      DESTS.filter((id) => id !== ISLE).forEach((id) => {
        const b = el('button', 'dest', (id === 'home' ? 'Home: ' : 'Sail to ') + isleName(id));
        b.type = 'button'; b.dataset.isle = id;
        b.addEventListener('click', () => travelTo(id));
        panelBody.appendChild(b);
      });
    } else {
      panelTitle.textContent = 'Island log';
      const gl = save.gather.log, keys = Object.keys(gl).sort();
      panelBody.appendChild(el('h3', '', 'Collection'));
      const ul = el('ul', 'log-list'); ul.id = 'log-collection';
      if (!keys.length) ul.appendChild(el('li', 'dim', 'Nothing gathered yet. Look for sparkles.'));
      keys.forEach((k) => { const li = el('li', '', HS.resName(k) + ' x' + gl[k]); li.dataset.res = k; ul.appendChild(li); });
      panelBody.appendChild(ul);
      const left = spots.filter((p) => !HS.taken(save.gather, ISLE, p.idx)).length;
      panelBody.appendChild(el('p', 'dim', 'Gather spots here today: ' + left + ' of ' + spots.length + '.'));
      panelBody.appendChild(el('h3', '', 'Creatures'));
      panelBody.appendChild(el('p', '', 'Seen ' + ISL.logCount(save, 'seen') + ', tamed ' + ISL.logCount(save, 'tamed') + ', in your stable ' + tames.roster.length + '.'));
      panelBody.appendChild(el('h3', '', 'Medals ' + medals.length + ' of ' + ISL.MEDAL_IDS.length));
      const ml = el('ul', 'log-list'); ml.id = 'log-medals';
      ISL.MEDAL_IDS.forEach((id) => { const on = medals.indexOf(id) >= 0; const li = el('li', on ? 'on' : 'dim', (on ? '[x] ' : '[ ] ') + (ISL.MEDAL_NAMES[id] || id)); li.dataset.medal = id; ml.appendChild(li); });
      panelBody.appendChild(ml);
    }
    panel.hidden = false;
    paused = true;
    const first = panelBody.querySelector('button') || $('panel-close');
    try { first.focus(); } catch (e) { /* ignore */ }
  }
  $('panel-close').addEventListener('click', closePanel);
  // the decor bar (home only)
  const decorBar = $('decor');
  const decorBtns = {};
  function refreshDecor() {
    HS.ORDER.forEach((k) => { const b = decorBtns[k]; if (!b) return; b.textContent = HS.KINDS[k].name + ' ' + (save.home.inv[k] | 0); b.setAttribute('aria-pressed', String(buildKind === k)); });
  }
  if (HOME) {
    HS.ORDER.forEach((k) => {
      const b = el('button', 'decor-btn'); b.type = 'button'; b.dataset.kind = k;
      b.addEventListener('click', () => { buildKind = k; refreshDecor(); });
      decorBtns[k] = b; decorBar.insertBefore(b, $('decor-undo'));
    });
    $('decor-undo').addEventListener('click', undoBuild);
    $('decor-done').addEventListener('click', () => setBuild(false));
    refreshDecor(); refreshGuests();
  }
  function setBuild(on) {
    if (!HOME) return false;
    build = on !== false;
    decorBar.hidden = !build;
    btn.build.setAttribute('aria-pressed', String(build));
    if (build) toast('Tap open ground in the garden square to place. Tap an item to pick it up.');
    return build;
  }

  // ---------- HUD ----------
  const hud = { hero: $('hud-hero'), isle: $('hud-isle'), info: $('hud-info'), ground: $('hud-ground'), fill: $('hp-fill'), hp: $('hp-text'), hint: $('hint') };
  const btn = { feed: $('btn-feed'), soothe: $('btn-soothe'), ride: $('btn-ride'), gather: $('btn-gather'), sail: $('btn-sail'), build: $('btn-build'), home: $('btn-home'), log: $('btn-log') };
  const lastBtn = {};
  const showBtn = (k, on) => { if (lastBtn[k] !== on) { lastBtn[k] = on; btn[k].hidden = !on; } };
  hud.hero.textContent = HERO.name + ' - ' + HERO.cls + ' Lv ' + HERO.level;
  const lastHud = {};
  const setText = (k, v) => { if (lastHud[k] !== v) { lastHud[k] = v; hud[k].textContent = v; } };
  function drawHud() {
    const tx = tileOf(hero.x), ty = tileOf(hero.y);
    setText('isle', PACK.name + ' - ' + bandName(O.zoneAt(world, tx, ty)));
    setText('hp', Math.ceil(hero.hp) + ' / ' + hero.maxHp);
    hud.fill.style.width = Math.round(100 * hero.hp / hero.maxHp) + '%';
    const lootN = Object.keys(loot).reduce((n, k) => n + loot[k], 0);
    setText('info', 'XP ' + xp + '  Kills ' + kills + '  Loot ' + lootN + (tames.roster.length ? '  Tames ' + tames.roster.length : '') + (party.length ? '  Party ' + party.length : ''));
    const tn = NAMES[O.tileAt(world, tx, ty)] || '';
    setText('ground', tn.replace(/_/g, ' ') + (hero.scale < 1 ? ' (slow x' + hero.scale + ')' : '') + (ride ? ' (riding x' + Math.round(hero.scale * 100) / 100 + ')' : ''));
    // the calm hint line + the Feed / Soothe / Ride buttons
    const ft = TAME ? feedTarget() : null;
    showBtn('feed', !!ft);
    showBtn('soothe', TAME);
    showBtn('ride', MOUNTS && !!mountEnt);
    showBtn('gather', !!spotNear());
    showBtn('sail', nearDock());
    showBtn('build', HOME);
    showBtn('home', !HOME);
    const h = hintText(ft);
    setText('hint', h);
    if (hud.hint.hidden !== !h) hud.hint.hidden = !h;
  }
  function hintText(ft) {
    if (build) return 'Decorating: tap open ground to place, tap an item to pick it up. E works too.';
    if (nearDock() && !ride) return 'The dock. Press T or Sail to open the sea chart.';
    if (spotNear()) return 'Something to gather here. Press G or Gather.';
    if (ride) return 'Riding ' + (mountEnt ? mountEnt.nm || 'your mount' : 'your mount') + '. Press R or Ride to get off.';
    if (!TAME) return '';
    if (ft) {
      const def = CR.get(ft.kind), f = IC.foodFor(def, pouch), food = IC.foodName(f.id) + ' x' + (pouch[f.id] | 0);
      const prog = Math.floor(ft.tm.prog) + '/' + ft.tm.need;
      if (ft.ko) return def.name + ' is asleep (' + Math.ceil(TM.sleepLeft(ft.tm)) + ' s). Feed it ' + food + ' - ' + prog + '. Do not hit it.';
      return def.name + ' trusts you. Stay calm and feed it ' + food + ' - ' + prog + '.';
    }
    let best = null, bd = 5 * TILE;
    for (let i = 0; i < creatures.length; i++) { const c = creatures[i]; if (!c.tm) continue; const d = Math.hypot(hero.x - c.x, hero.y - c.y); if (d < bd) { bd = d; best = c; } }
    if (!best) return '';
    const def = CR.get(best.kind);
    if (def.tame.method === 'knockout') return best.tm.torpor > 0 ? def.name + ' is getting drowsy. Keep up the soothe shots.' : def.name + ' can be tamed: knock it out with Soothe shots (Q), then feed it.';
    return def.name + ' is shy. Walk up slowly and do not attack.';
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
    if (e.code === 'KeyF' && !e.repeat) feed();
    if (e.code === 'KeyQ' && !e.repeat) toggleSoothe();
    if (e.code === 'KeyR' && !e.repeat) toggleRide();
    if (e.code === 'KeyG' && !e.repeat) gatherNear();
    if (e.code === 'KeyT' && !e.repeat && nearDock()) openPanel('sail');
    if (e.code === 'KeyL' && !e.repeat) { if (panelKind === 'log') closePanel(); else openPanel('log'); }
    if (e.code === 'KeyB' && !e.repeat && HOME) setBuild(!build);
    if (e.code === 'KeyE' && !e.repeat && build) buildAt(tileOf(hero.x + hero.face.x * TILE), tileOf(hero.y + hero.face.y * TILE));
    if (e.code === 'Escape' && !panel.hidden) closePanel();
  });
  document.addEventListener('keyup', (e) => { if (KEYMAP[e.code]) keys[KEYMAP[e.code]] = false; if (e.code === 'Space') firing = false; });
  window.addEventListener('blur', () => { Object.keys(keys).forEach((k) => { keys[k] = false; }); firing = false; stick.x = stick.y = 0; });
  view.addEventListener('pointerdown', (e) => {
    if (build) { buildAt(tileOf(e.clientX + camX), tileOf(e.clientY + camY)); return; } // decorating: taps place / pick up, never fire
    if (e.pointerType === 'touch') return;
    firing = true; aim = { x: e.clientX, y: e.clientY };
  });
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
  function toggleSoothe() { if (!TAME) return false; soothe = !soothe; btn.soothe.setAttribute('aria-pressed', String(soothe)); toast(soothe ? 'Soothe shots: they build torpor.' : 'Normal shots.'); return soothe; }
  btn.feed.addEventListener('click', () => { feed(); });
  btn.soothe.addEventListener('click', () => { toggleSoothe(); });
  btn.ride.addEventListener('click', () => { toggleRide(); btn.ride.setAttribute('aria-pressed', String(!!ride)); });
  btn.gather.addEventListener('click', () => { gatherNear(); });
  btn.sail.addEventListener('click', () => { openPanel('sail'); });
  btn.build.addEventListener('click', () => { setBuild(!build); });
  btn.home.addEventListener('click', () => { travelTo('home'); });
  btn.log.addEventListener('click', () => { if (panelKind === 'log') closePanel(); else openPanel('log'); });
  const coarse = (() => { try { return window.matchMedia('(pointer: coarse)').matches; } catch (e) { return false; } })();
  if (coarse || Q.get('touch') === '1' || ('ontouchstart' in window && window.innerWidth <= 700)) document.body.classList.add('touch');

  const vec = { mx: 0, my: 0 };
  function inputVec() {
    let mx = (keys.r ? 1 : 0) - (keys.l ? 1 : 0), my = (keys.d ? 1 : 0) - (keys.u ? 1 : 0);
    if (stick.x || stick.y) { mx = stick.x; my = stick.y; }
    vec.mx = mx; vec.my = my;
    return vec;
  }

  // ---------- simulation ----------
  const clock = (() => { let off = 0; return { now: () => Date.now() + off, set: (t) => { off = Number(t) - Date.now(); return clock.now(); } }; })();
  let spawnT = 0, miniT = 0, hudT = 0;
  let heroMoving = false;
  function update(dt, mx, my) {
    simT += dt;
    hero.t += dt; hero.iframes -= dt; hero.cd -= dt; hero.shotT -= dt;
    heroMoving = Math.hypot(mx, my) > 0.05;
    if (ride) CMP.rideStep(ride, dt);
    if (!hero.dead) moveHero(mx, my, dt);
    revealFog();
    spawnT -= dt;
    if (spawnT <= 0) { spawnT = 0.5; spawnTick(); bossCheck(); }
    stepCreatures(dt);
    stepBolts(dt);
    if (party.length) stepParty(dt);
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
  loadParty();
  revealFog();
  ISL.writeMedals(S, []); // the summary key exists from the first visit (additive)
  checkMedals();
  drawMini(); drawHud();
  requestAnimationFrame(frame);
  if (!savedIsle && !medalLog.length) toast(HOME ? 'Welcome home to ' + PACK.name + '.' : 'Welcome to the ' + PACK.name + '!');

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
      creatures: () => creatures.map((c) => ({ uid: c.uid, sp: c.sp, kind: c.kind, base: c.base, x: c.x, y: c.y, hp: c.hp, maxHp: c.maxHp, mood: c.mood, size: c.size, art: !!c.art,
        ph: c.ph, tg: c.ph === 'wind' ? { shape: specOf(c.sp, c.kind).atk.shape, left: c.pt, windup: specOf(c.sp, c.kind).atk.windup, big: specOf(c.sp, c.kind).atk.big } : null,
        ko: c.ko, calm: c.calm, hostile: c.hostile, lv: c.lv, st: c.tm ? c.tm.st : null, torpor: c.tm ? c.tm.torpor : 0, torporMax: c.tm ? c.tm.torporMax : 0,
        prog: c.tm ? c.tm.prog : 0, need: c.tm ? c.tm.need : 0 })),
      spawn: (sp, tx, ty) => (SPAWNABLE.indexOf(sp) >= 0 && creatures.length < CAP ? addCreature(sp, (tx + 0.5) * TILE, (ty + 0.5) * TILE, -1).uid : null),
      flags: () => ({ tame: TAME, companions: COMPANIONS, mounts: MOUNTS }),
      anger: (id) => { const c = creatures.find((x) => x.uid === id); if (c) c.angry = 30; return !!c; },
      soothe: (on) => { if (!TAME) return false; soothe = on !== false; return soothe; },
      feed: () => feed(),
      pouch: () => Object.assign({}, pouch),
      party: () => party.map((p) => ({ id: p.ent.id, sp: p.ent.sp, x: p.cs.x, y: p.cs.y, mode: p.cs.mode, hits: p.cs.hits || 0, dmg: p.dmg, down: p.cs.down })),
      ride: () => toggleRide(),
      riding: () => (ride ? { id: ride.id, speed: ride.m.speed, lift: ride.m.lift, overlay: CMP.overlay(ride, false).dy } : null),
      mountId: () => (mountEnt ? mountEnt.id : null),
      tames: () => JSON.parse(S.getItem(TAMES.KEY) || 'null'),
      tamesLive: () => JSON.parse(JSON.stringify(tames)),
      hurtLog: () => HURT_LOG.slice(),
      simT: () => simT,
      hint: () => hintText(TAME ? feedTarget() : null),
      nextTo: (id, dx) => { const c = creatures.find((x) => x.uid === id); if (!c) return null; hero.x = c.x + (Number(dx) || 0); hero.y = c.y; return snap(); },
      clearCreatures: () => { creatures = []; groupState.forEach((s) => { s.alive = 0; s.until = clock.now() + 1e9; }); },
      spawnTick: () => { spawnTick(); return creatures.length; },
      fire: (dx, dy) => { hero.cd = 0; return fire(dx, dy); },
      stats: () => ({ xp: xp, kills: kills, tamed: tamedN, loot: Object.assign({}, loot), bolts: bolts.length, chunks: chunkCache.size(), fog: FOG.count(fog), cap: CAP, dpr: DPR }),
      save: () => { persist(); return JSON.parse(S.getItem(ISL.KEY) || 'null'); },
      // B10
      home: () => (HOME ? { origin: Object.assign({}, homeO), grid: save.home.grid.map((c) => c.slice()), inv: Object.assign({}, save.home.inv), seeded: save.home.seeded,
        guests: guests.map((q) => q.sp), pens: HS.pens(save.home).length } : null),
      cellFree: (x, y) => cellFree(x, y),
      buildMode: (on) => setBuild(on),
      buildKind: (k) => { if (has(HS.KINDS, k)) buildKind = k; return buildKind; },
      buildAt: (x, y) => { const r = buildAt(homeO.x + x, homeO.y + y); return { ok: r.ok, why: r.why }; },
      undo: () => undoBuild(),
      dock: () => (world.dock ? { x: world.dock.x, y: world.dock.y } : null),
      nearDock: () => nearDock(),
      openPanel: (k) => { openPanel(k === 'sail' ? 'sail' : 'log'); return panelKind; },
      closePanel: () => closePanel(),
      destinations: () => DESTS.filter((id) => id !== ISLE),
      travel: (id) => travelTo(id),
      day: DAY,
      spots: () => spots.map((p) => ({ idx: p.idx, x: p.x, y: p.y, kind: p.kind, taken: HS.taken(save.gather, ISLE, p.idx) })),
      gather: () => gatherNear(),
      gatherLog: () => Object.assign({}, save.gather.log),
      medals: () => medals.slice(),
      medalLog: () => medalLog.slice(),
      checkMedals: () => checkMedals(),
      bossCheck: () => { bossCheck(); return save.bosses.slice(); },
    };
  }
}());
