# Hearthvale Isles: biome archipelago + Pixel Ark taming (concept)

Owner request: Mars/space, jungle, ice and ocean biomes, Animal Crossing coziness, and big creatures to fight or tame ARK-style (PvE only). Research: `RESEARCH-BIOME-WORLD.md`. Standing rules: Firebase untouched, additive saves, original art, nothing removed.

## (a) Pitch and pillars

**Pitch.** Hearthvale's dock gets a boat to **Hearth Isle**, your own meadow island, where you build a stable, a garden and a home. From there you sail on to the **Verdant Jungle**, the **Coral Reef** and open sea, and the **Frostfang Tundra**. By rocket you reach the **Red Waste** of Mars and an orbiting **Drift Station**. Each island has:
- critters to befriend
- buddies to tame and fight beside
- big beasts to saddle and ride
- a boss you can *tame* once it is beaten down

What you bring home grows your island; the Realm's Godlands are one portal away.

**Pillars**
1. **Befriend, don't grind.** Taming is skill plus the right food. There are no fail rolls and no timers that can lose you a tame.
2. **Each biome is a full bundle:** terrain, palette, music, weather, critters, fish, bugs, resources, one hazard and one boss.
3. **Home grows from away.** Every trip brings back something to place, plant or ride.
4. **Danger depends on where you are, never on the clock.** Home is safe, island rims are gentle, cores and bosses are hard.
5. **Thumb-first.** One context button and one tranq toggle, on top of the existing twin-stick controls.

## (b) World structure

```
Pixeltown hub ── node "Archipelago" ──┐
Hearthvale Town (Firebase presence UNCHANGED) ── Harbor sign at dock ──> games/isles/index.html (Sea Chart)
 Hearth Isle 96² ─boat─> Verdant Jungle 192² ─raft─> Coral Reef + Open Sea 256²
        │                       └─ Frost Cloak ─> Frostfang Tundra 192²
        └─ rocket ─> Red Waste (Mars) 192² ─ shuttle ─> Drift Station 64x48 (fixed layout)
 Any isle ─ Rift (b14 portal_boss) ─> Realm ?mode=world (Godlands endgame, unchanged)
```

**Page.** Plain canvas, no Phaser, **no Firebase SDK**. The Town gains only a signpost link by its dock NPC; its network code is unchanged.

**Travel**
- **Sea Chart:** a tap plays a 4 s sail with a bonus cast-a-line.
- **Open Sea:** sailed by hand; the boat is a vehicle that uses the mount controls.
- **Rocket:** a launch pad on Hearth Isle with a 6 s cutscene.
- **Rift:** opens `mad-maze/index.html?mode=world&from=isles` and returns you to the same tile.

**Unlock order.** Islands unlock with materials, never with waiting time.

| # | Island | Unlock | Creature Lv |
|---|---|---|---|
| 0 | Hearth Isle (meadow) | start | 1-5, no hostiles |
| 1 | Verdant Jungle | first boat ride (tutorial) | 3-14 |
| 2 | Coral Reef + Open Sea | Raft (12 wood, 4 vine rope) | 8-18 |
| 3 | Frostfang Tundra | Frost Cloak (6 fur, 4 amber) | 12-22 |
| 4 | Red Waste | Rocket (10 amber, 6 pearl, 6 frost crystal, 20 iron) | 18-28 |
| 5 | Drift Station | Shuttle key (Mars boss) | 24-30 |
| R | Realm | Rift Stone (any isle boss); the Town entry stays as it is today | existing |

**Generator**
- `shared/mm-isles.js` calls `MMOverworld.generate(isleSeed, {size})` **unchanged**. That already gives zones 0-3 (used as danger rings), lakes, rivers, roads, sites, reachability and `verify()`.
- It then applies a **biome pack** from `shared/mm-biome-packs.js`. A pack holds:
  - `terrainMap`: realm terrain id to biome terrain id, by zone and moisture band
  - `solidIds`
  - `landRule`: on the Ocean, land survives only where `height > 168`, which makes islets
  - `props` and `resources`: coordinate-hashed with `h2`; nodes respawn in 5 min
  - `creatures`, listed by ring
  - `hazard`, `weather`, `music`, `palette` and a `dayNight` tint
