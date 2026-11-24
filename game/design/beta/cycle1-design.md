# Cycle 1 design review (D)

Branch `cyc1-design` from 86eda4b, own server 9714, DB blocked in every context (route abort, WebSocket close, town page stubbed), no chat, no writes. Targeted runs only. Scripts lived in the scratchpad (not committed). All numbers are simulated or bot play, not human play: they show where bots break, not what a person feels.

## Item 1: measured play
### Isles taming loop (isles-first-ten.test.js, ALL PASSED at the unchanged tip, 45 s wall)
Phone 390x844, simulated time, 600 s per profile, bot gathers, feeds, tames.
- First gather 1.4 to 3.8 s (one profile 41 s on the jungle, where the bot fed first). First feed 2.1 to 9.7 s.
- First tame: home 41.4 s and 49.3 s, jungle 39.7 s and 45.9 s, tundra 53.1 s and 53.4 s. Max gap between reward events 40.2 to 42.8 s against a limit of 45, so the loop sits at the edge of its own gate: any nerf to feed cadence breaks `maxRewardGap`.
- Feeding cadence is one feed per about 6.2 s. A clover hopper needs 5 feeds (about 30 s), big ones 12 to 14.
- First combat drop 55 to 185 s; deaths 0 in all runs; the hint named an action in 100 percent of seconds.
- Food economy (computed from source, not played): Home pouch = jungle base (berry 12, meat 12, bug 8) + clover 10 + apple 4. Oakback (rare, zone 3) eats only golden_apple and needs 12 feeds; golden-apple glints are 4 nodes with a 300 s respawn (`mm-isle-craft.js:79`), so one Oakback tame costs at least two respawn waits (about 10 minutes of waiting). The pouch apples do not count. See ID-15. The Oakback fight and ride were not played.

### Town daily activities
Not played in a browser (time box; the Town needs the live room or a stub). Read from source: tree shake cooldown 20 s, fossil respawn 25 s, flower regrow 30 s, beach spots 20 s, weather window 8 min, turnip buy cycle 4 h and sell cycle 15 min, guestbook 1 per minute. All are per-client cooldowns, no streaks. Finding (read, not measured): there is no single "what to do today" surface (ID-09, ID-18).

### Dungeon floor
NOT played this cycle (time box). No claims.

### Trial of Six (Lv 20 gate)
Bot (hold fire at the boss, orbit at 260 px, no dodge) via `rush.start()`: Lv 20 with a common sparkwand fell in fight 1 after 20 s; Lv 30 with a rarity 3 sparkwand fell after 43 s. The boss had 990 max HP and the bot did about 45 damage (5 percent) in both, so the bot's fire is not a valid DPS sample (mouse-based aim probably did not register). Only reliable fact: a non-dodging hero dies in fight 1 within 43 s. No claim about Trial pacing. Next cycle needs a bot that fires through the real key input and dodges telegraphs.

### Arcade games, 3 rounds each (bots with human-like timing noise)
| game | bot | results (3 rounds) |
|---|---|---|
| Stack (90 s) | 22 px error, 0.12 s lag | floors 9, 6, 6; each ended by a total miss at 8 to 12 s |
| Stack | 9 px, 0.08 s | floors 16, 13, 13; ended 14 s in; perfects 5, 3, 2 |
| Stack | 4 px, 0.05 s | floors 17, 16, 18; ended about 15 s in; perfects 1 to 2 |
| Pop (90 s) | best-move bot, 1.2 s per tap | 53,910 / 50,370 / 39,750; tile 9-10; chain 7-8; 88-94 taps |
| Pop | random move, 1.5 s per tap | 23,820 / 24,660 / 28,680; tile 8-9; chain 5-7 |
| Echo (120 s) | 2 percent error | best tune 12 (timed out, 1,045 pts), 5 (wilted at 32 s), 10 (wilted at 91 s) |
| Echo | 8 percent error | best 4, 5, 3; wilted out at 20 to 30 s |
| Dash | auto-jump lead 34 px | 1.4-2.3 km, died at 64 to 89 s |
| Dash | lead 48 px | 1.7 km (71 s), 9.2 km (301 s), 12.5 km (400 s cap) |
| Dash | lead 60 px | 11.3 km, then two runs at the 400 s cap |

