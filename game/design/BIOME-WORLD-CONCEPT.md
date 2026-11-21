# Hearthvale Isles: biome archipelago + Pixel Ark taming (concept)

This concept answers the owner's request for biomes (Mars/space, jungle, ice, ocean), Animal Crossing coziness and ARK-style taming of big creatures, PvE only. Research is in `RESEARCH-BIOME-WORLD.md`. Rules that apply throughout: Firebase stays untouched, saves are additive, art is original, nothing existing is removed.

## (a) Pillars and pitch

**Pitch.** Hearthvale's dock gets a boat. It sails to **Hearth Isle**, your own meadow island where you build a stable, a garden and a cozy home. From there you sail on to a ring of wild islands: the steaming **Verdant Jungle**, the **Coral Reef** and open sea, the **Frostfang Tundra**, and finally, by rocket, the **Red Waste** of Mars and an orbiting **Drift Station**. Each island has small critters to befriend, mid-sized creatures to tame as fighting buddies, and big creatures to saddle and ride. Every island ends in a boss that you can *tame* once you have beaten it down. Bring the fruits of each biome home and your island grows. If you want real danger, the Realm's Godlands are one portal away.

**Pillars**
1. **Befriend, don't grind.** Taming is skill plus the right food. There is no random fail roll and no timers you can lose to.
2. **Every biome is a full bundle:** terrain, palette, music, weather, critters, fish, bugs, resources, one hazard meter and one boss.
3. **Home grows from away.** Every trip brings back something you can place, plant or ride.
4. **Danger by place, never by clock.** Home is safe, island rims are gentle, cores and bosses are hard.
5. **Thumb-first.** One context button, one tranq toggle and the existing twin-stick.

## (b) World structure

```
Pixeltown hub ──node "Archipelago"──┐
Hearthvale (Town, Firebase presence UNCHANGED) ── Harbor sign at the dock ──> games/isles/index.html
                                                                                │  Sea Chart (travel map)
 Hearth Isle (home, 96²) ──boat──> Verdant Jungle (192²) ──raft──> Coral Reef + Open Sea (256², boat/swim)
          │                              └─Frost Cloak──> Frostfang Tundra (192²)
          └──rocket (amber+pearl+frost crystal)──> Red Waste, Mars (192²) ──shuttle──> Drift Station (64², fixed layout)
 Any isle ──Rift portal (b14 portal_boss)──> Realm overworld ?mode=world (Godlands = danger endgame, unchanged)
```

**Pages.** A new page, `games/isles/index.html`, is a canvas page that loads no Phaser and no Firebase SDK. It has a Sea Chart overlay drawn in the style of the hub map. Hearthvale's network code is never touched: the Town only gains a Harbor signpost link next to the existing dock NPC. The Realm keeps every entry point it has.

**Travel.**
- **Boat.** A Sea Chart tap plays a 4 s sailing transition with a cast-a-line mini moment (bonus fish).
- **Ocean.** The Ocean is the one map you actually sail: the boat is a vehicle with the same controls as a mount.
- **Rocket.** The rocket is a launch-pad structure on Hearth Isle with a 6 s launch cutscene.
- **Rift.** The Rift is the existing `portal_boss` art. It hands off to `mad-maze/index.html?mode=world&from=isles`, and returning brings you back to the Rift tile.

**Unlock order.** It is soft: every unlock uses things you collected earlier, never time.

| # | Island | Unlocked by | Danger rings (creature levels) |
|---|---|---|---|
| 0 | Hearth Isle (meadow) | start | 1-5, no hostiles |
| 1 | Verdant Jungle | first boat ride from start (tutorial) | 3-14 |
| 2 | Coral Reef + Open Sea | craft a Raft (12 wood, 4 vine rope) | 8-18 |
| 3 | Frostfang Tundra | Frost Cloak (6 fur from Jungle/Reef tames, 4 amber) or ride a Shagtusk | 12-22 |
| 4 | Red Waste (Mars) | Rocket: 10 amber, 6 pearl, 6 frost crystal, 20 iron | 18-28 |
| 5 | Drift Station | Shuttle bay key from the Mars boss | 24-30 |
| R | Realm / Godlands | Rift Stone (drops from any isle boss); the Realm is already open from the Town as today | existing |

**Generator plan.**
- New module `shared/mm-isles.js` (global `MMIsles`) calls `MMOverworld.generate(isleSeed, {size})` **unchanged**, then passes it through a **biome pack** from `shared/mm-biome-packs.js` (global `MMBiomePacks`).
- Each pack holds:
  - `terrainMap`: realm terrain id to biome terrain id, chosen per zone and per moisture/detail band
  - `landRule`: for the Ocean, land survives only where `height > 168`, which gives an archipelago of islets
  - `props`: weighted, coordinate-hashed with `h2` so other streams are not disturbed
  - `resources`: node tiles with a respawn time
  - `creatures`: by ring
  - `hazard`
  - `weather` table
  - `music`
  - `palette`
  - `dayNight` tint table
- **Biome terrain ids** live in a separate table, `MMBiomePacks.TERRAIN`. Ids 32-127 are new; ids 0-17 keep their realm meaning, so b10t/b11 art still applies. Only the Uint8 terrain array is rewritten, and `solid` is recomputed from the pack's `solidIds`.
- **Seeds.** `isleSeed = save.seed + ':' + packId + ':v1'`. `save.seed` is drawn once at first launch from `crypto.getRandomValues`, stored, and shared by the co-op host. All world content comes from `MMRng`.
- **Determinism.** A test asserts that `MMOverworld.hash(generate(s))` for 5 existing realm seeds is unchanged, so the realm goldens are safe.
- **Fixed maps.** Drift Station is a hand-made layout (an `MMNexus`-style pure module, `mm-station.js`, 64x48). Hearth Isle is size 96 with every ring set to "safe".
- **Day/night** follows the local clock in 4 phases (morning 6-11, day 11-17, evening 17-21, night). Nocturnal creatures spawn only at night. Seasons come from the month, matching the Town's seasonal tint. Weather is seeded per 10-minute slot (`seed + slot`), so co-op players agree.

