# Biome Archipelago: architecture and build plan

Owner direction: biome islands (Jungle, Ice, Reef, Mars, plus the existing Realm), cozy Animal Crossing routines, and ARK-style PvE where big creatures can be fought or **tamed** (companions, mounts), with a home island that has a stable and light building. AGENTS.md rules apply: LIVE DB untouched, saves additive, no feature removed, original art, Codex on `codex/<topic>`, `node game/tests/run-all.js` green before every merge.

## 1. Architecture

### 1.1 Recommendation: a new page `game/games/archipelago/`, sharing the arena and the pure modules
Do **not** grow `games/mad-maze/realm-world.js`. It has 1,918 lines, around 20 `?x=0` switches and some 35 `world-*.test.js` suites pinned to its behaviour. The Realm-only pieces (Nexus, boss keys, lairs, Lantern stash, quests) do not belong on a jungle island. The new page reuses the following:

| Reused as-is | Role on the archipelago page |
|---|---|
| `realm.js` `RealmArena` | combat, bullets, statuses, focus, telegraphs, perf guard, through `setWorld` / `setMode('world')` |
| `mm-overworld.js` | island terrain, through a new optional `opts.pack` (1.2) |
| `mm-zones.js` `createSpawner`, `rollDrop`, `statMultipliers` | interest-culled spawning; groups carry a creature id |
| `mm-fog.js`, `mm-pickups.js`, `mm-status.js`, `mm-telegraph.js`, `mm-perf.js`, `mm-access.js`, `motion.js` | unchanged |
| `mm-art.js` `loadAll(root, {only})` | creature strips by id, once art exists |
| `mm-profile.js` | READ-ONLY active hero (class, level) |

New files on the page:
- `games/archipelago/index.html`
- `archipelago.css`
- `archipelago.js`: boot, hero, UI, the `?test=1` handle `window.__isles`
- `isle-world.js`: global `IsleWorld`, the island controller
- `isle-creatures.js`: global `IsleCreatures`, which wires creatures, taming, companions and mounts into the arena hooks

`isle-world.js` copies the *pattern* of `realm-world.js` (chunk LRU of 512x512 canvases, minimap, spawner tick, `hooks` object), not its code. Chunk baking moves into a new pure-ish `shared/mm-chunk-bake.js` with `bakeChunk(ctx, terrain, w, cx, cy, palette, tileArt)`. `realm-world.js` keeps its own copy and is never touched. A later optional migration can happen behind its tests.

The page loads **no Firebase, no `net.js`, no Phaser**. A grep test asserts this (see 5).

### 1.2 Biome packs without changing old seeds
New pure module `shared/mm-biome-packs.js` (UMD `MMBiomePacks`). A pack is pure data:

```js
{ id: 'jungle', name: 'Verdant Isle', size: 160, bands: [{id:0,name:'beach',dwMin:.62,dwMax:.97}, ...4 bands],
  terrain: ['jungle_floor','vine_thicket','mud','river_reed','canopy_rock','ruin_moss'],   // names appended to MMOverworld.TERRAIN
  classify: [ /* per band: ordered rules [field, op, value, terrainName], last = default */ ],
  palette: { jungle_floor: ['#3f7a35','#376d2f','#4a8740','#285423'], ... },             // code fallback, PAL shape
  props: { jungle_floor: ['fern', .05], vine_thicket: ['liana', .06], mud: ['puddle', .02] },
  creatures: { 0: ['parrotlet','shellback'], 1: ['raptor_jr','boarhog'], 2: ['raptor','stegolith'], 3: ['rex_alpha'] },
  bosses: { 2: ['canopy_queen'], 3: ['rex_alpha'] }, portals: [], hazards: { mud: { slow: .6 }, river_reed: { slow: .8 } },
  water: { shallowWalk: true, deepSwim: 'swim' } }
```

