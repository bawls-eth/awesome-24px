# Cycle 11: S (Game Systems Developer)

Branch `cyc11-systems` (worktree `/tmp/wt-cyc11-systems`), cut from `claude/animal-crossing-game-7z3roh` at `bd92da2`. Not pushed. Static server: port 9115.

## 1. ID-54 drag-anywhere move (built)
Approved by U (cycle 9 conditions, cycle 10 final review and spec in IDEAS.md). I followed the U cycle 10 spec and the cycle 9 conditions. The "L conditions" I could find are only L's cycle 9 note that it "stays proposed"; U's cycle 10 review replaced that note.

**What changed**
- `game/shared/mm-move-float.js` (new, global `MMMoveFloat`): one stick binding, used for both sticks on the Mad Maze Realm page (`mad-maze.js`) and in the Town's Realm (`main.js`). With the pref off it does exactly what the old inline `stick()` did (same MAXR 46, same listeners, same `apply(x, y, on)` calls). The old inline helper is still there as a fallback if the script fails to load.
- With `mm-move-float` = `'1'` on a touch device wider than 300 px, a `pointerdown` on `#realm-canvas-wrap` can start a floating stick. All of these must hold:
  - the touch is left of the screen centre;
  - it is below the lowest visible top-HUD item in the left half (`#realm-hud`, `#realm-xp`, `#realm-boss`, `#realm-partner`, `#rw-zone`, `#rw-goal`, `#rw-jit`, `#rw-minimap`);
  - `elementFromPoint` is the game canvas.

  The stick then moves to the thumb with a CSS `translate`. Nothing else is re-laid out. On release it returns home and `moveVec` goes back to 0. A mouse never floats it. At 300 px wide or less the option is ignored.
- Look: only while the option is active (`html[data-move-float]`, set by the helper on load, resize, `storage` and `mm-settings-change`). The move stick becomes a 2 px `rgba(255,241,232,0.35)` ring on a see-through base, with an opaque `--px-7` (#fff1e8) cap in a 2 px `--px-ink` outline (`realm-8bit.css`, appended at the end). With the option off, the pixel-art stick is unchanged.
- Settings (`shared/mm-settings.js`): a new row "Move from anywhere: The left stick starts where your thumb lands." It sits in Play after Aim assist. It is `role=switch` with `aria-checked`, so a screen reader hears its state. It is shown only on touch devices (coarse pointer, `ontouchstart`, or `body.touch-device`).
- Save and Backup: `mm-move-float` is a device pref in localStorage only. It is never written into `pixeltown-save-v1`. It joins `MMBackup` FLAG_KEYS and NAMES ("move from anywhere setting"), like `mm-aim-assist`. It is also listed in `design/SAVE-KEYS.md`.
- Cache versions: `main.js`, `realm-8bit.css` and the new script got `?v=20261125c11` in `game/index.html`. The Mad Maze page loads the new script with the same tag.
- IDEAS.md: the ID-54 status is now built. I edited only the approved row.

**Deviations from the spec**
- The spec asks for CSS `left/top`; I used `transform: translate`. The stick is positioned with `left` + `bottom` in four stylesheets, so setting `top` would fight them. Translate also does no re-layout and keeps `getBoundingClientRect` correct for the existing knob maths.
- The Settings hint wraps to 2 lines at 390 px. It is still one sentence.

**Check actually run**: `node game/tests/cyc11-s-move-float.test.js` on port 9115.
- **Before the change** (tracked edits stashed): **13 FAILED.** These were the Settings row, the Backup key, the ring look at 390x844 and 844x390, the float, the drag and the cap pixels. The pref-off, HUD-control and 195x422 checks already passed, as they should.
- **After the change: ALL PASSED** (two runs; the second added the Town Realm section). The test covers:
  - **Settings (touch):** the row exists, has `role=switch`, is at least 44 px and starts off; a tap sets `aria-checked=true` and `mm-move-float=1`.
  - **Settings (desktop):** no row.
  - **Backup:** `FLAG_KEYS` lists the key and a real `bundle()` carries it.
  - **390x844 and 844x390, pref on, real CDP touches:**
    - A bare-ground touch puts the stick centre within 2 px of the thumb, with `moveVec` 0.
    - A 40 px drag gives `moveVec.x` 0.87, and the hero moved 106 px.
    - On release the stick is home and `moveVec` is 0.
    - A touch right of centre or in the top band does not float.
    - A touch-start on gear, Daily, abilities 1-4, mini-map, bag, board, Menu and Leave reaches that control and never floats the stick (`moveVec` 0).
    - A real ability tap casts and a real bag tap opens the backpack.
  - **Cap colours (screenshot pixels):** fill #fff1e8, outline #0e101b/#0e101c. The worst contrast against the Shore sand + grass PAL colours is 4.42:1. Against the ground pixels next to the ring it is 7.76:1 (390x844) and 9.14:1 (844x390).
  - **Pref off at 390x844:** no attribute, the pixel stick is kept, a bare-ground touch does nothing, and the fixed stick still drives `moveVec.x` 1.00.
  - **195x422, pref on:** ignored, no float.
  - **Town Realm, 390x844:** offline join, then `enterRealm`. A bare-ground touch floats the stick, a drag drives the Town Realm's `moveVec.y`, and release brings it home.
  - Every page had 0 database attempts and no page errors.
- **Related existing tests run after the change, all green:** `beta-w13-joystick` 7/7, `realm` 25/25, `shared-mm-settings` 62/62, `beta-r4-o04-backup` 20/20, `cyc4-ui-assist-settings` 42/42, `realm-phone-layout` 78/78, `nav-settings` 46/46, `shared-mm-profile-backup` 51/51. `cyc4-ui-assist-settings` rewrites its own screenshot `cyc4-ui-assist-after.jpg`; I reverted that file so it is not in the commit. I did not run the full stamp (the coordinator runs it).
- **Screenshots:** `game/design/beta/img/`
  - `cyc11-systems-float-390x844.jpg`, `cyc11-systems-float-844x390.jpg`: the stick floating at the thumb.
  - `cyc11-systems-town-realm-390x844.jpg`: the same in the Town's Realm.
  - `cyc11-systems-195x422.jpg`: pref ignored.
  - `cyc11-systems-1280x720.jpg`: desktop, no sticks, attribute not set.
  - `cyc11-systems-settings-390x844.jpg`: the row, ON.
- The test is registered in `test-tiers.json` (full tier, browser, 600 s).

## 2. ID-58 sleeping-neighbours hint: skipped
IDEAS.md still has it as `proposed`. D's cycle 10 review recommends it as priority 1, but no L or U approval is recorded, so I did not build it.

## 3. ID-05 / ID-10 / ID-11: not attempted
All three are approved-spec and size M. After ID-54 and its test runs there was not enough of the 60-minute box left for another M item with a before/after test. I did not start any of them.

## Unresolved / notes
- The cap contrast was measured on sand only: the bare-ground point the test picks landed on Shore sand at both viewports. Grass is covered only by computing against the realm-world PAL grass colours, not by on-screen grass pixels.
- Dungeon mode (`body.dungeon-mode`) uses the same binding on the Mad Maze page, but I did not test it in a browser.
- The free-area rule uses `elementFromPoint`, so any future HUD element over the canvas keeps its taps automatically. A new top-HUD band item in the left half needs to be added to `TOP_SEL` in `mm-move-float.js`.

## Proposals
- U: decide whether the Settings hint should be shortened to fit one line at 390 px (for example "Stick starts where your thumb lands.").
- U: consider making the aim stick float too (right half), behind the same pref. It is not in this spec.
