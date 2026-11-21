// Mad Maze standalone page shell (Day 1 slice 3). Solo only, no network, no audio.
// Reads/writes the existing `realm` field of pixeltown-save-v1 (same glue as main.js loadSave/writeSave).
(function () {
  'use strict';
  const SAVE_KEY = 'pixeltown-save-v1';
  const params = new URLSearchParams(location.search);
  const TEST = params.get('test') === '1';
  const FROM_HUB = params.get('from') === 'hub'; // exact match only; anything else keeps the town exit
  // ?return=<world url> (set by a Realm World portal): a same-origin relative link back to the portal tile, exact shape only.
  const RETURN_RE = /^index\.html\?mode=world&seed=[A-Za-z0-9_-]{1,24}&at=\d{1,4},\d{1,4}(&test=1)?$/;
  const RETURN = params.get('mode') === 'dungeon' && RETURN_RE.test(params.get('return') || '') ? params.get('return') : null;
  const HOME = RETURN || (FROM_HUB ? '../../hub/index.html' : '../../index.html');
  // Embedded in the town page (same-origin iframe): leaving to town closes the overlay instead of navigating away.
  const EMBED = (() => { try { return window.self !== window.top; } catch (e) { return false; } })();
  function leaveToTown() { if (EMBED) { try { window.parent.postMessage({ pixeltown: 'close-realm' }, location.origin); return; } catch (e) { /* fall through */ } } location.href = HOME; }
  if (EMBED) document.addEventListener('click', (ev) => { const a = ev.target.closest && ev.target.closest('a[href$="../../index.html"]'); if (a) { ev.preventDefault(); leaveToTown(); } }, true);
  const HOME_LABEL = RETURN ? 'Back to the world' : FROM_HUB ? 'Back to the map' : 'Back to town';

  function loadSave() {
    try {
      const parsed = JSON.parse(localStorage.getItem(SAVE_KEY) || 'null');
      return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
    } catch (e) { return {}; }
  }
  function writeSave(partial) {
    try { localStorage.setItem(SAVE_KEY, JSON.stringify({ ...loadSave(), ...partial })); } catch (e) { /* no storage: play unsaved */ }
  }

  if ((window.matchMedia && matchMedia('(pointer: coarse)').matches) || 'ontouchstart' in window) document.body.classList.add('touch-device');

  // Daily seed: ?daily=1 (world or dungeon) uses the UTC-date seed; an explicit valid ?seed= still wins. ?today=YYYY-MM-DD only with ?test=1.
  const SEED_RE = /^[A-Za-z0-9_-]{1,24}$/;
  const DAILY_DATE = (() => {
    if (params.get('daily') !== '1' || !window.MMDaily) return null;
    const t = TEST ? MMDaily.cleanDate(params.get('today') || '') : null;
    return t || MMDaily.dateKey(new Date());
  })();
  const EXPLICIT_SEED = SEED_RE.test(params.get('seed') || '') ? params.get('seed') : null;
  const dailyFor = (kind) => (DAILY_DATE && !EXPLICIT_SEED ? String(MMDaily.dailySeed(DAILY_DATE, kind)) : null);
  const DBIOME = window.MMBiomes ? MMBiomes.clean(params.get('biome')) : 'warren'; // ?biome=warren|bramble|meadow|crypt (dungeon runs only; anything else = warren)
  let dungeon = null; // ?mode=dungeon&seed=N turns the arena into a Warren run; the default stays the solo arena
  let realmWorld = null; // ?mode=world (or ?world=1) turns it into the big scrolling Realm overworld (realm-world.js)
  const WORLD = (params.get('mode') === 'world' || params.get('world') === '1') && params.get('mode') !== 'dungeon' && !!window.RealmWorld && !!window.MMOverworld && !!window.MMZones;
  const arena = new RealmArena({
    container: document.getElementById('realm-canvas-wrap'),
    save: rmCleanSave(loadSave().realm),
    onSave: (s) => writeSave({ realm: s }),
    onExit: (why) => { if (dungeon && why === 'death') dungeon.onDeath(); else { if (realmWorld) realmWorld.api.settle('leave'); leaveToTown(); } }, // leaving the world pays the Lantern stash
  });

  arena.setMenuMode(true); // the standalone page opts in to the in-game menu (Esc / ☰) and the death screen; the town gate keeps the old behaviour

  // Same on-screen controls main.js wires for the in-town overlay.
  const stick = (id, apply) => {
    const base = document.getElementById(id);
    const knob = base.querySelector('.knob');
    let pid = null;
    const MAXR = 46;
    const set = (e) => {
      const b = base.getBoundingClientRect();
      let dx = e.clientX - (b.left + b.width / 2); let dy = e.clientY - (b.top + b.height / 2);
      const len = Math.hypot(dx, dy);
      if (len > MAXR) { dx = dx / len * MAXR; dy = dy / len * MAXR; }
      knob.style.transform = `translate(${dx}px, ${dy}px)`;
      apply(dx / MAXR, dy / MAXR, true);
    };
    const end = () => { pid = null; knob.style.transform = ''; apply(0, 0, false); };
    base.addEventListener('pointerdown', (e) => { e.preventDefault(); pid = e.pointerId; try { base.setPointerCapture(pid); } catch (err) { /* synthetic */ } set(e); });
    base.addEventListener('pointermove', (e) => { if (e.pointerId === pid) set(e); });
    ['pointerup', 'pointercancel', 'lostpointercapture'].forEach((ev) => base.addEventListener(ev, (e) => { if (pid === null || e.pointerId === pid) end(); }));
  };
  if (FROM_HUB) { const lb = document.getElementById('realm-leave-btn'); lb.textContent = window.innerWidth >= 561 ? '✖ Back to the map' : '✖ Map'; lb.setAttribute('aria-label', 'Back to the map: leave Mad Maze'); } // short label on phones so it is never cut off
  if (RETURN) { const lb = document.getElementById('realm-leave-btn'); lb.textContent = '✖ Exit'; lb.setAttribute('aria-label', 'Exit: leave the dungeon and go back to the world'); lb.title = 'To the world'; }
  document.getElementById('realm-leave-btn').addEventListener('click', () => arena.leave());
  for (let i = 0; i < 4; i++) document.getElementById(`realm-ab-${i}`).addEventListener('pointerdown', (e) => { e.preventDefault(); arena.cast(i); });
  document.getElementById('realm-bp-btn').addEventListener('click', () => arena.setPaused(true));
  document.getElementById('realm-board-btn').addEventListener('click', () => arena.setBoard(true));
  document.getElementById('realm-board-close').addEventListener('click', () => arena.setBoard(false));
  document.getElementById('realm-bp-close').addEventListener('click', () => arena.setPaused(false));
  document.getElementById('realm-backpack-body').addEventListener('click', (e) => {
    const btn = e.target.closest('button[data-act]');
    if (!btn) return;
    const uid = Number(btn.dataset.uid);
    if (btn.dataset.act === 'equip') arena.equip(uid); else if (btn.dataset.act === 'discard') arena.discard(uid);
  });
  stick('realm-stick-move', (x, y) => arena.setMoveStick(x, y));
  stick('realm-stick-aim', (x, y, on) => arena.setAimStick(x, y, on));

  if (params.get('mode') === 'dungeon' && window.MMDungeonRun) {
    const dSeed = dailyFor('dungeon');
    const hasSeed = !!EXPLICIT_SEED || !!dSeed;
    // layout version: explicit ?lv=2, or a fresh random seed (new run); a link with a seed and no lv keeps the original layouts
    dungeon = MMDungeonRun.create(arena, { bosses: params.get('bosses') === 'classic' ? 'classic' : '', layout: (params.get('lv') === '2' || !hasSeed || !!dSeed) ? 2 : 1, seed: hasSeed ? (EXPLICIT_SEED || dSeed) : String(Date.now() % 100000), home: HOME, homeLabel: HOME_LABEL, test: TEST, returnTo: RETURN, biome: DBIOME });
    document.body.classList.add('dungeon-mode');
  }
  if (WORLD) {
    realmWorld = RealmWorld.create(arena, { seed: dailyFor('world') || params.get('seed'), at: params.get('at'), test: TEST, home: HOME, assetRoot: params.get('tileart') === '0' ? null : '../../assets/arcane/' });
    document.body.classList.add('world-mode');
  }

  // Daily entry: a 44px 'Daily' link to the daily world (solo + world pages), or a 'Daily <date>' badge when a daily run is active.
  (function dailyUi() {
    if (!window.MMDaily || (dungeon && !DAILY_DATE)) return;
    const keep = (TEST ? '&test=1' : '') + (FROM_HUB ? '&from=hub' : '');
    const el = document.createElement(DAILY_DATE ? 'div' : 'a');
    el.id = 'mm-daily-btn';
    if (DAILY_DATE) el.textContent = 'Daily ' + DAILY_DATE;
    else { el.textContent = 'Daily'; el.href = '?mode=world&daily=1' + keep; el.setAttribute('aria-label', 'Play the Daily world'); }
    document.body.appendChild(el);
  })();

  // Hero art: the active hero (pixeltown-mm-active-v1, cleaned) picks its class animations; any other class keeps the sprite.
  function activeHeroClass() {
    try {
      if (!window.MMProfile) return null;
      const active = MMProfile.cleanActive(localStorage.getItem(MMProfile.ACTIVE_KEY));
      const prof = MMProfile.clean(localStorage.getItem(MMProfile.KEY));
      const h = (prof.heroes || []).find((x) => x.id === active.heroId) || (prof.heroes || [])[0]; // stale/missing active id -> first hero
      return h ? h.cls : null;
    } catch (e) { return null; }
  }
  const artClass = window.MMArt ? MMArt.artClassFor(activeHeroClass()) : null;
  if (artClass) {
    MMArt.loadClass('../../assets/arcane/', artClass).then((set) => { if (set.has(artClass)) arena.setHeroArt(set, artClass); }).catch(() => {});
  }

  // Dungeon tile art (b25 floors / walls / doors / torches / chests); ?dtiles=0 keeps the code-drawn rooms. Missing art falls back silently.
  if (dungeon && window.MMArt && MMArt.loadDungeonTiles && params.get('dtiles') !== '0') {
    MMArt.loadDungeonTiles('../../assets/arcane/').then((set) => { if (set.ids().length) dungeon.api.setTileArt(set); }).catch(() => {});
  }

  // Bolt art (b16 class bolts + hit sparks, b17 enemy bullets); ?boltart=0 keeps the code-drawn bolts. Missing art falls back silently.
  if (window.MMArt && MMArt.loadBolts && arena.setBoltArt && params.get('boltart') !== '0') {
    MMArt.loadBolts('../../assets/arcane/').then((set) => { if (set.ids().length) arena.setBoltArt(set, activeHeroClass()); }).catch(() => {});
  }

  // Effect art (b18 one-shot effects); ?fxart=0 turns it off. Missing art falls back silently.
  if (window.MMArt && MMArt.loadFx && arena.setFxArt && params.get('fxart') !== '0') {
    MMArt.loadFx('../../assets/arcane/').then((set) => { if (set.ids().length) arena.setFxArt(set); }).catch(() => {});
  }

  // Ability bar icons (b20 ability art in the .realm-ab buttons); ?uiicons=0 keeps the emoji. The F slot follows the class signature.
  if (arena.setAbilityIcons) arena.setAbilityIcons('../../assets/arcane/b20-class-portraits-and-ability-icons/abilities/');

  // Class stats: the active hero's class nudges HP/speed/damage/fire rate/safe time (MMClasses.arenaProfile); ?classstats=0 disables it.
  if (window.MMClasses && MMClasses.arenaProfile && params.get('classstats') !== '0' && activeHeroClass()) arena.setHeroProfile(MMClasses.arenaProfile(activeHeroClass()));
  // Class signature: the active hero's class gets a signature ability in the F slot (level 7, replaces Overdrive); ?signature=0 disables it.
  if (window.MMClasses && MMClasses.arenaSignature && params.get('signature') !== '0' && activeHeroClass()) arena.setHeroSignature(MMClasses.arenaSignature(activeHeroClass()));

  // Unlock nodes (S12): class passives, Nova II and Dash II (and the styled weapon items) follow the ACTIVE hero's class and level; ?unlocks=0 turns the nodes off.
  if (arena.setHeroLevelSource) arena.setHeroLevelSource(() => {
    if (!window.MMProfile) return null;
    const active = MMProfile.cleanActive(localStorage.getItem(MMProfile.ACTIVE_KEY)); const prof = MMProfile.clean(localStorage.getItem(MMProfile.KEY));
    const h = (prof.heroes || []).find((x) => x.id === active.heroId) || (prof.heroes || [])[0];
    return h ? { cls: h.cls, level: h.level } : null;
  });

  // Weapon styles (S10): the equipped weapon item's `wpn_<style>` id (or style/family fields) picks a MMWeapons spec for the active hero's class.
  // Base style / no styled weapon / ?weapons=0 / missing modules = today's fire (the arena hook decides). Re-applied on equip, hero switch and load.
  const WEAPONS_ON = params.get('weapons') !== '0' && !!(window.MMWeapons && window.MMProjectile && arena.setHeroWeapon);
  function equippedWeaponItem() {
    try {
      const sv = arena.save; const it = sv && sv.items ? sv.items.find((x) => x.n === (sv.eq || {}).weapon) : null;
      if (!it || typeof it.id !== 'string') return null;
      const m = /^wpn_([a-z_]{3,24})$/.exec(it.id);
      let def = null; try { def = RM_ITEMS.find((d) => d.id === it.id) || null; } catch (e) { def = null; }
      const style = m ? m[1] : (def && typeof def.style === 'string' ? def.style : '');
      return { id: it.id, r: Math.max(0, Math.min(3, Math.floor(Number(it.r)) || 0)), style, family: def && def.family ? def.family : '' };
    } catch (e) { return null; }
  }
  function weaponSpecFor(cls) {
    const it = equippedWeaponItem();
    return MMWeapons.resolve(cls, MMWeapons.styleFor(cls, it), it ? it.r : 0);
  }
  function applyWeapon() {
    if (!WEAPONS_ON) return null;
    try {
      const cls = activeHeroClass();
      const spec = cls ? weaponSpecFor(cls) : null;
      arena.setHeroWeapon(spec);
      return spec;
    } catch (e) { try { arena.setHeroWeapon(null); } catch (e2) { /* keep today's fire */ } return null; }
  }
  if (WEAPONS_ON) {
    const orig = arena._afterGearChange;
    if (typeof orig === 'function') arena._afterGearChange = function () { const r = orig.apply(this, arguments); applyWeapon(); return r; }; // equip / sell / buy / combine
    applyWeapon();
  }
  function weaponPanel(hero) {
    if (!WEAPONS_ON || !hero || !hero.cls) return undefined;
    try {
      const spec = weaponSpecFor(hero.cls);
      return { style: spec.name || spec.id, family: spec.family, pattern: MMWeapons.describe(spec), rarity: spec.rarity, affixes: spec.affixes || [] };
    } catch (e) { return undefined; }
  }

  // Enemy art: only the mapped arena creatures (idle/move/attack); any failure keeps the procedural sprites.
  if (window.MMArt && MMArt.loadEnemies && params.get('enemyart') !== '0' && !realmWorld) {
    MMArt.loadEnemies('../../assets/arcane/', { extra: dungeon ? MMBiomes.creatures(DBIOME) : [] }).then((set) => { if (set.classes().length) arena.setEnemyArt(set); }).catch(() => {});
  } else if (window.MMArt && MMArt.loadAll && params.get('enemyart') !== '0' && realmWorld) { // world: the zone creatures too (every enemy carries its creature id)
    const only = []; const add = (id) => { if (typeof id === 'string' && only.indexOf(id) < 0) only.push(id); };
    [MMArt.ENEMY_MAP, MMArt.DRIFTER_MAP].forEach((m) => Object.keys(m || {}).forEach((k) => add(m[k])));
    Object.keys(MMOverworld.CREATURE_TIERS).forEach((t) => MMOverworld.CREATURE_TIERS[t].forEach((tier) => tier.forEach(add)));
    MMArt.loadAll('../../assets/arcane/', { only, actions: ['idle', 'move', 'attack', 'death'], actionDirs: { death: ['down', 'right'] } }).then((set) => { if (set.classes().length) arena.setEnemyArt(set); }).catch(() => {});
  }

  // Item icons: backpack / shop / equipped slots show manifest art with emoji fallback; ?itemart=0 turns it off.
  if (window.MMArt && MMArt.loadItems && params.get('itemart') !== '0') {
    MMArt.loadItems('../../assets/arcane/').then((set) => { if (set.ids().length) arena.setItemArt(set); }).catch(() => {});
  }
  // Boss art: loaded lazily, one boss at a time (the realm asks for a boss id the first time that boss is drawn); ?bossart=0 disables it.
  if (window.MMArt && MMArt.loadBosses && params.get('bossart') !== '0') {
    MMArt.loadBosses('../../assets/arcane/', [MMArt.bossArtFor(0)]).then((set) => {
      arena.setBossArt(set, (id) => { MMArt.loadBosses('../../assets/arcane/', [id]).then((s2) => set.merge(s2)).catch(() => {}); });
    }).catch(() => {});
  }

  // ---------- Hero picker + stats panel (Realm menu / board button; shown first when the player owns several heroes) ----------
  const HS = window.MMHeroStats;
  const HERO_UI = !!(HS && window.MMProfile && window.MMClasses && WORLD && params.get('heropick') !== '0');
  const deepest = { z: -1 }; // deepest zone index seen this visit
  function heroState() {
    let prof = MMProfile.clean(null), act = { heroId: null };
    try { prof = MMProfile.clean(localStorage.getItem(MMProfile.KEY)); act = MMProfile.cleanActive(localStorage.getItem(MMProfile.ACTIVE_KEY)); } catch (e) { /* storage blocked */ }
    const hero = prof.heroes.find((x) => x.id === act.heroId) || prof.heroes[0] || null; // stale/missing active id falls back to the first hero
    return { prof, act: hero ? { v: 1, heroId: hero.id } : act, hero };
  }
  function applyHero(h) {
    if (params.get('classstats') !== '0') arena.setHeroProfile(MMClasses.arenaProfile(h.cls));
    if (params.get('signature') !== '0') arena.setHeroSignature(MMClasses.arenaSignature(h.cls));
    const ac = window.MMArt ? MMArt.artClassFor(h.cls) : null;
    if (arena.refreshHeroLevel) arena.refreshHeroLevel();
    applyWeapon();
    if (arena.setBoltClass) arena.setBoltClass(h.cls);
    arena.setHeroArt(null);
    if (ac) MMArt.loadClass('../../assets/arcane/', ac).then((set) => { const cur = heroState().hero; if (set.has(ac) && cur && cur.id === h.id) arena.setHeroArt(set, ac); }).catch(() => {});
  }
  const HERO_CAP = 12; // MMProfile roster cap (same as the Lantern)
  function unlockedSet(prof) {
    const ok = {}; MMClasses.START.forEach((c) => { ok[c] = true; });
    prof.heroes.concat(prof.hall).forEach((h) => { MMClasses.unlocks(h.cls, h.level).forEach((c) => { ok[c] = true; }); });
    return ok;
  }
  // Same record the Lantern's New Hero form builds (level 1, classic unless the account is on Picnic), written through MMProfile.clean.
  function createHero(cls) {
    const st = heroState(); const p = st.prof;
    if (p.heroes.length >= HERO_CAP || !unlockedSet(p)[cls] || !Object.prototype.hasOwnProperty.call(MMClasses.CLASSES, cls)) return null;
    let n = 1, id; do { id = 'hero-' + cls + '-' + (n++); } while (p.heroes.some((x) => x.id === id));
    p.heroes.push({ id, name: MMClasses.CLASSES[cls].name.slice(0, 24), cls, level: 1, xp: 0, fame: 0, bonus: 0, mode: p.mode === 'picnic' ? 'picnic' : 'classic', items: [] });
    try { localStorage.setItem(MMProfile.KEY, JSON.stringify(MMProfile.clean(p))); } catch (e) { return null; }
    return selectHero(id);
  }
  function selectHero(id) {
    const st = heroState(); const h = st.prof.heroes.find((x) => x.id === id);
    if (!h) return false; // locked cards and unknown ids never become active
    try { localStorage.setItem(MMProfile.ACTIVE_KEY, JSON.stringify(MMProfile.cleanActive({ v: 1, heroId: h.id }))); } catch (e) { return false; }
    applyHero(h);
    return h;
  }
  const STAT_ICON = { HP: 'stat_life', Damage: 'stat_power', 'Attack rate': 'stat_knack', Speed: 'stat_swift', 'Safe time': 'stat_guard', XP: 'stat_xp', 'Realm level': 'stat_xp', 'Base stats': 'stat_focus' };
  if (HERO_UI) {
    const ov = document.getElementById('realm-overlay');
    const mk = (tag, cls, txt) => { const e = document.createElement(tag); if (cls) e.className = cls; if (txt !== undefined) e.textContent = txt; return e; };
    const wrap = mk('div', 'rm-panel hidden'); wrap.id = 'realm-hero'; wrap.setAttribute('role', 'dialog'); wrap.setAttribute('aria-label', 'Heroes'); wrap.style.display = 'none';
    const card = mk('div', 'realm-bp-card rm-card hp-card-wrap');
    const head = mk('div', 'realm-bp-head'); const title = mk('strong', '', '🦸 Heroes');
    const close = mk('button', '', '✖'); close.type = 'button'; close.id = 'realm-hero-close'; close.setAttribute('aria-label', 'Close heroes');
    head.append(title, close);
    const tabs = mk('div', 'hp-tabs'); const tPick = mk('button', 'hp-tab', 'Pick hero'); const tStats = mk('button', 'hp-tab', 'Stats');
    tPick.type = tStats.type = 'button'; tPick.dataset.tab = 'pick'; tStats.dataset.tab = 'stats'; tabs.append(tPick, tStats);
    const status = mk('p', 'hp-status dim'); status.id = 'realm-hero-status'; status.setAttribute('aria-live', 'polite');
    const body = mk('div', 'hp-body'); body.id = 'realm-hero-body';
    card.append(head, tabs, status, body); wrap.appendChild(card); ov.appendChild(wrap);
    let tab = 'pick'; let creating = false; const arts = new Map(); let artLoading = false;
    const SW = { ranger: '#6fbf73', frostcaller: '#7ec8f0', herald: '#e8b86a', punk: '#e0679a', bruiser: '#a9784f', rogue: '#8a7ac8', warlock: '#7a3fb0', paladin: '#f0d36a', berserker: '#e8643c', druid: '#5aa05a', necromancer: '#6a8a7a', graveTender: '#7f9a5a', trickster: '#5ad0b0', shadowPaw: '#6a5a8a' };
    // b20 class portrait: replaces the colour swatch (and the animated canvas) once the image loads; a missing image keeps today's swatch / canvas.
    const PORTRAIT_ROOT = '../../assets/arcane/b20-class-portraits-and-ability-icons/portraits/portrait_';
    function portraitImg(cls, sw, cv, size) {
      const c = String(cls || '').toLowerCase(); if (params.get('uiicons') === '0' || !/^[a-z]+$/.test(c)) return null;
      const im = document.createElement('img'); im.className = 'hp-portrait'; im.alt = ''; im.setAttribute('aria-hidden', 'true'); im.draggable = false; im.hidden = true; im.dataset.cls = c;
      if (size) { im.style.width = im.style.height = size + 'px'; }
      im.addEventListener('load', () => { im.hidden = false; if (sw) sw.hidden = true; if (cv) { cv.hidden = true; cv.removeAttribute('data-art'); } });
      im.addEventListener('error', () => { im.remove(); });
      im.src = PORTRAIT_ROOT + c + '.png';
      return im;
    }
    function paintArts() {
      body.querySelectorAll('canvas.hp-art').forEach((cv) => {
        const ac = cv.getAttribute('data-art'); const set = arts.get(ac); const a = set && set.anim ? set.anim(ac, 'idle', 'down') : null;
        if (!a) return;
        const g = cv.getContext('2d'); g.clearRect(0, 0, cv.width, cv.height);
        try { set.draw(g, a, 0, cv.width / 2, Math.round(a.ay * 0.25) + 4, 0.25, false); cv.hidden = false; if (cv.previousSibling) cv.previousSibling.hidden = true; } catch (e) { /* keep the swatch */ }
      });
    }
    function loadArts(owned) {
      if (!window.MMArt || artLoading) return; const need = [];
      owned.forEach((h) => { const ac = MMArt.artClassFor(h.cls); if (ac && !arts.has(ac) && need.indexOf(ac) < 0) need.push(ac); });
      need.forEach((ac) => { arts.set(ac, null); MMArt.loadClass('../../assets/arcane/', ac, { actions: ['idle'], dirs: ['down'] }).then((set) => { if (set.has(ac)) { arts.set(ac, set); paintArts(); } }).catch(() => {}); });
    }
    function renderCreate() {
      const st = heroState(); const ok = unlockedSet(st.prof); body.textContent = '';
      body.appendChild(mk('p', 'dim', st.prof.heroes.length ? 'Choose a class for your new hero.' : 'Create your hero: pick a class to begin.'));
      const grid = mk('div', 'hp-grid');
      Object.keys(MMClasses.CLASSES).forEach((id) => {
        const lk = !ok[id]; const b = mk('button', 'hp-hero hp-new' + (lk ? ' locked' : '')); b.type = 'button'; b.dataset.newcls = id; if (lk) { b.disabled = true; b.setAttribute('aria-disabled', 'true'); }
        const sw = mk('span', 'hp-swatch', HS.className(MMClasses, id).charAt(0)); sw.style.background = SW[id] || '#8a63e0'; sw.setAttribute('aria-hidden', 'true');
        const pt0 = portraitImg(id, sw, null); if (pt0) b.append(sw, pt0, mk('span', 'hp-name', HS.className(MMClasses, id)), mk('span', 'hp-sub', MMClasses.CLASSES[id].ability.name)); else b.append(sw, mk('span', 'hp-name', HS.className(MMClasses, id)), mk('span', 'hp-sub', MMClasses.CLASSES[id].ability.name));
        if (lk) b.appendChild(mk('span', 'hp-hint', '🔒 ' + HS.lockHint(MMClasses, id)));
        grid.appendChild(b);
      });
      body.appendChild(grid);
      if (st.prof.heroes.length) { const back = mk('button', 'rm-btn hp-back', 'Back to heroes'); back.type = 'button'; back.dataset.back = '1'; body.appendChild(back); }
    }
    function renderPick() {
      if (creating) { renderCreate(); return; }
      const st = heroState(); const list = HS.pickerList(st.prof, MMClasses, st.act.heroId);
      body.textContent = '';
      if (!list.owned.length) body.appendChild(mk('p', 'dim', 'No heroes yet. Create one in the Lantern, then come back.'));
      const grid = mk('div', 'hp-grid'); grid.setAttribute('role', 'list');
      list.owned.concat(list.locked).forEach((h) => {
        const b = mk('button', 'hp-hero' + (h.active ? ' on' : '') + (h.locked ? ' locked' : '')); b.type = 'button'; b.setAttribute('role', 'listitem');
        b.dataset.hero = h.id; if (h.locked) { b.disabled = true; b.setAttribute('aria-disabled', 'true'); } else b.setAttribute('aria-pressed', h.active ? 'true' : 'false');
        const sw = mk('span', 'hp-swatch', (h.name || '?').charAt(0).toUpperCase()); sw.style.background = SW[h.cls] || '#8a63e0'; sw.setAttribute('aria-hidden', 'true');
        const cv = mk('canvas', 'hp-art'); cv.width = cv.height = 64; cv.hidden = true; cv.setAttribute('aria-hidden', 'true'); const ac = window.MMArt ? MMArt.artClassFor(h.cls) : null; if (ac) cv.setAttribute('data-art', ac);
        b.append(sw, cv, mk('span', 'hp-name', h.name), mk('span', 'hp-sub', h.clsName + (h.locked ? '' : ' · Lv ' + h.level)));
        const pt = portraitImg(h.cls, sw, cv); if (pt) b.insertBefore(pt, cv.nextSibling);
        if (h.locked) b.appendChild(mk('span', 'hp-hint', '🔒 ' + h.hint)); else if (h.active) b.appendChild(mk('span', 'hp-tag', 'Active'));
        grid.appendChild(b);
      });
      body.appendChild(grid); loadArts(list.owned); paintArts();
      const nb = mk('button', 'rm-btn hp-newbtn', st.prof.heroes.length >= HERO_CAP ? 'Roster full (' + HERO_CAP + ' heroes)' : '＋ New hero'); nb.type = 'button'; nb.dataset.newhero = '1'; nb.disabled = st.prof.heroes.length >= HERO_CAP; body.appendChild(nb);
    }
    function renderStats() {
      const st = heroState(); const hero = st.hero || { name: 'Wanderer', cls: '', level: arena.save.level, xp: 0 };
      const defs = {}; try { RM_ITEMS.forEach((i) => { defs[i.id] = i; }); } catch (e) { /* no defs */ }
      const wapi = realmWorld ? realmWorld.api : null; let z = -1; try { const zi = wapi && wapi.zone(); z = zi && zi.zone < 4 ? zi.zone : -1; } catch (e) { z = -1; }
      deepest.z = Math.max(deepest.z, z);
      let portals = 0; try { portals = RealmWorld.readSave().stats.portals; } catch (e) { portals = 0; }
      const rows = HS.panelRows(MMClasses, { hero, profile: arena.heroProfile || MMClasses.arenaProfile(null), stats: arena.stats, save: arena.save, defs, weapon: weaponPanel(hero), passives: window.MMUnlocks && hero.cls ? { level: arena.heroLevel ? arena.heroLevel() : arena.save.level, unlocks: MMUnlocks } : undefined, run: { kills: wapi ? wapi.kills() : 0, deepest: deepest.z < 0 ? null : deepest.z, portals, time: arena.clock } });
      body.textContent = ''; let grp = null, dl = null;
      rows.forEach((r) => {
        if (r.group !== grp) { grp = r.group; body.appendChild(mk('h3', 'hp-h', grp)); dl = mk('div', 'hp-rows'); body.appendChild(dl); }
        const row = mk('div', 'realm-board-row'); const lab = mk('span', '', r.label); row.append(lab, mk('b', '', r.value)); dl.appendChild(row);
        if (ICONS_ON && STAT_ICON[r.label]) { const im = iconImg(STAT_ICON[r.label], lab); im.classList.add('stat'); lab.insertBefore(im, lab.firstChild); }
      });
      if (st.hero) { const pt = portraitImg(hero.cls, null, null, 64); if (pt) { pt.classList.add('hp-portrait-stats'); body.insertBefore(pt, body.firstChild); } }
      if (!st.hero) body.insertBefore(mk('p', 'dim', 'No hero is active, so base stats apply. Pick one on the Pick hero tab.'), body.firstChild);
    }
    function render() {
      tPick.classList.toggle('on', tab === 'pick'); tStats.classList.toggle('on', tab === 'stats');
      tPick.setAttribute('aria-pressed', String(tab === 'pick')); tStats.setAttribute('aria-pressed', String(tab === 'stats'));
      body.scrollTop = 0; if (tab === 'pick') renderPick(); else renderStats();
    }
    arena.onHeroPanel = (t) => { tab = t === 'stats' ? 'stats' : 'pick'; creating = tab === 'pick' && heroState().prof.heroes.length === 0; render(); };
    tabs.addEventListener('click', (e) => { const b = e.target.closest('button[data-tab]'); if (!b) return; tab = b.dataset.tab; creating = tab === 'pick' && heroState().prof.heroes.length === 0; status.textContent = ''; render(); });
    close.addEventListener('click', () => arena.setPaused(false));
    body.addEventListener('click', (e) => {
      if (e.target.closest('button[data-newhero]')) { creating = true; status.textContent = ''; render(); return; }
      if (e.target.closest('button[data-back]')) { creating = false; render(); return; }
      const nc = e.target.closest('button[data-newcls]');
      if (nc) {
        if (nc.disabled) return; const first = heroState().prof.heroes.length === 0; const h = createHero(nc.dataset.newcls);
        if (!h) { status.textContent = 'Could not create that hero (roster full, class locked, or storage blocked).'; return; }
        creating = false; status.textContent = h.name + ' is ready. Class stats, abilities and art applied.';
        if (first) arena.setPaused(false); else renderPick();
        return;
      }
      const b = e.target.closest('button[data-hero]'); if (!b || b.disabled) return;
      const h = selectHero(b.dataset.hero); if (!h) { status.textContent = 'That hero cannot be used right now.'; return; }
      status.textContent = 'Now playing ' + h.name + ' (' + HS.className(MMClasses, h.cls) + '). Class stats, abilities and art applied; your run continues.';
      renderPick();
    });
    const bh = document.getElementById('realm-board-hero'); if (bh) bh.addEventListener('click', () => arena.openHeroPanel('stats'));
    setInterval(() => { try { const zi = realmWorld.api.zone(); if (zi && zi.zone < 4) deepest.z = Math.max(deepest.z, zi.zone); } catch (e) { /* ignore */ } }, 1500);
    window.__heroUi = { select: selectHero, create: createHero, open: (t) => arena.openHeroPanel(t) };
  } else { const bh = document.getElementById('realm-board-hero'); if (bh) bh.hidden = true; }

  // ---------- S13: unlock toast, ability sheet, UI icons (pixeltown-arms-v1 keeps the `seen` list) ----------
  const ARMS_KEY = 'pixeltown-arms-v1';
  const ICON_ROOT = '../../assets/arcane/b19-ui-icons/ui/ui_';
  const mkEl = (tag, cls, txt) => { const e = document.createElement(tag); if (cls) e.className = cls; if (txt !== undefined) e.textContent = txt; return e; };
  const overlayEl = document.getElementById('realm-overlay');
  const U = window.MMUnlocks;
  const armsRead = () => { try { return U.cleanArms(JSON.parse(localStorage.getItem(ARMS_KEY) || 'null')); } catch (e) { return U.cleanArms(null); } };
  const armsWrite = (a) => { try { localStorage.setItem(ARMS_KEY, JSON.stringify(a)); } catch (e) { /* storage blocked: toasts just repeat next visit */ } };

  // UI icons: an <img> from the b19 art placed before the emoji, which stays in the DOM (visually hidden) as text and as the fallback if the image fails.
  var ICONS_ON = params.get('uiicons') !== '0' && (!U || armsRead().hud.icons !== false);
  function iconImg(id, host) {
    const img = document.createElement('img'); img.className = 'mm-ico'; img.alt = ''; img.setAttribute('aria-hidden', 'true'); img.draggable = false; img.decoding = 'async';
    img.addEventListener('load', () => { host.classList.add('has-ico'); });
    img.addEventListener('error', () => { host.classList.remove('has-ico'); img.remove(); host.dataset.icoFail = '1'; });
    img.src = ICON_ROOT + id + '.png';
    return img;
  }
  function decorate(host, id) {
    if (!ICONS_ON || !host || host.dataset.icoFail || host.querySelector(':scope > .mm-ico')) return;
    let n = host.firstChild;
    while (n && !(n.nodeType === 3 && n.nodeValue.trim())) n = n.nextSibling;
    if (n && !host.querySelector(':scope > .emo')) {
      const m = /^\s*[^\sA-Za-z0-9(]+/u.exec(n.nodeValue);
      if (m) { const rest = n.nodeValue.slice(m[0].length).replace(/^\s+/, ''); const emo = mkEl('span', 'emo', m[0].trim()); n.nodeValue = (rest ? ' ' : '') + rest; host.insertBefore(emo, n); }
    }
    host.classList.add('ico-host');
    host.insertBefore(iconImg(id, host), host.firstChild);
  }
  const ICON_TARGETS = [['#realm-bp-btn', 'icon_backpack'], ['#realm-board-btn', 'icon_board'], ['#realm-leave-btn', 'icon_back'], ['#realm-menu-btn', 'icon_settings'],
    ['#realm-bp-close, #realm-board-close, #realm-hero-close, #realm-menu-close, #realm-shop-close', 'icon_close'], ['#realm-board-hero', 'icon_board'],
    ['.rm-btn[data-m="resume"]', 'icon_play'], ['.rm-btn[data-m="heroes"]', 'icon_party'], ['.rm-btn[data-m="herostats"]', 'icon_board'], ['.rm-btn[data-m="restart"]', 'icon_restart'],
    ['.rm-btn[data-m="leave"]', 'icon_nexus'], ['.rm-btn[data-d="again"]', 'icon_restart'], ['.rm-btn[data-d="leave"]', 'icon_nexus']];
  const RARITY_CLS = { common: 'common', uncommon: 'uncommon', rare: 'rare', epic: 'epic' };
  function decorateAll() {
    ICON_TARGETS.forEach((t) => { overlayEl.querySelectorAll(t[0]).forEach((el) => decorate(el, t[1])); });
    overlayEl.querySelectorAll('#realm-backpack-body li:not([data-rar])').forEach((li) => {
      const r = li.querySelector('.rar'); const k = r ? RARITY_CLS[r.textContent.trim().toLowerCase()] : null; // class names only, never user text
      if (k) { li.dataset.rar = k; li.classList.add('rar-' + k); } else li.dataset.rar = '';
    });
  }
  if (ICONS_ON) {
    let raf = 0; const sched = () => { if (!raf) raf = requestAnimationFrame(() => { raf = 0; try { decorateAll(); } catch (e) { /* cosmetic only */ } }); };
    new MutationObserver(sched).observe(overlayEl, { childList: true, subtree: true });
    sched();
  }

  // Unlock toast: shows 'Unlocked: <node> - <effect>' once per node. On the first look at a class, every node at or below the current level is
  // marked seen (no flood); after that, nodes the level reaches that are not in `seen` queue as toasts.
  let toastEl = null, toastTimer = 0; const toastQ = []; const baselined = {};
  function ensureToast() {
    if (toastEl) return toastEl;
    toastEl = mkEl('div', 'mm-toast hidden'); toastEl.id = 'mm-unlock-toast'; toastEl.setAttribute('role', 'status'); toastEl.setAttribute('aria-live', 'polite');
    const txt = mkEl('span', 'mm-toast-text'); const x = mkEl('button', 'mm-toast-x', '✖'); x.type = 'button'; x.id = 'mm-unlock-toast-x'; x.setAttribute('aria-label', 'Dismiss unlock message');
    x.addEventListener('click', () => nextToast());
    toastEl.append(txt, x); overlayEl.appendChild(toastEl); return toastEl;
  }
  function nextToast() {
    clearTimeout(toastTimer); toastTimer = 0; const el = ensureToast();
    const n = toastQ.shift();
    if (!n) { el.classList.add('hidden'); return; }
    el.querySelector('.mm-toast-text').textContent = 'Unlocked: ' + n.name + ' - ' + n.text;
    el.dataset.node = n.id; el.classList.remove('hidden');
    toastTimer = setTimeout(nextToast, 5000);
  }
  function unlockTick() {
    try {
      if (!U || !arena.save || document.hidden) return;
      const cls = activeHeroClass(); if (!cls) return;
      const lv = Math.floor(Number(arena.save.level)) || 1;
      let arms = armsRead();
      if (!baselined[cls]) { baselined[cls] = true; arms = U.markSeen(arms, cls, lv); armsWrite(arms); return; }
      const fresh = U.unseen(arms, cls, lv); if (!fresh.length) return;
      fresh.forEach((n) => { if (arms.seen.length < U.MAX_SEEN) arms.seen.push(n.id); });
      armsWrite(U.cleanArms(arms));
      fresh.forEach((n) => toastQ.push(n));
      if (!toastTimer) nextToast();
    } catch (e) { /* never break the game for a toast */ }
  }
  if (U) { unlockTick(); setInterval(unlockTick, 250); }

  // Ability sheet: long-press (500 ms) or right-click on an ability button. Esc, the close button or a tap outside closes it.
  let sheetEl = null;
  function closeSheet() { if (sheetEl) sheetEl.classList.add('hidden'); }
  function openSheet(i) {
    try {
      const ab = arena._ab(i); if (!ab) return;
      const lv = Math.floor(Number(arena.save.level)) || 1; const cls = activeHeroClass();
      if (!sheetEl) {
        sheetEl = mkEl('div', 'mm-sheet hidden'); sheetEl.id = 'mm-ab-sheet'; sheetEl.setAttribute('role', 'dialog'); sheetEl.setAttribute('aria-label', 'Ability details');
        overlayEl.appendChild(sheetEl);
      }
      sheetEl.textContent = '';
      const head = mkEl('div', 'mm-sheet-head'); head.appendChild(mkEl('strong', '', (ab.icon || '') + ' ' + ab.name + ' (' + String(ab.key).toUpperCase() + ')'));
      const x = mkEl('button', 'mm-sheet-x', '✖'); x.type = 'button'; x.id = 'mm-ab-sheet-x'; x.setAttribute('aria-label', 'Close ability details'); x.addEventListener('click', closeSheet); head.appendChild(x);
      sheetEl.appendChild(head);
      const cd = ab.id === 'dash' && U ? U.dashCooldown(lv) : ab.cd;
      const row = (k, v) => { const r = mkEl('div', 'mm-sheet-row'); r.append(mkEl('span', '', k), mkEl('b', '', v)); sheetEl.appendChild(r); };
      row('Cooldown', (Math.round(Number(cd) * 10) / 10) + ' s');
      row('Unlocks at', 'Level ' + ab.level + (lv >= ab.level ? ' (unlocked)' : ' (you are level ' + lv + ')'));
      if (U && cls) {
        const reached = U.forLevel(cls, lv).filter((n) => !/^(nova2|dash2)_/.test(n.id)); const nx = U.next(cls, lv);
        sheetEl.appendChild(mkEl('h4', '', 'Class passives'));
        if (!reached.length) sheetEl.appendChild(mkEl('p', 'dim', 'None yet.'));
        reached.forEach((n) => sheetEl.appendChild(mkEl('p', 'mm-sheet-node', '[x] ' + n.name + ' (Lv ' + n.lv + '): ' + n.text)));
        if (nx) sheetEl.appendChild(mkEl('p', 'mm-sheet-node next', 'Next, Lv ' + nx.lv + ': ' + nx.name + ' - ' + nx.text));
      }
      sheetEl.classList.remove('hidden');
    } catch (e) { closeSheet(); }
  }
  (function abilitySheet() {
    let timer = 0, sx = 0, sy = 0;
    const stop = () => { clearTimeout(timer); timer = 0; };
    for (let i = 0; i < 4; i++) {
      const b = document.getElementById('realm-ab-' + i); if (!b) continue;
      b.addEventListener('pointerdown', (e) => { if (e.button > 0) return; stop(); sx = e.clientX; sy = e.clientY; timer = setTimeout(() => { timer = 0; openSheet(i); }, 500); });
      b.addEventListener('pointermove', (e) => { if (timer && Math.hypot(e.clientX - sx, e.clientY - sy) > 12) stop(); });
      ['pointerup', 'pointercancel', 'pointerleave'].forEach((ev) => b.addEventListener(ev, stop));
      b.addEventListener('contextmenu', (e) => { e.preventDefault(); stop(); openSheet(i); });
    }
    document.addEventListener('pointerdown', (e) => { if (sheetEl && !sheetEl.classList.contains('hidden') && !sheetEl.contains(e.target) && !(e.target.closest && e.target.closest('.realm-ab'))) closeSheet(); }, true);
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && sheetEl && !sheetEl.classList.contains('hidden')) { closeSheet(); e.stopPropagation(); e.preventDefault(); } }, true);
  })();

  if (TEST) window.__mm = { applyWeapon, arena, dungeon: dungeon ? dungeon.api : null, world: realmWorld ? realmWorld.api : null };
  arena.start();
  // A fresh world visit with several owned heroes opens the picker first (?heropick=0 skips it).
  if (HERO_UI && (!TEST || params.get('heropick') === '1')) { try { if (heroState().prof.heroes.length !== 1) arena.openHeroPanel('pick'); } catch (e) { /* ignore */ } }
})();
