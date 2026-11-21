# Hearthvale Isles: biome archipelago + Pixel Ark taming (concept)

This concept answers the owner's request for Mars/space, jungle, ice and ocean biomes, Animal Crossing coziness, and ARK-style fighting and taming of big creatures (PvE only). The research behind it is in `RESEARCH-BIOME-WORLD.md`. Standing rules: Firebase is untouched, saves are additive, art is original, and nothing existing is removed.

## (a) Pitch and pillars

**Pitch.** Hearthvale's dock gets a boat, and the boat sails to **Hearth Isle**, your own meadow island. You build a stable, a garden and a home there. From Hearth Isle you sail to a ring of wild islands:
- the steaming **Verdant Jungle**
- the **Coral Reef** and the open sea
- the **Frostfang Tundra**
- and, by rocket, the **Red Waste** of Mars and an orbiting **Drift Station**

Every island has small critters to befriend, mid-size creatures to tame as fighting buddies, big beasts to saddle and ride, and a boss you can *tame* once you have beaten it down. What you bring back makes your island grow. For real danger, the Realm's Godlands are one portal away.

**Pillars.**
1. **Befriend, don't grind.** Taming takes skill and the right food. There are no fail rolls, and no timer can make you lose a tame.
2. **Every biome is a full bundle:** terrain, palette, music, weather, critters, fish, bugs, resources, one hazard and one boss.
3. **Home grows from away.** Every trip brings back something you can place, plant or ride.
4. **Danger depends on place, never on the clock.** Home is safe, island rims are gentle, and island cores and bosses are hard.
5. **Thumb-first.** One context button and one tranq toggle, on top of the existing twin-stick controls.

## (b) World structure

```
Pixeltown hub ── node "Archipelago" ──┐
Hearthvale Town (Firebase presence UNCHANGED) ── Harbor sign at the dock ──> games/isles/index.html (Sea Chart)
 Hearth Isle 96² ──boat──> Verdant Jungle 192² ──raft──> Coral Reef + Open Sea 256²
        │                         └─ Frost Cloak ──> Frostfang Tundra 192²
        └─ rocket ──> Red Waste (Mars) 192² ── shuttle ──> Drift Station 64x48 (fixed layout)
 Any isle ── Rift portal (b14 portal_boss) ──> Realm ?mode=world (Godlands endgame, unchanged)
```

**Page.** `games/isles/index.html` is a plain canvas page: no Phaser and **no Firebase SDK**. The only change to the Town is a signpost link next to the existing dock NPC; nothing in its network code changes. The Realm keeps all of its entry points.

**Travel.**
- **Boat.** Tapping a destination on the Sea Chart plays a 4 s sailing transition with a bonus cast-a-line moment.
- **Open Sea.** This is the one map you sail yourself. The boat is a vehicle that uses the mount controls.
- **Rocket.** The rocket is a launch pad on Hearth Isle with a 6 s cutscene.
- **Rift.** The Rift opens `mad-maze/index.html?mode=world&from=isles` and returns you to the Rift tile.

**Unlock order.** Each island is unlocked with things you collected earlier, never with waiting time.

| # | Island | Unlock | Creature levels |
|---|---|---|---|
| 0 | Hearth Isle (meadow) | start | 1-5, no hostiles |
| 1 | Verdant Jungle | first boat ride (tutorial) | 3-14 |
| 2 | Coral Reef + Open Sea | Raft (12 wood, 4 vine rope) | 8-18 |
| 3 | Frostfang Tundra | Frost Cloak (6 fur, 4 amber) | 12-22 |
| 4 | Red Waste | Rocket (10 amber, 6 pearl, 6 frost crystal, 20 iron) | 18-28 |
| 5 | Drift Station | Shuttle key from the Mars boss | 24-30 |
| R | Realm | Rift Stone (any isle boss); the Realm stays open from the Town as it is today | existing |

**Generator plan.**
- `shared/mm-isles.js` calls `MMOverworld.generate(isleSeed, {size})` **unchanged**. That call already supplies zones 0-3 (used here as danger rings), lakes, rivers, roads, sites, reachability and `verify()`.
- It then applies a **biome pack** from `shared/mm-biome-packs.js`. Each pack contains:
  - `terrainMap`: realm terrain id to biome terrain id, by zone and moisture/detail band
  - `solidIds`
  - `landRule`: Ocean keeps land only where `height > 168`, which turns the island into an archipelago of islets
  - `props`: coordinate-hashed with `h2`, so no RNG stream shifts
  - `resources`: nodes, each with a 5-minute respawn
  - `creatures`: by ring
  - `hazard`, `weather`, `music`, `palette` and a `dayNight` tint
