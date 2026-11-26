# Cycle 14 U (UI/UX) - branch `cyc14-ui` (cut from 445fd49)

Static server: port 9102 (this worktree). An untouched copy of 445fd49 (`git archive`) was served on port 9112 for the "before" runs.
Browsers only through /tmp/bt.sh. New test: `game/tests/cyc14-ui.test.js` (registered: browser / full / 300 s).
**On 445fd49: 12 FAILED. On this branch: ALL PASSED.**

## 1. ID-59 hello heart under the bag bar (195x422)
**Measured first (445fd49):** with the fox right under the bag bar, the heart was drawn under the DOM HUD. Measured at 195x422,
390x844 and 1280x720. At 195x422 the box was at 81,143 (32x29 px). `elementFromPoint` at its centre and at all four corners hit
`#inventory-panel` / `.bag-recent`, so it could not be seen. The canvas lies under every DOM HUD element, so this can happen at any
size where an animal walks near a panel.

**Change (`main.js`, `updateAnimalHelloHearts` plus 3 new small methods):**
- Every 120 ms, while a heart is alive (1.2 s), it checks 5 points of its screen box: the centre and 4 inset corners.
  - It stays above the animal when the canvas is on top at all 5 points.
  - Otherwise it takes the first side that is fully clear, in this order: below, right, left.
  - It keeps a non-default side while that side stays clear, so it does not flicker.
  - It goes back above as soon as above is clear.
  - If every side is partly covered, it takes the least covered side.
- The bob, the reduced-motion rule and the fade are unchanged.
- No save key. Nothing is drawn in the DOM.

**Check:** `cyc14-ui.test.js` part A, at 195x422, 390x844 and 1280x720:
- The fox placed right under the bag bar is greeted. Its heart is fully on screen, the canvas is on top at its centre and corners, and
  it does not overlap the bag bar. This failed at all 3 sizes on 445fd49 and passes here.
- An animal in the open still gets its heart above it.
- The toast line is held off during this check (the 30 s gap). The line itself is S's, already tested.

