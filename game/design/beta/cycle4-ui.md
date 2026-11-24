# Cycle 4, U (UI/UX)

Branch `cyc4-ui` (from `claude/animal-crossing-game-7z3roh` 385efc3). Own server on 9742, every browser run through /tmp/bt.sh,
Firebase blocked (Town through `helpers.offlineStub` with `db.attempts() === 0`; other pages `blockDb`). Targeted tests only. Not pushed.
The machine ran at load factor 4.4 to 6.5 all cycle, so each browser test took 1 to 5 minutes.

## Fixed this cycle
| Item | Fix | Check (fails before / passes after) |
|---|---|---|
| 1 ID-06 assist UI | `shared/mm-settings.js` + `.css`: an "Assist" sub-heading in the Play group with two step controls: **Damage taken** 100 / 90 / 80 / 70 / 60 / 50 % (6 steps) and **Aim help** Off / Light / Medium / Strong. Each is a `role=radiogroup` labelled by its visible label, and the label shows the value ("Damage taken: 80%"). The steps are `role=radio` buttons, 44x44 px minimum, with a ▸ mark on the chosen step (a shape as well as the colour). The group has one Tab stop (roving tabindex); arrows, Home and End move and select; tap or click selects. A polite live region says the new value. "Reset assist" shows only when a value is not the default. The sheet's yellow focus ring is used. `MMSettings.assistTag()` makes the "Assisted" tag (text, 12 px minimum, 2 px outline, title says what was used) and `.mm-assisted-tag` styles it; S places it on summaries. | new `cyc4-ui-assist-settings` (model + 1280x720 keyboard, 390x844 and 195x422 touch): crashes before (no model), ALL PASSED after; `shared-mm-settings`, `shared-mm-access`, `nav-settings`, `realm-settings` green |
| 1 pref contract | Read `git show cyc4-systems:game/design/beta/cycle4-systems.md` (S, 0fbd1a3). The two match: key `mm-assist` = JSON `{dmg, aim}`, dmg in 6 steps (default 100), aim 0..3, cleaning (round, then clamp; unknown fields dropped), and only `dmg < 100` makes a run "Assisted". When the page has loaded S's `MMAssist`, the rows read and write through it; otherwise a fallback with the same rules runs (S: "or guard with typeof MMAssist"). | same test: hostile `{dmg:5, aim:"x"}` reads 50/0, 74/7 reads 70/3, and the rows call `MMAssist.write` when it is loaded |
| 2 Realm 195x422 | `realm-ui.css` (260 px or narrower): the info line (Lv + Shards) gets its own slot in the free gap between the Board / Menu row and the XP bar, left of Leave (x 64..139, y 102..124). The mini-map thumbnail is 44x44 in the right column under Leave and still opens the 192 px map. Before this, the mini-map covered Shards and the XP bar's right end, and the zone line covered "Lv": no part of the info line could be read. | new `cyc4-ui-realm-195` (paint-order hit test at each part's centre): 2 fails before at 195x422, ALL PASSED after at 195x422 and 260x563. `realm-phone-layout`, `cyc1-ui-realm-hud`, `cyc1-danger-meter` green; sweep `PAGES=realm-world,realm-dungeon` (all viewports) and `PREFS=text-200`: 0 offenders |
| 2 Goal at 200% zoom | `style.css` (300 px or narrower, taller than 420 px): the Realm Gate chip was `display:none` and is now a compact goal card (124 px wide) in the free left column under the bag bar, above the stick and left of the action column. The words wrap and the 44 px close button sits under them. The card steps aside while the bag, the people panel, the emote picker or the Tools tray is open. | new `cyc4-ui-town-zoom-goal`: 9 fails before (hidden at 195x422, 260x563, 300x650), ALL PASSED after; `cyc2-ui-town-narrow` caught the emote picker overlap first and is green after the follow-up commit; `cyc3-ui-town-first-visit` green; sweep `PAGES=town PREFS=text-200`: 0 offenders |
| 2 Notebook focus | `realm-world.js`: when the quest board or the stall replaces an open notebook while focus is inside it, focus moves to the new panel's first button. Before, it fell to `<body>` because the notebook is emptied. Focus anywhere else is left alone. | new `cyc4-ui-notebook-focus` (1280x720 keyboard + 844x390 touch): 5 fails before, ALL PASSED after (includes "focus elsewhere is not stolen" and a visible ring) |
| 4 Turnip price contrast | `main.js`: the Shop's "sells N ⭐ / 10" label keeps G's #6fbf73 and gets the same dark 3 px outline (#1c2430) as the stall's buy price. Fill vs outline is 6.9:1; before, there was no outline (the default stroke was #fff, thickness 0). | new `cyc4-ui-turnip-contrast`: 1 fail before, ALL PASSED after |

## Screenshots (game/design/beta/img, all under 50 KB)
`cyc4-ui-assist-after.jpg` (390x844 sheet; the "before" image would be the same sheet without these rows), `cyc4-ui-realm-195-before/after.jpg`,
`cyc4-ui-town-195-goal-before/after.jpg`, `cyc4-ui-turnip-before/after.jpg`.

## Design calls and deviations (please read)
- **Assist placement.** The cycle 2 spec asked for a new "Assist" group between Text size and Sound. Instead the controls sit inside the Play
  group under an "Assist" sub-heading, for two reasons. First, existing tests pin the group list (`shared-mm-settings`: Play,See,Hear,Help; `nav-settings`:
  see,hear,help on the Hub; `shared-mm-access`: GROUPS titles), and those must not be weakened. Second, assist only changes the Realm and dungeons,
  and Play is the group that pages without combat hide. The cost: on the Hub (`play:false`), assist is not shown. The Town shows it under
  "Realm combat".
- **Radio group, not range input.** The brief allowed either. Buttons give 44 px targets by touch and the same pattern as Text size, and the value
  is in the visible label.
- **Aim help vs the old "Aim assist" toggle.** Both stay. S defines aim level 0 as the old 14 degree cone, so the toggle (on/off) and the strength
  steps add up. A later cycle could merge them into one control (proposal; needs S).
- The death-card link "Assist options" from the cycle 2 spec is not built (S owns the Realm summary/death card; `MMSettings.assistTag` is ready for it).

## Not done / open (time box: started 16:41, stopped new items at 17:18)
- **Town desktop panel collapsed by default for NEW profiles.** Not started. The collapse CSS only exists under `PANEL_PHONE_QUERY`, so a desktop
  collapsed state needs new desktop CSS for the chip. Many desktop tests click buttons inside the panel on a fresh profile (dailies, journal,
  museum, map...) and would need an `expandPanel` step. Next cycle, with a list of those tests made by grep.
- **Fish Tourney 3-line sign icon offset** (8.5 px text shift past the board edge). Not started.
- **Keyboard / focus pass at 1280x720 and 844x390** for each page's primary flow. Not started as a pass. The new tests cover the Settings sheet (Tab, arrows, Esc,
  focus return) and the Nexus board/stall focus at both sizes.
- 160x284 (a 320x568 phone at 200% zoom) still hides the goal chip: there is no free column at 420 px tall or shorter. Where to? still lists the Realm.

## Tests
New, registered in `test-tiers.json` (browser, full): `cyc4-ui-assist-settings`, `cyc4-ui-realm-195`, `cyc4-ui-town-zoom-goal`,
`cyc4-ui-notebook-focus`, `cyc4-ui-turnip-contrast`. Regression runs listed in the table, plus `run-all-tiers`, `live-safety`,
`cyc3-ui-notebook`, `cyc2-notebook`, `cyc3-ui-town-labels`, `shared-mm-settings` at the end (results in the final report).
