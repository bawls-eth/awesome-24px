# Cycle 5 - U (UI/UX) report

Branch `cyc5-ui`, cut from `claude/animal-crossing-game-7z3roh` at 4b6d34e. Port 9502. Not pushed. Firebase stayed blocked (blockDb or offlineStub in every new test, `db.attempts() === 0` checked where the test joins the Town).

## What changed

### 1. Isles first screen on a phone (b05-r3-05, b06-r3-04), P2
Files: `game/games/isles/index.html`, `isles.css`, `isles.js`.
- On screens up to 600 px wide, the first-visit how-to card now starts as one compact row under the HUD: "How to play", a 44 px **Tips** button (`aria-expanded`, `aria-controls`) and the 44 px X. It is about 52 px tall at 390 px, down from 177 px. Tips opens the five lines. Once you open it, it stays until you press X or a fight needs the screen; a tap elsewhere no longer closes it.
- At 195 px wide the card moves below the HUD (it used to sit on the HUD). At 195x422 it becomes a narrow column at the left edge (a "?" Tips button above the X), because the hero stands right under the HUD there.
- Overlays now take turns instead of stacking. On a phone the hint line waits while the card or a toast is showing (`body.howto-open`, `body.toast-on`). The toast sits just under the compact card, and at 195 px it is full width and one line.
- `fitHint()` (on the 0.5 s tick) lifts the hint line above any action button it would touch. This fixes the 195 px case where Decor / Soothe / Sail covered the hint.
- Opening a panel now goes through `howtoHide`, so the body class is cleared too.
- Desktop is unchanged: full card, no Tips button.

### 2. Phone quest board (b04-r3-01), P2
File: `game/games/mad-maze/realm-world.js`.
- `nxBoardReveal()`: on screens where the board is not the fixed side card (narrower than 1000 px or shorter than 560 px), the Nexus scrolls the whole board into view when it opens. At 390x844 every row and every Claim button now fits on screen; before, the board top was at y=736.
- `#rw-nx-more` is a "More below ▾ swipe up" cue. It is fixed at the bottom-left, ignores taps (`pointer-events: none`) and is `aria-hidden`. It shows only while the board, stall or notebook runs past the bottom edge. It updates on scroll and resize, and when the board opens or closes and the stall opens.

### 3. Town Map (b07-r3-01), P2
File: `game/main.js` (`mapView`, `drawMap`).
- The map now frames the village instead of the whole 5800x4600 world. The frame is the box around all landmarks plus the local player, padded, fitted to the canvas aspect and kept inside the world. Coast, land and ponds use the same transform.
- Labels are placed greedily: they try 14 positions (right, left, above, below, then diagonals) and take the first one that hits no other label, no pin and no canvas edge. Labels use 9 px text on a dark backing. The placed boxes are stored on `scene.mapLabelRects` for the test.

### 4. Jam and Deepdelve at 195x422 (b10-r3-02, b15-r3-01), P2
Files: `game/games/jam/jam.css`, `game/games/deepdelve/deepdelve.css`. CSS only.
- **Jam** (applies at 300 px wide or less, 640 px tall or less, portrait):
  - The header is one slim row and the HUD is one row.
  - The timing pill floats over the top of the lanes instead of reserving its own row.
  - The song name is one 10 px line.
  - The canvas is sized for this screen.
  - Result: canvas at y=109..330 and pads at y=334..386 on a 422 px screen (before: 261 and 470..526). The page does not scroll.
- **Deepdelve** (applies at 300 px wide or less):
  - The title row fits.
  - The tool buttons sit in one row that scrolls sideways inside itself (44 px tall).
  - The HUD is smaller and empty HUD lines are hidden.
  - The dive and bank lines wait while a message is up.
  - The stick and thumb buttons are smaller.
  - The coach line sits in the free space left of the button column, between the HUD and the stick.

### Not started (P3, out of time)
Compass over the "Next:" line and result headlines at 195 px; Town HUD (Menu top-left, "Where to?" placement); Realm HUD Daily/gear between the thumbs.

## Checks actually run (all through /tmp/bt.sh on port 9502)

