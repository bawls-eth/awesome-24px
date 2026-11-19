# Pixeltown / Mad Maze — 10-day roadmap

Source of truth: `game/design/REALM-DESIGN.md` (Mad Maze) and `game/design/WORLD-MAP-DESIGN.md` (hub map, milestones M1..M10).
This file supersedes the earlier Realm-zone slices and the older "dense 10-day plan" wherever they conflict.
Pixeltown stays the hub (a Mario-World-style overworld map); the current cozy town becomes **Hearthvale**, visited from the hub (the
save key `pixeltown-save-v1` and the URL keep working). Mad Maze (the Realm-style game) is a full game node; the cave and the
minigames are re-thought as full games, each a node.

Standing rules for every slice (30-50 min each, about 16 a day): 3+ Playwright assertions, zero console errors, `node --check` clean,
additive-only localStorage keys, never chat or write test junk into the live Firebase, desktop + phone (390x844) screenshots viewed,
a watcher review of each diff, an Opus review for anything touching `net.js`, the `realm*` Firebase paths, saves or netcode, a QA
playtester pass on each fun gate. Art: tiles and blocks are procedural; GPT-generated images only for characters, creatures, items and
props (at most 15 images a day). Nothing that costs real money, no loot-box style paid randomness, no fake urgency or guilt mechanics.

## Decisions already made (defaults, the owner may override)
- Death model: **soft permadeath plus a no-loss ("Picnic") mode toggle.**
- The town's name: **Hearthvale.**
- Online scope: keep the current Firebase approach; **no Firebase Anonymous Auth or any new auth/backend yet.**
- Leaderboards: best-effort and clearly "for fun".
- **Polyroll (dice minigame in `main.js`): DECIDED, it stays.** "It's fine, it's only for stars." Stars are a free in-game points currency;
  no real money, no purchases, no ads anywhere. It may be touched later only for ordinary bug fixes or to fold it into the Festival
  world (M9) as a normal minigame. Do not remove it. (Not an open decision any more.)

## Audit: what already exists (as of commit 3140821)
| Milestone | Status | Evidence | Missing |
|---|---|---|---|
| M1 combat core | PARTIAL | `realm.js` (2D canvas overlay): 8-way move, bolt pools (160/420), 3 enemy patterns, HP, i-frames, touch twin-stick, perf check | standalone page, walls + sliding, SWF/KNK/POW/GRD formulas, spatial hash, hit-box dot, gamepad, aim assist, patterns as a pure module, 400-bullet bench |
| M2 dungeons | TODO | Gloomheart's 3-phase boss is a usable phase pattern | generator, rooms, doors, keys, labyrinth, Hedge Tide, Burrowmole |
| M3 loot / heroes | PARTIAL | 3 slots, 3 rarities, 7 items, 24-slot backpack, 30% bags, 20 levels, 4 abilities, `rmCleanSave` | tiers T0-T8, bag colours, classes, the Lantern hub, `pixeltown-mm-v1`, soft permadeath, potions, Retire |
| M4 Wilds | PARTIAL | 3 arena biomes with lava/ice, wanderers, kill board | island, groups, quest arrow, events, designed biomes, pets, bounties, the Keep |
| M5 polish | PARTIAL | phone-size tests, portrait arena | daily maze, boards + ghosts, accessibility, audio, tutorial, more classes |
| M6 hub + rename | TODO | town still "Pixeltown" | everything |
| M7 Deepdelve | PARTIAL | `underground.js`: seeded cave, caveSeed/caveInv/cavePick, day/night, lava, crafting table, pickaxe tiers | own page, chunks, meshing, IndexedDB, light levels, furnace, mobs, goals, Rock Wyrm |
| M8 Angler | PARTIAL (light) | town fishing, 12-species journal, daily tournament, aquarium | own page, reel bar, 48 fish, spots, gear, boss fish |
| M9 Festival | TODO (light versions in town) | Bug-Off, turnip stall, show, Polyroll (stays) | three full games + Finale |
| M10 co-op / secret world | PARTIAL, ahead of plan | `realm-team.js` + `net.js`: co-op, 1v1 duel, 2v2 over `realmParties` (3 seats, invites) | 5-letter party codes, dungeon sync, seeded pattern events, damage clamp, soulbound loot, host migration, Comet Trail, unified backup |