- **Terrain ids.** Biome terrain ids are 32-127 in `MMBiomePacks.TERRAIN`. Ids 0-17 keep their realm meaning, so the b10t/b11 art still works.
- **Seeds.** `isleSeed = save.seed + ':' + pack + ':v1'`. `save.seed` comes from `crypto.getRandomValues` once at first launch; a co-op party uses the host's. All world content after that goes through `MMRng`.
- **Golden test.** A test asserts that `MMOverworld.hash` is unchanged for 5 realm seeds.
- **Time.** Day/night follows the local clock in four phases (morning, day, evening, night), and nocturnal species appear only at night. Season comes from the month, the same as the Town's seasonal tint. Weather is seeded per 10-minute slot, so co-op partners see the same weather.

## (c) Biomes

**How to read the tables.**
- **Lv** is the wild level band.
- **HP** and **ATK** are values at level 10.
- **SPD** is in px/s; the hero moves at 150.
- **Size** is the logical grid: S = 64 (256 px cell), B = 96 (384 px cell), C = 128 (512 px cell).
- **Tame**: F = feed, C = calm minigame, K = knockout then feed, X = cannot be tamed.
- **Tiers**: P = passive, N = neutral (fights back), H = hostile.

### 0. Hearth Isle (home meadow)
- **Feel:** sunny and safe. Music is major mode at 92 bpm with a ukulele pluck.
- **Palette:** `#3d7a33 #6fbf5a #a8e07a`, dirt `#8a5a3b #cbb890`, flowers `#f28ab2 #ffd75e`.
- **Terrain (14):** 10 existing (grass, tall_grass, flower_meadow, sand, wet_sand, shallow_water, deep_water, dirt_road, stone_road, gravel) plus 4 new: tilled_soil, tilled_wet, clover_patch, garden_path.
- **Props:** existing trees, bush_berry, flowers, fence, well and crate, plus new stable, nest, garden_plot (4 stages), dock, launch_pad and workbench_isle.
- **Resources:** wood, stone, fiber, clover, apples, honey.
- **Hazard:** none.
- **Cozy:** gardening with seasonal seeds and one seed from each biome, decorating, pond fishing, and `MMBugs` catching.

| Creature | Tier | Size | Lv | HP | ATK | SPD | Tame (food) | Role |
|---|---|---|---|---|---|---|---|---|
| clover_hopper | P | S | 1-3 | 20 | 0 | 170 | F clover | companion |
| puffwool | P | S | 1-4 | 40 | 0 | 90 | F clover | gatherer: wool |
| bumble_mote | P | S | 1-4 | 15 | 0 | 120 | F flower | gatherer: honey |
| pebble_tortle | N | S | 2-5 | 90 | 6 | 60 | F apple | builder (carry +40) |
| thistle_boar | N | S | 3-5 | 70 | 10 | 140 | C | fighter |
| meadow_strider | P | B | 4-5 | 160 | 8 | 210 | F golden apple x3 | first mount (no saddle) |
| oakback | P legendary | C | 5 | 900 | 0 | 40 | F 5 golden apples on its weekly visit | gatherer: wood |

### 1. Verdant Jungle (first playable)
- **Feel:** humid canopy, temple ruins, a river delta and mist at dawn. Music is dorian mode at 104 bpm with marimba and frog clicks.
- **Palette:** `#0f3b2e #1f6b4a #3fa36b #8fd694`, mud `#4a3524 #6e4f33`, stone `#7d8a78 #a9b59e`, orchid `#d65db1`.
- **Terrain (12 new):** jungle_floor, jungle_moss, fern_thicket (-15% speed), mud, mud_deep (-35% speed), river_murk, black_sand, temple_stone, temple_moss, orchid_moss, vine_root (solid), jungle_cliff (solid). Water is reused.
- **Props:** jungle_tree_a/b, giant_fern, banana_plant, hanging_vine, temple_pillar, temple_idol, amber_node, berry_bush_jungle, termite_mound, plus the existing palm, log and mushroom_ring.
- **Resources:** wood, vine rope, amber, cocoa, berries, and raw meat (from hostiles only).
- **Hazard:** at night, fern thickets release spore puffs (1 s telegraph, then slow). Weather: rain 30% of the time, which doubles fish bites.
- **Cozy:** six river fish, orchid mantis and jewel beetle bugs, cocoa and orchid seeds, and temple decor recipes.

| Creature | Tier | Size | Lv | HP | ATK | SPD | Tame | Role |
|---|---|---|---|---|---|---|---|---|
| glimmerfrog | P | S | 3-6 | 25 | 0 | 150 | F bugs | companion: light radius |
| chompbill | P | S | 3-8 | 60 | 4 | 110 | F berries | gatherer: berries/fiber |
| fernraptor | H, packs of 2-3, `aimed` lunge | S | 5-12 | 85 | 14 | 190 | K raw meat | **fighter** |
| vinecoil | H, `ring` spit | S | 6-12 | 110 | 12 | 80 | X | drops vine rope |
| canopy_glider | N | S | 6-12 | 70 | 9 | 160 | C | glide over gaps |
| moth_lantern | P, night | S | 4-10 | 20 | 0 | 100 | F nectar | collection |
| tusktop | N, charges | B | 8-14 | 420 | 22 | 120 | K berries x8 | **mount + gatherer: wood** |
| **fernjaw_tyrant** | Boss | C | 14 | 2600 | 34 | 140 | boss-tame | **alpha mount**, roar stuns small creatures |

