# Next slices 5: 20 slices in 4 waves (shared minigame kit, minigame depth, m01-m08 art wiring, new genres, NS4 carry-overs, QA gates)

Planner, 2026-11-22 (read-only pass after the mini-game fun pass, suite 341/341 on `789b246`). This file supersedes the open parts of `NEXT-SLICES-4.md`.
Research companion: `RESEARCH-MINIGAMES.md` (findings 1-40; the ideas below quote its numbers).

Rules are unchanged from AGENTS.md and NEXT-SLICES-4:
- One slice = one branch, and logic goes in pure `shared/` modules.
- Run `node game/tests/run-all.js` on port 8440 before asking for a merge. Append every new test to `tests/test-tiers.json`.
- Browser tests use `blockDb` and assert 0 DB requests and 0 sockets. Town tests run as `ADMIN*` with **Play offline**.
- No chat and no live-DB writes. The `net.js` / `firebase-config.js` diffs stay empty. Saves are additive only (`pixeltown-save-v1` backward compatible).
- Original art only, and every asset keeps its code fallback. Never weaken a test; `knownIssues` only tighten.
- **No guilt mechanics:** no streaks across days, no "you missed", no expiring rewards, no countdowns outside a round, no money, no loot boxes.
- New minigame keys follow the existing form: `pixeltown-<game>-v1` for the game save, `pixeltown-medals-<game>-v1` = `{"v":1,"m":[...]}` for the Hub (one writer per key).

## 0. State checked in the tree

**Done from NEXT-SLICES-4** (a test or module exists): IF1, QS1, RE1, AC1, TD1, AW4, RE2, DV1, CZ1, PI2, RE3. AW5 is partly done: b40a-c are wired, but `shared/mm-item-art.js` and the b41 rider lookup are missing.

**Still open from NEXT-SLICES-4:**
- NV1 (no `tests/nav-p2-fixes.test.js`), CO4, TN3 (the `main.js:4276-4284` "🔥 Day N streak!" is still there), QS2, HM1;
- the AW5 remainder, RE4, AC2, QS3.

**Mini games** (12 PLACES in `shared/mm-nav.js:42`, with Pop and Dash already added):
- Every game has combos, a PB, one-tap restart and medals.
- Seeds: Pop, Dash and Deepdelve show them. Jam, Bugs, Angler and Stalk do not.
- Access: `lantern.js` has no `MMSideAccess`. Jam has no medals summary key (the Hub derives it, which is fine).
- The result panels are built separately in each game.
- Art: Angler, Jam, Stalk, Bugs and Deepdelve draw almost no sprites (ART-AUDIT-3), and the m01-m08 batches are posted but not delivered.
- Two more arcade games are being built now. This plan calls them **Arcade #9 / #10**, and Claude confirms their ids before AX1.

## 1. Serial resources (at most one slice per key per wave)

| key | files |
|---|---|
| RJ | `game/realm.js` + `realm-ui.css` |
| RW | `games/mad-maze/realm-world.js` |
| DJ | `games/mad-maze/dungeon.js` |
| MM | `games/mad-maze/mad-maze.js` + its `index.html` / css |
| MN | `game/main.js` + `game/index.html` (Town) |
| IS | `games/isles/*` |
| AR | `assets/arcane/INDEX.json` + `shared/mm-creature-strips.js` + `shared/mm-isle-art.js` + NEW `shared/mm-mini-art.js` |
| REG | `shared/mm-nav.js` PLACES + `hub/*` + `tests/fixtures/smoke-journey.json` (every new game registers through this key) |

Soft (one owner per wave): each `games/<folder>/*`, `shared/mm-minikit.js` (new), `shared/mm-endgame.js`, `shared/mm-jam.js`, `shared/mm-bugs.js`.
Merge order per wave: pure modules → RJ/RW/DJ → MM → IS → MN → REG → game folders → art → tests and docs.
Opus review: NV1, TN3, AX1, HM1, NG2.

**Art slices are arrival-driven.** If a batch has not arrived, the slice takes the next delivered batch in the CODEX-MINIGAME-ART-ASKS order: m02 > m03 > m07 > m08 > m01 > m04 > m05 > m06. If nothing has arrived, the slice is skipped and the code drawing stays.

