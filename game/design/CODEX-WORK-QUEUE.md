# Codex work queue: art for the unified Realm (written by Claude, 2026-11-20, owner-directed)

## Why this exists
The owner wants Realm (arena) and Mad Maze (dungeons) merged into ONE game in the style of **Realm of the Mad God**:
a large scrolling overworld you start in, zones that get harder with distance from the spawn (shore -> midlands -> highlands -> godlands),
monsters and events in the world, loot bags with drops, portals that lead into dungeons (our Mad Maze dungeons), a Nexus/restart menu,
and good phone play. Claude builds the code. **You (Codex) make the images.** The owner approved using YOUR queue for assets;
the old rule "tiles/props/UI are drawn in code" is lifted for the items below (code fallbacks stay in the game, so late art never blocks).

## How to work (every hourly run)
1. `git fetch`; read `AGENTS.md`, this file, `game/design/TEAM-BOARD.md` (Claude -> Codex), `game/design/ART-HANDOFF.md`, `game/assets/arcane/README-INTAKE.md`.
2. Take the NEXT unfinished batch in the order below (the first one with no `codex/<branch>` yet). Do not wait for Claude's review of the previous batch; keep producing. Two batches per hourly run if time allows.
3. One batch per branch `codex/<batch-topic>`, folder `game/assets/arcane/<id>-<label>/` with `manifest.json`, `palette.json`, `README.txt`, `preview.png` (contact sheet), `validation-report.json` (run `python3 game/tools/ingest-art-zip.py --revalidate <dir>`; fix every blocker).
4. Post a short entry in `game/design/TEAM-BOARD.md` under "Codex -> Claude" (branch, commit, counts, anything weak). Claude merges, wires, and answers under "Claude -> Codex".
5. Use EXACTLY the ids listed here. Claude's code looks them up by id. If you must rename or add, say so on the board first.
6. Same quality bar as b04-b06d (consistent per family, bold dark outline, bright readable palette, shared palette discipline, no baked shadows/ground/effects unless the asset IS the effect, original art only). Phone readability matters: shapes must read at 24-32 px on a 5-inch screen.

## Formats (all PNG, transparent unless "opaque tile")
- **Terrain tiles:** 32x32, opaque, seamless on all 4 edges (tile 3x3 to check). Per terrain: `tile_<terrain>_a..d` (4 variants) and a 4-bit autotile transition set `tile_<terrain>_edge_00..15` (bit order N=1,E=2,S=4,W=8: edge piece where the neighbours with the bit set are the SAME terrain; the rest blends toward the terrain named in the manifest field `blend`).
- **Props:** `prop_<name>` single PNG; 32x32 or 32x64 or 64x64 (state the size in the manifest), feet/base at the bottom centre, anchor in the manifest. 1 frame unless noted (`_f1.._fN` for animated).
- **Portals / animated objects:** strip PNG (frames side by side), 64x64 cells, 4-8 frames, fps and loop in the manifest.
- **Loot bags:** 24x24 cells, 2-frame strips (idle bob).
- **Projectiles / effects:** strips of 32x32 or 64x64 cells, frame counts below, facing RIGHT (code rotates), transparent.
- **UI icons:** 24x24 (or 48x48 for large menu icons), flat, readable on dark backgrounds, no text.
- **Portraits:** 64x64 bust per hero class, front facing, same palette family as the class sprites.
- **NPCs:** 256x256 cells like enemies, down-facing only: idle 4, talk 4.
Manifest fields per asset: `id, category, path, frames, frame_w, frame_h, fps, loop, anchor{x,y}, tags[], source:"original image-generated atlas"` (+ `blend`, `tier` where noted).

## Batch order (about 100 files each, one branch each)
**b06e (already assigned):** bandit, mimic_chest, undead_soldier, spectral_eye, mushroom_monster (12 strips each).

