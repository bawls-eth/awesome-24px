# Cycle 2, U (UI/UX)

Branch `cyc2-ui` (from `claude/animal-crossing-game-7z3roh` 2b40e79). Own server on 9722, every browser run through /tmp/bt.sh,
Firebase blocked (Town through `helpers.offlineStub`, `db.attempts() === 0` asserted; other pages `blockDb`). Targeted tests only.

## Fixed this cycle
| Item | Fix | Check (fails before / passes after) |
|---|---|---|
| U-09 | Town, < 280 css px (160x284 = 320x568 at 200%; 195x422 = 390x844 at 200% + 150% Text size): the stick is 88 px and the strip is ONE column on the right edge (Emotes, Tools, A, C). Tools (B / Tilt / Photo) and the emote picker open as a second column; the stick steps aside (visibility hidden) only while one of them is open. 390x844 and up unchanged | new `cyc2-ui-town-narrow`: 11 fails before, all pass after. `cyc1-ui-town-hud`, `beta-r4-d4-mobile`, `town-8bit-menu` green |
| U-10 | Realm phone (<= 560 px) info line no longer repeats the zone name the zone line shows; desktop keeps it | new `cyc2-ui-copy` (U-10 checks fail before); `world-page`, `realm-phone-layout`, `cyc1-ui-realm-hud` green |
| Jam copy | On a coarse pointer, How to play and the `#help` line use touch wording ("Tap the pad under each lane...", "The Menu button pauses the song"); keyboard players keep "Keys D F J K" | `cyc2-ui-copy` Jam checks (3 fail before); `jam-page`, `jam-first-visit`, `jam-bugbash` green |
| U-06 (tap) | The a11y sweep's 200% pass (195x422, touch) now also records tap targets < 44 px. It found 8 real offenders, all fixed (no allow-list): Jam pads 39 px (ring moved inside, gap 3), Deepdelve tool buttons 43 px, Lantern class picker 24 px (wraps under the art), Hub Collections chip 43 px | `PREFS=text-200 VPS=390x844` sweep over all 16 pages: 8 offenders before, 0 after; allow-list stays `{}` |

New env on the sweep: `PREFS=text-200` runs only that preference pass (targeted runs); a full run is unchanged.
Screenshots: `img/cyc2-ui-u09-160-before.jpg` / `-after.jpg` / `-emotes-after.jpg`, `img/cyc2-ui-u10-realm-390-before.jpg` / `-after.jpg`,
`img/cyc2-ui-jam-touch-before.jpg` / `-after.jpg`.

## U-06 overlap check: built, opt-in, 4 real offenders open
`OVERLAP` in the sweep (visible controls and drag areas covering each other, clipped by overflow parents, full-screen game views
excluded as in the Menu check) runs with `A11Y_OVERLAP=1`. It is not gated yet because it finds real layout bugs I could not fix in
the time box; they are NOT allow-listed:
| page | at 195x422 | owner |
|---|---|---|
| realm-world | `#realm-leave-btn` covers `#rw-minimap` (72x44) | realm |
| realm-world / realm-dungeon | `#realm-ab-1` covers `#realm-aim-btn` (44x39) | realm |
| isles | `#btn-pack` / `#btn-soothe` / `#btn-fire` cover each other; `#acts` starts at x -41 and the 132 px stick runs under the fire button | isles |
Turn the check on (drop the env guard) once these are fixed.

## ID-06 Assist sliders: UI spec for S (no game-speed slider, per L)
**Placement.** The shared Settings sheet (`#mmset`, `shared/mm-settings.js`), new group "Assist" directly under "Text size" and above
"Sound", so it is reachable from every page's Menu. In the Realm also linked from the death card ("Assist options" text button, 44 px).
**Controls (two only).**
| control | element | values | label (visible) | help line (12 px min, under it) |
|---|---|---|---|---|
| Damage taken | `<input type="range" id="mmset-assist-dmg" min="50" max="100" step="10">` | 100 (default) to 50 percent | `Damage taken: 100%` (live value in the label, `aria-valuetext="100 percent"`) | "Lower = enemies hurt less. Realm and dungeons only." |
| Aim help | `<input type="range" id="mmset-assist-aim" min="0" max="3" step="1">` | Off / Light / Medium / Strong | `Aim help: Off` (`aria-valuetext` = the word) | "Nudges shots toward the nearest enemy." |
- A "Reset assist" text button (44 px) under the two sliders; hidden when both are default.
- Wording: never "easy mode"; no score, medal or best is hidden. Runs with any assist get a small "Assist" tag on the run summary (text, not only colour).
**Accessibility.** Native range inputs (keyboard: arrows step, Home/End jump), each with a `<label for>`; track and thumb >= 44 px tall hit area
(`height: 44px` on the input, visual track 6 px); visible focus ring (the sheet's 3 px yellow outline); the value is in the label text so it
is read on change; changes apply at once (no Save button) and are announced through the sheet's existing polite live region once per
release (`change`, not `input`). Works at 150% / 200% text (the group wraps label over slider below 360 px). Respects high contrast tokens.
**Save.** Additive key inside the access prefs object (`pixeltown-access-v1`: `assist: { dmg: 100, aim: 0 }`), cleaned on read (clamp, step);
absent = defaults. S owns `_hitPlayer` scaling and aim nudge; U owns the sheet CSS.
**Tests S should add.** Node: clamp / defaults / hostile input. Browser: slider at 50 makes one hit take half; default unchanged; Tab reaches
both sliders inside the sheet, arrows change them, Esc closes the sheet and returns focus to the Menu button.

## Not done (time box)
- Item 2 new-player pass (b08-r2 / ROUND4-TRIAGE: Town first-visit HUD clutter, Home footer, first-minute goal on phone): not started.
- Item 3 audit of the cycle-1 additions at 1280x720 / 390x844 / 320x568 / 844x390 / 150% / 200%: covered only through the sweep's 200% pass
  and the narrow Town test (danger meter, bag bar, Town buildings not separately measured at 844x390).
- Item 4 keyboard / focus pass: not started beyond what the existing sweep keyboard pass covers.
- S's danger-meter CSS additions (`.rw-danger-ico`, 12 px floor, hud-big scaling, motion rule) already sit in `mad-maze.css` from the cycle-1 merge; not refolded into U's block this cycle.
