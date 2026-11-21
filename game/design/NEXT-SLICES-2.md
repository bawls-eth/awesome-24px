# Next slices 2: 20 slices in 4 waves (archipelago, gear endgame, phone fun-gates, co-op, perf)

Planner, 2026-11-21 (after the 20:xx UTC merges: gear G7/G8/G9/G10/G11/G12/G14/G16 + G15 splash tuning, biome A1-A6 + B7/B8/B9,
b29 + b30 art). This file supersedes the open parts of `NEXT-SLICES.md`. Engine background: `BIOME-ARCH-PLAN.md`,
`BIOME-WORLD-CONCEPT.md` (art table, section e), `GEAR-DROPS-BUILD-PLAN.md`.

Rules for every slice (AGENTS.md): one slice = one branch; logic goes in pure `shared/` modules, page files only wire it up;
`node game/tests/run-all.js` must pass on port 8440 before merge; every new test goes in `game/tests/test-tiers.json` (node tests
smoke, browser tests full, one smoke per page); every browser test uses `blockDb` from `tests/helpers.js` and asserts 0 DB requests
and 0 sockets; no chat and no live-DB writes. Saves are additive only and `pixeltown-save-v1` stays backward compatible. Original art only,
with a code fallback for every asset. Do not weaken tests: when a default flips, the old assertion moves to the explicit flag
(`?gear=0`) and a new assertion covers the new default.

## 0. What exists now (checked in the tree, not taken from older plans)
- **Isles page** `games/isles/` (`index.html`, `isles.js` 946 lines, `isle-creatures.js`, `isles.css`). It has its **own** light engine:
  own bolts, own creature AI, auto-aim, one stick. It does **not** load `realm.js`, so the B7 arena hooks are used only by tests today.
  `?isle=jungle|home|ice|reef|mars` picks the pack. Taming, party, mounts and a pouch work, plus b30 tiles through `MMIsleArt`.
  **Missing:** bosses, rares, resource gathering, crafting, saddles (mounting ignores `ride.saddle`), home, travel, sea chart,
  medals, and environment rules (swim depth, cold, oxygen, low gravity).
- **Species id drift.** The pack spawn ids do not match `MMCreatures`:
  - jungle uses `parrotlet/shellback/raptor_jr/raptor/boarhog/canopy_queen`. These are patched by a hard-coded `ALIAS` in
    `isle-creatures.js`, and `canopy_queen` has no def at all.
  - tundra uses `shellback_glacier`, but the def is `glacier_shellback`.
  - Pack ids without a def become untameable placeholders (`isles.js:131`).
- **Creatures:** `shared/mm-creatures.js` has 37 defs over meadow/jungle/tundra/reef/mars. Ten saddle ids are referenced
  (`saddle_tusktop, saddle_stegolith, saddle_tyrant, saddle_shagtusk, saddle_sabrefang, saddle_tidesteed, saddle_skimray,
  saddle_strider, saddle_grazer, saddle_titan`); no recipe makes them. `FOODS` and `DROP_TABLES` exist.
- **Gear:** `mm-gear`, `mm-gear-affix`, `mm-gear-drops`, `mm-splash` are loaded on `games/mad-maze/index.html`.
  - `GEAR_DEFAULT_ON = false` is still in `realm-world.js:11` and `dungeon.js:9` in this tree. If the flip has landed on another
    branch, GH below hardens it; if it has not, GH is the flip.
  - `gear-world-drops.test.js:46` and `gear-dungeon-drops.test.js:67` assert default OFF.
  - Not built yet: G13 stats drop-down (no `gear-stats-ui.test.js`), the full gear balance sim (`gear-balance-sim.test.js`),
    forge/reroll, set bonuses, vendor.
- **Co-op:** `world-team.js` (CO2) exists with `world-team.test.js`. `games/mad-maze/index.html` has no tag for `mm-world-party.js`,
  `mm-party-bc.js` or `world-team.js`, so CO3 is not hooked up. `realm-world.js` uses the fixed `gearPlayer = 'p0'` for every seat.
- **Perf:** `world-perf.test.js` runs with gear off (the default). There is no `archipelago-perf.test.js`.

