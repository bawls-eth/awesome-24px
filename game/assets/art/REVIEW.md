# Art review notes

Generated and processed: puffcap, thorn_beetle, dusk_moth (4x2 grids, 256 cells).

- puffcap: style good. Attack strike frame: the spore puff extends past the cell edge and is clipped on the right (cosmetic; regenerate or crop differently if it matters).
- thorn_beetle: good. Walk frames are near-identical (subtle leg shifts); hurt frame has a few floating green fragments.
- dusk_moth: good. Sparkle dust is thin and partly lost where it touched the magenta background; wings are large (scaled to fit).
- Note: the generator returns 1280x720, so the 4x2 grid is sliced into 320x360 cells and each frame is rescaled with one factor per sheet (not native pixel art resolution; colours quantised to 24).

Not generated (blocked): the account hit `free_tier_image_limit_reached` (daily free-plan image limit) after 3 generations. Remaining assets 4-17 (bramble archer, sprout, boss, classes, icons, loot, props, fish, bugs) need the limit to reset or the plan upgraded; the credit cap was NOT the constraint (570 of 35000 spent).

## Round 2 (OpenAI gpt-image-1.5, /v1/images/generations, medium, 1536x1024, flat magenta background)
The /v1/images/edits endpoint with reference images ignored the prompt (twice: copied the labelled reference text, then drew unrelated characters), so every asset uses /generations with a long written style block. Real cost about 0.08 per image (estimate with high prices), see LEDGER-OPENAI.md. Slicing is now content-based (row bands + column runs from the alpha projections) because the generator does not fill the canvas evenly; round 1 assets keep the equal-cell grid.

Good: bramble_archer, ranger, queen_burrowmole (6 single-frame states in reading order calm/shielded/enraged idle, calm/shielded/enraged attack), items (16 icons, names in manifest `icons`), lantern_props, trickster, grave_tender, frostcaller (second try, softer than the first but all 8 frames).
Usable with flaws: herald (soft, painterly rather than pixel; healing rings clipped in cast frames 2-3), sprout/mini_sprout (soft look, pink background halo remains on the left of the body), loot_bags (halo glow keyed to a pink/purple fringe; 7 bags), bugs (5 rows x 6 = 30 icons instead of 24; dragonfly, moth and bee wings partly cut where neighbours overlap).
Rejected / not production ready: fish_pond and fish_sea. The model did not keep to a regular 6x4 grid (rows tilted, wide fish overlap neighbouring cells) so many fish are sliced in half; the giant whiskered catfish is split between two cells. They need a regeneration with smaller fish and wider gaps, or manual slicing. Sheets are kept in sheets/ for reference but their manifest entries should not be used.
Notes: all new characters are painterly or soft-pixel (colours quantised to 24/64) rather than hard pixel art; shadows under feet were sometimes drawn and keyed partially. New raw PNGs (about 23 MB) are not committed (over the 20 MB limit).