- New terrain ids are 32-127; ids 0-17 keep their realm meaning (b10t/b11 art applies).
- `isleSeed = save.seed + ':' + pack + ':v1'`.
  - `save.seed` is drawn once with `crypto.getRandomValues`; co-op uses the host's seed.
  - Everything else comes from `MMRng`.
  - A test asserts that 5 realm `MMOverworld.hash` goldens are unchanged.
- **Time:** local clock in 4 phases (nocturnal species at night), season by month, weather seeded per 10-minute slot so co-op agrees.

## (c) Biomes

**Table key**
- **Lv:** wild level band. **HP** and **ATK** are at level 10. **SPD** is in px/s (the hero moves at 150).
- **Size:** S = 64 logical px (256 px cell), B = 96 (384 cell), C = 128 (512 cell).
- **Tame:** F = feed, C = calm minigame, K = knockout then feed, X = not tameable.
- **Tier:** P = passive, N = neutral (fights back), H = hostile.

### 0. Hearth Isle (home meadow)
- **Look and sound:** sunny and safe. Major key, 92 bpm, ukulele pluck.
- **Palette:** `#3d7a33 #6fbf5a #a8e07a`, dirt `#8a5a3b #cbb890`, flowers `#f28ab2 #ffd75e`.
- **Terrain (14):** 10 existing (grass, tall_grass, flower_meadow, sand, wet_sand, shallow_water, deep_water, dirt_road, stone_road, gravel) plus tilled_soil, tilled_wet, clover_patch and garden_path.
- **Props:** existing trees, flowers, fences, well; new stable, nest, garden_plot, dock, launch_pad.
- **Resources:** wood, stone, fiber, clover, apples, honey.
- **Hazard:** none.
- **Cozy:** seasonal gardening with one seed from each biome, decorating, pond fishing, `MMBugs` catching.

| Creature | Tier | Size | Lv | HP | ATK | SPD | Tame | Role |
|---|---|---|---|---|---|---|---|---|
| clover_hopper | P | S | 1-3 | 20 | 0 | 170 | F clover | companion |
| puffwool | P | S | 1-4 | 40 | 0 | 90 | F clover | gatherer: wool |
| bumble_mote | P | S | 1-4 | 15 | 0 | 120 | F flower | gatherer: honey |
| pebble_tortle | N | S | 2-5 | 90 | 6 | 60 | F apple | builder |
| thistle_boar | N | S | 3-5 | 70 | 10 | 140 | C | fighter |
| meadow_strider | P | B | 4-5 | 160 | 8 | 210 | F golden apple x3 | first mount, no saddle |
| oakback | P (legendary) | C | 5 | 900 | 0 | 40 | F 5 golden apples on its weekly visit | gatherer: wood |

### 1. Verdant Jungle (first playable)
- **Look and sound:** canopy, temple ruins, river delta, dawn mist. Dorian mode, 104 bpm, marimba.
- **Palette:** `#0f3b2e #1f6b4a #3fa36b #8fd694`, mud `#4a3524 #6e4f33`, stone `#7d8a78 #a9b59e`, orchid `#d65db1`.
- **Terrain (12 new):** jungle_floor, jungle_moss, fern_thicket (-15% speed), mud, mud_deep (-35%), river_murk, black_sand, temple_stone, temple_moss, orchid_moss, vine_root (solid), jungle_cliff (solid).
- **Props:** jungle trees, giant_fern, banana_plant, hanging_vine, temple_pillar, temple_idol, amber_node, termite_mound.
- **Resources:** wood, vine rope, amber, cocoa, berries; raw meat comes only from hostiles.
- **Hazard:** at night, thickets puff spores (1 s telegraph, then slow).
- **Weather:** rain 30%, which doubles fish bites.
- **Cozy:** 6 river fish, orchid mantis, jewel beetle, cocoa seeds, temple decor.

| Creature | Tier | Size | Lv | HP | ATK | SPD | Tame | Role |
|---|---|---|---|---|---|---|---|---|
| glimmerfrog | P | S | 3-6 | 25 | 0 | 150 | F bugs | light-radius buddy |
| chompbill | P | S | 3-8 | 60 | 4 | 110 | F berries | gatherer |
| fernraptor | H, packs, `aimed` lunge | S | 5-12 | 85 | 14 | 190 | K raw meat | **fighter** |
| vinecoil | H, `ring` spit | S | 6-12 | 110 | 12 | 80 | X | drops vine rope |
| canopy_glider | N | S | 6-12 | 70 | 9 | 160 | C | glides over gaps |
| moth_lantern | P, night | S | 4-10 | 20 | 0 | 100 | F nectar | collection |
| tusktop | N, charges | B | 8-14 | 420 | 22 | 120 | K berries x8 | **mount + wood gatherer** |
| **fernjaw_tyrant** | Boss | C | 14 | 2600 | 34 | 140 | boss-tame | **alpha mount**, roar stuns small foes |