**b10 `overworld-terrain-1`** (shore + midlands): terrains `deep_water, shallow_water, sand, wet_sand, grass, tall_grass, dirt_road, flower_meadow` x (4 variants + 16 edge pieces) = 8 x 20 = 160 files; split in two branches if needed (`b10a`, `b10b`). Water animates by code, so water tiles need only 4 still variants.

**b11 `overworld-terrain-2`** (highlands + godlands): `highland_rock, gravel, dry_grass, snow, stone_road, cracked_stone, godland_ash, blood_ruins, dark_grass, lava_rock` x 20 = 200 files (split `b11a`, `b11b`). Plus 6 walls/cliffs: `tile_cliff_<n|e|s|w|corner_ne|corner_nw>` (opaque 32x32 with a dark outline face) and `tile_wall_ruin_a..d`, `tile_wall_hedge_a..d`.

**b12 `overworld-props-nature`:** `prop_tree_small, tree_medium, tree_large, tree_dead, tree_pine, tree_palm, bush_a, bush_b, bush_berry, rock_a, rock_b, rock_big, boulder_cluster, reeds, lily_pad, flower_red, flower_blue, flower_yellow, mushroom_ring, log, stump, cactus, coral, driftwood, shell, skeleton_bones, crystal_blue, crystal_red, crystal_green, ice_spike` (~30).

**b13 `overworld-props-structures`:** `prop_tent_a, tent_b, campfire_f1..f4, hut, tower_ruin, pillar_ruin_a, pillar_ruin_b, arch_ruin, statue_knight, statue_mage, statue_demon, fountain_f1..f4, signpost, grave_a, grave_b, tombstone_cross, torch_post_f1..f4, banner_red, banner_blue, banner_green, bridge_h, bridge_v, fence_h, fence_v, gate_wood, well, crate, barrel, chest_closed, chest_open, altar, obelisk, lantern_post, market_stall, anvil` (~45).

**b14 `portals-and-world-objects`** (animated strips, 64x64 cells, 6 frames, 8 fps): `portal_nexus, portal_warren, portal_bramble, portal_meadow, portal_crypt, portal_vault, portal_boss, portal_return` (colour-coded swirls: warren brown/orange, bramble green/thorn, meadow gold/flower, crypt violet/bone, vault silver/blue, boss crimson, nexus white-blue, return teal), plus `spawn_pad` (4f), `shrine_heal` (4f), `shrine_rage` (4f), `shrine_ward` (4f), `event_beacon` (4f, a pulsing banner/flag that marks a world event), `treasure_pile`, `loot_chest_gold` (opening 4f), `dungeon_key` world sprite.

**b15 `loot-bags-and-drops`** (24x24, 2 frames each): `bag_brown, bag_pink, bag_purple, bag_cyan, bag_white, bag_gold, bag_blue, bag_red` (tiers: common, uncommon, rare, epic, legendary, soulbound, potion, mythic), `bag_soulbound_sparkle` (4f overlay), `coin_f1..f4` (shard/diamond pickup spin), `heart_pickup`, `focus_pickup`, `xp_orb_f1..f4`, `potion_life, potion_focus, potion_power, potion_swift, potion_guard, potion_wit` (24x24 world sprites).

**b16 `projectiles-player`** (facing right, 32x32, 4 frames each, 12 fps loop): `bolt_ranger, bolt_frostcaller, bolt_herald, bolt_punk, bolt_bruiser, bolt_rogue, bolt_warlock, bolt_paladin, bolt_berserker, bolt_druid, bolt_necromancer, bolt_trickster, bolt_gravetender, bolt_shadowpaw`, and `hit_spark_a/b/c` (4f, 32x32).

**b17 `projectiles-enemy`** (32x32, 4f): `ebolt_orb_red, ebolt_orb_blue, ebolt_orb_green, ebolt_orb_purple, ebolt_shard, ebolt_arrow, ebolt_fire, ebolt_frost, ebolt_poison, ebolt_skull, ebolt_laser_h, ebolt_ring_pulse`.

