# Biome Archipelago: architecture and build plan

Direction: biome islands (Jungle, Ice, Reef, Mars, plus the existing Realm), cozy Animal Crossing routines, and ARK-style PvE where big creatures can be fought or **tamed** (companions, mounts), on a home island with a stable and light building. AGENTS.md rules apply.

## 1. Architecture

### 1.1 A new page, `game/games/archipelago/`, not a bigger realm-world.js
`realm-world.js` (1,918 lines, ~20 switches, ~35 `world-*` suites, Realm-only Nexus/keys/lairs/stash/quests) stays untouched.

**What the new page reuses unchanged:**
- `realm.js` `RealmArena`, through `setWorld` and `setMode('world')`
- `mm-zones.js` (`createSpawner`, `rollDrop`, `statMultipliers`)
- `mm-fog`, `mm-pickups`, `mm-status`, `mm-telegraph`, `mm-perf`, `mm-access`, `motion`
- `mm-art.js` `loadAll(root, {only})`
- `mm-profile.js`, read only

**New files:**
- `index.html`, `archipelago.css`
- `archipelago.js`: boot, hero, UI, and the `?test=1` handle `window.__isles`
- `isle-world.js`: global `IsleWorld`, following the realm-world *pattern* (512 px chunk LRU, minimap, spawner tick, `hooks`).
- `isle-creatures.js`: global `IsleCreatures`, the creature wiring

Chunk baking becomes a new shared module, `shared/mm-chunk-bake.js` (`bakeChunk(ctx, terrain, w, cx, cy, palette, tileArt)`). realm-world keeps its own copy.

The page loads no Firebase, no `net.js` and no Phaser. A grep test enforces this.

### 1.2 Biome packs, with old seeds byte-identical
New pure data module `shared/mm-biome-packs.js` (`MMBiomePacks`):

```js
jungle: { id:'jungle', size:160, bands:[{id:0,name:'beach',dwMin:.62,dwMax:.97}, ...],
  terrain:['jungle_floor','vine_thicket','mud','river_reed','canopy_rock','ruin_moss'],
  classify:[ /* per band: ordered [field, op, value, terrainName] rules, last = default */ ],
  palette:{ jungle_floor:['#3f7a35','#376d2f','#4a8740','#285423'] },        // same shape as realm-world PAL
  props:{ jungle_floor:['fern',.05], vine_thicket:['liana',.06] },
  creatures:{0:['parrotlet','shellback'],1:['raptor_jr','boarhog'],2:['raptor','stegolith'],3:['rex_alpha']},
  bosses:{2:['canopy_queen']}, hazards:{ mud:{slow:.6} }, dock:true, water:{ deepSwim:'swim' } }
```

**Rules for the `mm-overworld.js` change:**
1. **Ids are append-only.** New terrain ids start at 18, so ids 0..17 and `TERRAIN_NAMES` order never change.
2. **No pack means today's code, exactly.** The body becomes `generateWith(seed, opts, P)`, and `generate(seed, opts)` with no `opts.pack` passes `REALM_PACK`. That pack is built from today's constants (bands, `CREATURE_TIERS*`, `BOSSES`/`BOSS_POOLS`, `PROP_RULES`) plus the hard-coded classifier, kept verbatim as `classifyRealm(z, m, det, dw)`. Every draw stays in its current order. Packs use a table classifier instead.
3. **Packs get their own seed space.** A pack world hashes `pack.id + '|' + seed` and records `world.pack`. Realm worlds get no `pack` key, so their `fnv` input does not change.
4. **`verify()` re-generates with the right options.** It forwards `pack`, and also the `roster`/`bosses` flags it currently drops, only when the world carries them.
5. **Existing switches still work.** `bands:'classic'`, `roster:'classic'` and `bosses:'classic'` (and their page switches) behave as before.
6. **Record the golden hashes first.** Slice A1 commits `tests/fixtures/overworld-golden.json`, captured from unmodified master before any code change. It holds `O.hash()` for 24 seeds x {default, bands classic, roster classic, bosses classic, size 128}.