---

## Wave 1: shared kit, first art, nav P2s, Jam depth, QA gates

| id | title | files | size | key | depends | prio |
|---|---|---|---|---|---|---|
| MK1 | Shared minigame result kit (pure) | NEW `shared/mm-minikit.js` (`MMMiniKit`: `result(vm)` builds the result view model, `pbDelta`, honest `nearMiss` text, `nextGoal(medals)`, `seedCode` / `parseSeedCode` (A-Z0-9, 24 chars or fewer), `assist` flags; plus a DOM `panel(el, vm)` that uses only `textContent` and puts Play again first, R / Enter keys), NEW `tests/shared-mm-minikit.test.js` | M | minikit | none | P1 |
| AW6 | Wire m02 Angler fish (on arrival) | NEW `shared/mm-mini-art.js` (`MMMiniArt.load(batch)`: an id → image map, smoothing off, missing id → null), `games/angler/*` (reel + journal draw by id; `?art=0`), `assets/arcane/INDEX.json` (provisional), NEW `tests/mini-art-angler.test.js` | M | AR, angler | none | P1 |
| NV1 | Nav and feedback P2s (carried over) | as NEXT-SLICES-4 NV1: `shared/mm-nav.js` (N1), MN (N2, N3, P1x), `shared/mm-feedback.js` (F1), `hub/gift.js` (H1), `tools/feedback-triage/triage.js` (R1), NEW `tests/nav-p2-fixes.test.js` | M | MN, REG | none | P1 |
| JM5 | Jam: section practice, one-lane assist, seed shown | `games/jam/*`, `shared/mm-jam.js` (additive: `sectionOf(chart, bar, len)`, `foldLanes(chart, n)`), result through `MMMiniKit.panel`, NEW `tests/jam-depth5.test.js` | M | jam, mm-jam | MK1 (merge after) | P2 |
| QS2 | QA gates: perf on every page + endgame sim + isles save fuzz (QS2 + RE4 + QS3 carried over) | NEW `tests/perf-all-pages.test.js` + `tests/fixtures/perf-baselines.json` (all 12 PLACES, low tier, 4x CDP throttle, 390x844); NEW `tests/endgame-sim.test.js` (RE4 bounds); NEW `tests/isles-save-fuzz.test.js` (QS3 invariants); `shared/mm-endgame.js` tuning constants only | L | mm-endgame | none | P2 |

**Acceptance**
- **MK1:**
  - Pure tests cover: PB delta (+N, new best, equal); `nearMiss` only when within 10% and true; `nextGoal` returns the first unearned medal.
  - The seed code round-trips, and `parseSeedCode` rejects anything over 24 chars or outside A-Z0-9.
  - A jsdom-free DOM stub shows the panel uses `textContent` only, and Play again is the first focusable element.
  - No storage writes inside the kit.
- **AW6:**
  - The id table matches the m02 manifest (ids, frames, frame_w / frame_h); `node game/tools/art-audit/run.js` reports 0 blockers for m02.
  - The Angler page has 0 PNG 404s, and `?art=0` shows the code pond.
  - Species not in m02 keep the code fish (alias any renamed id).
  - The existing angler tests pass unchanged.
- **NV1:** as in NEXT-SLICES-4 (synthetic keyup on close; sheet closes on Realm invite / embed; gamepad gated; shard merge via `shardsPending`).
- **JM5:**
  - A 75% section loop keeps its own PB under an additive key in `pixeltown-jam-v1`; old saves load.
  - The 1-lane and 2-lane assist boards are separate from the 4-lane PB, and the assist notes are thinned (≥ 180 ms between notes).
  - The seed shows in the result, and "Replay chart" gives the same notes.
  - The existing jam tests pass unchanged.
- **QS2:**
  - Perf: frame-time median and p95 per page stay within the frozen fixture; the fixture may only tighten.
  - Endgame sim: median kills to the first T12 is in [25, 60].
  - Save fuzz: 5,000 seeded runs, archipelago ≤ 20 KB, no tame lost or duplicated.
  - 0 DB requests on every page.

## Wave 2: Bugs + new-game art, Town streak softening, Arcade #9/#10 registry, Angler and Deepdelve depth

