# Cycle 1, G (Graphics + Pixel Art): notes

Branch `cyc1-art` (from `claude/animal-crossing-game-7z3roh` 86eda4b), not pushed. Own server :9713. Every browser / node run went
through `/tmp/bt.sh`; Firebase blocked in every context (blockDb, or offlineStub + an `ADMINcyc1*` bot for Town); no chat, no writes.
Full suite NOT run (targeted tests only). OpenAI spend this cycle: $0.00 (LEDGER-OPENAI.md unchanged).
Screenshot helper: `game/tests/shots/cyc1-art-shots.js <origin> <tag> <scene...>` -> `game/design/beta/img/cyc1-art-<scene>-<tag>-<d|p>.jpg`
(d = 1280x720, p = 390x844, every file <= 140 KB). Realm / Isles-hit "before" shots use the opt-out flags on the same server, which
give the exact old pixels (and wait for the late-loading R03 world art so both shots show the PNG props).

## 1. Codex branches
`git fetch origin`: no `origin/codex/*` branch newer than 2026-11-23 20:23 UTC (`codex/r09-jungle-core-master-review`, reviewed in
R4-D2 / cycle 0). Nothing to merge, INDEX.json unchanged. `tests/art-integration.test.js` NOT edited (change not approved). What that
keeps blocked: m02 angler fish and t10 / t13 Town fauna stay staged and unregistered (their strips carry no class key, which the test
counts as "missing"); M03 rimewolf stays unwired while `shared-mm-creature-strips.test.js` pins the b40c url (separate test, same rule).

## 2-3. Resolved (code-drawn original art), with the check that ran
| Id | Change | Verification |
|----|--------|--------------|
| T-BLD Town buildings flat, no outline | `bakedGfx().bake({ finish })` + `finishBakedTexture` (main.js): once at create, the shop, museum, Able Sisters, turnip stand, windmill, Polyroll booth and guestbook textures get alpha snapped to 0/255, a 1 px colour-matched outline OUTSIDE the silhouette (30% of the darkest neighbour, never black; the cycle 0 creature / icon rule), shade on the bottom 4 px and right 3 px, a lit top-left rim, and an eave shadow under the three roofs. Town 1x. 7 textures, measured create cost < 250 ms total (one-off). `?bldfinish=0` = flat. | `tests/cyc1-art-town-buildings.test.js` ALL PASSED (7 finished, >= 1500 outline px, shop 0 semi-alpha px, >= 400 dark px; `?bldfinish=0` 3x fewer dark px). Fails before: no `bldFinish`. Shots `cyc1-art-town-{before,after}-{d,p}.jpg`. |
| R03 round tree canopies (Realm prop_tree_medium / small) | Bake step in realm-world.js: the canopy rows of the two strips are re-drawn from an original clump map (4-6 overlapping leaf clumps, dark seams, top-left light, scalloped outline; the medium canopy now reaches its trunk instead of floating 4 px above it). Colours taken from the strip itself (outline / dark / mid / light leaf), trunk rows untouched, a strip of another size is left alone, cached per strip (2-7 ms once). `?treefix=0` = R03 pixels. | `tests/cyc1-art-realm-fields.test.js` ALL PASSED: solidity (area / convex hull) 0.944 -> 0.927 medium, 0.932 -> 0.915 small, edge turns 4 -> 8 / 4 -> 6, no new colours, 0 semi-alpha, trunk identical, canopy area +-15%, fixed trees drawn into chunks; `?treefix=0` identical to R03. Shot `cyc1-art-trees-cmp-d.jpg` (R03 left, fixed right, 6x). |
| Realm grass fields calm on phone | `fieldDetail` in the existing chunk detail pass: seeded flowers (3x3 plus in 5 petal colours, 10% of grass tiles, 34% on meadow, none on dark grass), pebbles (2x2 with light / dark pixel) and dark tufts; square clusters only (bullets stay the only bright round shapes), never on solid or water. Measured: 0.2-1.1 ms per chunk on average for the pass alone (worst single chunk 0.7-3.4 ms; one 16 ms outlier seen once under machine load, a GC pause), whole chunk bake 10-20 ms. `?fielddetail=0` = off. | same test: flowers / pebbles / tufts > 10 in a 7x7-chunk block, mean field cost < 8 ms per chunk, `?fielddetail=0` places nothing. `beta-w03-terrain` ALL PASSED. Shots `cyc1-art-realm-{before,after}-{d,p}.jpg`. |
| Hit feedback (Isles) | The hit flash was a white circle laid over the creature and the ground round it. Now the creature's own white silhouette (PNG strip or code frame), fading over the 0.12 s flash; white copies built once per source canvas on the first hit (WeakMap). Measured per-frame cost 0.3-0.4 ms per flashing creature including the first-hit build, one extra blit after that. `?hitflash=0` = circle. | `tests/cyc1-art-isles-hitflash.test.js` ALL PASSED (meadow PNG: silhouette, 0 circles; tundra code-drawn: silhouette; `?hitflash=0`: circle, no silhouette; cost < 1 ms). Shots `cyc1-art-isles-hit-{before,after}-{d,p}.jpg`. |

