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
  // Embedded in the town page (same-origin iframe): leaving to town closes the overlay instead of navigating away.
  const EMBED = (() => { try { return window.self !== window.top; } catch (e) { return false; } })();
  // Where Leave goes (NAV-AUDIT #12): a dungeon portal run goes back to the world; ?from=hub goes to the map; the Town iframe keeps
  // its town exit (posts close-realm); otherwise the place the player came from (MMNav.backTarget: same-origin referrer, then the
  // last stored place that is not the Realm or the Town), else the World map. Never the Town join form with an empty name.
  const HUB = '../../hub/index.html';
  const HERE = 'game/games/mad-maze/index.html';
  const NAV = window.MMNav || null;
  function homeTarget() {
    if (RETURN) return { href: RETURN, label: 'Back to the world' };
    if (FROM_HUB) return { href: HUB, label: 'Back to the map' };
    if (EMBED) return { href: '../../index.html', label: 'Back to town' };
    const map = { href: HUB, label: 'Back to the map' };
    if (!NAV) return map;
    try {
      const b = NAV.backTarget({ referrer: document.referrer, origin: location.origin, file: HERE, current: 'realm', backHref: HUB, backLabel: 'the map' });
      if (b && b.id && b.id !== 'map') return { href: b.href, label: b.label };
      if (b && b.id === 'map') return map;
      const s = NAV.state(); // no usable referrer: the place visited before the Realm (stored by mm-nav, additive key)
      const e = [s.last, s.prev].find((x) => x && x.id !== 'realm');
      if (e && e.id !== 'town' && e.id !== 'map') { const href = NAV.urlFor(e.url, HERE); const p = NAV.place(e.id); if (href && p) return { href, label: 'Back to ' + p.name }; }
    } catch (e) { /* fall back to the map */ }
    return map;
  }
  const HOME_T = homeTarget();
  const HOME = HOME_T.href;
  const HOME_LABEL = HOME_T.label;
  function leaveToTown() { if (EMBED) { try { window.parent.postMessage({ pixeltown: 'close-realm' }, location.origin); return; } catch (e) { /* fall through */ } } location.href = HOME; }
  if (EMBED) document.addEventListener('click', (ev) => { const a = ev.target.closest && ev.target.closest('a[href$="../../index.html"]'); if (a) { ev.preventDefault(); leaveToTown(); } }, true);

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
  if (document.body.classList.contains('touch-device')) { // b08-r2-09: a phone player reads touch words, never key names
    const pf = document.getElementById('realm-play-focus'); if (pf) pf.textContent = 'Play: focus the game';
    const cw = document.getElementById('realm-canvas-wrap'); if (cw) cw.setAttribute('aria-label', 'Play the Realm: left stick moves, right stick aims and fires, ability buttons cast, Menu at the top');
  }

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
  // One exit scheme (NAV-AUDIT #8): the button always reads "Leave" (ends the run); its aria-label / title say where it goes
  // ("Back to the world" from a dungeon portal run, else "Back to <place>"). The id stays #realm-leave-btn.
  (function leaveLabel() {
    const lb = document.getElementById('realm-leave-btn'); if (!lb) return;
    lb.textContent = '✖ Leave';
    lb.setAttribute('aria-label', (RETURN ? 'Leave the dungeon: ' : 'Leave the Realm: ') + HOME_LABEL.charAt(0).toLowerCase() + HOME_LABEL.slice(1));
    lb.title = HOME_LABEL;
  })();
  document.getElementById('realm-leave-btn').addEventListener('click', () => arena.leave());
  // Keyboard players: the first Tab stop hands focus to the play field (a11y sweep; the full-screen field itself stays out of the Tab order)
  (function playFocus() {
    const b = document.getElementById('realm-play-focus'); const w = document.getElementById('realm-canvas-wrap'); if (!b || !w) return;
    b.addEventListener('click', () => {
      try { w.focus({ preventScroll: true }); } catch (e) { /* ignore */ }
      document.body.classList.add('rm-kbd-play'); // keyboard play mode (the field shows its focus ring)
      try { if (arena._showBanner) arena._showBanner('Playing: WASD move · Space fire · Esc menu', 1.6); } catch (e) { /* ignore */ }
    });
    w.addEventListener('blur', () => document.body.classList.remove('rm-kbd-play'));
  })();
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
    dungeon = MMDungeonRun.create(arena, { bosses: params.get('bosses') === 'classic' ? 'classic' : '', layout: (params.get('lv') === '2' || !hasSeed || !!dSeed) ? 2 : 1, seed: hasSeed ? (EXPLICIT_SEED || dSeed) : String(Date.now() % 100000), home: HOME, homeLabel: HOME_LABEL, fromHub: FROM_HUB, test: TEST, returnTo: RETURN, biome: DBIOME, floor: /^[23]$/.test(params.get('floor') || '') ? Number(params.get('floor')) : 1 }); // DV1: ?floor=2|3 only from the deep-run stairs
    document.body.classList.add('dungeon-mode');
  }
  if (WORLD) {
    realmWorld = RealmWorld.create(arena, { seed: dailyFor('world') || params.get('seed'), at: params.get('at'), test: TEST, home: HOME, assetRoot: params.get('tileart') === '0' ? null : '../../assets/arcane/' });
    // CO3: same-device co-op (BroadcastChannel only) behind ?party=local; ?seat=0-3 pins a seat (else auto). Without the flag nothing is opened.
    // The seat feeds realm-world's gear player ('p' + seat) through setTeam, so every seat rolls its own tiers on a shared kill.
    if (params.get('party') === 'local' && window.MMWorldTeam) {
      const seatQ = /^[0-3]$/.test(params.get('seat') || '') ? Number(params.get('seat')) : undefined;
      realmWorld.team = MMWorldTeam.create(arena, realmWorld.api, { party: 'local', seed: realmWorld.api.seed, seat: seatQ, loot: true });
      if (realmWorld.team.ok && realmWorld.api.setTeam) realmWorld.api.setTeam(realmWorld.team);
    }
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
  // W-01: one strip promise per art class (picker preload, page load and hero switch share it), so a switch never waits on a second fetch.
  const heroArtCache = new Map();
  const heroArtStat = { fallback: 0, applied: 0, failed: 0 }; // test counters (window.__heroArt)
  function heroArtP(ac) {
    if (!ac || !window.MMArt) return Promise.resolve(null);
    if (!heroArtCache.has(ac)) heroArtCache.set(ac, MMArt.loadClass('../../assets/arcane/', ac).then((set) => (set && set.has(ac) && set.anim(ac, 'idle', 'down') ? set : null)).catch(() => null));
    return heroArtCache.get(ac);
  }
  // R4-D2 (W-01): the 4 idle strips arrive long before the full ~20-strip class set on a slow link, so a hero is drawn from them first
  // (walk / attack fall back to idle in Realm._drawHero) and the full set replaces them when it resolves.
  const heroQuickCache = new Map();
  function heroQuickP(ac) {
    if (!ac || !window.MMArt) return Promise.resolve(null);
    if (!heroQuickCache.has(ac)) heroQuickCache.set(ac, MMArt.loadClass('../../assets/arcane/', ac, { actions: ['idle'] }).then((set) => (set && set.has(ac) && set.anim(ac, 'idle', 'down') ? set : null)).catch(() => null));
    return heroQuickCache.get(ac);
  }
  const heroFull = new Set(); // classes whose full set is already applied (a late quick set never replaces it)
  window.__heroArt = { stat: heroArtStat, cached: () => Array.from(heroArtCache.keys()) };
  const artClass = window.MMArt ? MMArt.artClassFor(activeHeroClass()) : null;
  if (artClass) { // only applied while it is still the active hero's class (a later pick must not be overwritten by this slower request)
    heroArtP(artClass).then((set) => { if (set && MMArt.artClassFor(activeHeroClass()) === artClass) { arena.setHeroArt(set, artClass); heroArtStat.applied++; } }).catch(() => {});
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
  // T-bags (b02-06): the world loot bags use the b15 bag art (6 tiers, outlined, 24 px) instead of the code squares, and a T12 drop shows the
  // red bag with its soulbound sparkle baked in (static; no per-frame work). Swapped into the arena's bag sprite table once the strips load;
  // any failure keeps the code bags. ?bagart=0 turns it off.
  const BAG_ART = { stat: { loaded: 0, t12: 0 } }; window.__bagArt = BAG_ART;
  if (realmWorld && arena.sprites && Array.isArray(arena.sprites.worldBag) && params.get('bagart') !== '0') {
    const BDIR = '../../assets/arcane/b15-loot-bags-and-drops/sprites/';
    const ids = ['bag_brown', 'bag_pink', 'bag_purple', 'bag_cyan', 'bag_white', 'bag_gold', 'bag_red', 'bag_soulbound_sparkle']; // index = MMZones BAG_TIERS order, then T12 red + sparkle
    const load = (id) => new Promise((res) => { const im = new Image(); im.onload = () => res(im); im.onerror = () => res(null); im.src = BDIR + id + '.png'; });
    Promise.all(ids.map(load)).then((ims) => {
      if (ims.slice(0, 7).some((im) => !im || im.naturalWidth < 24)) return; // all or nothing: never a mixed set
      const bake = (im, spark) => { const c = document.createElement('canvas'); c.width = c.height = 26; const g = c.getContext('2d'); g.imageSmoothingEnabled = false;
        g.drawImage(im, 0, 0, 24, 24, 1, 2, 24, 24); if (spark) g.drawImage(spark, 24, 0, 24, 24, 1, 0, 24, 24); return c; }; // frame 0 of each strip, feet at y 23
      for (let i = 0; i < 6; i++) arena.sprites.worldBag[i] = bake(ims[i], null);
      arena.sprites.worldBag[6] = bake(ims[6], ims[7] && ims[7].naturalWidth >= 48 ? ims[7] : null);
      BAG_ART.stat.loaded = 7;
      const od = arena.dropBag;
      arena.dropBag = function (x, y, rarity, itemId, worldLoot, gear) { const b = od.apply(arena, arguments); if (b && gear && gear.t === 12) { b.tier = 6; BAG_ART.stat.t12++; } return b; };
    }).catch(() => {});
  }

  // Boss art: loaded lazily, one boss at a time (the realm asks for a boss id the first time that boss is drawn); ?bossart=0 disables it.
  // W-02: also preloaded before it wakes: a world boss site within 16 tiles (wake radius is 9) and a dungeon room next to the boss room.
  if (window.MMArt && MMArt.loadBosses && params.get('bossart') !== '0') {
    const BROOT = '../../assets/arcane/'; const bossReq = Object.create(null); const bossStat = { req: [], merged: [] }; let bossSet = null;
    const wantBoss = (id) => {
      if (!bossSet || typeof id !== 'string' || bossReq[id] || bossSet.has(id) || MMArt.BOSS_MAP.indexOf(id) < 0) return;
      bossReq[id] = 1; bossStat.req.push(id);
      MMArt.loadBosses(BROOT, [id]).then((s2) => { bossSet.merge(s2); bossStat.merged.push(id); }).catch(() => {});
    };
    const PRE_R = 16 * 32;
    const nearScan = () => {
      const p = arena.player; if (!bossSet || !p) return;
      try {
        if (realmWorld && realmWorld.api && realmWorld.api.bossArtIds) {
          const ids = realmWorld.api.bossArtIds(); const sites = ids.length ? realmWorld.api.bossSites() : [];
          for (let i = 0; i < sites.length; i++) { const s = sites[i]; if (!bossSet.has(s.boss) && !bossReq[s.boss] && Math.hypot(p.x - (s.x + 0.5) * 32, p.y - (s.y + 0.5) * 32) <= PRE_R) wantBoss(s.boss); }
        } else if (dungeon && dungeon.api && dungeon.api.graph && window.MMBiomes && MMBiomes.bossFor) {
          const g = dungeon.api.graph, cur = dungeon.api.room; const boss = (g.rooms || []).find((r) => r.type === 'boss');
          if (boss && cur !== null && cur !== undefined && (cur === boss.id || (g.doors || []).some((d) => (d.a === cur && d.b === boss.id) || (d.b === cur && d.a === boss.id)))) {
            const bf = MMBiomes.bossFor(dungeon.api.biome, dungeon.api.seed, params.get('bosses') === 'classic'); if (bf && bf.boss_art) wantBoss(bf.boss_art);
          }
        }
      } catch (e) { /* the lazy first-draw loader still covers it */ }
    };
    window.__bossArt = { stat: bossStat, scan: nearScan };
    MMArt.loadBosses(BROOT, [MMArt.bossArtFor(0)]).then((set) => {
      bossSet = set; arena.setBossArt(set, wantBoss); nearScan();
      setInterval(nearScan, 500);
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
    // W-01: the previous sprite stays on screen until the new strip resolves (no fallback orb / empty frame); the code fallback only when it fails.
    if (!ac) { arena.setHeroArt(null); heroArtStat.fallback++; return; }
    heroQuickP(ac).then((set) => {
      const cur = heroState().hero; if (!set || !cur || cur.id !== h.id || heroFull.has(ac)) return;
      arena.setHeroArt(set, ac); heroArtStat.quick = (heroArtStat.quick || 0) + 1;
    }).catch(() => {});
    heroArtP(ac).then((set) => {
      const cur = heroState().hero; if (!cur || cur.id !== h.id) return;
      if (set) { heroFull.add(ac); arena.setHeroArt(set, ac); heroArtStat.applied++; } else { arena.setHeroArt(null); heroArtStat.fallback++; heroArtStat.failed++; }
    }).catch(() => {});
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
    const rec = p.heroes[p.heroes.length - 1];
    // S-10 (b15-02): with site data blocked the hero cannot be saved; play it for this visit instead of leaving a fresh player stuck in the picker
    try { localStorage.setItem(MMProfile.KEY, JSON.stringify(MMProfile.clean(p))); } catch (e) { applyHero(rec); rec.sessionOnly = true; return rec; }
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
    // cyc5-G (b12-r3-01 hero pick pop-in): every class portrait is fetched AND decoded once, as the page boots, so a card built after that is
    // drawn with its portrait in the same frame (no swatch -> portrait swap). The picker card stays invisible until they are decoded (capped).
    const portraitCache = new Map(); // cls -> { ok, failed, p }
    function portraitP(cls) {
      const c = String(cls || '').toLowerCase(); if (params.get('uiicons') === '0' || !/^[a-z]+$/.test(c)) return Promise.resolve(false);
      if (!portraitCache.has(c)) {
        const e = { ok: false, failed: false, p: null }; const im = new Image(); im.decoding = 'async';
        e.p = new Promise((res) => {
          im.onload = () => { const dec = typeof im.decode === 'function' ? im.decode().catch(() => {}) : Promise.resolve(); dec.then(() => { e.ok = im.naturalWidth > 0; e.img = im; res(e.ok); }); };
          im.onerror = () => { e.failed = true; res(false); };
        });
        im.src = PORTRAIT_ROOT + c + '.png'; portraitCache.set(c, e);
      }
      return portraitCache.get(c).p;
    }
    const portraitsP = Promise.all(Object.keys(MMClasses.CLASSES).map(portraitP));
    function portraitImg(cls, sw, cv, size) {
      const c = String(cls || '').toLowerCase(); if (params.get('uiicons') === '0' || !/^[a-z]+$/.test(c)) return null;
      const pc = portraitCache.get(c); if (pc && pc.failed) return null; // known 404: keep the swatch, no request
      const im = document.createElement('img'); im.className = 'hp-portrait'; im.alt = ''; im.setAttribute('aria-hidden', 'true'); im.draggable = false; im.hidden = true; im.dataset.cls = c;
      if (size) { im.style.width = im.style.height = size + 'px'; }
      if (pc && pc.ok) { im.hidden = false; if (sw) sw.hidden = true; if (cv) { cv.hidden = true; cv.removeAttribute('data-art'); } } // decoded: shown in the first frame
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
      list.owned.slice(0, 6).forEach((h) => { if (window.MMArt) heroArtP(MMArt.artClassFor(h.cls)); }); // W-01: warm the full class strips while the picker is open
      const nb = mk('button', 'rm-btn hp-newbtn', st.prof.heroes.length >= HERO_CAP ? 'Roster full (' + HERO_CAP + ' heroes)' : '＋ New hero'); nb.type = 'button'; nb.dataset.newhero = '1'; nb.disabled = st.prof.heroes.length >= HERO_CAP; body.appendChild(nb);
    }
    function renderStats() {
      const st = heroState(); const hero = st.hero || { name: 'Wanderer', cls: '', level: arena.save.level, xp: 0 };
      const defs = {}; try { RM_ITEMS.forEach((i) => { defs[i.id] = i; }); } catch (e) { /* no defs */ }
      // G14: RM_ITEMS has no armor, so the equipped armor gets a friendly def from MMGear (name without tier prefix; itemRows adds 'T5 ').
      try {
        const sv = arena.save; const ai = sv && sv.items && sv.eq ? sv.items.find((x) => x && x.n === sv.eq.armor) : null;
        if (ai && typeof ai.id === 'string' && !defs[ai.id]) {
          let nm = ''; try { if (window.MMGear) { const d = MMGear.describe(ai); if (d) nm = d.name.replace(/^T\d+ /, ''); } } catch (e2) { nm = ''; }
          if (!nm) nm = String(ai.id).replace(/^(arm|armor)_/, '').replace(/_t\d+$/, '').replace(/_/g, ' ').replace(/\b[a-z]/g, (c) => c.toUpperCase());
          defs[ai.id] = { id: ai.id, name: nm, slot: 'armor' };
        }
      } catch (e) { /* armor row stays empty */ }
      const wapi = realmWorld ? realmWorld.api : null; let z = -1; try { const zi = wapi && wapi.zone(); z = zi && zi.zone < 4 ? zi.zone : -1; } catch (e) { z = -1; }
      deepest.z = Math.max(deepest.z, z);
      let portals = 0; try { portals = RealmWorld.readSave().stats.portals; } catch (e) { portals = 0; }
      // Gear stats (G14): base = the arena's no-gear stats when it exposes them (G8), else the totals themselves (gear column reads 0).
      let gearBase = null; try {
        if (arena.statsBase && typeof arena.statsBase === 'object') gearBase = arena.statsBase;
        else if (typeof arena._calcStats === 'function' && arena._calcStats.length >= 1) { const keep = arena.stats; try { const b = arena._calcStats({ noGear: true }); if (b && typeof b === 'object' && b !== keep) gearBase = b; } finally { arena.stats = keep; } }
        if (!gearBase && arena.stats && typeof arena.stats === 'object') gearBase = Object.assign({}, arena.stats);
      } catch (e) { gearBase = null; }
      let gearGp = null; try { const g = arena.save && arena.save.gp; if (g && typeof g === 'object') gearGp = g; } catch (e) { gearGp = null; }
      const rows = HS.panelRows(MMClasses, { hero, profile: arena.heroProfile || MMClasses.arenaProfile(null), stats: arena.stats, save: arena.save, defs, weapon: weaponPanel(hero), passives: window.MMUnlocks && hero.cls ? { level: arena.heroLevel ? arena.heroLevel() : arena.save.level, unlocks: MMUnlocks } : undefined, run: { kills: wapi ? wapi.kills() : 0, deepest: deepest.z < 0 ? null : deepest.z, portals, time: arena.clock }, statsBase: gearBase, gp: gearGp });
      const gearAria = {}; try { HS.statTable(arena.stats, gearBase).forEach((r) => { gearAria[r.label] = r; }); } catch (e) { /* no gear rows */ }
      body.textContent = ''; let grp = null, dl = null;
      rows.forEach((r) => {
        if (r.group !== grp) { grp = r.group; body.appendChild(mk('h3', 'hp-h', grp)); dl = mk('div', 'hp-rows'); body.appendChild(dl); }
        const row = mk('div', 'realm-board-row'); if (r.group === 'Gear stats') { row.style.flexWrap = 'wrap'; row.style.gap = '2px 12px'; } const lab = mk('span', '', r.label); const val = mk('b', '', r.value); row.append(lab, val); dl.appendChild(row);
        if (r.group === 'Gear stats') {
          const g = gearAria[r.label];
          if (g) { const ar = g.gear > 0 ? '\u25B2' : g.gear < 0 ? '\u25BC' : '='; val.textContent = ar + ' ' + r.value; val.setAttribute('aria-label', g.aria); row.dataset.gear = g.gear > 0 ? 'up' : g.gear < 0 ? 'down' : 'same'; }
          else if (r.label === 'Boss luck') { val.setAttribute('aria-label', 'Boss luck: ' + r.value); row.dataset.gear = 'luck'; }
        }
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
    // cyc5-G (b12-r3-01): the first open waits (capped, load-independent) for the decoded portraits with the card invisible, then renders once,
    // complete; the classes a first pick can choose get their idle strips warmed at the same time, so the picked hero is drawn at once.
    const WARM_CAP = 1200, FIRST_CAP = 1500; let warmed = false; const warm = window.__heroWarm = { waits: 0, revealedAt: 0, capped: false };
    function warmStrips() {
      if (!window.MMArt) return; const st = heroState();
      const cls = st.prof.heroes.length ? st.prof.heroes.slice(0, 6).map((h) => h.cls) : Object.keys(unlockedSet(st.prof));
      cls.forEach((c) => { const ac = MMArt.artClassFor(c); if (ac) heroQuickP(ac); });
    }
    arena.onHeroPanel = (t) => {
      tab = t === 'stats' ? 'stats' : 'pick'; creating = tab === 'pick' && heroState().prof.heroes.length === 0;
      if (warmed) { render(); return; }
      warmStrips(); warm.waits++; card.style.visibility = 'hidden'; wrap.setAttribute('aria-busy', 'true');
      let capT = 0; const cap = new Promise((r) => { capT = setTimeout(() => { warm.capped = true; r(); }, WARM_CAP); });
      Promise.race([portraitsP, cap]).then(() => {
        clearTimeout(capT); warmed = true; card.style.visibility = ''; wrap.removeAttribute('aria-busy'); warm.revealedAt = Math.round(performance.now());
        if (arena.panel === 'hero') render();
      });
    };
    tabs.addEventListener('click', (e) => { const b = e.target.closest('button[data-tab]'); if (!b) return; tab = b.dataset.tab; creating = tab === 'pick' && heroState().prof.heroes.length === 0; status.textContent = ''; render(); });
    close.addEventListener('click', () => arena.setPaused(false));
    body.addEventListener('click', (e) => {
      if (body.getAttribute('aria-busy') === 'true') return; // first hero being readied: a second tap never creates another
      if (e.target.closest('button[data-newhero]')) { creating = true; status.textContent = ''; render(); return; }
      if (e.target.closest('button[data-back]')) { creating = false; render(); return; }
      const nc = e.target.closest('button[data-newcls]');
      if (nc) {
        if (nc.disabled) return; const first = heroState().prof.heroes.length === 0; const h = createHero(nc.dataset.newcls);
        if (!h) { status.textContent = 'Could not create that hero (roster full, class locked, or storage blocked).'; return; }
        creating = false; status.textContent = h.sessionOnly ? h.name + ' is ready for this visit (site data is blocked, so heroes are not saved).' : h.name + ' is ready. Class stats, abilities and art applied.';
        // cyc5-G (b12-r3-01): the first hero's world reveal waits (capped) for its idle strip, so the world never shows the code orb or an
        // empty pad first; the strip was warmed when the grid opened, so this is usually already resolved.
        if (first) {
          const ac = window.MMArt ? MMArt.artClassFor(h.cls) : null; const t0 = performance.now(); body.setAttribute('aria-busy', 'true');
          let capT = 0; const cap = new Promise((r) => { capT = setTimeout(r, FIRST_CAP); });
          Promise.race([ac ? heroQuickP(ac) : Promise.resolve(null), cap]).then(() => {
            clearTimeout(capT); body.removeAttribute('aria-busy'); warm.firstWait = Math.round(performance.now() - t0);
            if (arena.panel === 'hero') arena.setPaused(false);
          });
        } else renderPick();
        return;
      }
      const b = e.target.closest('button[data-hero]'); if (!b || b.disabled) return;
      const h = selectHero(b.dataset.hero); if (!h) { status.textContent = 'That hero cannot be used right now.'; return; }
      status.textContent = 'Now playing ' + h.name + ' (' + HS.className(MMClasses, h.cls) + '). Class stats, abilities and art applied; your run continues.';
      renderPick();
    });
    // R4-D2 (W-01 / b12-r2-01): the create grid warms a class's strips on hover, focus or press, so the first-hero pick is usually drawn
    // from its first frame (the press -> click gap plus one manifest round trip); the sprite then swaps in without the empty-pad gap.
    const warmNew = (e) => { const b = e.target.closest && e.target.closest('button[data-newcls]'); if (!b || b.disabled || !window.MMArt) return; const ac = MMArt.artClassFor(b.dataset.newcls); heroQuickP(ac); heroArtP(ac); };
    ['pointerover', 'pointerdown', 'focusin'].forEach((ev) => body.addEventListener(ev, warmNew));
    body.addEventListener('pointerover', (e) => { const b = e.target.closest && e.target.closest('button[data-hero]'); if (!b || b.disabled) return; const h = heroState().prof.heroes.find((x) => x.id === b.dataset.hero); if (h && window.MMArt) heroArtP(MMArt.artClassFor(h.cls)); });
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
  const ICON_TARGETS = [['#realm-bp-btn', 'icon_backpack'], ['#realm-board-btn', 'icon_board'], ['#realm-leave-btn', 'icon_back'], // #realm-menu-btn keeps its ☰ glyph: the gear art belongs to Settings only (NAV-AUDIT #9)
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

  // ---------- AX2 + PF3: settings sheet (palette, HUD size, reduce motion, flashes, low graphics, bullet outline, ambient music) ----------
  // Prefs live in `pixeltown-access-v1` via MMAccess.prefs (corrupt -> defaults). Everything applies live: body classes + CSS vars on the
  // Realm root + the arena hooks that exist (setReduceMotion, the flash vignette, the pooled spark / death-ghost arrays, the render-scale guard).
  const AXM = window.MMAccess && MMAccess.prefs ? MMAccess : null;
  const AX_ON = !!AXM && params.get('settings') !== '0';
  // AR (NEXT-SLICES-3 Wave 4): one-thumb mode, aim toggle, bullet shapes, HUD text scale in the Realm. ?access2=0 turns them off (the page as before).
  const AX2 = typeof arena.enableAccess2 === 'function' && params.get('access2') !== '0' ? !!arena.enableAccess2() : false;
  let axPrefs = null; try { axPrefs = AX_ON ? AXM.prefs.load(localStorage) : null; } catch (e) { axPrefs = AX_ON ? AXM.prefs.load(null) : null; } // S-10 (b15-02): blocked site data must not stop the Realm booting
  const PERF_ON = !!window.MMPerf;
  const perfSt = { prev: null, samples: [], result: null, auto: false, pools: { sparks: null, ghosts: null }, pf: null };
  function perfPools() { // keep the original pool arrays so caps are fully reversible
    if (arena._sparks && !perfSt.pools.sparks) perfSt.pools.sparks = arena._sparks.slice();
    if (arena._edGhosts && !perfSt.pools.ghosts) perfSt.pools.ghosts = arena._edGhosts.slice();
  }
  function capPool(arr, orig, n) { if (!arr || !orig) return; const want = Math.max(0, Math.min(orig.length, n)); if (arr.length === want) return; arr.length = 0; for (let i = 0; i < want; i++) arr.push(orig[i]); }
  function applyPerf(res) {
    perfSt.result = res; perfPools();
    const c = res.caps; const low = res.tier === 'low';
    capPool(arena._sparks, perfSt.pools.sparks, c.sparks); capPool(arena._edGhosts, perfSt.pools.ghosts, c.deathGhosts);
    if (perfSt.pf === null && low && arena._pf) perfSt.pf = { on: arena._pf.on };
    if (low && arena._pf) { if (arena._pf.q !== 0.75) arena._perfSet(0.75); arena._pf.on = false; } // lower resolution; the guard must not undo it while low
    else if (!low && perfSt.pf && arena._pf) { arena._pf.on = perfSt.pf.on; perfSt.pf = null; arena._perfSet(1); }
    document.body.classList.toggle('mm-low-gfx', low);
    document.body.classList.toggle('mm-perf-mid', res.tier === 'mid');
    window.__mmPerf = Object.assign(window.__mmPerf || {}, { tier: res.tier, caps: Object.assign({}, c), terrainAnim: c.terrainAnim, forced: !!res.forced, auto: perfSt.auto, lowGfx: low, sparkCap: arena._sparks ? arena._sparks.length : 0, ghostCap: arena._edGhosts ? arena._edGhosts.length : 0, quality: arena._pf ? arena._pf.q : 1 });
  }
  function perfEval(force) {
    if (!PERF_ON || !axPrefs) return;
    const total = perfSt.samples.reduce((a, b) => a + b, 0);
    let res;
    if (axPrefs.lowGfx === true) res = MMPerf.profile([], axPrefs, perfSt.prev);
    else if (total >= 3000) { // auto: only after 3 s of frames were measured
      res = MMPerf.profile(perfSt.samples, { lowGfx: false }, perfSt.prev);
      perfSt.auto = res.tier !== 'high';
    } else res = perfSt.prev && !perfSt.prev.forced ? perfSt.prev : MMPerf.profile([], { lowGfx: false }, null);
    perfSt.prev = res;
    if (!perfSt.result || perfSt.result.tier !== res.tier || perfSt.result.forced !== res.forced || force) applyPerf(res);
    else { perfPools(); capPool(arena._sparks, perfSt.pools.sparks, res.caps.sparks); capPool(arena._edGhosts, perfSt.pools.ghosts, res.caps.deathGhosts); }
  }
  function perfFeed(ms) {
    if (!(ms > 0) || ms > 250) return;
    perfSt.samples.push(ms); let t = 0, k = perfSt.samples.length; while (k > 0 && t < 3000) t += perfSt.samples[--k]; if (k > 0) perfSt.samples.splice(0, k); // keep ~the last 3 s
  }
  if (PERF_ON && AX_ON) {
    let lastT = 0;
    const loop = (t) => { if (lastT && !document.hidden) perfFeed(t - lastT); lastT = t; requestAnimationFrame(loop); };
    requestAnimationFrame(loop);
    setInterval(() => { if (!document.hidden) perfEval(false); }, 1000);
  }
  function setFlashes(on) { // screen flashes off: the red hit vignette stays at 0 (restored when turned back on)
    const d = Object.getOwnPropertyDescriptor(arena, 'flash');
    if (!on) { if (d && d.get) return; Object.defineProperty(arena, 'flash', { configurable: true, enumerable: true, get() { return 0; }, set() { /* flashes off */ } }); }
    else if (d && d.get) { delete arena.flash; arena.flash = 0; }
  }
  function axApply(p) {
    const ov = document.getElementById('realm-overlay'); const b = document.body; if (!ov) return;
    ov.style.setProperty('--mm-hud-scale', String(p.hudScale)); document.documentElement.style.setProperty('--mm-hud-scale', String(p.hudScale));
    document.documentElement.style.setProperty('--ui-scale', String(p.hudScale)); // AR: the shared text-scale variable (MMSideAccess sets the same on the side pages)
    const pal = AXM.palette(p.palette);
    ['bullet', 'enemy', 'ally'].forEach((k) => ov.style.setProperty('--mm-' + k, pal[k]));
    AXM.names().forEach((n) => b.classList.toggle('mm-pal-' + n, n === pal.name));
    b.classList.toggle('mm-no-flash', !p.flashes); b.classList.toggle('mm-outline', !!p.bulletOutline); b.classList.toggle('mm-hud-big', p.hudScale > 1);
    arena.accessPrefs = Object.assign({}, p, { outlinePx: AXM.OUTLINE_PX, palette: pal.name }); // read-only snapshot for the arena / other modules
    setFlashes(p.flashes);
    if (typeof arena.refreshAccess === 'function') { try { arena.refreshAccess(); } catch (e) { /* the arena re-reads within a second anyway */ } } // AR: text scale + bullet shapes now
    perfEval(true);
    window.__mmAccess = Object.assign(window.__mmAccess || {}, { prefs: Object.assign({}, p), palette: pal });
  }
  function axSet(key, val) {
    const next = Object.assign({}, axPrefs, { [key]: val });
    const saved = AXM.prefs.save(localStorage, next); // null when storage refuses: still applies for this visit
    axPrefs = saved || AXM.prefs.clean(next);
    if (key === 'lowGfx' && !val) { perfSt.samples.length = 0; perfSt.auto = false; perfSt.prev = null; }
    axApply(axPrefs); axRender();
    return axPrefs;
  }
  let axEl = null, axBody = null, axLast = null, axGear = false;
  function axOpen(fromGear) {
    if (!AX_ON) return false;
    axBuild(); axGear = !!fromGear && arena.panel !== 'menu';
    if (fromGear && arena.setMenu && arena.panel !== 'menu') { try { arena.setMenu(true); } catch (e) { /* the sheet alone still works */ } }
    axLast = document.activeElement; axRender(); axEl.classList.remove('hidden'); axEl.style.display = 'flex';
    const f = axEl.querySelector('button'); if (f) f.focus({ preventScroll: true });
    return true;
  }
  function axClose() { if (!axEl || axEl.classList.contains('hidden')) return false; axEl.classList.add('hidden'); axEl.style.display = 'none'; if (axGear) { axGear = false; try { if (arena.panel === 'menu') arena.setMenu(false); } catch (e) { /* ignore */ } } try { if (axLast && axLast.isConnected) axLast.focus({ preventScroll: true }); } catch (e) { /* ignore */ } return true; }
  const AX_PAL = { normal: 'Normal', deuteranopia: 'Deuteranopia', protanopia: 'Protanopia', tritanopia: 'Tritanopia' };
  function axBuild() {
    if (axEl) return;
    axEl = mkEl('div', 'rm-panel hidden'); axEl.id = 'mm-settings'; axEl.setAttribute('role', 'dialog'); axEl.setAttribute('aria-modal', 'true'); axEl.setAttribute('aria-label', 'Settings'); axEl.style.display = 'none';
    const card = mkEl('div', 'realm-bp-card rm-card'); const head = mkEl('div', 'realm-bp-head'); head.appendChild(mkEl('strong', '', '⚙ Settings'));
    const x = mkEl('button', '', '✖'); x.type = 'button'; x.id = 'mm-settings-x'; x.setAttribute('aria-label', 'Close settings'); x.addEventListener('click', axClose); head.appendChild(x);
    axBody = mkEl('div', 'mm-set-body'); card.append(head, axBody); axEl.appendChild(card); overlayEl.appendChild(axEl);
    // Feedback box at the end of the sheet (its own host: axRender rebuilds axBody, never this)
    const fb = mkEl('div', 'mm-set-feedback'); fb.id = 'mm-settings-feedback'; card.appendChild(fb); feedbackMount(fb);
    axEl.addEventListener('click', (e) => {
      const b = e.target.closest('button[data-ax]'); if (!b) return; const k = b.dataset.ax, v = b.dataset.v;
      if (k === 'palette') axSet('palette', v);
      else if (k === 'hudScale') axSet('hudScale', Number(v));
      else if (k === 'motion') { arena.setReduceMotion(!arena._reduced); axRender(); }
      else if (k === 'music') { if (window.RealmAudio) { RealmAudio.setOn(!RealmAudio.isOn()); axRender(); } }
      else if (k === 'oneThumb' && AX2) { const c = arena.access2(); arena.setOneThumb(!c.oneThumb); axRender(); }
      else if (k === 'autoFire' && AX2) { arena.setAutoFire(!arena.access2().autoFire); axRender(); }
      else if (k === 'aimToggle' && AX2) { arena.setAimToggle(!arena.access2().aimToggle); axRender(); }
      else if (k === 'shapes' && AX2) { arena.setBulletShapes(!arena.access2().shapes); axRender(); }
      else if (k === 'shared') { const P = SHARED ? SHARED.panel() : null; if (P) { axClose(); P.open(); } }
      else if (k === 'done') axClose();
      else axSet(k, !axPrefs[k]);
    });
    axEl.addEventListener('keydown', (e) => { // keep Tab inside the sheet
      if (e.key !== 'Tab') return; const bs = Array.from(axEl.querySelectorAll('button, textarea, input, select, a[href]')).filter((q) => !q.disabled && q.getClientRects().length); if (!bs.length) return;
      const i = bs.indexOf(document.activeElement); const nx = e.shiftKey ? (i <= 0 ? bs.length - 1 : i - 1) : (i === bs.length - 1 ? 0 : i + 1); e.preventDefault(); bs[nx].focus();
    });
  }
  function axRender() {
    if (!axEl || !axPrefs) return; const p = axPrefs; axBody.textContent = '';
    const sec = (t) => { axBody.appendChild(mkEl('h4', 'mm-set-h', t)); const g = mkEl('div', 'mm-set-row'); axBody.appendChild(g); return g; };
    const choice = (g, key, val, label, on) => { const b = mkEl('button', 'rm-tog' + (on ? ' on' : ''), label); b.type = 'button'; b.dataset.ax = key; b.dataset.v = String(val); b.setAttribute('aria-pressed', on ? 'true' : 'false'); g.appendChild(b); };
    const tog = (key, label, on, extra) => { const b = mkEl('button', 'rm-tog' + (on ? ' on' : ''), label + ': ' + (on ? 'on' : 'off') + (extra || '')); b.type = 'button'; b.dataset.ax = key; b.setAttribute('aria-pressed', on ? 'true' : 'false'); axBody.appendChild(b); };
    const g1 = sec('Colour palette'); AXM.names().forEach((n) => choice(g1, 'palette', n, AX_PAL[n] || n, p.palette === n));
    const g2 = sec('HUD size'); AXM.prefs.HUD_SCALES.forEach((s) => choice(g2, 'hudScale', s, Math.round(s * 100) + '%', p.hudScale === s));
    axBody.appendChild(mkEl('h4', 'mm-set-h', 'Comfort'));
    tog('motion', 'Reduce motion', !!arena._reduced); tog('flashes', 'Screen flashes', p.flashes); tog('bulletOutline', 'Bullet outline', p.bulletOutline);
    tog('lowGfx', 'Low graphics', p.lowGfx, !p.lowGfx && perfSt.auto ? ' (auto: slow frames)' : '');
    if (window.RealmAudio) tog('music', 'Ambient music', RealmAudio.isOn());
    if (AX2) { // AR: one-thumb play, hold-or-toggle aiming, bullet shapes (per device, never in the save)
      const c = arena.access2();
      axBody.appendChild(mkEl('h4', 'mm-set-h', 'Controls'));
      tog('oneThumb', 'One-thumb mode', c.oneThumb, ' (auto-fire + aim toggle)');
      tog('autoFire', 'Auto-fire at the nearest enemy', c.autoFire);
      tog('aimToggle', 'Aim: tap to toggle (instead of hold)', c.aimToggle);
      tog('shapes', 'Bullet shapes', c.shapes || p.palette !== 'normal', p.palette !== 'normal' ? ' (always with this palette)' : '');
    }
    if (SHARED) { const sb = mkEl('button', 'rm-tog', '🔊 Sound, music, aim assist...'); sb.type = 'button'; sb.id = 'mm-settings-shared'; sb.dataset.ax = 'shared'; axBody.appendChild(sb); }
    const d = mkEl('button', 'rm-btn', 'Done'); d.type = 'button'; d.dataset.ax = 'done'; axBody.appendChild(d);
  }
  // Feedback box (shared/mm-feedback.js, local-only notes): loaded on the first settings open. The tag is added from here, guarded:
  // a missing file only drops the box. Under ?test=1 it loads only with ?feedback=1, so test runs never see a 404 for it.
  function feedbackMount(host) {
    const go = () => { if (window.MMFeedback && typeof MMFeedback.mount === 'function') { try { MMFeedback.mount(host, { page: 'realm' }); } catch (e) { /* the box never breaks settings */ } } };
    // typing a note must not drive the hero (WASD, B, K ...): keys stop at the box; Tab still reaches the sheet's focus trap
    ['keydown', 'keyup'].forEach((t) => host.addEventListener(t, (e) => { if (e.key !== 'Tab' && e.key !== 'Escape') e.stopPropagation(); }));
    if (window.MMFeedback) { go(); return; }
    if (params.get('feedback') === '0' || (TEST && params.get('feedback') !== '1')) return;
    const src = '../../shared/mm-feedback.js';
    if (!document.querySelector('script[src="' + src + '"]')) {
      const s = document.createElement('script'); s.src = src; s.async = true;
      s.addEventListener('load', () => {
        if (!document.querySelector('link[href*="mm-feedback.css"]')) { const l = document.createElement('link'); l.rel = 'stylesheet'; l.href = '../../shared/mm-feedback.css'; document.head.appendChild(l); }
        go();
      });
      s.addEventListener('error', () => { s.remove(); });
      document.head.appendChild(s);
    }
  }

  // Shared Settings panel (shared/mm-settings.js, SETTINGS-WIRING.md): sound, music, aim assist and the rest of the one cross-game panel.
  // The Realm's own sheet (#mm-settings, ids kept for its tests) links to it; every change there applies live through the arena's setters.
  // ?mmsettings=0 leaves it out (the page as before).
  // Mounted lazily on the first open and taken out of the page again when it closes, so the shared Menu's Settings entry keeps opening the
  // Realm sheet (mm-nav prefers a mounted #mmset; the Realm sheet is the superset: palette, outline, ambient drone, and this link).
  const SHARED = AX_ON && window.MMSettings && params.get('mmsettings') !== '0' ? (() => {
    let P = null; let back = null;
    function detach() { [back, P && P.el].forEach((n) => { if (n && n.parentNode) n.parentNode.removeChild(n); }); }
    function panel() {
      if (!P) {
        try { P = MMSettings.mount({ page: 'realm', feedback: false, play: true }); } catch (e) { P = null; }
        if (!P || !P.el) return null;
        back = document.getElementById('mmset-back');
        ['keydown', 'keyup'].forEach((t) => P.el.addEventListener(t, (e) => { if (e.key !== 'Tab' && e.key !== 'Escape') e.stopPropagation(); })); // keys typed in the panel never drive the hero
        new MutationObserver(() => { if (P.el.hidden) detach(); }).observe(P.el, { attributes: true, attributeFilter: ['hidden'] });
      }
      if (!P.el.isConnected) { if (back) document.body.appendChild(back); document.body.appendChild(P.el); }
      return P;
    }
    return { panel, isOpen: () => !!P && P.el.isConnected && P.isOpen(), close: () => { if (P) P.close(); } };
  })() : null;
  if (SHARED) {
    window.addEventListener('mm-settings-change', (ev) => {
      const d = ev && ev.detail ? ev.detail : {}; const v = d.value;
      try {
        if (d.id === 'auto-fire' && AX2) arena.setAutoFire(!!v);
        else if (d.id === 'aim-toggle' && AX2) arena.setAimToggle(!!v);
        else if (d.id === 'one-thumb' && AX2) arena.setOneThumb(!!v);
        else if (d.id === 'bullet-shapes' && AX2) arena.setBulletShapes(!!v);
        else if (d.id === 'aim-assist' && arena.setAimAssist) arena.setAimAssist(!!v);
        else if (d.id === 'sound') { if (arena.sfx) arena.sfx.setMuted(!v); if (window.RealmAudio) RealmAudio.tick(); }
        else if (d.id === 'music') { if (window.RealmAudio) RealmAudio.tick(); }
        else if (d.id === 'reduce-motion') arena.setReduceMotion(!!v);
        else if (d.id === 'text-size' || d.id === 'flashes' || d.id === 'low-gfx') {
          try { axPrefs = AXM.prefs.load(localStorage); } catch (e) { axPrefs = AXM.prefs.load(null); } // S-10: storage may be blocked
          if (d.id === 'low-gfx' && !v) { perfSt.samples.length = 0; perfSt.auto = false; perfSt.prev = null; }
          axApply(axPrefs);
        }
      } catch (e) { /* a setting never breaks the run */ }
      axRender();
    });
    // Esc closes the shared panel first (the arena would otherwise toggle its menu underneath)
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && SHARED.isOpen()) { SHARED.close(); e.stopPropagation(); e.preventDefault(); } }, true);
  }

  if (AX_ON) {
    axApply(axPrefs);
    // gear icon (always reachable) + a Settings button in the Esc menu (the menu DOM is built lazily by the arena)
    const gear = mkEl('button', '', ''); gear.appendChild(mkEl('span', 'mm-gear-glyph', '⚙')); gear.id = 'mm-gear-btn'; gear.type = 'button'; gear.setAttribute('aria-label', 'Open settings'); gear.title = 'Settings'; // the glyph hides once the icon loads (no 0 px text)
    gear.addEventListener('click', () => axOpen(true)); overlayEl.appendChild(gear);
    if (params.get('uiicons') !== '0') {
      const gi = document.createElement('img'); gi.className = 'mm-ico'; gi.alt = ''; gi.setAttribute('aria-hidden', 'true'); gi.draggable = false;
      gi.addEventListener('load', () => { gear.classList.add('has-ico'); }); gi.addEventListener('error', () => gi.remove()); gi.src = ICON_ROOT + 'icon_settings.png'; gear.insertBefore(gi, gear.firstChild);
    }
    const hook = () => {
      const m = document.getElementById('realm-pause'); if (!m || m.querySelector('#mm-settings-open')) return;
      const host = m.querySelector('.rm-settings'); if (!host) return;
      const b = mkEl('button', 'rm-tog', '⚙ More settings'); b.type = 'button'; b.id = 'mm-settings-open'; b.addEventListener('click', () => axOpen(false)); host.appendChild(b);
    };
    new MutationObserver(hook).observe(overlayEl, { childList: true }); hook();
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && axEl && !axEl.classList.contains('hidden')) { axClose(); e.stopPropagation(); e.preventDefault(); } }, true);
    window.__mmAccess = Object.assign(window.__mmAccess || {}, { open: () => axOpen(false), close: axClose, set: axSet, isOpen: () => !!axEl && !axEl.classList.contains('hidden') });
    window.__mmPerf = Object.assign(window.__mmPerf || {}, { feed: (arr) => { (Array.isArray(arr) ? arr : [arr]).forEach(perfFeed); perfEval(false); return window.__mmPerf; }, evaluate: () => perfEval(true), samples: () => perfSt.samples.slice() });
  }

  // Realm audio (SA2) and the first-run tutorial (TU2): optional files; the page runs without them.
  if (window.RealmAudio) { try { RealmAudio.attach({ arena, zone: () => { try { if (realmWorld) { const zi = realmWorld.api.zone(); return zi ? zi.zone : 0; } } catch (e) { /* fall through */ } return dungeon ? 3 : 0; } }); } catch (e) { /* audio never breaks the page */ } }
  if (window.RealmTutorial && WORLD && realmWorld) { try { RealmTutorial.attach({ arena, world: realmWorld.api, params, test: TEST, overlay: overlayEl, profile: () => { try { return heroState().prof; } catch (e) { return null; } } }); } catch (e) { /* the tutorial never breaks the page */ } }

  // ---------- MMNav (NAV-AUDIT 4.1, slice C): the shared Menu button + "Where to?" sheet on the Realm world and dungeon pages ----------
  // mm-nav stays off by itself inside the Town iframe and with ?nav=0. The Realm HUD row moves right of the button (avoid), so the HP bar,
  // the zone line, the minimap and the sticks are never under it. Opening the sheet pauses a solo run; a Realm dialog opening closes it,
  // and the button hides while one is up (no stacked overlays). The bottom gear hides under the other dialogs too (NAV-AUDIT #9).
  const navMode = !!(NAV && (WORLD || dungeon));
  const navOn = navMode && NAV.mount({ page: 'realm', avoid: '#realm-hud', record: !dungeon, backHref: HOME.replace(/,/g, '%2C'), backLabel: HOME_LABEL.replace(/^Back to /, '') }) === true;
  if (navOn) {
    if (dungeon) { try { NAV.markPlace('realm', '', 'game/games/mad-maze/index.html?mode=world'); } catch (e) { /* storage blocked */ } } // Continue goes to the world, not to this one-off dungeon
    document.body.classList.add('mm-nav-realm');
    let navPaused = false;
    NAV.onOpen(() => { if (arena.active && !arena.paused && !arena.panel && !arena.team && arena.state === 'play') { arena.paused = true; navPaused = true; arena.keys = {}; arena.mouse.down = false; arena.aimVec.on = false; } });
    NAV.onClose(() => { if (navPaused) { navPaused = false; if (!arena.panel && arena.active) arena.paused = false; } });
    if (AX_ON) NAV.onSettings(() => axOpen(false));
    const navRoot = document.getElementById('mm-nav-root'); // leaving through the sheet saves the run first, like Leave
    if (navRoot) navRoot.addEventListener('click', (e) => { if (e.target.closest && e.target.closest('a[href]')) { try { arena.onSave(arena.save); } catch (err) { /* keep navigating */ } } }, true);
  }
  (function dialogWatch() { // one cheap poll: which Realm dialogs are visible right now
    const shown = (n) => !!n && !n.classList.contains('hidden') && n.getClientRects().length > 0 && getComputedStyle(n).display !== 'none';
    const tick = () => {
      let any = false, other = false;
      // PLAYTEST-REVIEW-3: the hero picker (a fresh visitor's first screen) keeps the Menu button: its card steps below the button (mad-maze.css)
      overlayEl.querySelectorAll('[role="dialog"]').forEach((n) => { if (shown(n)) { if (n.id !== 'realm-hero') any = true; if (n.id !== 'mm-settings' && n.id !== 'realm-pause') other = true; } });
      ['mm-summary', 'rw-nexus'].forEach((id) => { const n = document.getElementById(id); if (shown(n)) { any = true; other = true; } });
      document.body.classList.toggle('mm-realm-dialog', other);
      if (navOn) { if (any && NAV.isOpen()) NAV.close(); NAV.setCovered(any); }
      document.querySelectorAll('#realm-pause [data-m="leave"], #realm-death [data-d="leave"]').forEach((b) => { if (!b.title) { b.title = HOME_LABEL; b.setAttribute('aria-label', 'Leave: ' + HOME_LABEL.charAt(0).toLowerCase() + HOME_LABEL.slice(1)); } });
    };
    let raf = 0; const sched = () => { if (!raf) raf = requestAnimationFrame(() => { raf = 0; try { tick(); } catch (e) { /* cosmetic only */ } }); };
    const isDlg = (n) => n && n.nodeType === 1 && (n.getAttribute('role') === 'dialog' || n.id === 'mm-summary' || n.id === 'rw-nexus');
    // a dialog shows / hides by class or style: react in the next frame (HUD bars restyling every frame are ignored)
    const mo = new MutationObserver((recs) => { for (let k = 0; k < recs.length; k++) { const r = recs[k]; if (r.type === 'attributes' ? isDlg(r.target) : (Array.prototype.some.call(r.addedNodes, isDlg) || Array.prototype.some.call(r.removedNodes, isDlg))) { sched(); return; } } });
    mo.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['class', 'style', 'hidden'] });
    tick(); setInterval(sched, 500);
  })();

  if (TEST) window.__mm = { applyWeapon, arena, dungeon: dungeon ? dungeon.api : null, world: realmWorld ? realmWorld.api : null, team: (realmWorld && realmWorld.team) || null };
  arena.start();
  // A fresh world visit with several owned heroes opens the picker first (?heropick=0 skips it).
  // S-10 (b15-02): with site data blocked nothing can be saved, so the picker is not forced open on every visit (the profile always reads as
  // fresh); the run starts with base stats and Menu > Heroes still creates a hero for this visit.
  const storageOk = (() => { try { const k = '__mm_probe'; localStorage.setItem(k, '1'); localStorage.removeItem(k); return true; } catch (e) { return false; } })();
  if (HERO_UI && storageOk && (!TEST || params.get('heropick') === '1')) { try { if (heroState().prof.heroes.length !== 1) arena.openHeroPanel('pick'); } catch (e) { /* ignore */ } }
})();
