# Cycle 0 design review (D, Gameplay Designer)

Branch `cyc0-design` cut from `r4-integ2`, own server on 9704, DB blocked in every context (route abort plus WebSocket close, town page stubbed), no chat, no writes. Targeted tests only.

## What was actually played (and what was not)
Played through Playwright on desktop 1280x720 with a simple bot (hold fire at the nearest enemy, back off under 150 px, one ability per 3 s), seed 4242, fresh profile, tutorial off. Script lived in the scratchpad, not committed.
- Shore, Lv 1, 120 s: reached Lv 7. Kills 49, shards 259, 4 items, no deaths. Lowest HP 70/100 (at 8 s). Lv 2 at 14 s, Lv 3 at 27 s, Lv 4 at 39 s, Lv 5 at 64 s, Lv 6 at 89 s, Lv 7 at 108 s. About 2.2 shards/s.
- Highlands, Lv 10 hero, 100 s: HP 172 to 17 in 19 s with 1 kill, then death at 25-28 s (the death-screen loop counted 3 samples; one real death).
- Godlands, Lv 15 hero, 100 s: died at 15 s on the way (the hero was in the Highlands at the time), one real death.
- Midlands, Lv 5 hero: the teleport did not land in zone 1 (start sample says Shore), so this run measured the Shore at Lv 5-7 again. NOT a Midlands result.
- Not played in a browser this cycle (time box): Isles taming, Town activities, dungeons, Trial of Six, each arcade game. For those I only read the b01/b02/b05/b08 r2 reports and the design docs; no new claims about them are measured.
Bot caveat: the bot does not dodge, so death times are an upper-bound risk, not what a good player sees.

## Pacing findings
1. Shore teaches for about 1 minute only. [measured] Lv 5 (the Midlands recommended level) arrives at 64 s. After that Shore kills give no challenge (HP never below 70 percent). Fine for the first ten minutes, but there is no push inland: the goal line says "Reach Lv 5 for Midlands" and that is already true after one minute. See ID-01.
2. The Shore to Highlands step is a cliff. [measured, one bot run] A recommended-level hero (Lv 10) lost 90 percent HP in 19 s. Zone mults at Highlands are HP x3.2, dmg x1.7, speed x1.16 against the Shore baseline (`mm-zones.js ZONE_MUL`) while hero HP only grows 8 per level (100 to 172 at Lv 10, 1.7x). Only a border toast warns. See ID-02, ID-14.
3. XP curve inverts at depth. [computed] Need is 30 + 20 per level (linear) but XP per kill doubles per zone (1, 2, 4, 8). Lv 15 to 20 needs 1750 XP, about 44 Godlands kills. Levels past 15 are cheap; the real wall is surviving Lv 8-12 in the Midlands and Highlands. See ID-13.
4. Shard income is high relative to quests. [measured 2.2 shards/s] The kill quest pays 30 + 10 x zone + need shards (about 50-90), roughly 30 s of Shore farming, so the quest reward is mostly its bag. See ID-03.
5. Daily quest quality. [computed over 365 dates] Kill-zone quest zone spread: Shore 90, Midlands 79, Highlands 101, Godlands 95. So 196 of 365 days (54 percent) give a kill quest in a zone recommended for Lv 10 or 15. The goal line already hides out-of-reach quests (G-06), but the Nexus board listed them with no level, so a Lv 3 player could pick a task they cannot do. FIXED, see below. The boss quest has the biggest reward but needs a Midlands altar fight (Lv 5+).
6. Carried from the beta r2 reports (not re-measured): boss bar on the death card (b01-07), Oakback food supply unreachable (b05-05), phone how-to card over HUD (b05-10), Town HUD and Join hint (b08-06, 11), forge double-tap can destroy a wand (b02-12). Dead time: walking back after a retreat on an 8192 px map (ID-11).

## Tuning change made
1. Quest board shows the recommended hero level. Evidence above (items 2 and 5). Data and text only:
   - `game/shared/mm-quests.js`: quest descriptors and summary rows gain an additive `rec` (zone recLv: 1/5/10/15; the boss quest uses 5) and a pure `levelHint(row)` returning "Lv N+" (empty on the Shore). Quest ids, text, needs, rewards, seeds, stored state are unchanged.
   - `game/games/mad-maze/realm-world.js`: the board row appends " · Lv 10+" after the reward.
   - First attempt appended the hint to the quest text itself; the existing `beta-g06-quest-zones` test requires the text to end with the zone name, so it was reverted rather than weakening that test.
   - New test `game/tests/cyc0-d-quest-level-hint.test.js` (registered smoke in `test-tiers.json`): 365 dates for `rec`, hint strings, hostile input, text unchanged, board source wired. The first version of this test (text suffix) failed against the unchanged code (3 of 5 fail); the final version needs `levelHint`, which did not exist before.
   - Checks run: `cyc0-d-quest-level-hint` 6/6, `shared-mm-quests` ok 39 assertions, `beta-g06-quest-zones` 0 FAIL, `world-nexus` ALL PASSED (live board render path).
   - First-ten-minutes and isles-first-ten tests were NOT re-run (the change touches neither the coach nor Isles); `first-ten-minutes.test.js` should be in the coordinator's shard.

No other tuning was made: finding 2 rests on one bot run and needs a dodging-bot or player sample before changing zone multipliers.

## Ideas
14 proposals in `game/design/IDEAS.md` (all `proposed`). Top five: ID-02, ID-06, ID-07, ID-04, ID-03.
