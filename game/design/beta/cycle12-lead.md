# Cycle 12, L (Lead Developer)

Branch `cyc12-lead`, cut from `0207dda` (cycle 11 stamp). Nothing pushed. Static server on port 9121, browsers only through `/tmp/bt.sh`,
targeted tests only. Firebase blocked in every test (offlineStub / blockDb, literal 0 attempts). No change to `firebase-config.js`,
`net.js` or the save format.

All three items are done and tested. Two things need a decision from the coordinator or U; they are under "Needs a decision".

## 1. Statues and punk rocks settle in the Town cull

**Changed (`game/main.js`):** the three pond-bank hero statues, the Founder's Statue and the four punk rocks declare `_cstill`, like the
flower beds and rocks did in cycle 10. They are no longer measured on every cull pass.

**Test:** new `game/tests/cyc12-lead-town-still-statues.test.js`, in the manner of `cyc9-lead-town-cull-pin`.

| Run | Result |
|---|---|
| With the change | 9/9 PASS. 8 decor sprites, 8 declared, 8 settled, 0 through the walkers' helper; 91 other sprites still measured every pass; cull bits right at 5 camera spots; the Founder is culled far away and drawn again on return. |
| Old `main.js` (the three marks taken out) | 3 FAIL (declared 0 of 8, settled 0, all 8 through the helper). The cull-bit checks pass in both, as they should: the bits must not change. |

`cyc10-lead-town-cull-sprites.test.js` listed the allowed still kinds as `rocks,tulips`. It now expects `mooncats,punkrocks,rocks,tulips`
and at least 38 still sprites (was 30). Re-run: ALL PASSED. `cyc9-lead-town-cull-pin`: ALL PASSED.

Not measured: bytes per frame. The saving is 8 sprites of 99 per pass, so it is small.

## 2. Town Museum in the a11y sweep, and what it found

**Measured first (old code, 195x422 and 160x284, Museum open):**

| | 195x422 | 160x284 |
|---|---|---|
| ✕ after scrolling the card to its end | y -810 (off screen) | y -839 |
| Tab height | 29 px | 29 px |
| Compass (`#mm-nav-btn`, z 9000) | on the card's corner | on the card's corner |

**Sweep (`game/tests/a11y-viewport-sweep.test.js`):** new view `town-museum` (same offline entry as `town`, then the scene's own
`openMuseum()`). First run on the old Museum plus my first CSS pass: 11 distinct offenders. After the fixes: 0 offenders at all 9
viewports and the 5 preference passes. Nothing was added to the allow-list.

| Sweep finding | Fix (`game/style.css`, end of file) |
|---|---|
| "Overall collection" label 2.34:1 and its count 1.25:1 on the cream card (all viewports) | card text colours (`--ac-text-muted`, `--ac-text`) |
| Tab count 11 px | 12 px |
| ✕ 28 px at 768x1024 (a touch tablet) and 1920; tabs 29 px | ✕ and tabs are 44 px at every size |
| Text size setting (hudScale 1.5) did not reach the card (x1.14, need x1.2) | from 300 px wide the card is zoomed like the HUD panels, limits divided by the scale |
| Three "controls cover each other" pairs at 195 px with large text | see the sweep rule change below |