### 2. Coral Reef + Open Sea
- **Feel:** lagoons, coral gardens, shipwrecks, and a deep abyss you can only cross by boat. Music is lydian mode at 84 bpm with steel-drum pads.
- **Palette:** `#0b2a4a #0f5e8c #2fb5c9 #8fe8e0`, coral `#ff7f6e #ffb3a7`, sand `#f2e2b3`.
- **Terrain (11 new + water):** reef_sand, coral_shallows, kelp_bed, seagrass, tide_pool, pearl_sand, lagoon, sandbar, shell_beach, wreck_planks, abyss (boat only), sea_rock (solid).
- **Props:** existing coral, shell, driftwood and palm, plus kelp_tall, anemone, wreck_hull, wreck_mast, pearl_clam, buoy and lighthouse.
- **Resources:** pearls, kelp, salt, shells, fish.
- **Hazard:** **Breath** drains over 20 s while you dive, and rip-current tiles push the boat. Weather: squalls slow the boat.
- **Cozy:** deep-sea fishing, beachcombing (message bottles unlock decor), and tide-pool critters.

| Creature | Tier | Size | Lv | HP | ATK | SPD | Tame | Role |
|---|---|---|---|---|---|---|---|---|
| reef_puffer | P | S | 8-10 | 40 | 0 | 90 | F kelp | 2 s bubble shield |
| shellcrab (b24 `crab_giant` art) | N | S | 8-14 | 160 | 12 | 70 | F fish | builder (carry +60) |
| glowjelly | H, night, `ring` | S | 9-16 | 70 | 13 | 50 | X | drops glow gel |
| fin_raider | H, `aimed` dash | S | 10-18 | 150 | 18 | 200 | K fish x4 | fighter (in water) |
| tidesteed | P | B | 10-16 | 300 | 10 | 230 | F kelp x6 | **swim mount** |
| skimray | N | B | 12-18 | 360 | 16 | 260 | C | **fast sea mount** |
| isleback_turtle | P | C | 16-18 | 1800 | 0 | 50 | F sea melon x10 over 3 visits | floating stable/dock |
| **tide_hydra** (reskin of b23 `hydra`) | Boss | B | 18 | 3200 | 38 | 90 | X | drops a Rift Stone and pearls |

### 3. Frostfang Tundra
- **Feel:** aurora nights, glaciers, hot springs. Music is aeolian mode at 70 bpm with celesta and wind.
- **Palette:** `#1b2240 #3b4f8a #7aa0d8 #d8e8ff #ffffff`, aurora `#7fffd4 #c38bff`.
- **Terrain (13):** snow (existing), packed_snow, powder_snow (-30% speed), ice_sheet (slippery, carries momentum), ice_thin (cracks after 1 s), frost_rock, permafrost, tundra_moss, slush, frozen_road, hot_spring, aurora_crystal, glacier_wall (solid).
- **Props:** existing ice_spike, crystal_blue and tree_pine, plus pine_snowy, snow_drift, igloo, ice_arch, frozen_tusk, hot_spring_steam (animated) and frost_crystal_node.
- **Resources:** fur (a gift from tames), frost crystal, ice, frostberries.
- **Hazard:** **Warmth** drains 1% per second outdoors and faster in a blizzard. Campfires, hot springs, the Frost Cloak or riding a Shagtusk stop the drain.
- **Cozy:** ice fishing, aurora moths, frostberry bushes, and snow sculptures you can place as decor.

| Creature | Tier | Size | Lv | HP | ATK | SPD | Tame | Role |
|---|---|---|---|---|---|---|---|---|
| pengling | P | S | 12-14 | 45 | 0 | 100 (slides 220) | F fish | companion |
| frostfox | N | S | 12-18 | 120 | 16 | 200 | C | **fighter**, crit 15% |
| icicle_bat | H, night, `spiral` | S | 13-20 | 80 | 14 | 170 | X | |
| rimewolf | H, packs of 3, `aimed` | S | 14-22 | 170 | 20 | 210 | K meat x3 | fighter (pack bonus) |
| shellback_glacier | N | S | 14-20 | 260 | 10 | 60 | F frostberries | builder (carry +80) |
| shagtusk | N | B | 16-22 | 700 | 26 | 130 | K, or F frostberries x12 | **mount with warm aura**, gatherer: ice |
| sabrefang | H | B | 18-22 | 520 | 34 | 240 | K meat x6 | **combat mount: pounce** |
| **frost_dragon** (b23 art) | Boss | B | 22 | 4200 | 44 | 120 | X | drops Frost Heart |