Rules for `mm-overworld.js`:
1. **Append only.** New terrain ids start at 18 (`jungle_floor: 18 ...`), so `TERRAIN_NAMES` indices 0..17 never move.
2. `generate(seed, opts)` with **no `opts.pack` runs the exact current code path.** Internally the body becomes `generateWith(seed, opts, P)`. `P = REALM_PACK` is built from today's constants: `ZONE_BANDS_*`, `CREATURE_TIERS*`, `BOSSES`/`BOSS_POOLS`, `PROP_RULES`, and the hard-coded classifier, kept as a function `classifyRealm(z, m, det, dw)`. Every draw stays in today's order. Packs use a table classifier.
3. Pack worlds get a namespaced seed string `seedStr = pack.id + '|' + seed`, so Jungle 123 and Realm 123 are unrelated. They also carry `world.pack = pack.id`. Realm worlds keep no `pack` key, so the `fnv` input is unchanged.
4. `verify()` forwards `pack` (and, while there, the already-missing `roster`/`bosses` flags) only when the world has them. Its creature check reads the pack table for pack worlds.
5. Existing switches keep working: `bands: 'classic'`, `roster: 'classic'`, `bosses: 'classic'`. Packs ignore them.
6. **Golden guard first.** Before the refactor, slice A1 records `tests/fixtures/overworld-golden.json` from current master. It holds `O.hash()` for 24 seeds x {default, `bands:'classic'`, `roster:'classic'`, `bosses:'classic'`, `size:128`}. The new test `shared-mm-overworld-golden.test.js` must match it byte for byte, before and after.

### 1.3 Islands and travel
New pure `shared/mm-isles.js` (`MMIsles`) holds the archipelago graph and its save cleaner:

```js
ISLES = { home: {pack:'home', size:96, fixedSeed:true}, jungle: {pack:'jungle', unlock:null},
  ice: {pack:'ice', unlock:{tamed:3}}, reef: {pack:'reef', unlock:{mount:'swim'}}, mars: {pack:'mars', unlock:{item:'rocket_core'}},
  realm: {external:'../mad-maze/index.html?mode=world'} }
ROUTES = [['home','jungle','boat'], ['home','ice','boat'], ['home','reef','boat'], ['home','mars','rocket'], ['home','realm','portal']]
```

- **Boat.** A dock prop is stamped on each island's beach band. Its site is found like the portal sites, and the pack sets `dock: true`. Using it opens a DOM "sea chart" with the unlocked routes. Travel is an **in-page swap** via `IsleWorld.travel(isleId)`. It saves the current position and fog, then runs `arena.setWorld(null)` and `create()` for the next island, then `setWorld(new)`. The hero's hp, focus, companions and mount persist because the arena object lives on. Chunks and the spawner are rebuilt.
- **Rocket (Mars).** The same swap, behind a crafted unlock. Mars hazards: `moveScaleAt` gives low-gravity drift (x1.15 speed, dash +40%), and a pure `oxygen(t, inDome)` meter refills at dome props.
- **Portal (Realm).** A real navigation to `mad-maze/index.html?mode=world&from=isles`, after saving `returnTo: {isle, x, y}` in `pixeltown-archipelago-v1`. On return, `archipelago/index.html?from=realm` restores it. This mirrors the Realm's own `RETURN_RE` / `safeReturn` (shield + nearest free tile). `realm-world.js` needs **no change**: its existing "leave" goes to town. A "back to isles" link is an optional later RW slice.
- **Town link.** The first playable adds only a hub node: `mm-map.js` gets `N('w7-isles', 'game', ...)`, and `hub/hub.js` `LINKS` gets `'w7-isles': '../games/archipelago/index.html?from=hub'`. A Hearthvale dock signpost in `main.js` comes later. It is purely local: a `window.location` navigation like `useDoor()`, no `net.*` call, and its own slice in a main.js wave.

## 2. Creature and taming engine

### 2.1 `shared/mm-creatures.js` (`MMCreatures`, pure data + validate)
```js
raptor: { id:'raptor', name:'Fern Raptor', isle:'jungle', tier:2, size:'L',   // S 48px / M 64 / L 96 / XL 128 display
  hp: 60, dmg: 1.3, speed: 1.25, rad: 22,                                       // multipliers on the zone stats; rad = hit radius px
  behaviour: 'hostile',                                                          // passive | neutral | hostile | boss
  attack: { base:'aimed', pattern:'pounce', windup:.45 },                       // base = realm.js type that owns shards/xp/kb counters
  flee: .25, aggroR: 260, leashR: 700,
  tame: { method:'knockout', torpor: 90, diet:['meat','berry'], feedEvery: 6, need: 5, imprint: true },
  ride: { saddle:'saddle_raptor', speed:1.45, dash:'leap', swim:false, lift: 18 }, companion: { dps: 6, range: 40, role:'melee' },
  art: { id:'raptor', code:'biped' } }
```

