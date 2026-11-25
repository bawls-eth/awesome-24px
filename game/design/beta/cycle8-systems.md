# Cycle 8 - S (Game Systems) report

Branch `cyc8-systems`, cut from `4109161` (CYCLE-LOG: cycle 7). Own server port 9805 (a `git archive HEAD` copy on 9806 for red-before runs). Every browser run through `/tmp/bt.sh`; Firebase blocked in every run (offlineStub / blockDb; every browser test asserts literal `db.attempts() === 0`). `firebase-config.js`, `net.js` untouched. Nothing pushed. Only targeted tests run (not the full stamp).

Commit: `cebd1f7` (all three items, tests, screenshots) plus this report.

## 1. ID-09 Town wiring: BUILT
What changed
- `main.js`: new `townDayStep(saved, kind, today)` (+ `townUtcKey()` = `MMGameDay.utcKey()`). `setupLoginStreak` still calls the unchanged `streakStep` and writes `loginStreak` / `lastLoginDate` (rollback safe), then `MMGameDay.visitStep` on the new `visitDays` / `lastVisitDate`; save first, then pay `min(N, 5)` with the floating toast `👋 Welcome back! Day N in the village. +B ⭐`. The badge `#streak-count` shows `visitDays`. `updateSellStreak` the same on `sellDays` / `lastSellDay`; bonus line `🛍️ sell day N: +B ⭐` for N >= 2; `bestSellStreak` still kept.
- Seeding (first load with no count): `visitDays = max(loginStreak, 1)` / `sellDays = sellStreak`, with the OLD date, so a day the old code already paid is not paid again (checked).
- `sellstreak3` desc "Sell at the shop on 3 different days", check `bestSellStreak >= 3 || scene.sellDays >= 3` (id unchanged).
- `index.html`: badge "Days in town N" (title "Days you visited the village"); script tags `shared/mm-gameday.js` and `shared/mm-bounties.js` before main.js. Stats block label `🔥 Streak` -> `🏡 Days in town`.
- `style.css`: badge `white-space: nowrap`; under 260 px the two status chips stack (at 195 px "Days in town 7" wrapped to two lines before).
- `TOWN_SAVE_FIELDS` (main.js), `MMBackup` `TOWN_FIELDS`, `design/SAVE-KEYS.md`: the four keys (+ `bounty`).

Checks run (real results)
- `town-streak-clock.test.js` rewritten honestly (see the commit): part 1 (the `streakStep` table and story) untouched; part 2 keeps every old-key clock case (5 / 1 / 2 / 9 days ahead, yesterday, same day, real gap) as checks on the old keys, and moves the shown count and payout to the day counts with the same clock cases; a real gap now asserts +1 (was reset); new seed cases (old save counted yesterday / already today), badge text, `sellstreak3` text and check; the "no new keys" check now allows exactly the four approved keys and checks they are in `TOWN_SAVE_FIELDS`. **ALL PASSED** on the branch; **12 FAILED on HEAD** (port 9806).
- New `cyc8-s-town-days.test.js` (browser): script tag, badge markup, no "streak / missed / lost / don't" in the new strings, SAVE-KEYS line; stored date 5 days ago with visitDays 6 -> exact toast "Welcome back! Day 7 ... +5 ⭐", badge "Days in town 7"; reload same day -> no welcome, still 7; Backup bundle -> remove -> restore keeps the four fields; 195x422 badge on one line, no horizontal scroll. **ALL PASSED** (the 195 check failed first, fixed by the CSS above; one more failure was my line-height math ignoring padding, fixed in the test). Red-before: see the end of this file.
- `cyc7-s-visit-days.test.js` (node): ALL PASSED (header comment updated only). `cyc3-gameday-streak.test.js`: **ALL PASSED** (streakStep untouched).
- `town-8bit-menu.test.js`: text assertion only, `/Streak/` -> `/Days in town/` for the 6th stat label (named in the commit). Result: see the end of this file.