### 4. Red Waste (Mars) and 5. Drift Station
- **Feel:** a rust desert under a pink sky. Low gravity makes jumps arc further, and the map has crashed probes and a greenhouse dome. The station is steel and cyan, with zero-g corridors.
- **Music:** Mars is phrygian mode at 96 bpm with synth arps; the station is ambient at 60 bpm.
- **Palettes:** Mars `#3a1410 #7a2e1c #c0582f #e8945a #f4c99a`, sky `#f0a0a0`. Station `#1a2230 #33475e #6f8fa8 #bfe9ff`, warning `#ffcc33`.
- **Mars terrain (12):** regolith, red_dust, dune_red (-15% speed), basalt, oxide_rock, crater_floor, crater_rim (solid), co2_frost, canyon_wall (solid), lava_vent (hazard with a 1 s telegraph), habitat_floor, landing_pad.
- **Station terrain (8):** station_deck, station_grate, hull_wall (solid), glow_panel, airlock, asteroid_rock, asteroid_dust, void_space (solid).
- **Props:** rover_wreck, probe_lander, oxygen_plant, greenhouse_dome, solar_panel, antenna, meteor_rock, cargo_crate_sci, terminal, docking_arm, hydro_planter.
- **Resources:** iron, oxide dust, ice cores, meteor glass, data chips.
- **Hazard:** **Oxygen** drains over 90 s. Oxygen plants, the dome or a Bubblemoth companion refill it. Dust storms (25% of slots) shrink the view and push you.
- **Cozy:** greenhouse potatoes and space tomatoes, catching falling stars during meteor showers, and a hydroponics corner and cosmic fish tank on the station.

| Creature | Tier | Size | Lv | HP | ATK | SPD | Tame | Role |
|---|---|---|---|---|---|---|---|---|
| regolith_roly | P | S | 18-20 | 70 | 0 | 90 (rolls 200) | F oxide dust | companion |
| bubblemoth | P | S | 18-24 | 60 | 0 | 140 | C | **oxygen aura** |
| rustbeetle | N | S | 18-26 | 300 | 18 | 80 | F iron x3 | gatherer: iron |
| dust_devil (reskin of b24 `wind_sprite`) | H, `spiral` | S | 20-28 | 160 | 24 | 180 | X | |
| scrapper_drone | H, `aimed`, station | S | 24-30 | 220 | 28 | 160 | C (hack variant) | ranged fighter |
| crater_strider | N | B | 22-28 | 650 | 28 | 220, leaps 4 tiles | K potatoes x10 | **leap mount** |
| void_grazer | P | C | 28-30 | 2400 | 0 | 60 | F meteor glass x8 | flying mount |
| **red_titan** (reskin of b23 `sand_titan`) | Boss | B | 28 | 5200 | 50 | 100 | boss-tame | burrow mount |
| **station_warden** (reskin of b23 `clockwork_golem`) | Boss | B | 30 | 6000 | 54 | 90 | X | |

### R. Realm / Godlands
The Realm itself does not change. From Wave 3, **one** companion fighter may follow you into the Realm world. Its DPS is clamped to 25% or less of the hero's, and mounts are not allowed there.

## (d) Taming + survival (PvE only)

**Methods.** Each creature's card and head icon show which method it needs.
1. **Feed.**
   - Approach at under 60% speed and hold **A** to offer food. Trust rises by `foodValue x pref`, where pref is 1.0 for preferred food, 0.5 for liked food and 0 otherwise.
   - Sprinting, fighting nearby or hitting the creature costs 10 trust. At 0 trust it skips away.
   - Big creatures eat one item per 1.2 s eat animation.
2. **Calm.**
   - Tap **A** to start 3-5 timed taps on a shrinking ring, scored by `MMJam.judge`: perfect +25, great +18, good +10, miss -5.
   - Calming can never fail; you can always retry. An accessibility "hold" mode is available.
3. **Knockout, then feed.**
   - The **Tranq toggle (B)** turns your class bolt shape (from `mm-projectile`) non-lethal. A tranq bolt deals 0 HP damage and `torpor = dmg`.
   - At max torpor the creature sleeps for 60 s. Torpor only decays after 30 s without a hit, and a Sleepy Herb adds 10 s of sleep.
   - Feed it while it sleeps. Hostiles can hit *you* but never the sleeper.
   - If it wakes, it keeps 50% of its progress for 10 minutes.
   - Tranq bolts are free; they cost no ammo.

**Boss-tame.** At 25% HP the boss kneels **Weary** for 20 s and stops attacking. Tranq it (about 15 s), then feed it a **Feast** while it sleeps (90 s). A Feast costs 4 meat, 4 berries and 1 amber. You get one alpha per boss per save, and the boss can be refought for loot at any time.