### 2. Coral Reef + Open Sea
- **Look and sound:** lagoons, coral, shipwrecks, and a boat-only abyss. Lydian mode, 84 bpm, steel drums.
- **Palette:** `#0b2a4a #0f5e8c #2fb5c9 #8fe8e0`, coral `#ff7f6e #ffb3a7`, sand `#f2e2b3`.
- **Terrain (11 new + water):** reef_sand, coral_shallows, kelp_bed, seagrass, tide_pool, pearl_sand, lagoon, sandbar, shell_beach, wreck_planks, abyss, sea_rock (solid).
- **Props:** existing coral, shell, palm; new kelp_tall, anemone, wreck_hull, pearl_clam, lighthouse.
- **Resources:** pearls, kelp, salt, shells, fish.
- **Hazard:** **Breath** drains over 20 s while diving. Rip currents push the boat, and squalls slow it.
- **Cozy:** deep-sea fishing, beachcombing (message bottles unlock decor), tide-pool critters.

| Creature | Tier | Size | Lv | HP | ATK | SPD | Tame | Role |
|---|---|---|---|---|---|---|---|---|
| reef_puffer | P | S | 8-10 | 40 | 0 | 90 | F kelp | bubble shield |
| shellcrab (b24 `crab_giant` art) | N | S | 8-14 | 160 | 12 | 70 | F fish | builder |
| glowjelly | H, night, `ring` | S | 9-16 | 70 | 13 | 50 | X | glow gel |
| fin_raider | H, `aimed` dash | S | 10-18 | 150 | 18 | 200 | K fish x4 | water fighter |
| tidesteed | P | B | 10-16 | 300 | 10 | 230 | F kelp x6 | **swim mount** |
| skimray | N | B | 12-18 | 360 | 16 | 260 | C | **fast sea mount** |
| isleback_turtle | P | C | 16-18 | 1800 | 0 | 50 | F sea melon x10 over 3 visits | floating stable |
| **tide_hydra** (b23 `hydra` reskin) | Boss | B | 18 | 3200 | 38 | 90 | X | Rift Stone, pearls |

### 3. Frostfang Tundra
- **Look and sound:** aurora nights, glaciers, hot springs. Aeolian mode, 70 bpm, celesta.
- **Palette:** `#1b2240 #3b4f8a #7aa0d8 #d8e8ff #ffffff`, aurora `#7fffd4 #c38bff`.
- **Terrain (13):** snow (existing), packed_snow, powder_snow (-30% speed), ice_sheet (keeps your momentum), ice_thin (cracks after 1 s), frost_rock, permafrost, tundra_moss, slush, frozen_road, hot_spring, aurora_crystal, glacier_wall (solid).
- **Props:** existing ice_spike, crystal_blue; new snow_drift, igloo, ice_arch, spring steam, frost_crystal_node.
- **Resources:** fur (a gift from your tames), frost crystal, ice, frostberries.
- **Hazard:** **Warmth** drains 1%/s outdoors, faster in a blizzard. Campfires, springs, the Frost Cloak and a Shagtusk ride stop the drain.
- **Cozy:** ice fishing, aurora moths, snow sculptures as decor.

| Creature | Tier | Size | Lv | HP | ATK | SPD | Tame | Role |
|---|---|---|---|---|---|---|---|---|
| pengling | P | S | 12-14 | 45 | 0 | 100 (slides 220) | F fish | companion |
| frostfox | N | S | 12-18 | 120 | 16 | 200 | C | **fighter**, 15% crit |
| icicle_bat | H, night, `spiral` | S | 13-20 | 80 | 14 | 170 | X | |
| rimewolf | H, packs, `aimed` | S | 14-22 | 170 | 20 | 210 | K meat x3 | pack fighter |
| shellback_glacier | N | S | 14-20 | 260 | 10 | 60 | F frostberries | builder |
| shagtusk | N | B | 16-22 | 700 | 26 | 130 | K, or F frostberries x12 | **mount with warm aura** |
| sabrefang | H | B | 18-22 | 520 | 34 | 240 | K meat x6 | **pounce mount** |
| **frost_dragon** (b23 art) | Boss | B | 22 | 4200 | 44 | 120 | X | Frost Heart |

