# Town art report (Claude, 2026-11-23, branch art-town-queue)

Why: owner feedback, "All assets in the entire game need rework. The animals in the animal crossing game [the Town] look really bad."
`ART-REMAKE-REPORT.md` (R01-R48) did not cover the Town because joining it writes to the LIVE database. This report covers it, captured
OFFLINE only. Work list: `CODEX-REMAKE-QUEUE.md`, section **TOWN batches T01-T36**.

## Method

- Files read: `game/main.js` (`SPECIES`, `RARE_SPECIES`, `VILLAGERS`, `FF_ASSETS`, `FISH_SPECIES`, `FOSSIL_TYPES`, `FLOWER_TYPES`,
  `BEACH_ITEMS`, every `generateTexture` key), `game/species-registry.json` (98 ids), `game/assets/flora-fauna/svg/*.svg` (98),
  `game/assets/flora-fauna/glb/*.glb` (3D files, not used by the Town renderer), `i/<species>-strip.png` (21 + 12 rare + props),
  `game/assets/mooncats-strip.png`.
- Contact sheets (scratchpad scripts, PIL for strips, Playwright for SVG): every villager strip frame at 3x on dark `#181820` and mid-grey
  `#808080` (`art-town/sheet-villagers.jpg`), all 98 flora/fauna SVGs at 64 px (load size) and 24 px (typical on-screen size) on both
  backgrounds (`art-town/sheet-flora-fauna.jpg`).
- Screenshots: Playwright 390x844 (touch) and 1280x800, Firebase SDK stubbed + `blockDb(ctx)` exactly as `game/tests/nav-town.test.js`,
  entered through **Play offline** as `ADMINart`; 0 database requests and 0 sockets in both runs. Join screen, town square (spawn),
  pond (250,600), forest edge (420,1110), east shore (2050,300). Night was not captured (no offline time override hook was found in the
  time box); night grade is from the code tint path, marked as such.

## Executive summary

| Grade | Meaning | Groups |
|---|---|---|
| A | keep | 0 |
| B | acceptable, polish later | 2 |
| C | remake soon | 9 |
| D | remake now | 15 |
| **total** | | **26** (rows in the tables below) |

The owner is right. The Town has no art direction: it mixes four unrelated styles on one screen.
1. **Villagers are not characters, they are 24x24 head-only busts** (punk / cool-cat / penguin / doge style avatar crops). Each `SPECIES`
   strip has 9 frames, but the 9 frames are 9 *different outfits*, not animation: there is no walk, no back view, no side view, no idle,
   no body, no legs. In town they slide around as a floating 24 px head. Punks / Phunks / Punkettes / Golden / Halloween are the same
   template recoloured; Cats / Dragon / Frog / Ninja / Pirate / Unicorn Cats are one head with a hat swap. They also follow the shape
   language of well-known avatar collections, which conflicts with the "original art only" rule (ART-HANDOFF). **D**, top priority.
2. **The 98 wildlife species are flat vector clip-art** (1-2 fills, no outline, no shading, tiny dot faces, deer and fox drawn as a
   head only, trees as lollipops) rendered from SVG at 64 px and then scaled down to 10-68 px. Next to the pixel villagers they read as a
   different game, and at 24 px most are unreadable blobs (copepod, diatom, amoeba, spider, daddy_longlegs, tarantula all look alike).
   One static frame each, no movement frames, no caught pose. **D**.
3. **Buildings and props are code rectangles** (Shop = brown box + orange triangle, Able Sisters = pink box, workbench = brown bar) with
   flat colour, no outline, no texture, no shadow. **D**.
4. **Ground is one flat green fill with scattered 3-pixel tufts**, dirt paths are flat beige bands with rounded ends, the pond is a
   flat blue ellipse with a thin bank. No tiles, no seasons in the base layer. **D**.
5. **Items, fish, fossils, flowers, shells are emoji** (🐟 🦀 🦴 🌸 🐚), so the inventory, catch toast and museum look like a chat app.
   **D**.
6. **UI is soft web UI** (rounded cream cards, HTML pill buttons with emoji) over the game, not the 8-bit frame kit; chat chips cover
   20% of the phone screen. **C**.
7. Scale mismatch everywhere: player head 24 px, Mayor NPC about 80 px, mooncats 24 px, a bee 10 px, a tree 88 px, the Shop 200 px.
   Nothing shares a pixel density (24 px strips at 1x, NPC at 3x, SVG at fractional scale).

Look at `art-town/shot-square-desktop.jpg` and `art-town/shot-pond-phone.jpg` first: they show all of the above in one frame.

