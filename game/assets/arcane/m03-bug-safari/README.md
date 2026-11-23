# M03 Bug Safari artwork

This art-only branch supplies 40 original PNG assets for the game's nine canonical insect species: ladybug, butterfly, beetle, cricket, antlion, goldbeetle, moonwing, firefly and glowmoth. Each species has a two-frame idle animation (4 fps), a four-frame movement animation (10 fps) and a 32×32 journal icon. Animated sprites use 32 native pixels enlarged 4× nearest-neighbor to 128 px cells, with a body-centre anchor. The game rotates the down-facing view.

UI sprites: net button, 4-frame net swing, empty jar and full jar. Nine 96×64 arena thumbnail PNGs cover Meadow, Orchard, Pond Edge, Forest, Dunes, Cliffs, Marsh, Lantern Glade, and Night Glade.

Game-to-art arena ID mappings for Claude: `pond_edge` → `pond`, `lantern_glade` → `lantern`, `night_glade` → `glade`. Keep canonical game IDs unchanged. `preview.png` gives a grid overview of silhouettes using a shared palette, whereas individual sprite files hold their proper species palettes.

The artwork is newly produced and not yet independently inspected at 390×844 game scale. Sprite bodies and animations need a visual quality check against the current project's ART-QUALITY-BAR. Keep code-rendered fallback until Claude confirms quality. No game code, Firebase, tests, or master changed.