| id | title | files | size | key | depends | prio |
|---|---|---|---|---|---|---|
| AW7 | Wire m03 Bug Safari + m07 Pop/Dash (on arrival) | `shared/mm-mini-art.js` (batches m03, m07), `games/festival/*` (bugs, net swing, jar, arena thumbs), `games/pop/*` (tiles 1-11, pop / chain fx, board frame), `games/dash/*` (runner, rocks, firefly, ground, gaps, parallax, best flag, lantern glow additive), `assets/arcane/INDEX.json`, NEW `tests/mini-art-bugs-popdash.test.js` | M | AR, festival, pop, dash | AW6 | P1 |
| TN3 | Town streak softening + Town text scale (carried over) **OWNER** | MN, as NEXT-SLICES-4 TN3: visit days never reset, no 🔥, `loginStreak` / `lastLoginDate` kept + `visitDays` added, `sellstreak3` → "Sell on 3 different days", earned stays earned, `?streak=classic`; NEW `tests/town-no-streak.test.js` | S | MN | NV1 | P1 |
| AX1 | Arcade #9 / #10 up to the kit standard + registry | `games/<arcade9>/*`, `games/<arcade10>/*` (MMMiniKit result, seed code, assist flag, `pixeltown-medals-<id>-v1`, MMSideAccess, lowGfx, reduced motion), REG (PLACES entries, Hub medal strips, smoke-journey fixture), NEW `tests/arcade-kit.test.js` | M | REG, the two folders | MK1 | P1 |
| AN5 | Angler: bite access, fish shadows, journal hints | `games/angler/angler.js` + `.css` (ring flash, opt-in haptic `pixeltown-access-v1`-style flag kept page-side, shadow size by class before the bite, honest "found at X, at night" hints for uncaught fish; result through `MMMiniKit`), NEW `tests/angler-depth5.test.js` | M | angler | MK1, AW6 | P2 |
| DD5 | Deepdelve: dive ghost + bank line | `games/deepdelve/deepdelve.js`, `dd-run.js` (record the best dive per seed with `MMGhost` (read-only use) into an additive key in the Deepdelve save, draw at 10 Hz, off in lowGfx / `?ghost=0`; HUD "surface now = N" line), NEW `tests/deepdelve-ghost.test.js` | M | deepdelve | none | P2 |

**Acceptance**
- **AW7:**
  - The manifest ↔ id tables match, and art-audit reports 0 blockers.
  - There are 0 PNG 404s on bugs.html, pop and dash.
  - The Pop tiles still show the code level number in the bottom-right.
  - `?art=0` gives today's look, and the existing page tests pass unchanged.
- **TN3:**
  - A missed day never lowers the shown number, and no "🔥" text appears.
  - Old saves keep `loginStreak` and gain `visitDays`, and an earned `sellstreak3` stays earned.
  - `?streak=classic` passes the old assertions (moved there, not deleted).
- **AX1:**
  - Both games are reachable from Where to?, their medals show in the Hub, and the smoke journey visits all 14 PLACES.
  - The restart takes under 1 s, every target is 44 px or larger, and all text is 12 px or larger.
  - Reduced motion means no shake, and there are 0 DB requests.
- **AN5:**
  - A muted sound still shows the visual bite cue.
  - Haptics are off by default and never fire without the flag.
  - The `shared-mm-angler-golden` hashes are unchanged (page-side tables only).
  - Hints only name a spot or time where the species really appears (checked against the species table).
- **DD5:**
  - The same seed shows the ghost of the best dive, and a new seed has no ghost.
  - The ghost payload is 3 KB or less, and the Deepdelve save grows only by the additive key.
  - The bank line equals the score you get when surfacing.
  - `deepdelve-perf` and `deepdelve-fps` are unchanged.

## Wave 3: result art kit, Bugs depth, Pop/Dash depth, local co-op, first new genre

