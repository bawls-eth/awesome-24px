# Codex remake queue: R01-R48 (Claude -> Codex, 2026-11-22)

Read first: `ART-REMAKE-REPORT.md` (grades and screenshots), `ART-QUALITY-BAR.md` (the bar), `ART-HANDOFF.md` (format rules),
`CODEX-MINIGAME-ART-ASKS.md` (m01-m08 specs, folded into R14-R25 below). Ordered by visible impact: ground and props first (they fill
60-80% of every phone screen), then the weakest creatures, then the HUD and the mini games, then polish.

## Rules for every R-batch

**Style (8-bit / 16-bit feel, matched to b04 and b08).**
- Limited palette per biome: at most 24 colours per biome tileset, 32 per creature batch plus 8 accents per species, under 48 distinct
  colours per PNG. One `palette.json` per batch, ramps listed as dark -> light.
- Chunky, consistent outline: a 1 px colour-matched dark rim (the darkest step of the material's own ramp, or the shared navy `#1b2140`
  for Isles creatures), never pure black, never a light halo. Selective outline (inner lines one step lighter) is fine.
- 3-4 tone ramp per material plus a 1-2 px highlight. Flat 1-2 tone fills are an automatic fail.
- One light: top-left, the same in every view and every batch. Cast shadow down-right for props; creatures get a soft ellipse in code.
- Faces: no smiley mouths, no cartoon 2-dot "mascot" faces on monsters or wildlife. Eyes are 1-2 px with a catchlight; mouths only where
  the creature has a beak/maw/jaw. Friendly does not mean smiley.
- Silhouette first: each sprite must read as filled black at game scale (48 px native creature on a 390 px wide phone).
- True views: down / up (no face, back plates) / right (true profile, one eye). Left is mirrored in code. Effects separate.
- Original art only; no tracing; no reference-sheet crops.

**Formats (unchanged from ART-HANDOFF, so wiring is by id).**
- Creatures / enemies / heroes: one horizontal strip per action x dir, cell = 4 x native (S32 -> 128, S48 -> 192, M64 -> 256,
  L96 -> 384, XL128 -> 512), every art pixel an exact 4x4 block, alpha 0 or 255, feet on the manifest anchor. Enemy strips: idle 4 (6 fps
  loop), move 6 (10 loop), attack 5 (12 once), death 5 (8 once, last 2 frames lying down). Boss: down only, idle 4, move 6, attack_a 6,
  attack_b 6, hit 2, death 8.
- Tiles: 32x32 native 1x, opaque, seamless (prove with a 5x5 tiling in `preview.png`). Variants `_a.._h`. Transitions keep the b10t
  `edge_bits` contract (N1 E2 S4 W8, ids `<terrain>_edge_00..15`, manifest `edge_mask` and `blend`) PLUS four inner-corner tiles
  `<terrain>_icorner_{ne,nw,se,sw}`. The blend side must be drawn with the NEIGHBOUR terrain's real colours (not a generic dirt brown),
  and the boundary must be organic (2-3 px dither / foam / grass fringe), never a 1-bit blob.
- Decals: 16x16 or 32x32 native, transparent, `category: "decal"`, scattered by code over tiles.
- Icons: 16 / 24 / 32 native 1x. UI frames: 9-slice PNG with the slice inset in the manifest (`slice: {l,t,r,b}`).
- Folder `game/assets/arcane/rNN-<label>/` with `manifest.json`, `palette.json`, `preview.png` (labels under the right cell),
  `validation-report.json`, `README.md`, `CODEX-TO-CLAUDE.md`. Branch `codex/rNN-<label>`. Remakes of an existing id KEEP THE SAME ID
  (Claude points INDEX.json at the new folder; the old folder stays in the repo, never deleted).

**Acceptance (every batch, Claude checks on intake).**
1. `node game/tools/art-audit/run.js` reports 0 blockers and 0 needs-redo for the batch; under 48 colours per PNG.
2. `preview.png` includes a **side-by-side panel**: one b04 sprite (`puffcap_idle_down` frame 0 at native x3) next to 3 of your sprites at
   the same zoom, on dark `#181820` and mid-grey `#808080`. If yours look flatter than the puffcap, it is not done.
3. Tiles: a 5x5 tiling and a 6x6 transition test map (every edge mask once) in the preview.
4. Claude screenshots the page at 390x844 and 1280x800 and compares with the `ART-REMAKE-REPORT.md` shot.

**How Claude wires (all batches).** Every id below already has a code fallback (procedural tile, b-batch sprite or code drawing).
Claude registers the folder in INDEX.json (provisional), maps ids in the existing loaders (`MMArt` for Realm, `mm-creature-strips.js`
for Isles creatures, the Isles tile table in `games/isles/isles.js`, a per-game id -> image map for mini games), draws with smoothing off,
and keeps the old art / code drawing as fallback when an id fails to load. No save-format change in any batch.

---

## Tier 1: ground and props (biggest visible change)

### R01 Realm overworld base terrain (replaces b10t ids) - grade C
- Ids (keep b10t ids): `tile_deep_water_{a..h}`, `tile_shallow_water_{a..h}`, `tile_sand_{a..h}`, `tile_grass_{a..h}`, `tile_dirt_{a..h}`
  (8 variants each, 40 tiles; b10t had 4), edges `tile_<terrain>_edge_00..15` for deep_water->shallow_water, shallow_water->sand,
  sand->grass, grass->dirt (64), inner corners `tile_<terrain>_icorner_{ne,nw,se,sw}` (16). Total about 120 tiles, 32x32 native.
- Palette: shore biome 24 colours. Water: 4-tone teal-blue ramp with a 1 px foam line on the shallow->sand edge; sand: warm 3-tone with
  shell/pebble specks in 2 of 8 variants; grass: 4-tone green with tuft clusters (not uniform noise).
- Fix vs b10t: no brown under-band at the water edge, organic boundaries, 8 variants so a 12x20 tile phone view never shows a visible repeat.
- Wiring: MMArt picks `tile_<terrain>_<variant>` by hashed position; edges by the existing 4-bit mask; Claude adds the icorner pick.

### R02 Isles ground: home + meadow isles - grade D (code)
- Ids: `isle_grass_{a..h}`, `isle_sand_{a..h}`, `isle_shallow_{a..d}`, `isle_deep_{a..d}`, `isle_dirt_road_{a..d}`, edges for
  grass->sand, sand->shallow, shallow->deep, grass->dirt_road (64), icorners (16). 32x32 native.
- Palette: warm spring, 24 colours; grass lighter and yellower than the Realm grass so the two places feel different.
- Wiring: the Isles tile renderer currently fills colour rects per terrain id; Claude swaps each fill for the tile id (same autotile mask).

### R03 Nature props (replaces b12) - grade D
- Ids (keep b12 ids): `prop_tree_small` (48x64), `prop_tree_medium` (64x80), `prop_tree_large` (80x96), `prop_tree_dead`, `prop_tree_pine`,
  `prop_tree_palm` (64x96), `prop_bush_a`, `prop_bush_b`, `prop_bush_berry` (32x32), `prop_rock_a`, `prop_rock_b` (32x32), `prop_rock_big`
  (64x48), `prop_boulder_cluster` (64x48), `prop_reeds`, `prop_lily_pad`, `prop_flower_{red,blue,yellow}`, `prop_mushroom_ring`, `prop_log`,
  `prop_stump`, `prop_cactus`, `prop_coral`, `prop_driftwood`, `prop_shell`, `prop_skeleton_bones` (a real ribcage + skull, not the emoji
  crossbones), `prop_crystal_{blue,red,green}`, `prop_ice_spike`; plus new variants `_b`, `_c` for each tree and bush (30 new). Native 1x.
- Trees: real canopy clumps with 3-4 greens, dark under-canopy, trunk with root flare, a down-right ground shadow baked as a separate
  `_shadow` id (alpha 0/255 dither) so code can tint it.
- Anchor at trunk base. Wiring: MMArt prop ids unchanged; Claude reads new `frame_w/h` from the manifest.

### R04 Jungle isle ground + b30 remake - grade C/D
- Ids: keep b30 ids (`tile_jungle_floor`, `_moss`, `_fern_thicket`, `_mud`, `_mud_deep`, `_river_murk`, `_black_sand`, `_temple_stone`,
  `_temple_moss`, `_orchid_moss`, `_vine_root`, `_jungle_cliff`) with 8 variants each, plus edges floor->black_sand, black_sand->river_murk,
  floor->mud, floor->temple_stone and icorners. 32x32.
- Palette: 24 colours; three clearly separated values (dark canopy floor, mid moss, light sand) so paths read. No repeated diagonal leaf stamp.

### R05 Tundra isle ground - grade D (code)
- Ids: `tile_snow_{a..h}`, `tile_packed_snow_{a..d}`, `tile_ice_{a..h}` (with crack variants), `tile_frozen_road_{a..d}`, `tile_tundra_moss_{a..d}`,
  `tile_icy_water_{a..d}`, edges snow->ice, ice->icy_water, snow->frozen_road, snow->tundra_moss + icorners. 32x32.
- Palette: cold 20 colours, blue-violet shadows, warm-white highlights; snow must not be flat `#eef`.

### R06 Reef + Mars isle ground - grade D (code)
- Reef: `tile_reef_sand_{a..h}`, `tile_lagoon_{a..h}`, `tile_coral_shelf_{a..d}`, `tile_reef_deep_{a..d}`, edges + icorners.
- Mars (red waste): `tile_red_dust_{a..h}`, `tile_rust_rock_{a..d}`, `tile_glass_flat_{a..d}`, `tile_regolith_{a..d}`, edges + icorners.
- 32x32, 24 colours per biome.

### R07 Enemies wave 2 remake (replaces b24) - grade D
- Ids (keep): `ghoul`, `harpy`, `minotaur`, `ogre`, `wraith_knight`, `fire_elemental`, `water_elemental`, `wind_sprite`, `thorn_vine`,
  `giant_spider_queen`, `golem_lava`, `crab_giant` x {idle, move, attack, death} x {down, up, right} = 144 strips, M64 native (256 cell).
- Each creature its own anatomy (no shared rectangle + fist template): minotaur with horns, hooves and an axe; harpy with real wings and
  talons; water elemental a rearing wave with a core, no sad face; thorn_vine a snapping pod, not a daisy. Feet on y 231 (fixes the spider
  queen / crab giant hover).
- Acceptance: side-by-side with `goblin_scout_idle_down` (b05) as well as the puffcap.

### R08 Extra bosses remake (replaces b23) - grade D
- Ids (keep): `lich_king`, `frost_dragon`, `hydra`, `treant_elder`, `sand_titan`, `shadow_hydra`, `clockwork_golem`, `void_maw` x
  {idle 4, move 6, attack_a 6, attack_b 6, hit 2, death 8}, down only, L96 native (384 cell), anchor 192,350. 48 strips.
- Match b07 frontier bosses (inferno_wyrm, crystal_titan). Dragons and hydras need necks/wings, not a box.

## Tier 2: weakest creatures

### R09 Jungle core creatures (replaces b31a + b31af) - grade D
- `chompbill`, `fernraptor`, `glimmerfrog` x 14 strips each (idle/move/attack/death/hit as in b31a), plus `glimmerfrog_rest_*`; S48 native
  (192 cell) except the sizes in the b31a manifest; same ids, anchors, seats.
- No crown on the raptor, no smile on the frog; jungle palette from R04; navy rim.

### R10 Jungle creatures rest (replaces b31b) - grade D
- `vinecoil`, `canopy_glider`, `moth_lantern`, same 38 ids. Vinecoil a real coiled snake (forked tongue, scales), glider a flying-squirrel
  profile, moth lantern with a glowing abdomen as a separate `moth_lantern_glow` strip.

### R11 HUD frame kit (8-bit) - grade C (code)
- `ui9_panel_dark` (48x48, slice 16), `ui9_panel_parchment`, `ui9_panel_wood`, `ui9_tooltip` (24x24, slice 8), `ui9_minimap` (48x48),
  `ui9_hp_bar_frame` (64x16, slice l6 r6), `ui_bar_fill_{hp,xp,mana,warmth}` (8x8 tileable), `ui9_toast`. Native 1x.
- One shared UI palette (16 colours), wood/brass frame, 1 px dark rim, top-left bevel.
- Wiring: Claude replaces CSS borders with `border-image` from these PNGs (pixelated), keeping the HTML layout.

### R12 HUD buttons - grade C (code)
- `ui_btn_{normal,hover,pressed,disabled}` 9-slice 32x16 (slice 6), round icon button `ui_btn_round_{normal,pressed}` 32x32,
  ability slot frame `ui_ability_slot{,_ready,_cooldown}` 32x32, `ui_tab_{on,off}` 32x16.

### R13 HUD icon set (replaces emoji glyphs) - grade C (code)
- 24x24 native: `hud_compass`, `hud_backpack`, `hud_quests`, `hud_menu`, `hud_leave`, `hud_target`, `hud_settings`, `hud_daily`, `hud_map`,
  `hud_log`, `hud_craft`, `hud_home_dock`, `hud_soothe`, `hud_decor`, `hud_sound_on`, `hud_sound_off`, `hud_journal`, `hud_market`,
  `hud_aquarium`, `hud_tournament`, `hud_gem`, `hud_key`, `hud_bell`, `hud_heart`, `hud_star`, `hud_lock`, `hud_check`, `hud_close`,
  `hud_arrow_{l,r,u,d}` (34 icons). b19 style (it is A/B), same 16-colour UI palette as R11.