## Migration: realm.js -> game/games/mad-maze/
1. **Same files, two entry points (Day 1).** `games/mad-maze/index.html` loads `../../realm.js` and `../../realm-team.js` unchanged plus a copy of the Realm
   overlay markup. No fork, so the in-town Realm Gate cannot regress; the six existing `realm*.test.js` files are the regression gate on every diff.
2. **Pull pure logic out piece by piece** into `game/shared/*.js` / `mm-*.js` (rng, store, patterns, stats, sfx, input), used by both entry points.
   Files move physically only after parity; `game/realm.js` stays as a thin wrapper.
3. **Saves (additive only).** Existing progress stays in `pixeltown-save-v1.realm` until parity and both pages read/write it. **First fix the clobber bug**
   (re-read, merge, write; listen for `storage`), because the in-memory `realm` save is written back whole and two tabs overwrite each other.
   New Mad Maze data (heroes, stash, fame, mode) goes only in `pixeltown-mm-v1`. A "Legacy Ranger" hero is copied (never moved) from `realm` on the first Lantern
   visit with a `migratedFrom` stamp. Backup/restore must export `pixeltown-mm-v1` too (pulled forward to Day 3).
4. **Network.** The standalone page uses a lite Net that does not join `/players` (keeps the 10-player town cap); 5-letter code at `realmCodes/{code}`.
   The town keeps inviting through its player list; both use the same `realmParties` link format.
5. **Parity flip (end of Day 5).** All Realm tests pass against the new page plus the new suites; the Gate menu then offers "Open Mad Maze"; the overlay stays behind
   "Classic arena" for one release.

## Roadmap (about 16 slices a day, in milestone order)
**Day 1 — M1 core, standalone page:** rng module; safe store; page shell (`?test=1`, `__mm`); save adapter on `realm`; cross-tab merge fix; pin gate regression run;
tile walls + sliding; `mm-stats` formulas; guard + hit-box dot; pure patterns (ring/spiral/aimed); spatial hash; gamepad; touch aim assist; 400-bullet bench; sfx; reduce-motion.

**Day 2 — M2 dungeons:** Warren generator; invariants (reachability, key, secret room); room templates + autotile; render/camera/mini-map; locking doors; keys + treasure; secret room;
patterns sweep/wallGap; homing/flower/shotgun; 5 Bramble enemies (4 GPT sprites); threat budget + elites; Queen Burrowmole boss; labyrinth generator; Hedge Tide; exit + loot summary; hostile-seed fuzz.

**Day 3 — M3 loot and heroes:** tiered items + old-item mapping; bags + drop tables; new XP curve (legacy-safe); Ranger; Frostcaller; Herald; Lantern hub map; stash; `pixeltown-mm-v1`;
backup/restore bundle; soft permadeath (Fall); Picnic toggle; Rekindle; potions + caps; Retire + Hall of Heroes; Punk + Bruiser unlocks.

**Day 4 — M4 the Wilds:** island generator; roaming groups; quest arrow; Wild Events scheduler; Old Hollowstump; Fogfen tiles + enemies; Sunken Lantern labyrinth; Gloomtoad; Drowned Bell event;
Ember tiles + enemies; Bonefire Catacombs; Lantern Lich; Pyre Colossus; pets from eggs; pet feeding; daily bounties.

**Day 5 — M4 finale, M5, parity flip:** Wilds closing; Mazewright's Keep; Grave Tender; Trickster; Shadow Paw; Daily Maze; boards (best effort, "for fun"); ghosts; accessibility pack; biome music;
tutorial; phone pass; party code (lite Net); port co-op/duel/2v2 to the page; **parity flip**; "take a break?" nudge + parity audit.

