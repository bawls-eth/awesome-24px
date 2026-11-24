# Cycle 5, D (Gameplay Designer): report

Branch `cyc5-design` (cut from the dev tip 4b6d34e via a merge, because the worktree started on an older commit). Own server port 9504, Firebase blocked in every browser run (blockDb / route abort), nothing written to the DB, no chat. Nothing pushed.

## 1. b05 P2: Oakback golden-apple pace (CHANGED, data only)
Finding: Oakback needs `ceil(12 x 1.12)` = 14 golden apples at Lv 5 (feed pace 14 s, golden apple quality 1). The home isle had 4 glints with a 300 s respawn. Meadow Strider (11 apples) also lists golden apples first, so both tames share this supply.
Change: `game/shared/mm-isle-craft.js` meadow `golden_apple` row: 4 glints / 300 s -> **6 glints / 120 s** (zone 2-3 only, unchanged). It is the last row of the meadow list, so the seeded placement of every other food glint is unchanged.
Check run (`cyc5-d-oakback-pace.test.js`, real MMIsleCraft + MMCreatures + MMTame, a simulated player who walks 12 s per glint and feeds at the taming pace):
| | before (4 / 300 s) | after (6 / 120 s) |
|---|---|---|
| Oakback alone | 988 s (16.5 min), FAIL gate <= 6 min | 351 s (5.8 min), pass |
| Strider alone (first of two) | 958 s | 287 s (gate <= 5 min) |
| Strider then Oakback | 1950 s | 647 s (gate <= 12 min) |
The test also keeps a floor (Oakback >= 3 min) so it is still a goal, and asserts the apples stay in zones 2-3. Test failed before the data change (3 FAIL) and passes after. Real page: `cyc5-design-shots.js` shows 6 golden-apple glints placed on the home isle at 1280x720 and 390x844, 0 page errors (img `cyc5-design-isles-home-desk.jpg`, `-phone.jpg`). Other gates: `beta-r4-b05-05-oakback-food`, `shared-mm-isle-pouch`, `shared-mm-isle-craft` (node) pass; `isles-craft` and `isles-first-ten` (browser, 9504) ALL PASSED. The other tames' pacing is untouched (only this row changed). Limitation: the player model is a simulation, not a human; no real-time wait was played.

## 2. b03 P2: Trial of Six numbers (NO tuning applied; measured and pinned)
The b03-r3 death (16.7 s) was a scripted bot standing near the boss. I extended `beta/tools/trial-bot.js` with optional human-skill knobs (env `SLOW_MS` extra wait per loop, `MARGIN` dodge radius, `ORBIT`, `STEPS`; defaults identical to before). Hero Lv 20, common wand, 252 HP, real mouse/keyboard input, DB blocked (0 requests):
| bot | fight 1 (Inferno Wyrm, 990 HP) |
|---|---|
| default (59 Hz, margin 34) | 66.5 s, 0 damage, closest bolt 29 px |
| 25 Hz, margin 26 | 68.2 s, 0 damage, closest 18.8 px |
| 17 Hz, margin 20 | 69.1 s, 0 damage, closest 16.8 px (hit radius 15) |
| 17 Hz, NO dodge (margin 1) | DIED at 33.3 s after 7 hits (224 of 252 HP) |
Full six-fight run, slow bot (20-29 Hz, margin 26), all six won: 68.6 / 71.0 / 69.2 / 68.9 / 72.5 / 74.8 s = 425 s (7.1 min), damage 0 / 16 / 8 / 0 / 0 / 0 (24 of 252 HP), closest bolt 11.3 px (fight 2, two hits), bolt peak 40 (80 in fights 5-6 in this run).
Reading: a dodging player sits in the target band (66-75 s, inside 40-90 s); lingering without dodging is lethal in about 33 s, which matches b03's 16.7 s for standing near. So the "dies in 16.7 s" result is bot behaviour, not a numbers fault, and fights 1-6 are if anything easy for a competent dodger (consistent with ID-36 / cycle 4: layers for fights 4-6 are the right lever, not lowering anything). I therefore applied NO data change. `cyc5-d-trial-numbers.test.js` pins the current numbers (ramp, fight 1 multipliers hp x99 / dmg x4.004, 0.6 s wind-up) so a later change forces a re-measure; it is a pin, it did not fail before. Honest gaps: no human played it; the bot is a lookahead dodger, not a person; the second sample of fights 2-6 is one run; the Nexus button path and rest/leave buttons were not exercised.
Proposal: if a human pass shows fight 1 too hard, the data-only knob is `RUSH.ramp.dmg` (fights 1-2 are 1.0) or a Trial-wide hit damage of 8 -> 6; not applied without human evidence.

## 3. b11 P3: Stalk "You paid about 90 on Sunday" with 0 stalks (FIXED)
`game/games/stalk/stalk.js` render(): the purchase line now shows only when `save.invested > 0` (stalks were bought this week, even if all are sold); otherwise it says "Sell price now. You have no stalks this week (Sunday was the buy day)." Test `cyc5-d-stalk-paid-line.test.js` (390x844): 0 bought -> no "You paid" (FAILED before the fix with "You paid about 103 on Sunday", passes after); held -> "up to about N"; sold out after buying -> still truthful. Screenshots `cyc5-design-stalk-phone.jpg` / `-desk.jpg`; note text confirmed on both. 4 checks pass.

## New ideas (IDEAS.md, status proposed; generic web queries only)
ID-47 companion care moment (feel bond growth in-session, from b05-r3), ID-48 Trial practice fight (unranked, no loot), ID-49 angler "also biting now" line. Sources are in the IDEAS.md source list.

## Files
`game/shared/mm-isle-craft.js`, `game/games/stalk/stalk.js`, `game/design/beta/tools/trial-bot.js`, `game/design/IDEAS.md`, `game/tests/cyc5-d-{oakback-pace,trial-numbers,stalk-paid-line}.test.js` (registered in `test-tiers.json`), `game/tests/shots/cyc5-design-*.js`, `game/design/beta/img/cyc5-design-*.jpg`.

## Unresolved
Human-paced Trial pass; Oakback real-time wait never played; ftue-metrics.json was rewritten by isles-first-ten and reverted (not part of this change).
