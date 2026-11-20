// The Realm: a small top-down bullet-hell arena, entered through the Realm Gate in the village.
//
// Fully local (nothing here syncs over the network) and drawn with a plain 2D canvas in an overlay,
// the same way the cave overlay works. Everything that moves lives in a fixed-size pool (player
// bolts, enemy bullets, enemies, particles, floating numbers), so a long fight allocates nothing
// per frame, and every sprite is baked to an offscreen canvas once.
//
// Controls (twin-stick): WASD / arrows move, the mouse aims and holds-to-fire (or Space fires toward
// the pointer). On a touch screen the left stick moves and the right stick aims and fires.
//
// Three enemy patterns: Whirlers fire a steady spiral, Snipers fire aimed three-bolt bursts and
// circle you, Bursters drift in and fire rings. Survive waves, bank shards; dying costs 20% of the
// banked shards and sends you back to the village.

const RM_SHORT = 540; // logical arena short side; the long side follows the screen's shape
const RM_PLAYER = { speed: 235, r: 11, hp: 100, fireRate: 7.5, bulletSpeed: 580, bulletLife: 0.85, dmg: 1, iframes: 0.5 };
const RM_ENEMIES = {
  spiral: { name: 'Whirler', hp: 16, r: 17, shards: 3, color: '#b36bff', speed: 22 },
  aimed: { name: 'Sniper', hp: 8, r: 13, shards: 2, color: '#ff6b6b', speed: 80 },
  ring: { name: 'Burster', hp: 11, r: 15, shards: 2, color: '#ffb347', speed: 48 },
  boss: { name: 'Gloomheart', hp: 120, r: 34, shards: 40, color: '#ff5fa2', speed: 50 },
};
const RM_ENEMY_BULLET_DAMAGE = 8;
// ---- biomes, wanderers and the boss (B3) ----
const RM_BIOMES = [
  { id: 'hollow', name: 'Violet Hollow', border: 'rgba(179,107,255,0.55)', floor: [26, 18, 50], hazard: null, mix: ['aimed', 'ring', 'spiral'], drifter: 'wisp' },
  { id: 'ember', name: 'Ember Waste', border: 'rgba(255,120,60,0.6)', floor: [48, 22, 16], hazard: 'lava', mix: ['ring', 'ring', 'aimed', 'spiral'], drifter: 'cinder' },
  { id: 'frost', name: 'Frost Mire', border: 'rgba(130,200,255,0.6)', floor: [18, 32, 56], hazard: 'ice', mix: ['aimed', 'aimed', 'ring', 'spiral'], drifter: 'puff' },
];
function rmBiomeIndex(wave) { return Math.floor((Math.max(1, wave) - 1) / 3) % RM_BIOMES.length; }
const RM_BOSS_EVERY = 5; // every fifth wave is the boss
const RM_BOSS_HP = 120; const RM_BOSS_HP_TIER = 40;
const RM_HAZARD_R = 46;
const RM_LAVA_DAMAGE = 5; const RM_LAVA_TICK = 0.7; const RM_ICE_SLOW = 0.55;
const RM_DRIFTER_COLORS = { wisp: '#8fb8ff', cinder: '#ffa04a', puff: '#eaf6ff' };
const RM_DEATH_PENALTY = 0; // dying never costs banked shards any more: you get a Survivor's Cache item instead (see _deathBonus)
const RM_SHOP_MULT = 8; // shop price = the item's sell value x this
const RM_COMBINE_COUNT = 3; // identical items (same gear, same rarity) fuse into one of the next rarity
const RM_SHOP_UNLOCK = [0, 2, 5]; // best wave needed before the shop stocks Common / Uncommon / Rare
const RM_POOL = { pBullets: 160, eBullets: 420, enemies: 24, particles: 180, texts: 28, bags: 14, drifters: 12, hazards: 5 };

// ---- progression (B2) ----
const RM_MAX_LEVEL = 20;
const RM_HP_PER_LEVEL = 8;
const RM_BACKPACK = 24; // items you can carry; extras are sold for shards on pickup
const RM_RARITIES = [
  { id: 'common', name: 'Common', mult: 1, color: '#c9d1d9', sell: 3 },
  { id: 'uncommon', name: 'Uncommon', mult: 1.6, color: '#7ee787', sell: 7 },
  { id: 'rare', name: 'Rare', mult: 2.4, color: '#79c0ff', sell: 15 },
  { id: 'epic', name: 'Epic', mult: 3.6, color: '#d2a8ff', sell: 30 }, // only made by combining 3 Rares (never dropped or sold in the shop)
];
// slot: weapon | charm | ring. Each item adds `stat` x rarity multiplier.
const RM_ITEMS = [
  { id: 'sparkwand', slot: 'weapon', name: 'Spark Wand', icon: '🪄', stat: 'dmg', amount: 0.5, text: 'damage' },
  { id: 'quickwand', slot: 'weapon', name: 'Quickfire Wand', icon: '⚡', stat: 'rate', amount: 1.5, text: 'shots/s' },
  { id: 'heartcharm', slot: 'charm', name: 'Hearty Charm', icon: '💖', stat: 'hp', amount: 12, text: 'max HP' },
  { id: 'swiftcharm', slot: 'charm', name: 'Swift Charm', icon: '👟', stat: 'speed', amount: 18, text: 'speed' },
  { id: 'luckring', slot: 'ring', name: 'Lucky Ring', icon: '💍', stat: 'shards', amount: 0.12, text: 'shard bonus', pct: true },
  { id: 'scholarring', slot: 'ring', name: 'Scholar Ring', icon: '📘', stat: 'xp', amount: 0.12, text: 'XP bonus', pct: true },
  { id: 'wardring', slot: 'ring', name: 'Warding Ring', icon: '🛡️', stat: 'iframes', amount: 0.1, text: 's safe time' },
];
const RM_ITEM_BY_ID = Object.create(null); // no inherited keys like __proto__ / constructor
RM_ITEMS.forEach((i) => { RM_ITEM_BY_ID[i.id] = i; });
const RM_SLOTS = ['weapon', 'charm', 'ring'];
const RM_BAG_CHANCE = 0.3;
const RM_XP = { spiral: 7, aimed: 4, ring: 5, boss: 100 };
const RM_ABILITIES = [
  { id: 'dash', key: 'q', icon: '💨', name: 'Dash', level: 1, cd: 3 },
  { id: 'nova', key: 'e', icon: '💥', name: 'Nova', level: 3, cd: 8 },
  { id: 'shield', key: 'r', icon: '🛡️', name: 'Shield', level: 5, cd: 14 },
  { id: 'overdrive', key: 'f', icon: '🔥', name: 'Overdrive', level: 7, cd: 20 },
];
function rmXpNeeded(level) { return 30 + 20 * (level - 1); }
const RM_WAVE_PAUSE = 2.4; // seconds between waves (shows the banner)