**Test change (an honest extension of S's test):** `cyc13-s-animal-hello` checked "heart above the fox". At 195x422 that was exactly
the covered case. The check now reads: above, OR beside it when the DOM HUD covers the spot above, AND in either case uncovered
(canvas on top at 5 points). The old check accepted the hidden heart; the new one does not.
- On 445fd49 the new check fails at 195x422 (`above:true, clear:false, upCovered:true`).
- On this branch: ALL PASSED.

Screenshots: `img/cyc14-ui-heart-{195x422,390x844,1280x720}.jpg`. At 195x422 the heart now sits under the fox, over the canvas
"log Red Fox" label for its 1.2 s.

## 2. Compass hidden for every modal Town dialog
**Measured first (445fd49):** while any of the 15 modal `*-overlay` dialogs other than the Museum was open, the compass computed
`display: flex`. That held at 1280x720, 390x844 and 195x422. It was visible under the backdrop: covered, but drawn.

**U decision:** hide it. All 16 modal Town dialogs have their own close button (the test checks this) and Esc, so the compass is not
needed while they are open.

**Change (`style.css`, a new `cyc14-ui` block at the end):**
`body:has([id$="-overlay"][role="dialog"][aria-modal="true"]:not(.hidden):not([hidden])) #mm-nav-btn { display: none; }`
- This is the same rule the Museum already had.
- L's z-index rule (`--mm-nav-z: 19`) and the Museum rule are untouched.
- Braces: 841/841 before, 842/842 after.

**Check:** `cyc14-ui.test.js` part B, at 3 sizes:
- The compass is shown with no dialog open.
- It is hidden while each of the 16 dialogs is open and back when each one closes. This failed at all 3 sizes on 445fd49.
- Each dialog has a close button.
- The Museum, opened and closed through `openMuseum()` / `closeMuseum()`, hides the compass and shows it again.
- `cyc13-lead-town-compass-z`: ALL PASSED. Its "not on top" check is still true, because the compass is now hidden.

## 3. Realm 160x284: zone line
**Measured first (445fd49):** in L's folded layout, the arrow, the zone name and the danger icon shared one 17 px row, 50 px wide.
The name got 17 px and read "S…". The longer names fared the same (17 px shown of the 58-65 px they need).

**Change (`realm-ui.css`, a new `cyc14-ui` block at the end, inside the same `<= 190 px portrait` + `rw-has-more` selectors):**
- The column under the mini-map is 54 px tall (y 158 to the move stick at y 212).
- The Lv and shards lines go from a 16 px to a 14 px line height. The text stays 12 px.
- The zone block becomes two 13 px rows:
  - row 1: the arrow and the danger icon;
  - row 2: the zone name alone, 51 px wide (the column plus the gap before the pad).
- Result:
  - "Shore" is whole (35 of 49 px).
  - "Midlands" and "Godlands" show 49 of 56 px, so they lose about one letter.
  - "Highlands" shows 49 of 63 px.
- The Resting-chip rule is unchanged: while resting, the chip still stands in for the strip.

**Check:** `cyc14-ui.test.js` part C:
- **160x284:**
  - the name row is at least 48 px wide (49; it was 17);
  - "Shore" is whole;
  - the text is at least 12 px;
  - the zone block and the Lv/shards lines sit on no control and are inside the screen;
  - the 3 longer names also get the full row.
- **195x422:** unchanged, a one-line strip with the name whole.
- `cyc13-lead-realm-160`: ALL PASSED.

Screenshot: `img/cyc14-ui-realm-160x284-zone.jpg`.

## 4. Review of S's cycle 14 builds (cyc14-systems)
**Status:** at my hand-off, `cyc14-systems` had no commits beyond 445fd49. I read S's uncommitted work in the S worktree (read-only)
but did not run it. Notes are in `fixes/cycle-14-ui.md`.

**Verdict: not approved yet.**
- **Send back:**
  - The ID-65 note (top 16 px, z 18) would lie under the compass (z 19) at phone widths.
  - The ID-62 bubble can sit under the 195 px bag bar, like the heart did. Reuse this branch's clear-side check.
- **Approved:** the ID-66 short labels at <= 300 px.
- **FYI:** an interaction between the chip placement and the new compass rule. Harmless.

Re-check when S commits.

## 5. Ideas ID-68..70 (recorded in IDEAS.md)
| ID | Verdict | Reason |
|---|---|---|
| ID-68 first-level floor | approved with conditions | No new UI and no new key: the hero's own level records it. Needs a `?lvfloor=0` switch, and L lists the pinned early-XP tests before the merge. |
| ID-69 tame-then-fight line | approved with conditions | Text only, through `fitHint`: it gets the cycle 13 show-then-tuck at < 300 px. At most 40 characters. Never replaces a boss, air or danger hint. |
| ID-70 low-HP breather | UI approved, reduced; build after L | There is no free strip for a new DOM line at 160 / 195 px (measured in cycle 13), so the line goes through the same hint path. No flash or shake. L must first check the 2 s aggro drop against the wanderer leash. |

## Regression checks run (port 9102)
| Check | Result |
|---|---|
| `cyc14-ui` (new) | ALL PASSED (3 runs); on 445fd49: 12 FAILED |
| `cyc13-s-animal-hello` (extended) | ALL PASSED; on 445fd49: 1 FAILED (the covered heart at 195x422) |
| `cyc13-lead-town-compass-z` | ALL PASSED |
| `cyc13-lead-realm-160` | ALL PASSED |
| `cyc8-s-rest-chip` | ALL PASSED |
| `cyc9-ui` | ALL PASSED |
| `cyc10-ui` | ALL PASSED |
| `cyc11-ui` | ALL PASSED |
| `cyc12-ui` | ALL PASSED |
| `cyc12-lead-museum-panel` | ALL PASSED |
| `a11y-viewport-sweep`, `PAGES=town,town-museum,realm-world` | ALL PASSED, 0 offenders |
| `nav-town` | first run: 1 FAILED; solo rerun on this branch: ALL PASSED |

Notes on these runs:
- **The sweep** reported only 160x284, 195x422 and 390x844. I asked for 1280x720 in `VPS`, but the sweep did not report it.
- **`nav-town`:** the first run failed "[1280x720] the feedback box never touches pixeltown-save-v1". On 445fd49 the same check failed
  too (at 390x844). This is a pre-existing intermittent failure: some other save write lands during that window. It is not from this
  branch, which writes no save.
- **`cyc14-ui` part C flake:** one run failed because the idle "Resting" chip came up before the measurement. By design that chip hides
  the strip (cyc9-ui). The test now ends the rest with a short real key press and checks that the chip is down before measuring.

## Files changed
- `game/main.js`: in `updateAnimalHelloHearts`, the side choice. New methods: `animalHelloHeartSpot`, `animalHelloHeartClear`,
  `animalHelloHeartSide`.
- `game/style.css`: `cyc14-ui` block at the end (one rule).
- `game/realm-ui.css`: `cyc14-ui` block at the end.
- `game/tests/cyc14-ui.test.js` (new) and `game/tests/test-tiers.json`.
- `game/tests/cyc13-s-animal-hello.test.js`: the extended heart check (see item 1).
- `game/design/IDEAS.md`: ID-68..70 status and conditions, plus a housekeeping note.

## Not done / unresolved
- **Cache versions:** `style.css?v=`, `main.js?v=` and `realm-ui.css?v=` (in `index.html` and `games/mad-maze/index.html`) are not
  bumped (shared files). The coordinator bumps them at the merge.
- **Long zone names at 160 px:** "Highlands" is still cut by about 2 letters. The danger icon and the arrow are whole. The full name
  stays in the DOM text for screen readers.
- **The heart below the fox** can overlap the canvas "E: log …" label for 1.2 s at 195 px. Both are canvas, so the label stays
  readable around the heart.
- Not checked on a real phone. The full stamp is the coordinator's.
