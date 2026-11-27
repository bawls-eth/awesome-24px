# Cycle 16 U (UI/UX)

Branch cyc16-ui, port 9102. Nothing pushed.

## Items
1. Realm coach card at <=260 px: full width, 11 px type, no step counter, starts under the compass, keeps off the hero (realm-tutorial.js keepClear + mad-maze.css). Check: cyc16-ui-coach-card.test.js ALL PASSED (3 viewports x 5 steps). 195x422 height 54 px (13%, was 129 px, ~30-69%).
2. Isles toast at 195x422: placeToast treats the hero as an obstacle; if it still lands on the hero beside the how-to card, body.toast-wide hides the card column for the toast and the toast goes full width (2 lines, y 233-268). Check: cyc16-ui-isles-toast.test.js passed twice in a row.

## Not done / unresolved
- Fail-before run (tests on old source) NOT run.
- Regression run (cyc15-ui, cyc14-lead-small-screens, beta-w18-isles-howto, realm-tutorial, ftue-ft2, beta-g15-tutorial-first-minute, cyc15-design-coach-keys, isles-first-ten) was still running when handed back; no failures printed for the first 7 started, results not confirmed.
- cyc16-ui-coach-card 1280 screenshot missing (run timed out under load).
- At 195 the coach card still visually covers passive HUD buttons (taps pass through).
