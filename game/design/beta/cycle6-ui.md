# Cycle 6 - U (UI/UX) report

Branch `cyc6-ui`, cut from `claude/animal-crossing-game-7z3roh` at 99036b7. Port 9602. Not pushed. Firebase stayed blocked in every run: `blockDb` on the Isles, arcade and Hub pages, and `offlineStub` with `db.attempts() === 0` checked in the Town test.

## What changed

### 1. Isles jungle at 195x422: a creature on the first screen (b05-r3-05, open since cycle 5)
File: `game/games/isles/isles.js` (`arrivalFill`, new `arrivalInView` / `freeOnScreen` / `uiRects`, `think`, `feedTarget`, the sighting check).

**Why it failed.** The one calm greeter stands 8.5 to 11 tiles out. That is 272 px or more, and half of a 422 px screen is 211 px, so at 195x422 it was always above the screen or behind the HUD.

**What it does now.**
- After the greeter is placed, the game checks whether its drawn box is fully on screen and clear of the UI. The UI here means the HUD, the how-to card, the minimap, the Map button, the Menu button, the action buttons and the stick. It is found from the DOM rects plus an `elementsFromPoint` sample.
- If the greeter is not clear, it moves to a free, walkable spot on screen. The ring distance is preferred when a ring spot is free. Otherwise it takes the farthest free spot at least 3 tiles out, or at least 2 tiles out as a last resort, leaning toward the nearest gather node.
- The check repeats on the spawn ticks for the first 3 s while the hero has not moved, because the HUD and the Menu button settle after the first tick.
- A greeter that was moved (`seeHold`) waits until the hero has walked 2 tiles. Until then it:
  - stands still and its taming clock does not run, so there is no "X is curious about you" toast;
  - brings up no Feed button and no taming line on the HUD (at 195 px either one pushed Soothe or the HUD over it);
  - closer than the 8-tile sighting radius, fires no journal sighting either, so no toast lands on the first screen.
- 1280x720 is unchanged (the ring spot was already free).
- At 390x844 the greeter now moves when its ring spot was under the stick, the HUD or the how-to card. Seeds 1 and 3 were hidden there before.
- Not changed: on seeds where far groups already exist (for example seed 7 or 9), no greeter is placed at all. See Unresolved.

### 2. Fixed Menu (compass) button and result cards
- **Dash, Pop and Echo result cards at 195 px** (b09-r3-05). In `game/shared/mm-minikit.js`, the kit's `focus()`, which every mini calls when its card shows, now also runs `keepClear(el)`:
  - A card in the page flow that sits in the Menu button's column is scrolled so that the card and its 12 px 8-bit ring start below the button.
  - Any other card is scrolled so it is not above the top edge.
  - Dash calls it again after its own `scrollIntoView`.
- **Stack** (b09-r3-05). Stack's card is position:fixed. `keepClear` moves it below the header and its ring and shrinks it to fit; it scrolls inside. At 195x422 it used to start at y=72, over the header (0-98) and the Sound button. It now starts at y=120. At 390 and 1280 it moves 14 px lower, because the ring touched the header there too.
- **Dash duplicates** (b09-r3-02). Files: `dash.js` and `dash.css` (`body.dash-over`).
  - While the result shows, the page "Goal:" line is hidden, because the card prints the goal itself.
  - The big green Jump button steps back to a quiet 48 px outlined "Run again". It is kept, not removed: one tap still runs the same course, which `dash-page.test.js` requires.
  - Both come back when a run starts.
- **Echo "+N IN BLOOM!"** (b09-r3-04). Files: `echo.js` and `echo-late.css`.
  - In portrait, a 38 px gap is reserved under the time bar, and the line sits in it, clear of the bar's frame and the board ring.
  - The board's height formula gives back those 38 px, so the 2x2 board still fits at 1280x720 (`beta-w10-echo-labels`).
  - In landscape (side by side), where the bar is not above the board, it keeps the old spot.
