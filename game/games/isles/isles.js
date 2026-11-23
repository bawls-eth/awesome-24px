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
// Art (b31a / b32 / b33): creatures with PNG strips (MMCreatureStrips: chompbill, fernraptor, glimmerfrog, tusktop, fernjaw_tyrant) draw
// idle / move / attack / death by facing (left = mirrored right), sleep when knocked out, eat when fed, the saddle overlay while ridden
// and the roar strip during the boss wind-up; anything without strips (or ?art=0) draws the MMCreatureDraw code bake. On the jungle the
// b33 prop PNGs replace the code props by id inside the baked chunks.
// X1 (NEXT-SLICES-2): spawn ids play as MMBiomePacks.canon() species (via IsleCreatures.kindOf); swim water (reef lagoon / coral /
// kelp) blocks on foot and is crossed on a swim mount, dismounting in it steps ashore; the pack `rare` entry spawns once per island at
// a seeded spot (IsleCreatures.rareSpot); b30 tile art is jungle-only (other islands bake with their pack palette); the b34 taming
// icons (trust / torpor / bond / saddle meters, tranq, ride, follow / stay / attack party command) load by id over the text labels.
// X4 (NEXT-SLICES-2): every pack resource node (world.resources, minus the daily-free gather spots) is picked up by walking over it into
// the archipelago save's `inv` (MMIsleCraft.cleanInv caps) and grows back after its pack `respawn` seconds; kills roll the creature's
// MMCreatures DROP_TABLES into `inv`. The Craft panel (K / Craft button, DOM + textContent only, 44 px targets, Esc closes) lists every
// MMIsleCraft recipe with have / need counts. A mount whose ride.saddle is set needs that saddle in `inv`; the first X4 load gives one
// free saddle for the mount you already had (save.sg marks it done), and ?saddles=0 restores free riding. Crafting a raft adds `reef` to
// `unlock`, a rocket core adds `mars`; the sea chart lists locked islands with their cost (home, jungle and tundra are open by default,
// an island you already visited stays open). b31b: the vinecoil and canopy glider PNG strips come in through MMCreatureStrips.
// X6 (NEXT-SLICES-2): each pack's bosses[0] (MMIsleBoss: phase scripts, weary at 10% HP) waits at its boss site inside a boss arena ring
// (the b33 boss_arena_ring PNG once delivered, else a code ring). Walking into the ring starts the fight; every attack is drawn as its
// exact MMIsleBoss shape for its whole wind-up (static with reduced motion) and the hero is hurt only inside a live shape. At weary a
// `feast` from `inv` (F) starts a boss-tame: soothe shots put it to sleep, more feasts tame it; a tamed boss joins the stable as an alpha
// (cos 'alpha') and rides with its crafted saddle (saddle_tyrant for the Fernjaw Tyrant; the X4 rules apply). ?tame=0: the boss just
// dies and nothing is written to the stable. A kill or tame notes the boss (save.bosses + save.beat), so the boss medal counts it.
// ?bosses=0 leaves the boss sites empty (only the lair-seen medal, as before).
// X5: MMIsleEnv rules behind its flags (?env=0 turns them all off): calm warmth on the tundra (drains in 90 s, a warm cloak doubles it,
// hot springs and campfires refill it; at 0 you walk at x0.8, never any damage) and air on mars (90 s, 120 s with an o2_tank; domes and
// landing pads refill it; at 0 it costs 1 HP every 3 s after a 10 s warning, and it never takes your last HP), plus mars gravity (x1.15).
// No meter ever touches items or tames. The swim rule keeps the X1 behaviour (open water needs a swim mount) with or without the flag.
// X7: the hero's HP rides along on every trip (additive save.hp; absent = full); sailing to an island you already have a spot on resumes
// there with its fog (the Home dock always lands at the dock); locked sea chart rows show the unlock cost with have / need; Decor > Make
// opens the Home decor panel (MMHomeBuild: decor crafted from the pack into the decor stock, additive save.home.made) with the tame pen
// roster by name, and each resting tame wears a cached name tag.
// AW2 (art wiring, provisional Codex batches): Hearth Isle chunks bake the b35 meadow-home tiles (variants + grass edge masks, MMIsleArt
// pack 'meadow'; code palette per missing tile) with its garden plot / dock / boat props and the stable over the homestead pen; the b36
// meadow tameables, the b32s stegolith (saddle overlay + seat) and the b31af glimmerfrog sleep / eat come through MMCreatureStrips (each
// island preloads its own biome's strips plus your stable's); the craft panel shows the b34b item icons by id over the text label.
// AW3 (Codex redo): the b36 strips are at their size class (S 48 / M 64 / L 96 / XL 128 native; no 2x oakback), the b35 edge masks are
// drawn as delivered, the Coral Reef preloads the b38a reef puffer, and a strip's ground shadow is sized to its measured body width.
// AW4: the reef preloads all seven b38a-f species (108 strips); the tidesteed / skimray swim mounts draw body + saddle overlay with the
// hero on the seat, the isleback turtle rides bare; __isles.riding() also reports seatY / seatX (where the hero was last drawn).
// AW5: the reef also preloads the b38g Tide Hydra (its 6-frame roar runs over the wind-up; boss frames use the per-creature timing) and
// the tundra preloads the b40a pengling. art-audit-3: and the b40b frostfox + b40c rimewolf (42 tundra strips; the aurora frostfox stays
// the code-drawn palette swap).
// XW1: the craft panel lists every MMIsleCraft recipe (ALL_IDS, groups Travel / Saddles / Supplies / Trophies); an alternative recipe
// unlocks by its output item (rocket_core_drift opens mars from a fresh save) and the sea chart's "Craft it" points at a reachable build;
// a daily gather spot can add a seeded bonus find (MMIsleCraft.bonusFind). Riding shows one 44 px ability button (key F while riding)
// for the mount's MMMountAbility (12 abilities; never damage, never touches tames / party / boss / items); ?ability=0 turns them off.
// The feedback widget is a static script tag; ?test=1 exposes __isles.events() (a {t, kind} ring buffer, no text).
// IF1 (NEXT-SLICES-4): calm HP recovery (MMIsleRest: rest spots heal to full, slow regen out of danger, never in a boss fight; creature
// hits are halved while the mars air is empty), a pouch per island (MMIslePouch.starter; ?pouch=classic = the old jungle pouch) and
// feeding from the pack (IsleCreatures.foodFor(def, pouch, inv, reserve): the pouch first, never what a locked travel recipe needs),
// seeded food glints for every diet item (MMIsleCraft.FOOD_NODES, a labelled vine rope patch by the jungle dock), journal sightings,
// forage sparkles after 40 s without a reward (<= 6 per island a day, save.spark), and a locked island opened by URL lands at the home
// dock (?test=1 keeps the old direct load for tests). Events gain the kinds spot, rest and sparkle. ?rest=0 turns rest / regen off.
// TD1 (NEXT-SLICES-4): tundra + mars depth. Rares from a page-side table (RARE_EXTRA: an aurora frostfox on the tundra at night, a chrome
// rustbeetle on mars; seeded IsleCreatures.rareSpot, one alive, a code palette swap, a tame adds aurora_shard / chrome_flake), thin ice
// (a crack telegraph after 1 s on one tile, slush x0.6 for 20 s, never damage), a hot spring soak ("Warm and rested"), an aurora night
// on a page clock (?aurora=1 / 0), once-a-day glints (save.glint), the air warning at 20 s with an arrow home, and a short rocket lift-off
// when sailing to mars (a tap, a key or reduced motion skips it; nothing is used up). Events gain ice_warn, ice_crack, soak, glint,
// rare_tame and launch.
(function () {
  'use strict';
  const CRAFT = window.MMIsleCraft || null;
  const O = window.MMOverworld, BP = window.MMBiomePacks, CB = window.MMChunkBake, CR = window.MMCreatures, CD = window.MMCreatureDraw;
  const FOG = window.MMFog, PROF = window.MMProfile, ISL = window.MMIsles, TAMES = window.MMTames, RNG = window.MMRng;
  const TM = window.MMTame, CMP = window.MMCompanion, IC = window.IsleCreatures, HS = window.MMHomestead, MS = window.MMCreatureStrips;
  const HB = window.MMHomeBuild || null; // X7: decor crafting (optional; without it the starter stock still places)
  // IF1 (optional: without them the B9 pouch and no regen). ?rest=0 turns rest / regen / mercy off (HP only heals on a respawn, as before)
  const POUCH = window.MMIslePouch || null, REST = new URLSearchParams(location.search).get('rest') === '0' ? null : window.MMIsleRest || null;
  const $ = (id) => document.getElementById(id);
  const has = (o, k) => !!o && Object.prototype.hasOwnProperty.call(o, k);
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

  // ---------- switches ----------
  const Q = new URLSearchParams(location.search);
  const TEST = Q.get('test') === '1';
  const ART = Q.get('art') !== '0';
  const LOW = Q.get('perf') === 'low';
  // PI2 (NEXT-SLICES-4): the graphics tier. The shared lowGfx pref (pixeltown-access-v1, MMAccess) forces MMPerf's low tier, as does
  // ?perf=low (which also keeps its older, smaller creature cap and one companion). The low tier: dpr 1, at most 12 glint sparks a frame,
  // no ground shadows, still terrain decor (glints, pen guests, aurora drift, steam), companion AI stepped at 15 Hz and the fog reveal at
  // 10 Hz. Gameplay never changes with the pref. No pref (and no MMPerf) = the high tier, drawn exactly as before.
  const PERF = window.MMPerf || null;
  const ACC = (() => { try { return window.MMAccess && window.MMAccess.prefs ? window.MMAccess.prefs.load(window.localStorage) : null; } catch (e) { return null; } })();
  const GFX_TIER = LOW || (ACC && ACC.lowGfx === true) ? 'low' : PERF ? PERF.profile([], ACC || {}, null).tier : 'high';
  const GFX_LOW = GFX_TIER === 'low';
  const GFX = { tier: GFX_TIER, sparks: GFX_LOW ? (PERF ? PERF.CAPS.low.sparks : 12) : Infinity, ghosts: GFX_LOW ? (PERF ? PERF.CAPS.low.deathGhosts : 4) : 6,
    terrainAnim: !GFX_LOW, aiHz: GFX_LOW ? 15 : 0, fogHz: GFX_LOW ? 10 : 0, shadows: !GFX_LOW };
  const TAME = Q.get('tame') !== '0', COMPANIONS = Q.get('companions') !== '0', MOUNTS = Q.get('mounts') !== '0';
  const SADDLES = Q.get('saddles') !== '0' && !!CRAFT; // X4: ?saddles=0 rides every mount bareback (today's free riding)
  const TILE = CB.TILE, CPX = CB.CPX, CH = CB.CH;
  // XW1: mount abilities (MMMountAbility); ?ability=0 (its KILL_FLAG) rides exactly as before
  const MA = window.MMMountAbility || null;
  const ABIL = !!MA && Q.get('mounts') !== '0' && MA.enabled(location.search);
  // XW1: the test-only reward log (?test=1): a ring buffer of {t, kind}, no text
  const EVENTS = [], EVENT_MAX = 64;
  // BB: chiptune cues (MMSfx -> MMChip voices, CHIP-AUDIO.md). Mute / Music follow the shared keys (mm-sfx-muted, Music); the
  // AudioContext is only made by a sound from a tap or key. SOUNDS is a small name ring the test handle reads (no audio needed).
  const SOUNDS = [];
  let sfx = null;
  try { sfx = window.MMSfx ? window.MMSfx.create({ storage: window.localStorage }) : null; } catch (e) { sfx = null; }
  let heard = false; // no AudioContext before the first tap or key (browsers block it and warn); load-time medals stay silent
  const hear = () => { heard = true; window.removeEventListener('pointerdown', hear, true); window.removeEventListener('keydown', hear, true); };
  window.addEventListener('pointerdown', hear, true); window.addEventListener('keydown', hear, true);
  function cue(name) { if (SOUNDS.length >= 40) SOUNDS.shift(); SOUNDS.push(name); if (sfx && heard) { try { sfx.play(name); } catch (e) { /* audio is optional */ } } }
  const CUE_OF = { gather: 'pickup', glint: 'pickup', sparkle: 'coin', spot: 'blip', tame: 'level_up', rare_tame: 'chest', tame_progress: 'pop', craft: 'confirm',
    medal: 'unlock', sail: 'portal', launch: 'portal', ride: 'select', ability: 'jump', ice_crack: 'warn', rematch: 'boss', rematch_won: 'chest' };
  function logEvent(kind) { if (Object.prototype.hasOwnProperty.call(CUE_OF, kind)) cue(CUE_OF[kind]); if (!TEST) return; if (EVENTS.length >= EVENT_MAX) EVENTS.shift(); EVENTS.push({ t: Math.round(simT * 1000) / 1000, kind: kind }); }

  // ---------- storage (own keys only; every access guarded) ----------
  const store = (() => { try { return window.localStorage; } catch (e) { return null; } })();
  const memStore = { getItem: () => null, setItem: () => {} };
  const S = store || memStore;
  const readJson = (k) => { try { const s = S.getItem(k); return typeof s === 'string' ? JSON.parse(s) : null; } catch (e) { return null; } };
  let save = ISL.load(S, Date.now());
  const FIRST_VISIT = !save || !save.isles || !Object.keys(save.isles).length; // 8B: the how-to card shows only then
  // PI2: one-thumb mode (auto-attack the nearest foe + the mount ability button by the stick). The same per-device switch as the Realm's
  // one-thumb mode (mm-auto-fire + mm-aim-toggle both '1', never in a save); ?onethumb=1 / 0 forces it for this visit.
  const OT_KEYS = ['mm-auto-fire', 'mm-aim-toggle'];
  let ONE_THUMB = Q.get('onethumb') === '1' ? true : Q.get('onethumb') === '0' ? false : OT_KEYS.every((k) => { try { return S.getItem(k) === '1'; } catch (e) { return false; } });
  const tames = TAMES.load(S); // corrupt -> the empty stable; written only on a tame / party / mount change

  // the island: ?isle= (isle id or pack id), else from the Hub the island you were last on (Hearth Isle for a new save), else the jungle (B8)
  const rawIsle = Q.get('isle');
  const wantIsle = rawIsle ? ISL.isleFor(rawIsle) : (Q.get('from') === 'hub' ? save.at : '');
  const pickIsle = wantIsle && has(ISL.ISLES, wantIsle) && ISL.ISLES[wantIsle].pack && BP.resolveId(ISL.ISLES[wantIsle].pack) ? wantIsle : 'jungle';
  // IF1: a locked island (reef without a raft, mars without a rocket core) opened by URL - a shared or stale link, a Continue URL -
  // lands at the home dock instead, so no trip and no visit medal is skipped. ?test=1 keeps the direct load for the test bots.
  const openAtLoad = (id) => ['home', 'jungle', 'ice'].indexOf(id) >= 0 || ISL.isUnlocked(save, id) || (Array.isArray(save.visited) && save.visited.indexOf(id) >= 0);
  const URL_LOCKED = !TEST && !openAtLoad(pickIsle) ? pickIsle : '';
  const ISLE = URL_LOCKED ? 'home' : pickIsle;
  if (URL_LOCKED) { try { const q = new URLSearchParams(location.search); q.set('isle', 'meadow'); q.set('at', 'dock'); q.delete('seed'); history.replaceState(null, '', location.pathname + '?' + q.toString()); } catch (e) { /* ignore */ } }
  const PACK_ID = BP.resolveId(ISL.ISLES[ISLE].pack);
  const PACK = BP.get(PACK_ID);
  const DRAW_BIOME = { meadow: 'home', tundra: 'ice' }[PACK_ID] || PACK_ID;
  const HOME = ISLE === 'home';
  const ISLE_PARAM = { home: 'meadow', ice: 'tundra' };
  const isleName = (id) => { const isle = ISL.ISLES[id]; const pk = isle && BP.get(isle.pack); return pk ? pk.name : id; };
  const todayQ = Q.get('today');

  const seedQ = URL_LOCKED ? null : Q.get('seed');
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
  // X1 swim water: pack terrain whose hazard says swim / breath (the reef lagoon, coral shallows and kelp beds) is open water. On foot it
  // blocks like a wall; a swim mount (Tidesteed, Skimray: def.ride.swim) crosses it, and swimming creatures move through it.
  const SWIM_T = new Uint8Array(NAMES.length);
  Object.keys(PACK.hazards || {}).forEach((n) => { const id = O.TERRAIN_ALL[n], hz = PACK.hazards[n]; if (id !== undefined && hz && (hz.swim || hz.breath > 0)) SWIM_T[id] = 1; });
  // X5: MMIsleEnv decides which terrain is deep water (the same tiles as X1: the pack's swim / breath hazards); its flag off keeps X1
  const ENV = window.MMIsleEnv || null;
  const ENVR = ENV ? ENV.rules(PACK_ID, (k) => Q.get(k)) : { swim: false, warmth: false, oxygen: false, gravity: false };
  if (ENV && ENVR.swim) NAMES.forEach((n, id) => { SWIM_T[id] = ENV.swimAt(n, null, has(PACK.hazards, n) ? PACK.hazards[n] : null).needSwim ? 1 : 0; });
  const swimAt = (tx, ty) => SWIM_T[O.tileAt(world, tx, ty)] === 1;
  // XW1: terrain an active mount ability crosses (dive: deep water / abyss; hover: dust shallows / lava vents) or crosses at full speed
  // (skim: kelp beds / coral shallows). Set when an ability starts, cleared when it ends (never per frame).
  const PASS_T = new Uint8Array(NAMES.length), NOSLOW_T = new Uint8Array(NAMES.length);
  const inWorld = (tx, ty) => tx >= 0 && ty >= 0 && tx < W && ty < H;
  // the hero's tile rule (ride is declared further down; read lazily)
  const heroSolidAt = (tx, ty) => (inWorld(tx, ty) && PASS_T[O.tileAt(world, tx, ty)] === 1 ? false : solidAt(tx, ty) || (swimAt(tx, ty) && !CMP.canSwim(ride)));
  const walkableAt = (tx, ty) => !solidAt(tx, ty) && !swimAt(tx, ty);
  const tileOf = (px) => Math.floor(px / TILE);
  function moveScaleAt(tx, ty) { const t = O.tileAt(world, tx, ty); return NOSLOW_T[t] || PASS_T[t] ? 1 : crackedAt(tx, ty) ? THIN_SLOW : SLOW[t] || 1; }
  // TD1 thin ice (tundra): standing on one ice_thin tile shows a crack telegraph after ICE_WARN s and cracks it at ICE_CRACK s into slush
  // for ICE_SLUSH s (x THIN_SLOW footing only: never damage, never water, never a trap). The cracked tiles live in two fixed arrays (no
  // per-frame allocation, no change to world.terrain or the baked chunks); ?thinice=0 turns it off.
  const ICE_THIN_T = O.TERRAIN_ALL.ice_thin, ICE_WARN = 1.0, ICE_CRACK = 1.5, ICE_SLUSH = 20, THIN_SLOW = 0.6, CRACK_MAX = 32;
  const THIN_ICE = PACK_ID === 'tundra' && ICE_THIN_T !== undefined && Q.get('thinice') !== '0';
  const ice = { tile: -1, t: 0, n: 0, made: 0, warnN: 0, told: false, idx: new Int32Array(CRACK_MAX).fill(-1), until: new Float64Array(CRACK_MAX) };
  function crackedAt(tx, ty) {
    if (!ice.n) return false;
    const k = ty * W + tx;
    for (let i = 0; i < CRACK_MAX; i++) if (ice.idx[i] === k) return true;
    return false;
  }
  const bandName = (z) => (PACK.bands[z] ? PACK.bands[z].name.replace(/_/g, ' ') : 'open sea');

  // props / sites per chunk, baked into the chunk canvas (never drawn per frame)
  const chunkProps = new Map();
  const pushProp = (p, kind) => { const k = Math.floor(p.x / CH) + ',' + Math.floor(p.y / CH); if (!chunkProps.has(k)) chunkProps.set(k, []); chunkProps.get(k).push({ x: p.x, y: p.y, kind: kind || p.kind }); };
  world.props.forEach((p) => pushProp(p));
  if (world.dock) pushProp(world.dock, 'dock');

  // ---------- canvas ----------
  const view = $('view'), g = view.getContext('2d');
  let DPR = GFX_LOW ? 1 : Math.min(2, window.devicePixelRatio || 1);
  if (PERF) PERF.applyCanvas(view, GFX_TIER); // PI2: tags the canvas (data-mm-tier); the backing store stays the page's own
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
  // b30 jungle tile art (falls back to the code palette per tile) + on the jungle the b33 prop PNGs (fall back to the code props by id)
  // X1: b30 is jungle terrain only. Its id map and palette stop at the jungle ids, so on the reef / tundra / mars / home it painted every
  // pack tile as deep water; those islands bake with the pack palette (MMChunkBake + PAL) instead.
  // AW2: Hearth Isle (meadow) bakes the b35 tiles through the same layer, with the page's own names + pack palette for every other tile
  const IA = !(ART && window.MMIsleArt) ? null : PACK_ID === 'jungle' ? window.MMIsleArt.create({ art: true, props: true })
    : PACK_ID === 'meadow' ? window.MMIsleArt.create({ art: true, props: true, pack: 'meadow', names: NAMES, palette: Object.assign({}, window.MMIsleArt.SETS.meadow.palette, PAL) }) : null;
  // the b35 boat rides at the dock (meadow art only): the first open-water tile next to it
  if (IA && IA.pack === 'meadow' && world.dock) {
    const dw = O.TERRAIN_ALL.deep_water, sw = O.TERRAIN_ALL.shallow_water;
    const spot = [[1, 0], [-1, 0], [0, 1], [0, -1], [2, 0], [-2, 0], [0, 2], [0, -2]].map((d) => ({ x: world.dock.x + d[0], y: world.dock.y + d[1] }))
      .find((q) => { const t = O.tileAt(world, q.x, q.y); return t === dw || t === sw; });
    if (spot) pushProp(spot, 'boat');
  }
  if (IA) IA.ready.then(() => { if (IA.active() || IA.propsActive()) chunkCache = CB.makeCache(LOW ? 12 : 24); });
  let bakesLeft = 0;
  const mk = (w, h) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; };
  const PROP_ART = {
    jungle_tree: ['#1d4a2a', '#2f6b3a', 13], tree_palm: ['#3a7a3a', '#8a6a3a', 11], giant_fern: ['#2f8a4a', '#1f5a32', 9], hanging_vine: ['#2a6a3a', '#1a4a2a', 7],
    reeds: ['#6a8a4a', '#4a6a2a', 6], banana_plant: ['#5aa04a', '#e8d05a', 9], log: ['#6a4a2a', '#4a321a', 8], shell: ['#f2e2c8', '#c8a888', 4],
    temple_pillar: ['#8a9a88', '#5a6a58', 8], ruin_pillar: ['#8a9a88', '#5a6a58', 8], shrine: ['#c8b88a', '#7a6a4a', 9], tower: ['#7a7a8a', '#4a4a5a', 10],
    campfire: ['#e07a3a', '#5a3a2a', 6], tent: ['#c86a4a', '#7a3a2a', 9], boss_altar: ['#7a3a5a', '#d05a8a', 12], portal_rift: ['#8a5ae0', '#e0d0ff', 11], dock: ['#8a5a3b', '#5a3a22', 10],
    // X1: code props for the other islands (4th field: 'r' rock / low mound, 'c' crystal spike; default is a round crown on a stem)
    tree: ['#4f9a45', '#6a4a2a', 12], bush_berry: ['#3f8a3f', '#c8324a', 7], flower: ['#f2a0c0', '#4f9a45', 4, 'r'], clover: ['#5aa84a', '#3a7a2a', 4, 'r'], garden_plot: ['#7a5232', '#4f3622', 7, 'r'],
    kelp_tall: ['#3f8a5a', '#2a5a3a', 8], coral: ['#ff8a76', '#c0503f', 6, 'c'], anemone: ['#f07ab0', '#a04a7a', 5, 'r'], pearl_clam: ['#e8e0f0', '#8a8098', 5, 'r'],
    driftwood: ['#9a7a5a', '#6a4a32', 7, 'r'], wreck_mast: ['#7a5a3a', '#4a321a', 9],
    pine_snowy: ['#3a6a5a', '#f4f8ff', 11, 'c'], snow_drift: ['#f4f8ff', '#c8d8ec', 8, 'r'], frostberry_bush: ['#5a7a6a', '#7ab8f0', 7], ice_spike: ['#bfe4ff', '#7aa8d0', 7, 'c'],
    frozen_mammoth_tusk: ['#f0e8d8', '#a89a80', 8, 'r'], hot_spring_steam: ['#e8f4f4', '#9ad4d4', 6, 'r'], crystal_blue: ['#7ad0ff', '#3a7ac0', 7, 'c'],
    meteor_rock: ['#5a3a30', '#3a2420', 7, 'r'], rover_wreck: ['#b8bcc0', '#6a6e72', 9, 'r'], crystal_red: ['#ff6a4a', '#a0302a', 7, 'c'], oxygen_plant: ['#7ad0a0', '#3a8a6a', 6],
    solar_panel: ['#3a5a8a', '#c8ccd0', 8, 'r'], probe_lander: ['#d8dce0', '#8a8e92', 8, 'c']
  };
  function drawProp(c, kind, px, py) {
    const a = PROP_ART[kind] || ['#3a5a3a', '#2a3a2a', 6], r = a[2], cx = px + TILE / 2, cy = py + TILE / 2;
    c.fillStyle = 'rgba(0,0,0,0.22)'; c.beginPath(); c.ellipse(cx, cy + r * 0.7, r, r * 0.35, 0, 0, Math.PI * 2); c.fill();
    if (a[3] === 'r') { // low mound / rock
      c.fillStyle = a[1]; c.beginPath(); c.ellipse(cx, cy + r * 0.25, r, r * 0.6, 0, 0, Math.PI * 2); c.fill();
      c.fillStyle = a[0]; c.beginPath(); c.ellipse(cx - r * 0.15, cy, r * 0.8, r * 0.5, 0, 0, Math.PI * 2); c.fill();
      return;
    }
    if (a[3] === 'c') { // spike / crystal / pine
      c.fillStyle = a[0]; c.beginPath(); c.moveTo(cx, cy - r * 1.6); c.lineTo(cx + r * 0.7, cy + r * 0.6); c.lineTo(cx - r * 0.7, cy + r * 0.6); c.closePath(); c.fill();
      c.fillStyle = a[1]; c.beginPath(); c.moveTo(cx, cy - r * 1.6); c.lineTo(cx + r * 0.7, cy + r * 0.6); c.lineTo(cx + r * 0.1, cy + r * 0.6); c.closePath(); c.fill();
      return;
    }
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
    let code = false;
    if (!cv) { cv = CB.bakeChunkCanvas(mk, world.terrain, W, cx, cy, PAL, null, { names: NAMES, h: H }); code = !!cv; }
    if (!cv) return bakeFlat(cx, cy);
    const c = cv.getContext('2d');
    // 8B: the code-drawn terrain gets seeded detail pixels (8 tile variants) and stepped edges, once per chunk bake
    if (code && !GFX_LOW && window.MMIsleArt && window.MMIsleArt.detail) window.MMIsleArt.detail(c, world.terrain, W, H, cx, cy, { names: NAMES, palette: PAL, tile: TILE, ch: CH, seed: parseInt(SEED, 10) % 100003, create: mk });
    // props of this chunk and its 8 neighbours, back to front: a 64 px tree near a chunk edge is painted on both sides of the seam
    const pa = IA && IA.propsActive() ? IA.props() : null, list = [];
    for (let ny = cy - 1; ny <= cy + 1; ny++) for (let nx = cx - 1; nx <= cx + 1; nx++) { const l = chunkProps.get(nx + ',' + ny); if (l) for (let i = 0; i < l.length; i++) list.push(l[i]); }
    list.sort((a, b) => a.y - b.y || a.x - b.x);
    for (let i = 0; i < list.length; i++) {
      const p = list[i], px = (p.x - cx * CH) * TILE, py = (p.y - cy * CH) * TILE;
      if (px < -3 * TILE || py < -3 * TILE || px > CPX + 2 * TILE || py > CPX + 2 * TILE) continue;
      const art = pa ? window.MMIsleArt.propFor(pa, p.kind, p.x, p.y) : null;
      if (art) { propsBaked.png++; window.MMIsleArt.drawPropArt(c, art, p.kind, px, py, TILE); }
      else if (p.kind !== 'boat' && p.x >= cx * CH && p.x < (cx + 1) * CH && p.y >= cy * CH && p.y < (cy + 1) * CH) { propsBaked.code++; drawProp(c, p.kind, px, py); }
    }
    return cv;
  }
  const propsBaked = { png: 0, code: 0 }; // test handle counters (bake time only)
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
  // b31a / b32 PNG strips: loaded once (the jungle loads all five species, other isles only the species in your stable), baked to native
  // size; a creature without a complete set (or ?art=0) keeps the code-drawn MMCreatureDraw bake above.
  const STRIP_KINDS = MS ? MS.kindsFor(PACK_ID, tames.roster.map((t) => t.sp)) : [];
  const STRIPS = ART && MS && STRIP_KINDS.length ? MS.create({ kinds: STRIP_KINDS, create: mk, rim: true }) : null;
  const stripKind = (k) => (MS && k && has(MS.SPECS, k) ? k : null);
  const stState = { dying: false, ko: false, eating: false, ph: '', moving: false }; // reused every frame
  const seat = { x: 0, y: 0 };
  // the strip a creature shows now (null -> code bake). Updates c.dir / c.act / c.at0 in place; no allocation.
  function stripOf(c, moving) {
    if (!STRIPS || !c.sk || !STRIPS.has(c.sk)) return null;
    if (c.ph === 'wind' || c.ph === 'strike') c.dir = MS.dirCode(Math.cos(c.ang), Math.sin(c.ang), c.dir, 0.01);
    else if (!c.ko) c.dir = MS.dirCode(c.vx, c.vy, c.dir);
    stState.dying = false; stState.ko = c.ko; stState.eating = c.eatT > 0; stState.ph = c.ph; stState.moving = moving;
    const act = MS.actionFor(c.sk, stState);
    if (act !== c.act) { c.act = act; c.at0 = simT; }
    return STRIPS.get(c.sk, act, c.dir);
  }
  // frame for a creature's current action: loops run on its own clock, a wind-up (roar / attack) is stretched over the wind-up time
  function stripFrame(c) {
    const a = c.act;
    if (a === 'idle' || a === 'move' || a === 'sleep' || a === 'eat') return MS.frameIndex(a, c.t, c.sk);
    const el = simT - c.at0;
    if (c.ph === 'wind') { const w = specOf(c.sp, c.kind).atk.windup || 0.5; return MS.frameIndex(a, el * MS.duration(a, c.sk) / w, c.sk); }
    return MS.frameIndex(a, el, c.sk);
  }
  // dying creatures play their death strip from a fixed pool (6 slots, reused)
  const deadPool = []; for (let i = 0; i < GFX.ghosts; i++) deadPool.push({ on: false, sk: '', x: 0, y: 0, dir: 0, t0: 0, id: '' });
  let deathsShown = 0;
  function addDeath(c) {
    if (!STRIPS || !c.sk || !STRIPS.has(c.sk)) return;
    let slot = deadPool[0];
    for (let i = 0; i < deadPool.length; i++) { if (!deadPool[i].on) { slot = deadPool[i]; break; } if (deadPool[i].t0 < slot.t0) slot = deadPool[i]; }
    slot.on = true; slot.sk = c.sk; slot.x = c.x; slot.y = c.y; slot.dir = c.dir; slot.t0 = simT; slot.id = '';
  }
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
  // TD1: the tundra and mars rares come from this page-side table (the packs carry no `rare` there, so pack-golden stays identical): the
  // same seeded IsleCreatures.rareSpot, at most one alive. Each is a code palette swap of its species (aurora frostfox, only out on an
  // aurora night; chrome rustbeetle), tameable like the plain one, and a tame (never a kill) adds its MMIsleCraft rare item.
  const RARE_EXTRA = { tundra: { frostfox: { zone: 3 } }, mars: { rustbeetle: { zone: 3 } } };
  const RARE_VARIANT = { frostfox: { v: 'aurora', name: 'Aurora Frostfox', item: 'aurora_shard', night: true, tint: '#7fffd4', glow: '#e0b8ff' },
    rustbeetle: { v: 'chrome', name: 'Chrome Rustbeetle', item: 'chrome_flake', night: false, tint: '#dfe8f2', glow: '#ffffff' } };
  const RARE_PACK = !PACK.rare && has(RARE_EXTRA, PACK_ID) && Q.get('rares') !== '0' ? { id: PACK.id, rare: RARE_EXTRA[PACK_ID] } : PACK;
  const rare = { spot: IC.rareSpot ? IC.rareSpot(world, RARE_PACK, SEED, walkableAt) : null, live: 0, done: false, n: 0 };
  const RARE_VAR = rare.spot && RARE_PACK !== PACK && has(RARE_VARIANT, rare.spot.creature) ? RARE_VARIANT[rare.spot.creature] : null;
  // the variant's look: the species' code bake recoloured once (source-atop tint + a few glints), cached per bake
  const varArt = {};
  function variantArt(a, V) {
    if (!a || !V) return a;
    const key = a.id + '|' + V.v;
    if (varArt[key]) return varArt[key];
    const frames = {};
    Object.keys(a.frames).forEach((act) => {
      frames[act] = a.frames[act].map((cv, fi) => {
        const c2 = mk(cv.width, cv.height), x = c2.getContext('2d');
        x.drawImage(cv, 0, 0);
        x.globalCompositeOperation = 'source-atop';
        x.globalAlpha = 0.55; x.fillStyle = V.tint; x.fillRect(0, 0, cv.width, cv.height);
        x.globalAlpha = 0.9; x.fillStyle = V.glow;
        const u = Math.max(2, Math.round(cv.width / 24));
        for (let k = 0; k < 5; k++) x.fillRect(Math.round(cv.width * (0.3 + 0.1 * ((k * 3 + fi) % 5))), Math.round(cv.height * (0.35 + 0.09 * ((k * 2 + fi) % 5))), u, u);
        return c2;
      });
    });
    varArt[key] = Object.assign({}, a, { frames: frames, id: a.id + '_' + V.v });
    return varArt[key];
  }
  const isBig = (c) => c.size === 'L' || c.size === 'XL';

  function addCreature(sp, x, y, gi, j, wid, own) { // own: a creature-owned MMRng stream (TD1 rares) instead of the shared AI stream
    const R = own || rng;
    const kind = IC.kindOf(sp, gi);
    const s = specOf(sp, kind);
    const c = { uid: ++uid, sp: sp, kind: kind, base: s.base, x: x, y: y, hx: x, hy: y, vx: 0, vy: 0, hp: s.hp, maxHp: s.hp, rad: s.rad, size: s.size, mood: s.mood,
      angry: 0, think: R.next() * 0.1, cd: 0, flash: 0, moving: false, t: R.next() * 4, gi: gi, seen: false, art: null,
      ph: '', pt: 0, ang: 0, ox: x, oy: y, hitDone: false, tgAt: -1, ko: false, calm: false, hostile: s.mood === 'hostile', awake: true,
      tm: null, tmAcc: 0, leaving: 0, wid: wid || (gi >= 0 ? 'g' + gi + '_' + (j | 0) : 'u' + uid), lv: 1,
      sk: stripKind(kind), dir: 0, act: '', at0: 0, eatT: 0, drawn: '', src: '', swim: false, rare: false, rng: own || null };
    c.swim = !!(s.def && s.def.behaviours && s.def.behaviours.indexOf('swim') >= 0);
    c.def = s.def;
    if (s.def) c.lv = IC.levelFor(s.def, SEED, c.wid);
    if (TAME && s.def && s.def.tame) c.tm = TM.init(s.def, { seed: 'isles|' + SEED, wildId: c.wid, level: c.lv });
    c.art = baker.bake({ id: kind || sp, archetype: s.arch, size: s.size, biome: DRAW_BIOME }, { dpr: DPR }); // the code bake: always there as the fallback
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
    rareTick(htx, hty);
    // despawn far creatures (their group can come back later, nothing is lost)
    creatures = creatures.filter((c) => {
      if (Math.hypot(c.x - hero.x, c.y - hero.y) <= DESPAWN_R * TILE && !(c.leaving > 0 && c.leaving < 0.05)) return true;
      if (c.gi >= 0) groupState[c.gi].alive = Math.max(0, groupState[c.gi].alive - 1);
      if (c.rare) rare.live = 0; // wandered off: it can come back later
      return false;
    });
  }
  // X1 rare spawn: the pack's `rare` entry (isleback_turtle on the reef zone 2, oakback on Hearth Isle zone 3) at one seeded spot per
  // island (IsleCreatures.rareSpot). It comes in through the same spawn tick as the groups, at most one alive, never on top of the hero.
  function rareTick(htx, hty) {
    const sp = rare.spot;
    if (!sp || rare.live || rare.done || creatures.length >= CAP) return;
    if (RARE_VAR && RARE_VAR.night && !tdNight()) return; // TD1: the aurora frostfox only comes out on an aurora night
    const dd = Math.hypot(sp.x - htx, sp.y - hty);
    if (dd > SPAWN_R || dd < 7) return;
    const s = specOf(sp.creature, IC.kindOf(sp.creature, -1));
    if (isBig({ size: s.size }) && bigN >= BIG_CAP) return;
    // TD1: a page-table rare wanders on its own seeded stream, so its coming and going never reshuffles the island's other creatures
    const c = addCreature(sp.creature, (sp.x + 0.5) * TILE, (sp.y + 0.5) * TILE, -1, 0, 'rare_' + sp.creature, RARE_VAR ? RNG.create('isles|' + PACK_ID + '|' + SEED + '|rare|' + rare.n) : null);
    c.rare = true;
    if (RARE_VAR) { c.variant = RARE_VAR.v; c.sk = null; c.art = variantArt(c.art, RARE_VAR); } // TD1: the code-drawn palette swap
    rare.live = c.uid; rare.n++;
    if (isBig(c)) bigN++;
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
    // befriending: it stays and watches you; IF1: when you drift off a little it pads after you (so a short step back never loses it)
    if (c.calm) { if (POUCH && d > 1.8 * TILE && d < 6 * TILE && !hero.dead) { c.vx = dx / d * s.speed * 0.5; c.vy = dy / d * s.speed * 0.5; } else { c.vx = 0; c.vy = 0; } return; }
    const home = Math.hypot(c.x - c.hx, c.y - c.hy);
    if (home > LEASH) { c.angry = 0; const hd = home || 1; c.vx = (c.hx - c.x) / hd * s.speed; c.vy = (c.hy - c.y) / hd * s.speed; return; }
    // IF1 mercy: a badly hurt hero (<= 1/3 HP) who has not shot for a second is left alone by wild creatures (they break off the chase;
    // an attack already winding up still lands). Never in a boss fight. Shooting again ends it.
    // A rest spot (dock, campfire, hot spring, dome, home) is a safe room: nothing starts a chase or an attack on you while you stand there.
    const mercy = !!REST && ((hero.hp <= hero.maxHp / 3 && hero.shotT <= 1) || heroResting()) && !(bz.engaged && bossAlive());
    const chase = !hero.dead && !mercy && s.dmg > 0 && c.mood !== 'shy' && (c.angry > 0 || (c.mood === 'hostile' && d < s.aggroR));
    if (chase) {
      if (c.cd <= 0 && d < c.rad + HERO_R + s.atk.reach * 0.8) { startAttack(c, s, dx, dy); return; }
      c.vx = dx / d * s.speed * 1.15; c.vy = dy / d * s.speed * 1.15; return;
    }
    // shy creatures flee when startled (hit, or the hero shooting nearby); with ?tame=0 they flee whenever the hero is close (B8)
    if (c.mood === 'shy' && d < 4 * TILE && (!TAME || !c.tm || c.angry > 0 || hero.shotT > 0)) { c.vx = -dx / d * s.speed * 1.2; c.vy = -dy / d * s.speed * 1.2; return; }
    if (c.mood === 'shy' && c.angry > 0 && d < 8 * TILE) { c.vx = -dx / d * s.speed * 1.2; c.vy = -dy / d * s.speed * 1.2; return; }
    // IF1: a feed / calm tameable smells food it likes in your pouch or bag and wanders over (never while you shoot or after a scare)
    if (curious(c, d)) { const k = d > 3 * TILE ? 0.55 : 0.3; c.vx = dx / d * s.speed * k; c.vy = dy / d * s.speed * k; return; }
    const R = c.rng || rng;
    if (R.next() < 0.12) {
      if (R.next() < 0.45) { c.vx = 0; c.vy = 0; }
      else { const a = R.next() * Math.PI * 2; c.vx = Math.cos(a) * s.speed * 0.5; c.vy = Math.sin(a) * s.speed * 0.5; }
    }
  }
  function curious(c, d) {
    if (!TAME || !POUCH || hero.dead || hero.shotT > 0 || c.angry > 0 || !c.tm || c.tm.st !== 'wild' || d > 7 * TILE || d < 1.5 * TILE) return false;
    const def = c.def, diet = def && def.tame && def.tame.method !== 'knockout' ? def.diet : null;
    if (!diet) return false;
    for (let i = 0; i < diet.length; i++) if ((pouch[diet[i]] | 0) > 0 || (!CLASSIC_POUCH && invCount(diet[i]) > 0)) return true;
    return false;
  }
  const HURT_LOG = []; // last few hero hits {t, uid} (test handle; fixed size)
  function dealHero(c, s) {
    const before = hero.hp;
    hurtHero(s.dmg * 2, true);
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
      c.t += dt; c.cd -= dt; c.flash -= dt; c.angry -= dt; c.tmAcc += dt; if (c.eatT > 0) c.eatT -= dt;
      if (c.leaving > 0) c.leaving = Math.max(0.01, c.leaving - dt);
      if (c.stun > 0) { c.stun -= dt; c.vx = 0; c.vy = 0; c.moving = false; continue; } // XW1: dazed by a stomp / roar (never hurt)
      c.think -= dt;
      if (c.think <= 0) { c.think += 0.1; think(c); } // 10 Hz, staggered by the random start phase
      if (c.ph) attackStep(c, s, dt);
      if (c.ko) { c.vx = 0; c.vy = 0; }
      const nx = c.x + c.vx * dt, ny = c.y + c.vy * dt;
      if (!creatureSolid(c, tileOf(nx), tileOf(c.y))) c.x = nx; else { c.vx = -c.vx; }
      if (!creatureSolid(c, tileOf(c.x), tileOf(ny))) c.y = ny; else { c.vy = -c.vy; }
      c.moving = Math.abs(c.vx) + Math.abs(c.vy) > 4;
      c.awake = !c.ko;
      c.hostile = !c.ko && !c.calm && s.dmg > 0 && (c.mood === 'hostile' || c.angry > 0);
      if (!c.seen && Math.abs(hero.x - c.x) < 8 * TILE && Math.hypot(hero.x - c.x, hero.y - c.y) < 8 * TILE) { c.seen = true; noteSeen(c); }
    }
    if (creatures.length && creatures.some((c) => c.leaving > 0 && c.leaving <= 0.01)) removeWhere((c) => c.leaving > 0 && c.leaving <= 0.01, 0);
  }
  // IF1: the first sighting of a species ever is a journal entry (a small reward beat); later ones just count
  function noteSeen(c) {
    const k = c.kind || c.sp, first = !(save.log && save.log.seen && save.log.seen[k] > 0);
    ISL.noteLog(save, 'seen', k, 1); dirty = true;
    // TD1: a rare variant is its own journal line (frostfox_aurora / rustbeetle_chrome), on top of its species
    const vk = c.variant ? k + '_' + c.variant : '', vFirst = !!vk && !(save.log && save.log.seen && save.log.seen[vk] > 0);
    if (vk) ISL.noteLog(save, 'seen', vk, 1);
    if (vFirst && RARE_VAR) { toast('New in your journal: ' + RARE_VAR.name + ' (rare)!'); logEvent('spot'); reward(); return; }
    if (!first) return;
    const d = CR.get(k);
    toast('New in your journal: ' + (d ? d.name : String(k).replace(/_/g, ' ')) + '.');
    logEvent('spot'); reward();
  }
  const creatureSolid = (c, tx, ty) => solidAt(tx, ty) || (!c.swim && swimAt(tx, ty));
  function removeWhere(fn, cool) {
    creatures = creatures.filter((c) => {
      if (!fn(c)) return true;
      if (c.rare) { rare.live = 0; if (cool > 0) rare.done = true; } // killed or tamed: the island's rare is gone for this visit
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
    if (tx >= 0 && ty >= 0 && tx < W && ty < H && walkableAt(tx, ty)) { hero.x = (savedIsle.pos.x) * TILE; hero.y = (savedIsle.pos.y) * TILE; }
  }
  if ((Q.get('at') === 'dock' || URL_LOCKED) && world.dock) { hero.x = (world.dock.x + 0.5) * TILE; hero.y = (world.dock.y + 0.5) * TILE; }
  // X7: HP carries across a trip (save.hp, absent = full); a knocked-out hero is saved as full (they respawn anyway)
  if (typeof save.hp === 'number' && save.hp >= 1) hero.hp = Math.min(maxHp, save.hp);
  let god = false, xp = 0, kills = 0, tamedN = 0, heroLost = 0;
  const loot = {};
  // IF1: the island's own pouch (the jungle pouch plus its staple food); ?pouch=classic is the old jungle pouch and pouch-only feeding
  const CLASSIC_POUCH = Q.get('pouch') === 'classic' || !POUCH;
  const pouch = POUCH ? POUCH.starter(ISLE, { classic: CLASSIC_POUCH }) : Object.assign({}, IC.STARTER_POUCH);
  // G-26 (b05-04, b05-06): picked glints / nodes and the pouch survive a reload. Own additive key pixeltown-isle-nodes-v1
  // { v:1, isles:{ <isle>:{ n:[[nodeIndex, untilMs], ...] (at most 200, only the ones still growing back), p:{ <food>: 0..99 } } } }.
  // Wall clock in page code only; hostile / missing storage = everything ready and the starter pouch (as before).
  const NODES_KEY = 'pixeltown-isle-nodes-v1', NODES_MAX = 200;
  function nodesRead() { try { const raw = S.getItem(NODES_KEY); const o = raw && raw.length < 65536 ? JSON.parse(raw) : null; return o && typeof o === 'object' && !Array.isArray(o) && o.isles && typeof o.isles === 'object' && !Array.isArray(o.isles) ? o : { v: 1, isles: {} }; } catch (e) { return { v: 1, isles: {} }; } }
  const nodesMine = (() => { const r = nodesRead().isles[ISLE]; return r && typeof r === 'object' && !Array.isArray(r) ? r : {}; })();
  if (nodesMine.p && typeof nodesMine.p === 'object' && !Array.isArray(nodesMine.p)) Object.keys(pouch).forEach((k) => { const v = nodesMine.p[k]; if (typeof v === 'number' && Number.isFinite(v)) pouch[k] = Math.max(0, Math.min(99, Math.floor(v))); });
  let lastHurtT = -1e9, lastRewardT = 0; // IF1: sim time of the last hit taken (regen) and of the last reward (sparkles)
  let lastFindT = 0; // the first-ten pity's clock: the last find (an item, tame, drop or journal entry); a hot-spring soak is a rest, not a find
  function reward(rest) { lastRewardT = simT; if (!rest) lastFindT = simT; }
  function blocked(x, y) {
    const r = HERO_R - 1;
    return heroSolidAt(tileOf(x - r), tileOf(y - r)) || heroSolidAt(tileOf(x + r), tileOf(y - r)) || heroSolidAt(tileOf(x - r), tileOf(y + r)) || heroSolidAt(tileOf(x + r), tileOf(y + r));
  }
  // the nearest tile the hero can stand on (ring search out to 16 tiles); used when a swim mount is left in the water
  function nearestWalkable(px, py) {
    const tx = tileOf(px), ty = tileOf(py);
    if (walkableAt(tx, ty) && !blocked((tx + 0.5) * TILE, (ty + 0.5) * TILE)) return null;
    for (let r = 1; r <= 16; r++) {
      let best = null, bd = 1e9;
      for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
        const x = tx + dx, y = ty + dy;
        if (!walkableAt(x, y) || blocked((x + 0.5) * TILE, (y + 0.5) * TILE)) continue;
        const d = Math.hypot((x + 0.5) * TILE - px, (y + 0.5) * TILE - py);
        if (d < bd) { bd = d; best = { x: x, y: y }; }
      }
      if (best) return best;
    }
    return { x: world.spawnPoint.x, y: world.spawnPoint.y };
  }
  function moveHero(mx, my, dt) {
    let len = Math.hypot(mx, my);
    if (len > 1) { mx /= len; my /= len; len = 1; }
    hero.scale = CMP.moveScale(ride, moveScaleAt(tileOf(hero.x), tileOf(hero.y)));
    if (ENV_ON && envS.move !== 1) hero.scale *= envS.move; // X5: mars gravity x1.15, the tundra cold x0.8
    if (abilSpeed !== 1) hero.scale *= abilSpeed; // XW1: sprint
    if (bz.onIce) hero.scale *= ICE_SLOW; // XB: thin ice from the frost dragon's breath (never inside a hot spring)
    if (len < 0.05) return;
    hero.face.x = mx / len; hero.face.y = my / len;
    const v = SPEED * hero.scale * dt;
    const nx = hero.x + mx * v, ny = hero.y + my * v;
    if (!blocked(nx, hero.y)) hero.x = nx;
    if (!blocked(hero.x, ny)) hero.y = ny;
  }
  // soft (creature hits, IF1): a hit never takes you from above a quarter of your health straight to 0 - it leaves 1 HP, and the mercy
  // rule then lets you walk away. Boss attacks and the test hook are not soft (boss balance is unchanged).
  function hurtHero(n, soft) {
    if (god || hero.dead || hero.iframes > 0) return;
    if (ride) n = CMP.riderDamage(ride, n);
    if (!(n > 0)) return;
    if (REST && ENVR.oxygen && envS.emptyO) n = Math.max(1, Math.round(n * REST.hitScale(true))); // IF1: out of air, hits are halved
    const hpBefore = hero.hp;
    lastHurtT = simT;
    hero.hp = Math.max(0, hero.hp - n); hero.iframes = 0.6;
    cue(hero.hp <= 0 ? 'death' : 'hurt');
    if (soft && REST && hero.hp <= 0 && hpBefore > hero.maxHp / 4) hero.hp = 1;
    heroLost += hpBefore - hero.hp;
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
  const aimPt = { x: 0, y: 0 }; // the boss's aim point (reused)
  function nearestTarget(range) {
    let best = null, bd = range;
    creatures.forEach((c) => { const d = Math.hypot(c.x - hero.x, c.y - hero.y); if (d < bd && !c.calm) { bd = d; best = c; } });
    if (bossAlive() && !bz.ko) { const d = Math.hypot(bz.x - hero.x, bz.y - 36 - hero.y); if (d < bd + 2 * TILE) { aimPt.x = bz.x; aimPt.y = bz.y - 30; best = aimPt; } }
    return best;
  }
  function fire(dx, dy) {
    if (hero.dead || hero.cd > 0) return false;
    if (ride && !CMP.canFire(ride)) return false;
    let l = Math.hypot(dx, dy);
    if (!(l > 0)) { const t = nearestTarget(9 * TILE); if (t) { dx = t.x - hero.x; dy = t.y - hero.y; } else { dx = hero.face.x; dy = hero.face.y; } l = Math.hypot(dx, dy) || 1; }
    hero.cd = FIRE_CD; hero.shotT = 2;
    cue('shoot');
    if (bolts.length < 60) bolts.push({ x: hero.x, y: hero.y - 6, vx: dx / l * BOLT_SPEED, vy: dy / l * BOLT_SPEED, life: BOLT_LIFE, soothe: soothe && TAME });
    return true;
  }
  // PI2 one-thumb auto-attack: the nearest hostile creature (in soothe mode: the nearest awake, unsoothed one, to knock out for a tame) or a
  // live boss within AUTO_R, one pass, no arrays. Fires through fire(), so the cooldown, mount and death rules are the same as a tap.
  const AUTO_R = 7 * TILE;
  let autoN = 0;
  function autoAttack() {
    let best = null, bd = AUTO_R, bx = 0, by = 0;
    const sooth = soothe && TAME;
    for (let i = 0; i < creatures.length; i++) {
      const c = creatures[i];
      if (c.calm || c.ko || !(c.hostile || (sooth && c.tm))) continue;
      const d = Math.hypot(c.x - hero.x, c.y - 8 - hero.y);
      if (d < bd) { bd = d; best = c; bx = c.x; by = c.y - 8; }
    }
    const wearyTame = bz.st && bz.st.st === 'weary' && TAME && BOSS_TAMEABLE && !bz.rm; // G-22: auto-attack never finishes a boss you could tame
    if (bossAlive() && !bz.ko && !wearyTame) { const d = Math.hypot(bz.x - hero.x, bz.y - 36 - hero.y); if (d < bd + 2 * TILE) { best = bz; bx = bz.x; by = bz.y - 30; } }
    if (!best) return false;
    if (fire(bx - hero.x, by - hero.y)) { autoN++; return true; }
    return false;
  }
  // X4 drops: the creature's MMCreatures DROP_TABLES (its first table always rolls, a second one half the time), one weighted row each
  // with a count in [min, max], from a seeded drop stream. Everything goes into `inv` (crafting); food also refills the taming pouch.
  const DEFAULT_DROPS = { jungle: 'jungle_loot', reef: 'reef_loot', tundra: 'frost_loot', mars: 'mars_loot', meadow: 'fluff' };
  const dropRng = RNG.create('isles|' + PACK_ID + '|' + SEED + '|drops');
  const DROP_LOG = []; // last few drops {sp, item, n} (test handle; fixed size)
  function rollLoot(c) {
    const s = specOf(c.sp, c.kind);
    const tables = s.drops && s.drops.length ? s.drops : [DEFAULT_DROPS[PACK_ID] || 'jungle_loot'];
    const got = [];
    for (let t = 0; t < tables.length && t < 2; t++) {
      const tab = CR.dropTable ? CR.dropTable(tables[t]) : null;
      if (!Array.isArray(tab) || !tab.length) continue;
      if (t > 0 && dropRng.next() > 0.5) continue;
      let tw = 0; tab.forEach((r) => { tw += r[3] || 1; });
      let pick = dropRng.next() * tw, row = tab[0];
      for (let i = 0; i < tab.length; i++) { pick -= tab[i][3] || 1; if (pick <= 0) { row = tab[i]; break; } }
      const n = dropRng.int(Math.max(1, row[1] | 0), Math.max(1, row[2] | 0, row[1] | 0));
      loot[row[0]] = (loot[row[0]] || 0) + n;
      if (has(pouch, row[0])) pouch[row[0]] = Math.min(99, pouch[row[0]] + 1); // food drops refill the pouch
      const added = invAdd(row[0], n);
      if (DROP_LOG.length >= 8) DROP_LOG.shift();
      DROP_LOG.push({ sp: c.kind || c.sp, item: row[0], n: n, added: added });
      if (added) got.push(itemName(row[0]) + ' x' + added);
    }
    if (got.length) { toast('Dropped ' + got.join(', ') + '.'); reward(); }
  }
  function killCreature(c) {
    const s = specOf(c.sp, c.kind);
    xp += XP_BY_SIZE[s.size] || 4; kills++;
    cue('kill');
    addDeath(c);
    rollLoot(c);
    removeWhere((x) => x === c, 90000);
  }
  // hitCreature(c, dmg, how): how = 'soothe' (bolt in soothe mode) | 'comp' (a companion) | undefined (plain bolt)
  // G-22 (b05-03): companions never attack what you are taming. Always skipped: a KO / calm sleeper. While soothe mode is on: the last
  // soothe target (6 s) and any creature with soothe torpor. With soothe off (you are hunting) they fight anything hostile, as before.
  // (Plain befriend progress is not a skip: it builds up passively near every wild creature.) compSkip is the MMCompanion ctx.skip
  // predicate and the guard on a companion hit.
  let sootheTgt = null, sootheAt = -1e9;
  const compSkip = (e) => !!e && (!!e.ko || !!e.calm || (soothe && TAME && ((e === sootheTgt && simT - sootheAt < 6) || !!(e.tm && e.tm.torpor > 0))));
  function hitCreature(c, dmg, how) {
    const sooth = how === 'soothe';
    if (sooth) { sootheTgt = c; sootheAt = simT; }
    const real = sooth ? dmg * SOOTHE_DMG : dmg;
    c.flash = 0.12;
    if (how !== 'comp') cue('hit');
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
      if (!gone && bz.st && bossAlive() && Math.hypot(bz.x - b.x, bz.y - 36 - b.y) < BOSS_RAD) { bossHit(BOLT_DMG, b.soothe, headAt(b.x)); gone = true; }
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
  // the nearest sleeper / befriended creature in reach; IF1: one you have food for comes first, and of those the one furthest along
  // (two calm creatures side by side: you keep feeding the one you started)
  function feedTarget() {
    let best = null, bd = 1e9, fed = null, fk = -1e9;
    for (let i = 0; i < creatures.length; i++) {
      const c = creatures[i];
      if (!c.tm || !(c.ko || c.calm)) continue;
      const d = Math.hypot(hero.x - c.x, hero.y - c.y);
      if (d > (c.ko ? FEED_R : TM.K.CALM_RANGE)) continue;
      if (d < bd) { bd = d; best = c; }
      if (POUCH) { const k = (c.tm.need > 0 ? c.tm.prog / c.tm.need : 0) * 1000 - d; if (k > fk) { const f = foodOf(CR.get(c.kind)); if (f && f.have) { fk = k; fed = c; } } }
    }
    return fed || best;
  }
  // BB: honest feed pacing on the button itself. A creature eats once every feedEvery seconds (MMCreatures); the button says
  // 'Feed 2/6' when it will eat and 'Chewing 3s' with a filling bar while it chews, and a soft blip says it is ready again.
  // Tapping early still only shows how long is left: nothing is lost and nothing hurries you.
  function chewLeft(c) {
    const def = c && c.tm ? CR.get(c.kind) : null, every = def && def.tame ? def.tame.feedEvery : 0;
    return every > 0 ? every - (c.tm.t + (c.tmAcc || 0) - c.tm.lastFeed) : 0;
  }
  let feedLbl = '', feedChew = false;
  function feedHud(ft) {
    if (btn.feed.hidden) { feedChew = false; return; }
    let lbl = 'Feed', p = 1;
    if (ft && ft.tm && ft.tm.need > 0) {
      const def = CR.get(ft.kind), every = def && def.tame ? def.tame.feedEvery : 0, left = chewLeft(ft);
      if (left > 0.05 && ft.tm.fed > 0) { lbl = 'Chewing ' + Math.ceil(left) + 's'; p = clamp(1 - left / every, 0, 1); }
      else lbl = 'Feed ' + Math.floor(ft.tm.prog) + '/' + ft.tm.need;
    }
    const chew = p < 1;
    if (feedChew && !chew) cue('select');
    feedChew = chew;
    btn.feed.style.setProperty('--p', String(Math.round(p * 100) / 100));
    btn.feed.classList.toggle('chew', chew);
    if (lbl !== feedLbl) { feedLbl = lbl; btn.feed.textContent = lbl; btn.feed.setAttribute('aria-label', chew ? 'Feed: still chewing, ' + lbl.slice(8) + ' left' : lbl === 'Feed' ? 'Feed the creature' : 'Feed the creature, ' + lbl.slice(5) + ' fed'); }
  }
  function feed() {
    if (!TAME || hero.dead) return { ok: false, why: 'off' };
    if (bossFeedable()) return bossFeed();
    const c = feedTarget();
    if (!c) return { ok: false, why: 'none' };
    const def = CR.get(c.kind), nm = def.name;
    const f = foodOf(def);
    if (!f || !f.have) { cue('error'); toast(noFoodText(nm, f)); return { ok: false, why: 'nofood', kept: f ? f.kept : '' }; }
    const r = TM.step(c.kind, c.tm, { offer: f.id, playerDist: Math.hypot(hero.x - c.x, hero.y - c.y) }, c.tmAcc);
    c.tmAcc = 0;
    c.tm = r.state;
    const ev = r.events;
    if (ev.indexOf('fed') >= 0) {
      if (f.from === 'inv') { save.inv = invTake(f.id, 1); toast('Used 1 ' + IC.foodName(f.id) + ' from your bag (' + invCount(f.id) + ' left).'); }
      else pouch[f.id] = Math.max(0, pouch[f.id] - 1);
      c.eatT = 0.8;
    }
    if (ev.indexOf('toofast') >= 0) toast(nm + ' is still chewing: ready in ' + Math.max(1, Math.ceil(chewLeft(c))) + ' s.'); // BB: honest, no guessing
    if (ev.indexOf('refused') >= 0) toast(nm + ' turns its nose up.');
    if (c.tm.st === 'tamed') { finishTame(c); return { ok: true, tamed: true, events: ev }; }
    syncTame(c, ev);
    if (ev.indexOf('fed') >= 0) logEvent('tame_progress');
    return { ok: ev.indexOf('fed') >= 0, events: ev, prog: c.tm.prog, need: c.tm.need };
  }

  // IF1: what feeding offers: the pouch first, then the pack minus what a locked travel recipe (or your first o2 tank) still needs
  function feedReserve() {
    if (!POUCH || !CRAFT || !CRAFT.recipesFor) return {};
    const ids = [];
    Object.keys(ITEM_FOR_ISLE).forEach((isle) => { const it = ITEM_FOR_ISLE[isle]; if (!isleOpen(isle) && !invCount(it)) CRAFT.recipesFor(it).forEach((id) => ids.push(id)); });
    if (!invCount('o2_tank')) CRAFT.recipesFor('o2_tank').forEach((id) => ids.push(id));
    return POUCH.reserveFor(ids, save.inv);
  }
  const foodOf = (def) => IC.foodFor(def, pouch, CLASSIC_POUCH ? null : save.inv, CLASSIC_POUCH ? null : feedReserve());
  const foodHave = (f) => (f.from === 'inv' ? invCount(f.id) : pouch[f.id] | 0);
  function noFoodText(nm, f) {
    const id = f && f.id, w = POUCH ? POUCH.where(id) : '';
    if (f && f.kept) return nm + ' wants ' + IC.foodName(f.kept) + '. Your ' + IC.foodName(f.kept) + ' is kept for a travel craft; gather a little more' + (w ? ': ' + w : '') + '.';
    return nm + ' wants ' + IC.foodName(id) + '. You have none yet' + (w ? ': ' + w : '') + '.';
  }

  // the party: MMCompanion states for up to MAX_ACTIVE (1 on the low tier) tames from tames.party
  const party = [];   // {cs, ent, def, ctxDef, art, dmg}
  const partyStates = [];
  // BB: a land companion (no swim / fly / glide / float behaviour) does not walk out onto open water; one already standing in water
  // (a catch-up teleport) may still walk out of it. Swimmers and fliers cross freely, as before.
  let compCur = null, compLand = false;
  const AIRWATER = ['swim', 'fly', 'glide', 'float'];
  const landOnly = (def) => !!def && !(Array.isArray(def.behaviours) && def.behaviours.some((b) => AIRWATER.indexOf(b) >= 0));
  const compCtx = { owner: hero, enemies: creatures, pickups: [], def: null, speed: SPEED, skip: (e) => compSkip(e), // G-22
    blocked: (x, y) => { const tx = tileOf(x), ty = tileOf(y); return solidAt(tx, ty) || (compLand && !!compCur && swimAt(tx, ty) && !swimAt(tileOf(compCur.x), tileOf(compCur.y))); } };
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
    p.art = baker.bake({ id: def.id, archetype: arch, size: sz, biome: DRAW_BIOME }, { dpr: DPR });
    p.sk = stripKind(def.id); p.lx = x; p.ly = y; p.dir = 0;
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
  let partyAcc = 0, partySteps = 0;
  function stepParty(dt) {
    partySteps++;
    compCtx.enemies = creatures;
    for (let i = 0; i < party.length; i++) {
      const p = party[i];
      compCtx.def = p.ctxDef; compCur = p.cs; compLand = p.land === undefined ? (p.land = landOnly(p.def)) : p.land;
      const out = CMP.update(p.cs, compCtx, dt);
      if (compLand && swimAt(tileOf(p.cs.x), tileOf(p.cs.y))) { // BB: a land companion that ended up in water (catch-up teleport) steps out behind you
        const bx = hero.x - hero.face.x * TILE * 0.9, by = hero.y - hero.face.y * TILE * 0.9;
        if (!swimAt(tileOf(bx), tileOf(by)) && !solidAt(tileOf(bx), tileOf(by))) { p.cs.x = bx; p.cs.y = by; }
        else if (!swimAt(tileOf(hero.x), tileOf(hero.y))) { p.cs.x = hero.x; p.cs.y = hero.y; }
      }
      if (out.hit >= 0 && p.dmg > 0) { const e = creatures[out.hit]; if (e && e.hostile && !compSkip(e)) { p.cs.hits = (p.cs.hits || 0) + 1; hitCreature(e, p.dmg, 'comp'); } }
    }
  }
  function finishTame(c) {
    const def = CR.get(c.kind);
    const ent = adoptTame(def, c.tm.bond, c.x, c.y, false);
    removeWhere((x) => x === c, 90000);
    // TD1: taming the island's rare variant (never killing it) gives its rare item; the tame keeps the look as its cosmetic
    const V = c.variant && RARE_VAR && RARE_VAR.v === c.variant ? RARE_VAR : null;
    if (V) {
      const got = invAdd(V.item, 1);
      if (ent && TAMES.setCosmetic(tames, ent.id, V.v)) { TAMES.rename(tames, ent.id, V.name); TAMES.write(S, tames); }
      toast((ent ? V.name + ' joined you!' : V.name + ' is happy. Your bond grows.') + (got ? ' +1 ' + HS.resName(V.item) + '.' : ''));
      logEvent('rare_tame');
    } else toast(ent ? def.name + ' joined you!' : def.name + ' is happy. Your bond grows.');
    logEvent('tame');
    refreshMount();
    checkMedals();
  }
  // a finished tame joins the stable (MMTames; the third of a species gives affinity instead), the party when there is room, and becomes
  // the mount when it is rideable and you have none. X6: a boss joins as an alpha (cos 'alpha', its wild level). One stable write.
  function adoptTame(def, bond, x, y, alpha) {
    const owned = tames.roster.filter((t) => t.sp === def.id);
    const rule = TM.duplicateRule(owned.length);
    let ent = null;
    if (rule.allow) ent = TAMES.add(tames, { sp: def.id, nm: def.name, isle: ISLE, d: today(), bond: bond });
    else if (owned[0]) TAMES.addAffinity(tames, owned[0].id, 30);
    if (ent && alpha) { TAMES.setCosmetic(tames, ent.id, 'alpha'); ent.lv = Math.max(1, Math.min(TAMES.MAX_LV, (def.lv && def.lv[0]) | 0)); }
    if (ent) {
      if (tames.party.length < Math.min(TAMES.MAX_PARTY, LOW ? 1 : CMP.MAX_ACTIVE)) {
        TAMES.setParty(tames, tames.party.concat([ent.id]));
        spawnCompanion(ent, x, y);
      }
      if (def.rideable && !tames.mount) TAMES.setMount(tames, ent.id);
    }
    TAMES.write(S, tames);
    ISL.noteLog(save, 'tamed', def.id, 1); dirty = true;
    tamedN++; reward();
    return ent;
  }

  // G-20 / G-21 (b05-01, b05-02): the Stable. The Party tab lists every tame (name, species, level, what it does now) with real buttons:
  // "Join party" / "Rest" (party limit respected: 2, or 1 on the low tier; the companion spawns / despawns) and "Ride" on a rideable tame
  // (TAMES.setMount + refreshMount; the saddle follows the chosen species). Swaps wait while you ride or fight a boss. One stable write each.
  const partyMax = () => Math.min(TAMES.MAX_PARTY, LOW ? 1 : CMP.MAX_ACTIVE);
  function stableBusy() { return ride ? 'Get off your mount first (R).' : bossAlive() && bz.engaged ? 'Not during a boss fight.' : ''; }
  function stableJoin(id) {
    const ent = TAMES.find(tames, id); if (!ent || !COMPANIONS) return false;
    const busy = stableBusy(); if (busy) { toast(busy); return false; }
    if (tames.party.indexOf(id) >= 0) return true;
    if (tames.party.length >= partyMax()) { toast('Your party is full. Rest one first.'); return false; }
    TAMES.setParty(tames, tames.party.concat([id])); TAMES.write(S, tames);
    spawnCompanion(ent, hero.x + 36, hero.y + 12);
    toast((ent.nm || specName(ent.sp)) + ' joins your party.');
    return true;
  }
  function stableRest(id) {
    const ent = TAMES.find(tames, id); if (!ent) return false;
    const busy = stableBusy(); if (busy) { toast(busy); return false; }
    if (tames.party.indexOf(id) < 0) return true;
    TAMES.setParty(tames, tames.party.filter((x) => x !== id)); TAMES.write(S, tames);
    dropCompanion(id);
    toast((ent.nm || specName(ent.sp)) + ' rests at the stable.');
    return true;
  }
  function stableRide(id) {
    const ent = TAMES.find(tames, id); const d = ent && CR.get(ent.sp); if (!ent || !d || !d.rideable || !MOUNTS) return false;
    const busy = stableBusy(); if (busy) { toast(busy); return false; }
    TAMES.setMount(tames, id); TAMES.write(S, tames); refreshMount();
    toast((ent.nm || d.name) + ' is your mount. R to ride.');
    return true;
  }
  const specName = (sp) => { const d = CR.get(sp); return d ? d.name : sp; };
  function stableRows(pl) {
    const busy = stableBusy(), full = tames.party.length >= partyMax();
    tames.roster.forEach((t) => {
      const d = CR.get(t.sp); const inParty = tames.party.indexOf(t.id) >= 0; const riding = !!ride && ride.id === t.id; const isMount = !!mountEnt && mountEnt.id === t.id;
      const p = party.find((x) => x.ent.id === t.id);
      const what = riding ? 'riding' : inParty ? (p ? p.cs.mode : 'party') : 'resting';
      const li = el('li', 'stable-row'); li.dataset.tame = t.id;
      li.appendChild(el('span', 'st-name', (t.nm || specName(t.sp)) + (t.nm && d && t.nm !== d.name ? ' (' + d.name + ')' : '') + ' Lv ' + t.lv + ' - ' + what + (isMount && !riding ? ', mount' : '')));
      const mk = (cls, text, why, fn) => { const b = el('button', 'st-btn ' + cls, text); b.type = 'button'; b.dataset.tame = t.id; b.style.minHeight = '44px'; b.style.minWidth = '44px'; if (why) { b.disabled = true; b.title = why; b.setAttribute('aria-label', text + ': ' + why); } else b.setAttribute('aria-label', text + ' ' + (t.nm || specName(t.sp))); b.addEventListener('click', () => { if (fn()) openPanel('party'); }); return b; };
      if (COMPANIONS && d && d.companion) {
        if (inParty) li.appendChild(mk('st-rest', 'Rest', busy, () => stableRest(t.id)));
        else li.appendChild(mk('st-join', 'Join party', busy || (full ? 'Party is full (' + partyMax() + '). Rest one first.' : ''), () => stableJoin(t.id)));
      }
      if (MOUNTS && d && d.rideable) li.appendChild(mk('st-ride', isMount ? 'Mount' : 'Ride', busy || (isMount ? 'Already your mount' : ''), () => stableRide(t.id)));
      pl.appendChild(li);
    });
  }

  // mount: the tames.mount entry (else the first rideable tame) through MMCompanion.ride
  let ride = null, rideArt = null, mountEnt = null, rideKind = null, rideDir = 0, rideDrawn = '', saddleDrawn = '', rideLift = 0, rideDx = 0; // rideLift / rideDx: where the hero was last drawn (test handle)
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
    const need = saddleNeed(def);
    if (need && !hasSaddle(need)) { toast((mountEnt.nm || def.name) + ' needs a ' + itemName(need).toLowerCase() + ' to ride. Craft one (K).'); return false; }
    ride = CMP.ride(def, mountEnt.id);
    if (!ride) return false;
    dropCompanion(mountEnt.id);
    rideArt = baker.bake({ id: def.id, archetype: IC.ARCH[def.id] || 'quadruped', size: def.size, biome: DRAW_BIOME }, { dpr: DPR });
    rideKind = stripKind(def.id);
    if (tames.mount !== mountEnt.id) { TAMES.setMount(tames, mountEnt.id); TAMES.write(S, tames); }
    hero.scale = CMP.moveScale(ride, moveScaleAt(tileOf(hero.x), tileOf(hero.y)));
    abilityMount(def);
    toast('Riding ' + (mountEnt.nm || def.name) + '. R to get off.');
    logEvent('ride');
    return true;
  }
  function dismount() {
    if (!ride) return false;
    const id = ride.id;
    abilityClear();
    ride = null; rideArt = null; rideKind = null; rideDrawn = ''; saddleDrawn = '';
    // off a swim mount in open water: step ashore onto the nearest walkable tile
    const land = nearestWalkable(hero.x, hero.y);
    if (land) { hero.x = (land.x + 0.5) * TILE; hero.y = (land.y + 0.5) * TILE; lastShore = land; }
    hero.scale = moveScaleAt(tileOf(hero.x), tileOf(hero.y));
    if (tames.party.indexOf(id) >= 0) spawnCompanion(TAMES.find(tames, id), hero.x + 36, hero.y + 12);
    return true;
  }
  let lastShore = null;
  // X4 saddles: the saddle id a mount needs (null for saddle:null mounts and with ?saddles=0); a saddle is kept, not used up
  const saddleNeed = (def) => (SADDLES && def && def.ride && def.ride.saddle ? def.ride.saddle : null);
  const hasSaddle = (id) => !!id && has(save.inv, id) && save.inv[id] > 0;
  const toggleRide = () => (ride ? (dismount(), false) : mountUp());
  refreshMount();

  // ---------- XW1: the mount's one active ability (MMMountAbility: 12 abilities, one per rideable species' ride.ability) ----------
  // The pure module owns the timing (ready -> wind -> active -> cool, no cost, never skips a cooldown) and the numbers; the page carries
  // them out: speed, terrain it may cross, a one-shot move / stun / push, the warm aura and the shell platform. Abilities never deal
  // damage and never touch tames, the party, the boss or items. Button: #btn-ability (44 px, next to Ride), key F while riding.
  let abil = null, abilDef = null, abilPress = false, abilSpeed = 1, abilWarm = false, abilPlatform = false, abilMove = null, abilUses = 0;
  const ABIL_LOG = []; // last few firings {t, a, moved, stun, knock} (test handle; fixed size)
  function abilityMount(def) {
    abilityClear();
    if (!ABIL || !def || !def.ride || !def.ride.ability) return;
    abilDef = MA.def(def.ride.ability);
    abil = abilDef ? MA.init(abilDef.id) : null;
    if (!abil) abilDef = null;
  }
  function setMask(arr, list) { arr.fill(0); for (let i = 0; i < list.length; i++) { const id = O.TERRAIN_ALL[list[i]]; if (id !== undefined) arr[id] = 1; } }
  function abilityClear() {
    if (abil && abil.ph === 'active') abilityEnd(true);
    abil = null; abilDef = null; abilPress = false; abilMove = null;
    PASS_T.fill(0); NOSLOW_T.fill(0); abilSpeed = 1; abilWarm = false; abilPlatform = false;
  }
  // the nearest spot the hero fits (after a dive runs out of breath over the abyss, or a move that ended inside a wall)
  function nearestFree(px, py) {
    if (!blocked(px, py)) return null;
    const tx = tileOf(px), ty = tileOf(py);
    for (let r = 1; r <= 16; r++) {
      let best = null, bd = 1e9;
      for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
        const cx = (tx + dx + 0.5) * TILE, cy = (ty + dy + 0.5) * TILE;
        if (!inWorld(tx + dx, ty + dy) || blocked(cx, cy)) continue;
        const d = Math.hypot(cx - px, cy - py);
        if (d < bd) { bd = d; best = { x: cx, y: cy }; }
      }
      if (best) return best;
    }
    return { x: (world.spawnPoint.x + 0.5) * TILE, y: (world.spawnPoint.y + 0.5) * TILE };
  }
  const abilityTarget = (c) => ({ id: c.uid, x: c.x / TILE - 0.5, y: c.y / TILE - 0.5, size: c.size, tame: !!(c.calm || c.ko || (c.tm && c.tm.st === 'tamed')), party: false, boss: false });
  function abilityStart() {
    const m = MA.mods(abil);
    setMask(PASS_T, m.pass); setMask(NOSLOW_T, m.noSlow);
    abilSpeed = m.speedMul; abilWarm = m.warmR > 0; abilPlatform = m.platform;
    // the one-shot part, in tile units (the hero's tile index, creatures likewise); the boss is never in the list
    const near = [];
    for (let i = 0; i < creatures.length && near.length < 64; i++) { const c = creatures[i]; if (Math.hypot(c.x - hero.x, c.y - hero.y) < 10 * TILE) near.push(abilityTarget(c)); }
    const out = MA.apply(abil, { x: hero.x / TILE - 0.5, y: hero.y / TILE - 0.5, face: hero.face, creatures: near,
      solidAt: (tx, ty) => heroSolidAt(tx, ty), terrainAt: (tx, ty) => NAMES[O.tileAt(world, tx, ty)] || '' });
    let moved = 0;
    if (out.move) {
      const k = abilDef.kind;
      if (k === 'dash' || k === 'leap_to') abilMove = { vx: out.move.dx * TILE / abilDef.dur, vy: out.move.dy * TILE / abilDef.dur, left: abilDef.dur }; // slides, stops at walls
      else if (k === 'hop') { // over one rim tile onto the far side
        const nx = (tileOf(hero.x) + out.move.dx + 0.5) * TILE, ny = (tileOf(hero.y) + out.move.dy + 0.5) * TILE;
        if (!blocked(nx, ny)) { hero.x = nx; hero.y = ny; moved = Math.hypot(out.move.dx, out.move.dy); }
      } else if (k === 'burrow') { // a short tunnel: the farthest free spot along the line (it may pass under a wall)
        const l = Math.hypot(out.move.dx, out.move.dy), st = Math.max(1, Math.ceil(l * 4));
        for (let i = st; i >= 1; i--) {
          const nx = hero.x + out.move.dx * TILE * i / st, ny = hero.y + out.move.dy * TILE * i / st;
          if (inWorld(tileOf(nx), tileOf(ny)) && !blocked(nx, ny)) { hero.x = nx; hero.y = ny; moved = l * i / st; break; }
        }
      }
    }
    if (out.untargetable > 0) hero.iframes = Math.max(hero.iframes, out.untargetable);
    let stunN = 0, knockN = 0;
    out.stun.forEach((st) => { const c = creatures.find((x) => x.uid === st.id); if (!c) return; c.stun = Math.max(c.stun || 0, st.s); c.vx = 0; c.vy = 0; if (c.ph === 'wind') c.ph = ''; stunN++; });
    out.knock.forEach((kn) => {
      const c = creatures.find((x) => x.uid === kn.id); if (!c) return;
      const nx = c.x + kn.dx * TILE, ny = c.y + kn.dy * TILE;
      if (!creatureSolid(c, tileOf(nx), tileOf(ny))) { c.x = nx; c.y = ny; knockN++; }
    });
    abilUses++;
    if (ABIL_LOG.length >= 8) ABIL_LOG.shift();
    ABIL_LOG.push({ t: simT, a: abilDef.id, moved: Math.round(moved * 100) / 100, stun: stunN, knock: knockN });
    logEvent('ability');
    const extra = stunN ? ' ' + stunN + (stunN === 1 ? ' creature is' : ' creatures are') + ' dazed for a moment.' : knockN ? ' ' + knockN + ' nudged aside.' : '';
    toast(abilDef.name + '!' + extra);
  }
  function abilityEnd(quiet) {
    PASS_T.fill(0); NOSLOW_T.fill(0); abilSpeed = 1; abilWarm = false; abilPlatform = false; abilMove = null;
    // a dive that ran out over the abyss (or a hover that ends over a vent) surfaces on the nearest spot the rider fits
    const spot = nearestFree(hero.x, hero.y);
    if (spot) { hero.x = spot.x; hero.y = spot.y; if (!quiet) toast(abilDef && abilDef.kind === 'swim' ? 'Out of breath: back up to the surface.' : 'Back on solid ground.'); }
  }
  function abilityStep(dt) {
    if (!abil) return;
    const idle = abil.ph === 'ready' && !abilPress && (abilDef.kind !== 'swim' || abil.breath >= abilDef.breath);
    if (!idle) {
      const under = abilDef.kind === 'swim' && PASS_T[O.tileAt(world, tileOf(hero.x), tileOf(hero.y))] === 1;
      abil = MA.step(abil, { press: abilPress, under: under }, dt);
      abilPress = false;
      for (let i = 0; i < abil.ev.length; i++) { const e = abil.ev[i]; if (e === 'start') abilityStart(); else if (e === 'end') abilityEnd(false); }
    }
    if (abilMove) {
      const st = Math.min(dt, abilMove.left), nx = hero.x + abilMove.vx * st, ny = hero.y + abilMove.vy * st;
      let ok = false;
      if (!blocked(nx, hero.y)) { hero.x = nx; ok = true; }
      if (!blocked(hero.x, ny)) { hero.y = ny; ok = true; }
      abilMove.left -= st;
      if (!ok || abilMove.left <= 1e-6) abilMove = null;
    }
    // float dock: the party rides on the shell while it is active
    if (abilPlatform) for (let i = 0; i < party.length; i++) { const p = party[i]; p.cs.x = hero.x + (i - (party.length - 1) / 2) * 14; p.cs.y = hero.y - 6; }
  }
  function useAbility() {
    if (!ride || !abil) { if (ride && !ABIL) toast('Mount abilities are off (?ability=0).'); return false; }
    if (abil.ph !== 'ready') { toast(abilDef.name + ' is resting. Ready in ' + Math.max(1, Math.ceil(abil.cd)) + ' s.'); return false; }
    abilPress = true;
    return true;
  }

  // ---------- X6: the island boss (MMIsleBoss) at the pack's boss site ----------
  const BOSS = window.MMIsleBoss || null;
  const BOSSES = !!BOSS && Q.get('bosses') !== '0';
  // XB: these are `let` so the home pedestal can bring any beaten boss over for a rematch (startRematch); on the other islands they are
  // set once here, exactly as before
  let BOSS_ID = BOSSES && PACK.bosses && PACK.bosses[0] && BOSS.script(PACK.bosses[0].boss) && CR.get(PACK.bosses[0].boss) ? PACK.bosses[0].boss : null;
  let bossSite = BOSS_ID ? ((world.bossSites || []).find((b) => b.boss === BOSS_ID) || (world.bossSites || [])[0] || null) : null;
  const ARENA_R = BOSS ? BOSS.K.ARENA_R : 420;
  const BOSS_SPAWN_R = ARENA_R + 12 * TILE, BOSS_LEAVE_R = ARENA_R + 24 * TILE, BOSS_DRIFT = 4 * TILE, BOSS_RAD = 48, BOSS_FEED_R = 5 * TILE;
  let BOSS_DEF = BOSS_ID ? CR.get(BOSS_ID) : null;
  const BOSS_DT = 0.025;
  let BOSS_TAMEABLE = !!(BOSS_DEF && BOSS_DEF.tame && BOSS_DEF.tame.method === 'knockout' && BOSS_DEF.diet.indexOf('feast') >= 0);
  // bz: the boss on screen. It is shaped like a creature where the strip helpers read it (sk, dir, act, at0, ph, ang, vx, vy, ko, eatT, t)
  const bz = { st: null, n: 0, acc: 0, done: '', sx: 0, sy: 0, x: 0, y: 0, engaged: false, dmg: 0, torpor: 0, tele: [], live: [], flash: 0, t: 0,
    sp: BOSS_ID || '', kind: BOSS_ID || '', sk: stripKind(BOSS_ID), dir: 0, act: '', at0: 0, ph: '', ang: 0, vx: 0, vy: 0, ko: false, eatT: 0, moving: false,
    art: null, drawn: '', src: '', phaseName: '', inp: { hero: { x: 0, y: 0 }, dmg: 0, torporHit: 0, feast: false, offer: null, playerDist: 100, head: -1 },
    rm: false, hd: -1, told: {}, onIce: false }; // XB: rm = a home rematch, hd = the hydra head the last bolt struck, told = one-time tips this fight
  if (bossSite) { bz.sx = (bossSite.x + 0.5) * TILE; bz.sy = (bossSite.y + 0.5) * TILE; bz.x = bz.sx; bz.y = bz.sy; }
  if (BOSS_DEF) bz.art = baker.bake({ id: BOSS_ID, archetype: IC.ARCH[BOSS_ID] || 'giant', size: BOSS_DEF.size, biome: DRAW_BIOME }, { dpr: DPR });
  // test / balance logs (fixed size): telegraphs as they turn into hits, hero hits, phase changes, event counts
  const BOSS_LOG = { tele: [], hurt: [], phase: [], ev: {}, hurtTotal: 0 };
  const logPush = (a, v, n) => { if (a.length >= (n || 64)) a.shift(); a.push(v); };
  const bossAlive = () => !!bz.st && (bz.st.st === 'fight' || bz.st.st === 'weary' || bz.st.st === 'taming');
  const bossName = () => (BOSS_DEF ? BOSS_DEF.name : '');
  // the b33 boss arena ring (MMIsleArt.ARENA; only requested once delivered), else the code ring
  let arenaImg = null, arenaSrc = '', arenaDrawn = 0;
  if (ART && bossSite && window.MMIsleArt && window.MMIsleArt.loadArena) window.MMIsleArt.loadArena().then((a) => { if (a) arenaImg = a; });
  function bossTick() {
    if (!bossSite || !BOSS_ID || bz.done) return;
    const d = Math.hypot(bz.sx - hero.x, bz.sy - hero.y);
    if (bz.rm) { if (!bz.st || d > ARENA_R * 1.35) endRematch('left'); return; } // XB: a rematch never respawns by itself
    if (!bz.st && d <= BOSS_SPAWN_R) spawnBoss();
    else if (bz.st && d > BOSS_LEAVE_R && bz.st.st === 'fight') { bz.st = null; bz.engaged = false; bz.tele.length = 0; bz.live.length = 0; } // back to its lair (full health next time)
  }
  function spawnBoss() {
    bz.st = BOSS.init(BOSS_ID, { seed: 'isles|' + SEED + '|boss|' + (bz.rm ? 'rematch|' + BOSS_ID + '|' : '') + (bz.n++), x: bz.sx, y: bz.sy, rematch: bz.rm });
    bz.x = bz.sx; bz.y = bz.sy; bz.engaged = false; bz.tele.length = 0; bz.live.length = 0; bz.phaseName = BOSS.script(BOSS_ID).phases[0].name;
    bz.told = {}; bz.hd = -1; bz.onIce = false;
    return !!bz.st;
  }
  function disengage() {
    bz.engaged = false; bz.tele.length = 0; bz.live.length = 0; bz.ph = '';
    if (bz.st && bz.st.st === 'fight') bz.st = Object.assign({}, bz.st, { hazards: [], cd: Math.max(bz.st.cd, 2.5) });
  }
  const findIdx = (a, id) => { for (let i = 0; i < a.length; i++) if (a[i].id === id) return i; return -1; };
  function bossEvents(events) {
    for (let i = 0; i < events.length; i++) {
      const e = events[i];
      BOSS_LOG.ev[e.type] = (BOSS_LOG.ev[e.type] || 0) + 1;
      if (e.type === 'telegraph') {
        bz.tele.push({ id: e.id, atk: e.atk, zone: e.zone, windup: e.windup, t0: simT, drawn: 0, first: -1, last: -1 });
        if (e.sig === 'vents') tipOnce('vents', 'Lava vents glow: step off the circles.');
        else if (e.sig === 'roar') tipOnce('roar', 'A roar! A charge follows along the line where you stand.');
      }
      else if (e.type === 'hit') {
        // the shape goes live only once its telegraph has been on screen for the whole wind-up (the 40 Hz engine can be a step ahead)
        const k = findIdx(bz.tele, e.id), tg = k >= 0 ? bz.tele[k] : null;
        const at = tg ? Math.max(simT, tg.t0 + tg.windup) : simT;
        if (tg) tg.hitAt = at;
        bz.live.push({ id: e.id, atk: e.atk, zone: e.zone, dmg: e.dmg, dur: e.dur, t0: at, done: false, tele: !!tg, tg: tg });
      } else if (e.type === 'end') { /* the page ends a live shape on its own clock (t0 + dur) */ }
      else if (e.type === 'cancel') { let k = findIdx(bz.tele, e.id); if (k >= 0) bz.tele.splice(k, 1); k = findIdx(bz.live, e.id); if (k >= 0) bz.live.splice(k, 1); }
      else if (e.type === 'phase') { bz.phaseName = e.name; logPush(BOSS_LOG.phase, { phase: e.phase, name: e.name, frac: Math.round(1e4 * bz.st.hp / bz.st.hpMax) / 1e4, t: simT }, 8); toast(bossName() + ': ' + e.name + '!'); }
      else if (e.type === 'weary') {
        bz.tele.length = 0; bz.live.length = 0;
        cue('warn');
        toast(TAME && e.canTame ? 'The ' + bossName() + ' is weary. Hold fire and offer a feast (F).' : 'The ' + bossName() + ' is weary. Finish it!');
      } else if (e.type === 'tame_start') toast('The ' + bossName() + ' takes the feast. Soothe shots (Q) put it to sleep, then feed it more feasts.');
      else if (e.type === 'no_tame') toast('The ' + bossName() + ' cannot be tamed.');
      else if (e.type === 'tame') {
        if (e.ev === 'ko') toast('The ' + bossName() + ' is asleep. Feed it feasts (F). Do not hit it.');
        else if (e.ev === 'fed') { save.inv = invTake('feast', 1); bz.eatT = 0.8; }
        else if (e.ev === 'toofast') { // BB: honest timing, like a creature's Feed button
          const tm = bz.st && bz.st.tame, bd = bz.st && CR.get(bz.st.id), every = bd && bd.tame ? bd.tame.feedEvery : 0;
          const left = tm && every ? Math.max(1, Math.ceil(every - (tm.t - tm.lastFeed))) : 0;
          toast('The ' + bossName() + ' is still chewing' + (left ? ': ready in ' + left + ' s.' : '.'));
        }
        else if (e.ev === 'cannot_feed') toast('Put it to sleep with soothe shots (Q) first.');
        else if (e.ev === 'wake') toast('The ' + bossName() + ' woke up. It is still weary: soothe it again.');
      } else if (e.type === 'tamed') { cue('chest'); bossTamed(); }
      else if (e.type === 'dead') { cue('chest'); bossDefeated(); }
      else if (e.type === 'escaped') { bz.done = 'escaped'; bz.st = null; bz.tele.length = 0; bz.live.length = 0; toast('The ' + bossName() + ' slipped away. It will be back next visit.'); }
      // XB signature mechanics: a short tip the first time each one shows up in a fight
      else if (e.type === 'head_cut') { if (e.left > 0) toast('A head falls! ' + e.left + ' left. Cut them in any order.'); }
      else if (e.type === 'submerge') tipOnce('sub', 'The ' + bossName() + ' dives! Step off the bubbles before it rises.');
      else if (e.type === 'ice') tipOnce('ice', 'Thin ice underfoot. The hot springs are always safe.');
      else if (e.type === 'dig') tipOnce('dig', 'The ' + bossName() + ' burrows! Step off the marked line.');
    }
  }
  function tipOnce(k, msg) { if (bz.told[k]) return; bz.told[k] = 1; toast(msg); }
  // take n of an item out of `inv` (a feast eaten by a boss); returns the new inv
  function invTake(id, n) {
    const out = {};
    Object.keys(save.inv).forEach((k) => { out[k] = save.inv[k]; });
    if (has(out, id)) { out[id] -= n; if (out[id] <= 0) delete out[id]; }
    dirty = true; if (panelKind === 'craft') craftDirty = true;
    return out;
  }
  function bossStep(dt) {
    if (!bz.st) return;
    const st = bz.st.st;
    bz.t += dt; bz.flash -= dt; if (bz.eatT > 0) bz.eatT -= dt;
    const fromSite = Math.hypot(hero.x - bz.sx, hero.y - bz.sy);
    if (!bz.engaged && !hero.dead && (fromSite <= ARENA_R || bz.dmg > 0 || bz.torpor > 0)) { bz.engaged = true; cue('boss'); if (st === 'fight') toast('The ' + bossName() + ' roars! Watch the ground: step out of each shape before it fills.'); }
    if (bz.engaged && st === 'fight' && (hero.dead || fromSite > ARENA_R * 1.35)) { if (bz.rm) { endRematch('left'); return; } disengage(); } // you left the ring: it calls off its attacks (a rematch just ends)
    if (bz.rm && (st === 'weary') && (hero.dead || fromSite > ARENA_R * 1.35)) { endRematch('left'); return; }
    if (!bz.engaged) { bz.dmg = 0; bz.torpor = 0; bz.ph = ''; bz.moving = false; return; }
    // between attacks it lumbers toward you, never far from its lair
    bz.moving = false; bz.vx = 0; bz.vy = 0;
    if (st === 'fight' && !bz.st.hazards.length && !hero.dead) {
      const dx = hero.x - bz.st.x, dy = hero.y - bz.st.y, d = Math.hypot(dx, dy) || 1;
      if (d > 140) {
        const sp = 46 * dt, nx = bz.st.x + dx / d * sp, ny = bz.st.y + dy / d * sp;
        if (Math.hypot(nx - bz.sx, ny - bz.sy) <= BOSS_DRIFT) { bz.st.x = nx; bz.st.y = ny; bz.vx = dx / d * 46; bz.vy = dy / d * 46; bz.moving = true; }
      }
    }
    // the engine runs on a fixed 40 Hz step (0.025 s is exact in its 1 ms clock, so a 0.9 s wind-up is 0.9 s on screen)
    bz.acc = Math.min(0.5, bz.acc + dt);
    while (bz.acc >= BOSS_DT - 1e-9 && bz.st) {
      bz.acc -= BOSS_DT;
      const inp = bz.inp;
      inp.hero.x = hero.x; inp.hero.y = hero.y; inp.dmg = bz.dmg; inp.torporHit = bz.torpor; inp.feast = false; inp.offer = null;
      inp.playerDist = Math.hypot(hero.x - bz.st.x, hero.y - bz.st.y);
      inp.head = bz.hd; // XB: the hydra head your bolts struck (the engine picks the next head left when it is gone)
      inp.noTame = !(TAME && BOSS_TAMEABLE); // G-22: the weary grace only protects a boss this page can actually tame
      bz.dmg = 0; bz.torpor = 0;
      const r = BOSS.step(bz.st, inp, BOSS_DT);
      if (r.state) bz.st = r.state;
      if (r.events.length) bossEvents(r.events);
    }
    if (!bz.st) return;
    bossZonesTick();
    bossHurtCheck();
    bz.x = bz.st.x; bz.y = bz.st.y;
    bz.ko = bz.st.st === 'taming' && !!bz.st.tame && (bz.st.tame.st === 'ko' || (bz.st.tame.st === 'taming' && bz.st.tame.how === 'ko'));
    bz.ph = bz.tele.length ? 'wind' : '';
    if (bz.tele.length) bz.ang = bz.tele[bz.tele.length - 1].zone.angle;
    bz.onIce = onThinIce(hero.x, hero.y);
  }
  // XB: thin ice (frost dragon) slows your footing a little; a hot spring is never ice. Footing only, never damage.
  const ICE_SLOW = 0.85;
  function inSpring(x, y) { const sp = bz.st && bz.st.springs; if (!sp) return false; for (let i = 0; i < sp.length; i++) if (Math.hypot(x - sp[i].x, y - sp[i].y) <= sp[i].r) return true; return false; }
  function onThinIce(x, y) {
    const ice = bz.st && bz.st.ice;
    if (!ice || !ice.length || inSpring(x, y)) return false;
    for (let i = 0; i < ice.length; i++) if (BOSS.hitTest(ice[i].zone, x, y, 0)) return true;
    return false;
  }
  // XB: which of the hydra's 3 heads a bolt at x struck (left / middle / right of the body); -1 for any other boss
  function headAt(x) { if (!bz.st || !bz.st.heads) return -1; const dx = x - bz.x; return dx < -16 ? 0 : dx > 16 ? 2 : 1; }
  // telegraphs hand over to their live shape at hitAt; live shapes end after dur (sim clock)
  function bossZonesTick() {
    for (let i = bz.tele.length - 1; i >= 0; i--) {
      const tg = bz.tele[i];
      if (!(tg.hitAt >= 0) || simT < tg.hitAt - 1e-9) continue;
      logPush(BOSS_LOG.tele, { id: tg.id, atk: tg.atk, shape: tg.zone.shape, windup: tg.windup, t0: tg.t0, th: tg.hitAt, drawn: tg.drawn, first: tg.first, last: tg.last });
      bz.tele.splice(i, 1);
    }
    for (let i = bz.live.length - 1; i >= 0; i--) if (simT - bz.live[i].t0 > bz.live[i].dur + 1e-6) bz.live.splice(i, 1);
  }
  // the hero is hurt only inside a live (already telegraphed) shape, once per hazard
  function bossHurtCheck() {
    for (let i = 0; i < bz.live.length; i++) {
      const L = bz.live[i];
      if (L.done || hero.dead) continue;
      if (simT - L.t0 < -1e-9) continue;
      const tau = Math.max(0, simT - L.t0);
      if (tau > L.dur + 1e-6) continue;
      if (!BOSS.hitTest(L.zone, hero.x, hero.y, tau)) continue;
      L.done = true;
      const before = hero.hp;
      hurtHero(Math.max(1, Math.round(L.dmg)));
      const lost = before - hero.hp;
      BOSS_LOG.hurtTotal += lost;
      logPush(BOSS_LOG.hurt, { t: simT, id: L.id, atk: L.atk, x: hero.x, y: hero.y, tau: tau, zone: L.zone, tele: L.tele, lost: lost }, 48);
    }
  }
  // a bolt hits the boss: damage (a soothe shot does a quarter), or torpor once taming has begun
  function bossHit(dmg, sooth, head) {
    if (!bossAlive()) return false;
    bz.flash = 0.12;
    if (Number.isInteger(head) && head >= 0) bz.hd = head;
    if (!bz.engaged) bz.engaged = true;
    if (bz.st.st === 'taming') { if (sooth) bz.torpor += dmg; else bz.dmg += dmg; }
    else bz.dmg += sooth ? dmg * SOOTHE_DMG : dmg;
    return true;
  }
  const bossFeedable = () => TAME && bossAlive() && !hero.dead && Math.hypot(hero.x - bz.x, hero.y - bz.y) <= BOSS_FEED_R &&
    ((bz.st.st === 'weary' && BOSS_TAMEABLE) || bz.st.st === 'taming');
  // F next to a weary boss: a feast from `inv` starts the boss-tame; once it sleeps, each feast feeds it (MMTame through MMIsleBoss)
  function bossFeed() {
    if (!bossFeedable()) return { ok: false, why: 'none' };
    if (invCount('feast') <= 0) { toast('The ' + bossName() + ' only eats a feast. Craft one (K): raw meat and jungle berries.'); return { ok: false, why: 'nofood' }; }
    const weary = bz.st.st === 'weary';
    const inp = bz.inp;
    inp.hero.x = hero.x; inp.hero.y = hero.y; inp.dmg = 0; inp.torporHit = 0; inp.feast = weary; inp.offer = weary ? null : 'feast';
    inp.playerDist = Math.hypot(hero.x - bz.x, hero.y - bz.y);
    const r = BOSS.step(bz.st, inp, 0);
    inp.feast = false; inp.offer = null;
    if (r.state) bz.st = r.state;
    const started = r.events.some((e) => e.type === 'tame_start');
    if (started) save.inv = invTake('feast', 1);
    bossEvents(r.events);
    const t = bz.st && bz.st.tame;
    return { ok: started || r.events.some((e) => e.type === 'tame' && e.ev === 'fed'), started: started, st: bz.st ? bz.st.st : bz.done, prog: t ? t.prog : 0, need: t ? t.need : 0 };
  }
  function bossDefeated() {
    const def = BOSS_DEF;
    xp += 60; kills++;
    bz.x = bz.st.x; bz.y = bz.st.y;
    addDeath(bz);
    rollLoot(bz);
    if (bz.rm) { rematchWon(); return; }
    ISL.noteBeat(save, BOSS_ID); dirty = true;
    bz.done = 'dead'; bz.st = null; bz.tele.length = 0; bz.live.length = 0; bz.engaged = false;
    toast('You defeated the ' + def.name + '!');
    checkMedals();
  }
  function bossTamed() {
    const def = BOSS_DEF, bond = bz.st.tame ? bz.st.tame.bond : 1;
    const ent = adoptTame(def, bond, bz.st.x, bz.st.y, true);
    ISL.noteBeat(save, BOSS_ID); dirty = true;
    bz.done = 'tamed'; bz.st = null; bz.tele.length = 0; bz.live.length = 0; bz.engaged = false;
    toast(ent ? 'The ' + def.name + ' is yours: an alpha! ' + (def.ride && def.ride.saddle ? 'Craft a ' + itemName(def.ride.saddle).toLowerCase() + ' to ride it.' : '') : 'The ' + def.name + ' is happy. Your bond grows.');
    refreshMount();
    checkMedals();
  }

  // ---------- fog + minimap ----------
  let fog = (savedIsle && savedIsle.seed === SEED && FOG.decode(savedIsle.fog)) || FOG.make();
  let fogDirty = true, lastFogTile = -1, fogAcc = 0, fogCalls = 0; // PI2: an integer tile key (no per-frame string); the low tier reveals at 10 Hz
  function revealFog() {
    fogCalls++;
    const tx = tileOf(hero.x), ty = tileOf(hero.y), k = ty * 65536 + tx;
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
      // 8B: a crisp light rim around the hero, baked once here (never per frame), so the hero reads on any ground
      let rc = cv;
      for (let k = 0; k < Math.max(1, Math.round(DPR)) && MS && MS.rimCanvas; k++) rc = MS.rimCanvas(rc, 0, null, mk) || rc; // 1 logical px thick
      frames.push(rc);
    }
    const sh = mk(Math.round(24 * DPR), Math.round(8 * DPR)), sc = sh.getContext('2d');
    sc.fillStyle = 'rgba(0,0,0,0.28)'; sc.beginPath(); sc.ellipse(sh.width / 2, sh.height / 2, sh.width / 2, sh.height / 2, 0, 0, Math.PI * 2); sc.fill();
    return { frames: frames, shadow: sh };
  })();

  // ---------- render ----------
  const MOOD_COL = { shy: '#9ad07a', neutral: '#e0c060', hostile: '#e0604a' };
  let camX = 0, camY = 0;
  function render() {
    sparksDrawn = GFX.sparks === Infinity ? -1 : GFX.sparks - sparkLeft; sparkLeft = GFX.sparks; // the last frame's count (-1 = uncapped)
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
    drawTdGround(); // TD1: thin-ice cracks / slush, glints
    drawArena();
    drawBossGround();
    // telegraphs first (on the ground, under every body)
    for (let i = 0; i < creatures.length; i++) { const c = creatures[i]; if (c.ph === 'wind') drawTelegraph(c, c.x - camX, c.y - camY); }
    if (bz.tele.length || bz.live.length) drawBossZones();
    // creatures, y-sorted into a reused buffer (insertion sort: at most 24, nearly sorted frame to frame, no per-frame arrays)
    const list = drawBuf;
    list.length = creatures.length;
    for (let i = 0; i < creatures.length; i++) {
      const c = creatures[i]; let j = i - 1;
      while (j >= 0 && list[j].y > c.y) { list[j + 1] = list[j]; j--; }
      list[j + 1] = c;
    }
    drawDeaths();
    for (let i = 0; i < list.length; i++) {
      const c = list[i], sx = c.x - camX, sy = c.y - camY;
      if (sx < -140 || sy < -140 || sx > VW + 140 || sy > VH + 140) continue;
      const st = stripOf(c, c.moving);
      let top = sy - c.rad * 2.4;
      if (st) {
        const a = c.art;
        if (a && a.shadow && GFX.shadows) { const w0 = a.w / a.dpr, w = Math.min(w0, st.w * 0.8, st.span), h = a.shadow.height / a.dpr * w / w0; g.drawImage(a.shadow, sx - w / 2, sy - h / 2, w, h); } // AW2 / AW3: shadow no wider than the body
        STRIPS.draw(g, st, stripFrame(c), sx, sy, 1, MS.flipFor(c.act, c.dir));
        c.drawn = st.id; c.src = 'png';
        top = Math.min(top, sy - (st.ay - st.top) - 2);
      } else if (c.art) {
        const a = c.art, act = c.moving ? 'move' : 'idle', fr = a.frames[act][CD.frameAt(act, c.t)];
        const w = a.w / a.dpr, h = a.h / a.dpr;
        if (a.shadow && GFX.shadows) g.drawImage(a.shadow, sx - w / 2, sy - (a.shadow.height / a.dpr) / 2, w, a.shadow.height / a.dpr);
        if (c.vx < -4) { g.save(); g.translate(sx, 0); g.scale(-1, 1); g.drawImage(fr, -w / 2, sy - a.ay / a.dpr, w, h); g.restore(); }
        else g.drawImage(fr, sx - w / 2, sy - a.ay / a.dpr, w, h);
        c.drawn = a.id; c.src = 'code';
      } else {
        g.fillStyle = MOOD_COL[c.mood] || '#ccc'; g.beginPath(); g.arc(sx, sy - c.rad * 0.6, c.rad, 0, Math.PI * 2); g.fill();
        c.drawn = ''; c.src = 'plain';
      }
      if (c.flash > 0) { g.fillStyle = 'rgba(255,255,255,0.55)'; g.beginPath(); g.arc(sx, sy - c.rad, c.rad, 0, Math.PI * 2); g.fill(); }
      if (c.hp < c.maxHp) { const bw = Math.max(20, c.rad * 1.6); g.fillStyle = '#2a1b1b'; g.fillRect(sx - bw / 2, top - 6, bw, 4); g.fillStyle = MOOD_COL[c.mood] || '#e0604a'; g.fillRect(sx - bw / 2, top - 6, bw * Math.max(0, c.hp / c.maxHp), 4); }
      if (c.tm) drawTameState(c, sx, sy, top);
    }
    drawBoss();
    // companions
    for (let i = 0; i < party.length; i++) {
      const p = party[i], cs = p.cs, sx = cs.x - camX, sy = cs.y - camY;
      if (sx < -140 || sy < -140 || sx > VW + 140 || sy > VH + 140) continue;
      g.strokeStyle = cs.down > 0 ? '#8a8a8a' : '#9ae07a'; g.lineWidth = 2; g.beginPath(); g.ellipse(sx, sy, 14, 5, 0, 0, Math.PI * 2); g.stroke();
      const pm = Math.abs(cs.x - p.lx) + Math.abs(cs.y - p.ly) > 0.4; p.lx = cs.x; p.ly = cs.y;
      const pst = STRIPS && p.sk && STRIPS.has(p.sk) ? STRIPS.get(p.sk, pm ? 'move' : 'idle', (p.dir = cs.face < 0 ? MS.LEFT : MS.RIGHT)) : null;
      if (pst) {
        STRIPS.draw(g, pst, MS.frameIndex(pm ? 'move' : 'idle', hero.t), sx, sy, 1, p.dir === MS.LEFT, true); // 8B: party creatures wear the light rim
        drawHeart(sx, sy - (pst.ay - pst.top) - 8, '#ff7aa8');
        continue;
      }
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
    let rdx = 0;
    if (ride && !hero.dead) {
      lift = CMP.overlay(ride, heroMoving).dy;
      const rst = STRIPS && rideKind && STRIPS.has(rideKind) ? STRIPS.get(rideKind, heroMoving ? 'move' : 'idle', (rideDir = MS.dirCode(hero.face.x * 100, hero.face.y * 100, rideDir))) : null;
      const sadAct = rst ? MS.saddleFor(rideKind, heroMoving) : null; // AW2: a mount without saddle strips (the strider) draws no overlay
      const sad = sadAct ? STRIPS.get(rideKind, sadAct, rideDir) : null;
      if (rst) {
        // the mount's own strip, then the separate saddle overlay (same view, same frame), then the hero on the manifest seat
        const ra = heroMoving ? 'move' : 'idle', fr = MS.frameIndex(ra, hero.t), flip = rideDir === MS.LEFT;
        if (rideArt && rideArt.shadow && GFX.shadows) { const a = rideArt, w0 = a.w / a.dpr, w = Math.min(w0, rst.w * 0.8, rst.span), h = a.shadow.height / a.dpr * w / w0; g.drawImage(a.shadow, hx - w / 2, hy - h / 2, w, h); }
        STRIPS.draw(g, rst, fr, hx, hy, 1, flip, true);
        if (sad && sad !== rst) STRIPS.draw(g, sad, fr, hx, hy, 1, flip);
        rideDrawn = rst.id; saddleDrawn = sad && sad !== rst ? sad.id : '';
        if (MS.seatOffset(rideKind, heroMoving, rideDir, fr, seat)) { lift = -seat.y + 5; rdx = Math.round(seat.x); }
      } else if (rideArt) {
        rideDrawn = rideArt.id; saddleDrawn = '';
        const a = rideArt, act = heroMoving ? 'move' : 'idle', fr = a.frames[act][CD.frameAt(act, hero.t)], w = a.w / a.dpr, h = a.h / a.dpr;
        if (a.shadow && GFX.shadows) g.drawImage(a.shadow, hx - w / 2, hy - (a.shadow.height / a.dpr) / 2, w, a.shadow.height / a.dpr);
        if (hero.face.x < 0) { g.save(); g.translate(hx, 0); g.scale(-1, 1); g.drawImage(fr, -w / 2, hy - a.ay / a.dpr, w, h); g.restore(); }
        else g.drawImage(fr, hx - w / 2, hy - a.ay / a.dpr, w, h);
      } else { g.fillStyle = '#8a6a4a'; g.beginPath(); g.ellipse(hx, hy - 8, 26, 14, 0, 0, Math.PI * 2); g.fill(); }
    }
    rideLift = lift; rideDx = rdx;
    if (!hero.dead && (REDUCED || !(hero.iframes > 0 && Math.floor(hero.iframes * 12) % 2))) { // PI2: reduced motion: no blink, a steady fade
      if (REDUCED && hero.iframes > 0) g.globalAlpha = 0.6;
      if (ART) {
        if (GFX.shadows && !ride) g.drawImage(heroArt.shadow, hx - 12, hy - 2, 24, 8);
        g.drawImage(heroArt.frames[Math.floor(hero.t * 6) % 2], hx - 16 + rdx, hy - 28 + lift, 32, 32);
      } else { g.fillStyle = CLASS_COL[HERO.cls] || '#4f9a45'; g.beginPath(); g.arc(hx, hy - 8 + lift, HERO_R, 0, Math.PI * 2); g.fill(); }
      g.globalAlpha = 1;
    }
    if (abil && ride && !hero.dead && (abil.ph === 'active' || abil.ph === 'wind')) drawAbility(hx, hy);
    drawTdSky(hx, hy); // TD1: night tint + aurora band, the air arrow, soak steam
  }
  // XW1: the ability's look: a windup line ahead (charge), a ring for stomp / roar / the warm aura, a soft glow while the rest are on
  function drawAbility(hx, hy) {
    const d = abilDef;
    g.save();
    if (abil.ph === 'wind') {
      g.strokeStyle = TG_COL; g.lineWidth = 3; g.globalAlpha = 0.8;
      g.beginPath(); g.moveTo(hx, hy); g.lineTo(hx + hero.face.x * (d.dist || 3) * TILE, hy + hero.face.y * (d.dist || 3) * TILE); g.stroke();
    } else {
      const r = (d.r || d.warmR || 0) * TILE, k = d.dur > 0 ? clamp(abil.t / d.dur, 0, 1) : 0;
      g.strokeStyle = d.kind === 'aura' ? '#f2b84b' : d.kind === 'swim' ? '#8ad0ff' : '#fff4a8';
      g.globalAlpha = r ? 0.35 + 0.4 * k : 0.55; g.lineWidth = r ? 3 : 2;
      g.beginPath(); g.arc(hx, hy - 6, r || 22, 0, Math.PI * 2); g.stroke();
    }
    g.restore();
  }
  const drawBuf = [];
  const TG_COL = '#ffb347', TG_BIG = '#ff6a3a';
  // PI2: reduced motion = the OS setting or the shared "screen flashes off" pref (MMSideAccess sets data-reduce-motion on <html>)
  const REDUCED = (() => { try { return window.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (e) { return false; } })() || !!(window.MMSideAccess && window.MMSideAccess.reduced());
  const STILL = REDUCED || !GFX.terrainAnim; // still terrain decor: reduced motion, or the low graphics tier (telegraphs keep their own rule)
  let sparkLeft = 0, sparksDrawn = 0, drawCalls = 0;
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
  // ---- X6 boss drawing: the arena ring, the exact MMIsleBoss shapes (telegraph -> live), the boss itself ----
  const ARENA_DASH = [14, 10], NO_DASH = [];
  const BOSS_TG = { frac: 0, alpha: 0, n: 0 }; // the last telegraph fill drawn (test handle; reused)
  function drawArena() {
    if (!bossSite) return;
    const sx = bz.sx - camX, sy = bz.sy - camY, R = ARENA_R;
    if (sx + R < 0 || sy + R < 0 || sx - R > VW || sy - R > VH) return;
    arenaDrawn++;
    if (arenaImg) { g.drawImage(arenaImg.img, Math.round(sx - R), Math.round(sy - R), R * 2, R * 2); arenaSrc = 'png'; return; }
    arenaSrc = 'code';
    const hot = bossAlive() && bz.engaged;
    g.save();
    g.globalAlpha = hot ? 0.75 : 0.45;
    g.strokeStyle = '#2a1408'; g.lineWidth = 7; g.beginPath(); g.arc(sx, sy, R, 0, Math.PI * 2); g.stroke();
    g.strokeStyle = hot ? '#ff9a4a' : '#e8c890'; g.lineWidth = 3; g.setLineDash(ARENA_DASH); g.beginPath(); g.arc(sx, sy, R, 0, Math.PI * 2); g.stroke();
    g.setLineDash(NO_DASH);
    g.fillStyle = hot ? '#ff9a4a' : '#e8c890';
    for (let i = 0; i < 12; i++) { const a = i * Math.PI / 6; g.fillRect(Math.round(sx + Math.cos(a) * (R - 12)) - 3, Math.round(sy + Math.sin(a) * (R - 12)) - 3, 6, 6); } // rune stones
    g.restore();
  }
  // the path of a boss shape around its origin (already translated there); k scales the reach (telegraph fill), tau spins a spiral
  function zonePath(z, k, tau) {
    g.beginPath();
    if (z.shape === 'line') { g.rotate(z.angle); g.rect(0, -z.width / 2, z.len * k, z.width); g.rotate(-z.angle); }
    else if (z.shape === 'cone') { g.moveTo(0, 0); g.arc(0, 0, Math.max(1, z.radius * k), z.angle - z.arc / 2, z.angle + z.arc / 2); g.closePath(); }
    else if (z.shape === 'ring') { const o = z.inner + (z.outer - z.inner) * k; g.arc(0, 0, Math.max(z.inner + 1, o), 0, Math.PI * 2); g.arc(0, 0, z.inner, Math.PI * 2, 0, true); }
    else if (z.shape === 'spiral') {
      const step = Math.PI * 2 / z.arms, base = z.angle + z.spin * tau;
      for (let i = 0; i < z.arms; i++) { const a = base + i * step; g.moveTo(0, 0); g.arc(0, 0, Math.max(1, z.radius * k), a - z.armHalf, a + z.armHalf); g.closePath(); }
    }
    else if (z.shape === 'burst') { // XB bubbles / lava vents: each disc grows with the telegraph (static with reduced motion)
      const p = z.pts || [], r = Math.max(1, z.r * k);
      for (let i = 0; i < p.length; i++) { g.moveTo(p[i].dx + r, p[i].dy); g.arc(p[i].dx, p[i].dy, r, 0, Math.PI * 2); }
    }
  }
  // XB: the frost dragon's hot springs (always safe) and its thin-ice patches, under every telegraph
  function drawBossGround() {
    const s = bz.st;
    if (!s || !bz.engaged) return;
    if (s.springs) for (let i = 0; i < s.springs.length; i++) {
      const p = s.springs[i], sx = p.x - camX, sy = p.y - camY;
      g.globalAlpha = 0.85; g.fillStyle = '#3aa8a0'; g.beginPath(); g.arc(sx, sy, p.r, 0, Math.PI * 2); g.fill();
      g.globalAlpha = 1; g.strokeStyle = '#f2e0a0'; g.lineWidth = 3; g.stroke();
      const k = STILL ? 0 : (simT * 12) % 10; // steam puffs rise (static with reduced motion)
      g.fillStyle = 'rgba(255,255,255,0.65)'; g.fillRect(sx - 12, sy - 16 - k, 5, 6); g.fillRect(sx + 7, sy - 10 - ((k + 5) % 10), 5, 6);
    }
    if (s.ice && s.ice.length) for (let i = 0; i < s.ice.length; i++) {
      const z = s.ice[i].zone;
      g.save(); g.translate(z.x - camX, z.y - camY);
      g.globalAlpha = 0.32; g.fillStyle = '#d8f2ff'; zonePath(z, 1, 0); g.fill();
      g.globalAlpha = 0.7; g.strokeStyle = '#ffffff'; g.lineWidth = 2; zonePath(z, 1, 0); g.stroke();
      g.restore();
    }
    g.globalAlpha = 1;
  }
  function drawBossZones() {
    for (let i = 0; i < bz.tele.length; i++) {
      const tg = bz.tele[i], z = tg.zone, sx = z.x - camX, sy = z.y - camY;
      const p = clamp((simT - tg.t0) / tg.windup, 0, 1);
      const frac = REDUCED ? 1 : p, alpha = REDUCED ? 0.3 : 0.14 + 0.3 * p; // reduced motion: one static shape, no growth, no pulse
      g.save(); g.translate(sx, sy);
      g.globalAlpha = alpha; g.fillStyle = TG_BIG; zonePath(z, frac, 0); g.fill();
      g.globalAlpha = 0.95; g.strokeStyle = TG_BIG; g.lineWidth = 3; zonePath(z, 1, 0); g.stroke();
      g.restore();
      tg.drawn++; if (tg.first < 0) tg.first = simT; tg.last = simT;
      BOSS_TG.frac = frac; BOSS_TG.alpha = alpha; BOSS_TG.n++;
    }
    for (let i = 0; i < bz.live.length; i++) {
      const L = bz.live[i], z = L.zone, tau = simT - L.t0;
      if (tau < 0 || tau > L.dur) continue;
      g.save(); g.translate(z.x - camX, z.y - camY);
      g.globalAlpha = 0.55; g.fillStyle = '#ff3a2a'; zonePath(z, 1, tau); g.fill();
      g.globalAlpha = 1; g.strokeStyle = '#fff0c0'; g.lineWidth = 2; zonePath(z, 1, tau); g.stroke();
      g.restore();
    }
  }
  function drawBoss() {
    if (!bz.st) return;
    const sx = bz.x - camX, sy = bz.y - camY;
    if (sx < -200 || sy < -240 || sx > VW + 200 || sy > VH + 200) return;
    let top = sy - 110;
    const under = !!(bz.st.sub || bz.st.dig); // XB: diving (hydra) or burrowing (titan): a faint body and a ripple / dust ring
    if (under) g.globalAlpha = 0.3;
    const st = stripOf(bz, bz.moving);
    if (st) {
      const a = bz.art;
      if (a && a.shadow && GFX.shadows) { const w = a.w / a.dpr; g.drawImage(a.shadow, sx - w / 2, sy - (a.shadow.height / a.dpr) / 2, w, a.shadow.height / a.dpr); }
      let fr;
      if (bz.act === 'roar' && bz.tele.length) { const tg = bz.tele[bz.tele.length - 1]; fr = MS.frameIndex('roar', clamp((simT - tg.t0) / tg.windup, 0, 0.999) * MS.duration('roar', bz.sk), bz.sk); }
      else if (bz.act === 'idle' || bz.act === 'move' || bz.act === 'sleep' || bz.act === 'eat') fr = MS.frameIndex(bz.act, bz.t, bz.sk);
      else fr = MS.frameIndex(bz.act, simT - bz.at0, bz.sk);
      STRIPS.draw(g, st, fr, sx, sy, 1, MS.flipFor(bz.act, bz.dir));
      bz.drawn = st.id; bz.src = 'png';
      top = sy - (st.ay - st.top) - 2;
    } else if (bz.art) {
      const a = bz.art, act = bz.moving ? 'move' : 'idle', fr = a.frames[act][CD.frameAt(act, bz.t)], w = a.w / a.dpr, h = a.h / a.dpr;
      if (a.shadow && GFX.shadows) g.drawImage(a.shadow, sx - w / 2, sy - (a.shadow.height / a.dpr) / 2, w, a.shadow.height / a.dpr);
      if (bz.vx < -4) { g.save(); g.translate(sx, 0); g.scale(-1, 1); g.drawImage(fr, -w / 2, sy - a.ay / a.dpr, w, h); g.restore(); }
      else g.drawImage(fr, sx - w / 2, sy - a.ay / a.dpr, w, h);
      bz.drawn = a.id; bz.src = 'code';
      top = sy - a.ay / a.dpr - 2;
    }
    if (under) {
      g.globalAlpha = 1; g.strokeStyle = bz.st.sub ? '#bfe8ff' : '#a07a4a'; g.lineWidth = 3;
      g.beginPath(); g.ellipse(sx, sy, 44 + (REDUCED ? 0 : Math.sin(simT * 6) * 4), 13, 0, 0, Math.PI * 2); g.stroke();
    }
    if (bz.st.heads) for (let i = 0; i < bz.st.heads.length; i++) { // XB: the hydra's 3 heads (left / middle / right), a cut one greyed out
      const hx = Math.round(sx + (i - 1) * 30) - 6, hy = Math.round(top - 40);
      g.fillStyle = '#1a2a3a'; g.fillRect(hx - 1, hy - 1, 14, 14);
      g.fillStyle = bz.st.heads[i] > 0 ? '#4aa8e0' : '#6a6a6a'; g.fillRect(hx + 1, hy + 1, 10, 10);
    }
    if (bz.flash > 0) { g.fillStyle = 'rgba(255,255,255,0.28)'; g.beginPath(); g.arc(sx, sy - 40, BOSS_RAD, 0, Math.PI * 2); g.fill(); }
    if (bz.ko) { g.fillStyle = '#e8e0ff'; g.font = 'bold 16px monospace'; const k = REDUCED ? 0 : Math.floor(simT * 2) % 3; g.fillText('z', sx + 30, top - 2 - k * 3); g.fillText('Z', sx + 40, top - 14 - k * 3); }
    if (bz.tele.length) { g.fillStyle = TG_BIG; g.fillRect(sx - 3, top - 26, 6, 14); g.fillRect(sx - 3, top - 9, 6, 5); } // "!"
  }
  // death strips of the pooled dying creatures (held on the last frame briefly, then the slot frees)
  function drawDeaths() {
    if (!STRIPS) return;
    for (let i = 0; i < deadPool.length; i++) {
      const d = deadPool[i];
      if (!d.on) continue;
      const el = simT - d.t0;
      if (el > MS.duration('death', d.sk) + 0.35) { d.on = false; continue; }
      const st = STRIPS.get(d.sk, 'death', d.dir);
      if (!st) { d.on = false; continue; }
      STRIPS.draw(g, st, MS.frameIndex('death', el, d.sk), d.x - camX, d.y - camY, 1, MS.flipFor('death', d.dir));
      if (d.id !== st.id) { d.id = st.id; deathsShown++; }
    }
  }
  function drawHeart(x, y, col) {
    g.fillStyle = col; g.fillRect(x - 5, y - 3, 4, 4); g.fillRect(x + 1, y - 3, 4, 4); g.fillRect(x - 4, y, 8, 3); g.fillRect(x - 2, y + 3, 4, 2);
  }
  // sleeping Zs, a heart while befriending, a purple torpor bar and a green taming bar
  function drawTameState(c, sx, sy, top) {
    const tm = c.tm, bw = Math.max(20, c.rad * 1.6);
    if (c.ko) {
      g.fillStyle = '#e8e0ff'; g.font = 'bold 12px monospace';
      const k = REDUCED ? 0 : Math.floor(simT * 2) % 3; // PI2: still Zs with reduced motion
      g.fillText('z', sx + c.rad * 0.6, top - 2 - k * 3); g.fillText('Z', sx + c.rad * 0.6 + 6, top - 10 - k * 3);
    } else if (c.calm) drawHeart(sx, top - 12, '#ff7aa8');
    if (tm.torpor > 0 && !c.ko && tm.torporMax > 0) { g.fillStyle = '#2a1b2a'; g.fillRect(sx - bw / 2, top + 0, bw, 3); g.fillStyle = '#a77ae0'; g.fillRect(sx - bw / 2, top, bw * clamp(tm.torpor / tm.torporMax, 0, 1), 3); }
    if (tm.need > 0 && (c.ko || c.calm)) { g.fillStyle = '#1b2a1b'; g.fillRect(sx - bw / 2, top + 4, bw, 4); g.fillStyle = '#7ae07a'; g.fillRect(sx - bw / 2, top + 4, bw * clamp(tm.prog / tm.need, 0, 1), 4); }
  }

  // ---------- B10: homestead (Hearth Isle only, local save), gather spots, travel, medals ----------
  // the day key comes from Date.now() (the same source as the page clock and the save load), never from a bare `new Date()`: a second
  // time source made the daily spots, sparkles and bonus finds follow the wall calendar even when the page clock is pinned (tests)
  const DAY = todayQ && /^\d{4}-\d{2}-\d{2}$/.test(todayQ) ? todayQ : (() => { try { return new Date(Date.now()).toISOString().slice(0, 10); } catch (e) { return ''; } })();
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
      else toast({ none: 'No ' + HS.KINDS[buildKind].name.toLowerCase() + ' left. Pick one up to move it, or Make more.', ground: 'That spot is not open ground.', outside: 'Decorate inside the garden square.', taken: 'Something is already there.', full: 'The garden is full.' }[r.why] || 'Not here.');
    }
    if (r.ok) { lastAct = r.act; dirty = true; persist(); refreshDecor(); refreshGuests(); }
    return r;
  }
  function undoBuild() {
    if (!lastAct || !HS.undo(save.home, lastAct, clock.now())) { toast('Nothing to undo.'); return false; }
    lastAct = null; dirty = true; persist(); refreshDecor(); refreshGuests(); toast('Undone.');
    return true;
  }
  // decor art: one small canvas per kind, baked once (AW2: kinds with a b35 prop by id - the pen's stable - draw that PNG instead)
  const decorArt = {};
  let homeProps = null;
  if (HOME && IA && IA.pack === 'meadow') IA.ready.then(() => {
    const pp = IA.propsActive() ? IA.props() : null;
    if (pp) { homeProps = {}; HS.ORDER.forEach((k) => { const a = window.MMIsleArt.propFor(pp, k, 0, 0); if (a) homeProps[k] = a; }); }
  });
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
      const art = def ? baker.bake({ id: def.id, archetype: IC.ARCH[def.id] || ARCH_BY_SIZE[def.size] || 'blob', size: def.size, biome: DRAW_BIOME }, { dpr: DPR }) : null;
      const nm = tameName(t);
      guests.push({ id: t.id, sp: t.sp, nm: nm, label: bakeLabel(nm), art: art, sk: stripKind(t.sp), x: (homeO.x + pen.x + 0.5) * TILE + ((i % 3) - 1) * 10, y: (homeO.y + pen.y + 0.5) * TILE + 6, t: i });
    });
  }
  // X7: a resting tame's name (its own name, else the species name), baked once into a small label canvas
  const tameName = (t) => { const def = CR.get(t.sp); return (t.nm && String(t.nm).trim()) || (def ? def.name : String(t.sp).replace(/_/g, ' ')); };
  function bakeLabel(text) {
    const fs = 10, c0 = mk(1, 1).getContext('2d');
    c0.font = 'bold ' + fs + 'px ui-monospace, Menlo, Consolas, monospace';
    const w = Math.ceil(c0.measureText(text).width) + 6, h = fs + 5;
    const cv = mk(Math.round(w * DPR), Math.round(h * DPR)), c = cv.getContext('2d');
    c.scale(DPR, DPR);
    c.fillStyle = 'rgba(12,20,15,0.78)'; c.fillRect(0, 0, w, h);
    c.font = c0.font; c.textBaseline = 'middle'; c.fillStyle = '#f3ecd2'; c.fillText(text, 3, h / 2 + 0.5);
    return { cv: cv, w: w, h: h };
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
  // G-26 (b05-07): a gather with no room for the find does not spend the spot (same dry run as invAdd)
  function invRoomFor(id) { if (!CRAFT || typeof id !== 'string') return false; const cur = invCount(id), want = {}; Object.keys(save.inv).forEach((k) => { want[k] = save.inv[k]; }); want[id] = Math.min(CRAFT.MAX_COUNT, cur + 1); return ((CRAFT.cleanInv(want)[id] | 0) - cur) > 0; }
  function gatherNear() {
    const p = spotNear();
    if (!p || hero.dead) return { ok: false, why: 'none' };
    if (CRAFT && !invRoomFor(p.kind)) { toast('Pack full. The spot keeps its find for later.'); return { ok: false, why: 'full' }; }
    const r = HS.gather(save.gather, ISLE, p, DAY);
    if (r.ok) {
      invAdd(r.kind, 1);
      // XD1/XW1: a seeded bonus forage find from the pack's FINDS table (one MMRng draw per island, day and spot)
      const f = CRAFT && CRAFT.bonusFind ? CRAFT.bonusFind(PACK_ID, RNG.create(ISLE + '|' + DAY + '|' + p.idx).next()) : '';
      const fGot = f ? invAdd(f, 1) : 0;
      r.find = fGot ? f : '';
      toast('You found ' + HS.resName(r.kind) + '. (' + r.total + ' in your log)' + (fGot ? ' And a little ' + HS.resName(f) + '.' : ''));
      logEvent('gather'); reward();
      dirty = true; persist();
    }
    else if (r.why === 'today') toast('Already gathered here today. It grows back tomorrow.');
    return r;
  }

  // ---------- X4: inventory, walk-over resource nodes, crafting, island unlocks ----------
  if (!save.inv || typeof save.inv !== 'object') save.inv = {};
  const ITEM_NAME = { raft: 'Raft', rocket_core: 'Rocket core', feast: 'Feast', sleepy_herb: 'Sleepy herb', warm_cloak: 'Warm cloak', o2_tank: 'O2 tank',
    // XW1: the XD1 recipe outputs
    heat_pack: 'Heat pack', glow_lamp: 'Glow lamp', bone_charm: 'Bone charm', honey_cake: 'Honey cake', sea_salt_snack: 'Sea salt snack', stone_bench: 'Stone bench',
    berry_jam: 'Berry jam', signal_beacon: 'Signal beacon', aurora_lamp: 'Aurora lamp', chrome_beacon: 'Chrome beacon', aurora_shard: 'Aurora shard', chrome_flake: 'Chrome flake', trophy_tyrant: 'Tyrant trophy', trophy_hydra: 'Hydra trophy', trophy_dragon: 'Dragon trophy', trophy_titan: 'Titan trophy' };
  // XW1: a recipe row's label: an alternative recipe names its build so the two rocket core rows read apart
  const RECIPE_LABEL = { rocket_core_drift: 'Rocket core (drift build)', o2_tank_kelp: 'O2 tank (kelp build)' };
  const SADDLE_OF = {};
  CR.list().forEach((d) => { if (d.ride && d.ride.saddle) SADDLE_OF[d.ride.saddle] = d.name; });
  const itemName = (id) => (has(ITEM_NAME, id) ? ITEM_NAME[id] : has(SADDLE_OF, id) ? SADDLE_OF[id] + ' saddle' : HS.resName(id));
  const invCount = (id) => (has(save.inv, id) && save.inv[id] > 0 ? save.inv[id] : 0);
  // add n of an item to `inv` through MMIsleCraft.cleanInv (unknown ids, a full stack or 64 stacks add nothing); returns how many went in
  function invAdd(id, n) {
    if (!CRAFT || !(n > 0) || typeof id !== 'string') return 0;
    const cur = invCount(id), want = {};
    Object.keys(save.inv).forEach((k) => { want[k] = save.inv[k]; });
    want[id] = Math.min(CRAFT.MAX_COUNT, cur + Math.floor(n));
    const next = CRAFT.cleanInv(want);
    const got = (next[id] | 0) - cur;
    if (got <= 0) return 0;
    save.inv = next; dirty = true;
    if (panelKind === 'craft') craftDirty = true;
    return got;
  }
  // ---------- XB: trophies on the home pedestal, and rematches at home ----------
  // A boss's unique drop crafts its trophy_* (MMIsleCraft); a crafted trophy stands on the pedestal on Hearth Isle (save.trophies, tier 1;
  // the item stays in your pack too). The pedestal offers a rematch with any boss you have beaten or hold the trophy of, at any time, with
  // no cooldown: the same fight (MMIsleBoss opts.rematch), normal loot only, never a tame. The first rematch win per placed trophy gives it
  // a gold trim (tier 2), once. Leaving the ring just ends the rematch.
  const NATIVE_BIOME = { fernjaw_tyrant: 'jungle', tide_hydra: 'reef', frost_dragon: 'ice', red_titan: 'mars' };
  const TROPHY_COL = { trophy_tyrant: '#6aa04a', trophy_hydra: '#3a8ac0', trophy_dragon: '#bfe4f4', trophy_titan: '#c0482a' };
  const TROPHY_IDS = ISL.TROPHY_IDS || [];
  const trophyOf = (id) => (BOSS && BOSS.trophyFor ? BOSS.trophyFor(id) : '');
  const RM_BOSSES = BOSS && BOSS.ids ? BOSS.ids().filter((id) => !!CR.get(id) && !!trophyOf(id)) : [];
  const PED_R = 3 * TILE;
  let pedDrawn = 0, rmWins = 0;
  const rmArt = {};
  // trophies already in the pack (crafted on another island, or before XB) stand on the pedestal too (written by the first save tick)
  TROPHY_IDS.forEach((t) => { if (invCount(t) > 0) ISL.setTrophy(save, t, 1); });
  // the pedestal: the first open 3x3 patch of dry land 4+ tiles from the spawn pad, outside the garden square and away from the dock
  function findPedestal() {
    const sp = world.spawnPoint;
    const inGarden = (x, y) => !!homeO && x >= homeO.x - 1 && y >= homeO.y - 1 && x <= homeO.x + HS.GRID_W && y <= homeO.y + HS.GRID_W;
    for (let r = 4; r <= 30; r++) for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
      if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
      const x = sp.x + dx, y = sp.y + dy;
      if (x < 3 || y < 3 || x >= W - 3 || y >= H - 3 || inGarden(x, y)) continue;
      if (world.dock && Math.abs(x - world.dock.x) + Math.abs(y - world.dock.y) < 4) continue;
      let ok = true;
      for (let j = -1; j <= 1 && ok; j++) for (let i = -1; i <= 1 && ok; i++) if (!walkableAt(x + i, y + j) || heroSolidAt(x + i, y + j) || WET[tileName(x + i, y + j)]) ok = false;
      if (ok) return { x: x, y: y };
    }
    return null;
  }
  const pedestal = HOME ? findPedestal() : null;
  const nearPedestal = () => !!pedestal && !hero.dead && Math.hypot((pedestal.x + 0.5) * TILE - hero.x, (pedestal.y + 0.5) * TILE - hero.y) <= PED_R;
  const canRematch = (id) => !!(HOME && pedestal && BOSSES && RM_BOSSES.indexOf(id) >= 0 &&
    ((Array.isArray(save.beat) && save.beat.indexOf(id) >= 0) || ISL.trophyTier(save, trophyOf(id)) > 0));
  function startRematch(id) {
    if (!canRematch(id)) return { ok: false, why: 'locked' };
    if (bossAlive()) return { ok: false, why: 'busy' };
    if (hero.dead) return { ok: false, why: 'dead' };
    const def = CR.get(id);
    BOSS_ID = id; BOSS_DEF = def; BOSS_TAMEABLE = false;
    bossSite = { x: pedestal.x, y: pedestal.y, boss: id };
    bz.sx = (pedestal.x + 0.5) * TILE; bz.sy = (pedestal.y + 0.5) * TILE;
    bz.sp = id; bz.kind = id; bz.sk = stripKind(id);
    if (!has(rmArt, id)) rmArt[id] = baker.bake({ id: id, archetype: IC.ARCH[id] || 'giant', size: def.size, biome: NATIVE_BIOME[id] || DRAW_BIOME }, { dpr: DPR });
    bz.art = rmArt[id];
    bz.rm = true; bz.done = '';
    if (panelKind) closePanel();
    spawnBoss();
    bz.engaged = true;
    toast('The ' + def.name + ' is here for a friendly rematch. ' + (BOSS.hint ? BOSS.hint(id) + ' ' : '') + 'Leave the ring any time to stop.');
    logEvent('rematch');
    return { ok: true, id: id };
  }
  function endRematch(why) {
    const nm = bossName();
    bz.st = null; bz.tele.length = 0; bz.live.length = 0; bz.engaged = false; bz.rm = false; bz.done = why || 'left'; bz.onIce = false; bz.ph = ''; bz.moving = false;
    BOSS_ID = null; BOSS_DEF = null; BOSS_TAMEABLE = false; bossSite = null;
    if (why === 'left') toast('The ' + nm + ' heads home. Rematch any time from the pedestal.');
    if (panelKind === 'trophy') renderTrophies();
  }
  function rematchWon() {
    const id = BOSS_ID, t = trophyOf(id), nm = BOSS_DEF ? BOSS_DEF.name : '';
    const trim = !!t && ISL.trophyTier(save, t) === 1 && ISL.setTrophy(save, t, 2);
    rmWins++; dirty = true;
    endRematch('won');
    toast('Good match with the ' + nm + '!' + (trim ? ' Your ' + itemName(t).toLowerCase() + ' gets a gold trim.' : ''));
    logEvent('rematch_won');
    checkMedals();
  }
  // the pedestal panel: one row per boss (its trophy, how to craft it, the rematch button). Rebuilt only when it opens or changes.
  function renderTrophies() {
    while (panelBody.firstChild) panelBody.removeChild(panelBody.firstChild);
    panelBody.appendChild(el('p', 'calm', 'Keepsakes from the big creatures you have met. Rematch any of them here whenever you like, just for fun: normal loot, no taming. Leave the ring to stop.'));
    const list = el('div', 'trophy-list'); list.id = 'trophy-list';
    RM_BOSSES.forEach((id) => {
      const def = CR.get(id), t = trophyOf(id), tier = ISL.trophyTier(save, t), rc = CRAFT ? CRAFT.get(t) : null;
      const row = el('div', 'trophy-row' + (tier ? ' on' : '') + (tier === 2 ? ' gold' : ''));
      row.dataset.boss = id; row.dataset.trophy = t; row.dataset.tier = String(tier);
      const info = el('div', 'rc-info');
      info.appendChild(el('div', 'rc-name', itemName(t) + (tier === 2 ? ' (gold trim)' : tier ? ' (on the pedestal)' : '')));
      info.appendChild(el('div', 'rc-note', tier ? def.name + '. ' + (BOSS.hint ? BOSS.hint(id) : '') :
        rc ? 'Craft it (K): ' + Object.keys(rc.in).map((k) => HS.resName(k) + ' ' + invCount(k) + '/' + rc.in[k]).join(', ') : 'Not made yet.'));
      row.appendChild(info);
      const can = canRematch(id);
      const b = el('button', 'rc-btn rematch', 'Rematch'); b.type = 'button'; b.dataset.boss = id;
      b.setAttribute('aria-label', can ? 'Rematch the ' + def.name : 'Rematch the ' + def.name + ': meet it on its island first');
      if (!can) { b.disabled = true; b.setAttribute('aria-disabled', 'true'); }
      b.addEventListener('click', () => startRematch(id));
      row.appendChild(b);
      list.appendChild(row);
    });
    panelBody.appendChild(list);
    panelBody.appendChild(el('p', 'dim', BOSSES ? 'A first rematch win gives a trophy on the pedestal a gold trim, once. Every rematch gives the normal loot.' : 'Bosses are off (?bosses=0), so rematches are too.'));
  }
  // the pedestal itself (code-drawn stone, one slot per trophy; a gold rim once trimmed). Constant colours, no per-frame allocations.
  function drawPedestal() {
    if (!pedestal) return;
    const cx = Math.round((pedestal.x + 0.5) * TILE - camX), by = Math.round((pedestal.y + 0.5) * TILE - camY);
    if (cx < -2 * TILE || by < -2 * TILE || cx > VW + 2 * TILE || by > VH + 2 * TILE) return;
    pedDrawn++;
    g.fillStyle = 'rgba(0,0,0,0.25)'; g.fillRect(cx - 30, by + 8, 60, 6);
    g.fillStyle = '#8a8478'; g.fillRect(cx - 28, by - 6, 56, 14);
    g.fillStyle = '#b8b0a0'; g.fillRect(cx - 31, by - 10, 62, 6);
    g.fillStyle = '#5a5448'; g.fillRect(cx - 28, by + 6, 56, 2);
    for (let i = 0; i < TROPHY_IDS.length; i++) {
      const t = TROPHY_IDS[i], tier = ISL.trophyTier(save, t), x = cx - 25 + i * 13;
      if (!tier) { g.fillStyle = '#6a6458'; g.fillRect(x + 2, by - 13, 6, 3); continue; }
      if (tier === 2) { g.fillStyle = '#f2c84b'; g.fillRect(x - 1, by - 27, 12, 18); }
      g.fillStyle = TROPHY_COL[t] || '#ccc'; g.fillRect(x + 1, by - 25, 8, 14);
      g.fillStyle = '#fff4d0'; g.fillRect(x + 3, by - 23, 2, 3);
    }
  }
  // walk-over nodes: every pack resource node except today's gather spots (those stay a G pick, once a day). In memory only: a node
  // you picked grows back after its pack `respawn` seconds (and a reload grows everything back; nothing is ever lost).
  const RESPAWN = {};
  (PACK.resources || []).forEach((r) => { RESPAWN[r.id] = r.respawn > 0 ? r.respawn : 300; });
  const spotSet = new Set(spots.map((p) => p.idx));
  const nodes = [], nodeAt = new Map(), nodeChunks = new Map();
  (world.resources || []).forEach((r, i) => {
    if (spotSet.has(i)) return;
    const n = { i: i, x: r.x, y: r.y, kind: r.kind, until: 0, picks: 0 };
    nodes.push(n); nodeAt.set(r.y * W + r.x, n);
    const ck = Math.floor(r.y / CH) * 4096 + Math.floor(r.x / CH);
    if (!nodeChunks.has(ck)) nodeChunks.set(ck, []);
    nodeChunks.get(ck).push(n);
  });
  const addNode = (n) => {
    nodes.push(n); nodeAt.set(n.y * W + n.x, n);
    const ck = Math.floor(n.y / CH) * 4096 + Math.floor(n.x / CH);
    if (!nodeChunks.has(ck)) nodeChunks.set(ck, []);
    nodeChunks.get(ck).push(n);
  };
  // IF1: food glints (MMIsleCraft.FOOD_NODES on seeded walkable tiles; a vine rope patch by the jungle dock, labelled), never on a
  // resource node or a gather spot; picked up and grown back like any other node
  const spotTiles = new Set(spots.map((p) => p.y * W + p.x));
  const FOOD_GLINTS = POUCH && CRAFT ? POUCH.place(world, PACK_ID, SEED, (tx, ty) => walkableAt(tx, ty) && !solidAt(tx, ty), NAMES, (i) => nodeAt.has(i) || spotTiles.has(i)) : [];
  FOOD_GLINTS.forEach((f, k) => addNode({ i: -1 - k, x: f.x, y: f.y, kind: f.kind, until: 0, picks: 0, respawn: f.respawn, label: f.label, food: true }));
  // IF1: forage sparkles: after SPARKLE_AFTER s with no reward, one small seeded find appears within SPARKLE_R tiles (<= 6 per island a
  // day, counted in save.spark; picked once, never regrows; nothing is lost if you never pick it)
  if (!save.spark || save.spark.day !== DAY) save.spark = { day: DAY, n: {} };
  let sparkle = null, sparkTry = 0;
  function sparkTick() {
    // the first-ten-minutes pity (MMIslePouch.PITY_*): a soak does not reset it, placed 2-3 steps away and no daily cap, so a fresh player
    // never waits long whatever the spawns did; it is still a plain seeded find (own MMRng stream), it never expires or nags
    const pity = !!(POUCH && POUCH.PITY_AFTER) && simT < POUCH.PITY_WINDOW;
    const since = pity ? simT - lastFindT : simT - lastRewardT;
    // never while you are low on air (mars): a find must not lure you away from the way back to a dome
    if (!POUCH || !CRAFT || hero.dead || envS.warnO || envS.emptyO || since < (pity ? POUCH.PITY_AFTER : POUCH.SPARKLE_AFTER)) return;
    // an unpicked sparkle you walked far away from moves back near you (it is the same sparkle: the day's count does not grow)
    const moving = !!sparkle && sparkle.until === 0;
    if (moving && Math.hypot((sparkle.x + 0.5) * TILE - hero.x, (sparkle.y + 0.5) * TILE - hero.y) <= (POUCH.SPARKLE_R + 4) * TILE) return;
    const used = (save.spark.n[ISLE] | 0) - (moving ? 1 : 0);
    // the daily cap (and the 40 s wait) after the first ten minutes; the pity window before that (MMIslePouch.sparkleDue)
    if ((POUCH.sparkleDue ? !POUCH.sparkleDue(since, simT, used) : used >= POUCH.SPARKLES_PER_DAY) || (bz.engaged && bossAlive())) return;
    if (moving) { nodeAt.delete(sparkle.y * W + sparkle.x); sparkle.until = Infinity; }
    const rs = RNG.create('isles|spark|' + ISLE + '|' + SEED + '|' + DAY + '|' + used + '|' + (sparkTry++));
    // a tile the hero can walk to: a small flood fill (4-neighbour, <= SPARKLE_R steps) from the hero's tile, then one seeded pick among
    // the tiles 2-6 steps away (further ones only when nothing is that close); runs once per sparkle, never per frame
    const hx = tileOf(hero.x), hy = tileOf(hero.y), R = POUCH.SPARKLE_R, seen = new Map(), q = [hy * W + hx], near = [], far = [];
    seen.set(q[0], 0);
    for (let h = 0; h < q.length; h++) {
      const i = q[h], st = seen.get(i), x = i % W, y = (i - x) / W;
      if (st >= 2 && !nodeAt.has(i)) (st <= (pity ? 3 : 6) ? near : far).push(i);
      if (st >= R) continue;
      for (let k = 0; k < 4; k++) {
        const nx = x + (k === 0) - (k === 1), ny = y + (k === 2) - (k === 3), ni = ny * W + nx;
        if (!inWorld(nx, ny) || seen.has(ni) || !walkableAt(nx, ny) || heroSolidAt(nx, ny)) continue;
        seen.set(ni, st + 1); q.push(ni);
      }
    }
    const pool = near.length ? near : far;
    if (!pool.length) return;
    const i = pool[Math.floor(rs.next() * pool.length)];
    sparkle = { i: -1000 - used, x: i % W, y: Math.floor(i / W), kind: POUCH.sparkle(ISLE, rs.next()), until: 0, picks: 0, respawn: 0, sparkle: true };
    addNode(sparkle);
    save.spark.n[ISLE] = used + 1; dirty = true;
    logEvent('sparkle');
  }
  let picked = 0, lastNodeTile = -1;
  const nodeReady = (n) => n.until <= clock.now();
  // called every sim step: one Map lookup by the hero's tile index (no allocation); a node fires once per arrival on its tile
  function nodeTick() {
    if (hero.dead || !CRAFT || !nodes.length) return;
    // IF1: a sparkle is picked up within a tile of its centre (it is small and shiny: brushing past is enough)
    if (sparkle && sparkle.until === 0 && Math.abs((sparkle.x + 0.5) * TILE - hero.x) < TILE && Math.abs((sparkle.y + 0.5) * TILE - hero.y) < TILE) {
      const sk = sparkle.y * W + sparkle.x, got = invAdd(sparkle.kind, 1);
      sparkle.until = Infinity; nodeAt.delete(sk); sparkle.picks++; picked++; reward();
      toast(got ? 'A forage sparkle: +1 ' + HS.resName(sparkle.kind) + ' (' + invCount(sparkle.kind) + ' in your pack)' : 'A forage sparkle, but your pack has no room for it.');
    }
    const k = tileOf(hero.y) * W + tileOf(hero.x);
    const n = nodeAt.get(k);
    if (!n) { lastNodeTile = -1; return; }
    if (lastNodeTile === k) return;
    lastNodeTile = k;
    if (!nodeReady(n)) return;
    const got = invAdd(n.kind, 1);
    if (!got) { toast('Your pack has no room for more ' + HS.resName(n.kind) + '.'); return; }
    if (n.sparkle) { n.until = Infinity; nodeAt.delete(k); lastNodeTile = -1; } else n.until = clock.now() + (n.respawn || RESPAWN[n.kind] || 300) * 1000;
    n.picks++; picked++; reward(); nodesSave(); // G-26
    toast((n.sparkle ? 'A forage sparkle: ' : '') + '+1 ' + HS.resName(n.kind) + ' (' + invCount(n.kind) + ' in your pack)');
  }
  // node art: one small canvas per resource kind, baked once (code art; shape by kind family)
  const NODE_COL = { wood: ['#8a5a32', '#5a3a1e'], driftwood: ['#b09070', '#7a5a3a'], stone: ['#a0a4a8', '#6a6e72'], iron: ['#7a6a66', '#b0603a'],
    oxide_dust: ['#d0643a', '#8a3a22'], pearl: ['#f4eef8', '#b8a8c8'], shell: ['#f6c8c0', '#c08a80'], fiber: ['#9ac05a', '#5a8a2a'],
    clover: ['#6ac05a', '#3a8a2a'], kelp: ['#4a9a6a', '#2a6a4a'], vine_rope: ['#5aa04a', '#2f6a2a'], apple: ['#e0443a', '#5a8a2a'],
    jungle_berry: ['#b03a8a', '#5a8a2a'], frostberry: ['#5a8ae0', '#3a6a5a'], cocoa: ['#a0602a', '#5a3a1a'], amber: ['#f2a83a', '#a0601a'],
    frost_crystal: ['#bfe8ff', '#5a9ad0'], ice: ['#e4f4ff', '#9ac4e0'], ice_core: ['#8ae8f0', '#3a9aa8'], meteor_glass: ['#8a5ac0', '#4a2a6a'],
    salt: ['#f8f8f0', '#c0c0b0'], spring_salt: ['#f0f8f8', '#a8c8c8'],
    // IF1 food glints
    fish: ['#8ac8f0', '#3a6a9a'], flower: ['#f2a0c8', '#5a9a3a'], hay: ['#e8d070', '#a08a3a'], nectar: ['#ffd84a', '#c08a1a'], bug: ['#6a8a3a', '#3a3a2a'],
    sea_melon: ['#7ad07a', '#2f7a4a'], greenhouse_potato: ['#c8a070', '#7a5a3a'], golden_apple: ['#ffd23a', '#a07a1a'] };
  const NODE_SHAPE = { wood: 'log', driftwood: 'log', amber: 'gem', frost_crystal: 'gem', ice: 'gem', ice_core: 'gem', meteor_glass: 'gem', salt: 'gem', spring_salt: 'gem',
    apple: 'berry', jungle_berry: 'berry', frostberry: 'berry', cocoa: 'berry', fiber: 'tuft', clover: 'tuft', kelp: 'tuft', vine_rope: 'tuft',
    fish: 'gem', flower: 'berry', hay: 'tuft', nectar: 'gem', sea_melon: 'berry', golden_apple: 'berry' };
  const nodeLabel = {}; // IF1: a labelled glint's name tag, baked once per label
  const nodeArt = {};
  function bakeNode(kind) {
    if (nodeArt[kind]) return nodeArt[kind];
    const s = Math.round(26 * DPR), cv = mk(s, s), c = cv.getContext('2d'), col = NODE_COL[kind] || ['#d8c89a', '#8a7a5a'], sh = NODE_SHAPE[kind] || 'rock';
    c.scale(DPR * 1.3, DPR * 1.3); // drawn on a 20 px grid, shown at 26 px
    c.fillStyle = 'rgba(255,244,168,0.22)'; c.beginPath(); c.ellipse(10, 16, 9.5, 3.5, 0, 0, Math.PI * 2); c.fill(); // a soft pickup halo
    c.fillStyle = 'rgba(0,0,0,0.3)'; c.beginPath(); c.ellipse(10, 17, 7, 2, 0, 0, Math.PI * 2); c.fill();
    c.fillStyle = col[1];
    if (sh === 'log') { c.fillRect(3, 10, 14, 6); c.fillStyle = col[0]; c.fillRect(3, 9, 14, 4); c.fillStyle = '#e8c890'; c.fillRect(15, 10, 3, 5); }
    else if (sh === 'gem') { c.beginPath(); c.moveTo(10, 2); c.lineTo(15, 10); c.lineTo(10, 17); c.lineTo(5, 10); c.closePath(); c.fill(); c.fillStyle = col[0]; c.beginPath(); c.moveTo(10, 3); c.lineTo(14, 10); c.lineTo(10, 10); c.closePath(); c.fill(); }
    else if (sh === 'berry') { c.fillRect(9, 5, 2, 5); c.fillStyle = col[0]; [[7, 12], [13, 12], [10, 8.5]].forEach((p) => { c.beginPath(); c.arc(p[0], p[1], 3.5, 0, Math.PI * 2); c.fill(); }); c.fillStyle = '#fff'; c.fillRect(6, 10, 1, 1); }
    else if (sh === 'tuft') { [[5, 16, 7], [9, 16, 4], [13, 16, 8]].forEach((p) => { c.fillStyle = col[1]; c.fillRect(p[0], p[2], 3, p[1] - p[2]); c.fillStyle = col[0]; c.fillRect(p[0], p[2], 3, 3); }); }
    else { c.beginPath(); c.ellipse(10, 13, 7, 4.5, 0, 0, Math.PI * 2); c.fill(); c.fillStyle = col[0]; c.beginPath(); c.ellipse(9, 12, 5, 3, 0, 0, Math.PI * 2); c.fill(); }
    nodeArt[kind] = cv;
    return cv;
  }
  function drawNodes() {
    if (!nodes.length) return;
    const c0 = Math.floor(camX / CPX), c1 = Math.floor((camX + VW) / CPX), r0 = Math.floor(camY / CPX), r1 = Math.floor((camY + VH) / CPX), now = clock.now();
    const tw = STILL ? 0 : Math.sin(simT * 3) * 1.5;
    for (let cy = r0; cy <= r1; cy++) for (let cx = c0; cx <= c1; cx++) {
      const l = nodeChunks.get(cy * 4096 + cx);
      if (!l) continue;
      for (let i = 0; i < l.length; i++) {
        const n = l[i];
        if (n.until > now) continue;
        const sx = n.x * TILE - camX, sy = n.y * TILE - camY;
        g.drawImage(bakeNode(n.kind), sx + 3, sy + 3, 26, 26);
        if (sparkLeft > 0) { sparkLeft--; g.fillStyle = '#fff4a8'; g.fillRect(sx + 24, sy + 3 - tw, 3, 3); } // a small glint (PI2: capped per frame on the low tier)
        if (n.sparkle && sparkLeft > 0) { sparkLeft--; g.fillStyle = '#fff4a8'; g.fillRect(sx + 4, sy + 6 + tw, 3, 3); g.fillRect(sx + 14, sy - 2 - tw, 3, 3); }
        if (n.label) { const lb = nodeLabel[n.label] || (nodeLabel[n.label] = bakeLabel(n.label)); g.drawImage(lb.cv, sx + TILE / 2 - lb.w / 2, sy + TILE + 2, lb.w, lb.h); }
      }
    }
  }
  // crafting (MMIsleCraft): never RNG, never currency; crafted travel items open an island in `unlock`
  const UNLOCK_BY_ITEM = { raft: 'reef', rocket_core: 'mars' };
  const ITEM_FOR_ISLE = { reef: 'raft', mars: 'rocket_core' };
  const OPEN_ISLES = ['home', 'jungle', 'ice']; // open by default (NEXT-SLICES-2 X4); reef needs a raft, mars a rocket core
  // an island is open by default, through `unlock`, or because you have already been there (nobody loses a trip they had)
  const isleOpen = (id) => OPEN_ISLES.indexOf(id) >= 0 || ISL.isUnlocked(save, id) || (Array.isArray(save.visited) && save.visited.indexOf(id) >= 0);
  let craftDirty = false;
  // AW2: b34b crafting icons by recipe id (MMIsleArt.iconUrl), each loaded once; until one loads (and always with ?art=0) the text label shows
  const craftIcon = {};
  const RECIPE_IDS = CRAFT ? (CRAFT.ALL_IDS || CRAFT.IDS) : [];
  const outOf = (id) => (CRAFT && CRAFT.outputOf ? CRAFT.outputOf(id) || id : id);
  // icons are by output item (an alternative recipe shows its item's icon); each item is requested once
  if (ART && CRAFT && window.MMIsleArt && window.MMIsleArt.iconUrl) RECIPE_IDS.map(outOf).filter((id, i, a) => a.indexOf(id) === i).forEach((id) => {
    const u = window.MMIsleArt.iconUrl(id);
    if (!u) return;
    const im = new Image();
    im.onload = () => { if (!(im.naturalWidth > 0)) return; craftIcon[id] = im.src; if (panelKind === 'craft') craftDirty = true; };
    im.src = u;
  });
  function doCraft(id) {
    if (!CRAFT) return { ok: false, why: 'off' };
    const c = CRAFT.canCraft(save.inv, id);
    if (!c.ok) {
      if (c.reason === 'full') toast('Your pack is full. Nothing was used.');
      else if (c.missing && c.missing.length) toast('Still need ' + c.missing.map((m) => HS.resName(m.id) + ' ' + m.have + '/' + m.need).join(', ') + '.');
      return { ok: false, why: c.reason || 'missing', missing: c.missing };
    }
    const next = CRAFT.craft(save.inv, id), copy = {};
    Object.keys(next).forEach((k) => { copy[k] = next[k]; });
    save.inv = copy;
    let opened = '';
    // XW1: an alternative recipe (rocket_core_drift, o2_tank_kelp) makes the same item, so the unlock is keyed by the output item
    const outItem = CRAFT.outputOf ? CRAFT.outputOf(id) : id;
    const isle = has(UNLOCK_BY_ITEM, outItem) ? UNLOCK_BY_ITEM[outItem] : '';
    if (isle) { if (!Array.isArray(save.unlock)) save.unlock = ['jungle']; if (save.unlock.indexOf(isle) < 0) { save.unlock.push(isle); opened = isle; } }
    const placed = TROPHY_IDS.indexOf(outItem) >= 0 && ISL.setTrophy(save, outItem, 1); // XB: a crafted trophy stands on the home pedestal
    dirty = true; persist();
    toast('Crafted ' + itemName(outItem).toLowerCase() + '.' + (opened ? ' ' + isleName(opened) + ' is on the sea chart now.' : '') + (placed ? ' It stands on the trophy pedestal at home.' : ''));
    logEvent('craft');
    if (panelKind === 'craft') renderCraft(id);
    return { ok: true, id: id, item: outItem, unlocked: opened, have: invCount(outItem), trophy: placed };
  }
  // ---------- X5: environment meters (MMIsleEnv, behind its flags; ?env=0 turns them all off) ----------
  const ENV_ON = !!ENV && (ENVR.warmth || ENVR.oxygen || ENVR.gravity);
  const GRAV = ENV && ENVR.gravity ? ENV.gravity(PACK_ID) : { move: 1, dash: 1 };
  // shelter tiles, baked once: on the tundra hot springs, campfires and the camp at the landing; on mars the domes (habitat floor,
  // landing pad), oxygen plants and the landing. The dock counts on both (the boat is warm and has air).
  const SHELTER = (ENVR.warmth || ENVR.oxygen) ? new Uint8Array(W * H) : null;
  if (SHELTER) {
    const mark = (x, y, r) => { for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) { const tx = x + dx, ty = y + dy; if (tx >= 0 && ty >= 0 && tx < W && ty < H && dx * dx + dy * dy <= r * r) SHELTER[ty * W + tx] = 1; } };
    const tileSet = ENVR.warmth ? { hot_spring: 2 } : { habitat_floor: 0, landing_pad: 0 };
    const propSet = ENVR.warmth ? { campfire: 3, hot_spring_steam: 2 } : { oxygen_plant: 1 };
    for (let i = 0; i < W * H; i++) { const n = NAMES[world.terrain[i]]; if (has(tileSet, n)) mark(i % W, Math.floor(i / W), tileSet[n]); }
    world.props.forEach((p) => { if (has(propSet, p.kind)) mark(p.x, p.y, propSet[p.kind]); });
    mark(world.spawnPoint.x, world.spawnPoint.y, 3);
    if (world.dock) mark(world.dock.x, world.dock.y, 2);
  }
  // IF1 rest spots, baked once on every island: the shelter tiles above, any dock, campfires, hot springs, domes / landing pads, and the
  // homestead on Hearth Isle (everything near the spawn point). MMIsleRest heals to full there; elsewhere it regens slowly out of danger.
  const RESTT = new Uint8Array(W * H);
  {
    const mark = (x, y, r) => { for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) { const tx = x + dx, ty = y + dy; if (inWorld(tx, ty) && dx * dx + dy * dy <= r * r) RESTT[ty * W + tx] = 1; } };
    if (SHELTER) for (let i = 0; i < W * H; i++) if (SHELTER[i]) RESTT[i] = 1;
    for (let i = 0; i < W * H; i++) { const n = NAMES[world.terrain[i]]; if (n === 'hot_spring' || n === 'habitat_floor' || n === 'landing_pad') mark(i % W, Math.floor(i / W), n === 'hot_spring' ? 2 : 0); }
    world.props.forEach((p) => { if (p.kind === 'campfire') mark(p.x, p.y, 3); else if (p.kind === 'hot_spring_steam') mark(p.x, p.y, 2); });
    if (world.dock) mark(world.dock.x, world.dock.y, 2);
    if (HOME) mark(world.spawnPoint.x, world.spawnPoint.y, 10);
  }
  // a few points of the air shelters (domes, landing pads, oxygen plants, the dock) for the "nearest dome" hint arrow (sampled once)
  const SHELTER_PTS = [];
  if (SHELTER && ENVR.oxygen) for (let y = 0; y < H; y += 3) for (let x = 0; x < W; x += 3) if (SHELTER[y * W + x] && SHELTER_PTS.length < 600) SHELTER_PTS.push({ x: x, y: y });
  let restS = REST ? REST.init() : null, restAcc = 0, restMode = '';
  function heroResting() { const tx = tileOf(hero.x), ty = tileOf(hero.y); return inWorld(tx, ty) && RESTT[ty * W + tx] === 1; }
  function restStep(dt) {
    if (!REST || god) return;
    const tx = tileOf(hero.x), ty = tileOf(hero.y), R6 = REST.K.HOSTILE_TILES * TILE;
    let near = false;
    for (let i = 0; i < creatures.length && !near; i++) { const c = creatures[i]; if ((c.hostile || c.ph === 'wind' || c.ph === 'strike') && Math.hypot(c.x - hero.x, c.y - hero.y) < R6) near = true; }
    const r = REST.step(restS, { dt: dt, hp: hero.hp, maxHp: hero.maxHp, hurtAgo: simT - lastHurtT, hostileNear: near, inShelter: inWorld(tx, ty) && RESTT[ty * W + tx] === 1,
      atHome: false, atDock: nearDock(), envEmpty: !!(ENVR.oxygen && envS.emptyO), bossEngaged: !!(bz.engaged && bossAlive()) || bz.tele.length > 0 || bz.live.length > 0, dead: hero.dead });
    restS = r.state; restMode = r.mode;
    if (r.heal > 0) { hero.hp = Math.min(hero.maxHp, hero.hp + r.heal); dirty = true; }
    if (r.toast) { toast(r.toast); logEvent('rest'); }
  }
  const envS = { warmT: 0, o2T: 0, o2Hurt: 0, acc: 0, warm: null, o2: null, warnW: false, warnO: false, emptyW: false, emptyO: false, move: GRAV.move, lost: 0 };
  const sheltered = () => !!SHELTER && SHELTER[tileOf(hero.y) * W + tileOf(hero.x)] === 1;
  function envStep(dt) {
    envS.acc += dt;
    if (envS.acc < 0.1) return; // 10 Hz is plenty for a calm meter
    const d = envS.acc;
    envS.acc = 0;
    if (hero.dead) return;
    const sh = sheltered();
    let slow = 1;
    if (ENVR.warmth) {
      const cloak = invCount('warm_cloak') > 0;
      const m0 = ENV.warmth(envS.warmT, sh, cloak);
      if (!(abilWarm && m0.rate > 0)) envS.warmT = ENV.advance(envS.warmT, m0.rate, d, m0.max); // XW1 warm aura: no drain while it lasts
      const m = ENV.warmth(envS.warmT, sh, cloak);
      envS.warm = m;
      if (m.warn && !envS.warnW && !sh) toast('Getting cold. Warm up by a hot spring or a campfire.');
      if (m.empty && !envS.emptyW) toast('Too cold: you walk slower until you warm up. The cold never hurts you.');
      envS.warnW = m.warn; envS.emptyW = m.empty; slow = m.slow;
    }
    if (ENVR.oxygen) {
      const tank = invCount('o2_tank') > 0;
      const m0 = ENV.oxygen(envS.o2T, sh, tank);
      envS.o2T = ENV.advance(envS.o2T, m0.rate, d, m0.max);
      const m = ENV.oxygen(envS.o2T, sh, tank);
      envS.o2 = m;
      // TD1: the page warns AIR_WARN s before empty (earlier than the module's 10 s), and the arrow points home while it is low
      const low = m.warn || (!m.empty && m.left <= AIR_WARN);
      if (low && !envS.warnO) toast('Air is running low (' + Math.ceil(m.left) + ' s left). Follow the arrow to a dome or the landing pad.');
      if (m.empty && !envS.emptyO) toast('Out of air: 1 HP every 3 s until you reach a dome. It never takes your last HP.');
      envS.warnO = low; envS.emptyO = m.empty;
      if (m.hurt > envS.o2Hurt && !god) { const before = hero.hp; hero.hp = Math.max(Math.min(1, hero.hp), hero.hp - (m.hurt - envS.o2Hurt)); envS.lost += before - hero.hp; }
      envS.o2Hurt = m.hurt;
    }
    envS.move = GRAV.move * slow;
  }
  const envEls = { box: $('hud-env'), warm: $('env-warm'), o2: $('env-o2') };
  const envLast = { warm: null, o2: null };
  function envMeter(k, m, text, warn) {
    const el = envEls[k], v = m ? text + (m.empty ? '!' : '') + (warn ? '~' : '') : '';
    if (envLast[k] === v) return;
    envLast[k] = v;
    el.hidden = !m;
    if (!m) return;
    el.querySelector('.val').textContent = text;
    el.classList.toggle('warn', !!warn);
    el.classList.toggle('empty', m.empty);
  }
  function envHud() {
    if (!ENV_ON) return;
    const w = ENVR.warmth ? envS.warm || ENV.warmth(envS.warmT, false, false) : null;
    const o = ENVR.oxygen ? envS.o2 || ENV.oxygen(envS.o2T, false, false) : null;
    if (envEls.box.hidden === !!(w || o)) envEls.box.hidden = !(w || o);
    envMeter('warm', w, w ? (w.empty ? 'cold (slow)' : w.pct + '%') : '', !!w && w.warn);
    envMeter('o2', o, o ? (o.empty ? 'empty' : Math.ceil(o.left) + ' s') : '', !!o && (o.warn || (!o.empty && o.left <= AIR_WARN)));
  }
  // ---------- TD1 (NEXT-SLICES-4): tundra + mars depth ----------
  // Aurora night (tundra): a page clock (seconds on the island, never the real time of day) passes dusk at DUSK s of every DAY_LEN s
  // cycle; ?aurora=1 forces the night, ?aurora=0 keeps it day. At night a calm aurora band (one cached canvas, a slow drift; static with
  // reduced motion) shows over a soft night tint, aurora crystals glint, and the aurora frostfox can come out. Purely cosmetic otherwise.
  const DAY_LEN = 300, DUSK = 150, AIR_WARN = 20, SOAK_SEC = 2, LAUNCH_SEC = 2.5;
  const AUR_ON = PACK_ID === 'tundra' && Q.get('aurora') !== '0', AUR_FORCE = AUR_ON && Q.get('aurora') === '1';
  function tdNight() { return AUR_ON && (AUR_FORCE || simT % DAY_LEN >= DUSK); }
  const nightK = () => (!tdNight() ? 0 : AUR_FORCE ? 1 : clamp((simT % DAY_LEN - DUSK) / 8, 0, 1));
  let auroraCv = null, auroraDrawn = 0;
  function auroraBand() { // baked once: three soft ribbons (green, teal, violet) on a 256 px tileable strip
    if (auroraCv) return auroraCv;
    const w = 256, h = 72, cv = mk(w, h), c = cv.getContext('2d');
    const rib = [['#7fffd4', 0.35, 26, 10, 1], ['#5ad8ff', 0.28, 38, 8, 2], ['#c8a0ff', 0.22, 18, 6, 3]];
    rib.forEach((r) => {
      for (let x = 0; x < w; x += 2) {
        const y = r[2] + Math.sin((x / w) * Math.PI * 2 * r[4]) * r[3], hh = 10 + Math.sin((x / w) * Math.PI * 2 * (r[4] + 1)) * 4;
        c.fillStyle = r[0]; c.globalAlpha = r[1]; c.fillRect(x, y, 2, hh);
        c.globalAlpha = r[1] * 0.5; c.fillRect(x, y + hh, 2, hh * 1.6);
      }
    });
    auroraCv = cv;
    return cv;
  }
  // Hot spring soak (tundra): SOAK_SEC s standing in a hot_spring gives "Warm and rested": full warmth and full HP (the IF1 rest; never in a
  // boss fight). Spring salt still gathers there. Once per soak: step out and back in for another.
  const HOT_T = O.TERRAIN_ALL.hot_spring;
  const soak = { t: 0, done: false, n: 0 };
  function soakStep(dt) {
    const on = PACK_ID === 'tundra' && HOT_T !== undefined && !hero.dead && O.tileAt(world, tileOf(hero.x), tileOf(hero.y)) === HOT_T;
    if (!on) { soak.t = 0; soak.done = false; return; }
    soak.t += dt;
    if (soak.done || soak.t < SOAK_SEC) return;
    soak.done = true; soak.n++;
    envS.warmT = 0;
    if (ENV && ENVR.warmth) { envS.warm = ENV.warmth(0, true, invCount('warm_cloak') > 0); envS.warnW = false; envS.emptyW = false; }
    if (!(bz.engaged && bossAlive())) hero.hp = hero.maxHp;
    dirty = true;
    toast('Warm and rested. The hot spring soaks the cold away.');
    logEvent('soak'); reward(true);
  }
  function iceStep(dt) {
    if (!THIN_ICE) return;
    const tx = tileOf(hero.x), ty = tileOf(hero.y), k = ty * W + tx;
    if (hero.dead || O.tileAt(world, tx, ty) !== ICE_THIN_T || crackedAt(tx, ty)) { ice.tile = -1; ice.t = 0; return; }
    // only standing still and idle on one tile cracks it: walking across (even slowly), shooting, or feeding a creature never does
    const busy = heroMoving || hero.shotT > 0 || (TAME && !!feedTarget());
    if (k !== ice.tile || busy) { ice.tile = k; ice.t = 0; }
    if (busy) return;
    const was = ice.t;
    ice.t += dt;
    if (was < ICE_WARN && ice.t >= ICE_WARN) { ice.warnN++; logEvent('ice_warn'); if (!ice.told) toast('The thin ice creaks. Step off, or it cracks into slush (it only slows you).'); }
    if (ice.t < ICE_CRACK) return;
    let slot = 0; // a free slot, else the one that thaws first
    for (let i = 0; i < CRACK_MAX; i++) { if (ice.idx[i] < 0) { slot = i; break; } if (ice.until[i] < ice.until[slot]) slot = i; }
    if (ice.idx[slot] < 0) ice.n++;
    ice.idx[slot] = k; ice.until[slot] = simT + ICE_SLUSH; ice.made++;
    ice.tile = -1; ice.t = 0;
    logEvent('ice_crack');
    if (!ice.told) { ice.told = true; toast('The ice cracked into slush: slower for a little while, never dangerous.'); }
  }
  function iceThaw() { // 5 Hz: slush turns back into thin ice after ICE_SLUSH s
    if (!ice.n) return;
    for (let i = 0; i < CRACK_MAX; i++) if (ice.idx[i] >= 0 && ice.until[i] <= simT) { ice.idx[i] = -1; ice.n--; }
  }
  // Once-a-day glints (save.glint, isles only): aurora crystals (the aurora_crystal tiles and crystal_blue props) glint at night on the
  // tundra and give an aurora shard; on mars the rover / probe wrecks give a chrome flake (salvage). Picked within GLINT_R of the glint.
  const GLINT_R = 1.6 * TILE;
  const GLINTS = [];
  (function findGlints() {
    if (PACK_ID === 'tundra') {
      const ac = O.TERRAIN_ALL.aurora_crystal;
      for (let i = 0; i < W * H && GLINTS.length < 8; i++) if (world.terrain[i] === ac) GLINTS.push({ x: i % W, y: Math.floor(i / W), item: 'aurora_shard', night: true });
      world.props.forEach((p) => { if (p.kind === 'crystal_blue' && GLINTS.length < 16) GLINTS.push({ x: p.x, y: p.y, item: 'aurora_shard', night: true }); });
    } else if (PACK_ID === 'mars') {
      world.props.forEach((p) => { if ((p.kind === 'rover_wreck' || p.kind === 'probe_lander') && GLINTS.length < 16) GLINTS.push({ x: p.x, y: p.y, item: 'chrome_flake', night: false }); });
    }
    GLINTS.forEach((q, i) => { q.i = i; });
  }());
  if (GLINTS.length && (!save.glint || save.glint.day !== DAY)) save.glint = { day: DAY, n: {} };
  const glintTaken = (q) => !!save.glint && Array.isArray(save.glint.n[ISLE]) && save.glint.n[ISLE].indexOf(q.i) >= 0;
  const glintLive = (q) => !glintTaken(q) && (!q.night || tdNight());
  function glintCheck() {
    if (!GLINTS.length || hero.dead) return;
    for (let i = 0; i < GLINTS.length; i++) {
      const q = GLINTS[i];
      if (!glintLive(q) || Math.hypot((q.x + 0.5) * TILE - hero.x, (q.y + 0.5) * TILE - hero.y) > GLINT_R) continue;
      const got = invAdd(q.item, 1);
      if (!got) { toast('Your pack has no room for a ' + HS.resName(q.item) + '.'); continue; }
      if (!Array.isArray(save.glint.n[ISLE])) save.glint.n[ISLE] = [];
      save.glint.n[ISLE].push(q.i); dirty = true;
      toast('+1 ' + HS.resName(q.item) + ' (' + invCount(q.item) + ' in your pack). ' + (q.night ? 'Each aurora crystal gives one shard a day, at night.' : 'Each wreck has a little chrome to salvage once a day.'));
      logEvent('glint'); reward();
    }
  }
  // the air arrow (mars): while the air is low and you are outside, it points to the nearest dome / landing pad (aimed at 5 Hz, drawn
  // every frame from two numbers)
  const airArrow = { on: false, ang: 0, tiles: 0 };
  function airAim() {
    airArrow.on = false;
    if (!ENVR.oxygen || !envS.o2 || !(envS.warnO || envS.emptyO) || hero.dead || sheltered() || !SHELTER_PTS.length) return;
    const tx = hero.x / TILE, ty = hero.y / TILE;
    let b = null, bd = Infinity;
    for (let i = 0; i < SHELTER_PTS.length; i++) { const p = SHELTER_PTS[i], d = (p.x - tx) * (p.x - tx) + (p.y - ty) * (p.y - ty); if (d < bd) { bd = d; b = p; } }
    airArrow.on = true; airArrow.ang = Math.atan2(b.y - ty, b.x - tx); airArrow.tiles = Math.round(Math.sqrt(bd));
  }
  let tdAcc = 0;
  function tdStep(dt) {
    iceStep(dt);
    soakStep(dt);
    tdAcc += dt;
    if (tdAcc < 0.2) return;
    tdAcc = 0;
    iceThaw(); glintCheck(); airAim();
  }
  // ground layer: the crack telegraph, the slush patches, the glints (only what is on screen; constant colours, no allocation)
  const SLUSH_COL = PAL.slush ? PAL.slush[0] : '#a4b4c4';
  function crackLines(sx, sy, k) { // a star of cracks from the tile centre, k = 0..1 of its full length
    const cx = sx + TILE / 2, cy = sy + TILE / 2, r = 4 + 18 * k; // reaches past the tile edge so it shows around the hero's feet
    g.beginPath();
    g.moveTo(cx, cy); g.lineTo(cx - r, cy - r * 0.5); g.moveTo(cx, cy); g.lineTo(cx + r, cy - r * 0.3);
    g.moveTo(cx, cy); g.lineTo(cx + r * 0.3, cy + r); g.moveTo(cx, cy); g.lineTo(cx - r * 0.6, cy + r * 0.7);
    g.stroke();
  }
  let crackDrawn = 0;
  function drawTdGround() {
    if (THIN_ICE) {
      if (ice.n) {
        g.strokeStyle = '#4a6a8a'; g.lineWidth = 1.5;
        for (let i = 0; i < CRACK_MAX; i++) {
          if (ice.idx[i] < 0) continue;
          const tx = ice.idx[i] % W, ty = (ice.idx[i] - tx) / W, sx = tx * TILE - camX, sy = ty * TILE - camY;
          if (sx < -TILE || sy < -TILE || sx > VW || sy > VH) continue;
          g.fillStyle = SLUSH_COL; g.globalAlpha = 0.85; g.fillRect(sx, sy, TILE, TILE); g.globalAlpha = 1;
          crackLines(sx, sy, 1);
        }
      }
      if (ice.tile >= 0 && ice.t >= ICE_WARN) { // the telegraph: cracks spreading over the tile (a static full overlay with reduced motion)
        const tx = ice.tile % W, ty = (ice.tile - tx) / W, sx = tx * TILE - camX, sy = ty * TILE - camY;
        const k = REDUCED ? 1 : clamp((ice.t - ICE_WARN) / (ICE_CRACK - ICE_WARN), 0.15, 1);
        g.globalAlpha = 0.9; g.strokeStyle = '#ffffff'; g.lineWidth = 2; crackLines(sx, sy, k);
        g.strokeStyle = '#2a4a6a'; g.lineWidth = 1; crackLines(sx, sy, k); g.globalAlpha = 1;
        g.strokeStyle = '#ffffff'; g.lineWidth = 2; g.globalAlpha = REDUCED ? 1 : 0.6 + 0.4 * Math.sin(simT * 14); g.strokeRect(sx + 1, sy + 1, TILE - 2, TILE - 2); g.globalAlpha = 1;
        crackDrawn++;
      }
    }
    if (GLINTS.length) {
      const tw = STILL ? 0 : Math.sin(simT * 4);
      for (let i = 0; i < GLINTS.length; i++) {
        const q = GLINTS[i];
        if (!glintLive(q)) continue;
        const sx = q.x * TILE - camX + TILE / 2, sy = q.y * TILE - camY + TILE / 2;
        if (sx < -TILE || sy < -TILE || sx > VW + TILE || sy > VH + TILE) continue;
        g.fillStyle = q.night ? '#c8fff0' : '#f4f8ff';
        if (sparkLeft > 0) { sparkLeft--; g.fillRect(sx - 1, sy - 9 - tw * 2, 3, 3); g.fillRect(sx + 7, sy - 3 + tw, 2, 2); g.fillRect(sx - 8, sy + 1 - tw, 2, 2); }
        g.fillStyle = q.night ? '#7fffd4' : '#b8c8d8'; g.fillRect(sx - 4, sy - 5, 9, 1); g.fillRect(sx, sy - 9, 1, 9);
      }
    }
  }
  // sky layer (screen space, over the world, under the DOM HUD): the night tint + the aurora band; the air arrow; the soak steam
  function drawTdSky(hx, hy) {
    const nk = nightK();
    if (nk > 0) {
      g.globalAlpha = 0.3 * nk; g.fillStyle = '#0a1030'; g.fillRect(0, 0, VW, VH);
      const band = auroraBand(), bw = band.width, bh = band.height * (VW > 700 ? 1.4 : 1), off = STILL ? 0 : (simT * 6) % bw;
      g.globalAlpha = 0.9 * nk;
      for (let x = -off; x < VW; x += bw) g.drawImage(band, Math.round(x), 0, bw, bh);
      g.globalAlpha = 1;
      auroraDrawn++;
    }
    if (airArrow.on && !hero.dead) {
      const r = 40, ca = Math.cos(airArrow.ang), sa = Math.sin(airArrow.ang), ax = hx + ca * r, ay = hy - 12 + sa * r;
      g.fillStyle = envS.emptyO ? '#f0b0a0' : '#f2d06b'; g.strokeStyle = '#1a1a1a'; g.lineWidth = 2;
      g.beginPath(); g.moveTo(ax + ca * 14, ay + sa * 14); g.lineTo(ax - ca * 8 - sa * 10, ay - sa * 8 + ca * 10); g.lineTo(ax - ca * 3, ay - sa * 3); g.lineTo(ax - ca * 8 + sa * 10, ay - sa * 8 - ca * 10); g.closePath();
      g.stroke(); g.fill();
    }
    if (soak.t > 0 && !hero.dead) { // steam puffs while soaking (still with reduced motion)
      const k = STILL ? 0.3 : (simT * 1.5) % 1;
      g.fillStyle = '#f4ffff'; g.strokeStyle = '#7fc4c4'; g.lineWidth = 1; g.globalAlpha = 0.9 - 0.45 * k;
      g.beginPath(); g.arc(hx - 9, hy - 30 - k * 14, 4 + k * 3, 0, Math.PI * 2); g.fill(); g.stroke();
      g.beginPath(); g.arc(hx + 10, hy - 24 - k * 12, 3 + k * 3, 0, Math.PI * 2); g.fill(); g.stroke();
      g.beginPath(); g.arc(hx + 2, hy - 40 - k * 10, 3 + k * 2, 0, Math.PI * 2); g.fill(); g.stroke();
      g.globalAlpha = 1;
    }
  }
  // Rocket launch (sailing to mars): a 2.5 s code-art lift-off, then the mars landing pad. A tap, a key or reduced motion skips it; the
  // rocket core is never used up (it stays in the pack and mars stays open). ?launch=0 skips the scene too.
  const launch = { on: false, t: 0, url: '', n: 0, skipped: 0 };
  const STARS = [];
  { const r = RNG.create('isles|stars'); for (let i = 0; i < 28; i++) STARS.push([r.next(), r.next() * 0.7, r.next() < 0.3 ? 2 : 1]); }
  function launchGo(skip) {
    if (!launch.on) return false;
    launch.on = false; if (skip) launch.skipped++;
    location.href = launch.url;
    return true;
  }
  function drawLaunch() {
    const t = launch.t, p = clamp((t - 0.6) / (LAUNCH_SEC - 0.6), 0, 1), ease = p * p;
    g.globalAlpha = 0.6 + 0.3 * p; g.fillStyle = '#080a1c'; g.fillRect(0, 0, VW, VH); g.globalAlpha = 1;
    g.fillStyle = '#f4f8ff';
    for (let i = 0; i < STARS.length; i++) g.fillRect(Math.round(STARS[i][0] * VW), Math.round(STARS[i][1] * VH), STARS[i][2], STARS[i][2]);
    const cx = Math.round(VW / 2), pad = Math.round(VH * 0.78);
    g.fillStyle = '#8a8e92'; g.fillRect(cx - 46, pad, 92, 10); g.fillStyle = '#c8ccd0'; g.fillRect(cx - 40, pad - 4, 80, 5);
    g.fillStyle = '#5a5e62'; g.fillRect(cx - 34, pad - 70, 6, 70);
    const shake = t < 0.6 && !REDUCED ? Math.round(Math.sin(t * 60)) : 0, by = Math.round(pad - 6 - ease * (VH * 0.9)) + shake;
    // smoke at the pad, the flame, then the rocket (white body, red nose and fins, a blue window)
    g.fillStyle = '#d8d8d8'; g.globalAlpha = 0.7 * (1 - p * 0.6);
    for (let i = -2; i <= 2; i++) { g.beginPath(); g.arc(cx + i * 16, pad - 2, 9 + t * 6 + Math.abs(i) * 2, 0, Math.PI * 2); g.fill(); }
    g.globalAlpha = 1;
    const fl = 12 + ((t * 40) % 3) * 3 + p * 18;
    g.fillStyle = '#ff8a2a'; g.beginPath(); g.moveTo(cx - 8, by); g.lineTo(cx + 8, by); g.lineTo(cx, by + fl + 8); g.closePath(); g.fill();
    g.fillStyle = '#ffe07a'; g.beginPath(); g.moveTo(cx - 4, by); g.lineTo(cx + 4, by); g.lineTo(cx, by + fl * 0.6); g.closePath(); g.fill();
    g.fillStyle = '#c8402a'; g.beginPath(); g.moveTo(cx - 10, by - 6); g.lineTo(cx - 18, by + 2); g.lineTo(cx - 10, by - 16); g.closePath(); g.fill();
    g.beginPath(); g.moveTo(cx + 10, by - 6); g.lineTo(cx + 18, by + 2); g.lineTo(cx + 10, by - 16); g.closePath(); g.fill();
    g.fillStyle = '#f4f4f0'; g.fillRect(cx - 10, by - 52, 20, 52);
    g.fillStyle = '#c8402a'; g.beginPath(); g.moveTo(cx - 10, by - 52); g.lineTo(cx + 10, by - 52); g.lineTo(cx, by - 70); g.closePath(); g.fill();
    g.fillStyle = '#3a7ac0'; g.fillRect(cx - 4, by - 42, 8, 8); g.fillStyle = '#9ad0ff'; g.fillRect(cx - 3, by - 41, 3, 3);
  }
  // dock + sea chart
  const DOCK_R = 2.5 * TILE;
  const nearDock = () => !!world.dock && !hero.dead && Math.hypot((world.dock.x + 0.5) * TILE - hero.x, (world.dock.y + 0.5) * TILE - hero.y) <= DOCK_R;
  const DESTS = ISL.SAVED_ISLES.filter((id) => ISL.ISLES[id] && BP.resolveId(ISL.ISLES[id].pack));
  let travelling = '';
  function travelTo(id) {
    if (DESTS.indexOf(id) < 0 || id === ISLE || travelling) return false;
    if (!isleOpen(id)) { toast(isleName(id) + ' needs a ' + itemName(ITEM_FOR_ISLE[id] || '').toLowerCase() + '. Craft it (K).'); return false; }
    const q = new URLSearchParams(location.search);
    q.set('isle', ISLE_PARAM[id] || id); q.delete('seed'); q.delete('from');
    // X7: the Home dock always lands at the dock; any other island you have a saved spot on picks up where you left it (position + fog)
    if (id !== 'home' && ISL.lastPos(save, id) && save.isles[id].seed) q.delete('at'); else q.set('at', 'dock');
    if (id === 'mars') q.set('at', 'dock'); // TD1: a rocket always lands on the mars landing pad
    travelling = id;
    if (ride) dismount();
    persist();
    logEvent('sail');
    const url = location.pathname + '?' + q.toString();
    // TD1: to mars, a short lift-off first (never with reduced motion or ?launch=0; a tap or a key skips it). Nothing is used up.
    if (id === 'mars' && !REDUCED && Q.get('launch') !== '0') {
      if (panelKind) closePanel();
      launch.on = true; launch.t = 0; launch.url = url; launch.n++;
      logEvent('launch');
      toast('Lift-off! Tap to skip.');
      return true;
    }
    toast((id === 'mars' ? 'Flying' : 'Sailing') + ' to ' + isleName(id) + '...');
    location.href = url;
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
    fresh.forEach((id) => { medalLog.push(id); logEvent('medal'); });
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
        if (sx < -3 * TILE || sy < -TILE || sx > VW + 2 * TILE || sy > VH + 2 * TILE) continue;
        const pa = homeProps ? homeProps[g0[i][2]] : null; // AW2: the pen shows the b35 stable (looked up once, no per-frame work)
        if (pa) window.MMIsleArt.drawPropArt(g, pa, g0[i][2], sx, sy, TILE);
        else g.drawImage(bakeDecor(g0[i][2]), sx, sy, TILE, TILE);
      }
      if (build) { g.strokeStyle = 'rgba(255,244,214,0.55)'; g.lineWidth = 2; g.strokeRect(homeO.x * TILE - camX, homeO.y * TILE - camY, HS.GRID_W * TILE, HS.GRID_W * TILE); }
      drawPedestal();
      for (let i = 0; i < guests.length; i++) {
        const q = guests[i], sx = q.x - camX, sy = q.y - camY + (STILL ? 0 : Math.sin(simT * 2 + q.t) * 1.5);
        if (sx < -80 || sy < -80 || sx > VW + 80 || sy > VH + 80) continue;
        const qs = STRIPS && q.sk && STRIPS.has(q.sk) ? STRIPS.get(q.sk, 'idle', MS.DOWN) : null;
        if (qs) STRIPS.draw(g, qs, MS.frameIndex('idle', simT + q.t), sx, sy, 0.6, false);
        else if (q.art) { const a = q.art, fr = a.frames.idle[CD.frameAt('idle', simT + q.t)], w = a.w / a.dpr * 0.45, h = a.h / a.dpr * 0.45; g.drawImage(fr, sx - w / 2, sy - a.ay / a.dpr * 0.45, w, h); }
        else { g.fillStyle = '#9ae07a'; g.beginPath(); g.arc(sx, sy - 6, 6, 0, Math.PI * 2); g.fill(); }
      }
      // X7: name tags under each pen, one line per guest so they never overlap (cached canvases)
      for (let i = 0; i < guests.length; i++) {
        const q = guests[i], L = q.label;
        if (!L) continue;
        const k = i % 3, sx = Math.round(q.x - (k - 1) * 10 - camX - L.w / 2), sy = Math.round(q.y - 6 + TILE * 0.6 + k * (L.h + 1) - camY);
        if (sx < -L.w || sy < -L.h || sx > VW || sy > VH) continue;
        g.drawImage(L.cv, sx, sy, L.w, L.h);
      }
    }
    drawNodes();
    const tw = STILL ? 0 : Math.sin(simT * 4) * 2;
    for (let i = 0; i < spots.length; i++) {
      const p = spots[i];
      if (HS.taken(save.gather, ISLE, p.idx)) continue;
      const sx = (p.x + 0.5) * TILE - camX, sy = (p.y + 0.5) * TILE - camY;
      if (sx < -TILE || sy < -TILE || sx > VW + TILE || sy > VH + TILE) continue;
      const amb = p.kind === 'amber' && IA && IA.propsActive() ? IA.props().amber_node : null; // b33 amber node under the amber sparkle
      if (amb) g.drawImage(amb.img, Math.round(sx - amb.ax), Math.round(sy + TILE / 2 - 2 - amb.ay), amb.w, amb.h);
      else { g.fillStyle = 'rgba(0,0,0,0.25)'; g.fillRect(sx - 7, sy + 5, 14, 3); }
      if (sparkLeft <= 0) { g.fillStyle = '#f2b84b'; g.fillRect(sx - 2, sy - 5, 5, 5); continue; } // PI2: past the low-tier spark cap, just the gold dot
      sparkLeft--;
      g.fillStyle = '#fff4a8'; g.fillRect(sx - 1, sy - 8 - tw, 3, 11); g.fillRect(sx - 6, sy - 4 - tw, 13, 3);
      g.fillStyle = '#f2b84b'; g.fillRect(sx - 2, sy - 5 - tw, 5, 5);
    }
  }
  // ---- panels: sea chart, collection log, decor bar (44 px targets, plain text) ----
  const panel = $('panel'), panelBody = $('panel-body'), panelTitle = $('panel-title');
  let panelKind = '';
  const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text !== undefined) e.textContent = text; return e; };
  let panelOpener = null, viaKeys = false; // BB: a keyboard player's focus goes back to what opened the panel, never lost on <body>
  window.addEventListener('keydown', () => { viaKeys = true; }, true); window.addEventListener('pointerdown', () => { viaKeys = false; }, true);
  function closePanel() {
    const was = !panel.hidden;
    if (was) cue('ui_close');
    panel.hidden = true; panelKind = ''; paused = false; document.body.classList.remove('panel-open');
    const back = panelOpener; panelOpener = null;
    if (was && viaKeys && back && back.focus && document.activeElement && (document.activeElement === document.body || panel.contains(document.activeElement)) && back.offsetParent !== null) { try { back.focus({ preventScroll: true }); } catch (e) { /* ignore */ } }
  }
  // 8B: the Pack (one button): a tabbed panel - Party (home dock + party), Craft, Log, Help. Other panels (sea chart, decor, trophies) stay
  // tab-less. The tab row and the party block are static DOM; only their hidden / aria-selected flags change.
  const PACK_TABS = { party: $('tab-party'), craft: $('btn-craft'), log: $('btn-log'), help: $('tab-help') };
  const packTabs = $('pack-tabs'), packParty = $('pack-party');
  function packHud(kind) {
    const inPack = Object.prototype.hasOwnProperty.call(PACK_TABS, kind);
    packTabs.hidden = !inPack;
    packParty.hidden = kind !== 'party';
    Object.keys(PACK_TABS).forEach((k) => { PACK_TABS[k].setAttribute('aria-selected', String(k === kind)); PACK_TABS[k].classList.toggle('on', k === kind); });
  }
  const HOWTO = Array.prototype.map.call(document.querySelectorAll('#howto-list li'), (li) => li.textContent);
  function openPanel(kind) {
    while (panelBody.firstChild) panelBody.removeChild(panelBody.firstChild);
    panelKind = kind;
    packHud(kind);
    if (kind === 'party') {
      panelTitle.textContent = 'Pack';
      const pl = $('party-list');
      while (pl.firstChild) pl.removeChild(pl.firstChild);
      if (!tames.roster.length) pl.appendChild(el('li', 'dim', 'No party yet. Soothe a creature, then feed it.'));
      stableRows(pl); // G-20 / G-21: every tame is a Stable row (Join party / Rest / Ride)
      panelBody.appendChild(el('p', 'dim', 'Stable ' + tames.roster.length + '. XP ' + xp + '. ' + (HOME ? 'You are home.' : 'Home dock takes you home.')));
    } else if (kind === 'help') {
      panelTitle.textContent = 'Help';
      const ol = el('ol', 'howto-list'); ol.id = 'help-list';
      HOWTO.forEach((t) => ol.appendChild(el('li', '', t)));
      panelBody.appendChild(ol);
      panelBody.appendChild(el('p', 'dim', $('help').textContent));
      if (window.MMSettings) { const sb = el('button', 'dest', 'Settings: text, sound, controls'); sb.type = 'button'; sb.id = 'help-settings'; sb.addEventListener('click', () => openSettings()); panelBody.appendChild(sb); } // BB
    } else if (kind === 'sail') {
      panelTitle.textContent = 'Sea chart';
      panelBody.appendChild(el('p', 'calm', 'The boat is ready whenever you are. Where to?'));
      DESTS.filter((id) => id !== ISLE).forEach((id) => {
        const open = isleOpen(id), need = ITEM_FOR_ISLE[id];
        const b = el('button', open ? 'dest' : 'dest locked', open ? (id === 'home' ? 'Home dock: ' : 'Sail to ') + isleName(id) : isleName(id) + ': needs a ' + itemName(need).toLowerCase());
        b.type = 'button'; b.dataset.isle = id;
        if (!open) { b.disabled = true; b.setAttribute('aria-disabled', 'true'); b.dataset.need = need || ''; }
        b.addEventListener('click', () => travelTo(id));
        if (open) { panelBody.appendChild(b); return; }
        // NAV slice D: a locked row is not a dead end - "Craft it" opens the craft panel at that recipe
        const row = el('div', 'dest-row'); row.dataset.isle = id;
        row.appendChild(b);
        const c = el('button', 'craft-it', 'Craft it'); c.type = 'button'; c.dataset.need = need || ''; c.dataset.isle = id;
        c.setAttribute('aria-label', 'Craft a ' + itemName(need).toLowerCase() + ' for ' + isleName(id));
        c.dataset.recipe = craftItTarget(need);
        c.addEventListener('click', () => openCraftFor(craftItTarget(need)));
        row.appendChild(c);
        panelBody.appendChild(row);
        // X7: the unlock cost in plain words, with what you have of each input
        const rc = CRAFT && need ? CRAFT.get(craftItTarget(need)) || CRAFT.get(need) : null;
        if (rc) {
          const cost = el('p', 'dest-cost', 'Unlock cost: 1 ' + itemName(need).toLowerCase() + ' = ' + Object.keys(rc.in).map((k) => HS.resName(k) + ' ' + invCount(k) + '/' + rc.in[k]).join(', '));
          cost.dataset.isle = id; cost.dataset.need = need;
          b.setAttribute('aria-label', isleName(id) + ' is locked. ' + cost.textContent);
          panelBody.appendChild(cost);
          // IF1: where the short inputs grow (the raft's vine rope: the jungle ferns by the dock)
          const ws = POUCH ? Object.keys(rc.in).filter((k) => invCount(k) < rc.in[k] && POUCH.where(k)).map((k) => POUCH.where(k)) : [];
          if (ws.length) { const wp = el('p', 'dest-cost dest-where', 'Found: ' + ws.join('; ') + '.'); wp.dataset.isle = id; panelBody.appendChild(wp); }
        }
      });
    } else if (kind === 'craft') {
      panelTitle.textContent = 'Craft';
      renderCraft('');
    } else if (kind === 'decor') {
      panelTitle.textContent = 'Home decor';
      renderDecor('');
    } else if (kind === 'trophy') {
      panelTitle.textContent = 'Trophy pedestal';
      renderTrophies();
    } else {
      panelTitle.textContent = 'Island log';
      logEvent('log');
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
      if (HOME) { panelBody.appendChild(el('h3', '', 'Tame pen')); panelBody.appendChild(penList()); }
      panelBody.appendChild(el('h3', '', 'Medals ' + medals.length + ' of ' + ISL.MEDAL_IDS.length));
      const ml = el('ul', 'log-list'); ml.id = 'log-medals';
      ISL.MEDAL_IDS.forEach((id) => { const on = medals.indexOf(id) >= 0; const li = el('li', on ? 'on' : 'dim', (on ? '[x] ' : '[ ] ') + (ISL.MEDAL_NAMES[id] || id)); li.dataset.medal = id; ml.appendChild(li); });
      panelBody.appendChild(ml);
      // PI2: controls (per device, the same switch as the Realm's one-thumb mode)
      panelBody.appendChild(el('h3', '', 'Controls'));
      const ot = el('button', 'dest', 'One-thumb mode: ' + (ONE_THUMB ? 'on' : 'off')); ot.type = 'button'; ot.id = 'log-onethumb';
      ot.setAttribute('aria-pressed', String(ONE_THUMB));
      ot.addEventListener('click', () => { setOneThumb(!ONE_THUMB); ot.textContent = 'One-thumb mode: ' + (ONE_THUMB ? 'on' : 'off'); ot.setAttribute('aria-pressed', String(ONE_THUMB)); });
      panelBody.appendChild(ot);
      panelBody.appendChild(el('p', 'dim', 'Shots go to the nearest foe by themselves, and the mount ability button sits by the move stick.'));
      const fb = el('div', 'fb-host'); fb.id = 'log-feedback';
      panelBody.appendChild(fb);
      mountFeedback(fb);
    }
    if (panel.hidden) { cue('ui_open'); const a = document.activeElement; panelOpener = a && a !== document.body && !panel.contains(a) ? a : null; }
    panel.hidden = false;
    document.body.classList.add('panel-open'); // BB: the hint line hides under an open panel
    $('howto').hidden = true; // 8B: the first-visit how-to never sits under a panel
    paused = true;
    if (window.MMNav) { try { window.MMNav.close(); } catch (e) { /* ignore */ } } // never two dialogs at once
    const first = (kind === 'party' && !$('btn-home').hidden ? $('btn-home') : null) || panelBody.querySelector('button') || $('panel-close');
    try { first.focus(); } catch (e) { /* ignore */ }
  }
  $('panel-close').addEventListener('click', closePanel);
  // XW1: "Craft it" on a locked row points at a recipe a fresh save can reach (rocket_core_drift for mars, not the iron build that
  // needs mars iron); the reachability walk is pure and runs once
  const REACH = CRAFT && CRAFT.reachability && CRAFT.recipesFor ? CRAFT.reachability() : null;
  function craftItTarget(need) {
    if (!REACH || !need) return need;
    return CRAFT.recipesFor(need).find((r) => REACH.recipes[r] !== null && !/^rocket_core$/.test(r)) || need;
  }
  // open the craft panel and bring one recipe into view (the sea chart's "Craft it")
  function openCraftFor(id) {
    openPanel('craft');
    if (panelKind !== 'craft' || !id) return;
    const row = panelBody.querySelector('.recipe[data-recipe="' + String(id).replace(/[^a-z0-9_]/gi, '') + '"]');
    if (!row) return;
    row.classList.add('want');
    try { row.scrollIntoView({ block: 'nearest' }); } catch (e) { /* ignore */ }
    const b = row.querySelector('button.rc-btn');
    if (b && !b.disabled) { try { b.focus({ preventScroll: true }); } catch (e) { /* ignore */ } }
  }
  // NAV slice D: the shared feedback widget (game/shared/mm-feedback.js) mounts in the island log. XW1: it is a static script tag in
  // index.html now (the file is merged), so the old on-demand load and its ?test=1 gate are gone; without the module the log just has
  // an empty host.
  function mountFeedback(host) {
    if (window.MMFeedback && host.isConnected && !host.dataset.fb) { host.dataset.fb = '1'; try { window.MMFeedback.mount(host, { page: 'isles' }); } catch (e) { /* widget is optional */ } }
  }
  // the craft panel: your pack, then every recipe grouped (travel, saddles, supplies) with have / need per input and a Craft button.
  // Rebuilt only when it opens or the pack changes (never per frame); plain text nodes only.
  const isTrophy = (id) => { const r = CRAFT && CRAFT.get(id); return !!r && r.trophy === true; };
  const CRAFT_GROUPS = [['Travel', (id) => has(UNLOCK_BY_ITEM, outOf(id))], ['Saddles', (id) => /^saddle_/.test(id)],
    ['Supplies', (id) => !has(UNLOCK_BY_ITEM, outOf(id)) && !/^saddle_/.test(id) && !isTrophy(id)], ['Trophies', isTrophy]];
  function renderCraft(focusId) {
    const top = panel.scrollTop;
    while (panelBody.firstChild) panelBody.removeChild(panelBody.firstChild);
    craftDirty = false;
    if (!CRAFT) { panelBody.appendChild(el('p', 'dim', 'Crafting is not available here.')); return; }
    panelBody.appendChild(el('p', 'calm', 'Walk over glints to gather. Creatures drop materials too. Take your time.'));
    panelBody.appendChild(el('h3', '', 'Your pack'));
    const ul = el('ul', 'log-list'); ul.id = 'craft-inv';
    const ks = Object.keys(save.inv).sort();
    if (!ks.length) ul.appendChild(el('li', 'dim', 'Empty so far.'));
    ks.forEach((k) => { const li = el('li', '', itemName(k) + ' x' + save.inv[k]); li.dataset.item = k; ul.appendChild(li); });
    panelBody.appendChild(ul);
    let focusBtn = null;
    CRAFT_GROUPS.forEach((gr) => {
      const ids = RECIPE_IDS.filter(gr[1]);
      if (!ids.length) return;
      panelBody.appendChild(el('h3', '', gr[0]));
      ids.forEach((id) => {
        const r = CRAFT.get(id), can = CRAFT.canCraft(save.inv, id), item = outOf(id), own = invCount(item);
        const row = el('div', can.ok ? 'recipe ready' : 'recipe'); row.dataset.recipe = id; row.dataset.item = item;
        const info = el('div', 'rc-info');
        const nm = el('div', 'rc-name', (has(RECIPE_LABEL, id) ? RECIPE_LABEL[id] : itemName(item)) + (own ? ' (have ' + own + ')' : ''));
        if (craftIcon[item]) { const im = document.createElement('img'); im.className = 'rc-ico'; im.alt = ''; im.width = 32; im.height = 32; im.src = craftIcon[item]; nm.insertBefore(im, nm.firstChild); }
        info.appendChild(nm);
        const isle = has(UNLOCK_BY_ITEM, item) ? UNLOCK_BY_ITEM[item] : '';
        info.appendChild(el('div', 'rc-note', isle ? (isleOpen(isle) ? isleName(isle) + ' is open' : 'opens ' + isleName(isle)) : r.note));
        const need = el('ul', 'rc-need');
        Object.keys(r.in).forEach((k) => {
          const have = invCount(k), li = el('li', have >= r.in[k] ? 'ok' : 'short', HS.resName(k) + ' ' + have + '/' + r.in[k]);
          li.dataset.item = k; li.dataset.have = String(have); li.dataset.need = String(r.in[k]);
          need.appendChild(li);
        });
        info.appendChild(need);
        // IF1: a travel recipe says where its missing inputs grow ("Found: vine rope grows on the Verdant Jungle ferns by the dock ...")
        if (isle && !isleOpen(isle) && POUCH) Object.keys(r.in).forEach((k) => { const w = invCount(k) < r.in[k] ? POUCH.where(k) : ''; if (w) { const d = el('div', 'rc-note rc-where', 'Found: ' + w + '.'); d.dataset.item = k; info.appendChild(d); } });
        row.appendChild(info);
        const b = el('button', 'rc-btn', 'Craft'); b.type = 'button'; b.dataset.recipe = id;
        b.setAttribute('aria-label', 'Craft ' + (has(RECIPE_LABEL, id) ? RECIPE_LABEL[id] : itemName(item)));
        if (!can.ok) { b.disabled = true; b.setAttribute('aria-disabled', 'true'); }
        b.addEventListener('click', () => doCraft(id));
        row.appendChild(b);
        panelBody.appendChild(row);
        if (id === focusId) focusBtn = b;
      });
    });
    panel.scrollTop = top;
    // G-26 (b05-06): after a craft re-render the Craft buttons are inert for 300 ms, so a double-tap makes one item; focus waits for it
    const armed = focusId ? Array.from(panelBody.querySelectorAll('button.rc-btn')).filter((b) => !b.disabled) : [];
    armed.forEach((b) => { b.disabled = true; b.dataset.arm = '1'; });
    if (armed.length) setTimeout(() => { armed.forEach((b) => { if (b.isConnected && b.dataset.arm) { b.disabled = false; delete b.dataset.arm; } }); if (focusBtn && focusBtn.isConnected && !focusBtn.disabled) { try { focusBtn.focus({ preventScroll: true }); } catch (e) { /* ignore */ } } }, 300);
    if (focusId) { try { (focusBtn && !focusBtn.disabled ? focusBtn : $('panel-close')).focus({ preventScroll: true }); } catch (e) { /* ignore */ } }
  }
  // X7: the Home decor panel: make decor from your pack (MMHomeBuild recipes, have / need per input), then the tame pen roster.
  // Rebuilt only when it opens or after a craft (never per frame); plain text nodes only.
  function penList() {
    const ul = el('ul', 'log-list pen-list'); ul.id = 'pen-list';
    const pensN = HS.pens(save.home).length;
    if (!pensN) ul.appendChild(el('li', 'dim', 'No pen placed yet. Place a tame pen to give benched tames a rest.'));
    else if (!guests.length) ul.appendChild(el('li', 'dim', 'No tames resting. Tames not in your party rest here.'));
    guests.forEach((q) => { const def = CR.get(q.sp); const li = el('li', '', q.nm + (def && def.name !== q.nm ? ' (' + def.name + ')' : '')); li.dataset.tame = q.id; li.dataset.sp = q.sp; ul.appendChild(li); });
    return ul;
  }
  function renderDecor(focusKind) {
    while (panelBody.firstChild) panelBody.removeChild(panelBody.firstChild);
    panelBody.appendChild(el('p', 'calm', 'Make decor from what you gather, then place it in the garden square. Pick things up any time.'));
    let focusBtn = null;
    if (HB) {
      panelBody.appendChild(el('h3', '', 'Make decor'));
      HB.IDS.forEach((k) => {
        const r = HB.get(k), can = HB.canCraft(save.inv, save.home, k), stock = save.home.inv[k] | 0;
        const row = el('div', can.ok ? 'decor-recipe ready' : 'decor-recipe'); row.dataset.kind = k;
        const info = el('div', 'rc-info');
        info.appendChild(el('div', 'rc-name', HB.name(k) + ' (in stock ' + stock + ')'));
        info.appendChild(el('div', 'rc-note', r.note));
        const need = el('ul', 'rc-need');
        Object.keys(r.in).forEach((it) => {
          const have = invCount(it), li = el('li', have >= r.in[it] ? 'ok' : 'short', HS.resName(it) + ' ' + have + '/' + r.in[it]);
          li.dataset.item = it; li.dataset.have = String(have); li.dataset.need = String(r.in[it]);
          need.appendChild(li);
        });
        info.appendChild(need);
        row.appendChild(info);
        const b = el('button', 'rc-btn dc-btn', 'Make'); b.type = 'button'; b.dataset.kind = k;
        b.setAttribute('aria-label', 'Make a ' + HB.name(k).toLowerCase());
        if (!can.ok) { b.disabled = true; b.setAttribute('aria-disabled', 'true'); }
        b.addEventListener('click', () => doDecorCraft(k));
        row.appendChild(b);
        panelBody.appendChild(row);
        if (k === focusKind) focusBtn = b;
      });
    }
    panelBody.appendChild(el('h3', '', 'Tame pen'));
    panelBody.appendChild(penList());
    if (focusKind) { try { (focusBtn && !focusBtn.disabled ? focusBtn : $('panel-close')).focus({ preventScroll: true }); } catch (e) { /* ignore */ } }
  }
  function doDecorCraft(kind) {
    if (!HB || !HOME) return { ok: false, why: 'off' };
    const r = HB.craft(save.inv, save.home, kind);
    if (!r.ok) {
      if (r.why === 'stock' || r.why === 'full' || r.why === 'made') toast('You have plenty of those. Place a few first.');
      else if (r.missing && r.missing.length) toast('Still need ' + r.missing.map((m) => HS.resName(m.id) + ' ' + m.have + '/' + m.need).join(', ') + '.');
      return { ok: false, why: r.why, missing: r.missing };
    }
    save.inv = r.inv;
    dirty = true; persist(); refreshDecor();
    toast('Made a ' + HB.name(kind).toLowerCase() + '. Tap Decor to place it.');
    if (panelKind === 'decor') renderDecor(kind);
    return { ok: true, kind: kind, stock: r.stock };
  }
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
    $('decor-make').addEventListener('click', () => openPanel('decor'));
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
  const hud = { hero: $('hud-hero'), isle: $('hud-isle'), info: $('hud-info'), ground: $('hud-ground'), fill: $('hp-fill'), hp: $('hp-text'), hint: $('hint'),
    bbName: $('bb-name'), bbPhase: $('bb-phase') };
  const bossBar = $('boss-bar'), bbFill = $('bb-fill');
  const btn = { feed: $('btn-feed'), soothe: $('btn-soothe'), ride: $('btn-ride'), ability: $('btn-ability'), cmd: $('btn-cmd'), gather: $('btn-gather'), sail: $('btn-sail'), build: $('btn-build'), home: $('btn-home'), log: $('btn-log'), trophy: $('btn-trophy') };
  const lastBtn = {};
  const showBtn = (k, on) => { if (lastBtn[k] !== on) { lastBtn[k] = on; btn[k].hidden = !on; } };
  // ---- X1: b34 taming icons by id (game/assets/arcane/b34-taming-ui-items/manifest.json, 24x24, provisional). Each icon is one
  // Image loaded once; until (or unless) it loads, and always with ?art=0, the text label is what shows. No per-frame DOM work:
  // setIco / setMeter only touch the DOM when a value changes.
  const ICON_DIR = '../../assets/arcane/b34-taming-ui-items/ui/';
  const ICON_IDS = ['ui_tame_trust', 'ui_tame_torpor', 'ui_tame_bond', 'ui_tranq_on', 'ui_tranq_off', 'ui_cmd_follow', 'ui_cmd_stay', 'ui_cmd_attack', 'ui_saddle', 'ui_ride'];
  const iconOk = {};
  function paintIco(span) {
    const id = span.dataset.ico, on = !!iconOk[id];
    let img = span.firstChild;
    if (on) {
      if (!img) { img = document.createElement('img'); img.alt = ''; img.width = 24; img.height = 24; span.appendChild(img); }
      if (img.getAttribute('src') !== iconOk[id]) img.setAttribute('src', iconOk[id]);
    }
    span.classList.toggle('on', on);
    const meter = span.parentNode && span.parentNode.classList && span.parentNode.classList.contains('meter') ? span.parentNode : null;
    if (meter) meter.classList.toggle('iconed', on);
  }
  function setIco(span, id) { if (!span || span.dataset.ico === id) return; span.dataset.ico = id; paintIco(span); }
  if (ART) ICON_IDS.forEach((id) => {
    const im = new Image();
    im.onload = () => { if (!(im.naturalWidth > 0)) return; iconOk[id] = im.src; document.querySelectorAll('.ico').forEach((sp) => { if (sp.dataset.ico === id) paintIco(sp); }); };
    im.src = ICON_DIR + id + '.png';
  });
  const meters = { trust: $('tm-trust'), torpor: $('tm-torpor'), bond: $('tm-bond'), saddle: $('tm-saddle') };
  const meterVal = {};
  function setMeter(k, v) {
    const m = meters[k]; if (!m) return;
    const on = v !== '';
    if (meterVal[k] === v) return;
    meterVal[k] = v;
    m.hidden = !on;
    if (on) m.querySelector('.val').textContent = v;
  }
  // the party command: follow -> stay -> attack (MMCompanion.setMode on every active companion)
  const CMD_ORDER = ['follow', 'stay', 'attack'];
  const CMD_NAME = { follow: 'Follow', stay: 'Stay', attack: 'Fight' }; // BB: 'Fight', not a second 'Attack' next to the big ATTACK button (the aria label keeps 'attack')
  let cmdMode = '';
  function showCmd(mode) {
    if (cmdMode === mode) return;
    cmdMode = mode;
    setIco(btn.cmd.querySelector('.ico'), 'ui_cmd_' + mode);
    btn.cmd.querySelector('.txt').textContent = CMD_NAME[mode];
    btn.cmd.setAttribute('aria-label', 'Party command: ' + mode);
  }
  function cycleCommand() {
    if (!party.length) return '';
    const cur = CMD_ORDER.indexOf(party[0].cs.mode);
    const next = CMD_ORDER[(cur + 1) % CMD_ORDER.length];
    party.forEach((p) => CMP.setMode(p.cs, next));
    showCmd(next); cue('select');
    toast({ follow: 'Party: follow me.', stay: 'Party: stay here.', attack: 'Party: attack!' }[next]);
    return next;
  }
  hud.hero.textContent = HERO.name + ' - ' + HERO.cls + ' Lv ' + HERO.level;
  const lastHud = {};
  const setText = (k, v) => { if (lastHud[k] !== v) { lastHud[k] = v; hud[k].textContent = v; } };
  let hpLast = '';
  const hpBar = $('hp-bar');
  function drawHud() {
    const tx = tileOf(hero.x), ty = tileOf(hero.y);
    setText('isle', PACK.name + ' - ' + bandName(O.zoneAt(world, tx, ty)));
    setText('hp', Math.ceil(hero.hp) + ' / ' + hero.maxHp);
    hud.fill.style.width = Math.round(100 * hero.hp / hero.maxHp) + '%';
    const hpSt = hero.dead || hero.hp <= 0 ? 'empty' : hero.hp <= hero.maxHp * 0.3 ? 'low' : 'ok'; // PI2: the heart's shape follows (not colour alone)
    if (hpSt !== hpLast) { hpLast = hpSt; hpBar.dataset.state = hpSt; hpBar.classList.toggle('low', hpSt === 'low'); hpBar.classList.toggle('empty', hpSt === 'empty'); }
    const lootN = Object.keys(loot).reduce((n, k) => n + loot[k], 0);
    setText('info', 'XP ' + xp + '  Kills ' + kills + '  Loot ' + lootN + (tames.roster.length ? '  Tames ' + tames.roster.length : '') + (party.length ? '  Party ' + party.length : ''));
    const tn = crackedAt(tx, ty) ? 'slush (cracked ice)' : NAMES[O.tileAt(world, tx, ty)] || '';
    setText('ground', tn.replace(/_/g, ' ') + (hero.scale < 1 ? ' (slow x' + Math.round(hero.scale * 100) / 100 + ')' : '') + (ride ? ' (riding x' + Math.round(hero.scale * 100) / 100 + ')' : ''));
    // the calm hint line + the Feed / Soothe / Ride buttons
    const ft = TAME ? feedTarget() : null;
    showBtn('feed', !!ft || bossFeedable());
    feedHud(ft);
    bossHud();
    envHud();
    showBtn('soothe', TAME);
    showBtn('ride', MOUNTS && !!mountEnt);
    abilityHud();
    showBtn('cmd', COMPANIONS && party.length > 0);
    if (party.length) showCmd(CMD_ORDER.indexOf(party[0].cs.mode) >= 0 ? party[0].cs.mode : 'follow');
    tameHud(ft);
    showBtn('gather', !!spotNear());
    showBtn('sail', nearDock());
    showBtn('build', HOME);
    showBtn('home', !HOME);
    showBtn('trophy', nearPedestal() && !bossAlive());
    const h = hintText(ft);
    setText('hint', h);
    if (hud.hint.hidden !== !h) hud.hint.hidden = !h;
  }
  // XW1: the ability button (shown only while riding a mount with an ability) and the dive breath meter; DOM touched only on change
  const abilLast = { on: false, txt: '', p: -1, cls: '', label: '', breath: null };
  const abilEls = { txt: btn.ability.querySelector('.txt'), box: $('hud-abil'), breath: $('abil-breath').querySelector('.val') };
  function abilityHud() {
    const on = !!(ride && abil);
    showBtn('ability', on);
    if (abilLast.on !== on) { abilLast.on = on; document.body.classList.toggle('abil-on', on); } // phones lift the hint above the taller button column
    let breath = '';
    if (on) {
      const ph = abil.ph, cool = ph === 'cool' || ph === 'wind';
      const txt = abilDef.name;
      let p = MA.ready(abil);
      p = REDUCED ? Math.floor(p * 4) / 4 : Math.round(p * 20) / 20; // reduced motion: a static ring in quarter steps
      if (ph === 'active') p = 1;
      const cls = ph === 'active' ? 'on' : cool ? 'cool' : '';
      const label = 'Mount ability: ' + abilDef.name + (ph === 'ready' ? ', ready' : ph === 'active' ? ', on now' : ph === 'wind' ? ', getting ready' : ', resting ' + Math.max(1, Math.ceil(abil.cd)) + ' s');
      if (abilLast.txt !== txt) { abilLast.txt = txt; abilEls.txt.textContent = txt; }
      if (abilLast.p !== p) { abilLast.p = p; btn.ability.style.setProperty('--p', String(p)); }
      if (abilLast.cls !== cls) { abilLast.cls = cls; btn.ability.classList.toggle('on', cls === 'on'); btn.ability.classList.toggle('cool', cls === 'cool'); }
      if (abilLast.label !== label) { abilLast.label = label; btn.ability.setAttribute('aria-label', label); btn.ability.title = abilDef.desc; }
      if (abilDef.kind === 'swim' && (ph === 'active' || abil.breath < abilDef.breath)) breath = Math.ceil(abil.breath) + ' / ' + abilDef.breath + ' s';
    }
    if (abilLast.breath !== breath) { abilLast.breath = breath; abilEls.box.hidden = !breath; if (breath) abilEls.breath.textContent = breath; }
  }
  // the tame meters: trust (befriending progress) / torpor (knockout sleepiness) of the creature you are taming, bond of your lead
  // companion, and the saddle while riding (fitted = the crafted saddle is in your pack; bareback only with ?saddles=0)
  function tameHud(ft) {
    let c = ft;
    if (!c && TAME) { let bd = 5 * TILE; for (let i = 0; i < creatures.length; i++) { const x = creatures[i]; if (!x.tm) continue; const d = Math.hypot(hero.x - x.x, hero.y - x.y); if (d < bd) { bd = d; c = x; } } }
    const tm = c && c.tm;
    setMeter('trust', tm && (c.calm || c.ko) && tm.need > 0 ? Math.floor(tm.prog) + '/' + tm.need : '');
    setMeter('torpor', tm && tm.torporMax > 0 && (tm.torpor > 0 || c.ko) ? (c.ko ? 'asleep ' + Math.ceil(TM.sleepLeft(tm)) + 's' : Math.round(100 * clamp(tm.torpor / tm.torporMax, 0, 1)) + '%') : '');
    setMeter('bond', party.length ? String(party[0].ent.bond | 0) : '');
    const md = ride && mountEnt ? CR.get(mountEnt.sp) : null;
    setMeter('saddle', md && md.ride ? (md.ride.saddle ? (hasSaddle(md.ride.saddle) ? 'fitted' : 'bareback') : 'not needed') : '');
  }
  // X6: the boss bar (name, phase, health) while you fight; DOM only when a value changes
  let bbW = '', bbCls = '';
  function bossHud() {
    const on = bossAlive() && bz.engaged;
    if (bossBar.hidden === on) bossBar.hidden = !on;
    if (!on) return;
    const s = bz.st.st;
    setText('bbName', (bz.st.st === 'fight' ? '' : s === 'weary' ? 'Weary ' : 'Taming ') + bossName());
    const heads = bz.st.heads ? ' - heads ' + bz.st.heads.filter((h) => h > 0).length + '/' + bz.st.heads.length : ''; // XB
    setText('bbPhase', (s === 'fight' ? 'Phase ' + (bz.st.phase + 1) + ': ' + bz.phaseName + heads : s === 'weary' ? (TAME && BOSS_TAMEABLE ? 'feast to tame' : 'finish it') : (bz.ko ? 'asleep' : 'soothe it')) + (bz.rm ? ' (rematch)' : ''));
    const w = Math.max(0, Math.round(100 * bz.st.hp / bz.st.hpMax)) + '%';
    if (w !== bbW) { bbW = w; bbFill.style.width = w; }
    if (s !== bbCls) { bossBar.classList.toggle('weary', s === 'weary'); bossBar.classList.toggle('taming', s === 'taming'); bbCls = s; }
  }
  function bossHint() {
    if (!bossAlive() || !bz.engaged) return '';
    const s = bz.st.st, nm = bossName();
    if (s === 'weary') return TAME && BOSS_TAMEABLE ? 'The ' + nm + ' is weary. Press F to feed it a feast and tame it (' + invCount('feast') + ' in your pack), or finish it.' : 'The ' + nm + ' is weary. Finish it!';
    if (s === 'taming') {
      const t = bz.st.tame;
      if (bz.ko && t) return 'The ' + nm + ' is asleep (' + Math.ceil(TM.sleepLeft(t)) + ' s). Feed it feasts (F): ' + Math.floor(t.prog) + '/' + t.need + '. Do not hit it.';
      return 'Taming the ' + nm + ': soothe shots (Q) put it to sleep. Torpor ' + (t && t.torporMax ? Math.round(100 * t.torpor / t.torporMax) : 0) + '%.';
    }
    if (bz.tele.length) return 'Step out of the glowing shape before it fills!';
    if (bz.onIce) return 'Thin ice: a little slippery. The hot springs are always safe.';
    if (bz.st.sub) return 'The ' + nm + ' is under the water. Keep moving and watch for bubbles.';
    if (bz.st.dig) return 'The ' + nm + ' is underground. Keep moving: it bursts up under a glowing shape.';
    return '';
  }
  const DIR8 = ['east', 'south-east', 'south', 'south-west', 'west', 'north-west', 'north', 'north-east'];
  const ARROW8 = ['\u2192', '\u2198', '\u2193', '\u2199', '\u2190', '\u2196', '\u2191', '\u2197'];
  const dir8 = (dx, dy) => ((Math.round(Math.atan2(dy, dx) / (Math.PI / 4)) % 8) + 8) % 8;
  // IF1: out of air (or running low) away from shelter: the nearest dome / landing pad, by direction with an arrow
  function airHint() {
    if (!ENVR.oxygen || !envS.o2 || !(envS.warnO || envS.o2.empty) || sheltered() || hero.dead || !SHELTER_PTS.length) return '';
    const tx = hero.x / TILE, ty = hero.y / TILE;
    let b = null, bd = Infinity;
    for (let i = 0; i < SHELTER_PTS.length; i++) { const p = SHELTER_PTS[i], d = (p.x - tx) * (p.x - tx) + (p.y - ty) * (p.y - ty); if (d < bd) { bd = d; b = p; } }
    const k = dir8(b.x - tx, b.y - ty);
    return (envS.o2.empty ? 'Out of air (hits are halved): head ' : 'Air is low: head ') + ARROW8[k] + ' ' + DIR8[k] + ' to the nearest dome, ' + Math.max(1, Math.round(Math.sqrt(bd))) + ' tiles.';
  }
  // IF1: the nearest ready glint or sparkle within `r` tiles (sparkles first), for the hint
  function glintHint(r) {
    let b = null, bd = r * TILE;
    for (let i = 0; i < nodes.length; i++) {
      const n = nodes[i];
      if (!nodeReady(n)) continue;
      const d = Math.hypot((n.x + 0.5) * TILE - hero.x, (n.y + 0.5) * TILE - hero.y) - (n.sparkle ? 1e4 : 0);
      if (d < bd) { bd = d; b = n; }
    }
    if (!b) return '';
    const k = dir8((b.x + 0.5) * TILE - hero.x, (b.y + 0.5) * TILE - hero.y);
    return (b.sparkle ? 'A forage sparkle (' + HS.resName(b.kind) + ')' : 'A glint of ' + HS.resName(b.kind)) + ' is to the ' + DIR8[k] + ' ' + ARROW8[k] + ': walk over it to pick it up.';
  }
  // IF1: on the jungle without the raft's vine rope: where it grows
  function vineHint() {
    if (ISLE !== 'jungle' || !CRAFT || isleOpen('reef') || invCount('raft') || invCount('vine_rope') >= 2) return '';
    const v = nodes.find((n) => n.kind === 'vine_rope' && n.label && nodeReady(n));
    if (!v) return '';
    const k = dir8((v.x + 0.5) * TILE - hero.x, (v.y + 0.5) * TILE - hero.y);
    return 'Vine rope for the raft grows on the ferns by the dock, to the ' + DIR8[k] + ' ' + ARROW8[k] + ': walk over a "vine rope" glint.';
  }
  function hintText(ft) {
    if (build) return 'Decorating: tap open ground to place, tap an item to pick it up. E works too.';
    const bh = bossHint();
    if (bh) return bh;
    const ah = airHint();
    if (ah) return ah;
    if (nearPedestal() && !bossAlive()) return document.body.classList.contains('touch') ? 'The trophy pedestal. Tap Trophies to look, or for a rematch.' : 'The trophy pedestal. Press P or Trophies to look, or for a rematch.';
    if (nearDock() && !ride) return document.body.classList.contains('touch') ? 'The dock. Tap Sail to open the sea chart.' : 'The dock. Press T or Sail to open the sea chart.';
    if (spotNear()) return 'Something to gather here. Press G or Gather.';
    if (ride) return 'Riding ' + (mountEnt ? mountEnt.nm || 'your mount' : 'your mount') + (CMP.canSwim(ride) && swimAt(tileOf(hero.x), tileOf(hero.y)) ? ' through the water' : '') + '. Press R or Ride to get off.' +
      (abil ? (document.body.classList.contains('touch') ? ' Tap ' : ' F or ') + abilDef.name + ': ' + abilDef.desc.charAt(0).toLowerCase() + abilDef.desc.slice(1) : '');
    { const fx = tileOf(hero.x + hero.face.x * TILE * 1.2), fy = tileOf(hero.y + hero.face.y * TILE * 1.2); if (swimAt(fx, fy) && !solidAt(fx, fy)) return 'Open water. Ride a Tidesteed or Skimray to swim across.'; }
    if (!TAME) return '';
    if (ft) {
      const def = CR.get(ft.kind), f = foodOf(def), food = IC.foodName(f.id) + ' x' + foodHave(f) + (f.from === 'inv' ? ' (from your bag)' : '');
      const prog = Math.floor(ft.tm.prog) + '/' + ft.tm.need;
      if (ft.ko) return def.name + ' is asleep (' + Math.ceil(TM.sleepLeft(ft.tm)) + ' s). Feed it ' + food + ' - ' + prog + '. Do not hit it.';
      return def.name + ' trusts you. Stay calm and feed it ' + food + ' - ' + prog + '.';
    }
    let best = null, bd = 5 * TILE;
    for (let i = 0; i < creatures.length; i++) { const c = creatures[i]; if (!c.tm) continue; const d = Math.hypot(hero.x - c.x, hero.y - c.y); if (d < bd) { bd = d; best = c; } }
    if (!best) { // FT2: nothing tameable in reach - say where the nearest one is (or to explore), never a blank hint
      if (sparkle && nodeReady(sparkle)) { const sh = glintHint(POUCH ? POUCH.SPARKLE_R + 4 : 14); if (sh) return sh; } // IF1
      const vh = vineHint(); if (vh) return vh;
      let far = null, fd = Infinity; for (let i = 0; i < creatures.length; i++) { const c = creatures[i]; if (!c.tm) continue; const d = Math.hypot(hero.x - c.x, hero.y - c.y); if (d < fd) { fd = d; far = c; } }
      if (!far) { const gh = glintHint(24); return gh || 'Explore the island: walk on to find a creature to tame.'; }
      const dir = DIR8[dir8(far.x - hero.x, far.y - hero.y)];
      return 'A ' + CR.get(far.kind).name + ' is to the ' + dir + ': walk over to tame it.';
    }
    const def = CR.get(best.kind);
    if (def.tame.method === 'knockout') return best.tm.torpor > 0 ? def.name + ' is getting drowsy. Keep up the soothe shots.' : def.name + ' can be tamed: knock it out with Soothe shots (Q), then feed it.';
    return def.name + ' is shy. Walk up slowly and do not attack.';
  }
  let toastT = 0;
  function toast(msg) { const el = $('toast'); el.textContent = msg; el.classList.add('on'); clearTimeout(toastT); toastT = setTimeout(() => el.classList.remove('on'), 2200); }

  // ---------- save (own key, throttled) ----------
  let dirty = true, saveT = 0;
  function persist() {
    nodesSave(); // G-26: the pouch and the picked nodes go with every Isles save
    try {
      if (!has(save.isles, ISLE)) save.isles[ISLE] = { seed: SEED, pos: null, fog: '', chests: [] };
      const rec = save.isles[ISLE];
      if (rec.seed !== SEED) { rec.chests = []; }
      rec.seed = SEED;
      rec.fog = FOG.encode(fog);
      ISL.setPos(save, ISLE, hero.x / TILE, hero.y / TILE);
      if (hero.dead || hero.hp >= hero.maxHp) delete save.hp; else save.hp = Math.max(1, Math.ceil(hero.hp));
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
  document.addEventListener('pointerdown', () => { if (launch.on) launchGo(true); }, true); // TD1: a tap skips the lift-off
  document.addEventListener('keydown', (e) => {
    if (launch.on) { launchGo(true); e.preventDefault(); return; }
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    if (MI && MI.isTyping(e.target)) return; // BB: never read keys typed into a text field (the feedback box)
    if (KEYMAP[e.code]) { keys[KEYMAP[e.code]] = true; e.preventDefault(); }
    if (e.code === 'Space') { firing = true; aim = null; e.preventDefault(); }
    // BB universal controls (CONTROLS.md, MMInput): Enter = primary (fire), Shift / E = secondary (the F action), Esc / P = menu.
    // The old keys all stay. Enter on a focused button keeps clicking that button.
    if (e.code === 'Enter' || e.code === 'NumpadEnter') { if (!panel.hidden || (e.target && e.target.closest && e.target.closest('button, a'))) return; firing = true; aim = null; e.preventDefault(); }
    if ((e.code === 'ShiftLeft' || e.code === 'ShiftRight' || (e.code === 'KeyE' && !build)) && !e.repeat && panel.hidden) secondary();
    if (e.code === 'Escape' && panel.hidden && !(SET && SET.isOpen())) { openMenu(); e.preventDefault(); return; }
    if (e.code === 'KeyP' && !e.repeat && !nearPedestal() && panelKind !== 'trophy') { if (!panel.hidden) closePanel(); else openMenu(); return; }
    if (e.code === 'KeyM') toggleMap();
    if (e.code === 'KeyF' && !e.repeat) secondary(); // XW1: F = the mount ability while riding (feeding still wins next to a creature)
    if (e.code === 'KeyQ' && !e.repeat) toggleSoothe();
    if (e.code === 'KeyR' && !e.repeat) toggleRide();
    if (e.code === 'KeyG' && !e.repeat) gatherNear();
    if (e.code === 'KeyC' && !e.repeat) cycleCommand();
    if (e.code === 'KeyT' && !e.repeat && nearDock()) openPanel('sail');
    if (e.code === 'KeyL' && !e.repeat) { if (panelKind === 'log') closePanel(); else openPanel('log'); }
    if (e.code === 'KeyK' && !e.repeat) { if (panelKind === 'craft') closePanel(); else openPanel('craft'); }
    if (e.code === 'KeyB' && !e.repeat && HOME) setBuild(!build);
    if (e.code === 'KeyP' && !e.repeat && (nearPedestal() || panelKind === 'trophy')) { if (panelKind === 'trophy') closePanel(); else openPanel('trophy'); }
    if (e.code === 'KeyE' && !e.repeat && build) buildAt(tileOf(hero.x + hero.face.x * TILE), tileOf(hero.y + hero.face.y * TILE));
    if (e.code === 'Escape' && !panel.hidden) closePanel();
  });
  document.addEventListener('keyup', (e) => { if (KEYMAP[e.code]) keys[KEYMAP[e.code]] = false; if (e.code === 'Space' || e.code === 'Enter' || e.code === 'NumpadEnter') firing = false; });
  // XW1: F (and the universal secondary: Shift, E, pad B / X) = the mount ability while riding; feeding still wins next to a creature
  function secondary() { if (ride && abil && !(TAME && feedTarget()) && !bossFeedable()) return useAbility(); return feed(); }
  // BB: Esc / P / pad Start open the shared Menu sheet (MMNav); without it, the Pack
  function openMenu() {
    if (window.MMNav && window.MMNav.mounted && window.MMNav.mounted()) { try { window.MMNav.open(); cue('ui_open'); return true; } catch (e) { /* fall through */ } }
    openPanel('party'); return false;
  }
  // BB: a standard gamepad (MMInput.readPad): left stick / d-pad move, A fires, B / X = secondary, Start = menu. Polled once a frame,
  // only while a pad is connected (no work and no allocation otherwise).
  const MI = window.MMInput || null;
  const pad = { on: false, st: null, prevSec: false, prevMenu: false };
  window.addEventListener('gamepadconnected', () => { pad.on = true; });
  function padPoll() {
    if (!pad.on || !MI || !navigator.getGamepads) return;
    let gp = null; try { const l = navigator.getGamepads(); for (let i = 0; l && i < l.length; i++) if (l[i]) { gp = l[i]; break; } } catch (e) { gp = null; }
    if (!gp) { if (pad.st && pad.st.primary) firing = false; return; }
    const r = pad.st = MI.readPad(gp, pad.st || undefined);
    padVec.x = r.move.x; padVec.y = r.move.y;
    if (r.primary) { firing = true; aim = null; } else if (pad.wasFire) firing = false;
    pad.wasFire = r.primary;
    if (r.secondary && !pad.prevSec && panel.hidden) secondary();
    if (r.menu && !pad.prevMenu) { if (!panel.hidden) closePanel(); else openMenu(); }
    pad.prevSec = r.secondary; pad.prevMenu = r.menu;
  }
  const padVec = { x: 0, y: 0 };
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
  function toggleSoothe() { if (!TAME) return false; soothe = !soothe; cue(soothe ? 'select' : 'back'); btn.soothe.setAttribute('aria-pressed', String(soothe)); setIco(btn.soothe.querySelector('.ico'), soothe ? 'ui_tranq_on' : 'ui_tranq_off'); toast(soothe ? 'Soothe shots: they build torpor.' : 'Normal shots.'); return soothe; }
  btn.feed.addEventListener('click', () => { feed(); });
  btn.soothe.addEventListener('click', () => { toggleSoothe(); });
  btn.ride.addEventListener('click', () => { toggleRide(); btn.ride.setAttribute('aria-pressed', String(!!ride)); });
  btn.ability.addEventListener('click', () => { useAbility(); });
  btn.cmd.addEventListener('click', () => { cycleCommand(); });
  btn.gather.addEventListener('click', () => { gatherNear(); });
  btn.sail.addEventListener('click', () => { openPanel('sail'); });
  btn.build.addEventListener('click', () => { setBuild(!build); });
  btn.home.addEventListener('click', () => { travelTo('home'); });
  btn.trophy.addEventListener('click', () => { if (panelKind === 'trophy') closePanel(); else openPanel('trophy'); });
  btn.log.addEventListener('click', () => { if (panelKind !== 'log') openPanel('log'); });
  $('btn-craft').addEventListener('click', () => { if (panelKind !== 'craft') openPanel('craft'); });
  $('tab-party').addEventListener('click', () => { if (panelKind !== 'party') openPanel('party'); });
  $('tab-help').addEventListener('click', () => { if (panelKind !== 'help') openPanel('help'); });
  $('btn-pack').addEventListener('click', () => { if (PACK_TABS[panelKind]) closePanel(); else openPanel('party'); });
  // 8B: the short how-to shows once, on the first visit (no island in the archipelago save yet: no new storage key), and never blocks a
  // tap (pointer-events: none); the Help tab keeps it
  (function howto() {
    const box = $('howto');
    if (!FIRST_VISIT) return;
    box.hidden = false;
    const hide = () => { box.hidden = true; };
    setTimeout(hide, 9000);
    window.addEventListener('keydown', function once() { setTimeout(hide, 2500); window.removeEventListener('keydown', once); });
    window.addEventListener('pointerdown', function once() { setTimeout(hide, 2500); window.removeEventListener('pointerdown', once); });
  })();
  const coarse = (() => { try { return window.matchMedia('(pointer: coarse)').matches; } catch (e) { return false; } })();
  if (coarse || Q.get('touch') === '1' || ('ontouchstart' in window && window.innerWidth <= 700)) document.body.classList.add('touch');
  // PI2: one-thumb layout. On touch the mount ability button moves next to the move stick (the same thumb reaches both); off, it goes
  // back to its place in the action column. The DOM moves only when the mode changes.
  const actsEl = $('acts'), touchEl = $('touch');
  function applyOneThumb() {
    document.body.classList.toggle('one-thumb', ONE_THUMB);
    const home = ONE_THUMB && document.body.classList.contains('touch') ? touchEl : actsEl;
    if (btn.ability.parentNode !== home) { if (home === actsEl) actsEl.insertBefore(btn.ability, btn.cmd); else home.appendChild(btn.ability); }
  }
  function setOneThumb(on) {
    ONE_THUMB = !!on;
    OT_KEYS.forEach((k) => { try { S.setItem(k, ONE_THUMB ? '1' : '0'); } catch (e) { /* this visit only */ } });
    applyOneThumb();
    return ONE_THUMB;
  }
  applyOneThumb();

  const vec = { mx: 0, my: 0 };
  function inputVec() {
    let mx = (keys.r ? 1 : 0) - (keys.l ? 1 : 0), my = (keys.d ? 1 : 0) - (keys.u ? 1 : 0);
    if (stick.x || stick.y) { mx = stick.x; my = stick.y; }
    else if (padVec.x || padVec.y) { mx = padVec.x; my = padVec.y; }
    vec.mx = mx; vec.my = my;
    return vec;
  }

  // ---------- simulation ----------
  const clock = (() => { let off = 0; return { now: () => Date.now() + off, set: (t) => { off = Number(t) - Date.now(); return clock.now(); } }; })();
  // G-26: a picked node / glint stays picked across a reload until it grows back (wall clock); the pouch is written with it
  function nodesSave() {
    try {
      const now = clock.now(), n = [];
      for (let i = 0; i < nodes.length && n.length < NODES_MAX; i++) { const q = nodes[i]; if (!q.sparkle && Number.isFinite(q.until) && q.until > now) n.push([q.i, Math.round(q.until)]); }
      const p = {}; Object.keys(pouch).forEach((k) => { p[k] = Math.max(0, Math.min(99, pouch[k] | 0)); });
      const o = nodesRead(); const isles = {}; Object.keys(o.isles).slice(0, 16).forEach((k) => { if (/^[a-z]{2,12}$/.test(k)) isles[k] = o.isles[k]; });
      isles[ISLE] = { n, p }; S.setItem(NODES_KEY, JSON.stringify({ v: 1, isles }));
    } catch (e) { /* storage blocked: today's picks last for this visit */ }
  }
  (function nodesRestore() {
    const list = Array.isArray(nodesMine.n) ? nodesMine.n.slice(0, NODES_MAX) : []; const now = clock.now(), byI = new Map(); nodes.forEach((q) => { if (!q.sparkle) byI.set(q.i, q); });
    list.forEach((e) => { if (!Array.isArray(e) || e.length < 2) return; const q = byI.get(e[0]); const u = Number(e[1]); if (q && Number.isFinite(u) && u > now && u - now < 7 * 864e5) q.until = u; });
  }());
  let spawnT = 0, miniT = 0, hudT = 0;
  let heroMoving = false;
  function update(dt, mx, my) {
    simT += dt;
    hero.t += dt; hero.iframes -= dt; hero.cd -= dt; hero.shotT -= dt;
    heroMoving = Math.hypot(mx, my) > 0.05;
    if (ride) CMP.rideStep(ride, dt);
    if (ride && abil && !hero.dead) abilityStep(dt);
    if (!hero.dead) moveHero(mx, my, dt);
    if (ONE_THUMB && !hero.dead && hero.cd <= 0 && !firing && !build) autoAttack(); // PI2: one-thumb mode fires at the nearest foe by itself
    if (!GFX.fogHz) revealFog(); else if ((fogAcc += dt) >= 1 / GFX.fogHz - 1e-9) { fogAcc = 0; revealFog(); }
    nodeTick();
    spawnT -= dt;
    if (spawnT <= 0) { spawnT = 0.5; spawnTick(); bossCheck(); bossTick(); sparkTick(); }
    stepCreatures(dt);
    if (bz.st) bossStep(dt);
    if (ENV_ON) envStep(dt);
    tdStep(dt); // TD1: thin ice, hot spring soak, glints, the air arrow
    restAcc += dt; if (restAcc >= 0.2) { restStep(restAcc); restAcc = 0; } // IF1: 5 Hz is plenty for a calm heal
    stepBolts(dt);
    if (party.length) { if (!GFX.aiHz) stepParty(dt); else if ((partyAcc += dt) >= 1 / GFX.aiHz - 1e-9) { stepParty(partyAcc); partyAcc = 0; } } // PI2: 15 Hz on the low tier
    saveT -= dt;
    if (saveT <= 0) { saveT = 4; if (dirty) persist(); }
  }
  let paused = false, last = performance.now();
  let SET = null; // BB: the shared Settings sheet (MMSettings), mounted with the Menu below
  function frame(now) {
    const dt = Math.min(0.05, Math.max(0, (now - last) / 1000));
    last = now;
    if (launch.on) { // TD1: the rocket lift-off plays over a frozen island, then the page goes to the mars landing pad
      launch.t += dt; render(); drawLaunch();
      if (launch.t >= LAUNCH_SEC) launchGo(false);
      requestAnimationFrame(frame);
      return;
    }
    padPoll();
    if (!paused && !(SET && SET.isOpen())) { // BB: the Settings sheet pauses the island like the Pack does
      const v = inputVec();
      if (firing) { if (aim) fire(aim.x - (hero.x - camX), aim.y - (hero.y - camY)); else fire(0, 0); }
      update(dt, v.mx, v.my);
      if (Math.hypot(v.mx, v.my) > 0.05) dirty = true;
    }
    render();
    miniT -= dt; hudT -= dt;
    if (miniT <= 0) { miniT = GFX_LOW ? 0.5 : 0.25; drawMini(); }
    if (hudT <= 0) { hudT = 0.2; drawHud(); if (craftDirty && panelKind === 'craft') renderCraft(''); }
    requestAnimationFrame(frame);
  }
  // X4 grandfathering, once per save (sg): the mount you already had (tames.mount, else your first rideable tame) gets its saddle for
  // free, so nobody loses a ride. Skipped with ?saddles=0 (nothing is written, the gift waits for a normal visit).
  let saddleGift = null;
  if (SADDLES && save.sg !== 1) {
    const pick = (t) => { const d = t && CR.get(t.sp); return d && d.rideable ? t : null; };
    const ent = pick(tames.mount ? TAMES.find(tames, tames.mount) : null) || tames.roster.map(pick).filter(Boolean)[0] || null;
    const d = ent ? CR.get(ent.sp) : null, sid = d && d.ride && d.ride.saddle;
    if (sid && !hasSaddle(sid) && invAdd(sid, 1)) saddleGift = sid;
    save.sg = 1; dirty = true; persist();
  }
  loadParty();
  revealFog();
  ISL.writeMedals(S, []); // the summary key exists from the first visit (additive)
  checkMedals();
  drawMini(); drawHud();
  requestAnimationFrame(frame);
  if (!savedIsle && !medalLog.length) toast(HOME ? 'Welcome home to ' + PACK.name + '.' : 'Welcome to the ' + PACK.name + '!');
  if (saddleGift) toast('A ' + itemName(saddleGift).toLowerCase() + ' for your mount is in your pack, free.');
  if (URL_LOCKED) toast(isleName(URL_LOCKED) + ' opens with a ' + itemName(ITEM_FOR_ISLE[URL_LOCKED] || '').toLowerCase() + '. You are at the Hearth Isle dock: craft one and sail from here.');

  // ---------- NAV slice D: shared Menu (top-left; the old "<-" link stays in the DOM as mm-nav-legacy) ----------
  if (window.MMNav) {
    try {
      const NAV = window.MMNav;
      if (NAV.mount({ page: 'isles', sub: isleName(ISLE), legacy: '#back' }) === true) {
        NAV.markPlace('isles', isleName(ISLE), 'game/games/isles/index.html?isle=' + (ISLE_PARAM[ISLE] || ISLE));
        NAV.onOpen(() => { if (!panel.hidden) closePanel(); paused = true; });
        NAV.onClose(() => { if (panel.hidden) paused = false; });
        NAV.onSettings(() => openSettings());
        { const lg = $('back'); if (lg) { lg.tabIndex = -1; lg.setAttribute('aria-hidden', 'true'); } } // BB: the hidden legacy link is no keyboard stop (the Menu has Back)
      }
    } catch (e) { /* the isles work without the shared menu */ }
  }
  // BB: the shared Settings sheet (SETTINGS-WIRING.md). The Log tab keeps its own feedback box, so the sheet mounts without one.
  // Live changes: one-thumb, sound and music apply at once; low graphics / reduce motion reshape the island on its next load.
  if (window.MMSettings) {
    try { SET = window.MMSettings.mount({ page: 'isles', feedback: false }); } catch (e) { SET = null; }
  }
  function openSettings() { if (!SET) { openPanel('log'); return false; } if (!panel.hidden) closePanel(); paused = false; SET.open(); cue('ui_open'); return true; }
  window.addEventListener('mm-settings-change', (e) => {
    const d = e && e.detail || {}, v = !!d.value;
    if (d.id === 'one-thumb') setOneThumb(v);
    else if (d.id === 'auto-fire' || d.id === 'aim-toggle') { ONE_THUMB = OT_KEYS.every((k) => { try { return S.getItem(k) === '1'; } catch (er) { return false; } }); applyOneThumb(); }
    else if (d.id === 'sound' && sfx) { sfx.setMuted(!v); if (v) cue('confirm'); }
    else if (d.id === 'music' && sfx) { sfx.setMusic(v); if (v) sfx.music(HOME ? 'hub' : 'realm'); }
    else if (d.id === 'low-gfx' || d.id === 'reduce-motion') { if (window.MMSettings && window.MMSettings.toast) window.MMSettings.toast('Applies when the island next loads.'); }
  });
  // BB: music (off by default, the shared Music setting) can only start from a gesture: the first tap or key asks for this island's cue
  if (sfx) {
    const startMusic = () => { window.removeEventListener('pointerdown', startMusic, true); window.removeEventListener('keydown', startMusic, true); try { if (sfx.musicOn) sfx.music(HOME ? 'hub' : 'realm'); } catch (e) { /* ignore */ } };
    window.addEventListener('pointerdown', startMusic, true); window.addEventListener('keydown', startMusic, true);
  }

  // ---------- test handle ----------
  if (TEST) {
    const snap = () => ({ x: hero.x, y: hero.y, tx: tileOf(hero.x), ty: tileOf(hero.y), hp: hero.hp, maxHp: hero.maxHp, scale: hero.scale, dead: hero.dead,
      terrain: NAMES[O.tileAt(world, tileOf(hero.x), tileOf(hero.y))] });
    window.__isles = {
      sounds: () => SOUNDS.slice(), settings: () => (SET ? { open: SET.isOpen() } : null), feedLabel: () => btn.feed.textContent, // BB
      world: world, pack: PACK_ID, isle: ISLE, seed: SEED, tile: TILE, art: ART, low: LOW, hero: snap, heroInfo: () => Object.assign({}, HERO), packSpecies: PACK_SPECIES.slice(),
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
        prog: c.tm ? c.tm.prog : 0, need: c.tm ? c.tm.need : 0, src: c.src, drawn: c.drawn, act: c.act, dir: c.dir, rare: !!c.rare, variant: c.variant || '' })),
      // PNG creature strips (b31a / b32) and b33 props: readiness, what was drawn, death strips shown, props baked from PNG vs code
      stripsReady: () => (STRIPS ? STRIPS.ready.then(() => ({ on: true, kinds: STRIPS.kinds.filter((k) => STRIPS.has(k)), count: STRIPS.count() })) : { on: false, kinds: [], count: 0 }),
      // a baked strip's drawn size in native px (AW3 size-class checks), or null when that creature has no PNG set
      stripSize: (kind, act, dir) => { const s = STRIPS && STRIPS.has(kind) ? STRIPS.get(kind, act || 'idle', dir | 0) : null; return s ? { id: s.id, w: s.w, h: s.h, ax: s.ax, ay: s.ay, top: s.top, span: s.span } : null; },
      propsReady: () => (IA ? IA.ready.then(() => ({ props: IA.propsActive() ? Object.keys(IA.props()).sort() : [], tiles: IA.active() })) : { props: [], tiles: false }),
      propsBaked: () => Object.assign({}, propsBaked),
      craftIcons: () => Object.keys(craftIcon).sort(),
      isleArt: () => (IA ? IA.ready.then(() => ({ pack: IA.pack, tiles: IA.active(), props: IA.propsActive() ? Object.keys(IA.props()).sort() : [] })) : { pack: '', tiles: false, props: [] }),
      deathsShown: () => deathsShown,
      render: () => { render(); return true; },
      face: (x, y) => { const l = Math.hypot(x, y) || 1; hero.face.x = x / l; hero.face.y = y / l; return true; },
      spawn: (sp, tx, ty) => (SPAWNABLE.indexOf(sp) >= 0 && creatures.length < CAP ? addCreature(sp, (tx + 0.5) * TILE, (ty + 0.5) * TILE, -1).uid : null),
      flags: () => ({ tame: TAME, companions: COMPANIONS, mounts: MOUNTS, saddles: SADDLES }),
      anger: (id) => { const c = creatures.find((x) => x.uid === id); if (c) c.angry = 30; return !!c; },
      soothe: (on) => { if (!TAME) return false; soothe = on !== false; setIco(btn.soothe.querySelector('.ico'), soothe ? 'ui_tranq_on' : 'ui_tranq_off'); return soothe; },
      feed: () => feed(),
      pouch: () => Object.assign({}, pouch),
      // IF1
      foodFor: (kind) => { const d = CR.get(kind); return d ? foodOf(d) : null; },
      reserve: () => feedReserve(),
      foodGlints: () => FOOD_GLINTS.map((f) => Object.assign({}, f)),
      sparkle: () => (sparkle ? { x: sparkle.x, y: sparkle.y, kind: sparkle.kind, ready: nodeReady(sparkle) } : null),
      sparkles: () => (save.spark && save.spark.n ? save.spark.n[ISLE] | 0 : 0),
      rest: () => ({ mode: restMode, spot: inWorld(tileOf(hero.x), tileOf(hero.y)) && RESTT[tileOf(hero.y) * W + tileOf(hero.x)] === 1, hurtAgo: simT - lastHurtT, sinceReward: simT - lastRewardT, told: restS ? restS.told : false }),
      restSpot: (want) => { // a walkable rest tile (want true) or a tile away from every rest spot (want false), with walkable neighbours
        for (let y = 3; y < H - 3; y++) for (let x = 3; x < W - 3; x++) {
          let ok = true;
          for (let dy = -1; dy <= 1 && ok; dy++) for (let dx = -1; dx <= 1 && ok; dx++) if (!walkableAt(x + dx, y + dy) || heroSolidAt(x + dx, y + dy) || (RESTT[(y + dy) * W + x + dx] === 1) !== !!want) ok = false;
          if (ok && (want || !(world.dock && Math.hypot(x - world.dock.x, y - world.dock.y) < 6))) return { x: x, y: y };
        }
        return null;
      },
      urlLocked: URL_LOCKED,
      restPoints: () => { const o = []; for (let y = 1; y < H - 1 && o.length < 800; y += 2) for (let x = 1; x < W - 1 && o.length < 800; x += 2) if (RESTT[y * W + x] === 1 && walkableAt(x, y) && !heroSolidAt(x, y)) o.push({ x: x, y: y }); return o; },
      party: () => party.map((p) => ({ id: p.ent.id, sp: p.ent.sp, x: p.cs.x, y: p.cs.y, mode: p.cs.mode, hits: p.cs.hits || 0, dmg: p.dmg, down: p.cs.down })),
      ride: () => toggleRide(),
      riding: () => (ride ? { id: ride.id, speed: ride.m.speed, lift: ride.m.lift, overlay: CMP.overlay(ride, false).dy, drawn: rideDrawn, saddle: saddleDrawn, seatY: rideLift, seatX: rideDx } : null),
      mountId: () => (mountEnt ? mountEnt.id : null),
      // XW1
      ability: () => (abil ? { id: abilDef.id, name: abilDef.name, kind: abilDef.kind, ph: abil.ph, cd: abil.cd, t: abil.t, breath: abil.breath, uses: abilUses, ready: MA.ready(abil),
        speed: abilSpeed, warm: abilWarm, platform: abilPlatform, pass: NAMES.filter((n, i) => PASS_T[i] === 1), noSlow: NAMES.filter((n, i) => NOSLOW_T[i] === 1), on: ABIL } : { id: null, on: ABIL }),
      useAbility: () => useAbility(),
      abilityLog: () => ABIL_LOG.slice(),
      events: () => EVENTS.map((e) => ({ t: e.t, kind: e.kind })),
      stun: (id) => { const c = creatures.find((x) => x.uid === id); return c ? c.stun || 0 : null; },
      tames: () => JSON.parse(S.getItem(TAMES.KEY) || 'null'),
      tamesLive: () => JSON.parse(JSON.stringify(tames)),
      hurtLog: () => HURT_LOG.slice(),
      simT: () => simT,
      setTime: (t) => { simT = Number(t) || 0; hero.t = simT; return simT; }, // PI2: one sim time on two pages (seeded frame comparisons)
      hint: () => hintText(TAME ? feedTarget() : null),
      nextTo: (id, dx) => { const c = creatures.find((x) => x.uid === id); if (!c) return null; hero.x = c.x + (Number(dx) || 0); hero.y = c.y; return snap(); },
      clearCreatures: () => { creatures = []; rare.live = 0; groupState.forEach((s) => { s.alive = 0; s.until = clock.now() + 1e9; }); },
      spawnTick: () => { spawnTick(); return creatures.length; },
      fire: (dx, dy) => { hero.cd = 0; return fire(dx, dy); },
      // PI2: the graphics tier and the access state (sparks = glints drawn in the last frame, -1 when uncapped)
      gfx: () => ({ tier: GFX.tier, low: GFX_LOW, dpr: DPR, sparks: GFX.sparks === Infinity ? null : GFX.sparks, ghosts: deadPool.length, terrainAnim: GFX.terrainAnim,
        aiHz: GFX.aiHz, fogHz: GFX.fogHz, shadows: GFX.shadows, still: STILL, sparksDrawn: sparksDrawn, partySteps: partySteps, fogCalls: fogCalls, cap: CAP }),
      access: () => ({ oneThumb: ONE_THUMB, reduced: REDUCED, autoN: autoN, abilityBy: btn.ability.parentNode ? btn.ability.parentNode.id : '' }),
      setOneThumb: (on) => setOneThumb(on),
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
      openPanel: (k) => { openPanel(k === 'sail' ? 'sail' : k === 'craft' ? 'craft' : k === 'decor' && HOME ? 'decor' : k === 'trophy' && HOME ? 'trophy' : 'log'); return panelKind; },
      // X7
      decorCraft: (k) => doDecorCraft(k),
      penNames: () => guests.map((q) => ({ id: q.id, sp: q.sp, nm: q.nm })),
      hp: () => ({ hp: hero.hp, maxHp: hero.maxHp, saved: save.hp === undefined ? null : save.hp }),
      hurt: (n) => { hero.iframes = 0; hurtHero(Number(n) || 0); return hero.hp; },
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
      // X1
      rare: () => ({ spot: rare.spot ? Object.assign({}, rare.spot) : null, live: rare.live, done: rare.done, n: rare.n,
        alive: creatures.filter((c) => c.rare).length }),
      swimAt: (tx, ty) => swimAt(tx, ty),
      terrainName: (tx, ty) => tileName(tx, ty),
      walkable: (tx, ty) => walkableAt(tx, ty),
      heroSolid: (tx, ty) => heroSolidAt(tx, ty),
      isSolid: (tx, ty) => solidAt(tx, ty),
      kindDef: (k) => { const d = CR.get(k); return d ? { id: d.id, biome: d.biome, tameable: !!d.tame } : null; },
      command: () => cycleCommand(),
      icons: () => ({ loaded: Object.keys(iconOk).sort(), shown: Array.prototype.map.call(document.querySelectorAll('.ico.on'), (e) => e.dataset.ico) }),
      meters: () => { drawHud(); const o = {}; Object.keys(meters).forEach((k) => { o[k] = meters[k].hidden ? null : meters[k].querySelector('.val').textContent; }); return o; },
      // find a tile of terrain `name` that has a walkable neighbour (a shore tile), for the swim tests
      // X4
      inv: () => Object.assign({}, save.inv),
      unlock: () => save.unlock.slice(),
      isleOpen: (id) => isleOpen(id),
      give: (id, n) => invAdd(id, n === undefined ? 1 : Number(n)),
      craft: (id) => doCraft(id),
      canCraft: (id) => (CRAFT ? CRAFT.canCraft(save.inv, id) : null),
      nodes: () => nodes.map((n) => ({ i: n.i, x: n.x, y: n.y, kind: n.kind, ready: nodeReady(n), picks: n.picks, respawn: RESPAWN[n.kind] })),
      picked: () => picked,
      drops: () => DROP_LOG.slice(),
      saddles: () => ({ on: SADDLES, gift: saddleGift, sg: save.sg === 1 }),
      // X6
      boss: () => ({ id: BOSS_ID, on: BOSSES, site: bossSite ? { x: bossSite.x, y: bossSite.y, px: bz.sx, py: bz.sy } : null, arenaR: ARENA_R,
        st: bz.st ? bz.st.st : null, done: bz.done, hp: bz.st ? bz.st.hp : 0, hpMax: bz.st ? bz.st.hpMax : 0, phase: bz.st ? bz.st.phase : -1, phaseName: bz.phaseName,
        engaged: bz.engaged, x: bz.x, y: bz.y, tameable: BOSS_TAMEABLE, feedable: bossFeedable(), bar: !bossBar.hidden, rm: bz.rm,
        tele: bz.tele.map((t) => ({ id: t.id, atk: t.atk, shape: t.zone.shape, windup: t.windup, t0: t.t0, drawn: t.drawn, zone: Object.assign({}, t.zone) })),
        live: bz.live.map((L) => ({ id: L.id, atk: L.atk, t0: L.t0, dur: L.dur, done: L.done, zone: Object.assign({}, L.zone) })),
        tame: bz.st && bz.st.tame ? { st: bz.st.tame.st, how: bz.st.tame.how, torpor: bz.st.tame.torpor, torporMax: bz.st.tame.torporMax, prog: bz.st.tame.prog, need: bz.st.tame.need, asleep: bz.ko } : null,
        arenaSrc: arenaSrc, arenaDrawn: arenaDrawn, reduced: REDUCED, tg: Object.assign({}, BOSS_TG), src: bz.src, drawn: bz.drawn, sk: bz.sk }),
      bossLog: () => JSON.parse(JSON.stringify(BOSS_LOG)),
      // TD1
      td: () => ({ night: tdNight(), nightK: nightK(), aurora: AUR_ON, auroraDrawn: auroraDrawn, dayLen: DAY_LEN, dusk: DUSK,
        ice: { on: THIN_ICE, tile: ice.tile, t: ice.t, warnN: ice.warnN, made: ice.made, live: ice.n, drawn: crackDrawn, slow: THIN_SLOW },
        soak: { t: soak.t, n: soak.n }, glints: GLINTS.map((q) => ({ i: q.i, x: q.x, y: q.y, item: q.item, night: q.night, live: glintLive(q), taken: glintTaken(q) })),
        air: { arrow: airArrow.on, ang: airArrow.ang, tiles: airArrow.tiles, warnAt: AIR_WARN, low: !!envS.warnO, empty: !!envS.emptyO },
        launch: { on: launch.on, t: launch.t, n: launch.n, skipped: launch.skipped, url: launch.url, sec: LAUNCH_SEC },
        rare: RARE_VAR ? { v: RARE_VAR.v, name: RARE_VAR.name, item: RARE_VAR.item, night: RARE_VAR.night } : null, reduced: REDUCED }),
      cracked: (tx, ty) => crackedAt(tx, ty),
      moveScale: (tx, ty) => moveScaleAt(tx, ty),
      findTerrain: (name, walk) => { const want = O.TERRAIN_ALL[name]; for (let y = 4; y < H - 4; y++) for (let x = 4; x < W - 4; x++) if (world.terrain[y * W + x] === want && (!walk || (walkableAt(x, y) && !heroSolidAt(x, y)))) return { x: x, y: y }; return null; },
      // XB
      bossSig: () => (bz.st ? { id: BOSS_ID, heads: bz.st.heads ? bz.st.heads.slice() : null, springs: bz.st.springs ? bz.st.springs.map((p) => Object.assign({}, p)) : null,
        ice: bz.st.ice.map((p) => ({ id: p.id, ttl: p.ttl, zone: Object.assign({}, p.zone) })), sub: bz.st.sub, dig: bz.st.dig, rematch: bz.st.rematch, rm: bz.rm, onIce: bz.onIce,
        scale: hero.scale, hint: BOSS.hint(BOSS_ID), sigs: BOSS.signatures(BOSS_ID), told: Object.keys(bz.told) } : { id: BOSS_ID, rm: bz.rm, done: bz.done }),
      bossHitHead: (n, head) => bossHit(Number(n) || 0, false, Number(head)),
      trophies: () => Object.assign({}, save.trophies || {}),
      pedestal: () => (pedestal ? { x: pedestal.x, y: pedestal.y, px: (pedestal.x + 0.5) * TILE, py: (pedestal.y + 0.5) * TILE, near: nearPedestal(), drawn: pedDrawn, btn: !btn.trophy.hidden } : null),
      rematchList: () => RM_BOSSES.map((id) => ({ id: id, can: canRematch(id), trophy: trophyOf(id), tier: ISL.trophyTier(save, trophyOf(id)) })),
      rematch: (id) => startRematch(String(id)),
      rematchWins: () => rmWins,
      bossSpawn: () => { if (!BOSS_ID) return false; if (!bz.st) { bz.done = ''; spawnBoss(); } return !!bz.st; },
      bossHit: (n, sooth) => bossHit(Number(n) || 0, sooth === true),
      bossFeed: () => bossFeed(),
      // stand in for the b33 ring PNG (a code-drawn 128x128 image) to check the art path; false goes back to the code ring
      arenaArt: (on) => {
        if (!on) { arenaImg = null; return false; }
        const cv = mk(128, 128), c = cv.getContext('2d'); c.strokeStyle = '#c8a060'; c.lineWidth = 6; c.beginPath(); c.arc(64, 64, 58, 0, Math.PI * 2); c.stroke();
        arenaImg = { img: cv, w: 128, h: 128, ax: 64, ay: 64 }; return true;
      },
      place: (x, y) => { hero.x = Number(x) || 0; hero.y = Number(y) || 0; revealFog(); return snap(); },
      heal: () => { hero.hp = hero.maxHp; hero.dead = false; hero.iframes = 0; return hero.hp; },
      heroLost: () => heroLost,
      // X5
      env: () => { drawHud(); return { rules: Object.assign({}, ENVR), on: ENV_ON, warmT: envS.warmT, o2T: envS.o2T, warm: envS.warm ? Object.assign({}, envS.warm) : null,
        o2: envS.o2 ? Object.assign({}, envS.o2) : null, move: envS.move, grav: Object.assign({}, GRAV), lost: envS.lost, sheltered: sheltered(),
        hud: { box: !envEls.box.hidden, warm: envEls.warm.hidden ? null : envEls.warm.querySelector('.val').textContent, o2: envEls.o2.hidden ? null : envEls.o2.querySelector('.val').textContent,
          warmWarn: envEls.warm.classList.contains('warn'), o2Warn: envEls.o2.classList.contains('warn') } }; },
      envSet: (w, o) => { envS.warmT = Math.max(0, Number(w) || 0); envS.o2T = Math.max(0, Number(o) || 0); envS.o2Hurt = ENV && ENVR.oxygen ? ENV.oxygen(envS.o2T, false, invCount('o2_tank') > 0).hurt : 0; return true; },
      // a walkable tile (with walkable neighbours) that is sheltered (want true) or exposed (want false)
      findEnvTile: (want) => {
        for (let y = 4; y < H - 4; y++) for (let x = 4; x < W - 4; x++) {
          let ok = true;
          for (let dy = -1; dy <= 1 && ok; dy++) for (let dx = -1; dx <= 1 && ok; dx++) if (!walkableAt(x + dx, y + dy) || heroSolidAt(x + dx, y + dy) || (!!SHELTER && SHELTER[(y + dy) * W + x + dx] === 1) !== !!want) ok = false;
          if (ok) return { x: x, y: y };
        }
        return null;
      },
      findShore: (name) => {
        const want = O.TERRAIN_ALL[name];
        for (let y = 3; y < H - 3; y++) for (let x = 3; x < W - 3; x++) {
          if (world.terrain[y * W + x] !== want) continue;
          if (walkableAt(x - 1, y) && !solidAt(x - 1, y)) return { x: x, y: y, lx: x - 1, ly: y };
        }
        return null;
      },
    };
  }
}());