**Day 6 — M6 hub + Hearthvale rename:** `shared/profile.js` seeding; `reportResult`; hub page (no libraries); map data validation; villager walking; tap + BFS + controller; node card + iris + prefetch;
path unlock + reveal; Hearthvale arrival (`?from=hub`); leave to hub; rename strings (manifest name stays "Pixeltown"); compatibility suite; Mad Maze on the map; medals + Tokens;
Snack Stand (cosmetic only); roamers + star booth (verify how stars persist first; Polyroll unchanged).

**Day 7 — M7 Deepdelve:** standalone page; key copy into `pixeltown-cave-v1` (copy, never delete); chunk data; face-culled meshing; lazy load; IndexedDB chunk diffs; light levels;
furnace + ore gating; 24 recipes; Glow Slime; Cave Bat + Rock Crab; survival vs creative; goals and medals; Lava Lake secret; Rock Wyrm; fossil vault -> museum link.

**Day 8 — M8 Lakeside Angler:** page + West Pond; reel tension bar; 48-fish data (12 existing ids kept); journal UI; East Pond + River Run; Sea Pier/Ice Hole/Mangrove; fish behaviours;
rods + lures; bait from town bugs; Old Whiskers; Pier Kraken + Ice Queen Pike; `pixeltown-angler-v1`; aquarium link; `/angler/tournament` (offline stub); medals + map nodes; phone pass.

**Day 9 — M9 Festival Fields:** Bug Safari (page, behaviours, combos, 8 arenas, Moonwing); Jam engine (lanes + touch, synth songs, calibration + ranks, 8 more songs);
stalk sim (Quick/Slow week, UI + almanac, no wager UI), goals + secret, cellar upgrade + medals; Medley mode; Finale castle. Polyroll stays as is in Hearthvale (no node, medals or Tokens).

**Day 10 — M10 co-op, Comet Trail, launch:** Firebase rules doc (validation only, owner pastes); seat lifecycle fix; party up to 4; 8 Hz state + deadband + interpolation; dungeon sync;
pattern-start events; damage reports + clamp; soulbound loot; host migration; bandwidth guard; invite/garbage cleanup; Comet Trail W6; five challenge variants; full backup bundle; launch docs; launch QA.

## Open decisions for the owner (defaults in brackets)
1. Drawing tech for Mad Maze: keep the plain 2D canvas of `realm.js` [default] or Phaser as the design doc says.
2. What happens to 💎 shards: convert to account fame (suggest 10:1) or keep as a Lantern cosmetics currency.
3. The legacy Realm hero: import with level kept and items mapped to new tiers [default] or start fresh with a gift.
4. Duel and 2v2: town gate only, or also a Mad Maze "Arena" node [default both].
5. After parity: does the Realm Gate link out to the new page [default] or keep the overlay forever.
6. May the installed app's `start_url` and the root redirect point to the hub at M6.
7. Polyroll stars -> Tokens at the booth: yes with a 20-a-day cap [default].
8. Publish validation-only Firebase rules (no auth) that the owner pastes in.
9. GPT art: who approves the style; is 16-colour palette reduction required.

## Risks in the shipped netcode (net.js realm methods, realm-team.js)
1. Open rules: anyone can read `realmParties` and write any guest seat node; the host checks only the seat a message arrived on, never who sent it.
2. A guest's `onDisconnect` removes only its `g{seat}` node, not its name in `/m`; the seat stays taken and a 2v2 can start with a missing player.
3. Invite rate limit is client-side only; invites to players who left are never cleaned up.
4. Snapshots up to 24 KB about every 60 ms to up to three guests could approach the free-tier bandwidth; over-24 KB snapshots are silently dropped (possible desync in busy boss phases). Measure.
5. Invite freshness compares server time with the device clock (+-90 s); use `serverNow()`.
6. Co-op guests self-report max HP/damage/fire rate; PvP fixes stats. Co-op results must never feed leaderboards.
7. In-memory `realm` save is written back whole (two tabs clobber each other): Day 1 slice 5.
8. `realm-team`/`realm-duel`/`realm-2v2` tests use the live database; make the in-memory relay the default and put live tests behind an env flag.
9. 100 simultaneous-connection free-tier limit: the standalone page must not join `/players`.
