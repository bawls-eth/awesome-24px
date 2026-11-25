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
| ID-09 | Forgiving Town day count (replaces the Day N streak; never resets) | S | low | approved (coordinator, standing owner decision 2026-11-25; spec: "ID-09 / ID-18 implementation specs (D, cycle 7)" below; supersedes the earlier chore-card-only wording, the chore card already exists as the Dailies panel) |
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
| ID-15 | Isles Oakback orchard route (food sink fix) | S | low | proposed |
| ID-16 | Isles creature "likes" journal hint | S | low | proposed |
| ID-17 | Isles tame verbs per species | M | low | proposed |
| ID-18 | Town daily bounties through mm-bounties (Town pool, stars only) | M | low | approved (coordinator, standing owner decision 2026-11-25; spec below; replaces the needs-change note, builds on `beta/cycle2-lead.md` section 1) |
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
| ID-36 | Trial of Six ramp: fights 1-3 stay, fights 4-6 add one pattern layer each, and a carried-HP readout | M | medium | built, tuning NOT signed off (S, cycles 5-6): layers A/B/C in `mm-endgame.js` + `realm-world.js`; cycle 6 values lead 1.2 s / 0.5 s ahead, arm 0.7 s / 95 px/s; bot targets only partly met (see `beta/cycle6-systems.md`); the carried-HP readout is NOT built |
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
| ID-51 | Idle hero rest: a hero with no input for 8 s on the Shore stops being provoked (no quiet-pity nudge) and enemies lose aggro after a short leash; any input resumes normal rules | S | low | proposed |
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
