# Cycle 5 - L Lead Developer

Branch `cyc5-lead`, cut from `claude/animal-crossing-game-7z3roh` @ 4b6d34e. Own server on port 9501. Nothing pushed.
Every browser run went through `/tmp/bt.sh`, Firebase blocked (`offlineStub` / `blockDb`, `db.attempts() === 0` asserted in each new test). `firebase-config.js` and `net.js` untouched. No save-format change.

## What changed

### 1. b15-13 (P2, open 3 rounds): Back with a menu open left the page
Cause found by reproduction (390x844, real tap + real `page.goBack()`): the shared "Menu" sheet (compass button, `MMNav`) already closed on Back since round 4. The tester's "Menu panel with Resume / Pick hero / Leave" is a DIFFERENT overlay, the Realm pause menu (the hamburger button, `realm.js setMenu`), which had no history entry. Same for the Realm backpack / board / hero / shop panels and the Isles Pack / chart panels.

Fix: one shared Back guard in `game/shared/mm-nav.js` (`MMNav.backLayer(key, closeFn)` / `MMNav.backRelease(key, keepEntry)`). While any overlay is open the page owns ONE extra history entry (same URL, state flag `mmNavSheet`, as before); Back closes every open overlay and stays; closing the last overlay by its own button pops the entry (deferred 40 ms so a close-then-open swap makes no history traffic); nothing is popped while the page is navigating away (`beforeunload` / `pagehide`), and Realm `stop()` keeps the entry (Leave must never be pulled back). Nothing is pushed inside an iframe (the Realm in the Town). The Menu sheet itself now uses the same guard.
- `realm.js`: `_panel()` calls `_backGuard()` in menu mode only (the standalone page; the Town gate is unchanged).
- `games/isles/isles.js`: `openPanel` / `closePanel` register / release the layer.

Check run: `tests/cyc5-lead-back.test.js` (new, 26 checks, 390x844 touch and 1280x720 mouse, real taps / clicks, real `goBack`): ALL PASSED. Red before: with the three source files reverted the first failing check is "Realm: Back with the pause Menu open closes it and stays in the Realm" (`path: /game/hub/index.html`), then the run cannot go on (it is on the Hub).
Also run, all green: `shared-mm-nav` (111/111), `nav-sheet`, `nav-realm`, `realm-menu`, `nav-hub-isles`, `beta-r4-d4-town`, `town-front-door`, `nav-consistency`.
Screens: `img/cyc5-lead-back-{phone,desktop}-{1-menu,2-after,3-isles-pack}.jpg`.

### 2. b01-r3-01 (P2): "better prey" printed over "New notebook page"
Cause: both are float texts spawned on the same kill at hero y-56 and y-60.
Fix: `realm.js` `_notice(text, color)`: sentence notices above the hero go through one queue. One shows at once when none is up; the next waits until the one before has faded (0.8 s). At most 6 wait; a line already waiting is not queued twice. Numbers (+xp, damage, shards) stay plain float texts. Moved onto the queue: "The Midlands has better prey", "New notebook page: ...", "Trophy for Mocha! ...", and the two storage-full lines. Notices also get the dark outline the full-pack sale text already had.

Check run: `tests/cyc5-lead-notices.test.js` (new, 14 checks, 1280x720 and 390x844): a real Lv 6 Shore kill of a creature new to the notebook raises both; a per-frame recorder sees both, never two in one frame; three raised in one frame show in order; plain numbers still show at once. ALL PASSED. Red before: `never two sentence notices on screen in the same frame {"max":2,...}`.
Existing test touched: `tests/cyc2-shore-fade.test.js` checked the toast in the same tick as the kill. The toast now waits behind the notebook notice from the earlier kills in that test, so the test waits for it (up to 8 s) and then still requires exactly one toast with the exact text. No assertion was removed. It passes.
Also run, green: `cyc3-notebook-blocked`.
Screens: `img/cyc5-lead-notice-{phone,desktop}-{1,2}.jpg`.

### 3. b10-r3-01 (P2): Angler tournament card past midnight
Cause: `renderTourney` showed `g.tourResult` for as long as it existed, and nothing cleared it until the next Start, which that same branch hid.
Fix (`games/angler/angler.js`): a Final whose `day` is not the current day is labelled "Yesterday's final: ..." ("Last final: ..." if older) and the new day's own line (Start / wait / complete) is drawn under it. A Final of the current day still stands alone (one tournament per day, unchanged).

