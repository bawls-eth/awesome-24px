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
