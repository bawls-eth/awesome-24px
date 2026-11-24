# Cycle 2 design review (D)

Branch `cyc2-design` from 2b40e79, own server 9724, every command through `/tmp/bt.sh`, DB blocked (route abort, WebSocket close), no chat, no writes. All numbers are bot or computed, not human play. The specs for ID-01, 05-11, 13, 14 and eight new ideas are in `cycle2-specs.md`; statuses are in IDEAS.md.

## Item 1: play
### Trial of Six bot (`game/design/beta/tools/trial-bot.js`)
How it works: the page is the real Realm world (`?mode=world&test=1&seed=12345`), hero Lv 20, one common Spark Wand (the worst-case gear: no armour, no rings), 252 max HP. Every ~15 ms loop the bot reads the arena state and then acts only through real input: `page.mouse.move` onto the boss (the game's own pointer-to-aim path), `keyboard.down(' ')` held to fire, `keyboard.down/up` of WASD to move. It scores 9 move options (stay, 8 directions) by predicted distance to every enemy bolt within 260 px over the next 0.45 s (hit radius 34 px) and adds a pull to orbit the boss at 240 px, clockwise. The trial starts through `rush.start()` and steps with `rush.next()`; the hero starts each trial at full HP and gets no healing between fights (matches "Rest here restores nothing"). Per-fight cap 100 s.

Results, Lv 20, common wand (one trial, wall-clock; see the caveat):
| step | boss | boss HP | dmgMul | fight time | damage taken | outcome |
|---|---|---|---|---|---|---|
| 1 | inferno_wyrm | 990 | 4.004 | 66.7 s | 0 | won |
| 2 | lich_king | 990 | 4.004 | 71.7 s | 0 | won |
| 3 | void_maw | 1030 | 4.084 | 71.5 s | 0 | won |
| 4-6 | see the end of this section | | | | | |

Reading: a fight is about 70 s at about 14 HP/s of bot damage (common wand), so a full Trial is about 7 minutes of play with no rest in between. Pacing problem 1: fight length is flat (67-72 s) for all fights; there is no ramp in time or threat. Pacing problem 2 (caveat, NOT proven): damage taken was 0 in three fights, so either the dodge lookahead beats the boss patterns at Lv 20 or hits are not being counted. I did not instrument the number of live boss bolts, so I cannot claim the boss is toothless; the cycle-1 fact still stands that a non-dodging hero dies in 20-43 s. Deaths per fight in this run: 0 of 3 (so far). The next cycle should log `eBullets` alive per second and the min distance to a bolt to settle that.

### Town (source read; NOT played in a browser)
The Town needs the live room or the offline stub with a stepped scene; no day-loop bot was built in the time box. From source: tree 20 s, fossil 25 s, flower 30 s, beach spots 20 s, turnip sell cycle 15 min, craft values 4-9 coins per item (`main.js` recipes), login `DAILY_BONUS = 5`, bulk sell +20 percent from 10 items, bounties (`mm-bounties`) still unwired. No claim about how the day feels.

### Dungeon floor
Not played this cycle (time box; the Trial bot took the budget). No claims.

## Item 3: balance of S's new mechanics
### Danger meter (computed with `MMDanger.rate` over the classic bands)
Table of hero Lv against distance from the island centre (C comfortable, T tough, H too hot; area level by position: coast 1, Midlands edge 5, 8.1 mid-Midlands, Highlands edge 10, 12.7, Godlands edge 15, 18.6, centre 20):
| position (area Lv) | Lv 1 | 3 | 5 | 8 | 10 | 12 | 15 | 18 |
|---|---|---|---|---|---|---|---|---|
| 1.9 (Shore) | T | C | C | C | C | C | C | C |
| 5.0 (Midlands edge) | H | T | C | C | C | C | C | C |
| 8.1 | H | H | T | C | C | C | C | C |
| 10.0 (Highlands edge) | H | H | H | T | C | C | C | C |
| 12.7 | H | H | H | H | T | T | C | C |
| 15.0 (Godlands edge) | H | H | H | H | H | T | C | C |
| 18.6 | H | H | H | H | H | H | H | T |
| 20 (centre) | H | H | H | H | H | H | H | T |
Findings: (1) the thresholds match the measured spike: a Lv 10 hero in the Highlands edge reads Comfortable and at area 12.7 reads Tough, which is where cycle 0 lost 172 to 17 HP in 19 s; the meter says Tough, the play says deadly. A Lv 10 hero deserves "Too hot" there (HP loss 90 percent in 19 s is not "tough"). (2) A Lv 15 hero (Godlands recommended) reads Too hot over the inner third of the Godlands (18.6+), consistent with the zone but harsh as a label for the recommended level. (3) A Lv 1 hero on the Shore reads Tough at the very first tile past the coast (area 1.9); round 1.9 -> 2 makes gap 1. First-ten-minutes is therefore shown a Tough warning on the first 10 seconds. Proposal (not applied, the meter test pins thresholds): `TOUGH_GAP = 2` (Tough 1-2 above, Too hot 3+) makes Lv 10 at 12.7 read Too hot (gap 3) and Lv 15 at 18.6 read Too hot, Lv 1 at 1.9 stay Tough (gap 1). Decide with the cycle 1 tester notes; no change made.

### ID-03 payouts against income and the shop (computed from `MMQuests.killShards`, `MMZones` shard table, `RM_SHOP_MULT` = 8)
Kill income per kill = SHARD_BASE 3 x zone mul (1 / 2 / 4 / 8) x tier (about 1.0-1.25), so 3 / 6 / 12 / 24 shards; a boss pays x13.
| zone | quest need | quest shards | shards from those kills | quest premium |
|---|---|---|---|---|
| Shore | 8-18 | 46-56 | 24-54 | about 100-190 percent |
| Midlands | 12-22 | 82-92 | 72-132 | 70-115 percent |
| Highlands | 16-26 | 126-136 | 192-312 | 45-65 percent |
| Godlands | 20-30 | 170-180 | 480-720 | 25-35 percent |
Shop: Common 24, Uncommon 56, Rare 120 shards; Epic is never sold; reforge costs 1-6 shards (`costFor`: dust `20 x (t-6)`, shards `t-6`). Findings: (1) the quest premium falls from about 2x at the Shore to about 0.3x in the Godlands: the "Godlands about 2x the old top" claim is true against the old quest (old top 92, new top 182) but the quest is still the smallest part of Godlands income; a Godlands kill alone buys a Common (24) in one kill and a Rare in 5 kills. (2) The real problem is the sink, not the quest: nothing sells above 120 shards and reforge costs at most 6, so a Godlands player sits on unusable shards after about 20 kills. Proposal for S (balance data, not applied because the forge tests pin `costFor`): reforge shard cost `25 x (t - 6)` (25-150 per reforge, 1 to 6 Godlands kills) and a shop Rare price floor unchanged. This keeps the Shore economy untouched (the shop is the only Shore sink) and gives the Godlands a use for shards. (3) The ID-03 curve itself needs no change: monotonic, under the cap, and the boss quest (120-160 shards) pays less than a Highlands kill quest, which is fine because a boss also gives a purple bag.

No data was changed in this item, so `first-ten-minutes` and `isles-first-ten` were not affected by it.

## Item 4: ID-13 (second wind gates)
Built the pure part: `FIRST_KILL_BAG_FLOOR = [1, 1, 2, 3]` and `rollDrop({firstKill: true})`; test `cyc2-first-kill-floor.test.js` (5 checks, node). The boss rows themselves are not changed (the floor is applied per first kill, so the weights table stays as cycle 1). Expected lift: 30 / 10 / 10 / 10 percent of first boss bags. The wiring into `realm-world.js` (the `zk` bitmask) is in the spec for S; nothing in the first-ten flows kills a boss so those limits are unaffected, but I did not claim the green run for wiring I did not write. Because no runtime path passes `firstKill`, shipped behaviour is identical (test 2: 1600 rolls byte-identical).

## Item 5: ideas
Eight new ideas (ID-26 to ID-33) on Town dailies and dungeon variety in `cycle2-specs.md`.