## (c) The biomes

Stat columns: **Lv** is the wild level band. **HP** and **ATK** are values at level 10. **SPD** is in px/s; the hero is 150. **Size** is the logical grid: S = 64 (256 px cell), B = 96 (384 cell), C = 128 (512 cell). **Tame**: F = feed (passive), C = calm minigame, K = knockout then feed, X = not tameable. Tiers: P passive, N neutral (fights back), H hostile, Boss.

### 0. Hearth Isle (home meadow)
- **Identity:** a sunny, safe meadow. Your house plot, stable, garden, dock and launch pad live here.
- **Palette:** greens `#3d7a33 #6fbf5a #a8e07a`, dirt `#8a5a3b #cbb890`, flowers `#f28ab2 #ffd75e`.
- **Terrain (14):** grass, tall_grass, flower_meadow, sand, wet_sand, shallow_water, deep_water, dirt_road, stone_road, gravel (all existing art) plus new tilled_soil, tilled_wet, clover_patch, garden_path.
- **Props:** reused prop_tree_small/medium, bush_berry, flower_*, fence, well, crate; new stable, nest, garden plot (4 growth stages), dock, launch_pad, mailbox_isle.
- **Resources:** wood, stone, fiber, clover, apples, honey (from Bumble Motes).
- **Hazards:** none. Music: major mode, 92 bpm, ukulele-like pluck.

| Creature | Tier | Size | Lv | HP | ATK | SPD | Tame (food) | Role |
|---|---|---|---|---|---|---|---|---|
| clover_hopper | P | S | 1-3 | 20 | 0 | 170 | F (clover) | companion (cosmetic) |
| puffwool | P | S | 1-4 | 40 | 0 | 90 | F (clover) | gatherer: wool |
| bumble_mote | P | S | 1-4 | 15 | 0 | 120 | F (flower) | gatherer: honey |
| pebble_tortle | N | S | 2-5 | 90 | 6 | 60 | F (apple) | builder: carry +40 |
| thistle_boar | N | S | 3-5 | 70 | 10 | 140 | C | fighter / small mount |
| meadow_strider | P | B | 4-5 | 160 | 8 | 210 | F (golden apple x3) | first mount (no saddle needed) |
| **oakback** (legendary) | P | C | 5 | 900 | 0 | 40 | F: 5 golden apples on a weekly visit day; a gentle event, not a fight | gatherer: wood, decor "living hill" |

**Cozy here:** gardening (seasonal seeds plus a seed from every biome), decorating with the Town block types as local copies, a pond fishing spot, and bug catching with the existing `MMBugs` species.

### 1. Verdant Jungle (first playable)
- **Identity:** a humid canopy with ruined temples, a river delta and mist at dawn.
- **Palette:** teal-greens `#0f3b2e #1f6b4a #3fa36b #8fd694`, mud `#4a3524 #6e4f33`, temple stone `#7d8a78 #a9b59e`, orchid `#d65db1`.
- **Terrain (12 new):** jungle_floor, jungle_moss, fern_thicket (slows 15%), mud, mud_deep (slows 35%), river_murk (shallow), black_sand, temple_stone, temple_moss, orchid_moss, vine_root (solid), jungle_cliff (solid). Deep and shallow water are reused.
- **Props:** jungle_tree_a/b, giant_fern, banana_plant, hanging_vine, temple_pillar, temple_idol, amber_node, berry_bush_jungle, termite_mound, plus reused tree_palm, log, mushroom_ring, reeds.
- **Resources:** wood, vine rope, amber, cocoa, jungle berries, raw meat (from hunting hostiles, not tames).
- **Hazard:** **Heat & spores.** Fern thickets at night release spore puffs, a visible 1 s telegraph that applies slow. Mud is always slow. Weather: rain 30% (doubles fish bites), mist at dawn.
- **Music:** dorian mode, 104 bpm, marimba and frog clicks.

| Creature | Tier | Size | Lv | HP | ATK | SPD | Tame (food) | Role |
|---|---|---|---|---|---|---|---|---|
| glimmerfrog | P | S | 3-6 | 25 | 0 | 150 (hops) | F (bugs) | companion: lights the dark (+light radius) |
| chompbill | P | S | 3-8 | 60 | 4 | 110 | F (jungle berries) | gatherer: berries/fiber |
| fernraptor | H (packs of 2-3, `aimed` lunge) | S | 5-12 | 85 | 14 | 190 | K (raw meat) | **fighter** |
| vinecoil | H (`ring` spit) | S | 6-12 | 110 | 12 | 80 | X | (drops vine rope) |
| canopy_glider | N | S | 6-12 | 70 | 9 | 160 | C | companion: glide over gaps when ridden (later mount) |
| moth_lantern | P (night only) | S | 4-10 | 20 | 0 | 100 | F (nectar) | collection |
| tusktop | N (charges if hit) | B | 8-14 | 420 | 22 | 120 | K (jungle berries x8) | **mount + gatherer: wood** |
| **fernjaw_tyrant** | Boss | C | 14 | 2600 | 34 | 140 | Boss-tame (see d) | **alpha mount**: roar stuns small hostiles |

**Cozy here:** river fishing (6 new fish: glass_tetra, spotted_arowana, ...), bug catching (orchid mantis, jewel beetle), cocoa and orchid seeds for home, temple-ruin decor recipes.

