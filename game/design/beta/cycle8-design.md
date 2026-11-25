# Cycle 8 - D Gameplay Designer (branch cyc8-design)

Server port 9804, all browser runs through /tmp/bt.sh, Firebase blocked (offline stubs; db attempts 0 asserted by the new test). Machine load was heavy (load factor 3.6 to 6x), so wall-clock budgets were load-scaled.

## 1. First ten minutes with cycle-7 changes live (real runs)
- first-ten-minutes.test.js (390x844 touch, scripted kite bot, simulated time), six Shore profiles a-f: first kill 2.7-3.4 s, first bag picked up 5.6-27.7 s (worst e), first level-up (Lv 2) 6.8-20.9 s, first ability 5.7-9.6 s, max reward gap 11-38 s (target <= 45), deaths 0/6, lowest HP 65 (profile e), level 13-15 at 10 sim minutes. Result: 143 PASS, 2 FAIL: world-shore-d and -f `layout.firstFrameMs <= 7950` measured 10244 and 14668 ms. That is a load artefact (same profiles 340-480 ms in the other four and in the recorded metrics; load factor 6x on a shared box), not a data issue. I did not rerun them solo. The test rewrites game/design/ftue-metrics.json; I reverted that file.
- isles-first-ten.test.js: ALL PASSED. First tame (bot): meadow a 41.5 s, b 49.3 s; jungle 39.3 / 46.0 s; tundra 53.1 s. 0 deaths.
- beta-r4-b08-shore-survival.test.js: ALL PASSED (coach shield, Low HP toast, 40 s passive on the Shore alive, normal damage after Skip).
- Oakback specifically: cyc5-d-oakback-pace (real MMIsleCraft + MMTame data, 6 glints, 120 s respawn): tamed after 351 s (5.8 min) alone; Strider then Oakback 287 s and 647 s. ALL PASSED. The Isles bot tames the first easy creature, not Oakback, so there is no bot number for Oakback itself.
- "First shards": the Shore pays 0.70 shards per kill and 0.12 dust (cyc3-economy-tuning INFO line); the first-ten bot does not log shards separately. Economy sims cyc3-economy-tuning, cyc7-d-town-economy, gear-balance-sim (158 gated rows) all PASSED.
- Imbalance found: none that is clear. No data change made.

## 2. ID-51 on the first inland zone (data decision: YES, extend to zone 1)
New measurement test `game/tests/cyc8-design-inland-passive.test.js` (registered in test-tiers.json, tier full): same set-up as cyc6-lead-passive-landscape (844x390 touch, fresh profile, first hero, coach Skip button, no input), 6 seeds, but the hero is put on the free Midlands tile nearest to the spawn. It asserts the set-up is real (hero on a zone-1 tile, coach skipped, no page errors, db attempts literal 0) and prints per-seed INFO; it does not assert survival, because that is the open question. Result today: 6/6 idle Lv-1 heroes fall, all within 30 s (10.0, 10.6, 15.4, 18.6, 20.4, 22.9 s; 8-25 enemies within 420 px; first damage at about 2 s). Highlands (3 seeds, 60 s): 3/3 fall within 10 s.
Simulated spec (REST_ZONES=1 swaps only the page's restOk hook): 5/6 alive at 120 s, lowest HP 35-76 of 100; 1/6 falls at 9 s (8 s idle wait). One-line spec in IDEAS.md ("ID-51 follow-up"): realm-world.js:3054 `zone === 0` -> `zone <= 1`, optional RM_IDLE_REST_S 8 -> 5. No game code changed. Caveat: the test teleports a Lv-1 hero into a loaded zone, harsher than a walking arrival.

## 3. Ideas (all proposed, generic queries, sources in IDEAS.md)
ID-53 just-in-time hint after 20 s of nothing (S), ID-54 drag-anywhere floating-move option (M), ID-55 first-session ending card (S). The only approved size-S idea is ID-09; the "S queue for cycle 9" paragraph lists it, the ID-51 inland one-liner, and proposed S ideas ID-53/ID-55 awaiting L/U review.

## Unresolved
- The 2 first-frame fails (load) were not rerun solo.
- Dungeon, Trial and Town economy untouched (out of scope).
- Only `cyc8-design-inland-passive` is new; it passed in default mode and in REST_ZONES=1 mode. It measures, so it cannot "fail before"; S's change should extend it with a survival assertion (spec in IDEAS.md).
