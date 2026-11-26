# Cycle 15 G (Graphics / Pixel Art): salamander, daddy longlegs (staged), ID-62 treat bubble art

Branch `cyc15-art` (cut from e1c8a3e). Port 9103. Nothing pushed.

## What changed
1. **Spotted salamander: code art, wired** (`game/shared/mm-town-fauna.js`, `SPECS.salamander` + `CODE.salamander`).
   - Original 16 px art, baked 1:1 like cycles 9-14. Blue-black body, two rows of yellow spots.
   - Profile (right): low and long, one eye with a glint at the front of the head, legs that step. Idle f1 lifts the tail tip.
   - Front (down): a true view from above as it walks toward the camera. The head and eyes are at the bottom, the tail at the top, and the legs splay out. The legs and tail alternate in the move frames.
   - `?ffstrips=0` keeps the SVG.
2. **Daddy longlegs: code art, STAGED (not wired by default).**
   - Original 16 px harvestman: a round tan body with an eye turret and four tall leg arches a side, the far legs paler. The body bobs 1 px in idle.
   - Front view: the turret shows two eyes.
   - It is wired only with `?ffstaged=1` (new `SPECS.staged` flag; `bake` skips a staged species otherwise). Without the flag it stays the SVG Image, as before.
   - **Why staged:** the cull budget (see "Unresolved").
3. **ID-62 treat bubble final art** (`TREAT`, `treatRows`, `bakeTreat` in the fauna module).
   - A rounded white bubble with a soft grey inner shade, an ink outline and a tail at the bottom left.
   - Icons: a five-petal pink flower with a yellow centre, stem and leaf; a red apple with a highlight, stem and leaf. Each icon has its own dark outline.
   - It is baked on every Town bake, also with `?ffstrips=0` (it is not a species).
   - `main.js` `makeTreatBubble` now uses it first: one guarded line, same 16 x 15 size, 2x scale, origin (0.1, 1). S's placeholder stays as the fallback. No logic was touched.
4. **Tests**
   - New `cyc15-art-forest-floor.test.js`, registered in `test-tiers.json` (full tier).
   - Two honest pinned-value updates:
     - `cyc10-art-town-insects-museum`: Museum strip thumbnails 23 -> 24, locked 21 -> 22 (+ salamander). This is the same kind of edit cycle 14 made for its insects.
     - `cyc14-s-systems` [62]: the bubble texture key must now be `fft_treat_(flower|fruit)` instead of the placeholder `treat-bubble-*`. The check is just as strict, and it fails on the base.

## Checks actually run (all through /tmp/bt.sh)
| Item | Check | Result |
|---|---|---|
| all | `cyc15-art-forest-floor` on the base (git archive of e1c8a3e, port 9113) | 11 FAILED (no code art, no `fft_treat_*`, makeTreatBubble returns `treat-bubble-*`). The ffstrips=0, no-errors and DB checks pass. |
| all | `cyc15-art-forest-floor` on cyc15-art (port 9103) | ALL PASSED: default wiring, `?ffstaged=1` art checks (16 px Sprites, own front frames, eyes, legs reach the ground with >= 4 feet, body bob, salamander spots and proportions), `?ffstrips=0` SVG, treat textures and contract, 0 errors, 0 DB attempts |
| ID-62 | `ONLY=62 cyc14-s-systems` (1280x720 E and 195x422 A tap) | ALL PASSED on cyc15-art; the updated key check gives 2 FAIL on the base |
| cull | `cyc14-lead-town-cull-rooted` | **with both species wired: FAIL** [1] 203.8 measured of 978 (line 20.5% = 200.5). Salamander only: PASS twice (198.9, 198.3). Base: 193.1. |
| cull | `cyc9-lead-town-cull-pin` | ALL PASSED (196 per pass) |
| cull | `cyc13-lead-town-cull-far` | [7] FAIL on cyc15-art (198.9 vs 203.4, needs a gap of 5) **and on the base in the same parallel run** (196.3 vs 199.2). This is load-dependent and not caused by this branch. It passed earlier on this branch with both species (204.3 vs 209.4). Re-run solo at the stamp. |
| regressions | `cyc14-art-forest-insects`, `cyc13-art-heart-fauna`, `cyc10-art-town-insects-museum` (after the 24 edit) | ALL PASSED |
| browser | screenshots, offline ADMIN bot, 0 page errors, 0 DB attempts | `img/cyc15-art-salamander-1280.jpg` / `-390.jpg` (salamander next to the hero, with the fruit / flower bubble), `img/cyc15-art-daddy-longlegs-staged-1280.jpg` / `-390.jpg` (`?ffstaged=1`) |
| art | looked at 12-14x contact sheets and 1x | readable at 1x: harvestman arches, newt from above |

**Screenshot note:** in the screenshots the bubble was placed by calling `makeTreatBubble` next to the animal, not by the real proximity flow. The real flow with the new art is what `cyc14-s-systems` [62] checks, at 1280x720 and 195x422.

## Codex branches (read-only review)
There are no new `codex/*` commits since 1c9f2b6 (T17 hawk v2, reviewed cycle 11). The newest after it are older WIP villager redos (t01-mocha 9be19e7 and the others), already sent back in cycle 6. Nothing to accept or redo.

## Unresolved
- **Cull budget.** Each converted species turns its 5 settled Image specimens into 5 animated Sprites, and every cull pass measures them.
  - With both species wired, `cyc14-lead-town-cull-rooted` (20.5% line) fails at 203.8 / 978.
  - With the salamander alone it is at about 198.5, leaving about 2 objects of headroom.
  - So the daddy longlegs art ships staged. Wiring it, or any further animal, needs either cheaper culling of resting strip Sprites (L) or an owner decision on the line.
- The `mm-town-fauna.js?v=` / `main.js?v=` cache tags were not bumped (shared files; the coordinator bumps them at the merge).
- Not run at 195x422 for the animals themselves (the bubble ran at 195x422 via [62]). Not checked on a real phone.

## Proposals
1. L: let a resting strip Sprite whose anim is paused off-screen settle like the Image animals (`_cfix` while far and not walking). That frees about 5 measures per species, enough to wire the daddy longlegs (`staged: true` -> remove the flag).
2. G next: tarantula and leafcutter ant are drawn only once there is headroom.