- Wiring: every emoji button in realm.js / isles.js / mini-game headers gets an `<img>` by id; the emoji stays as alt/fallback.

### R14 Pixel Pop tiles (m07 part 1) - grade D (code)
- `pop_tile_{1..11}` 32x32 (seed, sprout, leaf, flower, fruit, star, moon, sun, crown, gem, rainbow), no faces, bottom-right 10x8 quiet
  for the code number. `pop_fx_pop` S32 5 f 14 fps, `pop_fx_chain` S32 6 f, `pop_board_frame` 9-slice 48x48, `pop_bg_tile` 32x32 opaque.

### R15 Angler scene (m06) - grade D (code)
- `angler_spot_{west_pond,east_pond,river_run,sea_pier,ice_hole,mangrove,isles_cove}_{day,night}` 390x260 opaque (14), `angler_bobber` 8x12,
  `angler_splash` S32 5 f once, `angler_hero_cast` S48 right 6 f, `angler_hero_reel` S48 right 4 f, `angler_hero_idle` S48 right 4 f,
  `angler_dock` 96x24. Water in the lower 55%.

### R16 Angler fish (m02) - grade D (missing)
- 24 species from CODEX-MINIGAME-ART-ASKS m02 (+ any extra ids in `game/games/angler/`: Journal shows 48 slots, so add the remaining
  24 species in R16b with the same spec), `fish_<id>_swim_right` 4 f, `fish_<id>_flop_right` 3 f, `fish_<id>_icon` 32x32.
  Sizes S32 / M48 / L64 native. Side view, silhouette-readable.

### R17 Bug Safari (m03) - grade D (code)
- Every species id in `game/games/festival/bugs.js`: `bug_<id>_idle` 2 f, `bug_<id>_move` 4 f (S32, top-down), `bug_<id>_icon` 32x32;
  `ui_bug_net`, `ui_bug_net_swing` 4 f, `ui_bug_jar_{empty,full}`; arena thumbnails `bug_arena_<9 ids>` 96x64; arena ground tiles
  `bug_ground_{meadow,orchard,pond_edge,forest,dunes,cliffs,marsh,lantern_glade,night_glade}_{a..d}` 32x32 (36).

### R18 Campfire Jam (m01) - grade D (code)
- All m01 ids (`jam_stage_bg`, `jam_campfire`, `jam_inst_*`, `jam_lane_note_{1..4}`, `jam_lane_hold_{1..4}`, `jam_hit_*`, `jam_fx_note_burst`,
  `jam_crowd_{fox,frog,owl,bunny}_{idle,cheer}`) plus `jam_song_card` 9-slice 48x48 and `jam_lane_bg` 24x32 tileable.

### R19 Lantern Dash (m07 part 2) - grade D (code)
- All m07 dash ids (`dash_runner_{run,jump,fall}_right` S32, `dash_lantern_glow`, `dash_rock_{small,big}`, `dash_firefly`, `dash_ground`,
  `dash_gap_edge_{l,r}`, `dash_bg_{far,near}`, `dash_flag_best`) plus `dash_runner_crash_right` 4 f and `dash_dust` S16 4 f.

### R20 Stack Tower - grade D (code)
- `stack_block_{1..8}` 64x16 tileable-width blocks (stone, brick, wood, crystal...), `stack_block_cut_fx` S32 5 f, `stack_bg_sky` 390x600
  opaque (day -> dusk gradient as 3 bands), `stack_base` 128x24, `stack_crane` S32 2 f, `stack_perfect_fx` S32 6 f.

### R21 Echo Garden - grade C (code)
- `echo_flower_{red_tulip,sun_daisy,blue_bell,star_lily,...}` for every flower id in `game/games/echo/`: `_idle` 2 f and `_sing` 4 f, S32;
  `echo_bed_tile` 32x32 soil bed, `echo_garden_bg` 390x400 opaque, `echo_note_fx` S16 4 f.

### R22 Stalk Market (m04) - grade C (code)
- All m04 ids plus `stalk_market_bg` 390x200 opaque and `stalk_graph_frame` 9-slice.

### R23 Deepdelve faces (m05) - grade C (code)
- All m05 ids (16x16 block faces, ores, cracks, mobs, picks). Faces must be readable as textures at 16 px; 3 tones per material.

### R24 Logo, title art, Lantern Camp - grade B (upgrade, high visibility)
- `logo_hearthvale_large` 256x96 native (1x), `title_scene` 390x300 opaque (lantern camp at dusk, island silhouettes), `title_scene_wide`
  1280x400 opaque, `lantern_camp_bg` 390x260, `lantern_hero_plinth` 64x32. Keep b27 ids; these are additive.

### R25 Mini-game result UI kit (m08) - grade C (code)
- All m08 ids plus `trophy_{stack,echo,lantern}` and `ui_result_header` 9-slice. One loader for every result screen.

### R26 Isles hero strips - grade C (code)
- `isles_hero_<class>_{idle,walk}_{down,up,right}` for ranger, warrior, mage, cleric (start set), S48 native (192 cell), idle 4 / walk 6,
  plus `isles_hero_<class>_ride_{down,up,right}` 2 f (seated pose for mounts). Navy rim + light 1 px top-left highlight so the hero pops
  on grass and snow. Height 34-38 native px (today about 14 px on screen).

## Tier 3: other C batches

### R27 Meadow creatures (replaces b36) - grade C
- `bumble_mote`, `clover_hopper`, `meadow_strider`, `oakback`, `pebble_tortle`, `puffwool`, `thistle_boar` (98 ids, same sizes/anchors/seats).
  Add 3-4 tone fur/shell ramps, real eyes, no mascot faces. Oakback's canopy shaded like an R03 tree.

### R28 Jungle big + stegolith (replaces b32, b32s) - grade C
- `tusktop`, `fernjaw_tyrant` (43 ids), `stegolith` (20 ids) incl. real back-view saddles `*_saddle_{idle,move}_up`.

### R29 Reef mounts + turtle (replaces b38c, b38f) - grade C
- `tidesteed`, `skimray` (40 ids, real up-view saddles), `isleback_turtle` (14 ids, true profile).

### R30 Tide hydra (replaces b38g) - grade C
- 15 ids, XL128 (512 cell). Keep scale, add scale texture, 4-tone teal, reptile heads (no cartoon grin).

### R31 Rimewolf (replaces b40c) - grade C
- 14 ids, S48 (192 cell), 34-36 px standing, lighter ruff and eye highlight (ART-AUDIT-3 R1).

### R32 Highlands + godlands terrain (replaces b11a, b11b edges) - grade C
- Keep ids; 8 variants per base, redrawn edges with real neighbour colours, icorners. Highlands: heather, slate, scree. Godlands: cracked
  stone, ash, ichor pools.

### R33 Terrain decals (Realm + Isles + dungeons) - new
- 16x16 transparent: `decal_pebbles_{a..d}`, `decal_grass_tuft_{a..d}`, `decal_flowers_{a..d}`, `decal_shell_{a..c}`, `decal_crack_{a..d}`,
  `decal_leaf_litter_{a..d}`, `decal_snow_drift_{a..c}`, `decal_ice_crack_{a..c}`, `decal_bones_{a..b}`, `decal_puddle_{a..b}`,
  `decal_moss_{a..c}`, `decal_rubble_{a..c}` (40). Claude scatters them by seeded noise (5-10% of tiles).

### R34 Jungle props (replaces b33) - grade C
- Keep 8 ids at 2x density, plus `jungle_tree_c`, `jungle_bush_{a,b}`, `jungle_flower_{a,b}`, `jungle_rock_{a,b}`, `jungle_log` (8 new).

### R35 Meadow farm tiles (replaces b35 edges) - grade C
- Keep b35 ids; grass base gets 8 variants (it is one flat lime today), clover and soil edges get organic fringes and icorners.

## Tier 4: motion, life, polish

### R36 Water animation - new
- `anim_shore_foam_edge_00..15` 4 f each (32x32, 4 fps), `anim_water_sparkle` S16 4 f, `anim_ripple` S32 5 f, `anim_waterfall` 32x32 4 f.

### R37 Shared particles - new
- S16 strips: `fx_dust_puff` 4 f, `fx_splash_small` 5 f, `fx_leaf_fall` 6 f, `fx_snow_flake` 4 f, `fx_sparkle` 4 f, `fx_ember` 4 f,
  `fx_bubble` 4 f, `fx_heart` 4 f, `fx_note` 4 f, `fx_coin_pop` 5 f (shared by Realm, Isles and mini games).

### R38 Realm ambient critters - new
- S32 (128 cell), down/right, idle 2 f + move 4 f: `amb_butterfly`, `amb_songbird`, `amb_beach_crab`, `amb_pond_frog`, `amb_rabbit`,
  `amb_firefly` (night), `amb_seagull`. Non-combat, scattered by code.

### R39 Isles ambient critters - new
- Same spec: `amb_parrot`, `amb_tree_frog`, `amb_snow_hare`, `amb_arctic_tern`, `amb_hermit_crab`, `amb_dust_beetle` (mars), `amb_bee`.

### R40 Minimap + world-map icons fix (b28) - grade B
- Re-pad `mm_player` (1 px), add `mm_player_dir_{n,e,s,w}`, `mm_quest`, `mm_dock`, `mm_resource`, 24x24; `ui9_minimap` comes from R11.

### R41 Hub chrome - grade B
- `hub_header_bg` 390x96, `hub_card` 9-slice, `hub_map_tile_{grass,path,water,building}` 16x16, `hub_game_icon_<11 games>` 32x32.

### R42 Town NPCs and props - grade B
- b21 style NPCs for the Town: `npc_shopkeeper`, `npc_fisher`, `npc_gardener`, `npc_postman`, `npc_museum_owl`, idle 4 / walk 6 x 3 dirs
  S48 (192 cell); Town props `town_bench`, `town_lamp`, `town_mailbox`, `town_well`, `town_signpost` 32-64 native.

### R43 Hero redo: b01 attack / cast / roll - grade B
- `ranger_`, `mage_`, `cleric_` `{attack,cast,roll}_{down,up,right}` (27 strips, 256 cell): weapon visible every frame, real tumble.

### R44 Hero palette + halo polish (b00, b02, b03) - grade B
- Quantise to the 48-colour hero `palette.json`, remove the up/right light halo on b00, even out standing height (148). Same ids.

### R45 i01 items v2 quantise - grade B
- 58 ids, same art, quantised to <= 48 colours on the b19 icon palette.

### R46 Reef small creatures polish (b38a, b38b, b38d, b38e) - grade B
- `reef_puffer`, `shellcrab`, `glowjelly`, `fin_raider`: add the 4th tone and highlight; same ids.

### R47 Structures polish (b13) - grade B
- 44 ids: 2x density on tents, hut, ruins; campfire f1-f4 as one strip `prop_campfire` 4 f (keep the f-ids).

### R48 Relics and keys distinctness (b22) - grade B
- `relic_1..n`: each gets a distinct silhouette (today many differ only by colour); same ids.

## First five to start

R01 Realm terrain, R02 Isles home/meadow ground, R03 nature props, R07 enemies wave 2, R09 jungle core creatures. Send each as its own
`codex/rNN-*` branch; Claude reviews and wires each within the same day.

## Owner override (2026-11-22, late): do these FIRST, at the quality of the owner-supplied concept sheet
`game/design/concepts/gpt-mounts-concept-1.png` is the target richness (see ART-QUALITY-BAR.md). Before R01: M01 Isleback Turtle, M02 Skimray, M03 Rimewolf, each with true down/up/right views and separate `saddle_*` overlays at the native cell sizes in scales.json. Then R01..R05 in the order above, matching that shading level (4-5 tone ramps, clear accent colour, dark rim, top-left light).


---
---

# TOWN batches T01-T36 (Claude -> Codex, 2026-11-23)

Separate from R01-R48 (Realm / Isles / mini games). Owner: "All assets in the entire game need rework. The animals in the animal
crossing game look really bad." Grades and evidence: **`ART-TOWN-REPORT.md`** (26 groups: 0 A, 2 B, 9 C, 15 D) and the sheets / offline
screenshots in `game/design/art-town/`. Order = visible impact: villagers first, then the common wildlife, then the ground and buildings,
then icons and UI. These outrank R06+ (the owner override M01-M03 and R01-R05 stay first if already in progress; otherwise start T01).

## Town style rules (every T-batch, on top of the R rules above)

- **One Town style: cosy 8-bit/16-bit farm-life pixel art, original designs only.** No vector, no emoji, no avatar-collection look-alikes
  (the current `i/*-strip.png` busts follow well-known avatar collections; do not reuse their templates, traits or silhouettes).
- **Pixel density:** all Town art is native 1x pixels drawn at an integer zoom by code (2x phone, 3x desktop). Deliver strips at 4x
  (every art pixel an exact 4x4 block) like the R batches, plus a 1x copy for the preview.
- **Outline:** 1 px dark colour-matched rim (darkest step of the material ramp; shared navy `#1b2140` allowed for small fauna), never pure
  black, never a light halo. Inner lines one step lighter (selective outline).
- **Ramps:** 4-5 tones per material (dark -> light) plus a 1-2 px highlight; one `palette.json` per batch; per species a named ramp
  (`<id>_fur`, `<id>_accent`, ...) shared by every frame of that species. <= 32 colours per PNG for characters, <= 24 per tileset.
