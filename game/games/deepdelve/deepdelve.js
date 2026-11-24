// Deepdelve first slice: chunked voxel world (MMChunks), face-culled meshes, MMLight vertex light,
// walk/mine/place, hotbar, IndexedDB diffs. No network, no Firebase. Text is set with textContent only.
(function () {
  'use strict';
  const B = MMChunks.B, SIZE = MMChunks.SIZE;
  const params = new URLSearchParams(location.search);
  const TEST = params.get('test') === '1';
  const DB_NAME = 'pixeltown-deepdelve-v1';
  const DEFAULT_SEED = 1;

  // ?seed=N: a plain integer string, clamped to 0..999999999; anything else falls back to the default.
  function parseSeed(raw) {
    if (typeof raw !== 'string' || !/^-?\d{1,12}$/.test(raw.trim())) return DEFAULT_SEED;
    const n = parseInt(raw.trim(), 10);
    if (!isFinite(n)) return DEFAULT_SEED;
    return Math.max(0, Math.min(999999999, n));
  }
  const SEED = parseSeed(params.get('seed'));
  // MG2 calm creative world (?mode=creative, or the "Creative world" button): no mobs, no hazards, unlimited blocks, its own
  // save under localStorage 'pixeltown-deepdelve-creative-v1'. It never opens the survival IndexedDB and never writes the
  // survival meta, medal or hub keys.
  const CREATIVE = params.get('mode') === 'creative';
  const CREATIVE_KEY = 'pixeltown-deepdelve-creative-v1';
  const GROTTO = window.MMDDGrotto || null, BUILD = window.MMDDBuild || null;

  // Beta S-05 (b15-01): `localStorage` itself can throw (SecurityError: cookies / site data blocked). Every read and write in this
  // file goes through LS: the real storage when it can be read, else an in-memory stand-in so the mine still boots and plays.
  // LS_NOSAVE is true when nothing will persist (blocked getter, or a probe write that throws), and the status line says so once.
  let LS_NOSAVE = false;
  const LS = (function () {
    let s = null;
    try { s = window.localStorage; if (s) s.getItem('pixeltown-deepdelve-v1'); } catch (e) { s = null; }
    if (s) {
      try { s.setItem('pixeltown-deepdelve-probe', '1'); s.removeItem('pixeltown-deepdelve-probe'); } catch (e) { LS_NOSAVE = true; }
      return s;
    }
    LS_NOSAVE = true;
    const m = new Map();
    return {
      getItem: (k) => (m.has(String(k)) ? m.get(String(k)) : null),
      setItem: (k, v) => { m.set(String(k), String(v)); },
      removeItem: (k) => { m.delete(String(k)); },
      key: (i) => Array.from(m.keys())[i] || null,
      get length() { return m.size; },
      clear: () => m.clear(),
    };
  }());
  const $ = (id) => document.getElementById(id);
  const say = (t) => { $('msg').textContent = t || ''; };
  const touchUI = () => { const t = $('touch'); return !!t && !t.hidden; };
  let msgTimer = 0;
  function toast(t) { say(t); clearTimeout(msgTimer); msgTimer = setTimeout(() => say(''), 2200); }

  // ---------- storage: IndexedDB with an in-memory fallback ----------
  const memStore = new Map();
  let idb = null;
  function creativeDoc() {
    try {
      const o = JSON.parse(LS.getItem(CREATIVE_KEY) || 'null');
      if (o && typeof o === 'object' && !Array.isArray(o) && o.v === 1 && o.kv && typeof o.kv === 'object' && !Array.isArray(o.kv)) return o;
    } catch (e) { /* corrupt or blocked: start fresh */ }
    return { v: 1, kv: {} };
  }
  function openDB() {
    if (CREATIVE) return Promise.resolve(null); // the creative world never opens the survival database
    return new Promise((resolve) => {
      let done = false;
      const fin = (v) => { if (!done) { done = true; resolve(v); } };
      try {
        if (typeof indexedDB === 'undefined' || !indexedDB) return fin(null);
        const req = indexedDB.open(DB_NAME, 1);
        req.onupgradeneeded = () => { try { req.result.createObjectStore('kv'); } catch (e) { /* ignore */ } };
        req.onsuccess = () => fin(req.result);
        req.onerror = () => fin(null);
        req.onblocked = () => fin(null);
        setTimeout(() => fin(null), 3000);
      } catch (e) { fin(null); }
    });
  }
  function kvGet(k) {
    return new Promise((resolve) => {
      if (CREATIVE) { const v = creativeDoc().kv[k]; return resolve(typeof v === 'string' ? v : memStore.has(k) ? memStore.get(k) : null); }
      if (!idb) return resolve(memStore.has(k) ? memStore.get(k) : null);
      try {
        const r = idb.transaction('kv', 'readonly').objectStore('kv').get(k);
        r.onsuccess = () => resolve(r.result === undefined ? null : r.result);
        r.onerror = () => resolve(memStore.has(k) ? memStore.get(k) : null);
      } catch (e) { resolve(memStore.has(k) ? memStore.get(k) : null); }
    });
  }
  function kvSet(k, v) {
    memStore.set(k, v);
    return new Promise((resolve) => {
      if (CREATIVE) { try { const d = creativeDoc(); d.kv[k] = v; LS.setItem(CREATIVE_KEY, JSON.stringify(d)); return resolve(true); } catch (e) { return resolve(false); } }
      if (!idb) return resolve(false);
      try {
        const tx = idb.transaction('kv', 'readwrite');
        tx.objectStore('kv').put(v, k);
        tx.oncomplete = () => resolve(true);
        tx.onerror = () => resolve(false);
        tx.onabort = () => resolve(false);
      } catch (e) { resolve(false); }
    });
  }

  // ---------- items / blocks ----------
  const ITEM_OF = {}; ITEM_OF[B.GRASS] = 'dirt'; ITEM_OF[B.DIRT] = 'dirt'; ITEM_OF[B.STONE] = 'stone'; ITEM_OF[B.COAL] = 'coal';
  ITEM_OF[B.IRON] = 'iron_ore'; ITEM_OF[B.GOLD] = 'gold_ore'; ITEM_OF[B.CRYSTAL] = 'crystal'; ITEM_OF[B.TORCH] = 'torch'; ITEM_OF[B.FURNACE] = 'furnace';
  // MG2 crystal grotto blocks (ids continue MMChunks.B; see shared/mm-dd-grotto.js)
  const GLOW = 13, LAMP = 14, BRICK = 15;
  ITEM_OF[GLOW] = 'glowstone'; ITEM_OF[LAMP] = 'glow_lamp'; ITEM_OF[BRICK] = 'stone_brick';
  const BENCH_ITEM = 'table'; // the workbench is a placed prop (not a chunk block), kept in `benches` and saved additively
  const PLACEABLE = [['dirt', B.DIRT], ['stone', B.STONE], ['coal', B.COAL], ['iron_ore', B.IRON], ['gold_ore', B.GOLD], ['crystal', B.CRYSTAL], ['furnace', B.FURNACE], ['torch', B.TORCH], ['glowstone', GLOW], ['glow_lamp', LAMP], ['stone_brick', BRICK]];
  const BLOCK_OF = {}; PLACEABLE.forEach((p) => { BLOCK_OF[p[0]] = p[1]; });
  const benches = [];
  const lampChunks = new Set(); // chunk keys that may hold a glow lamp (placed blocks only), so relight scans just those
  const creativeBuilt = {};
  const creatures = [], slain = new Set(); // seeded cave creatures (crawler, bat); slain ids are saved additively
  let deathCause = '';
  const clock = { t: MMDDTime.NOON, step: -1, k: 1 }; // world clock in seconds; saved additively as `t`
  const HARDNESS = {}; HARDNESS[B.GRASS] = 0.3; HARDNESS[B.DIRT] = 0.3; HARDNESS[B.STONE] = 0.7; HARDNESS[B.COAL] = 0.9; HARDNESS[B.IRON] = 1.1;
  HARDNESS[B.GOLD] = 1.3; HARDNESS[B.CRYSTAL] = 1.5; HARDNESS[B.TORCH] = 0.1; HARDNESS[B.FURNACE] = 0.6;
  HARDNESS[GLOW] = 1.0; HARDNESS[LAMP] = 0.3; HARDNESS[BRICK] = 0.9;
  // Ore gating: minimum pick tier (0 wood, 1 stone, 2 iron, 3 gold).
  const NEED_TIER = {}; NEED_TIER[B.IRON] = 1; NEED_TIER[B.GOLD] = 2; NEED_TIER[B.CRYSTAL] = 2; NEED_TIER[GLOW] = 1;
  const TIER_NAME = ['Wood', 'Stone', 'Iron', 'Gold'], PICK_DUR = [0, 60, 120, 200];
  const SWATCH = { dirt: '#7a5230', stone: '#7d8189', coal: '#2b2b30', iron_ore: '#d8a77a', gold_ore: '#f2c744', crystal: '#7fe8ff', furnace: '#d0702a', torch: '#ffb02e', table: '#a8743a', glowstone: '#5fe0c8', glow_lamp: '#fff0b0', stone_brick: '#9a9ea8' };

  // ---------- state ----------
  const inv = { wood: 4, coal: 1 };
  let sel = 'stone';
  const player = { x: 64.5, y: 0, z: 64.5, vy: 0, onGround: false, yaw: 0, pitch: 0, hp: 10, peak: 0, iframes: 0 };
  const input = { fwd: 0, strafe: 0, jump: false, mine: false, down: false };
  const keys = {};
  let turnKeys = () => 0, pitchKeys = () => 0;
  let world = null, spawn = null, mouthOn = false, mouthSite = null;
  const readReduced = () => !!(window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches) || !!(window.MMSideAccess && window.MMSideAccess.reduced()) || document.documentElement.getAttribute('data-reduce-motion') === '1';
  let reduced = readReduced(); // re-read when the Settings panel changes it (no reload needed)
  const META_KEY = 'pixeltown-deepdelve-v1', TOWN_KEY = 'pixeltown-save-v1';
  // Shared access prefs (pixeltown-access-v1, read-only): text size + reduce motion come via MMSideAccess; lowGfx starts the
  // quality governor at the low view and keeps it there; a colour-blind palette recolours the block outline and the creatures.
  const ACCESS = (function () {
    let p = null;
    try { p = window.MMAccess && MMAccess.prefs ? MMAccess.prefs.load(LS) : null; } catch (e) { p = null; }
    p = p || { palette: 'normal', hudScale: 1, flashes: true, lowGfx: false };
    const pal = window.MMAccess ? MMAccess.palette(p.palette) : { name: 'normal', ally: '#5ad1ff', enemy: '#ffb347' };
    return { palette: pal.name, ally: pal.ally, enemy: pal.enemy, scale: p.hudScale, lowGfx: p.lowGfx === true, reduced };
  }());
  const pick = { tier: 0, dur: 0 };
  const slimes = [];

  // ---------- dive runs + juice (dd-run.js; personal bests in 'pixeltown-deepdelve-runs-v1') ----------
  const RUNS = CREATIVE ? null : window.MMDDRun || null;
  let climbTipShown = false, runRec = null, run = null, runDepth0 = 0, shakeT = 0, shakeAmp = 0, comboShown = false, pbDepthShown = false;
  const calm = () => reduced || ACCESS.lowGfx; // no camera shake on reduce motion or low graphics
  let sfxBox = null;
  function sfx(name) {
    try {
      if (!sfxBox && window.MMSfx && !TEST) sfxBox = MMSfx.create({ storage: LS });
      if (sfxBox) sfxBox.play(name);
    } catch (e) { /* audio is optional */ }
  }
  function shake(amp, t) { if (calm()) return; shakeAmp = Math.max(shakeAmp, amp); shakeT = Math.max(shakeT, t); }
  function pop(text, cls) {
    const box = $('pops'); if (!box) return;
    while (box.childNodes.length > 4) box.removeChild(box.firstChild);
    const el = document.createElement('div'); el.className = 'pop' + (cls ? ' ' + cls : ''); el.textContent = text;
    el.style.left = ((box.childNodes.length % 3) - 1) * 28 + 'px';
    box.appendChild(el);
    setTimeout(() => { if (el.parentNode) el.parentNode.removeChild(el); }, 950);
  }
  const nowS = () => performance.now() / 1000;
  function renderDive() {
    const el = $('hud-dive'); if (!el) return;
    if (!run || !runRec) { el.textContent = ''; return; }
    el.textContent = modName(run.mod) + ': ' + run.depth + ' deep | Best ' + (runRec.best.depth || '-') + (run.armed ? ' | Climb out for x' + RUNS.SAFE_BONUS : '');
  }
  const modName = (id) => { const m = RUNS && RUNS.MODS.filter((x) => x.id === id)[0]; return m ? m.name : 'Dive'; };
  function startRun() {
    if (!RUNS) return;
    if (!runRec) runRec = RUNS.load(LS);
    run = RUNS.start(runDepth0, RUNS.modFor(SEED, runRec.runs).id); pbDepthShown = false; comboShown = false; $('combo').textContent = '';
    renderDive();
  }
  // G-10: cells the player placed this session (cap 4096, oldest out); mining one gives the item back but scores nothing
  const placedCells = new Set(); const PLACED_CAP = 4096;
  const cellKey = (x, y, z) => x + ',' + y + ',' + z;
  function notePlaced(x, y, z) { const k = cellKey(x, y, z); placedCells.delete(k); placedCells.add(k); if (placedCells.size > PLACED_CAP) placedCells.delete(placedCells.values().next().value); }
  function onMined(item, now, placed) {
    if (!run) return null;
    const r = RUNS.mined(run, item, now === undefined ? nowS() : now, placed ? { placed: true } : undefined);
    if (r.placed) { sfx('hit'); return r; }
    if (r.ore) { pop('+' + (r.ore * (run.mod === 'veins' ? 16 : 8)) + ' ' + item.replace(/_ore$/, '').replace(/_/g, ' '), 'ore'); sfx('pickup'); shake(0.06, 0.16); }
    else { sfx('hit'); shake(0.025, 0.08); }
    if (r.combo >= 2) {
      const c = $('combo'); c.textContent = 'Combo x' + r.combo; c.className = r.combo >= 5 ? 'hot' : ''; comboShown = true;
      if (r.combo % 5 === 0) { pop('Combo x' + r.combo + '!', 'pb'); sfx('claim'); }
    }
    return r;
  }
  function tickRun(absDepth) {
    if (!run) return;
    if (comboShown && !RUNS.comboLive(run, nowS())) { comboShown = false; $('combo').textContent = ''; }
    const wasArmed = run.armed;
    if (RUNS.depth(run, absDepth)) {
      if (!pbDepthShown && runRec.best.depth > 0 && run.depth > runRec.best.depth) { pbDepthShown = true; pop('New depth record!', 'pb'); sfx('levelup'); }
      renderDive();
    } else if (wasArmed !== run.armed) renderDive();
    if (!wasArmed && run.armed && !climbTipShown) { climbTipShown = true; toast('Deep enough! Climb back out for a x' + RUNS.SAFE_BONUS + ' bonus: look down, jump and Place a block under you.'); }
    if (run.armed && absDepth <= runDepth0) endRun(true, 'You climbed back out alive: x' + RUNS.SAFE_BONUS + ' score bonus.');
  }
  // End the dive and show the summary. `safe` = surfaced alive (bonus); otherwise the dive ended in a fall.
  function endRun(safe, why) {
    if (!run || !runRec) return null;
    const short = run.depth < 2 && run.blocks < 5; // a stumble near the surface is not worth a summary
    runRec = RUNS.load(LS); // the freshest bests / counts: another tab may have dived meanwhile (bugbash/saves.md S2)
    const sum = RUNS.finish(runRec, run, safe);
    RUNS.save(LS, runRec);
    startRun();
    if (short) return sum;
    showSummary(sum, why);
    if (sum.any) sfx('levelup');
    return sum;
  }
  function showSummary(sum, why) {
    $('run-title').textContent = sum.safe ? 'Dive complete!' : 'Dive over';
    $('run-why').textContent = why || '';
    $('run-score').textContent = 'Score ' + sum.score + (sum.pb.score ? '  New best!' : '  (best ' + runRec.best.score + ')');
    const ul = $('run-stats'); while (ul.firstChild) ul.removeChild(ul.firstChild);
    [['Depth', sum.depth, 'depth', sum.prev.depth], ['Ores', sum.ores, 'ores', sum.prev.ores], ['Best combo', 'x' + sum.combo, 'combo', sum.prev.combo], ['Blocks', sum.blocks, '', 0]].forEach((r) => {
      const li = document.createElement('li'); if (r[2] && sum.pb[r[2]]) li.className = 'pb';
      li.textContent = r[0] + ': ' + r[1];
      const sm = document.createElement('small'); sm.textContent = r[2] ? (sum.pb[r[2]] ? 'New personal best!' : 'Best ' + (r[2] === 'combo' ? 'x' : '') + r[3]) : 'Dives: ' + runRec.runs;
      li.appendChild(sm); ul.appendChild(li);
    });
    const nx = RUNS.MODS.filter((m) => m.id === run.mod)[0];
    $('run-next').textContent = 'This dive: ' + modName(sum.mod) + '. Next dive: ' + nx.name + ' (' + nx.desc + ')';
    $('run-tip').textContent = sum.short > 0 && sum.short <= 5 ? 'Only ' + sum.short + ' blocks short of your deepest dive!' : sum.safe ? 'Surfacing alive pays x' + RUNS.SAFE_BONUS + '. Go deeper next time?' : 'Tip: climb back out alive for a x' + RUNS.SAFE_BONUS + ' score bonus. Chain breaks within ' + RUNS.COMBO_GAP + ' s for combos.';
    togglePanel('craft', false); togglePanel('goals', false);
    $('run-panel').hidden = false;
    try { document.exitPointerLock(); } catch (e) { /* ignore */ }
    try { $('run-again').focus({ preventScroll: true }); } catch (e) { /* ignore */ }
  }
  function closeSummary() { $('run-panel').hidden = true; input.mine = false; }

  // ---------- meta: goals, mode, migration stamp (localStorage 'pixeltown-deepdelve-v1', corrupt-safe) ----------
  const clampInt = (v, lo, hi) => (typeof v === 'number' && isFinite(v) ? Math.max(lo, Math.min(hi, Math.floor(v))) : lo);
  function sanitiseMeta(raw) {
    let o = raw;
    if (typeof raw === 'string') { try { o = JSON.parse(raw); } catch (e) { o = null; } }
    if (!o || typeof o !== 'object' || Array.isArray(o)) o = {};
    const g = o.goals && typeof o.goals === 'object' && !Array.isArray(o.goals) ? o.goals : {};
    const out = {
      v: 1,
      mode: o.mode === 'creative' ? 'creative' : 'survival',
      migratedFrom: o.migratedFrom === TOWN_KEY ? TOWN_KEY : '',
      cave: null,
      goals: { bronze: g.bronze === true, silver: g.silver === true, secret: g.secret === true, secretVoid: g.secretVoid === true, deaths: clampInt(g.deaths, 0, 9999), maxDepth: clampInt(g.maxDepth, 0, 99),
      // additive goals: depth 20/40, first crawler, the Rock Wyrm, 10 torches placed (counter clamped 0-10)
      depth20: g.depth20 === true, depth40: g.depth40 === true, crawler: g.crawler === true, wyrm: g.wyrm === true, torches: clampInt(g.torches, 0, 10), torches10: g.torches10 === true || clampInt(g.torches, 0, 10) >= 10,
      // MG2 (additive): blueprint builds and their hub medals
      buildHut: g.buildHut === true, buildBridge: g.buildBridge === true, buildLighthouse: g.buildLighthouse === true, build1: g.build1 === true, build3: g.build3 === true },
    };
    if (o.cave && typeof o.cave === 'object') {
      const c = o.cave, ci = c.inv && typeof c.inv === 'object' ? c.inv : {}, cp = c.pick && typeof c.pick === 'object' ? c.pick : {};
      out.cave = {
        seed: typeof c.seed === 'number' && Number.isInteger(c.seed) && c.seed >= 0 && c.seed < 4294967296 ? c.seed : null,
        inv: { dirt: clampInt(ci.dirt, 0, 9999), coal: clampInt(ci.coal, 0, 9999), iron: clampInt(ci.iron, 0, 9999), gold: clampInt(ci.gold, 0, 9999) },
        pick: { tier: clampInt(cp.tier, 0, 3), dur: clampInt(cp.dur, 0, 999) },
      };
    }
    return out;
  }
  function loadMeta() { try { return sanitiseMeta(LS.getItem(META_KEY)); } catch (e) { return sanitiseMeta(null); } }
  // Hub medal summary: this game's own additive key, read by the hub page only.
  function hubMedals() { if (CREATIVE) return; try { const g = meta.goals, m = ['bronze', 'silver', 'secret', 'depth20', 'depth40', 'crawler', 'wyrm', 'torches10', 'build1', 'build3'].filter((k) => g[k] === true); LS.setItem('pixeltown-medals-deepdelve-v1', JSON.stringify({ v: 1, m })); } catch (e) { /* storage blocked */ } try { const g = meta.goals; window.MMHubProfile.sync(LS, 'deepdelve', [g.maxDepth >= 1 && 'dig'].concat(['bronze', 'silver', 'secret', 'depth20', 'depth40', 'wyrm'].filter((k) => g[k] === true))); } catch (e) { /* hub map progress is optional */ } }
  function saveMeta() { if (CREATIVE) return true; hubMedals(); try { LS.setItem(META_KEY, JSON.stringify(meta)); return true; } catch (e) { return false; } }
  // Read-only look at the old in-town cave keys; never writes or deletes anything on the town save.
  function readTownCave() {
    let o;
    try { const raw = LS.getItem(TOWN_KEY); if (!raw) return null; o = JSON.parse(raw); } catch (e) { return null; }
    if (!o || typeof o !== 'object' || Array.isArray(o)) return null;
    if (o.caveSeed === undefined && o.caveInv === undefined && o.cavePick === undefined) return null;
    return sanitiseMeta({ cave: { seed: o.caveSeed, inv: o.caveInv, pick: o.cavePick } }).cave;
  }
  function migrateTown() {
    if (CREATIVE || meta.migratedFrom) return false;
    const t = readTownCave();
    if (!t) return false;
    meta.cave = t; meta.migratedFrom = TOWN_KEY;
    inv.dirt = (inv.dirt | 0) + t.inv.dirt; inv.coal = (inv.coal | 0) + t.inv.coal;
    inv.iron_ore = (inv.iron_ore | 0) + t.inv.iron; inv.gold_ore = (inv.gold_ore | 0) + t.inv.gold;
    if (t.pick.tier > pick.tier && t.pick.dur > 0) { pick.tier = t.pick.tier; pick.dur = Math.min(PICK_DUR[t.pick.tier], t.pick.dur); }
    saveMeta(); queueSave();
    return true;
  }
  let meta = sanitiseMeta(null);

  const coarse = !!(window.matchMedia && matchMedia('(pointer: coarse)').matches);
  const phone = coarse || window.innerWidth < 700;
  const VIEW = phone ? 3 : 5; // base (maximum) view distance in chunks; the quality governor may lower `view` at run time
  let view = VIEW;

  function hotbarItems() { return PLACEABLE.concat([[BENCH_ITEM, 0]]).filter((p) => (inv[p[0]] | 0) > 0).map((p) => ({ item: p[0], count: inv[p[0]] | 0 })); }
  function renderHud() {
    const hb = $('hotbar');
    while (hb.firstChild) hb.removeChild(hb.firstChild);
    const items = hotbarItems();
    if (!items.some((i) => i.item === sel) && items.length) sel = items[0].item;
    if (!items.length) {
      const h = document.createElement('span'); h.className = 'hint'; h.textContent = 'Mine blocks to fill your hotbar'; hb.appendChild(h);
    }
    items.forEach((it, n) => {
      const b = document.createElement('button');
      b.type = 'button'; b.className = 'btn slot' + (it.item === sel ? ' sel' : ''); b.dataset.item = it.item;
      const sw = document.createElement('span'); sw.className = 'sw'; sw.style.background = SWATCH[it.item];
      const t = document.createElement('span'); t.textContent = (n + 1) + ':' + (CREATIVE ? '\u221e' : it.count);
      b.appendChild(sw); b.appendChild(t);
      b.setAttribute('aria-label', it.item.replace(/_/g, ' ') + ' ' + (CREATIVE ? 'unlimited' : it.count));
      b.addEventListener('click', () => { sel = it.item; renderHud(); });
      hb.appendChild(b);
    });
    const cb = $('craft-btn');
    cb.disabled = !MMRecipes.canCraft(inv, 'torch');
    cb.textContent = 'Torch x' + (inv.torch | 0);
    cb.title = 'Craft 4 torches: 1 wood + 1 coal (wood ' + (inv.wood | 0) + ')';
    $('hud-hp').textContent = 'HP ' + player.hp + '/10';
    $('hpfill').style.width = Math.max(0, Math.min(100, player.hp * 10)) + '%';
    $('hpbar').setAttribute('aria-valuenow', String(player.hp));
    $('hud-pick').textContent = CREATIVE ? 'Creative world | ' + (meta.mode === 'creative' ? 'Flying' : 'Walking') : 'Pick: ' + TIER_NAME[pick.tier] + (pick.tier > 0 ? ' ' + pick.dur + '/' + PICK_DUR[pick.tier] : '') + ' | ' + (meta.mode === 'creative' ? 'Creative' : 'Survival');
    $('mode-btn').textContent = CREATIVE ? 'Fly: ' + (meta.mode === 'creative' ? 'On' : 'Off') : 'Mode: ' + (meta.mode === 'creative' ? 'Creative' : 'Survival');
    $('t-down').hidden = meta.mode !== 'creative';
    $('hud-seed').textContent = 'Seed ' + SEED + (wyrm.down ? ' | Wyrm trophy' : '');
    const have = [['coal'], ['iron_ore', 'iron'], ['gold_ore', 'gold'], ['crystal']].filter((ks) => ks.some((k) => (inv[k] | 0) > 0 || (found[k] | 0) > 0)).length;
    $('hud-goal').textContent = CREATIVE ? 'Build anything: every block is unlimited' : 'Goal: find all 4 ores (' + have + '/4), crystal lies deepest';
    if (!$('craft-panel').hidden) renderCraft();
    if (!$('goals-panel').hidden) renderGoals();
  }
  const found = {};
  function craftTorch() {
    if (MMRecipes.craft(inv, 'torch')) { toast('Crafted 4 torches'); queueSave(); } else toast('Need 1 wood + 1 coal');
    renderHud();
  }

  // ---------- collision ----------
  const HALF = 0.3, HEIGHT = 1.8, EYE = 1.62, EPS = 1e-5;
  const solidId = (id) => id !== B.AIR && id !== B.TORCH && id !== B.WATER && id !== B.LAVA;
  function solidAt(wx, wy, wz) {
    if (wx < 0 || wz < 0 || wx >= SIZE * MMChunks.WORLD.cx || wz >= SIZE * MMChunks.WORLD.cz) return true;
    if (wy >= SIZE * MMChunks.WORLD.cy) return true;
    if (wy < 0) return false;
    return solidId(world.getBlock(wx, wy, wz));
  }
  // Cell wy spans three y in [-wy-1, -wy] (y is depth). Body box = feet y .. y+HEIGHT.
  function collides(x, y, z, half, height) {
    half = half || HALF; height = height || HEIGHT;
    const x0 = Math.floor(x - half + EPS), x1 = Math.floor(x + half - EPS), z0 = Math.floor(z - half + EPS), z1 = Math.floor(z + half - EPS);
    const y0 = Math.floor(-(y + height) + EPS), y1 = Math.ceil(-(y + EPS)) - 1;
    for (let wy = y0; wy <= y1; wy++) for (let wz = z0; wz <= z1; wz++) for (let wx = x0; wx <= x1; wx++) if (solidAt(wx, wy, wz)) return true;
    return false;
  }
  const flying = () => MMRecipes.mode(meta.mode).flight;
  function hurt(n, msg, deathMsg) {
    if (CREATIVE || player.iframes > 0) return; // the calm creative world has no hazards
    player.iframes = 0.6;
    player.hp -= n;
    sfx('hurt'); shake(0.12, 0.25);
    if (player.hp <= 0) { die(deathMsg || 'You were defeated. Back to the surface.'); return; }
    if (msg) toast(msg);
    renderHud();
  }
  // Any death voids the secret Lava Lake bridge for good (it is a no-death challenge).
  function die(msg) {
    if (CREATIVE) { deathCause = ''; respawn(msg); return; }
    if (deathCause === 'creature' && meta.mode === 'survival') {
      const k = MMDDMobs.deathKeep(inv), names = Object.keys(k.lost);
      names.forEach((n) => { inv[n] = k.inv[n]; });
      if (names.length) msg = (msg || '') + ' You kept your tools and ores but lost half your ' + names.join(' and ') + '.';
    }
    deathCause = '';
    meta.goals.deaths = Math.min(9999, meta.goals.deaths + 1);
    meta.goals.secretVoid = true;
    saveMeta();
    respawn(msg);
    endRun(false, msg);
  }
  function respawn(msg) {
    player.x = spawn.x; player.y = spawn.y; player.z = spawn.z; player.vy = 0; player.hp = 10; player.peak = player.y; player.iframes = 1; lavaT = 0;
    slimes.forEach((m) => { m.dead = true; removeMesh(m); }); slimes.length = 0;
    clearCreatures(); wyrmSleep(true);
    if (msg) toast(msg);
    renderHud();
  }
  const SPEED = 4.3, GRAV = 28, JUMP = 8.6, FLY = 6;
  let lavaT = 0;
  function physics(dt) {
    const p = player;
    let f = input.fwd, s = input.strafe;
    const len = Math.hypot(f, s);
    if (len > 1) { f /= len; s /= len; }
    const sn = Math.sin(p.yaw), cs = Math.cos(p.yaw);
    const fly = flying(), spd = fly ? SPEED * 1.4 : SPEED;
    if (p.iframes > 0) p.iframes = Math.max(0, p.iframes - dt);
    const vx = (-sn * f + cs * s) * spd, vz = (-cs * f - sn * s) * spd;
    const nx = p.x + vx * dt; if (!collides(nx, p.y, p.z)) p.x = nx;
    const nz = p.z + vz * dt; if (!collides(p.x, p.y, nz)) p.z = nz;
    if (fly) { p.vy = ((input.jump ? 1 : 0) - (input.down ? 1 : 0)) * FLY; p.onGround = false; p.peak = p.y; }
    else {
      if (input.jump && p.onGround) { p.vy = JUMP; p.onGround = false; }
      p.vy = Math.max(-40, p.vy - GRAV * dt);
    }
    const ny = p.y + p.vy * dt;
    if (!collides(p.x, ny, p.z)) {
      if (p.vy < 0 && p.onGround) p.onGround = false;
      p.y = ny;
      if (p.y > p.peak || p.vy > 0) p.peak = Math.max(p.peak, p.y);
      if (p.vy < 0) p.onGround = false;
    } else {
      let lo = p.y, hi = ny;
      for (let i = 0; i < 12; i++) { const m = (lo + hi) / 2; if (collides(p.x, m, p.z)) hi = m; else lo = m; }
      p.y = lo;
      if (p.vy < 0) {
        const fall = p.peak - p.y;
        p.onGround = true;
        if (fall > 4.5 && MMRecipes.mode(meta.mode).fallDamage && !CREATIVE) {
          p.hp -= Math.floor(fall - 3);
          if (p.hp <= 0) { die('You fell too far. Back to the surface.'); return; }
          toast('Ouch! Fall damage');
          renderHud();
        }
        p.peak = p.y;
      }
      p.vy = 0;
    }
    if (p.y < -70) { die('You fell out of the world.'); return; }
    hazards(dt);
  }
  function inLava() {
    const p = player, x0 = Math.floor(p.x - HALF + EPS), x1 = Math.floor(p.x + HALF - EPS), z0 = Math.floor(p.z - HALF + EPS), z1 = Math.floor(p.z + HALF - EPS);
    const y0 = Math.floor(-(p.y + HEIGHT * 0.6)), y1 = Math.floor(-(p.y + 0.05));
    for (let wy = y0; wy <= y1; wy++) for (let wz = z0; wz <= z1; wz++) for (let wx = x0; wx <= x1; wx++) if (wy >= 0 && world.getBlock(wx, wy, wz) === B.LAVA) return true;
    return false;
  }
  // Lava hurts 2 hearts every 0.4 s while any part of your body is in it.
  function hazards(dt) {
    if (CREATIVE) { lavaT = 0; return; }
    if (inLava()) {
      lavaT += dt;
      if (lavaT >= 0.4) { lavaT = 0; player.iframes = 0; hurt(2, 'Lava! Get out!', 'You fell into the lava. Back to the surface.'); }
    } else lavaT = 0;
  }

  // ---------- ray / edit ----------
  function eyePos() { return [player.x, player.y + EYE, player.z]; }
  function lookDir() {
    const cp = Math.cos(player.pitch);
    return [-Math.sin(player.yaw) * cp, Math.sin(player.pitch), -Math.cos(player.yaw) * cp];
  }
  const cellOf = (x, y, z) => [Math.floor(x), Math.floor(-y), Math.floor(z)];
  function raycast(reach) {
    const e = eyePos(), d = lookDir();
    let prev = null;
    for (let t = 0; t <= reach; t += 0.04) {
      const c = cellOf(e[0] + d[0] * t, e[1] + d[1] * t, e[2] + d[2] * t);
      if (c[1] < 0) { prev = c; continue; }
      const id = world.getBlock(c[0], c[1], c[2]);
      if (id !== B.AIR && id !== B.WATER) return { cell: c, id, prev };
      if (!prev || prev[0] !== c[0] || prev[1] !== c[1] || prev[2] !== c[2]) prev = c;
    }
    return null;
  }
  function afterEdit(dirty) {
    dirty.forEach((k) => stale.add(k));
    lightDirty = true; manageSkip = false; rayRev++;
    queueSave();
  }
  function mineBlock(wx, wy, wz) {
    const id = world.getBlock(wx, wy, wz);
    if (id === B.AIR || id === B.BEDROCK || id === B.LAVA || id === B.WATER) return false;
    if (!CREATIVE && (NEED_TIER[id] | 0) > pick.tier) { toast('Too hard! Needs a ' + TIER_NAME[NEED_TIER[id]].toLowerCase() + ' pick or better.'); return false; }
    const dirty = world.setBlock(wx, wy, wz, B.AIR);
    if (!dirty.length) return false;
    const item = ITEM_OF[id];
    const wasPlaced = placedCells.delete(cellKey(wx, wy, wz)); // G-10
    if (item && !CREATIVE) { inv[item] = (inv[item] | 0) + 1; found[item] = 1; onMined(item, undefined, wasPlaced); }
    if (!CREATIVE) findBlueprint(id, wy);
    if (!CREATIVE) wearPick(NEED_TIER[id] ? 2 : 1);
    afterEdit(dirty);
    renderHud();
    return true;
  }
  function wearPick(n) {
    if (pick.tier < 1) return;
    pick.dur = Math.max(0, pick.dur - n);
    if (pick.dur <= 0) { toast('Your ' + TIER_NAME[pick.tier].toLowerCase() + ' pick broke!'); pick.tier = 0; pick.dur = 0; }
  }
  function placeBlock(wx, wy, wz, item) {
    item = item || sel;
    if (item === BENCH_ITEM) return placeBench(wx, wy, wz);
    const id = BLOCK_OF[item];
    if (!id || (inv[item] | 0) <= 0) return false;
    const here = world.getBlock(wx, wy, wz);
    if (wy < 0 || (here !== B.AIR && !(here === B.LAVA && item !== 'torch'))) return false;
    if (id !== B.TORCH) {
      // refuse to entomb the player
      const sv = world.getBlock(wx, wy, wz);
      void sv;
      const x0 = player.x - HALF, x1 = player.x + HALF, z0 = player.z - HALF, z1 = player.z + HALF;
      const y0 = player.y, y1 = player.y + HEIGHT;
      if (wx + 1 > x0 && wx < x1 && wz + 1 > z0 && wz < z1 && -wy > y0 && -wy - 1 < y1) return false;
    }
    const dirty = world.setBlock(wx, wy, wz, id);
    if (!dirty.length) return false;
    if (!CREATIVE) { inv[item] -= 1; notePlaced(wx, wy, wz); } // unlimited blocks in the creative world; G-10: remember a placed cell
    if (id === LAMP) lampChunks.add(MMChunks.key(Math.floor(wx / SIZE), Math.floor(wy / SIZE), Math.floor(wz / SIZE)));
    if (CREATIVE) { buildCheck(wx, wy, wz); afterEdit(dirty); renderHud(); return true; }
    buildCheck(wx, wy, wz);
    if (id === B.TORCH && meta.goals.torches < 10) { meta.goals.torches++; if (meta.goals.torches >= 10) award('torches10'); else saveMeta(); }
    lakeCheck(wx, wy, wz, id);
    afterEdit(dirty);
    renderHud();
    return true;
  }

  // ---------- persistence ----------
  let saveTimer = 0, savePending = false;
  function queueSave() { savePending = true; clearTimeout(saveTimer); saveTimer = setTimeout(flush, 400); }
  function flush() {
    clearTimeout(saveTimer);
    if (!world) return Promise.resolve(false);
    savePending = false;
    const doc = { inv: Object.assign({}, inv), pos: [player.x, player.y, player.z], sel, hp: player.hp, pick: { tier: pick.tier, dur: pick.dur }, benches: benches.map((b) => b.slice()), t: clock.t, slain: Array.from(slain).slice(-300), wyrm: { down: wyrm.down, carved: wyrm.carved } };
    if (mouthOn) doc.mouth = 1;
    return Promise.all([kvSet('world:' + SEED, world.serialise()), kvSet('player:' + SEED, JSON.stringify(doc))]).then((r) => !!r[0]);
  }
  window.addEventListener('pagehide', () => { if (savePending) flush(); });
  document.addEventListener('visibilitychange', () => { if (document.hidden && savePending) flush(); });

  // ---------- rendering ----------
  let renderer = null, scene = null, camera = null, atlasTex = null, material = null, outline = null, torchGeo = null, torchMat = null;
  const meshes = new Map(); // key -> { mesh, torches }
  const stale = new Set();
  let lastAnimated = false, renderRev = 0, lastRenderKey = '', lastRenderAt = 0;
  let lightDirty = true, win = null, manageSkip = false, lastPc = '', backlog = 0;
  const MAX_BUILDS = 3; // chunk meshes rebuilt per frame at most (the rest wait for the next frame)
  const WIN = 5; // light window in chunks (xz), full depth
  function makeAtlas() {
    const c = document.createElement('canvas'); c.width = 64; c.height = 64;
    const g = c.getContext('2d');
    const base = ['#000', '#5fa63f', '#7a5230', '#7d8189', '#7d8189', '#7d8189', '#7d8189', '#7d8189', '#e8541a', '#3a6fd8', '#2a2a30', '#ffb02e', '#5a5e66', '#2f8f86', '#6b5a3a', '#9a9ea8'];
    const fleck = [null, '#4a8a2e', '#5c3a20', '#6a6e76', '#202024', '#d8a77a', '#f2c744', '#7fe8ff', '#ffd23a', '#6fa0f0', '#18181c', '#fff3a0', '#ff9a2e', '#bffff0', '#fff0b0', '#6e727b'];
    for (let id = 0; id < 16; id++) {
      const rng = MMRng.create('tile' + id);
      const ox = (id % 4) * 16, oy = Math.floor(id / 4) * 16;
      g.fillStyle = base[id]; g.fillRect(ox, oy, 16, 16);
      if (id === 0) { g.clearRect(ox, oy, 16, 16); continue; }
      for (let i = 0; i < 40; i++) { g.fillStyle = rng.next() < 0.5 ? 'rgba(0,0,0,0.12)' : 'rgba(255,255,255,0.1)'; g.fillRect(ox + rng.int(0, 15), oy + rng.int(0, 15), 1 + rng.int(0, 1), 1); }
      if (id === 13) { g.fillStyle = '#5fe0c8'; for (let i = 0; i < 7; i++) { const x = rng.int(1, 12), y = rng.int(1, 12); g.fillRect(ox + x, oy + y, 3, 3); } g.fillStyle = fleck[13]; for (let i = 0; i < 8; i++) g.fillRect(ox + rng.int(1, 14), oy + rng.int(1, 14), 1, 1); continue; }
      if (id === 14) { g.fillStyle = '#fff0b0'; g.fillRect(ox + 2, oy + 2, 12, 12); g.fillStyle = '#ffe07a'; g.fillRect(ox + 4, oy + 4, 8, 8); g.fillStyle = '#6b5a3a'; g.fillRect(ox + 7, oy, 2, 16); g.fillRect(ox, oy + 7, 16, 2); continue; }
      if (id === 15) { g.fillStyle = fleck[15]; for (let r = 0; r < 4; r++) { g.fillRect(ox, oy + r * 4 + 3, 16, 1); for (let c = 0; c < 2; c++) g.fillRect(ox + ((c * 8 + (r % 2) * 4) % 16), oy + r * 4, 1, 3); } continue; }
      if (id === 12) { g.fillStyle = '#2a2c30'; g.fillRect(ox + 3, oy + 4, 10, 8); g.fillStyle = '#ff9a2e'; g.fillRect(ox + 5, oy + 6, 6, 4); g.fillStyle = '#ffd23a'; g.fillRect(ox + 7, oy + 7, 2, 2); continue; }
      if (fleck[id] && id >= 4 && id <= 7) {
        g.fillStyle = fleck[id];
        for (let i = 0; i < 9; i++) g.fillRect(ox + rng.int(1, 13), oy + rng.int(1, 13), 2, 2);
      } else if (fleck[id]) {
        g.fillStyle = fleck[id];
        for (let i = 0; i < 14; i++) g.fillRect(ox + rng.int(0, 15), oy + rng.int(0, 15), 1, 1);
      }
    }
    const t = new THREE.CanvasTexture(c);
    t.magFilter = THREE.NearestFilter; t.minFilter = THREE.NearestFilter; t.generateMipmaps = false;
    return t;
  }
  // R4 (b13-05 Deepdelve spikes): WebGL compiles a shader program the first time a material kind is DRAWN. The block outline
  // (LineBasicMaterial), torches (plain MeshBasic) and textured sprites (slimes / benches: map, no vertex colours) were first drawn
  // on the player's first tap / first torch / first mob, so that frame paid the compile. Compile them once at boot (behind the
  // loading state) with stand-in objects; nothing is drawn and nothing changes on screen.
  function prewarmPrograms() {
    if (!renderer || !scene || !camera || typeof renderer.compile !== 'function') return;
    const extra = [];
    try {
      const wasOutline = outline ? outline.visible : false;
      if (outline) outline.visible = true;
      if (torchGeo && torchMat) extra.push(new THREE.Mesh(torchGeo, torchMat));
      if (atlasTex) extra.push(new THREE.Mesh(new THREE.PlaneGeometry(0.1, 0.1), new THREE.MeshBasicMaterial({ map: atlasTex, transparent: true, opacity: 0.92 })));
      extra.forEach((m) => scene.add(m));
      renderer.compile(scene, camera);
      if (outline) outline.visible = wasOutline;
    } catch (e) { /* optional: the first draw compiles as before */ }
    extra.forEach((m) => { scene.remove(m); if (m.geometry !== torchGeo) { m.geometry.dispose(); m.material.dispose(); } });
    renderRev++;
  }
  function initRenderer() {
    if (!window.THREE) { toast('3D engine failed to load'); return false; }
    try {
      renderer = new THREE.WebGLRenderer({ canvas: $('gl'), antialias: false, preserveDrawingBuffer: TEST });
    } catch (e) { renderer = null; say('WebGL is not available here'); return false; }
    renderer.setPixelRatio(pixelRatio());
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x8fd0ff);
    scene.fog = new THREE.Fog(0x8fd0ff, 8, view * SIZE);
    camera = new THREE.PerspectiveCamera(70, 1, 0.05, view * SIZE + 24);
    camera.rotation.order = 'YXZ';
    atlasTex = makeAtlas();
    material = new THREE.MeshBasicMaterial({ map: atlasTex, vertexColors: true, transparent: false });
    outline = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(1.01, 1.01, 1.01)), new THREE.LineBasicMaterial({ color: 0xffffff }));
    outline.visible = false; scene.add(outline);
    torchGeo = new THREE.BoxGeometry(0.2, 0.6, 0.2);
    torchMat = new THREE.MeshBasicMaterial({ color: 0xffb02e });
    resize();
    return true;
  }
  // Low graphics (Settings or the saved access pref): the governor starts at, and never restores above, the low view.
  function applyLowGfx() {
    if (ACCESS.lowGfx) { const i = LEVELS.findIndex((L) => L.view <= 3 && L.scale <= 0.75); govFloor = i < 0 ? 0 : i; gov.level = Math.max(gov.level, govFloor); }
    else govFloor = 0;
    applyLevel();
  }
  // ---------- adaptive quality governor ----------
  // Lowers render scale, then view distance, when the rolling frame time is high; restores slowly when it is low.
  // At most one change per MIN_GAP ms; restores wait longer (and back off further if they bounce straight back).
  const GOV = { WINDOW: 30, MIN_SAMPLES: 20, HIGH: 34, LOW: 20, MIN_GAP: 2000, RESTORE_GAP: 6000, MAX_RESTORE_GAP: 60000 };
  const LEVELS = (function () {
    const L = [{ scale: 1, view: VIEW }, { scale: 0.75, view: VIEW }];
    for (let v = VIEW - 1; v >= 3; v--) L.push({ scale: 0.75, view: v });
    L.push({ scale: 0.6, view: Math.min(VIEW, 3) }, { scale: 0.5, view: Math.min(VIEW, 3) }, { scale: 0.4, view: Math.min(VIEW, 3) });
    return L;
  }());
  let govFloor = 0; // access lowGfx keeps the governor at (or below) the low view
  const gov = { level: 0, samples: [], head: 0, count: 0, lastChange: -1e9, lastRaise: -1e9, restoreGap: GOV.RESTORE_GAP, changes: 0, auto: params.get('perf') !== '0' };
  let resizeTimer = 0, lastResizeAt = -1e9; // beta S-11: see onResize
  // Desktop render-pixel budget: big or hi-dpi windows are rendered below native size (the fill cost is what software and
  // integrated GPUs choke on). Phones keep 1:1; a 1280x720 window (544 px canvas) renders at ~0.83, a 4K window at 0.6.
  const MAX_PIXELS = 480000;
  function basePixelRatio() {
    const c = document.getElementById('gl'), area = c ? c.clientWidth * c.clientHeight : 0;
    let r = Math.min(window.devicePixelRatio || 1, 2);
    if (!phone && area > 0) r = Math.min(r, Math.max(0.6, Math.sqrt(MAX_PIXELS / area)));
    return r;
  }
  // 8-bit pass: the 3D view renders at half resolution and the canvas is upscaled with image-rendering: pixelated, so every
  // block face reads as chunky 2x2 pixels (and the fill cost halves twice). ?px=0 renders at the old full resolution.
  const PX8 = params.get('px') === '0' ? 1 : 0.5;
  const pixelRatio = () => basePixelRatio() * LEVELS[gov.level].scale * PX8;
  function govAvg() {
    if (!gov.count) return 0;
    let t = 0;
    for (let i = 0; i < gov.count; i++) t += gov.samples[i];
    return t / gov.count;
  }
  function govReset() { gov.count = 0; gov.head = 0; }
  function applyLevel() {
    const L = LEVELS[gov.level];
    if (L.view !== view) { view = L.view; manageSkip = false; if (camera) { scene.fog.far = view * SIZE; camera.far = view * SIZE + 24; camera.updateProjectionMatrix(); } }
    if (renderer) { renderer.setPixelRatio(pixelRatio()); resize(); }
  }
  // Feed one frame time (ms) at time `now` (ms). Returns true when quality changed.
  function govFrame(ms, now) {
    if (!(ms > 0) || ms > 500) return false; // tab switches and stalls are not render cost
    if (now - lastResizeAt < 1000) return false; // beta S-11: a resize storm is not render cost either
    gov.samples[gov.head] = ms; gov.head = (gov.head + 1) % GOV.WINDOW; gov.count = Math.min(GOV.WINDOW, gov.count + 1);
    if (gov.count < GOV.MIN_SAMPLES || now - gov.lastChange < GOV.MIN_GAP) return false;
    const avg = govAvg();
    if (avg > GOV.HIGH && gov.level < LEVELS.length - 1) {
      if (now - gov.lastRaise < 15000) gov.restoreGap = Math.min(GOV.MAX_RESTORE_GAP, gov.restoreGap * 2); // bounced back: wait longer next time
      gov.level++;
    } else if (avg < GOV.LOW && gov.level > govFloor && now - gov.lastChange >= gov.restoreGap) {
      gov.level--; gov.lastRaise = now;
    } else return false;
    gov.lastChange = now; gov.changes++; govReset(); applyLevel();
    return true;
  }
  function govState() { const L = LEVELS[gov.level]; return { level: gov.level, levels: LEVELS.length, scale: L.scale, view: L.view, avg: govAvg(), changes: gov.changes, restoreGap: gov.restoreGap, auto: gov.auto }; }

  // Day/night: sky light is scaled in a few discrete steps; a step change re-lights every loaded chunk (3 per frame).
  function applyTime(force) {
    const st = MMDDTime.skyStep(clock.t);
    if (st === clock.step && !force) return false;
    clock.step = st; clock.k = MMDDTime.skyScale(clock.t);
    if (win) { for (const k of meshes.keys()) stale.add(k); manageSkip = false; }
    return true;
  }
  let lastTimeText = '';
  function tickTime(dt) {
    clock.t = MMDDTime.norm(clock.t + dt);
    applyTime(false);
  }
  function setTime(t) { clock.t = MMDDTime.norm(t); applyTime(true); skyDeep = -1; if (renderer && camera) updateCamera(); return clock.t; }

  function resize() {
    if (!renderer) return;
    renderRev++;
    renderer.setPixelRatio(pixelRatio());
    const c = $('gl'), w = c.clientWidth || 300, h = c.clientHeight || 300;
    renderer.setSize(w, h, false);
    camera.aspect = w / h; camera.updateProjectionMatrix();
  }
  // Beta S-11 (b13-07): a rotation / resize storm used to re-allocate the drawing buffer on every event AND feed those slow frames to
  // the quality governor, which then halved the render scale (195x331 -> 97x165 on a phone) and kept it there. Now the resize is
  // applied once, 150 ms after the last event, and frames within 1 s of a resize are not counted as render cost.
  function onResize() {
    lastResizeAt = performance.now(); govReset();
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => { resizeTimer = 0; resize(); lastResizeAt = performance.now(); govReset(); }, 150);
  }
  window.addEventListener('resize', onResize);

  function fillWindow(pcx, pcz) {
    const ox = Math.max(0, Math.min(MMChunks.WORLD.cx - WIN, pcx - 2)), oz = Math.max(0, Math.min(MMChunks.WORLD.cz - WIN, pcz - 2));
    win = { ox, oz, light: null, w: WIN * SIZE, h: MMChunks.WORLD.cy * SIZE };
    return win;
  }
  function relight() {
    const w = WIN * SIZE, h = MMChunks.WORLD.cy * SIZE, blocks = new Uint8Array(w * h * w);
    for (let cy = 0; cy < MMChunks.WORLD.cy; cy++) for (let cz = 0; cz < WIN; cz++) for (let cx = 0; cx < WIN; cx++) {
      const ch = world.getChunk(win.ox + cx, cy, win.oz + cz);
      for (let ly = 0; ly < SIZE; ly++) for (let lz = 0; lz < SIZE; lz++) {
        blocks.set(ch.data.subarray(lz * SIZE + ly * 256, lz * SIZE + ly * 256 + SIZE), cx * SIZE + (cz * SIZE + lz) * w + (cy * SIZE + ly) * w * w);
      }
      // glow lamps shine like a torch (a steady, calm light): only chunks that ever had one placed are scanned
      if (lampChunks.size && lampChunks.has(MMChunks.key(win.ox + cx, cy, win.oz + cz))) {
        const d = ch.data;
        for (let i = 0; i < d.length; i++) if (d[i] === LAMP) blocks[cx * SIZE + (i & 15) + (cz * SIZE + ((i >> 4) & 15)) * w + (cy * SIZE + (i >> 8)) * w * w] = B.TORCH;
      }
    }
    const lr = MMLight.propagate({ w, h, d: w, blocks });
    win.light = lr.light; win.sky = lr.sky; win.block = lr.block;
    lightDirty = false;
  }
  function lightAt(wx, wy, wz) {
    if (!win || !win.light) return 7;
    const x = wx - win.ox * SIZE, z = wz - win.oz * SIZE, w = win.w;
    if (x < 0 || z < 0 || x >= w || z >= w || wy < 0 || wy >= win.h) return 7;
    const i = x + z * w + wy * w * w;
    // sky light follows the day/night clock; torch (block) light never dims. At full day this equals the plain max.
    return Math.max(win.sky[i] * clock.k, win.block[i]);
  }
  const UVS = [[0, 0], [1, 0], [1, 1], [0, 1]];
  function buildChunk(cx, cy, cz) {
    const k = MMChunks.key(cx, cy, cz);
    renderRev++;
    const old = meshes.get(k);
    if (old) disposeEntry(old);
    meshes.delete(k);
    const ch = world.getChunk(cx, cy, cz);
    const m = MMChunks.mesh(ch, world.neighbours(cx, cy, cz));
    const group = new THREE.Group();
    group.position.set(cx * SIZE, -cy * SIZE, cz * SIZE);
    const n = m.faceCount;
    if (n) {
      const pos = new Float32Array(n * 12), uv = new Float32Array(n * 8), col = new Float32Array(n * 12), idx = new Uint32Array(n * 6);
      for (let f = 0; f < n; f++) {
        const id = m.blocks[f], b = f * 12;
        let ax = 0, ay = 0, az = 0;
        for (let v = 0; v < 4; v++) {
          const x = m.positions[b + v * 3], y = m.positions[b + v * 3 + 1], z = m.positions[b + v * 3 + 2];
          pos[b + v * 3] = x; pos[b + v * 3 + 1] = -y; pos[b + v * 3 + 2] = z;
          ax += x; ay += y; az += z;
          const u = UVS[v], tc = id % 4, tr = Math.floor(id / 4);
          uv[f * 8 + v * 2] = (tc + 0.02 + u[0] * 0.96) / 4;
          uv[f * 8 + v * 2 + 1] = 1 - (tr + 1) / 4 + (0.02 + u[1] * 0.96) / 4;
        }
        const nx = m.normals[b], ny = m.normals[b + 1], nz = m.normals[b + 2];
        const wx = Math.floor(ax / 4 + 0.5 * nx) + cx * SIZE, wy = Math.floor(ay / 4 + 0.5 * ny) + cy * SIZE, wz = Math.floor(az / 4 + 0.5 * nz) + cz * SIZE;
        let br = 0.08 + 0.92 * Math.pow(lightAt(wx, wy, wz) / 15, 1.3);
        br *= ny === -1 ? 1 : ny === 1 ? 0.55 : nx !== 0 ? 0.8 : 0.9;
        if (id === B.LAVA) br = Math.max(br, 0.95); else if (id === B.CRYSTAL) br = Math.max(br, 0.35 + br * 0.65);
        else if (id === GLOW) br = Math.max(br, 0.55 + br * 0.45); else if (id === LAMP) br = 1;
        for (let v = 0; v < 4; v++) { col[b + v * 3] = br; col[b + v * 3 + 1] = br; col[b + v * 3 + 2] = br; }
        const i = f * 6, q = f * 4;
        idx[i] = q; idx[i + 1] = q + 2; idx[i + 2] = q + 1; idx[i + 3] = q; idx[i + 4] = q + 3; idx[i + 5] = q + 2;
      }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
      geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
      geo.setIndex(new THREE.BufferAttribute(idx, 1));
      geo.computeBoundingSphere();
      group.add(new THREE.Mesh(geo, material));
    }
    for (let i = 0; i < ch.data.length; i++) {
      if (ch.data[i] !== B.TORCH) continue;
      const t = new THREE.Mesh(torchGeo, torchMat);
      t.position.set((i % 16) + 0.5, -(Math.floor(i / 256) + 1) + 0.3, (Math.floor(i / 16) % 16) + 0.5);
      group.add(t);
    }
    scene.add(group);
    meshes.set(k, { group, faces: n });
    stale.delete(k);
  }
  function disposeEntry(e) {
    renderRev++;
    scene.remove(e.group);
    e.group.children.forEach((c) => { if (c.geometry && c.geometry !== torchGeo) c.geometry.dispose(); });
  }
  function playerChunk() { return { cx: Math.floor(player.x / SIZE), cy: Math.max(0, Math.min(3, Math.floor(-(player.y + EYE) / SIZE))), cz: Math.floor(player.z / SIZE) }; }
  function manage(budgetMs) {
    if (!scene) return;
    const pc = playerChunk();
    if (!win || pc.cx < win.ox + 1 && win.ox > 0 || pc.cx > win.ox + WIN - 2 && win.ox < MMChunks.WORLD.cx - WIN || pc.cz < win.oz + 1 && win.oz > 0 || pc.cz > win.oz + WIN - 2 && win.oz < MMChunks.WORLD.cz - WIN) {
      const before = win;
      fillWindow(pc.cx, pc.cz);
      if (!before || before.ox !== win.ox || before.oz !== win.oz) { lightDirty = true; for (const k of meshes.keys()) stale.add(k); }
    }
    if (lightDirty) {
      relight(); manageSkip = false;
      // light spreads at most 15 cells: refresh chunks near the edits
      for (const k of Array.from(stale)) {
        const p = k.split(',').map(Number);
        for (let dy = -1; dy <= 1; dy++) for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
          const kk = MMChunks.key(p[0] + dx, p[1] + dy, p[2] + dz);
          if (meshes.has(kk)) stale.add(kk);
        }
      }
    }
    // Nothing moved, nothing edited, nothing left to build: skip the chunk scan (and its allocations) entirely.
    const pcKey = pc.cx + ',' + pc.cy + ',' + pc.cz;
    if (manageSkip && pcKey === lastPc && !stale.size && !lightDirty) return;
    lastPc = pcKey;
    const want = MMChunks.visible(pc, view);
    const t0 = performance.now();
    let built = 0, todo = 0;
    for (const c of want) {
      const k = MMChunks.key(c.cx, c.cy, c.cz);
      if (meshes.has(k) && !stale.has(k)) continue;
      if (budgetMs !== Infinity && (built >= MAX_BUILDS || performance.now() - t0 > budgetMs)) { todo++; continue; }
      buildChunk(c.cx, c.cy, c.cz); built++;
    }
    backlog = todo;
    for (const k of MMChunks.unload(Array.from(meshes.keys()), pc, view)) {
      const e = meshes.get(k); if (e) disposeEntry(e);
      meshes.delete(k); stale.delete(k);
    }
    manageSkip = todo === 0;
  }

  // ---------- main loop ----------
  let mineTarget = null, mineProg = 0, last = 0, spawnT = 6;
  // Mining progress bar under the crosshair (DOM width, only touched when it moves by 5% or more)
  let progShown = -1;
  function showProg(f) {
    const v = f <= 0 ? 0 : Math.min(1, Math.round(f * 20) / 20);
    if (v === progShown) return;
    progShown = v; const el = $('mineprog'); if (!el) return;
    el.style.width = Math.round(v * 100) + '%'; el.parentNode.hidden = v <= 0;
  }
  function updateMining(dt) {
    mineStep(dt);
    const hard = mineTarget && lastHit ? (HARDNESS[lastHit.id] || 0.8) * (CREATIVE ? 0.35 : 1) : 0;
    showProg(hard && mineProg > 0.001 ? mineProg / hard : 0);
  }
  let lastHit = null;
  function mineStep(dt) {
    lastHit = null;
    if (atkCd > 0) atkCd -= dt;
    if (input.mine && (attackSlime(true) || attackCreature(true) || attackWyrm(true))) { mineTarget = null; mineProg = 0; return; }
    if (input.mine && benches.length) { const bi = benchAtLook(); if (bi >= 0) { pickUpBench(bi); input.mine = false; return; } }
    const hit = input.mine ? raycast(5) : null;
    lastHit = hit;
    if (!hit || hit.id === B.BEDROCK || hit.id === B.LAVA) { mineTarget = null; mineProg = 0; return; }
    const key = hit.cell.join(',');
    if (mineTarget !== key) { mineTarget = key; mineProg = 0; }
    if (!CREATIVE && (NEED_TIER[hit.id] | 0) > pick.tier) { if (mineProg === 0) toast('Too hard! Needs a ' + TIER_NAME[NEED_TIER[hit.id]].toLowerCase() + ' pick or better. Open Craft' + (touchUI() ? '' : ' (C)') + ' to make one.'); mineProg = 0.001; return; }
    mineProg += dt * (1 + pick.tier * 0.4);
    if (mineProg >= (HARDNESS[hit.id] || 0.8) * (CREATIVE ? 0.35 : 1)) { mineBlock(hit.cell[0], hit.cell[1], hit.cell[2]); mineTarget = null; mineProg = 0; }
  }
  let atkCd = 0;
  let bobOffset = 0;
  let aimed = false; // the block outline stays hidden until the player first aims (pointer or touch), so spawn shows no stray square
  function aim() { if (!aimed) { aimed = true; rayRev++; } }
  let skyT = -1, skyX = NaN, skyZ = NaN, skySurf = 0, skyDeep = -1, rayRev = 0, rayPoseRev = -1, lastDepth = -1;
  const rayPose = [NaN, 0, 0, 0, 0];
  function updateCamera() {
    if (!camera) return;
    const moving = Math.hypot(input.fwd, input.strafe) > 0.1 && player.onGround;
    bobOffset = reduced || !moving ? 0 : Math.sin(performance.now() / 110) * 0.035;
    let sx = 0, sy = 0;
    if (shakeT > 0) { const a = shakeAmp * Math.min(1, shakeT * 6), q = performance.now() / 16; sx = Math.sin(q * 2.3) * a; sy = Math.cos(q * 3.1) * a; }
    camera.position.set(player.x + sx, player.y + EYE + bobOffset + sy, player.z);
    camera.rotation.set(player.pitch, player.yaw, 0);
    // sky/fog colour only depends on the column and depth: recompute when either changes
    const fx = Math.floor(player.x), fz = Math.floor(player.z);
    if (fx !== skyX || fz !== skyZ) { skyX = fx; skyZ = fz; skySurf = MMChunks.surfaceY(fx, fz, SEED); }
    const deep = Math.max(0, Math.min(1, (-(player.y + EYE) - skySurf - 1) / 4));
    const skyKey = MMDDTime.norm(clock.t) | 0;
    if (Math.abs(deep - skyDeep) > 0.002 || skyKey !== skyT) {
      skyDeep = deep; skyT = skyKey;
      const sc = MMDDTime.skyColor(clock.t);
      const r = sc[0] * (1 - deep) + 0.02 * deep, g = sc[1] * (1 - deep) + 0.03 * deep, b = sc[2] * (1 - deep) + 0.05 * deep;
      scene.background.setRGB(r, g, b); scene.fog.color.setRGB(r, g, b);
      const tt = MMDDTime.clockText(clock.t) + ' ' + MMDDTime.stage(clock.t);
      if (tt !== lastTimeText) { lastTimeText = tt; $('hud-time').textContent = tt; }
    }
    // the block outline only changes when the view ray or the world does
    const ex = player.x, ey = player.y, ez = player.z, yw = player.yaw, pt = player.pitch;
    if (ex !== rayPose[0] || ey !== rayPose[1] || ez !== rayPose[2] || yw !== rayPose[3] || pt !== rayPose[4] || rayRev !== rayPoseRev) {
      rayPose[0] = ex; rayPose[1] = ey; rayPose[2] = ez; rayPose[3] = yw; rayPose[4] = pt; rayPoseRev = rayRev;
      const hit = raycast(5);
      if (aimed && hit && hit.id !== B.AIR) { outline.visible = true; outline.position.set(hit.cell[0] + 0.5, -(hit.cell[1] + 0.5), hit.cell[2] + 0.5); } else outline.visible = false;
    }
    const dn = depthNow();
    if (dn !== lastDepth) { lastDepth = dn; $('hud-depth').textContent = 'Depth ' + dn; }
  }
  // Idle frames (nothing moved, nothing animates, nothing rebuilt) re-present the previous picture instead of rasterising
  // the whole world again. Anything that moves (mobs, wyrm, camera, sky, chunks, benches) changes the key or forces a draw.
  function renderIfChanged(t) {
    const animated = !!(slimes.length || creatures.length || creatureMeshes || wyrm.awake || wyrm.group), was = lastAnimated; lastAnimated = animated;
    const key = camera.position.x + ',' + camera.position.y + ',' + camera.position.z + ',' + camera.rotation.x + ',' + camera.rotation.y + ',' + renderRev + ',' + scene.background.getHex() + ',' + outline.visible + ',' + outline.position.x + ',' + outline.position.y + ',' + outline.position.z + ',' + benchRev + ',' + scene.fog.far;
    if (!animated && !was && key === lastRenderKey && t - lastRenderAt < 500) return;
    lastRenderKey = key; lastRenderAt = t;
    renderer.render(scene, camera);
  }
  function frame(t) {
    requestAnimationFrame(frame);
    if (gov.auto && last && backlog < 8) govFrame(t - last, t);
    const dt = Math.min(0.05, (t - last) / 1000 || 0); last = t;
    if (!world) return;
    if (shakeT > 0) { shakeT = Math.max(0, shakeT - dt); if (!shakeT) shakeAmp = 0; }
    if (!TEST) {
      const ty = turnKeys(), tp = pitchKeys();
      if (ty) player.yaw += ty * dt * 2.2;
      if (tp) player.pitch = Math.max(-1.55, Math.min(1.55, player.pitch + tp * dt * 1.8));
      physics(dt); updateMining(dt);
      if (!CREATIVE) {
        tickMobs(dt); tickTime(dt);
        creatureT -= dt;
        if (creatureT <= 0) { creatureT = 1.5; scanSpawns(); wyrmScan(); }
        if (creatures.length) tickCreatures(dt);
        if (wyrm.awake) tickWyrm(dt);
        spawnT -= dt;
        if (spawnT <= 0) { spawnT = 4; if (Math.random() < 0.6) autoSpawn(); }
      } else tickTime(dt);
    }
    checkGoals();
    manage(8);
    if (renderer) { syncBenches(); syncSlimeMeshes(); if (creatures.length || creatureMeshes) syncCreatureMeshes(); if (wyrm.awake || wyrm.group) syncWyrmMesh(); updateCamera(); renderIfChanged(t); }
  }

  // ---------- controls ----------
  function bindControls() {
    const cv = $('gl');
    const KEYMAP = { w: 'fwd+', arrowup: 'fwd+', s: 'fwd-', arrowdown: 'fwd-', a: 'str-', arrowleft: 'str-', d: 'str+', arrowright: 'str+' };
    function syncKeys() {
      input.fwd = (keys.w || keys.arrowup ? 1 : 0) - (keys.s || keys.arrowdown ? 1 : 0) + joy.y;
      input.strafe = (keys.d || keys.arrowright ? 1 : 0) - (keys.a || keys.arrowleft ? 1 : 0) + joy.x;
      input.fwd = Math.max(-1, Math.min(1, input.fwd)); input.strafe = Math.max(-1, Math.min(1, input.strafe));
    }
    const joy = { x: 0, y: 0 };
    // Keyboard (CONTROLS.md aliases): WASD/arrows move, Space/Enter jump, Shift/E place (Shift = down while flying), F mine,
    // J/L/I/K look (so the whole game is reachable without a mouse), Esc/P close a panel or open the menu.
    const TURN = { j: 1, l: -1, i: 1, k: -1 };
    const typing = (e) => { const t = e.target, n = t && t.tagName; return !!t && (t.isContentEditable || n === 'INPUT' || n === 'TEXTAREA' || n === 'SELECT'); };
    window.addEventListener('keydown', (e) => {
      if (e.ctrlKey || e.metaKey || e.altKey || typing(e)) return; // browser shortcuts (Ctrl+C...) and text fields are never game keys
      const k = (e.key || '').toLowerCase();
      if (KEYMAP[k]) { keys[k] = true; syncKeys(); e.preventDefault(); }
      else if (k === ' ' || k === 'enter') { if (k === 'enter' && e.target && e.target.tagName === 'BUTTON') return; input.jump = true; e.preventDefault(); }
      else if (k === 'shift') { input.down = true; if (!flying() && !e.repeat) placeAtLook(); }
      else if (k === 'e') { if (!e.repeat) { aim(); placeAtLook(); } }
      else if (k === 'f') { aim(); input.mine = true; }
      else if (TURN[k] !== undefined) { keys[k] = true; aim(); }
      else if (k === 'c') togglePanel('craft');
      else if (k === 't') craftTorch();
      else if (k === 'g') togglePanel('goals');
      else if (k === 'm') setMode(meta.mode === 'creative' ? 'survival' : 'creative');
      else if (window.MMInput ? MMInput.actionOf(e) === 'menu' : (k === 'escape' || k === 'p')) { if (!closeAll() && window.MMNav && MMNav.open) MMNav.open(); }
      else if (/^[1-9]$/.test(k)) { const it = hotbarItems()[+k - 1]; if (it) { sel = it.item; renderHud(); } }
    });
    window.addEventListener('keyup', (e) => {
      const k = (e.key || '').toLowerCase();
      if (KEYMAP[k]) { keys[k] = false; syncKeys(); } else if (k === ' ' || k === 'enter') input.jump = false; else if (k === 'shift') input.down = false;
      else if (k === 'f') input.mine = false; else if (TURN[k] !== undefined) keys[k] = false;
    });
    // losing focus (alt-tab, a dialog, the Menu sheet) must not leave a key "held": the player would walk or mine on alone
    const releaseAll = () => { Object.keys(keys).forEach((k) => { keys[k] = false; }); input.jump = false; input.down = false; input.mine = false; syncKeys(); };
    window.addEventListener('blur', releaseAll);
    document.addEventListener('visibilitychange', () => { if (document.hidden) releaseAll(); });
    turnKeys = () => (keys.j ? 1 : 0) + (keys.l ? -1 : 0);
    pitchKeys = () => (keys.i ? 1 : 0) + (keys.k ? -1 : 0);
    cv.addEventListener('contextmenu', (e) => e.preventDefault());
    cv.addEventListener('wheel', (e) => {
      const items = hotbarItems(); if (!items.length) return;
      const i = items.findIndex((x) => x.item === sel);
      sel = items[(i + (e.deltaY > 0 ? 1 : items.length - 1)) % items.length].item; renderHud(); e.preventDefault();
    }, { passive: false });
    const locked = () => document.pointerLockElement === cv;
    // R4 (b13 "4x tap scripts hung"): a finger / pen tap also fires a compatibility mousedown. That used to request pointer lock,
    // so a tap on a touch screen (touch laptop, emulated phone) captured and hid the mouse pointer and left the page in pointer-lock
    // mode (in the headless emulator: long tasks of 0.3-17 s after the tap). Only a real mouse press locks the pointer now.
    let lastTouchAt = -1e9;
    cv.addEventListener('pointerdown', (e) => { if (e.pointerType !== 'mouse') lastTouchAt = performance.now(); });
    const fromTouch = (e) => (e.sourceCapabilities && e.sourceCapabilities.firesTouchEvents === true) || performance.now() - lastTouchAt < 1000;
    cv.addEventListener('mousedown', (e) => {
      if (fromTouch(e)) return;
      if (!locked()) { try { const r = cv.requestPointerLock(); if (r && r.catch) r.catch(() => {}); } catch (err) { /* ignore */ } return; }
      aim();
      if (e.button === 0) input.mine = true;
      else if (e.button === 2) placeAtLook();
    });
    window.addEventListener('mouseup', (e) => { if (e.button === 0) input.mine = false; });
    document.addEventListener('mousemove', (e) => {
      if (e.movementX || e.movementY) aim();
      if (!locked()) return;
      player.yaw -= e.movementX * 0.0025; player.pitch = Math.max(-1.55, Math.min(1.55, player.pitch - e.movementY * 0.0025));
    });
    // touch: look by dragging the canvas, joystick, buttons
    if (coarse || 'ontouchstart' in window) $('touch').hidden = false;
    // touch players have no keys: the key letters in the tool labels would only confuse them
    if (!$('touch').hidden) { $('open-craft').textContent = 'Craft'; $('open-goals').textContent = 'Goals'; $('mode-btn').setAttribute('aria-label', CREATIVE ? 'Toggle flying' : 'Toggle creative mode'); }
    let lookId = null, lx = 0, ly = 0;
    cv.addEventListener('pointerdown', (e) => { if (e.pointerType === 'mouse') return; lookId = e.pointerId; lx = e.clientX; ly = e.clientY; try { cv.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ } });
    cv.addEventListener('pointermove', (e) => {
      if (e.pointerId !== lookId) return;
      aim();
      player.yaw -= (e.clientX - lx) * 0.006; player.pitch = Math.max(-1.55, Math.min(1.55, player.pitch - (e.clientY - ly) * 0.006)); lx = e.clientX; ly = e.clientY;
    });
    const endLook = (e) => { if (e.pointerId === lookId) lookId = null; };
    cv.addEventListener('pointerup', endLook); cv.addEventListener('pointercancel', endLook);
    const jz = $('joy'), knob = $('knob');
    let joyId = null;
    function joyMove(e) {
      const r = jz.getBoundingClientRect(), cx = r.left + r.width / 2, cy = r.top + r.height / 2;
      let dx = (e.clientX - cx) / (r.width / 2), dy = (e.clientY - cy) / (r.height / 2);
      const l = Math.hypot(dx, dy); if (l > 1) { dx /= l; dy /= l; }
      joy.x = Math.abs(dx) < 0.15 ? 0 : dx; joy.y = Math.abs(dy) < 0.15 ? 0 : -dy;
      knob.style.transform = 'translate(' + dx * 40 + 'px,' + dy * 40 + 'px)'; syncKeys();
    }
    jz.addEventListener('pointerdown', (e) => { joyId = e.pointerId; try { jz.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ } joyMove(e); });
    jz.addEventListener('pointermove', (e) => { if (e.pointerId === joyId) joyMove(e); });
    const joyEnd = (e) => { if (e.pointerId !== joyId) return; joyId = null; joy.x = 0; joy.y = 0; knob.style.transform = ''; syncKeys(); };
    jz.addEventListener('pointerup', joyEnd); jz.addEventListener('pointercancel', joyEnd);
    const hold = (id, on, off) => {
      const el = $(id);
      el.addEventListener('pointerdown', (e) => { e.preventDefault(); on(); });
      ['pointerup', 'pointercancel', 'pointerleave'].forEach((n) => el.addEventListener(n, off));
    };
    hold('t-jump', () => { input.jump = true; }, () => { input.jump = false; });
    hold('t-mine', () => { aim(); input.mine = true; }, () => { input.mine = false; });
    hold('t-place', () => { aim(); placeAtLook(); }, () => {});
    hold('t-down', () => { input.down = true; }, () => { input.down = false; });
    $('open-craft').addEventListener('click', () => togglePanel('craft'));
    $('open-goals').addEventListener('click', () => togglePanel('goals'));
    $('mode-btn').addEventListener('click', () => setMode(meta.mode === 'creative' ? 'survival' : 'creative'));
    $('world-btn').addEventListener('click', switchWorld);
    $('close-craft').addEventListener('click', () => togglePanel('craft', false));
    $('close-goals').addEventListener('click', () => togglePanel('goals', false));
    $('close-run').addEventListener('click', closeSummary);
    $('run-again').addEventListener('click', closeSummary);
    $('smelt-iron').addEventListener('click', () => smeltOre('iron_ore'));
    $('smelt-gold').addEventListener('click', () => smeltOre('gold_ore'));
    $('craft-btn').addEventListener('click', craftTorch);
    $('craft-filter').addEventListener('click', () => { $('craft-panel').classList.toggle('ready-only'); renderCraft(); });
  }
  function placeAtLook() {
    const hit = raycast(5);
    if (!hit) return false;
    if (hit.id === B.LAVA && sel !== 'torch') return placeBlock(hit.cell[0], hit.cell[1], hit.cell[2], sel);
    if (!hit.prev) return false;
    return placeBlock(hit.prev[0], hit.prev[1], hit.prev[2], sel);
  }


  // ---------- goals + medals ----------
  const MEDALS = [
    { id: 'bronze', name: 'Bronze: Depth -8', desc: 'Dig down to depth 8.' },
    { id: 'silver', name: 'Silver: Iron Age', desc: 'Craft an iron pick.' },
    { id: 'secret', name: 'Secret: Lava Lake', desc: 'Cross the lava lake on a bridge of stone only, without ever dying.' },
  ];
  // Extra goals, listed under the medals in their own list (#goal-more).
  const EXTRA = [
    { id: 'depth20', name: 'Depth -20', desc: 'Dig down to depth 20.' },
    { id: 'depth40', name: 'Depth -40', desc: 'Dig down to depth 40.' },
    { id: 'crawler', name: 'Crawler Slayer', desc: 'Defeat a cave crawler.' },
    { id: 'wyrm', name: 'Wyrm Slayer', desc: 'Defeat the Rock Wyrm.' },
    { id: 'torches10', name: 'Lamplighter', desc: 'Place 10 torches.' },
  ];
  function award(id) {
    if (CREATIVE || meta.goals[id]) return;
    meta.goals[id] = true;
    const m = MEDALS.concat(EXTRA).filter((x) => x.id === id)[0];
    toast('Medal earned: ' + m.name);
    saveMeta(); renderHud();
  }
  const depthNow = () => Math.max(0, Math.floor(-player.y));
  function checkGoals() {
    if (CREATIVE) return;
    const d = depthNow();
    if (d > meta.goals.maxDepth) { meta.goals.maxDepth = Math.min(99, d); saveMeta(); }
    tickRun(d);
    if (d >= 8) award('bronze');
    if (d >= 20) award('depth20');
    if (d >= 40) award('depth40');
  }
  // Stone-only bridge: a full west-to-east row of placed stone at lava level or the layer above it.
  function lakeCheck(wx, wy, wz, id) {
    if (CREATIVE) return;
    const L = MMChunks.LAKE;
    if (wx < L.x0 || wx > L.x1 || wz < L.z0 || wz > L.z1 || wy < L.airY0 || wy > L.lavaY) return;
    if (id !== B.STONE && id !== B.TORCH) { meta.goals.secretVoid = true; saveMeta(); return; }
    if (meta.goals.secret || meta.goals.secretVoid || meta.goals.deaths > 0) return;
    for (let z = L.z0; z <= L.z1; z++) {
      let ok = true;
      for (let x = L.x0; x <= L.x1 && ok; x++) ok = world.getBlock(x, L.lavaY, z) === B.STONE || world.getBlock(x, L.lavaY - 1, z) === B.STONE;
      if (ok) { award('secret'); return; }
    }
  }
  function renderGoals() {
    const ul = $('goal-list');
    while (ul.firstChild) ul.removeChild(ul.firstChild);
    if (CREATIVE) { // b11-12: the creative world never earns these, so it says so instead of listing them as if they were live goals here
      const li = document.createElement('li'); li.id = 'goal-creative-note'; li.className = 'note';
      const t = document.createElement('strong'); t.textContent = 'Creative world: medals are off here.';
      const d = document.createElement('span'); d.textContent = 'The goals below are earned in the survival world. Build freely here: nothing is lost.';
      li.appendChild(t); li.appendChild(d); ul.appendChild(li);
    }
    MEDALS.forEach((m) => {
      const li = document.createElement('li');
      const done = !!meta.goals[m.id];
      li.className = done ? 'done' : '';
      const secretHidden = m.id === 'secret' && !done;
      const t = document.createElement('strong'); t.textContent = (done ? '[x] ' : '[ ] ') + (secretHidden ? 'Secret: ???' : m.name);
      const d = document.createElement('span'); d.textContent = secretHidden ? (meta.goals.secretVoid ? 'Voided: the attempt ended (a death or a non-stone block).' : 'Something glows far below...') : m.desc;
      li.appendChild(t); li.appendChild(d); ul.appendChild(li);
    });
    const more = $('goal-more');
    while (more.firstChild) more.removeChild(more.firstChild);
    EXTRA.forEach((m) => {
      const li = document.createElement('li'), done = !!meta.goals[m.id];
      li.className = done ? 'done' : '';
      const t = document.createElement('strong'); t.textContent = (done ? '[x] ' : '[ ] ') + m.name;
      const d = document.createElement('span');
      d.textContent = m.id === 'torches10' && !done ? m.desc + ' (' + meta.goals.torches + '/10)' : m.id.indexOf('depth') === 0 && !done ? m.desc + ' (deepest ' + meta.goals.maxDepth + ')' : m.desc;
      li.appendChild(t); li.appendChild(d); more.appendChild(li);
    });
    renderBuilds();
    const nDone = MEDALS.concat(EXTRA).filter((m) => meta.goals[m.id]).length;
    $('goal-stats').textContent = 'Goals: ' + nDone + '/' + (MEDALS.length + EXTRA.length) + ' | Torches: ' + meta.goals.torches + '/10 | Deepest: ' + meta.goals.maxDepth + ' | Deaths: ' + meta.goals.deaths + (meta.cave && meta.cave.seed !== null ? ' | Old cave seed: ' + meta.cave.seed : '') + (runRec ? ' | Dives: ' + runRec.runs + ' (' + runRec.safe + ' climbed out) | Best dive: score ' + runRec.best.score + ', ' + runRec.best.depth + ' deep, combo x' + runRec.best.combo : '');
  }

  // ---------- crafting + smelting ----------
  function furnaceNear() {
    const cx = Math.floor(player.x), cz = Math.floor(player.z), cy = Math.floor(-(player.y + 0.9));
    for (let dy = -3; dy <= 3; dy++) for (let dz = -4; dz <= 4; dz++) for (let dx = -4; dx <= 4; dx++) {
      const y = cy + dy; if (y < 0) continue;
      if (world.getBlock(cx + dx, y, cz + dz) === B.FURNACE) return true;
    }
    return false;
  }
  const costText = (c) => Object.keys(c).map((k) => k.replace(/_/g, ' ') + ' ' + c[k]).join(', ');
  function craftRecipe(id) {
    const x = MMDDCraft.extra ? MMDDCraft.extra(id) : null;
    const r = x || MMRecipes.get(id);
    if (!r) return false;
    if (x) {
      if (x.blueprint && (inv[x.blueprint] | 0) <= 0) { toast('Find the ' + x.blueprint.replace(/^bp_/, '') + ' blueprint first.'); return false; }
      if (!MMDDCraft.craftExtra(inv, id)) { toast('Missing ingredients.'); return false; }
    } else {
      if (r.station === 'furnace' && !furnaceNear()) { toast('Stand near a furnace for that.'); return false; }
      if (MMDDCraft.needsBench(id) && !benchNear()) { toast('Stand near a workbench for that.'); return false; }
      if (!MMRecipes.craft(inv, id)) { toast('Missing ingredients.'); return false; }
    }
    for (let t = 1; t <= 3; t++) {
      const n = inv['pick' + t] | 0;
      if (!n) continue;
      inv['pick' + t] = 0;
      if (t >= pick.tier) { pick.tier = t; pick.dur = PICK_DUR[t]; }
    }
    if (id === 'iron_pick') award('silver');
    toast('Crafted ' + id.replace(/_/g, ' '));
    queueSave(); renderHud();
    return true;
  }
  function benchNear() { return MMDDCraft.benchNear(benches, Math.floor(player.x), Math.floor(-(player.y + 0.9)), Math.floor(player.z), 4); }
  let benchGroup = null, benchGeo = null, benchMat = null, benchRev = '';
  function placeBench(wx, wy, wz) {
    if ((inv[BENCH_ITEM] | 0) <= 0 || wy < 0 || world.getBlock(wx, wy, wz) !== B.AIR) return false;
    if (benches.length >= 32 || benches.some((b) => b[0] === wx && b[1] === wy && b[2] === wz)) return false;
    benches.push([wx, wy, wz]); inv[BENCH_ITEM] -= 1;
    toast('Workbench placed'); queueSave(); renderHud();
    return true;
  }
  // Picks a bench up again when it is the first thing along the view ray (before any solid block).
  function benchAtLook() {
    if (!benches.length) return -1;
    const e = eyePos(), d = lookDir();
    for (let t = 0; t <= 5; t += 0.1) {
      const c = cellOf(e[0] + d[0] * t, e[1] + d[1] * t, e[2] + d[2] * t);
      if (c[1] >= 0) {
        const i = benches.findIndex((b) => b[0] === c[0] && b[1] === c[1] && b[2] === c[2]);
        if (i >= 0) return i;
        if (solidId(world.getBlock(c[0], c[1], c[2]))) return -1;
      }
    }
    return -1;
  }
  function pickUpBench(i) {
    if (i < 0 || i >= benches.length) return false;
    benches.splice(i, 1); inv[BENCH_ITEM] = (inv[BENCH_ITEM] | 0) + 1; queueSave(); renderHud();
    return true;
  }
  function syncBenches() {
    if (!scene) return;
    if (!benchGroup) {
      benchGroup = new THREE.Group(); scene.add(benchGroup);
      benchGeo = new THREE.BoxGeometry(0.9, 0.8, 0.9); benchMat = new THREE.MeshBasicMaterial({ color: 0xa8743a });
    }
    const sig = benches.map((b) => b.join(',')).join(';');
    if (sig === benchRev) return;
    benchRev = sig;
    while (benchGroup.children.length) benchGroup.remove(benchGroup.children[0]);
    benches.forEach((b) => { const m = new THREE.Mesh(benchGeo, benchMat); m.position.set(b[0] + 0.5, -(b[1] + 1) + 0.4, b[2] + 0.5); benchGroup.add(m); });
  }
  function smeltOre(ore) {
    if (!furnaceNear()) { toast('Stand near a placed furnace to smelt.'); return false; }
    if (!MMRecipes.smelt(inv, ore)) { toast('Need 1 ' + ore.replace(/_/g, ' ') + ' + 1 coal.'); return false; }
    toast('Smelted ' + ore.replace(/_ore/, '') + ' ingot');
    queueSave(); renderHud();
    return true;
  }
  // G-18 (b11-07, b15-12): a craft row reads 'Plank' / 'Torch x4', not 'plank > plank' (the recipe name only when it differs from the item)
  function craftLabel(r) {
    const out = String(MMDDCraft.outText(r) || '').replace(/_/g, ' '), base = String(r.id || '').replace(/_/g, ' ');
    const t = out.indexOf(base) === 0 ? out : base + ': ' + out;
    return t.charAt(0).toUpperCase() + t.slice(1);
  }
  function renderCraft() {
    const ul = $('recipes');
    while (ul.firstChild) ul.removeChild(ul.firstChild);
    const near = furnaceNear(), bn = benchNear();
    const only = $('craft-panel').classList.contains('ready-only');
    $('craft-filter').textContent = only ? 'Showing: ready' : 'Showing: all';
    $('craft-filter').setAttribute('aria-pressed', only ? 'true' : 'false');
    MMDDCraft.annotate(inv, { furnace: near, bench: bn }).forEach((r) => {
      if (only && !r.ready) return;
      const li = document.createElement('li');
      const info = document.createElement('span'); info.className = 'ri';
      const nm = document.createElement('strong'); nm.textContent = craftLabel(r);
      const ct = document.createElement('small'); ct.textContent = costText(r.cost) + ' (' + r.station + ')' + (r.reason ? ' - ' + r.reason : '');
      info.appendChild(nm); info.appendChild(ct);
      const b = document.createElement('button'); b.type = 'button'; b.className = 'btn mini'; b.dataset.recipe = r.id; b.textContent = 'Craft';
      b.disabled = !r.ready;
      b.addEventListener('click', () => craftRecipe(r.id));
      li.appendChild(info); li.appendChild(b); ul.appendChild(li);
    });
    const ux = $('recipes-x');
    while (ux.firstChild) ux.removeChild(ux.firstChild);
    MMDDCraft.annotateExtra(inv, {}).forEach((r) => {
      if (only && !r.ready) return;
      const li = document.createElement('li');
      const info = document.createElement('span'); info.className = 'ri';
      const nm = document.createElement('strong'); nm.textContent = (r.locked ? '[locked] ' : '') + craftLabel(r);
      const ct = document.createElement('small'); ct.textContent = costText(r.cost) + ' (' + (r.kind === 'grotto' ? 'grotto' : 'blueprint') + ')' + (r.reason ? ' - ' + r.reason : '');
      info.appendChild(nm); info.appendChild(ct);
      const b = document.createElement('button'); b.type = 'button'; b.className = 'btn mini'; b.dataset.recipe = r.id; b.textContent = 'Craft';
      b.disabled = !r.ready;
      b.addEventListener('click', () => craftRecipe(r.id));
      li.appendChild(info); li.appendChild(b); ux.appendChild(li);
    });
    $('furnace-note').textContent = near ? 'Furnace nearby: smelting ready.' : 'Place a furnace (8 stone) next to you to smelt.';
    $('bench-note').textContent = bn ? 'Workbench nearby.' : 'Craft a table (4 wood), then place it for ladders, doors, chests, beds and rails.';
    $('smelt-iron').disabled = !near || !MMRecipes.canSmelt(inv, 'iron_ore');
    $('smelt-gold').disabled = !near || !MMRecipes.canSmelt(inv, 'gold_ore');
    $('ingots').textContent = 'Iron ore ' + (inv.iron_ore | 0) + ', gold ore ' + (inv.gold_ore | 0) + ', coal ' + (inv.coal | 0) + ' | iron ' + (inv.iron | 0) + ', gold ' + (inv.gold | 0);
  }
  // Closes whatever panel is open (crafting, goals, dive summary). Returns true when something was open.
  function closeAll() {
    const was = ['craft-panel', 'goals-panel', 'run-panel'].some((id) => !$(id).hidden);
    togglePanel('craft', false); togglePanel('goals', false); closeSummary();
    return was;
  }
  function togglePanel(name, on) {
    const el = $(name + '-panel'), want = on === undefined ? el.hidden : on;
    ['craft', 'goals'].forEach((n) => { $(n + '-panel').hidden = true; });
    if (want) $('run-panel').hidden = true;
    el.hidden = !want;
    if (want) { try { document.exitPointerLock(); } catch (e) { /* ignore */ } if (name === 'craft') renderCraft(); else renderGoals(); }
  }
  function setMode(name) {
    meta.mode = name === 'creative' ? 'creative' : 'survival';
    if (meta.mode === 'survival') { player.vy = 0; player.peak = player.y; }
    saveMeta(); renderHud();
    toast(CREATIVE ? (meta.mode === 'creative' ? (touchUI() ? 'Flying: Jump up, Down down.' : 'Flying: Space up, Shift down.') : 'Walking. Nothing can hurt you here.') : meta.mode === 'creative' ? (touchUI() ? 'Creative: Jump up, Down down, no fall damage.' : 'Creative: Space up, Shift down, no fall damage.') : 'Survival: fall damage on.');
  }
  // The "Creative world" / "Survival world" toggle: saves, then reloads the page on the other world (seed and flags kept).
  function worldUrl() {
    const q = new URLSearchParams(location.search);
    if (CREATIVE) q.delete('mode'); else q.set('mode', 'creative');
    const s = q.toString();
    return location.pathname + (s ? '?' + s : '');
  }
  function switchWorld() { return flush().then(() => { location.href = worldUrl(); }); }

  // ---------- MG2 blueprints ----------
  function findBlueprint(id, wy) {
    if (!BUILD) return null;
    const bp = BUILD.findOnMine(id, wy, (k) => (inv[k] | 0) > 0);
    if (!bp) return null;
    inv[bp.item] = 1;
    toast('You found a blueprint: ' + bp.name + '! New crafts unlocked.');
    return bp;
  }
  function buildCheck(wx, wy, wz) {
    if (!BUILD || !world) return [];
    const has = CREATIVE ? () => true : (k) => (inv[k] | 0) > 0;
    const done = BUILD.check((x, y, z) => (y < 0 ? B.AIR : world.getBlock(x, y, z)), wx, wy, wz, has);
    done.forEach((id) => {
      const bp = BUILD.byId[id];
      if (CREATIVE) { if (!creativeBuilt[id]) { creativeBuilt[id] = 1; toast(bp.name + ' built! (Creative world: no medals)'); } return; }
      if (meta.goals[bp.goal]) return;
      meta.goals[bp.goal] = true;
      const md = BUILD.medals(meta.goals);
      meta.goals.build1 = md.build1; meta.goals.build3 = md.build3;
      toast('Blueprint built: ' + bp.name + '!' + (md.build3 ? ' All three: Master Builder medal.' : md.n === 1 ? ' Builder medal earned.' : ''));
      saveMeta(); renderHud();
    });
    return done;
  }
  function renderBuilds() {
    const ul = $('goal-build');
    if (!ul || !BUILD) return;
    while (ul.firstChild) ul.removeChild(ul.firstChild);
    BUILD.BLUEPRINTS.forEach((bp) => {
      const li = document.createElement('li'), done = CREATIVE ? !!creativeBuilt[bp.id] : !!meta.goals[bp.goal], have = CREATIVE || (inv[bp.item] | 0) > 0;
      li.className = done ? 'done' : '';
      const t = document.createElement('strong'); t.textContent = (done ? '[x] ' : '[ ] ') + 'Blueprint: ' + bp.name + (have ? '' : ' (not found yet)');
      const d = document.createElement('span'); d.textContent = have ? bp.desc : 'Where to find it: ' + bp.find;
      li.appendChild(t); li.appendChild(d); ul.appendChild(li);
    });
    const md = BUILD.medals(meta.goals);
    $('build-stats').textContent = CREATIVE ? 'Creative world: builds are just for fun here, no medals.' : 'Builds: ' + md.n + '/3 | Builder medal (1 build): ' + (md.build1 ? 'yes' : 'no') + ' | Master Builder (all 3): ' + (md.build3 ? 'yes' : 'no');
  }

  // ---------- Glow Slime ----------
  const SLIME_H = 0.6, SLIME_HALF = 0.3;
  let slimeTex = null, slimeGeo = null;
  const cellLight = (x, y, z) => {
    if (!win || !win.light || lightDirty) { if (!win) fillWindow(Math.floor(x / SIZE), Math.floor(z / SIZE)); relight(); }
    const wx = Math.floor(x), wz = Math.floor(z);
    if (wx < win.ox * SIZE || wz < win.oz * SIZE || wx >= (win.ox + WIN) * SIZE || wz >= (win.oz + WIN) * SIZE) return 15; // unknown light: treat as lit
    return lightAt(wx, Math.floor(-(y + 0.3)), wz);
  };
  // Never spawns where the light level is 8 or more (torchlight or sky).
  function spawnSlime(x, y, z) {
    if (CREATIVE || slimes.length >= 3) return null;
    if (x < 1 || z < 1 || x >= SIZE * MMChunks.WORLD.cx - 1 || z >= SIZE * MMChunks.WORLD.cz - 1) return null;
    if (collides(x, y, z, SLIME_HALF, SLIME_H)) return null;
    if (cellLight(x, y, z) >= 8) return null;
    const m = { x, y, z, vx: 0, vz: 0, vy: 0, hp: 2, hopT: 0.4 + Math.random() * 0.5, ground: false, mesh: null, dead: false, squash: 0 };
    slimes.push(m);
    return m;
  }
  function autoSpawn() {
    if (slimes.length >= 3 || player.y > -MMChunks.surfaceY(Math.floor(player.x), Math.floor(player.z), SEED) - 2) return null;
    for (let tries = 0; tries < 12; tries++) {
      const a = Math.random() * Math.PI * 2, r = 5 + Math.random() * 6;
      const x = Math.floor(player.x + Math.cos(a) * r) + 0.5, z = Math.floor(player.z + Math.sin(a) * r) + 0.5;
      const base = Math.floor(-(player.y + 0.5));
      for (let dy = -4; dy <= 4; dy++) {
        const wy = base + dy;
        if (wy < 1 || wy >= 62) continue;
        if (!solidAt(Math.floor(x), wy + 1, Math.floor(z)) || solidAt(Math.floor(x), wy, Math.floor(z)) || solidAt(Math.floor(x), wy - 1, Math.floor(z))) continue;
        const m = spawnSlime(x, -(wy + 1) + 0.01, z);
        if (m) return m;
      }
    }
    return null;
  }
  function tickMobs(dt) {
    for (let i = slimes.length - 1; i >= 0; i--) {
      const m = slimes[i];
      if (m.dead) { removeMesh(m); slimes.splice(i, 1); continue; }
      const dx = player.x - m.x, dz = player.z - m.z, dy = (player.y + 0.9) - (m.y + 0.3), d = Math.hypot(dx, dz, dy);
      if (d > 40) { m.dead = true; removeMesh(m); slimes.splice(i, 1); continue; }
      m.squash = Math.max(0, m.squash - dt * 3);
      if (m.ground) {
        m.vx *= 0.7; m.vz *= 0.7; m.hopT -= dt;
        if (m.hopT <= 0 && d <= 8) {
          const h = Math.hypot(dx, dz) || 1;
          m.vx = dx / h * 2.6; m.vz = dz / h * 2.6; m.vy = 6.2; m.ground = false; m.hopT = 0.9; m.squash = 1;
        }
      }
      const nx = m.x + m.vx * dt; if (!collides(nx, m.y, m.z, SLIME_HALF, SLIME_H)) m.x = nx; else m.vx = 0;
      const nz = m.z + m.vz * dt; if (!collides(m.x, m.y, nz, SLIME_HALF, SLIME_H)) m.z = nz; else m.vz = 0;
      m.vy = Math.max(-30, m.vy - GRAV * dt);
      const ny = m.y + m.vy * dt;
      if (!collides(m.x, ny, m.z, SLIME_HALF, SLIME_H)) { m.y = ny; m.ground = false; }
      else {
        let lo = m.y, hi = ny;
        for (let k = 0; k < 10; k++) { const mid = (lo + hi) / 2; if (collides(m.x, mid, m.z, SLIME_HALF, SLIME_H)) hi = mid; else lo = mid; }
        m.y = lo;
        if (m.vy < 0) { m.ground = true; m.vx = 0; m.vz = 0; }
        m.vy = 0;
      }
      if (Math.abs(dx) < 0.75 && Math.abs(dz) < 0.75 && player.y < m.y + SLIME_H && player.y + HEIGHT > m.y) hurt(1, 'The Glow Slime bonked you!', 'The Glow Slimes wore you down. Back to the surface.');
    }
  }
  // Hit the slime in front of you (cone check) or, with `any`, the nearest within reach.
  function attackSlime(needCone) {
    if (atkCd > 0 && needCone) return false;
    const e = eyePos(), ld = lookDir();
    let best = null, bd = 99;
    for (const m of slimes) {
      const vx = m.x - e[0], vy = (m.y + 0.3) - e[1], vz = m.z - e[2], d = Math.hypot(vx, vy, vz);
      if (d > 3.5 || d >= bd) continue;
      if (needCone && (vx * ld[0] + vy * ld[1] + vz * ld[2]) / (d || 1) < 0.75) continue;
      best = m; bd = d;
    }
    if (!best) return false;
    atkCd = 0.4;
    best.hp -= 1; best.squash = 1;
    const h = Math.hypot(best.x - player.x, best.z - player.z) || 1;
    best.vx = (best.x - player.x) / h * 3; best.vz = (best.z - player.z) / h * 3; best.vy = 4; best.ground = false;
    if (best.hp <= 0) {
      best.dead = true;
      inv.slime = (inv.slime | 0) + 1; found.slime = 1;
      toast('The Glow Slime dropped a slime!');
      queueSave(); renderHud();
    }
    return true;
  }
  function makeSlimeTex() {
    const c = document.createElement('canvas'); c.width = 32; c.height = 32;
    const g = c.getContext('2d');
    g.fillStyle = '#58e07a'; g.fillRect(0, 0, 32, 32);
    g.fillStyle = '#8bffa6'; g.fillRect(3, 3, 26, 8);
    g.fillStyle = '#2fa84f'; g.fillRect(0, 24, 32, 8);
    g.fillStyle = '#0b2a14'; g.fillRect(8, 12, 5, 7); g.fillRect(19, 12, 5, 7);
    g.fillStyle = '#e9fff0'; g.fillRect(9, 13, 2, 3); g.fillRect(20, 13, 2, 3);
    g.fillStyle = '#0b2a14'; g.fillRect(12, 22, 8, 2);
    const t = new THREE.CanvasTexture(c);
    t.magFilter = THREE.NearestFilter; t.minFilter = THREE.NearestFilter; t.generateMipmaps = false;
    return t;
  }
  function syncSlimeMeshes() {
    if (!scene) return;
    if (!slimeTex) { slimeTex = makeSlimeTex(); slimeGeo = new THREE.BoxGeometry(0.7, SLIME_H, 0.7); }
    for (const m of slimes) {
      if (!m.mesh) { m.mesh = new THREE.Mesh(slimeGeo, new THREE.MeshBasicMaterial({ map: slimeTex, transparent: true, opacity: 0.92 })); if (ACCESS.palette !== 'normal') m.mesh.material.color.set(ACCESS.enemy); scene.add(m.mesh); }
      const sq = reduced ? 0 : m.squash * 0.25 + (m.ground ? 0 : 0.1);
      m.mesh.scale.set(1 + sq, 1 - sq, 1 + sq);
      m.mesh.position.set(m.x, m.y + SLIME_H / 2 * (1 - sq), m.z);
      m.mesh.rotation.y = Math.atan2(player.x - m.x, player.z - m.z);
    }
  }
  function removeMesh(m) {
    if (m.mesh && scene) { scene.remove(m.mesh); m.mesh.material.dispose(); }
    m.mesh = null;
  }

  // ---------- Cave creatures (seeded) ----------
  // A crawler (slow ground walker) and a bat (flier) live in dark cave air. Which cells hold one is a pure function of
  // (seed, chunk); no ambient randomness is used here. At most MAX_ACTIVE are alive; they are culled by distance.
  let creatureT = 1, creatureMeshes = 0, creatureTex = null;
  const candCache = new Map();
  function chunkCands(cx, cy, cz) {
    const k = cx + ',' + cy + ',' + cz;
    let c = candCache.get(k);
    if (!c) { c = MMDDMobs.chunkSpawns(SEED, cx, cy, cz); candCache.set(k, c); }
    return c;
  }
  // Dark = neither sky nor torch light reaches the cell at full strength (clock-independent, so night does not matter underground).
  function caveDark(wx, wy, wz) {
    if (!win) fillWindow(Math.floor(wx / SIZE), Math.floor(wz / SIZE));
    if (!win.light || lightDirty) relight();
    const x = wx - win.ox * SIZE, z = wz - win.oz * SIZE, w = win.w;
    if (x < 0 || z < 0 || x >= w || z >= w || wy < 0 || wy >= win.h) return false;
    const i = x + z * w + wy * w * w;
    return Math.max(win.sky[i], win.block[i]) < 8;
  }
  function spawnCreature(kind, x, y, z, id, phase) {
    const K = MMDDMobs.KINDS[kind];
    if (CREATIVE || !K || creatures.length >= MMDDMobs.MAX_ACTIVE) return null;
    const m = { id: id || ('t' + creatures.length + ':' + kind), kind, x, y, z, vx: 0, vy: 0, vz: 0, hp: K.hp, ground: false, mesh: null, dead: false, phase: phase || 0, age: 0, hitT: 0, hurtCd: 0 };
    creatures.push(m);
    return m;
  }
  // Brings candidates near the player to life: only in dark air, underground, never inside blocks.
  function scanSpawns() {
    if (!world || CREATIVE) return 0;
    const pc = playerChunk();
    const px = Math.floor(player.x), py = Math.floor(-(player.y + 0.9)), pz = Math.floor(player.z);
    if (player.y > -MMChunks.surfaceY(px, pz, SEED) - 2) return 0; // only below the surface
    const cands = [];
    for (let cy = 0; cy < MMChunks.WORLD.cy; cy++) for (let dz = -2; dz <= 2; dz++) for (let dx = -2; dx <= 2; dx++) {
      const cx = pc.cx + dx, cz = pc.cz + dz;
      if (cx < 0 || cz < 0 || cx >= MMChunks.WORLD.cx || cz >= MMChunks.WORLD.cz) continue;
      chunkCands(cx, cy, cz).forEach((c) => cands.push(c));
    }
    const pick = MMDDMobs.select(cands, { px, py, pz, active: creatures.length, activeIds: creatures.map((m) => m.id), slain, cap: MMDDMobs.MAX_ACTIVE });
    let n = 0;
    for (const c of pick) {
      const K = MMDDMobs.KINDS[c.kind];
      if (world.getBlock(c.wx, c.wy, c.wz) !== B.AIR) continue;
      if (c.wy < MMChunks.surfaceY(c.wx, c.wz, SEED) + 2) continue; // deep enough to count as a cave
      if (!K.flies && !solidAt(c.wx, c.wy + 1, c.wz)) continue; // crawlers need a floor
      if (world.getBlock(c.wx, c.wy - 1, c.wz) !== B.AIR && K.flies) continue; // bats need a little headroom
      if (!caveDark(c.wx, c.wy, c.wz)) continue;
      const m = spawnCreature(c.kind, c.wx + 0.5, K.flies ? -(c.wy + 0.5) - K.h / 2 : -(c.wy + 1) + 0.01, c.wz + 0.5, c.id, c.phase);
      if (m) n++;
    }
    return n;
  }
  function clearCreatures() { creatures.forEach((m) => removeCreatureMesh(m)); creatures.length = 0; }
  function creatureHit(m) {
    const K = MMDDMobs.KINDS[m.kind];
    return Math.abs(player.x - m.x) < K.half + HALF && Math.abs(player.z - m.z) < K.half + HALF && player.y < m.y + K.h && player.y + HEIGHT > m.y;
  }
  function tickCreatures(dt) {
    for (let i = creatures.length - 1; i >= 0; i--) {
      const m = creatures[i], K = MMDDMobs.KINDS[m.kind];
      const dx = player.x - m.x, dz = player.z - m.z, dy = (player.y + 0.9) - (m.y + K.h / 2), d = Math.hypot(dx, dy, dz);
      if (m.dead || MMDDMobs.shouldCull(d)) { removeCreatureMesh(m); creatures.splice(i, 1); continue; }
      m.age += dt; m.hitT = Math.max(0, m.hitT - dt); m.hurtCd = Math.max(0, m.hurtCd - dt);
      if (m.hitT > 0) { /* knocked back: keep the push velocity */ }
      else if (K.flies) {
        const v = d < K.aggro ? MMDDMobs.batMove(m.phase, m.age, dx, dy, dz, K.speed) : { vx: 0, vy: Math.sin(m.age * 2 + m.phase) * 0.4, vz: 0 };
        m.vx = v.vx; m.vy = v.vy; m.vz = v.vz;
      } else if (m.ground) {
        const h = Math.hypot(dx, dz) || 1;
        m.vx = d < K.aggro ? dx / h * K.speed : 0; m.vz = d < K.aggro ? dz / h * K.speed : 0;
      }
      const nx = m.x + m.vx * dt; if (!collides(nx, m.y, m.z, K.half, K.h)) m.x = nx; else m.vx = 0;
      const nz = m.z + m.vz * dt; if (!collides(m.x, m.y, nz, K.half, K.h)) m.z = nz; else m.vz = 0;
      if (K.flies) {
        const ny = m.y + m.vy * dt; if (!collides(m.x, ny, m.z, K.half, K.h)) m.y = ny; else m.vy = 0;
        if (m.hitT > 0) { m.vx *= 0.9; m.vz *= 0.9; m.vy *= 0.9; }
      } else {
        m.vy = Math.max(-30, m.vy - GRAV * dt);
        const ny = m.y + m.vy * dt;
        if (!collides(m.x, ny, m.z, K.half, K.h)) { m.y = ny; m.ground = false; }
        else {
          let lo = m.y, hi = ny;
          for (let k = 0; k < 10; k++) { const mid = (lo + hi) / 2; if (collides(m.x, mid, m.z, K.half, K.h)) hi = mid; else lo = mid; }
          m.y = lo; if (m.vy < 0) { m.ground = true; if (m.hitT <= 0) { m.vx = 0; m.vz = 0; } else { m.vx *= 0.6; m.vz *= 0.6; } }
          m.vy = 0;
        }
      }
      if (m.hurtCd <= 0 && creatureHit(m)) {
        m.hurtCd = 0.8;
        deathCause = 'creature';
        hurt(K.dmg, 'A cave ' + m.kind + ' bit you!', 'A cave ' + m.kind + ' got you. Back to the surface.');
        deathCause = '';
      }
    }
  }
  // Melee: hit the creature in front of you (cone check) or, without needCone, the nearest within reach.
  function attackCreature(needCone) {
    if (atkCd > 0 && needCone) return false;
    const e = eyePos(), ld = lookDir();
    let best = null, bd = 99;
    for (const m of creatures) {
      const K = MMDDMobs.KINDS[m.kind];
      const vx = m.x - e[0], vy = (m.y + K.h / 2) - e[1], vz = m.z - e[2], d = Math.hypot(vx, vy, vz);
      if (d > 3.5 || d >= bd) continue;
      if (needCone && (vx * ld[0] + vy * ld[1] + vz * ld[2]) / (d || 1) < 0.7) continue;
      best = m; bd = d;
    }
    if (!best) return false;
    atkCd = 0.4;
    best.hp -= MMDDMobs.meleeDamage(pick.tier); best.hitT = 0.35;
    const k = MMDDMobs.knockback(best.x - player.x, best.z - player.z, 5);
    best.vx = k.vx; best.vz = k.vz; best.vy = best.kind === 'bat' ? 1.5 : k.vy; best.ground = false;
    if (best.hp <= 0) {
      best.dead = true; slain.add(best.id);
      if (best.kind === 'crawler') award('crawler');
      if (best.kind === 'crawler') { inv.coal = (inv.coal | 0) + 1; found.coal = 1; toast('The crawler dropped coal.'); } else toast('You swatted the bat.');
      queueSave(); renderHud();
    }
    return true;
  }
  function makeCreatureTex() {
    const c = document.createElement('canvas'); c.width = 32; c.height = 32;
    const g = c.getContext('2d');
    g.fillStyle = '#3a2a4a'; g.fillRect(0, 0, 32, 32);
    g.fillStyle = '#5a4470'; g.fillRect(2, 2, 28, 8);
    g.fillStyle = '#ff4a3a'; g.fillRect(7, 13, 5, 5); g.fillRect(20, 13, 5, 5);
    g.fillStyle = '#1a1020'; g.fillRect(10, 22, 12, 3);
    const t = new THREE.CanvasTexture(c);
    t.magFilter = THREE.NearestFilter; t.minFilter = THREE.NearestFilter; t.generateMipmaps = false;
    return t;
  }
  function syncCreatureMeshes() {
    if (!scene) return;
    if (!creatureTex) creatureTex = makeCreatureTex();
    creatureMeshes = 0;
    for (const m of creatures) {
      const K = MMDDMobs.KINDS[m.kind];
      if (!m.mesh) {
        const g = new THREE.Group(), mat = new THREE.MeshBasicMaterial({ map: creatureTex });
        if (ACCESS.palette !== 'normal') mat.color.set(ACCESS.enemy);
        if (m.kind === 'crawler') { const b = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.45, 0.9), mat); b.position.y = 0.23; g.add(b); }
        else {
          const b = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.25, 0.3), mat); g.add(b);
          const wing = new THREE.BoxGeometry(0.5, 0.04, 0.3), l = new THREE.Mesh(wing, mat), r = new THREE.Mesh(wing, mat);
          l.position.x = -0.4; r.position.x = 0.4; g.add(l); g.add(r); g.userData.wings = [l, r];
        }
        g.userData.mat = mat; scene.add(g); m.mesh = g;
      }
      const yoff = m.kind === 'bat' ? K.h / 2 : 0;
      m.mesh.position.set(m.x, m.y + yoff, m.z);
      m.mesh.rotation.y = Math.atan2(player.x - m.x, player.z - m.z);
      const w = m.mesh.userData.wings;
      if (w) { const fl = reduced ? 0.2 : Math.sin(m.age * 18 + m.phase) * 0.6; w[0].rotation.z = fl; w[1].rotation.z = -fl; }
      creatureMeshes++;
    }
  }
  function removeCreatureMesh(m) {
    if (m.mesh && scene) { scene.remove(m.mesh); if (m.mesh.userData.mat) m.mesh.userData.mat.dispose(); m.mesh.children.forEach((c) => { if (c.geometry) c.geometry.dispose(); }); }
    m.mesh = null;
  }

  // ---------- Rock Wyrm boss (seeded) ----------
  // One segmented boss per world, in a cavern that is a pure function of the world seed (MMDDWyrm.spawnSite), 40+ blocks
  // below the surface. It sleeps until the player is deep and near, is frozen/unmeshed when far, and once defeated the
  // `wyrm` flags in the player save keep it down (only a fresh world, i.e. cleared storage, brings it back). Off in ?test=1 unless ?wyrm=1.
  const WYRM_ON = !CREATIVE && (!TEST || params.get('wyrm') === '1');
  const wyrm = { site: null, awake: false, down: false, carved: false, hp: 0, max: 30, atk: null, ang: 0, segs: null, tgt: null, from: null, to: null, burrowed: false, hitT: 0, hurtCd: 0, group: null, ring: null, bar: null, fill: null, label: null };
  let wyrmTex = null, wyrmGeo = null, wyrmMat = null, wyrmRingGeo = null, wyrmRingMat = null;
  function loadWyrmScript() {
    return new Promise((resolve) => {
      if (window.MMDDWyrm) return resolve(true);
      const s = document.createElement('script');
      s.src = '../../shared/mm-dd-wyrm.js';
      s.onload = () => resolve(!!window.MMDDWyrm); s.onerror = () => resolve(false);
      document.head.appendChild(s);
    });
  }
  function wyrmInit() {
    if (!WYRM_ON || !window.MMDDWyrm || !world) return;
    wyrm.max = MMDDWyrm.MAX_HP;
    wyrm.site = MMDDWyrm.spawnSite(SEED, (x, z) => MMChunks.surfaceY(x, z, SEED));
    const bar = document.createElement('div');
    bar.id = 'wyrm-bar'; bar.hidden = true; bar.setAttribute('role', 'progressbar'); bar.setAttribute('aria-label', 'Rock Wyrm health');
    bar.setAttribute('aria-valuemin', '0'); bar.setAttribute('aria-valuemax', String(wyrm.max));
    bar.style.cssText = 'position:fixed;top:70px;left:50%;transform:translateX(-50%);width:min(420px,calc(100vw - 32px));z-index:30;pointer-events:none;text-align:center;font:600 13px system-ui,sans-serif;color:#f4e8d0;text-shadow:0 1px 2px #000';
    const label = document.createElement('div'); label.id = 'wyrm-label'; label.textContent = 'Rock Wyrm';
    const track = document.createElement('div'); track.style.cssText = 'height:12px;background:#2a1d14;border:2px solid #f4e8d0;border-radius:3px;overflow:hidden';
    const fill = document.createElement('div'); fill.id = 'wyrm-fill'; fill.style.cssText = 'height:100%;width:100%;background:#d96b2b';
    track.appendChild(fill); bar.appendChild(label); bar.appendChild(track); document.body.appendChild(bar);
    wyrm.bar = bar; wyrm.fill = fill; wyrm.label = label;
  }
  function wyrmClean(d) {
    if (!d || typeof d !== 'object' || Array.isArray(d)) return;
    wyrm.down = d.down === true; wyrm.carved = d.carved === true;
  }
  function renderWyrmBar() {
    if (!wyrm.bar) return;
    wyrm.bar.hidden = !wyrm.awake;
    const f = Math.max(0, Math.min(1, wyrm.hp / wyrm.max));
    wyrm.fill.style.width = Math.round(f * 100) + '%';
    wyrm.bar.setAttribute('aria-valuenow', String(Math.max(0, wyrm.hp)));
    wyrm.label.textContent = 'Rock Wyrm - phase ' + MMDDWyrm.phaseOf(wyrm.hp, wyrm.max);
  }
  // Hollows the cavern once (idempotent: only non-air cells change) and remembers that in the save.
  function carveWyrmArena() {
    if (!wyrm.site || wyrm.carved) return 0;
    let n = 0; const dirty = new Set();
    for (const c of MMDDWyrm.arenaCells(wyrm.site)) {
      if (c[1] < 0 || c[1] >= MMChunks.WORLD.cy * SIZE - 1) continue;
      const id = world.getBlock(c[0], c[1], c[2]);
      if (id === B.AIR || id === B.BEDROCK) continue;
      world.setBlock(c[0], c[1], c[2], B.AIR).forEach((k) => dirty.add(k)); n++;
    }
    wyrm.carved = true;
    afterEdit(dirty); return n;
  }
  function wyrmSleep(heal) {
    wyrm.awake = false; wyrm.burrowed = false;
    if (heal) wyrm.hp = 0;
    removeWyrmMesh(); renderWyrmBar();
  }
  function wakeWyrm() {
    const s = wyrm.site, p0 = MMDDWyrm.orbitPos(s, 0, 1);
    if (wyrm.hp <= 0) wyrm.hp = wyrm.max;
    wyrm.awake = true; wyrm.atk = MMDDWyrm.newAttack(); wyrm.ang = 0; wyrm.burrowed = false; wyrm.hitT = 0; wyrm.hurtCd = 1;
    wyrm.segs = Array.from({ length: MMDDWyrm.SEGMENTS }, (_, i) => ({ x: p0.x - i * MMDDWyrm.SPACING, y: p0.y, z: p0.z }));
    wyrm.tgt = null; toast('The ground shakes: the Rock Wyrm wakes!'); renderWyrmBar();
  }
  // Wake / freeze check (run about every 1.5 s, and by tests).
  function wyrmScan() {
    if (!wyrm.site || wyrm.down || !world) return false;
    const s = wyrm.site, dist = Math.hypot(player.x - s.c.x, (player.y + 0.9) - s.c.y, player.z - s.c.z);
    if (wyrm.awake) { if (MMDDWyrm.shouldFreeze(dist)) wyrmSleep(false); return wyrm.awake; }
    const depth = Math.floor(-(player.y + 0.9)) - MMChunks.surfaceY(Math.floor(player.x), Math.floor(player.z), SEED);
    if (!MMDDWyrm.shouldWake(dist, depth, wyrm.down)) return false;
    carveWyrmArena(); wakeWyrm(); return true;
  }
  function moveWyrmHead(tx, ty, tz, speed, dt) {
    const h = wyrm.segs[0], dx = tx - h.x, dy = ty - h.y, dz = tz - h.z, d = Math.hypot(dx, dy, dz) || 1, st = Math.min(d, speed * dt);
    h.x += dx / d * st; h.y += dy / d * st; h.z += dz / d * st;
  }
  const wyrmPlayerPoint = () => ({ x: player.x, y: player.y + 0.9, z: player.z });
  function wyrmEvent(prev, ev, phase) {
    const s = wyrm.site, h = wyrm.segs[0];
    if (prev === 'lunge' && wyrm.tgt) { // the lunge just landed: the dust ring slams the ground
      const pp = wyrmPlayerPoint();
      if (MMDDWyrm.inRing(wyrm.tgt.x, wyrm.tgt.y, wyrm.tgt.z, pp.x, pp.y, pp.z) && wyrm.hurtCd <= 0) wyrmHurtPlayer(2, 'The Rock Wyrm slammed you!');
    }
    if (ev === 'burrow') wyrm.burrowed = true;
    else if (ev === 'circle') wyrm.burrowed = false;
    else if (ev === 'telegraph') {
      const c = MMDDWyrm.clampToArena(s, player.x, player.y + 0.9, player.z, 1);
      wyrm.tgt = c;
      if (phase >= 2 && wyrm.burrowed) { const y = MMDDWyrm.floorY(s) - 1.6; wyrm.segs.forEach((g, i) => { g.x = c.x; g.z = c.z; g.y = y - i * 0.05; }); }
    } else if (ev === 'lunge') {
      wyrm.from = { x: h.x, y: h.y, z: h.z }; wyrm.to = { x: wyrm.tgt.x, y: wyrm.tgt.y + 0.3, z: wyrm.tgt.z };
      wyrm.burrowed = false;
    }
  }
  function wyrmHurtPlayer(n, msg) {
    wyrm.hurtCd = 0.9;
    const before = player.hp;
    deathCause = 'creature';
    hurt(n, msg, 'The Rock Wyrm crushed you. Back to the surface.');
    deathCause = '';
    if (player.hp < before && player.hp > 0) { // shove the player away from the head
      const h = wyrm.segs[0], k = MMDDWyrm.knockback(player.x - h.x, player.z - h.z, 1.6);
      const nx = player.x + k.vx, nz = player.z + k.vz;
      if (!collides(nx, player.y, player.z)) player.x = nx;
      if (!collides(player.x, player.y, nz)) player.z = nz;
    }
  }
  function tickWyrm(dt) {
    if (!wyrm.awake || !wyrm.segs) return;
    const s = wyrm.site, phase = MMDDWyrm.phaseOf(wyrm.hp, wyrm.max), p = phase - 1;
    wyrm.hitT = Math.max(0, wyrm.hitT - dt); wyrm.hurtCd = Math.max(0, wyrm.hurtCd - dt);
    const r = MMDDWyrm.attackStep(wyrm.atk, dt, phase);
    let before = wyrm.atk.s;
    wyrm.atk = r.st;
    for (const ev of r.events) { wyrmEvent(before, ev, phase); before = ev; }
    const state = wyrm.atk.s, h = wyrm.segs[0];
    if (state === 'circle' || state === 'recover') {
      wyrm.ang += MMDDWyrm.ORBIT_SPEED[p] * dt * (state === 'recover' ? 0.4 : 1);
      const o = MMDDWyrm.orbitPos(s, wyrm.ang, phase);
      moveWyrmHead(o.x, o.y, o.z, state === 'recover' ? 3 : 8, dt);
    } else if (state === 'burrow') {
      moveWyrmHead(player.x, MMDDWyrm.floorY(s) - 1.6, player.z, 5, dt);
    } else if (state === 'lunge' && wyrm.from && wyrm.to) {
      const k = Math.min(1, wyrm.atk.t / MMDDWyrm.T.lunge[p]), e = k * k * (3 - 2 * k);
      h.x = wyrm.from.x + (wyrm.to.x - wyrm.from.x) * e; h.y = wyrm.from.y + (wyrm.to.y - wyrm.from.y) * e; h.z = wyrm.from.z + (wyrm.to.z - wyrm.from.z) * e;
    }
    MMDDWyrm.followChain(wyrm.segs);
    if (!wyrm.burrowed && wyrm.hurtCd <= 0) {
      const pp = wyrmPlayerPoint();
      for (let i = 0; i < wyrm.segs.length; i++) {
        const g = wyrm.segs[i];
        if (Math.hypot(g.x - pp.x, g.y - pp.y, g.z - pp.z) < (i === 0 ? 1.1 : 0.9)) { wyrmHurtPlayer(MMDDWyrm.contactDamage(state), 'The Rock Wyrm crushed you!'); break; }
      }
    }
  }
  // Melee: nearest segment within reach (cone check when needCone). Underground wyrms cannot be hit.
  function attackWyrm(needCone) {
    if (!wyrm.awake || wyrm.burrowed || !wyrm.segs) return false;
    if (atkCd > 0 && needCone) return false;
    const e = eyePos(), ld = lookDir();
    let best = null, bd = 99;
    for (const g of wyrm.segs) {
      const vx = g.x - e[0], vy = g.y - e[1], vz = g.z - e[2], d = Math.hypot(vx, vy, vz);
      if (d > 3.6 || d >= bd) continue;
      if (needCone && (vx * ld[0] + vy * ld[1] + vz * ld[2]) / (d || 1) < 0.6) continue;
      best = g; bd = d;
    }
    if (!best) return false;
    atkCd = 0.4;
    wyrm.hp -= MMDDWyrm.meleeDamage(pick.tier); wyrm.hitT = 0.2;
    const h = wyrm.segs[0], k = MMDDWyrm.knockback(h.x - player.x, h.z - player.z, 3);
    const c = MMDDWyrm.clampToArena(wyrm.site, h.x + k.vx * 0.25, h.y, h.z + k.vz * 0.25, 1);
    h.x = c.x; h.z = c.z;
    if (wyrm.hp <= 0) defeatWyrm(); else renderWyrmBar();
    return true;
  }
  function defeatWyrm() {
    wyrm.hp = 0; wyrm.down = true; wyrmSleep(false);
    inv.wyrm_scale = (inv.wyrm_scale | 0) + 1;
    award('wyrm');
    toast('The Rock Wyrm is defeated! It dropped a wyrm scale.');
    queueSave(); renderHud();
  }
  function makeWyrmTex() {
    const c = document.createElement('canvas'); c.width = 32; c.height = 32;
    const g = c.getContext('2d');
    g.fillStyle = '#6b5a4a'; g.fillRect(0, 0, 32, 32);
    g.fillStyle = '#85715d'; g.fillRect(2, 2, 28, 7); g.fillRect(2, 14, 28, 5);
    g.fillStyle = '#4a3d31'; g.fillRect(0, 24, 32, 8);
    g.fillStyle = '#ffb02e'; g.fillRect(7, 22, 5, 3); g.fillRect(20, 22, 5, 3);
    const t = new THREE.CanvasTexture(c);
    t.magFilter = THREE.NearestFilter; t.minFilter = THREE.NearestFilter; t.generateMipmaps = false;
    return t;
  }
  function syncWyrmMesh() {
    if (!scene || !wyrm.awake || !wyrm.segs) { if (wyrm.group) removeWyrmMesh(); return; }
    if (!wyrm.group) {
      if (!wyrmTex) { wyrmTex = makeWyrmTex(); wyrmGeo = new THREE.BoxGeometry(1, 1, 1); wyrmMat = new THREE.MeshBasicMaterial({ map: wyrmTex }); wyrmRingGeo = new THREE.RingGeometry(0.82, 1, 24); wyrmRingMat = new THREE.MeshBasicMaterial({ color: 0xd9b27a, transparent: true, opacity: 0.8, side: THREE.DoubleSide }); }
      wyrm.group = new THREE.Group();
      wyrm.segs.forEach((g, i) => { const m = new THREE.Mesh(wyrmGeo, wyrmMat); const sc = i === 0 ? 1.3 : 1.1 - i * 0.07; m.scale.set(sc, sc, sc); wyrm.group.add(m); });
      wyrm.ring = new THREE.Mesh(wyrmRingGeo, wyrmRingMat); wyrm.ring.rotation.x = -Math.PI / 2; wyrm.ring.visible = false; wyrm.group.add(wyrm.ring);
      scene.add(wyrm.group);
    }
    const kids = wyrm.group.children;
    wyrm.segs.forEach((g, i) => { kids[i].position.set(g.x, g.y, g.z); });
    kids[0].rotation.y = Math.atan2(player.x - wyrm.segs[0].x, player.z - wyrm.segs[0].z);
    wyrmMat.color.setHex(wyrm.hitT > 0 ? 0xff9988 : 0xffffff);
    const tele = wyrm.atk && wyrm.atk.s === 'telegraph' && wyrm.tgt;
    wyrm.ring.visible = !!tele;
    if (tele) {
      const T = MMDDWyrm.T.telegraph[MMDDWyrm.phaseOf(wyrm.hp, wyrm.max) - 1], k = Math.min(1, wyrm.atk.t / T);
      const sc = MMDDWyrm.RING_R * (reduced ? 1 : 1.5 - 0.5 * k);
      wyrm.ring.position.set(wyrm.tgt.x, wyrm.tgt.y - 0.85, wyrm.tgt.z); wyrm.ring.scale.set(sc, sc, 1);
    }
  }
  function removeWyrmMesh() {
    if (wyrm.group && scene) scene.remove(wyrm.group);
    wyrm.group = null; wyrm.ring = null;
  }

  // ---------- test hooks ----------
  function hashData(w, cs) {
    let h = 2166136261 >>> 0;
    for (const c of cs) { const d = w.getChunk(c[0], c[1], c[2]).data; for (let i = 0; i < d.length; i++) { h ^= d[i]; h = Math.imul(h, 16777619) >>> 0; } }
    return h >>> 0;
  }
  function exposeTest() {
    window.__dd = {
      get world() { return world; }, player, input, inv, seed: SEED, get view() { return view; }, baseView: VIEW,
      perf: { frame: govFrame, state: govState, reset() { gov.level = 0; gov.lastChange = -1e9; gov.lastRaise = -1e9; gov.restoreGap = GOV.RESTORE_GAP; gov.changes = 0; govReset(); applyLevel(); }, setAuto(on) { gov.auto = !!on; }, LEVELS, GOV }, spawn, MMChunks,
      setPos(x, y, z) { player.x = x; player.y = y; player.z = z; player.vy = 0; player.peak = y; player.onGround = false; },
      step(dt, n) { for (let i = 0; i < (n || 1); i++) physics(dt || 1 / 60); },
      walk(fwd, strafe, n, jump) { input.fwd = fwd; input.strafe = strafe; input.jump = !!jump; this.step(1 / 60, n); input.fwd = 0; input.strafe = 0; input.jump = false; },
      getBlock: (x, y, z) => world.getBlock(x, y, z),
      mineAt: mineBlock, placeAt: placeBlock, raycast,
      hotbar: hotbarItems, select(i) { sel = i; renderHud(); },
      terrainHash() { const cs = []; for (let cy = 0; cy < 4; cy++) for (let cz = 3; cz < 5; cz++) for (let cx = 3; cx < 5; cx++) cs.push([cx, cy, cz]); return hashData(world, cs); },
      faceStats(cx, cy, cz) {
        const ch = world.getChunk(cx, cy, cz), m = MMChunks.mesh(ch, world.neighbours(cx, cy, cz));
        let solid = 0; for (let i = 0; i < ch.data.length; i++) if (ch.data[i] !== B.AIR && ch.data[i] !== B.TORCH) solid++;
        return { faces: m.faceCount, solid, naive: solid * 6 };
      },
      settle() { manage(Infinity); }, flush, loadedMeshes: () => meshes.size, meshFaces() { let n = 0; meshes.forEach((e) => { n += e.faces; }); return n; },
      pick, slimes, meta: () => meta, get reduced() { return reduced; }, bob: () => bobOffset, sanitiseMeta, META_KEY,
      setMode, craftRecipe, smeltOre, furnaceNear, checkGoals, lakeCheck, hurt, tickMobs, spawnSlime, autoSpawn, attackSlime, die,
      cellLight, panel: togglePanel, setPick(t, dur) { pick.tier = t; pick.dur = dur === undefined ? PICK_DUR[t] : dur; renderHud(); },
      benches, benchNear, benchAtLook, pickUpBench, placeBench, craftRows: () => MMDDCraft.annotate(inv, { furnace: furnaceNear(), bench: benchNear() }),
      clock, setTime, tickTime, timeStage: () => MMDDTime.stage(clock.t), skyScale: () => clock.k, bg: () => scene ? scene.background.getHex() : 0, fogHex: () => scene ? scene.fog.color.getHex() : 0, MMDDTime,
      creatures, slain, MMDDMobs, scanSpawns, tickCreatures, attackCreature, spawnCreature, clearCreatures, creatureCands: chunkCands, caveDark, deathCause: (c) => { deathCause = c; },
      wyrm: { state: wyrm, scan: wyrmScan, tick: tickWyrm, attack: attackWyrm, carve: carveWyrmArena, defeat: defeatWyrm, sleep: wyrmSleep, on: WYRM_ON && !!wyrm.site, mesh: syncWyrmMesh, MMDDWyrm: window.MMDDWyrm },
      creative: CREATIVE, CREATIVE_KEY, access: ACCESS, govFloor: () => govFloor, kv: { get: kvGet, set: kvSet }, MMDDGrotto: GROTTO, MMDDBuild: BUILD, buildCheck, findBlueprint, renderBuilds, lampChunks, creativeBuilt, lightAt: (x, y, z) => {
        if (!win || x < win.ox * SIZE || z < win.oz * SIZE || x >= (win.ox + WIN) * SIZE || z >= (win.oz + WIN) * SIZE) { fillWindow(Math.floor(x / SIZE), Math.floor(z / SIZE)); lightDirty = true; }
        if (lightDirty || !win.light) relight();
        return lightAt(x, y, z);
      }, worldUrl, switchWorld, outlineHex: () => (outline ? outline.material.color.getHex() : 0),
      introText, prog: showProg, mining: (dt) => updateMining(dt), progShown: () => progShown,
      run: { get state() { return run; }, get rec() { return runRec; }, start: startRun, end: endRun, mined: onMined, tick: tickRun, close: closeSummary, depth0: () => runDepth0, shake: () => ({ t: shakeT, amp: shakeAmp }), MMDDRun: RUNS },
      craft: craftTorch, mouthSite: () => mouthSite, aimed: () => aimed, aim, outlineVisible: () => !!(outline && outline.visible), programs: () => (renderer && renderer.info && renderer.info.programs ? renderer.info.programs.length : -1), surfaceY: (x, z) => MMChunks.surfaceY(x, z, SEED), ready: true,
    };
  }

  // First hint: touch players get touch words (they have no mouse buttons or keys); both learn the dive goal.
  function introText() {
    const how = $('touch').hidden ? 'Click the view to look around. Hold left to mine (or F), right to place (or E). WASD + Space, Esc for the menu.' : 'Drag the view to look, use the stick to move, hold Mine to dig.';
    return CREATIVE ? how : how + ' Dive deep, then climb back out for a bonus.';
  }
  // ---------- boot ----------
  async function boot() {
    $('hud-seed').textContent = 'Seed ' + SEED;
    meta = CREATIVE ? sanitiseMeta({ mode: 'creative' }) : loadMeta();
    if (CREATIVE) {
      document.documentElement.setAttribute('data-dd-world', 'creative');
      document.title = 'Deepdelve - Creative world';
      const h1 = document.querySelector('.bar h1'); if (h1) h1.textContent = 'Deepdelve: Creative';
      const cn = $('creative-note'); cn.hidden = false; cn.textContent = 'Calm creative world: no mobs, no hazards, unlimited blocks. Separate save.';
      $('world-btn').textContent = 'Survival world'; $('world-btn').setAttribute('aria-label', 'Back to the survival world');
      $('mode-btn').setAttribute('aria-label', 'Toggle flying (M)');
    }
    hubMedals();
    idb = await openDB();
    const savedWorld = await kvGet('world:' + SEED);
    const savedPlayer = await kvGet('player:' + SEED);
    world = MMChunks.createWorld(SEED, typeof savedWorld === 'string' ? savedWorld : undefined, GROTTO ? GROTTO.worldOpts(SEED) : undefined);
    if (typeof savedWorld === 'string' && /,14[,\]]/.test(savedWorld)) {
      try { JSON.parse(savedWorld).d.forEach((e) => { for (let j = 1; j < e[3].length; j += 2) if (e[3][j] === LAMP) { lampChunks.add(MMChunks.key(e[0], e[1], e[2])); break; } }); } catch (e) { /* the world loader already ignored it */ }
    }
    // New worlds open beside a cave mouth (a seeded ramp into the hill) instead of a bare plain. Worlds saved before this
    // keep the old spawn and are never carved; the additive `mouth` flag in the player save marks the new kind.
    let sx = 64, sz = 64;
    mouthOn = typeof savedPlayer !== 'string' || /"mouth":1/.test(savedPlayer);
    if (mouthOn && window.MMDDSpawn) {
      mouthSite = MMDDSpawn.site(SEED, (x, z) => MMChunks.surfaceY(x, z, SEED));
      MMDDSpawn.cells(mouthSite).forEach((c) => world.setBlock(c[0], c[1], c[2], c[3]));
      sx = mouthSite.spawn.x; sz = mouthSite.spawn.z;
    } else mouthOn = false;
    const s = MMChunks.surfaceY(sx, sz, SEED);
    spawn = { x: sx + 0.5, y: -s + 0.5, z: sz + 0.5 };
    player.x = spawn.x; player.y = spawn.y; player.z = spawn.z; player.peak = player.y;
    if (typeof savedPlayer === 'string') {
      try {
        const d = JSON.parse(savedPlayer);
        if (d && d.inv && typeof d.inv === 'object') for (const k of Object.keys(d.inv)) if (typeof d.inv[k] === 'number' && isFinite(d.inv[k])) inv[k] = Math.max(0, Math.min(9999, d.inv[k] | 0));
        if (Array.isArray(d.pos) && d.pos.length >= 3 && d.pos.every((v) => typeof v === 'number' && isFinite(v))) {
          // a hostile or damaged save cannot park the player outside the world or inside solid rock
          const wx = SIZE * MMChunks.WORLD.cx, wz = SIZE * MMChunks.WORLD.cz, hy = SIZE * MMChunks.WORLD.cy;
          const px = Math.max(1, Math.min(wx - 1, d.pos[0])), py = Math.max(-(hy - 3), Math.min(3, d.pos[1])), pz = Math.max(1, Math.min(wz - 1, d.pos[2]));
          if (!collides(px, py, pz)) { player.x = px; player.y = py; player.z = pz; player.peak = player.y; }
        }
        if (typeof d.sel === 'string') sel = d.sel;
        MMDDCraft.cleanBenches(d.benches).forEach((b) => benches.push(b));
        if (typeof d.t === 'number' && isFinite(d.t)) clock.t = MMDDTime.norm(d.t);
        if (Array.isArray(d.slain)) d.slain.slice(-300).forEach((x) => { if (typeof x === 'string' && x.length < 40 && /^[0-9,#]+$/.test(x)) slain.add(x); });
        wyrmClean(d.wyrm);
        if (typeof d.hp === 'number' && d.hp > 0) player.hp = Math.min(10, d.hp | 0);
        if (d.pick && typeof d.pick === 'object') { pick.tier = clampInt(d.pick.tier, 0, 3); pick.dur = pick.tier ? clampInt(d.pick.dur, 1, PICK_DUR[pick.tier]) : 0; }
      } catch (e) { /* ignore corrupt save */ }
    }
    migrateTown();
    runDepth0 = Math.max(0, Math.floor(-spawn.y));
    startRun();
    if (CREATIVE) { PLACEABLE.forEach((p) => { inv[p[0]] = 999; }); if (BUILD) BUILD.BLUEPRINTS.forEach((bp) => { inv[bp.item] = 1; }); }
    if (WYRM_ON) await loadWyrmScript();
    wyrmInit();
    applyTime(true);
    initRenderer();
    prewarmPrograms();
    applyLowGfx();
    window.addEventListener('mm-settings-change', (ev) => {
      const id = ev && ev.detail && ev.detail.id;
      if (id === 'reduce-motion') reduced = readReduced();
      else if (id === 'low-gfx') { ACCESS.lowGfx = ev.detail.value === true; applyLowGfx(); }
      else if (id === 'sound') { try { if (sfxBox && sfxBox.setMuted) sfxBox.setMuted(ev.detail.value === false); } catch (e) { /* audio is optional */ } }
    });
    if (outline && ACCESS.palette !== 'normal') outline.material.color.set(ACCESS.ally);
    bindControls();
    renderHud();
    if (TEST) exposeTest();
    const NOSAVE_NOTE = 'Progress cannot be saved in this browser mode.'; // beta S-05: said once, with the intro
    say(LS_NOSAVE ? NOSAVE_NOTE + (TEST ? '' : ' ' + introText()) : (TEST ? '' : introText()));
    if (!TEST) setTimeout(() => say(''), LS_NOSAVE ? 9000 : 6000);
    requestAnimationFrame(frame);
  }
  boot();
}());
