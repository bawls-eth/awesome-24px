# Cycle 2, Lead Developer

Branch `cyc2-lead` (cut from `claude/animal-crossing-game-7z3roh` 2b40e79). Own server on port 9721, every browser command through
`/tmp/bt.sh`, database blocked (no Town page was opened this cycle; the standalone pages make no database request and every
WebSocket is closed in the new tests). Targeted tests only; the full suite and the live-class tests were NOT run here. Nothing pushed.

## 1. L-13: D's module decisions

| module | done | proof that nothing loads it |
|---|---|---|
| `mm-board.js`, `mm-events.js`, `mm-pets.js`, `mm-wilds.js` | removed | grep of `game/` and `tools/` for the file name and the global (`MMBoard`, `MMEvents`, `MMPets`, `MMWilds`): only their own tests and design notes. No HTML page, no script, no save key, nothing in `mm-backup.js` or `SAVE-KEYS.md` (so Backup and the key list needed no change). |
| their tests | `shared-mm-pets.test.js` removed (its tier entry too). Mixed files keep the rest: `shared-mm-daily-ghost-board-access` 28 -> 21 checks (7 board checks gone), `shared-mm-events-bounties` 24 -> 7 (17 events checks gone), `shared-mm-island-wilds` 20 -> 8 (12 wilds checks gone; the `MMIsland` half stays). | |
| guard | new `shared-removed-modules.test.js` (node, smoke): the 4 files are gone, no `.js` / `.html` / `.json` under `game/` names them or their globals, the 5 kept modules are still there. | |
| `STATUS.md` | the module list and two next-step lines updated. | |

Open after this: `mm-island.js` is now used by nothing but its own test (it was only loaded by `mm-wilds`). D gave no decision for it; left in place.

### mm-bounties (ID-18): NOT wired. Spec for U and S instead
It is not "a card". Read from the code:
- `MMBounties.POOL` is 8 Realm tasks (`kill:puffcap`, `clear:sunkenLantern:noSnack`, `eventBoss`, ...). None can happen in the Town, and five
  name things that do not exist in any shipped mode. A Town card needs a new pool.
- The reward is `{ fame, petTreat }`. Neither exists. D asks for Town coins, so the reward shape changes (the test pins `fame 10-40` and `petTreat === 1`).
- Progress needs a place in the save: one additive key in `pixeltown-save-v1` plus a line in `mm-backup.js` TOWN_FIELDS and `SAVE-KEYS.md`.
- The card needs a home in the Town HUD that U just cleared (U-01), on a 390 px phone as well.
- ID-09 (the chore card) is the same idea and is waiting on the owner's streak decision; ID-18 is still `proposed`. Two daily cards must not both ship.

