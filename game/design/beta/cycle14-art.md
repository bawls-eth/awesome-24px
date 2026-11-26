# Cycle 14: G (Graphics + Pixel Art)

Branch `cyc14-art` (worktree `.claude/worktrees/agent-af182b76a4c183e22`, cut from 445fd49, the cycle 13 stamp). Static server port 9103.
Nothing pushed. Firebase never touched: offlineStub and `db.attempts() === 0` in every run. No save changes.
`firebase-config.js`, `net.js` and `main.js` are untouched.

## 1. Firefly, grasshopper, praying mantis: SVG to code art with true side and front views
- **Why these three:** they were the next pixelized-SVG specks near the village (cycle 13 open list). The game spawns 5 of each in
  the meadow, and all three were drawn as 14 px blurry SVGs.
- **The art** is original. I placed every pixel by hand in a small map, rendered it at 8x, 2x and 1x on grass green, looked at it
  and fixed it (the first grasshopper profile had no visible eye or hind leg, so I redrew it). Sheet: `img/cyc14-art-code-sheet.png`.
  - **Firefly, 14 px.** Dark wing cases with a pale margin and a pink-orange shield with a dark spot. The lantern sits at the
    abdomen tip.
    - idle: the lantern is dim in f0 and lit in f1 (a blink)
    - flight: the wing cases lift and the wings beat up and down
    - front: shield, head with two eyes, wing cases either side
  - **Grasshopper, 16 px.** Big hind femur, rust tibia, an eye with a glint.
    - idle: the antenna twitches
    - move: a step, then a hop frame (legs off the ground, tan hind wing open)
    - front: face with two side eyes, antennae, hind knees above the body on both sides
  - **Praying mantis, 16 px.** Long abdomen, raised thorax, a triangular head on top with the big eye, folded forelegs.
    - idle: the head turns slightly (1 fps)
    - move: a slow stalk (4 fps)
    - front: a wide triangular head with an eye at each corner, and the folded forelegs either side
  - fps (idle / move): firefly 2 / 10, grasshopper 2 / 6, mantis 1 / 4.
  - Size: the W-06 SVG size (14 px), or +2 where 14 px could not hold the face.
- **Wiring:** three `SPECS` lines (`code: true`) and three `CODE` maps in `game/shared/mm-town-fauna.js`. The existing `bakeCode`
  path does the rest: idle and move in right and down, `caught_down_0` is the front view, plus Museum thumbnails and journal art.
  `?ffstrips=0` keeps the SVG. The script cache key went from `?v=20261126g13` to `?v=20261126g14` in `index.html`.
- The ID-59 heart API (`canTurn` / `faceToward`) now also turns these three toward the hero, because they have front frames.

## Checks actually run (all through /tmp/bt.sh, BASE port 9103)
| Check | Result |
|---|---|
| New `tests/cyc14-art-forest-insects.test.js` (registered in `test-tiers.json`, browser / full). It covers bake sizes 14 / 16 / 16, Sprite specimens, anims, frame stats (size, colours, hard alpha), its own front view, distinct frames, two eye pixels in the front view, the firefly lantern blink (lit pixels at the rear), the grasshopper rust tibia and hop frame, the mantis raised head and wide-set eyes, the `?ffstrips=0` SVGs, no page errors and Firebase 0. | **Before the change (HEAD 445fd49 `mm-town-fauna.js`): 9 FAILED, 3 pass** (the `?ffstrips=0` SVGs, page errors and Firebase checks). **After: ALL PASSED (12).** |
| `cyc10-art-town-insects-museum` | ALL PASSED. Test edit: the Museum grid count went from 20 thumbnails (18 locked) to 23 (21 locked). These are the real new counts (+3 code species), and no check was loosened. |
| `cyc9-art-town-fauna-strips`, `cyc11-art-town-fauna`, `cyc12-art-town-wetland`, `cyc13-art-heart-fauna`, `town-bugbash`, `r4-d2-statue`, `art-integration` | ALL PASSED |
| `run-all-tiers` (tier registry) | ALL PASSED |
| Cull tests: `cyc4-town-cull-alloc`, `cyc13-lead-town-cull-far`, `beta-s07-town-cull`, `cyc10-lead-town-cull-sprites` | ALL PASSED |
| **`cyc9-lead-town-cull-pin`** | **FAILED, run twice: check [1] measured 228 per pass vs a budget of 215 (22% of 977 objects), with 182 sprites.** See "Unresolved" below. |
| Real-browser look at 1280x720, 390x844 and 195x422 (offline, 0 page errors, 0 DB). Files: `img/cyc14-art-town-insects-{desktop,phone,tiny}.jpg`, plus `-zoom` versions (the screen region at 4x, nearest neighbour). Top row: profiles. Bottom row: fronts. | Looked at all six. The desktop zoom reads clearly as firefly, grasshopper and mantis, and the front views have faces. On the phone, the first-visit hello hearts (ID-59) popped over the three animals I placed. At 195x422 the HUD and the Goal card cover the spot, so the tiny shot shows little. |