### 4. Red Waste (Mars) and 5. Drift Station
- **Look and sound:**
  - **Mars:** rust desert, pink sky, low-gravity long jumps, crashed probes, a greenhouse dome. Phrygian mode, 96 bpm synth arps.
  - **Station:** steel and cyan zero-g corridors, ambient at 60 bpm.
- **Palettes:** Mars `#3a1410 #7a2e1c #c0582f #e8945a #f4c99a`, sky `#f0a0a0`; station `#1a2230 #33475e #6f8fa8 #bfe9ff`, warning `#ffcc33`.
- **Mars terrain (12):** regolith, red_dust, dune_red, basalt, oxide_rock, crater_floor, crater_rim (solid), co2_frost, canyon_wall (solid), lava_vent (1 s telegraph), habitat_floor, landing_pad.
- **Station terrain (8):** station_deck, station_grate, hull_wall, glow_panel, airlock, asteroid_rock, asteroid_dust, void_space.
- **Props:** rover_wreck, probe_lander, oxygen_plant, greenhouse_dome, solar_panel, antenna, meteor_rock, terminal, hydro_planter.
- **Resources:** iron, oxide dust, ice cores, meteor glass, data chips.
- **Hazard:** **Oxygen** drains over 90 s. Oxygen plants, the dome and a Bubblemoth refill it. Dust storms come in 25% of weather slots.
- **Cozy:** greenhouse potatoes, falling-star catching, a station fish tank.

| Creature | Tier | Size | Lv | HP | ATK | SPD | Tame | Role |
|---|---|---|---|---|---|---|---|---|
| regolith_roly | P | S | 18-20 | 70 | 0 | 90 (rolls 200) | F oxide dust | companion |
| bubblemoth | P | S | 18-24 | 60 | 0 | 140 | C | **oxygen aura** |
| rustbeetle | N | S | 18-26 | 300 | 18 | 80 | F iron x3 | iron gatherer |
| dust_devil (b24 `wind_sprite` reskin) | H, `spiral` | S | 20-28 | 160 | 24 | 180 | X | |
| scrapper_drone | H, `aimed`, station | S | 24-30 | 220 | 28 | 160 | C (hack variant) | ranged fighter |
| crater_strider | N | B | 22-28 | 650 | 28 | 220, leaps 4 tiles | K potatoes x10 | **leap mount** |
| void_grazer | P | C | 28-30 | 2400 | 0 | 60 | F meteor glass x8 | flying mount |
| **red_titan** (b23 `sand_titan` reskin) | Boss | B | 28 | 5200 | 50 | 100 | boss-tame | burrow mount |
| **station_warden** (b23 `clockwork_golem` reskin) | Boss | B | 30 | 6000 | 54 | 90 | X | |

