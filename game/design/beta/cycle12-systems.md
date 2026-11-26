# Cycle 12: S (Game Systems Developer)

Branch `cyc12-systems` (worktree `.claude/worktrees/agent-adf246e9550b89bf3`), cut from `0207dda` (cycle 11 stamp). Not pushed. Static server: port 9125.
Commits: `f53e001` (ID-61), `a5abe83` (ID-56), then this report.

## 1. ID-61 welcome-back line (built)
Spec: U cycle 11 in `design/IDEAS.md`.

**What changed**
- `main.js`:
  - `setupLoginStreak` now reads `lastVisitDate` into `this._welcomeBackDue` BEFORE the ID-09 `townDayStep` rewrites it on this load. The order is explicit and has a comment.
  - New pure helpers: `townWelcomeBackDue(last, today)` is true only for a valid `YYYY-MM-DD` that is earlier than the UTC game day. `townWelcomeBackText(save)` uses `realm.level` and falls back to "Welcome back to Pixeltown!".
  - New `setupWelcomeBack()`, called after `setupWhatsNew`:
    - It waits while the What's-new banner is up.
    - It shows once per load and hides after 10 s, or 3 s after the hero first moves.
    - The ✕ closes it. Esc closes it through a window capture-phase listener (`stopImmediatePropagation`), so no page Esc handler sees that key.
    - It places itself 8 px below the lowest top-HUD box (Menu, bag bar, player list) that shares its columns. This is re-measured every 200 ms while it shows, because the HUD settles after load. At 195x422 it lands under the bag bar.
  - The gate-pointer chip also waits while `#town-welcome` is up, so the two do not stack.
- `index.html`: `#town-welcome` (`role=status`, `aria-live=polite`) with `#town-welcome-close` (44 x 44, `aria-label="Dismiss"`).
- `style.css`: the What's-new look at 13 px, max-width `min(92vw, 420px)`. At 300 px or less it uses 12 px (the floor).
- No zone name: the Town cannot read a Realm zone without loading Realm code, so per the spec it is left out. No new save key.
- Cache tags bumped: `main.js` and `style.css` to `?v=20261126c12s`.

**Deviation from the spec:** at 195x422 the line wraps to **3** lines, not 2. Measured: the sentence is 283 px wide at 13 px. The box is at most 179 px (92vw) and holds a 44 px ✕, which leaves about 120 px of text width. The test allows at most 3 lines at 300 px or less and at most 2 lines above that.

**Check actually run**: `node game/tests/cyc12-s-welcome-back.test.js` (new, registered as full/browser/420 s).
- **Before** (main.js, index.html and style.css reverted through a tagged stash): it FAILED. There was no element, then a timeout on the missing ✕.
- **After: ALL PASSED** (two runs). At 1280x720, 390x844 and 195x422, with a save whose `lastVisitDate` is 2 days ago, `visitDays` 4 and `realm.level` 6:
  - The line reads "Welcome back! Your hero is Lv 6 in the Realm." with role, aria-live and at least 12 px.
  - It is inside the screen, with no sideways scroll and within its width and line limits.
  - It overlaps none of: Menu, bag bar, player list, Where-to, A, C, Tools, joystick, achievement toast.
  - The ✕ is at least 44 x 44.
  - The visit count goes 4 -> 5 and `lastVisitDate` becomes today.
  - The only keys added are the Town's every-load keys, none named for ID-61.
  - Desktop: Esc closes it, is not seen by a bubble-phase window listener and opens no menu. The control check passes: the next Esc does reach the page.
  - Touch: a tap on the ✕ closes it.
  - A same-day reload shows nothing and the visit count stays 5.
  - Other cases:
    - A first-ever visit (no save) shows nothing. So does a save without `lastVisitDate`.
    - With What's-new up, the line waits and appears after that banner is closed (generic text when the save has no realm level). After real arrow-key movement it is still up at 1.5 s and gone about 3 s later.
    - Helper truth table.
  - 0 DB attempts on every context.
- Related tests after the change, all ALL PASSED: `cyc8-s-town-days`, `cyc7-s-visit-days`, `town-streak-clock`, `town-first-ten` (45 PASS). `a11y-viewport-sweep` showed 70 PASS and 0 FAIL in the log, but I did not see its final summary line before I stopped, so it is not confirmed complete. `town-first-ten` rewrote `design/ftue-metrics.json`; I reverted that file.
- Screenshots: `game/design/beta/img/cyc12-systems-welcome-{1280x720,390x844,195x422}.jpg`.

## 2. ID-56 shop "saving for" pin (built)
Spec: U cycle 11 in `design/IDEAS.md`.