## Screenshots and sheets (all under `game/design/art-town/`, each <= 300 KB, 12 files)

| File | What it shows |
|---|---|
| `sheet-villagers.jpg` | All 21 picker species + mooncats, 9 frames each, dark and grey. Frames are outfits, not animation. |
| `sheet-flora-fauna.jpg` | All 98 SVGs at 64 px and 24 px, dark and grey. |
| `shot-join-phone.jpg`, `shot-join-desktop.jpg` | Join / villager picker. 21 text tabs, then 9 head-only busts. |
| `shot-square-phone.jpg`, `shot-square-desktop.jpg` | Spawn: Shop box, Able Sisters box, workbench, notice boards, Mayor (different scale/style), emoji HUD. |
| `shot-pond-phone.jpg`, `shot-pond-desktop.jpg` | Pond, dock, mooncats strip on the bank, heron SVG, fish shadows. |
| `shot-forest-phone.jpg`, `shot-forest-desktop.jpg` | Forest edge: round code trees, rocks, a house box, villager Mocha (floating head). |
| `shot-east-phone.jpg`, `shot-east-desktop.jpg` | East shore / beach spots. |

## Grades by group

### Villagers (join picker + in-town player sprites)

| Group / ids | Grade | What looks bad (specific) | Fix |
|---|---|---|---|
| `coolcats`, `coolcats_dragons`, `coolcats_frogs`, `coolcats_ninjas`, `coolcats_pirates`, `coolcats_unicorns` | D | One blue cat head template with hat/outfit swaps; 49-80 colours per 24 px strip (noisy); only the bust; no walk/back/side; in town it floats with no feet. Dragon/Frog/Unicorn read as costumes, not species. | T01-T03 |
| `punks`, `phunks`, `punkettes`, `goldenpunks`, `halloweenpunks`, `mohawks`, `blondies`, `genius`, `zombies`, `apepunks`, `apes` | D | Human-head profile busts from one template (same jaw, same 1 px mouth), recoloured; Punks vs Phunks vs Punkettes are indistinguishable on the picker; not animals at all, in an "animal" town; side-facing heads that never turn. | T04-T06 |
| `aliens`, `alienclan` | D | Pale cyan head template, 26-50 colours, same pose; no body. | T06 |
| `pudgypenguins` | D | Round head with hats, no body/flippers, no walk; colours ok. | T02 |
| `doge` | D | Dog heads with sunglasses / hats, no body; reads as a meme avatar. | T02 |
| `mooncats` strip (pond cats, `POND_CATS`) | C | Chunky 24 px cats with a pure-blue/green palette and no outline ramp; whole body visible (better than the busts) but one static frame, saturated primaries clash with the pastel town. | T07 |
| `RARE_SPECIES` (12 strips) | D | Same bust templates recoloured (grayscale / sepia / red / blue). | T06 |
| Town residents `VILLAGERS` (mocha, frosty, buster, lily, spike) and the Mayor | D | Mocha/Frosty/... reuse picker busts; the Mayor is drawn at about 3x the player size in a different style (ape bust with cap). | T01-T06, T08 |

### Wildlife: 98 flora/fauna species (`species-registry.json`, `assets/flora-fauna/svg/`)