### 2. Coral Reef + Open Sea
- **Identity:** turquoise lagoons, coral gardens, shipwrecks and a deep blue abyss you can only cross by boat.
- **Palette:** `#0b2a4a #0f5e8c #2fb5c9 #8fe8e0`, coral `#ff7f6e #ffb3a7`, sand `#f2e2b3`.
- **Terrain (13):** reef_sand, coral_shallows, kelp_bed, seagrass, tide_pool, pearl_sand, lagoon, sandbar, shell_beach, wreck_planks, abyss (boat only), sea_rock (solid), plus reused deep_water and shallow_water.
- **Props:** reused coral, shell, driftwood, tree_palm; new kelp_tall, anemone, wreck_hull, wreck_mast, pearl_clam, buoy, lighthouse.
- **Resources:** pearls, kelp, salt, shells, driftwood, fish.
- **Hazard:** **Breath.** Diving in coral_shallows or kelp_bed drains Breath over 20 s, refilled on the surface. Rip-current tiles (shown with arrow foam) push the boat around. Weather: squalls cause waves and slow the boat.
- **Music:** lydian mode, 84 bpm, steel-drum pads.

| Creature | Tier | Size | Lv | HP | ATK | SPD | Tame | Role |
|---|---|---|---|---|---|---|---|---|
| reef_puffer | P | S | 8-10 | 40 | 0 | 90 | F (kelp) | companion: bubble shield 2 s |
| shellcrab (reuse b24 `crab_giant` art) | N | S | 8-14 | 160 | 12 | 70 | F (fish) | builder: carry +60 |
| glowjelly | H (night, `ring`) | S | 9-16 | 70 | 13 | 50 | X | (drops glow gel) |
| fin_raider | H (`aimed` dash) | S | 10-18 | 150 | 18 | 200 | K (fish x4) | fighter (water only) |
| tidesteed | P | B | 10-16 | 300 | 10 | 230 swim | F (kelp x6) | **swim mount** |
| skimray | N | B | 12-18 | 360 | 16 | 260 over water | C | **fast sea mount**, replaces the boat |
| isleback_turtle | P | C | 16-18 | 1800 | 0 | 50 | F (sea melon x10, over 3 visits) | mobile stable: a floating dock in the Open Sea |
| **tide_hydra** (reskin of b23 `hydra`) | Boss | B (boss cell) | 18 | 3200 | 38 | 90 | not tameable; drops pearls and the Rift Stone | |

**Cozy here:** deep-sea fishing with an `MMAngler` pool, beachcombing (shells, message bottles that unlock decor), tide-pool critter catching, and pearl decor.

### 3. Frostfang Tundra
- **Identity:** aurora nights, glaciers and steaming hot springs.
- **Palette:** `#1b2240 #3b4f8a #7aa0d8 #d8e8ff #ffffff`, aurora `#7fffd4 #c38bff`.
- **Terrain (13):** snow (existing), packed_snow, powder_snow (slows 30%), ice_sheet (slippery: momentum), ice_thin (cracks after 1 s, then cold water), frost_rock, permafrost, tundra_moss, slush, frozen_road, hot_spring (refills warmth), aurora_crystal, glacier_wall (solid).
- **Props:** reused ice_spike, crystal_blue, tree_pine; new pine_snowy, snow_drift, igloo, ice_arch, frozen_mammoth_tusk, hot_spring_steam (animated), frost_crystal_node.
- **Resources:** fur (gift from tames, never by killing tames), frost crystal, ice, frostberries, hot-spring salts.
- **Hazard:** **Warmth.** It drains 1% per second outside, and much faster in a blizzard. Campfires, hot springs, the Frost Cloak and riding a Shagtusk all stop the drain.
- **Music:** aeolian mode, 70 bpm, celesta and wind.

| Creature | Tier | Size | Lv | HP | ATK | SPD | Tame | Role |
|---|---|---|---|---|---|---|---|---|
| pengling | P | S | 12-14 | 45 | 0 | 100 (slides 220) | F (fish) | companion (cosmetic, slides) |
| frostfox | N | S | 12-18 | 120 | 16 | 200 | C | **fighter** (crit 15%) |
| icicle_bat | H (night, `spiral`) | S | 13-20 | 80 | 14 | 170 | X | |
| rimewolf | H (packs of 3, `aimed`) | S | 14-22 | 170 | 20 | 210 | K (raw meat x3) | fighter (pack bonus) |
| shellback_glacier | N | S | 14-20 | 260 | 10 | 60 | F (frostberries) | builder: carry +80 |
| shagtusk | N | B | 16-22 | 700 | 26 | 130 | K or F (frostberries x12, slow but peaceful) | **mount: warm aura** + gatherer: ice |
| sabrefang | H | B | 18-22 | 520 | 34 | 240 | K (raw meat x6) | **combat mount: pounce** |
| **frost_dragon** (reuse b23) | Boss | B | 22 | 4200 | 44 | 120 | not tameable; drops the Frost Heart (rocket part alternative) | |

**Cozy here:** ice fishing through holes, aurora-moth catching, frostberry bushes for home, snow sculptures (decor you place at home).

