# IDEAS (Gameplay Designer, cycle 0)

Flow: D proposes (`proposed`) -> L or U marks `approved` / `rejected` with a reason -> S implements -> D/U verify in play.
Hard limits for every idea: no pay-to-win, no paid randomness or loot boxes, no fake urgency (no countdown outside a round, no expiring rewards, no streaks across days), additive saves only, original art only, Firebase never written by tests.
Effort S under half a day, M about a day, L several days. Evidence tags: [M] measured in cycle 0 play (see `beta/cycle0-design.md`), [R] from generic design research (sources at the end).

| id | title | effort | risk | status |
|---|---|---|---|---|
| ID-01 | Lantern-light Shore ramp | S | low | proposed |
| ID-02 | Zone-border danger meter | S | low | approved (coordinator, cycle 1; L/U may revoke with a reason) |
| ID-03 | Quest rewards that scale with zone | S | low | approved (coordinator, cycle 1; L/U may revoke with a reason) |
| ID-04 | Hero notebook (knowledge meta-progression) | M | low | proposed |
| ID-05 | Bullet-readability presets | M | medium | proposed |
| ID-06 | Assist sliders (damage taken, speed, aim help) | M | medium | proposed |
| ID-07 | Tame bond hearts (Isles) | M | low | proposed |
| ID-08 | Dungeon first-clear milestones | S | low | proposed |
| ID-09 | Cozy daily chore card (no streak) | S | low | proposed |
| ID-10 | Shared result card across arcade games | M | medium | proposed |
| ID-11 | Realm retreat flag (safe walk-back) | M | medium | proposed |
| ID-12 | Town-to-Realm errand chain | M | low | proposed |
| ID-13 | Mid-game "second wind" zone gates (Lv 8-12 plateau) | S | low | proposed |
| ID-14 | Hit-pause and telegraph timing audit | S | low | proposed |

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
- Test: node chain state; browser dialogue advances with seeded saves.
- Effort M. Risk: low (cross-save reads must stay read-only).

## ID-13 Mid-game "second wind" zone gates (Lv 8-12 plateau)
- Player-facing: the first boss kill in each zone gives a guaranteed pink bag, so hitting the Lv 8-12 band always yields a visible upgrade.
- Why: [M] XP per kill doubles each zone while need grows linearly (30 + 20 per level), so levels 15-20 come in about 100 Godlands kills; the real wall is survival at Lv 8-12 where gear is the answer.
- Files: `shared/mm-zones.js` (BOSS_BAG_WEIGHTS floor), `realm-world.js` boss drop.
- Test: node: boss bag weights never roll brown below zone 1 first clear (pity counter).
- Effort S. Risk: low.

## ID-14 Hit-pause and telegraph timing audit
- Player-facing: no new feature; every boss pattern gets a 0.4-0.6 s ground telegraph before its first volley, and big hits give a 50 ms hit pause.
- Why: [R] heavy feel from hit pause, fairness from readable tells; b01 lists unfair spikes.
- Files: `shared/mm-telegraph.js`, `realm.js` boss attack table.
- Test: node: every boss pattern has telegraph >= 0.4 s; telegraph existing tests extended.
- Effort S. Risk: low.

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
