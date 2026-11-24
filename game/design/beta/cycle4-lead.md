# Cycle 4, Lead Developer

Branch `cyc4-lead` (cut from `claude/animal-crossing-game-7z3roh` 385efc3). Own server on port 9741, every browser command through
`/tmp/bt.sh`, database blocked (Town tests: `offlineStub`, `db.attempts() === 0`; Realm tests: `blockDb`). Targeted tests only: the
full suite and the live-class tests were NOT run here. Nothing pushed. The box was heavily loaded for the whole cycle (load average
17 to 25 on 4 cores, load factor 4.4 to 5.8 in `lib/load-scale.js`): every browser run waited minutes for a `/tmp/bt.sh` slot.

## 1. Test hygiene: the time sweep

### The tool: `game/design/beta/tools/time-sweep.js` (+ `time-sweep-preload.js`)
Runs a set of tests as if they were started at several UTC instants (and, with `--tz`, time zones) and reports every test whose
result changes with the clock. How: `node --require time-sweep-preload.js <test>` with `TIME_SWEEP_AT=<ISO instant>`. The preload
shifts `Date` in the test process and (through a wrapped `chromium.launch` / `newContext`, one `addInitScript`) in every page the test
opens, by the same offset. The clock keeps running, so timers and `performance.now()` are untouched; a test that installs its own
clock (`page.clock`, `?today=`) still wins. Live-class tests are never run by the tool (they join the real town).

```
node game/design/beta/tools/time-sweep.js --port 9741 --wrap /tmp/bt.sh --jobs 3 --max-secs 22      # the default grep and clocks
node game/design/beta/tools/time-sweep.js --port 9741 --files town-offline,ftue-ft2 --times 2026-11-25T03:20:00Z,2026-11-28T19:40:00Z
node game/design/beta/tools/time-sweep.js --port 9741 --list                                         # what would run
```
Default selection: browser-class tests whose source matches
`getHours|getUTCHours|merchant|bugoff|bug-off|tourney|fish|streak|daily|dailies|weed|mailbox|new Date|Date.now|clock`, at most
`--max-secs` by `.timings.json`. Default clocks: now, 03:20, 06:10, 13:30 and 19:40 UTC on a Wednesday, a Saturday, 23:59:40 UTC
(a test that crosses midnight), 31 December, 29 February 2028. Exit code 1 when anything changes or fails; `--json` keeps every run.

