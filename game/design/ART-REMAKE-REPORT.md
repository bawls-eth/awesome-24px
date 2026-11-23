# Art remake report (Claude, 2026-11-22, branch art-remake-list)

Why: the owner said the Codex/GPT art "looks pretty bad in places" and asked for a LARGE remake list. This report grades every
registered batch (INDEX.json, 64 batches, 2531 assets) and the code-drawn visuals against `ART-QUALITY-BAR.md`. The work list for
Codex is `CODEX-REMAKE-QUEUE.md` (R01-R48).

## Method

- `node game/tools/art-audit/run.js`: 64 batches, 2531 assets, **0 blockers, 0 needs-redo, 350 nits** (58 palette, 259 unreferenced,
  27 anchor, 5 duplicate, 1 background). The tool checks format, not taste: every grade below comes from looking at the art.
- Contact sheets: one per batch, the first frame of each creature's idle_down (or every icon/tile), downscaled to native pixels and
  zoomed 2-3x, each cell drawn twice on a dark (#181820) and a mid-grey (#808080) background. Script in the scratchpad; the sheets
  that justify the worst grades are copied to `game/design/art-remake/sheet-*.jpg`.
- Screenshots: Playwright at phone 390x844 and desktop 1280x800 of Realm (shore start), crypt / meadow / warren / bramble dungeons,
  Isles home / meadow / jungle / tundra / reef / mars, Hub, Jam, Angler, Bug Safari, Stalk, Deepdelve, Pop, Dash, Stack, Echo, Lantern
  Camp. Saved as `game/design/art-remake/shot-*.jpg` (19 images, all under 300 KB).
- Not captured: the Town in-game view (joining the Town writes a presence row to the LIVE Firebase database, which agents must not do);
  only the Town name screen was shot. Realm highlands / godlands were not reached in a 6 s capture: their grade is from the b11a / b11b
  sheets and the shore render, which uses the same tile generator and edge set.

## The bar (b04 Mad Maze enemies, b08 armor icons)

Colour-matched dark outline (not pure black), 3-4 tone ramp per material, one top-left light, a 1-2 px highlight, readable silhouette at
game scale (about 40-56 px on a phone), no smiley faces, one palette family per biome. See `art-remake/sheet-b04.jpg`.

## Executive summary

| Grade | Meaning | Batches | Code-drawn groups |
|---|---|---|---|
| A | keep | 14 | 2 |
| B | acceptable, polish later | 31 | 4 |
| C | remake soon | 14 | 9 |
| D | remake now | 5 | 7 |
| **total** | | **64** | **22** |

Biggest visible problems, in the order a player sees them:
1. **Ground everywhere is flat colour with stair-step edges** (Realm shore/grass, every Isle). On a phone 60-80% of the screen is ground,
   so this is the single largest quality hit. Isles ground is pure code fills (D); Realm uses b10t whose edges are blobby 1-bit masks with
   a dirt-brown under-colour that shows as a brown band between water and sand (C). See `shot-realm-phone.jpg`, `shot-isle-jungle-phone.jpg`,
   `shot-isle-tundra-phone.jpg`, `sheet-b10t.jpg`.
2. **Several creature/enemy batches are a different, much weaker style**: b24 enemies wave 2 and b23 bosses extra are blocky
   "rectangle body + two fist circles + frown" templates (D); b31a / b31b jungle creatures are flat 1-2 tone with smiley faces (D);
   b36 meadow creatures, b38c/f/g reef mounts and hydra, b32 jungle big are flat-filled with dot eyes (C). They sit next to b05/b06/b07
   (A), so the clash is obvious.
3. **b12 nature props** (trees, bushes, rocks) are tiny, lollipop trees with 2 tones and thin outlines; they are the most repeated
   sprite in the Realm (D).
4. **Mini games have almost no art**: Angler is a code pond and a stick man, Jam / Bugs / Stalk are text menus, Pop tiles are
   pastel squares with smiley faces, Stack is empty bars, Dash is a 4 px stick runner (D/C). See `shot-montage-minigames-isles.jpg`.
5. **HUD is web-UI, not game UI**: rounded HTML buttons with emoji glyphs (compass, clipboard, backpack) over pixel art; ability slots
   are the only pixel icons. A unified 8-bit frame/button/icon set is needed (C).
6. Hero in Isles (code-drawn ranger, about 14 px) is tiny and low contrast; the test-mode Realm hero renders as a green orb with a face (C).

## Grades by area

### Realm heroes, enemies, bosses, NPCs

| Batch | Grade | What is wrong (specific) | Example ids | Fix |
|---|---|---|---|---|
| b00 warrior | B | Master quality; up/right light halo and smaller attack frames 3-4 (ART-HANDOFF 5). | `warrior_attack_up` | Polish pass only (R44). |
| b01 ranger/mage/cleric | B | Weapons small/hidden in attack/cast frames, rolls read as a blob, 4-8 px height drift between views. | `ranger_attack_right`, `mage_roll_down` | R43 redraw attack/cast/roll strips. |
| b02 rogue/warlock/paladin | B | Clean; palette drifts from b00. | `rogue_idle_down` | Quantise to hero palette (R44). |
| b03 berserker/druid/necromancer | B | Same as b02. | `druid_cast_down` | R44. |
| b04 Mad Maze enemies | **A (bar)** | - | `puffcap_*`, `beetle_*`, `archer_*` | Keep; use as side-by-side reference. |
| b05 frontier enemies | A | Matches b04. | `goblin_scout_*`, `stone_golem_*` | Keep. |
| b06 / b06b spider, beetle | A | Matches b04. | `dark_spider_*` | Keep. |
| b06c casters/undead | A | Good detail; skeleton_archer slightly thin at phone scale. | `ice_wraith_*` | Keep. |
| b06d slimes/swamp/desert | A | Strong. | `slime_red_*`, `sand_scorpion_*` | Keep. |
| b06e misc | A | Good. | `mimic_chest_*` | Keep. |
| b07 frontier bosses | A | Rich, outlined, readable. | `inferno_wyrm_*` | Keep. |
| b23 bosses extra | **D** | All 8 bosses use one template: square torso, two round fists, a 2-dot face, a single diamond gem; flat 2-tone fill, no light direction. A lich king and a frost dragon have the same body. Next to b07 they look like placeholders. | `lich_king_idle_down`, `frost_dragon_idle_down`, `hydra_idle_down`, `void_maw_idle_down` | R08: full redraw, 8 bosses x 6 strips. |
| b24 enemies wave 2 | **D** | Same template: rectangle body + fists + frown, flat fills, a sad-face water elemental, flower thorn_vine with no menace. Spider queen and crab giant also hover 7 px. See `sheet-b24.jpg`. | `ghoul_*`, `ogre_*`, `minotaur_*`, `harpy_*`, `water_elemental_*` | R07: full redraw, 12 enemies x 12 strips. |
| b21 NPCs and vendors | A | Detailed, good palette; a little small at 1x. | `npc_vendor_*` | Keep (R42 adds Town NPCs in the same style). |

### Realm terrain, props, world objects

| Batch | Grade | What is wrong | Example ids | Fix |
|---|---|---|---|---|
| b10t overworld terrain 1 | C | Base tiles OK (diagonal water streaks, sand noise) but the 16 edge tiles per terrain are blobby threshold masks on a flat dirt-brown under-colour; in game the shore is a brown stair band between water and sand, and grass/sand meet in hard 32 px steps. Only 4 variants each, so repetition shows. | `tile_shallow_water_edge_05`, `tile_sand_edge_10`, `tile_deep_water_a` | R01: same 4-bit edge ids plus inner corners, organic edges in the neighbour's real colours, 8 variants; decals in R33. |
| b11a highlands | C | Same generator and edge set as b10t (inferred, not seen in game). | `tile_highland_rock_edge_*` | R32. |
| b11b godlands | C | Same. | `tile_cracked_stone_edge_*` | R32. |
| b12 nature props | **D** | Trees are lollipops (round blob on a 2 px stick), 2 tones, thin outline, 32 px; rocks are grey wedges; flowers are 3 dots on sticks; skeleton_bones is a skull-and-crossbones emoji. The most repeated sprite in the Realm. See `sheet-b12.jpg`. | `prop_tree_small/medium/large`, `prop_bush_a`, `prop_rock_big`, `prop_skeleton_bones` | R03: 2x density (64 px trees), outline, 3-4 tones, ground shadow, 3 variants each. |
| b13 structures | B | Acceptable; campfire, chests, statues unused in code. | `prop_campfire_f1` | Polish later. |
| b14 portals / world objects | B | Fine. | `portal_nexus` | Keep. |
| b15 loot bags | B | Fine at 24 px. | `bag_gold` | Keep. |
| b26 godlands props fix | B | Fine. | `prop_godlands_obelisk_a` | Keep. |
| b25 dungeon tilesets | A | Crypt/warren/meadow/bramble read well in game (`shot-crypt-phone.jpg`, `shot-bramble-phone.jpg`). Floor variety slightly low in warren. | `dtile_*` | Keep; R33 adds decals. |

### Projectiles, effects, icons, UI

| Batch | Grade | What is wrong | Example ids | Fix |
|---|---|---|---|---|
| b16 / b17 projectiles | B | Fine at speed. | `bolt_ranger`, `ebolt_orb_red` | Keep. |
| b18 effects | B | Fine; 11 unused. | `fx_levelup` | Keep. |
| b19 UI icons | B | Good icons; `ui_slot_weapon` = copy of `ui_stat_power`. HUD frames/buttons missing entirely. | `ui_slot_weapon` | R11-R13 unified HUD kit. |
| b20 portraits / ability icons | B | Ability icons read; portraits small. | `ability_*` | Keep. |
| b27 banners and logo | B | Logo is a 64 px wordmark, too small for a title screen; no title art. | `logo_hearthvale`, `title_bg_tile` | R24 logo + title art. |
| b28 world-map icons | B | `mm_player` touches cell edge. | `mm_player` | Fix in R40. |
| b29 gear tiers | B | Fine. | `ui_affix_*` | Keep. |
| b07x / b07w / b08 / b08h / b09 / b09a | A/B | b08 armor icons are the icon bar (A); b08h, b09, b09a match (A); b07x/b07w fine (B). | `armor_cuirass_iron` | Keep. |
| b09c consumables, b09m materials, b10r relics, b22 items | B | Fine; b22 relic_1..n generic. | `relic_7` | Keep. |
| i01 items v2 | B | Crisp but 162-588 colours per icon vs a 48 budget, richer shading than b19. | `warrior_longsword` | R45 quantise. |
| b34 taming UI, b34b crafting icons | B | Consistent. | `ui_tame_trust` | Keep. |

### Isles creatures and terrain

| Batch | Grade | What is wrong | Example ids | Fix |
|---|---|---|---|---|
| b30 jungle terrain | C | Muddy low-contrast greens, every tile the same mid value; repeated diagonal leaf stamp; no transitions to sand/water; temple stone reads as grey bricks. Not used for the main isle ground (code fills). See `sheet-b30.jpg`. | `tile_jungle_floor_a`, `tile_mud_a`, `tile_temple_stone_a` | R04 jungle set with edges. |
| b35 meadow home | C | Tilled soil is OK; clover edges are hard 1-bit masks; grass is a flat lime green with no variation. | `tile_clover_patch_edge_*`, `tile_tilled_soil_edge_*` | R35. |
| b31a jungle core creatures | **D** | Chompbill, fernraptor, glimmerfrog: flat 2-tone, cartoon dot eyes, frog has a smiley mouth, fernraptor wears a crown; soft outlines. See `sheet-b31a.jpg`. | `chompbill_*`, `fernraptor_*`, `glimmerfrog_*` | R09. |
| b31af glimmerfrog rest | C | Same frog. | `glimmerfrog_rest_*` | With R09. |
| b31b jungle creatures rest | **D** | Vinecoil, canopy_glider, moth_lantern: smiley faces, flat fills, 1 tone of shading. See `sheet-b31b.jpg`. | `vinecoil_*`, `canopy_glider_*`, `moth_lantern_*` | R10. |
| b32 jungle big and boss | C | Tusktop OK-ish; fernjaw_tyrant is a green box with a grin, flat. | `fernjaw_tyrant_*` | R28. |
| b32s stegolith | C | Flat; up saddle overlays copy the down view. | `stegolith_saddle_idle_up` | R28. |
| b33 jungle props | B/C (C) | Trees OK, idol and pillar flat. | `temple_idol`, `jungle_tree_a` | R34. |
| b36 meadow creatures | C | Better outline than b31, but flat 1-2 tone fills, round dot eyes; strider and hopper read as mascots; puffwool is a cream blob. See `sheet-b36.jpg`. | `clover_hopper_*`, `meadow_strider_*`, `puffwool_*`, `thistle_boar_*` | R27. |
| b38a puffer, b38b shellcrab, b38d glowjelly, b38e fin raider | B | Read well at phone scale; slightly flat. | `shellcrab_*`, `glowjelly_*` | Polish later. |
| b38c reef mounts | C | Tidesteed is a round face with a smile; skimray flat; up saddles copy down. | `tidesteed_*`, `skimray_saddle_idle_up` | R29. |
| b38f isleback turtle | C | Side view was a top-down shell with a head (revised), still flat. | `isleback_turtle_*_right` | R29. |
| b38g tide hydra | C | Good scale, but flat 2-tone teal and cartoon heads. | `tide_hydra_*` | R30. |
| b40a pengling, b40b frostfox | B | Good, navy outline reads on snow. | `pengling_*` | Keep. |
| b40c rimewolf | C | Too small and dark (audit 3 R1). | `rimewolf_*` | R31. |

### Code-drawn visuals

| Area / group | Grade | Observed | Becomes Codex art? |
|---|---|---|---|
| Isles terrain fields (home, meadow, jungle, tundra, reef, mars) | **D** | 32 px flat fills with stair-step edges, no texture at all (`shot-isle-jungle-phone.jpg`, `shot-isle-tundra-phone.jpg`, `shot-isle-reef-phone.jpg`). | Yes: R02, R04-R06 tiles + transitions + decals; code keeps the autotile logic. |
| Realm terrain field rendering | C | Uses b10t tiles but the per-tile edge pick gives a stair band; no decal scatter. | Art in R01; Claude adds decal scatter in code. |
| Isles hero (code ranger) | C | About 14 px, green on green, no outline. | Yes: R26 isles hero strips (or reuse class strips at a scale). |
| Realm hero in test mode | C | Green orb with a face when no class strip loads. | Code fallback stays; make sure class art loads (Claude). |
| HUD buttons / panels (Realm, Isles, mini games) | C | HTML rounded buttons with emoji icons; Isles info panel is a dark box with yellow buttons. | Yes: R11-R13 (9-slice frames, buttons, 24 px icon set). |
| Minimap frames | C | Plain dark rectangle. | Yes: R11 (`ui9_minimap`). |
| Angler scene (pond, sky, stick angler) | **D** | Code pond stripes, a 4-colour stick man. | Yes: R15 + R16. |
| Jam (lanes, menu) | **D** | Text menu, coloured bars. | Yes: R18. |
| Bug Safari (arena cards, field) | **D** | Grey text cards. | Yes: R17. |
| Stalk Market | C | One turnip glyph, plain buttons. | Yes: R22. |
| Deepdelve voxels | C | Flat-colour voxels, readable but bland; sky gradient fine. | Yes: R23 face textures (16 px). |
| Pixel Pop tiles | **D** | Pastel rounded squares with smiley faces (`shot-pop-phone.jpg`). | Yes: R14. |
| Lantern Dash | **D** | 4 px stick runner, a flat ground line. | Yes: R19. |
| Stack Tower | **D** | Two flat purple bars on black. | Yes: R20. |
| Echo Garden flowers | C | Code flowers are cute but flat; no garden scene. | Yes: R21. |
| Lantern Camp (hero hub) | B | Lantern art OK, rest text. | R24 (title art). |
| Hub map | B | Small tile map reads fine; text-heavy chrome. | R41 hub chrome later. |
| Town (Phaser world, main.js tiles, villagers) | B (not shot in game) | Villager picker sprites crisp; world not captured (live Firebase). | Keep code for now; R42 adds Town NPC/props. |
| Dungeon lighting / torches | A | Torches and light pools look good. | Stay code. |
| Projectile trails, damage numbers | A | Fine. | Stay code. |
| Day/night tint, weather | B | Fine. | Stay code. |
| Result screens (all mini games) | C | Text only. | Yes: R25 (m08). |

## Screenshot and sheet index (`game/design/art-remake/`)

`shot-realm-phone.jpg`, `shot-realm-desk.jpg`, `shot-isle-jungle-phone.jpg`, `shot-isle-jungle-desk.jpg`, `shot-isle-tundra-phone.jpg`,
`shot-isle-reef-phone.jpg`, `shot-crypt-phone.jpg`, `shot-bramble-phone.jpg`, `shot-angler-phone.jpg`, `shot-pop-phone.jpg`,
`shot-montage-minigames-isles.jpg` (Hub, Jam, Bugs, Stalk, Deepdelve, Dash, Stack, Echo, Lantern, reef, mars, home, crypt, warren, meadow
dungeon, meadow isle), `sheet-b04.jpg` (bar), `sheet-b24.jpg`, `sheet-b31a.jpg`, `sheet-b31b.jpg`, `sheet-b12.jpg`, `sheet-b10t.jpg`,
`sheet-b30.jpg`, `sheet-b36.jpg`.

## Full grade list (64 batches)

- A (14): b04, b05, b06, b06b, b06c, b06d, b06e, b07, b08, b08h, b09, b09a, b21, b25
- B (31): b00, b01, b02, b03, b07x, b07w, b09c, b09m, b10r, b22, b13, b14, b15, b16, b17, b18, b19, b20, b26, b27, b28, b29, b34, b34b,
  b38a, b38b, b38d, b38e, b40a, b40b, i01
- C (14): b10t, b11a, b11b, b30, b33, b35, b36, b31af, b32, b32s, b38c, b38f, b38g, b40c
- D (5): b12, b23, b24, b31a, b31b
