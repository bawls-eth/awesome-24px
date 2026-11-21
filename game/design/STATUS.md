# Mad Maze / Pixeltown hub: build status

Milestones are from `WORLD-MAP-DESIGN.md` / `ROADMAP-10-DAY.md`. DONE = playable and tested,
PARTIAL = some of it plays, the rest is modules only or missing, TODO = nothing playable yet.

| M | Milestone | State | Where / what is missing |
|---|---|---|---|
| M1 | Combat core, standalone page | DONE | `realm.js`, `games/mad-maze/`: walls, guard, hit dot, cross-tab merge, pad, aim assist, sfx, reduce-motion |
| M2 | Dungeons | PARTIAL | Warren run plays (`?mode=dungeon&seed=N`); labyrinth + Hedge Tide is a module only; no Sunken Lantern or Catacombs |
| M3 | Loot and heroes | PARTIAL | Lantern page, stash, Fall / Rekindle / Retire, backup / restore; the arena ignores the hero; `MMItems` tiers not in runs |
| M4 | The Wilds | TODO | island, groups, events, bounties, pets are modules + tests only, no page |
| M5 | Polish | PARTIAL | pad / aim / sfx / motion live; daily maze, ghosts, board, access, tutorial are modules only |
| M6 | Hub and Hearthvale | PARTIAL | hub page, town links, `?from=hub`, Hearthvale heading; no medals / Tokens / Snack Stand, games do not report back |
| M7 | Deepdelve | PARTIAL | first page: chunks, light, mine / place, torch, IndexedDB; no furnace, mobs, goals, Rock Wyrm |
| M8 | Lakeside Angler | PARTIAL | page, 48 fish, gear, bosses, bait; no tournament, no town link, no medals |
| M9 | Festival Fields | PARTIAL | Bug Safari plays; Jam and Stalk are modules only (their map nodes link to missing pages) |
| M10 | Co-op / secret world | PARTIAL | town co-op / duel / 2v2 live; `MMParty` is a module only; Comet Trail not started |

## Wired into the playable game
- Town (`index.html`): Realm with `MMStats`, `MMHash`, `MMPad`, `MMAim`, `MMSfx`, `MMMotion`, `MMPatterns`; links to Mad Maze and the map.
- Mad Maze page + Warren run: `MMRng`, `MMWarren`, `MMRooms`, `MMEnemies`, `MMDungeonState`, `MMPatterns2`.
- The Lantern: `MMProfile`, `MMBackup`, `MMItems`, `MMClasses`. Hub: `MMMap`, `MMHubProfile`.
- Angler: `MMAngler`, `MMStore`. Bug Safari: `MMBugs`, `MMSfx`. Deepdelve: `MMChunks`, `MMLight`, `MMRecipes` (24 recipes, 1 used).

## Standalone modules only (pure code + Node tests, no page uses them)
`MMLabyrinth`, `MMPets`, `MMEvents`, `MMBounties`, `MMIsland`, `MMWilds`, `MMDaily`, `MMGhost`, `MMBoard`,
`MMAccess`, `MMTutorial`, `MMJam`, `MMStalk`, `MMParty`, `RulesCheck`
(and `firebase-rules.draft.json`, which is NOT applied).

## Top 10 next steps
1. Make Start run use the active Lantern hero (class, stats, items) and Fall it on death.
2. Drop `MMItems` tiers and bags in the Warren run; chest and boss pay the Lantern stash.
3. Owner applies and tests the Firebase rules draft in the Playground, loosening any rejected field.
4. Let games report results to the hub profile (medals, secret exits, keys) so the map unlocks for real.
5. Build the Campfire Jam page on `MMJam` and the Stalk Market page on `MMStalk` (the nodes already exist).
6. Wire `MMLabyrinth` + Hedge Tide into a second dungeon and start the Wilds (`MMIsland`, `MMWilds`, `MMEvents`).
7. Deepdelve: furnace and the full 24 recipes, mobs, day/night, lava, goals, carry over the town cave.
8. Daily Maze, ghost and board pages (`MMDaily`, `MMGhost`, `MMBoard`), tutorial, colour-blind palettes (`MMAccess`).
9. Mad Maze co-op: lite party code and dungeon sync on `MMParty`; port duel / 2v2 to the standalone page.
10. Angler: link the town fish journal and aquarium, add a tournament and bait from Bug Safari.

