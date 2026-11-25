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
//
// URL switches (each `=0` turns one additive layer off and restores the behaviour from before it):
//   ?unlocks=0   unlock-tree passives / Nova II / Dash II (S12)        ?weapons=0  styled `wpn_` weapon items (S12)
//   ?boltart=0   bolt art (code-drawn bolts)                           ?fxart=0    one-shot effect art
//   ?uiicons=0   ability icon art (emoji only)                         ?difficulty=off  wave / world difficulty curve (MMDifficulty)
//   ?focus=0     focus resource (FO2): abilities cost nothing, cooldowns only (as before); no focus bar
//   ?telegraph=0 enemy wind-ups (TG3): tier 3+ world enemies and world bosses fire with no ring/line/cone warning (as before)
// Focus only runs with an active Mad Maze hero (setHeroLevelSource); telegraphs only in the solo world (mode 'world', no dungeon).
// The town's classic arena, co-op (wire format) and duels are unchanged by both.
// Accessibility prefs (AC1, MMAccess.prefs on `pixeltown-access-v1`, re-read once a second): a colour-blind `palette` gives enemy bullets
// that palette's colours (plus a 2 px dark outline while `bulletOutline` is on; with the normal palette, `bulletOutline: false` drops the
// usual dark bullet rim); `flashes: false` drops the red hit vignette and the
// white enemy hit flash. Reduce motion (MMMotion) makes telegraphs static (no pulse or growth). Bullet counts and timings never change.

