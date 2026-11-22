# Codex minigame art asks: batches m01-m08 (Claude, 2026-11-22)

Why: the phone screenshots in `ART-AUDIT-3.md` show the minigames run almost without sprite art. Angler draws a code pond and a stick
angler, Jam is a text menu with code lanes, Stalk shows one turnip glyph, Bug Safari is a grid of text cards, Deepdelve is code voxels,
and the two new games on branch `mg-new-games` (Pixel Pop `game/games/pop/`, Lantern Dash `game/games/dash/`) draw flat colours.
Every game already has a procedural fallback, so each batch can land on its own and Claude wires it by id. A missing id keeps the code look.

## Rules for every m-batch (same as ART-HANDOFF.md)

- Original art only, no references to existing games' sprites. Transparent PNG (RGBA, alpha 0 or 255, no soft edges), nearest-neighbour only.
- Folder `game/assets/arcane/mNN-<label>/` with `manifest.json`, `palette.json`, `preview.png` (labels under the right cell), `validation-report.json`,
  `README.md`, `CODEX-TO-CLAUDE.md`. Branch `codex/mNN-<label>`. Claude registers it in INDEX.json as provisional.
- Two kinds of file:
  - Animated sprites (fish, bugs, mobs, crowd, runner): one horizontal strip per action (x direction where listed), 4x upscaled like b31-b40.
    Cell = 4 x native: S32 -> 128, S48 -> 192, M64 -> 256. Manifest fields: `id, path, category, frames, frame_w, frame_h, fps, loop, anchor{x,y}`.
    Anchor = feet / belly centre for walkers, body centre for swimmers and fliers (say which in `anchor_kind`).
  - Icons, tiles and UI: native 1x (16 / 24 / 32 px as listed), one PNG per id, `frames: 1`, anchor centre. Tiles are opaque and seamless.
- Palette: one `palette.json` per batch, at most 32 colours per batch plus 8 accent colours per species. Use the dark navy outline (`#1b2140`-ish)
  the tundra and reef sets use. Pixel-art budget: under 48 distinct colours per PNG (`node game/tools/art-audit/run.js` flags more).
- True views: side means a real profile (one eye), back means no face. Effects (splash, sparkle, pop burst, note burst) are separate strips, never baked in.
- Acceptance (Claude runs these on intake): `node game/tools/art-audit/run.js` has 0 blockers and 0 needs-redo for the batch; dims = frames x cell;
  every manifest id exists; preview reviewed at 1x and 3x; screenshot in the game page at 390x844 reads at phone size.

## Priority order

m02 Angler fish > m03 Bug Safari > m07 new games (Pop + Dash) > m08 result UI kit > m01 Jam > m04 Stalk > m05 Deepdelve > m06 Angler spots.
(Fish and bugs are the collection core: the Hub Collections page counts them.)

## m01 Campfire Jam stage (label `jam-stage`)

| id | size | frames | notes |
|---|---|---|---|
| `jam_stage_bg` | 390x220 native, 1x | 1 | Night campfire clearing, a log stage centre, opaque. Lower 60 px darker for the lanes to sit over. |
| `jam_campfire` | S32 strip (128 cell) | 6, 8 fps, loop | Separate from the bg so it can flicker. |
| `jam_inst_lute`, `jam_inst_drum`, `jam_inst_flute`, `jam_inst_bell` | 32x32 1x | 1 | Song / lane instrument icons. |
| `jam_lane_note_{1..4}` | 24x24 1x | 1 | One note glyph per lane, distinct SHAPE per lane (circle, diamond, triangle, square) plus colour, for colour-blind play. |
| `jam_lane_hold_{1..4}` | 24x8 1x | 1 | Tileable vertical hold tail per lane. |
| `jam_hit_perfect`, `jam_hit_good`, `jam_hit_miss` | 32x16 1x | 1 | Word badges (Perfect / Good / Miss) in pixel type. |
| `jam_fx_note_burst` | S32 strip | 5, 12 fps, once | Effect, separate. |
| `jam_crowd_{fox,frog,owl,bunny}_cheer` | S32 strip (128 cell), down view | 4, 6 fps, loop | Small crowd critters sitting, cheering. Plus `_idle` 4 frames each. |