## Activity snapshot (read-only)
Each session's last step: `node game/tools/activity-snapshot.js --append` adds a counts-only line (no names, no chat text) to `game/design/DAILY-REPORT.md`. GET requests only.

## Realm: shop + no death penalty (2026-11-19)
- Falling no longer costs banked 💎. You get a Survivor's Cache item instead (Common <wave 3, Uncommon wave 3-5, Rare wave 6+); a full backpack sells it for 💎.
- Shop (key V, or the 🛒 button in the backpack): fixed stock, price = sell value x 8 (24 / 56 / 120 💎). Uncommon unlocks at best wave 2, Rare at best wave 5. Disabled in duels. No randomness, no real money.
- Test: game/tests/realm-shop-death.test.js

## Realm: combine (2026-11-19)
Backpack "Combine 3->next" button: 3 same gear + same rarity -> 1 of the next rarity; new Epic tier (x3.6) only from combining Rares. Test: realm-shop-death.test.js.

## Queued from owner (2026-11-19)
- GPT-designed map layouts so each Mad Maze run feels new, plus fresh art per run. Plan: GPT cannot be called from players' browsers (key lives only in this environment), so GPT writes a POOL of layouts/room templates and art sets offline (text/image calls, logged in LEDGER-OPENAI.md, inside the $4.00 cap); each run picks a combination by seed. Validate every generated layout with a solvability test before it ships.
- Merge: the manager job merges dev to master at :08 Pacific from the ci-status.json stamp.

## Research brief
`game/design/RESEARCH-ROTMG.md` (Realm of the Mad God study, 8 ideas to borrow). Planner: read it before picking Realm slices. Caveat: built from search excerpts, details approximate.

## Art pipeline (2026-11-20)
game/tools/art/ (specs, prompt builder, capped generator, processor, critic hooks, batch runner; README inside). Live calls need --live; cap in game/tools/art/config.json (TOTAL 4.00 USD, stop 3.60). Test: art-pipeline.test.js. OpenAI image credits: ledger total 1.96 USD, 0 images this session.

### B04 enemy art

B04 stages 72 validated enemy animation strips for the six Mad Maze IDs in the manifest. Integration and playback review are pending.
### B05 enemy art

B05 stages 72 validated animation strips for Mini Sprout and five Arcane Frontier enemies. Integration and playback review are pending.

## Heroes + enemy art live in code (2026-11-20)
Six new heroes selectable in Lantern with real art; enemy animations drawn in the Mad Maze arena (setEnemyArt, ?enemyart=0 disables). Not yet: arena reads class stats/abilities; enemy death animation; b05 enemies unmapped.
### B07 boss art

B07 stages 48 validated animation strips for all eight Arcane Frontier boss IDs. Runtime integration and playback review are pending.
### Frontier item art

Staged 16 validated equipment and potion icons matching the existing catalog IDs. Integration is pending.

### Frontier weapon expansion

Staged 20 additional weapon icons. The two item packs cover 28 weapon IDs and eight other equipment and potion IDs.

### B08 headgear

Staged 26 validated headgear icons. Runtime integration is pending.

### B08 armor

Staged 50 validated armor icons alongside the 26 headgear icons. Runtime integration is pending.

### B09 clothing and helmets

Staged 30 clothing icons and four helmets. Catalog and runtime integration are pending.

## Boss art + item icons (2026-11-20)
Boss animations in the Mad Maze arena by wave tier (?bossart=0 off); item icons in backpack/shop/slots on the Mad Maze page (?itemart=0 off). Not yet: town Realm Gate keeps emoji; loot bag art; dungeon-mode bosses untested; arena still ignores class stats.