## Serial resources (at most one slice each per wave)
`RJ` = `game/realm.js` (+ `game/realm-ui.css`) · `RW` = `games/mad-maze/realm-world.js` · `DJ` = `games/mad-maze/dungeon.js` ·
`MM` = `games/mad-maze/mad-maze.js` (+ `games/mad-maze/index.html`, `mad-maze.css`) · `MN` = `game/main.js` (+ `game/index.html`) ·
`IS` = `games/isles/*` (all four files).
Soft resources (one per wave; the table names the owner): `shared/mm-isles.js`, `shared/mm-gear.js` (+ `mm-gear-affix.js`,
`mm-gear-drops.js`), `shared/mm-biome-packs.js`, `hub/*`, `game/assets/arcane/INDEX.json`.
Every slice appends to `tests/test-tiers.json`. Append only; resolve conflicts by keeping both entries.

## Wave 1: start now (5 parallel, disjoint files)

| id | title | files | size | serial | depends |
|---|---|---|---|---|---|
| X1 | Isles species canon + reef/tundra/mars/home playable polish | `shared/mm-biome-packs.js` (add `CANON` + `canon(id)`, spawn tables untouched), `games/isles/isle-creatures.js`, `games/isles/isles.js`, NEW `tests/fixtures/pack-golden.json`, NEW `tests/shared-mm-biome-packs-canon.test.js`, NEW `tests/isles-biomes.test.js` | M | IS, biome-packs | none |
| X2 | Crafting + saddles (pure) | NEW `shared/mm-isle-craft.js` (`MMIsleCraft`), `shared/mm-isles.js` (additive `inv` key in the archipelago save) | M | mm-isles | none |
| X3 | Big-creature boss engine (pure) | NEW `shared/mm-isle-boss.js` (`MMIsleBoss`) | M | none | none |
| G13 | Backpack stats drop-down + compare; forge-field tolerance | RJ (`renderBackpack`, `_calcStats({eqOverride,noGear})` exposure, `rmCleanSave` keeps the future `f` field), `game/realm-ui.css` | M | RJ, Opus review | none |
| GH | Gear-on-by-default hardening | RW (`GEAR_DEFAULT_ON = true`, the one-time pre-gear snapshot, the downgrade hint), DJ (`GEAR_DEFAULT_ON = true`), `tests/gear-world-drops.test.js`, `tests/gear-dungeon-drops.test.js`, NEW `tests/gear-default-on.test.js` | M | RW, DJ, Opus review | none |

**X1 acceptance**
1. Record `pack-golden.json` first, before any edit: `O.hash()` for 12 seeds x 5 packs. After the change every hash is
   identical, and the existing `shared-mm-overworld-golden.test.js` passes unchanged.
2. `canon(id)` maps every id that `creatureIds()` returns for every pack to an `MMCreatures` def of that pack's biome. The test
   covers all 5 packs. Expected mappings: `shellback_glacier`→`glacier_shellback`, `canopy_queen`→`fernjaw_tyrant`, and the jungle
   `ALIAS` moves here. `isle-creatures.js` reads `canon()`, and its own `ALIAS` stays only as a fallback export.
3. Each of `?isle=jungle|home|ice|reef|mars`:
   - loads with 0 console errors at 390x844 and 1000x700;
   - every live creature's `kind` has a def in that biome;
   - `glacier_shellback` on ice is tameable (`st` is not null).
4. Reef: `abyss` and `sea_rock` are solid on foot. Riding a `swim` mount (`tidesteed`, `skimray`) crosses `lagoon`/`kelp_bed`.
   Dismounting in water puts the hero on the nearest walkable tile.
5. Pack `rare` entries spawn through the seeded spawner: `isleback_turtle` in reef zone 2 and `oakback` in home zone 3, at most 1 per island.

**X2 acceptance** (`shared-mm-isle-craft.test.js`)
1. `RECIPES` holds:
   - all 10 saddle ids from `MMCreatures` (each made from 2-4 inputs that exist in pack `resources` or `DROP_TABLES`, so every
     input has 2+ sources);
   - `feast`, `sleepy_herb` (a torpor food), `raft` (reef unlock), `rocket_core` (mars unlock), `warm_cloak` (tundra) and
     `o2_tank` (mars).
2. `canCraft(inv, id)` returns `{ok, missing[]}`, and `craft(inv, id)` returns a new frozen inventory. Neither uses RNG, timers or currency.
3. `cleanInv` caps 64 stacks x 999 and drops unknown ids, `__proto__` and non-integers. `MMIsles.clean` keeps `inv` within the
   20 KB cap, and an old save without `inv` loads with `inv:{}`.