**Result.**
- `bond = clamp(100 - 0.5 x dmgTakenPct - 5 x wrongFoods, 60, 100)`.
- Bonus levels on taming = `floor(lv x bond / 200)`, so a level-10 tame at bond 100 joins at level 15.
- The first tame of each day gives double trust. It is a bonus, never a penalty.

**Stats and levelling.**
- Stats are HP, ATK, SPD, CARRY and STAMINA (mounts only), with `stat = base x (1 + 0.06 x (L-1))`.
- After taming, a creature can gain up to +20 levels (cap 50). Each level gives one point the player assigns: HP +5%, ATK +4%, SPD +1% (max +15%), CARRY +5, or STAMINA +5%.
- Companions earn XP from 50% of kill XP, from gathering and from rides.
- **Tamer Rank** (1-30) grows stable size and unlocks recipes. It never inflates stats.

**Roles.** All companion AI is in pure `mm-creatures.js`, with the states `wander, flee, aggro, follow, stay, attack, ride, gather, sleep`.

| Role | Active at once | Behaviour |
|---|---|---|
| Fighter | 1 (2 at Tamer Rank 15) | Follows at 1.5 tiles (`MMPets.follow`) and attacks your target or the nearest hostile within 6 tiles. It retreats below 25% HP, and at 0 HP it **naps** for 30 s instead of dying. |
| Mount | 1 | Hold **A** to ride. Movement uses the mount's SPD, with a stamina sprint and one ability (charge, glide, swim, leap, pounce, warm aura or roar). You can fire your class bolts at 70% rate while riding. |
| Gatherer | stable only | Forages a home node while you play elsewhere. Offline time is capped at 8 h and 30 items per creature per day. It plays happy idle animations and has no quotas. |
| Builder | 1 | Adds carry capacity and halves the cost of home walls and fences. |

**Controls.** Tap the companion portrait (or press 1/2/3, or the d-pad) to cycle **Follow → Stay → Attack my target**.

**Saddles.** Saddles are crafted at the home workbench; for example `saddle_tusktop` costs 10 fiber, 6 wood and 2 amber. The strider and the isleback need none. Saddles are drawn as separate overlay strips. Until b41 arrives, the rider is the hero's idle frame 0 cropped at the waist and drawn at the mount's per-frame `seat` anchor.

**Stable.**
- **Slots:** 6, then 12 (Tamer Rank 8, plus 20 wood and 10 stone), then 24 (Rank 18, plus 10 amber and 10 iron). 24 tames is the hard cap.
- **Duplicates:** a third copy of a species is offered "Release to the Sanctuary" for 3 Bond Seeds (each gives +1 level to any tame).

**Breeding-lite** (optional).
- Two tames of the same species with bond 90 or more in a Nest make one egg per real day. The egg waits forever.
- Each stat comes from the higher parent with 55% chance.
- 3% chance of a mutation: +2 levels and a palette swap (4 per species, done in code).
- A hatchling makes 3 care requests (pet, feed, a 60-tile walk). Each one completed adds +10% imprint, up to +30% stats when you ride it yourself. Requests never expire.

**Health and hunger-lite.**
- **Hero:** the hero uses the active Lantern hero's class profile, read-only from `pixeltown-mm-v1`.
- **Well-fed:** cooked food gives +10% speed and regeneration for 20 minutes. There is no starvation.
- **Hazard meters:** Warmth, Breath and Oxygen exist only in their own biome. An empty meter slows you by 30% and drains 1% HP per second, but never below 30% HP.
- **Fainting:** at 0 HP from creatures you wake at the last campfire or dock with everything you carried. An optional **Brave** mode drops your unbanked resources in a satchel that waits until you pick it up.

**Crafting and building.**
- About 40 recipes, each crafted with one tap and showing "missing X, found in Y".
- Home building uses the Town's `BLOCK_TYPES` set (wall, fence, lamp, hedge, path) plus biome decor, placed by tapping on a 40x30 grid. There is a 10 s undo.
- The new `mm-homestead.js` saves **locally only**. The Town's Firebase `blocks` ref is never used.

**Anti-grind rules.**
- No energy gates.
- Tames take 10-90 s; a boss-tame takes about 3 minutes.
- Taming foods grow at home in 1 hour, or drop in their own biome.
- Every recipe input has at least two sources.
- Weekly events (Oakback, meteor shower, aurora night) follow a fixed rotation and always come back.

**Multiplayer.**
- `mm-isles-party.js` wraps `MMWorldParty` (pos, hit and bag at 8 Hz within 40 tiles) over `MMPartyBC`. The party uses the host's seed, and each player keeps their own tames.
- A new `pet` message (species and position, cleaned and range-checked) lets partners see each other's companions as ghosts.
- There is no Firebase, socket or fetch code anywhere in the isles; a test greps for it.
- Town presence, chat and blocks are unchanged.

