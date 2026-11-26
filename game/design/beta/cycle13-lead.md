# Cycle 13 - L (Lead Developer)

Branch `cyc13-lead`, cut from `1e6b3b6` (cycle 12 stamp). Static server port 9131. Nothing pushed. Firebase blocked in every browser
test (`blockDb` / `offlineStub`, literal `db.attempts() === 0`). No new key in `pixeltown-save-v1`. No art added.

## What changed

### 1. Realm World HUD at 160x284: the 8 overlaps
- Reproduced first: `OVERLAP160_ALL=1 PAGES=realm-world VPS=160x284` gave 8 offenders (ability pad on Board / Menu, Menu on mini-map / gear /
  Daily, Leave on mini-map / gear, gear on ability 3). The check stops at 8, so 8 was a floor, not a count.
- Moving things was not enough. At 160x284 the world shows eleven 44 px controls (compass, aim toggle, bag, board, Menu, Leave, gear,
  Daily, mini-map, 4 abilities) plus two sticks. On a 3-column grid of 44 px cells that is 18 cells; the controls and the HP bar need
  15, which leaves 3 cells for two sticks. It cannot fit without something covering something.
- Fix: at `max-width: 190px` portrait (touch, world mode) the five secondary controls (bag, board, gear, Daily, Leave) fold into a
  **More** tray (`#rw-more-btn`, `mad-maze.js` `moreTray`, CSS at the end of `realm-ui.css`). Closed: compass, HP / focus / XP, aim
  toggle, Menu, More, mini-map, 2x2 ability pad, two 64 px sticks, none covering another. Open: the five controls take the pad's place,
  the pad and both sticks are hidden, the Next-goal text is shown full width; a tap on an item does its job and closes the tray; Escape
  closes the tray only (it no longer also opens the pause menu). Nothing is removed. Above 190 px the button is not shown and the
  layout is unchanged (checked at 195x422 and 390x844).
- The CSS only applies when `body.rw-has-more` is set by the script, so the new CSS with an older cached `mad-maze.js` keeps the old
  layout instead of hiding controls that have no tray.
- `a11y-viewport-sweep.test.js`: the Realm World park and `OVERLAP160_ALL` are gone. Every page is in the 160x284 overlap check.
  `fixtures/a11y-allow.json` is unchanged (still empty).

### 2a. `#rw-jit` -> `#rw-jhint`
`shared/mm-move-float.js` `TOP_SEL` named an id nothing has, so the ID-53 hint never moved the floating-stick start line. Fixed, and
`MMMoveFloat.TOP_SEL` is exported (a copy) so a test can check every id against the source.

### 2b. Best stats merged as counters
- Reproduced first in a two-tab test: tab A (writes refused) holds bests 4 / 5 / 3 from a base of 2 / 3 / 1; tab B saves 3 / 6 / 2.
  Before the fix tab A showed **5 / 8 / 4** (stored + its own increase) and wrote those to the save once storage allowed it.
- Fix in `main.js`: `TOWN_BEST_STATS = ['bestSellStreak', 'homeCozyBest', 'fishSpecies']`. `adoptSave` takes `max(stored, mine)` for
  those keys when this tab has an unsaved change, and `townMergeCounts` takes a `best` list (5th argument, used by `saveAchievements`
  only), so the write path cannot add them up either. With nothing pending a lower stored value is still taken as is (storage is the
  truth, as before). Counters are unchanged (the same test checks a counter still adds up).

### 3. Compass z-index, and the HUD behind the Museum
- Reproduced first: the compass computed `z-index: 9000` in the Town and was the top element over all 16 modal Town dialogs at
  1280x720 (15 at the phone sizes, where cycle 12 hid it for the Museum by hand).
- Fix: `html:root { --mm-nav-z: 19; }` at the end of `style.css` (outranks the `:root` default in `shared/mm-nav.css`, whatever the
  load order). The compass now sits under every Town dialog and still above the HUD; the "Where to?" sheet keeps its own layer.
  Braces in `style.css` checked before and after the append: 841 `{` / 841 `}` before, balanced after.
- `main.js` `setModalInert(dialog, on)`: `openMuseum()` sets `inert` on everything outside the dialog (siblings of the dialog and of
  each ancestor up to `<body>`; text-only live regions stay readable; an element that was already inert is left alone) and
  `closeMuseum()` removes exactly what it set.

- Two regressions of my own, caught by the sweep and fixed: (a) `town-museum | landmark | no-h1` at every size: the Town's visually
  hidden `<h1 id="town-h1">` is a child of `<body>` and went inert; `setModalInert` now leaves headings alone. (b) `town-museum | menu |
  covered` at 1920x1080: the sweep's Menu rule is "on top, or hidden while a modal dialog with its own 44 px close button is open",
  and the compass was now visible but under the Museum. The cycle 12 "hide the compass while the Museum is open" rule applies at
  every size now (it was small screens only). For the other dialogs the compass stays visible under the backdrop.

### IDEAS.md (L approval)
- ID-65 "Not saved" chip: **approved**, with conditions (existing flag, `role="status"`, no save key, must pass the overlap check at 195 and 160 px).
- ID-66 workbench step in the first-visit goals: **approved**, with conditions (text only, derived from data the save already has, skipped for returning players).
- ID-67 Lv 5-8 XP bonus: **rejected** for now (bot timings only, no human playtest; changes the shared level curve).

### Cache versions
`style.css`, `realm-ui.css`, `main.js`, `shared/mm-move-float.js` -> `?v=20261126c13l` in `game/index.html` and `games/mad-maze/index.html`.
`mad-maze.js` has no version string and I did not add one (see the `rw-has-more` guard above).