### 1.3 Islands, travel, state, Town
New pure module `shared/mm-isles.js` (`MMIsles`): the island graph plus a save cleaner.

```js
ISLES = { home:{pack:'home',size:96,fixedSeed:true}, jungle:{pack:'jungle'}, ice:{pack:'ice',unlock:{tamed:3}},
  reef:{pack:'reef',unlock:{mount:'swim'}}, mars:{pack:'mars',unlock:{item:'rocket_core'}},
  realm:{external:'../mad-maze/index.html?mode=world'} }
ROUTES = [['home','jungle','boat'],['home','ice','boat'],['home','reef','boat'],['home','mars','rocket'],['home','realm','portal']]
```

**Boat.** Each island has a dock on its beach band, placed with the portal-site finder. The dock opens a DOM sea chart. Choosing a route runs `IsleWorld.travel(id)`, which swaps islands **in the same page**:
1. Save the current position and fog.
2. Call `arena.setWorld(null)`.
3. Create the next island and `setWorld` it.

The arena lives on, so HP, focus, companions and mount carry over.

**Rocket (Mars).** The same swap behind a crafted unlock; low gravity in `moveScaleAt` (x1.15, dash +40%) and a pure `oxygen(t, inDome)` meter.

**Portal (Realm).** A real page navigation:
1. Save `returnTo:{isle,x,y}` to `pixeltown-archipelago-v1`.
2. Go to `mad-maze/index.html?mode=world&from=isles`.
3. Coming back to `?from=realm` restores the island and position, with the Realm's `safeReturn` idea (a shield, then the nearest free tile).

No `realm-world.js` change is needed.

**Town.** First playable: a hub node only (`mm-map.js` `N('w7-isles','game',...)` + `hub.js` `LINKS`). A Hearthvale dock signpost comes later in its own `main.js` wave: a plain `location` navigation like `useDoor()`, no `net.*` call.

## 2. Creature and taming engine

### 2.1 `shared/mm-creatures.js` (`MMCreatures`: pure data plus `validate`)
```js
raptor: { id:'raptor', name:'Fern Raptor', isle:'jungle', tier:2, size:'L',  // display S 48 / M 64 / L 96 / XL 128 px
  hp:60, dmg:1.3, speed:1.25, rad:22, behaviour:'hostile',                   // passive | neutral | hostile | boss
  attack:{ base:'aimed', pattern:'pounce', windup:.45 }, aggroR:260, leashR:700, flee:.25,
  tame:{ method:'knockout', torpor:90, diet:['meat','berry'], feedEvery:6, need:5 },
  ride:{ saddle:'saddle_raptor', speed:1.45, dash:'leap', swim:false, lift:18 },
  companion:{ dps:6, range:40, role:'melee' }, art:{ id:'raptor', code:'biped' } }
```

**Behaviours:** `passive` wanders and flees; `neutral` fights once hit; `hostile` attacks inside `aggroR`; `boss` uses the arena's boss path.

**`base`** is the `realm.js` enemy type (`spiral`, `aimed` or `ring`) that the creature counts as for shards, XP and the `save.kb` counters.

**Jungle v1 roster:**
- parrotlet: S, passive, befriend
- shellback: M, passive, befriend; fetches loot
- boarhog: M, neutral, knockout
- raptor_jr: M, hostile, knockout
- raptor: L, hostile, knockout, rideable
- stegolith: XL, neutral, knockout, rideable tank
- canopy_queen: boss, not tameable

### 2.2 `shared/mm-tame.js` (`MMTame`: pure, seeded)
States: `wild -> ko | calm -> taming -> tamed`. A `failed` attempt returns the creature to `wild`.

```js
state = { st:'wild', torpor:0, prog:0, fed:0, lastFeed:-1, scare:0, eff:1, wakeAt:0 }
step(def, state, input, dt) -> { state, events:['ko','wake','fed','progress','tamed','fail'] }
input = { torporHit, dmg, hpFrac, playerDist, offer:'berry'|null, tSec }
```

