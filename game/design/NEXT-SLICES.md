# Next slices: unified Realm depth + side games (queue of 24)

Planner, 2026-11-21. Supersedes the 2026-11-20 list (its slices 1-11 and 14 shipped: generator, zones, menu, camera hook, `realm-world.js`, zone drops/bag tiers, minimap, terrain art b10t, portal return, Gate entry).
Checked this session: `realm.js` 2540 lines (`setWorld`/`setMode` at 972/990); `games/mad-maze/realm-world.js` 532 lines, Warren-only portals (`portalUrls` hard-codes `mode=dungeon`), no fog/`discovered`, no events wiring, no stash or `pixeltown-mm-v1` reference; `dungeon.js` calls only `MMWarren.generate` (no biome parameter); the Mad Maze page loads no `realm-team.js` (no co-op); no daily seed on Mad Maze pages; b21 NPC strips present (`npc_<id>_idle_down`/`_talk_down`, 7 ids); Deepdelve has a furnace, no Rock Wyrm; Stalk has no goals/almanac; 101 test files listed in `test-tiers.json`.
Unknown (verify before starting): exact Jam song count beyond STATUS's "8"; whether Deepdelve mobs exist (37 loose matches for slime/bat/mob); `MMZones.eventsFor` return shape in practice.

## Serial resources
`realm.js` (RJ) and `realm-world.js` (RW) are serial: at most ONE slice per wave touches each, and it merges first. `dungeon.js` (DJ), `mad-maze.js` (MM), `games/mad-maze/index.html` + `mad-maze.css` (PG) and `lantern.js` (LJ) are one-per-wave too. Every RW feature below is split: a pure `shared/` module (parallel, Node test) and a wiring slice (serial).

## Wave 1 (12 parallel, disjoint files)

| id | title | files | size | conflicts | art | acceptance |
|---|---|---|---|---|---|---|
| A1 | Fog of discovered tiles | RW, new test `world-fog.test.js` | M | RW | code | minimap draws unseen 8x8 cells black; walking reveals them; `discovered` base64 saved in `pixeltown-realm-v1` (additive) and a save without it loads fully fogged; restart clears it |
| A2 | Dungeon biome table | NEW `shared/mm-biomes.js` + node test | S | none | code (b14 portal ids referenced) | `bramble/meadow/crypt/warren` each give palette, enemy roster from delivered creature ids, boss id, key id; same seed same config; unknown biome falls back to warren |
| A3 | World event scheduler | NEW `shared/mm-world-events.js` + node test | M | none | code | seed + 5-min slot picks the same site/kind for any caller; 20 s warning phase; beacon/horde/raid states advance deterministically on `tick(t)` |
| A4 | Loot-to-Lantern ledger | NEW `shared/mm-loot-ledger.js` + node test | M | none | code | world/dungeon results become an `inbox` list (additive key in `pixeltown-mm-v1`); cap 24, overflow -> shards; hostile/oversized input sanitised; old mm-v1 fixture loads unchanged |
| A5 | Shrines, camps, NPC sites | NEW `shared/mm-sites.js` + node test | S | none | b21 art exists | maps `world` structures to shrine (heal/rage/ward buff table, 3-min cooldown), camp (chest + patrol), NPC (one of 7 b21 ids) per zone; deterministic per seed; none in the spawn halo |
| A6 | Class tags: multi-shot/spread/pierce | RJ (bolt fire), `shared/mm-classes.js` | M | RJ | code | `arenaProfile` tags change bolt count/spread/pierce; ranger byte-identical; `?classstats=0` restores old fire; `realm-core`/`realm-wire` green |
| A7 | Dungeon boss art + summary item icons | DJ | S | DJ | delivered b07/i01 | dungeon boss uses `setBossArt` sprite (fallback circle); summary lists item icons; `?bossart=0` off |
| A8 | Daily maze/world seed | `shared/mm-daily.js` (extend), MM | S | MM | code | `?daily=1` gives the same seed for all players on a UTC date; button on menu routes to it; existing `?seed=` unchanged |
| A9 | Deepdelve Rock Wyrm (boss) | `games/deepdelve/deepdelve.js` | M | deepdelve.js | code voxel | appears below a depth; 3 phases; defeat drops a recipe item; off in `?test=1` unless `?wyrm=1`; perf governor still holds |
| A10 | Lakeside Angler boss fish encounter polish | `games/angler/angler.js`, `angler.css` | S | angler files | code | boss bite shows a distinct tension pattern; journal marks boss caught; phone 390x844 shows reel bar + button unobstructed |
| A11 | Stalk Market goals + almanac | `games/stalk/stalk.js`, `shared/mm-stalk-market.js` | S | stalk files | code | 5 goals tracked in `pixeltown-stalk-v1` (additive); almanac lists past 4 weeks; play-money only, no wager UI |
| A12 | Campfire Jam songs to 12 | `shared/mm-jam-songs.js`, `games/jam/jam.js` | M | jam files | code | 4 new original charts, each Easy/Normal/Hard; offsets respected; song list scrolls on phone |