Existing tests run after the changes: `beta-w03-terrain` ALL PASSED; `r4-d2-art` 1 FAIL "first-hero pick: class sprite applied within
3 s (W-01) ms=12920" (hero class-art load timing on a loaded 4-core box; no terrain / prop check failed; not touched by this branch:
needs a solo rerun by the coordinator). `isle-creature-art` ALL PASSED. `archipelago-perf` ALL PASSED (low tier frame work median
0.8 ms p95 4.2 ms, default median 1.5 p95 4.7, 132 / 98 draw calls: per-frame Isles work unchanged within noise).

## Not resolved
- Isles creature scale (W-06): measured, not changed. In-game standing height of PNG S-class strips differs by 38%: meadow
  `bumble_mote` (S) 33 px tall / 22 px span, jungle `canopy_glider` (S, spawned as "shellback") 46 px tall / 47 px span in a 64 px
  cell. The scale hook (scales.json `display_scale`) is per asset id; picking per-kind factors needs the full table across all isles
  and a check against the hitbox / name-label tests. Next cycle: measure every kind with `__isles.stripSize`, then set display_scale.
- Idle / death polish: not started (time box).

## 4. Consistency audit (cycle 1 pass: Town, Hub, Realm shore, Isles meadow / jungle / tundra boss, 1280x720 and 390x844)
Three worst remaining, worst first:
1. **Town trees and signs are still the soft round-ball look** next to the now outlined buildings and the clumped Realm trees: the
   code-drawn Town fruit trees are a single circle canopy on a stick, and the TOP SCORES board / Realm Gate sign are flat light rectangles
   with no outline (shots `cyc1-art-town-after-*`). Fix: the same `bake({ finish })` on the board / sign (cheap, next cycle) and a
   clumped canopy for the Town tree bake (the clump-map approach used here).
2. **Isles creature scale (W-06)**: S-class strips range 33-46 px tall on screen (above); a 46 px "small" glider stands taller than
   the 48 px hero cell's figure. Fix: per-kind `display_scale` from one measured table (not done this cycle).
3. **Large calm fields on Isles (R02) and jungle black ground on phone**: Hearth Isle grass and jungle floor still read as wide single
   tones at 390x844 (`cyc1-art-isles-jungle-before-p.jpg`). Realm got the field pass this cycle; Isles has its own detail pass
   (cycle 0, `MMIsleArt.detail`) whose density could take the same flower / pebble clusters. Real fix: the R02 ground redo (Codex).
Fixed this cycle from the cycle 0 list: #5 Town buildings flat (F), #7 R03 medium tree ball (F, code overlay), hit flash circle (F).
Still open from cycle 0: #4 Town label collisions (U lane).

## Codex asks (new)
- R03 follow-up: `prop_tree_medium` / `prop_tree_small` with clumped canopies and the medium canopy touching its trunk (the code overlay
  shows the target silhouette: `cyc1-art-trees-cmp-d.jpg`); same ids / cells / anchors, then `?treefix=0` becomes the default.
- Town building set (T-BLD): shop, museum, Able Sisters, turnip stand at Town 1x with true outlines and roof texture; the code finish is a
  stopgap.
- Isles: confirm intended standing heights per size class (W-06 table) so `display_scale` can be set per kind.