- **Light:** top-left in every view. Soft ground shadow drawn by code (no baked shadow on characters).
- **Readable at 1x:** each sprite must read as a filled silhouette at native size on `#181820`, `#808080` and the Town grass `#a8d878`.
- **Richness target:** `concepts/gpt-mounts-concept-1.png` (big shapes, accent colour per creature, dark rim). Faces: 1-2 px eyes with a
  catchlight; small mouths only on emote frames; no smiley-sticker faces on wildlife.
- **Proportions (villagers):** 2.5-head chibi, head 14-16 px tall inside a 32x32 cell (or 20-22 px inside 48x48), feet on the cell
  bottom row minus 2 px, same eye line (y = 11 in 32 cells) for every species, so swapping species never shifts the name tag.
- **Directions:** true `down` (front), `up` (back, no face), `left` and `right` (profiles; left may be a mirror only if the design is
  symmetric, which it never is for held items or side tufts, so draw both for villagers). Wildlife: `right` + `down`, left mirrored.

## Formats

- Villager cell: **32x32 native (128 at 4x)** for T01-T06. Strips per species, ids `vil_<species>_<action>_<dir>`:
  `walk_{down,up,left,right}` 4 f (8 fps loop), `idle_{down,up,left,right}` 2 f (2 fps loop), `emote_happy` 4 f, `emote_sad` 4 f,
  `emote_wave` 4 f (down only), `sit_down` 1 f, `sleep` 2 f (down). = 4x4 + 4x2 + 3x4 + 1 + 2 = 39 frames per species.
- Wildlife: size classes by today's on-screen size (`FF_ASSETS` w): **S 16 or 24 native** (w <= 24), **M 32** (w 26-40),
  **L 48 or 64** (w >= 44). Ids `ff_<id>_idle` 2-4 f, `ff_<id>_move` 2-4 f (walk / fly / swim / sway), `ff_<id>_caught` 1 f (held /
  in net / in jar pose, used by the catch toast and the journal). Flora: `ff_<id>_idle` 1-4 f sway + `ff_<id>_{spring,summer,autumn,winter}`
  where seasonal.
- Tiles 32x32 opaque seamless, variants `_a.._h`, edges per the R rules (`edge_00..15` + `icorner_{ne,nw,se,sw}`).
- Icons 16 and 32 native. UI 9-slice with `slice:{l,t,r,b}`.
- Folder `game/assets/arcane/tNN-<label>/` with `manifest.json`, `palette.json`, `preview.png`, `validation-report.json`, `README.md`,
  `CODEX-TO-CLAUDE.md`. Branch `codex/tNN-<label>`.

## Acceptance (every T-batch)

1. `node game/tools/art-audit/run.js` 0 blockers / 0 needs-redo; colour caps above.
2. `preview.png` **side-by-side panel**: current art (the `i/` strip frame, the SVG at its `FF_ASSETS` size, or a crop of the matching
   `art-town/shot-*.jpg`) | new art at the same on-screen size | new art at 3x, on `#181820`, `#808080` and `#a8d878`; plus a crop of
   the concept sheet for richness. If the new art is not obviously better at the in-game size, it is not done.
3. Villagers: a 4x4 grid of all four walk directions animated as a GIF/APNG strip in the preview, and all species of the batch standing in
   a row (same eye line, same feet line).
4. Claude captures the Town **offline only** (nav-town.test.js stub + `blockDb`) at 390x844 and 1280x800 and compares with the
   `art-town/` shot of the same place.

## How Claude wires (all T-batches)

- Villagers: `SPECIES` keys stay the same (saves store `species` + `frame`; the save format does not change). A new loader maps
  `vil_<species>_*` strips; when a species has a T-strip it is used for walk/idle/emote, the old `frame` index picks a palette variant
  (outfit) where the batch provides `vil_<species>_var0..8` recolours, else variant 0. If a strip fails to load, the old `i/` bust is used
  (fallback = current art stays). Picker shows `idle_down` frame 0.
- Wildlife: `ff_<id>` textures switch from SVG to the T-strip when present; `FF_ASSETS` w/h become the integer-zoomed native size;
  SVG load stays as fallback. Catch toast / journal use `ff_<id>_caught`.
- Tiles, buildings, props, icons: id -> texture map in `main.js` beside each `generateTexture` key / emoji; the code drawing or emoji stays
  as fallback. No save-format change, no Firebase change in any batch.

## Batches

### Villagers (21 picker species + residents) - all D except T07 (C)

#### T01 Villagers: cats family A
- `coolcats`, `coolcats_frogs`, `coolcats_dragons`: three distinct full-body animals, not hat swaps: a house cat, a frog-cat (green,
  wide mouth, webbed feet), a small dragon-cat (wings stub, tail spikes). 39 frames each (see Formats), cell 32 native.
  Variants `vil_<species>_var0..8` as palette swaps (fur colour / shirt) so the 9 existing `frame` choices still mean something.
- Residents using these: `mocha` (coolcats), `lily` (coolcats_frogs).

#### T02 Villagers: penguin, dog
- `pudgypenguins` (round penguin with flippers and waddle walk), `doge` (shiba-type dog, curled tail; no sunglasses meme). 39 frames each,
  var0..8. Residents `frosty`, `buster`.

#### T03 Villagers: cats family B
- `coolcats_ninjas`, `coolcats_pirates`, `coolcats_unicorns`: re-imagine as animal species with a costume accessory drawn as part of the
  sprite (ninja = a black cat with scarf; pirate = a ginger cat with eyepatch and bandana; unicorn = a pony-cat with horn and mane).
  Each must read as a different silhouette at 1x.

#### T04 Villagers: "punks" family -> animal species
- The punk-type keys are human busts in an animal town. Keep the KEYS (saves) but give each a distinct animal: `punks` -> raccoon,
  `phunks` -> fox (mirror-faced in lore only), `punkettes` -> rabbit, `goldenpunks` -> golden hamster, `halloweenpunks` -> bat-eared
  ghost cat. Labels in `SPECIES` may be renamed by Claude later; ids stay.
- 39 frames each, var0..8.

#### T05 Villagers: hair/head families -> animal species
- `mohawks` -> hedgehog (spines = mohawk), `blondies` -> sheep (blonde fleece), `genius` -> owl (spectacles), `zombies` -> green
  newt / axolotl (friendly, not gore), `apepunks` -> lemur (ringed tail). 39 frames each.

#### T06 Villagers: apes and aliens + rare
- `apes` -> gorilla-type ape (full body, knuckle walk on idle), `aliens` -> small moon-frog (cyan, antenna), `alienclan` -> axolotl-
  alien with gill fronds; distinct from `aliens`. 39 frames each.
- `RARE_SPECIES` (`avalanchepunks`, `coolcats_mohawks`, `coolcats_tvheads`, `expansionpunks`, `frontpunks`, `intlpunks`, `morepunks`,
  `punks_grayscale`, `punks_sepia`, `aliens_blue`, `aliens_green`, `aliens_red`): palette variants (`vil_<base>_rare_<key>`) of the
  T01-T06 bodies with one special accessory each; only `walk` 4 dirs + `idle_down` needed (18 frames).

#### T07 Pond cats (mooncats strip) - C
- `mooncats` frames 0..8 used by `POND_CATS`: 24 native cat, `idle` 2 f (tail flick), `sit` 1 f, `stretch` 3 f, 6 coat colours on the
  Town ramp (no pure primaries). Ids `town_pondcat_<n>_{idle,sit,stretch}`.

#### T08 Town NPCs (extends R42)
- `npc_mayor` (replaces the scaled avatar bust; same 32 cell as villagers, slightly taller), `npc_shopkeeper`, `npc_able_sisters`
  (two hedgehog seamstresses, original), `npc_museum_owl`, `npc_merchant` (Mystery Merchant at `MERCHANT_POS`), `npc_fisher`,
  `npc_gardener`: walk 4 dir x 4 f + idle + talk 2 f. Same proportions as T01.

#### T09 Villager emote + picker icons
- `emote_<n>` 16x16 pixel bubbles for each `EMOTES` entry (smile, heart, laugh, wave, party, sad, wow, zzz, note) and
  `vil_<species>_portrait` 32x32 head-and-shoulders for the picker tiles and the friend list.

### Fauna (57 species) by size class - D

Common/visible first: the species placed in the starting forest / pond / meadow zones.

#### T10 Fauna S: garden bugs (16 native)
- `ladybug`, `honeybee`, `firefly` (glow frame separate `ff_firefly_glow`), `grasshopper`, `snail`. idle 2, move 4 (fly or crawl),
  caught 1. Bug-Off and bug catching use these first.

#### T11 Fauna S: small critters (16-24 native)
- `hummingbird` (24, hover 4), `praying_mantis` (24), `daddy_longlegs` (16; legs 2 px thick so they read), `salamander` (24),
  `shrimp` (16), `sea_urchin` (16), `barnacle` (16), `sand_dollar` (16).

#### T12 Fauna S: microscopic (16 native, magnifier style)
- `amoeba`, `copepod`, `paramecium`: drawn as bold readable blobs with a lens ring icon variant `ff_<id>_lens` for the journal; idle 4
  (wobble). Must not look alike: amoeba lobed, copepod with two long antennae as 2 px strokes, paramecium slipper with cilia dither.

#### T13 Fauna M: pond and wetland (32 native)
- `frog`, `poison_dart_frog` (distinct: dart frog smaller with a bold pattern, no smile), `dragonfly`, `butterfly`, `trout`, `catfish`,
  `snake`. Swim/hop/fly move 4.

#### T14 Fauna M: woodland small mammals and birds (32 native)
- `squirrel`, `hedgehog`, `bird` (robin), `bat`, `spider`, `leafcutter_ant`. Distinct silhouettes: spider round with 8 legs, never the
  tarantula's hairy wedge.

#### T15 Fauna M: shore and reef (32 native)
- `crab`, `lobster`, `starfish`, `seahorse`, `jellyfish`, `clownfish`, `nudibranch`, `giant_clam`.

#### T16 Fauna M: desert (32 native)
- `scorpion`, `tarantula`, `desert_tortoise` (32-48), `roadrunner` (48 L if needed).

#### T17 Fauna L: forest (48 native)
- `fox` (full body, not a head), `deer` (64; full body with antlers, walk 4), `owl`, `hawk` (fly 4), `howler_monkey`. Highest-impact L
  set: fox and deer are the two worst offenders in the report.

#### T18 Fauna L: water (48-64 native)
- `heron` (64, wade 4), `otter` (48, swim 4 + float on back idle), `beaver` (48), `sea_turtle` (64), `shark` (64, fin-only surface
  frame `ff_shark_fin`), `octopus` (48), `toucan` (48).

#### T19 Fauna L: alpine (48-64 native)
- `snowy_owl`, `arctic_fox` (white coat must keep a cool grey ramp so it reads on snow), `caribou` (64), `mountain_goat` (64).

### Flora (41 species + code trees) - C

#### T20 Trees by season
- `ff_oak_tree`, `ff_maple_tree`, `ff_pine_tree` (64x96 native), and the code trees `tree_0..tree_n` + `tree_fruit` (same ids, 64x80):
  each with `_spring` (blossom), `_summer`, `_autumn` (oranges / reds), `_winter` (bare or snow-capped pine), `_shake` 3 f, `_stump`, and
  fruit overlays `tree_fruit_{apple,orange,peach,cherry}`. `joshua_tree`, `cactus` (single season).

#### T21 Flowers and crops
- `flower`, `sunflower`, `lavender`, `bluebell`, `dandelion` (+ `_seed` puff), `clover`, `orchid`, `wisteria`, the `tulips` strip
  (keep id, polish) and `FLOWER_TYPES` pickups as `item_flower_{cherry,tulip,sunflower,rose}`. Crops for the home plot
  `crop_<turnip|carrot|pumpkin|wheat>_stage0..3`. 16-32 native, sway 2 f.

#### T22 Ground cover, fungi, aquatic flora
- `grass`, `fern`, `bracken_fern`, `maidenhair_fern`, `moss`, `sphagnum_moss`, `lichen`, `mushroom`, `puffball_mushroom`,
  `bracket_fungus`, `slime_mold`, `shrub`, `sagebrush`, `blackberry_vine`, `liana_vine`, `poison_ivy`, `water_lily`, `duckweed`,
  `cattail`, `kelp`, `coral`, `fire_coral`, `sea_fan`, `sea_anemone`, `red_algae`, `eelgrass`, `turtle_grass`, `diatom`. Each with a
  distinct silhouette (no more "green strokes" x5), `weed` (code texture id) redrawn as 3 variants `weed_a..c`.

### Terrain, water, buildings, props - D/C

#### T23 Town ground tiles with seasons
- `town_grass_{a..h}`, `town_grass_flowers_{a..d}` x `{spring,summer,autumn,winter}`; `town_snow_{a..h}` for winter. 32 native.
  Decals `town_tuft_{a..f}`, `town_pebble_{a..d}`, `town_leaf_{a..d}` (autumn), 16 native.

#### T24 Paths and plaza
- `town_path_dirt_{a..d}` + `edge_00..15` + `icorner_*` onto grass; `town_plaza_stone_{a..d}` + edges; `town_bridge_wood` (h/v).

#### T25 Water and shore
- `town_water_{a..d}` animated 4 f, `town_shore_edge_00..15` + `icorner_*` (grass -> water with foam, real grass colours on the blend
  side), `town_sand_{a..d}` + `town_sand_edge_*`, `wave_crest` 4 f and `foam_dash` 4 f (same ids), `town_dock_{plank,post,end}`,
  `fish_shadow_{s,m,l}` 2 f, `bobber` 2 f, `splash` 4 f.