## 2. ID-18 Town bounties: BUILT
- `shared/mm-bounties.js`: `forDate(date, salt, pool)` (default pool output identical: compared with HEAD's module on 500 dates, 500/500 same), `TOWN_POOL` (shake-tree 5, catch-bug 3, wave 2, fish 2, dig-fossil 1, pick-flower 3), rewards `{ stars: 10..30 step 5 }`, `claim` returns `{ stars }` for the Town pool, new `cleanTown(raw, date, bounties)`.
- **Spec deviation:** the Town has no flower-watering action, so `water-flower / town:water` became `pick-flower / town:flower` ("Pick 3 flowers", counted in `collectFlower`). "wave" is the first hello of the day to a neighbor (inside `talkToVillager`'s once-per-villager-per-day branch), text "Say hi to 2 neighbors".
- `main.js`: `townBounties / bountyRecord / bountyEvent / claimBounty / renderBounties`; hooks after the item is granted: tree shake, `catchBug`, first villager greeting, `recordFishCatch`, `digFossil` (after the full-bag refusal), `collectFlower`. `bounty` written with `writeSave` before `awardPoint`. Day key = `townUtcKey()` (MMGameDay.utcKey). Not in "Today n/m", `DAILY_BONUS` unchanged.
- `index.html` / `style.css`: "📜 Today's bounties" section in the Dailies panel; rows `text  n/goal  +N ⭐  [Claim]` / "Claimed"; Claim 44 px; under 340 px the text takes its own line.
- New `cyc7-s-town-bounties.test.js` (node + browser): 14 node checks + 17 browser checks **ALL PASSED** (real tree shake via `interact()` 0/5 -> 1/5, same tree on cooldown does not count, stops at 5/5, Claim pays exactly the row's stars once, save-before-pay order recorded, reload keeps the claim, Backup round trip, next faked UTC day replaces rows, stale junk save loads, 390x844 / 195x422 no horizontal scroll and Claim >= 44 px, one line per row at 390). First run: 2 FAIL (my regex on concatenated row text; 195 px rows squeezed to 12 lines) -> test reads `.bounty-count`, CSS wraps under 340 px; rerun ALL PASSED. The UTC day is faked by wrapping `MMGameDay.utcKey` with a sessionStorage value in an init script.
- `cyc7-d-town-economy.test.js`: sim now reads the real module over 365 days (mean ~60, worst day 90); new check: mean 50-70 and the WORST day still <= 5 min of gathering. **ALL PASSED** (fixed ~129 stars = 3.9 min; worst day 159 < 165). Node, well inside the 5-minute cap.
- `shared-mm-events-bounties`, `shared-removed-modules`, `run-all-tiers`: ALL PASSED.

## 3. ID-51 "Resting" chip: BUILT
- `realm-world.js`: `#rw-rest` (role=status) inside `#rw-zone`, "💤 Resting: move to play" (phone: "💤 Resting", first on the one-line strip), toggled only when `arena.resting` changes (hidden in the Nexus). `mad-maze.css`: 12 px floor.
- New `cyc8-s-rest-chip.test.js`: 1280x720 + 390x844: hidden awake, shown after 8 s idle, on screen, >= 12 px, no h-scroll, one real key press / touch tap hides it, never shown on a Midlands tile. First run 1 FAIL (390: chip clipped off the end of the one-line zone strip) -> moved first + short text; rerun **ALL PASSED**.
- Screens: `img/cyc8-systems-rest-chip-1280x720.jpg`, `-390x844.jpg`, `img/cyc8-systems-bounties-{1280x720,390x844,195x422}.jpg`, `img/cyc8-systems-days-195x422.jpg`.

## Unresolved
- ID-18 water-flower replaced by pick-flower (no watering mechanic). D to confirm or spec a watering action.
- The welcome "toast" is the existing floating text (0.9 s); no persistent toast component was added.
- Full suite not run by me (coordinator stamp).

## Proposals
1. (D) Confirm `pick-flower` and the "Say hi" wording for `wave`.
2. (U) Look at the 195 px Dailies panel; the bounty section is reachable by scroll only.

## Red-before and late results (all real runs)
- Red-before against a `git archive HEAD` copy on port 9806, with the branch's test files:
  - `town-streak-clock.test.js` (rewritten): 12 FAILED on HEAD; ALL PASSED on the branch.
  - `cyc8-s-town-days.test.js`: the browser part aborts on HEAD (`MMGameDay is not defined`: the Town page did not load it). The static checks in that file read the worktree files, so they say nothing about HEAD. ALL PASSED on the branch (final rerun after the padding fix).
  - `cyc7-s-town-bounties.test.js`: on HEAD the panel has no bounty rows (FAIL), then aborts. ALL PASSED on the branch.
  - `cyc8-s-rest-chip.test.js`: on HEAD every chip check FAILS (`exists:false`). ALL PASSED on the branch.
- `town-8bit-menu.test.js` (text assertion updated): ALL PASSED on the branch.