4. A `validate()` cross-check fails if a recipe names an item that no pack or drop table produces.

**X3 acceptance** (`shared-mm-isle-boss.test.js`, plus the `isle-boss-sim.test.js` node sim)
1. It ships phase scripts for `fernjaw_tyrant`, `tide_hydra`, `frost_dragon` and `red_titan`. Phases change at 70% and 35% HP, using the
   attack shapes `line` (charge), `ring` (stomp/roar), `cone` (tail) and `spiral` (base). Every windup is ≥ 0.6 s (≥ 0.8 s for
   ground slams), with at most 2 live hazards.
2. `step(state, input, dt)` returns `{state, events}` and is seeded and pure. At 10% HP the boss goes `weary`: it can then be
   fed a `feast` to begin a boss-tame (the `MMTame` knockout path); otherwise it dies normally.
3. The sim runs 1,000 seeded fights at hero DPS 10/20/30. The median solo kill is 60-180 s, and a boss-tame takes about 3 min
   (150-240 s) including weary. There is no enrage timer, no instant-kill attack, and every attack has a safe zone.

**G13 acceptance** (`gear-stats-ui.test.js`, per GEAR-DROPS-BUILD-PLAN (e))
1. The `<details id="realm-bp-statsx">` summary is ≥ 44 px and toggles open. It shows Total/Base/Gear headers and a Guard row.
2. Compare on a T9 weapon shows "▲" with an `aria-label` that contains "Damage up". At 375 px, `scrollWidth ≤ clientWidth`.
3. `rmCleanSave` keeps a valid `f` (one affix id from `MMGearAffix` ids, only on `t ≥ 7`) and drops a bad one. An item without `f`
   stays byte-identical. This ships the field one deploy before GW writes it.

**GH acceptance** (`gear-default-on.test.js`)
1. Defaults:
   - with no flag, world and dungeon drops roll tiered gear;
   - `?gear=0` gives 0 items with `t` (both old tests move their default-off assertion to `?gear=0`, nothing deleted);
   - the Town classic arena and duels never create `t` (runtime spy plus a grep of `main.js`).
2. Snapshot: before the first tiered item is written to a save without `gv`, an `MMBackup.bundle` snapshot goes to the NEW key
   `pixeltown-backup-pregear-v1`. It is written once and is not itself included in backups.
3. Downgrade hint: a save with `gv:1`, no item carrying `t`, and fewer items than before shows a one-time hint, "Your gear may
   have been reset by an old tab: restore from Lantern backup". No auto-restore.
4. Seat ids: `gearPlayer` comes from the world-team seat when one exists, so two seats on the same seed and kill get different
   gear streams (pure check through `seedFor`).

## Wave 2 (5 parallel; needs Wave 1 merged)

| id | title | files | size | serial | depends |
|---|---|---|---|---|---|
| X4 | Gather + craft panel + saddles on the isles | IS (`isles.js`, `index.html` tag for `mm-isle-craft.js`, `isles.css`) | L | IS, Opus review | X1, X2 |
| GB | Affix balance + set bonuses (pure) + full gear sim | `shared/mm-gear.js`, `shared/mm-gear-affix.js`, `shared/mm-gear-drops.js` (tables only), NEW `shared/mm-gear-sets.js`, NEW `tests/gear-balance-sim.test.js`, NEW `tests/shared-mm-gear-sets.test.js` | L | mm-gear | GH |
| GF | Forge: salvage, deterministic reforge, vendor price list (pure) | NEW `shared/mm-gear-forge.js` (`MMGearForge`), NEW `tests/shared-mm-gear-forge.test.js` | M | none | G13 |
| FT1 | First-10-minutes phone fun-gate test | NEW `tests/first-ten-minutes.test.js`, NEW `tests/fixtures/ftue-profiles.json` | M | none | none |
| P1 | Phone perf probes: isles + gear-on world | NEW `tests/archipelago-perf.test.js`, `tests/world-perf.test.js` (add a gear+splash-on case; the existing case unchanged) | S | none | GH |

