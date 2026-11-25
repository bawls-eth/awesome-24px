# Cycle 6 - S (Game Systems) report

Branch `cyc6-systems` cut from `99036b7` (CYCLE-LOG cycle 5, tip of `claude/animal-crossing-game-7z3roh`), own server port 9605, every browser through `/tmp/bt.sh`, Firebase blocked in every run (route abort + every WebSocket closed; every bot and test prints / asserts 0 DB requests). Not pushed. The machine was shared with 4 other role agents, so every wall-clock bot number is a bot number under load, not human play.

## 1. ID-36 Trial ramp tuning (`trial-bot-nexus.js`, Lv 20, common wand, 252 HP)
What changed
- `game/shared/mm-endgame.js` LAYERS: lead shot every 1.6 -> **1.2 s**, aimed **0.5 s** ahead (was 0.35), budget 1 -> 2 (life 1.45 s > 1.2 s, so two can be alive); slow arm every 0.5 -> **0.7 s**, speed 110 -> **95 px/s**, budget 11 -> 9. Trial caps per fight 40/40/40/**42/51/60** (was 41/52/61). Sweep unchanged.
- **Carried-HP readout** (the last part of the ID-36 idea, not built in cycle 5): the rest panel between fights now has `#rw-rush-hp` "You carry 236 of 252 HP into it." (`realm-world.js` rushPanel, textContent).
- `trial-bot-nexus.js`: `FROM=4` env (tuning aid only) sets fights 1-3's boss to 1 HP after it spawns, so a run reaches fight 4 in ~15 s; every FIGHT line carries `ff:true/false`; RESULT now prints the layer values the page ran with.
- Tried and removed again (no effect on the bot, code reverted): a 2-bolt lead burst (2nd bolt 0.25 s later, re-aimed) and a 3-bolt lead fan (+-10 deg).

Every run (60 Hz = no wait, "30 Hz" = `slowMs` 18, measured loop 25-29 Hz). dmg = damage taken in that fight (hits):
| run | values (lead every / ahead; arm every / speed) | mode | fight 4 | fight 5 | fight 6 | result |
|---|---|---|---|---|---|---|
| c1-60 | 1.6 / 0.5; 0.7 / 110 | FROM=4 | 0 (closest 32 px) | 0 | 0 | 6/6 won |
| c1-30 | same | FROM=4 | 0 | 0 | 0 | 6/6 won |
| c2-60 | 1.2 / 0.5; 0.5 / 95 | FROM=4 | 0 | 0 | killed early | - |
| c2-30 | same | FROM=4 | 8 (1) | 0 | killed early | - |
| c3-60 | 1.2 / 0.9; 0.5 / 95 | FROM=4 | 0 | killed | - | - |
| c3-30 | same | FROM=4 | 0 | 0 | killed | - |
| c4-60 | 1.2 / 0.5 + burst 2; 0.5 / 95 | FROM=4 | 0 | 0 | 8 (1) | 6/6 won |
| c4-30 | same | FROM=4 | 0 | 0 | 0 | 6/6 won |
| c5-60 | 1.2 / 0.5 + fan 3; 0.5 / 95 | FROM=4 | 0 | 0 | killed | - |
| c5-30 | same | FROM=4 | 0 | 0 | killed | - |
| final-60 | 1.2 / 0.5; 0.5 / 95 | full | 81 (7) | 34 (1) | **died** (158, 14 hits) | 5 won |
| final-30 | same | full | 49 (3) | **died** at 33.6 s (172, 10 hits) | - | 4 won |
| **final2-60** | **1.2 / 0.5; 0.7 / 95 (committed)** | full | **8 (1)** | 0 | 0 | **6/6 won** |
| **final2-30** | same | full | 0 | 16 (2) | **died** at 67.7 s (228, 16 hits, entered with 248 HP) | 5 won |
Fights 1-3 in the full runs: 0-41 damage in total, 66-74 s each. Every run: DB 0, no page errors, 0 layer bolts dropped in final2.

Verdict against the targets
- Competent bot (60 Hz) takes damage in fight 4: **met** with the committed values (final2-60: 8 dmg, 1 hit; final-60 with the same lead values: 81 dmg).
- Slow bot (30 Hz) finishes with >= 1 HP: **NOT met**. With the committed values it dies in fight 6 (edge sweep, untouched this cycle); with arm 0.5 s it died in fight 5.
- Important measurement caveat: the FROM=4 fast-forward runs were NOT representative. Every FROM=4 run took 0-8 damage in fights 4-6, while full runs with the same values took far more. In a full run the hero has orbited for 3+ minutes and is somewhere else in the open world: final-60 recorded a live-bolt cap of 82-102 in fights 4-6 (the zone cap of another zone + the Trial extra), so the hero had drifted into a harder zone with that zone's fire budget. The Trial is not position-locked, which makes these numbers noisy and is a design question of its own (proposal 2).
- One run per configuration; bot variance is large (cycle 5's fight 5 death at 60 Hz did not repeat in any FROM run). Treat the table as indicative.

Checks run
- `node game/tests/cyc5-trial-layers.test.js` (updated to the final values, caps 40/40/40/42/51/60, lead 1.2 s / 0.5 s / budget 2, arm 0.7 s / 95 px/s / budget 9): ALL PASSED. Against the HEAD mm-endgame.js it fails 6 checks (run).
- `cyc5-trial-layers-live.test.js` (updated caps / budgets, fight 4 needs >= 3 lead shots in 5.5 s, + new check for the carried-HP line on all 5 rest panels): ALL PASSED (15). The "before" run of the new HP check was NOT executed (the element does not exist in HEAD, so it cannot pass there, but I did not run it).
- `shared-mm-endgame` ALL PASSED (64), `world-boss-rush` ALL PASSED.

## 2. Dungeon bot: why it never cleared a floor
Diagnosed with a new STALL / STUCK log in the bot (enemy positions, line of sight, waypoint, room grid). Five separate bugs, all in the bot; one also shows a real game issue:
1. **The "one enemy survives" bug: the ability bar eats mouse aim.** `#realm-abilities` buttons sit over the bottom of the canvas and `realm.js` listens for `pointermove` on the canvas only, so aiming at a mob near the bottom wall left `arena.mouse` frozen at the last canvas point (measured: a mouse move to world (311, 473) left mouse.x/y unchanged; `elementFromPoint` there = `BUTTON#realm-ab-1`). Every bolt flew past the mob (seed 11 room 4: mob at y 473 untouched for 80 s, bolts ending at y 477 far to its right). Bot fix: aim at the farthest point on the hero-target ray that is really over the canvas (aim only needs the direction). **Game issue, not fixed** (proposal 1): a desktop player's aim also stops updating while the cursor is over the ability bar.
2. Line of sight sampled every 10 px skipped the corner of diagonal walls (seed 7 room 2: hero stood still 16 s+ firing into a 6 px corner). Now 3 px samples on the centre line and two side lines 6 px out.
3. No floor end: after the boss the bot only knew doors and ping-ponged between the last two rooms. It now walks into the exit portal (`portalPos`, finish at < 30 px), and picks up a key on the floor first.
4. Exploration: with no fresh door in the room it took the NEAREST open door (dead end <-> neighbour forever, seed 11). Now a BFS over the floor graph to the nearest visited room that still has a door to an unvisited, non-secret room.
5. Movement: a 10 px hero box (radius is 11) let it press into 1-tile gaps off-centre; the door exemption also applied to floor spots (portal behind a pillar corner); a straight line to the portal clipped a pillar. Now a 12 px box, the exemption only for doors, a tile-centre BFS to spot goals, and a 0.7 s "go to my tile centre" after any STUCK.

Runs (`dungeon-bot.js warren 8 <seed> 240`, Lv 8, 156 HP; summary = floor cleared through the portal):
| seed | before (cycle 6 first run) | after the fixes |
|---|---|---|
| 7 | room 2 stall then ping-pong, no clear (120 s) | **cleared** in 42.5 s, 53.3 s, 56.8 s, 51.2 s (4 runs, the last with the final bot) |
| 23 | stall in room 5, no clear (240 s) | **cleared** 116.2 s and 110.8 s (the second with the final bot; min HP 50 / 52); one earlier run died to the boss (combat, not a bot bug) |
| 5 | 240 s, 5 rooms, no clear | **cleared** 116.6 s and 125.4 s (min HP 58 / 5) |
| 31 | - | **cleared** 86.3 s (min HP 70) |
| 11 | ping-pong rooms 4 <-> 5, 240 s | before the last fix: stuck beside a 4-tile wall in room 1 (143 STUCK lines); with the tile-centre un-stick (final bot): all 7 rooms reached, 0 STUCK, **died** in combat at 121.8 s (min HP 10), so not cleared |
DB 0 and no page errors in every run. First floor numbers (D's ask since cycle 3): a Warren floor at Lv 8 takes 43-125 s of bot time, 9-20 kills, 20-47 shards, and the boss is the only real threat (min HP 5-70 of 156; one death).

## 3. IDEAS.md
- **ID-08 Dungeon first-clear milestones (approved-spec, S): built.** On the first floor-1 boss kill of a biome on this device (read before `deepMark` writes it), the summary banner turns gold (`h2.mm-sum-first`) and a row "First clear <Biome> · next: <next uncleared biome>" (or "every dungeon cleared") appears, once. Deviation from the cycle 2 spec: the record is the dungeon's own `pixeltown-deep-v1` (G-25), not a new `fc` key in the Realm save: no save-format change at all. Trade-off: clears made before G-25 shipped are unknown and show the card once more.
  Test `cyc6-dungeon-first-clear.test.js` (new, browser, full, registered): real boss kill path (`_hitEnemy`), portal, summary. ALL PASSED (6). Against the HEAD dungeon.js: 2 FAILED (run). Regression `mad-maze-dungeon` ALL PASSED. Screenshots `cyc6-systems-first-clear-desktop.jpg` (1280x720) and `...-phone.jpg` (390x844): the row fits on the phone card, gold title, 0 DB.
- **ID-36** row: `proposed` -> "built, tuning NOT signed off" with the cycle 6 values; ID-08 row -> built.
- Other approved ideas (ID-05, ID-10, ID-11) are size M: not started.

## Unresolved
- ID-36: the slow (30 Hz) bot dies in fight 6 (sweep). Next pass: sweep every 7 -> 9 s or speed 140 -> 120, then full runs only (not FROM).
- The Trial is fought wherever the hero drifts: zone fire caps up to 100 seen during fights 4-6.
- Small layer-bolt drops (1-9 per fight) in some runs where the hero drifted (boss bolts fill the headroom when the zone cap differs); none in final2.
- Dungeon bot: seed 11 reaches every room but the Lv 8 bot dies there; seeds 5 / 31 were not re-run with the very last bot change (the un-stick only acts after a STUCK).

## Proposals
1. U/S: listen for `pointermove` on the overlay (or window, mapped through the canvas rect) so mouse aim keeps updating over the ability bar. Evidence in item 2.1.
2. D: pin the Trial arena (leash the hero to the plaza or freeze the zone cap at the Trial's own) so ramp numbers mean the same thing every fight.
3. D: decide whether a 30 Hz bot dying in fight 6 is acceptable for a 6-fight endgame ladder; if not, soften the sweep (above).
