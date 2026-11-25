# Cycle 8 - U (UI/UX) report

Branch `cyc8-ui`, cut from the tip at 4109161 (CYCLE-LOG: cycle 7). Port 9802. To run the new checks against the old code, a `git archive` of 4109161 was served read-only on :9812. Nothing was pushed. Firebase stayed blocked in every run: the Town checks ran offline (`offlineStub`, `db.attempts() === 0`), and every other page ran under `blockDb` with 0 attempts. I did not touch the Realm HUD 'Resting' chip or the Town Dailies bounties (owned by S), `net.js` or `firebase-config.js`.

## 1. Town phone Menu: the corner Menu replaces "Where to?" on phones (cycle-7 proposal, done)
- **`main.js`**
  - `TOWN_NAV` is now `{ page: 'town', hideMenu: false }`, so the shared corner Menu (`#mm-nav-btn`) mounts on every screen.
  - On a phone (`townNarrow()`: 600 px wide or less, or a landscape phone 500 px tall or less), `body.town-phone-nav` is set at load.
  - "Where to?" keeps all its code and stays in the DOM. Desktop keeps both ways into the sheet.
- **`style.css`** (the cyc8-ui block at the end):
  - `body.town-phone-nav #where-to-btn` is hidden, so the phone panel loses that piece and the HUD diet stays at 10 or fewer.
  - **Bag bar, 720 px wide or less.** It starts right of the Menu (`--mm-nav-left + --mm-nav-btn-w + 8px`), with `max-width: 100vw - Menu - 32px - 134px`. The 134 px is the In-town chip plus its gap. `setupBagBar` already drops the oldest count when the row is too wide, so 4-digit counts still fit.
  - **People panel expanded** (it takes up to 46vw at the top right):
    - The folded bag shows only its 44 px bag button.
    - An opened bag wraps inside `54vw - 32px - Menu`.
  - **300 px wide or less (200% zoom):**
    - The people panel spans the space right of the Menu. Expanded, it uses `width: auto`; before, a fixed 180 px ran off the 195 px screen.
    - The bag bar hides while the panel is expanded. Before this change, the expanded panel also lay over the bag bar at 195 px.
  - **160x284:** the folded bag (one 44 px button) sits under the Menu, so the people chip keeps the width right of the Menu.
- **Tests updated honestly** (every behaviour still covered, and each commit names the intended change):
  - `nav-town`: phones must now **also** have the corner Menu top-left (at least 44 px, on top, controlling `mm-nav-sheet`, overlapping no bag bar, In-town chip, pointer or walkie). "Where to?" must have left the phone panel. Every sheet check (14 places, current page, links, HTTP 200, Esc focus return, ✕) now runs from the Menu the phone has. Desktop keeps the "Where to?" checks and the corner Menu checks.
  - `phone-panel`:
    - "Where to?" under the chip became: the corner Menu is visible top-left, on top and at least 44 px, and "Where to?" is gone.
    - The HUD overlap check and the expanded and settings-open overlap checks now include the Menu. This check is stronger than before.
  - `cyc7-ui-hud`: the phone branch now checks the corner Menu the same way as on desktop (top-left, 44 px, on top, no overlap, opens the sheet, Esc returns focus to it). It also waits for `MMNav.mounted()` before measuring, because on a loaded box the Town `create()` can finish after the HUD shows (that flake hit 1280 once and 390 once).
  - `town-first-ten`: the one-tap sheet check taps the corner Menu on phone profiles. `#mm-nav-btn` was added to its HUD overlap list.
  - `smoke-journey`: at 390 the Town check requires the shared Menu, and the sheet opens from it. At 1280 it requires both buttons.
  - `town-8bit-menu`: at 390 the corner Menu must stay visible and at least 44 px; at 1280, "Where to?".
  - The a11y sweep needed no change (it already accepts `#mm-nav-btn`).

## 2. Pop at 195 px and Realm Daily at 260 px or less
- **Pop** (`pop.css`, 300 px wide or less): a 9-character value (`1,234,567`) at the 12 px floor is 65 px wide, and the box gave it 61 px. The stage side padding went from 16 to 8 px, the HUD gap from 10 to 6 px, and the HUD padding to 0. Measured at 195x422: Score and Best text spans 14..79 inside a box of 10..93 (4 px padding). Before, the text ran 26..91 against an inner right edge of 87.
- **Realm Daily** (`mad-maze.css`, portrait, 260 px wide or less and 460 px tall or less): Daily moved to the free top of the left column (8..60 x 150..194), left of the gear and under the XP bar. The zone line moved under it (top 198). The Next-goal text follows the zone line through the existing `goalPlace()`, and both lines are text with `pointer-events: none`.
  - At 195x422, Daily now sits **124 px** above the move stick (it was 12 px). The goal text ends at 298 and the stick starts at 318.
  - Taller screens 260 px wide or less (240x480, 260x520) keep the cyc7 spot, which is already 70 px or more above the stick.