**X4 acceptance** (`isles-craft.test.js`)
1. Walking over a pack resource node gathers it into `inv` (it respawns after `respawn` s), and creature drops roll `DROP_TABLES`.
   A craft panel (DOM, `textContent` only, targets ≥ 44 px, Esc closes) lists recipes with have/need counts.
2. Mounting a creature whose `ride.saddle` is set needs that saddle in `inv`, or a grandfathered saddle. The grandfathering
   gives one free saddle per existing `tames.mount`, so nobody loses a ride, and `?saddles=0` restores today's free riding.
   Creatures with `saddle:null` mount as today.
3. Crafting `raft` adds `reef` to `unlock`, and `rocket_core` adds `mars`. The `inv` and `unlock` changes survive a reload, and
   `pixeltown-save-v1` is not written.

**GB acceptance**
1. Sets (`MMGearSets.active(eqItems)`):
   - "Banded" (the armor band equals the weapon band): +4% HP, plus +1 GRD at band ≥ 4.
   - "Dread pair" (`arm_*_dread` with a T11-12 weapon that has a signature): signature affix +25%.
   - At most 2 sets are active, every bonus counts inside the existing weapon affix power cap, and the cap still holds.
2. `gear-balance-sim.test.js` runs every target in GEAR-DROPS-BUILD-PLAN (g) for all 14 classes, with sets on and off. It covers
   TTK per zone, the z3 boss solo time, T12E/T9C ≤ 1.85 and drop pacing (first T11 median ≤ 1 h, T12 1.5-4 h). It prints a table
   and fails on the first row that misses.
3. Tuning changes only the `TIERS` / `TABLES` / affix ranges. `shared-mm-weapons.test.js` and `class-weapon-sim.test.js` are unchanged and green.

**GF acceptance**
1. `salvage(item)` gives `dust = f(t, r)`. It is deterministic, and soulbound items can be salvaged.
2. `reforgeOptions(item)` lists every legal affix for the slot, each at a fixed value (the midpoint of the tier range x the
   rarity factor) with its exact dust + shard cost. `reforge(item, affixId)` sets `f` (one forged affix per item; reforging again
   replaces it).
   - No RNG anywhere in the module (a grep finds no `random` or `MMRng`).
   - The outcome is shown before you pay.
   - Real money is never involved.
3. `vendorStock(weekKey)` is a fixed T1-T3 list with fixed prices (owner decision: T1-T3 only, never soulbound). `buyBack`
   returns dust at the `sellValue` ratio. Hostile input returns null.

**FT1 acceptance** (drives `?test=1` hooks with simulated time; no sleeps; wall clock ≤ 90 s per profile; 390x844, `hasTouch`, coarse pointer)
1. Fresh profile, `games/mad-maze/index.html?mode=world`:
   - first enemy killed ≤ 20 s sim;
   - first bag ≤ 60 s;
   - first level-up ≤ 180 s;
   - first ability used ≤ 240 s;
   - a portal is reachable within 10 min;
   - no 45 s window without a reward event (kill, bag, XP, level, quest);
   - at most 1 death in 10 min for the scripted kite-bot.
2. Fresh isles profile: the first tame takes ≤ 180 s, and the hint text always names the next action.
3. Layout:
   - every visible button is ≥ 44 px and does not overlap either stick;
   - no text is under 12 px;
   - the first frame shows within 3 s on localhost;
   - 0 console errors.
   Results are written to `design/ftue-metrics.json` (counts only). The test is a gate: it fails on any threshold miss.

**P1 acceptance**
1. `archipelago-perf`: 390x844 under a 4x CDP throttle, with 24 creatures (4 XL), 2 companions and riding. Median frame
   < 20 ms, p95 < 34 ms, over ≥ 300 frames.
2. `world-perf` gear-on case: `staff_comet` against 30 enemies with splash on. The median is ≤ 1.10x the gear-off median, and
   the text pool stays ≤ 28.
3. Both are in the full tier (not smoke). When a case fails, it logs the first offending phase (update/draw) for P2.

## Wave 3 (5 parallel; needs Wave 2 merged)

