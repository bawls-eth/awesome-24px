# Cycle 6, D (Gameplay Designer): report

Branch `cyc6-design` (rebased onto the dev tip 99036b7 after finding the worktree started on 503ae8b). Port 9604, Firebase blocked (blockDb, WebSockets closed), no DB writes, nothing pushed. The machine was saturated (the first 8-page probe timed out on page load), so runs were sequential and few.

## 1. Passive / early survival: MEASURED, NO TUNING APPLIED (honest)
Checks actually run:
- `beta-r4-b08-passive-2min.test.js` (4 seeds, 390x844, coach on): ALL PASSED, but every seed sits at HP 50 from about 20 s (seed 777: 100 -> 50 over 120 s). The pass comes from the coach guard (`realm-tutorial.js` idle mult 0.25, floor 50%), not from the Shore numbers.
- Own probe (scratchpad `d6-probe.js`: real page, no coach guard, hero never touched, 844x390 landscape, seeds 12345 / 777 / 4242): seed 12345 DEAD at 20 s, seed 4242 DEAD at 14 s (100 -> 40 HP in 10 s), seed 777 alive at 121 s with HP 58 (spiral shooter hitting about 6 HP per 10 s). In both deaths the nearest enemies are "aimed" shooters: by 10 s four of them stand at a constant 279 px and fire. Portrait 390x844 not completed (load); L's seeded test should confirm.
- Conclusion: the idle fall is the guard being off (coach skipped/finished, or the hero already "acted" so the floor is only 1 HP for 60 s and drops after 120 s), plus aimed shooters that walk to a still hero. The `quiet pity` nudge (`realm-world.js` ~l.923, 15 s / 6 s) is not the first cause (they arrive before 15 s) but keeps provoking a hero that is not playing.
- Why no data change: `MMDifficulty` CLAMP floors Shore dmg at 0.5 and fire at 0.7 (now 0.70 / 0.80). Even at the floors a stationary aimed shooter still costs roughly 26 HP per 10 s on seed 4242, so no data value gives a no-input hero 120 s without making active Shore play trivial. A real fix needs a small code gate (proposal ID-51: no provoke / aggro leash for a hero with no input for 8 s, any input restores normal rules; or extend the coach guard idle floor beyond the coach). Left for S/L approval; I did not weaken any test.

## 2. Coach step 4 wording (b08): APPLIED (one-line text edit)
`game/shared/mm-tutorial.js` ability step, touch text: "Tap an ability button to use it." -> "Tap the first ability button, next to your right thumb, to use it." (the first button is the only unlocked one at Lv 1; the 2x2 grid sits by the right thumb in portrait and landscape). Keyboard text unchanged. Check run: `node game/tests/shared-mm-tutorial-realm.test.js` ALL PASSED with a new line pinning "first ability button" and "right thumb"; the same line evaluated on the old file returns false (fails before). Not done: real-browser screenshot of the coach card at 390x844 / 195x422 (text is longer: the FT2 coach-fit code should cope, not verified) and no screenshots of item 1 (no UI changed).

## 3. Economy / pacing sanity
Ran `node game/design/beta/tools/economy-sim.js 6000` on the tip: Shore 0.70 shards/kill, Midlands 1.68, Highlands 4.09, Godlands 9.59 (elite 48.5); reforge T9-T11 Godlands costs 8-14 kills for shards, 13-22 for dust (dust still the gate, ID-40); shop Rare 120 shards = 173 / 72 / 30 / 13 kills by zone. Unchanged from cycle 3/4.
- Oakback glints (6 per 120 s, cycle 5): supply per the cycle 5 test is 351 s for Oakback alone, 647 s for Strider then Oakback. Both tames share the apples; if a player wants both they wait about 11 min, acceptable. No imbalance.
- Town daily bonus 40 stars (cycle 4): a Town currency, not on the shard/dust axis, so it does not touch the sim. Imbalance risk: none seen; with ID-52 (milestone days) as a future extra. Not simulated against star sinks (no star-price sim exists).
- Not re-run: a full-day star income vs shop price sim; flagged for a later cycle.

## New ideas (IDEAS.md, status proposed, generic web queries only)
ID-50 coach hint pulse, ID-51 idle hero rest (the real fix for item 1), ID-52 milestone days for the daily bonus.

## Unresolved
Idle hero survival without the coach (needs the ID-51 code gate or approval to raise guard floor); portrait idle runs; coach text screenshots.