## Class stats in the arena (2026-11-20)
MMClasses.arenaProfile multipliers (hp/speed/dmg/rate/iframes, clamped 0.7-1.4, ranger = 1) applied via realm.setHeroProfile on the Mad Maze page only (?classstats=0 off); duels and the town arena unchanged. Not yet: multi-shot/spread/pierce tags are not applied.

## Deepdelve governor + loot bag icons (2026-11-20)
Deepdelve: adaptive render scale/view distance governor (window.__dd.perf hook, off in ?test=1), max 3 chunk meshes per frame. Arena: loot bags show item icons with rarity outline; pickup/combine/buy float texts carry the icon. Not yet: town item icons, enemy death animation, dark_spider unmapped.

## Room variety + enemy deaths (2026-11-20)
mm-rooms: 25 new templates (68 with mirrors), MMRooms.selectRooms (layout v2; v1 selection kept verbatim for old seeds; ?lv=2 or fresh random seed uses v2). Hub catacombs link still v1 (add &lv=2 in game/hub/hub.js to enable). Enemy death ghosts (24-slot pool), dark_spider skin for Frost Mire Sniper. Not yet: new rooms eyeballed in browser, up-facing death strips.

## Art spend cap (2026-11-20)
Owner said in chat: "$2 is good, I have a cap on the API side so you can over spend". Owner then clarified: the $2 is a hard cap on their API side, I cannot overspend. Total cap kept at 4.00 USD (about $2 more than the 1.96 spent), stop 3.96, report 3.60. OpenAI image credits: today 0.00 USD, total 1.96 USD, images today 0. Codex makes the main asset batches; credits are for gaps Codex has not covered.

## Jam + Stalk + class signatures (2026-11-20)
New pages: games/jam (Campfire Jam: 4 songs, pixeltown-jam-v1), games/stalk (Stalk Market: play-money weekly prices, pixeltown-stalk-v1). Arena: MMClasses.arenaSignature + realm.setHeroSignature (F slot at level 7 replaces Overdrive; ?signature=0 off). Not yet: Jam calibration/12 songs, signature sounds/co-op sync, balance pass. OpenAI image credits: today 0.00 USD, total 1.96 USD, images today 0.

## Jam round two (2026-11-20)
Calibration (offsetMs in pixeltown-jam-v1, optional), 8 songs incl. secret Midnight Campfire (Hard full combo), early/late feedback. Pending: biome enemy roster (map all 20 creatures by biome/wave; design in the agent report, needs b06c on its branch), Codex b06d assigned.
## Test tiers + shards (2026-11-20)
`node game/tests/run-all.js` (no flags) is unchanged: all tests, serial, sorted. New flags: `--tier smoke|full`, `--only node|browser|live`, `--shard i/n` (cost-balanced, deterministic; `--balance` uses measured times), `--list`, `--jobs N` (node-class only), `--lock-live` (wraps live tests in `flock /tmp/live.lock`; do NOT also wrap run-all itself in that flock, it would deadlock). Classes live in `game/tests/test-tiers.json` (node = pure require, browser = standalone pages, live = joins the town as ADMIN bot); `run-all-tiers.test.js` fails if a new test is not listed there. Smoke = all node + non-heavy browser + town-links/saves/integration, about 5 min. Timings go to `game/tests/.timings.json` (gitignored).

## Unified Realm progress (2026-11-20)
Done: generator, zones module, menu/restart/phone layout, test tiers. Next (NEXT-SLICES.md): 4 camera+world hook in realm.js, 5 realm-world.js controller + ?mode=world page, 6 wire zones, 7 portals to dungeons (first playable). Owner decisions pending: death rule, Gate default, online model (defaults: no-loss death, big map default with Classic button, single-player first).

## First playable big map (2026-11-20)
Open /game/games/mad-maze/index.html?mode=world[&seed=N]. realm.js: setWorld/setMode(world), camera, screenToWorld. New realm-world.js (terrain chunks, HUD, minimap, portals), pixeltown-realm-v1 save. Gaps: bag tier colours, death text says Wave, shallow-water slow, narrow shore band, only Warren portals, fog, events, Nexus, co-op, Codex terrain art.