Behaviours:
- **passive** wanders and flees when hit.
- **neutral** fights only after being hit.
- **hostile** aggros inside `aggroR`.
- **boss** uses the existing boss path (`spawnEnemy('boss')` plus the art id).

`validate()` checks every field, that diet ids exist in `MMItems` or a new `FOOD` table, that sizes are `S|M|L|XL`, and that `base` is one of `spiral|aimed|ring|boss`.

Jungle first-playable roster (6):
- `parrotlet` S passive, befriend
- `shellback` M passive, befriend (fetches pickups)
- `boarhog` M neutral, knockout
- `raptor_jr` M hostile, knockout
- `raptor` L hostile, knockout, rideable
- `stegolith` XL neutral, knockout, rideable, slow tank
- Boss `canopy_queen`: not tameable in v1

### 2.2 Tame state machine: `shared/mm-tame.js` (`MMTame`, pure, seeded)
States: `wild -> ko | calm -> taming -> tamed`, plus `failed` (back to `wild`).

```js
state = { st:'wild', torpor:0, prog:0, fed:0, lastFeed:-1, scare:0, eff:1, wakeAt:0 }
step(def, state, input, dt) -> { state, events: ['ko','wake','fed','progress','tamed','fail'] }
input = { torporHit:n, dmg:n, hpFrac:f, playerDist:px, offer:'berry'|null, tSec }
```

- **knockout.** "Soothe" damage (a tame-tool bolt, `?tame=` weapon spec `soothe`, or class signatures marked `soothe`) adds torpor. Normal damage adds 0.3x torpor. KO happens when `torpor >= def.tame.torpor` **or** when a lethal hit lands with torpor at or above 40%: the `onLethal` hook (2.4) keeps the creature at 1 hp, KO'd. A KO'd creature stops moving and firing and wakes after 40 s minus torpor decay.
- **befriend (calm).** Approach within 90 px without dealing damage. Every `offer` of a diet item sets `fed++`. Damaging it or dashing near it adds `scare`. Too much scare flees and fails.
- **taming.** Progress `prog += feedValue * eff` per feed, with `feedEvery` seconds between feeds. Effectiveness `eff` drops 0.1 per hit taken while KO'd, which is the ARK lesson that protecting your tame matters. Progress reaching `need` means tamed. The resulting bond level is `1 + floor(eff * 4)`.
- **Determinism.** Wake timers and fail rolls use `MMRng.create(seed + ':tame:' + wildId)`. Same inputs give the same outcome, so balance can be simulated in node.

### 2.3 Companions and mounts: `shared/mm-companion.js` (`MMCompanion`, pure)
```js
update(c, ctx, dt) -> intent { mx, my, face, hit: enemyIdx|-1, pick: pickupIdx|-1, sit:false }
c   = { id, sp, x, y, mode:'follow'|'attack'|'stay'|'fetch', tgt:-1, cd:0, hp, maxHp, down:0, think:0 }
ctx = { owner:{x,y}, enemies (read-only array), pickups, blocked(x,y), def }
```

Modes:
- **follow** keeps a leash ring of 48-96 px with an orbit offset per slot.
- **attack** picks the nearest awake hostile within 260 px of the owner, never one beyond the leash.
- **stay** holds an anchor.
- **fetch** goes to the nearest `mm-pickups` drop within 200 px, then returns.

Combat caps:
- A companion's hits go through the new `arena.damageEnemy(e, dmg, 'cmp')`.
- Its dps is scaled by bond level and capped at 35% of the hero's dps.
- It takes enemy bullets via a cheap circle test against `eBullets`, run every second frame.
- At 0 hp it is **down**: it fades, walks home to the stable on the next swap, and is ready again after 60 s. There is no permadeath, which follows the REALM-DESIGN s12 pet rule.

Cost caps (`MMCompanion.CAPS`):
- `MAX_ACTIVE = 2` (MMPerf `low` tier: 1).
- `THINK_HZ = 8`, round-robin with a staggered `think` offset; movement integrates every frame.
- `MAX_TAMES = 60`, and the stable shows 12 per page.
- Budget assertion: `update` for 2 companions over 72 enemies takes under 0.15 ms per frame in node.

