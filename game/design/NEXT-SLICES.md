# Next slices: the next hour (26 slices, 3 waves)

Planner, 2026-11-21 (late). Replaces the earlier 28-slice queue. Sonnet-class workers; one slice = one branch; `node game/tests/run-all.js` on port 8440 before merge; register every new test in `tests/test-tiers.json` (browser tests non-smoke).

## Already done: do not repeat
- Class/weapon plan **S1-S8, S15** (`mm-weapons`, `mm-projectile`, `mm-status`, `mm-unlocks`, class-id fix, panel rows, `mm-fx-draw`, projectile engine, TTK sim).
- Unified Realm: overworld, zones, difficulty curve, fog, minimap, biome portals (4 biomes), world events, sites (shrines/camps/NPCs), stash, terrain art b10t/b11a/b11b, Gate entry, hero picker, daily seed, death cache, shop, combine, loot-bag item icons.
- Side games: Jam depth (12 songs, Concert, Practice), Stalk depth/goals/advisor/neighbours, Angler depth + boss fish, Deepdelve crafting/day-night/mobs/Rock Wyrm/fps.
- Art delivered: b12 nature props, b13 structures, b14 portals, b15 bags/coins/potions, b21 NPCs, b22 relics/keys. Next from Codex: b16-b20 (projectiles, enemy bolts, effects, UI icons, portraits) - not delivered, so every slice keeps code fallbacks.

## In flight (do not start; their files are busy until merged)
| Branch | Covers | Holds |
|---|---|---|
| `rj-playtest-fixes` | S9 status wiring, playtest fixes 3-6 (shore, off-screen fire, shot readability, TTK) | RJ |
| `mm-wire-polish` | S10 Mad Maze wiring | MM |
| `rw-art-wire` | b12-b15 wiring (props, portals, shrines, beacon, bags, coins) | RW |
| `town-offline-join` | playtest #2 join timeout | `main.js`, `net.js`, `index.html` |
Unknown: whether playtest #7-#16 (phone HUD, dungeon fit, prompt stacking, copy) are inside `rj-playtest-fixes`. Each slice below that touches them says "verify first".

## Serial resources
RJ `realm.js`, RW `games/mad-maze/realm-world.js`, MM `mad-maze.js`, DJ `dungeon.js`, MN `main.js`, PG `games/mad-maze/index.html`+`mad-maze.css`, LJ `lantern.js`: at most one slice each per wave. Wave 1 uses none of them (they are in flight).

## Wave 1: pure modules, tests, side pages (12 parallel, start now)