**Knockout:**
- *Soothe* damage builds torpor in full. Sources: a tame tool (weapon spec `soothe`), or class signatures flagged `soothe`. Normal damage builds torpor at x0.3.
- The creature is KO'd when torpor reaches `def.tame.torpor`, or when a lethal hit lands while torpor is at least 40%. In that case the `onLethal` hook keeps it at 1 HP.
- A KO'd creature neither moves nor fires. It wakes after 40 s, minus torpor decay.

**Befriend (calm):**
- Stay within 90 px and deal no damage.
- Each diet `offer` counts as one feed.
- Hits and nearby dashes add `scare`. A third scare makes it flee, and the attempt fails.

**Taming:**
- Each feed adds `prog += feedValue * eff`, gated by `feedEvery`.
- Every hit a KO'd creature takes costs 0.1 `eff` (ARK's lesson: guard your tame).
- `prog >= need` tames it, with bond `1 + floor(eff * 4)`.

**Determinism:** rolls use `MMRng.create(seed + ':tame:' + wildId)`, so balance is simulated in node.

### 2.3 `shared/mm-companion.js` (`MMCompanion`: pure)
```js
update(c, ctx, dt) -> { mx, my, face, hit:enemyIdx|-1, pick:pickupIdx|-1 }
c   = { id, sp, x, y, mode:'follow'|'attack'|'stay'|'fetch', tgt:-1, cd:0, hp, maxHp, down:0, think:0 }
ctx = { owner:{x,y}, enemies, pickups, blocked(x,y), def }
```

**Modes:**
- `follow` keeps 48-96 px from the hero, at a per-slot orbit offset.
- `attack` targets the nearest awake hostile within 260 px of the owner, never beyond the leash.
- `stay` holds its anchor point.
- `fetch` collects the nearest pickup within 200 px and comes back.

**Combat:** hits go through `arena.damageEnemy(e, dmg, 'cmp')`, scaled by bond, capped at 35% of hero DPS. Enemy bolts are circle-tested every second frame. At 0 HP it is "down" (back to the stable, ready after 60 s); no permadeath (REALM-DESIGN s12 pet rule).

**Caps:**
- `MAX_ACTIVE` 2 (1 on the MMPerf low tier)
- `THINK_HZ` 8, staggered round-robin; movement still updates every frame
- `MAX_TAMES` 60
- In node, 2 companions against 72 enemies must cost under 0.15 ms per frame.

**Mounts.** `MMCompanion.mount(def)` returns `{speed, dash, swim, lift}`. `isle-world` applies it through hooks the arena already has, plus one new one:
- `moveScaleAt` returns `terrainK * mount.speed`.
- `solidAt` lets a mount with `swim` cross deep water.
- A new `dashMul()` hook scales the dash.

**Riding:** no fire for 0.2 s after mounting; rider takes x0.8 damage; same key dismounts; a downed mount throws the rider (0.5 s iframes). The mount draws in `drawMid` under the hero, lifted by `heroLift()` px.