Wiring (Claude): `game/games/jam/` draws the bg and notes by id over the current lane code; crowd critters join after a Good streak.

## m02 Angler fish set (label `angler-fish`)

24 species, side view (right; left is mirrored), body-centre anchor. Sizes by class: small 32 native (128 cell), medium 48 (192), large 64 (256).
Per species: `fish_<id>_swim_right` 4 frames 8 fps loop, `fish_<id>_flop_right` 3 frames 10 fps loop (on the line / caught), and a 32x32 1x
journal icon `fish_<id>_icon`. That is 3 files x 24 = 72 files.
Species (id - class): minnow S, perch S, sunfish S, bluegill S, smelt S, goby S, tetra S, guppy S; trout M, bass M, carp M, catfish M,
pike M, char M, mackerel M, sea_bream M; salmon L, sturgeon L, eel L (long, use a 64 wide x 32 tall body in the 256 cell), koi L,
ice_cod L, lanternfish M (glows: put the glow on a separate `fish_lanternfish_glow` strip), mangrove_snapper M, moonfish L.
Check the ids against `game/games/angler/` species table on intake; Claude will alias if one name differs. Palette: natural tones, each species
readable by silhouette alone (fins, mouth shape), not only by colour.

## m03 Bug Safari bugs + net / jar UI (label `bug-safari`)