Spec (small, in this order):
1. **Module (S)**: `MMBounties.forDate(date, salt, pool)` takes an optional pool (default = today's POOL, so nothing changes), and
   `TOWN_POOL` = `shake-tree` (goal 5, event `town:shake`), `catch-bug` (3, `town:bug`), `wave` (2, `town:wave`), `fish` (2, `town:fish`),
   `dig-fossil` (1, `town:fossil`), `water-flower` (3, `town:water`). Reward `{ coins }` 20-60 in steps of 10, seeded. No streak, no timer words
   (the existing "no streak/urgency keys" check must cover the new pool).
2. **Save (S)**: `save.bounty = { d: 'YYYY-MM-DD', s: { <id>: [count, claimed 0|1] } }`, dropped when `d` is not today. Cleaned on load
   (unknown ids dropped, counts clamped to the goal). Add `bounty` to TOWN_FIELDS and SAVE-KEYS.md. The day key must come from the
   one game-day helper (section 2), not from a new `toISOString()` call.
3. **Hooks (S)**: one `this.bountyEvent('town:shake')` line in the six existing success paths in `main.js` (after the item is granted, never on a
   cooldown refusal).
4. **Card (U)**: not a permanent HUD block. A row in the existing phone/quest panel ("Today: Shake 5 trees 3/5 - 40 coins", a Claim button
   when done), plus the existing toast when a task completes. Text and number, never colour alone; at 390 px one line per task.
5. **Tests**: node (pool, determinism, clean, claim once), Town offline-stub browser test (three tasks shown, a real tree shake moves 0/5 to
   1/5, claim pays once, reload keeps it, next day replaces it, `db.attempts() === 0`), save round trip through Backup.

## 2. Clock and date scan (beyond the Town fixes of cycles 0 and 1)

### Fixed
**Angler: a tournament open at midnight locked the lake.** Every tournament call used "today". When the calendar day turned while a
run was open (the page left open, or a late evening round), the run's day no longer matched: `takeCast` refused ("No casts left in the
tournament."), `finish` returned nothing, `g.tour` stayed true, so the other spots and all normal fishing stayed locked until a reload,
and a 5th cast thrown before midnight never produced a result. Now a running tournament belongs to the day it was started
(`tourDay()`): same spot, same seeded casts and score, it ends normally, counts for its own day, and the new day's tournament can be
started straight after (streak 2 for yesterday then today). No save change.
Test `angler-tournament-midnight.test.js`: the real device date faked with `page.clock.setFixedTime`, time zones UTC,
America/Los_Angeles, Pacific/Kiritimati (UTC+14), each from 23:59:30 to 00:00:30 local, and New Year in Asia/Tokyo with a cast in
flight: 40 checks. On the old code the first zone fails at the third cast (`{"used":2,"wait":-1,"state":"idle"}`) and the script stops there.

### Listed, not changed (each needs the L-08 rule first, or is by design)
| where | reads | day rule today | note |
|---|---|---|---|
| Town `setupLoginStreak`, `updateSellStreak`, `talkToVillager` (main.js 3155, 4897, 9036) | `toISOString().slice(0,10)` | UTC | a player in UTC-8 gets "tomorrow" at 16:00 local |
| Town `merchantDayBucket`, `questDayBucket` (8429, 8591) | `floor(Date.now() / 86400000)` | UTC | same day as the streaks, by a second formula |
| Town `concertWindowKey` (9420), `isConcertTime`, `villagerIsAsleep`, `isNpcNightHour`, day/night, fish by hour | `getHours()`, local y-m-d | local | a different day from the streak on the same screen for 8 to 14 hours a day, depending on the zone |
| Town UTC hour windows (8598) | `getUTCHours()` | UTC, shown in local time | fixed in cycle 0 |
| Angler tournament day, forecast, month/hour conditions, Hall date | local y/m/d (`dayNumber`), `getMonth`, `getHours` | local | "same fish for every angler" is per local date, so two zones overlap only part of the day |
| Angler tournament streak (`mm-angler-depth` `finish`) | `last === day - 1` | local | same weakness L-07 fixed in the Town: a clock that was ahead once resets the streak to 1; a clock moved forward a day at a time farms it. Display and badges only, no currency. Not changed (owner decides the fate of streaks with L-08) |
| Stalk Market `weekNumber`, `slotOf` | local date, local noon | local, Sunday week | already guards a clock set back (`clockBack`, `slotBack`); DST safe (calendar fields, not hours) |
| Isles `DAY` (isles.js 1966) | `toISOString()` once at page load | UTC, frozen for the visit | a tab left open over 00:00 UTC keeps yesterday's gather spots, spark and glint budgets until reload; nothing is lost or paid twice. By design a visit is one day; noted for L-08 |
| Isles tame date, Mad Maze daily (`MMDaily.dateKey`), Realm quests (`realm-world.js` 45), Lantern, Hub gift, Realm vendor ISO week | UTC | UTC | consistent with each other |
| arcade `newSeed()` x4, saves `made`, feedback ids | `Date.now()` | none | not a day rule |

### L-08 proposal: one game-day rule (owner decision; nothing here is built)
Today three rules live side by side: UTC date (Town streaks, quests, merchant, Isles, Realm, Mad Maze daily), local date (Angler, Stalk,
Town concert, villagers, day/night) and UTC day number by division (merchant, Town quests). On one Town screen the streak can say
"tomorrow" while the villagers say "this evening".

Recommended rule: **the game day is the player's local calendar date, and it turns at 04:00 local time.**
- One helper, one file: `shared/mm-gameday.js` with `key(now)` -> `'YYYY-MM-DD'`, `number(now)` -> integer day (the date's UTC-midnight
  day number, so two dates differ by exactly the days between them), `week(now)` (Sunday start, as Stalk has now), `slot(now)` (am / pm), and
  `msToNext(now)`. Built from calendar fields of `now - 4 h` (`getFullYear / getMonth / getDate`), never from hour arithmetic, so a DST
  change cannot make a 23 or 25 hour day skip or repeat a date.
- Why local: every cozy "daily" a player sees (login gift, tournament, market week, villagers asleep) follows their own evening and
  morning. UTC is only "fair" for a global leaderboard, and there is none (mm-board was removed this cycle; rules forbid the write path).
- Why 04:00 and not midnight: a round played at 23:50 and finished at 00:10 is one evening. It removes the whole class of the Angler bug
  above for ordinary play (the fix stays: a run still belongs to its start day).
- Seeded content that must be "the same for everyone" (tournament casts, Mad Maze daily maze, Realm quests) stays seeded by the day
  KEY. Players in different zones then share a seed for the hours their dates overlap, which is what Angler already does.
- Clock safety, once, in the helper's callers: the L-07 rule (`streakStep`) moves next to it and is used by every streak
  (Town login, Town sell, Angler tournament) instead of three copies.
- Migration, additive only: stored keys keep their `'YYYY-MM-DD'` shape. On the first load after the change a stored UTC date can
  differ from the local game date by one day; treat "stored date = today or yesterday" on that first load as "already counted today"
  (no double gift, no lost streak), then write the new key. Day NUMBERS (Angler `tour.last`, Stalk `week`) keep their meaning: they are
  already local.
- Order of work if approved: (1) helper + node tests over 40 zones, DST edges (Lord Howe 30 min, Chatham 45 min, Samoa's skipped day),
  years 2026-2028; (2) Town (5 call sites), with the first-load test; (3) Isles `DAY` (read per action, not once per page);
  (4) Realm / Mad Maze / Lantern / gift (UTC -> helper); (5) Angler and Stalk switch from midnight to 04:00 with a first-load test.
  Each step is one commit with its own test; no step changes a save shape.
- Cheaper alternative if the owner prefers no behaviour change for most modes: keep local midnight (Angler, Stalk already there) and
  only move the UTC users over. It fixes the mismatch but keeps the midnight edge.
- What the owner has to decide: local vs UTC; 04:00 vs midnight; whether the Town and Angler streaks stay at all (IDEAS hard limit
  "no streaks across days", ID-09).

## 3. Hot path: Deepdelve and Isles
Measured with the browser's sampling heap profiler over CDP (`HeapProfiler.startSampling`, 128 byte interval, objects already
collected included): real allocated bytes by function. Counts and bytes only; no millisecond claims (shared machine).

### Deepdelve (fixed)
| what | before | after |
|---|---|---|
| one `raycast(5)` (once a frame while the view moves, twice while mining) | 11,930 B (2000 calls). Of it 7.7 KB were `'cx,cy,cz'` key strings built by `MMChunks.getBlock` for each of the 126 steps, 4.2 KB the per-step arrays | 41 B |
| idle frame, all of `deepdelve.js` (240 frames, two benches placed) | 1,393 B/frame | 741 B/frame |
| `renderIfChanged` key | 689 B/frame (a string of 13 numbers) | 79 B/frame (13 numbers compared in a kept Float64Array) |
| `syncBenches` | 240 `map` + 720 `join` in 240 frames | 0 + 0 (compared against a flat kept copy) |

- `mm-chunks.js`: `getChunk` keeps the last chunk asked for (forgotten on `unloadChunk` and `load()`), so repeated reads in one chunk build no key.
  This also serves the walk physics and the mob code, which read blocks the same way.
- `deepdelve.js`: `raycast` on plain numbers (two small arrays only for a hit), bench signature and render key without strings.
- Tests: `deepdelve-frame-alloc.test.js` (browser; oracle = the old raycast against the new one in 3000 poses, 2381 hits of which 2034
  start inside a block, 619 misses: 0 differences; byte limits; idle frames still not redrawn: 8 pictures in 240 frames; turning,
  moving, adding, moving and removing a bench each redraw). Red before: 3 checks (ray bytes, map/join, key bytes).
  `shared-mm-chunks-last-chunk.test.js` (node; 1000 reads in one chunk: 1000 -> 0 map lookups; 20000 mixed reads and 400 edits equal to a
  world that never repeats a chunk; `load()` and `unloadChunk()` never serve the old chunk). Red before: 1 check.
- Left: `updateCamera` about 334 B/frame and `playerChunk` about 124 B/frame (an object and a key string per frame), `depthNow`,
  the governor's average. Chunk streaming (`mesh`, `getChunk` generation) is the large cost while moving and was not touched.

### Isles (already lean; one small fix)
- Whole frame: 3,011 B/frame idle (300 frames) and 2,545 B/frame walking in a square with the fire key down (600 frames). Per frame:
  0 `getElementById`, 0 `querySelector`, 0 layout reads (`getBoundingClientRect`, `offset*`, `client*`), 0 `matchMedia`, 0 storage reads;
  the HUD writes at 5 Hz. The largest single functions: `render` about 500 B, `drawNodes` about 230 B, `stepCreatures` 180 to 300 B.
- Fixed: `stepCreatures` built a closure and called `creatures.some(...)` on every frame. Now a plain scan with one shared predicate.
  `Array.prototype.some` in 120 frames: 128 -> 8 (the 8 are the 2 Hz hint check). Test `isles-frame-some.test.js`.
- Seen, not changed: the cycle 1 hit flash builds `Object.assign({}, strip, { src })` per flashed creature per frame, only during the
  0.12 s flash. `chunkCanvas` and `bakeNode` are caches filling (one-off).

## 4. Review of the cycle 1 merges (86eda4b..2b40e79)
Read: `mm-danger.js`, the danger hook in `realm-world.js`, `mm-quests.js` (ID-03), the Isles hit flash and wall-slide steering, the
Town weed rings, the bag bar, the building finish entry point, L-18 in `realm.js`.
- **ID-02 danger meter, checked by numbers**: for 6 seeds, wide (default) and classic bands, all 217,119 land tiles each: the area level
  from the tile's difficulty always lies inside its zone's range (rec level of the zone .. rec level of the next): 0 tiles below, 0 above.
  The meter cannot say "Lv 5 area" on a Shore tile. Limit seen: `world.bands` can be `'pack'` (biome packs), which the meter would read
  as classic; no page generates a pack world today, so nothing to fix now. A note for whoever wires packs.
- **ID-03**: only the number changes; quest ids, rolls and claim state are untouched. No bug found.
- **Hit flash**: the white copy is cached per source (WeakMap), drawn with the same geometry and flip; the circle fallback still runs
  when no silhouette was drawn. No bug found (the small allocation above).
- **Steering**: deterministic, falls back to the straight aim when boxed in, `?slide=0` keeps the old path. No bug found.
- **Weed rings, bag bar**: the observer watches text and child changes only and `paint` writes classes and a style property, so it
  cannot feed itself. No bug found.
- Not reviewed in depth (time box): the tree canopy overlay and the field detail bake in `realm-world.js`, the pixel maths of
  `finishBakedTexture`, U's CSS.
No bug was found in the reviewed parts, so there is no fix and no new test under this item.

## Tests run here (all green on the final tree unless noted)
New: `shared-removed-modules`, `angler-tournament-midnight`, `deepdelve-frame-alloc`, `shared-mm-chunks-last-chunk`, `isles-frame-some`.
Regression: see the final message for the exact list. `run-all-tiers.test.js` and `live-safety.test.js` green.

## Unresolved / for the coordinator
- Live-class tests and the full suite were not run here.
- ID-18 is a spec, not code (section 1). `mm-island.js` has no user left.
- L-08 is a proposal only. The Angler streak has the L-07 weakness (section 2).
- Deepdelve `updateCamera` / `playerChunk` per-frame leftovers; the hit flash `Object.assign`.
- No screenshots: nothing in this cycle changes what is drawn (Deepdelve redraw behaviour is pinned by the draw-count checks).
