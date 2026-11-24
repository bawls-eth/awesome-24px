# Cycle 4, G (Graphics + Pixel Art): notes

Branch `cyc4-art` (from `claude/animal-crossing-game-7z3roh` 385efc3), not pushed. Own server :9743 (the base commit, extracted with
`git archive`, served on :9744 for "before" shots and an A/B test rerun). Every browser / node run went through `/tmp/bt.sh`; Firebase
blocked in every context (offlineStub + `db.attempts() === 0` for Town, blockDb elsewhere). Targeted tests only.
OpenAI spend this cycle: $0.00 (LEDGER-OPENAI.md unchanged).
Screenshots: `game/tests/shots/cyc4-art-shots.js <origin> <before|after|survey> <scene...>` -> `game/design/beta/img/cyc4-art-<scene>-<tag>-<d|p>.jpg`
(d = 1280x720, p = 390x844, all <= 150 KB). Isles "before" = the change's opt-out flag on the same server; Town "before" = the base commit on :9744.

## 1. Codex branches
`git fetch origin`: no `codex/*` branch newer than `b03-glacier-shellback` (04:19 PST, REDO open) and `b03-icicle-bat` (merged in
cycle 3). Nothing to audit or merge. TEAM-BOARD.md entry posted; art-integration.test.js not touched.

## 2. Resolved, with the check that ran
| Item | Change | Verification |
|---|---|---|
| Isles tundra / jungle ground | `MMIsleArt.biomeDetail` (new, `shared/mm-isle-art.js`), run in `bakeArt` after detail / warmSand / fieldDetail (bake time only). Tundra: snow drifts (lit crest + soft blue shadow), sparkles, jagged ice cracks with a lit lip (more on thin ice), frost on rock / permafrost / road, snow patches on moss. Jungle: dark roots with a lit edge, leaf litter (4 browns / olive), moss clumps. Seams: the outer art row toward a different terrain becomes a soft mid tone (base 60 % / edge 40 %) and seeded 1-2 art px bumps of the neighbour's base colour break the straight line, replacing the dashed 32 px box. `detail()` output and the b30 PNGs are unchanged (only the page's chunk canvas is painted). `?tundradetail=0` / `?jungledetail=0`. Hook `__isles.biomeDetail()`. | `cyc4-art-isles-biome-ground` ALL PASSED: tundra 26 chunks, 613 drifts / 469 sparkles / 245 cracks / 207 frost / 1866 seam sides; **0.64-1.07 ms per chunk bake** (budget 8), **0 overlay calls in 90 rendered frames** (0 ms per frame); powder_snow and ice_sheet gain colours and change pixels; `?tundradetail=0` touches 0 tiles; pure: deterministic, sand 0 px, jungle floor gets roots / litter / moss; jungle_floor chunk pixels change only with the overlay on; meadow grass pixel-identical (not a tundra / jungle isle); 0 errors, 0 DB. Reruns: `shared-mm-isle-art` (node, 35), `isle-art-bake`, `cyc0-art-isle-detail`, `cyc2-art-isles-field` ALL PASSED. `isles-tundra-mars` 6b (mars lift-off skip < 2000 ms) failed twice at 2237 / 2817 ms under load 4-5, then PASSED on both the base and this branch in an A/B rerun: load flake (mars is not touched by the overlay). Shots `isles-tundra`, `tundra-zoom`, `isles-jungle`, `jungle-zoom` before / after. |
| Town building finish, pass 2 | `finishBakedTexture2` (main.js, once at create inside the cycle 1 finish): every pale-blue glass pane (>= 5 px each way) gets a 2-step diagonal glint top-left, a darker inner frame right / bottom and a lit sill row; pitched roofs (top rows where the silhouette widens, >= 10 rows) get shingle courses every 5 px with staggered seams every 8 px and a lit row under each course; `bldContactShadow` adds a 4 px ground shadow strip under each finished footprint at depth just below the walls. `?bldfinish2=0` = the cycle 1 finish only, `?bldfinish=0` = everything off as before. | `cyc4-art-town-finish2` ALL PASSED (8 textures, glass >= 200 px, roof >= 300 px, >= 6 shadows each under its building, total finish < 250 ms, 0 calls per frame over 1 s, shop +8 glint px and more colours than pass 1, still 0 semi-alpha px, both opt-outs, 0 errors, `db.attempts() === 0`). Reruns `cyc1-art-town-buildings`, `beta-r4-d4-town`, `cyc3-ui-town-labels` ALL PASSED. Shots `town-shops` before / after. |
| Turnip price contrast (U ask) | The green turnip SELL price over the Shop roof had no outline; it now has the buy price's `#1c2430` 3 px stroke and a lighter green `#8fe08a`. | Same test: stroke / thickness asserted, text-to-outline contrast >= 7:1. Shots `town-turnip`, `town-shops` before / after. |
| Isles creature scale (W-06) | Not code: integer 2x puts puffwool at 56 and frostfox at 60 (over the S cap 48) and mixes 2x2 art pixels with 1x creatures. Exact redraw spec written: pebble_tortle 21 -> 34, puffwool 28 -> 38, frostfox 30 -> 40 standing px at 1x (136 / 152 / 160 in the 4x PNG, top opaque rows y = 37 / 17 / 11 for the unchanged anchors), widths x1.6 / x1.35 / x1.33. | Spec in CODEX-REMAKE-QUEUE.md "UPDATE 2026-11-24 (cycle 4)". No test (no code change). |

New tests registered in `test-tiers.json` (`.test.js` keys, browser / full): `cyc4-art-isles-biome-ground`, `cyc4-art-town-finish2`.
`run-all-tiers` and `live-safety` ALL PASSED after.

## 3. Visual consistency (survey shots `cyc4-art-<scene>-survey-{d,p}.jpg`: town, hub, realm, dungeon, isles meadow; tundra / jungle in the after shots)
Three worst remaining:
1. **Hearth Isle (meadow) beach and paths**: code-drawn sand / wet sand / dirt road still show the dashed 32 px seam box and 32 px
   staircase coastline (`isles-meadow-survey-p`); the new soft-seam pass only runs on tundra / jungle terrains. Next code step: run
   the seam softening on the meadow / reef code terrains too (one `BIOME_GROUND` entry each), then the R02 PNG redo.
2. **Town labels at 390x844** (`town-survey-p`): the Professor Byte quest line and name run off the right edge and the Leaderboards
   sign is cut at the left; label positions are U's lane.
3. **Realm shore at phone zoom** (`realm-survey-p`): grass / dirt / sand meet in 32 px stair-steps; the shore reads as big flat
   blocks next to the textured Isles ground. Needs the R01b/R02 edge sets (Codex) or a Realm version of the seam bumps.
Also still open: W-06 creature scale (spec above). Dungeon (crypt) and Hub read clean.

## Not resolved (time box)
- Doors: the pass-2 finish does windows / roofs / shadows; door panels and knobs are not detected (doors share the dark wall-trim
  browns), so doors are unchanged.
- Meadow / reef seam softening (problem 1) not started.
- Icicle bat wiring (pinned tundra kinds list) and glacier shellback redo: unchanged from cycle 3.

## Codex asks
CODEX-REMAKE-QUEUE.md "UPDATE 2026-11-24 (cycle 4, Claude G)": glacier shellback redo, then the W-06 redraw (exact heights), then R05
tundra ground PNGs (the code overlay is a stopgap), jungle small set down to 36-40.
