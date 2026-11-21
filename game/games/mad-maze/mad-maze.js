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
  if (FROM_HUB) { const lb = document.getElementById('realm-leave-btn'); lb.textContent = '✖ Back to the map'; lb.setAttribute('aria-label', 'Leave Mad Maze and go back to the map'); }
  if (RETURN) { const lb = document.getElementById('realm-leave-btn'); lb.textContent = '✖ To the world'; lb.setAttribute('aria-label', 'Leave the dungeon and go back to the world'); }
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
    dungeon = MMDungeonRun.create(arena, { layout: (params.get('lv') === '2' || !hasSeed || !!dSeed) ? 2 : 1, seed: hasSeed ? (EXPLICIT_SEED || dSeed) : String(Date.now() % 100000), home: HOME, homeLabel: HOME_LABEL, test: TEST, returnTo: RETURN, biome: DBIOME });
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
      const h = (prof.heroes || []).find((x) => x.id === active.heroId);
      return h ? h.cls : null;
    } catch (e) { return null; }
  }
  const artClass = window.MMArt ? MMArt.artClassFor(activeHeroClass()) : null;
  if (artClass) {
    MMArt.loadClass('../../assets/arcane/', artClass).then((set) => { if (set.has(artClass)) arena.setHeroArt(set, artClass); }).catch(() => {});
  }

  // Class stats: the active hero's class nudges HP/speed/damage/fire rate/safe time (MMClasses.arenaProfile); ?classstats=0 disables it.
  if (window.MMClasses && MMClasses.arenaProfile && params.get('classstats') !== '0' && activeHeroClass()) arena.setHeroProfile(MMClasses.arenaProfile(activeHeroClass()));
  // Class signature: the active hero's class gets a signature ability in the F slot (level 7, replaces Overdrive); ?signature=0 disables it.
  if (window.MMClasses && MMClasses.arenaSignature && params.get('signature') !== '0' && activeHeroClass()) arena.setHeroSignature(MMClasses.arenaSignature(activeHeroClass()));

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

  if (TEST) window.__mm = { arena, dungeon: dungeon ? dungeon.api : null, world: realmWorld ? realmWorld.api : null };
  arena.start();
})();
