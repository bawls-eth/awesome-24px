# Cycle 9: G Graphics + Pixel Art (branch `cyc9-art`, port 9903)

Commits: `30255d3` (T17 wiring), `fce353e` (robin + squirrel code art), plus a docs commit (queue / board / this report).

## What changed
1. **T17 deer / fox / owl wired into the Town fauna** (merged provisional in cycle 8; INDEX classes `ff_deer` / `ff_fox` / `ff_owl`).
   - New module `game/shared/mm-town-fauna.js` (script tag in `index.html` after `mm-pixelize.js`). At preload it queues the 6 PNG
     strips per species. At create it bakes them ONCE into one canvas texture per species, `fft_<id>`.
   - **Size:** half native, so deer 32 px and fox / owl 24 px cells. That is the hero's pixel density, close to today's W-06 sizes
     (31 / 25 / 20). The bake uses a 2x2 mode filter: a cell is opaque when 2+ of its 4 pixels are; colour is the most common one,
     ties go darker; one very dark pixel in a solid cell wins, so eyes survive.
   - **Animation:** Phaser anims `fft_<id>_{idle,move}_{right,down}`. A wander step plays `move`: the `down` strip when heading
     mostly toward the camera, otherwise the profile, with left = flipX. Strip animals drop the old waddle tilt and fly squash,
     because the frames now carry that motion. Anims pause off-camera and with reduced motion.
   - **Caught pose:** logging the animal shows `caught` for 0.9 s. The Museum card shows the native caught frame at an integer zoom
     (data URL, pixelated) instead of the SVG.
   - **Fallback:** a strip that fails to load (per species) or `?ffstrips=0` keeps the SVG / ffpx art exactly as before. Catch reach,
     speed and range are unchanged (they still use `FF_ASSETS` w/h).
   - `main.js` touch points: preload, create (after `pixelizeFloraFauna`), `addFloraFaunaSpecimen`, `refreshFloraFaunaNear`,
     `stepFloraFauna`, `collectFloraFauna` + new `showFloraFaunaCaught`, `showMuseumDetail`.
2. **Codex review.** `git fetch`: new since the cycle 7 notes are the 5 villager branches (`t01-mocha` 9be19e7 v2-v4, `t01-lily` 47bc8db,
   `t02-frosty` b282df1, `t02-buster` e82216d, `t05-spike` 642b2fd). Everything else is unchanged; the hawk still waits for its
   cycle 8 redo.
   - **None merged.** Codex marks all five "WIP, audit not run", and T01-T07 were cancelled by the owner on 2026-11-23 (the Town uses
     the 10 heroes), so there is nothing to wire them to.
   - Frame-numbered notes are in the `CODEX-REMAKE-QUEUE.md` cycle 9 UPDATE:
     - Spike's profile is still the front body: IoU 0.75-0.81, and left is an exact mirror.
     - Spike `sleep` f1 == f2.
     - Buster and Frosty `sleep` are upright with closed eyes.
     - Buster and Frosty `emote_happy` f1 == f3; Lily `emote_wave` f1 == f3.
   - Codex is redirected to: hawk redo -> T13 pond set -> T10 garden bugs.
   - The board entry is in `TEAM-BOARD.md`. Owl nit: the front eyes merge with the disc rim at half size.
3. **Town animal art: robin and squirrel redrawn as original code pixel art.** These are the two most-seen small animals: both live
   inside the village (`FF_VILLAGE`) and wander the island.
   - **Before:** the pixelized SVGs read as a blue blob ("European Robin") and a brown blob ("Eastern Gray Squirrel") at 16 px.
   - **Robin:** red breast, cream belly, beak, legs, 2-frame wing beat; 16 px cell.
   - **Squirrel:** grey with a bushy curled tail, sitting idle plus a 2-frame bound; 20 px cell (was 16, which read as a speck).
   - Both use the same module and pipeline (`CODE` pixel maps, `?ffstrips=0` fallback). Right view only: the down and caught poses
     reuse the profile.

