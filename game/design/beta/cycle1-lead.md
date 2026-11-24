# Cycle 1, Lead Developer

Branch `cyc1-lead` (cut from `claude/animal-crossing-game-7z3roh` 86eda4b). Own server on port 9711, every browser command through
`/tmp/bt.sh`, database blocked (`blockDb` / `offlineStub`; every Town test here asserts `db.attempts() === 0`). Targeted tests only;
the full suite and the live-class tests were NOT run here. Nothing pushed.

## 1. IDEAS.md feasibility review (ID-01..14)
Status and a one-line reason are in the table of `game/design/IDEAS.md`, longer reasons in its new section "Feasibility review (L, cycle 1)".
- approved (5): ID-02 and ID-03 (confirmed, not revoked), ID-04, ID-12, ID-13.
- needs-change (9): ID-01 (fade by hero level where the kill pays, not in `ZONE_MUL.xp`), ID-05 (one preset first, benchmark), ID-06 (no
  game-speed slider), ID-07 (`mm-tames.js` already saves `bond` / `aff`), ID-08 (one writer per key: store in the Realm save), ID-09
  (the Town still pays login / sell streaks: owner decides with L-08), ID-10 (`mm-minikit` already has `result` + `panel`: a migration),
  ID-11 (reuse `save.returnTo` + `safeReturn` for the Nexus trip, no crafted item), ID-14 (hit pause may not move the sim clock).
- rejected: none.

## 2. Fixed (each measured before and after, each with a test that is red on the old code)

| id | where | before -> after | test | other checks run (all green) |
|---|---|---|---|---|
| L-18 | realm.js `_readReduced`, new `_rmOs` / `_readReducedFrame`; dungeon.js HUD line | 120 dungeon frames: `matchMedia('(prefers-reduced-motion...)')` 120 -> 0, `getItem('mm-reduce-motion')` 120 -> 35 (at most one per 50 ms), `getElementById('realm-wave')` 120 -> 0, `'realm-biome'` 120 -> 0 | `realm-frame-lookups.test.js` (3 checks red before) | realm-polish, realm-access2, telegraph-arena, enemy-death-art, realm-bugbash, realm-menu, realm-settings, realm-wire, dungeon-mutators, realm-shard-tick-hud, world-camera |
| L-09 | main.js `updateDigHoleHint`, `updateFishHint`, `updateRealmGateHint`, `updateGatePointer`, `updateGiftHint`, new `hintEl` / `setHintHidden` | 120 idle Town frames: `getElementById` for the five hints 600 -> 0, `classList.toggle` 600 -> 0; near a villager the gift label is built 120 -> 1 times and opacity is written only on change | `town-hint-lookups.test.js` (offline stub; 3 checks red before) | nav-town, town-bugbash, beta-r4-d4-town, beta-r4-d4-mobile, town-isles-sign |
| L-10 | underground.js `_forwardVector`, `_update`, `_removeTarget`, `_hidePlacedInstance`, `_putBlock`, new `_scratch` | 120 walking frames in third-person view: distinct look vectors 120 -> 1, Eulers 120 -> 1, walk-direction vectors 120 -> 1; 8 block edits: Matrix4 objects 8 -> 1 | `cave-frame-alloc.test.js` (offline stub; 4 checks red before) | beta-s08-town-three-lazy |
| L-15 | shared/mm-save-merge.js new `writeMedalSave`; dash.js, echo.js, pop.js, stack.js `writeSave` | the 7-line merge block: 4 copies -> 1 function (dash keeps its ghost rule and passes the prepared save). Stored data: byte-identical in 3000 seeded cases against the old block (both keys, save, base, thrown error, full storage on the first or the second write) | `shared-mm-save-medal-write.test.js` (node, smoke tier; 4 checks red before) | echo-page, pop-page, stack-page, dash-page, save-race-tabs, echo-bugbash, dash-bugbash, shared-mm-save-merge, save-merge-fuzz |
| L-16 | isles.js `lastShore`, `drawCalls`, `firstVisit`; dungeon.js `keyFound`; realm-tutorial.js `tuBag` | 5 assigned-never-read bindings -> 0; `ISL.noteVisit` and `state.pickKey()` still run | no new test (no behaviour to test) | realm-tutorial, beta-g15-tutorial-first-minute, dungeon-mutators, dungeon-pickups, isles-access, isles-ftue-fixes |
| L-07 | main.js new `streakStep` / `streakDayNumber`, `setupLoginStreak`, `updateSellStreak` | a stored streak date in the future: login streak 7 -> 1 and sell streak 4 -> 1 before; kept at 7 and 4 now | `town-streak-clock.test.js` (offline stub; 17 rule rows, a 5-day story, 10 Town checks; 6 red before) | town-concert-once, town-hour-windows, nav-town, save-compat-pages |