### 2.4 Additive arena hooks (one RJ slice; `null` keeps today's behaviour)
`realm.js` is also loaded by the Town, duels and co-op, and none of them will pass these options. Five changes:
1. **New `setWorld` options:** `enemyStep(e,dt,p)->bool`, `onLethal(e,dmg)->bool`, `drawEnemy(g,e)->bool`, `drawMid(g,cam)`, `heroLift()`, `dashMul()`. They are added to the frozen `this.world`.
2. **Custom creature movement.** In `_updateEnemies`, after the wake and status checks, `if (wd && wd.enemyStep && e.cre && wd.enemyStep(e,dt,p)) { clamp; slide; continue; }`. Only enemies tagged as creatures skip the built-in AI.
3. **Knockout instead of death.** In `_hitEnemy`, before `e.active = false` on both the normal and the boss branch: `if (this.world && this.world.onLethal && this.world.onLethal(e,dmg)) { e.hp = 1; return; }`. Status DOT, signature AOE and weapon hits all reach `_hitEnemy`.
4. **Per-creature hitbox.** A helper `_er(e) = e.rad || RM_ENEMIES[e.type].r` replaces the ~10 places that read `RM_ENEMIES[e.type].r` (hash insert, bolt hit, `_sigAoe`, telegraph ring, flash, art scale, ghost). `spawnEnemy` resets `e.rad`, `e.cre` and `e.tame`. Creatures keep a **base type**, so `save.kb`, shards, XP and the save format are unchanged.
5. **Two public helpers.** `damageEnemy(e, dmg, src)` clamps to 1e6 and calls `_hitEnemy`. `tgFor(e, shape, sec)` wraps the TG3 telegraph fields, so creatures reuse its sprites, accessibility colours and reduced-motion handling.

### 2.5 Big-creature rendering and budgets
**Placeholder art**, `shared/mm-creature-draw.js` (`MMCreatureDraw`):
- `bake(def, scale) -> {frames:{idle[4],move[6],attack[5],ko[1]}, shadow, ax, ay}` draws code silhouettes for five body plans (`biped`, `quad`, `bird`, `shell`, `serpent`) in the pack palette.
- Frames are cached per (id, size class, dpr bucket) and baked once at display size, so nothing is scaled per frame.
- A KO'd creature shows "zzz" and a progress ring drawn from one cached sprite.

**Real art** later (ART-HANDOFF: 256 px cells S/M, 384 px L/XL, feet anchor) loads via `MMArt.loadAll(root, {only})` into the same pre-scaled cache.

**Shadows:** one baked ellipse per size class. **Hitboxes:** radius 12/18/26/36 for S/M/L/XL; XL adds a tail circle tested only by player bolts.

**Telegraphs:** every L/XL attack uses `tgFor`. A pounce is a line, a stomp a 0.6 s ring, a tail sweep a cone.

**Phone budget:**
- at most 24 active wild creatures (a per-pack override of the spawner cap)
- at most 4 L/XL creatures in view
- creature AI runs at 10 Hz, staggered
- the existing `EB_CAP` fire budget still limits enemy bolts
- target: median frame under 20 ms at 390x844 with a 4x CPU throttle

### 2.6 Saves (additive, each cleaned by its owner module)
**`pixeltown-tames-v1`**, owned by `shared/mm-tames.js` (`MMTames.clean/add/release/setParty`):

```js
{ v:1, n:37, roster:[{ id:'t1a', sp:'raptor', nm:'Rex', lv:3, xp:120, bond:3, sad:null, isle:'jungle', d:'2026-11-21' }],
  party:['t1a'], mount:'t1a'|null }
```

- **Validation:** id matches `/^t[0-9a-z]{1,6}$/`; names are at most 16 characters and only ever shown with `textContent`; `lv` is 1..30.
- **Caps:** 60 tames in the roster, 2 in the party.
- **Unknown species** are kept as inert entries and never deleted (like `wpn_` items in stale tabs).

**`pixeltown-archipelago-v1`**, owned by `MMIsles.clean`:

```js
{ v:1, at:'home', returnTo:{isle,x,y}|null, unlock:['jungle'],
  isles:{ jungle:{ seed:'123', pos:{x,y}, fog:'<b64>', chests:[] } },
  home:{ grid:[[x,y,'fence']] /*<=400*/, stable:{slots:12} },
  log:{ seen:{}, ko:{}, tamed:{}, bugs:{}, fish:{} }, wild:{ 'jungle:g12:3':{torpor,prog,eff,until} } }
```

- `wild`: at most 4 in-progress tames, kept 10 min, so a reload keeps the KO. Fog ~52 B per island; key under 20 KB.

**Backup.** `mm-backup.js` `CLEANERS` and `LABELS` gain both keys, with their owner cleaners. Bundle v2 is unchanged, and old bundles without the keys still restore as before.

