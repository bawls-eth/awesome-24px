# Cycle 10: S (Game Systems Developer)

Branch `cyc10-systems` (worktree /tmp/wt-cyc10-systems, cut from `claude/animal-crossing-game-7z3roh` at 8cf8f36), port 9105. Nothing pushed.

## What changed

### ID-53: just-in-time hint (approved by L and U in cycle 9)
`game/games/mad-maze/realm-world.js` (block "cycle 10 S, ID-53"), `game/games/mad-maze/mad-maze.css` (`#rw-jhint`).
- What it is: one DOM line, `#rw-jhint`, with `role=status`, `aria-live=polite`, 13 px text (12 px floor) and a 44x44 px ✕ button labelled "Dismiss hint". Esc closes it. With the Menu hint up ("Press Esc to open the Menu") the same Esc also opens the Menu, as the text says; for the other verbs it is captured so the Menu does not open (L review, cycle 10). It has no animation at all, so there is nothing to switch off for reduced motion or flashes-off.
- When it shows: after 20 game seconds with no rewarding thing (a kill, a pickup, XP, shards, a level or a new item), and only once the hero has moved this visit.
  - It names one verb that is never "move": walk over the drops, ability 1 (Q, or "Tap ability 1" on touch), or the Menu.
  - Each verb is used once. After that, a verb the player has still not done may repeat, never the one just shown.
- When it never shows: while resting (ID-51; the 20 s count starts again after the rest ends), in a dungeon or co-op, in the Trial of Six, with a boss bar up, with a world event active, with a panel / pause / the Nexus / the ID-55 card open, or while a notice, the event hint, the banner or the coach / coach toast is up.
- Limit: max 3 per visit, kept in memory only (no save key).
- Hiding: it hides on a reward, when a block condition starts, when the named verb is done, or after 12 s.
- Cost: no work per frame beyond one subtraction. The check runs once a second and layout is read only when the hint shows. It adds no arena fields: all state lives in the world closure (`cyc9-lead-pool-shapes` still passes).
- Placement:
  - First slot: centred, above the ability grid, the help line and the portal / site / lair prompts, and 40 px or more above the sticks.
  - Second slot (added for 195x422): under the top HUD, left of the minimap, with short wording below 300 px.
  - It never shows if it would touch the zone strip, the goal line, the minimap, the HUD, the ability grid, a stick, or ANY visible button / link / role=button (the Daily and gear buttons, the Menu).
- Off switch: `?jithint=0`. Test hooks: `__mm.world.jitHint.state()` and `showNow()`.

### ID-55: first-session ending card (approved by L and U in cycle 9)
`game/games/mad-maze/realm-world.js` (block "cycle 10 S, ID-55"), `game/realm.js` (save cleaner and merge), `game/games/mad-maze/index.html` (loads `shared/mm-minikit.js` and `.css`), `mad-maze.css` (`#rw-firstend`).
- Who gets it: a first-ever session, meaning `realm.firstEndSeen` is absent and the hero is Lv 3 or below at the first world load in the tab.
- When it is due:
  - after 480 GAME seconds in the world. The clock lives in sessionStorage `pixeltown-firstend-s`, so a dungeon trip, which reloads the page, keeps it. The world tick does not run while the arena is paused or the tab is hidden.
  - or at once after the first dungeon clear of the session (`pixeltown-deep-v1` gained a cleared biome).
