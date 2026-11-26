# Cycle 15 U (UI/UX): branch `cyc15-ui` (cut from e1c8a3e)

Static server: port 9102 (this worktree). An untouched copy of e1c8a3e (`git archive`) was served on port 9112 for the "before" runs.
Browsers only through /tmp/bt.sh, targeted tests only.

New test: `game/tests/cyc15-ui.test.js`, registered as browser / full / 300 s.
- **Before (e1c8a3e, port 9112): 14 FAILED.**
- **After (this branch): ALL PASSED.**

## 1. Realm "Not saved" chip (ID-65) at 300 px wide or less
**What I measured on e1c8a3e first** (quota stub, `saveOk` false, `getBoundingClientRect`):
- **195x422:** the chip walked down from under Leave (y 102-146) past the mini-map and the ability pad to x 92, y 312. That is 166 px from Leave and on top of both sticks' rings.
- **160x284, tray closed:** the chip was at 57,208, on the aim stick.
- **160x284, tray open:** the chip was on Daily (60,210). A real tap on the chip was taken by Daily ("intercepts pointer events"), so the note could not be opened.

**How I chose the slot:** at 195x422 there is no free 44 x 44 cell near Leave. Every cell of the right column and the rows around it is used.

**Change (`realm.js` `_placeSaveWarn` / `_syncSaveWarn` / new `_moreWarn`, `realm-ui.css` cyc15-ui block):**
- **Chip size at 300 px wide or less:** a 44 x 44 chip with two lines, "⚠ Not" / "saved", in 12 px text that is not clipped. The text and the `aria-label` are unchanged.
- **195x422:** the chip sits right above Leave (147,54; Leave is 143,102).
  - While the chip shows, `body.rm-sw-on` nudges Board 8 px left and Menu 12 px left (CSS `translate`) to free that cell.
  - The nudge is removed with the chip.
- **160x284 (the More tray):** the chip lives in the tray.
  - Tray closed: the chip is tucked away. The More button gets an amber ring and a "!" badge, and its `aria-label` adds "Progress not saved".
  - Tray open: the chip takes the free left-column cell under the zone line (8,212), right beside Daily, one cell from Leave.
  - A MutationObserver on the body class re-places the chip as soon as the tray opens or closes.
- **Any other width:** the old walk down from under Leave. The sticks and the zone line now count as obstacles.
- **Wider than 300 px:** unchanged.

**Check:** `cyc15-ui` part A, at 1280x720, 390x844, 195x422 and 160x284 (tray closed and open):
- The chip is at least 44 x 44, inside the screen, with 12 px text that is not clipped.
- It covers no control, HUD bar or stick.
- 195x422: its edge gap to Leave is 8 px or less.
- 160x284: the More warning shows while the tray is closed, and the chip sits beside a tray item while it is open.
- A real tap on the chip reaches it and opens the note.
- A write that lands clears the chip, the More warning and the nudge.
- 0 DB attempts.

All of these failed on e1c8a3e at 195 and 160 (the chip was on the sticks or on Daily, 166 px from Leave, and the tap was taken by Daily). All pass here.