const RM_SHORT = 540; // logical arena short side; the long side follows the screen's shape
const RM_DV_MIN = 0.5, RM_DV_FILL = 0.6, RM_DV_ZOOM_MAX = 2; // dungeon view (PLAYTEST-REVIEW-3 #4): below RM_DV_MIN of the screen height, show the room at RM_DV_FILL of it (at most RM_DV_ZOOM_MAX x the fitted size)
const RM_PLAYER = { speed: 235, r: 11, hp: 100, fireRate: 7.5, bulletSpeed: 580, bulletLife: 0.85, dmg: 1, iframes: 0.5 };
const RM_ENEMIES = {
  spiral: { name: 'Whirler', hp: 16, r: 17, shards: 3, color: '#b36bff', speed: 22 },
  aimed: { name: 'Sniper', hp: 8, r: 13, shards: 2, color: '#ff6b6b', speed: 80 },
  ring: { name: 'Burster', hp: 11, r: 15, shards: 2, color: '#ffb347', speed: 48 },
  boss: { name: 'Gloomheart', hp: 120, r: 34, shards: 40, color: '#ff5fa2', speed: 50 },
};
const RM_ENEMY_BULLET_DAMAGE = 8;
// ID-14 (cycle 3 S): draw-only hit pause. A hit of at least RM_HIT_PAUSE_FRAC of max HP holds the last drawn frame for RM_HIT_PAUSE_MS;
// the sim (_update: clock, bullets, timers) keeps running every frame. Off under reduce motion and with ?hitpause=0.
const RM_HIT_PAUSE_MS = 50; const RM_HIT_PAUSE_FRAC = 0.15;
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
const RM_AF_RANGE = 380; // AR auto-fire reach (logical px): about the player's bolt range, so it never fires at what it cannot hit
const RM_EB_HUES = [['#ff4f6d', '#ffd0d8'], ['#b46bff', '#ecdcff'], ['#ffa62b', '#fff0c8']]; // aimed (red), spiral (violet), ring (orange)
// cyc7 G: the fast aimed shot moves from pink-red (hue ~350) to orange-red (hue ~13) so the three enemy hues (orange-red / violet / amber)
// separate from red ground decoration; the b17 `ebolt_orb_red` art gets the same shift at bake time (its saturated pixels rotate by
// RM_EB_AIM_ROT degrees, the dark rim stays). `?hitfx=0` keeps the old pink-red (A/B); colour-blind palettes are unchanged.
const RM_EB_AIM_WARM = ['#ff5a2e', '#ffd6c4']; const RM_EB_AIM_ROT = 24;
const RM_EB_DRAW = 320;
// Rotate the hue of the saturated pixels of a baked canvas (S x S) by deg degrees; dark / grey pixels (the rim) keep their colour.
function rmHueRotate(c, S, deg) {
  let im; try { im = c.getImageData(0, 0, S, S); } catch (e) { return false; }
  const d = im.data, sh = deg / 360;
  for (let i = 0; i < d.length; i += 4) {
    if (!d[i + 3]) continue;
    const r = d[i] / 255, g = d[i + 1] / 255, b = d[i + 2] / 255, mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2, ch = mx - mn;
    if (ch < 0.25 || l < 0.18) continue; // the dark rim and greys stay
    const s = ch / (1 - Math.abs(2 * l - 1));
    let h = mx === r ? ((g - b) / ch) % 6 : mx === g ? (b - r) / ch + 2 : (r - g) / ch + 4; h = (h / 6 + sh + 1) % 1;
    const q = (1 - Math.abs(2 * l - 1)) * s, x = q * (1 - Math.abs((h * 6) % 2 - 1)), m = l - q / 2, k = Math.floor(h * 6);
    const rgb = k === 0 ? [q, x, 0] : k === 1 ? [x, q, 0] : k === 2 ? [0, q, x] : k === 3 ? [0, x, q] : k === 4 ? [x, 0, q] : [q, 0, x];
    d[i] = Math.round((rgb[0] + m) * 255); d[i + 1] = Math.round((rgb[1] + m) * 255); d[i + 2] = Math.round((rgb[2] + m) * 255);
  }
  c.putImageData(im, 0, 0); return true;
}
// cyc6 G hit feedback: the hit vignette is a warm palette red (#e8643c, about 0.4 alpha at the screen edge) in an ellipse that follows
// the view's aspect, so it reads over blue water and never tints the ground under the hero (the old radial magenta covered ~70% of a
// phone screen); slow enemy bullets (speed < RM_EB_SLOW) carry a 2-dot motion trail and every enemy bullet a larger white core, so a
// moving shot no longer reads as red litter on the ground. `?hitfx=0` restores the old look (A/B).
const RM_HIT_RGB = '232,100,60'; const RM_HIT_EDGE_A = 0.42; const RM_EB_SLOW = 190; const RM_EB_CORE_R = 2.0;
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
const RM_FX_MAX = 16; // live one-shot effect sprites (setFxArt)
// G11 player splash (GEAR-DROPS-BUILD-PLAN d): FX / text for at most 24 events a frame (extras still deal damage), one combined number per event at most
// 6 a second and only while <= 22 texts are live; code rings come from a fixed pool. Kill switches ?splash=0 and ?gear=0 (no splash at all).
const rmSame = (x, y) => x === y || (x !== x && y !== y); // P2: what a `${x}` string compare said for numbers, without building strings
const RM_VENOM_ST = Object.freeze({ sec: 3, src: 'wpn' });
const RM_LOW_DMG_GAP = 1 / 12, RM_LOW_TXT_MUL = 2; // P2: low graphics tier damage-text throttle (plain numbers at most 12/s; splash numbers half as often)
const RM_SPLASH_FX = 24, RM_SPLASH_TXT_GAP = 1 / 6, RM_SPLASH_TXT_MAX = 22, RM_SPLASH_RINGS = 12, RM_SPLASH_COL = '#ffb36b';
const RM_SPARK_CLASS = { ranger: 'a', bruiser: 'a', berserker: 'a', punk: 'a', rogue: 'a', paladin: 'a', frostcaller: 'b', herald: 'b', druid: 'b', warlock: 'c', necromancer: 'c', trickster: 'c', gravetender: 'c', shadowpaw: 'c' };
const RM_EB_ROT = { ebolt_shard: 1, ebolt_arrow: 1, ebolt_fire: 1, ebolt_frost: 1, ebolt_laser_h: 1, ebolt_skull: 0 };
const RM_WPN_COLOR = { dot: '#ffe27a', arrow: '#f3d9a4', shard: '#9fe3ff', orb: '#c59bff', star: '#ffd24a', blade: '#e6edf3', page: '#fff3c4', axe: '#ff9a6a', hammer: '#ffcf5a', fist: '#ffb38a', ray: '#7ee7ff' };
// URL kill switches (S12): ?unlocks=0 turns off the unlock-tree passives / Nova II / Dash II, ?weapons=0 the styled weapon items.
// rmFlag(name) -> '0' when ANY ?name= value is 0 (a kill switch always wins, duplicates and %-encoding included), '1' when any is 1, else null.
// The one parser for these switches: realm.js, dungeon.js and realm-world.js all read ?gear= / ?forge= through it (review F15).
function rmFlag(name) {
  try {
    if (typeof location === 'undefined' || typeof URLSearchParams === 'undefined') return null;
    const vs = new URLSearchParams(location.search || '').getAll(name).map((v) => String(v).trim());
    return vs.indexOf('0') >= 0 ? '0' : vs.indexOf('1') >= 0 ? '1' : null;
  } catch (e) { return null; }
}
function rmFlagOff(name) { return rmFlag(name) === '0'; }
// This file's folder (for shared modules and UI art), from the <script> tag that loaded it; '' when unknown (no art, no loader).
const RM_DIR = (function () { try { const s = typeof document !== 'undefined' && document.currentScript && document.currentScript.src; return s ? String(s).replace(/[?#].*$/, '').replace(/[^/]*$/, '') : ''; } catch (e) { return ''; } })();
// Shared modules the arena layers need (FO2 mm-focus, TG3 mm-access + mm-telegraph; mm-telegraph reads MMAccess, so it loads last): a page that does not list one gets it here (ordered, async=false). Every use checks
// `typeof`, so the arena runs exactly as before until (or unless) they load. A page that already has the module loads nothing.
(function rmLoadShared() {
  try {
    if (typeof document === 'undefined' || !RM_DIR || !document.head || typeof window === 'undefined') return;
    [['MMAccess', 'mm-access.js'], ['MMFocus', 'mm-focus.js'], ['MMTelegraph', 'mm-telegraph.js']].forEach((m) => {
      if (typeof window[m[0]] !== 'undefined' || document.querySelector(`script[src*="${m[1]}"]`)) return;
      const s = document.createElement('script'); s.src = RM_DIR + 'shared/' + m[1]; s.async = false; document.head.appendChild(s);
    });
  } catch (e) { /* the arena never depends on these */ }
})();
const RM_UI_ART = RM_DIR ? RM_DIR + 'assets/arcane/b19-ui-icons/ui/' : ''; // b19 UI art (focus bar frame + icon)
// b29 gear-tier UI icons (provisional batch): 16 px tier badges, stat and affix icons beside text that always stays (code fallback: a failed image
// is removed). ?art=0 or ?uiicons=0 = text only.
const RM_GEAR_UI = RM_DIR && !rmFlagOff('art') && !rmFlagOff('uiicons') ? RM_DIR + 'assets/arcane/b29-gear-tiers/ui/' : '';
const RM_GEAR_UI_RE = /^ui_(tier_badge_([1-9]|1[0-2])|stat_(crit|splash|resist|leech|regen|range)|affix_(keen|blast|venom|swift|reach|leech|pierce|vital|ward|fleet|resist|mend))$/; // MMArt.GEAR_UI_RE
// Damage numbers (S14): crits gold, marked pink (MMStatus colours), armorBroken purple; everything else stays white.
const RM_DMG_COL = { plain: '#fff', crit: '#ffd24a', marked: '#ff8fa8', armorBroken: '#b77bff' };
const RM_PIP_MAX = 3, RM_PIP_PX = 8; // at most 3 status pips over an enemy; more collapse into "+n"
// Telegraphs (TG3): MMTelegraph shape -> code on the pooled enemy (0 = none). Sprites are baked once per colour (no per-frame paths).
const RM_TG_CODE = { ring: 1, line: 2, cone: 3 };
const RM_TG_LINE = 220, RM_TG_CONE = 0.42; // aimed line length (px) and cone half-angle (rad; the boss fan is 0.72 wide)
const RM_ST_ICON_PX = 24; // HUD status icon size in css px (was 20; PLAYTEST-REVIEW-2 #11: readable at a glance)
// Focus (FO2): ability id -> MMFocus cost id (Dash 0, Nova 25, Shield 30, Overdrive 40, Signature 40). Cooldowns are kept on top.
const RM_FOCUS_ID = { dash: 'dash', nova: 'nova', shield: 'shield', overdrive: 'overdrive', sig: 'signature' };
function rmInertDef(id) {
  if (RM_ITEM_BY_ID[id]) return RM_ITEM_BY_ID[id];
  const arm = id.slice(0, 4) === 'arm_'; // an `arm_` armor id kept by a page without MMGear or under ?gear=0
  const name = id.slice(4).split('_').filter(Boolean).map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ').slice(0, 24) || (arm ? 'Armor' : 'Weapon');
  const def = { id, slot: 'none', name, icon: arm ? '🛡️' : '🗡️', stat: 'none', amount: 0, text: 'not usable yet', inert: true };
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
// Tiered gear (GEAR-DROPS-BUILD-PLAN G7/G8). Item entries gain the additive fields `t` (tier 1-12) and `a` (uint32 affix seed, T7+ only); the save gains
// `eq.armor`, `gv` (1 = this save has seen tiered gear) and `gp` ({b, d} pity counters). rmCleanSave KEEPS all of them on every page, with or without
// MMGear and under ?gear=0, so a tab of this build (or later) never erases them; only their effect is switched: RM_GEAR_ON = MMGear on the page and not
// ?gear=0 (the kill switch). Off: no armor slot, `arm_` ids are inert items, `t`/`a` are ignored (classic T0 formulas), no affixes / resist / leech / regen.
// (A build older than G7 does not know these fields and its cleaner strips them: that is why G7 ships one deploy before any drop creates them.)
// Armor `arm_<family>_<band>` defs are lookup-only (never in RM_ITEMS / RM_BASE_ITEMS: never dropped by the classic pools or stocked by the shop).
const RM_ARM_ID = /^arm_[a-z]{3,8}_[a-z]{3,10}$/; // MMGear.GEAR_ID_RE
const RM_GEAR_ON = !rmFlagOff('gear') && typeof MMGear !== 'undefined' && !!MMGear && typeof MMGear.clean === 'function';
// GW one-deploy gate (review F3, the G7 pattern): builds older than GW strip `dust`, `f` and `sig`, so the gear-fixsave deploy only KEPT them (rmCleanSave /
// rmMergeSave) while nothing created them. That deploy is on master now (every live tab keeps them), so P2 flips the default ON: the Forge
// (salvage -> dust, reforge -> f), T12 boss signatures (`sig`) on new drops (realm-world.js / dungeon.js SIG_ON) and the sig-only "Dread pair" set all
// follow RM_FORGE_ON. ?forge=0 is the kill switch (always wins), ?forge=1 still forces it on; ?gear=0 wins over both.
const RM_FORGE_DEFAULT_ON = true;
const RM_FORGE_ON = !rmFlagOff('gear') && (rmFlag('forge') === '1' || (RM_FORGE_DEFAULT_ON && rmFlag('forge') !== '0'));
const RM_SPLASH_ON = RM_GEAR_ON && !rmFlagOff('splash') && typeof MMSplash !== 'undefined' && !!MMSplash && typeof MMSplash.pick === 'function'; // G11 player splash
const RM_ARMOR_ICON = { light: '🦺', robe: '👘', heavy: '🛡️' };
(function rmRegisterArmor() {
  if (!RM_GEAR_ON || !MMGear.ARMOR_IDS) return;
  MMGear.FAMILY_KEYS.forEach((fam) => (MMGear.ARMOR_IDS[fam] || []).concat((MMGear.SIG_BY_FAMILY || {})[fam] || []).forEach((id) => {
    if (!RM_ARM_ID.test(id) || RM_ITEM_BY_ID[id]) return;
    RM_ITEM_BY_ID[id] = { id, slot: 'armor', name: String(MMGear.ARMOR_NAMES[id] || id).slice(0, 24), icon: RM_ARMOR_ICON[fam] || '🛡️', art: MMGear.ARMOR_ART[id] || null, stat: 'armor', amount: 0, text: 'armor', family: fam, arm: true };
  }));
  RM_SLOTS.push('armor'); // the 4th slot exists only with MMGear (and not ?gear=0)
})();
const RM_EQ_KEYS = ['weapon', 'charm', 'ring', 'armor']; // every eq key the cleaner keeps (eq.armor survives ?gear=0 / pages without MMGear)
// Item tier `t` and affix seed `a` as stored: t an integer 1-12 on sparkwand / wpn_ / arm_ ids only (never quickwand: fire-rate stacking); a uint32 >= 1 on T7+.
// MMGear.clean does it when present (it also clamps arm_ tiers into their band); the fallback keeps the same rules without the band table.
function rmCleanGear(id, r, raw, aliasT) {
  if (typeof MMGear !== 'undefined' && MMGear && typeof MMGear.clean === 'function') {
    const c = MMGear.clean({ n: 1, id, r, t: Number.isInteger(raw.t) ? raw.t : aliasT, a: raw.a });
    return c && c.id === id ? { t: c.t || 0, a: c.a || 0 } : { t: 0, a: 0 };
  }
  const tv = Number.isInteger(raw.t) ? raw.t : aliasT;
  const t = Number.isInteger(tv) && tv >= 1 && tv <= 12 && (id === 'sparkwand' || RM_WPN_ID.test(id) || RM_ARM_ID.test(id)) ? tv : 0;
  const a = t >= 7 && Number.isInteger(raw.a) && raw.a >= 1 && raw.a <= 4294967295 ? raw.a : 0;
  return { t, a };
}
// GW (additive): `sig` (a T12 weapon's boss signature affix id, GB) and `f` ({ id, v }: the one forged affix, MMGearForge, t >= 7 only) on an item, and
// `dust` (forge currency) on the save. Kept by every page (with or without the gear modules, and under ?gear=0) so no tab ever erases them; only
// their effect is switched. The fallbacks mirror MMGear.SIG_AFFIX_IDS / MMGearAffix.IDS for pages without those modules (the Town page).
const RM_SIG_IDS = ['ward', 'blast', 'venom', 'leech', 'pierce'];
const RM_AFFIX_IDS = ['keen', 'blast', 'venom', 'swift', 'reach', 'leech', 'pierce', 'vital', 'ward', 'fleet', 'resist', 'mend'];
function rmCleanSig(id, t, a, sig) {
  if (t !== 12 || !a || typeof sig !== 'string') return '';
  if (typeof MMGear !== 'undefined' && MMGear && typeof MMGear.clean === 'function') { const c = MMGear.clean({ n: 1, id, r: 0, t, a, sig }); return c && c.sig ? c.sig : ''; }
  return (id === 'sparkwand' || RM_WPN_ID.test(id)) && RM_SIG_IDS.indexOf(sig) >= 0 ? sig : '';
}
function rmCleanForged(t, f) {
  if (!(t >= 7) || !f || typeof f !== 'object' || Array.isArray(f) || typeof f.id !== 'string') return null;
  const ok = typeof MMGearAffix !== 'undefined' && MMGearAffix && MMGearAffix.AFFIXES ? Object.prototype.hasOwnProperty.call(MMGearAffix.AFFIXES, f.id) : RM_AFFIX_IDS.indexOf(f.id) >= 0;
  const v = Number(f.v);
  if (!ok || !(typeof f.v === 'number' && Number.isFinite(v) && v > 0 && v <= 100)) return null;
  return { id: f.id, v: Math.round(v * 1000) / 1000 };
}
// Sell value: the rarity's value, plus 2 x tier for tiered gear (MMGear.sellValue) while gear is on.
const RM_CACHE_KILLS = 3, RM_CACHE_ALIVE_S = 60; // G-09: a Survivor's cache needs this many kills or seconds alive since the last one
const RM_PROVOKE_S = 4; // G-08: seconds a world shooter hit from off screen ignores hold-fire
const RM_ARM_MS = 300, RM_SELL_ASK_MS = 3000, RM_FORGE_ARM_MS = 400; // b02-12: Forge confirm / Salvage buttons wake later (a phone double-tap can be ~350 ms)
// cyc5 (b02-r3-01): a slow tap rhythm (~450 ms) on "Confirm reforge" reached Salvage on tap 2 and Confirm salvage on tap 3. Now taps that follow
// "Confirm reforge" less than RM_FORGE_RHYTHM_MS apart form one tap chain, and a Salvage / Confirm salvage tap inside it is ignored; "Confirm
// salvage" also sleeps RM_FORGE_SAL_YES_MS after its ask opens. A deliberate tap after a pause works as before.
const RM_FORGE_RHYTHM_MS = 600, RM_FORGE_SAL_YES_MS = 900;
// G-03: backpack buttons wake 300 ms after a re-render; a protected Sell's "Sure?" lasts 3 s
function rmNowMs() { return typeof performance !== 'undefined' && performance.now ? performance.now() : 0; } // b02-12 arm clock (UI only)
function rmSellValue(it) { return RM_GEAR_ON && it && it.t ? MMGear.sellValue(it.r, it.t) : RM_RARITIES[it.r].sell; }
// A resolved MMWeapons spec, re-clamped into a plain frozen object the engine trusts. Only the 26 alternate styles count (bases keep today's fire).
function rmWpnSpec(s) {
  const n = (v, lo, hi, d) => (typeof v === 'number' && Number.isFinite(v) ? Math.max(lo, Math.min(hi, v)) : d);
  const o = (v) => (v && typeof v === 'object' ? v : {});
  const id = typeof s.id === 'string' ? s.id : '';
  const sidx = MMWeapons.altIds().indexOf(id);
  if (sidx < 0) return null;
  const wv = o(s.wave), ch = o(s.chain), ob = o(s.orbit), bu = o(s.burst), lo = o(s.lob), oh = o(s.onHit), sp = o(s.splash);
  const spR = n(lo.radius, 0, 100, 0) > 0 ? 0 : n(sp.r, 0, 80, 0); // splash never with lob (MMWeapons.validate)
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
    splash: Object.freeze({ r: spR, frac: spR > 0 ? n(sp.frac, 0, 0.8, 0) : 0, inner: n(sp.inner, 0, 1, 0.35), edge: n(sp.edge, 0, 1, 0.5), max: spR > 0 ? Math.floor(n(sp.max, 0, 6, 0)) : 0 }), // G11 (the 4 splash styles)
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

function rmGpOf(g) { g = g && typeof g === 'object' && !Array.isArray(g) ? g : {}; return { b: rmCleanCount(g.b), d: rmCleanCount(g.d) }; } // cleaned pity counters (defaults when absent / corrupt)
function rmCleanCount(v) {
  v = Math.floor(Number(v));
  return Number.isFinite(v) && v > 0 ? Math.min(v, 9999999) : 0;
}
// UR (item tag): every item CREATED from now on carries `u`, a random 31-bit tag, next to its integer uid `n`. Uids still come from the shared
// `nextUid` counter (so every uid sequence stays as it was, and every build, old ones included, loads the item: they cap uids at 9,999,999, which
// rules out salting the uid itself), but two tabs that picked under the same uid before either synced now hold two different `u`s, so the merge
// can always tell the items apart: identity is (n, u) when both copies have a tag, and (n, id, r, t, a) as before when either lacks one (an item
// from before UR, or one an old build rewrote: old cleaners drop unknown keys, which is harmless). Additive key: absent or corrupt = no tag.
const RM_TAG_MAX = 2147483647;
// The tag is an identity nonce, never a gameplay roll: it comes from crypto.getRandomValues (Math.random stays untouched, so the forge and vendor stay
// free of randomness as their tests assert); Math.random only where crypto is missing.
function rmItemTag() {
  try { if (typeof crypto !== 'undefined' && crypto && typeof crypto.getRandomValues === 'function') { const b = new Uint32Array(1); crypto.getRandomValues(b); return 1 + (b[0] % (RM_TAG_MAX - 1)); } } catch (e) { /* fall back below */ }
  return 1 + Math.floor(Math.random() * (RM_TAG_MAX - 1));
}
function rmCleanTag(u) { return Number.isInteger(u) && u > 0 && u <= RM_TAG_MAX ? u : 0; }
// The `known` set a tab keeps for the merge: every uid storage held at its last sync, plus for each TAGGED item `n:`, `n:u` and `n#id/r/t/a` (which
// item that uid named). Plain number lookups (known.has(n)) work as before; rmKnownSame asks whether `it` is the very item this tab saw under its uid:
// by tag, or (a copy an old build rewrote without its tag) by id / r / t / a. Knowledge of an untagged item keeps the old uid-only rule.
const rmItemFp = (it) => it.id + '/' + it.r + '/' + (it.t || 0) + '/' + (it.a || 0);
function rmKnownOf(items) {
  const k = new Set();
  (items || []).forEach((it) => { k.add(it.n); if (it.u) { k.add(it.n + ':'); k.add(it.n + ':' + it.u); k.add(it.n + '#' + rmItemFp(it)); } });
  return k;
}
function rmKnownSame(known, it) {
  if (!known.has(it.n)) return false;
  if (!known.has(it.n + ':')) return true;
  return it.u ? known.has(it.n + ':' + it.u) : known.has(it.n + '#' + rmItemFp(it));
}
function rmTagged(it) { if (it && typeof it === 'object') it.u = rmItemTag(); return it; } // stamp a NEW item entry (returns it)

// Everything read back from localStorage goes through here (additive fields: old saves load as level 1).
function rmCleanSave(s) {
  s = s && typeof s === 'object' ? s : {};
  const out = { shards: rmCleanCount(s.shards), bestWave: rmCleanCount(s.bestWave), kills: rmCleanCount(s.kills), deaths: rmCleanCount(s.deaths) };
  const kb = s.kb && typeof s.kb === 'object' ? s.kb : {};
  out.kb = { spiral: rmCleanCount(kb.spiral), aimed: rmCleanCount(kb.aimed), ring: rmCleanCount(kb.ring), drifter: rmCleanCount(kb.drifter), boss: rmCleanCount(kb.boss) };
  out.bossBestT = Math.min(rmCleanCount(s.bossBestT), 999999); // fastest boss kill in tenths of a second (0 = none yet)
  // ID-06 (additive, only written when set): 1 = that best was set by an Assisted run (damage taken below 100 percent). Still a best.
  if (s.bestWaveA === 1 && out.bestWave > 0) out.bestWaveA = 1;
  if (s.bossBestTA === 1 && out.bossBestT > 0) out.bossBestTA = 1;
  out.level = Math.max(1, Math.min(RM_MAX_LEVEL, rmCleanCount(s.level) || 1));
  out.xp = out.level >= RM_MAX_LEVEL ? 0 : Math.min(rmCleanCount(s.xp), rmXpNeeded(out.level) - 1);
  out.items = [];
  const seen = new Set();
  (Array.isArray(s.items) ? s.items.slice(0, 200) : []).forEach((it) => {
    if (out.items.length >= RM_BACKPACK || !it || typeof it !== 'object') return;
    const uid = rmCleanCount(it.n);
    let id = typeof it.id === 'string' ? it.id : null, aliasT;
    const al = id && typeof MMGear !== 'undefined' && MMGear && typeof MMGear.alias === 'function' ? MMGear.alias(id) : null; // legacy armor_<fam>_t<n> (MMItems / MMQuests.rewardBag)
    if (al && al.id) { id = al.id; aliasT = al.t; }
    const def = id ? (RM_ITEM_BY_ID[id] || (RM_WPN_ID.test(id) || RM_ARM_ID.test(id) ? rmInertDef(id) : null)) : null;
    const rar = Math.floor(Number(it.r));
    if (!uid || seen.has(uid) || !def || !(rar >= 0 && rar < RM_RARITIES.length)) return;
    seen.add(uid);
    const o = { n: uid, id, r: rar }; // an item without `t` (every item before G7) stays exactly {n, id, r}
    const tg = rmCleanTag(it.u); if (tg) o.u = tg; // UR: only when present and valid (an untagged item stays byte-identical)
    const g = rmCleanGear(id, rar, it, aliasT);
    if (g.t) {
      o.t = g.t; if (g.a) o.a = g.a;
      const sg = rmCleanSig(id, g.t, g.a, it.sig); if (sg) o.sig = sg; // GB / GW: additive, only when valid
      const fg = rmCleanForged(g.t, it.f); if (fg) o.f = fg;
    }
    out.items.push(o);
  });
  out.nextUid = Math.max(rmCleanCount(s.nextUid), 1 + out.items.reduce((m, it) => Math.max(m, it.n), 0));
  out.eq = {};
  const eq = s.eq && typeof s.eq === 'object' ? s.eq : {};
  RM_EQ_KEYS.forEach((slot) => {
    const it = out.items.find((x) => x.n === rmCleanCount(eq[slot]));
    if (!it) return;
    const sl = RM_ITEM_BY_ID[it.id].slot;
    if (sl === slot || (slot === 'armor' && sl === 'none' && RM_ARM_ID.test(it.id))) out.eq[slot] = it.n; // eq.armor is kept (inert) where there is no armor slot
  });
  // gv / gp only when present (a save without them stays byte-identical); garbage becomes the defaults. gv is also set once any tiered item exists.
  if (s.gv === 1 || out.items.some((x) => x.t)) out.gv = 1;
  if (s.dust !== undefined) out.dust = rmCleanCount(s.dust); // GW forge dust: only when present (old saves stay byte-identical); corrupt -> 0
  if (s.gp !== undefined) { const gp = s.gp && typeof s.gp === 'object' && !Array.isArray(s.gp) ? s.gp : {}; out.gp = { b: Math.min(rmCleanCount(gp.b), 9999), d: Math.min(rmCleanCount(gp.d), 9999) }; }
  return out;
}

// ---------- cross-tab save merge ----------
// The arena keeps `realm` in memory and used to write it back whole, so two tabs clobbered each other.
// Now every save re-reads pixeltown-save-v1, merges (never loses progress) and writes the merge.
const RM_SAVE_KEY = 'pixeltown-save-v1';
const RM_SAVE_SOON_MS = 250; // review F16: coalesced persist delay for kill-path saves (saveSoon)
const RM_TILE = 40; // wall-grid tile size in logical px
// GH downgrade hint record (pixeltown-gearhint-v1, owned by realm-world.js: { n, shown, d?, f? }). A deliberate removal in THIS tab (salvage, sell,
// combine) rewrites the remembered counts so the hint never reads a normal salvage as an old-tab reset (review F10). Only an existing record is updated.
const RM_GEAR_HINT_KEY = 'pixeltown-gearhint-v1';
function rmGearHintOf(sv) { const items = sv && Array.isArray(sv.items) ? sv.items : []; return { n: items.length, d: sv && sv.dust !== undefined ? 1 : 0, f: items.filter((x) => x && x.f).length }; }
function rmGearHintOwn(sv) {
  try {
    if (typeof localStorage === 'undefined') return;
    const raw = localStorage.getItem(RM_GEAR_HINT_KEY); if (!raw) return;
    const o = JSON.parse(raw); if (!o || typeof o !== 'object' || Array.isArray(o)) return;
    const h = rmGearHintOf(sv); const n0 = Number.isInteger(o.n) ? o.n : 0, f0 = Number.isInteger(o.f) ? o.f : 0;
    const next = { n: Math.min(n0, h.n), shown: o.shown === 1 ? 1 : 0, d: o.d === 1 && h.d ? 1 : 0, f: Math.min(f0, h.f) }; // only ever lowered here (a pickup never needs it)
    if (next.n !== n0 || next.f !== f0 || next.d !== (o.d === 1 ? 1 : 0)) localStorage.setItem(RM_GEAR_HINT_KEY, JSON.stringify(next));
  } catch (e) { /* storage full or blocked: the hint is only advice */ }
}

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
  { // ID-06: the Assisted tag follows the best it belongs to; on a tie the unassisted one wins
    const wA = (a.bestWave === out.bestWave && a.bestWaveA) || 0, wB = (b.bestWave === out.bestWave && b.bestWaveA) || 0;
    const aw = a.bestWave === out.bestWave, bw = b.bestWave === out.bestWave;
    if (out.bestWave > 0 && (aw ? wA : 1) && (bw ? wB : 1)) out.bestWaveA = 1;
    const ab = a.bossBestT === out.bossBestT, bb = b.bossBestT === out.bossBestT;
    if (out.bossBestT > 0 && (ab ? a.bossBestTA : 1) && (bb ? b.bossBestTA : 1)) out.bossBestTA = 1;
  }
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
    if (!other) { if (rmKnownSame(known, it)) return; items.push({ ...it }); return; } // gone from storage because another tab sold it, or new here
    const tagged = !!(it.u && other.u); // UR: both copies carry a tag, so (n, u) is the identity
    // UR (FZ uid reuse): this tab knew THIS item under uid n, and storage now holds a DIFFERENT tagged item under n: the one this tab knew left storage
    // (sold / used in another tab) and a tab that had not seen it yet picked its own item under the same uid. Drop this stale copy; storage's is taken below.
    if (tagged && it.u !== other.u && rmKnownSame(known, it)) return;
    if ((!tagged || it.u === other.u) && other.id === it.id && other.r === it.r && (other.t || 0) === (it.t || 0) && (other.a || 0) === (it.a || 0)) { // same item: identity is (n, id, r, t, a) ...
      // ... unless this tab never saw that uid in storage (FZ issue A): then both tabs picked their own copy under the same uid before either synced,
      // so they are two items and this tab's gets a fresh uid below. Only when the caller tracks `known` (RealmArena always does). Equal tags are
      // always the same item (UR), so a twin is renumbered only when a copy has no tag.
      if (tagged || !(opts.known && !known.has(it.n))) {
        // FZ issue B: never drop `sig` / `f` (or the UR tag) that storage holds for the same item (this copy may come from an old tab's stripped write); this tab's wins when both have one
        const o = { ...it }; if (!o.sig && other.sig) o.sig = other.sig; if (!o.f && other.f) o.f = { ...other.f }; if (!o.u && other.u) o.u = other.u;
        items.push(o); return;
      }
    }
    const fresh = next++; remap[it.n] = fresh; items.push({ ...it, n: fresh }); // a uid collision between two different items: this tab's gets a fresh uid (keeping t / a), storage's keeps the old one
  });
  const have = new Set(items.map((it) => it.n));
  b.items.forEach((it) => {
    if (have.has(it.n)) return;
    const mineHas = a.items.some((x) => x.n === it.n);
    if (!mineHas && rmKnownSame(known, it)) return; // sold here (UR: only the very item this tab saw; a new tagged item that reused the uid is taken)
    items.push({ ...it }); have.add(it.n);
  });
  const eq = { ...a.eq }; Object.keys(eq).forEach((slot) => { if (remap[eq[slot]] !== undefined) eq[slot] = remap[eq[slot]]; });
  if (items.length > RM_BACKPACK) { // review F8: the cleaner keeps the first 24, so cut the LEAST valuable first (unequipped, then lowest tier, then lowest rarity), never a T12 before a T0
    const eqd = new Set(Object.keys(eq).map((k) => eq[k]));
    const rank = items.map((it, i) => ({ i, e: eqd.has(it.n) ? 1 : 0, t: it.t || 0, r: it.r }));
    rank.sort((x, y) => (y.e - x.e) || (y.t - x.t) || (y.r - x.r) || (x.i - y.i));
    const keepI = new Set(rank.slice(0, RM_BACKPACK).map((x) => x.i));
    for (let i = items.length - 1; i >= 0; i--) if (!keepI.has(i)) items.splice(i, 1); // the kept items stay in their order
  }
  out.items = items; out.nextUid = next; out.eq = eq; // equipment is per-tab
  if (a.gv || b.gv) out.gv = 1;
  if (a.dust !== undefined || b.dust !== undefined) { const ad = a.dust || 0; const bs = Number.isFinite(opts.baseDust) ? opts.baseDust : ad; const bd = b.dust !== undefined ? b.dust : (a.dust !== undefined ? bs : 0); out.dust = Math.max(0, bd + (ad - bs)); } // three-way like shards. SV1: a stored save WITHOUT the key was rewritten by a pre-535faf6 tab (a modern cleaner keeps `dust: 0`), so it says nothing about dust: read it as unchanged (the base), never as 0
  if (a.gp || b.gp) { const ga = a.gp || { b: 0, d: 0 }, gb = b.gp || { b: 0, d: 0 }; const bs = opts.baseGp; // storage's gp at this tab's last sync: three-way like shards, so an in-tab reset / increment survives while another tab's change is added
    out.gp = bs ? { b: Math.max(0, gb.b + (ga.b - bs.b)), d: Math.max(0, gb.d + (ga.d - bs.d)) } : { b: Math.max(ga.b, gb.b), d: Math.max(ga.d, gb.d) }; }
  return rmCleanSave(out);
}

class RealmArena {
  constructor({ container, save, onSave, onExit, seed }) {
    this.container = container;
    this._onSave = onSave || (() => {});
    this.onSave = (sv) => { this._saveDirty = false; if (this._saveTimer) { clearTimeout(this._saveTimer); this._saveTimer = 0; } this.saveWrites = (this.saveWrites || 0) + 1; return this._persist(sv); }; // every save goes through the cross-tab merge first (and covers a pending saveSoon, review F16)
    this.onExit = onExit || (() => {});
    this.save = rmCleanSave(save);
    this._baseShards = this.save.shards; this._baseDust = this.save.dust || 0; this._baseGp = rmGpOf(this.save.gp); this._known = rmKnownOf(this.save.items); this.saveOk = true; this.saveFails = 0; this.walls = null; this.extraGuard = 0;
    this._hitFxOff = rmFlagOff('hitfx'); this._ebTrails = 0; this.dungeon = null; this.fixedWorld = null; this._dv = null; this._dvOff = rmFlagOff('dview'); // optional run controller + fixed-size world (Mad Maze dungeons); null = classic waves
    this.world = null; this.mode = 'waves'; this.camera = { x: 0, y: 0, vw: 960, vh: RM_SHORT }; this._camF = { x: 0, y: 0 }; // setWorld / setMode: a scrolling world with a camera (null = the screen is the world, today's behaviour)
    this._solidAt = null; this._shotSolidAt = null; this._curDm = 1; this.onEnemyKilled = null; this.onEnemyHit = null; // world tile collision + additive kill / hit callbacks (default null)
    this.fireBudget = null; this._ebLive = 0; this._ebCapped = 0; // world fire budget {cap, travel} (PLAYTEST-REVIEW-2 #2), set by realm-world.js; null = today's bullets
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
    this._abIconRoot = null; // setAbilityIcons
    this._fx = null; this._fxPool = null; this._fxDraws = 0; // optional one-shot effect art (setFxArt)
    this.heroProfile = null; // setHeroProfile
    this._heroSrc = null; this._hu = null; // setHeroLevelSource: the active hero {cls, level} (null = classic: account level, no unlock nodes)
    this.weapon = null; this._wq = []; this._wOrbT = [0, 0, 0]; this._wOrbA = 0; this._wCache = null; this._kIn = {}; this._kHero = { x: 0, y: 0 }; this._kWall = 0; this._kW = null; // setHeroWeapon (null = today's fire)
    this.sig = null; this._sigAb = { id: 'sig', key: 'f', icon: '🔥', name: 'Signature', short: '', level: 7, cd: 15 }; // setHeroSignature: the class signature takes the F slot (null = Overdrive, today's behaviour)
    this._tgOff = rmFlagOff('telegraph'); this._tgSpr = null; this._tgDesc = null; this._tgDescKey = ''; this._tgSndAt = -9; this.tgStarted = 0; this.tgDrawn = 0; this._tgLk = { scale: 1, alpha: 0, len: 0 }; // TG3 telegraphs
    this.acc = null; this._accRaw = undefined; this._accT = 1; this._ebCB = null; this._ebCBKey = ''; // TG3 accessibility prefs (MMAccess.prefs; null = defaults)
    this.focus = null; this._focusOff = rmFlagOff('focus'); this._fDom = null; this._fHudT = 0; this._fShown = ''; this._fMask = -1; this._fPlaceT = -9; this.focusShorts = 0; // FO2 focus (MMFocus state; null = off)
    this.sg = { powT: 0, powMul: 1, fx: { t: 0, max: 0.5, x: 0, y: 0, r: 0, color: '#fff' }, bloom: { t: 0, x: 0, y: 0, r: 0, tick: 0 }, bones: { t: 0, a: 0, n: 0, heal: 0, frac: 0 } }; // signature runtime state (preallocated)
    this._heroArt = null; this._heroClass = null; this._heroSt = null; this._heroDbg = null; this._heroHurtAt = -9; this._heroAtkAt = -9; // optional hero animations (setHeroArt)
    this.team = null; this.role = 'solo'; this.down = false; this.reviveT = 0; this._firing = false;
    this._menuMode = false; this._deathShown = false; this._lastCache = ''; this._menuDom = null; this._deathDom = null; this._menuBtn = null; // in-game menu + death screen: opt-in via setMenuMode(true)
    this._pf = { ema: 16, slow: 0, fast: 0, q: 1, on: false }; this._cssK = 1; this._vpKey = ''; this._cvKey = ''; this._rzKey = ''; // perf guard (render-resolution scale) + resize caches
    try { this._pf.on = (typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches) || (typeof window !== 'undefined' && 'ontouchstart' in window); } catch (e) { this._pf.on = false; }

    this.canvas = document.createElement('canvas');
    this.canvas.id = 'realm-canvas';
    this.canvas.setAttribute('role', 'img'); this.canvas.setAttribute('aria-label', 'Realm play field');
    this.container.appendChild(this.canvas);
    this.ctx = this.canvas.getContext('2d');

    this._wireInit();
    this._makePools();
    this._calcStats();
    this._bakeSprites();
    this._bindInput();
    this._resize();
    this._onStorage = (e) => { if (!e.key || e.key === RM_SAVE_KEY) this.resyncSave(); }; // kept on the instance so destroy() can remove it (cycle0 L-11)
    if (typeof window !== 'undefined' && window.addEventListener) window.addEventListener('storage', this._onStorage);
    // Review F16: hot paths (a kill, a partner's kill reward) mark the save dirty (saveSoon) and ONE coalesced persist runs RM_SAVE_SOON_MS later; every
    // explicit onSave (pickup, death, wave, shop, exit ...) persists at once and clears the pending one. Flushed on stop (exit / death screen leave),
    // menu open, `visibilitychange: hidden` and `pagehide`, so closing or hiding the tab never loses a kill's shards.
    this._saveDirty = false; this._saveTimer = 0; this.saveWrites = 0; this.saveSoonCalls = 0; // test hooks: persists run / saveSoon requests
    this._onHide = () => { this.flushSave(); };
    this._onVis = () => { if (typeof document !== 'undefined' && document.visibilityState === 'hidden') this.flushSave(); };
    if (typeof window !== 'undefined' && window.addEventListener) window.addEventListener('pagehide', this._onHide);
    if (typeof document !== 'undefined' && document.addEventListener) document.addEventListener('visibilitychange', this._onVis);
  }

  // Review F16: request a persist soon (coalesced: at most one per RM_SAVE_SOON_MS however many kills land in a frame). Returns nothing; flushSave() forces it.
  saveSoon() {
    this.saveSoonCalls++;
    this._saveDirty = true;
    if (this._saveTimer) return;
    this._saveTimer = setTimeout(() => { this._saveTimer = 0; this.flushSave(); }, RM_SAVE_SOON_MS);
  }
  // Persist now if a saveSoon is pending. Returns the persist result, or true when nothing was pending.
  flushSave() {
    if (this._saveTimer) { clearTimeout(this._saveTimer); this._saveTimer = 0; }
    if (!this._saveDirty) return true;
    return this.onSave(this.save);
  }

  // Replace the in-memory save with `m` in place (callers hold references to this.save) and refresh what depends on it.
  _adopt(m) {
    const sv = this.save; const before = JSON.stringify([sv.level, sv.items, sv.eq]);
    Object.keys(sv).forEach((k) => { delete sv[k]; }); Object.assign(sv, m);
    if (JSON.stringify([sv.level, sv.items, sv.eq]) !== before) { this.markStatsDirty(); this._calcStats(); if (this.active) this._syncHud(); }
  }

  // Merge with whatever is in storage now (another tab may have written) without writing.
  resyncSave() {
    const stored = rmReadStoredRealm();
    if (!stored) return false;
    this._adopt(rmMergeSave(this.save, stored, { base: this._baseShards, baseDust: this._baseDust, known: this._known, baseGp: this._baseGp }));
    this._syncBase(stored); // the bases are what storage held at this sync (review F7: not the merged value, or an unsaved in-memory delta is lost)
    return true;
  }

  // The three-way merge bookkeeping (_known uids, shard / dust / pity bases) = exactly what `stored` (the raw realm in storage) holds.
  _syncBase(stored) {
    const st = rmCleanSave(stored);
    this._known = rmKnownOf(st.items); this._baseShards = st.shards; this._baseDust = st.dust || 0; this._baseGp = rmGpOf(st.gp);
    return st;
  }

  // Merge, write, then set the bookkeeping from what storage REALLY holds after the write (review F1): a write that failed (quota full, blocked storage)
  // leaves storage as it was, so a fresh pickup stays "new here" and is written next time instead of being read as "sold in another tab".
  // Returns true when storage now holds this save (also on this.saveOk); false = not saved (this.saveFails counts them, a calm note shows in play).
  _persist(sv) {
    this.resyncSave();
    let ret; try { ret = this._onSave(this.save); } catch (e) { ret = false; }
    const stored = rmReadStoredRealm();
    let ok = ret !== false;
    if (stored) {
      const st = this._syncBase(stored);
      ok = ok && st.shards === this.save.shards && (st.dust || 0) === (this.save.dust || 0) && st.items.length === this.save.items.length && st.items.every((it, i) => it.n === this.save.items[i].n && it.r === this.save.items[i].r && (it.t || 0) === (this.save.items[i].t || 0));
    } else { // nothing readable in storage (no storage, or a page that saves elsewhere): keep every item as new here, never drop one
      this._known = new Set();
      // FZ issue C: a FAILED write leaves the bases where they were (the unsaved shards / dust / pity are still this tab's delta for the next merge)
      if (ok) { this._baseShards = this.save.shards; this._baseDust = this.save.dust || 0; this._baseGp = rmGpOf(this.save.gp); }
    }
    this.saveOk = ok;
    if (!ok) {
      this.saveFails = (this.saveFails || 0) + 1;
      const now = Date.now();
      if (this.active && this.player && !(now - (this._saveWarnAt || 0) < 20000)) { this._saveWarnAt = now; try { this._notice('Storage full: progress not saved yet', '#ff9a8a'); } catch (e) { /* cosmetic */ } }
    }
    return ok;
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
    // cycle 3 (L hot path): solo (no ready partner) the answer is always this.player, so no distance is measured. Each Math.hypot
    // call returns a boxed number (12 bytes), once per enemy per frame.
    const t0 = this.team;
    if (!(t0 && t0.role === 'host' && t0.partner && t0.partner.ready && !t0.partner.down)) return this.player;
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
      this.save.deaths += 1; this._setBestWave(this.run.wave - 1);
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
    if (r.t === 'wave') { const gain = Math.max(0, Math.round(r.sh)); sv.shards += gain; this._setBestWave(this.run.wave); this.run.shards += gain; this.onSave(sv); this._syncHud(); return; }
    const gain = Math.max(1, Math.round(r.sh * this.stats.shards));
    sv.shards += gain; this.run.shards += gain;
    if (r.t === 'drifter') sv.kb.drifter += 1;
    else if (r.boss) { sv.kb.boss += 1; sv.kills += 1; if (r.tenths && (!sv.bossBestT || r.tenths < sv.bossBestT)) this._setBossBest(r.tenths); } else if (Object.prototype.hasOwnProperty.call(sv.kb, r.t) && typeof sv.kb[r.t] === 'number') { sv.kb[r.t] += 1; sv.kills += 1; }
    this._floatText(this.player.x, this.player.y - 36, `+${gain} 💎`, '#8fe9ff');
    this._gainXp(Math.max(1, Math.round(r.xp * this.stats.xp)));
    this.saveSoon(); // review F16: one coalesced persist for a burst of partner kills
  }

  // ---------- pools ----------

  _makePools() {
    const make = (n, f) => Array.from({ length: n }, f);
    this.pBullets = make(RM_POOL.pBullets, () => ({ active: false, x: 0, y: 0, vx: 0, vy: 0, life: 0, ws: null, st: 0, age: 0, cx: 0, cy: 0, ph: 0, bc: 0, ch: 0, ux: 1, uy: 0, sp: 0, bk: false, tx: 0, ty: 0, lb: 0, ho: 0, sq: 0 })); // ws..ho: weapon-style bolt state (setHeroWeapon); sq: splashed (G11)
    this.eBullets = make(RM_POOL.eBullets, () => ({ active: false, x: 0, y: 0, vx: 0, vy: 0, life: 0, kind: 0, ea: null, ok: null, oa: null, on: null })); // ok/oa/on: the owner's type, art id and boss name (cyc7 fall card)
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
      const r = this._er(e) + 5; const dx = this._hq.x - e.x; const dy = this._hq.y - e.y;
      if (dx * dx + dy * dy < r * r) this._hq.best = id;
    };
    this._padPrev = [false, false, false, false]; this._aimTargets = [];
    this.sfx = null; this._gesture = false; this._actx = null;
    this._padPause = false; this._padWas = false;
    this._holdFire = rmFlag('holdfire') !== '0'; // world rule: off-screen shooters hold their fire; ?holdfire=0 (or setHoldFire(false)) lets them shoot
    this._padBack = false; // pad Back / Select (button 8): restart edge (fall screen or open menu only)
    this._padRes = { move: { x: 0, y: 0 }, aim: { x: 0, y: 0, on: false }, fire: false, ability: [false, false, false, false], pause: false }; // reused every frame (no per-frame allocation)
    this._aimAssist = true; this._reduced = false;
    let hpq = ''; try { hpq = location.search || ''; } catch (e) { hpq = ''; }
    this._shoreFadeOn = !/[?&]shorefade=0(&|$)/.test(hpq); this._shoreFadeToast = false; // ID-01 (?shorefade=0: off)
    this._hitPauseOn = !/[?&]hitpause=0(&|$)/.test(hpq); this._hitPauseAt = -1; this.hitPausedFrames = 0; // ID-14
    // AR (NEXT-SLICES-3 Wave 4): Realm one-thumb access, opt-in per page (enableAccess2(); the town classic arena never calls it, duels never use it).
    this._ax2 = false; this._autoFire = false; this._aimToggle = false; this._shapes = false; this._aimPressMax = 0; this.autoFireN = 0;
    this._afT = null; this._afX = 0; this._afY = 0; this._afVx = 0; this._afVy = 0; // auto-fire target + its smoothed velocity (lead)
    this._txtFont = 'bold 14px system-ui, sans-serif'; this._txtScale = 1;
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
    this._aimCone = this._assistOn() ? MMAssist.aimCone(this._assistPref()) : 14; // ID-06 aim help: 14 (Off, the old cone) / 20 / 26 / 32 degrees
    this._syncAimBtn();
    this._readReduced();
  }

  // Reduce-motion, full read: the stored override ('1' / '0', MMMotion.KEY) wins, else the OS setting. Same rule as MMMotion.reduced,
  // but the MediaQueryList is built once and kept (its .matches is live), so the frame loop allocates nothing (cycle1 L-18).
  _readReduced() {
    try {
      if (typeof MMMotion === 'undefined') { this._reduced = false; return; }
      let v = null; try { v = localStorage.getItem(MMMotion.KEY); } catch (e) { v = null; }
      this._rmOv = v === '1' ? true : (v === '0' ? false : null);
      this._rmAt = performance.now();
      this._reduced = this._rmOv !== null ? this._rmOv : this._rmOs();
    } catch (e) { this._reduced = false; }
  }
  _rmOs() {
    try {
      if (this._rmQ === undefined) this._rmQ = typeof window !== 'undefined' && typeof window.matchMedia === 'function' ? window.matchMedia('(prefers-reduced-motion: reduce)') : null;
      return !!(this._rmQ && this._rmQ.matches);
    } catch (e) { return false; }
  }
  // Per frame: the OS setting is still followed on the very next frame (one property read); the stored override is re-read at most
  // every 50 ms (it used to be a localStorage read and a new matchMedia object on every frame). A clock that does not move
  // (tests that freeze time) reads the store each frame, as before.
  _readReducedFrame() {
    const t = performance.now(); const still = t === this._rmT; this._rmT = t; // still: no time passed since the last frame
    if (still || this._rmAt === undefined || t - this._rmAt >= 50 || t < this._rmAt) { this._readReduced(); return; }
    this._reduced = this._rmOv !== null ? this._rmOv : this._rmOs();
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
    try { if (f.isMuted && f.isMuted()) return; f.play(name); } catch (e) { /* audio must never break the game */ } // the Sound (mute) setting wins
  }

  // Effective screen shake in px (0 under reduced motion).
  shakeAmt() { return typeof MMMotion !== 'undefined' ? MMMotion.shake(this.shake, this._reduced) : (this._reduced ? 0 : this.shake); }

  // Index of the first active enemy whose hit circle contains (x, y), via the spatial hash; -1 if none.
  _boltHitIndex(x, y) {
    const h = this._hash;
    if (!h) { // fallback without the module
      for (let j = 0; j < this.enemies.length; j++) { const e = this.enemies[j]; if (!e.active) continue; const r = this._er(e) + 5; if ((x - e.x) * (x - e.x) + (y - e.y) * (y - e.y) < r * r) return j; }
      return -1;
    }
    if (this._hashN !== this._spawnN) this._buildHash();
    this._hq.x = x; this._hq.y = y; this._hq.best = -1;
    h.query(x, y, 0, this._hitCb);
    return this._hq.best;
  }

  _buildHash() {
    const h = this._hash; h.clear();
    for (let j = 0; j < this.enemies.length; j++) { const e = this.enemies[j]; if (e.active) h.insert(j, e.x, e.y, this._er(e) + 5); }
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
    if (this._padWas) { this._padPrev.fill(false); this._padPause = false; this._padBack = false; this._padBk = false; this._padWas = false; }
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
    this._padBk = dn(b[8]); // Back / Select (restart edge): kept beside the result so it stays the same shape as MMPad.read
    return r;
  }

  // Start (button 9) opens / closes the pause + backpack panel, like B / Esc: one toggle per press.
  _padPauseEdge() {
    const on = !!(this._pad && this._pad.pause);
    if (on && !this._padPause && !this._deathShown) { if (this.panel || this.paused) this.setPaused(false); else this._panel('bp'); }
    this._padPause = on;
    // Universal Restart (CONTROLS.md): pad Back / Select restarts only where R does (the fall screen, or the open menu's confirm).
    const bk = !!(this._pad && this._padBk);
    if (bk && !this._padBack) {
      if (this._deathShown) { const b = this._deathDom && this._deathDom.querySelector('button[data-d="again"]'); if (b) b.click(); }
      else if (this.panel === 'menu' && this.canRestart && this.canRestart()) this._menuConfirm(true);
    }
    this._padBack = bk;
  }

  countActive(name) {
    let n = 0;
    const pool = this[name];
    for (let i = 0; i < pool.length; i++) if (pool[i].active) n++;
    return n;
  }

  // Stats = base + level + equipped items (recomputed when level / equipment changes, read every frame).
  // opts (G8, optional): { noGear: true } = the same stats with nothing equipped (the "Base" column); { eqOverride: { slot: uid | 0 } } = the stats as if that
  // slot held that item (the compare UI; level / class gates are skipped for the overridden slots so locked items compare too). With opts the call is
  // pure: it returns a fresh object and never touches this.stats or the save.
  // P2 (phone perf): the non-pure call is cached behind a dirty flag (markStatsDirty) plus an input signature (_stSig: level, the equipped items
  // and their t/r/a/sig/f, the hero / class / passives, buffs, status mods, world / mode / team), so a call with nothing changed does no work.
  // A hit returns exactly what a recompute would (gear-stats-cache.test.js checks cached == _calcStatsNow over random sequences); a caller that
  // edited this.stats in place gets a fresh copy, like before. Pure calls and duels always recompute.
  _calcStats(opts) {
    const o = opts && typeof opts === 'object' ? opts : null;
    if (o && (o.noGear || o.eqOverride)) return this._calcStatsNow(o); // pure: this.stats and the cache are untouched
    if (!this.save || (this.team && this.team.isPvp)) { this._stDirty = true; return this._calcStatsNow(null); } // a duel sets its own fixed stats: recompute after it
    const A = this._stSigA || (this._stSigA = []), B = this._stSigB || (this._stSigB = []);
    const n = this._stSig(B); let same = !this._stDirty && !!this._stC && n === A.length;
    for (let i = 0; same && i < n; i++) { const x = A[i], y = B[i]; if (x !== y && !(x !== x && y !== y)) same = false; }
    if (same) {
      const c = this._stC, cur = this.stats; let ok = cur === c.obj;
      if (ok) { const ks = c.keys; for (let i = 0; i < ks.length; i++) { const k = ks[i], x = cur[k], y = c.vals[k]; if (x !== y && !(x !== x && y !== y)) { ok = false; break; } } }
      if (!ok) { const st = Object.assign({}, c.vals); Object.defineProperty(st, 'sets', { value: c.sets, enumerable: false }); c.obj = st; this.stats = st; }
      this.statsHits = (this.statsHits || 0) + 1; // test hook
      return this.stats;
    }
    const st = this._calcStatsNow(null);
    this._stSigA = B; this._stSigB = A; B.length = n; this._stDirty = false;
    this._stC = { obj: st, vals: Object.assign({}, st), keys: Object.keys(st), sets: st.sets };
    this.statsRuns = (this.statsRuns || 0) + 1; // test hook
    return st;
  }
  // Equipment, level, buffs or passives changed: the next _calcStats() recomputes (the signature also catches it; this is the explicit flag).
  markStatsDirty() { this._stDirty = true; }
  // Writes every input of the non-pure _calcStats into `b` (no strings built); returns the count.
  _stSig(b) {
    let i = 0; const s = this.save, p = this.player, hp = this.heroProfile, sm = p ? p._stm : null, u = this._hu, eq = s.eq || {}, items = s.items;
    b[i++] = s; b[i++] = s.level; b[i++] = eq; b[i++] = items; b[i++] = items ? items.length : -1;
    for (let k = 0; k < RM_SLOTS.length; k++) {
      const uid = eq[RM_SLOTS[k]]; const it = uid && items ? items.find((x) => x.n === uid) : null;
      b[i++] = uid; b[i++] = it || null; b[i++] = it ? RM_ITEM_BY_ID[it.id] : null;
      if (it) { b[i++] = it.id; b[i++] = it.t; b[i++] = it.r; b[i++] = it.a; b[i++] = it.sig; const f = it.f; b[i++] = f; b[i++] = f && typeof f === 'object' ? f.id : null; b[i++] = f && typeof f === 'object' ? f.v : null; }
    }
    b[i++] = hp; if (hp) { b[i++] = hp.hp; b[i++] = hp.dmg; b[i++] = hp.rate; b[i++] = hp.speed; b[i++] = hp.iframes; }
    b[i++] = u; if (u) { b[i++] = u.cls; b[i++] = u.level; }
    b[i++] = this._unl();
    b[i++] = this.mode; b[i++] = this.world; b[i++] = this.dungeon; b[i++] = this.team;
    const hs = this._heroWorldScale(); b[i++] = hs ? hs.dmg : null; b[i++] = hs ? hs.rate : null;
    b[i++] = this.buffDmg; b[i++] = p; b[i++] = sm; if (sm) { b[i++] = sm.dmg; b[i++] = sm.rate; b[i++] = sm.speed; }
    b[i++] = this.extraGuard;
    b[i++] = typeof MMGear !== 'undefined'; b[i++] = typeof MMGearAffix !== 'undefined'; b[i++] = typeof MMGearSets !== 'undefined'; b[i++] = typeof MMGearForge !== 'undefined';
    b[i++] = typeof MMUnlocks !== 'undefined'; b[i++] = typeof MMStats !== 'undefined'; b[i++] = typeof MMDifficulty !== 'undefined';
    return i;
  }
  // The full computation (what _calcStats did before P2). With opts it is pure; without, it sets this.stats.
  _calcStatsNow(opts) {
    const o = opts && typeof opts === 'object' ? opts : null;
    const pure = !!(o && (o.noGear || o.eqOverride));
    if (this.team && this.team.isPvp) { const ds = { maxHp: RT_DUEL_HP, dmg: 1, rate: RT_DUEL_RATE, speed: RM_PLAYER.speed, shards: 1, xp: 1, iframes: 0.12 }; if (!pure) this.stats = ds; return ds; } // a duel is fought with identical stats: no gear, no level, no tiers / armor / affixes
    const st = { maxHp: RM_PLAYER.hp + RM_HP_PER_LEVEL * (this.save.level - 1), dmg: RM_PLAYER.dmg, rate: RM_PLAYER.fireRate, speed: RM_PLAYER.speed, shards: 1, xp: 1, iframes: RM_PLAYER.iframes };
    const eq = this._eqFor(o); const free = o && o.eqOverride && typeof o.eqOverride === 'object' ? o.eqOverride : null;
    const gr = { guard: 0, famRes: 0, allRes: 0, resIds: null, status: 0, speed: 0, crit: 0, leech: 0, regen: 0, vital: 0, swift: 0, reach: 0, pierce: 0, blast: 0, venom: 0 }; // tiered gear extras (all 0 without such items)
    const eqItems = { weapon: null, armor: null }; // GB / GW: the equipped, tiered, un-gated weapon + armor the set bonuses read
    RM_SLOTS.forEach((slot) => {
      const uid = eq[slot];
      const it = uid && this.save.items.find((x) => x.n === uid);
      if (!it) return;
      const def = RM_ITEM_BY_ID[it.id];
      if (!def || def.slot !== slot) return;
      const gated = RM_GEAR_ON && it.t && !(free && Object.prototype.hasOwnProperty.call(free, slot)) ? !this._gearOk(it) : false;
      if (def.arm) { if (RM_GEAR_ON && !gated) { this._armorInto(st, gr, it); if (it.t) eqItems.armor = it; } return; } // armor: HP / guard / speed / resists (MMGear.armorStats)
      const tb = RM_GEAR_ON && it.t && !gated && def.stat === 'dmg' ? MMGear.weaponBonus(def.amount, it.t, it.r) : null; // tier bonus: amount/0.5 x WD[t] x Q[r]
      const v = tb !== null ? tb : def.amount * RM_RARITIES[it.r].mult; // T0 (and a gated / ?gear=0 tiered item): the classic amount x rarity
      if (tb !== null) { this._affixInto(gr, it, 'weapon'); eqItems.weapon = it; }
      if (def.stat === 'hp') st.maxHp += Math.round(v);
      else if (def.stat === 'dmg') st.dmg += v;
      else if (def.stat === 'rate') st.rate += v;
      else if (def.stat === 'speed') st.speed += v;
      else if (def.stat === 'shards') st.shards += v;
      else if (def.stat === 'xp') st.xp += v;
      else if (def.stat === 'iframes') st.iframes += v;
    });
    const sets = this._setsOf(eqItems); // GB set bonuses (Banded, Dread pair): [] without MMGearSets, under ?gear=0 and in duels (returned above)
    if (sets.length) {
      let sx = null; try { sx = MMGearSets.extras(sets); } catch (e) { sx = null; }
      const n = (k) => (sx && typeof sx[k] === 'number' && Number.isFinite(sx[k]) ? sx[k] : 0);
      gr.vital += n('vital'); gr.guard += n('ward'); gr.crit += n('keen'); gr.blast += n('blast'); gr.status += n('venom'); gr.venom += n('venom');
      gr.swift += n('swift'); gr.reach += n('reach'); gr.leech += n('leech'); gr.pierce += n('pierce');
    }
    if (gr.speed) st.speed += gr.speed; // `fleet` px/s, like armor speed: before the class multipliers
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
    // G8 gear extras: affix HP / rate after the class + unlock multipliers; new keys are always present (0 = nothing), so readers never branch on undefined.
    if (gr.vital > 0) st.maxHp = Math.max(1, Math.round(st.maxHp * (1 + gr.vital)));
    if (gr.swift > 0) st.rate *= 1 + gr.swift;
    st.crit = Math.min(0.5, gr.crit); st.status = gr.status; st.leech = gr.leech; st.regen = gr.regen; st.reach = gr.reach; st.pierce = Math.min(3, gr.pierce); st.venom = gr.venom; // venom: also its fallback bleed chance (G11)
    st.splashR = gr.blast > 0 ? 24 + gr.blast : 0; st.splashFrac = gr.blast > 0 ? 0.3 : 0; st.splashMax = gr.blast > 0 ? 3 : 0; // `blast` grants {r 24, frac .30, max 3} (+ its px); used by the splash slice (G11)
    st.resFam = gr.famRes; st.resAll = gr.allRes; st.resIds = gr.resIds; st.resist = Math.min(0.4, gr.famRes + gr.allRes); // armor family resist (statuses in resIds) + the `resist` affix (every status); _resistFor caps at 40%
    st.guard = this._calcGuard(gr.guard);
    Object.defineProperty(st, 'sets', { value: sets, enumerable: false }); // the active set list (non-enumerable: the stats shape stays as it was)
    if (!pure) this.stats = st;
    return st;
  }
  // The active gear sets for { weapon, armor } (MMGearSets.active), [] when gear is off, the module is missing or either piece is absent.
  _setsOf(eqItems) {
    if (!RM_GEAR_ON || !eqItems || !eqItems.weapon || !eqItems.armor || typeof MMGearSets === 'undefined' || !MMGearSets || typeof MMGearSets.active !== 'function') return [];
    if (!RM_FORGE_ON && eqItems.weapon.sig) { const w = Object.assign({}, eqItems.weapon); delete w.sig; eqItems = { weapon: w, armor: eqItems.armor }; } // F3 gate: the sig-only Dread pair is off with the GW gate (Banded stays)
    const key = ['weapon', 'armor'].map((k) => { const x = eqItems[k]; return `${x.id}:${x.t}:${x.r}:${x.a || 0}:${x.sig || ''}`; }).join('|');
    const c = this._setC || (this._setC = new Map());
    let v = c.get(key);
    if (!v) { try { v = MMGearSets.active({ weapon: eqItems.weapon, armor: eqItems.armor }); } catch (e) { v = []; } if (!Array.isArray(v)) v = []; if (c.size > 32) c.clear(); c.set(key, v); }
    return v;
  }
  // GW: the canonical value of an item's forged affix `f` (MMGearForge.reforgeOptions; the stored v is never trusted), or null when it is not legal
  // there (unknown id, below T7, an affix the item already rolled, or its signature). Without the forge module: the stored value clamped to the tier range.
  _forgedOf(it) {
    if (!it || !it.f || !(it.t >= 7) || typeof it.f.id !== 'string') return null;
    const key = `${it.id}:${it.t}:${it.r}:${it.a || 0}:${it.sig || ''}:${it.f.id}`;
    const c = this._forC || (this._forC = new Map());
    if (c.has(key)) return c.get(key);
    let out = null;
    try {
      if (it.sig && it.f.id === it.sig) out = null;
      else if (typeof MMGearForge !== 'undefined' && MMGearForge && typeof MMGearForge.reforgeOptions === 'function') {
        const fv = { n: 1, id: it.id, r: it.r, t: it.t, a: it.a }; if (it.sig) fv.sig = it.sig; // review F5: the signature changes which affixes the item rolled
        const opts = MMGearForge.reforgeOptions(fv);
        const o = opts ? opts.find((x) => x.id === it.f.id) : null;
        out = o ? { id: o.id, v: o.v } : null;
      } else if (typeof MMGearAffix !== 'undefined' && MMGearAffix) {
        const rg = MMGearAffix.rangeOf(it.f.id, it.t); const v = Number(it.f.v);
        const rolled = it.a ? MMGearAffix.roll(it.id, it.id.indexOf('arm_') === 0 ? 'armor' : 'weapon', it.t, it.r, it.a, it.sig).map((e) => e.id) : [];
        out = rg && Number.isFinite(v) && v > 0 && rolled.indexOf(it.f.id) < 0 ? { id: it.f.id, v: Math.min(rg[1], v) } : null;
      }
      if (out && it.id.indexOf('arm_') !== 0 && typeof MMGearAffix !== 'undefined' && MMGearAffix && typeof MMGearAffix.value === 'function' && typeof MMGearAffix.cap === 'function') {
        // review F6: the forged affix sits inside the weapon power cap (MMGearAffix.cap) like every rolled one: trim it on its unit grid until the product fits
        const rolled = it.a ? MMGearAffix.roll(it.id, 'weapon', it.t, it.r, it.a, it.sig) : [];
        const cp = MMGearAffix.cap(it.t) + 1e-9; const d = MMGearAffix.get(out.id);
        const step = d && d.unit === 'int' ? 1 : d && d.unit === 'pct' ? 0.001 : 0.1;
        let v = out.v; let guard = 0;
        while (v > 0 && MMGearAffix.value(rolled.concat([{ id: out.id, v }])) > cp && guard++ < 2000) v = Math.round((v - step) * 1000) / 1000;
        out = v > 0 ? { id: out.id, v } : null;
      }
    } catch (e) { out = null; }
    if (c.size > 64) c.clear();
    c.set(key, out);
    return out;
  }

  // The eq map _calcStats reads: the save's, nothing (noGear) or the save's with eqOverride slots replaced (only uids whose item fits that slot).
  _eqFor(o) {
    if (o && o.noGear) return {};
    const eq = this.save.eq;
    if (!o || !o.eqOverride || typeof o.eqOverride !== 'object') return eq;
    const out = Object.assign({}, eq);
    RM_SLOTS.forEach((slot) => {
      if (!Object.prototype.hasOwnProperty.call(o.eqOverride, slot)) return;
      const uid = o.eqOverride[slot]; const it = Number.isInteger(uid) && uid > 0 ? this.save.items.find((x) => x.n === uid) : null;
      if (it && RM_ITEM_BY_ID[it.id] && RM_ITEM_BY_ID[it.id].slot === slot) out[slot] = uid; else delete out[slot];
    });
    return out;
  }
  // The level the tier equip gate reads (owner decision): the active hero's level when a hero is set, else the account level. Heroes do not level
  // up yet (most are level 1), so a hero never gates below the account level: max(hero level, account level). Revisit when hero levelling exists.
  heroGateLevel() {
    const acct = this.save ? this.save.level : 1;
    return this._hu && this._hu.level ? Math.max(this._hu.level, acct) : acct;
  }
  // Can this tiered item be worn now? Armor: the hero's armor family (MMGear.CLASS_ARMOR) + the tier level gate; a tiered weapon: the level gate
  // (its style family is checked by _wpnCanEquip). true for T0 items and whenever gear is off (?gear=0 / no MMGear: tiers are ignored).
  _gearOk(it) { return this._gearWhy(it) === ''; }
  _gearWhy(it) {
    if (!RM_GEAR_ON || !it) return '';
    const def = RM_ITEM_BY_ID[it.id];
    if (def && def.arm) { let r = null; try { r = MMGear.canEquip(it.id, it.t, this.heroClass(), this.heroGateLevel()); } catch (e) { r = null; } return r && r.ok ? '' : (r && r.reason) || 'class'; }
    if (it.t && MMGear.gate(it.t) > this.heroGateLevel()) return 'level';
    return '';
  }
  _armorInto(st, gr, it) {
    let s = null; try { s = MMGear.armorStats(it.id, it.t, it.r); } catch (e) { s = null; }
    if (!s) return;
    st.maxHp += s.hp; st.speed += s.speed; gr.guard += s.guard; gr.status += s.statusChance;
    if (s.res > 0) { gr.resIds = MMGear.FAMILIES[s.family].resists; gr.famRes = s.res; }
    this._affixInto(gr, it, 'armor');
  }
  // T7+ affixes (MMGearAffix.roll: seeded by id + t + a, power cap applied there) summed into the gear extras. Cached per item identity.
  // GW: `sig` (T12 weapon boss signature) is passed through, and the one forged affix `f` is added on top (never replacing a rolled one).
  _affixInto(gr, it, slot) {
    if (!(it.t >= 7) || typeof MMGearAffix === 'undefined') return;
    const fg = this._forgedOf(it);
    if (!it.a && !fg) return;
    const key = `${it.id}:${it.t}:${it.r}:${it.a || 0}:${it.sig || ''}:${fg ? fg.id + '=' + fg.v : ''}`; const c = this._affC || (this._affC = new Map());
    let sm = c.get(key);
    if (!sm) {
      try { const list = it.a ? MMGearAffix.roll(it.id, slot, it.t, it.r, it.a, it.sig).slice() : []; if (fg) list.push(fg); sm = MMGearAffix.sum(list); } catch (e) { sm = {}; }
      if (c.size > 64) c.clear(); c.set(key, sm);
    }
    const v = (k) => (typeof sm[k] === 'number' && Number.isFinite(sm[k]) ? sm[k] : 0);
    gr.crit += v('keen'); gr.blast += v('blast'); gr.status += v('venom'); gr.venom += v('venom'); gr.swift += v('swift'); gr.reach += v('reach'); gr.leech += v('leech'); gr.pierce += v('pierce');
    gr.vital += v('vital'); gr.guard += v('ward'); gr.regen += v('mend'); gr.allRes += v('resist'); gr.speed += v('fleet');
  }

  _heroWorldScale() {
    if (this.mode !== 'world' || !this.world || this.dungeon || this.team || typeof MMDifficulty === 'undefined' || typeof MMDifficulty.heroScale !== 'function') return null;
    let off = false; try { off = MMDifficulty.isOff(typeof location !== 'undefined' ? location.search : ''); } catch (e) { off = false; }
    return off ? null : MMDifficulty.heroScale();
  }

  // Guard comes from the equipped items via MMStats (0 for every legacy item today); extraGuard is a test/future hook.
  // G8: `gearGuard` = armor GRD (MMGear.armorStats) + the `ward` affix, summed by _calcStats (0 without armor / with ?gear=0). The 25% floor and
  // armorBroken (guard 0) still apply in _guarded.
  _calcGuard(gearGuard) {
    let g = Number(this.extraGuard) || 0;
    if (typeof MMStats !== 'undefined') g += MMStats.fromLegacy(this.save).GRD;
    if (Number.isFinite(gearGuard) && gearGuard > 0) g += gearGuard;
    return g;
  }
  // The share of a hostile status the player shrugs off (G8): family resist for its listed statuses + the `resist` affix, capped at 40%. 0 in duels.
  _resistFor(id) {
    const st = this.stats;
    if (!RM_GEAR_ON || !st || (this.team && this.team.isPvp)) return 0;
    const fam = st.resIds && st.resIds.indexOf(id) >= 0 ? st.resFam || 0 : 0;
    return Math.max(0, Math.min(0.4, fam + (st.resAll || 0)));
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
    const before = t.status && t.status.fx ? t.status.fx[id] : null; const wu = before ? before.until : NaN, ws = before ? before.stacks : NaN, wp = before ? before.pot : NaN; // P2: compared as numbers (no string per hit)
    let sec = o.sec;
    if (t === this.player) { // G8 player resist (armor family + `resist` affix): a hostile status lasts x (1 - resist); never in duels (_stOn), 0 without such gear
      const rs = this._resistFor(id), d = MMStatus.DEFS && Object.prototype.hasOwnProperty.call(MMStatus.DEFS, id) ? MMStatus.DEFS[id] : null;
      if (rs > 0 && d && d.sign < 0) { const base = Number.isFinite(Number(sec)) && sec !== null && sec !== '' ? Number(sec) : d.sec; sec = base * (1 - rs); this.lastResist = { id, rs, sec }; }
    }
    const ao = this._apO || (this._apO = { sec: 0, stacks: 0, pot: 0, src: '', kind: '', fromBolt: false, picnic: false, safe: false }); // P2: reused (MMStatus.apply only reads it)
    ao.sec = sec; ao.stacks = o.stacks; ao.pot = o.pot; ao.src = typeof o.src === 'string' ? o.src : ''; ao.kind = kind; ao.fromBolt = !!o.fromBolt; ao.picnic = !!o.picnic; ao.safe = !!o.safe;
    const next = MMStatus.apply(t.status, id, ao, now);
    const f = Object.prototype.hasOwnProperty.call(next.fx, id) ? next.fx[id] : null;
    const ok = !!f && f.until > now && !(before && rmSame(f.until, wu) && rmSame(f.stacks, ws) && rmSame(f.pot, wp));
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

  // G8 leech + regen (host / solo only; never in duels, never on a co-op guest, never while down or dead). Both are 0 without T7+ affixes.
  //  leech: a share of the damage your own bolts deal (_leechAdd), paid out as whole HP from a budget that refills at 3 HP/s (cap 3 HP/s).
  //  regen (`mend`): HP/s once 3 s of game time have passed since you were last hit. "sick" (noHeal) blocks both, like every heal.
  _gearTick(dt) {
    const st = this.stats, p = this.player;
    if (!st || !(st.leech > 0 || st.regen > 0) || this.state === 'dead' || this.down || (this.team && (this.team.isPvp || this.role === 'guest'))) { this._leechAcc = 0; this._regenAcc = 0; return; }
    if (st.leech > 0) {
      this._leechCap = Math.min(3, (this._leechCap || 0) + 3 * dt);
      const n = Math.floor(Math.min(this._leechAcc || 0, this._leechCap));
      if (n >= 1) { this._leechAcc -= n; this._leechCap -= n; this.leechHealed = (this.leechHealed || 0) + this._gearHeal(n); }
    }
    if (st.regen > 0 && this._stT - (Number.isFinite(this._gHurtT) ? this._gHurtT : -1e9) >= 3 && p.hp < st.maxHp) {
      this._regenAcc = (this._regenAcc || 0) + st.regen * dt;
      if (this._regenAcc >= 1) { const n = Math.floor(this._regenAcc); this._regenAcc -= n; this.regenHealed = (this.regenHealed || 0) + this._gearHeal(n); }
    } else this._regenAcc = 0;
  }
  _leechAdd(dmg) {
    const st = this.stats;
    if (!st || !(st.leech > 0) || !(dmg > 0) || (this.team && (this.team.isPvp || this.role === 'guest'))) return;
    this._leechAcc = Math.min(3, (this._leechAcc || 0) + dmg * st.leech); // at most 3 HP banked: no burst heal after a big hit
  }
  _gearHeal(n) {
    const p = this.player; if (this.down || n <= 0 || p.hp >= this.stats.maxHp || (p._stm && p._stm.noHeal)) { this._leechAcc = 0; return 0; }
    const got = Math.min(Math.round(n), this.stats.maxHp - p.hp); if (got <= 0) return 0;
    p.hp += got; this._floatText(p.x, p.y - 40, `+${got}`, '#7ee787'); this._syncHud(); return got;
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
    const k = this._cssK || 1; const a = this._stAnchor || (this._stAnchor = { x: 8, y: 64, px: RM_ST_ICON_PX, k: 1, cl: 0, ct: 0, bL: 1e9, bB: -1 });
    a.k = k;
    try {
      const cr = this.canvas.getBoundingClientRect(); a.cl = cr.left; a.ct = cr.top;
      const vis = (el) => (el && !el.classList.contains('hidden') && el.getClientRects().length ? el.getBoundingClientRect() : null);
      const xp = vis(document.getElementById('realm-xp')) || vis(document.getElementById('realm-focus')) || vis(document.getElementById('realm-hp'));
      const left = xp ? xp.left : cr.left + 8; let top = (xp ? xp.bottom : cr.top + 56) + 4;
      const rowR = left + 6 * (a.px + 3);
      const boss = vis(document.getElementById('realm-boss'));
      if (boss && boss.left < rowR && boss.right > left && boss.bottom > top - 2 && boss.top < top + a.px) top = boss.bottom + 4;
      const zoneEl = vis(document.getElementById('rw-zone')); // the phone's one-line zone/raid text sits under the XP bar: the icon row steps below it, like it does for the boss bar
      if (zoneEl && zoneEl.left < rowR && zoneEl.right > left && zoneEl.bottom > top - 2 && zoneEl.top < top + a.px) top = zoneEl.bottom + 4;
      a.x = Math.max(0, (left - cr.left) / k); a.y = Math.max(0, (top - cr.top) / k);
      let bl = 1e9; let bb = -1;
      ['realm-bp-btn', 'realm-board-btn', 'realm-menu-btn', 'realm-leave-btn'].forEach((id) => { const r = vis(document.getElementById(id)); if (r && r.width > 0 && r.left > cr.left + cr.width * 0.4) { bl = Math.min(bl, r.left); bb = Math.max(bb, r.bottom); } });
      a.bL = bl < 1e9 ? (bl - cr.left) / k - 4 : 1e9; a.bB = bb >= 0 ? (bb - cr.top) / k + 4 : -1;
    } catch (e) { a.x = 8; a.y = 64; a.bL = 1e9; a.bB = -1; }
    return a;
  }

  // HUD: up to 6 player status icons (RM_ST_ICON_PX = 24 css px, PLAYTEST-REVIEW-2 #11, with the stack digit from MMFxDraw.drawIcon), negatives first; each is a cached MMFxDraw.drawIcon canvas (the clock pie in 12 steps).
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
  // Enemy status pips (S14): at most RM_PIP_MAX cached MMFxDraw.drawPip discs over the enemy, extra statuses collapse into "+n" (text, not
  // colour only). The list is re-read at most 4x a second per enemy into fields preallocated on the pooled enemy (no per-frame arrays).
  _pipsOf(e) {
    if (!e.status || typeof MMStatus === 'undefined') { e._pipN = 0; e._pipMore = 0; return e; }
    if (!(this._stT - e._pipAt < 0.25) || e._pipAt > this._stT) { // undefined / NaN (an enemy made outside spawnEnemy) refreshes too
      e._pipAt = this._stT;
      const list = MMStatus.iconList(e.status, this._stT * 1000, 6);
      const ids = e._pipIds || (e._pipIds = ['', '', '']);
      e._pipN = Math.min(RM_PIP_MAX, list.length); e._pipMore = Math.max(0, list.length - RM_PIP_MAX);
      for (let i = 0; i < e._pipN; i++) ids[i] = list[i].id;
    }
    return e;
  }
  _drawEnemyPips(g, e, y) {
    if (typeof MMFxDraw === 'undefined' || !this._stOn()) return;
    this._pipsOf(e); const n = e._pipN; if (!n) return;
    if (!this._pipCache) this._pipCache = MMFxDraw.makeCache(MMFxDraw.defaultCreate, 32);
    const step = RM_PIP_PX + 2; const more = e._pipMore > 0;
    const w = n * step - 2 + (more ? 14 : 0); let x = e.x - w / 2;
    for (let i = 0; i < n; i++) {
      const id = e._pipIds[i];
      const cv = this._pipCache.get(id, RM_PIP_PX + 2, RM_PIP_PX + 2, (c, W) => MMFxDraw.drawPip(c, id, W / 2, W / 2, RM_PIP_PX));
      if (cv) g.drawImage(cv, x - 1, y - 1);
      x += step;
    }
    if (more) {
      g.font = 'bold 9px system-ui, sans-serif'; g.textAlign = 'left';
      const t = `+${e._pipMore}`; g.fillStyle = '#000'; g.fillText(t, x + 1, y + RM_PIP_PX + 1); g.fillStyle = '#fff'; g.fillText(t, x, y + RM_PIP_PX);
    }
  }
  // Test / debug hook (S14): the pips an enemy shows now: {ids, more}.
  enemyPips(e) { if (!e) return null; e._pipAt = -9; this._pipsOf(e); return { ids: (e._pipIds || []).slice(0, e._pipN), more: e._pipMore }; }

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
    this.sprites.eBullet = this._ebHues().map(([hue, tint]) => mk(16, 16, (g) => { // enemy bullet: dark rim, saturated body, a small light centre
      const R = RM_BOLT_R.enemy;
      g.fillStyle = '#1a0812'; g.beginPath(); g.arc(8, 8, R, 0, Math.PI * 2); g.fill();
      g.fillStyle = hue; g.beginPath(); g.arc(8, 8, R - 1.6, 0, Math.PI * 2); g.fill();
      if (this._hitFxOff) { g.fillStyle = tint; g.beginPath(); g.arc(8, 8, 1.6, 0, Math.PI * 2); g.fill(); return; }
      g.fillStyle = tint; g.beginPath(); g.arc(8, 8, RM_EB_CORE_R + 0.2, 0, Math.PI * 2); g.fill(); // cyc6: a tint ring round a bright white core
      g.fillStyle = '#ffffff'; g.beginPath(); g.arc(8, 8, RM_EB_CORE_R, 0, Math.PI * 2); g.fill();
    }));
    this.sprites.ebCore = mk(8, 8, (g) => { g.fillStyle = '#ffffff'; g.beginPath(); g.arc(4, 4, RM_EB_CORE_R, 0, Math.PI * 2); g.fill(); }); // cyc6: the bright core laid over slow enemy bolt art
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
      if (id === 'ebolt_orb_red' && !this._hitFxOff) rmHueRotate(c, S, RM_EB_AIM_ROT); // cyc7: the aimed orb toward orange-red (once per cached frame)
      arr[i] = cv; return cv;
    } catch (e) { arr[i] = 0; return null; }
  }
  _boltFrame() { return this._reduced ? 0 : Math.floor(this.clock * 12) & 3; }
  _ebHues() { return this._hitFxOff ? RM_EB_HUES : [RM_EB_AIM_WARM].concat(RM_EB_HUES.slice(1)); } // cyc7: aimed (kind 0) orange-red
  _drawBoltArt(g, b) { // a class bolt (not weapon style) from art; returns true when drawn
    const id = this._boltPlayerId(); if (!id) return false;
    const rot = (Math.round(Math.atan2(b.vy, b.vx) / (Math.PI / 8)) + 16) & 15;
    const cv = this._boltCv(id, rot, this._boltFrame(), RM_BOLT_D.player); if (!cv) return false;
    g.drawImage(cv, b.x - cv.width / 2, b.y - cv.height / 2); this._baDraws++; return true;
  }
  _drawEBTrail(g, b, spr) { // cyc6: two shrinking, fading copies 6 and 11 px behind a slow enemy bullet (no allocation)
    const v2 = b.vx * b.vx + b.vy * b.vy; if (v2 >= RM_EB_SLOW * RM_EB_SLOW || v2 < 1) return false;
    const inv = 1 / Math.sqrt(v2), ux = b.vx * inv, uy = b.vy * inv; this._ebTrails++;
    g.globalAlpha = 0.55; g.drawImage(spr, b.x - ux * 6 - 5.5, b.y - uy * 6 - 5.5, 11, 11);
    g.globalAlpha = 0.3; g.drawImage(spr, b.x - ux * 11 - 4, b.y - uy * 11 - 4, 8, 8);
    g.globalAlpha = 1; return true;
  }
  _drawHitFlash(g) { // cyc6: warm elliptical edge vignette, baked once in unit space and stretched to the view (no per-frame allocation)
    const VW = this._dv ? this._dv.vw : this.W;
    if (this._hitFxOff) {
      if (!this._vignette) { const gr = g.createRadialGradient(VW / 2, this.H / 2, Math.min(VW, this.H) * 0.3, VW / 2, this.H / 2, Math.max(VW, this.H) * 0.7); gr.addColorStop(0, 'rgba(255,40,80,0)'); gr.addColorStop(1, 'rgba(255,40,80,0.55)'); this._vignette = gr; }
      g.globalAlpha = this._reduced ? 0.35 : this.flash; g.fillStyle = this._vignette; g.fillRect(0, 0, this.W, this.H); g.globalAlpha = 1; return;
    }
    if (!this._hitVig) { // unit ellipse: clear inside r 0.66, the palette red at RM_HIT_EDGE_A on the edge midpoints (r 1), a little stronger in the corners
      const gr = g.createRadialGradient(0, 0, 0.66, 0, 0, 1.42);
      gr.addColorStop(0, 'rgba(' + RM_HIT_RGB + ',0)'); gr.addColorStop((1 - 0.66) / (1.42 - 0.66), 'rgba(' + RM_HIT_RGB + ',' + RM_HIT_EDGE_A + ')'); gr.addColorStop(1, 'rgba(' + RM_HIT_RGB + ',0.55)');
      this._hitVig = gr;
    }
    g.save(); g.translate(VW / 2, this.H / 2); g.scale(VW / 2, this.H / 2);
    g.globalAlpha = this._reduced ? 0.8 : Math.min(1, this.flash); g.fillStyle = this._hitVig; g.fillRect(-1, -1, (2 * this.W) / VW, 2);
    g.restore(); g.globalAlpha = 1;
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

  // Additive hook: one-shot effect art (MMArt.loadFx FxSet, batch b18). null / ?fxart=0 = no effect sprites. Missing ids are skipped silently.
  // Sprites come from a fixed pool of RM_FX_MAX slots (the oldest is reused when full) and are blitted straight from the strip: no per-effect canvas.
  setFxArt(set) {
    let off = false;
    try { off = typeof location !== 'undefined' && /[?&]fxart=0(&|$)/.test(location.search || ''); } catch (e) { off = false; }
    const ok = !off && set && typeof set.anim === 'function' && typeof set.has === 'function';
    this._fx = ok ? set : null;
    if (ok && !this._fxPool) this._fxPool = Array.from({ length: RM_FX_MAX }, () => ({ active: false, id: '', x: 0, y: 0, t: 0, dur: 0.5, w: 64, h: 64, rot: 0, follow: false, oy: 0 }));
    if (!ok && this._fxPool) this._fxPool.forEach((q) => { q.active = false; });
    return ok;
  }
  // Additive hook: ability bar icons (b20 ability_dash / nova / shield / overdrive and ability_<class>_sig). `root` is the b20 abilities folder URL
  // ('' / null / ?uiicons=0 = emoji only). The emoji span and the Q/E/R/F letter stay in the button; a failed image is removed and never retried.
  setAbilityIcons(root) {
    let off = false;
    try { off = typeof location !== 'undefined' && /[?&]uiicons=0(&|$)/.test(location.search || ''); } catch (e) { off = false; }
    this._abIconRoot = !off && typeof root === 'string' && /^[A-Za-z0-9_.\/:-]+\/$/.test(root) ? root : null;
    this._syncAbilities();
    return !!this._abIconRoot;
  }
  _abIconId(i) {
    if (i === 3 && this._sigOn()) { const c = (this.heroClass() || this._boltCls || '').toLowerCase(); return /^[a-z]+$/.test(c) ? 'ability_' + c + '_sig' : null; }
    return ['ability_dash', 'ability_nova', 'ability_shield', 'ability_overdrive'][i] || null;
  }
  _syncAbilityIcon(el, i) {
    const id = this._abIconRoot ? this._abIconId(i) : null;
    let img = el.querySelector(':scope > img.realm-ab-img');
    const ico = el.querySelector('.ico');
    if (!id || (el.dataset.abBad || '').split(',').indexOf(id) >= 0) { if (img) img.remove(); if (ico) ico.style.opacity = ''; delete el.dataset.abImg; return; }
    if (img && img.dataset.id === id) return;
    if (img) img.remove();
    img = document.createElement('img'); img.className = 'realm-ab-img mm-ico'; // mm-ico: our own UI icon (tests tell it from an injected <img>)
    img.alt = ''; img.draggable = false; img.dataset.id = id; img.setAttribute('aria-hidden', 'true');
    img.style.cssText = 'position:absolute;left:50%;top:50%;width:70%;height:70%;transform:translate(-50%,-50%);object-fit:contain;image-rendering:pixelated;pointer-events:none';
    img.addEventListener('load', () => { el.dataset.abImg = id; if (ico) ico.style.opacity = '0'; });
    img.addEventListener('error', () => { el.dataset.abBad = (el.dataset.abBad ? el.dataset.abBad + ',' : '') + id; img.remove(); if (ico) ico.style.opacity = ''; delete el.dataset.abImg; });
    img.src = this._abIconRoot + id + '.png';
    el.insertBefore(img, el.firstChild);
  }
  fxDraws() { return this._fxDraws; }
  fxLive() { const P = this._fxPool; if (!P) return 0; let n = 0; for (let i = 0; i < P.length; i++) if (P[i].active) n++; return n; } // P2: counted, no array
  // Plays effect `id` once at (x, y). opt: { w, h (draw size), rot (radians), follow (track the hero), oy (offset), dur (seconds) }.
  fxPlay(id, x, y, opt) {
    const A = this._fx, pool = this._fxPool; if (!A || !pool) return false;
    const an = A.anim(id); if (!an) return false;
    const o = opt || {};
    let q = null, old = pool[0];
    for (let i = 0; i < pool.length; i++) { const c = pool[i]; if (!c.active) { q = c; break; } if (c.t / c.dur > old.t / old.dur) old = c; }
    if (!q) q = old;
    q.active = true; q.id = id; q.x = x; q.y = y; q.t = 0; q.dur = o.dur > 0 ? o.dur : an.frames / an.fps;
    q.w = o.w || an.fw; q.h = o.h || o.w || an.fh; q.rot = o.rot || 0; q.follow = !!o.follow; q.oy = o.oy || 0;
    return true;
  }
  fxHeal() { const p = this.player; return this.fxPlay('fx_heal_pulse', p.x, p.y, { follow: true, w: 80, oy: -4 }); }
  _fxUpdate(dt) { const pool = this._fxPool; if (!pool) return; for (let i = 0; i < pool.length; i++) { const q = pool[i]; if (q.active) { q.t += dt; if (q.t >= q.dur) q.active = false; } } }
  _fxDraw(g) {
    const pool = this._fxPool, A = this._fx; if (!pool || !A) return;
    const red = this._reduced, p = this.player;
    for (let i = 0; i < pool.length; i++) {
      const q = pool[i]; if (!q.active) continue;
      const an = A.anim(q.id); if (!an) { q.active = false; continue; }
      const f = red ? Math.min(an.frames - 1, 1) : Math.min(an.frames - 1, Math.floor(q.t * an.fps)); // reduce-motion: one frame, fading out
      const x = q.follow ? p.x : q.x, y = (q.follow ? p.y : q.y) + q.oy;
      if (red) g.globalAlpha = Math.max(0, 1 - q.t / q.dur);
      if (q.rot) { g.save(); g.translate(x, y); g.rotate(q.rot); g.drawImage(an.img, f * an.fw, 0, an.fw, an.fh, -q.w / 2, -q.h / 2, q.w, q.h); g.restore(); }
      else g.drawImage(an.img, f * an.fw, 0, an.fw, an.fh, x - q.w / 2, y - q.h / 2, q.w, q.h);
      if (red) g.globalAlpha = 1;
      this._fxDraws++;
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
    if (this.save) { this.markStatsDirty(); this._calcStats(); if (this.player && this.player.hp > this.stats.maxHp) this.player.hp = this.stats.maxHp; if (this.active) this._syncHud(); }
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
    const wu = this.save && this._heroSrc && !(this.team && this.team.isPvp) ? this.save.eq.weapon : 0; // switching to a hero of another family takes a styled weapon off (it stays in the backpack)
    const wi = wu ? this.save.items.find((x) => x.n === wu) : null;
    if (wi && RM_ITEM_BY_ID[wi.id] && RM_ITEM_BY_ID[wi.id].wpn && !this._wpnCanEquip(RM_ITEM_BY_ID[wi.id])) delete this.save.eq.weapon;
    if (RM_GEAR_ON && this.save && !(this.team && this.team.isPvp)) RM_SLOTS.forEach((sl) => { const gi = this.save.eq[sl] ? this.save.items.find((x) => x.n === this.save.eq[sl]) : null; if (gi && !this._gearOk(gi)) delete this.save.eq[sl]; }); // G7: armor of another family / a tier above the gate comes off (it stays in the backpack)
    if (this.save) { this.markStatsDirty(); this._calcStats(); if (this.player && this.player.hp > this.stats.maxHp) this.player.hp = this.stats.maxHp; if (this.active) this._syncHud(); }
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
      const wc = Math.min(0.5, w.crit + (this.stats.crit || 0)); // G8: + the `keen` affix crit (0 without it: the rng sequence is unchanged)
      const d = wc > 0 && this.rng() < wc ? base * 2 : base;
      const ph = w.wave.alt && (k & 1) ? 1 : 0;
      const b = this.firePlayerBulletFrom(p.x, p.y, ang, d, 0, rmWpnWire(w, ph, lobD));
      if (!b) continue;
      this._styleBolt(b, this._wpnReach(w), ang, ph, lobD); this._gearBolt(b); if (d !== base) b.cr = 1; live++;
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
        if (c) { this._styleBolt(c, w, a, 0, 0); c.ch = nx.chainLeft; c.pr = 0; c.hn = 1; c.h0 = idx; c.sq = 1; } // chain hops never splash (G11)
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
      const rr = r + this._er(e);
      if ((e.x - x) * (e.x - x) + (e.y - y) * (e.y - y) <= rr * rr) { if (b.st > 0) this._wpnStatus(b, e); this._hitEnemy(e, b.dmg || this.stats.dmg, b.cr === 1); }
    }
  }
  // A weapon bolt's `st` (RM_WPN_ST index + 1) rolls its onHit chance and applies that status to the enemy it hit.
  // scale (G11, optional): a splashed enemy rolls at chance x its splash share.
  _wpnStatus(b, e, scale) {
    const oh = b.ws && b.ws.onHit; const id = RM_WPN_ST[b.st - 1];
    if (!id || !oh || !(oh.chance > 0) || !e.active) return false;
    const ch = Math.min(1, oh.chance + (this.stats.status > 0 ? this.stats.status : 0)) * (scale > 0 && scale < 1 ? scale : 1); // G8: + robe armor status chance + the `venom` affix (0 without them)
    if (this.rng() >= ch) return false;
    const so = this._wsO || (this._wsO = { sec: undefined, src: 'wpn' }); so.sec = oh.sec > 0 ? oh.sec : undefined; // P2: one reused opts object
    return this.applyStatus(e, id, so);
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
    try { url = this._itemArt ? this._itemArt.iconUrl((def.wpn || def.arm) && def.art ? def.art : def.id) : null; } catch (e) { url = null; }
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
      try { const d = RM_ITEM_BY_ID[id]; url = this._itemArt.iconUrl(d && (d.wpn || d.arm) && d.art ? d.art : id); } catch (err) { url = null; }
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
    q.active = true; q.name = name; q.dir = dir; q.flip = !!e._flip; q.x = e.x; q.y = e.y + this._er(e) * 0.9; q.k = 2.8 * this._er(e) / this._enemyVis; q.t0 = this.clock;
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
        if (t > len && this._dissolveOn()) { this._dissolveGhost(g, a, len, q, (t - len) / 0.3); continue; }
        const ga = g.globalAlpha; if (t > len) g.globalAlpha = ga * (1 - (t - len) / 0.3);
        art.draw(g, a, t, q.x, q.y, q.k, q.flip); g.globalAlpha = ga;
      }
    }
  }
  // Cycle 3 art (G): death dissolve. Over the last 0.3 s (after the death strip's last frame) the corpse no longer fades as a whole: it
  // breaks up in 2x2 screen-pixel blocks in a 4x4 ordered-dither (Bayer) order, squashing 12 % flatter and 8 % wider at the feet, the
  // pixel-art way. One shared 256x256 scratch canvas and 17 preset dither patterns (built once); per dissolving ghost: one clear, one
  // art.draw, one pattern fill (destination-out), one drawImage. ?dissolve=0 (or no canvas) = the old whole-sprite alpha fade.
  // Test hooks: this.dissolveStats {draws, ms, level}.
  _dissolveOn() {
    if (this._dslOn === undefined) {
      let off = false; try { off = /[?&]dissolve=0(&|$)/.test(location.search); } catch (e) { off = false; }
      this._dslOn = !off && typeof document !== 'undefined' && !!document.createElement;
      this.dissolveStats = { on: this._dslOn, draws: 0, ms: 0, level: -1 };
    }
    return this._dslOn;
  }
  _dissolveKit() {
    if (this._dslKit) return this._dslKit;
    const B = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5]; // 4x4 Bayer thresholds
    const cv = document.createElement('canvas'); cv.width = cv.height = 256; const c = cv.getContext('2d');
    const pats = [];
    for (let lv = 0; lv <= 16; lv++) { // level lv: the cells whose threshold < lv are erased (lv 16 = all)
      const pc = document.createElement('canvas'); pc.width = pc.height = 8; const x = pc.getContext('2d'); x.fillStyle = '#000';
      for (let i = 0; i < 16; i++) if (B[i] < lv) x.fillRect((i % 4) * 2, ((i / 4) | 0) * 2, 2, 2);
      pats.push(c.createPattern(pc, 'repeat'));
    }
    this._dslKit = { cv, c, pats };
    return this._dslKit;
  }
  _dissolveGhost(g, a, len, q, p) {
    const t0 = typeof performance !== 'undefined' ? performance.now() : 0;
    const kit = this._dissolveKit(), c = kit.cv && kit.c, st = this.dissolveStats;
    if (!c) { this._dslOn = false; return; }
    const lv = Math.min(16, Math.max(1, Math.ceil(p * 16)));
    c.setTransform(1, 0, 0, 1, 0, 0); c.globalCompositeOperation = 'source-over'; c.globalAlpha = 1; c.clearRect(0, 0, 256, 256);
    const sx = 1 + 0.08 * p, sy = 1 - 0.12 * p; // squash toward the feet (128, 200 in the scratch)
    c.setTransform(sx, 0, 0, sy, 128 * (1 - sx), 200 * (1 - sy));
    this._enemyArt.draw(c, a, len, 128, 200, q.k, q.flip);
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.globalCompositeOperation = 'destination-out'; c.fillStyle = kit.pats[lv]; c.fillRect(0, 0, 256, 256);
    c.globalCompositeOperation = 'source-over';
    g.drawImage(kit.cv, Math.round(q.x - 128), Math.round(q.y - 200));
    st.draws++; st.level = lv; st.ms += (typeof performance !== 'undefined' ? performance.now() : 0) - t0;
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
    const er = this._er(e); const f = art.draw(g, a, t, e.x, e.y + er * 0.9, 2.8 * er / this._enemyVis, e._flip);
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

  // The one-line control hint, built from the shared MMInput mapping so it never drifts from the keys (old aliases listed after).
  _syncHelp() {
    if (typeof document === 'undefined' || typeof MMInput === 'undefined') return;
    const el = document.querySelector('#realm-help .key-hint'); if (!el) return;
    const base = MMInput.hint({ only: ['move', 'primary', 'secondary', 'menu'], names: { primary: 'fire', secondary: 'ability 2', menu: 'menu' } });
    el.textContent = base + ' · mouse aims · Q E R F abilities · B bag · K board';
    el.dataset.mmInput = '1';
  }

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
      // Universal controls (shared/mm-input.js, design/CONTROLS.md): P = Menu/Pause, R = Restart where safe, Shift = E, Enter = Space (fire).
      // Every old key keeps its meaning; these only add aliases.
      const act = typeof MMInput !== 'undefined' && !MMInput.isTyping(e.target) ? MMInput.actionOf(e) : null;
      if (act === 'restart' && !e.repeat && (this._deathShown || this.panel === 'menu')) { // R is Shield in play: restart only from the fall screen or the open menu
        e.preventDefault();
        if (this._deathShown) { const b = this._deathDom && this._deathDom.querySelector('button[data-d="again"]'); if (b) b.click(); } else if (this.canRestart()) this._menuConfirm(true);
        return;
      }
      if (k === 'p' && act === 'menu') {
        e.preventDefault(); if (e.repeat || this._deathShown) return;
        if (this._menuMode) { this._escMenu(); return; }
        if (this.paused || this.panel) this.setPaused(false); else this._panel('bp'); // like pad Start: P pauses, never leaves
        return;
      }
      if (k === 'shift' && act === 'secondary') { if (!e.repeat) this.cast(1); return; } // Shift = E (second ability)
      if (k === 'enter' && act === 'primary') { const onBtn = !!(e.target && e.target.closest && e.target.closest('button, a, summary')); if (!onBtn) this.keys[' '] = true; return; } // Enter fires like Space
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
    this.onKeyUp = (e) => { const k = e.key.toLowerCase(); this.keys[k] = false; if (k === 'enter') this.keys[' '] = false; };
    this._syncHelp();
    this.onBlur = () => { this.keys = {}; this.mouse.down = false; this.moveVec.x = 0; this.moveVec.y = 0; this.aimVec.on = false; this.aimVec.x = 0; this.aimVec.y = 0; }; // G-18 (b01-08): a lost pointerup never leaves the sticks running
    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
    window.addEventListener('blur', this.onBlur);
    this._onGesture = () => { this._unlockAudio(); };
    ['keydown', 'pointerdown', 'touchstart', 'touchend', 'click'].forEach((ev) => window.addEventListener(ev, this._onGesture, { capture: true, passive: true }));

    const toArena = (e) => {
      const r = this.canvas.getBoundingClientRect();
      this.mouse.x = ((e.clientX - r.left) / r.width) * (this._dv ? this._dv.vw : this.W); // screen units (the dungeon view shows a slice)
      this.mouse.y = ((e.clientY - r.top) / r.height) * this.H;
      this.mouse.seen = true;
    };
    this.onPointerMove = (e) => { if (e.pointerType === 'mouse') toArena(e); };
    // AR aim toggle: a click latches firing on, the next click lets go (instead of holding the button down)
    this.onPointerDown = (e) => { if (e.pointerType === 'mouse') { toArena(e); this.mouse.down = this._aimToggle && this._ax2On() ? !this.mouse.down : true; } };
    this.onPointerUp = (e) => { if (e.pointerType === 'mouse' && !(this._aimToggle && this._ax2On())) this.mouse.down = false; };
    // cyc7 L: on the window, not the canvas: the HUD (#realm-abilities, the info line, the boss bar) lies over the canvas and swallowed
    // the move, so the aim froze while the cursor crossed it. toArena maps against the canvas rect wherever the cursor is.
    window.addEventListener('pointermove', this.onPointerMove, { passive: true });
    this.canvas.addEventListener('pointerdown', this.onPointerDown);
    window.addEventListener('pointerup', this.onPointerUp);
    this.canvas.addEventListener('contextmenu', (e) => e.preventDefault());

    // R4 (b13-07 rotate storm): events are coalesced to one _resize per frame, and the canvas backing store (the costly part:
    // a re-allocation + full redraw) follows 150 ms after the LAST event; meanwhile the old backing is CSS-scaled. Frames within
    // 1 s of a resize do not feed the perf guard, so a storm cannot drop the render quality to 0.75.
    this.onResize = () => {
      if (!this.active) return;
      this._rzAt = performance.now();
      if (this._rzRaf) return;
      this._rzRaf = requestAnimationFrame(() => { this._rzRaf = 0; if (this.active) this._resize(false, true); });
    };
    window.addEventListener('resize', this.onResize);
    window.addEventListener('orientationchange', this.onResize);
    if (window.visualViewport) { window.visualViewport.addEventListener('resize', this.onResize); window.visualViewport.addEventListener('scroll', this.onResize); }
  }

  // Touch sticks are DOM elements (set up by main.js); they only feed these two vectors.
  setMoveStick(x, y) { this.moveVec.x = x; this.moveVec.y = y; }
  // AR "hold to aim" -> toggle: with the aim toggle on, letting go of a dragged aim stick keeps aiming and firing that way (latched); a short tap
  // (never dragged past 0.25) lets go. Without it (and on every page that never enabled access2) the stick is hold-to-fire as before.
  setAimStick(x, y, on) {
    if (this._aimToggle && this._ax2On()) {
      if (on) { const m = Math.sqrt(x * x + y * y); if (m > this._aimPressMax) this._aimPressMax = m; // (Math.hypot boxes its arguments)
        this.aimVec.x = x; this.aimVec.y = y; this.aimVec.on = true; return; }
      const drag = this._aimPressMax > 0.25; this._aimPressMax = 0;
      if (!drag) { this.aimVec.on = false; this.aimVec.x = 0; this.aimVec.y = 0; } // a tap: stop (the last dragged direction stays latched otherwise)
      return;
    }
    this.aimVec.x = x; this.aimVec.y = y; this.aimVec.on = !!on;
  }

  // ---------- AR: one-thumb mode (auto-fire), aim toggle, bullet shapes, HUD text scale ----------
  // Prefs are per device in their own small keys (like mm-aim-assist): never in the save, never in pixeltown-access-v1 (its schema is shared).
  enableAccess2() { this._ax2 = true; this._readAccess2(); return this.access2(); }
  _ax2On() { return this._ax2 && !(this.team && this.team.isPvp); }
  _readAccess2() {
    const rd = (k) => { try { return localStorage.getItem(k) === '1'; } catch (e) { return false; } };
    this._autoFire = rd('mm-auto-fire'); this._aimToggle = rd('mm-aim-toggle'); this._shapes = rd('mm-bullet-shapes');
    this._bakeCBBullets(); this._syncTxtFont();
  }
  _setAx2(key, field, on) {
    this[field] = !!on; try { localStorage.setItem(key, on ? '1' : '0'); } catch (e) { /* this visit only */ }
    if (field === '_aimToggle' && !on) { this.aimVec.on = false; this.mouse.down = false; this._aimPressMax = 0; } // never leave a latch behind
    this._bakeCBBullets(); return this.access2();
  }
  setAutoFire(on) { return this._setAx2('mm-auto-fire', '_autoFire', on); }
  setAimToggle(on) { return this._setAx2('mm-aim-toggle', '_aimToggle', on); }
  setBulletShapes(on) { return this._setAx2('mm-bullet-shapes', '_shapes', on); }
  // One-thumb mode = auto-fire + the aim toggle: the move stick alone plays the Realm.
  setOneThumb(on) { this.setAimToggle(on); return this.setAutoFire(on); }
  access2() { return { on: this._ax2On(), autoFire: this._autoFire, aimToggle: this._aimToggle, shapes: this._shapes, oneThumb: this._autoFire && this._aimToggle, textScale: this._txtScale, autoFireN: this.autoFireN }; }
  // The floating combat text follows the shared HUD size (pixeltown-access-v1 hudScale); the font string is built once per change, never per frame.
  _syncTxtFont() {
    const hs = this._ax2On() && this.acc && Number.isFinite(this.acc.hudScale) ? this.acc.hudScale : 1;
    if (hs === this._txtScale && this._txtFont) return;
    this._txtScale = hs; this._txtFont = 'bold ' + Math.round(14 * hs) + 'px system-ui, sans-serif';
  }
  // Auto-fire target: the nearest live enemy within RM_AF_RANGE (no arrays, no objects: one pass over the pool). null = hold fire.
  _autoFireTarget() {
    const p = this.player; let best = null; let bd = RM_AF_RANGE * RM_AF_RANGE;
    for (let i = 0; i < this.enemies.length; i++) {
      const e = this.enemies[i]; if (!e.active) continue;
      const dx = e.x - p.x; const dy = e.y - p.y; const d = dx * dx + dy * dy;
      if (d < bd) { bd = d; best = e; }
    }
    return best;
  }

  // B7: an enemy's hit radius: its own e.rad (a big creature) or its type's.
  _er(e) { return e.rad > 0 ? e.rad : RM_ENEMIES[e.type].r; }
  // B7 public helper: damage one live enemy from outside the arena (a companion, a world effect). Clamped to 1e6; returns the damage passed on.
  damageEnemy(e, dmg, src) {
    if (!e || !e.active || this.enemies.indexOf(e) < 0) return 0;
    const d = Math.min(1e6, Number(dmg)); if (!(d > 0)) return 0;
    this.lastDmgSrc = typeof src === 'string' ? src.slice(0, 16) : null;
    this._hitEnemy(e, d); return d;
  }
  // B7 public helper: show a TG3 telegraph on `e`: shape 'ring' | 'line' | 'cone', `sec` = seconds until the attack lands (the first call
  // of a wind-up sets its length). Falsy shape or sec <= 0 clears it. Reuses the TG3 sprites, palette and reduced-motion look; solo world only.
  tgFor(e, shape, sec) {
    if (!e) return false;
    const code = RM_TG_CODE[shape] || 0; const s = Number(sec);
    if (!code || !(s > 0) || !this._tgOn()) { e._tg = 0; return false; }
    if (e._tg !== code || !(e._tgW >= s)) { // a new wind-up
      this.tgStarted++;
      if (this.clock - this._tgSndAt > 0.6 || this._tgSndAt > this.clock) { this._tgSndAt = this.clock; this._snd('warn'); }
      e._tgW = s;
    }
    const p = this._nearest(e.x, e.y);
    e._tg = code; e._tgP = Math.max(0, Math.min(1, 1 - s / e._tgW)); e._tgA = Math.atan2(p.y - e.y, p.x - e.x);
    return true;
  }

  // ---------- scrolling world + camera (additive; null world = the screen is the world, exactly as before) ----------
  // setWorld({w, h, tile, camera, solidAt(x,y), shotSolidAt(x,y), drawUnder(g,cam), drawOver(g,cam), tick(dt), onStart(), wake, pools:{enemies,eBullets}}):
  // the world is w x h logical px, larger than the screen; the camera follows the player (smoothed, clamped to the world, integer-snapped,
  // snapped instantly under reduced motion). Every world<->screen conversion goes through this.camera {x, y, vw, vh} (read it, never write it):
  // drawing translates once per frame, mouse aim maps screen -> world, the player / enemies / bags clamp to the world instead of the screen.
  // solidAt(x, y) (px) blocks the player and enemies; shotSolidAt (default solidAt) absorbs bullets. setWorld(null) turns it all off.
  // B7 optional hooks (BIOME-ARCH-PLAN 2.4; every one null = unchanged; only a world page passes them, never the Town, duels or co-op):
  //   enemyStep(e, dt, p) -> true: this creature (e.cre) moved itself this frame (the built-in AI and fire are skipped; clamp + slide still apply)
  //   onLethal(e, dmg) -> true: a lethal hit knocks out instead of killing (e keeps 1 hp: no kill, shards, XP, kb or bag)
  //   drawEnemy(g, e) -> true: the hook drew this enemy (the built-in sprite, flash, hp bar and pips are skipped)
  //   drawMid(g, cam): drawn after the enemies / bolts, under the hero (a mount); heroLift() -> px the hero is drawn raised; dashMul() -> dash scale
  setWorld(opts) {
    if (!opts || typeof opts !== 'object') { this.world = null; this._solidAt = null; this._shotSolidAt = null; this._camF.x = 0; this._camF.y = 0; this.camera.x = 0; this.camera.y = 0; if (this.stats) this._calcStats(); return null; }
    const n = (v, d) => (Number.isFinite(Number(v)) && Number(v) > 0 ? Math.min(1 << 20, Math.floor(Number(v))) : d);
    const fn = (f) => (typeof f === 'function' ? f : null);
    this.world = Object.freeze({ w: n(opts.w, this.W), h: n(opts.h, this.H), tile: n(opts.tile, 32), camera: opts.camera !== false, wake: n(opts.wake, 0),
      drawUnder: fn(opts.drawUnder), drawOver: fn(opts.drawOver), tick: fn(opts.tick), moveScaleAt: fn(opts.moveScaleAt), onStart: fn(opts.onStart),
      enemyStep: fn(opts.enemyStep), onLethal: fn(opts.onLethal), drawEnemy: fn(opts.drawEnemy), drawMid: fn(opts.drawMid), heroLift: fn(opts.heroLift), dashMul: fn(opts.dashMul) }); // B7 arena hooks (null = today's behaviour)
    this._solidAt = fn(opts.solidAt); this._shotSolidAt = fn(opts.shotSolidAt) || this._solidAt;
    const pl = opts.pools && typeof opts.pools === 'object' ? opts.pools : {};
    const grow = (pool, want, max, f) => { const k = Math.min(max, n(want, 0)); while (pool.length < k) pool.push(f()); };
    grow(this.enemies, pl.enemies, 96, () => ({ active: false, type: 'aimed', x: 0, y: 0, hp: 0, maxHp: 0, t: 0, cd: 0, cd2: 0, angle: 0, flash: 0, ax: 0, ay: 0, dir: 1, phase: 0, invuln: 0 }));
    grow(this.eBullets, pl.eBullets, 900, () => ({ active: false, x: 0, y: 0, vx: 0, vy: 0, life: 0, kind: 0, ea: null, ok: null, oa: null, on: null }));
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
    const dv = this._dv;
    if (dv && !wd) { // dungeon view: pan sideways only, smoothed like the world camera, clamped to the room
      c.vw = dv.vw; c.y = 0; f.y = 0;
      const tx = p.x - dv.vw / 2;
      if (dt < 0 || this._reduced) f.x = tx; else f.x += (tx - f.x) * (1 - Math.exp(-Math.min(dt, 0.1) * 12));
      const mx = Math.min(80, dv.vw * 0.2);
      if (p.x - f.x < mx) f.x = p.x - mx; else if (p.x - f.x > dv.vw - mx) f.x = p.x - dv.vw + mx;
      f.x = Math.max(0, Math.min(this.W - dv.vw, f.x)); c.x = Math.round(f.x);
      return;
    }
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
  _resize(force, storm) {
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
    let k = Math.min(w / this.W, h / this.H);
    let cw = Math.floor(this.W * k); let ch = Math.floor(this.H * k);
    // PLAYTEST-REVIEW-3 #4 (dungeon view): a fixed dungeon room on a tall portrait screen was a letterboxed strip (~35% of the height). There the
    // whole room height is shown at RM_DV_FILL of the screen height and the view pans sideways with the hero (this.camera.x; rooms, bounds and
    // seeds unchanged, this.W / this.H stay the room). ?dview=0 restores the full-room strip.
    this._dv = null;
    if (this.fixedWorld && !this.world && !this._dvOff && ch < h * RM_DV_MIN) {
      const k2 = Math.min(h * RM_DV_FILL / this.H, k * RM_DV_ZOOM_MAX); const vw = Math.min(this.W, Math.floor(w / k2));
      if (vw < this.W) { k = k2; cw = Math.floor(vw * k); ch = Math.floor(this.H * k); this._dv = { vw, k }; }
    }
    this._cssK = k;
    const ckey = `${cw}|${ch}|${w}|${h}`;
    if (ckey !== this._cvKey) { // letterboxed only when the world aspect cannot match the screen
      this._cvKey = ckey; const cs = this.canvas.style;
      cs.position = 'absolute'; cs.width = `${cw}px`; cs.height = `${ch}px`; cs.left = `${Math.floor((w - cw) / 2)}px`; cs.top = `${Math.floor((h - ch) / 2)}px`; this.canvas.classList.toggle('rm-dv', !!this._dv); // page CSS may seat the dungeon view (mad-maze.css: above the phone sticks)
    }
    if (storm) {
      clearTimeout(this._bkT);
      this._bkT = setTimeout(() => { this._bkT = 0; if (this.active) { this._applyBacking(); this._stAnchorT = -1e9; } }, 150);
    } else { clearTimeout(this._bkT); this._bkT = 0; this._applyBacking(); }
    this._stAnchorT = -1e9; // the HUD rects moved
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
    const vw = this._dv ? this._dv.vw : this.W; // dungeon view: the backing store holds only the visible slice of the room
    const cw = Math.max(1, Math.round(vw * s)); const ch = Math.max(1, Math.round(this.H * s));
    if (this.canvas.width !== cw || this.canvas.height !== ch) { this.canvas.width = cw; this.canvas.height = ch; }
    this.scale = this.canvas.width / vw; this._vignette = null; this._hitVig = null;
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
    [this.pBullets, this.eBullets, this.enemies, this._edGhosts || [], this.particles, this.texts, this.bags, this.drifters, this.hazards, this._sparks || [], this._fxPool || []].forEach((pool) => pool.forEach((o) => { o.active = false; }));
    this.bags.forEach((b) => { b.gear = null; }); // review F9
    this._wireRefresh(); this._padPrev.fill(false); this._wq.length = 0;
    this.keys = {}; this.mouse.down = false; this.moveVec.x = 0; this.moveVec.y = 0; this.aimVec.on = false; this.aimVec.x = 0; this.aimVec.y = 0; // no stuck input from the last run
    const p = this.player;
    p.status = null; p._stm = null; p._stNext = Infinity; p._stAcc = 0; this._stList = null; // statuses never carry over into a new run
    this._calcStats();
    this.abilityCd = [0, 0, 0, 0]; this.shield.hits = 0; this.shield.t = 0; this.overdriveT = 0; this.paused = false; this._sigReset();
    this.focus = null; this._focusSync(); // FO2: every run starts with full focus (null when focus is off)
    p.x = this.W / 2; p.y = this.H / 2; p.hp = this.stats.maxHp; p.dashT = 0; p.iframes = 1; p.fireCd = 0; p.aim = -Math.PI / 2;
    this.run = { wave: 0, kills: 0, shards: 0, assisted: false }; this._waveSc = null;
    if (this._assistOn() && MMAssist.isAssisted(this._assistPref())) this.run.assisted = true; // ID-06: tagged from the start
    this._felledBy = ''; this._hitSrc = null; this.biome = 0; this.clock = 0; this._speedMul = 1; this.down = false; this.reviveT = 0; this._syncBoss();
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
    this.flushSave(); // review F16: a pending kill save is written before the run ends (exit, leave, team end)
    this.active = false; this._focusHud(true);
    if (this.team) { this.team.close(); this.team = null; this.role = 'solo'; }
    const pe = document.getElementById('realm-partner'); if (pe) pe.classList.add('hidden');
    this.keys = {};
    this.mouse.down = false;
    this.aimVec.on = false; this.moveVec.x = 0; this.moveVec.y = 0;
    if (this._raf) cancelAnimationFrame(this._raf);
    clearTimeout(this._bannerTimer);
    this._panel(null, true); // never leave a panel covering a stopped run (the page is leaving: the Back entry is not popped)
    this._hideBanner();
  }

  destroy() {
    this.stop();
    if (typeof window !== 'undefined' && window.removeEventListener) { window.removeEventListener('pagehide', this._onHide); window.removeEventListener('storage', this._onStorage); }
    if (typeof document !== 'undefined' && document.removeEventListener) document.removeEventListener('visibilitychange', this._onVis);
    window.removeEventListener('keydown', this.onKeyDown);
    window.removeEventListener('keyup', this.onKeyUp);
    window.removeEventListener('blur', this.onBlur);
    ['keydown', 'pointerdown', 'touchstart', 'touchend', 'click'].forEach((ev) => window.removeEventListener(ev, this._onGesture, { capture: true }));
    window.removeEventListener('pointerup', this.onPointerUp);
    window.removeEventListener('pointermove', this.onPointerMove);
    window.removeEventListener('resize', this.onResize);
    if (this._rzRaf) { cancelAnimationFrame(this._rzRaf); this._rzRaf = 0; } clearTimeout(this._bkT); this._bkT = 0;
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
    if (!(this._rzAt && now - this._rzAt < 1000)) this._perfFeed(raw); // R4: frames within 1 s of a resize / rotation are not render cost
    this._update(dt);
    if (this.world || this._dv) this._camStep(dt);
    // ID-14: the frame of a big hit is drawn, then the canvas keeps it for RM_HIT_PAUSE_MS (no redraw); the sim above ran as always
    if (this._hitPauseAt >= 0 && now > this._hitPauseAt && now < this._hitPauseAt + RM_HIT_PAUSE_MS) this.hitPausedFrames++;
    else this._draw();
    if (this.active) this._raf = requestAnimationFrame(this._loop); // a death exit inside _update must not leave a second loop
  };

  // ---------- spawning ----------

  enemiesAlive() { return this.countActive('enemies'); }

  spawnEnemy(type, x, y) {
    const e = this._take(this.enemies);
    if (!e) return null;
    const def = RM_ENEMIES[type];
    const scale = (1 + 0.15 * Math.max(0, this.run.wave - 1)) * (this.team && this.role === 'host' ? RT_HP_SCALE : 1); // tougher with a partner
    e.active = true; e.type = type; e.x = x; e.y = y; e.provT = 0; // G-08: a pooled enemy starts unprovoked
    e.maxHp = Math.ceil(def.hp * scale); e.hp = e.maxHp;
    e.slowT = 0; e.slowF = 1; e.boneT = 0; e.status = null; e._stm = null; e._stNext = Infinity; e._stAcc = 0; e.fireMul = 1; e._pipAt = -9; e._pipN = 0; e._pipMore = 0; e._tg = 0; e._tgW = 0; e._tgP = 0; e._tgA = 0;
    e.dg = null; e._at = undefined; e.t = 0; e.flash = 0; e.angle = this.rng() * Math.PI * 2; e.dir = this.rng() < 0.5 ? 1 : -1;
    e.cd = 0.8 + this.rng() * 0.8; // first shot is never instant
    if (this.world) { e.ax = x + (this.rng() - 0.5) * 220; e.ay = y + (this.rng() - 0.5) * 220; } else { e.ax = 80 + this.rng() * (this.W - 160); e.ay = 80 + this.rng() * (this.H - 160); } // drift target for Whirlers (near home in a world)
    e.spdMul = 1; e.dmgMul = 1; e.xpMul = 1; e.shardMul = 1; e.art = null; e.bossArt = null; e.zid = -1; e.evid = null; e.campId = null; e.bossName = null; e.bossTier = 0; e.diff = null; e.zone = undefined; // world-mode extras (zone: ID-01, a reused pool entry never keeps an old zone) (multipliers 1 = unchanged)
    e.rad = 0; e.cre = null; e.tame = null; // B7: per-creature hit radius (0 = the type's), creature tag (enemyStep runs only for these), taming state
    if (this.world && type === 'boss') { e.ax = x; e.ay = y; }
    if (type === 'boss') this._snd('boss_awaken'); // NEXT-SLICES SF1 cue: any boss spawn (classic wave, world altar / event, dungeon)
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
    const b = this.state === 'dead' ? null : this._boss(); // b01-07: no boss bar over the 'You fell' card
    el.classList.toggle('hidden', !b);
    if (!b) return;
    const f = document.getElementById('realm-boss-fill'); if (f) f.style.width = `${Math.max(0, b.hp) / b.maxHp * 100}%`;
    const n = document.getElementById('realm-boss-name'); if (n) n.textContent = `${b.bossName || RM_ENEMIES.boss.name} · phase ${b.phase}`;
    el.dataset.phase = String(b.phase);
  }

  fireEnemyBullet(x, y, angle, speed, kind, owner) {
    const fb = this._fireBudget();
    if (fb && this._ebLive >= fb.cap) { this._ebCapped++; return null; } // world fire budget: the zone's live enemy-bullet cap is full
    const b = this._take(this.eBullets);
    if (!b) return null;
    if (this.team && this.role === 'host') this.team.ev('fe', [Math.round(x), Math.round(y), Math.round(angle * 1000) / 1000, speed, kind || 0]);
    b.active = true; b.x = x; b.y = y; b.vx = Math.cos(angle) * speed; b.vy = Math.sin(angle) * speed; b.life = 6; b.kind = kind || 0; b.rl = 0; b.dm = this._curDm; const ow = owner || this._curE; b.ok = ow ? ow.type : null; b.oa = ow ? ow.art : null; b.on = ow ? ow.bossName : null; b.ea = this._boltArt ? this._ebSelect(b.kind) : null;
    if (fb) { this._ebLive++; const t = fb.travel * Math.max(this.W, this.H) / (speed > 1 ? speed : 1); if (t < b.life) b.life = t; } // a bolt flies at most `travel` x the view's long side
    return b; // cyc5 (ID-36): additive, the Trial layers shorten their own bolts' life; every older caller ignores it
  }

  // World mode only (solo overworld, never the classic arena, dungeons or co-op): the fire budget realm-world.js sets per zone, else null.
  _fireBudget() {
    const fb = this.fireBudget;
    return fb && this.world && this.mode === 'world' && !this.dungeon && !this.team && fb.cap > 0 ? fb : null;
  }

  // Class fire tags (heroProfile.shots/spread/pierce/shotDmg/critChance/boltSpeed). Default / duel / no profile = the plain single bolt.
  _firePlayerVolley(aim) {
    if (this._wpnOn()) { this._fireWeapon(aim); return; }
    const hp = this.heroProfile;
    if (!hp || (this.team && this.team.isPvp) || (hp.shots === 1 && hp.pierce === 0 && hp.shotDmg === 1 && hp.critChance === 0 && hp.boltSpeed === 1)) { this.firePlayerBullet(aim); return; }
    const cc = Math.min(0.5, hp.critChance + (this.stats.crit || 0)); // G8: + the `keen` affix crit
    const base = this.stats.dmg * (this.sg.powT > 0 ? this.sg.powMul : 1) * hp.shotDmg;
    const n = hp.shots;
    for (let k = 0; k < n; k++) {
      const d = cc > 0 && this.rng() < cc ? base * 2 : base;
      const b = this.firePlayerBulletFrom(this.player.x, this.player.y, aim + (n > 1 ? (k / (n - 1) - 0.5) * hp.spread : 0), d, 0);
      if (!b) continue;
      b.pr = hp.pierce; if (d !== base) b.cr = 1;
      if (hp.boltSpeed !== 1) { b.vx *= hp.boltSpeed; b.vy *= hp.boltSpeed; b.life /= hp.boltSpeed; }
      this._gearBolt(b);
    }
  }
  // G11: the `reach` (range +%) and `pierce` (+n, cap 3) gear stats on one of your own fresh bolts. Never in duels; 0 / missing keys change nothing.
  // A weapon-style bolt gets its reach through _wpnReach (its life comes from the spec), so only its pierce is added here.
  _gearBolt(b) {
    const st = this.stats;
    if (!st || (this.team && this.team.isPvp)) return;
    if (st.reach > 0 && !b.ws) b.life *= 1 + Math.min(0.5, st.reach);
    if (st.pierce > 0) b.pr = Math.min(3, b.pr + st.pierce);
  }
  // The weapon spec a fresh styled bolt flies with: the hero's, or (with `reach`) a cached copy whose life is longer by that share.
  _wpnReach(w) {
    const k = this.stats && this.stats.reach > 0 && !(this.team && this.team.isPvp) ? Math.min(0.5, this.stats.reach) : 0;
    if (!k) return w;
    const c = this._wReach;
    if (c && c.src === w && c.k === k) return c.w;
    const out = Object.freeze(Object.assign({}, w, { life: Math.min(2, w.life * (1 + k)) }));
    this._wReach = { src: w, k, w: out };
    return out;
  }

  firePlayerBullet(angle) {
    const base = this.stats.dmg * (this.sg.powT > 0 ? this.sg.powMul : 1);
    const kc = this.stats.crit > 0 && !(this.team && this.team.isPvp) ? this.stats.crit : 0; // G8 `keen` crit on the plain bolt (no roll at 0: unchanged rng)
    const crit = kc > 0 && this.rng() < kc;
    const b = this.firePlayerBulletFrom(this.player.x, this.player.y, angle, crit ? base * 2 : base, 0);
    if (b && crit) b.cr = 1;
    if (b) this._gearBolt(b);
  }

  // owner 0 = you (host), 1 = your partner. Everything a bolt does is decided on the host; guests only draw them.
  // wcode (optional): weapon-style wire code, sent as the 5th `fp` element so guests draw the same path (old guests ignore it).
  firePlayerBulletFrom(x, y, angle, dmg, owner, wcode) {
    const b = this._take(this.pBullets);
    if (!b) return null;
    if (this.team && this.role === 'host') this.team.ev('fp', wcode >= 0 ? [Math.round(x), Math.round(y), Math.round(angle * 1000) / 1000, Math.round(dmg * 10) / 10, wcode] : [Math.round(x), Math.round(y), Math.round(angle * 1000) / 1000, Math.round(dmg * 10) / 10], owner);
    b.ws = null; b.ho = 0; b.lb = 0; b.st = 0; b.cr = 0; b.sq = 0; // cr: this bolt rolled a crit (gold damage number); sq: it already splashed (G11, one splash per bolt)
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

  // P2: damage-number strings cached by value (no string built per hit). k 0 = plain "12.3", -1 = crit "12.3!", n > 0 = splash "12.3 ×n".
  _numTxt(v, k) {
    const C = this._numC || (this._numC = new Map()); const key = Math.round(v * 10) * 8 + (k < 0 ? 7 : k); // k is -1..6
    let t = C.get(key);
    if (t === undefined) { t = k < 0 ? `${v}!` : k > 0 ? `${v} ×${k}` : String(v); if (C.size >= 512) C.clear(); C.set(key, t); }
    return t;
  }
  // P2: the low graphics tier (MMPerf 'low', forced by the Low graphics setting or picked automatically; mad-maze.js publishes it in window.__mmPerf).
  // Read once per frame (_update), so a hit never touches the DOM.
  _lowGfx() { return this._lowF === true; }
  _readLowGfx() { const P = typeof window !== 'undefined' ? window.__mmPerf : null; this._lowF = !!(P && P.lowGfx === true); }

  _floatText(x, y, text, color) {
    const t = this._take(this.texts);
    if (!t) return null;
    t.active = true; t.x = x; t.y = y; t.vy = -48; t.life = 0.7; t.text = text; t.color = color; t.ico = ''; t.plain = ''; t.outline = ''; t.notice = false;
    return t;
  }

  // Cycle 5 L (b01-r3-01): sentence notices above the hero ("The Midlands has better prey", "New notebook page: ...", the trophy
  // and storage lines) used to be float texts spawned on the same kill a few px apart, so one printed over the other. They now
  // go through ONE queue: a notice shows at once when none is up, otherwise it waits until the one before it has faded.
  // Numbers (+xp, damage, shards) stay plain float texts. At most 6 wait; a line already waiting is not queued twice.
  _notice(text, color) {
    const q = this._noticeQ || (this._noticeQ = []);
    if (!(this._noticeT > 0) && !q.length) return this._noticeShow(text, color);
    if (q.length < 6 && !q.some((n) => n.text === text)) q.push({ text, color });
    return null;
  }
  _noticeShow(text, color) {
    const p = this.player; if (!p) return null;
    const t = this._floatText(p.x, p.y - 58, text, color);
    if (t) { t.notice = true; t.outline = '#0b0d1a'; this._noticeT = 0.8; } // 0.7 s life + a short gap before the next one
    return t;
  }
  _noticeTick(dt) {
    if (this._noticeT > 0) this._noticeT -= dt;
    if (!(this._noticeT > 0) && this._noticeQ && this._noticeQ.length) { const n = this._noticeQ.shift(); this._noticeShow(n.text, n.color); }
  }

  // ---------- simulation ----------

  _update(dt) {
    this._readReducedFrame(); this._readLowGfx();
    if (this.paused) { this._readPad(); this._padPauseEdge(); return; } // backpack open (Start can still close it)
    this._stT += dt; this._stTick(dt); this._focusTick(dt); this._gearTick(dt);
    if (this.state === 'play') this._cacheAliveT = (this._cacheAliveT || 0) + dt; // G-09: time alive since the last Survivor's cache
    this._accT += dt; if (this._accT >= 1) { this._accT = 0; this.refreshAccess(); }
    this.shake = Math.max(0, this.shake - dt * 30);
    this.flash = Math.max(0, this.flash - dt * 2.2);
    if (this.displayShards !== this.save.shards) { // the shard counter ticks up (or down) instead of jumping
      const d = this.save.shards - this.displayShards;
      this.displayShards += Math.sign(d) * Math.max(1, Math.ceil(Math.abs(d) * Math.min(1, dt * 6)));
      if (Math.sign(this.save.shards - this.displayShards) !== Math.sign(d)) this.displayShards = this.save.shards;
      this._syncShards(); // cycle0 L-04: only the counter changes here; a full _syncHud every frame of the tick rewrote the whole HUD (about 25 lookups, 15 DOM writes)
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
    this._noticeTick(dt);

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
        p.aim = MMAim.assist(p.aim, p, t, { enabled: true, tile: RM_TILE, cone: this._aimCone || 14 });
      }
    } else if (this.mouse.seen) {
      p.aim = Math.atan2(this.mouse.y + this.camera.y - p.y, this.mouse.x + this.camera.x - p.x); // mouse is in screen units: + camera = world (camera is 0,0 without a world)
      firing = this.mouse.down || !!this.keys[' '];
    } else if (this.keys[' ']) firing = true;
    if (pad && pad.fire) firing = true;
    if (!firing && this._autoFire && this._ax2On() && !this.down && !(pad && pad.aim.on)) { // AR one-thumb: aim at the nearest enemy in range and fire
      const t = this._autoFireTarget();
      if (t) { // lead the target by its measured velocity over the bolt's flight time (strafing enemies are hit too); plain numbers only
        if (t !== this._afT || !(dt > 0)) { this._afT = t; this._afVx = 0; this._afVy = 0; }
        else { this._afVx = this._afVx * 0.6 + ((t.x - this._afX) / dt) * 0.4; this._afVy = this._afVy * 0.6 + ((t.y - this._afY) / dt) * 0.4; }
        this._afX = t.x; this._afY = t.y;
        const dx = t.x - p.x; const dy = t.y - p.y; const ft = Math.sqrt(dx * dx + dy * dy) / RM_PLAYER.bulletSpeed;
        p.aim = Math.atan2(dy + this._afVy * ft, dx + this._afVx * ft); firing = true; this.autoFireN++;
      } else this._afT = null;
    }
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
    this._snd('boss_awaken'); // the phase change roar (same SF1 cue as the spawn)
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
    if (newBest) this._setBossBest(tenths);
    this.eBullets.forEach((b) => { if (b.active) { b.active = false; this._burst(b.x, b.y, '#ffe27a', 1, 60); } });
    this._burst(e.x, e.y, '#ff5fa2', 40, 340); this._burst(e.x, e.y, '#ffe27a', 30, 260);
    this.shake = 14;
    if (this._fxPool) this.fxPlay('fx_explosion_big', e.x, e.y, { w: 160 });
    this._floatText(e.x, e.y - 30, `+${gain} 💎`, '#8fe9ff');
    this._gainXp(Math.round(RM_XP.boss * tier * this.stats.xp));
    this.dropBag(e.x - 20, e.y + 20, 2); this.dropBag(e.x + 20, e.y + 20, this.rollRarity()); // a guaranteed rare, plus one more
    this._showBanner(`${e.bossName || 'Gloomheart'} defeated!  +${gain} 💎${newBest ? `  New best time!${this.run.assisted ? ' (Assisted)' : ''}` : ''}`, 2.4, true);
    if (this.team) { this.team.ev('rew', [40 + 10 * tier, RM_XP.boss * tier, 'boss', 1, tenths]); this.team.ev('clr', []); }
    this.onSave(this.save);
    this._syncBoss();
  }

  // World mode only: may this enemy shoot? It must be on screen (a 24 px margin) and within RM_FIRE_RANGE x the view's half-diagonal of
  // the player, so nothing snipes from outside the camera. The classic arena and dungeons (the whole room is the view) are unchanged.
  _canFire(e, p) {
    if (!this._holdFire) return true;
    if (this._dv && !this.world) { const cx = this.camera.x; return e.type === 'boss' || (e.x >= cx - 40 && e.x <= cx + this._dv.vw + 40); } // dungeon view (phone portrait): shooters far outside the slice hold their fire
    if (!this.world || this.mode !== 'world' || this.dungeon) return true;
    const c = this.camera; const m = 24;
    if (e.x < c.x - m || e.x > c.x + this.W + m || e.y < c.y - m || e.y > c.y + this.H + m) return false;
    const fr = Math.hypot(this.W, this.H) * 0.5 * RM_FIRE_RANGE;
    return (e.x - p.x) * (e.x - p.x) + (e.y - p.y) * (e.y - p.y) <= fr * fr;
  }

  _updateEnemies(dt0) {
    const wd = this.world; const wake = wd ? (wd.wake || Math.max(this.W, this.H) * 0.75) : 0; const wake2 = wake * wake;
    const tg = this._tgOn();
    for (let i = 0; i < this.enemies.length; i++) {
      const e = this.enemies[i];
      if (!e.active) continue;
      let dt = dt0;
      if (e.slowT > 0) { e.slowT -= dt0; dt = dt0 * e.slowF; } // a signature slow (Blizzard Ring / Thorn Bloom); never set otherwise
      const p = this._nearest(e.x, e.y);
      e.t += dt; e.flash = Math.max(0, e.flash - dt * 6);
      if (wd && !(e.provT > 0) && (p.x - e.x) * (p.x - e.x) + (p.y - e.y) * (p.y - e.y) > wake2) { e._tg = 0; continue; } // world: an enemy far from every player sleeps (no moving, no firing); a provoked one (G-08) wakes
      this._curE = e; this._curDm = e.dmgMul || 1; // bullets fired below carry this enemy's damage multiplier (1 = unchanged)
      let sm = null;
      if (e.status) { if (e._stNext <= this._stT * 1000) this._stRefresh(e); sm = e._stm; if (sm) { this._curDm *= sm.enemyDmg; if (sm.dot > 0) this._stEnemyDot(e, sm, dt0); if (!e.active) continue; } }
      if (e.provT > 0) e.provT = Math.max(0, e.provT - dt0); // G-08: provoked countdown
      const hold = (wd || this._dv) && !(e.provT > 0) && !this._canFire(e, p); // world: off-screen shooters hold their fire (cooldowns wait at 0.2 s); a provoked one does not
      if (hold) { e.cd = Math.max(e.cd, 0.2); if (e.type === 'boss') e.cd2 = Math.max(e.cd2, 0.2); }
      if (e.type === 'boss') { if (sm && sm.speed < 1) e.t -= dt * (1 - sm.speed); this._updateBoss(e, dt * (e.fireMul || 1) / (sm ? sm.enemyFire : 1)); if (tg) this._tgBoss(e, hold, p); this._curDm = 1; this._curE = null; continue; } // slowed: the sway runs slower
      if (sm && sm.stun) { e._tg = 0; continue; } // stunned: no moving, no firing
      if (e.cre && wd && wd.enemyStep) { const cx = e.x; const cy = e.y; if (wd.enemyStep(e, dt, p)) { this._enemyClamp(e, cx, cy); continue; } } // B7: a creature moves itself
      if (!hold) e.cd -= dt * (e.fireMul || 1) / (sm ? sm.enemyFire : 1); // fireMul: classic wave scale; dazed makes fire cooldowns x1.5
      const ox = e.x; const oy = e.y; const sp = (e.spdMul || 1) * (sm ? sm.speed : 1);
      const dx = p.x - e.x; const dy = p.y - e.y; const dist = Math.hypot(dx, dy) || 1;
      if (e.type === 'spiral') {
        // Drifts toward its anchor and keeps spinning out a steady spiral.
        if (e.provT > 0 && wd && !this._canFire(e, p)) { e.ax += (dx / dist) * RM_ENEMIES.spiral.speed * 1.6 * sp * dt; e.ay += (dy / dist) * RM_ENEMIES.spiral.speed * 1.6 * sp * dt; } // G-08: provoked + off screen: the anchor walks in
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
      if (tg) this._tgStep(e, hold, p);
      this._enemyClamp(e, ox, oy);
    }
    this._curDm = 1; this._curE = null;
  }
  // Keep an enemy inside the world; world tiles block enemies too: slide along one axis, else stay at (ox, oy).
  _enemyClamp(e, ox, oy) {
    e.x = Math.max(20, Math.min(this._bw() - 20, e.x));
    e.y = Math.max(20, Math.min(this._bh() - 20, e.y));
    if (this._solidAt && this._blocked(e.x, e.y, 8)) {
      if (!this._blocked(e.x, oy, 8)) e.y = oy; else if (!this._blocked(ox, e.y, 8)) e.x = ox; else { e.x = ox; e.y = oy; }
      if (e.type === 'spiral') { e.ax = e.x; e.ay = e.y; }
    }
  }

  _updateBullets(dt) {
    const p = this.player; const bw = this._bw(); const bh = this._bh();
    // Player bolts: move, hit enemies (spatial hash over the enemies, rebuilt once per frame).
    if (this._hash) { let any = false; for (let i = 0; i < this.pBullets.length; i++) if (this.pBullets[i].active) { any = true; break; } if (any) this._buildHash(); } // no bolts, no hash
    this._spFrame = 0; // G11: splash events with FX this frame
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
        if (!b.own && this.stats.leech > 0) this._leechAdd(Math.min(b.dmg || this.stats.dmg, Math.max(0, he.hp))); // G8 leech: your own bolts only (never a partner's)
        if (!b.own && this.stats.venom > 0 && !(b.ws && b.st > 0)) this._venomBleed(he, 1); // G11: `venom` on a style without a status = a bleed chance (no roll at 0)
        this._hitEnemy(he, b.dmg || this.stats.dmg, b.cr === 1);
        if (!b.sq && RM_SPLASH_ON) { const sp = this._splashSpec(b); if (sp) { b.sq = 1; this._splashAt(b, b.x, b.y, hj, b.dmg || this.stats.dmg, sp); } } // G11: one splash per bolt (pierce: the first hit)
      }
      if (!b.active) continue;
      for (let j = 0; j < this.drifters.length; j++) {
        const d = this.drifters[j];
        if (d.active && (b.x - d.x) * (b.x - d.x) + (b.y - d.y) * (b.y - d.y) < 15 * 15) { b.active = false; this._hitDrifter(d, b.dmg || this.stats.dmg); break; }
      }
    }
    this._updateSparks(dt); this._fxUpdate(dt); this._splashRingTick(dt);
    // Enemy bullets: move, hit the player. World mode: a bullet more than one view diagonal from the player can never matter: it is dropped.
    const pr = RM_PLAYER.r + 4;
    const cull = this.world && this.mode === 'world' && !this.dungeon ? (this.W * this.W + this.H * this.H) : 0;
    let ebLive = 0;
    for (let i = 0; i < this.eBullets.length; i++) {
      const b = this.eBullets[i];
      if (!b.active) continue;
      ebLive++; // counted before the move: a bolt that ends this frame frees its budget slot next frame (conservative)
      b.x += b.vx * dt; b.y += b.vy * dt; b.life -= dt;
      if (b.life <= 0 || b.x < -20 || b.y < -20 || b.x > bw + 20 || b.y > bh + 20) { b.active = false; continue; }
      if (cull && (b.x - p.x) * (b.x - p.x) + (b.y - p.y) * (b.y - p.y) > cull) { b.active = false; continue; }
      if (this.walls && this.isWallAt(b.x, b.y)) { b.active = false; continue; }
      if (!this.walls && this._shotSolidAt && this._shotSolidAt(b.x, b.y)) { b.active = false; continue; }
      if (this.state !== 'dead' && !this.down && p.iframes <= 0 && (b.x - p.x) * (b.x - p.x) + (b.y - p.y) * (b.y - p.y) < pr * pr) {
        b.active = false; this._hitSrc = b; // cyc7 L: the bolt's owner, read (and cleared) by _hitPlayer for the fall card
        this._hitPlayer(this._guarded(b.dm > 0 && b.dm !== 1 ? Math.round(RM_ENEMY_BULLET_DAMAGE * b.dm) : RM_ENEMY_BULLET_DAMAGE));
      } else if (this.team && this.role === 'host' && this.team.partner && this.team.partner.ready) {
        const q = this.team.partner; // the partner takes the same (wave-scaled) bolt damage as the host; dm 1 = the old 8
        if ((b.x - q.x) * (b.x - q.x) + (b.y - q.y) * (b.y - q.y) < pr * pr && this.team.hitPartner(b.dm > 0 && b.dm !== 1 ? Math.round(RM_ENEMY_BULLET_DAMAGE * b.dm) : RM_ENEMY_BULLET_DAMAGE)) b.active = false;
      }
    }
    this._ebLive = ebLive;
  }

  // The damage-number colour for a hit on `e` (S14): a crit keeps gold, marked keeps its pink, armorBroken draws purple, else white.
  _dmgColor(e, crit) {
    if (crit) return RM_DMG_COL.crit;
    const fx = e && e.status && e.status.fx; if (!fx) return RM_DMG_COL.plain;
    const now = this._stT * 1000;
    if (fx.marked && fx.marked.until > now) return RM_DMG_COL.marked;
    if (fx.armorBroken && fx.armorBroken.until > now) return RM_DMG_COL.armorBroken;
    return RM_DMG_COL.plain;
  }

  // quiet (G11 splash): no per-hit damage number / spark burst (the splash event shows one combined number); kills behave as usual.
  _hitEnemy(e, dmg, crit, quiet) {
    if (e._stm && e._stm.taken !== 1) dmg *= e._stm.taken; // status mods (marked / curse / armorBroken), capped at x1.5 by MMStatus
    if (this.dungeon && e.dg === 'boss') { this.dungeon.hitBoss(e, dmg); return; }
    if (e.type === 'boss' && e.invuln > 0) { if (quiet) return; this._floatText(e.x, e.y - 40, 'shielded', '#c9d1d9'); this._burst(e.x, e.y, '#fff', 1, 60); return; }
    if (this.onEnemyHit) this.onEnemyHit(e, dmg);
    // G-08 (b01-03): a world shooter hit while it holds its fire (off screen) is provoked for RM_PROVOKE_S: it may fire, and a
    // non-approaching type steps toward the hero until it is on screen. No farming from beyond the edge of the view.
    // Allocation-free (arena-p2-hotpath): a plain camera-rect test on numbers, no _nearest / _canFire / Math.hypot call per hit.
    if (this._holdFire && this.world && this.mode === 'world' && !this.dungeon && e.type !== 'boss') {
      const c = this.camera, ex = e.x, ey = e.y;
      if (ex < c.x - 24 || ex > c.x + this.W + 24 || ey < c.y - 24 || ey > c.y + this.H + 24) e.provT = RM_PROVOKE_S;
    }
    e.hp -= dmg; e.flash = 1;
    if (!quiet || e.hp <= 0) this._snd(e.hp > 0 ? 'hit' : 'kill'); // P2: a splashed (quiet) target that survives plays no extra 'hit' (the primary hit just played one; no voice per target)
    if (e.type === 'boss') {
      this._syncBoss();
      if (e.hp > 0) {
        const f = e.hp / e.maxHp; const want = f > 0.66 ? 1 : f > 0.33 ? 2 : 3;
        if (want > e.phase) { this._bossPhase(e, want); this._syncBoss(); }
        return;
      }
      if (this.world && this.world.onLethal && this.world.onLethal(e, dmg)) { e.hp = 1; return; } // B7: knocked out, not killed
      e.active = false; this._bossDefeated(e);
      if (this._bossArt && e._bn && this._bossArt.anim(e._bn, 'death', 'down')) this._bossGhost = { name: e._bn, x: e.x, y: e.y, t0: this.clock };
      if (this.onEnemyKilled) this.onEnemyKilled(e);
      return;
    }
    if (!quiet) {
      const dc = this._dmgColor(e, crit); this.lastDmgColor = dc; // S14 (test hook: the colour of the last enemy damage number)
      // P2: on the low graphics tier a plain (non-crit) number shows at most every RM_LOW_DMG_GAP s; crits always show. The rng draw is kept either way.
      const jx = (this.rng() - 0.5) * 14;
      if (crit || !this._lowGfx() || !(this._stT - (this._dmgTxtT === undefined ? -1e9 : this._dmgTxtT) < RM_LOW_DMG_GAP)) {
        if (!crit) this._dmgTxtT = this._stT;
        this._floatText(e.x + jx, e.y - 14, this._numTxt(Math.round(dmg * 10) / 10, crit ? -1 : 0), dc);
      } else this.dmgTxtSkipped = (this.dmgTxtSkipped || 0) + 1; // test hook
      this._burst(e.x, e.y, RM_ENEMIES[e.type].color, 3, 110);
    }
    if (e.hp > 0) return;
    if (this.world && this.world.onLethal && this.world.onLethal(e, dmg)) { e.hp = 1; return; } // B7: knocked out, not killed
    e.active = false;
    const def = RM_ENEMIES[e.type];
    if (this._edGhosts) this._spawnEnemyGhost(e, def);
    const gain = Math.max(1, Math.round(def.shards * (e.shardMul || 1) * this.stats.shards));
    this.run.kills += 1; this.run.shards += gain;
    this.save.kills += 1; this.save.shards += gain; this.save.kb[e.type] += 1;
    if (this.team) this.team.ev('rew', [def.shards, RM_XP[e.type] * (1 + 0.1 * Math.max(0, this.run.wave - 1)), e.type]);
    this._burst(e.x, e.y, def.color, 16, 230);
    if (this._fxPool) { if (e.type === 'spiral') this.fxPlay('fx_explosion_small', e.x, e.y, { w: 72 }); else this.fxPlay('fx_poof_death', e.x, e.y, { w: 64 }); }
    this._floatText(e.x, e.y - 22, `+${gain} 💎`, '#8fe9ff');
    // ID-01 Shore XP fade: only for a world kill in zone 0 (MMZones.shoreFade by the level being gained); rounded after, never below 1 XP
    const fade = this._shoreFadeOn && e.zone === 0 && typeof MMZones !== 'undefined' && MMZones.shoreFade ? MMZones.shoreFade(this.save.level, 0) : 1;
    const xpRaw = RM_XP[e.type] * (1 + 0.1 * Math.max(0, this.run.wave - 1)) * (e.xpMul || 1) * this.stats.xp;
    this._gainXp(fade < 1 ? Math.max(1, Math.round(xpRaw * fade)) : Math.round(xpRaw));
    if (fade < 1 && !this._shoreFadeToast) { this._shoreFadeToast = true; this._notice('The Midlands has better prey', '#ffe27a'); } // once per session, no number
    if (this.mode !== 'world' && this.rng() < RM_BAG_CHANCE) this.dropBag(e.x, e.y, this.rollRarity()); // a world rolls its own zone drops (onEnemyKilled)
    this.shake = Math.max(this.shake, 3);
    this.saveSoon(); // review F16: a splash that kills 8 in one frame persists once (a bag pickup, wave or death that follows persists at once anyway)
    if (this.dungeon) this.dungeon.onKill(e);
    if (this.onEnemyKilled) this.onEnemyKilled(e);
  }

  // ---------- G11 player splash (MMSplash kernel, GEAR-DROPS-BUILD-PLAN section d) ----------
  // The splash spec of one of YOUR bolts (never a partner's, a guest's, a duel's or a lobbed one), or null. A splash style (`bow_blast` ...) uses its
  // own {r, frac, inner, edge, max} plus the `blast` affix px; any other bolt splashes only with `blast` ({r 24 + px, frac .30, max 3}, from _calcStats).
  // Reuses one object (no per-hit allocation).
  _splashSpec(b) {
    if (!RM_SPLASH_ON || b.own || b.lb || (this.team && (this.team.isPvp || this.role === 'guest'))) return null;
    const st = this.stats, o = this._spS || (this._spS = { r: 0, frac: 0, inner: 0.35, edge: 0.5, max: 0 });
    const ws = b.ws && b.ws.splash && b.ws.splash.r > 0 ? b.ws.splash : null;
    if (ws) {
      const px = st.splashR > 24 ? st.splashR - 24 : 0; // the `blast` affix widens a splash style by its px
      o.r = Math.min(MMSplash.MAX_R, ws.r + px); o.frac = ws.frac; o.inner = ws.inner; o.edge = ws.edge; o.max = ws.max;
    } else if (st.splashFrac > 0 && st.splashR > 0 && st.splashMax > 0) {
      o.r = Math.min(MMSplash.MAX_R, st.splashR); o.frac = st.splashFrac; o.inner = MMSplash.DEF_INNER; o.edge = MMSplash.DEF_EDGE; o.max = st.splashMax;
    } else return null;
    return o.frac > 0 && o.max > 0 ? o : null;
  }
  // Splash around (x, y) after a primary hit on enemy `skip` for `hit` damage (crit included; each target's own status mods apply in _hitEnemy).
  // The nearest `max` (<= 6) active hostile enemies inside r take hit x frac x falloff; partners, the player, drifters and inactive pool slots never do
  // (only this.enemies is searched). A splashed enemy rolls the bolt's onHit status (or the venom bleed) at chance x its share. Returns the count.
  _splashAt(b, x, y, skip, hit, sp) {
    const E = this.enemies, n = E.length;
    if (!this._spX || this._spX.length < n) { const c = Math.max(64, n); this._spX = new Float32Array(c); this._spY = new Float32Array(c); this._spR = new Float32Array(c); this._spOk = new Uint8Array(c); this._spOut = new Int16Array(MMSplash.MAX_TARGETS); this._spD = new Float32Array(MMSplash.MAX_TARGETS); this._spF = new Float64Array(MMSplash.MAX_TARGETS); }
    const xs = this._spX, ys = this._spY, rs = this._spR, ok = this._spOk, out = this._spOut, dd = this._spD;
    for (let i = 0; i < n; i++) { const e = E[i]; const live = !!(e.active && e.hp > 0 && !e.tame); ok[i] = live ? 1 : 0; xs[i] = live ? e.x : 0; ys[i] = live ? e.y : 0; rs[i] = live ? this._er(e) : 0; }
    const k = MMSplash.pick(xs, ys, rs, n, x, y, sp, skip, out, ok);
    for (let j = 0; j < k; j++) dd[j] = MMSplash.dist[j]; // copied first: nothing below may touch the kernel's scratch
    const ff = this._spF || (this._spF = new Float64Array(MMSplash.MAX_TARGETS)); // P2: each target's falloff (float64: the same numbers as frac() returned)
    if (typeof MMSplash.fracInto === 'function') MMSplash.fracInto(dd, k, sp, ff); else for (let j = 0; j < k; j++) ff[j] = MMSplash.frac(dd[j], sp);
    let tot = 0, cnt = 0;
    for (let j = 0; j < k; j++) {
      const e = E[out[j]]; if (!e || !e.active) continue;
      const f = ff[j], dmg = hit * sp.frac * f;
      if (!(dmg > 0)) continue;
      if (b.ws && b.st > 0) this._wpnStatus(b, e, sp.frac * f); else if (this.stats.venom > 0) this._venomBleed(e, sp.frac * f);
      this._hitEnemy(e, dmg, false, true);
      tot += dmg; cnt++;
    }
    this.splashN = (this.splashN || 0) + 1; // test hooks; P2: lastSplash is one reused object (no per-hit allocation)
    const L = this.lastSplash || (this.lastSplash = { x: 0, y: 0, r: 0, n: 0, dmg: 0 }); L.x = x; L.y = y; L.r = sp.r; L.n = cnt; L.dmg = Math.round(tot * 100) / 100;
    if (++this._spFrame <= RM_SPLASH_FX) this._splashFx(x, y, sp.r, cnt, tot);
    return cnt;
  }
  // A `venom` bleed (3 s) on an enemy hit by a bolt whose style has no status of its own, at venom x scale (scale = its share on a splashed enemy).
  _venomBleed(e, scale) {
    if (!e || !e.active || !(this.stats.venom > 0)) return false;
    if (this.rng() >= Math.min(1, this.stats.venom * scale)) return false;
    return this.applyStatus(e, 'bleed', RM_VENOM_ST); // P2: a constant opts object (applyStatus only reads it)
  }
  // The ring (b29 `fx_splash_ring` art when loaded and two effect slots are free, else a cached code-drawn ring), the b18 small explosion for big
  // splashes (r >= 40, >= 4 free slots, never with reduced motion) and one combined orange number ("2.4 ×3"), rate-limited.
  _splashFx(x, y, r, cnt, tot) {
    const free = this._fxPool ? RM_FX_MAX - this.fxLive() : 0;
    const fo = this._spFxO || (this._spFxO = { w: 0 }); // P2: one reused fxPlay option object (fxPlay copies what it reads)
    fo.w = Math.max(24, r * 2);
    const art = free >= 2 && this._fx && this._fx.has('fx_splash_ring') && this.fxPlay('fx_splash_ring', x, y, fo);
    if (art) this.splashArtN = (this.splashArtN || 0) + 1; else this._splashRing(x, y, r);
    if (r >= 40 && free >= 4 && !this._reduced && this._fx && this._fx.has('fx_explosion_small')) { fo.w = 64; this.fxPlay('fx_explosion_small', x, y, fo); }
    const gap = this._lowGfx() ? RM_SPLASH_TXT_GAP * RM_LOW_TXT_MUL : RM_SPLASH_TXT_GAP; // P2: the low graphics tier shows fewer splash numbers
    if (cnt <= 0 || (this._spTxtT !== undefined && this._stT - this._spTxtT < gap)) return;
    let live = 0; for (let i = 0; i < this.texts.length; i++) if (this.texts[i].active) live++;
    if (live > RM_SPLASH_TXT_MAX) return;
    this._spTxtT = this._stT;
    this._floatText(x, y - 20, this._numTxt(Math.round(tot / cnt * 10) / 10, cnt), RM_SPLASH_COL);
  }
  _splashRing(x, y, r) {
    const P = this._spRings || (this._spRings = Array.from({ length: RM_SPLASH_RINGS }, () => ({ active: false, x: 0, y: 0, r: 0, t: 0, dur: 0.18 })));
    let q = P[0];
    for (let i = 0; i < P.length; i++) { if (!P[i].active) { q = P[i]; break; } if (P[i].t > q.t) q = P[i]; }
    q.active = true; q.x = x; q.y = y; q.r = r; q.t = 0; q.dur = this._reduced ? 0.15 : 0.18;
    this.splashRingN = (this.splashRingN || 0) + 1;
  }
  _splashRingTick(dt) { const P = this._spRings; if (!P) return; for (let i = 0; i < P.length; i++) { const q = P[i]; if (q.active) { q.t += dt; if (q.t >= q.dur) q.active = false; } } }
  // Code ring: one canvas per 8 px radius bucket (MMFxDraw.makeCache key `splash:<bucket>:<hex>`), blitted 0.6r -> r over 0.18 s; reduced motion: static.
  _drawSplashRings(g) {
    const P = this._spRings; if (!P) return;
    for (let i = 0; i < P.length; i++) {
      const q = P[i]; if (!q.active) continue;
      const k = this._reduced ? 1 : 0.6 + 0.4 * Math.min(1, q.t / q.dur), rr = q.r * k;
      const cv = this._splashCanvas(q.r);
      g.globalAlpha = Math.max(0, 1 - q.t / q.dur) * 0.9;
      if (cv) g.drawImage(cv, q.x - rr, q.y - rr, rr * 2, rr * 2);
      else { g.strokeStyle = RM_SPLASH_COL; g.lineWidth = 2; g.beginPath(); g.arc(q.x, q.y, rr, 0, Math.PI * 2); g.stroke(); }
      g.globalAlpha = 1;
    }
  }
  _splashCanvas(r) {
    if (typeof MMFxDraw === 'undefined' || typeof MMFxDraw.makeCache !== 'function') return null;
    if (!this._spCache) this._spCache = MMFxDraw.makeCache(MMFxDraw.defaultCreate, 16);
    const bk = Math.max(1, Math.min(10, Math.ceil(r / 8))), S = bk * 16 + 4;
    return this._spCache.get(`splash:${bk}:${RM_SPLASH_COL.slice(1)}`, S, S, (c) => { c.strokeStyle = RM_SPLASH_COL; c.lineWidth = 2; c.beginPath(); c.arc(S / 2, S / 2, S / 2 - 2, 0, Math.PI * 2); c.stroke(); c.globalAlpha = 0.25; c.fillStyle = RM_SPLASH_COL; c.fill(); c.globalAlpha = 1; });
  }

  // ---------- ID-06 assist (MMAssist, device pref 'mm-assist'): damage taken + aim help. Assisted runs still record bests, tagged ----------
  _assistOn() { return typeof MMAssist !== 'undefined' && !!MMAssist && typeof MMAssist.read === 'function'; }
  _assistPref() { try { return MMAssist.read(localStorage); } catch (e) { return { dmg: 100, aim: 0 }; } }
  refreshAssist() { this._wireRefresh(); if (this.run && this._assistOn() && MMAssist.isAssisted(this._assistPref())) this.run.assisted = true; return this.assistInfo(); }
  assistInfo() { const a = this._assistOn() ? this._assistPref() : { dmg: 100, aim: 0 }; return { dmg: a.dmg, aim: a.aim, cone: this._aimCone || 14, runAssisted: !!(this.run && this.run.assisted), bestWaveA: !!this.save.bestWaveA, bossBestTA: !!this.save.bossBestTA }; }
  // A new best keeps the run's tag; an unassisted run that ties the best clears it (the same score, now without assist).
  _setBestWave(w) {
    const sv = this.save; const as = !!(this.run && this.run.assisted);
    if (w > sv.bestWave) { sv.bestWave = w; if (as) sv.bestWaveA = 1; else delete sv.bestWaveA; } else if (w > 0 && w === sv.bestWave && !as) delete sv.bestWaveA;
  }
  _setBossBest(t) { const sv = this.save; sv.bossBestT = t; if (this.run && this.run.assisted) sv.bossBestTA = 1; else delete sv.bossBestTA; }

  _hitPlayer(dmg) {
    const p = this.player;
    const src = this._hitSrc; this._hitSrc = null; // set only by an enemy bolt; lava, slams and duel shots leave it null
    if (this.down) return; // already down: hazards must not reset the revive
    if (this.shield.hits > 0) { // Shield soaks the hit
      this.shield.hits -= 1; p.iframes = 0.25; this._burst(p.x, p.y, '#8fe9ff', 6, 140); this._floatText(p.x, p.y - 22, 'blocked', '#8fe9ff'); return;
    }
    let tk = this.buffTaken > 0 && this.buffTaken < 1 ? this.buffTaken : 1; // additive timed buff (world shrine of Warding)
    if (p._stm) tk = Math.max(0.5, Math.min(1.5, tk * p._stm.taken)); // status mods (armored / armorBroken / curse), capped 0.5..1.5
    if (tk !== 1) dmg = Math.max(1, Math.round(dmg * tk));
    let hpFloor = 0; // b08-r2-04: the first-run coach may soften hits ({ mult, floor }) so a new player never falls before they have played
    if (typeof this.hurtGuard === 'function') { let g = null; try { g = this.hurtGuard(dmg); } catch (e) { g = null; } if (g) { if (g.mult > 0 && g.mult < 1) dmg = Math.max(1, Math.round(dmg * g.mult)); if (g.floor > 0) hpFloor = Math.min(p.hp, g.floor); } }
    if (this._assistOn() && !(this.team && this.team.isPvp)) { // ID-06 damage taken (device pref mm-assist, read per hit so Settings apply at once; never in a duel)
      const as = this._assistPref();
      if (MMAssist.isAssisted(as)) { dmg = MMAssist.scaleDamage(dmg, as); this.run.assisted = true; }
    }
    p.hp = Math.max(hpFloor, p.hp - dmg);
    if (this._hitPauseOn && !this._reduced && dmg >= RM_HIT_PAUSE_FRAC * (this.stats.maxHp || 1)) this._hitPauseAt = this._lastT || 0; // ID-14: draw-only hold (see _loop)
    this._heroHurtAt = performance.now() / 1000; this._gHurtT = this._stT; // _gHurtT: game time of the last hit (G8 regen waits 3 s)
    this._snd('hurt');
    p.iframes = this.stats.iframes;
    this.flash = 1; this.shake = Math.max(this.shake, 8);
    this._burst(p.x, p.y, '#ff6f91', 8, 160);
    this._floatText(p.x, p.y - 22, `-${dmg}`, '#ff6f91');
    this._syncHud();
    if (p.hp <= 0) { this._felledBy = src ? this._boltOwnerName(src) : ''; this._downOrDie(); }
  }

  // cyc7 L: display name of the enemy that fired a bolt (fields written in fireEnemyBullet): the boss's own name, else the creature art id
  // made readable ('frost_wolf' -> 'Frost Wolf'), else the base kind (Whirler / Sniper / Burster). '' = unknown owner (no row on the card).
  _boltOwnerName(b) {
    if (!b || !b.ok) return '';
    if (typeof b.on === 'string' && b.on) return b.on.slice(0, 40);
    if (typeof b.oa === 'string' && b.oa) return b.oa.split('_').map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ').slice(0, 40);
    const d = RM_ENEMIES[b.ok]; return d ? d.name : '';
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
    this._setBestWave(this.run.wave);
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
    // G-09 (owner default O-06): the Survivor's cache needs effort: 3+ kills or 60 s alive since the last cache (shards are still never lost).
    // Counted per page visit (kills from save.kills, time from _cacheAliveT, which _update adds while you play).
    const kills = (sv.kills | 0) - (typeof this._cacheKAt === 'number' ? this._cacheKAt : (sv.kills | 0) - (this.run.kills | 0));
    if (kills < RM_CACHE_KILLS && (this._cacheAliveT || 0) < RM_CACHE_ALIVE_S) {
      this._cacheKAt = sv.kills | 0; this._cacheAliveT = 0;
      return { id: '', rarity: 0, text: 'no cache this time (3 kills or a minute alive earns one)', n: 0 };
    }
    this._cacheKAt = sv.kills | 0; this._cacheAliveT = 0;
    const rarity = w >= 6 ? 2 : w >= 3 ? 1 : 0;
    const def = RM_BASE_ITEMS[(sv.deaths + w) % RM_BASE_ITEMS.length]; const rar = RM_RARITIES[rarity];
    let text;
    let n = 0;
    if (sv.items.length >= RM_BACKPACK) { sv.shards += rar.sell; text = `pack full, cache sold +${rar.sell} 💎`; } else { n = sv.nextUid++; sv.items.push(rmTagged({ n, id: def.id, r: rarity })); text = `cache: ${def.icon} ${rar.name} ${def.name}`; }
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
    sv.shards -= price; sv.items.push(rmTagged({ n: sv.nextUid++, id, r }));
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
      this._shopTap(btn.dataset.buy, Number(btn.dataset.r));
    });
    const bpBody = document.getElementById('realm-backpack-body'); // the backpack carries a Shop button (the HUD row is full on phones); V works too
    if (bpBody) bpBody.addEventListener('click', (e) => {
      if (e.target.closest('button[data-open-shop]')) { this.setShop(true); return; }
      const cb = e.target.closest('button[data-combine]'); if (cb) this.combine(Number(cb.dataset.combine));
    });
    return (this._shopDom = wrap);
  }

  // cyc6: a tap on a Buy always answers in the panel (a refused Buy used to be a silent `disabled` button that looked live).
  _shopTap(id, r) {
    const sv = this.save; const def = RM_ITEM_BY_ID[id]; const rar = RM_RARITIES[r];
    if (!def || !rar) return false;
    const price = rar.sell * RM_SHOP_MULT; const n0 = sv.items.length;
    const ok = this.buy(id, r);
    this._shopMsg = ok ? `Bought ${rar.name} ${def.name}: it is in your backpack (${sv.items.length} / ${RM_BACKPACK}).`
      : n0 >= RM_BACKPACK ? 'Your backpack is full: sell or combine something first.'
        : sv.shards < price ? `You need ${price - sv.shards} more 💎 for the ${rar.name} ${def.name}.` : 'That is not for sale right now.';
    this.renderShop();
    const again = document.querySelector(`#realm-shop-body button[data-buy="${def.id}"][data-r="${r}"]`); // the re-render dropped focus: keep keyboard / pad users on the same row
    if (again && this._shopDom && !this._shopDom.contains(document.activeElement)) { try { again.focus({ preventScroll: true }); } catch (e) { /* focus is cosmetic */ } }
    return ok;
  }

  renderShop() {
    const root = document.getElementById('realm-shop-body'); if (!root) return;
    const sv = this.save; const full = sv.items.length >= RM_BACKPACK;
    const esc = (t) => String(t).replace(/[&<>"]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]));
    let html = `<div class="realm-bp-count rm-shop-top">You have ${sv.shards} 💎 · ${sv.items.length} / ${RM_BACKPACK} items${full ? ' · backpack full' : ''}<div id="realm-shop-msg" role="status" aria-live="polite">${esc(this._shopMsg || '')}</div></div><ul id="realm-bp-list" class="rm-shop-list">`;
    this.shopStock().forEach((o) => {
      const def = RM_ITEM_BY_ID[o.id]; const rar = RM_RARITIES[o.r]; const can = sv.shards >= o.price && !full;
      const why = full ? 'backpack full' : can ? '' : `need ${o.price - sv.shards} more shards`; // not `disabled`: a dead button swallows the tap, this one answers it
      html += `<li><span class="nm" style="color:${rar.color}">${this._icon(def)} ${def.name}</span><span class="rar">${rar.name}</span><span class="st">${this._itemText({ id: o.id, r: o.r })}</span><button type="button" class="eq${can ? '' : ' off'}" data-buy="${def.id}" data-r="${o.r}"${can ? '' : ' aria-disabled="true"'} aria-label="Buy ${rar.name} ${def.name} for ${o.price} shards${why ? ` (${why})` : ''}">Buy ${o.price}💎</button></li>`;
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
    this._setBestWave(this.run.wave - 1);
    const cache = this._deathBonus();
    this._lastCache = cache.text;
    if (this.onDeathCache) this.onDeathCache(cache);
    this.lastLoss = 0;
    this.state = 'dead';
    this._syncBoss(); // b01-07: hide the boss bar with the fall
    this.deadT = 2.6;
    this._snd('death'); // CHIP-AUDIO: the fall jingle (MMChip voice; old sfx.js recipes skip unknown names)
    this.shake = 14;
    this._burst(this.player.x, this.player.y, '#ff6f91', 30, 300);
    this._deathZone = this._worldCopy() ? this._zoneLabel() : '';
    const dg = this.dungeon && this.dungeon.api && typeof this.dungeon.api.fellText === 'string' ? this.dungeon.api.fellText : ''; // G-24 (b03-14): "You fell in the Crypt", no "wave" in a dungeon
    const fb = this._felledBy ? `  ·  felled by ${this._felledBy}` : ''; // cyc7 L: appended last, so every older banner match still holds
    this._showBanner(dg ? `${dg}…  no 💎 lost — ${cache.text}  ·  ${this.run.kills} kills, +${this.run.shards} 💎 this run${this.run.assisted ? '  ·  Assisted' : ''}${fb}` : `You fell in the Realm…  no 💎 lost — ${cache.text}  ·  ${this._deathZone ? `in ${this._deathZone}` : `wave ${Math.max(1, this.run.wave)}`}, ${this.run.kills} kills, +${this.run.shards} 💎 this run${this.run.assisted ? '  ·  Assisted' : ''}${fb}`, 2.6);
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
    if (up) this.onSave(this.save); else this.saveSoon(); // review F16: plain xp rides the coalesced kill save; a level-up persists at once
    this._syncHud();
  }

  _levelUp() {
    this._snd('levelup');
    const before = this.stats.maxHp;
    this.markStatsDirty(); this._calcStats();
    const p = this.player;
    p.hp = Math.min(this.stats.maxHp, p.hp + Math.round(this.stats.maxHp * 0.3) + (this.stats.maxHp - before)); // a level heals a bit and the new max HP is free
    this.shake = Math.max(this.shake, 4);
    this._burst(p.x, p.y, '#ffe27a', 28, 260);
    if (this._fxPool) this.fxPlay('fx_levelup', p.x, p.y, { follow: true, w: 112, oy: -8 });
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

  // gear (optional): { t, a?, sig? } of a tiered drop; null otherwise (pooled bags are reused, so a classic bag never keeps an earlier drop's tier, review F9).
  dropBag(x, y, rarity, itemId, worldLoot, gear) {
    const b = this._take(this.bags);
    if (!b) return null;
    b.active = true; b.x = x; b.y = y; b.t = 0; b.r = rarity; b.gear = gear && typeof gear === 'object' && !Array.isArray(gear) ? gear : null;
    b.tier = worldLoot?.tierIndex;
    b.lifetime = worldLoot?.lifetime || Infinity;
    b.id = this._wpnDrop(itemId || RM_BASE_ITEMS[Math.floor(this.rng() * RM_BASE_ITEMS.length)].id, worldLoot);
    const a = this.rng() * Math.PI * 2; b.vx = Math.cos(a) * 60; b.vy = Math.sin(a) * 60;
    if (this._fxPool) this.fxPlay('fx_loot_spawn', x, y, { w: 48 });
    if (rarity >= 2) this._snd('bag_rare'); // SF1 cue: a Rare-or-better bag appears (MMSfx rate-limits it)
    return b;
  }

  // Styled weapon drops (S12): in a world or dungeon run with an active hero, a rolled classic weapon (Spark / Quickfire Wand) becomes a
  // `wpn_<style>` item with a chance that grows with the bag tier; MMWeaponItems.dropItem picks it (70% the hero's family, 30% any).
  // Seeded (_wpnRng), rarity unchanged. Classic waves, duels, no hero, ?weapons=0 or a page without mm-weapon-items.js: the id is unchanged.
  _wpnDrop(id, worldLoot, rng) { // `rng` (optional function) replaces the shared _wpnRng stream, e.g. a per-chest seeded stream
    if (!RM_WPN_ITEMS.length || !(worldLoot || this.dungeon) || (this.team && this.team.isPvp) || typeof MMWeaponItems === 'undefined') return id;
    const def = RM_ITEM_BY_ID[id], cls = this.heroClass();
    if (!def || def.slot !== 'weapon' || def.wpn || !cls) return id;
    const tier = worldLoot && Number.isFinite(worldLoot.tierIndex) ? Math.max(0, Math.min(4, worldLoot.tierIndex)) : 1;
    const R = typeof rng === 'function' ? rng : this._wpnRng;
    if (R() >= Math.min(0.85, 0.45 + 0.1 * tier)) return id;
    let w = null; try { w = MMWeaponItems.dropItem(R, cls); } catch (e) { w = null; }
    return typeof w === 'string' && RM_ITEM_BY_ID[w] && RM_ITEM_BY_ID[w].wpn ? w : id;
  }

  // Picks an item up. A full backpack sells it on the spot for shards.
  // gear (optional, additive): { t, a?, sig? } of a tiered drop. The entry is built WITH them before onItem (the stash record) and the save write, so no
  // T0 copy of a tiered drop ever reaches storage or the stash (review F2). Cleaned like a stored item (rmCleanGear / rmCleanSig).
  // G-04 (b02-04/05, owner default O-06): is this drop worth more than a free slot? A tiered drop above the best tier held in its slot, a T12 chase
  // piece, or a signature / relic. Such a drop is never auto-sold by a full pack.
  _fullPackKeeps(id, gear, gt) {
    if (!gt) return false;
    if (gt >= 12 || (gear && gear.sig)) return true;
    if (RM_GEAR_ON && typeof MMGear !== 'undefined' && typeof MMGear.isSig === 'function' && MMGear.isSig(id)) return true;
    const sl = (RM_ITEM_BY_ID[id] || {}).slot; let best = 0;
    this.save.items.forEach((x) => { if (x && x.t && (RM_ITEM_BY_ID[x.id] || {}).slot === sl) best = Math.max(best, x.t); });
    return gt > best;
  }
  // A HUD toast for the full pack (the banner line, not a faint float text), at most once per 4 s.
  _fullPackToast(text) {
    const now = typeof performance !== 'undefined' ? performance.now() : Date.now();
    if (this._fullToastAt && now - this._fullToastAt < 4000) return false;
    this._fullToastAt = now; this.lastFullToast = text; // test hook
    try { this._showBanner(text, 2.5); } catch (e) { /* cosmetic */ }
    return true;
  }
  // collectItem(id, rarity, gear, fromBag) -> true when the drop was taken (into the pack, or sold by a full pack), false when an upgrade waits on the
  // ground for room (G-04). fromBag: the caller keeps its own bag on the ground; otherwise a direct grant (chest, rush) is dropped as a bag at the hero.
  collectItem(id, rarity, gear, fromBag) {
    const sv = this.save; const def = RM_ITEM_BY_ID[id]; const rar = RM_RARITIES[rarity];
    if (sv.items.length >= RM_BACKPACK) {
      // review F11: a full pack sells a tiered drop at its tiered value (rmSellValue, the same price the backpack's Sell button pays), never the classic one
      const gt = gear && typeof gear === 'object' && !Array.isArray(gear) ? rmCleanGear(id, rarity, gear).t : 0;
      if (this._fullPackKeeps(id, gear, gt)) { // G-04: an upgrade stays on the ground, nothing paid, nothing saved
        this._fullPackToast(`Backpack full: make room for ${def.name} T${gt}`);
        if (!fromBag && this.player) { const b = this.dropBag(this.player.x, this.player.y + 30, rarity, id, null, gear); if (b) { b.id = id; b.vx = 0; b.vy = 0; b.waitRoom = true; } }
        return false;
      }
      this._snd('pickup');
      const val = rmSellValue(gt ? { r: rarity, t: gt } : { r: rarity });
      sv.shards += val; this.lastFullSale = { id, r: rarity, t: gt, shards: val }; // test hook
      const ft = this._floatText(this.player.x, this.player.y - 24, `sold ${def.name} +${val} 💎`, rar.color); if (ft) ft.outline = '#0b0d1a'; // G-04: readable on grass
      this._fullPackToast(`Backpack full: sold ${def.name} +${val} 💎`);
    } else {
      this._snd('pickup');
      const ent = rmTagged({ n: sv.nextUid++, id, r: rarity }); const prevBest = this._bestTierHeld();
      if (gear && typeof gear === 'object' && !Array.isArray(gear)) {
        const g = rmCleanGear(id, rarity, gear);
        if (g.t) { ent.t = g.t; if (g.a) ent.a = g.a; const sg = rmCleanSig(id, g.t, g.a, gear.sig); if (sg) ent.sig = sg; }
      }
      sv.items.push(ent);
      this._itemText2(this.player.x, this.player.y - 24, id, rarity, def.name, def.icon, rar.color);
      this._burst(this.player.x, this.player.y, rar.color, 10, 150);
      if (this.onItem) this.onItem(sv.items[sv.items.length - 1]);
      this._chaseNewItem(ent, prevBest);
    }
    this.onSave(this.save);
    this._syncHud(); if (this.paused) this.renderBackpack();
    return true;
  }

  _updateBags(dt) {
    const p = this.player;
    for (let i = 0; i < this.bags.length; i++) {
      const b = this.bags[i];
      if (!b.active) continue;
      if (b.waitRoom && Number.isFinite(b.lifetime) && Math.hypot(p.x - b.x, p.y - b.y) < 240) b.t = Math.min(b.t, Math.max(0.3, b.lifetime - 10)); // G-04: never vanishes while you stand by it
      b.t += dt;
      if (b.t >= b.lifetime) { b.active = false; b.gear = null; b.waitRoom = false; continue; } // review F9: an inactive bag never keeps its tier
      b.x += b.vx * dt; b.y += b.vy * dt; b.vx *= 0.93; b.vy *= 0.93;
      b.x = Math.max(14, Math.min(this._bw() - 14, b.x)); b.y = Math.max(14, Math.min(this._bh() - 14, b.y));
      const dx = p.x - b.x; const dy = p.y - b.y; const d = Math.hypot(dx, dy) || 1;
      const full = this.save.items.length >= RM_BACKPACK;
      if (b.waitRoom && !full) b.waitRoom = false; // room again: the bag behaves like any other
      if (b.waitRoom) { // G-04: an upgrade waiting for room does not drift into you, and does not vanish while you stand near it
        if (d < 20 && !this.down) this._fullPackToast(`Backpack full: make room for ${(RM_ITEM_BY_ID[b.id] || {}).name || 'this item'}`);
        continue;
      }
      if (b.t > 0.4 && d < 110) { const k = (230 * dt) / d; b.x += dx * k; b.y += dy * k; } // bags drift toward you
      if (b.t > 0.25 && d < 20 && !this.down) { // the tier goes INTO the pickup (a full pack sells it at its tiered value, review F11)
        const g = b.gear; b.active = false;
        if (this.collectItem(b.id, b.r, g || undefined, true) === false) { b.active = true; b.waitRoom = true; continue; } // G-04: kept on the ground, tier and all
        b.gear = null; continue;
      }
      const q = this.team && this.role === 'host' && this.team.partner && this.team.partner.ready && !this.team.partner.down ? this.team.partner : null;
      // `loot` stays [id, r] (the wire format never carries t / a / sig). Review F9, the choice: a TIERED bag (b.gear) is never handed to a partner at all, so a
      // T12 can never arrive there as a T0 copy and soulbound gear never crosses; each seat rolls its own tiered drops locally (seeded per seat). Armor too.
      if (q && b.t > 0.25 && !b.gear && !RM_ARM_ID.test(b.id) && Math.hypot(q.x - b.x, q.y - b.y) < 20) { b.active = false; this.team.ev('loot', [b.id, b.r], 1); }
    }
  }

  // ---------- abilities ----------

  abilityUnlocked(i) { return this.save.level >= this._ab(i).level; }

  cast(i) {
    if (!this.active || this.state === 'dead' || this.paused) return false;
    const ab = this._ab(i);
    if (!ab || !this.abilityUnlocked(i) || this.abilityCd[i] > 0) return false;
    if (this.team && this.team.isPvp && ab.id !== 'dash') return false; // duels allow only the Dash
    const f = this._focusSync(); let paid = null; // FO2: short on focus = the bar flashes and nothing is cast (the cooldown is not started)
    if (f) { paid = MMFocus.spend(f, RM_FOCUS_ID[ab.id] || 'signature'); if (!paid.ok) { this._focusShort(); return false; } }
    const p = this.player;
    if (paid) { this.focus = paid.state; this._focusHud(true); }
    if (ab === this._sigAb) this._castSignature();
    else if (ab.id === 'dash') {
      let dx = this._mx || 0; let dy = this._my || 0;
      if (Math.hypot(dx, dy) < 0.1) { dx = Math.cos(p.aim); dy = Math.sin(p.aim); }
      const len = Math.hypot(dx, dy) || 1;
      this._burst(p.x, p.y, '#8fe9ff', 8, 120);
      const sx0 = p.x, sy0 = p.y;
      const wdm = this.world && this.world.dashMul ? Number(this.world.dashMul()) : 1; const dk = wdm > 0 ? Math.max(0.25, Math.min(3, wdm)) : 1; // B7: a mount's dash scale (1 = unchanged)
      if (this._coll()) { const ns = Math.round(15 * dk); for (let k = 0; k < ns; k++) this._movePlayer((dx / len) * 10, (dy / len) * 10); } // stepwise so a dash cannot tunnel through a wall
      else {
        p.x = Math.max(RM_PLAYER.r, Math.min(this._bw() - RM_PLAYER.r, p.x + (dx / len) * 150 * dk));
        p.y = Math.max(RM_PLAYER.r, Math.min(this._bh() - RM_PLAYER.r, p.y + (dy / len) * 150 * dk));
      }
      this._fxDashTrail(sx0, sy0);
      p.iframes = Math.max(p.iframes, 0.4);
    } else if (ab.id === 'nova') {
      const nb = this._novaBolts();
      for (let k = 0; k < nb; k++) this.firePlayerBullet((k / nb) * Math.PI * 2);
      this.shake = Math.max(this.shake, 3);
      if (this._fxPool) this.fxPlay(this.heroClass() === 'frostcaller' || this._boltCls === 'frostcaller' ? 'fx_blizzard_ring' : 'fx_slam_ring', p.x, p.y, { w: 128 });
    } else if (ab.id === 'shield') {
      this.shield.hits = 3; this.shield.t = 6;
      if (this._fxPool) this.fxPlay('fx_shield_up', p.x, p.y, { follow: true, w: 80 });
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

  // Dash trail: a horizontal strip laid along the dash line (rotated to the heading), centred between where the hero left and where they landed.
  _fxDashTrail(sx, sy) {
    if (!this._fxPool) return;
    const p = this.player, len = Math.hypot(p.x - sx, p.y - sy); if (len < 8) return;
    this.fxPlay('fx_dash_trail', (sx + p.x) / 2, (sy + p.y) / 2, { w: Math.max(64, len + 24), h: 48, rot: Math.atan2(p.y - sy, p.x - sx) });
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

  // ---------- focus (FO2, MMFocus): a blue bar under HP; Nova/Shield/Overdrive/Signature cost focus, the Dash is free ----------
  // On only with MMFocus loaded, an active Mad Maze hero, no ?focus=0 and never in duels. Off = null state = today's cooldown-only play.
  _focusOn() { return !this._focusOff && typeof MMFocus !== 'undefined' && !!this._hu && !(this.team && this.team.isPvp); }
  // The live focus state for the active hero (made / resized on a hero or level change, keeping what you had), or null when off.
  _focusSync() {
    if (!this._focusOn()) { if (this.focus) { this.focus = null; this._focusHud(true); } return null; }
    const lv = Math.max(1, this.heroLevel()); const cls = this._hu.cls; let f = this.focus;
    if (!f || f.level !== lv || f.classId !== cls) {
      const n = MMFocus.create(cls, lv);
      if (f && f.classId === cls) n.cur = Math.min(n.max, f.cur);
      this.focus = f = n; this._focusHud(true);
    }
    return f;
  }
  // Regen in place (our own copy; no per-frame allocation). The HUD is touched at most 10x a second and only when the number changes.
  _focusTick(dt) {
    const f = this._focusSync();
    if (f && f.cur < f.max && this.state !== 'dead') f.cur = Math.min(f.max, f.cur + f.regen * Math.min(0.25, Math.max(0, dt)));
    this._fHudT += dt;
    if (this._fHudT >= 0.1) { this._fHudT = 0; this._focusHud(false); }
  }
  // Public hook for world pickups (RB3 / DP3): kind 'focus' (orb, +15) or 'potion_focus' (half the max). Returns true when focus is on.
  restoreFocus(kind) {
    const f = this._focusSync();
    if (!f) return false;
    this.focus = MMFocus.restore(f, kind); this._focusHud(true);
    return true;
  }
  // Test / debug hook: {on, cur, max, regen} (cur rounded to 0.1).
  focusState() { const f = this._focusSync(); return f ? { on: true, cur: Math.round(f.cur * 10) / 10, max: f.max, regen: f.regen } : { on: false, cur: 0, max: 0, regen: 0 }; }
  _focusShort() {
    this.focusShorts++;
    const d = this._ensureFocusDom(); if (!d) return;
    d.el.classList.remove('short'); void d.el.offsetWidth; d.el.classList.add('short'); // restart the flash
    clearTimeout(this._fShortTimer); this._fShortTimer = setTimeout(() => d.el.classList.remove('short'), 450);
  }
  // The bar: made by realm.js inside the overlay (the pages' HTML is unchanged), placed under #realm-hp from its rect.
  _ensureFocusDom() {
    if (this._fDom && this._fDom.el.isConnected) return this._fDom;
    if (typeof document === 'undefined') return null;
    const host = document.getElementById('realm-overlay') || (this.container && this.container.parentNode);
    if (!host) return null;
    let el = document.getElementById('realm-focus');
    if (!el) {
      el = document.createElement('div'); el.id = 'realm-focus'; el.className = 'hidden';
      el.setAttribute('role', 'meter'); el.setAttribute('aria-label', 'Focus'); el.setAttribute('aria-valuemin', '0');
      if (RM_UI_ART) {
        const ico = document.createElement('img'); ico.className = 'rf-ico mm-ico'; ico.alt = ''; ico.draggable = false; ico.setAttribute('aria-hidden', 'true');
        ico.addEventListener('error', () => ico.remove(), { once: true }); ico.src = RM_UI_ART + 'ui_stat_focus.png';
        el.appendChild(ico);
      }
      const bar = document.createElement('div'); bar.className = 'rf-bar';
      if (RM_UI_ART && /^[A-Za-z0-9_.:\/%-]+$/.test(RM_UI_ART)) bar.style.setProperty('--rf-frame', `url("${RM_UI_ART}ui_bar_focus_frame.png")`);
      const fill = document.createElement('div'); fill.id = 'realm-focus-fill'; bar.appendChild(fill);
      el.appendChild(bar);
      host.appendChild(el);
    }
    this._fDom = { el, fill: el.querySelector('#realm-focus-fill') };
    this._fShown = ''; this._fPlaceT = -9;
    return this._fDom;
  }
  _focusHud(force) {
    const f = this.focus;
    if (!f && !this._fDom) return;
    const d = this._ensureFocusDom(); if (!d) return;
    const on = !!f && this.active;
    const key = on ? `${Math.floor(f.cur)}/${f.max}` : 'off';
    if (key !== this._fShown || force) {
      this._fShown = key;
      d.el.classList.toggle('hidden', !on);
      if (on) {
        d.fill.style.width = `${(f.cur / f.max) * 100}%`;
        d.el.setAttribute('aria-valuemax', String(f.max)); d.el.setAttribute('aria-valuenow', String(Math.floor(f.cur)));
        d.el.title = `Focus ${Math.floor(f.cur)} / ${f.max}`;
      }
    }
    if (!on) return;
    let mask = 0; // which ability slots are short on focus right now (dimmed in the bar)
    for (let i = 0; i < 4; i++) { const ab = this._ab(i); const c = ab ? MMFocus.cost(RM_FOCUS_ID[ab.id] || 'signature') : 0; if (c > f.cur) mask |= 1 << i; }
    if (mask !== this._fMask) { this._fMask = mask; this._syncAbilities(); }
    if (force || this.clock - this._fPlaceT > 0.5 || this._fPlaceT > this.clock) { this._fPlaceT = this.clock; this._focusPlace(d.el); }
  }
  // Under the HP bar: same left edge and width, 2 px below it (DOM rects read at most twice a second).
  _focusPlace(el) {
    try {
      const hp = document.getElementById('realm-hp'); const host = el.parentNode;
      if (!hp || !host || !hp.getClientRects().length) return;
      const r = hp.getBoundingClientRect(); const hr = host.getBoundingClientRect();
      const l = `${Math.round(r.left - hr.left)}px`, t = `${Math.round(r.bottom - hr.top + 2)}px`, w = `${Math.round(r.width)}px`;
      if (el.style.left !== l) el.style.left = l;
      if (el.style.top !== t) el.style.top = t;
      if (el.style.width !== w) el.style.width = w;
    } catch (e) { /* layout only */ }
  }

  // ---------- telegraphs (TG3, MMTelegraph) ----------
  // A wind-up drawn over the LAST `windup` seconds of a volley's existing cooldown: nothing is delayed, added or removed, so bullet counts,
  // timings and the rng stream are exactly the same with ?telegraph=0. Solo world only (never the classic arena, dungeons, co-op or duels).
  _tgOn() { return !this._tgOff && typeof MMTelegraph !== 'undefined' && !!this.world && this.mode === 'world' && !this.dungeon && !this.team; }
  // Ring (Burster) and aimed (Sniper) volleys of tier 3+ world enemies (zone tier 0..3 -> 1..4: the Highlands and the Godlands).
  _tgStep(e, hold, p) {
    if (e.type !== 'aimed' && e.type !== 'ring') { e._tg = 0; return; }
    const tier = (Number(e.tier) || 0) + 1;
    this._tgSet(e, MMTelegraph.windupFor(tier, false), e.cd, e.type, hold, p);
  }
  // World bosses (bossTier > 0): phase 1 aimed fans (cone), phase 2 rings / aimed triples (whichever fires next), phase 3 rings.
  _tgBoss(e, hold, p) {
    if (!(e.bossTier > 0) || e.invuln > 0 || !e.active) { e._tg = 0; return; }
    let cd = e.cd2; let pat = 'fan';
    if (e.phase === 2) { if (e.cd < e.cd2) { cd = e.cd; pat = 'ring'; } else pat = 'aimed'; } else if (e.phase >= 3) pat = 'ring';
    this._tgSet(e, MMTelegraph.windupFor(0, true), cd, pat, hold, p);
  }
  _tgSet(e, w, cd, pattern, hold, p) {
    if (!(w > 0) || hold || !(cd > 0) || cd > w) { e._tg = 0; return; }
    const sc = this._tgCodes || (this._tgCodes = Object.create(null)); // pattern -> shape code, looked up once per pattern (no per-frame strings)
    const code = sc[pattern] || (sc[pattern] = RM_TG_CODE[MMTelegraph.shapeFor(pattern)] || 1);
    if (!e._tg) { // a new wind-up: count it and play the `warn` cue (at most every 0.6 s; a silent no-op until the cue exists)
      this.tgStarted++;
      if (this.clock - this._tgSndAt > 0.6 || this._tgSndAt > this.clock) { this._tgSndAt = this.clock; this._snd('warn'); }
    }
    e._tg = code; e._tgW = w; e._tgP = Math.max(0, Math.min(1, 1 - cd / w)); e._tgA = Math.atan2(p.y - e.y, p.x - e.x);
  }
  // The shared look (colour, alpha, pulse) from MMTelegraph.forVolley for the current palette / reduce-motion, made only when those change.
  _tgLook() {
    const pal = this.acc ? this.acc.palette : 'normal'; const red = !!this._reduced; const key = pal + (red ? '|r' : '');
    if (key !== this._tgDescKey || !this._tgDesc) { this._tgDescKey = key; this._tgDesc = MMTelegraph.forVolley('ring', 3, false, { reduced: red, palette: pal }); this._tgSpr = null; }
    return this._tgDesc;
  }
  _tgSprites(color) {
    if (this._tgSpr && this._tgSpr.color === color) return this._tgSpr;
    const mk = (w, h, draw) => { const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h); return c; };
    const ring = mk(128, 128, (g) => {
      g.globalAlpha = 0.16; g.fillStyle = color; g.beginPath(); g.arc(64, 64, 60, 0, Math.PI * 2); g.fill();
      g.globalAlpha = 1; g.strokeStyle = '#140a14'; g.lineWidth = 6; g.beginPath(); g.arc(64, 64, 59, 0, Math.PI * 2); g.stroke();
      g.strokeStyle = color; g.lineWidth = 3; g.beginPath(); g.arc(64, 64, 59, 0, Math.PI * 2); g.stroke();
    });
    const line = mk(256, 16, (g) => {
      g.fillStyle = '#140a14'; g.fillRect(0, 4, 238, 8); g.fillStyle = color; g.fillRect(1, 6, 236, 4);
      g.beginPath(); g.moveTo(236, 0); g.lineTo(256, 8); g.lineTo(236, 16); g.closePath(); g.fillStyle = '#140a14'; g.fill();
      g.beginPath(); g.moveTo(238, 3); g.lineTo(252, 8); g.lineTo(238, 13); g.closePath(); g.fillStyle = color; g.fill();
    });
    const cone = mk(256, 256, (g) => {
      g.beginPath(); g.moveTo(0, 128); g.arc(0, 128, 250, -RM_TG_CONE, RM_TG_CONE); g.closePath();
      g.globalAlpha = 0.18; g.fillStyle = color; g.fill(); g.globalAlpha = 1; g.strokeStyle = color; g.lineWidth = 3; g.stroke();
    });
    return (this._tgSpr = { color, ring, line, cone });
  }
  // Scale and alpha for one telegraph (into a reused object): pulsing = it grows / tightens and brightens with the wind-up;
  // static (reduce motion) = one fixed size and alpha for the whole wind-up.
  _tgShape(e, d) {
    const o = this._tgLk; const t = e._tgP;
    o.scale = d.pulse ? 1.6 - 0.6 * t : 1;
    o.alpha = d.pulse ? d.alpha * (0.45 + 0.55 * t) * (0.85 + 0.15 * Math.sin(this.clock * 24)) : d.alpha;
    o.len = d.pulse ? RM_TG_LINE * (0.35 + 0.65 * t) : RM_TG_LINE;
    return o;
  }
  _drawTelegraphs(g, vx0, vy0, vx1, vy1) {
    let n = 0;
    if (!this._tgOn()) { this.tgDrawn = 0; return; }
    const d = this._tgLook(); const spr = this._tgSprites(d.color);
    for (let i = 0; i < this.enemies.length; i++) {
      const e = this.enemies[i];
      if (!e.active || !e._tg || e.x < vx0 || e.x > vx1 || e.y < vy0 || e.y > vy1) continue;
      const o = this._tgShape(e, d); g.globalAlpha = Math.max(0, Math.min(1, o.alpha));
      if (e._tg === 1) { const R = (this._er(e) + 26) * o.scale; g.drawImage(spr.ring, e.x - R, e.y - R, R * 2, R * 2); }
      else {
        g.save(); g.translate(e.x, e.y); g.rotate(e._tgA);
        if (e._tg === 2) g.drawImage(spr.line, 0, -8, o.len, 16);
        else { const L = RM_TG_LINE * (d.pulse ? 0.6 + 0.4 * e._tgP : 1); g.drawImage(spr.cone, 0, -L / 2, L, L); }
        g.restore();
      }
      n++;
    }
    g.globalAlpha = 1; this.tgDrawn = n;
  }
  // Test / debug hook: the telegraph an enemy shows now, or null: {shape, windup, progress, color, pulse, scale, alpha}.
  telegraphOf(e) {
    if (!e || !e._tg || !this._tgOn()) return null;
    const d = this._tgLook(); const o = this._tgShape(e, d);
    return { shape: ['', 'ring', 'line', 'cone'][e._tg], windup: e._tgW, progress: e._tgP, color: d.color, pulse: d.pulse, scale: o.scale, alpha: d.pulse ? null : o.alpha, len: o.len };
  }

  // ---------- accessibility prefs (TG3, MMAccess.prefs / `pixeltown-access-v1`) ----------
  // Re-read once a second (the settings sheet writes the key; another tab fires `storage`): only parsed when the raw string changed.
  refreshAccess() {
    if (typeof MMAccess === 'undefined' || !MMAccess.prefs) { this.acc = null; this._ebCB = null; return null; }
    let raw = null; try { raw = localStorage.getItem(MMAccess.prefs.KEY); } catch (e) { raw = null; }
    if (raw === this._accRaw && this.acc) { if (this._ax2) { this._bakeCBBullets(); this._syncTxtFont(); } return this.acc; } // AR: a duel starting / ending flips the gate
    this._accRaw = raw;
    let pr = null; try { pr = MMAccess.prefs.load(localStorage); } catch (e) { pr = null; }
    this.acc = pr || MMAccess.prefs.defaults();
    this._bakeCBBullets(); this._syncTxtFont();
    return this.acc;
  }
  _flashesOn() { return !this.acc || this.acc.flashes !== false; }
  // Colour-blind enemy bullets: with a non-normal palette the three bullet kinds take its colours (aimed = `bullet`, spiral / ring =
  // `enemy`), with a 2 px dark outline while bulletOutline is on. Same 16 px sprites, same hit size; null = today's hues and art.
  // The normal palette with bulletOutline OFF bakes today's three hues with no dark rim (and no bolt art, which carries its own rim), so
  // the outline pref works on every palette. Baked once per pref change (3 canvases); the draw loop only picks a cached canvas.
  // AR: on a page that enabled access2 (never in a duel), a colour-blind palette or the Bullet shapes toggle gives each kind its own SHAPE too:
  // aimed = round dot, spiral = diamond, ring = hollow ring, each in the MMAccess palette colours with the outline following the shape.
  _bakeCBBullets() {
    const a = this.acc; const on = a && a.palette && a.palette !== 'normal';
    const shp = this._ax2On() && (on || this._shapes) && typeof MMAccess !== 'undefined' && typeof MMAccess.palette === 'function';
    const bare = !!(a && !on && !shp && a.bulletOutline === false);
    const key = shp ? `shape|${a ? a.palette : 'normal'}|${!a || a.bulletOutline ? 1 : 0}` : on ? `${a.palette}|${a.bulletOutline ? 1 : 0}` : bare ? 'normal|0' : '';
    if (key === this._ebCBKey) return;
    this._ebCBKey = key; this._ebCB = null;
    if (typeof document === 'undefined') return;
    const R = RM_BOLT_R.enemy;
    if (shp) {
      const pal = MMAccess.palette(a ? a.palette : 'normal'); const outline = !a || a.bulletOutline !== false;
      const path = (g, k, r) => {
        g.beginPath();
        if (k === 1) { g.moveTo(8, 8 - r); g.lineTo(8 + r, 8); g.lineTo(8, 8 + r); g.lineTo(8 - r, 8); g.closePath(); }
        else g.arc(8, 8, r, 0, Math.PI * 2);
      };
      this._ebCB = [pal.bullet, pal.enemy, pal.enemy].map((col, k) => {
        const c = document.createElement('canvas'); c.width = 16; c.height = 16; const g = c.getContext('2d');
        const r = k === 1 ? R + 1 : R; // the diamond's corners reach a little further so its area matches the dot
        g.fillStyle = col; path(g, k, r); g.fill();
        if (k === 2) { g.globalCompositeOperation = 'destination-out'; g.beginPath(); g.arc(8, 8, 2.6, 0, Math.PI * 2); g.fill(); g.globalCompositeOperation = 'source-over'; } // hollow ring
        if (outline) {
          g.strokeStyle = '#000'; g.lineWidth = pal.outlinePx || 2; path(g, k, r + 1); g.stroke();
          if (k === 2) { g.lineWidth = 1; g.beginPath(); g.arc(8, 8, 2.6, 0, Math.PI * 2); g.stroke(); }
        }
        return c;
      });
      return;
    }
    if (bare) {
      this._ebCB = this._ebHues().map(([hue, tint]) => {
        const c = document.createElement('canvas'); c.width = 16; c.height = 16; const g = c.getContext('2d');
        g.fillStyle = hue; g.beginPath(); g.arc(8, 8, R, 0, Math.PI * 2); g.fill();
        g.fillStyle = tint; g.beginPath(); g.arc(8, 8, 1.6, 0, Math.PI * 2); g.fill();
        return c;
      });
      return;
    }
    if (!on) return;
    const pal = MMAccess.palette(a.palette);
    this._ebCB = [pal.bullet, pal.enemy, pal.enemy].map((col, k) => {
      const c = document.createElement('canvas'); c.width = 16; c.height = 16; const g = c.getContext('2d');
      g.fillStyle = col; g.beginPath(); g.arc(8, 8, R, 0, Math.PI * 2); g.fill();
      if (k === 2) { g.fillStyle = 'rgba(0,0,0,0.35)'; g.beginPath(); g.arc(8, 8, 2.4, 0, Math.PI * 2); g.fill(); } // rings get a dark core: told apart by shape, not hue
      if (a.bulletOutline) { g.strokeStyle = '#000'; g.lineWidth = pal.outlinePx || 2; g.beginPath(); g.arc(8, 8, R + 1, 0, Math.PI * 2); g.stroke(); }
      return c;
    });
  }

  // ---------- class signature (F slot) ----------

  _sigDmg(mul) { return this.stats.dmg * (this.sg.powT > 0 ? this.sg.powMul : 1) * mul; }

  _sigHeal(n) {
    const p = this.player; if (this.down || n <= 0 || p.hp >= this.stats.maxHp || (p._stm && p._stm.noHeal)) return 0; // sick: no healing
    const got = Math.min(Math.round(n), this.stats.maxHp - p.hp); if (got <= 0) return 0;
    p.hp += got; this._floatText(p.x, p.y - 40, `+${got}`, '#7ee787'); if (this._fxPool) this.fxHeal(); this._syncHud(); return got;
  }

  _sigFx(x, y, r, color, sec) { const f = this.sg.fx; f.x = x; f.y = y; f.r = r; f.color = color; f.t = f.max = sec; }

  // Damage every live enemy within r of (x, y); returns the damage actually dealt (capped by remaining hp) for drain heals.
  _sigAoe(x, y, r, dmg, knock, slow, slowSec) {
    let dealt = 0;
    for (let i = 0; i < this.enemies.length; i++) {
      const e = this.enemies[i]; if (!e.active) continue;
      const er = this._er(e); const dx = e.x - x; const dy = e.y - y; const rr = r + er;
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
      const sx0 = p.x, sy0 = p.y;
      if (this._coll()) { for (let k = 0; k < 15; k++) this._movePlayer((dx / len) * (s.dist / 15), (dy / len) * (s.dist / 15)); }
      else { p.x = Math.max(RM_PLAYER.r, Math.min(this._bw() - RM_PLAYER.r, p.x + (dx / len) * s.dist)); p.y = Math.max(RM_PLAYER.r, Math.min(this._bh() - RM_PLAYER.r, p.y + (dy / len) * s.dist)); }
      p.iframes = Math.max(p.iframes, s.variant === 'smoke' ? 0.8 : 0.5);
      this._fxDashTrail(sx0, sy0);
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
      if (this._fxPool) this.fxPlay('fx_shield_up', p.x, p.y, { follow: true, w: 80 });
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
        const rr = this._er(e) + 8;
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
  // Cycle 5 L (b15-13): on the standalone page (menu mode) an open panel (Menu, backpack, board, heroes, shop) owns the shared
  // Back entry (MMNav.backLayer), so the browser / phone Back gesture closes the panel and the run goes on instead of the
  // page leaving for the Hub. Never in the Town gate (no menu mode there) and never inside an iframe (MMNav refuses).
  _backGuard(on, keepEntry) {
    const N = typeof window !== 'undefined' && this._menuMode ? window.MMNav : null;
    if (!N || !N.backLayer) return;
    // Cycle 6 L: the hero picker that opens by itself on a first visit (the player has not touched the page yet) takes NO Back
    // entry: Back on a screen you never touched leaves at once (a real browser skips such an entry anyway; a scripted one did not).
    if (on && this.panel === 'hero') { try { const ua = navigator.userActivation; if (ua && !ua.hasBeenActive) { N.backRelease('realm-panel', keepEntry === true); return; } } catch (e) { /* older browsers: guard as before */ } }
    try { if (on) N.backLayer('realm-panel', () => { if (this.panel) this._panel(null); }); else N.backRelease('realm-panel', keepEntry === true); } catch (e) { /* history unavailable */ }
  }
  // Cycle 6 L: the fall card owns the Back entry too. Back = "Try again" (the card closes, a fresh run starts, the player stays in
  // the Realm); the next Back leaves as usual. Leave keeps the entry (stop() never hides the card), so Leave is never pulled back.
  _deathGuard(on) {
    const N = typeof window !== 'undefined' && this._menuMode ? window.MMNav : null;
    if (!N || !N.backLayer) return;
    try { if (on) N.backLayer('realm-death', () => { if (this._deathShown && this.active) this.restart(); }); else N.backRelease('realm-death'); } catch (e) { /* history unavailable */ }
  }

  _panel(name, keepEntry) {
    if (name && this.state === 'dead') return; // no panels while the death message runs (it would freeze the exit)
    const prev = this.panel || null;
    this._panelSet(name);
    this._backGuard(!!name, keepEntry);
    if (prev !== (name || null)) this._snd(name ? 'ui_open' : 'ui_close'); // CHIP-AUDIO: panel open / close blips (rate-limited by MMSfx)
    if (this.onPanel && prev !== (name || null)) { try { this.onPanel(name || null, prev); } catch (e) { /* a page hook never breaks the panels */ } } // optional page hook (realm-world: Nexus return)
  }

  _panelSet(name) {
    this.panel = name;
    this.paused = !!name && !this.team; // a shared run never freezes (it would time the partner out)
    const bp = document.getElementById('realm-backpack'); if (bp) bp.classList.toggle('hidden', name !== 'bp');
    const bd = document.getElementById('realm-board'); if (bd) bd.classList.toggle('hidden', name !== 'board');
    if (this._menuDom || name === 'menu') { const mn = this._ensureMenuDom(); if (mn) { mn.classList.toggle('hidden', name !== 'menu'); mn.style.display = name === 'menu' ? 'flex' : 'none'; if (name !== 'menu') this._menuConfirm(false); } }
    const shopEl = this._ensureShopDom(); if (shopEl) { shopEl.classList.toggle('hidden', name !== 'shop'); shopEl.style.display = name === 'shop' ? 'flex' : 'none'; }
    const heroEl = document.getElementById('realm-hero'); if (heroEl) { heroEl.classList.toggle('hidden', name !== 'hero'); heroEl.style.display = name === 'hero' ? 'flex' : 'none'; } // hero picker / stats (mad-maze.js owns the DOM)
    if (name === 'hero') { this.keys = {}; this.mouse.down = false; this.aimVec.on = false; if (this.onHeroPanel) this.onHeroPanel(this._heroTab || 'pick'); return; }
    if (name) { this.keys = {}; this.mouse.down = false; this.aimVec.on = false; if (name === 'bp') this.renderBackpack(); else if (name === 'shop') { this._shopMsg = ''; this.renderShop(); } else if (name === 'menu') this._syncMenu(); else this.renderBoard(); }
  }

  setPaused(on) { this._panel(on ? 'bp' : null); } // false closes whichever panel is open

  setBoard(on) { this._panel(on ? 'board' : null); }
  // The off-screen hold-fire rule (world + phone dungeon slice). On by default; ?holdfire=0 starts with it off. Returns the new state.
  setHoldFire(on) { this._holdFire = on !== false; return this._holdFire; }
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
    const b = document.createElement('button'); b.id = 'realm-menu-btn'; b.type = 'button'; b.textContent = '☰'; b.setAttribute('aria-label', 'Open menu: heroes, restart, leave (Esc)'); b.title = 'Menu (Esc)';
    const lb = document.getElementById('realm-leave-btn'); hud.insertBefore(b, lb || null);
    b.addEventListener('click', () => this.setMenu(true));
    this._menuBtn = b;
  }

  setMenu(on) {
    if (!this._menuMode || !this.active) return;
    if (on && this.state === 'dead') return;
    if (on) this.flushSave(); // review F16: the menu (and its stash settle) sees what storage holds
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
      + '<div class="rm-main"><button type="button" class="rm-btn" data-m="resume">▶ Resume</button><button type="button" class="rm-btn" data-m="heroes">🦸 Pick hero</button><button type="button" class="rm-btn" data-m="herostats">📊 Hero stats</button><button type="button" class="rm-btn" data-m="restart">↻ Restart run</button><p class="rm-note dim"></p><p class="rm-stash dim hidden" aria-live="polite"></p><button type="button" class="rm-btn" data-m="leave">🚪 Leave</button></div>'
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
    d.querySelector('.rm-recap').innerHTML = `${waveRow}<div class="realm-board-row"><span>⚔️ Kills</span><b>${this.run.kills}</b></div><div class="realm-board-row"><span>💎 Shards this run</span><b>+${this.run.shards}</b></div><div class="realm-board-row"><span>🎁 Survivor's cache</span><b>${this._lastCache.replace(/^cache: /, '')}</b></div>${this.run.assisted ? '<div class="realm-board-row rm-assisted"><span>🛟 Run</span><b>Assisted</b></div>' : ''}`;
    if (!showWave) { const zb = d.querySelector('.rm-zone-row b'); if (zb) zb.textContent = this._deathZone || this._zoneLabel(); } // textContent: the zone name comes from the page
    const sn = this.menuNote ? String(this.menuNote() || '') : '';
    if (this._felledBy) { const fr = document.createElement('div'); fr.className = 'realm-board-row rm-felled-row'; const a = document.createElement('span'); a.textContent = '💥 Felled by'; const v = document.createElement('b'); v.textContent = this._felledBy; fr.appendChild(a); fr.appendChild(v); const rc = d.querySelector('.rm-recap'); rc.insertBefore(fr, rc.firstChild); } // textContent: boss names come from the page
    if (sn) { const row = document.createElement('div'); row.className = 'realm-board-row rm-stash-row'; row.textContent = sn; d.querySelector('.rm-recap').appendChild(row); }
    d.classList.remove('hidden'); d.style.display = 'flex'; this._deathGuard(true);
    const f = d.querySelector('button[data-d="again"]'); if (f && f.focus) f.focus({ preventScroll: true });
  }

  _hideDeath() { const d = this._deathDom; if (d) { d.classList.add('hidden'); d.style.display = 'none'; this._deathGuard(false); } }

  renderBoard() {
    const root = document.getElementById('realm-board-body');
    if (!root) return;
    const sv = this.save; const kb = sv.kb;
    const t = sv.bossBestT ? `${(sv.bossBestT / 10).toFixed(1)} s` : '—';
    const rows = [
      ['🏆', 'Best wave', sv.bestWave + (sv.bestWaveA ? ' (Assisted)' : '')], ['⭐', 'Level', sv.level], ['💎', 'Shards banked', sv.shards], ['☠️', 'Falls', sv.deaths],
      ['🟣', 'Whirlers', kb.spiral], ['🔺', 'Snipers', kb.aimed], ['🟠', 'Bursters', kb.ring], ['✨', 'Wanderers', kb.drifter],
      ['👹', 'Gloomheart defeated', kb.boss], ['⏱️', 'Fastest Gloomheart', t],
    ];
    root.innerHTML = rows.map(([i, l, v]) => `<div class="realm-board-row"><span>${i} ${l}</span><b>${v}</b></div>`).join('');
  }

  equip(uid) {
    const it = this.save.items.find((x) => x.n === uid);
    if (!it) return false;
    const slot = RM_ITEM_BY_ID[it.id].slot;
    if (RM_SLOTS.indexOf(slot) < 0) return false; // inert wpn_ / arm_ item from a newer build (or ?gear=0): kept, never equipped
    if (this.save.eq[slot] !== uid && RM_ITEM_BY_ID[it.id].wpn && !this._wpnCanEquip(RM_ITEM_BY_ID[it.id])) return false; // styled weapon: the hero's family only
    if (this.save.eq[slot] !== uid && !this._gearOk(it)) return false; // G7: armor by class family (MMGear), tiers by heroGateLevel(); unequipping is always allowed
    if (this.save.eq[slot] === uid) delete this.save.eq[slot]; else this.save.eq[slot] = uid;
    this._afterGearChange();
    return true;
  }

  // Fuse RM_COMBINE_COUNT identical items (same gear + rarity) into ONE of the next rarity: +50%..+80% of the stat. The item you clicked survives upgraded.
  combinable(uid) {
    const it = this.save.items.find((x) => x.n === uid);
    if (!it || it.r >= RM_RARITIES.length - 1 || RM_ITEM_BY_ID[it.id].inert) return null;
    const group = this.save.items.filter((x) => x.id === it.id && x.r === it.r && (x.t || 0) === (it.t || 0)); // tiered gear: the same tier too (the survivor keeps its own `a`)
    return group.length >= RM_COMBINE_COUNT ? { keep: it, group } : null;
  }

  combine(uid) {
    const c = this.combinable(uid); if (!c) return false;
    const sv = this.save;
    // The survivor is the equipped copy if there is one (so your damage goes up at once), else the one you clicked; spend unequipped copies first.
    const eqUids = new Set(RM_EQ_KEYS.map((sl) => sv.eq[sl]).filter(Boolean));
    c.keep = c.group.find((x) => eqUids.has(x.n)) || c.keep;
    const others = c.group.filter((x) => x !== c.keep).sort((a, b) => (eqUids.has(a.n) ? 1 : 0) - (eqUids.has(b.n) ? 1 : 0)).slice(0, RM_COMBINE_COUNT - 1);
    const gone = new Set(others.map((x) => x.n));
    sv.items = sv.items.filter((x) => !gone.has(x.n));
    RM_EQ_KEYS.forEach((slot) => { if (gone.has(sv.eq[slot])) delete sv.eq[slot]; });
    // review F4: the survivor is replaced by a FRESH uid entry one rarity up (like reforge), never changed in place: a tab still holding the old r would
    // otherwise see a uid collision in the cross-tab merge and keep both copies. Its t / a / sig / f and its slot are kept.
    const ki = sv.items.indexOf(c.keep); const old = c.keep.n;
    const n = Math.max(sv.nextUid || 1, 1 + sv.items.reduce((m, x) => Math.max(m, x.n), 0)); sv.nextUid = n + 1;
    c.keep = Object.assign({}, c.keep, { n, r: c.keep.r + 1, u: rmItemTag() }); // a new entry: a new UR tag
    if (c.keep.f) c.keep.f = { id: c.keep.f.id, v: c.keep.f.v };
    if (ki >= 0) sv.items[ki] = c.keep; else sv.items.push(c.keep);
    RM_EQ_KEYS.forEach((slot) => { if (sv.eq[slot] === old) sv.eq[slot] = n; });
    if (this._forgeUid === old) this._forgeUid = n;
    rmGearHintOwn(sv);
    this._snd('levelup');
    this._itemText2(this.player.x, this.player.y - 34, c.keep.id, c.keep.r, `${RM_RARITIES[c.keep.r].name}!`, RM_ITEM_BY_ID[c.keep.id].icon, RM_RARITIES[c.keep.r].color);
    this._afterGearChange();
    return true;
  }

  discard(uid) {
    const i = this.save.items.findIndex((x) => x.n === uid);
    if (i < 0) return false;
    const it = this.save.items[i];
    this.save.shards += rmSellValue(it);
    this.save.items.splice(i, 1);
    RM_EQ_KEYS.forEach((slot) => { if (this.save.eq[slot] === uid) delete this.save.eq[slot]; });
    rmGearHintOwn(this.save);
    this._afterGearChange();
    return true;
  }
  // G-03 (b02-02/03/12/14): Sell asks "Sure?" first for an item worth keeping: equipped, soulbound, a signature / relic piece, or the best tier owned
  // in its slot. Plain junk stays one click. discard(uid) itself is unchanged (one call sells: test hooks and other code paths).
  sellNeedsConfirm(uid) {
    const sv = this.save; const it = sv.items.find((x) => x.n === uid); if (!it) return false;
    if (RM_EQ_KEYS.some((sl) => sv.eq[sl] === uid)) return true;
    if (it.sig) return true;
    const G = RM_GEAR_ON && typeof MMGear !== 'undefined' ? MMGear : null;
    if (G && ((typeof G.isSig === 'function' && G.isSig(it.id)) || (it.t && typeof G.soulbound === 'function' && G.soulbound(it.t)))) return true;
    if (it.t) { const sl = (RM_ITEM_BY_ID[it.id] || {}).slot; let best = 0; sv.items.forEach((x) => { if (x.t && (RM_ITEM_BY_ID[x.id] || {}).slot === sl) best = Math.max(best, x.t); }); if (it.t >= best) return true; }
    return false;
  }
  // G-03 arm delay: after a backpack / forge re-render every action button is inert for RM_ARM_MS, so the second click of a double-click (or a
  // double-tap) lands on a dead button instead of the row that slid under the pointer. Real `disabled` (keyboard Enter and the delegated
  // mad-maze.js handler respect it; Playwright waits for it). The look is kept (no 300 ms flash): the computed colours are pinned inline meanwhile.
  _armButtons(root) {
    if (!root || typeof setTimeout === 'undefined') return;
    const list = Array.from(root.querySelectorAll('#realm-bp-list button[data-act], #realm-bp-list button[data-combine], #realm-bp-list button.fg')).filter((b) => !b.disabled);
    const keep = list.map((b) => { const cs = getComputedStyle(b); const css = b.style.cssText; b.style.background = cs.background; b.style.color = cs.color; b.style.opacity = cs.opacity; b.disabled = true; b.dataset.arm = '1'; return css; });
    (this._armTs || []).forEach((t) => clearTimeout(t)); this._armTs = [];
    // b02-12: the destructive forge buttons (Salvage, Confirm salvage / reforge) wake after RM_FORGE_ARM_MS, and a click before then is ignored
    // even if it reaches the handler, so the second tap of a double-tap on "Confirm reforge" never lands on the Salvage under the finger.
    // cyc5 (b02-r3-01): Confirm salvage sleeps RM_FORGE_SAL_YES_MS after this render (the tap-chain rule is in _bindForge).
    const now = rmNowMs();
    const yesMs = Math.max(RM_FORGE_ARM_MS, RM_FORGE_SAL_YES_MS);
    const delay = (b) => (b.dataset.forgeYes === 'salvage' ? yesMs : b.dataset.forgeYes || b.dataset.forgeSalvage ? RM_FORGE_ARM_MS : RM_ARM_MS);
    this._forgeArmUntil = now + RM_FORGE_ARM_MS;
    this._forgeSalYesUntil = now + yesMs;
    const ds = list.map(delay);
    const wake = (ms) => {
      let focusEl = null;
      list.forEach((b, i) => { if (ds[i] !== ms || !b.isConnected || !b.dataset.arm) return; b.disabled = false; b.style.cssText = keep[i]; delete b.dataset.arm; if (b.dataset.armFocus) { delete b.dataset.armFocus; focusEl = b; } });
      if (focusEl) { try { focusEl.focus({ preventScroll: true }); } catch (e) { /* focus is cosmetic */ } }
    };
    Array.from(new Set(ds.concat([RM_ARM_MS, RM_FORGE_ARM_MS]))).forEach((ms) => this._armTs.push(setTimeout(() => wake(ms), ms)));
  }
  _focusArmed(el) { if (!el) return; if (el.disabled && el.dataset.arm) el.dataset.armFocus = '1'; else { try { el.focus({ preventScroll: true }); } catch (e) { /* focus is cosmetic */ } } }
  // First click on a protected Sell: the button turns into "Sure? Sell +N" for RM_SELL_ASK_MS (re-armed, so a double-click cannot confirm it);
  // the second click sells through the normal discard path. No click for 3 s restores it.
  _bindSellAsk(root) {
    if (!root || root.dataset.sellAskBound) return;
    root.dataset.sellAskBound = '1';
    root.addEventListener('click', (e) => {
      const b = e.target.closest && e.target.closest('button[data-act="sell-ask"]');
      if (!b || b.disabled) return;
      const uid = Number(b.dataset.uid); const it = this.save.items.find((x) => x.n === uid); if (!it) return;
      setTimeout(() => { // after every other click listener of this same click (mad-maze.js ignores 'sell-ask')
        if (!b.isConnected || b.dataset.act !== 'sell-ask') return;
        const label = b.textContent; const aria = b.getAttribute('aria-label') || '';
        b.dataset.act = 'discard'; b.textContent = `Sure? Sell +${rmSellValue(it)}💎`; b.setAttribute('aria-label', `Sure? Sell ${RM_ITEM_BY_ID[it.id].name} for ${rmSellValue(it)} shards`); b.classList.add('rm-sure');
        b.disabled = true; b.dataset.arm = '1';
        setTimeout(() => { if (b.isConnected && b.dataset.arm) { b.disabled = false; delete b.dataset.arm; } }, RM_ARM_MS);
        setTimeout(() => { if (b.isConnected && b.dataset.act === 'discard' && b.classList.contains('rm-sure')) { b.dataset.act = 'sell-ask'; b.textContent = label; b.setAttribute('aria-label', aria); b.classList.remove('rm-sure'); } }, RM_SELL_ASK_MS);
      }, 0);
    });
  }

  // ---------- Forge (GW): salvage for dust, deterministic reforge (MMGearForge). Free in-game dust + shards only; no randomness anywhere. ----------
  // Off with ?gear=0, without mm-gear-forge.js or while the GW gate is closed (RM_FORGE_ON: on by default since P2; ?forge=0 closes it): no Forge section,
  // nothing creates `dust` / `f`, and the ones already saved are kept (a forged `f` still counts in the stats).
  forgeOn() { return RM_GEAR_ON && RM_FORGE_ON && typeof MMGearForge !== 'undefined' && !!MMGearForge && typeof MMGearForge.salvage === 'function' && !(this.team && this.team.isPvp); }
  _forgeView(it) { const v = { n: it.n, id: it.id, r: it.r }; if (it.t) v.t = it.t; if (it.a) v.a = it.a; if (it.sig) v.sig = it.sig; if (it.f) v.f = it.f; return v; } // sig: review F5
  // salvageInfo(uid) -> { dust, t, r, soulbound } or null (any tiered item; soulbound ones too).
  salvageInfo(uid) {
    if (!this.forgeOn()) return null;
    const it = this.save.items.find((x) => x.n === uid);
    if (!it || !it.t) return null;
    let r = null; try { r = MMGearForge.salvage(this._forgeView(it)); } catch (e) { r = null; }
    return r && Number.isInteger(r.dust) && r.dust > 0 ? r : null;
  }
  // salvage(uid) -> the dust gained, or 0. The item leaves the backpack (and its slot).
  salvage(uid) {
    const info = this.salvageInfo(uid);
    if (!info) return 0;
    const sv = this.save; const i = sv.items.findIndex((x) => x.n === uid);
    if (i < 0) return 0;
    sv.items.splice(i, 1);
    RM_EQ_KEYS.forEach((slot) => { if (sv.eq[slot] === uid) delete sv.eq[slot]; });
    sv.dust = (sv.dust || 0) + info.dust;
    this._forgeUid = 0; this._forgeAsk = null;
    rmGearHintOwn(sv);
    this._afterGearChange();
    return info.dust;
  }
  // reforgeOptions(uid) -> [{ id, v, text, cost: { dust, shards }, current, afford }] (T7+ only; a signature affix is never offered) or null.
  reforgeOptions(uid) {
    if (!this.forgeOn() || typeof MMGearForge.reforgeOptions !== 'function') return null;
    const it = this.save.items.find((x) => x.n === uid);
    if (!it || !(it.t >= 7)) return null;
    let o = null; try { o = MMGearForge.reforgeOptions(this._forgeView(it)); } catch (e) { o = null; }
    if (!o) return null;
    const sv = this.save;
    return o.filter((x) => !(it.sig && x.id === it.sig)).map((x) => ({ id: x.id, v: x.v, text: x.text, cost: { dust: x.cost.dust, shards: x.cost.shards }, current: !!x.current, afford: (sv.dust || 0) >= x.cost.dust && sv.shards >= x.cost.shards }));
  }
  // reforge(uid, affixId) -> the new uid, or 0. Charges exactly the shown dust + shards once; the entry is replaced (a fresh uid, so the cross-tab merge
  // carries the new `f` like a new item) keeping t, a, sig and its slot.
  reforge(uid, affixId) {
    if (this.forgeOn()) this.resyncSave(); // FZ I6-dust: price it against what every tab has written (another tab may have spent this dust already)
    const opts = this.reforgeOptions(uid);
    const o = opts ? opts.find((x) => x.id === affixId) : null;
    if (!o || o.current || !o.afford) return 0;
    const sv = this.save; const i = sv.items.findIndex((x) => x.n === uid);
    if (i < 0) return 0;
    const it = sv.items[i];
    let nf = null; try { nf = MMGearForge.reforge(this._forgeView(it), affixId); } catch (e) { nf = null; }
    if (!nf || !nf.f || nf.f.id !== o.id) return 0;
    const n = sv.nextUid++;
    const ne = { n, id: it.id, r: it.r, u: rmItemTag(), t: it.t }; // a new entry: a new UR tag
    if (it.a) ne.a = it.a;
    if (it.sig) ne.sig = it.sig;
    ne.f = { id: nf.f.id, v: nf.f.v };
    const undo = this._dustTxnStart();
    sv.items[i] = ne;
    RM_EQ_KEYS.forEach((slot) => { if (sv.eq[slot] === uid) sv.eq[slot] = n; });
    sv.dust = (sv.dust || 0) - o.cost.dust; sv.shards -= o.cost.shards;
    if (!this._dustTxnCommit(undo)) return 0;
    // review F13: a pending Lantern find of the old uid moves to the new one (same id / r / t / a), so the next settle still pays it
    try { if (typeof MMStash !== 'undefined' && MMStash.renumberFindIn && typeof localStorage !== 'undefined') MMStash.renumberFindIn(localStorage, uid, n, ne); } catch (e) { /* storage blocked: the find stays as it was */ }
    this._forgeUid = n; this._forgeAsk = null;
    this._snd('levelup');
    this._afterGearChange(true);
    return n;
  }
  // FZ I6-dust: a dust spend is a transaction. The caller resyncs first (so the balance it checks is what storage holds plus this tab's own unsaved
  // delta), then the spend is written AT ONCE. If that write fails while storage holds a realm, the spend is undone: otherwise another tab could
  // spend the same dust from storage's balance, and the three-way merge (which never goes below 0) would hand out the difference for free.
  // With no readable storage at all (a page that saves elsewhere) no other tab can see this dust, so the spend stands as before.
  _dustTxnStart() { return JSON.parse(JSON.stringify(this.save)); }
  _dustTxnCommit(undo) {
    const ok = this.onSave(this.save);
    if (ok !== false || !rmReadStoredRealm()) return true;
    this._adopt(rmCleanSave(undo)); this.displayShards = this.save.shards;
    try { if (this.player) this._notice('Not saved (storage full): nothing was charged', '#ff9a8a'); } catch (e) { /* cosmetic */ }
    this._syncHud(); this.renderBackpack();
    return false;
  }
  // The Forge section of the open item (DOM + textContent only; 44 px targets). Built after the backpack list is rendered.
  _forgeDom(root) {
    if (!this.forgeOn() || !root) return;
    const sv = this.save;
    const mk = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text !== undefined) e.textContent = text; return e; };
    const btn = (text, data, label) => {
      const b = mk('button', 'fg', text); b.type = 'button';
      Object.keys(data).forEach((k) => { b.dataset[k] = String(data[k]); });
      if (label) b.setAttribute('aria-label', label);
      b.style.cssText = 'height:auto;min-height:44px;min-width:44px;max-width:100%;white-space:normal;text-align:left;padding:6px 10px;box-sizing:border-box;overflow-wrap:anywhere';
      return b;
    };
    const cost = (c) => `${c.dust} dust + ${c.shards} 💎`;
    const row = () => { const r = mk('div'); r.style.cssText = 'display:flex;flex-wrap:wrap;gap:6px'; return r; };
    sv.items.forEach((it) => {
      if (!it.t) return;
      const li = root.querySelector(`#realm-bp-list li[data-uid="${it.n}"]`);
      if (!li) return;
      const open = this._forgeUid === it.n;
      const tg = btn(open ? '⚒ Close forge' : '⚒ Forge', { forgeOpen: it.n }, open ? 'Close the forge' : 'Open the forge for this item');
      tg.setAttribute('aria-expanded', open ? 'true' : 'false'); tg.style.gridColumn = '1 / -1'; tg.style.justifySelf = 'start';
      const cmpEl = li.querySelector('.rm-cmp'); if (cmpEl) li.insertBefore(tg, cmpEl); else li.appendChild(tg); // above the hover / long-press compare line, so showing it never moves the toggle
      if (!open) return;
      const box = mk('div', 'rm-forge'); box.id = 'realm-bp-forge'; box.setAttribute('role', 'region'); box.setAttribute('aria-label', 'Forge');
      box.style.cssText = 'grid-column:1 / -1;display:flex;flex-direction:column;gap:6px;padding:8px;border-radius:8px;background:rgba(0,0,0,.35);font-size:12px;line-height:1.35;min-width:0;max-width:100%;box-sizing:border-box;overflow-wrap:anywhere';
      box.appendChild(mk('div', 'rm-forge-wallet', `You have ${sv.dust || 0} dust · ${sv.shards} 💎`));
      const ask = this._forgeAsk;
      const sal = this.salvageInfo(it.n);
      if (ask && ask.kind === 'salvage' && sal) {
        box.appendChild(mk('div', 'rm-forge-q', `Salvage this item for ${sal.dust} dust? It leaves your backpack.${sal.soulbound ? ' Soulbound items can be salvaged.' : ''}`));
        const r = row();
        r.appendChild(btn(`Confirm salvage +${sal.dust} dust`, { forgeYes: 'salvage', uid: it.n }));
        r.appendChild(btn('Cancel', { forgeNo: 1 }));
        box.appendChild(r);
      } else if (ask && ask.kind === 'reforge') {
        const o = (this.reforgeOptions(it.n) || []).find((x) => x.id === ask.id);
        if (o) {
          const prev = this._forgedOf(it);
          let pt = ''; try { pt = prev ? (MMGearAffix.describe([prev])[0] || '') : ''; } catch (e) { pt = ''; }
          box.appendChild(mk('div', 'rm-forge-q', `Forge ${o.text} onto this item for ${cost(o.cost)}?${pt ? ` It replaces the forged ${pt}.` : ''}`));
          const r = row();
          const yes = btn(`Confirm: pay ${cost(o.cost)}`, { forgeYes: 'reforge', uid: it.n, affix: o.id }); if (!o.afford || o.current) yes.disabled = true;
          r.appendChild(yes); r.appendChild(btn('Cancel', { forgeNo: 1 }));
          box.appendChild(r);
        }
      } else {
        if (sal) box.appendChild(btn(`Salvage for ${sal.dust} dust`, { forgeSalvage: it.n }, `Salvage for ${sal.dust} dust (asks first)`));
        const opts = this.reforgeOptions(it.n);
        if (opts && opts.length) {
          box.appendChild(mk('div', 'rm-forge-h', 'Reforge: add one forged affix (exact value and cost):'));
          const cheap = opts.filter((o) => !o.current).sort((x, y) => (x.cost.dust + x.cost.shards) - (y.cost.dust + y.cost.shards))[0]; // ID-40: which side is short (fixed income table)
          let hint = null; try { hint = cheap && !cheap.afford && typeof MMGearForge.shortHint === 'function' ? MMGearForge.shortHint(cheap.cost, { dust: sv.dust || 0, shards: sv.shards }) : null; } catch (e) { hint = null; }
          if (hint) { const h = mk('div', 'rm-forge-short dim', hint.text); h.title = 'Counted in Godlands kills with every bag salvaged'; box.appendChild(h); }
          opts.forEach((o) => {
            const b = btn(`${o.text} · ${cost(o.cost)}${o.current ? ' · forged now' : !o.afford ? ' · not enough' : ''}`, { forgePick: o.id, uid: it.n });
            b.dataset.dust = String(o.cost.dust); b.dataset.shards = String(o.cost.shards); b.dataset.v = String(o.v);
            if (o.current || !o.afford) b.disabled = true;
            box.appendChild(b);
          });
        } else if (it.t < 7) box.appendChild(mk('div', 'dim', 'Reforge opens at T7.'));
      }
      if (cmpEl) li.insertBefore(box, cmpEl); else li.appendChild(box);
    });
  }
  _bindForge(root) {
    if (!root || root.dataset.forgeBound) return;
    root.dataset.forgeBound = '1';
    root.addEventListener('click', (e) => {
      const b = e.target.closest && e.target.closest('button.fg');
      if (!b || b.disabled || !this.forgeOn()) return;
      const d = b.dataset;
      { // cyc5 (b02-r3-01): a tap chain starts on "Confirm reforge" and runs while taps keep coming less than RM_FORGE_RHYTHM_MS apart;
        // a Salvage / Confirm salvage tap inside it is ignored. Taps outside a chain (Forge, then Salvage) are not affected.
        const now = rmNowMs(), inChain = Number.isFinite(this._forgeChainAt) && now - this._forgeChainAt < RM_FORGE_RHYTHM_MS;
        if (inChain || d.forgeYes === 'reforge') this._forgeChainAt = now;
        if (inChain && (d.forgeSalvage || d.forgeYes === 'salvage')) return; }
      if ((d.forgeYes || d.forgeSalvage) && rmNowMs() < (this._forgeArmUntil || 0)) return; // b02-12: too soon after a re-render
      if (d.forgeYes === 'salvage' && rmNowMs() < (this._forgeSalYesUntil || 0)) return; // cyc5: too soon after the salvage ask opened
      if (d.forgeOpen) { const u = Number(d.forgeOpen); this._forgeUid = this._forgeUid === u ? 0 : u; this._forgeAsk = null; }
      else if (d.forgeSalvage) this._forgeAsk = { kind: 'salvage' };
      else if (d.forgePick) this._forgeAsk = { kind: 'reforge', id: d.forgePick };
      else if (d.forgeNo) this._forgeAsk = null;
      else if (d.forgeYes === 'salvage') { this.salvage(Number(d.uid)); return; }
      else if (d.forgeYes === 'reforge') { this.reforge(Number(d.uid), d.affix); return; }
      else return;
      this.renderBackpack();
      const nb = root.querySelector('#realm-bp-forge button.fg') || root.querySelector(`button.fg[data-forge-open="${this._forgeUid}"]`); // keep keyboard focus in the forge
      if (nb && nb.focus) this._focusArmed(nb); // G-03: an armed button takes focus once it wakes
    });
  }

  // ---------- Nexus vendor stall (VN, NEXT-SLICES-3 Wave 4): MMGearForge.vendorStock / buyBack, free in-game dust only ----------
  // A fixed T1-T3 list at fixed dust prices (never soulbound, nothing rolled, no timer, no rotation, no random pack, no real money). Buy-back pays
  // MMGearForge.BUYBACK_RATIO of the item's sell value in dust for T1-T3 items only. Follows the forge gate (forgeOn: ?forge=0 / ?gear=0 / duels: off).
  // No new save key: a bought item is a plain { n, id, r: 0, t } entry (t 1-3 needs no affix seed) and dust is the GW `dust` field.
  vendorOn() { return this.forgeOn() && typeof MMGearForge.vendorStock === 'function' && typeof MMGearForge.buyBack === 'function'; }
  // vendorStock() -> [{ id, t, r: 0, price, name, afford, room }] or null when the stall is off.
  vendorStock() {
    if (!this.vendorOn()) return null;
    const d = new Date(); const th = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + 4 - (d.getUTCDay() || 7))); // ISO week (the list does not depend on it)
    const wk = th.getUTCFullYear() + '-W' + String(Math.ceil(((th - Date.UTC(th.getUTCFullYear(), 0, 1)) / 864e5 + 1) / 7)).padStart(2, '0');
    let s = null; try { s = MMGearForge.vendorStock(wk); } catch (e) { s = null; }
    if (!Array.isArray(s)) return null;
    const sv = this.save; const dust = sv.dust || 0; const room = sv.items.length < RM_BACKPACK;
    return s.filter((o) => o && Object.prototype.hasOwnProperty.call(RM_ITEM_BY_ID, o.id) && Number.isInteger(o.t) && o.t >= 1 && o.t <= 3 && o.r === 0 && Number.isInteger(o.price) && o.price > 0)
      .map((o) => ({ id: o.id, t: o.t, r: 0, price: o.price, name: RM_ITEM_BY_ID[o.id].name, afford: dust >= o.price, room }));
  }
  // vendorBuy(id, t) -> the new item's uid, or 0. Charges exactly the listed dust once; refused without the dust or a free backpack slot.
  vendorBuy(id, t) {
    if (this.vendorOn()) this.resyncSave(); // FZ I6-dust: the balance every tab has written (see _dustTxnCommit)
    const o = (this.vendorStock() || []).find((x) => x.id === id && x.t === t);
    if (!o || !o.afford || !o.room) return 0;
    const undo = this._dustTxnStart();
    const sv = this.save; const n = Math.max(sv.nextUid || 1, 1 + sv.items.reduce((m, x) => Math.max(m, x.n), 0)); sv.nextUid = n + 1;
    sv.dust = (sv.dust || 0) - o.price;
    sv.items.push({ n, id: o.id, r: 0, u: rmItemTag(), t: o.t });
    if (!this._dustTxnCommit(undo)) return 0;
    this._snd('pickup');
    this._afterGearChange(true);
    return n;
  }
  // vendorBuyBackInfo(uid) -> { dust } or null (T1-T3 tiered items only; soulbound / T4+ / classic items are refused).
  vendorBuyBackInfo(uid) {
    if (!this.vendorOn()) return null;
    const it = this.save.items.find((x) => x.n === uid);
    if (!it || !it.t || it.t > 3) return null;
    let r = null; try { r = MMGearForge.buyBack(this._forgeView(it)); } catch (e) { r = null; }
    return r && Number.isInteger(r.dust) && r.dust > 0 ? { dust: r.dust } : null;
  }
  // vendorSellBack(uid) -> the dust paid, or 0. The item leaves the backpack (and its slot).
  vendorSellBack(uid) {
    const info = this.vendorBuyBackInfo(uid);
    if (!info) return 0;
    const sv = this.save; const i = sv.items.findIndex((x) => x.n === uid);
    if (i < 0) return 0;
    sv.items.splice(i, 1);
    RM_EQ_KEYS.forEach((slot) => { if (sv.eq[slot] === uid) delete sv.eq[slot]; });
    sv.dust = (sv.dust || 0) + info.dust;
    if (this._forgeUid === uid) { this._forgeUid = 0; this._forgeAsk = null; }
    rmGearHintOwn(sv);
    this._afterGearChange();
    return info.dust;
  }
  // openForge(): the backpack with the Forge section of a tiered item open (the equipped weapon first). false when the forge is off.
  openForge() {
    if (!this.forgeOn() || !this.active || this.state === 'dead') return false;
    const sv = this.save; const w = sv.items.find((x) => x.n === sv.eq.weapon && x.t);
    const it = w || sv.items.find((x) => x.t);
    this._forgeUid = it ? it.n : 0; this._forgeAsk = null;
    this._panel('bp');
    const f = typeof document !== 'undefined' ? document.querySelector('#realm-bp-forge button.fg') || document.getElementById('realm-bp-close') : null;
    if (f && f.focus) this._focusArmed(f);
    return true;
  }

  _afterGearChange(saved) { // saved: the caller has just written this change (a dust transaction), so no second write
    this.markStatsDirty(); this._calcStats();
    const p = this.player;
    p.hp = Math.min(this.stats.maxHp, p.hp); // swapping gear never heals (no free HP by toggling a charm); losing max HP just lowers the cap
    this.displayShards = this.save.shards;
    if (!saved) this.onSave(this.save);
    this._syncHud(); this.renderBackpack();
  }

  _statLine() {
    const st = this.stats; const bits = [`${st.maxHp} HP`, `${(Math.round(st.dmg * 10) / 10)} dmg`, `${(Math.round(st.rate * 10) / 10)} shots/s`, `${Math.round(st.speed)} speed`];
    if (this.heroProfile && this.heroProfile.name && !(this.team && this.team.isPvp)) bits.unshift(this.heroProfile.name);
    if (st.shards > 1) bits.push(`+${Math.round((st.shards - 1) * 100)}% 💎`);
    if (st.xp > 1) bits.push(`+${Math.round((st.xp - 1) * 100)}% xp`);
    // G11 gear stats (only when a piece gives them), each with its b29 stat icon
    const gi = (k) => this._gearIco('ui_stat_' + k);
    if (st.crit > 0) bits.push(`${gi('crit')}${Math.round(st.crit * 1000) / 10}% crit`);
    if (st.splashR > 0 && st.splashFrac > 0) bits.push(`${gi('splash')}splash ${Math.round(st.splashR)} px`);
    if (st.reach > 0) bits.push(`${gi('range')}+${Math.round(st.reach * 1000) / 10}% range`);
    if (st.resist > 0) bits.push(`${gi('resist')}${Math.round(st.resist * 100)}% resist`);
    if (st.leech > 0) bits.push(`${gi('leech')}${Math.round(st.leech * 1000) / 10}% leech`);
    if (st.regen > 0) bits.push(`${gi('regen')}${Math.round(st.regen * 10) / 10} HP/s regen`);
    return bits.join(' · ');
  }
  // A decorative b29 UI icon (16 px, aria-hidden: the text beside it carries the meaning); '' when off or the id is unknown. Load errors remove it.
  _gearIco(id) {
    if (!RM_GEAR_UI || !RM_GEAR_UI_RE.test(id) || !/^[A-Za-z0-9_.:\/%-]+$/.test(RM_GEAR_UI)) return '';
    return `<img class="rm-gear-ico mm-ico" src="${RM_GEAR_UI}${id}.png" alt="" aria-hidden="true" width="16" height="16" data-gico="${id}" style="vertical-align:-3px;margin-right:2px;image-rendering:pixelated">`;
  }
  // T7+ affix names under a tiered item's stat text, each with its b29 affix icon ('' below T7, without an affix seed or with gear off).
  _affixHtml(it, def) {
    if (!RM_GEAR_ON || !it || !(it.t >= 7) || typeof MMGearAffix === 'undefined' || !def || (def.slot !== 'weapon' && def.slot !== 'armor')) return '';
    const fg = this._forgedOf(it);
    let list = null; try { list = (it.a ? MMGearAffix.roll(it.id, def.slot, it.t, it.r, it.a, it.sig) : []).slice(); if (fg) list.push(fg); } catch (e) { list = null; }
    if (!list || !list.length) return '';
    const esc = (t) => String(t).replace(/[&<>"]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]));
    let h = '';
    list.forEach((x) => { let t = ''; try { t = (MMGearAffix.describe([x]) || [])[0] || ''; } catch (e) { t = ''; } if (t && /^[a-z]+$/.test(x.id)) h += `<span class="rm-afx-i" data-affix="${x.id}"${x === fg ? ' data-forged="1"' : ''} style="margin-right:6px;white-space:nowrap">${this._gearIco('ui_affix_' + x.id)}${x === fg ? '⚒ ' : ''}${esc(t)}${x === fg ? ' (forged)' : ''}</span>`; });
    return h ? `<span class="rm-afx" style="display:block;font-size:11px;opacity:.9">${h}</span>` : '';
  }

  _itemText(it) {
    const def = RM_ITEM_BY_ID[it.id];
    if (def.inert) return def.text;
    if (def.arm) { // G7 armor: its MMGear numbers
      let a = null; try { a = MMGear.armorStats(it.id, it.t, it.r); } catch (e) { a = null; }
      if (!a) return def.text;
      return [`+${a.hp} HP`, `+${a.guard} guard`].concat(a.speed ? [`${a.speed > 0 ? '+' : ''}${a.speed} speed`] : [], a.res > 0 ? [`${Math.round(a.res * 100)}% resist`] : []).join(' · ');
    }
    const tb = RM_GEAR_ON && it.t && def.stat === 'dmg' ? MMGear.weaponBonus(def.amount, it.t, it.r) : null;
    const v = tb !== null ? tb : def.amount * RM_RARITIES[it.r].mult;
    const num = def.pct ? `+${Math.round(v * 100)}%` : `+${Math.round(v * 10) / 10}`;
    return `${num} ${def.text}`;
  }

  // BP8: the backpack is one clean 8-bit panel. Top: hero name / class / level with HP and XP bars. Tabs (max 3): Gear (slots grid with tier
  // colour + letter/shape badges, the item list, shop, forge, dust), Stats (Power / Defense / Speed / Luck with a one-line meaning and the
  // +/- of the hovered or tapped item, the old stat line and the full Stats table drop-down), Relics ("Collections": the chase line + relic book).
  // Every id the old panel had is kept; nothing is removed, only regrouped. The open tab is remembered for this page only.
  bpTab(name) {
    if (name === 'gear' || name === 'stats' || name === 'relics') {
      const was = this._bpTabName || 'gear';
      this._bpTabName = name;
      if (was !== name && this._bpDeltaUid) { this._bpHoverUid = 0; this.bpShowDelta(0); } // b02-08: a Gear-tab compare never lingers on another tab
      const root = document.getElementById('realm-backpack-body');
      if (root) {
        root.querySelectorAll('[data-bp-tab]').forEach((b) => { const on = b.dataset.bpTab === name; b.setAttribute('aria-selected', on ? 'true' : 'false'); b.tabIndex = on ? 0 : -1; b.classList.toggle('on', on); });
        root.querySelectorAll('[data-bp-pane]').forEach((p) => { p.hidden = p.dataset.bpPane !== name; });
        const rp = name === 'relics' && root.querySelector('#realm-bp-pane-relics'); if (rp) this._chaseDom(rp, rp.querySelector('.rm-bp8-h')); // fresh pity numbers each visit
      }
    }
    return this._bpTabName || 'gear';
  }
  // The four plain stats (rounded), from a stats object.
  _bp4(st) {
    return {
      power: Math.round((Number(st.dmg) || 0) * 10) / 10,
      defense: Math.round(Number(st.maxHp) || 0) + Math.round((Number(st.guard) || 0) * 10) / 10,
      speed: Math.round(Number(st.speed) || 0),
      luck: Math.round((Number(st.crit) || 0) * 1000) / 10,
    };
  }
  // The +/- of wearing item uid instead of what is in its slot now (or of taking it off when worn): { power, defense, speed, luck }, or null.
  bpDelta(uid) {
    const sv = this.save; if (!sv) return null;
    const it = sv.items.find((x) => x.n === Number(uid)); const def = it && RM_ITEM_BY_ID[it.id]; if (!def || !def.slot || def.inert) return null;
    let a = null, b = null;
    try { a = this._calcStats({ eqOverride: {} }); const ov = {}; ov[def.slot] = sv.eq[def.slot] === it.n ? 0 : it.n; b = this._calcStats({ eqOverride: ov }); } catch (e) { return null; }
    const x = this._bp4(a), y = this._bp4(b), out = {};
    Object.keys(x).forEach((k) => { out[k] = Math.round((y[k] - x[k]) * 10) / 10; });
    return out;
  }
  _bpTopHtml() {
    const esc = (t) => String(t).replace(/[&<>"]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]));
    const sv = this.save, st = this.stats || {}, p = this.player;
    const pvp = !!(this.team && this.team.isPvp);
    const name = this.heroProfile && this.heroProfile.name && !pvp ? String(this.heroProfile.name).slice(0, 24) : 'Hero';
    const cls = this.heroClass(); const C = cls ? cls.charAt(0).toUpperCase() + cls.slice(1) : 'Adventurer';
    const mx = Math.max(1, Math.round(st.maxHp || 1)); const hp = Math.max(0, Math.min(mx, Math.round(p && Number.isFinite(p.hp) ? p.hp : mx)));
    const max = sv.level >= RM_MAX_LEVEL; const need = max ? 1 : rmXpNeeded(sv.level); const xp = max ? 1 : Math.max(0, Math.min(need, sv.xp || 0));
    const bar = (k, lab, v, m, txt) => `<div class="rm-bp8-bar ${k}" role="meter" aria-label="${lab}" aria-valuemin="0" aria-valuemax="${m}" aria-valuenow="${v}"><span class="lb">${lab}</span><span class="px-bar"><span style="width:${Math.round((v / m) * 100)}%"></span></span><span class="vl">${esc(txt)}</span></div>`;
    return `<div id="realm-bp-top" class="rm-bp8-top"><div class="who"><b class="nm">${esc(name)}</b><span class="cl">${esc(C)}</span><span class="px-badge lv">Lv ${sv.level}</span></div>`
      + bar('hp', 'HP', hp, mx, `${hp} / ${mx}`) + bar('xp', 'XP', xp, need, max ? 'MAX' : `${xp} / ${need}`) + '</div>';
  }
  // The stat block: four plain stats, each with a one-line meaning and (data-d) the +/- of the item being looked at.
  _bpStatBlockHtml() {
    const v = this._bp4(this.stats || {});
    const rows = [['power', 'Power', 'P', 'How hard each shot hits'], ['defense', 'Defense', 'D', 'How much hurt you can take'], ['speed', 'Speed', 'S', 'How fast you move'], ['luck', 'Luck', 'L', 'Chance of a critical hit (%)']];
    return `<div id="realm-bp-stat4" class="rm-bp8-stat4" aria-live="polite">${rows.map(([k, lab, ch, mean]) => `<div class="s4" data-s4="${k}"><span class="ic" aria-hidden="true">${ch}</span><span class="lb">${lab}</span><b class="vl">${v[k]}</b><span class="dd" data-d=""></span><span class="mn">${mean}</span></div>`).join('')}<div class="s4-for dim" id="realm-bp-stat4-for">Tap an item on the Gear tab to see its +/-</div></div>`;
  }
  // Fill the stat block's +/- for one item (uid) or clear it (0). The block shows on the Stats tab and as a strip on the Gear tab.
  bpShowDelta(uid) {
    const d = uid ? this.bpDelta(uid) : null; const it = d && this.save.items.find((x) => x.n === Number(uid)); const def = it && RM_ITEM_BY_ID[it.id];
    document.querySelectorAll('#realm-bp-stat4 [data-s4], #realm-bp-cmp4 [data-s4]').forEach((row) => {
      const k = row.dataset.s4, el = row.querySelector('.dd'); const n = d ? d[k] : 0;
      el.textContent = d && n ? (n > 0 ? '+' : '') + n : d ? '=' : '';
      el.dataset.d = d ? (n > 0 ? 'up' : n < 0 ? 'down' : 'same') : '';
    });
    const txt = def ? (this.save.eq[def.slot] === it.n ? 'Taking off: ' : 'Wearing: ') + def.name : 'Hover or tap an item to see its +/-';
    document.querySelectorAll('#realm-bp-stat4-for, #realm-bp-cmp4 .s4-for').forEach((f) => { f.textContent = !def && f.id === 'realm-bp-stat4-for' ? 'Tap an item on the Gear tab to see its +/-' : txt; }); // the Stats tab has no items to tap
    this._bpDeltaUid = d ? Number(uid) : 0;
    return d;
  }
  // A compact strip of the same four stats over the item list (Gear tab), so compare-on-tap needs no tab switch.
  _bpCmpStripHtml() {
    const v = this._bp4(this.stats || {});
    return `<div id="realm-bp-cmp4" class="rm-bp8-cmp4" aria-live="polite">${[['power', 'PWR'], ['defense', 'DEF'], ['speed', 'SPD'], ['luck', 'LCK']].map(([k, l]) => `<span class="s4" data-s4="${k}"><span class="lb">${l}</span><b class="vl">${v[k]}</b><span class="dd" data-d=""></span></span>`).join('')}<span class="s4-for dim">Hover or tap an item to see its +/-</span></div>`;
  }
  // A small badge: rarity letter in a rarity-shaped chip (shape + letter, never colour alone).
  _bpBadge(it) {
    const r = Math.max(0, Math.min(RM_RARITIES.length - 1, it.r | 0)); const rar = RM_RARITIES[r];
    return `<span class="rm-bp8-badge r${r}" style="--bc:${rar.color}" title="${rar.name}" aria-hidden="true">${rar.name.charAt(0)}</span>`;
  }
  _bindBpTabs(root) {
    if (!root || root.dataset.bpTabBound) return;
    root.dataset.bpTabBound = '1';
    root.addEventListener('click', (e) => {
      const t = e.target.closest && e.target.closest('[data-bp-tab]'); if (t) { this.bpTab(t.dataset.bpTab); return; }
      const row = e.target.closest && e.target.closest('#realm-bp-list li[data-uid]'); // compare-on-tap: a tap on a row (not on its buttons) shows its +/-
      if (row && !e.target.closest('button')) { const u = Number(row.dataset.uid); this.bpShowDelta(this._bpDeltaUid === u && !this._bpHoverUid ? 0 : u); this._bpHoverUid = 0; }
    });
    root.addEventListener('keydown', (e) => { // arrow keys move between the three tabs
      const t = e.target.closest && e.target.closest('[data-bp-tab]'); if (!t || (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft')) return;
      const order = ['gear', 'stats', 'relics']; const i = order.indexOf(t.dataset.bpTab); const n = order[(i + (e.key === 'ArrowRight' ? 1 : 2)) % 3];
      e.preventDefault(); e.stopPropagation(); this.bpTab(n); const nb = root.querySelector(`[data-bp-tab="${n}"]`); if (nb) nb.focus();
    });
    const look = (e) => { const row = e.target.closest && e.target.closest('#realm-bp-list li[data-uid]'); if (row && Number(row.dataset.uid) !== this._bpDeltaUid) { this.bpShowDelta(Number(row.dataset.uid)); this._bpHoverUid = Number(row.dataset.uid); } };
    root.addEventListener('mouseover', (e) => { if (!e.sourceCapabilities || !e.sourceCapabilities.firesTouchEvents) look(e); });
    root.addEventListener('focusin', look);
  }

  renderBackpack() {
    const root = document.getElementById('realm-backpack-body');
    if (!root) return;
    const sv = this.save;
    const eqUids = new Set(RM_SLOTS.map((sl) => sv.eq[sl]).filter(Boolean));
    const tab = this.bpTab();
    const tb = (k, lab) => `<button type="button" role="tab" class="rm-bp8-tab${tab === k ? ' on' : ''}" data-bp-tab="${k}" id="realm-bp-tab-${k}" aria-controls="realm-bp-pane-${k}" aria-selected="${tab === k ? 'true' : 'false'}" tabindex="${tab === k ? 0 : -1}">${lab}</button>`;
    let html = `<div class="rm-bp8">${this._bpTopHtml()}<div class="rm-bp8-tabs" role="tablist" aria-label="Backpack">${tb('gear', 'Gear')}${tb('stats', 'Stats')}${tb('relics', 'Relics')}</div>`;
    html += `<section id="realm-bp-pane-gear" class="rm-bp8-pane" data-bp-pane="gear" role="tabpanel" aria-labelledby="realm-bp-tab-gear"${tab === 'gear' ? '' : ' hidden'}>`;
    html += `<div class="realm-bp-slots rm-bp8-slots" data-n="${RM_SLOTS.length}">`;
    RM_SLOTS.forEach((slot) => {
      const it = sv.items.find((x) => x.n === sv.eq[slot]);
      const cw = !it && slot === 'weapon' ? this._classWeaponName() : ''; // PT2 #15: the class weapon the hero fires, not "weapon: empty"
      const tc = it && it.t && RM_GEAR_ON && typeof MMGear !== 'undefined' ? MMGear.TIER_COLORS[it.t - 1] || '' : '';
      html += `<div class="realm-bp-slot${it ? ' full' : ''}" data-slot="${slot}"${tc ? ` style="--tc:${tc}"` : it ? ` style="--tc:${RM_RARITIES[it.r].color}"` : ''}><span class="sl" aria-hidden="true">${slot}</span>${it ? `${this._bpBadge(it)}<span style="color:${RM_RARITIES[it.r].color}">${this._icon(RM_ITEM_BY_ID[it.id])} ${this._tierTag(it)}${RM_ITEM_BY_ID[it.id].name}</span>` : cw ? `<span class="rm-classwpn" title="Class weapon">${this._slotIcon('weapon')}${cw}</span>` : `<span class="dim">${slot === 'armor' ? this._slotIcon('armor') : ''}${slot}: empty</span>`}</div>`;
    });
    html += `</div><div class="rm-bp8-row"><div class="realm-bp-count">${sv.items.length} / ${RM_BACKPACK} items${this.forgeOn() ? ` · <span id="realm-bp-dust">✨ ${sv.dust || 0} dust</span>` : ''}</div><button type="button" class="eq" data-open-shop="1" aria-label="Open the shop (V)">🛒 Shop (V)</button></div>${this._bpCmpStripHtml()}<ul id="realm-bp-list">`;
    if (!sv.items.length) html += '<li class="dim">Nothing yet — defeat enemies to find loot bags.</li>';
    sv.items.forEach((it) => {
      const def = RM_ITEM_BY_ID[it.id]; const rar = RM_RARITIES[it.r]; const on = eqUids.has(it.n); const sell = rmSellValue(it); const why = on ? '' : this._gearWhy(it);
      const cbOk = this.combinable(it.n); // G-02: a row with a Combine button gets its own cell layout (li.cbr) so Combine never sits on top of Equip
      html += `<li data-uid="${it.n}" class="${on ? 'on' : ''}${cbOk ? ' cbr' : ''}"><span class="nm" style="color:${rar.color}">${this._bpBadge(it)}${this._icon(def)} ${this._tierTag(it)}${def.name}</span><span class="rar">${rar.name}</span><span class="st">${this._itemText(it)}</span>${this._affixHtml(it, def)}${def.slot === 'weapon' ? this._cmpHtml(it, on) : ''}${def.inert ? '<button type="button" class="eq" disabled aria-label="Not usable yet">Equip</button>' : def.wpn && !on && !this._wpnCanEquip(def) ? `<button type="button" class="eq" disabled data-wpn-lock="1" aria-label="${this._wpnHint(def)} only" title="${this._wpnHint(def)}">🔒 ${def.family.charAt(0).toUpperCase() + def.family.slice(1)}</button>` : why ? this._gearLockHtml(it, def, why) : `<button type="button" class="eq" data-act="equip" data-uid="${it.n}">${on ? 'Unequip' : 'Equip'}</button>`}${cbOk ? `<button type="button" class="eq cb" data-combine="${it.n}" aria-label="Combine ${RM_COMBINE_COUNT} ${rar.name} ${def.name} into one ${RM_RARITIES[it.r + 1].name}">Combine ${RM_COMBINE_COUNT}→${RM_RARITIES[it.r + 1].name}</button>` : ''}<button type="button" class="dc" data-act="${this.sellNeedsConfirm(it.n) ? 'sell-ask' : 'discard'}" data-uid="${it.n}" aria-label="Sell ${def.name} for ${sell} shards">Sell ${sell}💎</button></li>`;
    });
    html += '</ul></section>';
    html += `<section id="realm-bp-pane-stats" class="rm-bp8-pane" data-bp-pane="stats" role="tabpanel" aria-labelledby="realm-bp-tab-stats"${tab === 'stats' ? '' : ' hidden'}>${this._bpStatBlockHtml()}<div id="realm-bp-stats">${this._statLine()}</div>${this._statsDropHtml()}</section>`;
    html += `<section id="realm-bp-pane-relics" class="rm-bp8-pane" data-bp-pane="relics" role="tabpanel" aria-labelledby="realm-bp-tab-relics"${tab === 'relics' ? '' : ' hidden'}><div class="rm-bp8-h">Collections</div></section></div>`;
    if (this._forgeUid && !sv.items.some((x) => x.n === this._forgeUid)) { this._forgeUid = 0; this._forgeAsk = null; }
    root.innerHTML = html; this._fixIcons(root); this._bindCmp(root); this._bindStatsDrop(root); this._bindBpTabs(root);
    const gp = root.querySelector('#realm-bp-pane-gear'), rp = root.querySelector('#realm-bp-pane-relics');
    this._forgeDom(gp || root); this._bindForge(root); this._relicDom(rp || root);
    if (rp) { this._chaseDom(rp, rp.querySelector('.rm-bp8-h')); if (rp.children.length < 2) { const e = document.createElement('div'); e.className = 'dim rm-bp8-none'; e.textContent = 'Relics you find in the godlands are listed here.'; rp.appendChild(e); } }
    if (this._cmpOnUid) { const on = root.querySelector(`#realm-bp-list li[data-uid="${this._cmpOnUid}"]`); if (on) on.classList.add('cmp-on'); } // a long-pressed compare line survives a re-render
    if (this._bpDeltaUid) this.bpShowDelta(sv.items.some((x) => x.n === this._bpDeltaUid) ? this._bpDeltaUid : 0);
    root.querySelectorAll('img.rm-slot-ico, img.rm-gear-ico').forEach((img) => { if (img.complete && !img.naturalWidth) img.remove(); else img.addEventListener('error', () => img.remove(), { once: true }); });
    this._bindSellAsk(root); this._armButtons(root); // G-03
  }

  // ---------- backpack Stats drop-down (G13) ----------
  // A collapsible "Stats" section: a 44 px toggle (aria-expanded) over its own scrolling table of every _calcStats number as total / base / gear
  // (base = _calcStats({noGear}); gear = total - base, with an up/down arrow and an aria-label such as "Damage up 1.2 from gear"), plus the
  // equipped items. Open/closed is remembered for this browser session only (sessionStorage `pixeltown-bp-stats-open`, never the save).
  // ?gear=0 hides the gear-only rows (crit, status, splash, resist, guard, leech, regen, reach, pierce). Built only while open.
  statsRows() {
    if (!this.save) return [];
    let tot = null, base = null;
    try { tot = this._calcStats({ eqOverride: {} }); base = this._calcStats({ noGear: true }); } catch (e) { return []; }
    const n1 = (v) => String(Math.round(v * 10) / 10), pc = (v) => `${Math.round(v * 1000) / 10}%`, i0 = (v) => String(Math.round(v));
    const defs = [ // [key, label, icon ('ui_*' = b29 via _gearIco, 'b19:<k>' = b19 ui_stat_<k>), format, delta unit, gear-only]
      ['maxHp', 'Max HP', 'b19:life', i0, '', false], ['dmg', 'Damage', 'b19:power', n1, '', false], ['rate', 'Fire rate', 'ui_affix_swift', (v) => `${n1(v)}/s`, '/s', false],
      ['speed', 'Speed', 'b19:swift', i0, '', false], ['crit', 'Crit', 'ui_stat_crit', pc, '%', true], ['status', 'Status chance', 'ui_affix_venom', pc, '%', true],
      ['splashR', 'Splash radius', 'ui_stat_splash', (v) => `${i0(v)} px`, ' px', true], ['splashFrac', 'Splash share', 'ui_stat_splash', pc, '%', true],
      ['resist', 'Resist', 'ui_stat_resist', pc, '%', true], ['guard', 'Guard', 'b19:guard', n1, '', true], ['leech', 'Leech', 'ui_stat_leech', pc, '%', true],
      ['regen', 'Regen', 'ui_stat_regen', (v) => `${n1(v)}/s`, '/s', true], ['reach', 'Reach', 'ui_stat_range', pc, '%', true], ['pierce', 'Pierce', 'ui_affix_pierce', i0, '', true],
      ['shards', 'Shard bonus', '', (v) => pc(v - 1), '%', false], ['xp', 'XP bonus', 'b19:xp', (v) => pc(v - 1), '%', false], ['iframes', 'Safe time', '', (v) => `${Math.round(v * 100) / 100} s`, ' s', false],
    ];
    const out = [];
    defs.forEach(([k, label, ico, fmt, unit, gearOnly]) => {
      if (gearOnly && !RM_GEAR_ON) return;
      const t = Number(tot[k]) || 0, b = Number(base[k]) || 0, d = t - b;
      const dv = unit === '%' ? Math.round(d * 1000) / 10 : unit === ' px' || k === 'maxHp' || k === 'speed' || k === 'pierce' ? Math.round(d) : Math.round(d * 100) / 100;
      const dir = dv > 0 ? 'up' : dv < 0 ? 'down' : 'same';
      out.push({ key: k, label, ico, total: fmt(t), base: fmt(b), delta: dir === 'same' ? '0' : `${dv > 0 ? '+' : ''}${dv}${unit}`, dir, gear: gearOnly });
    });
    return out;
  }
  _statsOpen() {
    if (typeof this._bpStatsOpen === 'boolean') return this._bpStatsOpen;
    let v = false; try { v = sessionStorage.getItem('pixeltown-bp-stats-open') === '1'; } catch (e) { v = false; }
    return (this._bpStatsOpen = v);
  }
  setStatsOpen(on) {
    this._bpStatsOpen = !!on;
    if (on && this.bpTab() !== 'stats') this.bpTab('stats'); // BP8: the table lives on the Stats tab
    try { sessionStorage.setItem('pixeltown-bp-stats-open', on ? '1' : '0'); } catch (e) { /* blocked storage: remembered for this page only */ }
    const btn = document.getElementById('realm-bp-stats-toggle'); const box = document.getElementById('realm-bp-stats-box');
    if (btn) { btn.setAttribute('aria-expanded', on ? 'true' : 'false'); const ar = btn.querySelector('.ar'); if (ar) ar.textContent = on ? '▾' : '▸'; }
    if (box) { box.hidden = !on; box.innerHTML = on ? this._statsBoxHtml() : ''; if (on) { this._fixIcons(box); box.querySelectorAll('img.rm-gear-ico').forEach((img) => { if (img.complete && !img.naturalWidth) img.remove(); else img.addEventListener('error', () => img.remove(), { once: true }); }); } }
    return this._bpStatsOpen;
  }
  _statIco(id) {
    if (!id) return '';
    if (id.indexOf('b19:') === 0) {
      const k = id.slice(4); if (!RM_UI_ART || rmFlagOff('art') || !/^[a-z]+$/.test(k) || !/^[A-Za-z0-9_.:\/%-]+$/.test(RM_UI_ART)) return '';
      return `<img class="rm-gear-ico mm-ico" src="${RM_UI_ART}ui_stat_${k}.png" alt="" aria-hidden="true" width="16" height="16" style="vertical-align:-3px;margin-right:2px;image-rendering:pixelated">`;
    }
    return this._gearIco(id);
  }
  _statsDropHtml() {
    const on = this._statsOpen();
    return `<div class="rm-bp-statsdrop" style="margin:4px 0;max-width:100%"><button type="button" id="realm-bp-stats-toggle" class="eq" aria-expanded="${on ? 'true' : 'false'}" aria-controls="realm-bp-stats-box" style="min-height:44px;min-width:44px;width:100%;text-align:left;box-sizing:border-box;padding:6px 10px;border-radius:10px;border:2px solid rgba(255,255,255,.45);background:rgba(255,255,255,.1);color:#fff;font:700 13px system-ui,sans-serif;cursor:pointer"><span class="ar" aria-hidden="true">${on ? '▾' : '▸'}</span> 📊 Stats</button>`
      + `<div id="realm-bp-stats-box" role="region" aria-label="Stats"${on ? '' : ' hidden'} style="max-height:min(45vh,360px);overflow-y:auto;overflow-x:hidden;overscroll-behavior:contain;-webkit-overflow-scrolling:touch;margin-top:4px;padding-right:2px;box-sizing:border-box;max-width:100%">${on ? this._statsBoxHtml() : ''}</div></div>`;
  }
  _statsBoxHtml() {
    const esc = (t) => String(t).replace(/[&<>"]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]));
    const td = 'padding:3px 4px;border-bottom:1px solid rgba(255,255,255,.08);overflow-wrap:anywhere';
    let h = `<table class="rm-stats-tbl" style="width:100%;table-layout:fixed;border-collapse:collapse;font-size:12px;line-height:1.3"><thead><tr style="color:#8b949e;text-align:right"><th scope="col" style="text-align:left;width:40%;${td}">Stat</th><th scope="col" style="${td}">Total</th><th scope="col" style="${td}">Base</th><th scope="col" style="${td}">Gear</th></tr></thead><tbody>`;
    this.statsRows().forEach((r) => {
      const col = r.dir === 'up' ? '#7ee787' : r.dir === 'down' ? '#ff7b72' : '#8b949e'; const ar = r.dir === 'up' ? '▲' : r.dir === 'down' ? '▼' : '–';
      const lab = `${r.label} ${r.dir === 'same' ? 'no change from gear' : `${r.dir} ${r.delta.replace(/^[+-]/, '')} from gear`}`;
      h += `<tr data-stat="${r.key}"${r.gear ? ' data-gear="1"' : ''}><th scope="row" style="text-align:left;font-weight:600;${td}">${this._statIco(r.ico)}${esc(r.label)}</th><td class="tt" style="text-align:right;${td}">${esc(r.total)}</td><td class="bs" style="text-align:right;color:#8b949e;${td}">${esc(r.base)}</td><td class="gd ${r.dir}" style="text-align:right;color:${col};${td}" aria-label="${esc(lab)}"><span aria-hidden="true">${ar}</span> ${esc(r.delta)}</td></tr>`;
    });
    h += '</tbody></table>';
    const sets = this.activeSets();
    if (sets.length) h += `<div class="rm-stats-sets" style="margin-top:6px;font-size:12px"><div style="color:#8b949e;margin-bottom:2px">Sets</div>${sets.map((x) => `<div data-set="${esc(x.id)}" style="padding:2px 0;color:#7ee787;overflow-wrap:anywhere">${esc(x.text)}</div>`).join('')}</div>`;
    h += '<div class="rm-stats-eq" style="margin-top:6px;font-size:12px"><div style="color:#8b949e;margin-bottom:2px">Equipped</div><ul style="list-style:none;margin:0;padding:0">';
    const sv = this.save;
    RM_SLOTS.forEach((slot) => {
      const it = sv.items.find((x) => x.n === sv.eq[slot]); const def = it && RM_ITEM_BY_ID[it.id];
      h += def ? `<li data-eq-slot="${slot}" style="padding:2px 0;overflow-wrap:anywhere"><span style="color:${RM_RARITIES[it.r].color}">${this._icon(def)} ${this._tierTag(it)}${esc(def.name)}</span> <span class="dim">${esc(this._itemText(it))}</span></li>` : `<li data-eq-slot="${slot}" class="dim" style="padding:2px 0">${esc(slot)}: empty</li>`;
    });
    return h + '</ul></div>';
  }
  // GB / GW: the active gear sets of what is worn now ([{ id, name, text, bonus }]; [] with gear off, in duels or without MMGearSets).
  activeSets(eqOverride) {
    if (!this.save || (this.team && this.team.isPvp)) return [];
    let st = null; try { st = this._calcStats({ eqOverride: eqOverride && typeof eqOverride === 'object' ? eqOverride : {} }); } catch (e) { st = null; }
    return st && Array.isArray(st.sets) ? st.sets : [];
  }
  // ---------- RE3: the T12 chase + relic book (MMEndgame), ?chase=0 hides all three ----------
  // A calm pity line at the top of the Stats box ("12 of 60 toward a sure T12", MMEndgame.chase on this save; gear on only), a "Relic book"
  // section at the end of the backpack (the six godland relics, found or "not yet", MMEndgame.relicBook) and a gentle "New best tier" toast when a
  // picked-up item beats the best tier held this visit. Read-only on the save (no new keys). DOM built with textContent only. No countdowns.
  chaseOn() { return !rmFlagOff('chase') && typeof MMEndgame !== 'undefined' && !!MMEndgame && typeof MMEndgame.chase === 'function' && !(this.team && this.team.isPvp); }
  // The godland boss pity (gp.b) lives in the Realm World save (pixeltown-realm-v1, realm-world.js giveBag); the crypt counter (gp.d) in this save
  // (dungeon.js). Read-only: hostile or missing storage counts as 0.
  chaseGp() {
    const own = rmGpOf(this.save && this.save.gp); let wb = 0;
    try { const o = JSON.parse(localStorage.getItem('pixeltown-realm-v1') || 'null'); const b = o && typeof o === 'object' && o.gp && typeof o.gp === 'object' ? o.gp.b : 0; wb = typeof b === 'number' && Number.isFinite(b) ? Math.max(0, Math.min(9999, Math.floor(b))) : 0; } catch (e) { wb = 0; }
    return { b: wb, d: own.d };
  }
  chaseInfo() { if (!this.chaseOn() || !this.save) return null; try { return MMEndgame.chase({ gp: this.chaseGp(), items: this.save.items }); } catch (e) { return null; } }
  relicInfo() { if (!this.chaseOn() || !this.save) return null; try { return MMEndgame.relicBook({ items: this.save.items }); } catch (e) { return null; } }
  _chaseDom(box, after) {
    if (!box || !RM_GEAR_ON) return;
    const c = this.chaseInfo(); if (!c) return;
    const d = document.createElement('div'); d.id = 'realm-bp-chase'; d.className = 'rm-chase-line';
    d.style.cssText = 'margin:2px 0 6px;padding:4px 6px;border-radius:8px;background:rgba(255,215,90,.08);color:#f2e3b3;font-size:12px;line-height:1.35;overflow-wrap:anywhere';
    const a = document.createElement('div'); a.className = 'pity'; a.textContent = '🌟 ' + c.text;
    const b = document.createElement('div'); b.className = 'luck'; b.style.color = '#8b949e'; b.textContent = c.luckText + (c.bestTier ? ' · best tier T' + c.bestTier : '');
    d.append(a, b); const old = document.getElementById('realm-bp-chase'); if (old) old.remove(); box.insertBefore(d, after ? after.nextSibling : box.firstChild);
  }
  _relicDom(root) {
    if (!root) return;
    const rb = this.relicInfo(); if (!rb) return;
    const open = !!this._relicOpen;
    const wrap = document.createElement('div'); wrap.className = 'rm-relic-book'; wrap.style.cssText = 'margin:8px 0 4px;max-width:100%';
    const btn = document.createElement('button'); btn.type = 'button'; btn.id = 'realm-bp-relic-toggle'; btn.className = 'eq';
    btn.setAttribute('aria-expanded', open ? 'true' : 'false'); btn.setAttribute('aria-controls', 'realm-bp-relic-box');
    btn.style.cssText = 'min-height:44px;min-width:44px;width:100%;text-align:left;box-sizing:border-box;padding:6px 10px;border-radius:10px;border:2px solid rgba(255,255,255,.45);background:rgba(255,255,255,.1);color:#fff;font:700 13px system-ui,sans-serif;cursor:pointer';
    btn.textContent = (open ? '▾' : '▸') + ' 📖 Relic book · ' + rb.text;
    const box = document.createElement('div'); box.id = 'realm-bp-relic-box'; box.setAttribute('role', 'region'); box.setAttribute('aria-label', 'Relic book'); box.hidden = !open;
    box.style.cssText = 'margin-top:4px;font-size:12px;line-height:1.35;box-sizing:border-box;max-width:100%';
    const ul = document.createElement('ul'); ul.className = 'rm-relic-list'; ul.style.cssText = 'list-style:none;margin:0;padding:0';
    rb.entries.forEach((e) => {
      const li = document.createElement('li'); li.dataset.relic = e.id; li.dataset.found = e.found ? '1' : '0';
      li.style.cssText = 'padding:3px 4px;border-bottom:1px solid rgba(255,255,255,.08);overflow-wrap:anywhere;color:' + (e.found ? '#ffd25a' : '#8b949e');
      li.textContent = (e.found ? '✓ ' : '· ') + e.text; ul.appendChild(li);
    });
    const hint = document.createElement('div'); hint.className = 'hint'; hint.style.cssText = 'color:#8b949e;margin-top:4px'; hint.textContent = rb.hint;
    box.append(ul, hint); wrap.append(btn, box); root.appendChild(wrap);
    btn.addEventListener('click', () => {
      this._relicOpen = !this._relicOpen; box.hidden = !this._relicOpen; btn.setAttribute('aria-expanded', this._relicOpen ? 'true' : 'false');
      btn.textContent = (this._relicOpen ? '▾' : '▸') + ' 📖 Relic book · ' + rb.text;
    });
  }
  // the best item tier held this visit (lazy: from the backpack the first time it is asked)
  _bestTierHeld() {
    if (typeof this._chaseBestT !== 'number') { let b = 0; (this.save && Array.isArray(this.save.items) ? this.save.items : []).forEach((it) => { if (it && it.t > b) b = it.t; }); this._chaseBestT = b; }
    return this._chaseBestT;
  }
  _chaseNewItem(ent, prevBest) {
    if (!ent || !ent.t || !RM_GEAR_ON || !this.chaseOn()) return;
    if (ent.t > prevBest) { this._chaseBestT = ent.t; this.chaseToast('New best tier: T' + ent.t + ' ' + ((RM_ITEM_BY_ID[ent.id] || {}).name || '')); }
  }
  chaseToast(text) {
    const host = this.container || document.body; if (!host || typeof document === 'undefined') return;
    let el = document.getElementById('realm-chase-toast');
    if (!el) {
      el = document.createElement('div'); el.id = 'realm-chase-toast'; el.setAttribute('role', 'status'); el.setAttribute('aria-live', 'polite');
      el.style.cssText = 'position:absolute;left:50%;top:12%;transform:translateX(-50%);z-index:30;display:flex;align-items:center;gap:6px;max-width:calc(100% - 32px);box-sizing:border-box;padding:4px 4px 4px 12px;border-radius:12px;background:rgba(20,24,32,.88);border:2px solid rgba(255,210,90,.6);color:#ffe9a8;font:600 13px system-ui,sans-serif';
      const t = document.createElement('span'); t.className = 'txt'; t.style.overflowWrap = 'anywhere';
      const x = document.createElement('button'); x.type = 'button'; x.className = 'x'; x.textContent = '✖'; x.setAttribute('aria-label', 'Dismiss');
      x.style.cssText = 'min-width:44px;min-height:44px;border:0;background:transparent;color:#ffe9a8;font-size:14px;cursor:pointer';
      x.addEventListener('click', () => { el.hidden = true; });
      el.append(t, x);
      if (host !== document.body && getComputedStyle(host).position === 'static') host.style.position = 'relative';
      host.appendChild(el);
    }
    el.querySelector('.txt').textContent = '✨ ' + text; el.hidden = false; this.lastChaseToast = text; // test hook
    clearTimeout(this._chaseToastT); this._chaseToastT = setTimeout(() => { el.hidden = true; }, 4500);
  }
  _bindStatsDrop(root) {
    if (!root || root.dataset.statsBound) return;
    root.dataset.statsBound = '1';
    root.addEventListener('click', (e) => { if (e.target.closest && e.target.closest('#realm-bp-stats-toggle')) this.setStatsOpen(!this._statsOpen()); });
  }

  // G7: a small "T7" tier label (tier colour + text, never colour alone) in front of a tiered item's name; '' for T0 or with gear off.
  _tierTag(it) {
    if (!RM_GEAR_ON || !it || !it.t) return '';
    const c = MMGear.TIER_COLORS[it.t - 1] || '#c9d1d9';
    return `${this._gearIco('ui_tier_badge_' + it.t)}<span class="rm-tier" style="color:${c};font-weight:700;font-size:11px;margin-right:3px">T${it.t}</span>${MMGear.soulbound(it.t) ? '🔗 ' : ''}`;
  }
  // The disabled equip button of a tiered item the hero cannot wear: another armor family ("🔒 Heavy", the _wpnHint pattern) or a level gate ("🔒 Lv 16").
  _gearLockHtml(it, def, why) {
    if (why === 'level') { const lv = MMGear.gate(it.t); return `<button type="button" class="eq" disabled data-gear-lock="level" aria-label="Needs level ${lv}" title="Needs level ${lv}">🔒 Lv ${lv}</button>`; }
    const fam = def.family || ''; const F = fam ? fam.charAt(0).toUpperCase() + fam.slice(1) : 'Armor';
    const cls = Object.keys(MMGear.CLASS_ARMOR).filter((k) => MMGear.CLASS_ARMOR[k] === fam).map((k) => k.charAt(0).toUpperCase() + k.slice(1)).join(', ');
    const hint = cls ? `${F}: ${cls}` : F;
    return `<button type="button" class="eq" disabled data-gear-lock="class" aria-label="${hint} only" title="${hint}">🔒 ${F}</button>`;
  }

  // ---------- backpack weapon compare (S14) ----------
  // A weapon's numbers for the compare line. it = a save item, or null for the hero's class weapon with nothing equipped.
  // With an active hero and MMWeapons the pattern comes from MMWeapons.resolve (the style the item would really fire), else today's plain bolt.
  _wpnSummary(it) {
    const def = it ? RM_ITEM_BY_ID[it.id] : null; const r = it ? it.r : 0;
    const cls = this.heroClass(); let spec = null; let locked = false;
    if (typeof MMWeapons !== 'undefined' && cls) {
      try {
        if (def && def.wpn && !this._wpnCanEquip(def)) { locked = true; spec = MMWeapons.get(def.style); }
        else spec = MMWeapons.resolve(cls, def && def.wpn ? def.style : 'base', r);
      } catch (e) { spec = null; }
    }
    const hp = this.heroProfile;
    const tb = RM_GEAR_ON && it && it.t && def && !def.inert && def.stat === 'dmg' ? MMGear.weaponBonus(def.amount, it.t, r) : null; // G8: a tiered weapon compares with its tier bonus
    const v = def && !def.inert ? (tb !== null ? tb : def.amount * RM_RARITIES[r].mult) : 0;
    const shots = spec ? Math.max(1, spec.count) * Math.max(1, spec.burst ? spec.burst.n : 1) : (hp ? hp.shots : 1);
    const shotDmg = (RM_PLAYER.dmg + (def && def.stat === 'dmg' ? v : 0)) * (spec ? spec.dmg : (hp ? hp.shotDmg : 1));
    const rate = (RM_PLAYER.fireRate + (def && def.stat === 'rate' ? v : 0)) * (spec && !spec.base ? spec.rate : 1);
    const range = spec ? Math.round(spec.range || (spec.spd || 1) * RM_PLAYER.bulletSpeed * (spec.life || RM_PLAYER.bulletLife)) : Math.round(RM_PLAYER.bulletSpeed * RM_PLAYER.bulletLife);
    let pattern = '';
    try { pattern = spec ? MMWeapons.describe(spec) : ''; } catch (e) { pattern = ''; }
    if (!pattern) pattern = `${shots} bolt${shots === 1 ? '' : 's'}, range ${range} px`;
    const splash = RM_SPLASH_ON && spec && spec.splash && spec.splash.r > 0 ? Math.round(spec.splash.r) : 0;
    return { pattern, shots, pierce: spec ? spec.pierce || 0 : (hp ? hp.pierce : 0), range, dps: shotDmg * shots * rate, locked, splash };
  }
  // Compare a backpack weapon with what is equipped now (or the class weapon): {pattern, deltas: [{text, up}], equipped, locked}.
  weaponCompare(uid) {
    const it = this.save.items.find((x) => x.n === uid); const def = it && RM_ITEM_BY_ID[it.id];
    if (!def || def.slot !== 'weapon') return null;
    const eqUid = this.save.eq.weapon; const cur = eqUid ? this.save.items.find((x) => x.n === eqUid) : null;
    const a = this._wpnSummary(it); const b = this._wpnSummary(cur || null);
    const out = { pattern: a.pattern, deltas: [], equipped: eqUid === uid, locked: a.locked };
    if (out.equipped || a.locked) return out;
    const sgn = (d) => (d > 0 ? '+' : '');
    const add = (d, text, min, ico) => { if (Math.abs(d) >= (min || 1)) out.deltas.push(ico ? { text, up: d > 0, ico } : { text, up: d > 0 }); };
    const ds = a.shots - b.shots, dp = a.pierce - b.pierce, dr = a.range - b.range, dsp = a.splash - b.splash;
    add(ds, `${sgn(ds)}${ds} shot${Math.abs(ds) === 1 ? '' : 's'}`);
    add(dp, `${sgn(dp)}${dp} pierce`, 1, 'ui_affix_pierce');
    const pct = b.dps > 0 ? Math.round((a.dps / b.dps - 1) * 100) : 0;
    add(pct, `${sgn(pct)}${pct}% damage/s`);
    add(dr, `${sgn(dr)}${dr} px range`, 10, 'ui_stat_range');
    add(dsp, `${sgn(dsp)}${dsp} px splash`, 1, 'ui_stat_splash'); // G11: only the splash styles have one
    const sNow = this.activeSets(), sNew = this.activeSets({ weapon: uid }); // GB / GW: a set this swap makes or breaks
    sNew.forEach((x) => { if (!sNow.some((y) => y.id === x.id)) out.deltas.push({ text: `+ ${x.text}`, up: true, set: x.id }); });
    sNow.forEach((x) => { if (!sNew.some((y) => y.id === x.id)) out.deltas.push({ text: `loses ${x.name}`, up: false, set: x.id }); });
    return out;
  }
  _cmpHtml(it, on) {
    let c = null; try { c = this.weaponCompare(it.n); } catch (e) { c = null; }
    if (!c) return '';
    const esc = (t) => String(t).replace(/[&<>"]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]));
    let d = '';
    if (on || c.equipped) d = '<span class="dl eqd">equipped</span>';
    else if (c.locked) d = '<span class="dl eqd">another class family</span>';
    else if (!c.deltas.length) d = '<span class="dl eqd">same as equipped</span>';
    else d = c.deltas.map((x) => `<span class="dl ${x.up ? 'up' : 'dn'}">${x.ico ? this._gearIco(x.ico) : ''}${esc(x.text)}</span>`).join('');
    return `<span class="rm-cmp" data-cmp="${it.n}"><span class="pat">${esc(c.pattern)}</span>${d}</span>`;
  }
  // Long-press (touch) toggles a row's compare line; hover / keyboard focus show it on desktop (realm-ui.css). Bound once per element.
  _bindCmp(root) {
    if (!root || root.dataset.cmpBound) return;
    root.dataset.cmpBound = '1';
    let timer = 0; let li = null;
    const clear = () => { clearTimeout(timer); timer = 0; li = null; };
    root.addEventListener('pointerdown', (e) => {
      const row = e.target.closest && e.target.closest('#realm-bp-list li');
      if (!row || !row.querySelector('.rm-cmp') || e.target.closest('button')) return;
      clear(); li = row.dataset.uid; // by uid, not element: a re-render mid-press (item art arriving) replaces the row
      timer = setTimeout(() => {
        const u = li; clear();
        const r = u ? root.querySelector(`#realm-bp-list li[data-uid="${u}"]`) : null;
        if (!r) return;
        const was = r.classList.contains('cmp-on');
        root.querySelectorAll('li.cmp-on').forEach((x) => x.classList.remove('cmp-on'));
        if (!was) r.classList.add('cmp-on');
        this._cmpOnUid = was ? '' : u; // kept across re-renders (renderBackpack re-applies it)
      }, 420);
    });
    ['pointerup', 'pointercancel', 'pointerleave'].forEach((t) => root.addEventListener(t, clear));
    root.addEventListener('contextmenu', (e) => { if (e.target.closest && e.target.closest('#realm-bp-list li .nm')) e.preventDefault(); }); // a long-press shows the compare line, not the menu
  }
  // The hero's class weapon name (MMWeapons base style, e.g. "Ranger Bolt"), or '' with no hero / module / in a duel.
  _classWeaponName() {
    const cls = this.heroClass();
    if (!cls || typeof MMWeapons === 'undefined' || (this.team && this.team.isPvp)) return '';
    try { const b = MMWeapons.resolve(cls, 'base', 0); return b && b.name ? String(b.name).replace(/[<>&"]/g, '').slice(0, 32) : ''; } catch (e) { return ''; }
  }
  // b19 slot art in front of the class weapon name (decorative; removed if it fails to load).
  _slotIcon(slot) {
    if (!RM_UI_ART || !/^[a-z]+$/.test(slot) || !/^[A-Za-z0-9_.:\/%-]+$/.test(RM_UI_ART)) return '';
    return `<img class="rm-slot-ico mm-ico" src="${RM_UI_ART}ui_slot_${slot}.png" alt="" width="20" height="20">`;
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
      if (this._dv) g.translate(-cam.x, 0); // dungeon view: the room slice around the hero
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
      if (wd && wd.drawEnemy && wd.drawEnemy(g, e)) continue; // B7: the world drew this one (a creature)
      const spr = this.sprites[e.type];
      const bob = e.type === 'boss' ? 0 : Math.sin(e.t * 4) * 2;
      const art = e.type === 'boss' ? !!(this._bossArt && this._drawBossArt(g, e)) : !!(this._enemyArt && this._drawEnemyArt(g, e, RM_ENEMIES[e.type]));
      if (!art) g.drawImage(spr, e.x - spr.width / 2, e.y - spr.height / 2 + bob);
      if (e.flash > 0 && this._flashesOn()) { g.globalAlpha = e.flash * 0.7; g.fillStyle = '#fff'; g.beginPath(); g.arc(e.x, e.y + (art ? 0 : bob), this._er(e), 0, Math.PI * 2); g.fill(); g.globalAlpha = 1; }
      if (e.type === 'boss' && e.invuln > 0) { g.strokeStyle = 'rgba(255,255,255,0.8)'; g.lineWidth = 3; g.beginPath(); g.arc(e.x, e.y, 40 + Math.sin(e.t * 20) * 2, 0, Math.PI * 2); g.stroke(); }
      if (e.hp < e.maxHp && e.type !== 'boss') { g.fillStyle = 'rgba(0,0,0,0.6)'; g.fillRect(e.x - 14, e.y - spr.height / 2 - 6, 28, 4); g.fillStyle = RM_ENEMIES[e.type].color; g.fillRect(e.x - 14, e.y - spr.height / 2 - 6, 28 * (e.hp / e.maxHp), 4); }
      if (e.status) this._drawEnemyPips(g, e, e.y - (e.type === 'boss' ? RM_ENEMIES.boss.r + 10 : spr.height / 2 + 13));
    }
    this._drawTelegraphs(g, vx0, vy0, vx1, vy1);
    if (this._edGhosts) this._drawEnemyGhosts(g);
    if (this._bossGhost) this._drawBossGhost(g);
    for (let i = 0; i < this.bags.length; i++) { const b = this.bags[i]; if (b.active && b.x > vx0 && b.x < vx1 && b.y > vy0 && b.y < vy1) { const by = b.y - 13 + Math.sin(b.t * 5) * 2; g.drawImage(this.sprites.worldBag[b.tier] || this.sprites.bag[b.r], b.x - 13, by); if (this._itemArt) { const ic = this._lootIcon(b.id, b.r); if (ic) g.drawImage(ic, b.x - 10, by - 18 + Math.sin(b.t * 5 + 1) * 1.5); } } }
    let ebn = 0; const ebs = this.sprites.eBullet; const cb = this._ebCB; // cb: colour-blind palette sprites (they replace hues and bolt art)
    const trail = !this._hitFxOff && !this._lowGfx(); // cyc6: slow shots get a 2-dot motion trail (their own sprite, scaled down, behind them)
    for (let i = 0; i < this.eBullets.length && ebn < RM_EB_DRAW; i++) { const b = this.eBullets[i]; if (b.active && b.x > vx0 && b.x < vx1 && b.y > vy0 && b.y < vy1) { const slow = trail && this._drawEBTrail(g, b, cb ? (cb[b.kind] || cb[0]) : (ebs[b.kind] || ebs[0])); if (cb) g.drawImage(cb[b.kind] || cb[0], b.x - 8, b.y - 8); else if (!(b.ea && this._drawEBoltArt(g, b))) g.drawImage(ebs[b.kind] || ebs[0], b.x - 8, b.y - 8); else if (slow) g.drawImage(this.sprites.ebCore, b.x - 4, b.y - 4); ebn++; } }
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
    if (wd && wd.drawMid) wd.drawMid(g, cam); // B7: under the hero (a mount)
    // Player: the villager sprite (flickers while invulnerable), with a soft shadow and aim marker.
    const p = this.player;
    const lift0 = wd && wd.heroLift ? Number(wd.heroLift()) : 0; const lift = lift0 > 0 ? Math.min(96, lift0) : 0; // B7: hero drawn raised (riding)
    if (this.state !== 'dead' && (p.iframes <= 0 || this._reduced || Math.floor(p.iframes * 20) % 2 === 0)) {
      if (this.down) { g.globalAlpha = 0.45; g.strokeStyle = '#7ee787'; g.lineWidth = 3; g.beginPath(); g.arc(p.x, p.y, RT_REVIVE_RANGE, -Math.PI / 2, -Math.PI / 2 + Math.min(1, this.reviveT / RT_REVIVE_TIME) * Math.PI * 2); g.stroke(); }
      g.fillStyle = 'rgba(0,0,0,0.35)'; g.beginPath(); g.ellipse(p.x, p.y + 14, 13, 5, 0, 0, Math.PI * 2); g.fill();
      let heroDrawn = false; if (lift) { g.save(); g.translate(0, -lift); }
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
      if (lift) g.restore();
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
    if (this._fxPool) this._fxDraw(g);
    if (this._spRings) this._drawSplashRings(g);
    if (this.sig) this._drawSignature(g);
    if (this.dungeon) this.dungeon.drawOver(g);
    if (wd && wd.drawOver) wd.drawOver(g, cam);
    for (let i = 0; i < this.particles.length; i++) {
      const pt = this.particles[i];
      if (!pt.active || pt.x < vx0 || pt.x > vx1 || pt.y < vy0 || pt.y > vy1) continue;
      g.globalAlpha = Math.max(0, pt.life / pt.max); g.fillStyle = pt.color; g.fillRect(pt.x - pt.size / 2, pt.y - pt.size / 2, pt.size, pt.size);
    }
    g.globalAlpha = 1;
    g.font = this._txtFont; g.textAlign = 'center'; // AR: follows the HUD size pref (a cached string; 14 px by default)
    const hs = this._stAnchorAt(); const ox = wd || this._dv ? cam.x : 0; const oy = wd ? cam.y : 0; // floating numbers never sit under the top-right HUD buttons
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
      } else {
        if (t.outline) { g.lineWidth = 4; g.strokeStyle = t.outline; g.strokeText(t.text, t.x, t.y); } // G-04: a dark outline (full-pack sale text on grass)
        g.fillStyle = '#000'; g.fillText(t.text, t.x + 1, t.y + 1); g.fillStyle = t.color; g.fillText(t.text, t.x, t.y);
      }
      t.y = ty0;
    }
    g.globalAlpha = 1;
    g.restore();
    this._drawStatusIcons(g); // screen space, above the world and the floating numbers
    if (this.flash > 0 && this._flashesOn()) this._drawHitFlash(g); // hit vignette (off with the `flashes: false` access pref) (reduced motion: a steady tint while it lasts, no fade or blink)
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

  // The shard counter text alone (it ticks toward save.shards over a few frames, see _update). Returns the element.
  _syncShards() {
    const shards = document.getElementById('realm-shards');
    if (shards) { const t = `💎 ${Math.floor(this.displayShards)}`; if (shards.textContent !== t) shards.textContent = t; }
    return shards;
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
    const shards = this._syncShards();
    let de = shards ? document.getElementById('realm-dust') : null;
    if (shards && (de || (this.save.dust || 0) > 0) && this.forgeOn()) { // GW: forge dust, calm (no animation), only once there is some
      if (!de) { de = document.createElement('span'); de.id = 'realm-dust'; de.style.marginLeft = '6px'; shards.insertAdjacentElement('afterend', de); }
      const dt = `✨ ${this.save.dust || 0}`; if (de.textContent !== dt) de.textContent = dt;
    }
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
    this._syncAbilities(); this._focusHud(!!force);
    const best = document.getElementById('realm-best');
    if (best) best.textContent = this.save.bestWave > 0 && !wc ? `Best wave ${this.save.bestWave}${this.save.bestWaveA ? ' (Assisted)' : ''}` : '';
    if (force) this._hideBanner();
  }

  _syncAbilities() {
    for (let i = 0; i < 4; i++) {
      const el = document.getElementById(`realm-ab-${i}`);
      if (!el) continue;
      const ab = this._ab(i); const unlocked = this.abilityUnlocked(i); const cd = this.abilityCd[i];
      el.classList.toggle('locked', !unlocked);
      if (this._abIconRoot !== null || el.dataset.abImg || el.querySelector(':scope > img.realm-ab-img')) this._syncAbilityIcon(el, i);
      el.classList.toggle('cooling', unlocked && cd > 0);
      el.classList.toggle('nofocus', !!this.focus && unlocked && ((this._fMask >> i) & 1) === 1); // FO2: not enough focus for this one
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