## 2. Codex review
- I ran `git fetch origin`. **No new `codex/*` commits since cycle 11.** The newest head is still `codex/t17-hawk` 1c9f2b6, so
  there is nothing to accept or redo.
- `CODEX-REMAKE-QUEUE.md` has a new section, "UPDATE 2026-11-26 (cycle 14, Claude G)":
  - firefly, grasshopper and mantis are now code art, so those T10 / T11 items are optional
  - still SVG: daddy_longlegs, salamander, tarantula, leafcutter_ant
  - updated priority list
- `TEAM-BOARD.md`: a short "Claude G cycle 14" entry.

## Unresolved
- **Cull budget (`cyc9-lead-town-cull-pin` [1]) is red on this branch.**
  - The three species add 15 walking Sprites (5 each), and every walking Sprite is measured on every cull pass.
  - Per pass it now measures 228. Cycle 13 measured about 212, and the limit is 215.
  - I did not touch the cull or the test.
  - Probe of one pass: 135 walking sprites, 46 `_cstill` sprites, and about 11 moving non-sprites (8 name labels, 2 stars, 1 arc).
    The rest are the staggered every-8th-pass re-measures of settled objects.
  - **The fix does not fit inside the test as written.** Its two halves pull against each other:
    - "measured < 22% of objects" needs fewer measures.
    - "measured >= all sprites" counts the `_cstill` sprites, which are never measured.
    - The obvious saving is to mark far, inactive fauna sprites `_cstill` (they do not move while inactive). That would drop
      measured to about 130, below the sprite count, so the second half would fail.
  - **Proposal for L / coordinator:**
    - Make inactive fauna sprites `_cstill` while inactive: clear the flag and call `uncull()` when `refreshFloraFaunaNear` activates them.
    - Restate the second half as "measured >= walking (non-`_cstill`) sprites", which is what its comment ("still every sprite") means.
    - That is a test edit, so it needs L or the owner to sign off. If that is not wanted, the coordinator can hold this
      branch's wiring (drop the three `SPECS` lines; the maps are harmless) until the cull has headroom.
- **Hello heart size (look, G owns it):** the cycle 13 integration draws the heart in `main.js` `makeAnimalHelloHeart` at `setScale(3)`.
  That makes it 27 px over a 14-16 px animal, bigger than the animal and off the W-06 1:1 pixel density, as the phone shot shows.
  `MMTownFauna.showHeart` draws it 1:1. Proposal for S: use scale 1 (or call `showHeart`). No test pins the scale.
- Still SVG near the village: leafcutter_ant, daddy_longlegs, salamander, tarantula (the next code-art candidates).
- I did not check night glow: the firefly lantern is a palette blink, not a light, and no additive glow was added (ART-HANDOFF rule 2).