## Checks actually run (port 9131, through /tmp/bt.sh)

| Item | Check | Before the fix | After |
|---|---|---|---|
| 1 | `OVERLAP160_ALL=1 PAGES=realm-world VPS=160x284 a11y-viewport-sweep` | 9 FAILED (8 offenders) | n/a (flag removed) |
| 1 | `PAGES=realm-world a11y-viewport-sweep` (all 9 viewports + preference passes, park removed) | not run before | ALL PASSED, 0 offenders |
| 1 | `cyc13-lead-realm-160.test.js` (new: 160x284, 190x400 closed + open, 195x422, 390x844) | not run on the old code (the More button does not exist there, the test waits for it) | ALL PASSED |
| 2a | `cyc13-lead-move-float-topsel.test.js` (new, node) | 6 FAILED | ALL PASSED |
| 2a | `cyc11-s-move-float.test.js` | - | ALL PASSED |
| 2b | `cyc13-lead-best-stats.test.js` (new, two tabs) | 6 FAILED (8 / 5 / 4 instead of 6 / 4 / 3) | ALL PASSED |
| 2b | `cyc11-lead-town-stars.test.js` | - | ALL PASSED |
| 3 | `cyc13-lead-town-compass-z.test.js` (new: 1280x720, 390x844, 195x422) | 58 FAILED | ALL PASSED |
| 3 | `cyc12-lead-museum-panel`, `cyc7-ui-hud`, `nav-town`, `cyc2-ui-town-narrow` | - | ALL PASSED (each) |
| all | `PAGES=town,town-museum,realm-world,realm-dungeon VPS=160x284,195x422,390x844,1920x1080 a11y-viewport-sweep` | - | first run: **3 FAILED**, 2 new offenders on `town-museum`, both caused by my item 3 (see below); town, realm-world, realm-dungeon 0 offenders |
| 3 | `PAGES=town,town-museum a11y-viewport-sweep` (all 9 viewports + preference passes), after the two follow-up fixes | 2 offenders | ALL PASSED, 0 offenders (18 page views) |
| 3 | `cyc13-lead-town-compass-z` and `cyc12-lead-museum-panel` again after the follow-up fixes | - | ALL PASSED (each) |

Not run: the full suite (the coordinator's stamp), the full a11y sweep over all 17 page views, any real device.
`cyc11-s-move-float`, `cyc11-lead-town-stars`, `nav-town`, `cyc2-ui-town-narrow`, `cyc12-lead-museum-panel` and `cyc7-ui-hud` ran before
the last two small edits (the `rw-has-more` guard, which only matters at <= 190 px, and nothing in the Town); `cyc13-lead-realm-160`
was re-run after the guard and passed.

Screenshots (`game/design/beta/img/`): `cyc13-lead-realm-160-closed.jpg`, `cyc13-lead-realm-160-open.jpg`, `cyc13-lead-realm-195x422.jpg`,
`cyc13-lead-realm-390x844.jpg`, `cyc13-lead-realm-1280x720.jpg`, `cyc13-lead-museum-inert-{1280x720,390x844,195x422}.jpg`.
I looked at the two 160 px shots, the 390x844 Realm shot and the 390x844 Museum shot; not the others.

New tests registered in `test-tiers.json`: `cyc13-lead-realm-160` (browser, full), `cyc13-lead-best-stats` (browser, full),
`cyc13-lead-town-compass-z` (browser, full), `cyc13-lead-move-float-topsel` (node, smoke).

## Unresolved / known limits
- Realm World at 160x284 is free of overlaps but still cramped: the play field is the gaps between controls. The level / shards text
  and the zone line share a 48 px column (the zone name is cut with an ellipsis; while the Resting chip shows it takes the column), and
  the Next-goal text is only readable with the tray open. This is a layout that works, not a comfortable one.
- The fold is touch + portrait only. A 160 px wide desktop window (no touch) and a landscape screen under 190 px wide keep the old rules;
  the sweep does not test them.
- Not checked at 160 px: the boss bar, the co-op partner chip, the ID-53 hint (`#rw-jhint`), the big mini-map, and Text size above
  100% (`--mm-hud-scale` zooms HP / info / XP). They are transient or opt-in and the sweep opens none of them.
- The sweep's OVERLAP check stops at 8 offenders per page, so a page with 8 can hide more. Worth raising the cap.
- `setModalInert` is used by the Museum only. The other 15 Town dialogs still leave the HUD focusable behind them; the helper is
  generic and each open / close pair needs two lines plus a test.
- The compass fix is checked by showing each dialog (removing `hidden`), not by opening each one through its own game action, except
  the Museum.
- Only the Museum hides the compass; under the other 15 dialogs it is visible but covered. If the sweep ever opens those dialogs, its
  Menu rule will flag that (it accepts hidden, not covered). Either hide the compass for every modal Town dialog or let the rule accept
  "covered by a modal dialog that has its own close button": a U decision.
- Not touched from the cycle 12 Open list: home placement duplicate window, the refused-save audit (Polyroll, Museum donation,
  Scavenger, mailbox), Museum close button scrolling on desktop, `mm-shop-pin` in Backup.

## Proposals
1. Use `setModalInert` in every Town dialog open / close (one shared open/close helper would do it in one place).
2. Raise the OVERLAP cap from 8 to "all", and print the count.
3. Give the Realm Menu (pause) the bag, board, settings and Daily entries; then the More tray could be dropped and phones up to 260 px
   could lose four always-on HUD buttons too.
4. A `best` marker next to the stat definitions (instead of the `TOWN_BEST_STATS` list) so a new "best" stat cannot be added as a counter.