| id | title | files | size | key | depends | prio |
|---|---|---|---|---|---|---|
| AW8 | Wire m08 result UI kit (on arrival) | `shared/mm-mini-art.js` (m08), `shared/mm-minikit.js` (panel draws `medal_*`, `ui_star_*`, `ui_new_best`, `ui_result_panel` 9-slice, `ui_confetti` (off with reduced motion)), REG (`hub/medals.js` 32 px medals + `trophy_<game>`), `assets/arcane/INDEX.json`, NEW `tests/mini-art-result-kit.test.js` | M | AR, REG, minikit | MK1, AX1 | P2 |
| BG5 | Bug Safari: species behaviours, tap assist, seed replay | `games/festival/bugs.js`, `shared/mm-bugs.js` (additive `behaviourOf(id)`: flutter / dart / hop / burrow, seeded paths), the assist radius flag shown in the summary, silhouette hints, seed code + replay; NEW `tests/bugs-depth5.test.js` | M | festival, mm-bugs | MK1 | P2 |
| PD2 | Pop + Dash depth | `games/pop/pop.js` (next-two preview, Calm mode with no timer on its own board, seed code), `games/dash/dash.js` (assist: 80% speed + jump buffer 120 ms + coyote 100 ms on its own board; practice checkpoints every 200 m (no PB); ghost code export / import, 2 KB cap, validated), NEW `tests/popdash-depth.test.js` | M | pop, dash | MK1, AW7 | P2 |
| CO4 | Local co-op polish (carried over) | MM, as NEXT-SLICES-4 CO4, NEW `tests/coop-local-polish.test.js` | M | MM | none | P3 |
| NG1 | New game: Pebble Putt (built, not yet registered) | NEW `games/putt/{index.html,putt.js,putt.css}`, NEW `shared/mm-putt.js` (pure: seeded 9-hole course generator, fixed-step physics, a par solver check), NEW `tests/shared-mm-putt.test.js`, NEW `tests/putt-page.test.js` | L | putt (new) | MK1 | P3 |

**Acceptance**
- **AW8:**
  - Each result panel shows the m08 medals when they are loaded, and the code panel when they are not.
  - The Hub medals use the 32 px icons, there are 0 PNG 404s, and `hub-medals` passes unchanged.
- **BG5:**
  - Each behaviour has a deterministic seeded path test.
  - The assist is off by default and its use is listed in the summary.
  - The same seed gives the same spawns, and the existing bugs tests pass.
- **PD2:**
  - Calm mode never shows a timer and writes only its own PB field.
  - The preview matches the next two spawns from the seeded rng.
  - The Dash assist board is separate from the main board, and a checkpoint run never updates the PB.
  - The ghost code round-trips, and a malformed code or one over 2 KB is rejected with a message (no throw).
- **CO4:** as in NEXT-SLICES-4.
- **NG1:**
  - The par solver confirms every generated hole (5,000 seeds) can be finished in ≤ par + 2.
  - The page plays one-thumb (drag back, release); the restart takes under 1 s; it writes `pixeltown-putt-v1` + `pixeltown-medals-putt-v1`.
  - There are 0 DB requests and 0 console errors at 390x844.

## Wave 4: cozy home, remaining art, Crate Cove + registry, Stalk/Lantern depth, access gate