#### T26 Buildings 1 (square)
- `bld_shop`, `bld_able_sisters`, `bld_museum`, `bld_town_hall` (where the Mayor stands), `bld_realmgate` (same id `realmgate`), each
  96-160 native, front view, separate `_door_open` overlay and `_night` window-glow overlay. Replaces the code boxes.

#### T27 Buildings 2 (homes)
- `home_house_{s,m,l}` x 3 roof colours, `homePlot` (same id), `home_fence_{h,v,post}`, `bugoffSign` (same id), `realm_gate_sign`.

#### T28 Furniture and town props
- `workbench`, `mailbox`, `homeTank` (same ids), `town_noticeboard`, `town_postcards_board`, `town_bench`, `town_lamp` (+ `_lit`),
  `town_well`, `town_signpost`, `town_hole` (dug hole + `town_hole_filled`), `town_rock_{a..c}` (replaces `rocks` / `punkrocks` use),
  `arrival_puff` 4 f.

#### T29 Home interior furniture (house / decor items)
- `furn_bed`, `furn_table`, `furn_chair`, `furn_lamp`, `furn_rug_{a..c}`, `furn_shelf`, `furn_plant`, `furn_aquarium`, `furn_radio`,
  `furn_wallpaper_{a..d}`, `furn_floor_{a..d}`: 32-64 native, front 3/4 single view.

### Catching, items, UI

#### T30 Fishing
- Fish for `FISH_SPECIES`: `fish_minnow`, `fish_shrimp`, `fish_frog`, `fish_koi`, `fish_puffer`, `fish_crab`, `fish_turtle`,
  `fish_squid`, `fish_jelly`, `fish_octopus`, `fish_shark`, `fish_goldfish`: 32 native caught pose + 16 icon each; `tool_rod` (idle,
  cast 3 f, reel 2 f), `catch_banner` 9-slice. Replaces the emoji icons (emoji stays as fallback).

#### T31 Bug catching
- `tool_net` (idle, swing 3 f), `bug_jar`, `catch_burst` 4 f; `icon_bug_<id>` 16 for every T10/T11 bug; Bug-Off medal icons
  `medal_{bronze,silver,gold}`.

#### T32 Resources and items
- HUD bar resources: `item_wood`, `item_stone`, `item_fish`, `item_bug`, `item_apple`, `item_bone`, `item_museum`, `item_turnip`,
  `item_shell`, `item_flower` (16 + 32), `BEACH_ITEMS` -> `item_shell_{conch,scallop}`, `item_starfish`, `item_bottle`; fruit
  `item_{apple,orange,peach,cherry}`; tools `tool_{axe,shovel,watering_can,slingshot}`.

#### T33 Museum and fossils
- `FOSSIL_TYPES` -> `fossil_trex_bone`, `fossil_ancient_shell`, `fossil_mammoth_tooth`, `fossil_dino_egg`, `fossil_trilobite` (32
  icon + 48 display on a plinth), `museum_plinth`, `museum_case`, `museum_frame`.

#### T34 UI frame kit (Town, shared with the 8-bit theme)
- `ui_town_panel` (9-slice, wood + parchment), `ui_town_button_{idle,hover,pressed,disabled}`, `ui_town_tab`, `ui_town_chip`, `ui_town_input`,
  `ui_town_toast`, `ui_town_speech` (speech bubble 9-slice with tail), `emote_*` (T09), HUD icons `icon_{map,journal,today,museum,settings,
  backpack,where_to,chat,photo,build}` 16/24. Same palette family and corner style as the R-batch 8-bit UI (R11/R12) so Town and Realm
  share one kit.

#### T35 Join screen / picker
- `ui_join_bg` (town panorama, 390x844 and 1280x800 crops), `ui_join_logo` ("Hearthvale" pixel logotype), `ui_species_tab` (icon + name
  using `vil_<species>_portrait`), `ui_avatar_frame_{idle,selected}`.

#### T36 Night, seasons and weather overlays
- `fx_night_window_glow`, `fx_lamp_glow` (radial, 64), `fx_fireflies` 4 f, `fx_snowfall` / `fx_rain` / `fx_petals` / `fx_leaves`
  tile-able 128 overlays 4 f, `fx_star` 2 f. Effects separate from sprites (ART-HANDOFF).

## Start order

T01, T02, T17 (fox/deer), T10, T13, T23, T26, T30, T32, T34. One branch per batch; Claude wires each by id with the old art as fallback.


## UPDATE 2026-11-23 (owner decision): the Town's punk/cat villagers are GONE, replaced by the 10 hero classes
The Town now draws the 10 Realm heroes (b00-b03 art) as players, villagers and statues. So **T01-T07 are cancelled** (no new villager species or pond-cat art) and **T09 changes** to hero emote/portrait extras only if wanted: sit/sleep/wave/happy/sad strips for the 10 heroes (true down/right, 32 native). T08 (Town NPCs) stays but should be drawn as heroes-style characters, not animals. Everything else in T10-T36 stays. Priority order now: M01-M03 (mounts) -> R01-R05 -> T10, T13, T17 (fauna), T23, T26, T30, T32, T34 -> the rest.


## UPDATE 2026-11-23 (beta, World + Graphics lane): art asks from the beta reports (code side is done or waiting on these)
Same rules and formats as above (ART-HANDOFF, 4x native cells, true down / up / right views, effects separate, original art only). Claude wires
each by id with today's art as the fallback.

#### B-01 Nexus plaza floor + frame (b12-08, b04-05..07, W-04)
- `nexus_floor_a..f` (32x32 native, opaque, seamless, 6 variants: dark violet flagstones with a faint rune inlay on 2 of them), `nexus_floor_edge_00..15`
  (b10t edge_bits contract, against void), `nexus_rim_{n,e,s,w}` and 4 outer corners (a raised stone kerb, 32 native), `nexus_portal_pad` (64 native,
  the stone pad each portal stands on). Today the plaza is a code-drawn two-tone checkerboard on a rounded web box.

#### B-02 Touch stick ring + knob (b12-10, W-13)
- `ui_stick_ring_move`, `ui_stick_ring_aim` (100 native, transparent centre, 2 px rim, aim ring blue accent), `ui_stick_knob_{idle,pressed}` (40 native,
  round, 3-tone with top-left highlight), matching the R11/R12 8-bit HUD kit. A code-drawn pixel version ships now (realm-8bit.css, W-13).

#### B-03 Tundra generics (b06-01, W-17): 4 species are still code-drawn recolours
- `glacier_shellback` M64 (armoured ice turtle, frosted shell plates), `icicle_bat` S48 (a real bat: membrane wings, icicle fangs), `shagtusk` L96
  (woolly tusked mount, `saddle_shagtusk` overlay separate), `sabrefang` L96 (sabre-tooth cat, pale stripes). Enemy strip set each (idle 4, move 6,
  attack 5, death 5) x down / up / right.

#### B-04 Mars creatures (b06-02, W-17): every species is code-drawn from two shared templates
- `regolith_roly` S48 (rolling rock bug), `bubblemoth` S48 (moth with glassy bubble wings), `dust_devil` S48 (a dust swirl with a grit core: a creature,
  not a blob), `scrapper_drone` S48, `rustbeetle` M64 (rust-red beetle shell), `crater_strider` L96 (long-legged strider), `void_grazer` XL128.
  Enemy strip set each x down / up / right.

#### B-05 Isle bosses: Frost Dragon vs Red Titan (b06-03, W-17)
- Both are one recoloured yeti-like humanoid today. `frost_dragon` XL128 (winged ice dragon, frost breath in attack_b, wings in the silhouette) and
  `red_titan` XL128 (hulking red-rock giant, magma seams, ground slam in attack_b). Boss strips: down only, idle 4, move 6, attack_a 6, attack_b 6,
  hit 2, death 8. Plus `arena_ring_tundra`, `arena_ring_mars` (boss arena ring, 256 native; today a code ring).


## UPDATE 2026-11-24 (Round 4, Claude D2): what is still MISSING, in priority order
Everything below WAITS ON CODEX (Claude cannot draw production art). A code-drawn fallback in the established style is live for each one
today, so nothing looks broken while it waits; the fallback is named so you can see what you replace. Same rules as the top of this file
(4x native cells, 1 px colour-matched outline, 3-4 tone ramps, top-left light, no smiley faces, true down / up / right, side-by-side panel
next to b04 `puffcap_idle_down`, `node game/tools/art-audit/run.js` with 0 needs-redo). Branch names `codex/<id>-<label>`.