| id | title | files | S/M/L | art | acceptance (3) | test |
|---|---|---|---|---|---|---|
| N1 | Nexus layout module | NEW `shared/mm-nexus.js` | M | b13 fountain/banners, b14 `portal_nexus`/`portal_return`, b21 7 NPCs exist | fixed 40x30-tile plaza with fountain, 4 vendor slots, portal ring (realm, vault, 4 biomes); no enemies; `layout()` is pure and identical across calls | `shared-mm-nexus.test.js` |
| N2 | Quest + oracle module | NEW `shared/mm-quests.js` | M | b21 `npc_quest_giver`; oracle uses `npc_ghost_guide` (no oracle NPC art) | 3 daily quests per UTC date from `MMDaily` (kill N in zone, kill a boss, open a portal); `progress(state, event)` copies, never mutates; reward is shards + one bag tier; hostile save input cleaned | `shared-mm-quests.test.js` |
| N3 | Vault + boss portal rules | NEW `shared/mm-portals.js` | S | b14 `portal_vault`/`portal_boss`, b22 `key_boss` exist | boss key opens a boss portal 120 s; vault portal only in the Nexus and leads to the Lantern stash; unknown key id is a no-op | `shared-mm-portals.test.js` |
| N4 | Pickups table | NEW `shared/mm-pickups.js` | S | b15 `coin_f1..4`, heart/focus, 6 potions exist | coins/potions/XP orbs per tier seeded by `(seed, group, kill)`; magnet radius 64 px, lifetime per tier; heal capped at max HP | `shared-mm-pickups.test.js` |
| P1 | World party protocol | NEW `shared/mm-world-party.js` (uses `mm-party.js` shapes) | M | code | messages pos/hit/bag at 8 Hz within 40 tiles; per-player bag ids never collide; an in-memory relay round-trips 2 peers; no Firebase import (grep check) | `shared-mm-world-party.test.js` |
| W1 | `wpn_` item table + drop/shop data (S12 data half) | NEW `shared/mm-weapon-items.js` | S | b07 weapon icons exist; style icons via `mm-fx-draw` | 26 items match `/^wpn_[a-z_]{3,24}$/` and resolve in `MMWeapons`; drop split 70/30 base/family; shop price = sell x 8 | `shared-mm-weapon-items.test.js` |
| Q1 | DB-safe test helper (playtest #1) | `tests/helpers.js`, `tests/realm-playthrough.test.js` + any `offline` test | S | none | `blockDb(ctx)` adds `routeWebSocket` close for DB hosts; a test fails if a DB `websocket` event fires; realm-playthrough shows 0 DB sockets. Verify the bot fix was not already ported | `helpers-db-block.test.js` |
| J1 | Jam: calibration never blocks the song list | `games/jam/jam.js`, `jam.css` | S | code | first visit shows the song list with a "Check timing (recommended)" chip; offset defaults to 0 and Play works at once; finished calibration still saves the offset. Check branch `jam-calibration-songs` first | `jam-first-visit.test.js` |
| K1 | Stalk: closed-market text | `games/stalk/stalk.js`, `stalk.css` | S | code | when Buy/Sell is disabled the reason shows beside the buttons ("Market closed: buy on Sunday"); `aria-describedby` links it; no change on open days | extend `stalk-page.test.js` |
| D1 | Deepdelve first-spawn fix | `games/deepdelve/deepdelve.js` | S | code voxel | spawn chooses a column within 24 blocks of trees or a cave mouth; the stray selection square is hidden until the pointer moves; seed save unchanged | `deepdelve-spawn.test.js` |
| F1 | World phone perf probe | NEW `tests/world-perf.test.js` | S | none | 390x844, 4x CPU throttle, 60 enemies + 300 bullets: median frame recorded; fails only on 2x regression vs stored baseline; 0 console errors | `world-perf.test.js` |
| B1 | Backup v2 module | `shared/mm-backup.js` | S | none | export includes `pixeltown-save-v1`, `-mm-v1`, `-realm-v1`, `-arms-v1`, stalk, jam keys; a v1 backup still restores; oversized/hostile blob rejected with a message | extend `shared-mm-profile-backup.test.js` |

## Wave 2: serial wiring (7 parallel; needs the in-flight branches merged)

| id | title | files | S/M/L | conflict | art | acceptance (3) | test |
|---|---|---|---|---|---|---|---|
| S11 | World debuffs + shrines | RW | M | RW | code cores (b17 later) | ice_wraith bolt can slow; a Shore bolt never applies a status; shrine shows the damaging icon 60 s; max 1 status / 0.5 s | `world-status.test.js` |
| S12 | Passives + `wpn_` drops + shop | RJ (uses W1) | L | RJ, Opus review | b07 icons | L3 rogue lacks `rogue_4`, L4 rate x1.04; L11 Nova fires 20; shop lists family styles at sell x 8; old saves load | `class-unlocks-arena.test.js` |
| S13 | Ability bar, unlock toast, tooltip | PG + MM | M | PG, MM, Opus review (saves `pixeltown-arms-v1`) | lock/cooldown code-drawn; b20 icons later | at 390x844 targets >= 44 px and clear of the aim stick; toast once per node (`seen`); long-press opens sheet, Esc closes | `class-unlock-ui.test.js` |
| DG | Phone dungeon fit (playtest #7, #11, #12, #13, #14) | DJ | M | DJ | code | verify first; portrait room scales to screen width, map/banner off the room; exit reads "✖ World"; HUD and summary room counts agree; "cleared!" only with the boss dead | `dungeon-phone.test.js` |
| LB | Lantern backup UI v2 | LJ, `lantern.html` | S | LJ, Opus review | none | Download/Restore use B1; restore shows a diff summary before writing; cancel writes nothing | extend `lantern-page.test.js` |
| AX | Accessibility settings | `shared/mm-access.js`, `hub/hub.js`, `hub/hub.css` | M | hub files | code | colour-blind palette, reduced glare and large text toggles saved additively; hub has a settings sheet reachable by keyboard; Realm reads the flags (read-only, no RJ edit) | `access-settings.test.js` |
| AN | Angler accessibility + phone | `games/angler/angler.js`, `angler.css` | S | angler files | code | tension bar has a pattern, not only colour; reduced motion stops bobber shake; reel button 44 px and unobstructed at 390x844 | extend `angler-polish.test.js` |

## Wave 3: Realm feel + loop (7 parallel; needs Wave 2 merged)

| id | title | files | S/M/L | conflict | art | acceptance (3) | test |
|---|---|---|---|---|---|---|---|
| NX | Nexus live + vault/boss portals | RW (uses N1, N3, N4) | L | RW, Opus review | b13/b14/b21 exist | Nexus menu "Go to Nexus" places you in the plaza with no enemies; portal ring enters realm/biomes/vault; boss key opens a boss portal for 120 s; coins/potions from N4 drop and magnet | `world-nexus.test.js` |
| QB | Quest + oracle board | PG + MM (uses N2) | M | PG, MM | b21 quest giver | board lists 3 daily quests; progress reads `pixeltown-realm-v1.stats` (additive `quests` key); claim pays once even after reload | `world-quests.test.js` |
| S14 | Backpack weapon compare, enemy pips, damage colours | RJ | M | RJ | code | tooltip shows the pattern line and delta vs equipped; at most 3 pips per enemy; armorBroken numbers purple | `class-weapon-ui.test.js` |
| CO | Co-op on the big map (relay only) | NEW `games/mad-maze/world-team.js`, NEW `tests/fixtures/world-party.html` (uses P1) | L | none (page hookup next hour), Opus review | code | two tabs share one seed and see each other within 40 tiles; each gets its own bag for a shared kill; zero live-DB requests or sockets (Q1 helper) | `world-party.test.js` |
| S16 | Class/weapon playtest loop | NEW `tests/class-weapon-playtest.test.js` | S | none | none | 4 classes: equip a style, reach L4, see the toast, kill a group, open the panel; 0 console errors; median frame < 20 ms at 390x844 | `class-weapon-playtest.test.js` |
| DD | Deepdelve goals panel | `games/deepdelve/deepdelve.js`, `.css` | S | deepdelve files | code | 6 goals (first torch, furnace, iron, depth 40, Wyrm, 20 recipes) persist additively in IndexedDB meta; panel 44 px targets; old worlds load | `deepdelve-goals.test.js` |
| HR | Games report to the hub | `shared/mm-profile.js`, one call line each in jam/angler/stalk | M | mm-profile.js, Opus review | none | qualifying Jam/Angler/Stalk results add a medal on the hub node; old hub profiles load; double report is idempotent | `hub-medals.test.js` |

Merge order per wave: pure modules -> RJ -> RW -> DJ/MM/PG -> LJ/hub -> side games -> docs.

## QA plan
- Opus review: S12, S13, NX, CO, HR, LB, B1 (saves or co-op/core).
- Saves fixture: one test loads an old `pixeltown-save-v1`, a pre-world `pixeltown-mm-v1`, an empty `pixeltown-realm-v1` and no `pixeltown-arms-v1`; every save-touching slice must pass it.
- DB safety: after Q1 merges, every browser test uses `blockDb`; reviewer greps new files for `firebase`/`database(`.
- Phone: S13, DG, AN, DD, NX attach 390x844 screenshots; F1 baseline lands before NX.
- End of hour: rerun `game/tools/playtest-bot/run.js` (WebSocket-blocked) and append deltas to PLAYTEST-REVIEW.md.

## Risks
1. In-flight branches slip: Wave 2 cannot start on RJ/RW/MM until they merge; Wave 1 is fully independent.
2. Playtest overlap: `rj-playtest-fixes` may already cover #7-#16; DG verifies before coding.
3. Co-op: relay-only; any live-DB path in CO is a blocker. Page hookup waits for the next hour (PG busy).
4. Save drift across `quests`, `arms`, backup v2: additive keys only, shared fixture.
5. Art gaps: no oracle NPC, b16-b20 not delivered; fallbacks are tested.
6. RW size (961 lines) and NX being large: keep logic in N1/N3/N4.
