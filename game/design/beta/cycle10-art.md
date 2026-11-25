# Cycle 10: G Graphics + Pixel Art (branch `cyc10-art`, port 9103)

Commits:
- `ecf674c`: insect code art, Museum grid thumbnails, owl eye bake, and tests.
- A docs commit: queue, board and this report.

Nothing was pushed.

## What changed

### 1. Codex review
I ran `git fetch origin` at the start of the cycle. There are **no `codex/*` commits since the cycle 9 review**:
- The newest head is still `codex/t01-mocha` 9be19e7 (02:18 -0800), which was reviewed in cycle 9.
- `codex/t17-hawk` is still f2717b2, so its cycle 8 REDO stands.

So nothing was merged and there were no new redo notes to write. The `CODEX-REMAKE-QUEUE.md` cycle 10 UPDATE and a `TEAM-BOARD.md` entry:
- record that nothing arrived;
- tell Codex the bee, ladybug and butterfly now have code art (a T10 / T13 strip still replaces them by id);
- say the owl nit is handled in the bake;
- warn that `caught` poses now show in the Museum grid;
- keep the order: hawk redo -> T13 -> T10.

### 2. In-village honeybee, ladybug and butterfly
These are now original code pixel art in `game/shared/mm-town-fauna.js`, as new `CODE` maps and `SPECS` entries. They go through the same `bakeCode` path as the robin and squirrel.

| Species | Cell | View | Frames |
|---|---|---|---|
| Honeybee | 14 px | Side view, head right | Banded abdomen, amber thorax, glassy wings. Idle hover: 2 f at 6 fps. Move: wings up / swept back, 2 f at 12 fps. |
| Seven-spot ladybird | 14 px | Top view, head right | Red elytra with spots, white-cheeked head. Idle: crawling legs, 3 fps. Move: hind wings out in two positions. |
| Monarch | 16 px | Top view | Symmetric, so the flipX for left is harmless. Orange wings, black veins, white rim dots. Idle: open / mid. Move: open / closed. |

- **Before:** all three were 14 px pixelized-SVG specks.
- **Fly squash:** none on strip specimens. The frames carry the flap, as in the existing code path.
- **Down and caught:** reuse the profile (idle f1).
- **Fallback:** `?ffstrips=0` (or the module missing) gives back the old SVG / ffpx art.
- **Gameplay is unchanged:** catch reach, speed and range still come from the `FF_ASSETS` w/h.

### 3. Museum grid thumbnails and owl front eyes
**Museum grid (`main.js` renderIdSection, `style.css`).**
- Every strip or code species now shows the same caught pose as the detail card, as an integer-zoom PNG (`ffStrips.thumbUrl`, `image-rendering: pixelated`, never upscaled by CSS):
  - PNG species use the native caught frame at 1x (deer 64 px, fox / owl 48 px).
  - Code species use the largest zoom that fits 56 px (bee / ladybug 4x, robin / monarch 3x, squirrel 2x).
- Locked cards use it too. The existing CSS turns it into a silhouette.
- Every other species, and `?ffstrips=0`, keeps the SVG.

**Owl front eyes (`halve` in mm-town-fauna.js).**
- **What I changed:** a new optional tie rule, `'rare'`. On a 2-2 tie in the 2x2 mode filter, it keeps the colour that is rarer in the whole frame (the eye ring, pupil or beak) instead of the darker one (usually the common outline).
- **Where it applies:** only to the owl's `down` strips (`SPECS.owl.rareTie = 'down'`). In a Python simulation of the same filter it made the side frames slightly noisier, so they keep the default rule.
- **Effect:**

  | Front frame | Old bake | New bake |
  |---|---|---|
  | Eye-ring pixels | 5-12 | 15-17 |
  | Pupil pixels touching the dark disc rim | 4-15 | 2-5 |

  On screen the owl now shows two ringed eyes with the beak between them, where it used to show one dark band.
- Deer and fox bakes are untouched.

**Other edits:**
- `index.html`: only the `mm-town-fauna.js` version string, `?v=20261125g10`.
- The coordinator may want to bump the shared `main.js` / `style.css` versions at merge time. I left them alone to avoid conflicts.

## Checks actually run (real results)
**`cyc10-art-town-insects-museum.test.js`** (new, browser, registered `full` in test-tiers.json).
- Against the pre-change tree (tracked edits stashed): **8 FAIL**, 4 pass. The passes were the frog / snail control, `?ffstrips=0`, no errors and offline.
- After: **ALL PASSED** (12), and again after adding the literal `db.attempts() === 0` assert that run-all-tiers requires.
- What it covers:
  - cells 14 / 14 / 16 and every specimen a Sprite on `fft_<id>`;
  - frog and snail still SVG Images;
  - pixels at least 9 px tall and 11 px wide, 6+ colours, hard alpha;
  - 2 + 2 frame anims in right + down, with the move frames differing;
  - a butterfly flight leg plays move with no squash;
  - owl front ring / rim-contact metric on all 6 idle / move down frames;
  - Museum grid: bee 56 px and fox 48 px PNG pixelated thumbnails, 8 thumbnails including 6 locked, frog still SVG;
  - `?ffstrips=0` gives all SVGs;
  - no page errors, and offlineStub `db.attempts() === 0`.

**`cyc9-art-town-fauna-strips.test.js`**: one control changed, not loosened.
- Its check "other species are untouched SVG Images (frog, butterfly)" described the old butterfly, which is now code art and is checked by the new test.
- The second control is now the snail, with the same assertions plus a texture-key match.
- Result: **ALL PASSED** (16).

**Also ALL PASSED:** `town-bugbash`, `town-perf`, `hub-collections`, `beta-g12-esc-close`, `phone-panel`, `town-8bit-menu`, `live-safety`, `shared-mm-pixelize`.
- `run-all-tiers` first **FAILED** on the new file (the offline assert was not in its literal form). After the fix it **ALL PASSED**.

**Not run:**
- The full stamp (that is the coordinator's job).
- `node game/tests/run-all.js`.

## Screenshots (real browser, offline, Firebase blocked, db attempts 0)
- **`img/cyc10-art-town-insects-{d,p}.jpg`** (1280x720 and 390x844): bees, ladybugs, butterflies, owl front, robin and fox next to the hero. These are staged: specimens are moved next to the hero (positions only) and the owl is held on `idle_down_0`.
- **`img/cyc10-art-town-insects-compare.jpg`** (390x844, 3x crop): `?ffstrips=0` (old) on the left, new on the right. Staging only partly took on the old run, so only the ladybug and robin are directly comparable there.
- **`img/cyc10-art-museum-grid-{d,p,t}.jpg`** (1280x720, 390x844, 195x422): the Wild Fauna wing with fox, deer, robin and monarch as pixel thumbnails, and the frog as SVG. The 195 capture is scrolled to the grid.

## Unresolved
- **Insect views:** bee, ladybug and monarch have no true front view and a single caught pose (idle f1).
- **Owl side frames:** they still use the default tie rule. Its front eyes are heavier than the native art but read as two eyes.
- **About 45 other fauna** are still pixelized SVGs (pond set, hummingbird, snail, dragonfly in the village).
- **Hawk:** still waits for Codex.
- **195x422 Museum (U's area):** the sticky tab bar overlaps the top grid card when scrolled. This layout was already there; it is not from this change.

## Proposals
- **Next G cycle:** code maps for the other in-village species (hummingbird, snail, dragonfly) so `FF_VILLAGE` is fully pixel art.
- **Test the `'rare'` tie rule on fox and deer front frames** if a later Codex strip shows the same eye merge. It is opt-in per species and direction.