| # | Id | What | Size / format | Fallback live today | Why (beta id) |
|---|----|------|---------------|---------------------|---------------|
| 1 | B-03 / B-04 | Tundra species (glacier_shellback, icicle_bat, shagtusk, sabrefang) and Mars species (regolith_roly, bubblemoth, dust_devil, scrapper_drone, rustbeetle, crater_strider, void_grazer) | spec above (S48 / M64 / L96 / XL128, enemy strip set x 3 dirs) | code-drawn recolour templates (mm-creature-draw.js) | b06-r2-01, b06-r2-02 (P2), W-17 |
| 2 | B-05 | `frost_dragon`, `red_titan` boss strips + `arena_ring_tundra / _mars` | XL128, boss strip set | one recoloured humanoid | b06-r2-03 (P2), W-17 / W-18 |
| 3 | T-STATUE (new) | `statue_founder` for the Town Founder's Statue (owner decision O-10): a heroic adventurer in carved stone (cloak, raised lantern or sword) standing on its own 3-step plinth. NOT an ape, not a real person. Down view, 1 frame, plus `statue_founder_shadow` | 24x40 native (96x160 cell), feet anchor (48,156); Town pixel scale is 1x = hero 24 px | stone-tinted hero alias (`mooncats` frame 0) on a code-drawn 3-step plinth with a bronze plaque (main.js drawStatue) | b12-r2-05, b07-05, O-10 |
| 4 | B-01 | Nexus plaza floor + kerb + portal pad | spec above | code flagstones with a mosaic ring (realm-world.js nxFloor), square 8-bit frame | b12-r2-08 (P2) |
| 5 | R01 redo | Realm overworld terrain. The R01 delivery was REJECTED in game (TEAM-BOARD 2026-11-24): 92-98% of every grass / sand tile is one colour, and the grass is a muted teal that clashes with the b10t tall grass next to it. Redo with at least 15% detail pixels per tile (blades, pebbles, 2-3 tone noise), in the Realm palette (grass #3f7f33, tall grass #336f2a, sand #b9a676), all 8 variants visibly different | 32 native, a-h, edge_00..15 + icorner | b10t + code smoothing / inner-corner fill / organic shade noise (R4-D2) | b04-01, b04-03 |
| 6 | R01b (new) | Highlands / Godlands inner corners: `tile_snow_icorner_{ne,nw,se,sw}`, `tile_lava_rock_icorner_*`, `tile_dry_grass_icorner_*`, `tile_gravel_icorner_*`, plus a `tile_dry_grass_edge_*` set without the dashed yellow rim. The b11a edge tiles draw a notch in every open corner; code now paints it back when the diagonal matches (fillInnerCorners) | 32 native | code corner fill (realm-world.js) | b12-r2-04, b04-03 |
| 7 | R02 redo | Isles home / meadow ground. REJECTED: 97-98% one colour per tile and grass #5d8b50 instead of Hearth Isle's #6cbf55 ramp (the b35 edges, props and creatures are tuned to it). Redo in the island ramp with detail pixels | spec R02 | code pattern fill | b06-r2-06 (flat start terrain) |
| 8 | Black sand | `tile_black_sand_a..d` for the jungle beach: b30 is 95% #323039 blue-black and reads as a void block next to the jungle start; staged R04 made it light tan (no longer black sand). Wanted: warm volcanic sand, base ~#5a4e45 with darker / lighter grains | 32 native | b30 unchanged (tests/isle-art-bake.test.js pins exact b30 pixels) | b12-r2-09 |
| 9 | W-06 scale | Scale table the code uses now (draw to these sizes, never upscale in the PNG): Town hero 24 px = 1.0; Town NPCs and statue 1.0; Town wildlife insects / frogs 14, birds / snakes / crabs 16-18, fox / otter / owl 22-27, deer / caribou / goat / shark 30-32 (0.45 x the old SVG size, 14..32). Isles per scales.json (S 32-48, M 64, L 96, XL 128 native, drawn at 1/4 of the 4x cell); hero 48 native | table | main.js ffDisplaySize / npcScale; scales.json | b12-r2-05, W-06 |
| 10 | R09 redo | Jungle core (chompbill, fernraptor, glimmerfrog). REJECTED: blob silhouettes with the face on the belly, 2 flat tones, death strips stand upright (the last 2 frames must lie down), fernraptor does not read as a raptor | spec R09 | b31a / b31af stay live | ART-QUALITY-BAR 1 |
| 11 | M02 skimray fix | `skimray_idle_down` / `_move_down`: lowest opaque row 271-275 vs anchor.y 347 (floats 72-76 px, audit needs-redo). Fix the rows; then it wires with no code change | 384 cell | b38c skimray | art audit |
| 12 | M03 bug safari redo | REJECTED: all 9 bugs share one red body template (antlion = beetle = cricket), no side-by-side panel. Each bug needs its own silhouette and colour | spec m03 | code bugs | R17 |
| 13 | R13 | HUD icon set (emoji glyphs on the Hub cards) | spec R13 | emoji | b12-r2-11 (P3) |

Merged and waiting on CODE or a test decision (not on Codex): M01 isleback turtle (rider seats must be re-measured on the new shell before
wiring), M03 rimewolf (accepted, a one-line path switch in mm-creature-strips.js, but tests/shared-mm-creature-strips.test.js pins the b40c
url), R04 jungle and R05 tundra ground (staged, unregistered; R05 tiles are 79-94% one colour, so check against the R01 rejection first),
m02 angler fish and t10 / t13 Town fauna (staged, unregistered: their strips carry no class key and tests/art-integration.test.js counts
that as "missing").

## UPDATE 2026-11-24 (cycle 0, Claude G): status of the list above + new asks
Code changes this cycle (they are fallbacks; a delivery replaces each by id, same rules as above):
- #1 / #2 (tundra + mars species, Frost Dragon / Red Titan): the code templates now have a colour-matched outline and crisp alpha, and the
  two bosses have their own features (dragon wings / tail / snout / horns, titan spines / shoulder rocks / horns / lava seams). Still
  placeholders: the strips are still wanted, top priority.
- #7 (R02 Isles ground): grass / sand on Hearth Isle now get code detail pixels and stepped edges; the large interiors still read calm.
  The R02 redo is still wanted.
- #8 (black sand): an overlay pass re-lights b30 black sand into a warm volcanic ramp in game. A real `tile_black_sand_a..d` (base
  ~#5a4e45) is still welcome and will replace the overlay (`?warmsand=0`).
- #13 (R13 HUD / Hub icons): the Hub cards now use code-drawn 16x16 icons (`shared/mm-pixel-icons.js`). A 24x24 set in the b19 / M08
  style (ids `hub_town, hub_realm, hub_isles, hub_lantern, hub_pop, hub_dash, hub_stack, hub_echo, hub_jam, hub_angler, hub_bugs,
  hub_stalk, hub_deepdelve`) would replace them; lower priority now.

New:
| # | Id | What | Size / format | Fallback live today | Why |
|---|----|------|---------------|---------------------|-----|
| 14 | T-BLD (new) | Town buildings: house (pink), Able Sisters shop, turnip stand, shop front. Flat fills with no outline today next to outlined trees / statue / workbench | down view, 1 frame each, Town 1x scale (hero 24 px) | code rectangles | cycle 0 audit #5 |
| 15 | R03b (new) | `prop_tree_medium` (and small): break the round canopy edge (3-4 leaf clumps, a notch or two), keep cell / anchor | as R03 | R03 as delivered | R03 review nit, cycle 0 audit #7 |

## UPDATE 2026-11-24 (cycle 2, Claude G): what code could not solve, re-prioritised
Code this cycle (fallbacks, replaced by id on delivery): Isles field overlay (`MMIsleArt.fieldDetail`, flowers / pebbles / tufts on
grass-like non-PNG tiles, `?islefield=0`); Town world labels use code-drawn 16 px icons instead of emoji (`?worldicons=0`). Priority now:
1. **Isles W-06 creature scale** (cycle 1 table in `beta/cycle1-art.md`): pebble_tortle 21, puffwool 28, frostfox 30 standing px up to
   32-48; the jungle small set (chompbill 46, canopy_glider 46, fernraptor 52) down toward 36-40. A code rescale is non-integer (not
   pixel-safe), so only a redraw fixes it. Same ids / anchors.
2. **Tundra / mars species strips + Frost Dragon / Red Titan** (cycle 0 #1 / #2): still code placeholders.
3. **R01b Realm inner corners** `tile_<terrain>_icorner_{ne,nw,se,sw}` for the Godlands / Highlands zone seams: not attempted in code
   this cycle (time box); the stair-step corner where two edge masks meet is still visible. The PNG set is the real fix.
4. **R02 Isles ground redo** (#7): the field overlay adds sparse detail, but the jungle floor PNG (b30) still reads as a black field at
   390x844 and cannot be painted over (tests pin its pixels).
5. **Town label art (16x16 or 24x24, b19 style)**: `town_label_{house,museum,mail,hammer,book,turnip}` would replace the code icons;
   Founder's Statue and the Isles sign keep their emoji until a test-approved change (both pinned).
6. T-BLD, R03b: unchanged from cycle 1 (code finish / tree overlay are stopgaps).
Idle / death animation polish (Town heroes, Realm enemies, Isles creatures) and Nexus plaza life were NOT done in code this cycle; enemy
death strips (5 frames, last 2 lying down) already ship for b04 and the R07 set, so a code dissolve is the cheap next step (cycle 3).

## UPDATE 2026-11-24 (cycle 3, Claude G): b03 verdicts, what code now covers, re-prioritised asks
Reviewed: `codex/b03-icicle-bat` ACCEPTED + merged provisional (audit 0/0; wiring waits on the pinned tundra kinds list in
`shared-mm-creature-strips.test.js`). `codex/b03-glacier-shellback` REDO: true side view for `_right`, death last 2 frames lying
down, a readable attack (sheet `beta/img/cyc3-art-codex-b03-contact.jpg`, board entry has details).
Code stopgaps shipped this cycle (so these asks drop in priority but stay wanted): Realm R01b inner corners copy the corner from the
terrain's own edge tile (`?icorner=0`), so the stair-step is gone but corners are square, not rounded; enemy / Isles creature death
dissolve (2x2 Bayer, `?dissolve=0`); Nexus torch / banner / NPC life (`?nxlife=0`); pixel icons for every Town world label except the
pinned glyphs (statue, Isles sign, mailbox count, the four portal doors).
Priority now:
1. **Glacier Shellback redo** (above), then the rest of B-03 / B-04 tundra + mars species in the icicle bat's quality.
2. **W-06 Isles creature scale** (unchanged, the largest visual mismatch left: creatures 1.5-2x the hero at 390x844).
3. **Isles tundra / jungle ground**: snow, ice and moss are flat single-colour tiles with dashed 32 px seams
   (`beta/img/cyc3-art-isles-tundra-survey-d.jpg`); R05 tundra ground needs 3-4 variants each with grain, plus edge sets.
4. **R01b PNG inner corners** `tile_<snow|lava_rock|dry_grass|gravel>_icorner_{ne,nw,se,sw}`: rounded inner corners to replace the
   square code corner.
5. **R02 Isles ground redo**, black sand (unchanged).
6. **Town label art** 16x16 (b19 style) for the 16 code icons now in `shared/mm-pixel-icons.js` (house, museum, mail, hammer, book,
   turnip, dice, joystick, grave, wheat, dress, pickaxe, cart, flask, bugs, angler) and a door icon if the doors' test pin is lifted.


## UPDATE 2026-11-24 (cycle 4, Claude G): W-06 exact redraw spec, ground now covered by code
No new `codex/*` branch since b03 (icicle bat merged, glacier shellback REDO still open).
Code stopgaps shipped this cycle: Isles tundra / jungle ground overlay (`MMIsleArt.biomeDetail`: snow drifts, sparkles, ice cracks,
frost; roots, leaf litter, moss; soft seams instead of the dashed 32 px box; `?tundradetail=0` / `?jungledetail=0`), Town building
finish pass 2 (window glints / frame / sill, roof shingle courses, contact shadows; `?bldfinish2=0`). R05 tundra PNGs are still wanted.

### W-06 redraw spec (the three under-size Isles creatures). Why not code: the strips are drawn at exactly 1/4 of the 4x cell so one art
pixel = one screen pixel. The only per-frame-safe scale is an integer one: 2x puts puffwool at 56 and frostfox at 60 (over the S cap
48) and would show 2x2 art pixels next to 1x creatures (mixed pixel density, ART-HANDOFF). So: redraw, same files / ids / cells / anchors.
Heights are STANDING px at 1x (anchor row minus the top opaque row, idle, facing down, = `__isles.stripSize(kind)`); in the 4x PNG
multiply by 4. Hero = 48 (native), S class band 32-48.
| kind | file set | cell / anchor (unchanged) | now (1x) | target (1x) | target in the 4x PNG | width |
|---|---|---|---|---|---|---|
| pebble_tortle | b35 meadow creatures | 192, ax 96, ay 173 | 21 | **34** (+13) | 136 px: top opaque row at y = 37 | scale the body x1.6 (about 40 px wide at 1x, 160 in the PNG); shell reads as a dome with 3-4 tone ramp + top-left highlight |
| puffwool | b35 meadow creatures | 192, ax 96, ay 169 | 28 | **38** (+10) | 152 px: top row at y = 17 | x1.35 (wool silhouette, keep the 2-tone wool clumps but outline them) |
| frostfox | b40b tundra creatures | 192, ax 96, ay 171 | 30 | **40** (+10) | 160 px: top row at y = 11 | x1.33; tail may overhang to x 20..172 |
Rules: every view (down / up / right, true back and side) and every act strip (idle, walk, attack, hurt, death; frostfox also sleep,
eat) at the same new height (+-1 px between frames for bob only); feet stay on the anchor row; frame counts and fps unchanged; dark
colour-matched outline, 3-4 tone ramp, top-left light (b04 bar). Deliver with a contact sheet next to `puffcap_idle_down` and the hero
at 1x and 3x. On delivery G adds a check that reads `stripSize` and pins 32 <= h <= 48 for all three.
Then (lower): the jungle small set down toward 36-40 (chompbill 46, canopy_glider 46, fernraptor 52), same rules.

## UPDATE 2026-11-25 (cycle 6, Claude G): review of `codex/b03-glacier-shellback` v2 (83e4d6e), NOT merged
`git fetch origin`: the only new codex commit since cycle 4 is 83e4d6e (Glacier Shellback v2). Every other `codex/*` branch is unchanged
since its earlier review. Contact sheet of all 60 cells with the y=231 baseline: `beta/img/cyc6-art-codex-shellback-v2.jpg`.

Numbers (decoded from the PNGs in the branch, own script): 12 strips, frame counts match the manifest (4/6/5/5), 256 cells, anchor
(128,231) in every entry, lowest opaque row = 231 in all 60 frames, alpha 0/255 only (0 soft pixels), every 4x4 block uniform (true 4x
pixel grid), 11-13 colours per strip, dark outline in every view. `node game/tools/art-audit/run.js` NOT run on it (it reads INDEX.json in
the working tree and I do not stage unaccepted art). Standing height 196-204 px in the cell = 49-51 native, fine for M64.

What is now right (keep it): the up view is a true back (no face, tail visible, 4 different idle cells); the right view finally has a
head and neck in profile with one eye; attack down has an anticipation frame (head up) and an open-jaw strike frame; the last two
death frames lie on the ground.

REDO (two things, both against ART-HANDOFF section 3 rules 1 and 3):
1. **Right view body is still the front view.** Only the head was turned. The shell is the same tall, symmetric dome with the crest
   spike centred over the body, and all four legs stand in one even row exactly like `idle_down`. A true side profile of a tortoise:
   the shell is a long, LOW dome (about 1.4-1.6x wider than tall, the top line sloping down toward the tail), the crest spikes run along
   the ridge from front to back (not a single crown on top), the near front leg and near back leg are drawn full in front of the shell
   rim and the far legs only as a darker sliver behind them, the plastron (belly plate) shows as a flat band under the shell rim, and the
   tail sticks out at the back. Target bbox for `idle_right`: about 220-236 wide x 150-170 tall (now 228 x 192). Same for move / attack /
   death right. In `move_right` the near pair and far pair must alternate (near-front with far-back), with a visible lift of each foot.
   In `attack_right` the head and neck must LUNGE forward 12-20 px on the strike frame (now the head only opens its jaw in place).
2. **Death collapses in one step, it does not fall.** Frame 3 (standing, 176 px) jumps straight to frame 4 (lying, 120 px), and frames
   4-5 read as the standing sprite squashed vertically ("shrink"). Required, 5 frames: f1 hit recoil (head pulled back, shell tilts
   ~10 deg), f2 legs buckle on one side so the shell TIPS toward the camera-right side (shell top moves 12-20 px sideways and down,
   not just down), f3 the shell lands on its side or rim (one side of the shell touches the ground, the other edge in the air), f4 the
   shell rocks back and settles low, legs splayed out flat, head on the ground with the eye closed (a line, not the open eye), f5 the
   same lying pose held (it is the frame the code holds before the dissolve). The lying silhouette must be WIDER than the standing one
   (shell on its rim / flat), not the same width with less height. Same for down / up / right.
Nits (fix while redrawing): `move_down` legs barely alternate (2 of 6 frames look the same); the attack down strike frame could push
the head 4-8 px toward the camera (lower on the screen) so it reads at 48 px on a phone.

Deliver on the same branch with a side-by-side panel (old v2 right / new right next to `puffcap_idle_down`), and run
`node game/tools/art-audit/run.js` (0 needs-redo) before asking. On acceptance G stages it and the icicle bat wiring together.

Code this cycle (no Codex ask): Realm hit flash is now a warm palette red edge ellipse + slow enemy bullets have a trail and a bright
core (`?hitfx=0` = old); Isles tundra water next to ice gets a code ice ledge (`?icehole=0`). R05 PNG tundra tiles are still welcome but
drop further in priority; the jungle small-creature W-06 heights (chompbill 46, canopy_glider 46, fernraptor 52 -> 36-40) still need a
redraw (not solvable in code: non-integer scale).

## OWNER PRIORITY UPDATE 2026-11-25: Town animals first
Owner (live chat): "All animal crossing animals need rework - add those to Codex." The Town batches T01-T36 above (villagers first, then common
wildlife, then ground, buildings, icons) are RAISED TO PRIORITY 1, ahead of the remaining B-03 Tundra items and everything R06+. Order stays:
T01 villagers (all five: Mocha, Frosty, Buster, Lily, Spike; true front/back/side views, original designs, not avatar-collection look-alikes),
then the common wildlife. Keep the Glacier Shellback redo (see the cycle 6 UPDATE) as the only B-03 item still in front of them.
Rules unchanged: original art only, ART-HANDOFF.md formats, push to `codex/<topic>` branches only, audit before asking for a merge.

## Codex status — Icicle Bat frost detail
Icicle Bat detail pass: in-place revision of accepted PR #60 art, all 12 strips / 60 cells; 54 active or falling frames receive 2–3 tapered attached ice spikes on wing edges, final six flat death cells unchanged in visible pixels. Existing palette, IDs, 192 cells, timing and anchor (96,171) unchanged. Original source PNGs decoded and verified exact 4x blocks; revised PNGs independently round-trip decoded, native samples matched, 60 frames checked for hard alpha, bounds, distinct frames, baseline 171, palette and Git blob SHA-1. Two 3x native contact sheets visually reviewed. Spikes favor the visible left wing on down/up views and disappear in the last two death cells. Full repository audit/tests not run; pending Claude review. No code/tests/Firebase changes. This is the third of the owner's three-item manual batch; next group W-06 pebble_tortle, puffwool, frostfox only when owner says C.

## UPDATE 2026-11-25 (cycle 6 codex review, Claude): Shagtusk, Sabrefang, saddles REDO; Icicle Bat frost detail MERGED
Reviewed `codex/b03-shagtusk` 8194913, `codex/b03-sabrefang` 753fc9d, `codex/b03-saddle-overlays` a943caf, `codex/b03-icicle-bat-frost-detail`
5985c6c. `game/tools/art-audit/run.js` was run on a scratch copy of each branch (its own INDEX entry, nothing staged here): **0 rows**
(0 blocker / 0 needs-redo / 0 nit) for all four batches. Own decode: frame counts 4/6/5/5 match, cells 384 (L96) / 192 (S48), 0 soft-alpha
pixels, every 4x4 block uniform, 7-13 colours per strip, feet on anchor y 347 / 171 in every frame. The technical side is clean; the
fails below are drawing / animation (ART-HANDOFF section 3 rules 1 and 3). Contact sheets (anchor line red, seat dot green):
`beta/img/cyc6-codex-shagtusk.jpg`, `cyc6-codex-sabrefang.jpg`, `cyc6-codex-saddle-overlays.jpg` (saddle composited on its mount),
`cyc6-codex-icicle-bat-frost.jpg`.

**Icicle Bat frost detail (5985c6c): ACCEPTED, merged provisional.** Same ids, frames, anchor and per-frame bbox as the accepted base;
only wing-edge spikes added, all colours already in `palette.json`. Still not wired (tundra list pinned in shared-mm-creature-strips).

**Shagtusk (8194913): REDO, not merged.** Views are right (up = true rear, no face; right = true profile with trunk and tusks), keep them.
1. Death (all three dirs): f1-f3 are the standing idle pose (down f1/f2/f3 bbox 276x284, 276x288, 276x284; up f1-f3 only lose 12-28 px of
   height), then f4 jumps to lying (324x220 down, 324x156 up). f4 = f5 pose in every dir (same bbox). Needed: f1 recoil (head up, trunk
   thrown back), f2 front legs buckle (front of body drops 30-40 px, rear still up, body tilted), f3 rear legs give, body hits the ground
   on its side (right view: belly line on the ground, legs sticking out sideways), f4 settle (head and tusks on the ground, trunk limp,
   eye closed as a line), f5 hold. In down view the head must also drop and shrink in height (now the full head + tusks sit on a flat
   body like a mask, `death_down` f4/f5).
2. Walk: `move_down` / `move_up` legs barely move (bbox width changes only from the tusk line; the four feet stay in the same columns
   in f1, f4, f6). Draw alternating diagonal pairs with a visible 8-12 px lift of the raised foot and the body bobbing 4 px.
   `move_right` is better but the near and far legs are the same colour: make the far pair one ramp step darker.
3. Attack: f1 == f5 byte-identical in all three dirs (fine as recovery, but then f2-f4 must carry the motion). `attack_down` reads as
   idle at phone size: the head must dip (f2, anticipation: head down 12-16 px, tusks forward) and then swing up (f3: tusks raised
   above the head line, trunk up, 20+ px taller). `attack_right` f3 must lunge the head forward 16-24 px past the idle nose x (now +8).
4. Fur: the body reads as smooth faceted rock (big flat polygons, straight edges). Add shag: ragged 2-3 px fur tufts along the belly
   line, the back of the head and the legs (a broken silhouette edge, not straight), a 4-tone warm ramp with darker fur strands.
   The trunk in the right view is a straight vertical grey block in front of the tusks: give it a curve (down and slightly back).

**Sabrefang (753fc9d): REDO, not merged.** Front (amber eyes, sabres) and back (no face, tail) are good; keep them.
1. **Right view is not a cat profile.** `idle_right` bbox 312 x 308: a round ball body with the head stuck on the front edge, the
   back as tall as the shoulder. A sabre-tooth side view is LONG and LOW: target bbox about 330-350 wide x 220-250 tall, straight
   back line sloping down from shoulder to hips, deep chest, tucked belly, long tail held low behind, head lower than the shoulder
   hump, near legs full, far legs one step darker and offset. Redraw all 4 right strips.
2. Pale stripes (queue spec "sabre-tooth cat, pale stripes") are missing: add 4-6 pale/dark stripe pairs across back and flanks in all
   views (they also break up the flat grey).
3. Death: f3 (still standing, 276x244) -> f4 lying (288x152) in one step in down/up; f4 and f5 have the same pose. Same 5 beats as
   the Shagtusk spec above (recoil, buckle, side-fall, settle, hold), lying silhouette on its side.
4. Walk: `move_down` legs alternate only in f2 and f5. Every frame a different leg position, alternating diagonal pairs.
5. Body shading is faceted flat polygons (same issue as Shagtusk); want the b04 bar: 4-tone ramp, top-left light, fur texture.

**Saddle overlays (a943caf): REDO, not merged** (and they cannot be accepted before both mounts, since they align to those frames;
remeasure on the redrawn mounts). Hard alpha, 4x grid, separate from the body: good. Problems seen with the saddle composited:
1. **Down view covers the face.** `shagtusk_saddle_idle_down` spans y 36-203 and `sabrefang_saddle_idle_down` y 40-207, while the mount
   head/eyes sit at about y 120-200: the saddle is painted over the forehead and both eyes and sticks 24-28 px above the mount's top.
   From the front the saddle is BEHIND the head: draw only what shows above/beside the head (pommel tip, the blanket corners at the
   shoulders), nothing over the face; bottom of the overlay above the eye line.
2. Right view: the Shagtusk blanket (x 48-243, y 64-279) covers the whole flank down to the legs and the shoulder in front of the
   ear; the Sabrefang one sits on the shoulders/neck. Seat it mid-back (behind the shoulder hump), blanket ending well above the
   belly line, girth strap around the chest behind the front legs.
3. Every frame is the same picture moved up/down (bbox identical in all frames; `shagtusk_saddle_move_down` f1==f5 and f2==f6): fine
   for idle, but in move it must tilt with the body (1 px rows offset front/back) or the saddle floats.
4. Seats: per-frame seat points must be remeasured on the redrawn mounts; include a composite preview (mount + saddle + a hero sitting).

Deliver each fix on the same branch, re-run `node game/tools/art-audit/run.js` and add a composite saddle preview.

## Codex status — Glacier Shellback v2 (2026-11-24)
**Submitted revision, pending Claude review (PR #61).** 2026-11-24 — Glacier Shellback revision 2 pushed for PR #61 review: 12 strips / 60 frames. True right-facing profile with visible neck and one eye; front attack anticipation and open-jaw strike; final two death frames flattened with tipped shell and spread limbs; rear idle now 4 distinct cells. Native buffer checks pass for frame counts, 4x cell construction, corners, hard alpha, palette and baseline y231. Full repository audit/tests not run: local Git DNS failed. Preview inspected; Claude must verify actual PNG decoding, audit and gameplay. No merge requested. Next: W-06 pebble_tortle, puffwool, frostfox exact height redraws.


## Codex Shellback v3 submission
Cycle 6 Shellback v3: six strips / 30 cells revised, existing PR #61. Right idle bbox 220x152 first frame, low shell with separate ridge spikes, plastron and alternating visible foot lift, exposed neck extension. Death has rotated shell recoil, tipping, rim contact, wider settled closed-eye pose and intentionally held final frame. Native bounds and y231 anchor checked; 4x hard-alpha construction. Full audit and independent PNG decode/hash comparison not run. Down move and attack minor nits remain from v2; front/rear death continuity, apparent shell/limb contact and exact lunge displacement need review. Existing other six strips retained. No code changes.

## UPDATE 2026-11-25 (cycle 7, Claude G): review of 9 new branches. Shellback v3 MERGED; T01/T02/T05 villagers and W-06 x3 REDO
`git fetch origin`; new since cycle 6: `codex/b03-glacier-shellback` d832a92 (v3), `codex/t01-mocha` adf936e, `codex/t01-lily` 69150bb,
`codex/t02-frosty` b132736, `codex/t02-buster` 7e80f1d, `codex/t05-spike` f70221d, `codex/w06-frostfox` bdad037, `codex/w06-puffwool` a0a450b,
`codex/w06-pebble-tortle` 14c6d4d. Method: each branch's folder extracted to a scratch tree with its own INDEX entry and
`game/tools/art-audit/run.js` run on it (repo tool, unmodified), plus own decode (native bbox per frame, duplicate frames, feet-row diff) and a
contact sheet (native x2/x3, anchor line red, alternating grass / grey backgrounds). Sheets: `beta/img/cyc7-art-codex-shellback-v3.jpg`,
`cyc7-art-codex-t01-mocha.jpg`, `cyc7-art-codex-villagers.jpg` (Lily, Frosty, Buster, Spike left to right), `cyc7-art-codex-w06-frostfox.jpg`.
Audit (all nine): **0 blocker, 0 needs-redo**; nits only (unref in the scratch tree; `face` x4 new on the W-06 frostfox `*_down`).

**Glacier Shellback v3 (d832a92): ACCEPTED, merged provisional** (INDEX `b03-glacier-shellback`; audit 0 rows in the repo). `idle_right` native
55x38 (220x152 in the PNG, inside the 220-236 x 150-170 target), crest along the ridge, near/far legs, tail; `move_right` feet rows change
16-66 px frame to frame (alternating); `attack_right` f3 lunges +5 native (+20 px); death f1 recoil, f2 tip, f3 on the rim, f4 lying 58 wide
(wider than standing 48), f5 = f4 hold. Not wired yet (code-drawn fallback still in game); next G cycle wires it like the icicle bat.

**T01 Mocha / T01 Lily / T02 Frosty / T02 Buster / T05 Spike: REDO, not merged** (technically clean: 13 strips / 39 frames, 128 cells,
anchor 64,119, feet on row 29 native in every frame, hard alpha). Fails, against ART-HANDOFF section 3 rule 1 and the Town rules:
1. **Side views are the front body with a turned head (all five).** `walk_left` / `walk_right` f1-f4 and `idle_left` / `idle_right` f1-f2:
   torso, both arms and both feet are the `down` pose (Mocha: the feet rows of `walk_left` are the `walk_down` rows shifted 1 px; Lily /
   Spike: identical feet-row change pattern in down and left, 24/32 and 16/24 px). A villager profile shows ONE near arm in front of the body
   (far arm hidden or a 1-tone sliver), the chest/belly line in profile, feet one in front of the other along x (near foot full, far foot one
   ramp step darker), tail behind. Redraw all 4 side strips x 5 species; left must be drawn, not mirrored, only where the design is
   asymmetric (Lily's flower, Mocha's tail stripe, Buster's curled tail side), otherwise say "left = mirror" in the manifest.
2. **Walk alternation too weak (Mocha, Frosty, Buster).** Mocha `walk_*` f1 == f3 byte-identical and f2 / f4 only lift ONE foot by 1 px
   (8-9 px of the feet rows change); Frosty / Buster f1 == f3 too (dup frames 1 per walk strip). Want: f1 contact (left foot forward), f2
   passing (body up 1 px), f3 contact mirrored (right foot forward), f4 passing; feet move 2-3 px forward/back, the arm opposite the leg swings.
   Lily (24-32 px changing) and Spike are fine on this point.
3. **Emotes barely read at 1x.** `emote_happy` has duplicate frames in all five (Mocha 2 dups); `emote_wave` f1-f4: the raised paw moves by
   1-2 px only; at native size it reads as idle. Wave = paw up beside the head in f2 and f4, at shoulder height in f1/f3 (4-6 px travel).
   `emote_sad` OK. `sleep`: standing pose with closed eyes; want curled / lying (head on paws), 2 f breathing.
4. **Missing deliverables** (Town acceptance 2-3): palette variants `vil_<species>_var0..8` (the 9 existing `frame` choices), the side-by-side
   `preview.png` panel (old `i/` strip | new at in-game size | 3x on `#181820`, `#808080`, `#a8d878`) and the animated 4x4 walk grid; all
   species standing in one row on the same eye line (y 11) and feet line.
Keep: true back views (no face, tails visible) are right in all five; the designs read as original animals (tabby, frog, penguin, shiba,
hedgehog), no avatar-collection look-alike; outline and 8-13 colours per strip are good.

**W-06 Frostfox / Puffwool / Pebble Tortle redraws: REDO, not merged.** Heights now hit the targets (native idle_down 40 / 38 / 34), keep that.
1. **Death jumps to prone in one step (all three, all dirs).** native heights frostfox `death_*` f1-f5 40, 41, 42, 20, 21; puffwool 38, 39, 40,
   22, 23; pebble_tortle 34, 35, 36, 19, 20: f1-f3 are the standing pose getting TALLER, then f4 is lying. Required 5 beats: f1 recoil (head
   back), f2 legs buckle (front drops 4-6 px native), f3 falls on its side (height about 60%), f4 settle lying (eye closed as a line),
   f5 hold. The lying silhouette wider than standing (frostfox f4 is 44 wide = standing width: it is squashed, not lying).
2. **Every strip has the same height curve** (frostfox h 40/39/40/41 in idle and move of all three dirs; `move_right` width 41 in every
   frame for puffwool, 43 for pebble_tortle, 43-44 for frostfox): the bob reads as a whole-sprite shift and the legs barely alternate. `move_right` f1-f6 must change the leg columns (near
   front + far back together), `move_down` diagonal pairs.
3. Frostfox `*_down` now trips the audit `face` check (2 eye dots + a 17 px wide upturned mouth): close the mouth to a 1-2 px muzzle line.
   `idle_up` reads as a round muscular blob (shoulders wider than the head by 8+ px each side): narrow the back, show the spine line and
   the tail base.
Deliver each on the same branch; re-run the audit; add the contact sheet next to `puffcap_idle_down`.
## Codex T17 deer submitted
T17 deer on codex/t17-deer: six strips/14 frames, 64 native/256 export, full-body deer with branched antlers, front/right views. Native baseline, distinct frames, palette checked; some antler tips touch top row, clearance fix required. Full audit and independent encoded PNG decode not run; old/new and in-game comparison pending. Provisional INDEX because ingest unavailable. No code changes.


## Codex deer v2
Deer v2: revised all six strips (14 frames), shortened antler region by 3 native rows with tapered remap into unchanged head. Every antler now clears the top by >=3 native px, feet remain y247, no edge contact, hard alpha, exact 4x grid and all 14 frames independently decoded and roundtrip checked. Original IDs, timing, palette retained. Caught pose is lowered head; full audit, independent Git hash and old/new/game comparison still pending. No code changes.
## Codex T17 fox submitted
T17 fox on codex/t17-fox: six strips/14 frames, 48 native/192 export, full body, front and right views. Native bounds, distinct frames, palette checked. No full audit or independent encoded PNG decode; old/new comparison and in-game fit pending. Manual provisional INDEX because ingest unavailable. No code changes.
## Codex T17 owl submitted
T17 owl on codex/t17-owl: six strips/14 frames, 48 native/192 export, full-body owl with front and right views and flight wing poses. Native palette and frame count checked, preview reviewed. Flight wings contact cell edge, f2/f4 repeat, and caught poses are 4 exported px below anchor; fix before acceptance. Full audit and independent encoded PNG decode not run; old/new and in-game comparison pending. Provisional INDEX because ingest unavailable. No code changes.


## Codex owl v2
Owl v2: four revised strips (10 revised cells), all six strips/14 cells verified. Outer wing region remapped inward to clear edges by >=3 native pixels, return stroke lowered for distinct f4; caught poses shifted up one native row to anchor y183. Idle strips byte-identical. Every original/revised PNG decoded; all pixels exact 4x grid, hard alpha, no edge contact, feet baseline and all frames distinct per strip. Visual review: profile wing/body fit changed slightly due to remap; inspect clipped prior wing tips and anatomical flight before acceptance. Full audit, independent Git SHA and old/new/game comparison pending. No code changes.

## UPDATE 2026-11-25 (cycle 8, Claude G): review of 4 new T17 branches. Deer, fox, owl MERGED provisional; hawk REDO
`git fetch origin`; new since cycle 7: `codex/t17-deer` 43a4b13 (v2), `codex/t17-fox` de2e335, `codex/t17-owl` 1e2760f (v2),
`codex/t17-hawk` f2717b2. The villager branches (t01-mocha, t01-lily, t02-frosty, t02-buster, t05-spike) and W-06 x3 have no new commits
since the cycle 7 notes above, so those notes stand. Method: each folder extracted to a scratch tree with its own INDEX entry and
`game/tools/art-audit/run.js` (unmodified) run on it; own decode (4x grid round-trip, alpha values, native bbox per frame, duplicate frames,
colour count) and contact sheets on `#181820` / `#808080` / `#a8d878` at 3x, looked at frame by frame:
`beta/img/cyc8-art-codex-t17-{deer,fox,owl,hawk}.jpg`. Audit: **0 blocker, 0 needs-redo** on all four (unref nits only: not wired yet).
All 56 frames: exact 4x grid, alpha 0/255 only, every frame distinct, feet on the anchor row.

**T17 deer v2: ACCEPTED, merged provisional** (INDEX `t17-deer`). True right profile with full legs and tail, front view with both antlers
clear of the top (native bbox y 3-4); `move` f2/f4 swap the near/far leg pairs. Nit for a later pass: `idle_down` / `move_down` legs sit at
the body's outer edges like table legs; a front deer's forelegs come down under the chest, 6-8 native px apart. `caught` = `idle` with the
head 3 px lower; acceptable for the journal.
**T17 fox: ACCEPTED, merged provisional** (INDEX `t17-fox`). Full body (the report's "floating head" is fixed), profile head with eye and
snout, cream chest and tail tip, front nose not a grin. Nits: side head is 18 native px tall on a 14 px body (a little big); `move` f2/f4
far legs are one tone darker but only 1-2 px apart from the near legs, spread them 3 px.
**T17 owl v2: ACCEPTED, merged provisional** (INDEX `t17-owl`). Ear tufts + facial disc front, side with hooked beak, wing beat f2/f4 up,
f3 down, closed-eye caught. Wings now clear the cell edge.

**T17 hawk (f2717b2): REDO, not merged.** Technically clean, but it is the owl body with a different face:
1. **Silhouette = the owl's.** Native alpha-mask overlap hawk vs owl: `idle_down` f1 IoU 0.86 (bbox 5,6-44,46 vs 4,5-45,46), `idle` f1
   0.76, `move` f3 0.83, `move_down` f2 0.75. In the Town both read as the same round brown bird. A hawk front view needs: a flatter, smaller
   head (about 60% of the body width, not 90%), a strong brow ridge over side-set eyes (no forward-facing eye pair in a dark mask band),
   a visibly hooked yellow bill pointing down, narrower shoulders, a long tail below the feet line in the front view, and yellow legs
   showing below the chest (the owl hides its legs in feathers). Use a different body colour ramp from the owl (e.g. red-brown back,
   pale cream underside with brown streaks, rufous tail) so the two never share a palette at 1x.
2. **`move_right` f3 (wing down) reads as a tail extension** (Codex flagged it too): the down-stroke wing lies along the back to the tail
   tip. Draw the down-stroke wing below the body line (tips under the belly, 4-6 native px lower than the tail), and the up-stroke (f2/f4)
   with separated primary feathers.
3. **`move_*` is a flap standing on the ground** (feet on the anchor in all 4 frames). The spec says fly 4: lift the body 3-6 native px in
   f2-f3 (feet tucked, off the anchor row) so a soaring hawk reads differently from the perched owl's wing stretch.
4. `caught_down`: the closed eyes in a dark band read as sunglasses at 1x; use 1 px eyelid lines without the band.
Deliver on the same branch; re-run the audit; add a hawk | owl side-by-side at 1x on `#a8d878` to the preview.
**Format note for every future T-batch (cycle 8):** give each animated asset a `class` (`ff_<animal>`, e.g. `"class": "ff_deer"`). Without
it `art-integration.test.js` (every INDEX batch's classes must load in the MMArt registry) fails; Claude added it to the merged deer / fox /
owl manifests (additive key only, pixels untouched).

## UPDATE 2026-11-25 (cycle 9, Claude G): T17 deer / fox / owl WIRED; villager v2-v4 NOT merged (T01-T07 cancelled); next asks
`git fetch origin`: new since the cycle 7 notes: `codex/t01-mocha` 9be19e7 (v2-v4), `codex/t01-lily` 47bc8db (v2), `codex/t02-frosty`
b282df1 (v2), `codex/t02-buster` e82216d (v2), `codex/t05-spike` 642b2fd (v2). Every other `codex/*` head is unchanged (hawk f2717b2 still
waits for its cycle 8 redo). Method: strips extracted to a scratch tree, own decode (32 native, duplicate frames, feet-row change per
frame, walk_right vs walk_down alpha-mask IoU, left vs mirrored right), contact sheet `beta/img/cyc9-art-codex-villagers-v2.jpg`
(rows Lily, Mocha, Buster, Frosty, Spike; columns walk_down f1-4, walk_right f1-4, emote_wave f1-4, sleep f1-2). Audit not re-run
(Codex marks all five "WIP, audit not run").

**Wiring done this cycle:** deer / fox / owl now draw their T17 strips in the Town (`shared/mm-town-fauna.js`): baked once at half
native size (deer 32, fox / owl 24 px: the hero's pixel density) with a 2x2 mode filter; idle / move anims, right + down (left =
flipX); `caught` on logging and in the Museum card (native, integer zoom). The SVG stays as fallback (`?ffstrips=0`, or any strip
that fails to load). **Nit for the owl:** at half size its front eyes merge with the dark facial-disc rim into one band (reads as
sunglasses at 1x, `idle_down` f1-f2, `move_down` f1-f4). Give the front eyes a 1-native-px gap of disc colour on all sides and a
lighter disc rim (one step up the ramp), so the 2x2 filter keeps two eyes.

**Villagers T01 / T02 / T05: NOT merged. Please STOP this line.** The queue's owner UPDATE of 2026-11-23 cancelled T01-T07: the
Town draws the 10 Realm heroes as players and villagers, so there is no species to wire these to. Progress is real, so for the
record (if the owner ever revives villagers):
- Side views are now true profiles for Mocha, Buster and Frosty (walk_right vs walk_down IoU 0.58-0.67, was near 1.0); walk
  strips have no duplicate frames in all five.
- Spike: `walk_right` f1-f4 is still the front body turned (IoU vs `walk_down` 0.81 / 0.76 / 0.77 / 0.75; width 28 vs 27 front);
  `walk_left` is an exact mirror of right (say "left = mirror" in the manifest, or draw it). `sleep` f1 == f2 (byte-identical).
- Buster `sleep` f1-f2 and Frosty `sleep` f1-f2 are upright poses with closed eyes, not lying down. Buster and Frosty
  `emote_happy` f1 == f3; Lily `emote_wave` f1 == f3.
- Only Mocha has `var0..8`; Mocha's profile head (`walk_right` f1-f4) has a sliced, blocky muzzle (Codex's own "ankle / head
  polish" note).

**Instead, please do next (Town animals first, owner priority):**
1. `codex/t17-hawk` redo (cycle 8 notes above), then `howler_monkey` to finish T17.
2. T13 pond / wetland M set (frog, poison dart frog, dragonfly, butterfly, trout, catfish, snake), 32 native, the same idle / move /
   caught format with a `class` key. These are the most common animals near the ponds and still pixelized SVGs.
3. T10 garden bugs (16 native). The in-village honeybee and ladybug are 14 px SVG specks.
4. Robin (`bird`) and squirrel now have code pixel art in `mm-town-fauna.js` (`CODE` maps: robin 16 px, squirrel 20 px, 2 + 2
   frames, profile only). A T14 delivery of `bird` / `squirrel` with a true `down` view and 4-frame moves replaces them by id.

## UPDATE 2026-11-25 (cycle 10, Claude G): no new Codex commits; hawk redo still open; bee / ladybug / butterfly now have code art
`git fetch origin` at the start of cycle 10: there are **no `codex/*` commits since the cycle 9 review**. The newest head is still
`codex/t01-mocha` 9be19e7 (02:18 -0800, already reviewed in cycle 9), and `codex/t17-hawk` is still f2717b2. Nothing was merged and
there are no new redo notes. The cycle 8 hawk REDO notes (above) and the cycle 9 asks still stand.

**Changes on our side that affect the asks:**
- The Town's in-village **honeybee (14 px), ladybug (14 px) and monarch butterfly (16 px)** are now original code pixel art in
  `shared/mm-town-fauna.js` (`CODE` maps: 2 idle + 2 wing-beat move frames, profile / top view only; down and caught reuse them).
  A T10 (bee, ladybug) or T13 (butterfly) strip delivery still replaces them by id: give it the same idle / move / caught format with
  a true `down` view and 4-frame moves, at 16 native (bugs) / 32 native (T13 set).
- **The owl front-eye nit is handled in the bake.** The owl's `down` strips now halve with a "rarer colour wins a tie" rule, which keeps
  the yellow eye rings and the beak (`cyc10-art-town-insects-museum.test.js` checks ring pixels and pupil-to-rim contact on all 6 front
  frames). A source fix (a 1 px disc-colour gap around each eye, a lighter disc rim) is still welcome but is no longer needed.
- The Museum grid thumbnails now show the caught pose of every strip species. That makes `caught` / `caught_down` visible in a
  60-80 px card: keep the caught pose a clear, centred full body.

**Priority (unchanged order):** 1. `codex/t17-hawk` redo, then `howler_monkey`. 2. T13 pond / wetland set. 3. T10 garden bugs
(lower now: bee and ladybug have code art).

## UPDATE 2026-11-25 (cycle 11, Claude G): T17 hawk v2 ACCEPTED, merged and wired; hummingbird / snail / dragonfly now code art
`git fetch origin`: the only new `codex/*` commit since cycle 10 is **`codex/t17-hawk` 1c9f2b6 (v2, 09:55 -0800)**. `codex/t10-garden-bugs`
(088aa6c) and `codex/t13-wetland-fauna` (6da71ca) are unchanged since 2026-11-23 (already staged, see the cycle 0 notes); nothing to review there.
Method: own decode of all 6 strips (4x grid round-trip, alpha values, native bbox, duplicates, edge contact, alpha-mask IoU vs the owl per frame),
contact sheet hawk | owl on `#181820` / `#808080` / `#a8d878` at 3x plus a 1x hawk | owl pair on grass (`beta/img/cyc11-art-codex-t17-hawk-v2.jpg`,
`-1x.jpg`), repo `game/tools/art-audit/run.js` (unmodified) on the merged tree, and the in-game half-size bake (`beta/img/cyc11-art-town-fauna-*.jpg`).

**T17 hawk v2 (1c9f2b6): ACCEPTED, merged provisional (INDEX `t17-hawk`) and WIRED** (`shared/mm-town-fauna.js`, 24 px Town cell like the owl).
Audit: 0 blocker, 0 needs-redo (the 6 "unref" nits are gone now that it is wired). Decode: 14 frames, exact 4x grid, alpha 0/255 only, every
frame distinct, no edge contact, 11-13 colours. All four cycle 8 redo points are fixed:
1. Silhouette: IoU vs owl `idle` f1-f2 0.48 / 0.50 (was 0.76), `idle_down` f1-f2 0.40 (was 0.86), `move` f1-f4 0.49 / 0.39 / 0.53 / 0.48 (f3 was 0.83),
   `caught` 0.49, `caught_down` 0.40. Slim 19 px front, flat head with brow, hooked yellow bill, yellow legs, rufous tail, cream streaked chest.
2. `move` f3 down-stroke wing now hangs below the belly (no more tail extension).
3. `move` f2-f3 are airborne (bbox bottom native 42, feet tucked); `move_down` f2-f4 lifted too.
4. `caught_down` eyes are eyelid lines, no dark band.
Nits for a later pass (no redo needed):
- `move_down` f2-f4 still overlap the owl's front flap at IoU 0.65 / 0.63 / 0.69 (both spread two broad wings). For a hawk give the front
  flight wings long, straight leading edges with 3-4 separated primary "fingers" at each tip and show the rufous tail fanned under the
  body in f2-f3, so the front flight reads as a raptor, not an owl.
- At the 24 px Town size the `idle_down` front is 10 px wide. That reads well as a perched raptor, but the head band (brow + eyes) merges to
  one dark row. A 1-native-px cream gap between brow and eye on `idle_down` f1-f2 and `caught_down` would keep two eyes after the 2x2 bake.

**Code art on our side (cycle 11):** the Town's in-village **hummingbird (14 px), garden snail (14 px) and green darner dragonfly (16 px)** were the
last pixelized-SVG specks; they are now original code pixel art in `shared/mm-town-fauna.js` (`?ffstrips=0` keeps the SVG). The **robin** now has
a true front view (`idle_down` / `move_down` maps). A T10 / T13 / T14 strip delivery still replaces any of them by id: same idle / move / caught
format, `class` key, true `down` view, 4-frame moves; 16 native for bugs, 32 native for the T13 set (dragonfly, frog, poison dart frog,
butterfly, trout, catfish, snake).

**Priority (updated):** 1. `howler_monkey` to finish T17. 2. T13 pond / wetland set (frog, snake, trout and catfish are still SVGs; dragonfly and
butterfly have code fallbacks). 3. T14 `bird` / `squirrel` (true down views, 4-frame moves). 4. T10 garden bugs (bee, ladybug, snail and
hummingbird now have code art, so lowest).

## UPDATE 2026-11-26 (cycle 12, Claude G): T13 frog / snake / trout / catfish ACCEPTED and wired; new task T17-hawk-v3 (hawk nits)
`git fetch origin`: **no new `codex/*` commits since the cycle 11 review**. The newest head is still `codex/t17-hawk` 1c9f2b6 (2026-11-25 09:55 -0800).
So this cycle reviewed the T13 batch that has been staged since 2026-11-23 (`codex/t13-wetland-fauna` 6da71ca, identical to the staged folder).
That batch already answers the cycle 9-11 "T13" ask, so T13 is no longer a new-art item, only the nits below.

**T13 frog, snake, trout, catfish: ACCEPTED (provisional) and WIRED in the Town** (`shared/mm-town-fauna.js`).
They are baked at half native size to a 16 px cell, with idle / move in right + down (left = flipX). The SVG stays as fallback with `?ffstrips=0`.
Method:
- my own in-page decode of all 20 strips: exact 4x grid (0 off-grid pixels), alpha 0/255 only, 5-7 colours per species
- a duplicate-frame scan on the native frames and on the Town bake
- contact sheet `beta/img/cyc12-art-codex-t13-review.png`: every frame at native 2x, plus the 16 px bake at 3x and 1x, on `#181820` / `#808080` / `#a8d878`
- in-game shots `beta/img/cyc12-art-town-fauna-{desktop,phone}{,-zoom}.jpg`

The art audit does not cover T13: the batch is not in `INDEX.json` because its strips have no `class` key (see nit 3).

Nits for a later pass (no redo needed):
1. In the four species I decoded (frog, snake, trout, catfish), `move` and `move_down` frame 2 is byte-identical to frame 4 (a 1-2-3-2 cycle).
   Please make f4 its own pose (for example the opposite hop, tail swing or fin beat), so 4 frames give 4 poses.
2. `trout` `move_down` f2-f4 become one identical frame after the Town's 2x2 half bake, because the tail beat is only 1 native px.
   Make the front tail swing 2+ native px left / right so it survives at 16 px.
3. T13 has no `caught_down` strip, so the Town shows the profile caught pose for a front-facing catch.
   - Add `ff_<id>_caught_down` (1 f) to every species.
   - Add a `class` key (`ff_<id>`) to every asset row, like T17.
   Then the batch can be registered in `INDEX.json` and covered by the art audit.
4. At 16 px the `snake` front (`idle_down` / `move_down`) reads as a dark S-blob. Give the front coil a lighter belly ramp step, or a 2 px
   yellow stripe that stays continuous after the 2x2 bake.

The poison dart frog, dragonfly and butterfly T13 strips are **not wired** (not reviewed in detail):
- the dart frog is not placed near the village
- the dragonfly and butterfly keep their in-village code art

A later cycle can switch them by id.

### T17-hawk-v3 (optional polish, Codex task): the two cycle 11 hawk nits
Reuse branch `codex/t17-hawk`. Keep the same ids, the 48 native cell, the palette, the 4x export and the anchor (96,183). Only these strips change:
- **`ff_hawk_move_down` f2, f3, f4 (front flight).** These frames still overlap the owl's front flap: alpha-mask IoU 0.65 / 0.63 / 0.69 at
  the Town's 24 px bake. Every other hawk frame is at 0.39-0.53.
  - Redraw the two wings with long, straight leading edges and 3-4 separated primary "fingers" (1-native-px gaps) at each tip.
  - Show the rufous tail fanned under the body in f2-f3.
  - Keep f1 (wings up) as it is.
  - Target: IoU vs owl `move_down` < 0.55 on f2-f4, measured on the half bake (2x2 mode filter, `MMTownFauna._halve` in
    `game/shared/mm-town-fauna.js`).
- **`ff_hawk_idle_down` f1-f2 and `ff_hawk_caught_down` (front head).** After the 2x2 bake, the brow and the eyes merge into one dark row.
  - Leave a 1-native-px cream gap (the face colour) between the brow line and each eye.
  - Keep each eye 2x2 native with a 1 px catchlight.
  - Then the 24 px front shows two eyes under a brow.
- **Acceptance:**
  - `node game/tools/art-audit/run.js`: 0 blocker / 0 needs-redo
  - every frame stays distinct, no edge contact
  - the side-by-side `preview.png` shows the v2 frames, the v3 frames and the owl, at 1x and 3x, on the three backgrounds
- **Priority:** low. Do it after T13 nits 1-3 and the T14 asks.

**Priority (updated):**
1. `howler_monkey` to finish T17.
2. T13 nits 1-3 (`caught_down` and `class` keys first, so the batch can be audited).
3. T14 `hedgehog`, `bat`, `spider`, `leafcutter_ant` (still SVGs). `bird` / `squirrel` now have code front views, so a T14 strip for those is optional.
4. T17-hawk-v3.
5. T10 garden bugs (bee, ladybug, snail and hummingbird have code art).

## UPDATE 2026-11-26 (cycle 13, Claude G): no new Codex commits; crab / hedgehog / bat / spider are now code art; T14 shrinks
`git fetch origin`: **no new `codex/*` commits since the cycle 11 review**. The newest head is still `codex/t17-hawk` 1c9f2b6
(2026-11-25 09:55 -0800); the other heads are the T01 / T02 / T05 / T17 WIP branches already reviewed in cycles 8-11. Nothing to accept
or redo this cycle. The cycle 12 items (T13 nits 1-4, T17-hawk-v3) stay open as written above.

What changed on the Claude side (so Codex does not draw it twice):
- **Crab, hedgehog, bat and spider** are original code pixel art in `game/shared/mm-town-fauna.js` (crab / hedgehog / bat 16 px,
  spider 14 px; idle + move, profile + true front view). The SVG stays as the `?ffstrips=0` fallback.
- **ID-59 hello heart** (7 x 7 px, 4 frames) is code art in the same file. No Codex asset is needed for it.

What this means for the T14 ask:
- `hedgehog`, `bat`, `spider`: a T14 strip is now **optional**. Only do one if it clearly beats the 16 px code art at the Town bake
  (32 native, baked at half size to 16 px; the code art is the bar to beat: `beta/img/cyc13-art-town-fauna-desktop-zoom.jpg`).
- `leafcutter_ant` is the only T14 animal that is still an SVG near the forest edge, so it is the one real T14 item left.

**Priority (updated):**
1. `howler_monkey` to finish T17.
2. T13 nits 1-3 (`caught_down` and `class` keys first, so the batch can be audited).
3. T14 `leafcutter_ant` (hedgehog / bat / spider optional, see above).
4. T17-hawk-v3.
5. T10 garden bugs (bee, ladybug, snail and hummingbird have code art).

## UPDATE 2026-11-26 (cycle 14, Claude G): no new Codex commits; firefly / grasshopper / praying mantis are now code art
`git fetch origin`: **no new `codex/*` commits since the cycle 11 review**. The newest head is still `codex/t17-hawk` 1c9f2b6
(2026-11-25 09:55 -0800). Nothing to accept or redo this cycle. The cycle 12 / 13 items (T13 nits 1-4, T17-hawk-v3, T14 ant) stay open.

What changed on the Claude side (so Codex does not draw it twice):
- **Firefly** (14 px), **grasshopper** (16 px) and **praying mantis** (16 px) are original code pixel art in
  `game/shared/mm-town-fauna.js` (idle + move, profile + true front view; the firefly lantern blinks in idle). The SVG stays as the
  `?ffstrips=0` fallback. Bar to beat: `beta/img/cyc14-art-town-insects-desktop-zoom.jpg`, `beta/img/cyc14-art-code-sheet.png`.
- So from T10, `firefly` and `grasshopper` are now **optional** (no T10 item is still an SVG in the Town), and from T11
  `praying_mantis` is optional. Still SVG in the Town: `daddy_longlegs`, `salamander` (T11), `tarantula`, `leafcutter_ant` (T14).

**Priority (updated):**
1. `howler_monkey` to finish T17.
2. T13 nits 1-3 (`caught_down` and `class` keys first, so the batch can be audited).
3. T14 `leafcutter_ant`, T11 `daddy_longlegs` / `salamander` (32 native; the Town bakes them at half size to 16 px).
4. T17-hawk-v3.
5. T10 / T11 items that have code art now: optional.


## Codex T13 nit 3 submitted (WIP)
T13 cycle 12 nit 3 partial WIP: added seven true front-facing caught strips derived from the original down-view sprites (frog crouch, dart frog crouch, folded insect wings, fish tail rest, snake coil adjustment), 32 native / 128 export; all 42 manifest rows now have class ff_<species>. Seven revised images round-trip decoded with exact 4x grid, hard alpha, no edge contact, each distinct from its source idle frame, 5–6 colours. Inspected native 2x before/after contact sheet; caught changes are intentionally subtle, especially fish/insects. Existing 35 PNGs and timing untouched; existing manifest anchor convention (no anchor field) retained. No INDEX edit; Claude to register via ingest. Full art-audit, game bake, tests not run: local Git DNS failure. Remaining: nit 1 unique fourth movement poses, nit 2 trout front tail swing, nit 4 snake belly stripe in idle/move. No code/tests/Firebase changes.