### 4. Red Waste (Mars) and 5. Drift Station
- **Identity:** a rust desert under a pink sky with low gravity (jumps arc further), crashed probes and a glass greenhouse dome. The station is steel and cyan, with zero-g corridors.
- **Palette:** Mars `#3a1410 #7a2e1c #c0582f #e8945a #f4c99a` with sky `#f0a0a0`. Station `#1a2230 #33475e #6f8fa8 #bfe9ff` with warning `#ffcc33`.
- **Terrain, Mars (12):** regolith, red_dust, dune_red (slows 15%), basalt, oxide_rock, crater_floor, crater_rim (solid), co2_frost, canyon_wall (solid), lava_vent (hazard, 1 s telegraph), habitat_floor, landing_pad.
- **Terrain, Station (8):** station_deck, station_grate, hull_wall (solid), glow_panel, airlock, asteroid_rock, asteroid_dust, void_space (solid).
- **Props:** rover_wreck, probe_lander, oxygen_plant, greenhouse_dome, solar_panel, antenna, crystal_red (reuse), meteor_rock; station props cargo_crate, terminal, docking_arm, hydro_planter.
- **Resources:** iron, oxide dust, ice cores, meteor glass, data chips (station).
- **Hazard:** **Oxygen.** It drains over 90 s and is refilled by oxygen plants, the dome or a Bubblemoth companion. Dust storms (10-minute seeded slot, 25%) shrink the view and push you around.
- **Music:** phrygian mode, 96 bpm, analog synth arps; the station is ambient and 60 bpm.

| Creature | Tier | Size | Lv | HP | ATK | SPD | Tame | Role |
|---|---|---|---|---|---|---|---|---|
| regolith_roly | P | S | 18-20 | 70 | 0 | 90 (rolls 200) | F (oxide dust) | companion (cosmetic) |
| bubblemoth | P | S | 18-24 | 60 | 0 | 140 | C | **companion: +O2 aura** (core survival tame) |
| rustbeetle | N | S | 18-26 | 300 | 18 | 80 | F (iron x3) | gatherer: iron |
| dust_devil (palette reskin of b24 `wind_sprite`) | H (`spiral`) | S | 20-28 | 160 | 24 | 180 | X | |
| scrapper_drone | H (`aimed`), station | S | 24-30 | 220 | 28 | 160 | C (hack ring: a calm variant) | fighter (ranged) |
| crater_strider | N | B | 22-28 | 650 | 28 | 220, leaps 4 tiles | K (greenhouse potatoes x10) | **leap mount** |
| void_grazer (asteroid) | P | C | 28-30 | 2400 | 0 | 60 floats | F (meteor glass x8) | flying mount (slow, ignores solids except hull) |
| **red_titan** (reskin of b23 `sand_titan`) | Boss (Mars) | B | 28 | 5200 | 50 | 100 | **boss-tame** (Wave 3) | burrowing mount |
| **station_warden** (reskin of b23 `clockwork_golem`) | Boss (Station) | B | 30 | 6000 | 54 | 90 | X | |

**Cozy here:** a greenhouse garden (Mars potatoes, space tomatoes), meteor-shower stargazing (collect falling stars), station hydroponics decor, and a "cosmic fish" tank in the station.

### R. Realm / Godlands
The Realm's existing zones, bosses and dungeons are unchanged. Wave 3 lets **one** companion fighter follow you into the Realm world, with its damage clamped to 25% of the hero's DPS and no mounts in combat. A Realm boss kill adds a "Godlands" ribbon to that companion's journal entry.

## (d) Taming and survival system (PvE only)

**Three methods.** The method is printed on the creature card and shown as an icon over the creature's head.

1. **Feed (passive).**
   - Walk up slowly (under 60% speed) and hold **A** to offer the preferred food.
   - The trust ring fills by `foodValue x prefMul`: preferred food x1.0, liked x0.5, other x0.
   - Sprinting, attacking near it or getting hit drops trust by 10, and at 0 the creature skips away.
   - Big passives need several food items spaced by their eat animation (1.2 s).
2. **Calm (skill).** Press **A** at a "curious" creature to start 3-5 timed taps on a shrinking ring.
   - Timing uses `MMJam.judge`: perfect +25, great +18, good +10, miss -5.
   - There is no failure; you can retry immediately.
   - An accessibility toggle lets you hold instead of tap.
3. **Knockout then feed.**
   - Toggle **Tranq (B)**: your class bolt shape (`mm-projectile`) becomes non-lethal and deals `torpor = dmg x 1.0`, with HP damage 0.
   - When the creature's torpor reaches its max, it sleeps for 60 s; torpor decays only after 30 s without hits. A 10 s **Sleepy Herb** extends the sleep.
   - While it sleeps, feed it to fill the tame bar.
   - Other hostiles can attack *you* but never the sleeper.
   - If it wakes, it keeps 50% of its tame progress for 10 minutes.
   - Tranq bolts are free; they are not ammo.

**Boss-tame** (Fernjaw Tyrant, later Red Titan). You fight it normally. At 25% HP it kneels **Weary** for 20 s with no attacks; your tranq bolts fill its torpor in about 15 s, then it sleeps for 90 s and you feed it a **Feast** (crafted: 4 raw meat, 4 berries, 1 amber). Each save can have one alpha per boss. You can re-fight the boss at any time for loot.

**Tame result.**
- `bond = 100 - 0.5 x dmgTakenPct - wrongFoodUses x 5`, clamped to 60-100.
- Bonus levels = `floor(lv x bond / 200)`, so a level-10 tame at bond 100 joins at level 15.
- First tame of the day: trust gains x2 (a daily bonus, never a penalty).

**Stats and levelling.**
- Five stats: HP, ATK, SPD, CARRY, STAMINA (mounts only).
- Stat at level L = `base x (1 + 0.06 x (L-1))`.
- Wild tames can gain +20 levels after taming (cap 50). Each level gives one point, and the player picks HP (+5%), ATK (+4%), SPD (+1%, max +15%), CARRY (+5) or STAMINA (+5%).
- XP is shared by fights (50% of kill XP), gathering trips and rides.
- The player has a separate **Tamer Rank** (1-30). It raises the stable size and unlocks recipes; it is not a stat inflator.

**Roles and companion AI.** The AI is pure `mm-creatures.js`: a state machine `wander | flee | aggro | follow | stay | attack | ride | gather | sleep`.

