# Cycle 11: U (UI/UX), branch `cyc11-ui`

- **Worktree:** `/tmp/wt-cyc11-ui`, cut from `claude/animal-crossing-game-7z3roh` at bd92da2.
- **Server:** static server on port 9112. A base worktree `/tmp/wt-cyc11-ui-base` (bd92da2, port 9122) was used for the before-runs.
- **Browsers and tests:** browsers ran only through `/tmp/bt.sh`, and only targeted tests were run.
- **Not touched:** nothing was pushed. firebase-config.js and net.js are unchanged. There is no save change (no new key). The 160x284 offender pages (L's) were not touched.

## 1a. ID-53 just-in-time hint at 195x422: decision and build
- **Problem:** at 195x422 the hint never showed (cycle 10 S: `why = 'overlap'`). Every band is taken.
- **Decision (my cycle-10 spec option):** below 300 px wide, the hint briefly takes the goal line's place.
- **How it works** (`realm-world.js` `jhPlaceGoal`, CSS `#rw-jhint.rw-jhint-goal` and `#rw-goal.rw-yield`):
  - The normal slot is tried first. If it collides and the screen is under 300 px wide, the hint takes the goal line's box: the same left, top and width (8,219 → 85 at 195x422).
  - Inside that box the close button sits on top, away from the sticks, and the text sits under it at 12 px.
  - The goal line is `visibility:hidden` only while the hint shows. Every hide path brings it back: close, Esc, reward, timeout, block, verb done.
  - The hint must still end 8 px or more above the sticks (19 px measured at 195x422) and touch nothing else. Otherwise the old second slot is tried, then it refuses, as before.
- **Still the same:** the 12 s life, 3 per visit, all the block conditions, and the 390x844 / 844x390 / 1280x720 behaviour (slot `main`).
- **New field:** `jitHint.state().slot` ('main' / 'goal' / 'alt').
- **S test:** `cyc10-s-jit-hint.test.js` asserted the old refusal at 195x422. That branch now asserts the decided behaviour: goal slot, goal line hidden, covers nothing else, 8 px from the sticks, 12 px text, 44 px close. Nothing else in it changed.

## 1b. ID-55 first-session card at 195x422
- **Problem:** the card was 311 px tall (y 6-317 of 422) and covered the hero at the screen centre (y 210).
- **Fix:** a compact top layout at <= 300 px (`mad-maze.css`, cyc11 block):
  - the stats in one row (label over value)
  - a 13 px head
  - a 12 px goal
  - both buttons on one 44 px row
- **Result:** the card is y 4-177 at 195x422 and y 4-162 at 240x480. The hero (y 210 / 240) and the sticks stay visible.
- Nothing is removed. 390x844 and wider are unchanged.

## 2. Fixed title row: #realm-board and #realm-hero (measured first); Museum tab bar
**#realm-board (kill board):**
- **Measured:** the whole card scrolled (502 px of content in a 394 px box at 195x422). After a scroll its ✖ sat at y -82, off screen.
- **Fix:** the shop pattern in `realm-ui.css`. The card is a column, the title row and the "Hero stats" button stay put, and only `#realm-board-body` scrolls.
- The CSS version is bumped in both Realm pages (`?v=20261125c11`).

**#realm-hero:**
- **Measured:** no change was needed. Its ✖ stays put at 195x422, 390x844 and 1280x720 (y 78 / 78 / 26, on top), because only `.hp-body` scrolls inside the card.

**Museum (Town, `style.css`, <= 480 px):**
- **Measured at 195x422:** the stuck tab bar sat at y 48, but the card's top edge is y 28. Scrolled specimen cards therefore showed in a 20 px strip above the 45 px bar.
- **Fix:**
  - The bar now sticks flush with the card's top edge (`top: -20px`, the card's padding).
  - It is slimmer below 300 px (37 px instead of 45).
  - The card has `scroll-padding-top`, so focus / `scrollIntoView` never parks a specimen card under the bar.
- `style.css` version bumped (`?v=20261125c11`).