### R. Realm
Unchanged. From Wave 3, **one** companion fighter may follow you in (DPS clamped to 25% of the hero's, no mounts).

## (d) Taming + survival (PvE only)

**Methods.** Each creature's card and a head icon show its method.
1. **Feed**
   - Approach under 60% speed and hold **A** with food. Trust gains `foodValue x pref`: preferred 1, liked 0.5, other 0.
   - Sprinting, fighting nearby or hitting it costs 10 trust. At 0 it skips away.
2. **Calm**
   - 3-5 taps on a shrinking ring, scored by `MMJam.judge`: perfect +25, great +18, good +10, miss -5.
   - It never fails, and a hold mode is available.
3. **Knockout, then feed**
   - **Tranq (B)** makes your class bolt non-lethal: 0 HP damage, `torpor = dmg`. Tranq bolts are free, with no ammo.
   - At full torpor the creature sleeps 60 s. Torpor only decays after 30 s without hits, and a Sleepy Herb adds 10 s.
   - Feed it while it sleeps. Hostiles never attack a sleeper.
   - If it wakes, it keeps 50% of the progress for 10 min.

**Boss-tame.** At 25% HP the boss kneels, **Weary**, for 20 s and stops attacking. Tranq it (about 15 s), then feed it a **Feast** (4 meat, 4 berries, 1 amber) during its 90 s sleep. You can have one alpha per boss, and bosses can be refought for loot.

**Result**
- `bond = clamp(100 - 0.5 x dmgTakenPct - 5 x wrongFoods, 60, 100)`.
- Bonus levels = `floor(lv x bond / 200)`, so a level-10 tame at bond 100 joins at level 15.
- The first tame each day gets double trust. It is a bonus, not a penalty.

**Stats**
- HP, ATK, SPD, CARRY and STAMINA (mounts only). `stat = base x (1 + 0.06 x (L-1))`.
- Tames can gain up to +20 levels (cap 50). Each level gives 1 player-chosen point: HP +5%, ATK +4%, SPD +1% (max +15%), CARRY +5 or STAMINA +5%.
- Companions earn XP from 50% of kill XP, from gathering and from rides.
- **Tamer Rank** (1-30) unlocks stable slots and recipes, never stats.

**Roles.** All companion AI lives in pure `mm-creatures.js`, with the states `wander, flee, aggro, follow, stay, attack, ride, gather, sleep`.

| Role | Out at once | Behaviour |
|---|---|---|
| Fighter | 1 (2 at Rank 15) | Follows at 1.5 tiles (`MMPets.follow`) and attacks your target, or the nearest hostile within 6 tiles. Retreats below 25% HP. At 0 HP it **naps** for 30 s and never dies. |
| Mount | 1 | Hold **A** to ride. Uses the mount's SPD, a stamina sprint and one ability (charge, glide, swim, leap, pounce, aura or roar). You can fire bolts at 70% rate while riding. |
| Gatherer | stable | Forages a home node. Offline foraging is capped at 8 h and 30 items per day. Happy idles, no quotas. |
| Builder | 1 | Adds carry capacity and halves home wall cost. |

**Controls.** Tap the portrait (or press 1/2/3, or the d-pad) to cycle **Follow → Stay → Attack target**.

**Saddles.** Workbench recipes (`saddle_tusktop`: 10 fiber, 6 wood, 2 amber), drawn as overlay strips. Until b41, the rider is the hero's idle frame 0 cropped at the waist, placed at the mount's per-frame `seat` anchor.

**Stable.** It holds 6 tames, then 12 (Rank 8), then 24 (Rank 18, the hard cap). A third duplicate of a species can go to the Sanctuary for 3 Bond Seeds, each worth +1 level on any tame.

**Breeding-lite** (optional): two bond-90+ tames in a Nest lay 1 egg per real day (eggs wait forever). Each stat comes from the higher parent 55% of the time; 3% mutation gives +2 levels and a palette swap. Hatchlings make 3 never-expiring care requests (pet, feed, walk), +10% imprint each (max +30% when you ride).

**Health and hunger-lite**
- Hero stats are the active Lantern hero's class profile, read-only from `pixeltown-mm-v1`.
- **Well-fed** (cooked food) gives +10% speed and regen for 20 min. There is no starvation.
- Biome meters (Warmth, Breath, Oxygen) apply only in their own biome. When empty: -30% speed and 1% HP/s, never below 30% HP.
- **Fainting** to creatures wakes you at the last campfire or dock with everything you carried. Optional **Brave** mode drops unbanked resources in a satchel that waits for you.

**Crafting and building**
- About 40 one-tap recipes, each showing "missing X, found in Y".
- Home building uses the Town's `BLOCK_TYPES` (wall, fence, lamp, hedge, path) plus biome decor, tap-placed on a 40x30 grid with a 10 s undo.
- `mm-homestead.js` saves **locally only**. The Town's Firebase `blocks` ref is never used.

**Anti-grind**
- No energy gates.
- Tames take 10-90 s, a boss-tame about 3 min.
- Taming foods grow at home in 1 h.
- Every input has 2 or more sources.
- Weekly events (Oakback, meteor shower, aurora) rotate on a fixed schedule and always come back.

**Multiplayer.** `mm-isles-party.js` wraps `MMWorldParty` (pos/hit/bag, 8 Hz, 40 tiles) over `MMPartyBC`, relay only: host seed shared, own tames each, a cleaned `pet` message draws partner companions as ghosts. No Firebase, WebSocket or fetch (grep-tested); Town presence, chat and blocks unchanged.

**Realm link.** Combat reuses `mm-projectile`, `MMClasses.arenaProfile`/`arenaSignature`, `mm-aim`, `mm-pad`, b16 bolts, b18 hits and `MMDifficulty` clamps; creature attacks use the arena behaviours (`aimed`, `ring`, `spiral`). `realm.js` is never edited.

**Save**
- One new key, `pixeltown-isles-v1`: `{v, seed, at:{isle,x,y}, unlocked, res, inv, tames:[{id,sp,lv,xp,pts,stats,bond,imp,name,color,role,saddle,alpha}], stable:{slots,gath}, eggs, journal, home:{placed}, rank, flags, lastDaily}`.
- Unknown keys are kept and missing keys defaulted. Corrupt data is backed up, then the save resets. Target size is 40 KB or less.
- The hub profile gains `nodes.isles.medals`.

## (e) Art direction + Codex asset list

**Direction**
- **Quality bar:** b04-b06. Bold dark outline (`#14101c`), hue-shifted ramps with one hue family per biome, shared wood/metal/skin ramps, true back and side views, effects kept separate.
- **Readability:** big creatures must read by silhouette.
- **Display size:** cells are pre-scaled once at load: S to 32-48 px, B to 72-96, C to 112-128.
- **Creature strips:** idle 4, move 6, attack 5, death 5, each in down, up and right (12 strips).
- **Tameables:** also `sleep_down` 4 and `eat_down` 4 (14 strips).
- **Mounts:** the manifest adds a per-frame `seat` {x,y}, like `muzzle`. Saddles are 6 overlay strips (idle and move x 3 directions).
- **Fallbacks:** edges use a dithered code mask until their sets arrive, and any missing id uses a code sprite.

| Batch | Branch `codex/` | Contents | Files |
|---|---|---|---|
| **b30** FP | b30-jungle-terrain-base | 12 jungle terrains x `tile_<t>_a..d` | 48 |
| **b31a** FP | b31a-jungle-creatures-core | chompbill 14, fernraptor 14, glimmerfrog 12 | 40 |
| b31b | b31b-jungle-creatures-rest | vinecoil, canopy_glider, moth_lantern | 38 |
| **b32** FP | b32-jungle-big-and-boss | tusktop B (14 + saddle 6); fernjaw_tyrant C (14 + roar x3 + saddle 6) | 43 |
| **b33** FP (8 of the 12) | b33-jungle-props | jungle_tree_a/b 64x64, giant_fern, banana_plant, hanging_vine 32x64, temple_pillar, temple_idol, amber_node, berry_bush_jungle, termite_mound, boss_arena_ring 128x128, nest_wild | 12 |
| **b34** FP (14 of the 28) | b34-taming-ui-items | 24x24 ui_tame_trust/torpor/bond, ui_tranq_on/off, ui_cmd_follow/stay/attack, ui_saddle, ui_ride, ui_stable, ui_wellfed, ui_warmth, ui_breath, ui_oxygen, ui_tamer_rank; 48x48 ui_icon_isles, ui_icon_sea_chart; 32x32 item_raw_meat, jungle_berries, feast, sleepy_herb, amber, vine_rope, clover, golden_apple, fiber, bond_seed | 28 |
| b35 | b35-meadow-home | 4 home terrains x (4 + 16 edges); stable 96x64, nest, garden_plot_s1..s4, dock, launch_pad 96x96, workbench_isle, boat 64x32 (2 frames) | 92 |
| b36 | b36-meadow-creatures | the 7 meadow creatures (strider B, oakback C) | 98 |
| b37 | b37-ocean-terrain | 11 terrains x a..d + 3 edge sets + 7 props | 99 |
| b38 | b38-ocean-creatures | reef_puffer, glowjelly, fin_raider, tidesteed B, skimray B, isleback C | 88 |
| b39 | b39-ice-terrain | 12 terrains x a..d + 3 edge sets + 7 props | 106 |
| b40 | b40-ice-creatures | pengling, frostfox, icicle_bat, rimewolf, shellback, shagtusk B, sabrefang B | 96 |
| b41 | b41-mounts-riders | `rider_<class>_sit_<down/up/right>` for the 14 classes + missing saddles | 42+ |
| b42 | b42-mars-station-terrain | 20 terrains x a..d + 3 edge sets | 128 |
| b43 | b43-mars-creatures | roly, bubblemoth, rustbeetle, scrapper_drone, crater_strider B, void_grazer C | 82 |
| b44 | b44-space-props-vehicles | 11 props, oxygen_plant f1..f4, greenhouse_dome 128x96, boat_sail 64x64 (4 frames x 3 directions), rocket_launch 128x192 (8 frames), shuttle | 30 |
| b45 | b45-biome-edges-fx | 4 jungle edge sets; 64x64 effects fx_tame_hearts, fx_torpor_zzz, fx_trust_sparkle, fx_spore_puff, fx_bubble_o2, fx_snow_breath, fx_splash, fx_lava_vent_warn, fx_roar_ring; tileable fx_dust_storm 256x256 | 74 |

**Code reskins (no new art):** shellcrab, tide_hydra, frost_dragon, red_titan, station_warden, dust_devil.

**First-playable art:** about **153 files**. Hearth Isle uses only existing art.

## (f) Build plan

**Serial resources (one slice at a time):** `realm.js`, `realm-world.js`, `mad-maze.js`, `dungeon.js`, `main.js`, every `index.html` (the new isles page included) and `hub/`.

**Every slice:** `node --check`, zero console errors, phone + desktop screenshots, 3+ Playwright assertions (pure modules via `tests/fixtures/isles-lab.html` from B1, plus node tests), green `run-all.js`; isles tests assert `window.firebase === undefined` and no firebase-host requests.

### Wave 1: first playable (Jungle)

| Slice | Files (~lines) | Parallel | Acceptance | Test | Art |
|---|---|---|---|---|---|
| B1 Packs | `shared/mm-biome-packs.js` (450), fixture | safe | 6 packs; unique ids; every creature has stats, method and food | `shared-mm-biome-packs.test.js`, `isles-lab.test.js` | - |
| B2 Isle gen | `shared/mm-isles.js` (300) | safe after B1 | deterministic; `verify` passes on 20 seeds; 5 realm hashes unchanged; no hostiles in the spawn halo | `shared-mm-isles.test.js` | - |
| B3 Creature AI | `shared/mm-creatures.js` (350) | safe | wander→aggro→attack; passives flee; follow distance 1.5-3 tiles; level-10 stats match | `shared-mm-creatures.test.js` | - |
| B4 Taming | `shared/mm-taming.js` (300) | safe | feed/calm/KO maths; tranq does 0 HP; waking keeps 50%; no RNG | `shared-mm-taming.test.js` | - |
| B5 Save | `shared/mm-isles-save.js` (200) | safe | corrupt data tolerated; unknown keys kept; 24 cap; 40 KB or less | `shared-mm-isles-save.test.js` | - |
| B6 Page | `games/isles/index.html, isles.js, isles-world.js, isles.css` (900) | **serial** | jungle renders with fallbacks; joystick moves; minimap; no Firebase; 40+ fps at 390x844 | `isles-page.test.js` | b30 |
| B7 Creatures + combat | `isles-combat.js` (500) | serial | 40 cap; bolts damage a fernraptor; faint keeps the inventory | `isles-combat.test.js` | b31a |
| B8 Taming in play | `isles-tame.js` (350) | serial | tranq toggle; KO and feed tames a fernraptor; it appears in `tames[]`; chompbill feed-tame works | `isles-tame.test.js` | b34 |
| B9 Companion + stable | `isles-companion.js` (350) | serial | follow, attack-target and Stay; the stable panel survives a reload | `isles-companion.test.js` | - |
| B10 Big + boss-tame | `isles-boss.js` (400) | serial | ride a tusktop at x1.6; Fernjaw goes Weary, takes a Feast, and the alpha is saved; the arena renders | `isles-boss.test.js` | b32, b33 |
| B11 Doors | `main.js` (+20, Harbor sign), hub node | **serial** | the sign opens the isles page; the hub node is reachable; the `net.js` and `firebase-config.js` diff is empty; the presence test stays green | `isles-links.test.js` | ui_icon_isles |
| B12 Homestead | `shared/mm-homestead.js` (300) | serial | place, remove and undo; local save only; no `blocks` ref | `isles-home.test.js` | existing |

**FIRST PLAYABLE = B1-B10 (B11 adds the door in).** You sail to the Jungle and meet three wild species (chompbill, fernraptor packs, glimmerfrog). You tame a fernraptor (knockout) or a chompbill (feed), ride a Tusktop, and boss-tame the Fernjaw Tyrant, while your companion follows, stays and attacks. Progress saves under one new key. It is playable on code fallbacks before any art lands.

### Wave 2: home, sea, ice

| Slice | Files | Parallel | Acceptance | Test | Art |
|---|---|---|---|---|---|
| B13 Mounts | `isles-mount.js` (300) | serial | craft a saddle; rider sits at `seat`; fire at 70% rate while riding | `isles-mount.test.js` | b32 |
| B14 Sea Chart | `isles-chart.js` (250) | serial | locked isles show their cost; the Raft unlocks the Reef; trip takes 4 s or less | `isles-chart.test.js` | b34 |
| B15 Ocean | `isles-sea.js` (400) | serial | the boat crosses the abyss and walking cannot; Breath drains and refills; ride a tidesteed | `isles-sea.test.js` | b37, b38 |
| B16 Calm | `isles-calm.js` (200) | serial | perfect gives +25; a miss never fails; hold mode works | `isles-calm.test.js` | b45 |
| B17 Tundra | pack + hazard (300) | serial | Warmth drains; the spring stops it; ice momentum; shagtusk aura | `isles-tundra.test.js` | b39, b40 |
| B18 Gatherers | `mm-homestead.js` (+200) | safe | yields items; 8 h and 30/day caps; unassign works | `isles-gather.test.js` | - |
| B19 Life | `shared/mm-isles-life.js` (300) | safe | biome fish pools; 1 h growth; journal counts | `isles-life.test.js` | b35 |

### Wave 3: space, breeding, co-op, Realm

| Slice | Files | Parallel | Acceptance | Test | Art |
|---|---|---|---|---|---|
| B20 Mars | `isles-mars.js` (400) | serial | the rocket needs 4 parts; the bubblemoth refills O2; storms are deterministic | `isles-mars.test.js` | b42-b44 |
| B21 Station | `shared/mm-station.js` (250) | serial | layout hash is stable; Warden renders; shuttle key flow works | `isles-station.test.js` | b42, b44 |
| B22 Breeding | `mm-taming.js` (+250) | safe + UI | about 55% higher-stat inheritance over 1000 seeded eggs; requests never expire; imprint caps at 30% | `isles-breed.test.js` | b22 eggs |
| B23 Co-op | `shared/mm-isles-party.js`, `isles-team.js` (300) | safe + serial hook | partner and pet ghosts draw; bad messages rejected; grep finds no firebase, WebSocket or fetch | `isles-team.test.js` | - |
| B24 Realm bridge | `realm-world.js` (+40), sim | **serial** | the companion follows in `?mode=world`; its DPS is 25% or less of the hero's; realm goldens unchanged | `isles-realm-bridge.test.js`, `isles-balance-sim.test.js` | - |

Codex art and B1-B5 run in parallel; page slices queue.

## (g) Risks and cuts

| Risk | Mitigation | Cut first |
|---|---|---|
| Scope | Ship the Jungle, then apply the fun gate before Wave 2. A biome is a pack plus a creature table. | Station, breeding, void_grazer, oakback |
| Art volume (~1,100 files) | Fallbacks, base tiles before edges, 6 reskins, rider made by code crop | b41, half the edges, b31b |
| Phone performance | Pre-scaled strips, 40-creature cap, chunk LRU 24, culling, fps probe | Weather overlays at low fps |
| Save size | Compact arrays, caps, a 40 KB test | Per-catch journal |
| LIVE database | No Firebase SDK; BroadcastChannel only; local homestead; B11 diff assert | Online isles party until the rules are applied |
| Realm regressions | Generator unchanged and hash-tested; `realm.js` untouched; only B24 edits `realm-world.js` | B24 |
| Grindy or cruel taming | No fail rolls, no decay, tames never die, daily bonus only | Gatherer automation |


## Canonical names (lead reconciliation between this concept and BIOME-ARCH-PLAN.md)
- Page directory: `games/isles/` (this concept). Engine plan slices A1-A6/B7-B10 in BIOME-ARCH-PLAN.md are the build order for the engine; the concept's B1-B24 list is the content/feature order on top of it.
- Save keys: `pixeltown-tames-v1` (stable of tamed creatures) and `pixeltown-archipelago-v1` (islands, positions, creature log) from the arch plan are canonical; the concept's `pixeltown-isles-v1` is NOT used (fold any extra fields into these two keys). Medals: `pixeltown-medals-isles-v1`.
- Terrain ids: new ids are appended from 18 up in `mm-overworld.js` TERRAIN_NAMES (ids 0..17 never move); the concept's 32-127 range is a reserved budget, not a requirement.
- Home building is a NEW local-only module (`mm-homestead.js`): the Town's building system writes to the live Firebase `blocks` ref and must never be reused.