### Sweep 1: 70 tests x 5 clocks = 350 runs
Clocks: 2026-11-25 03:20 UTC (night: villagers asleep, shops' hour windows closed), 2026-11-28 19:40 (a Saturday, concert hours),
2026-11-26 23:59:40 (the test crosses midnight UTC), 2026-12-31 13:30, 2028-02-29 06:10. Tests: the default grep, browser class, at
most 22 s by the last stamp's timings (Town, Realm world, Angler, Stalk Market, Jam, Lantern, Deepdelve day/night, hub).
- 306 runs passed. 57 tests passed at all 5 clocks in this run.
- 5 runs failed for load (4 tests, see the table; the fifth, `town-concert-once` at Saturday 19:40, was killed by the tool's 300 s
  limit while it waited in the `/tmp/bt.sh` queue: run again alone at the same clock it passes, 8 checks).
- 39 runs (9 `world-*` tests) were lost: my static server was stopped by the 30 minute background limit of this session
  (`ERR_CONNECTION_REFUSED`). All 9 were swept again at the same 5 clocks: 45 runs, 45 passed.
So: 70 tests, each green at all 5 clocks once load is taken out. The tool now runs a failed run once more alone and lists
"passed on retry" apart, so a busy box no longer reads as a clock dependence.

### Sweep 2 (longer Town / clock tests, night and Saturday evening): 6 tests x 2 clocks = 12 runs
`town-cooldown-clock`, `town-offline`, `town-8bit-menu`, `r4-d2-art`, `beta-s01-town-restore`, `ftue-ft2` at 03:20 and Saturday
19:40 UTC: 11 passed, 1 (`ftue-ft2` at 19:40, a `TimeoutError` after 91 s) passed when the tool ran it again alone (119 s). No
change with the clock. A first attempt at 11 tests died with the server after 3 runs (`beta-r4-replay-doors` both clocks and
`beta-r4-replay-town` at 03:20 passed); `beta-s02-town-two-tabs`, `world-nexus`, `cyc3-isles-day-roll` and
`beta-r4-replay-town` at 19:40 were NOT swept.

### What the sweeps found, and the fixes
No test changed its result because of the hour or the date. Every failure was machine speed (the sweep itself loads the box,
which is a fair stand-in for a 4-shard stamp): a fixed budget or a fixed wait that only holds on an idle box.

| test | failure under load | fix (no check weakened: the factor is exactly 1 on an idle box) |
|---|---|---|
| `cyc2-art-town-label-icons` | `one-off create cost < 60 ms`: 71.9 ms | `LS.budget(60)` |
| `cyc3-art-town-label-icons` | same check, 80 ms budget (same code path, not yet red) | `LS.budget(80)` |
| `beta-s04-coop-save` | `TimeoutError`: the 30 s wait for the Realm world page (two pages load at once) | the three page-load waits are `LS.budget(30000)` / `LS.budget(15000)` |
| `net-hostile-presence` | `the game loop keeps running afterwards`: 6 and 8 frames in a fixed 1.5 s, needs 10 | the window is `LS.budget(1500)` ms, still 10 frames |

Each of the four was run again after the fix under the same load (factor 4.4 to 5.8) and passed: `cyc2-art-town-label-icons` 13,
`cyc3-art-town-label-icons` 13, `beta-s04-coop-save` 14, `net-hostile-presence` 18 checks.

The known earlier cases (merchant sign, hero-pick budget) were already fixed in cycle 3 and stay green at every clock here
(`cyc3-art-town-label-icons`, `r4-d2-art`). `town-first-ten` pins its own date and passed at all 5 clocks.

Seen, not changed: `town-first-ten` (and `first-ten-minutes`, `isles-first-ten`) rewrite the tracked file
`game/design/ftue-metrics.json` with machine-speed numbers on every run (join 392 ms -> 1628 ms under load), so the tree is dirty
after any run that includes them. I restored the file (`git checkout`); it is not in this branch's diff.

### Not swept (cannot be, here)
- The live-class tests (`weeds`, `mailbox`, `dailies`, `bugoff`, `fishlog`, `birthdays`, `home`, `integration`, ...): they join the
  real town, and the database is blocked in this cycle. Read instead: `weeds.test.js` uses the game's own day (`weedDay`,
  `weedSpotsForDay`), and its day-dependent claims (20 or more weeds a day, each weed is the one E pulls) are already proven for 366
  days offline by `beta-r4-weed-reach`. A live test that is started seconds before 00:00 UTC still crosses a day inside the test.
  To sweep them, run the tool against a local Firebase emulator or under the live lock on an owner-approved run:
  `--class live` is refused on purpose.
- Tests over 40 s (`isles-first-ten` 65 s, `town-postcards` 101 s, `aquarium` 73 s): time box.

## 2. Review of the cycle 3 merges (`git diff 031b83b..HEAD`)

### Bug found and fixed
| where | bug | fix | test (red before -> green) |
|---|---|---|---|
| ID-13 first-kill bag floor, `realm-world.js` boss kill | The floor is "once per hero per zone" (save bitmask `zk`). The kill read the bit only from this page's memory. A second tab opened before the first kill has `zk = 0` in memory, so the same hero got the floored bag again, once per open tab. The write merged the bit, but only after the bag had dropped. | The boss kill reads the stored bit first (`readSave().zk`, one read per boss kill) and joins it into memory. | `cyc4-zk-stale-tab` (browser, Realm world, blockDb): 9 checks, 1 red before (`{"z":1,"fk":true}`). Also pins: a zone nobody cleared still gets its floor on the stale tab, both bits end up stored, a hostile stored `zk` (-1) is not read as "all four zones spent". |

### Checked, no bug
- **`zk` and `-1 & 15`.** Both sides of the merge go through `cleanSave` (`Number.isInteger`, 1..15) before any bit operation: the
  in-memory save at load, the stored copy in `mergeStored`. A stored -1, 99, "7", 2.5, null or an object leaves the key out.