**Other fixes from the U notes:**
- The ✕ is sticky. It stays top right while the card scrolls and takes no room in the column.
- The stuck tab bar keeps its right 54 px free (a border in the bar's colour), so no tab is drawn or tappable under the ✕.
- The compass is hidden while the Museum is open on a narrow (<= 600 px) or short (<= 500 px) screen, and comes back on close.
- The tab bar grew with its tabs, so the card's `scroll-padding-top` follows it (64 px, 52 px below 300 px wide).

**Test:** new `game/tests/cyc12-lead-museum-panel.test.js` at 195x422, 160x284, 390x844, 667x375 and 1280x720, with real taps.

| Run | Result |
|---|---|
| New CSS | 47/47 PASS |
| Old `style.css` | 29 FAIL (tabs 29 px, compass on the card at 195 / 160 / 667, contrast, ✕ gone after scroll, a tap at the ✕'s place does not close) |

Also re-run after the change: `cyc11-ui` ALL PASSED, sweep `PAGES=town,town-museum` 0 offenders ALL PASSED (125 s under load).
`cyc10-art-town-insects-museum` ALL PASSED, but that run was before the last small CSS edit (scroll padding and 2 px bar padding below
300 px); I did not run it again after it.

Screenshots: `game/design/beta/img/cyc12-lead-museum-<vp>.jpg` and `-end.jpg` (scrolled to the end) for the five viewports. I looked
at 1280x720, 390x844 and 195x422.

## 3. Realm: Deepdelve save parse cached, hint and card listeners removed on close

**Changed (`game/games/mad-maze/realm-world.js`):**
- `feDeep()` keeps its count and parses the save again only when its text changed.
- The hint's Esc listener is added when the hint shows and removed when it hides.
- The card's Esc listener is added when the card opens and removed when it closes.
- The `pagehide` listener is added only for a session that can still get the card, and removed once the card has shown.

**Honest limit:** the once-a-second `localStorage.getItem` is still there. Only the `JSON.parse` and the key filtering are gone. A
read-once-at-load cache would break `cyc10-s-first-end`, which writes the Deepdelve save in the same page and expects the card.

**Test:** new `game/tests/cyc12-lead-realm-listeners.test.js` (wraps `JSON.parse` and `add/removeEventListener` before the page loads).

| Run | Result |
|---|---|
| New code | 13/13 PASS. 0 parses over 8 game seconds; 1 more when the save text changes; Esc still closes the hint and the card without opening the Menu; the next Esc opens the Menu. |
| Old code | 4 FAIL lines seen (9 parses in 8 s; hint and card listeners on the window from the start; hint listener still there after Esc). The run printed no total line, so I do not know whether the later checks ran. |

Re-run after the change: `cyc10-s-first-end`, `cyc11-d-first-end`, `cyc10-s-jit-hint` ALL PASSED.

One behaviour difference: the hint's listener is now registered later than the Menu sheet's own key handler. If the Menu sheet and the
hint were ever both up, Esc would close the sheet first. Not tested; the hint is blocked while a panel is open.

## Needs a decision

1. **`cyc11-ui.test.js` assertion changed.** It required the Museum tab bar to be 40 px or less at 195 px wide. That cannot hold with
   44 px tabs, which U proposed in cycle 11. It now requires 44 to 48 px (tabs plus at most 4 px). U should confirm or send it back.
2. **Sweep rule changes (both in `a11y-viewport-sweep.test.js`), for U as owner of the sweep:**
   - The Menu may be hidden only while a modal dialog is open, and then the dialog's close button must be on screen, 44 px and on
     top. Otherwise `menu|hidden` is reported as before.
   - The "controls cover each other" check skips a control outside an open modal dialog when its centre is covered by that dialog.
     This removed the three pairs above (people chip, goal close and "more" under the Museum scrim). No other page has a modal open
     in the sweep, and `town` still reports 0.
3. **Cache versions not bumped.** `style.css?v=`, `main.js?v=` and `realm-world.js?v=` are unchanged, to avoid a conflict on the
   same lines with the other roles. The coordinator should bump them at integration.

## Unresolved

- At 195 px only one tab fits beside the ✕ (about 60 px at 160 px); the rest are reached by scrolling the bar sideways. There is no
  visible cue that more tabs exist. The 54 px reserve is also empty space at the right of the bar when the card is not scrolled.
- Background HUD controls stay focusable behind the Museum (no `inert`). I did not add it: it changes focus behaviour for every test
  that opens the Museum and I could not run the full suite.
- The other Town dialogs (Achievements, Mailbox, Home, Today, Journal, Workbench) share the old pattern: ✕ inside the scrolling card,
  compass on top on small screens. Not checked this cycle.
- Sweep cost: the Museum view added 73 to 87 s under load. I raised the sweep's `timeoutSec` from 960 to 1080.
- Full suite not run (coordinator's job). Tests I ran are listed above; nothing else was run.

## Code review of the cycle 11 diff (`473bf44..HEAD`), verified findings only

1. **`game/shared/mm-move-float.js` line 14: wrong id.** `TOP_SEL` lists `#rw-jit`, but the hint's element is `#rw-jhint`
   (`realm-world.js`). No element has the id `rw-jit` (grep over `game/`). So the hint never raises the float's top bound. Effect is
   small: a touch on the hint itself still cannot start the float, because the touch must land on the canvas. Fix: rename to `#rw-jhint`.
2. **`game/main.js` `adoptSave` (cycle 11): "best" stats are added like counters.** `bestSellStreak`, `homeCozyBest` and
   `fishSpecies` are highest-value stats, but the new carry rule gives `stored + (mine - base)`. Checked with the rule's arithmetic:
   base 3, mine 4 (unsaved), storage 6 gives 7, a best nobody reached. It needs an unsaved change in this tab when another tab
   writes, so it is rare. `townMergeCounts` (older, beta S-02) has the same rule. Not reproduced in a browser. Fix: take the maximum
   for those three keys in both places.

Read and found nothing wrong: star wallet (`saveStars`, `flushPendingSave`), the shared stick binding in `main.js` and `mad-maze.js`,
the strip-art flip fix, the Backup key for `mm-move-float`, the font changes in `realm.js` / `realm-world.js`. Not reviewed: CSS-only
files, `mm-town-fauna.js` pixel maps, the hawk asset files.

## Proposals

1. U: give the Museum tab bar a "more" cue at <= 300 px (a fade or arrow at the bar's right edge), or wrap the tabs to two rows there.
2. L or U next cycle: one shared rule for every Town dialog (sticky ✕, compass hidden on small screens, `inert` on the HUD behind),
   then add each dialog to the sweep the way `town-museum` was added (`open` + `dialog` on the page entry).
3. S: replace the same-page Deepdelve write in `cyc10-s-first-end` with a reload, then `feDeep()` can read once at load plus on the
   `storage` event, and the per-second read goes away.