One sprite per species, top-down (down view only; the game turns them by rotation), S32 native (128 cell), body-centre anchor:
`bug_<id>_idle` 2 frames 4 fps, `bug_<id>_move` 4 frames 10 fps (wings / legs), plus `bug_<id>_icon` 32x32 1x for the journal.
Species: take every id in `game/games/festival/bugs.js` (Claude lists them in the intake reply if any are missing); start with the Meadow and
Orchard arenas' bugs so the first two arenas are complete. UI: `ui_bug_net` 32x32 (cursor / button), `ui_bug_net_swing` S32 strip 4 frames 12 fps,
`ui_bug_jar_empty`, `ui_bug_jar_full` 32x32, and 9 arena thumbnails `bug_arena_<meadow|orchard|pond_edge|forest|dunes|cliffs|marsh|lantern_glade|night_glade>`
96x64 1x opaque (replaces the text cards' blank area; locked state is done in code with a dim + lock glyph).

## m04 Stalk Market (label `stalk-market`)

| id | size | notes |
|---|---|---|
| `stalk_turnip`, `stalk_turnip_spoiled` | 32x32 1x | Fresh and rotten. |
| `stalk_turnip_bundle_{1,10,100}` | 32x32 1x | Stack sizes for buy 1 / buy 10 / owned count. |
| `stalk_stall` | 160x96 1x | Market stall with awning, transparent bg. |
| `stalk_seller_idle` | S48 strip (192 cell), down view, 4 frames 6 fps | Original seller character (not a boar-lady likeness). |
| `stalk_mood_{rising,falling,spike,flat,unknown}` | 16x16 1x | Price-mood icons beside the graph, distinct shapes (arrow up, arrow down, star burst, dash, question). |
| `stalk_bell_coin` | 16x16 1x | Bells currency glyph. |

## m05 Deepdelve (label `deepdelve-ores`)

- Block faces 16x16 1x, opaque, seamless: `dd_tile_{dirt,stone,deepstone,gravel,sand,ice,crystal_wall,lava_rock,wood,leaves}` plus 4 crack
  overlays `dd_crack_{1..4}` (transparent).
- Ore / gem faces 16x16: `dd_ore_{copper,iron,silver,gold,azurite,ruby,emerald,glowshard}`; matching item icons `dd_item_<same>` 16x16.
- Mobs (S48 strips, 192 cell, down / up / right, idle 4 + move 6 + attack 5 + death 5): `dd_mob_cave_slug`, `dd_mob_rock_mite`, `dd_mob_glow_bat` (flier).
- Pickaxe tiers 32x32 1x: `dd_pick_{wood,stone,copper,iron,gold,crystal}` and a `dd_torch` 16x16.
Note: Deepdelve renders a 3D-ish voxel view. Claude will texture faces from these tiles (nearest, no mipmaps), so keep them readable at 16 px.

## m06 Angler spots (label `angler-spots`)

Backdrops 390x260 1x opaque, one per spot: `angler_spot_{west_pond,east_pond,river_run,sea_pier,ice_hole,mangrove}`, each in day and night
(`_day`, `_night`) = 12 files. Water area kept in the lower 55% so the code bobber / ripples sit on it. Plus `angler_bobber` 8x12, `angler_splash` S32
strip 5 frames 12 fps once (effect), and a seated angler `angler_hero_cast` S48 strip, right view, 6 frames 10 fps.

## m07 the two new games (label `pop-dash`) - Pixel Pop and Lantern Dash (branch `mg-new-games`)

Pixel Pop (`game/games/pop/pop.js`, 11 tile levels, merge chains, Big pop):
- `pop_tile_{1..11}` 32x32 1x, each level a distinct glyph AND colour (seed, sprout, leaf, flower, fruit, star, moon, sun, crown, gem, rainbow
  or similar, your call), readable at 32 px with the level number drawn by code on top (leave the bottom-right 10x8 quiet).
- `pop_fx_pop` S32 strip 5 frames 14 fps once, `pop_fx_chain` S32 strip 6 frames 12 fps once, `pop_board_frame` 9-slice 48x48 (16 px corners).
Lantern Dash (`game/games/dash/dash.js`, a one-button night runner with rocks, gaps, fireflies):
- `dash_runner_run_right` S32 strip 6 frames 12 fps, `dash_runner_jump_right` 3 frames (up, apex, down), `dash_runner_fall_right` 3 frames.
  The runner carries a lantern (lantern glow is a SEPARATE strip `dash_lantern_glow` 4 frames, additive in code).
- `dash_rock_small` 24x24, `dash_rock_big` 32x32, `dash_firefly` S32 strip 4 frames 8 fps, `dash_ground` 32x32 seamless tile with a top edge,
  `dash_gap_edge_l` / `_r` 16x32, parallax `dash_bg_far` and `dash_bg_near` 390x200 seamless horizontally, `dash_flag_best` 16x24.

## m08 shared minigame result UI kit (label `minigame-ui`)

- Medals 32x32 1x: `medal_bronze`, `medal_silver`, `medal_gold`, `medal_star` (perfect), and `medal_locked` (grey outline).
- Trophy icons 32x32 1x, one per game for the Hub: `trophy_{angler,jam,bugs,stalk,deepdelve,pop,dash,isles}`.
- `ui_star_full`, `ui_star_empty` 16x16; `ui_new_best` 48x16 ribbon; `ui_result_panel` 9-slice 48x48; `ui_confetti` S32 strip 6 frames 12 fps once (effect).
Wiring: one shared loader (by id, procedural fallback) used by every result screen; the Hub medals page shows the 32 px medals.

## How Claude wires each batch

1. Intake: merge `codex/mNN-*`, register provisional in INDEX.json, run `node game/tools/art-audit/run.js`, read preview + in-game screenshot.
2. Wire by id: each game gets a small id -> image map loaded once (the MMCreatureStrips / MMArt pattern), drawn with smoothing off. Anything
   that fails to load leaves the current code drawing. No save-format change.
3. Test: a node test checks the code's id table against the manifest (ids, frames, sizes), and the game's page test asserts 0 PNG 404s.
4. Review reply on TEAM-BOARD.md with exact ids for any redo.