| Role | Out at once | Behaviour |
|---|---|---|
| Fighter | 1 (2 at Tamer Rank 15) | Follows at 1.5 tiles (`MMPets.follow`). Attacks your target or the nearest hostile within 6 tiles. Retreats below 25% HP and regenerates out of combat (never dies: at 0 HP it "naps" for 30 s next to you). |
| Mount | 1 | **A** to ride. Speed x mount SPD, stamina sprint, one ability (charge, glide, swim, leap, pounce, warm aura, roar). You can fire your class bolts from the saddle at 70% rate. |
| Gatherer | stable only | Assigned at the stable to a home node. It forages while you play elsewhere, capped at 8 h of offline time and 30 items per creature per day. It plays happy idle animations, has no quotas, and you can unassign it at any time. |
| Builder | 1 follower | Carry bonus, and halves material cost for walls and fences at home. |

**Commands.** Tap the companion portrait to cycle **Follow → Stay → Attack my target**. Keys are 1/2/3, gamepad uses the D-pad.

**Saddles.** Big tames need a saddle crafted at the home workbench (for example `saddle_tusktop`: 10 fiber, 6 wood, 2 amber). The Meadow Strider and Isleback need none. A saddle is a separate overlay strip drawn under the rider. The rider is drawn from the hero's existing idle frame 0, cropped at the waist and anchored to the mount's per-frame `seat` point, so no new rider art is needed for the first version.

**Stable (Hearth Isle).** It starts with 6 slots, rising to 12 (Tamer Rank 8, plus 20 wood and 10 stone) and 24 (Rank 18, plus 10 amber and 10 iron). Hard cap: 24 tames. A third duplicate of a species is gently refused ("Release to the Sanctuary?") and gives 3 Bond Seeds instead (each seed is +1 level on any tame).

**Breeding-lite** (optional, Wave 3). Two tames of the same species at bond 90+ in a Nest produce an egg once per real day per pair, and the egg waits indefinitely.
- Each stat is inherited from the higher parent with 55% chance.
- Mutation chance is 3%: +2 levels and a colour variant, a code palette swap from 4 per species.
- The hatchling makes 3 care requests (pet, feed its preferred food, take it on a 60-tile walk). Each one adds 10% imprint, up to +30% stats when you ride it yourself.
- Requests never expire, and nothing decays.

**Health and hunger-lite.**
- The hero uses Realm HP: the class profile from the active Lantern hero, read-only from `pixeltown-mm-v1`.
- **Well-fed** is a positive buff (+10% speed and regen for 20 min) from cooked food. There is no starvation.
- Hazard meters (Warmth, Breath, Oxygen) apply only in their biome. When empty they slow you 30% and deal 1% HP per second, capped so they never take you below 30% HP.
- **Fainting** (0 HP from creatures) wakes you at the last campfire or dock with everything you carried. An optional **Brave mode** drops a satchel of unbanked resources at the faint spot (it stays until you pick it up).

**Crafting and base-building lite.**
- One-tap recipes at the home workbench, showing what is missing and where it comes from (about 40 recipes: raft, cloak, saddles, feast, sleepy herb, rocket parts, decor).
- Building uses the Town's `BLOCK_TYPES` vocabulary (wood wall, stone fence, lamp, hedge, path) plus biome decor, on a 32 px grid on the Hearth Isle plot (40x30 tiles) with tap-to-place and a 10 s undo.
- It lives in a new pure module, `mm-homestead.js`, **saved locally only**. The Town's Firebase `blocks` ref is never used.

**Caps and anti-grind rules.**
- No energy or stamina gate on play.
- Resource nodes respawn in 5 minutes.
- Normal tames take 10-90 s and boss-tames about 3 minutes.
- Taming foods grow at home in 1 real hour, or drop from the matching biome.
- Every recipe input is available from at least two sources.
- Weekly events (Oakback visit, meteor shower, aurora night) rotate on a fixed calendar, so there is no FOMO and everything repeats.

**Multiplayer.**
- Same-device co-op follows the `world-team.js` pattern: a new `mm-isles-party.js` wraps `MMWorldParty` (pos/hit/bag at 8 Hz, 40-tile range) over `MMPartyBC`.
- The host's `save.seed` is shared, and each player keeps their own tames. Partners see each other's companion as a code-drawn ghost (species id plus the position in a new `pet` message, cleaned and range-checked).
- There is no Firebase, no socket and no fetch (grep-asserted in tests). Online parties come later through whatever transport the existing party plan adopts.
- The Town presence, chat and blocks are unchanged.

**Combat link to the Realm.** Isles combat reuses `mm-projectile` bolt kernels, `MMClasses.arenaProfile` and `arenaSignature`, `mm-aim`, `mm-pad`, b16 bolt art, b18 hit effects and `MMDifficulty` clamps. Creature behaviours map to the arena behaviours: `aimed` (lunge or dash), `ring` (spit), `spiral` (swoop). Isles creatures are therefore readable to Realm players, and the Realm never changes.

**Save keys (new only).**
- `pixeltown-isles-v1`: `{v:1, seed, at:{isle,x,y}, unlocked:[], res:{id:n}, inv:[], tames:[{id, sp, lv, xp, pts, stats, bond, imp, name, color, role, saddle, alpha}], stable:{slots, gath:{tameId:nodeId}}, eggs:[], journal:{seen:{}, tamed:{}, fish:{}, bugs:{}}, home:{placed:[[x,y,t]]}, rank:{lv,xp}, flags:{brave}, lastDaily}`.
- Unknown keys are kept, missing keys are defaulted, corrupt JSON triggers a backup and a fresh save. Size target is 40 KB or less: about 160 B per tame x 24 and 800 placed tiles x 12 B.
- Hub profile additive fields: `nodes.isles.medals`.