| id | title | files | size | serial | depends |
|---|---|---|---|---|---|
| X6 | Big-creature bosses on the isles + boss-tame | IS (`isles.js`, `isle-creatures.js`, `index.html` tag for `mm-isle-boss.js`) | L | IS, Opus review | X3, X4 |
| GW | Forge + sets in the backpack | RJ (Forge tab in the backpack, set rows in the stats drop-down, `_calcStats` reads `f` and sets; modules lazy-loaded through realm.js's existing module loader, so no `index.html` edit) | M | RJ, Opus review | GB, GF |
| CO3 | Co-op big-map hookup behind `?party=local` | MM (`games/mad-maze/index.html` tags for `mm-world-party.js`, `mm-party-bc.js`, `world-team.js`; `mad-maze.js` calls `WorldTeam.create` with `party:'local'`), `games/mad-maze/world-team.js` (partner minimap dot on its own overlay), NEW `tests/world-party.test.js` | M | MM, Opus review | GH |
| X5 | Island environment rules (pure) | NEW `shared/mm-isle-env.js` (`MMIsleEnv`) | S | none | none |
| FT2 | First-run Realm fixes from FT1 | RW (shore pacing knobs, first-bag guarantee), `games/mad-maze/realm-tutorial.js` | M | RW | FT1 |

**X6 acceptance** (`isles-boss.test.js`)
1. Each pack's `bosses[0]` spawns at its boss site, and a `boss_arena_ring` is drawn with a code fallback. Every attack shows its
   telegraph for at least its windup, and reduced motion makes telegraphs static.
2. The hero can kill each of the 4 bosses with `god(false)`. Over a seeded run the hero takes damage only inside telegraphed
   shapes. Phases change at 70% and 35% HP.
3. Boss-tame: at weary, feeding a `feast` from `inv` starts taming. The tamed `fernjaw_tyrant` is saved as an alpha in
   `pixeltown-tames-v1` and is rideable with `saddle_tyrant`. With `?tame=0` the boss just dies, and nothing is written.

**GW acceptance** (`gear-forge-ui.test.js`)
1. The Forge tab shows salvage and reforge with the exact cost and result before Confirm. Confirm applies the change once,
   and a reload keeps `f`.
2. The stats drop-down shows active sets as "Banded set: +4% HP". Compare includes the set change.
3. With `?gear=0`, the Forge tab and sets are hidden and `f` is ignored (but kept). Duels ignore `f` and sets.

**CO3 acceptance** (`world-party.test.js`: two pages in one browser context, same seed)
1. Each page sees the other's ghost within 40 tiles at ≤ 8 Hz, and the minimap shows the partner dot.
2. A shared kill gives each seat its own bag id and its own tiered roll (different `seedFor` player ids). Soulbound items never
   cross the channel (a runtime spy on `postMessage`).
3. Without `?party=local`, no BroadcastChannel is opened. There are 0 DB requests and 0 sockets, and a grep finds no `firebase`
   in the new code.

**X5 acceptance** (`shared-mm-isle-env.test.js`)
1. `swimAt(tile, mount)`: deep water needs `swim`. `warmth(t, nearFire, cloak)` on tundra drains in 90 s; at 0 it slows to x0.8
   and deals no damage.
2. `oxygen(t, inDome, tank)` on mars lasts 120 s with an `o2_tank`. At 0 it does 1 HP/3 s, with a 10 s warning. `gravity` gives
   move x1.15 and dash +40%.
3. Every meter is pure and seeded on `t`. No meter ever destroys items or tames, and each one has a kill switch flag name
   exported for the page.

**FT2 acceptance**
1. All FT1 Realm thresholds pass.
2. The tutorial coach marks never cover a stick or the ability grid at 390x844.
3. `?ttk=0` and `?bands=classic` still restore the old behaviour (their tests are unchanged).

## Wave 4 (5 parallel; needs Wave 3 merged)

| id | title | files | size | serial | depends |
|---|---|---|---|---|---|
| X7 | Home island, sea chart travel, environment meters, isles medals | IS, NEW `shared/mm-home-build.js`, `hub/medals.js` (`GAMES.isles`) | L | IS, hub, Opus review | X4, X5, X6 |
| AW | Wire Codex creature/prop/UI art b31a-b34 (if delivered) | `shared/mm-isle-art.js`, `shared/mm-creature-draw.js` (use registered strips in `bake`, code silhouettes otherwise), `game/assets/arcane/INDEX.json` | M | INDEX | Codex b31a/b32/b33/b34 |
| VN | Nexus vendor + forge NPC in the Realm | RW (Nexus vendor stall: `vendorStock`, buy-back for dust, opens the GW Forge tab), `shared/mm-nexus.js` | M | RW | GF, GW |
| P2 | Phone perf fixes in the arena hot path | RJ (no per-hit allocation in the affix/splash path, `_calcStats` cached behind an equip-dirty flag, damage-text throttle on the low tier) | M | RJ | P1 |
| TD | Hearthvale dock signpost to the isles | MN (a sign near the pond dock; `location` navigation like `useDoor()`, no `net.*` call) | S | MN | X7 merges in the same wave or earlier |

**X7 acceptance** (`archipelago-home-travel.test.js`, per BIOME-ARCH-PLAN B10)
1. A home → jungle → home trip through the dock and sea chart keeps HP, the party, and the jungle position and fog. Locked isles show
   their unlock cost.
2. Home build: a fence and a pen survive a reload, and undo works within 10 s. Building is local only; there is no Town build-code
   call (grep for `net.placeBlock`).
3. Environment meters from X5 are live on ice and mars. Medals are written: the first tame gives `tame1`, and the hub shows it.

**AW acceptance**
1. `art-manifest.test.js` registers every delivered id.
2. A creature with registered strips draws them at its `SIZES.px` (pre-scaled once). A missing id draws the code silhouette, with
   0 console errors.
3. The mount `seat` from the manifest positions the rider, and `?art=0` uses code only.

**VN acceptance**
1. The vendor sells only T1-T3 at fixed prices.
2. Buy-back pays dust.
3. The Forge opens from the stall.
4. Nothing involves real money or random packs.
5. A save without the vendor loads fine.

**P2 acceptance**
1. P1 gear-on is ≤ 1.05x the gear-off median.
2. The allocation count per frame (CDP heap sampling) in the splash path is 0.
3. All `gear-*` and `class-weapon-*` tests are unchanged and green.

**TD acceptance**
1. `town-isles-sign.test.js` (offline): the sign is visible, and interacting with it navigates to `games/isles/index.html?from=town`.
2. 0 DB writes, no chat.
3. The Town load time is unchanged (`town-perf`).

Merge order per wave: pure modules → RJ → RW/DJ → MM → IS → hub/MN → art/docs. Opus review: G13, GH, X4, X6, GW, CO3, X7.

## Codex art ask list (b31+; exact ids match `MMCreatures` / pack ids)
Format, as before:
- transparent background, palette.json, a validation report with 0 blocking, contact sheet ≤ 2000 px, true back and side views,
  effects kept separate;
- feet anchor on the baseline;
- cells: **S/M 256x256, L 384x384, XL 512x512**, pre-scaled at load to 48/64/96/128 px.

Creature strip sets:
- **Plain** (12 strips): idle 4, move 6, attack 5, death 5 in down/up/right.
- **Tameable** (14 strips): plain, plus `sleep_down` 4 and `eat_down` 4.
- **Mount:** the manifest also gives a per-frame `seat` {x, y}, plus a `saddle_<id>` overlay of 6 strips (idle 4 and move 6, in 3 directions).

| batch | branch `codex/` | ids (size, strips) |
|---|---|---|
| b31a | b31a-jungle-creatures-core | `chompbill` (S, 14), `fernraptor` (S, 14), `glimmerfrog` (S, 14: it is tameable in code, the concept said 12) |
| b31b | b31b-jungle-creatures-rest | `vinecoil` (S, 12), `canopy_glider` (S, 14). Drop `moth_lantern`: it has no def. |
| b32 | b32-jungle-big-and-boss | `tusktop` (L, 14 + seat + `saddle_tusktop` 6); `stegolith` (XL, 14 + seat + `saddle_stegolith` 6; **missing from the old list**); `fernjaw_tyrant` (XL, 14 + `roar_down/up/right` 6 frames + seat + `saddle_tyrant` 6) |
| b33 | b33-jungle-props | 64x64: `jungle_tree_a`, `jungle_tree_b`. 32x64: `hanging_vine`, `banana_plant`, `temple_pillar`, `temple_idol`, `termite_mound`. 32x32: `giant_fern`, `amber_node`, `berry_bush_jungle`. 64x32: `nest_wild`. 128x128: `boss_arena_ring` |
| b34 | b34-taming-ui-items | 24x24: `ui_tame_trust, ui_tame_torpor, ui_tame_bond, ui_tranq_on, ui_tranq_off, ui_cmd_follow, ui_cmd_stay, ui_cmd_attack, ui_saddle, ui_ride, ui_stable, ui_wellfed, ui_warmth, ui_breath, ui_oxygen, ui_tamer_rank`. 48x48: `ui_icon_isles, ui_icon_sea_chart`. 32x32 items: `raw_meat, jungle_berry, feast, sleepy_herb, amber, vine_rope, clover, golden_apple, fiber, hide, bone, tyrant_scale` |
| b34b (new) | b34b-crafting-icons | 32x32: `icon_saddle_tusktop, icon_saddle_stegolith, icon_saddle_tyrant, icon_saddle_shagtusk, icon_saddle_sabrefang, icon_saddle_tidesteed, icon_saddle_skimray, icon_saddle_strider, icon_saddle_grazer, icon_saddle_titan, icon_raft, icon_rocket_core, icon_warm_cloak, icon_o2_tank, icon_gear_dust`. 48x48: `ui_icon_forge, ui_icon_vendor`. 16x16: `ui_set_banded, ui_set_dread` |
| b35 | b35-meadow-home | 4 home terrains x (4 variants + 16 edges); `stable` 96x64; `nest` 32x32; `garden_plot_s1..s4` 32x32; `dock` 64x32; `launch_pad` 96x96; `workbench_isle` 64x32; `boat` 64x32 (2 frames) |
| b36 | b36-meadow-creatures | `clover_hopper, puffwool, bumble_mote, pebble_tortle` (S, 14 each); `thistle_boar` (M, 14); `meadow_strider` (L, 14 + seat; no saddle); `oakback` (XL, 14) |
| b37 | b37-ocean-terrain | 11 reef terrains x a..d + 3 edge sets; props 32x32: `pearl_clam, kelp_tall (32x64), anemone, coral, wreck_mast (32x64), driftwood, shell` |
| b38 | b38-ocean-creatures | `reef_puffer, shellcrab` (S, 14); `glowjelly` (S, 12); `fin_raider` (S, 14); `tidesteed, skimray` (L, 14 + seat + saddle 6); `isleback_turtle` (XL, 14 + seat); `tide_hydra` (XL boss, 12 + `roar_*` 6). The old list had `isleback` and treated shellcrab/tide_hydra as reskins: use the code ids. |
| b39 | b39-ice-terrain | 12 tundra terrains x a..d + 3 edge sets; props `pine_snowy (32x64), snow_drift, frostberry_bush, ice_spike, frozen_mammoth_tusk (64x32), hot_spring_steam (4 frames), crystal_blue` |
| b40 | b40-ice-creatures | `pengling, frostfox, rimewolf` (S, 14); `icicle_bat` (S, 12); `glacier_shellback` (M, 14; **not** `shellback`); `shagtusk, sabrefang` (L, 14 + seat + saddle 6); `frost_dragon` (XL boss, 12 + `roar_*` 6) |
| b41 | b41-mounts-riders | `rider_<class>_sit_down/up/right` for all 14 classes (lowercase `gravetender`, `shadowpaw`), 256x256 |
| b42 | b42-mars-station-terrain | 20 terrains x a..d + 3 edge sets |
| b43 | b43-mars-creatures | `regolith_roly, bubblemoth, scrapper_drone` (S, 14); `dust_devil` (S, 12); `rustbeetle` (M, 14); `crater_strider` (L, 14 + seat + `saddle_strider` 6); `void_grazer` (XL, 14 + seat + `saddle_grazer` 6); `red_titan` (XL boss, 14 + `roar_*` 6 + seat + `saddle_titan` 6) |
| b44 | b44-space-props-vehicles | per BIOME-WORLD-CONCEPT (e) (`oxygen_plant f1..f4`, `greenhouse_dome` 128x96, `boat_sail` 64x64 4 frames x 3 directions, `rocket_launch` 128x192 8 frames, `shuttle`) |
| b45 | b45-biome-edges-fx | 64x64: `fx_tame_hearts, fx_torpor_zzz, fx_trust_sparkle, fx_spore_puff, fx_bubble_o2, fx_snow_breath, fx_splash, fx_lava_vent_warn, fx_roar_ring`; 256x256 tileable `fx_dust_storm`; 4 jungle edge sets |

Priority for Codex: **b31a → b32 → b34 → b34b → b33**, then b38/b40 (the reef and tundra polish needs them most), then the rest.
Every id has a code fallback, so no slice waits on art.

## Top 8 risks (most likely bugs after the recent merges)
1. **Gear on by default, old tabs and caches.** Tabs or Pages-cached builds from before G7 strip `t`/`a`/`eq.armor` on their next save.
   The gv hint and snapshot (GH) help. Also check that `rmMergeSave` across two live tabs keeps `(n,id,r,t,a)` and the three-way
   `gp` merge (fixed once already).
2. **Gear power without a full sim.** G15 tuned splash only. With drops on, z2/z3 T9-T12 plus affixes plus splash can collapse
   TTK under the `MMDifficulty` clamps. GB must land before players farm godlands. Leech must stay off in duels, and the crit cap
   at 0.5 must hold.
3. **Co-op gear seed collision.** `gearPlayer = 'p0'` for every seat gives identical drops in two tabs. Soulbound items must
   never ride a `loot`/BroadcastChannel payload (GH, CO3).
4. **Isles species drift.** `shellback_glacier` and `canopy_queen` have no def, and the hard-coded `ALIAS` hides the mismatch on
   jungle only. ice/reef/mars/home are probably untested in a browser. Expect placeholders that cannot be tamed and art that never
   loads (X1).
5. **Arena hooks in the shared hot loop.** `_er(e)` and the `e.rad/cre/tame` reset must happen on every spawn path (dungeon,
   boss, team-guest mirror), or creature state can leak into the Town, duels or co-op. If `onLethal` returns true for a boss, it
   can sit at 1 HP forever with DOT ticking (softlock), and quest kill counts never increase. Production uses none of the hooks
   today, so only the tests guard them.
6. **The isles page is a second engine.** Its bolts, AI and hero stats ignore `MMClasses.arenaProfile`, weapons and gear, so the
   feel drifts from the Realm. Its saves (`pixeltown-archipelago-v1` 20 KB cap, `MAX_FOG` 512, `pixeltown-tames-v1`) need a round
   trip on size-192 isles. `persist` on hide/unload must work in private mode (guarded `memStore`).
7. **Phone perf with gear and splash on.** `world-perf` only measures gear off. Splash texts, rings and per-hit affix math run on
   every hit. On isles, XL sprites plus 2 companions plus riding have no perf gate yet (P1/P2).
8. **Test churn.** Flipping defaults breaks `gear-world-drops`/`gear-dungeon-drops` (they assert off). Move those assertions to
   `?gear=0`; never delete them. `test-tiers.json` merge conflicts and smoke-time growth, plus the known timing flake class
   (`world-safereturn` upper bound, `telegraph-arena` rng), are the likely red runs.

## Manual QA checklist (phone 390x844 + desktop, offline, ~15 min)
- [ ] Fresh profile → Realm world: kill within 20 s, first bag within 1 min, level-up within 3 min, ability prompt is readable,
      no button under either stick.
- [ ] Gear on: a z1 kill drops a "T3-T6" item with a tier badge. Armor equips into the 4th slot, and the off-family lock text shows.
      `?gear=0` shows no badges and the old stats.
- [ ] An old save (no `gv`) loads byte-identical. Open two tabs, equip in one, reload the other: no tier loss.
- [ ] Splash weapon (`staff_comet`) on a pack: rings and orange numbers, no frame hitches, reduced motion gives a static ring.
- [ ] Soulbound T11: Lantern vault deposit is refused with a message, and it can still be sold.
- [ ] Isles `?isle=jungle/home/ice/reef/mars`: each loads; tame a small creature with 3 feeds; KO + feed a fernraptor; ride a tusktop;
      reload keeps the tame, party and mount.
- [ ] Isles on the phone: the stick works, auto-fire aims at the nearest creature, the feed/ride/soothe buttons are ≥ 44 px, the hint
      names the next step.
- [ ] Hub → Hearthvale Isles card opens the page; the Back link returns to the hub.
- [ ] Town: the Realm Gate still opens the world and Classic; duels are unchanged (no armor slot effects, no splash).
- [ ] DevTools network: 0 Firebase requests on the isles and Mad Maze test pages, no chat sent.