- **Hub Home scrolled under the Menu** (b08-r3-10). Files: `hub.css` and `home.js`.
  - The logo row is now a sticky band at the top of the Home scroll box: 58 px tall up to 700 px wide, 48 px above that, so desktop Home still fits unscrolled (`hub-home`). It is see-through at rest and opaque once Home scrolls (`.scrolled`).
  - Scrolled content passes under the band, never under the button.

### 3. Town HUD and Realm HUD: the smallest safe step
- **Town, implemented.** In `game/style.css`, on touch phones 280 px and wider, A (interact) and C (chat) are now 56x56 (they were 50x50). Emotes and Tools stay 64x50 and centre on the taller rows. The one-column strip under 280 px is unchanged. This is CSS only.
- **Town, proposed but not done** (it touches main.js / index.html HUD regions shared with other roles):
  - Put the shared Menu button (`#mm-nav-btn`) top-left in the Town, the same as every other page.
  - Make "Where to?" open that same sheet, so the top-right panel button can go.
- **Realm, not implemented this cycle** (time box). Proposal for the smallest safe step:
  - On touch portrait, move `a#mm-daily-btn` (now `left:10px; bottom:172px`, above the left stick) into the top HUD row next to Leave, or into the pause menu.
  - Move the settings gear from bottom-centre (between the sticks) to under the minimap at top-right.
  - Both are CSS-only in `mad-maze.css` / `realm-ui.css`. They need a test that the bottom band between the two sticks holds no control, and a check against b15-r3-04 (Daily over the Next-goal box at 195).
- **Realm hit-flash.** `game/design/beta/cycle6-art.md` did not exist when I checked, so I did not touch the hit-flash colour (it belongs to G).

### a11y sweep at 195x422: not feasible this cycle (honest)
I added 195x422 as an 8th viewport and ran the sweep for that viewport only (`VPS=195x422`, port 9602). It found 36 new offenders, and the allow-list must stay `{}`. So I reverted the viewport addition, and `a11y-viewport-sweep.test.js` is unchanged on this branch. Full log: /tmp/claude-0/-home-user-awesome-24px/1c877b74-6bb2-5379-bc4d-48cee4dc3073/scratchpad/u6-a11y195-keep.log.

Almost all of the 36 are text under 12 px that the narrow-screen CSS shrinks on purpose:
- arcade Sound buttons (11.7 px);
- arcade HUD labels (10.7 px);
- Pop HUD digits (7.6 px);
- Stack HUD digits (9 px);
- Deepdelve tool row and HUD (11 px);
- Jam and Deepdelve titles (10 px);
- Town Emotes / Tools (11 px).

The rest are:
- three 0.0 px readings that are probably hidden or measurement artifacts: Realm `#realm-leave-btn`, and Isles `#howto-more` / `.howto-title`;
- the Hub map has no visible h1.

To make the viewport feasible, a later cycle needs to:
1. Raise those narrow-screen fonts to 12 px. Pop's 7.6 px digits are the worst.
2. Check the 0 px readings.
3. Then add the viewport.

## Checks actually run (all through /tmp/bt.sh, own server :9602)
| Item | Check | Result |
|---|---|---|
| 1 | `cyc6-ui-isles-arrival.test.js` (new). Jungle seeds 5, 1 and 3 at 195x422, 390x844 and 1280x720. A creature's drawn box must be on screen, with `elementFromPoint` showing nothing over it. No hostile within 7 tiles. At 195: no journal sighting or toast at arrival, and a sighting after the hero walks about 3 tiles. | Before the fix (HEAD isles.js): **5 FAILED** (all three 195 seeds; 390 seeds 1 and 3 under the stick / HUD). After: **ALL PASSED** |
| 2 | `cyc6-ui-195-results.test.js` (new). Dash, Pop, Stack and Echo results at 195, 390 and 1280. Card plus ring below the Menu button (or on screen). Headline not covered. Stack card below the header and Sound. Dash goal line hidden, the 44-48 px "Run again" still restarts the same course, and goal and Jump come back. Echo bloom line clear of the bar frame and board ring (390, 195, 1280). Hub Home at 195 scrolled in 20 px steps: nothing from Home under the Menu button. | Before (HEAD files): **20 FAILED**. After: **ALL PASSED** |
| 3 | `cyc6-ui-town-ac.test.js` (new, offlineStub). A and C at least 56 px at 390x844 and 360x640, closed and with Tools open. Emotes and Tools at least 44 px. Strip on screen and off the joystick. 160x284 strip unchanged at 48x44. 0 DB attempts. | Before (HEAD style.css): **4 FAILED**. After: **ALL PASSED** |
| a11y | `a11y-viewport-sweep.test.js` with a 195x422 viewport, `VPS=195x422` | 36 new offenders, so the change was reverted (see above) |
| regressions | See "Regression batch" below | See below |