## (e) Art direction and Codex asset list

**Direction.** The bar is the b04-b06 style: bold dark outline, hue-shifted ramps, one hue family per biome, shared skin/wood/metal ramps, no baked shadows or effects, and true back and side views.
- **Big creatures** must read at phone size by silhouette (horns, sails, tusks).
- **Cell sizes.** S creatures use 256 px cells (64 logical). B creatures use 384 cells (96 logical, displayed at 72-96 px). C creatures use 512 cells (128 logical, displayed at 112-128 px). Strips are pre-scaled once at load to display size, so phones never draw 512 px cells per frame.
- **Strip set per creature:** idle 4, move 6, attack 5, death 5 x down/up/right (12 strips).
- **Tameables add** `sleep_down` (4 frames, breathing loop) and `eat_down` (4 frames), for 14 strips.
- **Mount manifests add** a per-frame `seat` {x,y} array, like `muzzle`.
- **Saddles** are separate overlay strips matching the mount's move and idle frames.

**Batches** (ids as listed; **FP** = needed for the first playable).

| Batch | Branch `codex/...` | Contents | Files |
|---|---|---|---|
| **b30** FP | `b30-jungle-terrain-base` | 12 jungle terrains x `tile_<t>_a..d` (32x32, opaque, seamless): jungle_floor, jungle_moss, fern_thicket, mud, mud_deep, river_murk, black_sand, temple_stone, temple_moss, orchid_moss, vine_root, jungle_cliff | 48 |
| **b31a** FP | `b31a-jungle-creatures-core` | chompbill (14 strips), fernraptor (14), glimmerfrog (12), 256 cells | 40 |
| **b31b** | `b31b-jungle-creatures-rest` | vinecoil (12), canopy_glider (14), moth_lantern (12) | 38 |
| **b32** FP | `b32-jungle-big-and-boss` | tusktop B 384 (14 + `saddle_tusktop` overlay idle/move x3 = 6), fernjaw_tyrant C 512 (14 + roar 6 frames x3 = 3, saddle 6) | 43 |
| **b33** FP (8 of them) | `b33-jungle-props` | prop_jungle_tree_a/b (64x64), giant_fern, banana_plant, hanging_vine (32x64), temple_pillar, temple_idol (64x64), amber_node, berry_bush_jungle, termite_mound, boss_arena_ring (128x128), nest_wild | 12 |
| **b34** FP (first 14) | `b34-taming-ui-items` | UI 24x24: ui_tame_trust, ui_tame_torpor, ui_tame_bond, ui_tranq_on, ui_tranq_off, ui_cmd_follow, ui_cmd_stay, ui_cmd_attack, ui_saddle, ui_ride, ui_stable, ui_wellfed, ui_warmth, ui_breath, ui_oxygen, ui_tamer_rank; 48x48 ui_icon_isles, ui_icon_sea_chart; items 32x32: item_raw_meat, item_jungle_berries, item_feast, item_sleepy_herb, item_amber, item_vine_rope, item_clover, item_golden_apple, item_fiber, item_bond_seed | 28 |
| b35 | `b35-meadow-home` | terrains tilled_soil, tilled_wet, clover_patch, garden_path (4 + 16 edges each = 80); props prop_stable (96x64), prop_nest, prop_garden_plot_s1..s4, prop_dock, prop_launch_pad (96x96), prop_mailbox_isle, prop_workbench_isle, prop_boat (64x32, 2-frame bob) | 92 |
| b36 | `b36-meadow-creatures` | clover_hopper, puffwool, bumble_mote, pebble_tortle, thistle_boar (14 each), meadow_strider B (14 + seat), oakback C (12 + eat, sleep) | 98 |
| b37 | `b37-ocean-terrain` | 11 reef terrains x a..d (abyss animates in code) + edges for coral_shallows, lagoon, kelp_bed (48) + props kelp_tall, anemone, wreck_hull, wreck_mast, pearl_clam, buoy, lighthouse (64x96) | 99 |
| b38 | `b38-ocean-creatures` | reef_puffer, glowjelly, fin_raider (12-14), tidesteed B, skimray B (14 + saddle 6), isleback_turtle C (14); shellcrab = b24 crab_giant (no new art) | 88 |
| b39 | `b39-ice-terrain` | 12 tundra terrains x a..d + edges for powder_snow, ice_sheet, hot_spring (48) + props pine_snowy, snow_drift, igloo, ice_arch, frozen_tusk, hot_spring_steam_f1..f4, frost_crystal_node | 106 |
| b40 | `b40-ice-creatures` | pengling, frostfox, icicle_bat, rimewolf, shellback_glacier (12-14), shagtusk B, sabrefang B (14 + saddle 6) | 96 |
| b41 | `b41-mounts-riders` | saddle overlays for meadow_strider-free mounts not yet done; `rider_<class>_sit_<down/up/right>` 1-frame upper bodies for the 14 classes (replaces the code crop) | 42+ |
| b42 | `b42-mars-station-terrain` | 12 Mars + 8 station terrains x a..d (80) + edges for regolith, dune_red, station_deck (48) | 128 |
| b43 | `b43-mars-creatures` | regolith_roly, bubblemoth, rustbeetle, scrapper_drone (12-14), crater_strider B (14 + saddle), void_grazer C (14); dust_devil, red_titan, station_warden are code palette swaps of b24/b23 | 82 |
| b44 | `b44-space-props-vehicles` | rover_wreck, probe_lander, oxygen_plant_f1..f4, greenhouse_dome (128x96), solar_panel, antenna, meteor_rock, cargo_crate_sci, terminal_f1..f2, docking_arm, hydro_planter; vehicles boat_sail (64x64 x3 dirs, 4 frames), rocket_launch (128x192, 8 frames), shuttle (96x64) | 30 |
| b45 | `b45-biome-edges-fx` | remaining edge sets for b30 jungle (fern_thicket, mud, river_murk, temple_stone = 64), fx 64x64 strips: fx_tame_hearts, fx_torpor_zzz, fx_trust_sparkle, fx_spore_puff, fx_bubble_o2, fx_snow_breath, fx_splash, fx_dust_storm (256x256 tileable overlay), fx_lava_vent_warn, fx_roar_ring | 74 |

