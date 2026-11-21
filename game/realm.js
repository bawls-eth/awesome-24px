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
const RM_SHOP_UNLOCK_LV = [1, 4, 8]; // world mode (no waves): the hero level that also unlocks them (either one unlocks; never fewer items than before)
const RM_ED_GHOSTS = 24; const RM_ED_REDUCED = 0.25; // enemy death-ghost pool size; reduced-motion fade seconds
// Shot readability: the player's bolt is a white core with a light outline (solid radius 5 + a soft glow); enemy bullets have a dark
// rim and their own hue per pattern and are never more than 1.3x the player's bolt. At most RM_EB_DRAW enemy bullets are drawn.
const RM_BOLT_R = { player: 5, enemy: 6 };
const RM_EB_HUES = [['#ff4f6d', '#ffd0d8'], ['#b46bff', '#ecdcff'], ['#ffa62b', '#fff0c8']]; // aimed (red), spiral (violet), ring (orange)
const RM_EB_DRAW = 320;
const RM_FIRE_RANGE = 0.95; // world mode: an enemy fires only on screen and within this x the view's half-diagonal of the player
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
const RM_SIG_KINDS = ['dash-volley', 'drain-orb', 'oath-shield', 'rage-slam', 'thorn-bloom', 'bone-guard', 'volley']; // class signature kinds (setHeroSignature)
const RM_WAVE_PAUSE = 2.4; // seconds between waves (shows the banner)
// Weapon styles (setHeroWeapon, MMWeapons/MMProjectile/MMFxDraw). Saved `wpn_<style>` ids the build does not know yet are kept as inert items.
const RM_WPN_ID = /^wpn_[a-z_]{3,24}$/;
const RM_WPN_CAP = 40; // live styled bolts per hero
const RM_WPN_ST = ['slowed', 'weak', 'dazed', 'armorBroken', 'curse', 'bleed', 'rooted', 'marked']; // bolt `st` = index + 1 (0 = none); applied by the status wiring
const RM_BOLT_D = { player: 26, enemy: 24 }; // art bolt draw sizes in px (enemy never above 1.3x the player bolt)
const RM_SPARK_MAX = 24, RM_SPARK_LIFE = 0.25;
const RM_SPARK_CLASS = { ranger: 'a', bruiser: 'a', berserker: 'a', punk: 'a', rogue: 'a', paladin: 'a', frostcaller: 'b', herald: 'b', druid: 'b', warlock: 'c', necromancer: 'c', trickster: 'c', gravetender: 'c', shadowpaw: 'c' };
const RM_EB_ROT = { ebolt_shard: 1, ebolt_arrow: 1, ebolt_fire: 1, ebolt_frost: 1, ebolt_laser_h: 1, ebolt_skull: 0 };
const RM_WPN_COLOR = { dot: '#ffe27a', arrow: '#f3d9a4', shard: '#9fe3ff', orb: '#c59bff', star: '#ffd24a', blade: '#e6edf3', page: '#fff3c4', axe: '#ff9a6a', hammer: '#ffcf5a', fist: '#ffb38a', ray: '#7ee7ff' };
// URL kill switches (S12): ?unlocks=0 turns off the unlock-tree passives / Nova II / Dash II, ?weapons=0 the styled weapon items.
function rmFlagOff(name) { try { return typeof location !== 'undefined' && new RegExp('[?&]' + name + '=0(&|$)').test(location.search || ''); } catch (e) { return false; } }
function rmInertDef(id) {
  if (RM_ITEM_BY_ID[id]) return RM_ITEM_BY_ID[id];
  const name = id.slice(4).split('_').filter(Boolean).map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ').slice(0, 24) || 'Weapon';
  const def = { id, slot: 'none', name, icon: '🗡️', stat: 'none', amount: 0, text: 'not usable yet', inert: true };
  RM_ITEM_BY_ID[id] = def; // lookup only: never in RM_ITEMS, so never dropped or sold in the shop
  return def;
}
// Styled weapon items (S12): the 26 MMWeaponItems `wpn_<style>` defs become real weapon-slot items (dmg +0.45 x rarity, a sidegrade of the
// Spark Wand) whose style drives setHeroWeapon. Only when mm-weapon-items.js is on the page and not ?weapons=0; otherwise saved wpn_ ids stay
// the inert items above. RM_BASE_ITEMS keeps the 7 classic items for every classic pool (death cache, wave bags, the classic shop).
const RM_BASE_ITEMS = RM_ITEMS.slice();
const RM_WPN_ITEMS = [];
(function rmRegisterWeapons() {
  if (rmFlagOff('weapons') || typeof MMWeaponItems === 'undefined' || typeof MMWeapons === 'undefined' || !MMWeaponItems || !Array.isArray(MMWeaponItems.ITEMS)) return;
  MMWeaponItems.ITEMS.forEach((it) => {
    if (!it || typeof it.id !== 'string' || !RM_WPN_ID.test(it.id) || RM_ITEM_BY_ID[it.id] || typeof it.style !== 'string' || typeof it.family !== 'string') return;
    const def = { id: it.id, slot: 'weapon', name: String(it.name || it.style).slice(0, 24), icon: typeof it.icon === 'string' && it.icon ? it.icon : '🗡️', art: typeof it.art === 'string' && it.art ? it.art : null,
      stat: 'dmg', amount: 0.45, text: 'damage', style: it.style, family: it.family, wpn: true };
    RM_ITEMS.push(def); RM_ITEM_BY_ID[def.id] = def; RM_WPN_ITEMS.push(def);
  });
})();
// A resolved MMWeapons spec, re-clamped into a plain frozen object the engine trusts. Only the 26 alternate styles count (bases keep today's fire).
function rmWpnSpec(s) {
  const n = (v, lo, hi, d) => (typeof v === 'number' && Number.isFinite(v) ? Math.max(lo, Math.min(hi, v)) : d);
  const o = (v) => (v && typeof v === 'object' ? v : {});
  const id = typeof s.id === 'string' ? s.id : '';
  const sidx = MMWeapons.altIds().indexOf(id);
  if (sidx < 0) return null;
  const wv = o(s.wave), ch = o(s.chain), ob = o(s.orbit), bu = o(s.burst), lo = o(s.lob), oh = o(s.onHit);
  return Object.freeze({
    id, sidx, rarity: Math.floor(n(s.rarity, 0, 3, 0)), shape: MMWeapons.SHAPES.indexOf(s.shape) >= 0 ? s.shape : 'dot',
    count: Math.floor(n(s.count, 1, 5, 1)), spread: n(s.spread, 0, 1, 0), spd: n(s.spd, 0.3, 2, 1), life: n(s.life, 0.1, 2, 0.85), size: n(s.size, 0.5, 3, 1), rate: n(s.rate, 0.3, 1.5, 1),
    dmg: n(s.dmg, 0.02, 3, 1), crit: n(s.crit, 0, 0.5, 0), pierce: Math.floor(n(s.pierce, 0, 3, 0)), bounce: Math.floor(n(s.bounce, 0, 3, 0)), homing: n(s.homing, 0, 8, 0),
    wave: Object.freeze({ amp: n(wv.amp, 0, 40, 0), cycles: n(wv.cycles, 0.5, 8, 2.75), alt: wv.alt === true }), boomerang: s.boomerang === true,
    chain: Object.freeze({ n: Math.floor(n(ch.n, 0, 3, 0)), range: n(ch.range, 0, 400, 120), falloff: n(ch.falloff, 0, 1, 0.7) }),
    orbit: Object.freeze({ n: Math.floor(n(ob.n, 0, 3, 0)), radius: n(ob.radius, 8, 120, 34), period: n(ob.period, 0.2, 5, 0.9), dmg: n(ob.dmg, 0, 3, 0), rehit: n(ob.rehit, 0.1, 2, 0.3) }),
    burst: Object.freeze({ n: Math.floor(n(bu.n, 1, 5, 1)), gap: n(bu.gap, 0, 0.5, 0) }),
    lob: Object.freeze({ radius: n(lo.radius, 0, 100, 0), maxRange: n(lo.maxRange, 40, 600, 260) }),
    knock: n(s.knock, 0, 40, 0), onHit: Object.freeze({ status: RM_WPN_ST.indexOf(oh.status) >= 0 ? oh.status : null, chance: n(oh.chance, 0, 1, 0), sec: n(oh.sec, 0, 10, 0) }),
  });
}
// Wire code: the optional 5th `fp` element. low 10 bits = ((alt style index * 4 + rarity) * 2 + helix phase); the rest = lob distance in px.
function rmWpnWire(w, ph, lobD) { return ((w.sidx * 4 + w.rarity) * 2 + (ph ? 1 : 0)) + 1024 * Math.max(0, Math.min(600, Math.round(lobD || 0))); }
const RM_WPN_REMOTE = Object.create(null); // guest: wire key -> spec (at most 26 x 4)
function rmWpnUnwire(code) {
  if (typeof MMWeapons === 'undefined' || typeof MMProjectile === 'undefined' || typeof code !== 'number') return null;
  const c = Math.floor(code);
  if (!Number.isFinite(c) || c < 0 || c >= 1024 * 601) return null;
  const sc = c % 1024, key = sc >> 1, id = MMWeapons.altIds()[key >> 2];
  if (!id) return null;
  if (RM_WPN_REMOTE[key] === undefined) {
    const st = MMWeapons.get(id), fam = MMWeapons.CLASS_FAMILY;
    const cls = st ? Object.keys(fam).find((k) => fam[k] === st.family) : null;
    RM_WPN_REMOTE[key] = cls ? rmWpnSpec(MMWeapons.resolve(cls, id, key & 3)) : null;
  }
  const w = RM_WPN_REMOTE[key];
  if (!w) return null;
  const lobD = Math.floor(c / 1024);
  return { w, ph: sc & 1, lobD: w.lob.radius > 0 ? Math.max(24, lobD || w.lob.maxRange) : 0 };
}

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
    const def = typeof it.id === 'string' ? (RM_ITEM_BY_ID[it.id] || (RM_WPN_ID.test(it.id) ? rmInertDef(it.id) : null)) : null;
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
    this.world = null; this.mode = 'waves'; this.camera = { x: 0, y: 0, vw: 960, vh: RM_SHORT }; this._camF = { x: 0, y: 0 }; // setWorld / setMode: a scrolling world with a camera (null = the screen is the world, today's behaviour)
    this._solidAt = null; this._shotSolidAt = null; this._curDm = 1; this.onEnemyKilled = null; this.onEnemyHit = null; // world tile collision + additive kill / hit callbacks (default null)
    this.onHeroPanel = null; this._heroTab = 'pick'; this.onItem = null; this.onDeathCache = null; this.onMenuOpen = null; this.menuNote = null; // additive loot hooks (Lantern stash payout); null = off (classic arena, town gate)
    const sd = seed === undefined ? (Date.now() & 0xffffffff) : seed;
    this.rng = rmRng(sd);
    this._wpnRng = rmRng(((Number(sd) >>> 0) ^ 0x5bd1e995) >>> 0); // styled-weapon drop rolls (S12): their own seeded stream, so the main rng sequence is unchanged
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
    this._itemArt = null; this._enemyArt = null; this._enemyMap = null; this._driftMap = null; this._enemyDbgOn = false; this._bossArt = null; this._bossLoad = null; this._bossDbg = null; this._bossGhost = null; this._bossReq = null; this._biomeEnemyMap = null; this._edGhosts = null; // optional enemy animations (setEnemyArt)
    this._boltArt = null; this._boltCls = null; this._baCache = null; this._sparks = null; this._curE = null; this._baDraws = 0; this._baeDraws = 0; this._sparkSpawned = 0; this._sparkDraws = 0; // optional bolt art (setBoltArt)
    this.heroProfile = null; // setHeroProfile
    this._heroSrc = null; this._hu = null; // setHeroLevelSource: the active hero {cls, level} (null = classic: account level, no unlock nodes)
    this.weapon = null; this._wq = []; this._wOrbT = [0, 0, 0]; this._wOrbA = 0; this._wCache = null; this._kIn = {}; this._kHero = { x: 0, y: 0 }; this._kWall = 0; this._kW = null; // setHeroWeapon (null = today's fire)
    this.sig = null; this._sigAb = { id: 'sig', key: 'f', icon: '🔥', name: 'Signature', short: '', level: 7, cd: 15 }; // setHeroSignature: the class signature takes the F slot (null = Overdrive, today's behaviour)
    this.sg = { powT: 0, powMul: 1, fx: { t: 0, max: 0.5, x: 0, y: 0, r: 0, color: '#fff' }, bloom: { t: 0, x: 0, y: 0, r: 0, tick: 0 }, bones: { t: 0, a: 0, n: 0, heal: 0, frac: 0 } }; // signature runtime state (preallocated)
    this._heroArt = null; this._heroClass = null; this._heroSt = null; this._heroDbg = null; this._heroHurtAt = -9; this._heroAtkAt = -9; // optional hero animations (setHeroArt)
    this.team = null; this.role = 'solo'; this.down = false; this.reviveT = 0; this._firing = false;
    this._menuMode = false; this._deathShown = false; this._lastCache = ''; this._menuDom = null; this._deathDom = null; this._menuBtn = null; // in-game menu + death screen: opt-in via setMenuMode(true)
    this._pf = { ema: 16, slow: 0, fast: 0, q: 1, on: false }; this._cssK = 1; this._vpKey = ''; this._cvKey = ''; this._rzKey = ''; // perf guard (render-resolution scale) + resize caches
    try { this._pf.on = (typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches) || (typeof window !== 'undefined' && 'ontouchstart' in window); } catch (e) { this._pf.on = false; }

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
    this.pBullets = make(RM_POOL.pBullets, () => ({ active: false, x: 0, y: 0, vx: 0, vy: 0, life: 0, ws: null, st: 0, age: 0, cx: 0, cy: 0, ph: 0, bc: 0, ch: 0, ux: 1, uy: 0, sp: 0, bk: false, tx: 0, ty: 0, lb: 0, ho: 0 })); // ws..ho: weapon-style bolt state (setHeroWeapon)
    this.eBullets = make(RM_POOL.eBullets, () => ({ active: false, x: 0, y: 0, vx: 0, vy: 0, life: 0, kind: 0, ea: null }));
    this.enemies = make(RM_POOL.enemies, () => ({ active: false, type: 'aimed', x: 0, y: 0, hp: 0, maxHp: 0, t: 0, cd: 0, cd2: 0, angle: 0, flash: 0, ax: 0, ay: 0, dir: 1, phase: 0, invuln: 0 }));
    this.drifters = make(RM_POOL.drifters, () => ({ active: false, x: 0, y: 0, vx: 0, vy: 0, t: 0, turn: 0, kind: 'wisp' }));
    this.hazards = make(RM_POOL.hazards, () => ({ active: false, x: 0, y: 0, kind: 'lava', tick: 0 }));
    this.biome = 0; this.clock = 0; this.bossT0 = 0; this._speedMul = 1;
    this.particles = make(RM_POOL.particles, () => ({ active: false, x: 0, y: 0, vx: 0, vy: 0, life: 0, max: 1, color: '#fff', size: 3 }));
    this.texts = make(RM_POOL.texts, () => ({ active: false, x: 0, y: 0, vy: 0, life: 0, text: '', color: '#fff', ico: '', ir: 0, plain: '' }));
    this.bags = make(RM_POOL.bags, () => ({ active: false, x: 0, y: 0, vx: 0, vy: 0, t: 0, id: '', r: 0 }));
    this.abilityCd = [0, 0, 0, 0];
    this.shield = { hits: 0, t: 0 };
    this.overdriveT = 0;
    this.player = { x: 0, y: 0, hp: RM_PLAYER.hp, dashT: 0, iframes: 0, fireCd: 0, aim: 0, facing: 1, moving: false, bob: 0, status: null, _stm: null, _stNext: Infinity, _stAcc: 0 }; // status..: MMStatus state + cached mods (applyStatus)
    this._stT = 0; this._stList = null; this._stListT = -1; this._stDrawn = []; this._stCache = null; this._stAnchor = null; this._stAnchorT = -1; // status clock (s), HUD icon row
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
      b.style.cssText = 'position:absolute;right:0;top:calc(100% + 4px);pointer-events:auto;width:44px;height:44px;border-radius:50%;border:2px solid rgba(255,255,255,0.6);background:rgba(0,0,0,0.55);font-size:18px;padding:0;'; // out of the flex row so the phone HUD keeps its width
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
    const um = this._unl(); // unlocked passive nodes (MMUnlocks, S12) at the active hero's level; null = classic / ?unlocks=0 / no hero
    if (um) { const m = um.mul; if (m.hp) st.maxHp = Math.max(1, Math.round(st.maxHp * m.hp)); if (m.dmg) st.dmg *= m.dmg; if (m.rate) st.rate *= m.rate; if (m.speed) st.speed *= m.speed; if (m.iframes) st.iframes *= m.iframes; }
    const hs = this._heroWorldScale(); // world mode only: MMDifficulty.heroScale (easy start); 1x in the classic arena, dungeons, ?difficulty=off
    if (hs) { st.dmg *= hs.dmg; st.rate *= hs.rate; }
    let dm = this.buffDmg > 1 && this.buffDmg <= 1.5 ? this.buffDmg : 1; // additive timed buff (world shrine of Fury), set by realm-world.js
    const sm = this.player && this.player._stm; // status mods (applyStatus): the damage multiplier incl. buffDmg is capped to 0.5..1.6
    if (sm) { dm = Math.max(0.5, Math.min(1.6, dm * sm.dmg)); st.rate *= sm.rate; st.speed *= sm.speed; }
    st.dmg *= dm;
    st.guard = this._calcGuard();
    this.stats = st;
    return st;
  }

  _heroWorldScale() {
    if (this.mode !== 'world' || !this.world || this.dungeon || this.team || typeof MMDifficulty === 'undefined' || typeof MMDifficulty.heroScale !== 'function') return null;
    let off = false; try { off = MMDifficulty.isOff(typeof location !== 'undefined' ? location.search : ''); } catch (e) { off = false; }
    return off ? null : MMDifficulty.heroScale();
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
    if (g <= 0 || (this.player._stm && this.player._stm.guard0)) return dmg; // armorBroken: guard 0
    if (typeof MMStats !== 'undefined') return MMStats.damageTaken(dmg, g);
    return Math.max(Math.ceil(dmg * 0.25), dmg - g);
  }

  // ---------- status effects (MMStatus, CLASS-WEAPON-BUILD-PLAN S9). Every piece is a no-op when mm-status.js is not loaded; duels stay plain. ----------

  _stOn() { return typeof MMStatus !== 'undefined' && !(this.team && this.team.isPvp); }
  _stKind(t) { return t === this.player ? 'player' : t.type === 'boss' || t.dg === 'boss' ? 'boss' : 'enemy'; }

  // applyStatus(target, id, opts): target 'player' (or this.player) or a live enemy from the pool. opts {sec, stacks, pot, src, fromBolt, picnic, safe}
  // as in MMStatus.apply. Returns true when the status took (or refreshed). The player's stats are recomputed at once.
  applyStatus(target, id, opts) {
    if (!this._stOn() || typeof id !== 'string') return false;
    const t = target === 'player' || target === undefined || target === null ? this.player : target;
    if (!t || typeof t !== 'object' || (t !== this.player && (!t.active || this.enemies.indexOf(t) < 0))) return false;
    if (t === this.player && (this.state === 'dead' || this.down)) return false;
    const o = opts && typeof opts === 'object' ? opts : {};
    const now = this._stT * 1000; const kind = this._stKind(t);
    const before = t.status && t.status.fx ? t.status.fx[id] : null; const was = before ? `${before.until}|${before.stacks}|${before.pot}` : '';
    const next = MMStatus.apply(t.status, id, { sec: o.sec, stacks: o.stacks, pot: o.pot, src: typeof o.src === 'string' ? o.src : '', kind, fromBolt: !!o.fromBolt, picnic: !!o.picnic, safe: !!o.safe }, now);
    const f = Object.prototype.hasOwnProperty.call(next.fx, id) ? next.fx[id] : null;
    const ok = !!f && f.until > now && `${f.until}|${f.stacks}|${f.pot}` !== was;
    t.status = next;
    this._stRefresh(t);
    if (t === this.player) {
      if (ok && id === 'shielded') { this.shield.hits = Math.max(this.shield.hits, f.stacks); this.shield.t = Math.max(this.shield.t, (f.until - now) / 1000); } // the existing shield soaks the hits
      this._calcStats(); this._stList = null;
    }
    return ok;
  }

  // Drop expired effects and cache the mods + the next expiry, so the frame loop reads plain numbers and never allocates.
  _stRefresh(t) {
    const now = this._stT * 1000;
    const s = MMStatus.tick(t.status, now); let next = Infinity;
    for (const id in s.fx) if (s.fx[id].until < next) next = s.fx[id].until;
    t.status = next === Infinity ? null : s; t._stNext = next; t._stAcc = next === Infinity ? 0 : t._stAcc || 0;
    t._stm = next === Infinity ? null : MMStatus.mods(s, now, this._stKind(t));
  }

  // The statuses on `target` ('player' or an enemy) for tests and panels: [{id, left (s), stacks}], negatives first.
  statusOf(target) {
    const t = target === 'player' || !target ? this.player : target;
    if (typeof MMStatus === 'undefined' || !t || !t.status) return [];
    return MMStatus.iconList(t.status, this._stT * 1000, 6).map((i) => ({ id: i.id, left: Math.round(i.left * 100) / 100, stacks: i.stacks }));
  }

  // Player side, once per frame: expiry, healing regen and bleed (bleed never drops you below 1 hp).
  _stTick(dt) {
    const p = this.player;
    if (!p.status) return;
    if (typeof MMStatus === 'undefined') { p.status = null; p._stm = null; p._stNext = Infinity; return; }
    if (p._stNext <= this._stT * 1000) { this._stRefresh(p); this._calcStats(); this._stList = null; }
    const m = p._stm; if (!m || this.state === 'dead' || this.down || (this.role === 'guest' && this.team)) return;
    const rate = (m.noHeal ? 0 : m.regen) - m.dot; if (!rate) return;
    p._stAcc += rate * dt;
    if (p._stAcc >= 1) { const n = Math.floor(p._stAcc); p._stAcc -= n; this._sigHeal(n); } else if (p._stAcc <= -1) {
      const n = Math.floor(-p._stAcc); p._stAcc += n; const hp = Math.max(1, p.hp - n);
      if (hp < p.hp) { p.hp = hp; this._floatText(p.x, p.y - 22, `-${n}`, '#ff5f6b'); this._syncHud(); }
    }
  }

  // Enemy bleed: 0.5 x hero damage per second per stack, dealt every 0.5 s.
  _stEnemyDot(e, m, dt) {
    e._stAcc += dt;
    if (e._stAcc < 0.5) return;
    e._stAcc -= 0.5;
    this._hitEnemy(e, m.dot * (this.stats.dmg || 1) * 0.5);
  }

  // Where the HUD icon row goes (logical arena units): just under the XP bar on the left, and under the boss bar if they would overlap.
  // Also the HUD-safe band of the top-right buttons (bL..right edge, down to bB), kept clear of floating numbers.
  // DOM rects are read at most twice a second (never every frame) and again after a resize.
  _stAnchorAt() {
    if (this._stAnchor && this._stT - this._stAnchorT < 0.5 && this._stAnchorT <= this._stT) return this._stAnchor;
    this._stAnchorT = this._stT;
    const k = this._cssK || 1; const a = this._stAnchor || (this._stAnchor = { x: 8, y: 64, px: 20, k: 1, cl: 0, ct: 0, bL: 1e9, bB: -1 });
    a.k = k;
    try {
      const cr = this.canvas.getBoundingClientRect(); a.cl = cr.left; a.ct = cr.top;
      const vis = (el) => (el && !el.classList.contains('hidden') && el.getClientRects().length ? el.getBoundingClientRect() : null);
      const xp = vis(document.getElementById('realm-xp')) || vis(document.getElementById('realm-hp'));
      const left = xp ? xp.left : cr.left + 8; let top = (xp ? xp.bottom : cr.top + 56) + 4;
      const rowR = left + 6 * (a.px + 3);
      const boss = vis(document.getElementById('realm-boss'));
      if (boss && boss.left < rowR && boss.right > left && boss.bottom > top - 2 && boss.top < top + a.px) top = boss.bottom + 4;
      a.x = Math.max(0, (left - cr.left) / k); a.y = Math.max(0, (top - cr.top) / k);
      let bl = 1e9; let bb = -1;
      ['realm-bp-btn', 'realm-board-btn', 'realm-menu-btn', 'realm-leave-btn'].forEach((id) => { const r = vis(document.getElementById(id)); if (r && r.width > 0 && r.left > cr.left + cr.width * 0.4) { bl = Math.min(bl, r.left); bb = Math.max(bb, r.bottom); } });
      a.bL = bl < 1e9 ? (bl - cr.left) / k - 4 : 1e9; a.bB = bb >= 0 ? (bb - cr.top) / k + 4 : -1;
    } catch (e) { a.x = 8; a.y = 64; a.bL = 1e9; a.bB = -1; }
    return a;
  }

  // HUD: up to 6 player status icons (20 css px), negatives first; each is a cached MMFxDraw.drawIcon canvas (the clock pie in 12 steps).
  _drawStatusIcons(g) {
    const out = this._stDrawn; out.length = 0; const pool = this._stPool || (this._stPool = Array.from({ length: 6 }, () => ({ id: '', x: 0, y: 0, size: 0, neg: false }))); // reused: no per-frame objects
    const p = this.player;
    if (!p.status || !p._stm || typeof MMFxDraw === 'undefined' || typeof MMStatus === 'undefined' || this.state === 'dead') return;
    if (!this._stList || this._stT - this._stListT >= 0.1 || this._stListT > this._stT) { this._stList = MMStatus.iconList(p.status, this._stT * 1000, 6); this._stListT = this._stT; }
    const list = this._stList; if (!list.length) return;
    const a = this._stAnchorAt(); const L = a.px / a.k; const px = Math.max(8, Math.round(L * (this.scale || 1)));
    if (!this._stCache) this._stCache = MMFxDraw.makeCache(MMFxDraw.defaultCreate, 96);
    for (let i = 0; i < list.length && i < 6; i++) {
      const it = list[i]; const left = it.left - (this._stT - this._stListT);
      const fr = Math.max(0, Math.min(12, Math.round(it.frac * 12)));
      const cv = this._stCache.get(`${it.id}|${it.stacks}|${fr}|${px}`, px, px, (c, W) => MMFxDraw.drawIcon(c, it.id, W / 2, W / 2, W - 1, { frac: fr / 12, stacks: it.stacks, positive: !it.neg }));
      if (!cv) continue;
      const x = a.x + i * (L + 3 / a.k); const y = a.y;
      const blink = !this._reduced && left <= 1 && Math.floor(this._stT * 6.67) % 2 === 1; // blink in the last second (not with reduced motion)
      if (blink) g.globalAlpha = 0.45;
      g.drawImage(cv, x, y, L, L);
      if (blink) g.globalAlpha = 1;
      const o = pool[out.length]; o.id = it.id; o.x = a.cl + x * a.k; o.y = a.ct + y * a.k; o.size = a.px; o.neg = it.neg; out.push(o);
    }
  }
  // Test / debug hook: the icons drawn on the last frame, in css px from the page's top-left.
  statusIcons() { return this._stDrawn.map((o) => Object.assign({}, o)); }

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
    this.sprites.pBullet = mk(20, 20, (g) => { // your bolt: soft cyan glow, a cyan body with a 1.5 px white outline and a white core
      const gr = g.createRadialGradient(10, 10, 3, 10, 10, 10);
      gr.addColorStop(0, 'rgba(143,233,255,0.55)'); gr.addColorStop(1, 'rgba(60,160,255,0)');
      g.fillStyle = gr; g.fillRect(0, 0, 20, 20);
      const R = RM_BOLT_R.player;
      g.fillStyle = '#5fd8ff'; g.beginPath(); g.arc(10, 10, R - 0.75, 0, Math.PI * 2); g.fill();
      g.strokeStyle = '#f4feff'; g.lineWidth = 1.5; g.beginPath(); g.arc(10, 10, R - 0.75, 0, Math.PI * 2); g.stroke();
      g.fillStyle = '#ffffff'; g.beginPath(); g.arc(10, 10, 2.4, 0, Math.PI * 2); g.fill();
    });
    this.sprites.eBullet = RM_EB_HUES.map(([hue, tint]) => mk(16, 16, (g) => { // enemy bullet: dark rim, saturated body, a small light centre
      const R = RM_BOLT_R.enemy;
      g.fillStyle = '#1a0812'; g.beginPath(); g.arc(8, 8, R, 0, Math.PI * 2); g.fill();
      g.fillStyle = hue; g.beginPath(); g.arc(8, 8, R - 1.6, 0, Math.PI * 2); g.fill();
      g.fillStyle = tint; g.beginPath(); g.arc(8, 8, 1.6, 0, Math.PI * 2); g.fill();
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
    const makeBag = (color) => mk(26, 26, (g) => {
      const gr = g.createRadialGradient(13, 13, 2, 13, 13, 13);
      gr.addColorStop(0, color); gr.addColorStop(1, 'rgba(0,0,0,0)');
      g.globalAlpha = 0.55; g.fillStyle = gr; g.fillRect(0, 0, 26, 26); g.globalAlpha = 1;
      g.fillStyle = '#1a0f2a'; g.fillRect(6, 9, 14, 12); g.fillRect(9, 6, 8, 4);
      g.fillStyle = color; g.fillRect(7, 10, 12, 10); g.fillRect(10, 7, 6, 3);
      g.fillStyle = '#fff'; g.fillRect(11, 13, 4, 4);
    });
    this.sprites.bag = RM_RARITIES.map((rarity) => makeBag(rarity.color));
    this.sprites.worldBag = ['#ad7950', '#ff91b8', '#ad87ec', '#64dfe4', '#f0f0fc', '#ffcf62'].map(makeBag);
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

  // Additive hook: bolt art (MMArt.loadBolts BoltSet, batches b16/b17) for the class bolt (`cls` = Mad Maze class id), enemy bullets and hit sparks.
  // null / ?boltart=0 = today's code-drawn bolts. Missing ids fall back silently per bolt. Frames are baked lazily into small cached canvases (id x 16 headings x frame).
  setBoltArt(set, cls) {
    let off = false;
    try { off = typeof location !== 'undefined' && /[?&]boltart=0(&|$)/.test(location.search || ''); } catch (e) { off = false; }
    const ok = !off && set && typeof set.anim === 'function' && typeof set.has === 'function';
    this._boltArt = ok ? set : null; this._boltCls = ok && typeof cls === 'string' ? cls : null;
    this._baCache = ok ? Object.create(null) : null;
    this._sparks = ok ? this._sparks || Array.from({ length: RM_SPARK_MAX }, () => ({ active: false, x: 0, y: 0, t: 0, id: '' })) : null;
    if (!ok && this._sparks) this._sparks.forEach((q) => { q.active = false; });
    return ok;
  }
  setBoltClass(cls) { this._boltCls = typeof cls === 'string' ? cls : null; } // hero switch: the class bolt follows the active hero
  boltArtDraws() { return this._baDraws; }
  boltArtStats() { return { player: this._baDraws, enemy: this._baeDraws, sparkSpawned: this._sparkSpawned, sparkDraws: this._sparkDraws, sparksLive: this._sparks ? this._sparks.filter((q) => q.active).length : 0 }; }
  _boltPlayerId() { const c = this._boltCls; return c && this._boltArt && this._boltArt.has('bolt_' + c) ? 'bolt_' + c : null; }
  // Enemy bullet art id for a pattern kind (0 aimed, 1 spiral, 2 ring) and the enemy firing it (this._curE): creature element / kind first, then the pattern.
  _ebSelect(kind) {
    const A = this._boltArt; if (!A) return null;
    const e = this._curE;
    let id = null;
    const nm = e && e.type !== 'boss' ? String(e.art || this._enemyNameFor(e.type) || '') : '';
    if (nm) {
      if (/ice|frost|wraith|snow|yeti/.test(nm)) id = 'ebolt_frost';
      else if (/fire|ember|cinder|flame|inferno|lava|magma/.test(nm)) id = 'ebolt_fire';
      else if (/spider|slime|poison|toad|mire|bog|ooze/.test(nm)) id = 'ebolt_poison';
      else if (/skelet|skull|bone|undead|ghoul|lich/.test(nm)) id = 'ebolt_skull';
      else if (kind === 0 && /archer|arrow|bow|hunter/.test(nm)) id = 'ebolt_arrow';
    }
    if (!id) id = e && e.type === 'boss' && kind === 0 ? 'ebolt_shard' : kind === 1 ? 'ebolt_orb_purple' : kind === 2 ? 'ebolt_ring_pulse' : 'ebolt_orb_red';
    return A.has(id) ? id : (A.has('ebolt_orb_red') && kind === 0 ? 'ebolt_orb_red' : null);
  }
  // Cached baked frame (id, heading 0..15, frame 0..3) at draw size d; created once, then blitted. null when the art is missing.
  _boltCv(id, rot, f, d) {
    let arr = this._baCache[id];
    if (!arr) arr = this._baCache[id] = new Array(64).fill(null);
    const i = rot * 4 + f; let cv = arr[i];
    if (cv) return cv; if (cv === 0) return null;
    const an = this._boltArt.anim(id);
    if (!an || typeof document === 'undefined') { arr[i] = 0; return null; }
    try {
      const S = Math.ceil(d * 1.5) + 2;
      cv = document.createElement('canvas'); cv.width = cv.height = S;
      const c = cv.getContext('2d'); c.imageSmoothingEnabled = false;
      c.translate(S / 2, S / 2); c.rotate(rot * Math.PI / 8);
      c.drawImage(an.img, (f % an.frames) * an.fw, 0, an.fw, an.fh, -d / 2, -d / 2, d, d);
      arr[i] = cv; return cv;
    } catch (e) { arr[i] = 0; return null; }
  }
  _boltFrame() { return this._reduced ? 0 : Math.floor(this.clock * 12) & 3; }
  _drawBoltArt(g, b) { // a class bolt (not weapon style) from art; returns true when drawn
    const id = this._boltPlayerId(); if (!id) return false;
    const rot = (Math.round(Math.atan2(b.vy, b.vx) / (Math.PI / 8)) + 16) & 15;
    const cv = this._boltCv(id, rot, this._boltFrame(), RM_BOLT_D.player); if (!cv) return false;
    g.drawImage(cv, b.x - cv.width / 2, b.y - cv.height / 2); this._baDraws++; return true;
  }
  _drawEBoltArt(g, b) {
    const id = b.ea; if (!id) return false;
    const rot = RM_EB_ROT[id] ? (Math.round(Math.atan2(b.vy, b.vx) / (Math.PI / 8)) + 16) & 15 : 0;
    const cv = this._boltCv(id, rot, this._boltFrame(), RM_BOLT_D.enemy); if (!cv) return false;
    g.drawImage(cv, b.x - cv.width / 2, b.y - cv.height / 2); this._baeDraws++; return true;
  }
  _sparkFamily(b) {
    if (b.ws) { const h = RM_WPN_COLOR[b.ws.shape] || '#ffffff'; const r = parseInt(h.substr(1, 2), 16), gg = parseInt(h.substr(3, 2), 16), bb = parseInt(h.substr(5, 2), 16); return bb > r && bb >= gg ? (r > gg ? 'c' : 'b') : r > gg + 20 && bb > gg + 20 ? 'c' : 'a'; }
    return RM_SPARK_CLASS[this._boltCls] || 'a';
  }
  _spawnSpark(b) { // pooled; the oldest slot is reused when all 24 are live
    const A = this._boltArt, pool = this._sparks; if (!A || !pool) return;
    const id = 'hit_spark_' + this._sparkFamily(b); if (!A.has(id)) return;
    let q = null, old = pool[0];
    for (let i = 0; i < pool.length; i++) { const c = pool[i]; if (!c.active) { q = c; break; } if (c.t > old.t) old = c; }
    if (!q) q = old;
    q.active = true; q.x = b.x; q.y = b.y; q.t = 0; q.id = id; this._sparkSpawned++;
  }
  _updateSparks(dt) { const p = this._sparks; if (!p) return; for (let i = 0; i < p.length; i++) { const q = p[i]; if (q.active) { q.t += dt; if (q.t >= RM_SPARK_LIFE) q.active = false; } } }
  _drawSparks(g) {
    const p = this._sparks; if (!p) return;
    for (let i = 0; i < p.length; i++) {
      const q = p[i]; if (!q.active) continue;
      const red = this._reduced, f = red ? 0 : Math.min(3, Math.floor(q.t / RM_SPARK_LIFE * 4)); // reduce-motion: one frame, fading
      const cv = this._boltCv(q.id, 0, f, 28); if (!cv) continue;
      if (red) g.globalAlpha = 1 - q.t / RM_SPARK_LIFE;
      g.drawImage(cv, q.x - cv.width / 2, q.y - cv.height / 2); this._sparkDraws++;
      if (red) g.globalAlpha = 1;
    }
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
    this.heroProfile = ok ? { name: String(profile.name || '').slice(0, 40), hp: m(profile.hp), dmg: m(profile.dmg), rate: m(profile.rate), speed: m(profile.speed), iframes: m(profile.iframes),
      shots: Math.max(1, Math.min(5, Math.floor(Number(profile.shots)) || 1)), spread: Math.max(0, Math.min(1, Number(profile.spread) || 0)), pierce: Math.max(0, Math.min(3, Math.floor(Number(profile.pierce)) || 0)),
      shotDmg: Math.max(0.2, Math.min(1.5, Number(profile.shotDmg) || 1)), critChance: Math.max(0, Math.min(0.5, Number(profile.critChance) || 0)), boltSpeed: Math.max(0.5, Math.min(1.3, Number(profile.boltSpeed) || 1)) } : null;
    if (this.save) { this._calcStats(); if (this.player && this.player.hp > this.stats.maxHp) this.player.hp = this.stats.maxHp; if (this.active) this._syncHud(); }
  }
  // Additive hook (S12): fn() -> the active hero {cls, level} (MMProfile). With a hero, the unlock-tree nodes (MMUnlocks: class passives,
  // Nova II, Dash II) and the styled weapon items follow THAT hero's class and level; without one (null fn / null result) the arena is the
  // classic one: account level only, no nodes. The four ability slots keep their account-level gates (abilityUnlocked) so nothing is lost.
  setHeroLevelSource(fn) { this._heroSrc = typeof fn === 'function' ? fn : null; return this.refreshHeroLevel(); }
  refreshHeroLevel() {
    let h = null;
    if (this._heroSrc) { try { h = this._heroSrc(); } catch (e) { h = null; } }
    const cls = h && typeof h === 'object' && typeof h.cls === 'string' && /^[A-Za-z]{2,16}$/.test(h.cls) ? h.cls : null;
    const lv = h && typeof h === 'object' ? Math.floor(Number(h.level)) : NaN;
    this._hu = cls ? { cls, level: Number.isFinite(lv) && lv >= 1 ? Math.min(RM_MAX_LEVEL, lv) : 0, key: '', agg: null } : null;
    const wu = this.save && this._heroSrc ? this.save.eq.weapon : 0; // switching to a hero of another family takes a styled weapon off (it stays in the backpack)
    const wi = wu ? this.save.items.find((x) => x.n === wu) : null;
    if (wi && RM_ITEM_BY_ID[wi.id] && RM_ITEM_BY_ID[wi.id].wpn && !this._wpnCanEquip(RM_ITEM_BY_ID[wi.id])) delete this.save.eq.weapon;
    if (this.save) { this._calcStats(); if (this.player && this.player.hp > this.stats.maxHp) this.player.hp = this.stats.maxHp; if (this.active) this._syncHud(); }
    return this._hu ? { cls: this._hu.cls, level: this.heroLevel() } : null;
  }
  heroClass() { return this._hu ? this._hu.cls : null; }
  // A styled weapon item needs an active hero of its family (MMWeapons.CLASS_FAMILY); never in duels.
  _wpnCanEquip(def) {
    const cls = this.heroClass();
    if (!def || !def.wpn || !cls || (this.team && this.team.isPvp) || typeof MMWeapons === 'undefined') return false;
    try { return MMWeapons.familyOf(cls) === def.family; } catch (e) { return false; }
  }
  _wpnHint(def) { try { return (typeof MMWeaponItems !== 'undefined' && MMWeaponItems.equipHint(def.id)) || def.family; } catch (e) { return def.family; } }
  // The level the unlock nodes read: the active hero's level when a hero is set (and has one), else the account-wide arena level.
  heroLevel() { return this._hu && this._hu.level ? this._hu.level : (this.save ? this.save.level : 1); }
  // Aggregated unlocked mods for the active hero (cached per class+level). null in duels, with ?unlocks=0, without MMUnlocks or a hero.
  _unl() {
    const u = this._hu;
    if (!u || (this.team && this.team.isPvp) || typeof MMUnlocks === 'undefined' || typeof MMUnlocks.aggregate !== 'function' || rmFlagOff('unlocks')) return null;
    const lv = this.heroLevel(), key = u.cls + ':' + lv;
    if (u.key !== key) { try { u.agg = MMUnlocks.aggregate(u.cls, lv); } catch (e) { u.agg = null; } u.key = key; }
    return u.agg;
  }
  // Nova bolts: 16, or 20 once Nova II is unlocked (L11). A co-op guest keeps 16 (the host fires a guest's Nova with 16).
  _novaBolts() { return this._unl() && this.role !== 'guest' && typeof MMUnlocks.novaBolts === 'function' ? MMUnlocks.novaBolts(this.heroLevel()) : 16; }
  // An ability's cooldown after the unlock nodes: Dash II (L16: 3 -> 2.5 s) and `ab` cooldown mods (e.g. trickster Slippery x0.87). 'set' first, then 'mul'.
  _abCd(ab) {
    const u = ab && ab.id === 'dash' ? this._unl() : null;
    if (!u) return ab.cd;
    let cd = typeof MMUnlocks.dashCooldown === 'function' ? MMUnlocks.dashCooldown(this.heroLevel()) : ab.cd;
    u.ab.forEach((m) => { if (m.ability === 'dash' && m.field === 'cooldown' && m.mode === 'set' && Number.isFinite(m.v)) cd = m.v; });
    u.ab.forEach((m) => { if (m.ability === 'dash' && m.field === 'cooldown' && m.mode === 'mul' && Number.isFinite(m.v)) cd *= m.v; });
    cd = Math.max(1, Math.min(ab.cd, cd));
    return this.role === 'guest' ? Math.max(2.4, cd) : cd; // the host enforces 2.4 s between a guest's dashes
  }
  // Additive hook: the class signature ability from MMClasses.arenaSignature(classId). It replaces the F slot (Overdrive) at its level.
  // null / unknown kind = today's behaviour. Never active in team duels (the Dash is the only ability there).
  setHeroSignature(desc) {
    const ok = desc && typeof desc === 'object' && RM_SIG_KINDS.indexOf(desc.kind) >= 0;
    const n = (v, lo, hi, d) => (Number.isFinite(Number(v)) && v !== null && v !== '' ? Math.max(lo, Math.min(hi, Number(v))) : d);
    if (!ok) this.sig = null;
    else {
      this.sig = {
        kind: desc.kind, variant: String(desc.variant || '').slice(0, 20), id: String(desc.id || 'sig').slice(0, 24),
        name: String(desc.name || 'Signature').slice(0, 24), short: String(desc.short || '').slice(0, 9), icon: String(desc.icon || '⭐').slice(0, 8),
        cooldown: n(desc.cooldown, 3, 60, 15), level: Math.floor(n(desc.level, 1, RM_MAX_LEVEL, 7)),
        count: Math.floor(n(desc.count, 1, 24, 6)), spread: n(desc.spread, 0, 6, 0.8), dmg: n(desc.dmg, 0, 12, 1), dist: n(desc.dist, 0, 300, 140),
        range: n(desc.range, 0, 500, 200), radius: n(desc.radius, 10, 260, 90), dur: n(desc.dur, 0, 20, 5), heal: n(desc.heal, 0, 60, 0), healFrac: n(desc.healFrac, 0, 1, 0),
        shield: Math.floor(n(desc.shield, 0, 6, 0)), knock: n(desc.knock, 0, 160, 0), slow: n(desc.slow, 0.05, 1, 1), powMul: n(desc.powMul, 1, 1.6, 1), powSec: n(desc.powSec, 0, 12, 0),
      };
      const a = this._sigAb; a.icon = this.sig.icon; a.name = this.sig.name; a.short = this.sig.short; a.level = this.sig.level; a.cd = this.sig.cooldown;
    }
    this._sigReset();
    if (this.abilityCd) this.abilityCd[3] = 0;
    this._syncAbilities();
  }

  _sigOn() { return !!this.sig && !(this.team && this.team.isPvp); }
  _ab(i) { return i === 3 && this._sigOn() ? this._sigAb : RM_ABILITIES[i]; }
  // Additive hook (S8): the hero's weapon style, a spec from MMWeapons.resolve(classId, styleId, rarity).
  // null, a base style (spec.base), ?weapons=0, or missing MMWeapons/MMProjectile = today's fire. Never used in team duels.
  setHeroWeapon(spec) {
    let off = false;
    try { off = typeof location !== 'undefined' && /[?&]weapons=0(&|$)/.test(location.search || ''); } catch (e) { off = false; }
    const w = !off && spec && typeof spec === 'object' && !spec.base && !spec.plain && typeof MMProjectile !== 'undefined' && typeof MMWeapons !== 'undefined' ? rmWpnSpec(spec) : null;
    this.weapon = w; this._wq.length = 0; this._wOrbT.fill(0);
    if (this.pBullets) this.pBullets.forEach((b) => { if (b.active && b.ws && !b.ho) b.active = false; }); // our old-style bolts in flight end
    return !!w;
  }
  _wpnOn() { return !!this.weapon && !(this.team && this.team.isPvp); }
  _wpnRate() { return this._wpnOn() ? this.weapon.rate : 1; }

  // One trigger pull with a weapon style: the first shot now, burst follow-ups queued (fired from where the hero is then).
  _fireWeapon(aim) {
    const w = this.weapon;
    const base = this.stats.dmg * (this.sg.powT > 0 ? this.sg.powMul : 1) * w.dmg;
    this._wShot(aim, base);
    for (let i = 1; i < w.burst.n && this._wq.length < 12; i++) this._wq.push({ t: i * w.burst.gap, aim, base });
  }
  _wShot(aim, base) {
    const w = this.weapon, p = this.player, n = w.count;
    let live = 0;
    for (let i = 0; i < this.pBullets.length; i++) { const b = this.pBullets[i]; if (b.active && b.ws && !b.own && !b.ho) live++; }
    const lobD = w.lob.radius > 0 ? this._lobDist(aim, w) : 0;
    for (let k = 0; k < n && live < RM_WPN_CAP; k++) {
      const ang = aim + (n > 1 ? (k / (n - 1) - 0.5) * w.spread : 0);
      const d = w.crit > 0 && this.rng() < w.crit ? base * 2 : base;
      const ph = w.wave.alt && (k & 1) ? 1 : 0;
      const b = this.firePlayerBulletFrom(p.x, p.y, ang, d, 0, rmWpnWire(w, ph, lobD));
      if (!b) continue;
      this._styleBolt(b, w, ang, ph, lobD); live++;
    }
  }
  // How far a lobbed shot flies: to the nearest enemy within 0.35 rad of the aim, else its max range.
  _lobDist(aim, w) {
    const p = this.player; let best = w.lob.maxRange;
    for (let i = 0; i < this.enemies.length; i++) {
      const e = this.enemies[i]; if (!e.active) continue;
      const dx = e.x - p.x, dy = e.y - p.y, d = Math.hypot(dx, dy);
      let da = Math.atan2(dy, dx) - aim; while (da > Math.PI) da -= Math.PI * 2; while (da < -Math.PI) da += Math.PI * 2;
      if (d < best && Math.abs(da) < 0.35) best = d;
    }
    return Math.max(24, Math.min(600, Math.round(best)));
  }
  // Turn a fresh pooled bolt (from firePlayerBulletFrom) into a weapon-style bolt. ph: 1 = the alternate helix phase.
  _styleBolt(b, w, ang, ph, lobD) {
    const k = MMProjectile.make(b.x, b.y, ang, w, ph ? Math.PI : 0);
    b.ws = w; b.age = 0; b.ph = k.ph; b.bc = 0; b.ch = w.chain.n; b.bk = false; b.ho = 0;
    b.cx = k.cx; b.cy = k.cy; b.ux = k.ux; b.uy = k.uy; b.vx = k.vx; b.vy = k.vy; b.sp = k.sp; b.tx = 0; b.ty = 0;
    b.life = w.life; b.pr = w.pierce; b.hn = 0; b.h0 = b.h1 = b.h2 = -1;
    b.st = w.onHit.status ? RM_WPN_ST.indexOf(w.onHit.status) + 1 : 0;
    b.lb = lobD > 0 ? 1 : 0;
    if (b.lb) { b.tx = b.x + Math.cos(ang) * lobD; b.ty = b.y + Math.sin(ang) * lobD; }
  }
  // Guest: style a bolt from the host's `fp` event (its optional 5th element). Unknown or missing code = a plain bolt, as before.
  _wpnRemote(b, code, ang) {
    const r = rmWpnUnwire(code);
    if (!r) return;
    this._styleBolt(b, r.w, ang, r.ph, r.lobD);
    b.ho = 1; // boomerangs fly back to the host, not to us
  }
  // The point a boomerang returns to.
  _wpnHero(b) {
    const h = this._kHero, tm = this.team;
    let src = this.player;
    if (b.ho && tm && tm.hostPl) src = tm.hostPl;
    else if (b.own && tm && tm.guests && tm.guests[b.own]) src = tm.guests[b.own];
    h.x = src.x; h.y = src.y;
    return h;
  }
  _wpnWorld() {
    if (this._kW) return this._kW;
    const W = { bw: 0, bh: 0, hero: null };
    W.isWall = (x, y) => {
      if (x < 0 || y < 0 || x > W.bw || y > W.bh) { this._kWall = 1; return true; }
      if (this.walls) { if (this.isWallAt(x, y)) { this._kWall = 2; return true; } return false; }
      if (this._shotSolidAt && this._shotSolidAt(x, y)) { this._kWall = 3; return true; }
      return false;
    };
    W.nearest = (x, y, range, cone, dir) => {
      let best = null, bd = range;
      for (let i = 0; i < this.enemies.length; i++) {
        const e = this.enemies[i]; if (!e.active) continue;
        const dx = e.x - x, dy = e.y - y, d = Math.hypot(dx, dy);
        if (d >= bd) continue;
        let da = Math.atan2(dy, dx) - dir; while (da > Math.PI) da -= Math.PI * 2; while (da < -Math.PI) da += Math.PI * 2;
        if (Math.abs(da) <= cone) { bd = d; best = e; }
      }
      return best;
    };
    this._kW = W;
    return W;
  }
  // Advance one weapon-style bolt (host, solo and guest). Returns true when it is still flying and may hit something this frame.
  _stepWpn(b, dt, bw, bh) {
    const w = b.ws;
    if (b.lb) { // lob: flies without colliding, a 0.25 s ring on the ground, then an area hit
      const l = MMProjectile.lobStep({ sx: b.cx, sy: b.cy, ax: b.tx, ay: b.ty, age: b.age }, w, dt);
      b.age = l.age; b.x = l.x; b.y = l.y; b.lb = l.phase === 'telegraph' ? 2 : 1;
      if (l.phase === 'land') { b.active = false; this._lobLand(b, l.lx, l.ly); }
      return false;
    }
    const W = this._wpnWorld(); W.bw = bw; W.bh = bh; W.hero = w.boomerang ? this._wpnHero(b) : null;
    const k = this._kIn;
    k.x = b.x; k.y = b.y; k.cx = b.cx; k.cy = b.cy; k.ux = b.ux; k.uy = b.uy; k.vx = b.vx; k.vy = b.vy; k.sp = b.sp;
    k.age = b.age; k.ph = b.ph; k.bounces = b.bc; k.back = b.bk; k.tx = b.tx; k.ty = b.ty;
    this._kWall = 0;
    const r = MMProjectile.step(k, w, dt, W), o = r.bolt;
    const turned = !b.bk && o.back;
    b.x = o.x; b.y = o.y; b.cx = o.cx; b.cy = o.cy; b.ux = o.ux; b.uy = o.uy; b.vx = o.vx; b.vy = o.vy; b.sp = o.sp;
    b.age = o.age; b.bc = o.bounces; b.bk = o.back; b.tx = o.tx; b.ty = o.ty; b.life = w.life - o.age;
    if (r.state === 'dead' || r.state === 'returned') {
      b.active = false;
      if (r.state === 'dead' && !(this.role === 'guest' && this.team)) {
        if (this._kWall === 2 && this.dungeon) this.dungeon.onBoltWall(o.cx + o.vx * dt, o.cy + o.vy * dt);
        else if (this._kWall === 3) this._burst(b.x, b.y, '#c9d1d9', 2, 60);
      }
      return false;
    }
    if (turned) { b.hn = 0; b.h0 = b.h1 = b.h2 = -1; } // a boomerang may hit each enemy once more on the way back
    return true;
  }
  // Extra effects of a weapon-style hit (host / solo only): knockback (never bosses) and one chain jump.
  _wpnHit(b, e, idx) {
    const w = b.ws;
    if (b.st > 0) this._wpnStatus(b, e);
    if (w.knock > 0 && e.type !== 'boss' && e.dg !== 'boss') {
      const nx = e.x + b.ux * w.knock, ny = e.y + b.uy * w.knock;
      if (!this._blocked(nx, ny, 8)) { e.x = nx; e.y = ny; }
    }
    if (b.ch > 0) {
      const list = [];
      for (let i = 0; i < this.enemies.length; i++) { const q = this.enemies[i]; if (q.active) list.push({ id: i, x: q.x, y: q.y }); }
      const hit = [idx]; if (b.hn > 0) hit.push(b.h0); if (b.hn > 1) hit.push(b.h1); if (b.hn > 2) hit.push(b.h2);
      const nx = MMProjectile.chainNext({ x: b.x, y: b.y }, list, hit, { chain: { n: b.ch, range: w.chain.range, falloff: w.chain.falloff } }, b.dmg || this.stats.dmg);
      b.ch = 0; // one jump per bolt
      if (nx) {
        const a = Math.atan2(nx.target.y - b.y, nx.target.x - b.x);
        const c = this.firePlayerBulletFrom(b.x - Math.cos(a) * 14, b.y - Math.sin(a) * 14, a, nx.dmg, b.own, rmWpnWire(w, 0, 0));
        if (c) { this._styleBolt(c, w, a, 0, 0); c.ch = nx.chainLeft; c.pr = 0; c.hn = 1; c.h0 = idx; }
      }
    }
  }
  // A lobbed shot lands: area damage on the host / solo, the burst everywhere.
  _lobLand(b, x, y) {
    const w = b.ws;
    this._burst(x, y, RM_WPN_COLOR[w.shape] || '#fff', 10, 160);
    if (this.role === 'guest' && this.team) return;
    const r = w.lob.radius;
    for (let i = 0; i < this.enemies.length; i++) {
      const e = this.enemies[i]; if (!e.active) continue;
      const rr = r + RM_ENEMIES[e.type].r;
      if ((e.x - x) * (e.x - x) + (e.y - y) * (e.y - y) <= rr * rr) { if (b.st > 0) this._wpnStatus(b, e); this._hitEnemy(e, b.dmg || this.stats.dmg); }
    }
  }
  // A weapon bolt's `st` (RM_WPN_ST index + 1) rolls its onHit chance and applies that status to the enemy it hit.
  _wpnStatus(b, e) {
    const oh = b.ws && b.ws.onHit; const id = RM_WPN_ST[b.st - 1];
    if (!id || !oh || !(oh.chance > 0) || !e.active || this.rng() >= oh.chance) return false;
    return this.applyStatus(e, id, { sec: oh.sec > 0 ? oh.sec : undefined, src: 'wpn' });
  }
  // Burst follow-ups and orbiters (at most 3; they only hit on the host / solo, a guest just draws its own).
  _updateWeapon(dt) {
    const q = this._wq;
    if (!this._wpnOn()) { q.length = 0; return; }
    for (let i = q.length - 1; i >= 0; i--) {
      q[i].t -= dt;
      if (q[i].t <= 0) { const s = q[i]; q.splice(i, 1); if (this.state !== 'dead' && !this.down) this._wShot(s.aim, s.base); }
    }
    const w = this.weapon, n = w.orbit.n;
    if (n <= 0) return;
    this._wOrbA += dt;
    if ((this.role === 'guest' && this.team) || this.state === 'dead' || this.down) return;
    for (let i = 0; i < n; i++) {
      this._wOrbT[i] -= dt;
      if (this._wOrbT[i] > 0) continue;
      const o = MMProjectile.orbitPos(i, n, this._wOrbA, w, this.player);
      const hj = this._boltHitIndex(o.x, o.y);
      if (hj >= 0) { this._wOrbT[i] = w.orbit.rehit; this._hitEnemy(this.enemies[hj], this.stats.dmg * (this.sg.powT > 0 ? this.sg.powMul : 1) * w.orbit.dmg); }
    }
  }
  // Code-drawn bolt shapes (MMFxDraw): drawn once per (shape, size, one of 16 headings) into a small cached canvas, then blitted.
  _wpnSprite(shape, size, rot) {
    if (typeof MMFxDraw === 'undefined') return null;
    if (!this._wCache) this._wCache = MMFxDraw.makeCache(MMFxDraw.defaultCreate, 256);
    const r = 5 * size, S = Math.ceil(r * 3.2) + 4;
    return this._wCache.get(shape + '|' + size + '|' + rot, S, S, (c, W, H) => MMFxDraw.drawShape(c, shape, W / 2, H / 2, r, rot * Math.PI / 8, RM_WPN_COLOR[shape] || '#fff'));
  }
  _drawWpnBolt(g, b) {
    const w = b.ws;
    if (b.lb === 2) { g.strokeStyle = 'rgba(255,90,90,0.8)'; g.lineWidth = 2; g.beginPath(); g.arc(b.tx, b.ty, w.lob.radius, 0, Math.PI * 2); g.stroke(); }
    const rot = (Math.round(Math.atan2(b.vy, b.vx) / (Math.PI / 8)) + 16) & 15;
    const cv = this._wpnSprite(w.shape, w.size, w.shape === 'dot' || w.shape === 'orb' ? 0 : rot);
    if (cv) g.drawImage(cv, b.x - cv.width / 2, b.y - cv.height / 2); else g.drawImage(this.sprites.pBullet, b.x - 10, b.y - 10);
  }
  _drawWpnOrbs(g) {
    if (!this._wpnOn() || this.weapon.orbit.n <= 0 || this.state === 'dead') return;
    const w = this.weapon, n = w.orbit.n, cv = this._wpnSprite(w.shape, w.size, 0);
    for (let i = 0; i < n; i++) {
      const o = MMProjectile.orbitPos(i, n, this._wOrbA, w, this.player);
      if (cv) g.drawImage(cv, o.x - cv.width / 2, o.y - cv.height / 2); else g.drawImage(this.sprites.pBullet, o.x - 10, o.y - 10);
    }
  }

  _sigReset() { const g = this.sg; g.powT = 0; g.powMul = 1; g.fx.t = 0; g.bloom.t = 0; g.bones.t = 0; g.bones.n = 0; }

  // Additive hook: draw arena enemies / drifters with creature animations (MMArt.loadEnemies). Pass (null) to go back to the procedural sprites.
  // `map` / `driftMap` default to MMArt's ENEMY_MAP / DRIFTER_MAP. Never attached by the in-town gate.
  // Additive hook: show item art (MMArt.loadItems ItemSet) in the backpack, shop and equipped slots, emoji as fallback. null = emoji only.
  setItemArt(itemSet) {
    this._itemArt = itemSet && typeof itemSet.iconUrl === 'function' ? itemSet : null;
    this._lootIco = Object.create(null); // arena loot icons: id -> { img, cv: [one outlined canvas per rarity] }
    if (this.paused && document.getElementById('realm-backpack-body')) this.renderBackpack();
  }
  // Icon markup for an item id: <img> from a trusted manifest url (never user data), else the emoji. Fallback on load error is wired by _fixIcons.
  _icon(def) {
    let url = null;
    try { url = this._itemArt ? this._itemArt.iconUrl(def.wpn && def.art ? def.art : def.id) : null; } catch (e) { url = null; }
    if (!url || !/^[A-Za-z0-9_.\/-]+$/.test(url)) return def.icon;
    return `<img class="realm-ico" src="${url}" alt="" width="32" height="32" data-item="${def.id}" style="image-rendering:pixelated">`;
  }
  // Small floor / floating-text icon for an item id at a rarity: a cached 20x20 canvas (item art + rarity-colour outline), built once per id+rarity.
  // null until the PNG is complete (or when item art is off / missing), so callers keep the old look. No per-frame allocation after the first build.
  _lootIcon(id, r) {
    if (!this._itemArt || !(r >= 0 && r < RM_RARITIES.length)) return null;
    const c = this._lootIco || (this._lootIco = Object.create(null));
    let e = c[id];
    if (e === undefined) {
      let url = null;
      try { const d = RM_ITEM_BY_ID[id]; url = this._itemArt.iconUrl(d && d.wpn && d.art ? d.art : id); } catch (err) { url = null; }
      if (!url || !/^[A-Za-z0-9_.\/-]+$/.test(url)) return null; // not cached: may become available later
      const img = new Image(); e = c[id] = { img, cv: [null, null, null, null], dead: false };
      img.onerror = () => { e.dead = true; if (this._itemArt && this._itemArt.markBad) this._itemArt.markBad(id); };
      img.src = url;
    }
    if (e.dead) return null;
    if (e.cv[r]) return e.cv[r];
    const im = e.img;
    if (!(im.complete && im.naturalWidth > 0)) return null;
    const cv = document.createElement('canvas'); cv.width = 20; cv.height = 20;
    const g = cv.getContext('2d'); g.imageSmoothingEnabled = false;
    g.drawImage(im, 1, 2, 16, 16); g.drawImage(im, 3, 2, 16, 16); g.drawImage(im, 2, 1, 16, 16); g.drawImage(im, 2, 3, 16, 16);
    g.globalCompositeOperation = 'source-in'; g.fillStyle = RM_RARITIES[r].color; g.fillRect(0, 0, 20, 20);
    g.globalCompositeOperation = 'source-over'; g.drawImage(im, 2, 2, 16, 16);
    e.cv[r] = cv;
    return cv;
  }
  // Floating "icon + name" text: the icon is drawn from _lootIcon when ready, else the emoji text stays.
  _itemText2(x, y, id, rarity, name, emoji, color) {
    const t = this._floatText(x, y, `${emoji} ${name}`, color);
    if (t) { t.ico = id; t.ir = rarity; t.plain = name; }
  }
  _fixIcons(root) {
    root.querySelectorAll('img.realm-ico').forEach((img) => {
      const def = RM_ITEM_BY_ID[img.dataset.item];
      const swap = () => { if (this._itemArt && this._itemArt.markBad) this._itemArt.markBad(img.dataset.item); img.replaceWith(document.createTextNode(def ? def.icon : '')); };
      if (img.complete && !img.naturalWidth) swap(); else img.addEventListener('error', swap, { once: true });
    });
  }

  setEnemyArt(artSet, map, driftMap, biomeMap) {
    const ok = artSet && typeof artSet.anim === 'function' && typeof artSet.draw === 'function';
    this._enemyArt = ok ? artSet : null;
    const A = typeof MMArt !== 'undefined' ? MMArt : null;
    this._enemyMap = ok ? (map || (A && A.ENEMY_MAP) || null) : null;
    this._driftMap = ok ? (driftMap || (A && A.DRIFTER_MAP) || null) : null;
    this._biomeEnemyMap = ok ? (biomeMap || (!map && A && A.BIOME_ENEMY_MAP) || null) : null;
    this._edGhosts = ok ? this._edGhosts || Array.from({ length: RM_ED_GHOSTS }, () => ({ active: false, name: '', dir: 'down', flip: false, x: 0, y: 0, k: 1, t0: 0 })) : null; // preallocated death-ghost pool
    if (!ok && this._edGhosts) this._edGhosts.forEach((q) => { q.active = false; });
    this._enemyVis = (A && A.ENEMY_VISIBLE_W) || 130;
    this._enemyDbg = null;
  }
  // Art creature for an enemy type: the current biome's skin first (deterministic), then the plain type map.
  _enemyNameFor(type) {
    const bm = this._biomeEnemyMap && this._biomeEnemyMap[RM_BIOMES[this.biome].id];
    if (bm && Object.prototype.hasOwnProperty.call(bm, type)) return bm[type];
    return this._enemyMap && Object.prototype.hasOwnProperty.call(this._enemyMap, type) ? this._enemyMap[type] : undefined;
  }
  // Starts a pooled death animation at an art-drawn enemy's feet (same dir/flip/scale as when it died). Reuses the oldest slot when full.
  _spawnEnemyGhost(e, def) {
    const art = this._enemyArt, pool = this._edGhosts;
    if (!art || !pool || e._at === undefined) return; // never drawn with art: nothing to continue
    const name = e.art && art.has(e.art) ? e.art : this._enemyNameFor(e.type);
    if (!name) return;
    const dir = art.anim(name, 'death', e._dir) ? e._dir : 'down';
    if (!art.anim(name, 'death', dir)) return;
    let q = null;
    for (let i = 0; i < pool.length; i++) if (!pool[i].active) { q = pool[i]; break; }
    if (!q) { q = pool[0]; for (let i = 1; i < pool.length; i++) if (pool[i].t0 < q.t0) q = pool[i]; }
    q.active = true; q.name = name; q.dir = dir; q.flip = !!e._flip; q.x = e.x; q.y = e.y + def.r * 0.9; q.k = 2.8 * def.r / this._enemyVis; q.t0 = this.clock;
  }
  // Plays every live death ghost once, then frees the slot. Game time (this.clock) drives it, so pause freezes it; reduced motion = last frame, short fade.
  _drawEnemyGhosts(g) {
    const pool = this._edGhosts, art = this._enemyArt;
    if (!pool) return;
    for (let i = 0; i < pool.length; i++) {
      const q = pool[i]; if (!q.active) continue;
      const a = art && art.anim(q.name, 'death', q.dir);
      const t = this.clock - q.t0;
      if (!a) { q.active = false; continue; }
      const len = a.frames / a.fps;
      if (this._reduced) {
        if (t > RM_ED_REDUCED) { q.active = false; continue; }
        const ga = g.globalAlpha; g.globalAlpha = ga * (1 - t / RM_ED_REDUCED);
        art.draw(g, a, len, q.x, q.y, q.k, q.flip); g.globalAlpha = ga;
      } else {
        if (t > len + 0.3) { q.active = false; continue; }
        const ga = g.globalAlpha; if (t > len) g.globalAlpha = ga * (1 - (t - len) / 0.3);
        art.draw(g, a, t, q.x, q.y, q.k, q.flip); g.globalAlpha = ga;
      }
    }
  }
  // Draws one enemy's creature animation; per-enemy state lives on the pooled enemy object (no allocation). Returns true when drawn.
  // Timing uses e.t (advanced only while the game runs), so pausing freezes the animation.
  _drawEnemyArt(g, e, def) {
    const art = this._enemyArt, name = e.art && art.has(e.art) ? e.art : this._enemyNameFor(e.type); // a world enemy may carry its own creature id
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
    if (e._bk !== 'boss' || e.t < e._lt) { e._bk = 'boss'; e._at = undefined; const A = typeof MMArt !== 'undefined' ? MMArt : null; const w = this.run && this.run.wave; e._bn = A && A.BOSS_MAP && typeof e.bossArt === 'string' && A.BOSS_MAP.indexOf(e.bossArt) >= 0 ? e.bossArt : A && A.bossArtFor ? A.bossArtFor(Math.max(0, Math.round((Number(w) || 0) / RM_BOSS_EVERY) - 1)) : null; }
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
      if (k === 'escape') {
        e.preventDefault();
        if (this._menuMode) { this._escMenu(); return; }
        if (this.paused || this.panel) this.setPaused(false); else this.leave();
        return;
      }
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

    this.onResize = () => { if (this.active) this._resize(); }; // synchronous but cheap: _resize returns early when nothing changed
    window.addEventListener('resize', this.onResize);
    window.addEventListener('orientationchange', this.onResize);
    if (window.visualViewport) { window.visualViewport.addEventListener('resize', this.onResize); window.visualViewport.addEventListener('scroll', this.onResize); }
  }

  // Touch sticks are DOM elements (set up by main.js); they only feed these two vectors.
  setMoveStick(x, y) { this.moveVec.x = x; this.moveVec.y = y; }
  setAimStick(x, y, on) { this.aimVec.x = x; this.aimVec.y = y; this.aimVec.on = !!on; }

  // ---------- scrolling world + camera (additive; null world = the screen is the world, exactly as before) ----------
  // setWorld({w, h, tile, camera, solidAt(x,y), shotSolidAt(x,y), drawUnder(g,cam), drawOver(g,cam), tick(dt), onStart(), wake, pools:{enemies,eBullets}}):
  // the world is w x h logical px, larger than the screen; the camera follows the player (smoothed, clamped to the world, integer-snapped,
  // snapped instantly under reduced motion). Every world<->screen conversion goes through this.camera {x, y, vw, vh} (read it, never write it):
  // drawing translates once per frame, mouse aim maps screen -> world, the player / enemies / bags clamp to the world instead of the screen.
  // solidAt(x, y) (px) blocks the player and enemies; shotSolidAt (default solidAt) absorbs bullets. setWorld(null) turns it all off.
  setWorld(opts) {
    if (!opts || typeof opts !== 'object') { this.world = null; this._solidAt = null; this._shotSolidAt = null; this._camF.x = 0; this._camF.y = 0; this.camera.x = 0; this.camera.y = 0; if (this.stats) this._calcStats(); return null; }
    const n = (v, d) => (Number.isFinite(Number(v)) && Number(v) > 0 ? Math.min(1 << 20, Math.floor(Number(v))) : d);
    const fn = (f) => (typeof f === 'function' ? f : null);
    this.world = Object.freeze({ w: n(opts.w, this.W), h: n(opts.h, this.H), tile: n(opts.tile, 32), camera: opts.camera !== false, wake: n(opts.wake, 0),
      drawUnder: fn(opts.drawUnder), drawOver: fn(opts.drawOver), tick: fn(opts.tick), moveScaleAt: fn(opts.moveScaleAt), onStart: fn(opts.onStart) });
    this._solidAt = fn(opts.solidAt); this._shotSolidAt = fn(opts.shotSolidAt) || this._solidAt;
    const pl = opts.pools && typeof opts.pools === 'object' ? opts.pools : {};
    const grow = (pool, want, max, f) => { const k = Math.min(max, n(want, 0)); while (pool.length < k) pool.push(f()); };
    grow(this.enemies, pl.enemies, 96, () => ({ active: false, type: 'aimed', x: 0, y: 0, hp: 0, maxHp: 0, t: 0, cd: 0, cd2: 0, angle: 0, flash: 0, ax: 0, ay: 0, dir: 1, phase: 0, invuln: 0 }));
    grow(this.eBullets, pl.eBullets, 900, () => ({ active: false, x: 0, y: 0, vx: 0, vy: 0, life: 0, kind: 0, ea: null }));
    const p = this.player; const R = RM_PLAYER.r;
    p.x = Math.max(R, Math.min(this.world.w - R, p.x)); p.y = Math.max(R, Math.min(this.world.h - R, p.y));
    this._camStep(-1); this._calcStats(); // the world hero scale depends on it
    return this.world;
  }

  // 'world' turns the wave director off (no waves, no wave banners: a continuous world); anything else = the classic waves.
  setMode(m) { this.mode = m === 'world' ? 'world' : 'waves'; if (this.stats) this._calcStats(); return this.mode; }

  _bw() { return this.world ? this.world.w : this.W; }
  _bh() { return this.world ? this.world.h : this.H; }
  _coll() { return !!(this.walls || this._solidAt); }

  // Follow the player. dt < 0 (or reduced motion) snaps. No allocation: writes this.camera in place.
  _camStep(dt) {
    const c = this.camera; const wd = this.world; const p = this.player; const f = this._camF;
    c.vw = this.W; c.vh = this.H;
    if (!wd || !wd.camera) { f.x = 0; f.y = 0; c.x = 0; c.y = 0; return; }
    const tx = p.x - this.W / 2; const ty = p.y - this.H / 2;
    if (dt < 0 || this._reduced) { f.x = tx; f.y = ty; } else { const k = 1 - Math.exp(-Math.min(dt, 0.1) * 12); f.x += (tx - f.x) * k; f.y += (ty - f.y) * k; }
    const mx = Math.min(80, this.W * 0.2); const my = Math.min(80, this.H * 0.2); // the player never leaves the view while the camera catches up
    if (p.x - f.x < mx) f.x = p.x - mx; else if (p.x - f.x > this.W - mx) f.x = p.x - this.W + mx;
    if (p.y - f.y < my) f.y = p.y - my; else if (p.y - f.y > this.H - my) f.y = p.y - this.H + my;
    f.x = wd.w <= this.W ? (wd.w - this.W) / 2 : Math.max(0, Math.min(wd.w - this.W, f.x));
    f.y = wd.h <= this.H ? (wd.h - this.H) / 2 : Math.max(0, Math.min(wd.h - this.H, f.y));
    c.x = Math.round(f.x); c.y = Math.round(f.y);
  }

  // Screen (logical arena units, as in this.mouse) <-> world px. Identity when there is no world.
  screenToWorld(sx, sy) { return { x: sx + this.camera.x, y: sy + this.camera.y }; }
  worldToScreen(wx, wy) { return { x: wx - this.camera.x, y: wy - this.camera.y }; }

  // Sizing rule (documented): the arena fills the VISIBLE viewport (visualViewport when available, so the mobile URL bar and
  // rotation are followed). The world's short side is always RM_SHORT logical units and the long side follows the screen up to
  // 1400, so the world aspect matches the viewport and nothing is stretched. Only beyond aspect 0.386..2.59 (or a fixed dungeon
  // room) is the canvas letterboxed: fitted inside the viewport and centred. The backing store is min(dpr, 2) capped at 1.5
  // per logical unit and never more than the CSS size needs, times the perf-guard quality (1 or 0.75).
  _resize(force) {
    const vv = typeof window !== 'undefined' ? window.visualViewport : null;
    const ov = this.container.parentElement;
    let w; let h;
    if (vv && vv.width > 0 && vv.height > 0 && ov && ov.id === 'realm-overlay') {
      if (vv.scale > 1.01) return; // pinch-zoomed: keep the layout stable
      w = vv.width; h = vv.height;
      const key = `${w}|${h}|${vv.offsetLeft}|${vv.offsetTop}`;
      if (key !== this._vpKey) { // pin the overlay to the visible viewport (URL bar / keyboard / rotation)
        this._vpKey = key; const os = ov.style;
        os.inset = 'auto'; os.left = `${vv.offsetLeft}px`; os.top = `${vv.offsetTop}px`; os.width = `${w}px`; os.height = `${h}px`;
      }
    } else { w = this.container.clientWidth || window.innerWidth; h = this.container.clientHeight || window.innerHeight; }
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const rkey = `${w}|${h}|${dpr}|${this._pf.q}|${this.fixedWorld ? 1 : 0}`;
    if (!force && rkey === this._rzKey) return;
    this._rzKey = rkey;
    const oldW = this.W; const oldH = this.H;
    if (this.fixedWorld) { this.W = this.fixedWorld.w; this.H = this.fixedWorld.h; } else { // short side is always RM_SHORT logical units; the long side follows the screen
      const aspect = w / h;
      if (aspect >= 1) { this.H = RM_SHORT; this.W = Math.round(Math.min(1400, Math.max(RM_SHORT, RM_SHORT * aspect))); } else { this.W = RM_SHORT; this.H = Math.round(Math.min(1400, Math.max(RM_SHORT, RM_SHORT / aspect))); }
    }
    const k = Math.min(w / this.W, h / this.H); this._cssK = k;
    const cw = Math.floor(this.W * k); const ch = Math.floor(this.H * k);
    const ckey = `${cw}|${ch}|${w}|${h}`;
    if (ckey !== this._cvKey) { // letterboxed only when the world aspect cannot match the screen
      this._cvKey = ckey; const cs = this.canvas.style;
      cs.position = 'absolute'; cs.width = `${cw}px`; cs.height = `${ch}px`; cs.left = `${Math.floor((w - cw) / 2)}px`; cs.top = `${Math.floor((h - ch) / 2)}px`;
    }
    this._applyBacking(); this._stAnchorT = -1e9; // the HUD rects moved
    const p = this.player; const bw = this._bw(); const bh = this._bh();
    p.x = Math.max(RM_PLAYER.r, Math.min(bw - RM_PLAYER.r, p.x || bw / 2));
    p.y = Math.max(RM_PLAYER.r, Math.min(bh - RM_PLAYER.r, p.y || bh / 2));
    if ((oldW !== this.W || oldH !== this.H) && !this.fixedWorld && !this.world) this._fitPools();
    this._camStep(-1);
  }

  // Backing-store size: min(dpr, 2), at most 1.5 px per logical unit, no finer than the CSS size needs, times the perf-guard quality.
  _applyBacking() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const s = Math.min(dpr, 1.5, this._cssK * dpr) * this._pf.q;
    const cw = Math.max(1, Math.round(this.W * s)); const ch = Math.max(1, Math.round(this.H * s));
    if (this.canvas.width !== cw || this.canvas.height !== ch) { this.canvas.width = cw; this.canvas.height = ch; }
    this.scale = this.canvas.width / this.W; this._vignette = null;
  }

  // After a rotation the world changes shape: pull anything that is now outside back in.
  _fitPools() {
    const W = this.W; const H = this.H;
    [this.enemies, this.bags, this.hazards, this.drifters].forEach((pool) => { if (pool) pool.forEach((o) => { if (o.active) { o.x = Math.max(20, Math.min(W - 20, o.x)); o.y = Math.max(20, Math.min(H - 20, o.y)); } }); });
  }

  // ---------- performance guard (phones) ----------
  // Feed one raw frame time in ms. A rolling average above 33 ms for 2 s drops the render resolution to 0.75; below 22 ms for 6 s restores it.
  _perfFeed(ms) {
    if (!(ms > 0) || ms > 250) return; // tab switches / debugger pauses are not slow frames
    const pf = this._pf; pf.ema += (ms - pf.ema) * 0.1;
    if (!pf.on) return;
    const sec = ms / 1000;
    if (pf.q === 1) {
      if (pf.ema > 33) { pf.slow += sec; if (pf.slow >= 2) this._perfSet(0.75); } else pf.slow = 0;
    } else if (pf.ema < 22) { pf.fast += sec; if (pf.fast >= 6) this._perfSet(1); } else pf.fast = 0;
  }

  _perfSet(q) { const pf = this._pf; pf.q = q; pf.slow = 0; pf.fast = 0; this._resize(true); }

  // Debug hook for tests: perfState() reads, perfFeed(ms) injects a frame, setPerfPhone(on) forces phone detection.
  perfState() { const pf = this._pf; return { quality: pf.q, ema: pf.ema, phone: pf.on, scale: this.scale, w: this.canvas.width, h: this.canvas.height }; }
  perfFeed(ms) { this._perfFeed(ms); }
  setPerfPhone(on) { this._pf.on = !!on; this._pf.slow = 0; this._pf.fast = 0; if (!on && this._pf.q !== 1) this._perfSet(1); }

  // ---------- lifecycle ----------

  start() {
    this.active = true;
    this.resyncSave(); // pick up progress another tab saved while this arena sat idle
    this._resize(true);
    this._beginRun();
    this._lastT = performance.now();
    this._raf = requestAnimationFrame(this._loop);
  }

  // Everything a fresh run needs (shared by start() and restart()); never touches the loop or the save.
  _beginRun() {
    [this.pBullets, this.eBullets, this.enemies, this._edGhosts || [], this.particles, this.texts, this.bags, this.drifters, this.hazards, this._sparks || []].forEach((pool) => pool.forEach((o) => { o.active = false; }));
    this._wireRefresh(); this._padPrev.fill(false); this._wq.length = 0;
    this.keys = {}; this.mouse.down = false; this.moveVec.x = 0; this.moveVec.y = 0; this.aimVec.on = false; this.aimVec.x = 0; this.aimVec.y = 0; // no stuck input from the last run
    const p = this.player;
    p.status = null; p._stm = null; p._stNext = Infinity; p._stAcc = 0; this._stList = null; // statuses never carry over into a new run
    this._calcStats();
    this.abilityCd = [0, 0, 0, 0]; this.shield.hits = 0; this.shield.t = 0; this.overdriveT = 0; this.paused = false; this._sigReset();
    p.x = this.W / 2; p.y = this.H / 2; p.hp = this.stats.maxHp; p.dashT = 0; p.iframes = 1; p.fireCd = 0; p.aim = -Math.PI / 2;
    this.run = { wave: 0, kills: 0, shards: 0 }; this._waveSc = null;
    this.biome = 0; this.clock = 0; this._speedMul = 1; this.down = false; this.reviveT = 0; this._syncBoss();
    this.shake = 0; this.flash = 0;
    this.displayShards = this.save.shards;
    this.state = 'banner';
    this.bannerT = 1.4;
    this.bannerText = this.team && this.team.isPvp ? (this.team.mode === '2v2' ? '2v2 — first to 2 rounds!' : 'Duel — first to 2 rounds!') : this._worldCopy() ? 'The Realm' : 'Realm — survive the waves!';
    if (this.team && this.team.isPvp) { this.state = 'play'; this.run.wave = 1; this.team.duelReset(); }
    this.nextWaveIn = 1.4;
    this._syncHud(true);
    this._showBanner(this.bannerText);
    if (this.dungeon && !this.team) { this.state = 'play'; this.dungeon.onStart(); }
    if (this.mode === 'world' && !this.team && !this.dungeon) { // a continuous world: no wave banner, the world controller places the player
      this.state = 'play'; this._hideBanner(); clearTimeout(this._bannerTimer);
      if (this.world && this.world.onStart) this.world.onStart();
      this._camStep(-1);
    }
    this._deathShown = false; this._hideDeath();
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
    window.removeEventListener('orientationchange', this.onResize);
    if (window.visualViewport) { window.visualViewport.removeEventListener('resize', this.onResize); window.visualViewport.removeEventListener('scroll', this.onResize); }
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
    const raw = now - this._lastT; const dt = Math.min(raw / 1000, 0.05);
    this._lastT = now;
    this._perfFeed(raw);
    this._update(dt);
    if (this.world) this._camStep(dt);
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
    e.slowT = 0; e.slowF = 1; e.boneT = 0; e.status = null; e._stm = null; e._stNext = Infinity; e._stAcc = 0; e.fireMul = 1;
    e.dg = null; e._at = undefined; e.t = 0; e.flash = 0; e.angle = this.rng() * Math.PI * 2; e.dir = this.rng() < 0.5 ? 1 : -1;
    e.cd = 0.8 + this.rng() * 0.8; // first shot is never instant
    if (this.world) { e.ax = x + (this.rng() - 0.5) * 220; e.ay = y + (this.rng() - 0.5) * 220; } else { e.ax = 80 + this.rng() * (this.W - 160); e.ay = 80 + this.rng() * (this.H - 160); } // drift target for Whirlers (near home in a world)
    e.spdMul = 1; e.dmgMul = 1; e.xpMul = 1; e.shardMul = 1; e.art = null; e.bossArt = null; e.zid = -1; e.evid = null; e.campId = null; e.bossName = null; e.bossTier = 0; e.diff = null; // world-mode extras (multipliers 1 = unchanged)
    if (this.world && type === 'boss') { e.ax = x; e.ay = y; }
    return e;
  }

  // Classic-arena difficulty curve (MMDifficulty.waveScale), applied to the wave's spawns at spawn time on top of the old wave scaling.
  // null (= exactly the old numbers) without the module, with ?difficulty=off, and outside the classic waves (world, dungeon, duel).
  _waveScaleFor(wave) {
    if (typeof MMDifficulty === 'undefined' || this.world || this.dungeon || this.mode === 'world' || (this.team && this.team.isPvp)) return null;
    let off = false; try { off = MMDifficulty.isOff(typeof location !== 'undefined' ? location.search : ''); } catch (e) { off = false; }
    if (off) return null;
    let mode = 'classic'; try { if (typeof MMProfile !== 'undefined' && MMProfile.clean && MMProfile.KEY) mode = MMProfile.clean(localStorage.getItem(MMProfile.KEY)).mode; } catch (e) { mode = 'classic'; }
    return MMDifficulty.waveScale(wave, { mode });
  }
  _scaleWaveEnemy(e, sc) {
    if (!e || !sc) return e;
    e.maxHp = Math.max(1, Math.ceil(e.maxHp * sc.hp)); e.hp = e.maxHp;
    e.dmgMul = sc.dmg; e.spdMul = sc.spd; e.fireMul = sc.fire; e.diff = sc;
    return e;
  }

  _startWave() {
    this.run.wave += 1;
    const wave = this.run.wave;
    const sc = this._waveSc = this._waveScaleFor(wave);
    const bi = rmBiomeIndex(wave); const biome = RM_BIOMES[bi]; const changed = bi !== this.biome || wave === 1;
    this.biome = bi;
    this.drifters.forEach((d) => { d.active = false; });
    this._layHazards(biome);
    this._spawnDrifters(biome);
    if (wave % RM_BOSS_EVERY === 0) {
      this._scaleWaveEnemy(this._spawnBoss(), sc);
    } else {
      const n0 = Math.min(2 + wave, 10); const n = sc ? Math.max(1, Math.min(14, Math.round(n0 * sc.count))) : n0;
      const order = biome.mix;
      for (let i = 0; i < n; i++) {
        const type = wave === 1 ? ['aimed', 'aimed', 'ring'][i % 3] : order[(i + Math.floor(this.rng() * order.length)) % order.length];
        let x; let y; let tries = 0; // spawn on the arena rim, away from the player
        do {
          const a = this.rng() * Math.PI * 2;
          x = this.W / 2 + Math.cos(a) * (this.W / 2 - 40);
          y = this.H / 2 + Math.sin(a) * (this.H / 2 - 40);
        } while (Math.hypot(x - this.player.x, y - this.player.y) < 220 && ++tries < 12);
        this._scaleWaveEnemy(this.spawnEnemy(type, x, y), sc);
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
    const n = document.getElementById('realm-boss-name'); if (n) n.textContent = `${b.bossName || RM_ENEMIES.boss.name} · phase ${b.phase}`;
    el.dataset.phase = String(b.phase);
  }

  fireEnemyBullet(x, y, angle, speed, kind) {
    const b = this._take(this.eBullets);
    if (!b) return;
    if (this.team && this.role === 'host') this.team.ev('fe', [Math.round(x), Math.round(y), Math.round(angle * 1000) / 1000, speed, kind || 0]);
    b.active = true; b.x = x; b.y = y; b.vx = Math.cos(angle) * speed; b.vy = Math.sin(angle) * speed; b.life = 6; b.kind = kind || 0; b.dm = this._curDm; b.ea = this._boltArt ? this._ebSelect(b.kind) : null;
  }

  // Class fire tags (heroProfile.shots/spread/pierce/shotDmg/critChance/boltSpeed). Default / duel / no profile = the plain single bolt.
  _firePlayerVolley(aim) {
    if (this._wpnOn()) { this._fireWeapon(aim); return; }
    const hp = this.heroProfile;
    if (!hp || (this.team && this.team.isPvp) || (hp.shots === 1 && hp.pierce === 0 && hp.shotDmg === 1 && hp.critChance === 0 && hp.boltSpeed === 1)) { this.firePlayerBullet(aim); return; }
    const base = this.stats.dmg * (this.sg.powT > 0 ? this.sg.powMul : 1) * hp.shotDmg;
    const n = hp.shots;
    for (let k = 0; k < n; k++) {
      const d = hp.critChance > 0 && this.rng() < hp.critChance ? base * 2 : base;
      const b = this.firePlayerBulletFrom(this.player.x, this.player.y, aim + (n > 1 ? (k / (n - 1) - 0.5) * hp.spread : 0), d, 0);
      if (!b) continue;
      b.pr = hp.pierce;
      if (hp.boltSpeed !== 1) { b.vx *= hp.boltSpeed; b.vy *= hp.boltSpeed; b.life /= hp.boltSpeed; }
    }
  }

  firePlayerBullet(angle) { this.firePlayerBulletFrom(this.player.x, this.player.y, angle, this.stats.dmg * (this.sg.powT > 0 ? this.sg.powMul : 1), 0); }

  // owner 0 = you (host), 1 = your partner. Everything a bolt does is decided on the host; guests only draw them.
  // wcode (optional): weapon-style wire code, sent as the 5th `fp` element so guests draw the same path (old guests ignore it).
  firePlayerBulletFrom(x, y, angle, dmg, owner, wcode) {
    const b = this._take(this.pBullets);
    if (!b) return null;
    if (this.team && this.role === 'host') this.team.ev('fp', wcode >= 0 ? [Math.round(x), Math.round(y), Math.round(angle * 1000) / 1000, Math.round(dmg * 10) / 10, wcode] : [Math.round(x), Math.round(y), Math.round(angle * 1000) / 1000, Math.round(dmg * 10) / 10], owner);
    b.ws = null; b.ho = 0; b.lb = 0; b.st = 0;
    b.active = true; b.x = x + Math.cos(angle) * 14; b.y = y + Math.sin(angle) * 14; b.dmg = dmg; b.own = owner;
    b.vx = Math.cos(angle) * RM_PLAYER.bulletSpeed; b.vy = Math.sin(angle) * RM_PLAYER.bulletSpeed; b.life = RM_PLAYER.bulletLife;
    b.pr = 0; b.hn = 0; b.h0 = b.h1 = b.h2 = -1; // class pierce: bolts left to pass through, and the enemies already hit
    return b;
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
    if (!t) return null;
    t.active = true; t.x = x; t.y = y; t.vy = -48; t.life = 0.7; t.text = text; t.color = color; t.ico = ''; t.plain = '';
    return t;
  }

  // ---------- simulation ----------

  _update(dt) {
    this._readReduced();
    if (this.paused) { this._readPad(); this._padPauseEdge(); return; } // backpack open (Start can still close it)
    const p = this.player;
    this._stT += dt; this._stTick(dt);
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
      this._updateWeapon(dt);
      this._syncBoss();
      return;
    }

    if (this.state === 'dead') {
      this.deadT -= dt;
      if (this.deadT <= 0) {
        if (this._menuMode && !this.team && !this.dungeon) { if (!this._deathShown) this._showDeath(); } // menu mode: recap + Try again / Leave instead of exiting
        else { this.stop(); this.onExit('death'); }
      }
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
    if (this.state === 'banner' && this.mode !== 'world') {
      this.nextWaveIn -= dt;
      if (this.nextWaveIn <= 0) this._startWave();
    }
    this._updateAbilities(dt);
    this._updateEnemies(dt);
    this._updateDrifters(dt);
    this._updateBullets(dt);
    this._updateWeapon(dt);
    this._updateBags(dt);
    if (this.dungeon) this.dungeon.tick(dt);
    if (this.world && this.world.tick) this.world.tick(dt);
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
    if (this._solidAt && !this.walls) return !!this._solidAt(x, y);
    const w = this.walls; if (!w) return false;
    const c = Math.floor(x / RM_TILE); const r = Math.floor(y / RM_TILE);
    return r >= 0 && c >= 0 && r < w.rows && c < w.cols && w.cells[r][c] === 1;
  }

  // Does a circle of radius rad at (x, y) overlap any wall tile? (AABB of the circle against tiles)
  _blocked(x, y, rad) {
    if (!this.walls && !this._solidAt) return false;
    const T = !this.walls && this.world ? this.world.tile : RM_TILE;
    const c0 = Math.floor((x - rad) / T); const c1 = Math.floor((x + rad) / T);
    const r0 = Math.floor((y - rad) / T); const r1 = Math.floor((y + rad) / T);
    for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) if (this.isWallAt(c * T + 1, r * T + 1)) return true;
    return false;
  }

  // Move the player by (dx, dy), each axis on its own so a diagonal push into a wall slides along it.
  _movePlayer(dx, dy) {
    const p = this.player; const R = RM_PLAYER.r;
    const bw = this._bw(); const bh = this._bh();
    const clampX = (v) => Math.max(R, Math.min(bw - R, v)); const clampY = (v) => Math.max(R, Math.min(bh - R, v));
    if (!this._coll()) { p.x = clampX(p.x + dx); p.y = clampY(p.y + dy); return; }
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
    const terrainScale = this.mode === 'world' && !this.dungeon && !this.team && this.world?.moveScaleAt
      ? this.world.moveScaleAt(p.x, p.y) : 1;
    const step = this.stats.speed * this._speedMul * dt * terrainScale;
    this._movePlayer(mx * step, my * step);
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
      p.aim = Math.atan2(this.mouse.y + this.camera.y - p.y, this.mouse.x + this.camera.x - p.x); // mouse is in screen units: + camera = world (camera is 0,0 without a world)
      firing = this.mouse.down || !!this.keys[' '];
    } else if (this.keys[' ']) firing = true;
    if (pad && pad.fire) firing = true;
    if (pad) { for (let i = 0; i < 4; i++) { const on = !!pad.ability[i]; if (on && !this._padPrev[i]) this.cast(i); this._padPrev[i] = on; } }
    if (this.down) firing = false;
    this._firing = firing;
    p.fireCd -= dt;
    if (firing && p.fireCd <= 0 && this.state !== 'dead') {
      p.fireCd = 1 / (this.stats.rate * (this.overdriveT > 0 ? 2 : 1) * this._wpnRate());
      this._firePlayerVolley(p.aim);
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
      const bw = this._bw(); const bh = this._bh();
      if (d.x < 20 || d.x > bw - 20) { d.vx = -d.vx; d.x = Math.max(20, Math.min(bw - 20, d.x)); }
      if (d.y < 20 || d.y > bh - 20) { d.vy = -d.vy; d.y = Math.max(20, Math.min(bh - 20, d.y)); }
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
    if (this.world) { e.x = e.ax + Math.sin(e.t * 0.6 * fast) * 110; e.y = e.ay + Math.sin(e.t * 0.9 * fast) * 22; } else { // a world boss sways around its altar
      e.x = this.W / 2 + Math.sin(e.t * 0.6 * fast) * (this.W * 0.3);
      e.y = 132 + Math.sin(e.t * 0.9 * fast) * 22; // below the HUD, even on a phone
    }
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
    const bn = e.bossName || 'Gloomheart';
    this._showBanner(phase === 2 ? `${bn} — it summons help!` : `${bn} — ENRAGED!`, 1.6, true);
    if (this.team) { this.team.ev('clr', []); this.team.ev('fx', [12]); }
    if (phase === 2) { for (let k = 0; k < 2; k++) { const a = this.world ? this.spawnEnemy('aimed', e.ax + (k ? 140 : -140), e.ay + 60) : this._scaleWaveEnemy(this.spawnEnemy('aimed', k ? this.W - 60 : 60, 140), this._waveSc); if (a) a.cd = 1.5; } }
  }

  _bossDefeated(e) {
    const tier = e.bossTier > 0 ? e.bossTier : this.run.wave / RM_BOSS_EVERY; // a world boss carries its own tier
    const gain = Math.max(1, Math.round((40 + 10 * tier) * this.stats.shards));
    this.run.shards += gain; this.save.shards += gain; this.run.kills += 1; this.save.kills += 1; this.save.kb.boss += 1;
    const tenths = Math.max(1, Math.round((this.clock - this.bossT0) * 10));
    const newBest = !e.bossName && (!this.save.bossBestT || tenths < this.save.bossBestT); // the best time is Gloomheart's only
    if (newBest) this.save.bossBestT = tenths;
    this.eBullets.forEach((b) => { if (b.active) { b.active = false; this._burst(b.x, b.y, '#ffe27a', 1, 60); } });
    this._burst(e.x, e.y, '#ff5fa2', 40, 340); this._burst(e.x, e.y, '#ffe27a', 30, 260);
    this.shake = 14;
    this._floatText(e.x, e.y - 30, `+${gain} 💎`, '#8fe9ff');
    this._gainXp(Math.round(RM_XP.boss * tier * this.stats.xp));
    this.dropBag(e.x - 20, e.y + 20, 2); this.dropBag(e.x + 20, e.y + 20, this.rollRarity()); // a guaranteed rare, plus one more
    this._showBanner(`${e.bossName || 'Gloomheart'} defeated!  +${gain} 💎${newBest ? '  New best time!' : ''}`, 2.4, true);
    if (this.team) { this.team.ev('rew', [40 + 10 * tier, RM_XP.boss * tier, 'boss', 1, tenths]); this.team.ev('clr', []); }
    this.onSave(this.save);
    this._syncBoss();
  }

  // World mode only: may this enemy shoot? It must be on screen (a 24 px margin) and within RM_FIRE_RANGE x the view's half-diagonal of
  // the player, so nothing snipes from outside the camera. The classic arena and dungeons (the whole room is the view) are unchanged.
  _canFire(e, p) {
    if (!this.world || this.mode !== 'world' || this.dungeon) return true;
    const c = this.camera; const m = 24;
    if (e.x < c.x - m || e.x > c.x + this.W + m || e.y < c.y - m || e.y > c.y + this.H + m) return false;
    const fr = Math.hypot(this.W, this.H) * 0.5 * RM_FIRE_RANGE;
    return (e.x - p.x) * (e.x - p.x) + (e.y - p.y) * (e.y - p.y) <= fr * fr;
  }

  _updateEnemies(dt0) {
    const wd = this.world; const wake = wd ? (wd.wake || Math.max(this.W, this.H) * 0.75) : 0; const wake2 = wake * wake;
    for (let i = 0; i < this.enemies.length; i++) {
      const e = this.enemies[i];
      if (!e.active) continue;
      let dt = dt0;
      if (e.slowT > 0) { e.slowT -= dt0; dt = dt0 * e.slowF; } // a signature slow (Blizzard Ring / Thorn Bloom); never set otherwise
      const p = this._nearest(e.x, e.y);
      e.t += dt; e.flash = Math.max(0, e.flash - dt * 6);
      if (wd && (p.x - e.x) * (p.x - e.x) + (p.y - e.y) * (p.y - e.y) > wake2) continue; // world: an enemy far from every player sleeps (no moving, no firing)
      this._curE = e; this._curDm = e.dmgMul || 1; // bullets fired below carry this enemy's damage multiplier (1 = unchanged)
      let sm = null;
      if (e.status) { if (e._stNext <= this._stT * 1000) this._stRefresh(e); sm = e._stm; if (sm) { this._curDm *= sm.enemyDmg; if (sm.dot > 0) this._stEnemyDot(e, sm, dt0); if (!e.active) continue; } }
      const hold = wd && !this._canFire(e, p); // world: off-screen shooters hold their fire (cooldowns wait at 0.2 s)
      if (hold) { e.cd = Math.max(e.cd, 0.2); if (e.type === 'boss') e.cd2 = Math.max(e.cd2, 0.2); }
      if (e.type === 'boss') { if (sm && sm.speed < 1) e.t -= dt * (1 - sm.speed); this._updateBoss(e, dt * (e.fireMul || 1) / (sm ? sm.enemyFire : 1)); this._curDm = 1; this._curE = null; continue; } // slowed: the sway runs slower
      if (sm && sm.stun) continue; // stunned: no moving, no firing
      if (!hold) e.cd -= dt * (e.fireMul || 1) / (sm ? sm.enemyFire : 1); // fireMul: classic wave scale; dazed makes fire cooldowns x1.5
      const ox = e.x; const oy = e.y; const sp = (e.spdMul || 1) * (sm ? sm.speed : 1);
      const dx = p.x - e.x; const dy = p.y - e.y; const dist = Math.hypot(dx, dy) || 1;
      if (e.type === 'spiral') {
        // Drifts toward its anchor and keeps spinning out a steady spiral.
        const ax = e.ax - e.x; const ay = e.ay - e.y; const ad = Math.hypot(ax, ay);
        if (ad > 8) { e.x += (ax / ad) * RM_ENEMIES.spiral.speed * sp * dt; e.y += (ay / ad) * RM_ENEMIES.spiral.speed * sp * dt; }
        if (e.cd <= 0) { e.cd = 0.09; e.angle += 0.47; this.fireEnemyBullet(e.x, e.y, e.angle, 150, 1); }
      } else if (e.type === 'aimed') {
        // Circles the player at a distance and fires aimed three-bolt bursts.
        const want = dist > 280 ? 1 : dist < 200 ? -1 : 0;
        const tx = -dy / dist * e.dir; const ty = dx / dist * e.dir;
        e.x += ((dx / dist) * want * 0.7 + tx) * RM_ENEMIES.aimed.speed * sp * dt;
        e.y += ((dy / dist) * want * 0.7 + ty) * RM_ENEMIES.aimed.speed * sp * dt;
        if (e.cd <= 0) {
          e.cd = 1.3;
          const a = Math.atan2(dy, dx);
          for (let k = 0; k < 3; k++) this.fireEnemyBullet(e.x, e.y, MMPatterns.aimedAngle(a, k, 3, 0.44), 235, 0);
        }
      } else {
        // Drifts in and fires a ring of bolts with a random phase.
        if (dist > 150) { e.x += (dx / dist) * RM_ENEMIES.ring.speed * sp * dt; e.y += (dy / dist) * RM_ENEMIES.ring.speed * sp * dt; }
        if (e.cd <= 0) {
          e.cd = 2.4;
          const phase = this.rng() * Math.PI * 2;
          for (let k = 0; k < 14; k++) this.fireEnemyBullet(e.x, e.y, MMPatterns.ringAngle(k, 14, phase), 140, 2);
        }
      }
      e.x = Math.max(20, Math.min(this._bw() - 20, e.x));
      e.y = Math.max(20, Math.min(this._bh() - 20, e.y));
      if (this._solidAt && this._blocked(e.x, e.y, 8)) { // world tiles block enemies too: slide along one axis, else stay
        if (!this._blocked(e.x, oy, 8)) e.y = oy; else if (!this._blocked(ox, e.y, 8)) e.x = ox; else { e.x = ox; e.y = oy; }
        if (e.type === 'spiral') { e.ax = e.x; e.ay = e.y; }
      }
    }
    this._curDm = 1; this._curE = null;
  }

  _updateBullets(dt) {
    const p = this.player; const bw = this._bw(); const bh = this._bh();
    // Player bolts: move, hit enemies (spatial hash over the enemies, rebuilt once per frame).
    if (this._hash) { let any = false; for (let i = 0; i < this.pBullets.length; i++) if (this.pBullets[i].active) { any = true; break; } if (any) this._buildHash(); } // no bolts, no hash
    for (let i = 0; i < this.pBullets.length; i++) {
      const b = this.pBullets[i];
      if (!b.active) continue;
      if (b.ws) { if (!this._stepWpn(b, dt, bw, bh)) continue; } // weapon-style bolt: MMProjectile kernels (walls and edges handled there)
      else {
      b.x += b.vx * dt; b.y += b.vy * dt; b.life -= dt;
      if (b.life <= 0 || b.x < -10 || b.y < -10 || b.x > bw + 10 || b.y > bh + 10) { b.active = false; continue; }
      if (this.walls && this.isWallAt(b.x, b.y)) { if (this.dungeon) this.dungeon.onBoltWall(b.x, b.y); b.active = false; continue; }
      if (!this.walls && this._shotSolidAt && this._shotSolidAt(b.x, b.y)) { b.active = false; this._burst(b.x, b.y, '#c9d1d9', 2, 60); continue; } // world: solid tiles absorb bolts
      }
      if (this.team && this.role === 'host' && this.team.isPvp) { if (this.team.duelBoltHit(b)) b.active = false; continue; }
      let hj = this._boltHitIndex(b.x, b.y);
      if (hj >= 0 && b.hn > 0 && (hj === b.h0 || hj === b.h1 || hj === b.h2)) hj = -1; // a piercing bolt hits each enemy once
      if (hj >= 0) {
        if (b.pr > 0) { b.pr--; if (b.hn === 0) b.h0 = hj; else if (b.hn === 1) b.h1 = hj; else b.h2 = hj; b.hn++; } else b.active = false;
        const he = this.enemies[hj];
        if (this._sparks) this._spawnSpark(b);
        if (b.ws) this._wpnHit(b, he, hj);
        this._hitEnemy(he, b.dmg || this.stats.dmg);
      }
      if (!b.active) continue;
      for (let j = 0; j < this.drifters.length; j++) {
        const d = this.drifters[j];
        if (d.active && (b.x - d.x) * (b.x - d.x) + (b.y - d.y) * (b.y - d.y) < 15 * 15) { b.active = false; this._hitDrifter(d, b.dmg || this.stats.dmg); break; }
      }
    }
    this._updateSparks(dt);
    // Enemy bullets: move, hit the player. World mode: a bullet more than one view diagonal from the player can never matter: it is dropped.
    const pr = RM_PLAYER.r + 4;
    const cull = this.world && this.mode === 'world' && !this.dungeon ? (this.W * this.W + this.H * this.H) : 0;
    for (let i = 0; i < this.eBullets.length; i++) {
      const b = this.eBullets[i];
      if (!b.active) continue;
      b.x += b.vx * dt; b.y += b.vy * dt; b.life -= dt;
      if (b.life <= 0 || b.x < -20 || b.y < -20 || b.x > bw + 20 || b.y > bh + 20) { b.active = false; continue; }
      if (cull && (b.x - p.x) * (b.x - p.x) + (b.y - p.y) * (b.y - p.y) > cull) { b.active = false; continue; }
      if (this.walls && this.isWallAt(b.x, b.y)) { b.active = false; continue; }
      if (!this.walls && this._shotSolidAt && this._shotSolidAt(b.x, b.y)) { b.active = false; continue; }
      if (this.state !== 'dead' && !this.down && p.iframes <= 0 && (b.x - p.x) * (b.x - p.x) + (b.y - p.y) * (b.y - p.y) < pr * pr) {
        b.active = false;
        this._hitPlayer(this._guarded(b.dm > 0 && b.dm !== 1 ? Math.round(RM_ENEMY_BULLET_DAMAGE * b.dm) : RM_ENEMY_BULLET_DAMAGE));
      } else if (this.team && this.role === 'host' && this.team.partner && this.team.partner.ready) {
        const q = this.team.partner; // the partner takes the same (wave-scaled) bolt damage as the host; dm 1 = the old 8
        if ((b.x - q.x) * (b.x - q.x) + (b.y - q.y) * (b.y - q.y) < pr * pr && this.team.hitPartner(b.dm > 0 && b.dm !== 1 ? Math.round(RM_ENEMY_BULLET_DAMAGE * b.dm) : RM_ENEMY_BULLET_DAMAGE)) b.active = false;
      }
    }
  }

  _hitEnemy(e, dmg) {
    if (e._stm && e._stm.taken !== 1) dmg *= e._stm.taken; // status mods (marked / curse / armorBroken), capped at x1.5 by MMStatus
    if (this.dungeon && e.dg === 'boss') { this.dungeon.hitBoss(e, dmg); return; }
    if (e.type === 'boss' && e.invuln > 0) { this._floatText(e.x, e.y - 40, 'shielded', '#c9d1d9'); this._burst(e.x, e.y, '#fff', 1, 60); return; }
    if (this.onEnemyHit) this.onEnemyHit(e, dmg);
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
      if (this.onEnemyKilled) this.onEnemyKilled(e);
      return;
    }
    this._floatText(e.x + (this.rng() - 0.5) * 14, e.y - 14, String(Math.round(dmg * 10) / 10), '#fff');
    this._burst(e.x, e.y, RM_ENEMIES[e.type].color, 3, 110);
    if (e.hp > 0) return;
    e.active = false;
    const def = RM_ENEMIES[e.type];
    if (this._edGhosts) this._spawnEnemyGhost(e, def);
    const gain = Math.max(1, Math.round(def.shards * (e.shardMul || 1) * this.stats.shards));
    this.run.kills += 1; this.run.shards += gain;
    this.save.kills += 1; this.save.shards += gain; this.save.kb[e.type] += 1;
    if (this.team) this.team.ev('rew', [def.shards, RM_XP[e.type] * (1 + 0.1 * Math.max(0, this.run.wave - 1)), e.type]);
    this._burst(e.x, e.y, def.color, 16, 230);
    this._floatText(e.x, e.y - 22, `+${gain} 💎`, '#8fe9ff');
    this._gainXp(Math.round(RM_XP[e.type] * (1 + 0.1 * Math.max(0, this.run.wave - 1)) * (e.xpMul || 1) * this.stats.xp));
    if (this.mode !== 'world' && this.rng() < RM_BAG_CHANCE) this.dropBag(e.x, e.y, this.rollRarity()); // a world rolls its own zone drops (onEnemyKilled)
    this.shake = Math.max(this.shake, 3);
    this.onSave(this.save);
    if (this.dungeon) this.dungeon.onKill(e);
    if (this.onEnemyKilled) this.onEnemyKilled(e);
  }

  _hitPlayer(dmg) {
    const p = this.player;
    if (this.down) return; // already down: hazards must not reset the revive
    if (this.shield.hits > 0) { // Shield soaks the hit
      this.shield.hits -= 1; p.iframes = 0.25; this._burst(p.x, p.y, '#8fe9ff', 6, 140); this._floatText(p.x, p.y - 22, 'blocked', '#8fe9ff'); return;
    }
    let tk = this.buffTaken > 0 && this.buffTaken < 1 ? this.buffTaken : 1; // additive timed buff (world shrine of Warding)
    if (p._stm) tk = Math.max(0.5, Math.min(1.5, tk * p._stm.taken)); // status mods (armored / armorBroken / curse), capped 0.5..1.5
    if (tk !== 1) dmg = Math.max(1, Math.round(dmg * tk));
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
    const def = RM_BASE_ITEMS[(sv.deaths + w) % RM_BASE_ITEMS.length]; const rar = RM_RARITIES[rarity];
    let text;
    let n = 0;
    if (sv.items.length >= RM_BACKPACK) { sv.shards += rar.sell; text = `pack full, cache sold +${rar.sell} 💎`; } else { n = sv.nextUid++; sv.items.push({ n, id: def.id, r: rarity }); text = `cache: ${def.icon} ${rar.name} ${def.name}`; }
    return { id: def.id, rarity, text, n }; // n = backpack uid of the cache item (0 = sold)
  }

  // ---------- shop ----------

  // Offers: every item at each rarity your best wave has unlocked, priced at sell value x RM_SHOP_MULT. Fixed stock, no luck.
  shopStock() {
    const best = this.save.bestWave; const out = []; const wc = this._worldCopy(); const lv = this.save.level;
    RM_RARITIES.forEach((rar, r) => { if (r < RM_SHOP_UNLOCK.length && (best >= RM_SHOP_UNLOCK[r] || (wc && lv >= RM_SHOP_UNLOCK_LV[r]))) RM_BASE_ITEMS.forEach((def) => out.push({ id: def.id, r, price: rar.sell * RM_SHOP_MULT })); });
    // S12: with an active hero, the styled weapons of the hero's family at the same unlocked rarities (never Epic), sell value x RM_SHOP_MULT.
    const fam = RM_WPN_ITEMS.length && this.heroClass() && typeof MMWeapons !== 'undefined' ? MMWeapons.familyOf(this.heroClass()) : null;
    if (fam) {
      const rs = []; out.forEach((o) => { if (rs.indexOf(o.r) < 0) rs.push(o.r); });
      rs.forEach((r) => RM_WPN_ITEMS.forEach((def) => { if (def.family === fam) out.push({ id: def.id, r, price: RM_RARITIES[r].sell * RM_SHOP_MULT }); }));
    }
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
    this._itemText2(this.player.x, this.player.y - 24, id, r, RM_ITEM_BY_ID[id].name, RM_ITEM_BY_ID[id].icon, RM_RARITIES[r].color);
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
    let foot = '';
    if (this._worldCopy()) { const nr = RM_SHOP_UNLOCK_LV.findIndex((l, r) => sv.level < l && sv.bestWave < RM_SHOP_UNLOCK[r]); if (nr > 0) foot = `Reach level ${RM_SHOP_UNLOCK_LV[nr]} to unlock ${RM_RARITIES[nr].name} gear.`; } else {
      const nextR = RM_SHOP_UNLOCK.findIndex((w) => sv.bestWave < w);
      if (nextR > 0) foot = `Reach wave ${RM_SHOP_UNLOCK[nextR]} to unlock ${RM_RARITIES[nextR].name} gear.`;
    }
    html += `</ul>${foot ? `<div class="dim">${foot}</div>` : ''}`;
    root.innerHTML = html; this._fixIcons(root);
  }

  _die() {
    this.save.deaths += 1;
    this.save.bestWave = Math.max(this.save.bestWave, this.run.wave - 1);
    const cache = this._deathBonus();
    this._lastCache = cache.text;
    if (this.onDeathCache) this.onDeathCache(cache);
    this.lastLoss = 0;
    this.state = 'dead';
    this.deadT = 2.6;
    this.shake = 14;
    this._burst(this.player.x, this.player.y, '#ff6f91', 30, 300);
    this._deathZone = this._worldCopy() ? this._zoneLabel() : '';
    this._showBanner(`You fell in the Realm…  no 💎 lost — ${cache.text}  ·  ${this._deathZone ? `in ${this._deathZone}` : `wave ${Math.max(1, this.run.wave)}`}, ${this.run.kills} kills, +${this.run.shards} 💎 this run`, 2.6);
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
    const unlocked = [0, 1, 2, 3].map((i) => this._ab(i)).filter((a) => a.level === this.save.level);
    this._showBanner(`Level ${this.save.level}!${unlocked.length ? `  ${unlocked[0].icon} ${unlocked[0].name} unlocked` : ''}`, 2);
    this._syncAbilities();
  }

  rollRarity() {
    const w = this.run.wave;
    const r = this.rng();
    const rare = Math.min(0.2, 0.02 + 0.02 * w); const unc = Math.min(0.4, 0.15 + 0.04 * w);
    return r < rare ? 2 : r < rare + unc ? 1 : 0;
  }

  dropBag(x, y, rarity, itemId, worldLoot) {
    const b = this._take(this.bags);
    if (!b) return null;
    b.active = true; b.x = x; b.y = y; b.t = 0; b.r = rarity;
    b.tier = worldLoot?.tierIndex;
    b.lifetime = worldLoot?.lifetime || Infinity;
    b.id = this._wpnDrop(itemId || RM_BASE_ITEMS[Math.floor(this.rng() * RM_BASE_ITEMS.length)].id, worldLoot);
    const a = this.rng() * Math.PI * 2; b.vx = Math.cos(a) * 60; b.vy = Math.sin(a) * 60;
    return b;
  }

  // Styled weapon drops (S12): in a world or dungeon run with an active hero, a rolled classic weapon (Spark / Quickfire Wand) becomes a
  // `wpn_<style>` item with a chance that grows with the bag tier; MMWeaponItems.dropItem picks it (70% the hero's family, 30% any).
  // Seeded (_wpnRng), rarity unchanged. Classic waves, duels, no hero, ?weapons=0 or a page without mm-weapon-items.js: the id is unchanged.
  _wpnDrop(id, worldLoot) {
    if (!RM_WPN_ITEMS.length || !(worldLoot || this.dungeon) || (this.team && this.team.isPvp) || typeof MMWeaponItems === 'undefined') return id;
    const def = RM_ITEM_BY_ID[id], cls = this.heroClass();
    if (!def || def.slot !== 'weapon' || def.wpn || !cls) return id;
    const tier = worldLoot && Number.isFinite(worldLoot.tierIndex) ? Math.max(0, Math.min(4, worldLoot.tierIndex)) : 1;
    if (this._wpnRng() >= Math.min(0.85, 0.45 + 0.1 * tier)) return id;
    let w = null; try { w = MMWeaponItems.dropItem(this._wpnRng, cls); } catch (e) { w = null; }
    return typeof w === 'string' && RM_ITEM_BY_ID[w] && RM_ITEM_BY_ID[w].wpn ? w : id;
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
      this._itemText2(this.player.x, this.player.y - 24, id, rarity, def.name, def.icon, rar.color);
      this._burst(this.player.x, this.player.y, rar.color, 10, 150);
      if (this.onItem) this.onItem(sv.items[sv.items.length - 1]);
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
      if (b.t >= b.lifetime) { b.active = false; continue; }
      b.x += b.vx * dt; b.y += b.vy * dt; b.vx *= 0.93; b.vy *= 0.93;
      b.x = Math.max(14, Math.min(this._bw() - 14, b.x)); b.y = Math.max(14, Math.min(this._bh() - 14, b.y));
      const dx = p.x - b.x; const dy = p.y - b.y; const d = Math.hypot(dx, dy) || 1;
      if (b.t > 0.4 && d < 110) { const k = (230 * dt) / d; b.x += dx * k; b.y += dy * k; } // bags drift toward you
      if (b.t > 0.25 && d < 20 && !this.down) { b.active = false; this.collectItem(b.id, b.r); continue; }
      const q = this.team && this.role === 'host' && this.team.partner && this.team.partner.ready && !this.team.partner.down ? this.team.partner : null;
      if (q && b.t > 0.25 && Math.hypot(q.x - b.x, q.y - b.y) < 20) { b.active = false; this.team.ev('loot', [b.id, b.r], 1); }
    }
  }

  // ---------- abilities ----------

  abilityUnlocked(i) { return this.save.level >= this._ab(i).level; }

  cast(i) {
    if (!this.active || this.state === 'dead' || this.paused) return false;
    const ab = this._ab(i);
    if (!ab || !this.abilityUnlocked(i) || this.abilityCd[i] > 0) return false;
    if (this.team && this.team.isPvp && ab.id !== 'dash') return false; // duels allow only the Dash
    const p = this.player;
    if (ab === this._sigAb) this._castSignature();
    else if (ab.id === 'dash') {
      let dx = this._mx || 0; let dy = this._my || 0;
      if (Math.hypot(dx, dy) < 0.1) { dx = Math.cos(p.aim); dy = Math.sin(p.aim); }
      const len = Math.hypot(dx, dy) || 1;
      this._burst(p.x, p.y, '#8fe9ff', 8, 120);
      if (this._coll()) { for (let k = 0; k < 15; k++) this._movePlayer((dx / len) * 10, (dy / len) * 10); } // stepwise so a dash cannot tunnel through a wall
      else {
        p.x = Math.max(RM_PLAYER.r, Math.min(this._bw() - RM_PLAYER.r, p.x + (dx / len) * 150));
        p.y = Math.max(RM_PLAYER.r, Math.min(this._bh() - RM_PLAYER.r, p.y + (dy / len) * 150));
      }
      p.iframes = Math.max(p.iframes, 0.4);
    } else if (ab.id === 'nova') {
      const nb = this._novaBolts();
      for (let k = 0; k < nb; k++) this.firePlayerBullet((k / nb) * Math.PI * 2);
      this.shake = Math.max(this.shake, 3);
    } else if (ab.id === 'shield') {
      this.shield.hits = 3; this.shield.t = 6;
    } else if (ab.id === 'overdrive') {
      this.overdriveT = 4;
    }
    this.abilityCd[i] = this._abCd(ab);
    if (this.team && this.role === 'guest' && ab !== this._sigAb) this.team.sendAbility(ab.id);
    this._floatText(p.x, p.y - 30, `${ab.icon} ${ab.name}`, '#fff');
    if (ab === this._sigAb) this._showBanner(`${ab.icon} ${ab.name}!`, 1.1);
    this._syncAbilities();
    return true;
  }

  _updateAbilities(dt) {
    let changed = false;
    const cdr = this.player._stm ? this.player._stm.cdRate : 1; // inspired: cooldowns tick x1.4
    for (let i = 0; i < 4; i++) if (this.abilityCd[i] > 0) { this.abilityCd[i] = Math.max(0, this.abilityCd[i] - dt * cdr); changed = true; }
    if (this.overdriveT > 0) this.overdriveT = Math.max(0, this.overdriveT - dt);
    if (this.shield.t > 0) { this.shield.t -= dt; if (this.shield.t <= 0) this.shield.hits = 0; }
    this._updateSignature(dt);
    this._abTick = (this._abTick || 0) + dt;
    if (changed && this._abTick > 0.1) { this._abTick = 0; this._syncAbilities(); }
  }

  // ---------- class signature (F slot) ----------

  _sigDmg(mul) { return this.stats.dmg * (this.sg.powT > 0 ? this.sg.powMul : 1) * mul; }

  _sigHeal(n) {
    const p = this.player; if (this.down || n <= 0 || p.hp >= this.stats.maxHp || (p._stm && p._stm.noHeal)) return 0; // sick: no healing
    const got = Math.min(Math.round(n), this.stats.maxHp - p.hp); if (got <= 0) return 0;
    p.hp += got; this._floatText(p.x, p.y - 40, `+${got}`, '#7ee787'); this._syncHud(); return got;
  }

  _sigFx(x, y, r, color, sec) { const f = this.sg.fx; f.x = x; f.y = y; f.r = r; f.color = color; f.t = f.max = sec; }

  // Damage every live enemy within r of (x, y); returns the damage actually dealt (capped by remaining hp) for drain heals.
  _sigAoe(x, y, r, dmg, knock, slow, slowSec) {
    let dealt = 0;
    for (let i = 0; i < this.enemies.length; i++) {
      const e = this.enemies[i]; if (!e.active) continue;
      const er = RM_ENEMIES[e.type].r; const dx = e.x - x; const dy = e.y - y; const rr = r + er;
      if (dx * dx + dy * dy > rr * rr) continue;
      if (slow < 1) { e.slowT = Math.max(e.slowT || 0, slowSec); e.slowF = slow; }
      if (knock > 0 && e.type !== 'boss') {
        const d = Math.hypot(dx, dy) || 1; const nx = Math.max(20, Math.min(this._bw() - 20, e.x + (dx / d) * knock)); const ny = Math.max(20, Math.min(this._bh() - 20, e.y + (dy / d) * knock));
        if (!this._coll() || !this.isWallAt(nx, ny)) { e.x = nx; e.y = ny; }
      }
      if (dmg > 0) { dealt += Math.min(dmg, Math.max(0, e.hp)); this._hitEnemy(e, dmg); }
    }
    return dealt;
  }

  _sigCancelBullets(x, y, r) {
    const rr = r * r;
    for (let i = 0; i < this.eBullets.length; i++) { const b = this.eBullets[i]; if (b.active && (b.x - x) * (b.x - x) + (b.y - y) * (b.y - y) <= rr) { b.active = false; if (i % 3 === 0) this._burst(b.x, b.y, '#8fe9ff', 1, 50); } }
  }

  _sigVolley(count, spread, dmgMul) {
    const p = this.player; const d = this._sigDmg(dmgMul);
    for (let k = 0; k < count; k++) this.firePlayerBulletFrom(p.x, p.y, p.aim + (count > 1 ? (k / (count - 1) - 0.5) * spread : 0), d, 0);
  }

  _castSignature() {
    const s = this.sig; const p = this.player; const g = this.sg;
    const ax = Math.cos(p.aim); const ay = Math.sin(p.aim);
    if (s.kind === 'volley') {
      this._sigVolley(s.count, s.spread, s.dmg); this._burst(p.x, p.y, '#ffe27a', 8, 160); this.shake = Math.max(this.shake, 2);
    } else if (s.kind === 'dash-volley') {
      let dx = this._mx || 0; let dy = this._my || 0;
      if (Math.hypot(dx, dy) < 0.1) { dx = ax; dy = ay; }
      const len = Math.hypot(dx, dy) || 1;
      this._burst(p.x, p.y, '#b69cff', 10, 150);
      if (this._coll()) { for (let k = 0; k < 15; k++) this._movePlayer((dx / len) * (s.dist / 15), (dy / len) * (s.dist / 15)); }
      else { p.x = Math.max(RM_PLAYER.r, Math.min(this._bw() - RM_PLAYER.r, p.x + (dx / len) * s.dist)); p.y = Math.max(RM_PLAYER.r, Math.min(this._bh() - RM_PLAYER.r, p.y + (dy / len) * s.dist)); }
      p.iframes = Math.max(p.iframes, s.variant === 'smoke' ? 0.8 : 0.5);
      this._burst(p.x, p.y, '#b69cff', 8, 150);
      this._sigVolley(s.count, s.spread, s.dmg);
    } else if (s.kind === 'drain-orb') {
      const blizzard = s.variant === 'blizzard';
      let cx = p.x; let cy = p.y;
      if (!blizzard) { cx = Math.max(10, Math.min(this._bw() - 10, p.x + ax * s.range)); cy = Math.max(10, Math.min(this._bh() - 10, p.y + ay * s.range)); }
      const dealt = this._sigAoe(cx, cy, s.radius, this._sigDmg(s.dmg), 0, blizzard ? s.slow : 1, s.dur);
      this._sigFx(cx, cy, s.radius, blizzard ? '#bfe9ff' : '#c06bff', 0.5);
      this._burst(cx, cy, blizzard ? '#bfe9ff' : '#c06bff', 14, 200);
      if (s.healFrac > 0) this._sigHeal(Math.min(s.heal, s.healFrac * dealt));
    } else if (s.kind === 'oath-shield') {
      this.shield.hits = Math.max(this.shield.hits, s.shield); this.shield.t = Math.max(this.shield.t, s.dur);
      p.iframes = Math.max(p.iframes, 0.3);
      this._sigCancelBullets(p.x, p.y, s.radius);
      this._sigFx(p.x, p.y, s.radius, '#ffe27a', 0.5);
      this._burst(p.x, p.y, '#ffe27a', 12, 170);
      this._sigHeal(s.heal);
    } else if (s.kind === 'rage-slam') {
      this._sigAoe(p.x, p.y, s.radius, this._sigDmg(s.dmg), s.knock, 1, 0);
      this._sigCancelBullets(p.x, p.y, s.radius);
      if (s.powSec > 0) { g.powT = s.powSec; g.powMul = s.powMul; }
      p.iframes = Math.max(p.iframes, 0.3);
      this._sigFx(p.x, p.y, s.radius, '#ff7a3a', 0.45);
      this._burst(p.x, p.y, '#ff7a3a', 18, 240); this.shake = Math.max(this.shake, 6);
    } else if (s.kind === 'thorn-bloom') {
      const b = g.bloom;
      b.x = Math.max(10, Math.min(this._bw() - 10, p.x + ax * s.range * 0.8)); b.y = Math.max(10, Math.min(this._bh() - 10, p.y + ay * s.range * 0.8));
      b.r = s.radius; b.t = s.dur; b.tick = 0.5;
      this._sigApplyBloom(0);
      this._sigFx(b.x, b.y, b.r, '#7ee787', 0.4);
      this._burst(b.x, b.y, '#7ee787', 14, 160);
      this._sigHeal(s.heal);
    } else if (s.kind === 'bone-guard') {
      const bn = g.bones; bn.t = s.dur; bn.n = Math.max(1, Math.min(6, s.count)); bn.heal = s.heal; bn.frac = s.healFrac;
      this._burst(p.x, p.y, '#e9e4d0', 12, 150);
    }
  }

  // Thorn Bloom zone: enemies inside are rooted (heavily slowed); thorns tick every 0.5s.
  _sigApplyBloom(dmg) {
    const b = this.sg.bloom;
    return this._sigAoe(b.x, b.y, b.r, dmg, 0, this.sig.slow, 0.3);
  }

  _updateSignature(dt) {
    const g = this.sg;
    if (g.powT > 0) g.powT = Math.max(0, g.powT - dt);
    if (g.fx.t > 0) g.fx.t -= dt;
    if (!this._sigOn() || this.state === 'dead') return;
    const s = this.sig;
    if (g.bloom.t > 0) {
      const b = g.bloom; b.t -= dt; b.tick -= dt;
      if (b.tick <= 0) { b.tick += 0.5; this._sigApplyBloom(this._sigDmg(s.dmg)); } else this._sigApplyBloom(0);
    }
    if (g.bones.t > 0) {
      const bn = g.bones; const p = this.player; bn.t -= dt; bn.a += dt * 3.2;
      const dmg = this._sigDmg(s.dmg);
      for (let i = 0; i < this.enemies.length; i++) {
        const e = this.enemies[i]; if (!e.active) continue;
        if (e.boneT > 0) { e.boneT -= dt; continue; }
        const rr = RM_ENEMIES[e.type].r + 8;
        for (let k = 0; k < bn.n; k++) {
          const a = bn.a + k * Math.PI * 2 / bn.n; const bx = p.x + Math.cos(a) * s.radius; const by = p.y + Math.sin(a) * s.radius;
          if ((e.x - bx) * (e.x - bx) + (e.y - by) * (e.y - by) > rr * rr) continue;
          const dealt = Math.min(dmg, Math.max(0, e.hp));
          e.boneT = 0.45; this._burst(bx, by, '#e9e4d0', 2, 90); this._hitEnemy(e, dmg);
          if (bn.frac > 0 && bn.heal > 0) { const h = Math.min(bn.heal, bn.frac * dealt); bn.heal -= this._sigHeal(Math.max(1, h)) || 0; }
          break;
        }
      }
    }
  }

  _drawSignature(g) {
    const sg = this.sg; const p = this.player;
    if (sg.fx.t > 0) {
      const f = sg.fx; const k = f.t / f.max;
      g.globalAlpha = 0.7 * k; g.strokeStyle = f.color; g.lineWidth = 3; g.beginPath(); g.arc(f.x, f.y, f.r * (this._reduced ? 1 : 1.05 - 0.15 * k), 0, Math.PI * 2); g.stroke();
      g.globalAlpha = 0.12 * k; g.fillStyle = f.color; g.fill(); g.globalAlpha = 1;
    }
    if (sg.bloom.t > 0) {
      const b = sg.bloom;
      g.globalAlpha = 0.16; g.fillStyle = '#7ee787'; g.beginPath(); g.arc(b.x, b.y, b.r, 0, Math.PI * 2); g.fill();
      g.globalAlpha = 0.6; g.strokeStyle = '#7ee787'; g.lineWidth = 2; g.stroke();
      for (let k = 0; k < 8; k++) { const a = k * Math.PI / 4 + 0.3; g.beginPath(); g.moveTo(b.x + Math.cos(a) * b.r * 0.5, b.y + Math.sin(a) * b.r * 0.5); g.lineTo(b.x + Math.cos(a) * b.r * 0.78, b.y + Math.sin(a) * b.r * 0.78); g.stroke(); }
      g.globalAlpha = 1;
    }
    if (sg.bones.t > 0 && this.state !== 'dead') {
      const bn = sg.bones; g.fillStyle = '#efe9d2'; g.strokeStyle = '#3a2f4a'; g.lineWidth = 1.5;
      for (let k = 0; k < bn.n; k++) {
        const a = bn.a + k * Math.PI * 2 / bn.n; const x = p.x + Math.cos(a) * this.sig.radius; const y = p.y + Math.sin(a) * this.sig.radius;
        g.beginPath(); g.moveTo(x, y - 8); g.lineTo(x + 5, y); g.lineTo(x, y + 8); g.lineTo(x - 5, y); g.closePath(); g.fill(); g.stroke();
      }
    }
    if (sg.powT > 0 && this.state !== 'dead') { g.strokeStyle = 'rgba(255,110,60,0.8)'; g.lineWidth = 2; g.beginPath(); g.arc(p.x, p.y, 18, 0, Math.PI * 2); g.stroke(); }
  }

  // ---------- backpack UI ----------

  // One panel at a time (backpack or kill board); either one pauses the fight.
  _panel(name) {
    if (name && this.state === 'dead') return; // no panels while the death message runs (it would freeze the exit)
    this.panel = name;
    this.paused = !!name && !this.team; // a shared run never freezes (it would time the partner out)
    const bp = document.getElementById('realm-backpack'); if (bp) bp.classList.toggle('hidden', name !== 'bp');
    const bd = document.getElementById('realm-board'); if (bd) bd.classList.toggle('hidden', name !== 'board');
    if (this._menuDom || name === 'menu') { const mn = this._ensureMenuDom(); if (mn) { mn.classList.toggle('hidden', name !== 'menu'); mn.style.display = name === 'menu' ? 'flex' : 'none'; if (name !== 'menu') this._menuConfirm(false); } }
    const shopEl = this._ensureShopDom(); if (shopEl) { shopEl.classList.toggle('hidden', name !== 'shop'); shopEl.style.display = name === 'shop' ? 'flex' : 'none'; }
    const heroEl = document.getElementById('realm-hero'); if (heroEl) { heroEl.classList.toggle('hidden', name !== 'hero'); heroEl.style.display = name === 'hero' ? 'flex' : 'none'; } // hero picker / stats (mad-maze.js owns the DOM)
    if (name === 'hero') { this.keys = {}; this.mouse.down = false; this.aimVec.on = false; if (this.onHeroPanel) this.onHeroPanel(this._heroTab || 'pick'); return; }
    if (name) { this.keys = {}; this.mouse.down = false; this.aimVec.on = false; if (name === 'bp') this.renderBackpack(); else if (name === 'shop') this.renderShop(); else if (name === 'menu') this._syncMenu(); else this.renderBoard(); }
  }

  setPaused(on) { this._panel(on ? 'bp' : null); } // false closes whichever panel is open

  setBoard(on) { this._panel(on ? 'board' : null); }
  // Hero picker / stats panel (only when the page wired onHeroPanel): tab 'pick' or 'stats'.
  openHeroPanel(tab) { if (!this.onHeroPanel || !this.active || this.team) return false; this._heroTab = tab === 'stats' ? 'stats' : 'pick'; this._panel('hero'); return true; }

  // ---------- in-game menu, settings and death screen (opt-in: setMenuMode(true); the town gate keeps the old behaviour) ----------

  setMenuMode(on) {
    this._menuMode = !!on;
    if (on) this._mountMenuBtn();
    if (this._menuBtn) this._menuBtn.classList.toggle('hidden', !on);
    if (!on && this.panel === 'menu') this._panel(null);
  }

  _mountMenuBtn() {
    if (this._menuBtn || typeof document === 'undefined') return;
    const hud = document.getElementById('realm-hud'); if (!hud) return;
    const b = document.createElement('button'); b.id = 'realm-menu-btn'; b.type = 'button'; b.textContent = '☰'; b.setAttribute('aria-label', 'Open menu (Esc)');
    const lb = document.getElementById('realm-leave-btn'); hud.insertBefore(b, lb || null);
    b.addEventListener('click', () => this.setMenu(true));
    this._menuBtn = b;
  }

  setMenu(on) {
    if (!this._menuMode || !this.active) return;
    if (on && this.state === 'dead') return;
    if (on && this.onMenuOpen) this.onMenuOpen();
    this._panel(on ? 'menu' : null);
    if (on && this._menuDom) { const f = this._menuDom.querySelector('button[data-m="resume"].rm-btn'); if (f && f.focus) f.focus({ preventScroll: true }); }
    else if (document.activeElement && document.activeElement.blur && document.activeElement !== document.body) document.activeElement.blur();
  }

  _escMenu() {
    if (this._deathShown) { this.leave(); return; }
    if (this.panel === 'menu') { if (this._menuDom && !this._menuDom.querySelector('.rm-confirm').classList.contains('hidden')) this._menuConfirm(false); else this.setMenu(false); return; }
    if (this.paused || this.panel) { this.setPaused(false); return; }
    this.setMenu(true);
  }

  canRestart() { return this.active && !this.team && !this.dungeon; }

  // Start wave 1 again WITHOUT leaving the page. Items, shards, level and the save stay as they are; only the run (wave, enemies, bullets, bags, hp) resets.
  restart() {
    if (!this.canRestart()) return false;
    this._panel(null);
    this.resyncSave();
    this._beginRun();
    return true;
  }

  isMuted() {
    if (this.sfx) { try { return !!this.sfx.isMuted(); } catch (e) { /* fall through */ } }
    try { return localStorage.getItem('mm-sfx-muted') === '1'; } catch (e) { return false; }
  }

  setMuted(on) {
    if (this.sfx) { try { this.sfx.setMuted(!!on); } catch (e) { /* ignore */ } } else { try { localStorage.setItem('mm-sfx-muted', on ? '1' : '0'); } catch (e) { /* ignore */ } }
    this._syncMenu();
  }

  setReduceMotion(on) {
    try { if (typeof MMMotion !== 'undefined') MMMotion.setOverride(localStorage, !!on); else localStorage.setItem('mm-reduce-motion', on ? '1' : '0'); } catch (e) { /* ignore */ }
    this._readReduced(); this._syncMenu();
  }

  _ensureMenuDom() {
    if (this._menuDom) return this._menuDom;
    const ov = document.getElementById('realm-overlay'); if (!ov) return null;
    const wrap = document.createElement('div');
    wrap.id = 'realm-pause'; wrap.className = 'rm-panel hidden'; wrap.setAttribute('role', 'dialog'); wrap.setAttribute('aria-label', 'Menu'); wrap.style.display = 'none';
    wrap.innerHTML = '<div class="realm-bp-card rm-card"><div class="realm-bp-head"><strong>☰ Menu</strong><button id="realm-menu-close" type="button" data-m="resume" aria-label="Close menu">✖</button></div>'
      + '<div class="rm-main"><button type="button" class="rm-btn" data-m="resume">▶ Resume</button><button type="button" class="rm-btn" data-m="heroes">🦸 Pick hero</button><button type="button" class="rm-btn" data-m="herostats">📊 Hero stats</button><button type="button" class="rm-btn" data-m="restart">↻ Restart run</button><p class="rm-note dim"></p><p class="rm-stash dim hidden" aria-live="polite"></p><button type="button" class="rm-btn" data-m="leave">🚪 Leave to start</button></div>'
      + '<div class="rm-confirm hidden"><p class="rm-restart-copy"></p><button type="button" class="rm-btn" data-m="restart-yes">Yes, restart</button><button type="button" class="rm-btn" data-m="restart-no">Keep playing</button></div>'
      + '<div class="rm-settings"><strong>Settings</strong><button type="button" class="rm-tog" data-set="sound"></button><button type="button" class="rm-tog" data-set="motion"></button><button type="button" class="rm-tog" data-set="aim"></button></div></div>';
    ov.appendChild(wrap);
    wrap.addEventListener('click', (e) => {
      const b = e.target.closest('button'); if (!b) return;
      const m = b.dataset.m; const st = b.dataset.set;
      if (m === 'resume') this.setMenu(false);
      else if (m === 'restart') { if (this.canRestart()) this._menuConfirm(true); }
      else if (m === 'heroes') this.openHeroPanel('pick');
      else if (m === 'herostats') this.openHeroPanel('stats');
      else if (m === 'restart-yes') this.restart();
      else if (m === 'restart-no') this._menuConfirm(false);
      else if (m === 'leave') this.leave();
      else if (st === 'sound') this.setMuted(!this.isMuted());
      else if (st === 'motion') this.setReduceMotion(!this._reduced);
      else if (st === 'aim') this.setAimAssist(!this._aimAssist);
      if (st) this._syncMenu();
    });
    return (this._menuDom = wrap);
  }

  _menuConfirm(on) {
    const d = this._menuDom; if (!d) return;
    d.querySelector('.rm-confirm').classList.toggle('hidden', !on);
    d.querySelector('.rm-main').classList.toggle('hidden', on);
    const f = d.querySelector(on ? 'button[data-m="restart-yes"]' : 'button[data-m="resume"].rm-btn'); if (f && f.focus && this.panel === 'menu') f.focus({ preventScroll: true });
  }

  _syncMenu() {
    const d = this._menuDom; if (!d) return;
    d.querySelector('.rm-restart-copy').textContent = this.mode === 'world' && !this.dungeon
      ? 'Return to the island spawn? You keep your items and shards.'
      : 'Restart? You keep your items and shards; your wave resets.';
    ['heroes', 'herostats'].forEach((k) => { const hb = d.querySelector(`button[data-m="${k}"]`); if (hb) hb.classList.toggle('hidden', !this.onHeroPanel || !!this.team); });
    const rs = d.querySelector('button[data-m="restart"]'); const note = d.querySelector('.rm-note');
    const can = this.canRestart(); rs.disabled = !can;
    note.textContent = can ? '' : this.team ? 'Restart is off during a shared run: your partner is fighting too.' : this.dungeon ? 'Restart is off in a Warren: leave and enter again for a new one.' : '';
    note.classList.toggle('hidden', can);
    const sn = d.querySelector('.rm-stash'); const st = this.menuNote ? String(this.menuNote() || '') : '';
    if (sn.textContent !== st) sn.textContent = st; sn.classList.toggle('hidden', !st);
    const set = (k, label, on) => { const b = d.querySelector(`button[data-set="${k}"]`); const t = `${label}: ${on ? 'on' : 'off'}`; if (b.textContent !== t) b.textContent = t; b.setAttribute('aria-pressed', on ? 'true' : 'false'); b.classList.toggle('on', on); };
    set('sound', '🔊 Sound', !this.isMuted()); set('motion', '🌀 Reduce motion', !!this._reduced); set('aim', '🎯 Aim assist', !!this._aimAssist);
  }

  _ensureDeathDom() {
    if (this._deathDom) return this._deathDom;
    const ov = document.getElementById('realm-overlay'); if (!ov) return null;
    const wrap = document.createElement('div');
    wrap.id = 'realm-death'; wrap.className = 'rm-panel hidden'; wrap.setAttribute('role', 'dialog'); wrap.setAttribute('aria-label', 'You fell'); wrap.style.display = 'none';
    wrap.innerHTML = '<div class="realm-bp-card rm-card"><div class="realm-bp-head"><strong>☠️ You fell in the Realm</strong></div><div class="rm-recap"></div>'
      + '<div class="rm-main"><button type="button" class="rm-btn" data-d="again">↻ Try again</button><button type="button" class="rm-btn" data-d="leave">🚪 Leave</button></div></div>';
    ov.appendChild(wrap);
    wrap.addEventListener('click', (e) => { const b = e.target.closest('button[data-d]'); if (!b) return; if (b.dataset.d === 'again') this.restart(); else this.leave(); });
    return (this._deathDom = wrap);
  }

  _showDeath() {
    const d = this._ensureDeathDom(); if (!d) { this.stop(); this.onExit('death'); return; }
    this._deathShown = true; this.keys = {}; this.mouse.down = false; this.aimVec.on = false; this.moveVec.x = 0; this.moveVec.y = 0;
    const showWave = this.mode !== 'world' || !!this.dungeon;
    const waveRow = showWave ? `<div class="realm-board-row"><span>🌊 Wave reached</span><b>${Math.max(1, this.run.wave)}</b></div>` : '<div class="realm-board-row rm-zone-row"><span>🗺️ Zone</span><b></b></div>';
    d.querySelector('.rm-recap').innerHTML = `${waveRow}<div class="realm-board-row"><span>⚔️ Kills</span><b>${this.run.kills}</b></div><div class="realm-board-row"><span>💎 Shards this run</span><b>+${this.run.shards}</b></div><div class="realm-board-row"><span>🎁 Survivor's cache</span><b>${this._lastCache.replace(/^cache: /, '')}</b></div>`;
    if (!showWave) { const zb = d.querySelector('.rm-zone-row b'); if (zb) zb.textContent = this._deathZone || this._zoneLabel(); } // textContent: the zone name comes from the page
    const sn = this.menuNote ? String(this.menuNote() || '') : '';
    if (sn) { const row = document.createElement('div'); row.className = 'realm-board-row rm-stash-row'; row.textContent = sn; d.querySelector('.rm-recap').appendChild(row); }
    d.classList.remove('hidden'); d.style.display = 'flex';
    const f = d.querySelector('button[data-d="again"]'); if (f && f.focus) f.focus({ preventScroll: true });
  }

  _hideDeath() { const d = this._deathDom; if (d) { d.classList.add('hidden'); d.style.display = 'none'; } }

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
    if (RM_SLOTS.indexOf(slot) < 0) return false; // inert wpn_ item from a newer build: kept, never equipped
    if (this.save.eq[slot] !== uid && RM_ITEM_BY_ID[it.id].wpn && !this._wpnCanEquip(RM_ITEM_BY_ID[it.id])) return false; // styled weapon: the hero's family only
    if (this.save.eq[slot] === uid) delete this.save.eq[slot]; else this.save.eq[slot] = uid;
    this._afterGearChange();
    return true;
  }

  // Fuse RM_COMBINE_COUNT identical items (same gear + rarity) into ONE of the next rarity: +50%..+80% of the stat. The item you clicked survives upgraded.
  combinable(uid) {
    const it = this.save.items.find((x) => x.n === uid);
    if (!it || it.r >= RM_RARITIES.length - 1 || RM_ITEM_BY_ID[it.id].inert) return null;
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
    this._itemText2(this.player.x, this.player.y - 34, c.keep.id, c.keep.r, `${RM_RARITIES[c.keep.r].name}!`, RM_ITEM_BY_ID[c.keep.id].icon, RM_RARITIES[c.keep.r].color);
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
    if (def.inert) return def.text;
    const num = def.pct ? `+${Math.round(v * 100)}%` : `+${Math.round(v * 10) / 10}`;
    return `${num} ${def.text}`;
  }

  renderBackpack() {
    const root = document.getElementById('realm-backpack-body');
    if (!root) return;
    const sv = this.save;
    const eqUids = new Set(RM_SLOTS.map((sl) => sv.eq[sl]).filter(Boolean));
    let html = `<div id="realm-bp-stats">${this._statLine()}</div><button type="button" class="eq" data-open-shop="1" aria-label="Open the shop (V)" style="min-height:44px;margin:4px 0">🛒 Shop (V)</button><div class="realm-bp-slots">`;
    RM_SLOTS.forEach((slot) => {
      const it = sv.items.find((x) => x.n === sv.eq[slot]);
      html += `<div class="realm-bp-slot" data-slot="${slot}">${it ? `<span style="color:${RM_RARITIES[it.r].color}">${this._icon(RM_ITEM_BY_ID[it.id])} ${RM_ITEM_BY_ID[it.id].name}</span>` : `<span class="dim">${slot}: empty</span>`}</div>`;
    });
    html += `</div><div class="realm-bp-count">${sv.items.length} / ${RM_BACKPACK} items</div><ul id="realm-bp-list">`;
    if (!sv.items.length) html += '<li class="dim">Nothing yet — defeat enemies to find loot bags.</li>';
    sv.items.forEach((it) => {
      const def = RM_ITEM_BY_ID[it.id]; const rar = RM_RARITIES[it.r]; const on = eqUids.has(it.n);
      html += `<li data-uid="${it.n}" class="${on ? 'on' : ''}"><span class="nm" style="color:${rar.color}">${this._icon(def)} ${def.name}</span><span class="rar">${rar.name}</span><span class="st">${this._itemText(it)}</span>${def.inert ? '<button type="button" class="eq" disabled aria-label="Not usable yet">Equip</button>' : def.wpn && !on && !this._wpnCanEquip(def) ? `<button type="button" class="eq" disabled data-wpn-lock="1" aria-label="${this._wpnHint(def)} only" title="${this._wpnHint(def)}">🔒 ${def.family.charAt(0).toUpperCase() + def.family.slice(1)}</button>` : `<button type="button" class="eq" data-act="equip" data-uid="${it.n}">${on ? 'Unequip' : 'Equip'}</button>`}${this.combinable(it.n) ? `<button type="button" class="eq" data-combine="${it.n}" aria-label="Combine ${RM_COMBINE_COUNT} ${rar.name} ${def.name} into one ${RM_RARITIES[it.r + 1].name}">Combine ${RM_COMBINE_COUNT}→${RM_RARITIES[it.r + 1].name}</button>` : ''}<button type="button" class="dc" data-act="discard" data-uid="${it.n}" aria-label="Sell ${def.name} for ${rar.sell} shards">Sell ${rar.sell}💎</button></li>`;
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
    const wd = this.world; const cam = this.camera;
    const vx0 = wd ? cam.x - 72 : -1e9; const vy0 = wd ? cam.y - 72 : -1e9; const vx1 = wd ? cam.x + this.W + 72 : 1e9; const vy1 = wd ? cam.y + this.H + 72 : 1e9; // world: draw only what is near the view
    if (wd) { // one translate per frame: everything below is in world px; the HUD / menus are DOM (screen space)
      g.translate(-cam.x, -cam.y);
      if (wd.drawUnder) wd.drawUnder(g, cam); else { g.fillStyle = '#10202a'; g.fillRect(cam.x - 10, cam.y - 10, this.W + 20, this.H + 20); }
    } else {
      this._floorPatterns = this._floorPatterns || [];
      if (!this._floorPatterns[this.biome]) this._floorPatterns[this.biome] = g.createPattern(this.sprites.floors[this.biome], 'repeat');
      g.fillStyle = this._floorPatterns[this.biome]; g.fillRect(-10, -10, this.W + 20, this.H + 20);
      g.strokeStyle = RM_BIOMES[this.biome].border; g.lineWidth = 4; g.strokeRect(2, 2, this.W - 4, this.H - 4);
    }
    if (this.walls) { const w = this.walls; for (let r = 0; r < w.rows; r++) for (let c = 0; c < w.cols; c++) if (w.cells[r][c] === 1) { g.fillStyle = '#1b1430'; g.fillRect(c * RM_TILE, r * RM_TILE, RM_TILE, RM_TILE); g.fillStyle = RM_BIOMES[this.biome].border; g.fillRect(c * RM_TILE, r * RM_TILE, RM_TILE, 3); g.fillRect(c * RM_TILE, r * RM_TILE, 3, RM_TILE); } }
    if (this.dungeon) this.dungeon.drawUnder(g);
    for (let i = 0; i < this.hazards.length; i++) { const h = this.hazards[i]; if (h.active) { g.globalAlpha = h.kind === 'lava' ? 0.85 + Math.sin(this.clock * 4 + i) * 0.1 : 0.9; g.drawImage(this.sprites.hazard[h.kind], h.x - 48, h.y - 48); g.globalAlpha = 1; } }
    for (let i = 0; i < this.drifters.length; i++) { const d = this.drifters[i]; if (d.active && !(this._enemyArt && this._drawDrifterArt(g, d))) g.drawImage(this.sprites.drifter[d.kind], d.x - 12, d.y - 12 + Math.sin(d.t * 3) * 3); }

    for (let i = 0; i < this.enemies.length; i++) {
      const e = this.enemies[i];
      if (!e.active || e.x < vx0 || e.x > vx1 || e.y < vy0 || e.y > vy1) continue;
      const spr = this.sprites[e.type];
      const bob = e.type === 'boss' ? 0 : Math.sin(e.t * 4) * 2;
      const art = e.type === 'boss' ? !!(this._bossArt && this._drawBossArt(g, e)) : !!(this._enemyArt && this._drawEnemyArt(g, e, RM_ENEMIES[e.type]));
      if (!art) g.drawImage(spr, e.x - spr.width / 2, e.y - spr.height / 2 + bob);
      if (e.flash > 0) { g.globalAlpha = e.flash * 0.7; g.fillStyle = '#fff'; g.beginPath(); g.arc(e.x, e.y + (art ? 0 : bob), RM_ENEMIES[e.type].r, 0, Math.PI * 2); g.fill(); g.globalAlpha = 1; }
      if (e.type === 'boss' && e.invuln > 0) { g.strokeStyle = 'rgba(255,255,255,0.8)'; g.lineWidth = 3; g.beginPath(); g.arc(e.x, e.y, 40 + Math.sin(e.t * 20) * 2, 0, Math.PI * 2); g.stroke(); }
      if (e.hp < e.maxHp && e.type !== 'boss') { g.fillStyle = 'rgba(0,0,0,0.6)'; g.fillRect(e.x - 14, e.y - spr.height / 2 - 6, 28, 4); g.fillStyle = RM_ENEMIES[e.type].color; g.fillRect(e.x - 14, e.y - spr.height / 2 - 6, 28 * (e.hp / e.maxHp), 4); }
    }
    if (this._edGhosts) this._drawEnemyGhosts(g);
    if (this._bossGhost) this._drawBossGhost(g);
    for (let i = 0; i < this.bags.length; i++) { const b = this.bags[i]; if (b.active && b.x > vx0 && b.x < vx1 && b.y > vy0 && b.y < vy1) { const by = b.y - 13 + Math.sin(b.t * 5) * 2; g.drawImage(this.sprites.worldBag[b.tier] || this.sprites.bag[b.r], b.x - 13, by); if (this._itemArt) { const ic = this._lootIcon(b.id, b.r); if (ic) g.drawImage(ic, b.x - 10, by - 18 + Math.sin(b.t * 5 + 1) * 1.5); } } }
    let ebn = 0; const ebs = this.sprites.eBullet;
    for (let i = 0; i < this.eBullets.length && ebn < RM_EB_DRAW; i++) { const b = this.eBullets[i]; if (b.active && b.x > vx0 && b.x < vx1 && b.y > vy0 && b.y < vy1) { if (!(b.ea && this._drawEBoltArt(g, b))) g.drawImage(ebs[b.kind] || ebs[0], b.x - 8, b.y - 8); ebn++; } }
    this._ebDrawn = ebn;
    for (let i = 0; i < this.pBullets.length; i++) { const b = this.pBullets[i]; if (b.active && b.x > vx0 && b.x < vx1 && b.y > vy0 && b.y < vy1) { if (b.ws) this._drawWpnBolt(g, b); else if (!(this._boltArt && this._drawBoltArt(g, b))) g.drawImage(this.sprites.pBullet, b.x - 10, b.y - 10); } }
    if (this._sparks) this._drawSparks(g);
    if (this.weapon) this._drawWpnOrbs(g);

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
    if (this.sig) this._drawSignature(g);
    if (this.dungeon) this.dungeon.drawOver(g);
    if (wd && wd.drawOver) wd.drawOver(g, cam);
    for (let i = 0; i < this.particles.length; i++) {
      const pt = this.particles[i];
      if (!pt.active || pt.x < vx0 || pt.x > vx1 || pt.y < vy0 || pt.y > vy1) continue;
      g.globalAlpha = Math.max(0, pt.life / pt.max); g.fillStyle = pt.color; g.fillRect(pt.x - pt.size / 2, pt.y - pt.size / 2, pt.size, pt.size);
    }
    g.globalAlpha = 1;
    g.font = 'bold 14px system-ui, sans-serif'; g.textAlign = 'center';
    const hs = this._stAnchorAt(); const ox = wd ? cam.x : 0; const oy = wd ? cam.y : 0; // floating numbers never sit under the top-right HUD buttons
    for (let i = 0; i < this.texts.length; i++) {
      const t = this.texts[i];
      if (!t.active) continue;
      const ty0 = t.y; if (hs.bB > 0 && t.y - oy < hs.bB + 10 && t.x - ox > hs.bL - 40) t.y = oy + hs.bB + 10; // drawn just below them (restored after)
      g.globalAlpha = Math.min(1, t.life * 2.5);
      const ic = t.ico && this._itemArt ? this._lootIcon(t.ico, t.ir) : null;
      if (ic) { // icon + name: the icon replaces the emoji
        const w = g.measureText(t.plain).width; const x0 = t.x - (w + 22) / 2;
        g.drawImage(ic, x0, t.y - 15); g.textAlign = 'left';
        g.fillStyle = '#000'; g.fillText(t.plain, x0 + 23, t.y + 1); g.fillStyle = t.color; g.fillText(t.plain, x0 + 22, t.y);
        g.textAlign = 'center';
      } else { g.fillStyle = '#000'; g.fillText(t.text, t.x + 1, t.y + 1); g.fillStyle = t.color; g.fillText(t.text, t.x, t.y); }
      t.y = ty0;
    }
    g.globalAlpha = 1;
    g.restore();
    this._drawStatusIcons(g); // screen space, above the world and the floating numbers
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

  _worldCopy() { return this.mode === 'world' && !this.dungeon && !(this.team && this.team.isPvp); } // world mode: zone / level wording, never 'wave'

  // The zone the hero is in, for world-mode copy: an optional hook (zoneLabel), else the zone HUD the world draws (#rw-zone / #realm-wave).
  _zoneLabel() {
    try {
      if (typeof this.zoneLabel === 'function') { const z = String(this.zoneLabel() || '').slice(0, 40); if (z) return z; }
      const zn = document.querySelector('#rw-zone .rw-zname'); const t = zn ? zn.textContent.split(' · ')[0].trim() : '';
      if (t) return t.slice(0, 40);
      const w = document.getElementById('realm-wave'); const wt = w ? w.textContent.trim() : '';
      if (wt && !/wave|get ready/i.test(wt)) return wt.slice(0, 40);
    } catch (e) { /* no DOM */ }
    return 'the Realm';
  }

  _syncHud(force) {
    const hp = document.getElementById('realm-hp-fill');
    if (hp) hp.style.width = `${Math.max(0, this.player.hp) / this.stats.maxHp * 100}%`;
    const hpText = document.getElementById('realm-hp-text');
    if (hpText) hpText.textContent = `${Math.ceil(this.player.hp)} / ${this.stats.maxHp}`;
    const wc = this._worldCopy();
    const wave = document.getElementById('realm-wave');
    if (wave && !wc) wave.textContent = this.team && this.team.isPvp ? this.team.duelLabel() : this.run.wave > 0 ? `Wave ${this.run.wave}` : 'Get ready'; // world mode: the world writes the zone here
    else if (wave && /wave|get ready/i.test(wave.textContent)) wave.textContent = '';
    const shards = document.getElementById('realm-shards');
    if (shards) shards.textContent = `💎 ${Math.floor(this.displayShards)}`;
    const bio = document.getElementById('realm-biome');
    if (bio && !wc) bio.textContent = this.run.wave > 0 && !(this.team && this.team.isPvp) ? RM_BIOMES[this.biome].name : '';
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
    if (best) best.textContent = this.save.bestWave > 0 && !wc ? `Best wave ${this.save.bestWave}` : '';
    if (force) this._hideBanner();
  }

  _syncAbilities() {
    for (let i = 0; i < 4; i++) {
      const el = document.getElementById(`realm-ab-${i}`);
      if (!el) continue;
      const ab = this._ab(i); const unlocked = this.abilityUnlocked(i); const cd = this.abilityCd[i];
      el.classList.toggle('locked', !unlocked);
      el.classList.toggle('cooling', unlocked && cd > 0);
      const cdEl = el.querySelector('.cd');
      if (cdEl) cdEl.textContent = !unlocked ? `Lv${ab.level}` : cd > 0 ? String(Math.ceil(cd)) : '';
      el.setAttribute('aria-label', `${ab.name} (${ab.key.toUpperCase()})${unlocked ? '' : ` — unlocks at level ${ab.level}`}`);
      if (i === 3) { // the F slot shows the class signature (icon + short name) when one is set
        const ico = el.querySelector('.ico'); if (ico && ico.textContent !== ab.icon) ico.textContent = ab.icon;
        let nm = el.querySelector('.nm');
        if (this._sigOn()) {
          if (!nm) { nm = document.createElement('span'); nm.className = 'nm'; el.appendChild(nm); }
          if (nm.textContent !== ab.short) nm.textContent = ab.short;
          el.title = ab.name; el.dataset.sig = this.sig.kind;
        } else { if (nm) nm.remove(); el.removeAttribute('title'); delete el.dataset.sig; }
      }
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