**Realm link.**
- Combat reuses `mm-projectile`, `MMClasses.arenaProfile` and `arenaSignature`, `mm-aim`, `mm-pad`, the b16 bolts, the b18 hits and the `MMDifficulty` clamps.
- Creature attacks map onto the arena behaviours (`aimed`, `ring` and `spiral`), so the fights read the same as the Realm's.
- `realm.js` is never edited.

**Save.**
- Everything new lives under one new key, `pixeltown-isles-v1`: `{v, seed, at:{isle,x,y}, unlocked, res, inv, tames:[{id,sp,lv,xp,pts,stats,bond,imp,name,color,role,saddle,alpha}], stable:{slots,gath}, eggs, journal:{seen,tamed,fish,bugs}, home:{placed}, rank, flags:{brave}, lastDaily}`.
- Loading keeps unknown keys, fills in defaults for missing ones, and backs up and resets on corrupt data. The target size is 40 KB or less.
- The hub profile gains `nodes.isles.medals` (an additive change).

## (e) Art direction + Codex asset list

**Direction.**
- **Style:** the b04-b06 bar: bold dark outline, hue-shifted ramps, one hue family per biome, shared outline `#14101c` and shared wood/metal/skin ramps, true back and side views, effects kept separate.
- **Phone readability:** big creatures must read by silhouette on a phone.
- **Cell sizes:** S = 256 px cells, B = 384, C = 512. Each strip is pre-scaled once at load time to its display size (S 32-48 px, B 72-96 px, C 112-128 px).

**Strip set.**
- **Creatures:** idle 4, move 6, attack 5 and death 5 frames, in down, up and right (12 strips).
- **Tameables:** add `sleep_down` (4 frames) and `eat_down` (4 frames), for 14 strips.
- **Mounts:** the manifest adds a per-frame `seat` {x,y} array, like `muzzle`.
- **Saddles:** separate overlay strips for idle and move in 3 directions (6 strips).

**Until art lands.** Edges fall back to a dithered code mask, and every id falls back to a code-drawn sprite.

| Batch | Branch `codex/` | Contents | Files |
|---|---|---|---|
| **b30** FP | b30-jungle-terrain-base | the 12 jungle terrains x `tile_<t>_a..d` | 48 |
| **b31a** FP | b31a-jungle-creatures-core | chompbill 14, fernraptor 14, glimmerfrog 12 | 40 |
| b31b | b31b-jungle-creatures-rest | vinecoil 12, canopy_glider 14, moth_lantern 12 | 38 |
| **b32** FP | b32-jungle-big-and-boss | tusktop B (14 strips + 6 saddle), fernjaw_tyrant C (14 strips + roar x3 + 6 saddle) | 43 |
| **b33** FP (first 8) | b33-jungle-props | jungle_tree_a/b 64x64, giant_fern, banana_plant, hanging_vine 32x64, temple_pillar, temple_idol, amber_node, berry_bush_jungle, termite_mound, boss_arena_ring 128x128, nest_wild | 12 |
| **b34** FP (first 14) | b34-taming-ui-items | 24x24 UI: ui_tame_trust, ui_tame_torpor, ui_tame_bond, ui_tranq_on/off, ui_cmd_follow/stay/attack, ui_saddle, ui_ride, ui_stable, ui_wellfed, ui_warmth, ui_breath, ui_oxygen, ui_tamer_rank; 48x48 ui_icon_isles, ui_icon_sea_chart; 32x32 items item_raw_meat, jungle_berries, feast, sleepy_herb, amber, vine_rope, clover, golden_apple, fiber, bond_seed | 28 |
| b35 | b35-meadow-home | 4 home terrains x (4 variants + 16 edges); stable 96x64, nest, garden_plot_s1..s4, dock, launch_pad 96x96, mailbox_isle, workbench_isle, boat 64x32 (2 frames) | 92 |
| b36 | b36-meadow-creatures | clover_hopper, puffwool, bumble_mote, pebble_tortle, thistle_boar, meadow_strider B, oakback C | 98 |
| b37 | b37-ocean-terrain | 11 terrains x a..d, edge sets for coral_shallows, lagoon and kelp_bed, 7 props (lighthouse 64x96) | 99 |
| b38 | b38-ocean-creatures | reef_puffer, glowjelly, fin_raider, tidesteed B, skimray B (+ saddle), isleback_turtle C | 88 |
| b39 | b39-ice-terrain | 12 terrains x a..d, edge sets for powder_snow, ice_sheet and hot_spring, 7 props (steam f1..f4) | 106 |
| b40 | b40-ice-creatures | pengling, frostfox, icicle_bat, rimewolf, shellback_glacier, shagtusk B, sabrefang B (+ saddles) | 96 |
| b41 | b41-mounts-riders | `rider_<class>_sit_<down/up/right>` for all 14 classes, plus any missing saddles | 42+ |
| b42 | b42-mars-station-terrain | 20 terrains x a..d, edge sets for regolith, dune_red and station_deck | 128 |
| b43 | b43-mars-creatures | regolith_roly, bubblemoth, rustbeetle, scrapper_drone, crater_strider B, void_grazer C | 82 |
| b44 | b44-space-props-vehicles | 11 Mars/station props, oxygen_plant f1..f4, greenhouse_dome 128x96, boat_sail 64x64 (4 frames x 3 directions), rocket_launch 128x192 (8 frames), shuttle 96x64 | 30 |
| b45 | b45-biome-edges-fx | jungle edge sets (fern_thicket, mud, river_murk, temple_stone); 64x64 effects fx_tame_hearts, fx_torpor_zzz, fx_trust_sparkle, fx_spore_puff, fx_bubble_o2, fx_snow_breath, fx_splash, fx_lava_vent_warn, fx_roar_ring; fx_dust_storm as a tileable 256x256 overlay | 74 |