**Palettes per batch:** every `palette.json` holds the biome hex ramps from (c), plus shared outline `#14101c`, wood `#5a3a22 #8a5a3b #b98a5a`, metal `#3a3f4a #7a818d #c9ced8` and skin ramps. Each creature may add up to 16 colours.

**Edges.** Until a terrain's edge set lands, the renderer blends with a code alpha mask (a dithered 4-bit mask), so the base variants alone already look finished.

**First-playable art total:** b30 (48) + b31a (40) + b32 (43) + 8 props + 14 UI/items, about **153 files**. Hearth Isle in the first playable uses only existing art.

## (f) Build plan: 24 slices in 3 waves

**Serial resources** (one slice at a time): `realm.js`, `realm-world.js`, `mad-maze.js`, `dungeon.js`, `main.js`, every `index.html` page (including the new `games/isles/index.html`), and `hub/hub.js`/map data.

**Every slice ships with:**
- `node --check`
- zero console errors
- desktop and phone screenshots
- 3+ Playwright assertions (pure modules are asserted through a shared fixture, `tests/fixtures/isles-lab.html`, created in B1, plus node tests)
- a full `node game/tests/run-all.js` run, with tests in the smoke tier when they are fast
- no Firebase: a page test asserts that `window.firebase` is undefined and that no request goes to `*.firebaseio.com` / `firebasedatabase.app`

### Wave 1: the first playable (the Jungle)

| Slice | Files (size) | Parallel | Acceptance (Playwright/node) | Test | Art |
|---|---|---|---|---|---|
| B1 Biome packs data | `shared/mm-biome-packs.js` (~450 lines data), fixture page | safe | 6 packs load; every terrain id is unique and ≥32 or a realm id; every creature has stats, a tame method and food; the fixture shows the pack count | `shared-mm-biome-packs.test.js`, `isles-lab.test.js` | none |
| B2 Isle generator | `shared/mm-isles.js` (~300) | safe (after B1) | `generateIsland(seed,'jungle')` is deterministic (hash equal twice); `verify()` ok on 20 seeds; realm `MMOverworld.hash` for 5 seeds is unchanged; spawn halo has no hostiles | `shared-mm-isles.test.js` | none |
| B3 Creature AI | `shared/mm-creatures.js` (~350) | safe | the state machine walks wander→aggro→attack; passive creatures flee when hit; follow keeps within 1.5-3 tiles; stats formula at level 10 matches the table | `shared-mm-creatures.test.js` | none |
| B4 Taming model | `shared/mm-taming.js` (~300) | safe | feed/calm/KO progress maths; a tranq bolt does 0 HP damage; sleep 60 s, wake keeps 50%; bond formula; there is no RNG in the result | `shared-mm-taming.test.js` | none |
| B5 Isles save | `shared/mm-isles-save.js` (~200) | safe | clean() tolerates corrupt data, keeps unknown keys, caps tames at 24; round-trip is equal; size is 40 KB or less on a max save | `shared-mm-isles-save.test.js` | none |
| B6 Isles page + renderer | `games/isles/index.html, isles.js, isles-world.js, isles.css` (~900) | **serial** (new page) | the canvas renders the jungle with fallback tiles; the joystick moves the hero; the minimap opens; there are no Firebase globals or requests; 40+ fps on a 390x844 viewport in `?test=1` perf probe | `isles-page.test.js` | b30 (optional, falls back) |
| B7 Wild creatures + combat | `isles-world.js`, `isles-combat.js` (~500) | serial with B6 | creatures spawn in rings and the cap is 40; class bolts damage a fernraptor; a fainted hero wakes at the dock keeping its inventory | `isles-combat.test.js` | b31a |
| B8 Taming in play | `isles-tame.js` (~350) | after B7 | tranq toggle visible; KO a fernraptor, then feeding fills the tame bar; the tamed creature appears in the save `tames[]`; chompbill feed-tame works | `isles-tame.test.js` | b34 UI subset |
| B9 Companion follow + stable panel | `isles-companion.js`, panel (~350) | after B8 | the companion follows and attacks your target; Stay holds position; the stable panel lists tames and survives a reload | `isles-companion.test.js` | none |
| B10 Big tame + boss-tame | `isles-boss.js` (~400) | after B9 | tusktop KO-tame then ride (speed x1.6); Fernjaw is Weary at 25%, tranq, Feast, then becomes an alpha in the save; the boss arena ring renders | `isles-boss.test.js` | b32, b33 |
| B11 Doors in | `main.js` (+20 lines: Harbor signpost near the dock), `hub/map-data.js` node | **serial** (main.js, hub) | the Town sign opens `games/isles/?from=town`; the hub node is reachable; `git diff net.js firebase-config.js` is empty (asserted); Town presence test still green | `isles-links.test.js` | ui_icon_isles |
| B12 Hearth Isle + homestead | `shared/mm-homestead.js` (~300), isles page home mode | serial (page) | place and remove wood/fence/lamp with a 10 s undo; saved only to `pixeltown-isles-v1`; the stable and garden plot render; no `blocks` ref is touched | `isles-home.test.js` | existing + b35 optional |

