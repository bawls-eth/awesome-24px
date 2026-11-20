// Mad Maze standalone page shell (Day 1 slice 3). Solo only, no network, no audio.
// Reads/writes the existing `realm` field of pixeltown-save-v1 (same glue as main.js loadSave/writeSave).
(function () {
  'use strict';
  const SAVE_KEY = 'pixeltown-save-v1';
  const params = new URLSearchParams(location.search);
  const TEST = params.get('test') === '1';
  const FROM_HUB = params.get('from') === 'hub'; // exact match only; anything else keeps the town exit
  const HOME = FROM_HUB ? '../../hub/index.html' : '../../index.html';
  const HOME_LABEL = FROM_HUB ? 'Back to the map' : 'Back to town';

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

  let dungeon = null; // ?mode=dungeon&seed=N turns the arena into a Warren run; the default stays the solo arena
  const arena = new RealmArena({
    container: document.getElementById('realm-canvas-wrap'),
    save: rmCleanSave(loadSave().realm),
    onSave: (s) => writeSave({ realm: s }),
    onExit: (why) => { if (dungeon && why === 'death') dungeon.onDeath(); else location.href = HOME; },
  });

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
    dungeon = MMDungeonRun.create(arena, { seed: /^[A-Za-z0-9_-]{1,24}$/.test(params.get('seed') || '') ? params.get('seed') : String(Date.now() % 100000), home: HOME, homeLabel: HOME_LABEL, test: TEST });
    document.body.classList.add('dungeon-mode');
  }

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

  // Enemy art: only the mapped arena creatures (idle/move/attack); any failure keeps the procedural sprites.
  if (window.MMArt && MMArt.loadEnemies && params.get('enemyart') !== '0') {
    MMArt.loadEnemies('../../assets/arcane/').then((set) => { if (set.classes().length) arena.setEnemyArt(set); }).catch(() => {});
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

  if (TEST) window.__mm = { arena, dungeon: dungeon ? dungeon.api : null };
  arena.start();
})();
