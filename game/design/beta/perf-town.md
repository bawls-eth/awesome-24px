# Town frame cost (S-07, b13-03): step 1 profile

Measured 2026-11-23 06:45-06:52 UTC on branch `dev-perf` (Performance + Systems). Town page, OFFLINE stub (Firebase SDK answered empty,
DB hosts blocked, "Play offline"), 390x844 touch (`isMobile`, dpr 1, canvas 390x844, camera zoom 1.2), 0 remotes, CPU throttle 4x
(CDP `Emulation.setCPUThrottlingRate`), Chromium headless with software GL (SwiftShader). Scripts:
two one-off Playwright scripts (CDP Profiler at 1 ms sampling for 20 s; A/B toggles measured 5 s each), not committed.

**Caveat:** the lane rule is "run alone, load average < 4". The machine was at load 9-19 for the whole window (20 agents), so the A/B
medians below swing 33-83 ms between identical runs. Only the large, repeatable effects are reported; QA must re-measure alone.

## CPU profile, 20 s, 0 remotes (load 13.7)
Frames 227, median 83.3 ms (12 fps), p90 133 ms. Self time by function:

| # | self ms | share | function |
|---|---|---|---|
| 1 | 16359 | 80.8% | (program): native, outside JS (GL command submission / raster in SwiftShader, compositing) |
| 2 | 510 | 2.5% | phaser `t.exports` (minified, update/render internals) |
| 3 | 344 | 1.7% | phaser `update` |
| 4 | 297 | 1.5% | `bindTexture` (WebGL) |
| 5 | 255 | 1.3% | (idle) |
| 6 | 250 | 1.2% | phaser `batchSprite` |
| 7 | 189 | 0.9% | phaser `render` |
| 8 | 158 | 0.8% | phaser `sortByDepth` |
| 9 | 153 | 0.8% | phaser `get` |
| 10 | 117 | 0.6% | `activeTexture` (WebGL) |

No main.js function reaches the top 15: the game's own per-frame JS is small.

## A/B (one repeatable result)
| setup | median frame |
|---|---|
| normal | 50-83 ms |
| HUD / chat DOM hidden | 83 ms (no change) |
| camera not rendered (`cameras.main.setVisible(false)`), game loop still running | **16.7 ms** (vsync) |
| game loop asleep | 16.7 ms |

So the update logic and the DOM HUD are not the cost; drawing the scene is. Display list: 951 objects (620 Image, 153 Rectangle,
90 Text, 66 Sprite, ...); 730 of them are entirely outside the camera view but still batched every frame (Phaser 3 does not cull
plain game objects). Full-view layers: 4 island quadrant images (2900x2300 each, half-res canvas textures), `baked_1` (2418x1218, the
baked ground Graphics), and the season-wash rectangle (visible in autumn, by design).

## Recommendations for step 2 (needs main.js slot after W-06 and a quiet machine)
1. Cull static decor by camera rect in coarse cells: static images / texts never move, so bucket them once into 512 px cells and toggle
   `visible` per cell only when the camera crosses a cell edge (no per-frame loop over 951 objects). Expected: ~700 fewer batched quads.
2. Merge `baked_1` (ground) into the island quadrant canvases at bake time (both are static): one full-view textured layer instead of two.
3. Per-remote Phaser Text (90 Text objects already at 0 remotes) -> a shared name atlas / BitmapText; remote labels outside the camera
   hidden (cell rule above).
4. Re-measure: real phones fill these layers on a GPU; the SwiftShader numbers overstate fill cost. Acceptance stays as written
   (4x CPU, 0 remotes median <= 50 ms; 55 remotes within 15%), measured alone.

Not measured: 55 remotes (needs the fake SDK from net-hostile-presence.test.js; skipped while the machine was loaded).

## Round 3 (19:10-19:25 UTC): step 2 landed, measured on a quiet machine (load 0.7-2.5)
Culling (main.js `cullOffscreen`, commit 458cc5f): ~720 of ~950 top-level objects excluded from the camera via `cameraFilter`.
Same harness as above (4x CPU, 390x844 touch, offline, 0 remotes, 12 s CPU profile), A/B in alternating runs:

| culling | frames in 12 s | fps | median | p90 | JS self time per frame |
|---|---|---|---|---|---|
| off | 342 / 350 | 28.5 / 29.2 | 33.3 ms | 50.0 ms | 8.26 / 8.07 ms |
| on | 397 / 399 | 33.1 / 33.3 | 33.3 ms | 33.4 ms | 5.66 / 5.67 ms |

At 1x (beta-s07-town-cull): Phaser `render()` JS per frame 1.73 ms -> 0.44 ms. So: +14% frames, p90 frame 50 -> 33 ms, JS per frame
-30%. The median stays at two vsync intervals: the rest of the frame is SwiftShader fill (headless software GL), which a phone GPU does
not pay. The b13 "11-14 fps" was measured at load 6-24; on a quiet box the same setup was 28.5 fps before culling and 33 fps after.
Not done (next bites): merge the baked ground into the island quadrants (one full-view layer less), shared name atlas for remote labels.
55 remotes still not measured (fake SDK).