**FIRST PLAYABLE = B1-B10 (+B11 for the door).** You arrive on the Jungle by boat. Three wild species are present (chompbill passive, fernraptor hostile pack, glimmerfrog critter). You can tame one mid creature (fernraptor by knockout, chompbill by feeding), ride a big Tusktop, and finish with the Fernjaw Tyrant boss-tame. Companions follow, attack and stay. Everything is saved under one new key. This needs about 153 art files, and it is fully playable with code fallbacks before any art arrives.

### Wave 2: home, sea and ice

| Slice | Files | Parallel | Acceptance | Test | Art |
|---|---|---|---|---|---|
| B13 Mounts + saddles + rider | `isles-mount.js` (~300), recipes | serial (page) | the saddle recipe crafts; the rider is drawn at the `seat` anchor; you can fire from the saddle at 70% rate | `isles-mount.test.js` | b32 saddle, b41 later |
| B14 Sea Chart travel + unlocks | `isles-chart.js` (~250) | serial | locked isles show their requirement; the Raft unlocks the Reef; the transition plays in 4 s or less | `isles-chart.test.js` | b34 chart icon |
| B15 Ocean pack + boat + Breath | packs, `isles-sea.js` (~400) | serial | the boat sails on abyss and the hero cannot walk there; Breath drains while diving and refills on the surface; tidesteed feed-tame then swim | `isles-sea.test.js` | b37, b38 |
| B16 Calm minigame | `isles-calm.js` (~200) using `MMJam.judge` | after B8 | a perfect tap adds 25; a miss never fails; the hold-mode toggle works | `isles-calm.test.js` | fx_trust_sparkle |
| B17 Tundra pack + Warmth | packs, hazard code (~300) | serial | warmth drains outside and stops at a hot spring; ice_sheet momentum; shagtusk aura stops the drain | `isles-tundra.test.js` | b39, b40 |
| B18 Gatherers + offline cap | `mm-homestead.js` gather (~200) | safe (pure) + panel | assigning a gatherer yields items; the offline cap is 8 h and 30 per day; unassign works | `isles-gather.test.js` | none |
| B19 Fish/bugs/garden per biome | `shared/mm-isles-life.js` (~300) | safe | biome fish pools use the `MMAngler` judge; garden growth takes 1 h; the journal counts seen and caught | `isles-life.test.js` | b34 items, b35 plots |

### Wave 3: space, breeding, co-op, the Realm bridge

| Slice | Files | Parallel | Acceptance | Test | Art |
|---|---|---|---|---|---|
| B20 Mars pack + Oxygen + rocket | packs, `isles-mars.js` (~400) | serial | the rocket needs its 4 parts; oxygen drains and a bubblemoth refills it; dust storm slots are deterministic | `isles-mars.test.js` | b42, b43, b44 |
| B21 Drift Station + Warden | `shared/mm-station.js` (~250), boss | serial | the fixed layout hash is stable; the Warden reskin draws; the shuttle key flows from the Mars boss | `isles-station.test.js` | b42, b44 |
| B22 Breeding-lite + imprint | `mm-taming.js` breed (~250) | safe (pure) + nest UI | the egg inherits the higher stat at roughly 55% over 1000 seeded trials; requests never expire; imprint adds up to 30% | `isles-breed.test.js` | egg_1..6 (b22) |
| B23 Co-op relay | `shared/mm-isles-party.js`, `isles-team.js` (~300) | safe module, serial page hook | the partner ghost and pet ghost draw; bad messages are rejected and counted; grep finds no firebase, WebSocket or fetch | `isles-team.test.js` | none |
| B24 Realm bridge + balance | `realm-world.js` (+40, companion follow in the Realm), sim test | **serial** (realm-world.js) | a companion follows in `?mode=world&from=isles`; its DPS is 25% or less of the hero's in the sim; realm goldens are unchanged | `isles-realm-bridge.test.js`, `isles-balance-sim.test.js` | none |

**Parallel lanes.** Codex art (b30 onward) runs alongside all code. B1-B5 can run at the same time as each other. Page slices (B6-B17, B20-B21) queue one after another.

## (g) Risks and what to cut

| Risk | Mitigation | Cut first |
|---|---|---|
| Scope (6 isles, 40 creatures) | Ship the first playable (Jungle) and judge the fun gate before Wave 2; every biome is just a pack plus a creature table | Drift Station, breeding, void_grazer, Oakback |
| Art volume (about 1,100 files in total) | Code fallbacks for everything; base variants before edges; reskin b23/b24 for 5 creatures; rider from a code crop | b41 riders, half the edge sets, b31b, night-only critters |
| Phone performance (512 px cells, many sprites) | Pre-scale strips to display size once; creature cap 40; chunk LRU 24 (~24 MB); offscreen culling; `?test=1` fps probe at 40 or more | Weather overlays at low fps (auto) |
| Save size | Compact arrays, cap 24 tames and 800 placed tiles, target 40 KB or less, tested | Journal detail per catch |
| LIVE database safety | The isles page loads no Firebase SDK; co-op uses BroadcastChannel only; homestead is local only; the B11 Town edit is a sign plus a link with a diff assert on `net.js`/`firebase-config.js`; tests never write | No online isles party until rules are applied |
| Harming the realm | `MMOverworld` called unchanged with a hash-golden test; `realm.js` never touched; only B24 touches `realm-world.js` | B24 entirely |
| Taming feels grindy or cruel | No fail rolls, no decay, 10-90 s tames, tames never die, gentle gatherer framing, daily bonus only | Gatherer automation if it reads as labour |
| Two tame systems (`MMPets` vs isles) | Isles reuse `MMPets.follow`; Lantern pets stay as they are; the journal shows both | none |