Findings: (1) Stack is the harshest: a total miss ends the round, the round is built for 90 s but even a precise bot plays 10 to 15 s and 6 to 18 floors (ID-21). (2) Echo gives 3 leaves for a 2-minute round, so a mistake-prone player is out in 20 to 30 s (ID-22). (3) Pop is healthy: both bots use the whole 90 s and the casual to careful spread is 2x; the 25k medal is reachable for casuals (ID-23). (4) Dash survival is bimodal on timing accuracy and the course has no late ramp (ID-24). These bots are not people: the Stack and Echo rates need a human sample before any tuning.

## Item 2: L-13, the eight unloaded shared modules (decision only; nothing deleted here, S/L act next cycle)
| module | decision | one-line reason / integration point |
|---|---|---|
| mm-board.js | remove (module plus its assertions in `shared-mm-daily-ghost-board-access.test.js`, keep the daily/ghost/access ones) | A leaderboard needs a Firebase write path the rules forbid and no net work is planned; personal bests are covered by ID-10. |
| mm-bounties.js | wire | ID-18: Town card in `main.js`; events from tree shake, bug catch, villager wave; reward = Town coins (fame and petTreat do not exist). |
| mm-events.js | remove (keep the bounties half of `shared-mm-events-bounties.test.js`) | The Wilds mode never shipped; the Realm has its own Raid/Swarm event list in realm-world.js and the Closing machine has no host. |
| mm-pets.js | remove with `shared-mm-pets.test.js` | Eggs and hatching duplicate Isles tames and companions; two pet systems would split the save. |
| mm-wilds.js | remove with `shared-mm-island-wilds.test.js` | The roaming-group spawner is superseded by the `mm-zones` spawner and the Isles creature spawner. |
| mm-labyrinth.js | keep-as-library, wire through ID-25 | Seeded 12x12 maze with Hedge Tide fits a new arcade page with the `MMDaily` Daily Maze seed; integration is `games/hedge/`, a hub card and a medals key. |
| mm-mini-art.js | keep-as-library | Id/fallback loader for minigame art m01-m08; wire only once G registers the Codex batches in `assets/arcane/INDEX.json`; integration is each arcade game's draw-by-id call. |
| rules-check.js | keep-as-library (move to `tools/` when convenient) | Validates `firebase-rules.draft.json` for `shared-rules-draft.test.js`; a dev tool, not a page module. |

## Item 3: b04-12 Realm tents and campfire walkable
Decision: NO, keep them walk-through for this release. Reasoning: tent, campfire and hut are drawn props (`realm-world.js:335-336`), not tiles in `world.solid`. Making them solid would (a) change hero and enemy collision at every camp: enemies have no pathfinding and could wedge on a new obstacle, (b) interfere with site and spawn placement, which already requires `solid[i] === 0` (`mm-sites.js:42`) and the world generator's reachability, (c) create bullet-hell corners where a prop shields or traps the player. The visual complaint is answerable without collision: a foot shadow and a fade to about 70 percent alpha while the hero overlaps the sprite. If the owner still wants solid camps, S adds a 1x1 footprint in worldgen with a flood-fill reachability test and a spawn exclusion radius first.

## Item 4: tuning
No tuning change this cycle. The candidates (ID-13 second-wind gates, ID-01 Shore ramp) have concrete numbers in IDEAS.md, but the evidence is one cycle-0 bot run plus a Trial bot that never hurt the boss, which does not meet the measured-evidence bar. The Isles loop measured here sits close to its own gate (reward gap 40-43 s of 45), so no Isles table was touched. `isles-first-ten` was run once at the unchanged tip and passed; `first-ten-minutes` was not run because no code or data changed.

## Item 5: ideas
11 new proposals ID-15 to ID-25 in IDEAS.md (Isles 3, Town 2, arcade 6), each with files, test plan and effort. ID-01 and ID-13 keep status `proposed` with numbers added.
