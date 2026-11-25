# Cycle 10: U (UI/UX), branch `cyc10-ui`

Worktree `/tmp/wt-cyc10-ui`, cut from `claude/animal-crossing-game-7z3roh` at 8cf8f36. Static server on port 9102. Browsers ran only through `/tmp/bt.sh`, with targeted tests only. Nothing was pushed. firebase-config.js and net.js were not touched, and the save format is unchanged (no new keys).

## 1. Realm shop: sticky ✖ and the Realm pixel font (cycle-9 open item "shop close button scrolls away")
- **Problem, measured before the fix:** the whole `.realm-bp-card` scrolled, so the title row and its ✖ scrolled away with the offers. With a level-9 stock scrolled to the end, the ✖ sat at y -2582 at 195x422, -1122 at 390x844 and -1231 at 1280x720. The shop was also the last Realm panel still in `system-ui`; the backpack, HUD and abilities use `--px-font`.
- **Fix (realm-ui.css, appended cyc10-ui block):**
  - The shop card is now a flex column with `overflow: hidden`. The title row (🛒 SHOP and ✖) stays put, and only `#realm-shop-body` scrolls.
  - The wallet / message line is sticky at the body's top edge, directly under the ✖.
  - The card, title, rows and Buy buttons use `var(--px-font)`. Buttons need this set explicitly because they do not inherit the font.
  - The frame and the ✖ match the backpack's BP8 panel (square red ✖, 4+2 px pixel frame) and have a yellow focus ring.
  - The pixel font made "Buy 120💎" 81 px against 80 px for "Buy 24💎", so every Buy now has a 92 px minimum width. cyc9-ui caught this on the first run.
  - The CSS version was bumped in both pages that load realm-ui.css (`?v=20261125c10`).
- **Result:** after scrolling to the last offer, the ✖ is at y 24-68 at 195 and 1280, and at y 64-108 at 390. It is the element under its own centre, and a real tap or click on it closes the shop.

## 2. 195x422 zone strip clipping (cycle-9 open item)
- **Problem, measured:** the <= 260 px one-line strip is 75 px wide, but it laid out 241 px of content ("➤ Shore · Safe-ish ✓ ▬ Comfortable ⚑ Raid in 1:27 · Highlands"). It was cut to "➤ Shore · Sa", and the danger icon fell outside the box (✓ ending at x 145 against an edge at 87).
- **Fix:**
  - `realm-world.js`: `.rw-zname` now holds two spans, `.rw-zn` (the name) and `.rw-zd` (" · Safe-ish"). `zName.textContent` is unchanged ("Shore · Safe-ish"), so `hudText()`, `realm.js:5460` and ftue-ft2 still read the same text.
  - `mad-maze.css`, `@media (max-width: 260px)`: the strip shows the arrow, the zone name (shrinking with an ellipsis if needed) and the danger meter as its icon only (✓ / ! / ☠).
  - The " · danger" suffix, the meter word and the raid line are visually hidden, not removed, so screen readers still get them (`#rw-danger` keeps its aria-label). The meter bar is hidden at this width.
  - Wider screens are unchanged. Wrapping the strip instead was rejected because it pushes the Next-goal text onto the stick (cycle-9 measurement).
- **Result:** at 195x422 and 240x480 the strip reads "➤ Shore ✓" and its content is 72 px in a 72 px box. Nothing is cut.
- **Raid line:** at <= 260 px it is no longer drawn on the strip. It was already invisible there before this change (clipped), and it is still announced through the strip's aria-live text.

## 3. ID-54 review; ID-53 / ID-55 / ID-54 UI specs for S; 160x284 in the a11y sweep
- **ID-54:**
  - IDEAS.md had two rows for each of ID-53..55. The second ID-54 row still said `proposed` because L's "stays proposed" note was written before U's cycle-9 review landed.
  - **Decision: approved (size M), to build after ID-53 and ID-55.** The stale row is updated to match.
  - The full spec is in IDEAS.md under "U cycle 10". It covers:
    - the Settings toggle and the device pref `mm-move-float`
    - the start zone, using measured top-HUD bottoms per viewport
    - off at <= 300 px
    - both stick bindings (mad-maze.js and main.js)
    - a 3:1 contrast requirement for the centre cap
    - the test list