- When it opens: only at a quiet moment: no active enemy within 420 px, and no boss, event, Trial, dungeon, panel or Nexus. It closes itself if an enemy comes within 300 px, because the world does not pause.
- Built with `MMMiniKit.panel` / `result`:
  - Contents: "Nice first run!", Level / Tames / Shards (the save's own numbers through `MMMiniKit.fmt`), and one goal line.
  - Goal: the Isles while the player has no tame (`../isles/index.html`, saved first), else the next zone inland.
  - Buttons: "Go: <goal>" and "Not now".
- Behaviour:
  - Focus goes to Not now.
  - Esc closes it, captured so the Menu does not open, and the browser Back closes it (`MMNav.backWatch`). Focus returns to `#realm-canvas-wrap`.
  - The card is marked seen only after `MMMiniKit.panel` has built it (L review).
  - The session clock is written to sessionStorage every 5 s and on pagehide, not every second (L review).
  - The kit's R / Enter keys are held (`keyReady: () => false`), and a 600 ms click guard stops play taps landing on Go.
- Save: additive `realm.firstEndSeen: 1` in `pixeltown-save-v1`.
  - `rmCleanSave` keeps exactly 1 (anything else = absent, so old saves stay byte-identical) and `rmMergeSave` unions it.
  - Backup copies the whole `pixeltown-save-v1`, so it carries the flag (tested).
  - The in-memory `feDone` flag is set first, so a failed save never shows it twice in one visit.
- Off switch: `?firstend=0`. Test-only `?fesec=N` (only with `test=1`) shortens the 480 s clock.
- `design/SAVE-KEYS.md` lists the new `realm.firstEndSeen` field and the sessionStorage key.

### ID-58: skipped
It is still `proposed` in IDEAS.md. No L or U section reviews or approves it, so I did not build it or mark it approved.

IDEAS.md: the ID-53 and ID-55 rows now read "built cycle 10 S (branch cyc10-systems), D/U to verify in play".

## Checks actually run (real results)
All runs went through `/tmp/bt.sh` on port 9105, offline (blockDb, WebSockets closed) with literal `db.attempts() === 0`.

| Check | Result |
|---|---|
| `cyc10-s-first-end.test.js` (new) | 23/23 PASS: save cleaner and merge; Backup round trip; desktop card (paused-clock, quiet gate with a held enemy, numbers, focus, Esc, no Menu, reload never again); dungeon-clear trigger with a failing save (shows once, never again in the visit); 390x844 and 195x422 fit / no sideways scroll / 44 px buttons / no broken words / Back closes it |
| `cyc10-s-first-end.test.js` after the L review fixes | first run: 4 FAIL, a test race (under load the page setup took about 4 game s, so with `?fesec=4` the card opened before the "hidden at start" check). Test now uses `?fesec=12`. Rerun: **23/23 PASS** |
| `cyc10-s-first-end.test.js` on the base commit 8cf8f36 (separate worktree, port 9115) | FAIL as expected (`firstEndSeen` dropped by the cleaner, `#rw-firstend` missing) |
| `cyc10-s-jit-hint.test.js` (new) | 21/21 PASS on the full run before the last change. Covered: idle Shore hero rests and gets no hint after 25 s; Highlands hint after one real move and 20 s; real Esc (no Menu); next hint after another 20 s with a different verb; real click on ✕; 3rd hint then none after 25 s more; touch placement at 390x844 and 844x390. **That run's 195x422 checks were later found to be wrong:** the screenshot showed the hint under the Daily button, so I changed the code (see "Unresolved"). |
| `cyc10-s-jit-hint.test.js` after the 195x422 change, `PHONES_ONLY=1` | 10/10 PASS: 390x844, 844x390, and 195x422 refusing (why = overlap, covers nothing) |
| `cyc10-s-jit-hint.test.js` full rerun after that change | 1 FAIL: a seeded Highlands raid went active during the 3rd wait. The hint was correctly held (`block: event`) and the wait timed out. Fixed in the test: it pushes the event clock past active events with the existing `jumpEventClock` hook |
| `cyc10-s-jit-hint.test.js` after the L review fixes (Menu-hint Esc opens the Menu; per-verb dismissal) | **20/20 PASS**, including: Menu hint + Esc opens the Menu; another hint + Esc does not; ✕ click; max 3; 390 / 844 / 195 |
| `cyc10-s-jit-hint.test.js` on the base commit | FAIL as expected (`#rw-jhint` missing) |
| `cyc8-s-rest-chip.test.js` | 12/12 PASS |
| `cyc9-lead-pool-shapes.test.js` | 14/14 PASS (no arena field added late) |
| `save-compat-pages.test.js` | 453/453 PASS |
| `save-hostile-fuzz.test.js` (node) | ALL PASSED (its KNOWN-BUG line about `pixeltown-backup-pregear-v1` / `arcane-frontier-save-v1` was there before this change) |
| `a11y-viewport-sweep.test.js` | 131/131 PASS (run on the code before the 195x422 and L-review changes, both of which only narrow when the hint or card shows) |

Screenshots, all from real browser runs:
- `game/design/beta/img/cyc10-systems-first-end-{1280x720,390x844,195x422}.jpg`
- `game/design/beta/img/cyc10-systems-jit-hint-{1280x720,390x844,844x390}.jpg`

## Unresolved
1. **ID-53 at 195x422: there is no free slot, so the hint does not show there.** Every band at 195x422 is taken by the Daily button, the zone strip, the goal line, the minimap, the ability grid and the sticks. U's rules (never on a control, never on the goal or zone strip, 40 px clear of the sticks) cannot all hold together with "it may wrap to 2 lines". The hint therefore refuses (`why = 'overlap'`) and waits; the test asserts that it covers nothing. U to decide. One option: below 300 px wide, the hint takes the goal line's place for its 12 s.
2. ID-55 card at 195x422 covers the screen centre (where the hero is). It only opens at a quiet moment and closes itself when an enemy comes within 300 px, as L's condition 1 asks. It was not tested on a real phone.
3. Who counts as "first-ever": I defined it as Lv 3 or below at the first world load in the tab, plus no `firstEndSeen`. Veteran players never see the card. A player whose first session ended before 8 minutes will not get it in a later session either (they come back at a higher level). D to confirm.
4. Real-human play is untested. Real phone gestures (Back, touch) were tested only through Playwright.

## Proposals
- ID-53: also hold the hint while enemies are aggroed within about 300 px. The 1280x720 test shot shows the hint in the Highlands while creatures swarm the hero: it is allowed by the spec, but it is a busy moment for a tip.
- ID-55: a "Go" for a zone goal could light up the ➤ arrow toward that zone. Today it shows a banner only.

## L review (game/design/beta/fixes/cycle-10-lead.md on cyc10-lead), answered
1. The Menu hint said "Press Esc" but swallowed that Esc: **fixed**. The test now asserts that Esc hides the Menu hint AND opens the Menu, that Esc hides any other hint without opening the Menu, and that a ✕ click hides a hint.
2. The card was marked seen before it was built: **fixed**. The save now runs only after the panel exists; `feDone` is still set first.
3. sessionStorage was written every second: **fixed**. It is written every 5 s and on pagehide.
4. Layout reads in `jhBlock`: **no change.** `jhVisible` checks the `hidden` class and attribute first; `getClientRects` and `getComputedStyle` run only for an element that is actually shown (a banner or coach that is up), and then the hint is blocked anyway. I did not measure it.
5. Save and merge: L found them fine; no change.