**Reskins in code, no new art:** shellcrab (`crab_giant`), tide_hydra (`hydra`), frost_dragon, red_titan (`sand_titan`), station_warden (`clockwork_golem`), dust_devil (`wind_sprite`).

**First-playable art:** about **153 files** (b30, b31a, b32, 8 props from b33, 14 UI icons and items from b34). Hearth Isle in the first playable uses existing art only.

## (f) Build plan (24 slices, 3 waves)

**Serial files.** Only one slice at a time may touch `realm.js`, `realm-world.js`, `mad-maze.js`, `dungeon.js`, `main.js`, any `index.html` page (including the new isles page), and `hub/`.

**Every slice must pass all of these:**
- `node --check` and zero console errors
- phone and desktop screenshots
- 3 or more Playwright assertions (pure modules go through the shared fixture `tests/fixtures/isles-lab.html`, created in B1, plus node tests)
- the full `run-all.js` suite
- the isles page tests assert `window.firebase === undefined` and that no request goes to a firebase host

### Wave 1: first playable (Jungle)

| Slice | Files (~lines) | Parallel | Acceptance (3+ assertions) | Test | Art |
|---|---|---|---|---|---|
| B1 Biome packs | `shared/mm-biome-packs.js` (450), fixture | safe | 6 packs; terrain ids unique; every creature has stats, method and food; fixture shows the counts | `shared-mm-biome-packs.test.js`, `isles-lab.test.js` | - |
| B2 Isle generator | `shared/mm-isles.js` (300) | safe after B1 | deterministic; `verify` ok on 20 seeds; 5 realm hashes unchanged; no hostiles in the spawn halo | `shared-mm-isles.test.js` | - |
| B3 Creature AI | `shared/mm-creatures.js` (350) | safe | wander→aggro→attack; passive creatures flee; follow distance 1.5-3 tiles; level-10 stats match the tables | `shared-mm-creatures.test.js` | - |
| B4 Taming model | `shared/mm-taming.js` (300) | safe | feed, calm and KO maths; tranq does 0 HP damage; 60 s sleep, waking keeps 50%; no RNG in the result | `shared-mm-taming.test.js` | - |
| B5 Save | `shared/mm-isles-save.js` (200) | safe | corrupt data tolerated; unknown keys kept; 24-tame cap; max save is 40 KB or less | `shared-mm-isles-save.test.js` | - |
| B6 Page + renderer | `games/isles/index.html, isles.js, isles-world.js, isles.css` (900) | **serial** | jungle renders with fallback tiles; joystick moves the hero; minimap works; no Firebase; 40 fps or more at 390x844 | `isles-page.test.js` | b30 optional |
| B7 Wild creatures + combat | `isles-combat.js` (500) | serial | ring spawns with a cap of 40; bolts damage a fernraptor; a fainted hero wakes at the dock with its inventory | `isles-combat.test.js` | b31a |
| B8 Taming in play | `isles-tame.js` (350) | serial | tranq toggle works; KO then feed tames the fernraptor; it appears in `tames[]`; feeding tames the chompbill | `isles-tame.test.js` | b34 |
| B9 Companion + stable panel | `isles-companion.js` (350) | serial | the companion follows and attacks your target; Stay holds; the stable panel survives a reload | `isles-companion.test.js` | - |
| B10 Big tame + boss-tame | `isles-boss.js` (400) | serial | tusktop KO, then riding at x1.6 speed; Fernjaw Weary at 25%, then Feast, then alpha saved; the arena renders | `isles-boss.test.js` | b32, b33 |
| B11 Doors in | `main.js` (+20: Harbor sign), hub map node | **serial** | the sign opens `games/isles/?from=town`; the hub node is reachable; the diff of `net.js` and `firebase-config.js` is empty; the presence test stays green | `isles-links.test.js` | ui_icon_isles |
| B12 Hearth Isle homestead | `shared/mm-homestead.js` (300), home mode | serial | place and remove with a 10 s undo; saved only to `pixeltown-isles-v1`; stable and garden render; no `blocks` ref is touched | `isles-home.test.js` | existing |

