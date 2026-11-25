# Cycle 9 - U (UI/UX) report

Branch `cyc9-ui`, cut from the tip ddfc132 ("Stamp cycle 8"). Worktree /tmp/wt-cyc9-ui, port 9902. To run the new test against the old code, a `git archive` of ddfc132 was served read-only on :9912. Nothing was pushed.

Firebase stayed blocked in every run:
- The Town ran offline (`offlineStub`, `joinOffline`).
- Every other page ran under `blockDb`, with every WebSocket closed.
- `db.attempts() === 0` everywhere.

I did not touch `net.js`, `firebase-config.js` or `realm.js`. S edits `_shopTap` this cycle, so the shop changes are CSS only (`realm-ui.css`). Save format unchanged.

## 1. Pop at 160x284 / 195x422 (cycle-8 open item "195x422 Pop overflow")
At 160x284 (a 320 px phone at 200% zoom), measured two real overflows; 195x422 was already clean:
- **The intro card scrolled sideways by 18 px** (content 138 px in a 120 px card). Play and Play again kept `min-width: 120px`, so the right part of the button was cut off.
- **A 9-character value (`1,234,567`) ran 8 px past its HUD box.** The text spanned 14..79 inside 14..71. The 8-bit skin gives each `.stat` a 2 px side margin and a 4 px outer ring.

Fix (`games/pop/pop.css`):
- **300 px wide or less:** `.big` buttons drop their 120 px floor (they still fill the row with `flex: 1`). The floating card follows the 8 px stage inset instead of 16 px.
- **180 px wide or less:** the stage padding goes to 4 px, the HUD gap to 4 px, and the `.stat` side padding to 2 px. Each box is 70 px with 66 px inside, so the 65 px value fits and the rings never collide.