Mounts are `MMCompanion.mount(def)`, which returns `{ speed, dash, swim, lift }`. `isle-world` applies them without touching the arena's movement:
- `moveScaleAt` returns `terrainK * mount.speed`.
- `solidAt` lets deep water through when `mount.swim`.
- The arena dash cooldown multiplier is set via the existing unlock-mod path (`setHeroSignature` is not needed; a one-field `dashMul` hook in 2.4).
- While riding, the hero cannot fire for 0.2 s after mounting and takes x0.8 damage. Dismount is the same action key. A downed mount throws the rider (0.5 s iframes).
- The rider overlay draws the mount in `drawMid` under the hero, and the hero is raised by `heroLift()` px.

### 2.4 Additive arena hooks (one RJ slice, every default `null` means today's behaviour)
`realm.js` is also loaded by the Town (`game/index.html`) and by duels and co-op. Every hook is opt-in through `setWorld` options, so the Town never passes them.

1. `setWorld({... enemyStep(e, dt, p) -> bool, onLethal(e, dmg) -> bool, drawEnemy(g, e) -> bool, drawMid(g, cam), heroLift() -> px, dashMul() -> k })`. The frozen `this.world` gains these keys.
2. In `_updateEnemies`, after the wake/status checks: `if (wd && wd.enemyStep && e.cre && wd.enemyStep(e, dt, p)) { clamp; solid slide; continue; }`. Built-in AI is skipped only for creatures.
3. In `_hitEnemy`, before `e.active = false` on both the normal and boss branches: `if (this.world && this.world.onLethal && this.world.onLethal(e, dmg)) { e.hp = 1; return; }`. Status DOT, signature AOE and weapon hits all already funnel through `_hitEnemy`. The test asserts each path.
4. Per-entity radius: a new `_er(e) = e.rad || RM_ENEMIES[e.type].r`. It replaces the ~10 `RM_ENEMIES[e.type].r` reads: hash insert, bolt hit, `_sigAoe`, telegraph ring, flash, art scale, ghost. `spawnEnemy` resets `e.rad = 0; e.cre = null; e.tame = null`. Creatures ride on a **base type** (`spiral|aimed|ring`), so `save.kb[e.type]`, shards and XP stay valid and the save format is unchanged.
5. Public `damageEnemy(e, dmg, src)`, which clamps to 1e6 and calls `_hitEnemy`. Also `tgFor(e, shape, sec)`, a thin wrapper over the TG3 `_tgSet` fields, so creature wind-ups reuse the existing telegraph sprites, accessibility colours and reduce-motion handling.

### 2.5 Big-creature rendering
- **Code placeholders first:** `shared/mm-creature-draw.js` (`MMCreatureDraw`).
  - `bake(def, scale) -> { frames: {idle:[cv x4], move:[cv x6], attack:[cv x5], ko:[cv]}, shadow: cv, ax, ay }` draws silhouettes per `art.code` body plan (`biped`, `quad`, `bird`, `shell`, `serpent`) in the pack palette.
  - Results are cached per `(id, sizeClass, dpr bucket)` and baked **once** at the display size, so `drawImage` never scales per frame.
  - A KO'd creature gets "zzz" bubbles plus a progress ring drawn from one cached ring sprite with `globalAlpha`.
- **Art later.** Strips follow ART-HANDOFF: 256 px cells for S/M and 384 px for L/XL, feet anchor. `MMArt.loadAll(root, {only: pack creature ids})` loads them, and they are pre-scaled into the same cache, so the code path and the art path draw identically.
- **Shadows:** one baked ellipse per size class, drawn in `drawMid`.
- **Hitboxes:** circles with `rad` S 12, M 18, L 26, XL 36. An XL body adds a second "tail" circle checked only by player bolts, inside the hook (`drawEnemy` handles visuals, `enemyStep` keeps `e.rad` as the body).
- **Telegraphs:** L/XL attacks always wind up via `tgFor` (pounce = line, stomp = ring 0.6 s, tail sweep = cone).
- **Budgets on phones:**
  - at most 24 active wild creatures (spawner `MAX_ACTIVE` overridden per pack)
  - at most 4 L/XL in view
  - creature `enemyStep` think at 10 Hz, staggered
  - eBullets capped by the existing fire budget (`EB_CAP` per band)
  - target: median frame under 20 ms at 390x844 with a 4x CPU throttle, the same probe as `world-perf.test.js`