**Test change (an honest extension of S's test):** `cyc14-s-systems` [65R] used to check "under the Leave button" as `top >= Leave.bottom + 3`. The old y 312 met that check. The check now reads "right next to Leave (edge gap 8 px or less, not on it)", which is stricter. `ONLY=65R,66` on this branch: ALL PASSED.

Screenshots: `img/cyc15-ui-savewarn-realm-{1280x720,390x844,195x422,160x284,160x284-closed}.jpg`.

## 2. ID-59 hello heart size
**Measured first:** the heart was drawn at `setScale(3)`, which is 27 x 24 world px over animals 14-24 px tall. On screen that is 32 x 29 CSS px on phones and 43 x 38 CSS px at 1280.

**Change (`main.js` `makeAnimalHelloHeart` plus the new `animalHelloHeartScale`):**
- The heart is now on the animals' pixel grid at an integer scale: 1x, as `MMTownFauna.showHeart` draws it.
- It is drawn at 2x only where 1x would be under 10 CSS px tall on screen.
  - Phones (camera zoom 1.2): 2x, which is 18 x 16 world px, or 22 x 19 CSS px.
  - 1280x720 (zoom 1.6): 1x, which is 9 x 8 world px, or 14 x 13 CSS px.
- The code-drawn fallback heart follows the same rule.
- The post-render side decision (`animalHeart` decide on `postrender`, and `updateAnimalHelloHearts`) is untouched.

**Check:** `cyc15-ui` part B, at 195x422, 390x844 and 1280x720:
- G's baked heart is used, at scale 1 or 2, no larger than 18 x 16 world px.
- It is at least 10 CSS px tall on screen.
- 2x is used only where 1x would be under 10 px.
- It is fully on screen, with the canvas on top at 5 points.

Results:
- On e1c8a3e: failed at all 3 sizes (scale 3).
- On this branch: passes.
- `cyc14-ui` (the heart avoids the bag bar) and `cyc13-s-animal-hello` both: ALL PASSED on this branch.

Screenshots: `img/cyc15-ui-heart-{195x422,390x844,1280x720}.jpg`. At 195 px it still reads clearly as a heart beside the fox.

## 3. Isles toast at 195x422 and 160x284
**Measured first,** with the longest journal line and Soothe shown:
- **195x422 with the how-to card:** the toast was at 64,222-296 and Soothe at y 272, so the toast lay on Soothe.
- **195x422 without the card:** the toast was at y 93-136, on the HUD (76-159). This case was not on the Open list; I found it.
- **160x284 without the card:** the toast was at y 62-121, on the HUD (60-143) and the Pack button.

**Change:**
- `isles.js` new `placeToast()`, called from `toast()`:
  - When the toast in its CSS place lies on the HUD, the card, a control or the stick, it moves vertically only into the free band of its column nearest that place.
  - When no band is tall enough, it stays where the CSS put it.
  - Results: 195 with the card is now at 64,194-268, clear of Soothe at 272. 195 without the card is at y 163-206, under the HUD.
- `isles.css`: at 300 x 300 px or less, the toast also takes the bottom edge when there is no card (cyc14-lead's rule for the card case, extended). It is see-through to taps.
- New test handle `__isles.toast(msg)` (test mode only), so tests use the game's own toast path.

**Check:** `cyc15-ui` part C, at 195x422, 160x284 and 390x844, each with and without the card:
- The toast is inside the screen, with text that is not clipped.
- It is off the HUD, the card and every action-row button (Soothe shown).
- Off Attack when taller than 300 px; at the bottom edge at 300 px or less.

On e1c8a3e the three cases above failed. On this branch: passes.

`cyc14-lead-small-screens`: ALL PASSED. It still prints its INFO "journal line vs Soothe" line, because it sets the toast text directly and bypasses `toast()` (see proposals).

Screenshots: `img/cyc15-ui-isles-toast-{195x422,160x284}-{card,nocard}.jpg`.

## 4. ID-62 treat bubble and ID-66 goal card at 390x844 (first run there)
I extended `cyc14-s-systems` [66] and [62] to run at 390x844 as well (VPS[1] added).

**ID-62:** all 10 checks PASS at 390x844 (bubble, clear of the HUD, a real A tap gives 1 flower, heart, line clear of A / C / the bag bar, 90 s gap, empty bag).

**ID-66: a real bug.**
- **The bug:** at 390x844, "Goal: Craft a Plank Stack at the workbench ↗ ✕" was about 420 px on one no-wrap line, centred, so it ran off both edges. The "G" and the ✕ were cut. The check FAILED with `inside:false`; screenshot taken before the fix.
- **Fix (`style.css` cyc15-ui block, above 300 px):** `#gate-pointer { width: max-content; max-width: 100vw - 16px }`, and the text may wrap (2 lines at 390 px). Short lines (Realm Gate) stay one line, and 1280 is unchanged.
- **Results:** `ONLY=65R,66` on this branch ALL PASSED. That covers 66 at 1280, 390 and 195: the card fits on 2 lines or fewer, has no broken word, is inside the screen and off the controls.
- **Screenshot:** `img/cyc15-ui-goal-390x844.jpg`.

## Unresolved / honest gaps
- **195x422, Isles, card up:** the 4-line journal toast now sits at y 194-268, so for its 2.2 s it covers the hero (about y 185-215). In that column it cannot stay under the hero and also stay off Soothe. Off the controls was chosen.
- **160x284, Isles, no card:** the toast covers the stick and Attack for 2.2 s. It is see-through to taps, the same trade-off as cyc14-lead's card case.
- **Board / Menu nudge at 195x422:** this moves two controls by 8-12 px while storage refuses writes. The gaps between them are now 2-4 px (no overlap; the sweep's 2 px rule holds).
- **Full stamp:** not run (the coordinator runs it). Only these were run:
  - `cyc15-ui`
  - `cyc14-s-systems` with ONLY=65R,66, and with 66,62 earlier on this branch
  - `cyc14-ui`
  - `cyc13-s-animal-hello`
  - `cyc14-lead-small-screens`
- **`cyc14-s-systems` timeout:** the test now runs 66 and 62 at one more size, so it takes longer. Its tier timeout is still 900 s. The coordinator should watch it in the stamp.
- **Cache tags:** not bumped. The coordinator bumps them on integration (`realm.js`, `realm-ui.css`, `main.js`, `style.css`, `isles.js`, `isles.css`).
- **Real phone:** not checked on one.

## Proposals
- Switch `cyc14-lead-small-screens` A to `__isles.toast()` and drop its 195 "known" carve-out. With `placeToast` it should pass strictly.
- The Town chip (`#save-warn`) was not re-checked against these new rules. It passed its own [65T] checks in cycle 14.