Screenshots in `game/design/beta/img/`:
- `cyc6-ui-isles-195x422.jpg`, `cyc6-ui-isles-390x844.jpg`, `cyc6-ui-isles-1280x720.jpg`;
- `cyc6-ui-result-{dash,pop,stack,echo}-195.jpg`, `cyc6-ui-result-dash-390x844.jpg`, `cyc6-ui-result-dash-1280x720.jpg`;
- `cyc6-ui-echo-bloom-390.jpg`, `cyc6-ui-hub-home-195-scrolled.jpg`, `cyc6-ui-town-ac-390.jpg`.

## Regression batch
All runs were on :9602, through /tmp/bt.sh, on the final code unless a line says otherwise.

**Passed:** cyc6-ui-town-ac, cyc6-ui-isles-arrival, cyc6-ui-195-results, cyc1-ui-town-hud, cyc2-ui-town-narrow, cyc4-ui-town-zoom-goal, beta-r4-d4-mobile, nav-town, dash-page, pop-page, stack-page, echo-page, beta-w10-echo-labels, beta-w09-arcade-layout, shared-mm-minikit (56/56), beta-r4-d4-arcade, hub-home, home, r4-d2-isles, cyc5-ui-isles-compact, isles-first-ten, isles-taming, isles-ftue-fixes.

The first batch had 4 failures. I traced each one to my change, fixed it and re-ran:
- `beta-w10-echo-labels`: the Echo board ran 5 px past 720. Fixed by the board height formula.
- `hub-home`: desktop Home scrolled 8 px. Fixed by keeping the 48 px band above 700 px wide.
- `cyc5-ui-isles-compact` at 195x422: the close greeter grew the HUD's taming line and fired a two-line "curious about you" toast over Soothe. Fixed by pausing the moved greeter's taming clock and keeping it off the HUD.
- `cyc6-ui-isles-arrival` at 390 seed 1: a ring greeter wandered 1 px under the HUD. Fixed: every moved greeter stands still until the hero walks, and the clearance has 4 px of padding.

Last runs after those fixes:
- the Isles set (cyc5-ui-isles-compact, cyc6-ui-isles-arrival, r4-d2-isles, isles-first-ten, isles-taming, isles-ftue-fixes): all passed;
- the Echo / Hub set (beta-w10-echo-labels, hub-home, cyc6-ui-195-results, echo-page, home): all passed.

Not run: the full stamp (that is the coordinator's job).

## Unresolved
- On Isles seeds where far groups exist, the first screen is still empty on every viewport. `arrivalFill` returns when `creatures.length > 0`, and it should check "none in view" instead. I left it alone because it changes the first-ten bot's opening on desktop and 390.
- Realm HUD (Daily and gear between the thumbs): proposal only, see section 3.
- Town Menu top-left and "Where to?": proposal only.
- a11y 195x422 viewport: 36 narrow-screen offenders listed above.
- Not tested: real-device touch, and landscape Echo bloom beyond the 1280 desktop.

## Proposals
- Raise the narrow-screen text floors to 12 px (Pop and Stack HUD digits first), then add 195x422 to the a11y sweep.
- One shared rule: any fixed-corner control registers its rect (MMNav already knows its own), and overlays and toasts ask MMNav for a safe top. That would replace the per-page offsets.