### 2.6 Saves (additive keys, cleaned by owner modules)
`pixeltown-tames-v1`, owned by `shared/mm-tames.js` (`MMTames.clean/add/release/setParty`):

```js
{ v:1, n: 37, roster: [{ id:'t1a', sp:'raptor', nm:'Rex', lv:3, xp:120, bond:3, sad:'saddle_raptor'|null, isle:'jungle', d:'2026-11-21' }],
  party: ['t1a'], mount: 't1a'|null }
```

- Ids match `/^t[0-9a-z]{1,6}$/`, `sp` must be a known `MMCreatures` id, names are at most 16 characters (shown only via `textContent`).
- `lv` is capped 1..30, the roster at 60, and `party` at 2 ids that exist.
- An unknown `sp` is kept as inert, the same way stale tabs keep `wpn_` items: never deleted.
- Roughly 100 B per tame, so under 7 KB.

`pixeltown-archipelago-v1`, owned by `MMIsles.clean`:

```js
{ v:1, at:'home', returnTo:{isle,x,y}|null, isles:{ jungle:{ seed:'123', pos:{x,y}, fog:'<b64>', chests:[] } },
  unlock:['jungle'], home:{ grid:[[x,y,'fence']...<=400], stable:{ slots:12 } },
  log:{ seen:{raptor:1}, ko:{}, tamed:{}, bugs:{}, fish:{} }, wild:{ 'jungle:g12:3': {torpor, prog, eff, until} } }
```

- `wild` holds in-progress tames, at most 4, and each expires after 10 minutes. Reloading mid-tame therefore does not lose a KO.
- Fog per island is a 160/8 = 20x20 bitset, 52 B base64.
- Total stays under 20 KB.
- **Backup:** `mm-backup.js` `CLEANERS` gains both keys with their owner cleaners, plus labels ("Tamed creatures", "Archipelago progress"). Bundle format v2 is unchanged (keys are additive). The backup test proves an old v2 bundle without the keys restores unchanged.
- **Hero XP and shards** keep flowing through the arena's existing `onSave` into `pixeltown-save-v1.realm` exactly as on the Mad Maze page. `pixeltown-mm-v1` is read only.

### 2.7 Multiplayer: relay only, no database
- Wild creatures are simulated per client from the same seed, as world enemies are today. Taming is local: a tame belongs to the player whose client finished it.
- Later slice (not in the first playable): `mm-world-party.js` gains a 4th kind `cmp` (`{t:'cmp', s:seat, sp, x, y, m:mounted}`, 4 Hz, 512 B cap), sent over `MMPartyBC`. Old clients drop unknown kinds in `clean()`. Partners draw companions as cached ghosts. No `firebase`, socket or `fetch` code; this is grep-asserted, like `world-team.test.js`.

## 3. The cozy layer

- **Home island.** Pack `home`, size 96, a fixed seed (`'home'`), so every player gets the same calm beach. It has:
  - no hostiles, only parrotlets
  - a dock, a stable, a campfire and a 20x20 build grid