## 2. Realm shop / Buy UI ("the Realm UI is off"), checked at 1280x720, 390x844 and 195x422
Cycle 6 fixed the buy feedback and where the rarity sat. Re-checking found more misalignment:
- **Two left edges in each row.** The 32 px icon sat inline in the name, so the name dropped 11 px below the icon's centre, and the rarity and stat lines started under the icon instead of under the name.
- **A ragged Buy column.** "Buy 24💎" is 72 px wide and "Buy 120💎" is 77 px.
- **Mid-word breaks at 195x422.** The text column was 47 px wide, so words broke inside: "Commo|n", "Quickfi|re".
- **Extra item from the coordinator (S report, 195x422): the sticky "You have … / Bought …" header was see-through.** It also carries `.realm-bp-count`, which has `opacity: 0.6` (in `style.css` and `mad-maze.css`), so the whole header, background included, was 60% opaque. Scrolled rows showed through the text.
- **Found while fixing that:** the header stuck 11 px below the card edge (`top: -1px` measured inside the card's 12 px padding), so a strip of scrolled rows was visible above it.

Fix (`realm-ui.css`, CSS only):
- The name is a flex row centred on its icon. The rarity and stat lines are indented 40 px so they start where the name text starts.
- Every Buy button is at least 80 px wide. Prices are only 24, 56 and 120.
- At 300 px or less, Buy takes its own full-width row under the text, the indent goes, and words wrap only at spaces.
- The shop header has `opacity: 1` and a solid `#0a0610` fill. The dim look moves into the text colour. It now sticks at the card edge (`top: -13px`).
- `game/index.html` cache keys are bumped (`realm-ui.css` and `mm-nav.css` to `?v=20261125u9`), so Town players get the new CSS.

## 3. Town Menu on phone and the Resting chip (#rw-rest), checked at 195x422, 390x844 and 1280x720 (plus 360x640 and 414x896)
- **Town HUD:** no overlaps at any size. Confirmed by the `cyc8-ui` Town checks at 6 sizes, which pass on this branch.
- **Town Menu sheet at 195x422 (fixed).** The sheet kept two place cards per row (~80 px each), so every place name broke mid-word ("To|wn", "The Rea|l|m", "Lan|ter") and the hints shrank to "Wal…".
  - `shared/mm-nav.css`: at 300 px or less it now shows one place per row, the same rule big-text mode already used.
  - 390 and 1280 were fine and are unchanged.
- **Resting chip at 360, 390 and 414 (fixed).** On the one-line phone zone strip (`flex`, `nowrap`, `overflow: hidden`), the chip (order -1) pushed the fixed-width danger meter past the clipped edge, so "Comfortable" was cut to "Comfo" (text ending at x 330 against a strip edge of 262, 292 or 316).
  - While the chip shows, the danger **word** is visually hidden; screen readers still read it.
  - The icon (✓ / ! / ☠, so the level is not colour alone) and the bar stay. The word returns on the first input, when the chip goes.
- **Resting chip at 195x422 (fixed).** The strip there is 77 px wide (the cycle 7/8 left column), so after the chip, the zone name and the danger icon were cut at the edge. At portrait 260 px or less, while the chip shows it stands in for the whole strip; the other pieces are visually hidden but still read by screen readers.
- **Resting chip at 1280x720:** sits inside the right-hand zone panel, on screen, overlapping nothing. No change.
- The chip overlaps no button at any of the 5 sizes.

## 4. Review of D's ideas ID-53..55 (game/design/IDEAS.md)
All three are now `approved (U, cycle 9: conditions below)`. The conditions are in a new "U review of ID-53..55" section in IDEAS.md:
- **ID-53, just-in-time hint (S): approved.**
  - It must not repeat the Resting chip's "move to play"; it names a different verb.
  - It sits one line above the sticks and the ability grid, at least 40 px clear of the stick at 195 px.
  - `role=status`, a ✕ of at least 44 px, Esc closes it, no motion under reduced motion.
  - It never shows over toasts, panels, the how-to card or the Nexus.
- **ID-54, drag-anywhere stick (M, opt-in, off by default): approved.**
  - The stick starts only on bare canvas: `elementFromPoint` must be the canvas, so HUD taps keep working. Lower left only, under the top HUD band.
  - The option is ignored at 300 px or less (the free area there is about 80x100 px).
  - The stick's cap needs a contrast of at least 3:1 on sand and on grass.
- **ID-55, first-session ending card (S): approved.**
  - It reuses the arcade result-card pattern. Focus starts on "Not now", and Esc closes it.
  - It is shown only in a quiet moment, never over panels.
  - The "seen once" flag is an additive key inside `pixeltown-save-v1`, and the Backup must carry it.
  - It must fit 195x422 with no mid-word breaks.

## Checks actually run (all through /tmp/bt.sh)
| Item | Check | Result |
|---|---|---|
| 1-3 + header | **New `game/tests/cyc9-ui.test.js`**, in the a11y-sweep style, registered in `test-tiers.json` (browser/full, 420 s). It covers:<br>- Pop at 160x284 and 195x422, text 100% and 150%<br>- The Realm shop at 1280, 390 and 195 (Buy column, icon centring, one text edge, mid-word breaks, list bounds, opaque header, no row band above it)<br>- The Resting chip at 360, 390, 414, 195 and 1280 (no cut zone text, danger icon kept, no button overlap)<br>- The Town Menu sheet at 195, 390 and 1280 (no mid-word breaks, at least 44 px, in bounds)<br>- 0 DB attempts | Old code (ddfc132 on :9912): **27 FAILED**. This branch (:9902): **ALL PASSED** (84 checks), final run. |
| 2 | `cyc6-shop`: one check honestly widened. "Clear of the Buy button" now means left of it **or wholly above it**, because Buy now has its own row under the text at 300 px or less. Text under the button still fails. | Before the change it failed on this branch at 195 (1 FAILED, the layout change). After: **ALL PASSED** on the branch, and ALL PASSED on ddfc132. I did not run it against pre-cycle-6 code. |
| regression | `realm-shop-death`, `pop-page`, `beta-r4-b09-12-pop-hud-fit`, `cyc8-s-rest-chip`, `nav-town`, `item-icons`, `cyc8-ui` | **ALL PASSED** each |
| regression | `a11y-viewport-sweep` with `PAGES=pop,realm-world,town,hub-home` (8 viewports plus preference passes) | **ALL PASSED**, 0 offenders. This run started before the last 195 rest-chip rule and before the header `top` change. Both only apply while the chip shows or the shop is open, which the sweep does not reach. |
| - | Not run | The full stamp (the coordinator's job) and real touch devices |

During development two runs of my own test failed because of bugs in the test, not the game: a `tap()` call was given a locator instead of a selector, and two measurements were wrong (centring a two-line name by its first line, and counting a row clipped behind the header as visible). I fixed the test and reran both sides; the results above are from the final runs.

Screenshots (`game/design/beta/img/`):
- Pop: `cyc9-ui-pop-160x284.jpg`
- Shop: `cyc9-ui-shop-{1280x720,390x844,195x422}.jpg`
- Resting chip: `cyc9-ui-rest-{360x640,390x844,414x896,195x422,1280x720}.jpg`
- Town Menu: `cyc9-ui-town-menu-{195x422,390x844,1280x720}.jpg`

## Unresolved
- **Realm zone strip at 195x422 without the chip** still clips "➤ Shore · Sa…" (pre-existing since cycle 8). Letting it wrap would push the Next-goal text into the move stick (goal ends at 298, stick starts at 318).
- **Shop close ✕** scrolls away with the list. Esc and the back gesture still work, but a sticky ✕ would be clearer.
- **Shop font** is system sans, while the Realm HUD uses the pixel font. That is a visual mismatch for G/U next cycle.
- **Real-device touch** was not tested.

## Proposals
1. Make the shop/backpack title row (with ✕) sticky together with the wallet header.
2. At 195 px, show the zone strip as the zone name only, with ellipsis, and the danger meter as an icon only.
3. Add 160x284 to the a11y sweep's viewport list. It costs about 16 more page views per run; the coordinator should decide on the run time.