| Item | New test | Before the fix | After |
|---|---|---|---|
| 1 | `cyc5-ui-isles-compact.test.js` (390x844, 195x844, 195x422 touch + 1280x720) | FAILED: 3 FAIL lines, then the run stopped at the Tips tap because the button did not exist | ALL PASSED (32 checks) |
| 2 | `cyc5-ui-nexus-board-phone.test.js` (390x844 touch + 1280x720) | FAILED 2: board top 736, bottom 980 of 844; no cue | ALL PASSED (6) |
| 3 | `cyc5-ui-town-map.test.js` (1280x720 + 390x844, offline stub, 0 DB attempts) | FAILED: crashed with `s.mapView is not a function`. This failure is a crash, not a geometry assertion | ALL PASSED (13) |
| 4 | `cyc5-ui-195-jam-deepdelve.test.js` (195x422 touch) | FAILED 4: Jam canvas 261..458 and pads below the fold; Deepdelve tool bar 114 px tall; HUD / coach / stick / buttons overlapping | ALL PASSED (10) |

To get the "before" results I ran each new test against the 4b6d34e versions of the changed files, then restored the fixed files.

Existing tests I re-ran after the changes, all ALL PASSED:
- Isles: beta-w18-isles-howto, beta-r4-b08-touch-words, r4-d2-isles, isles-mount-ability, isles-bugbash.
- Nexus: beta-w04-nexus, world-nexus-walk, cyc4-ui-notebook-focus, beta-g12-esc-close, nexus-vendor.
- Jam and Deepdelve: beta-r4-deepdelve-touch-lock, beta-w09-arcade-layout, jam-page.

a11y-viewport-sweep: I ran it only for `PAGES=isles,jam,deepdelve,realm-world`, not the full sweep.
- First run: all 7 viewports had 0 offenders. The text-200 pass (195x422) failed with 3 new offenders: the Jam menu's "Got it" (#hint-ok) overlapped pads D, F and J. The pads now sit on the first screen, under the full-screen menu overlay.
- Fix: at this size the pads are hidden while the menu overlay is open (they are covered by it anyway).
- Re-run with `PREFS=text-200` on the same 4 pages: 0 distinct offenders, ALL PASSED.
- The allow-list stays `{}`; the file was not touched.
- Not re-run after the fix: the 7-viewport pass. The fix only changes the ≤300 px media query, which none of those viewports hit.

Screenshots (from the test runs):
- `img/cyc5-ui-isles-{390x844,195x844,195x422}.jpg` (taken after the card is closed)
- `img/cyc5-ui-board-390x844.jpg`, `img/cyc5-ui-board-cue-390x844.jpg`
- `img/cyc5-ui-town-map-{1280x720,390x844}.jpg`
- `img/cyc5-ui-jam-195x422.jpg`, `img/cyc5-ui-deepdelve-195x422.jpg`

I also viewed the compact card and the map in my own scratch screenshots at 1280x720, 390x844 and 195x844.

Process slip, now fixed: my first commit left out the `game/main.js` change because it was never staged. The checkout I used to restore files after the "before" run then wiped it. I re-applied the same patch and re-ran cyc5-ui-town-map, beta-g12-esc-close, town-8bit-menu and phone-panel against the final file: all ALL PASSED.

## Unresolved / honest notes
- **Isles:** the arrival greeter on jungle often stands above the hero, behind the HUD, so "first creature visible" depends on the island and seed. The card no longer covers the map, but I did not move the greeter.
- **Deepdelve:** b15 reported a 36 px h-scroll. My test's h-scroll check passed against the old CSS too, so I could not reproduce that part. The other three checks did fail before the fix. The "TO..." button cut off in b15's shot is actually the Torch craft button; the Hub and Town links are replaced by the nav compass on this page. At 195x422 the gap between the coach line and the HUD is only about 3 px. Mode and Creative world sit off to the side in the sideways-scrolling tool row (the cut-off button edge is the only cue).
- **Town map:** the 400 ms redraw re-runs label placement, which is about 17 labels x 14 positions (cheap). The frame grows when the player walks beyond the village, so the map rescales.
- **Not checked:** I did not play a full Jam song at 195x422 by feel. Deepdelve beyond the first screen (diving, panels) is not checked at 195.

## Proposals
- Isles: on a phone, have the arrival greeter stand below the hero, not above (the HUD covers the area above).
- Add 195x422 (or 260x563) as an 8th viewport in a11y-viewport-sweep, so 200%-zoom layouts are covered by the gate instead of by one-off tests.