**What changed**
- `realm.js` (shared by the Town Realm and the Mad Maze page):
  - The device pref `mm-shop-pin` = `{"v":1,"id":"<item id>:<rarity>"}` in localStorage only. `rmShopPinGet` returns no pin for anything malformed and never throws.
  - Every shop row has `<button class="rm-pin" aria-pressed>` (☆ / ★, "Save for / Stop saving for <rarity> <name>"). One pin at a time: another star moves it, the lit star clears it, and focus stays on the star.
  - The sticky wallet header gets "★ Saving for Common Spark Wand: 6 more 💎" or "★ Common Spark Wand: ready to buy". The pinned row gets a 2 px yellow left border.
  - Buying the pinned item clears the pin silently. A pin that is not in the stock clears when the shop is drawn (not from the HUD, so a pin made on one Realm page is not lost by opening the other page's HUD).
  - HUD: `_syncPinHud`, called from `_syncShards` and cached on pin, shards, width, level, best wave and hero.
    - Above 300 px: `#realm-pin` reads " · ★ 6 💎 to go" or " · ★ ready", and drops " to go" if `#realm-info` overflows.
    - At 300 px or less: no text, the shard count turns yellow, and `#realm-info` gets the aria-label "... 18 of 24 shards saved for Spark Wand".
- `realm-ui.css`: the 44 x 44 star with the yellow 3 px focus ring (the existing shop rule). The grid is text | star | Buy above 300 px. The goal line is 12 px and wraps only at spaces.
- `SAVE-KEYS.md`: `mm-shop-pin` row (pref, not in Backup). `IDEAS.md`: ID-56 and ID-61 are marked built.
- Cache tags: `realm.js` and `realm-ui.css` to `?v=20261126c12s` in `index.html`; `realm-ui.css` in `games/mad-maze/index.html`. That page loads `realm.js` with no tag.

**Deviation from the spec (at 300 px or less):** U asked for the star at the right end of the NAME line. Measured at 195x422: icon 32 + gap 8 + star 48 leave 39 px of the 127 px name line. "Quickfire" alone is 70 px, so it would break mid-word. I first moved the name text under its icon, but that failed 3 checks in `cyc9-ui` ("name centred on its icon", at all three sizes, because I had wrapped the name in a span). So I reverted that. At 300 px or less the star now sits at the right end of the rarity and stat lines (rows 2-3), which keep 48 px clear. The name line and the full-width Buy are unchanged. U should confirm this or propose another spot.

**Check actually run**: `node game/tests/cyc12-s-shop-pin.test.js` (new, full/browser/600 s), Mad Maze world page, real taps and clicks.
- **Before** (`realm.js` and `realm-ui.css` reverted through a tagged stash): it FAILED. The first check failed (no star), then a timeout tapping the missing star.
- **After: ALL PASSED.** At 1280x720, 390x844 and 195x422 it checks:
  - The star's size, glyph, aria and placement (left of Buy on the Buy line above 300 px; the rarity/stat spot at 300 px or less, apart from the name, rarity and stat text, with Buy still full width).
  - Pin, move and clear, and the pref value. The pin is never in `pixeltown-save-v1`.
  - The header text, at least 12 px, with no overflow.
  - The HUD text on one line, or at 195 the yellow count (rgb 255,236,39) and the aria-label.
  - With enough shards: "ready" in the HUD and the header.
  - A real Buy of the pinned item clears everything.
  - No sideways scroll. A pin for an item not in stock clears. A malformed pref means no pin.
  - 0 DB attempts and no page errors.
- Regression runs on the final code, all ALL PASSED: `cyc9-ui` (after the revert), `cyc10-ui`, `cyc6-shop`, `cyc9-shop-reliability`, and `save-hostile-fuzz` (SAVE-KEYS backup coverage).
- Screenshots: `game/design/beta/img/cyc12-systems-pin-shop-*.jpg` and `cyc12-systems-pin-hud-*.jpg`, at 1280x720, 390x844 and 195x422.

## 3. ID-59 first-visit animal hello: not started
There was no time left in the 60-minute box. It also needs G's 7 x 6 heart look, per U's conditions.

## Unresolved / notes
- ID-56 was tested on the Mad Maze page only. The Town Realm uses the same `realm.js` and `realm-ui.css` code, but I did not run a separate Town Realm browser check.
- `mm-shop-pin` is not in `MMBackup` (a soft device goal). If U or L want it carried, add it to `FLAG_KEYS` and NAMES.
- The about-N-Shore-kills hint from the original ID-56 row is not built: U's spec does not ask for it.
- In the 195x422 shop screenshot the first row's item icon looks blank. I did not investigate it. It may be the icon still loading when the shot was taken.

## Proposals
- U: confirm the 300-px-or-less star placement for ID-56 (the rarity/stat lines), and confirm 3 lines for ID-61 at 195 px.
- Next S cycle: ID-59, once G delivers the heart look.
