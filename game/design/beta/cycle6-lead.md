# Cycle 6 - L Lead Developer

Branch `cyc6-lead`, cut from `claude/animal-crossing-game-7z3roh` @ 99036b7. Own server on port 9601. Nothing pushed.
Every browser run went through `/tmp/bt.sh`, Firebase blocked (`offlineStub` / `blockDb`, literal `db.attempts() === 0` asserted in each new test). `firebase-config.js`, `net.js` and `ci-status.json` untouched. No save-format change. Only targeted tests were run; the full suite was not run by me.

## 1. Back guard on the remaining overlays

New in `shared/mm-nav.js`: `MMNav.backWatch(el, closeFn, key)` (one call at setup; the layer follows the element's `hidden` attribute / `hidden` class, so overlays opened and closed from many places need no per-site calls) and `MMNav.backLayers()` (read-only list of open layer keys, used by the test).

| Overlay | How | Back now does |
|---|---|---|
| Realm fall card | `realm.js` `_deathGuard` (menu mode only) | closes the card and starts a fresh run, same as "Try again"; the next Back leaves. Leave keeps the entry and is never pulled back |
| Realm access / settings sheet (gear, "More settings") | `mad-maze.js` `backWatch(axEl)` | closes the sheet (and the pause Menu the gear opened) |
| Shared Settings sheet (`MMSettings`): Realm shared panel, Isles, Deepdelve, Angler, Dash, Echo, Bugs, Stalk, Town | `shared/mm-settings.js` open / close | closes the sheet |
| Realm Nexus | `realm-world.js` nexusOpen / nexusClose | returns to the Realm (notebook closed too); the run is not paused afterwards. A portal that navigates away keeps the entry |
| Deepdelve Craft, Goals, dive summary | `deepdelve.js` `backWatch` | closes the panel |
| Angler Journal, Gear, Tournament, Market, Aquarium | `angler.js` `backWatch` | closes the card |

First-visit Realm hero picker: on the cycle-5 tip it DID hold a scripted Back (first Back closed the picker and stayed, see "red before"). Now the picker that opens by itself before the player has touched the page (`navigator.userActivation.hasBeenActive === false`) takes no Back entry: one Back leaves. A picker the player opens from the Menu is guarded as before.

Design call made here (U / owner may overrule): Back on the fall card = Try again, not Leave.

Check run: `tests/cyc6-lead-back.test.js` (new; 390x844 touch and 1280x720 mouse; real taps / clicks; real `page.goBack()`; 26 checks per view): ALL PASSED. Covered by it: first-visit picker (no entry, one Back leaves), Realm gear sheet, fall card (Back = fresh run with full HP; Leave leaves and stays away), Nexus, Isles Settings sheet, Deepdelve Craft + Goals, Angler Journal (also closed by its own button: no entry left), Dash Settings sheet, "next Back leaves" on Isles / Deepdelve / Angler.
Red before (same test against a `git archive 99036b7` copy served from the same port): 0 PASS; the first 4 checks FAIL ("hero picker ... owns NO Back entry" `flag:true`; "ONE Back ... leaves" still on the Realm; gear sheet still open after Back), then the run aborts.
Also run, green after the change: `cyc5-lead-back`, `shared-mm-nav` (111/111), `nav-sheet`, `nav-realm`, `realm-menu`, `shared-mm-settings`, `beta-g12-esc-close`, `world-page`, `nav-hub-isles`, `nav-consistency`, `run-all-tiers`.
Screens: `img/cyc6-lead-back-{phone,desktop}-{1..9}-*.jpg`.

NOT covered (deliberately, they are terminal cards whose own buttons all navigate or restart): the dungeon summary (`#mm-summary`) and the minis' result cards (`MMMiniKit.result`; "nothing destructive closes the card"). Back there leaves the page as before. Not tested by me with Back: Angler Gear / Tournament / Market / Aquarium, the Deepdelve dive summary, Echo / Bugs / Stalk / Town Settings (same code path as the tested ones, but no run of their own). 195x422 not run. `page.goBack()` is the test's Back; no real phone gesture.

## 2. Idle hero falls: seeded test and numbers for D

Not a landscape bug. The first-run coach shields a hero who has not acted (hits 25%, HP never under half; `realm-tutorial.js` `hurtGuard`). Once the coach is skipped (its own Skip button) normal rules apply, and a hero standing still at the spawn falls within seconds on most seeds, in portrait too.

Test: `tests/cyc6-open/cyc6-lead-passive-landscape.test.js` (new). 844x390 touch, new profile, `?mode=world&from=hub&test=1&tutorial=1&seed=N`, first hero tapped, coach skipped by tapping Skip, no input for 120 game seconds, 6 seeds, asserts "alive". Two pass-through wrappers in the page only record which enemy fired the bolt that hit (nearest live enemy at the muzzle). `VIEW=390x844` / `SEEDS=` override.
Result: **RED, 4 of 6 seeds fall** (run once at load factor 3.1). It is parked in `tests/cyc6-open/` (same pattern as `tests/r4-open/`) and is NOT in `test-tiers.json`, because registering it would turn the stamp red and I was told not to tune spawn data. D: move it into `game/tests/` (change `../helpers` to `./helpers`) and register it once it is green.

| Seed (844x390) | Result | HP at first sample | Enemies within 420 px | HP lost by source | Bolts fired by source |
|---|---|---|---|---|---|
| 12345 | fell at 9 s | 84 | 4 | water_elemental 78, unattributed 6 | water_elemental 84 |
| 4242 | fell at 8 s | 76 | 6 | sprout 58, slime_green 6, unattributed 12 | sprout 45, water_elemental 36, slime_green 11 |
| 9001 | fell at 16 s | 74 | 2 | sprout 56, crab_giant 12, unattributed 6 | sprout 36, crab_giant 74 |
| 31337 | fell at 9 s | 80 | 4 | sprout 62, slime_green 6, unattributed 12 | slime_green 45, sprout 35 |
| 777 | alive, 34/100 at 120 s | 100 | 0 | sprout_mini 66 (about 6 HP per 10 s from 20 s on) | sprout_mini 989 |
| 2026 | alive, 100/100 | 100 | 1 | none | none |

All seeds: sprout 176, water_elemental 78, sprout_mini 66, unattributed 36, slime_green 12, crab_giant 12. Every hit is 6 HP (no zone multiplier seen). "HP at first sample" is already below 100 on the four falling seeds: the hero was hit in the second or two between the Skip tap and the first reading.
Portrait check (390x844, seeds 12345 / 4242 / 9001, one run): all three fell (15 s, 5 s, 7 s); sources water_elemental 78, sprout 68, crab_giant 12, unattributed 30. So the viewport is not the cause.
Limits: one run per seed per viewport; attribution is "nearest live enemy within 90 px of the muzzle", so "unattributed" hits exist; the falling runs give only 1 or 2 ten-second samples. The zone label read "Shore · Safe-ish" on every seed. Screens: `img/cyc6-lead-passive-844x390-seed*.jpg`.

For D: the main dealer is the **sprout** (and its `sprout_mini`, which alone drains a third of the bar in 120 s on a seed with nothing else near), then the **water_elemental** (84 bolts in about 9 s on seed 12345, 78 HP). Things to look at: enemies already awake and firing inside 420 px of the spawn point at second 0 (4 to 6 on the falling seeds), and the sprout / water_elemental fire rate at the Shore.

## 3. Review pass

- **Realm listener creep (+5/min, retest r2): not reproduced.** 60 s of Realm play at 390x844 (hero walking and auto-firing): CDP `JSEventListeners` 2371 at each of 4 readings; a wrapper on `addEventListener` saw 0 calls after the run started (147 in total at load, 0 removes). Not tested: panels opening and closing, kills with loot, a 10-minute run. No change made.
- **Fixed (perf): the shared Menu scanned the whole document on every DOM change.** `mm-nav.js` observed all child-list changes under `<body>` and ran `querySelectorAll('.mm-nav-legacy:not(...)')` per batch. Now only a batch that adds an element counts, at most one scan per frame.
  Check run: `tests/cyc6-lead-nav-scan.test.js` (new, both views, 6 s of Realm play with real keys, plus "a legacy link added later is still hidden"): ALL PASSED, 0 scans in about 380 frames. Red before: 36 scans in the same 6 s on both views (2 FAILED). So the saving is about 6 whole-document queries a second in the Realm, not one per frame; small, but it was on every page with the Menu.
- Dead code and per-frame allocation review of `realm.js` / `main.js`: NOT done (time box). Nothing to report there.

## Unresolved

- Item 2 is found and measured, not fixed (by instruction). The red test sits outside the suite.
- Dungeon summary and mini result cards have no Back guard (see item 1).
- The Back test was not run at 195x422, and no real device Back gesture was available.

## Proposals

1. (D, P2) Give a just-spawned hero a few quiet seconds after the coach ends (no enemy awake inside the spawn ring, or bolts do nothing until the first input), then make `cyc6-lead-passive-landscape` green and register it.
2. (S / L) Record the bolt's owner on the bolt (`b.src`) in `fireEnemyBullet`: the fall card could then say what felled the hero, and tests would not need the muzzle guess.
3. (U) Decide Back on the fall card (Try again now) and whether the dungeon summary should hold Back.
