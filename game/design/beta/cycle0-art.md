# Cycle 0, G (Graphics + Pixel Art): notes

Branch `cyc0-art` (from `r4-integ2` f44bf65), not pushed. Own server :9703 (this branch) and :9704 (a `git archive` of r4-integ2 for the
BEFORE shots of the bosses). Every browser / node run went through `/tmp/bt.sh`; Firebase blocked in every context (blockDb, or
offlineStub + `ADMINcyc0art` for the Town audit shot); no chat, no writes. Full suite NOT run (owner paused full runs); targeted tests only.
Screenshot helper: `game/tests/shots/cyc0-art-shots.js <origin> <tag> <scene...>` -> `game/design/beta/img/cyc0-art-<scene>-<tag>-<d|p>.jpg`
(d = 1280x720, p = 390x844, every file < 75 KB). No OpenAI spend this cycle ($0.00).

## Resolved (code-drawn original art), with the check that ran
| Id | Change | Verification |
|----|--------|--------------|
| b12-r2-11 emoji hub icons | New `shared/mm-pixel-icons.js` (MMPixelIcons): 13 original 16x16 letter-map icons (town house, realm sword, isles palm, lantern, pop tiles, dash candle, stack tower, echo tulip, jam guitar, angler fish, bugs butterfly, stalk turnip, deepdelve pickaxe) in one PICO-8-family palette (same family as mm-8bit / M08), top-left light, and a code-added colour-matched dark outline (8-neighbour, 28% of the darkest neighbour colour, never pure black). Hub home cards at 2x (32 css px, integer scale, `image-rendering: pixelated`), the Next line, the map games strip and the Continue card at 1x. The emoji stays as hidden fallback text (`.px-fb`), `?pxicons=0` = emoji. | `tests/cyc0-art-hub-icons.test.js` ALL PASSED (desktop + phone: 13 cards with their own icon at 32x32, strip + Next icons, icon pixels 1-bit alpha, 3+ colours, outline share, 13 distinct; `?pxicons=0` path). Fails before: no `MMPixelIcons`, no canvases. Shots `cyc0-art-hub-{before,after}-{d,p}.jpg`. `hub-home.test.js`: 2 FAIL "footer keeps Town / Daily gift / Open" on BOTH this branch and the r4-integ2 archive (pre-existing, not from this change; U / L lane). |
| b12-r2-09 jungle black-sand void block | `MMIsleArt.warmSand` (overlay pass): after the Isles page bakes a chunk, every `black_sand` tile is re-lit into a warm volcanic ramp (#3b3029 .. #83725f) by each pixel's brightness, so the b30 grain pattern survives, plus seeded light/dark grains per art pixel. The b30 PNGs and `isle-art-bake` (exact b30 pixels through MMChunkBake) are untouched. Bake time only: 0-1 ms per 512 px chunk measured. `?warmsand=0` = old pixels. | `tests/cyc0-art-black-sand.test.js` ALL PASSED (default: warm, red > blue + 12, mean > 60; `?warmsand=0`: blue >= red, mean < 60). `isle-art-bake.test.js` ALL PASSED (not weakened). Shots `cyc0-art-isles-sand-{before,after}-*`. |
| b06-r2-01/02/03 tundra / mars species + Frost Dragon / Red Titan fallback look | `MMCreatureDraw` bake: (1) pixel finish on real canvases: alpha snapped to 0/255 (no soft vector fringe) and a 1-art-px outline in the palette's line colour, so every code creature (all tundra / mars species waiting on Codex) gets the outline the PNG creatures have; (2) per-id `EXTRAS` drawn behind / in front of the archetype body: Frost Dragon bat wings (4 different flap poses), spiked tail, snout, swept horns, frost crest, belly scales, cold eyes; Red Titan basalt spines, rock shoulder plates, curled horns, pulsing lava seams, glowing eyes. Palette colours only; bake once per creature (17-28 ms for XL/L at dpr 2, measured), nothing per frame. `?pxfinish=0` on the Isles = soft vector bake. | `tests/cyc0-art-creature-finish.test.js` ALL PASSED (0 semi-alpha px vs 444-2125 raw, >= 90% of the silhouette edge is the line colour, dragon >= 25% more body than the plain giant, titan >= 8%, 4 distinct flap frames, bake <= 250 ms). `shared-mm-creature-draw` (67 checks), `isles-tundra-mars`, `isle-creature-art`, `isles-boss`, `isles-boss-depth`, `archipelago-perf` ALL PASSED. Shots `cyc0-art-boss-{tundra,mars}-{before,after}-*`. |
| b06-r2-06 Isles flat start terrain (partial) | On an art bake (Hearth Isle b35, jungle b30) the tiles without a PNG (grass, sand, water, flowers) were plain palette fields. They now get the same `MMIsleArt.detail` pass the code bake has (seeded detail pixels, stepped dithered edges), with the PNG terrains removed from the palette so their pixels and the b35 edge masks are never painted over. 1.5-8 ms per chunk measured (bake only). `?tdetail=0` = flat. | `tests/cyc0-art-isle-detail.test.js` ALL PASSED (grass / sand gain colours; b35 garden_path and b30 jungle_floor tiles hash-identical with and without). `isle-meadow-art`, `isle-reef-art`, `isles-biomes` ALL PASSED. Shots `cyc0-art-isles-meadow-{before,after}-*`, `cyc0-art-isles-jungle-after-*`. Honest read: edges are much better; large grass interiors are still calm at phone zoom. The real fix is the R02 ground redo (Codex). |

## Consistency audit (cycle 0 pass, from the shots above plus the r4-d2 set)
Worst first; F = fixed this cycle.
1. F: Code-drawn Isles creatures had no outline and soft anti-aliased edges next to outlined PNG creatures (b31a/b32/R07) in the same view.
2. F: Hub mixed OS emoji (different on every device, no outline) with the 8-bit pixel UI.
3. F (overlay): jungle black sand a blue-black void next to warm sand; F (partial): flat grass / sand fields on art bakes.
4. Town: world labels still mix emoji glyphs with pixel text and collide (Professor Byte quest line over the Founder's Statue label, "Shop" / "+50% today", "117 / 10" over "Turnips"). b12-r2-07, owner D4 / U (main.js label layout); not touched here to stay out of the UI lane.
5. Town buildings (pink house, Able Sisters, turnip stand) are flat fills without an outline, next to outlined trees / statue / workbench: needs a building set (Codex ask below).
6. Pixel density: Realm (32 px tiles at 1x), Isles (32 px at 1x, creatures 1/4 of 4x cells), Town (hero 24 px, 1x) agree now; the Hub icons are 16 px at 2x (= the 8-bit UI grid). Hub logo and pips already on that grid.
7. R03 `prop_tree_medium` is still a round ball on a stick at 1x (known nit from the R03 review); left for Codex rather than editing the PNG in code.
8. Phone dungeon letterbox (b12-r2-15): this is a camera / portrait zoom change in realm.js (PLAYTEST-REVIEW-4 #26: "portrait zoom plus a follow camera"), not art. Not started; L / U lane.

## Not resolved, and why
- b12-r2-07 Town label collisions and b12-r2-15 phone dungeon band: UI / camera layout in shared files owned by U / L this cycle.
- Medium tree roundness: the R03 PNG; a Codex redraw, not a code overlay.
- New Codex branches: `git fetch origin` shows none newer than the 2026-11-24 R4-D2 review (latest `codex/r09-jungle-core-master-review`, 2026-11-23 20:23 UTC, already reviewed). Nothing merged, INDEX.json unchanged.

## Draw cost
All four changes run at bake time only (chunk bake or creature bake, cached). Per-frame render untouched: `archipelago-perf` after the
changes: frame work median 0.5-0.6 ms, p95 1.7-2.4 ms, 92-107 draw calls (same as before within noise).