## 3. Retest-3 P3 UI items
- **Pop hint peeking under the result card (b09-r3-01):** while `#result` is up, `#keys` and `#goal` (grey lines under the board) are `visibility: hidden` (`#stage:has(#result:not([hidden]))`). They come back with the next round, and the test checks that.
  - Before: at 195x422, `#goal` straddled the card's bottom edge (500..530 against a card bottom of 512).
  - My 390x844 scenario did not reproduce the peek on the old code. The tester's 390 screenshot had a longer card (new medals). The rule covers both cases.
- **Hub "Next step" focus ring (b15-r3):** `.home-next:focus-visible` now draws a 3 px gold outline with a 2 px offset, the same pattern as Play. Before, it only changed the border colour and kept `outline: none`, which is what the tester's script reported.
- **"Focus ring" on the bare pages Dash/Echo/Pop/Stack/Isles (b15-r3-V09):** not changed, on purpose. The tester's own trace (`Sound > canvas > Got it > Menu > BODY`, then the cycle repeats) shows the BODY stop comes right after the last control in the DOM (the corner Menu, appended at the end of `<body>`). This is the browser's own stop when focus leaves the document (the address bar in a real browser; `body` in headless Chromium). Removing it would need a focus trap on a normal page, which is a keyboard trap (WCAG 2.1.2). Every control itself has a visible ring. Proposal: the tester should treat a stop after the last control as browser chrome. I did not write a test for this reasoning.

## Checks actually run (all through /tmp/bt.sh, own server :9802; old code on :9812)
| Item | Check | Result |
|---|---|---|
| 1-3 | **`cyc8-ui.test.js`** (new, registered in test-tiers.json, `full`):<br>- Town offline at 390x844, 360x640, 667x375, 195x422, 160x284 and 1280x720 (corner Menu, "Where to?" gone on phones, no top-HUD overlap incl. 4-digit counts, panel expanded, bag opened over the expanded panel, the Menu opens the sheet, 0 DB attempts).<br>- Pop at 195 with a 9-character value.<br>- Pop result card at 390 and 195: no peeking line, and the keys line comes back.<br>- Realm Daily at 195 is 40 px or more clear of the stick and overlaps nothing.<br>- Hub Next-step outline. | Against the old code (4109161 on :9812): **20 FAILED**. Against this branch: **ALL PASSED** |
| 1 | `nav-town`, `phone-panel`, `town-8bit-menu`, `town-first-ten`, `smoke-journey`, `cyc7-ui-hud` (updated as above) | First run of the old tests on the new code: `nav-town` 3 FAILED and `phone-panel` 9 FAILED (6 of those were a real regression: the wider bag bar under the expanded panel at 390 and 360, fixed in CSS). After the updates and fixes: **ALL PASSED** each |
| 1 | `a11y-viewport-sweep` `PAGES=town,pop,hub` (all 8 viewports + preference passes) | **ALL PASSED** (final code) |
| regression | `cyc1-ui-town-hud`, `cyc2-ui-town-narrow`, `cyc3-ui-town-first-visit`, `cyc6-ui-town-ac`, `beta-r4-d4-mobile`, `beta-r4-d4-town`, `town-isles-sign`, `nav-town-p2`, `cyc4-ui-town-zoom-goal`, `pop-page`, `hub-home`, `cyc6-ui-195-results`, `cyc4-ui-realm-195`, `realm-phone-layout`, `nav-realm`, `daily-seed`, `ftue-ft2` | **ALL PASSED**. `cyc6-ui-town-ac` failed once in the final batch ("Tools open: ... nothing on the joystick" at 390, the bottom-right buttons, which this change does not touch). It passed in the first batch and again on a single re-run, so I count it as a load flake. |
| - | Not run | The full stamp (the coordinator's job) |

Screenshots (`game/design/beta/img/`):
- Town: `cyc8-ui-town-menu-{390x844,360x640,667x375,195x422,160x284,1280x720}.jpg`
- Pop result: `cyc8-ui-pop-result-{390x844,195x422}.jpg`
- Realm: `cyc8-ui-realm-daily-195x422.jpg`

## Unresolved
- Pop at **160x284** (a 320 px phone at 200% zoom) still overflows a 9-character value by 4 px. The value box is 65 px. Only 195 px was in scope.
- Real-device touch was not tested.
- A desktop window resized down to phone width keeps the load-time choice (`town-phone-nav` is set at load, the same as `TOWN_NAV` was in cycle 7). It shows both "Where to?" and the corner Menu, which is harmless.

## Proposals
- The Pop score is drawn as `String(n)` (no thousands separators), while the result card uses `MMMiniKit.fmt`. One formatter for the HUD would make the 9-character case real and consistent; the HUD now has room for it.
- Close b15-r3-V09 as "browser chrome stop" (see section 3), or ask the tester to confirm in a headed browser.