`run-all-tiers.test.js` is green with the five new entries in `test-tiers.json` (inserted after `realm-destroy-listeners`, not at the end,
to keep clear of other roles' appends).

### Notes on the choices
- **L-18**: `realm-polish` expects an OS flip on the next update and `enemy-death-art` a stored flip within 100 ms, so the 4 Hz idea from
  cycle 0 was not safe. One MediaQueryList is kept (`.matches` is live, so the OS setting is still followed on the very next frame); only
  the stored override is throttled (50 ms). `_readReduced()` is still the full, immediate read (start, settings, tests). A clock that does
  not move between frames (a frozen test clock) reads the store every frame, as before.
- **L-09**: the elements are kept per id and looked up again only if one left the page (`isConnected`). `updateGatePointer` now checks its
  200 ms throttle before anything else. The two lookups inside it (`whats-new-banner`, `achievement-toast`, 5 times a second) are unchanged.
- **L-10**: `underground.js` is the Town cave, not Deepdelve, so the Deepdelve perf tests do not load it; the new test measures the cave
  itself. `_forwardVector()` now returns a shared vector: both callers use it at once (`Raycaster.set` copies it; the test proves it).
- **L-15**: done in one commit, not one game per commit as cycle 0 suggested: the oracle test covers all four keys at once. The
  `if (!M ...)` plain write stays (and now also catches a cached older module without `writeMedalSave`), so a stale cache cannot break a
  save. The four `newSeed()` copies and the four `esc` arrows in realm.js are NOT merged (out of this item).
- **L-07, the rule** (`streakStep(lastDate, streak, today)`, UTC day keys, no save key added):
  1. same day: nothing. Yesterday: +1 and the bonus. Older, missing or unreadable: Day 1 (all as before).
  2. stored date 1 or 2 days ahead: that day is already counted, so the streak waits for it: nothing written, nothing paid. Played daily
     it goes 7, 7, 7, 8, 9 (no reset, no second bonus for the same day).
  3. stored date more than 2 days ahead: the date is ignored. The streak is kept, the date becomes today, no bonus today; tomorrow is +1.
     So a clock that was a month ahead cannot freeze the streak for a month.
  4. device date before 2026-11-01 with an existing streak (a dead clock battery showing 1970 or 2000): the streak and its date are left
     exactly as they are (no reset, no write). A new player on such a clock still gets Day 1.

## Browser check (CYCLE.md step 4)
Town, offline stub, desktop 1280x720 and phone 390x844, standing next to Mocha: the gift button reads "🎁 Gift Mocha 🍎🌸" (desktop box
554,416 173x36; phone 223,663 155x33), no page error, no horizontal scroll (scrollWidth = innerWidth), 0 database requests.
Screenshots: `img/cyc1-lead-hints-desktop.jpg`, `img/cyc1-lead-hints-phone.jpg`. The other changes have nothing to see.

## Unresolved / for the coordinator
- **Not run here (database blocked for this role)**: every live-class test. The ones that touch what changed: `cave*.test.js` (L-10),
  `saves.test.js`, `town-first-ten`, `phone-panel`, `realm.test.js` (L-09 hints, L-07 streak). They are in the stamp.
- **L-07 known limit**: a clock set BACK by more than 2 days (but not before 2026-11-01), played, then put right, still loses the streak:
  rule 3 re-anchors to the wrong "today", and the next real day sees a gap. Closing it needs one additive key (the furthest date ever
  counted) plus an entry in `mm-backup.js` TOWN_FIELDS; proposal only, not built. The streak bonus can still be farmed by moving the
  clock forward a day at a time, as before (capped at +5).
- **L-07 vs IDEAS hard limits**: IDEAS.md says "no streaks across days", the Town pays two. Owner decision with L-08 and ID-09.
- **L-08**: untouched (owner decision). `net.js` and `firebase-config.js` untouched.
- **L-18 rest**: the 35 `getItem` reads per 2 s remain by design (the 100 ms promise to `enemy-death-art`).
- **L-15 rest**: `newSeed()` x4 and realm.js `esc` x4 still duplicated. L-13 and L-14 (unused modules, Arcane scaffold) still open.
- Timing numbers are counts, not milliseconds: the box was shared (load factor 3.8 to 5.1 during the runs), so frame times were not
  comparable between runs and none are claimed.