- **ID-53 and ID-55 specs for S:** both are in the same IDEAS.md section, with a table of real HUD boxes measured on this tip at 195x422, 390x844, 844x390 and 1280x720.
  - **ID-53:** one `#rw-jit` element in the BP8 look, with a slot for each layout.
    - Key finding: at 195x422 there are only 10 px between the ability grid (bottom 308) and the sticks (top 318). The hint therefore takes the Next-goal slot (8,221,85,300) there, and the goal is hidden while the hint shows.
    - The spec also lists the verbs, the cases where the hint must not show, and the tests.
  - **ID-55:** an `MMMiniKit.panel` card in the BP8 look.
    - It has a 195x422 height budget (about 330 of the 398 px available), and focus, Esc and Back behaviour.
    - It uses the additive save key `realm.firstEndSeen`, and the spec lists the tests.
- **160x284 in the a11y sweep, measured:**
  - A 160x284-only pass over all 16 pages took **33 s** (52 s on a second run under heavier load). The 195x422-only pass took **36 s**, so the extra viewport adds about 1/9 to a full sweep. That cost is modest.
  - But it found **4 offenders that are not in the allow-list**:
    - `isles|menu|overlap:#btn-map overlaps #btn-map`
    - `festival-bugs|hscroll` (193 px of content on a 160 px screen)
    - `angler|landmark|no-h1`
    - `echo|tap|#board 32x36`
  - The allow-list may only shrink, so I did not add these entries. Instead, 160x284 is **opt-in**: `EXTRA_VPS=160x284` adds it, and the default list is still the 8 viewports. It should join the default once those 4 are fixed (see proposals).

## Checks actually run (all through /tmp/bt.sh on :9102)
| Check | Result |
|---|---|
| New `game/tests/cyc10-ui.test.js` (registered in test-tiers.json: browser/full, 420 s): shop at 1280/390/195 (really scrolled with ≥ 14 offers; ✖ on screen, inside the card and on top; a real tap or click closes; wallet and Buy message on screen; pixel font on ≥ 20 elements), zone strip at 195/240 (name drawn, nothing cut, content fits, icon only, aria kept) and 390/1280 (unchanged: suffix and danger word drawn), 0 DB attempts | **Old code** (runtime files stashed): **20 FAILED**. **This branch:** ALL PASSED on three runs in a row (49 checks) |
| cyc9-ui (shop Buy column, opaque header, Resting chip, Pop, Town Menu) | First run: 2 FAILED (Buy column 80 vs 81 px from the pixel font). After the 92 px minimum width: **ALL PASSED** |
| realm-phone-layout | First run: 4 FAILED, because its panel check required the shop *card* to scroll. The check was extended so the same assertions (overflow auto, content taller than the box, really moves) apply to the shop's real scroller, `#realm-shop-body`; card bounds and button sizes are still measured on the card. Then **ALL PASSED** |
| cyc6-shop, cyc9-design-shop-flow, cyc9-shop-reliability, realm-shop-death, ftue-ft2, beta-w05-realm-hud, realm-backpack-8bit, nexus-vendor, world-wording | ALL PASSED (each) |
| a11y-viewport-sweep `PAGES=realm-world,realm-dungeon,town` (8 viewports and the preference passes) | realm-world and town: 0 offenders at every viewport. One offender in this run, `realm-dungeon pref:text-150` (scale x1.18 vs x1.20). Rerun alone: **ALL PASSED on the branch and on base**, so it was load-related (4 browser jobs at once) |
| a11y-viewport-sweep `VPS=160x284 EXTRA_VPS=160x284` | 4 new offenders (listed above), so the viewport stays opt-in |

Screenshots (final CSS): `game/design/beta/img/cyc10-ui-shop-{1280x720,390x844,195x422}.jpg` and `game/design/beta/img/cyc10-ui-zone-{195x422,240x480,390x844,1280x720}.jpg`.

## Unresolved
- The 4 offenders at 160x284 (Isles map button, Festival Bugs sideways scroll, Angler h1, Echo board tap size). These are not my pages and did not fit in the time box.
- The Town's Realm (`game/index.html`) loads realm-ui.css too, so its shop gets the same CSS. Only the Mad Maze page was checked in a browser; the Town Realm shop was not.
- IDEAS.md still has duplicate rows for ID-53..55 (an L copy and a U copy). I updated only the stale ID-54 status and did not delete rows other roles may refer to.

## Proposals
1. Fix the 4 offenders at 160x284 (about 4 small CSS / markup changes in Isles, Festival Bugs, Angler and Echo), then move 160x284 into the sweep's default list (about +33 s per sweep).
2. The coordinator or D should merge the duplicate ID-53..55 rows in IDEAS.md into one row each.
3. Apply the shop pattern (fixed title row, only the body scrolls) to `#realm-board` and `#realm-hero` if their ✖ also scrolls away. Not measured this cycle.