## Wave 2 (11 parallel; needs A2-A5 merged)

| id | title | files | size | conflicts | art | acceptance |
|---|---|---|---|---|---|---|
| B1 | Biome portals bramble/meadow/crypt | RW (`portalUrls`, labels) | M | RW | b14 portals or code ring | each portal opens `mode=dungeon&biome=<b>`; label/minimap colour per biome; return regex still matches; Warren unchanged |
| B2 | Dungeon biome parameter | DJ, MM (`biome` query whitelist) | M | DJ, MM | code palettes | `?biome=crypt` uses A2 roster + palette; invalid biome -> warren; old seeds/layout v1 byte-identical |
| B3 | Lantern inbox claim | LJ, `lantern.html` | S | LJ | b22 icons | inbox panel lists pending items with icons; Claim moves to stash or carry; full stash keeps them pending |
| B5 | Bag + item art in world drops | `shared/mm-art.js` (bag lookup), new test | S | mm-art.js | b15 bags or current tier colours | `bag_<tier>` drawn when present, fallback colour tested; 2-frame bob; no extra draw calls per bag beyond one sprite |
| B6 | Class ability balance pass | `shared/mm-classes.js`, new `tests/class-balance.test.js` | S | mm-classes.js (A6 merged first) | code | scripted sim: each class's time-to-kill a zone-1 group within 0.7-1.4x ranger; signature cooldowns 8-20 s; numbers recorded in STATUS |
| B7 | Mad Maze room eyeball + up-facing deaths | `shared/mm-rooms.js` only if broken, screenshot script | S | mm-rooms.js | b04/b05 (up death strips absent: code mirror fallback) | screenshot of all 68 templates; no unreachable door; up-facing death uses down strip flipped |
| B8 | Deepdelve phone controls pass | `games/deepdelve/deepdelve.css`, `index.html` | S | deepdelve page | code | 44 px targets, safe areas, no overlap at 390x844 and 844x390 |
| B9 | Phone perf probe for the world | NEW `tests/world-perf.test.js` (browser, non-beta) | S | none | code | 60 enemies + 300 bullets at 390x844, 4x CPU throttle: median frame under 20 ms recorded; fails only on a 2x regression vs `.timings` baseline |
| B10 | Realm feel: hit-stop, screen shake, loot pop | RJ | S | RJ | b18 fx optional | 40 ms hit-stop on boss hit; shake respects reduce-motion; 0.3 s pop on purple+ bags; bench unchanged |
| B11 | Bug Safari fixes | `games/festival/bugs.js` | S | bugs files | code | open Bug Safari items in QA-SWEEP-NOTES.md (not read by this planner: verify they exist first) fixed; 3 assertions per fix |

(World-event wiring waits for Wave 3: RW is taken by B1.)

## Wave 3 (7 parallel; B1, B2 merged)