- **ID-12 errands.** Town: `saveErrand` only steps forward (`a.s > b.s ? a : b` inside `writeSaveMerged`); `errandTalk` reads the
  stored errand on every talk, so a stale second tab sees `carry` and cannot spend the 3 wood twice. Realm: `errand` is merged as a
  union (`p`, then `d` only with `p`) before the seed check, so a new island keeps it. A page without `MMErrands` keeps the value as
  it is. The lantern is derived from `s: 2`, nothing to lose. Backup: both fields live inside existing save keys. Not fixed, small:
  with storage that refuses writes the wood is spent and the offer comes back (nothing persists in that state anyway).
- **Shore XP fade.** `e.zone` is reset to `undefined` in the pool reset, the fade needs `e.zone === 0`, arena enemies never have a
  zone. Level 1 to 4 = 1.
- **Hit pause.** Draw only: `_update` and `_camStep` run every frame; the frame of the hit is drawn (`now > _hitPauseAt` is false on
  that frame), then at most 50 ms are held. Off under reduce motion. Repeated big hits each draw their own frame, so the screen
  cannot freeze.
- **Bond hearts.** `bondGain` clamps the stored session count to the cap before adding; `hearts` / `perks` clamp bond to 1..10.
  (`perks` allocation fixed in section 3.)
- **Reforge cost / TOUGH_GAP.** The cost is computed from the item tier when the forge lists the rolls; no save holds a cost.
- **Death dissolve.** One scratch canvas and 17 patterns built once (Realm and Isles); per ghost: clear, draw, fill, drawImage.
  No object per frame. The Isles kit is rebuilt only when a larger body needs it. Realm: the scratch is 256 px with the feet at
  y = 200: a body drawn taller than 200 px would be cut at the top. With `k = 2.8 * r / 130` that needs a radius far above the
  arena boss (r 34); not measured for the largest world boss: G should look once.
- **Nexus life.** Only while the plaza is open; frame lists are rebuilt on bake, not per frame.
- **Inner corners.** Bake time only (per chunk).
- **Isles wall turn (default on).** Dead end (all six turns blocked): the velocity is left alone and the old bounce takes over, no
  flip-flop; `c.wslide` only remembers the preferred side. Costs one small array and one closure per wandering creature per think
  (10 Hz): 18 + 14 B/frame in the profile. The stale "OPT-IN for now" comment is corrected.
- **mm-gameday adoption.** Unchanged since cycle 3 (Angler, Isles); the Town still has its own copy of the streak rule (L-08 open).

## 3. Hot path (sampling heap profiler over CDP, 128 byte interval, collected objects included; bytes only)

### Town (`main.js` update), standing still, 972 objects
| what | before | after |
|---|---|---|
| everything, Phaser included | 163.8 KB/frame (Phaser 135 KB: depth sort, sprite batching) | not re-measured as a total |
| `main.js` in all | 18261 to 19039 B/frame | 9026 B/frame |
| `cullOffscreen` (every 4th frame) | 14183 to 14612 B/frame (with the size getters 16785 to 17308) | 4990 to 5129 B/frame (5757 to 5930) |
| `MMTownHeroes.frameName` | 1348 B/frame: a string concatenation per hero sprite per frame | 0 (a table filled on first use) |