- **Building** uses a new pure `shared/mm-home-build.js` (`MMHomeBuild`). It **mirrors** the Town's build-mode materials as data:
  - `fence`, `hedge`, `lamp`, `path`, `wall`
  - plus `pen`, `trough`, `nest`, `saddle_rack`
  - same costs in wood, stone and flowers
  - same 10 s undo rule
  - It does **not** reuse `main.js` build mode, because that writes to the LIVE database through `net.placeBlock`. Placements live only in `pixeltown-archipelago-v1.home.grid`.
  - `canPlace(grid, x, y, kind)` and `cozy(grid)` (same idea as the Town home plot's cozy score) are pure and tested.
- **Stable.** Walking into the barn opens a DOM roster panel (tames, rename, set party and mount, release with a confirm). Benched tames wander inside pens with `MMCompanion` `stay` anchors, at most 6 drawn.
- **Villager-like NPCs.** "Mossa the Keeper" (stable hand) and "Professor Quill" (naturalist), each defined by a pure `routine(dayKey, hour) -> {spot, line}`. They work on the real UTC time, Animal Crossing style. Lines are chosen by a seeded hash of the day, so tests pin `?today=`. Quill reads the creature log and gives one daily request ("Show me a KO'd boarhog"). That request is a `MMQuests`-shaped entry in the archipelago save, not in the Realm quest key.
- **Seasons.** A tiny pure `MMSeason.of(dateKey)` returns `spring|summer|autumn|winter` with the same month split as the Town's seasonal recipes. Packs may list `seasonal: { winter: { palette overrides, creatures: +['frost_hare'] } }`. There are no gameplay penalties.
- **Collections.**
  - Creature log: seen, KO'd and tamed per species, for 6 jungle species, then all.
  - Bugs and fish on islands use their own small tables inside `log`. The Angler and Safari keys are **read-only**: the log only displays their counts and never writes them.
  - Hub medals: `hub/medals.js` `GAMES.isles = { node:'w7-isles', name:'Archipelago', medals:[['tame1','First tame'],['log6','Jungle log'],['ride1','First ride'],['stable5','Full stable']] }`. The archipelago page is the single writer of `pixeltown-medals-isles-v1`.
- **No decay timers.** Tames never starve, sulk or die, and diet only matters while taming. Treats give bond XP.

## 4. First playable: the Jungle vertical slice (10 slices)

Serial resources (at most one slice per sub-wave):
- **RJ** `game/realm.js`
- **RW** `realm-world.js` (not touched in this plan)
- **MM** `mad-maze.js`
- **DG** `dungeon.js`
- **TW** `game/main.js` + `game/index.html`
- **AP** `games/archipelago/*`
- **OW** `shared/mm-overworld.js`
- **BK** `shared/mm-backup.js`
- **HB** `hub/*` + `mm-map.js`

Every browser test does the following:
- opens `games/archipelago/index.html?test=1&offline=1` (or the existing page) with `blockDb(ctx)` and asserts `db.count() === 0`
- drives the game through `window.__isles` step functions, never through wall-clock waits
- is registered in `tests/test-tiers.json`: node tests `node`/`smoke`, page tests `browser`/`full`, and one page test in `smoke`

### Wave 1: pure modules, parallel, no art (code-drawn placeholders)
**A1 Golden guard and biome packs** (OW + new `mm-biome-packs.js`, M)
- The first commit adds `tests/fixtures/overworld-golden.json`, captured on unmodified master.
- Then: the `generateWith` refactor, `opts.pack`, appended terrain ids, and the `verify` forwarding.
- Tests:
  - `shared-mm-overworld-golden.test.js`: all 120 hashes are identical, and the existing `shared-mm-overworld.test.js` passes unchanged.
  - `shared-mm-biome-packs.test.js`:
    1. `generate('123', {pack: JUNGLE})` passes `verify().ok` for 30 seeds.
    2. Same seed twice gives the same hash.
    3. The Jungle hash for seed 123 differs from the Realm hash for 123.
    4. No terrain id below 18 is introduced by the jungle classifier except water and sand.
    5. Generating size 160 in node takes under 120 ms.
    6. Every spawn group's creature is in the pack table.

**A2 Creature data** (`mm-creatures.js`, S). Test `shared-mm-creatures.test.js`:
1. All 7 jungle defs pass `validate`.
2. `validate` rejects a bad size, base or diet.
3. Every rideable def has a `ride` block, and every L/XL def has `windup >= 0.4`.
4. `__proto__` and junk input gives null.

**A3 Taming engine** (`mm-tame.js`, M). Tests `shared-mm-tame.test.js` and `tame-balance-sim.test.js` (node, seeded):
1. A soothe-only fight KOs a raptor at exactly the torpor threshold.
2. A lethal hit at 40% torpor KOs instead of killing; at 39% it kills.
3. Feeding faster than `feedEvery` gives no progress.
4. A hit on a KO'd creature lowers `eff` by 0.1.
5. A befriend attempt fails after 3 scares.
6. Same seed and inputs produce the same event list.
7. The sim (1,000 seeded runs per species, simulated hero dps 10-30) puts the median time-to-tame in the band: S 20-45 s, M 40-90 s, L 70-150 s, XL 110-220 s. Results are logged to `STATUS.md`.

**A4 Companions and mounts** (`mm-companion.js`, M). Test `shared-mm-companion.test.js`:
1. `follow` settles within 96 px in 2 s of simulated time.
2. `attack` never targets beyond the leash.
3. `fetch` returns a pickup index and comes back.
4. `stay` drifts by 0 px.
5. A third active companion is refused (`MAX_ACTIVE`).
6. The node time budget assertion holds (2 companions, 72 enemies, 600 steps under 90 ms total).
7. `mount(def)` returns the declared speed, swim and lift, and a non-rideable def gives null.

**A5 Saves and backup** (`mm-tames.js`, `mm-isles.js`, BK, S). Tests `shared-mm-tames.test.js`, `shared-mm-isles.test.js`, and an extended `shared-mm-backup.test.js`:
1. Corrupt or hostile input recovers to defaults.
2. Caps hold: 60 tames, 2 in the party, 400 grid cells, 4 wild entries.
3. Unknown species are kept inert.
4. A round trip through `MMBackup.bundle/plan/apply` keeps both keys.
5. A v2 bundle without them restores byte-identical to before.
6. `pixeltown-save-v1` is never written.

**A6 Code-drawn creatures and jungle tiles** (`mm-creature-draw.js`, `mm-chunk-bake.js`, S). Test `shared-mm-creature-draw.test.js` on a stub canvas, as `shared-mm-fx-draw.test.js` does:
1. All 5 body plans bake every action without throwing.
2. Frames are cached: a second `bake` returns the same object.
3. Each size class has the right frame size (48/64/96/128 x dpr bucket).
4. `bakeChunk` writes only palette colours for a 16x16 jungle chunk.

### Wave 2a (parallel: disjoint serial resources)
**B7 Arena hooks** (RJ, M). Hooks 1-5 from 2.4. Test `arena-world-hooks.test.js`, run on `mad-maze/index.html?mode=world&test=1&offline=1` through `__mm.arena`:
1. With no hooks, `realm-core`, `world-page`, `class-fire` and `realm-boss` pass unchanged; Opus review is mandatory.
2. With `enemyStep` returning true, an enemy with `cre` set keeps its position for 60 frames and fires 0 bolts.
3. `onLethal` returning true leaves the creature at hp 1, `save.kills` unchanged, and no bag. This is checked for the bolt, status DOT and `_sigAoe` paths.
4. An `e.rad = 30` enemy is hit by a bolt at 28 px. A plain enemy at 28 px is not.
5. `damageEnemy` clamps 1e9 to 1e6.
6. The Town arena (`game/index.html`) never passes the hooks; grep-asserted that `main.js` has no `enemyStep`.

**B8 Archipelago page and Jungle island** (AP + HB, L). Files: `index.html`, `archipelago.js`, `isle-world.js`, `archipelago.css`, plus the hub node and `LINKS` entry.
- Scope:
  - generates the Jungle isle through A1
  - bakes chunks through A6, with a minimap and fog
  - spawns pack creatures as plain base-type enemies for now (they die when killed)
  - reads the hero read-only from `MMProfile`
  - switches: `?seed=`, `?isle=jungle`, `?art=0`, `?perf=low`
- Test `archipelago-page.test.js`:
  1. The page boots with zero console errors at 1000x700 and 390x844.
  2. `__isles.world.pack === 'jungle'` and `verify` is ok.
  3. The hero walks 10 tiles via `step()`. Mud slows it to 0.6.
  4. The spawner activates groups whose creature ids are all jungle ids.
  5. `blockDb` sees 0 requests, and the page source has no `firebase` or `net.js` (grep).
  6. The hub card for `w7-isles` links to the page (extends `hub-page.test.js`).

### Wave 2b
**B9 Creatures, taming, companions, mounts in play** (AP, L). File `isle-creatures.js`, which wires A2-A4 into the B7 hooks (behaviours, KO, feeding UI button, stable roster in memory, party of 2, mount and dismount, telegraphs via `tgFor`). Switches: `?tame=0` (creatures just die, Realm-style), `?companions=0`, `?mounts=0`.
- Tests:
  - `archipelago-tame-flow.test.js`:
    1. A parrotlet is befriended with 3 berry offers and appears in `pixeltown-tames-v1`.
    2. A raptor is KO'd with soothe bolts, fed 5 times, and tamed. Reloading mid-tame keeps its progress via `wild`.
    3. The tamed raptor follows, attacks a boarhog, and its damage shows in `damageEnemy` logs.
    4. Mounting a raptor sets `moveScale` to 1.45 and lifts the hero sprite by 18 px. Dismounting restores 1.
    5. `?tame=0` kills the raptor and writes no tames.
  - `archipelago-perf.test.js` (a `world-perf` clone): 24 creatures including 4 XL, plus 2 companions and 300 bullets at 390x844 with a 4x throttle; median under 20 ms, p95 under 34 ms.

### Wave 2c
**B10 Home island, travel, cozy hooks, medals** (AP + HB, L). Scope:
- the home pack with stable, pens and the A5 grid using `mm-home-build.js` (pure test `shared-mm-home-build.test.js` included)
- the dock, sea chart and in-page swap home <-> jungle, keeping hp, party and mount
- Mossa and Quill routines with `?today=` under `?test=1`
- the creature log panel
- medals written to `pixeltown-medals-isles-v1`, plus the `hub/medals.js` whitelist entry

Test `archipelago-home-travel.test.js`:
1. Travelling home -> jungle -> home keeps hero hp, both party members and the jungle position and fog.
2. Placing a fence and a pen persists across a reload; undo works within 10 s.
3. A benched tame appears in a pen.
4. Quill's line for `?today=2026-12-01` is deterministic and its season is winter.
5. Taming the first creature writes medal `tame1`, and the hub shows it.
6. No `pixeltown-save-v1` key other than `realm` changes.

Merge order: A1-A6 (any order, all parallel now) -> B7 and B8 -> B9 -> B10. Opus review is mandatory for A1 (seeds), A5 (saves), B7 (shared arena) and B9 (perf).

After the first playable come the Ice, Reef (swim mounts), Mars (rocket, oxygen) packs, then the `cmp` relay kind, then the Town dock signpost (TW wave, local navigation only), then the Codex art batches (`b3x-jungle-tiles`, `b3x-jungle-creatures` at 256/384 px cells, with separate effects).

## 5. Risks, mitigations, testing strategy

| Risk | Mitigation |
|---|---|
| **Old seeds shift** during the generator refactor | Golden fixture recorded before any edit (A1); packs use their own seed namespace; terrain ids append-only; `verify` forwards pack only when present |
| **realm.js regression** (Town, duels and co-op share it) | Every hook is null by default and only reachable via `setWorld`; creatures ride on base types, so `kb`/shards/XP/save are unchanged; B7 runs the realm and world suites plus a grep that the Town never passes hooks |
| **Phone perf** with 96-128 px sprites | Bake once at display size; one shadow sprite per class; at most 4 L/XL in view; 10 Hz staggered think; 2 companions (1 on MMPerf `low`); existing perf guard (0.75 backing) and fire budget; `archipelago-perf.test.js` gate |
| **Save size and corruption** | Two new keys under 30 KB in total; owner cleaners with hard caps; unknown species inert, never deleted; backup round-trip test; `pixeltown-save-v1` untouched except the existing `realm` field via the arena |
| **LIVE DB safety** | The page loads no Firebase, `net.js` or Phaser (grep test); `blockDb` in every browser test with a 0-request assertion; home building is local-only (never `net.placeBlock`); co-op only over BroadcastChannel via `MMWorldParty.clean`; no `main.js` edits in the first playable |
| **Test flakiness** | Pure step functions and seeded RNG everywhere; `__isles.step(mx, my, dt)` and `__isles.clock.set()` instead of sleeps; `?today=` pins the day; perf assertions use medians over at least 300 frames, the same as `world-perf`; tests are tiered so smoke stays around 6 minutes |
| **Taming balance** (grindy or trivial) | `tame-balance-sim.test.js` time-to-tame bands per size class; all numbers in `MMCreatures`/`MMTame.TABLES`, tuned without code changes |
| **Scope creep into realm-world.js** | RW is deliberately left out of this plan; the Realm link is a URL plus `returnTo` in our own key |

**Testing strategy summary**
- **Node (Wave 1):** schema, determinism, caps, golden hashes, the seeded taming sim, and companion time budgets.
- **Playwright (Wave 2):** one flow per slice, driven through debug step hooks, with `blockDb`. Screenshots at 390x844 and 1000x700 are attached to the PR.
- **Perf:** a CDP 4x throttle probe gates B9.
- **Whole suite:** `node game/tests/run-all.js` (port 8440) before every merge, with nothing skipped or weakened.