| id | title | files | size | conflicts | art | acceptance |
|---|---|---|---|---|---|---|
| C1 | World events live (beacon, horde, raid) | RW | L | RW | b14 `event_beacon` or code flag | banner 20 s ahead; minimap ping; beacon 45 s hold; contribution bar; gold bag + biome key on win; restart clears |
| C3 | Dungeon results -> ledger | DJ (exit), `shared/mm-loot-ledger.js` call | S | DJ | code | finishing a portal dungeon adds its loot to `inbox`; standalone dungeon unchanged; death keeps the no-loss rule |
| C4 | World drops -> ledger on Leave | MM (leave handler) | S | MM | code | Leave/Restart writes carried world items to `inbox` once (idempotent on double click) |
| C5 | Co-op on the big map (2 tabs, in-memory relay) | NEW `games/mad-maze/world-team.js`, `shared/mm-party.js` | L | mm-party.js | code | same seed both tabs; positions 8 Hz in 40-tile interest radius; per-player bags; zero live-DB writes in tests (relay only); snapshot under 24 KB |
| C6 | Nexus settings panel (joystick side, aim assist, left-hand) | PG | S | PG | b19 UI or text | settings persist in `pixeltown-realm-v1` (additive); left-hand mode swaps sticks; 44 px targets |
| C7 | Angler + Jam medals to hub | `shared/mm-profile.js` reportResult callers only | S | mm-profile.js | code | medal appears on hub node after a qualifying run; old profiles load |
| C8 | Item tooltip + compare in backpack | RJ | M | RJ | b07-b09 icons | tap/hover shows stats delta vs equipped; phone sheet fits 390x844; keyboard accessible |

Serial RW follow-ups (one per slot, after C1 merges):
- **C2 Shrines/camps/NPCs in the world** (RW, M, b21 art delivered): an NPC idle/talk animation plays near the player and a talk card opens; a shrine buff applies at most once per 3 min (A5 table); a camp chest drops one zone bag; nothing spawns in the spawn halo.
- **C9 Co-op wiring in RW** (RW, M, Opus review): the C5 module is hooked in; the guest sees host enemies and its own bags; solo play is byte-identical when there is no party.
- **C10 Boss raid telegraphs** (RW + RJ, M): ground rings 1 s before impact and red lines for aimed volleys; reduce-motion keeps the telegraphs but drops the shake.

Scheduling: up to 12 grunts in Wave 1; merge order pure modules -> RJ -> RW -> DJ/MM/PG -> side games -> docs. Codex art never blocks: every art-using slice tests its fallback path.

## QA plan
- Opus review (mandatory): A1, A4, B3, C3, C4, C6 (saves); C5 and its RW wiring (net/co-op: in-memory relay only, never the live DB; audit any Firebase import); A6, B10, C8 (realm.js core); B2 (old-seed byte-identity).
- Playtest-style Playwright scripts (non-beta, `class: browser`, added to `test-tiers.json`): A1 (walk 3 screens, minimap pixel check), B1+B2 (enter each biome portal, clear first room, exit to the same tile), C1 (fast-forward clock into an event, win, see gold bag), C3/C4 (dungeon loot appears in Lantern inbox), C5 (two pages, relay), B9 perf. Each: 390x844 + desktop screenshots viewed, zero console errors.
- Every slice: `node --check`, its tests, smoke tier; full `node game/tests/run-all.js` on the merged head once per hour before stamping `ci-status.json`.
- A second QA grunt per wave replays the realm-playthrough path by hand-script (spawn -> zone 1 kill -> bag -> portal -> dungeon -> return -> restart) and files findings in QA-SWEEP-NOTES.

## Risks
1. RW contention: four features want it; if two land in one hour, rebase, never hand-merge. Consider splitting RW into `realm-world-*.js` modules as its own serial slice before Wave 3.
2. Save drift: three new additive keys (`discovered`, `inbox`, settings); a single fixture test with old `pixeltown-save-v1`, pre-world `pixeltown-mm-v1` and empty `pixeltown-realm-v1` must gate all of them.
3. Loot duplication between world, dungeon and Lantern (double claim, two tabs): ledger must use item uids and the existing cross-tab merge.
4. Co-op on the live DB: free-tier 100 connections and open rules; keep C5 relay-only until the owner approves a live test.
5. Phone fps with fog + events + more sprites: B9 must land before C1 to give a baseline; no real-device numbers exist yet.
6. Codex ordering (b11 terrain first, then b14 portals, b15 bags): B1/B5/C1 ship with code fallbacks and swap art by id.
7. Test runtime grows with ~10 new browser suites; keep heavy ones out of smoke.
