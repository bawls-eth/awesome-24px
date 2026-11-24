# Cycle 3 design review (D)

Branch `cyc3-design` from 031b83b, own server 9734, every command through `/tmp/bt.sh`, DB blocked (route abort / offlineStub, `db 0`), no chat, no writes. Numbers are bot or computed, not human play.

## Item 1: Town day-loop and a dungeon floor
### Town (tools/town-day-bot.js, offline, simulated clock, every action through the scene's own `interact()` with the hero placed on the target; walk time = distance x 1.3 / measured stick speed 138 px/s)
10 simulated minutes, greedy nearest-ready source, sells at the shop at 12+ items:
| source | spots | cooldown | items in 10 min |
|---|---|---|---|
| trees (wood + fruit) | 58 | 20 s | 155 |
| rocks | 17 | 20 s | 90 |
| beach | 5 | 20 s | 39 |
| flowers | 8 | 30 s | 27 |
| bugs | 8 alive | respawn 15 s | 3 |
| fossils | 3 | 25 s | 0 (not collectable through `interact()`; not claimed) |
Totals: 31.3 items/min, 33.1 stars/min (1 star per item, shop sells at 1:1, plus the daily deal and bulk bonuses), 26 sells, 312 stars from sales. 87 percent of the time is walking; 76 of 390 interacts gained nothing (a target that was not ready). Crafting adds +33 percent (plank 3 wood = 4) to +50 percent (lantern 6 items = 9).
Findings: (1) trees are 49 percent of all income because there are 58 of them; flowers, the "pretty" source, are 9 percent, so a flower-first route is a loss of about 3x per minute. (2) Bugs are 1 percent: 3 caught in 10 minutes against 8 alive, because the bot has no net timing; not a verdict on the bug game, which has its own page. (3) 33 stars/min against a daily-login bonus of 5 and a chores bonus of 5: a daily surface is worth 15 seconds of gathering, so it does not move behaviour. A bonus of 30-60 stars (about 1-2 minutes) would. Not changed (Town economy is not in this cycle's brief). Fishing, villagers and the shop UI were NOT played: the day-loop bot covers gather and sell only.

### Dungeon floor (tools/dungeon-bot.js): NOT completed
Real-input bot written (mouse aim, Space, WASD, same 9-option dodge). The 150 s run on `warren` Lv 8 seed 7 never left room 0 (0 enemies, 156 of 156 HP, `roomsVisited 1`), a bug in the bot's door-walking, not a game finding: a hand probe shows room 0 has doors W (open), E (open), S (cracked), 0 mobs, and holding `d` for 1.5 s enters room 5 with 2 mobs. No pacing claims about the floor. Next cycle: fix the door goal (probably the tile-to-pixel offset) and rerun.

## Item 2: Trial of Six bot, why 0 damage
Instrumentation (trial-bot.js): live enemy bolts per loop, closest bolt centre to the hero, samples within 40 px, and a wrap on `arena._hitPlayer` that counts real calls (so shield soaks and the first-run hurt guard cannot hide a hit from the HP delta).
Results (hero Lv 20, common wand, 252 HP; loop rate is the bot's own sample rate, wall clock):
| run | fight | boss | secs | hits (`_hitPlayer` calls) | damage | closest bolt px | loop Hz |
|---|---|---|---|---|---|---|---|
| A (loaded machine) | 1-3 | wyrm, lich, maw | 69-76 | 0 | 0 | 28.5-33.2 | 42-59 |
| A | 4 | void_oracle | 74.9 | 11 | 163 | 2.5 | 49.7 |
| A | 5 | shadow_hydra | 30.3 | 9 | 90 | 5.2 | 44.2 |  (died; ended the trial)
| B (trial 1) | 1-6 | all six | 66-80 | 0 | 0 | 15.4-33.3 | 46-56 |
| B (trial 2) | 1-5 | five | 67-74 | 0 | 0 | 22.8-32.9 | 45-55 |
Evidence: (1) hits ARE counted: every HP loss matches a `_hitPlayer` call one to one (11 calls / 163 dmg: 3 x 33 + 8 x 8; 9 calls in fight 5), and shield soaks were 0. So the 0 is real, not uncounted. (2) The boss field holds 31-33 live bolts on average and exactly 40 at the peak in every fight (the pool cap), so the bolts exist. (3) The hit radius is 15 px (`RM_PLAYER.r` 11 + 4) and the bot dodges at 34 px; in the 0-damage fights its closest approach was 28-33 px, i.e. it never needed the last 13-18 px of margin. (4) The one run that took damage had the loop at 44-50 Hz instead of 54-59 Hz and the closest approach collapsed to 2.5 and 5.2 px. So the verdict: the dodge is too easy for a 55 Hz sampler with a 34 px margin, and degrades fast below it; a human reacts at frame rate 60 but with delay, so this bot is an upper bound on player skill, not the median. The fights are not toothless (run A: one death at 30 s, 163 damage in the previous fight) and the cycle-1 non-dodging death at 20-43 s still stands.
Fight 6 (dread_knight, 1089 HP): won in 80.5 s with 0 damage in B-1 and 73.0 s in B-2. All six fights are 66-80 s, so a full Trial is 7.2-7.5 minutes. Pacing: no ramp (fight 6 is only 4 percent longer than fight 1). See ID-36.

## Item 3: economy (tools/economy-sim.js, the real shared modules, 8000 kills per row; tier mix 70/20/10 percent)
Elite fix effect (S fixed `info.creature === 'giant_spider_queen'`): per Godlands kill and per elite (an elite always drops a bag):
| row | bags/kill | shards/kill | gear/kill | dust/kill if all salvaged | tiers |
|---|---|---|---|---|---|
| Shore | 0.23 | 0.70 | 0.04 | 0.12 | T1-3 |
| Midlands | 0.28 | 1.67 | 0.07 | 0.48 | T3-6 |
| Highlands | 0.34 | 4.14 | 0.13 | 1.74 | T5-9 |
| Godlands | 0.40 | 9.75 | 0.22 | 4.74 | T7-10 |
| Godlands elite | 1.00 | 48.5 | 0.54 | 13.7 | T9 0.26, T10 0.22, T11 0.06 per kill |
Correction to cycle 2: shards arrive only with a bag, so a Godlands kill gives 9.7 shards (24 x 0.4), not 24; a Rare (120) takes 173 / 73 / 29 / 13 kills in zones 0-3. An elite is worth 5 mob kills of shards and 3 of dust; it is the only T9-T11 source outside bosses, so S's fix adds the first non-boss T11 (0.057 per elite).
Sinks: the old reforge cost 3-5 shards (T9-T11) = 1 kill; the binding side was dust (60-100): 13-22 Godlands kills (35-58 Highlands). So shards had no sink at all.
Shipped (data only, commit `economy:`): reforge shards `25 x (t - 6)` (T7 25 ... T12 150). Godlands kills of shards per T9 / T10 / T11 reforge: 8 / 11 / 13, still under dust 13 / 17 / 22, so dust remains the pacing gate and shards become a real second cost (an elite pays a T9 reforge in shards in 2 kills). Shore untouched (no reforge before T7).
`TOUGH_GAP` 3 -> 2: Lv 10 at area 13 and Lv 15 at area 19 now read "Too hot" (they were "Tough"), Lv 1 at area 2 stays Tough, the meter's thresholds otherwise unchanged. Evidence: the cycle-0 spike (172 to 17 HP in 19 s at Lv 10, area 12.7) and the cycle-2 table.
Pins that changed (each named in the commit): shared-mm-gear-forge (cost.shards 3 -> 75), gear-forge-ui (2 -> 50, saved 98 -> 50), gear-dust-txn I6 (98 -> 50), beta-g03-sell-guard 3b/3e (2 -> 50). New `cyc3-economy-tuning.test.js` (node, smoke tier): 12 checks fail on the old numbers, all pass on the new. `first-ten-minutes` and `isles-first-ten` were run alone after: both ALL PASSED. Flake note: beta-g03-sell-guard 3d/3e (340 ms double tap) failed once and passed once under load, before and after the shard change.

## Item 4: the isles mars-b reward gap (the real cause)
It was not the steering. With wall-turn on, `isles2-mars-b` maxRewardGap was 48.7 s (limit 45). The reward gaps on every island were 34.5-35.4 after the change below except mars; the floor of the cadence is the forage sparkle's own trigger (40 s of no find) plus the walk to it, so any route change moved gaps in the 40-48 range. On mars the diagnostic (hero state per second) showed the actual cause: the air meter. At 303 s the hero went into the air warning, `sparkTick` returns early while `envS.warnO || envS.emptyO`, and the bot walks home; the sparkle that was due at 308 s was held until the hero reached the pad at 319 s and the next reward came at 321 s: gap 46.3 s. With a different wanderer path the air trip lands inside the 40-45 s window or not, which is why the gate looked chaotic.
Fix (spawn/data, three parts): (1) `PITY_AFTER` 40 -> 34 s (first-ten window only; the later 40 s / 6 a day rule is unchanged); (2) during the air WARNING (not once air is out) the sparkle is placed on tiles no farther from the nearest dome than the hero, so the reward sits on the way home; (3) `?wslide` is now on by default (`?wslide=0` is the old bounce).
Proof, `isles-first-ten` run alone: before (wslide on, base): mars-b 48.7 FAIL. wslide on + pity 34 only: mars-b 46.3 FAIL (the air hold). wslide on + all three: ALL PASSED, maxRewardGap 34.5-35.4 on nine profiles and mars-b 42.4. Margin on mars-b is only 2.6 s; the air trip is the remaining cause. Pins changed: shared-mm-isle-pouch (PITY_AFTER 40 -> 34), isles-ftue-fixes #6 (probe at 20 s because a sparkle from earlier in the test could already exist; picks it up first), cyc2-isles-wander-slide (default is wall-turn, `?wslide=0` the old bounce). `QI_EXTRA` is an additive hook in isles-first-ten for query overrides.

## Item 5: ideas
Seven new ideas ID-34 to ID-40 with sources in IDEAS.md (status proposed).

## Specs for S
1. Fix `dungeon-bot.js` door walking (D can then report the floor); no game change needed.
2. ID-36 (Trial ramp): add one pattern layer per fight from fight 4; test = bot boss damage > 0 on fights 4-6 at the same hero (the bot's closest-approach log is the check).
3. ID-40 forge hint: `MMGearForge` already returns both costs; the UI line needs `kills = ceil(missing / income)` with income from a fixed table (no tracking).
4. Town: a daily bonus of 30-60 stars (not 5) if D's 33 stars/min holds; needs a Town test with offlineStub and a literal `db.attempts() === 0`.
5. Mars margin: if mars-b creeps over 45, move the air warning threshold (`AIR_WARN`) up by 5 s or let the sparkle also appear at the pad.