// Tiny seeded PRNG so a run can be reproduced in tests.
function rmRng(seed) {
  let t = seed >>> 0;
  return () => {
    t = (t + 0x6D2B79F5) >>> 0;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r = (r + Math.imul(r ^ (r >>> 7), 61 | r)) ^ r;
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

function rmCleanCount(v) {
  v = Math.floor(Number(v));
  return Number.isFinite(v) && v > 0 ? Math.min(v, 9999999) : 0;
}

// Everything read back from localStorage goes through here (additive fields: old saves load as level 1).
function rmCleanSave(s) {
  s = s && typeof s === 'object' ? s : {};
  const out = { shards: rmCleanCount(s.shards), bestWave: rmCleanCount(s.bestWave), kills: rmCleanCount(s.kills), deaths: rmCleanCount(s.deaths) };
  const kb = s.kb && typeof s.kb === 'object' ? s.kb : {};
  out.kb = { spiral: rmCleanCount(kb.spiral), aimed: rmCleanCount(kb.aimed), ring: rmCleanCount(kb.ring), drifter: rmCleanCount(kb.drifter), boss: rmCleanCount(kb.boss) };
  out.bossBestT = Math.min(rmCleanCount(s.bossBestT), 999999); // fastest boss kill in tenths of a second (0 = none yet)
  out.level = Math.max(1, Math.min(RM_MAX_LEVEL, rmCleanCount(s.level) || 1));
  out.xp = out.level >= RM_MAX_LEVEL ? 0 : Math.min(rmCleanCount(s.xp), rmXpNeeded(out.level) - 1);
  out.items = [];
  const seen = new Set();
  (Array.isArray(s.items) ? s.items.slice(0, 200) : []).forEach((it) => {
    if (out.items.length >= RM_BACKPACK || !it || typeof it !== 'object') return;
    const uid = rmCleanCount(it.n);
    const def = typeof it.id === 'string' ? RM_ITEM_BY_ID[it.id] : null;
    const rar = Math.floor(Number(it.r));
    if (!uid || seen.has(uid) || !def || !(rar >= 0 && rar < RM_RARITIES.length)) return;
    seen.add(uid);
    out.items.push({ n: uid, id: it.id, r: rar });
  });
  out.nextUid = Math.max(rmCleanCount(s.nextUid), 1 + out.items.reduce((m, it) => Math.max(m, it.n), 0));
  out.eq = {};
  const eq = s.eq && typeof s.eq === 'object' ? s.eq : {};
  RM_SLOTS.forEach((slot) => {
    const it = out.items.find((x) => x.n === rmCleanCount(eq[slot]));
    if (it && RM_ITEM_BY_ID[it.id].slot === slot) out.eq[slot] = it.n;
  });
  return out;
}

// ---------- cross-tab save merge ----------
// The arena keeps `realm` in memory and used to write it back whole, so two tabs clobbered each other.
// Now every save re-reads pixeltown-save-v1, merges (never loses progress) and writes the merge.
const RM_SAVE_KEY = 'pixeltown-save-v1';
const RM_TILE = 40; // wall-grid tile size in logical px

function rmReadStoredRealm() {
  try {
    const raw = localStorage.getItem(RM_SAVE_KEY);
    const parsed = raw ? JSON.parse(raw) : null;
    const r = parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed.realm : null;
    return r && typeof r === 'object' && !Array.isArray(r) ? r : null;
  } catch (e) { return null; }
}

// mine = this tab's save, stored = what is in localStorage now. opts.base = this tab's last-known shard total
// (so only THIS tab's delta is applied on top of the stored value), opts.known = uids this tab has already seen (a stored item it knew but no longer holds was sold here, so it stays gone).
function rmMergeSave(mine, stored, opts) {
  opts = opts || {};
  const a = rmCleanSave(mine); const b = rmCleanSave(stored);
  const out = {};
  out.bestWave = Math.max(a.bestWave, b.bestWave); out.kills = Math.max(a.kills, b.kills); out.deaths = Math.max(a.deaths, b.deaths);
  out.kb = {}; Object.keys(a.kb).forEach((k) => { out.kb[k] = Math.max(a.kb[k], b.kb[k]); });
  out.bossBestT = a.bossBestT && b.bossBestT ? Math.min(a.bossBestT, b.bossBestT) : (a.bossBestT || b.bossBestT);
  const lead = (a.level > b.level || (a.level === b.level && a.xp >= b.xp)) ? a : b;
  out.level = lead.level; out.xp = lead.xp;
  const base = Number.isFinite(opts.base) ? opts.base : a.shards;
  out.shards = Math.max(0, b.shards + (a.shards - base));
  const known = opts.known || new Set(); // uids that were in storage when this tab last synced
  // Three-way merge by uid: an item only this tab holds is dropped if storage once had it (another tab sold it) and kept if it is new here;
  // an item only storage holds is skipped if this tab once had it (sold here) and taken if it is new there.
  let next = Math.max(a.nextUid, b.nextUid);
  const items = []; const remap = {};
  const byUid = new Map(b.items.map((it) => [it.n, it]));
  a.items.forEach((it) => {
    const other = byUid.get(it.n);
    if (!other) { if (known.has(it.n)) return; items.push({ ...it }); return; } // gone from storage because another tab sold it, or new here
    if (other.id === it.id && other.r === it.r) { items.push({ ...it }); return; } // same item
    const fresh = next++; remap[it.n] = fresh; items.push({ n: fresh, id: it.id, r: it.r }); // a uid collision between two different items: this tab's gets a fresh uid, storage's keeps the old one
  });
  const have = new Set(items.map((it) => it.n));
  b.items.forEach((it) => {
    if (have.has(it.n)) return;
    const mineHas = a.items.some((x) => x.n === it.n);
    if (!mineHas && known.has(it.n)) return; // sold here
    items.push({ ...it }); have.add(it.n);
  });
  const eq = { ...a.eq }; Object.keys(eq).forEach((slot) => { if (remap[eq[slot]] !== undefined) eq[slot] = remap[eq[slot]]; });
  out.items = items; out.nextUid = next; out.eq = eq; // equipment is per-tab
  return rmCleanSave(out);
}

class RealmArena {
  constructor({ container, save, onSave, onExit, seed }) {
    this.container = container;
    this._onSave = onSave || (() => {});
    this.onSave = (sv) => this._persist(sv); // every save goes through the cross-tab merge first
    this.onExit = onExit || (() => {});
    this.save = rmCleanSave(save);
    this._baseShards = this.save.shards; this._known = new Set(this.save.items.map((it) => it.n)); this.walls = null; this.extraGuard = 0;
    this.dungeon = null; this.fixedWorld = null; // optional run controller + fixed-size world (Mad Maze dungeons); null = classic waves
    this.rng = rmRng(seed === undefined ? (Date.now() & 0xffffffff) : seed);
    this.active = false;
    this.state = 'idle'; // idle | banner | play | dead
    this.W = 960; this.H = RM_SHORT;
    this.keys = {};
    this.moveVec = { x: 0, y: 0 }; // touch stick
    this.aimVec = { x: 0, y: 0, on: false };
    this.mouse = { x: 0, y: 0, down: false, seen: false };
    this.shake = 0;
    this.flash = 0; // red hit vignette
    this.run = { wave: 0, kills: 0, shards: 0 };
    this.displayShards = this.save.shards;
    this._avatar = null;
    this._itemArt = null; this._enemyArt = null; this._enemyMap = null; this._driftMap = null; this._enemyDbgOn = false; this._bossArt = null; this._bossLoad = null; this._bossDbg = null; this._bossGhost = null; this._bossReq = null; // optional enemy animations (setEnemyArt)
    this.heroProfile = null; // setHeroProfile
    this._heroArt = null; this._heroClass = null; this._heroSt = null; this._heroDbg = null; this._heroHurtAt = -9; this._heroAtkAt = -9; // optional hero animations (setHeroArt)
    this.team = null; this.role = 'solo'; this.down = false; this.reviveT = 0; this._firing = false;

    this.canvas = document.createElement('canvas');
    this.canvas.id = 'realm-canvas';
    this.container.appendChild(this.canvas);
    this.ctx = this.canvas.getContext('2d');

    this._wireInit();
    this._makePools();
    this._calcStats();
    this._bakeSprites();
    this._bindInput();
    this._resize();
    if (typeof window !== 'undefined' && window.addEventListener) window.addEventListener('storage', (e) => { if (!e.key || e.key === RM_SAVE_KEY) this.resyncSave(); });
  }

  // Replace the in-memory save with `m` in place (callers hold references to this.save) and refresh what depends on it.
  _adopt(m) {
    const sv = this.save; const before = JSON.stringify([sv.level, sv.items, sv.eq]);
    Object.keys(sv).forEach((k) => { delete sv[k]; }); Object.assign(sv, m);
    if (JSON.stringify([sv.level, sv.items, sv.eq]) !== before) { this._calcStats(); if (this.active) this._syncHud(); }
  }

  // Merge with whatever is in storage now (another tab may have written) without writing.
  resyncSave() {
    const stored = rmReadStoredRealm();
    if (!stored) return false;
    this._adopt(rmMergeSave(this.save, stored, { base: this._baseShards, known: this._known }));
    this._baseShards = this.save.shards; this._known = new Set(rmCleanSave(stored).items.map((it) => it.n)); // what storage held at this sync
    return true;
  }

  _persist(sv) {
    this.resyncSave();
    this._baseShards = this.save.shards;
    this._known = new Set(this.save.items.map((it) => it.n)); // about to be written, so storage will hold exactly these
    this._onSave(this.save);
  }

  // ---------- team play ----------

  // role: 'host' | 'guest'; link: { send, onMessage, close }. Call before start(); clearTeam() after the run.
  setTeam(role, link, name, mode, slot) {
    this.clearTeam();
    this.role = role;
    this.team = new RealmTeam({ arena: this, role, link, name, mode, slot });
  }

  clearTeam() {
    if (this.team) this.team.close();
    this.team = null; this.role = 'solo'; this.down = false; this.reviveT = 0;
    const el = document.getElementById('realm-partner'); if (el) el.classList.add('hidden');
  }

  // The nearest living player to a point — enemies aim at whoever is closest.
  _nearest(x, y) {
    let best = this.down ? null : this.player; let bd = best ? Math.hypot(best.x - x, best.y - y) : 1e9;
    const t = this.team;
    if (t && t.role === 'host' && t.partner && t.partner.ready && !t.partner.down) {
      const d = Math.hypot(t.partner.x - x, t.partner.y - y);
      if (d < bd) { best = t.partner; bd = d; }
    }
    return best || this.player;
  }

  _revive(frac) {
    this.down = false; this.reviveT = 0;
    this.player.hp = Math.max(1, Math.ceil(this.stats.maxHp * frac)); this.player.iframes = 1.5;
    this._floatText(this.player.x, this.player.y - 28, 'revived!', '#7ee787');
    this._syncHud();
  }

  _teamWipe() {
    if (this.state === 'dead') return;
    if (this.team) { this.team.ev('end', ['wipe']); this.team._sendSnap(); } // _die() stops the host tick, so push the news out now
    this.down = false; this.player.hp = 0;
    this._die();
  }

  // The partner (or the host) ended the run.
  _teamEnd(why) {
    if (!this.active) return;
    if (why === 'wipe') { // we fell with them: the same cache as dying alone
      this.save.deaths += 1; this.save.bestWave = Math.max(this.save.bestWave, this.run.wave - 1);
      this._deathBonus();
      this.onSave(this.save);
      this.stop(); this.onExit('death'); return;
    }
    this.onSave(this.save);
    this.stop(); this.onExit(why === 'lost' ? 'lost' : 'leave');
  }

  // A kill / wave bonus the host told us about: pay it out with OUR multipliers.
  _teamReward(r) {
    const sv = this.save;
    if (r.t === 'wave') { const gain = Math.max(0, Math.round(r.sh)); sv.shards += gain; sv.bestWave = Math.max(sv.bestWave, this.run.wave); this.run.shards += gain; this.onSave(sv); this._syncHud(); return; }
    const gain = Math.max(1, Math.round(r.sh * this.stats.shards));
    sv.shards += gain; this.run.shards += gain;
    if (r.t === 'drifter') sv.kb.drifter += 1;
    else if (r.boss) { sv.kb.boss += 1; sv.kills += 1; if (r.tenths && (!sv.bossBestT || r.tenths < sv.bossBestT)) sv.bossBestT = r.tenths; } else if (Object.prototype.hasOwnProperty.call(sv.kb, r.t) && typeof sv.kb[r.t] === 'number') { sv.kb[r.t] += 1; sv.kills += 1; }
    this._floatText(this.player.x, this.player.y - 36, `+${gain} 💎`, '#8fe9ff');
    this._gainXp(Math.max(1, Math.round(r.xp * this.stats.xp)));
    this.onSave(sv);
  }

  // ---------- pools ----------

  _makePools() {
    const make = (n, f) => Array.from({ length: n }, f);
    this.pBullets = make(RM_POOL.pBullets, () => ({ active: false, x: 0, y: 0, vx: 0, vy: 0, life: 0 }));
    this.eBullets = make(RM_POOL.eBullets, () => ({ active: false, x: 0, y: 0, vx: 0, vy: 0, life: 0, kind: 0 }));
    this.enemies = make(RM_POOL.enemies, () => ({ active: false, type: 'aimed', x: 0, y: 0, hp: 0, maxHp: 0, t: 0, cd: 0, cd2: 0, angle: 0, flash: 0, ax: 0, ay: 0, dir: 1, phase: 0, invuln: 0 }));
    this.drifters = make(RM_POOL.drifters, () => ({ active: false, x: 0, y: 0, vx: 0, vy: 0, t: 0, turn: 0, kind: 'wisp' }));
    this.hazards = make(RM_POOL.hazards, () => ({ active: false, x: 0, y: 0, kind: 'lava', tick: 0 }));
    this.biome = 0; this.clock = 0; this.bossT0 = 0; this._speedMul = 1;
    this.particles = make(RM_POOL.particles, () => ({ active: false, x: 0, y: 0, vx: 0, vy: 0, life: 0, max: 1, color: '#fff', size: 3 }));
    this.texts = make(RM_POOL.texts, () => ({ active: false, x: 0, y: 0, vy: 0, life: 0, text: '', color: '#fff' }));
    this.bags = make(RM_POOL.bags, () => ({ active: false, x: 0, y: 0, vx: 0, vy: 0, t: 0, id: '', r: 0 }));
    this.abilityCd = [0, 0, 0, 0];
    this.shield = { hits: 0, t: 0 };
    this.overdriveT = 0;
    this.player = { x: 0, y: 0, hp: RM_PLAYER.hp, dashT: 0, iframes: 0, fireCd: 0, aim: 0, facing: 1, moving: false, bob: 0 };
  }

  _take(pool) {
    for (let i = 0; i < pool.length; i++) if (!pool[i].active) { if (pool === this.enemies) this._spawnN++; return pool[i]; }
    return null;
  }

  // ---------- shared-module wiring (hash, gamepad, aim assist, sfx, reduce-motion); every piece degrades to a no-op if its script is missing ----------

  _wireInit() {
    this._hash = typeof MMHash !== 'undefined' ? MMHash.create(64) : null;
    this._spawnN = 0; this._hashN = -1; this._hq = { x: 0, y: 0, best: -1 };
    this._hitCb = (id) => { // exact circle test; the lowest pool index wins, like the old linear scan
      const e = this.enemies[id]; if (!e.active || (this._hq.best >= 0 && id > this._hq.best)) return;
      const r = RM_ENEMIES[e.type].r + 5; const dx = this._hq.x - e.x; const dy = this._hq.y - e.y;
      if (dx * dx + dy * dy < r * r) this._hq.best = id;
    };
    this._padPrev = [false, false, false, false]; this._aimTargets = [];
    this.sfx = null; this._gesture = false; this._actx = null;
    this._padPause = false; this._padWas = false;
    this._padRes = { move: { x: 0, y: 0 }, aim: { x: 0, y: 0, on: false }, fire: false, ability: [false, false, false, false], pause: false }; // reused every frame (no per-frame allocation)
    this._aimAssist = true; this._reduced = false;
    this._wireRefresh();
    this._mountAimToggle();
  }

  // Small HUD toggle for touch aim assist (stored in 'mm-aim-assist'; the realm save is untouched). Idempotent.
  _mountAimToggle() {
    if (typeof document === 'undefined') return;
    const hud = document.getElementById('realm-hud'); if (!hud) return;
    let b = document.getElementById('realm-aim-btn');
    if (!b) {
      b = document.createElement('button'); b.id = 'realm-aim-btn'; b.type = 'button'; b.textContent = '🎯';
      b.style.cssText = 'position:absolute;right:0;top:calc(100% + 4px);pointer-events:auto;width:34px;height:34px;border-radius:50%;border:2px solid rgba(255,255,255,0.6);background:rgba(0,0,0,0.55);font-size:16px;padding:0;'; // out of the flex row so the phone HUD keeps its width
      hud.appendChild(b);
      b.addEventListener('click', () => this.setAimAssist(!this._aimAssist));
    }
    this._aimBtn = b; this._syncAimBtn();
  }

  _syncAimBtn() {
    const b = this._aimBtn; if (!b) return;
    b.setAttribute('aria-label', 'Aim assist: ' + (this._aimAssist ? 'on' : 'off') + ' (toggle)');
    b.setAttribute('aria-pressed', this._aimAssist ? 'true' : 'false');
    b.style.opacity = this._aimAssist ? '1' : '0.5';
    b.title = 'Aim assist ' + (this._aimAssist ? 'on' : 'off');
  }

  // Re-read the two preferences (aim-assist toggle, reduce-motion); called on construction and at every start().
  _wireRefresh() {
    try { this._aimAssist = localStorage.getItem('mm-aim-assist') !== '0'; } catch (e) { this._aimAssist = true; }
    this._syncAimBtn();
    this._readReduced();
  }

  // Reduce-motion is read live (cheap), so flipping the OS setting mid-run takes effect on the next frame.
  _readReduced() {
    try { this._reduced = typeof MMMotion !== 'undefined' && MMMotion.reduced(window, localStorage); } catch (e) { this._reduced = false; }
  }

  setAimAssist(on) {
    this._aimAssist = !!on; this._syncAimBtn();
    try { localStorage.setItem('mm-aim-assist', on ? '1' : '0'); } catch (e) { /* ignore */ }
  }

  // Sound: created lazily and only after a real user gesture (so no autoplay), music stays off. Tests may assign arena.sfx.
  // The AudioContext is created / resumed INSIDE the user-gesture handler (iOS Safari only unlocks audio there).
  _unlockAudio() {
    this._gesture = true;
    try {
      if (!this._actx) { const C = typeof AudioContext !== 'undefined' ? AudioContext : (typeof webkitAudioContext !== 'undefined' ? webkitAudioContext : null); if (C) this._actx = new C(); }
      if (this._actx && this._actx.state === 'suspended' && this._actx.resume) { const r = this._actx.resume(); if (r && r.catch) r.catch(() => {}); }
    } catch (e) { /* audio must never break the game */ }
    if (!this.sfx && typeof MMSfx !== 'undefined') {
      try { const f = MMSfx.create({ storage: localStorage, ctxFactory: () => this._actx }); f.setMusic(false); this.sfx = f; } catch (e) { /* ignore */ }
    }
  }

  _snd(name) {
    let f = this.sfx;
    if (!f) {
      if (!this._gesture || typeof MMSfx === 'undefined') return;
      try { f = this.sfx = MMSfx.create({ storage: localStorage, ctxFactory: () => this._actx }); f.setMusic(false); } catch (e) { return; }
    }
    try { f.play(name); } catch (e) { /* audio must never break the game */ }
  }

  // Effective screen shake in px (0 under reduced motion).
  shakeAmt() { return typeof MMMotion !== 'undefined' ? MMMotion.shake(this.shake, this._reduced) : (this._reduced ? 0 : this.shake); }

  // Index of the first active enemy whose hit circle contains (x, y), via the spatial hash; -1 if none.
  _boltHitIndex(x, y) {
    const h = this._hash;
    if (!h) { // fallback without the module
      for (let j = 0; j < this.enemies.length; j++) { const e = this.enemies[j]; if (!e.active) continue; const r = RM_ENEMIES[e.type].r + 5; if ((x - e.x) * (x - e.x) + (y - e.y) * (y - e.y) < r * r) return j; }
      return -1;
    }
    if (this._hashN !== this._spawnN) this._buildHash();
    this._hq.x = x; this._hq.y = y; this._hq.best = -1;
    h.query(x, y, 0, this._hitCb);
    return this._hq.best;
  }

  _buildHash() {
    const h = this._hash; h.clear();
    for (let j = 0; j < this.enemies.length; j++) { const e = this.enemies[j]; if (e.active) h.insert(j, e.x, e.y, RM_ENEMIES[e.type].r + 5); }
    this._hashN = this._spawnN;
  }

  // Gamepad: first connected pad feeds the same move/aim/fire/ability inputs as keyboard and touch.
  // Same mapping as MMPad.read, but written into one reused result object (MMPad.read allocates ~6 objects per call).
  _readPad() {
    this._pad = null;
    if (typeof MMPad === 'undefined' || typeof navigator === 'undefined' || !navigator.getGamepads) return this._padGone();
    let pads; try { pads = navigator.getGamepads(); } catch (e) { return this._padGone(); }
    if (!pads) return this._padGone();
    for (let i = 0; i < pads.length; i++) {
      const gp = pads[i]; if (!gp || gp.connected === false) continue;
      const b = gp.buttons || [];
      for (let k = 0; k < b.length; k++) if (b[k] && (b[k].pressed === true || b[k].value > 0.5)) { if (!this._actx || !this.sfx) this._unlockAudio(); break; } // a pad press counts as a gesture
      this._padWas = true;
      return (this._pad = MMPad.DEAD !== undefined ? this._padFill(gp) : MMPad.read(gp));
    }
    return this._padGone();
  }

  // The pad went away: forget its held buttons so a reconnect cannot fire a stale edge.
  _padGone() {
    if (this._padWas) { this._padPrev.fill(false); this._padPause = false; this._padWas = false; }
    return null;
  }

  _padFill(gp) {
    const r = this._padRes, a = gp.axes || [], b = gp.buttons || [], D = MMPad.DEAD;
    const dn = (x) => !!x && (x.pressed === true || (+x.value || 0) > 0.5);
    let x = +a[0] || 0, y = +a[1] || 0, m = Math.hypot(x, y);
    if (m <= D) { r.move.x = 0; r.move.y = 0; } else { const o = Math.min(1, (m - D) / (1 - D)); r.move.x = (x / m) * o; r.move.y = (y / m) * o; }
    x = +a[2] || 0; y = +a[3] || 0; m = Math.hypot(x, y);
    r.fire = m > MMPad.FIRE_AT || dn(b[7]);
    if (m <= D) { r.aim.x = 0; r.aim.y = 0; r.aim.on = false; } else { const o = Math.min(1, (m - D) / (1 - D)); r.aim.x = (x / m) * o; r.aim.y = (y / m) * o; r.aim.on = o > 0; }
    r.ability[0] = dn(b[0]) || dn(b[5]); r.ability[1] = dn(b[1]) || dn(b[4]); r.ability[2] = dn(b[2]); r.ability[3] = dn(b[3]);
    r.pause = dn(b[9]);
    return r;
  }

  // Start (button 9) opens / closes the pause + backpack panel, like B / Esc: one toggle per press.
  _padPauseEdge() {
    const on = !!(this._pad && this._pad.pause);
    if (on && !this._padPause) { if (this.panel || this.paused) this.setPaused(false); else this._panel('bp'); }
    this._padPause = on;
  }

  countActive(name) {
    let n = 0;
    const pool = this[name];
    for (let i = 0; i < pool.length; i++) if (pool[i].active) n++;
    return n;
  }

  // Stats = base + level + equipped items (recomputed when level / equipment changes, read every frame).
  _calcStats() {
    if (this.team && this.team.isPvp) { this.stats = { maxHp: RT_DUEL_HP, dmg: 1, rate: RT_DUEL_RATE, speed: RM_PLAYER.speed, shards: 1, xp: 1, iframes: 0.12 }; return this.stats; } // a duel is fought with identical stats: no gear, no level
    const st = { maxHp: RM_PLAYER.hp + RM_HP_PER_LEVEL * (this.save.level - 1), dmg: RM_PLAYER.dmg, rate: RM_PLAYER.fireRate, speed: RM_PLAYER.speed, shards: 1, xp: 1, iframes: RM_PLAYER.iframes };
    RM_SLOTS.forEach((slot) => {
      const uid = this.save.eq[slot];
      const it = uid && this.save.items.find((x) => x.n === uid);
      if (!it) return;
      const def = RM_ITEM_BY_ID[it.id]; const v = def.amount * RM_RARITIES[it.r].mult;
      if (def.stat === 'hp') st.maxHp += Math.round(v);
      else if (def.stat === 'dmg') st.dmg += v;
      else if (def.stat === 'rate') st.rate += v;
      else if (def.stat === 'speed') st.speed += v;
      else if (def.stat === 'shards') st.shards += v;
      else if (def.stat === 'xp') st.xp += v;
      else if (def.stat === 'iframes') st.iframes += v;
    });
    const hp = this.heroProfile; // additive class profile (setHeroProfile), applied after gear and level; never in duels (returned above)
    if (hp) { st.maxHp = Math.max(1, Math.round(st.maxHp * hp.hp)); st.dmg *= hp.dmg; st.rate *= hp.rate; st.speed *= hp.speed; st.iframes *= hp.iframes; }
    st.guard = this._calcGuard();
    this.stats = st;
    return st;
  }

  // Guard comes from the equipped items via MMStats (0 for every legacy item today); extraGuard is a test/future hook.
  _calcGuard() {
    let g = Number(this.extraGuard) || 0;
    if (typeof MMStats !== 'undefined') g += MMStats.fromLegacy(this.save).GRD;
    return g;
  }

  // Enemy bolt damage after guard: max(dmg - guard, 25% of dmg). Guard 0 leaves damage unchanged.
  _guarded(dmg) {
    const g = (this.stats && this.stats.guard) || 0;
    if (g <= 0) return dmg;
    if (typeof MMStats !== 'undefined') return MMStats.damageTaken(dmg, g);
    return Math.max(Math.ceil(dmg * 0.25), dmg - g);
  }

  // ---------- baked sprites ----------

  _bakeSprites() {
    const mk = (w, h, draw) => {
      const c = document.createElement('canvas');
      c.width = w; c.height = h;
      draw(c.getContext('2d'), w, h);
      return c;
    };
    this.sprites = {};
    // Hit-box dot: the tiny marker at the player's centre that shows what actually gets hit (baked once).
    this.sprites.hitDot = mk(8, 8, (g) => {
      g.fillStyle = '#fff'; g.beginPath(); g.arc(4, 4, 3.5, 0, Math.PI * 2); g.fill();
      g.fillStyle = '#ff3b6b'; g.beginPath(); g.arc(4, 4, 2.2, 0, Math.PI * 2); g.fill();
    });
    // Arena floor: a dark chunky tiled pattern, drawn once and repeated.
    this.sprites.floor = mk(64, 64, (g) => {
      const rnd = rmRng(77);
      for (let y = 0; y < 4; y++) for (let x = 0; x < 4; x++) {
        const v = 26 + Math.floor(rnd() * 10);
        g.fillStyle = `rgb(${v},${v - 8},${v + 24})`;
        g.fillRect(x * 16, y * 16, 16, 16);
        g.fillStyle = 'rgba(255,255,255,0.04)';
        g.fillRect(x * 16, y * 16, 16, 1);
        g.fillRect(x * 16, y * 16, 1, 16);
      }
    });
    this.sprites.floors = RM_BIOMES.map((b, bi) => mk(64, 64, (g) => {
      const rnd = rmRng(77 + bi * 13);
      for (let y = 0; y < 4; y++) for (let x = 0; x < 4; x++) {
        const v = Math.floor(rnd() * 10);
        g.fillStyle = `rgb(${b.floor[0] + v},${b.floor[1] + v - 4},${b.floor[2] + v})`;
        g.fillRect(x * 16, y * 16, 16, 16);
        g.fillStyle = 'rgba(255,255,255,0.045)';
        g.fillRect(x * 16, y * 16, 16, 1); g.fillRect(x * 16, y * 16, 1, 16);
      }
    }));
    this.sprites.hazard = { lava: mk(96, 96, (g) => {
      const gr = g.createRadialGradient(48, 48, 6, 48, 48, 46);
      gr.addColorStop(0, '#ffe27a'); gr.addColorStop(0.45, '#ff7a2a'); gr.addColorStop(0.85, '#a02a10'); gr.addColorStop(1, 'rgba(120,20,10,0)');
      g.fillStyle = gr; g.fillRect(0, 0, 96, 96);
    }), ice: mk(96, 96, (g) => {
      const gr = g.createRadialGradient(48, 48, 6, 48, 48, 46);
      gr.addColorStop(0, 'rgba(230,248,255,0.9)'); gr.addColorStop(0.7, 'rgba(150,210,255,0.55)'); gr.addColorStop(1, 'rgba(120,180,255,0)');
      g.fillStyle = gr; g.fillRect(0, 0, 96, 96);
      g.strokeStyle = 'rgba(255,255,255,0.7)'; g.lineWidth = 2;
      [[30, 30, 66, 60], [60, 28, 40, 66], [28, 56, 70, 40]].forEach(([a, b, c, d]) => { g.beginPath(); g.moveTo(a, b); g.lineTo(c, d); g.stroke(); });
    }) };
    this.sprites.drifter = { wisp: mk(24, 24, (g) => { const gr = g.createRadialGradient(12, 12, 1, 12, 12, 11); gr.addColorStop(0, '#fff'); gr.addColorStop(0.4, RM_DRIFTER_COLORS.wisp); gr.addColorStop(1, 'rgba(100,120,255,0)'); g.fillStyle = gr; g.fillRect(0, 0, 24, 24); g.fillStyle = '#1a1a40'; g.fillRect(8, 10, 2, 3); g.fillRect(14, 10, 2, 3); }),
      cinder: mk(24, 24, (g) => { const gr = g.createRadialGradient(12, 12, 1, 12, 12, 11); gr.addColorStop(0, '#fff3b0'); gr.addColorStop(0.45, RM_DRIFTER_COLORS.cinder); gr.addColorStop(1, 'rgba(255,80,20,0)'); g.fillStyle = gr; g.fillRect(0, 0, 24, 24); g.fillStyle = '#3a1000'; g.fillRect(8, 10, 2, 3); g.fillRect(14, 10, 2, 3); }),
      puff: mk(24, 24, (g) => { g.fillStyle = 'rgba(180,220,255,0.35)'; g.beginPath(); g.arc(12, 12, 11, 0, Math.PI * 2); g.fill(); g.fillStyle = RM_DRIFTER_COLORS.puff; g.beginPath(); g.arc(12, 13, 8, 0, Math.PI * 2); g.fill(); g.fillStyle = '#1a2a40'; g.fillRect(8, 11, 2, 3); g.fillRect(14, 11, 2, 3); }) };
    this.sprites.boss = mk(100, 100, (g) => {
      const gr = g.createRadialGradient(50, 50, 20, 50, 50, 50); gr.addColorStop(0, 'rgba(255,95,162,0.5)'); gr.addColorStop(1, 'rgba(255,95,162,0)'); g.fillStyle = gr; g.fillRect(0, 0, 100, 100);
      g.fillStyle = '#1a0f2a'; g.beginPath(); g.arc(50, 52, 36, 0, Math.PI * 2); g.fill();
      g.beginPath(); g.moveTo(22, 38); g.lineTo(14, 10); g.lineTo(38, 26); g.closePath(); g.fill(); g.beginPath(); g.moveTo(78, 38); g.lineTo(86, 10); g.lineTo(62, 26); g.closePath(); g.fill();
      g.fillStyle = '#ff5fa2'; g.beginPath(); g.arc(50, 52, 33, 0, Math.PI * 2); g.fill();
      g.fillStyle = '#ff5fa2'; g.beginPath(); g.moveTo(25, 36); g.lineTo(18, 14); g.lineTo(37, 28); g.closePath(); g.fill(); g.beginPath(); g.moveTo(75, 36); g.lineTo(82, 14); g.lineTo(63, 28); g.closePath(); g.fill();
      g.fillStyle = '#7a1a4a'; g.beginPath(); g.arc(50, 60, 18, 0, Math.PI); g.fill();
      g.fillStyle = '#fff'; g.fillRect(31, 40, 14, 10); g.fillRect(55, 40, 14, 10); g.fillStyle = '#2a0a1a'; g.fillRect(37, 43, 6, 6); g.fillRect(57, 43, 6, 6);
      g.fillStyle = '#1a0f2a'; g.fillRect(28, 36, 20, 4); g.fillRect(52, 36, 20, 4);
    });
    this.sprites.pBullet = mk(16, 16, (g) => {
      const gr = g.createRadialGradient(8, 8, 1, 8, 8, 8);
      gr.addColorStop(0, '#ffffff'); gr.addColorStop(0.45, '#8fe9ff'); gr.addColorStop(1, 'rgba(60,160,255,0)');
      g.fillStyle = gr; g.fillRect(0, 0, 16, 16);
    });
    const ebCols = [['#ffffff', '#ff6f91'], ['#ffffff', '#c58bff'], ['#ffffff', '#ffc65c']];
    this.sprites.eBullet = ebCols.map(([a, b]) => mk(16, 16, (g) => {
      const gr = g.createRadialGradient(8, 8, 1, 8, 8, 8);
      gr.addColorStop(0, a); gr.addColorStop(0.4, b); gr.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = gr; g.fillRect(0, 0, 16, 16);
    }));
    // Enemies: chunky pixel creatures with a bold dark outline, ~36px.
    const body = (g, color, shape) => {
      g.fillStyle = '#1a0f2a';
      shape(g, 2);
      g.fillStyle = color;
      shape(g, 0);
    };
    this.sprites.spiral = mk(44, 44, (g) => body(g, RM_ENEMIES.spiral.color, (c, pad) => {
      c.beginPath(); c.arc(22, 22, 16 + pad, 0, Math.PI * 2); c.fill();
      for (let i = 0; i < 6; i++) { const a = i * Math.PI / 3; c.beginPath(); c.arc(22 + Math.cos(a) * 17, 22 + Math.sin(a) * 17, 4 + pad, 0, Math.PI * 2); c.fill(); }
    }) || (g.fillStyle = '#fff', g.fillRect(16, 18, 4, 5), g.fillRect(25, 18, 4, 5), g.fillStyle = '#2a1245', g.fillRect(18, 20, 2, 3), g.fillRect(27, 20, 2, 3), g.fillRect(19, 28, 7, 2)));
    this.sprites.aimed = mk(36, 36, (g) => body(g, RM_ENEMIES.aimed.color, (c, pad) => {
      c.beginPath(); c.moveTo(18, 3 - pad); c.lineTo(33 + pad, 30 + pad); c.lineTo(3 - pad, 30 + pad); c.closePath(); c.fill();
    }) || (g.fillStyle = '#fff', g.fillRect(12, 18, 4, 5), g.fillRect(21, 18, 4, 5), g.fillStyle = '#3a0f0f', g.fillRect(14, 20, 2, 3), g.fillRect(23, 20, 2, 3)));
    this.sprites.ring = mk(40, 40, (g) => body(g, RM_ENEMIES.ring.color, (c, pad) => {
      c.beginPath(); c.arc(20, 20, 15 + pad, 0, Math.PI * 2); c.fill();
      c.fillRect(4 - pad, 18 - pad, 32 + pad * 2, 5 + pad * 2);
    }) || (g.fillStyle = '#fff', g.fillRect(13, 14, 5, 5), g.fillRect(22, 14, 5, 5), g.fillStyle = '#3a2a0f', g.fillRect(15, 16, 2, 3), g.fillRect(24, 16, 2, 3)));
    this.sprites.bag = RM_RARITIES.map((r) => mk(26, 26, (g) => {
      const gr = g.createRadialGradient(13, 13, 2, 13, 13, 13);
      gr.addColorStop(0, r.color); gr.addColorStop(1, 'rgba(0,0,0,0)');
      g.globalAlpha = 0.55; g.fillStyle = gr; g.fillRect(0, 0, 26, 26); g.globalAlpha = 1;
      g.fillStyle = '#1a0f2a'; g.fillRect(6, 9, 14, 12); g.fillRect(9, 6, 8, 4);
      g.fillStyle = r.color; g.fillRect(7, 10, 12, 10); g.fillRect(10, 7, 6, 3);
      g.fillStyle = '#fff'; g.fillRect(11, 13, 4, 4);
    }));
    this.sprites.playerFallback = mk(32, 32, (g) => {
      g.fillStyle = '#1a2a1a'; g.beginPath(); g.arc(16, 16, 13, 0, Math.PI * 2); g.fill();
      g.fillStyle = '#6fbf73'; g.beginPath(); g.arc(16, 16, 11, 0, Math.PI * 2); g.fill();
      g.fillStyle = '#fff'; g.fillRect(11, 13, 4, 5); g.fillRect(18, 13, 4, 5);
    });
  }

  // Draws one frame of the villager's sprite strip (same art as the 2D town and the cave avatar).
  setAvatar(url, frame, frameSize) {
    const img = new Image();
    img.onload = () => {
      const c = document.createElement('canvas');
      c.width = frameSize; c.height = frameSize;
      c.getContext('2d').drawImage(img, frame * frameSize, 0, frameSize, frameSize, 0, 0, frameSize, frameSize);
      this._avatar = c;
    };
    img.src = url;
  }

  // Additive hook: draw the player with a hero's animation set (MMArt). Pass (null) to go back to the plain sprite.
  setHeroArt(artSet, heroClass, scale) {
    this._heroArt = artSet && typeof artSet.anim === 'function' && typeof heroClass === 'string' ? artSet : null;
    this._heroClass = this._heroArt ? heroClass : null;
    this._heroScale = Number.isFinite(scale) && scale > 0 ? scale : 0.3125;
    this._heroSt = null; this._heroDbg = null;
  }
  // Additive hook: class stat multipliers {hp,dmg,rate,speed,iframes,name} from MMClasses.arenaProfile. null = today's behaviour. Ignored in team duels.
  setHeroProfile(profile) {
    const ok = profile && typeof profile === 'object';
    const m = (v) => (Number.isFinite(v) ? Math.max(0.7, Math.min(1.4, v)) : 1);
    this.heroProfile = ok ? { name: String(profile.name || '').slice(0, 40), hp: m(profile.hp), dmg: m(profile.dmg), rate: m(profile.rate), speed: m(profile.speed), iframes: m(profile.iframes) } : null;
    if (this.save) { this._calcStats(); if (this.player && this.player.hp > this.stats.maxHp) this.player.hp = this.stats.maxHp; if (this.active) this._syncHud(); }
  }
  // Additive hook: draw arena enemies / drifters with creature animations (MMArt.loadEnemies). Pass (null) to go back to the procedural sprites.
  // `map` / `driftMap` default to MMArt's ENEMY_MAP / DRIFTER_MAP. Never attached by the in-town gate.
  // Additive hook: show item art (MMArt.loadItems ItemSet) in the backpack, shop and equipped slots, emoji as fallback. null = emoji only.
  setItemArt(itemSet) {
    this._itemArt = itemSet && typeof itemSet.iconUrl === 'function' ? itemSet : null;
    if (this.paused && document.getElementById('realm-backpack-body')) this.renderBackpack();
  }
  // Icon markup for an item id: <img> from a trusted manifest url (never user data), else the emoji. Fallback on load error is wired by _fixIcons.
  _icon(def) {
    let url = null;
    try { url = this._itemArt ? this._itemArt.iconUrl(def.id) : null; } catch (e) { url = null; }
    if (!url || !/^[A-Za-z0-9_.\/-]+$/.test(url)) return def.icon;
    return `<img class="realm-ico" src="${url}" alt="" width="32" height="32" data-item="${def.id}" style="image-rendering:pixelated">`;
  }
  _fixIcons(root) {
    root.querySelectorAll('img.realm-ico').forEach((img) => {
      const def = RM_ITEM_BY_ID[img.dataset.item];
      const swap = () => { if (this._itemArt && this._itemArt.markBad) this._itemArt.markBad(img.dataset.item); img.replaceWith(document.createTextNode(def ? def.icon : '')); };
      if (img.complete && !img.naturalWidth) swap(); else img.addEventListener('error', swap, { once: true });
    });
  }

  setEnemyArt(artSet, map, driftMap) {
    const ok = artSet && typeof artSet.anim === 'function' && typeof artSet.draw === 'function';
    this._enemyArt = ok ? artSet : null;
    const A = typeof MMArt !== 'undefined' ? MMArt : null;
    this._enemyMap = ok ? (map || (A && A.ENEMY_MAP) || null) : null;
    this._driftMap = ok ? (driftMap || (A && A.DRIFTER_MAP) || null) : null;
    this._enemyVis = (A && A.ENEMY_VISIBLE_W) || 130;
    this._enemyDbg = null;
  }
  // Draws one enemy's creature animation; per-enemy state lives on the pooled enemy object (no allocation). Returns true when drawn.
  // Timing uses e.t (advanced only while the game runs), so pausing freezes the animation.
  _drawEnemyArt(g, e, def) {
    const art = this._enemyArt, name = this._enemyMap && this._enemyMap[e.type];
    if (!name) return false;
    if (e._at === undefined || e.t < e._lt) { e._at = -9; e._px = e.x; e._py = e.y; e._mvT = -9; e._dir = 'down'; e._flip = false; e._key = ''; e._t0 = 0; e._pcd = e.cd; e._atSeen = -9; }
    e._lt = e.t;
    const dx = e.x - e._px, dy = e.y - e._py; e._px = e.x; e._py = e.y;
    if (e.cd > e._pcd + 0.001) e._at = e.t; // the cooldown jumped up: it just fired
    e._pcd = e.cd;
    let moving = false;
    if (dx * dx + dy * dy > 0.0004) { e._mvT = e.t; moving = true; }
    const attacking = e.t - e._at < 0.3;
    let vx = dx, vy = dy;
    if (attacking || (!moving && e.t - e._mvT >= 0.15)) { const p = this.player; vx = p.x - e.x; vy = p.y - e.y; } // shooting / standing: face the player
    if (attacking || moving || e._key === '') { if (Math.abs(vy) > Math.abs(vx)) { e._dir = vy > 0 ? 'down' : 'up'; } else { e._dir = 'right'; e._flip = vx < 0; } }
    const action = attacking ? 'attack' : (e.t - e._mvT < 0.15 ? 'move' : 'idle');
    let a = art.anim(name, action, e._dir);
    let act = action;
    if (!a && action !== 'idle') { a = art.anim(name, 'idle', e._dir); act = 'idle'; }
    if (!a) return false;
    const key = act + e._dir;
    if (key !== e._key) { e._key = key; e._t0 = e.t; }
    if (act === 'attack' && e._atSeen !== e._at) { e._atSeen = e._at; e._t0 = e.t; }
    const t = this._reduced && act === 'idle' ? 0 : e.t - e._t0;
    const f = art.draw(g, a, t, e.x, e.y + def.r * 0.9, 2.8 * def.r / this._enemyVis, e._flip);
    if (this._enemyDbgOn) this._enemyDbg = { type: e.type, name, action: act, dir: e._dir, flip: e._flip, frame: f, id: a.id };
    return f >= 0;
  }
  // Additive hook: draw the arena boss with boss art (MMArt.loadBosses). `loader(name)` (optional) is called once per boss id that has no strips yet
  // so the page can load it lazily. setBossArt(null) goes back to the procedural Gloomheart. Never attached by the in-town gate.
  setBossArt(artSet, loader) {
    const ok = artSet && typeof artSet.anim === 'function' && typeof artSet.draw === 'function' && typeof artSet.has === 'function';
    this._bossArt = ok ? artSet : null;
    this._bossLoad = ok && typeof loader === 'function' ? loader : null;
    this._bossReq = ok ? Object.create(null) : null; this._bossDbg = null; this._bossGhost = null;
  }
  // Boss art id for this boss: tier (0-based) comes from the run wave, so the same wave always shows the same boss.
  _bossName(e) {
    if (e._bk !== 'boss' || e.t < e._lt) { e._bk = 'boss'; e._at = undefined; const A = typeof MMArt !== 'undefined' ? MMArt : null; const w = this.run && this.run.wave; e._bn = A && A.bossArtFor ? A.bossArtFor(Math.max(0, Math.round((Number(w) || 0) / RM_BOSS_EVERY) - 1)) : null; }
    return e._bn;
  }
  // Draws the live boss with art; per-boss state lives on the pooled enemy (no allocation). Timing uses e.t (game time), so pausing freezes it.
  // Actions: hit (flash) > attack_b (ring specials, phases 2/3) > attack_a (aimed fans, phase 3 spiral start) > move > idle.
  _drawBossArt(g, e) {
    const art = this._bossArt, name = this._bossName(e);
    if (!name) return false;
    if (!art.has(name)) { if (this._bossLoad && !this._bossReq[name]) { this._bossReq[name] = 1; try { this._bossLoad(name); } catch (err) { /* fallback */ } } return false; }
    if (e._at === undefined) { e._at = -9; e._bt = -9; e._ht = -9; e._mvT = -9; e._px = e.x; e._py = e.y; e._pcd = e.cd; e._pcd2 = e.cd2; e._pfl = 0; e._key = ''; e._t0 = 0; e._hSeen = -9; e._aSeen = -9; e._bSeen = -9; }
    e._lt = e.t;
    const dx = e.x - e._px, dy = e.y - e._py; e._px = e.x; e._py = e.y;
    if (e.invuln <= 0) { // a cooldown that jumped up means that pattern just fired
      const ph = e.phase;
      if (e.cd > e._pcd + 0.001 && ph === 2) e._bt = e.t; // ring of 20
      if (e.cd2 > e._pcd2 + 0.001) { if (ph === 3) e._bt = e.t; else e._at = e.t; } // phase 3 ring / the aimed fans
    }
    e._pcd = e.cd; e._pcd2 = e.cd2;
    if (e.flash > e._pfl + 0.001) e._ht = e.t; e._pfl = e.flash;
    let action = 'idle';
    if (e.t - e._ht < 0.22) action = 'hit';
    else if (e.t - e._bt < 0.5) action = 'attack_b';
    else if (e.t - e._at < 0.4) action = 'attack_a';
    else if (dx * dx + dy * dy > 0.0004) { e._mvT = e.t; action = 'move'; }
    else if (e.t - e._mvT < 0.15) action = 'move';
    let a = art.anim(name, action, 'down'), act = action;
    if (!a && action !== 'idle') { a = art.anim(name, 'idle', 'down'); act = 'idle'; }
    if (!a) return false;
    if (act !== e._key) { e._key = act; e._t0 = e.t; }
    if (act === 'hit' && e._hSeen !== e._ht) { e._hSeen = e._ht; e._t0 = e.t; }
    else if (act === 'attack_a' && e._aSeen !== e._at) { e._aSeen = e._at; e._t0 = e.t; }
    else if (act === 'attack_b' && e._bSeen !== e._bt) { e._bSeen = e._bt; e._t0 = e.t; }
    const t = this._reduced && act === 'idle' ? 0 : e.t - e._t0;
    const r = RM_ENEMIES.boss.r, vis = (typeof MMArt !== 'undefined' && MMArt.BOSS_VISIBLE_W) || 220;
    const f = art.draw(g, a, t, e.x, e.y + r * 1.5, 3 * r / vis, false);
    if (this._enemyDbgOn) this._bossDbg = { name, action: act, frame: f, id: a.id, phase: e.phase };
    return f >= 0;
  }
  // The boss death animation, played where the boss fell (the boss entity is already inactive). Uses this.clock (game time: freezes on pause).
  _drawBossGhost(g) {
    const gh = this._bossGhost; if (!gh) return;
    const a = this._bossArt && this._bossArt.anim(gh.name, 'death', 'down');
    const t = this.clock - gh.t0;
    if (!a || t > a.frames / a.fps + 0.8) { this._bossGhost = null; return; }
    const r = RM_ENEMIES.boss.r, vis = (typeof MMArt !== 'undefined' && MMArt.BOSS_VISIBLE_W) || 220;
    this._bossArt.draw(g, a, t, gh.x, gh.y + r * 1.5, 3 * r / vis, false);
  }
  _drawDrifterArt(g, d) {
    const name = this._driftMap && this._driftMap[d.kind];
    if (!name) return false;
    const a = this._enemyArt.anim(name, 'move', 'down') || this._enemyArt.anim(name, 'idle', 'down');
    if (!a) return false;
    return this._enemyArt.draw(g, a, this._reduced ? 0 : d.t, d.x, d.y + 12, 31 / this._enemyVis, false) >= 0;
  }
  // Picks the animation (dead > hurt > attack > walk > idle) and draws it feet-anchored at the player. Returns true when drawn.
  _drawHero(g, p) {
    const art = this._heroArt, cls = this._heroClass, now = performance.now() / 1000;
    const st = this._heroSt || (this._heroSt = { key: '', t0: now, dir: 'down', flip: false });
    const fromVec = (dx, dy) => { if (Math.abs(dy) > Math.abs(dx)) st.dir = dy > 0 ? 'down' : 'up'; else { st.dir = 'right'; st.flip = dx < 0; } };
    const atkAge = now - this._heroAtkAt;
    let action = 'idle';
    if (this.state === 'dead' || this.down) action = 'death';
    else if (now - this._heroHurtAt < 0.25) action = 'hit';
    else if (atkAge < 0.34) action = 'attack';
    else if (p.moving) action = 'walk';
    if (action === 'attack' || (action === 'hit' && atkAge < 0.34)) fromVec(Math.cos(p.aim), Math.sin(p.aim));
    else if (action === 'walk') fromVec(this._mx || 0, this._my || 0);
    const key = action + '_' + st.dir;
    if (key !== st.key) { st.key = key; st.t0 = now; }
    if (action === 'attack' && this._heroAtkSeen !== this._heroAtkAt) { this._heroAtkSeen = this._heroAtkAt; st.t0 = now; }
    let a = art.anim(cls, action, st.dir);
    if (!a && action !== 'idle') a = art.anim(cls, 'idle', st.dir);
    if (!a) { this._heroDbg = null; return false; }
    let t = now - st.t0;
    if (action === 'idle' && this._reduced) t = 0; // reduced motion: a static first frame
    const f = art.draw(g, a, t, p.x, p.y + 14, this._heroScale || 0.3125, st.flip);
    this._heroDbg = { action: a.id ? a.id.split('_')[1] : action, dir: st.dir, flip: st.flip, frame: f, id: a.id };
    return f >= 0;
  }

  // ---------- input ----------

  _bindInput() {
    this.onKeyDown = (e) => {
      if (!this.active) return;
      const k = e.key.toLowerCase();
      if (k === 'escape') { e.preventDefault(); if (this.paused || this.panel) this.setPaused(false); else this.leave(); return; }
      if (['arrowup', 'arrowdown', 'arrowleft', 'arrowright', ' '].includes(k)) e.preventDefault();
      if (!e.repeat) {
        const ai = RM_ABILITIES.findIndex((a) => a.key === k);
        if (ai >= 0) { this.cast(ai); return; }
        if (k === 'b' || k === 'i') { this._panel(this.panel === 'bp' ? null : 'bp'); return; }
        if (k === 'k') { this._panel(this.panel === 'board' ? null : 'board'); return; }
        if (k === 'v') { this._panel(this.panel === 'shop' ? null : 'shop'); return; }
      }
      this.keys[k] = true;
    };
    this.onKeyUp = (e) => { this.keys[e.key.toLowerCase()] = false; };
    this.onBlur = () => { this.keys = {}; this.mouse.down = false; };
    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
    window.addEventListener('blur', this.onBlur);
    this._onGesture = () => { this._unlockAudio(); };
    ['keydown', 'pointerdown', 'touchstart', 'touchend', 'click'].forEach((ev) => window.addEventListener(ev, this._onGesture, { capture: true, passive: true }));

    const toArena = (e) => {
      const r = this.canvas.getBoundingClientRect();
      this.mouse.x = ((e.clientX - r.left) / r.width) * this.W;
      this.mouse.y = ((e.clientY - r.top) / r.height) * this.H;
      this.mouse.seen = true;
    };
    this.onPointerMove = (e) => { if (e.pointerType === 'mouse') toArena(e); };
    this.onPointerDown = (e) => { if (e.pointerType === 'mouse') { toArena(e); this.mouse.down = true; } };
    this.onPointerUp = (e) => { if (e.pointerType === 'mouse') this.mouse.down = false; };
    this.canvas.addEventListener('pointermove', this.onPointerMove);
    this.canvas.addEventListener('pointerdown', this.onPointerDown);
    window.addEventListener('pointerup', this.onPointerUp);
    this.canvas.addEventListener('contextmenu', (e) => e.preventDefault());

    this.onResize = () => { if (this.active) this._resize(); };
    window.addEventListener('resize', this.onResize);
  }

  // Touch sticks are DOM elements (set up by main.js); they only feed these two vectors.
  setMoveStick(x, y) { this.moveVec.x = x; this.moveVec.y = y; }
  setAimStick(x, y, on) { this.aimVec.x = x; this.aimVec.y = y; this.aimVec.on = !!on; }

  _resize() {
    const w = this.container.clientWidth || window.innerWidth;
    const h = this.container.clientHeight || window.innerHeight;
    const aspect = w / h;
    if (this.fixedWorld) { // a fixed-size world (a dungeon room): letterboxed, never stretched
      this.W = this.fixedWorld.w; this.H = this.fixedWorld.h;
      const k = Math.min(w / this.W, h / this.H); const cs = this.canvas.style;
      cs.position = 'absolute'; cs.width = `${Math.floor(this.W * k)}px`; cs.height = `${Math.floor(this.H * k)}px`;
      cs.left = `${Math.floor((w - this.W * k) / 2)}px`; cs.top = `${Math.floor((h - this.H * k) / 2)}px`;
      const dpr0 = Math.min(window.devicePixelRatio || 1, 2);
      this.canvas.width = Math.round(this.W * Math.min(dpr0, 1.5)); this.canvas.height = Math.round(this.H * Math.min(dpr0, 1.5));
      this.scale = this.canvas.width / this.W; this._vignette = null;
      const q = this.player; q.x = Math.max(RM_PLAYER.r, Math.min(this.W - RM_PLAYER.r, q.x || this.W / 2)); q.y = Math.max(RM_PLAYER.r, Math.min(this.H - RM_PLAYER.r, q.y || this.H / 2));
      return;
    }
    // Short side is always RM_SHORT logical units; the long side follows the screen.
    if (aspect >= 1) { this.H = RM_SHORT; this.W = Math.round(Math.min(1400, Math.max(RM_SHORT, RM_SHORT * aspect))); } else { this.W = RM_SHORT; this.H = Math.round(Math.min(1400, Math.max(RM_SHORT, RM_SHORT / aspect))); }
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.canvas.width = Math.round(this.W * Math.min(dpr, 1.5));
    this.canvas.height = Math.round(this.H * Math.min(dpr, 1.5));
    this.canvas.style.width = '100%';
    this.canvas.style.height = '100%';
    this.scale = this.canvas.width / this.W;
    this._vignette = null; // rebuilt for the new size on next draw
    const p = this.player;
    p.x = Math.max(RM_PLAYER.r, Math.min(this.W - RM_PLAYER.r, p.x || this.W / 2));
    p.y = Math.max(RM_PLAYER.r, Math.min(this.H - RM_PLAYER.r, p.y || this.H / 2));
  }

  // ---------- lifecycle ----------

  start() {
    this.active = true;
    this.resyncSave(); // pick up progress another tab saved while this arena sat idle
    this._resize();
    [this.pBullets, this.eBullets, this.enemies, this.particles, this.texts, this.bags, this.drifters, this.hazards].forEach((pool) => pool.forEach((o) => { o.active = false; }));
    this._wireRefresh(); this._padPrev.fill(false);
    this.keys = {}; this.mouse.down = false; this.moveVec.x = 0; this.moveVec.y = 0; this.aimVec.on = false; this.aimVec.x = 0; this.aimVec.y = 0; // no stuck input from the last run
    const p = this.player;
    this._calcStats();
    this.abilityCd = [0, 0, 0, 0]; this.shield.hits = 0; this.shield.t = 0; this.overdriveT = 0; this.paused = false;
    p.x = this.W / 2; p.y = this.H / 2; p.hp = this.stats.maxHp; p.dashT = 0; p.iframes = 1; p.fireCd = 0; p.aim = -Math.PI / 2;
    this.run = { wave: 0, kills: 0, shards: 0 };
    this.biome = 0; this.clock = 0; this._speedMul = 1; this.down = false; this.reviveT = 0; this._syncBoss();
    this.shake = 0; this.flash = 0;
    this.displayShards = this.save.shards;
    this.state = 'banner';
    this.bannerT = 1.4;
    this.bannerText = this.team && this.team.isPvp ? (this.team.mode === '2v2' ? '2v2 — first to 2 rounds!' : 'Duel — first to 2 rounds!') : 'Realm — survive the waves!';
    if (this.team && this.team.isPvp) { this.state = 'play'; this.run.wave = 1; this.team.duelReset(); }
    this.nextWaveIn = 1.4;
    this._syncHud(true);
    this._showBanner(this.bannerText);
    if (this.dungeon && !this.team) { this.state = 'play'; this.dungeon.onStart(); }
    this._lastT = performance.now();
    this._raf = requestAnimationFrame(this._loop);
  }

  stop() {
    this.active = false;
    if (this.team) { this.team.close(); this.team = null; this.role = 'solo'; }
    const pe = document.getElementById('realm-partner'); if (pe) pe.classList.add('hidden');
    this.keys = {};
    this.mouse.down = false;
    this.aimVec.on = false; this.moveVec.x = 0; this.moveVec.y = 0;
    if (this._raf) cancelAnimationFrame(this._raf);
    clearTimeout(this._bannerTimer);
    this._panel(null); // never leave a panel covering a stopped run
    this._hideBanner();
  }

  destroy() {
    this.stop();
    window.removeEventListener('keydown', this.onKeyDown);
    window.removeEventListener('keyup', this.onKeyUp);
    window.removeEventListener('blur', this.onBlur);
    ['keydown', 'pointerdown', 'touchstart', 'touchend', 'click'].forEach((ev) => window.removeEventListener(ev, this._onGesture, { capture: true }));
    window.removeEventListener('pointerup', this.onPointerUp);
    window.removeEventListener('resize', this.onResize);
    if (this.canvas.parentNode) this.canvas.parentNode.removeChild(this.canvas);
  }

  // Leave on your own terms: no penalty, shards stay banked.
  leave() {
    if (!this.active) return;
    this._finishRun();
    this.stop();
    this.onExit('leave');
  }

  _finishRun() {
    this.onSave(this.save);
  }

  _loop = (now) => {
    if (!this.active) return;
    const dt = Math.min((now - this._lastT) / 1000, 0.05);
    this._lastT = now;
    this._update(dt);
    this._draw();
    if (this.active) this._raf = requestAnimationFrame(this._loop); // a death exit inside _update must not leave a second loop
  };

  // ---------- spawning ----------

  enemiesAlive() { return this.countActive('enemies'); }

  spawnEnemy(type, x, y) {
    const e = this._take(this.enemies);
    if (!e) return null;
    const def = RM_ENEMIES[type];
    const scale = (1 + 0.15 * Math.max(0, this.run.wave - 1)) * (this.team && this.role === 'host' ? RT_HP_SCALE : 1); // tougher with a partner
    e.active = true; e.type = type; e.x = x; e.y = y;
    e.maxHp = Math.ceil(def.hp * scale); e.hp = e.maxHp;
    e.dg = null; e.t = 0; e.flash = 0; e.angle = this.rng() * Math.PI * 2; e.dir = this.rng() < 0.5 ? 1 : -1;
    e.cd = 0.8 + this.rng() * 0.8; // first shot is never instant
    e.ax = 80 + this.rng() * (this.W - 160); e.ay = 80 + this.rng() * (this.H - 160); // drift target for Whirlers
    return e;
  }

  _startWave() {
    this.run.wave += 1;
    const wave = this.run.wave;
    const bi = rmBiomeIndex(wave); const biome = RM_BIOMES[bi]; const changed = bi !== this.biome || wave === 1;
    this.biome = bi;
    this.drifters.forEach((d) => { d.active = false; });
    this._layHazards(biome);
    this._spawnDrifters(biome);
    if (wave % RM_BOSS_EVERY === 0) {
      this._spawnBoss();
    } else {
      const n = Math.min(2 + wave, 10);
      const order = biome.mix;
      for (let i = 0; i < n; i++) {
        const type = wave === 1 ? ['aimed', 'aimed', 'ring'][i % 3] : order[(i + Math.floor(this.rng() * order.length)) % order.length];
        let x; let y; let tries = 0; // spawn on the arena rim, away from the player
        do {
          const a = this.rng() * Math.PI * 2;
          x = this.W / 2 + Math.cos(a) * (this.W / 2 - 40);
          y = this.H / 2 + Math.sin(a) * (this.H / 2 - 40);
        } while (Math.hypot(x - this.player.x, y - this.player.y) < 220 && ++tries < 12);
        this.spawnEnemy(type, x, y);
      }
    }
    this._syncBoss();
    this.state = 'play';
    this._showBanner(wave % RM_BOSS_EVERY === 0 ? `Wave ${wave} — ${RM_ENEMIES.boss.name}!` : changed ? `Wave ${wave} — ${biome.name}` : `Wave ${wave}`, 1.4, true);
    this._syncHud();
  }

  // Lava (Ember) burns, ice (Frost) slows; Hollow has no hazard. Placed away from the player, not overlapping.
  _layHazards(biome) {
    this.hazards.forEach((h) => { h.active = false; });
    if (!biome.hazard) return;
    const placed = [];
    for (let i = 0; i < 3; i++) {
      for (let tries = 0; tries < 20; tries++) {
        const x = 90 + this.rng() * (this.W - 180); const y = 90 + this.rng() * (this.H - 180);
        if (Math.hypot(x - this.player.x, y - this.player.y) < 130) continue;
        if (placed.some((p) => Math.hypot(p.x - x, p.y - y) < RM_HAZARD_R * 2.2)) continue;
        const h = this._take(this.hazards); if (!h) break;
        h.active = true; h.x = x; h.y = y; h.kind = biome.hazard; h.tick = 0; placed.push(h); break;
      }
    }
  }

  // Harmless wandering critters: shoot them for a few shards and a bit of XP. They don't count toward clearing the wave.
  _spawnDrifters(biome) {
    const n = 3 + Math.floor(this.rng() * 3);
    for (let i = 0; i < n; i++) {
      const d = this._take(this.drifters); if (!d) return;
      d.active = true; d.kind = biome.drifter; d.x = 60 + this.rng() * (this.W - 120); d.y = 60 + this.rng() * (this.H - 120);
      d.t = this.rng() * 6; d.turn = 0;
    }
  }

  _spawnBoss() {
    const tier = this.run.wave / RM_BOSS_EVERY;
    const e = this.spawnEnemy('boss', this.W / 2, 132);
    if (!e) return null;
    e.maxHp = Math.ceil((RM_BOSS_HP + RM_BOSS_HP_TIER * (tier - 1)) * (this.team && this.role === 'host' ? RT_HP_SCALE : 1)); e.hp = e.maxHp; e.phase = 1; e.invuln = 1.2; e.cd = 1.2; e.cd2 = 2.4; e.angle = 0;
    this.bossT0 = this.clock;
    this._syncBoss();
    return e;
  }

  _boss() { for (let i = 0; i < this.enemies.length; i++) if (this.enemies[i].active && this.enemies[i].type === 'boss') return this.enemies[i]; return null; }

  _syncBoss() {
    const el = document.getElementById('realm-boss');
    if (!el) return;
    const b = this._boss();
    el.classList.toggle('hidden', !b);
    if (!b) return;
    const f = document.getElementById('realm-boss-fill'); if (f) f.style.width = `${Math.max(0, b.hp) / b.maxHp * 100}%`;
    const n = document.getElementById('realm-boss-name'); if (n) n.textContent = `${RM_ENEMIES.boss.name} · phase ${b.phase}`;
    el.dataset.phase = String(b.phase);
  }

  fireEnemyBullet(x, y, angle, speed, kind) {
    const b = this._take(this.eBullets);
    if (!b) return;
    if (this.team && this.role === 'host') this.team.ev('fe', [Math.round(x), Math.round(y), Math.round(angle * 1000) / 1000, speed, kind || 0]);
    b.active = true; b.x = x; b.y = y; b.vx = Math.cos(angle) * speed; b.vy = Math.sin(angle) * speed; b.life = 6; b.kind = kind || 0;
  }

  firePlayerBullet(angle) { this.firePlayerBulletFrom(this.player.x, this.player.y, angle, this.stats.dmg, 0); }

  // owner 0 = you (host), 1 = your partner. Everything a bolt does is decided on the host; guests only draw them.
  firePlayerBulletFrom(x, y, angle, dmg, owner) {
    const b = this._take(this.pBullets);
    if (!b) return;
    if (this.team && this.role === 'host') this.team.ev('fp', [Math.round(x), Math.round(y), Math.round(angle * 1000) / 1000, Math.round(dmg * 10) / 10], owner);
    b.active = true; b.x = x + Math.cos(angle) * 14; b.y = y + Math.sin(angle) * 14; b.dmg = dmg; b.own = owner;
    b.vx = Math.cos(angle) * RM_PLAYER.bulletSpeed; b.vy = Math.sin(angle) * RM_PLAYER.bulletSpeed; b.life = RM_PLAYER.bulletLife;
  }

  _burst(x, y, color, n, speed) {
    for (let i = 0; i < n; i++) {
      const pt = this._take(this.particles);
      if (!pt) return;
      const a = this.rng() * Math.PI * 2; const sp = speed * (0.3 + this.rng() * 0.7);
      pt.active = true; pt.x = x; pt.y = y; pt.vx = Math.cos(a) * sp; pt.vy = Math.sin(a) * sp; pt.life = pt.max = 0.35 + this.rng() * 0.35; pt.color = color; pt.size = 2 + Math.floor(this.rng() * 3);
    }
  }

  _floatText(x, y, text, color) {
    const t = this._take(this.texts);
    if (!t) return;
    t.active = true; t.x = x; t.y = y; t.vy = -48; t.life = 0.7; t.text = text; t.color = color;
  }

  // ---------- simulation ----------

  _update(dt) {
    this._readReduced();
    if (this.paused) { this._readPad(); this._padPauseEdge(); return; } // backpack open (Start can still close it)
    const p = this.player;
    this.shake = Math.max(0, this.shake - dt * 30);
    this.flash = Math.max(0, this.flash - dt * 2.2);
    if (this.displayShards !== this.save.shards) { // the shard counter ticks up (or down) instead of jumping
      const d = this.save.shards - this.displayShards;
      this.displayShards += Math.sign(d) * Math.max(1, Math.ceil(Math.abs(d) * Math.min(1, dt * 6)));
      if (Math.sign(this.save.shards - this.displayShards) !== Math.sign(d)) this.displayShards = this.save.shards;
      this._syncHud();
    }

    // Particles and floating numbers keep animating in every state.
    for (let i = 0; i < this.particles.length; i++) {
      const pt = this.particles[i];
      if (!pt.active) continue;
      pt.life -= dt;
      if (pt.life <= 0) { pt.active = false; continue; }
      pt.x += pt.vx * dt; pt.y += pt.vy * dt; pt.vx *= 0.94; pt.vy *= 0.94;
    }
    for (let i = 0; i < this.texts.length; i++) {
      const t = this.texts[i];
      if (!t.active) continue;
      t.life -= dt;
      if (t.life <= 0) { t.active = false; continue; }
      t.y += t.vy * dt;
    }

    if (this.role === 'guest' && this.team) { // the guest only moves itself; the host runs everything else
      this._guestSlow();
      this._updatePlayer(dt);
      this._updateAbilities(dt);
      this.team.guestTick(dt);
      this._syncBoss();
      return;
    }

    if (this.state === 'dead') {
      this.deadT -= dt;
      if (this.deadT <= 0) { this.stop(); this.onExit('death'); }
      return;
    }

    if (this.team && this.role === 'host' && this.team.isPvp) { // a duel: no waves, enemies or hazards
      this.clock += dt;
      this._updatePlayer(dt); this._updateAbilities(dt); this._updateBullets(dt);
      this.team.hostTick(dt); this.team.duelTick(dt);
      return;
    }
    this.clock += dt;
    this._updateHazards(dt);
    this._updatePlayer(dt);
    if (this.state === 'banner') {
      this.nextWaveIn -= dt;
      if (this.nextWaveIn <= 0) this._startWave();
    }
    this._updateAbilities(dt);
    this._updateEnemies(dt);
    this._updateDrifters(dt);
    this._updateBullets(dt);
    this._updateBags(dt);
    if (this.dungeon) this.dungeon.tick(dt);
    if (this.team && this.role === 'host') this.team.hostTick(dt);
    if (this.state === 'play' && this.run.wave > 0 && this.enemiesAlive() === 0) this._waveCleared();
  }

  // ---------- tile walls (optional; null = open arena, the default) ----------
  // rows: array of strings ('#' = wall) or arrays of 0/1, row-major, RM_TILE px per tile from the arena's top-left.
  setWalls(rows) {
    if (!rows || !rows.length) { this.walls = null; return; }
    const cells = rows.map((r) => Array.from(r, (c) => (c === '#' || c === 1 || c === true ? 1 : 0)));
    this.walls = { rows: cells.length, cols: cells.reduce((m, r) => Math.max(m, r.length), 0), cells };
  }

  isWallAt(x, y) {
    const w = this.walls; if (!w) return false;
    const c = Math.floor(x / RM_TILE); const r = Math.floor(y / RM_TILE);
    return r >= 0 && c >= 0 && r < w.rows && c < w.cols && w.cells[r][c] === 1;
  }

  // Does a circle of radius rad at (x, y) overlap any wall tile? (AABB of the circle against tiles)
  _blocked(x, y, rad) {
    if (!this.walls) return false;
    const c0 = Math.floor((x - rad) / RM_TILE); const c1 = Math.floor((x + rad) / RM_TILE);
    const r0 = Math.floor((y - rad) / RM_TILE); const r1 = Math.floor((y + rad) / RM_TILE);
    for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) if (this.isWallAt(c * RM_TILE + 1, r * RM_TILE + 1)) return true;
    return false;
  }

  // Move the player by (dx, dy), each axis on its own so a diagonal push into a wall slides along it.
  _movePlayer(dx, dy) {
    const p = this.player; const R = RM_PLAYER.r;
    const clampX = (v) => Math.max(R, Math.min(this.W - R, v)); const clampY = (v) => Math.max(R, Math.min(this.H - R, v));
    if (!this.walls) { p.x = clampX(p.x + dx); p.y = clampY(p.y + dy); return; }
    const stuck = this._blocked(p.x, p.y, R); // already inside a wall (grid set under us): let the player walk out
    const nx = clampX(p.x + dx); if (stuck || !this._blocked(nx, p.y, R)) p.x = nx;
    const ny = clampY(p.y + dy); if (stuck || !this._blocked(p.x, ny, R)) p.y = ny;
  }

  _updatePlayer(dt) {
    const p = this.player;
    p.iframes = Math.max(0, p.iframes - dt);
    let mx = this.moveVec.x; let my = this.moveVec.y;
    if (this.keys.a || this.keys.arrowleft) mx -= 1;
    if (this.keys.d || this.keys.arrowright) mx += 1;
    if (this.keys.w || this.keys.arrowup) my -= 1;
    if (this.keys.s || this.keys.arrowdown) my += 1;
    const pad = this._readPad(); this._padPauseEdge();
    if (pad) { mx += pad.move.x; my += pad.move.y; }
    if (this.down) { mx = 0; my = 0; } // downed: no moving or shooting until revived
    const len = Math.hypot(mx, my);
    p.moving = len > 0.05;
    if (len > 1) { mx /= len; my /= len; }
    this._movePlayer(mx * this.stats.speed * this._speedMul * dt, my * this.stats.speed * this._speedMul * dt);
    this._mx = mx; this._my = my;
    if (mx) p.facing = mx > 0 ? 1 : -1;
    p.bob = p.moving ? p.bob + dt * 14 : 0;

    // Twin-stick aim: the right stick wins, otherwise the mouse pointer.
    let firing = false;
    if (pad && pad.aim.on) { p.aim = Math.atan2(pad.aim.y, pad.aim.x); firing = pad.fire; } else if (this.aimVec.on && Math.hypot(this.aimVec.x, this.aimVec.y) > 0.25) {
      p.aim = Math.atan2(this.aimVec.y, this.aimVec.x); firing = true;
      if (this._aimAssist && typeof MMAim !== 'undefined') { // touch aim assist: snap to the nearest enemy within the cone
        const t = this._aimTargets; t.length = 0;
        for (let i = 0; i < this.enemies.length; i++) if (this.enemies[i].active) t.push(this.enemies[i]);
        p.aim = MMAim.assist(p.aim, p, t, { enabled: true, tile: RM_TILE });
      }
    } else if (this.mouse.seen) {
      p.aim = Math.atan2(this.mouse.y - p.y, this.mouse.x - p.x);
      firing = this.mouse.down || !!this.keys[' '];
    } else if (this.keys[' ']) firing = true;
    if (pad && pad.fire) firing = true;
    if (pad) { for (let i = 0; i < 4; i++) { const on = !!pad.ability[i]; if (on && !this._padPrev[i]) this.cast(i); this._padPrev[i] = on; } }
    if (this.down) firing = false;
    this._firing = firing;
    p.fireCd -= dt;
    if (firing && p.fireCd <= 0 && this.state !== 'dead') {
      p.fireCd = 1 / (this.stats.rate * (this.overdriveT > 0 ? 2 : 1));
      this.firePlayerBullet(p.aim);
      this._heroAtkAt = performance.now() / 1000;
      this._snd('shot');
    }
  }

  // Guest: only the ice slows us locally (the host owns all damage).
  _guestSlow() {
    const p = this.player; let slow = 1;
    for (let i = 0; i < this.hazards.length; i++) { const h = this.hazards[i]; if (h.active && h.kind === 'ice' && Math.hypot(p.x - h.x, p.y - h.y) < RM_HAZARD_R - 4) slow = RM_ICE_SLOW; }
    this._speedMul = slow;
  }

  _updateHazards(dt) {
    const p = this.player; let slow = 1;
    for (let i = 0; i < this.hazards.length; i++) {
      const h = this.hazards[i];
      if (!h.active) continue;
      const inside = Math.hypot(p.x - h.x, p.y - h.y) < RM_HAZARD_R - 4;
      if (h.kind === 'ice' && inside) slow = RM_ICE_SLOW;
      if (h.kind === 'lava') {
        if (inside && this.state === 'play') { h.tick += dt; if (h.tick >= RM_LAVA_TICK && p.iframes <= 0) { h.tick = 0; this._floatText(p.x, p.y - 30, '🔥', '#ffa04a'); this._hitPlayer(RM_LAVA_DAMAGE); } } else h.tick = Math.min(h.tick, RM_LAVA_TICK * 0.6);
      }
    }
    this._speedMul = slow;
  }

  _updateDrifters(dt) {
    for (let i = 0; i < this.drifters.length; i++) {
      const d = this.drifters[i];
      if (!d.active) continue;
      d.t += dt; d.turn -= dt;
      if (d.turn <= 0) { d.turn = 1.2 + this.rng() * 1.8; const a = this.rng() * Math.PI * 2; d.vx = Math.cos(a) * 46; d.vy = Math.sin(a) * 46; }
      d.x += d.vx * dt; d.y += d.vy * dt;
      if (d.x < 20 || d.x > this.W - 20) { d.vx = -d.vx; d.x = Math.max(20, Math.min(this.W - 20, d.x)); }
      if (d.y < 20 || d.y > this.H - 20) { d.vy = -d.vy; d.y = Math.max(20, Math.min(this.H - 20, d.y)); }
    }
  }

  _hitDrifter(d, dmg) {
    d.active = false;
    const gain = Math.max(1, Math.round(this.stats.shards));
    this.run.shards += gain; this.save.shards += gain; this.save.kb.drifter += 1;
    if (this.team) this.team.ev('rew', [1, 2, 'drifter']);
    this._burst(d.x, d.y, RM_DRIFTER_COLORS[d.kind], 8, 160);
    this._floatText(d.x, d.y - 14, `+${gain} 💎`, '#8fe9ff');
    this._gainXp(Math.max(1, Math.round(2 * this.stats.xp)));
    this.onSave(this.save);
  }

  _updateBoss(e, dt) {
    e.invuln = Math.max(0, e.invuln - dt);
    const p = this._nearest(e.x, e.y);
    const fast = e.phase === 3 ? 1.35 : 1;
    e.x = this.W / 2 + Math.sin(e.t * 0.6 * fast) * (this.W * 0.3);
    e.y = 132 + Math.sin(e.t * 0.9 * fast) * 22; // below the HUD, even on a phone
    if (e.invuln > 0) return; // a phase change makes it pause, shielded
    e.cd -= dt; e.cd2 -= dt;
    if (e.phase === 1) { // three-armed spiral + aimed fans
      if (e.cd <= 0) { e.cd = 0.14; e.angle += 0.28; for (let k = 0; k < 3; k++) this.fireEnemyBullet(e.x, e.y, MMPatterns.spiralAngle(e.angle, k, 3), 140, 1); }
      if (e.cd2 <= 0) { e.cd2 = 2.4; const a = Math.atan2(p.y - e.y, p.x - e.x); for (let k = 0; k < 5; k++) this.fireEnemyBullet(e.x, e.y, MMPatterns.aimedAngle(a, k, 5, 0.72), 230, 0); }
    } else if (e.phase === 2) { // rings of 20, aimed fans between them
      if (e.cd <= 0) { e.cd = 1.9; const ph = this.rng() * Math.PI * 2; for (let k = 0; k < 20; k++) this.fireEnemyBullet(e.x, e.y, MMPatterns.ringAngle(k, 20, ph), 135, 2); }
      if (e.cd2 <= 0) { e.cd2 = 1.9; e.angle = 0; const a = Math.atan2(p.y - e.y, p.x - e.x); for (let k = 0; k < 3; k++) this.fireEnemyBullet(e.x, e.y, MMPatterns.aimedAngle(a, k, 3, 0.4), 225, 0); e.cd2 = 1.9; e.cd = Math.max(e.cd, 0.9); }
    } else { // enraged: a double spiral and rings
      if (e.cd <= 0) { e.cd = 0.1; e.angle += 0.4; this.fireEnemyBullet(e.x, e.y, e.angle, 150, 1); this.fireEnemyBullet(e.x, e.y, MMPatterns.spiralAngle(e.angle, 1, 2), 150, 1); }
      if (e.cd2 <= 0) { e.cd2 = 2.2; const ph = this.rng() * Math.PI * 2; for (let k = 0; k < 16; k++) this.fireEnemyBullet(e.x, e.y, MMPatterns.ringAngle(k, 16, ph), 150, 2); }
    }
  }

  _bossPhase(e, phase) {
    e.phase = phase; e.invuln = 1.0; e.cd = 1.1; e.cd2 = 2.0;
    this.eBullets.forEach((b) => { if (b.active) { b.active = false; this._burst(b.x, b.y, '#ff5fa2', 1, 60); } });
    this.shake = 12; this._burst(e.x, e.y, '#ff5fa2', 30, 280);
    this._showBanner(phase === 2 ? 'Gloomheart — it summons help!' : 'Gloomheart — ENRAGED!', 1.6, true);
    if (this.team) { this.team.ev('clr', []); this.team.ev('fx', [12]); }
    if (phase === 2) { for (let k = 0; k < 2; k++) { const a = this.spawnEnemy('aimed', k ? this.W - 60 : 60, 140); if (a) a.cd = 1.5; } }
  }

  _bossDefeated(e) {
    const tier = this.run.wave / RM_BOSS_EVERY;
    const gain = Math.max(1, Math.round((40 + 10 * tier) * this.stats.shards));
    this.run.shards += gain; this.save.shards += gain; this.run.kills += 1; this.save.kills += 1; this.save.kb.boss += 1;
    const tenths = Math.max(1, Math.round((this.clock - this.bossT0) * 10));
    const newBest = !this.save.bossBestT || tenths < this.save.bossBestT;
    if (newBest) this.save.bossBestT = tenths;
    this.eBullets.forEach((b) => { if (b.active) { b.active = false; this._burst(b.x, b.y, '#ffe27a', 1, 60); } });
    this._burst(e.x, e.y, '#ff5fa2', 40, 340); this._burst(e.x, e.y, '#ffe27a', 30, 260);
    this.shake = 14;
    this._floatText(e.x, e.y - 30, `+${gain} 💎`, '#8fe9ff');
    this._gainXp(Math.round(RM_XP.boss * tier * this.stats.xp));
    this.dropBag(e.x - 20, e.y + 20, 2); this.dropBag(e.x + 20, e.y + 20, this.rollRarity()); // a guaranteed rare, plus one more
    this._showBanner(`Gloomheart defeated!  +${gain} 💎${newBest ? '  New best time!' : ''}`, 2.4, true);
    if (this.team) { this.team.ev('rew', [40 + 10 * tier, RM_XP.boss * tier, 'boss', 1, tenths]); this.team.ev('clr', []); }
    this.onSave(this.save);
    this._syncBoss();
  }

  _updateEnemies(dt) {
    for (let i = 0; i < this.enemies.length; i++) {
      const e = this.enemies[i];
      if (!e.active) continue;
      const p = this._nearest(e.x, e.y);
      e.t += dt; e.flash = Math.max(0, e.flash - dt * 6);
      if (e.type === 'boss') { this._updateBoss(e, dt); continue; }
      e.cd -= dt;
      const dx = p.x - e.x; const dy = p.y - e.y; const dist = Math.hypot(dx, dy) || 1;
      if (e.type === 'spiral') {
        // Drifts toward its anchor and keeps spinning out a steady spiral.
        const ax = e.ax - e.x; const ay = e.ay - e.y; const ad = Math.hypot(ax, ay);
        if (ad > 8) { e.x += (ax / ad) * RM_ENEMIES.spiral.speed * dt; e.y += (ay / ad) * RM_ENEMIES.spiral.speed * dt; }
        if (e.cd <= 0) { e.cd = 0.09; e.angle += 0.47; this.fireEnemyBullet(e.x, e.y, e.angle, 150, 1); }
      } else if (e.type === 'aimed') {
        // Circles the player at a distance and fires aimed three-bolt bursts.
        const want = dist > 280 ? 1 : dist < 200 ? -1 : 0;
        const tx = -dy / dist * e.dir; const ty = dx / dist * e.dir;
        e.x += ((dx / dist) * want * 0.7 + tx) * RM_ENEMIES.aimed.speed * dt;
        e.y += ((dy / dist) * want * 0.7 + ty) * RM_ENEMIES.aimed.speed * dt;
        if (e.cd <= 0) {
          e.cd = 1.3;
          const a = Math.atan2(dy, dx);
          for (let k = 0; k < 3; k++) this.fireEnemyBullet(e.x, e.y, MMPatterns.aimedAngle(a, k, 3, 0.44), 235, 0);
        }
      } else {
        // Drifts in and fires a ring of bolts with a random phase.
        if (dist > 150) { e.x += (dx / dist) * RM_ENEMIES.ring.speed * dt; e.y += (dy / dist) * RM_ENEMIES.ring.speed * dt; }
        if (e.cd <= 0) {
          e.cd = 2.4;
          const phase = this.rng() * Math.PI * 2;
          for (let k = 0; k < 14; k++) this.fireEnemyBullet(e.x, e.y, MMPatterns.ringAngle(k, 14, phase), 140, 2);
        }
      }
      e.x = Math.max(20, Math.min(this.W - 20, e.x));
      e.y = Math.max(20, Math.min(this.H - 20, e.y));
    }
  }

  _updateBullets(dt) {
    const p = this.player;
    // Player bolts: move, hit enemies (spatial hash over the enemies, rebuilt once per frame).
    if (this._hash) { let any = false; for (let i = 0; i < this.pBullets.length; i++) if (this.pBullets[i].active) { any = true; break; } if (any) this._buildHash(); } // no bolts, no hash
    for (let i = 0; i < this.pBullets.length; i++) {
      const b = this.pBullets[i];
      if (!b.active) continue;
      b.x += b.vx * dt; b.y += b.vy * dt; b.life -= dt;
      if (b.life <= 0 || b.x < -10 || b.y < -10 || b.x > this.W + 10 || b.y > this.H + 10) { b.active = false; continue; }
      if (this.walls && this.isWallAt(b.x, b.y)) { if (this.dungeon) this.dungeon.onBoltWall(b.x, b.y); b.active = false; continue; }
      if (this.team && this.role === 'host' && this.team.isPvp) { if (this.team.duelBoltHit(b)) b.active = false; continue; }
      const hj = this._boltHitIndex(b.x, b.y);
      if (hj >= 0) { b.active = false; this._hitEnemy(this.enemies[hj], b.dmg || this.stats.dmg); }
      if (!b.active) continue;
      for (let j = 0; j < this.drifters.length; j++) {
        const d = this.drifters[j];
        if (d.active && (b.x - d.x) * (b.x - d.x) + (b.y - d.y) * (b.y - d.y) < 15 * 15) { b.active = false; this._hitDrifter(d, b.dmg || this.stats.dmg); break; }
      }
    }
    // Enemy bullets: move, hit the player.
    const pr = RM_PLAYER.r + 4;
    for (let i = 0; i < this.eBullets.length; i++) {
      const b = this.eBullets[i];
      if (!b.active) continue;
      b.x += b.vx * dt; b.y += b.vy * dt; b.life -= dt;
      if (b.life <= 0 || b.x < -20 || b.y < -20 || b.x > this.W + 20 || b.y > this.H + 20) { b.active = false; continue; }
      if (this.walls && this.isWallAt(b.x, b.y)) { b.active = false; continue; }
      if (this.state !== 'dead' && !this.down && p.iframes <= 0 && (b.x - p.x) * (b.x - p.x) + (b.y - p.y) * (b.y - p.y) < pr * pr) {
        b.active = false;
        this._hitPlayer(this._guarded(RM_ENEMY_BULLET_DAMAGE));
      } else if (this.team && this.role === 'host' && this.team.partner && this.team.partner.ready) {
        const q = this.team.partner;
        if ((b.x - q.x) * (b.x - q.x) + (b.y - q.y) * (b.y - q.y) < pr * pr && this.team.hitPartner(RM_ENEMY_BULLET_DAMAGE)) b.active = false;
      }
    }
  }

  _hitEnemy(e, dmg) {
    if (this.dungeon && e.dg === 'boss') { this.dungeon.hitBoss(e, dmg); return; }
    if (e.type === 'boss' && e.invuln > 0) { this._floatText(e.x, e.y - 40, 'shielded', '#c9d1d9'); this._burst(e.x, e.y, '#fff', 1, 60); return; }
    e.hp -= dmg; e.flash = 1;
    this._snd(e.hp > 0 ? 'hit' : 'kill');
    if (e.type === 'boss') {
      this._syncBoss();
      if (e.hp > 0) {
        const f = e.hp / e.maxHp; const want = f > 0.66 ? 1 : f > 0.33 ? 2 : 3;
        if (want > e.phase) { this._bossPhase(e, want); this._syncBoss(); }
        return;
      }
      e.active = false; this._bossDefeated(e);
      if (this._bossArt && e._bn && this._bossArt.anim(e._bn, 'death', 'down')) this._bossGhost = { name: e._bn, x: e.x, y: e.y, t0: this.clock };
      return;
    }
    this._floatText(e.x + (this.rng() - 0.5) * 14, e.y - 14, String(Math.round(dmg * 10) / 10), '#fff');
    this._burst(e.x, e.y, RM_ENEMIES[e.type].color, 3, 110);
    if (e.hp > 0) return;
    e.active = false;
    const def = RM_ENEMIES[e.type];
    const gain = Math.max(1, Math.round(def.shards * this.stats.shards));
    this.run.kills += 1; this.run.shards += gain;
    this.save.kills += 1; this.save.shards += gain; this.save.kb[e.type] += 1;
    if (this.team) this.team.ev('rew', [def.shards, RM_XP[e.type] * (1 + 0.1 * Math.max(0, this.run.wave - 1)), e.type]);
    this._burst(e.x, e.y, def.color, 16, 230);
    this._floatText(e.x, e.y - 22, `+${gain} 💎`, '#8fe9ff');
    this._gainXp(Math.round(RM_XP[e.type] * (1 + 0.1 * Math.max(0, this.run.wave - 1)) * this.stats.xp));
    if (this.rng() < RM_BAG_CHANCE) this.dropBag(e.x, e.y, this.rollRarity());
    this.shake = Math.max(this.shake, 3);
    this.onSave(this.save);
    if (this.dungeon) this.dungeon.onKill(e);
  }

  _hitPlayer(dmg) {
    const p = this.player;
    if (this.down) return; // already down: hazards must not reset the revive
    if (this.shield.hits > 0) { // Shield soaks the hit
      this.shield.hits -= 1; p.iframes = 0.25; this._burst(p.x, p.y, '#8fe9ff', 6, 140); this._floatText(p.x, p.y - 22, 'blocked', '#8fe9ff'); return;
    }
    p.hp = Math.max(0, p.hp - dmg);
    this._heroHurtAt = performance.now() / 1000;
    this._snd('hurt');
    p.iframes = this.stats.iframes;
    this.flash = 1; this.shake = Math.max(this.shake, 8);
    this._burst(p.x, p.y, '#ff6f91', 8, 160);
    this._floatText(p.x, p.y - 22, `-${dmg}`, '#ff6f91');
    this._syncHud();
    if (p.hp <= 0) this._downOrDie();
  }

  // With a living partner you go down (they can revive you); alone, or when both are down, the run ends.
  _downOrDie() {
    const t = this.team;
    if (t && t.isPvp) { this.down = true; this.player.hp = 0; this._syncHud(); t.duelCheck(); return; } // the host is out: when their whole side is down the round is lost
    if (t && this.role === 'host' && t.partner && t.partner.ready && !t.partner.down) {
      this.down = true; this.reviveT = 0; this.player.hp = 0;
      this._showBanner('You are down — your partner can revive you!', 2.2);
      this._syncHud();
    } else if (t && this.role === 'host') this._teamWipe();
    else this._die();
  }

  _waveCleared() {
    const bonus = 5 * this.run.wave;
    this.run.shards += bonus; this.save.shards += bonus;
    this.save.bestWave = Math.max(this.save.bestWave, this.run.wave);
    this.onSave(this.save);
    this.state = 'banner';
    this.nextWaveIn = RM_WAVE_PAUSE;
    this.eBullets.forEach((b) => { if (b.active) { b.active = false; this._burst(b.x, b.y, '#8fe9ff', 1, 40); } }); // clearing a wave pops the leftover bolts
    this._showBanner(`Wave ${this.run.wave} cleared!  +${bonus} 💎`, RM_WAVE_PAUSE - 0.2, true);
    if (this.team) this.team.ev('rew', [bonus, 0, 'wave']);
    if (this.team) this.team.ev('clr', []);
    if (this.down) this._revive(0.4);
    if (this.team && this.team.partner && this.team.partner.down) { const pp = this.team.partner; pp.down = false; pp.reviveT = 0; pp.hp = Math.ceil(pp.maxHp * 0.4); pp.iframes = 1.5; }
    this._burst(this.W / 2, this.H / 2, '#ffe27a', 24, 280);
    this._syncHud();
  }

  // Falling costs nothing. Instead you keep a Survivor's Cache: one item whose rarity grows with the wave you reached.
  // Deterministic (no randomness): the item cycles with your falls so repeat runs bring variety.
  _deathBonus() {
    const sv = this.save; const w = Math.max(1, this.run.wave);
    const rarity = w >= 6 ? 2 : w >= 3 ? 1 : 0;
    const def = RM_ITEMS[(sv.deaths + w) % RM_ITEMS.length]; const rar = RM_RARITIES[rarity];
    let text;
    if (sv.items.length >= RM_BACKPACK) { sv.shards += rar.sell; text = `pack full, cache sold +${rar.sell} 💎`; } else { sv.items.push({ n: sv.nextUid++, id: def.id, r: rarity }); text = `cache: ${def.icon} ${rar.name} ${def.name}`; }
    return { id: def.id, rarity, text };
  }

  // ---------- shop ----------

  // Offers: every item at each rarity your best wave has unlocked, priced at sell value x RM_SHOP_MULT. Fixed stock, no luck.
  shopStock() {
    const best = this.save.bestWave; const out = [];
    RM_RARITIES.forEach((rar, r) => { if (r < RM_SHOP_UNLOCK.length && best >= RM_SHOP_UNLOCK[r]) RM_ITEMS.forEach((def) => out.push({ id: def.id, r, price: rar.sell * RM_SHOP_MULT })); });
    return out;
  }

  buy(id, r) {
    const sv = this.save;
    if (!Object.prototype.hasOwnProperty.call(RM_ITEM_BY_ID, id) || !Number.isInteger(r) || r < 0 || r >= RM_RARITIES.length) return false;
    if (!this.shopStock().some((o) => o.id === id && o.r === r)) return false;
    const price = RM_RARITIES[r].sell * RM_SHOP_MULT;
    if (sv.shards < price || sv.items.length >= RM_BACKPACK) return false;
    sv.shards -= price; sv.items.push({ n: sv.nextUid++, id, r });
    this.displayShards = sv.shards;
    this._snd('pickup');
    this.onSave(sv); this._syncHud(); this.renderShop();
    return true;
  }

  setShop(on) { if (on && this.team && this.team.isPvp) return; this._panel(on ? 'shop' : null); } // a duel is fought with identical stats: no shopping

  _ensureShopDom() {
    if (this._shopDom) return this._shopDom;
    const ov = document.getElementById('realm-overlay'); if (!ov) return null;
    const wrap = document.createElement('div');
    wrap.id = 'realm-shop'; wrap.className = 'hidden'; wrap.setAttribute('role', 'dialog'); wrap.setAttribute('aria-label', 'Shop');
    wrap.style.cssText = 'position:absolute;inset:0;background:rgba(8,3,18,0.85);display:none;align-items:center;justify-content:center;padding:12px;z-index:3';
    wrap.innerHTML = '<div class="realm-bp-card"><div class="realm-bp-head"><strong>🛒 Shop</strong><button id="realm-shop-close" type="button" aria-label="Close shop">✖</button></div><div id="realm-shop-body"></div></div>';
    ov.appendChild(wrap);
    wrap.querySelector('#realm-shop-close').addEventListener('click', () => this.setShop(false));
    wrap.querySelector('#realm-shop-body').addEventListener('click', (e) => {
      const btn = e.target.closest('button[data-buy]'); if (!btn) return;
      this.buy(btn.dataset.buy, Number(btn.dataset.r));
    });
    const bpBody = document.getElementById('realm-backpack-body'); // the backpack carries a Shop button (the HUD row is full on phones); V works too
    if (bpBody) bpBody.addEventListener('click', (e) => {
      if (e.target.closest('button[data-open-shop]')) { this.setShop(true); return; }
      const cb = e.target.closest('button[data-combine]'); if (cb) this.combine(Number(cb.dataset.combine));
    });
    return (this._shopDom = wrap);
  }

  renderShop() {
    const root = document.getElementById('realm-shop-body'); if (!root) return;
    const sv = this.save; const full = sv.items.length >= RM_BACKPACK;
    let html = `<div class="realm-bp-count">You have ${sv.shards} 💎 · ${sv.items.length} / ${RM_BACKPACK} items${full ? ' · backpack full' : ''}</div><ul id="realm-bp-list">`;
    this.shopStock().forEach((o) => {
      const def = RM_ITEM_BY_ID[o.id]; const rar = RM_RARITIES[o.r]; const can = sv.shards >= o.price && !full;
      html += `<li><span class="nm" style="color:${rar.color}">${this._icon(def)} ${def.name}</span><span class="rar">${rar.name}</span><span class="st">${this._itemText({ id: o.id, r: o.r })}</span><button type="button" class="eq" data-buy="${def.id}" data-r="${o.r}"${can ? '' : ' disabled'} aria-label="Buy ${rar.name} ${def.name} for ${o.price} shards">Buy ${o.price}💎</button></li>`;
    });
    const nextR = RM_SHOP_UNLOCK.findIndex((w) => sv.bestWave < w);
    html += `</ul>${nextR > 0 ? `<div class="dim">Reach wave ${RM_SHOP_UNLOCK[nextR]} to unlock ${RM_RARITIES[nextR].name} gear.</div>` : ''}`;
    root.innerHTML = html; this._fixIcons(root);
  }

  _die() {
    this.save.deaths += 1;
    this.save.bestWave = Math.max(this.save.bestWave, this.run.wave - 1);
    const cache = this._deathBonus();
    this.lastLoss = 0;
    this.state = 'dead';
    this.deadT = 2.6;
    this.shake = 14;
    this._burst(this.player.x, this.player.y, '#ff6f91', 30, 300);
    this._showBanner(`You fell in the Realm…  no 💎 lost — ${cache.text}  ·  wave ${Math.max(1, this.run.wave)}, ${this.run.kills} kills, +${this.run.shards} 💎 this run`, 2.6);
    this.onSave(this.save);
    this._syncHud();
  }

  // ---------- XP, levels, loot ----------

  _gainXp(n) {
    const sv = this.save;
    if (sv.level >= RM_MAX_LEVEL || n <= 0) return;
    sv.xp += n;
    this._floatText(this.player.x, this.player.y - 34, `+${n} xp`, '#c9a7ff');
    let up = false;
    while (sv.level < RM_MAX_LEVEL && sv.xp >= rmXpNeeded(sv.level)) { sv.xp -= rmXpNeeded(sv.level); sv.level += 1; up = true; }
    if (sv.level >= RM_MAX_LEVEL) sv.xp = 0;
    if (up) this._levelUp();
    this.onSave(this.save);
    this._syncHud();
  }

  _levelUp() {
    this._snd('levelup');
    const before = this.stats.maxHp;
    this._calcStats();
    const p = this.player;
    p.hp = Math.min(this.stats.maxHp, p.hp + Math.round(this.stats.maxHp * 0.3) + (this.stats.maxHp - before)); // a level heals a bit and the new max HP is free
    this.shake = Math.max(this.shake, 4);
    this._burst(p.x, p.y, '#ffe27a', 28, 260);
    const unlocked = RM_ABILITIES.filter((a) => a.level === this.save.level);
    this._showBanner(`Level ${this.save.level}!${unlocked.length ? `  ${unlocked[0].icon} ${unlocked[0].name} unlocked` : ''}`, 2);
    this._syncAbilities();
  }

  rollRarity() {
    const w = this.run.wave;
    const r = this.rng();
    const rare = Math.min(0.2, 0.02 + 0.02 * w); const unc = Math.min(0.4, 0.15 + 0.04 * w);
    return r < rare ? 2 : r < rare + unc ? 1 : 0;
  }

  dropBag(x, y, rarity, itemId) {
    const b = this._take(this.bags);
    if (!b) return null;
    b.active = true; b.x = x; b.y = y; b.t = 0; b.r = rarity;
    b.id = itemId || RM_ITEMS[Math.floor(this.rng() * RM_ITEMS.length)].id;
    const a = this.rng() * Math.PI * 2; b.vx = Math.cos(a) * 60; b.vy = Math.sin(a) * 60;
    return b;
  }

  // Picks an item up. A full backpack sells it on the spot for shards.
  collectItem(id, rarity) {
    this._snd('pickup');
    const sv = this.save; const def = RM_ITEM_BY_ID[id]; const rar = RM_RARITIES[rarity];
    if (sv.items.length >= RM_BACKPACK) {
      sv.shards += rar.sell;
      this._floatText(this.player.x, this.player.y - 24, `sold ${def.name} +${rar.sell} 💎`, rar.color);
    } else {
      sv.items.push({ n: sv.nextUid++, id, r: rarity });
      this._floatText(this.player.x, this.player.y - 24, `${def.icon} ${def.name}`, rar.color);
      this._burst(this.player.x, this.player.y, rar.color, 10, 150);
    }
    this.onSave(this.save);
    this._syncHud(); if (this.paused) this.renderBackpack();
  }

  _updateBags(dt) {
    const p = this.player;
    for (let i = 0; i < this.bags.length; i++) {
      const b = this.bags[i];
      if (!b.active) continue;
      b.t += dt;
      b.x += b.vx * dt; b.y += b.vy * dt; b.vx *= 0.93; b.vy *= 0.93;
      b.x = Math.max(14, Math.min(this.W - 14, b.x)); b.y = Math.max(14, Math.min(this.H - 14, b.y));
      const dx = p.x - b.x; const dy = p.y - b.y; const d = Math.hypot(dx, dy) || 1;
      if (b.t > 0.4 && d < 110) { const k = (230 * dt) / d; b.x += dx * k; b.y += dy * k; } // bags drift toward you
      if (b.t > 0.25 && d < 20 && !this.down) { b.active = false; this.collectItem(b.id, b.r); continue; }
      const q = this.team && this.role === 'host' && this.team.partner && this.team.partner.ready && !this.team.partner.down ? this.team.partner : null;
      if (q && b.t > 0.25 && Math.hypot(q.x - b.x, q.y - b.y) < 20) { b.active = false; this.team.ev('loot', [b.id, b.r], 1); }
    }
  }

  // ---------- abilities ----------

  abilityUnlocked(i) { return this.save.level >= RM_ABILITIES[i].level; }

  cast(i) {
    if (!this.active || this.state === 'dead' || this.paused) return false;
    const ab = RM_ABILITIES[i];
    if (!ab || !this.abilityUnlocked(i) || this.abilityCd[i] > 0) return false;
    if (this.team && this.team.isPvp && ab.id !== 'dash') return false; // duels allow only the Dash
    const p = this.player;
    if (ab.id === 'dash') {
      let dx = this._mx || 0; let dy = this._my || 0;
      if (Math.hypot(dx, dy) < 0.1) { dx = Math.cos(p.aim); dy = Math.sin(p.aim); }
      const len = Math.hypot(dx, dy) || 1;
      this._burst(p.x, p.y, '#8fe9ff', 8, 120);
      if (this.walls) { for (let k = 0; k < 15; k++) this._movePlayer((dx / len) * 10, (dy / len) * 10); } // stepwise so a dash cannot tunnel through a wall
      else {
        p.x = Math.max(RM_PLAYER.r, Math.min(this.W - RM_PLAYER.r, p.x + (dx / len) * 150));
        p.y = Math.max(RM_PLAYER.r, Math.min(this.H - RM_PLAYER.r, p.y + (dy / len) * 150));
      }
      p.iframes = Math.max(p.iframes, 0.4);
    } else if (ab.id === 'nova') {
      for (let k = 0; k < 16; k++) this.firePlayerBullet((k / 16) * Math.PI * 2);
      this.shake = Math.max(this.shake, 3);
    } else if (ab.id === 'shield') {
      this.shield.hits = 3; this.shield.t = 6;
    } else if (ab.id === 'overdrive') {
      this.overdriveT = 4;
    }
    this.abilityCd[i] = ab.cd;
    if (this.team && this.role === 'guest') this.team.sendAbility(ab.id);
    this._floatText(p.x, p.y - 30, `${ab.icon} ${ab.name}`, '#fff');
    this._syncAbilities();
    return true;
  }

  _updateAbilities(dt) {
    let changed = false;
    for (let i = 0; i < 4; i++) if (this.abilityCd[i] > 0) { this.abilityCd[i] = Math.max(0, this.abilityCd[i] - dt); changed = true; }
    if (this.overdriveT > 0) this.overdriveT = Math.max(0, this.overdriveT - dt);
    if (this.shield.t > 0) { this.shield.t -= dt; if (this.shield.t <= 0) this.shield.hits = 0; }
    this._abTick = (this._abTick || 0) + dt;
    if (changed && this._abTick > 0.1) { this._abTick = 0; this._syncAbilities(); }
  }

  // ---------- backpack UI ----------

  // One panel at a time (backpack or kill board); either one pauses the fight.
  _panel(name) {
    if (name && this.state === 'dead') return; // no panels while the death message runs (it would freeze the exit)
    this.panel = name;
    this.paused = !!name && !this.team; // a shared run never freezes (it would time the partner out)
    const bp = document.getElementById('realm-backpack'); if (bp) bp.classList.toggle('hidden', name !== 'bp');
    const bd = document.getElementById('realm-board'); if (bd) bd.classList.toggle('hidden', name !== 'board');
    const shopEl = this._ensureShopDom(); if (shopEl) { shopEl.classList.toggle('hidden', name !== 'shop'); shopEl.style.display = name === 'shop' ? 'flex' : 'none'; }
    if (name) { this.keys = {}; this.mouse.down = false; this.aimVec.on = false; if (name === 'bp') this.renderBackpack(); else if (name === 'shop') this.renderShop(); else this.renderBoard(); }
  }

  setPaused(on) { this._panel(on ? 'bp' : null); } // false closes whichever panel is open

  setBoard(on) { this._panel(on ? 'board' : null); }

  renderBoard() {
    const root = document.getElementById('realm-board-body');
    if (!root) return;
    const sv = this.save; const kb = sv.kb;
    const t = sv.bossBestT ? `${(sv.bossBestT / 10).toFixed(1)} s` : '—';
    const rows = [
      ['🏆', 'Best wave', sv.bestWave], ['⭐', 'Level', sv.level], ['💎', 'Shards banked', sv.shards], ['☠️', 'Falls', sv.deaths],
      ['🟣', 'Whirlers', kb.spiral], ['🔺', 'Snipers', kb.aimed], ['🟠', 'Bursters', kb.ring], ['✨', 'Wanderers', kb.drifter],
      ['👹', 'Gloomheart defeated', kb.boss], ['⏱️', 'Fastest Gloomheart', t],
    ];
    root.innerHTML = rows.map(([i, l, v]) => `<div class="realm-board-row"><span>${i} ${l}</span><b>${v}</b></div>`).join('');
  }

  equip(uid) {
    const it = this.save.items.find((x) => x.n === uid);
    if (!it) return false;
    const slot = RM_ITEM_BY_ID[it.id].slot;
    if (this.save.eq[slot] === uid) delete this.save.eq[slot]; else this.save.eq[slot] = uid;
    this._afterGearChange();
    return true;
  }

  // Fuse RM_COMBINE_COUNT identical items (same gear + rarity) into ONE of the next rarity: +50%..+80% of the stat. The item you clicked survives upgraded.
  combinable(uid) {
    const it = this.save.items.find((x) => x.n === uid);
    if (!it || it.r >= RM_RARITIES.length - 1) return null;
    const group = this.save.items.filter((x) => x.id === it.id && x.r === it.r);
    return group.length >= RM_COMBINE_COUNT ? { keep: it, group } : null;
  }

  combine(uid) {
    const c = this.combinable(uid); if (!c) return false;
    const sv = this.save;
    // The survivor is the equipped copy if there is one (so your damage goes up at once), else the one you clicked; spend unequipped copies first.
    const eqUids = new Set(RM_SLOTS.map((sl) => sv.eq[sl]).filter(Boolean));
    c.keep = c.group.find((x) => eqUids.has(x.n)) || c.keep;
    const others = c.group.filter((x) => x !== c.keep).sort((a, b) => (eqUids.has(a.n) ? 1 : 0) - (eqUids.has(b.n) ? 1 : 0)).slice(0, RM_COMBINE_COUNT - 1);
    const gone = new Set(others.map((x) => x.n));
    sv.items = sv.items.filter((x) => !gone.has(x.n));
    RM_SLOTS.forEach((slot) => { if (gone.has(sv.eq[slot])) delete sv.eq[slot]; });
    c.keep.r += 1;
    this._snd('levelup');
    this._floatText(this.player.x, this.player.y - 34, `${RM_ITEM_BY_ID[c.keep.id].icon} ${RM_RARITIES[c.keep.r].name}!`, RM_RARITIES[c.keep.r].color);
    this._afterGearChange();
    return true;
  }

  discard(uid) {
    const i = this.save.items.findIndex((x) => x.n === uid);
    if (i < 0) return false;
    const it = this.save.items[i];
    this.save.shards += RM_RARITIES[it.r].sell;
    this.save.items.splice(i, 1);
    RM_SLOTS.forEach((slot) => { if (this.save.eq[slot] === uid) delete this.save.eq[slot]; });
    this._afterGearChange();
    return true;
  }

  _afterGearChange() {
    this._calcStats();
    const p = this.player;
    p.hp = Math.min(this.stats.maxHp, p.hp); // swapping gear never heals (no free HP by toggling a charm); losing max HP just lowers the cap
    this.displayShards = this.save.shards;
    this.onSave(this.save);
    this._syncHud(); this.renderBackpack();
  }

  _statLine() {
    const st = this.stats; const bits = [`${st.maxHp} HP`, `${(Math.round(st.dmg * 10) / 10)} dmg`, `${(Math.round(st.rate * 10) / 10)} shots/s`, `${Math.round(st.speed)} speed`];
    if (this.heroProfile && this.heroProfile.name && !(this.team && this.team.isPvp)) bits.unshift(this.heroProfile.name);
    if (st.shards > 1) bits.push(`+${Math.round((st.shards - 1) * 100)}% 💎`);
    if (st.xp > 1) bits.push(`+${Math.round((st.xp - 1) * 100)}% xp`);
    return bits.join(' · ');
  }

  _itemText(it) {
    const def = RM_ITEM_BY_ID[it.id]; const v = def.amount * RM_RARITIES[it.r].mult;
    const num = def.pct ? `+${Math.round(v * 100)}%` : `+${Math.round(v * 10) / 10}`;
    return `${num} ${def.text}`;
  }

  renderBackpack() {
    const root = document.getElementById('realm-backpack-body');
    if (!root) return;
    const sv = this.save;
    const eqUids = new Set(RM_SLOTS.map((sl) => sv.eq[sl]).filter(Boolean));
    let html = `<div id="realm-bp-stats">${this._statLine()}</div><button type="button" class="eq" data-open-shop="1" aria-label="Open the shop (V)" style="min-height:40px;margin:4px 0">🛒 Shop (V)</button><div class="realm-bp-slots">`;
    RM_SLOTS.forEach((slot) => {
      const it = sv.items.find((x) => x.n === sv.eq[slot]);
      html += `<div class="realm-bp-slot" data-slot="${slot}">${it ? `<span style="color:${RM_RARITIES[it.r].color}">${this._icon(RM_ITEM_BY_ID[it.id])} ${RM_ITEM_BY_ID[it.id].name}</span>` : `<span class="dim">${slot}: empty</span>`}</div>`;
    });
    html += `</div><div class="realm-bp-count">${sv.items.length} / ${RM_BACKPACK} items</div><ul id="realm-bp-list">`;
    if (!sv.items.length) html += '<li class="dim">Nothing yet — defeat enemies to find loot bags.</li>';
    sv.items.forEach((it) => {
      const def = RM_ITEM_BY_ID[it.id]; const rar = RM_RARITIES[it.r]; const on = eqUids.has(it.n);
      html += `<li data-uid="${it.n}" class="${on ? 'on' : ''}"><span class="nm" style="color:${rar.color}">${this._icon(def)} ${def.name}</span><span class="rar">${rar.name}</span><span class="st">${this._itemText(it)}</span><button type="button" class="eq" data-act="equip" data-uid="${it.n}">${on ? 'Unequip' : 'Equip'}</button>${this.combinable(it.n) ? `<button type="button" class="eq" data-combine="${it.n}" aria-label="Combine ${RM_COMBINE_COUNT} ${rar.name} ${def.name} into one ${RM_RARITIES[it.r + 1].name}">Combine ${RM_COMBINE_COUNT}→${RM_RARITIES[it.r + 1].name}</button>` : ''}<button type="button" class="dc" data-act="discard" data-uid="${it.n}" aria-label="Sell ${def.name} for ${rar.sell} shards">Sell ${rar.sell}💎</button></li>`;
    });
    html += '</ul>';
    root.innerHTML = html; this._fixIcons(root);
  }

  // ---------- drawing ----------

  _draw() {
    const g = this.ctx; const s = this.scale;
    g.setTransform(s, 0, 0, s, 0, 0);
    g.imageSmoothingEnabled = false;
    const sh = this.shakeAmt();
    const sx = sh > 0 ? (this.rng() - 0.5) * sh : 0;
    const sy = sh > 0 ? (this.rng() - 0.5) * sh : 0;
    g.save();
    g.translate(sx, sy);
    this._floorPatterns = this._floorPatterns || [];
    if (!this._floorPatterns[this.biome]) this._floorPatterns[this.biome] = g.createPattern(this.sprites.floors[this.biome], 'repeat');
    g.fillStyle = this._floorPatterns[this.biome]; g.fillRect(-10, -10, this.W + 20, this.H + 20);
    g.strokeStyle = RM_BIOMES[this.biome].border; g.lineWidth = 4; g.strokeRect(2, 2, this.W - 4, this.H - 4);
    if (this.walls) { const w = this.walls; for (let r = 0; r < w.rows; r++) for (let c = 0; c < w.cols; c++) if (w.cells[r][c] === 1) { g.fillStyle = '#1b1430'; g.fillRect(c * RM_TILE, r * RM_TILE, RM_TILE, RM_TILE); g.fillStyle = RM_BIOMES[this.biome].border; g.fillRect(c * RM_TILE, r * RM_TILE, RM_TILE, 3); g.fillRect(c * RM_TILE, r * RM_TILE, 3, RM_TILE); } }
    if (this.dungeon) this.dungeon.drawUnder(g);
    for (let i = 0; i < this.hazards.length; i++) { const h = this.hazards[i]; if (h.active) { g.globalAlpha = h.kind === 'lava' ? 0.85 + Math.sin(this.clock * 4 + i) * 0.1 : 0.9; g.drawImage(this.sprites.hazard[h.kind], h.x - 48, h.y - 48); g.globalAlpha = 1; } }
    for (let i = 0; i < this.drifters.length; i++) { const d = this.drifters[i]; if (d.active && !(this._enemyArt && this._drawDrifterArt(g, d))) g.drawImage(this.sprites.drifter[d.kind], d.x - 12, d.y - 12 + Math.sin(d.t * 3) * 3); }

    for (let i = 0; i < this.enemies.length; i++) {
      const e = this.enemies[i];
      if (!e.active) continue;
      const spr = this.sprites[e.type];
      const bob = e.type === 'boss' ? 0 : Math.sin(e.t * 4) * 2;
      const art = e.type === 'boss' ? !!(this._bossArt && this._drawBossArt(g, e)) : !!(this._enemyArt && this._drawEnemyArt(g, e, RM_ENEMIES[e.type]));
      if (!art) g.drawImage(spr, e.x - spr.width / 2, e.y - spr.height / 2 + bob);
      if (e.flash > 0) { g.globalAlpha = e.flash * 0.7; g.fillStyle = '#fff'; g.beginPath(); g.arc(e.x, e.y + (art ? 0 : bob), RM_ENEMIES[e.type].r, 0, Math.PI * 2); g.fill(); g.globalAlpha = 1; }
      if (e.type === 'boss' && e.invuln > 0) { g.strokeStyle = 'rgba(255,255,255,0.8)'; g.lineWidth = 3; g.beginPath(); g.arc(e.x, e.y, 40 + Math.sin(e.t * 20) * 2, 0, Math.PI * 2); g.stroke(); }
      if (e.hp < e.maxHp && e.type !== 'boss') { g.fillStyle = 'rgba(0,0,0,0.6)'; g.fillRect(e.x - 14, e.y - spr.height / 2 - 6, 28, 4); g.fillStyle = RM_ENEMIES[e.type].color; g.fillRect(e.x - 14, e.y - spr.height / 2 - 6, 28 * (e.hp / e.maxHp), 4); }
    }
    if (this._bossGhost) this._drawBossGhost(g);
    for (let i = 0; i < this.bags.length; i++) { const b = this.bags[i]; if (b.active) g.drawImage(this.sprites.bag[b.r], b.x - 13, b.y - 13 + Math.sin(b.t * 5) * 2); }
    for (let i = 0; i < this.eBullets.length; i++) { const b = this.eBullets[i]; if (b.active) g.drawImage(this.sprites.eBullet[b.kind], b.x - 8, b.y - 8); }
    for (let i = 0; i < this.pBullets.length; i++) { const b = this.pBullets[i]; if (b.active) g.drawImage(this.sprites.pBullet, b.x - 8, b.y - 8); }

    // Your partner: a tinted villager with a name tag, a small HP bar, and a revive ring while they are down.
    const tm = this.team;
    if (tm) {
      const list = tm.drawList();
      for (let li = 0; li < list.length; li++) {
        const q = list[li]; const col = q.foe ? '255,111,145' : '126,231,135'; const hex = q.foe ? '#ff6f91' : '#7ee787';
        g.fillStyle = 'rgba(0,0,0,0.35)'; g.beginPath(); g.ellipse(q.x, q.y + 14, 13, 5, 0, 0, Math.PI * 2); g.fill();
        g.save(); g.translate(q.x, q.y); g.globalAlpha = q.down ? 0.45 : 1;
        g.drawImage(this.sprites.playerFallback, -16, -20, 32, 32); g.restore(); g.globalAlpha = 1;
        g.strokeStyle = `rgba(${col},0.85)`; g.lineWidth = 2; g.beginPath(); g.arc(q.x, q.y - 4, 19, 0, Math.PI * 2); g.stroke();
        g.font = 'bold 11px system-ui, sans-serif'; g.textAlign = 'center'; g.fillStyle = '#000'; g.fillText(q.name, q.x + 1, q.y - 27); g.fillStyle = hex; g.fillText(q.name, q.x, q.y - 28);
        if (q.down && !tm.isPvp) { g.strokeStyle = '#7ee787'; g.lineWidth = 3; g.beginPath(); g.arc(q.x, q.y, RT_REVIVE_RANGE, -Math.PI / 2, -Math.PI / 2 + q.revive * Math.PI * 2); g.stroke(); g.strokeStyle = 'rgba(126,231,135,0.35)'; g.lineWidth = 1; g.beginPath(); g.arc(q.x, q.y, RT_REVIVE_RANGE, 0, Math.PI * 2); g.stroke(); }
      }
    }
    // Player: the villager sprite (flickers while invulnerable), with a soft shadow and aim marker.
    const p = this.player;
    if (this.state !== 'dead' && (p.iframes <= 0 || this._reduced || Math.floor(p.iframes * 20) % 2 === 0)) {
      if (this.down) { g.globalAlpha = 0.45; g.strokeStyle = '#7ee787'; g.lineWidth = 3; g.beginPath(); g.arc(p.x, p.y, RT_REVIVE_RANGE, -Math.PI / 2, -Math.PI / 2 + Math.min(1, this.reviveT / RT_REVIVE_TIME) * Math.PI * 2); g.stroke(); }
      g.fillStyle = 'rgba(0,0,0,0.35)'; g.beginPath(); g.ellipse(p.x, p.y + 14, 13, 5, 0, 0, Math.PI * 2); g.fill();
      let heroDrawn = false;
      if (this._heroArt) { const ga = g.globalAlpha; if (this._reduced && p.iframes > 0) g.globalAlpha = 0.6; heroDrawn = this._drawHero(g, p); g.globalAlpha = ga; }
      if (!heroDrawn) {
      const spr = this._avatar || this.sprites.playerFallback;
      const size = this._avatar ? 48 : 32;
      g.save(); g.translate(p.x, p.y - Math.abs(Math.sin(p.bob)) * 3);
      g.scale(p.facing, 1);
      if (this._reduced && p.iframes > 0) g.globalAlpha = 0.6; // reduced motion: a steady tint instead of the 10 Hz blink (restored by g.restore)
      g.drawImage(spr, -size / 2, -size / 2 - 4, size, size);
      g.restore();
      }
      if (this.shield.hits > 0) { g.strokeStyle = `rgba(143,233,255,${0.5 + 0.1 * this.shield.hits})`; g.lineWidth = 3; g.beginPath(); g.arc(p.x, p.y, 26, 0, Math.PI * 2); g.stroke(); }
      if (this.overdriveT > 0) { g.strokeStyle = 'rgba(255,170,60,0.8)'; g.lineWidth = 2; g.beginPath(); g.arc(p.x, p.y, 21 + Math.sin(performance.now() / 60) * 2, 0, Math.PI * 2); g.stroke(); }
      g.strokeStyle = 'rgba(143,233,255,0.7)'; g.lineWidth = 2; g.beginPath();
      g.moveTo(p.x + Math.cos(p.aim) * 26, p.y + Math.sin(p.aim) * 26); g.lineTo(p.x + Math.cos(p.aim) * 34, p.y + Math.sin(p.aim) * 34); g.stroke();
      g.globalAlpha = 1;
      g.drawImage(this.sprites.hitDot, p.x - 4, p.y - 4);
    }

    if (this.state === 'dead' && this._heroArt) { // the hero falls and lies down (only with hero art attached)
      g.fillStyle = 'rgba(0,0,0,0.35)'; g.beginPath(); g.ellipse(p.x, p.y + 14, 13, 5, 0, 0, Math.PI * 2); g.fill();
      this._drawHero(g, p);
    }
    if (this.dungeon) this.dungeon.drawOver(g);
    for (let i = 0; i < this.particles.length; i++) {
      const pt = this.particles[i];
      if (!pt.active) continue;
      g.globalAlpha = Math.max(0, pt.life / pt.max); g.fillStyle = pt.color; g.fillRect(pt.x - pt.size / 2, pt.y - pt.size / 2, pt.size, pt.size);
    }
    g.globalAlpha = 1;
    g.font = 'bold 14px system-ui, sans-serif'; g.textAlign = 'center';
    for (let i = 0; i < this.texts.length; i++) {
      const t = this.texts[i];
      if (!t.active) continue;
      g.globalAlpha = Math.min(1, t.life * 2.5); g.fillStyle = '#000'; g.fillText(t.text, t.x + 1, t.y + 1); g.fillStyle = t.color; g.fillText(t.text, t.x, t.y);
    }
    g.globalAlpha = 1;
    g.restore();
    if (this.flash > 0) { // red hit vignette (reduced motion: a steady tint while it lasts, no fade or blink): one baked gradient, faded with globalAlpha (no per-frame allocation)
      if (!this._vignette) {
        const gr = g.createRadialGradient(this.W / 2, this.H / 2, Math.min(this.W, this.H) * 0.3, this.W / 2, this.H / 2, Math.max(this.W, this.H) * 0.7);
        gr.addColorStop(0, 'rgba(255,40,80,0)'); gr.addColorStop(1, 'rgba(255,40,80,0.55)');
        this._vignette = gr;
      }
      g.globalAlpha = this._reduced ? 0.35 : this.flash; g.fillStyle = this._vignette; g.fillRect(0, 0, this.W, this.H); g.globalAlpha = 1;
    }
  }

  // ---------- HUD (plain DOM, only touched when a value changes) ----------

  _syncHud(force) {
    const hp = document.getElementById('realm-hp-fill');
    if (hp) hp.style.width = `${Math.max(0, this.player.hp) / this.stats.maxHp * 100}%`;
    const hpText = document.getElementById('realm-hp-text');
    if (hpText) hpText.textContent = `${Math.ceil(this.player.hp)} / ${this.stats.maxHp}`;
    const wave = document.getElementById('realm-wave');
    if (wave) wave.textContent = this.team && this.team.isPvp ? this.team.duelLabel() : this.run.wave > 0 ? `Wave ${this.run.wave}` : 'Get ready';
    const shards = document.getElementById('realm-shards');
    if (shards) shards.textContent = `💎 ${Math.floor(this.displayShards)}`;
    const bio = document.getElementById('realm-biome');
    if (bio) bio.textContent = this.run.wave > 0 && !(this.team && this.team.isPvp) ? RM_BIOMES[this.biome].name : '';
    const pe = document.getElementById('realm-partner');
    if (pe) {
      const t = this.team; const q = t ? t.badge() : null;
      pe.classList.toggle('hidden', !q);
      if (q) {
        const mh = q.maxHp || 100; const hpv = q.hp !== undefined ? q.hp : 100;
        const pf = document.getElementById('realm-partner-fill'); if (pf) pf.style.width = `${Math.max(0, hpv) / Math.max(1, mh) * 100}%`;
        const pn = document.getElementById('realm-partner-name'); if (pn) pn.textContent = `${q.foe ? '⚔️' : '🤝'} ${q.name}${q.down ? (t.isPvp ? ' · out' : ' · down!') : ''}`;
      }
    }
    const lv = document.getElementById('realm-level');
    if (lv) lv.textContent = `Lv ${this.save.level}`;
    const xpf = document.getElementById('realm-xp-fill');
    if (xpf) xpf.style.width = this.save.level >= RM_MAX_LEVEL ? '100%' : `${(this.save.xp / rmXpNeeded(this.save.level)) * 100}%`;
    const xpt = document.getElementById('realm-xp-text');
    if (xpt) xpt.textContent = this.save.level >= RM_MAX_LEVEL ? 'MAX' : `${this.save.xp} / ${rmXpNeeded(this.save.level)} xp`;
    this._syncAbilities();
    const best = document.getElementById('realm-best');
    if (best) best.textContent = this.save.bestWave > 0 ? `Best wave ${this.save.bestWave}` : '';
    if (force) this._hideBanner();
  }

  _syncAbilities() {
    for (let i = 0; i < 4; i++) {
      const el = document.getElementById(`realm-ab-${i}`);
      if (!el) continue;
      const ab = RM_ABILITIES[i]; const unlocked = this.abilityUnlocked(i); const cd = this.abilityCd[i];
      el.classList.toggle('locked', !unlocked);
      el.classList.toggle('cooling', unlocked && cd > 0);
      const cdEl = el.querySelector('.cd');
      if (cdEl) cdEl.textContent = !unlocked ? `Lv${ab.level}` : cd > 0 ? String(Math.ceil(cd)) : '';
      el.setAttribute('aria-label', `${ab.name} (${ab.key.toUpperCase()})${unlocked ? '' : ` — unlocks at level ${ab.level}`}`);
    }
  }

  _showBanner(text, seconds, share) {
    if (share && this.team && this.role === 'host') this.team.ev('bn', [text, seconds || 0]);
    const el = document.getElementById('realm-banner');
    if (!el) return;
    el.textContent = text;
    el.classList.remove('hidden');
    el.classList.remove('pop'); void el.offsetWidth; el.classList.add('pop');
    clearTimeout(this._bannerTimer);
    if (seconds) this._bannerTimer = setTimeout(() => this._hideBanner(), seconds * 1000);
  }

  _hideBanner() {
    const el = document.getElementById('realm-banner');
    if (el) el.classList.add('hidden');
  }
}
