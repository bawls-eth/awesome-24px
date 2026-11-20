# Next slices: unified Realm (big map + dungeons)

Planning agent, 2026-11-20. Owner goal: ONE RotMG-style game (big scrolling map, zones by distance, portals into
Mad Maze dungeons, drops, restart menu, phone). Codex makes images; Claude wires. Facts checked: `realm.js` is 2243 lines, one `RealmArena` class, no camera (no `translate`); world size is screen-sized
(`W`/`H`) or `fixedWorld` (a dungeon room). `dungeon.js` already drives the arena from outside (`arena.dungeon`,
`setWalls`, `spawnEnemy`, `dropBag`): that is the pattern to copy. Not yet on this checkout: `shared/mm-overworld.js`,
`REALM-UNIFIED-DESIGN.md` (both in flight). 93 suites; run-all.js runs them one by one (170 s timeout each).

## (a) The 15 slices, dependency order

Owner: C = Claude agent, X = Codex. Every slice keeps a `?world=0`-style off switch and the old modes untouched.

| # | Slice | Files | Own | Size | Blocked by | Acceptance |
|---|---|---|---|---|---|---|
| 1 | Overworld generator (running) | `shared/mm-overworld.js`, `REALM-UNIFIED-DESIGN.md` | C | M | - | Node: same seed same map; spawn reachable to every zone and portal; bands by distance |
| 2 | Realm menu + phone layout (running) | realm menu, CSS | C | M | - | 390x844 + desktop screenshots; Restart/Nexus buttons; 0 console errors |
| 3 | Test tiers + shards | `tests/run-all.js` (flags only) | C | S | - | `--tier smoke`, `--shard i/n`, `--live`; default run unchanged |
| 4 | Camera + world bounds hook | `realm.js` (one hook) | C | S | - | `setWorld({w,h})` + camera follow; null = byte-identical behaviour; all realm*.test.js green |
| 5 | World controller + page mode | NEW `games/mad-maze/realm-world.js`, page `?mode=world` | C | M | 1, 4 | Walk 3+ screens; collisions on generated walls; terrain drawn in code into cached chunk canvases |
| 6 | Zone spawner + interest culling | NEW `shared/mm-zones.js` (pure) + wire in 5 | C | M | 5 | Enemy tier rises with distance; only enemies within ~1.5 screens tick; Node tests for tables |
| 7 | Portals to dungeons and back | `realm-world.js`, `dungeon.js` (entry/exit callback) | C | M | 5 | Walk into portal, Warren run with seed, exit returns to the portal tile. **FIRST PLAYABLE** |
| 8 | Death and restart loop | `realm-world.js`, menu from 2, additive `world` key in `pixeltown-mm-v1` | C | S | 2, 7 | Die, menu, respawn at spawn with the Lantern hero; old saves load (fixture test) |
| 9 | Zone drops | `shared/mm-zones.js` drop tier, `MMItems` bags | C | M | 6 | Bag colour/tier by zone; soulbound per player; stash pays out |
| 10 | Minimap + quest arrow | `realm-world.js` HUD | C | S | 5 | Minimap shows zones, portals, self; arrow points to nearest event/portal |
| 11 | Art adapter by manifest id | loader in `realm-world.js` | C | M | 5 (art optional) | `tile_<t>_a..d`, `edge_00..15`, `prop_*`, `portal_*`, `bag_*` used when present, code fallback when missing (test both) |
| 12 | Phone perf pass | chunks, DPR cap, caps | C | M | 6, 11 | Headless bench: frame time budget at 390x844 with 60 enemies + 300 bullets; no per-frame Graphics redraw |
| 13 | World events | `MMEvents` wire, `event_beacon` | C | M | 6, 10 | Timed boss announced, shows on minimap, contribution-based drop |
| 14 | Entry points | hub node, town Realm Gate menu | C | S | 8 | Gate offers "Open Realm"; classic arena kept behind "Classic arena"; site-links green |
| 15 | Co-op on the map | lite party code, host-authoritative, interest radius | C + Opus review | L | 8, 12 | 2 tabs, in-memory relay (not live DB); same seed; snapshot under 24 KB at peak |

Codex in parallel (never a blocker): b10, b11, b14, b15, b12/b13, b19 (board order); art drops in by id.