**FIRST PLAYABLE = B1-B10, plus B11 for the door.** You sail to the Jungle and meet three wild species: chompbill (passive), fernraptor (hostile pack) and glimmerfrog. You tame one mid creature (fernraptor by knockout, or chompbill by feeding), ride a Tusktop, then take the boss-tame of the Fernjaw Tyrant. Your companion follows, stays and attacks. It all saves under one new key, and the whole slice is playable with code fallbacks before any of the 153 art files arrive.

### Wave 2: home, sea, ice

| Slice | Files | Parallel | Acceptance | Test | Art |
|---|---|---|---|---|---|
| B13 Mounts + saddles | `isles-mount.js` (300) | serial | the saddle can be crafted; the rider is drawn at the `seat` anchor; fire rate while riding is 70% | `isles-mount.test.js` | b32 |
| B14 Sea Chart + unlocks | `isles-chart.js` (250) | serial | locked isles show their cost; the Raft unlocks the Reef; travel takes 4 s or less | `isles-chart.test.js` | b34 |
| B15 Ocean + boat + Breath | `isles-sea.js` (400) | serial | the boat crosses the abyss and walking cannot; Breath drains and refills; tidesteed can be fed, tamed and swum | `isles-sea.test.js` | b37, b38 |
| B16 Calm minigame | `isles-calm.js` (200) | serial | a perfect tap gives +25; a miss never fails; hold mode works | `isles-calm.test.js` | b45 fx |
| B17 Tundra + Warmth | pack + hazard (300) | serial | Warmth drains and the hot spring stops it; ice carries momentum; the shagtusk aura works | `isles-tundra.test.js` | b39, b40 |
| B18 Gatherers | `mm-homestead.js` (+200) | safe + panel | yields items; 8 h and 30-per-day caps; unassigning works | `isles-gather.test.js` | - |
| B19 Fish, bugs, garden | `shared/mm-isles-life.js` (300) | safe | biome fish pools; 1 h growth; journal counts | `isles-life.test.js` | b35 |

### Wave 3: space, breeding, co-op, Realm

| Slice | Files | Parallel | Acceptance | Test | Art |
|---|---|---|---|---|---|
| B20 Mars + Oxygen + rocket | `isles-mars.js` (400) | serial | the rocket needs its 4 parts; Oxygen drains and the bubblemoth refills it; storm slots are deterministic | `isles-mars.test.js` | b42-b44 |
| B21 Drift Station | `shared/mm-station.js` (250) | serial | the layout hash is stable; the Warden reskin renders; the shuttle key flow works | `isles-station.test.js` | b42, b44 |
| B22 Breeding + imprint | `mm-taming.js` (+250), nest UI | safe + UI | the higher stat is inherited about 55% of the time over 1000 seeded eggs; requests never expire; imprint caps at 30% | `isles-breed.test.js` | b22 eggs |
| B23 Co-op relay | `shared/mm-isles-party.js`, `isles-team.js` (300) | safe + serial hook | partner and pet ghosts are drawn; bad messages are rejected; grep finds no firebase, WebSocket or fetch | `isles-team.test.js` | - |
| B24 Realm bridge + balance | `realm-world.js` (+40), sim | **serial** | the companion follows in `?mode=world&from=isles`; its DPS is 25% or less of the hero's; realm goldens are unchanged | `isles-realm-bridge.test.js`, `isles-balance-sim.test.js` | - |

**Running in parallel.** Codex art runs throughout. B1-B5 can run in parallel with each other. The page slices queue one after another.

## (g) Risks and cuts

| Risk | Mitigation | Cut first |
|---|---|---|
| Scope | Ship the Jungle first playable and check it against the fun gate before Wave 2. A new biome is a pack plus a creature table. | Station, breeding, void_grazer, oakback |
| Art volume (~1,100 files) | Code fallbacks, base variants before edges, 6 reskins, rider drawn by a code crop | b41, half the edge sets, b31b, night critters |
| Phone performance | Strips pre-scaled at load; 40-creature cap; chunk LRU of 24 (~24 MB); culling; fps probe | Weather overlays turn off automatically at low fps |
| Save size | Compact arrays, caps on tames and placed tiles, a 40 KB test | Per-catch journal detail |
| LIVE database | No Firebase SDK on the isles page; BroadcastChannel co-op only; local homestead; the B11 diff assert; tests never write | Online isles party, until the Firebase rules are applied |
| Realm regressions | `MMOverworld` stays unchanged and is hash-tested; `realm.js` is never edited; only B24 touches `realm-world.js` | B24 |
| Taming feels grindy or cruel | No fail rolls, no decay, tames never die, 10-90 s tames, daily bonus only, gentle gatherer framing | Gatherer automation |
