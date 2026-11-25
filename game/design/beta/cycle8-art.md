# Cycle 8: G Graphics + Pixel Art (branch `cyc8-art`, port 9803)

## What changed
1. **Glacier Shellback v3 wired** (Codex b03, merged provisional in cycle 7). `MMCreatureStrips.SPECS.glacier_shellback`: M 256 px cells,
   feet 128,231, the 12 core strips, death at 8 fps (per its manifest), biome tundra. The tundra isle now preloads it with pengling /
   frostfox / rimewolf / icicle bat. It has no sleep / eat strips, so a knocked-out or eating shellback shows its idle strip
   (`actionFor` fallback). A strip that fails to load, or `?art=0`, draws the code-drawn MMCreatureDraw bake as before. The pinned
   creature-list test was edited additively (standing owner decision): 404 -> 416 strips, tundra 4 -> 5, and a new b03-shellback check.
   The bat check now pins the first four tundra kinds; the new check pins all five. `art-audit-tool.test.js` gets an additive check.
   INDEX note updated.
2. **Codex review: 4 new branches since cycle 7** (`codex/t17-deer` 43a4b13 v2, `codex/t17-fox` de2e335, `codex/t17-owl` 1e2760f v2,
   `codex/t17-hawk` f2717b2). The villager branches (Mocha / Lily / Frosty / Buster / Spike) and W-06 x3 have no new commits, so the
   cycle 7 notes stand.
   - **Deer v2, fox and owl v2: ACCEPTED, merged provisional** (INDEX `t17-deer`, `t17-fox`, `t17-owl`). They are not wired yet: the
     Town still draws the SVGs.
   - **Hawk: REDO, not merged.** Its front view is the owl's silhouette (native alpha-mask IoU 0.86 on `idle_down` f1). In `move_right`
     f3 the down-stroke wing reads as a tail extension, and its flight frames never leave the ground. `caught_down` has a dark eye band.
     Frame-numbered notes are in `CODEX-REMAKE-QUEUE.md` (cycle 8 UPDATE), with a board entry in `TEAM-BOARD.md`.
   - Merge conflicts (INDEX.json, queue, board, handoff) were resolved keeping both sides. INDEX is HEAD plus one new entry, so the stale
     bat note from the branch base is not reintroduced.
   - **Manifest fix (additive):** the T17 manifests had no `class` key, so `art-integration.test.js` failed after the merge (it reported
     `missing: [null]` for each T17 batch). I added `"class": "ff_<animal>"` to each asset (pixels untouched), and added a format note
     to the queue asking that future T-batches include it.
3. **Town dirt road + plaza** (ART-TOWN-REPORT "Ground ... paths, plaza: D, beige path bands with no edge"). `drawPathDetail` (main.js)
   draws into the same baked path Graphics, so the road is still ONE image and costs nothing per frame. It adds:
   - long wandering wheel ruts on both roads (a dark groove with a lit lip, short seeded breaks);
   - a darker 2 px edge lip, with 3-blade grass tufts leaning in from the verge;
   - seeded pebbles, each with a 1 px catch light;
   - a cobble ring (joint circles plus 48 radial joints) and an inner ring round the plaza.

   The palette is the road's own ramp. `?townpath=0` gives the old flat road.

## Checks actually run (real results)
- `node game/tests/shared-mm-creature-strips.test.js`: before the code change **7 FAIL** with the new pins; after, **ALL PASSED**.
- `cyc8-art-glacier-shellback.test.js` (new, browser): run against the pre-change `mm-creature-strips.js` it gave **2 FAIL** (strips not
  preloaded, src code). After the change, **ALL PASSED** (src png, `glacier_shellback_*` ids; `?art=0` -> code; 0 errors; blockDb attempts 0).
- `art-audit-tool.test.js`: **ALL PASSED**. With the pre-merge INDEX the new T17 check gave **1 FAIL**; after the merge it passed.
- `art-integration.test.js`: after the T17 merge **1 FAIL** (missing class); after the additive `class` key, **ALL PASSED**.
- `shared-mm-creatures`, `shared-mm-biomes`, `art-mini-art`, `cyc7-art-icicle-bat`, `isle-creature-art`: **ALL PASSED**.
- Codex review method:
  - `game/tools/art-audit/run.js` (unmodified copy) on a scratch tree with the 4 T17 folders: **0 blocker, 0 needs-redo**, 24 nits (all
    `unref`).
  - Own decode of all 56 frames: 4x-grid round trip exact, alpha 0/255 only, every frame distinct, native bbox per frame.
  - Contact sheets at 3x on `#181820`, `#808080` and `#a8d878`, looked at frame by frame, plus 3x zooms of the deer and fox faces.
  - After the merge, the repo audit has 0 non-nit rows for t17 (its 2 needs-redo rows are the old b12r props).
- `cyc8-art-town-path.test.js` (new, browser): against HEAD main.js **6 FAIL**; after, **ALL PASSED** (ruts/lips/tufts/pebbles/48 joints,
  one baked Image, road band >= 8 colours vs <= 3 off, plaza >= 7 vs <= 3, same footprint, `?townpath=0` flat, never per frame, 0 errors,
  offlineStub `db.attempts() === 0`).
- `town-perf` (34 fps avg under load, 0 long frames/s), `nav-town`, `cyc1-art-town-buildings`, `cyc4-art-town-finish2`: **ALL PASSED**.
- `run-all-tiers.test.js`: **ALL PASSED** after giving the new town test the literal `db.attempts() === 0` assert (its first run flagged
  the missing literal). `live-safety.test.js`: **ALL PASSED**.
- Full stamp **NOT run** (that is the coordinator's job).

## Screenshots
- `img/cyc8-art-glacier-shellback-{d,p}.jpg` (1280x720 / 390x844): three shellbacks drawn from PNG strips (front + side) and a rimewolf.
- `img/cyc8-art-codex-t17-{deer,fox,owl,hawk}.jpg`: contact sheets.
- `img/cyc8-art-town-path-after-{d,p}.jpg`: 1280x720 / 390x844.
- `img/cyc8-art-town-path-compare.jpg`: old | new plaza at 1280x720.
- 195x422 was captured but not kept: at that size the HUD covers the road, so the change is not layout-relevant there.

## Unresolved
- T17 deer / fox / owl are merged but not wired into the Town. Wiring needs the `ff_<id>` texture switch, with the SVG as fallback.
- Hawk is waiting on a Codex redraw. Villagers T01/T02/T05 and W-06 x3 are still waiting from cycle 7.
- Deer front-view legs sit at the body's edges (nit in the queue). The fox side head is slightly large (nit).
- The Town ground (the grass itself) is still a flat green with tufts; only the road and plaza were done this cycle.

## Proposals
- Next G cycle: wire T17 deer / fox / owl into the Town fauna (FF_ASSETS -> strip, SVG fallback, catch toast uses `_caught`).
- Then the Town grass (T23 gap: seeded 2-tone patches + flower specks in the same baked-image pattern), or the black-ellipse Hole prop.
