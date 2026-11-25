# Cycle 7 - U (UI/UX) report

Branch `cyc7-ui`, cut from `claude/animal-crossing-game-7z3roh` at 490ca71. Port 9702 (the cycle-6 tip was also served, read-only, from a `git archive` copy on :9712 to run the new checks against the old code). Not pushed. Firebase stayed blocked in every run: `blockDb` on every page, and `offlineStub` with `db.attempts() === 0` in the Town checks.

## 1. a11y at 195x422: 36 offenders fixed, viewport now permanent (allow-list still `{}`)
`a11y-viewport-sweep.test.js` now has an 8th viewport, `195x422` (touch). Re-running cycle 6's experiment on this branch's base first reproduced the same 36 offenders (`VPS=195x422`: 37 FAILED). The fixes:

- **Text under 12 px at <= 300 px wide.** These were mostly `min(..., Nvw)` sizes that dropped under 12 px at 195. They now have a `max(12px, ...)` floor, or the fixed 10/11 px became 12 px:
  - `shared/mm-8bit-arcade.css`: Sound button, HUD labels, and the shared HUD value (Stack's 9 px digits).
  - `games/pop/pop.css`: Pop's 3.9vw digits were 7.6 px. They now have a 12 px floor, with 4 px side padding in the two-column HUD. Checked: `123,456` fits its box (right edge at 76 of 91 px). Dash and Echo keep their own 20 px values. A first version of the floor overrode those values down to 12 px; I caught it with a probe and fixed it.
  - `games/festival/bugs.css` and `games/jam/jam.css`: Sound button. In Jam, also the title, HUD and song line (10/11 to 12 px).
  - `games/deepdelve/deepdelve.css`: title, tool row, HUD, thumb buttons and coach line (10/11 to 12 px). The coach line also got tighter lines and 6 px more width, so it stays under the HUD. `cyc5-ui-195-jam-deepdelve` caught the first try (`hud/msg` overlap) and then passed.
  - `game/style.css` (<280 px one-column Town strip): Emotes and Tools went from 11 to 12 px. The buttons stay 48x44, so `cyc6-ui-town-ac` (160x284) is unchanged.
- **Hidden-element readings (the 0 px ones), done properly instead of with `font-size: 0`:**
  - **Realm Leave** (`mad-maze.js` `leaveLabel`, `realm-ui.css`): the word is now `<span class="leave-word">` and is hidden with `display: none` at <= 260 px. `textContent` is still "✖ Leave". This also fixes a latent bug: with `font-size: 0`, the ✖ fallback was blank when the icon image failed.
  - **Isles how-to** (`isles/index.html`, `isles.css`): "How to play" is wrapped in a span and hidden with `display: none` in the compact 195 card. The Tips button now says "Tips" at 12 px, where it used to show a '?' glyph under 0 px text.
- **Hub map has no visible h1**: this was a real layout bug. At 195 px the header squeezed the place name into a 39 px column, so it broke letter by letter and the h1 rose to y=-66, above the screen. Fix in `hub/hub.css`, at <= 300 px: the stats move to their own row, and the name and world lines get the full width right of the Menu button.

## 2. Town Menu top-left and Realm Daily / gear
- **Town** (`main.js`, `style.css`). Done on wide screens only; phones still use "Where to?" (see below).
  - **Wide screens** (> 600 px, and not a landscape phone 500 px tall or less):
    - The shared corner Menu (`#mm-nav-btn`) is now top-left in the Town, the same as on every other page.
    - "Where to?" opens the same `#mm-nav-sheet`, and both buttons track `aria-expanded`.
    - A sheet opened from "Where to?" hands focus back to "Where to?" when it closes. Without this, MMNav sends focus to its corner button; `nav-town` caught it.
    - The corner button sits at `--mm-nav-z: 19`, under every Town overlay (z 20+), and is hidden while the join card is up.
    - Before the sheet opens from the corner, open Town overlays are closed, the same as with "Where to?". Build mode's banner layout counts the button.
    - A single `TOWN_NAV` mount config is shared with the join card's compass. `index.html` needed no change.
  - **Phones** (<= 600 px, or a landscape phone 500 px tall or less): no corner button yet. "Where to?" stays the Menu, as before. I built the phone version first, and the regression batch rejected it:
    - `phone-panel`: the HUD diet guard allows at most 10 HUD pieces at 390 and found 11.
    - `phone-panel` at 360 and 390: the bag bar, moved right of the Menu, ran into the In-town chip and the expanded panel.
    - `cyc3-ui-town-first-visit` and `town-8bit-menu`: panel overlaps.
    - the a11y sweep at 667x375: the bag icon sat under the Menu.
    - On phones the corner button only fits once "Where to?" leaves the phone panel and the bag bar gets narrower. That is a design decision; see Proposals.
  - `nav-town.test.js` asserted "the Town has no corner Menu button (one HUD)". The assertion is now split by screen: on desktop the corner Menu must be present, top-left, >= 44 px, and control the same sheet; on a phone it must still be absent. This is an intentional design change (cycle-6 proposal U-01, standing owner decision), not a weaker test.
- **Realm world, touch portrait** (`mad-maze.css`, CSS only):
  - From 261 to 600 px, the gear and the Daily link move to the right column under the mini-map, above the ability pad. Before, the gear sat bottom-centre between the sticks and Daily sat above the left stick.
  - At <= 260 px the right column is full, so the gear sits left of the mini-map. Goal and zone text are capped at 77 px so they clear it. Daily sits in the free band under the goal text (b15-r3-04: Daily is no longer on the Next-goal text). It is still above the move stick there, with a 12 px gap; there is no other free spot at 195.
  - The dungeon (its own bottom row), landscape and desktop are unchanged.

## 3. Retest-3 P3 (UI-only)
- **b15-r3-05, Stalk at 195 px: tab labels broke inside words ("BEL LS", "STA LKS OWN", "WEE K PRO").** In `stalk.css`, under 300 px, the three stat boxes stack as slim rows (label left, value right) and words stay whole.
- Not done (time box): Pop hint peeking under the result card, bare-page Tab stops without a focus ring, and the Hub "Next step" focus ring (b15-r3).

## Checks actually run (all through /tmp/bt.sh, own server :9702)
| Item | Check | Result |
|---|---|---|
| 1 | `a11y-viewport-sweep.test.js`, `VPS=195x422`, on the old CSS (before the fixes) | 36 offenders, **37 FAILED** |
| 1 | the same run after the fixes | **ALL PASSED** (0 allowed, 0 seen) |
| 1 | full `a11y-viewport-sweep.test.js` (all 8 viewports + preference passes) | see Regression batch |
| 2, 3 | `cyc7-ui-hud.test.js` (new, registered in test-tiers.json). Town at 1280x720 / 390x844 / 195x422: no corner Menu on the join screen; after joining, Menu top-left, >= 44 px, on top, nothing overlapping it; Menu and "Where to?" open the same sheet; Esc closes; 0 DB attempts. Realm world at 414x896 / 390x844 / 360x640 / 320x568 / 195x422: gear and Daily not in the band between the sticks and overlapping no stick, pad, mini-map, goal/zone text or control; right column above 260 px; desktop 1280 unchanged. Stalk 195 / 390: no word split across lines. | Final version against the cycle-6 code (a `git archive` of 490ca71 on :9713): **14 FAILED** (Town corner Menu missing at 1280, gear between the sticks at all 5 phone sizes, not in the right column at 4 of them, gear on a stick at 195, Stalk words split). Against this branch: **ALL PASSED** |

Screenshots in `game/design/beta/img/`:
- Town: `cyc7-ui-town-menu-{1280x720,390x844,195x422,667x375}.jpg` (corner Menu on 1280; the phones show the unchanged HUD);
- Realm HUD: `cyc7-ui-realm-hud-{414x896,390x844,360x640,320x568,195x422,1280x720}.jpg`;
- Stalk stats: `cyc7-ui-stalk-stats-{195x422,390x844}.jpg`;
- 195 px a11y fixes: `cyc7-ui-a11y-{hubmap,pop,deepdelve,isles,jam}-195x422.jpg`.

## Regression batch
Every run was on :9702 through /tmp/bt.sh.

**Passed:**
- full `a11y-viewport-sweep` (8 viewports): every page view passed except one Town offender, from the phone Menu that was later withdrawn. After that, a `PAGES=town,pop,stack,dash,echo` re-run passed in full: **ALL PASSED**.
- Town: `cyc7-ui-hud`, `nav-town`, `nav-town-p2`, `phone-panel`, `cyc3-ui-town-first-visit`, `town-8bit-menu`, `beta-r4-d4-town`, `beta-r4-d4-mobile`, `cyc1-ui-town-hud`, `cyc2-ui-town-narrow`, `cyc6-ui-town-ac`, `cyc4-ui-town-zoom-goal`, `town-first-ten`.
- Realm and Hub: `realm-settings`, `nav-realm`, `ftue-ft2`, `daily-seed`, `realm-polish3`, `cyc4-ui-realm-195`, `realm-phone-layout`, `cyc1-ui-realm-hud`, `beta-w05r3-hud-narrow`, `world-page`, `dungeon-polish`, `nav-sheet`, `hub-home`.
- 195 px pages: `cyc5-ui-isles-compact`, `cyc5-ui-195-jam-deepdelve`, `cyc6-ui-195-results`.
- Arcade: `pop-page`, `stack-page`, `dash-page`, `echo-page`, `beta-w09-arcade-layout`.

**Failed first, then fixed and passed on re-run:**
- `cyc5-ui-195-jam-deepdelve`: the Deepdelve coach line overlapped the HUD at 12 px. Fixed with tighter lines.
- `nav-town` (focus did not return to "Where to?"): fixed by the focus hand-back.
- `phone-panel`, `cyc3-ui-town-first-visit`, `town-8bit-menu` and the a11y sweep at 667x375: fixed by withdrawing the phone corner Menu.

Not run: the full stamp (that is the coordinator's job).

## Unresolved
- At 195 px, Pop's value box fits `123,456` but not a 9-character `1,234,567` best at 12 px. At 7.6 px it fitted, but that size was unreadable. The tester's b09-12 check was at 390 px, which is unchanged.
- At <= 260 px, Daily still sits above the move stick, with a 12 px gap. The right column is full (Leave, mini-map, ability pad).
- Town corner Menu on phones is not done (see section 2 for why). On desktop, "Where to?" and the corner Menu are two ways into the same sheet.
- P3 not done: Pop hint peeking, focus rings on bare pages and the Hub "Next step".
- Not tested: real-device touch; landscape Realm (unchanged by design).

## Proposals
- Phone Town Menu, a small next step:
  1. Drop "Where to?" from the phone panel, so the corner Menu takes its HUD-diet slot (still 10 pieces).
  2. Cap the phone bag bar at `100vw - reserve - chip - gaps`, or move it under the Menu.
  3. Then set `hideMenu: false` for phones in `TOWN_NAV`.

  About 10 tests tap `#where-to-btn` at 390, so they need to move with it.
- At <= 260 px, give the Realm one compact "More" chip that holds Daily and Settings, so nothing sits above the stick.
