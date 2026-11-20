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

### B07 boss art

B07 stages 48 validated animation strips for all eight Arcane Frontier boss IDs. Runtime integration and playback review are pending.