## Overworld terrain transitions (Codex, 2026-11-20)
B10T is registered on this branch. The overworld loader uses 32 base variants and 120 transition tiles when all differing cardinal neighbors match the manifest blend. Fully surrounded tiles use base variants. Mixed boundaries, missing art and map borders use the existing fallback. Node syntax and offline manifest/mask checks passed. Browser playback and integration CI remain pending. Next Realm gameplay slice: verify the death and restart loop, then zone loot presentation.

## World restart and navigation (Codex)
World restart describes the return to spawn and retains the existing no-loss policy. Restart clears world drop history and spawner and boss state. The overworld death recap omits the wave counter, while classic and dungeon recaps retain it. The HUD arrow points to the nearest dungeon portal, with the island centre as fallback. Offline syntax and targeted recap/navigation checks passed. Browser playback, zone loot changes, and later roadmap items remain pending.

## Realm zone bag presentation (Codex)
Overworld item drops use the six zone bag tier colors and the rolled lifetime. Item rarity still drives inventory and pickup. Syntax and offline pooled-bag metadata checks passed. Browser playback and Lantern stash payout remain pending.

## Shallow water movement
Overworld players move at 70% speed on shallow water. Targeted checks covered shallow water, land and map bounds. Browser playback and stash payout remain pending.

## Minimap accessibility
The minimap opens with mouse, touch or keyboard and exposes its zoom state. Horizontal and vertical marker scaling use the respective world dimensions. Syntax and offline interaction checks passed. Browser playback remains pending. Next: verify browser behavior and continue Lantern stash rewards.

## Realm chunk rendering
Chunk builds now resolve terrain transitions once per cell and compact sprite variants once per terrain. Offline mocked-canvas checks passed for base art, transitions, and fallback borders. Phone performance and browser playback remain pending.
## Portal dungeon exits
Portal dungeon summaries return players to their originating overworld tile. Standalone dungeon summaries keep the New dungeon option. Syntax and offline summary routing checks passed for world, hub, and town. Browser playthrough and Lantern rewards remain pending.

## Unified game published (2026-11-21)
Public: https://bawls-eth.github.io/awesome-24px/game/games/mad-maze/index.html?mode=world (Pages serves the claude/animal-crossing-game-7z3roh branch; 13 key files verified byte-identical to cb7f2eb). Town Gate: Enter the Realm (overworld) + Classic arena. Tests: realm-playthrough.test.js (offline, DB host blocked). Next: b11 terrain art (Codex), Lantern stash rewards from world/dungeon loot, other dungeon biomes, events, phone perf.

## S15 time-to-kill sim (2026-11-21)
`game/tests/class-weapon-sim.test.js` (node, smoke tier) clears a zone-1 group (spiral/aimed/ring/aimed at hp x1.98, scattered inside 48 px, closing in at 45 px/s) with every class x {base + family styles} in three configs (common, common with the L19 unlock nodes, epic) and requires 0.7-1.4x of the ranger plain bolt's clear time (11.4 s). Result after calibration: all 120 class x style combinations pass; the common-L0 range is 0.77x (frostcaller wand_chain) to 1.37x (paladin hammer_throw); the slowest are the low-rate classes (paladin base 1.3x) and trickster ricochet (1.26x). Before calibration 14 combinations fell outside (berserker axe_twin 0.49x, warlock/necromancer staff_helix 0.54-0.57x, frostcaller wand_frostshard 0.58x, staff_bloom 0.65x). Calibration is in `shapeIdx` of `mm-weapons.js` (commented, per-style `tune` values are unchanged because tune is capped at 0.95-1.08): boomerang weight 1.25 -> 2.0, helix wave (alt) x1.15 new, chain 0.3 -> 0.4 per link. Pierce stays 0.25 (pinned by shared-mm-weapons.test.js). `shared-mm-weapons.test.js` still passes 950/950.