**Why the cull was expensive.** Reading `o.x` / `o.y` off ~970 objects of many shapes returns a fresh boxed number for every read
(measured: a loop that only reads x and y on every frame is 20.4 KB/frame), plus the `displayWidth` / `displayHeight` getters.
**Fix.** Each object remembers its box as four whole numbers (`_cl _ct _cr _cb`, floor / ceil: the box only grows, so nothing is
culled that was not culled before). A box that was the same on 3 passes in a row is settled and measured again only every 8th
pass, staggered over the list. Sprites (players, villagers, animals) are measured on every pass as before. `uncull()` (the pooled
object path) and a hidden object forget the box; a forced or first pass (`_cullAt` null) measures everything. A settled object
that starts to move is seen within 8 passes (32 frames); the 320 px margin covers that. 283 of 972 objects are measured per pass
(was about 800).
**Known limit (not fixed, by the numbers, not seen):** the 8 passes are counted in frames, not time. A settled, culled thing that
is not a Sprite and starts moving from rest (the name label of a remote player who stood still just outside the margin and then
walks into view) is drawn after at most 32 frames: 0.53 s at 60 fps, 1.07 s at 30 fps, 2.1 s at 15 fps. Crossing the 320 px margin
at about 200 px/s takes 1.6 s, so at 20 fps or more nothing can show late; below that a name label can appear up to
(32 / fps - 1.6) s after its sprite at the screen edge. The sprite itself is never late. If it is ever seen: measure Text on every
pass as well (90 objects, about +1.3 KB/frame), or count the 8 passes in time.
Test `cyc4-town-cull-alloc` (browser, Town, offlineStub): 20 checks, 11 red before. It proves the bytes, that every cull bit equals
a fresh evaluation of the OLD rule (word for word) standing and after three walks (794 to 797 objects each), that nothing in view
is culled in the running game, and the move cases (settled image seen within 8 passes; at once after `uncull()` and on a forced
pass; a Sprite on the next ordinary pass; a hidden object forgets its box). `beta-s07-town-cull` still passes (12 checks).
Test `cyc4-hero-frame-names` (node): 3 checks, 1 red before (3.99 MB for 300000 calls -> 10 KB); same names as the old expression
for 40000 random inputs.

Left in the Town: `updateVillagers` (about 1.2 KB/frame: a `Date`, a key string and a closure per frame, chained setters per
villager), an anonymous `forEach` at main.js ~6800 (1.0 KB/frame), about 130 objects whose box changes on every pass and so never
settle (not identified: clouds and tweened things are the guess). Phaser's own 135 KB/frame is the real cost and is not ours.

### Isles (`isles.js` update / draw), seed 123, idle, no party
1946 B/frame in all (cycle 2: 2.5 to 3.0 KB): `render` 624, `drawNodes` 227 + `bakeNode` 223 (no object, array or string in either:
boxed numbers), a Map `set` 133, `drawArena` 68, `update` 60. No per-frame object, array or closure was found in the idle frame.
One cycle 3 regression with a party: `MMTames.perks` built a new `{sway, ribbon, glow}` object three times per companion per frame
(sway, glow, ribbon). Now one frozen object per bond level. Test `cyc4-tames-perks-shared` (node): 5 checks, 3 red before; same
flags as the cycle 3 rule for 30 inputs. Not fixed: during a hit flash (0.12 s) the draw copies the strip object
(`Object.assign({}, st, ...)`) once per flashing creature per frame.

## Tests
New: `cyc4-town-cull-alloc` 20, `cyc4-zk-stale-tab` 9, `cyc4-tames-perks-shared` 5, `cyc4-hero-frame-names` 3 (37 checks), all in
`test-tiers.json` (the two node tests in the smoke tier). Regression run here, green on the final product code: `beta-s07-town-cull` 12, `town-perf` 20,
`town-hint-lookups` 16, `cyc3-bond-hearts` 17, `cyc3-first-kill-zk` 12, `shared-mm-town-heroes` (node), `run-all-tiers` 49,
`live-safety` 14, and the four load-scaled tests above. Red-before proof: the two browser tests were run against the cycle 3
product files (11 of 20 and 1 of 9 red), the two node tests against the cycle 3 modules (3 of 5 and 1 of 3 red).

## Unresolved / for the coordinator
- The full suite and the live-class tests were not run here. The live-class tests cannot be time-swept without the database.
- Not swept: tests over 40 s, and the four runs named in sweep 2.
- Town cull: the low frame rate limit described in section 3 (a remote player's name label up to (32 / fps - 1.6) s late below
  20 fps). By the numbers only; not reproduced.
- Town hot path left: `updateVillagers` (about 1.2 KB/frame), the ~130 objects that never settle, Phaser's own 135 KB/frame.
- Isles: the hit-flash strip copy; nothing else found in the idle frame (1946 B/frame).
- Realm death dissolve scratch (256 px, feet at y 200) for the largest world boss: G to look once.
- `ftue-metrics.json` is rewritten by three tests on every run: decide whether tests should write a tracked file at all.
- The time-sweep tool's per-run limit includes the wait in the `--wrap` queue; on a busy box give it `--jobs 1` or expect retries.
- No screenshots: nothing in this cycle changes what is drawn.
- L-08 (game-day rule) is still the owner's decision.