| Group | Grade | What looks bad | Fix |
|---|---|---|---|
| Fauna S (10-24 px: amoeba, copepod, paramecium, firefly, daddy_longlegs, barnacle, sand_dollar, grasshopper, salamander, praying_mantis, sea_urchin, shrimp, snail, honeybee, hummingbird, ladybug) | D | Thin-line vector icons; at 10-24 px the lines vanish (copepod, daddy_longlegs, mantis are 1 px hairlines); no outline so they disappear on grass; one frame. | T10-T12 |
| Fauna M (26-40 px: nudibranch, leafcutter_ant, poison_dart_frog, spider, clownfish, bat, hedgehog, butterfly, lobster, seahorse, starfish, crab, dragonfly, frog, bird, squirrel, jellyfish, trout, giant_clam, snake, catfish, scorpion, tarantula) | D | Flat 1-2 tone shapes, dot eyes, generic side pose; frog / poison_dart_frog / crab look like smiley stickers; spider and tarantula identical; no shading or rim. | T13-T16 |
| Fauna L (44-68 px: owl, toucan, octopus, hawk, heron, otter, fox, howler_monkey, beaver, sea_turtle, deer, shark, snowy_owl, arctic_fox, caribou, mountain_goat, roadrunner, desert_tortoise) | D | Fox and deer are floating heads with no body; otter / beaver / howler_monkey / hedgehog share one brown bean body; heron and hawk off-model (heron neck 1 shape); no legs animation. | T17-T19 |
| Flora trees (oak_tree, maple_tree, pine_tree, joshua_tree, cactus) and the code trees `tree_0..n`, `tree_fruit` | C | Code trees are actually the best thing on screen (round canopy with 2 tones and a shadow) but have no outline and no seasons; SVG oak/maple are lollipops; pine is one triangle. | T20 |
| Flora small (flower, sunflower, lavender, bluebell, dandelion, clover, grass, fern, bracken_fern, maidenhair_fern, moss, sphagnum_moss, lichen, mushroom, puffball_mushroom, bracket_fungus, slime_mold, shrub, sagebrush, blackberry_vine, liana_vine, poison_ivy, wisteria, orchid) | C | Clean but flat vector; stems are 1 px at scale; ferns, grass, kelp, eelgrass, turtle_grass are near-identical green strokes. | T21-T22 |
| Aquatic flora (water_lily, duckweed, cattail, kelp, coral, fire_coral, sea_fan, sea_anemone, red_algae, eelgrass, turtle_grass, diatom) | C | Same as above; coral/sea_fan/red_algae differ only by colour. | T22 |
| `game/assets/flora-fauna/glb/*.glb` | B | 3D models, not used by the 2D Town; leave as is (reference only). | none |
| Pixel tulips / rocks strips (`tulips`, `rocks`, `punkrocks`) | B | Pixel tulips and rocks are the closest thing to a consistent 8-bit style in the Town; rocks lack a rim on grass. | T21 polish |

### World, props, UI, items

| Group | Grade | What looks bad | Fix |
|---|---|---|---|
| Ground (code green fill + tufts), paths, plaza | D | Flat single green, random 3 px tufts, beige path bands with no edge; no seasons in the ground. | T23-T24 |
| Water / pond / shore / beach (`wave_crest`, `foam_dash`, pond ellipse, dock) | C | Pond is a flat blue ellipse; dock is a good wood texture but a different density; no shore tiles, no animated water tile. | T25 |
| Buildings (Shop, Able Sisters, Museum, player houses `homePlot`, Realm gate `realmgate`, `bugoffSign`) | D | Rectangles + triangle roof, flat fills, 2 tiny windows; no door detail, no outline, no shadow; Able Sisters is a plain pink box. | T26-T27 |
| Furniture / props (`workbench`, `mailbox`, `homeTank`, notice boards, Postcards board, Hole, `weed`, benches, lamps) | C | Workbench is a brown bar on legs; Hole is a black ellipse; boards are OK but text-only; mixed densities. | T28-T29 |
| Seasons (spring/summer/autumn/winter tint) | C | Season and night are full-screen colour tints over the same art (graded from code, night not captured); no seasonal tiles. | T23, T20 |
| Fishing / bug catching (pond fish shadows, `FISH_SPECIES` icons, bug sprites, rod, net) | D | Fish and catches are emoji (🐟 🦐 🐡 🦑 🦈); bugs are tiny SVGs; no rod / net / bobber art; catch toast is text. | T30-T31 |
| Items / inventory / museum / fossils (`FOSSIL_TYPES`, `BEACH_ITEMS`, `FLOWER_TYPES`, HUD resource bar) | D | All emoji; mixes Apple/Google emoji style with pixel art; fossils are 🦴 🥚. | T32-T33 |
| UI (join card, side panel, chat chips, emote bar, HUD bar, buttons) | C | Rounded cream web cards; emoji glyphs; pill buttons; no 8-bit frame; chat chips occupy the lower 25% of the phone. | T34-T35 |
| NPCs (Mayor, shopkeeper, Able Sisters, Mystery Merchant, museum owner) | D | Mayor is a scaled-up avatar bust; others are text labels on buildings. | T08 (and R42) |
| Emotes (`EMOTES` emoji) | C | Emoji bubbles; fine for now, replace with pixel emote icons in T34. | T34 |

## What "good" looks like for the Town

The owner concept sheet `concepts/gpt-mounts-concept-1.png` sets the richness: bold silhouettes, 4-5 tone ramps, a colour accent per
creature, a dark colour-matched outline, top-left light, and a small in-game version that still reads. For the Town that means one
cosy 8-bit style (think chunky 16-bit farm-life sprites, original designs only): every villager a full-body animal character in one cell
size with real walk cycles, every animal at an integer pixel scale with a shared outline, ground as tiles with seasonal variants, and
pixel icons instead of emoji. One pixel density on screen: native art drawn at 2x (phone) / 3x (desktop) integer zoom.