**Session plan.** S1: 1, 2 (running), 3, 4. S2: 5 (+ 6's pure module in parallel). S3: 6 wire, 7 -> first playable
(walk, fight, portal, dungeon, return). S4: 8, 9, 10 -> full loop with restart and loot. S5+: 11, 12, 13, 14, then 15.
Art fallback rule: each terrain gets a code palette (base colour + 2 noise shades + darker edge line), props are
simple code shapes (circle canopy + trunk, grey rock blob), portals a rotating ring in the zone colour.

## (b) Cut or defer (until slice 10 ships)

- Campfire Jam (12 songs, concert), Stalk Market polish: frozen; bug fixes only.
- Deepdelve (furnace, mobs, Rock Wyrm), Angler tournament/medals, Bug Safari extras: frozen.
- Hub medals/Tokens/Snack Stand, Comet Trail, pets, Daily Maze/ghost/board pages: deferred.
- Labyrinth/Hedge Tide as a second portal target: after slice 9 (Warren only first).
- Duel and 2v2 stay in the classic arena; not ported to the big map.
- GPT layout pool and Codex b23/b24: deferred (seeded generator covers variety).

## (c) Risks

1. **realm.js regression.** Do not add a world mode inside the class. Add ONE hook (slice 4: world size + camera
   offset applied once at the top of draw, clamping against world size instead of `W`/`H`), default off, then put
   everything else in `realm-world.js` that drives the arena from outside, like `dungeon.js`. New pure logic goes in
   `shared/mm-*.js` with Node tests. Watch: anything that assumes screen = world (spawn edges, bullet culling,
   touch aim screen-to-world); slice 4's test covers aim with an offset camera.
2. **Netcode on a big map.** Co-op snapshots are up to 24 KB every ~60 ms, bigger ones dropped (ROADMAP risk 4).
   Send only an interest radius, in-memory relay tests only; ROADMAP risks 1-3 (open rules, seat leak) still apply.
3. **Saves.** No change to `pixeltown-save-v1.realm`; new data only as an additive `world` key in `pixeltown-mm-v1`
   via `MMProfile` sanitising. Fixture test: old v1 saves and a pre-world mm-v1 save load and play.
4. **Phone perf.** Chunk-cached terrain, DPR cap 1.5 (exists), nearby-only ticks. Unknown: real-device fps.
5. **Test runtime (~25 min reported, not measured here).** Tiers:
   - T0 (every slice, under 1 min): `node --check` on touched files + Node-only `shared-*` suites.
   - T1 smoke (every slice, target under 6 min): suites for touched pages + `realm-core`, `realm-wire`,
     `mad-maze-shell`, `mad-maze-dungeon`, `home`, `site-links`, new world suites.
   - T2 full (once per session, on the merged head only): `--shard 1/3..3/3` in parallel, each with its own port
     (run-all already picks a free port), plus ONE serial `--live` shard.
   - Lock discipline: live-DB suites (`realm-team`, `realm-duel`, `realm-2v2` at least; audit the others that mention
     Firebase: angler-page, bugoff, mad-maze-*, site-links) run only in the live shard under an atomic `mkdir` lock,
     never two at once (brief rule). Do not weaken or skip suites; tiering only changes WHEN they run.
6. **Codex lag or id drift**: slice 11 tests the fallback path, so missing art is never a failure.

## (d) Orchestrator checklist, every hour

1. :10 Pull dev; read TEAM-BOARD; merge every new `codex/*` branch (art only), register provisional, run art tests (T0).
2. :12 Launch in parallel (separate worktrees, disjoint files): one agent per slice whose files do not overlap, at most
   3 builders; pure-module halves of later slices may start early. Anything touching `realm.js` or `realm-world.js`
   runs alone (serial).
3. Each agent: T0 + T1, phone and desktop screenshots, watcher review; Opus review for `realm.js`, saves, netcode.
4. :40 Freeze. Merge order: pure modules -> `realm.js` hook -> `realm-world.js` wiring -> pages/entry points -> art
   registration -> STATUS/DAILY/TEAM-BOARD docs. Rebase, not hand-merge, if two slices touched one file.
5. :42 T2 full suite, sharded, on the merged head.
6. By :03 write `ci-status.json` with the tested sha; commit it so it is on the branch before the manager's :08 merge.
   If T2 is not finished or is red, do not stamp green. Unknown: whether the manager merges the stamped sha or the
   branch head; confirm, or keep the branch head equal to the stamped sha.
7. Post the next Codex assignment; note blockers in STATUS.

## (e) Owner questions

1. Death rule in the unified game: (a) Realm's current no-loss rule (Survivor's Cache) or (b) Mad Maze soft
   permadeath (Fall) with the Picnic no-loss toggle?
2. Should the town Realm Gate open the new big-map game by default, with the old arena kept behind a "Classic arena"
   button? (yes/no)
3. Online on the big map: (a) single-player first, invite co-op later, or (b) everyone on the map sees each other
   (more Firebase load; the free tier has a 100-connection limit)?