**b18 `effects`** (64x64 cells, 6-8 frames, 14 fps): `fx_levelup, fx_heal_pulse, fx_shield_up, fx_dash_trail, fx_slam_ring, fx_blizzard_ring, fx_thorn_bloom, fx_bone_shard_orbit, fx_drain_orb, fx_poof_death, fx_loot_spawn, fx_portal_enter, fx_teleport, fx_curse, fx_stun_stars, fx_slow_snow, fx_poison_bubbles, fx_fire_burst, fx_lightning_strike, fx_explosion_small, fx_explosion_big` (+ 24 boss effect strips per `ART-HANDOFF.md` section 3 if still specified).

**b19 `ui-icons`** (24x24 unless noted): stats `ui_stat_life, ui_stat_focus, ui_stat_power, ui_stat_guard, ui_stat_swift, ui_stat_knack, ui_stat_wit, ui_stat_xp`; slots `ui_slot_weapon, ui_slot_charm, ui_slot_ring, ui_slot_armor, ui_slot_ability, ui_slot_empty`; rarity frames (32x32, 9-slice friendly) `ui_frame_common, uncommon, rare, epic, legendary`; menu icons (48x48) `ui_icon_restart, nexus, settings, backpack, board, shop, map, sound_on, sound_off, pause, play, close, back, heart, shield, sword, skull, star, key, lock, chest, party, duel, portal`; HUD `ui_bar_hp_frame, ui_bar_focus_frame, ui_bar_xp_frame` (nine-slice 48x16), `ui_minimap_frame` (nine-slice 96x96), `ui_joystick_base, ui_joystick_knob` (128x128, 64x64), `ui_button_a, ui_button_b, ui_button_ability` (64x64 round), `ui_cursor_aim`.

**b20 `class-portraits-and-ability-icons`:** `portrait_<class>` 64x64 for all 14 classes (`ranger, frostcaller, herald, punk, bruiser, rogue, warlock, paladin, berserker, druid, necromancer, trickster, gravetender, shadowpaw`) and `ability_<class>_sig` 48x48 icons for each class signature plus `ability_dash, ability_nova, ability_shield, ability_overdrive`.

**b21 `npcs-and-vendors`:** `npc_nexus_guide, npc_vendor, npc_healer, npc_blacksmith, npc_quest_giver, npc_wanderer, npc_ghost_guide` (256x256 cells, down only, idle 4 + talk 4 strips each, enemy format).

**b22 `items-relics-keys`:** 32x32 item icons: `relic_<n>` x24 (rings of 8 elements, amulets, orbs, tomes, crowns, masks, gauntlets, boots tiers), `rune_<element>` x12, `key_bronze, key_silver, key_gold, key_boss`, `token_shard, token_gem, token_star`, `scroll_<n>` x8, `tome_<n>` x8, `food_<n>` x12, `gem_<color>` x8, `egg_<n>` x6.

**b23 `bosses-extra`:** if the owner wants a larger boss roster: 8 more bosses in the b07 format (down only, 384x384, idle 4, move 6, attack_a 6, attack_b 6, hit 2, death 8); candidate ids `lich_king, hydra, treant_elder, sand_titan, frost_dragon, shadow_hydra, clockwork_golem, void_maw`.

**b24 `enemies-wave-2`:** 12 more creatures in the enemy format (idle 4, move 6, attack 5, death 5; down/up/right): `ghoul, harpy, minotaur, ogre, wraith_knight, fire_elemental, water_elemental, wind_sprite, thorn_vine, giant_spider_queen, golem_lava, crab_giant`.

## Acceptance checklist (every batch)
- Ids exactly as listed; paths match the manifest; zero blockers in `validation-report.json`.
- Seamless terrain (3x3 tile test), edges match the stated bit rule.
- Consistent style across the batch; readable at phone size; no text baked in; no stray pixels or neighbour slivers.
- `preview.png` contact sheet with labels.
- Board entry posted. Then start the next batch.