Hero XP/shards still flow via the arena's `onSave` into `pixeltown-save-v1.realm`; `pixeltown-mm-v1` is read only.

### 2.7 Multiplayer: relay only
- Wild creatures are simulated per client from the shared seed; taming is local to the client that finished it.
- **Later:** `mm-world-party.js` gains a `cmp` message kind (`{t:'cmp', s, sp, x, y, m}`, 4 Hz, 512 B cap) over `MMPartyBC`. Clients that don't know it drop it in `clean()`. Partners draw companions as cached ghosts.
- There is no database, socket or fetch code, and a grep assertion enforces it, as in `world-team.test.js`.

## 3. Cozy layer

**Home island.** It uses the `home` pack (size 96) with a fixed seed. It has no hostile creatures, only parrotlets, plus a dock, a stable, a campfire and a 20x20 build grid.

**Building.** `shared/mm-home-build.js` (`MMHomeBuild`) **mirrors the Town's build materials as data**: fence, hedge, lamp, path and wall, with the same wood/stone/flower costs and the same 10 s undo. It adds pen, trough, nest and saddle_rack.
- It does **not** call the Town build code, because that writes to the LIVE database (`net.placeBlock`).
- The grid is saved only in `pixeltown-archipelago-v1.home`.
- `canPlace()` and `cozy()` (modelled on the Town home plot's cozy score) are pure functions with tests.

**Stable.** A DOM roster panel (rename, party, mount, release with confirm). Benched tames wander pens via `stay` anchors, at most 6 drawn.

**NPCs.** "Mossa the Keeper" and "Professor Quill": pure `routine(dayKey, hour) -> {spot, line}` on real UTC time, lines by seeded hash (`?today=` in tests). Quill gives one daily creature-log request (archipelago key).

**Seasons.** Pure `MMSeason.of(dateKey)`, same month split as the Town's seasonal recipes; packs may add seasonal palettes and creatures (`frost_hare` in winter). No penalties.

**Collections.**
- A creature log of seen, KO'd and tamed counts per species.
- Island bugs and fish go in our own `log`. The Angler and Safari keys are only read, for display.
- Hub medals: `hub/medals.js` gets `GAMES.isles = {node:'w7-isles', medals:[['tame1','First tame'],['log6','Jungle log'],['ride1','First ride'],['stable5','Full stable']]}`. The page is the single writer of `pixeltown-medals-isles-v1`.

**No decay timers:** tames never starve, sulk or die; treats give bond XP.

## 4. First playable: Jungle vertical slice (10 slices)

**Serial resources** (at most one slice per sub-wave): RJ `realm.js`, RW `realm-world.js` (not used in this plan), MM `mad-maze.js`, DG `dungeon.js`, TW `main.js` + `game/index.html`, AP `games/archipelago/*`, OW `mm-overworld.js`, BK `mm-backup.js`, HB `hub/*` + `mm-map.js`.

**Test rules:**
Browser tests open `?test=1&offline=1` with `blockDb(ctx)` (assert `db.count() === 0`) and drive `__isles.step(mx,my,dt)` / `__isles.clock.set()`, never sleeps. All tests go in `test-tiers.json` (node: smoke; pages: full, one smoke).

### Wave 1: pure modules, run in parallel now (code-drawn placeholders, no art)
**A1 Golden guard and packs** (OW + `mm-biome-packs.js`, M). The first commit is the golden fixture, captured on master. Then come the `generateWith` refactor, `opts.pack`, the appended ids and the `verify` forwarding.
- `shared-mm-overworld-golden.test.js`: all 120 hashes are identical, and the existing `shared-mm-overworld.test.js` passes unchanged.
- `shared-mm-biome-packs.test.js`:
  1. A jungle world verifies for 30 seeds.
  2. It is deterministic.
  3. Jungle seed 123 has a different hash than Realm seed 123.
  4. Only water and sand appear among ids below 18.
  5. Size 160 generates in under 120 ms in node.
  6. Every spawn-group creature is in the pack table.

**A2 Creature data** (`mm-creatures.js`, S). `shared-mm-creatures.test.js`:
1. All 7 defs validate.
2. A bad size, base or diet is rejected.
3. Rideables have a `ride` block, and L/XL creatures have `windup >= 0.4`.
4. Junk and `__proto__` input returns null.

**A3 Taming** (`mm-tame.js`, M). `shared-mm-tame.test.js`:
1. A soothe-only fight KOs at exactly the threshold.
2. A lethal hit at 40% torpor KOs; at 39% it kills.
3. Feeding faster than `feedEvery` gives no progress.
4. A hit while KO'd costs 0.1 `eff`.
5. Three scares fail a befriend.
6. The same seed gives the same events.

Also `tame-balance-sim.test.js` (node): 1,000 seeded runs per species at hero DPS 10-30. The median time to tame must be 20-45 s for S, 40-90 s for M, 70-150 s for L and 110-220 s for XL. Results are logged in `STATUS.md`.

**A4 Companions and mounts** (`mm-companion.js`, M). `shared-mm-companion.test.js`:
1. `follow` settles within 96 px in 2 s.
2. `attack` never targets past the leash.
3. `fetch` picks up and comes back.
4. `stay` drifts 0 px.
5. A third active companion is refused.
6. 2 companions x 72 enemies x 600 steps take under 90 ms.
7. `mount()` returns the def's values, or null for a non-rideable.

**A5 Saves and backup** (`mm-tames.js`, `mm-isles.js`, BK, S). `shared-mm-tames.test.js`, `shared-mm-isles.test.js`, and an extended `shared-mm-backup.test.js`:
1. Hostile input recovers to defaults.
2. Caps hold: 60 tames, 2 in the party, 400 grid cells, 4 wild.
3. Unknown species stay inert.
4. A bundle -> plan -> apply round trip keeps both keys.
5. An old v2 bundle restores identically.
6. `pixeltown-save-v1` is never written.

**A6 Code art** (`mm-creature-draw.js`, `mm-chunk-bake.js`, S). `shared-mm-creature-draw.test.js`, on a stub ctx like `shared-mm-fx-draw.test.js`:
1. All 5 body plans bake every action.
2. A second `bake` returns the cached object.
3. Frame sizes are 48/64/96/128 x the dpr bucket.
4. A baked jungle chunk uses only palette colours.

### Wave 2a: B7 and B8 in parallel (disjoint files)
**B7 Arena hooks** (RJ, M). The hooks from 2.4. Test: `arena-world-hooks.test.js`, on the Mad Maze world page through `__mm.arena`.
1. With no hooks, `realm-core`, `world-page`, `class-fire` and `realm-boss` pass unchanged.
2. When `enemyStep` returns true, a creature holds its position for 60 frames and fires 0 bolts.
3. When `onLethal` returns true, the creature keeps 1 HP, `save.kills` does not change and no bag drops. This is checked for the bolt, DOT and `_sigAoe` paths.
4. An enemy with `e.rad=30` is hit at 28 px; a plain one is not.
5. `damageEnemy` clamps damage to 1e6.
6. A grep confirms `main.js` never passes `enemyStep`.

**B8 Page and Jungle island** (AP + HB, L). The page shell, the jungle island from A1, chunks from A6, minimap and fog, pack creatures as plain base-type enemies, and the hero read from `MMProfile`. New switches: `?seed`, `?isle`, `?art=0`, `?perf=low`. Test: `archipelago-page.test.js`.
1. No console errors at 1000x700 or 390x844.
2. `world.pack === 'jungle'` and `verify` is ok.
3. `step()` walks 10 tiles, and mud gives a 0.6 move scale.
4. Every active creature id belongs to the jungle pack.
5. `blockDb` sees 0 requests, and a grep finds no `firebase` or `net.js`.
6. The `w7-isles` hub card links to the page (an extension of `hub-page.test.js`).

### Wave 2b
**B9 Taming in play** (AP, L). `isle-creatures.js` connects A2-A4 to the B7 hooks: behaviours, KO, a feed button, the party, mount and dismount, and `tgFor` telegraphs. New switches: `?tame=0` (creatures just die), `?companions=0`, `?mounts=0`.

`archipelago-tame-flow.test.js`:
1. Three berries befriend a parrotlet, which is then saved in `pixeltown-tames-v1`.
2. A raptor is KO'd, fed 5 times and tamed. A reload mid-tame keeps the progress.
3. The tame follows the hero and damages a boarhog through `damageEnemy`.
4. Mounting gives a 1.45 move scale and an 18 px lift; dismounting restores 1.
5. With `?tame=0` the raptor dies and nothing is written.

`archipelago-perf.test.js` is a clone of `world-perf` with 24 creatures (4 of them XL), 2 companions and 300 bolts at 390x844 under a 4x throttle. The median frame must be under 20 ms, p95 under 34 ms.

### Wave 2c
**B10 Home, travel, cozy, medals** (AP + HB, L). This slice adds:
- the home island and `mm-home-build.js` (with `shared-mm-home-build.test.js`)
- the dock, the sea chart, and the in-page home <-> jungle swap
- the Mossa and Quill routines
- the creature log panel
- the medals key and the `hub/medals.js` whitelist entry

`archipelago-home-travel.test.js`:
1. A home -> jungle -> home trip keeps HP, the party, and the jungle position and fog.
2. A fence and a pen survive a reload, and undo works within 10 s.
3. A benched tame shows up in a pen.
4. Quill's line for `?today=2026-12-01` is fixed, and that day is winter.
5. The first tame writes `tame1`, and the hub shows it.
6. Nothing in `pixeltown-save-v1` changes except `realm`.

**Merge order:** A1-A6 -> B7 + B8 -> B9 -> B10. Opus review for A1, A5, B7, B9.

**Later:** Ice, Reef (swim mounts), Mars (rocket, oxygen) packs; `cmp` relay; Town dock signpost (TW wave, local navigation); Codex batches `b3x-jungle-tiles` / `b3x-jungle-creatures`.

## 5. Risks and testing

| Risk | Mitigation |
|---|---|
| Old seeds shift | Golden fixture recorded before any edit; packs get their own seed space; ids append-only; `verify` forwards pack only when one is set |
| realm.js regression (it is shared with the Town, duels and co-op) | Every hook is null by default and only reachable through `setWorld`; creatures keep their base types, so kb, shards, XP and the save are unchanged; B7 re-runs the realm and world suites and greps the Town |
| Phone performance with 96-128 px sprites | Bake once at display size; one shadow sprite per class; at most 4 L/XL in view; 10 Hz staggered AI; 2 companions (1 on low tier); the existing 0.75 perf guard and fire budget; a perf test gates B9 |
| Save size and corruption | The two keys stay under 30 KB; owner cleaners with hard caps; unknown species stay inert; backup round-trip test |
| LIVE DB safety | No Firebase, `net.js` or Phaser on the page (grep); `blockDb` with a 0-request assertion in every test; home building is local only; co-op only over BroadcastChannel through `MMWorldParty.clean`; no `main.js` edits in the first playable |
| Flaky tests | Seeded pure steps; injected input/clock; `?today=`; perf medians over 300+ frames; smoke tier ~6 min |
| Taming grindy or trivial | Sim bands; all numbers in `MMCreatures` / `MMTame.TABLES` |

**Testing strategy:**
- **Node (Wave 1):** schemas, determinism, caps, golden hashes, taming sim, companion budgets.
- **Playwright (Wave 2):** one flow per slice via step hooks and `blockDb`; screenshots at 390x844 and 1000x700.
- **Perf:** CDP 4x throttle probe gates B9. **Every merge:** `node game/tests/run-all.js` (port 8440), nothing weakened.
