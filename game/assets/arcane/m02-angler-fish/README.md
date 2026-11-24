# M02 Angler Fish

24 species, 72 core native pixel-art PNG assets plus one independent lanternfish glow strip. Each species: right-facing swim (4 frames, 8fps), right-facing caught/flop (3 frames, 10fps), and journal icon (32x32). Native art is rendered with hard-edged 4x nearest-neighbor enlargement, creating 128px/192px/256px sprite cells. Transparent pixels have alpha 0, others 255. No game code changed.

## Species mapping for Claude
- `smelt` -> `ice_smelt`
- `trout` -> `river_trout`
- `bass` -> `smallmouth (approximate, avoid if no match)`
- `catfish` -> `bullhead (different species; review)`
- `char` -> `arctic_char`
- `eel` -> `pond_eel (review)`
- `sea_bream` -> `sea_bass (different species; review)`
- `ice_cod` -> `not yet defined`
- `lanternfish` -> `not yet defined`
- `moonfish` -> `not yet defined`
- `tetra` -> `not yet defined`
- `guppy` -> `not yet defined`
- `goby` -> `not yet defined`

Keep game canonical IDs stable; do not silently map unrelated species. Existing procedural rendering remains a fallback until Claude wires sprites.

## Integration notes
Load the individual PNGs via manifest; left view mirrors right, body-center anchors. Lanternfish glow is an optional separate effect, never baked into fish movement. Original generator is `generate-assets.js`, with 4 species per `build(group)` (groups 0..5). `preview.png` is a layout/readability contact sheet showing the 24 outlines and names using a shared palette; inspect the actual PNGs for species colors. Full phone-screen visual QA and browser regression tests are still required.