## Checks actually run (real results)
- `cyc9-art-town-fauna-strips.test.js` (new, browser, registered `full`):
  - **Item 1:** against the pre-change tree (main.js / index.html stashed, module removed) **10 FAIL**; after, **ALL PASSED** (14).
  - **Item 3:** with the two robin / squirrel checks added, against the item-1 module (30255d3) **2 FAIL**; after, **ALL PASSED** (16).
  - **What it covers:**
    - cells 32 / 24 / 24 / 16 / 20, and every specimen is a Sprite on `fft_<id>`;
    - frog and butterfly are still SVG Images;
    - 12 anims with 2 / 4 frames;
    - the baked pixels have height, at least 8 colours and hard alpha;
    - a real `stepFloraFauna` leg (with a fixed target) plays `move` with no tilt, then `idle`;
    - logging a fox shows `caught`, then idle;
    - the Museum card uses the PNG data URL;
    - `?ffstrips=0` gives back all SVGs and the SVG card;
    - when `ff_deer_move.png` is routed to 404, the deer falls back and fox / owl keep their strips;
    - the bake takes < 400 ms, there are 0 page errors, and offlineStub `db.attempts() === 0`.
- `town-bugbash.test.js`: **extended, not loosened.**
  - **Why:** its checks "every specimen draws ffpx_" and "?pixelize=0: first 5 specimens are ff_" assume every species is a pixelized SVG.
    The fox is the first species, so the second check would now see `fft_fox`. I did not run the unedited file on the new code; this
    is from reading it.
  - **Edit:** non-strip specimens keep the exact old assertions, and a new check requires strip specimens (>= 15) to draw `fft_<id>`.
  - **Result:** **ALL PASSED** (after item 1 and again after item 3).
- `town-perf`: **ALL PASSED** both times (42.0 fps and then 39.9 fps avg under load, 0 long frames/s).
- **Also ALL PASSED:** `nav-town`, `shared-bugbash-browser`, `shared-mm-pixelize`, `r4-d2-statue`, `run-all-tiers`, `live-safety`.
- **Codex review:** own Python decode of all 5 villager branches' strips and a contact sheet looked at. The repo audit tool was not
  re-run on them (they are not merge candidates).
- Full stamp **NOT run** (coordinator).

## Screenshots (real browser, offline, Firebase blocked)
- `img/cyc9-art-town-fauna-{d,p}.jpg`: 1280x720 and 390x844, deer / fox / owl (front + profile) next to the hero.
  These are staged: six specimens are moved next to the hero (positions only) and the wander sweep is paused for the capture.
- `img/cyc9-art-town-fauna-compare.jpg`: 390x844, `?ffstrips=0` (old SVG heads) | new strips.
- `img/cyc9-art-town-robin-squirrel-{d,p}.jpg` and `-compare.jpg`: the same for the robin and squirrel.
- `img/cyc9-art-codex-villagers-v2.jpg`: villager v2 contact sheet.
- The 1280x720 compare crop missed (the camera was still panning on the `?ffstrips=0` run), so both compares use 390x844.
  195x422 was not captured: this change has no layout effect.

## Unresolved
- The owl front at half size: eyes and disc rim merge into one dark band (Codex nit filed). The fox side head is still slightly
  large (cycle 8 nit).
- Robin and squirrel have no true front view: down = profile.
- The other ~50 fauna are still pixelized SVGs; T13 / T10 deliveries or more code maps are needed.
- The Museum grid thumbnails (not the detail card) still use the SVGs.
- The hawk still waits for Codex.

## Proposals
- Next G cycle: code maps for the in-village honeybee, ladybug and butterfly (14 px specks today), using the same `CODE` pattern,
  until T10 / T13 land.
- Museum grid thumbnails could use `ffStrips.caughtUrl` when present (small `showMuseum` change).
