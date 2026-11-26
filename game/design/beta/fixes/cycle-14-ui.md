# Cycle 14 U review of cyc14-systems (read-only)

**Status at U's hand-off:** `cyc14-systems` had no commits on top of 445fd49. These notes are about S's uncommitted work in the S
worktree (`main.js`, `style.css`, `index.html`, `tests/cyc14-s-systems.test.js`), read but not run. **Verdict: not approved yet.**
Re-check after S commits. Notes 1 and 2 are send-backs; note 3 is approved.

## 1. ID-65 note is under the compass at phone widths (send back)
**What I read in the CSS (not measured in a browser):**
- `#save-warn-note` is fixed at `top: 16px`, centred, `max-width: min(92vw, 420px)`, `z-index: 18`.
- The compass (`#mm-nav-btn`) sits at about 8..56 px x 8..56 px with z 19. That is L's cycle 13 `--mm-nav-z`.

**Expected result:** at widths under about 480 px, the left end of the note runs under the compass, and the start of its text is
covered. At 195x422 the note would span about 8..187 px.

**Fix (either one):**
- start the note under the Menu: `top: calc(var(--mm-nav-top, 8px) + 48px + 8px)`; or
- give it a z-index above 19.

**Test:** `elementFromPoint` over the whole note box at 195x422 and 160x284 returns only the note.

## 2. ID-62 bubble can sit under the 195 px bag bar (send back)
**Measured (on the U branch):** at 195x422 the bag bar (`#inventory-panel`) lies over the hero's own row, about 124-178 px. So a
bubble over an animal within 96 px of the hero can be under it, like the ID-59 heart was.

**Fix:** the U branch (`cyc14-ui`, `main.js`) adds `animalHelloHeartSide` / `animalHelloHeartClear`. They check that the canvas is on
top at 5 points of the sprite's box, and the heart takes the first clear side. Use the same check for the bubble (generalise the
helpers to take any image), or place the bubble on the clear side.

**Test:** the bubble at 195x422 is fully on screen, and the canvas is on top at its centre and corners.

## 3. ID-66 short labels (approved)
At <= 300 px, "Use the workbench" and "Place it at home" follow the spec rule: shorten the words, never the type.

## 4. Compass rule interaction (FYI, no change needed)
**What the code does (read, not run):**
- U's rule (`cyc14-ui`, `style.css`) hides `#mm-nav-btn` while any modal Town `*-overlay` dialog is open.
- While the compass is hidden, `placeSaveWarn()` gets no rect for it (`vis()` is null), so it falls back to `8,8`.
- The chip (z 17) is then under the dialog's backdrop. That is fine.

**Expected result:** when the dialog closes, the chip moves back to its place under the Menu on the next 250 ms tick. There is a short
jump, but no overlap.

**Test:** add one check that the chip is back under the Menu after a dialog closes.
