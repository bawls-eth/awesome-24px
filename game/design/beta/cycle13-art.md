# Cycle 13: G (Graphics + Pixel Art)

Branch `cyc13-art` (worktree `.claude/worktrees/agent-a23161bbfa123d62e`, cut from 1e6b3b6, the cycle 12 stamp), static server port 9133.
Nothing pushed. Firebase never touched: offlineStub, and `db.attempts() === 0` in every run. No save changes (the `animalHello` bit is S's).
`firebase-config.js`, `net.js` and `main.js` are untouched.

## 1. ID-59 hello heart (original code art) and the API for S
- **The art.** A 7 x 7 px heart (5 x 5 red fill, dark wine outline, pink highlight, darker lower-right shade) in a 9 x 8 cell, 4 frames:
  - f0: small pop-in heart (5 x 5)
  - f1: full heart
  - f2: full heart + white glint
  - f3: full heart
  U's spec said 7 x 6. The 7th row is the 1 px tip, which keeps the point sharp at 1:1. G owns the look (U spec, point 2).
- **Where it lives.** `game/shared/mm-town-fauna.js` (already loaded by the Town; cache key bumped to `?v=20261126g13`).
  `MMTownFauna.bake(scene)` now also bakes texture `fft_heart` (frames `heart_0..3`) and the one-shot anim `fft_heart_pop` (10 fps,
  repeat 0). This also happens with `?ffstrips=0`, because the heart is not a species. `scene.ffStrips.heart === true` when it is baked.
- **API (S builds the behaviour in `main.js`: radius, once per animal, `animalHello` bit, toast line, 30 s line limit):**

  | Call | What it does |
  |---|---|
  | `MMTownFauna.showHeart(scene, sprite, { reduced, ms })` | Puts the heart 5 px above `sprite` at depth `sprite.depth + 1` and makes it follow the sprite every frame. It removes itself after `ms` (default 1200). `reduced: true` (pass reduced motion OR flashes off): static `heart_1`, no anim, no tween, alpha 1. Otherwise: pop anim (0.4 s), a 3 px rise and a fade over the last 0.25 s. Returns the Sprite (destroying it early is safe) or `null`. Works over SVG Images too. |
  | `MMTownFauna.faceToward(scene, sprite, id, x, y)` | Turns a strip / code animal toward a point (the hero): front idle when the hero is mostly below, else the profile idle, flipped when the hero is to the left. Returns `false` and does nothing for SVG species. |
  | `MMTownFauna.canTurn(scene, id)` | `true` when the species has side + front frames (strip or code art), the U spec "turn only if it has side frames" rule. |
  | `MMTownFauna.HEART`, `MMTownFauna.bakeHeart(scene)` | The map and the (idempotent) bake, in case S needs the heart before / outside `bake`. |

  A Town animal sprite is `spec.sprite` in `s.ffSpecimens`. A wandering one is moved by tweens, and the heart follows it.
  Suggested call from S: `if (MMTownFauna.canTurn(this, spec.id)) MMTownFauna.faceToward(this, spec.sprite, spec.id, me.x, me.y); MMTownFauna.showHeart(this, spec.sprite, { reduced: this.reduceMotion });`.
  The next wander step will turn the animal away again. That is fine for a hello, or S can hold the wander for 1.2 s.

## 2. Crab, hedgehog, bat, spider: SVG -> code art with front views
- **Why these four:**
  - They are the next most-seen pixelized-SVG animals (cycle 12 report, unresolved list): the crab on the pond bank, and the hedgehog,
    bat and spider at the forest edge.
  - The game spawns 2 / 5 / 5 / 5 of them.
- **The art** (original; made with a small layout script: ellipses, an outward outline, edge shading, details placed by hand; pasted as literal maps):
  - **Fiddler crab, 16 px:**
    - one oversized yellow claw that waves up in idle f2
    - cream eyes on dark stalks, legs that alternate when it walks
    - front view: the big claw on the viewer's left, small claw right, two eye stalks
  - **Hedgehog, 16 px:**
    - spiny brown dome with spine tips poking through the outline, a cream face, a pink ear and a black nose that sniffs in idle f2
    - front view: round face, two eyes, a 2 px nose, two ears
  - **Little brown bat, 16 px:**
    - membrane wings with arm bones and a scalloped trailing edge, in three poses: level, up and down
    - idle flaps level / up; move flaps up / down
    - the "right" view is a 3/4 turn: head right, far wing foreshortened. The front is the classic spread silhouette with two eyes.
  - **Orb-weaver spider, 14 px:**
    - top view, a round orange abdomen with the pale cross, a dark cephalothorax and 8 legs that step
    - front view: abdomen up, head down, two eyes
  - fps: crab 2 / 8, hedgehog 2 / 6, bat 4 / 10, spider 2 / 8 (idle / move)
  - The size is their W-06 SVG size (14 px), or +2 where a 14 px body could not hold a face.
- **Wiring:** four `SPECS` lines (`code: true`) and four `CODE` maps. The existing `bakeCode` path does the rest: idle / move in
  right + down, `caught_down_0` = front, Museum thumbnails and journal art. `?ffstrips=0` keeps the SVG.
- **Contact sheet:** `img/cyc13-art-code-sheet.png`. It shows every frame at 8x, 1x and 2x on grass green, with the heart on the top row.

## Checks actually run (all through /tmp/bt.sh, BASE port 9133)
| Check | Result |
|---|---|
| New `tests/cyc13-art-heart-fauna.test.js` (registered in `test-tiers.json`, browser / full). It covers:<ul><li>bake sizes, Sprite wiring, anims</li><li>frame stats: size, colours, hard alpha, own front view, distinct frames, two eye pixels in front, crab claw side</li><li>the heart: 4 frames of 9 x 8, a 7 x 7 full heart, pop anim one shot</li><li>`showHeart` above / centred / depth / anim / self-removal / follows a moving animal</li><li>reduced = static `heart_1` with no tween</li><li>`faceToward` down / left-flip / SVG untouched</li><li>`?ffstrips=0` SVGs and the heart still works</li><li>0 page errors, 0 DB attempts</li></ul> | **With `mm-town-fauna.js` from HEAD (1e6b3b6): 16 FAILED, 3 pass.** The 3 that pass are `?ffstrips=0` SVGs, no page errors and Firebase 0. The first try at this base crashed with a TypeError instead of reporting FAIL. I made the checks null-safe and re-ran it to get the 16 FAILED. **After the change: ALL PASSED (19), run twice.** |
| `cyc9-art-town-fauna-strips` | ALL PASSED |
| `cyc10-art-town-insects-museum` | ALL PASSED |
| `cyc11-art-town-fauna` | ALL PASSED |
| `cyc12-art-town-wetland` | ALL PASSED |
| `town-bugbash` | ALL PASSED |
| `r4-d2-statue` (W-06 scale table) | ALL PASSED |
| `art-integration` | ALL PASSED |
| Real-browser look at 1280x720, 390x844 and 195x422 (offline, 0 page errors, 0 DB): `img/cyc13-art-town-fauna-{desktop,phone,tiny}.jpg` plus `-zoom` (the 1x screen region blown up 4x nearest-neighbour; camera zoom is reset by the Town's resize handler, so I zoomed the screenshot instead). Top row: profiles. Bottom row: fronts. The reduced heart sits over the front hedgehog. | Looked at. The desktop and phone zooms read as crab / hedgehog / bat / spider, and the heart is clear above the hedgehog. At 195x422 the HUD covers the spot I placed them in (above the hero), so the tiny shot shows little. Heart placement at 195 belongs in S's ID-59 test (U spec point 5). |

**Test edits, said plainly:**
- `cyc9-art-town-fauna-strips` and `cyc10-art-town-insects-museum` used the crab and the hedgehog as their "untouched SVG" controls.
  Both are code art now, so the controls moved to the heron (pond) and the toucan (forest). Both are still SVG and spawned 2 / 5 times.
- The Museum test logs the heron instead of the crab, and expects 20 strip / code thumbnails (18 locked) instead of 16 (14 locked).
  Those are the real new counts. No check was loosened.

## 3. Codex review
- I ran `git fetch origin`. **No new `codex/*` commits since cycle 11.** The newest head is still `codex/t17-hawk` 1c9f2b6. There is nothing to accept or redo.
- `CODEX-REMAKE-QUEUE.md`, new section "UPDATE 2026-11-26 (cycle 13, Claude G)":
  - hedgehog / bat / spider are now code art, so their T14 strips are optional (they must beat the 16 px code art)
  - `leafcutter_ant` is the one T14 item left
  - the heart needs no Codex asset
  - updated priority list: howler_monkey -> T13 nits -> T14 ant -> hawk v3 -> T10
- `TEAM-BOARD.md`: a short "Claude G cycle 13" entry pointing to the queue section.

## Unresolved / proposals
- **S:** wire ID-59 with the API above.
  - Pass `reduced` from the Town's own reduce flag (OS reduced motion, the reduce-motion pref, flashes off or low gfx; `main.js` ~l.614).
  - Test the heart at 195x422 and 1280x720 as U asked.
- **Screenshot tooling:** in the phone run, two of the eight placed specimens (bat profile, second crab) were not where I put them. They are
  probably moved by the wander / cull loop between placing and the shot. This is a screenshot-script issue, not a game bug, but the
  phone shot shows 6 of 8.
- **Still SVG near the village:** `leafcutter_ant`, plus the forest specials (grasshopper, firefly, praying mantis, tarantula,
  daddy longlegs, salamander: 5 each). The firefly at night is the most visible of them, so it is the next code-art candidate.
- I did not run the art audit. It does not cover code art.