## 3. Idea review (IDEAS.md, section "U cycle 11", status cells updated)
| ID | Decision | Reason |
|---|---|---|
| ID-56 | Approved, full spec | At 195 px a star cannot share the Buy line (Buy has a 92 px minimum width) and `#realm-info` is a 75 px nowrap box. So the star goes on the name line at <= 300 px, the full sentence goes only in the shop's sticky wallet line, and the HUD only colours the shard count there. Pin is the device pref `mm-shop-pin`. |
| ID-59 | Approved with conditions | Use species names: wild animals have no names, and "Mocha" is a villager. The heart is drawn in code and is static under reduced motion. Use `#achievement-toast` only when it is free. One line per 30 s at most. The additive bitmask `animalHello` goes in SAVE-KEYS. |
| ID-60 | Rejected | The Town page does not load MMNotebook. The Museum Wild Fauna wing already lists the same animals. Counter-proposal: a "Seen" state on the Museum cards, after ID-59. |
| ID-61 | Approved, full spec | Read `lastVisitDate` BEFORE ID-09 rewrites it. Show realm level only, and the zone only if it can be read without guessing. Element `#town-welcome`: role=status, 44 px close button, Esc captured, waits for the What's-new banner. No new key. |

## Checks actually run (all through /tmp/bt.sh)
| Check | Result |
|---|---|
| New `game/tests/cyc11-ui.test.js` (registered: browser/full, 420 s). It covers:<ul><li>the hint at 195 / 240 / 390, with a real tap on the close button</li><li>the card at 195 / 240 / 390: hero clearance, fit, 44 px buttons, no broken words, text >= 12 px</li><li>the kill board at 195 / 390 / 1280: body scrolls, ✖ on screen and on top after scrolling, real tap / click closes it</li><li>the Museum at 195 / 390: bar flush, block-start card below the bar, bar <= 40 px at 195</li><li>0 DB attempts</li></ul> | **Base bd92da2 (port 9122): 24 FAILED**. All the target checks failed. The "390x844 unchanged" guard failed there only because `state().slot` did not exist yet. **Branch:** ALL PASSED (50 checks) on the first run. On the third run, 1 check failed: a game notice came up between show and tap, and the hint correctly hid itself with `why: toast`. The test now waits for a quiet moment (`block === ''`, the game's own trigger rule). After that: **ALL PASSED twice in a row**. |
| `cyc10-s-jit-hint` (with the updated 195 branch) | ALL PASSED |
| `cyc10-s-first-end` | ALL PASSED |
| `realm-phone-layout` | ALL PASSED |
| `cyc10-ui` | ALL PASSED |
| `cyc10-art-town-insects-museum` | ALL PASSED |
| `realm-polish3` | ALL PASSED |
| `gear-hero-stats` | ALL PASSED |
| `a11y-viewport-sweep` `PAGES=realm-world,town` (8 viewports + preference passes) | ALL PASSED, 0 offenders |

Screenshots (real browser, final code), all in `game/design/beta/img/`:
- `cyc11-ui-hint-{195x422,390x844}.jpg`
- `cyc11-ui-first-end-{195x422,240x480,390x844}.jpg`
- `cyc11-ui-board-{195x422,390x844,1280x720}.jpg`
- `cyc11-ui-museum-{195x422,390x844}.jpg`

## Unresolved
- **Town compass button over the Museum card:** at 195x422 the Town's top-left compass button overlaps the left end of the Museum card and its stuck tab bar (it covers part of the "Fossils" tab). This was there before this change; it was seen in the screenshot and not fixed.
- **Museum ✕ scrolls away:** the Museum's ✕ is absolutely positioned inside the scrolling card, so it scrolls away like the old shop ✖ did. Not changed this cycle; Esc still closes the Museum, and Back was not checked.
- **Museum tabs are 29 px tall:** this is under the 44 px target. The sweep does not open the Museum, so it is not caught.
- **Town Realm not checked in a browser:** `game/index.html` loads the same `realm-ui.css`, so its kill board gets the same fix, but only the Mad Maze page was checked in a browser.
- **No real phone:** real-phone touch was not tested; it was Playwright touch only.

## Proposals
1. Museum at <= 480 px: hide or move the Town compass while `#museum-overlay` is open, and move the ✕ into the sticky bar row. Then add the Museum to the a11y sweep's opened-panel views.
2. Raise the Museum tabs to 44 px on touch. With the bar flush and slimmer, the height budget allows it.
3. S builds ID-61 first (smallest, no key), then ID-56, then ID-59 (needs G's heart).