| id | title | files | size | key | depends | prio |
|---|---|---|---|---|---|---|
| HM1 | Cozy home + photo mode + rider overlay (carried over) | IS, NEW `shared/mm-photo.js`, NEW `tests/isles-home-photo.test.js` (as NEXT-SLICES-4 HM1; the rider uses AW9's `rider()` when present, else the code hero) | M | IS | CZ1 (done) | P2 |
| AW9 | Wire m01 Jam, m05 Deepdelve, m06 Angler spots + the AW5 remainder (on arrival) | `shared/mm-mini-art.js`, `games/jam/*` (stage bg, campfire, lane notes, hold tails, hit badges, crowd), `games/deepdelve/*` (face textures, nearest filter, no mipmaps; ores, picks, mobs), `games/angler/*` (spot backdrops day / night, bobber, splash, seated angler), `shared/mm-creature-strips.js` (`rider(classId)` for b41), NEW `shared/mm-item-art.js` (alias `item_jungle_berries` → `jungle_berry`), `assets/arcane/INDEX.json`, `tests/art-manifest.test.js` (append) | L | AR, jam, deepdelve, angler | AW6 | P2 |
| NG2 | New game: Crate Cove + registry for Putt and Crate Cove | NEW `games/crates/*`, NEW `shared/mm-crates.js` (pure: seeded generator by reverse pulls from a solved state, a BFS solver that proves solvable and gives par, unlimited undo), REG (PLACES for `putt` + `crates`, Hub medal strips, smoke-journey fixture), NEW `tests/shared-mm-crates.test.js`, NEW `tests/crates-page.test.js` | L | REG, crates (new) | NG1, AX1 | P3 |
| ST5 | Stalk + Lantern depth + m04 wiring | `games/stalk/*` (pattern guess on day 3 of a practice week, practice-week code + replay, m04 turnip / stall / seller / mood icons on arrival), `games/mad-maze/lantern.*` (MMSideAccess, 44 px / 12 px fixes, "next calm goal" cards from `shared/mm-calm-goals.js` read-only), NEW `tests/stalk-lantern-depth5.test.js` | M | stalk, lantern files | MK1 | P3 |
| QS4 | Minigame access + feel gate (AC2 carried over, widened) | NEW `tests/minigame-gate.test.js` + NEW `tests/fixtures/minigame-gate.json` (`knownIssues` that only shrink): for every minigame PLACE at 390x844 with `hudScale 1.5`, `reduceMotion`, `lowGfx`: restart < 1 s, targets ≥ 44 px, text ≥ 12 px, no shake / blink in reduced motion, Play again focused first, first success < 30 s for a scripted bot, medals key schema `{"v":1,"m":[]}`, 0 DB, 0 PNG 404; `tests/smoke-journey.test.js` (append the access pass) | M | none (test only; fixes go in the next wave per folder) | AX1, NG2 merged first | P1 |

**Acceptance**
- **HM1:** as in NEXT-SLICES-4.
- **AW9:**
  - Per batch: the manifest ↔ id test passes, art-audit reports 0 blockers, and each page has 0 PNG 404s.
  - Deepdelve `deepdelve-perf` stays within its baseline.
  - `?art=0` gives the code look everywhere, and the `item_jungle_berries` alias resolves.
- **NG2:**
  - Each of 5,000 seeds is solvable and has par ≥ 6 moves; undo restores the exact state.
  - Putt and Crate Cove are in Where to? and in the Hub, and the smoke journey visits all 16 PLACES.
  - The `nav-consistency` test covers both pages.
- **ST5:**
  - The pattern guess reveal matches the real model pattern, and the bells only change in practice.
  - The practice code round-trips, and the real weekly market is untouched (the stalk golden / goals tests pass unchanged).
  - The Lantern page passes 44 px / 12 px and uses MMSideAccess.
- **QS4:**
  - The gate runs in under 4 minutes.
  - Any new page added later must be listed, or the test fails.
  - The `knownIssues` baseline is recorded and is never allowed to grow.

## 2. Waves at a glance (serial check)

| wave | MN | MM | IS | AR | REG | game folders / soft |
|---|---|---|---|---|---|---|
| 1 | NV1 | - | - | AW6 | NV1 (mm-nav N1 + hub gift) | minikit (MK1), jam + mm-jam (JM5), angler (AW6), mm-endgame (QS2) |
| 2 | TN3 | - | - | AW7 | AX1 | festival + pop + dash (AW7), angler (AN5), deepdelve (DD5), arcade folders (AX1) |
| 3 | - | CO4 | - | AW8 | AW8 (hub medals) | minikit (AW8), festival + mm-bugs (BG5), pop + dash (PD2), putt (NG1) |
| 4 | - | - | HM1 | AW9 | NG2 | jam + deepdelve + angler (AW9), stalk + lantern (ST5), crates (NG2) |

- RJ, RW and DJ are free in every wave. Keep them for hotfixes that QS2 or QS4 find.
- NG1 is built in wave 3 but registered in wave 4 by NG2, so REG has one owner per wave.
- Parallel hints: within a wave, every row touches disjoint folders except the noted soft keys. MK1 must merge first in wave 1 because JM5 calls it.
- Keep `index.html` (Town) and `main.js` changes to NV1 and TN3 only.

## 3. Five new-genre candidates (one-paragraph designs)

All five: seeded (MMRng), a PB and four medals through `MMMiniKit`, one-thumb on phone plus keys on desktop, rounds of 2 minutes or less, no timers outside a round, original art with a code fallback (a later m09+ ask).

1. **Pebble Putt (mini golf, built in NG1).** Drag back from the pebble and release: the drag length sets the power and a dotted line shows the first bounce only, so it stays a skill shot. Nine seeded holes on one screen each (walls, sand that slows, water that resets to the last spot, a ramp, a moving log at holes 7-9). Par comes from the solver. The score is strokes against par, with medals for under par, a hole in one, all nine, and a calm "no water" round. Assist: a longer aim line. The ghost shows your best stroke path per hole.
2. **Crate Cove (block-push logic, built in NG2).** Push crates onto dock marks on small 7x7 to 9x9 boards. Boards are generated in reverse from a solved state and proven by a BFS solver, so every board is fair and has a par. Unlimited undo and restart cost nothing. The score is moves against par. Swipe or arrow keys, plus a tap-to-walk path. Medals: 10 boards, par on 5, a "no undo" clear, and a 9x9. Calm by design: no clock at all.
3. **Hay Stack (timing stack).** A bale slides back and forth; tap to drop it. The overhang is shaved off, a perfect drop keeps the full width, and 3 perfects in a row grow it back a little. Wind (seeded) changes the speed every 10 bales. The round ends when a bale misses. Medals at 20 / 40 / 60 bales and 10 perfects. Assist: 75% speed. Risk: close in feel to Dash (one button), so build it only if Arcade #9/#10 are not one-button games.
4. **Campfire Kitchen (order assembly).** Villagers ask for small dishes (bread + jam, soup + herb). Tap ingredients onto a plate in order, then serve. There is no fail timer: each order has a calm "patience" that only lowers the tip, never ends the round, and the round is 12 orders. Seeded orders, recipes unlocked by playing (not by time). Medals: 12 perfect plates, all recipes, a 3-dish order, and "no wrong tap". Good for cozy players who bounce off reflex games. Risk: much UI text, so use icons first and 12 px text.
5. **Garden Weave (picross / nonogram).** Fill a 5x5 to 10x10 grid from row and column clues; the finished picture is a pixel plant or critter. Generated puzzles are checked by a line solver for a unique solution. A mistake marks the cell gently: no lives, and "check" mode is optional. Tap to fill, long press to cross. Medals: 10 pictures, a 10x10, a "no checks" clear, and a full garden page. The pictures can show on the Hub Collections card through an additive key.

Owner picks which three of 3-5 come after NG1 / NG2 (and confirms that none duplicates Arcade #9 / #10).

## 4. Decisions that need the owner
1. **TN3**: soften the Town login and sell streaks (default proposal: on, with `?streak=classic` kept). The planner recommends yes. The rule in AGENTS.md / NS4 forbids resetting streaks, but the code still has them.
2. **The Where to? menu grows to 14 and then 16 places.** Should the phone sheet group the mini games under an "Arcade" heading (a `mm-nav.js` change in AX1)? Proposal: yes, with Town / Map / Realm / Lantern / Isles kept on top.
3. **Haptics**: opt-in only and off by default (AN5, Dash). Confirm.
4. **Date seeds**: allow an optional "today's board" in Pop / Crate Cove with no counter, no reward and old dates still playable, or none at all. Proposal: none for now (finding 5).
5. **Which new genres to build after Putt and Crate Cove**, and the names and ids of Arcade #9 / #10.
6. **Stalk Market framing**: keep it as practice play money with the real odds shown (proposal), or add a "learn the patterns" tutorial that replaces the weekly bet for new players.

## 5. Top risks
- `mm-minikit` adoption drifts: games keep their own panels. QS4 asserts that "Play again focused first" holds on every page.
- Art wiring changes drawing order or perf (Deepdelve textures). Every AW slice keeps `?art=0`, and the perf baselines only tighten.
- The angler golden and stalk tests break from depth work. Depth goes in page-side tables, and shared modules change only additively.
- REG contention as games are added. One owner per wave, and NG1 is registered by NG2.
- Ghost or seed codes are pasted from outside. Check them with an allow-list, use `textContent` only, cap the size, and never `eval`.
