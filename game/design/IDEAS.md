# IDEAS (Gameplay Designer, cycle 0)

Flow: D proposes (`proposed`) -> L or U marks `approved` / `rejected` with a reason -> S implements -> D/U verify in play.
Hard limits for every idea: no pay-to-win, no paid randomness or loot boxes, no fake urgency (no countdown outside a round, no expiring rewards, no streaks across days), additive saves only, original art only, Firebase never written by tests.
Cycle 2: exact specs for the needs-change ideas (and ID-26 to ID-33) are in `beta/cycle2-specs.md`; `approved-spec` there means S may start.
Effort S under half a day, M about a day, L several days. Evidence tags: [M] measured in cycle 0 play (see `beta/cycle0-design.md`), [R] from generic design research (sources at the end).

| id | title | effort | risk | status |
|---|---|---|---|---|
| ID-01 | Lantern-light Shore ramp | S | low | built (cycle 3 build, status set by D in cycle 4; earlier note: approved-spec (D, cycle 2): see Cycle 2 specs; level fade in the kill path, Lv 1-4 untouched) |
| ID-02 | Zone-border danger meter | S | low | built (S, cycle 1; in play): `shared/mm-danger.js` + the zone HUD line in `realm-world.js`; test `cyc1-danger-meter`. L checked all land tiles of 6 seeds in cycle 2: the label never leaves its zone's level range |
| ID-03 | Quest rewards that scale with zone | S | low | built (S, cycle 1; in play): `mm-quests.js` `killShards` = 30 + need + 8 x zone level, capped; test `cyc1-quest-zone-rewards` |
| ID-04 | Hero notebook (knowledge meta-progression) | M | low | built (S, cycle 2; in play): `shared/mm-notebook.js`, own key `pixeltown-notebook-v1` (not under the Realm save: three pages write it), Nexus Notebook button; tests `cyc2-notebook`, `cyc3-notebook-blocked` (L, cycle 3: a refused storage write no longer wipes the visit's pages) |
| ID-05 | Bullet-readability presets | M | medium | approved-spec (D, cycle 2): High contrast only, per-frame style, bench before/after |
| ID-06 | Assist sliders (damage taken, speed, aim help) | M | medium | approved-spec (D, cycle 2): damage taken + aim help only, no speed slider |
| ID-07 | Tame bond hearts (Isles) | M | low | built (cycle 3 build, status set by D in cycle 4; earlier note: approved-spec (D, cycle 2): hearts are a view of `bond` (no new field)) |
| ID-08 | Dungeon first-clear milestones | S | low | built (S, cycle 6; not yet verified in play by D/U): the first floor-1 boss of a biome on this device turns the summary banner gold and adds "First clear <Biome> · next: <next>" (once); record = the dungeon's own `pixeltown-deep-v1` (no new key, so not the Realm-save `fc` of the cycle 2 spec; clears made before G-25 shipped are not known and show the card once more); test `cyc6-dungeon-first-clear` |
| ID-09 | Forgiving Town day count (replaces the Day N streak; never resets) | S | low | built (S, cycle 8; verified by D in cycle 9: visitDays 7 -> 8 after a 5-day gap, no reset, badge "Days in town N", same-day reload changes nothing; test `cyc7-s-visit-days`, `cyc9-design-town-bounty-deviations`) |
| ID-10 | Shared result card across arcade games | M | medium | approved-spec (D, cycle 2): migration plan, one game per commit, Pop first |
| ID-11 | Realm retreat flag (safe walk-back) | M | medium | approved-spec (D, cycle 2): Nexus trip reuses `returnTo` + `safeReturn` |
| ID-12 | Town-to-Realm errand chain | M | low | built (cycle 3 build, status set by D in cycle 4; earlier note: module built, NOT wired (S, cycle 2): `shared/mm-errands.js` + test `cyc2-errands`; no page loads it and no save key exists yet. Left: Town NPC dialogue, the additive Town save field, Backup + SAVE-KEYS line (L approved in cycle 1: other saves read-only through their clean functions; no network)) |
| ID-13 | Mid-game "second wind" zone gates (Lv 8-12 plateau) | S | low | built (cycle 3 build, status set by D in cycle 4; earlier note: floor built, NOT wired (D, cycle 2): `MMZones.rollDrop` honours `info.firstKill === true` (`FIRST_KILL_BAG_FLOOR`, test `cyc2-first-kill-floor`), but nothing passes it: no first-kill flag in the Realm save yet, so play is unchanged. S wires the flag) |
| ID-14 | Hit-pause and telegraph timing audit | S | low | built (cycle 3 build, status set by D in cycle 4; earlier note: approved-spec (D, cycle 2): telegraph audit + draw-only hit pause, off under reduce motion) |

## ID-01 Lantern-light Shore ramp
- Player-facing: the Shore's first 10 minutes keep their gentle start, but past Lv 5 the Shore stops giving full XP (a soft fade to 60 percent), and a one-line toast says "The Midlands has better prey". A hero who lingers is nudged inland, never blocked.
- Why here: [M] a fresh Lv 1 hero reached Lv 5 in 64 s and Lv 7 in 114 s with HP never under 70 percent; the Shore stops teaching at Lv 5 but still pays full. Fits the Realm zone-ramp identity.
- Files: `shared/mm-zones.js` (ZONE_MUL.xp curve, data), `realm.js` (`_gainXp` call site in kill), `tests/world-ttk.test.js` neighbours.
- Test plan: node sim of kills-to-level per zone; browser check that Lv 1-4 XP is unchanged (first-ten-minutes stays intact), Lv 6 Shore kill gives less XP.
- Effort S. Risk: low (could feel like a penalty; keep the toast positive, never reduce loot).

## ID-02 Zone-border danger meter
- Player-facing: a thin coloured bar at the edge of the HUD shows how deadly the current tile is compared with your level ("comfortable / tough / too hot"), using the existing smooth `difficultyAt`.
- Why: [M] a Lv 10 hero in the Highlands went from 172 to 17 HP in 19 s; the only warning is a border toast. Teaches the RotMG skill of reading the ramp.
- Files: `games/mad-maze/realm-world.js` (HUD, `diffAt`), `realm-ui.css`, `shared/mm-zones.js` (recLv).
- Test: node test of the label function (level vs difficulty); browser screenshot at 390x844 and 1280x720; colour not the only cue (text label).
- Effort S. Risk: low (HUD clutter on phone, b08-12; make it one small line).

## ID-03 Quest rewards that scale with zone
- Player-facing: today's kill quest pays shards 30 + 10 per zone + need (about 50-90), roughly 30 s of Shore farming [M: 2.2 shards/s]. Raise the zone term so Highlands and Godlands quests are worth the trip, and let the boss quest pay its purple bag only once per day (as now).
- Files: `shared/mm-quests.js` (reward table), tests `shared-mm-quests.test.js`.
- Test: node: reward monotonic in zone and never above the existing cap (1000); bag tiers unchanged.
- Effort S. Risk: low (shop price inflation; check with the economy owner first).

## ID-04 Hero notebook (knowledge meta-progression)
- Player-facing: a notebook page per boss and per creature fills in as you meet it (pattern sketch, a hint such as "dodge clockwise"). No stat gain. [R] roguelite meta-progression works best as options and knowledge rather than raw power.
- Why: Realm bosses are pattern puzzles; the Lantern already stores profiles.
- Files: new `shared/mm-notebook.js` (pure), `lantern.js` panel, `realm-world.js` kill hook; save key additive `notebook` under `pixeltown-realm-v1`.
- As built (cycle 2): the panel is in the Nexus (`realm-world.js`), not the Lantern; the save is its own key `pixeltown-notebook-v1` (Backup + SAVE-KEYS.md updated); the dungeon and the Isles write pages too (first clear per biome, first tame per species).
- Test: node (record, clean, cap size); browser (kill one creature, page appears).
- Effort M. Risk: low.

## ID-05 Bullet-readability presets
- Player-facing: Settings > "Bullet look": Classic / High contrast (enemy bolts get a bright rim and player bolts fade at 50 percent) / Calm (fewer decorative particles). [R] the top bullet-hell complaint is enemy shots hard to see and player shots matching enemy colours.
- Files: `realm.js` bullet draw, `shared/mm-fx-draw.js`, settings panel, `shared/mm-access.js`.
- Test: browser pixel-sample that the high-contrast rim exists; perf check with `realm-bullet-bench.test.js`.
- Effort M. Risk: medium (draw hot path; keep behind a flag and benchmark).

## ID-06 Assist sliders
- Player-facing: three optional sliders in Settings: damage taken (100 to 50 percent), game speed (100 to 70 percent in Realm/dungeons), aim assist strength. Never called "easy mode"; no score or medal is hidden because of them. [R] graded assist options (aim strength sliders, damage reduction, speed) are standard in large action releases.
- Why: b08 found new players die on the Shore; an owner-controlled option is better than silent difficulty changes.
- Files: `realm.js` (`_hitPlayer`, clock scale), `shared/mm-access.js`, settings UI; save key additive `assist`.
- Test: node for scale maths; browser: hit takes 50 percent at the slider setting; default unchanged.
- Effort M. Risk: medium (medals and PB fairness; flag assisted runs honestly, never block them).

## ID-07 Tame bond hearts (Isles)
- Player-facing: each tamed creature has 3 bond hearts that fill by feeding favourites, riding and fighting together (gentle caps per day-less session, no decay). Hearts unlock a tiny perk (a new idle animation, a faster feed, a mount ability). [R] companion affinity tiers work when each tier unlocks something visible, not only a number.
- Why: Isles taming ends at "tamed"; b05 found the food supply is the real bottleneck, so bond gives a second use for the same food.
- Files: `shared/mm-tames.js`, `games/isles/isles.js` stable panel, save additive under the tames key.
- Test: node (bond gain caps, no decay); browser (feed raises hearts in the stable row).
- Effort M. Risk: low.

## ID-08 Dungeon first-clear milestones
- Player-facing: the first clear of each of the four biomes gives a named medal and a small one-time cosmetic (banner colour), shown on the dungeon summary; "next biome to clear" is named.
- Why: dungeons have no milestone beyond loot; the Hub already has medals. Clear goals counter grind feeling [R].
- Files: `games/mad-maze/dungeon.js` summary, `hub/` medals key (one writer per key), `shared/mm-nav.js` untouched.
- Test: node medal logic; browser first clear shows the card once.
- Effort S. Risk: low.

## ID-09 Cozy daily chore card (no streak)
- Player-facing: the Town shows one friendly card of 3 optional chores for today (water the garden, feed a fish, wave at 2 neighbours). Doing none costs nothing; there is no streak and no "you missed".
- Why: [R] ritual and self-paced loops beat obligation; AGENTS rules forbid streaks and the TN3 task already removes the "Day N streak" text.
- Files: `main.js` (Town), `shared/mm-daily.js`; save additive.
- Test: node for seeded chore choice; browser the card renders and ticks.
- Effort S. Risk: low.

## ID-10 Shared result card across arcade games
- Player-facing: every arcade game ends on the same card: result, your best, a near-miss line ("2 short of your best"), the seed code, Play again first.
- Why: RESEARCH-MINIGAMES finding 8; each game builds its own panel today.
- Files: `shared/mm-minikit.js` (`panel`), each game's result handler; one game per PR.
- Test: node view-model; browser per game: Play again focused, no key names on touch.
- Effort M. Risk: medium (touches many game files; migrate one at a time).

## ID-11 Realm retreat flag
- Player-facing: a placeable "flag" item (crafted from shards, one active) that, when you press Nexus, drops a marker where you left so Return-to-spot is one tap. A hero who retreats to heal keeps their place deep in the world instead of walking back for minutes.
- Why: [M] zone distances are long on 8192 px; walking back is dead time between fights.
- Files: `realm-world.js` (Nexus, safeReturn), `shared/mm-nexus.js`; save additive.
- Test: browser: place, Nexus, return lands within 3 tiles and no free invulnerability beyond SAFE_SHIELD.
- Effort M. Risk: medium (exploit: skipping zone travel; only returns to a spot already visited).

## ID-12 Town-to-Realm errand chain
- Player-facing: three Town NPCs each give one short errand that needs something from another mode (a Realm drop, an Isles herb, a fish). Finishing all three opens a one-time decor item. No timer.
- Why: Town, Realm, Isles and arcade feel like separate products; errands connect them in the owner's "one game" direction.
- Files: `main.js` NPC dialogue, `shared/mm-quests.js` sibling module, saves read-only from other keys.
- As built so far (cycle 2): only the pure module `shared/mm-errands.js`. Not in the game yet.
- Test: node chain state; browser dialogue advances with seeded saves.
- Effort M. Risk: low (cross-save reads must stay read-only).

## ID-13 Mid-game "second wind" zone gates (Lv 8-12 plateau)
- Player-facing: the first boss kill in each zone gives a guaranteed pink bag, so hitting the Lv 8-12 band always yields a visible upgrade.
- Why: [M] XP per kill doubles each zone while need grows linearly (30 + 20 per level), so levels 15-20 come in about 100 Godlands kills; the real wall is survival at Lv 8-12 where gear is the answer.
- Files: `shared/mm-zones.js` (BOSS_BAG_WEIGHTS floor), `realm-world.js` boss drop.
- As built so far (cycle 2): only the floor in `mm-zones.js` (`FIRST_KILL_BAG_FLOOR` = pink, pink, purple, cyan, behind `info.firstKill`). The `realm-world.js` boss drop does not pass the flag yet.
- Test: node: boss bag weights never roll brown below zone 1 first clear (pity counter).
- Effort S. Risk: low.

## ID-14 Hit-pause and telegraph timing audit
- Player-facing: no new feature; every boss pattern gets a 0.4-0.6 s ground telegraph before its first volley, and big hits give a 50 ms hit pause.
- Why: [R] heavy feel from hit pause, fairness from readable tells; b01 lists unfair spikes.
- Files: `shared/mm-telegraph.js`, `realm.js` boss attack table.
- Test: node: every boss pattern has telegraph >= 0.4 s; telegraph existing tests extended.
- Effort S. Risk: low.

## Feasibility review (L, cycle 1)
Read against the code at 86eda4b. `approved` = S may start; `needs-change` = S may start once the change in the status line is in the proposal; none rejected.
- ID-01: `ZONE_MUL.xp` feeds `mm-zones` stats for every hero level and the `world-ttk` test; a level-based fade belongs where the kill pays XP. Loot stays untouched.
- ID-02 / ID-03: confirmed, not revoked. ID-02: write the label only when it changes (L-04 / L-09 removed per-frame HUD writes; do not add one). ID-03: `shards: 30 + zone * 10 + need` is one line in `mm-quests.js`; the reward itself has no cap today (the 1000 clamp there is on progress events), so the test must add one.
- ID-05: the bullet draw loop is the hottest draw path; one preset with a per-frame choice is cheap, per-bullet style switches are not.
- ID-06: a speed slider multiplies `dt` for bullets, cooldowns, telegraphs, the first-minute floor and the seeded tests. Damage taken (one multiply where the player is hit) and aim strength are safe. Mark assisted runs in the run summary.
- ID-07: `cleanTame` already keeps `bond` (1..MAX_BOND) and `aff`, and `bond` rises with `aff / 100`. Hearts are a view of that; a new field would fork the data.
- ID-08: one writer per key (SAVE-KEYS.md). The dungeon may write only its own save.
- ID-09: the IDEAS hard limits forbid streaks across days, yet `setupLoginStreak` / `updateSellStreak` pay them today. A chore card beside a streak counter is two daily systems; the owner decides (with L-08) whether the card replaces them.
- ID-11: the walk back is real. `realm-world.js` already stores `save.returnTo` and lands a hero back from a dungeon with `safeReturn` (3 s shield, hop away from a live event), but only for the `?at=` arrival. Using the same record for the Nexus trip gives the feature with no new item, no crafting cost and the exploit rule already solved (the tile was visited).
- ID-14: a real 50 ms sim pause would shift bullet timings that tests pin (realm.js header: "Bullet counts and timings never change").

## Top five to approve first
1. ID-02 Zone-border danger meter (cheap, fixes the measured Highlands spike).
2. ID-06 Assist sliders (owner-controlled difficulty, answers b08 new-player deaths).
3. ID-07 Tame bond hearts (gives Isles a long-term goal, reuses food).
4. ID-04 Hero notebook (knowledge progression, no power creep).
5. ID-03 Quest rewards that scale with zone (data-only, makes the daily quest worth the trip).

## Sources (generic queries)
- Roguelite meta-progression: https://bugnet.io/blog/how-to-design-a-roguelite-meta-progression , https://www.gamebrief.net/glossary/meta-progression
- Bullet-hell readability: https://gamedeveloper.com/design/the-1-pixel-collision-box , https://shmups.wiki/library/Boghog's_bullet_hell_shmup_101
- Creature bonding: https://yukaichou.com/advanced-gamification/the-pet-companion-design-in-gamification/
- Cozy daily loops: https://dev.to/tatomamo_games/designing-a-stress-free-game-loop-balancing-engagement-vs-pressure-2976 , https://medium.com/kitfox-games/designing-for-coziness-d33d2519a59e
- Action accessibility: https://www.pcgamer.com/accessibility-means-more-than-just-an-easy-mode , https://www.naughtydog.com/blog/THE_LAST_OF_US_PART_II_ACCESSIBILITY_FEATURES_DETAILED

## Cycle 1 proposals (D)
Evidence tags as above; [M1] = measured in cycle 1 play (`beta/cycle1-design.md`). All `proposed`. ID-01 and ID-13 get concrete numbers below; neither is implemented this cycle because the evidence is one bot run (see the cycle 1 doc).

| id | title | effort | risk | status |
|---|---|---|---|---|
| ID-15 | Isles Oakback orchard route (food sink fix) | S | low | built (S, cycle 7, approved by coordinator): Shore only (`restOk`), `?idlerest=0` off; see `beta/cycle7-systems.md` |
| ID-16 | Isles creature "likes" journal hint | S | low | proposed |
| ID-17 | Isles tame verbs per species | M | low | proposed |
| ID-18 | Town daily bounties through mm-bounties (Town pool, stars only) | M | low | built (S, cycle 8; verified by D in cycle 9: pick-3-flowers and say-hi-to-2 counters behave, deviations accepted; open: ID-58 sleeping-neighbours hint; test `cyc7-s-town-bounties`) |
| ID-19 | Town neighbour gift errand (no streak) | M | low | proposed |
| ID-20 | Arcade daily course with a shared modifier | M | low | proposed |
| ID-21 | Stack soft first miss | S | low | proposed |
| ID-22 | Echo leaves refill on a clean tune | S | low | proposed |
| ID-23 | Pop rescue shuffle | S | low | proposed |
| ID-24 | Dash pacer ghost and late ramp | M | medium | proposed |
| ID-25 | Hedge Tide maze as a fifth arcade game (wires mm-labyrinth) | L | medium | proposed |

### Numbers for ID-01 and ID-13 (not implemented)
- ID-01: XP multiplier on a Shore kill = 1.0 for hero Lv 1-4, then 0.85 / 0.7 / 0.6 for Lv 5 / 6 / 7+ (floor 0.6; shards and drops untouched). Expected: Lv 5 to 7 on the Shore slows from 44 s (measured 64 s to 108 s) to about 75 s. Gate before implementing: `first-ten-minutes` and `isles-first-ten` unchanged (Lv 1-4 untouched), plus a node table test.
- ID-13: BOSS_BAG_WEIGHTS row 0 (Shore boss) from [0.30,0.40,0.20,0.10,0,0] to [0.15,0.40,0.30,0.15,0,0]; row 1 from [0.10,0.30,0.35,0.20,0.05,0] to [0.05,0.25,0.35,0.25,0.10,0]. Needs boss-kill-per-level-band evidence first (not measured; the Trial bot never beat a boss).

## ID-15 Isles Oakback orchard route
- Player-facing: [M1, computed] Oakback needs 12 golden apples (`mm-creatures` T('feed',0,14,12)); the Home pouch holds 4 plain apples it does not eat; golden-apple glints are 4 nodes with a 300 s respawn. Add an orchard patch of 6 golden-apple glints near its seeded spot and a hint "Oakback loves golden apples" once sighted.
- Files: `shared/mm-isle-craft.js:79`, `mm-isle-pouch.js` WHERE line. Test: node, at least 12 apples available per 600 s. Effort S, risk low.

## ID-16 Isles likes journal hint
- Player-facing: when a creature is sighted the journal row shows its favourite food as an icon plus the pouch count, so feeding is never a guess. [R] feeding-preference taming works when the preference is discoverable.
- Files: `isles.js` journal, `isle-creatures.js` diet. Test: browser, the row shows the icon. S / low.

## ID-17 Tame verbs per species
- Player-facing: [M1] the first tame lands at 40-53 s on every island, always by the same feed loop (one feed per 6.2 s). Give three calm species a different gentle verb (stand still near it 8 s; leave a food glint and step back). [R] bonding framed as a relationship rather than capture.
- Files: `mm-tame.js`, `mm-creatures.js` T(). Test: node per verb. M / low.

## ID-18 Town daily nudge through mm-bounties
- Player-facing: wire the 3 deterministic bounties (`mm-bounties`, no streak, no penalties) as a small Town card (shake a tree, catch a bug, wave at a neighbour). Rewards: Town coins only. Closes L-13 for mm-bounties.
- Files: `main.js` card; `mm-bounties.js` forDate / progress / claim. Test: node and browser tick. S / low.

## ID-19 Town neighbour gift errand
- Player-facing: a villager asks for one thing the Town gives (fruit, fossil, fish); handing it over gives a postcard line. No timer. Uses existing cooldown nodes (tree 20 s, fossil 25 s, flower 30 s). M / low.

## ID-20 Arcade daily course with a shared modifier
- Player-facing: each arcade game's Daily uses `MMDaily.seedFor(date)` plus one visible modifier (Dash low gravity, Stack wider blocks, Pop 4 tile kinds, Echo tunes start at 4). Unlimited retries, best score kept. [R] daily runs with a shared seed and modifiers (Spelunky, Caveblazers, Dead Cells). No streak, no expiry. M / low.

## ID-21 Stack soft first miss
- Evidence [M1]: a casual bot (22 px error) ended on floor 6-9 about 10 s into a 90 s round; a 9 px bot reached 13-16 and also ended about 14 s in. Proposal: the first total miss per round trims the top block to a minimum width instead of ending. Test: node, casual bot reaches 12 floors on 3 of 3 seeds. S / low.

## ID-22 Echo leaves refill on a clean tune
- Evidence [M1]: 3 leaves last the whole 120 s round; an 8 percent per-tap error bot lost them all by tune length 3-5 (20-30 s in); a 2 percent bot reached 12 once and wilted out at 5 once. Proposal: finishing a tune with no wilt returns one leaf (max 3). S / low.

## ID-23 Pop rescue shuffle
- Evidence [M1]: pop never ran out of moves in 6 bot rounds. A random-move casual scored 23.8-28.7k vs 39.8-53.9k for a best-move bot, so the 25,000 medal is a coin flip for casuals. Proposal: one free shuffle if `hasMove()` is false (dead board not seen yet; add a counter first). S / low.

## ID-24 Dash pacer ghost and late ramp
- Evidence [M1]: the same auto bot with lead 34 px dies at 64-89 s, lead 48 px at 71 s to the 400 s cap, lead 60 px reaches the cap; a 14 px timing window separates a one-minute run from a 12 km run, and the course never ramps. Proposal: after 90 s gentle extra obstacle density, plus a "race a pacer" choice besides the personal ghost. M / medium.

## ID-25 Hedge Tide maze as a fifth arcade game
- `mm-labyrinth` (seeded 12x12 cells, Hedge Tide timer) and the `MMDaily` Daily Maze seed exist but no page loads them. A 2-minute maze run with a rising hedge tide, swipe on phone. Gives arcade variety and wires L-13's mm-labyrinth. L / medium (new page, hub card, medals key, test).

Sources (generic queries, cycle 1): [feeding-based taming in cozy games](https://berkeleyhistoricalsociety.org/disney-dreamlight-valley/), [Of Peaks and Tides taming wiki](https://thegameswiki.com/of-peaks-and-tides/wiki/taming), [daily runs, shared seed and modifiers](https://gamedeveloper.com/design/the-24-hour-ticket-examining-daily-runs-), [runner progression](https://gamedeveloper.com/design/studying-gameplay-progression-on-runners).

## Cycle 3 ideas (D, all `proposed`; generic web queries only; evidence [M3] = `beta/cycle3-design.md`)

| ID | Idea | Size | Risk | Status |
|---|---|---|---|---|
| ID-34 | Show-hitbox option for the hero (small core dot, device pref) | S | low | proposed |
| ID-35 | Bolt colour roles: one colour per threat class (aimed / ring / spiral / minion), never two colours that behave the same | S | low | proposed |
| ID-36 | Trial of Six ramp: fights 1-3 stay, fights 4-6 add one pattern layer each, and a carried-HP readout | M | medium | built, tuning signed off on bot runs (S, cycles 5-7): layers A/B/C in `mm-endgame.js` + `realm-world.js`; values lead 1.2 s / 0.5 s ahead, arm 0.7 s / 95 px/s, edge sweep every 9 s; cycle 7 full runs: 60 Hz bot wins 6/6 (252 and 244 HP), 30 Hz bot wins 6/6 with 29 HP (see `beta/cycle7-systems.md`); carried-HP readout built (cycle 6); no human has played it |
| ID-37 | Gear sink ladder: reforge shards 25 x (t-6) (shipped as data in cycle 3) plus a Godlands-only shard sink that never touches outcomes | M | low | proposed |
| ID-38 | Cozy 20-minute day: a Town "that's the day" card once the chores are done (names tomorrow's board, no streak, no timer) | S | low | proposed |
| ID-39 | Species temperaments on the Isles: each tameable has a liked verb (feed / sing / ride) shown in the journal after first sighting; bond grows faster with it | M | low | proposed |
| ID-40 | Dust-first reforge hint: the Forge says which side is short ("12 more kills of dust, shards are enough") | S | low | proposed |

- ID-34: the hit radius is 15 px (RM_PLAYER.r 11 + 4) against a much larger drawn hero [M3]; players of bullet games ask for a visible hitbox (itch.io dev threads) and Brotato ships Projectile Visibility under Visual Aids. A dot only, no change to the hit test.
- ID-35: Danmaku guides and player reviews: many bolt colours that behave the same read as clutter; readable bosses use colour to say what a bolt does. Audit `bolt-art` colours against the pattern classes; pair with ID-05.
- ID-36: [M3] fights are flat at 66-80 s and cost 0 HP at Lv 20 with a common wand when the dodge samples at 55 Hz or better. The Game Developer ARPG readability article: raise difficulty by adding patterns, never by lowering readability.
- ID-37: sources and sinks (dev.to economy guide: inflation = sources outrun sinks; crafting is the main sink; perfect crafted items reachable but rarely reached). [M3]: Godlands makes 9.6 shards and 4.6 dust per kill while a reforge cost 3 shards.
- ID-38: Cozy Grove ends its loop at about 20 minutes and tells players to log off (Vice); Stardew uses daily goals without timers. Fits the no-streak rule: a closing card, not a counter.
- ID-39: Of Peaks and Tides (care-based bond: feeding, grooming, travelling) and a RuneScape taming proposal (favourite foods) both make bond a view of care; ID-07 defines the hearts, this adds the liked verb.
- ID-40: from the economy sim, dust (salvage) not shards is the pacing gate of a reforge (13-22 Godlands kills for dust against 8-13 for shards).

Sources (generic queries, cycle 3): [Designing for difficulty readability in ARPGs](https://www.gamedeveloper.com/game-platforms/designing-for-difficulty-readability-in-arpgs), [bullet hell bosses readability](https://choost-site.pages.dev/blog/bullet-hell-games-best-bosses), [visible hitbox thread](https://itch.io/post/14220428), [Brotato accessibility options](https://www.ludo.guide/guide/brotato/getting-started/controls-keybindings/accessibility-options), [Cozy Grove logging off (Vice)](https://www.vice.com/en/article/bvx9vw/cozy-grove-is-ok-telling-players-to-log-off-its-delightful), [stress-free game loop](https://dev.to/tatomamo_games/designing-a-stress-free-game-loop-balancing-engagement-vs-pressure-2976), [game economy sources and sinks](https://dev.to/hiroshi_takamura_c851fe71/how-to-design-a-game-economy-sources-sinks-loops-and-balance-j05), [roguelite meta progression](https://bugnet.io/blog/how-to-design-a-roguelite-meta-progression), [Of Peaks and Tides taming](https://thegameswiki.com/of-peaks-and-tides/wiki/taming).

## Cycle 4 additions (D): dungeons, Trial, arcade (all `proposed`; generic web queries, sources inline)

| ID | Idea | Size | Risk | Status |
|---|---|---|---|---|
| ID-41 | Door reward preview: each open door shows a small icon for the next room's payoff (chest / key / shrine / fight) before you walk in | S | low | proposed |
| ID-42 | Trial checkpoint scope: a death in fight N restarts fight N only if a shard-priced "second try" is spent; otherwise the run ends as today. Between fights a 5 s breather with a carried-HP readout | M | medium | proposed |
| ID-43 | Dungeon Heat: 3 opt-in mutators on the floor entry card, each +1 heat, score and shard payout scale with heat, the run is tagged with its heat in the result | M | medium | proposed |
| ID-44 | Daily floor: one shared seed + one mutator per day, first attempt ranked (local best + tag), unlimited practice after, no streak | M | low | proposed |
| ID-45 | Secret rooms at dead ends: the cracked door only generates on a room with exactly one regular door, 1 in 5 chance | S | low | proposed |
| ID-46 | Boss phase checkpoints for long arcade bosses (Trial fights 5-6): a phase change is the point where a death costs only that phase's shards | M | medium | proposed |
| ID-47 | Companion care moment: in the stable, a tamed creature can be fed a favourite or petted once per visit; the bond heart ticks with a small animation and a line, so bond growth is felt in-session (b05-r3: riding 190 s gave +30 affinity with no visible change) | S | low | proposed |
| ID-48 | Trial practice fight: after a fall (or from the Nexus) the player may re-run the boss they fell to as an unranked practice: no loot, no pity step, no shards, no best-score change, normal HP and patterns | S | low | proposed |
| ID-49 | Angler "also biting now" line: after each catch the result card lists up to 3 species that can bite at the current time / weather / water that the player has not caught yet, never the exact odds | S | low | proposed |

- ID-41: Hades keeps its fast room-to-room loop by showing the reward on each door so the choice is made before the walk ([Kotaku: Hades level design](https://kotaku.com/hades-level-design-is-less-random-than-it-seems-1845254545), [Windows Central](https://windowscentral.com/hades-going-under-show-how-roguelikes-can-use-repetition-their-advantage)). Our doors already carry a status (open / cracked / locked) and `routeDoors` hints; add the room-type icon. [M4] the bot entered each fresh room with no information.
- ID-42: boss rush write-ups and player threads: restarting only the current boss is tolerable; restarting everything or repeating cleared content is the most disliked ([Game Developer: boss rush](https://gamedeveloper.com/design/boss-rush-mode-boss-yes-not-so-much-rush), itch.io dev threads). A full Trial is 7.2-7.5 min [M3], so a death at fight 5 costs about 5 minutes. Keep permadeath as the default; make the second try an opt-in cost.
- ID-43: Hades Pact of Punishment: opt-in modifiers, each adds heat, rewards scale with heat, the player sets the difficulty ([RPG Site](https://rpgsite.net/feature/10287-hades-pact-of-punishment-heat-modifiers-and-how-to-maximize-your-rewards), [GameGrin](https://www.gamegrin.com/articles/better-on-hard-hades)). Caution from the same sources: the top tier became too random, so cap at 3 mutators. The floor already rolls `mutRes` mutators; this makes them a choice and tags scores (same tag rule as ID-06 Assisted).
- ID-44: Spelunky: one seed for everyone per day, one attempt, leaderboard on final score not time ([Spelunky wiki](https://spelunky.fandom.com/wiki/Daily_Challenge_Mode_(HD)), [Gaming Trend](https://gamingtrend.com/news/spelunkys-daily-challenge-system-will-provide-competition-rage-on-steam)); Slay the Spire counts only the first attempt and each mutator set needs its own board ([PC Gamer](https://pcgamer.com/slay-the-spire-deals-super-hard-daily-challenge-mode-in-latest-patch), [Steam discussion](https://steamcommunity.com/app/646570/discussions/2/1697168437877807582)). Local only, no Firebase writes; seed from the date, like the arcade daily course (ID-20).
- ID-45: Enter the Gungeon makes secret rooms at dead ends with a 1 in 5 chance ([Boris the Brave: Gungeon generation](https://www.boristhebrave.com/2019/07/28/dungeon-generation-in-enter-the-gungeon)). Dead ends make the crack a reward for exploring and keep a secret off the main route. [M4] room 0 of warren seed 7 (the start room) has a cracked door.
- ID-46: bullet-hell players ask for checkpoints at phase changes of long bosses, and say a health refill is not a checkpoint (itch.io threads, e.g. [this one](https://itch.io/post/9737404)). Fits ID-42; costs shards, never refills HP.
- ID-47: bond is described as growing through feeding, grooming and travelling together, with bonded creatures performing better ([Of Peaks and Tides wiki: taming](https://thegameswiki.com/of-peaks-and-tides/wiki/taming)); a player comment says being able to play with, pet and feed tames is what brings them back, and another asks for the bond to feel interactive instead of a menu number ([itch.io thread](https://itch.io/post/15731847)). [M] b05-r3: affinity grew +30 in 190 s of riding with no visible heart change. One action per visit, no daily streak, no punishment for skipping.
- ID-48: players ask for a way to practise a hard last phase without replaying the whole run ("106 of my 108 deaths" were the last phase, [itch.io](https://itch.io/post/12474449)); some argue phase select changes the intended journey ([Steam discussion](https://steamcommunity.com/app/2132850/discussions/0/4357873056148452730/?ctp=9)), so practice is unranked and pays nothing: comfort is free, comparison stays separate (the ID-06 rule). Complements ID-42 and ID-46, which cost shards; this one costs nothing and gives nothing.
- ID-49: cozy fishing games gate the catch pool by time and weather and one life-sim shows the other fish available now after a catch, which saves wasted sessions ([GamesRadar](https://www.gamesradar.com/games/simulation/former-stardew-valley-devs-upcoming-life-sim-has-a-brilliant-quality-of-life-feature-for-its-fishing-that-speaks-to-my-completionist-heart)); collection plus variety is the usual reward loop ([Game Dev's Guide to Fishing Minigames](https://gamedevsjourney.substack.com/p/the-game-devs-guide-to-fishing-minigames)). Reads the existing catch tables; no new fish, no timers.

## Cycle 6 additions (D; all `proposed`; generic web queries only)

| ID | Idea | Size | Risk | Status |
|---|---|---|---|---|
| ID-50 | Coach "Hint pulse": when a coach step has waited 20 s with no progress, the one control it names gets a slow outline pulse (ability button 1, left stick, Menu); one pulse per step, off with reduced motion | S | low | proposed |
| ID-51 | Idle hero rest: a hero with no input for 8 s on the Shore stops being provoked (no quiet-pity nudge) and enemies lose aggro after a short leash; any input resumes normal rules | S | low | built (S, cycle 7 Shore; cycle 8 Resting chip; cycle 9: extended to the Midlands, zone <= 1, and RM_IDLE_REST_S 8 -> 5 s per the D follow-up spec below; tests `cyc7-idle-rest`, `cyc8-s-rest-chip`, `cyc8-design-inland-passive` now asserts 6/6 alive at 120 s) |
| ID-52 | Milestone days instead of a streak for the Town daily bonus: the 40-star chore bonus stays flat, plus a one-time small gift on the 7th and 30th different day played (days counted, never reset, no missed-day lock icons) | S | low | proposed |

- ID-50: new-player design write-ups say a coach should show where to act, not only say it ([Game Developer: the importance of the new player experience](https://www.gamedeveloper.com/business/the-importance-of-the-new-player-s-experience)); b08-r3 shows step 4 waiting on an unnamed button. Pairs with the cycle 6 one-line wording fix.
- ID-51: bullet-hell forum threads ask for time to learn controls before being killed (e.g. [itch.io](https://itch.io/post/15362625)); r3 found an idle hero falling on a landscape phone. Keeps the coach guard, but stops the world from pulling enemies onto a hero that is not playing.
- ID-52: a forgiving model counts days played instead of a chain that breaks; Cozy Grove rewards 7 and 90 different days ([Game Developer: daily rewards](https://www.gamedeveloper.com/business/the-science-craft-of-designing-daily-rewards-and-why-ftp-games-need-them), [ironSource: daily login strategies](https://medium.com/ironsource-levelup/keeping-players-engaged-common-strategies-for-daily-login-by-top-studios-b20d9b595035)). Fits the no-streak rule (ID-09 stays open).

## ID-09 / ID-18 implementation specs (D, cycle 7; status `approved`, S builds; no open questions)
Owner decisions applied: ROUND4.md STANDING OWNER DECISION (ID-09 forgiving only, ID-18 free currency only, L-08: shared or paid out things use the UTC game day). Hard limits: no guilt, no fake urgency, no countdown, no expiry, a missed day never costs progress, additive save keys only, `streakStep` in `main.js` and `shared/mm-gameday.js` stays untouched (test `cyc3-gameday-streak` runs the two side by side on 60000 cases).

### ID-09 Forgiving Town day count (size S)
- What the player sees: the badge `#streak-badge` (index.html:103, "Daily login streak", "Day N") becomes "Days in town N" (title "Days you visited the village"). First visit of a new UTC day: toast "Welcome back! Day N in the village. +B stars" where B = min(N, 5) (same payout rule as today). No "streak", "lost", "missed", "keep it up", "don't break" or "expires" anywhere. After any gap the count simply goes up by 1 (3 days away = still +1, nothing to lose). The sell side the same: no extra toast; only the bonus line `sell day N: +B stars` for N >= 2, and the achievement `sellstreak3` text becomes "Sell at the shop on 3 different days" (id unchanged, so unlocked ones stay unlocked).
- Save (additive, inside `pixeltown-save-v1`, so the one Backup already carries it): `visitDays` (integer >= 0, never decreases), `lastVisitDate` ('YYYY-MM-DD' UTC), `sellDays` (integer), `lastSellDay` ('YYYY-MM-DD'). On the first load with no `visitDays`: seed `visitDays = max(loginStreak, 1)` if the old key exists (nobody starts lower than they were), `sellDays = sellStreak`. `loginStreak` / `lastLoginDate` / `sellStreak` / `lastSellDate` keep being written by the unchanged `streakStep` call (rollback safe, `bestSellStreak` stays) but are no longer shown.
- Files / exact keys: `game/main.js` `setupLoginStreak` (line ~4919) and `updateSellStreak` (~3177): call the new `MMGameDay.visitStep` (below) instead of reading `st.streak` for display/bonus; badge text in `index.html:103` and `style.css` (no width change; "Days in town" fits 12 px, check 195 px); `ACHIEVEMENTS` `sellstreak3` desc and check `(s.bestSellStreak || 0) >= 3 || (s.sellDays || 0) >= 3` (main.js:1054); `shared/mm-backup.js` `TOWN_FIELDS` += `'visitDays','lastVisitDate','sellDays','lastSellDay'`; `main.js:270` key list += the same four; `design/SAVE-KEYS.md` line for `pixeltown-save-v1` += the four fields.
- `shared/mm-gameday.js` new pure `visitStep(lastKey, days, todayKey)` -> `{ days, date, counted, write }` on UTC keys (via `keyNumber`): same day: no change; today strictly after the stored day: `days + 1`, counted, write; stored day in the future (device clock was ahead): 1 or 2 days ahead nothing counted, nothing written (waits), more than 2 ahead: date reset to today, not counted; today before FLOOR (2026-11-01, a dead clock): untouched; unreadable stored date or count: `max(days, 0) + 1` counted. Never returns a smaller `days` than it was given. Export it next to `streakStep`; the UMD export list changes only by that name.
- Test criteria (new `cyc7-s-visit-days.test.js`, register in test-tiers): node table: gap of 1, 3, 40 days all give +1 and never reset; same day twice pays once; clock 1, 2, 5 days ahead; 1970 clock; garbage date; old save with `loginStreak 9` seeds `visitDays 9`; `days` never decreases over 5000 random sequences. Static: no "streak", "missed", "lost", "don't" in the new strings. Browser (offlineStub, `db.attempts() === 0`): stored `lastVisitDate` 5 days ago -> toast says "Welcome back" and the badge reads N+1; reload the same day -> no second payout; Backup round trip keeps the four fields. Existing `cyc3-gameday-streak` and the tests that read the old "Day N streak" text: update the text assertion only (named in the commit), not the logic.
- Economy: the bonus stays at most 5 stars per day (unchanged), so `cyc7-d-town-economy` (fixed daily income <= 5 min of gathering) is unaffected.

### ID-18 Town daily bounties (size M)
- What the player sees: a "Today's bounties" section inside the existing Dailies panel (J key / "Today" button; NOT a permanent HUD block, the Town HUD was just cleared in U-01). Three rows, one line each at 390 px: "Shake 5 trees  2/5  +20 stars", a Claim button when done (the player presses it; nothing is claimed automatically), "Claimed" text after. No timers, no "expires", no "only today", no streak. They are NOT counted in the "Today 2/3" chore progress and the 40-star all-chores bonus (`DAILY_BONUS`) is unchanged. Rewards: stars only (the Town's one free currency; no fame, no pet treats, nothing paid).
- Module `shared/mm-bounties.js`: `forDate(date, salt, pool)` takes an optional third argument (default = today's `POOL`, behaviour unchanged, existing test `shared-mm-events-bounties` stays green). New exported `TOWN_POOL`: `shake-tree` goal 5 event `town:shake`; `catch-bug` 3 `town:bug`; `wave` 2 `town:wave` (wave at neighbours); `fish` 2 `town:fish`; `dig-fossil` 1 `town:fossil`; `water-flower` 3 `town:water`. Reward shape for the Town pool `{ stars }`, seeded 10-30 in steps of 5 (mean 20, so 3 bounties = 60 stars/day). `claim` returns `{ state, reward }` with the pool's reward unchanged. Date key = `MMGameDay.utcKey()` (L-08), never a new `toISOString()` call.
- Save (additive, inside `pixeltown-save-v1`): `bounty = { d: 'YYYY-MM-DD', s: { <id>: [count, claimed 0|1] } }`. Cleaned on load: unknown ids dropped, counts clamped to the goal, a `d` that is not today means a fresh day (old progress is simply replaced; nothing is ever deducted). Written with `writeSave` BEFORE paying (same save-then-pay order as `refreshDailies`, so a reload cannot double pay). `shared/mm-backup.js` `TOWN_FIELDS` += `'bounty'`; `main.js:270` key list += `'bounty'`; `design/SAVE-KEYS.md` line for `pixeltown-save-v1`.
- Hooks in `game/main.js`: one `this.bountyEvent('town:<x>')` line after the item is granted, never on a cooldown refusal: tree shake (next to `shakeTreeVisual`, ~2970), `catchBug` (~4220, success branch), the neighbour wave/chat greeting path, fishing catch, fossil dig, flower water. `bountyEvent` reads `loadSave().bounty`, applies `MMBounties.progress`, writes, and re-renders the Dailies list only if it is open.
- Test criteria (new `cyc7-s-town-bounties.test.js`, node + browser, register in test-tiers): node: `forDate` with `TOWN_POOL` is deterministic per date+salt, 3 distinct ids, rewards in {10..30 step 5}, a different date gives a different set within 10 dates, `progress` never exceeds the goal, `claim` pays once and returns null the second time, clean drops junk, no pool text contains "streak", "expire", "hurry", "last chance". Browser (offlineStub, `db.attempts() === 0`): panel shows three rows; a real tree shake moves 0/5 to 1/5 (go through `interact()`); a cooldown refusal does not count; Claim pays exactly the row's stars once and survives reload; next UTC day (faked) replaces the rows; stale save with unknown ids loads without errors; Backup round trip keeps `bounty`; screenshot at 390x844 and 195x422 with no horizontal scroll and the Claim button >= 44 px. Economy gate: update `town-economy-sim.js` `fixed` with the +60 and `cyc7-d-town-economy` must still pass (fixed daily income stays <= 5 min of gathering: 69 + 60 = 129 stars = 3.9 min).
- Why these numbers: the Town yields about 33 stars/min (cycle 3 bot), so a 20-star row is a 40-60 s errand of the kind the player already does; the whole card is under 2 minutes of work, the same order as the 40-star chore bonus.

## Cycle 8 additions (D; all `proposed`; generic web queries only; aimed at retest-3 weak spots: new-player clarity and mobile)

| ID | Idea | Size | Risk | Status |
|---|---|---|---|---|
| ID-53 | Just-in-time hint after 20 s of nothing: a one-line, dismissible hint at the bottom of the Realm that names the one next verb (walk to a bag / press ability 1 / open the Menu), shown only if the player has not done a rewarding thing for 20 s, max 3 per session, never while a boss or an event is live | S | low | approved (U, cycle 9: conditions below); built cycle 10 S (branch cyc10-systems), D/U to verify in play |
| ID-54 | Drag-anywhere move option (device pref, off by default): the left half of the screen moves the hero from wherever the thumb lands (floating stick), so the stick never hides a bolt under a fixed circle; the stick graphic gets a faint ring and an opaque centre cap | M | medium | approved (U, cycle 9: conditions below) |
| ID-55 | First-session ending card: when the first-ever Realm session reaches 8-10 minutes (or the first dungeon clear), a small card says what was done (level, tames, shards) and offers ONE next goal (a named zone or the Isles); a Not now button; shown once | S | low | approved (U, cycle 9: conditions below) |
| ID-53 | Just-in-time hint after 20 s of nothing: a one-line, dismissible hint at the bottom of the Realm that names the one next verb (walk to a bag / press ability 1 / open the Menu), shown only if the player has not done a rewarding thing for 20 s, max 3 per session, never while a boss or an event is live | S | low | approved (L, cycle 9, with conditions below) |
| ID-54 | Drag-anywhere move option (device pref, off by default): the left half of the screen moves the hero from wherever the thumb lands (floating stick), so the stick never hides a bolt under a fixed circle; the stick graphic gets a faint ring and an opaque centre cap | M | medium | built (S, cycle 11: shared/mm-move-float.js in the Realm page and the Town Realm, Settings 'Move from anywhere' on touch only, key `mm-move-float` in Backup; test `cyc11-s-move-float`; approved by U, cycle 10 final review below) |
| ID-55 | First-session ending card: when the first-ever Realm session reaches 8-10 minutes (or the first dungeon clear), a small card says what was done (level, tames, shards) and offers ONE next goal (a named zone or the Isles); a Not now button; shown once | S | low | approved (L, cycle 9, with conditions below; U reviews the card) |
| ID-55 | First-session ending card: when the first-ever Realm session reaches 8-10 minutes (or the first dungeon clear), a small card says what was done (level, tames, shards) and offers ONE next goal (a named zone or the Isles); a Not now button; shown once | S | low | approved (U, cycle 9: conditions below); built cycle 10 S (branch cyc10-systems), D/U to verify in play |
| ID-53 | Just-in-time hint after 20 s of nothing: a one-line, dismissible hint at the bottom of the Realm that names the one next verb (walk to a bag / press ability 1 / open the Menu), shown only if the player has not done a rewarding thing for 20 s, max 3 per session, never while a boss or an event is live | S | low | approved (L, cycle 9, with conditions below); built cycle 10 S (branch cyc10-systems), D/U to verify in play |
| ID-54 | Drag-anywhere move option (device pref, off by default): the left half of the screen moves the hero from wherever the thumb lands (floating stick), so the stick never hides a bolt under a fixed circle; the stick graphic gets a faint ring and an opaque centre cap | M | medium | proposed |
| ID-55 | First-session ending card: when the first-ever Realm session reaches 8-10 minutes (or the first dungeon clear), a small card says what was done (level, tames, shards) and offers ONE next goal (a named zone or the Isles); a Not now button; shown once | S | low | approved (L, cycle 9, with conditions below; U reviews the card); built cycle 10 S (branch cyc10-systems), D/U to verify in play |

- ID-53: Apple, Roblox and Meta onboarding guidance all say to teach in short, timed pieces at the moment a mechanic matters, and to show a contextual hint after a short inactivity, not a long tutorial or many pop-ups ([Apple: Onboarding for Games](https://developer.apple.com/app-store/onboarding-for-games/), [Roblox: onboarding techniques](https://create.roblox.com/docs/production/game-design/onboarding-techniques), [Meta: onboarding best practices](https://developers.meta.com/horizon/blog/growth-insights-series-best-practices-user-onboarding-recall-progression/)). It is the post-coach version of ID-50: the coach ends at step 6, the hint pulse is for steps; this covers the player who has skipped the coach. [M8] the bot never has a reward gap over 38 s, but a human who stands still has no prompt.
- ID-54: floating sticks are the most recommended touch scheme and a clear stick (high contrast cap, see-through base) matters in shooters ([Game Developer: designing better controls for the touchscreen experience](https://www.gamedeveloper.com/game-platforms/designing-better-controls-for-the-touchscreen-experience), [Game Developer: virtual dual-stick controls usability](https://gamedeveloper.com/design/virtual-dual-stick-controls-usability)). Retest 3 reports bats under the joystick and the stick on a landscape phone hiding enemies. Needs U to review where the move zone may start (not over the ability grid).
- ID-55: a first session should end on an achievable goal so the player can stop at a natural point ([Unity: first-time user experience tips](https://unity.com/how-to/10-first-time-user-experience-tips-games)). The Realm has no end-of-session beat today; the bot reaches Lv 13-15 in 10 min, so the card names real numbers. No streak, no timer, no push.

## ID-51 follow-up spec: idle rest on the first inland zone (D, cycle 8; recommended, size S, S builds; BUILT by S in cycle 9 incl. the optional 5 s)
### L review, cycle 9 (feasibility)
- **ID-53 approved.** Feasible at size S: the arena already counts kills, pickups and level-ups, and has one notice line. Conditions: (1) one DOM line (not canvas text), 12 px floor, `aria-live="polite"`, placed where the Resting chip sits so it can never cover a stick or the ability grid at 195x422 (U checks the 8 a11y viewports); (2) never while resting (ID-51), in a dungeon, in the Trial of Six, with a boss or event live, or with a panel open; a resting hero already has the Resting chip, so the 20 s count starts again when the rest ends; (3) the "max 3" counter lives in memory only (no new save key); (4) no work per frame: the check runs on the existing once-a-second tick, and every new arena field is declared in the constructor (pool-shape rule, test `cyc9-lead-pool-shapes`); (5) a test with a real idle hero and a real input that dismisses it, db.attempts() === 0.
- **ID-55 approved**, size S to M (the card must pass the a11y sweep at 8 viewports). Conditions: (1) never opened in a fight: it waits for the first moment with no live enemy within 420 px and no boss or event, or for the dungeon-clear screen; the world does not pause, so the card must not cover the hero while enemies can reach it; (2) one additive flag under `realm` in `pixeltown-save-v1` (shown once), included in Backup; a failed save must not show it again in the same visit; (3) built with the existing result-card kit (`MMMiniKit.panel`), focus goes to Not now, Escape and Back close it; (4) session time is game-clock time, not wall time (a backgrounded tab must not trigger it); (5) numbers shown are the save's own (level, tames, shards), formatted with `MMMiniKit.fmt`.
- **ID-54** stays proposed: size M and needs U (touch layout), not reviewed this cycle.
- **ID-51 inland follow-up (S commit 014c9b7 on `cyc9-systems`): approved by code review** (not run by L). The change is the one line of the spec (`zone === 0` -> `zone <= 1`) plus `RM_IDLE_REST_S` 8 -> 5. Checked in the code: the rest still needs solo world mode, no dungeon, no Trial of Six, hero not down; auto-fire stays paused while resting (no idle farming); Highlands and Godlands unchanged. Two things to watch, neither blocks the merge: (a) 5 s of no input now also drops aggro in the Midlands for a player who simply lets go, so a "stand still to escape" habit is possible; the 5 s of standing under fire is the cost. If Midlands deaths per hour drop sharply in play data, go back to 8 s for zone 1 only. (b) `cyc7-idle-rest` check B ("not resting yet right after the start") now has a 5 s game-clock margin instead of 8; S added a wake-up input and compares restN as a delta, which removes the load-order cause seen in cycle 8, but the margin is smaller, so keep it on the flake watch list for one more stamp.

## ID-51 follow-up spec: idle rest on the first inland zone (D, cycle 8; recommended, size S, S builds)
Data (test `cyc8-design-inland-passive`, 6 seeds, landscape phone, Lv 1 hero, coach skipped, no input, put on the free Midlands tile nearest the spawn): today 6/6 fall, 6/6 within 30 s (10.0, 15.4, 18.6, 20.4, 22.9 s and one at 10.6). Zone 2 (Highlands): 3/3 fall within 10 s. With `restOk` also true in zone 1 (`REST_ZONES=1`, simulated in the test page only): 5/6 alive at 120 s (lowest HP 35 to 76 of 100), the 6th falls at 9 s because 8 s must pass before the rest starts.
The one-line change: `game/games/mad-maze/realm-world.js` line 3054, `Z.zoneInfoAt(world, p.x / TILE, p.y / TILE).zone === 0` -> `.zone <= 1`. Highlands and Godlands stay unrestricted on purpose (a hero there chose deadly ground). Test for S: extend `cyc8-design-inland-passive` (or copy its set-up) to assert 6/6 alive at 120 s on Midlands for seeds where the hero has taken less than 60 HP by 8 s, and keep `cyc6-lead-passive-landscape` green. Optional: also shorten `RM_IDLE_REST_S` 8 -> 5 s so the 6th seed lives.

## U review of ID-53..55 (cycle 9, UI/UX)
- **ID-53 just-in-time hint: approved (size S), with UI conditions.** (1) It must not stack with the ID-51 "Resting" chip: an idle hero rests after 8 s and the chip already says "move to play", so the hint is the next step after that, not a second cue for the same thing. It names a verb other than "move" (a bag, ability 1, the Menu), or it waits until the player has moved once. (2) Placement: one line above the move / fire sticks and the ability grid, centred. At 195x422 it may wrap to 2 lines and must stay 40 px or more clear of the stick (the cyc8-ui Daily rule). It must never sit on the goal / zone strip. (3) `role=status`, a ✕ of at least 44 px, Esc closes it, and no flashing or bounce under reduced motion / the flashes-off setting. (4) It never shows while a toast, the how-to card, a panel (bag, shop, Menu) or the Nexus is open. Test: an a11y-sweep-style overlap check at 195x422, 390x844, 844x390 and 1280x720, plus "max 3 per session".
- **ID-54 drag-anywhere move: approved (size M, opt-in device setting, default off), with UI conditions.** (1) The floating stick may start only in the free lower-left area: below the top HUD band (on a phone: under the zone / goal lines), left of the screen centre, and never on a control. `elementFromPoint` at the touch start must be the game canvas, so Daily, the gear, the ability grid, the mini-map and the Menu keep their taps. (2) The fixed stick stays the default and stays drawn as today when the option is off. (3) At 300 px wide or less (200% zoom) the option is ignored: the free area there is only about 80x100 px and the fixed stick is clearer. (4) Faint ring plus opaque centre cap: contrast of at least 3:1 against both sand and grass (the ART-HANDOFF palette). (5) It must show in Settings with a one-line explanation, and a screen reader must hear its state. Test: touch-start on each HUD control still activates the control, not the stick; a touch on bare ground starts the stick there.
- **ID-55 first-session ending card: approved (size S), with UI conditions.** (1) Reuse the result-card pattern of the arcade pages (title, three numbers, one goal line, two buttons: "Go: <goal>" and "Not now"). Focus goes to "Not now", Esc closes it, and focus returns to the canvas. (2) It is shown only when no enemy is within aggro range and no boss, event or dungeon fight is live; otherwise it waits for the next quiet moment. It never appears over the shop, the bag or the Menu. (3) It is shown once, with an additive save key inside `pixeltown-save-v1` (for example `realm.firstEndSeen: 1`), and the Backup must carry it. (4) It must fit 195x422 with no inner sideways scroll; buttons of at least 44 px; no mid-word breaks (cyc9-ui test helper `BROKEN_WORDS` can be reused).

## U cycle 10: ID-54 final review and build specs for S (ID-53, ID-55, ID-54)
The table had two rows for each of ID-53..55 (an L copy and a U copy, cycle 9); the second ID-54 row still said `proposed` because L wrote "stays proposed" before U's review landed. Cycle 10 U decision: **ID-54 approved, size M, build after ID-53 and ID-55.** The geometry below was measured in a real browser on the cycle-10 tip (Realm world, Shore, touch at <= 900 px; boxes are left,top,right,bottom in CSS px).

| Viewport | move stick | aim stick | ability grid | Next-goal (#rw-goal) | zone strip | gear / Daily |
|---|---|---|---|---|---|---|
| 195x422 | 8,318,96,406 | 99,318,187,406 | 95,216,187,308 | 8,221,85,300 | 10,198,84,217 | 91,150,135,194 / 8,150,60,194 |
| 390x844 | 20,720,120,820 | 270,720,370,820 | 250,562,370,682 | 8,129,294,148 | 10,108,292,125 | 336,212,380,256 / 320,264,380,308 |
| 844x390 | 20,276,120,376 | 724,276,824,376 | 578,256,698,376 | 120,78,406,97 | 675,178,834,267 | 400,336,444,380 / 10,174,70,218 |
| 1280x720 (no sticks) | - | - | 516,630,764,686 | 120,78,406,97 | 1120,206,1270,273 | 10,666,54,710 / 62,666,122,710 (help line 166,692,1114,710) |

**ID-53 just-in-time hint (S builds, size S). One element, one slot per layout:**
- DOM: `<div id="rw-jit" role="status" aria-live="polite" class="hidden"><span class="rw-jit-txt"></span><button type="button" class="rw-jit-x" aria-label="Dismiss hint">✕</button></div>` appended to `#realm-overlay` once (like `#rw-goal`); text via `textContent` only; written on the existing once-a-second goal tick, never per frame. Font: `var(--px-font)` 12 px floor, 700; panel `background: var(--px-ink, #0b0d1a)` at alpha 0.9, `box-shadow: 0 0 0 2px var(--px-10, #ffec27)` (the BP8 look, not a rounded system-ui bubble). ✕ is 44x44 px.
- Slot, phone portrait >= 261 px: one line centred, `left: 8px; right: 8px; bottom: calc(stickTop gap)`, i.e. its bottom edge 8 px above the sticks' top and its right edge left of the ability grid when the grid reaches that low (390x844: y <= 712, x 8..242 because the grid ends at y 682 but spans x 250..370; at 360x640 measure again in the test). Max 2 lines.
- Slot, <= 260 px portrait (195x422): there is no band above the sticks (grid ends at 308, sticks start at 318). The hint **takes the Next-goal slot** (8,221,85,300): `#rw-goal` is hidden while the hint shows and comes back when it goes. Text must be 3 words or fewer here ("Tap ability 1", "Open the bag", "Pick up the bag").
- Slot, landscape phone (844x390): centred between the sticks above the gear: x 128..570, bottom 8 px above the gear (y <= 328).
- Slot, desktop: centred above the ability grid, bottom 8 px above it (y <= 622), max-width 420 px.
- Never together with: the Resting chip (rest restarts the 20 s count), `#rw-event-hint`, a toast / banner, the coach, any panel (`#realm-backpack`, `#realm-shop`, `#realm-board`, `#realm-hero`, `#realm-pause`, `#mm-settings`), the Nexus, a dungeon, the Trial of Six, a live boss or event. Esc and the ✕ dismiss it (counts towards the 3), any play input hides it without counting.
- Verbs, in order: a bag on the ground within 12 tiles -> "Pick up the bag" (an arrow ➤ toward it, aria-hidden); an ability off cooldown never used this visit -> "Tap ability 1" (desktop: "Press 1"); otherwise "Open the bag" / "Open the Menu". Never "Move" (the Resting chip already says that).
- Reduced motion / flashes off: no slide, no pulse (one 150 ms fade at most otherwise).
- Test (S): real idle hero, wait 20 s game time, hint shown in its slot at 195x422, 390x844, 844x390, 1280x720 with no overlap with any button, stick, the grid, `#rw-goal` (except at <= 260 where the goal is hidden) or the zone strip; a real tap on the ✕ hides it; a 4th occurrence never shows; db.attempts() === 0. Add `#rw-jit` to the a11y sweep page state if the sweep can reach it.

**ID-55 first-session ending card (S builds, size S):**
- Build with `MMMiniKit.panel` (result-card kit) inside `#realm-overlay`, id `rm-first-end`, `role="dialog"`, `aria-modal="true"`, `aria-labelledby` its title. BP8 look: `var(--px-font)`, square corners, the backpack's 4 px ink + 2 px grey frame (realm-ui.css `#realm-backpack .realm-bp-card`), title in `--px-10` yellow uppercase.
- Content, top to bottom: title "Good first run!"; three stat tiles in one row (Level, Tames, Shards; numbers through `MMMiniKit.fmt`, labels 12 px, numbers 18 px; at <= 260 px the tiles stack to one column); one goal line ("Next: the Midlands (Lv 5)" or "Next: visit the Isles"); two buttons, full width, 48 px tall, stacked on phones: primary "Go: <goal>" (`--px-11` green), secondary "Not now" (`--px-5` grey). Focus starts on "Not now"; Esc / Back = Not now; focus returns to `#realm-canvas-wrap`.
- Size: `width: min(340px, 100% - 24px)`, no inner sideways scroll, fits 195x422 without vertical scroll (budget: title 24 + tiles 3x52 stacked + goal 32 + buttons 2x48 + gaps = ~330 px of the 398 px available).
- Never over a panel; never in a fight (no live enemy within 420 px, no boss / event / dungeon); the world keeps running, so the card is placed in the upper half on phones (top: 12% of the screen), never over the hero's centre.
- Save: `realm.firstEndSeen: 1` (additive), included in Backup; a failed save must not reshow it in the same visit (in-memory flag first).
- Test (S): reach the trigger with a seeded save + game clock, card appears only when quiet, focus on Not now, Esc closes, no mid-word breaks (cyc9-ui `BROKEN_WORDS`), fits 195x422 / 390x844 / 844x390 / 1280x720 with every button >= 44 px, the flag is saved and the card never shows again after a reload, db.attempts() === 0.

**ID-54 drag-anywhere move (approved, size M; S builds after ID-53 / ID-55). The cycle-9 U conditions stand; concrete spec:**
- Setting: in `shared/mm-settings.js`, the Controls group next to Assist: a toggle "Move from anywhere: the left stick starts where your thumb lands" (`role="switch"`, `aria-checked`), device pref key `mm-move-float` = '1' (localStorage only, not in the save, like `mm-aim-assist`). Shown only on touch devices.
- Both stick bindings exist: `games/mad-maze/mad-maze.js` (stick() helper, line ~95) and `main.js` ~4042 (the Town's Realm). Build the float logic once (a small shared helper) and use it in both, or the Town Realm keeps the fixed stick and says so in Settings.
- Start zone: a `pointerdown` on `#realm-canvas-wrap` (the play field) only, `elementFromPoint` must be the canvas, `x < innerWidth / 2`, `y >` the bottom of the lowest top-HUD item (195x422: 300, below #rw-goal; 390x844: 148; 844x390: 97, and left of the ability grid). Off at `innerWidth <= 300` (the cycle-9 rule). The fixed stick element moves to the touch point (CSS `left/top`, no re-layout of anything else) and returns to its home spot on release.
- Look: ring `rgba(255,241,232,0.35)` 2 px + opaque centre cap (`--px-7` #fff1e8 with a 2 px `--px-ink` outline); the cap must hit 3:1 against the Shore sand and grass tiles (measure in the test from screenshot pixels).
- Test: with the pref on, touch-start on each HUD control (gear, Daily, abilities, mini-map, bag, board, Menu, Leave) activates that control and leaves `moveVec` at 0; a touch on bare ground left of centre starts the stick there and moves the hero; with the pref off the fixed stick behaves exactly as today; at 195x422 the pref is ignored; db.attempts() === 0.

## S queue for cycle 9 (D, cycle 8)
Approved and size S: ID-09 (forgiving Town day count, spec above). ID-51 inland follow-up (spec above, one line + test). ID-18 is approved but size M. Proposed S ideas waiting for an L/U review: ID-53, ID-55.

## Cycle 9 additions (D; all `proposed`; generic web queries only)

| ID | Idea | Size | Risk | Status |
|---|---|---|---|---|
| ID-56 | Shop "saving for" pin: tapping a star on a shop row pins ONE item; the Realm info line and the shop header show "Saving for Common Spark Wand: 6 more shards" (about N Shore kills). No timer, no push, unpin any time, device pref only | S | low | built (S cycle 12, `cyc12-s-shop-pin`; see design/beta/cycle12-systems.md) |
| ID-57 | Bullet shape option (device pref, off by default): enemy bolts differ by SHAPE as well as colour (aimed = diamond, ring = round, spiral = small triangle), so colour alone is never the only cue | M | medium | proposed |
| ID-58 | "Neighbors are asleep" hint on the Town wave bounty: the row reads "Say hi to 2 neighbors (they are asleep until 6 am)" between 23:00 and 06:00 local, so a hello that cannot count is explained, not silent | S | low | proposed |

- ID-56: UX guidance says a refused or unavailable buy must say why and how far away it is ([Baymard: button design, disabled state with a reason](https://baymard.com/learn/button-design), [Smashing: usability pitfalls of disabled buttons](https://shop.smashingmagazine.com/2021/08/frustrating-design-patterns-disabled-buttons/)). Cycle 6 added the "need N more" line; this adds a soft, player-chosen goal, in the cozy-design style of low-pressure goals ([Motivation Through Coziness](https://mediacommons.org/imr/content/motivation-through-coziness)). [M9] the cheapest offer is 24 shards = about 34 Shore kills = about 1.2-2 min of play (bot 17-29 kills per min), so the goal is always near.
- ID-57: shmup developers add shape-based colour modes for bolt readability, and players who need them often never find a colour setting ([RGBullet Hell: Color Mode devlog](https://jzucc12.itch.io/rgbullet-hell/devlog/356735/color-mode), [PC Gamer: shmup that prioritizes accessibility](https://pcgamer.com/risk-system-is-a-shmup-that-prioritizes-accessibility-while-still-being-a-challenge)). Needs G to draw the three shapes and U to put the toggle in Settings next to Assist.
- ID-58: [M9] at 02:00 local a real hello leaves the wave counter at 0 (villagers sleep 23:00-05:59); nothing is lost but nothing says why. Low-pressure design wants the reason shown, never a nag ([Medium: Designing for Coziness](https://medium.com/kitfox-games/designing-for-coziness-d33d2519a59e)).


## Cycle 10 (D): review of ID-56..58 and new ideas ID-59..61
Review of the cycle 9 proposals (D, for L/U to confirm):
- **ID-58 (sleeping-neighbours hint) is the best next S build**: pure text, one condition (local hour 23:00-05:59), fixes a real silent failure (the hello that does not count). Priority 1.
- **ID-56 (saving-for pin)** stays S but needs U (a star on every shop row, the info line and the shop header at 195 px) and a device-pref key; priority 2.
- **ID-57 (bullet shape option)** is M to L in practice: needs G to draw 3 shapes, a hit-radius-neutral render path and a Settings toggle; keep proposed, priority 3 (ID-35 colour roles and the cycle 6 bolt core already cover the common case).

## Cycle 10 additions (D; all `proposed`; generic web queries only; first-session retention and the Town animals)

| ID | Idea | Size | Risk | Status |
|---|---|---|---|---|
| ID-59 | First-visit animal hello: the first time a new profile walks within about 160 px of a Town animal, it turns toward the hero and shows a small heart; one line in the existing hint chip names it ("Mocha the deer likes you"). No reward, no timer, once per animal per profile (in memory plus one additive Town-save bitmask) | S | low | approved with conditions (U cycle 11, spec below) |
| ID-60 | Animal sightings page in the notebook: each Town animal met (first time within 160 px) adds a line (name, where it was seen, time of day), unmet ones show "?"; no completion reward, no counter pressure | S to M | low | rejected (U cycle 11: duplicates the Museum Wild Fauna wing; see below) |
| ID-61 | Welcome-back line: when a returning profile opens the Town after 1 or more days away, one dismissible line says where the hero stopped ("Welcome back. You were in the Midlands at Lv 6; the goal was ...") and nothing else: no list of missed days, no gift, no streak | S | low | built (S cycle 12, `cyc12-s-welcome-back`; see design/beta/cycle12-systems.md) |

- ID-59: reviewers of cozy games repeatedly say villagers and animals with visible personality, not systems, are what make the first hours feel warm ([Gfinity: heart over stats](https://www.gfinityesports.com/article/heart-over-stats-what-truly-makes-cozy-games-feel-like-home), [PC Gamer: Dragon Shelter first season](https://www.pcgamer.com/games/life-sim/14-days-in-dragon-shelter-a-play-by-play-of-my-first-season-in-the-stardew-style-farm-sim-where-dragons-help-bake-pies/)), and one player says collecting animals right away is what hooked them ([Starsand Island, 25 hours](https://www.inkl.com/news/i-ve-played-starsand-island-for-25-hours-and-this-is-the-most-invested-i-ve-been-in-a-cozy-game-for-years)). The Town animals (deer, fox, owl, robin, squirrel are now Codex art) are free of cost to react. It also gives the first-ten-minutes goal a creature to meet before the Realm. Check with G that the reaction needs no new art (turn + existing heart icon).
- ID-60: a quiet collection that has no reward avoids obligation; pairs with ID-04 (notebook exists, key `pixeltown-notebook-v1`, additive page). [M10] no measured data; effort depends on how the notebook lists pages.
- ID-61: practitioner write-ups say the first seconds back should make the player glad to return, and that lists of what was missed read as chores ([Game Developer: catch-up systems](https://gamedeveloper.com/design/catch-up-systems-and-what-the-heck-are-those-), [Bugnet: onboarding for returning players](https://bugnet.io/blog/how-to-design-a-games-onboarding-for-returning-players), [MCV: should games welcome back lapsed players](https://mcvuk.com/development-news/opinion-shouldnt-games-adapt-to-busy-life/)). Fits the no-guilt rules (ID-09 counts days, never resets). The save already holds level and zone; no new key beyond a device-pref "seen today" in memory.

## Cycle 11 additions (D; all `proposed`; generic web queries only; Town animals and the first Realm hour)

| ID | Idea | Size | Risk | Status |
|---|---|---|---|---|
| ID-62 | Animal treat bubble (Town): an animal that has liked the hero (ID-59) sometimes shows a small food icon when the hero is near; handing over a carried flower or berry gives a heart and a second line. No hunger, no penalty if ignored | S | low | built (S cycle 14, branch cyc14-systems; test cyc14-s-systems [62]; code-drawn bubble placeholder for G; berry = the Town's fruit) |
| ID-63 | Isles tame callback in Town: after the first Isles tame the nearest Town animals turn to the new companion and one line mentions it | S | low | built, reduced (S cycle 14: one line, additive Town key islesTameSeen; test cyc14-s-systems [63]) |
| ID-64 | First-build choice at the first Lv 5 level-up: a card offers 2 plainly worded options for ability 1; additive save key; needs an economy check and U for the card | M | medium | card approved by U (cycle 13, spec in design/beta/cycle13-ui.md); build waits for the economy check (D/L) |

- Sources and ranking of ID-56..61: `design/beta/cycle11-design.md`. D ranking by impact: ID-58, ID-59, ID-61, ID-56, ID-60, ID-57.
- ID-55 tuned in cycle 11 (D): first session = Lv <= 5 at first world load; a card closed by danger within 6 s retries (max 2).

## U cycle 11: UI feasibility review of ID-56, ID-59, ID-60, ID-61 (with build specs for S)
All numbers below were measured on the cycle-10 tip (bd92da2) in a real browser. General rules for all three approved ideas: text >= 12 px, every tap target >= 44 x 44 px, nothing over the sticks / A-C buttons / bag bar, no animation that cannot be switched off (reduced motion and flashes-off both mean static), no sound, no new key in `pixeltown-save-v1` unless stated, 0 database traffic in tests, and the a11y sweep at 195x422 stays at 0 offenders.

### ID-56 shop "saving for" pin: APPROVED (size S)
What was measured at 195x422: a Realm shop row is 126 px tall (name line, rarity, stat, then a full-width Buy of 127 px at the bottom); Buy has a 92 px minimum width (cycle 10, the pixel font), so a 44 px star cannot share the Buy line. The HUD info box `#realm-info` is 75 px wide, `nowrap`, 12 px ("Lv 1 · Safe-ish · 💎 0"): no sentence fits there. At 390x844 the row is 63 px tall (name, rarity, stat and Buy on one line) and `#realm-info` is 318 px wide.
Spec:
1. **Pin control:** one `<button class="rm-pin" aria-pressed="false|true">` per offer row, 44 x 44, glyph ☆ / ★ (pixel font), `aria-label="Save for <rarity> <name>"` / `"Stop saving for <rarity> <name>"`.
   - >= 301 px: it sits just left of Buy, on the Buy line.
   - <= 300 px: it sits at the right end of the NAME line (the name gets `padding-right: 48px` so it never runs under it); the Buy line stays full width.
   - Only one item can be pinned: pressing another star moves the pin; pressing the lit star clears it.
   - Focus ring: the yellow 3 px ring used by the shop's ✖ (cycle 10).
2. **Shop header:** the sticky wallet line under the ✖ (`.rm-shop-top`) gains a second line while a pin exists: "★ Saving for Spark Wand: 6 more 💎" (or "★ Spark Wand: ready to buy"), 12 px, wraps at word boundaries, never breaks a word. The pinned row also gets a 2 px yellow left border so it can be found when scrolling.
3. **HUD:**
   - >= 301 px: `#realm-info` appends " · ★ 6 💎 to go" (or " · ★ ready"). It must stay on one line; if it does not fit (measure with `scrollWidth`), drop the " to go".
   - <= 300 px: no HUD text change (no room, measured). The shard count only turns yellow while a pin is set, and `#realm-info` gets `aria-label` "... 18 of 24 shards saved for Spark Wand".
4. **State:** device pref `mm-shop-pin` = `{"v":1,"id":"<offer id>"}` in localStorage (not in `pixeltown-save-v1`; try/catch, missing = no pin).
   - The pin clears silently when that item is bought or is no longer in stock.
   - No toast, no sound and no timer when the goal is reached: the text just reads "ready".
5. **Tests (S):**
   - At 195x422, 390x844 and 1280x720: star size, placement rules, one pin at a time, header and HUD text, clearing on buy.
   - No sideways scroll, no word broken, 0 DB attempts.
   - `cyc10-ui` and `cyc9-ui` (Buy column, ✖ on top) still pass.

### ID-59 first-visit animal hello: APPROVED WITH CONDITIONS (size S)
1. **Names:** the wild Town animals (deer, fox, owl, robin, squirrel, bugs: `FF_ASSETS` fauna) have species names only. "Mocha" is a villager, not an animal, so the line uses the species: "A red fox noticed you 💛". Villagers are out of scope.
2. **Heart:** drawn in code (a 7 x 6 px pixel heart, G owns the look), above the animal, for 1.2 s. With reduced motion or flashes-off it appears and disappears with no bounce or fade.
   - "Turns toward the hero" only for species that have side frames (strips with `idle_right` / `idle_down`). Others just show the heart.
3. **Text:**
   - The Town has no generic hint chip. Use the existing `#achievement-toast` (aria-live polite) ONLY if it is free (not showing an achievement and the What's-new banner is down); otherwise skip the line (the heart still shows).
   - Max one line per 30 s. Never while a dialog, shop, Museum, map or the bag is open.
4. **Save:** one additive Town-save integer bitmask `animalHello` (one bit per `FF_ASSETS` fauna index; additive, unknown bits kept, never lowered). Backup carries it with the whole save.
   - D and S must add it to SAVE-KEYS.md and test that an old save without it loads byte-identical.
5. **Tests:** heart and line at 1280x720 and 195x422 (the toast inside the screen, not on A/C or the bag bar); once per animal across a reload; reduced motion = static; 0 DB attempts (ADMIN bot, offline).

### ID-60 animal sightings page in the notebook: REJECTED
Reasons (measured):
- The Town page does not load `shared/mm-notebook.js`. Only the Realm (Mad Maze) and the Isles do. A Town page in the Realm notebook means writing the key from a page that never loaded it, or a second list.
- The Museum's **Wild Fauna** wing already lists exactly these Town animals: a silhouette and "???" for unmet ones, the caught pose once caught (`main.js` renderIdSection over `FF_ASSETS` fauna). Two lists of the same animals in two places split one collection and confuse "met" with "caught".

Counter-proposal for D (re-propose as a new ID if wanted, only after ID-59 ships): a third state on the Museum Wild Fauna card, "Seen" (silhouette in colour plus "Seen near the pond, evening"), fed by ID-59's `animalHello` bit. This needs no new page and no notebook coupling.

### ID-61 welcome-back line: APPROVED (size S)
1. **When:** on Town load, only if `lastVisitDate` exists and is 1 or more UTC days before today. Read it BEFORE the ID-09 day counter rewrites it on this load: S must order this explicitly and test it.
   - Never on a first-ever visit.
   - Once per load. A reload the same day does not show it again, because `lastVisitDate` is then today. No new key.
2. **Text:** one line, no counts of missed days, no gift, no streak.
   - "Welcome back! Your hero is Lv 6 in the Realm." Use the realm level from `pixeltown-save-v1.realm.level`; if missing, use "Welcome back to Pixeltown!".
   - Add the zone name ("…, last seen in the Midlands") only if the Realm already saves a position the Town can read without loading Realm code. Otherwise leave it out: no guessing.
3. **Element:** `#town-welcome`, `role=status`, `aria-live=polite`.
   - Look: the What's-new banner's look, 13 px (12 px floor), max-width min(92vw, 420px), centred under the top HUD row.
   - A 44 x 44 ✕ with `aria-label="Dismiss"`. Esc closes it (captured, so the Esc menu does not open).
   - Auto-hide after 10 s, or 3 s after the hero first moves, whichever comes first.
   - If the What's-new banner is up, wait until it closes.
   - At 195x422 it may wrap to 2 lines, and it must not cover A/C, the Menu button, the bag bar or the joystick.
4. **Tests:**
   - A seeded save with `lastVisitDate` 2 days ago shows the line once at 1280x720, 390x844 and 195x422 (inside the screen, no overlap with the controls above, ✕ >= 44).
   - The same day shows nothing, a save without `lastVisitDate` shows nothing, and Esc does not open the menu.
   - The ID-09 visit count still increments exactly once. 0 DB attempts (offline ADMIN bot).

## Cycle 12 additions (D; all `proposed`; grounded in the cycle 11 first-ten bot numbers and the cycle 12 Town shop audit; no web retention data was available, so the grounding is measured bot data, not player data)

| ID | Idea | Size | Risk | Status |
|---|---|---|---|---|
| ID-65 | Persistent "Not saved" chip: while browser storage refuses writes (`SAVE_OK` false in Town, the same flag in Realm), a small chip stays on the HUD ("Not saved: storage full") until a write lands. Today the warning is a 3.5 s toast at the moment of a buy, so a player who keeps playing for ten minutes on a full or blocked store loses all of it and was told once | S | low | built (S cycle 14: Town #save-warn + Realm #realm-save-warn; test cyc14-s-systems [65T]/[65R]) |
| ID-66 | First workbench step in the first-visit goal chain: after "chop wood" the goal card names "craft a Plank Stack at the workbench", then "place it at your home". Pure text on the existing goal card, no reward beyond what the goods sell for; ties the Town shops (workbench, home plots) into the first session | S | low | built (S cycle 14: steps on the Realm Gate goal card after the gate step; no key; test cyc14-s-systems [66]) |
| ID-67 | Lv 5-8 pace smoothing in the first session: the bot measured Lv 5 at 64-99 s but Lv 8 at 140-246 s (a 106 s spread for the same three levels); a small additive XP bonus for a profile below Lv 8 (for example x1.2, shown as "Rookie bonus" on the level bar) narrows the slow seeds. Needs an economy sim and a test that late-game XP is unchanged | M | medium | rejected (L cycle 13: bot timings only, no human playtest; an XP multiplier changes the shared level curve and the daily / board comparisons. Reopen with human data) |
| ID-65 | Persistent "Not saved" chip: while browser storage refuses writes (`SAVE_OK` false in Town, the same flag in Realm), a small chip stays on the HUD ("Not saved: storage full") until a write lands. Today the warning is a 3.5 s toast at the moment of a buy, so a player who keeps playing for ten minutes on a full or blocked store loses all of it and was told once | S | low | approved (U cycle 13, spec in design/beta/cycle13-ui.md) |
| ID-66 | First workbench step in the first-visit goal chain: after "chop wood" the goal card names "craft a Plank Stack at the workbench", then "place it at your home". Pure text on the existing goal card, no reward beyond what the goods sell for; ties the Town shops (workbench, home plots) into the first session | S | low | approved (U cycle 13, spec in design/beta/cycle13-ui.md) |
| ID-67 | Lv 5-8 pace smoothing in the first session: the bot measured Lv 5 at 64-99 s but Lv 8 at 140-246 s (a 106 s spread for the same three levels); a small additive XP bonus for a profile below Lv 8 (for example x1.2, shown as "Rookie bonus" on the level bar) narrows the slow seeds. Needs an economy sim and a test that late-game XP is unchanged | M | medium | rejected for now (U cycle 13: bot data only, no human playtest; and a "Rookie bonus" label has no room in the 195 px Realm HUD; re-propose with human data) |

- ID-65: found in the cycle 12 Town shop audit (`design/beta/cycle12-design.md`): every Town shop now says "not saved yet" at the moment of a buy, but nothing says it afterwards. The flag already exists (`SAVE_OK`); U decides placement at 195x422.
- ID-66: the cycle 12 audit shows no test or quest points a new player at the workbench or the home plots; whether new players find them is unmeasured (no telemetry). Cheapest possible nudge first; measure by a bot that follows the goal card.
- ID-67: data in `design/beta/cycle11-design.md` item 1 (Lv 2 at 11-15 s, Lv 5 at 64-99 s, Lv 8 at 140-246 s, Lv 11 at 318-382 s). A bot is not a human; the idea is only worth building if a human playtest shows the same long Lv 6-8 stretch.
- **L review of ID-65..67 (cycle 13):**
  - ID-65 APPROVED (S). Conditions: one chip per page driven by the existing flag (`SAVE_OK` in main.js; the Realm's own refused-write flag), `role="status"`, text not colour alone, removed on the first write that lands; no new key in `pixeltown-save-v1` and nothing sent to Firebase; U picks the spot and it must pass the a11y sweep overlap check at 195x422 and 160x284 (in the Realm at <= 190 px the HUD is the cycle 13 More-tray grid, so the chip goes in the left text column or inside the tray). Test: a quota stub (as in `cyc11-lead-town-stars`) shows the chip, a landed write removes it.
  - ID-66 APPROVED (S). Conditions: text only on the existing goal card; each step is derived from data already in the save (crafted goods, home plot items), no new save key; a returning player who already crafted or placed something skips the step; the chain never blocks the goals that exist today. Test: a bot follows the card from a fresh profile to a placed item.
  - ID-67 REJECTED for now. The evidence is bot timing on a few seeds and D's own note says it is only worth building if a human playtest shows the same Lv 6-8 stretch; there is no such playtest. A profile-level XP multiplier also changes the one level curve that dailies, the kill board and co-op partners share. Reopen with human session data and an economy sim.
- Review of ID-62..64 build status (D, cycle 12): none built, none reviewed. U and L reviewed ID-56, 59, 60, 61 in cycle 11 and did not reach ID-62..64. ID-62 depends on ID-59, which is approved but not built (S order ID-61, ID-56, ID-59), so ID-62 and ID-63 cannot start before ID-59. ID-64 needs an economy check and a U card and is the largest; it stays last.

## Cycle 13 additions (D; all `proposed`; grounded in `design/ftue-metrics.json` as measured by the first-ten bots; bot data, not player data, and no web retention data was gathered)

| ID | Idea | Owner | Size | Status |
|---|---|---|---|---|
| ID-68 | First-level floor on the Shore: if the hero has not levelled by 15 s of play, the next kill grants just enough XP to level once (once per profile, in memory plus the existing first-kill bitmask style key, no new key if the `zk` mask can carry it). Level 2 is the first "I am getting stronger" beat and it should not depend on the seed | S | low | approved with conditions (U cycle 14, below) |
| ID-69 | Isles tame-then-fight bridge: after the first tame on an isle, one line in the existing hint chip names the nearest hostile ("Fernraptor is guarding the clearing") so the first hit lands sooner. Pure text on the existing hint, nothing new on screen | S | low | approved with conditions (U cycle 14, below) |
| ID-70 | Isles low-HP breather: the first time a hero drops under 20% HP on an isle in a visit, hostiles within 120 px lose aggro for 2 s and one DOM line says "Catch your breath"; once per visit, never in the boss room | S | medium | UI approved, reduced (U cycle 14: the line goes in the existing hint, no new DOM line); build waits for L's leash check |

- ID-68: in the six Shore first-ten runs the first level-up came at 6.8, 10.0, 10.5, 14.3, 18.6 and 29.7 s (a 4.4x spread; seed `world-shore-e` also had the longest reward gap, 36.2 s, against 15-22 s for the others). The other first rewards (kill 2.7-3.5 s, XP 0.3-0.6 s, pickup) are all under 4 s, so level-up is the one early beat that varies. A floor only touches the first level, so it cannot change late XP; test: seed e now levels by 15 s, and level 5+ XP is byte-identical.
- ID-69: the Isles bots tame within 38-110 s (median about 50 s) but first hit comes at 55-141 s on most isles and 338.5 s on `isles2-reef-b`, with the first drop at 188.8 s on `isles2-jungle-a`. The gap between the first tame and the first drop is the longest unexplained stretch of the Isles first ten; the bot hint sampling shows 100% action coverage, so the hint chip is the right place for it. Needs a check that the line does not repeat (once per isle per profile).
- ID-70: the Isles bots' lowest HP was 2 to 7 on jungle-b, tundra-a/b, mars-b and 0 (a death) on `isles2-reef-a`, so a no-input-skill bot gets to a few HP regularly, and one visit ended in a death in the first ten minutes. A short breather is the Isles counterpart of the Shore rest (ID-51) and does not heal, so it cannot be farmed; it needs L to check it against the wanderer leash and S to place the line away from the Isles action column at 160x284.
- Review of ID-62..64 build readiness (D, cycle 13): see `design/beta/cycle13-design.md` item 3.
- **U review of ID-68..70 (cycle 14).** General rules as in cycles 11/13 (12 px text floor, no new element over the stick / pad / A-C /
  bag bar / Menu, static under reduced motion, no sound, 0 DB attempts, additive keys only, a11y sweep 0 offenders at 195x422 and 160x284).
  - **ID-68 APPROVED with conditions (S).** No new UI: the existing level-up toast and XP bar carry it. No new save key: a hero at Lv 1 is
    the only one it can apply to, so the hero's own `level` already records "used" (once per hero, which is the same thing for a first
    hero). The floor grants XP through the normal kill path (the same toast, the same XP text; the bar must not jump past the level). An
    off switch `?lvfloor=0` for tests that pin early XP numbers; L lists which pinned tests move before the merge (first-ten bots,
    ftue-*). Test: the slow seed `world-shore-e` levels by the first kill after 15 s; Lv 2+ XP totals are byte-identical with and without.
  - **ID-69 APPROVED with conditions (S).** Text only, through the Isles hint's own path (`fitHint`), so at < 300 px it gets the cycle 13
    show-then-tuck (6 s, then tucked) and `role=status` announces it. At most 40 characters ("Fernraptor guards the clearing" style; the
    cycle 13 hint at 160 px fits about 2 lines of ~21 characters at 12 px); if a hostile name makes it longer, drop the place ("A Fernraptor
    is near"). Once per isle per visit in memory; if "once per profile" is wanted it is one additive Isles-save key listed in SAVE-KEYS.md.
    It never replaces a boss / air / danger hint that is up (those win). Test: after a seeded first tame the line shows once, at 160x284
    and 195x422 it is fully on screen, above the HUD and on no button (the cyc13-ui hint checks), and a second tame does not repeat it.
  - **ID-70 UI APPROVED, reduced; build waits for L (S after L).** No new DOM line: cycle 13 measured no free strip on the Isles HUD at
    160x284 / 195x422, so "Catch your breath" goes through the same hint path as ID-69 (shown, then tucked at < 300 px). No red flash,
    no shake, no countdown; under reduced motion nothing animates. L checks the 2 s aggro drop against the wanderer leash (hostiles must
    not walk off and reset) before S builds. Test: seeded HP drop under 20% shows the line once per visit, never in the boss room, and
    hostiles within 120 px deal no damage for 2 s, then fight again.
- Housekeeping (U cycle 14): ID-65 has two rows in the cycle 12 table (one L-approved, one U-approved); both say approved, same idea.