Check run: `tests/cyc5-lead-angler-midnight.test.js` (new, 22 checks, 1280x720 and 390x844, real device date with `page.clock.setFixedTime`): A. run starts 23:59:30, last casts land after midnight: card shows yesterday's Final plus an enabled Start, Start begins day + 1, its Final then stands alone. B. run ends 23:50, card closed, clock moved to 00:01, card reopened with a real tap: Start is offered. ALL PASSED. Red before: 10 FAILED (`"start":null`, `Final: 427 points ...` with the day + 1 header).
Also run, green: `angler-tournament`, `angler-tournament-midnight`, `shared-mm-angler-tournament`, `angler-page`.
Screens: `img/cyc5-lead-angler-{phone,desktop}-{1-after-midnight,2-reopened}.jpg`.

### 4. b14-r3-N01 (P3): "unknown key refuses the whole file without naming it"
Checked first: NOT real as written. `MMBackup.plan()` already skips and names an unknown key and restores the rest (also for a bundle from a newer format version); `beta-s03-backup-skip` already covers it. A valid town save plus `mm-assist {dmg:0, aim:99}` also restores. The bare "That backup file is damaged." only comes from a bundle with no numeric `v` or no `keys` map (for example a hand-made file that says `version: 2`).
Change (`shared/mm-backup.js`): that refusal now says which part is at fault: `...damaged: its version number ("v") is missing or not a number.` / `...damaged: its list of saves ("keys") is missing.`

Check run: `tests/cyc5-lead-backup-key.test.js` (new, 12 checks: node `plan()` plus the Hub "Restore from a file" card with a real file pick at 1280x720 and 390x844): ALL PASSED. Red before (node part): 2 FAILED (bare "That backup file is damaged.").
Also run, green: `shared-mm-backup` (65/65), `beta-s03-backup-skip`, `beta-r4-o04-backup`.
Screens: `img/cyc5-lead-backup-{phone,desktop}-{1-named,2-unknown-skipped}.jpg`.

## Checked, no change

- **b03 "Lv 20 shown for a seeded Lv 25 save"**: not a bug. The level cap is 20 (`RM_MAX_LEVEL = 20`, realm.js:69) and the save cleaner clamps `level` to it (realm.js:336). A seeded 25 is out of range, so the HUD is right. Read from code only, no browser run.
- **b15-r3-02 idle hero fell on a landscape phone**: REPRODUCED, 1 of 2 runs, not fixed (time box). 844x390 touch, `?mode=world` (no test flag), first hero tapped, coach skipped, then no input at all. Run 0 (random seed, not recorded): HP 100 at 10 s, 52 at 20 s, 4 at 30 s, fell before 40 s, Shore, 0 kills (`img/cyc5-lead-idle-landscape-0-fell.jpg`). Run 1 (`&seed=777`): alive at 130 s with 46/100, losing about 6 HP every 10 to 20 s (`img/cyc5-lead-idle-landscape-1.jpg`). So the fall is real and depends on what spawns near the hero, and even the surviving run would fall at about 4 minutes. I did not compare with portrait, did not find which enemy did the damage, and there is no test for a passive start in the suite.

## Unresolved / not done

- The Back guard covers the shared Menu sheet, the Realm panels that go through `_panel` (Menu, backpack, board, heroes, shop) and the Isles panel. NOT covered: the Realm death card, the access / settings sheet, the Nexus and summary cards, the Isles settings sheet, and overlays in the minis and Deepdelve. Back there still leaves the page.
- The first-visit Realm hero picker is a panel, so it also owns a Back entry: on a scripted Back the picker closes first. In a real Chrome an entry added with no user gesture is skipped by the Back button, so a real player who has not touched the page should leave at once; I did not verify that on a real device.
- Only targeted tests were run (listed above). The full suite was not run by me.
- `page.goBack()` is the test's Back. A real phone back gesture was not available.

## Proposals

0. (D / S, P2) Passive start: add a seeded test "no input for 120 s at spawn, hero alive" over several seeds, then tune the Shore spawn ring or the first-minute aggro so it holds. Run 0 above lost 48 HP per 10 s with 0 kills.
1. Route the remaining overlays (death card, settings sheets, Nexus, mini-game cards) through `MMNav.backLayer`; it is one call on open and one on close.
2. Give notices a longer life than numbers (about 1.4 s): a sentence that fades in 0.7 s is short to read. Not done here because it changes pacing for every notice.
3. Angler: the card header shows the raw day number ("Day 20782"); a calendar date would read better.
