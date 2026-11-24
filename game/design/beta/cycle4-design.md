# Cycle 4 design review (D)

Branch `cyc4-design` from 385efc3, own server 9744, every command through `/tmp/bt.sh`, DB blocked (route abort / offlineStub, `db 0`), no chat, no writes. The machine was at load 20-27 during the runs (other agents); wall-clock bot numbers are bot numbers, not human play.

## Item 1: dungeon floor bot (partly fixed; a full floor is NOT yet cleared)
`beta/tools/dungeon-bot.js` had three real bugs, found by logging position, goal and the arena's own state:
1. Door walking: the 0.3 s look-ahead point (70 px) overshot a door that sits in the wall, so the best move was "stay" at x = 54 (the hero's body stops at 51). Fix: the step is capped at the goal distance.
2. Pillars (warren rooms have 1x3-tile pillars at columns 4 and 12): bolts die on them (`isWallAt`), and the first two enemies of room 1 stood exactly behind pillars (bolts ended at x = 193-205 with 0.6 s of life left, enemy hp 6 of 6 for 60 s). Fix: the bot reads the room's wall grid on every room change, requires line of sight to the target, and when it has none it walks a BFS path (4-neighbour, tile centres) to a tile with a clear shot at 70-210 px.
3. Door tile reads as wall on the grid (sealed/open art), so the BFS now targets the tile in front of the door and the body-collision penalty is dropped within 70 px of the door. Standoff range is now `STAND` (env, default 150; the old fixed 220 is unchanged in effect when it has line of sight; I did not test the two values against each other).
Results, warren Lv 8 seed 7, 156 HP: before the fix room 0 for 150 s, 0 kills. After fix 1: room 1, 0 kills (pillars). After fixes 1-2: room 1 cleared (4 kills in 9 s, 0 damage), room 2 entered, 8-10 kills in 150-200 s, 0 damage taken in every run (min HP 156 of 156, avg live bolts 0.2-1.6). Room 0 to room 1 takes 1.3-1.4 s; room 1 takes 5.6-9 s when the line of sight is solved. It still stalls in room 2 on one wounded enemy (hp 1.5 of 3 at (349, 473), hero at y = 336, bolt line looks free): not diagnosed in the time box. Honest status: the bot now leaves room 0, clears room 1 and fights in room 2 with real input; it does NOT clear a floor, so there are NO floor-pacing numbers for floors 1-3 (rooms, loot, mutators). The 0 damage in every room says the first rooms (3-4 mobs of 6 HP) are toothless for a Lv 8 hero with a common wand: that is a hint, not a verdict, because the bot never met a room with more than 4 enemies.
Next: log the bolt end points in room 2 (the `DBG=1` sampler is in the bot: `BOLTEND` prints the last 25 bolts that died with more than 0.25 s of life), then finish the floor and run floors 1-3.

## Item 2: Trial of Six, ID-36 spec and the ID-06 balance note
Instrumented bot (`trial-bot.js 20 0 1`, hero Lv 20, common wand, 252 HP, one trial, all six won), this cycle:
| fight | boss | secs | hits / dmg | closest bolt px | loop Hz | live bolts avg / max |
|---|---|---|---|---|---|---|
| 1 | inferno_wyrm | 67.5 | 1 / 8 | 15.0 | 48.3 | 32.5 / 40 |
| 2 | lich_king | 70.3 | 0 / 0 | 29.7 | 45.6 | 33.0 / 40 |
| 3 | void_maw | 75.0 | 0 / 0 | 28.6 | 41.3 | 33.5 / 40 |
| 4 | void_oracle | 76.5 | 0 / 0 | 31.4 | 44.9 | 33.6 / 40 |
| 5 | shadow_hydra | 78.0 | 0 / 0 | 26.0 | 45.7 | 33.1 / 40 |
| 6 | dread_knight | 75.2 | 1 / 8 | 19.0 | 46.3 | 33.2 / 40 |
Total 442 s = 7.4 minutes, 16 damage of 252 HP (6 percent). Same picture as cycle 3 (0 damage at 55 Hz; closest approach 26-31 px in fights 2-5, fights 1 and 6 touched at 45-48 Hz). The hit radius is 15 px, the bot dodges at 34 px.
Key constraint found: `boltsAliveMax` is exactly 40 in all six fights. That is the world fire budget (`fireBudget.cap`, realm.js line ~2683: `_ebLive >= cap` returns and counts `_ebCapped`), not the 420 pool. A new layer made of more bolts is silently dropped at the peak, so a layer must (a) raise the cap for the Trial by the layer's own count, or (b) change accuracy and timing, not count. Prefer (b).
### ID-36 spec for S (exact)
Rule: fights 1-3 unchanged. Layers are cumulative: fight 4 has layer A, fight 5 A + B, fight 6 A + B + C. HP / dmg ramps in `RUSH.ramp` stay as they are. Telegraph wind-up stays 0.6 s for every layer (no layer may shorten it; AGENTS and the arena's telegraph rule).
- A "lead shot" (fight 4): one aimed bolt every 1.6 s, aimed at the hero's position 0.35 s ahead (`p + v * 0.35`, v = the hero's last 0.2 s velocity), speed 0.9 x the boss's aimed bolt, 1 bolt (budget +1). Punishes a bot or player that holds a steady orbit direction.
- B "slow arm" (fight 5): a 2-bolt spiral arm every 0.5 s turning 40 degrees per second, speed 110 px/s (slow bolts stay on the field about 3 s: the live count rises by about 12, so raise the Trial cap 40 to 52 for fights 5-6 only).
- C "edge sweep" (fight 6): every 7 s a line of 9 bolts from one arena edge toward the opposite one with ONE gap 3 bolts wide (the gap is telegraphed by 0.8 s of faded bolts at spawn), speed 140 px/s; the gap side alternates. This one cannot be dodged by orbiting, so it checks movement skill at a different level.
Targets (the bot is the check, same hero as above): at 55 Hz sampling the bot takes damage > 0 in fights 4, 5 and 6 (closest bolt under 15 px at least once per fight, `hitPlayerCalls >= 1`); a slow bot (insert `await page.waitForTimeout(18)` per loop, about 30 Hz) still clears the Trial with at least 1 HP and at least one fight finished at under 60 percent HP in fights 4-6 combined (so a human, who is slower than the 55 Hz bot, can win but is hurt); no fight longer than 95 s (layers add pressure, not time; boss HP unchanged). Test: new `cyc4-trial-layers` (node tier for the layer builders, with the 40 / 52 cap asserted; browser tier for the bot rates, skipped by default like `trial-bot`). The numbers above are starting values, derived from the 15 px hit radius, the bot's 34 px margin and the 40-bolt peak; S tunes them against the bot. They are NOT validated: no layer exists yet.
### ID-06 "Assisted" balance note
What Assisted must NOT change: boss HP, bolt speed, bolt count, telegraph wind-up (0.6 s), hit radius (15 px), pattern timings, loot and shard rolls, the `RUSH.ramp`. It may only change (1) the damage a hit deals to the hero (multiplier 0.5 to 1.0 in steps of 0.25, applied where `_hitPlayer` computes the hit) and (2) aim help strength. Every run, score and Trial result carries the tag `assist: {dmg, aim}` from the moment it starts; a result with any non-default value is shown as "Assisted" and is stored in its own best-score slot, never merged into the default best. Payouts are identical (no loot penalty: the rule is that comfort is free, comparison is separate). Test pins: an assisted hit is exactly `round(base * mult)`; bolt positions after 5 s with a fixed seed are identical with and without assist; the tag survives a reload. The hits-per-fight data above supports the 0.5 floor: at 8 damage per touch a Lv 20 hero loses 3 percent of HP per hit, so even 0.5 leaves the Trial winnable for everyone except by neglect.

## Item 3: Town daily bonus (implemented, one data line)
`DAILY_BONUS` 5 -> 40 in `main.js` (line 1226). The chores card (7 rows today: Byte's request, trivia, fish, mail, weeds, Bug-Off, plus birthday / home plot when they apply) pays it once, written to the `dailies` save key first, so a reload cannot double-pay.
Where the reward shows (all three already read the constant, no copy change needed): the floating text "All chores done! +40" over the hero, a system chat line "Every daily chore is done: +40 bonus!", and the chores panel footer "(+40 collected)" or "finish them all for a +40 bonus". The button label "Today 6/7" could add "(+40)" while unpaid: spec for U, not done.
Economy check (cycle 3: 33.1 stars/min gathering): 40 stars = 1.2 minutes of gathering, was 0.15. Stars are a score, and the sinks are tiny: the merchant look costs 15 (`MERCHANT_COST`), the gift boxes 20, a turnip bundle about 60; the biggest other payouts are achievements 5-15 and Byte's quest about 11 stars. So 40 is 3.6 times the quest, larger than any other one-shot, and still under 2 minutes; at once a day it adds 40 stars per player per day (no streak, per the IDEAS limits) to a leaderboard where gathering makes 2,000 stars an hour. 60 would be a 1.8 minute carrot and starts to compete with gathering; 40 was chosen as the lower end of the 30-60 band.
Test `cyc4-daily-bonus.test.js` (browser, full tier, offlineStub, `db.attempts() === 0`): forces every chore to done, counts `awardPoint` calls of exactly 40 (an achievement may pay on top, one reported 45 total on the first run, so the test counts the call, not the score delta), asserts one payment over three polls and the footer text. Run: ALL PASSED (7 checks). It fails on the old 5 (`DAILY_BONUS is 40`).

## Item 4: pacing re-check after cycle 3 (the Shore XP fade, first-kill floor, reforge cost)
`first-ten-minutes` and `isles-first-ten` run alone: both ALL PASSED. For per-level times I ran a throwaway copy of the first-ten test with a level-up timer (not committed) on the six fixture profiles (kite-bot, phone, aim assist on). The bot moves up a zone when the next zone's recommended level is reached (Midlands Lv 5, Highlands Lv 10, Godlands Lv 15).
| profile | Lv 2 | Lv 3 | Lv 5 | Lv 6 | Lv 8 | Lv 10 | Lv 12 |
|---|---|---|---|---|---|---|---|
| a | 14 | 26 | 103 | 174 | 301 | 435 | 601 |
| b | 26 | 42 | 112 | 130 | 216 | 279 | 455 |
| c | 11 | 21 | 100 | 148 | 268 | 412 | 556 |
| d | 14 | 25 | 47 | 74 | 133 | 205 | 312 |
| e | 29 | 43 | 82 | 111 | 184 | 253 | 345 |
| f | 7 | 25 | 62 | 83 | 131 | 221 | 334 |
(seconds of sim time; first kill 2.7-3.5 s in all six, first bag 4.7-26.2 s, deaths 0, max reward gap 13-32 s, level at 10 minutes 12-15.)
Verdict on the Shore ramp: Lv 5 at 47-112 s (median 91 s) and Lv 6 at 74-174 s (median 130 s) meets the target (Lv 5-6 in 1-2 minutes) at its upper edge: three of six profiles reach Lv 6 after the 2-minute mark (174, 148, 130 s). The bot is at the Midlands border (recLv 5) between 47 and 112 s, so it leaves the Shore by minute 2, well inside the minute-5 target. The fade (x0.85 / 0.70 / 0.60 from Lv 5) shows as the slope: Lv 2 to 5 takes 40-90 s, Lv 5 to 8 takes 80-190 s. Two things to watch, neither a defect today: (1) Lv 10 is reached at 205-435 s and Lv 12 at 312-601 s, which means the Highlands border (Lv 10) is crossed at minute 3.5-7 by a bot, so the plateau at Lv 8-12 that ID-13 targets does not appear for this bot; a human is slower, but the first-kill floor and the zone gradient could make the Midlands skippable. (2) Profile a is slowest (Lv 6 at 174 s): its first bag came at 5 s but its Lv 2 at 14 s and Lv 5 at 103 s; no change recommended. Reforge cost: not in these paths (the first ten minutes never reach T7), consistent with cycle 3.
Not measured: a human, the Isles level pace (the isles test passed: `tameSpecies` and reward gaps within its gates), and a bot with no aim assist.

## Item 5: ideas
ID-41 to ID-46 (dungeon door previews, Trial checkpoint scope, dungeon Heat, daily floor, secret rooms at dead ends, boss phase checkpoints), each with sources in `IDEAS.md`. IDEAS.md statuses: ID-01, 07, 12, 13, 14 set to `built` (with the earlier note kept in the cell).

## Specs for S
1. ID-36 as above (layers A / B / C with the cap 40 -> 52 and the bot targets).
2. ID-06 assist tag rules as above.
3. Dungeon: after D finishes the room-2 stall, nothing for S; if the stall is a game bug (a wounded enemy that bolts do not reach), D reports it with the bolt end points.
4. U: show "(+40)" on the chores button while unpaid (optional).
